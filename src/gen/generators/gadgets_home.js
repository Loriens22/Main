// ---------------------------------------------------------------------------
// Gadget recipes, part 1: home appliances, electronics, street furniture,
// bathroom and office objects. Each recipe models the object at real size
// with the construction kit (front +Z, standing on y = 0) and returns
// { name, phys?, interact?, seats? }. Screens show live canvas content,
// lights glow, and interactive ones react (turn on, open, play).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { SCREENS } from './gadgetkit.js';
import { hsl } from './common.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const Z = [HALF, 0, 0];      // cylinder axis along Z
const X = [0, 0, HALF];      // cylinder axis along X

// ---- shared bits ----
export function knob(k, key, x, y, z, r = 0.015, d = 0.012) { k.cyl(key, [x, y, z + d / 2], r, d, Z, { segs: 14 }); }
export function feet(k, key, w, d, h = 0.02, r = 0.015, inset = 0.03) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(key, [sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)], r, h, null, { segs: 10 }); }
export function buttonGrid(k, keys, x0, y0, z, cols, rows, dx, dy, s) { let i = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) k.rbox(keys[i++ % keys.length], [x0 + c * dx, y0 - r * dy, z], [s, s * 0.8, s * 0.4], s * 0.2); }
function sound(e, name, opts) { if (G.audio) G.audio.play(name, e.root.position, opts); }
// Toggle every screen mesh inside a group on/off.
function toggleScreens(group, on) { group.traverse((o) => { if (o.userData.screen) o.material.emissiveIntensity = on ? 1.3 : 0.02; }); }
function onOff(label, group, snd = 'click') {
  let on = true;
  return { label: () => (on ? `Turn off the ${label}` : `Turn on the ${label}`), action: (e) => { on = !on; toggleScreens(group, on); sound(e, snd); } };
}

export const HOME = {
  // ================= Kitchen =================
  toaster(k, a, r) {
    const B = k.body(r.pick(['chrome', 'glossyPlastic', 'painted']), r.pick(['#c62828', '#e8e4dc', '#1a1a1c', '#4a8ac8', '#f2b8c8', '#8ac0a8']));
    const w = 0.29, h = 0.19, d = 0.17;
    k.rbox(B, [0, h / 2 + 0.012, 0], [w, h, d], 0.035);
    k.rbox('black', [0, 0.008, 0], [w * 0.96, 0.016, d * 0.96], 0.006);
    for (const x of [-0.055, 0.055]) {
      k.box('black', [x, h + 0.009, 0], [0.032, 0.006, d * 0.72]);
      k.rbox('#d49a52', [x, h + 0.035, 0], [0.02, 0.07, d * 0.62], 0.012); // toast
      k.rbox('#8a5a2a', [x, h + 0.07, 0], [0.021, 0.008, d * 0.6], 0.003);
    }
    k.rbox('black', [w / 2 + 0.008, h * 0.7, 0], [0.016, 0.02, 0.05], 0.006);
    knob(k, 'chrome', 0.08, 0.05, d / 2, 0.012, 0.01);
    k.box('led', [-0.08, 0.05, d / 2 + 0.002], [0.012, 0.006, 0.003]);
    return { name: 'Toaster', phys: { mass: 1.5 }, interact: { label: () => 'Make toast', action: (e) => { sound(e, 'pop'); sound(e, 'ding', {}); } } };
  },
  microwave(k, a, r) {
    const B = k.body(r.pick(['painted', 'glossyPlastic']), r.pick(['#e8e8e6', '#1c1c1e', '#a8acb0']));
    const w = 0.5, h = 0.3, d = 0.38;
    k.rbox(B, [0, h / 2, 0], [w, h, d], 0.02);
    k.rbox('tglass', [-0.06, h / 2, d / 2 + 0.003], [0.33, 0.22, 0.01], 0.01);
    k.box('#e8d8a0', [-0.06, h * 0.35, 0.02], [0.2, 0.004, 0.2]); // plate glow
    k.box('black', [0.18, h / 2, d / 2 + 0.002], [0.1, h * 0.86, 0.006]);
    k.screen([0.18, h * 0.8, d / 2 + 0.006], 0.07, 0.025, null, (g, W, H) => SCREENS.clock(g, W, H, 0, { fg: '#40ff80' }), { res: 128 });
    buttonGrid(k, ['gray'], 0.155, h * 0.66, d / 2 + 0.006, 3, 4, 0.022, 0.024, 0.016);
    k.rbox('chrome', [0.115, h / 2, d / 2 + 0.02], [0.012, 0.18, 0.02], 0.005);
    k.light([-0.06, h / 2, 0], '#ffe8b0', 0.4, 1.2, false);
    return { name: 'Microwave', phys: { mass: 12 }, interact: { label: () => 'Heat something up', action: (e) => { sound(e, 'whirr'); setTimeout(() => sound(e, 'ding'), 1400); } } };
  },
  washer(k, a, r, item) {
    const dryer = /dryer/.test(item.attrs.text);
    const B = k.body('glossyPlastic', r.pick(['#f2f2f0', '#e8e8e6', '#9aa0a8']));
    const w = 0.6, h = 0.85, d = 0.6;
    k.rbox(B, [0, h / 2, 0], [w, h, d], 0.02);
    k.box('lightgray', [0, h - 0.06, d / 2 + 0.003], [w * 0.96, 0.1, 0.008]);
    knob(k, 'chrome', -0.2, h - 0.06, d / 2 + 0.005, 0.03, 0.02);
    k.screen([0.12, h - 0.06, d / 2 + 0.009], 0.12, 0.04, null, (g, W, H) => SCREENS.text(g, W, H, 0, { text: dryer ? '0:45' : '1:20', fg: '#40c0ff' }), { res: 128 });
    k.torus('chrome', [0, 0.42, d / 2 + 0.01], 0.17, 0.025, null, TAU, 32);
    k.disc('tglass', [0, 0.42, d / 2 + 0.012], 0.16);
    const drum = k.sub([0, 0.42, d / 2 - 0.08]);
    drum.cyl('steel', [0, 0, 0], 0.15, 0.06, Z, { segs: 24, open: true });
    for (let i = 0; i < 3; i++) drum.box(dryer ? '#f0e8d8' : '#6a8ac8', [Math.cos(i * 2.1) * 0.08, Math.sin(i * 2.1) * 0.08, 0.02], [0.08, 0.05, 0.04], [0, 0, i]);
    let spin = 0;
    k.tick((dt) => { spin = Math.max(0, spin - dt * 0.2); drum.group.rotation.z += dt * (1 + spin * 20); });
    k.collide([-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    return { name: dryer ? 'Tumble dryer' : 'Washing machine', interact: { label: () => 'Start a cycle', action: (e) => { spin = 1; sound(e, 'whirr'); } } };
  },
  dishwasher(k, a, r) {
    const B = k.body('steel', '#c8ccd0');
    const w = 0.6, h = 0.85, d = 0.6;
    k.rbox(B, [0, h / 2, 0], [w, h, d], 0.015);
    k.box('black', [0, h - 0.05, d / 2 + 0.002], [w * 0.94, 0.07, 0.006]);
    k.rbox('chrome', [0, h - 0.12, d / 2 + 0.03], [0.4, 0.02, 0.02], 0.008);
    for (let i = 0; i < 4; i++) k.box('ledB', [-0.2 + i * 0.04, h - 0.05, d / 2 + 0.006], [0.012, 0.012, 0.003]);
    k.collide([-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    return { name: 'Dishwasher' };
  },
  oven(k, a, r) {
    const B = k.body(r.pick(['steel', 'painted']), r.pick(['#d8dadc', '#1a1a1c', '#e8e0cc', '#7a1a1a']));
    const w = 0.76, h = 0.9, d = 0.64;
    k.rbox(B, [0, h / 2, 0], [w, h, d], 0.015);
    k.box('black', [0, h + 0.004, 0], [w * 0.98, 0.008, d * 0.98]);
    for (const [x, z, rr] of [[-0.18, -0.14, 0.09], [0.18, -0.14, 0.07], [-0.18, 0.14, 0.07], [0.18, 0.14, 0.09]]) {
      k.torus('iron', [x, h + 0.02, z], rr, 0.008, [HALF, 0, 0], TAU, 24);
      k.torus('#3a70ff', [x, h + 0.012, z], rr * 0.6, 0.004, [HALF, 0, 0], TAU, 20);
    }
    k.box(B, [0, h + 0.07, -d / 2 + 0.03], [w, 0.14, 0.04]);
    for (let i = 0; i < 5; i++) knob(k, 'chrome', -0.28 + i * 0.14, h - 0.06, d / 2, 0.022, 0.02);
    k.rbox('tglass', [0, h * 0.42, d / 2 + 0.004], [w * 0.8, h * 0.45, 0.01], 0.02);
    k.rbox('chrome', [0, h * 0.72, d / 2 + 0.035], [w * 0.7, 0.022, 0.022], 0.01);
    k.box('fire', [0, h * 0.25, d / 2 - 0.05], [w * 0.6, 0.01, 0.02]);
    k.light([0, h * 0.4, d / 2], '#ffb060', 0.5, 1.5, false);
    k.collide([-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    return { name: 'Stove & oven' };
  },
  blender(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#c62828', '#e8e8e6', '#6a9ac8']));
    k.rbox(B, [0, 0.07, 0], [0.16, 0.14, 0.16], 0.03);
    k.cyl('chrome', [0, 0.155, 0], 0.06, 0.03);
    k.lathe('glass', [0, 0.17, 0], [[0.05, 0], [0.075, 0.22], [0.075, 0.23]], 20);
    const fill = r.pick(['#ff6a8a', '#8ad84a', '#ffb03a', '#c86ad8']);
    k.lathe('p:' + fill, [0, 0.175, 0], [[0, 0], [0.048, 0], [0.066, 0.12], [0, 0.12]], 18);
    k.cyl('black', [0, 0.41, 0], 0.078, 0.02);
    k.torus('black', [0.085, 0.29, 0], 0.045, 0.01, [0, 0, HALF], PI, 12);
    for (let i = 0; i < 3; i++) k.cyl(i === 0 ? 'led' : 'lightgray', [-0.03 + i * 0.03, 0.06, 0.082], 0.01, 0.01, Z, { segs: 10 });
    return { name: 'Blender', phys: { mass: 2 }, interact: { label: () => 'Blend a smoothie', action: (e) => sound(e, 'whirr') } };
  },
  kettle(k, a, r) {
    const B = k.body(r.pick(['chrome', 'glossyPlastic']), r.pick(['#c8ccd0', '#e8e8e6', '#c62828', '#2a2a2c']));
    k.cyl('black', [0, 0.01, 0], 0.1, 0.02, null, { segs: 24 });
    k.lathe(B, [0, 0.02, 0], [[0.09, 0], [0.1, 0.03], [0.095, 0.16], [0.07, 0.22], [0, 0.23]], 28);
    k.seg(B, [0.07, 0.06, 0], [0.16, 0.2, 0], 0.028, 0.012);
    k.tube('black', [[-0.08, 0.08, 0], [-0.15, 0.13, 0], [-0.13, 0.22, 0], [-0.04, 0.24, 0]], 0.014, 16);
    k.cyl('black', [0, 0.24, 0], 0.035, 0.02);
    return { name: 'Kettle', phys: { mass: 1.2 }, interact: { label: () => 'Boil water', action: (e) => sound(e, 'bubble') } };
  },
  coffeeMachine(k, a, r) {
    const B = k.body(r.pick(['steel', 'glossyPlastic']), r.pick(['#c8ccd0', '#1a1a1c', '#8a1a1a']));
    const w = 0.3, h = 0.38, d = 0.34;
    k.rbox(B, [0, 0.025, 0.02], [w, 0.05, d], 0.01);
    k.rbox(B, [0, h / 2 + 0.03, -d / 2 + 0.07], [w, h, 0.14], 0.02);
    k.rbox(B, [0, h - 0.02, 0.03], [w, 0.1, d - 0.02], 0.02);
    k.box('black', [0, 0.052, 0.07], [0.16, 0.006, 0.12]);
    k.cyl('chrome', [0, h - 0.09, 0.08], 0.035, 0.04, null, { segs: 16 });
    k.lathe('white', [0, 0.056, 0.08], [[0.025, 0], [0.035, 0.07], [0.036, 0.075]], 18);
    k.cyl('#3a2012', [0, 0.12, 0.08], 0.033, 0.004, null, { segs: 16 });
    k.torus('white', [0.04, 0.09, 0.08], 0.018, 0.005, [0, HALF, 0], PI, 10);
    k.screen([0.09, h - 0.02, d / 2 + 0.042], 0.06, 0.035, [-0.3, 0, 0], (g, W, H) => SCREENS.text(g, W, H, 0, { text: '☕ READY', fg: '#ffcf80', size: 0.4 }), { res: 128 });
    for (let i = 0; i < 3; i++) k.cyl('lightgray', [-0.09 + i * 0.03, h - 0.02, d / 2 + 0.04], 0.009, 0.01, Z);
    return { name: 'Coffee machine', phys: { mass: 6 }, interact: { label: () => 'Brew a coffee', action: (e) => { sound(e, 'whirr'); setTimeout(() => sound(e, 'ding'), 1300); } } };
  },
  mixer(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#c62828', '#f2e8d0', '#6ab0c8', '#2a2a2c', '#e8c8d8']));
    k.rbox(B, [0, 0.03, 0.02], [0.2, 0.06, 0.32], 0.03);
    k.seg(B, [0, 0.05, -0.1], [0, 0.3, -0.1], 0.06, 0.055);
    k.ball(B, [0, 0.33, -0.02], 0.07, [0.9, 0.8, 1.9]);
    k.lathe('chrome', [0, 0.06, 0.05], [[0.04, 0], [0.1, 0.1], [0.105, 0.14]], 24);
    k.seg('chrome', [0, 0.28, 0.05], [0, 0.14, 0.05], 0.008);
    return { name: 'Stand mixer', phys: { mass: 8 } };
  },
  vacuum(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#c62828', '#6a3ac8', '#f2b81a', '#3a3a3c']));
    k.rbox('dark', [0, 0.03, 0.12], [0.28, 0.05, 0.1], 0.02);
    k.seg('gray', [0, 0.05, 0.1], [0, 1.0, -0.05], 0.018);
    k.rbox(B, [0, 0.35, -0.02], [0.14, 0.34, 0.14], 0.05);
    k.cyl('glass', [0, 0.4, 0.05], 0.05, 0.18, null, { segs: 18 });
    k.rbox('black', [0, 1.04, -0.06], [0.1, 0.05, 0.03], 0.012);
    return { name: 'Vacuum cleaner', phys: { mass: 4 }, interact: { label: () => 'Switch it on', action: (e) => sound(e, 'whirr') } };
  },
  robotVacuum(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#f0f0ee']));
    k.cyl(B, [0, 0.045, 0], 0.17, 0.08, null, { segs: 36 });
    k.cyl('dark', [0, 0.087, 0], 0.13, 0.005, null, { segs: 32 });
    k.cyl('black', [0, 0.1, -0.05], 0.04, 0.02, null, { segs: 18 });
    k.box('ledB', [0, 0.09, 0.1], [0.04, 0.004, 0.01]);
    const top = k.top;
    let ang = r.range(0, TAU), wander = 0;
    return {
      name: 'Robot vacuum', phys: { mass: 3 },
      update: (e, dt) => {
        if (e.body && e.body.held) return;
        wander -= dt;
        if (wander < 0) { ang += r.range(-2, 2); wander = r.range(1, 4); }
        const w = G.worlds.get(e.worldId); if (!w) return;
        const nx = e.root.position.x + Math.sin(ang) * dt * 0.3, nz = e.root.position.z + Math.cos(ang) * dt * 0.3;
        const gy = w.terrain ? w.terrain.heightAt(nx, nz) : e.root.position.y;
        if (Math.abs(gy - e.root.position.y) < 0.15) { e.root.position.x = nx; e.root.position.z = nz; e.root.position.y = gy; e.root.rotation.y = ang; if (e.body) { e.body.x = nx; e.body.z = nz; e.body.y = gy; } } else ang += PI;
        void top;
      },
    };
  },
  fan(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#f0f0ee', '#6ab0d8', '#1a1a1c']));
    k.cyl(B, [0, 0.02, 0], 0.14, 0.04, null, { segs: 28 });
    k.seg(B, [0, 0.04, 0], [0, 0.9, 0], 0.02);
    k.rbox(B, [0, 0.95, -0.06], [0.1, 0.1, 0.12], 0.04);
    const head = k.sub([0, 0.95, 0.02]);
    head.torus('chrome', [0, 0, 0.02], 0.2, 0.004, null, TAU, 40);
    for (let i = 0; i < 12; i++) head.seg('chrome', [0, 0, 0.0], [Math.cos(i * TAU / 12) * 0.2, Math.sin(i * TAU / 12) * 0.2, 0.02], 0.002);
    const blades = head.sub([0, 0, 0.0]);
    blades.cyl(B, [0, 0, 0], 0.035, 0.03, Z, { segs: 16 });
    for (let i = 0; i < 3; i++) blades.ext('#8ac8e8', [[0, 0.02], [0.05, 0.16], [-0.03, 0.17], [-0.02, 0.03]], 0.004, [0, 0, 0], [0.2, 0, i * TAU / 3]);
    let on = true;
    k.tick((dt, t) => { if (on) blades.group.rotation.z += dt * 18; head.group.rotation.y = Math.sin(t * 0.5) * 0.6; });
    return { name: 'Electric fan', phys: { mass: 3 }, interact: { label: () => (on ? 'Switch off' : 'Switch on'), action: (e) => { on = !on; sound(e, 'click'); } } };
  },
  ceilingFan(k, a, r) {
    const B = k.body('darkWood', '#5a3a22');
    k.seg('brass', [0, 0, 0], [0, 0.4, 0], 0.012);
    k.cyl('brass', [0, 0.02, 0], 0.08, 0.1, null, { segs: 20 });
    const rot = k.sub([0, 0.0, 0]);
    for (let i = 0; i < 5; i++) { const an = i * TAU / 5; rot.box(B, [Math.sin(an) * 0.35, 0, Math.cos(an) * 0.35], [0.12, 0.012, 0.55], [0, an, 0]); }
    rot.ball('warm', [0, -0.08, 0], 0.07);
    k.tick((dt) => { rot.group.rotation.y += dt * 4; });
    return { name: 'Ceiling fan', static: true, float: 2.6 };
  },
  airConditioner(k, a, r) {
    k.body('glossyPlastic', '#f0f0ee');
    k.rbox('body', [0, 0.4, 0], [0.8, 0.28, 0.22], 0.05);
    for (let i = 0; i < 4; i++) k.box('lightgray', [0, 0.3 - i * 0.015, 0.105], [0.7, 0.006, 0.02], [0.3, 0, 0]);
    k.box('ledB', [0.3, 0.45, 0.111], [0.03, 0.006, 0.003]);
    return { name: 'Air conditioner', static: true };
  },
  radiator(k, a, r) {
    k.body('painted', '#f0f0ee');
    for (let i = 0; i < 12; i++) k.rbox('body', [-0.33 + i * 0.06, 0.4, 0], [0.045, 0.6, 0.08], 0.02);
    k.seg('body', [-0.36, 0.14, 0], [0.36, 0.14, 0], 0.015); k.seg('body', [-0.36, 0.66, 0], [0.36, 0.66, 0], 0.015);
    for (const x of [-0.3, 0.3]) k.seg('body', [x, 0, 0], [x, 0.12, 0], 0.012);
    return { name: 'Radiator', static: true };
  },
  sewingMachine(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#f0f0ee', '#6a1a1a']));
    k.rbox(B, [0, 0.03, 0], [0.42, 0.06, 0.18], 0.02);
    k.rbox(B, [0.15, 0.17, 0], [0.1, 0.24, 0.14], 0.03);
    k.rbox(B, [0, 0.27, 0], [0.4, 0.08, 0.13], 0.03);
    k.rbox(B, [-0.17, 0.2, 0], [0.07, 0.14, 0.1], 0.02);
    k.seg('chrome', [-0.17, 0.14, 0.02], [-0.17, 0.07, 0.02], 0.004);
    k.cyl('chrome', [0.21, 0.27, 0], 0.05, 0.02, X, { segs: 20 });
    k.cyl('#c62828', [0.05, 0.33, 0], 0.012, 0.04, null, { segs: 10 });
    k.label('SINGER', [0, 0.27, 0.066], 0.14, 0.03, null, { fg: '#d8b060' });
    return { name: 'Sewing machine', phys: { mass: 9 } };
  },
  // ================= Electronics =================
  laptop(k, a, r) {
    const B = k.body(r.pick(['metal', 'glossyPlastic']), r.pick(['#c8ccd2', '#2a2b2e', '#d8c8b8', '#8a9ab0']));
    const w = 0.34, d = 0.23;
    k.rbox(B, [0, 0.009, 0], [w, 0.018, d], 0.008);
    k.box('black', [0, 0.0185, -0.02], [w * 0.88, 0.002, d * 0.45]);
    for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 13; c++) k.box('dark', [-0.135 + c * 0.0225, 0.02, -0.075 + rr * 0.022], [0.018, 0.002, 0.017]);
    k.box('gray', [0, 0.0188, 0.07], [0.1, 0.001, 0.06]);
    const lid = k.sub([0, 0.018, -d / 2], [-0.3, 0, 0]);
    lid.rbox(B, [0, d / 2, -0.004], [w, d, 0.008], 0.006);
    lid.screen([0, d / 2 + 0.004, 0.0005], w * 0.9, d * 0.82, null, r.chance(0.5) ? SCREENS.desktop : SCREENS.code, { fps: 2 });
    return { name: 'Laptop', phys: { mass: 1.6 }, interact: onOff('laptop', k.group) };
  },
  computer(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#e8e8e6']));
    // Monitor
    k.rbox(B, [0, 0.01, -0.05], [0.24, 0.02, 0.18], 0.01);
    k.seg(B, [0, 0.02, -0.08], [0, 0.18, -0.08], 0.02);
    k.rbox(B, [0, 0.33, -0.07], [0.62, 0.36, 0.025], 0.012);
    k.screen([0, 0.335, -0.056], 0.58, 0.32, null, r.pick([SCREENS.desktop, SCREENS.code, SCREENS.game, SCREENS.chart]), { fps: 3 });
    // Keyboard & mouse
    k.rbox(B, [0, 0.012, 0.22], [0.44, 0.022, 0.14], 0.008);
    for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 17; c++) k.box('gray', [-0.2 + c * 0.025, 0.025, 0.17 + rr * 0.024], [0.02, 0.006, 0.019]);
    k.ball(B, [0.3, 0.015, 0.22], 0.03, [0.8, 0.5, 1.2]);
    // Tower
    k.rbox(B, [0.52, 0.22, -0.02], [0.2, 0.44, 0.44], 0.01);
    k.box('tglass', [0.419, 0.24, -0.02], [0.004, 0.36, 0.38]);
    for (let i = 0; i < 3; i++) k.torus(i === 0 ? 'cyanGlow' : 'magicGlow', [0.43, 0.34 - i * 0.1, -0.02], 0.04, 0.004, [0, HALF, 0], TAU, 20);
    k.light([0.45, 0.25, 0], '#8a6aff', 0.4, 1.2, false);
    return { name: 'Desktop computer', phys: { mass: 12 }, interact: onOff('computer', k.group) };
  },
  monitor(k, a, r) { return HOME.tv(k, a, r, null, true); },
  tv(k, a, r, item, monitor = false) {
    const B = k.body('glossyPlastic', '#141416');
    const big = monitor ? 0.6 : r.range(1.1, 1.5);
    const h = big * 0.5625;
    k.rbox(B, [0, 0.02, 0], [big * 0.35, 0.02, 0.22], 0.01);
    k.seg(B, [0, 0.02, -0.03], [0, 0.12, -0.03], 0.025);
    k.rbox(B, [0, 0.12 + h / 2, -0.02], [big, h, 0.035], 0.008);
    k.screen([0, 0.12 + h / 2, -0.001], big * 0.97, h * 0.95, null, r.pick([SCREENS.tv, SCREENS.game, SCREENS.bars]), { fps: 4, res: 320 });
    k.box('ledB', [big * 0.45, 0.13, 0.0], [0.01, 0.004, 0.004]);
    return { name: monitor ? 'Monitor' : 'Television', phys: { mass: monitor ? 4 : 14 }, interact: onOff(monitor ? 'monitor' : 'TV', k.group) };
  },
  oldTv(k, a, r) {
    const B = k.body('wood', '#6a4226');
    k.rbox(B, [0, 0.3, 0], [0.62, 0.48, 0.45], 0.03);
    k.rbox('dark', [-0.07, 0.3, 0.2], [0.42, 0.36, 0.07], 0.06);
    k.screen([-0.07, 0.3, 0.237], 0.36, 0.3, null, (g, w, h, t) => (Math.floor(t * 2) % 5 === 0 ? SCREENS.static(g, w, h) : SCREENS.bars(g, w, h)), { fps: 6, res: 160 });
    for (let i = 0; i < 2; i++) knob(k, 'chrome', 0.22, 0.38 - i * 0.12, 0.225, 0.025, 0.02);
    for (const s of [-1, 1]) k.seg('chrome', [0, 0.54, 0], [s * 0.2, 0.85, -0.05], 0.004);
    for (const s of [-1, 1]) for (const z of [-1, 1]) k.seg('darkWood', [s * 0.25, 0.08, z * 0.15], [s * 0.28, 0, z * 0.18], 0.015);
    return { name: 'Retro TV', phys: { mass: 18 }, interact: onOff('TV', k.group) };
  },
  gameConsole(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#141416', '#f0f0ee']));
    k.rbox(B, [0, 0.04, 0], [0.3, 0.08, 0.26], 0.015);
    k.box('cyanGlow', [0, 0.081, 0.05], [0.26, 0.002, 0.004]);
    // Controller in front.
    const c = k.sub([0.05, 0.02, 0.24]);
    c.rbox(B, [0, 0.015, 0], [0.15, 0.03, 0.07], 0.02);
    for (const s of [-1, 1]) c.ball(B, [s * 0.065, 0.013, 0.03], 0.032, [1, 0.6, 1.2]);
    for (const s of [-1, 1]) c.cyl('dark', [s * 0.03, 0.035, 0.0], 0.009, 0.012, null, { segs: 10 });
    for (const [x, z, col] of [[0.05, -0.01, 'led'], [0.06, 0.0, 'ledG'], [0.05, 0.01, 'ledB'], [0.04, 0.0, 'ledY']]) c.cyl(col, [x, 0.032, z], 0.005, 0.006, null, { segs: 8 });
    return { name: 'Game console', phys: { mass: 3 } };
  },
  arcade(k, a, r) {
    const B = k.body('painted', r.pick(['#1a1a3a', '#6a1a6a', '#1a3a6a', '#1a1a1a']));
    const w = 0.7, d = 0.8;
    k.box(B, [0, 0.45, 0], [w, 0.9, d]);
    k.box(B, [0, 1.35, -0.12], [w, 0.9, d - 0.24]);
    k.box(B, [0, 0.95, 0.2], [w, 0.12, 0.4], [-0.2, 0, 0]);
    k.box('black', [0, 1.3, 0.18], [w * 0.86, 0.6, 0.02], [-0.25, 0, 0]);
    k.screen([0, 1.3, 0.2], w * 0.78, 0.52, [-0.25, 0, 0], SCREENS.game, { fps: 8 });
    k.box('e:#ff3ac8', [0, 1.9, 0.14], [w * 0.9, 0.16, 0.02]);
    k.label(r.pick(['GALAXY RAID', 'PIXEL QUEST', 'NEON RACER', 'SPACE BLAST']), [0, 1.9, 0.152], w * 0.85, 0.14, null, { fg: '#fff', emissive: 1.5, stroke: '#300030' });
    k.seg('black', [-0.15, 1.02, 0.28], [-0.15, 1.08, 0.28], 0.006); k.ball('led', [-0.15, 1.09, 0.28], 0.018);
    for (let i = 0; i < 4; i++) k.cyl(['led', 'ledG', 'ledB', 'ledY'][i], [0.02 + i * 0.05, 1.03, 0.27 + (i % 2) * 0.02], 0.014, 0.012, [0.2, 0, 0], { segs: 12 });
    k.light([0, 1.3, 0.5], '#b06aff', 0.8, 2.5, false);
    k.collide([-w / 2, 0, -d / 2], [w / 2, 1.95, d / 2]);
    return { name: 'Arcade machine', interact: { label: () => 'Play a game', action: (e) => { for (let i = 0; i < 6; i++) setTimeout(() => sound(e, 'beep', { freq: 440 + i * 110 }), i * 90); } } };
  },
  vendingMachine(k, a, r) {
    const B = k.body('painted', r.pick(['#c62828', '#1a4a9a', '#1a1a1a', '#2a7a3a']));
    const w = 0.9, h = 1.85, d = 0.8;
    k.rbox(B, [0, h / 2, 0], [w, h, d], 0.02);
    k.box('glass', [-0.1, h * 0.58, d / 2 + 0.005], [0.6, 1.2, 0.01]);
    k.box('#f0f0f0', [-0.1, h * 0.58, d / 2 - 0.04], [0.58, 1.18, 0.02]);
    const cols = ['#c62828', '#2a7ad8', '#f2c21a', '#3ab84a', '#ff7a1a', '#8a3ac8'];
    for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 5; c++) k.cyl(cols[(rr * 2 + c) % cols.length], [-0.34 + c * 0.12, 0.62 + rr * 0.23, d / 2 - 0.1], 0.03, 0.12, null, { segs: 10 });
    for (let rr = 0; rr < 5; rr++) k.box('chrome', [-0.1, 0.55 + rr * 0.23, d / 2 - 0.08], [0.58, 0.01, 0.1]);
    k.box('dark', [0.3, h * 0.6, d / 2 + 0.005], [0.16, 0.5, 0.01]);
    buttonGrid(k, ['lightgray'], 0.26, h * 0.7, d / 2 + 0.012, 3, 4, 0.04, 0.05, 0.03);
    k.box('black', [-0.1, 0.25, d / 2 + 0.005], [0.5, 0.15, 0.02]);
    k.light([0, h * 0.6, d / 2 + 0.3], '#f0f8ff', 1, 3, false);
    k.collide([-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    return { name: 'Vending machine', interact: { label: () => 'Buy a drink', action: (e) => { sound(e, 'beep'); setTimeout(() => sound(e, 'bounce'), 500); } } };
  },
  atm(k, a, r) {
    const B = k.body('painted', r.pick(['#2a3a5a', '#3a3a3c', '#1a4a3a']));
    k.box(B, [0, 0.8, 0], [0.7, 1.6, 0.6]);
    k.box('black', [0, 1.2, 0.2], [0.5, 0.5, 0.25], [-0.25, 0, 0]);
    k.screen([0, 1.22, 0.33], 0.36, 0.26, [-0.25, 0, 0], (g, w, h) => SCREENS.text(g, w, h, 0, { text: 'WELCOME', bg: '#0a2a6a', fg: '#fff', size: 0.3 }), { res: 160 });
    buttonGrid(k, ['chrome'], -0.06, 0.95, 0.42, 3, 4, 0.05, 0.045, 0.035);
    k.box('black', [0.18, 0.95, 0.4], [0.1, 0.02, 0.05]);
    k.collide([-0.35, 0, -0.3], [0.35, 1.6, 0.3]);
    return { name: 'ATM' };
  },
  radio(k, a, r) {
    const retro = r.chance(0.6);
    const B = k.body(retro ? 'wood' : 'glossyPlastic', retro ? '#7a4a26' : '#2a2a2c');
    k.rbox(B, [0, 0.13, 0], [0.36, 0.24, 0.14], retro ? 0.06 : 0.02);
    k.rbox('fabric', [-0.07, 0.13, 0.071], [0.18, 0.16, 0.004], 0.02);
    k.screen([0.1, 0.17, 0.072], 0.1, 0.04, null, (g, w, h) => { g.fillStyle = '#f8e8b8'; g.fillRect(0, 0, w, h); g.fillStyle = '#c62828'; g.fillRect(w * 0.4, 0, 3, h); }, { res: 64, intensity: 0.6 });
    for (const x of [0.07, 0.13]) knob(k, 'cream', x, 0.08, 0.07, 0.018, 0.015);
    k.seg('chrome', [0.14, 0.25, -0.03], [0.24, 0.5, -0.03], 0.003);
    let playing = false;
    return {
      name: retro ? 'Vintage radio' : 'Radio', phys: { mass: 2 },
      interact: { label: () => (playing ? 'Turn off the radio' : 'Play some music'), action: (e) => { playing = !playing; if (playing) playTune(e, 'pluck'); else sound(e, 'click'); } },
    };
  },
  boombox(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#c8ccd0', '#c62828']));
    k.rbox(B, [0, 0.14, 0], [0.56, 0.24, 0.16], 0.03);
    for (const s of [-1, 1]) { k.torus('chrome', [s * 0.17, 0.13, 0.082], 0.075, 0.008, null, TAU, 28); k.disc('black', [s * 0.17, 0.13, 0.081], 0.075); k.ball('dark', [s * 0.17, 0.13, 0.078], 0.03, [1, 1, 0.5]); }
    k.box('tglass', [0, 0.16, 0.082], [0.14, 0.08, 0.004]);
    k.tube('chrome', [[-0.24, 0.26, 0], [-0.22, 0.34, 0], [0.22, 0.34, 0], [0.24, 0.26, 0]], 0.012, 20);
    return { name: 'Boombox', phys: { mass: 4 }, interact: { label: () => 'Drop a beat', action: (e) => playBeat(e) } };
  },
  speaker(k, a, r) {
    const B = k.body('painted', r.pick(['#1a1a1c', '#6a4226']));
    const h = r.range(0.6, 1.1);
    k.rbox(B, [0, h / 2, 0], [0.34, h, 0.32], 0.015);
    for (const [y, rr] of [[h * 0.3, 0.12], [h * 0.62, 0.07], [h * 0.85, 0.035]]) { k.torus('dark', [0, y, 0.162], rr, 0.01, null, TAU, 28); k.disc('black', [0, y, 0.161], rr); k.ball('gray', [0, y, 0.156], rr * 0.35, [1, 1, 0.5]); }
    return { name: 'Speaker', phys: { mass: 10 }, interact: { label: () => 'Play music', action: (e) => playBeat(e) } };
  },
  turntable(k, a, r) {
    const B = k.body('wood', '#6a4226');
    k.rbox(B, [0, 0.05, 0], [0.45, 0.1, 0.36], 0.01);
    const plat = k.sub([-0.05, 0.105, 0]);
    plat.cyl('black', [0, 0, 0], 0.15, 0.012, null, { segs: 40 });
    plat.cyl(r.pick(['#c62828', '#f2c21a', '#2a7ad8']), [0, 0.007, 0], 0.045, 0.002, null, { segs: 20 });
    for (let i = 0; i < 4; i++) plat.torus('dark', [0, 0.0065, 0], 0.07 + i * 0.018, 0.0012, [HALF, 0, 0], TAU, 36);
    k.cyl('chrome', [0.16, 0.12, -0.1], 0.02, 0.03);
    k.tube('chrome', [[0.16, 0.14, -0.1], [0.15, 0.14, 0.02], [0.05, 0.125, 0.06]], 0.004, 12);
    let spin = true;
    k.tick((dt) => { if (spin) plat.group.rotation.y -= dt * 3.5; });
    return { name: 'Record player', phys: { mass: 5 }, interact: { label: () => (spin ? 'Stop the record' : 'Play the record'), action: (e) => { spin = !spin; if (spin) playTune(e, 'piano'); } } };
  },
  camera(k, a, r) {
    const B = k.body('glossyPlastic', '#1a1a1c');
    k.rbox(B, [0, 0.07, 0], [0.14, 0.09, 0.07], 0.012);
    k.rbox(B, [-0.035, 0.125, 0], [0.05, 0.03, 0.05], 0.008);
    k.cyl('black', [0.01, 0.07, 0.06], 0.035, 0.06, Z, { segs: 24 });
    k.cyl('chrome', [0.01, 0.07, 0.09], 0.036, 0.006, Z, { segs: 24 });
    k.disc('tglass', [0.01, 0.07, 0.094], 0.028);
    k.cyl('chrome', [0.04, 0.12, 0.0], 0.008, 0.01, null, { segs: 10 });
    return { name: 'Camera', phys: { mass: 0.8 }, interact: { label: () => 'Take a photo', action: (e) => { sound(e, 'click'); if (G.renderer && G.renderer.passes && G.renderer.passes.final) { G.renderer.passes.final.uniforms.uFlash.value = 1; } } } };
  },
  videoCamera(k, a, r) {
    const B = k.body('glossyPlastic', '#1a1a1c');
    for (const s of [-1, 1]) k.seg('dark', [0, 0.9, 0], [s * 0.35, 0, 0.2], 0.012);
    k.seg('dark', [0, 0.9, 0], [0, 0, -0.4], 0.012);
    k.rbox(B, [0, 1.0, 0], [0.14, 0.16, 0.34], 0.02);
    k.cyl('black', [0, 1.02, 0.22], 0.06, 0.12, Z, { segs: 20 });
    k.disc('tglass', [0, 1.02, 0.281], 0.05);
    k.box('led', [0.05, 1.07, 0.16], [0.012, 0.012, 0.01]);
    return { name: 'Video camera', phys: { mass: 5 } };
  },
  microphone(k, a, r) {
    k.body('metal', '#2a2a2c');
    k.cyl('body', [0, 0.01, 0], 0.13, 0.02, null, { segs: 24 });
    k.seg('body', [0, 0.02, 0], [0, 1.45, 0], 0.012);
    k.seg('body', [0, 1.45, 0], [0, 1.5, 0.08], 0.008);
    k.seg('black', [0, 1.5, 0.08], [0, 1.54, 0.2], 0.018, 0.022);
    k.ball('chrome', [0, 1.55, 0.22], 0.03);
    return { name: 'Microphone', phys: { mass: 3 }, interact: { label: () => 'Check, one two', action: (e) => sound(e, 'beep', { freq: 2200 }) } };
  },
  headphones(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#1a1a1c', '#f0f0ee', '#c62828', '#2a7ad8']));
    k.torus(B, [0, 0.1, 0], 0.09, 0.012, null, PI, 20);
    for (const s of [-1, 1]) { k.cyl(B, [s * 0.09, 0.1, 0], 0.045, 0.035, X, { segs: 20 }); k.cyl('leather', [s * 0.07, 0.1, 0], 0.04, 0.02, X, { segs: 20 }); }
    return { name: 'Headphones', phys: { mass: 0.3 } };
  },
  printer(k, a, r) {
    const B = k.body('glossyPlastic', r.pick(['#f0f0ee', '#2a2a2c']));
    k.rbox(B, [0, 0.1, 0], [0.45, 0.2, 0.36], 0.02);
    k.box('paper', [0, 0.22, -0.12], [0.22, 0.06, 0.004], [-0.4, 0, 0]);
    k.box('dark', [0, 0.14, 0.181], [0.3, 0.02, 0.01]);
    k.box('paper', [0, 0.135, 0.2], [0.21, 0.002, 0.08]);
    k.box('ledG', [0.17, 0.19, 0.181], [0.012, 0.012, 0.003]);
    return { name: 'Printer', phys: { mass: 7 }, interact: { label: () => 'Print something', action: (e) => sound(e, 'whirr') } };
  },
  printer3d(k, a, r) {
    k.body('metal', '#2a2a2c');
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) k.box('body', [x, 0.25, z], [0.03, 0.5, 0.03]);
    k.box('body', [0, 0.5, 0], [0.43, 0.03, 0.43]);
    k.box('black', [0, 0.1, 0], [0.34, 0.01, 0.34]);
    k.box('#ff7a1a', [0, 0.14, 0], [0.08, 0.07, 0.08]);
    const head = k.sub([0, 0.25, 0]);
    head.box('chrome', [0, 0, 0], [0.4, 0.015, 0.015]);
    head.rbox('#2a7ad8', [0, -0.02, 0], [0.05, 0.05, 0.05], 0.008);
    k.tick((dt, t) => { head.group.position.x = Math.sin(t * 2) * 0.1; head.group.position.z = Math.cos(t * 1.3) * 0.1; });
    return { name: '3D printer', phys: { mass: 9 } };
  },
  serverRack(k, a, r) {
    k.body('painted', '#1a1a1c');
    const h = 2.0;
    k.box('body', [0, h / 2, 0], [0.62, h, 1.0]);
    for (let i = 0; i < 16; i++) {
      k.box('dark', [0, 0.15 + i * 0.11, 0.49], [0.56, 0.09, 0.03]);
      for (let j = 0; j < 4; j++) k.box([`ledG`, 'ledB', 'ledG', 'ledY'][(i + j) % 4], [0.18 + j * 0.025, 0.15 + i * 0.11, 0.508], [0.008, 0.008, 0.004]);
    }
    k.light([0, 1, 0.8], '#3aff8a', 0.4, 2, false);
    k.collide([-0.31, 0, -0.5], [0.31, h, 0.5]);
    return { name: 'Server rack' };
  },
  phoneBooth(k, a, r) {
    const B = k.body('painted', '#c01818');
    const w = 0.95, h = 2.5;
    for (const x of [-1, 1]) for (const z of [-1, 1]) k.box(B, [x * (w / 2 - 0.05), h / 2, z * (w / 2 - 0.05)], [0.1, h, 0.1]);
    for (const [x, z, ry] of [[0, -w / 2 + 0.03, 0], [-w / 2 + 0.03, 0, HALF], [w / 2 - 0.03, 0, HALF], [0, w / 2 - 0.03, 0]]) {
      k.box(B, [x, 0.25, z], [w - 0.15, 0.5, 0.04], [0, ry, 0]);
      k.box('glass', [x, 1.45, z], [w - 0.15, 1.8, 0.02], [0, ry, 0]);
      for (let i = 1; i < 6; i++) k.box(B, [x, 0.5 + i * 0.3, z], [w - 0.15, 0.03, 0.05], [0, ry, 0]);
    }
    k.box(B, [0, h + 0.05, 0], [w + 0.05, 0.1, w + 0.05]);
    k.dome(B, [0, h + 0.1, 0], w * 0.55, null, { scl: [1, 0.35, 1] });
    k.label('TELEPHONE', [0, h - 0.12, w / 2 + 0.005], w * 0.8, 0.14, null, { bg: '#1a1a1a', fg: '#fff', emissive: 0.6 });
    k.box('black', [0, 1.4, -w / 2 + 0.1], [0.25, 0.35, 0.1]);
    k.light([0, h - 0.3, 0], '#fff0d0', 1, 3, true);
    k.collide([-w / 2, 0, -w / 2], [w / 2, h, -w / 2 + 0.1]); k.collide([-w / 2, 0, -w / 2], [-w / 2 + 0.1, h, w / 2]); k.collide([w / 2 - 0.1, 0, -w / 2], [w / 2, h, w / 2]);
    return { name: 'Phone booth', interact: { label: () => 'Make a call', action: (e) => { for (let i = 0; i < 3; i++) setTimeout(() => sound(e, 'beep', { freq: 440 }), i * 900); } } };
  },
  // ================= Street furniture =================
  trafficLight(k, a, r) {
    k.body('painted', '#2a2a2c');
    k.seg('body', [0, 0, 0], [0, 3.2, 0], 0.07);
    k.rbox('body', [0, 3.3, 0.08], [0.34, 0.95, 0.28], 0.04);
    const lamps = [];
    ['#ff2020', '#ffb020', '#20ff50'].forEach((c, i) => {
      const y = 3.6 - i * 0.3;
      k.cyl('black', [0, y, 0.24], 0.12, 0.04, Z, { segs: 20 });
      k.cyl('black', [0, y + 0.07, 0.3], 0.13, 0.12, Z, { segs: 20, open: true, arc: PI, arcStart: -HALF });
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: 0.05 }));
      k.add(m, [0, y, 0.262]);
      lamps.push(m);
    });
    let phase = 0;
    k.tick((dt) => {
      phase = (phase + dt) % 12;
      const on = phase < 5 ? 2 : phase < 7 ? 1 : 0;
      lamps.forEach((m, i) => { m.material.emissiveIntensity = i === on ? 3.5 : 0.05; });
    });
    k.collideCyl(0, 0, 0, 3.2, 0.1);
    return { name: 'Traffic light', static: true };
  },
  busStop(k, a, r) {
    k.body('painted', r.pick(['#2a5a9a', '#2a2a2c', '#3a7a3a']));
    const w = 3.2, d = 1.4, h = 2.5;
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2 - 0.2]) k.box('body', [x, h / 2, z], [0.08, h, 0.08]);
    k.box('glass', [0, 1.3, -d / 2], [w, 2.0, 0.02]);
    k.box('glass', [-w / 2, 1.3, -0.1], [0.02, 2.0, d - 0.4]);
    k.rbox('body', [0, h + 0.04, -0.1], [w + 0.3, 0.08, d + 0.3], 0.02);
    k.box('wood', [0, 0.45, -d / 2 + 0.3], [w * 0.7, 0.05, 0.35]);
    for (const x of [-0.8, 0.8]) k.box('body', [x, 0.22, -d / 2 + 0.3], [0.05, 0.44, 0.3]);
    k.box('e:#f0f0f0', [w / 2 - 0.3, 1.4, -d / 2 + 0.05], [0.5, 1.4, 0.04]);
    k.seg('body', [w / 2 + 0.5, 0, 0.6], [w / 2 + 0.5, 2.8, 0.6], 0.04);
    k.cyl('white', [w / 2 + 0.5, 2.7, 0.62], 0.25, 0.04, Z, { segs: 24 });
    k.label('BUS', [w / 2 + 0.5, 2.7, 0.645], 0.3, 0.15, null, { fg: '#1a4a9a' });
    k.light([0, h - 0.2, 0], '#f0f8ff', 1, 4, true);
    k.collide([-w / 2, 0, -d / 2 - 0.05], [w / 2, h, -d / 2 + 0.05]);
    return { name: 'Bus stop', seats: [{ x: -0.6, y: 0.47, z: -d / 2 + 0.3, yaw: 0 }, { x: 0.6, y: 0.47, z: -d / 2 + 0.3, yaw: 0 }] };
  },
  hydrant(k, a, r) {
    const B = k.body('painted', r.pick(['#c62828', '#f2c21a', '#e8e8e6']));
    k.cyl(B, [0, 0.04, 0], 0.13, 0.08, null, { segs: 20 });
    k.cyl(B, [0, 0.35, 0], 0.1, 0.55, null, { segs: 20 });
    k.dome(B, [0, 0.62, 0], 0.11);
    k.cyl(B, [0, 0.74, 0], 0.025, 0.05, null, { segs: 6 });
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1]]) k.cyl('chrome', [x * 0.13, 0.42, z * 0.13], 0.045, 0.08, x ? X : Z, { segs: 12 });
    return { name: 'Fire hydrant', static: true, collideAuto: true };
  },
  parkingMeter(k, a, r) {
    k.body('painted', '#6a6c70');
    k.seg('body', [0, 0, 0], [0, 1.05, 0], 0.035);
    k.rbox('body', [0, 1.25, 0], [0.18, 0.35, 0.14], 0.06);
    k.dome('glass', [0, 1.33, 0.05], 0.07, [HALF, 0, 0]);
    k.box('black', [0, 1.15, 0.071], [0.05, 0.02, 0.005]);
    return { name: 'Parking meter', static: true };
  },
  trashCan(k, a, r) {
    const B = k.body(r.pick(['metal', 'glossyPlastic']), r.pick(['#8a8c90', '#2a6a3a', '#2a4a8a', '#3a3a3c']));
    k.lathe(B, [0, 0, 0], [[0.2, 0], [0.24, 0.8], [0.25, 0.82]], 28);
    for (const y of [0.2, 0.5]) k.torus(B, [0, y, 0], 0.215 + y * 0.05, 0.01, [HALF, 0, 0], TAU, 28);
    k.lathe(B, [0, 0.82, 0], [[0.26, 0], [0.22, 0.08], [0, 0.1]], 28);
    k.torus('chrome', [0, 0.96, 0], 0.05, 0.01, null, PI, 12);
    return { name: 'Trash can', phys: { mass: 6 } };
  },
  dumpster(k, a, r) {
    k.body('painted', r.pick(['#2a6a3a', '#2a4a8a', '#6a6c30']));
    k.ext('body', [[-0.9, 0], [0.9, 0], [1.0, 1.2], [-1.0, 1.2]], 1.2, [0, 0, 0], null, 0.02);
    k.box('black', [0, 1.24, 0], [2.0, 0.06, 1.2], [0.05, 0, 0]);
    for (const x of [-0.8, 0.8]) for (const z of [-0.5, 0.5]) k.cyl('dark', [x, 0.05, z], 0.06, 0.05, X, { segs: 12 });
    k.collide([-1, 0, -0.6], [1, 1.25, 0.6]);
    return { name: 'Dumpster' };
  },
  trafficCone(k, a, r) {
    k.body('glossyPlastic', '#ff6a10');
    k.box('body', [0, 0.015, 0], [0.36, 0.03, 0.36]);
    k.lathe('body', [0, 0.03, 0], [[0.13, 0], [0.03, 0.66], [0, 0.66]], 20);
    k.lathe('white', [0, 0.25, 0], [[0.1, 0], [0.078, 0.14]], 20);
    return { name: 'Traffic cone', phys: { mass: 1 } };
  },
  stopSign(k, a, r) {
    k.body('painted', '#c01818');
    k.seg('steel', [0, 0, 0], [0, 2.2, 0], 0.03);
    const oct = []; for (let i = 0; i < 8; i++) { const an = (i + 0.5) * TAU / 8; oct.push([Math.cos(an) * 0.38, Math.sin(an) * 0.38]); }
    k.ext('body', oct, 0.02, [0, 2.2, 0.04]);
    k.label('STOP', [0, 2.2, 0.052], 0.6, 0.22, null, { fg: '#ffffff', font: 'Arial, Helvetica, sans-serif' });
    return { name: 'Stop sign', static: true };
  },
  billboard(k, a, r, item) {
    k.body('steel', '#8a8c90');
    const w = 8, h = 3.6;
    for (const x of [-2.5, 2.5]) k.seg('body', [x, 0, 0], [x, 4.5, 0], 0.18);
    k.box('body', [0, 4.5 + h / 2, -0.1], [w + 0.3, h + 0.3, 0.2]);
    const txt = item.attrs.label || r.pick(['DRINK FIZZ', 'VISIT THE MOON', 'GENESIS', 'BUY MORE', 'HELLO WORLD']);
    k.screen([0, 4.5 + h / 2, 0.01], w, h, null, (g, W, H) => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, hsl(r.range(0, 1), 0.7, 0.5)); gr.addColorStop(1, hsl(r.range(0, 1), 0.7, 0.35)); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = `bold ${H * 0.3}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, H / 2); }, { res: 512, intensity: 0.8 });
    k.box('body', [0, 4.3, 0.6], [w, 0.08, 0.8]);
    for (const x of [-2.5, 0, 2.5]) k.light([x, 4.5, 1.2], '#fff4e0', 1.2, 5, true);
    k.collideCyl(-2.5, 0, 0, 4.5, 0.2); k.collideCyl(2.5, 0, 0, 4.5, 0.2);
    return { name: 'Billboard', static: true };
  },
  neonSign(k, a, r, item) {
    const txt = (item.attrs.label || r.pick(['OPEN', 'BAR', 'DINER', 'MOTEL', 'LOVE', 'NEON'])).toUpperCase();
    const col = k.color(r.pick(['#ff2ec8', '#1ec8ff', '#ff3030', '#39ff14', '#ffb020']));
    k.box('black', [0, 1, -0.03], [txt.length * 0.4 + 0.4, 0.8, 0.04]);
    k.label(txt, [0, 1, 0.0], txt.length * 0.4 + 0.2, 0.6, null, { fg: col, glow: col, emissive: 2.5 });
    k.light([0, 1, 0.5], col, 1.5, 4, false, true);
    return { name: `Neon sign "${txt}"`, static: true, glowColor: col };
  },
  // ================= Bathroom & office =================
  toilet(k, a, r) {
    k.body('glossyPlastic', '#f4f4f2');
    k.lathe('body', [0, 0, 0.05], [[0.12, 0], [0.13, 0.25], [0.2, 0.38], [0.21, 0.4]], 28, null, [0.85, 1, 1.15]);
    k.torus('body', [0, 0.41, 0.05], 0.15, 0.03, [HALF, 0, 0], TAU, 28);
    k.rbox('body', [0, 0.62, -0.18], [0.4, 0.4, 0.17], 0.04);
    k.rbox('chrome', [0.14, 0.78, -0.09], [0.05, 0.02, 0.02], 0.008);
    k.rbox('body', [0, 0.44, -0.08], [0.36, 0.03, 0.08], 0.01);
    return { name: 'Toilet', seats: [{ x: 0, y: 0.42, z: 0.05, yaw: 0 }], interact: { label: () => 'Flush', action: (e) => sound(e, 'splash') } };
  },
  sink(k, a, r) {
    k.body('glossyPlastic', '#f4f4f2');
    k.lathe('body', [0, 0, 0], [[0.1, 0], [0.08, 0.7], [0.1, 0.72]], 20);
    k.lathe('body', [0, 0.72, 0], [[0.05, 0], [0.26, 0.1], [0.28, 0.14], [0.25, 0.14], [0.05, 0.03]], 28, null, [1, 1, 0.75]);
    k.seg('chrome', [0, 0.84, -0.16], [0, 0.98, -0.16], 0.015);
    k.seg('chrome', [0, 0.98, -0.16], [0, 0.97, -0.06], 0.012);
    for (const s of [-1, 1]) k.cyl('chrome', [s * 0.08, 0.87, -0.16], 0.02, 0.04, null, { segs: 8 });
    return { name: 'Sink', static: true, collideAuto: true, interact: { label: () => 'Wash your hands', action: (e) => sound(e, 'splash') } };
  },
  shower(k, a, r) {
    k.body('glossyPlastic', '#f4f4f2');
    k.box('tiles', [0, 0.05, 0], [0.9, 0.1, 0.9]);
    k.box('glass', [0, 1.1, 0.44], [0.9, 2.0, 0.015]);
    k.box('glass', [0.44, 1.1, 0], [0.015, 2.0, 0.9]);
    k.box('tiles', [0, 1.15, -0.45], [0.9, 2.2, 0.04]);
    k.box('tiles', [-0.45, 1.15, 0], [0.04, 2.2, 0.9]);
    k.seg('chrome', [0, 1.1, -0.42], [0, 2.0, -0.42], 0.012);
    k.seg('chrome', [0, 2.0, -0.42], [0, 2.02, -0.2], 0.01);
    k.cyl('chrome', [0, 1.98, -0.18], 0.08, 0.02, null, { segs: 20 });
    k.collide([-0.47, 0, -0.47], [0.47, 2.2, -0.43]); k.collide([-0.47, 0, -0.47], [-0.43, 2.2, 0.47]);
    return { name: 'Shower', static: true };
  },
  hotTub(k, a, r) {
    k.body('wood', '#8a5a36');
    k.cyl('body', [0, 0.45, 0], 1.1, 0.9, null, { segs: 36, open: true });
    k.cyl('poolTiles', [0, 0.44, 0], 1.02, 0.86, null, { segs: 36, open: true });
    k.torus('darkWood', [0, 0.9, 0], 1.06, 0.06, [HALF, 0, 0], TAU, 36);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.02, 32), G.materials.get('water'));
    water.rotation.x = -HALF; k.add(water, [0, 0.78, 0]);
    k.light([0, 0.6, 0], '#40c0ff', 1, 3, false);
    k.collideCyl(0, 0, 0, 0.9, 1.12);
    return { name: 'Hot tub', static: true, interact: { label: () => 'Bubbles!', action: (e) => sound(e, 'bubble') } };
  },
  deskLamp(k, a, r) {
    const B = k.body('painted', r.pick(['#1a1a1c', '#c62828', '#f2c21a', '#e8e8e6']));
    k.cyl(B, [0, 0.01, 0], 0.08, 0.02, null, { segs: 20 });
    k.seg(B, [0, 0.02, 0], [0.05, 0.26, -0.02], 0.008);
    k.seg(B, [0.05, 0.26, -0.02], [0.18, 0.36, 0.05], 0.008);
    k.lathe(B, [0.19, 0.33, 0.07], [[0.01, 0.06], [0.03, 0.05], [0.075, -0.02], [0.08, -0.03]], 20, [0.6, 0, -0.3]);
    k.ball('warm', [0.2, 0.31, 0.08], 0.022);
    k.light([0.22, 0.25, 0.1], '#ffe0a0', 1.2, 2.5, false);
    return { name: 'Desk lamp', phys: { mass: 1.5 } };
  },
  lavaLamp(k, a, r) {
    const col = k.color(r.pick(['#ff3a8a', '#ff8a1a', '#3aff8a', '#8a3aff']));
    k.body('metal', '#c8ccd2');
    k.lathe('body', [0, 0, 0], [[0.06, 0], [0.035, 0.12], [0.04, 0.14]], 20);
    k.lathe('glass', [0, 0.14, 0], [[0.04, 0], [0.05, 0.14], [0.025, 0.3]], 20);
    k.lathe('body', [0, 0.44, 0], [[0.026, 0], [0.012, 0.05], [0, 0.05]], 16);
    const blobs = k.sub([0, 0, 0]);
    const bs = [];
    for (let i = 0; i < 4; i++) { const s = blobs.sub([0, 0.2 + i * 0.05, 0]); s.ball('e:' + col, [0, 0, 0], 0.014 + i * 0.003, [1, 1.3, 1]); bs.push(s); }
    k.tick((dt, t) => bs.forEach((s, i) => { s.group.position.y = 0.19 + (Math.sin(t * 0.4 + i * 1.7) * 0.5 + 0.5) * 0.2; }));
    k.light([0, 0.3, 0], col, 0.6, 1.5, false);
    return { name: 'Lava lamp', phys: { mass: 1.2 } };
  },
  safe(k, a, r) {
    k.body('painted', r.pick(['#2a3a2a', '#3a3a3c', '#5a1a1a']));
    k.rbox('body', [0, 0.35, 0], [0.6, 0.7, 0.55], 0.02);
    k.box('body', [0, 0.35, 0.28], [0.5, 0.6, 0.02]);
    const dial = k.sub([0, 0.4, 0.3]);
    dial.cyl('chrome', [0, 0, 0.01], 0.06, 0.02, Z, { segs: 28 });
    dial.box('black', [0, 0.045, 0.021], [0.006, 0.015, 0.002]);
    k.seg('chrome', [0.15, 0.3, 0.3], [0.15, 0.3, 0.33], 0.01); k.seg('chrome', [0.1, 0.3, 0.33], [0.2, 0.3, 0.33], 0.012);
    for (const y of [0.15, 0.55]) k.cyl('chrome', [-0.24, y, 0.285], 0.015, 0.1, null, { segs: 10 });
    return { name: 'Safe', phys: { mass: 80 }, interact: { label: () => 'Spin the dial', action: (e) => { dial.group.rotation.z += r.range(1, 5); sound(e, 'click'); } } };
  },
  filingCabinet(k, a, r) {
    k.body('painted', '#8a8c90');
    k.box('body', [0, 0.66, 0], [0.47, 1.32, 0.62]);
    for (let i = 0; i < 4; i++) { k.box('body', [0, 0.17 + i * 0.32, 0.315], [0.43, 0.28, 0.02]); k.rbox('chrome', [0, 0.25 + i * 0.32, 0.335], [0.12, 0.02, 0.02], 0.008); k.box('paper', [0, 0.12 + i * 0.32, 0.327], [0.07, 0.03, 0.002]); }
    return { name: 'Filing cabinet', phys: { mass: 40 } };
  },
  whiteboard(k, a, r, item) {
    k.body('alu', '#c8ccd2');
    for (const x of [-0.8, 0.8]) { k.seg('body', [x, 0, 0], [x, 1.9, 0], 0.02); k.seg('body', [x, 0.02, -0.25], [x, 0.02, 0.25], 0.02); }
    k.box('body', [0, 1.4, 0], [1.8, 1.0, 0.04]);
    const txt = item.attrs.label || 'E = mc²';
    k.screen([0, 1.4, 0.021], 1.74, 0.94, null, (g, w, h) => { g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a3a9a'; g.font = `bold ${h * 0.2}px "Comic Sans MS", cursive`; g.textAlign = 'center'; g.fillText(txt, w / 2, h * 0.45); g.strokeStyle = '#c62828'; g.lineWidth = 4; g.strokeRect(w * 0.1, h * 0.65, w * 0.3, h * 0.2); g.beginPath(); g.moveTo(w * 0.5, h * 0.85); g.lineTo(w * 0.65, h * 0.65); g.lineTo(w * 0.85, h * 0.8); g.stroke(); }, { res: 512, intensity: 0.45 });
    k.box('body', [0, 0.88, 0.05], [1.2, 0.03, 0.08]);
    return { name: 'Whiteboard', static: true };
  },
};

// ---- little musical helpers ----
const SCALE = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3, 659.3];
export function playTune(e, timbre = 'piano', notes = null) {
  const seq = notes || [0, 2, 4, 5, 4, 2, 0, 4, 7, 4];
  seq.forEach((n, i) => setTimeout(() => sound(e, 'note', { freq: SCALE[n % SCALE.length] * (n >= SCALE.length ? 2 : 1), timbre }), i * 220));
}
export function playBeat(e) {
  const pat = ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat'];
  for (let bar = 0; bar < 2; bar++) pat.forEach((p, i) => setTimeout(() => sound(e, 'note', { timbre: p }), (bar * 8 + i) * 200));
}
