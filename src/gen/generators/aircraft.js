// ---------------------------------------------------------------------------
// Watercraft and aircraft: motorboats (lofted hulls), sailboats (billowing
// sails), submarines (dive with Space/C), planes (take off above stall
// speed), helicopters (hover), spaceships and UFOs (6-DOF hover flight),
// rockets (launch to orbit!) and hot-air balloons (burner lift + wind).
// All are enterable with E and share the vehicle controller conventions.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { markNoAO } from '../../render/renderer.js';
import { glowSprite, glowTexture, hsl, labelTexture, beam } from './common.js';
import { attachFire } from './furniture.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
function lathe(pts, segs = 32) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y)), segs); }
function userCol(a, rng, list) { return a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(list); }

// ---------------- Hull loft ----------------
function hullGeometry(L, W, D, opts = {}) {
  const nL = 28, nV = 14;
  const pos = [], uv = [], idx = [];
  const transom = opts.transom ?? 0.75;
  for (let i = 0; i <= nL; i++) {
    const t = i / nL; // 0 stern .. 1 bow
    const z = -L / 2 + t * L;
    const w = W / 2 * (t < 0.55 ? transom + (1 - transom) * Math.sin(t / 0.55 * Math.PI / 2) : Math.cos((t - 0.55) / 0.45 * Math.PI / 2) ** 0.8);
    const d = D * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2 * 0.7);
    const sheer = t > 0.7 ? (t - 0.7) * 0.6 * D : 0;
    for (let j = 0; j <= nV; j++) {
      const phi = -Math.PI / 2 + (j / nV) * Math.PI;
      const x = Math.sin(phi) * Math.max(0.01, w);
      const y = -d * Math.pow(Math.cos(phi), 0.6) + sheer;
      pos.push(x, y, z);
      uv.push(z, y + x * 0.3);
    }
  }
  for (let i = 0; i < nL; i++) for (let j = 0; j < nV; j++) {
    const a = i * (nV + 1) + j, b = a + nV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // Transom (stern) cap.
  const base = pos.length / 3;
  pos.push(0, -D * 0.5, -L / 2); uv.push(0, 0);
  for (let j = 0; j < nV; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Deck outline for a flat deck surface.
  const deck = new THREE.Shape();
  const edge = [];
  for (let i = 0; i <= nL; i++) edge.push([pos[(i * (nV + 1)) * 3], pos[(i * (nV + 1)) * 3 + 1], pos[(i * (nV + 1)) * 3 + 2]]);
  deck.moveTo(-edge[0][0], edge[0][2]);
  for (const e of edge) deck.lineTo(-e[0], e[2]);
  for (let i = edge.length - 1; i >= 0; i--) deck.lineTo(edge[i][0], edge[i][2]);
  const dg = new THREE.ShapeGeometry(deck, 2);
  dg.rotateX(Math.PI / 2);
  const dp = dg.attributes.position;
  for (let i = 0; i < dp.count; i++) { const z = dp.getZ(i); const t = (z + L / 2) / L; dp.setY(i, (t > 0.7 ? (t - 0.7) * 0.6 * D : 0) - 0.02); }
  dg.computeVertexNormals();
  const duv = dg.attributes.uv; for (let i = 0; i < duv.count; i++) duv.setXY(i, dp.getX(i), dp.getZ(i));
  return { hull: g, deck: dg };
}

// ---------------- Builders ----------------
function boat(a, rng, sail) {
  const M = G.materials;
  const L = sail ? rng.range(7, 10) : rng.range(5, 7), W = L * 0.36, D = L * 0.13;
  const col = userCol(a, rng, ['#f4f4f2', '#1a3a6a', '#b01818', '#2a6a4a', '#e8e0c8']);
  const { hull, deck } = hullGeometry(L, W, D, { transom: 0.8 });
  const g = new THREE.Group();
  g.add(mesh(hull, M.get('carPaint', { color: col, side: THREE.DoubleSide })));
  g.add(mesh(deck, M.get('deck')));
  const parts = {};
  if (sail) {
    const mastH = L * 1.3;
    const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, mastH, 10), M.get('metal'));
    mast.position.set(0, mastH / 2, L * 0.08); g.add(mast);
    const boom = mesh(new THREE.CylinderGeometry(0.05, 0.05, L * 0.45, 8), M.get('metal')); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.1, L * 0.08 - L * 0.22); g.add(boom);
    const sailCol = has(a, 'red sail', 'red sails') ? '#c02020' : '#f6f4ee';
    const makeSail = (pts) => { const geo = new THREE.BufferGeometry(); const res = 10; const P = [], I = []; for (let i = 0; i <= res; i++) for (let j = 0; j <= res - i; j++) { const u = i / res, v = j / res; const p = new THREE.Vector3().addScaledVector(pts[0], 1 - u - v).addScaledVector(pts[1], u).addScaledVector(pts[2], v); P.push(p.x, p.y, p.z); } let k = 0; const rowStart = []; for (let i = 0; i <= res; i++) { rowStart.push(k); k += res - i + 1; } for (let i = 0; i < res; i++) for (let j = 0; j < res - i; j++) { const a0 = rowStart[i] + j, b0 = rowStart[i + 1] + j; I.push(a0, b0, a0 + 1); if (j < res - i - 1) I.push(a0 + 1, b0, b0 + 1); } geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals(); geo.userData.base = P.slice(); return geo; };
    const main = mesh(makeSail([new THREE.Vector3(0, 1.2, L * 0.08), new THREE.Vector3(0, mastH * 0.95, L * 0.08), new THREE.Vector3(0, 1.2, L * 0.08 - L * 0.44)]), M.get('fabric', { color: sailCol, side: THREE.DoubleSide }));
    const jib = mesh(makeSail([new THREE.Vector3(0, 0.6, L * 0.48), new THREE.Vector3(0, mastH * 0.85, L * 0.09), new THREE.Vector3(0, 1.0, L * 0.12)]), M.get('fabric', { color: sailCol, side: THREE.DoubleSide }));
    g.add(main, jib);
    parts.sails = [main, jib];
  } else {
    const cab = mesh(new THREE.BoxGeometry(W * 0.6, 0.7, L * 0.25), M.get('carPaint', { color: '#f4f4f2' })); cab.position.set(0, 0.35, L * 0.05); g.add(cab);
    const ws = mesh(new THREE.BoxGeometry(W * 0.58, 0.4, 0.04), M.get('tintedGlass', {})); ws.position.set(0, 0.85, L * 0.05 + L * 0.125); ws.rotation.x = -0.4; g.add(ws);
    const motor = mesh(new THREE.BoxGeometry(0.35, 0.8, 0.4), M.get('glossyPlastic', { color: '#1a1a1a' })); motor.position.set(0, 0.1, -L / 2 - 0.15); g.add(motor);
    parts.prop = motor;
  }
  const seat = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), M.get('leather', { color: '#f0e8d8' })); seat.position.set(0, 0.25, -L * 0.2); g.add(seat);
  return { group: g, L, W, H: sail ? L * 1.3 : 1.2, seat: { x: 0, y: 0.3, z: -L * 0.2 }, name: sail ? 'Sailboat' : 'Motorboat', mode: 'boat', parts, speed: sail ? 9 : 18, draft: D * 0.55 };
}

function submarine(a, rng) {
  const M = G.materials;
  const col = userCol(a, rng, ['#f0c020', '#1a1a1e', '#3a4a5a']);
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(1.1, 6, 12, 24).rotateX(Math.PI / 2), M.get('carPaint', { color: col })); body.scale.set(1, 0.9, 1); g.add(body);
  const tower = mesh(new THREE.CapsuleGeometry(0.5, 1.2, 8, 16).rotateX(Math.PI / 2), M.get('carPaint', { color: col })); tower.scale.set(0.8, 1.6, 1); tower.position.set(0, 1.2, 0.8); g.add(tower);
  const peri = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), M.get('metal')); peri.position.set(0, 2.3, 1.1); g.add(peri);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const w = mesh(new THREE.CircleGeometry(0.2, 16), M.get('emissive', { color: '#ffe8a0', emissiveIntensity: 1.5 }), false); w.position.set(s * 1.0, 0.2, -1.8 + i * 0.9); w.rotation.y = s * Math.PI / 2; g.add(w); }
  const prop = new THREE.Group(); prop.position.z = -4.3;
  for (let i = 0; i < 4; i++) { const bl = mesh(new THREE.BoxGeometry(0.1, 0.9, 0.05), M.get('bronze')); bl.position.y = 0.45; const h = new THREE.Group(); h.rotation.z = (i / 4) * TAU; h.add(bl); prop.add(h); }
  g.add(prop);
  for (const s of [-1, 1]) { const fin = mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), M.get('carPaint', { color: col })); fin.position.set(s * 0.9, 0, -3.3); g.add(fin); }
  const vfin = mesh(new THREE.BoxGeometry(0.06, 1.3, 0.6), M.get('carPaint', { color: col })); vfin.position.set(0, 0, -3.3); g.add(vfin);
  g.position.y = 1.1;
  const root = new THREE.Group(); root.add(g);
  return { group: root, L: 8.4, W: 2.2, H: 3.4, seat: { x: 0, y: 0.9, z: 0.8 }, name: 'Submarine', mode: 'sub', parts: { prop }, speed: 12, draft: 1.3 };
}

function plane(a, rng) {
  const M = G.materials;
  const col = userCol(a, rng, ['#f4f4f2', '#b01818', '#e8c020', '#1a4a9a', '#e86a20']);
  const accent = rng.pick(['#1a1a1a', '#b01818', '#1a3a8a', '#f4f4f2']);
  const g = new THREE.Group();
  const L = 8;
  const fus = mesh(lathe([[0, 0], [0.35, 0.3], [0.6, 1.2], [0.65, 3], [0.55, 5], [0.25, 7.2], [0.1, 8], [0, 8]], 24).rotateX(Math.PI / 2), M.get('carPaint', { color: col }));
  fus.position.z = 3.6; fus.rotation.y = Math.PI; g.add(fus);
  const canopy = mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, TAU, 0, Math.PI / 2), M.get('tintedGlass', { opacity: 0.5 })); canopy.scale.set(0.9, 0.9, 2); canopy.position.set(0, 0.45, 1.2); g.add(canopy);
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, -0.9); wingShape.lineTo(5.2, -0.4); wingShape.lineTo(5.2, 0.4); wingShape.lineTo(0, 1.0); wingShape.lineTo(-5.2, 0.4); wingShape.lineTo(-5.2, -0.4); wingShape.lineTo(0, -0.9);
  const wing = mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).rotateX(Math.PI / 2), M.get('carPaint', { color: col })); wing.position.set(0, 0.05, 1.0); g.add(wing);
  for (const s of [-1, 1]) { const tip = mesh(new THREE.BoxGeometry(0.4, 0.13, 0.8), M.get('carPaint', { color: accent })); tip.position.set(s * 5.0, 0.0, 1.0); g.add(tip); }
  const hs = mesh(new THREE.BoxGeometry(3.2, 0.08, 0.9), M.get('carPaint', { color: col })); hs.position.set(0, 0.25, -3.9); g.add(hs);
  const vs = mesh(new THREE.BoxGeometry(0.08, 1.5, 1.0), M.get('carPaint', { color: accent })); vs.position.set(0, 0.95, -3.9); vs.rotation.x = 0.25; g.add(vs);
  const prop = new THREE.Group(); prop.position.z = 4.25;
  for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.BoxGeometry(0.14, 1.1, 0.04), M.plain('#1a1a1a', 0.5)); bl.position.y = 0.55; const h = new THREE.Group(); h.rotation.z = (i / 3) * TAU; h.add(bl); prop.add(h); }
  const spinner = mesh(new THREE.ConeGeometry(0.2, 0.4, 16).rotateX(Math.PI / 2), M.get('carPaint', { color: accent })); spinner.position.z = 0.15; prop.add(spinner);
  g.add(prop);
  const gear = new THREE.Group();
  for (const [x, z] of [[-1.3, 1.4], [1.3, 1.4], [0, -3.3]]) { const st = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), M.get('metal')); st.position.set(x, -0.55, z); gear.add(st); const w = mesh(new THREE.CylinderGeometry(z < 0 ? 0.15 : 0.28, z < 0 ? 0.15 : 0.28, 0.14, 16).rotateZ(Math.PI / 2), M.get('tire')); w.position.set(x, -1.0 + (z < 0 ? 0.13 : 0), z); gear.add(w); }
  g.add(gear);
  g.position.y = 1.28;
  const root = new THREE.Group(); root.add(g);
  return { group: root, L, W: 10.4, H: 3.2, seat: { x: 0, y: 1.25, z: 1.1 }, name: 'Airplane', mode: 'plane', parts: { prop, gear, inner: g }, speed: 60 };
}

function helicopter(a, rng) {
  const M = G.materials;
  const col = userCol(a, rng, ['#b01818', '#1a1a1e', '#f0c020', '#1a3a8a', '#f4f4f2', '#3a5a3a']);
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(1.2, 24, 16), M.get('carPaint', { color: col })); body.scale.set(1, 0.95, 1.6); body.position.set(0, 1.5, 0); g.add(body);
  const glass = mesh(new THREE.SphereGeometry(1.21, 24, 16, -Math.PI / 2.4, Math.PI / 1.2, 0.3, 1.3), M.get('tintedGlass', { opacity: 0.55 })); glass.scale.set(1, 0.95, 1.6); glass.position.set(0, 1.5, 0); g.add(glass);
  const boom = mesh(new THREE.CylinderGeometry(0.3, 0.12, 4.2, 12).rotateX(Math.PI / 2), M.get('carPaint', { color: col })); boom.position.set(0, 1.75, -3.6); g.add(boom);
  const fin = mesh(new THREE.BoxGeometry(0.08, 1.0, 0.6), M.get('carPaint', { color: col })); fin.position.set(0, 2.15, -5.5); g.add(fin);
  const mast = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 10), M.get('metal')); mast.position.set(0, 2.75, 0); g.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.02, 0);
  for (let i = 0; i < 4; i++) { const bl = mesh(new THREE.BoxGeometry(0.3, 0.04, 5.2), M.plain('#1a1a1a', 0.5)); bl.position.z = 2.6; const h = new THREE.Group(); h.rotation.y = (i / 4) * TAU; h.add(bl); rotor.add(h); }
  g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.12, 2.3, -5.6);
  for (let i = 0; i < 2; i++) { const bl = mesh(new THREE.BoxGeometry(0.03, 1.1, 0.12), M.plain('#1a1a1a', 0.5)); const h = new THREE.Group(); h.rotation.x = (i / 2) * Math.PI; h.add(bl); tail.add(h); }
  g.add(tail);
  for (const s of [-1, 1]) {
    const skid = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8).rotateX(Math.PI / 2), M.get('metal')); skid.position.set(s * 0.95, 0.06, 0); g.add(skid);
    for (const z of [-0.8, 0.8]) beamMesh(g, new THREE.Vector3(s * 0.95, 0.06, z), new THREE.Vector3(s * 0.6, 0.8, z), 0.04, M.get('metal'));
  }
  return { group: g, L: 7, W: 2.4, H: 3.2, seat: { x: 0.35, y: 1.0, z: 0.6 }, name: 'Helicopter', mode: 'heli', parts: { rotor, tail, inner: g }, speed: 45 };
}

function beamMesh(parent, a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(m);
  return m;
}

function spaceship(a, rng) {
  const M = G.materials;
  const glowCol = userCol(a, rng, ['#40c8ff', '#ff5a40', '#a060ff', '#60ff90']);
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 6); s.lineTo(1.2, 2); s.lineTo(4.5, -1.5); s.lineTo(4.2, -3); s.lineTo(1.4, -2.2); s.lineTo(1.0, -3.2); s.lineTo(-1.0, -3.2); s.lineTo(-1.4, -2.2); s.lineTo(-4.2, -3); s.lineTo(-4.5, -1.5); s.lineTo(-1.2, 2); s.lineTo(0, 6);
  const hullG = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 3 }).rotateX(-Math.PI / 2).translate(0, 0, 0);
  const uv = hullG.attributes.uv; const p = hullG.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  g.add(mesh(hullG, M.get(rng.pick(['panels', 'darkPanels']), { color3: glowCol })));
  const canopy = mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, TAU, 0, Math.PI / 2), M.get('tintedGlass', { color: '#102030', opacity: 0.6 })); canopy.scale.set(0.9, 0.7, 2); canopy.position.set(0, 0.9, -1.8); g.add(canopy);
  const engines = [];
  for (const x of [-1.9, 0, 1.9]) {
    const eng = mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.2, 16).rotateX(Math.PI / 2), M.get('metal', { color: '#5a5c60' })); eng.position.set(x, 0.3, 3.4); g.add(eng);
    const fl = mesh(new THREE.CircleGeometry(0.4, 16), M.get('emissive', { color: glowCol, emissiveIntensity: 4 }), false); fl.position.set(x, 0.3, 4.01); g.add(fl);
    const gl = glowSprite(glowCol, 2.2, 0.8); gl.position.set(x, 0.3, 4.3); g.add(gl); engines.push(gl);
  }
  g.rotation.y = Math.PI;
  const holder = new THREE.Group(); holder.add(g); holder.position.y = 1.2;
  // Landing struts.
  for (const [x, z] of [[-2, 1], [2, 1], [0, -3]]) { const st = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), M.get('metal')); st.position.set(x, -0.6, z); holder.add(st); }
  const root = new THREE.Group(); root.add(holder);
  return { group: root, L: 10, W: 9, H: 2.5, seat: { x: 0, y: 1.6, z: 1.8 }, name: 'Spaceship', mode: 'ship', parts: { engines, inner: holder }, speed: 90, glowCol };
}

function ufo(a, rng) {
  const M = G.materials;
  const glowCol = userCol(a, rng, ['#60ff90', '#40c8ff', '#ff60e0']);
  const g = new THREE.Group();
  const saucer = mesh(lathe([[0, -0.5], [2.2, -0.35], [4.2, 0], [4.3, 0.08], [3.2, 0.45], [1.6, 0.7], [0, 0.75]], 48), M.get('chrome'));
  g.add(saucer);
  const dome = mesh(new THREE.SphereGeometry(1.6, 32, 16, 0, TAU, 0, Math.PI / 2), M.get('glass', { color: glowCol, opacity: 0.35 })); dome.position.y = 0.6; dome.scale.y = 0.8; g.add(dome);
  const lights = [];
  for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU; const l = mesh(new THREE.SphereGeometry(0.12, 8, 6), M.get('emissive', { color: glowCol, emissiveIntensity: 3 }), false); l.position.set(Math.cos(an) * 4.05, 0.05, Math.sin(an) * 4.05); g.add(l); lights.push(l); }
  const beamM = new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamC = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3, 1, 32, 1, true), beamM); beamC.userData.noRaycast = true; markNoAO(beamC);
  g.add(beamC);
  const holder = new THREE.Group(); holder.add(g); holder.position.y = 6;
  const root = new THREE.Group(); root.add(holder);
  return { group: root, L: 8.6, W: 8.6, H: 7, seat: { x: 0, y: 6.2, z: 0 }, name: 'UFO', mode: 'ship', parts: { lights, beam: beamC, inner: holder, hoverBase: 6 }, speed: 70, glowCol };
}

function rocket(a, rng) {
  const M = G.materials;
  const col = userCol(a, rng, ['#f4f4f2']);
  const accent = rng.pick(['#c01818', '#1a3a8a', '#1a1a1a']);
  const H = 14;
  const g = new THREE.Group();
  const body = mesh(lathe([[0, 0], [0.9, 0.2], [1.1, 1], [1.1, H * 0.7], [0.9, H * 0.85], [0.4, H * 0.96], [0, H]], 32), M.get('carPaint', { color: col }));
  g.add(body);
  const nose = mesh(lathe([[0.905, H * 0.85], [0.4, H * 0.96], [0, H]], 32), M.get('carPaint', { color: accent })); nose.scale.setScalar(1.005); g.add(nose);
  for (let i = 0; i < 4; i++) { const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(1.4, -0.4); fs.lineTo(1.2, 2.2); fs.lineTo(0, 3.2); const fin = mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.1, bevelEnabled: false }), M.get('carPaint', { color: accent })); const h = new THREE.Group(); h.rotation.y = (i / 4) * TAU; fin.position.set(1.0, 0.4, -0.05); h.add(fin); g.add(h); }
  for (let i = 0; i < 3; i++) { const w = mesh(new THREE.CircleGeometry(0.28, 20), M.get('tintedGlass', { opacity: 0.8 }), false); w.position.set(0, H * 0.6 - i * 1.1, 1.105); g.add(w); }
  const bell = mesh(lathe([[0.5, 0], [0.7, -0.6], [0.6, -0.6], [0.4, 0]], 20), M.get('iron')); bell.position.y = 0.3; g.add(bell);
  const flame = new THREE.Group(); flame.position.y = -0.4;
  const fm = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 16, 1, true).rotateX(Math.PI).translate(0, -2, 0), new THREE.MeshBasicMaterial({ color: '#ffb040', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); fm.userData.noRaycast = true; flame.add(fm);
  const fg = glowSprite('#ffa040', 6, 0.9); fg.position.y = -1.5; flame.add(fg);
  flame.visible = false; markNoAO(flame);
  g.add(flame);
  g.position.y = 1.0;
  const pad = mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 32), M.get('concrete')); pad.position.y = 0.3;
  const root = new THREE.Group(); root.add(pad, g);
  const label = labelTexture(a.label || 'GENESIS I', { fg: accent, w: 512, h: 128, font: 'Arial Black, sans-serif' });
  const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.4), new THREE.MeshBasicMaterial({ map: label, transparent: true })); lp.rotation.z = Math.PI / 2; lp.position.set(0, H * 0.35 + 1, 1.11); g.add(lp);
  return { group: root, L: 3, W: 3, H: H + 1, seat: { x: 0, y: H * 0.6, z: 0 }, name: 'Rocket', mode: 'rocket', parts: { flame, inner: g }, speed: 0 };
}

function hotAirBalloon(a, rng) {
  const M = G.materials;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const gx = cv.getContext('2d');
  const n = rng.pick([8, 12, 16]);
  const base = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : null;
  for (let i = 0; i < n; i++) { gx.fillStyle = base ? (i % 2 ? base : '#f4f0e0') : hsl(i / n + rng.next() * 0.05, 0.8, 0.55); gx.fillRect((i / n) * 512, 0, 512 / n + 1, 256); }
  gx.fillStyle = 'rgba(0,0,0,0.15)'; for (let y = 0; y < 256; y += 32) gx.fillRect(0, y, 512, 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const env = mesh(lathe([[0.6, 0], [1.2, 0.8], [3.2, 3.2], [4.2, 5.6], [4.1, 7.2], [3.2, 8.6], [1.6, 9.5], [0, 9.8]], 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
  env.position.y = 4.2;
  const g = new THREE.Group(); g.add(env);
  const basket = mesh(new THREE.BoxGeometry(1.3, 1.0, 1.3), M.get('thatch', { world: 0.8 })); basket.position.y = 0.5; g.add(basket);
  const rim = mesh(new THREE.BoxGeometry(1.35, 0.08, 1.35), M.get('leather', { color: '#5a3a1a' })); rim.position.y = 1.02; g.add(rim);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) beamMesh(g, new THREE.Vector3(x, 1.0, z), new THREE.Vector3(x * 1.3, 4.3, z * 1.3), 0.012, M.plain('#8a7a5a', 0.9));
  const burner = new THREE.Group(); burner.position.y = 2.6;
  attachFire(burner, [0, 0, 0], 1.2);
  const bg = glowSprite('#ffa040', 3, 0.7); burner.add(bg);
  burner.visible = false;
  g.add(burner);
  return { group: g, L: 8, W: 8, H: 14, seat: { x: 0.3, y: 0.55, z: 0 }, name: 'Hot air balloon', mode: 'balloon', parts: { burner }, speed: 6, standing: true };
}

// ---------------- Controller for craft ----------------
function makeCraft(data, v) {
  const root = data.root;
  const st = { speed: 0, vy: 0, yawVel: 0, driving: false, alt: 0, t: 0, launched: false, bank: 0 };
  let engine = null;
  data.vehicle = true;
  data.camDistance = Math.max(8, v.L * 1.4);
  data.showDriver = true;
  data.exitLabel = 'Get out (E)';
  const verb = { boat: 'Board', sub: 'Board', plane: 'Fly', heli: 'Fly', ship: 'Pilot', rocket: 'Board', balloon: 'Board' }[v.mode];
  data.interact = { label: () => (G.player.vehicle === data ? null : `${verb} the ${v.name.toLowerCase()}`), action: (e, player) => enter(player) };
  const seatWorld = () => new THREE.Vector3(v.seat.x, v.seat.y, v.seat.z).applyMatrix4(root.matrixWorld);
  data.seatEye = () => seatWorld().add(new THREE.Vector3(0, v.standing ? 1.7 : 0.8, 0));
  data.driverPose = () => ({ pos: seatWorld().sub(new THREE.Vector3(0, v.standing ? 0 : 0.46, 0)), yaw: root.rotation.y });
  const helpText = {
    boat: 'W/S throttle · A/D steer · E get out', sub: 'W/S throttle · A/D steer · Space surface · C dive · E exit',
    plane: 'W/S throttle · A/D turn · Space climb · C descend (take off above ~90 km/h) · E exit', heli: 'W/S forward/back · A/D turn · Space up · C down · E exit',
    ship: 'W/S forward/back · A/D turn · Space up · C down · Shift boost · E exit', rocket: 'Hold Space to launch! · E exit', balloon: 'Hold Space to fire the burner · W/A/S/D drift · E exit',
  }[v.mode];
  function enter(player) {
    player.vehicle = data;
    st.driving = true;
    player.yaw = root.rotation.y + Math.PI;
    if (G.avatar) { if (v.standing) G.avatar.setPose(null); else G.avatar.setPose('sit', { seatHeight: 0.46 }); G.avatar.setFirstPerson(player.cameraMode === 'first'); }
    engine = G.audio ? G.audio.engine({ heli: 'heli', plane: 'jet', ship: 'jet', boat: 'boat', sub: 'boat', rocket: 'jet', balloon: 'electric' }[v.mode]) : null;
    G.ui.toast(helpText, '', 5000);
  }
  data.exit = (player) => {
    player.vehicle = null; st.driving = false;
    if (engine) { engine.stop(); engine = null; }
    const world = G.worlds.get(data.worldId);
    const side = new THREE.Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y)).multiplyScalar(-(v.W / 2 + 1));
    const p = root.position.clone().add(side);
    const g = world.colliders.groundHeight(p.x, p.z, 0.3, p.y + 20, 60, data.id);
    p.y = Math.max(g, (world.waterAt ? world.waterAt(p.x, p.z) : world.waterLevel) - 1.5);
    player.teleport(p, root.rotation.y + Math.PI);
    if (G.avatar) { G.avatar.setPose(null); G.avatar.setFirstPerson(player.cameraMode === 'first'); }
    G.registry.refresh(data);
  };
  data.drive = (dt, input, player) => {
    const world = G.worlds.get(data.worldId);
    const ax = input.moveAxes();
    const up = input.held('jump') ? 1 : 0, down = input.held('crouch') ? 1 : 0;
    const fwd = new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    const ground = world.colliders.groundHeight(root.position.x, root.position.z, 0.5, root.position.y + 1, 2, data.id);
    const water = world.waterAt ? world.waterAt(root.position.x, root.position.z) : world.waterLevel;
    const maxV = v.speed * (ax.sprint ? 1.6 : 1); // m/s
    st.t += dt;
    switch (v.mode) {
      case 'boat': case 'sub': {
        const inWater = water > -1e8 && water > ground + 0.3;
        st.speed += ax.y * (inWater ? 5 : 1) * dt;
        st.speed *= Math.exp(-dt * (inWater ? 0.4 : 4));
        st.speed = clamp(st.speed, -maxV * 0.3, maxV * (v.parts.sails ? (0.5 + (world.weather ? world.weather.cur.wind : 0.5)) : 1));
        root.rotation.y += -ax.x * 0.7 * dt * clamp(Math.abs(st.speed) / 3, 0.2, 1) * Math.sign(st.speed || 1);
        root.position.addScaledVector(fwd, st.speed * dt);
        let targetY = inWater ? water - v.draft * 0.3 + Math.sin(st.t * 1.5) * 0.08 : ground;
        if (v.mode === 'sub' && inWater) { st.alt = clamp(st.alt + (down - up) * 2.5 * dt, 0, Math.max(0, water - ground - 3)); targetY = water - v.draft * 0.3 - st.alt; }
        root.position.y += (targetY - root.position.y) * Math.min(1, dt * 3);
        const inner = v.group;
        inner.rotation.z = Math.sin(st.t * 1.1) * 0.03 + ax.x * 0.08 * Math.min(1, Math.abs(st.speed) / 5);
        inner.rotation.x = -Math.min(0.12, st.speed * 0.01) + Math.sin(st.t * 0.9) * 0.02;
        if (v.parts.prop && v.mode === 'sub') v.parts.prop.rotation.z += st.speed * dt * 2;
        break;
      }
      case 'heli': case 'ship': {
        const minY = Math.max(ground, water > -1e8 ? water : -1e9) + (v.mode === 'heli' ? 0 : 0.2);
        const hs = v.mode === 'ship' ? maxV : maxV;
        st.speed += (ax.y * hs - st.speed) * Math.min(1, dt * (v.mode === 'ship' ? 1.5 : 1));
        st.vy += ((up - down) * (v.mode === 'ship' ? 14 : 7) - st.vy) * Math.min(1, dt * 2);
        const ty = root.rotation.y;
        root.rotation.y += -ax.x * (v.mode === 'ship' ? 1.4 : 1.1) * dt;
        root.position.addScaledVector(fwd, st.speed * dt);
        root.position.y += st.vy * dt;
        if (root.position.y < minY) { root.position.y = minY; st.vy = Math.max(0, st.vy); }
        root.position.y = Math.min(root.position.y, 600);
        const inner = v.parts.inner || v.group;
        inner.rotation.x = -clamp(st.speed / maxV, -1, 1) * 0.18;
        st.bank += ((root.rotation.y - ty) / Math.max(dt, 1e-3) * 0.25 - st.bank) * Math.min(1, dt * 4);
        inner.rotation.z = -st.bank;
        break;
      }
      case 'plane': {
        st.speed = clamp(st.speed + ax.y * 12 * dt - (ax.y <= 0 ? 2 * dt : 0), 0, maxV * 1.4);
        const flying = root.position.y > ground + 1.5;
        const lift = st.speed > 25 ? 1 : st.speed / 25;
        root.rotation.y += -ax.x * (flying ? 0.7 : 0.4) * dt * Math.min(1, st.speed / 8 + 0.1);
        root.position.addScaledVector(fwd, st.speed * dt);
        const climb = (up - down) * 12 * lift;
        st.vy += (climb - (1 - lift) * 9.8 - st.vy) * Math.min(1, dt * 1.5);
        root.position.y += st.vy * dt;
        const minY = Math.max(ground, water > -1e8 ? water : -1e9);
        if (root.position.y < minY) { root.position.y = minY; st.vy = Math.max(0, st.vy); if (st.speed > 30 && down) st.speed *= 0.9; }
        const inner = v.parts.inner;
        inner.rotation.x += (-(st.vy / 30) - inner.rotation.x) * Math.min(1, dt * 3);
        inner.rotation.z += (ax.x * (flying ? 0.5 : 0) - inner.rotation.z) * Math.min(1, dt * 3);
        if (v.parts.gear) v.parts.gear.visible = !(flying && root.position.y > ground + 15);
        break;
      }
      case 'rocket': {
        if (up && !st.launched) { st.launched = true; G.ui.toast('🚀 Ignition! Liftoff!', 'good'); if (G.audio) G.audio.play('thunder', root.position, { dist: 0.5 }); }
        if (st.launched) {
          st.vy = Math.min(st.vy + 6 * dt, 80);
          v.parts.inner.position.y += st.vy * dt;
          v.parts.flame.visible = true;
          const fl = v.parts.flame; fl.scale.set(1 + Math.sin(st.t * 40) * 0.1, 1 + Math.sin(st.t * 30) * 0.2, 1 + Math.sin(st.t * 40) * 0.1);
          if (v.parts.inner.position.y > 380 && !st.orbit) {
            st.orbit = true;
            G.ui.toast('You reached orbit! 🌍 Entering space…', 'good', 4000);
            if (G.dimensions && G.dimensions.enterKind) setTimeout(() => { if (G.player.vehicle === data) data.exit(G.player); G.dimensions.enterKind('space'); }, 1500);
          }
        }
        break;
      }
      case 'balloon': {
        const heat = up ? 1 : 0;
        st.vy += ((heat ? 2.2 : -0.9) - st.vy) * Math.min(1, dt * 0.6);
        const wind = world.weather ? world.weather.cur.wind : 0.3;
        root.position.x += (ax.x * 1.5 + wind * 1.2) * dt;
        root.position.z += (-ax.y * 1.5) * dt * -1;
        root.position.y += st.vy * dt;
        const minY = Math.max(ground, water > -1e8 ? water : -1e9);
        if (root.position.y < minY) { root.position.y = minY; st.vy = Math.max(0, st.vy); }
        root.position.y = Math.min(root.position.y, 400);
        v.parts.burner.visible = !!heat;
        break;
      }
      default: break;
    }
    const B = world.bounds;
    root.position.x = clamp(root.position.x, -B, B); root.position.z = clamp(root.position.z, -B, B);
    // Camera follows heading.
    const camYaw = root.rotation.y + Math.PI;
    let dy = camYaw - player.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    if (Math.abs(st.speed) > 1 || v.mode === 'heli' || v.mode === 'ship') player.yaw += dy * Math.min(1, dt * 1.8);
    player.position.copy(v.mode === 'rocket' ? seatWorld() : root.position);
    if (engine) engine.set(clamp(Math.abs(st.speed) / Math.max(1, maxV) + (v.mode === 'heli' ? 0.5 : 0) + (st.launched ? 1 : 0), 0, 1.5), 1);
    st.refreshT = (st.refreshT || 0) + dt;
    if (st.refreshT > 0.3) { st.refreshT = 0; G.registry.refresh(data); }
  };
  data.update = function (dt, t) {
    // Idle animation: rotors, propellers, UFO lights, sails.
    const P = v.parts;
    const running = st.driving || v.mode === 'ship';
    if (P.rotor) P.rotor.rotation.y += dt * (st.driving ? 22 : 0.3);
    if (P.tail) P.tail.rotation.x += dt * (st.driving ? 40 : 0.5);
    if (P.prop && v.mode === 'plane') P.prop.rotation.z += dt * (st.driving ? 10 + st.speed : 0.2);
    if (P.lights) P.lights.forEach((l, i) => { l.visible = Math.sin(t * 6 - i * 0.8) > -0.3; });
    if (P.beam) { P.beam.visible = !st.driving || st.vy < 0; const h = Math.max(1, (P.inner.position.y + (st.driving ? 0 : 0))); P.beam.scale.y = h; P.beam.position.y = -h / 2; }
    if (P.inner && v.mode === 'ship' && !st.driving) P.inner.position.y = (P.hoverBase || 1.2) + Math.sin(t * 1.2) * 0.25;
    if (P.engines) P.engines.forEach((e) => { e.material.opacity = running ? 0.8 + Math.sin(t * 30) * 0.1 : 0.3; });
    if (P.sails) for (const s of P.sails) {
      const g = s.geometry, base = g.userData.base, pos = g.attributes.position.array;
      const wind = G.world && G.world.weather ? G.world.weather.cur.wind : 0.5;
      for (let i = 0; i < pos.length; i += 3) { const k = Math.sin((base[i + 1] - 1) * 0.35) * Math.max(0, 1 - Math.abs(base[i + 2]) * 0.05); pos[i] = base[i] + k * (0.4 + wind * 0.5) * (1 + 0.1 * Math.sin(t * 2 + base[i + 1])); }
      g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    }
    if (!st.driving && (v.mode === 'boat' || v.mode === 'sub')) {
      const world = G.worlds.get(data.worldId);
      if (world) {
        const water = world.waterAt ? world.waterAt(this.root.position.x, this.root.position.z) : world.waterLevel;
        const ground = world.heightAt(this.root.position.x, this.root.position.z);
        if (water > ground) this.root.position.y = water - v.draft * 0.3 + Math.sin(t * 1.5) * 0.06;
        v.group.rotation.z = Math.sin(t * 1.1) * 0.03;
      }
    }
  };
  data.onRemove = () => { if (G.player.vehicle === data) data.exit(G.player); if (engine) engine.stop(); };
  return data;
}

export function* buildCraft(ctx, item, rng) {
  const a = item.attrs;
  const kind = item.params.kind;
  ctx.stage('geometry', 'Designing ' + kind);
  yield;
  let v;
  switch (kind) {
    case 'boat': v = boat(a, rng, false); break;
    case 'sailboat': v = boat(a, rng, true); break;
    case 'submarine': v = submarine(a, rng); break;
    case 'plane': v = plane(a, rng); break;
    case 'helicopter': v = helicopter(a, rng); break;
    case 'spaceship': v = spaceship(a, rng); break;
    case 'ufo': v = ufo(a, rng); break;
    case 'rocket': v = rocket(a, rng); break;
    case 'balloon': v = hotAirBalloon(a, rng); break;
    default: v = boat(a, rng, false);
  }
  ctx.stage('details', 'Fitting controls');
  yield;
  const root = new THREE.Group();
  root.add(v.group);
  const water = v.mode === 'boat' || v.mode === 'sub';
  const data = {
    root, name: (a.colors[0] ? a.colors[0].word[0].toUpperCase() + a.colors[0].word.slice(1) + ' ' + v.name.toLowerCase() : v.name), category: 'vehicle', icon: item.icon,
    height: v.H, footprint: { radius: Math.max(v.L, v.W) / 2 }, suppressGrass: false, wantsWater: water, preferPlacement: water ? 'onWater' : undefined,
    colliderDefs: v.mode === 'rocket' ? [{ type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.6, r: 3.1 }, { type: 'cyl', x: 0, z: 0, y0: 0.6, y1: v.H, r: 1.1 }] : v.mode === 'balloon' ? [{ type: 'box', x: 0, z: 0, y0: 0, y1: 1.05, hx: 0.65, hz: 0.65, walkable: true }] : [{ type: 'box', x: 0, z: 0, y0: 0, y1: Math.min(v.H, 2.5), hx: Math.min(v.W, 3) / 2, hz: v.L / 2 * 0.9, walkable: true }],
    lights: v.glowCol ? [{ pos: [0, 1.2, 0], color: v.glowCol, intensity: 2.5, distance: 12, nightOnly: false }] : null,
  };
  if (v.mode === 'ship' && v.parts.hoverBase) data.floating = false;
  makeCraft(data, v);
  return data;
}
