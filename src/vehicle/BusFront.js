// Front end of the MAN Lion's City G: white lower face with grille, chrome
// strip and lamp units, black base band, raked panoramic windscreen, black LED
// header, mirrors (ram's horn right, compact box left) and wipers.
// Everything is generated from one surface function faceS(|x|, Y) so that the
// decals, lamps and glass conform to the curved corners. Frame: x right, y up,
// z backwards (front face at FRONT_Z); S = z - FRONT_Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUS, FRONT_Z } from './BusSpec.js';
import { HW, M, Parts, basis, box, surfaceGrid, pchip, lerp, sstep, clamp, sweep, superEllipsoid } from './BusGeom.js';

/* ------------------------------------------------------------------ the front surface */
// plan outline of the lower body: flat centre |x| < 0.78, nearly frontal corner module (lamps, pictograms), tight turn into the side wall.
// The cab side panels of the interior reach S = 0.025 at |x| = 1.19, so the skin must not curve back before that.
const sLow = pchip([0.78, 1.0, 1.1, 1.16, 1.2, 1.23, 1.25, 1.263, 1.271, HW], [0, 0.002, 0.008, 0.016, 0.03, 0.07, 0.13, 0.22, 0.33, 0.495]);
// plan outline of the glazed zone (screen + A-pillar corner)
const sUp = pchip([0, 0.9, 1.0, 1.08, 1.14, 1.19, 1.23, 1.26, HW], [0, 0, 0.01, 0.035, 0.08, 0.14, 0.24, 0.37, 0.52]);
// plan outline of the LED header (top corners R about 0.25)
const sHdr = pchip([0, 1.0, 1.08, 1.16, 1.22, 1.255, HW], [0, 0, 0.04, 0.13, 0.27, 0.4, 0.5]);

export const FACE = {
  chromeY: 1.0, // top of the white face
  bandTop: 1.22, // top of the black base band = bottom of the glass
  glassTop: 2.32,
  hdrBot: 2.3,
  hdrTop: 2.86,
  rake: 0.15, // windscreen top leans back by this much
};

export const TUMBLE_IN = 0.02; // side wall leans in by 0.02 m above the belt (spec: about 2 degrees, low confidence; the interior pillars stop at 1.255)
export const ROOF_HW = HW - TUMBLE_IN; // half width at the roof edge (Y 2.76)

/** Half width of the body at height Y (tumblehome up to the roof edge, then the roof radius 0.12). */
export function hwAt(Y) {
  if (Y <= 1.3) return HW;
  if (Y <= 2.76) return HW - TUMBLE_IN * clamp((Y - 1.3) / 1.46, 0, 1);
  const d = Math.min(0.12, Y - 2.76);
  return ROOF_HW - 0.12 + Math.sqrt(Math.max(0, 0.0144 - d * d));
}

/** Depth S of the outer front surface at plan coordinate ax (0..HW, unscaled) and height Y. */
export function faceS(ax, Y) {
  if (Y <= FACE.chromeY) return ax <= 0.78 ? 0 : sLow(ax);
  if (Y <= FACE.bandTop) {
    const t = sstep(FACE.chromeY, FACE.bandTop, Y);
    return lerp(ax <= 0.78 ? 0 : sLow(ax), sUp(ax), t) + 0.02 * t;
  }
  if (Y < FACE.hdrBot) return sUp(ax) + 0.02 + (FACE.rake - 0.02) * (Y - FACE.bandTop) / (FACE.hdrBot - FACE.bandTop);
  // header: overhangs the glass; its top edge is rounded over (R about 0.09)
  const t = clamp((Y - 2.78) / 0.094, 0, 1);
  return sHdr(ax) + 0.04 + 0.09 * (Y - FACE.hdrBot) / (FACE.hdrTop - FACE.hdrBot) + 0.09 * (1 - Math.sqrt(1 - t * t));
}

/** Surface point [x, z] at real lateral position x. */
function facePt(x, Y) {
  const ax = Math.abs(x) * HW / hwAt(Y);
  return [x, FRONT_Z + faceS(ax, Y)];
}

/** Point on the surface pushed `off` metres along the outward normal. */
function facePos(x, Y, off = 0) {
  const [px, pz] = facePt(x, Y);
  if (!off) return [px, Y, pz];
  const e = 0.004;
  const gx = (facePt(x + e, Y)[1] - facePt(x - e, Y)[1]) / (2 * e);
  const gy = (facePt(x, Y + e)[1] - facePt(x, Y - e)[1]) / (2 * e);
  const l = Math.hypot(gx, gy, 1);
  return [px + (off * gx) / l, Y + (off * gy) / l, pz - off / l];
}

/** x samples from the +x side wall (viewer's left) to -x, dense in the corners. */
const HALF = (() => {
  const a = [0, 0.3, 0.6, 0.78, 0.9];
  const n = 16;
  for (let k = 1; k <= n; k++) a.push(0.9 + (HW - 0.9) * Math.sin((k / n) * Math.PI / 2));
  return a;
})();
export const COLS = [...HALF.slice().reverse(), ...HALF.slice(1).map((x) => -x)];
const colsBetween = (xl, xr, n) => Array.from({ length: n + 1 }, (_, i) => lerp(xl, xr, i / n));
const yBot = (x) => lerp(0.31, 0.37, sstep(0.78, HW, Math.abs(x)));

/**
 * Patch conforming to the front surface. xs run from the viewer's left (+x) to the right;
 * y0 / y1 may be functions of x; scale=true treats xs as plan coordinates scaled by the tumblehome.
 */
function facePatch({ xs, y0, y1, nv = 1, rows = null, off = 0, uv = [0, 0, 1, 1], scale = false, clip = null, clipSign = 1 }) {
  const fr = rows || Array.from({ length: nv + 1 }, (_, j) => j / nv);
  const nu = xs.length - 1, mv = fr.length - 1;
  const f0 = typeof y0 === 'function' ? y0 : () => y0;
  const f1 = typeof y1 === 'function' ? y1 : () => y1;
  return surfaceGrid(nu, mv, (u, v) => {
    let x = xs[Math.round(u * nu)];
    const Y = lerp(f0(x), f1(x), fr[Math.round(v * mv)]);
    if (scale) x *= hwAt(Y) / HW;
    if (clip) x = clipSign * Math.max(Math.abs(x), clip(Y));
    return facePos(x, Y, off);
  }, { uvRect: uv });
}

// grille polygon (x >= 0 half): top Y 0.785, chamfered lower corners
const GRILLE = [[0.775, 0.785], [0.635, 0.525], [0.52, 0.495]];
const gx1 = (Y) => (Y <= 0.525 ? lerp(0.52, 0.635, (Y - 0.495) / 0.03) : lerp(0.635, 0.775, (Y - 0.525) / 0.26));

// MAN letters in a 0.17 x 0.10 cell
const LETTER_M = [[0, 0], [0.036, 0], [0.036, 0.058], [0.085, 0], [0.134, 0.058], [0.134, 0], [0.17, 0], [0.17, 0.1], [0.13, 0.1], [0.085, 0.045], [0.04, 0.1], [0, 0.1]];
const LETTER_A = [[0, 0], [0.04, 0], [0.052, 0.028], [0.118, 0.028], [0.13, 0], [0.17, 0], [0.115, 0.1], [0.055, 0.1]];
const LETTER_A_HOLE = [[0.066, 0.056], [0.104, 0.056], [0.085, 0.086]];
const LETTER_N = [[0, 0], [0.036, 0], [0.036, 0.052], [0.126, 0], [0.17, 0], [0.17, 0.1], [0.134, 0.1], [0.134, 0.048], [0.044, 0.1], [0, 0.1]];

function polyShape(pts, hole) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (hole) s.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
  return s;
}

export const FrontMixin = {
  /** Static geometry of the front end, merged per material into `parts`. */
  frontEnd(parts) {
    const lite = this.lite;
    // ---------------------------------------------------- white lower face with the grille opening
    const left = COLS.filter((x) => x >= 0), right = COLS.filter((x) => x <= 0);
    const solid = (y0, y1, nv = 1) => parts.add('paint', facePatch({ xs: COLS, y0, y1, nv }));
    solid(yBot, 0.495);
    for (const [ya, yb] of [[0.495, 0.525], [0.525, 0.785]]) {
      for (const [xs, sgn] of [[left, 1], [right, -1]]) {
        parts.add('paint', facePatch({ xs, y0: ya, y1: yb, nv: ya < 0.5 ? 1 : 3, clip: gx1, clipSign: sgn }));
      }
    }
    solid(0.785, FACE.chromeY, 3);
    // recessed gloss-black grille (0.014 m behind the face) with its walls
    const gs = new THREE.Shape();
    gs.moveTo(GRILLE[0][0], GRILLE[0][1]);
    gs.lineTo(-GRILLE[0][0], GRILLE[0][1]);
    gs.lineTo(-GRILLE[1][0], GRILLE[1][1]);
    gs.lineTo(-GRILLE[2][0], GRILLE[2][1]);
    gs.lineTo(GRILLE[2][0], GRILLE[2][1]);
    gs.lineTo(GRILLE[1][0], GRILLE[1][1]);
    gs.closePath();
    const gg = new THREE.ShapeGeometry(gs);
    const gp = gg.attributes.position, guv = gg.attributes.uv;
    for (let i = 0; i < gp.count; i++) {
      guv.setXY(i, (0.775 - gp.getX(i)) / 1.55, (gp.getY(i) - 0.495) / 0.29);
      gp.setZ(i, FRONT_Z + 0.014);
      gp.setX(i, gp.getX(i));
    }
    // ShapeGeometry faces +z; flip to face -z
    const gi = gg.index.array;
    for (let i = 0; i < gi.length; i += 3) { const t = gi[i + 1]; gi[i + 1] = gi[i + 2]; gi[i + 2] = t; }
    gg.computeVertexNormals();
    parts.add('grille', gg);
    const pts = [[GRILLE[0][0], GRILLE[0][1]], [GRILLE[1][0], GRILLE[1][1]], [GRILLE[2][0], GRILLE[2][1]], [-GRILLE[2][0], GRILLE[2][1]], [-GRILLE[1][0], GRILLE[1][1]], [-GRILLE[0][0], GRILLE[0][1]], [GRILLE[0][0], GRILLE[0][1]]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const wall = surfaceGrid(1, 1, (u, v) => [lerp(ax, bx, u), lerp(ay, by, u), FRONT_Z + 0.014 * (1 - v)]);
      parts.add('black', wall);
    }
    // chrome MAN letters (raised 0.012) on the grille
    {
      const mats = [[LETTER_M, null, 0.18], [LETTER_A, LETTER_A_HOLE, 0], [LETTER_N, null, -0.18]];
      for (const [poly, hole, xc] of mats) {
        const g = new THREE.ExtrudeGeometry(polyShape(poly, hole), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 1 });
        parts.add('satinChrome', g, basis([-0.15 / 0.17, 0, 0], [0, 1, 0], [0, 0, -1], [xc + 0.075, 0.64, FRONT_Z + 0.013]));
      }
    }
    // ---------------------------------------------------- chrome strip with the gull-wing pocket and lion emblem
    {
      const xs = [];
      for (let i = 0; i <= 56; i++) xs.push(lerp(0.92, -0.88, i / 56));
      const dip = (x) => 0.085 * clamp(1 - Math.abs(x + 0.02) / 0.21, 0, 1); // V pocket, 0.085 deep at the centre
      const yStrip = (x) => 1.002 - dip(x);
      const prof = [[-0.011, 0.001], [0, 0.007], [0.011, 0.001]];
      const g = surfaceGrid(xs.length - 1, 2, (u, v) => {
        const x = xs[Math.round(u * (xs.length - 1))];
        const p = prof[Math.round(v * 2)];
        return facePos(x, yStrip(x) + p[0], p[1]);
      });
      parts.add('chrome', g);
      // black gap above the strip hides the seam with the base band
      parts.add('badge', facePatch({ xs: colsBetween(0.11, -0.11, 6), y0: 0.915, y1: 1.0, nv: 1, off: 0.005 }));
    }
    // seams between the centre panel and the corner modules
    if (!lite) {
      for (const sgn of [1, -1]) {
        const g = surfaceGrid(1, 6, (u, v) => {
          const Y = lerp(0.37, 1.0, v);
          const x = sgn * lerp(0.7, 0.95, v) + (u - 0.5) * 0.004;
          return facePos(x, Y, 0.0008);
        }, { flip: sgn < 0 });
        parts.add('black', g);
      }
    }
    // ---------------------------------------------------- black base band and A-pillar corner frame
    parts.add('black', facePatch({ xs: COLS, y0: FACE.chromeY, y1: FACE.bandTop, nv: 4, scale: true }));
    // ---------------------------------------------------- panoramic windscreen (single raked pane, dark and reflective)
    {
      const gw = pchip([1.22, 1.45, 1.8, 2.15, 2.32], [0.95, 1.06, 1.12, 1.12, 1.02]);
      // black frame beside the glass: left and right pieces clipped by the glass outline (the pane itself stays see-through)
      const left = COLS.filter((x) => x >= 0), right = COLS.filter((x) => x <= 0);
      for (const [xs, sgn] of [[left, 1], [right, -1]]) {
        parts.add('black', facePatch({ xs, y0: FACE.bandTop, y1: FACE.hdrBot - 1e-4, nv: 12, scale: true, clip: gw, clipSign: sgn }));
      }
      const Nc = 44, Nr = 14;
      const mk = () => surfaceGrid(Nc, Nr, (u, v) => {
        const Y = lerp(1.2205, 2.2995, v);
        const x = gw(Y) * Math.sin((1 - 2 * u) * Math.PI / 2);
        return facePos(x, Y, 0.002);
      });
      parts.add('windscreen', mk());
      parts.add('windscreenIn', mk());
    }
    // ---------------------------------------------------- LED header housing, rounded top edge, roof cap
    {
      const rowsBlack = [FACE.hdrBot, 2.5, 2.7, 2.8, 2.835, 2.858];
      for (let i = 0; i < rowsBlack.length - 1; i++) {
        parts.add('black', facePatch({ xs: COLS, y0: rowsBlack[i], y1: rowsBlack[i + 1], nv: 1, scale: true }));
      }
      parts.add('paint', facePatch({ xs: COLS, y0: 2.858, y1: 2.872, nv: 1, scale: true }));
      // underside of the overhang (visible from below)
      const xs = COLS;
      const under = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const q = xs[Math.round(u * (xs.length - 1))];
        const x = q * hwAt(FACE.hdrBot) / HW;
        const ax = Math.abs(q);
        const sh = faceS(ax, FACE.hdrBot), sf = faceS(ax, FACE.hdrBot - 1e-4);
        return [x, FACE.hdrBot, FRONT_Z + lerp(sh, sf, v)];
      }, { flip: true });
      parts.add('black', under);
      // flat cap behind the front edge up to where the roof extrusion starts
      const cap = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const q = xs[Math.round(u * (xs.length - 1))];
        const x = q * hwAt(2.872) / HW;
        const s0 = faceS(Math.abs(q), 2.872);
        return [x, 2.874, FRONT_Z + lerp(s0, Math.max(s0, 0.72), v)];
      });
      parts.add('paint', cap);
    }
    // ---------------------------------------------------- underside of the bumper (dark pan)
    {
      const xs = COLS;
      const pan = surfaceGrid(xs.length - 1, 1, (u, v) => {
        const x = xs[Math.round(u * (xs.length - 1))];
        const s0 = faceS(Math.abs(x), 0.4);
        return [x * 0.97, 0.36, FRONT_Z + lerp(s0, 1.0, v)];
      }, { flip: true });
      parts.add('underbody', pan);
    }
    // ---------------------------------------------------- registration plate in its holder
    parts.add('plate', surfaceGrid(1, 1, (u, v) => [0.27 - u * 0.54, 0.33 + v * 0.15, FRONT_Z - 0.0135]));
    parts.add('black', box(0.54, 0.15, 0.011), M(0, 0.405, FRONT_Z - 0.002));
    // ---------------------------------------------------- decals: fleet number, pictograms, CNG diamond
    const dr = this.decalRects;
    parts.add('decals', facePatch({ xs: colsBetween(0.765, 0.375, 10), y0: 0.755, y1: 0.947, nv: 1, off: 0.0025, uv: dr.fleet }));
    ['pram', 'wheel', 'walk'].forEach((k, i) => {
      // the corner is angled, so the discs sit a little further in than the frontal projection of the photos
      const c = [1.17, 1.04, 0.91][i];
      parts.add('decals', facePatch({ xs: colsBetween(c + 0.0675, c - 0.0675, 6), y0: 0.775, y1: 0.91, nv: 1, off: 0.0025, uv: dr[k] }));
    });
    parts.add('decals', facePatch({ xs: colsBetween(0.45 + 0.0835, 0.45 - 0.0835, 4), y0: 1.08 - 0.0835, y1: 1.08 + 0.0835, nv: 1, off: 0.003, uv: dr.cng }));
    // ---------------------------------------------------- washer jets / sensors beside the corner lamps
    for (const sg of [1, -1]) {
      for (const [x, Y] of [[1.255, 0.745], [1.262, 0.6], [1.262, 0.56]]) {
        const c = new THREE.CircleGeometry(0.0055, 8);
        const [px, py, pz] = facePos(sg * x, Y, 0.003);
        c.rotateY(Math.PI);
        parts.add('black', c, M(px, py, pz));
      }
    }
    // ---------------------------------------------------- LED sign bezel (0.03 m) around the 1.72 x 0.32 matrix
    parts.add('satin', facePatch({ xs: colsBetween(0.9, -0.9, 8), y0: 2.335, y1: 2.705, nv: 1, off: 0.0012 }));
    // ---------------------------------------------------- lamp units
    this.lampUnits(parts);
    // ---------------------------------------------------- mirrors, wipers
    this.mirrors(parts);
  },

  lampUnits(parts) {
    // columns for the magnitude interval [a, b] on side sg, running from the viewer's left to the right
    const span = (sg, a, b, n) => (sg > 0 ? colsBetween(b, a, n) : colsBetween(-a, -b, n));
    for (const sg of [1, -1]) {
      // headlamp 0.27 x 0.14: white recess, dark frame, two-cell lens (outer cell towards the corner)
      parts.add('paint', facePatch({ xs: span(sg, 0.92, 1.26, 8), y0: 0.62, y1: 0.8, nv: 2, off: 0.0015 }));
      parts.add('lampFrame', facePatch({ xs: span(sg, 0.935, 1.235, 8), y0: 0.635, y1: 0.785, nv: 2, off: 0.003 }));
      const uv = sg > 0 ? [0, 0, 1, 1] : [1, 0, 0, 1];
      parts.add('headlamp', facePatch({ xs: span(sg, 0.95, 1.22, 12), y0: 0.64, y1: 0.78, nv: 2, off: 0.0055, uv }));
      parts.add('lensClear', facePatch({ xs: span(sg, 0.95, 1.22, 12), y0: 0.64, y1: 0.78, nv: 2, off: 0.009 }));
      // indicator / fog unit 0.25 x 0.075: clear ribbed inner 60 %, amber outer end
      parts.add('lampFrame', facePatch({ xs: span(sg, 0.905, 1.185, 8), y0: 0.485, y1: 0.58, nv: 1, off: 0.003 }));
      parts.add('ribLens', facePatch({ xs: span(sg, 0.92, 1.07, 6), y0: 0.49, y1: 0.575, nv: 1, off: 0.0055 }));
      parts.add(sg > 0 ? 'indicatorR' : 'indicatorL', facePatch({ xs: span(sg, 1.07, 1.17, 4), y0: 0.49, y1: 0.575, nv: 1, off: 0.0055 }));
    }
  },

  mirrors(parts) {
    const z0 = FRONT_Z;
    // ---- RIGHT: ram's horn on a swept arm (out and forward, then down into the bean-shaped head)
    {
      const path = [[1.17, 2.58, z0 + 0.34], [1.3, 2.6, z0 + 0.21], [1.45, 2.585, z0 + 0.02], [1.58, 2.53, z0 - 0.2], [1.655, 2.45, z0 - 0.37], [1.64, 2.37, z0 - 0.44]];
      // the arm flares into a hood that blends into the head
      for (const g of sweep(path, (t) => [0.034 + 0.07 * t * t, 0.056 + 0.05 * t * t], 36, 16)) parts.add('satin', g);
      parts.add('satin', box(0.15, 0.13, 0.18, 0.035), M(1.2, 2.57, z0 + 0.3)); // root boss on the corner
      const head = superEllipsoid(0.17, 0.33, 0.105, 0.55, 0.8, 24, 16);
      const hp = head.attributes.position;
      for (let i = 0; i < hp.count; i++) hp.setX(i, hp.getX(i) * lerp(0.8, 1.0, (0.33 - hp.getY(i)) / 0.66)); // narrower at the top, bean-like
      head.computeVertexNormals();
      const hm = new THREE.Matrix4().makeRotationZ(-0.08).premultiply(new THREE.Matrix4().makeRotationY(-0.12)).setPosition(1.62, 2.09, z0 - 0.45);
      parts.add('satin', head, hm);
      // main mirror (upper) and wide-angle mirror (lower) in one head
      const g1 = new THREE.PlaneGeometry(0.27, 0.34); g1.translate(0, 0.1, 0.1055);
      const g2 = new THREE.PlaneGeometry(0.23, 0.17); g2.translate(0, -0.2, 0.1);
      parts.add('mirror', g1, hm);
      parts.add('mirror', g2, hm);
    }
    // ---- LEFT: compact tall two-segment box bolted to the A-pillar corner (no arm)
    {
      const cx = -1.34, zc = z0 + 0.1;
      const ry = 0.12; // faces the driver slightly
      const mt = (y) => new THREE.Matrix4().makeRotationY(ry).setPosition(cx, y, zc);
      parts.add('satin', new RoundedBoxGeometry(0.25, 0.42, 0.14, 3, 0.04), mt(2.25));
      parts.add('satin', new RoundedBoxGeometry(0.23, 0.26, 0.13, 3, 0.035), mt(1.91));
      const g1 = new THREE.PlaneGeometry(0.2, 0.36); g1.translate(0, 0, 0.0715);
      const g2 = new THREE.PlaneGeometry(0.18, 0.2); g2.translate(0, 0, 0.0665);
      parts.add('mirror', g1, mt(2.25));
      parts.add('mirror', g2, mt(1.91));
      // bracket to the pillar
      parts.add('satin', box(0.12, 0.5, 0.28, 0.02), M(-1.255, 2.12, zc + 0.19));
    }
  },

  /** Tandem wipers: pivots on the black base band, parked per spec 3.9. */
  buildWipers() {
    this.wipers = [];
    const defs = [
      { x: 1.02, y: 1.255, len: 0.95, park: Math.PI, sweep: -1 }, // passenger: parked horizontal towards the centre
      { x: -0.72, y: 1.245, len: 1.0, park: 0.33, sweep: 1 }, // driver: parked rising about 19 degrees towards bus-right
    ];
    const rake = Math.atan(FACE.rake / (FACE.glassTop - FACE.bandTop));
    for (const d of defs) {
      const tilt = new THREE.Group();
      const zGlass = FRONT_Z + faceS(Math.abs(d.x), d.y);
      const zArm = FRONT_Z + faceS(0.3, d.y) + 0.028; // arm plane over the flat part of the glass
      tilt.position.set(d.x, d.y, zArm);
      tilt.rotation.x = rake; // plane of the glass
      const L = d.len;
      const p = new Parts();
      p.add('satin', box(L, 0.02, 0.014), M(L / 2, 0, 0));
      p.add('satin', box(L * 0.82, 0.016, 0.024), M(L * 0.6, -0.022, -0.004));
      p.add('satin', new THREE.CylinderGeometry(0.026, 0.026, 0.034, 12).rotateX(Math.PI / 2), M(0, 0, 0));
      const piv = new THREE.Group();
      piv.add(p.build(this.mats, { castShadow: false, receiveShadow: false }));
      piv.rotation.z = d.park;
      tilt.add(piv);
      // spindle from the glass to the arm plane
      const sp = new Parts();
      sp.add('satin', new THREE.CylinderGeometry(0.018, 0.018, Math.max(0.01, zArm - zGlass + 0.02), 10).rotateX(Math.PI / 2), M(d.x, d.y, (zArm + zGlass) / 2 - 0.01));
      this.front.add(tilt, sp.build(this.mats, { castShadow: false }));
      this.wipers.push({ piv, park: d.park, sweep: d.sweep });
    }
  },
};

export { facePatch, facePos, colsBetween };
