// Sides of the MAN Lion's City G: white lower panels with R 0.60 wheel arches,
// the black glazed band (belt 1.30, glass to 2.68, black strip to 2.76), door
// portals, leaf fringe sprites, flaps, markers, the roof with its CNG pods and
// the tail louvres. Layout numbers: data/research/bus/exterior/exterior_spec.md
// section 4 (S = distance behind the front face in the front section, z in the
// rear-section frame for the rear section).
import * as THREE from 'three';
import { BUS, FRONT_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z } from './BusSpec.js';
import { HW, ARCH_R, S_REAR_ORIGIN, M, basis, box, extrude, loftRings, skirtShape, surfaceGrid, tiltBox, lerp, clamp, sweep } from './BusGeom.js';
import { hwAt, ROOF_HW } from './BusFront.js';

const TUMBLE = Math.atan(0.02 / 1.46); // side wall leans in by about 1.7 degrees above the belt
const BELT = BUS.beltY, WTOP = BUS.windowTopY;
const SILL_TOP = BELT + 0.045;
const REAR_R = 0.4; // plan corner radius of the rear end

/** Per-section layout. Panes are [s0, s1] ranges (S from the bus front) on the black glazed band. */
function layout(section) {
  const front = section === 'front';
  const toZ = front ? (s) => FRONT_Z + s : (s) => s - S_REAR_ORIGIN;
  const toS = (z) => (front ? z - FRONT_Z : z + S_REAR_ORIGIN);
  const doors = BUS.doors.filter((d) => d.section === section).map((d) => ({ id: d.id, s0: toS(d.z0), s1: toS(d.z1) }));
  if (front) {
    return {
      toZ, toS, doors, s0: 0.495, s1: FRONT_BODY_END_Z - FRONT_Z,
      axles: [BUS.frontOverhang, BUS.frontOverhang + BUS.wb1],
      bandStart: 0.5, bandEnd: FRONT_BODY_END_Z - FRONT_Z,
      panes: {
        right: [[1.95, 2.95], [3.15, 4.5], [4.7, 5.45], [7.05, 8.95]],
        left: Array.from({ length: 6 }, (_, i) => [0.66 + 1.3883 * i + 0.055, 0.66 + 1.3883 * (i + 1) - 0.055]),
      },
      hoppers: { right: [[3.55, 4.5, 2.22, 2.62]], left: [1, 3, 5].map((i) => [0.66 + 1.3883 * i + 0.14, 0.66 + 1.3883 * (i + 1) - 0.14, 2.22, 2.62]) },
      flaps: { right: [[3.55, 3.98, 0.36, 0.9]], left: [[0.85, 1.75, 0.36, 1.0]] },
      markers: { right: [[1.99, 0.55], [3.45, 0.5], [5.45, 0.5], [6.95, 0.5], [8.55, 0.5]], left: [[1.3, 0.5], [3.45, 0.5], [5.2, 0.5], [6.9, 0.5], [8.6, 0.5]] },
      repeaters: { right: [[1.99, 1.15]], left: [[1.3, 1.15]] },
      leaves: {
        right: [['big', 4.4], ['small', 7.275]],
        left: [['big', 4.4], ['mid', 6.35]],
      },
      logos: { right: [4.4], left: [4.4] },
      stickers: { right: [2.15, 7.3], left: [] },
      louvre: [],
    };
  }
  const zs = (z) => z + S_REAR_ORIGIN;
  const rl = Array.from({ length: 5 }, (_, i) => [zs(-4.62 + 1.524 * i) + 0.055, zs(-4.62 + 1.524 * (i + 1)) - 0.055]);
  return {
    toZ, toS, doors, s0: zs(REAR_BODY_START_Z), s1: zs(BUS.rearOverhang - REAR_R),
    axles: [S_REAR_ORIGIN],
    bandStart: zs(REAR_BODY_START_Z), bandEnd: zs(BUS.rearOverhang - REAR_R),
    panes: {
      right: [[zs(-4.57), zs(-3.35)], [zs(-3.25), zs(-2.15)], [zs(-0.7), zs(0.7)], [zs(2.15), zs(2.95), 1.78]],
      left: rl.map((p, i) => (i === 4 ? [p[0], p[1], 1.78] : p)),
    },
    hoppers: { right: [[zs(-4.45), zs(-3.45), 2.22, 2.62], [zs(-0.55), zs(0.55), 2.22, 2.62]], left: [1, 3].map((i) => [rl[i][0] + 0.1, rl[i][1] - 0.1, 2.22, 2.62]) },
    flaps: { right: [], left: [] },
    markers: { right: [[zs(-4.3), 0.5], [zs(-2.3), 0.5], [zs(-0.7), 0.5], [zs(0.7), 0.5], [zs(2.5), 0.5]], left: [[zs(-4.3), 0.5], [zs(-2.3), 0.5], [zs(-0.7), 0.5], [zs(0.7), 0.5]] },
    repeaters: { right: [[zs(-2.2), 1.15]], left: [] },
    leaves: {
      right: [['wide', zs(-3.375)], ['mid', zs(0)]],
      left: [['wide', zs(-3.375)], ['mid', zs(-1.1)], ['mid', zs(1.4)]],
    },
    logos: { right: [zs(-3.4)], left: [zs(-3.4)] },
    stickers: { right: [zs(-0.55), zs(2.3)], left: [] },
    louvre: [zs(2.15), zs(3.0)],
  };
}

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
  /** Side bodies of one section: panels, band, portals, details. */
  sideBody(parts, section) {
    const L = layout(section);
    const lite = this.lite;
    this.layouts = this.layouts || {};
    this.layouts[section] = L;
    const toZ = L.toZ;
    for (const side of [1, -1]) {
      const name = side > 0 ? 'right' : 'left';
      const doors = side > 0 ? L.doors : [];
      const doorRanges = doors.map((d) => [d.s0, d.s1]);
      // ---- lower white panels with R 0.60 arches
      for (const [a, b] of gaps(L.s0, L.s1, doorRanges)) {
        if (b - a < 0.15) continue;
        let g, mtx;
        if (side > 0) {
          g = extrude(skirtShape(a, b, L.axles), 0.035, 0.006);
          mtx = basis([0, 0, 1], [0, 1, 0], [-1, 0, 0], [HW - 0.006, 0, toZ(0)]); // bevel lifts the face by 0.006: outer face at HW
        } else {
          g = extrude(skirtShape(-b, -a, L.axles.map((v) => -v)), 0.035, 0.006);
          mtx = basis([0, 0, -1], [0, 1, 0], [1, 0, 0], [-HW + 0.006, 0, toZ(0)]);
        }
        parts.add('paint', g, mtx);
        // dark sill behind the panel between the arches so the underside never shows light
        for (const [c, e] of gaps(a, b, L.axles.map((x) => [x - 0.6, x + 0.6]))) {
          if (e - c > 0.05) parts.add('underbody', box(0.3, 0.14, e - c), M(side * (HW - 0.17), BUS.skirtY + 0.07, toZ((c + e) / 2)));
        }
      }
      // ---- black glazed band: frame strips, backing between the panes, glass panes
      const bandA = L.bandStart, bandB = L.bandEnd, bandMid = (bandA + bandB) / 2;
      const tilt = -side * TUMBLE;
      const xSill = hwAt(BELT + 0.02) - 0.02;
      parts.add('black', box(0.04, SILL_TOP - BELT, bandB - bandA), M(side * xSill, (BELT + SILL_TOP) / 2, toZ(bandMid))); // sill
      parts.add('black', tiltBox(0.04, 0.085, bandB - bandA, side * (hwAt(2.72) - 0.02), 2.72, toZ(bandMid), tilt)); // strip above the glass
      const panes = L.panes[name];
      const paneRanges = panes.map((p) => [p[0], p[1]]);
      const holes = [...paneRanges, ...doorRanges];
      const yMid = (SILL_TOP + WTOP) / 2;
      for (const [a, b] of gaps(bandA, bandB, holes)) {
        if (b - a > 0.005) parts.add('black', tiltBox(0.04, WTOP - SILL_TOP, b - a, side * (hwAt(yMid) - 0.02), yMid, toZ((a + b) / 2), tilt));
      }
      for (const p of panes) {
        const [a, b] = p;
        const y0 = p[2] || SILL_TOP, y1 = WTOP;
        const mk = () => surfaceGrid(1, 1, (u, v) => {
          const Y = lerp(y0, y1, v);
          return [side * (hwAt(Y) + 0.004), Y, toZ(lerp(a, b, u))];
        }, { flip: side > 0 });
        parts.add('glassOut', mk());
        parts.add('glassIn', mk());
      }
      // louvres at the tail: white slotted panel low, black louvre band above (engine air intake)
      if (L.louvre.length) {
        const [la, lb] = L.louvre;
        const lv = (key, y0, y1) => parts.add(key, surfaceGrid(1, 1, (u, v) => [side * (HW + 0.002), lerp(y0, y1, v), toZ(lerp(la, lb, u))], { flip: side > 0, uvRect: [0, 0, 1.5, (y1 - y0) / 0.4] }));
        lv('louvreWhite', 0.45, 1.25);
        lv('louvreDark', 1.35, 1.75);
      }
      // ---- hopper windows: top-hinged sashes on some panes
      if (!lite) {
        for (const [a, b, y0, y1] of L.hoppers[name]) {
          const x = side * (hwAt((y0 + y1) / 2) + 0.0035), z = toZ((a + b) / 2), w = b - a;
          const t = 0.025;
          for (const [cy, h, cz, d] of [[y0, t, 0, w], [y1, t, 0, w], [(y0 + y1) / 2, y1 - y0, -w / 2, t], [(y0 + y1) / 2, y1 - y0, w / 2, t]]) parts.add('black', box(0.012, h, d), M(x, cy, z + cz));
          parts.add('black', box(0.016, 0.03, 0.12), M(x, y0 + 0.05, z + (side > 0 ? -1 : 1) * (w * 0.5 - 0.2)));
        }
      }
      // ---- door portals (right side only)
      for (const d of doors) this.doorPortal(parts, d, toZ, section);
      // ---- A-pillar and the front corner (front section)
      if (section === 'front') {
        const x = side * (HW - 0.03);
        if (side < 0) parts.add('black', box(0.06, WTOP + 0.08 - BELT, 0.17), M(x, (BELT + WTOP + 0.08) / 2, toZ(0.58)));
        else parts.add('black', box(0.06, 2.76 - 0.36, 0.14), M(x, (0.36 + 2.76) / 2, toZ(0.57)));
      }
      // ---- side marker lamps and repeaters
      for (const [s, y] of L.markers[name]) parts.add('marker', box(0.012, 0.05, 0.09), M(side * (HW + 0.004), y, toZ(s)));
      for (const [s, y] of L.repeaters[name]) parts.add(side > 0 ? 'indicatorR' : 'indicatorL', box(0.012, 0.055, 0.1), M(side * (HW + 0.004), y, toZ(s)));
      // ---- service flaps (hairline outline, slotted handle edge)
      if (!lite) {
        for (const [a, b, y0, y1] of L.flaps[name]) {
          const x = side * (HW + 0.0015), z = toZ((a + b) / 2), w = b - a, t = 0.004;
          for (const [cy, h, cz, d] of [[y0, t, 0, w], [y1, t, 0, w], [(y0 + y1) / 2, y1 - y0, -w / 2, t], [(y0 + y1) / 2, y1 - y0, w / 2, t]]) parts.add('matteBlack', box(0.004, h, d), M(x, cy, z + cz));
          parts.add('matteBlack', box(0.006, 0.012, w * 0.7), M(x, y1 - 0.06, z));
        }
      }
      // ---- leaf fringe and logo (alpha-tested sprites hanging from the belt line)
      for (const [sp, sc] of L.leaves[name]) {
        const [w, h] = this.leafSize[sp];
        parts.add('leaves', this.sideSprite(side, toZ(sc), w, h, BELT, this.leafUV[sp]));
      }
      for (const sc of L.logos[name]) {
        const [w, h] = this.leafSize.logo;
        parts.add('leaves', this.sideSprite(side, toZ(sc), w, h, 0.9 + h, this.leafUV.logo));
      }
      // ---- blue priority stickers behind the door jambs and the small fleet number
      if (side > 0) {
        for (const sc of L.stickers.right) {
          const x = hwAt(1.5) + 0.0065;
          parts.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(1.4, 1.58, v), toZ(sc + 0.2) + (0.5 - u) * 0.4], { uvRect: this.decalRects.sticker }));
        }
        if (section === 'front') {
          const x = hwAt(2.45) + 0.0065;
          parts.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(2.36, 2.52, v), toZ(8.6) + (0.5 - u) * 0.3], { uvRect: this.decalRects.fleetSmall }));
        }
      }
      // ---- wheel arch liners (hide the interior through the R 0.60 openings)
      for (const as of L.axles) {
        // liner: upper half plus the part below the axle line down to the skirt edge
        const phi = Math.asin((BUS.wheelR - BUS.skirtY) / (ARCH_R - 0.01));
        const liner = new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 0.5, 28, 1, true, -phi, Math.PI + 2 * phi);
        liner.rotateZ(Math.PI / 2);
        parts.add('underbody', liner, M(side * (HW - 0.27), BUS.wheelR, toZ(as)));
        const disc = new THREE.CircleGeometry(ARCH_R - 0.01, 28, -phi, Math.PI + 2 * phi);
        disc.rotateY(Math.PI / 2);
        parts.add('underbody', disc, M(side * (HW - 0.52), BUS.wheelR, toZ(as)));
      }
    }
    // ---- underbody pan between the tyres
    parts.add('underbody', box(1.7, 0.12, L.s1 - L.s0 - 0.2), M(0, BUS.skirtY + 0.06, toZ((L.s0 + L.s1) / 2)));
    return L;
  },

  /** Vertical sprite on the side wall, hanging down from yTop: `w` x `h` metres centred at z. */
  sideSprite(side, z, w, h, yTop, uv) {
    const x = side * (HW + 0.0022);
    return surfaceGrid(1, 1, (u, v) => [x, lerp(yTop - h, yTop, v), z + (side > 0 ? 0.5 - u : u - 0.5) * w], { uvRect: uv });
  },

  /** Door frame: 0.11 m front pillar, 0.08 rear pillar, black header, silver threshold; door 1 gets the yellow grab rail. */
  doorPortal(parts, d, toZ, section) {
    const w = d.s1 - d.s0;
    const front = d.id === 1;
    const jf = front ? 0.11 : 0.08;
    const top = 2.45;
    const x = HW - 0.035;
    parts.add('black', box(0.07, top - 0.36, jf), M(x, (0.36 + top) / 2, toZ(d.s0 - jf / 2)));
    parts.add('black', box(0.07, top - 0.36, 0.08), M(x, (0.36 + top) / 2, toZ(d.s1 + 0.04)));
    parts.add('black', box(0.07, WTOP + 0.08 - 2.41, w + jf + 0.08), M(x, (2.41 + WTOP + 0.08) / 2, toZ((d.s0 - jf + d.s1 + 0.08) / 2)));
    // stainless threshold and the dark step behind it
    parts.add('rim', box(0.15, 0.03, w), M(HW - 0.075, 0.35, toZ((d.s0 + d.s1) / 2)));
    parts.add('rubber', box(0.3, 0.02, w), M(HW - 0.17, 0.34, toZ((d.s0 + d.s1) / 2)));
    if (front) {
      // yellow interior grab rail: pole by the rear jamb curving up and forward over the opening
      const zr = toZ(d.s1) - 0.14, zf = toZ(d.s0) + 0.16;
      const path = [[HW - 0.2, 0.55, zr], [HW - 0.2, 1.35, zr], [HW - 0.2, 1.72, zr - 0.08], [HW - 0.2, 1.95, zr - 0.35], [HW - 0.2, 2.02, zf + 0.1]];
      for (const g of sweep(path, () => [0.019, 0.019], 24, 10)) parts.add('yellow', g);
    }
    void section;
  },

  /** Roof crown (white side rail rounding into the roof) between s0 and s1 of a section. */
  roofBody(parts, L, s0, s1) {
    const sh = new THREE.Shape();
    const hw = ROOF_HW, c = hw - 0.12;
    sh.moveTo(hw, WTOP);
    sh.lineTo(hw, 2.76);
    sh.absarc(c, 2.76, 0.12, 0, Math.PI / 2, false);
    sh.lineTo(-c, 2.88);
    sh.absarc(-c, 2.76, 0.12, Math.PI / 2, Math.PI, false);
    sh.lineTo(-hw, WTOP);
    sh.closePath();
    parts.add('paint', extrude(sh, s1 - s0, 0), M(0, 0, L.toZ(s0)));
  },

  /** Smooth CNG cylinder fairing: tapered nose, rounded shoulders, rounded tail. z0 < z1 in the section frame. */
  roofPod(parts, z0, z1, W, H, R, nose = 0.6, tail = 0.45) {
    const base = BUS.roofY - 0.004;
    const prof = [];
    const n = 6;
    const hx = W / 2;
    prof.push([hx, 0]);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      prof.push([hx - R + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    for (let i = 0; i <= 4; i++) prof.push([lerp(hx - R, -(hx - R), i / 4), H + 0.03 * (1 - Math.pow((i / 4 - 0.5) * 2, 2))]);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * (Math.PI / 2);
      prof.push([-(hx - R) + Math.cos(a) * R, H - R + Math.sin(a) * R]);
    }
    prof.push([-hx, 0]);
    const rings = [];
    const zs = [];
    const nn = 8, nt = 6;
    for (let i = 0; i <= nn; i++) zs.push([z0 + (i / nn) * nose, Math.sqrt(1 - Math.pow(1 - i / nn, 2))]);
    zs.push([(z0 + nose + z1 - tail) / 2, 1]);
    for (let i = 0; i <= nt; i++) zs.push([z1 - tail + (i / nt) * tail, Math.sqrt(Math.max(0, 1 - Math.pow(i / nt, 2.2)))]);
    for (const [z, hs] of zs) {
      const h = Math.max(0.03, hs), ws = 0.9 + 0.1 * hs;
      rings.push(prof.map(([x, y]) => [x * ws, base + y * h * (y > 0 ? 1 : 1), z]));
    }
    for (const g of loftRings(rings)) parts.add('paint', g);
  },
};

export { layout };
void clamp;
