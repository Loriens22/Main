// ---------------------------------------------------------------------------
// Interpreting words the lexicon has never seen.
//
// Nothing is ever refused: an unknown noun is resolved, in order, by
//   1. compound splitting   "sandcastle" -> castle made of sand,
//                           "firetruck" -> truck, "catbot" -> robot cat,
//                           "dogzilla" -> giant dog, "horsecorn" -> horned horse
//   2. context cues         "a glorp that walks around" -> creature,
//                           "a zorblax you can turn on" -> machine
//   3. morphology           -saurus/-raptor -> dinosaur, -fish -> fish,
//                           -bot/-tron -> robot or machine, -house/-arium ->
//                           building, -mobile/-craft -> vehicle, -berry/-wort ->
//                           plant, -ist/-ian/-man -> person, -ite/-ium -> relic
//   4. a deterministic guess for pure invention ("a flibbertigibbet"):
//      mostly creatures (invented words usually name creatures), sometimes a
//      magical relic or a machine - always named after the word.
// Returns a concept-like object for the parser (with display name params).
// ---------------------------------------------------------------------------

import { hashString } from '../core/rng.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const C = {
  creature: (name, extra = {}) => ({ id: 'monster', gen: 'creature', cat: 'creature', icon: '👾', r: 1.2, p: { species: 'monster', displayName: name, ...extra } }),
  cute: (name) => ({ id: 'blob', gen: 'blob', cat: 'creature', icon: '🟢', r: 0.6, p: { kind: 'slime', displayName: name } }),
  machine: (name) => ({ id: 'machine', gen: 'gadget', cat: 'object', icon: '⚙️', r: 1, p: { arche: 'machine', displayName: name } }),
  relic: (name) => ({ id: 'relic', gen: 'gadget', cat: 'object', icon: '🔮', r: 1, p: { arche: 'relic', displayName: name } }),
  toy: (name) => ({ id: 'toy', gen: 'gadget', cat: 'object', icon: '🧸', r: 0.5, p: { arche: 'toy', displayName: name } }),
  tool: (name) => ({ id: 'tool', gen: 'gadget', cat: 'object', icon: '🔧', r: 0.5, p: { arche: 'tool', displayName: name } }),
  weapon: (name) => ({ id: 'weapon', gen: 'gadget', cat: 'object', icon: '⚔️', r: 0.5, p: { arche: 'weapon', displayName: name } }),
  container: (name) => ({ id: 'container', gen: 'gadget', cat: 'object', icon: '📦', r: 0.5, p: { arche: 'container', displayName: name } }),
  object: (name) => ({ id: 'object', gen: 'gadget', cat: 'object', icon: '📦', r: 0.6, p: { arche: 'object', displayName: name } }),
  person: (name, profession) => ({ id: 'person', gen: 'human', cat: 'character', icon: '🧍', r: 0.6, p: { profession, professionLabel: profession } }),
  dino: (name, h) => ({ id: 'dinosaur', gen: 'creature', cat: 'animal', icon: '🦖', r: 3, p: { species: ['trex', 'raptor', 'triceratops', 'stegosaurus', 'brachiosaurus', 'spinosaurus'][h % 6], displayName: name } }),
  fish: (name) => ({ id: 'fish', gen: 'fish', cat: 'animal', icon: '🐟', r: 0.5, p: { species: 'fish', displayName: name } }),
  bird: (name) => ({ id: 'bird', gen: 'bird', cat: 'animal', icon: '🐦', r: 0.5, p: { species: 'bird', displayName: name } }),
  bug: (name, h) => ({ id: 'bug', gen: 'creature', cat: 'animal', icon: '🐞', r: 0.3, p: { species: ['beetle', 'spider', 'ant', 'ladybug'][h % 4], displayName: name } }),
  robot: (name) => ({ id: 'robot', gen: 'robot', cat: 'robot', icon: '🤖', r: 0.8, p: { kind: 'humanoid', displayName: name } }),
  building: (name, h) => ({ id: 'building', gen: 'building', cat: 'building', icon: '🏠', r: 8, p: { style: ['shop', 'futuristic', 'modern', 'tower'][h % 4], displayName: name } }),
  vehicle: (name, kind) => ({ id: 'vehicle', gen: 'vehicle', cat: 'vehicle', icon: '🚗', r: 2.5, p: { kind, displayName: name } }),
  plant: (name, kind) => ({ id: 'plant', gen: 'nature', cat: 'nature', icon: '🌿', r: 1.5, p: { kind, species: kind === 'tree' ? 'oak' : undefined, displayName: name } }),
  shape: (name, kind) => ({ id: 'shape', gen: 'abstract', cat: 'shape', icon: '🔷', r: 1, p: { kind, displayName: name } }),
  place: (name, kind) => ({ id: 'scene', gen: 'scene', cat: 'scene', icon: '🏘️', r: 20, p: { kind, displayName: name } }),
  food: (name) => ({ id: 'food', gen: 'prop', cat: 'object', icon: '🍰', r: 0.3, p: { kind: 'food', displayName: name } }),
};

// Words that can modify a following noun inside a compound.
const THEMES = { fire: '#e8501a', ice: '#a8d8f0', snow: '#f4f6fa', sand: null, moon: '#c8c8d0', sun: '#ffc830', star: '#fff0a0', sea: '#2a6ab0', sky: '#8ac8f0', space: '#3a2a6a', shadow: '#1a1a24', gold: '#d4a017', silver: '#c0c0c8', rainbow: 'rainbow', crystal: '#b080ff', lava: '#ff4a1a', thunder: '#e8e050', storm: '#5a6a8a', ghost: '#e0e8ff', night: '#1a1a3a', blood: '#8a0a0a', mega: null, super: null, ultra: null, hyper: null, cyber: '#40e8ff', robo: null, mecha: null, dino: null, baby: null, giant: null, mini: null };

export function interpretUnknown(noun, ctx) {
  const { lookup, materials, colors, words, text } = ctx;
  const w = noun.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const name = cap(noun);
  const h = hashString(w) >>> 0;
  const out = (concept, reason, attrsPatch) => ({ concept, reason, attrsPatch: attrsPatch || null });

  // ---- 1. Compounds ----
  if (w.length >= 6) {
    const parts = w.includes('-') ? [w.split('-')] : [];
    for (let i = 3; i <= w.length - 3; i++) parts.push([w.slice(0, i), w.slice(i)]);
    for (const [left, right] of parts) {
      const R = lookup(right), L = lookup(left);
      // Suffix-style right parts on a known left concept.
      if (L && /^(zilla|saurus|zord)$/.test(right)) return out({ ...L, p: { ...L.p, displayName: name } }, 'compound-giant', { sizeMul: 8 });
      if (L && /^(bot|tron|droid|borg)$/.test(right)) return out(L.gen === 'creature' && L.p.species ? { id: 'robot dog', gen: 'robot', cat: 'robot', icon: '🤖', r: 1, p: { kind: ['dog', 'cat', 'horse', 'wolf'].includes(L.p.species) ? 'dog' : 'humanoid', displayName: name } } : C.robot(name), 'compound-robot');
      if (L && /^(corn|horn)$/.test(right) && L.gen === 'creature') return out({ ...L, p: { ...L.p, displayName: name } }, 'compound-horn', { textAppend: ' with a horn' });
      if (!R) continue;
      if (materials[left]) return out(R, 'compound-material', { material: materials[left] });
      if (colors[left]) return out(R, 'compound-color', { color: colors[left] });
      if (left in THEMES) return out({ ...R, p: { ...R.p, displayName: name } }, 'compound-theme', THEMES[left] ? { color: THEMES[left] } : null);
      if (L) {
        // Two creatures -> the right one with a hint of the left (colours, name).
        if (L.gen === 'creature' && R.gen === 'creature') return out({ ...R, p: { ...R.p, displayName: name } }, 'compound-hybrid');
        return out({ ...R, p: { ...R.p, displayName: name } }, 'compound');
      }
    }
    // Known word + unknown tail (e.g. "castleton" -> castle-ish place).
    for (let i = w.length - 3; i >= 4; i--) { const L = lookup(w.slice(0, i)); if (L && L.gen !== 'abstract') return out({ ...L, p: { ...L.p, displayName: name } }, 'prefix-match'); }
  }

  // ---- 2. Context cues in the rest of the sentence ----
  const t = ' ' + (text || '') + ' ';
  if (/\b(walks?|runs?|flies|fly|swims?|eats?|growls?|roars?|barks?|sleeps?|breathes?|friendly|cute|fluffy|furry|scaly|pet|tail|paws?|claws?|fangs?|creature|beast|critter|animal|monster|legs|wings)\b/.test(t)) return out(/\b(cute|fluffy|small|tiny|little|adorable)\b/.test(t) ? C.creature(name, { cute: true }) : C.creature(name), 'context-creature');
  if (/\b(turn(s|ed)? on|switch|button|buttons|power(ed)?|electric|battery|beeps?|machine|device|engine|gears|screen|computer|robot(ic)?)\b/.test(t)) return out(C.machine(name), 'context-machine');
  if (/\b(magic(al)?|ancient|enchanted|cursed|mystic(al)?|glowing|sacred|legendary|artifact|relic)\b/.test(t)) return out(C.relic(name), 'context-relic');
  if (/\b(live in|lives in|rooms?|floors?|doors?|windows|roof|visit|shop|store|building|house|hall)\b/.test(t)) return out(C.building(name, h), 'context-building');
  if (/\b(drive|ride|seats|wheels|engine|fast|fly it|pilot)\b/.test(t)) return out(C.vehicle(name, ['sports', 'suv', 'spaceship', 'ufo'][h % 4]), 'context-vehicle');
  if (/\b(eat|tasty|delicious|sweet|yummy|snack|dish|meal|cake|bake(d)?)\b/.test(t)) return out(C.food(name), 'context-food');
  if (/\b(grows?|leaves|petals|bloom(s|ing)?|flower|plant|tree|roots)\b/.test(t)) return out(C.plant(name, /tree/.test(t) ? 'tree' : 'flowers'), 'context-plant');
  if (/\b(wear(s|ing)?|hat|shirt|he|she|his|her|named|person|guy|man|woman)\b/.test(t)) return out(C.person(name, w), 'context-person');

  // ---- 3. Morphology ----
  const M = [
    [/(saur(us)?|raptor|odon|dactyl|ceratops|mimus)$/, () => C.dino(name, h)],
    [/(fish|shark|eel|ray|minnow|tuna|trout)$/, () => C.fish(name)],
    [/(bird|hawk|owl|finch|wren|lark|jay|crow|swallow|ingale|pecker|gull)$/, () => C.bird(name)],
    [/(bug|beetle|fly|moth|ant|wasp|worm|pede|spider|mite|tick|hopper)$/, () => C.bug(name, h)],
    [/(bot|tron|droid|borg|mech|oid)$/, () => C.robot(name)],
    [/(mobile|car|truck|bus|cycle|bike|ship|boat|craft|copter|plane|jet|tank|train|tram|sled|mower|rover|kart)$/, () => C.vehicle(name, /ship|craft/.test(w) ? 'spaceship' : /boat/.test(w) ? 'boat' : /copter/.test(w) ? 'helicopter' : /plane|jet/.test(w) ? 'plane' : /cycle|bike/.test(w) ? 'motorcycle' : /truck/.test(w) ? 'truck' : 'sports')],
    [/(house|hall|tower|shop|store|station|center|centre|arium|orium|port|plex|dome|palace|castle|temple|church|hut|shack|shed|barn|mall|hotel|inn|tavern|lab|school|factory|mill|works)$/, () => C.building(name, h)],
    [/(ville|town|burg|borough|polis|opolis|land|stan|shire|heim)$/, () => C.place(name, h % 2 ? 'village' : 'city')],
    [/(tree|wood|oak|pine|palm)$/, () => C.plant(name, 'tree')],
    [/(flower|bloom|blossom|weed|wort|lily|rose|berry|shroom|vine|fern|moss|grass|bush)$/, () => C.plant(name, /shroom/.test(w) ? 'mushroom' : /bush|berry/.test(w) ? 'bush' : 'flowers')],
    [/(ist|ian|man|woman|smith|wright|monger|keeper|master|maker|herd|jack|ess)$/, () => C.person(name, w)],
    [/(ite|ium|stone|gem|shard|crystal|orb|rune|sigil)$/, () => C.relic(name)],
    [/(er|or|ator|izer|iser|matic|scope|meter|graph|phone|vac|lizer)$/, () => C.machine(name)],
    [/(ball|cube|sphere|orb|ring|star|heart)$/, () => C.shape(name, /cube/.test(w) ? 'cube' : /ring/.test(w) ? 'torus' : 'sphere')],
    [/(cake|pie|bread|cookie|candy|pudding|soup|stew|burger|pizza|taco|sushi|noodle)s?$/, () => C.food(name)],
    [/(box|jar|pot|can|bag|chest|case|crate|bin)$/, () => C.container(name)],
    [/(sword|blade|axe|spear|bow|gun|blaster|lance|staff|wand)$/, () => C.weapon(name)],
  ];
  for (const [re, f] of M) if (re.test(w)) return out(f(), 'morphology');

  // ---- 4. Pure invention: a deterministic, named guess ----
  const r = h % 100;
  if (r < 58) return out(/[aeiouy]$/.test(w) && w.length <= 7 ? C.creature(name, { cute: true }) : C.creature(name), 'invented-creature');
  if (r < 72) return out(C.cute(name), 'invented-blob');
  if (r < 86) return out(C.relic(name), 'invented-relic');
  return out(C.machine(name), 'invented-machine');
}
