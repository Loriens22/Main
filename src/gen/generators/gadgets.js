// ---------------------------------------------------------------------------
// Gadget generator: everyday objects, machines, instruments, toys, tools,
// magic items and more (about 150 hand-written recipes in gadgets_home,
// gadgets_fun and gadgets_sci), plus a generic composer that designs a
// plausible object for anything without a recipe ("a zorblax machine with
// wheels and a glowing core", "an ancient artifact", "a round toy with
// three eyes") from the archetype implied by the words, shape words
// (round, boxy, tall, star-shaped...) and requested parts (wheels, legs,
// wings, eyes, antennas, screens, pipes, propellers, spikes, tentacles...).
//
// The wrapper scales the model to the request (size words or explicit
// metres), makes small things physical (pick up, throw), big things solid,
// and wires up seats, interactions, lights and per-frame animation.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { Kit, SCREENS, solidBounds } from './gadgetkit.js';
import { HOME } from './gadgets_home.js';
import { FUN } from './gadgets_fun.js';
import { SCI } from './gadgets_sci.js';
import { FOOD } from './gadgets_food.js';
import { MISC } from './gadgets_misc.js';
import { attachPhysics } from './physics.js';
import { seatWorldFn, sitNearest } from './furniture.js';
import { glowSprite, hsl } from './common.js';
import { G } from '../../core/context.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const RECIPES = { ...HOME, ...FUN, ...SCI, ...FOOD, ...MISC };
export const RECIPE_NAMES = Object.keys(RECIPES);

// ---------------- Generic composer ----------------
const ARCHE_CUES = [
  ['machine', /\b(machine|device|gadget|contraption|engine|apparatus|generator|reactor|computer|console|appliance|capacitor|drive|core|module|unit|scanner|detector|converter|transformer|emitter|projector|laser|pod|capsule|chamber|terminal|hub|robot|mechanism|motor|pump|press|printer|synthesi[sz]er|analy[sz]er|amplifier|accelerator|collider|thingamajig|doohickey|gizmo|widget|\w+(?:tron|inator|izer|iser|matic|scope|meter|graph|phone|vator))\b/],
  ['relic', /\b(artifact|artefact|relic|idol|amulet|talisman|charm|orb|gem|jewel|tablet|rune|sigil|key|chalice|scepter|sceptre|trinket|medallion|necklace|ring|figurine|mask|urn|egg|stone|crystal|shard|fossil|meteorite|heart|soul|essence|elixir)\b/],
  ['toy', /\b(toy|plush|plushie|doll|puppet|figure|squishy|fidget|gizmo toy|pet rock)\b/],
  ['weapon', /\b(weapon|blade|sword|saber|sabre|axe|staff|wand|gun|blaster|launcher|bow|spear|lance|scythe|whip|club)\b/],
  ['tool', /\b(tool|utensil|implement|hammer|spanner|tongs|pliers|brush|scraper|spoon|fork|knife|ladle|whisk|opener|cutter|grabber|stick)\b/],
  ['container', /\b(box|case|crate|jar|pot|container|vessel|bin|tank|can|tin|flask|bottle|pouch|bag|sack|chest|cabinet|coffer|casket)\b/],
];
export function guessArche(text) {
  for (const [name, re] of ARCHE_CUES) if (re.test(text)) return name;
  return 'object';
}

function palette(k, a, r, arche) {
  const H = r.range(0, 1);
  const main = k.color(arche === 'machine' ? r.pick(['#6a7480', '#c8ccd2', '#2a5a8a', '#e8a81a', '#8a2a2a', '#2a6a4a']) : arche === 'relic' ? r.pick(['#d8a830', '#6a4aa8', '#2a8a8a', '#8a2a2a']) : hsl(H, r.range(0.55, 0.85), r.range(0.45, 0.6)));
  const second = k.color2(hsl(H + 0.45, 0.7, 0.5));
  const glow = a.primaryColor && a.flags.glow ? a.primaryColor : r.pick(['#40e8ff', '#7aff5a', '#ff4a8a', '#ffb030', '#b060ff']);
  return { main, second, glow };
}

function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Core shape: returns its box { w, h, d, y0 } so parts can attach to it.
function core(k, key, shape, w, h, d, y0) {
  const cy = y0 + h / 2;
  switch (shape) {
    case 'sphere': k.ball(key, [0, cy, 0], Math.max(w, h, d) / 2, [w / Math.max(w, h, d), h / Math.max(w, h, d), d / Math.max(w, h, d)], 28); break;
    case 'egg': k.lathe(key, [0, y0, 0], Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [Math.sin(t * PI) * w / 2 * (1 - 0.25 * t), t * h]; }), 28); break;
    case 'cyl': k.cyl(key, [0, cy, 0], w / 2, h, null, { segs: 28 }); break;
    case 'pyramid': k.cone(key, [0, cy, 0], w * 0.7, h, [0, PI / 4, 0], 4); break;
    case 'ring': k.torus(key, [0, cy, 0], h * 0.35, h * 0.14, null, TAU, 36); break;
    case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const an = i / 10 * TAU + HALF, rr = i % 2 ? h * 0.22 : h * 0.5; pts.push([Math.cos(an) * rr, Math.sin(an) * rr]); } k.ext(key, pts, d * 0.4, [0, cy, 0], null, h * 0.03); break; }
    case 'heart': { const pts = []; for (let i = 0; i < 32; i++) { const t = i / 32 * TAU; pts.push([16 * Math.pow(Math.sin(t), 3) / 34 * h, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34 * h]); } k.ext(key, pts, d * 0.4, [0, cy, 0], null, h * 0.03); break; }
    case 'gem': { const g = new THREE.OctahedronGeometry(h / 2, 0); g.scale(w / h, 1, d / h); k._add(key, g, [0, cy, 0]); break; }
    case 'ico': { const g = new THREE.IcosahedronGeometry(h / 2, 0); k._add(key, g, [0, cy, 0]); break; }
    default: k.rbox(key, [0, cy, 0], [w, h, d], Math.min(w, h, d) * 0.12);
  }
  return { w, h, d, y0 };
}

function countOf(a, word, def) { const wc = a.withCounts || {}; return wc[word] || wc[word + 's'] || def; }

// Attach requested parts to the core box C.
function parts(k, a, r, C, pal, has) {
  const top = C.y0 + C.h, cy = C.y0 + C.h / 2;
  if (has('wheel', 'wheels')) {
    const n = Math.max(2, Math.min(8, countOf(a, 'wheel', 4)));
    const rr = Math.min(C.h, C.d) * 0.28;
    for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, row = Math.floor(i / 2), rows = Math.ceil(n / 2); const z = rows === 1 ? 0 : -C.d * 0.35 + row * (C.d * 0.7 / (rows - 1)); k.cyl('tire', [side * (C.w / 2 + 0.02), C.y0 + rr * 0.2, z], rr, Math.max(0.03, rr * 0.4), [0, 0, HALF], { segs: 18 }); k.cyl('chrome', [side * (C.w / 2 + 0.03 + rr * 0.2), C.y0 + rr * 0.2, z], rr * 0.5, 0.01, [0, 0, HALF], { segs: 14 }); }
  }
  if (has('eye', 'eyes', 'eyed')) {
    const n = Math.max(1, Math.min(7, countOf(a, 'eye', a.eyes || 2)));
    const er = Math.min(C.w, C.h) * (n > 2 ? 0.1 : 0.14);
    for (let i = 0; i < n; i++) { const x = n === 1 ? 0 : -C.w * 0.3 + i * (C.w * 0.6 / (n - 1)); const y = cy + C.h * 0.15 + (n > 3 ? Math.sin(i * 1.7) * C.h * 0.1 : 0); k.ball('white', [x, y, C.d / 2], er, [1, 1, 0.6], 16); k.ball('black', [x, y + er * 0.1, C.d / 2 + er * 0.45], er * 0.5, [1, 1, 0.5], 12); }
  }
  if (has('antenna', 'antennas', 'antennae')) for (const s of [-1, 1]) { k.seg('chrome', [s * C.w * 0.25, top, 0], [s * C.w * 0.35, top + C.h * 0.6, 0], 0.008); k.ball('led', [s * C.w * 0.35, top + C.h * 0.6, 0], 0.025); }
  if (has('screen', 'display', 'monitor')) k.screen([0, cy, C.d / 2 + 0.006], C.w * 0.6, C.h * 0.4, null, r.pick([SCREENS.chart, SCREENS.wave, SCREENS.radar, SCREENS.code]), { fps: 6 });
  if (has('button', 'buttons', 'switches', 'dials', 'controls')) { for (let i = 0; i < 6; i++) k.cyl(['led', 'ledG', 'ledB', 'ledY', 'gray', 'white'][i], [-C.w * 0.3 + (i % 3) * C.w * 0.12, C.y0 + C.h * (i < 3 ? 0.25 : 0.15), C.d / 2 + 0.01], Math.min(C.w, C.h) * 0.04, 0.02, [HALF, 0, 0], { segs: 12 }); }
  if (has('light', 'lights', 'lamps', 'leds', 'blinking')) for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.ball(['led', 'ledG', 'ledB', 'ledY'][i % 4], [Math.cos(an) * C.w * 0.5, top - 0.02, Math.sin(an) * C.d * 0.5], 0.03); }
  if (has('pipe', 'pipes', 'tubes', 'hoses')) for (const s of [-1, 1]) k.tube('copper', [[s * C.w / 2, C.y0 + C.h * 0.3, 0], [s * (C.w / 2 + 0.15), C.y0 + C.h * 0.5, 0.05], [s * (C.w / 2 + 0.1), top + 0.1, -0.05], [s * C.w * 0.2, top + 0.15, 0]], Math.max(0.02, C.w * 0.04), 18);
  if (has('propeller', 'propellers', 'rotor', 'rotors')) {
    const p = k.sub([0, top + 0.12, 0]);
    p.seg('chrome', [0, -0.12, 0], [0, 0, 0], 0.015);
    for (let i = 0; i < 3; i++) p.box('dark', [0, 0.01, 0], [C.w * 1.4, 0.01, 0.06], [0, i * TAU / 3, 0]);
    k.tick((dt) => { p.group.rotation.y += dt * 20; });
  }
  if (has('wing', 'wings', 'winged')) for (const s of [-1, 1]) k.ext(has('bat', 'dragon', 'demon') ? 'leather' : 'white', [[0, 0], [s * C.w * 1.2, C.h * 0.5], [s * C.w * 1.0, C.h * 0.1], [s * C.w * 0.8, C.h * 0.2], [s * C.w * 0.6, -C.h * 0.05]], 0.02, [s * C.w * 0.45, cy, -C.d * 0.1], [0, 0, 0]);
  if (has('leg', 'legs', 'legged')) {
    const n = Math.max(2, Math.min(8, countOf(a, 'leg', a.legs || 4)));
    for (let i = 0; i < n; i++) { const an = i / n * TAU + PI / n; const x = Math.cos(an) * C.w * 0.4, z = Math.sin(an) * C.d * 0.4; k.seg(pal.secondKey, [x, C.y0 + 0.05, z], [x * 1.4, 0, z * 1.4], Math.max(0.015, C.w * 0.05)); }
  }
  if (has('arm', 'arms', 'claws', 'hands')) for (const s of [-1, 1]) { k.seg(pal.secondKey, [s * C.w / 2, cy, 0], [s * (C.w / 2 + C.h * 0.4), cy - C.h * 0.1, C.d * 0.3], Math.max(0.015, C.w * 0.04)); k.ball(pal.secondKey, [s * (C.w / 2 + C.h * 0.4), cy - C.h * 0.1, C.d * 0.3], Math.max(0.02, C.w * 0.07)); }
  if (has('tentacle', 'tentacles')) {
    const tent = [];
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; const t = k.sub([Math.cos(an) * C.w * 0.35, C.y0 + 0.02, Math.sin(an) * C.d * 0.35]); t.tube(pal.mainKey, [[0, 0, 0], [Math.cos(an) * 0.1, -0.02, Math.sin(an) * 0.1], [Math.cos(an) * 0.25, 0.05, Math.sin(an) * 0.25], [Math.cos(an) * 0.35, 0.02, Math.sin(an) * 0.35]], Math.max(0.02, C.w * 0.05), 14); tent.push(t); }
    k.tick((dt, t) => tent.forEach((s, i) => { s.group.rotation.y = Math.sin(t * 1.5 + i) * 0.3; }));
  }
  if (has('spike', 'spikes', 'spiky', 'spiked', 'thorns')) for (let i = 0; i < 14; i++) { const p = new THREE.Vector3(r.range(-1, 1), r.range(0.1, 1), r.range(-1, 1)).normalize(); k.cone('steel', [p.x * C.w / 2, cy + p.y * C.h / 2, p.z * C.d / 2], Math.min(C.w, C.h) * 0.06, Math.min(C.w, C.h) * 0.25, [Math.acos(clamp(p.y, -1, 1)) * (p.z >= 0 ? 1 : -1), 0, -Math.atan2(p.x, Math.max(0.01, Math.abs(p.y)))], 6); }
  if (has('horn', 'horns', 'horned')) for (const s of [-1, 1]) k.cone('bone', [s * C.w * 0.25, top + C.h * 0.15, 0], Math.min(C.w, C.h) * 0.07, C.h * 0.35, [0, 0, -s * 0.3], 10);
  if (has('gear', 'gears', 'cogs', 'clockwork', 'steampunk')) for (const s of [-1, 1]) { const g = k.sub([s * (C.w / 2 + 0.02), cy, 0], [0, 0, HALF]); const R = Math.min(C.h, C.d) * 0.3; g.cyl('brass', [0, 0, 0], R, 0.04, null, { segs: 24 }); for (let i = 0; i < 12; i++) g.box('brass', [Math.cos(i / 12 * TAU) * R, 0, Math.sin(i / 12 * TAU) * R], [R * 0.25, 0.04, R * 0.25], [0, -i / 12 * TAU, 0]); k.tick((dt) => { g.group.rotation.y += dt * s; }); }
  if (has('crystal', 'crystals', 'gems')) for (let i = 0; i < 5; i++) { const an = i / 5 * TAU; k.cone('crystal', [Math.cos(an) * C.w * 0.2, top + C.h * 0.15, Math.sin(an) * C.d * 0.2], C.w * 0.08, C.h * 0.4, [Math.sin(an) * 0.3, 0, Math.cos(an) * 0.3], 6); }
  if (has('handle', 'handles')) k.torus('chrome', [0, top, 0], Math.min(C.w, C.d) * 0.25, 0.015, null, PI, 16);
  if (has('door', 'hatch')) k.rbox(pal.secondKey, [0, C.y0 + C.h * 0.4, C.d / 2 + 0.01], [C.w * 0.4, C.h * 0.6, 0.02], 0.02);
  if (has('chimney', 'smokestack', 'exhaust')) k.cyl('iron', [C.w * 0.25, top + C.h * 0.3, -C.d * 0.2], C.w * 0.08, C.h * 0.6, null, { segs: 14 });
  if (has('fin', 'fins')) for (const s of [-1, 1]) k.ext(pal.secondKey, [[0, 0], [s * C.w * 0.4, -C.h * 0.2], [0, C.h * 0.4]], 0.02, [s * C.w / 2, C.y0 + C.h * 0.3, -C.d * 0.3], [0, 0, 0]);
  if (has('tail')) k.tube(pal.mainKey, [[0, cy, -C.d / 2], [0, cy - C.h * 0.1, -C.d * 0.8], [0, cy + C.h * 0.1, -C.d * 1.1]], Math.max(0.02, C.w * 0.06), 12);
  if (has('fire', 'flames', 'flaming', 'burning')) { for (let i = 0; i < 4; i++) k.cone('fire', [r.range(-0.3, 0.3) * C.w, top + C.h * 0.2, r.range(-0.3, 0.3) * C.d], C.w * 0.1, C.h * 0.4, null, 8); k.light([0, top + C.h * 0.4, 0], '#ff7a2a', 1.5, 5, false, true); }
  if (has('core', 'glowing core', 'reactor', 'power')) { k.ball('e:' + pal.glow, [0, top + C.h * 0.18, 0], Math.min(C.w, C.d) * 0.2); k.glow(pal.glow, [0, top + C.h * 0.18, 0], C.w * 1.4, 0.6); }
}

function machine(k, a, r, pal, shape, has) {
  const w = r.range(1.0, 1.6) * (has('tall') ? 0.8 : 1), h = r.range(1.1, 1.7) * (has('tall') ? 1.8 : has('flat') ? 0.4 : 1), d = r.range(0.8, 1.2);
  k.box('iron', [0, 0.08, 0], [w + 0.2, 0.16, d + 0.2]);
  const C = core(k, pal.mainKey, shape || r.pick(['box', 'box', 'cyl']), w, h, d, 0.16);
  const fz = C.d / 2 + 0.01, cy = C.y0 + C.h / 2;
  // Front panel: screen, gauges, buttons, lever.
  if (shape !== 'sphere' && shape !== 'cyl') {
    k.rbox('dark', [0, cy + C.h * 0.1, fz - 0.005], [C.w * 0.8, C.h * 0.55, 0.02], 0.02);
    k.screen([-C.w * 0.12, cy + C.h * 0.18, fz + 0.01], C.w * 0.42, C.h * 0.28, null, r.pick([SCREENS.wave, SCREENS.radar, SCREENS.chart, SCREENS.code]), { fps: 6 });
    for (let i = 0; i < 2; i++) { const x = C.w * 0.22, y = cy + C.h * (0.28 - i * 0.18); k.cyl('white', [x, y, fz + 0.01], C.h * 0.06, 0.02, [HALF, 0, 0], { segs: 20 }); k.box('led', [x, y + C.h * 0.02, fz + 0.022], [0.006, C.h * 0.05, 0.003], [0, 0, r.range(-1, 1)]); }
    for (let i = 0; i < 5; i++) k.cyl(['led', 'ledG', 'ledB', 'ledY', 'ledG'][i], [-C.w * 0.3 + i * C.w * 0.1, cy - C.h * 0.1, fz + 0.012], C.h * 0.025, 0.02, [HALF, 0, 0], { segs: 10 });
    const lever = k.sub([C.w * 0.36, cy - C.h * 0.25, fz + 0.02]);
    lever.seg('chrome', [0, 0, 0], [0, C.h * 0.18, 0.04], 0.012); lever.ball('led', [0, C.h * 0.18, 0.04], 0.03);
    k.tick((dt, t) => { lever.group.rotation.x = Math.sin(t * 0.7) * 0.3; });
    // Warning stripes
    for (let i = 0; i < 6; i++) k.box(i % 2 ? '#1a1a1a' : '#f2c21a', [-C.w * 0.4 + (i + 0.5) * C.w * 0.8 / 6, C.y0 + 0.05, fz], [C.w * 0.8 / 6, 0.06, 0.012]);
  } else {
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.ball(['led', 'ledG', 'ledB'][i % 3], [Math.cos(an) * C.w * 0.5, cy, Math.sin(an) * C.d * 0.5], 0.035); }
  }
  // Vents & side details.
  for (let i = 0; i < 5; i++) k.box('black', [C.w / 2 + 0.005, cy - C.h * 0.2 + i * 0.05, 0], [0.01, 0.02, C.d * 0.5]);
  if (!has('pipe', 'pipes')) k.tube('copper', [[-C.w / 2, C.y0 + 0.2, -C.d * 0.3], [-C.w / 2 - 0.2, C.y0 + C.h * 0.5, -C.d * 0.3], [-C.w * 0.3, C.y0 + C.h + 0.15, -C.d * 0.3]], 0.05, 14);
  // Top: glowing element.
  const glowTop = k.sub([0, C.y0 + C.h, 0]);
  if (r.chance(0.5)) { glowTop.cyl('glass', [0, 0.18, 0], C.w * 0.18, 0.36, null, { segs: 18 }); glowTop.ball('e:' + pal.glow, [0, 0.18, 0], C.w * 0.1); glowTop.cyl(pal.secondKey, [0, 0.38, 0], C.w * 0.2, 0.04, null, { segs: 18 }); }
  else { glowTop.seg('chrome', [0, 0, 0], [0, 0.4, 0], 0.03); glowTop.lathe('white', [0, 0.4, 0], [[0, 0], [0.18, 0.05], [0.3, 0.15]], 18, [-0.5, 0, 0]); }
  k.glow(pal.glow, [0, C.y0 + C.h + 0.2, 0], C.w, 0.4);
  k.light([0, C.y0 + C.h + 0.3, 0], pal.glow, 1, 4, false);
  k.collide([-(w + 0.2) / 2, 0, -(d + 0.2) / 2], [(w + 0.2) / 2, C.y0 + C.h, (d + 0.2) / 2]);
  return C;
}

function relic(k, a, r, pal, shape, has, noun) {
  k.m('pedestal', r.pick(['marble', 'stone', 'granite']), {});
  k.lathe('pedestal', [0, 0, 0], [[0.35, 0], [0.35, 0.08], [0.22, 0.14], [0.18, 0.75], [0.26, 0.82], [0.3, 0.9]], 20);
  const shp = shape || (/(egg)/.test(noun) ? 'egg' : /(gem|jewel|crystal|shard)/.test(noun) ? 'gem' : /(orb|heart|soul|essence)/.test(noun) ? 'sphere' : /(tablet|rune|sigil)/.test(noun) ? 'tablet' : /(key)/.test(noun) ? 'key' : /(ring)/.test(noun) ? 'ring' : /(mask)/.test(noun) ? 'mask' : r.pick(['ico', 'gem', 'sphere', 'egg']));
  const f = k.sub([0, 1.25, 0]);
  const mainMat = a.materials[0] || a.primaryColor ? pal.mainKey : r.pick(['gold', 'e:' + pal.glow, 'crystal', pal.mainKey]);
  if (shp === 'tablet') { f.rbox('stone', [0, 0, 0], [0.35, 0.5, 0.06], 0.02); f.label('ᛟ ᚱ ᛉ ᛗ', [0, 0, 0.032], 0.3, 0.4, null, { fg: pal.glow, glow: pal.glow, emissive: 2 }); }
  else if (shp === 'key') { f.torus('gold', [0, 0.12, 0], 0.08, 0.02, null, TAU, 20); f.seg('gold', [0, 0.04, 0], [0, -0.3, 0], 0.02); f.box('gold', [0.04, -0.25, 0], [0.08, 0.03, 0.02]); f.box('gold', [0.04, -0.18, 0], [0.06, 0.03, 0.02]); }
  else if (shp === 'mask') { f.ext(mainMat, [[-0.15, 0.1], [0, 0.18], [0.15, 0.1], [0.12, -0.12], [0, -0.2], [-0.12, -0.12]], 0.03, [0, 0, 0], null, 0.01); for (const s of [-1, 1]) f.ball('black', [s * 0.06, 0.03, 0.02], 0.025, [1, 0.6, 0.4]); }
  else core(f, mainMat, shp, 0.28, 0.32, 0.28, -0.16);
  for (let i = 0; i < 2; i++) { const b = f.sub([0, 0, 0], [i * 1.2, i * 0.7, 0]); b.torus('gold', [0, 0, 0], 0.26 + i * 0.05, 0.006, null, TAU, 40); }
  k.glow(pal.glow, [0, 1.25, 0], 1.3, 0.55);
  k.light([0, 1.25, 0], pal.glow, 1.2, 4, false);
  k.tick((dt, t) => { f.group.rotation.y += dt * 0.6; f.group.position.y = 1.25 + Math.sin(t * 1.4) * 0.05; });
  k.collideCyl(0, 0, 0, 0.9, 0.3);
  return { w: 0.28, h: 0.32, d: 0.28, y0: 1.09 };
}

function toy(k, a, r, pal, shape, has) {
  const w = 0.28, h = 0.3, d = 0.26;
  const C = core(k, pal.mainKey, shape || r.pick(['sphere', 'box', 'egg']), w, h, d, has('wheel', 'wheels') ? 0.06 : 0);
  if (!has('eye', 'eyes')) { for (const s of [-1, 1]) { k.ball('white', [s * w * 0.18, C.y0 + h * 0.62, d / 2 - 0.01], 0.04, [1, 1, 0.6], 14); k.ball('black', [s * w * 0.18, C.y0 + h * 0.64, d / 2 + 0.015], 0.02, [1, 1, 0.5], 10); } }
  k.torus('black', [0, C.y0 + h * 0.4, d / 2 - 0.005], 0.05, 0.008, [0, 0, PI], PI, 14);
  if (!has('arm', 'arms')) for (const s of [-1, 1]) k.ball(pal.secondKey, [s * (w / 2 + 0.02), C.y0 + h * 0.4, 0], 0.045);
  return C;
}

function tool(k, a, r, pal, shape, has) {
  const L = r.range(0.35, 0.6);
  k.seg('wood', [0, 0.02, -L / 2], [0, 0.02, L * 0.25], 0.016);
  k.seg('rubber', [0, 0.02, -L / 2], [0, 0.02, -L * 0.2], 0.02);
  const headKind = r.pick(['block', 'fork', 'loop', 'blade']);
  if (headKind === 'block') k.rbox(pal.mainKey, [0, 0.03, L * 0.3], [0.12, 0.05, 0.05], 0.01, [0, HALF, 0]);
  else if (headKind === 'fork') for (let i = -1; i <= 1; i++) k.seg('chrome', [i * 0.025, 0.02, L * 0.25], [i * 0.025, 0.02, L * 0.45], 0.005);
  else if (headKind === 'loop') k.torus(pal.mainKey, [0, 0.02, L * 0.35], 0.05, 0.008, [HALF, 0, 0], TAU, 20);
  else k.ext('steel', [[-0.02, 0], [0.02, 0], [0.03, 0.15], [-0.03, 0.15]], 0.004, [0, 0.02, L * 0.25], [-HALF, 0, 0]);
  return { w: 0.1, h: 0.05, d: L, y0: 0 };
}

function weapon(k, a, r, pal, shape, has) {
  const magic = has('magic', 'magical', 'enchanted', 'glowing', 'laser', 'plasma', 'energy', 'fire', 'ice', 'lightning');
  const L = r.range(0.8, 1.1);
  k.seg('leather', [0, 0.03, -0.25], [0, 0.03, -0.05], 0.018);
  k.ball('gold', [0, 0.03, -0.27], 0.03);
  k.rbox('gold', [0, 0.03, -0.03], [0.22, 0.04, 0.04], 0.012);
  const bladeKey = magic ? 'e:' + pal.glow : 'steel';
  k.ext(bladeKey, [[-0.03, 0], [0.03, 0], [0.025, L * 0.8], [0, L], [-0.025, L * 0.8]], 0.012, [0, 0.03, 0], [-HALF, 0, 0]);
  if (magic) { k.glow(pal.glow, [0, 0.03, L * 0.5], L, 0.4); k.light([0, 0.1, L * 0.5], pal.glow, 1, 3, false); }
  return { w: 0.22, h: 0.06, d: L + 0.3, y0: 0 };
}

function container(k, a, r, pal, shape, has, noun) {
  const round = shape === 'cyl' || shape === 'sphere' || /(jar|pot|can|tin|flask|bottle|urn|vessel|tank)/.test(noun);
  const w = r.range(0.35, 0.6), h = r.range(0.35, 0.7), d = w * 0.8;
  const C = round ? core(k, pal.mainKey, 'cyl', w, h, w, 0) : core(k, pal.mainKey, 'box', w, h, d, 0);
  if (round) { k.cyl(pal.secondKey, [0, h + 0.02, 0], w * 0.52, 0.04, null, { segs: 28 }); k.cyl(pal.secondKey, [0, h + 0.06, 0], w * 0.12, 0.05, null, { segs: 14 }); }
  else { k.rbox(pal.secondKey, [0, h + 0.02, 0], [w + 0.02, 0.04, d + 0.02], 0.01); for (const x of [-w * 0.35, w * 0.35]) k.box('iron', [x, h / 2, d / 2 + 0.003], [0.03, h, 0.006]); }
  k.label(titleCase(noun), [0, h * 0.5, (round ? w / 2 : d / 2) + 0.01], w * 0.8, h * 0.25, null, { bg: '#f4ecd8', fg: '#2a2a2a' });
  return C;
}

function genericObject(k, a, r, pal, shape, has, noun) {
  const w = r.range(0.4, 0.8), h = r.range(0.5, 1.0) * (has('tall') ? 1.8 : 1), d = w * r.range(0.7, 1);
  const legs = has('leg', 'legs', 'legged');
  const standH = legs ? 0.45 : 0.12;
  if (!legs) { k.cyl(pal.secondKey, [0, 0.06, 0], w * 0.55, 0.12, null, { segs: 28 }); }
  const C = core(k, pal.mainKey, shape || r.pick(['box', 'sphere', 'cyl', 'ico', 'egg', 'gem']), w, h, d, standH);
  if (!has('band')) k.torus(pal.secondKey, [0, C.y0 + C.h * 0.5, 0], Math.max(C.w, C.d) * 0.52, 0.012, [HALF, 0, 0], TAU, 32);
  if (!legs) k.label(titleCase(noun), [0, 0.06, w * 0.55 + 0.002], w * 0.9, 0.08, null, { bg: '#1a1a1a', fg: '#f0e0b0' });
  return C;
}

export function compose(k, a, r, item) {
  const text = (a.text || '').toLowerCase();
  const noun = (item.attrs.unknownNoun || item.params.noun || item.concept || 'thing').toLowerCase();
  const W = new Set((a.words || []).map((w) => w.toLowerCase()));
  const has = (...ws) => ws.some((w) => W.has(w) || new RegExp(`\\b${w}\\b`).test(text));
  const arche = item.params.arche || guessArche(text);
  const pal = palette(k, a, r, arche);
  pal.mainKey = k.body(arche === 'machine' ? 'painted' : arche === 'relic' ? 'glossyPlastic' : 'glossyPlastic', pal.main);
  pal.secondKey = 'g:' + pal.second;
  const shape = has('round', 'spherical', 'ball', 'globe', 'bubble') ? 'sphere' : has('cube', 'cubic', 'square', 'boxy', 'block') ? 'box' : has('cylindrical', 'cylinder', 'tube', 'pillar', 'barrel') ? 'cyl' : has('pyramid', 'triangular', 'triangle') ? 'pyramid' : has('donut', 'doughnut', 'hoop', 'ring-shaped') ? 'ring' : has('star', 'star-shaped') ? 'star' : has('heart', 'heart-shaped') ? 'heart' : has('egg', 'oval') ? 'egg' : null;
  let C;
  switch (arche) {
    case 'machine': C = machine(k, a, r, pal, shape, has); break;
    case 'relic': C = relic(k, a, r, pal, shape, has, noun); break;
    case 'toy': C = toy(k, a, r, pal, shape, has); break;
    case 'tool': C = tool(k, a, r, pal, shape, has); break;
    case 'weapon': C = weapon(k, a, r, pal, shape, has); break;
    case 'container': C = container(k, a, r, pal, shape, has, noun); break;
    default: C = genericObject(k, a, r, pal, shape, has, noun);
  }
  parts(k, a, r, C, pal, has);
  const name = item.params.displayName || titleCase(noun.replace(/-/g, ' '));
  const small = arche === 'tool' || arche === 'weapon' || arche === 'toy' || arche === 'container';
  const interact = arche === 'machine' ? { label: () => `Switch on the ${noun}`, action: (e) => { if (G.audio) { G.audio.play('whirr', e.root.position); setTimeout(() => G.audio.play('beep', e.root.position, { freq: 1200 }), 900); } } }
    : arche === 'relic' ? { label: () => `Touch the ${noun}`, action: (e) => { if (G.audio) G.audio.play('magic', e.root.position); } } : null;
  return { name, phys: small ? { mass: 1 } : null, static: !small, interact };
}

// ---------------- Generator ----------------
const SDF_KINDS = new Set(['teddyBear', 'rubberDuck', 'piggyBank', 'brain']);

function sparkle(root, color, radius, height) {
  const sprites = [];
  for (let i = 0; i < 6; i++) { const s = glowSprite(color, 0.12, 0); s.position.set((Math.random() - 0.5) * radius * 2, Math.random() * height, (Math.random() - 0.5) * radius * 2); root.add(s); sprites.push({ s, ph: Math.random() * TAU }); }
  return (dt, t) => { for (const p of sprites) p.s.material.opacity = Math.max(0, Math.sin(t * 3 + p.ph)) * 0.9; };
}

function scaleC(c, s) {
  if (c.type === 'cyl') return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, r: c.r * s };
  return { ...c, x: c.x * s, z: c.z * s, y0: c.y0 * s, y1: c.y1 * s, hx: c.hx * s, hz: c.hz * s };
}

export const gadgetGen = {
  maxCount: 24,
  estimate: (item) => (SDF_KINDS.has(item.params.kind) ? 3.5 : 1),
  stages: () => [{ name: 'geometry', label: 'Modelling', weight: 3 }, { name: 'textures', label: 'Finishing', weight: 1 }],
  *build(ctx, item, rng) {
    const a = item.attrs;
    const kind = item.params.kind;
    const recipe = RECIPES[kind];
    const k = new Kit(a, rng);
    ctx.stage('geometry', `Modelling ${item.params.displayName || item.concept || kind || 'object'}`);
    yield;
    let info;
    if (recipe) {
      const res = recipe(k, a, rng, item, ctx);
      info = res && typeof res.next === 'function' ? yield* res : res;
    } else info = compose(k, a, rng, item);
    info = info || { name: 'Object' };
    ctx.stage('textures', 'Finishing');
    yield;
    k.finish();
    // Measure the natural model.
    const box = solidBounds(k.group);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.4, 0.2));
    const natH = Math.max(0.02, box.max.y), ext = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z, 0.05);
    const maxDim = Math.max(natH, ext * 2);
    // Scale to the request.
    let s = clamp(a.sizeMul || 1, 0.05, 40);
    if (a.dims && a.dims.height) s = a.dims.height / natH;
    else if (a.dims && (a.dims.size || a.dims.length || a.dims.width)) s = (a.dims.size || a.dims.length || a.dims.width) / maxDim;
    s = clamp(s, 0.02, 200);
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.add(k.group);
    holder.scale.setScalar(s);
    root.add(holder);
    const giant = s * maxDim > 3 && info.phys;
    const height = natH * s;
    const data = {
      root, name: info.name, category: 'object', icon: item.icon || '📦', height, footprint: { radius: Math.max(0.15, ext * s) },
      colliderDefs: k.colliders.map((c) => scaleC(c, s)),
      lights: k.lights.map((l) => ({ ...l, pos: l.pos.map((v) => v * s), distance: l.distance * Math.max(1, s), intensity: l.intensity * Math.min(3, Math.max(1, s)) })),
      suppressGrass: false,
    };
    if (!data.colliderDefs.length && !info.noCollide && (info.static || info.collideAuto || giant || !info.phys) && maxDim * s > 0.35) {
      data.colliderDefs.push({ type: 'box', x: (box.min.x + box.max.x) / 2 * s, z: (box.min.z + box.max.z) / 2 * s, y0: Math.max(0, box.min.y) * s, y1: box.max.y * s, hx: (box.max.x - box.min.x) / 2 * s, hz: (box.max.z - box.min.z) / 2 * s });
    }
    if (info.float) { holder.position.y = info.float; data.height += info.float; }
    // Seats.
    if (info.seats && info.seats.length) {
      data.seats = info.seats.map((st) => ({ ...st, x: st.x * s, y: st.y * s, z: st.z * s }));
      data.seatWorld = seatWorldFn(data);
      if (!info.interact) data.interact = { label: () => 'Sit', action: (e, player) => sitNearest(data, player) };
    }
    if (info.interact) {
      if (data.seats) { const base = info.interact; let alt = 0; data.interact = { label: () => (alt % 2 ? 'Sit' : base.label()), action: (e, player) => { if (alt++ % 2) sitNearest(data, player); else base.action(e, player); } }; }
      else data.interact = info.interact;
    }
    // Per-frame behaviour.
    const ticks = [...k.ticks];
    if (info.sparkle) ticks.push(sparkle(holder, info.sparkle, ext, natH));
    const infoUpdate = info.update;
    if (ticks.length || infoUpdate) {
      data.update = function (dt, t, dist) {
        for (const f of ticks) f(dt, t, dist ?? 0);
        if (infoUpdate) infoUpdate(this, dt, t);
      };
    }
    // Physics for small things (giant versions stay put so you can climb them).
    if (info.phys && !giant && !a.flags.float) attachPhysics(data, { mass: (info.phys.mass || 1) * s * s * s, radius: Math.max(0.08, ext * s * 0.8), height, roll: !!info.phys.roll });
    if (a.flags.float || a.placementFloat) {
      data.floating = true; data.floatHeight = 1.2;
      const y0 = holder.position.y;
      const prev = data.update;
      data.update = function (dt, t, dist) { if (prev) prev.call(this, dt, t, dist); holder.position.y = y0 + 0.6 + Math.sin(t * 1.3) * 0.12; };
    }
    if (a.flags.spin) { const prev = data.update; data.update = function (dt, t, dist) { if (prev) prev.call(this, dt, t, dist); holder.rotation.y += dt * 1.2; }; }
    return data;
  },
};
