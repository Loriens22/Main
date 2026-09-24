// ---------------------------------------------------------------------------
// Creatures: animals, dinosaurs, dragons and monsters.
//
// Pipeline per creature:
//   1. A species template (archetype + per-species overrides + random
//      variation + prompt attributes) defines proportions, head/ear/horn/
//      tail types, coat colours and patterns.
//   2. A skeleton is laid out from those proportions (spine, neck, head,
//      tail chain, N legs x 3 bones, optional wings).
//   3. The body is sculpted as an SDF (smooth-unioned ellipsoids and round
//      cones, each tagged with a bone and material), meshed with surface
//      nets and SDF-skinned to the skeleton.
//   4. Coat patterns (stripes, spots, patches, giraffe cells, panda, mask,
//      socks...) are painted into vertex colours procedurally.
//   5. A procedural animator drives gaits (walk/trot/gallop phase offsets
//      per leg, hind legs with reversed hocks), spine bob, head look-at,
//      tail wag, ear flicks, breathing and wing flaps; an NPC brain makes
//      the animal wander, follow you, come, sit, and react to being petted.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, genPreset } from '../../core/context.js';
import { SDFBuilder } from '../../core/sdf.js';
import { Noise } from '../../core/noise.js';
import { makeNPC } from '../../characters/npc.js';
import { NAMES } from '../lexicon.js';
import { sdfToGeometry } from './sdfkit.js';
import { hsl } from './common.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
function has(a, ...ws) { return ws.some((w) => a.words.includes(w) || a.text.includes(w)); }

// ---------------- Species templates ----------------
// S = shoulder height (m). Other lengths are fractions of S.
const ARCH = {
  canine: { S: 0.55, len: 1.25, girth: 0.25, neck: [0.34, 0.75, 0.13], head: { r: 0.2, snout: 0.26, snoutR: 0.1, ears: 'pointy', earS: 0.13 }, leg: 0.085, foot: 'paw', tail: ['bushy', 0.8, 0.55], coat: 'fur', gait: [1.3, 6], sound: 'bark', pitch: 420 },
  feline: { S: 0.3, len: 1.5, girth: 0.28, neck: [0.28, 0.55, 0.14], head: { r: 0.22, snout: 0.1, snoutR: 0.11, ears: 'pointy', earS: 0.12 }, leg: 0.08, foot: 'paw', tail: ['thin', 1.4, 0.35], coat: 'fur', gait: [0.9, 5], sound: 'meow', pitch: 700 },
  equine: { S: 1.55, len: 1.35, girth: 0.22, neck: [0.55, 1.0, 0.1], head: { r: 0.11, snout: 0.3, snoutR: 0.075, ears: 'pointy', earS: 0.08 }, leg: 0.05, foot: 'hoof', tail: ['tuft', 0.6, -0.3], coat: 'fur', gait: [1.6, 9], sound: 'neigh', pitch: 300, mane: true },
  bovine: { S: 1.4, len: 1.5, girth: 0.33, neck: [0.25, 0.5, 0.18], head: { r: 0.13, snout: 0.2, snoutR: 0.1, ears: 'side', earS: 0.07 }, leg: 0.065, foot: 'hoof', tail: ['tuft', 0.65, -0.4], coat: 'fur', gait: [1.1, 4], sound: 'moo', pitch: 140 },
  ovine: { S: 0.75, len: 1.3, girth: 0.33, neck: [0.25, 0.7, 0.14], head: { r: 0.14, snout: 0.16, snoutR: 0.08, ears: 'side', earS: 0.09 }, leg: 0.06, foot: 'hoof', tail: ['short', 0.2, -0.2], coat: 'wool', gait: [1.0, 4], sound: 'baa', pitch: 400 },
  suid: { S: 0.7, len: 1.45, girth: 0.36, neck: [0.12, 0.3, 0.25], head: { r: 0.2, snout: 0.22, snoutR: 0.09, ears: 'floppy', earS: 0.1, flatNose: true }, leg: 0.07, foot: 'hoof', tail: ['curly', 0.25, 0.3], coat: 'skin', gait: [0.9, 3.5], sound: 'oink', pitch: 300 },
  cervid: { S: 1.1, len: 1.3, girth: 0.22, neck: [0.5, 1.1, 0.1], head: { r: 0.12, snout: 0.22, snoutR: 0.07, ears: 'pointy', earS: 0.12 }, leg: 0.045, foot: 'hoof', tail: ['short', 0.15, 0.3], coat: 'fur', gait: [1.3, 10], sound: 'bleat', pitch: 350 },
  ursid: { S: 1.05, len: 1.45, girth: 0.36, neck: [0.25, 0.4, 0.22], head: { r: 0.2, snout: 0.18, snoutR: 0.1, ears: 'round', earS: 0.07 }, leg: 0.11, foot: 'paw', tail: ['short', 0.1, 0.2], coat: 'fur', gait: [1.0, 7], sound: 'roar', pitch: 120 },
  elephant: { S: 2.8, len: 1.25, girth: 0.34, neck: [0.1, 0.2, 0.3], head: { r: 0.22, snout: 0.0, snoutR: 0.08, ears: 'elephant', earS: 0.3, trunk: 0.75, tusks: true }, leg: 0.1, foot: 'column', tail: ['thin', 0.4, -0.5], coat: 'hide', gait: [1.2, 4], sound: 'trumpet', pitch: 200 },
  giraffe: { S: 2.9, len: 0.95, girth: 0.18, neck: [1.0, 1.3, 0.07], head: { r: 0.09, snout: 0.16, snoutR: 0.05, ears: 'pointy', earS: 0.06, ossicones: true }, leg: 0.035, foot: 'hoof', tail: ['tuft', 0.4, -0.3], coat: 'fur', gait: [1.5, 7], sound: 'hum', pitch: 200 },
  rhino: { S: 1.6, len: 1.55, girth: 0.34, neck: [0.18, 0.35, 0.22], head: { r: 0.16, snout: 0.26, snoutR: 0.11, ears: 'pointy', earS: 0.07, horn: 'rhino' }, leg: 0.1, foot: 'column', tail: ['thin', 0.25, -0.3], coat: 'hide', gait: [1.1, 6], sound: 'snort', pitch: 150 },
  camel: { S: 1.9, len: 1.2, girth: 0.22, neck: [0.6, 0.7, 0.08], head: { r: 0.1, snout: 0.2, snoutR: 0.06, ears: 'round', earS: 0.04 }, leg: 0.045, foot: 'pad', tail: ['tuft', 0.35, -0.3], coat: 'fur', gait: [1.3, 6], sound: 'groan', pitch: 160, hump: 1 },
  leporid: { S: 0.2, len: 1.6, girth: 0.42, neck: [0.1, 0.8, 0.25], head: { r: 0.3, snout: 0.12, snoutR: 0.16, ears: 'long', earS: 0.55 }, leg: 0.1, foot: 'paw', tail: ['puff', 0.15, 0.5], coat: 'fur', gait: [0.6, 5], sound: 'squeak', pitch: 900, hop: true },
  rodent: { S: 0.07, len: 1.8, girth: 0.45, neck: [0.1, 0.4, 0.3], head: { r: 0.35, snout: 0.3, snoutR: 0.14, ears: 'round', earS: 0.25 }, leg: 0.1, foot: 'paw', tail: ['thin', 2.2, 0.1], coat: 'fur', gait: [0.3, 1.5], sound: 'squeak', pitch: 1400 },
  primate: { S: 0.55, len: 1.0, girth: 0.28, neck: [0.18, 1.2, 0.18], head: { r: 0.22, snout: 0.08, snoutR: 0.12, ears: 'round', earS: 0.08 }, leg: 0.07, foot: 'paw', tail: ['thin', 1.3, 0.6], coat: 'fur', gait: [1.0, 4], sound: 'chatter', pitch: 600, frontLong: 1.25 },
  theropod: { S: 3.6, len: 1.4, girth: 0.28, neck: [0.35, 0.3, 0.2], head: { r: 0.2, snout: 0.3, snoutR: 0.13, ears: 'none', teeth: true }, leg: 0.12, foot: 'claw', tail: ['thick', 1.9, 0.1], coat: 'scales', gait: [1.6, 6], sound: 'roar', pitch: 90, biped: true },
  sauropod: { S: 4.5, len: 1.3, girth: 0.3, neck: [1.6, 0.75, 0.12], head: { r: 0.08, snout: 0.08, snoutR: 0.05, ears: 'none' }, leg: 0.1, foot: 'column', tail: ['thick', 2.2, 0.0], coat: 'scales', gait: [1.2, 3], sound: 'roar', pitch: 70 },
  ceratopsian: { S: 2.0, len: 1.6, girth: 0.34, neck: [0.18, 0.3, 0.25], head: { r: 0.22, snout: 0.25, snoutR: 0.12, ears: 'none', frill: true, horn: 'triceratops' }, leg: 0.1, foot: 'column', tail: ['thick', 0.9, 0.0], coat: 'scales', gait: [1.1, 4], sound: 'roar', pitch: 110 },
  dragon: { S: 2.4, len: 1.5, girth: 0.26, neck: [0.9, 0.8, 0.1], head: { r: 0.15, snout: 0.3, snoutR: 0.09, ears: 'none', horn: 'dragon', teeth: true }, leg: 0.08, foot: 'claw', tail: ['spiked', 2.2, 0.15], coat: 'scales', gait: [1.3, 7], sound: 'roar', pitch: 80, wings: 1.8, spikes: true },
  griffin: { S: 1.5, len: 1.35, girth: 0.25, neck: [0.4, 1.0, 0.13], head: { r: 0.16, snout: 0.0, snoutR: 0.06, ears: 'tuft', earS: 0.08, beak: true }, leg: 0.07, foot: 'claw', tail: ['tuft', 1.0, 0.1], coat: 'fur', gait: [1.3, 8], sound: 'screech', pitch: 500, wings: 1.6 },
  croc: { S: 0.4, len: 3.4, girth: 0.5, neck: [0.2, 0.05, 0.4], head: { r: 0.4, snout: 1.1, snoutR: 0.22, ears: 'none', teeth: true, flatHead: true }, leg: 0.16, foot: 'claw', tail: ['thick', 3.0, 0.0], coat: 'scales', gait: [0.8, 3], sound: 'hiss', pitch: 200, sprawl: true },
  turtle: { S: 0.35, len: 1.6, girth: 0.5, neck: [0.4, 0.3, 0.14], head: { r: 0.2, snout: 0.1, snoutR: 0.13, ears: 'none' }, leg: 0.14, foot: 'column', tail: ['short', 0.3, 0.0], coat: 'scales', gait: [0.2, 0.5], sound: 'hiss', pitch: 300, shell: true, sprawl: true },
  frog: { S: 0.08, len: 1.6, girth: 0.7, neck: [0.1, 0.3, 0.6], head: { r: 0.6, snout: 0.1, snoutR: 0.5, ears: 'none', bigEyes: true }, leg: 0.2, foot: 'paw', tail: ['none', 0, 0], coat: 'skin', gait: [0.4, 2], sound: 'ribbit', pitch: 250, hop: true, frog: true },
};

const SPECIES = {
  dog: { arch: 'canine', colors: [['#8a5a2a', '#e8d0a8'], ['#2a2420', '#8a6a4a'], ['#e8dcc8', '#f8f0e0'], ['#c89050', '#f0e0c0']] },
  retriever: { arch: 'canine', S: 0.6, colors: [['#d8a050', '#f0d8a0']], ears: 'floppy', tail: ['feather', 0.8, 0.3] },
  husky: { arch: 'canine', S: 0.58, colors: [['#5a5c60', '#f4f4f2']], pattern: 'husky', eyes: '#6ab0ff' },
  shepherd: { arch: 'canine', S: 0.62, colors: [['#8a5a2a', '#d8a868']], pattern: 'saddle' },
  dachshund: { arch: 'canine', S: 0.25, len: 2.2, leg: 0.12, colors: [['#7a3a1a', '#a86a3a']], ears: 'floppy' },
  corgi: { arch: 'canine', S: 0.3, len: 1.8, leg: 0.12, colors: [['#d88a3a', '#f8f0e0']], pattern: 'bib', tail: ['short', 0.1, 0.4] },
  poodle: { arch: 'canine', S: 0.5, colors: [['#f4f0ea', '#f4f0ea'], ['#2a2a2a', '#3a3a3a']], coat: 'curly', ears: 'floppy' },
  dalmatian: { arch: 'canine', S: 0.58, colors: [['#f6f4f0', '#ffffff']], pattern: 'dalmatian', ears: 'floppy', tail: ['thin', 0.8, 0.3] },
  dane: { arch: 'canine', S: 0.85, len: 1.2, colors: [['#3a3a3c', '#5a5a5c'], ['#c8a060', '#e8c890']], ears: 'floppy', tail: ['thin', 0.8, 0.2] },
  chihuahua: { arch: 'canine', S: 0.2, colors: [['#d8b080', '#f0d8b8']], head: { r: 0.3, snout: 0.12, ears: 'bigpointy', earS: 0.24 } },
  wolf: { arch: 'canine', S: 0.8, colors: [['#7a7670', '#d8d4cc']], pattern: 'husky', tail: ['bushy', 0.8, -0.1], sound: 'howl', eyes: '#e0b040' },
  fox: { arch: 'canine', S: 0.38, len: 1.4, colors: [['#d8601a', '#f8f0e8']], pattern: 'fox', tail: ['bushy', 1.1, 0.1], head: { r: 0.18, snout: 0.3, snoutR: 0.07, earS: 0.18 } },
  cat: { arch: 'feline', colors: [['#8a8a8a', '#d0d0d0'], ['#e89040', '#f8e0c0'], ['#2a2a2a', '#3a3a3a'], ['#f4f0ea', '#ffffff']], pattern: 'tabby' },
  lion: { arch: 'feline', S: 1.1, len: 1.6, colors: [['#c8a060', '#e8d0a0']], mane: 'lion', tail: ['tuft', 1.0, 0.1], sound: 'roar', pitch: 110 },
  tiger: { arch: 'feline', S: 1.0, len: 1.7, colors: [['#e07820', '#f8f0e0']], pattern: 'tiger', sound: 'roar', pitch: 120 },
  leopard: { arch: 'feline', S: 0.7, len: 1.6, colors: [['#d8a850', '#f4e8c8']], pattern: 'leopard', sound: 'roar', pitch: 160 },
  horse: { arch: 'equine', colors: [['#6a3a1a', '#6a3a1a'], ['#2a1a10', '#2a1a10'], ['#e8e0d0', '#e8e0d0'], ['#a86a3a', '#a86a3a'], ['#8a8a8a', '#a8a8a8']], pattern: 'socks' },
  unicorn: { arch: 'equine', colors: [['#f8f6f4', '#ffffff']], horn: 'unicorn', maneColor: 'rainbow', glow: true },
  zebra: { arch: 'equine', S: 1.35, colors: [['#f4f4f0', '#ffffff']], pattern: 'zebra', maneColor: '#1a1a1a', faceColor: '#2a2a2a' },
  cow: { arch: 'bovine', colors: [['#f4f2ee', '#f8f6f2']], pattern: 'cow', horn: 'bull' },
  sheep: { arch: 'ovine', colors: [['#f0ebe0', '#f4f0e8']], faceColor: '#2a2420' },
  goat: { arch: 'ovine', S: 0.7, colors: [['#e8e0d0', '#f0e8d8'], ['#6a4a2a', '#8a6a4a']], coat: 'fur', horn: 'goat', beard: true },
  pig: { arch: 'suid', colors: [['#f0b0a8', '#f8c8c0']] },
  deer: { arch: 'cervid', colors: [['#a8683a', '#f0e0c8']], pattern: 'fawn', antlers: true },
  bear: { arch: 'ursid', colors: [['#5a3a22', '#6a4a30'], ['#1a1614', '#2a2420']] },
  panda: { arch: 'ursid', S: 0.8, colors: [['#f4f2ee', '#f4f2ee']], pattern: 'panda' },
  elephant: { arch: 'elephant', colors: [['#8a8680', '#9a968e']] },
  giraffe: { arch: 'giraffe', colors: [['#e8c890', '#f4e8d0']], pattern: 'giraffe' },
  rhino: { arch: 'rhino', colors: [['#8a8680', '#9a968e']] },
  camel: { arch: 'camel', colors: [['#c8a06a', '#d8b888']] },
  rabbit: { arch: 'leporid', colors: [['#b0a090', '#e8e0d8'], ['#f4f2ee', '#ffffff'], ['#6a5a4a', '#c8b8a8']] },
  mouse: { arch: 'rodent', colors: [['#8a8480', '#c8c0b8']] },
  raccoon: { arch: 'canine', S: 0.3, len: 1.5, girth: 0.32, colors: [['#7a7670', '#b8b4ac']], pattern: 'raccoon', tail: ['ringed', 0.9, 0.2], ears: 'round', sound: 'chatter', pitch: 600 },
  monkey: { arch: 'primate', colors: [['#6a4a2a', '#c8a080']], faceColor: '#e0b898' },
  trex: { arch: 'theropod', colors: [['#4a5a3a', '#8a8a6a'], ['#6a4a3a', '#a8886a'], ['#3a4a5a', '#8a9aa8']], pattern: 'dinostripe' },
  sauropod: { arch: 'sauropod', colors: [['#6a7a5a', '#a8a88a']] },
  triceratops: { arch: 'ceratopsian', colors: [['#7a6a4a', '#b8a888'], ['#5a6a4a', '#a8b088']] },
  dragon: { arch: 'dragon', colors: [['#8a1a1a', '#d8a060'], ['#1a4a2a', '#a8c060'], ['#1a1a2a', '#6a4a8a'], ['#c89020', '#f0e0a0']], glowEyes: true },
  griffin: { arch: 'griffin', colors: [['#c8a060', '#e8d0a0']], headColor: '#f4f2ee' },
  crocodile: { arch: 'croc', colors: [['#3a4a2a', '#b8b080']] },
  turtle: { arch: 'turtle', colors: [['#5a7a4a', '#c8c090']], shellColor: '#5a4a2a' },
  frog: { arch: 'frog', colors: [['#3a9a3a', '#e8f0c0'], ['#e04020', '#f0d0a0'], ['#2a6ad8', '#d0e0f0']] },
  monster: { arch: null, colors: null },
};

// ---------------- Template synthesis ----------------
function makeTemplate(item, rng) {
  const a = item.attrs;
  let sp = item.params.breed || item.params.species || 'dog';
  if (!SPECIES[sp]) sp = 'dog';
  if (sp === 'monster') return monsterTemplate(item, rng);
  const S0 = SPECIES[sp];
  const A = ARCH[S0.arch];
  const t = JSON.parse(JSON.stringify(A));
  for (const k of ['S', 'len', 'girth', 'leg', 'coat', 'sound', 'pitch']) if (S0[k] !== undefined) t[k] = S0[k];
  if (S0.head) Object.assign(t.head, S0.head);
  if (S0.ears) t.head.ears = S0.ears;
  if (S0.tail) t.tail = S0.tail;
  if (S0.horn) t.head.horn = S0.horn;
  t.species = sp;
  t.pattern = S0.pattern || null;
  t.mane = S0.mane || (A.mane ? 'horse' : null);
  t.maneColor = S0.maneColor;
  t.antlers = S0.antlers && (a.sex !== 'female') && !a.flags.young;
  t.beard = S0.beard;
  t.glow = S0.glow || a.flags.glow;
  t.eyeColor = S0.eyes || (S0.glowEyes ? '#ffb020' : null);
  t.faceColor = S0.faceColor; t.headColor = S0.headColor; t.shellColor = S0.shellColor;
  // Colours: prompt colour wins, else a species palette.
  const pal = rng.pick(S0.colors);
  let base = pal[0], belly = pal[1];
  const furCol = a.colors.find((c) => !c.part || ['fur', 'coat', 'skin', 'scales', 'body', 'hair'].includes(c.part));
  if (furCol && furCol.color !== 'rainbow') { base = furCol.color; belly = '#' + new THREE.Color(furCol.color).lerp(new THREE.Color('#ffffff'), 0.4).getHexString(); if (t.pattern && !['zebra', 'tiger', 'dalmatian', 'panda', 'giraffe'].includes(t.pattern)) t.pattern = null; }
  if (a.primaryColor === 'rainbow') { t.rainbow = true; }
  t.base = base; t.belly = belly;
  if (a.flags.spots) t.pattern = 'dalmatian';
  if (a.flags.stripes) t.pattern = 'tiger';
  // Size: explicit height, size words, baby animals.
  let scale = 1;
  if (a.dims.height) scale = a.dims.height / (t.S * (t.biped ? 1.5 : 1.35));
  scale *= clamp(a.sizeMul || 1, 0.1, 12);
  const young = a.flags.young || has(a, 'puppy', 'kitten', 'cub', 'foal', 'calf', 'lamb', 'baby');
  if (young) { scale *= 0.55; t.head.r *= 1.25; t.len *= 0.9; t.leg *= 1.1; }
  t.young = young;
  t.S *= scale * rng.range(0.93, 1.07);
  t.len *= rng.range(0.95, 1.05); t.girth *= rng.range(0.92, 1.1) * (a.body && a.body.fat > 0.5 ? 1.25 : 1);
  t.name = { retriever: 'Golden retriever', shepherd: 'German shepherd', dane: 'Great dane', trex: 'T-rex', sauropod: 'Brontosaurus' }[sp] || sp[0].toUpperCase() + sp.slice(1);
  return t;
}

function monsterTemplate(item, rng) {
  const a = item.attrs;
  const arch = rng.pick(['canine', 'ursid', 'theropod', 'feline', 'croc', 'dragon']);
  const t = JSON.parse(JSON.stringify(ARCH[arch]));
  t.species = 'monster';
  t.S *= rng.range(0.9, 1.8) * (arch === 'theropod' ? 0.6 : 1) * clamp(a.sizeMul || 1, 0.2, 6);
  t.head.r *= rng.range(1.1, 1.6); t.head.teeth = true; t.head.horn = rng.pick(['dragon', 'bull', 'goat', null]);
  t.head.eyes = rng.int(1, 5); t.spikes = rng.chance(0.6); t.wings = rng.chance(0.25) ? 1.5 : 0;
  const hue = rng.range(0, 1);
  t.base = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : hsl(hue, rng.range(0.4, 0.8), rng.range(0.25, 0.45));
  t.belly = hsl(hue + 0.1, 0.5, 0.65); t.pattern = rng.pick(['tiger', 'dalmatian', 'dinostripe', null]);
  t.coat = rng.pick(['scales', 'fur', 'hide']);
  t.eyeColor = rng.pick(['#ff2020', '#ffe020', '#20ff60', '#c040ff']);
  t.glowEyes = true;
  t.name = 'Monster';
  t.sound = 'roar'; t.pitch = rng.range(60, 200);
  return t;
}

// ---------------- Skeleton ----------------
// Returns { names, parent, J (joint positions), legs: [{bones:[u,l,f], side, front, phase}] }
function layout(t) {
  const S = t.S, L = t.S * t.len, R = t.S * t.girth;
  const J = {}, parent = {}, names = [];
  const add = (name, p, par) => { J[name] = p; parent[name] = par; names.push(name); };
  const biped = !!t.biped;
  const hipY = S * (biped ? 1.0 : 0.95), chestY = S * (biped ? 1.12 : 1.0);
  const hipZ = -L / 2 + R * 0.7, chestZ = L / 2 - R * 0.6;
  add('root', new THREE.Vector3(0, 0, 0), null);
  add('hips', new THREE.Vector3(0, hipY, hipZ), 'root');
  add('chest', new THREE.Vector3(0, chestY + (biped ? S * 0.12 : 0), chestZ), 'hips');
  const na = t.neck[1], nl = S * t.neck[0];
  const neckBase = new THREE.Vector3(0, J.chest.y + R * 0.35, chestZ + R * 0.55);
  add('neck', neckBase, 'chest');
  const headP = neckBase.clone().add(new THREE.Vector3(0, Math.sin(na) * nl, Math.cos(na) * nl));
  add('head', headP, 'neck');
  // Tail chain.
  const tl = S * t.tail[1];
  if (t.tail[0] !== 'none' && tl > 0.01) {
    const n = 4;
    let prev = 'hips';
    const start = new THREE.Vector3(0, hipY + R * 0.15, hipZ - R * 0.75);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const p = start.clone().add(new THREE.Vector3(0, Math.sin(t.tail[2]) * tl * f - (t.tail[0] === 'tuft' ? tl * f * f * 0.6 : 0), -Math.cos(t.tail[2]) * tl * f));
      add('tail' + i, p, prev);
      prev = 'tail' + i;
    }
    J.tailTip = start.clone().add(new THREE.Vector3(0, Math.sin(t.tail[2]) * tl - (t.tail[0] === 'tuft' ? tl * 0.6 : 0), -Math.cos(t.tail[2]) * tl));
  }
  // Legs.
  const legs = [];
  const legDefs = [];
  const spread = R * (t.sprawl ? 1.3 : 0.62);
  if (t.insect) {
    for (let i = 0; i < t.insect; i++) for (const s of [-1, 1]) legDefs.push({ side: s, front: i < t.insect / 2, z: lerp(chestZ, hipZ, i / (t.insect - 1)), y: S * 0.9, anchor: i < t.insect / 2 ? 'chest' : 'hips', insect: true, idx: i });
  } else {
    for (const s of [-1, 1]) legDefs.push({ side: s, front: true, z: chestZ - R * 0.1, y: J.chest.y - R * 0.45, anchor: 'chest', arm: biped });
    for (const s of [-1, 1]) legDefs.push({ side: s, front: false, z: hipZ + R * 0.05, y: hipY - R * 0.35, anchor: 'hips' });
  }
  for (const d of legDefs) {
    const id = (d.front ? 'F' : 'B') + (d.side < 0 ? 'L' : 'R') + (d.idx ?? '');
    const top = new THREE.Vector3(d.side * spread, d.y, d.z);
    let knee, ankle, foot;
    if (d.insect) {
      const out = d.side * R * 2.2;
      knee = new THREE.Vector3(d.side * spread + out * 0.5, S * 1.35, d.z + (d.idx - 1.5) * R * 0.5);
      ankle = new THREE.Vector3(d.side * spread + out * 1.2, S * 0.5, d.z + (d.idx - 1.5) * R * 0.9);
      foot = new THREE.Vector3(d.side * spread + out * 1.4, 0, d.z + (d.idx - 1.5) * R * 1.0);
    } else if (d.arm) {
      knee = top.clone().add(new THREE.Vector3(d.side * R * 0.1, -S * 0.2, S * 0.08));
      ankle = knee.clone().add(new THREE.Vector3(0, -S * 0.02, S * 0.2));
      foot = ankle.clone().add(new THREE.Vector3(0, -S * 0.03, S * 0.06));
    } else if (t.sprawl) {
      knee = top.clone().add(new THREE.Vector3(d.side * S * 0.5, -S * 0.25, 0));
      ankle = new THREE.Vector3(d.side * (spread + S * 0.55), S * 0.12, d.z + (d.front ? S * 0.1 : -S * 0.1));
      foot = new THREE.Vector3(d.side * (spread + S * 0.6), 0, d.z + (d.front ? S * 0.25 : -S * 0.05));
    } else if (d.front) {
      const len = d.y;
      knee = new THREE.Vector3(d.side * spread * 0.95, len * 0.5, d.z - S * 0.02);
      ankle = new THREE.Vector3(d.side * spread * 0.95, len * 0.12, d.z - S * 0.02);
      foot = new THREE.Vector3(d.side * spread * 0.95, 0, d.z + S * (t.foot === 'paw' ? 0.06 : 0.02));
    } else {
      const len = d.y;
      knee = new THREE.Vector3(d.side * spread * 0.95, len * 0.58, d.z + S * (biped ? 0.22 : 0.1));
      ankle = new THREE.Vector3(d.side * spread * 0.95, len * (biped ? 0.25 : 0.22), d.z - S * (biped ? 0.08 : 0.12));
      foot = new THREE.Vector3(d.side * spread * 0.95, 0, d.z - S * 0.06 + (biped ? S * 0.12 : 0));
    }
    add(id + 'u', top, d.anchor);
    add(id + 'l', knee, id + 'u');
    add(id + 'f', ankle, id + 'l');
    J[id + 'toe'] = foot;
    legs.push({ id, bones: [id + 'u', id + 'l', id + 'f'], side: d.side, front: d.front, arm: !!d.arm, insect: !!d.insect, idx: d.idx || 0 });
  }
  // Wings.
  const wings = [];
  if (t.wings) {
    for (const s of [-1, 1]) {
      const id = 'W' + (s < 0 ? 'L' : 'R');
      const base = new THREE.Vector3(s * R * 0.5, J.chest.y + R * 0.6, chestZ - R * 0.3);
      const elbow = base.clone().add(new THREE.Vector3(s * S * t.wings * 0.45, S * 0.25, -S * 0.1));
      add(id + '0', base, 'chest');
      add(id + '1', elbow, id + '0');
      J[id + 'tip'] = elbow.clone().add(new THREE.Vector3(s * S * t.wings * 0.6, -S * 0.1, -S * 0.3));
      wings.push({ id, side: s });
    }
  }
  return { J, parent, names, legs, wings, S, L, R, hipZ, chestZ };
}

// ---------------- Sculpting ----------------
function sculpt(sdf, t, lay, rng, noise) {
  const { J, S, R } = lay;
  const bi = (n) => lay.names.indexOf(n);
  const v = (p) => [p.x, p.y, p.z];
  const coatMat = t.coat === 'scales' ? 'scales' : t.coat === 'hide' || t.coat === 'skin' ? 'skin' : 'fur';
  const wool = t.coat === 'wool' || t.coat === 'curly';
  const disp = wool ? { amp: S * 0.035, freq: 14 / S, oct: 2 } : t.coat === 'fur' ? { amp: S * 0.004, freq: 30 / S, oct: 2 } : t.coat === 'scales' ? { amp: S * 0.003, freq: 60 / S, oct: 1 } : null;
  const k = R * 0.45;
  // Torso: hips, belly, chest ellipsoids.
  sdf.beginGroup({ op: 'union', defaults: { mat: coatMat } });
  sdf.ellipsoid(v(J.hips), [R * 0.85, R * 0.92, R * 1.05], { bone: bi('hips'), disp, tag: 'body' });
  const mid = J.hips.clone().lerp(J.chest, 0.5); mid.y -= R * 0.05;
  sdf.ellipsoid(v(mid), [R * 0.9 * (t.hump ? 0.95 : 1), R * 0.95, (lay.chestZ - lay.hipZ) * 0.55 + R * 0.4], { bone: bi('hips'), op: 'smooth', k, disp, tag: 'body' });
  sdf.ellipsoid(v(J.chest), [R * 0.92, R * 1.05, R * 1.0], { bone: bi('chest'), op: 'smooth', k, disp, tag: 'body' });
  if (t.hump) sdf.ellipsoid([0, J.chest.y + R * 0.8, mid.z], [R * 0.5, R * 0.7, R * 0.7], { bone: bi('hips'), op: 'smooth', k: k * 0.8, tag: 'body' });
  // Neck.
  const nr = S * t.neck[2];
  sdf.roundCone(v(J.neck), v(J.head), Math.max(nr, R * 0.45), nr * 0.85, { bone: bi('neck'), op: 'smooth', k: k * 0.8, disp, tag: 'neck' });
  // Head.
  const H = t.head;
  const hr = S * H.r;
  const na = t.neck[1];
  const hd = new THREE.Vector3(0, na >= 0.8 ? -0.6 : -Math.sin(Math.min(0.6, na * 0.4)) * 0.5, 1).normalize();
  if (!H.flatHead) sdf.ellipsoid(v(J.head), [hr * 0.9, hr * 0.95, hr * 1.05], { bone: bi('head'), op: 'smooth', k: hr * 0.4, tag: 'head', disp: wool ? null : disp });
  else sdf.ellipsoid(v(J.head), [hr * 0.9, hr * 0.45, hr * 1.1], { bone: bi('head'), op: 'smooth', k: hr * 0.3, tag: 'head' });
  const snoutL = S * H.snout, sr = S * H.snoutR;
  const snoutTip = J.head.clone().addScaledVector(hd, hr * 0.6 + snoutL);
  if (snoutL > 0.001) sdf.roundCone(v(J.head.clone().addScaledVector(hd, hr * 0.3)), v(snoutTip), sr * 1.15, sr * (H.flatNose ? 1 : 0.75), { bone: bi('head'), op: 'smooth', k: hr * 0.3, tag: 'muzzle', mat: coatMat });
  if (H.flatHead) { sdf.ellipsoid(v(snoutTip.clone().add(new THREE.Vector3(0, 0, -snoutL * 0.5))), [sr * 1.1, sr * 0.5, snoutL * 0.55], { bone: bi('head'), op: 'smooth', k: sr * 0.5, tag: 'muzzle' }); }
  // Nose.
  if (!H.beak && snoutL > 0.001) sdf.ellipsoid(v(snoutTip.clone().addScaledVector(hd, -sr * 0.15)), [sr * 0.55, sr * 0.4, sr * 0.35], { bone: bi('head'), op: 'smooth', k: sr * 0.1, mat: 'nose', tag: 'nose', priority: 2 });
  if (H.beak) {
    const bt = J.head.clone().addScaledVector(hd, hr * 1.7).add(new THREE.Vector3(0, -hr * 0.4, 0));
    sdf.roundCone(v(J.head.clone().addScaledVector(hd, hr * 0.7)), v(bt), hr * 0.35, hr * 0.05, { bone: bi('head'), op: 'smooth', k: hr * 0.1, mat: 'horn', tag: 'beak', priority: 2 });
  }
  // Teeth.
  if (H.teeth && snoutL > 0.001) {
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const f = 0.3 + i * 0.11;
      const p = J.head.clone().addScaledVector(hd, hr * 0.5 + snoutL * f).add(new THREE.Vector3(s * sr * 0.75, -sr * 0.55, 0));
      sdf.roundCone(v(p), v(p.clone().add(new THREE.Vector3(0, -sr * 0.35, 0))), sr * 0.1, sr * 0.01, { bone: bi('head'), mat: 'horn', tag: 'tooth', priority: 3 });
    }
  }
  // Ears.
  const earBase = (s) => J.head.clone().add(new THREE.Vector3(s * hr * 0.55, hr * 0.65, -hr * 0.2));
  const es = S * (H.earS || 0.1);
  for (const s of [-1, 1]) {
    const b = earBase(s);
    switch (H.ears) {
      case 'pointy': case 'bigpointy': sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * es * 0.3, es, -es * 0.15))), es * 0.35, es * 0.04, { bone: bi('head'), op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
      case 'floppy': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * hr * 0.35, -es * 0.6, 0))), [es * 0.15, es * 0.75, es * 0.45], { bone: bi('head'), op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat, rot: [0, 0, s * 0.25] }); break;
      case 'round': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(0, es * 0.2, 0))), [es * 0.55, es * 0.55, es * 0.18], { bone: bi('head'), op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
      case 'long': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * es * 0.12, es * 0.5, -es * 0.1))), [es * 0.14, es * 0.55, es * 0.08], { bone: bi('head'), op: 'smooth', k: es * 0.08, tag: 'ear', mat: coatMat, rot: [-0.2, 0, s * 0.15] }); break;
      case 'side': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * es * 0.9, -es * 0.3, 0))), [es * 0.7, es * 0.25, es * 0.4], { bone: bi('head'), op: 'smooth', k: es * 0.15, tag: 'ear', mat: coatMat, rot: [0, 0, s * -0.3] }); break;
      case 'elephant': sdf.ellipsoid(v(J.head.clone().add(new THREE.Vector3(s * hr * 0.9, -hr * 0.1, -hr * 0.5))), [es * 0.12, es * 0.95, es * 0.8], { bone: bi('head'), op: 'smooth', k: es * 0.1, tag: 'ear', mat: coatMat, rot: [0, s * 0.5, 0] }); break;
      case 'tuft': sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * es * 0.2, es, -es * 0.4))), es * 0.25, es * 0.03, { bone: bi('head'), op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
      default: break;
    }
  }
  // Horns & antlers.
  const hornAt = (s, dx, dy, dz, len, r0, dir, mat = 'horn') => {
    const b = J.head.clone().add(new THREE.Vector3(s * dx, dy, dz));
    sdf.roundCone(v(b), v(b.clone().add(dir.clone().multiplyScalar(len))), r0, r0 * 0.1, { bone: bi('head'), op: 'smooth', k: r0 * 0.4, mat, tag: 'horn', priority: 2 });
  };
  switch (H.horn) {
    case 'unicorn': hornAt(0, 0, hr * 0.8, hr * 0.5, hr * 2.4, hr * 0.18, new THREE.Vector3(0, 0.8, 0.6).normalize(), 'gold'); break;
    case 'bull': for (const s of [-1, 1]) hornAt(s, hr * 0.6, hr * 0.7, 0, hr * 1.1, hr * 0.12, new THREE.Vector3(s, 0.6, 0.2).normalize()); break;
    case 'goat': for (const s of [-1, 1]) hornAt(s, hr * 0.35, hr * 0.85, -hr * 0.1, hr * 1.2, hr * 0.14, new THREE.Vector3(s * 0.3, 0.7, -0.65).normalize()); break;
    case 'rhino': hornAt(0, 0, sr * 0.8, hr * 0.6 + snoutL * 0.8, hr * 1.4, sr * 0.5, new THREE.Vector3(0, 0.9, 0.35).normalize()); hornAt(0, 0, sr * 0.9, hr * 0.6 + snoutL * 0.3, hr * 0.6, sr * 0.35, new THREE.Vector3(0, 1, 0.1).normalize()); break;
    case 'triceratops': for (const s of [-1, 1]) hornAt(s, hr * 0.45, hr * 0.7, hr * 0.3, hr * 1.8, hr * 0.13, new THREE.Vector3(s * 0.1, 0.55, 0.85).normalize()); hornAt(0, 0, sr * 0.6, hr * 0.4 + snoutL * 0.7, hr * 0.6, sr * 0.4, new THREE.Vector3(0, 1, 0.3).normalize()); break;
    case 'dragon': for (const s of [-1, 1]) hornAt(s, hr * 0.5, hr * 0.7, -hr * 0.3, hr * 1.6, hr * 0.14, new THREE.Vector3(s * 0.3, 0.45, -0.85).normalize()); break;
    default: break;
  }
  if (t.antlers) for (const s of [-1, 1]) {
    const b = J.head.clone().add(new THREE.Vector3(s * hr * 0.4, hr * 0.85, -hr * 0.1));
    const main = b.clone().add(new THREE.Vector3(s * hr * 1.2, hr * 2.2, -hr * 0.6));
    sdf.roundCone(v(b), v(main), hr * 0.1, hr * 0.05, { bone: bi('head'), mat: 'horn', tag: 'horn', priority: 2 });
    for (let i = 1; i <= 3; i++) { const p = b.clone().lerp(main, i / 3.5); sdf.roundCone(v(p), v(p.clone().add(new THREE.Vector3(s * hr * 0.2, hr * 0.7, hr * 0.35))), hr * 0.06, hr * 0.02, { bone: bi('head'), mat: 'horn', tag: 'horn', priority: 2 }); }
  }
  if (H.ossicones) for (const s of [-1, 1]) hornAt(s, hr * 0.3, hr * 0.8, -hr * 0.2, hr * 0.8, hr * 0.12, new THREE.Vector3(0, 1, -0.1).normalize(), coatMat);
  if (H.frill) sdf.ellipsoid(v(J.head.clone().add(new THREE.Vector3(0, hr * 0.8, -hr * 0.8))), [hr * 1.6, hr * 1.4, hr * 0.15], { bone: bi('head'), op: 'smooth', k: hr * 0.3, tag: 'frill', mat: coatMat, rot: [-0.6, 0, 0] });
  // Trunk & tusks.
  if (H.trunk) {
    const pts = [];
    let p = J.head.clone().addScaledVector(hd, hr * 0.8).add(new THREE.Vector3(0, -hr * 0.1, 0));
    for (let i = 0; i <= 5; i++) { const f = i / 5; pts.push([p.x, p.y, p.z, hr * (0.38 - f * 0.26)]); p = p.clone().add(new THREE.Vector3(0, -S * H.trunk / 5, S * H.trunk * 0.08 * (1 - f))); }
    sdf.chain(pts, { bone: bi('head'), mat: coatMat, tag: 'trunk', op: 'smooth', k: hr * 0.2 });
  }
  if (H.tusks) for (const s of [-1, 1]) { const b = J.head.clone().addScaledVector(hd, hr * 0.7).add(new THREE.Vector3(s * hr * 0.35, -hr * 0.45, 0)); sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * hr * 0.1, -hr * 0.6, hr * 0.9))), hr * 0.09, hr * 0.03, { bone: bi('head'), mat: 'ivory', tag: 'tusk', priority: 3 }); }
  // Mane.
  if (t.mane === 'lion') sdf.ellipsoid(v(J.head.clone().add(new THREE.Vector3(0, 0, -hr * 0.5))), [hr * 1.6, hr * 1.7, hr * 1.2], { bone: bi('neck'), op: 'smooth', k: hr * 0.3, tag: 'mane', mat: 'mane', disp: { amp: hr * 0.12, freq: 6 / hr, oct: 2 } });
  if (t.mane === 'horse') {
    const n0 = J.neck.clone().add(new THREE.Vector3(0, nr * 0.9, -nr * 0.2)), n1 = J.head.clone().add(new THREE.Vector3(0, hr * 0.8, -hr * 0.4));
    sdf.roundCone(v(n0), v(n1), nr * 0.35, nr * 0.25, { bone: bi('neck'), op: 'smooth', k: nr * 0.2, tag: 'mane', mat: 'mane', disp: { amp: nr * 0.08, freq: 8 / nr, oct: 2 } });
  }
  if (t.beard) sdf.roundCone(v(snoutTip.clone().add(new THREE.Vector3(0, -sr, -snoutL * 0.3))), v(snoutTip.clone().add(new THREE.Vector3(0, -sr * 3, -snoutL * 0.4))), sr * 0.4, sr * 0.1, { bone: bi('head'), mat: coatMat, tag: 'beard' });
  sdf.endGroup();
  // Legs.
  for (const leg of lay.legs) {
    const [u, l, f] = leg.bones;
    const thick = S * t.leg * (leg.front || leg.insect ? 1 : 1.15) * (leg.arm ? 0.6 : 1);
    const toe = J[leg.id + 'toe'];
    sdf.roundCone(v(J[u]), v(J[l]), thick * (leg.insect ? 0.6 : 1.5), thick, { bone: bi(u), op: 'smooth', k: R * 0.35, mat: coatMat, tag: 'leg', disp });
    sdf.roundCone(v(J[l]), v(J[f]), thick, thick * 0.75, { bone: bi(l), op: 'smooth', k: thick * 0.5, mat: coatMat, tag: 'leg', disp });
    const footMat = t.foot === 'hoof' ? 'hoof' : coatMat;
    if (t.foot === 'hoof') sdf.roundCone(v(J[f]), v(toe.clone().add(new THREE.Vector3(0, thick * 0.4, 0))), thick * 0.8, thick * 0.9, { bone: bi(f), op: 'smooth', k: thick * 0.3, mat: footMat, tag: 'foot' });
    else if (t.foot === 'column') sdf.roundCone(v(J[f]), v(toe.clone().add(new THREE.Vector3(0, thick * 0.6, 0))), thick * 0.9, thick * 1.15, { bone: bi(f), op: 'smooth', k: thick * 0.4, mat: coatMat, tag: 'foot' });
    else {
      sdf.roundCone(v(J[f]), v(toe.clone().add(new THREE.Vector3(0, thick * 0.5, thick * 0.4))), thick * 0.75, thick * 0.85, { bone: bi(f), op: 'smooth', k: thick * 0.3, mat: coatMat, tag: 'foot' });
      if (t.foot === 'claw') for (let c = -1; c <= 1; c++) { const cb = toe.clone().add(new THREE.Vector3(c * thick * 0.5, thick * 0.3, thick * 0.8)); sdf.roundCone(v(cb), v(cb.clone().add(new THREE.Vector3(0, -thick * 0.3, thick * 0.6))), thick * 0.2, thick * 0.04, { bone: bi(f), mat: 'horn', tag: 'claw', priority: 2 }); }
    }
  }
  // Tail.
  const tailBones = lay.names.filter((n) => n.startsWith('tail'));
  if (tailBones.length) {
    const pts = tailBones.map((n) => J[n]).concat([J.tailTip]);
    const tt = t.tail[0];
    const r0 = tt === 'thick' ? R * 0.55 : tt === 'bushy' ? S * 0.07 : tt === 'feather' ? S * 0.05 : tt === 'spiked' ? R * 0.4 : S * 0.035 * (tt === 'curly' ? 0.8 : 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const f = i / (pts.length - 1);
      const ra = tt === 'bushy' ? r0 * (1 + Math.sin(f * Math.PI) * 1.2) : tt === 'puff' ? S * 0.1 : r0 * (1 - f * 0.75);
      const rb = tt === 'bushy' ? r0 * (1 + Math.sin((f + 0.25) * Math.PI) * 1.2) * (i === pts.length - 2 ? 0.5 : 1) : tt === 'puff' ? S * 0.1 : r0 * (1 - (f + 1 / (pts.length - 1)) * 0.75);
      sdf.roundCone(v(pts[i]), v(pts[i + 1]), Math.max(0.004, ra), Math.max(0.003, rb), { bone: bi(tailBones[Math.min(i, tailBones.length - 1)]), op: 'smooth', k: Math.max(0.01, ra * 0.6), mat: tt === 'tuft' && i === pts.length - 2 ? 'mane' : coatMat, tag: i === pts.length - 2 ? 'tailtip' : 'tail', disp: tt === 'bushy' || tt === 'feather' ? { amp: r0 * 0.25, freq: 3 / r0, oct: 2 } : null });
    }
    if (tt === 'tuft') sdf.ellipsoid(v(J.tailTip), [S * 0.05, S * 0.18, S * 0.05], { bone: bi(tailBones[tailBones.length - 1]), op: 'smooth', k: S * 0.03, mat: 'mane', tag: 'tailtip', disp: { amp: S * 0.015, freq: 40 / S, oct: 2 } });
  }
  // Spikes along the back.
  if (t.spikes) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const p = J.head.clone().lerp(J.hips, f); p.y += R * 0.85;
      if (f < 0.25) p.copy(J.neck.clone().lerp(J.head, 1 - f * 4)).add(new THREE.Vector3(0, S * t.neck[2] * 0.9, 0));
      sdf.roundCone(v(p), v(p.clone().add(new THREE.Vector3(0, R * 0.5, -R * 0.2))), R * 0.12, R * 0.01, { bone: bi(f < 0.3 ? 'neck' : f < 0.6 ? 'chest' : 'hips'), op: 'smooth', k: R * 0.05, mat: 'horn', tag: 'spike', priority: 2 });
    }
  }
  // Shell.
  if (t.shell) {
    const c = J.hips.clone().lerp(J.chest, 0.5); c.y += R * 0.15;
    sdf.ellipsoid(v(c), [R * 1.35, R * 0.95, (lay.chestZ - lay.hipZ) * 0.8 + R * 0.7], { bone: bi('hips'), op: 'union', mat: 'shell', tag: 'shell', priority: 3 });
    sdf.plane([0, -1, 0], -(c.y - R * 0.3), { op: 'smoothInter', k: R * 0.1 });
  }
  // Wing membranes (thin, attached to wing bones).
  for (const w of lay.wings) {
    const b0 = J[w.id + '0'], b1 = J[w.id + '1'], tip = J[w.id + 'tip'];
    sdf.roundCone(v(b0), v(b1), R * 0.12, R * 0.08, { bone: bi(w.id + '0'), mat: coatMat, tag: 'wingbone' });
    sdf.roundCone(v(b1), v(tip), R * 0.08, R * 0.03, { bone: bi(w.id + '1'), mat: coatMat, tag: 'wingbone' });
    // Membrane: flattened ellipsoids between bone and body.
    const mc = b1.clone().lerp(J.hips, 0.4); mc.y = b1.y - S * 0.2;
    sdf.ellipsoid(v(b0.clone().lerp(tip, 0.5).lerp(mc, 0.4)), [S * t.wings * 0.55, R * 0.05, S * 0.45], { bone: bi(w.id + '1'), mat: t.species === 'griffin' ? coatMat : 'wing', tag: 'wing', rot: [0, 0, w.side * -0.25] });
    sdf.ellipsoid(v(b0.clone().lerp(mc, 0.5)), [S * t.wings * 0.3, R * 0.05, S * 0.35], { bone: bi(w.id + '0'), mat: t.species === 'griffin' ? coatMat : 'wing', tag: 'wing', rot: [0, 0, w.side * -0.15] });
  }
  void noise; void rng;
}

// ---------------- Coat painting ----------------
function voronoi(noise, x, y, z, freq) {
  // Returns F2 - F1 cell edge distance (small near edges).
  const px = x * freq, py = y * freq, pz = z * freq;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let f1 = 9, f2 = 9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const h = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453;
    const ox = h - Math.floor(h), oy = (h * 1.7) - Math.floor(h * 1.7), oz = (h * 2.3) - Math.floor(h * 2.3);
    const d = Math.hypot(cx + ox - px, cy + oy - py, cz + oz - pz);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}

function makeColorFn(t, lay, noise) {
  const base = new THREE.Color(t.base), belly = new THREE.Color(t.belly);
  const dark = new THREE.Color('#1a1614'), white = new THREE.Color('#f8f6f2');
  const face = t.faceColor ? new THREE.Color(t.faceColor) : null;
  const headCol = t.headColor ? new THREE.Color(t.headColor) : null;
  const maneCol = t.maneColor && t.maneColor !== 'rainbow' ? new THREE.Color(t.maneColor) : base.clone().multiplyScalar(t.species === 'lion' ? 0.6 : 0.55);
  const { S, R, J } = lay;
  const c = new THREE.Color();
  return (i, mesh, prim) => {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
    const tag = prim.tag || '';
    if (prim.mat === 'mane') {
      if (t.maneColor === 'rainbow') { c.setHSL(((y + z) / S * 0.6) % 1, 0.8, 0.6); return [c.r, c.g, c.b]; }
      return [maneCol.r, maneCol.g, maneCol.b];
    }
    if (prim.mat !== 'fur' && prim.mat !== 'skin' && prim.mat !== 'scales') return [1, 1, 1];
    if (t.rainbow) { c.setHSL(((z / S) * 0.5 + 0.5) % 1, 0.75, 0.55); return [c.r, c.g, c.b]; }
    // Belly gradient: underside of the torso and inner legs.
    const bodyMidY = (J.hips.y + J.chest.y) / 2;
    let under = tag === 'body' ? clamp((bodyMidY - R * 0.2 - y) / (R * 0.6), 0, 1) : tag === 'neck' ? clamp((J.neck.y - y) / (R * 0.8), 0, 1) * 0.6 : 0;
    c.copy(base).lerp(belly, under);
    if (tag === 'muzzle' && face) c.copy(face);
    else if (tag === 'muzzle') c.lerp(belly, 0.35);
    if (headCol && (tag === 'head' || tag === 'muzzle' || tag === 'neck' || tag === 'ear')) c.copy(headCol);
    switch (t.pattern) {
      case 'zebra': { if (tag === 'muzzle') break; const s = Math.sin((tag === 'leg' || tag === 'foot' ? y * 3 : z * 2.2 + y * 0.8) / S * 15 + noise.n3(x * 3, y * 3, z * 3) * 1.5); if (s > 0.1) c.copy(dark); break; }
      case 'tiger': { if (under < 0.5 && tag !== 'muzzle') { const s = Math.sin((z * 2 + Math.abs(x) * 0.5) / S * 10 + noise.n3(x * 5 / S, y * 5 / S, z * 5 / S) * 2.5); if (s > 0.55) c.copy(dark); } break; }
      case 'dinostripe': { if (under < 0.4) { const s = Math.sin(z / S * 7 + noise.n3(x * 2 / S, y * 2 / S, z * 2 / S) * 2); if (s > 0.5) c.multiplyScalar(0.55); } break; }
      case 'leopard': { const cell = voronoi(noise, x, y, z, 7 / S); if (cell < 0.12 && under < 0.7) c.copy(dark); else if (cell < 0.25) c.lerp(new THREE.Color('#a8702a'), 0.4); break; }
      case 'giraffe': { const cell = voronoi(noise, x, y, z, 5 / S); if (cell > 0.08) c.copy(new THREE.Color('#8a4a1a')); else c.copy(new THREE.Color('#f0e0c0')); if (tag === 'leg' && y < S * 0.4) c.copy(new THREE.Color('#f0e0c0')); break; }
      case 'dalmatian': { if (noise.n3(x * 9 / S, y * 9 / S, z * 9 / S) > 0.62) c.copy(dark); break; }
      case 'cow': { if (noise.fbm3(x * 2.2 / S + 3, y * 2.2 / S, z * 2.2 / S, 3) > 0.12) c.copy(dark); if (tag === 'muzzle') c.copy(new THREE.Color('#e8a8a0')); break; }
      case 'panda': {
        const legOrShoulder = tag === 'leg' || tag === 'foot' || tag === 'ear' || (tag === 'body' && Math.abs(z - J.chest.z) < R * 0.5 && y > bodyMidY - R * 0.2);
        const hp = J.head;
        const eyePatch = tag === 'head' && y > hp.y - S * 0.06 && y < hp.y + S * 0.05 && Math.abs(x) > S * 0.03 && Math.abs(x) < S * 0.12 && z > hp.z;
        if (legOrShoulder || eyePatch || tag === 'nose') c.copy(dark);
        break;
      }
      case 'husky': { if (tag === 'muzzle' || under > 0.3 || (tag === 'leg' && y < S * 0.5)) c.copy(white); else if (tag === 'head' && y < J.head.y) c.copy(white); break; }
      case 'saddle': { if (tag === 'body' && y > bodyMidY + R * 0.3) c.copy(dark); if (tag === 'muzzle') c.copy(dark); break; }
      case 'fox': { if (tag === 'leg' && y < S * 0.45) c.copy(dark); if (tag === 'tailtip' || (tag === 'muzzle' && y < J.head.y) || under > 0.3) c.copy(white); if (tag === 'ear') c.copy(dark); break; }
      case 'raccoon': { const hp = J.head; if (tag === 'head' && z > hp.z && Math.abs(y - hp.y) < S * 0.05) c.copy(dark); if (tag === 'tail' || tag === 'tailtip') { if (Math.sin(z / S * 25) > 0) c.copy(dark); } break; }
      case 'tabby': { if (under < 0.4) { const s = Math.sin((z * 1.5 + Math.abs(x)) / S * 14 + noise.n3(x * 6 / S, y * 6 / S, z * 6 / S) * 2); if (s > 0.4) c.multiplyScalar(0.6); } break; }
      case 'socks': { if ((tag === 'foot' || (tag === 'leg' && y < S * 0.2)) && noise.n3(x * 10, 0, z * 10) > 0) c.copy(white); break; }
      case 'bib': { if (under > 0.2 || tag === 'muzzle' || (tag === 'neck' && z > J.neck.z)) c.copy(white); break; }
      case 'fawn': { if (tag === 'body' && t.young && noise.n3(x * 12 / S, y * 12 / S, z * 12 / S) > 0.6) c.copy(white); break; }
      default: break;
    }
    // Subtle variation.
    const v = 1 + noise.n3(x * 4 / S, y * 4 / S, z * 4 / S) * 0.06;
    return [c.r * v, c.g * v, c.b * v];
  };
}

// ---------------- Animation ----------------
class CreatureAnimator {
  constructor(t, lay, bones, eyes) {
    this.t = t; this.lay = lay; this.bones = bones; this.eyes = eyes;
    this.byName = Object.fromEntries(lay.names.map((n, i) => [n, bones[i]]));
    this.phase = Math.random();
    this.time = Math.random() * 10;
    this.speedS = 0;
    this.happyT = 0;
    this.lookYaw = 0; this.lookPitch = 0;
    this.sitW = 0; this.sitting = false;
    this.flap = 0;
    this.grazeT = 5 + Math.random() * 10; this.graze = 0;
    const walk = t.gait[0], run = t.gait[1];
    this.walkSpeed = walk; this.runSpeed = run;
    // Gait phase offsets per leg: walk (lateral sequence), trot (diagonal), gallop (rotary).
    this.legs = lay.legs.map((l) => ({ ...l, bones: l.bones.map((n) => this.byName[n]) }));
  }
  update(dt, st) {
    const t = this.t, S = t.S;
    this.time += dt;
    this.speedS += ((st.speed || 0) - this.speedS) * Math.min(1, dt * 6);
    const sp = this.speedS;
    const runW = clamp((sp - this.walkSpeed * 1.4) / (this.runSpeed * 0.5), 0, 1);
    const moveW = clamp(sp / (this.walkSpeed * 0.5), 0, 1);
    const stride = S * (1.1 + runW * 1.6) * (t.hop ? 1.5 : 1);
    this.phase = (this.phase + (sp / stride) * dt) % 1;
    const B = this.byName;
    const q = (b, x, y, z) => b && b.rotation.set(x, y, z);
    // Legs.
    for (const L of this.legs) {
      let off;
      if (L.insect) off = (L.idx % 2 === (L.side > 0 ? 0 : 1)) ? 0 : 0.5;
      else if (t.biped && L.front) off = 0;
      else if (t.hop) off = L.front ? 0 : 0.15;
      else if (runW > 0.5) off = (L.front ? 0.5 : 0) + (L.side > 0 ? 0.1 : 0);
      else off = (L.front ? 0.25 : 0) + (L.side > 0 ? 0.5 : 0);
      const ph = (this.phase + off) % 1;
      const amp = (0.35 + runW * 0.45) * moveW;
      const swing = Math.sin(ph * TAU) * amp;
      const lift = Math.max(0, Math.sin(ph * TAU + Math.PI / 2)) * amp * 1.2;
      const [u, l, f] = L.bones;
      if (L.arm) { q(u, -0.6 + Math.sin(this.time * 2) * 0.05, 0, 0); q(l, -0.5, 0, 0); q(f, 0.3, 0, 0); continue; }
      if (L.insect) { q(u, 0, swing * 0.8 * L.side, lift * 0.4 * L.side); q(l, 0, 0, -lift * 0.2 * L.side); continue; }
      const sit = this.sitW;
      if (L.front) { q(u, -swing, 0, 0); q(l, lift * 1.1, 0, 0); q(f, -lift * 0.6, 0, 0); }
      else {
        q(u, -swing - sit * 1.2, 0, 0); q(l, -lift * 1.0 + sit * 2.1, 0, 0); q(f, lift * 0.7 - sit * 1.0, 0, 0);
      }
    }
    // Body bob & pitch; sitting lowers the hips.
    const bob = Math.sin(this.phase * TAU * 2) * S * 0.015 * moveW * (1 + runW * 2);
    if (B.hips) { B.hips.position.y = this.lay.J.hips.y + bob - this.sitW * S * 0.3; B.hips.rotation.x = -this.sitW * 0.45 + (t.hop ? Math.sin(this.phase * TAU) * 0.15 * moveW : 0); }
    if (B.chest) B.chest.rotation.x = Math.sin(this.phase * TAU) * 0.03 * moveW + Math.sin(this.time * 1.8) * 0.01 + this.sitW * 0.1;
    // Head: look at target, graze occasionally.
    this.grazeT -= dt;
    if (this.grazeT < 0 && sp < 0.1 && ['bovine', 'ovine', 'equine', 'cervid', 'camel', 'giraffe'].some(() => ['cow', 'sheep', 'goat', 'horse', 'zebra', 'deer', 'unicorn', 'camel'].includes(t.species))) { this.graze = 1; this.grazeT = 8 + Math.random() * 12; }
    this.graze = Math.max(0, this.graze - dt * 0.2);
    let ly = 0, lp = 0;
    if (st.look && st.root) {
      const lk = st.look.clone().sub(st.root.position);
      const yaw = st.root.rotation.y;
      const lx = lk.x * Math.cos(yaw) - lk.z * Math.sin(yaw), lz = lk.x * Math.sin(yaw) + lk.z * Math.cos(yaw);
      ly = clamp(Math.atan2(lx, lz), -1.1, 1.1); lp = clamp(Math.atan2(lk.y - (this.lay.J.head.y * (st.root.scale.x || 1)), Math.hypot(lx, lz)), -0.6, 0.5);
    }
    this.lookYaw += (ly - this.lookYaw) * Math.min(1, dt * 4);
    this.lookPitch += (lp - this.lookPitch) * Math.min(1, dt * 4);
    const grazeDown = sp < 0.1 ? Math.sin(Math.min(1, this.graze * 3) * Math.PI / 2) * 0.9 : 0;
    q(B.neck, -this.lookPitch * 0.4 + grazeDown + Math.sin(this.phase * TAU * 2) * 0.05 * moveW, this.lookYaw * 0.5, 0);
    q(B.head, -this.lookPitch * 0.6 + grazeDown * 0.3, this.lookYaw * 0.5, Math.sin(this.time * 0.7) * 0.05 + (this.happyT > 0 ? Math.sin(this.time * 6) * 0.15 : 0));
    // Tail.
    this.happyT = Math.max(0, this.happyT - dt);
    const wag = (this.happyT > 0 || (st.speed < 0.2 && t.species === 'dog' && st.nearPlayer)) ? Math.sin(this.time * 14) * 0.5 : Math.sin(this.time * 1.5) * 0.12;
    for (let i = 0; i < 4; i++) q(B['tail' + i], (t.tail[0] === 'curly' ? 0.4 : 0) + Math.sin(this.phase * TAU + i) * 0.05 * moveW, wag * (0.4 + i * 0.25), 0);
    // Wings: fold when idle, flap when moving fast or flying.
    const flapping = st.flying || runW > 0.6;
    this.flap += dt * (flapping ? 7 : 1.2);
    for (const s of [-1, 1]) {
      const id = 'W' + (s < 0 ? 'L' : 'R');
      const f = flapping ? Math.sin(this.flap) * 0.8 : -0.5 + Math.sin(this.flap) * 0.05;
      q(B[id + '0'], 0, s * (flapping ? 0 : 0.6), s * f);
      q(B[id + '1'], 0, s * (flapping ? 0 : 0.8), s * (flapping ? Math.sin(this.flap - 0.6) * 0.5 : -0.6));
    }
    // Sitting transition.
    this.sitW += ((this.sitting ? 1 : 0) - this.sitW) * Math.min(1, dt * 3);
    // Breathing.
    if (B.chest) B.chest.scale.setScalar(1 + Math.sin(this.time * (sp > 2 ? 6 : 2)) * 0.012);
  }
}

// ---------------- Generator ----------------
export const creatureGen = {
  maxCount: 16,
  estimate: (item) => 4 + (['elephant', 'dragon', 'sauropod', 'trex'].includes(item.params.species) ? 2 : 0),
  stages: () => [{ name: 'plan', label: 'Designing anatomy', weight: 0.4 }, { name: 'geometry', label: 'Sculpting body', weight: 4 }, { name: 'rig', label: 'Rigging & skinning', weight: 1 }, { name: 'textures', label: 'Painting coat', weight: 1 }],
  *build(ctx, item, rng) {
    const t = makeTemplate(item, rng);
    ctx.stage('plan', 'Designing ' + t.name.toLowerCase());
    yield;
    const lay = layout(t);
    const noise = new Noise(rng.nextU32() & 0xffff);
    const sdf = new SDFBuilder();
    sculpt(sdf, t, lay, rng, noise);
    ctx.stage('geometry', 'Sculpting body');
    const detail = genPreset().detail;
    const size = Math.max(t.S * t.len, t.S);
    const voxel = clamp(size * (detail > 0.8 ? 0.0095 : detail > 0.5 ? 0.0135 : 0.018), 0.0025, 0.12);
    const matOrder = ['fur', 'skin', 'scales', 'nose', 'horn', 'hoof', 'mane', 'ivory', 'gold', 'shell', 'wing'];
    const { geometry } = yield* sdfToGeometry(sdf, ctx, {
      voxel, skin: true, boneCount: lay.names.length, sigma: voxel * 2.2, matOrder, aoPow: 1.1, aoMin: 0.35,
      colorFn: makeColorFn(t, lay, noise), onProgress: (f) => ctx.progress(f, 'Sculpting body'),
    });
    ctx.stage('rig', 'Rigging & skinning');
    yield;
    // Skeleton.
    const bones = lay.names.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    lay.names.forEach((n, i) => {
      const p = lay.parent[n];
      if (p) { bones[lay.names.indexOf(p)].add(bones[i]); bones[i].position.copy(lay.J[n]).sub(lay.J[p]); }
      else bones[i].position.copy(lay.J[n]);
    });
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.add(bones[0]);
    bones[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    ctx.stage('textures', 'Painting coat');
    const M = G.materials;
    const coatType = { fur: 'fur', wool: 'knit', curly: 'knit', skin: 'skin', hide: 'leather', scales: 'scales' }[t.coat] || 'fur';
    const mats = {
      fur: M.get(coatType === 'skin' ? 'plaster' : coatType, { color: '#ffffff', vertexColors: true, roughness: coatType === 'scales' ? 0.5 : undefined, world: coatType === 'knit' ? 0.25 : undefined }),
      skin: M.get(t.coat === 'hide' ? 'leather' : 'plaster', { color: '#ffffff', vertexColors: true, world: t.coat === 'hide' ? 0.6 : undefined }),
      scales: M.get('scales', { color: '#ffffff', vertexColors: true, world: t.S * 0.15 }),
      nose: M.plain('#1a1414', 0.25, 0.0), horn: M.get('plaster', { color: '#d8ccb0' }), hoof: M.plain('#2a2420', 0.6, 0),
      mane: M.get('hair', { color: '#ffffff', vertexColors: true }), ivory: M.get('glossyPlastic', { color: '#f0e8d0' }), gold: M.get('gold'),
      shell: M.get('scales', { color: t.shellColor || '#5a4a2a', p: [8, 0.5] }), wing: M.get('leather', { color: new THREE.Color(t.base).multiplyScalar(0.7).getStyle() }),
    };
    if (t.glow) mats.gold = M.get('emissive', { color: '#ffe8a0', emissiveIntensity: 2 });
    const skinned = new THREE.SkinnedMesh(geometry, matOrder.map((k) => mats[k]));
    skinned.bind(skeleton, new THREE.Matrix4());
    skinned.castShadow = true; skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    holder.add(skinned);
    // Eyes (glossy spheres on the head bone).
    const headBone = bones[lay.names.indexOf('head')];
    const hr = t.S * t.head.r;
    const eyeCol = t.eyeColor || (t.coat === 'scales' ? '#d8a020' : '#2a1a0a');
    const eyeMat = t.glowEyes ? M.get('emissive', { color: eyeCol, emissiveIntensity: 2.5 }) : M.get('eye', {});
    const eyes = [];
    const nEyes = t.head.eyes || 2;
    for (let i = 0; i < nEyes; i++) {
      const s = nEyes === 1 ? 0 : (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2) * 0.4);
      const er = hr * (t.head.bigEyes ? 0.32 : t.young ? 0.2 : 0.16);
      const eg = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(er, 16, 12), t.glowEyes ? eyeMat : new THREE.MeshPhysicalMaterial({ color: eyeCol, roughness: 0.1, clearcoat: 1 }));
      eg.add(ball);
      if (!t.glowEyes) { const hl = new THREE.Mesh(new THREE.SphereGeometry(er * 0.25, 8, 6), M.plain('#ffffff', 0.1)); hl.position.set(er * 0.35, er * 0.4, er * 0.8); eg.add(hl); }
      const side = nEyes === 1 ? 0 : s;
      eg.position.set(side * hr * 0.55, hr * (0.25 + Math.floor(i / 2) * 0.25), hr * (t.head.flatHead ? 0.4 : 0.75));
      headBone.add(eg);
      eyes.push(eg);
    }
    root.add(holder);
    const anim = new CreatureAnimator(t, lay, bones, eyes);
    // Personality & brain.
    const flying = !!t.wings && (t.species === 'dragon' || t.species === 'griffin');
    const petName = item.attrs.name || rng.pick(NAMES.animal);
    const data = {
      root, name: item.attrs.name ? `${petName} the ${t.name.toLowerCase()}` : t.name, category: 'animal', icon: item.icon,
      height: t.S * (t.biped ? 1.5 : 1.3) + t.S * t.neck[0] * 0.8, footprint: { radius: Math.max(0.3, t.S * t.len * 0.5) },
    };
    const creature = {
      update: (dt, st) => { anim.update(dt, { ...st, nearPlayer: G.player && st.root && st.root.position.distanceTo(G.player.position) < 4 }); },
      vocalize: () => { if (G.audio) G.audio.play(soundFor(t), data.root.position, { pitch: t.pitch }); },
      happy: () => { anim.happyT = 3; },
      sit: (on) => { anim.sitting = on; },
      dispose: () => { skeleton.dispose(); },
    };
    makeNPC(data, {
      creature, rng: rng.fork('mind'), seed: rng.nextU32(),
      personalityInfo: { name: petName, animal: true, species: t.species, traits: item.attrs.personality && item.attrs.personality.length ? item.attrs.personality : null },
      radius: Math.max(0.2, t.S * t.girth * 1.2), subtitle: t.name,
      brainOpts: { animal: true, walkSpeed: t.gait[0], runSpeed: t.gait[1], radius: Math.max(0.2, t.S * t.girth), wanderRadius: t.S > 2 ? 12 : 6, turnSpeed: t.S > 2 ? 2 : 5, followDist: 1.5 + t.S * t.len },
    });
    data.name = item.attrs.name ? `${petName} the ${t.name.toLowerCase()}` : t.name;
    data.subtitle = item.attrs.name ? t.name : petName;
    // Animals obey 'sit' by folding their hind legs.
    data.onSit = () => creature.sit(true);
    const prevUpd = data.update;
    data.update = (dt, time, dist) => { if (data.brain && data.brain.state !== 'sit') creature.sit(false); prevUpd(dt, time, dist); };
    data.interact = { label: () => `Pet ${data.subtitle && item.attrs.name ? petName : data.name.toLowerCase()}`, action: () => { data.say(data.personality.animalLine(), 2.5); data.brain.talkWith(5); creature.happy(); creature.vocalize(); } };
    if (t.glow) data.lights = [{ pos: [0, t.S * 1.5, 0], color: '#ffe8f0', intensity: 2, distance: 8, nightOnly: false }];
    // Big creatures are solid obstacles.
    if (t.S > 1.2) data.colliderDefs = [];
    void flying;
    return data;
  },
};

function soundFor(t) {
  return { bark: 'bark', howl: 'bark', meow: 'meow', moo: 'moo', roar: 'roar', neigh: 'moo', baa: 'meow', oink: 'moo', trumpet: 'roar', screech: 'chirp' }[t.sound] || 'chirp';
}
