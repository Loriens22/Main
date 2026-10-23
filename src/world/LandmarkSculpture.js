// Small sculptures for the landmarks, built into a MeshBuilder in its current frame.
// All figures face +z; sizes in metres.
import * as THREE from 'three';

/** Bronze eagle with spread wings, perched with its feet at y = 0. span = wingspan. */
export function eagle(b, key, span = 2.0, s = null) {
  const k = span / 2.0;
  b.push(0, 0, 0, 0, k);
  // body (breast forward and slightly up), head with hooked beak, tail fan
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.17, 0.2, 0.36);
  body.rotateX(-0.35);
  body.translate(0, 0.32, 0);
  b.geo(key, body);
  b.sphere(key, 0, 0.56, 0.22, 0.095, 1, 1, 1.1, 10);
  const beak = new THREE.ConeGeometry(0.045, 0.16, 8);
  beak.rotateX(Math.PI / 2 + 0.5);
  beak.translate(0, 0.52, 0.37);
  b.geo(key, beak);
  // tail fan
  b.extrude(key, [[-0.02, 0], [-0.17, -0.34], [-0.09, -0.4], [0, -0.37], [0.09, -0.4], [0.17, -0.34], [0.02, 0]], 0.02, {
    matrix: new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.5).setPosition(0, 0.2, -0.28),
  });
  // legs / talons gripping the perch
  for (const sx of [-1, 1]) {
    b.cyl(key, sx * 0.08, 0, 0.03, 0.025, 0.02, 0.2, 6);
    b.box(key, sx * 0.08, 0, 0.12, 0.07, 0.04, 0.16, 0, {});
  }
  // wings: planform in (u outward, w forward), extruded, then lifted by a dihedral
  for (const sgn of [1, -1]) {
    const P = [[0, 0.16], [0.28, 0.24], [0.62, 0.2], [0.94, 0.04], [0.96, -0.04], [0.9, -0.12], [0.84, -0.07], [0.8, -0.2], [0.7, -0.14], [0.64, -0.29], [0.52, -0.2], [0.44, -0.34], [0.32, -0.22], [0.22, -0.3], [0.1, -0.2], [0, -0.16]];
    const pts = P.map(([u, w]) => [sgn * u, w]);
    if (sgn < 0) pts.reverse();
    const sh = new THREE.Shape(pts.map(([a, c]) => new THREE.Vector2(a, c)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1, curveSegments: 4 });
    g.rotateX(Math.PI / 2); // plane XY -> XZ (forward = +z), thickness downwards
    g.translate(0, 0.02, 0);
    g.rotateZ(sgn * 0.62);
    g.translate(sgn * 0.1, 0.4, 0);
    b.geo(key, g);
  }
  b.pop();
  void s;
}

/** Seated / crouching lion on its own plinth block, facing +z. */
export function lion(b, key, plinthKey, scale = 1) {
  b.push(0, 0, 0, 0, scale);
  b.box(plinthKey, 0, 0, 0, 0.95, 0.85, 1.7, 0, {});
  b.box(plinthKey, 0, 0.85, 0, 1.05, 0.1, 1.8, 0, {});
  const y0 = 0.95;
  // haunches + back
  const hq = new THREE.SphereGeometry(1, 12, 9); hq.scale(0.3, 0.33, 0.38); hq.translate(0, y0 + 0.36, -0.45);
  b.geo(key, hq);
  const body = new THREE.SphereGeometry(1, 12, 9); body.scale(0.27, 0.3, 0.55); body.rotateX(-0.3); body.translate(0, y0 + 0.5, -0.05);
  b.geo(key, body);
  // chest and front legs
  const chest = new THREE.SphereGeometry(1, 12, 9); chest.scale(0.28, 0.34, 0.28); chest.translate(0, y0 + 0.62, 0.32);
  b.geo(key, chest);
  for (const sx of [-1, 1]) {
    b.cyl(key, sx * 0.14, y0, 0.52, 0.075, 0.09, 0.62, 8);
    b.box(key, sx * 0.14, y0, 0.62, 0.14, 0.07, 0.24, 0, {});
    b.cyl(key, sx * 0.22, y0, -0.5, 0.1, 0.07, 0.3, 8);
  }
  // head: skull, muzzle, mane
  b.sphere(key, 0, y0 + 0.98, 0.45, 0.21, 1, 1.0, 1.0, 12);
  b.box(key, 0, y0 + 0.88, 0.67, 0.17, 0.13, 0.2, 0, {});
  const mane = new THREE.SphereGeometry(1, 12, 9); mane.scale(0.34, 0.36, 0.26); mane.translate(0, y0 + 0.95, 0.33);
  b.geo(key, mane);
  // tail wrapping the plinth
  b.cyl(key, 0.28, y0 + 0.1, -0.78, 0.035, 0.03, 0.5, 6);
  b.pop();
}

/** Seated bronze figure on a low block (donor statues), facing +z. */
export function seatedFigure(b, key, plinthKey, scale = 1) {
  b.push(0, 0, 0, 0, scale);
  b.box(plinthKey, 0, 0, 0, 1.4, 0.7, 1.3, 0, {});
  b.box(plinthKey, 0, 0.7, -0.1, 1.0, 0.5, 0.9, 0, {}); // seat block
  const y = 1.2;
  // thighs, shins, torso, head
  b.box(key, 0, y, 0.12, 0.44, 0.2, 0.55, 0, {});
  for (const sx of [-1, 1]) b.cyl(key, sx * 0.14, 0.7, 0.42, 0.075, 0.07, 0.5, 7);
  const torso = new THREE.SphereGeometry(1, 10, 8); torso.scale(0.26, 0.4, 0.2); torso.translate(0, y + 0.5, -0.05);
  b.geo(key, torso);
  b.sphere(key, 0, y + 1.0, -0.02, 0.12, 1, 1.15, 1, 10);
  for (const sx of [-1, 1]) {
    b.cyl(key, sx * 0.29, y + 0.34, -0.02, 0.06, 0.05, 0.48, 6);
    b.box(key, sx * 0.25, y + 0.18, 0.22, 0.09, 0.09, 0.3, 0, {});
  }
  b.pop();
}

/** Standing robed figure (bronze) with its feet at y = 0, height h, facing +z. */
export function standingFigure(b, key, h = 2.6) {
  const k = h / 2.6;
  b.push(0, 0, 0, 0, k);
  b.lathe(key, 0, 0, 0, [[0.01, 0], [0.4, 0.02], [0.36, 0.5], [0.3, 1.1], [0.26, 1.7], [0.18, 2.0], [0.12, 2.1], [0.01, 2.12]], 14);
  b.sphere(key, 0, 2.3, 0.02, 0.15, 1, 1.18, 1.05, 10);
  // cowl / beard
  b.sphere(key, 0, 2.18, 0.1, 0.1, 1, 1.0, 0.8, 8);
  // arms: one raised holding a scroll, one along the body
  b.cyl(key, 0.3, 1.45, 0.05, 0.07, 0.05, 0.6, 7);
  b.box(key, -0.1, 1.6, 0.28, 0.5, 0.1, 0.12, 0, {});
  b.pop();
}
