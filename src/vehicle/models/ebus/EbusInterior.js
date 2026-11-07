// Saloon fittings of the two line-84 battery buses (mixed into TrolleyModel; TrolleyInterior.stanchions calls
// this.ebusFittings when the design names it):
//   SOR EBN 11 (images 5-6): stainless rails and stanchions, transparent ceiling grips on short straps, stainless
//     grab loops on the aisle seats, black-and-yellow striped handrails beside the doors, yellow stop-request boxes,
//     red emergency hammers on the window pillars.
//   Yutong E12 (image 10): grey rails and stanchions, grey hanging straps (Blender kit), yellow-orange request
//     buttons, validators by the doors.
import * as THREE from 'three';
import { M, box } from '../trolley/geom.js';

export const EbusInteriorMixin = {
  ebusFittings(p, sec) {
    const D = this.D, F = this.F, L = this.spec.layout, G = this.G;
    const hw = D.halfW, FY = D.floorY, ceilY = D.roofY - 0.14;
    const sor = G.livery === 'sor';
    const z0 = F.frontZ + 1.7, z1 = F.rearZ - 0.6;
    const railY = ceilY - 0.3, railX = 0.56;
    const tube = (pts, r = 0.019, key = 'rail') => p.add(key, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), Math.max(8, pts.length * 6), r, 8, false));
    for (const side of [1, -1]) tube([[side * railX, railY, z0], [side * railX, railY, z1]], 0.017);
    // stanchions at the aisle end of the seat rows, every row on the SOR (image 6), every second row on the E12
    const rows = [...new Map(L.seats.filter((s) => s.aisle).map((s) => [`${Math.sign(s.x)}|${s.z.toFixed(2)}`, s])).values()].sort((a, b) => a.z - b.z);
    rows.forEach((s, k) => {
      const side = Math.sign(s.x), x = side * 0.29, zz = s.z + 0.27 * Math.cos(s.yaw || 0);
      if (sor) {
        // stainless grab loop over the top of the aisle seat's backrest (image 6)
        const y = s.fy + 1.06, zb = s.z + 0.26 * Math.cos(s.yaw || 0);
        tube([[s.x - 0.17, y - 0.05, zb], [s.x - 0.16, y + 0.09, zb], [s.x + 0.16, y + 0.09, zb], [s.x + 0.17, y - 0.05, zb]], 0.014);
      }
      if (!sor && k % 2) return;
      tube([[x, s.fy, zz], [x, railY - 0.24, zz], [x + side * 0.08, railY - 0.06, zz], [side * railX, railY, zz]], 0.02);
      // request box: yellow body with a red button (both buses)
      p.add('yellowEdge', box(0.07, 0.12, 0.055, 0.012), M(x, FY + 1.4, zz - 0.035));
      p.add('stopBtn', box(0.04, 0.04, 0.012), M(x, FY + 1.42, zz - 0.067));
    });
    // grips along the ceiling rails over the standing areas: clear plastic handles (SOR) or grey straps (E12)
    const straps = [];
    for (const side of [1, -1]) {
      for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.44) {
        const near = this.spec.doors.some((d) => z > d.z0 - 0.7 && z < d.z1 + 0.7) || (side < 0 && L.standing.some((a) => a.x1 < 0 && z > a.z0 && z < a.z1));
        if (!near) continue;
        if (sor) {
          const x = side * railX, top = railY - 0.02;
          p.add('gripStrap', box(0.025, 0.12, 0.01), M(x, top - 0.06, z));
          const tri = new THREE.Shape();
          tri.moveTo(-0.055, 0); tri.lineTo(0.055, 0); tri.lineTo(0.03, 0.11); tri.lineTo(-0.03, 0.11); tri.closePath();
          tri.holes.push(new THREE.Path([new THREE.Vector2(-0.034, 0.018), new THREE.Vector2(0.034, 0.018), new THREE.Vector2(0.018, 0.088), new THREE.Vector2(-0.018, 0.088)]));
          const g = new THREE.ExtrudeGeometry(tri, { depth: 0.018, bevelEnabled: false });
          g.translate(0, -0.11, -0.009);
          g.rotateY(Math.PI / 2);
          p.add('clearGrip', g, M(x, top - 0.12, z));
        } else straps.push({ x: side * railX, y: railY, z, yaw: 0 });
      }
    }
    this._straps[sec].push(...straps);
    // door handrails (SOR: black and yellow stripes), the rail over each door, validators
    for (const d of this.spec.doors.filter((q) => q.section === sec)) {
      const X = hw - 0.36;
      for (const z of [d.z0 - 0.1, d.z1 + 0.1]) {
        if (sor) {
          const g = new THREE.CylinderGeometry(0.02, 0.02, railY - 0.2 - FY, 10, 1, true);
          p.add('hazardRail', g, M(X, (railY - 0.2 + FY) / 2, z));
          tube([[X, railY - 0.21, z], [X - 0.1, railY - 0.04, z], [railX, railY, z]], 0.02);
        } else tube([[X, FY, z], [X, railY - 0.2, z], [X - 0.1, railY - 0.04, z], [railX, railY, z]], 0.021);
      }
      tube([[X, railY - 0.12, d.z0 - 0.1], [X, railY - 0.12, d.z1 + 0.1]], 0.018);
      this._validators[sec].push({ x: X, y: FY + 0.42, z: d.z1 + 0.1, yaw: Math.PI / 2 });
      p.add('stopBtn', box(0.03, 0.045, 0.035), M(X - 0.025, FY + 1.17, d.z0 - 0.1));
    }
    // red emergency hammers on window pillars (image 6), both sides
    for (const side of [1, -1]) {
      const panes = G.panes[sec][side > 0 ? 'right' : 'left'];
      panes.forEach(([a, , kind], i) => {
        if (kind === 'cab' || i % 2) return;
        const xi = hw - 0.08;
        p.add('stopBtn', box(0.035, 0.16, 0.06, 0.01), M(side * xi, D.beltY + 0.62, a - 0.05));
      });
    }
    // ceiling: air-conditioning vents (E12: square diffusers, SOR: long grilles) and the front display housing
    for (let z = z0 + 0.6; z < z1 - 0.4; z += sor ? 2.2 : 1.8) {
      if (sor) p.add('grille', box(0.6, 0.012, 0.14), M(0, ceilY - 0.012, z));
      else {
        p.add('trim', box(0.42, 0.012, 0.42), M(0, ceilY - 0.008, z));
        p.add('grille', box(0.32, 0.014, 0.32), M(0, ceilY - 0.012, z));
      }
    }
    p.add('dashSoft', box(1.12, 0.22, 0.08), M(0, D.windowTopY - 0.14 - (sor ? 0 : 0.35), F.frontZ + G.interiorSignZ + 0.05));
  },
};
