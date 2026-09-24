// ---------------------------------------------------------------------------
// Vehicles. Every vehicle is modelled procedurally and can be driven or
// flown (walk up, press E):
//
//  * cars (sedan, sports, SUV, pickup, van, truck, bus, limo, vintage, taxi,
//    police, ambulance): the body is lofted from a per-class side profile
//    (extruded with bevelled edges for rounded panels), a narrower glass
//    greenhouse with a painted roof and pillars, wheels with alloy rims,
//    head/tail lights, grille, mirrors, bumpers, number plates, seats and a
//    steering wheel. Clear-coated car paint.
//  * two-wheelers (motorcycle, bicycle) that lean into turns, tractor, tank
//    (turret follows the camera), horse-less wagon, a steam train on its own
//    track.
//  * boats, sailboats and submarines (water only), aircraft, helicopters,
//    spaceships, UFOs, rockets and hot-air balloons live in aircraft.js and
//    share the same controller interface.
//
// Driving model: arcade bicycle model (speed, steering angle -> yaw rate),
// terrain following with pitch/roll from four wheel contacts, collision
// against the world's colliders, engine sound pitched by speed.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { markNoAO } from '../../render/renderer.js';
import { labelTexture, glowSprite, glowTexture, hsl, boxUV, beam } from './common.js';
import { MeshBuilder } from './buildkit.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

const CAR_COLORS = ['#b01818', '#1a3a8a', '#f4f4f2', '#141416', '#8a8e94', '#c8ccd0', '#1a5a3a', '#e8a020', '#3a6ab8', '#5a1a2a', '#d8d0c0'];

// Side profiles (z forward, y up), in metres. Wheel wells are cut from the bottom edge.
const CAR_CLASSES = {
  sedan: { L: 4.7, W: 1.84, wheelR: 0.33, wheelbase: 2.8, clearance: 0.28, belt: 0.98,
    body: [[-2.35, 0.3], [2.35, 0.3], [2.38, 0.62], [2.25, 0.8], [1.3, 0.95], [-1.9, 1.0], [-2.32, 0.95], [-2.38, 0.6]],
    cabin: [[1.25, 0.95], [0.35, 1.42], [-1.0, 1.44], [-1.85, 1.0]] },
  sports: { L: 4.4, W: 1.95, wheelR: 0.34, wheelbase: 2.6, clearance: 0.14, belt: 0.82,
    body: [[-2.2, 0.16], [2.2, 0.16], [2.25, 0.42], [2.05, 0.58], [0.9, 0.8], [-1.6, 0.88], [-2.18, 0.86], [-2.24, 0.45]],
    cabin: [[0.85, 0.8], [0.05, 1.18], [-0.75, 1.2], [-1.6, 0.88]] },
  suv: { L: 4.8, W: 1.95, wheelR: 0.4, wheelbase: 2.85, clearance: 0.38, belt: 1.22,
    body: [[-2.4, 0.42], [2.4, 0.42], [2.45, 0.85], [2.3, 1.08], [1.4, 1.2], [-2.35, 1.24], [-2.42, 1.2], [-2.45, 0.8]],
    cabin: [[1.35, 1.2], [0.6, 1.78], [-2.2, 1.82], [-2.35, 1.24]] },
  pickup: { L: 5.4, W: 1.98, wheelR: 0.42, wheelbase: 3.4, clearance: 0.42, belt: 1.18, bed: true,
    body: [[-2.7, 0.45], [2.7, 0.45], [2.74, 0.9], [2.6, 1.12], [1.7, 1.2], [-2.7, 1.2], [-2.74, 0.85]],
    cabin: [[1.65, 1.2], [0.95, 1.85], [-0.45, 1.88], [-0.55, 1.2]] },
  van: { L: 5.2, W: 2.0, wheelR: 0.38, wheelbase: 3.3, clearance: 0.35, belt: 1.25,
    body: [[-2.6, 0.4], [2.6, 0.4], [2.62, 0.95], [2.3, 1.2], [-2.6, 1.25], [-2.62, 0.9]],
    cabin: [[2.25, 1.2], [1.5, 2.2], [-2.55, 2.25], [-2.6, 1.25]], vanRoof: true },
  truck: { L: 8.5, W: 2.4, wheelR: 0.5, wheelbase: 5.2, clearance: 0.5, belt: 1.6, box: true,
    body: [[-4.25, 0.55], [4.25, 0.55], [4.28, 1.3], [4.1, 1.6], [2.4, 1.62], [2.4, 1.62], [-4.25, 1.62]],
    cabin: [[4.05, 1.6], [3.6, 2.9], [2.45, 2.95], [2.4, 1.62]] },
  bus: { L: 11.5, W: 2.5, wheelR: 0.5, wheelbase: 6.5, clearance: 0.35, belt: 1.35, busWindows: true,
    body: [[-5.75, 0.4], [5.75, 0.4], [5.78, 1.2], [5.7, 1.35], [-5.75, 1.35], [-5.78, 1.1]],
    cabin: [[5.72, 1.35], [5.55, 3.05], [-5.7, 3.1], [-5.75, 1.35]] },
  limo: { L: 7.2, W: 1.9, wheelR: 0.34, wheelbase: 5.2, clearance: 0.26, belt: 0.96,
    body: [[-3.6, 0.28], [3.6, 0.28], [3.63, 0.6], [3.5, 0.8], [2.5, 0.94], [-3.1, 0.98], [-3.55, 0.94], [-3.62, 0.6]],
    cabin: [[2.45, 0.94], [1.6, 1.42], [-2.3, 1.44], [-3.05, 0.98]] },
  vintage: { L: 4.3, W: 1.7, wheelR: 0.38, wheelbase: 2.7, clearance: 0.4, belt: 1.1, vintage: true,
    body: [[-2.1, 0.55], [1.9, 0.55], [2.1, 0.75], [2.05, 1.05], [0.9, 1.1], [-1.9, 1.12], [-2.12, 0.95]],
    cabin: [[0.85, 1.1], [0.55, 1.85], [-1.35, 1.88], [-1.6, 1.12]] },
};

function carPaint(a, rng, params) {
  if (params.color) return params.color;
  if (params.police) return '#f4f4f2';
  if (a.primaryColor && a.primaryColor !== 'rainbow') return a.primaryColor;
  return rng.pick(CAR_COLORS);
}

// Smooth the upper outline of a profile with a Catmull-Rom spline (the flat
// bottom edge and wheel arches are kept exact).
function smoothOutline(points, samples = 40, keepFirst = 1) {
  if (points.length < 4) return points;
  const head = points.slice(0, keepFirst);
  const upper = points.slice(keepFirst - 1);
  const curve = new THREE.SplineCurve(upper.map(([x, y]) => new THREE.Vector2(x, y)));
  const out = curve.getPoints(samples).map((v) => [v.x, v.y]);
  return head.slice(0, -1).concat(out);
}

// Extrude a closed profile (z,y) across the car width, returning a centred,
// smooth-shaded geometry with rounded (bevelled) side edges.
function extrudeProfile(points, width, bevel, holes = [], curveSegs = 3) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.lineTo(points[0][0], points[0][1]);
  for (const h of holes) shape.holes.push(h);
  let geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: Math.max(curveSegs, 4), curveSegments: 10 });
  // Shape X (forward) -> world Z, extrusion Z (width) -> world X (a pure rotation, so winding is kept).
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  // Metre UVs from position (projected on the side).
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i); uv[i * 2 + 1] = p.getY(i) + p.getX(i) * 0.3; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Body profile with wheel wells cut out of the bottom edge.
function bodyWithWells(C) {
  const pts = [];
  const zb = C.wheelbase / 2;
  const y0 = C.body[0][1];
  // Height of the upper outline at z (to keep the arches below the bodywork).
  const upper = C.body.slice(1);
  const upperAt = (z) => {
    let best = Infinity;
    for (let i = 0; i < upper.length - 1; i++) {
      const [z0, a0] = upper[i], [z1, a1] = upper[i + 1];
      if ((z - z0) * (z - z1) <= 0 && Math.abs(z1 - z0) > 1e-6) best = Math.min(best, a0 + (a1 - a0) * (z - z0) / (z1 - z0));
    }
    return best === Infinity ? 1 : best;
  };
  pts.push([C.body[0][0], y0]);
  for (const zc of [-zb, zb]) {
    const cy = C.wheelR * 1.02;
    const rw = Math.min(C.wheelR + 0.07, upperAt(zc) - 0.07 - cy);
    pts.push([zc - rw, y0]);
    for (let k = 0; k <= 12; k++) {
      const an = Math.PI - (k / 12) * Math.PI;
      pts.push([zc + Math.cos(an) * rw, Math.max(y0, cy + Math.sin(an) * rw)]);
    }
    pts.push([zc + rw, y0]);
  }
  // Upper outline (front bumper -> hood -> rear) smoothed with a spline.
  const upperPts = C.body.slice(1);
  const sm = new THREE.SplineCurve(upperPts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(48);
  for (const q of sm) pts.push([q.x, q.y]);
  return pts;
}

function makeWheel(r, w, mats, spokes = 5, style = 'alloy') {
  const g = new THREE.Group();
  const tire = mesh(new THREE.CylinderGeometry(r, r, w, 28, 1), mats.tire);
  tire.rotation.z = Math.PI / 2; g.add(tire);
  // Rounded sidewalls.
  for (const s of [-1, 1]) { const tor = mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 8, 28), mats.tire); tor.rotation.y = Math.PI / 2; tor.position.x = s * w * 0.42; g.add(tor); }
  const rimR = r * 0.66;
  const rim = mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.9, 24), mats.rim); rim.rotation.z = Math.PI / 2; g.add(rim);
  for (const s of [-1, 1]) {
    const face = new THREE.Group(); face.position.x = s * w * 0.46;
    if (style === 'wire') { for (let i = 0; i < 16; i++) { const sp = mesh(new THREE.BoxGeometry(0.005, rimR * 1.9, 0.005), mats.rim); sp.rotation.x = (i / 16) * Math.PI; face.add(sp); } }
    else if (style === 'steel') { const d = mesh(new THREE.CylinderGeometry(rimR * 0.9, rimR * 0.9, 0.02, 20), mats.rim); d.rotation.z = Math.PI / 2; face.add(d); }
    else for (let i = 0; i < spokes; i++) { const sp = mesh(new THREE.BoxGeometry(0.03, rimR * 0.95, 0.07), mats.rim); sp.position.y = 0; sp.geometry.translate(0, rimR * 0.47, 0); sp.rotation.x = (i / spokes) * TAU; face.add(sp); }
    const hub = mesh(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, 0.04, 12), mats.rim); hub.rotation.z = Math.PI / 2; face.add(hub);
    g.add(face);
  }
  return g;
}

// ---------------- Cars ----------------
function buildCar(kind, a, rng, params) {
  const C = CAR_CLASSES[kind] || CAR_CLASSES.sedan;
  const M = G.materials;
  const paint = carPaint(a, rng, params);
  const mats = {
    paint: M.get('carPaint', { color: paint, metalness: rng.range(0.3, 0.7), roughness: rng.range(0.25, 0.4) }),
    glass: M.get('tintedGlass', { color: '#1a2630', opacity: 0.62 }),
    trim: M.plain('#101012', 0.5, 0.2), chrome: M.get('chrome'), tire: M.get('tire'), rim: M.get(kind === 'vintage' ? 'chrome' : rng.pick(['chrome', 'metal', 'steel'])),
    head: M.get('emissive', { color: '#fff6e0', emissiveIntensity: 2.2 }), tail: M.get('emissive', { color: '#ff1a1a', emissiveIntensity: 1.8 }), amber: M.get('emissive', { color: '#ff9a20', emissiveIntensity: 1.2 }),
    seat: M.get('leather', { color: rng.pick(['#1a1a1a', '#4a2e1c', '#c8b89a']) }), interior: M.plain('#1c1c1e', 0.8), grille: M.get('iron'),
    white: M.get('carPaint', { color: '#f4f4f2' }), black: M.get('carPaint', { color: '#141416' }),
  };
  const g = new THREE.Group();
  const W = C.W, bev = Math.min(0.2, W * 0.1);
  const liftY = C.clearance - C.body[0][1] + 0.02;
  // Lower body.
  const bodyGeo = extrudeProfile(bodyWithWells(C), W, bev);
  const body = mesh(bodyGeo, params.police ? mats.white : mats.paint);
  g.add(body);
  // Two-tone police livery: black lower half.
  if (params.police) {
    const low = extrudeProfile(bodyWithWells({ ...C, body: C.body.map(([z, y]) => [z, Math.min(y, C.body[0][1] + (C.belt - C.body[0][1]) * 0.55)]) }), W + 0.01, bev);
    g.add(mesh(low, mats.black));
  }
  // Greenhouse: glass body, painted roof + pillars.
  const cabW = W * (C.vanRoof || kind === 'bus' || kind === 'truck' ? 0.97 : 0.84);
  const cabPts = [C.cabin[0], ...new THREE.SplineCurve(C.cabin.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(24).slice(1, -1).map((q) => [q.x, q.y]), C.cabin[C.cabin.length - 1]];
  const cab = mesh(extrudeProfile(cabPts, cabW, 0.08, [], 3), mats.glass);
  g.add(cab);
  const roofPts = C.cabin;
  const [f0, f1, r1, r0] = roofPts;
  const roofTh = 0.05;
  const roof = mesh(extrudeProfile([[f1[0] - 0.05, f1[1] - roofTh], [f1[0], f1[1] + 0.005], [r1[0], r1[1] + 0.005], [r1[0] + 0.05, r1[1] - roofTh]], cabW * 1.01, 0.03, [], 2), mats.paint);
  g.add(roof);
  // Pillars (A, B, C) as thin painted slabs on both sides.
  const pillar = (za, ya, zb2, yb) => {
    for (const s of [-1, 1]) {
      const len = Math.hypot(zb2 - za, yb - ya);
      const m = mesh(new THREE.BoxGeometry(0.02, len, 0.09), mats.paint);
      m.position.set(s * cabW / 2 * 1.005, (ya + yb) / 2, (za + zb2) / 2);
      m.rotation.x = Math.atan2(zb2 - za, yb - ya);
      g.add(m);
    }
  };
  pillar(f0[0], f0[1], f1[0], f1[1]);
  pillar(r0[0], r0[1], r1[0], r1[1]);
  if (!C.busWindows) { const bz = (f1[0] + r1[0]) / 2 + (C.L > 6 ? 0 : -0.1); pillar(bz, C.belt, bz - 0.05, (f1[1] + r1[1]) / 2); }
  else for (let z = r1[0] + 1.2; z < f1[0] - 0.8; z += 1.3) pillar(z, C.belt, z, f1[1] - 0.02);
  // Truck box / pickup bed.
  if (C.box) {
    const bx = mesh(boxUV(new THREE.BoxGeometry(W * 1.02, 2.6, 6.3), W, 2.6, 6.3), M.get('painted', { color: rng.pick(['#f4f4f2', '#c8ccd0', '#1a3a8a', '#b01818']) }));
    bx.position.set(0, 1.62 + 1.3, -0.95);
    g.add(bx);
    const label = a.label || rng.pick(['GENESIS LOGISTICS', 'FRESH FOODS', 'MOVING CO.', 'EXPRESS']);
    const tex = labelTexture(label, { fg: '#1a1a1a', w: 1024, h: 256, font: 'Arial Black, Arial, sans-serif' });
    for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 })); pl.position.set(s * (W * 0.51 + 0.005), 3.0, -0.95); pl.rotation.y = s * Math.PI / 2; g.add(pl); }
  }
  if (C.bed) {
    const bedMat = mats.paint;
    for (const s of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(0.06, 0.45, 2.0), bedMat); w.position.set(s * (W / 2 - 0.03), C.body[3][1] + 0.2, -1.65); g.add(w); }
    const tg = mesh(new THREE.BoxGeometry(W, 0.45, 0.06), bedMat); tg.position.set(0, C.body[3][1] + 0.2, -2.68); g.add(tg);
    const fl = mesh(new THREE.BoxGeometry(W - 0.1, 0.04, 2.0), mats.trim); fl.position.set(0, C.body[3][1] - 0.02, -1.65); g.add(fl);
  }
  // Lights.
  const front = C.body.reduce((m, p) => Math.max(m, p[0]), -99), rear = C.body.reduce((m, p) => Math.min(m, p[0]), 99);
  const noseY = (C.body[2] ? C.body[2][1] : 0.7) - 0.02;
  for (const s of [-1, 1]) {
    const hl = mesh(C.vintage ? new THREE.SphereGeometry(0.12, 16, 12) : new THREE.BoxGeometry(0.34, 0.1, 0.06), mats.head, false);
    hl.position.set(s * W * (C.vintage ? 0.3 : 0.36), C.vintage ? 1.0 : noseY, front + (C.vintage ? 0 : 0.0));
    g.add(hl);
    const tl = mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), mats.tail, false);
    tl.position.set(s * W * 0.37, (C.body[C.body.length - 1][1] + 0.12), rear - 0.005);
    g.add(tl);
    // Side mirrors.
    if (!C.vintage) { const mr = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), mats.paint); mr.position.set(s * (W / 2 + 0.07), C.belt + 0.08, f0[0] - 0.2); g.add(mr); }
  }
  // Grille & bumpers.
  const gr = mesh(new THREE.BoxGeometry(W * 0.45, C.vintage ? 0.5 : 0.14, 0.04), C.vintage ? mats.chrome : mats.grille, false);
  gr.position.set(0, C.vintage ? 0.85 : noseY - 0.12, front + 0.005); g.add(gr);
  for (const z of [front + 0.03, rear - 0.03]) { const bp = mesh(new THREE.BoxGeometry(W * 0.96, 0.12, 0.1), C.vintage ? mats.chrome : mats.trim); bp.position.set(0, C.body[0][1] + 0.08, z); g.add(bp); }
  // Number plates.
  const plate = labelTexture(a.label && a.label.length < 9 ? a.label.toUpperCase() : `${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))} ${rng.int(100, 999)}`, { bg: '#f4f4f0', fg: '#1a1a1a', border: '#1a1a1a', w: 512, h: 128, font: 'Arial, sans-serif' });
  for (const [z, s] of [[front + 0.085, 1], [rear - 0.085, -1]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: plate, roughness: 0.4 })); pl.position.set(0, C.body[0][1] + 0.22, z); if (s < 0) pl.rotation.y = Math.PI; g.add(pl); }
  // Interior: seats, dashboard, steering wheel.
  const seatZ = [f0[0] - 0.75, r0[0] + 0.55];
  for (const z of seatZ) for (const x of [-W * 0.23, W * 0.23]) {
    if (z === seatZ[1] && C.L < 4.5 && kind === 'sports') continue;
    const sb = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), mats.seat); sb.position.set(x, C.belt - 0.35, z); g.add(sb);
    const sr = mesh(new THREE.BoxGeometry(0.5, 0.6, 0.12), mats.seat); sr.position.set(x, C.belt - 0.05, z - 0.28); sr.rotation.x = -0.15; g.add(sr);
  }
  const dash = mesh(new THREE.BoxGeometry(W * 0.9, 0.2, 0.4), mats.interior); dash.position.set(0, C.belt - 0.02, f0[0] - 0.2); g.add(dash);
  const sw = mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), mats.trim); sw.position.set(W * 0.23, C.belt + 0.08, f0[0] - 0.45); sw.rotation.set(-0.9, 0, 0); g.add(sw);
  // Specials: taxi sign, police/ambulance light bar, stripes.
  const flashers = [];
  if (params.taxi) { const sign = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.2), M.get('emissive', { color: '#fff4c0', emissiveIntensity: 1 })); sign.position.set(0, f1[1] + 0.1, (f1[0] + r1[0]) / 2); g.add(sign); const tx = labelTexture('TAXI', { fg: '#1a1a1a', w: 256, h: 96, font: 'Arial Black, sans-serif' }); for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.14), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); p.position.set(0, f1[1] + 0.1, (f1[0] + r1[0]) / 2 + s * 0.101); if (s < 0) p.rotation.y = Math.PI; g.add(p); } }
  if (params.police || params.ambulance) {
    const bar = mesh(new THREE.BoxGeometry(W * 0.7, 0.1, 0.25), mats.trim); bar.position.set(0, f1[1] + 0.06, (f1[0] + r1[0]) / 2 + 0.2); g.add(bar);
    for (const s of [-1, 1]) {
      const col = params.police ? (s < 0 ? '#ff1020' : '#1040ff') : (s < 0 ? '#ff1020' : '#ffffff');
      const l = mesh(new THREE.BoxGeometry(W * 0.3, 0.12, 0.22), M.get('emissive', { color: col, emissiveIntensity: 3 }), false);
      l.position.set(s * W * 0.18, f1[1] + 0.12, (f1[0] + r1[0]) / 2 + 0.2); g.add(l);
      const gl = glowSprite(col, 1.2, 0.8); gl.position.copy(l.position); g.add(gl);
      flashers.push({ l, gl, phase: s < 0 ? 0 : Math.PI });
    }
    if (params.police) { const tx = labelTexture('POLICE', { fg: '#1a2a6a', w: 512, h: 128, font: 'Arial Black, sans-serif' }); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); p.position.set(s * (W / 2 + 0.012), C.belt - 0.25, 0); p.rotation.y = s * Math.PI / 2; g.add(p); } }
    if (params.ambulance) { const tx = labelTexture('AMBULANCE', { fg: '#c01818', w: 1024, h: 160, font: 'Arial Black, sans-serif' }); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); p.position.set(s * (W / 2 + 0.012), C.belt + 0.3, -0.5); p.rotation.y = s * Math.PI / 2; g.add(p); } const stripe = mesh(new THREE.BoxGeometry(W + 0.02, 0.18, C.L * 0.96), M.get('carPaint', { color: '#c01818' })); stripe.position.y = C.belt - 0.15; g.add(stripe); }
  }
  if (kind === 'sports' && rng.chance(0.5)) { const sp = mesh(new THREE.BoxGeometry(W * 0.8, 0.04, 0.3), mats.paint); sp.position.set(0, C.body[C.body.length - 2][1] + 0.25, rear + 0.2); g.add(sp); for (const s of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.04, 0.22, 0.1), mats.trim); st.position.set(s * W * 0.3, C.body[C.body.length - 2][1] + 0.12, rear + 0.22); g.add(st); } }
  if (C.vintage) {
    // Separate rounded fenders + running boards.
    for (const zc of [-C.wheelbase / 2, C.wheelbase / 2]) for (const s of [-1, 1]) {
      const f = mesh(new THREE.CylinderGeometry(C.wheelR + 0.12, C.wheelR + 0.12, 0.3, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), mats.paint);
      f.material = mats.paint; f.position.set(s * (W / 2 + 0.05), C.wheelR + 0.02, zc);
      g.add(f);
    }
    for (const s of [-1, 1]) { const rb = mesh(new THREE.BoxGeometry(0.28, 0.04, C.wheelbase - 0.8), mats.trim); rb.position.set(s * (W / 2 + 0.1), 0.42, 0); g.add(rb); }
  }
  // Wheels.
  const wheels = [];
  const track = W / 2 - 0.1 + (C.vintage ? 0.12 : 0);
  const wheelW = C.wheelR * (kind === 'sports' ? 0.75 : 0.6);
  const axles = kind === 'truck' || kind === 'bus' ? [C.wheelbase / 2, -C.wheelbase / 2, -C.wheelbase / 2 + (kind === 'truck' ? -1.1 : 0)].filter((v, i, arr) => arr.indexOf(v) === i) : [C.wheelbase / 2, -C.wheelbase / 2];
  for (const z of axles) for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * track, C.wheelR, z);
    const wh = makeWheel(C.wheelR, wheelW, mats, rng.pick([5, 6, 10]), C.vintage ? 'wire' : kind === 'truck' || kind === 'bus' || kind === 'van' ? 'steel' : 'alloy');
    wh.rotation.y = s < 0 ? Math.PI : 0;
    const spin = new THREE.Group(); spin.add(wh);
    pivot.add(spin);
    g.add(pivot);
    wheels.push({ pivot, spin, steer: z > 0, r: C.wheelR, x: s * track, z });
  }
  // Raise the body so the wheels touch the ground.
  g.children.forEach((c) => { if (!wheels.some((w) => w.pivot === c)) c.position.y += liftY; });
  const H = Math.max(...C.cabin.map((p) => p[1])) + liftY;
  return {
    group: g, wheels, L: C.L, W, H, flashers, mats,
    seat: { x: W * 0.23, y: C.belt - 0.28 + liftY, z: seatZ[0] },
    headlights: [[-W * 0.36, noseY + liftY, front], [W * 0.36, noseY + liftY, front]],
    speed: { max: { sports: 62, sedan: 45, suv: 42, pickup: 40, van: 36, truck: 28, bus: 25, limo: 38, vintage: 25 }[kind] || 40, accel: { sports: 14, truck: 4, bus: 3.5 }[kind] || 8 },
    name: params.police ? 'Police car' : params.taxi ? 'Taxi' : params.ambulance ? 'Ambulance' : { sedan: 'Car', sports: 'Sports car', suv: 'SUV', pickup: 'Pickup truck', van: 'Van', truck: 'Truck', bus: 'Bus', limo: 'Limousine', vintage: 'Vintage car' }[kind],
  };
}

// ---------------- Two wheelers ----------------
function buildBike(kind, a, rng) {
  const M = G.materials;
  const motor = kind === 'motorcycle';
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(CAR_COLORS);
  const mats = { tire: M.get('tire'), rim: M.get('chrome'), frame: M.get(motor ? 'carPaint' : 'painted', { color: col }), chrome: M.get('chrome'), seat: M.get('leather', { color: '#1a1a1a' }), engine: M.get('iron'), head: M.get('emissive', { color: '#fff6e0', emissiveIntensity: 2 }), tail: M.get('emissive', { color: '#ff1a1a', emissiveIntensity: 1.5 }) };
  const g = new THREE.Group();
  const r = motor ? 0.33 : 0.34, wb = motor ? 1.45 : 1.05;
  const b = new MeshBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = motor ? 0.035 : 0.018;
  const head = V(0, motor ? 0.95 : 0.95, wb / 2 - 0.18), seat = V(0, motor ? 0.78 : 0.9, -0.15), crank = V(0, r * 0.95, 0);
  const rearAx = V(0, r, -wb / 2), frontAx = V(0, r, wb / 2);
  for (const [p, q] of [[head, crank], [seat, crank], [seat, rearAx], [crank, rearAx], [head, seat.clone().add(V(0, 0.05, 0.1))], [head, frontAx]]) beam(b, 'frame', p, q, tube, 8);
  const frameGroup = b.build({ frame: mats.frame });
  g.add(frameGroup);
  const wheels = [];
  for (const [z, steer] of [[wb / 2, true], [-wb / 2, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(0, r, z);
    const wg = new THREE.Group();
    const tire = mesh(new THREE.TorusGeometry(r - 0.03, motor ? 0.06 : 0.022, 10, 32), mats.tire); tire.rotation.y = Math.PI / 2; wg.add(tire);
    for (let i = 0; i < (motor ? 6 : 18); i++) { const sp = mesh(new THREE.BoxGeometry(0.006, (r - 0.04) * 2, motor ? 0.03 : 0.006), mats.rim); sp.rotation.x = (i / (motor ? 6 : 18)) * Math.PI; wg.add(sp); }
    const spin = new THREE.Group(); spin.add(wg); pivot.add(spin); g.add(pivot);
    wheels.push({ pivot, spin, steer, r, x: 0, z });
  }
  const sd = mesh(new THREE.BoxGeometry(0.2, 0.06, motor ? 0.55 : 0.25), mats.seat); sd.position.copy(seat).add(V(0, 0.04, motor ? -0.05 : 0)); g.add(sd);
  const bar = mesh(new THREE.CylinderGeometry(0.014, 0.014, motor ? 0.75 : 0.55, 8), mats.chrome); bar.rotation.z = Math.PI / 2; bar.position.copy(head).add(V(0, 0.12, -0.05)); g.add(bar);
  if (motor) {
    const tank = mesh(new THREE.SphereGeometry(0.2, 16, 12), mats.frame); tank.scale.set(0.9, 0.7, 1.5); tank.position.set(0, 0.88, 0.3); g.add(tank);
    const eng = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.4), mats.engine); eng.position.set(0, 0.45, 0.05); g.add(eng);
    for (const s of [-1, 1]) { const ex = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 10), mats.chrome); ex.rotation.x = Math.PI / 2 - 0.15; ex.position.set(s * 0.16, 0.35, -0.4); g.add(ex); }
    const hl = mesh(new THREE.SphereGeometry(0.09, 12, 10), mats.head, false); hl.position.copy(head).add(V(0, 0, 0.12)); g.add(hl);
    const tl = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.04), mats.tail, false); tl.position.set(0, 0.85, -wb / 2 - 0.1); g.add(tl);
    const fender = mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.16, 16, 1, true, 0, Math.PI * 0.8), mats.frame); fender.rotation.set(0, 0, Math.PI / 2); fender.position.set(0, r, -wb / 2); g.add(fender);
  } else {
    const ped = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), mats.engine); ped.rotation.z = Math.PI / 2; ped.position.copy(crank); g.add(ped);
  }
  return { group: g, wheels, L: wb + 0.7, W: 0.6, H: 1.1, seat: { x: 0, y: seat.y - 0.02, z: seat.z }, bike: true, speed: { max: motor ? 55 : 9, accel: motor ? 12 : 3 }, name: motor ? 'Motorcycle' : 'Bicycle', mats, flashers: [], headlights: motor ? [[0, head.y, head.z + 0.15]] : [] };
}

// ---------------- Tractor, tank, wagon ----------------
function buildTractor(a, rng) {
  const M = G.materials;
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#2a7a2a', '#c81a1a', '#1a4ab0', '#e8a020']);
  const mats = { paint: M.get('carPaint', { color: col }), tire: M.get('tire'), rim: M.get('painted', { color: '#e8c020' }), trim: M.plain('#141414', 0.6), glass: M.get('glass', {}), chrome: M.get('chrome'), seat: M.get('leather', { color: '#1a1a1a' }), head: M.get('emissive', { color: '#fff6e0', emissiveIntensity: 2 }) };
  const g = new THREE.Group();
  const hood = mesh(new THREE.BoxGeometry(0.9, 0.8, 1.8), mats.paint); hood.position.set(0, 1.2, 0.9); g.add(hood);
  const cab = new THREE.Group();
  for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.1], [0.6, 0.1]]) { const p = mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), mats.trim); p.position.set(x, 2.0, z); cab.add(p); }
  const roofM = mesh(new THREE.BoxGeometry(1.4, 0.08, 1.2), mats.paint); roofM.position.set(0, 2.72, -0.4); cab.add(roofM);
  const glassF = mesh(new THREE.BoxGeometry(1.2, 1.2, 0.02), mats.glass); glassF.position.set(0, 2.05, 0.1); cab.add(glassF);
  g.add(cab);
  const ex = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), mats.chrome); ex.position.set(0.3, 2.1, 1.3); g.add(ex);
  const seat = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), mats.seat); seat.position.set(0, 1.35, -0.4); g.add(seat);
  const wheels = [];
  for (const [z, r, s, steer] of [[1.3, 0.45, 1, true], [1.3, 0.45, -1, true], [-0.5, 0.85, 1, false], [-0.5, 0.85, -1, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.85, r, z);
    const wh = makeWheel(r, r * 0.6, mats, 8, 'steel');
    const spin = new THREE.Group(); spin.add(wh); pivot.add(spin); g.add(pivot);
    wheels.push({ pivot, spin, steer, r, x: s * 0.85, z });
  }
  const hl = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), mats.head, false); hl.position.set(0, 1.4, 1.81); g.add(hl);
  return { group: g, wheels, L: 3.6, W: 2.0, H: 2.8, seat: { x: 0, y: 1.4, z: -0.4 }, speed: { max: 14, accel: 4 }, name: 'Tractor', mats, flashers: [], headlights: [[0, 1.4, 1.8]], open: true };
}

function buildTank(a, rng) {
  const M = G.materials;
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#4a5a3a', '#6a6448', '#5a5a52', '#3a4a3a']);
  const mats = { paint: M.get('paintedWorn', { color: col }), track: M.get('tire', { world: 0.3 }), steel: M.get('iron') };
  const g = new THREE.Group();
  const hull = mesh(extrudeProfile([[-3.2, 0.5], [3.0, 0.5], [3.4, 1.0], [3.0, 1.45], [-3.1, 1.5], [-3.3, 1.1]], 3.2, 0.06), mats.paint); g.add(hull);
  for (const s of [-1, 1]) {
    const tr = mesh(new THREE.CapsuleGeometry(0.5, 5.6, 6, 12), mats.track); tr.rotation.x = Math.PI / 2; tr.scale.set(0.8, 1, 1); tr.position.set(s * 1.55, 0.52, 0); g.add(tr);
    for (let i = 0; i < 6; i++) { const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 16), mats.steel); w.rotation.z = Math.PI / 2; w.position.set(s * 1.55, 0.45, -2.5 + i); g.add(w); }
  }
  const turret = new THREE.Group(); turret.position.set(0, 1.5, -0.3);
  const tb = mesh(new THREE.SphereGeometry(1.2, 20, 12, 0, TAU, 0, Math.PI / 2), mats.paint); tb.scale.set(1, 0.55, 1.3); turret.add(tb);
  const barrel = mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 12), mats.steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.35, 2.7); turret.add(barrel);
  const hatch = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 16), mats.paint); hatch.position.set(0.4, 0.68, -0.4); turret.add(hatch);
  g.add(turret);
  return { group: g, wheels: [], L: 6.8, W: 3.4, H: 2.5, seat: { x: 0.4, y: 2.05, z: -0.7 }, speed: { max: 18, accel: 3 }, name: 'Tank', mats, flashers: [], headlights: [], turret, tracked: true, open: true };
}

function buildWagon(a, rng) {
  const M = G.materials;
  const mats = { wood: M.get('planks'), dark: M.get('darkWood'), iron: M.get('iron'), canvas: M.get('fabric', { color: '#f0e8d4', side: THREE.DoubleSide }), tire: M.get('darkWood'), rim: M.get('iron') };
  const g = new THREE.Group();
  const bed = mesh(boxUV(new THREE.BoxGeometry(1.5, 0.1, 3), 1.5, 0.1, 3), mats.wood); bed.position.y = 0.9; g.add(bed);
  for (const s of [-1, 1]) { const side = mesh(boxUV(new THREE.BoxGeometry(0.06, 0.5, 3), 0.06, 0.5, 3), mats.wood); side.position.set(s * 0.75, 1.2, 0); g.add(side); }
  if (has(a, 'covered') || rng.chance(0.5)) { const cover = mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.8, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), mats.canvas); cover.position.set(0, 1.35, 0); g.add(cover); }
  const wheels = [];
  for (const [z, s] of [[1.1, 1], [1.1, -1], [-1.1, 1], [-1.1, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.85, 0.55, z);
    const wg = new THREE.Group();
    const rimT = mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 24), mats.dark); rimT.rotation.y = Math.PI / 2; wg.add(rimT);
    for (let i = 0; i < 12; i++) { const sp = mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), mats.dark); sp.rotation.x = (i / 12) * Math.PI; wg.add(sp); }
    const spin = new THREE.Group(); spin.add(wg); pivot.add(spin); g.add(pivot);
    wheels.push({ pivot, spin, steer: z > 0, r: 0.55, x: s * 0.85, z });
  }
  const seat = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.35), mats.wood); seat.position.set(0, 1.5, 1.3); g.add(seat);
  return { group: g, wheels, L: 3.2, W: 1.8, H: 2.2, seat: { x: 0, y: 1.55, z: 1.3 }, speed: { max: 8, accel: 2 }, name: 'Wooden wagon', mats, flashers: [], headlights: [], open: true };
}

// ---------------- Train (with its own track) ----------------
function buildTrain(a, rng) {
  const M = G.materials;
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#1a1a1a', '#1a3a2a', '#6a1a1a', '#1a2a5a']);
  const mats = { paint: M.get('carPaint', { color: col, metalness: 0.3 }), iron: M.get('iron'), brass: M.get('bronze'), red: M.get('carPaint', { color: '#a01818' }), wood: M.get('darkWood'), rail: M.get('steel'), glass: M.get('glass', {}), head: M.get('emissive', { color: '#fff0c0', emissiveIntensity: 2.5 }) };
  const g = new THREE.Group();
  const trackLen = 90;
  const track = new THREE.Group();
  const b = new MeshBuilder();
  for (let z = -trackLen / 2; z < trackLen / 2; z += 0.6) b.box('wood', [-1.2, 0, z - 0.12], [1.2, 0.12, z + 0.12]);
  for (const x of [-0.72, 0.72]) b.box('rail', [x - 0.04, 0.12, -trackLen / 2], [x + 0.04, 0.26, trackLen / 2]);
  track.add(b.build({ wood: mats.wood, rail: mats.rail }));
  g.add(track);
  const loco = new THREE.Group();
  const boiler = mesh(new THREE.CylinderGeometry(0.75, 0.75, 4, 24), mats.paint); boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 1.9, 0.8); loco.add(boiler);
  for (let i = 0; i < 4; i++) { const band = mesh(new THREE.TorusGeometry(0.76, 0.03, 6, 24), mats.brass); band.position.set(0, 1.9, -0.8 + i * 1.1); loco.add(band); }
  const front = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 24), mats.iron); front.rotation.x = Math.PI / 2; front.position.set(0, 1.9, 2.82); loco.add(front);
  const chimney = mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.9, 16), mats.iron); chimney.position.set(0, 2.9, 2.2); loco.add(chimney);
  const dome = mesh(new THREE.SphereGeometry(0.3, 12, 8), mats.brass); dome.position.set(0, 2.65, 0.9); loco.add(dome);
  const cab = mesh(boxUV(new THREE.BoxGeometry(1.9, 1.8, 1.6), 1.9, 1.8, 1.6), mats.red); cab.position.set(0, 2.4, -1.8); loco.add(cab);
  const croof = mesh(new THREE.BoxGeometry(2.1, 0.1, 1.9), mats.iron); croof.position.set(0, 3.35, -1.8); loco.add(croof);
  const chassis = mesh(new THREE.BoxGeometry(1.7, 0.35, 5.6), mats.iron); chassis.position.set(0, 1.0, 0.2); loco.add(chassis);
  const cow = mesh(new THREE.ConeGeometry(0.9, 0.7, 4, 1), mats.red); cow.rotation.set(-Math.PI / 2 + 0.6, Math.PI / 4, 0); cow.position.set(0, 0.7, 3.1); loco.add(cow);
  const hl = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 16), mats.head, false); hl.rotation.x = Math.PI / 2; hl.position.set(0, 2.9, 2.85); loco.add(hl);
  const wheels = [];
  for (const z of [1.8, 0.6, -0.6, -1.8]) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.72, 0.62, z);
    const wg = new THREE.Group();
    const wd = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), mats.red); wd.rotation.z = Math.PI / 2; wg.add(wd);
    for (let i = 0; i < 10; i++) { const sp = mesh(new THREE.BoxGeometry(0.13, 0.9, 0.05), mats.iron); sp.rotation.x = (i / 10) * Math.PI; wg.add(sp); }
    const spin = new THREE.Group(); spin.add(wg); pivot.add(spin); loco.add(pivot);
    wheels.push({ pivot, spin, steer: false, r: 0.5, x: s * 0.72, z });
  }
  // Coupling rods.
  const rods = [];
  for (const s of [-1, 1]) { const rod = mesh(new THREE.BoxGeometry(0.05, 0.08, 3.8), mats.iron); rod.position.set(s * 0.82, 0.62, 0); loco.add(rod); rods.push(rod); }
  g.add(loco);
  // Carriages.
  const cars = [];
  for (let c = 0; c < 2; c++) {
    const car = new THREE.Group();
    const bx = mesh(boxUV(new THREE.BoxGeometry(2.1, 2.2, 7), 2.1, 2.2, 7), M.get('woodSiding', { color: rng.pick(['#6a1a1a', '#1a3a2a', '#2a2a5a']) })); bx.position.y = 2.1; car.add(bx);
    const rf = mesh(new THREE.BoxGeometry(2.35, 0.15, 7.3), mats.iron); rf.position.y = 3.25; car.add(rf);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const wdw = mesh(new THREE.PlaneGeometry(0.8, 0.7), M.get('emissive', { color: '#ffe0a0', emissiveIntensity: 0.6 }), false); wdw.position.set(s * 1.06, 2.5, -2.6 + i * 1.3); wdw.rotation.y = s * Math.PI / 2; car.add(wdw); }
    for (const z of [-2.4, 2.4]) for (const s of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), mats.iron); w.rotation.z = Math.PI / 2; w.position.set(s * 0.72, 0.52, z); car.add(w); }
    car.position.z = -3 - 4.6 - c * 7.6;
    g.add(car);
    cars.push(car);
  }
  return { group: g, wheels, L: 6, W: 2.4, H: 3.5, seat: { x: 0, y: 1.8, z: -1.8 }, speed: { max: 20, accel: 2.5 }, name: 'Steam train', mats, flashers: [], headlights: [[0, 2.9, 2.9]], train: { loco, cars, trackLen, rods, chimney }, open: true };
}

// ---------------- Controller ----------------
// Turns a built vehicle into a drivable entity.
export function makeDrivable(data, v, opts = {}) {
  const root = data.root;
  const body = v.group;
  const st = { speed: 0, steer: 0, yawVel: 0, pos: new THREE.Vector3(), lean: 0, driving: false, rpm: 0, trainZ: 0 };
  let engine = null;
  const tmp = new THREE.Vector3();
  data.vehicle = true;
  data.thirdPersonOnly = !!opts.thirdPersonOnly;
  data.camDistance = opts.camDistance || Math.max(5.5, v.L * 1.25);
  data.showDriver = true;
  data.exitLabel = 'Get out (E)';
  data.interact = { label: () => (G.player.vehicle === data ? null : `${opts.verb || 'Drive'} the ${v.name.toLowerCase()}`), action: (e, player) => enter(player) };
  const seatWorld = () => new THREE.Vector3(v.seat.x, v.seat.y, v.seat.z).applyMatrix4(root.matrixWorld);
  data.seatEye = () => seatWorld().add(new THREE.Vector3(0, v.bike ? 0.95 : 0.78, 0));
  data.driverPose = () => {
    const sp = seatWorld();
    return { pos: sp.sub(new THREE.Vector3(0, 0.46, 0).applyQuaternion(root.quaternion)), yaw: root.rotation.y };
  };
  function enter(player) {
    if (player.held) G.interaction.drop();
    player.vehicle = data;
    player.sitting = null;
    st.driving = true;
    if (G.avatar) { G.avatar.setPose('sit', { seatHeight: 0.46 }); G.avatar.setFirstPerson(player.cameraMode === 'first'); }
    player.yaw = root.rotation.y + Math.PI;
    engine = G.audio ? G.audio.engine(opts.engineKind || (v.bike && !v.name.startsWith('Motor') ? 'none' : 'car')) : null;
    G.ui.toast(opts.help || 'W/S accelerate/brake · A/D steer · Space handbrake · E exit · V camera', '', 4500);
  }
  data.exit = (player) => {
    player.vehicle = null;
    st.driving = false;
    if (engine) { engine.stop(); engine = null; }
    const side = new THREE.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y)).multiplyScalar(-(v.W / 2 + 0.9));
    const p = root.position.clone().add(side);
    const world = G.worlds.get(data.worldId);
    p.y = world.colliders.groundHeight(p.x, p.z, 0.3, p.y + 3, 6, data.id);
    player.teleport(p, root.rotation.y + Math.PI);
    if (G.avatar) { G.avatar.setPose(null); G.avatar.setFirstPerson(player.cameraMode === 'first'); }
    G.registry.refresh(data);
  };
  data.drive = (dt, input, player) => {
    const world = G.worlds.get(data.worldId);
    const ax = input.moveAxes();
    const handbrake = input.held('jump');
    // Throttle & braking.
    const maxV = v.speed.max / 3.6 * (ax.sprint ? 1.25 : 1) * (opts.speedMul || 1);
    if (v.train) {
      st.speed += ax.y * v.speed.accel * dt;
      st.speed *= Math.exp(-dt * 0.15);
      st.speed = clamp(st.speed, -maxV * 0.5, maxV);
    } else {
      if (ax.y > 0.1) st.speed += (st.speed < -0.5 ? 18 : v.speed.accel) * ax.y * dt;
      else if (ax.y < -0.1) st.speed += (st.speed > 0.5 ? -18 : -v.speed.accel * 0.6) * -ax.y * dt;
      else st.speed *= Math.exp(-dt * 0.5);
      if (handbrake) st.speed *= Math.exp(-dt * 3);
      st.speed = clamp(st.speed, -maxV * 0.35, maxV);
    }
    // Steering (less at speed), bicycle-model yaw rate.
    const steerTarget = -ax.x * (v.tracked ? 1 : 0.55) / (1 + Math.abs(st.speed) * 0.04);
    st.steer += (steerTarget - st.steer) * Math.min(1, dt * 6);
    if (v.train) st.steer = 0;
    const wb = Math.max(1, v.L * 0.6);
    const yawRate = v.tracked ? st.steer * 1.2 : (st.speed / wb) * Math.tan(st.steer);
    root.rotation.y += yawRate * dt;
    // Move.
    const fwd = tmp.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    if (v.train) {
      st.trainZ = clamp(st.trainZ + st.speed * dt, -v.train.trackLen / 2 + 5, v.train.trackLen / 2 - 5);
      if (Math.abs(st.trainZ) >= v.train.trackLen / 2 - 5.01) st.speed = 0;
    } else {
      const prev = root.position.clone();
      root.position.addScaledVector(fwd, st.speed * dt);
      // Collisions: resolve a few circles along the body.
      const r = v.W * 0.5;
      const pts = [0, v.L * 0.3, -v.L * 0.3];
      for (const off of pts) {
        const c = root.position.clone().addScaledVector(fwd, off);
        const before = c.clone();
        world.colliders.resolve(c, r, v.H, 0.5, data.id, 2);
        const dx = c.x - before.x, dz = c.z - before.z;
        if (Math.abs(dx) + Math.abs(dz) > 1e-4) { root.position.x += dx; root.position.z += dz; st.speed *= 0.6; if (Math.hypot(dx, dz) > 0.05 && G.audio) G.audio.play('bounce', root.position, { v: 3 }); }
      }
      // World bounds.
      const B = world.bounds;
      root.position.x = clamp(root.position.x, -B, B); root.position.z = clamp(root.position.z, -B, B);
      void prev;
    }
    groundAlign(world, dt);
    st.refreshT = (st.refreshT || 0) + dt;
    if (st.refreshT > 0.25 && Math.abs(st.speed) > 0.05) { st.refreshT = 0; G.registry.refresh(data); }
    // Camera yaw follows the vehicle loosely.
    const camYaw = root.rotation.y + Math.PI;
    let dy = camYaw - player.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    if (Math.abs(st.speed) > 1) player.yaw += dy * Math.min(1, dt * 2.5);
    player.position.copy(root.position);
    // Wheels & extras.
    animateParts(dt, input, player);
    if (engine) engine.set(clamp(Math.abs(st.speed) / maxV, 0, 1), ax.y > 0.1 ? 1 : 0);
  };
  function groundAlign(world, dt) {
    if (v.train) return;
    const yaw = root.rotation.y;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hl = v.L * 0.38, hw = v.W * 0.4;
    const sample = (lx, lz) => { const wx = root.position.x + lx * c + lz * s, wz = root.position.z - lx * s + lz * c; return world.colliders.groundHeight(wx, wz, 0.2, root.position.y + 1.2, 1.2, data.id); };
    const f = sample(0, hl), bk = sample(0, -hl), l = sample(-hw, 0), rr = sample(hw, 0);
    const targetY = (f + bk + l + rr) / 4;
    root.position.y += (targetY - root.position.y) * Math.min(1, dt * 12);
    const pitch = Math.atan2(bk - f, hl * 2), roll = Math.atan2(rr - l, hw * 2);
    body.rotation.x += (pitch - body.rotation.x) * Math.min(1, dt * 8);
    body.rotation.z += ((v.bike ? -st.steer * Math.min(1, Math.abs(st.speed) / 6) * 0.8 : roll * 0.8) - body.rotation.z) * Math.min(1, dt * 6);
  }
  function animateParts(dt, input, player) {
    for (const w of v.wheels) {
      w.spin.rotation.x += (st.speed / w.r) * dt;
      if (w.steer) w.pivot.rotation.y = st.steer * 0.9;
    }
    if (v.turret && player) {
      // Turret follows the camera heading.
      const want = player.yaw + Math.PI - root.rotation.y;
      let d = want - v.turret.rotation.y; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      v.turret.rotation.y += d * Math.min(1, dt * 2);
    }
    if (v.train) {
      v.train.loco.position.z = st.trainZ;
      v.train.cars.forEach((c, i) => { c.position.z = st.trainZ - 3 - 4.6 - i * 7.6; });
      const ph = v.wheels[0].spin.rotation.x;
      for (const rod of v.train.rods) { rod.position.y = 0.62 + Math.sin(ph) * 0.18; rod.position.z = Math.cos(ph) * 0.18; }
    }
  }
  const idleUpdate = data.update;
  data.update = function (dt, t, dist) {
    if (idleUpdate) idleUpdate.call(this, dt, t, dist);
    for (const f of v.flashers) { const on = Math.sin(t * 9 + f.phase) > 0; f.l.visible = on; f.gl.visible = on; }
    if (!st.driving) {
      // Parked: settle on the ground once, wheels idle.
      if (!st.settled) { const world = G.worlds.get(data.worldId); if (world) { groundAlign(world, 1); st.settled = true; } }
    } else if (v.train) {
      // Keep the driver on the locomotive.
    }
    if (v.train && v.train.chimney) {
      smokePuff(this, v.train.chimney, t, Math.abs(st.speed));
    }
  };
  const smoke = [];
  function smokePuff(e, chimney, t, spd) {
    if (!smoke.length) {
      for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#dcdcdc', transparent: true, opacity: 0, depthWrite: false })); s.userData.seed = Math.random(); s.userData.noRaycast = true; markNoAO(s); v.train.loco.add(s); smoke.push(s); }
    }
    for (const s of smoke) {
      const life = (s.userData.seed + t * (0.25 + spd * 0.05)) % 1;
      s.position.set(Math.sin(s.userData.seed * 30) * 0.3 * life, 3.35 + life * 4, 2.2 - life * spd * 0.8);
      s.scale.setScalar(0.5 + life * 2.5);
      s.material.opacity = Math.sin(life * Math.PI) * (0.25 + Math.min(0.3, spd * 0.05));
    }
  }
  if (v.train) {
    data.seatEye = () => new THREE.Vector3(v.seat.x, v.seat.y + 0.8, v.seat.z + st.trainZ).applyMatrix4(root.matrixWorld);
    data.driverPose = () => ({ pos: new THREE.Vector3(v.seat.x, v.seat.y - 0.45, v.seat.z + st.trainZ).applyMatrix4(root.matrixWorld), yaw: root.rotation.y });
  }
  data.onRemove = () => { if (G.player.vehicle === data) data.exit(G.player); if (engine) engine.stop(); };
  data.saveState = () => ({ trainZ: st.trainZ });
  data.loadState = (s) => { if (s && s.trainZ) st.trainZ = s.trainZ; };
  return data;
}

// Colliders for a parked vehicle (a few boxes along the body).
function vehicleColliders(v) {
  if (v.train) return [{ type: 'box', x: 0, z: 0, y0: 0, y1: 0.3, hx: 1.2, hz: v.train.trackLen / 2, walkable: true }];
  if (v.bike) return [{ type: 'box', x: 0, z: 0, y0: 0, y1: 1, hx: 0.25, hz: v.L / 2 }];
  return [{ type: 'box', x: 0, z: 0, y0: 0.1, y1: v.H * 0.95, hx: v.W / 2, hz: v.L / 2, walkable: true }];
}

export const vehicleGen = {
  maxCount: 10,
  estimate: (item) => ({ train: 3, bus: 2.5, truck: 2.5 }[item.params.kind] || 1.8),
  stages: () => [{ name: 'geometry', label: 'Designing body', weight: 3 }, { name: 'details', label: 'Fitting wheels & interior', weight: 1.5 }, { name: 'textures', label: 'Painting', weight: 1 }],
  *build(ctx, item, rng, env) {
    const kind = item.params.kind;
    const a = item.attrs;
    if (['boat', 'sailboat', 'submarine', 'plane', 'helicopter', 'spaceship', 'ufo', 'rocket', 'balloon'].includes(kind)) {
      const { buildCraft } = yield import('./aircraft.js');
      return yield* buildCraft(ctx, item, rng, env);
    }
    ctx.stage('geometry', 'Designing body');
    yield;
    let v;
    if (CAR_CLASSES[kind]) v = buildCar(kind, a, rng, item.params);
    else if (kind === 'motorcycle' || kind === 'bicycle') v = buildBike(kind, a, rng);
    else if (kind === 'tractor') v = buildTractor(a, rng);
    else if (kind === 'tank') v = buildTank(a, rng);
    else if (kind === 'wagon') v = buildWagon(a, rng);
    else if (kind === 'train') v = buildTrain(a, rng);
    else v = buildCar('sedan', a, rng, item.params);
    ctx.stage('details', 'Fitting wheels & interior');
    yield;
    const root = new THREE.Group();
    root.add(v.group);
    const data = {
      root, name: (a.colors[0] && !item.params.color && !item.params.police ? a.colors[0].word[0].toUpperCase() + a.colors[0].word.slice(1) + ' ' + v.name.toLowerCase() : v.name), category: 'vehicle', icon: item.icon,
      height: v.H, footprint: { radius: v.train ? 6 : Math.max(v.L, v.W) / 2 }, colliderDefs: vehicleColliders(v), suppressGrass: false,
      lights: v.headlights.map((p) => ({ pos: [p[0], p[1], p[2] + 1.5], color: '#fff2d8', intensity: 2.5, distance: 14, nightOnly: true })).slice(0, 1),
    };
    if (v.train) { data.flattenTerrain = true; data.footprint = { radius: v.train.trackLen / 2, rect: { hw: 2, hd: v.train.trackLen / 2 } }; data.flattenFalloff = 3; data.sideways = true; }
    makeDrivable(data, v, { camDistance: v.train ? 16 : undefined, engineKind: v.bike && v.name === 'Bicycle' ? 'electric' : 'car' });
    ctx.stage('textures', 'Painting');
    yield;
    return data;
  },
};
