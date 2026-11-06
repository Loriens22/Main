// Fronts and rears of the line-9 trolleybuses.
//   Urbino IV (Solaris IV, images 1-3): the black glazing runs from the dashboard line up to the roof with the
//     destination sign behind the glass, slim LED headlamps low at the corners with the running-light strip,
//     blue lower band and bumper.
//   Urbino III (Solaris III, images 7-8): raked windscreen under a painted sign box with its own glazed window,
//     the round 'eye' lamp clusters.
//   Ikarus 280.92F (images 11-14, 18): the flatter fibreglass front fitted in Sofia, large windscreen, black sign
//     panel above it, rectangular twin lamps, blue bumper band; the original square rear with round lamps.
import * as THREE from 'three';
import { Parts, M, box, endOutline, endBand, rod } from './geom.js';
import { tkMesh } from './TrolleyKit.js';

/** Inset of the outline near the roof so the ends meet the rounded roof edge of the sides. */
function roofInset(roofY, R) {
  return (y) => {
    const t = y - (roofY - R);
    return t <= 0 ? 0 : R - Math.sqrt(Math.max(0, R * R - t * t));
  };
}

/** Flat cap at height y closing an end between its outline (with inset k) and the start of the sides. */
function endCap(outline, zBase, dir, y, zSide, k, rake) {
  const pts = outline.map(([x, dz]) => [Math.sign(x) * Math.max(0, Math.abs(x) - k), zBase - dir * (dz + rake + k * 0.6)]);
  const hwk = Math.abs(pts[0][0]);
  const s = new THREE.Shape();
  // shape coords (x, -z): see the rotation below
  s.moveTo(-hwk, -zSide);
  for (const [x, z] of pts) s.lineTo(x, -z);
  s.lineTo(hwk, -zSide);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  if (dir > 0) {
    // rear: the polygon runs the other way round; keep the face up
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

export const EndsMixin = {
  buildFront(p) {
    const D = this.D, G = this.G, F = this.F;
    const hw = D.halfW, r = G.bodyR, z0 = F.frontZ, roofY = D.roofY;
    const bulge = G.old ? 0.02 : 0.05;
    const ol = endOutline(hw, r, 8, bulge);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z0 + r;
    const ws0 = G.gen === 4 ? 1.08 : G.gen === 3 ? 1.04 : 1.2; // windscreen bottom
    const ws1 = G.gen === 4 ? 2.62 : G.gen === 3 ? 2.56 : 2.56; // windscreen top
    const rake = G.gen === 4 ? 0.14 : G.gen === 3 ? 0.11 : 0.05;
    // lower front, blue band, bumper
    p.add('paint', endBand(ol, z0, -1, G.bandTop, ws0, { rows: 3 }));
    p.add('blue', endBand(ol, z0, -1, D.skirtY, G.bandTop, { rows: 1 }));
    p.add(G.old ? 'blue' : 'matteBlack', endBand(endOutline(hw - 0.02, r, 8, bulge + 0.035), z0, -1, D.skirtY - 0.02, D.skirtY + 0.16));
    // windscreen (raked, bowed slightly forward), with its inner face
    const wsOl = endOutline(hw - 0.004, r, 8, bulge);
    p.add('windscreen', endBand(wsOl, z0, -1, ws0, ws1, { rake, rows: 6, curveOut: 0.015 }));
    p.add('windscreenIn', endBand(wsOl, z0 + 0.012, -1, ws0, ws1, { rake, rows: 6, curveOut: 0.015 }));
    // black frit border round the windscreen and the A-pillars on the corners
    p.add('black', endBand(endOutline(hw + 0.002, r, 8, bulge), z0 - 0.001, -1, ws0 - 0.04, ws0 + 0.03, { rake: 0 }));
    for (const sx of [-1, 1]) {
      const pil = [];
      for (let i = 0; i <= 6; i++) {
        const y = ws0 + ((ws1 - ws0) * i) / 6, t = i / 6;
        pil.push(new THREE.Vector3(sx * (hw - 0.02), y, z0 + r * 0.55 + rake * t));
      }
      p.add('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pil), 8, 0.055, 6, false));
    }
    // above the windscreen: Urbino IV black glass up to the roof; Urbino III painted sign box with a glazed
    // window; Ikarus black sign panel
    if (G.gen === 4) {
      p.add('windscreen', endBand(ol, z0 + rake, -1, ws1, roofY, { rake: 0.03, rows: 4, inset }));
      p.add('black', endBand(endOutline(hw - 0.01, r, 8, bulge), z0 + rake + 0.04, -1, ws1, roofY - 0.02, { rake: 0.03, rows: 2, inset }));
    } else if (G.gen === 3) {
      p.add('paint', endBand(ol, z0 + rake, -1, ws1, roofY, { rake: 0.04, rows: 4, inset }));
      p.add('windscreen', box(1.95, 0.32, 0.02), M(0, G.frontSign.y, z0 + rake - 0.012));
      p.add('black', box(2.0, 0.37, 0.02), M(0, G.frontSign.y, z0 + rake + 0.004));
    } else {
      p.add('paint', endBand(ol, z0 + rake, -1, ws1, roofY, { rake: 0.03, rows: 3, inset }));
      p.add('black', box(1.75, 0.34, 0.03), M(0, G.frontSign.y, z0 + rake - 0.01));
      p.add('windscreen', box(1.7, 0.3, 0.01), M(0, G.frontSign.y, z0 + rake - 0.027));
    }
    p.add(G.gen === 4 ? 'black' : 'paint', endCap(ol, z0 + rake, -1, roofY, zSide, G.roofEdgeR, G.gen === 4 ? 0.03 : 0.04));
    // dashboard ledge seen through the glass, the sun blind
    p.add('dash', box(hw * 2 - 0.25, 0.08, 0.5), M(0, ws0 + 0.03, z0 + 0.4));
    // headlamps (Blender kit) with the lens over them, the lamps that light up, indicators, running lights
    const heads = tkMesh(G.heads, { castShadow: false });
    if (heads) { heads.position.set(0, 0, z0 - 0.002); this.front.add(heads); }
    const L = G.gen === 4 ? { y: 0.82, w: 0.48, h: 0.13, cx: 0.88, refl: [[-0.12, -0.01, 0.042], [0, -0.01, 0.042]], amb: [0.17, -0.012, 0.09, 0.05] }
      : G.gen === 3 ? { y: 0.86, w: 0.34, h: 0.2, cx: 0.9, refl: [[-0.075, -0.02, 0.06], [0.08, -0.02, 0.055]], amb: [0.08, 0.065, 0.12, 0.04] }
        : { y: 0.78, w: 0.42, h: 0.15, cx: 0.83, refl: [[-0.1, 0, 0.055], [0.04, 0, 0.05]], amb: [0.165, 0, 0.07, 0.11] };
    for (const sx of [-1, 1]) {
      const cx = sx * L.cx;
      p.add('lens', box(L.w - 0.01, L.h - 0.01, 0.012, 0.03), M(cx, L.y, z0 - 0.012));
      for (const [dx, dy, rr] of L.refl) {
        const disc = new THREE.CircleGeometry(rr * 0.8, 20);
        disc.rotateY(Math.PI);
        p.add('headlamp', disc, M(cx + sx * dx, L.y + dy, z0 - 0.004));
      }
      const [adx, ady, aw, ah] = L.amb;
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(aw, ah, 0.008), M(cx + sx * adx, L.y + ady, z0 - 0.016));
      if (G.gen === 4) p.add('drl', box(0.42, 0.014, 0.008), M(cx, L.y + 0.05, z0 - 0.014));
      if (G.gen === 3) p.add('drl', box(0.16, 0.02, 0.01), M(cx, L.y - 0.16, z0 - 0.01));
      // side repeater on the front corner
      p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.02, 0.05, 0.12), M(sx * (hw + 0.006), G.old ? 1.3 : 1.05, z0 + 0.6));
    }
    // number plate, tow-hook cover, wipers' parking ledge
    p.add('plate', box(0.52, 0.11, 0.008), M(0, G.old ? 0.52 : 0.47, z0 - bulge - 0.012));
    p.add('matteBlack', box(0.2, 0.12, 0.01), M(0, G.old ? 0.68 : 0.62, z0 - bulge - 0.008));
    // mirrors (Blender kit)
    const mir = tkMesh(G.mirrors, { castShadow: true });
    if (mir) { mir.position.set(0, 0, z0); this.front.add(mir); this.smallTrim = (this.smallTrim || []).concat(mir); }
    // wipers: two arms pivoting under the windscreen
    this.wipers = [];
    for (const [px, dir] of [[-0.62, 1], [0.38, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, ws0 + 0.05, z0 - 0.03);
      const arm = new THREE.Mesh(box(0.02, 0.85, 0.015), this.mats.matteBlack);
      arm.position.set(0, 0.42, 0);
      const blade = new THREE.Mesh(box(0.012, 0.8, 0.02), this.mats.rubber);
      blade.position.set(0.03, 0.5, -0.01);
      pivot.add(arm, blade);
      pivot.rotation.z = 1.35;
      this.front.add(pivot);
      this.wipers.push({ pivot, dir: -dir });
    }
  },

  buildRearEnd(p) {
    const D = this.D, G = this.G, F = this.F;
    const hw = D.halfW, r = G.bodyR, z1 = F.rearZ, roofY = D.roofY;
    const ol = endOutline(hw, r, 8, 0.0);
    const inset = roofInset(roofY, G.roofEdgeR);
    const zSide = z1 - r;
    const win0 = G.old ? 1.55 : 1.32, win1 = G.old ? 2.42 : 2.5;
    p.add('blue', endBand(ol, z1, 1, D.skirtY, G.bandTop));
    p.add('paint', endBand(ol, z1, 1, G.bandTop, win0, { rows: 2 }));
    p.add('black', endBand(ol, z1, 1, win0, win1, { rows: 1 }));
    p.add('paint', endBand(ol, z1, 1, win1, roofY, { rows: 3, inset }));
    p.add('paint', endCap(ol, z1, 1, roofY, zSide, G.roofEdgeR, 0));
    // rear window (glass over the black band, narrower than the body)
    const ww = G.old ? 1.7 : 1.95;
    const gl = new THREE.PlaneGeometry(ww, win1 - win0 - 0.1);
    p.add('glassOut', gl, M(0, (win0 + win1) / 2, z1 + 0.006));
    const gi = new THREE.PlaneGeometry(ww, win1 - win0 - 0.1);
    gi.rotateY(Math.PI);
    p.add('glassIn', gi, M(0, (win0 + win1) / 2, z1 - 0.03));
    // bumper
    p.add(G.old ? 'blue' : 'matteBlack', box(hw * 2 - 0.1, 0.18, 0.08, 0.03), M(0, D.skirtY + 0.07, z1 + 0.02));
    // tail lamp clusters
    for (const sx of [-1, 1]) {
      const x = sx * (hw - 0.16);
      if (G.old) {
        // Ikarus: column of round lamps (indicator, tail/brake, reverse) in a black plate
        p.add('matteBlack', box(0.2, 0.62, 0.02), M(x, 1.05, z1 + 0.01));
        const lamp = (key, y) => { const c = new THREE.CircleGeometry(0.07, 20); p.add(key, c, M(x, y, z1 + 0.022)); };
        lamp(sx < 0 ? 'indicatorL' : 'indicatorR', 1.28);
        lamp('tail', 1.12);
        lamp('brake', 0.96);
        lamp('reverse', 0.8);
      } else {
        // Urbino: tall clusters in the rear corners
        p.add('matteBlack', box(0.2, 0.92, 0.03, 0.02), M(x, 1.0, z1 + 0.01));
        p.add('tail', box(0.15, 0.3, 0.012), M(x, 1.28, z1 + 0.026));
        p.add('brake', box(0.15, 0.16, 0.012), M(x, 1.03, z1 + 0.026));
        p.add(sx < 0 ? 'indicatorL' : 'indicatorR', box(0.15, 0.12, 0.012), M(x, 0.87, z1 + 0.026));
        p.add('reverse', box(0.15, 0.08, 0.012), M(x, 0.73, z1 + 0.026));
        p.add('brake', box(0.5, 0.03, 0.01), M(0, win1 + 0.12, z1 + 0.012)); // high-level brake light
      }
    }
    p.add('plate', box(0.52, 0.11, 0.008), M(0, G.old ? 0.75 : 0.62, z1 + 0.012));
    // service hatch (auxiliary equipment / batteries) in the lower rear
    p.add('satin', box(1.3, 0.012, 0.01), M(0, win0 - 0.18, z1 + 0.003));
    for (const sx of [-1, 1]) p.add('satin', box(0.012, 0.55, 0.01), M(sx * 0.65, win0 - 0.46, z1 + 0.003));
    // rear ladder rungs to the roof (poles are reached from the back)
    for (let k = 0; k < 4; k++) p.add('steel', box(0.3, 0.025, 0.04), M(hw - 0.45, 1.75 + k * 0.3, z1 + 0.04));
    if (this.spec.trolley.ropes) {
      // Ikarus: the rope catchers at the tail where the pole ropes are tied off
      for (const sx of [-1, 1]) p.add('steel', box(0.08, 0.14, 0.08), M(sx * 0.65, 1.15, z1 + 0.05));
    }
    void rod;
  },
};
