// ---------------------------------------------------------------------------
// Civic & commercial buildings: hospital, school, police and fire stations,
// classical civic buildings (library, museum, bank, city hall, courthouse),
// hotel, apartment block, office, factory, warehouse, power plant, train
// station, airport, gas station, supermarket, cinema, stadium, prison,
// observatory, laboratory, water tower, hangar, bunker, garage, parking
// garage, mosque, palace and circus tent.
//
// A shared block builder lays out multi-storey facades in bays of framed
// windows (walls split around openings, slabs, floor bands, flat roof with
// parapet); each type then adds its signature elements (signs, canopies,
// porticos, domes, chimneys with smoke, sawtooth roofs, runways, stands,
// floodlights...). Everything merges per material with walkable colliders.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeState, finish, addLight, merlons } from './buildings2.js';
import { wallSegmentsX, wallSegmentsZ, windowFrame, slab, flatRoof, gableRoof, coneRoof, roundWall } from './buildkit.js';
import { obox, ocyl, beam, labelTexture, makeFlag, glowSprite, glowTexture } from './common.js';
import { markNoAO } from '../../render/renderer.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function userColor(a) { return a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined; }

// Illuminated sign facing +Z (or rotated).
function sign(S, text, x, y, z, w, o = {}) {
  const h = o.h || w * 0.18;
  const tex = labelTexture(text, { bg: o.bg ?? '#ffffff', fg: o.fg || '#1a1a1a', w: 1024, h: Math.max(64, Math.round(1024 * h / w)), border: o.border, font: o.font || 'Arial, Helvetica, sans-serif', glow: o.glowColor });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: o.bg === null, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow ?? 0.35, roughness: 0.5 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (o.rotY) m.rotation.y = o.rotY;
  S.root.add(m);
  return m;
}

// Analogue clock face showing the current time (drawn once).
function clockMesh(r) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#f8f4ea'; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#1a1a1a'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const an = i / 12 * TAU; g.fillText(String(i), 128 + Math.sin(an) * 96, 128 - Math.cos(an) * 96); }
  const d = new Date(), hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * TAU, mA = d.getMinutes() / 60 * TAU;
  g.lineCap = 'round'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(hA) * 55, 128 - Math.cos(hA) * 55); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(mA) * 85, 128 - Math.cos(mA) * 85); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.5 }));
}

// Rising smoke/steam puffs (additive sprites) from a point.
function smoke(S, x, y, z, scale = 1, color = '#bfbfbf', n = 8) {
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.35, depthWrite: false, fog: true }));
    s.userData.noRaycast = true; markNoAO(s);
    S.root.add(s);
    puffs.push({ s, ph: i / n });
  }
  S.updates.push((dt, t, dist) => {
    if (dist > 250) return;
    for (const p of puffs) {
      const f = (t * 0.08 + p.ph) % 1;
      p.s.position.set(x + Math.sin(f * 6 + p.ph * 9) * scale * 0.6 + f * scale * 2, y + f * scale * 9, z + Math.cos(f * 5) * scale * 0.4);
      p.s.scale.setScalar(scale * (1 + f * 3.5));
      p.s.material.opacity = 0.42 * (1 - f);
    }
  });
}

// Multi-storey block with window bays. Returns its extents.
function block(S, o) {
  const { b } = S;
  const W = o.W, D = o.D, floors = o.floors, FH = o.FH || 3.6, t = 0.3, cx = o.x || 0, cz = o.z || 0;
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const bayW = o.bayW || 3.2, winW = o.winW || Math.min(1.8, bayW * 0.55), winH = o.winH || Math.min(2.0, FH * 0.55), sillY = o.sillY ?? FH * 0.28;
  const doorW = o.doorW || 2.2, doorH = o.doorH || 2.7;
  const ops = (len, f, face) => {
    const n = Math.max(1, Math.floor(len / bayW)), out = [];
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * len / n;
      if (face === 'front' && f === 0 && o.door !== false && Math.abs(c - len / 2) < len / n * 0.6) { out.push({ u0: len / 2 - doorW / 2, u1: len / 2 + doorW / 2, v0: 0, v1: doorH, kind: 'door' }); continue; }
      if (face === 'front' && f === 0 && o.groundGlass) { out.push({ u0: c - len / n * 0.42, u1: c + len / n * 0.42, v0: 0.4, v1: FH - 0.5, kind: 'window' }); continue; }
      if (o.noWindows && o.noWindows(face, f)) continue;
      out.push({ u0: c - winW / 2, u1: c + winW / 2, v0: sillY, v1: sillY + winH, kind: 'window' });
    }
    return out;
  };
  const wo = { frame: o.frame || 'frame', glass: 'glass', sill: o.sill ? 'trim' : undefined, mullions: o.mullions };
  for (let f = 0; f < floors; f++) {
    const y0 = f * FH;
    const ext = o.extFn ? o.extFn(f) : 'wall';
    for (const w of wallSegmentsX(b, { x0, x1, z: z1, y0, h: FH, t, ext, int: 'interior', side: 1, openings: ops(W, f, 'front') })) windowFrame(b, w, wo);
    for (const w of wallSegmentsX(b, { x0, x1, z: z0, y0, h: FH, t, ext, int: 'interior', side: -1, openings: ops(W, f, 'back') })) windowFrame(b, w, wo);
    for (const w of wallSegmentsZ(b, { z0, z1, x: x0, y0, h: FH, t, ext, int: 'interior', side: -1, openings: ops(D, f, 'side') })) windowFrame(b, w, wo);
    for (const w of wallSegmentsZ(b, { z0, z1, x: x1, y0, h: FH, t, ext, int: 'interior', side: 1, openings: ops(D, f, 'side') })) windowFrame(b, w, wo);
    slab(b, x0, z0, x1, z1, f === 0 ? 0 : y0 - 0.2, f === 0 ? 0.12 : 0.2, { py: 'floor', default: 'interior' });
    if (f > 0 && o.bands !== false) b.box('trim', [x0 - 0.06, y0 - 0.22, z0 - 0.06], [x1 + 0.06, y0 + 0.05, z1 + 0.06]);
  }
  const H = floors * FH;
  if (o.roof !== false) flatRoof(b, x0 - t / 2, z0 - t / 2, x1 + t / 2, z1 + t / 2, H, { roof: 'roof', wall: 'wall', coping: 'trim' }, { parapet: o.parapet ?? 0.8 });
  return { x0, x1, z0, z1, H, W, D, FH };
}

// Classical portico: steps, columns and a pediment in front of a facade at z.
function portico(S, cx, z, width, colH, n = 6, key = 'marble') {
  const { b } = S;
  const depth = 3.2;
  for (let i = 0; i < 4; i++) b.box(key, [cx - width / 2 - 1 + i * 0.25, i * 0.3, z - 0.1], [cx + width / 2 + 1 - i * 0.25, (i + 1) * 0.3, z + depth + 1.2 - i * 0.35], { collide: true });
  const base = 1.2, colR = Math.min(0.45, width / n * 0.18);
  const colGeo = new THREE.CylinderGeometry(colR * 0.88, colR, colH, 18, 1);
  for (let i = 0; i < n; i++) {
    const x = cx - width / 2 + colR * 2 + i * ((width - colR * 4) / (n - 1));
    b.geometry(key, colGeo, new THREE.Matrix4().makeTranslation(x, base + colH / 2, z + depth - 0.2));
    b.box(key, [x - colR * 1.3, base + colH, z + depth - 0.2 - colR * 1.3], [x + colR * 1.3, base + colH + 0.3, z + depth - 0.2 + colR * 1.3]);
    b.cylCollider(x, z + depth - 0.2, base, base + colH, colR);
  }
  colGeo.dispose();
  const eY = base + colH + 0.3;
  b.box(key, [cx - width / 2 - 0.3, eY, z], [cx + width / 2 + 0.3, eY + 1.1, z + depth + 0.3], { collide: true });
  const pz = z + depth + 0.3;
  b.tri(key, V(cx - width / 2 - 0.3, eY + 1.1, pz), V(cx + width / 2 + 0.3, eY + 1.1, pz), V(cx, eY + 1.1 + width * 0.16, pz));
  b.quad('roof', V(cx - width / 2 - 0.4, eY + 1.1, pz + 0.05), V(cx, eY + 1.1 + width * 0.16 + 0.05, pz + 0.05), V(cx, eY + 1.1 + width * 0.16 + 0.05, z), V(cx - width / 2 - 0.4, eY + 1.1, z));
  b.quad('roof', V(cx, eY + 1.1 + width * 0.16 + 0.05, pz + 0.05), V(cx + width / 2 + 0.4, eY + 1.1, pz + 0.05), V(cx + width / 2 + 0.4, eY + 1.1, z), V(cx, eY + 1.1 + width * 0.16 + 0.05, z));
  return { top: eY + 1.1 + width * 0.16, front: pz, base };
}

// Dome on a drum.
function dome(S, cx, cy, cz, r, key = 'roof', drumKey = 'marble', lantern = true) {
  const { b } = S;
  roundWall(b, cx, cz, cy, r * 0.5, r, drumKey, 32);
  const g = new THREE.SphereGeometry(r * 1.02, 32, 14, 0, TAU, 0, HALF);
  b.geometry(key, g, new THREE.Matrix4().makeTranslation(cx, cy + r * 0.5, cz));
  g.dispose();
  if (lantern) { ocyl(b, drumKey, cx, cy + r * 1.45, cz, r * 0.15, r * 0.3, 12); coneRoof(b, cx, cz, cy + r * 1.75, r * 0.18, r * 0.35, 'gold', 12); }
}

function lobby(S, B, mats, rng) {
  const { b } = S;
  b.box({ py: 'counter', default: 'accent' }, [B.x0 + 2, 0.12, B.z1 - 5], [B.x0 + 6, 1.1, B.z1 - 4.2], { collide: true });
  for (let i = 0; i < 3; i++) addLight(S, [B.x0 + B.W * (0.25 + i * 0.25), 3.0, (B.z0 + B.z1) / 2], '#fff4e0', 1.6, 9, false);
  void mats; void rng;
}

const KINDS = {
  *hospital(S) {
    const { a, rng, M } = S;
    const floors = clamp(a.floors || rng.int(3, 5), 2, 12);
    const mats = { wall: M.get(a.materials[0] || rng.pick(['whiteBrick', 'concrete', 'paint']), { color: userColor(a) || '#eef0f0' }), trim: M.get('paint', { color: '#d8dcdc' }), frame: M.get('metal', { color: '#9aa0a8' }), glass: M.get('glass', { opacity: 0.25, color: '#9ac8e0' }), interior: M.get('paint', { color: '#f4f6f6' }), floor: M.get('tiles'), roof: M.get('gravel'), accent: M.get('painted', { color: '#c62828' }), counter: M.get('marble'), red: M.get('emissive', { color: '#ff2020', emissiveIntensity: 2.5 }), dark: M.get('asphalt'), paintW: M.get('emissive', { color: '#f4f4f4', emissiveIntensity: 0.3 }) };
    S.ctx.stage('geometry', 'Raising wards');
    const B = block(S, { W: 28, D: 16, floors, FH: 3.8, bayW: 3.5, sill: true, groundGlass: true });
    yield;
    const { b } = S;
    // Entrance canopy & red cross.
    b.box('trim', [-6, 3.2, B.z1], [6, 3.5, B.z1 + 5]); for (const x of [-5.6, 5.6]) b.box('frame', [x - 0.15, 0, B.z1 + 4.5], [x + 0.15, 3.2, B.z1 + 4.8], { collide: true });
    const cy = B.H - 1.8;
    b.box('red', [-0.5, cy - 1.6, B.z1 + 0.2], [0.5, cy + 1.6, B.z1 + 0.35]); b.box('red', [-1.6, cy - 0.5, B.z1 + 0.2], [1.6, cy + 0.5, B.z1 + 0.35]);
    sign(S, a.label || 'HOSPITAL', 7.5, 3.9, B.z1 + 0.35, 9, { fg: '#c62828', bg: '#ffffff', glow: 0.8 });
    sign(S, 'EMERGENCY', 0, 3.8, B.z1 + 5.02, 6, { fg: '#ffffff', bg: '#c62828', glow: 1 });
    // Helipad.
    b.box('dark', [-5, B.H + 0.01, -5], [5, B.H + 0.08, 5]);
    const h = sign(S, 'H', 0, B.H + 0.1, 0, 5, { h: 5, fg: '#ffffff', bg: null, glow: 0.4 }); h.rotation.x = -HALF;
    lobby(S, B, mats, rng);
    addLight(S, [0, 3.0, B.z1 + 3], '#ffffff', 1.5, 8, true);
    addLight(S, [0, cy, B.z1 + 1.5], '#ff4040', 1.5, 7, true);
    return finish(S, mats, { name: a.name ? `${a.name} Hospital` : 'Hospital', height: B.H + 1, hw: 15, hd: 13, falloff: 4 });
  },
  *school(S) {
    const { a, rng, M, b } = S;
    const floors = clamp(a.floors || rng.int(2, 3), 1, 5);
    const mats = { wall: M.get(a.materials[0] || 'brick', { color: userColor(a) }), trim: M.get('paint', { color: '#f2eee4' }), frame: M.get('paint', { color: '#f2f2f0' }), glass: M.get('glass', { opacity: 0.25 }), interior: M.get('paint', { color: '#f4ecd8' }), floor: M.get('floorWood'), roof: M.get('slate'), accent: M.get('painted', { color: '#2a4a8a' }), counter: M.get('wood'), clock: M.get('paint', { color: '#f8f6f0' }), dark: M.plain('#1a1a1a', 0.5) };
    S.ctx.stage('geometry', 'Building classrooms');
    const B = block(S, { W: 32, D: 14, floors, FH: 3.8, bayW: 3.2, winW: 2.2, winH: 2.1, sill: true, roof: false });
    gableRoof(b, B.x0 - 0.2, B.z0 - 0.2, B.x1 + 0.2, B.z1 + 0.2, B.H, THREE.MathUtils.degToRad(24), { roof: 'roof', wall: 'wall', trim: 'trim' }, { overhang: 0.5 });
    // Entrance gable with clock.
    b.box('wall', [-3, 0, B.z1], [3, B.H + 1.8, B.z1 + 1]);
    b.box('trim', [-3.2, B.H + 1.8, B.z1 - 0.1], [3.2, B.H + 2.1, B.z1 + 1.2]);
    const ck = clockMesh(1);
    ck.position.set(0, B.H + 0.4, B.z1 + 1.02); S.root.add(ck);
    sign(S, a.label || a.name || 'SCHOOL', 0, 3.4, B.z1 + 1.03, 5.5, { fg: '#f8f0d8', bg: '#2a4a8a', glow: 0.3 });
    makeFlag(S.root, 8, 0, B.z1 + 6, '#2a5ad8', 1.8, 1.1, 8);
    yield;
    lobby(S, B, mats, rng);
    return finish(S, mats, { name: a.name ? `${a.name} School` : 'School', height: B.H + 3, hw: 17, hd: 12, falloff: 4 });
  },
  *police(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || 'concrete', { color: userColor(a) || '#c8c8c4' }), trim: M.get('painted', { color: '#1a3a8a' }), frame: M.get('metal', { color: '#3a3a3c' }), glass: M.get('glass', { opacity: 0.3, color: '#7a9ab8' }), interior: M.get('paint', { color: '#e8eaec' }), floor: M.get('tiles'), roof: M.get('gravel'), accent: M.get('painted', { color: '#1a3a8a' }), counter: M.get('wood'), blue: M.get('emissive', { color: '#2a6aff', emissiveIntensity: 3 }), redL: M.get('emissive', { color: '#ff2a2a', emissiveIntensity: 3 }) };
    S.ctx.stage('geometry', 'Building the station');
    const B = block(S, { W: 20, D: 14, floors: 2, FH: 3.8, sill: false });
    b.box('trim', [B.x0 - 0.1, 3.4, B.z1], [B.x1 + 0.1, 3.9, B.z1 + 0.15]);
    sign(S, a.label || 'POLICE', 0, 4.8, B.z1 + 0.2, 7, { fg: '#ffffff', bg: '#1a3a8a', glow: 0.9 });
    b.box('blue', [-1.4, B.H + 0.8, B.z1 - 1], [-0.1, B.H + 1.2, B.z1 - 0.6]); b.box('redL', [0.1, B.H + 0.8, B.z1 - 1], [1.4, B.H + 1.2, B.z1 - 0.6]);
    const bl = glowSprite('#3a7aff', 3, 0.8), rl = glowSprite('#ff3030', 3, 0.1);
    bl.position.set(-0.8, B.H + 1, B.z1 - 0.8); rl.position.set(0.8, B.H + 1, B.z1 - 0.8); S.root.add(bl, rl);
    S.updates.push((dt, t) => { const on = Math.sin(t * 8) > 0; bl.material.opacity = on ? 0.9 : 0.05; rl.material.opacity = on ? 0.05 : 0.9; });
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Police station', height: B.H + 1.3, hw: 11, hd: 9, falloff: 4 });
  },
  *fireStation(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || 'brick', { color: userColor(a) }), trim: M.get('paint', { color: '#f2eee4' }), frame: M.get('paint', { color: '#f2f2f0' }), glass: M.get('glass', { opacity: 0.3 }), interior: M.get('paint', { color: '#e8e4dc' }), floor: M.get('concrete'), roof: M.get('gravel'), accent: M.get('painted', { color: '#c62828' }), door: M.get('painted', { color: '#c62828' }), counter: M.get('wood') };
    S.ctx.stage('geometry', 'Building the fire station');
    const B = block(S, { W: 22, D: 16, floors: 2, FH: 4.6, sill: true, door: false, noWindows: (face, f) => face === 'front' && f === 0 });
    // Three red bay doors (drawn as panels over the ground floor front).
    for (let i = 0; i < 3; i++) { const x = -7 + i * 7; b.box('door', [x - 2.4, 0.1, B.z1 + 0.16], [x + 2.4, 4.0, B.z1 + 0.24]); for (let r = 1; r < 6; r++) b.box('trim', [x - 2.4, 0.1 + r * 0.65, B.z1 + 0.24], [x + 2.4, 0.14 + r * 0.65, B.z1 + 0.27]); b.box('glass', [x - 2, 2.8, B.z1 + 0.245], [x + 2, 3.5, B.z1 + 0.26]); }
    sign(S, a.label || 'FIRE STATION', 0, 4.35, B.z1 + 0.3, 10, { fg: '#ffffff', bg: '#c62828', glow: 0.6, font: 'Georgia, serif' });
    // Hose-drying tower.
    b.box('wall', [B.x1 - 3.5, 0, B.z0], [B.x1, 15, B.z0 + 3.5], { collide: true });
    flatRoof(b, B.x1 - 3.6, B.z0 - 0.1, B.x1 + 0.1, B.z0 + 3.6, 15, { roof: 'roof', wall: 'wall', coping: 'trim' }, { parapet: 0.6 });
    addLight(S, [0, 4.5, B.z1 + 1], '#ffe8c0', 1.5, 8, true);
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Fire station', height: 15.6, hw: 12, hd: 10, falloff: 4 });
  },
  // Library, museum, bank, city hall, courthouse, post office: stone block + portico (+ dome).
  *classic(S, kind) {
    const { a, rng, M, b } = S;
    const label = a.label || { library: 'PUBLIC LIBRARY', museum: 'MUSEUM', bank: 'BANK', cityHall: 'CITY HALL', courthouse: 'COURTHOUSE', postOffice: 'POST OFFICE', capitol: 'CAPITOL' }[kind] || kind.toUpperCase();
    const mats = { wall: M.get(a.materials[0] || rng.pick(['marble', 'stone', 'whiteBrick']), { color: userColor(a) || (kind === 'bank' ? '#e8e0d0' : undefined) }), marble: M.get('marble'), trim: M.get('marble'), frame: M.get('bronze'), glass: M.get('glass', { opacity: 0.25 }), interior: M.get('paint', { color: '#efe8da' }), floor: M.get('checker'), roof: M.get(kind === 'museum' || kind === 'cityHall' || kind === 'capitol' ? 'copper' : 'slate', { color: kind === 'museum' || kind === 'cityHall' || kind === 'capitol' ? '#5a9a88' : undefined }), gold: M.get('gold'), accent: M.get('darkWood'), counter: M.get('darkWood'), books: M.get('books') };
    S.ctx.stage('geometry', 'Carving the facade');
    const W = kind === 'capitol' ? 44 : rng.range(24, 32), D = rng.range(16, 20), floors = 2;
    const B = block(S, { W, D, floors, FH: 5, bayW: 4, winW: 1.8, winH: 3.0, sill: true, mullions: 1 });
    const P = portico(S, 0, B.z1, Math.min(W * 0.55, 18), 7.4, 6, 'marble');
    sign(S, label, 0, P.base + 7.4 + 0.85, P.front + 0.02, Math.min(W * 0.5, 14), { fg: kind === 'bank' ? '#8a6a1a' : '#3a3a3a', bg: '#ece6da', glow: 0.1, font: 'Georgia, "Times New Roman", serif' });
    if (kind === 'museum' || kind === 'cityHall' || kind === 'capitol') dome(S, 0, B.H, 0, kind === 'capitol' ? 8 : 5.5);
    if (kind === 'cityHall' || kind === 'capitol' || kind === 'courthouse') makeFlag(S.root, 0, P.top, P.front - 1.8, '#2a5ad8', 2, 1.2, 4);
    if (kind === 'library') for (let i = 0; i < 6; i++) b.box({ pz: 'books', default: 'accent' }, [B.x0 + 1 + i * (W - 2) / 6, 0.12, B.z0 + 0.4], [B.x0 + 1 + (i + 0.8) * (W - 2) / 6, 3.2, B.z0 + 1.0], { collide: true });
    if (kind === 'museum') { for (let i = 0; i < 3; i++) b.box('marble', [-8 + i * 8 - 0.6, 0.12, -2 - 0.6], [-8 + i * 8 + 0.6, 1.2, -2 + 0.6], { collide: true }); const skel = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.18, 64, 8), M.get('gold')); skel.position.set(0, 2.2, -2); S.root.add(skel); }
    lobby(S, B, mats, rng);
    yield;
    const name = { library: 'Library', museum: 'Museum', bank: 'Bank', cityHall: 'City hall', courthouse: 'Courthouse', postOffice: 'Post office', capitol: 'Capitol building' }[kind] || 'Civic building';
    return finish(S, mats, { name, height: B.H + (kind === 'museum' || kind === 'cityHall' ? 10 : 3), hw: W / 2 + 1.5, hd: D / 2 + 6, falloff: 4 });
  },
  *hotel(S) {
    const { a, rng, M, b } = S;
    const floors = clamp(a.floors || rng.int(7, 12), 3, 40);
    const accent = userColor(a) || rng.pick(['#8a1a2a', '#1a2a4a', '#2a2a2a']);
    const mats = { wall: M.get(a.materials[0] || rng.pick(['stucco', 'concrete', 'whiteBrick']), { color: rng.pick(['#e8dcc8', '#d8d4cc', '#f0e8dc']) }), trim: M.get('paint', { color: '#f4f0e8' }), frame: M.get('metal', { color: '#3a3a3c' }), glass: M.get('glass', { opacity: 0.3, color: '#8ab0c8' }), interior: M.get('paint', { color: '#f2ead8' }), floor: M.get('marble'), roof: M.get('gravel'), accent: M.get('painted', { color: accent }), counter: M.get('darkWood'), carpet: M.get('velvet', { color: '#8a1a2a' }), neon: M.get('emissive', { color: '#ff3a6a', emissiveIntensity: 3 }) };
    S.ctx.stage('geometry', `Stacking ${floors} floors`);
    const B = block(S, { W: 22, D: 15, floors, FH: 3.3, bayW: 3.4, winW: 2.2, sill: false, groundGlass: true });
    yield;
    b.box('accent', [-5, 3.4, B.z1], [5, 3.7, B.z1 + 6]);
    for (const x of [-4.6, 4.6]) b.box('trim', [x - 0.12, 0, B.z1 + 5.6], [x + 0.12, 3.4, B.z1 + 5.8], { collide: true });
    b.box('carpet', [-1.2, 0.01, B.z1], [1.2, 0.04, B.z1 + 8]);
    const vsign = sign(S, 'HOTEL', B.x1 + 0.6, B.H * 0.6, B.z1 - 1, B.H * 0.45, { h: 2.2, fg: '#ffffff', bg: accent, glow: 1.2 });
    vsign.rotation.set(0, HALF, HALF);
    sign(S, a.name ? `HOTEL ${a.name.toUpperCase()}` : rng.pick(['GRAND HOTEL', 'HOTEL ROYAL', 'THE PLAZA', 'HOTEL SUNSET']), 0, B.H + 1.6, B.z1 - 0.3, 12, { fg: '#ffe8b0', bg: null, glow: 1.5, glowColor: '#ffb040' });
    lobby(S, B, mats, rng);
    addLight(S, [0, 3.2, B.z1 + 4], '#ffe0b0', 1.6, 9, true);
    return finish(S, mats, { name: 'Hotel', height: B.H + 3, hw: 12, hd: 12, falloff: 4 });
  },
  *apartment(S) {
    const { a, rng, M, b } = S;
    const floors = clamp(a.floors || rng.int(5, 8), 2, 30);
    const palette = [rng.pick(['#e8c8a0', '#c8d8e0', '#e0e0d8', '#d8b8b0', '#b8c8a8']), '#f2f0ea'];
    const mats = { wall: M.get(a.materials[0] || 'stucco', { color: userColor(a) || palette[0] }), wall2: M.get('stucco', { color: palette[1] }), trim: M.get('paint', { color: '#f4f2ec' }), frame: M.get('paint', { color: '#f4f4f2' }), glass: M.get('glass', { opacity: 0.3 }), interior: M.get('paint', { color: '#f4eee2' }), floor: M.get('floorWood'), roof: M.get('gravel'), accent: M.get('painted', { color: '#3a3a3c' }), rail: M.get('metal', { color: '#3a3a3c' }), counter: M.get('wood'), tank: M.get('wood') };
    S.ctx.stage('geometry', `Stacking ${floors} floors of flats`);
    const B = block(S, { W: 24, D: 12, floors, FH: 3.0, bayW: 4, winW: 2.2, winH: 1.9, sill: true, extFn: (f) => (f % 2 ? 'wall' : 'wall2') });
    // Balconies on the front.
    for (let f = 1; f < floors; f++) for (let i = 0; i < 6; i++) {
      const x = B.x0 + (i + 0.5) * B.W / 6, y = f * 3.0;
      b.box('trim', [x - 1.3, y - 0.18, B.z1], [x + 1.3, y, B.z1 + 1.2], { collide: true });
      b.box('rail', [x - 1.3, y, B.z1 + 1.15], [x + 1.3, y + 1.0, B.z1 + 1.2]);
      b.box('rail', [x - 1.3, y, B.z1], [x - 1.25, y + 1.0, B.z1 + 1.2]); b.box('rail', [x + 1.25, y, B.z1], [x + 1.3, y + 1.0, B.z1 + 1.2]);
    }
    ocyl(b, 'tank', 6, B.H, -2, 1.3, 2.4, 14); coneRoof(b, 6, -2, B.H + 2.4, 1.35, 0.8, 'roof', 14);
    yield;
    lobby(S, B, mats, rng);
    return finish(S, mats, { name: 'Apartment block', height: B.H + 3, hw: 13, hd: 8, falloff: 4 });
  },
  *factory(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || 'brick', { color: userColor(a) }), trim: M.get('concrete'), frame: M.get('metal', { color: '#3a4a3a' }), glass: M.get('glass', { opacity: 0.4, color: '#9ab0a8' }), interior: M.get('concrete'), floor: M.get('concrete'), roof: M.get('metal', { color: '#6a6c70' }), accent: M.get('painted', { color: '#2a5a3a' }), counter: M.get('metal'), rust: M.get('rust'), door: M.get('painted', { color: '#3a5a4a' }) };
    S.ctx.stage('geometry', 'Raising the works');
    const W = 34, D = 22, H = 7;
    const B = block(S, { W, D, floors: 1, FH: H, bayW: 4, winW: 2.6, winH: 3, roof: false, door: false, sill: true });
    // Sawtooth roof.
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z0 = B.z0 + i * D / n, z1 = z0 + D / n;
      b.quad('roof', V(B.x0, H, z0), V(B.x1, H, z0), V(B.x1, H + 2.6, z1), V(B.x0, H + 2.6, z1));
      b.quad('glass', V(B.x0, H + 2.6, z1), V(B.x1, H + 2.6, z1), V(B.x1, H, z1), V(B.x0, H, z1));
      b.tri('wall', V(B.x0, H, z0), V(B.x0, H + 2.6, z1), V(B.x0, H, z1)); b.tri('wall', V(B.x1, H, z0), V(B.x1, H, z1), V(B.x1, H + 2.6, z1));
    }
    b.collider([B.x0, H, B.z0], [B.x1, H + 1.3, B.z1]);
    // Loading doors and chimneys with smoke.
    for (const x of [-9, 9]) { b.box('door', [x - 2.5, 0.1, B.z1 + 0.16], [x + 2.5, 4.5, B.z1 + 0.25]); for (let r = 1; r < 7; r++) b.box('trim', [x - 2.5, r * 0.64, B.z1 + 0.25], [x + 2.5, r * 0.64 + 0.04, B.z1 + 0.28]); }
    const chim = rng.int(2, 3);
    for (let i = 0; i < chim; i++) { const x = B.x0 + 5 + i * 6, z = B.z0 + 4; ocyl(b, 'wall', x, 0, z, 1.3, 22, 16, 1.0); b.cylCollider(x, z, 0, 22, 1.3); smoke(S, x, 22.5, z, 1.6); }
    b.box('rust', [B.x1, 1, 0], [B.x1 + 3, 4, 3], { collide: true });
    sign(S, a.label || rng.pick(['ACME WORKS', 'STEEL & CO.', 'GENESIS MANUFACTURING', 'IRONWORKS']), 0, H - 1, B.z1 + 0.3, 12, { fg: '#f0e8d0', bg: '#2a3a2a', glow: 0.2 });
    addLight(S, [0, 5, 0], '#fff0d8', 2, 16, false);
    yield;
    return finish(S, mats, { name: 'Factory', height: 22, hw: W / 2 + 3, hd: D / 2 + 2, falloff: 5 });
  },
  *warehouse(S) {
    const { a, rng, M, b } = S;
    const col = userColor(a) || rng.pick(['#8a8c90', '#5a7a8a', '#8a6a4a', '#6a7a5a']);
    const mats = { wall: M.get('stripes', { color: col, color2: '#' + new THREE.Color(col).multiplyScalar(0.8).getHexString(), p: [16, 0.5, 0.5] }), trim: M.get('painted', { color: '#3a3a3c' }), frame: M.get('metal'), glass: M.get('glass', { opacity: 0.4 }), interior: M.get('metal', { color: '#9a9ca0' }), floor: M.get('concrete'), roof: M.get('metal', { color: '#7a7c80' }), door: M.get('painted', { color: '#c8a020' }), crate: M.get('planks'), accent: M.get('painted', { color: '#3a3a3c' }), counter: M.get('metal') };
    S.ctx.stage('geometry', 'Framing the warehouse');
    const W = 36, D = 24, H = 9;
    const B = block(S, { W, D, floors: 1, FH: H, door: false, noWindows: (face) => face !== 'side', winW: 3, winH: 1, sillY: 7, roof: false });
    gableRoof(b, B.x0 - 0.3, B.z0 - 0.3, B.x1 + 0.3, B.z1 + 0.3, H, THREE.MathUtils.degToRad(10), { roof: 'roof', wall: 'wall', trim: 'trim' }, { overhang: 0.4, alongZ: true });
    for (let i = 0; i < 3; i++) { const x = -10 + i * 10; b.box('door', [x - 2.2, 1.2, B.z1 + 0.16], [x + 2.2, 5.8, B.z1 + 0.24]); for (let r = 1; r < 8; r++) b.box('trim', [x - 2.2, 1.2 + r * 0.58, B.z1 + 0.24], [x + 2.2, 1.24 + r * 0.58, B.z1 + 0.27]); }
    b.box('trim', [B.x0 + 2, 0, B.z1], [B.x1 - 2, 1.2, B.z1 + 2.5], { collide: true });
    for (let i = 0; i < 8; i++) b.box('crate', [-12 + i * 3, 0.12, -4], [-10.8 + i * 3, 1.3 + (i % 3) * 1.2, -2.8], { collide: true });
    addLight(S, [0, 7, 0], '#fff4e0', 2, 18, false);
    yield;
    return finish(S, mats, { name: 'Warehouse', height: H + 3, hw: W / 2 + 1, hd: D / 2 + 3, falloff: 5 });
  },
  *powerPlant(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get('concrete', { color: '#b8b8b4' }), tower: M.get('concrete', { color: '#c8c8c4' }), trim: M.get('painted', { color: '#c62828' }), frame: M.get('metal'), glass: M.get('glass', { opacity: 0.4 }), interior: M.get('concrete'), floor: M.get('concrete'), roof: M.get('metal', { color: '#6a6c70' }), accent: M.get('painted', { color: '#c62828' }), counter: M.get('metal'), pipe: M.get('steel') };
    S.ctx.stage('geometry', 'Pouring cooling towers');
    const B = block(S, { W: 26, D: 18, floors: 2, FH: 6, bayW: 5, winW: 3.5, winH: 2.5, x: 0, z: 10 });
    for (const x of [-18, 18]) {
      const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(14 * (0.62 + 0.38 * Math.pow(2 * t - 1.1, 2)) * (t > 0.95 ? 1.02 : 1), t * 34)); }
      const g = new THREE.LatheGeometry(prof, 40);
      b.geometry('tower', g, new THREE.Matrix4().makeTranslation(x, 0, -14)); g.dispose();
      b.cylCollider(x, -14, 0, 34, 12);
      smoke(S, x, 36, -14, 5, '#e8e8e8', 10);
    }
    ocyl(b, 'trim', 0, 0, -2, 1.5, 45, 16, 1.2); b.cylCollider(0, -2, 0, 45, 1.5);
    for (let i = 0; i < 5; i++) ocyl(b, i % 2 ? 'trim' : 'tower', 0, 8 + i * 8, -2, 1.52, 1.5, 16);
    beam(b, 'pipe', V(-6, 6, 1), V(-16, 12, -8), 0.8); beam(b, 'pipe', V(6, 6, 1), V(16, 12, -8), 0.8);
    sign(S, a.label || 'POWER STATION', 0, 11, B.z1 + 0.3, 12, { fg: '#ffffff', bg: '#c62828', glow: 0.4 });
    addLight(S, [0, 44, -2], '#ff3030', 2, 20, true);
    yield;
    return finish(S, mats, { name: 'Power plant', height: 45, hw: 33, hd: 30, falloff: 6 });
  },
  *trainStation(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || rng.pick(['brick', 'stone']), { color: userColor(a) }), trim: M.get('stone', { color: '#d8d0c0' }), frame: M.get('iron'), glass: M.get('glass', { opacity: 0.35, color: '#b8c8d0' }), interior: M.get('paint', { color: '#e8e0d0' }), floor: M.get('pavers'), roof: M.get('slate'), accent: M.get('painted', { color: '#1a3a2a' }), counter: M.get('darkWood'), rail: M.get('steel'), sleeper: M.get('darkWood'), gravel: M.get('gravel') };
    S.ctx.stage('geometry', 'Vaulting the train shed');
    const W = 44, D = 16;
    const B = block(S, { W, D, floors: 1, FH: 8, bayW: 5, winW: 3, winH: 4.5, sillY: 1.5, x: 0, z: 10, mullions: 2, sill: true });
    // Arched glass shed behind with platforms and tracks.
    const L = 60, R = 11, sz0 = B.z0, sz1 = sz0 - 26;
    for (let i = 0; i <= 12; i++) { const an = PI * i / 12, x = -Math.cos(an) * R, y = 6 + Math.sin(an) * R * 0.7; if (i < 12) { const an2 = PI * (i + 1) / 12, x2 = -Math.cos(an2) * R, y2 = 6 + Math.sin(an2) * R * 0.7; b.quad('glass', V(x, y, sz1), V(x2, y2, sz1), V(x2, y2, sz0), V(x, y, sz0)); b.quad('glass', V(x2, y2, sz1), V(x, y, sz1), V(x, y, sz0), V(x2, y2, sz0)); } }
    for (let j = 0; j <= 6; j++) { const z = sz0 - j * 26 / 6; for (let i = 0; i < 12; i++) { const an = PI * i / 12, an2 = PI * (i + 1) / 12; beam(b, 'frame', V(-Math.cos(an) * R, 6 + Math.sin(an) * R * 0.7, z), V(-Math.cos(an2) * R, 6 + Math.sin(an2) * R * 0.7, z), 0.12, 6); } for (const s of [-1, 1]) { beam(b, 'frame', V(s * R, 0, z), V(s * R, 6, z), 0.2, 8); b.cylCollider(s * R, z, 0, 6, 0.25); } }
    for (const x of [-6, 6]) b.box('trim', [x - 2, 0, sz1], [x + 2, 1.0, sz0], { collide: true });
    for (const x of [-10, -2, 2, 10]) { void x; }
    for (const x of [-1.5, 1.5]) { b.box('gravel', [x * 2 - 1.6, 0, sz1 - L / 2], [x * 2 + 1.6, 0.15, sz0]); for (const s of [-0.72, 0.72]) b.box('rail', [x * 2 + s - 0.04, 0.15, sz1 - L / 2], [x * 2 + s + 0.04, 0.3, sz0]); for (let k = 0; k < 40; k++) b.box('sleeper', [x * 2 - 1.2, 0.12, sz0 - k * 1.4 - 0.2], [x * 2 + 1.2, 0.2, sz0 - k * 1.4]); }
    // Clock tower.
    b.box('wall', [-2.5, 0, B.z1 - 2], [2.5, 18, B.z1 + 1], { collide: true });
    coneRoof(b, 0, B.z1 - 0.5, 18, 3.4, 4, 'roof', 4);
    const ck = clockMesh(1.5);
    ck.position.set(0, 15.5, B.z1 + 1.02); S.root.add(ck);
    sign(S, a.label || 'CENTRAL STATION', 0, 9.2, B.z1 + 0.3, 14, { fg: '#f0e0b0', bg: '#1a3a2a', glow: 0.4, font: 'Georgia, serif' });
    addLight(S, [0, 6, -12], '#fff0d8', 2, 18, false);
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Train station', height: 22, hw: W / 2 + 1, hd: 30, falloff: 5 });
  },
  *airport(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get('concrete', { color: '#e0e0dc' }), trim: M.get('metal', { color: '#c8ccd2' }), frame: M.get('metal', { color: '#8a9098' }), glass: M.get('glass', { opacity: 0.3, color: '#7ab0d0' }), interior: M.get('paint', { color: '#f0f0ee' }), floor: M.get('tiles'), roof: M.get('metal', { color: '#d8dce0' }), accent: M.get('painted', { color: '#2a5ad8' }), counter: M.get('metal'), asphalt: M.get('asphalt'), paintW: M.get('paint', { color: '#f4f4f2' }), paintY: M.get('paint', { color: '#f2c21a' }), led: M.get('emissive', { color: '#40ff60', emissiveIntensity: 2 }) };
    S.ctx.stage('geometry', 'Building the terminal');
    const W = 56, D = 20;
    const B = block(S, { W, D, floors: 2, FH: 5, bayW: 3, groundGlass: true, winW: 2.6, winH: 3.5, sillY: 0.8, mullions: 0, bands: true, x: 0, z: 30 });
    b.box('roof', [B.x0 - 3, B.H, B.z0 - 3], [B.x1 + 3, B.H + 0.6, B.z1 + 4]);
    sign(S, a.label || 'AIRPORT', 0, B.H - 1.4, B.z1 + 0.3, 16, { fg: '#ffffff', bg: '#2a5ad8', glow: 0.8 });
    // Control tower.
    ocyl(b, 'wall', 34, 0, 18, 2.2, 28, 20, 1.8); b.cylCollider(34, 18, 0, 28, 2.2);
    ocyl(b, 'glass', 34, 28, 18, 4.2, 3.2, 16, 4.8); ocyl(b, 'roof', 34, 31.2, 18, 5.2, 0.6, 16); ocyl(b, 'trim', 34, 31.8, 18, 0.2, 4, 8);
    // Apron and runway.
    b.box('asphalt', [-60, 0.02, -60], [60, 0.1, 18]);
    for (let i = 0; i < 18; i++) b.box('paintW', [-50 + i * 6, 0.1, -38.2], [-47 + i * 6, 0.12, -37.8]);
    for (const z of [-46, -30]) b.box('paintW', [-58, 0.1, z - 0.25], [58, 0.12, z + 0.25]);
    b.box('paintY', [-0.2, 0.1, -28], [0.2, 0.12, 18]);
    for (let i = 0; i < 20; i++) { b.box('led', [-57 + i * 6, 0.1, -46.8], [-56.6 + i * 6, 0.25, -46.4]); b.box('led', [-57 + i * 6, 0.1, -29.6], [-56.6 + i * 6, 0.25, -29.2]); }
    addLight(S, [0, 4, B.z1 + 3], '#ffffff', 2, 14, true);
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Airport', height: 32, hw: 60, hd: 60, falloff: 6, paint: [] });
  },
  *gasStation(S) {
    const { a, rng, M, b } = S;
    const brand = userColor(a) || rng.pick(['#2a8a3a', '#c62828', '#2a5ad8', '#f2a81a']);
    const mats = { wall: M.get('paint', { color: '#f2f0ea' }), trim: M.get('painted', { color: brand }), frame: M.get('metal'), glass: M.get('glass', { opacity: 0.25 }), interior: M.get('paint', { color: '#f4f4f2' }), floor: M.get('tiles'), roof: M.get('gravel'), accent: M.get('painted', { color: brand }), counter: M.get('metal'), concrete: M.get('concrete'), canopy: M.get('paint', { color: '#f4f4f2' }), pump: M.get('painted', { color: brand }), black: M.plain('#1a1a1a', 0.5), light: M.get('emissive', { color: '#ffffff', emissiveIntensity: 1.5 }) };
    S.ctx.stage('geometry', 'Installing pumps');
    b.box('concrete', [-12, 0, -10], [12, 0.1, 14]);
    const B = block(S, { W: 12, D: 8, floors: 1, FH: 4, groundGlass: true, x: 0, z: -5 });
    b.box('canopy', [-9, 5, 2], [9, 5.8, 12], { collide: true });
    b.box('trim', [-9.05, 5.1, 1.95], [9.05, 5.7, 12.05]);
    b.box('light', [-8.5, 4.98, 2.5], [8.5, 5.0, 11.5]);
    for (const x of [-6, 0, 6]) { b.box('trim', [x - 0.3, 0, 6.7], [x + 0.3, 5, 7.3], { collide: true }); }
    for (const x of [-3, 3]) for (const z of [5, 9]) { b.box('concrete', [x - 0.8, 0.1, z - 0.4], [x + 0.8, 0.3, z + 0.4]); b.box('pump', [x - 0.4, 0.3, z - 0.25], [x + 0.4, 2.0, z + 0.25], { collide: true }); b.box('black', [x - 0.3, 1.3, z + 0.25], [x + 0.3, 1.7, z + 0.27]); }
    sign(S, a.label || rng.pick(['FUEL', 'GAS', 'PETROL', 'GENESIS FUEL']), 0, 5.45, 12.08, 6, { fg: '#ffffff', bg: brand, glow: 1 });
    // Price pole.
    b.box('trim', [10, 0, 12], [10.4, 7, 12.4], { collide: true });
    sign(S, '$ 3.99', 10.2, 7.2, 12.42, 2.4, { h: 1.2, fg: '#ff4040', bg: '#101010', glow: 1.2, font: 'monospace' });
    addLight(S, [0, 4.8, 7], '#ffffff', 2.2, 14, true);
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Gas station', height: 7.5, hw: 12, hd: 13, falloff: 4 });
  },
  *supermarket(S) {
    const { a, rng, M, b } = S;
    const brand = userColor(a) || rng.pick(['#c62828', '#2a8a3a', '#f28a1a', '#2a5ad8']);
    const mats = { wall: M.get('concretePanels', { color: '#e8e4dc' }), trim: M.get('painted', { color: brand }), frame: M.get('metal'), glass: M.get('glass', { opacity: 0.25 }), interior: M.get('paint', { color: '#f4f4f2' }), floor: M.get('tiles'), roof: M.get('gravel'), accent: M.get('painted', { color: brand }), counter: M.get('metal'), shelf: M.get('metal', { color: '#c8ccd2' }), goods: M.get('books'), asphalt: M.get('asphalt'), paintW: M.get('paint', { color: '#f4f4f2' }) };
    S.ctx.stage('geometry', 'Stocking aisles');
    const B = block(S, { W: 36, D: 26, floors: 1, FH: 7, groundGlass: true, bayW: 4, noWindows: (face) => face !== 'front' });
    b.box('trim', [B.x0 - 0.2, 5.4, B.z1], [B.x1 + 0.2, 7.2, B.z1 + 0.3]);
    sign(S, a.label || rng.pick(['FRESH MARKET', 'SUPERMARKET', 'GENESIS FOODS', 'MEGA MART']), 0, 6.3, B.z1 + 0.32, 16, { h: 1.6, fg: '#ffffff', bg: brand, glow: 1 });
    for (let i = 0; i < 6; i++) { const x = B.x0 + 4 + i * 5; b.box('shelf', [x, 0.12, B.z0 + 4], [x + 1.2, 2.2, B.z1 - 7], { collide: true }); b.box('goods', [x - 0.02, 0.4, B.z0 + 4], [x + 1.22, 2.0, B.z1 - 7]); }
    b.box('asphalt', [B.x0 - 2, 0.02, B.z1], [B.x1 + 2, 0.08, B.z1 + 22]);
    for (let i = 0; i < 12; i++) for (const z of [B.z1 + 6, B.z1 + 15]) b.box('paintW', [B.x0 + 1 + i * 3, 0.08, z], [B.x0 + 1.12 + i * 3, 0.1, z + 5]);
    addLight(S, [0, 6, 0], '#ffffff', 2.5, 20, false);
    yield;
    return finish(S, mats, { name: 'Supermarket', height: 8, hw: 20, hd: 25, falloff: 4 });
  },
  *cinema(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || rng.pick(['brick', 'stucco']), { color: userColor(a) || '#8a2a2a' }), trim: M.get('gold'), frame: M.get('gold'), glass: M.get('glass', { opacity: 0.3 }), interior: M.get('velvet', { color: '#5a0a1a' }), floor: M.get('carpet', { color: '#6a0a1a' }), roof: M.get('gravel'), accent: M.get('painted', { color: '#1a1a1a' }), counter: M.get('darkWood'), marquee: M.get('painted', { color: '#1a1a1a' }), bulb: M.get('emissive', { color: '#ffe080', emissiveIntensity: 3 }), screen: M.get('emissive', { color: '#dfe8ff', emissiveIntensity: 1 }), seat: M.get('velvet', { color: '#8a1a2a' }) };
    S.ctx.stage('geometry', 'Hanging the marquee');
    const B = block(S, { W: 22, D: 30, floors: 1, FH: 12, groundGlass: true, noWindows: (face) => face !== 'front', bayW: 5.5 });
    b.box('marquee', [-9, 4.2, B.z1], [9, 6.2, B.z1 + 3.5]);
    for (let i = 0; i < 36; i++) { const x = -8.8 + i * 0.5; b.box('bulb', [x, 4.1, B.z1 + 3.5], [x + 0.14, 4.25, B.z1 + 3.6]); b.box('bulb', [x, 6.2, B.z1 + 3.5], [x + 0.14, 6.35, B.z1 + 3.6]); }
    const P = S.item.params || {};
    sign(S, a.label || P.marquee || rng.pick(['NOW SHOWING: DRAGONS', 'TONIGHT: SPACE PIRATES', 'THE GENESIS STORY']), 0, 5.2, B.z1 + 3.52, 16, { h: 1.5, fg: '#1a1a1a', bg: '#f8f0d8', glow: 0.8 });
    sign(S, P.sign || 'CINEMA', 0, 9.5, B.z1 + 0.35, 6, { h: 1.6, fg: '#ffe080', bg: '#1a1a1a', glow: 1.5 });
    b.box('screen', [B.x0 + 2, 2, B.z0 + 0.4], [B.x1 - 2, 10, B.z0 + 0.5]);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) b.box('seat', [B.x0 + 3 + c * 1.6, 0.12 + r * 0.3, B.z0 + 8 + r * 1.8], [B.x0 + 4.2 + c * 1.6, 0.9 + r * 0.3, B.z0 + 8.8 + r * 1.8]);
    for (let r = 0; r < 8; r++) b.box('floor', [B.x0 + 0.2, 0, B.z0 + 7.5 + r * 1.8], [B.x1 - 0.2, 0.12 + r * 0.3, B.z0 + 9.3 + r * 1.8], { collide: true });
    addLight(S, [0, 5, B.z1 + 3], '#ffd890', 2, 10, true);
    addLight(S, [0, 6, B.z0 + 5], '#b0c0ff', 1.5, 14, false);
    yield;
    return finish(S, mats, { name: 'Cinema', height: 12.8, hw: 12, hd: 19, falloff: 4 });
  },
  *stadium(S) {
    const { a, rng, M, b } = S;
    const team = userColor(a) || rng.pick(['#c62828', '#2a5ad8', '#2a8a3a', '#f2a81a']);
    const mats = { wall: M.get('concrete', { color: '#c8c8c4' }), seatA: M.get('glossyPlastic', { color: team }), seatB: M.get('glossyPlastic', { color: '#f2f2f0' }), pitch: M.get('lawn'), line: M.get('paint', { color: '#f8f8f6' }), steel: M.get('steel'), lamp: M.get('emissive', { color: '#ffffff', emissiveIntensity: 3 }), roof: M.get('metal', { color: '#e0e2e4' }), trim: M.get('painted', { color: team }) };
    S.ctx.stage('geometry', 'Terracing the stands');
    const sz = clamp(a.sizeMul || 1, 0.6, 2.5);
    const A = 48 * sz, Bb = 34 * sz, tiers = 14;
    const segs = 64;
    for (let t = 0; t < tiers; t++) {
      const ra = A + t * 1.1, rb = Bb + t * 1.1, y = 0.5 + t * 0.62;
      for (let i = 0; i < segs; i++) {
        const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
        const p = (an, r1, r2) => V(Math.cos(an) * r1, 0, Math.sin(an) * r2);
        const q0 = p(a0, ra, rb), q1 = p(a1, ra, rb), q2 = p(a1, ra + 1.1, rb + 1.1), q3 = p(a0, ra + 1.1, rb + 1.1);
        const key = (Math.floor(i / 4) + t) % 5 === 0 ? 'seatB' : 'seatA';
        b.quad(key, V(q0.x, y + 0.62, q0.z), V(q3.x, y + 0.62, q3.z), V(q2.x, y + 0.62, q2.z), V(q1.x, y + 0.62, q1.z));
        b.quad('wall', V(q0.x, y, q0.z), V(q1.x, y, q1.z), V(q1.x, y + 0.62, q1.z), V(q0.x, y + 0.62, q0.z));
      }
    }
    // Outer wall and roof ring.
    const ro = tiers * 1.1;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      const P = (an, off, y) => V(Math.cos(an) * (A + ro + off), y, Math.sin(an) * (Bb + ro + off));
      b.quad('wall', P(a1, 0, 0), P(a0, 0, 0), P(a0, 0, tiers * 0.62 + 4), P(a1, 0, tiers * 0.62 + 4));
      b.quad('roof', P(a0, 0, tiers * 0.62 + 4), P(a0, -12, tiers * 0.62 + 6), P(a1, -12, tiers * 0.62 + 6), P(a1, 0, tiers * 0.62 + 4));
      b.quad('roof', P(a1, -12, tiers * 0.62 + 6), P(a0, -12, tiers * 0.62 + 6), P(a0, 0, tiers * 0.62 + 4), P(a1, 0, tiers * 0.62 + 4));
      if (i % 4 === 0) b.collider([Math.cos(a0) * (A + ro) - 1, 0, Math.sin(a0) * (Bb + ro) - 1], [Math.cos(a0) * (A + ro) + 1, tiers * 0.62 + 4, Math.sin(a0) * (Bb + ro) + 1]);
    }
    // Pitch with markings and goals.
    const PL = A * 1.7, PW = Bb * 1.5;
    b.box('pitch', [-PL / 2, 0, -PW / 2], [PL / 2, 0.08, PW / 2]);
    for (const [x0, z0, x1, z1] of [[-PL / 2 + 2, -PW / 2 + 2, PL / 2 - 2, -PW / 2 + 2.2], [-PL / 2 + 2, PW / 2 - 2.2, PL / 2 - 2, PW / 2 - 2], [-PL / 2 + 2, -PW / 2 + 2, -PL / 2 + 2.2, PW / 2 - 2], [PL / 2 - 2.2, -PW / 2 + 2, PL / 2 - 2, PW / 2 - 2], [-0.1, -PW / 2 + 2, 0.1, PW / 2 - 2]]) b.box('line', [x0, 0.08, z0], [x1, 0.1, z1]);
    for (const s of [-1, 1]) { const x = s * (PL / 2 - 2); beam(b, 'line', V(x, 0, -3.66), V(x, 2.44, -3.66), 0.06); beam(b, 'line', V(x, 0, 3.66), V(x, 2.44, 3.66), 0.06); beam(b, 'line', V(x, 2.44, -3.66), V(x, 2.44, 3.66), 0.06); }
    // Floodlights.
    for (const [sx, sz2] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx * (A + ro + 4) * 0.72, z = sz2 * (Bb + ro + 4) * 0.72, top = tiers * 0.62 + 22;
      beam(b, 'steel', V(x, 0, z), V(x, top, z), 0.5, 10); b.cylCollider(x, z, 0, top, 0.6);
      b.box('steel', [x - 3, top, z - 0.3], [x + 3, top + 3, z + 0.3]);
      b.box('lamp', [x - 2.8, top + 0.2, z - 0.35 * sx], [x + 2.8, top + 2.8, z - 0.3 * sx]);
      addLight(S, [x * 0.7, top, z * 0.7], '#ffffff', 3, 90, true);
    }
    yield;
    return finish(S, mats, { name: 'Stadium', height: tiers * 0.62 + 26, hw: A + ro + 6, hd: Bb + ro + 6, falloff: 8, suppressGrass: undefined });
  },
  *prison(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get('concrete', { color: '#a8a8a4' }), trim: M.get('concrete'), frame: M.get('iron'), glass: M.get('glass', { opacity: 0.4 }), interior: M.get('concrete'), floor: M.get('concrete'), roof: M.get('gravel'), accent: M.get('painted', { color: '#3a3a3c' }), counter: M.get('metal'), bars: M.get('iron'), wire: M.get('steel'), lamp: M.get('emissive', { color: '#fff8e0', emissiveIntensity: 2 }) };
    S.ctx.stage('geometry', 'Raising the walls');
    const R = 26, H = 7;
    for (const [ax, az, bx, bz] of [[-R, -R, R, -R], [R, -R, R, R], [R, R, 4, R], [-4, R, -R, R], [-R, R, -R, -R]]) {
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      obox(b, 'wall', (ax + bx) / 2, H / 2, (az + bz) / 2, 0.8, H, len, yaw);
      b.collider([Math.min(ax, bx) - 0.4, 0, Math.min(az, bz) - 0.4], [Math.max(ax, bx) + 0.4, H, Math.max(az, bz) + 0.4]);
      for (let i = 0; i <= len / 3; i++) { const f = i / (len / 3); beam(b, 'wire', V(ax + (bx - ax) * f, H, az + (bz - az) * f), V(ax + (bx - ax) * f, H + 1, az + (bz - az) * f), 0.03, 4); }
    }
    b.box('bars', [-4, 0, R - 0.3], [4, H - 1, R + 0.3]);
    for (const [x, z] of [[-R, -R], [R, -R], [R, R], [-R, R]]) {
      b.box('wall', [x - 2, 0, z - 2], [x + 2, 12, z + 2], { collide: true });
      b.box('glass', [x - 2.2, 12, z - 2.2], [x + 2.2, 14, z + 2.2]);
      b.box('roof', [x - 2.6, 14, z - 2.6], [x + 2.6, 14.4, z + 2.6]);
      addLight(S, [x, 13, z], '#fff8e0', 2, 30, true);
    }
    const B = block(S, { W: 24, D: 12, floors: 3, FH: 3.2, bayW: 2.4, winW: 0.8, winH: 1.0, sillY: 1.4, x: 0, z: -6 });
    for (let f = 0; f < 3; f++) for (let i = 0; i < 10; i++) { const x = B.x0 + (i + 0.5) * 2.4; for (let k = -2; k <= 2; k++) b.box('bars', [x + k * 0.15 - 0.02, f * 3.2 + 1.4, B.z1 + 0.16], [x + k * 0.15 + 0.02, f * 3.2 + 2.4, B.z1 + 0.2]); }
    sign(S, a.label || 'STATE PENITENTIARY', 0, H - 0.5, R + 0.45, 10, { fg: '#e8e8e8', bg: '#2a2a2c', glow: 0.2 });
    yield;
    return finish(S, mats, { name: 'Prison', height: 14.5, hw: R + 3, hd: R + 3, falloff: 5 });
  },
  *observatory(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || 'whiteBrick', { color: userColor(a) }), dome: M.get('metal', { color: '#e0e2e4' }), trim: M.get('paint', { color: '#f2f0ea' }), dark: M.plain('#101418', 0.6), steel: M.get('steel'), frame: M.get('metal'), glass: M.get('glass'), interior: M.get('paint', { color: '#e8e8e6' }), floor: M.get('floorWood'), roof: M.get('gravel'), accent: M.get('painted', { color: '#2a3a5a' }), tube: M.get('painted', { color: '#f4f4f2' }) };
    S.ctx.stage('geometry', 'Mounting the telescope');
    const R = 7, H = 7;
    roundWall(b, 0, 0, 0, H, R, 'wall', 40);
    slab(b, -R, -R, R, R, 0, 0.15, { py: 'floor', default: 'interior' });
    const g = new THREE.SphereGeometry(R * 1.02, 40, 16, 0, TAU, 0, HALF);
    b.geometry('dome', g, new THREE.Matrix4().makeTranslation(0, H, 0)); g.dispose();
    b.box('dark', [-1, H, R * 0.2], [1, H + R * 0.9, R * 1.03]);
    beam(b, 'tube', V(0, H + 1, 0), V(0, H + R * 0.9, R * 0.9), 0.8, 16);
    b.box('wall', [-1.4, 0, R - 0.2], [1.4, 2.6, R + 1.4]);
    b.box('trim', [-1.6, 2.6, R - 0.2], [1.6, 2.9, R + 1.6]);
    addLight(S, [0, 3, 0], '#b0c0ff', 1.2, 10, false);
    yield;
    return finish(S, mats, { name: 'Observatory', height: H + R, hw: R + 1.5, hd: R + 2, falloff: 4 });
  },
  *lab(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get('panels', { color: '#e8eaec' }), trim: M.get('metal', { color: '#9aa0a8' }), frame: M.get('metal'), glass: M.get('glass', { opacity: 0.3, color: '#8ab8d0' }), interior: M.get('paint', { color: '#f4f6f8' }), floor: M.get('tiles'), roof: M.get('gravel'), accent: M.get('painted', { color: '#2a8a8a' }), counter: M.get('metal'), dish: M.get('paint', { color: '#f4f4f2' }), tank: M.get('glass', { opacity: 0.4, color: '#40ff90' }), glow: M.get('emissive', { color: '#40ff90', emissiveIntensity: 2.5 }) };
    S.ctx.stage('geometry', 'Building the laboratory');
    const B = block(S, { W: 22, D: 16, floors: 2, FH: 4, bayW: 3, groundGlass: true, mullions: 0 });
    sign(S, a.label || 'RESEARCH LABORATORY', 0, 4.2, B.z1 + 0.3, 11, { fg: '#ffffff', bg: '#2a8a8a', glow: 0.6 });
    const dg = new THREE.SphereGeometry(3, 24, 8, 0, TAU, 0, 1.1); b.geometry('dish', dg, new THREE.Matrix4().makeRotationX(-0.6).setPosition(5, B.H + 3.6, -3)); dg.dispose();
    beam(b, 'trim', V(5, B.H, -3), V(5, B.H + 2.5, -3), 0.3);
    for (let i = 0; i < 3; i++) { ocyl(b, 'tank', -6 + i * 2.5, 0.12, -5, 0.8, 2.6, 16); ocyl(b, 'glow', -6 + i * 2.5, 0.2, -5, 0.35, 2.3, 12); }
    addLight(S, [-3.5, 1.5, -5], '#40ff90', 1.5, 8, false);
    lobby(S, B, mats, rng);
    yield;
    return finish(S, mats, { name: 'Laboratory', height: B.H + 6, hw: 12, hd: 9, falloff: 4 });
  },
  *waterTower(S) {
    const { a, rng, M, b } = S;
    const mats = { steel: M.get('painted', { color: userColor(a) || rng.pick(['#8ab0c8', '#e8e8e6', '#c8b890']) }), dark: M.get('iron'), roof: M.get('painted', { color: '#6a6c70' }) };
    S.ctx.stage('geometry', 'Raising the tank');
    const H = 20;
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { beam(b, 'dark', V(x, 0, z), V(x * 0.7, H, z * 0.7), 0.25, 8); b.cylCollider(x, z, 0, 2, 0.3); }
    for (let i = 1; i < 4; i++) { const y = i * H / 4, s = 1 - 0.3 * y / H; for (const [ax, az, bx, bz] of [[-3, -3, 3, -3], [3, -3, 3, 3], [3, 3, -3, 3], [-3, 3, -3, -3]]) beam(b, 'dark', V(ax * s, y, az * s), V(bx * s, y, bz * s), 0.1, 6); }
    ocyl(b, 'steel', 0, H, 0, 4.5, 6, 32); coneRoof(b, 0, 0, H + 6, 4.6, 2.2, 'roof', 32);
    const bottom = new THREE.SphereGeometry(4.5, 32, 8, 0, TAU, HALF, HALF * 0.6); b.geometry('steel', bottom, new THREE.Matrix4().makeTranslation(0, H + 0.5, 0)); bottom.dispose();
    const t = labelTexture(a.label || 'GENESIS', { w: 1024, h: 256, fg: '#1a3a6a' });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(4.52, 4.52, 2, 32, 1, true, -0.8, 1.6), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6 }));
    m.position.set(0, H + 3, 0); m.rotation.y = HALF; S.root.add(m);
    yield;
    return finish(S, mats, { name: 'Water tower', height: H + 8.5, hw: 5, hd: 5, falloff: 2, flatten: true });
  },
  *hangar(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get('metal', { color: userColor(a) || '#9aa0a4' }), dark: M.plain('#141618', 0.8), floor: M.get('concrete'), trim: M.get('painted', { color: '#f2c21a' }) };
    S.ctx.stage('geometry', 'Curving the roof');
    const R = 13, L = 36, segs = 20;
    for (let i = 0; i < segs; i++) { const a0 = PI * i / segs, a1 = PI * (i + 1) / segs; const p = (an, z) => V(-Math.cos(an) * R, Math.sin(an) * R, z); b.quad('wall', p(a0, -L / 2), p(a1, -L / 2), p(a1, L / 2), p(a0, L / 2)); b.quad('wall', p(a1, -L / 2), p(a0, -L / 2), p(a0, L / 2), p(a1, L / 2)); }
    for (let i = 0; i < segs; i++) { const a0 = PI * i / segs, a1 = PI * (i + 1) / segs; b.tri('wall', V(0, 0, -L / 2), V(-Math.cos(a1) * R, Math.sin(a1) * R, -L / 2), V(-Math.cos(a0) * R, Math.sin(a0) * R, -L / 2)); }
    b.box('dark', [-R * 0.7, 0, L / 2 - 0.2], [R * 0.7, R * 0.7, L / 2 - 0.1]);
    b.box('floor', [-R, 0, -L / 2], [R, 0.1, L / 2]);
    b.box('trim', [-0.2, 0.1, -L / 2], [0.2, 0.12, L / 2 + 12]);
    for (const s of [-1, 1]) b.collider([s * R - 0.5, 0, -L / 2], [s * R + 0.5, R * 0.5, L / 2]);
    b.collider([-R, 0, -L / 2 - 0.5], [R, R, -L / 2 + 0.5]);
    addLight(S, [0, R * 0.8, 0], '#fff4e0', 2, 20, false);
    yield;
    return finish(S, mats, { name: 'Hangar', height: R, hw: R + 1, hd: L / 2 + 2, falloff: 5 });
  },
  *bunker(S) {
    const { a, M, b } = S;
    const mats = { wall: M.get('concrete', { color: '#8a8c84' }), dark: M.plain('#101010', 0.9), sand: M.get('fabric', { color: '#b8a878' }) };
    S.ctx.stage('geometry', 'Pouring concrete');
    b.box('wall', [-6, 0, -5], [6, 3, 5], { collide: true });
    b.box('wall', [-6.5, 3, -5.5], [6.5, 3.8, 5.5], { collide: true });
    for (const x of [-3.5, 0, 3.5]) b.box('dark', [x - 1, 1.6, 5], [x + 1, 2.1, 5.05]);
    b.box('dark', [-0.8, 0, -5.05], [0.8, 2.2, -4.95]);
    for (let i = 0; i < 12; i++) b.box('sand', [-6 + i * 1.0, 0, 5.4], [-5.1 + i * 1.0, 0.35 + (i % 2) * 0.35, 6.2]);
    void a;
    yield;
    return finish(S, mats, { name: 'Bunker', height: 3.8, hw: 7, hd: 7, falloff: 3 });
  },
  *garage(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || rng.pick(['siding', 'brick', 'stucco']), { color: userColor(a) }), trim: M.get('paint', { color: '#f2f2f0' }), door: M.get('painted', { color: '#f2f2f0' }), roof: M.get('shingles'), floor: M.get('concrete'), interior: M.get('paint', { color: '#e0e0dc' }), frame: M.get('paint'), glass: M.get('glass') };
    S.ctx.stage('geometry', 'Building the garage');
    const B = block(S, { W: 7, D: 7, floors: 1, FH: 3, door: false, noWindows: (face) => face === 'front', roof: false });
    gableRoof(b, B.x0 - 0.3, B.z0 - 0.3, B.x1 + 0.3, B.z1 + 0.3, 3, THREE.MathUtils.degToRad(22), { roof: 'roof', wall: 'wall', trim: 'trim' }, { overhang: 0.3 });
    b.box('door', [-2.6, 0.05, B.z1 + 0.16], [2.6, 2.5, B.z1 + 0.22]);
    for (let r = 1; r < 5; r++) b.box('trim', [-2.6, r * 0.5, B.z1 + 0.22], [2.6, r * 0.5 + 0.03, B.z1 + 0.25]);
    b.box('floor', [-2.8, 0, B.z1], [2.8, 0.06, B.z1 + 6]);
    yield;
    return finish(S, mats, { name: 'Garage', height: 5, hw: 4, hd: 7, falloff: 3 });
  },
  *parkingGarage(S) {
    const { a, M, b } = S;
    const mats = { wall: M.get('concrete', { color: '#b8b8b4' }), line: M.get('paint', { color: '#f2f2f0' }), trim: M.get('painted', { color: '#f2c21a' }) };
    S.ctx.stage('geometry', 'Stacking decks');
    const W = 30, D = 36, levels = clamp(a.floors || 4, 2, 10), FH = 3;
    for (let l = 0; l <= levels; l++) {
      const y = l * FH;
      b.box('wall', [-W / 2, y - 0.3, -D / 2], [W / 2 - (l < levels ? 6 : 0), y, D / 2], { collide: true });
      if (l > 0) { b.box('wall', [-W / 2, y, -D / 2], [W / 2, y + 1, -D / 2 + 0.25], { collide: true }); b.box('wall', [-W / 2, y, D / 2 - 0.25], [W / 2, y + 1, D / 2], { collide: true }); b.box('trim', [-W / 2, y + 0.9, D / 2], [W / 2, y + 1, D / 2 + 0.02]); }
      for (let i = 0; i < 8; i++) b.box('line', [-W / 2 + 1 + i * 2.8, y + 0.01, -D / 2 + 1], [-W / 2 + 1.1 + i * 2.8, y + 0.02, -D / 2 + 6]);
      if (l < levels) { const g = new THREE.BoxGeometry(5.6, 0.3, 14); const m = new THREE.Matrix4().makeRotationX(Math.atan2(FH, 14)).setPosition(W / 2 - 3, y + FH / 2, 0); b.geometry('wall', g, m); g.dispose(); for (let k = 0; k < 16; k++) b.collider([W / 2 - 5.8, y + (k + 1) * FH / 16 - 0.3, -7 + k * 14 / 16], [W / 2 - 0.2, y + (k + 1) * FH / 16, -7 + (k + 1) * 14 / 16]); }
    }
    for (let x = -W / 2 + 1; x < W / 2; x += 7) for (let z = -D / 2 + 1; z < D / 2; z += 8) { b.box('wall', [x - 0.3, 0, z - 0.3], [x + 0.3, levels * FH, z + 0.3], { collide: true }); }
    yield;
    return finish(S, mats, { name: 'Parking garage', height: levels * FH + 1, hw: W / 2 + 1, hd: D / 2 + 1, falloff: 4 });
  },
  *mosque(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || rng.pick(['marble', 'stucco', 'sand']), { color: userColor(a) || '#f0ece2' }), marble: M.get('marble'), roof: M.get(rng.pick(['gold', 'copper', 'tiles']), { color: '#3a8a9a' }), gold: M.get('gold'), dark: M.plain('#1a1a1c', 0.8), trim: M.get('marble'), frame: M.get('gold'), glass: M.get('glass'), interior: M.get('paint', { color: '#f4ecd8' }), floor: M.get('rug', { color: '#8a1a2a' }) };
    S.ctx.stage('geometry', 'Raising the dome and minarets');
    const W = 22;
    b.box('marble', [-W / 2 - 3, 0, -W / 2 - 3], [W / 2 + 3, 0.5, W / 2 + 6], { collide: true });
    wallSegmentsX(b, { x0: -W / 2, x1: W / 2, z: W / 2, y0: 0.5, h: 9, t: 0.6, ext: 'wall', int: 'interior', side: 1, openings: [{ u0: W / 2 - 2, u1: W / 2 + 2, v0: 0, v1: 5, kind: 'door' }] });
    wallSegmentsX(b, { x0: -W / 2, x1: W / 2, z: -W / 2, y0: 0.5, h: 9, t: 0.6, ext: 'wall', int: 'interior', side: -1 });
    wallSegmentsZ(b, { z0: -W / 2, z1: W / 2, x: -W / 2, y0: 0.5, h: 9, t: 0.6, ext: 'wall', int: 'interior', side: -1 });
    wallSegmentsZ(b, { z0: -W / 2, z1: W / 2, x: W / 2, y0: 0.5, h: 9, t: 0.6, ext: 'wall', int: 'interior', side: 1 });
    slab(b, -W / 2, -W / 2, W / 2, W / 2, 0.5, 0.1, { py: 'floor', default: 'interior' });
    flatRoof(b, -W / 2 - 0.3, -W / 2 - 0.3, W / 2 + 0.3, W / 2 + 0.3, 9.5, { roof: 'marble', wall: 'wall', coping: 'marble' }, { parapet: 0.6 });
    for (let i = 0; i < 5; i++) b.box('dark', [-W / 2 + 2 + i * 4.2, 5, W / 2 + 0.31], [-W / 2 + 3.4 + i * 4.2, 7.5, W / 2 + 0.33]);
    const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(8 * Math.sin(Math.min(1, t * 1.15) * PI * 0.62) * (1 - Math.pow(t, 3) * 0.9) + 0.02, t * 12)); }
    roundWall(b, 0, 0, 9.5, 3, 7, 'wall', 32);
    const dg = new THREE.LatheGeometry(prof, 32); b.geometry('roof', dg, new THREE.Matrix4().makeTranslation(0, 12.5, 0)); dg.dispose();
    ocyl(b, 'gold', 0, 24.4, 0, 0.1, 2, 6); b.geometry('gold', new THREE.SphereGeometry(0.4, 12, 8), new THREE.Matrix4().makeTranslation(0, 25, 0));
    for (const [x, z] of [[-W / 2 - 1.5, W / 2 + 1.5], [W / 2 + 1.5, W / 2 + 1.5], [-W / 2 - 1.5, -W / 2 - 1.5], [W / 2 + 1.5, -W / 2 - 1.5]]) {
      ocyl(b, 'wall', x, 0.5, z, 1.2, 26, 16, 0.9); b.cylCollider(x, z, 0, 26, 1.2);
      for (const y of [10, 18, 24]) ocyl(b, 'marble', x, y, z, 1.6, 0.6, 16);
      coneRoof(b, x, z, 26.5, 1.1, 3.5, 'roof', 16);
    }
    addLight(S, [0, 6, 0], '#ffe8c0', 2, 14, false);
    yield;
    return finish(S, mats, { name: 'Mosque', height: 30, hw: W / 2 + 4, hd: W / 2 + 7, falloff: 5 });
  },
  *palace(S) {
    const { a, rng, M, b } = S;
    const mats = { wall: M.get(a.materials[0] || rng.pick(['stucco', 'marble', 'sand']), { color: userColor(a) || rng.pick(['#f0e6d0', '#f4f0ea', '#e8d8c0']) }), marble: M.get('marble'), trim: M.get('marble'), frame: M.get('gold'), glass: M.get('glass', { opacity: 0.25 }), interior: M.get('paint', { color: '#f2e8d4' }), floor: M.get('checker'), roof: M.get('slate'), gold: M.get('gold'), accent: M.get('velvet', { color: '#8a1a2a' }), counter: M.get('marble'), water: M.get('water'), hedge: M.get('leaves') };
    S.ctx.stage('geometry', 'Building the grand facade');
    const Bm = block(S, { W: 40, D: 18, floors: 3, FH: 5, bayW: 3.6, winW: 1.8, winH: 3, sill: true, mullions: 1 });
    for (const s of [-1, 1]) block(S, { W: 14, D: 26, floors: 2, FH: 5, bayW: 3.6, winW: 1.8, winH: 3, sill: true, mullions: 1, x: s * 26, z: 4, door: false });
    yield;
    portico(S, 0, Bm.z1, 16, 10, 8, 'marble');
    dome(S, 0, Bm.H, 0, 6, 'roof', 'marble');
    for (const x of [-12, 12]) { dome(S, x, Bm.H, 0, 2.5, 'gold', 'marble', false); }
    // Fountain & hedges.
    ocyl(b, 'marble', 0, 0, Bm.z1 + 18, 5, 0.6, 32); ocyl(b, 'water', 0, 0.5, Bm.z1 + 18, 4.6, 0.1, 32); ocyl(b, 'marble', 0, 0, Bm.z1 + 18, 0.5, 3, 12);
    for (const s of [-1, 1]) b.box('hedge', [s * 8 - 1, 0, Bm.z1 + 6], [s * 8 + 1, 1.2, Bm.z1 + 28], { collide: true });
    makeFlag(S.root, 0, Bm.H + 13, 0, rng.pick(['#8a1a2a', '#1a2a8a', '#f2c21a']), 2.4, 1.5, 4);
    lobby(S, Bm, mats, rng);
    return finish(S, mats, { name: a.name ? `${a.name}'s palace` : 'Palace', height: Bm.H + 16, hw: 34, hd: 30, falloff: 6 });
  },
  *circusTent(S) {
    const { a, rng, M, b } = S;
    const c1 = userColor(a) || rng.pick(['#c62828', '#2a5ad8', '#8a2aa8']);
    const mats = { a: M.get('fabric', { color: c1 }), b: M.get('fabric', { color: '#f4f2ee' }), pole: M.get('paint', { color: '#f2c21a' }), sand: M.get('sand'), ring: M.get('painted', { color: '#c62828' }), dark: M.plain('#1a1010', 0.9) };
    S.ctx.stage('geometry', 'Raising the big top');
    const R = 16, H = 7, peak = 16, n = 24;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, key = i % 2 ? 'a' : 'b';
      const p = (an, r, y) => V(Math.cos(an) * r, y, Math.sin(an) * r);
      const door = i === 6 || i === 5;
      if (!door) { b.quad(key, p(a1, R, 0), p(a0, R, 0), p(a0, R, H), p(a1, R, H)); b.quad(key, p(a0, R, 0), p(a1, R, 0), p(a1, R, H), p(a0, R, H)); b.collider([Math.cos(a0) * R - 0.5, 0, Math.sin(a0) * R - 0.5], [Math.cos(a0) * R + 0.5, H, Math.sin(a0) * R + 0.5]); }
      b.quad(key, p(a1, R, H), p(a0, R, H), p(a0, 1, peak), p(a1, 1, peak));
      b.quad(key, p(a0, R, H), p(a1, R, H), p(a1, 1, peak), p(a0, 1, peak));
      b.box('dark', [Math.cos(a0) * (R + 0.02) - 0.05, H - 0.8, Math.sin(a0) * (R + 0.02) - 0.05], [Math.cos(a0) * (R + 0.02) + 0.05, H, Math.sin(a0) * (R + 0.02) + 0.05]);
    }
    ocyl(b, 'pole', 0, 0, 0, 0.3, peak + 3, 10); b.cylCollider(0, 0, 0, peak + 3, 0.35);
    ocyl(b, 'sand', 0, 0, 0, R - 1, 0.1, 32);
    ocyl(b, 'ring', 0, 0, 0, 7, 0.6, 32, 7, true);
    makeFlag(S.root, 0, peak + 3, 0, '#f2c21a', 1.4, 0.8, 1.5);
    sign(S, a.label || 'THE GRAND CIRCUS', Math.cos(5.5 / n * TAU) * (R + 0.2), H + 1, Math.sin(5.5 / n * TAU) * (R + 0.2), 8, { fg: '#f2c21a', bg: '#8a1a1a', glow: 0.6, rotY: -(5.5 / n * TAU) + HALF });
    addLight(S, [0, 10, 0], '#ffe0b0', 2.5, 22, false);
    yield;
    return finish(S, mats, { name: 'Circus tent', height: peak + 4, hw: R + 1, hd: R + 1, falloff: 4 });
  },
};

export const CIVIC_KINDS = [...Object.keys(KINDS).filter((k) => k !== 'classic'), 'library', 'museum', 'bank', 'cityHall', 'courthouse', 'postOffice', 'capitol'];

export function* buildCivic(ctx, item, rng, kind) {
  const S = makeState(ctx, item, rng);
  ctx.stage('plan', 'Designing the ' + (item.concept || kind));
  yield;
  if (KINDS[kind]) return yield* KINDS[kind](S);
  return yield* KINDS.classic(S, kind);
}

export const civicGen = {
  maxCount: 4,
  estimate: (item) => ({ stadium: 8, airport: 6, powerPlant: 5, palace: 7, trainStation: 5 }[item.params.kind] || 4),
  stages: () => [{ name: 'plan', label: 'Planning', weight: 0.3 }, { name: 'geometry', label: 'Construction', weight: 5 }, { name: 'interior', label: 'Fitting out', weight: 1 }, { name: 'optimize', label: 'Merging geometry', weight: 0.5 }],
  *build(ctx, item, rng) {
    return yield* buildCivic(ctx, item, rng, item.params.kind || 'cityHall');
  },
};
