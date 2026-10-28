// Lamps, mirrors and small exterior fittings of the Yutong ZK6126HGA.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { K } from './consts.js';
import { M, box, sweep, superEllipsoid, lerp } from '../../BusGeom.js';
import { frontPatch, rearPatch, frontPos, rearPos, colsBetween } from './surfaces.js';

/** Disc / ellipse that conforms to a surface: posFn(x, Y, off) -> [x, y, z]. Outward = -z (front) or +z (rear). */
export function conformDisc(posFn, cx, cy, rx, ry, off, outwardSign, seg = 16, ring = 0) {
  const pos = [], idx = [], uv = [];
  const n = seg;
  if (!ring) {
    pos.push(...posFn(cx, cy, off));
    uv.push(0.5, 0.5);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(...posFn(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, off));
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  if (ring) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos.push(...posFn(cx + Math.cos(a) * rx * ring, cy + Math.sin(a) * ry * ring, off));
      uv.push(0.5 + Math.cos(a) * 0.5 * ring, 0.5 + Math.sin(a) * 0.5 * ring);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(i, n + i, j, j, n + i, n + j);
    }
  } else {
    for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // wind so that the face normal points outward in z
  const p = g.attributes.position;
  const a = idx[0], b = idx[1], c = idx[2];
  const ux = p.getX(b) - p.getX(a), uy = p.getY(b) - p.getY(a), uz = p.getZ(b) - p.getZ(a);
  const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
  const nz = ux * vy - uy * vx;
  void uz; void vz;
  if (nz * outwardSign < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

const front = (x, y, off) => frontPos(x, y, off);
const rear = (x, y, off) => rearPos(x, y, off);

export const LampMixin = {
  lamps(p) {
    const lite = this.lite;
    // ---- front: two-cell headlamp units on the bumper corners (outer cell towards the corner)
    for (const sg of [1, -1]) {
      const span = (a, b, n) => (sg > 0 ? colsBetween(b, a, n) : colsBetween(-a, -b, n));
      const uv = sg > 0 ? [0, 0, 1, 1] : [1, 0, 0, 1];
      p.add('lampFrame', frontPatch({ xs: span(0.78, 1.205, 10), y0: 0.625, y1: 0.795, nv: 2, off: 0.002 }));
      p.add('headlamp', frontPatch({ xs: span(0.8, 1.19, 14), y0: 0.64, y1: 0.78, nv: 2, off: 0.0045, uv }));
      p.add('lensClear', frontPatch({ xs: span(0.8, 1.19, 14), y0: 0.64, y1: 0.78, nv: 2, off: 0.0075 }));
      // amber indicator strip under the unit (outer 60 %)
      p.add(sg > 0 ? 'indicatorR' : 'indicatorL', frontPatch({ xs: span(0.92, 1.18, 8), y0: 0.585, y1: 0.62, nv: 1, off: 0.003 }));
      // fog / cornering lamp low in the corner
      p.add('lampFrame', frontPatch({ xs: span(0.9, 1.15, 6), y0: 0.43, y1: 0.52, nv: 1, off: 0.002 }));
      p.add('lensClear', frontPatch({ xs: span(0.92, 1.13, 6), y0: 0.44, y1: 0.51, nv: 1, off: 0.0035 }));
      if (!lite) {
        // washer jets and sensor beside the unit
        for (const [x, Y] of [[0.74, 0.74], [0.74, 0.66]]) p.add('matteBlack', conformDisc(front, sg * x, Y, 0.012, 0.012, 0.003, -1, 8));
      }
    }
    // ---- rear: three round lamps in each corner pod: indicator, brake ring + tail disc, reverse
    for (const sg of [-1, 1]) {
      const xc = sg * 1.1;
      p.add(sg > 0 ? 'indicatorR' : 'indicatorL', conformDisc(rear, xc, 1.4, 0.052, 0.052, 0.004, 1, 16));
      p.add('brake', conformDisc(rear, xc, 1.22, 0.052, 0.052, 0.004, 1, 16, 0.55));
      p.add('tail', conformDisc(rear, xc, 1.22, 0.052 * 0.55, 0.052 * 0.55, 0.0045, 1, 12));
      p.add('reverse', conformDisc(rear, xc, 1.03, 0.052, 0.052, 0.004, 1, 16));
      // chrome bezels
      p.add('chrome', conformDisc(rear, xc, 1.4, 0.058, 0.058, 0.0025, 1, 16, 0.9));
      p.add('chrome', conformDisc(rear, xc, 1.22, 0.058, 0.058, 0.0025, 1, 16, 0.9));
      p.add('chrome', conformDisc(rear, xc, 1.03, 0.058, 0.058, 0.0025, 1, 16, 0.9));
      // red rectangular lamps in the bumper (brake light bar)
      const a = sg > 0 ? 0.66 : -0.88, b = sg > 0 ? 0.88 : -0.66;
      p.add('brake', rearPatch({ xs: colsBetween(a, b, 3), y0: 0.555, y1: 0.63, nv: 1, off: 0.003 + 0.05 }));
    }
    // ---- rear roof marker lamps (red) on the rear pod and the high-mounted camera
    for (const sg of [-1, 1]) p.add('marker', new THREE.SphereGeometry(0.035, 10, 6), M(sg * 0.9, K.roofY + 0.14, K.rearZ - 0.62));
    // side marker lamps and the amber side repeaters near the front corner
    for (const sg of [1, -1]) p.add(sg > 0 ? 'indicatorR' : 'indicatorL', box(0.012, 0.05, 0.1), M(sg * (K.hw + 0.004), 0.95, K.frontZ + (sg > 0 ? 0.62 : 0.5)));
  },

  mirrors(p) {
    const z0 = K.frontZ;
    for (const sg of [1, -1]) {
      // lattice arm swept out and forward from the upper A-pillar, ending in the hanging head
      // the heads hang just outside the body line, a hand's width ahead of the windscreen corners (ref12)
      const path = [[sg * 1.2, 2.56, z0 + 0.42], [sg * 1.3, 2.57, z0 + 0.24], [sg * 1.38, 2.55, z0 + 0.0], [sg * 1.42, 2.5, z0 - 0.2]];
      for (const g of sweep(path, (t) => [0.022 + 0.022 * t, 0.032 + 0.022 * t], 20, 10)) p.add('satin', g);
      const path2 = [[sg * 1.2, 2.42, z0 + 0.46], [sg * 1.31, 2.41, z0 + 0.24], [sg * 1.39, 2.38, z0 + 0.0], [sg * 1.43, 2.35, z0 - 0.18]];
      for (const g of sweep(path2, () => [0.012, 0.012], 14, 6)) p.add('satin', g);
      p.add('satin', box(0.14, 0.2, 0.2, 0.03), M(sg * 1.2, 2.48, z0 + 0.45)); // root boss on the pillar
      // head: tall rounded shell, mirror faces rearwards
      const head = new RoundedBoxGeometry(0.2, 0.52, 0.13, 3, 0.05);
      const hm = new THREE.Matrix4().makeRotationY(sg * 0.12).setPosition(sg * 1.44, 2.17, z0 - 0.26);
      p.add('satin', head, hm);
      const m1 = new THREE.PlaneGeometry(0.17, 0.3); m1.translate(0, 0.06, 0.0665);
      const m2 = new THREE.PlaneGeometry(0.17, 0.14); m2.translate(0, -0.19, 0.0665);
      p.add('mirror', m1, hm);
      p.add('mirror', m2, hm);
      // wide-angle round mirror on a short bracket in front of the A-pillar
      p.add('satin', new THREE.CylinderGeometry(0.095, 0.095, 0.03, 18).rotateX(Math.PI / 2), M(sg * 1.36, 2.36, z0 - 0.02));
      p.add('mirror', new THREE.CircleGeometry(0.085, 18).rotateY(Math.PI), M(sg * 1.36, 2.36, z0 - 0.0355));
      void lerp; void superEllipsoid;
    }
  },
};
