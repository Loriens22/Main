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
  {
    id: 'maw', planet: 'miller', name: 'Sediment Maw', latin: 'Arenafaux vorax', model: 'creatures/miller/maw',
    built: 2.0, size: [1.2, 2.5], medium: 'sessile', locomotion: 'burrow', archetype: 'trap',
    motion: { chains: [{ prefix: 'lip', bend: 0, wave: 0.04, freq: 0.3, axis: 'tan', jaw: -1.1 }, { prefix: 'leg', bend: 0, wave: 0.08, freq: 0.2, axis: 'tan' }], jaw: { idle: 0, open: 1 } },
    speed: { cruise: 0, burst: 0, turn: 0, accel: 0 },
    senses: { flow: 3, touch: 1.2, chem: 6 },
    habitat: { tags: ['sand'], depth: [0, 4] },
    population: 7,
    threat: { level: 'moderate', reach: 1.1, harm: 0.35 },
    sound: 'A muffled snap, a short suction pulse, a puff of sand, then the water settling.',
    codex: [
      M('Role', 'A buried ambush predator of soft sediment in the shallows.', 'OBSERVED', 1),
      M('Size', 'Body 1.2 to 2.5 m across (game design estimate), almost all of it under the sand.', 'OBSERVED', 2),
      M('Anatomy', 'A flattened body that digs in with two pairs of ringed paddles; a wide ring-muscled mouth lined with radial folds opens on its upper side; the skin is crusted with sediment held in a biofilm.', 'OBSERVED', 2),
      M('Feeding', 'Expands its throat in a fraction of a second: a short suction pulse that draws small prey within about a metre into the mouth. It cannot swallow anything large; a person\'s foot can be gripped and they can be pulled off balance.', 'OBSERVED', 3),
      M('Detection', 'The mouth rim and the buried back carry touch and flow sensors. A scan shows the ring of muscle under the sand, and a faint ring pattern can be seen on the surface by a careful eye.', 'HYPOTHESIS', 3),
      M('Tide response', 'Burrows deeper as the current rises; some are washed out by the wave.', 'OBSERVED', 3),
      M('Threat', 'Moderate, local and avoidable: scan before walking in the sandy hollow, move slowly, step round the rings.', 'OBSERVED', 1),
      M('Open questions', 'How it breathes while buried is uncertain: valves at the mouth rim are suspected.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'siren', planet: 'miller', name: 'Luminous Siren', latin: 'Photomimus tenebris', model: 'creatures/miller/siren',
    built: 1.0, size: [0.6, 1.5], medium: 'water', locomotion: 'swim', archetype: 'lure',
    motion: {
      wave: { axis: 'up', waves: 1.1, tail: 2.2, amp: 0.4, freq: 0.9, headFix: 0.1 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.35, freq: 1.2, lag: 0.7, scull: true }],
      chains: [{ prefix: 'lure', bend: 0, wave: 0.25, freq: 0.6, axis: 'right', side: 0.2 }],
    },
    speed: { cruise: 0.25, burst: 2.5, turn: 1.4, accel: 6 },
    senses: { vision: 6, flow: 2 },
    habitat: { tags: ['cave'], depth: [20, 200] },
    population: 6,
    threat: { level: 'low', reach: 0.15, harm: 0.05 },
    sound: 'Almost silent: smooth fin undulation, a tiny snap when it feeds.',
    codex: [
      M('Role', 'A small cave predator that lures prey with light.', 'OBSERVED', 1),
      M('Size', '0.6 to 1.5 m (game design estimate).', 'OBSERVED', 2),
      M('Anatomy', 'A slender translucent body over an opaque dark gut; long membranous fins; a flexible stalk from the brow ending in a blue-green light organ.', 'OBSERVED', 2),
      M('Feeding', 'Hovers by a rock wall and moves the lure like a drifting food particle; small phototactic animals come to it and are taken in a short, quick strike.', 'OBSERVED', 3),
      M('Light', 'The glow is dimmed when no prey is about and when the animal is alarmed: light costs it energy.', 'HYPOTHESIS', 3),
      M('Tide response', 'Withdraws into a recess and darkens before the wave.', 'OBSERVED', 3),
      M('Threat', 'Harmless at a distance; handled, it may nip.', 'OBSERVED', 1),
      M('Open questions', 'Whether the light is its own chemistry or symbiotic bacteria is unknown.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'chorus', planet: 'miller', name: 'Chorus Hunter', latin: 'Sociovenator resonans', model: 'creatures/miller/chorus',
    built: 3.0, size: [2, 3.5], medium: 'water', locomotion: 'swim', archetype: 'pack',
    motion: {
      wave: { axis: 'up', waves: 0.8, tail: 2.8, amp: 0.45, freq: 0.7, headFix: 0.08 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.12, freq: 0.5, lag: 0.4, scull: true }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.1, freq: 0.5, lag: 0.4 }],
      jaw: { idle: 0.02, open: 0.5 },
    },
    speed: { cruise: 2.2, burst: 8, turn: 0.9, accel: 7 },
    senses: { vision: 20, sound: 90, flow: 8 },
    habitat: { tags: ['canyon'], depth: [20, 230] },
    population: 6, group: [5, 6],
    threat: { level: 'moderate', reach: 0.6, harm: 0.25 },
    sound: 'Click trains for echolocation, individual contact calls, denser calling during a hunt.',
    codex: [
      M('Role', 'Social, sound-communicating predators of the deep channels.', 'OBSERVED', 1),
      M('Size', '2 to 3.5 m (game design estimate); groups of three to eight.', 'OBSERVED', 2),
      M('Anatomy', 'A long narrow beak with fine teeth, small eyes, a row of sound-emitting organs along the snout; long pectoral fins for precise turns; a crescent tail.', 'OBSERVED', 2),
      M('Sensing', 'Short click trains locate structure and prey a few tens of metres off; echoes are shadowed by rock and blurred by noise. Contact calls keep the group together.', 'HYPOTHESIS', 3),
      M('Hunting', 'Loose flanking round a school, one animal attacking and the others taking the scattered fish. Many hunts fail.', 'OBSERVED', 3),
      M('Tide response', 'Calls become denser; the group regroups and moves into a deeper corridor.', 'OBSERVED', 3),
      M('Threat', 'They investigate a submersible and may nudge a drone, but a large metal hull is not prey.', 'OBSERVED', 2),
      M('Open questions', 'Whether calls carry identity as well as position is suspected, not shown.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'architect', planet: 'miller', name: 'Rift Architect', latin: 'Lithoarchitectus profundus', model: 'creatures/miller/architect',
    built: 1.7, size: [0.8, 1.8], medium: 'ground', locomotion: 'crawl', archetype: 'builder',
    motion: { legs: { prefix: 'leg', pairs: 3, stride: 0.22, lift: 0.08, gait: 'tripod', hz: 1.6 }, chains: [{ prefix: 'ant', bend: 0.1, wave: 0.2, freq: 0.8 }, { prefix: 'arm', bend: 0.05, wave: 0.15, freq: 0.6 }] },
    speed: { cruise: 0.25, burst: 0.9, turn: 1.0, accel: 1.2 },
    senses: { vision: 6, touch: 1.0, chem: 15, flow: 4 },
    habitat: { tags: ['vent'], depth: [30, 160] },
    population: 4,
    threat: { level: 'low', reach: 0.9, harm: 0.15 },
    sound: 'Clacks of stone on stone, leg taps, small scrapes.',
    codex: [
      M('Role', 'A dextrous builder of the mineral rifts; omnivore.', 'OBSERVED', 1),
      M('Size', '0.8 to 1.8 m across the legs (game design estimate).', 'OBSERVED', 2),
      M('Anatomy', 'A broad plated carapace with a serrated margin; six walking legs and two fine manipulators with three-fingered grips; four small eyes, palps and mouth bristles.', 'OBSERVED', 2),
      M('Building', 'Selects flat stones and shell pieces and sets them in a wall round an egg crevice; repairs the wall after the wave displaces it.', 'OBSERVED', 3),
      M('Diet', 'Microbial mats and small animals near the vents, and scavenging. It does not eat rock.', 'HYPOTHESIS', 3),
      M('Defence', 'Raises its front, taps and scrapes, and grabs at an intruder close to the eggs; it does not pursue.', 'OBSERVED', 3),
      M('Threat', 'Low, near the nest only.', 'OBSERVED', 1),
      M('Open questions', 'How much of the construction is learned is unknown. There is no evidence of tool making beyond placing stones.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'breaker', planet: 'miller', name: 'Breaker Shield', latin: 'Thalassotitan loricatus', model: 'creatures/miller/breaker',
    built: 3.0, size: [2, 4], medium: 'ground', locomotion: 'crawl', archetype: 'defender',
    motion: { legs: { prefix: 'leg', pairs: 3, stride: 0.6, lift: 0.18, gait: 'tripod', hz: 0.7 } },
    speed: { cruise: 0.18, burst: 1.2, turn: 0.5, accel: 0.8 },
    senses: { flow: 8, vision: 10, chem: 12, touch: 1.5 },
    habitat: { tags: ['shelf'], depth: [0, 5] },
    population: 3,
    threat: { level: 'moderate', reach: 1.6, harm: 0.3 },
    sound: 'Heavy armour scraping on rock, low knocks through the substrate, body shifts.',
    codex: [
      M('Role', 'A massive armoured shoreline browser and scavenger.', 'OBSERVED', 1),
      M('Size', '2 to 4 m (game design estimate).', 'OBSERVED', 2),
      M('Anatomy', 'A low broad body under overlapping mineralised plates, a large front shield over a small head with feelers, six short thick limbs with claws for wet stone.', 'OBSERVED', 2),
      M('Feeding', 'Grazes biofilm and takes sessile prey and carrion with crushing mouth plates.', 'OBSERVED', 3),
      M('Nesting', 'Lays eggs in sheltered notches of the outcrops and stays near them.', 'OBSERVED', 3),
      M('Defence', 'Turns its shield toward a threat, braces, knocks on the rock; if the intruder stays close it shoves or lunges a short distance, then stops.', 'OBSERVED', 3),
      M('Tide response', 'Abandons any confrontation, lowers into a notch in the rock and holds on.', 'OBSERVED', 3),
      M('Threat', 'It can knock a person down. Keep clear of the space between an adult and its eggs.', 'OBSERVED', 1),
    ],
  },
  {
    id: 'cathedral', planet: 'miller', name: 'Abyssal Cathedral', latin: 'Pelagocrypta colossalis', model: 'creatures/miller/cathedral',
    built: 15, size: [12, 18], medium: 'water', locomotion: 'ray', archetype: 'filter',
    motion: {
      wave: { axis: 'right', waves: 0.5, tail: 2.0, amp: 0.12, freq: 0.12, headFix: 0.3 },
      fins: [{ l: 'wingL', r: 'wingR', axis: 'fwd', amp: 0.45, freq: 0.12, lag: 0.6 }],
    },
    speed: { cruise: 1.2, burst: 3, turn: 0.12, accel: 0.3 },
    senses: { vision: 40, flow: 30, sound: 200 },
    habitat: { tags: ['basin'], depth: [40, 220] },
    population: 2,
    threat: { level: 'low', reach: 0, harm: 0 },
    sound: 'Huge slow fin displacement; barely audible low internal pulses.',
    codex: [
      M('Role', 'A giant filter feeder of the deep basin; not a predator.', 'OBSERVED', 1),
      M('Size', '12 to 18 m (game design estimate), feasible only with dense plankton.', 'OBSERVED', 2),
      M('Anatomy', 'A broad body with long winglike fins on a thick leading edge; a vast mouth lined with pale filter lamellae; cranial ridges; lines of light along the underside.', 'OBSERVED', 2),
      M('Feeding', 'Slow passes through plankton blooms with the mouth open, water leaving through slits behind the head.', 'OBSERVED', 3),
      M('Light', 'The underside lines may help it vanish against the faint light above (counter-illumination) or let others recognise it. Each animal\'s pattern is its own.', 'HYPOTHESIS', 3),
      M('Tide response', 'Avoids the shoals and stays in the deep basin; it turns slowly.', 'OBSERVED', 3),
      M('Threat', 'Not aggressive. Danger is collision with something this massive, its fin wake, or drifting too close to the feeding current.', 'OBSERVED', 2),
      M('Open questions', 'Parental care and migration routes are unknown.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'crown', planet: 'miller', name: 'Gargantuan Crown', latin: 'Apexvenator gargantuae', model: 'creatures/miller/crown',
    built: 10.4, size: [8, 11], medium: 'water', locomotion: 'swim', archetype: 'apex',
    motion: {
      wave: { axis: 'up', waves: 0.7, tail: 2.8, amp: 0.3, freq: 0.25, headFix: 0.05 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.08, freq: 0.2, lag: 0.4, scull: true }],
      jaw: { idle: 0.03, open: 0.6 },
    },
    speed: { cruise: 1.3, burst: 7, turn: 0.22, accel: 3 },
    senses: { vision: 25, flow: 30, chem: 120, sound: 150 },
    habitat: { tags: ['basin'], depth: [60, 230] },
    population: 1,
    threat: { level: 'high', reach: 2.6, harm: 0.7 },
    sound: 'Rare deep resonances, the heavy rush of its acceleration, the impulse of the jaws closing.',
    codex: [
      M('Role', 'The rare apex predator of the deep basin.', 'OBSERVED', 1),
      M('Size', '8 to 11 m (game design estimate); very few individuals.', 'OBSERVED', 2),
      M('Anatomy', 'A massive streamlined body; a wide skull carrying a crown of mineralised ridges and spines over the sensory pits; huge jaws with thick hooked teeth; barbels under the chin.', 'OBSERVED', 2),
      M('The crown', 'Protects the sensory structures of the brow; its size may also signal to rivals.', 'HYPOTHESIS', 3),
      M('Hunting', 'Long calm patrols; a short, very powerful burst at large prey; gives up if the prey escapes or fights back.', 'OBSERVED', 3),
      M('Behaviour toward vehicles', 'Investigates, often passing below; contact is most likely if it is feeding, cornered or harmed.', 'OBSERVED', 3),
      M('Tide response', 'Abandons a hunt and moves to safe deep water.', 'OBSERVED', 3),
      M('Threat', 'High at close range. Make distance, stay out of its feeding zone, do not follow it.', 'OBSERVED', 1),
    ],
  },
  {
    id: 'mimic', planet: 'miller', name: 'Mimic Crawler', latin: 'Cryptomorphus sapiens', model: 'creatures/miller/mimic',
    built: 2.4, size: [1.5, 2.8], medium: 'ground', locomotion: 'crawl', archetype: 'clever',
    motion: { legs: { prefix: 'arm', pairs: 4, stride: 0.3, lift: 0.1, gait: 'wave', hz: 1.0 } },
    speed: { cruise: 0.3, burst: 1.6, turn: 1.2, accel: 2 },
    senses: { vision: 14, touch: 1.2, chem: 10, flow: 3 },
    habitat: { tags: ['maze', 'rocks'], depth: [0, 120] },
    population: 3,
    threat: { level: 'moderate', reach: 1.2, harm: 0.3 },
    sound: 'Sucker detachments, plates scraping, short pulses through the rock.',
    codex: [
      M('Role', 'The most behaviourally flexible animal yet seen here: a clever benthic hunter and omnivore.', 'OBSERVED', 1),
      M('Size', '1.5 to 2.8 m with arms spread (game design estimate).', 'OBSERVED', 2),
      M('Anatomy', 'A plated mantle over a soft body; eight independent arms with suckers in two rows and a hook at each tip; large eyes under brow ridges.', 'OBSERVED', 2),
      M('Camouflage', 'Changes colour and raises skin papillae to match the rock; the patterns ripple across the arms with a visible delay.', 'OBSERVED', 3),
      M('Intelligence', 'Watches unfamiliar equipment before touching it, remembers places and dangers, and handles loose objects.', 'OBSERVED', 3),
      M('Defence', 'High-contrast warning patterns and spread arms first; a grapple only at arm\'s reach.', 'OBSERVED', 3),
      M('Threat', 'Fascinating if watched from a distance; dangerous if cornered.', 'OBSERVED', 1),
      M('Open questions', 'How long it remembers individuals and objects is not known.', 'UNKNOWN', 4),
    ],
  },
];

export const SPECIES: Record<string, SpeciesDef> = {};
for (const s of MILLER_SPECIES) SPECIES[s.id] = s;
