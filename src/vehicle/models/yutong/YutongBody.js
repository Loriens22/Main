// Body of the Yutong ZK6126HGA: orange lower side panels with wheel arches, the black glazed band, roof with its
// pods, front and rear ends, door portals, underbody. Mixed into YutongModel (`this`). Numbers: consts.js.
import * as THREE from 'three';
import { K } from './consts.js';
import { M, Parts, basis, box, extrude, loftRings, surfaceGrid, lerp, clamp } from '../../BusGeom.js';
import { frontPatch, rearPatch, frontS, rearD, hwAt, FCOLS, RCOLS, colsBetween, frontPos, rearPos } from './surfaces.js';
import { ORN, decUV } from './YutongTextures.js';

const HW = K.hw;
const FZ = K.frontZ, RZ = K.rearZ;
export const ROOF_Z0 = FZ + 0.72; // roof extrusion starts here (the front cap covers the corner before it)
export const ROOF_Z1 = RZ - 0.56; // ... and ends here
const BAND_Z0 = FZ + 0.62; // glazed band (right and left) starts here; the front corner fill covers the rest
const BAND_Z1 = RZ - 0.52;

/** Arch-cut panel shape in (z, y): lower side panel between z0..z1 with circular wheel arches. */
function panelShape(z0, z1, arches, y0 = K.skirtY, y1 = K.beltY) {
  const sh = new THREE.Shape();
  const R = K.archR, cy = K.wheelR;
  const dy = cy - y0, dx = Math.sqrt(R * R - dy * dy), ang = Math.asin(dy / R);
  sh.moveTo(z0, y0);
  for (const a of [...arches].sort((p, q) => p - q)) {
    if (a - dx < z0 || a + dx > z1) continue;
    sh.lineTo(a - dx, y0);
    sh.absarc(a, cy, R, Math.PI + ang, -ang, true);
    sh.lineTo(a + dx, y0);
  }
  sh.lineTo(z1, y0);
  sh.lineTo(z1, y1);
  sh.lineTo(z0, y1);
  sh.closePath();
  return sh;
}

/** Complement of the (sorted) ranges inside [a, b]. */
export function gaps(a, b, ranges) {
  const out = [];
  let c = a;
  for (const [r0, r1] of [...ranges].sort((p, q) => p[0] - q[0])) {
    if (r0 > c + 1e-3) out.push([c, Math.min(r0, b)]);
    c = Math.max(c, r1);
  }
  if (b > c + 1e-3) out.push([c, b]);
  return out;
}

export const BodyMixin = {
  /** All static exterior geometry, merged per material. */
  buildExterior() {
    const p = new Parts();
    this.frontEnd(p);
    this.rearEnd(p);
    this.sideBodies(p);
    this.roofBody(p);
    this.roofPods(p);
    this.underbody(p);
    this.lamps(p);
    this.mirrors(p);
    const grp = this.finish(p);
    this.front.add(grp);
    this.exteriorGroup = grp;
    this.addWheels();
    for (const d of K.doors) this.addDoor(this.front, d);
    this.buildWipers();
  },

  /* ------------------------------------------------------------------ front end */
  frontEnd(p) {
    const lite = this.lite;
    const R = K.rf;
    const ys = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
    // orange bumper module: rows follow the tuck at the bottom
    p.add('paint', frontPatch({ xs: FCOLS, y0: 0.37, y1: K.bumperTop, rows: [0, 0.14, 0.3, 0.55, 0.8, 1] }));
    // black mask around the windscreen: base seam, header behind the LED sign and the A-pillar strips; the
    // glass sits in the opening (the driver must see out: no panel behind the glass)
    p.add('black', frontPatch({ xs: FCOLS, y0: K.bumperTop, y1: 1.2, nv: 1 }));
    p.add('black', frontPatch({ xs: FCOLS, y0: 2.56, y1: K.winTopY, nv: 2 }));
    p.add('black', frontPatch({ xs: colsBetween(HW, 0.89 * HW, 3), y0: 1.2, y1: 2.56, nv: 8 }));
    p.add('black', frontPatch({ xs: colsBetween(-0.89 * HW, -HW, 3), y0: 1.2, y1: 2.56, nv: 8 }));
    // windscreen glass: panoramic pane, corners rounded off, the LED sign sits behind its upper part
    const gw = (Y) => (Y > 2.5 ? 1 - (Y - 2.5) * 0.4 : Y < 1.2 ? 1 - (1.2 - Y) * 0.2 : 1) * 0.935 * HW;
    const gwScale = (Y) => (gw(Y) / HW);
    const glass = () => frontPatch({ xs: colsBetween(HW, -HW, 40), y0: 1.16, y1: 2.6, nv: 14, off: 0.002, xScale: gwScale });
    p.add('windscreen', glass());
    p.add('windscreenIn', glass());
    // orange roof rim above the mask (rounded edge)
    p.add('roofPaint', frontPatch({ xs: FCOLS, y0: K.winTopY, y1: K.roofY, nv: 4, scale: true }));
    // flat cap behind the rim up to the roof extrusion
    {
      const cols = FCOLS;
      const cap = surfaceGrid(cols.length - 1, 1, (u, v) => {
        const q = cols[Math.round(u * (cols.length - 1))];
        const x = (q * hwAt(K.roofY)) / HW;
        const z0 = FZ + frontS(Math.abs(q), K.roofY);
        return [x, K.roofY, lerp(z0, Math.max(z0, ROOF_Z0), v)];
      });
      p.add('roofPaint', cap);
    }
    // front corners filled in black between the end patch and the band
    for (const side of [1, -1]) {
      const g = surfaceGrid(1, 6, (u, v) => {
        const Y = lerp(K.beltY, K.winTopY, v);
        const z0 = FZ + frontS(HW, Y);
        return [side * (HW - 0.001), Y, lerp(z0, BAND_Z0, u)];
      }, { flip: side > 0 });
      p.add('black', g);
    }
    // bumper details -------------------------------------------------------
    // horizontal crease and the vertical seams of the corner modules
    p.add('black', frontPatch({ xs: colsBetween(0.9, -0.9, 8), y0: 0.855, y1: 0.866, nv: 1, off: 0.0008 }));
    for (const sg of [1, -1]) {
      const g = surfaceGrid(1, 6, (u, v) => {
        const Y = lerp(0.38, 0.86, v);
        const x = sg * lerp(0.74, 0.92, v) + (u - 0.5) * 0.004;
        return frontPos(x, Y, 0.0008);
      }, { flip: sg < 0 });
      p.add('black', g);
    }
    // Yutong roundel
    p.add('decals', frontPatch({ xs: colsBetween(0.075, -0.075, 4), y0: 0.88, y1: 1.03, nv: 1, off: 0.003, uv: decUV('badge') }));
    // blue pictograms (pedestrian, wheelchair) above the right headlamp and the dotted row
    ['walk', 'wheel'].forEach((k, i) => {
      const c = 1.0 - i * 0.14;
      p.add('decals', frontPatch({ xs: colsBetween(c + 0.06, c - 0.06, 6), y0: 0.88, y1: 1.0, nv: 1, off: 0.003, uv: decUV(k) }));
    });
    // front plate on a black holder, low in the centre
    p.add('black', frontPatch({ xs: colsBetween(0.275, -0.275, 4), y0: 0.38, y1: 0.54, nv: 1, off: 0.004 }));
    p.add('plate', frontPatch({ xs: colsBetween(0.26, -0.26, 4), y0: 0.395, y1: 0.507, nv: 1, off: 0.0055 }));
    // fleet number at the lower right of the screen
    p.add('decals', frontPatch({ xs: colsBetween(-0.55, -0.9, 6), y0: 0.95, y1: 1.05, nv: 1, off: 0.003, uv: decUV('fleet') }));
    void lite;
    void R;
    void ys;
  },

  /* ------------------------------------------------------------------ rear end */
  rearEnd(p) {
    const lite = this.lite;
    const Y0 = K.skirtY + 0.08;
    // upper body, orange, from the bumper top to the roof edge; the black panel (engine louvres + window) is cut out of it
    const PX = 1.04, PBOT = 1.745;
    const cut = (x0, x1) => RCOLS.filter((x) => x >= x0 - 1e-6 && x <= x1 + 1e-6);
    p.add('paint', rearPatch({ xs: RCOLS, y0: 0.8, y1: PBOT, rows: [0, 0.2, 0.4, 0.6, 0.8, 1] }));
    for (const [a, b] of [[-HW, -PX], [PX, HW]]) {
      const xs = [...new Set([a, ...cut(a, b), b])].sort((u, v) => u - v);
      p.add('paint', rearPatch({ xs, y0: PBOT, y1: K.winTopY, nv: 4 }));
    }
    // rear window: dark tinted glass in a black frame (the saloon's rear window looks out through it)
    p.add('black', rearPatch({ xs: colsBetween(-PX, PX, 10), y0: PBOT, y1: PBOT + 0.06, nv: 1 }));
    p.add('black', rearPatch({ xs: colsBetween(-PX, PX, 10), y0: 2.69, y1: K.winTopY, nv: 1 }));
    p.add('black', rearPatch({ xs: colsBetween(-PX, -0.96, 2), y0: PBOT + 0.06, y1: 2.69, nv: 4 }));
    p.add('black', rearPatch({ xs: colsBetween(0.96, PX, 2), y0: PBOT + 0.06, y1: 2.69, nv: 4 }));
    p.add('glassOut', rearPatch({ xs: colsBetween(-0.96, 0.96, 10), y0: PBOT + 0.06, y1: 2.69, nv: 4, off: 0.002 }));
    p.add('glassIn', rearPatch({ xs: colsBetween(-0.96, 0.96, 10), y0: PBOT + 0.06, y1: 2.69, nv: 4, off: 0.002 }));
    // white leaf ornaments over the right half of the lower rear panel (ref14), like the sides'
    if (this.orn) {
      p.add('ornaments', rearPatch({ xs: colsBetween(-0.15, 1.02, 6), y0: 1.24, y1: PBOT - 0.03, nv: 2, off: 0.004, uv: this.orn.uv(0, 0, 0.62) }));
      p.add('ornaments', rearPatch({ xs: colsBetween(0.35, 1.02, 4), y0: 0.86, y1: 1.3, nv: 1, off: 0.004, uv: this.orn.uv(3, 0, 0.36) }));
    }
    // step bumper: slightly proud of the body, rounded
    p.add('paint', rearPatch({ xs: RCOLS, y0: 0.37, y1: 0.8, nv: 3, back: -0.05 }));
    p.add('roofPaint', rearPatch({ xs: RCOLS, y0: K.winTopY, y1: K.roofY, nv: 4, scale: true }));
    // flat cap between the roof extrusion and the rear edge
    {
      const cols = RCOLS;
      const cap = surfaceGrid(cols.length - 1, 1, (u, v) => {
        const q = cols[Math.round(u * (cols.length - 1))];
        const x = (q * hwAt(K.roofY)) / HW;
        const zEdge = RZ - rearD(Math.abs(q), K.roofY);
        return [x, K.roofY, lerp(ROOF_Z1, zEdge, v)];
      });
      p.add('roofPaint', cap);
    }
    // rear corner fills (black band) between the end patch and the band
    for (const side of [1, -1]) {
      const g = surfaceGrid(1, 6, (u, v) => {
        const Y = lerp(K.beltY, K.winTopY, v);
        const z0 = RZ - rearD(HW, Y);
        return [side * (HW - 0.001), Y, lerp(BAND_Z1, z0, u)];
      }, { flip: side > 0 });
      p.add('black', g);
    }
    // black upper panel: engine louvres (left half) and the rear window (right half)
    const xl0 = -1.03, xl1 = -0.055, xw0 = -0.04, xw1 = 1.03;
    const top = 2.7, bot = 1.745;
    p.add('louvre', rearPatch({ xs: colsBetween(xl0, xl1, 6), y0: bot, y1: top, nv: 2, off: 0.003, uv: [0, 0.02, 1, 0.98] }));
    const win = () => rearPatch({ xs: colsBetween(xw0, xw1, 12), y0: bot, y1: top, nv: 4, off: 0.006 });
    p.add('glassOut', win());
    p.add('glassIn', win());
    // two black grooves with an orange rib between them
    p.add('black', rearPatch({ xs: colsBetween(-1.0, 1.0, 8), y0: 1.725, y1: 1.74, nv: 1, off: 0.002 }));
    p.add('black', rearPatch({ xs: colsBetween(-1.0, 1.0, 8), y0: 1.655, y1: 1.67, nv: 1, off: 0.002 }));
    p.add('black', rearPatch({ xs: colsBetween(-1.0, 1.0, 8), y0: 1.6, y1: 1.61, nv: 1, off: 0.002 }));
    // lower slot grid (radiator intake), lettering, coat of arms, plate recess
    p.add('decals', rearPatch({ xs: colsBetween(-0.77, 0.75, 10), y0: 1.27, y1: 1.55, nv: 1, off: 0.003, uv: decUV('slots') }));
    p.add('decals', rearPatch({ xs: colsBetween(-0.88, -0.6, 4), y0: 1.065, y1: 1.115, nv: 1, off: 0.003, uv: decUV('euro6') }));
    p.add('decals', rearPatch({ xs: colsBetween(-0.96, -0.4, 4), y0: 0.885, y1: 0.935, nv: 1, off: 0.003, uv: decUV('model') }));
    p.add('decals', rearPatch({ xs: colsBetween(0.58, 0.94, 4), y0: 0.885, y1: 0.935, nv: 1, off: 0.003, uv: decUV('brand') }));
    p.add('decals', rearPatch({ xs: colsBetween(-0.15, 0.15, 4), y0: 0.82, y1: 1.16, nv: 1, off: 0.003, uv: decUV('arms') }));
    // plate recess and plate
    p.add('black', rearPatch({ xs: colsBetween(-0.33, 0.3, 4), y0: 0.46, y1: 0.72, nv: 1, off: 0.003, back: -0.05 }));
    p.add('paint', rearPatch({ xs: colsBetween(-0.315, 0.285, 4), y0: 0.475, y1: 0.705, nv: 1, off: 0.005, back: -0.05 }));
    p.add('plate', rearPatch({ xs: colsBetween(-0.27, 0.27, 4), y0: 0.53, y1: 0.642, nv: 1, off: 0.0075, back: -0.05 }));
    // lamp pods: lighter outline around the three round lamps, both corners
    for (const sg of [-1, 1]) {
      const xc = sg * 1.1;
      p.add('lampFrame', rearPatch({ xs: colsBetween(xc - 0.1, xc + 0.1, 4), y0: 0.84, y1: 1.52, nv: 1, off: 0.002 }));
    }
    // fleet number on the right of the lower panel (small, black)
    void lite;
    void Y0;
    void loftRings;
    void extrude;
    void M;
    void basis;
    void box;
    void clamp;
    void rearPos;
    void ORN;
  },

  /* ------------------------------------------------------------------ sides */
  sideBodies(p) {
    const lite = this.lite;
    const axles = [K.axleF, K.axleR];
    for (const side of [1, -1]) {
      const doors = side > 0 ? K.doors.map((d) => [d.z0 - 0.08, d.z1 + 0.08]) : [];
      const zA = FZ + 0.3, zB = RZ - rearD(HW, K.beltY * 0.5) - 0.0;
      // ---- lower orange panels with arches (gaps between doors)
      for (const [a, b] of gaps(zA, zB - 0.12, doors)) {
        if (b - a < 0.15) continue;
        let g, mtx;
        if (side > 0) {
          g = extrude(panelShape(a, b, axles), 0.035, 0.006);
          mtx = basis([0, 0, 1], [0, 1, 0], [-1, 0, 0], [HW - 0.006, 0, 0]);
        } else {
          g = extrude(panelShape(-b, -a, axles.map((v) => -v)), 0.035, 0.006);
          mtx = basis([0, 0, -1], [0, 1, 0], [1, 0, 0], [-HW + 0.006, 0, 0]);
        }
        p.add('paint', g, mtx);
        // dark sill behind the panel between the arches
        for (const [c, e] of gaps(a, b, axles.map((x) => [x - K.archR - 0.02, x + K.archR + 0.02]))) {
          if (e - c > 0.05) p.add('underbody', box(0.3, 0.14, e - c), M(side * (HW - 0.17), K.skirtY + 0.07, (c + e) / 2));
        }
      }
      // ---- wheel arch trims: thin black ring around each opening and the dark liner behind it
      for (const az of axles) {
        const ring = new THREE.RingGeometry(K.archR - 0.012, K.archR + 0.035, 36, 1, 0.02, Math.PI - 0.04);
        ring.translate(0, 0, 0);
        const rm = new THREE.Matrix4();
        // ring lies in the xy plane (faces +z): rotate so it faces +x (right) or -x (left), centred on the axle at hub height
        if (side > 0) rm.makeRotationY(Math.PI / 2); else rm.makeRotationY(-Math.PI / 2);
        rm.setPosition(side * (HW + 0.0035), K.wheelR, az);
        // RingGeometry spans angles [0, PI] (upper half) in its local xy plane; after the rotation the local x runs along -z (right) / +z (left): mirror-symmetric, so fine
        p.add('matteBlack', ring, rm);
        const phi = Math.asin((K.wheelR - K.skirtY) / (K.archR - 0.01));
        // the closing disc sits 2 cm outboard of the saloon's wheel-housing wall (|x| 0.73): coplanar, the two
        // z-fought and the disc's triangle fan showed through the podium side inside the bus
        const liner = new THREE.CylinderGeometry(K.archR - 0.01, K.archR - 0.01, 0.48, 28, 1, true, -phi, Math.PI + 2 * phi);
        liner.rotateZ(Math.PI / 2);
        p.add('underbody', liner, M(side * (HW - 0.26), K.wheelR, az));
        const disc = new THREE.CircleGeometry(K.archR - 0.01, 28, -phi, Math.PI + 2 * phi);
        disc.rotateY(Math.PI / 2);
        p.add('underbody', disc, M(side * (HW - 0.5), K.wheelR, az));
      }
      // ---- glazed band ---------------------------------------------------
      const panes = side > 0 ? K.panesR : K.panesL;
      const doorR = side > 0 ? K.doors.map((d) => [d.z0 - 0.1, d.z1 + 0.1]) : [];
      const bandMid = (BAND_Z0 + BAND_Z1) / 2;
      const SILL = K.beltY + 0.04;
      // sill strip and the opaque header band above the glass
      p.add('black', box(0.04, SILL - K.beltY, BAND_Z1 - BAND_Z0), M(side * (HW - 0.02), (K.beltY + SILL) / 2, bandMid));
      p.add('black', box(0.04, K.winTopY - K.glassTopY, BAND_Z1 - BAND_Z0), M(side * (HW - 0.02), (K.glassTopY + K.winTopY) / 2, bandMid));
      const holes = [...panes, ...doorR];
      for (const [a, b] of gaps(BAND_Z0, BAND_Z1, holes)) {
        if (b - a > 0.005) p.add('black', box(0.04, K.glassTopY - SILL, b - a), M(side * (HW - 0.02), (SILL + K.glassTopY) / 2, (a + b) / 2));
      }
      for (const [a, b] of panes) {
        const mk = () => surfaceGrid(1, 1, (u, v) => [side * (HW - 0.003), lerp(SILL, K.glassTopY, v), lerp(a, b, u)], { flip: side > 0 });
        p.add('glassOut', mk());
        p.add('glassIn', mk());
      }
      // door portals (right side)
      if (side > 0) for (const d of K.doors) this.doorPortal(p, d);
      // ---- orange sill under the band is the panel top; side marker lamps
      for (const z of [-7.9, -4.3, -2.3, 0.7, 3.1]) {
        if (side > 0 && K.doors.some((d) => z > d.z0 - 0.15 && z < d.z1 + 0.15)) continue;
        p.add('marker', box(0.012, 0.045, 0.1), M(side * (HW + 0.004), 0.5, z));
      }
      void lite;
    }
    this.sideDecals(p);
  },

  /** Door frame: black jambs and header, stainless threshold and the dark step behind it. */
  doorPortal(p, d) {
    const w = d.z1 - d.z0;
    const x = HW - 0.035;
    const jf = d.id === 1 ? 0.1 : 0.07, jr = 0.07, top = K.doorTopY;
    p.add('black', box(0.07, top - K.skirtY - 0.02, jf), M(x, (top + K.skirtY + 0.02) / 2, d.z0 - jf / 2));
    p.add('black', box(0.07, top - K.skirtY - 0.02, jr), M(x, (top + K.skirtY + 0.02) / 2, d.z1 + jr / 2));
    p.add('black', box(0.07, K.winTopY - top + 0.02, w + jf + jr), M(x, (top - 0.02 + K.winTopY) / 2, (d.z0 - jf + d.z1 + jr) / 2));
    p.add('chrome', box(0.14, 0.03, w), M(HW - 0.07, 0.315, (d.z0 + d.z1) / 2));
    p.add('rubber', box(0.3, 0.02, w), M(HW - 0.17, K.floorY - 0.01, (d.z0 + d.z1) / 2));
    // door sensor dome above the opening
    p.add('satin', new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), M(HW + 0.0, K.doorTopY + 0.12, (d.z0 + d.z1) / 2));
  },

  /** Ornament and sticker decals on the lower panels. */
  sideDecals(p) {
    const rnd = this.ornUV;
    const strip = (side, z0, z1, row, flipU = false, dy = 0) => {
      // hanging band: width z1 - z0 (<= ORN.w), top at the belt line
      const w = z1 - z0;
      const u1 = clamp(w / ORN.w, 0, 1);
      const uv = this.orn.uv(row, flipU ? u1 : 0, flipU ? 0 : u1);
      const x = side * (HW + 0.0022);
      const g = surfaceGrid(1, 1, (u, v) => [x, lerp(K.beltY - ORN.h + dy, K.beltY + dy, v), side > 0 ? lerp(z1, z0, u) : lerp(z0, z1, u)], { uvRect: uv, flip: side < 0 });
      p.add('ornaments', g);
    };
    void rnd;
    // right (door side): panels between doors
    strip(1, 2.45, 3.2, 2, false); // rear corner
    strip(1, -1.62, 0.9, 0, false);
    strip(1, -0.6, 0.9, 1, true);
    strip(1, -6.8, -5.0, 1, false);
    strip(1, -5.0, -3.15, 2, true);
    // left
    strip(-1, 2.45, 3.2, 3, true);
    strip(-1, -0.5, 1.4, 2, false);
    strip(-1, -2.4, -0.5, 0, true);
    strip(-1, -4.3, -2.4, 1, false);
    strip(-1, -6.2, -4.3, 3, false);
    // Sofia coat of arms on the lower panel between the front door and the middle door (right) and the front left panel
    const arms = (side, zc) => {
      const x = side * (HW + 0.0035);
      p.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(0.47, 0.99, v), zc + (side > 0 ? 0.5 - u : u - 0.5) * 0.42], { uvRect: decUV('arms'), flip: side < 0 }));
    };
    arms(1, -4.67);
    arms(-1, -4.1);
    // blue stickers near the door edges
    const sticker = (side, zc, y) => {
      const x = side * (HW + 0.0035);
      p.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(y, y + 0.17, v), zc + (side > 0 ? 0.5 - u : u - 0.5) * 0.08], { uvRect: decUV('sticker'), flip: side < 0 }));
    };
    sticker(1, -3.3, 1.06);
    sticker(1, -1.55, 1.06);
    sticker(1, 0.8, 1.06);
    sticker(-1, -4.6, 1.06);
  },

  /* ------------------------------------------------------------------ roof */
  roofBody(p) {
    const sh = new THREE.Shape();
    const t = K.roofY - K.winTopY;
    sh.moveTo(HW, K.winTopY - 0.02);
    sh.lineTo(HW, K.winTopY);
    sh.absarc(HW - t, K.winTopY, t, 0, Math.PI / 2, false);
    sh.lineTo(-(HW - t), K.roofY);
    sh.absarc(-(HW - t), K.winTopY, t, Math.PI / 2, Math.PI, false);
    sh.lineTo(-HW, K.winTopY - 0.02);
    sh.closePath();
    p.add('roofPaint', extrude(sh, ROOF_Z1 - ROOF_Z0, 0), M(0, 0, ROOF_Z0));
  },

  /** Long CNG pod (front-middle), rear intake pod, white A/C hatch at the front. */
  roofPods(p) {
    const lite = this.lite;
    // pod z-range measured on ref13: -5.87 .. -3.08, height 0.23 above the roof
    this.pod(p, -5.9, -3.05, 1.95, K.podY - K.roofY, 0.13, 0.5, 0.3);
    // rear pod: z 2.1 .. 3.26, taller, steeper sides, narrower top
    this.pod(p, 2.1, 3.0, 2.0, K.rearPodY - K.roofY, 0.17, 0.3, 0.55);
    // front A/C hatch (white, low)
    p.add('white', box(0.9, 0.05, 0.75, 0.02), M(0, K.roofY + 0.02, -7.4));
    // vent grille on the long pod
    if (!lite) p.add('vent', surfaceGrid(1, 1, (u, v) => [lerp(0.5, -0.5, u), K.podY + 0.0015, lerp(-4.35, -3.75, v)], { uvRect: [0, 0, 3, 2] }));
  },

  /** Smooth pod: rounded cross-section lofted along z with sloped nose and tail (z0 < z1). */
  pod(p, z0, z1, W, H, R, nose, tail) {
    const base = K.roofY - 0.004;
    const prof = [];
    const n = 5, hx = W / 2;
    prof.push([hx, 0]);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      prof.push([hx - R + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    for (let i = 1; i < 4; i++) prof.push([lerp(hx - R, -(hx - R), i / 4), H]);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * (Math.PI / 2);
      prof.push([-(hx - R) + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    prof.push([-hx, 0]);
    const zs = [];
    const nn = 6, nt = 6;
    for (let i = 0; i <= nn; i++) zs.push([z0 + (i / nn) * nose, Math.sqrt(1 - Math.pow(1 - i / nn, 2))]);
    for (let i = 0; i <= nt; i++) zs.push([z1 - tail + (i / nt) * tail, Math.sqrt(Math.max(0, 1 - Math.pow(i / nt, 2.2)))]);
    const rings = zs.map(([z, hs]) => {
      const h = Math.max(0.03, hs), ws = 0.88 + 0.12 * hs;
      return prof.map(([x, y]) => [x * ws, base + y * h, z]);
    });
    for (const g of loftRings(rings)) p.add('roofPaint', g);
  },

  /* ------------------------------------------------------------------ underbody */
  underbody(p) {
    const zA = FZ + 0.5, zB = RZ - 0.5;
    p.add('underbody', box(1.9, 0.12, zB - zA), M(0, K.floorY - 0.075, (zA + zB) / 2)); // below the saloon floor
    // axle beams and the rear differential housing, visible below the skirts
    // portal axles: the beams run under the podiums only, the dropped centre stays below the low aisle floor
    for (const sg of [-1, 1]) {
      // axle stubs end inside the wheel hubs (they stuck out of the modelled hub caps)
      p.add('underbody', new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10).rotateZ(Math.PI / 2), M(sg * 0.72, K.wheelR, K.axleF));
      p.add('underbody', new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10).rotateZ(Math.PI / 2), M(sg * 0.7, K.wheelR, K.axleR));
    }
    p.add('underbody', box(1.5, 0.12, 0.2), M(0, 0.2, K.axleF));
    p.add('underbody', new THREE.SphereGeometry(0.14, 12, 8), M(0, 0.17, K.axleR));
    // front and rear dark valances below the bumpers
    p.add('underbody', box(2.0, 0.14, 0.4), M(0, 0.4, FZ + 0.35));
    p.add('underbody', box(2.0, 0.14, 0.4), M(0, 0.4, RZ - 0.4));
  },
};

