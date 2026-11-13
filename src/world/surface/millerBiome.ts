import * as THREE from 'three';
import { fbm2 } from './SurfaceGen';

/**
 * Miller's habitats (original world-building for the game, see docs/MILLER_BIOSPHERE.md). The flats keep their
 * cinematic look — 0.7 m of water to the horizon — except for a few places:
 *   reef   — low black basalt ledges breaking the surface, crevices, a sheltered pool in their lee (west: the waves
 *            come from the east);
 *   hollow — a soft fine-sediment depression (Sediment Maw ground);
 *   rift   — a channel opening from the reef's west edge, dropping from −4 m to −48 m between stepped basalt walls;
 *   basin  — a deep round basin at the rift's end, stepping down to −160 m.
 * Coordinates: local metres from the landing origin (x east, z south).
 */
export const MILLER_BIOME = {
  reef: { x: -210, z: 140, r: 48 },
  pool: { x: -250, z: 150, r: 15 },
  hollow: { x: 150, z: 230, r: 42 },
  rift: [
    [-262, 165],
    [-330, 205],
    [-420, 300],
    [-560, 470],
    [-690, 640],
    [-760, 900],
  ] as [number, number][],
  basin: { x: -760, z: 900, r: 380, floor: -160 },
  vents: [
    [-566, 466],
    [-552, 488],
    [-575, 484],
  ] as [number, number][],
};

const FLAT = -0.75;
const B = MILLER_BIOME;
const smooth = THREE.MathUtils.smoothstep;
const segLen: number[] = [];
let riftLen = 0;
for (let i = 0; i < B.rift.length - 1; i++) {
  const L = Math.hypot(B.rift[i + 1][0] - B.rift[i][0], B.rift[i + 1][1] - B.rift[i][1]);
  segLen.push(L);
  riftLen += L;
}

/** distance to the rift's centre line and the fraction along it (0 at the reef, 1 at the basin) */
export function riftCoord(x: number, z: number) {
  let best = 1e9, along = 0, acc = 0;
  for (let i = 0; i < B.rift.length - 1; i++) {
    const [ax, az] = B.rift[i], [bx, bz] = B.rift[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      along = (acc + segLen[i] * t) / riftLen;
    }
    acc += segLen[i];
  }
  return { d: best, s: along };
}

/** stepped walls: soft terraces every `step` metres (ledges and overhang bases) */
function terrace(h: number, step: number, k = 0.35) {
  const q = h / step;
  const f = q - Math.floor(q);
  return (Math.floor(q) + smooth(f, k, 1)) * step;
}

/** the rift's floor depth and half-width at a fraction along it */
export function riftShape(s: number, x: number, z: number, seed: number) {
  const w = THREE.MathUtils.lerp(22, 58, s) * (1 + 0.35 * fbm2(x / 70, z / 70, 3, seed + 41));
  const floor = THREE.MathUtils.lerp(-4, -48, Math.pow(s, 0.8));
  return { w, floor };
}

/** height offset (m) added to the flat seabed */
export function millerRelief(x: number, z: number, seed: number) {
  let off = 0;
  // ---- the reef: broken basalt ridges, mostly awash, a few crests standing out of the water; crevices between
  const dr = Math.hypot(x - B.reef.x, z - B.reef.z) / B.reef.r;
  if (dr < 1.6) {
    const mask = smooth(1.2 - (dr + 0.45 * fbm2(x / 20, z / 20, 3, seed + 31)), 0, 0.5);
    if (mask > 0) {
      // ridges: long lenses of rock, the strata dipping west
      const ridge = 1 - Math.abs(fbm2(x / 16 + 0.3 * z / 16, z / 9, 3, seed + 32) * 2.4);
      const knob = fbm2(x / 5, z / 5, 2, seed + 39);
      let h = mask * (0.15 + 1.9 * Math.pow(Math.max(0, ridge), 2.2) + 0.5 * knob);
      h = terrace(Math.max(0, h), 0.4, 0.6);
      const crev = Math.abs(fbm2(x / 6, z / 6, 2, seed + 33));
      h -= 1.1 * (1 - smooth(crev, 0.0, 0.045)) * mask;
      off += h;
    }
    // the lee pool, sheltered by the reef: ~2.3 m of water
    const dp = Math.hypot(x - B.pool.x, z - B.pool.z) / B.pool.r + 0.15 * fbm2(x / 7, z / 7, 2, seed + 40);
    const pw = smooth(1 - dp, 0, 0.55);
    if (pw > 0) off += (-1.55 - off) * pw;
  }
  // ---- the soft hollow
  const dh = Math.hypot(x - B.hollow.x, z - B.hollow.z) / B.hollow.r;
  if (dh < 1) off -= 0.45 * smooth(1 - dh + 0.1 * fbm2(x / 15, z / 15, 2, seed + 34), 0, 0.7);
  // ---- the rift and the basin, carved below the flats
  let carved = 0;
  const rc = riftCoord(x, z);
  if (rc.d < 90) {
    const { w, floor } = riftShape(rc.s, x, z, seed);
    const t = rc.d / w + 0.08 * fbm2(x / 14, z / 14, 2, seed + 35);
    if (t < 1) {
      const wall = 1 - smooth(t, 0.5, 1.0);
      const depth = terrace(floor * wall, 5.5, 0.55);
      carved = Math.min(carved, depth - FLAT + 0.6 * fbm2(x / 5, z / 5, 2, seed + 36) * wall);
    }
  }
  const db = Math.hypot(x - B.basin.x, z - B.basin.z);
  if (db < B.basin.r * 1.35) {
    // an irregular rim: bays and spurs
    const ang = Math.atan2(z - B.basin.z, x - B.basin.x);
    const rim = 1 + 0.16 * Math.sin(ang * 3 + 1.3) + 0.09 * Math.sin(ang * 7 + 0.4) + 0.12 * fbm2(x / 120, z / 120, 2, seed + 42);
    const rb = db / (B.basin.r * rim) + 0.07 * fbm2(x / 60, z / 60, 2, seed + 37);
    const depth = terrace(B.basin.floor * smooth(1 - rb, 0, 0.62), 11, 0.5);
    carved = Math.min(carved, depth - FLAT + 1.2 * fbm2(x / 9, z / 9, 2, seed + 38));
  }
  // vents: low mineral chimneys' mounds on the rift floor
  for (const [vx, vz] of B.vents) {
    const dv = Math.hypot(x - vx, z - vz);
    if (dv < 9) carved += 2.2 * smooth(1 - dv / 9, 0, 1);
  }
  return off + Math.min(0, carved);
}

/** loose basalt boulders: thick on the reef, scattered on the rift walls and basin rim */
export function millerRockiness(x: number, z: number, seed: number) {
  const dr = Math.hypot(x - B.reef.x, z - B.reef.z) / B.reef.r;
  let r = 0.95 * smooth(1.25 - dr, 0, 0.4);
  const rc = riftCoord(x, z);
  if (rc.d < 90) {
    const { w } = riftShape(rc.s, x, z, seed);
    const t = rc.d / w;
    r = Math.max(r, 0.55 * smooth(t, 0.35, 0.6) * (1 - smooth(t, 0.95, 1.15)));
  }
  const db = Math.hypot(x - B.basin.x, z - B.basin.z) / B.basin.r;
  r = Math.max(r, 0.4 * smooth(db, 0.6, 0.8) * (1 - smooth(db, 1.0, 1.15)));
  return r;
}

export type MillerZone = 'flats' | 'reef' | 'pool' | 'hollow' | 'rift' | 'basin';

export function millerZone(x: number, z: number): MillerZone {
  if (Math.hypot(x - B.pool.x, z - B.pool.z) < B.pool.r) return 'pool';
  if (Math.hypot(x - B.reef.x, z - B.reef.z) < B.reef.r * 1.1) return 'reef';
  if (Math.hypot(x - B.hollow.x, z - B.hollow.z) < B.hollow.r) return 'hollow';
  if (Math.hypot(x - B.basin.x, z - B.basin.z) < B.basin.r) return 'basin';
  const rc = riftCoord(x, z);
  if (rc.d < 60) return 'rift';
  return 'flats';
}
