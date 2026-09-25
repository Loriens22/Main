// ---------------------------------------------------------------------------
// Gadget recipes, part 3: science, space and sci-fi machines, energy and
// industry. Many are alive: turbines turn, tesla coils arc, robot arms
// work, pumpjacks nod, the time machine really moves the sun and the
// teleporter really teleports you.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { SCREENS } from './gadgetkit.js';
import { knob, buttonGrid } from './gadgets_home.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const Z = [HALF, 0, 0], X = [0, 0, HALF];
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }

// Jagged animated lightning between two points (tesla coils, reactors).
function arcs(k, from, count, radius, color = '#a8d8ff') {
  const segs = 10;
  const lines = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false }));
    l.frustumCulled = false; l.userData.noRaycast = true;
    k.group.add(l);
    lines.push({ l, g, dir: new THREE.Vector3(), t: 0 });
  }
  k.tick((dt, t, dist) => {
    if (dist > 60) return;
    for (const L of lines) {
      L.t -= dt;
      if (L.t <= 0) { L.t = 0.05 + Math.random() * 0.15; L.dir.set(Math.random() - 0.5, Math.random() * 0.6 - 0.35, Math.random() - 0.5).normalize(); }
      const p = L.g.attributes.position.array;
      for (let s = 0; s <= segs; s++) {
        const f = s / segs, j = s === 0 || s === segs ? 0 : radius * 0.12;
        p[s * 3] = from[0] + L.dir.x * radius * f + (Math.random() - 0.5) * j;
        p[s * 3 + 1] = from[1] + L.dir.y * radius * f + (Math.random() - 0.5) * j;
        p[s * 3 + 2] = from[2] + L.dir.z * radius * f + (Math.random() - 0.5) * j;
      }
      L.g.attributes.position.needsUpdate = true;
      L.l.material.opacity = 0.5 + Math.random() * 0.5;
    }
  });
}

export const SCI = {
  telescope(k, a, r) {
    const B = k.body(r.pick(['gold', 'glossyPlastic']), r.pick(['#c8a050', '#f0f0ee', '#1a2a4a']));
    for (let i = 0; i < 3; i++) { const an = i / 3 * TAU; k.seg('darkWood', [0, 1.0, 0], [Math.cos(an) * 0.5, 0, Math.sin(an) * 0.5], 0.02); }
    k.cyl('dark', [0, 1.02, 0], 0.05, 0.06, null, { segs: 12 });
    const tube = k.sub([0, 1.1, 0], [-0.6, 0, 0]);
    tube.cyl(B, [0, 0, 0.15], 0.07, 1.1, Z, { segs: 24, rTop: 0.06 });
    tube.cyl('black', [0, 0, 0.72], 0.075, 0.05, Z, { segs: 24 });
    tube.disc('tglass', [0, 0, 0.745], 0.065);
    tube.cyl(B, [0, 0.1, -0.1], 0.02, 0.25, Z, { segs: 10 });
    tube.cyl('black', [0, 0, -0.43], 0.03, 0.08, Z, { segs: 12 });
    return { name: 'Telescope', phys: { mass: 12 }, interact: { label: () => 'Look at the stars', action: (e) => { sound(e, 'magic'); if (G.ui) G.ui.toast(r.pick(['You spot Saturn\'s rings.', 'A shooting star streaks by!', 'The moon\'s craters look close enough to touch.', 'Is that... a UFO?'])); } } };
  },
  microscope(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#f0f0ee', '#2a2a2c']));
    k.rbox(B, [0, 0.02, 0], [0.18, 0.04, 0.24], 0.01);
    k.ext(B, [[-0.02, 0], [0.03, 0], [0.03, 0.25], [-0.05, 0.3], [-0.06, 0.25]], 0.05, [0, 0.04, -0.08], [0, -HALF, 0]);
    k.box('black', [0, 0.12, 0.02], [0.12, 0.01, 0.1]);
    k.box('glass', [0, 0.127, 0.02], [0.06, 0.002, 0.025]);
    k.seg(B, [0, 0.33, -0.02], [0, 0.18, 0.03], 0.018);
    k.seg('black', [0, 0.33, -0.02], [0, 0.4, -0.07], 0.014);
    for (let i = 0; i < 3; i++) k.seg('chrome', [0, 0.18, 0.03], [Math.cos(i * 2.1) * 0.02, 0.14, 0.03 + Math.sin(i * 2.1) * 0.02], 0.006);
    knob(k, 'black', 0.03, 0.2, -0.08, 0.02, 0.02);
    return { name: 'Microscope', phys: { mass: 3 } };
  },
  satellite(k, a, r) {
    const s = k.sub([0, 3.5, 0]);
    s.box('gold', [0, 0, 0], [0.9, 0.9, 1.2]);
    s.box('dark', [0, 0, 0.62], [0.7, 0.7, 0.04]);
    for (const x of [-1, 1]) {
      s.seg('chrome', [x * 0.45, 0, 0], [x * 0.8, 0, 0], 0.03);
      for (let i = 0; i < 3; i++) s.box('m:#1a2a6a', [x * (1.1 + i * 0.62), 0, 0], [0.6, 0.02, 0.9]);
      for (let i = 0; i < 3; i++) s.box('chrome', [x * (1.1 + i * 0.62), 0.012, 0], [0.61, 0.004, 0.02]);
    }
    s.seg('chrome', [0, 0.45, 0], [0, 0.8, 0.2], 0.02);
    s.lathe('white', [0, 0.85, 0.25], [[0, 0], [0.3, 0.08], [0.45, 0.2]], 24, [-0.6, 0, 0]);
    s.seg('chrome', [0, -0.45, 0], [0, -0.9, 0], 0.01);
    s.box('ledG', [0.3, 0.46, 0.4], [0.03, 0.02, 0.03]);
    k.tick((dt, t) => { s.group.rotation.y += dt * 0.1; s.group.position.y = 3.5 + Math.sin(t * 0.6) * 0.1; });
    return { name: 'Satellite', static: true, noCollide: true };
  },
  satelliteDish(k, a, r) {
    k.body('white', '#f0f0ee');
    k.box('concrete', [0, 0.2, 0], [1.2, 0.4, 1.2]);
    k.seg('steel', [0, 0.4, 0], [0, 1.8, 0], 0.12);
    const d = k.sub([0, 1.9, 0], [-0.6, 0.4, 0]);
    d.lathe('body', [0, 0, 0], [[0, 0], [0.6, 0.08], [1.2, 0.35], [1.5, 0.55], [1.48, 0.57], [0, 0.03]], 36);
    for (let i = 0; i < 3; i++) { const an = i / 3 * TAU; d.seg('steel', [Math.cos(an) * 1.3, 0.45, Math.sin(an) * 1.3], [0, 1.3, 0], 0.02); }
    d.cyl('dark', [0, 1.32, 0], 0.08, 0.2, null, { segs: 12 });
    k.tick((dt, t) => { d.group.rotation.y = 0.4 + Math.sin(t * 0.05) * 0.6; });
    k.collide([-0.6, 0, -0.6], [0.6, 0.4, 0.6]); k.collideCyl(0, 0, 0, 1.8, 0.15);
    return { name: 'Satellite dish', static: true };
  },
  radioTower(k, a, r) {
    k.body('painted', '#c62828');
    const H = 22;
    for (let i = 0; i < 3; i++) {
      const an = i / 3 * TAU, an2 = (i + 1) / 3 * TAU;
      k.seg(i % 2 ? 'body' : 'white', [Math.cos(an) * 1.2, 0, Math.sin(an) * 1.2], [Math.cos(an) * 0.3, H, Math.sin(an) * 0.3], 0.06);
      for (let j = 0; j < 11; j++) {
        const f0 = j / 11, f1 = (j + 1) / 11, r0 = 1.2 - 0.9 * f0, r1 = 1.2 - 0.9 * f1;
        k.seg(j % 2 ? 'body' : 'white', [Math.cos(an) * r0, f0 * H, Math.sin(an) * r0], [Math.cos(an2) * r1, f1 * H, Math.sin(an2) * r1], 0.03);
      }
    }
    k.seg('steel', [0, H, 0], [0, H + 4, 0], 0.05);
    k.ball('led', [0, H + 4.1, 0], 0.15);
    const blink = k.glow('#ff2020', [0, H + 4.1, 0], 2, 0.9);
    k.tick((dt, t) => { blink.material.opacity = Math.sin(t * 3) > 0.3 ? 0.9 : 0.05; });
    k.collideCyl(0, 0, 0, 3, 1.3);
    return { name: 'Radio tower', static: true };
  },
  solarPanel(k, a, r) {
    k.body('steel', '#8a8c90');
    for (let row = 0; row < 2; row++) for (let c = 0; c < 3; c++) {
      const x = (c - 1) * 1.1, z = (row - 0.5) * 1.9;
      const p = k.sub([x, 0.9, z], [-0.5, 0, 0]);
      p.box('m:#10204a', [0, 0, 0], [1.0, 0.04, 1.6]);
      for (let i = 1; i < 6; i++) p.box('chrome', [0, 0.021, -0.8 + i * 0.27], [1.0, 0.003, 0.01]);
      for (let i = 1; i < 3; i++) p.box('chrome', [-0.5 + i * 0.33, 0.021, 0], [0.01, 0.003, 1.6]);
      k.seg('body', [x, 0, z], [x, 0.9, z], 0.04);
    }
    return { name: 'Solar panels', static: true, collideAuto: true };
  },
  windTurbine(k, a, r) {
    k.body('white', '#f4f4f2');
    const H = 26;
    k.seg('body', [0, 0, 0], [0, H, 0], 1.0, 0.55, 20);
    k.rbox('body', [0, H + 0.6, -0.4], [1.4, 1.4, 3.2], 0.5);
    const rot = k.sub([0, H + 0.6, 1.3]);
    rot.lathe('body', [0, 0, 0], [[0.6, 0], [0.5, 0.8], [0, 1.4]], 20, Z);
    for (let i = 0; i < 3; i++) rot.ext('body', [[-0.45, 0.4], [0.5, 0.4], [0.3, 6], [0.05, 13], [-0.1, 6]], 0.18, [0, 0, 0.3], [0, 0, i * TAU / 3], 0.04);
    k.tick((dt) => { rot.group.rotation.z -= dt * 0.9; });
    k.collideCyl(0, 0, 0, H, 1.0);
    return { name: 'Wind turbine', static: true };
  },
  jetpack(k, a, r) {
    const B = k.body('metal', r.pick(['#c8ccd2', '#c62828', '#2a2a2c']));
    k.rbox(B, [0, 0.55, 0], [0.34, 0.45, 0.14], 0.04);
    for (const s of [-1, 1]) {
      k.cyl(B, [s * 0.14, 0.5, -0.12], 0.08, 0.5, null, { segs: 18 });
      k.cone(B, [s * 0.14, 0.8, -0.12], 0.08, 0.12, null, 18);
      k.cyl('dark', [s * 0.14, 0.22, -0.12], 0.06, 0.08, null, { segs: 16, rTop: 0.08 });
      k.cone('e:#40c8ff', [s * 0.14, 0.12, -0.12], 0.05, 0.14, [PI, 0, 0], 12);
      k.glow('#40c8ff', [s * 0.14, 0.12, -0.12], 0.4, 0.8);
    }
    for (const s of [-1, 1]) k.tube('black', [[s * 0.12, 0.76, 0.07], [s * 0.14, 0.62, 0.14], [s * 0.12, 0.35, 0.08]], 0.015, 10);
    k.box('ledG', [0, 0.65, 0.071], [0.1, 0.02, 0.004]);
    return { name: 'Jetpack', phys: { mass: 12 }, interact: { label: () => 'Strap it on and fly', action: (e) => { if (G.player) { G.player.flying = true; G.player.velocity.y = 8; } sound(e, 'whoosh'); if (G.ui) G.ui.toast('Jetpack engaged! (Space up · C down · F to land)'); } } };
  },
  hoverboard(k, a, r) {
    const col = k.color(r.pick(['#ff3a8a', '#3ac8ff', '#f2f0ea', '#1a1a1c']));
    const b = k.sub([0, 0.25, 0]);
    b.rbox('g:' + col, [0, 0, 0], [0.3, 0.05, 0.85], 0.025);
    for (const z of [-0.3, 0.3]) { b.cyl('dark', [0, -0.04, z], 0.1, 0.04, null, { segs: 20 }); b.disc('cyanGlow', [0, -0.061, z], 0.08, [HALF, 0, 0]); }
    b.box('cyanGlow', [0.152, 0, 0], [0.004, 0.012, 0.8]); b.box('cyanGlow', [-0.152, 0, 0], [0.004, 0.012, 0.8]);
    k.glow('#40e8ff', [0, 0.05, 0], 1.0, 0.5);
    k.tick((dt, t) => { b.group.position.y = 0.25 + Math.sin(t * 2) * 0.03; b.group.rotation.z = Math.sin(t * 1.3) * 0.03; });
    return { name: 'Hoverboard', phys: { mass: 4 } };
  },
  timeMachine(k, a, r) {
    k.body('brass', '#c8a050');
    k.cyl('darkWood', [0, 0.1, 0], 1.3, 0.2, null, { segs: 32 });
    k.rbox('velvet', [0, 0.55, 0], [0.6, 0.12, 0.6], 0.05);
    k.rbox('velvet', [0, 0.95, -0.28], [0.6, 0.7, 0.1], 0.05);
    for (const s of [-1, 1]) { k.seg('body', [s * 0.3, 0.2, 0.2], [s * 0.3, 0.75, 0.2], 0.03); k.seg('body', [s * 0.3, 0.75, 0.2], [s * 0.3, 0.75, -0.25], 0.03); }
    k.seg('body', [0.5, 0.2, 0.5], [0.5, 1.0, 0.5], 0.03);
    k.rbox('darkWood', [0.5, 1.05, 0.5], [0.4, 0.08, 0.3], 0.02, [-0.4, 0, 0]);
    k.screen([0.5, 1.1, 0.5], 0.3, 0.1, [-0.4 - HALF, 0, 0], (g, w, h) => SCREENS.clock(g, w, h, 0, { fg: '#ff7a3a', bg: '#100806' }), { res: 128, fps: 1 });
    k.seg('body', [0.4, 1.1, 0.55], [0.4, 1.3, 0.6], 0.01); k.ball('led', [0.4, 1.31, 0.6], 0.025);
    const rings = [];
    for (let i = 0; i < 3; i++) { const g = k.sub([0, 1.1, 0]); g.torus('body', [0, 0, 0], 1.0 + i * 0.12, 0.03, [i * 1.1, 0, 0], TAU, 48); rings.push(g); }
    const core = k.glow('#40c8ff', [0, 1.1, 0], 2.5, 0.25);
    let boost = 0;
    k.tick((dt, t) => { boost = Math.max(0, boost - dt * 0.5); rings.forEach((g, i) => { g.group.rotation.y += dt * (0.3 + i * 0.2) * (1 + boost * 15); g.group.rotation.z += dt * 0.2 * (i - 1) * (1 + boost * 10); }); core.material.opacity = 0.2 + boost * 0.7; });
    k.light([0, 1.2, 0], '#40c8ff', 1.2, 5, false);
    k.collideCyl(0, 0, 0, 0.2, 1.3);
    return {
      name: 'Time machine', seats: [{ x: 0, y: 0.62, z: 0, yaw: 0 }],
      interact: { label: () => 'Travel through time', action: (e) => {
        boost = 1; sound(e, 'portal');
        const at = G.world.atmosphere;
        if (at && G.world.kind === 'overworld') { const from = at.timeOfDay; G.timeTween = { from, to: from + r.range(6, 14), t: 0, dur: 2.5 }; }
        if (G.ui) G.ui.toast(r.pick(['Whoosh! Hours flash by…', 'Temporal jump complete.', 'You arrive in a different hour.']));
      } },
    };
  },
  teleporter(k, a, r) {
    k.body('metal', '#8a9aa8');
    k.cyl('body', [0, 0.1, 0], 1.0, 0.2, null, { segs: 8 });
    k.cyl('cyanGlow', [0, 0.205, 0], 0.8, 0.01, null, { segs: 32 });
    for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; k.box('dark', [Math.cos(an) * 0.9, 0.21, Math.sin(an) * 0.9], [0.12, 0.02, 0.2], [0, -an, 0]); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 3, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.userData.noRaycast = true; beam.castShadow = false;
    k.add(beam, [0, 1.7, 0]);
    const rings = [];
    for (let i = 0; i < 3; i++) { const s = k.sub([0, 0.5 + i, 0]); s.torus('cyanGlow', [0, 0, 0], 0.8, 0.02, [HALF, 0, 0], TAU, 40); rings.push(s); }
    k.tick((dt, t) => { rings.forEach((s, i) => { s.group.position.y = 0.3 + ((t * 0.6 + i / 3) % 1) * 2.8; }); beam.material.opacity = 0.08 + Math.sin(t * 4) * 0.04; });
    k.light([0, 1, 0], '#40e8ff', 1.5, 5, false);
    return {
      name: 'Teleporter pad', static: true,
      interact: { label: () => 'Teleport!', action: (e) => {
        sound(e, 'portal');
        const P = G.player, ang = Math.random() * TAU, d = 25 + Math.random() * 40;
        const x = P.position.x + Math.cos(ang) * d, z = P.position.z + Math.sin(ang) * d;
        const y = G.world.colliders ? G.world.colliders.groundHeight(x, z, 0.3, 400, 800) : P.position.y;
        P.teleport(new THREE.Vector3(x, y + 0.5, z), P.yaw);
        if (G.ui) G.ui.toast('Zap! Teleported.');
      } },
    };
  },
  reactor(k, a, r) {
    const col = k.color('#40ff8a');
    k.body('steel', '#6a6c70');
    k.cyl('body', [0, 0.3, 0], 1.2, 0.6, null, { segs: 24 });
    k.cyl('body', [0, 3.2, 0], 1.2, 0.5, null, { segs: 24 });
    k.cyl('glass', [0, 1.75, 0], 0.8, 2.4, null, { segs: 24, open: true });
    const core = k.sub([0, 1.75, 0]);
    core.cyl('e:' + col, [0, 0, 0], 0.35, 2.3, null, { segs: 20 });
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.seg('body', [Math.cos(an) * 1.0, 0.6, Math.sin(an) * 1.0], [Math.cos(an) * 1.0, 2.95, Math.sin(an) * 1.0], 0.07); }
    for (let i = 0; i < 4; i++) { const an = i / 4 * TAU + 0.4; k.tube('rust', [[Math.cos(an) * 1.2, 0.4, Math.sin(an) * 1.2], [Math.cos(an) * 2.0, 0.4, Math.sin(an) * 2.0], [Math.cos(an) * 2.2, 0, Math.sin(an) * 2.2]], 0.15, 16); }
    k.label('⚠ HIGH VOLTAGE', [0, 0.35, 1.21], 1.4, 0.25, null, { bg: '#f2c21a', fg: '#1a1a1a' });
    k.glow(col, [0, 1.75, 0], 4, 0.4);
    k.light([0, 1.75, 0], col, 2.5, 9, false, true);
    k.tick((dt, t) => { core.group.scale.set(1 + Math.sin(t * 5) * 0.08, 1, 1 + Math.sin(t * 5) * 0.08); });
    arcs(k, [0, 1.75, 0], 3, 0.75, col);
    k.collideCyl(0, 0, 0, 3.5, 1.25);
    return { name: 'Energy reactor', static: true, interact: { label: () => 'Overload the core', action: (e) => sound(e, 'zap') } };
  },
  generator(k, a, r) {
    k.body('painted', r.pick(['#e8a81a', '#2a6a3a', '#c62828']));
    k.box('iron', [0, 0.1, 0], [2.2, 0.2, 1.2]);
    k.rbox('body', [-0.3, 0.75, 0], [1.3, 1.1, 1.0], 0.1);
    k.cyl('dark', [0.75, 0.75, 0], 0.45, 0.3, X, { segs: 24 });
    const fly = k.sub([0.95, 0.75, 0]);
    fly.cyl('steel', [0, 0, 0], 0.5, 0.1, X, { segs: 28 });
    for (let i = 0; i < 6; i++) fly.box('steel', [0, 0, 0], [0.08, 0.9, 0.06], [i * PI / 6, 0, 0]);
    for (let i = 0; i < 3; i++) { k.cyl('white', [-0.6 + i * 0.3, 1.1, 0.505], 0.1, 0.02, Z, { segs: 24 }); k.box('black', [-0.6 + i * 0.3, 1.13, 0.52], [0.005, 0.07, 0.003], [0, 0, r.range(-1, 1)]); }
    k.tube('copper', [[-0.8, 1.3, 0.3], [-0.8, 1.6, 0.3], [0.2, 1.6, 0.3], [0.2, 1.3, 0]], 0.05, 16);
    k.cyl('dark', [-0.8, 1.5, -0.3], 0.1, 0.8, null, { segs: 12 });
    k.tick((dt) => { fly.group.rotation.x += dt * 6; });
    k.collide([-1.1, 0, -0.6], [1.1, 1.3, 0.6]);
    return { name: 'Generator', static: true, interact: { label: () => 'Crank it up', action: (e) => sound(e, 'whirr') } };
  },
  teslaCoil(k, a, r) {
    k.body('copper', '#c87a3a');
    k.cyl('dark', [0, 0.25, 0], 0.5, 0.5, null, { segs: 20 });
    k.cyl('body', [0, 1.5, 0], 0.22, 2.0, null, { segs: 24 });
    for (let i = 0; i < 20; i++) k.torus('copper', [0, 0.55 + i * 0.095, 0], 0.225, 0.012, [HALF, 0, 0], TAU, 20);
    k.torus('chrome', [0, 2.7, 0], 0.5, 0.18, [HALF, 0, 0], TAU, 32);
    k.glow('#a8d8ff', [0, 2.7, 0], 2.5, 0.35);
    arcs(k, [0, 2.7, 0], 4, 1.6);
    k.light([0, 2.7, 0], '#a8d8ff', 1.6, 7, false, true);
    k.collideCyl(0, 0, 0, 2.9, 0.55);
    return { name: 'Tesla coil', static: true, interact: { label: () => 'Zap!', action: (e) => sound(e, 'zap') } };
  },
  robotArm(k, a, r) {
    k.body('painted', r.pick(['#ff7a10', '#e8c81a', '#2a6ad8']));
    k.cyl('dark', [0, 0.1, 0], 0.45, 0.2, null, { segs: 24 });
    const base = k.sub([0, 0.2, 0]);
    base.cyl('body', [0, 0.2, 0], 0.3, 0.4, null, { segs: 20 });
    const sh = base.sub([0, 0.45, 0]);
    sh.cyl('dark', [0, 0, 0], 0.18, 0.4, X, { segs: 18 });
    sh.rbox('body', [0, 0.7, 0], [0.24, 1.4, 0.24], 0.08);
    const el = sh.sub([0, 1.4, 0]);
    el.cyl('dark', [0, 0, 0], 0.14, 0.34, X, { segs: 16 });
    el.rbox('body', [0, 0, 0.55], [0.18, 0.18, 1.1], 0.06);
    const wr = el.sub([0, 0, 1.12]);
    wr.cyl('chrome', [0, 0, 0.05], 0.09, 0.12, Z, { segs: 14 });
    for (const s of [-1, 1]) wr.box('dark', [s * 0.06, 0, 0.2], [0.03, 0.08, 0.18]);
    k.tick((dt, t) => { base.group.rotation.y = Math.sin(t * 0.5) * 1.2; sh.group.rotation.x = -0.4 + Math.sin(t * 0.8) * 0.35; el.group.rotation.x = 0.9 + Math.sin(t * 1.1) * 0.4; wr.group.rotation.z += dt; });
    k.collideCyl(0, 0, 0, 0.8, 0.45);
    return { name: 'Robot arm', static: true };
  },
  quantumComputer(k, a, r) {
    k.body('gold', '#e0b040');
    k.box('white', [0, 0.02, 0], [1.4, 0.04, 1.4]);
    const q = k.sub([0, 2.6, 0]);
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const rr = 0.5 - i * 0.07;
      q.cyl('body', [0, y, 0], rr, 0.03, null, { segs: 32 });
      for (let j = 0; j < 8; j++) { const an = j / 8 * TAU; q.seg(j % 2 ? 'copper' : 'body', [Math.cos(an) * rr * 0.8, y, Math.sin(an) * rr * 0.8], [Math.cos(an) * (rr - 0.07) * 0.8, y - 0.4, Math.sin(an) * (rr - 0.07) * 0.8], 0.012); }
      for (let j = 0; j < 6; j++) { const an = j / 6 * TAU + i; q.tube('copper', [[Math.cos(an) * rr * 0.5, y, Math.sin(an) * rr * 0.5], [Math.cos(an + 0.5) * rr * 0.3, y - 0.2, Math.sin(an + 0.5) * rr * 0.3], [Math.cos(an + 1) * rr * 0.4, y - 0.4, Math.sin(an + 1) * rr * 0.4]], 0.006, 10, false, 5); }
      y -= 0.42;
    }
    q.cyl('chrome', [0, y + 0.1, 0], 0.1, 0.2, null, { segs: 16 });
    q.seg('body', [0, 0, 0], [0, 0.8, 0], 0.04);
    k.seg('steel', [0, 3.4, 0], [0, 4.2, 0], 0.06);
    k.glow('#a0d0ff', [0, y + 2.6, 0], 1, 0.4);
    return { name: 'Quantum computer', static: true, noCollide: true };
  },
  lightsaber(k, a, r) {
    const col = k.color(r.pick(['#3a8aff', '#3aff5a', '#ff2a2a', '#b03aff']));
    k.body('chrome', '#c8ccd2');
    k.seg('body', [0, 0.03, -0.14], [0, 0.03, 0.1], 0.02);
    for (let i = 0; i < 6; i++) k.torus('black', [0, 0.03, -0.1 + i * 0.025], 0.021, 0.004, null, TAU, 14);
    k.box('led', [0.02, 0.03, 0.02], [0.006, 0.008, 0.015]);
    k.seg('e:' + col, [0, 0.03, 0.1], [0, 0.03, 1.0], 0.014, 0.012);
    k.seg('e:#ffffff', [0, 0.03, 0.1], [0, 0.03, 0.99], 0.007, 0.006);
    k.light([0, 0.1, 0.5], col, 1, 3, false);
    return { name: 'Energy sword', phys: { mass: 1 }, interact: { label: () => 'Vwoom', action: (e) => sound(e, 'whirr') } };
  },
  pumpjack(k, a, r) {
    k.body('painted', r.pick(['#3a3a3c', '#e8a81a', '#2a5a8a']));
    k.box('concrete', [0, 0.15, 0], [1.5, 0.3, 6]);
    for (const s of [-1, 1]) k.seg('body', [s * 0.5, 0.3, 0.8], [0, 3.2, 0], 0.08), k.seg('body', [s * 0.5, 0.3, -0.8], [0, 3.2, 0], 0.08);
    const beam = k.sub([0, 3.3, 0]);
    beam.box('body', [0, 0, 0.4], [0.3, 0.4, 5]);
    beam.ext('body', [[0, 0.3], [0.6, 0.1], [0.6, -1.3], [0, -1.5]], 0.5, [0, 0, 2.9], [0, -HALF, 0]);
    k.cyl('dark', [0, 0.8, -2.2], 0.6, 0.3, X, { segs: 20 });
    k.seg('steel', [0, 0.3, 3.2], [0, 1.6, 3.2], 0.05);
    k.tick((dt, t) => { beam.group.rotation.x = Math.sin(t * 1.3) * 0.28; });
    k.collide([-0.75, 0, -3], [0.75, 0.3, 3]);
    return { name: 'Oil pumpjack', static: true };
  },
  crane(k, a, r) {
    k.body('painted', '#f2c21a');
    const H = 30;
    k.box('concrete', [0, 0.5, 0], [4, 1, 4]);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) k.seg('body', [x, 1, z], [x, H, z], 0.1);
    for (let i = 0; i < 14; i++) { const y0 = 1 + i * (H - 1) / 14, y1 = y0 + (H - 1) / 14; for (const [ax, az, bx, bz] of [[-0.9, -0.9, 0.9, -0.9], [0.9, -0.9, 0.9, 0.9], [0.9, 0.9, -0.9, 0.9], [-0.9, 0.9, -0.9, -0.9]]) k.seg('body', [ax, y0, az], [bx, y1, bz], 0.05); }
    const top = k.sub([0, H, 0]);
    top.box('body', [0, 0.6, 7], [1.2, 1.2, 26]);
    top.box('concrete', [0, 0.2, -5], [2.2, 2.4, 3]);
    top.rbox('glass', [1.0, -0.8, 0.8], [1.4, 1.4, 1.6], 0.1);
    top.seg('steel', [0, 1.2, 0], [0, 5, 0], 0.15);
    top.seg('steel', [0, 5, 0], [0, 1.2, 18], 0.04); top.seg('steel', [0, 5, 0], [0, 1.2, -5], 0.04);
    top.seg('dark', [0, 0, 14], [0, -12, 14], 0.02);
    top.rbox('dark', [0, -12.3, 14], [0.8, 0.6, 0.8], 0.1);
    top.box('rust', [0, -14, 14], [3, 0.3, 0.3]);
    k.tick((dt, t) => { top.group.rotation.y = Math.sin(t * 0.08) * 1.5; });
    k.collide([-2, 0, -2], [2, 1, 2]); k.collideCyl(0, 0, 1, H, 1.3);
    return { name: 'Tower crane', static: true };
  },
  calculator(k, a, r) {
    k.body('glossyPlastic', '#2a2a2c');
    k.rbox('body', [0, 0.01, 0], [0.09, 0.02, 0.16], 0.008);
    k.screen([0, 0.0205, -0.05], 0.07, 0.03, [-HALF, 0, 0], (g, w, h) => SCREENS.text(g, w, h, 0, { text: '1337', bg: '#a8b890', fg: '#1a1a1a', font: 'monospace' }), { res: 128, intensity: 0.5 });
    for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 4; c++) k.rbox(c === 3 ? '#ff8a1a' : 'gray', [-0.03 + c * 0.02, 0.022, -0.015 + rr * 0.02], [0.015, 0.006, 0.014], 0.003);
    return { name: 'Calculator', phys: { mass: 0.2 } };
  },
  cashRegister(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#2a2a2c', '#e8e8e6']));
    k.rbox(B, [0, 0.06, 0], [0.4, 0.12, 0.4], 0.01);
    k.rbox(B, [0, 0.16, -0.05], [0.36, 0.1, 0.28], 0.02, [0.3, 0, 0]);
    buttonGrid(k, ['lightgray', 'lightgray', '#c62828'], -0.1, 0.21, 0.05, 5, 3, 0.05, 0.04, 0.03);
    k.seg(B, [0.1, 0.12, -0.15], [0.1, 0.35, -0.15], 0.015);
    k.screen([0.1, 0.38, -0.15], 0.15, 0.06, null, (g, w, h) => SCREENS.text(g, w, h, 0, { text: '$ 9.99', fg: '#40ff80' }), { res: 128 });
    return { name: 'Cash register', phys: { mass: 8 }, interact: { label: () => 'Ka-ching!', action: (e) => sound(e, 'ding') } };
  },
  magnifier(k, a, r) {
    k.body('brass', '#c8a050');
    k.torus('body', [0, 0.01, 0.06], 0.05, 0.006, [HALF, 0, 0], TAU, 24);
    k.disc('glass', [0, 0.01, 0.06], 0.048, [-HALF, 0, 0]);
    k.seg('darkWood', [0, 0.01, 0.005], [0, 0.01, -0.1], 0.01);
    return { name: 'Magnifying glass', phys: { mass: 0.2 } };
  },
  compass(k, a, r) {
    k.body('brass', '#c8a050');
    k.cyl('body', [0, 0.008, 0], 0.04, 0.016, null, { segs: 24 });
    k.cyl('cream', [0, 0.0165, 0], 0.035, 0.001, null, { segs: 24 });
    const n = k.sub([0, 0.018, 0]);
    n.cone('#c62828', [0, 0, 0.015], 0.005, 0.03, [HALF, 0, 0], 4); n.cone('white', [0, 0, -0.015], 0.005, 0.03, [-HALF, 0, 0], 4);
    k.tick((dt, t) => { n.group.rotation.y = Math.sin(t * 0.7) * 0.1; });
    return { name: 'Compass', phys: { mass: 0.1 } };
  },
  scroll(k, a, r, item) {
    const txt = item.attrs.label || r.pick(['Here be dragons', 'X marks the spot', 'The ancient prophecy']);
    k.label(txt, [0, 0.003, 0], 0.5, 0.35, [-HALF, 0, 0], { bg: '#e8d8a8', fg: '#4a2a10', font: 'Georgia, serif' });
    for (const z of [-0.18, 0.18]) k.cyl('#d8c090', [0, 0.02, z], 0.02, 0.54, X, { segs: 12 });
    if (/map/.test(item.attrs.text)) k.label('✕', [0.1, 0.005, 0.05], 0.06, 0.06, [-HALF, 0, 0], { fg: '#c62828' });
    return { name: /map/.test(item.attrs.text) ? 'Treasure map' : 'Scroll', phys: { mass: 0.1 } };
  },
};
