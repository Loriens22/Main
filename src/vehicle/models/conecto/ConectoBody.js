// Sides and roof of the Mercedes-Benz Conecto G: orange lower panels with round wheel arches (black rubber
// lips), a dark rub strip, the black glazed band (large lower panes with a narrow hopper above), door
// portals, white roof with a rounded edge. Layout numbers are z values in the section frames, fitted to the
// photos (see NOTES.md). The left front corner has the falling belt line with the hazard-film panel
// under the cab side window (ref01); the rear section's belt rises over the engine.
import * as THREE from 'three';
import { Parts, M, box, extrude, skirtShape, surfaceGrid, tiltBox, lerp, clamp, tube } from './geom.js';
import { hwAt, TUMBLE_IN } from './ConectoFront.js';

const ROOF_Y = 2.9;
const ARCH_R = 0.62;

/** z-layout of one section: panes, door ranges, arch z, belt function. */
export function layout(spec, F, section) {
  const D = spec.dims;
  const front = section === 'front';
  const doors = spec.doors.filter((d) => d.section === section);
  const belt = D.beltY;
  if (front) {
    const pitch = 1.55;
    const left = Array.from({ length: 5 }, (_, i) => [-6.65 + pitch * i, -6.65 + pitch * i + 1.45]);
    return {
      zA: F.frontZ, zB: F.frontEnd, s0: F.frontZ + 0.5, s1: F.frontEnd,
      axles: [-D.wb1, 0], doors,
      panes: {
        right: [[-6.45, -4.95], [-4.85, -3.35], [-1.8, -0.5], [-0.4, 1.1]],
        left: [[-7.8, -6.8, belt + 0.1], ...left],
      },
      beltFn: { right: () => belt, left: (z) => lerp(1.1, belt, clamp((z + 7.9) / 1.15, 0, 1)) },
      repeaters: { right: -7.0, left: -7.0 },
    };
  }
  return {
    zA: F.rearStart, zB: F.rearZ, s0: F.rearStart, s1: F.rearZ - 0.4,
    axles: [0], doors,
    panes: {
      right: [[-1.7, -0.5], [-0.4, 0.8], [0.9, 2.1, belt + 0.4], [2.2, 3.15, belt + 0.4]],
      left: [[-3.25, -2.0], [-1.9, -0.6], [-0.5, 0.8], [0.9, 2.1, belt + 0.4], [2.2, 3.15, belt + 0.4]],
    },
    beltFn: { right: (z) => belt + 0.4 * clamp((z - 0.85) / 0.9, 0, 1), left: (z) => belt + 0.4 * clamp((z - 0.85) / 0.9, 0, 1) },
    repeaters: { right: -2.0, left: -2.0 },
  };
}

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

export const BodyMixin = {
  sideBody(parts, section) {
    const D = this.D, F = this.F;
    const L = layout(this.spec, F, section);
    this.layouts = this.layouts || {};
    this.layouts[section] = L;
    const lite = this.lite;
    const belt = D.beltY, wtop = D.windowTopY, skirt = D.skirtY, HW = D.halfW;
    const R = D.wheelR;
    const dr = this.decalRects;
    for (const side of [1, -1]) {
      const name = side > 0 ? 'right' : 'left';
      const doors = side > 0 ? L.doors : [];
      const doorRanges = doors.map((d) => [d.z0 - 0.07, d.z1 + 0.07]);
      const beltFn = L.beltFn[name];
      // ---- lower orange panels with wheel arches (and doors cut out)
      for (const [a, b] of gaps(L.s0, L.s1, doorRanges)) {
        if (b - a < 0.12) continue;
        const sh = side > 0
          ? skirtShape(a, b, L.axles, { y0: skirt, y1: (z) => beltFn(z), wheelR: R, archR: ARCH_R })
          : skirtShape(-b, -a, L.axles.map((v) => -v), { y0: skirt, y1: (u) => beltFn(-u), wheelR: R, archR: ARCH_R });
        const g = extrude(sh, 0.035, 0.006);
        // shape x -> world z (right side) or -z (left side), shape y -> height, extrusion -> inwards from the skin
        const mtx = side > 0
          ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(HW - 0.006, 0, 0)
          : new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-HW + 0.006, 0, 0);
        parts.add('paint', g, mtx);
        // dark sill behind the panel between the arches
        for (const [c, e] of gaps(a, b, L.axles.map((x) => [x - ARCH_R, x + ARCH_R]))) {
          if (e - c > 0.05) parts.add('underbody', box(0.3, 0.12, e - c), M(side * (HW - 0.17), skirt + 0.06, (c + e) / 2));
          // rub strip (dark grey) at hub height
          if (e - c > 0.2) parts.add('strip', box(0.012, 0.06, e - c - 0.06), M(side * (HW + 0.006), 0.63, (c + e) / 2));
        }
      }
      // ---- wheel arch lips and liners
      for (const az of L.axles) {
        const n = 22;
        const phi = Math.asin((R - skirt) / ARCH_R);
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = -phi + (i / n) * (Math.PI + 2 * phi); // from the skirt edge over the top to the other skirt edge
          pts.push([side * (HW + 0.004), R + Math.sin(t) * (ARCH_R + 0.012), az + Math.cos(t) * (ARCH_R + 0.012)]);
        }
        // arch top is at t = pi/2: y = R + ARCH_R
        parts.add('black', tube(pts, 0.022, 6));
        const phi2 = Math.asin((R - skirt) / (ARCH_R - 0.01));
        const liner = new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 0.5, 28, 1, true, -phi2, Math.PI + 2 * phi2);
        liner.rotateZ(Math.PI / 2);
        parts.add('underbody', liner, M(side * (HW - 0.27), R, az));
        const disc = new THREE.CircleGeometry(ARCH_R - 0.01, 28, -phi2, Math.PI + 2 * phi2);
        disc.rotateY(Math.PI / 2);
        parts.add('underbody', disc, M(side * (HW - 0.52), R, az));
      }
      // ---- glazed band: black sill, top strip, backing between panes, pillars, transoms, glass
      const bandA = L.s0, bandB = L.s1, bandMid = (bandA + bandB) / 2;
      const tilt = -side * Math.atan(TUMBLE_IN / (2.6 - belt));
      const xAt = (Y) => side * (hwAt(Y) - 0.02);
      const panes = L.panes[name];
      const paneRanges = panes.map((p) => [p[0], p[1]]);
      const holes = [...paneRanges, ...doors.map((d) => [d.z0 - 0.07, d.z1 + 0.07])];
      // continuous sill strip following the belt function (piecewise)
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const za = lerp(bandA, bandB, i / steps), zb = lerp(bandA, bandB, (i + 1) / steps);
        const zm = (za + zb) / 2, bm = beltFn(zm);
        if (doors.some((d) => zm > d.z0 - 0.07 && zm < d.z1 + 0.07)) continue;
        // backing (black) between belt and window top where no pane / door
        void bm;
      }
      parts.add('black', tiltBox(0.04, 0.095, bandB - bandA, xAt(wtop + 0.04), wtop + 0.04, bandMid, tilt)); // strip above the glass
      for (const [a, b] of gaps(bandA, bandB, holes)) {
        if (b - a > 0.005) {
          const yb = Math.min(beltFn(a), beltFn(b));
          parts.add('black', tiltBox(0.04, wtop - yb, b - a, xAt((wtop + yb) / 2), (wtop + yb) / 2, (a + b) / 2, tilt));
        }
      }
      for (const p of panes) {
        const [a, b] = p;
        const y0 = p[2] || beltFn((a + b) / 2) + 0.03;
        const y1 = wtop;
        const mk = () => surfaceGrid(1, 1, (u, v) => {
          const Y = lerp(y0, y1, v);
          return [side * (hwAt(Y) + 0.004), Y, lerp(a, b, u)];
        }, { flip: side > 0 });
        parts.add('glassOut', mk());
        parts.add('glassIn', mk());
        // black frame: sill bar, transom, side jambs
        const xm = side * (hwAt((y0 + y1) / 2) + 0.006);
        parts.add('black', box(0.016, 0.045, b - a + 0.06), M(xm, y0 - 0.005, (a + b) / 2));
        const yt = y1 - 0.34;
        if (yt > y0 + 0.2) parts.add('black', box(0.016, 0.035, b - a), M(xm, yt, (a + b) / 2));
        for (const zz of [a, b]) parts.add('black', box(0.016, y1 - y0, 0.03), M(xm, (y0 + y1) / 2, zz));
      }
      // ---- cab side window (left front): glass above the belt and the hazard film panel below it
      if (section === 'front' && side < 0) this.cabCornerLeft(parts, L);
      // ---- door portals
      for (const d of doors) this.doorPortal(parts, d);
      // ---- A-pillar corner pieces (front section)
      if (section === 'front') {
        const x = side * (HW - 0.03);
        parts.add('black', box(0.06, wtop + 0.1 - 0.36, 0.1), M(x, (0.36 + wtop + 0.1) / 2, F.frontZ + 0.5));
      }
      // ---- repeater and marker lamps, small details
      const rz = L.repeaters[name];
      parts.add(side > 0 ? 'indicatorR' : 'indicatorL', box(0.012, 0.05, 0.09), M(side * (HW + 0.005), 0.93, rz + (section === 'front' ? 0 : 0)));
      if (!lite) {
        for (const zz of L.axles.map((az) => az + 1.4)) {
          if (zz > L.s0 + 0.3 && zz < L.s1 - 0.3 && !doors.some((d) => zz > d.z0 - 0.3 && zz < d.z1 + 0.3)) parts.add('marker', box(0.012, 0.04, 0.08), M(side * (HW + 0.004), 0.5, zz));
        }
        // small round fuel / service port and flap outline (right side of the front section, ref03)
        if (section === 'front' && side > 0) {
          const g = new THREE.CircleGeometry(0.03, 12); g.rotateY(Math.PI / 2);
          parts.add('matteBlack', g, M(HW + 0.004, 1.12, -0.35 - 1.7));
        }
        if (section === 'front' && side < 0) {
          for (const [zc, w] of [[-4.0, 0.7], [-1.7, 0.45]]) {
            for (const [cy, h, cz, dd] of [[0.5, 0.004, 0, w], [0.95, 0.004, 0, w], [0.725, 0.45, -w / 2, 0.004], [0.725, 0.45, w / 2, 0.004]]) parts.add('matteBlack', box(0.004, h, dd), M(-HW - 0.0015, cy, zc + cz));
          }
        }
      }
      // ---- decals: priority stickers behind the doors, small fleet number
      if (side > 0) {
        for (const d of doors) {
          const zc = d.z1 + 0.2;
          const x = hwAt(1.35) + 0.0065;
          parts.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(1.22, 1.31, v), zc + (0.5 - u) * 0.2], { uvRect: dr.sticker }));
        }
      }
      if (section === 'front') {
        const zc = F.frontEnd - 1.25;
        const y = side < 0 ? 2.66 : 1.2;
        const x = side * (side < 0 ? hwAt(y) + 0.0065 : HW + 0.0065);
        parts.add('decals', surfaceGrid(1, 1, (u, v) => [x, lerp(y - 0.075, y + 0.075, v), zc + side * (0.5 - u) * 0.32], { uvRect: dr.small, flip: side < 0 }));
      }
    }
    // ---- underbody pan between the tyres
    parts.add('underbody', box(1.7, 0.12, L.s1 - L.s0 - 0.2), M(0, skirt + 0.06, (L.s0 + L.s1) / 2));
    return L;
  },

  /** Left front: cab side window above the falling belt line and the white/black hazard film panel below it. */
  cabCornerLeft(parts, L) {
    const D = this.D, F = this.F, HW = D.halfW;
    const x = -(HW + 0.004);
    const zf = F.frontZ + 0.46; // where the straight side wall starts
    const zr = -6.75;
    const yTop = D.beltY + 0.11;
    // film panel polygon (z, y): along the falling belt line
    const poly = [[zf, 1.1], [zr, D.beltY], [zr, yTop], [zf, yTop]];
    const g = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    const r = this.decalRects.hazard;
    poly.forEach(([z, y], i) => {
      pos.push(x, y, z);
      uv.push(lerp(r[0], r[2], (z - zf) / (zr - zf)), lerp(r[1], r[3], (y - 1.0) / 0.6));
    });
    idx.push(0, 1, 2, 0, 2, 3);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // wind the quad so that its normal points to -x
    const nrm = g.attributes.normal;
    if (nrm.getX(0) > 0) { g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); }
    parts.add('decals', g);
    // black diagonal edge band along the falling belt
    const a = [x, 1.1, zf], b = [x, D.beltY, zr];
    const len = Math.hypot(b[2] - a[2], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[2] - a[2]);
    const band = new THREE.BoxGeometry(0.02, 0.05, len);
    band.rotateX(-ang);
    parts.add('black', band, M(x - 0.003, (a[1] + b[1]) / 2 - 0.02, (a[2] + b[2]) / 2));
    void L;
  },

  /** Door frame: black pillars, header, stainless threshold and the dark step behind it. */
  doorPortal(parts, d) {
    const D = this.D, HW = D.halfW, wtop = D.windowTopY;
    const w = d.z1 - d.z0;
    const top = 2.42;
    const x = HW - 0.035;
    parts.add('black', box(0.07, top - 0.34, 0.07), M(x, (0.34 + top) / 2, d.z0 - 0.035));
    parts.add('black', box(0.07, top - 0.34, 0.07), M(x, (0.34 + top) / 2, d.z1 + 0.035));
    parts.add('black', box(0.07, wtop + 0.1 - top, w + 0.14), M(x, (top + wtop + 0.1) / 2, (d.z0 + d.z1) / 2));
    parts.add('steel', box(0.16, 0.03, w), M(HW - 0.08, 0.335, (d.z0 + d.z1) / 2));
    parts.add('rubber', box(0.3, 0.02, w), M(HW - 0.17, 0.34, (d.z0 + d.z1) / 2));
    // pale exit pictogram on the front pillar (inside edge)
    void wtop;
  },

  /** White roof crown between z0 and z1 (section frame). */
  roofBody(parts, L, z0, z1, section) {
    const D = this.D;
    const r = 0.3, hw1 = D.halfW - TUMBLE_IN;
    const wt = D.windowTopY + 0.04;
    const sh = new THREE.Shape();
    sh.moveTo(hwAt(wt), wt);
    sh.lineTo(hw1, ROOF_Y - r);
    sh.absarc(hw1 - r, ROOF_Y - r, r, 0, Math.PI / 2, false);
    sh.lineTo(-(hw1 - r), ROOF_Y);
    sh.absarc(-(hw1 - r), ROOF_Y - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(-hwAt(wt), wt);
    sh.closePath();
    const zA = section === 'front' ? z0 + this.F.frontZ : z0;
    parts.add('roof', extrude(sh, z1 - zA, 0), M(0, 0, zA));
    void L;
  },
};
