// Livery details on the sides of the two line-84 battery buses (mixed into TrolleyModel; called at the end of
// TrolleyBody.buildSides when the design has a livery):
//   SOR EBN 11 (ref02, ref04): the thin green line over the windows and along the roof edge; the slogan, the
//     ELEKTROBUS roundel and the battery icon on the left windows; the fleet number on the white band.
//   Yutong E12 (ref07-ref09): the leaf band on the lower white body of each side (cut round the wheel arches and
//     the doors), "ZERO EMISSION" / "НУЛЕВИ ЕМИСИИ" and the plug-leaf roundel on the windows, the white fleet number
//     on the glazed band, the louvred equipment panel behind door 3, small orange side markers.
import * as THREE from 'three';
import { M, box, gaps, panelShape, sideMatrix, flipWinding } from '../trolley/geom.js';

/** A thin strip on one side between heights y0, y1 following the outer face x(y), from z0 to z1. */
function sideStrip(side, xAt, y0, y1, z0, z1) {
  const pos = [], idx = [0, 2, 1, 1, 2, 3];
  for (const y of [y0, y1]) for (const z of [z0, z1]) pos.push(side * xAt(y), y, z);
  if (side < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat decal in the side plane (shape in (z, y)), UVs from the given z / y ranges, facing outwards. */
function sideDecal(shape, side, x, zr, yr) {
  const g = new THREE.ShapeGeometry(shape, 12);
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = (pos.getX(i) - zr[0]) / (zr[1] - zr[0]);
    uv[2 * i + 1] = (pos.getY(i) - yr[0]) / (yr[1] - yr[0]);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.applyMatrix4(sideMatrix(side, x));
  if (side > 0) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

/** A rectangle decal on a window of one side (on the outside of the glass). */
function glassDecal(side, x, z0, z1, y0, y1) {
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  // the texture reads from the front to the rear on the right side; from the rear to the front on the left
  return { g, m: M(side * x, (y0 + y1) / 2, (z0 + z1) / 2) };
}

export const EbusBodyMixin = {
  ebusSides(p, sec) {
    const D = this.D, G = this.G, hw = D.halfW, wtop = D.windowTopY, belt = D.beltY, skirt = D.skirtY;
    const [zA, zB] = this.sideRange(sec);
    const xo = hw - G.tumble;
    const doors = this.spec.doors.filter((d) => d.section === sec);
    // ---- thin lines (SOR: green over the windows; along the roof edge on the curve of the roof)
    for (const s of G.stripes || []) {
      for (const side of [1, -1]) p.add(s.mat, sideStrip(side, () => xo + 0.004, s.y0, s.y1, zA, zB));
    }
    if (G.roofLine) {
      const R = G.roofEdgeR, cy = D.roofY - R, cx = xo - R;
      const xAt = (y) => cx + Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy))) + 0.003;
      for (const side of [1, -1]) p.add(G.roofLine.mat, sideStrip(side, xAt, G.roofLine.y0, G.roofLine.y1, zA, zB));
    }
    // ---- fleet number
    const fn = G.livery === 'sor' ? { y: 2.65, z: -0.6, mat: 'ebusNumberDark', x: xo + 0.004 } : { y: 2.72, z: -6.85, mat: 'ebusNumber', x: xo + 0.006 };
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.42, 0.105);
      g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.add(fn.mat, g, M(side * fn.x, fn.y, fn.z));
    }
    if (G.livery === 'sor') {
      // lettering on the left windows (ref02, ref04): the slogan behind the middle, the roundel at the rear, the
      // battery icon behind the cab
      const L = -1, x = xo + 0.006;
      for (const [key, z0, z1, y0, y1] of [['sorSlogan', -2.12, -0.72, 1.32, 1.98], ['sorRoundel', 1.2, 1.8, 1.55, 2.25], ['sorBattery', -7.1, -6.3, 1.2, 1.6]]) {
        const { g, m } = glassDecal(L, x, z0, z1, y0, y1);
        p.add(key, g, m);
      }
      return;
    }
    // ---- Yutong E12: the leaf band over the lower white body, between the doors and round the wheel arches
    const R = D.wheelR, axles = [-D.wb1, 0];
    const holes = (side) => (side > 0 ? doors.map((d) => [d.z0 - 0.06, d.z1 + 0.06]) : []);
    for (const side of [1, -1]) {
      for (const [a, b] of gaps(zA, zB, holes(side))) {
        if (b - a < 0.1) continue;
        const sh = panelShape(a, b, skirt + 0.02, belt - 0.012, axles, G.archR + 0.01, R);
        p.add(side > 0 ? 'liveryR' : 'liveryL', sideDecal(sh, side, hw + 0.0075, [zA, zB], [0.3, 1.22]));
      }
    }
    // window lettering (ref07 right side, ref08 left side)
    const xg = xo + 0.006;
    const signs = [
      [1, 'e12en', -1.7, -0.62, 1.78, 2.38], [1, 'e12icon', -0.42, 0.1, 1.84, 2.36], [1, 'e12bg', -5.72, -4.5, 1.78, 2.38],
      [-1, 'e12bg', -2.92, -1.7, 1.78, 2.38], [-1, 'e12icon', -1.3, -0.78, 1.84, 2.36], [-1, 'e12en', -0.12, 1.1, 1.78, 2.38],
    ];
    for (const [side, key, z0, z1, y0, y1] of signs) {
      const { g, m } = glassDecal(side, xg, z0, z1, y0, y1);
      p.add(key, g, m);
    }
    // louvred equipment panel behind door 3 (ref09), small orange markers along the lower body
    for (let k = 0; k < 6; k++) p.add('lampBlack', box(0.012, 0.022, 0.62), M(hw + 0.008, 0.62 + k * 0.07, 2.7));
    for (const side of [1, -1]) {
      for (const z of [-5.0, -2.4, 0.2, 2.6]) {
        if (side > 0 && doors.some((d) => z > d.z0 - 0.1 && z < d.z1 + 0.1)) continue;
        p.add('indicatorR', box(0.012, 0.035, 0.07, 0.006), M(side * (hw + 0.008), 0.5, z));
      }
    }
    void wtop;
  },
};
