// Procedural passenger-car models for traffic and parked cars. Each type has a
// painted body geometry (coloured per instance) and a trim geometry (glass,
// tyres, lamps) so whole fleets render with two instanced draw calls per type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CAR_TYPES = [
  { name: 'sedan', L: 4.6, W: 1.8, prof: [[0, 0.3], [0, 0.66], [0.12, 0.78], [1.2, 0.93], [1.45, 0.97], [2.1, 1.44], [3.25, 1.44], [3.95, 1.0], [4.5, 0.96], [4.6, 0.7], [4.6, 0.3]], win: [[1.55, 1.0], [2.15, 1.38], [3.2, 1.38], [3.8, 1.02]] },
  { name: 'hatch', L: 4.1, W: 1.75, prof: [[0, 0.3], [0, 0.66], [0.12, 0.78], [1.0, 0.92], [1.25, 0.96], [1.95, 1.47], [3.7, 1.46], [4.05, 1.05], [4.1, 0.7], [4.1, 0.3]], win: [[1.35, 1.0], [2.0, 1.41], [3.65, 1.41], [3.95, 1.05]] },
  { name: 'suv', L: 4.6, W: 1.88, prof: [[0, 0.38], [0, 0.82], [0.15, 0.96], [1.1, 1.08], [1.4, 1.12], [1.95, 1.72], [4.3, 1.72], [4.55, 1.2], [4.6, 0.82], [4.6, 0.38]], win: [[1.5, 1.16], [2.0, 1.66], [4.25, 1.66], [4.45, 1.2]] },
  { name: 'van', L: 5.2, W: 1.95, prof: [[0, 0.35], [0, 0.85], [0.3, 1.1], [0.95, 1.35], [1.3, 2.05], [5.15, 2.05], [5.2, 1.9], [5.2, 0.35]], win: [[1.0, 1.4], [1.35, 1.98], [2.0, 1.98], [2.0, 1.4]] },
];

const PAINT = [0xe8e8e6, 0xb9bcbf, 0x6d7174, 0x1d1f22, 0x1f3550, 0x7a1a17, 0x2f4f3a, 0xd8d1c0, 0x4a5a72, 0x9a9da0, 0xffffff, 0x24272b];

function profileShape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Returns {body, trim} geometries centred at the middle of the car, front = -z. */
export function buildCar(type) {
  const t = type;
  const body = new THREE.ExtrudeGeometry(profileShape(t.prof), { depth: t.W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 4 });
  // profile x -> car length (front at x=0), extrude along z -> width
  body.translate(-t.L / 2, 0, -(t.W - 0.16) / 2);
  body.rotateY(-Math.PI / 2); // profile x (front=0) -> -z
  const trim = [];
  // side windows (both sides) + windscreen/back light as dark glass inset
  const win = new THREE.ExtrudeGeometry(profileShape(t.win), { depth: t.W + 0.02, bevelEnabled: false });
  win.translate(-t.L / 2, 0, -(t.W + 0.02) / 2);
  win.rotateY(-Math.PI / 2);
  trim.push(clean(win));
  // wheels
  for (const fx of [0.75, t.L - 0.85])
    for (const side of [-1, 1]) {
      const w = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14);
      w.rotateZ(Math.PI / 2);
      w.translate(side * (t.W / 2 - 0.05), 0.33, -t.L / 2 + fx);
      trim.push(clean(w));
    }
  // lamps (front white, rear red) are in the trim as small boxes
  for (const side of [-1, 1]) {
    const hl = new THREE.BoxGeometry(0.35, 0.1, 0.05);
    hl.translate(side * (t.W / 2 - 0.3), t.prof[1][1] - 0.05, -t.L / 2 - 0.07);
    trim.push(clean(hl));
    const tl = new THREE.BoxGeometry(0.3, 0.12, 0.05);
    tl.translate(side * (t.W / 2 - 0.25), t.prof[t.prof.length - 2][1] - 0.08, t.L / 2 + 0.07);
    trim.push(clean(tl));
  }
  const b = clean(body);
  b.computeVertexNormals();
  return { body: b, trim: mergeGeometries(trim) };
}

export function carPaint(rand, taxi = false) {
  if (taxi) return new THREE.Color(0xf2c40f);
  return new THREE.Color(PAINT[Math.floor(rand() * PAINT.length)]);
}

let shared = null;
export function carAssets() {
  if (shared) return shared;
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.25, metalness: 0.3 });
  shared = { types: CAR_TYPES.map((t) => ({ ...t, geo: buildCar(t) })), bodyMat, trimMat };
  return shared;
}
