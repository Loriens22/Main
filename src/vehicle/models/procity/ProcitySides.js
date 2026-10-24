// Sides, roof and pods of the BMC Procity 12 CNG: white lower panels with wheel arches, the black glazed
// band (belt 1.30, glass to 2.70), three double doors on the right, blade-fringe livery sprites, the roof
// crown, the CNG cylinder housing over the front half and the A/C and vent boxes behind it.
// Coordinates are the rigid frame (z backwards, origin at the rear axle); photos: ref06/07/08/11.
import * as THREE from 'three';
import { M, basis, box, extrude, loftRings, skirtShape, surfaceGrid, tiltBox, lerp, sweep } from '../../BusGeom.js';
import spec from './spec.js';
import { HW, FRONT_Z, REAR_Z, hwAt, ROOF_HW, REAR_ROOF_END } from './ProcityHull.js';

const D = spec.dims;
const BELT = D.beltY, WTOP = D.windowTopY, ROOF = D.roofY;
const SILL_TOP = BELT + 0.045;
const TUMBLE = Math.atan(0.015 / 1.46);
const ARCH_R = 0.6;
const AXLES = [-D.wb1, 0];
const CORNER_R = 0.45;

/** Glass panes (z ranges on the black band) per side; the doors are separate. */
export const PANES = {
  right: [[-6.46, -5.38], [-5.32, -4.2], [-2.68, -1.52], [-1.46, -0.3], [-0.24, 0.7], [2.2, 3.0]],
  left: [[-7.93, -6.72], [-6.66, -5.42], [-5.36, -4.14], [-4.08, -2.86], [-2.8, -1.58], [-1.52, -0.3], [-0.24, 0.98], [1.04, 2.08]],
};
const HOPPERS = { // [z0, z1, y0, y1]
  right: [[-5.2, -4.3, 2.18, 2.58], [-1.38, -0.4, 2.18, 2.58]],
  left: [[-6.55, -5.55, 2.18, 2.58], [-4.0, -3.0, 2.18, 2.58], [-2.7, -1.7, 2.18, 2.58], [-1.4, -0.4, 2.18, 2.58], [1.15, 1.95, 2.18, 2.58]],
};
const LOUVRE_LEFT = [2.14, 3.02]; // engine intake panel in the last left bay

/** Complement of the (sorted) ranges inside [a, b]. */
function gaps(a, b, ranges) {
  const out = [];
  let c = a;
  for (const [r0, r1] of [...ranges].sort((p, q) => p[0] - q[0])) {
    if (r0 > c + 1e-3) out.push([c, Math.min(r0, b)]);
    c = Math.max(c, r1);
  }
  if (b > c + 1e-3) out.push([c, b]);
  return out;
}

export const SideMixin = {
  sideBody(parts) {
    const lite = this.lite;
    const z0 = FRONT_Z + 0.5, z1 = REAR_Z - CORNER_R;
    this.L = { z0, z1 };
    const dRanges = spec.doors.map((d) => [d.z0 - 0.11, d.z1 + 0.08]);
    for (const side of [1, -1]) {
      const name = side > 0 ? 'right' : 'left';
      const doorRanges = side > 0 ? dRanges : [];
      // ---- lower white panels with R 0.60 wheel arches
      const segs = gaps(z0, z1, doorRanges);
      for (const [a, b] of segs) {
        if (b - a < 0.12) continue;
        let g, mtx;
        if (side > 0) {
          g = extrude(skirtShape(a, b, AXLES, D.skirtY, BELT), 0.035, 0.006);
          mtx = basis([0, 0, 1], [0, 1, 0], [-1, 0, 0], [HW - 0.006, 0, 0]);
        } else {
          g = extrude(skirtShape(-b, -a, AXLES.map((v) => -v), D.skirtY, BELT), 0.035, 0.006);
          mtx = basis([0, 0, -1], [0, 1, 0], [1, 0, 0], [-HW + 0.006, 0, 0]);
        }
        parts.add('paint', g, mtx);
        for (const [c, e] of gaps(a, b, AXLES.map((x) => [x - 0.6, x + 0.6]))) {
          if (e - c > 0.05) parts.add('underbody', box(0.3, 0.14, e - c), M(side * (HW - 0.17), D.skirtY + 0.07, (c + e) / 2));
        }
        // livery fringe along the top of every white panel
        this.fringe(parts, side, a, b, name);
      }
      // ---- black glazed band: sill, header strip, backing between the panes, glass panes
      const bandMid = (z0 + z1) / 2;
      const tilt = -side * TUMBLE;
      const xSill = hwAt(BELT + 0.02) - 0.02;
      parts.add('black', box(0.04, SILL_TOP - BELT, z1 - z0), M(side * xSill, (BELT + SILL_TOP) / 2, bandMid));
      parts.add('black', tiltBox(0.04, 0.085, z1 - z0, side * (hwAt(2.72) - 0.02), 2.72, bandMid, tilt));
      const louvre = side < 0 ? [LOUVRE_LEFT] : [];
      const panes = PANES[name];
      const holes = [...panes.map((p) => [p[0], p[1]]), ...doorRanges, ...louvre];
      const yMid = (SILL_TOP + WTOP) / 2;
      for (const [a, b] of gaps(z0, z1, holes)) {
        if (b - a > 0.005) parts.add('black', tiltBox(0.04, WTOP - SILL_TOP, b - a, side * (hwAt(yMid) - 0.02), yMid, (a + b) / 2, tilt));
      }
      for (const [a, b] of panes) {
        const mk = () => surfaceGrid(1, 1, (u, v) => {
          const Y = lerp(SILL_TOP, WTOP, v);
          return [side * (hwAt(Y) + 0.004), Y, lerp(a, b, u)];
        }, { flip: side > 0 });
        parts.add('glassOut', mk());
        parts.add('glassIn', mk());
      }
      // engine air intake: dark louvre panel on the last left bay (upper) and a vertical grille (lower)
      if (side < 0) {
        const [la, lb] = LOUVRE_LEFT;
        parts.add('louvreDark', surfaceGrid(1, 1, (u, v) => [-(hwAt(lerp(SILL_TOP, WTOP, v)) + 0.003), lerp(SILL_TOP, WTOP, v), lerp(la, lb, u)], { uvRect: [0, 0, 2.2, 3.4] }));
      }
      // ---- hopper windows: darker top-hinged sashes (the open ones show black)
      if (!lite) {
        for (const [a, b, y0, y1] of HOPPERS[name]) {
          const x = side * (hwAt((y0 + y1) / 2) + 0.0035), z = (a + b) / 2, w = b - a, t = 0.022;
          for (const [cy, h, cz, d] of [[y0, t, 0, w], [y1, t, 0, w], [(y0 + y1) / 2, y1 - y0, -w / 2, t], [(y0 + y1) / 2, y1 - y0, w / 2, t]]) parts.add('black', box(0.012, h, d), M(x, cy, z + cz));
          parts.add('matteBlack', box(0.01, y1 - y0 - 0.04, w - 0.04), M(x - side * 0.002, (y0 + y1) / 2, z));
        }
      }
      // ---- door portals (right side only)
      if (side > 0) for (const d of spec.doors) this.doorPortal(parts, d);
      // ---- A-pillar and the front corner
      {
        const x = side * (HW - 0.03);
        parts.add('black', box(0.06, 2.76 - 0.36, 0.16), M(x, (0.36 + 2.76) / 2, FRONT_Z + 0.56));
      }
      // ---- side marker lamps and repeaters
      const markers = side > 0 ? [-7.95, -6.55, -4.0, -2.7, 0.75, 2.2, 2.9] : [-7.9, -6.4, -3.0, 0.5, 2.9];
      for (const z of markers) parts.add('marker', box(0.012, 0.045, 0.08), M(side * (HW + 0.004), 0.5, z));
      parts.add(side > 0 ? 'indicatorR' : 'indicatorL', box(0.012, 0.05, 0.09), M(side * (HW + 0.004), 0.86, -7.9));
      // ---- service flaps
      if (!lite) {
        const flaps = side > 0 ? [[-3.1 - 1.55, -3.1 - 0.5, 0.36, 0.9]] : [[2.2, 2.95, 0.4, 1.05], [-6.1, -5.2, 0.5, 0.9]];
        for (const [a, b, y0, y1] of flaps) {
          const x = side * (HW + 0.0015), z = (a + b) / 2, w = b - a, t = 0.004;
          if (side > 0 && (a > -4.1 && a < -2.6)) continue;
          for (const [cy, h, cz, d] of [[y0, t, 0, w], [y1, t, 0, w], [(y0 + y1) / 2, y1 - y0, -w / 2, t], [(y0 + y1) / 2, y1 - y0, w / 2, t]]) parts.add('matteBlack', box(0.004, h, d), M(x, cy, z + cz));
        }
      }
      // ---- decals: emblem, label, stickers, fleet number on the glass
      const lv = this.liveryUV, ls = this.liverySize;
      const put = (key, z, yc, scale = 1) => {
        const [w, h] = ls[key];
        parts.add('leaves', this.sideSprite(side, z, w * scale, h * scale, yc + (h * scale) / 2, lv[key]));
      };
      if (side > 0) {
        put('arms', -4.62, 0.86);
        put('label', -6.02, 1.12);
        put('diamond', -4.0 - 0.28, 1.0, 0.8);
        put('sticker', -4.0 - 0.28, 0.86, 0.8);
        put('arms', -0.9, 0.86);
      } else {
        put('label', -6.1, 1.12);
        put('arms', -2.55, 0.9);
        put('diamond', -5.6, 0.6, 0.8);
      }
      const fx = hwAt(2.5) + 0.004;
      const dz = this.decalRects.fleetSide;
      const zn = side > 0 ? -3.4 : -2.7;
      parts.add('decals', surfaceGrid(1, 1, (u, v) => [side * fx, lerp(2.5, 2.61, v), zn + (side > 0 ? 0.5 - u : u - 0.5) * 0.28], { uvRect: dz }));
      // ---- wheel arch liners (hide the interior through the arch openings)
      for (const as of AXLES) {
        const phi = Math.asin((D.wheelR - D.skirtY) / (ARCH_R - 0.01));
        const liner = new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 0.5, 28, 1, true, -phi, Math.PI + 2 * phi);
        liner.rotateZ(Math.PI / 2);
        parts.add('underbody', liner, M(side * (HW - 0.27), D.wheelR, as));
        const disc = new THREE.CircleGeometry(ARCH_R - 0.01, 28, -phi, Math.PI + 2 * phi);
        disc.rotateY(Math.PI / 2);
        parts.add('underbody', disc, M(side * (HW - 0.52), D.wheelR, as));
      }
    }
    // ---- underbody pan between the tyres
    parts.add('underbody', box(1.7, 0.12, z1 - z0 - 0.2), M(0, D.floorY - 0.075, (z0 + z1) / 2)); // below the saloon floor
  },

  /** Fills a white panel [a, b] with fringe sprites hanging from the belt line. */
  fringe(parts, side, a, b, name) {
    let a0 = a + 0.03, b0 = b - 0.03;
    if (name === 'left' && b0 < -5.0) return; // the front corner piece has no fringe
    if (name === 'left') a0 = Math.max(a0, -5.15);
    let rem = b0 - a0;
    if (rem < 0.2) return;
    const lv = this.liveryUV, ls = this.liverySize;
    const order = ['f35', 'f24', 'f16', 'f10', 'f05', 'f03'];
    let z = a0;
    while (rem > 0.12) {
      const key = order.find((k) => ls[k][0] <= rem + 0.01) || 'f03';
      let w = ls[key][0];
      if (rem - w < 0.12 && rem > w) w = rem; // stretch the last sprite a little
      if (w > rem) w = rem;
      const h = ls[key][1];
      parts.add('leaves', this.sideSprite(side, z + w / 2, w, h, BELT + 0.006, lv[key]));
      z += w;
      rem -= w;
    }
  },

  /** Vertical sprite on the side wall, hanging down from yTop: `w` x `h` metres centred at z. */
  sideSprite(side, z, w, h, yTop, uv) {
    const x = side * (HW + 0.0022);
    return surfaceGrid(1, 1, (u, v) => [x, lerp(yTop - h, yTop, v), z + (side > 0 ? 0.5 - u : u - 0.5) * w], { uvRect: uv });
  },

  /** Door frame: pillars and header around the clear opening, silver threshold, dark step. */
  doorPortal(parts, d) {
    const w = d.z1 - d.z0;
    const jf = 0.11, top = 2.46;
    const x = HW - 0.035;
    parts.add('black', box(0.07, top - 0.36, jf), M(x, (0.36 + top) / 2, d.z0 - jf / 2));
    parts.add('black', box(0.07, top - 0.36, 0.08), M(x, (0.36 + top) / 2, d.z1 + 0.04));
    parts.add('black', box(0.07, WTOP + 0.08 - 2.42, w + jf + 0.08), M(x, (2.42 + WTOP + 0.08) / 2, (d.z0 - jf + d.z1 + 0.08) / 2));
    parts.add('rim', box(0.15, 0.03, w), M(HW - 0.075, 0.35, (d.z0 + d.z1) / 2));
    parts.add('rubber', box(0.3, 0.02, w), M(HW - 0.17, 0.34, (d.z0 + d.z1) / 2));
  },

  /** Roof crown (white side rail rounding into the roof) from the front header to the rear corners. */
  roofBody(parts) {
    const sh = new THREE.Shape();
    const hw = ROOF_HW, c = hw - 0.12;
    sh.moveTo(hw, WTOP);
    sh.lineTo(hw, 2.76);
    sh.absarc(c, 2.76, 0.12, 0, Math.PI / 2, false);
    sh.lineTo(-c, 2.88);
    sh.absarc(-c, 2.76, 0.12, Math.PI / 2, Math.PI, false);
    sh.lineTo(-hw, WTOP);
    sh.closePath();
    const zs = FRONT_Z + 0.5, ze = REAR_ROOF_END;
    parts.add('paint', extrude(sh, ze - zs, 0), M(0, 0, zs));
  },

  /** Smooth CNG cylinder fairing: tapered nose, rounded shoulders, rounded tail. */
  roofPod(parts, z0, z1, W, H, R, nose, tail, key = 'paint') {
    const base = ROOF - 0.004;
    const prof = [];
    const n = 6, hx = W / 2;
    prof.push([hx, 0]);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      prof.push([hx - R + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    for (let i = 0; i <= 4; i++) prof.push([lerp(hx - R, -(hx - R), i / 4), H + 0.02 * (1 - Math.pow((i / 4 - 0.5) * 2, 2))]);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * (Math.PI / 2);
      prof.push([-(hx - R) + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    prof.push([-hx, 0]);
    const rings = [];
    const zs = [];
    const nn = 10, nt = 8;
    for (let i = 0; i <= nn; i++) zs.push([z0 + (i / nn) * nose, Math.sqrt(1 - Math.pow(1 - i / nn, 2))]);
    zs.push([(z0 + nose + z1 - tail) / 2, 1]);
    for (let i = 0; i <= nt; i++) zs.push([z1 - tail + (i / nt) * tail, Math.sqrt(Math.max(0, 1 - Math.pow(i / nt, 2.2)))]);
    for (const [z, hs] of zs) {
      const h = Math.max(0.03, hs), ws = 0.9 + 0.1 * hs;
      rings.push(prof.map(([x, y]) => [x * ws, base + y * h, z]));
    }
    for (const g of loftRings(rings)) parts.add(key, g);
    return { z0, z1, nose, tail, H, W, base };
  },

  roofEquipment(parts) {
    const zp0 = FRONT_Z + 0.58, zp1 = -2.75; // ref07 / ref11: the gas housing reaches back to about the middle door
    const pod = this.roofPod(parts, zp0, zp1, 2.16, D.podY - ROOF, 0.3, 0.46, 0.6);
    // perforated ventilation panel on the sloping front face of the pod
    const hsAt = (t) => Math.sqrt(1 - Math.pow(1 - t, 2));
    parts.add('louvreWhite', surfaceGrid(1, 1, (u, v) => {
      const t = lerp(0.3, 0.62, v);
      const hs = hsAt(t), ws = 0.9 + 0.1 * hs;
      return [lerp(0.52, -0.52, u) * ws, pod.base + hs * pod.H + 0.004, pod.z0 + t * pod.nose];
    }, { uvRect: [0, 0, 1.2, 0.7] }));
    // "CNG bus by BMC" on both pod sides
    const lv = this.liveryUV, ls = this.liverySize;
    for (const side of [1, -1]) {
      const [w, h] = ls.cngBus;
      const sw = 0.62, sh = sw * (h / w);
      const x = side * (pod.W / 2 + 0.003);
      parts.add('leaves', surfaceGrid(1, 1, (u, v) => [x, pod.base + 0.06 + v * sh, pod.z0 + 1.15 + (side > 0 ? 0.5 - u : u - 0.5) * sw + sw / 2], { uvRect: lv.cngBus }));
    }
    // A/C unit behind the pod: low rounded box with a ribbed top
    const ac = this.roofPod(parts, -2.7, -0.95, 1.95, 0.26, 0.1, 0.22, 0.22);
    parts.add('louvreWhite', surfaceGrid(1, 1, (u, v) => [lerp(0.7, -0.7, u), ac.base + 0.262, lerp(-2.4, -1.2, v)], { uvRect: [0, 0, 1.5, 2.2] }));
    // second vented box and the roof hatch at the tail, shark-fin antenna
    this.roofPod(parts, -0.85, 0.35, 1.5, 0.12, 0.05, 0.12, 0.12);
    parts.add('paint', box(1.3, 0.09, 0.9, 0.03), M(-0.1, ROOF + 0.045, 1.55));
    parts.add('louvreDark', surfaceGrid(1, 1, (u, v) => [lerp(0.5, -0.7, u), ROOF + 0.092, lerp(1.2, 1.9, v)], { uvRect: [0, 0, 1.2, 0.8] }));
    const fin = new THREE.BoxGeometry(0.06, 0.1, 0.22);
    parts.add('black', fin, M(0.55, ROOF + 0.12, 0.32));
  },
};

void sweep;
