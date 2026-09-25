// Converts parsed prompt attributes into a complete humanoid spec. Anything
// the prompt leaves open is sampled from plausible, diverse distributions
// (height by sex/age, body type, skin tone, hairstyle, facial hair, outfit
// colours), so "a man" is different every time while "a 1.70 m tall
// slightly overweight man with short black hair wearing a blue shirt" is
// honoured exactly.

import { NAMES } from '../gen/lexicon.js';
import { animalHeadColor, ANIMAL_HEADS } from '../gen/generators/creatures.js';

export const PLAYER_SPEC = {
  sex: 'male', age: 28, height: 2.0, fat: 0.24, muscle: 0.5, skinTone: 0.3, undertone: 0.25,
  hair: { style: 'curly', color: 'dark brown' }, facialHair: 'none', eyeColor: 'brown',
  outfit: { top: { type: 'tshirt', color: '#38465a' }, bottom: { type: 'jeans', color: '#2b3e66' }, shoes: { type: 'sneakers', color: '#f0efec' } },
  face: { jawW: 1.06, chin: 0.2, brow: 1.1, noseLen: 1.02, lips: 1.0, eyeSize: 1.0 },
  name: 'You',
};

const TOP_COLORS = ['#f2f2f0', '#141414', '#7a7a7a', '#1d2b4a', '#8a1e24', '#2c4a2a', '#c89a2a', '#6aa8d8', '#5a1a2a', '#556b2f', '#d8c8a8', '#e8a0b0', '#1e7a7a', '#3a3a6a', '#b85a2a', '#4a4a4a'];
const BOTTOM_COLORS = ['#2b3e66', '#1a1d24', '#4a4d52', '#b8a878', '#1d2b4a', '#4a3a2a', '#2a3a2a'];
const SHOE_COLORS = ['#f0efec', '#141414', '#4a2e1c', '#6a6a6a', '#1d2b4a', '#8a1e24'];

function heightFor(rng, sex, age) {
  // Adult means ~1.77 m (male) / 1.64 m (female); children follow a growth curve.
  const adult = sex === 'female' ? rng.gauss(1.645, 0.065, 1.48, 1.85) : sex === 'male' ? rng.gauss(1.775, 0.075, 1.58, 2.0) : rng.gauss(1.71, 0.09, 1.5, 1.95);
  if (age >= 18) return adult * (age > 70 ? 0.975 : 1);
  const growth = [0.3, 0.44, 0.5, 0.55, 0.59, 0.63, 0.66, 0.7, 0.73, 0.76, 0.79, 0.82, 0.85, 0.89, 0.93, 0.96, 0.98, 0.99, 1];
  const k = growth[Math.max(0, Math.min(18, Math.round(age)))];
  return adult * k;
}

const PROFESSIONS = {
  doctor: (r) => ({ top: { type: 'labcoat', color: '#f6f6f4' }, bottom: { type: 'trousers', color: r.pick(['#3a3d44', '#1d2b4a']) }, shoes: { type: 'dress', color: '#141414' }, glasses: r.chance(0.4) }),
  nurse: (r) => { const c = r.pick(['#3a9a9a', '#5a8ad0', '#6a4a9a']); return { top: { type: 'shirt', color: c }, bottom: { type: 'trousers', color: c }, shoes: { type: 'sneakers', color: '#f0f0f0' } }; },
  scientist: (r) => ({ top: { type: 'labcoat', color: '#f6f6f4' }, bottom: { type: 'chinos', color: '#6a6a6a' }, shoes: { type: 'dress', color: '#2a1a10' }, glasses: r.chance(0.7) }),
  chef: () => ({ top: { type: 'shirt', color: '#f8f8f6' }, bottom: { type: 'trousers', color: '#1a1a1a', pattern: 'plaid' }, shoes: { type: 'dress', color: '#141414' }, hat: 'chef' }),
  police: () => ({ top: { type: 'shirt', color: '#1f2c48' }, bottom: { type: 'trousers', color: '#1a2238' }, shoes: { type: 'boots', color: '#101010' }, hat: 'police', beltColor: '#101010' }),
  firefighter: () => ({ top: { type: 'coat', color: '#c4a454' }, bottom: { type: 'trousers', color: '#b89a4a' }, shoes: { type: 'boots', color: '#141414' }, hat: 'hardhat', hatColor: '#c42020' }),
  soldier: () => ({ top: { type: 'jacket', color: '#4a5a32' }, bottom: { type: 'trousers', color: '#4a5230' }, shoes: { type: 'boots', color: '#2a2218' }, hat: 'helmet' }),
  knight: () => ({ top: { type: 'armor', color: '#b8bcc4' }, bottom: { type: 'trousers', color: '#5a5d64' }, shoes: { type: 'boots', color: '#3a3d44' }, hat: 'helmet', gloves: true, gloveColor: '#5a5d64' }),
  wizard: (r) => ({ top: { type: 'robe', color: r.pick(['#2a2a7a', '#4a1a6a', '#5a5a64', '#1a3a5a']) }, bottom: { type: 'trousers', color: '#2a2a3a' }, shoes: { type: 'boots', color: '#2a1a10' }, hat: 'wizard' }),
  witch: () => ({ top: { type: 'robe', color: '#1a1420' }, bottom: { type: 'skirt', color: '#1a1420', length: 'long' }, shoes: { type: 'boots', color: '#141014' }, hat: 'witch' }),
  astronaut: () => ({ top: { type: 'coat', color: '#eceeef' }, bottom: { type: 'sweatpants', color: '#e6e8ea' }, shoes: { type: 'boots', color: '#e0e2e4' }, hat: 'helmet', gloves: true, gloveColor: '#dadcde' }),
  business: (r) => ({ top: { type: 'suit', color: r.pick(['#1a1d24', '#2a2f3a', '#3a3d44', '#1d2b4a']) }, bottom: { type: 'trousers', color: '#1a1d24' }, shoes: { type: 'dress', color: '#101010' }, tie: true, tieColor: r.pick(['#7a1a22', '#1a3a6a', '#2a2a2a', '#5a4a1a']) }),
  farmer: (r) => ({ top: { type: 'shirt', color: '#8a1c1c', pattern: 'plaid' }, bottom: { type: 'jeans', color: '#2b3e66' }, shoes: { type: 'boots', color: '#4a2e1c' }, hat: r.chance(0.6) ? 'cowboy' : null, hatColor: '#c8a860' }),
  cowboy: () => ({ top: { type: 'shirt', color: '#6a3a1a', pattern: 'plaid' }, bottom: { type: 'jeans', color: '#2b3e66' }, shoes: { type: 'boots', color: '#5a3218' }, hat: 'cowboy' }),
  pirate: () => ({ top: { type: 'shirt', color: '#ece6d6' }, bottom: { type: 'trousers', color: '#2a1a10' }, shoes: { type: 'boots', color: '#1a1008' }, hat: 'tophat', hatColor: '#141010' }),
  ninja: () => ({ top: { type: 'hoodie', color: '#121214' }, bottom: { type: 'trousers', color: '#121214' }, shoes: { type: 'boots', color: '#0e0e10' }, gloves: true, gloveColor: '#121214' }),
  king: () => ({ top: { type: 'robe', color: '#7a1020' }, bottom: { type: 'trousers', color: '#2a1a3a' }, shoes: { type: 'boots', color: '#2a1a10' }, hat: 'crown' }),
  queen: () => ({ top: { type: 'dress', color: '#5a1a6a', length: 'long' }, shoes: { type: 'heels', color: '#1a1a1a' }, hat: 'crown' }),
  athlete: (r) => ({ top: { type: r.pick(['tank', 'tshirt']), color: r.pick(['#c62828', '#1e5bc6', '#f2f2f0', '#1a1a1a']) }, bottom: { type: 'shorts', color: '#1a1a1a' }, shoes: { type: 'sneakers', color: r.pick(['#f0f0f0', '#ff5a20', '#20a0ff']) } }),
  construction: () => ({ top: { type: 'tshirt', color: '#f07a10' }, bottom: { type: 'jeans', color: '#2b3e66' }, shoes: { type: 'boots', color: '#6a4a24' }, hat: 'hardhat' }),
  student: (r) => ({ top: { type: r.pick(['hoodie', 'tshirt', 'sweater']), color: r.pick(TOP_COLORS) }, bottom: { type: 'jeans', color: '#2b3e66' }, shoes: { type: 'sneakers', color: r.pick(SHOE_COLORS) }, glasses: r.chance(0.3) }),
  teacher: (r) => ({ top: { type: r.pick(['sweater', 'shirt']), color: r.pick(['#5a3a2a', '#2a4a3a', '#d8c8a8', '#6a2a2a']) }, bottom: { type: 'chinos', color: '#6a5a4a' }, shoes: { type: 'dress', color: '#3a2418' }, glasses: r.chance(0.6) }),
  artist: (r) => ({ top: { type: r.pick(['shirt', 'tshirt', 'sweater']), color: r.pick(['#e05a2a', '#2a8a8a', '#8a2a8a', '#e0c020']), pattern: r.chance(0.3) ? 'stripes' : null, color2: '#1a1a1a' }, bottom: { type: 'jeans', color: '#1a1d24' }, shoes: { type: 'boots', color: '#1a1a1a' }, hat: r.chance(0.3) ? 'beanie' : null }),
  clown: () => ({ top: { type: 'shirt', color: '#e02020', pattern: 'stripes', color2: '#f0e020' }, bottom: { type: 'trousers', color: '#2050e0' }, shoes: { type: 'sneakers', color: '#e02020' }, hat: 'tophat', hatColor: '#20a020' }),
  monk: (r) => ({ top: { type: 'robe', color: r.pick(['#c86a10', '#6a4a2a', '#8a2a10']) }, bottom: { type: 'trousers', color: '#6a4a2a' }, shoes: { type: 'sandals', color: '#6a4a2a' } }),
  punk: () => ({ top: { type: 'jacket', color: '#141414', fabric: 'leather' }, bottom: { type: 'jeans', color: '#1a1a1e' }, shoes: { type: 'boots', color: '#101010' } }),
  tourist: (r) => ({ top: { type: 'shirt', color: r.pick(['#3aa0d8', '#e07a3a', '#5ab85a']), pattern: 'stripes', color2: '#f2f2f0' }, bottom: { type: 'shorts', color: '#b8a878' }, shoes: { type: 'sneakers', color: '#f0f0f0' }, hat: 'cap', sunglasses: true }),
  elf: () => ({ top: { type: 'shirt', color: '#2a5a2a' }, bottom: { type: 'trousers', color: '#4a3a24' }, shoes: { type: 'boots', color: '#3a2a18' } }),
  dwarf: () => ({ top: { type: 'armor', color: '#8a8070' }, bottom: { type: 'trousers', color: '#4a3a24' }, shoes: { type: 'boots', color: '#2a1a10' }, hat: 'helmet' }),
  orc: () => ({ top: { type: 'tank', color: '#4a3a24' }, bottom: { type: 'trousers', color: '#3a2a18' }, shoes: { type: 'boots', color: '#2a1a10' } }),
  zombie: (r) => ({ top: { type: 'tshirt', color: r.pick(['#6a6a60', '#5a4a3a', '#4a5a4a']) }, bottom: { type: 'jeans', color: '#3a4054' }, shoes: { type: 'sneakers', color: '#5a5a50' } }),
  vampire: () => ({ top: { type: 'suit', color: '#101012' }, bottom: { type: 'trousers', color: '#101012' }, shoes: { type: 'dress', color: '#080808' }, tie: true, tieColor: '#7a0a14' }),
  alien: () => ({ top: { type: 'tshirt', color: '#8a9aa8', sleeves: 'long' }, bottom: { type: 'leggings', color: '#8a9aa8' }, shoes: { type: 'barefoot' } }),
  giant: (r) => ({ top: { type: 'tank', color: r.pick(['#5a4a3a', '#6a5a4a']) }, bottom: { type: 'trousers', color: '#3a2a1a' }, shoes: { type: 'barefoot' } }),
  fairy: (r) => ({ top: { type: 'dress', color: r.pick(['#e0a0e0', '#a0e0c0', '#a0c8f0']) }, shoes: { type: 'barefoot' }, glowColor: '#f0c0ff' }),
  yeti: () => ({ top: { type: 'none' }, bottom: { type: 'none' }, shoes: { type: 'barefoot' } }),
  minotaur: () => ({ top: { type: 'none' }, bottom: { type: 'shorts', color: '#4a2e1c', fabric: 'leather' }, shoes: { type: 'barefoot' }, beltColor: '#2a1a10' }),
  werewolf: (r) => ({ top: { type: 'none' }, bottom: { type: 'shorts', color: r.pick(['#2b3e66', '#3a3a40', '#4a3a2a']), fabric: 'denim' }, shoes: { type: 'barefoot' } }),
  anubis: () => ({ top: { type: 'none' }, bottom: { type: 'skirt', color: '#f0ead8', length: 'mini' }, shoes: { type: 'sandals', color: '#c8a040' }, hat: 'crown', beltColor: '#d0a030' }),
  beastfolk: (r) => ({ top: { type: r.pick(['tank', 'none', 'shirt']), color: r.pick(['#5a4a3a', '#3a4a2a', '#6a2a1a', '#2a2a3a']) }, bottom: { type: 'trousers', color: r.pick(['#3a2a1a', '#2a2a2a', '#4a3a2a']) }, shoes: { type: 'barefoot' } }),
  mermaid: () => ({ shoes: { type: 'barefoot' } }),
  angel: (r) => ({ top: { type: 'robe', color: r.pick(['#f6f4ee', '#f0ead8', '#eef2f8']) }, shoes: { type: 'sandals', color: '#c8a860' }, glowColor: '#ffe8a0' }),
  demon: () => ({ top: { type: 'none' }, bottom: { type: 'trousers', color: '#141010' }, shoes: { type: 'barefoot' } }),
  santa: () => ({ top: { type: 'coat', color: '#c81a1a' }, bottom: { type: 'trousers', color: '#c81a1a' }, shoes: { type: 'boots', color: '#141414' }, hat: 'beanie', hatColor: '#c81a1a', beltColor: '#141414', gloves: true, gloveColor: '#141414' }),
  leprechaun: () => ({ top: { type: 'suit', color: '#1a7a2a' }, bottom: { type: 'trousers', color: '#1a6a22' }, shoes: { type: 'dress', color: '#141414' }, hat: 'tophat', hatColor: '#1a7a2a', beltColor: '#141414' }),
  genie: () => ({ top: { type: 'jacket', color: '#8a1a6a' }, shoes: { type: 'barefoot' }, hat: null }),
  reaper: () => ({ top: { type: 'robe', color: '#0e0c10' }, shoes: { type: 'barefoot' } }),
  superhero: (r) => { const c = r.pick(['#1a3ad8', '#c81a1a', '#1a1a1e', '#2a8a3a']); return { top: { type: 'tshirt', color: c, sleeves: 'long' }, bottom: { type: 'leggings', color: r.pick(['#c81a1a', '#1a3ad8', '#1a1a1e']) }, shoes: { type: 'boots', color: '#c81a1a' }, gloves: true, gloveColor: c, beltColor: '#f0c020' }; },
  harpy: () => ({ top: { type: 'tank', color: '#5a4030' }, bottom: { type: 'shorts', color: '#4a3020' }, shoes: { type: 'barefoot' } }),
  golem: () => ({ top: { type: 'none' }, bottom: { type: 'none' }, shoes: { type: 'barefoot' } }),
};

export function buildHumanSpec(item, rng) {
  const a = item.attrs || {};
  const p = item.params || {};
  const spec = {};
  // Sex.
  spec.sex = p.sex || a.sex || (rng.chance(0.5) ? 'male' : 'female');
  // Age.
  spec.age = a.age ?? p.age ?? (rng.chance(0.12) ? rng.int(60, 82) : rng.int(19, 55));
  if (a.flags && a.flags.young && !a.age && !p.age) spec.age = rng.int(18, 26);
  // Height.
  const body = a.body || {};
  let height = a.dims && a.dims.height ? a.dims.height : p.height ? p.height * rng.range(0.95, 1.05) : heightFor(rng, spec.sex, spec.age);
  if (!(a.dims && a.dims.height) && body.heightMul) height *= body.heightMul;
  if (a.sizeMul && a.sizeMul !== 1 && !(a.dims && a.dims.height)) height *= a.sizeMul;
  spec.height = Math.max(0.3, Math.min(30, height));
  // Body.
  spec.fat = body.fat ?? p.fat ?? Math.max(0.05, Math.min(0.85, rng.gauss(spec.age > 45 ? 0.38 : 0.26, 0.13)));
  spec.muscle = body.muscle ?? p.muscle ?? Math.max(0.1, Math.min(0.9, rng.gauss(spec.sex === 'male' ? 0.45 : 0.3, 0.15)));
  if (spec.age < 14) { spec.muscle *= 0.4; spec.fat = Math.min(spec.fat, 0.4); }
  // Skin.
  if (a.skinColor) spec.skinColor = a.skinColor;
  else if (p.skinColor) spec.skinColor = p.skinColor;
  else if (a.ethnicity && a.ethnicity.skin) spec.skinTone = rng.range(a.ethnicity.skin[0], a.ethnicity.skin[1]);
  else spec.skinTone = Math.pow(rng.next(), 1.15);
  if (a.ethnicity && a.ethnicity.eth) spec.ethnicity = a.ethnicity.eth;
  spec.undertone = rng.range(-0.6, 0.8);
  // Hair.
  const hair = { ...(a.hair || {}) };
  const elderly = spec.age > 62;
  if (!hair.style) {
    if (p.hair && p.hair.style) hair.style = p.hair.style;
    else if (spec.sex === 'male') hair.style = rng.weighted([['short', 4], ['curly', 1.5], ['buzz', 1.5], ['slicked', 0.8], ['spiky', 0.5], ['receding', elderly ? 3 : 0.4], ['bald', elderly ? 1.5 : 0.35], ['long', 0.4], ['wavy', 0.3], ['afro', spec.skinTone > 0.65 ? 1 : 0.1], ['ponytail', 0.2]]);
    else hair.style = rng.weighted([['long', 3.5], ['wavy', 2], ['ponytail', 1.5], ['bob', 1.5], ['bun', 1.2], ['curly', 1], ['short', 0.6], ['afro', spec.skinTone > 0.65 ? 1.2 : 0.1]]);
  }
  if (!hair.color) {
    if (elderly) hair.color = rng.pick(['gray', 'silver', 'white', 'gray']);
    else if ((spec.skinTone ?? 0.5) > 0.45 || spec.ethnicity === 'east asian') hair.color = rng.pick(['black', 'jet black', 'dark brown', 'black']);
    else hair.color = rng.weighted([['dark brown', 3], ['brown', 3], ['light brown', 2], ['black', 1.5], ['blonde', 2], ['dirty blonde', 1], ['auburn', 0.6], ['ginger', 0.5], ['platinum', 0.2]]);
  }
  spec.hair = hair;
  // Facial hair.
  if (a.facialHair) spec.facialHair = a.facialHair;
  else if (p.facialHair) spec.facialHair = p.facialHair;
  else if (spec.sex === 'male' && spec.age >= 18) spec.facialHair = rng.weighted([['none', 5], ['stubble', 2.5], ['shortbeard', 1.2], ['beard', 1], ['mustache', 0.4], ['goatee', 0.4], ['full', elderly ? 0.8 : 0.2]]);
  else spec.facialHair = 'none';
  if (p.profession === 'wizard' && spec.sex === 'male') { spec.facialHair = 'full'; spec.age = Math.max(spec.age, 70); spec.hair.color = a.hair && a.hair.color ? a.hair.color : 'white'; if (!a.hair || !a.hair.style) spec.hair.style = 'long'; }
  spec.eyeColor = a.eyeColor || rng.weighted([['brown', 5], ['dark brown', 3], ['hazel', 1.5], ['green', 1], ['blue', (spec.skinTone ?? 0.5) < 0.3 ? 2.5 : 0.3], ['gray', 0.5]]);
  // Outfit: profession preset, then prompt clothing overrides, then random casual fill.
  const prof = p.profession && PROFESSIONS[p.profession] ? PROFESSIONS[p.profession](rng) : {};
  const outfit = { ...prof };
  for (const c of a.clothing || []) {
    if (c.slot === 'top' || c.slot === 'bottom' || c.slot === 'shoes') {
      outfit[c.slot] = { type: c.type, color: c.color || (outfit[c.slot] && outfit[c.slot].color), pattern: c.pattern || (a.flags && a.flags.plaid ? 'plaid' : a.flags && a.flags.stripes ? 'stripes' : null), fabric: c.fabric, length: c.length };
      if (c.type === 'dress' || c.type === 'robe') delete outfit.bottom;
    } else if (c.slot === 'hat') { outfit.hat = c.type; if (c.color) outfit.hatColor = c.color; }
    else if (c.type === 'glasses') outfit.glasses = true;
    else if (c.type === 'sunglasses') outfit.sunglasses = true;
    else if (c.type === 'tie') { outfit.tie = true; if (c.color) outfit.tieColor = c.color; }
    else if (c.type === 'gloves') { outfit.gloves = true; if (c.color) outfit.gloveColor = c.color; }
  }
  // Unbound colour ("a man in red") -> top colour.
  if (a.primaryColor && a.primaryColor !== 'rainbow' && !(a.clothing || []).some((c) => c.color)) {
    outfit.top = { ...(outfit.top || { type: 'tshirt' }), color: a.primaryColor };
  }
  if (!outfit.top) {
    const t = spec.sex === 'female' ? rng.weighted([['tshirt', 3], ['shirt', 2], ['sweater', 1.5], ['dress', 2], ['hoodie', 1], ['jacket', 1], ['tank', 0.8]]) : rng.weighted([['tshirt', 4], ['shirt', 2], ['hoodie', 1.5], ['sweater', 1.2], ['polo', 1], ['jacket', 1]]);
    outfit.top = { type: t, color: rng.pick(TOP_COLORS), pattern: rng.chance(0.12) ? (rng.chance(0.5) ? 'stripes' : 'plaid') : null, color2: rng.pick(TOP_COLORS) };
    if (spec.age > 65 && t === 'hoodie') outfit.top.type = 'sweater';
  }
  if (outfit.top && !outfit.top.color) outfit.top.color = rng.pick(TOP_COLORS);
  if (!outfit.bottom && outfit.top.type !== 'dress' && outfit.top.type !== 'robe') {
    const b = spec.sex === 'female' ? rng.weighted([['jeans', 4], ['trousers', 2], ['skirt', 1.5], ['shorts', 0.8], ['leggings', 0.8]]) : rng.weighted([['jeans', 5], ['chinos', 2], ['trousers', 2], ['shorts', 0.8], ['sweatpants', 0.5]]);
    outfit.bottom = { type: b, color: b === 'jeans' ? rng.pick(['#2b3e66', '#1f2d4d', '#3a5580', '#1a1d24', '#5a6a80']) : rng.pick(BOTTOM_COLORS) };
  }
  if (outfit.bottom && !outfit.bottom.color) outfit.bottom.color = outfit.bottom.type === 'jeans' ? '#2b3e66' : rng.pick(BOTTOM_COLORS);
  if (!outfit.shoes) outfit.shoes = { type: outfit.top.type === 'suit' ? 'dress' : outfit.top.type === 'dress' && rng.chance(0.4) ? 'heels' : rng.weighted([['sneakers', 5], ['boots', 1.5], ['dress', 1]]), color: rng.pick(SHOE_COLORS) };
  if (!outfit.shoes.color) outfit.shoes.color = rng.pick(SHOE_COLORS);
  // Bare-chested presets (minotaur, demon, yeti...) get a top for women.
  if (outfit.top.type === 'none' && spec.sex === 'female' && !p.fairy) outfit.top = { type: 'crop', color: rng.pick(['#3a2a1a', '#141414', '#5a1a1a', '#2a3a2a']), sleeves: 'none' };
  if (outfit.top.type === 'dress' && !outfit.top.sleeves) outfit.top.sleeves = rng.pick(['none', 'short', 'none']);
  if (!outfit.glasses && !outfit.sunglasses && !prof.glasses && rng.chance(spec.age > 50 ? 0.35 : 0.1) && !p.profession) outfit.glasses = true;
  spec.outfit = outfit;
  spec.lipstick = spec.sex === 'female' && rng.chance(0.35);
  // Fantasy flags.
  for (const k of ['elf', 'orc', 'zombie', 'vampire', 'alienHumanoid', 'fairy', 'statue', 'stone', 'furry']) if (p[k]) spec[k] = p[k];
  if (p.dwarf) { spec.height = Math.min(spec.height, rng.range(1.2, 1.4)); spec.fat = Math.max(spec.fat, 0.45); spec.muscle = 0.75; spec.legScale = 0.9; spec.headScale = 1.1; }
  if (spec.alienHumanoid) { spec.headScale = 1.35; spec.face = { eyeSize: 1.55, noseW: 0.6, noseLen: 0.7, lips: 0.6, ears: 0.5 }; spec.eyeColor = '#080808'; spec.hair = { style: 'bald' }; }
  if (spec.fairy) { spec.hair.color = spec.hair.color || rng.pick(['platinum', 'pink', 'golden']); }
  if (spec.furry) { spec.hair = { style: 'afro', color: 'white' }; spec.facialHair = 'full'; }
  if (spec.zombie) spec.eyeColor = '#c0c0a0';
  if (spec.vampire) { spec.eyeColor = '#a01010'; spec.hair = { style: 'slicked', color: 'black' }; }
  applyHybridSpec(spec, a, p, rng);
  // Personality & name.
  spec.personality = (a.personality && a.personality.length ? a.personality : p.personality) || null;
  spec.name = a.name || rng.pick(spec.sex === 'female' ? NAMES.female : spec.sex === 'male' ? NAMES.male : NAMES.neutral);
  spec.profession = p.profession || null;
  if (a.materials && a.materials.length && (p.statue || spec.statue)) spec.statueMaterial = a.materials[0];
  return spec;
}

// Mythical extras from lexicon params ("minotaur", "angel") or from the
// prompt text ("a man with wings and a halo", "a bull-headed warrior",
// "a woman with a fish tail").
const HYBRID_KEYS = ['animalHead', 'animalHeadScale', 'animalHeadColor', 'animalMane', 'wings', 'wingColor', 'halo', 'horns', 'hornColor', 'tail', 'tailColor', 'mermaid', 'furSkin'];
function applyHybridSpec(spec, a, p, rng) {
  for (const k of HYBRID_KEYS) if (p[k] !== undefined) spec[k] = p[k];
  const txt = ' ' + (a.text || '').toLowerCase() + ' ';
  const has = (re) => re.test(txt);
  if (!spec.animalHead) {
    const m = txt.match(/\b([a-z]+)[\s-]headed\b/) || txt.match(/\bhead of an? ([a-z]+)\b/) || txt.match(/\b(?:with|has) (?:an? |the )?([a-z]+) head\b/);
    const k = m && (m[1] === 'dog' ? 'dog' : m[1] === 'crocodile' || m[1] === 'alligator' ? 'croc' : m[1] === 'snake' || m[1] === 'reptile' ? 'lizard' : m[1] === 'sheep' ? 'ram' : m[1] === 'hawk' || m[1] === 'falcon' || m[1] === 'bird' ? 'eagle' : m[1] === 'ape' || m[1] === 'gorilla' ? 'monkey' : m[1] === 'ox' ? 'bull' : m[1]);
    if (k && ANIMAL_HEADS.includes(k)) spec.animalHead = k;
  }
  if (!spec.wings && (a.flags && a.flags.wings || has(/\b(winged|wings)\b/))) spec.wings = has(/\b(bat|demon|devil|dragon|leathery)\b/) ? 'bat' : has(/\b(fairy|butterfly|insect|dragonfly|pixie)\b/) ? 'fairy' : 'feather';
  if (!spec.halo && has(/\bhalo\b/)) spec.halo = true;
  if (!spec.horns && has(/\b(horns|horned)\b/)) spec.horns = has(/\bram\b/) ? 'ram' : true;
  if (!spec.mermaid && has(/\b(fish|mermaid|scaly) tail\b/)) spec.mermaid = true;
  if (!spec.tail && !spec.mermaid && has(/\b(tail|tailed)\b/)) spec.tail = has(/\b(cat|feline)\b/) ? 'cat' : has(/\b(lizard|reptil\w*|dragon)\b/) ? 'lizard' : 'devil';
  if (spec.animalHead) {
    // Beast folk: fur (or scales) over the whole body in the head's colour.
    if (!a.skinColor && !p.skinColor) spec.skinColor = spec.animalHeadColor || animalHeadColor(spec.animalHead);
    if (spec.furSkin === undefined) spec.furSkin = !['lizard', 'croc', 'shark', 'dragon', 'eagle'].includes(spec.animalHead);
    spec.facialHair = 'none';
    spec.outfit.glasses = spec.outfit.sunglasses = false;
    if (spec.outfit.hat) delete spec.outfit.hat;
  }
  if (spec.mermaid) {
    if (!(a.clothing || []).some((c) => c.slot === 'top')) spec.outfit.top = spec.sex === 'female' ? { type: 'crop', color: spec.outfit.top && spec.outfit.top.color || rng.pick(['#e8d8c0', '#c83a6a', '#8a4ad0', '#2a8ac8']), sleeves: 'none' } : { type: 'none' };
    delete spec.outfit.bottom;
    spec.outfit.shoes = { type: 'barefoot' };
    if (!spec.tailColor) spec.tailColor = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rng.pick(['#1f8a7a', '#2a6ac8', '#6a3ab0', '#c83a5a', '#2a9a4a']);
    if (spec.sex === 'female' && !(a.hair && a.hair.style)) spec.hair.style = rng.pick(['long', 'wavy', 'long']);
  }
  if (spec.wings === 'bat' && spec.horns === undefined && p.profession === undefined && has(/\b(demon|devil)\b/)) spec.horns = true;
}

export function describeSpec(spec) {
  const parts = [];
  parts.push(spec.age < 13 ? 'child' : spec.age < 20 ? 'teen' : spec.age > 62 ? 'elderly' : 'adult');
  parts.push(spec.height.toFixed(2) + ' m');
  return parts.join(' · ');
}
