// Tram tracks and overhead line of a tram line's world (route.tracks from tools/build_tram_route.py: the OSM
// tram network round the line, every track a centre-line polyline flagged as street running or not).
//
// Track: 1 009 mm gauge. In the street the rails are grooved rails laid flush in concrete track panels
// (grey slab band with transverse joints, a dark groove inside each rail head); elsewhere the track lies on a
// raised ballast bed with concrete sleepers every 0.65 m and Vignole rails (head, web, foot) on top.
// Overhead line: a single contact wire 5.6 m above the rails, staggered from side to side at its supports
// (pull-offs every 7.5 m on curves), carried by galvanised tubular poles about every 30 m with a bracket arm
// over the track; in the street the poles stand at the kerb and long spans hang from cross-span wires.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const GAUGE = 1.009;
export const WIRE_H = 5.6; // contact wire above the rail head
const RAIL_C = GAUGE / 2 + 0.03; // rail head centre lines (inner face at gauge / 2)
const ROAD_Y = 0.07;
const PAVED_Y = 0.22; // pavements, squares and paved medians (RoadMesh: road 0.07 + kerb 0.15)
const BED_H = 0.3; // ballast bed top above the terrain
const STEP = 1.5;
const TILE = 256;

/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Concrete track panel: 2.5 m across (u), 2 m along (v), a joint across, grime between the rails. */
function slabTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8d8b86';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 110 + rnd() * 50;
      g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // oil and brake dust along the middle, tyre polish beside the rails
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(40,38,34,0.05)');
    grd.addColorStop(0.35, 'rgba(40,38,34,0.0)');
    grd.addColorStop(0.5, 'rgba(30,28,25,0.28)');
    grd.addColorStop(0.65, 'rgba(40,38,34,0.0)');
    grd.addColorStop(1, 'rgba(40,38,34,0.05)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(35,34,32,0.55)';
    g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(60,58,54,0.35)';
    g.fillRect(0, h / 2, w, 1);
  });
}

function ballastTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6d6862';
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3800; i++) {
      const v = 70 + rnd() * 95;
      const r = 1.2 + rnd() * 3.2;
      g.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(70,45,25,0.18)'; // rust from the rails
    g.fillRect(w * 0.27, 0, w * 0.06, h);
    g.fillRect(w * 0.67, 0, w * 0.06, h);
  });
}

/* ------------------------------------------------------------------ sampling */
/** Polyline resampled every STEP m: [{x, z, tx, tz, s}] with smoothed tangents. */
function resample(pts) {
  const out = [];
  let acc = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L > 1e-4) segs.push([pts[i - 1], pts[i], L, acc]), (acc += L);
  }
  if (!segs.length) return out;
  const n = Math.max(1, Math.round(acc / STEP));
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const s = (acc * j) / n;
    while (k < segs.length - 1 && segs[k][3] + segs[k][2] < s) k++;
    const [a, b, L, s0] = segs[k];
    const t = Math.min(1, Math.max(0, (s - s0) / L));
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s });
  }
  for (let i = 0; i < out.length; i++) {
    const p = out[Math.max(0, i - 1)], q = out[Math.min(out.length - 1, i + 1)];
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / L;
    out[i].tz = dz / L;
  }
  return out;
}

/* ------------------------------------------------------------------ geometry helpers */
/** Ribbon along samples at lateral offsets [l0, l1] (right of travel = +), height fn, u across 0..1, v = s / vScale. */
function ribbon(S, l0, l1, yAt, vScale = 2, uRange = [0, 1]) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const rx = -p.tz, rz = p.tx;
    for (const [l, u] of [[l0, uRange[0]], [l1, uRange[1]]]) {
      const x = p.x + rx * l, z = p.z + rz * l;
      pos.push(x, yAt(p, l), z);
      uv.push(u, p.s / vScale);
    }
    if (i) {
      const a = 2 * (i - 1);
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vertical face at lateral offset l from the top (yTop) down to the ground (yLow), facing outwards (side sg). */
function skirt(S, l, yTop, yLow, sg) {
  const pos = [], idx = [];
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const x = p.x - p.tz * l, z = p.z + p.tx * l;
    pos.push(x, yTop(p), z, x, Math.min(yTop(p) - 0.02, yLow(p) - 0.05), z);
    if (i) {
      const a = 2 * (i - 1);
      if (sg > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Profile [[lateral, dy], ...] swept along samples (closed = false), normals from the geometry. */
function sweepProfile(S, offset, prof, yAt) {
  const pos = [], idx = [];
  const m = prof.length;
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const rx = -p.tz, rz = p.tx;
    const base = yAt(p, offset);
    for (const [l, dy] of prof) pos.push(p.x + rx * (offset + l), base + dy, p.z + rz * (offset + l));
    if (i) {
      const a = (i - 1) * m, b = i * m;
      // profile points run left to right: (along, across) turns upwards / outwards
      for (let k = 0; k < m - 1; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ clearance */
/**
 * Half width of the space a tram sweeps round a track sample: half the body (1.125 m) and the mirrors, plus the
 * swing-out of the front overhang on curves (a (a + c) / 2R, about 1 m on a 20 m radius) and a margin.
 */
export function envelopeHalfWidth(k) {
  return 1.75 + Math.min(1.25, Math.abs(k) * 24);
}

/** Spatial hash of rendered track samples: rail height, clearance and nearest-track queries. */
class TrackIndex {
  constructor(cell = 4) {
    this.cell = cell;
    this.map = new Map();
  }

  key(i, j) {
    return i * 100003 + j;
  }

  add(p) {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(p);
  }

  /** Samples within r of (x, z). */
  near(x, z, r, fn) {
    const c = this.cell, n = Math.ceil(r / c);
    const ci = Math.floor(x / c), cj = Math.floor(z / c);
    for (let i = ci - n; i <= ci + n; i++)
      for (let j = cj - n; j <= cj + n; j++) {
        const a = this.map.get(this.key(i, j));
        if (a) for (const p of a) fn(p);
      }
  }

  /** Nearest sample within maxD (or null). */
  nearest(x, z, maxD = 2.5) {
    let best = null, bd = maxD * maxD;
    this.near(x, z, maxD, (p) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  /** True if a disc of radius r at (x, z) reaches into the tram envelope of any track. */
  hits(x, z, r = 0) {
    let hit = false;
    this.near(x, z, 4.5 + r, (p) => {
      if (hit) return;
      // lateral distance from the sample's tangent line, limited to the sample's own stretch
      const dx = x - p.x, dz = z - p.z;
      const lon = dx * p.tx + dz * p.tz;
      if (Math.abs(lon) > STEP * 0.75 + r) return;
      const lat = Math.abs(-dx * p.tz + dz * p.tx);
      if (lat < envelopeHalfWidth(p.k) + r) hit = true;
    });
    return hit;
  }
}

/* ------------------------------------------------------------------ builder */
export function buildTramInfrastructure(world) {
  const route = world.route;
  if (!route || !route.tracks || !route.tracks.length) return null;
  const hf = world.hf, roads = world.roads;
  const lite = world.quality === 'balanced' || world.quality === 'low';
  const mats = {
    slab: new THREE.MeshStandardMaterial({ map: slabTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    skirt: new THREE.MeshStandardMaterial({ color: 0x8a8883, roughness: 0.9 }),
    groove: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    railHead: new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.22, metalness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x6a4f3c, roughness: 0.75, metalness: 0.3 }),
    ballast: new THREE.MeshStandardMaterial({ map: ballastTexture(), roughness: 0.97 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.85 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x7f8486, roughness: 0.55, metalness: 0.55 }),
    wire: new THREE.LineBasicMaterial({ color: 0x2a2724 }),
  };
  const groundY = (x, z) => hf.heightAt(x, z);
  const buckets = new Map(); // tile -> {key: [geometries]}
  const push = (x, z, key, g) => {
    const tk = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let b = buckets.get(tk);
    if (!b) buckets.set(tk, (b = {}));
    (b[key] = b[key] || []).push(g);
  };
  const sleepers = new Map(); // tile -> [matrix]
  const poles = []; // {x, z, y, h, ax, az, wy} pole and the wire point its arm holds
  const wireSegs = new Map(); // tile -> [x, y, z, ...]
  const addWire = (a, b) => {
    const tk = `${Math.floor(a[0] / TILE)},${Math.floor(a[2] / TILE)}`;
    let arr = wireSegs.get(tk);
    if (!arr) wireSegs.set(tk, (arr = []));
    arr.push(...a, ...b);
  };

  // ---- samples with curvature; tracks of the line itself first (they win where two edges overlap)
  const onLine = (() => {
    const dirs = ['A', 'B'].map((id) => route.direction(id).path);
    return (x, z) => dirs.some((P) => P.nearest(x, z).d < 1.2);
  })();
  const tracks = route.tracks.map((t, i) => {
    const S = resample(t.pts);
    for (let j = 0; j < S.length; j++) {
      const a = S[Math.max(0, j - 2)], b = S[Math.min(S.length - 1, j + 2)];
      const cross = a.tx * b.tz - a.tz * b.tx, dot = a.tx * b.tx + a.tz * b.tz;
      const ds = Math.max(0.5, b.s - a.s);
      S[j].k = Math.atan2(cross, dot) / ds;
      S[j].t = i;
    }
    let own = 0;
    for (let j = 0; j < S.length; j += 4) if (onLine(S[j].x, S[j].z)) own++;
    return { ...t, S, i, own: own / Math.max(1, Math.ceil(S.length / 4)) };
  });
  tracks.sort((a, b) => b.own - a.own);

  // ---- points and duplicated OSM edges: a stretch that lies on an already drawn track (same direction,
  // within 0.6 m) is not drawn again; the diverging track starts where it leaves the other one
  const index = new TrackIndex(4);
  for (const t of tracks) {
    const S = t.S;
    const covered = S.map((p) => {
      let c = false;
      index.near(p.x, p.z, 1.2, (q) => {
        if (c || q.t === t.i) return;
        const dot = Math.abs(p.tx * q.tx + p.tz * q.tz);
        if (dot > 0.9 && Math.hypot(q.x - p.x, q.z - p.z) < 0.6) c = true;
      });
      return c;
    });
    const runs = [];
    let r0 = -1;
    for (let j = 0; j <= S.length; j++) {
      const free = j < S.length && !covered[j];
      if (free && r0 < 0) r0 = j;
      if (!free && r0 >= 0) {
        // one sample into the covered stretch joins the diverging rails to the main track
        const a = Math.max(0, r0 - 1), b = Math.min(S.length - 1, j);
        if (b - a >= 2) runs.push([a, b]);
        r0 = -1;
      }
    }
    t.runs = runs;
    // the rail head along each sample: street track on whatever surface is there (the road, or the paving
    // of a square or a median), ballast track on its bed
    for (const p of S) {
      const g = groundY(p.x, p.z);
      if (t.street) {
        const rx = -p.tz, rz = p.tx;
        const road = roads.onRoad(p.x, p.z, 0) && roads.onRoad(p.x + rx * 0.6, p.z + rz * 0.6, 0) && roads.onRoad(p.x - rx * 0.6, p.z - rz * 0.6, 0);
        p.top = g + (road ? ROAD_Y : PAVED_Y) + 0.006;
      } else p.top = g + BED_H;
    }
    // no dips: the surface of a sample is the highest within 3 m (gentle ramps between road and paving)
    if (t.street) {
      const tops = S.map((p) => p.top);
      for (let j = 0; j < S.length; j++) {
        let m = -Infinity;
        for (let d = -2; d <= 2; d++) { const q = S[j + d]; if (q) m = Math.max(m, tops[j + d] - groundY(q.x, q.z) + groundY(S[j].x, S[j].z)); }
        S[j].top = m;
      }
    }
    for (const [a, b] of runs) for (let j = a; j <= b; j++) {
      const p = S[j];
      p.rail = t.street ? p.top + 0.004 : p.top + 0.22;
      index.add(p);
    }
  }
  world.tramIndex = index;
  /** Rail head height of the nearest drawn track (the tram physics rides on what is drawn). */
  world.tramRailAt = (x, z) => {
    const p = index.nearest(x, z, 2.5);
    return p ? p.rail : null;
  };
  /** True if a disc of radius r at (x, z) would reach into a tram's swept envelope. */
  world.tramClearance = (x, z, r = 0) => index.hits(x, z, r);

  for (const t of tracks) {
    for (const [ra, rb] of t.runs) {
      const S = t.S.slice(ra, rb + 1);
      if (S.length < 2) continue;
      // chunks of ~40 m so tiles and culling stay fine-grained
      for (let c0 = 0; c0 < S.length - 1; c0 += 26) {
        const C = S.slice(c0, Math.min(S.length, c0 + 27));
        if (C.length < 2) continue;
        const cx = C[Math.floor(C.length / 2)].x, cz = C[Math.floor(C.length / 2)].z;
        if (t.street) {
          const y = (p) => p.top;
          push(cx, cz, 'slab', ribbon(C, -1.25, 1.25, y, 2, [0, 1]));
          // concrete edges where the track panel stands above the ground beside it (paving over a road, a median)
          for (const sg of [-1, 1]) {
            push(cx, cz, 'skirt', skirt(C, sg * 1.25, (p) => p.top, (p) => groundY(p.x - p.tz * sg * 1.3, p.z + p.tx * sg * 1.3), sg));
          }
          for (const sg of [-1, 1]) {
            const c = sg * RAIL_C;
            push(cx, cz, 'railHead', ribbon(C, c - 0.028, c + 0.028, (p) => p.top + 0.004, 4));
            const g0 = c - sg * 0.028, g1 = c - sg * 0.064;
            push(cx, cz, 'groove', ribbon(C, Math.min(g0, g1), Math.max(g0, g1), (p) => p.top + 0.003, 4));
          }
        } else {
          const gy = (p) => groundY(p.x, p.z);
          const bed = [[-1.75, 0], [-1.35, BED_H], [1.35, BED_H], [1.75, 0]];
          const bg = sweepProfile(C, 0, bed, (p) => gy(p));
          const uv = [];
          for (let i = 0; i < C.length; i++) for (const u of [0, 0.12, 0.88, 1]) uv.push(u, C[i].s / 2.5);
          bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          push(cx, cz, 'ballast', bg);
          const prof = [[-0.06, 0], [-0.008, 0.012], [-0.008, 0.11], [-0.03, 0.12], [-0.03, 0.15], [0.03, 0.15], [0.03, 0.12], [0.008, 0.11], [0.008, 0.012], [0.06, 0]];
          for (const sg of [-1, 1]) push(cx, cz, 'rail', sweepProfile(C, sg * RAIL_C, prof, (p) => gy(p) + BED_H + 0.07));
          if (!lite) {
            let list = sleepers.get(`${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`);
            if (!list) sleepers.set(`${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`, (list = []));
            const m = new THREE.Matrix4();
            for (let i = 0; i < C.length - 1; i++) {
              const p = C[i];
              for (let f = 0; f < STEP; f += 0.65) {
                const x = p.x + p.tx * f, z = p.z + p.tz * f;
                m.makeRotationY(Math.atan2(p.tx, p.tz)).setPosition(x, gy(p) + BED_H + 0.035, z);
                list.push(m.clone());
              }
            }
          }
        }
      }
    }
  }

  // ---- overhead line over every drawn stretch: supports every ~30 m (pull-offs every 7.5 m), staggered
  // +-0.15 m; each pole stands outside the swept envelope of every track (its own and the neighbours')
  const poleHash = new Set();
  const nearPole = (x, z) => poleHash.has(`${Math.floor(x / 9)},${Math.floor(z / 9)}`);
  const markPole = (x, z) => poleHash.add(`${Math.floor(x / 9)},${Math.floor(z / 9)}`);
  for (const t of tracks) {
    for (const [ra, rb] of t.runs) {
      const S = t.S.slice(ra, rb + 1);
      let prev = null;
      let k = 0;
      for (let i = 0; i < S.length; i += 5) {
        const p = S[i];
        const stag = (k++ % 2 ? 1 : -1) * 0.15;
        const wp = [p.x - p.tz * stag, p.rail + WIRE_H, p.z + p.tx * stag];
        if (prev) addWire(prev, wp);
        prev = wp;
        if ((k - 1) % 4 !== 0 || nearPole(p.x, p.z)) continue;
        // candidate spots: the kerb side in the street, then both sides at growing distances
        const cands = [];
        if (t.street && roads) {
          const q = roads.query(p.x, p.z, 25);
          if (q) {
            const ax = q.piece.pts[q.i], az = q.piece.pts[q.i + 1];
            const px = ax + (q.piece.pts[q.i + 2] - ax) * q.t, pz = az + (q.piece.pts[q.i + 3] - az) * q.t;
            const latC = (p.x - px) * -p.tz + (p.z - pz) * p.tx;
            const side = Math.abs(latC) > 0.6 ? Math.sign(latC) : 1;
            cands.push([side, q.piece.hw + 0.6 - Math.abs(latC)]);
          }
        }
        for (const lat of [2.6, 3.2, 3.8, 4.5]) for (const side of [1, -1]) cands.push([side, lat]);
        for (const [side, lat] of cands) {
          if (lat < 2.2) continue;
          const bx = p.x - p.tz * side * lat, bz = p.z + p.tx * side * lat;
          if (index.hits(bx, bz, 0.18)) continue;
          if (world.bgrid && world.bgrid.boxContact && world.bgrid.boxContact(bx, bz, 1, 0, 0.3, 0.3)) continue;
          if (roads && roads.onRoad(bx, bz, 0.3)) continue; // never in a traffic lane
          markPole(p.x, p.z);
          poles.push({ x: bx, z: bz, y: groundY(bx, bz) + (t.street ? 0.2 : 0), h: p.rail + WIRE_H + 0.9 - groundY(bx, bz), ax: wp[0], az: wp[2], wy: wp[1] });
          break;
        }
      }
    }
  }

  world.tramPoles = poles;

  // ---- meshes per tile
  const out = [];
  for (const [tk, b] of buckets) {
    for (const [key, list] of Object.entries(b)) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[key]);
      m.name = `tramTrack:${tk}`;
      m.receiveShadow = true;
      m.castShadow = key === 'rail';
      out.push(m);
    }
  }
  const sleeperGeo = new THREE.BoxGeometry(1.9, 0.07, 0.22);
  for (const [tk, list] of sleepers) {
    const im = new THREE.InstancedMesh(sleeperGeo, mats.sleeper, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.name = `tramTrack:${tk}`;
    im.receiveShadow = true;
    out.push(im);
  }
  // poles (tapered tube) and bracket arms (tube from the pole to above the wire, a tie rod below it)
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 1, 10).translate(0, 0.5, 0);
  const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
  const byTile = new Map();
  for (const p of poles) {
    const tk = `${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`;
    if (!byTile.has(tk)) byTile.set(tk, []);
    byTile.get(tk).push(p);
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), v4 = new THREE.Vector3();
  for (const [tk, list] of byTile) {
    const pm = new THREE.InstancedMesh(poleGeo, mats.pole, list.length);
    const am = new THREE.InstancedMesh(armGeo, mats.pole, list.length * 2);
    const tieSegs = [];
    list.forEach((p, i) => {
      pm.setMatrixAt(i, m4.compose(v4.set(p.x, p.y, p.z), q4.identity(), s4.set(1, p.h, 1)));
      const dx = p.ax - p.x, dz = p.az - p.z, L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(-dz, dx);
      const armY = p.wy + 0.55;
      if (L < 6) {
        // cantilever: horizontal tube and an inclined stay
        am.setMatrixAt(2 * i, m4.compose(v4.set(p.x, armY, p.z), q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), s4.set(L + 0.3, 1, 1)));
        const stayL = Math.hypot(L * 0.6, 0.9);
        const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(0.9, L * 0.6), 'YZX'));
        am.setMatrixAt(2 * i + 1, m4.compose(v4.set(p.x, armY - 0.9, p.z), rot, s4.set(stayL, 0.8, 0.8)));
        // dropper from the arm to the wire
        tieSegs.push(p.ax, armY, p.az, p.ax, p.wy, p.az);
      } else {
        // wide street: cross-span wire from the pole top down to the contact wire
        am.setMatrixAt(2 * i, m4.compose(v4.set(p.x, armY, p.z), q4.identity(), s4.set(0.001, 0.001, 0.001)));
        am.setMatrixAt(2 * i + 1, m4.compose(v4.set(p.x, armY, p.z), q4.identity(), s4.set(0.001, 0.001, 0.001)));
        tieSegs.push(p.x, p.y + p.h - 0.4, p.z, p.ax, p.wy + 0.35, p.az, p.ax, p.wy + 0.35, p.az, p.ax, p.wy, p.az);
      }
    });
    pm.computeBoundingSphere();
    am.computeBoundingSphere();
    pm.name = am.name = `catenary:${tk}`;
    pm.castShadow = true;
    out.push(pm, am);
    if (tieSegs.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(tieSegs, 3));
      const ls = new THREE.LineSegments(lg, mats.wire);
      ls.name = `catenary:${tk}`;
      out.push(ls);
    }
  }
  for (const [tk, arr] of wireSegs) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const ls = new THREE.LineSegments(lg, mats.wire);
    ls.name = `catenary:${tk}`;
    ls.frustumCulled = true;
    lg.computeBoundingSphere();
    out.push(ls);
  }
  for (const o of out) world.addToTile(o.name.split(':')[1], o);
  world.tramMaterials = mats;
  return { meshes: out.length, poles: poles.length };
}
