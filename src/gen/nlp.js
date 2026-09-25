// ---------------------------------------------------------------------------
// Local natural-language understanding (no external API, no neural model).
//
// Pipeline for one input line:
//   1. normalise (case, punctuation, number words -> digits, units)
//   2. intent detection with ordered rules: talk / undo / clear / help /
//      time / weather / delete / modify / teleport / player & NPC commands,
//      otherwise "create"
//   3. for creation: split into entity clauses ("a red car and a dog next
//      to it"), extract placement phrases, find the head noun (longest
//      phrase match against the concept lexicon, right-most in the main noun
//      phrase, with plural stripping and fuzzy trigram matching for typos),
//      then bind attributes: colours to parts ("blue shirt", "red roof"),
//      sizes and explicit dimensions ("1.70 m tall", "10 floors"), counts,
//      styles, materials, clothing, hair, age, body type, personality,
//      names, feature lists ("with a garden and a pool") and companions
//      ("a man with a dog" creates both).
// ---------------------------------------------------------------------------

import {
  CONCEPTS, COLORS, SIZE_WORDS, STYLE_WORDS, AGE_WORDS, BODY_WORDS, HAIR_STYLE_WORDS, CLOTHING_WORDS,
  PERSONALITY_WORDS, ETHNICITY_WORDS, BUILDING_FEATURES, NUMBER_WORDS,
} from './lexicon.js';
import { MATERIAL_WORDS } from '../render/materials.js';
import { CONCEPTS2 } from './lexicon2.js';
import { interpretUnknown } from './interpret.js';

// ---------------- Indexes ----------------
// Overrides from the extended vocabulary win over older, coarser mappings.
export const ALL_CONCEPTS = [...CONCEPTS2.filter((c) => c.o), ...CONCEPTS, ...CONCEPTS2.filter((c) => !c.o)];
const PHRASE_TO_CONCEPT = new Map();
let MAX_PHRASE = 1;
for (const c of ALL_CONCEPTS) {
  for (const w of c.words) {
    if (!PHRASE_TO_CONCEPT.has(w)) PHRASE_TO_CONCEPT.set(w, c);
    MAX_PHRASE = Math.max(MAX_PHRASE, w.split(' ').length);
  }
}
const CONCEPT_BY_ID = new Map();
for (const c of ALL_CONCEPTS) if (!CONCEPT_BY_ID.has(c.id)) CONCEPT_BY_ID.set(c.id, c);
export function conceptById(id) { return CONCEPT_BY_ID.get(id); }

const COLOR_PHRASES = Object.keys(COLORS).sort((a, b) => b.split(' ').length - a.split(' ').length);
const PART_NOUNS = new Set(['hair', 'eyes', 'eye', 'shirt', 't-shirt', 'tshirt', 'tee', 'dress', 'jacket', 'coat', 'pants', 'jeans', 'trousers', 'shorts', 'skirt', 'shoes', 'sneakers', 'boots', 'hat', 'cap', 'beanie', 'hoodie', 'sweater', 'suit', 'tie', 'scarf', 'gloves', 'belt', 'glasses', 'sunglasses', 'robe', 'cape', 'top', 'blouse', 'polo', 'vest', 'uniform',
  'roof', 'walls', 'wall', 'door', 'doors', 'windows', 'window', 'shutters', 'trim', 'fence', 'garden', 'chimney', 'frame', 'facade',
  'fur', 'coat fur', 'scales', 'wings', 'wing', 'feathers', 'mane', 'tail', 'horn', 'horns', 'spots', 'stripes', 'skin', 'beard', 'mustache', 'body', 'belly', 'nose', 'lips', 'lipstick', 'nails',
  'leaves', 'petals', 'flowers', 'blossoms', 'trunk', 'bark', 'wheels', 'wheel', 'rims', 'sail', 'sails', 'seats', 'seat', 'cushions', 'legs', 'light', 'lights', 'glow', 'flames', 'fire', 'water', 'lid', 'handle', 'screen', 'stripe', 'accents', 'details']);
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'to', 'in', 'on', 'at', 'for', 'is', 'it', 'that', 'this', 'some', 'very', 'really', 'please', 'me', 'my', 'i', 'you', 'can', 'could', 'would', 'want', 'like', 'make', 'create', 'build', 'spawn', 'generate', 'add', 'place', 'put', 'give', 'show', 'be', 'there', 'who', 'which', 'has', 'have', 'having', 'its', 'his', 'her', 'their', 'them', 'they', 'from', 'by', 'as', 'or', 'but', 'so', 'just', 'also', 'too', 'quite', 'bit', 'slightly', 'extremely', 'super', 'kind', 'sort', 'type', 'looking', 'made', 'up', 'out', 'new', 'another', 'other', 'one']);

const NUM_UNITS = { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, cm: 0.01, centimeter: 0.01, centimeters: 0.01, centimetres: 0.01, mm: 0.001, km: 1000, ft: 0.3048, foot: 0.3048, feet: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254 };

// ---------------- Helpers ----------------
export function singular(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (/ves$/.test(w)) return w.slice(0, -3) + 'f';
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

function trigrams(w) {
  const s = `  ${w} `;
  const out = new Map();
  for (let i = 0; i < s.length - 2; i++) { const t = s.slice(i, i + 3); out.set(t, (out.get(t) || 0) + 1); }
  return out;
}
function trigramSim(a, b) {
  const A = trigrams(a), B = trigrams(b);
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of A) { na += v * v; if (B.has(k)) dot += v * B.get(k); }
  for (const v of B.values()) nb += v * v;
  return dot / Math.sqrt(na * nb || 1);
}
const SINGLE_WORDS = [...PHRASE_TO_CONCEPT.keys()].filter((w) => !w.includes(' ') && w.length >= 3);
// Optimal-string-alignment (Damerau-Levenshtein) distance with an early cut-off.
// Typing-error model: swapping neighbouring keys or mixing up vowels is a
// plausible slip (cost 1); any other substitution counts double, so real
// but unknown words ("hand", "golf", "brain") are not "corrected" into
// look-alikes ("wand", "wolf", "train"). Short words also get no
// insertions/deletions ("atom" is not a misspelt "atm").
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_POS = {};
KEY_ROWS.forEach((row, y) => [...row].forEach((ch, x) => { KEY_POS[ch] = [x + y * 0.5, y]; }));
const VOWELS = new Set('aeiouy');
function subCost(x, y) {
  if (x === y) return 0;
  if (VOWELS.has(x) && VOWELS.has(y)) return 1;
  const p = KEY_POS[x], q = KEY_POS[y];
  return p && q && Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1 ? 1 : 2;
}
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  const indel = n <= 4 ? max + 1 : 1;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j * indel);
  for (let i = 1; i <= n; i++) {
    const cur = [i * indel];
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = subCost(a[i - 1], b[j - 1]);
      let v = Math.min(prev[j] + indel, cur[j - 1] + indel, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}
// Typo tolerance scales with word length: 1 edit up to 6 letters, 2 up to 10, 3 beyond.
export function fuzzyConcept(word) {
  if (word.length < 4) return null;
  const max = word.length <= 6 ? 1 : word.length <= 10 ? 2 : 3;
  let best = null, bestD = max + 1, bestS = 0;
  for (const w of SINGLE_WORDS) {
    if (Math.abs(w.length - word.length) > max) continue;
    const d = editDistance(word, w, max);
    if (d > max) continue;
    const s = trigramSim(word, w);
    if (d < bestD || (d === bestD && s > bestS)) { bestD = d; bestS = s; best = w; }
  }
  return best ? { concept: PHRASE_TO_CONCEPT.get(best), word: best, score: 1 - bestD / word.length } : null;
}
export function lookupPhrase(ph) { return PHRASE_TO_CONCEPT.get(ph) || PHRASE_TO_CONCEPT.get(singular(ph)) || null; }

const WORD_NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };

export function normalize(text) {
  let t = ' ' + String(text).toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[!?;]+/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[(){}[\]]/g, ' ') + ' ';
  // Feet/inches like 5'10" -> 1.78 m
  t = t.replace(/(\d+)\s*'\s*(\d+)\s*(?:"|'')?/g, (m, f, i) => ` ${(Number(f) * 0.3048 + Number(i) * 0.0254).toFixed(2)} m `);
  t = t.replace(/(\d+)\s*(?:ft|feet|foot)\s*(\d+)\s*(?:in|inches|inch)?\b/g, (m, f, i) => ` ${(Number(f) * 0.3048 + Number(i) * 0.0254).toFixed(2)} m `);
  // "one and a half" / "two and a half"
  t = t.replace(/\b(\w+) and a half\b/g, (m, w) => (WORD_NUMS[w] ? ` ${WORD_NUMS[w] + 0.5} ` : m));
  // Word numbers directly before units/story words.
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)[- ](story|storey|stories|storeys|floor|floors|level|levels|meter|meters|metre|metres|m|feet|foot|ft|legged|headed|eyed|armed)\b/g, (m, w, u) => ` ${WORD_NUMS[w]} ${u} `);
  t = t.replace(/(\d)(m|cm|mm|ft|km)\b/g, '$1 $2');
  t = t.replace(/(\d+(?:\.\d+)?)-(story|storey|floor|level|meter|metre|foot|ft|legged)/g, '$1 $2');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

function findAll(re, s) { const out = []; let m; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = r.exec(s))) out.push(m); return out; }

// ---------------- Intents ----------------
const CREATE_PREFIX = /^(?:(?:please|pls|hey|ok|okay|now|and|also|then)\s+)*(?:(?:can|could|would|will) you\s+|i (?:want|would like|'d like|need)\s+(?:you to\s+)?|let'?s\s+|let me\s+(?:have|see)\s+|i wish for\s+|give me\s+|show me\s+|there should be\s+|there is\s+|there's\s+)?(?:please\s+)?(?:create|make|build|spawn|generate|add|place|put|summon|conjure|draw|construct|craft|produce|bring|drop|design|model|render|imagine|manifest|materiali[sz]e)?\s*(?:me\s+)?(?:up\s+)?/;

export function parseCommand(raw, ctx = {}) {
  const text = normalize(raw);
  if (!text) return { type: 'empty' };
  const npcNames = (ctx.npcNames || []).map((n) => n.toLowerCase());

  // ---- Talk ----
  const talkM = text.match(/^(?:hey|hi|hello|yo|oi|excuse me|dear)?,?\s*@?([a-z][a-z0-9\- ]{0,20}?)[,:]\s*(.+)$/) || text.match(/^@([a-z0-9\-]+)\s+(.+)$/) || text.match(/^(?:hey|hi|hello|yo)\s+([a-z0-9\-]+)\b,?\s*(.*)$/);
  if (talkM) {
    const name = talkM[1].trim();
    if (npcNames.includes(name)) return { type: 'talk', target: name, text: talkM[2] || 'hello' };
  }
  const tellM = text.match(/^(?:tell|ask)\s+([a-z0-9\-]+)\s+(?:to\s+)?(.+)$/);
  if (tellM && npcNames.includes(tellM[1])) return { type: 'talk', target: tellM[1], text: tellM[2] };
  if (ctx.talking && !/^(create|make|build|spawn|generate|add|summon)\s+(a|an|the|some|\d)/.test(text)) return { type: 'talk', target: null, text: raw.trim() };

  // ---- Group NPC commands ----
  const groupM = text.match(/^(everyone|everybody|all of you|all|you all|y'all|guys|people)\s*,?\s*(follow me|come here|stop|stay|wait|dance|sit( down)?|wave|jump|cheer|clap|go away|scatter)/);
  if (groupM) return { type: 'npc', target: 'all', action: groupM[2].split(' ')[0] };

  // ---- System ----
  if (/^(undo|undo that|undo last|go back|revert|ctrl z)$/.test(text)) return { type: 'undo' };
  if (/^(clear|clear all|clear everything|delete everything|remove everything|destroy everything|reset|reset (the )?world|wipe (the )?world|delete all|remove all)$/.test(text)) return { type: 'clear' };
  if (/^(help|\?|commands|what can i (do|say|type|make|create)|how does this work|instructions|examples?)$/.test(text)) return { type: 'help' };
  if (/^(save|save (the )?(game|world))$/.test(text)) return { type: 'save' };

  // ---- Time ----
  const timeWords = { dawn: 5.8, sunrise: 6.2, morning: 8.5, 'early morning': 7, noon: 12, midday: 12, day: 11, daytime: 11, afternoon: 15, 'late afternoon': 16.8, evening: 18.6, sunset: 18.3, dusk: 18.9, twilight: 19.1, 'golden hour': 17.6, night: 22, nighttime: 22, 'night time': 22, midnight: 0, 'blue hour': 19.3 };
  let tm = text.match(/^(?:make it|set (?:the )?time to|change (?:the )?time to|set it to|turn it to|it'?s|time|go to|skip to|switch to|fast forward to|jump to)\s+(?:the\s+)?([a-z ]+?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s+time)?$/);
  if (tm) {
    const v = tm[1].trim();
    if (timeWords[v] !== undefined) return { type: 'time', hours: timeWords[v] };
    const hm = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (hm) { let h = Number(hm[1]) % 24; if (hm[3] === 'pm' && h < 12) h += 12; if (hm[3] === 'am' && h === 12) h = 0; return { type: 'time', hours: h + (hm[2] ? Number(hm[2]) / 60 : 0) }; }
  }
  if (timeWords[text] !== undefined && text.split(' ').length <= 2) return { type: 'time', hours: timeWords[text] };
  if (/^(freeze|stop|pause) (the )?(time|clock|day ?night cycle)$/.test(text)) return { type: 'time', freeze: true };
  if (/^(resume|start|unfreeze|continue) (the )?(time|clock|day ?night cycle)$/.test(text)) return { type: 'time', resume: true };
  if (/^(speed up|fast forward|accelerate) (the )?time$|^time lapse$|^timelapse$/.test(text)) return { type: 'time', speed: 'fast' };
  if (/^(slow down) (the )?time$|^normal time$/.test(text)) return { type: 'time', speed: 'normal' };

  // ---- Weather ----
  const wm = text.match(/^(?:make it|let it|start|begin|set (?:the )?weather to|weather|i want|turn on|make|create|build|summon|a|an)?\s*(?:the\s+|a\s+|an\s+)?(rain|raining|rainy|snow|snowing|snowy|storm|stormy|thunderstorm|thunder|lightning storm|lightning|fog|foggy|misty|mist|cloudy|overcast|clear|sunny|sun|clear sky|clear skies|blizzard|drizzle|snowstorm|snow storm|rainstorm|rain storm|hailstorm|downpour|heavy rain|thunder storm)(?:\s+(?:weather|day))?$/);
  if (wm || /^(stop|end) (the )?(rain|snow|storm|fog|raining|snowing)$/.test(text) || /^clear (the )?(weather|sky|skies)$/.test(text)) {
    const w = wm ? wm[1] : 'clear';
    const map = { rain: 'rain', raining: 'rain', rainy: 'rain', drizzle: 'rain', snow: 'snow', snowing: 'snow', snowy: 'snow', blizzard: 'snow', snowstorm: 'snow', 'snow storm': 'snow', rainstorm: 'storm', 'rain storm': 'storm', hailstorm: 'storm', downpour: 'rain', 'heavy rain': 'rain', 'thunder storm': 'storm', 'lightning storm': 'storm', storm: 'storm', stormy: 'storm', thunderstorm: 'storm', thunder: 'storm', lightning: 'storm', fog: 'fog', foggy: 'fog', misty: 'fog', mist: 'fog', cloudy: 'cloudy', overcast: 'cloudy', clear: 'clear', sunny: 'clear', sun: 'clear', 'clear sky': 'clear', 'clear skies': 'clear' };
    return { type: 'weather', value: map[w] || 'clear' };
  }

  // ---- Player ----
  if (/^(fly|fly mode|let me fly|enable flying|start flying|i want to fly|creative mode)$/.test(text)) return { type: 'player', action: 'fly' };
  if (/^(stop flying|land|walk|disable flying|walk mode|survival mode)$/.test(text)) return { type: 'player', action: 'nofly' };
  if (/^(third person|3rd person|third-person|show me myself|camera behind)$/.test(text)) return { type: 'player', action: 'third' };
  if (/^(first person|1st person|first-person)$/.test(text)) return { type: 'player', action: 'first' };
  if (/^(i )?(dance|wave|sit|sit down|cheer|clap|jump|bow|shrug)$/.test(text) && !ctx.talking) return { type: 'player', action: text.replace(/^i /, '').split(' ')[0] };
  const gm = text.match(/^(?:set )?gravity (?:to )?(low|normal|high|zero|off|moon|mars|\d+(?:\.\d+)?)$/) || text.match(/^(low|high|zero|no|moon|normal) gravity$/);
  if (gm) return { type: 'gravity', value: gm[1] };

  // ---- Teleport ----
  const tpm = text.match(/^(?:go|take me|teleport(?: me)?|travel|walk|bring me|warp(?: me)?|jump|return|head)\s+(?:back\s+)?(?:to\s+)?(?:the\s+)?(.+)$/);
  if (tpm && !/^(sleep|away|bed)$/.test(tpm[1])) {
    const target = tpm[1].trim();
    if (/^(home|spawn|start|overworld|real world|normal world|earth|back|beginning)$/.test(target)) return { type: 'teleport', home: true };
    return { type: 'teleport', ref: parseRef(target) };
  }
  if (/^(go home|return home|go back|leave|exit (this )?(world|dimension)|get me out( of here)?)$/.test(text)) return { type: 'teleport', home: true };

  // ---- Delete ----
  const dm = text.match(/^(?:please\s+)?(?:delete|remove|destroy|erase|get rid of|kill|despawn|eliminate|vanish|banish|clear)\s+(.+)$/);
  if (dm) return { type: 'delete', ref: parseRef(dm[1]) };

  // ---- Modify ----
  const mm = text.match(/^(?:make|turn|paint|color|colour|change|set|scale|resize|rotate|spin|move|push|pull|shift|lift|raise|lower|flip)\s+(it|that|this|them|those|these|everything|the [a-z0-9\- ]+?|my [a-z ]+?|[a-z]+'s [a-z ]+?)\s+(.+)$/);
  const mm2 = text.match(/^(make|turn|paint|rotate|move|scale|flip|spin)\s+(it|that|this|them)$/);
  if (mm || mm2) {
    const verb = text.split(' ')[0];
    const refText = mm ? mm[1] : mm2[2];
    const rest = mm ? mm[2] : '';
    const changes = parseChanges(verb, rest);
    if (changes) return { type: 'modify', ref: parseRef(refText), changes };
  }
  const bm = text.match(/^(bigger|smaller|taller|shorter|larger|wider|thinner|turn around|rotate|spin)$/);
  if (bm) return { type: 'modify', ref: { pronoun: 'it' }, changes: parseChanges('make', bm[1]) };

  // ---- NPC commands (when a character is addressed implicitly) ----
  const npcM = text.match(/^(follow me|come here|come with me|stop following|stay( here)?|wait( here)?|stop|go away|sit( down)?|dance|wave|jump|come back)$/);
  if (npcM && ctx.hasNearbyNPC) return { type: 'npc', target: 'nearest', action: npcM[1].split(' ')[0] };

  // ---- Create ----
  let body = text.replace(CREATE_PREFIX, '').trim();
  body = body.replace(/^(?:a|an)\s+(?:new\s+)?/, 'a ');
  if (!body) return { type: 'unknown', text };
  const items = parseCreation(body);
  if (!items.length) return { type: 'unknown', text };
  return { type: 'create', items, text: raw };
}

// Reference to an existing entity: "it", "that house", "the red car", "all trees", "marcus".
export function parseRef(s) {
  s = s.trim().replace(/^(?:please\s+)?/, '');
  if (/^(it|that|this|that one|this one|that thing|this thing|what i'?m looking at|the thing|last one|the last one|last)$/.test(s)) return { pronoun: 'it' };
  if (/^(them|those|these|all of them)$/.test(s)) return { pronoun: 'them' };
  if (/^(everything|all|all objects|all things)$/.test(s)) return { all: true };
  const all = /^(all|every|each)\s+(?:the\s+|of the\s+)?/.test(s);
  s = s.replace(/^(all|every|each)\s+(?:the\s+|of the\s+)?/, '').replace(/^(the|that|this|those|these|my|a|an)\s+/, '');
  const ref = { all, text: s };
  const colors = findAll(new RegExp(`\\b(${COLOR_PHRASES.map((c) => c.replace(/ /g, '\\s')).join('|')})\\b`), s);
  if (colors.length) ref.color = colors[0][1];
  const words = s.split(' ');
  for (let n = Math.min(MAX_PHRASE, words.length); n >= 1; n--) {
    for (let i = words.length - n; i >= 0; i--) {
      const ph = words.slice(i, i + n).join(' ');
      const c = PHRASE_TO_CONCEPT.get(ph) || PHRASE_TO_CONCEPT.get(singular(ph));
      if (c) { ref.concept = c.id; ref.cat = c.cat; ref.gen = c.gen; return ref; }
    }
  }
  ref.name = words[words.length - 1];
  return ref;
}

function parseChanges(verb, rest) {
  const c = {};
  rest = (rest || '').trim();
  if (/\b(bigger|larger|huge|giant|grow|enlarge|double)\b/.test(rest)) c.scale = /\b(huge|giant)\b/.test(rest) ? 2.5 : /\bmuch\b/.test(rest) ? 2 : 1.4;
  if (/\b(smaller|tiny|little|shrink|half|mini)\b/.test(rest)) c.scale = /\btiny\b/.test(rest) ? 0.35 : /\bmuch\b/.test(rest) ? 0.5 : 0.7;
  if (/\btaller\b/.test(rest)) c.scaleY = 1.35;
  if (/\bshorter\b/.test(rest)) c.scaleY = 0.75;
  const sm = rest.match(/(\d+(?:\.\d+)?)\s*(?:x|times)/);
  if (sm) c.scale = Number(sm[1]);
  const col = findAll(new RegExp(`\\b(${COLOR_PHRASES.map((x) => x.replace(/ /g, '\\s')).join('|')})\\b`), rest);
  if (col.length && !/\b(eyes|hair)\b/.test(rest)) c.color = COLORS[col[0][1]];
  for (const w of rest.split(' ')) if (MATERIAL_WORDS[w] && !c.color) c.material = MATERIAL_WORDS[w];
  if (verb === 'rotate' || verb === 'spin' || /\b(turn around|rotate|face me|look at me|turn)\b/.test(rest)) {
    c.rotate = /\bface me|look at me\b/.test(rest) ? 'face' : /\b(left)\b/.test(rest) ? Math.PI / 4 : /\b(right)\b/.test(rest) ? -Math.PI / 4 : /\baround\b/.test(rest) || verb === 'rotate' ? Math.PI : Math.PI / 2;
    if (verb === 'spin' || /\bspin/.test(rest)) c.spin = true;
  }
  if (verb === 'move' || verb === 'push' || verb === 'pull' || verb === 'shift' || verb === 'lift' || verb === 'raise' || verb === 'lower' || /\b(closer|further|farther|away|up|down|left|right|here|forward|back)\b/.test(rest)) {
    const d = rest.match(/(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?/);
    const dist = d ? Number(d[1]) : 3;
    if (/\b(closer|here|toward me|towards me)\b/.test(rest) || verb === 'pull') c.move = { dir: 'closer', dist };
    else if (/\b(further|farther|away|back)\b/.test(rest) || verb === 'push') c.move = { dir: 'away', dist };
    else if (/\bup\b/.test(rest) || verb === 'lift' || verb === 'raise') c.move = { dir: 'up', dist: d ? dist : 2 };
    else if (/\bdown\b/.test(rest) || verb === 'lower') c.move = { dir: 'down', dist: d ? dist : 2 };
    else if (/\bleft\b/.test(rest)) c.move = { dir: 'left', dist };
    else if (/\bright\b/.test(rest)) c.move = { dir: 'right', dist };
    else if (/\bforward\b/.test(rest)) c.move = { dir: 'away', dist };
  }
  if (/\b(glow|glowing|shine|shiny|light up)\b/.test(rest)) c.glow = true;
  if (/\b(float|floating|fly|levitate)\b/.test(rest)) c.float = true;
  if (/\b(invisible|disappear)\b/.test(rest)) c.hide = true;
  if (/\b(visible|appear)\b/.test(rest)) c.show = true;
  return Object.keys(c).length ? c : null;
}

// ---------------- Creation parsing ----------------
const PLACEMENT_RULES = [
  [/\b(?:right |just )?(?:in front of|infront of|ahead of|before) (?:me|you|us)\b/, () => ({ mode: 'front' })],
  [/\b(?:right |just )?behind (?:me|you|us)\b/, () => ({ mode: 'behind' })],
  [/\b(?:right |just )?(?:next to|beside|besides|by|near|close to|alongside) (?:me|you|us)\b|\bnearby\b|\bclose by\b/, () => ({ mode: 'beside' })],
  [/\b(?:to|on|at) (?:my|the|your) left\b|\bleft of me\b/, () => ({ mode: 'left' })],
  [/\b(?:to|on|at) (?:my|the|your) right\b|\bright of me\b/, () => ({ mode: 'right' })],
  [/\b(?:above|over) (?:me|my head|us|you)\b|\bin the (?:sky|air)\b|\bup high\b|\bup in the sky\b|\boverhead\b/, () => ({ mode: 'above' })],
  [/\b(?:far away|far off|in the distance|on the horizon|far from me|in the far distance)\b/, () => ({ mode: 'far' })],
  [/\baround me\b|\bsurrounding me\b|\ball around\b|\bin a circle\b/, () => ({ mode: 'around' })],
  [/\b(?:on|at|atop|on top of) (?:the|a) (?:hill|hilltop|mountain|mountaintop|peak)\b/, () => ({ mode: 'high' })],
  [/\b(?:in|on|onto|into) the (?:lake|water|pond|sea|ocean)\b/, () => ({ mode: 'onWater' })],
  [/\b(?:near|by|next to|beside|at|on) the (?:lake|water|shore|lakeshore|beach|river)\b|\blakeside\b|\bby the water\b/, () => ({ mode: 'nearWater' })],
  [/\b(?:right )?here\b/, () => ({ mode: 'here' })],
  [/\b(?:next to|beside|near|close to|by) (?:it|them)\b/, () => ({ mode: 'relative', rel: 'beside', ref: { pronoun: 'prev' } })],
  [/\b(?:on top of|on) (?:it|them)\b/, () => ({ mode: 'relative', rel: 'on', ref: { pronoun: 'prev' } })],
  [/\b(?:replace|instead of|in place of|replacing) (?:the |that |this |my )?([a-z\- ]{2,30}?)(?= with|$| and |,)/, (m) => ({ mode: 'replace', ref: parseRef(m[1]) })],
  [/\b(next to|beside|near|close to|by|behind|in front of|on top of|on|above|under|inside|in|around|at|outside) (?:the|that|this|my|our) ([a-z\- ]{2,30}?)(?= with| wearing| that| who|$| and |,)/, (m) => ({ mode: 'relative', rel: relWord(m[1]), ref: parseRef(m[2]) })],
];
function relWord(w) {
  return { 'next to': 'beside', beside: 'beside', near: 'beside', 'close to': 'beside', by: 'beside', behind: 'behind', 'in front of': 'front', 'on top of': 'on', on: 'on', above: 'above', under: 'under', inside: 'inside', in: 'inside', around: 'around', at: 'beside', outside: 'beside' }[w] || 'beside';
}

function extractPlacement(s) {
  for (const [re, fn] of PLACEMENT_RULES) {
    const m = s.match(re);
    if (m) {
      // "on the table" style only counts when the ref is a known concept/name.
      const p = fn(m);
      if (p.mode === 'relative' && p.ref && !p.ref.concept && !p.ref.pronoun && !['it'].includes(p.ref.name)) {
        // Unknown reference word (e.g. "in the style of"), treat as literal text.
        if (!/^(house|car|tree|lake|table)/.test(p.ref.text || '')) continue;
      }
      return { placement: p, rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
    }
  }
  return { placement: null, rest: s };
}

// Split a creation request into entity clauses.
function splitClauses(s) {
  // Protect feature lists after "with": "a house with a garden and a pool" is one entity.
  const parts = [];
  const tokens = s.split(/\s*(?:,\s*and\s+|,\s+|\s+and also\s+|\s+plus\s+|\s+as well as\s+|\s+along with\s+|;\s*)\s*/);
  for (const t of tokens) {
    // Split on " and " only when the right side starts a new counted noun phrase that is a concept not a feature.
    const sub = t.split(/\s+and\s+(?=(?:a|an|some|two|three|four|five|six|seven|eight|nine|ten|\d+|several|many|few|the)\s)/);
    for (const x of sub) parts.push(x);
  }
  // Re-merge clauses that are only features of the previous one (e.g. "and a garden",
  // or body parts of a character: "a man with wings and a halo").
  const merged = [];
  for (const p of parts) {
    const head = findHead(p);
    const prev = merged[merged.length - 1];
    const bodyPart = prev && prev.headConcept && ['human', 'creature', 'robot', 'bird', 'fish', 'snake'].includes(prev.headConcept.gen) && BODY_PARTS.test(p);
    if (prev && (!head || bodyPart || isFeatureOf(head.concept, prev.headConcept) || (head && head.concept.cat === 'clothing'))) {
      prev.text += ' and ' + p;
    } else merged.push({ text: p, headConcept: head ? head.concept : null });
  }
  return merged.map((m) => m.text);
}

const BODY_PARTS = /^(?:(?:a|an|the|some|two|three|four|big|small|long|huge|little|glowing|golden|red|black|white|curved|sharp|pointy|fluffy|feathered|bat|spiked|devil|fish|scaly|\d+)\s+)*(?:halo|tails?|horns?|wings?|fangs|claws|mane|beard|moustache|mustache|antlers|trunk|fins?|scales|fur|tentacles?|hooves|paws|tusks|spikes|eyes?|heads?|legs?|arms?)\b/;

function isFeatureOf(concept, parentConcept) {
  if (!parentConcept) return false;
  if (parentConcept.gen === 'building' && ['flowers', 'bush', 'pool', 'fence', 'tree', 'fountain', 'bench', 'street lamp', 'road', 'mailbox', 'flag'].includes(concept.id)) return true;
  if (parentConcept.gen === 'human' && ['glasses', 'phone', 'sword', 'guitar', 'book', 'cup', 'umbrella', 'hat', 'balloon', 'flowers', 'tools', 'food'].includes(concept.id)) return true;
  return false;
}

// Where the main noun phrase ends: relative clauses, participles ("breathing
// fire", "riding a horse"), comparisons ("the size of a house") and so on.
const HEAD_BOUNDARY = /\s(?:with|wearing|dressed|who|that|which|named|called|holding|carrying|made of|made from|made out of|out of|having|in a|in an|in the|on a|to a|to an|to the|leading to|going to|full of|filled with|covered in|covered with|shaped like|shaped as|in the shape of|looking like|that looks like|like a|like an|the size of|as big as|as large as|as tall as|as small as|as tiny as|bigger than|larger than|taller than|smaller than|for a|for the|from a|from the|breathing|eating|riding|sitting|standing|playing|flying|swimming|running|jumping|sleeping|reading|singing|dancing|juggling|drinking|chasing|guarding|hugging|pulling|pushing|carrying|spitting|shooting|throwing|walking|driving|piloting|steering|attacking|fighting|hunting|biting|climbing|destroying|protecting|watching|casting|meditating|hanging|rising|sailing|floating|orbiting|surrounded by|on top of|next to|near|over the|over a|under the|under a|above the|above a|below the|across the|beside the|beside a|by the|by a|at the|inside the|inside a|behind the|behind a|in front of)\s/;
// Reference sizes (m) for "the size of a X" / "as big as a X".
const REF_SIZES = { house: 8, home: 8, building: 12, skyscraper: 120, castle: 25, tower: 30, church: 20, cathedral: 40, stadium: 40, mountain: 250, hill: 40, volcano: 200, tree: 10, forest: 20, car: 1.5, truck: 3.5, bus: 3.2, train: 4, plane: 12, airplane: 12, ship: 20, boat: 3, horse: 1.7, elephant: 3.2, giraffe: 5, whale: 6, dinosaur: 6, 't-rex': 5, dragon: 6, person: 1.8, man: 1.8, human: 1.8, woman: 1.7, child: 1.2, kid: 1.2, baby: 0.6, dog: 0.6, cat: 0.3, mouse: 0.05, rat: 0.08, ant: 0.005, bug: 0.01, fly: 0.008, bee: 0.015, table: 0.75, chair: 0.9, bed: 0.6, fridge: 1.8, door: 2.1, apple: 0.08, orange: 0.08, coin: 0.02, ball: 0.22, football: 0.22, basketball: 0.24, marble: 0.015, pea: 0.008, grape: 0.02, cup: 0.1, fist: 0.1, hand: 0.19, thumb: 0.06, phone: 0.15, book: 0.25, planet: 2000, moon: 800, sun: 3000, city: 300, lake: 60, pond: 8, pyramid: 140 };
// Find the head concept in a clause (returns {concept, start, end, phrase}).
function findHead(s) {
  const boundary = s.search(HEAD_BOUNDARY);
  const main = boundary > 0 ? s.slice(0, boundary) : s;
  const inMain = scanConcepts(main);
  if (inMain.length) return inMain[inMain.length - 1];
  const all = scanConcepts(s);
  if (all.length) return all[0];
  return null;
}

function scanConcepts(s) {
  const words = s.split(' ').filter(Boolean);
  const found = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (let n = Math.min(MAX_PHRASE, words.length - i); n >= 1; n--) {
      const ph = words.slice(i, i + n).join(' ');
      let c = PHRASE_TO_CONCEPT.get(ph);
      if (!c && n === 1) c = PHRASE_TO_CONCEPT.get(singular(ph));
      if (!c && n > 1) c = PHRASE_TO_CONCEPT.get(words.slice(i, i + n - 1).join(' ') + ' ' + singular(words[i + n - 1]));
      if (c) { hit = { concept: c, start: i, end: i + n, phrase: ph }; break; }
    }
    if (hit) {
      // Colour/material words that are also concept words ("gold", "stone") only count at the end of the phrase.
      found.push(hit); i = hit.end;
    } else i++;
  }
  // Drop hits that are adjectives in context: e.g. "stone" before another concept ("stone house").
  return found.filter((h, k) => {
    const next = found[k + 1];
    if (next && next.start === h.end && ['rock', 'crystal', 'ice', 'tree', 'gem', 'flowers', 'dog', 'glasses'].includes(h.concept.id)) return false;
    return true;
  });
}

function parseCount(s) {
  const m = s.match(/^(\d+(?![\d.])(?!\s*(?:m|cm|mm|ft|feet|foot|meters?|metres?|km|inch|inches|in|story|storey|stories|storeys|floor|floors|level|levels|years?|yrs?|yo|x|headed|legged|eyed|armed|winged|tailed|horned|wheeled|sided|tiered|stage|part)\b)|a dozen|dozens of|a few|a couple of|a couple|a pair of|a pair|a group of|a herd of|a flock of|a pack of|a family of|a crowd of|a school of|a swarm of|a bunch of|a lot of|lots of|several|some|many|few|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b\s*/);
  if (!m) return { count: 1, rest: s };
  const w = m[1];
  let n;
  if (/^\d+$/.test(w)) n = Number(w);
  else if (w === 'a dozen') n = 12;
  else if (w === 'dozens of') n = 24;
  else {
    const key = w.replace(/^a /, '').replace(/ of$/, '').split(' ')[0];
    n = NUMBER_WORDS[key] || 3;
  }
  return { count: Math.max(1, Math.min(n, 40)), rest: s.slice(m[0].length) };
}

// Parse one entity clause into a spec.
export function parseEntity(clause) {
  let s = ' ' + clause.trim() + ' ';
  s = s.replace(/^\s*(?:a|an)\s+/, ' ').trim();
  const { placement, rest } = extractPlacement(s);
  s = rest;
  const cnt = parseCount(s);
  let count = cnt.count;
  s = cnt.rest;
  const attrs = {
    colors: [], primaryColor: null, secondaryColor: null, materials: [], sizeMul: 1, dims: {}, floors: null, style: null, styles: [],
    age: null, body: null, hair: {}, facialHair: null, eyeColor: null, clothing: [], accessories: [], personality: [], name: null,
    ethnicity: null, skin: null, flags: {}, features: [], companions: [], text: clause.trim(), words: [], sex: null, destination: null, label: null,
  };
  // Name.
  const nm = s.match(/\b(?:named|called|whose name is|name is)\s+([a-z][a-z\-']{1,20})/);
  if (nm) { attrs.name = nm[1][0].toUpperCase() + nm[1].slice(1); s = s.replace(nm[0], ' '); }
  // Quoted/said text for signs & letters.
  const said = attrs.text.match(/(?:says?|saying|reads?|reading|that says|with the (?:words?|text))\s+["']?([^"']+?)["']?\s*$/i) || attrs.text.match(/["']([^"']+)["']/);
  if (said) attrs.label = said[1].trim();
  // Portal destination.
  const dest = s.match(/\b(?:to|into|leading to|that leads to|opening to|towards|going to)\s+(?:(?:a|an|the)\s+)?(.+)$/);
  // "a statue of a lion", "a model of the eiffel tower": the thing depicted is the subject.
  const ofM = s.match(/\b(statue|sculpture|figurine|carving|bust|monument|replica|model|toy|miniature)s?\s+of\s+(?:a|an|the)\s+/);
  if (ofM && findHead(s.slice(ofM.index + ofM[0].length))) {
    s = (s.slice(0, ofM.index) + ' ' + s.slice(ofM.index + ofM[0].length)).replace(/\s+/g, ' ').trim();
    if (/statue|sculpture|figurine|carving|bust|monument/.test(ofM[1])) attrs.flags.statue = ofM[1];
    else attrs.flags.toy = true;
  }
  // "the size of a house", "as big as a car", "bigger than a bus": explicit scale.
  const refM = s.match(/\b(the size of|size of|as big as|as large as|as tall as|as small as|as tiny as|bigger than|larger than|taller than|smaller than|tinier than)\s+(?:a|an|the)?\s*([a-z-]+)(?:\s+([a-z-]+))?/);
  if (refM) {
    const cand = [refM[3], refM[2]].filter(Boolean);
    let size = null;
    for (const c of cand) { size = REF_SIZES[c] || REF_SIZES[singular(c)] || null; if (size) break; const lc = lookupPhrase(c); if (lc) { size = Math.max(0.2, (lc.r || 1) * 1.6); break; } }
    if (size) {
      const k = /bigger|larger|taller/.test(refM[1]) ? 1.6 : /smaller|tinier/.test(refM[1]) ? 0.5 : 1;
      attrs.dims.height = attrs.dims.height || size * k;
      attrs.sizeRef = cand[cand.length - 1];
    }
    s = s.replace(refM[0], ' ').replace(/\s+/g, ' ').trim();
  }
  const headsM = s.match(/\b(\d+|two|three|four|five|six|seven|eight|nine)[\s-]*(?:headed|heads)\b/); if (headsM) attrs.heads = /\d/.test(headsM[1]) ? Number(headsM[1]) : NUMBER_WORDS[headsM[1]];
  const legsM = s.match(/(\d+)\s*legged/); if (legsM) attrs.legs = Number(legsM[1]);
  const eyesM = s.match(/(\d+)\s*eyed/); if (eyesM) attrs.eyes = Number(eyesM[1]);
  if (/\b(winged|with wings)\b/.test(s)) attrs.flags.wings = true;
  let head = findHead(s);
  if (head && head.concept.gen === 'portal' && dest) { attrs.destination = dest[1].trim(); }
  // Explicit dimensions.
  for (const m of findAll(/(\d+(?:\.\d+)?)\s*(m|meters?|metres?|cm|centimet(?:er|re)s?|mm|ft|feet|foot|in|inch(?:es)?|km)\b\s*(tall|high|long|wide|in diameter|across|deep|in height|in length|in width|big)?/, s)) {
    const v = Number(m[1]) * (NUM_UNITS[m[2]] || 1);
    const dim = m[3] || 'size';
    if (/tall|high|height/.test(dim)) attrs.dims.height = v;
    else if (/long|length/.test(dim)) attrs.dims.length = v;
    else if (/wide|width|across|diameter/.test(dim)) attrs.dims.width = v;
    else if (/deep/.test(dim)) attrs.dims.depth = v;
    else attrs.dims.size = v;
  }
  const fl = s.match(/(\d+)\s*(?:story|storey|stories|storeys|floor|floors|level|levels)\b/);
  if (fl) attrs.floors = Math.max(1, Math.min(120, Number(fl[1])));
  else if (/\b(single[- ]story|one[- ]story|bungalow|single[- ]floor)\b/.test(s)) attrs.floors = 1;
  const ageM = s.match(/(\d+)[- ]?(?:years?|yrs?|yo)(?:[- ]old)?\b/);
  if (ageM) attrs.age = Number(ageM[1]);
  // Colours with part binding.
  const colorRe = new RegExp(`\\b(${COLOR_PHRASES.map((c) => c.replace(/ /g, '\\s')).join('|')})(?:[- ](haired|eyed|skinned|colou?red|furred|roofed))?\\b`, 'g');
  let cm;
  const headStart = head ? s.split(' ').slice(0, head.start).join(' ').length : Infinity;
  const headSpan = head ? (() => { const ws = s.split(' '); const a = ws.slice(0, head.start).join(' ').length + (head.start ? 1 : 0); return [a, a + head.phrase.length]; })() : null;
  while ((cm = colorRe.exec(s))) {
    if (headSpan && cm.index >= headSpan[0] && cm.index < headSpan[1]) continue;
    const color = COLORS[cm[1]];
    const suffix = cm[2];
    let part = null;
    if (suffix === 'haired') part = 'hair';
    else if (suffix === 'eyed') part = 'eyes';
    else if (suffix === 'skinned') part = 'skin';
    else if (suffix === 'furred') part = 'fur';
    else if (suffix === 'roofed') part = 'roof';
    else {
      // Look ahead up to 3 words (skipping other adjectives) for a part noun.
      const after = s.slice(cm.index + cm[0].length).trim().split(' ').slice(0, 4);
      for (let k = 0; k < after.length; k++) {
        const w = after[k], w2 = after[k] + ' ' + (after[k + 1] || '');
        if (PART_NOUNS.has(w2.trim())) { part = w2.trim(); break; }
        if (PART_NOUNS.has(w) || PART_NOUNS.has(singular(w))) { part = PART_NOUNS.has(w) ? w : singular(w); break; }
        if (COLORS[w] || STYLE_WORDS[w] || SIZE_WORDS[w] || MATERIAL_WORDS[w] || ['and', 'with', 'or', 'long', 'short', 'curly', 'wavy', 'straight', 'dark', 'light', 'bright', 'pale', 'shiny', 'striped', 'plaid', 'spotted', 'little', 'big'].includes(w)) continue;
        break;
      }
      // "with blue eyes", "hair is black"
      if (!part) {
        const before = s.slice(0, cm.index).trim().split(' ').slice(-3);
        if (/^(hair|eyes|roof|walls|fur|skin)$/.test(before[before.length - 2] || '') && before[before.length - 1] === 'is') part = before[before.length - 2];
      }
    }
    attrs.colors.push({ color, part, word: cm[1], at: cm.index });
  }
  const unbound = attrs.colors.filter((c) => !c.part);
  if (unbound.length) {
    // Prefer the colour right before the head noun.
    const nearHead = unbound.filter((c) => c.at < headStart + 2).sort((a, b) => b.at - a.at)[0];
    attrs.primaryColor = (nearHead || unbound[0]).color;
    const others = unbound.filter((c) => c !== (nearHead || unbound[0]));
    if (others.length) attrs.secondaryColor = others[0].color;
  }
  if (/\brainbow\b/.test(s) && head && head.concept.id !== 'rainbow') attrs.primaryColor = 'rainbow';
  // Materials.
  const matM = s.match(/\bmade (?:of|from|out of)\s+([a-z]+)/);
  if (matM && MATERIAL_WORDS[matM[1]]) attrs.materials.push(MATERIAL_WORDS[matM[1]]);
  // Tokens.
  const words = s.split(' ').filter(Boolean);
  attrs.words = words;
  const bodyConsumed = new Set();
  for (let i = 0; i < words.length; i++) {
    const w = words[i], w2 = w + ' ' + (words[i + 1] || ''), w3 = w2 + ' ' + (words[i + 2] || '');
    if (SIZE_WORDS[w] && !(w === 'little' && ['boy', 'girl', 'bit'].includes(words[i + 1]))) attrs.sizeMul *= SIZE_WORDS[w];
    if (STYLE_WORDS[w]) { attrs.styles.push(STYLE_WORDS[w]); if (!attrs.style) attrs.style = STYLE_WORDS[w]; }
    if (STYLE_WORDS[w2.trim()]) { attrs.styles.push(STYLE_WORDS[w2.trim()]); attrs.style = attrs.style || STYLE_WORDS[w2.trim()]; }
    if (MATERIAL_WORDS[w] && !COLORS[w] && !(head && i >= head.start && i < head.end)) attrs.materials.push(MATERIAL_WORDS[w]);
    if ((w === 'gold' || w === 'golden' || w === 'silver' || w === 'bronze' || w === 'copper') && !(head && i >= head.start && i < head.end) && !['hair', 'eyes', 'eyed', 'haired'].includes(words[i + 1])) attrs.materials.push(MATERIAL_WORDS[w]);
    if (AGE_WORDS[w2.trim()] !== undefined) attrs.age = attrs.age ?? AGE_WORDS[w2.trim()];
    else if (AGE_WORDS[w] !== undefined && !['little'].includes(w)) attrs.age = attrs.age ?? AGE_WORDS[w];
    if (bodyConsumed.has(i)) { /* part of a multi-word body phrase */ }
    else if (BODY_WORDS[w3.trim()]) { attrs.body = { ...(attrs.body || {}), ...BODY_WORDS[w3.trim()] }; bodyConsumed.add(i + 1); bodyConsumed.add(i + 2); }
    else if (BODY_WORDS[w2.trim()]) { attrs.body = { ...(attrs.body || {}), ...BODY_WORDS[w2.trim()] }; bodyConsumed.add(i + 1); }
    else if (BODY_WORDS[w] && !(w === 'short' && /^(hair|haired|sleeve|sleeves|skirt|shorts|dress|beard)/.test(words[i + 1] || '')) && !(w === 'short' && /^(curly|black|brown|blonde|red|straight|wavy|dark)/.test(words[i + 1] || '') && /hair/.test(words.slice(i, i + 4).join(' '))) && !(w === 'tall' && /grass/.test(words[i + 1] || ''))) attrs.body = { ...(attrs.body || {}), ...BODY_WORDS[w] };
    if (PERSONALITY_WORDS[w] && !(w === 'dark' || w === 'old' || w === 'cold')) attrs.personality.push(PERSONALITY_WORDS[w]);
    if (ETHNICITY_WORDS[w2.trim()]) attrs.ethnicity = { ...ETHNICITY_WORDS[w2.trim()] };
    else if (ETHNICITY_WORDS[w] && !(w === 'black' && /^(hair|shirt|jeans|pants|dress|jacket|suit|shoes|boots|eyes|hat|cap|fur|car)/.test(words[i + 1] || '')) && !(w === 'white' && /^(hair|shirt|dress|beard|fur|car|house)/.test(words[i + 1] || '')) && !(w === 'tan' && /^(pants|shorts|coat|jacket)/.test(words[i + 1] || '')) && !(w === 'olive' && /^(green|shirt|jacket|pants)/.test(words[i + 1] || ''))) {
      if (!(w === 'black' || w === 'white') || /^(man|woman|guy|girl|boy|person|lady|kid|child|men|women|people|family|gentleman)$/.test(words[i + 1] || '')) attrs.ethnicity = { ...ETHNICITY_WORDS[w] };
    }
    // Hair styles (only when near "hair" or unambiguous).
    const hs3 = HAIR_STYLE_WORDS[w2.trim()];
    if (hs3 && (/hair/.test(words.slice(i, i + 4).join(' ')) || ['ponytail', 'bun', 'afro', 'mohawk', 'bald', 'buzz cut', 'dreadlocks', 'braids', 'bob cut', 'slicked back'].includes(w2.trim()))) attrs.hair.style = hs3;
    else if (HAIR_STYLE_WORDS[w] && (/hair|haired/.test(words.slice(i, i + 4).join(' ')) || ['bald', 'ponytail', 'bun', 'afro', 'mohawk', 'braids', 'dreadlocks', 'balding'].includes(w))) {
      if (!attrs.hair.style || attrs.hair.style === 'short' || attrs.hair.style === 'long') attrs.hair.style = HAIR_STYLE_WORDS[w] === 'long' && attrs.hair.style === 'short' ? 'long' : (attrs.hair.style === 'short' && HAIR_STYLE_WORDS[w] === 'curly' ? 'curly' : attrs.hair.style === 'long' && HAIR_STYLE_WORDS[w] === 'curly' ? 'wavy' : HAIR_STYLE_WORDS[w]);
    }
    if (w === 'blonde' || w === 'blond') attrs.hair.color = attrs.hair.color || 'blonde';
    if (w === 'brunette') attrs.hair.color = attrs.hair.color || 'dark brown';
    if (w === 'redhead' || w === 'ginger' || w === 'red-haired') attrs.hair.color = 'ginger';
    if (w === 'long' && /^(beard|white beard|gray beard|grey beard)/.test(words.slice(i + 1, i + 3).join(' '))) attrs.facialHair = 'full';
    if (/^(beard|bearded)$/.test(w)) attrs.facialHair = attrs.facialHair || 'beard';
    if (w === 'mustache' || w === 'moustache') attrs.facialHair = attrs.facialHair || 'mustache';
    if (w === 'goatee') attrs.facialHair = 'goatee';
    if (w === 'stubble' || w === 'unshaven') attrs.facialHair = 'stubble';
    if (w2.trim() === 'clean shaven' || w === 'clean-shaven' || w === 'beardless') attrs.facialHair = 'none';
    if (/^(glowing|glow|luminous|shining|radiant|neon|bioluminescent|lit|illuminated|light-up|fluorescent|incandescent)$/.test(w)) attrs.flags.glow = true;
    if (/^(floating|levitating|hovering|flying|airborne)$/.test(w)) attrs.flags.float = true;
    if (/^(spinning|rotating|revolving|twirling)$/.test(w)) attrs.flags.spin = true;
    if (/^(transparent|translucent|see-through|clear|glassy|ghostly)$/.test(w)) attrs.flags.transparent = true;
    if (/^(broken|ruined|damaged|destroyed|abandoned|decaying|rusty|weathered|worn)$/.test(w)) attrs.flags.worn = true;
    if (/^(burning|flaming|on fire|fiery)$/.test(w)) attrs.flags.fire = true;
    if (/^(striped|stripy)$/.test(w)) attrs.flags.stripes = true;
    if (/^(spotted|spotty|dotted|polka)$/.test(w)) attrs.flags.spots = true;
    if (/^(plaid|tartan|checkered|chequered|flannel)$/.test(w)) attrs.flags.plaid = true;
    if (/^(autumn|fall|autumnal)$/.test(w)) attrs.flags.autumn = true;
    if (/^(winter|snowy|frozen|icy)$/.test(w)) attrs.flags.winter = true;
    if (/^(dead|withered|leafless|bare)$/.test(w)) attrs.flags.dead = true;
    if (/^(wild|feral)$/.test(w)) attrs.flags.wild = true;
    if (/^(pet|tame|domestic)$/.test(w)) attrs.flags.pet = true;
    if (/^(baby|young|juvenile|little|cub|puppy|kitten|foal|calf|lamb|chick)$/.test(w)) attrs.flags.young = true;
    if (/^(male|man|boy|he|him|his|gentleman|guy|mr)$/.test(w)) attrs.sex = attrs.sex || 'male';
    if (/^(female|woman|girl|she|her|lady|mrs|ms|miss)$/.test(w)) attrs.sex = attrs.sex || 'female';
    if (/^(lit|lights|illuminated)$/.test(w)) attrs.flags.lights = true;
    if (w === 'open') attrs.flags.open = true;
    if (w === 'empty') attrs.flags.empty = true;
  }
  if (/\bwith(?:out)? (?:no )?hair\b|\bno hair\b|\bhairless\b/.test(s)) attrs.hair.style = 'bald';
  // Hair colour bound through the colour parser.
  for (const c of attrs.colors) {
    if (c.part === 'hair') attrs.hair.color = hairColorName(c.word);
    if (c.part === 'eyes' || c.part === 'eye') attrs.eyeColor = c.word;
    if (c.part === 'skin') attrs.skinColor = c.color;
    if (c.part === 'beard') attrs.hair.beardColor = hairColorName(c.word);
  }
  if (attrs.hair.color === undefined) {
    const hm = s.match(/\b(black|brown|dark brown|light brown|blonde|blond|red|ginger|auburn|gray|grey|white|silver|platinum|golden|pink|blue|green|purple|chestnut|copper)\s+(?:and\s+\w+\s+)?(?:\w+\s+)?hair\b/);
    if (hm) attrs.hair.color = hairColorName(hm[1]);
  }
  // Clothing (with bound colours).
  const clothKeys = Object.keys(CLOTHING_WORDS).sort((a, b) => b.split(' ').length - a.split(' ').length);
  const used = new Set();
  for (const k of clothKeys) {
    const re = new RegExp(`\\b${k.replace(/[-]/g, '[- ]?').replace(/ /g, '\\s')}s?\\b`);
    const m = s.match(re);
    if (!m) continue;
    if ([...used].some((u) => u.includes(k))) continue;
    used.add(k);
    const [slot, type, extra] = CLOTHING_WORDS[k];
    // Colour for this item: a colour directly before it (bound to this part) or "X colored".
    let color = null;
    for (const c of attrs.colors) if (c.part && (c.part === k || c.part === singular(k) || k.includes(c.part) || c.part.includes(k.split(' ').pop()))) color = c.color;
    let pattern = null;
    const before = s.slice(0, m.index).trim().split(' ').slice(-2).join(' ');
    if (/plaid|checkered|tartan|flannel/.test(before)) pattern = 'plaid';
    if (/striped|stripy/.test(before)) pattern = 'stripes';
    attrs.clothing.push({ slot, type, color, pattern, ...(extra || {}), word: k });
  }
  // Features ("with large windows and a garden").
  const withM = s.match(/\b(?:with|has|having|featuring|including|plus)\s+(.+)$/);
  if (withM) {
    const tail = withM[1];
    for (const f of BUILDING_FEATURES) if (new RegExp(`\\b${f}\\b`).test(tail)) attrs.features.push(f);
    if (/\b(large|big|huge|floor[- ]to[- ]ceiling|panoramic|tall|wide) windows\b/.test(tail)) attrs.flags.bigWindows = true;
    if (/\b(no|few|small|tiny) windows\b/.test(tail)) attrs.flags.smallWindows = true;
    attrs.withCounts = {};
    for (const m of findAll(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|some|several)\s+([a-z]+)\b/, tail)) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (NUMBER_WORDS[m[1]] || 1);
      attrs.withCounts[singular(m[2])] = n;
    }
    // Companions: other creatable concepts in the tail that are not features.
    head = head || findHead(s);
    for (const h of scanConcepts(tail)) {
      if (!head || h.concept === head.concept) continue;
      if (isFeatureOf(h.concept, head.concept)) continue;
      if (head.concept.gen === 'building' && BUILDING_FEATURES.includes(h.phrase)) continue;
      // "with a fish tail", "with bat wings", "with a lion's mane": body parts, not companions.
      if (new RegExp(`\\b${h.phrase}(?:'s)?[\\s-]+(?:tails?|heads?|wings?|horns?|scales|fins?|ears?|eyes?|legs?|feet|paws|claws|fur|skin|mane|body|face|teeth|fangs|tusks|antlers|hooves)\\b`).test(tail)) continue;
      if (h.concept.id === 'baby' && ['animal', 'creature'].includes(head.concept.cat)) continue; // "a kangaroo with a baby"
      if (['character', 'animal', 'vehicle', 'robot', 'creature'].includes(h.concept.cat)) attrs.companions.push(h.concept.id);
    }
  }
  // "a knight riding a horse", "a girl walking a dog": the other creature comes along.
  const partM = s.match(/\b(riding|chasing|walking|hugging|pulling|guarding|feeding|petting|fighting|attacking|hunting|driving|piloting|playing with|followed by|accompanied by)\s+(.+)$/);
  if (partM) {
    head = head || findHead(s);
    for (const h of scanConcepts(partM[2])) {
      if (!head || h.concept === head.concept || isFeatureOf(h.concept, head.concept)) continue;
      if (['character', 'animal', 'vehicle', 'robot', 'creature'].includes(h.concept.cat) && !attrs.companions.includes(h.concept.id)) attrs.companions.push(h.concept.id);
    }
  }
  if (/\b(big|large|huge|floor[- ]to[- ]ceiling|panoramic|glass) windows\b/.test(s)) attrs.flags.bigWindows = true;
  if (/\bglass (house|walls|facade|building)\b/.test(s)) attrs.flags.glassy = true;

  // Head resolution (with fuzzy fallback).
  let concept = head ? head.concept : null;
  let fuzzy = null;
  if (!concept) {
    const isCand = (w) => !STOP.has(w) && !COLORS[w] && !SIZE_WORDS[w] && !STYLE_WORDS[w] && !MATERIAL_WORDS[w] && !AGE_WORDS[w] && !PERSONALITY_WORDS[w] && !/^\d/.test(w) && !/(ing|ly)$/.test(w);
    const bnd = (' ' + s + ' ').search(HEAD_BOUNDARY);
    const mainWords = (bnd > 0 ? (' ' + s).slice(0, bnd) : s).trim().split(' ').filter(Boolean);
    const mainCands = mainWords.filter(isCand), allCands = words.filter(isCand);
    for (const list of [mainCands, allCands]) {
      for (let k = list.length - 1; k >= 0 && !concept; k--) {
        const f = fuzzyConcept(list[k]) || fuzzyConcept(singular(list[k]));
        if (f) { concept = f.concept; fuzzy = { from: list[k], to: f.word }; }
      }
      if (concept) break;
    }
    if (!concept) {
      // Never refuse: interpret the unknown word (compounds, context, morphology, invention).
      const noun = mainCands[mainCands.length - 1] || allCands[allCands.length - 1] || words.filter((w) => !STOP.has(w)).pop() || 'thing';
      const res = interpretUnknown(noun, { lookup: lookupPhrase, materials: MATERIAL_WORDS, colors: COLORS, words, text: attrs.text });
      concept = res.concept;
      attrs.unknownNoun = noun;
      attrs.interpretation = res.reason;
      const pa = res.attrsPatch;
      if (pa) {
        if (pa.material) attrs.materials.unshift(pa.material);
        if (pa.color && !attrs.primaryColor) attrs.primaryColor = pa.color;
        if (pa.sizeMul) attrs.sizeMul *= pa.sizeMul;
        if (pa.textAppend) attrs.text += pa.textAppend;
      }
    }
  }
  // Archetype objects take their modifiers as a name ("a zorblax machine" -> "Zorblax machine").
  const params = { ...(concept.p || {}) };
  if (head && params.arche && !params.displayName) {
    const pre = words.slice(Math.max(0, head.start - 2), head.start).filter((w) => !STOP.has(w) && !COLORS[w] && !SIZE_WORDS[w] && !STYLE_WORDS[w] && !MATERIAL_WORDS[w] && !AGE_WORDS[w] && !PERSONALITY_WORDS[w] && !/^\d/.test(w) && !/^(glowing|floating|flying|spinning|shiny|old|new|big|small)$/.test(w));
    if (pre.length) { const nm = [...pre, head.phrase].join(' '); params.displayName = nm.charAt(0).toUpperCase() + nm.slice(1); }
  }
  // "a toy dragon", "a miniature castle": tabletop scale.
  if (head && ['toy', 'miniature', 'model'].includes(words[head.start - 1]) && !/toy|model|miniature/.test(head.phrase) && ['vehicle', 'animal', 'creature', 'building', 'robot', 'landmark', 'structure'].includes(concept.cat)) { attrs.sizeMul *= 0.08; attrs.flags.toy = true; }
  // Plural head implies count > 1 ("trees", "cats") when no count given.
  if (count === 1 && head && /s$/.test(head.phrase) && !/ss$/.test(head.phrase) && singular(head.phrase) !== head.phrase && !head.concept.words.includes(head.phrase.replace(/s$/, 's'))) {
    if (!['glasses', 'stairs', 'ruins', 'pants', 'jeans', 'dunes', 'hills', 'mountains', 'fireworks', 'letters', 'books', 'woods', 'stars', 'clouds', 'crystals', 'flowers', 'mushrooms', 'rocks', 'bushes', 'ferns', 'reeds', 'balloons', 'candles', 'logs', 'coins', 'sparkles', 'fireflies', 'butterflies', 'people', 'men', 'women', 'children', 'kids', 'sheep', 'deer', 'fish', 'moose', 'mice', 'geese', 'trees'].includes(head.phrase) || ['trees', 'people', 'men', 'women', 'children', 'kids', 'sheep', 'deer', 'fish', 'mice'].includes(head.phrase)) count = Math.max(count, head.phrase === 'trees' ? 5 : 3);
  }
  if (attrs.flags.float && !placement) attrs.placementFloat = true;
  return {
    concept: concept.id, gen: concept.gen, cat: concept.cat, icon: concept.icon, radius: concept.r || 1,
    params, attrs, count, placement, fuzzy, clause: clause.trim(), headPhrase: head ? head.phrase : (attrs.unknownNoun || null),
  };
}

function hairColorName(w) {
  const map = { blond: 'blonde', grey: 'gray', golden: 'golden', 'jet black': 'jet black' };
  return map[w] || w;
}

// "a man with the head of a wolf" / "a woman with a cat's head" -> "a wolf-headed man".
function rewriteAnimalHeads(s) {
  s = s.replace(/\b(cotton candy|bubble gum)\s+(?=[a-z])/g, (m, w) => w.replace(' ', '') + ' ');
  return s.replace(/\b(an?|the)?\s*([a-z][a-z ]*?)\s+with\s+(?:the|a|an)\s+(?:head of (?:an? |the )?([a-z]+)|([a-z]+)(?:'s)? head)\b/g, (m, art, who, a1, a2) => `${art ? art + ' ' : ''}${a1 || a2}-headed ${who}`.replace(/^an ([^aeiou])/, 'a $1').replace(/^a ([aeiou])/, 'an $1'));
}

export function parseCreation(body) {
  const clauses = splitClauses(rewriteAnimalHeads(body));
  const items = [];
  for (const c of clauses) {
    if (!c.trim()) continue;
    const e = parseEntity(c);
    items.push(e);
    // Companions ("a man with a dog") become extra entities next to the main one.
    for (const cid of e.attrs.companions) {
      const cc = CONCEPT_BY_ID.get(cid);
      if (!cc) continue;
      const comp = parseEntity(cc.words[0]);
      comp.placement = { mode: 'relative', rel: 'beside', ref: { pronoun: 'prev' } };
      comp.companionOf = e;
      items.push(comp);
    }
  }
  return items;
}
