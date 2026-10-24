// Passenger interior of the Conecto G in its operational state (ref04), with structure from the stripped
// interior of ref05: grey rubber floor, light-grey wall panels below the sill, black-gasket windows, flat
// warm-grey ceiling with side ducts and a row of lamps, wheel housings capped by flat grey-green panels,
// individual shell seats (seats are drawn from spec.layout.seats), red poles and overhead rails, blue
// validators, red stop buttons, a partition panel with a red rail behind door 1, the turntable at the
// articulation. Section frames as in the exterior.
import * as THREE from 'three';
import { LedSign } from '../../LedSign.js';
import { Parts, M, box, quad, texBox, profileStrip, rod, tube, smooth, roundRectShape, decal } from './geom.js';
import { seatPieces, foldPieces } from './ConectoSeat.js';
import { AISLE_X, WALL_X, POD_H, PLAT_Z0 } from './layout.js';

export const CEIL_Y = 2.64;
const HOUSING_X = 0.74;
const HOUSING_HALF = 0.7;
const HOUSING_Y = 1.0;
const RAIL_X = 0.72, RAIL_Y = 2.34;
const DUCT = [[0.7, 2.64], [0.85, 2.625], [1.0, 2.6], [1.1, 2.56], [1.2, 2.5], [1.215, 2.47]];

/** Amber single-line next-stop display (dark red LEDs in the photo). */
class InteriorLed extends LedSign {
  showLines(a, b) {
    const key = `S|${a}|${b}`;
    if (key === this.key) return;
    this.key = key;
    const text = b ? `${a} ${b}` : a;
    const sz = Math.round(this.rows * 0.34);
    this.paint(this.rasterise([{ text, x: 3, y: Math.round((this.rows + sz * 0.72) / 2), size: sz, maxW: this.cols - 8, align: 'center', condensed: 0.92 }]));
  }
}

export const InteriorMixin = {
  buildInterior() {
    const fp = new Parts(), rp = new Parts();
    this.saloon(fp, 'front');
    this.saloon(rp, 'rear');
    this.seats(fp, rp);
    this.poles(fp, 'front');
    this.poles(rp, 'rear');
    this.cabParts(fp);
    this.addDisplayHousings(fp, rp);
    const f = fp.build(this.mats, { castShadow: false });
    const r = rp.build(this.mats, { castShadow: false });
    this.front.add(f);
    this.rear.add(r);
    this.interiorGroups = [f, r];
  },

  saloon(parts, sec) {
    const D = this.D, F = this.F, FY = D.floorY, L = this.spec.layout;
    const isF = sec === 'front';
    const zS = isF ? F.frontZ + 0.25 : F.rearStart + 0.06;
    const zE = isF ? F.frontEnd - 0.06 : F.rearZ - 0.15;
    const lay = this.layouts[sec];
    const doors = this.spec.doors.filter((d) => d.section === sec);
    const axles = isF ? [-D.wb1, 0] : [0];
    const wtop = D.windowTopY;
    // ---- floor (stud rubber), with the raised engine platform and its stairs in the rear section
    if (isF) {
      parts.add('floor', quad('y', -1.19, 1.19, zS, zE, FY, true, 2));
    } else {
      const zp = PLAT_Z0;
      parts.add('floor', quad('y', -1.19, 1.19, zS, zp, FY, true, 2));
      const H = L.platformY - FY;
      for (let i = 0; i < 3; i++) {
        const z0 = zp + 0.2 * i, h = (H * (i + 1)) / 3;
        parts.add('floor', texBox(2.38, h, 0.2), M(0, FY + h / 2, z0 + 0.1));
      }
      parts.add('floor', quad('y', -1.19, 1.19, zp + 0.6, zE, L.platformY, true, 2));
      parts.add('floor', texBox(2.38, H, zE - zp - 0.6), M(0, FY + H / 2, (zp + 0.6 + zE) / 2));
      // yellow nosing on the steps
      for (let i = 0; i < 3; i++) parts.add('stripYellow', box(2.0, 0.004, 0.04), M(0, FY + (H * (i + 1)) / 3 + 0.003, zp + 0.2 * i + 0.02));
    }
    // ---- podiums over the wheel arches
    for (const p of L.podiums.filter((q) => q.sec === sec)) this.podium(parts, p);
    // ---- lower side walls (floor to the sill), cut at doors and wheel housings
    const beltR = lay.beltFn.right, beltL = lay.beltFn.left;
    for (const side of [-1, 1]) {
      const cuts = [];
      if (side > 0) for (const d of doors) cuts.push([d.z0 - 0.07, d.z1 + 0.07]);
      for (const az of axles) cuts.push([az - HOUSING_HALF - 0.02, az + HOUSING_HALF + 0.02]);
      cuts.sort((a, b) => a[0] - b[0]);
      let a = zS + (isF ? 0.1 : 0);
      const segs = [];
      for (const [c0, c1] of cuts) { if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
      segs.push([a, zE]);
      const bf = side > 0 ? beltR : beltL;
      for (const [s0, s1] of segs) {
        const n = Math.max(1, Math.round((s1 - s0) / 0.6));
        for (let i = 0; i < n; i++) {
          const za = s0 + ((s1 - s0) * i) / n, zb = s0 + ((s1 - s0) * (i + 1)) / n;
          if (zb - za < 0.04) continue;
          const top = bf((za + zb) / 2);
          parts.add('wall', box(0.03, top - FY, zb - za), M(side * (WALL_X + 0.015), (top + FY) / 2, (za + zb) / 2));
          parts.add('wall', box(0.075, 0.03, zb - za), M(side * (WALL_X - 0.02), top - 0.015, (za + zb) / 2));
        }
      }
      // window frames inside: black gasket around every pane, pillars between panes
      const panes = lay.panes[side > 0 ? 'right' : 'left'];
      for (const p of panes) {
        const [a0, b0] = p;
        const y0 = p[2] || bf((a0 + b0) / 2) + 0.03;
        const x = side * (WALL_X + 0.03);
        parts.add('frame', box(0.02, 0.05, b0 - a0 + 0.06), M(x, y0 - 0.01, (a0 + b0) / 2));
        parts.add('frame', box(0.02, 0.05, b0 - a0 + 0.06), M(x, wtop + 0.01, (a0 + b0) / 2));
        for (const zz of [a0, b0]) parts.add('frame', box(0.02, wtop - y0 + 0.04, 0.045), M(x, (y0 + wtop) / 2, zz));
        const yt = wtop - 0.34;
        if (yt > y0 + 0.2) parts.add('frame', box(0.02, 0.04, b0 - a0), M(x, yt, (a0 + b0) / 2));
      }
      // light grey pillars between panes
      const sorted = [...panes].sort((p, q) => p[0] - q[0]);
      for (let i = 0; i < sorted.length - 1; i++) {
        const za = sorted[i][1], zb = sorted[i + 1][0];
        if (zb - za > 0.02 && zb - za < 0.4) parts.add('wall', box(0.08, wtop - bf((za + zb) / 2), zb - za), M(side * (WALL_X + 0.0), (wtop + bf((za + zb) / 2)) / 2, (za + zb) / 2));
      }
      // wall above the window head up to the duct
      parts.add('wall', quad('x', zS, zE, wtop + 0.04, 2.5, side * (WALL_X + 0.035), side < 0));
    }
    // ---- door pillars (light grey, exit pictogram) and the yellow sill strip
    for (const d of doors) {
      for (const z of [d.z0 - 0.07, d.z1 + 0.07]) {
        parts.add('wall', box(0.09, wtop + 0.06 - FY, 0.09), M(WALL_X + 0.03, (wtop + 0.06 + FY) / 2, z));
        const g = decal(0.05, 0.1, this.decalRects.exit);
        g.rotateY(-Math.PI / 2);
        parts.add('signs', g, M(WALL_X - 0.02, 1.7, z));
      }
      parts.add('stripYellow', box(0.07, 0.004, d.z1 - d.z0), M(WALL_X - 0.04, FY + 0.002, (d.z0 + d.z1) / 2));
      // header band above the door
      parts.add('frame', box(0.03, 0.05, d.z1 - d.z0 + 0.14), M(WALL_X + 0.02, 2.4, (d.z0 + d.z1) / 2));
      // door push button and priority sticker on the glass side
    }
    // ---- ceiling: flat centre + sloped side ducts, lamps
    const cz0 = isF ? -6.4 : zS;
    const cz1 = zE;
    const cu = quad('y', -0.7, 0.7, cz0, cz1, CEIL_Y, false);
    {
      const uv = cu.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * ((cz1 - cz0) / 1.2));
    }
    parts.add('ceiling', cu);
    for (const side of [-1, 1]) {
      const prof = DUCT.map(([x, y]) => [side * x, y]);
      parts.add('ceiling', profileStrip(prof, cz0, cz1, 0.8, side > 0));
    }
    // lamps: warm white strips down the centre line
    const lz = isF ? [-5.4, -3.6, -1.8, 0.2] : [-2.6, -0.8, 1.0, 2.6];
    for (const z of lz) {
      if (z < cz0 + 0.4 || z > cz1 - 0.4) continue;
      parts.add('lightStrip', box(0.16, 0.012, 0.75), M(0, CEIL_Y - 0.006, z));
      parts.add('frame', box(0.2, 0.006, 0.79), M(0, CEIL_Y - 0.003, z));
    }
    // CCTV domes and the pale roof-hatch cover
    if (!this.lite) {
      for (const z of isF ? [-3.0, 0.4] : [-2.2, 1.4]) {
        const dome = new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.scale(1, 0.6, 1);
        dome.rotateX(Math.PI);
        parts.add('frame', dome, M(0.35, CEIL_Y, z));
      }
    }
    // ---- end walls at the articulation portal
    if (isF) this.endWall(parts, F.frontEnd - 0.06, true);
    else {
      this.endWall(parts, F.rearStart + 0.06, false);
      // engine bulkhead / rear wall with the rear window above the bench
      parts.add('wall', quad('z', -1.19, 1.19, L.platformY, 2.5, zE, false));
    }
    // ---- convex-less: stop and priority stickers on the glass
    if (isF && !this.lite) {
      const g = decal(0.18, 0.08, this.decalRects.sticker);
      g.rotateY(-Math.PI / 2);
      parts.add('signs', g, M(1.235, 1.62, -4.9));
      // wheelchair sign and pram on the left wall of the bay
      const w = decal(0.12, 0.12, this.decalRects.wheel);
      w.rotateY(Math.PI / 2);
      parts.add('signs', w, M(-WALL_X - 0.01, 1.6, -2.45));
    }
  },

  /** Wheel-arch podium: aisle step plus the closed wheel housing capped by a flat grey-green panel. */
  podium(parts, p) {
    const D = this.D, FY = D.floorY;
    const sg = p.side;
    const { z0, z1, axle } = p;
    const h = POD_H;
    const hz0 = axle - HOUSING_HALF, hz1 = axle + HOUSING_HALF;
    const bx = (x0, x1, za, zb) => {
      if (zb - za < 0.02) return;
      parts.add('floor', texBox(x1 - x0, h, zb - za), M(sg * (x0 + x1) / 2, FY + h / 2, (za + zb) / 2));
    };
    bx(AISLE_X, HOUSING_X, z0, z1);
    bx(HOUSING_X, WALL_X + 0.01, z0, hz0);
    bx(HOUSING_X, WALL_X + 0.01, hz1, z1);
    const podY = FY + h;
    // closed housing over the wheel: inner face, ends, top (grey-green panel)
    parts.add('wall', quad('x', hz0, hz1, podY, HOUSING_Y, sg * HOUSING_X, sg < 0));
    const xa = sg > 0 ? HOUSING_X : -WALL_X, xb = sg > 0 ? WALL_X : -HOUSING_X;
    parts.add('wall', quad('z', xa, xb, podY, HOUSING_Y, hz0, false));
    parts.add('wall', quad('z', xa, xb, podY, HOUSING_Y, hz1, true));
    parts.add('wall', quad('y', xa, xb, hz0, hz1, HOUSING_Y, true));
    // yellow edge of the step
    parts.add('stripYellow', box(0.04, 0.004, z1 - z0), M(sg * (AISLE_X + 0.02), podY + 0.002, (z0 + z1) / 2));
    parts.add('stripYellow', box(0.004, 0.04, z1 - z0), M(sg * AISLE_X, podY - 0.02, (z0 + z1) / 2));
    if (p.sec === 'front' && z0 < -6.0 || (p.sec === 'front' && z1 < 0.5)) parts.add('stripYellow', box(HOUSING_X - AISLE_X, 0.004, 0.04), M(sg * (AISLE_X + HOUSING_X) / 2, podY + 0.002, z0 + 0.02));
  },

  /** End wall at the articulation portal: light grey plate with the black rubber arch around the opening. */
  endWall(parts, z, facingRear) {
    const FY = this.D.floorY;
    const dir = facingRear ? -1 : 1;
    const wall = (x0, x1, y0, y1) => parts.add('wall', quad('z', x0, x1, y0, y1, z, facingRear ? false : true));
    wall(-1.215, -1.05, FY, 2.9);
    wall(1.05, 1.215, FY, 2.9);
    wall(-1.05, 1.05, 2.5, 2.9);
    const b = (x0, x1, y0, y1) => parts.add('frame', quad('z', x0, x1, y0, y1, z + dir * 0.004, facingRear ? false : true));
    b(-1.05, 1.05, 2.32, 2.5);
    b(-1.05, -0.93, FY, 2.32);
    b(0.93, 1.05, FY, 2.32);
  },

  addDisplayHousings(fp, rp) {
    const mk = (parts, z) => {
      const s = roundRectShape(0.64, 0.14, 0.03);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
      g.translate(0, 0, -0.07);
      parts.add('wall', g, M(-0.03, 2.5, z));
      parts.add('frame', box(0.02, 0.1, 0.02), M(-0.03, 2.58, z - 0.05));
    };
    mk(fp, -6.15);
    mk(rp, this.F.rearStart + 0.35);
  },

  buildInteriorSigns(led) {
    const inner = new InteriorLed(176, 32, 6);
    inner.on = '#ff3b1c';
    this.signs.interior = inner;
    const mat = led(inner, 1.4);
    const mkFace = (grp, z) => {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.105), mat);
      face.position.set(-0.03, 2.5, z + 0.002);
      grp.add(face);
    };
    mkFace(this.front, -6.15);
    mkFace(this.rear, this.F.rearStart + 0.35);
  },

  /** Seats from spec.layout.seats. */
  seats(fp, rp) {
    const P = seatPieces(this.quality);
    const Fd = foldPieces();
    const m4 = new THREE.Matrix4();
    for (const s of this.spec.layout.seats) {
      const parts = s.sec === 'front' ? fp : rp;
      m4.makeRotationY(s.yaw).setPosition(s.x, s.fy, s.z);
      const src = s.kind === 'fold' ? Fd : P;
      for (const [k, list] of Object.entries(src)) for (const g of list) parts.add(k, g, m4.clone());
      // wall bracket under window seats
      if (Math.abs(s.x) > 0.8 && s.kind !== 'fold') parts.add('seatDark', box(0.2, 0.025, 0.12), M(s.x + Math.sign(s.x) * 0.15, s.fy + 0.33, s.z));
      if (s.sticker && Math.abs(s.x) > 0.8 && s.kind !== 'fold') {
        const g = decal(0.12, 0.17, this.decalRects.sticker);
        g.rotateY(Math.PI);
        parts.add('signs', g, new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, s.fy + 0.75, s.z - 0.18));
      }
    }
  },

  poles(parts, sec) {
    const D = this.D, FY = D.floorY, L = this.spec.layout;
    const rad = this.lite ? 6 : 10;
    const doors = this.spec.doors.filter((d) => d.section === sec);
    const F = this.F;
    const baseY = (side, z) => {
      for (const p of L.podiums) if (p.sec === sec && p.side === side && z > p.z0 && z < p.z1) return L.podiumY;
      return L.aisleFloorY(sec, z);
    };
    const cfg = sec === 'front'
      ? { L: [-5.6, -4.7, -3.8, -1.95, -0.9, -0.1, 0.8], R: [-5.45, -4.65, -3.9, -0.9, -0.1, 0.8], rail: [-6.2, F.frontEnd - 0.25] }
      : { L: [-2.6, -1.8, -0.95, -0.05, 0.85, 2.25], R: [-0.85, -0.05, 0.85, 2.25], rail: [F.rearStart + 0.35, F.rearZ - 0.55] };
    // overhead rails
    for (const sg of [-1, 1]) {
      const [z0, z1] = cfg.rail;
      const pts = [[sg * RAIL_X, RAIL_Y, z0], [sg * RAIL_X, RAIL_Y, z1]];
      parts.add('pole', tube(pts, 0.019, rad, { caps: true }));
      for (let z = z0 + 0.8; z < z1 - 0.3; z += 1.6) parts.add('pole', rod([sg * RAIL_X, RAIL_Y + 0.01, z], [sg * 0.95, 2.56, z + 0.05], 0.011, 6));
    }
    // stanchions with swan-neck arches into the rails
    const stan = (sg, z) => {
      const yb = baseY(sg, z);
      const x = sg * (AISLE_X + 0.01);
      parts.add('pole', rod([x, yb, z], [x, 1.95, z], 0.02, rad));
      const ctrl = [[0.3, 1.95], [0.3, 2.08], [0.34, 2.2], [0.46, 2.3], [0.6, RAIL_Y], [RAIL_X, RAIL_Y]];
      const arch = smooth(ctrl.map(([ax, ay]) => [sg * ax, ay, z]), this.lite ? 8 : 14);
      parts.add('pole', tube(arch, 0.0165, this.lite ? 5 : 7, { caps: true }));
      parts.add('pole', new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(sg * RAIL_X, RAIL_Y, z));
    };
    for (const z of cfg.L) stan(-1, z);
    for (const z of cfg.R) stan(1, z);
    // stop buttons: light-grey module with a red button on every second stanchion
    let k = 0;
    for (const sg of [-1, 1]) for (const z of sg < 0 ? cfg.L : cfg.R) {
      if (k++ % 2) continue;
      const x = sg * (AISLE_X + 0.01);
      parts.add('wall', box(0.045, 0.12, 0.05), M(x, 1.45, z));
      const b = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10);
      b.rotateZ(Math.PI / 2);
      parts.add('stopBtn', b, M(x - sg * 0.025, 1.46, z));
    }
    // door poles, validators, door-open buttons
    for (const d of doors) {
      const zl = d.z0 - 0.12, zt = d.z1 + 0.12;
      const X = 1.0;
      parts.add('pole', rod([X, FY, zl], [X, 2.36, zl], 0.02, rad));
      parts.add('pole', rod([X, FY, zt], [X, 2.36, zt], 0.02, rad));
      // curved handrail over the door opening
      const top = smooth([[X, 2.36, zl], [X - 0.1, 2.46, zl + 0.2], [X - 0.1, 2.46, (zl + zt) / 2], [X - 0.1, 2.46, zt - 0.2], [X, 2.36, zt]], 14);
      void top;
      // validator on the rear pole of each door (blue terminal with dark screen)
      const vg = new THREE.PlaneGeometry(0.12, 0.2);
      vg.rotateY(-Math.PI / 2 + 0.25);
      parts.add('validator', vg, M(X - 0.075, 1.18, zt));
      parts.add('frame', box(0.07, 0.24, 0.045), M(X - 0.045, 1.18, zt + 0.02));
      // door-open button
      const bt = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12);
      bt.rotateZ(Math.PI / 2);
      parts.add('stopBtn', bt, M(X - 0.03, 1.1, zl));
    }
    // partition panel behind door 1 with a red rail on top (ref04, ref05) and a barrier at door 2
    if (sec === 'front') {
      const zp = -6.32;
      parts.add('cabPanel', box(0.8, 0.98 - FY, 0.04), M(0.82, (0.98 + FY) / 2, zp));
      parts.add('pole', rod([0.42, 1.0, zp], [1.19, 1.0, zp], 0.019, 8));
      parts.add('pole', rod([0.42, FY, zp], [0.42, 1.0, zp], 0.019, 8));
      // wheelchair bay: horizontal grab rails on the left wall and from the stanchion
      parts.add('pole', rod([-AISLE_X - 0.01, 0.95, -2.9], [-WALL_X + 0.03, 0.95, -2.9], 0.017, 8));
      parts.add('pole', rod([-AISLE_X - 0.01, 0.95, -1.95], [-WALL_X + 0.03, 0.95, -1.95], 0.017, 8));
      // door 2 barrier: red bar behind the door row
      parts.add('pole', rod([1.0, 0.98, -1.75], [0.55, 0.98, -1.75], 0.017, 8));
      parts.add('pole', rod([0.55, 0.98, -1.75], [0.55, FY, -1.75], 0.017, 8));
      // red rail along the window-seat backs between door 1 and the wheel housing
      parts.add('pole', rod([0.3, 1.0, -5.0], [0.3, 1.0, -4.0], 0.017, 8));
    }
  },
};
void CEIL_Y;
