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
import { hsl, glowTexture } from './common.js';

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
  hippo: { S: 1.5, len: 1.5, girth: 0.46, neck: [0.1, 0.2, 0.3], head: { r: 0.26, snout: 0.28, snoutR: 0.2, ears: 'round', earS: 0.06, flatNose: true }, leg: 0.13, foot: 'column', tail: ['short', 0.15, 0], coat: 'hide', gait: [0.9, 5], sound: 'moo', pitch: 90 },
  macropod: { S: 1.1, len: 1.0, girth: 0.3, neck: [0.25, 1.1, 0.12], head: { r: 0.14, snout: 0.16, snoutR: 0.07, ears: 'long', earS: 0.18 }, leg: 0.1, foot: 'paw', tail: ['thick', 1.1, -0.2], coat: 'fur', gait: [1.2, 8], sound: 'squeak', pitch: 500, biped: true, hop: true },
  lizard: { S: 0.15, len: 2.6, girth: 0.4, neck: [0.2, 0.1, 0.35], head: { r: 0.35, snout: 0.45, snoutR: 0.18, ears: 'none', flatHead: true }, leg: 0.15, foot: 'claw', tail: ['thick', 2.8, 0.0], coat: 'scales', gait: [0.8, 4], sound: 'hiss', pitch: 400, sprawl: true },
  stegosaur: { S: 2.2, len: 1.6, girth: 0.34, neck: [0.2, 0.1, 0.18], head: { r: 0.1, snout: 0.15, snoutR: 0.06, ears: 'none' }, leg: 0.1, foot: 'column', tail: ['spiked', 1.4, 0.1], coat: 'scales', gait: [0.9, 3], sound: 'roar', pitch: 100, plates: true },
  ankylosaur: { S: 1.3, len: 1.8, girth: 0.5, neck: [0.12, 0.1, 0.25], head: { r: 0.22, snout: 0.12, snoutR: 0.14, ears: 'none', horn: 'goat' }, leg: 0.14, foot: 'column', tail: ['club', 1.5, 0.05], coat: 'scales', gait: [0.7, 2.5], sound: 'roar', pitch: 80, armor: true, sprawl: true },
  arthropod: { S: 0.15, len: 1.3, girth: 0.42, neck: [0.05, 0.1, 0.3], head: { r: 0.32, snout: 0.02, snoutR: 0.1, ears: 'none' }, leg: 0.05, foot: 'claw', tail: ['none', 0, 0], coat: 'skin', gait: [0.5, 3], sound: 'hiss', pitch: 900, insect: 4 },
  pterosaur: { S: 0.8, len: 1.0, girth: 0.2, neck: [0.55, 0.9, 0.08], head: { r: 0.12, snout: 0.55, snoutR: 0.05, ears: 'none', crest: true }, leg: 0.05, foot: 'claw', tail: ['thin', 0.3, 0], coat: 'skin', gait: [1, 6], sound: 'screech', pitch: 600, wings: 2.6 },
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
  // Arthropods
  spider: { arch: 'arthropod', insect: 4, abdomen: 1.7, colors: [['#1a1614', '#3a2a20'], ['#3a2a1a', '#6a4a2a']], head: { eyes: 8 } },
  tarantula: { arch: 'arthropod', S: 0.12, insect: 4, abdomen: 1.6, coat: 'fur', colors: [['#3a2a1a', '#c86a2a']], head: { eyes: 8 } },
  ant: { arch: 'arthropod', S: 0.02, insect: 3, abdomen: 1.3, colors: [['#1a1210', '#2a1a14'], ['#8a2a14', '#a83a1a']] },
  scorpion: { arch: 'arthropod', S: 0.08, len: 1.8, insect: 4, claws: true, colors: [['#3a2a14', '#a87a3a'], ['#141414', '#2a2a2a']], tail: ['thin', 2.2, 1.35], stinger: true },
  crab: { arch: 'arthropod', S: 0.12, len: 0.9, girth: 0.7, insect: 4, claws: true, colors: [['#c8401a', '#f08a4a']], head: { eyes: 2 } },
  lobster: { arch: 'arthropod', S: 0.12, len: 2.2, girth: 0.35, insect: 4, claws: true, colors: [['#b8201a', '#e05a3a']], tail: ['paddle', 1.2, 0] },
  beetle: { arch: 'arthropod', S: 0.04, insect: 3, shell: true, shellColor: '#1a6a3a', colors: [['#1a4a2a', '#0a2a1a']] },
  ladybug: { arch: 'arthropod', S: 0.02, insect: 3, shell: true, shellColor: '#d81a1a', ladybug: true, colors: [['#1a1a1a', '#1a1a1a']] },
  bee: { arch: 'arthropod', S: 0.02, insect: 3, abdomen: 1.3, wings: 1.2, pattern: 'tiger', colors: [['#f2c21a', '#f2c21a']], coat: 'fur' },
  wasp: { arch: 'arthropod', S: 0.025, insect: 3, abdomen: 1.4, wings: 1.2, pattern: 'tiger', colors: [['#f2d21a', '#f2d21a']] },
  seal: { arch: 'lizard', S: 0.35, len: 2.4, girth: 0.55, coat: 'skin', colors: [['#6a6a70', '#b8b8b8'], ['#3a3632', '#8a8070']], head: { r: 0.3, snout: 0.15, snoutR: 0.15, flatHead: false }, tail: ['paddle', 0.5, 0], sound: 'bark', pitch: 500 },
  walrus: { arch: 'lizard', S: 0.6, len: 2.4, girth: 0.6, coat: 'skin', colors: [['#8a6a5a', '#b89a8a']], head: { r: 0.32, snout: 0.15, snoutR: 0.18, flatHead: false, tusks: true }, tail: ['paddle', 0.4, 0], sound: 'moo', pitch: 120 },
  // Mammals
  kangaroo: { arch: 'macropod', colors: [['#b07a4a', '#e8d0b0']] },
  wallaby: { arch: 'macropod', S: 0.7, colors: [['#8a7a6a', '#d8c8b8']] },
  koala: { arch: 'ursid', S: 0.35, len: 1.1, colors: [['#8a8a8a', '#d8d8d8']], ears: 'round', head: { r: 0.32, snout: 0.06, snoutR: 0.11, earS: 0.18, flatNose: true } },
  sloth: { arch: 'primate', S: 0.4, colors: [['#8a7050', '#c8b090']], faceColor: '#d8c8a8', gait: [0.12, 0.3], tail: ['none', 0, 0] },
  hippo: { arch: 'hippo', colors: [['#8a7a80', '#d8a8a0']] },
  godzilla: { arch: 'theropod', S: 26, colors: [['#2a3430', '#4a5450']], spikes: true, fireBreath: 'fire', glowEyes: true },
  kingkong: { arch: 'primate', S: 9, girth: 0.4, colors: [['#1a1a1c', '#3a3a3c']], faceColor: '#2a2a2a', tail: ['none', 0, 0], sound: 'roar', pitch: 70 },
  mammoth: { arch: 'elephant', S: 3.4, coat: 'curly', colors: [['#5a3a22', '#6a4a30'], ['#6a4a2a', '#7a5a3a']] },
  wolverine: { arch: 'ursid', S: 0.42, len: 1.5, colors: [['#3a2a1a', '#8a6a3a']] },
  badger: { arch: 'ursid', S: 0.3, len: 1.6, colors: [['#3a3a3a', '#e8e8e8'], ['#5a5048', '#1a1a1a']] },
  skunk: { arch: 'canine', S: 0.25, len: 1.5, colors: [['#141414', '#f0f0f0']], pattern: 'saddle', tail: ['bushy', 1.0, 0.6], ears: 'round' },
  weasel: { arch: 'canine', S: 0.14, len: 2.3, girth: 0.28, leg: 0.1, colors: [['#8a5a2a', '#f0e0c0'], ['#f0ece4', '#f8f4ee']], head: { r: 0.22, snout: 0.1, snoutR: 0.1, earS: 0.06 }, ears: 'round', tail: ['thin', 0.8, 0.1], sound: 'squeak', pitch: 900 },
  meerkat: { arch: 'canine', S: 0.2, len: 1.4, girth: 0.3, colors: [['#b8986a', '#d8c8a0']], head: { r: 0.22, snout: 0.14, snoutR: 0.08, earS: 0.05 }, ears: 'round', tail: ['thin', 0.8, 0.2], sound: 'chatter', pitch: 900 },
  wombat: { arch: 'ursid', S: 0.35, len: 1.2, colors: [['#6a5a4a', '#8a7a6a']], ears: 'round' },
  capybara: { arch: 'rodent', S: 0.55, len: 1.5, girth: 0.5, colors: [['#8a6040', '#a88060']], tail: ['none', 0, 0] },
  mole: { arch: 'rodent', S: 0.06, len: 1.6, colors: [['#2a2a2e', '#3a3a3e']], tail: ['thin', 0.2, 0] },
  gorilla: { arch: 'primate', S: 1.1, girth: 0.4, colors: [['#1a1a1c', '#3a3a3c']], faceColor: '#2a2a2a', tail: ['none', 0, 0], sound: 'roar', pitch: 140 },
  chimpanzee: { arch: 'primate', S: 0.75, colors: [['#2a2220', '#4a3a30']], faceColor: '#c8a890', tail: ['none', 0, 0] },
  orangutan: { arch: 'primate', S: 0.8, colors: [['#b8561a', '#c87030']], faceColor: '#6a4a3a', tail: ['none', 0, 0] },
  lemur: { arch: 'primate', S: 0.3, colors: [['#8a8a8a', '#e8e8e8']], pattern: 'raccoon', tail: ['ringed', 1.6, 0.6] },
  otter: { arch: 'canine', S: 0.22, len: 2.2, girth: 0.3, leg: 0.1, colors: [['#5a3a22', '#a88a6a']], head: { r: 0.22, snout: 0.1, snoutR: 0.1, earS: 0.06 }, ears: 'round', tail: ['thick', 1.0, 0], sound: 'squeak', pitch: 800 },
  squirrel: { arch: 'rodent', S: 0.1, colors: [['#b0602a', '#f0e0c8'], ['#6a6a6a', '#e0e0e0']], tail: ['bushy', 1.6, 0.9] },
  hedgehog: { arch: 'rodent', S: 0.08, len: 1.5, girth: 0.6, colors: [['#6a5a4a', '#c8b8a0']], quills: true, tail: ['none', 0, 0] },
  porcupine: { arch: 'rodent', S: 0.25, len: 1.5, girth: 0.6, colors: [['#3a3028', '#8a7a6a']], quills: true, tail: ['short', 0.3, 0] },
  bat: { arch: 'rodent', S: 0.06, colors: [['#2a2220', '#4a3a30']], wings: 3, ears: 'bigpointy', tail: ['none', 0, 0] },
  hamster: { arch: 'rodent', S: 0.06, len: 1.3, girth: 0.6, colors: [['#d89a50', '#f8f0e0']], tail: ['none', 0, 0] },
  rat: { arch: 'rodent', S: 0.1, colors: [['#6a6460', '#a8a098']] },
  beaver: { arch: 'rodent', S: 0.25, len: 2, colors: [['#6a4020', '#8a6040']], tail: ['paddle', 0.9, -0.1], head: { teethFront: true } },
  platypus: { arch: 'rodent', S: 0.12, len: 2.2, colors: [['#6a4a2a', '#8a6a4a']], tail: ['paddle', 0.8, 0], head: { duckBill: true, snout: 0.0 } },
  moose: { arch: 'cervid', S: 1.9, colors: [['#4a3222', '#6a4a32']], antlers: 'palmate', head: { r: 0.14, snout: 0.32, snoutR: 0.1 } },
  reindeer: { arch: 'cervid', S: 1.1, colors: [['#8a7a6a', '#e8e0d8']], antlers: true },
  elk: { arch: 'cervid', S: 1.5, colors: [['#8a5a32', '#c8a070']], antlers: true },
  llama: { arch: 'camel', S: 1.2, hump: 0, coat: 'wool', colors: [['#f0e8d8', '#f8f0e8'], ['#8a6a4a', '#c8a888']] },
  alpaca: { arch: 'camel', S: 0.9, hump: 0, coat: 'wool', colors: [['#f4ece0', '#fff8f0'], ['#c89a6a', '#e8c8a0']] },
  donkey: { arch: 'equine', S: 1.2, colors: [['#8a8480', '#c8c4c0']], ears: 'long', head: { earS: 0.14 } },
  pony: { arch: 'equine', S: 1.0, colors: [['#c89a6a', '#c89a6a'], ['#f4f0ea', '#f4f0ea']], pattern: 'socks' },
  bull: { arch: 'bovine', colors: [['#2a1a14', '#4a3a2a']], horn: 'bull', sound: 'moo', pitch: 110 },
  buffalo: { arch: 'bovine', S: 1.6, colors: [['#2a2420', '#3a3430']], horn: 'bull' },
  bison: { arch: 'bovine', S: 1.7, hump: 1, colors: [['#4a3020', '#3a2418']], mane: 'lion', horn: 'bull' },
  yak: { arch: 'bovine', S: 1.5, coat: 'wool', colors: [['#2a2220', '#3a3028'], ['#f0ece4', '#f8f4ee']], horn: 'bull' },
  boar: { arch: 'suid', colors: [['#3a2a20', '#5a4a3a']], coat: 'fur', head: { tusks: true } },
  warthog: { arch: 'suid', S: 0.75, colors: [['#6a5a50', '#8a7a70']], head: { tusks: true } },
  hyena: { arch: 'canine', S: 0.8, colors: [['#b8a078', '#d8c8a8']], pattern: 'leopard', ears: 'round', sound: 'bark', pitch: 600 },
  coyote: { arch: 'canine', S: 0.6, colors: [['#a88a64', '#e0d0b8']], pattern: 'husky', sound: 'howl' },
  cheetah: { arch: 'feline', S: 0.8, len: 1.7, colors: [['#e0b060', '#f8f0e0']], pattern: 'dalmatian', sound: 'roar', pitch: 300 },
  jaguar: { arch: 'feline', S: 0.75, len: 1.6, colors: [['#d8a040', '#f4e8c8']], pattern: 'leopard', sound: 'roar', pitch: 150 },
  panther: { arch: 'feline', S: 0.75, len: 1.6, colors: [['#161618', '#202024']], sound: 'roar', pitch: 140, eyes: '#e8d020' },
  lynx: { arch: 'feline', S: 0.6, colors: [['#b8a080', '#e8e0d0']], ears: 'tuft', tail: ['short', 0.2, 0.3], pattern: 'leopard' },
  cougar: { arch: 'feline', S: 0.75, len: 1.7, colors: [['#b8885a', '#e8d8c0']], sound: 'roar', pitch: 200 },
  snowleopard: { arch: 'feline', S: 0.65, len: 1.7, colors: [['#d8d8d4', '#f4f4f2']], pattern: 'leopard', tail: ['bushy', 1.3, 0.2] },
  polarbear: { arch: 'ursid', S: 1.3, colors: [['#f4f2ea', '#fffdf8']] },
  grizzly: { arch: 'ursid', S: 1.2, colors: [['#6a4a2a', '#8a6a4a']] },
  redpanda: { arch: 'canine', S: 0.3, len: 1.5, girth: 0.34, colors: [['#c0501a', '#2a1a14']], pattern: 'raccoon', ears: 'round', tail: ['ringed', 1.1, 0.2] },
  anteater: { arch: 'canine', S: 0.8, colors: [['#8a7a6a', '#3a3028']], head: { r: 0.14, snout: 0.8, snoutR: 0.05, earS: 0.05 }, ears: 'round', tail: ['bushy', 1.2, 0] },
  armadillo: { arch: 'rodent', S: 0.15, len: 1.6, colors: [['#8a8078', '#b8b0a8']], shell: true, tail: ['thin', 0.8, 0] },
  tapir: { arch: 'suid', S: 1.0, colors: [['#1a1a1c', '#2a2a2c']], head: { trunk: 0.15 } },
  okapi: { arch: 'giraffe', S: 1.6, colors: [['#4a2a1a', '#6a3a22']], pattern: 'okapi', head: { ossicones: false } },
  // Reptiles & amphibians
  chameleon: { arch: 'lizard', S: 0.12, colors: [['#3ab04a', '#c8e050']], tail: ['curly', 1.2, 0.3], head: { bigEyes: true } },
  iguana: { arch: 'lizard', S: 0.25, colors: [['#3a8a3a', '#8ac050']], spikes: true },
  gecko: { arch: 'lizard', S: 0.06, colors: [['#8ac040', '#f0e080']], head: { bigEyes: true } },
  lizard: { arch: 'lizard', S: 0.1, colors: [['#6a7a3a', '#c8c080'], ['#3a6a8a', '#a8c8d8']] },
  komodo: { arch: 'lizard', S: 0.5, len: 3, colors: [['#5a5040', '#8a8060']] },
  axolotl: { arch: 'lizard', S: 0.08, coat: 'skin', colors: [['#f4a8c0', '#f8c8d8']], gills: true, head: { r: 0.45, snout: 0.15, snoutR: 0.3, bigEyes: true } },
  salamander: { arch: 'lizard', S: 0.07, coat: 'skin', colors: [['#1a1a1c', '#f2c21a']], pattern: 'dalmatian' },
  // Dinosaurs
  raptor: { arch: 'theropod', S: 0.9, colors: [['#8a6a3a', '#d8c8a0'], ['#4a5a6a', '#c8d0d8']], pattern: 'dinostripe', gait: [1.6, 10] },
  spinosaurus: { arch: 'theropod', S: 4, colors: [['#5a4a3a', '#a8987a']], sail: true, head: { snout: 0.5, snoutR: 0.1 } },
  stegosaurus: { arch: 'stegosaur', colors: [['#6a7a4a', '#c8c090']] },
  ankylosaurus: { arch: 'ankylosaur', colors: [['#7a6a4a', '#b8a880']] },
  pterodactyl: { arch: 'pterosaur', colors: [['#8a5a3a', '#d8b090']] },
  brachiosaurus: { arch: 'sauropod', S: 6, colors: [['#6a7a6a', '#a8b0a0']], neck: [2.3, 1.15, 0.1] },
  parasaurolophus: { arch: 'theropod', S: 2.6, colors: [['#6a8a5a', '#d0d8a0']], head: { crest: true, snout: 0.35, teeth: false } },
  // Mythical
  pegasus: { arch: 'equine', colors: [['#f8f6f4', '#ffffff']], wings: 2, maneColor: '#f0f0f0', glow: false },
  cerberus: { arch: 'canine', S: 1.1, heads: 3, colors: [['#1a1614', '#2a2420']], glowEyes: true, eyes: '#ff3020', sound: 'roar', pitch: 160, fireBreath: true },
  hydra: { arch: 'dragon', heads: 5, wings: 0, colors: [['#2a5a3a', '#a8c070'], ['#3a2a5a', '#8a70c0']], glowEyes: true },
  chimera: { arch: 'feline', S: 1.2, len: 1.6, heads: 2, colors: [['#c8a060', '#e8d0a0']], mane: 'lion', tail: ['spiked', 1.3, 0.3], horn: 'goat', sound: 'roar', pitch: 110, fireBreath: true },
  manticore: { arch: 'feline', S: 1.2, len: 1.6, colors: [['#b8603a', '#e0b080']], mane: 'lion', wings: 1.8, tail: ['spiked', 1.6, 0.9], sound: 'roar', pitch: 120 },
  hellhound: { arch: 'canine', S: 1.0, colors: [['#141212', '#2a1a14']], glowEyes: true, eyes: '#ff5010', spikes: true, fireBreath: true, sound: 'roar', pitch: 180 },
  kirin: { arch: 'cervid', S: 1.3, coat: 'scales', colors: [['#e8c040', '#f8e8a0']], horn: 'unicorn', maneColor: '#ff7a3a', glow: true },
  wyvern: { arch: 'dragon', S: 2.0, colors: [['#3a4a2a', '#8a9a60']], biped: false, glowEyes: true },
  centaur: { arch: 'equine', centaur: true, colors: [['#6a3a1a', '#6a3a1a'], ['#2a1a10', '#2a1a10'], ['#a86a3a', '#a86a3a'], ['#e8e0d0', '#e8e0d0']] },
  griffon: { arch: 'griffin', colors: [['#c8a060', '#e8d0a0']], headColor: '#f4f2ee' },
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
  for (const k of ['S', 'len', 'girth', 'leg', 'coat', 'sound', 'pitch', 'hump', 'gait', 'wings', 'heads', 'biped', 'spikes', 'quills', 'plates', 'sail', 'gills', 'centaur', 'fireBreath', 'shell', 'armor', 'hop', 'insect', 'abdomen', 'claws', 'stinger', 'ladybug']) if (S0[k] !== undefined) t[k] = JSON.parse(JSON.stringify(S0[k]));
  if (S0.neck) t.neck = S0.neck.slice();
  if (S0.head) Object.assign(t.head, S0.head);
  if (S0.ears) t.head.ears = S0.ears;
  if (S0.tail) t.tail = S0.tail;
  if (S0.horn) t.head.horn = S0.horn;
  t.species = sp;
  t.pattern = S0.pattern || null;
  t.mane = S0.mane || (A.mane ? 'horse' : null);
  t.maneColor = S0.maneColor;
  t.antlers = S0.antlers && (a.sex !== 'female') && !a.flags.young ? S0.antlers : false;
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
  t.name = { retriever: 'Golden retriever', shepherd: 'German shepherd', dane: 'Great dane', trex: 'T-rex', sauropod: 'Brontosaurus', godzilla: 'Godzilla', kingkong: 'King Kong', polarbear: 'Polar bear', redpanda: 'Red panda', snowleopard: 'Snow leopard', raptor: 'Velociraptor' }[sp] || sp[0].toUpperCase() + sp.slice(1);
  applyModifiers(t, a);
  if (t.centaur) centaurize(t, a, rng);
  return t;
}

// Prompt modifiers that work on any creature: extra heads, wings, horns,
// spikes, fire breath, extra legs, eye count, long necks/tails, statues.
function applyModifiers(t, a) {
  const txt = ' ' + (a.text || '').toLowerCase() + ' ';
  const has = (re) => re.test(txt);
  const num = (re) => { const m = txt.match(re); return m ? Number(m[1]) : 0; };
  const heads = a.heads || num(/(\d+)[\s-]*head(?:ed|s)\b/) || (has(/\b(two|double)[\s-]headed\b/) ? 2 : 0);
  if (heads > 1) t.heads = Math.min(9, heads);
  if ((a.flags.wings || has(/\b(winged|with wings|wings)\b/)) && !t.wings) { t.wings = t.S > 1.2 ? 1.6 : 2.2; t.featherWings = !has(/\b(bat|dragon|demon|leathery)\b/) && t.coat !== 'scales'; }
  if (has(/\b(horned|horns)\b/) && !t.head.horn) t.head.horn = t.coat === 'scales' ? 'dragon' : 'goat';
  if (has(/\b(a|one|single) horn\b/)) t.head.horn = 'unicorn';
  if (has(/\b(spiky|spiked|spikes|spiny)\b/)) t.spikes = true;
  if (has(/fire[\s-]*breathing|breath(?:es|ing)? fire|spit(?:s|ting)? fire|fiery/)) t.fireBreath = 'fire';
  if (has(/(ice|frost)[\s-]*(breathing|breath)|breath(?:es|ing)? (ice|frost)/)) t.fireBreath = 'ice';
  const legs = num(/(\d+)[\s-]*legged/) || countWith(a, 'leg');
  if (legs > 4 && !t.biped) t.extraLegPairs = Math.min(4, Math.round((legs - 4) / 2));
  const eyes = num(/(\d+)[\s-]*eyed/) || countWith(a, 'eye') || (has(/\b(one-eyed|cyclops)\b/) ? 1 : 0);
  if (eyes) t.head.eyes = Math.min(8, eyes);
  if (has(/long[\s-]*neck/)) t.neck[0] *= 1.8;
  if (has(/long[\s-]*tail/)) t.tail[1] *= 1.8;
  if (has(/\b(fluffy|furry|shaggy)\b/) && t.coat === 'fur') t.coat = 'curly';
  if (has(/\b(robotic|mechanical|cyborg)\b/)) t.statue = 'chrome';
  const mat = a.materials && a.materials[0];
  if (has(/\b(statue|sculpture|figurine|carved|made of|made from|out of)\b/)) t.statue = mat || 'marble';
  else if (mat && ['stone', 'marble', 'granite', 'bronze', 'concrete', 'rock', 'wood', 'planks', 'copper', 'blackMarble'].includes(mat)) t.statue = mat;
  if (a.flags.transparent || has(/\b(ghost|ghostly|spectral)\b/)) t.ghost = true;
}
function centaurize(t, a, rng) {
  t.head.r = 0.075; t.head.snout = 0; t.head.ears = 'none'; t.head.horn = null; t.mane = 'horse';
  t.skinTone = rng.pick(['#e8c4a0', '#c89870', '#8a5a3a', '#f0d0b0', '#5a3a26']);
  t.hairColor = a.hair && a.hair.color ? a.hair.color : rng.pick(['#2a1a10', '#5a3a1a', '#c8a060', '#1a1a1a', '#8a3a1a']);
  t.maneColor = t.hairColor;
  t.beard = a.sex !== 'female' && rng.chance(0.5);
  t.name = a.sex === 'female' ? 'Centauress' : 'Centaur';
}
function countWith(a, word) { const wc = a.withCounts || {}; return wc[word] || wc[word + 's'] || 0; }

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
  const na = t.centaur ? 1.5 : t.neck[1], nl = t.centaur ? S * 0.52 : S * t.neck[0];
  const neckBase = new THREE.Vector3(0, J.chest.y + R * (t.centaur ? 0.55 : 0.35), chestZ + R * (t.centaur ? 0.35 : 0.55));
  add('neck', neckBase, 'chest');
  const headP = neckBase.clone().add(new THREE.Vector3(0, Math.sin(na) * nl, Math.cos(na) * nl));
  add('head', headP, 'neck');
  const heads = [{ neck: 'neck', head: 'head', yaw: 0 }];
  for (let i = 1; i < (t.heads || 1); i++) {
    const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
    const yawOff = side * k * (t.heads > 3 ? 0.34 : 0.45);
    const base = neckBase.clone().add(new THREE.Vector3(side * k * R * 0.38, -k * R * 0.06, -k * R * 0.12));
    const len = nl * (1 - k * 0.06);
    const dir = new THREE.Vector3(Math.sin(yawOff) * Math.cos(na), Math.sin(na), Math.cos(yawOff) * Math.cos(na));
    add('neck' + i, base, 'chest');
    add('head' + i, base.clone().addScaledVector(dir, len), 'neck' + i);
    heads.push({ neck: 'neck' + i, head: 'head' + i, yaw: yawOff });
  }
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
    const extra = t.extraLegPairs || 0;
    for (let i = 0; i < extra; i++) {
      const f = (i + 1) / (extra + 1);
      for (const s of [-1, 1]) legDefs.push({ side: s, front: i % 2 === 0, z: lerp(chestZ - R * 0.1, hipZ + R * 0.05, f), y: lerp(J.chest.y - R * 0.45, hipY - R * 0.35, f), anchor: f < 0.5 ? 'chest' : 'hips', idx: 10 + i });
    }
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
  return { J, parent, names, legs, wings, heads, S, L, R, hipZ, chestZ };
}

// ---------------- Sculpting ----------------
function sculpt(sdf, t, lay, rng, noise) {
  const { J, S, R } = lay;
  const bi = (n) => lay.names.indexOf(n);
  const v = (p) => [p.x, p.y, p.z];
  const v3 = v;
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
  // Neck & head (once per head; centaurs get a human torso instead).
  const sculptHead = (nk, hk, yaw) => {
    const Jn = J[nk], Jh = J[hk], bn = bi(nk), bh = bi(hk);
    // Neck.
    const nr = S * t.neck[2];
    sdf.roundCone(v(Jn), v(Jh), Math.max(nr, R * 0.45), nr * 0.85, { bone: bn, op: 'smooth', k: k * 0.8, disp, tag: 'neck' });
    // Head.
    const H = t.head;
    const hr = S * H.r;
    const na = t.neck[1];
    const hd = new THREE.Vector3(0, na >= 0.8 ? -0.6 : -Math.sin(Math.min(0.6, na * 0.4)) * 0.5, 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw || 0);
    if (!H.flatHead) sdf.ellipsoid(v(Jh), [hr * 0.9, hr * 0.95, hr * 1.05], { bone: bh, op: 'smooth', k: hr * 0.4, tag: 'head', disp: wool ? null : disp });
    else sdf.ellipsoid(v(Jh), [hr * 0.9, hr * 0.45, hr * 1.1], { bone: bh, op: 'smooth', k: hr * 0.3, tag: 'head' });
    const snoutL = S * H.snout, sr = S * H.snoutR;
    const snoutTip = Jh.clone().addScaledVector(hd, hr * 0.6 + snoutL);
    if (snoutL > 0.001) sdf.roundCone(v(Jh.clone().addScaledVector(hd, hr * 0.3)), v(snoutTip), sr * 1.15, sr * (H.flatNose ? 1 : 0.75), { bone: bh, op: 'smooth', k: hr * 0.3, tag: 'muzzle', mat: coatMat });
    if (H.flatHead) { sdf.ellipsoid(v(snoutTip.clone().add(new THREE.Vector3(0, 0, -snoutL * 0.5))), [sr * 1.1, sr * 0.5, snoutL * 0.55], { bone: bh, op: 'smooth', k: sr * 0.5, tag: 'muzzle' }); }
    // Nose.
    if (!H.beak && snoutL > 0.001) sdf.ellipsoid(v(snoutTip.clone().addScaledVector(hd, -sr * 0.15)), [sr * 0.55, sr * 0.4, sr * 0.35], { bone: bh, op: 'smooth', k: sr * 0.1, mat: 'nose', tag: 'nose', priority: 2 });
    if (H.beak) {
      const bt = Jh.clone().addScaledVector(hd, hr * 1.7).add(new THREE.Vector3(0, -hr * 0.4, 0));
      sdf.roundCone(v(Jh.clone().addScaledVector(hd, hr * 0.7)), v(bt), hr * 0.35, hr * 0.05, { bone: bh, op: 'smooth', k: hr * 0.1, mat: 'horn', tag: 'beak', priority: 2 });
    }
    // Teeth.
    if (H.teeth && snoutL > 0.001) {
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
        const f = 0.3 + i * 0.11;
        const p = Jh.clone().addScaledVector(hd, hr * 0.5 + snoutL * f).add(new THREE.Vector3(s * sr * 0.75, -sr * 0.55, 0));
        sdf.roundCone(v(p), v(p.clone().add(new THREE.Vector3(0, -sr * 0.35, 0))), sr * 0.1, sr * 0.01, { bone: bh, mat: 'horn', tag: 'tooth', priority: 3 });
      }
    }
    // Ears.
    const earBase = (s) => Jh.clone().add(new THREE.Vector3(s * hr * 0.55, hr * 0.65, -hr * 0.2));
    const es = S * (H.earS || 0.1);
    for (const s of [-1, 1]) {
      const b = earBase(s);
      switch (H.ears) {
        case 'pointy': case 'bigpointy': sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * es * 0.3, es, -es * 0.15))), es * 0.35, es * 0.04, { bone: bh, op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
        case 'floppy': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * hr * 0.35, -es * 0.6, 0))), [es * 0.15, es * 0.75, es * 0.45], { bone: bh, op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat, rot: [0, 0, s * 0.25] }); break;
        case 'round': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(0, es * 0.2, 0))), [es * 0.55, es * 0.55, es * 0.18], { bone: bh, op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
        case 'long': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * es * 0.12, es * 0.5, -es * 0.1))), [es * 0.14, es * 0.55, es * 0.08], { bone: bh, op: 'smooth', k: es * 0.08, tag: 'ear', mat: coatMat, rot: [-0.2, 0, s * 0.15] }); break;
        case 'side': sdf.ellipsoid(v(b.clone().add(new THREE.Vector3(s * es * 0.9, -es * 0.3, 0))), [es * 0.7, es * 0.25, es * 0.4], { bone: bh, op: 'smooth', k: es * 0.15, tag: 'ear', mat: coatMat, rot: [0, 0, s * -0.3] }); break;
        case 'elephant': sdf.ellipsoid(v(Jh.clone().add(new THREE.Vector3(s * hr * 0.9, -hr * 0.1, -hr * 0.5))), [es * 0.12, es * 0.95, es * 0.8], { bone: bh, op: 'smooth', k: es * 0.1, tag: 'ear', mat: coatMat, rot: [0, s * 0.5, 0] }); break;
        case 'tuft': sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * es * 0.2, es, -es * 0.4))), es * 0.25, es * 0.03, { bone: bh, op: 'smooth', k: es * 0.2, tag: 'ear', mat: coatMat }); break;
        default: break;
      }
    }
    // Horns & antlers.
    const hornAt = (s, dx, dy, dz, len, r0, dir, mat = 'horn') => {
      const b = Jh.clone().add(new THREE.Vector3(s * dx, dy, dz));
      sdf.roundCone(v(b), v(b.clone().add(dir.clone().multiplyScalar(len))), r0, r0 * 0.1, { bone: bh, op: 'smooth', k: r0 * 0.4, mat, tag: 'horn', priority: 2 });
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
    if (t.antlers === 'palmate') for (const sd of [-1, 1]) {
      const b0 = Jh.clone().add(new THREE.Vector3(sd * hr * 0.45, hr * 0.85, -hr * 0.1));
      sdf.roundCone(v(b0), v(b0.clone().add(new THREE.Vector3(sd * hr * 1.1, hr * 0.6, 0))), hr * 0.12, hr * 0.1, { bone: bh, mat: 'horn', tag: 'horn', priority: 2 });
      sdf.ellipsoid(v(b0.clone().add(new THREE.Vector3(sd * hr * 2.0, hr * 1.1, -hr * 0.1))), [hr * 1.1, hr * 0.12, hr * 0.8], { bone: bh, mat: 'horn', tag: 'horn', priority: 2, rot: [0, 0, sd * 0.45] });
    } else if (t.antlers) for (const s of [-1, 1]) {
      const b = Jh.clone().add(new THREE.Vector3(s * hr * 0.4, hr * 0.85, -hr * 0.1));
      const main = b.clone().add(new THREE.Vector3(s * hr * 1.2, hr * 2.2, -hr * 0.6));
      sdf.roundCone(v(b), v(main), hr * 0.1, hr * 0.05, { bone: bh, mat: 'horn', tag: 'horn', priority: 2 });
      for (let i = 1; i <= 3; i++) { const p = b.clone().lerp(main, i / 3.5); sdf.roundCone(v(p), v(p.clone().add(new THREE.Vector3(s * hr * 0.2, hr * 0.7, hr * 0.35))), hr * 0.06, hr * 0.02, { bone: bh, mat: 'horn', tag: 'horn', priority: 2 }); }
    }
    if (H.ossicones) for (const s of [-1, 1]) hornAt(s, hr * 0.3, hr * 0.8, -hr * 0.2, hr * 0.8, hr * 0.12, new THREE.Vector3(0, 1, -0.1).normalize(), coatMat);
    if (H.frill) sdf.ellipsoid(v(Jh.clone().add(new THREE.Vector3(0, hr * 0.8, -hr * 0.8))), [hr * 1.6, hr * 1.4, hr * 0.15], { bone: bh, op: 'smooth', k: hr * 0.3, tag: 'frill', mat: coatMat, rot: [-0.6, 0, 0] });
    // Trunk & tusks.
    if (H.trunk) {
      const pts = [];
      let p = Jh.clone().addScaledVector(hd, hr * 0.8).add(new THREE.Vector3(0, -hr * 0.1, 0));
      for (let i = 0; i <= 5; i++) { const f = i / 5; pts.push([p.x, p.y, p.z, hr * (0.38 - f * 0.26)]); p = p.clone().add(new THREE.Vector3(0, -S * H.trunk / 5, S * H.trunk * 0.08 * (1 - f))); }
      sdf.chain(pts, { bone: bh, mat: coatMat, tag: 'trunk', op: 'smooth', k: hr * 0.2 });
    }
    if (H.tusks) for (const s of [-1, 1]) { const b = Jh.clone().addScaledVector(hd, hr * 0.7).add(new THREE.Vector3(s * hr * 0.35, -hr * 0.45, 0)); sdf.roundCone(v(b), v(b.clone().add(new THREE.Vector3(s * hr * 0.1, -hr * 0.6, hr * 0.9))), hr * 0.09, hr * 0.03, { bone: bh, mat: 'ivory', tag: 'tusk', priority: 3 }); }
    // Mane.
    if (t.mane === 'lion') sdf.ellipsoid(v(Jh.clone().add(new THREE.Vector3(0, 0, -hr * 0.5))), [hr * 1.6, hr * 1.7, hr * 1.2], { bone: bn, op: 'smooth', k: hr * 0.3, tag: 'mane', mat: 'mane', disp: { amp: hr * 0.12, freq: 6 / hr, oct: 2 } });
    if (t.mane === 'horse') {
      const n0 = Jn.clone().add(new THREE.Vector3(0, nr * 0.9, -nr * 0.2)), n1 = Jh.clone().add(new THREE.Vector3(0, hr * 0.8, -hr * 0.4));
      sdf.roundCone(v(n0), v(n1), nr * 0.35, nr * 0.25, { bone: bn, op: 'smooth', k: nr * 0.2, tag: 'mane', mat: 'mane', disp: { amp: nr * 0.08, freq: 8 / nr, oct: 2 } });
    }
    if (t.beard) sdf.roundCone(v(snoutTip.clone().add(new THREE.Vector3(0, -sr, -snoutL * 0.3))), v(snoutTip.clone().add(new THREE.Vector3(0, -sr * 3, -snoutL * 0.4))), sr * 0.4, sr * 0.1, { bone: bh, mat: coatMat, tag: 'beard' });
    // Duck bill (platypus), head crest (pterosaurs, hadrosaurs), gills (axolotl), buck teeth.
    if (H.duckBill) sdf.ellipsoid(v(Jh.clone().addScaledVector(hd, hr * 1.25).add(new THREE.Vector3(0, -hr * 0.15, 0))), [hr * 0.55, hr * 0.12, hr * 0.7], { bone: bh, op: 'smooth', k: hr * 0.15, mat: 'nose', tag: 'bill', priority: 2 });
    if (H.crest) sdf.roundCone(v(Jh.clone().add(new THREE.Vector3(0, hr * 0.5, 0))), v(Jh.clone().addScaledVector(hd, -hr * 2.2).add(new THREE.Vector3(0, hr * 1.4, 0))), hr * 0.25, hr * 0.08, { bone: bh, op: 'smooth', k: hr * 0.2, tag: 'crest', mat: coatMat });
    if (t.gills) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const b0 = Jh.clone().add(new THREE.Vector3(sd * hr * 0.8, hr * (0.3 - i * 0.25), -hr * 0.3)); sdf.roundCone(v(b0), v(b0.clone().add(new THREE.Vector3(sd * hr * 0.9, hr * (0.5 - i * 0.2), -hr * 0.5))), hr * 0.12, hr * 0.05, { bone: bh, op: 'smooth', k: hr * 0.08, mat: coatMat, tag: 'gill' }); }
    if (H.teethFront) sdf.box(v(snoutTip.clone().add(new THREE.Vector3(0, -sr * 0.8, -sr * 0.1))), [sr * 0.35, sr * 0.35, sr * 0.08], { bone: bh, mat: 'ivory', tag: 'tooth', priority: 3 });
  };
  for (const h of lay.heads) {
    if (t.centaur && h.head === 'head') sculptHuman(sdf, t, lay, bi);
    else sculptHead(h.neck, h.head, h.yaw);
  }
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
    if (tt === 'paddle') sdf.ellipsoid(v(J.tailTip.clone().lerp(pts[pts.length - 2], 0.5)), [R * 0.55, R * 0.12, t.S * t.tail[1] * 0.35], { bone: bi(tailBones[tailBones.length - 1]), op: 'smooth', k: R * 0.1, mat: 'skin', tag: 'tailtip' });
    if (tt === 'club') sdf.ellipsoid(v(J.tailTip), [R * 0.4, R * 0.25, R * 0.35], { bone: bi(tailBones[tailBones.length - 1]), op: 'smooth', k: R * 0.1, mat: 'horn', tag: 'tailtip' });
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
  // Arthropod parts: abdomen, pincers, stinger.
  if (t.abdomen) sdf.ellipsoid([0, J.hips.y + R * 0.15, lay.hipZ - R * 0.9 * t.abdomen], [R * t.abdomen, R * t.abdomen * 0.85, R * t.abdomen * 1.25], { bone: bi('hips'), op: 'smooth', k: R * 0.25, mat: coatMat, tag: 'body', disp });
  if (t.claws) for (const sd of [-1, 1]) {
    const b0 = new THREE.Vector3(sd * R * 0.7, J.chest.y, lay.chestZ + R * 0.4), el = b0.clone().add(new THREE.Vector3(sd * R * 0.9, R * 0.2, R * 0.9)), cl = el.clone().add(new THREE.Vector3(-sd * R * 0.2, 0, R * 1.0));
    sdf.roundCone(v(b0), v(el), R * 0.18, R * 0.15, { bone: bi('chest'), mat: coatMat, tag: 'leg', op: 'smooth', k: R * 0.1 });
    sdf.roundCone(v(el), v(cl), R * 0.28, R * 0.2, { bone: bi('chest'), mat: coatMat, tag: 'leg', op: 'smooth', k: R * 0.1 });
    sdf.roundCone(v(cl), v(cl.clone().add(new THREE.Vector3(sd * R * 0.15, 0, R * 0.55))), R * 0.14, R * 0.03, { bone: bi('chest'), mat: coatMat, tag: 'leg' });
    sdf.roundCone(v(cl), v(cl.clone().add(new THREE.Vector3(-sd * R * 0.2, 0, R * 0.5))), R * 0.1, R * 0.02, { bone: bi('chest'), mat: coatMat, tag: 'leg' });
  }
  if (t.stinger && J.tailTip) sdf.roundCone(v(J.tailTip), v(J.tailTip.clone().add(new THREE.Vector3(0, -R * 0.2, R * 0.6))), R * 0.2, R * 0.02, { bone: bi('tail3'), mat: 'horn', tag: 'tailtip', priority: 2 });
  // Quills (hedgehog, porcupine): many thin cones over the back.
  if (t.quills) {
    for (let i = 0; i < 90; i++) {
      const u = (i * 0.618) % 1, v = (i * 0.3819) % 1;
      const z = lerp(lay.hipZ - R * 0.6, lay.chestZ + R * 0.3, u), an = lerp(-1.3, 1.3, v);
      const c = new THREE.Vector3(Math.sin(an) * R * 0.85, J.hips.y + Math.cos(an) * R * 0.85, z);
      const dir = new THREE.Vector3(Math.sin(an) * 0.8, Math.cos(an), -0.6).normalize();
      sdf.roundCone(v3(c), v3(c.clone().addScaledVector(dir, R * 0.7)), R * 0.06, R * 0.008, { bone: bi(u > 0.5 ? 'chest' : 'hips'), mat: 'horn', tag: 'spike', priority: 2 });
    }
  }
  // Back plates (stegosaurus) and sail (spinosaurus).
  if (t.plates) for (let i = 0; i < 9; i++) {
    const f = i / 8, p = J.hips.clone().lerp(J.chest, 0.15 + f * 0.8); p.y += R * 0.9;
    const hgt = R * (0.5 + Math.sin(f * Math.PI) * 0.7);
    sdf.ellipsoid([0, p.y + hgt * 0.4, p.z], [R * 0.06, hgt * 0.55, hgt * 0.45], { bone: bi(f < 0.5 ? 'hips' : 'chest'), mat: 'horn', tag: 'plate', priority: 2, rot: [(i % 2 ? 0.15 : -0.15), 0, 0] });
  }
  if (t.sail) { const c = J.hips.clone().lerp(J.chest, 0.5); sdf.ellipsoid([0, c.y + R * 1.4, c.z], [R * 0.08, R * 1.2, (lay.chestZ - lay.hipZ) * 0.6], { bone: bi('chest'), mat: t.coat === 'scales' ? 'scales' : 'skin', tag: 'sail', op: 'smooth', k: R * 0.1 }); }
  if (t.armor) for (let i = 0; i < 24; i++) { const u = (i * 0.618) % 1, v = (i * 0.3819) % 1; const z = lerp(lay.hipZ - R * 0.3, lay.chestZ, u), an = lerp(-1.1, 1.1, v); sdf.roundCone([Math.sin(an) * R, J.hips.y + Math.cos(an) * R, z], [Math.sin(an) * R * 1.25, J.hips.y + Math.cos(an) * R * 1.25, z], R * 0.12, R * 0.02, { bone: bi(u > 0.5 ? 'chest' : 'hips'), mat: 'horn', tag: 'spike', priority: 2 }); }
  // Wing membranes (thin, attached to wing bones).
  for (const w of lay.wings) {
    const b0 = J[w.id + '0'], b1 = J[w.id + '1'], tip = J[w.id + 'tip'];
    sdf.roundCone(v(b0), v(b1), R * 0.12, R * 0.08, { bone: bi(w.id + '0'), mat: coatMat, tag: 'wingbone' });
    sdf.roundCone(v(b1), v(tip), R * 0.08, R * 0.03, { bone: bi(w.id + '1'), mat: coatMat, tag: 'wingbone' });
    // Membrane: flattened ellipsoids between bone and body.
    const mc = b1.clone().lerp(J.hips, 0.4); mc.y = b1.y - S * 0.2;
    sdf.ellipsoid(v(b0.clone().lerp(tip, 0.5).lerp(mc, 0.4)), [S * t.wings * 0.55, R * 0.05, S * 0.45], { bone: bi(w.id + '1'), mat: t.species === 'griffin' || t.species === 'pegasus' || t.featherWings ? coatMat : 'wing', tag: 'wing', rot: [0, 0, w.side * -0.25] });
    sdf.ellipsoid(v(b0.clone().lerp(mc, 0.5)), [S * t.wings * 0.3, R * 0.05, S * 0.35], { bone: bi(w.id + '0'), mat: t.species === 'griffin' || t.species === 'pegasus' || t.featherWings ? coatMat : 'wing', tag: 'wing', rot: [0, 0, w.side * -0.15] });
  }
  void noise; void rng;
}

// Centaur: a human torso, arms and head rising from the horse's chest.
function sculptHuman(sdf, t, lay, bi) {
  const { J, S, R } = lay;
  const hr = S * t.head.r;
  const Jn = J.neck, Jh = J.head, bn = bi('neck'), bh = bi('head');
  const sh = Jh.y - hr * 2.0;
  const skin = { mat: 'skin', tag: 'h_skin' };
  sdf.roundCone([Jn.x, Jn.y - R * 0.2, Jn.z], [0, sh - hr * 1.2, Jn.z + hr * 0.3], R * 0.62, hr * 1.8, { ...skin, bone: bn, op: 'smooth', k: R * 0.35 });
  sdf.ellipsoid([0, sh - hr * 0.6, Jn.z + hr * 0.35], [hr * 2.3, hr * 1.25, hr * 1.25], { ...skin, bone: bn, op: 'smooth', k: hr * 0.6 });
  sdf.capsule([0, sh, Jn.z + hr * 0.3], [0, Jh.y - hr * 0.6, Jh.z], hr * 0.5, { ...skin, bone: bh, op: 'smooth', k: hr * 0.3 });
  for (const sd of [-1, 1]) {
    const s0 = [sd * hr * 2.0, sh - hr * 0.4, Jn.z + hr * 0.3], el = [sd * hr * 2.5, sh - hr * 3.2, Jn.z + hr * 1.2], hand = [sd * hr * 1.6, sh - hr * 5.3, Jn.z + hr * 2.6];
    sdf.capsule(s0, el, hr * 0.46, { ...skin, bone: bn, op: 'smooth', k: hr * 0.4 });
    sdf.capsule(el, hand, hr * 0.38, { ...skin, bone: bn, op: 'smooth', k: hr * 0.2 });
    sdf.sphere(hand, hr * 0.42, { ...skin, bone: bn, op: 'smooth', k: hr * 0.15 });
    sdf.ellipsoid([sd * hr * 0.95, Jh.y, Jh.z - hr * 0.05], [hr * 0.18, hr * 0.32, hr * 0.22], { ...skin, bone: bh, op: 'smooth', k: hr * 0.1 });
  }
  sdf.ellipsoid([Jh.x, Jh.y, Jh.z], [hr * 0.9, hr * 1.1, hr * 1.0], { ...skin, bone: bh, op: 'smooth', k: hr * 0.3 });
  sdf.ellipsoid([0, Jh.y - hr * 0.1, Jh.z + hr * 0.95], [hr * 0.16, hr * 0.25, hr * 0.18], { ...skin, bone: bh, op: 'smooth', k: hr * 0.1 });
  sdf.ellipsoid([0, Jh.y + hr * 0.35, Jh.z - hr * 0.15], [hr * 1.02, hr * 0.85, hr * 1.05], { mat: 'mane', tag: 'h_hair', bone: bh, op: 'smooth', k: hr * 0.2, disp: { amp: hr * 0.08, freq: 6 / hr, oct: 2 } });
  if (t.beard) sdf.ellipsoid([0, Jh.y - hr * 0.7, Jh.z + hr * 0.6], [hr * 0.6, hr * 0.5, hr * 0.4], { mat: 'mane', tag: 'h_hair', bone: bh, op: 'smooth', k: hr * 0.2 });
}

// A standalone animal head (for animal-headed humanoids: minotaur, werewolf,
// jackal-headed god, lizard folk...). Returns a Group sized to `size` (head
// width in metres), snout along +Z, centred on the skull.
const HEAD_OF = { bull: ['bovine', 'bull', '#4a3020'], cow: ['bovine', 'bull', '#f0ece4'], wolf: ['canine', null, '#6a6660'], dog: ['canine', null, '#8a5a2a'], jackal: ['canine', null, '#1a1614'], fox: ['canine', null, '#d8601a'], cat: ['feline', null, '#8a7a6a'], lion: ['feline', null, '#c8a060'], tiger: ['feline', null, '#e07820'], lizard: ['croc', null, '#4a7a3a'], croc: ['croc', null, '#3a4a2a'], pig: ['suid', null, '#f0b0a8'], boar: ['suid', null, '#3a2a20'], rabbit: ['leporid', null, '#d8d0c8'], bear: ['ursid', null, '#5a3a22'], horse: ['equine', null, '#6a3a1a'], goat: ['ovine', 'goat', '#e8e0d0'], ram: ['ovine', 'goat', '#e8e0d0'], eagle: ['griffin', null, '#f4f2ee'], owl: ['griffin', null, '#8a6a4a'], deer: ['cervid', null, '#a8683a'], elephant: ['elephant', null, '#8a8680'], monkey: ['primate', null, '#6a4a2a'], dragon: ['dragon', 'dragon', '#8a1a1a'], shark: ['croc', null, '#6a7a8a'] };
export const animalHeadColor = (kind) => (HEAD_OF[kind] || HEAD_OF.wolf)[2];
export const ANIMAL_HEADS = Object.keys(HEAD_OF);
export function* buildAnimalHead(kind, size, ctx, rng, opts = {}) {
  const [archName, horn, col0] = HEAD_OF[kind] || HEAD_OF.wolf;
  const col = opts.color || col0;
  const A = ARCH[archName];
  const H = JSON.parse(JSON.stringify(A.head));
  const S = 1;
  const hr = H.r;
  const sdf = new SDFBuilder();
  const coat = A.coat === 'scales' ? 'scales' : 'fur';
  const hd = new THREE.Vector3(0, -0.12, 1).normalize();
  const c0 = new THREE.Vector3(0, 0, 0);
  sdf.beginGroup({ op: 'union', defaults: { mat: coat } });
  sdf.ellipsoid([0, 0, 0], [hr * 0.9, hr * 0.95, hr * 1.05], { tag: 'head' });
  const snoutL = Math.max(H.snout, archName === 'griffin' ? 0 : 0.08), sr = H.snoutR;
  const tip = c0.clone().addScaledVector(hd, hr * 0.6 + snoutL);
  if (snoutL > 0.01) sdf.roundCone([0, -hr * 0.05, hr * 0.3], [tip.x, tip.y, tip.z], sr * 1.15, sr * (H.flatNose ? 1 : 0.75), { op: 'smooth', k: hr * 0.3, tag: 'muzzle' });
  if (archName !== 'griffin') sdf.ellipsoid([tip.x, tip.y, tip.z - sr * 0.15], [sr * 0.55, sr * 0.4, sr * 0.35], { mat: 'nose', priority: 2, op: 'smooth', k: sr * 0.1 });
  else sdf.roundCone([0, -hr * 0.1, hr * 0.7], [0, -hr * 0.45, hr * 1.7], hr * 0.35, hr * 0.05, { mat: 'horn', priority: 2, op: 'smooth', k: hr * 0.1 });
  if (H.teeth || archName === 'canine') for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const p = c0.clone().addScaledVector(hd, hr * 0.5 + snoutL * (0.4 + i * 0.15)).add(new THREE.Vector3(sd * sr * 0.7, -sr * 0.55, 0)); sdf.roundCone([p.x, p.y, p.z], [p.x, p.y - sr * 0.35, p.z], sr * 0.1, sr * 0.01, { mat: 'horn', priority: 3 }); }
  const es = H.earS || 0.1;
  for (const sd of [-1, 1]) {
    const b = new THREE.Vector3(sd * hr * 0.55, hr * 0.65, -hr * 0.2);
    if (H.ears === 'pointy' || H.ears === 'bigpointy' || H.ears === 'tuft') sdf.roundCone([b.x, b.y, b.z], [b.x + sd * es * 0.3, b.y + es, b.z - es * 0.15], es * 0.35, es * 0.04, { op: 'smooth', k: es * 0.2 });
    else if (H.ears === 'side' || H.ears === 'floppy') sdf.ellipsoid([b.x + sd * es * 0.9, b.y - es * 0.3, b.z], [es * 0.7, es * 0.25, es * 0.4], { op: 'smooth', k: es * 0.15, rot: [0, 0, sd * -0.3] });
    else if (H.ears === 'round') sdf.ellipsoid([b.x, b.y + es * 0.2, b.z], [es * 0.55, es * 0.55, es * 0.18], { op: 'smooth', k: es * 0.2 });
    else if (H.ears === 'long') sdf.ellipsoid([b.x + sd * es * 0.12, b.y + es * 0.5, b.z - es * 0.1], [es * 0.14, es * 0.55, es * 0.08], { op: 'smooth', k: es * 0.08 });
    else if (H.ears === 'elephant') sdf.ellipsoid([sd * hr * 0.9, -hr * 0.1, -hr * 0.5], [es * 0.12, es * 0.95, es * 0.8], { op: 'smooth', k: es * 0.1, rot: [0, sd * 0.5, 0] });
    const hornKind = horn || H.horn;
    if (hornKind === 'bull') sdf.roundCone([sd * hr * 0.6, hr * 0.7, 0], [sd * hr * 1.7, hr * 1.4, hr * 0.2], hr * 0.14, hr * 0.02, { mat: 'horn', priority: 2, op: 'smooth', k: hr * 0.05 });
    if (hornKind === 'goat') sdf.roundCone([sd * hr * 0.35, hr * 0.85, -hr * 0.1], [sd * hr * 0.7, hr * 1.6, -hr * 0.9], hr * 0.15, hr * 0.03, { mat: 'horn', priority: 2 });
    if (hornKind === 'dragon') sdf.roundCone([sd * hr * 0.5, hr * 0.7, -hr * 0.3], [sd * hr * 0.9, hr * 1.3, -hr * 1.6], hr * 0.14, hr * 0.02, { mat: 'horn', priority: 2 });
  }
  if (H.trunk) { const pts = []; let p = new THREE.Vector3(0, -hr * 0.1, hr * 0.8); for (let i = 0; i <= 4; i++) { pts.push([p.x, p.y, p.z, hr * (0.38 - i * 0.07)]); p = p.clone().add(new THREE.Vector3(0, -H.trunk / 4, H.trunk * 0.06)); } sdf.chain(pts, { mat: coat, op: 'smooth', k: hr * 0.2 }); }
  if (kind === 'lion') sdf.ellipsoid([0, 0, -hr * 0.5], [hr * 1.6, hr * 1.7, hr * 1.2], { mat: 'mane', op: 'smooth', k: hr * 0.3, disp: { amp: hr * 0.12, freq: 6 / hr, oct: 2 } });
  // A neck that plunges into a humanoid torso (the human head mesh, which
  // normally carries the neck, is hidden).
  if (opts.neck) sdf.roundCone([0, -hr * 0.3, -hr * 0.25], [0, -hr * 2.3, -hr * 0.45], hr * 0.52, hr * 0.68, { op: 'smooth', k: hr * 0.3, tag: 'neck' });
  if (opts.mane) sdf.roundCone([0, hr * 0.6, -hr * 0.3], [0, -hr * 1.8, -hr * 0.85], hr * 0.28, hr * 0.2, { mat: 'mane', op: 'smooth', k: hr * 0.2, disp: { amp: hr * 0.08, freq: 8 / hr, oct: 2 } });
  sdf.endGroup();
  const voxel = hr * 0.06;
  const { geometry } = yield* sdfToGeometry(sdf, ctx, { voxel, matOrder: ['fur', 'scales', 'nose', 'horn', 'mane'], aoMin: 0.4 });
  const M = G.materials;
  const mats = [M.get(coat === 'scales' ? 'scales' : 'fur', { color: col, vertexColors: true, world: 0.1 }), M.get('scales', { color: col, vertexColors: true, world: 0.08 }), M.plain('#1a1414', 0.3, 0), M.get('plaster', { color: '#d8ccb0' }), M.get('hair', { color: new THREE.Color(col).multiplyScalar(0.6).getStyle() })];
  const mesh = new THREE.Mesh(geometry, mats);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.15, 12, 8), new THREE.MeshPhysicalMaterial({ color: kind === 'wolf' || kind === 'jackal' ? '#e0b030' : '#2a1a0a', roughness: 0.1, clearcoat: 1 })); e.position.set(sd * hr * 0.5, hr * 0.28, hr * 0.78); g.add(e); }
  g.scale.setScalar(size / (hr * 1.8));
  void rng; void S;
  return g;
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
    if (tag === 'h_skin') { c.set(t.skinTone || '#e0b890'); return [c.r, c.g, c.b]; }
    if (tag === 'h_hair') { c.set(t.hairColor || '#3a2a1a'); return [c.r, c.g, c.b]; }
    if (prim.mat === 'mane') {
      if (t.maneColor === 'rainbow') { c.setHSL(((y + z) / S * 0.6) % 1, 0.8, 0.6); return [c.r, c.g, c.b]; }
      return [maneCol.r, maneCol.g, maneCol.b];
    }
    if (prim.mat === 'shell' && t.ladybug) { const sp = noise.n3(x * 14 / S, y * 14 / S, z * 14 / S) > 0.45; return sp ? [0.05, 0.05, 0.05] : [1, 1, 1]; }
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
      case 'okapi': { if ((tag === 'leg' || tag === 'foot') && y < S * 0.75 && Math.sin(y / S * 40) > 0) c.copy(white); if (tag === 'muzzle') c.copy(new THREE.Color('#d8c8b0')); break; }
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
    // Extra heads sway independently (hydra, cerberus).
    const hs = this.lay.heads || [];
    for (let i = 1; i < hs.length; i++) {
      q(B[hs[i].neck], -this.lookPitch * 0.3 + Math.sin(this.time * 0.9 + i * 1.7) * 0.12 + grazeDown * 0.5, this.lookYaw * 0.3 + Math.sin(this.time * 0.6 + i) * 0.22, Math.sin(this.time * 0.7 + i) * 0.1);
      q(B[hs[i].head], Math.sin(this.time * 1.3 + i) * 0.1, Math.sin(this.time * 0.8 + i * 2) * 0.2, 0);
    }
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
      shell: M.get('scales', { color: t.shellColor || '#5a4a2a', p: [8, 0.5], vertexColors: !!t.ladybug }), wing: t.insect ? M.get('glass', { color: '#e8f4ff', opacity: 0.35 }) : M.get('leather', { color: new THREE.Color(t.base).multiplyScalar(0.7).getStyle() }),
    };
    if (t.glow) mats.gold = M.get('emissive', { color: '#ffe8a0', emissiveIntensity: 2 });
    const skinned = new THREE.SkinnedMesh(geometry, matOrder.map((k) => mats[k]));
    skinned.bind(skeleton, new THREE.Matrix4());
    skinned.castShadow = true; skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    holder.add(skinned);
    // Eyes (glossy spheres on every head bone).
    const hr = t.S * t.head.r;
    const eyeCol = t.eyeColor || (t.coat === 'scales' ? '#d8a020' : '#2a1a0a');
    const eyeMat = t.glowEyes ? M.get('emissive', { color: eyeCol, emissiveIntensity: 2.5 }) : M.get('eye', {});
    const eyes = [];
    const nEyes = t.head.eyes || 2;
    for (const hh of lay.heads) {
    const headBone = bones[lay.names.indexOf(hh.head)];
    for (let i = 0; i < nEyes; i++) {
      const s = nEyes === 1 ? 0 : (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2) * 0.4);
      const er = hr * (t.head.bigEyes ? 0.32 : t.young ? 0.2 : 0.16);
      const eg = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(er, 16, 12), t.glowEyes ? eyeMat : new THREE.MeshPhysicalMaterial({ color: eyeCol, roughness: 0.1, clearcoat: 1 }));
      eg.add(ball);
      if (!t.glowEyes) { const hl = new THREE.Mesh(new THREE.SphereGeometry(er * 0.25, 8, 6), M.plain('#ffffff', 0.1)); hl.position.set(er * 0.35, er * 0.4, er * 0.8); eg.add(hl); }
      const side = nEyes === 1 ? 0 : s;
      eg.position.set(side * hr * 0.55, hr * (0.25 + Math.floor(i / 2) * 0.25), hr * (t.head.flatHead ? 0.4 : 0.75));
      if (hh.yaw) eg.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), hh.yaw);
      headBone.add(eg);
      eyes.push(eg);
    }
    }
    root.add(holder);
    // Statues: one material, a plinth, no brain.
    if (t.statue) {
      const sm = M.get(t.statue, {});
      skinned.material = matOrder.map(() => sm);
      for (const e of eyes) e.traverse((o) => { if (o.isMesh) o.material = sm; });
      anim.update(0.016, { speed: 0 });
      const ph = t.S * 0.25;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(t.S * t.len * 1.25 + 0.3, ph, t.S * t.girth * 3 + 0.4), M.get('granite'));
      plinth.position.y = ph / 2; plinth.castShadow = plinth.receiveShadow = true;
      root.add(plinth);
      holder.position.y = ph;
      const d0 = { root, name: `${t.name} statue`, category: 'statue', icon: '🗿', height: t.S * 1.5 + ph, footprint: { radius: Math.max(0.4, t.S * t.len * 0.6) },
        colliderDefs: [{ type: 'box', x: 0, z: 0, y0: 0, y1: ph + t.S, hx: (t.S * t.len * 1.25 + 0.3) / 2, hz: (t.S * t.girth * 3 + 0.4) / 2 }], dispose: () => skeleton.dispose() };
      return d0;
    }
    if (t.ghost) { const gm = M.get('glass', { color: '#d8e8ff', opacity: 0.35 }); skinned.material = matOrder.map(() => gm); }
    const anim = new CreatureAnimator(t, lay, bones, eyes);
    const breath = (t.fireBreath || t.species === 'dragon') ? makeBreath(t, lay, bones, t.fireBreath === 'ice' ? 'ice' : 'fire') : null;
    // Personality & brain.
    const flying = !!t.wings && (t.species === 'dragon' || t.species === 'griffin');
    const petName = item.attrs.name || rng.pick(NAMES.animal);
    const data = {
      root, name: item.attrs.name ? `${petName} the ${t.name.toLowerCase()}` : t.name, category: 'animal', icon: item.icon,
      height: t.S * (t.biped ? 1.5 : 1.3) + t.S * t.neck[0] * 0.8, footprint: { radius: Math.max(0.3, t.S * t.len * 0.5) },
    };
    const creature = {
      update: (dt, st) => {
        const near = G.player && st.root ? st.root.position.distanceTo(G.player.position) : 999;
        anim.update(dt, { ...st, nearPlayer: near < 4 });
        if (breath) breath.update(dt, near, data);
      },
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
    data.interact = { label: () => (breath ? `Ask ${data.subtitle && item.attrs.name ? petName : 'it'} to breathe ${breath.kind}` : `Pet ${data.subtitle && item.attrs.name ? petName : data.name.toLowerCase()}`), action: () => { data.say(data.personality.animalLine(), 2.5); data.brain.talkWith(5); creature.happy(); creature.vocalize(); if (breath) breath.fire(data); } };
    if (t.glow) data.lights = [{ pos: [0, t.S * 1.5, 0], color: '#ffe8f0', intensity: 2, distance: 8, nightOnly: false }];
    // Big creatures are solid obstacles.
    if (t.S > 1.2) data.colliderDefs = [];
    void flying;
    return data;
  },
};

// Fire (or frost) breath: additive puffs streaming from every mouth.
function makeBreath(t, lay, bones, kind) {
  const heads = lay.heads.map((h) => ({ bone: bones[lay.names.indexOf(h.head)], yaw: h.yaw || 0 }));
  const hr = t.S * t.head.r, reach = t.S * 2.8;
  const cols = kind === 'ice' ? ['#e0f8ff', '#80d8ff', '#40a0ff'] : ['#fff0a0', '#ff9020', '#ff3010'];
  const sets = heads.map((h) => {
    const g = new THREE.Group();
    const fwd = new THREE.Vector3(0, -0.15, 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw);
    g.position.copy(fwd).multiplyScalar(hr * 0.6 + t.S * t.head.snout);
    h.bone.add(g);
    const puffs = [];
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: cols[i % 3], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.userData.noRaycast = true;
      g.add(sp);
      puffs.push({ sp, ph: i / 22, jit: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5) });
    }
    return { g, fwd, puffs };
  });
  let active = 0, cool = 6 + Math.random() * 6, time = 0;
  const api = {
    kind,
    fire(data) { if (active > 0) return; active = 2.2; cool = 9 + Math.random() * 8; if (G.audio && data) { G.audio.play('roar', data.root.position, { pitch: t.pitch }); G.audio.play('whoosh', data.root.position); } },
    update(dt, near, data) {
      time += dt;
      cool -= dt;
      if (active <= 0 && cool < 0 && near < 45 && Math.random() < dt * 0.25) api.fire(data);
      active = Math.max(0, active - dt);
      const on = Math.min(1, active * 2);
      for (const S of sets) for (const p of S.puffs) {
        const f = (time * 1.6 + p.ph) % 1;
        const d = f * reach;
        p.sp.position.copy(S.fwd).multiplyScalar(d).addScaledVector(p.jit, d * 0.35);
        p.sp.scale.setScalar(hr * (0.6 + f * 4));
        p.sp.material.opacity = on * (1 - f) * 0.85;
      }
    },
  };
  return api;
}

function soundFor(t) {
  return { bark: 'bark', howl: 'bark', meow: 'meow', moo: 'moo', roar: 'roar', neigh: 'moo', baa: 'meow', oink: 'moo', trumpet: 'roar', screech: 'chirp' }[t.sound] || 'chirp';
}
