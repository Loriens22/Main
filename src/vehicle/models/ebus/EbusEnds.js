// Fronts and rears of the two line-84 battery buses (mixed into TrolleyModel), built from the reference photographs
// (design values in designs.js front / rear):
//   SOR EBN 11 (ref03 front, ref01 front three-quarter, ref04 rear): the green bumper with the twin round lamps in
//     silver pods and the plate, a silver line across, the black mask with the silver crescent, the emblem and the
//     fleet number, the windscreen leaning back with the black sign band behind its top, green pillars on the front
//     corners up to the roof; the green rear with the large black glazed panel in its silver frame, round lamps
//     stacked on the corners, marker lamps on the top corners.
//   Yutong E12 (ref08 front, ref09 rear): a dark lip, the white fascia with the V crease, the round emblem, the
//     fleet number and the three-lamp clusters in dark slots, the near-vertical windscreen and the separate display
//     glass over it, black corner pillars; the white rear with the big black window, two louvre slots, the round
//     emblem, the arms and lettering and the vertical lamp columns.
import * as THREE from 'three';
import { M, box, endOutline, endBand, endDecal } from '../trolley/geom.js';
import { roofInset, endCap, zAt, lamp } from '../trolley/TrolleyEnds.js';
import { tkMesh } from '../trolley/TrolleyKit.js';

/** Splits a plan outline at |x| = t into the left corner, the middle and the right corner (shared end points). */
function splitOutline(ol, t) {
  const left = [], mid = [], right = [];
  for (let i = 0; i < ol.length; i++) {
    const [x, dz] = ol[i];
    if (i > 0) {
      const [px, pdz] = ol[i - 1];
      for (const c of [-t, t]) {
        if ((px - c) * (x - c) < 0) {
          const u = (c - px) / (x - px), q = [c, pdz + (dz - pdz) * u];
          if (c < 0) { left.push(q); mid.push(q); } else { mid.push(q); right.push(q); }
        }
      }
    }
    if (x <= -t) left.push([x, dz]);
    else if (x >= t) right.push([x, dz]);
    else mid.push([x, dz]);
  }
  return { left, mid, right };
}

export const EbusEndsMixin = {
  /** Lean of the windscreen plane: z offset at height y (0 below the windscreen). */
  leanAt(y) {
    const Fr = this.G.front;
    const k = Fr.rake / Math.max(0.1, Fr.signTop - Fr.wsBottom);
    return Math.max(0, y - Fr.wsBottom) * k;
  },

  /** A front band between y0 and y1 that follows the windscreen lean above wsBottom. */
  fBand(p, key, ol, y0, y1, opts = {}) {
    const z0 = this.F.frontZ + (opts.dz || 0);
    const l0 = this.leanAt(y0), l1 = this.leanAt(y1);
    p.add(key, endBand(ol, z0 + l0, -1, y0, y1, { rows: opts.rows || 2, rake: l1 - l0, inset: opts.inset || null, curveOut: opts.curveOut || 0 }));
  },

  /** Shared front fittings: side repeaters, mirrors (Blender kit), wipers, the dashboard ledge behind the glass. */
  frontFittings(p, zc, lampY) {
    const D = this.D, G = this.G, F = this.F, Fr = G.front, hw = D.halfW, z0 = F.frontZ;
    p.add('dash', box(hw * 2 - 0.35, 0.08, 0.5), M(0, Fr.wsBottom + 0.03, z0 + 0.45));
    for (const sx of [-1, 1]) p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.02, 0.05, 0.12), M(sx * (hw + 0.006), lampY, z0 + 0.7));
    const mir = tkMesh(G.mirrors, { castShadow: true });
    if (mir) { mir.position.set(0, G.mirrorY || 0, z0); this.front.add(mir); this.smallTrim = (this.smallTrim || []).concat(mir); }
    this.wipers = [];
    for (const [px, dir] of [[-0.78, 1], [0.22, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, Fr.wsBottom + 0.05, zc(px) - 0.03 + this.leanAt(Fr.wsBottom + 0.05));
      const arm = new THREE.Mesh(box(0.02, 0.85, 0.015), this.mats.matteBlack);
      arm.position.set(0, 0.42, 0);
      const blade = new THREE.Mesh(box(0.012, 0.8, 0.02), this.mats.rubber);
      blade.position.set(0.03, 0.5, -0.01);
      pivot.add(arm, blade);
      pivot.rotation.z = -1.42;
      this.front.add(pivot);
      this.wipers.push({ pivot, dir, rest: -1.42 });
    }
  },

  /** Windscreen, sign band and the top of a front over the middle outline mid (both buses). */
  frontGlass(p, mid, roofY, inset) {
    const Fr = this.G.front, F = this.F;
    this.fBand(p, 'windscreen', mid, Fr.wsBottom, Fr.wsTop, { rows: 6, curveOut: 0.008 });
    this.fBand(p, 'windscreenIn', mid, Fr.wsBottom, Fr.wsTop, { rows: 6, dz: 0.012, curveOut: 0.008 });
    // black divider, then the sign glass with the black backing behind it (the LED sign sits between them)
    this.fBand(p, 'black', mid, Fr.wsTop - 0.012, Fr.wsTop + 0.035, { rows: 1, dz: -0.003 });
    this.fBand(p, 'windscreen', mid, Fr.wsTop + 0.035, Fr.signTop, { rows: 2 });
    this.fBand(p, 'black', mid, Fr.wsTop, Fr.signTop, { rows: 1, dz: 0.11 });
    this.fBand(p, 'black', mid, Fr.signTop, roofY, { rows: 3, inset });
    void F;
  },

  // ---------------------------------------------------------------- SOR EBN 11
  buildFrontSor(p) {
    const D = this.D, G = this.G, F = this.F, Fr = G.front;
    const hw = D.halfW, r = G.bodyR, z0 = F.frontZ, roofY = D.roofY, bulge = Fr.bulge;
    const ol = endOutline(hw, r, 10, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z0 + r;
    const zc = (x) => zAt(hw, r, bulge, z0, -1, x);
    const { left, mid, right } = splitOutline(ol, hw - Fr.pillar);
    // bumper: dark lip under the green, the green bumper, the silver line across
    p.add('rubber', endBand(endOutline(hw - 0.03, r, 10, bulge - 0.012), z0 + 0.015, -1, D.skirtY - 0.03, D.skirtY + 0.05, { rows: 1 }));
    p.add('blue', endBand(ol, z0, -1, D.skirtY + 0.05, Fr.bumper, { rows: 3 }));
    p.add('alu', endBand(endOutline(hw + 0.005, r, 10, bulge + 0.005), z0, -1, Fr.bumper, Fr.silver, { rows: 1 }));
    // green corner pillars from the silver line to the roof edge, the black mask between them
    for (const c of [left, right]) {
      this.fBand(p, 'blue', c, Fr.silver, Fr.wsBottom, { rows: 2 });
      this.fBand(p, 'blue', c, Fr.wsBottom, roofY, { rows: 10, inset });
    }
    this.fBand(p, 'black', mid, Fr.silver, Fr.wsBottom, { rows: 3 });
    this.frontGlass(p, mid, roofY, inset);
    p.add('paint', endCap(ol, z0 + this.leanAt(roofY), -1, roofY, zSide, G.roofEdgeR, 0));
    // the silver crescent, the emblem and the fleet number on the mask
    p.add('ebusFront', endDecal(hw, r, bulge, z0, -1, Fr.silver + 0.005, Fr.wsBottom - 0.02, -1.0, 1.0));
    // twin round headlamps in a silver pod at each corner of the bumper, the fog lamp below, an indicator outside
    for (const sx of [-1, 1]) {
      const y = 0.53;
      p.add('chrome', box(0.32, 0.13, 0.03, 0.06), M(sx * 0.87, y, zc(sx * 0.87) - 0.006));
      for (const [x, rr] of [[0.8, 0.046], [0.94, 0.04]]) {
        lamp(p, 'lampBezel', sx * x, y, zc(sx * x) - 0.022, rr + 0.012, -1);
        lamp(p, 'headlamp', sx * x, y, zc(sx * x) - 0.026, rr, -1);
      }
      lamp(p, 'lampBezel', sx * 0.93, 0.36, zc(sx * 0.93) - 0.008, 0.042, -1);
      lamp(p, 'headlamp', sx * 0.93, 0.36, zc(sx * 0.93) - 0.012, 0.03, -1);
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.06, 0.035, 0.012, 0.01), M(sx * 1.07, 0.62, zc(sx * 1.07) - 0.006));
    }
    p.add('ebusPlate', box(0.52, 0.11, 0.008), M(0, 0.43, zc(0) - 0.012));
    // route card and pictograms inside the windscreen, lower right (door side, ref03)
    const card = new THREE.PlaneGeometry(0.42, 0.32);
    card.rotateY(Math.PI);
    p.add('ebusCard', card, M(0.6, Fr.wsBottom + 0.22, zc(0.6) + this.leanAt(Fr.wsBottom + 0.22) + 0.06));
    this.frontFittings(p, zc, 0.95);
  },

  buildRearSor(p) {
    const D = this.D, G = this.G, F = this.F, Rr = G.rear;
    const hw = D.halfW, r = G.bodyR, z1 = F.rearZ, roofY = D.roofY, bulge = Rr.bulge;
    const ol = endOutline(hw, r, 10, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z1 - r;
    const zr = (x) => zAt(hw, r, bulge, z1, 1, x);
    p.add('rubber', endBand(endOutline(hw - 0.03, r, 10, bulge - 0.012), z1 - 0.015, 1, D.skirtY - 0.03, D.skirtY + 0.05, { rows: 1 }));
    p.add('blue', endBand(ol, z1, 1, D.skirtY + 0.05, roofY, { rows: 10, inset }));
    p.add('paint', endCap(ol, z1, 1, roofY, zSide, G.roofEdgeR, 0));
    // the large black glazed panel in its silver frame, with the lettering (ref04)
    p.add('ebusRear', endDecal(hw, r, bulge, z1 + 0.001, 1, Rr.panelBottom, Rr.panelTop, -1.02, 1.02));
    // round lamps stacked on the corners: indicator and tail above, brake and reversing lamp below
    for (const sx of [-1, 1]) {
      const x = sx * 1.1;
      for (const [y, key, rr] of [[1.24, sx < 0 ? 'indicatorL' : 'indicatorR', 0.04], [1.09, 'tail', 0.045], [0.76, 'brake', 0.045], [0.62, 'reverse', 0.035]]) {
        lamp(p, 'lampBezel', x, y, zr(x) + 0.012, rr + 0.012, 1);
        lamp(p, key, x, y, zr(x) + 0.016, rr, 1);
      }
      p.add('tail', box(0.07, 0.035, 0.02, 0.01), M(sx * 0.95, roofY - 0.1, zr(sx * 0.95) + 0.004));
    }
    p.add('ebusPlate', box(0.52, 0.11, 0.008), M(0.05, 0.44, zr(0) + 0.012));
  },

  // ---------------------------------------------------------------- Yutong E12
  buildFrontE12(p) {
    const D = this.D, G = this.G, F = this.F, Fr = G.front;
    const hw = D.halfW, r = G.bodyR, z0 = F.frontZ, roofY = D.roofY, bulge = Fr.bulge;
    const ol = endOutline(hw, r, 10, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z0 + r;
    const zc = (x) => zAt(hw, r, bulge, z0, -1, x);
    const { left, mid, right } = splitOutline(ol, hw - 0.08);
    p.add('satin', endBand(endOutline(hw - 0.02, r, 10, bulge - 0.008), z0 + 0.01, -1, D.skirtY - 0.03, Fr.lip, { rows: 1 }));
    p.add('paint', endBand(ol, z0, -1, Fr.lip, Fr.fascia, { rows: 4 }));
    p.add('black', endBand(endOutline(hw + 0.002, r, 10, bulge), z0 - 0.001, -1, Fr.fascia, Fr.wsBottom, { rows: 1 }));
    for (const c of [left, right]) this.fBand(p, 'black', c, Fr.wsBottom, roofY, { rows: 8, inset });
    this.frontGlass(p, mid, roofY, inset);
    p.add('paint', endCap(ol, z0 + this.leanAt(roofY), -1, roofY, zSide, G.roofEdgeR, 0));
    p.add('ebusFront', endDecal(hw, r, bulge, z0, -1, Fr.lip + 0.01, Fr.fascia - 0.005, -1.12, 1.12));
    // three round lamps in a dark slot rising towards each corner, the fog lamp below
    for (const sx of [-1, 1]) {
      const g = box(0.42, 0.1, 0.03, 0.04);
      g.rotateZ(sx * 0.12);
      p.add('lampBlack', g, M(sx * 0.84, 0.6, zc(sx * 0.84) - 0.004));
      [[0.7, 0.028, 'drl'], [0.82, 0.034, 'headlamp'], [0.94, 0.038, 'headlamp']].forEach(([x, rr, key], k) => {
        const y = 0.585 + k * 0.016;
        lamp(p, 'lampBezel', sx * x, y, zc(sx * x) - 0.022, rr + 0.01, -1);
        lamp(p, key, sx * x, y, zc(sx * x) - 0.026, rr, -1);
      });
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.05, 0.03, 0.01, 0.008), M(sx * 1.07, 0.64, zc(sx * 1.07) - 0.008));
      lamp(p, 'lampBezel', sx * 0.92, 0.34, zc(sx * 0.92) - 0.008, 0.04, -1);
      lamp(p, 'headlamp', sx * 0.92, 0.34, zc(sx * 0.92) - 0.012, 0.028, -1);
    }
    p.add('ebusPlate', box(0.52, 0.11, 0.008), M(0, 0.42, zc(0) - 0.012));
    this.frontFittings(p, zc, 1.0);
  },

  buildRearE12(p) {
    const D = this.D, G = this.G, F = this.F, Rr = G.rear;
    const hw = D.halfW, r = G.bodyR, z1 = F.rearZ, roofY = D.roofY, bulge = Rr.bulge;
    const ol = endOutline(hw, r, 10, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z1 - r;
    const zr = (x) => zAt(hw, r, bulge, z1, 1, x);
    p.add('satin', endBand(endOutline(hw - 0.02, r, 10, bulge - 0.008), z1 - 0.01, 1, D.skirtY - 0.03, D.skirtY + 0.07, { rows: 1 }));
    p.add('paint', endBand(ol, z1, 1, D.skirtY + 0.07, roofY, { rows: 10, inset }));
    p.add('paint', endCap(ol, z1, 1, roofY, zSide, G.roofEdgeR, 0));
    // the big rear window (dark glass with rounded upper corners) and the lower panel's lettering
    p.add('ebusRearWin', endDecal(hw, r, bulge, z1 + 0.001, 1, Rr.winBottom, Rr.winTop, -1.13, 1.13));
    p.add('ebusRear', endDecal(hw, r, bulge, z1 + 0.002, 1, 0.6, 1.7, -1.15, 1.15));
    // a horizontal panel joint over the bumper and the two louvre slots of the equipment panel
    p.add('satin', box(2.0, 0.012, 0.01), M(0, Rr.bumper, zr(0) + 0.004));
    for (const y of [1.5, 1.42]) p.add('lampBlack', box(1.02, 0.026, 0.012, 0.01), M(0, y, zr(0) + 0.002));
    p.add('satin', box(0.12, 0.18, 0.01, 0.01), M(-0.04, 1.08, zr(0) + 0.005)); // service hatch
    // vertical lamp columns on the corners: indicator, tail / brake, reversing lamp; a reflector in the bumper
    for (const sx of [-1, 1]) {
      const x = sx * 1.12;
      p.add('paint', box(0.13, 0.56, 0.03, 0.05), M(x, 1.3, zr(x) + 0.006));
      for (const [y, key, rr] of [[1.48, sx < 0 ? 'indicatorL' : 'indicatorR', 0.042], [1.3, 'brake', 0.045], [1.3, 'tail', 0.032], [1.12, 'reverse', 0.042]]) {
        lamp(p, 'lampBezel', x, y, zr(x) + 0.024, rr + 0.01, 1);
        lamp(p, key, x, y, zr(x) + 0.028 + (key === 'tail' ? 0.002 : 0), rr, 1);
      }
      lamp(p, 'tail', sx * 1.13, 0.36, zr(sx * 1.13) + 0.012, 0.03, 1);
    }
    p.add('ebusPlate', box(0.52, 0.11, 0.008), M(-0.35, 0.43, zr(-0.35) + 0.012));
    // the camera dome over the window, left (ref09)
    p.add('satin', new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(-0.72, roofY - 0.02, z1 - 0.12));
  },
};
