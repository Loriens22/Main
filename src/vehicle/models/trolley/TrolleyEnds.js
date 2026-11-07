// Fronts and rears of the line-9 trolleybuses, built from the reference photographs (designs.js front / rear):
//   Solaris IV (ref02, ref13; rear ref09): blue bumper with the LED headlamps in black angular housings at its
//     corners and the fleet plate, the orange front panel with pictograms, fleet number, badge and mascot; a black
//     frame round the tall windscreen and the black sign band above it; the sky-blue roof cap. Rear: blue bumper,
//     a black strip with four round lamps a side, the orange panel with the domed tow-hook cover and the fleet
//     number, the black glazed upper half with the small route display.
//   Solaris III (ref17; rear ref08): blue bumper with round fog lamps and the blue fleet plate, the silver lamp band
//     with four round lamps at each corner and the SOLARIS strip, the yellow front flap; rear: the silver strip with
//     three round lamps a side, the yellow panel with the chrome retriever drums, the black glazed upper half.
//   Ikarus 280.92F (ref05, ref07, ref12, ref18; rear ref11): the flat yellow front fitted in Sofia, a black band
//     with a grille slot under the windscreen, three-lamp clusters, a black grille 'smile', fog lamps, the fleet
//     number; the yellow rear with a large rubber-set window, tall red lamps and the rope reels.
import * as THREE from 'three';
import { M, box, endOutline, endBand, endDecal, frameRect, SHROUD_LEAN } from './geom.js';
import { tkMesh } from './TrolleyKit.js';

/** Inset of the outline near the roof so the ends meet the rounded roof edge of the sides. */
export function roofInset(roofY, R) {
  return (y) => {
    const t = y - (roofY - R);
    return t <= 0 ? 0 : R - Math.sqrt(Math.max(0, R * R - t * t));
  };
}

/** Flat cap at height y closing an end between its outline (with inset k) and the start of the sides. */
export function endCap(outline, zBase, dir, y, zSide, k, rake) {
  const pts = outline.map(([x, dz]) => [Math.sign(x) * Math.max(0, Math.abs(x) - k), zBase - dir * (dz + rake + k * 0.6)]);
  const hwk = Math.abs(pts[0][0]);
  const s = new THREE.Shape();
  s.moveTo(-hwk, -zSide);
  for (const [x, z] of pts) s.lineTo(x, -z);
  s.lineTo(hwk, -zSide);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  if (dir > 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

/** z of an end outline at x (front: dir -1, the body towards +z). */
export function zAt(hw, r, bulge, zBase, dir, x) {
  const ax = Math.abs(x), flat = hw - r;
  let dz;
  if (ax <= flat) { const u = x / flat; dz = -bulge * (1 - u * u); } else { const t = Math.min(1, (ax - flat) / r); dz = r - Math.sqrt(Math.max(0, r * r - (t * r) ** 2)); }
  return zBase - dir * dz;
}

/** A disc lamp facing out of an end (front: -z), radius r, at (x, y) on the outline, proud by d. */
export function lamp(p, key, x, y, z, r, dir, d = 0.006) {
  const c = new THREE.CircleGeometry(r, 20);
  if (dir < 0) c.rotateY(Math.PI);
  p.add(key, c, M(x, y, z - dir * -d));
}

export const EndsMixin = {
  buildFront(p) {
    if (this.G.ends === 'sor') return this.buildFrontSor(p);
    if (this.G.ends === 'e12') return this.buildFrontE12(p);
    const D = this.D, G = this.G, F = this.F, Fr = G.front;
    const hw = D.halfW, r = G.bodyR, z0 = F.frontZ, roofY = D.roofY, bulge = Fr.bulge;
    const ol = endOutline(hw, r, 8, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z0 + r;
    const zc = (x) => zAt(hw, r, bulge, z0, -1, x);
    const rake = Fr.rake;
    if (!G.old) {
      // ---- Solaris: bumper, (silver lamp band,) coloured panel
      p.add('blue', endBand(ol, z0, -1, D.skirtY, Fr.bumper, { rows: 2 }));
      if (G.gen === 3) {
        p.add('alu', endBand(endOutline(hw + 0.004, r, 8, bulge + 0.004), z0, -1, Fr.bumper, Fr.silver, { rows: 1 }));
        p.add('band', endBand(ol, z0, -1, Fr.silver, Fr.panelTop, { rows: 3 }));
        // the dark seam under the yellow flap and the SOLARIS lettering on the silver strip (no logo graphics)
        p.add('satin', endBand(endOutline(hw + 0.006, r, 8, bulge + 0.006), z0, -1, Fr.silver - 0.008, Fr.silver + 0.004));
        for (const sx of [-1, 1]) lamp(p, 'headlamp', sx * 0.98, 0.42, zc(sx * 0.98), 0.045, -1);
      } else {
        p.add('band', endBand(ol, z0, -1, Fr.bumper, Fr.panelTop, { rows: 4 }));
        // black angular housings of the LED headlamps at the corners, sweeping up from the bumper into the panel
        // (ref02, ref13): two round projectors, the running-light strip along the top, a fog lamp below
        for (const sx of [-1, 1]) {
          const B = Fr.bumper;
          const pts = [[0.6, B - 0.06], [1.2, B - 0.13], [1.25, B + 0.03], [1.02, B + 0.11], [0.66, B + 0.03]].map(([x, y]) => [sx * x, y]);
          const s2 = new THREE.Shape();
          s2.moveTo(pts[0][0], pts[0][1]);
          for (const q of pts.slice(1)) s2.lineTo(q[0], q[1]);
          const g = new THREE.ShapeGeometry(s2);
          g.rotateY(Math.PI);
          g.scale(-1, 1, 1);
          p.add('black', g, M(0, 0, zc(sx * 0.95) - 0.014));
          lamp(p, 'chrome', sx * 0.96, B + 0.01, zc(sx * 0.96) - 0.016, 0.05, -1);
          lamp(p, 'headlamp', sx * 0.96, B + 0.01, zc(sx * 0.96) - 0.018, 0.034, -1);
          lamp(p, 'chrome', sx * 1.1, B - 0.02, zc(sx * 1.1) - 0.016, 0.045, -1);
          lamp(p, 'headlamp', sx * 1.1, B - 0.02, zc(sx * 1.1) - 0.018, 0.03, -1);
          p.add('drl', box(0.42, 0.014, 0.01), M(sx * 0.9, B + 0.065, zc(sx * 0.9) - 0.018));
          lamp(p, 'headlamp', sx * 0.78, B - 0.05, zc(sx * 0.78) - 0.016, 0.022, -1);
          lamp(p, sx < 0 ? 'indicatorL' : 'indicatorR', sx * 1.18, B + 0.06, zc(sx * 1.18) - 0.016, 0.02, -1);
          for (let k = 0; k < 3; k++) p.add('black', box(0.24, 0.012, 0.01), M(sx * 0.95, B - 0.17 - k * 0.03, zc(sx * 0.95) - 0.008));
          lamp(p, 'headlamp', sx * 0.98, 0.37, zc(sx * 0.98) - 0.004, 0.03, -1);
        }
      }
      // black frame round the windscreen and the sign band
      p.add('black', endBand(endOutline(hw + 0.003, r, 8, bulge), z0 - 0.001, -1, Fr.panelTop, Fr.wsBottom + 0.02, { rows: 1 }));
      // Solaris IV: the glass reaches the shroud crease, the front narrowing with the leaning shroud sides above the
      // window line (ref13); the thin blue cap over it is level with the shroud top
      const SH = G.shroud, wtop = D.windowTopY;
      const topY = SH ? SH.top + 0.035 : roofY;
      const lean = SH ? (y) => (y <= wtop ? 0 : SHROUD_LEAN * Math.pow(Math.min(1, (y - wtop) / (SH.top - wtop)), 1.8)) : null;
      const capInset = SH ? lean : inset;
      const wsOl = endOutline(hw - 0.004, r, 8, bulge);
      p.add('windscreen', endBand(wsOl, z0, -1, Fr.wsBottom, Fr.wsTop, { rake, rows: 6, curveOut: 0.01, inset: lean }));
      p.add('windscreenIn', endBand(wsOl, z0 + 0.012, -1, Fr.wsBottom, Fr.wsTop, { rake, rows: 6, curveOut: 0.01, inset: lean }));
      // sign band: dark glass with the black divider under it (the LED sign sits behind it)
      p.add('black', endBand(endOutline(hw + 0.002, r, 8, bulge), z0 + rake - 0.004, -1, Fr.wsTop - 0.01, Fr.wsTop + 0.05, { rows: 1, inset: lean }));
      p.add('windscreen', endBand(ol, z0 + rake, -1, Fr.wsTop + 0.05, Fr.signTop, { rake: 0.03, rows: 3, inset: lean }));
      p.add('black', endBand(endOutline(hw - 0.01, r, 8, bulge), z0 + rake + 0.1, -1, Fr.wsTop, Fr.signTop, { rake: 0.03, rows: 3, inset: lean }));
      // the sky-blue roof cap over the front
      p.add('paint', endBand(ol, z0 + rake + 0.03, -1, Fr.signTop, topY, { rake: 0.04, rows: 3, inset: capInset }));
      p.add('paint', endCap(ol, z0 + rake + 0.03, -1, topY, zSide, capInset(topY), 0.04));
      // black corner pillars from the panel to the roof cap
      for (const sx of [-1, 1]) {
        const pil = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, y = Fr.panelTop + (Fr.signTop - Fr.panelTop) * t, k = lean ? lean(y) : 0;
          pil.push(new THREE.Vector3(sx * (hw - 0.03 - k), y, z0 + r * 0.6 + (rake + 0.02) * t + k * 0.6));
        }
        p.add('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pil), 10, 0.05, 6, false));
      }
      // decals on the panel, the plate on the bumper
      p.add('frontDecal', endDecal(hw, r, bulge, z0, -1, Fr.panelTop - 0.36, Fr.panelTop - 0.06, -1.05, 1.05));
      p.add('plate', box(0.5, 0.12, 0.008), M(0, G.gen === 4 ? 0.37 : 0.43, zc(0) - 0.012));
    } else {
      // ---- Ikarus: flat yellow front with the black band, the windscreen, yellow above
      p.add('paint', endBand(ol, z0, -1, D.skirtY, Fr.panelTop, { rows: 4 }));
      p.add('black', endBand(endOutline(hw + 0.003, r, 8, bulge), z0 - 0.001, -1, Fr.panelTop, Fr.blackTop, { rows: 1 }));
      p.add('grille', box(1.6, 0.03, 0.01), M(0, Fr.panelTop + 0.07, zc(0) - 0.012));
      const wsOl = endOutline(hw - 0.004, r, 8, bulge);
      p.add('windscreen', endBand(wsOl, z0, -1, Fr.wsBottom, Fr.wsTop, { rake, rows: 6 }));
      p.add('windscreenIn', endBand(wsOl, z0 + 0.012, -1, Fr.wsBottom, Fr.wsTop, { rake, rows: 6 }));
      // black frame round the windscreen
      p.add('black', endBand(endOutline(hw + 0.002, r, 8, bulge), z0 + rake - 0.002, -1, Fr.wsTop - 0.02, Fr.wsTop + 0.05, { rows: 1 }));
      for (const sx of [-1, 1]) p.add('black', box(0.08, Fr.wsTop - Fr.wsBottom, 0.06), M(sx * (hw - 0.05), (Fr.wsTop + Fr.wsBottom) / 2, z0 + r * 0.5 + rake / 2));
      p.add('paint', endBand(ol, z0 + rake, -1, Fr.wsTop + 0.05, roofY, { rake: 0.02, rows: 3, inset }));
      p.add('paint', endCap(ol, z0 + rake, -1, roofY, zSide, G.roofEdgeR, 0.02));
      // the grille 'smile', the panel recess round it, the plate recess
      p.add('grille', box(0.95, 0.07, 0.02, 0.03), M(0, 0.96, zc(0) - 0.006));
      p.add('satin', box(1.25, 0.012, 0.012), M(0, 1.06, zc(0) - 0.006));
      p.add('satin', box(1.25, 0.012, 0.012), M(0, 0.86, zc(0) - 0.006));
      p.add('satin', box(0.6, 0.18, 0.006), M(0, 0.55, zc(0) - 0.004));
      p.add('rubber', box(hw * 2 - 0.2, 0.06, 0.04), M(0, D.skirtY + 0.06, zc(0) - 0.01));
      for (const sx of [-1, 1]) lamp(p, 'headlamp', sx * 0.98, 0.6, zc(sx * 0.98) - 0.004, 0.04, -1);
      // fleet number on the panel, front left (ref18)
      p.add('frontDecal', endDecal(hw, r, bulge, z0, -1, 0.98, 1.17, 0.1, 1.05));
      p.add('blue', box(0.02, G.bandTop - D.skirtY, 0.1), M(hw + 0.004, (G.bandTop + D.skirtY) / 2, z0 + r));
      p.add('blue', box(0.02, G.bandTop - D.skirtY, 0.1), M(-hw - 0.004, (G.bandTop + D.skirtY) / 2, z0 + r));
    }
    // dashboard ledge seen through the glass
    p.add('dash', box(hw * 2 - 0.25, 0.08, 0.5), M(0, Fr.wsBottom + 0.03, z0 + 0.4));
    // headlamp clusters (Blender kit), moved to the lamp line of this front, with their clear lenses and lamps
    const heads = G.gen === 4 ? null : tkMesh(G.heads, { castShadow: false });
    if (heads) { heads.position.set(0, Fr.lampDy, z0 - 0.002 - (G.old ? 0 : 0.01)); this.front.add(heads); }
    if (G.gen === 3) {
      for (const sx of [-1, 1]) {
        // four round lamps in the silver band, outermost largest (ref17)
        [[0.66, 0.025], [0.76, 0.04], [0.88, 0.042], [1.0, 0.03]].forEach(([x, rr], k) => lamp(p, k === 1 || k === 2 ? 'headlamp' : 'drl', sx * x, Fr.lampY - 0.01 + (k === 3 ? 0.02 : 0), zc(sx * x) - 0.012, rr, -1));
        p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.1, 0.03, 0.01), M(sx * 1.08, Fr.lampY + 0.05, zc(sx * 1.08) - 0.012));
      }
    } else if (G.old) {
      for (const sx of [-1, 1]) {
        p.add('chrome', box(0.36, 0.13, 0.02, 0.05), M(sx * 0.86, Fr.lampY, zc(sx * 0.86) - 0.008));
        [[0.74, 0.035], [0.85, 0.04], [0.97, 0.045]].forEach(([x, rr]) => lamp(p, 'headlamp', sx * x, Fr.lampY, zc(sx * x) - 0.02, rr, -1));
        p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.06, 0.1, 0.012), M(sx * 1.1, Fr.lampY, zc(sx * 1.1) - 0.012));
      }
    }
    // side repeaters on the front corners
    for (const sx of [-1, 1]) p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.02, 0.05, 0.12), M(sx * (hw + 0.006), G.old ? 1.3 : 0.95, z0 + 0.6));
    // mirrors (Blender kit)
    const mir = tkMesh(G.mirrors, { castShadow: true });
    if (mir) { mir.position.set(0, G.old ? 0 : 0.18, z0); this.front.add(mir); this.smallTrim = (this.smallTrim || []).concat(mir); }
    // wipers parked along the bottom of the windscreen
    this.wipers = [];
    for (const [px, dir] of [[-0.75, 1], [0.25, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, Fr.wsBottom + 0.05, zc(px) - 0.03);
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

  buildRearEnd(p) {
    if (this.G.ends === 'sor') return this.buildRearSor(p);
    if (this.G.ends === 'e12') return this.buildRearE12(p);
    const D = this.D, G = this.G, F = this.F, Rr = G.rear;
    const hw = D.halfW, r = G.bodyR, z1 = F.rearZ, roofY = D.roofY;
    const ol = endOutline(hw, r, 8, 0.0);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z1 - r;
    const zr = (x) => zAt(hw, r, 0, z1, 1, x);
    if (!G.old) {
      p.add('blue', endBand(ol, z1, 1, D.skirtY, Rr.bumper, { rows: 1 }));
      if (G.gen === 4) {
        // black lamp strip with four round lamps a side (ref09)
        p.add('black', endBand(ol, z1, 1, Rr.bumper, Rr.strip));
        for (const sx of [-1, 1]) {
          ['reverse', 'brake', 'tail', sx < 0 ? 'indicatorL' : 'indicatorR'].forEach((k, i) => lamp(p, k, sx * (0.78 + i * 0.12), (Rr.bumper + Rr.strip) / 2, zr(sx * (0.78 + i * 0.12)) + 0.008, 0.042, 1));
        }
      } else {
        // silver strip with three round lamps a side and the SOLARIS lettering (ref08)
        p.add('alu', endBand(endOutline(hw + 0.004, r, 8, 0), z1, 1, Rr.bumper, Rr.strip));
        for (const sx of [-1, 1]) {
          ['reverse', 'brake', sx < 0 ? 'indicatorL' : 'indicatorR'].forEach((k, i) => lamp(p, k, sx * (0.92 + i * 0.1), (Rr.bumper + Rr.strip) / 2, zr(sx * (0.92 + i * 0.1)) + 0.01, 0.036, 1));
        }
        for (const sx of [-1, 1]) lamp(p, 'tail', sx * 1.05, 0.4, zr(sx * 1.05) + 0.006, 0.03, 1);
      }
      p.add('band', endBand(ol, z1, 1, Rr.strip, Rr.panelTop, { rows: 2 }));
      // black glazed upper half: the frame, the rear window, the route display at the top
      p.add('black', endBand(ol, z1, 1, Rr.panelTop, Math.min(Rr.winTop, roofY), { rows: 3, inset: Rr.winTop >= roofY - 0.01 ? inset : null }));
      const gl = new THREE.PlaneGeometry(hw * 2 - 0.5, Rr.winTop - Rr.panelTop - 0.5);
      p.add('glassOut', gl, M(0, (Rr.panelTop + Rr.winTop) / 2 - 0.1, z1 + 0.004));
      const gi = new THREE.PlaneGeometry(hw * 2 - 0.5, Rr.winTop - Rr.panelTop - 0.5);
      gi.rotateY(Math.PI);
      p.add('glassIn', gi, M(0, (Rr.panelTop + Rr.winTop) / 2 - 0.1, z1 - 0.03));
      for (const sx of [-1, 1]) p.add('tail', box(0.12, 0.04, 0.01), M(sx * 0.95, Math.min(Rr.winTop, roofY) - 0.08, z1 + 0.008));
      const cap = 'paint';
      if (Rr.winTop < roofY - 0.01) p.add(cap, endBand(ol, z1, 1, Rr.winTop, roofY, { rows: 3, inset }));
      p.add(cap, endCap(ol, z1, 1, roofY, zSide, G.roofEdgeR, 0));
      if (G.gen === 4) {
        // the domed tow-hook cover in the orange panel (ref09)
        // a wide rounded cover (about 1.05 x 0.38 m, estimated from ref09) with a slimmer raised centre and two
        // round fasteners
        p.add('band', box(1.05, 0.38, 0.06, 0.1), M(0, Rr.strip + 0.37, z1 + 0.02));
        p.add('band', box(0.86, 0.26, 0.05, 0.08), M(0, Rr.strip + 0.37, z1 + 0.06));
        p.add('satin', box(0.86, 0.008, 0.012), M(0, Rr.strip + 0.18, z1 + 0.05));
        p.add('satin', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16).rotateX(Math.PI / 2), M(0, Rr.strip + 0.37, z1 + 0.09));
        for (const sx of [-1, 1]) p.add('satin', new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10).rotateX(Math.PI / 2), M(sx * 0.3, Rr.strip + 0.3, z1 + 0.09));
      }
      p.add('rearDecal', new THREE.PlaneGeometry(0.5, 0.125), M(0, G.gen === 4 ? Rr.strip + 0.76 : Rr.strip + 0.42, z1 + 0.011));
      p.add('plate', box(0.5, 0.12, 0.008), M(0, G.gen === 4 ? 0.52 : 0.5, z1 + 0.012));
    } else {
      // ---- Ikarus: yellow rear, a large rubber-set window, tall red lamps (ref11)
      const ww = 1.95, w0 = Rr.winBottom, w1 = Rr.winTop;
      // the rear face with the window opening: full bands below and above it, the rounded corners beside it and
      // the flat middle with the opening cut out
      const wz0 = w0 - 0.15, wz1 = w1 + 0.15, flat = hw - r;
      p.add('paint', endBand(ol, z1, 1, D.skirtY, wz0, { rows: 3 }));
      p.add('paint', endBand(ol, z1, 1, wz1, roofY, { rows: 3, inset }));
      p.add('paint', endBand(ol.filter(([x]) => x <= -flat + 1e-6), z1, 1, wz0, wz1));
      p.add('paint', endBand(ol.filter(([x]) => x >= flat - 1e-6), z1, 1, wz0, wz1));
      const mid = new THREE.Shape();
      mid.moveTo(-flat, wz0); mid.lineTo(flat, wz0); mid.lineTo(flat, wz1); mid.lineTo(-flat, wz1); mid.closePath();
      const rr = 0.14, hx = ww / 2;
      const hole = new THREE.Path();
      hole.moveTo(-hx + rr, w0); hole.quadraticCurveTo(-hx, w0, -hx, w0 + rr); hole.lineTo(-hx, w1 - rr);
      hole.quadraticCurveTo(-hx, w1, -hx + rr, w1); hole.lineTo(hx - rr, w1); hole.quadraticCurveTo(hx, w1, hx, w1 - rr);
      hole.lineTo(hx, w0 + rr); hole.quadraticCurveTo(hx, w0, hx - rr, w0); hole.closePath();
      mid.holes.push(hole);
      p.add('paint', new THREE.ShapeGeometry(mid, 8), M(0, 0, z1));
      p.add('paint', endCap(ol, z1, 1, roofY, zSide, G.roofEdgeR, 0));
      // black rubber gasket round the rear window (a frame, so the saloon shows through the glass)
      p.add('rubber', frameRect(-ww / 2 - 0.05, w0 - 0.05, ww / 2 + 0.05, w1 + 0.05, 0.07, 0.14, 0.02), M(0, 0, z1 + 0.004));
      const gl = new THREE.PlaneGeometry(ww - 0.02, w1 - w0 - 0.02);
      p.add('glassOut', gl, M(0, (w0 + w1) / 2, z1 + 0.018));
      const gi = new THREE.PlaneGeometry(ww, w1 - w0);
      gi.rotateY(Math.PI);
      p.add('glassIn', gi, M(0, (w0 + w1) / 2, z1 - 0.03));
      for (const sx of [-1, 1]) {
        p.add('tail', box(0.12, 0.26, 0.02, 0.02), M(sx * 1.08, 1.27, z1 + 0.01));
        p.add('brake', box(0.12, 0.2, 0.02, 0.02), M(sx * 1.08, 1.02, z1 + 0.01));
        p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.12, 0.09, 0.02, 0.02), M(sx * 1.08, 0.86, z1 + 0.01));
        p.add('reverse', box(0.1, 0.05, 0.02), M(sx * 0.9, 0.62, z1 + 0.01));
        lamp(p, 'tail', sx * 1.1, 0.5, z1 + 0.012, 0.03, 1);
      }
      p.add('rubber', box(hw * 2 - 0.05, 0.08, 0.06), M(0, D.skirtY + 0.06, z1 + 0.02));
      p.add('rearDecal', new THREE.PlaneGeometry(0.44, 0.11), M(0.55, 1.36, z1 + 0.012));
      p.add('satin', box(0.5, 0.11, 0.008), M(0, 0.62, z1 + 0.01));
      // the blue band wraps round the rear corners only
      for (const sx of [-1, 1]) p.add('blue', box(0.02, G.bandTop - D.skirtY, 0.1), M(sx * (hw + 0.004), (G.bandTop + D.skirtY) / 2, z1 - r));
    }
  },
};
