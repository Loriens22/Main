// Front end of the Mercedes-Benz Conecto G (photos ref01 / ref02 / ref03): wide orange lower face with the
// chrome-ringed star, CONECTO badge, three-lens lamp units in the upper bumper corners, round fog lamps,
// centre bumper module with visible seams, one big raked windscreen in a thin black frame with the LED
// destination sign behind its top edge, white roof cap with two small marker lamps, tandem wipers parked
// at the base, a big rectangular mirror on the driver's side and a swept-arm mirror over door 1.
// Everything is generated from one surface function faceS(|x|, Y) (depth behind the nose plane) so that
// decals, lamps and glass conform to the curved corners. S = z - frontZ.
import * as THREE from 'three';
import { Parts, M, box, surfaceGrid, pchip, lerp, sstep, clamp, ellSweep, superEllipsoid, basis, tube, smooth } from './geom.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeFogLens } from './ConectoTextures.js';

const HW = 1.25;
const FACE = { baseY: 0.3, glassBot: 1.285, glassTop: 2.83, capTop: 2.9, rake: 0.13, bumperBulge: 0.04 };
export const TUMBLE_IN = 0.025; // the side wall leans in above the belt
const sLow = pchip([0.78, 0.95, 1.08, 1.17, 1.225, 1.25], [0, 0.025, 0.09, 0.19, 0.31, 0.45]);
const sUp = pchip([0.8, 1.0, 1.1, 1.18, 1.23, 1.25], [0, 0.03, 0.09, 0.18, 0.3, 0.45]);
const BELT_TUMBLE = 1.42;
const ROOF_Y = 2.9;
const ctx = { fz: -8.35 };

/** Half width of the body at height Y (tumblehome above the belt, rounded roof edge R 0.3). */
export function hwAt(Y) {
  const r = 0.3, hw1 = HW - TUMBLE_IN;
  if (Y <= BELT_TUMBLE) return HW;
  if (Y <= ROOF_Y - r) return HW - TUMBLE_IN * clamp((Y - BELT_TUMBLE) / (ROOF_Y - r - BELT_TUMBLE), 0, 1);
  const d = Math.min(r, Y - (ROOF_Y - r));
  return hw1 - r + Math.sqrt(Math.max(0, r * r - d * d));
}

/** Depth S behind the nose plane of the outer front surface at plan coordinate ax (0..HW, unscaled) and height Y. */
export function faceS(ax, Y) {
  const low = (a) => (a <= 0.78 ? 0 : sLow(a));
  const up = (a) => (a <= 0.8 ? 0 : sUp(a));
  const bulge = -FACE.bumperBulge * (1 - sstep(0.32, 0.85, Y)) * (1 - sstep(1.0, 1.25, ax));
  if (Y <= 1.22) return low(ax) + bulge;
  if (Y <= FACE.glassBot) {
    const t = sstep(1.22, FACE.glassBot, Y);
    return lerp(low(ax), up(ax), t) + 0.02 * t;
  }
  if (Y <= FACE.glassTop) return up(ax) + 0.02 + (FACE.rake - 0.02) * ((Y - FACE.glassBot) / (FACE.glassTop - FACE.glassBot));
  // roof cap: overhangs the glass a little, rounded top edge
  const base = up(ax) + FACE.rake;
  const over = -0.03 * sstep(FACE.glassTop, FACE.glassTop + 0.03, Y);
  const tt = clamp((Y - (FACE.capTop - 0.04)) / 0.04, 0, 1);
  return base + over + 0.04 * (1 - Math.sqrt(Math.max(0, 1 - tt * tt)));
}

function facePt(x, Y) {
  const ax = (Math.abs(x) * HW) / hwAt(Y);
  return [x, ctx.fz + faceS(ax, Y)];
}

/** Point on the surface pushed `off` metres along the outward normal. */
export function facePos(x, Y, off = 0) {
  const [px, pz] = facePt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (facePt(x + e, Y)[1] - facePt(x - e, Y)[1]) / (2 * e);
  const gy = (facePt(x, Y + e)[1] - facePt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px + (off * gx) / l, Y + (off * gy) / l, pz - off / l];
}

const HALF = (() => {
  const a = [0, 0.3, 0.6, 0.78, 0.9];
  const n = 16;
  for (let k = 1; k <= n; k++) a.push(0.9 + (HW - 0.9) * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
export const COLS = [...HALF.slice().reverse(), ...HALF.slice(1).map((x) => -x)]; // from +x (viewer's left) to -x
const colsBetween = (xl, xr, n) => Array.from({ length: n + 1 }, (_, i) => lerp(xl, xr, i / n));

/** Patch conforming to the front surface; xs run from +x to -x; y0 / y1 may be functions of x. */
export function facePatch({ xs, y0, y1, nv = 1, off = 0, uv = [0, 0, 1, 1], scale = false, clip = null, clipSign = 1 }) {
  const nu = xs.length - 1;
  const f0 = typeof y0 === 'function' ? y0 : () => y0;
  const f1 = typeof y1 === 'function' ? y1 : () => y1;
  return surfaceGrid(nu, nv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(f0(x), f1(x), v);
    if (scale) x *= hwAt(Y) / HW;
    if (clip) x = clipSign * Math.max(Math.abs(x), clip(Y));
    return facePos(x, Y, off);
  }, { uvRect: uv });
}

export const FrontMixin = {
  buildFront() {
    ctx.fz = this.F.frontZ;
    const parts = new Parts();
    this.frontEnd(parts);
    const L = this.sideBody(parts, 'front');
    this.roofBody(parts, L, 0.72, L.s1, 'front');
    this.roofEquipmentFront(parts);
    this.endFrame(parts, this.F.frontEnd, -1);
    this.addAxle(this.front, -this.D.wb1, false, true);
    this.addAxle(this.front, 0, false, false);
    for (const d of this.spec.doors.filter((q) => q.section === 'front')) this.addDoor(this.front, d);
    const grp = this.finish(parts);
    this.front.add(grp);
    this.frontExterior = grp;
    this.buildWipers();
  },

  frontEnd(parts) {
    const lite = this.lite;
    const fz = ctx.fz;
    const fleetLeft = this.fleet[0] === '3';
    // ---------------------------------------------------- orange lower face (bumper to the windscreen frame)
    for (const [ya, yb, nv] of [[FACE.baseY, 0.55, 3], [0.55, 1.22, 5]]) {
      parts.add('paint', facePatch({ xs: COLS, y0: ya, y1: yb, nv }));
    }
    // black frame band under the windscreen, then the screen frame pieces
    parts.add('black', facePatch({ xs: COLS, y0: 1.22, y1: FACE.glassBot, nv: 1, scale: true }));
    // underside pan of the bumper (dark)
    {
      const pan = surfaceGrid(COLS.length - 1, 1, (u, v) => {
        const x = COLS[Math.round(u * (COLS.length - 1))];
        const s0 = faceS(Math.abs(x), 0.3);
        return [x * 0.97, 0.3, fz + lerp(s0, 1.1, v)];
      }, { flip: true });
      parts.add('underbody', pan);
    }
    // ---------------------------------------------------- panel seams: centre bumper module and the lamp-line crease
    if (!lite) {
      for (const sg of [1, -1]) {
        const g = surfaceGrid(1, 6, (u, v) => {
          const Y = lerp(0.31, 0.69, v);
          const x = sg * (0.72 + 0.03 * (1 - v)) + (u - 0.5) * 0.005;
          return facePos(x, Y, 0.0008);
        }, { flip: sg < 0 });
        parts.add('black', g);
      }
      // faint horizontal crease at the top of the bumper between the lamps
      parts.add('black', facePatch({ xs: colsBetween(0.72, -0.72, 8), y0: 0.688, y1: 0.696, nv: 1, off: 0.0008 }));
      // second crease across the full width just above the star
      parts.add('black', facePatch({ xs: colsBetween(1.02, -1.02, 14), y0: 1.17, y1: 1.176, nv: 1, off: 0.0006, scale: true }));
    }
    // ---------------------------------------------------- windscreen: one raked pane in a thin black frame
    {
      const gw = pchip([1.285, 1.45, 2.0, 2.5, 2.7, 2.8, 2.83], [1.15, 1.19, 1.205, 1.195, 1.12, 0.98, 0.9]);
      const left = COLS.filter((x) => x >= 0), right = COLS.filter((x) => x <= 0);
      for (const [xs, sgn] of [[left, 1], [right, -1]]) {
        parts.add('black', facePatch({ xs, y0: FACE.glassBot, y1: FACE.glassTop - 1e-4, nv: 12, scale: true, clip: gw, clipSign: sgn }));
      }
      const Nc = 40, Nr = 16;
      const mk = () => surfaceGrid(Nc, Nr, (u, v) => {
        const Y = lerp(FACE.glassBot + 0.002, FACE.glassTop - 0.002, v);
        const x = gw(Y) * Math.sin((1 - 2 * u) * Math.PI / 2);
        return facePos(x, Y, 0.002);
      });
      parts.add('windscreen', mk());
      parts.add('windscreenIn', mk());
    }
    // ---------------------------------------------------- white roof cap with the rounded top edge
    {
      const rows = [FACE.glassTop, 2.855, 2.88, FACE.capTop];
      for (let i = 0; i < rows.length - 1; i++) parts.add('roof', facePatch({ xs: COLS, y0: rows[i], y1: rows[i + 1], nv: 1, scale: true }));
      const xs = COLS;
      const cap = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const q = xs[Math.round(u * (xs.length - 1))];
        const x = (q * hwAt(FACE.capTop)) / HW;
        const s0 = faceS(Math.abs(q), FACE.capTop);
        return [x, FACE.capTop + 0.0005, fz + lerp(s0, Math.max(s0, 0.9), v)];
      });
      parts.add('roof', cap);
      // underside of the cap over the screen top (dark)
      parts.add('black', facePatch({ xs: COLS, y0: FACE.glassTop - 0.012, y1: FACE.glassTop, nv: 1, scale: true, off: 0.001 }));
    }
    // ---------------------------------------------------- registration plate and holder
    parts.add('black', box(0.56, 0.15, 0.014), M(0, 0.435, fz + faceS(0, 0.43) - 0.004));
    parts.add('plate', surfaceGrid(1, 1, (u, v) => [0.26 - u * 0.52, 0.38 + v * 0.11, fz + faceS(0, 0.43) - 0.0125]));
    // ---------------------------------------------------- decals: star, CONECTO badge, fleet number
    const dr = this.decalRects;
    parts.add('decals', facePatch({ xs: colsBetween(0.1, -0.1, 4), y0: 0.795, y1: 0.995, nv: 1, off: 0.003, uv: dr.star }));
    parts.add('decals', facePatch({ xs: colsBetween(-0.33, -0.76, 8), y0: 0.78, y1: 0.866, nv: 1, off: 0.0025, uv: dr.badge }));
    {
      const xa = fleetLeft ? -0.84 : 1.2, xb = fleetLeft ? -1.2 : 0.84;
      parts.add('decals', facePatch({ xs: colsBetween(Math.max(xa, xb), Math.min(xa, xb), 8), y0: 0.91, y1: 1.045, nv: 1, off: 0.0025, uv: dr.fleet }));
    }
    // ---------------------------------------------------- lamp units (three lenses), fog lamps, corner repeaters
    this.lampUnits(parts);
    // ---------------------------------------------------- marker lamps on the cap, roof antenna
    for (const sg of [1, -1]) {
      const [px, py, pz] = facePos(sg * 0.98, 2.905, 0.004);
      parts.add('marker', box(0.1, 0.026, 0.035, 0.008), M(px, py, pz));
    }
    // ---------------------------------------------------- mirrors
    this.mirrors(parts);
  },

  lampUnits(parts) {
    const fz = ctx.fz;
    // lamp unit 0.38 x 0.145 m centred at x = +-0.905, Y 0.64..0.785 (ref01: housing sits in the upper corner of the bumper)
    const span = (sg, a, b, n) => (sg > 0 ? colsBetween(b, a, n) : colsBetween(-a, -b, n));
    for (const sg of [1, -1]) {
      // lamp aperture: dark housing frame, then the textured lens block
      parts.add('matteBlack', facePatch({ xs: span(sg, 0.705, 1.105, 10), y0: 0.628, y1: 0.8, nv: 2, off: 0.0015 }));
      const uv = sg > 0 ? [0, 0, 1, 1] : [1, 0, 0, 1];
      parts.add('headlamp', facePatch({ xs: span(sg, 0.72, 1.09, 12), y0: 0.64, y1: 0.785, nv: 2, off: 0.0045, uv }));
      parts.add('lensClear', facePatch({ xs: span(sg, 0.72, 1.09, 12), y0: 0.64, y1: 0.785, nv: 2, off: 0.0075 }));
      // indicator: amber disc over the middle lens
      const cx = sg * 0.905;
      const c = new THREE.CircleGeometry(0.0235, 14);
      const [px, py, pz] = facePos(cx, 0.7125, 0.0085);
      c.rotateY(Math.PI);
      parts.add(sg > 0 ? 'indicatorR' : 'indicatorL', c, M(px, py, pz));
      // fog lamp: chrome ring and lens in the bumper corner
      const [fx, fy, fzz] = facePos(sg * 0.9, 0.455, 0.002);
      const ring = new THREE.TorusGeometry(0.043, 0.006, 6, 18);
      ring.rotateY(Math.PI);
      parts.add('satinChrome', ring, M(fx, fy, fzz));
      const lens = new THREE.CircleGeometry(0.042, 16);
      lens.rotateY(Math.PI);
      parts.add('headlamp', lens, M(fx, fy, fzz + 0.001));
      void fz;
    }
  },

  mirrors(parts) {
    const z0 = ctx.fz;
    // ---- RIGHT (+x): swept arm over door 1, black rectangular head hanging below it
    {
      const path = [[1.18, 2.7, z0 + 0.55], [1.28, 2.76, z0 + 0.4], [1.42, 2.78, z0 + 0.22], [1.55, 2.74, z0 + 0.08], [1.64, 2.64, z0 + 0.0]];
      for (const g of ellSweep(path, (t) => [0.02 + 0.012 * t, 0.026 + 0.01 * t], 24, 10)) parts.add('satin', g);
      parts.add('satin', box(0.1, 0.1, 0.12, 0.02), M(1.2, 2.69, z0 + 0.56));
      const head = new RoundedBoxGeometry(0.22, 0.44, 0.1, 3, 0.035);
      const hm = new THREE.Matrix4().makeRotationY(0.22).setPosition(1.66, 2.33, z0 - 0.02);
      parts.add('satin', head, hm);
      const g1 = new THREE.PlaneGeometry(0.19, 0.3); g1.translate(0, 0.045, 0.0515);
      const g2 = new THREE.PlaneGeometry(0.19, 0.09); g2.translate(0, -0.165, 0.0515);
      parts.add('mirror', g1, hm);
      parts.add('mirror', g2, hm);
      parts.add('satin', rodTo([1.6, 2.66, z0 + 0.0], [1.66, 2.5, z0 - 0.02], 0.016));
    }
    // ---- LEFT (-x): heavy bracket on the A-pillar corner, big rectangular head (ref01)
    {
      const path = [[-1.2, 2.5, z0 + 0.62], [-1.32, 2.56, z0 + 0.5], [-1.42, 2.58, z0 + 0.36], [-1.46, 2.5, z0 + 0.3]];
      for (const g of ellSweep(path, (t) => [0.024, 0.03], 16, 10)) parts.add('satin', g);
      parts.add('satin', box(0.1, 0.12, 0.13, 0.02), M(-1.2, 2.5, z0 + 0.62));
      const head = new RoundedBoxGeometry(0.24, 0.5, 0.1, 3, 0.04);
      const hm = new THREE.Matrix4().makeRotationY(-0.2).setPosition(-1.5, 2.22, z0 + 0.26);
      parts.add('satin', head, hm);
      const g1 = new THREE.PlaneGeometry(0.2, 0.34); g1.translate(0, 0.06, 0.0515);
      const g2 = new THREE.PlaneGeometry(0.2, 0.1); g2.translate(0, -0.185, 0.0515);
      parts.add('mirror', g1, hm);
      parts.add('mirror', g2, hm);
      parts.add('satin', rodTo([-1.46, 2.5, z0 + 0.3], [-1.5, 2.4, z0 + 0.26], 0.018));
    }
  },

  /** Where the LED destination sign sits: behind the top of the screen. */
  frontSignPlacement() {
    return { z: ctx.fz + faceS(0.3, 2.66) + 0.07, rx: Math.atan(FACE.rake / (FACE.glassTop - FACE.glassBot)) };
  },

  roofEquipmentFront(parts) {
    // grey radio / GPS dome on the centre line, 1.9 m behind the nose (ref03)
    const z = ctx.fz + 1.95;
    const dome = new THREE.CylinderGeometry(0.17, 0.2, 0.08, 20);
    parts.add('plastic', dome, M(0, ROOF_Y + 0.035, z));
    parts.add('plastic', new THREE.SphereGeometry(0.17, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), M(0, ROOF_Y + 0.07, z));
  },

  /** Tandem wipers: arms parked at the base of the screen, pointing outwards from near the centre. */
  buildWipers() {
    this.wipers = [];
    const fz = ctx.fz;
    const defs = [
      { x: 0.1, y: 1.32, len: 1.0, park: -0.06, sweep: 1 }, // passenger side blade, tip towards +x
      { x: -0.12, y: 1.31, len: 0.9, park: Math.PI + 0.06, sweep: -1 }, // driver side, tip towards -x
    ];
    const rake = Math.atan(FACE.rake / (FACE.glassTop - FACE.glassBot));
    for (const d of defs) {
      const tilt = new THREE.Group();
      const zGlass = fz + faceS(Math.abs(d.x), d.y);
      const zArm = zGlass - 0.025;
      tilt.position.set(d.x, d.y, zArm);
      tilt.rotation.x = rake;
      const L = d.len;
      const p = new Parts();
      p.add('satin', box(L, 0.02, 0.012), M(L / 2, 0, 0));
      p.add('satin', box(L * 0.84, 0.018, 0.022), M(L * 0.55, -0.02, -0.004));
      p.add('satin', new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10).rotateX(Math.PI / 2), M(0, 0, 0));
      const piv = new THREE.Group();
      piv.add(p.build(this.mats, { castShadow: false, receiveShadow: false }));
      piv.rotation.z = d.park;
      tilt.add(piv);
      this.front.add(tilt);
      this.wipers.push({ piv, park: d.park, sweep: d.sweep });
    }
  },
};

function rodTo(a, b, r) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export { FACE, colsBetween };
void superEllipsoid; void basis; void tube; void smooth; void makeFogLens;
