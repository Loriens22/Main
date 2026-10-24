// The Conecto G passenger seat (ref04 / ref05): an individual hard-shell seat in light grey plastic with a
// blue-grey moquette pad inset in the backrest, a dark-blue moquette cushion and a black grab loop over the top
// of the backrest. Seat-local frame: origin on the floor under the pan centre, x right, y up, +z toward the
// backrest (yaw 0 faces forward = -z). One merged geometry per material, shared by every seat.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tube, smooth } from './geom.js';

const cache = new Map();

function rb(w, h, d, r, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
}

function place(g, x, y, z, rx = 0) {
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

/** Geometry lists keyed by material name: seat, seatDark, moqPad, moqCush. */
export function seatPieces(quality = 'high') {
  const key = quality === 'high' || quality === 'ultra' ? 'hi' : 'lo';
  if (cache.has(key)) return cache.get(key);
  const lo = key === 'lo';
  const seg = lo ? 1 : 2;
  const RAKE = 0.13; // backrest lean (rad)
  const out = { seat: [], seatDark: [], moqPad: [], moqCush: [] };
  // pan shell under the cushion (grey), with a front lip
  out.seat.push(place(rb(0.445, 0.05, 0.43, 0.02, seg), 0, 0.37, 0.0));
  out.seat.push(place(rb(0.445, 0.04, 0.05, 0.018, seg), 0, 0.41, -0.2));
  // cushion (blue moquette): a flat slab with a slightly rounded top, a hair larger than the pan inset
  out.moqCush.push(place(rb(0.40, 0.07, 0.385, 0.025, seg), 0, 0.425, -0.005));
  // backrest shell (grey): slab leaning back, with rounded top corners
  const back = rb(0.445, 0.6, 0.06, 0.05, seg);
  out.seat.push(place(back, 0, 0.7, 0.215, -RAKE));
  // moquette pad inset into the front face of the backrest
  const pad = rb(0.35, 0.45, 0.025, 0.04, seg);
  out.moqPad.push(place(pad, 0, 0.73, 0.178, -RAKE));
  // side wings of the shell
  for (const sx of [-1, 1]) out.seat.push(place(rb(0.03, 0.34, 0.14, 0.012, seg), sx * 0.2, 0.55, 0.16, -0.05));
  // dark bottom edge strip of the back and the grab loop on top
  out.seatDark.push(place(rb(0.34, 0.025, 0.05, 0.01, seg), 0, 0.405, 0.17));
  const loop = [];
  const lx = 0.15, y0 = 0.98, y1 = 1.1, zb = 0.275 + 0.08 * (y0 - 0.7);
  const dz = (y) => 0.215 + (y - 0.7) * Math.tan(RAKE);
  loop.push([-lx, y0, dz(y0)], [-lx, y1 - 0.03, dz(y1) + 0.01], [-lx + 0.04, y1, dz(y1) + 0.025], [lx - 0.04, y1, dz(y1) + 0.025], [lx, y1 - 0.03, dz(y1) + 0.01], [lx, y0, dz(y0)]);
  out.seatDark.push(tube(smooth(loop, lo ? 8 : 14), 0.0135, lo ? 5 : 6, { caps: true }));
  void zb;
  cache.set(key, out);
  return out;
}

/** Fold-up seat in the wheelchair bay (folded against the wall: moquette back). */
export function foldPieces() {
  const out = { seat: [], moqPad: [], seatDark: [] };
  out.moqPad.push(place(new THREE.BoxGeometry(0.4, 0.5, 0.02), 0, 0.82, 0.225));
  out.seat.push(place(new THREE.BoxGeometry(0.42, 0.52, 0.03), 0, 0.82, 0.25));
  out.seat.push(place(new THREE.BoxGeometry(0.42, 0.03, 0.4), 0, 0.5, 0.04));
  return out;
}
