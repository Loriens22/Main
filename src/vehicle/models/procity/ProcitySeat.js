// Geometry of the Procity passenger seat (photos ref09 / ref10): hard grey plastic shell with a raised border,
// dark charcoal cloth pad on the pan and on the back (also as a recessed panel on the rear face), an open
// grab slot at the top of the back, rounded pan lip. Seat-local frame: origin on the floor under the pan centre,
// x right, y up, +z toward the backrest (yaw 0 faces forward = -z).
import * as THREE from 'three';
import { box } from '../../BusGeom.js';

const cache = new Map();

function roundedShape(w, h, r, rTop) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = 0, y1 = h;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - rTop);
  s.quadraticCurveTo(x1, y1, x1 - rTop, y1);
  s.lineTo(x0 + rTop, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - rTop);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function slot(cx, cy, w, h) {
  const p = new THREE.Path();
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, r = h / 2;
  p.moveTo(x0 + r, y0);
  p.lineTo(x1 - r, y0);
  p.quadraticCurveTo(x1, y0, x1, y0 + r);
  p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1);
  p.quadraticCurveTo(x0, y1, x0, y1 - r);
  p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}

const BACK_TILT = 0.2;
const BACK_ORIGIN = [0, 0.43, 0.2]; // base of the backrest (seat frame)

/** Places a geometry authored in the backrest plane (x across, y up the back, z toward the rear) onto the seat. */
function onBack(g) {
  g.rotateX(BACK_TILT);
  g.translate(...BACK_ORIGIN);
  return g;
}

/**
 * Geometries of one seat by material key: shell (grey plastic), pad (charcoal cloth). Built once and shared
 * by every bus.
 */
export function seatPieces(quality = 'high') {
  const low = quality === 'low' || quality === 'balanced';
  const key = low ? 'lo' : 'hi';
  if (cache.has(key)) return cache.get(key);
  const W = 0.44, H = 0.62;
  // ---- backrest shell: rounded silhouette with the open grab slot near the top, 0.04 thick
  const shape = roundedShape(W, H, 0.03, 0.09);
  shape.holes.push(slot(0, H - 0.075, 0.27, 0.05));
  const back = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: low ? 3 : 6 });
  back.translate(0, 0, -0.02);
  onBack(back);
  // ---- pads on the sitting face and the rear face of the backrest
  const padShape = roundedShape(0.35, 0.43, 0.04, 0.06);
  const padF = new THREE.ShapeGeometry(padShape, 3);
  padF.rotateY(Math.PI); // faces -z (towards the sitter)
  padF.translate(0, 0.06, -0.0262);
  onBack(padF);
  const padB = new THREE.ShapeGeometry(roundedShape(0.33, 0.42, 0.04, 0.06), 3);
  padB.translate(0, 0.05, 0.0262);
  onBack(padB);
  // ---- pan: shell tray and cushion
  const pan = box(0.44, 0.05, 0.43, 0.02);
  pan.translate(0, 0.395, 0.0);
  const cush = box(0.39, 0.05, 0.38, 0.022);
  cush.rotateX(-0.04);
  cush.translate(0, 0.438, -0.005);
  // front lip of the shell
  const lip = box(0.44, 0.06, 0.04, 0.02);
  lip.translate(0, 0.405, -0.205);
  // hinge block between pan and back
  const hinge = box(0.4, 0.05, 0.06, 0.01);
  hinge.translate(0, 0.43, 0.2);
  const out = { shell: [back, pan, lip, hinge], pad: [padF, padB, cush] };
  cache.set(key, out);
  return out;
}

/** Fold-up seat of the wheelchair bay (against the wall): grey board, moquette face, small pan. */
export function foldSeatPieces() {
  const key = 'fold';
  if (cache.has(key)) return cache.get(key);
  const board = box(0.4, 0.5, 0.025, 0.012);
  board.translate(0, 0.78, 0.27);
  const face = new THREE.PlaneGeometry(0.34, 0.44);
  face.rotateY(Math.PI);
  face.translate(0, 0.78, 0.2565);
  const pan = box(0.4, 0.03, 0.38, 0.012);
  pan.translate(0, 0.45, 0.06);
  const out = { shell: [board, pan], pad: [face] };
  cache.set(key, out);
  return out;
}
