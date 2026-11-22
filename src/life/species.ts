/**
 * The species of the three living worlds: what each animal is, how it moves and senses, what it eats, where it
 * lives, how it reacts to danger, and what the field codex says about it at each stage of study.
 *
 * Every creature here is an ORIGINAL SPECULATIVE DESIGN for the game, not a real or canonical organism. Sizes are
 * game design estimates. Codex statements carry a certainty label:
 *   Miller   OBSERVED (seen in the game world), HYPOTHESIS (working interpretation), UNKNOWN
 *   Mars, Jupiter   OBSERVED (real planetary measurement), INFERRED, HYPOTHETICAL, SPECULATIVE (game invention)
 */

export type Planet = 'miller' | 'mars' | 'jupiter';
export type Medium = 'water' | 'ground' | 'air' | 'sessile';
export type Locomotion = 'swim' | 'crawl' | 'ray' | 'burrow' | 'drift' | 'glide' | 'sessile' | 'swarm';
export type Archetype = 'grazer' | 'ambush' | 'trap' | 'lure' | 'pack' | 'builder' | 'defender' | 'filter' | 'apex' | 'clever' | 'producer' | 'colony';
export type Certainty = 'OBSERVED' | 'HYPOTHESIS' | 'UNKNOWN' | 'INFERRED' | 'HYPOTHETICAL' | 'SPECULATIVE';

/** how the rig is driven (see life/Rig.ts) */
export interface MotionDef {
  /** spine body wave: bending axis ('up' lateral, 'right' dorsoventral flukes), waves along the body, tail emphasis */
  wave?: { axis: 'up' | 'right'; waves: number; tail: number; amp: number; freq: number; headFix?: number };
  /** paired fins / wings: chain prefixes (left first) flapped about an axis */
  fins?: { l: string; r: string; axis: 'fwd' | 'up' | 'right'; amp: number; freq: number; lag?: number; bias?: number; scull?: boolean }[];
  /** legs: chain prefixes (L/R pairs, front to back), stride and gait */
  legs?: { prefix: string; pairs: number; stride: number; lift: number; gait: 'wave' | 'tripod'; hz: number };
  /** free chains (tentacles, lures, filaments, antennae) */
  chains?: { prefix: string; bend: number; wave: number; freq: number; axis?: 'up' | 'right' | 'fwd' | 'tan'; side?: number; jaw?: number }[];
  /** mouth */
  jaw?: { idle: number; open: number };
  /** bell pulse (jellies): spine scaled radially */
  pulse?: { freq: number; amp: number };
}

export interface CodexEntry { label: string; text: string; c: Certainty; level: number }

export interface SpeciesDef {
  id: string;
  planet: Planet;
  name: string;
  latin: string;
  /** asset path under public/assets (without .glb) */
  model: string;
  /** length of the model as built (m) and the adult range in the world (m, design estimate) */
  built: number;
  size: [number, number];
  /** Jupiter: the concept sheet's heroic scale (m), kept apart from the simulated body */
  artScale?: [number, number];
  medium: Medium;
  locomotion: Locomotion;
  archetype: Archetype;
  motion: MotionDef;
  /** m/s cruise and burst, turn rate (rad/s) at cruise, acceleration (m/s^2) */
  speed: { cruise: number; burst: number; turn: number; accel: number };
  /** sensing ranges (m) */
  senses: { vision?: number; flow?: number; chem?: number; electric?: number; sound?: number; thermal?: number; touch?: number };
  /** where it lives: habitat tags of the world (see life/habitats.ts) and depth / altitude band (m, below sea level positive) */
  habitat: { tags: string[]; depth?: [number, number] };
  population: number;
  group?: [number, number];
  /** a threat to people: reach (m) and how bad a contact is (0..1) */
  threat: { level: 'none' | 'low' | 'moderate' | 'high'; reach: number; harm: number };
  /** what it sounds like (for the sound designer of the codex) */
  sound: string;
  codex: CodexEntry[];
  /** codex 916.png panel id (Jupiter) */
  panel?: string;
}

const M = (label: string, text: string, c: Certainty, level = 2): CodexEntry => ({ label, text, c, level });

// =============================================================================================== MILLER
export const MILLER_SPECIES: SpeciesDef[] = [
  {
    id: 'ferracaris', planet: 'miller', name: 'Ferracaris', latin: 'Ferracaris depressa', model: 'creatures/miller/ferracaris',
    built: 0.26, size: [0.08, 0.3], medium: 'ground', locomotion: 'crawl', archetype: 'grazer',
    motion: { legs: { prefix: 'leg', pairs: 9, stride: 0.02, lift: 0.008, gait: 'wave', hz: 3.2 }, chains: [{ prefix: 'ant', bend: 0.2, wave: 0.3, freq: 1.3 }] },
    speed: { cruise: 0.03, burst: 0.12, turn: 1.6, accel: 0.4 },
    senses: { flow: 1.5, touch: 0.2, vision: 2 },
    habitat: { tags: ['rocks'], depth: [0, 3] },
    population: 60, group: [6, 14],
    threat: { level: 'none', reach: 0, harm: 0 },
    sound: 'Nearly silent: tiny leg scrapes and shell clicks at arm\'s length.',
    codex: [
      M('Role', 'A small plated grazer of wet rock in the shallows; the base of the visible food web.', 'OBSERVED', 1),
      M('Size', '8 to 30 cm long (game design estimate).', 'OBSERVED', 1),
      M('Anatomy', 'Flattened oval body under overlapping hard bands; nine pairs of short gripping legs hidden under the rim; a fringe of fine sensory filaments along every plate margin; a rasping mouth underneath.', 'OBSERVED', 2),
      M('Feeding', 'Scrapes the microbial film off rock; colonies leave pale cleaned trails behind them.', 'OBSERVED', 2),
      M('Tide response', 'Flattens and clamps down when the current rises, then retreats into fissures before the wave. Their sudden disappearance is a dependable early warning of dangerous water.', 'OBSERVED', 3),
      M('Energy', 'Grazes chemosynthetic films fed by water-rock reactions in the shallows; how much is photosynthetic under Gargantua\'s light is not known.', 'HYPOTHESIS', 3),
      M('Threat', 'Harmless to people. Clamps to rock or flees when touched.', 'OBSERVED', 1),
      M('Open questions', 'Reproduction: egg clusters in crevices are suspected but not yet seen.', 'UNKNOWN', 3),
    ],
  },
  {
    id: 'stalker', planet: 'miller', name: 'Abyssal Stalker', latin: 'Tenebrovenator milleri', model: 'creatures/miller/stalker',
    built: 6.5, size: [5, 8], medium: 'water', locomotion: 'swim', archetype: 'ambush',
    motion: {
      wave: { axis: 'up', waves: 0.9, tail: 2.6, amp: 0.55, freq: 0.55, headFix: 0.05 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.22, freq: 0.3, lag: 0.5, scull: true }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.16, freq: 0.3, lag: 0.5, scull: true }],
      jaw: { idle: 0.04, open: 0.75 },
    },
    speed: { cruise: 1.2, burst: 9, turn: 0.45, accel: 12 },
    senses: { flow: 12, vision: 18, electric: 1.5, chem: 30 },
    habitat: { tags: ['ledge', 'canyon'], depth: [15, 220] },
    population: 4,
    threat: { level: 'high', reach: 1.2, harm: 0.5 },
    sound: 'Deep pulsed rumbles, a tail sweep close by, the heavy movement of the jaw. No screaming.',
    codex: [
      M('Role', 'A large solitary ambush predator of the canyon edges.', 'OBSERVED', 1),
      M('Size', '5 to 8 m (game design estimate); older animals broader-headed and scarred.', 'OBSERVED', 2),
      M('Anatomy', 'Muscular eel-like body driven from the tail; a long flat wedge head with recessed eyes; two pairs of paddle fins for pitch, roll and braking; rows of backward-curved teeth for slippery prey.', 'OBSERVED', 2),
      M('Senses', 'Flow-sensing canals along the head and flank detect moving water first; at close range, pits round the jaws read weak electric fields (useless beyond a metre or two).', 'HYPOTHESIS', 3),
      M('Hunting', 'Holds still under an overhang, aligns with the current, and makes one tail-driven burst. A missed strike costs it dearly: it gives up rather than chase.', 'OBSERVED', 3),
      M('Tide response', 'Withdraws from exposed ledges into the deep canyon before the wave.', 'OBSERVED', 3),
      M('Threat', 'Dangerous at close range to anything prey-sized, including a diver. A sealed submersible is not food, but a startled or guarding animal may bite an exposed part. Keep distance from overhangs and prey-rich chokepoints.', 'OBSERVED', 2),
      M('Open questions', 'Breeding grounds and lifespan are unknown.', 'UNKNOWN', 4),
    ],
  },
];

export const SPECIES: Record<string, SpeciesDef> = {};
for (const s of MILLER_SPECIES) SPECIES[s.id] = s;
