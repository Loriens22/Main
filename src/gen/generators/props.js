// ---------------------------------------------------------------------------
// Props: small and medium objects. Most are physical (pick up with E, throw
// with a click, kick balls around); some are interactive (open chests and
// gifts, spin globes, sit by the campfire, read signs).
//
// Shapes are built from lathe profiles, extrusions and primitives with the
// shared procedural PBR materials; dimensions, colours and details are
// randomised from the seed, and prompt attributes (colour, material, size,
// label text) are honoured.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { markNoAO } from '../../render/renderer.js';
import { attachFire, seatWorldFn, sitNearest } from './furniture.js';
import { attachPhysics } from './physics.js';
import { animate, labelTexture, glowSprite, glowTexture, hsl, boxUV, makeFlag } from './common.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const V2 = (x, y) => new THREE.Vector2(x, y);

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
function lathe(pts, segs = 24, uvScale = 1) {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => V2(Math.max(0.0005, x), y)), segs);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale * 0.5);
  return g;
}
function box(w, h, d) { return boxUV(new THREE.BoxGeometry(w, h, d), w, h, d); }
function userCol(a, fallback) { return a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : fallback; }
function userMat(a, type, opts = {}) {
  const mt = a.materials && a.materials[0];
  if (mt) return G.materials.get(mt, { color: a.primaryColor && !['glass', 'gold', 'chrome'].includes(mt) ? a.primaryColor : undefined });
  return G.materials.get(type, { ...opts, color: userCol(a, opts.color) });
}
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }

// Every builder returns { group, height, radius, name, phys?, collider?, extra... }
const P = {
  crate(a, r) {
    const s = r.range(0.55, 0.8);
    const g = new THREE.Group();
    const wood = userMat(a, 'planks', { seed: r.int(0, 2) });
    const frame = G.materials.get('darkWood');
    g.add(mesh(box(s, s, s), wood));
    const t = s * 0.08;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const m = mesh(box(t, s + 0.01, t), frame); m.position.set(x * (s / 2 - t / 2 + 0.005), 0, z * (s / 2 - t / 2 + 0.005)); g.add(m); }
    for (const y of [-1, 1]) for (const z of [-1, 1]) { const m = mesh(box(s + 0.01, t, t), frame); m.position.set(0, y * (s / 2 - t / 2), z * (s / 2 - t / 2 + 0.005)); g.add(m); }
    for (const y of [-1, 1]) for (const x of [-1, 1]) { const m = mesh(box(t, t, s + 0.01), frame); m.position.set(x * (s / 2 - t / 2 + 0.005), y * (s / 2 - t / 2), 0); g.add(m); }
    g.children.forEach((c) => (c.position.y += s / 2));
    return { group: g, height: s, radius: s * 0.6, name: 'Wooden crate', phys: { mass: 8, radius: s * 0.55 }, collider: { type: 'box', x: 0, z: 0, y0: 0, y1: s, hx: s / 2, hz: s / 2 } };
  },
  barrel(a, r) {
    const h = r.range(0.85, 1.0), rad = h * 0.32;
    const g = new THREE.Group();
    const prof = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([rad * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * h]); }
    const body = mesh(lathe([[0, 0], ...prof, [0, h]], 28, 1), userMat(a, 'planks', { seed: 2 }));
    g.add(body);
    const iron = G.materials.get('iron');
    for (const t of [0.1, 0.3, 0.7, 0.9]) { const rr = rad * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.006; const hoop = mesh(new THREE.CylinderGeometry(rr, rr, 0.035, 28, 1, true), iron); hoop.position.y = t * h; g.add(hoop); }
    return { group: g, height: h, radius: rad, name: 'Barrel', phys: { mass: 10, radius: rad }, collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: h, r: rad } };
  },
  chest(a, r) {
    const w = r.range(0.8, 1.0), d = w * 0.6, h = w * 0.45;
    const g = new THREE.Group();
    const wood = userMat(a, 'darkWood'), metal = G.materials.get('gold');
    const base = mesh(box(w, h, d), wood); base.position.y = h / 2; g.add(base);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) { const b = mesh(box(0.05, h + 0.01, d + 0.01), metal); b.position.set(x, h / 2, 0); g.add(b); }
    // Treasure inside.
    const coins = mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.45, 0.04, 20), G.materials.get('gold'));
    coins.scale.z = d / w; coins.position.y = h - 0.05; g.add(coins);
    const glow = glowSprite('#ffd060', w * 1.2, 0); glow.position.y = h + 0.1; g.add(glow);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, h, -d / 2);
    const lidGeo = new THREE.CylinderGeometry(d / 2, d / 2, w, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    const lid = mesh(lidGeo, wood); lid.position.set(0, 0, d / 2);
    lidPivot.add(lid);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) {
      const band = mesh(new THREE.CylinderGeometry(d / 2 + 0.006, d / 2 + 0.006, 0.05, 20, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), metal);
      band.position.set(x, 0, d / 2); lidPivot.add(band);
    }
    g.add(lidPivot);
    let open = 0, target = 0;
    return {
      group: g, height: h + d / 2, radius: w * 0.6, name: 'Treasure chest', phys: { mass: 15, radius: w * 0.5, pickup: false, kick: 0 },
      collider: { type: 'box', x: 0, z: 0, y0: 0, y1: h, hx: w / 2, hz: d / 2 },
      interact: { label: () => (target ? 'Close chest' : 'Open chest'), action: () => { target = target ? 0 : 1; if (G.audio) G.audio.play('door'); } },
      tick: (dt) => { open += (target - open) * Math.min(1, dt * 5); lidPivot.rotation.x = -open * 1.9; glow.material.opacity = open * 0.8; },
    };
  },
  ball(a, r) {
    const kind = has(a, 'basketball') ? 'basket' : has(a, 'beach') ? 'beach' : has(a, 'tennis') ? 'tennis' : has(a, 'bowling') ? 'bowling' : has(a, 'soccer', 'football') ? 'soccer' : r.pick(['soccer', 'beach', 'basket', 'plain']);
    const rad = { basket: 0.12, beach: 0.25, tennis: 0.034, bowling: 0.11, soccer: 0.11, plain: 0.15 }[kind] * (a.sizeMul || 1);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const gx = cv.getContext('2d');
    const col = userCol(a, null);
    if (kind === 'soccer') {
      gx.fillStyle = '#f4f4f4'; gx.fillRect(0, 0, 512, 256); gx.fillStyle = '#141414';
      for (let i = 0; i < 12; i++) { const x = (i % 6) * 85 + (Math.floor(i / 6) % 2) * 42, y = 64 + Math.floor(i / 6) * 128; gx.beginPath(); for (let k = 0; k < 5; k++) { const an = k / 5 * TAU; gx.lineTo(x + Math.cos(an) * 26, y + Math.sin(an) * 26 * 0.9); } gx.fill(); }
    } else if (kind === 'beach') {
      const cols = ['#e83a3a', '#f4f4f4', '#3a7ae8', '#f4f4f4', '#f0c020', '#f4f4f4'];
      cols.forEach((c, i) => { gx.fillStyle = c; gx.fillRect(i * 512 / 6, 0, 512 / 6 + 1, 256); });
    } else if (kind === 'basket') {
      gx.fillStyle = col || '#d86a20'; gx.fillRect(0, 0, 512, 256); gx.strokeStyle = '#1a1a1a'; gx.lineWidth = 5;
      gx.beginPath(); gx.moveTo(0, 128); gx.lineTo(512, 128); gx.moveTo(128, 0); gx.lineTo(128, 256); gx.moveTo(384, 0); gx.lineTo(384, 256); gx.stroke();
    } else if (kind === 'tennis') { gx.fillStyle = '#d8f040'; gx.fillRect(0, 0, 512, 256); gx.strokeStyle = '#fff'; gx.lineWidth = 8; gx.beginPath(); for (let x = 0; x <= 512; x += 8) gx.lineTo(x, 128 + Math.sin(x / 512 * TAU * 2) * 60); gx.stroke(); }
    else { gx.fillStyle = col || hsl(r.next(), 0.8, 0.5); gx.fillRect(0, 0, 512, 256); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = mesh(new THREE.SphereGeometry(rad, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'bowling' ? 0.15 : 0.55, color: kind === 'bowling' ? (col || '#2a2a6a') : '#ffffff' }));
    m.position.y = rad;
    const g = new THREE.Group(); g.add(m);
    // The pivot for rolling is the sphere centre, so offset the whole group.
    g.children[0].position.y = 0; g.position.y = rad;
    const holder = new THREE.Group(); holder.add(g);
    return { group: holder, height: rad * 2, radius: rad, name: { soccer: 'Soccer ball', beach: 'Beach ball', basket: 'Basketball', tennis: 'Tennis ball', bowling: 'Bowling ball', plain: 'Ball' }[kind], phys: { mass: kind === 'bowling' ? 7 : kind === 'beach' ? 0.2 : 0.45, radius: rad, roll: true, restitution: kind === 'bowling' ? 0.1 : kind === 'beach' ? 0.75 : 0.65, friction: 2.2, kick: 1.2 }, rollPivot: g, rollRadius: rad };
  },
  campfire(a, r) {
    const g = new THREE.Group();
    const stone = G.materials.get('stone', { vertexColors: false });
    const n = r.int(9, 12);
    for (let i = 0; i < n; i++) { const an = (i / n) * TAU; const s = mesh(new THREE.DodecahedronGeometry(r.range(0.1, 0.15), 0), stone); s.position.set(Math.cos(an) * 0.55, 0.06, Math.sin(an) * 0.55); s.rotation.set(r.next() * 3, r.next() * 3, 0); s.scale.y = 0.7; g.add(s); }
    const logMat = G.materials.get('logs');
    const logGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.75, 8).translate(0, 0.375, 0);
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * TAU + r.range(-0.2, 0.2);
      const hold = new THREE.Group(); hold.position.set(Math.cos(an) * 0.32, 0, Math.sin(an) * 0.32); hold.rotation.y = -an;
      const lg = mesh(logGeo, logMat); lg.rotation.z = 0.72; hold.add(lg); g.add(hold);
    }
    const ember = mesh(new THREE.CircleGeometry(0.3, 16), G.materials.get('emissive', { color: '#ff5a10', emissiveIntensity: 2.5 }), false);
    ember.rotation.x = -Math.PI / 2; ember.position.y = 0.02; g.add(ember);
    attachFire(g, [0, 0.12, 0], 1.3);
    // Seating logs around the fire.
    const seats = [];
    const seatMat = G.materials.get('bark');
    for (let i = 0; i < 3; i++) {
      const an = (i / 3) * TAU + 0.5;
      const holder = new THREE.Group(); holder.rotation.y = an; holder.position.set(Math.cos(an) * 1.9, 0, -Math.sin(an) * 1.9);
      const l2 = mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.4, 12), seatMat); l2.rotation.z = Math.PI / 2; l2.position.y = 0.18; holder.add(l2);
      g.add(holder);
      const faceYaw = Math.atan2(-holder.position.x, -holder.position.z);
      seats.push({ x: holder.position.x, z: holder.position.z, y: 0.36, yaw: faceYaw, floorY: 0 });
    }
    // Smoke.
    const smoke = smokeColumn(g, [0, 0.8, 0], 1);
    return { group: g, height: 1.2, radius: 2.3, name: 'Campfire', seats, lights: [{ pos: [0, 0.6, 0], color: '#ff9a40', intensity: 4.5, distance: 12, nightOnly: false, flicker: true }], smoke, collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.3, r: 0.55 }, noPickup: true };
  },
  torch(a, r) {
    const g = new THREE.Group();
    const h = r.range(1.4, 1.8);
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 8), G.materials.get('darkWood')); pole.position.y = h / 2; g.add(pole);
    const cup = mesh(lathe([[0, 0], [0.05, 0], [0.1, 0.12], [0.11, 0.15], [0.09, 0.15]], 12), G.materials.get('iron')); cup.position.y = h; g.add(cup);
    attachFire(g, [0, h + 0.1, 0], 0.55);
    return { group: g, height: h + 0.5, radius: 0.2, name: 'Torch', lights: [{ pos: [0, h + 0.35, 0], color: '#ffa050', intensity: 3, distance: 10, nightOnly: false, flicker: true }], collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: h, r: 0.05 }, noPickup: true };
  },
  fountain(a, r) {
    const g = new THREE.Group();
    const R = r.range(1.6, 2.4) * clamp(a.sizeMul || 1, 0.5, 3);
    const stone = userMat(a, r.pick(['marble', 'stone', 'granite']));
    g.add(mesh(lathe([[0, 0], [R, 0], [R, 0.55], [R - 0.2, 0.6], [R - 0.25, 0.2], [0, 0.2]], 40, 2), stone));
    const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.24, 40), G.materials.get('water', { color: '#6ab0c8', opacity: 0.75 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.45; g.add(water);
    const col = mesh(lathe([[0.2, 0], [0.16, 0.8], [0.1, 1.3], [0.12, 1.45]], 16), stone); g.add(col);
    const tier = mesh(lathe([[0, 0], [R * 0.45, 0], [R * 0.45, 0.12], [R * 0.4, 0.16], [0.1, 0.05]], 32), stone); tier.position.y = 1.4; g.add(tier);
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(R * 0.4, 32), G.materials.get('water', { color: '#6ab0c8', opacity: 0.7 })); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.53; g.add(w2);
    const top = mesh(lathe([[0.1, 0], [0.07, 0.4], [0.12, 0.5], [0, 0.6]], 12), stone); top.position.y = 1.55; g.add(top);
    // Water jets: particles on ballistic arcs.
    const N = 600;
    const pg = new THREE.BufferGeometry();
    const pp = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#dff4ff', size: 0.05, transparent: true, opacity: 0.7, depthWrite: false, map: glowTexture() }));
    pts.frustumCulled = false; pts.userData.noRaycast = true; markNoAO(pts);
    g.add(pts);
    const tick = (dt, t) => {
      for (let i = 0; i < N; i++) {
        const life = (seeds[i] + t * 0.8) % 1;
        const an = seeds[i] * 97;
        if (i % 3 === 0) {
          // Top spout: up then outwards down into the upper tier.
          const tt = life * 1.1, v = 2.2, out = 0.55;
          pp[i * 3] = Math.cos(an) * out * tt; pp[i * 3 + 2] = Math.sin(an) * out * tt; pp[i * 3 + 1] = 2.1 + v * tt - 4.9 * tt * tt;
        } else {
          // Overflow curtain from the upper tier into the basin.
          const tt = life * 0.55, rr = R * 0.45 + tt * 0.35;
          pp[i * 3] = Math.cos(an) * rr; pp[i * 3 + 2] = Math.sin(an) * rr; pp[i * 3 + 1] = 1.52 - 4.9 * tt * tt;
        }
      }
      pg.attributes.position.needsUpdate = true;
    };
    return { group: g, height: 2.2, radius: R + 0.2, name: 'Fountain', tick, collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.6, r: R }, noPickup: true, flatten: true };
  },
  sign(a, r) {
    const g = new THREE.Group();
    const text = a.label || r.pick(['Welcome!', 'Keep Out', 'Genesis Valley', 'Beware of Dragons', 'This Way →', 'Lake ↗', 'Camp Site', 'Hello World']);
    const w = clamp(0.5 + text.length * 0.09, 1, 3.2), h = 0.7;
    const wood = G.materials.get('wood');
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) { const p = mesh(new THREE.CylinderGeometry(0.05, 0.06, 2, 8), wood); p.position.set(x, 1, -0.02); g.add(p); }
    const board = mesh(box(w, h, 0.06), wood); board.position.y = 1.55; g.add(board);
    const tex = labelTexture(text, { bg: userCol(a, '#6a4a2a'), fg: '#f4ecd8', border: '#3a2a18', w: 1024, h: 256 });
    for (const s of [1, -1]) { const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); face.position.set(0, 1.55, s * 0.031); if (s < 0) face.rotation.y = Math.PI; g.add(face); }
    return { group: g, height: 1.95, radius: w / 2, name: `Sign: “${text}”`, collider: { type: 'box', x: 0, z: 0, y0: 0, y1: 1.9, hx: w / 2, hz: 0.06 }, noPickup: true, interact: { label: () => `Read: “${text}”`, action: () => G.ui.toast(`The sign says: “${text}”`) } };
  },
  mailbox(a, r) {
    const g = new THREE.Group();
    const post = mesh(box(0.1, 1.1, 0.1), G.materials.get('wood')); post.position.y = 0.55; g.add(post);
    const col = userCol(a, r.pick(['#2a4a8a', '#c02020', '#1a1a1a', '#e8e8e8']));
    const shape = new THREE.Shape(); shape.moveTo(-0.14, 0); shape.lineTo(0.14, 0); shape.lineTo(0.14, 0.16); shape.absarc(0, 0.16, 0.14, 0, Math.PI, false); shape.lineTo(-0.14, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.48, bevelEnabled: false }); geo.translate(0, 0, -0.24);
    const bx = mesh(geo, G.materials.get('painted', { color: col })); bx.position.y = 1.1; g.add(bx);
    const flag = mesh(box(0.02, 0.2, 0.08), G.materials.get('painted', { color: '#d02020' })); flag.position.set(0.16, 1.3, -0.05); g.add(flag);
    return { group: g, height: 1.42, radius: 0.3, name: 'Mailbox', collider: { type: 'box', x: 0, z: 0, y0: 0, y1: 1.4, hx: 0.15, hz: 0.25 }, noPickup: true };
  },
  sword(a, r) {
    const g = new THREE.Group();
    const L = r.range(0.8, 1.05);
    const bladeShape = new THREE.Shape();
    const bw = 0.028;
    bladeShape.moveTo(-bw, 0); bladeShape.lineTo(bw, 0); bladeShape.lineTo(bw * 0.9, L * 0.85); bladeShape.lineTo(0, L); bladeShape.lineTo(-bw * 0.9, L * 0.85); bladeShape.lineTo(-bw, 0);
    const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.012, bevelSegments: 1 });
    blade.translate(0, 0, -0.003);
    const magic = has(a, 'magic', 'glowing', 'legendary', 'enchanted') || a.flags.glow;
    const bm = mesh(blade, magic ? G.materials.get('emissive', { color: userCol(a, '#60c0ff'), emissiveIntensity: 1.5 }) : G.materials.get(a.materials[0] || 'chrome'));
    bm.position.y = 0.2; g.add(bm);
    const guard = mesh(box(0.22, 0.03, 0.04), G.materials.get('gold')); guard.position.y = 0.2; g.add(guard);
    const grip = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 10), G.materials.get('leather')); grip.position.y = 0.1; g.add(grip);
    const pommel = mesh(new THREE.SphereGeometry(0.03, 12, 8), G.materials.get('gold')); pommel.position.y = 0.0; g.add(pommel);
    const inStone = has(a, 'stone', 'rock') || r.chance(0.35);
    const root = new THREE.Group();
    if (inStone) {
      const stone = mesh(new THREE.DodecahedronGeometry(0.45, 1), G.materials.get('stone')); stone.scale.set(1.2, 0.7, 1); stone.position.y = 0.25; root.add(stone);
      g.rotation.set(Math.PI, 0, 0); g.position.y = 0.45 + L * 0.8;
    } else { g.rotation.z = Math.PI / 2; g.position.y = 0.04; }
    root.add(g);
    if (magic) { const gl = glowSprite(userCol(a, '#60c0ff'), 1.2, 0.5); gl.position.copy(g.position); root.add(gl); }
    return { group: root, height: inStone ? 0.45 + L : 0.1, radius: inStone ? 0.6 : L * 0.5, name: inStone ? 'Sword in the stone' : magic ? 'Enchanted sword' : 'Sword', phys: inStone ? null : { mass: 1.5, radius: 0.1 }, collider: inStone ? { type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.5, r: 0.5 } : null, noPickup: inStone, lights: magic ? [{ pos: [0, 0.6, 0], color: userCol(a, '#60c0ff'), intensity: 1.5, distance: 5 }] : null };
  },
  guitar(a, r) {
    const g = new THREE.Group();
    const col = userCol(a, r.pick(['#8a3a1a', '#1a1a1a', '#c8a060', '#a01818', '#2a4aa0']));
    const s = new THREE.Shape();
    const pts = [];
    for (let i = 0; i <= 48; i++) { const t = (i / 48) * TAU; const y = Math.sin(t); const lobe = y > 0 ? 0.15 : 0.19; const waist = 1 - 0.18 * Math.exp(-Math.pow(y * 3, 2)); pts.push(V2(Math.cos(t) * lobe * waist, y * 0.25 + 0.25)); }
    s.setFromPoints(pts);
    const body = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    const bm = mesh(body, G.materials.get('glossyPlastic', { color: col })); g.add(bm);
    const hole = mesh(new THREE.CircleGeometry(0.045, 20), G.materials.plain('#0a0806', 0.9)); hole.position.set(0, 0.3, 0.111); g.add(hole);
    const neck = mesh(box(0.05, 0.5, 0.03), G.materials.get('darkWood')); neck.position.set(0, 0.72, 0.1); g.add(neck);
    const head = mesh(box(0.08, 0.14, 0.03), G.materials.get('darkWood')); head.position.set(0, 1.02, 0.095); g.add(head);
    for (let i = 0; i < 6; i++) { const st = mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.8, 3), G.materials.get('chrome')); st.position.set(-0.018 + i * 0.007, 0.6, 0.12); g.add(st); }
    g.rotation.x = -Math.PI / 2 + 0.05; g.position.y = 0.12;
    const root = new THREE.Group(); root.add(g);
    return { group: root, height: 0.2, radius: 0.55, name: 'Guitar', phys: { mass: 2.5, radius: 0.2 } };
  },
  tool(a, r) {
    const kind = has(a, 'hammer') ? 'hammer' : has(a, 'axe') ? 'axe' : has(a, 'wrench') ? 'wrench' : has(a, 'shovel', 'spade') ? 'shovel' : has(a, 'saw') ? 'saw' : r.pick(['hammer', 'axe', 'wrench', 'shovel']);
    const g = new THREE.Group();
    const wood = G.materials.get('wood'), steel = G.materials.get('steel');
    if (kind === 'hammer') { const h = mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.33, 8), wood); h.position.y = 0.165; g.add(h); const hd = mesh(box(0.12, 0.035, 0.035), steel); hd.position.y = 0.33; g.add(hd); }
    else if (kind === 'axe') { const h = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.7, 8), wood); h.position.y = 0.35; g.add(h); const s = new THREE.Shape(); s.moveTo(0, -0.04); s.lineTo(0.14, -0.08); s.quadraticCurveTo(0.17, 0, 0.14, 0.08); s.lineTo(0, 0.04); const b = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }), steel); b.position.set(0.01, 0.64, -0.006); g.add(b); }
    else if (kind === 'wrench') { const h = mesh(box(0.025, 0.25, 0.008), steel); h.position.y = 0.125; g.add(h); const e = mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 16, Math.PI * 1.5), steel); e.position.y = 0.27; g.add(e); }
    else if (kind === 'shovel') { const h = mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.0, 8), wood); h.position.y = 0.6; g.add(h); const b = mesh(box(0.2, 0.26, 0.01), steel); b.position.y = 0.05; g.add(b); const t = mesh(box(0.12, 0.02, 0.02), wood); t.position.y = 1.1; g.add(t); }
    else { const b = mesh(box(0.45, 0.1, 0.004), steel); b.position.set(0.22, 0.05, 0); g.add(b); const hnd = mesh(box(0.1, 0.12, 0.03), wood); hnd.position.set(-0.02, 0.07, 0); g.add(hnd); }
    const root = new THREE.Group(); g.rotation.z = Math.PI / 2; g.position.y = 0.03; root.add(g);
    return { group: root, height: 0.08, radius: 0.35, name: kind[0].toUpperCase() + kind.slice(1), phys: { mass: 1.2, radius: 0.08 } };
  },
  food(a, r) {
    const kind = ['pizza', 'cake', 'burger', 'donut', 'apple', 'bread', 'ice cream', 'banana', 'watermelon', 'cookie'].find((k) => a.text.includes(k)) || r.pick(['pizza', 'cake', 'burger', 'donut', 'apple', 'watermelon']);
    const g = new THREE.Group();
    const plain = (c, rough = 0.6) => G.materials.plain(c, rough, 0);
    let h = 0.1, rad = 0.15, name = kind;
    if (kind === 'pizza') {
      const base = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32), plain('#d89a50', 0.8)); base.position.y = 0.01; g.add(base);
      const sauce = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.005, 32), plain('#c83a1a', 0.5)); sauce.position.y = 0.022; g.add(sauce);
      const cheese = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.004, 32), plain('#f4d880', 0.4)); cheese.position.y = 0.026; g.add(cheese);
      for (let i = 0; i < 9; i++) { const p = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), plain('#a02a1a', 0.5)); const an = r.range(0, TAU), rr = r.range(0, 0.13); p.position.set(Math.cos(an) * rr, 0.03, Math.sin(an) * rr); g.add(p); }
      rad = 0.2; h = 0.035; name = 'Pizza';
    } else if (kind === 'cake') {
      const col = userCol(a, r.pick(['#f4c8d8', '#f4ecd8', '#6a3a2a', '#f8f0e0']));
      const t1 = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 32), plain(col, 0.5)); t1.position.y = 0.06; g.add(t1);
      const t2 = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 32), plain(col, 0.5)); t2.position.y = 0.17; g.add(t2);
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; const d = mesh(new THREE.SphereGeometry(0.015, 8, 6), plain('#ffffff', 0.4)); d.position.set(Math.cos(an) * 0.155, 0.12, Math.sin(an) * 0.155); g.add(d); }
      for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU; const c = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6), plain(hsl(i / 5, 0.7, 0.6))); c.position.set(Math.cos(an) * 0.06, 0.25, Math.sin(an) * 0.06); g.add(c); attachFire(g, [Math.cos(an) * 0.06, 0.28, Math.sin(an) * 0.06], 0.05); }
      h = 0.3; name = 'Birthday cake';
    } else if (kind === 'burger') {
      const layers = [['#c8883a', 0.03, 0.1], ['#5a3018', 0.025, 0.105], ['#f0c020', 0.008, 0.11], ['#40a030', 0.01, 0.11], ['#c83a2a', 0.012, 0.095]];
      let y = 0;
      for (const [c, th, rr] of layers) { const m = mesh(new THREE.CylinderGeometry(rr, rr, th, 24), plain(c, 0.6)); m.position.y = y + th / 2; g.add(m); y += th; }
      const top = mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, TAU, 0, Math.PI / 2), plain('#c8883a', 0.5)); top.scale.y = 0.6; top.position.y = y; g.add(top);
      h = y + 0.06; rad = 0.11; name = 'Burger';
    } else if (kind === 'donut') {
      const d = mesh(new THREE.TorusGeometry(0.06, 0.035, 16, 32), plain('#d8a060', 0.6)); d.rotation.x = Math.PI / 2; d.position.y = 0.035; g.add(d);
      const icing = mesh(new THREE.TorusGeometry(0.06, 0.036, 12, 32, TAU), plain(userCol(a, '#f080b0'), 0.3)); icing.rotation.x = Math.PI / 2; icing.position.y = 0.045; icing.scale.z = 0.6; g.add(icing);
      h = 0.07; rad = 0.1; name = 'Donut';
    } else if (kind === 'apple') {
      const ap = mesh(lathe([[0, 0.01], [0.03, 0], [0.045, 0.02], [0.048, 0.05], [0.04, 0.08], [0.015, 0.09], [0, 0.085]], 20), plain(userCol(a, r.pick(['#c81a1a', '#6ab02a', '#e8c020'])), 0.35)); g.add(ap);
      const st = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 5), plain('#4a2a10')); st.position.y = 0.095; g.add(st);
      h = 0.1; rad = 0.05; name = 'Apple';
    } else if (kind === 'watermelon') {
      const wm = mesh(new THREE.SphereGeometry(0.18, 24, 16), plain('#2a6a1a', 0.4)); wm.scale.set(1, 0.85, 1.25); wm.position.y = 0.15; g.add(wm);
      h = 0.3; rad = 0.22; name = 'Watermelon';
    } else {
      const b = mesh(new THREE.CapsuleGeometry(0.06, 0.18, 6, 12), plain('#c8883a', 0.7)); b.rotation.z = Math.PI / 2; b.position.y = 0.06; g.add(b); h = 0.12; rad = 0.15; name = kind[0].toUpperCase() + kind.slice(1);
    }
    // A plate under most foods.
    if (kind !== 'apple' && kind !== 'watermelon') { const plate = mesh(lathe([[0, 0], [rad + 0.05, 0.003], [rad + 0.07, 0.015], [rad + 0.06, 0.016], [0, 0.006]], 32), G.materials.get('glossyPlastic', { color: '#f4f4f2' })); g.add(plate); g.children.forEach((c) => { if (c !== plate) c.position.y += 0.01; }); }
    return { group: g, height: h, radius: rad + 0.05, name, phys: { mass: 0.5, radius: rad } };
  },
  cup(a, r) {
    const g = new THREE.Group();
    const col = userCol(a, r.pick(['#f4f4f2', '#2a4a8a', '#c83a2a', '#1a1a1a', '#e8c040']));
    const cup = mesh(lathe([[0, 0], [0.04, 0], [0.045, 0.01], [0.05, 0.1], [0.046, 0.1], [0.041, 0.012], [0, 0.012]], 24), G.materials.get('glossyPlastic', { color: col }));
    g.add(cup);
    const handle = mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 16, Math.PI * 1.2), G.materials.get('glossyPlastic', { color: col })); handle.rotation.z = -Math.PI * 0.6; handle.position.set(0.05, 0.055, 0); g.add(handle);
    const coffee = mesh(new THREE.CircleGeometry(0.044, 20), G.materials.plain('#3a2010', 0.15)); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.09; g.add(coffee);
    smokeColumn(g, [0, 0.12, 0], 0.15);
    return { group: g, height: 0.1, radius: 0.06, name: 'Cup of coffee', phys: { mass: 0.3, radius: 0.05 } };
  },
  book(a, r) {
    const g = new THREE.Group();
    const n = has(a, 'stack', 'pile') || a.count > 1 ? 1 : 1;
    const col = userCol(a, r.pick(['#7a1a1a', '#1a3a6a', '#2a5a2a', '#5a3a1a', '#2a2a2a']));
    const w = 0.17, h = 0.24, t = r.range(0.03, 0.06);
    const cover = G.materials.get('leather', { color: col });
    const pages = G.materials.plain('#f2ead8', 0.9);
    const b = new THREE.Group();
    const c1 = mesh(box(w, t * 0.12, h), cover); c1.position.y = t * 0.06; b.add(c1);
    const c2 = mesh(box(w, t * 0.12, h), cover); c2.position.y = t - t * 0.06; b.add(c2);
    const sp = mesh(box(0.01, t, h), cover); sp.position.set(-w / 2, t / 2, 0); b.add(sp);
    const pg = mesh(box(w - 0.012, t * 0.78, h - 0.01), pages); pg.position.set(0.004, t / 2, 0); b.add(pg);
    const title = a.label || r.pick(['Grimoire', 'Atlas', 'Poems', 'The Book', 'Recipes', 'Secrets', 'Journal']);
    const tex = labelTexture(title, { fg: '#e8c870', w: 512, h: 128 });
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.6, roughness: 0.3 }));
    tl.rotation.x = -Math.PI / 2; tl.position.y = t + 0.001; b.add(tl);
    g.add(b);
    void n;
    return { group: g, height: t, radius: 0.15, name: `Book: ${title}`, phys: { mass: 0.8, radius: 0.12 }, interact: { label: () => `Read “${title}”`, action: () => G.ui.toast(r.pick([`“${title}”: Chapter 1. It was a quiet day in the valley…`, `The pages of “${title}” are full of strange diagrams.`, `“${title}” — someone scribbled: “type anything, and it shall be.”`])) } };
  },
  gift(a, r) {
    const g = new THREE.Group();
    const s = r.range(0.35, 0.55) * clamp(a.sizeMul || 1, 0.3, 4);
    const col = userCol(a, r.pick(['#c81a2a', '#1a5ac8', '#2a9a3a', '#8a2ac8', '#e8a020']));
    const ribbon = G.materials.get('glossyPlastic', { color: r.pick(['#f0d040', '#f4f4f4', '#d8d8e0']) });
    const boxM = mesh(box(s, s * 0.8, s), G.materials.get('glossyPlastic', { color: col })); boxM.position.y = s * 0.4; g.add(boxM);
    const lidP = new THREE.Group(); lidP.position.y = s * 0.8;
    const lid = mesh(box(s * 1.06, s * 0.14, s * 1.06), G.materials.get('glossyPlastic', { color: col })); lid.position.y = s * 0.07; lidP.add(lid);
    for (const rot of [0, Math.PI / 2]) { const rb = mesh(box(s * 1.08, s * 0.16, s * 0.12), ribbon); rb.rotation.y = rot; rb.position.y = s * 0.07; lidP.add(rb); const rs = mesh(box(s * 1.01, s * 0.8, s * 0.1), ribbon); rs.rotation.y = rot; rs.position.y = -s * 0.4; lidP.add(rs); }
    for (const sgn of [-1, 1]) { const bow = mesh(new THREE.TorusGeometry(s * 0.1, s * 0.03, 8, 16), ribbon); bow.position.set(sgn * s * 0.1, s * 0.2, 0); bow.rotation.y = Math.PI / 2; bow.rotation.z = sgn * 0.5; lidP.add(bow); }
    g.add(lidP);
    let opened = false, t0 = 0;
    const confetti = [];
    return {
      group: g, height: s, radius: s * 0.7, name: 'Gift box', phys: { mass: 1, radius: s * 0.55 },
      interact: {
        label: () => (opened ? null : 'Open the gift'),
        action: (e) => {
          if (opened) return;
          opened = true; t0 = G.time;
          if (G.audio) G.audio.play('firework', e.root.position);
          burstConfetti(e.root, s, confetti);
          const surprises = ['a golden retriever puppy', 'a golden trophy', 'three colorful balloons', 'a birthday cake', 'a cute cat', 'a glowing crystal', 'a guitar', 'a red beach ball', 'a small robot', 'a treasure chest'];
          const pick = surprises[Math.floor(Math.random() * surprises.length)];
          setTimeout(() => { G.ui.toast(`🎁 It's ${pick}!`, 'good'); G.ui.hooks.onCommand(pick + ' next to it', null); }, 700);
        },
      },
      tick: (dt, t) => { if (opened) { const k = Math.min(1, (G.time - t0) * 2.5); lidP.position.y = s * 0.8 + k * s * 1.2; lidP.rotation.z = k * 1.2; lidP.rotation.x = k * 0.6; for (const c of confetti) c(dt); } },
    };
  },
  balloon(a, r) {
    const g = new THREE.Group();
    const n = has(a, 'balloons', 'bunch', 'bouquet') || (a.withCounts && a.withCounts.balloon > 1) ? r.int(3, 7) : 1;
    const holders = [];
    for (let i = 0; i < n; i++) {
      const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : hsl(r.next(), 0.85, 0.55);
      const b = mesh(lathe([[0, 0], [0.02, 0.005], [0.12, 0.08], [0.16, 0.2], [0.14, 0.3], [0.08, 0.36], [0, 0.38]], 20), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.15, clearcoat: 1, transmission: 0, sheen: 0.3 }));
      const holder = new THREE.Group();
      const H = 1.4 + r.range(0, 0.6), off = n > 1 ? r.range(-0.25, 0.25) : 0, offz = n > 1 ? r.range(-0.25, 0.25) : 0;
      holder.position.set(off, H, offz);
      holder.add(b);
      const knot = mesh(new THREE.ConeGeometry(0.015, 0.03, 6), b.material); knot.position.y = -0.005; knot.rotation.x = Math.PI; holder.add(knot);
      g.add(holder);
      const str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(off, H, offz)]), new THREE.LineBasicMaterial({ color: '#dddddd' }));
      g.add(str);
      holders.push({ holder, H, ph: r.range(0, 6), str, off, offz });
    }
    const weight = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 12), G.materials.get('iron')); weight.position.y = 0.03; g.add(weight);
    const tick = (dt, t) => {
      for (const h of holders) {
        const sx = Math.sin(t * 0.9 + h.ph) * 0.08, sz = Math.cos(t * 0.7 + h.ph) * 0.08;
        h.holder.position.set(h.off + sx, h.H + Math.sin(t * 1.3 + h.ph) * 0.04, h.offz + sz);
        h.holder.rotation.z = -sx * 0.8; h.holder.rotation.x = sz * 0.8;
        const p = h.str.geometry.attributes.position; p.setXYZ(1, h.holder.position.x, h.holder.position.y, h.holder.position.z); p.needsUpdate = true;
      }
    };
    return { group: g, height: 2, radius: 0.35, name: n > 1 ? 'Balloons' : 'Balloon', tick, phys: { mass: 0.3, radius: 0.1, kick: 0.2 } };
  },
  snowman(a, r) {
    const g = new THREE.Group();
    const snow = G.materials.get('snow');
    const s = clamp(a.sizeMul || 1, 0.3, 4);
    const radii = [0.45, 0.33, 0.23].map((x) => x * s * r.range(0.9, 1.1));
    let y = 0;
    const centers = [];
    for (const rr of radii) { y += rr * 0.85; const b = mesh(new THREE.SphereGeometry(rr, 24, 16), snow); b.position.y = y; b.scale.y = 0.92; g.add(b); centers.push(y); y += rr * 0.75; }
    const coal = G.materials.plain('#141414', 0.9);
    const hy = centers[2], hr = radii[2];
    for (const x of [-0.35, 0.35]) { const e = mesh(new THREE.SphereGeometry(0.022 * s, 8, 6), coal); e.position.set(x * hr, hy + hr * 0.25, hr * 0.92); g.add(e); }
    const nose = mesh(new THREE.ConeGeometry(0.03 * s, 0.18 * s, 10), G.materials.plain('#e8701a', 0.6)); nose.rotation.x = Math.PI / 2; nose.position.set(0, hy, hr + 0.08 * s); g.add(nose);
    for (let i = 0; i < 5; i++) { const an = -0.6 + i * 0.3; const m = mesh(new THREE.SphereGeometry(0.015 * s, 6, 4), coal); m.position.set(Math.sin(an) * hr * 0.6, hy - hr * 0.4 - Math.cos(an) * 0.03 * s, hr * 0.85); g.add(m); }
    for (let i = 0; i < 3; i++) { const b = mesh(new THREE.SphereGeometry(0.025 * s, 8, 6), coal); b.position.set(0, centers[1] + radii[1] * (0.4 - i * 0.35), radii[1] * 0.97); g.add(b); }
    for (const sgn of [-1, 1]) { const arm = mesh(new THREE.CylinderGeometry(0.012 * s, 0.018 * s, 0.6 * s, 5), G.materials.get('bark')); arm.position.set(sgn * (radii[1] + 0.2 * s), centers[1] + 0.1 * s, 0); arm.rotation.z = sgn * -1.0; g.add(arm); }
    const hat = mesh(new THREE.CylinderGeometry(hr * 0.7, hr * 0.7, hr * 0.8, 20), coal); hat.position.y = hy + hr * 1.1; g.add(hat);
    const brim = mesh(new THREE.CylinderGeometry(hr * 1.05, hr * 1.05, 0.03 * s, 20), coal); brim.position.y = hy + hr * 0.72; g.add(brim);
    const scarf = mesh(new THREE.TorusGeometry(hr * 0.95, 0.05 * s, 8, 24), G.materials.get('knit', { color: userCol(a, '#c02020') })); scarf.rotation.x = Math.PI / 2; scarf.position.y = hy - hr * 0.75; g.add(scarf);
    return { group: g, height: y + hr * 0.6, radius: radii[0], name: 'Snowman', collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: y, r: radii[0] * 0.9 }, noPickup: true };
  },
  trophy(a, r) {
    const g = new THREE.Group();
    const gold = userMat(a, 'gold');
    const cup = mesh(lathe([[0, 0], [0.09, 0], [0.09, 0.03], [0.03, 0.05], [0.02, 0.14], [0.05, 0.17], [0.11, 0.24], [0.13, 0.36], [0.12, 0.36], [0.1, 0.25], [0, 0.2]], 28), gold);
    const base = mesh(box(0.2, 0.08, 0.2), G.materials.get('blackMarble')); base.position.y = 0.04; cup.position.y = 0.08; g.add(base, cup);
    for (const sgn of [-1, 1]) { const hnd = mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 16, Math.PI), gold); hnd.position.set(sgn * 0.12, 0.36, 0); hnd.rotation.z = sgn > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(hnd); }
    return { group: g, height: 0.45, radius: 0.15, name: 'Trophy', phys: { mass: 1.5, radius: 0.1 } };
  },
  globe(a, r) {
    const g = new THREE.Group();
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const gx = cv.getContext('2d');
    gx.fillStyle = '#1e5a9a'; gx.fillRect(0, 0, 512, 256);
    // Continents from a few random blobs.
    for (let i = 0; i < 70; i++) { gx.fillStyle = r.pick(['#4a8a3a', '#6a9a4a', '#a89a60', '#3a7a2a']); gx.beginPath(); gx.ellipse(r.range(0, 512), r.range(40, 216), r.range(10, 45), r.range(8, 30), r.range(0, 3), 0, TAU); gx.fill(); }
    gx.fillStyle = '#f4f8fa'; gx.fillRect(0, 0, 512, 18); gx.fillRect(0, 238, 512, 18);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sphere = mesh(new THREE.SphereGeometry(0.2, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    const tilt = new THREE.Group(); tilt.rotation.z = 0.41; tilt.position.y = 0.45; tilt.add(sphere);
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 32, Math.PI * 1.3), G.materials.get('bronze')); ring.rotation.y = Math.PI / 2; tilt.add(ring);
    const stand = mesh(lathe([[0, 0], [0.12, 0], [0.12, 0.02], [0.03, 0.05], [0.02, 0.24], [0, 0.24]], 20), G.materials.get('darkWood'));
    g.add(stand, tilt);
    let spin = 0.3;
    return { group: g, height: 0.67, radius: 0.22, name: 'Globe', phys: { mass: 2, radius: 0.15 }, tick: (dt) => { sphere.rotation.y += spin * dt; spin += (0.3 - spin) * dt * 0.5; }, interact: { label: () => 'Spin the globe', action: () => { spin = 12; } } };
  },
  umbrella(a, r) {
    const g = new THREE.Group();
    const col = userCol(a, r.pick(['#c81a2a', '#1a1a1a', '#2a5ac8', '#f0c020']));
    const R = has(a, 'beach', 'patio', 'parasol') ? 1.3 : 0.55, H = R > 1 ? 2.3 : 0.95;
    const canopy = mesh(new THREE.ConeGeometry(R, R * 0.35, 8, 1, true), G.materials.get('fabric', { color: col, side: THREE.DoubleSide }));
    canopy.position.y = H; g.add(canopy);
    const pole = mesh(new THREE.CylinderGeometry(0.012 * (R > 1 ? 2.5 : 1), 0.012 * (R > 1 ? 2.5 : 1), H, 8), G.materials.get('chrome')); pole.position.y = H / 2; g.add(pole);
    if (R < 1) { const hook = mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI), G.materials.get('darkWood')); hook.position.y = 0.02; g.add(hook); }
    else { const base = mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.1, 16), G.materials.get('concrete')); base.position.y = 0.05; g.add(base); }
    return { group: g, height: H + R * 0.2, radius: R, name: R > 1 ? 'Beach umbrella' : 'Umbrella', phys: R > 1 ? null : { mass: 0.6, radius: 0.1 }, collider: R > 1 ? { type: 'cyl', x: 0, z: 0, y0: 0, y1: H, r: 0.06 } : null, noPickup: R > 1 };
  },
  flag(a, r) {
    const g = new THREE.Group();
    const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : hsl(r.next(), 0.8, 0.45);
    makeFlag(g, 0, 0, 0, col, 1.8, 1.1, 5, { text: a.label });
    return { group: g, height: 5.1, radius: 0.3, name: a.label ? `Flag: ${a.label}` : 'Flag', collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: 5, r: 0.05 }, noPickup: true };
  },
  gem(a, r) {
    const g = new THREE.Group();
    const s = 0.12 * clamp(a.sizeMul || 1, 0.3, 30);
    const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : r.pick(['#e01a3a', '#1a8ae0', '#20c060', '#9a3ae0', '#f0e040']);
    const geo = new THREE.OctahedronGeometry(s, 0); geo.scale(1, 1.3, 1);
    const m = mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.05, transmission: 0.6, thickness: s, ior: 2.2, emissive: col, emissiveIntensity: 0.4, flatShading: true }));
    m.position.y = s * 1.3;
    g.add(m);
    const gl = glowSprite(col, s * 6, 0.35); gl.position.y = s * 1.3; g.add(gl);
    return { group: g, height: s * 2.6, radius: s, name: 'Gem', phys: { mass: 0.3, radius: s }, tick: (dt, t) => { m.rotation.y = t * 0.8; }, lights: [{ pos: [0, s * 1.3, 0], color: col, intensity: 1, distance: 3 + s * 8 }] };
  },
  phone(a, r) {
    const g = new THREE.Group();
    const body = mesh(box(0.075, 0.008, 0.155), G.materials.get('glossyPlastic', { color: userCol(a, '#1a1a1c') })); body.position.y = 0.004; g.add(body);
    const screen = mesh(new THREE.PlaneGeometry(0.068, 0.145), G.materials.get('emissive', { color: '#5a8ae8', emissiveIntensity: 1.2 })); screen.rotation.x = -Math.PI / 2; screen.position.y = 0.0085; g.add(screen);
    return { group: g, height: 0.01, radius: 0.09, name: 'Smartphone', phys: { mass: 0.2, radius: 0.06 }, interact: { label: () => 'Check the phone', action: () => G.ui.toast(r.pick(['1 new message: “Where are you?? The portal is open!”', 'Battery 12%. Of course.', 'No signal in this dimension.', 'A notification: “Your castle has been delivered.”'])) } };
  },
  hay(a, r) {
    const g = new THREE.Group();
    const round = r.chance(0.5);
    const hayM = G.materials.get('thatch');
    if (round) { const m = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 24), hayM); m.rotation.z = Math.PI / 2; m.position.y = 0.75; g.add(m); }
    else { const m = mesh(box(1.1, 0.5, 0.5), hayM); m.position.y = 0.25; g.add(m); }
    return { group: g, height: round ? 1.5 : 0.5, radius: round ? 0.8 : 0.6, name: 'Hay bale', collider: round ? { type: 'box', x: 0, z: 0, y0: 0, y1: 1.5, hx: 0.6, hz: 0.75 } : { type: 'box', x: 0, z: 0, y0: 0, y1: 0.5, hx: 0.55, hz: 0.25 }, phys: round ? null : { mass: 15, radius: 0.4 }, noPickup: round };
  },
  gravestone(a, r) {
    const g = new THREE.Group();
    const s = new THREE.Shape(); const w = r.range(0.25, 0.35), h = r.range(0.7, 1.0);
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, h - w); s.absarc(0, h - w, w, 0, Math.PI, false); s.lineTo(-w, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }); geo.translate(0, 0, -0.06);
    const stone = mesh(geo, G.materials.get(r.pick(['granite', 'stone', 'marble'])));
    stone.rotation.x = r.range(-0.08, 0.05); stone.rotation.z = r.range(-0.06, 0.06);
    g.add(stone);
    const name = a.label || r.pick(['R.I.P.', 'Here lies Bob', 'Rest in Peace', 'Beloved', 'Gone fishing']);
    const tex = labelTexture(name, { fg: '#2a2a2a', w: 512, h: 160 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, w * 0.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
    plate.position.set(0, h * 0.62, 0.075); stone.add(plate);
    const mound = mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, TAU, 0, Math.PI / 2), G.materials.get('dirt')); mound.scale.set(0.8, 0.18, 1.6); mound.position.z = 0.9; g.add(mound);
    return { group: g, height: h, radius: 0.6, name: 'Gravestone', collider: { type: 'box', x: 0, z: 0, y0: 0, y1: h, hx: w, hz: 0.08 }, noPickup: true };
  },
  well(a, r) {
    const g = new THREE.Group();
    const R = 0.8;
    const stone = G.materials.get('fieldstone');
    const ring = mesh(new THREE.CylinderGeometry(R, R + 0.05, 0.8, 24, 1, true), stone); ring.position.y = 0.4; g.add(ring);
    const inner = mesh(new THREE.CylinderGeometry(R - 0.2, R - 0.2, 0.8, 24, 1, true), stone); inner.position.y = 0.4; inner.material = stone; g.add(inner);
    const rim = mesh(new THREE.TorusGeometry(R - 0.1, 0.12, 6, 24), stone); rim.rotation.x = Math.PI / 2; rim.position.y = 0.8; g.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.2, 24), G.materials.get('water', { color: '#1a3a3a', opacity: 0.9 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.2; g.add(water);
    const wood = G.materials.get('darkWood');
    for (const x of [-R, R]) { const p = mesh(box(0.1, 1.8, 0.1), wood); p.position.set(x, 0.9, 0); g.add(p); }
    const axle = mesh(new THREE.CylinderGeometry(0.05, 0.05, R * 2.2, 8), wood); axle.rotation.z = Math.PI / 2; axle.position.y = 1.4; g.add(axle);
    const roof1 = mesh(box(R * 2.6, 0.05, 0.9), G.materials.get('shingles')); roof1.position.set(0, 2.0, 0.3); roof1.rotation.x = 0.6; g.add(roof1);
    const roof2 = mesh(box(R * 2.6, 0.05, 0.9), G.materials.get('shingles')); roof2.position.set(0, 2.0, -0.3); roof2.rotation.x = -0.6; g.add(roof2);
    const bucket = mesh(lathe([[0, 0], [0.1, 0], [0.13, 0.22], [0.12, 0.22], [0.09, 0.02], [0, 0.02]], 16), G.materials.get('planks')); bucket.position.set(0.1, 0.95, 0); g.add(bucket);
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.1, 1.4, 0), new THREE.Vector3(0.1, 1.17, 0)]), new THREE.LineBasicMaterial({ color: '#b8a070' })); g.add(rope);
    return { group: g, height: 2.3, radius: R + 0.4, name: 'Wishing well', collider: { type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.9, r: R + 0.05 }, noPickup: true, interact: { label: () => 'Make a wish', action: () => { G.ui.toast('You toss a coin into the well… ✨ Type your wish into the bar!', 'good'); if (G.audio) G.audio.play('splash'); setTimeout(() => G.ui.focusCommand(), 200); } } };
  },
  skateboard(a, r) {
    const g = new THREE.Group();
    const deck = mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 12), G.materials.get('painted', { color: userCol(a, r.pick(['#1a1a1a', '#c81a2a', '#1a8ac8'])) }));
    deck.rotation.z = Math.PI / 2; deck.rotation.x = Math.PI / 2; deck.scale.set(1, 1, 0.12); deck.position.y = 0.09; g.add(deck);
    for (const x of [-0.26, 0.26]) {
      const truck = mesh(box(0.03, 0.03, 0.18), G.materials.get('chrome')); truck.position.set(x, 0.055, 0); g.add(truck);
      for (const z of [-0.09, 0.09]) { const w = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), G.materials.get('glossyPlastic', { color: '#f0e8d0' })); w.rotation.x = Math.PI / 2; w.position.set(x, 0.03, z); g.add(w); }
    }
    return { group: g, height: 0.11, radius: 0.4, name: 'Skateboard', phys: { mass: 2, radius: 0.15, friction: 0.5, kick: 0.8 } };
  },
};

function smokeColumn(group, pos, scale = 1) {
  const N = 26;
  const mats = [];
  const sprites = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: '#8a8a8a', transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.userData.noRaycast = true;
    s.userData.seed = Math.random();
    group.add(s);
    sprites.push(s); mats.push(m);
  }
  markNoAO(sprites[0]);
  sprites.forEach(markNoAO);
  group.userData.smokeTick = (t) => {
    for (const s of sprites) {
      const life = (s.userData.seed + t * 0.18) % 1;
      s.position.set(pos[0] + Math.sin(life * 5 + s.userData.seed * 20) * 0.25 * life * scale, pos[1] + life * 3.5 * scale, pos[2] + Math.cos(life * 4 + s.userData.seed * 9) * 0.25 * life * scale);
      s.scale.setScalar((0.25 + life * 1.3) * scale);
      s.material.opacity = Math.sin(life * Math.PI) * 0.22;
    }
  };
  return group.userData.smokeTick;
}

function burstConfetti(root, s, updaters) {
  const N = 160;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), c = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) {
    p[i * 3 + 1] = s;
    const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    v.push([(Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4]);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true }));
  pts.frustumCulled = false; pts.userData.noRaycast = true;
  root.add(pts);
  let life = 0;
  updaters.push((dt) => {
    life += dt;
    for (let i = 0; i < N; i++) {
      v[i][1] -= 5 * dt; v[i][0] *= 0.99; v[i][2] *= 0.99;
      p[i * 3] += v[i][0] * dt; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i][1] * dt); p[i * 3 + 2] += v[i][2] * dt;
    }
    g.attributes.position.needsUpdate = true;
    if (life > 6) pts.visible = false;
  });
}

export const propGen = {
  maxCount: 30,
  estimate: (item) => (item.params.kind === 'fountain' || item.params.kind === 'well' ? 1.5 : 0.8),
  stages: () => [{ name: 'geometry', label: 'Modelling', weight: 3 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng) {
    const a = item.attrs;
    const kind = P[item.params.kind] ? item.params.kind : 'crate';
    ctx.stage('geometry', 'Modelling ' + (item.concept || kind));
    yield;
    const b = P[kind](a, rng);
    const root = new THREE.Group();
    const sm = kind === 'gem' || kind === 'snowman' || kind === 'gift' || kind === 'fountain' ? 1 : clamp(a.sizeMul || 1, 0.2, 12);
    const holder = new THREE.Group();
    holder.add(b.group);
    holder.scale.setScalar(sm);
    root.add(holder);
    ctx.stage('textures', 'Finishing');
    yield;
    const data = {
      root, name: b.name, category: 'prop', icon: item.icon, height: b.height * sm, footprint: { radius: Math.max(0.15, b.radius * sm) },
      colliderDefs: b.collider ? [scaleC(b.collider, sm)] : [], lights: b.lights || null,
      suppressGrass: kind === 'campfire' || kind === 'fountain' || kind === 'well' ? undefined : false,
      flattenTerrain: !!b.flatten, flattenFalloff: 2,
    };
    if (kind === 'campfire') data.paintGround = [{ type: 'paint', x: 0, z: 0, radius: 1.2, channel: 1, value: 230, falloff: 1.2 }];
    if (b.seats && b.seats.length) {
      data.seats = b.seats.map((s) => ({ ...s, x: s.x * sm, z: s.z * sm, y: s.y * sm }));
      data.seatWorld = seatWorldFn(data);
      data.interact = { label: () => (kind === 'campfire' ? 'Sit by the fire' : 'Sit'), action: (e, player) => sitNearest(data, player) };
    }
    if (b.interact) data.interact = b.interact;
    if (b.rollPivot) data.rollObject = b.rollPivot;
    const ticks = [];
    if (b.tick) ticks.push(b.tick);
    if (b.group.userData.smokeTick) ticks.push((dt, t) => b.group.userData.smokeTick(t));
    b.group.traverse((o) => { if (o !== b.group && o.userData.smokeTick) ticks.push((dt, t) => o.userData.smokeTick(t)); });
    if (ticks.length) animate(root, (t, dt) => { for (const f of ticks) f(dt, t); });
    if (a.flags.glow && !data.lights) data.lights = [{ pos: [0, data.height * 0.6, 0], color: a.primaryColor || '#ffe0a0', intensity: 2, distance: 6 }];
    if (b.phys && !b.noPickup) attachPhysics(data, { ...b.phys, radius: (b.phys.radius || b.radius) * sm, height: data.height, mass: (b.phys.mass || 1) * sm * sm * sm, dropOnSpawn: a.flags.float ? 0 : 0 });
    if (a.flags.float || a.placementFloat) { data.floating = true; data.floatHeight = 1.5; if (data.body) data.body.kick = 0; const y0 = 0; animate(root, (t) => { holder.position.y = y0 + Math.sin(t * 1.3) * 0.1; }); if (data.update && data.body) { data.body.sleeping = true; data.update = null; data.pickup = true; } }
    return data;
  },
};

function scaleC(c, s) {
  if (c.type === 'cyl') return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, r: c.r * s };
  return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, hx: c.hx * s, hz: c.hz * s };
}
