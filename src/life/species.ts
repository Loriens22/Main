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
export type Archetype = 'grazer' | 'ambush' | 'trap' | 'lure' | 'pack' | 'builder' | 'defender' | 'filter' | 'apex' | 'clever' | 'producer' | 'colony'
  | 'hermit' | 'stalkcam' | 'drifter' | 'glider' | 'swarm' | 'hunter' | 'beast';
export type Certainty = 'OBSERVED' | 'HYPOTHESIS' | 'UNKNOWN' | 'INFERRED' | 'HYPOTHETICAL' | 'SPECULATIVE';

/** how the rig is driven (see life/Rig.ts) */
export interface MotionDef {
  /** spine body wave: bending axis ('up' lateral, 'right' dorsoventral flukes), waves along the body, tail emphasis */
  wave?: { axis: 'up' | 'right'; waves: number; tail: number; amp: number; freq: number; headFix?: number };
  /** paired fins / wings: chain prefixes (left first) flapped about an axis */
  fins?: { l: string; r: string; axis: 'fwd' | 'up' | 'right'; amp: number; freq: number; lag?: number; bias?: number; scull?: boolean; ph0?: number }[];
  /** legs: chain prefixes (L/R pairs, front to back), stride and gait */
  legs?: { prefix: string; pairs: number; stride: number; lift: number; gait: 'wave' | 'tripod'; hz: number };
  /** free chains (tentacles, lures, filaments, antennae) */
  chains?: { prefix: string; bend: number; wave: number; freq: number; axis?: 'up' | 'right' | 'fwd' | 'tan'; side?: number; jaw?: number; disp?: number }[];
  /** chains whose bones swell with `display` (membranes opening), with a slow breathing */
  swell?: { prefix: string; amp: number; freq: number };
  /** legs drawn in under the body when hidden (curling up) */
  tuck?: number;
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
  /** where it lives: habitat tags of the world and depth band (m, below sea level positive); for flyers, the
   *  altitude corridor (m, relative to the station deck) it can survive in */
  habitat: { tags: string[]; depth?: [number, number]; alt?: [number, number] };
  population: number;
  group?: [number, number];
  /** a threat to people: reach (m) and how bad a contact is (0..1) */
  threat: { level: 'none' | 'low' | 'moderate' | 'high'; reach: number; harm: number };
  /** what it sounds like (for the sound designer of the codex) */
  sound: string;
  codex: CodexEntry[];
  /** codex 916.png panel id (Jupiter) */
  panel?: string;
  /** a hypothetical organism that only exists in the speculative-evolution science mode */
  speculative?: boolean;
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


// =============================================================================================== MARS
// Every Mars species is an ORIGINAL HYPOTHETICAL SPECIES of a fictional alternate history: no life of any kind has
// been found on Mars. Planetary facts carry OBSERVED; the game's assumptions INFERRED / HYPOTHETICAL / SPECULATIVE.
const MARS_FACT = M('Mars today', 'Surface gravity 3.71 m/s² (0.38 g); a thin CO₂ atmosphere of a few millibars in which liquid water does not last; cold, dry, irradiated, with oxidising perchlorate salts in the soil. No life has been found.', 'OBSERVED', 2);
const CAVE_NOTE = M('Setting', 'The cave system, its pressurised chambers and its lakes are a game alternate-history extension. Water may exist deep in the mid-crust (InSight seismic studies), but no open caverns or lakes are known.', 'SPECULATIVE', 2);

export const MARS_SPECIES: SpeciesDef[] = [
  {
    id: 'icebloom', planet: 'mars', name: 'Crimson Icebloom', latin: 'Cryoflora sanguinea', model: 'creatures/mars/icebloom', speculative: true,
    built: 1.6, size: [0.8, 1.8], medium: 'sessile', locomotion: 'sessile', archetype: 'producer',
    motion: { swell: { prefix: 'ros', amp: 0.16, freq: 0.04 } },
    speed: { cruise: 0, burst: 0, turn: 0, accel: 0 },
    senses: { touch: 0.2 },
    habitat: { tags: ['icewindow'] },
    population: 3,
    threat: { level: 'none', reach: 0, harm: 0 },
    sound: 'Silent. Under the microphone of a contact probe: the faint tick of ice and of membranes contracting.',
    codex: [
      M('Role', 'A colonial phototroph in a melt pocket behind clear ice: the primary producer of the cave\'s upper levels.', 'SPECULATIVE', 1),
      M('Size', 'Rosettes from a few centimetres to linked patches about 2 m across.', 'SPECULATIVE', 2),
      M('Anatomy', 'Layered rosettes of thin translucent lamellae (not petals: gel-supported sheets of tissue and microbial matrix), with capillary veins from dark basal patches to shimmering edges; pigmented nodules round each attachment face.', 'SPECULATIVE', 2),
      M('Light and ice', 'Sunlight filtered through ice reaches the pocket; the ice cuts the ultraviolet and holds liquid films against the rock.', 'INFERRED', 3),
      M('Metabolism', 'Photosynthesis would need a carbon source and suitable redox chemistry, not just red pigment; growth only in warm, wet periods; dormant through cold and dry ones.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'Lamellae open slowly over seasons when light and water allow; touched, the fragile sheets tear, bead fluid and close.', 'SPECULATIVE', 3),
      MARS_FACT, CAVE_NOTE,
      M('Open questions', 'How it disperses between melt pockets: resistant propagules are suspected.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'ferric', planet: 'mars', name: 'Ferric Cathedral', latin: 'Ferricorallium profundum', model: 'creatures/mars/ferric', speculative: true,
    built: 2.0, size: [0.6, 2.6], medium: 'sessile', locomotion: 'sessile', archetype: 'colony',
    motion: { chains: [{ prefix: 'tip', bend: 0, wave: 0.03, freq: 0.25, axis: 'right', disp: -0.9 }] },
    speed: { cruise: 0, burst: 0, turn: 0, accel: 0 },
    senses: { touch: 1.0, chem: 3, flow: 2.5 },
    habitat: { tags: ['seep'] },
    population: 6,
    threat: { level: 'none', reach: 0, harm: 0 },
    sound: 'Gurgles of seep water through the branches; tiny gas bubbles breaking.',
    codex: [
      M('Role', 'An anchored chemosynthetic colony at warm mineral seeps: a mineral skeleton raised by living tissue and its symbionts. Shelter and food for most of the hall\'s fauna.', 'SPECULATIVE', 1),
      M('Size', 'Branching assemblages from 0.2 to about 3 m, clustered into groves.', 'SPECULATIVE', 2),
      M('Anatomy', 'Buttressed trunks of dark scarlet and iron-black precipitate, branching with true joints; living velvet tissue on the growing tips, combed into feeding filaments; vesicles along the branches.', 'SPECULATIVE', 2),
      M('Chemistry', 'Water-rock reactions supply electron donors; an oxidant-bearing flow must reach it as well: it cannot simply "eat iron". Precipitating the skeleton costs energy and minerals.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'Draws in its living tips at vibration, thruster wash or contamination; seals broken surfaces slowly. Groves mark a stable, productive seep.', 'SPECULATIVE', 3),
      M('Care', 'Drills and thrusters damage it. Keep the ROV off the branches.', 'INFERRED', 3),
      MARS_FACT, CAVE_NOTE,
    ],
  },
  {
    id: 'ribbon', planet: 'mars', name: 'Glass Ribbon', latin: 'Vitreoserpens halophilus', model: 'creatures/mars/ribbon', speculative: true,
    built: 0.45, size: [0.15, 0.6], medium: 'water', locomotion: 'swim', archetype: 'grazer',
    motion: { wave: { axis: 'right', waves: 1.6, tail: 1.0, amp: 0.4, freq: 1.4, headFix: 0.2 } },
    speed: { cruise: 0.06, burst: 0.45, turn: 2.0, accel: 1.2 },
    senses: { flow: 1.5, touch: 0.2, chem: 3 },
    habitat: { tags: ['shallows'] },
    population: 22, group: [5, 8],
    threat: { level: 'none', reach: 0, harm: 0 },
    sound: 'None that carries; the hydrophone hears the scrape of a feeding colony on the mineral film.',
    codex: [
      M('Role', 'A delicate transparent grazer of the microbial films on the ferric minerals: the hall\'s commonest prey.', 'SPECULATIVE', 1),
      M('Size', '15 to 60 cm long.', 'SPECULATIVE', 2),
      M('Anatomy', 'A flat hydrated ribbon (not glass) on fine transverse strands, two rippling fin edges, a violet central organ tract, a narrow sensory tip and a small ventral scraping mouth.', 'SPECULATIVE', 2),
      M('Behaviour', 'Travels by a wave along its fins, follows walls through cracks; at vibration a whole group folds and slides into fissures.', 'SPECULATIVE', 3),
      M('Bioindicator', 'If the ribbons vanish into the cracks at once, something is hunting nearby, or the flow has changed.', 'INFERRED', 3),
      MARS_FACT, CAVE_NOTE,
    ],
  },
  {
    id: 'prism', planet: 'mars', name: 'Prism Architect', latin: 'Crystallofaber martianus', model: 'creatures/mars/prism', speculative: true,
    built: 1.0, size: [0.6, 1.4], medium: 'ground', locomotion: 'crawl', archetype: 'builder',
    motion: {
      legs: { prefix: 'leg', pairs: 3, stride: 0.14, lift: 0.04, gait: 'tripod', hz: 1.4 },
      chains: [{ prefix: 'ant', bend: 0.1, wave: 0.15, freq: 1.1 }, { prefix: 'arm', bend: 0.25, wave: 0.12, freq: 0.5, axis: 'up' }],
    },
    speed: { cruise: 0.18, burst: 0.8, turn: 1.4, accel: 1.2 },
    senses: { vision: 6, touch: 0.6, chem: 6, sound: 15 },
    habitat: { tags: ['shore'] },
    population: 3,
    threat: { level: 'low', reach: 0.45, harm: 0.15 },
    sound: 'Dry clicks of its plates; underwater, short pulses when it defends the nest.',
    codex: [
      M('Role', 'An intelligent benthic manipulator and opportunistic omnivore that builds walled nests of selected fragments.', 'SPECULATIVE', 1),
      M('Size', '0.6 to 1.4 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'Broad and low, under overlapping iridescent copper-blue-purple plates with worn seams; six gripping legs and two fine arms with opposable three-digit grips; a row of simple eyes under the shield rim; a narrow feeding aperture with scrapers.', 'SPECULATIVE', 2),
      M('Building', 'Chooses durable fragments, carries them home, sorts them by shape and seals the wall with a secreted adhesive; it repairs what is disturbed.', 'SPECULATIVE', 3),
      M('Defence', 'Freezes and orients first; then spreads its plates, raises its arms and clicks; it lunges with a short grapple only at an intruder closing on its eggs. Its claws cannot hurt a hull.', 'SPECULATIVE', 3),
      MARS_FACT, CAVE_NOTE,
      M('Open questions', 'Whether parents learn to ignore recurring research equipment.', 'UNKNOWN', 4),
    ],
  },
  {
    id: 'ghost', planet: 'mars', name: 'Ghost of Valles', latin: 'Umbrovelum lucens', model: 'creatures/mars/ghost', speculative: true,
    built: 2.0, size: [1.5, 2.5], medium: 'water', locomotion: 'ray', archetype: 'ambush',
    motion: {
      wave: { axis: 'right', waves: 0.4, tail: 1.6, amp: 0.08, freq: 0.3, headFix: 0.3 },
      fins: [0, 1, 2, 3].map((k) => ({ l: `wL${k}_`, r: `wR${k}_`, axis: 'fwd' as const, amp: 0.32, freq: 0.3, lag: 0.5, ph0: -k * 0.8 })),
      chains: [{ prefix: 'tail', bend: 0, wave: 0.25, freq: 0.4, axis: 'right' }, { prefix: 'tp', bend: 0, wave: 0.2, freq: 0.5, axis: 'right' }],
    },
    speed: { cruise: 0.4, burst: 3.5, turn: 0.7, accel: 4 },
    senses: { flow: 8, vision: 6, touch: 0.5 },
    habitat: { tags: ['lake'] },
    population: 3,
    threat: { level: 'moderate', reach: 0.5, harm: 0.25 },
    sound: 'Near silence: soft thumps and the flutter of its membranes in the water.',
    codex: [
      M('Role', 'An ambush hunter of the brine reservoirs, gliding above the cathedral groves after glass ribbons and juvenile cave animals.', 'SPECULATIVE', 1),
      M('Size', '1.5 to 2.5 m across the wings.', 'SPECULATIVE', 2),
      M('Anatomy', 'A flattened visceral body inside broad translucent silver-lilac wings with asymmetric branching veins; small recessed eyes, pressure-receptor pits, a small clasping mouth underneath, trailing sensory filaments.', 'SPECULATIVE', 2),
      M('Hunting', 'Senses pressure waves from moving prey; compresses its wings and pauses before a short lunge and an underside clasp. A miss costs it energy and it does not chase.', 'SPECULATIVE', 3),
      M('Threat', 'Not a danger to a diver or vehicle; it may bite at a small ROV appendage if crowded. Quiet thrusters and distance keep it in view.', 'SPECULATIVE', 3),
      MARS_FACT, CAVE_NOTE,
    ],
  },
  {
    id: 'bmimic', planet: 'mars', name: 'Basalt Mimic', latin: 'Cryptolithus tenebris', model: 'creatures/mars/bmimic', speculative: true,
    built: 2.0, size: [1.4, 2.6], medium: 'ground', locomotion: 'crawl', archetype: 'stalkcam',
    motion: {
      legs: { prefix: 'leg', pairs: 3, stride: 0.34, lift: 0.07, gait: 'tripod', hz: 1.1 },
      wave: { axis: 'up', waves: 0.6, tail: 1.4, amp: 0.1, freq: 0.5, headFix: 0.4 },
      jaw: { idle: 0.0, open: 0.55 },
    },
    speed: { cruise: 0.35, burst: 3.2, turn: 1.1, accel: 6 },
    senses: { vision: 10, touch: 1.0, chem: 12, flow: 4, thermal: 3 },
    habitat: { tags: ['crevice'] },
    population: 2,
    threat: { level: 'high', reach: 0.8, harm: 0.5 },
    sound: 'Ground clicks and a hiss when exposed; the scrape of its plates as it repositions.',
    codex: [
      M('Role', 'A six-limbed ambush predator of the damp pressurised galleries, hunting from crevices beside prey paths: one of the cave\'s dangerous animals.', 'SPECULATIVE', 1),
      M('Size', '1.4 to 2.6 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'Squat and broad; a triangular rock-flat head set into the dorsal armour; irregular mineralised shields over granular near-black skin mottled rust-orange; small amber eyes under the brow; sensing lines along the flanks; short hooking digits.', 'SPECULATIVE', 2),
      M('Camouflage', 'Pigment cells and raised skin papillae match the rock under the light there is; it does not become stone and a scanner sees its warmth and texture.', 'SPECULATIVE', 3),
      M('Hunting', 'Anchors, waits for vibration or scent, approaches only undetected, then a short coiled leap, a forelimb latch and a bite; after a miss it disengages. Watch for muscle tension and a change of skin pattern before it moves.', 'SPECULATIVE', 3),
      M('Threat', 'Dangerous at close range. It prefers prey far smaller than a person; keep lights on the walls and distance from crevices.', 'SPECULATIVE', 2),
      MARS_FACT, CAVE_NOTE,
    ],
  },
  {
    id: 'hermit', planet: 'mars', name: 'Red Dune Hermit', latin: 'Noctovagans hermeticus', model: 'creatures/mars/hermit', speculative: true,
    built: 0.32, size: [0.15, 0.45], medium: 'ground', locomotion: 'crawl', archetype: 'hermit',
    motion: { legs: { prefix: 'leg', pairs: 3, stride: 0.05, lift: 0.015, gait: 'tripod', hz: 3 }, chains: [{ prefix: 'mouth', bend: 0, wave: 0.15, freq: 1.2 }], tuck: 1.2 },
    speed: { cruise: 0.05, burst: 0.2, turn: 1.6, accel: 0.6 },
    senses: { touch: 2.5, vision: 3, thermal: 2 },
    habitat: { tags: ['surface'] },
    population: 2,
    threat: { level: 'none', reach: 0.08, harm: 0.02 },
    sound: 'Nothing through the thin air; by contact microphone, the tick of its legs on the rock.',
    codex: [
      M('Role', 'An extremely rare, brief surface traveller between two pressurised underground entrances: the most speculative adaptation of the whole expansion.', 'SPECULATIVE', 1),
      M('Size', '15 to 45 cm.', 'SPECULATIVE', 2),
      M('Anatomy', 'A low domed shell of nested pitted plates, dust-coated; six squat pointed legs under the rim; retractable mouthparts; recessed receptor pits. At rest it is a small rock.', 'SPECULATIVE', 2),
      M('Physiology', 'A sealed internal water system, desiccation barriers and finite stored energy; it cannot breathe Martian air. Excursions last minutes in the mildest hours.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'Emerges at dawn or dusk, crosses a few metres of open ground between cracks, curls up at vibration, strong sun or cold, and goes back underground.', 'SPECULATIVE', 3),
      MARS_FACT,
    ],
  },
  {
    id: 'serpent', planet: 'mars', name: 'Thermal Rift Serpent', latin: 'Fissurovenator thermalis', model: 'creatures/mars/serpent', speculative: true,
    built: 3.2, size: [2.5, 4.0], medium: 'water', locomotion: 'swim', archetype: 'ambush',
    motion: {
      wave: { axis: 'up', waves: 1.0, tail: 2.2, amp: 0.5, freq: 0.6, headFix: 0.1 },
      fins: [{ l: 'legL0_', r: 'legR0_', axis: 'up', amp: 0.25, freq: 0.6, lag: 0.3, scull: true }, { l: 'legL1_', r: 'legR1_', axis: 'up', amp: 0.2, freq: 0.6, lag: 0.3, scull: true }],
      jaw: { idle: 0.02, open: 0.6 },
    },
    speed: { cruise: 0.5, burst: 5, turn: 0.6, accel: 7 },
    senses: { thermal: 6, flow: 8, touch: 1.0, vision: 5 },
    habitat: { tags: ['channel'] },
    population: 1,
    threat: { level: 'high', reach: 1.0, harm: 0.55 },
    sound: 'A low growl as a pressure pulse through the water; claws dragging on rock; a sudden swirl.',
    codex: [
      M('Role', 'An apex predator of the warm geothermal channel, station-keeping in the flow shadow and striking at passing prey.', 'SPECULATIVE', 1),
      M('Size', '2.5 to 4 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A long wet black and rust-copper body, broad low head with whiskers and thermosensory pores, four short clawed limbs, a flattened swimming tail with fin crests, mineral-encrusted patches along the back.', 'SPECULATIVE', 2),
      M('Senses', 'Thermal pits find warm-water prey paths; they cannot see through rock.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'A single powerful acceleration from rest, a jaw grip, then back to cover. A vehicle in its channel is investigated, then warned with a widened jaw and coiled body, then shoved.', 'SPECULATIVE', 3),
      M('Threat', 'Dangerous at close range. Stay out of the warm stream or keep to passages too narrow for it.', 'SPECULATIVE', 2),
      MARS_FACT, CAVE_NOTE,
    ],
  },
  {
    id: 'monarch', planet: 'mars', name: 'Subglacial Monarch', latin: 'Cryopelagor rex', model: 'creatures/mars/monarch', speculative: true,
    built: 5.0, size: [4, 6], medium: 'water', locomotion: 'swim', archetype: 'apex',
    motion: {
      wave: { axis: 'up', waves: 0.8, tail: 2.4, amp: 0.42, freq: 0.35, headFix: 0.05 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.18, freq: 0.25, lag: 0.4, scull: true }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.12, freq: 0.25, lag: 0.4, scull: true }],
      jaw: { idle: 0.03, open: 0.7 },
    },
    speed: { cruise: 0.8, burst: 6, turn: 0.35, accel: 5 },
    senses: { flow: 20, vision: 12, sound: 120, electric: 2 },
    habitat: { tags: ['basin'] },
    population: 1,
    threat: { level: 'high', reach: 1.6, harm: 0.6 },
    sound: 'Long, delayed low-frequency sounds through the water; no roaring.',
    codex: [
      M('Role', 'A rare superpredator of the subglacial basin under the ice shelf: the most speculative of the Mars megafauna.', 'SPECULATIVE', 1),
      M('Size', '4 to 6 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A massive streamlined black-blue body, a broad low skull with small dark eyes and large grasping jaws, big lateral stabiliser fins, a heavy lunate tail; pale underneath; ivory scars on the back, gill channels, old pitted injuries.', 'SPECULATIVE', 2),
      M('Energetics', 'A predator this size needs a large, physically consistent food web and strong redox fluxes: only a handful could live in a basin, with long rests and rare hunts.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'Patrols, approaches a vehicle side-on, makes one pass below it and turns away; attacks only when threatened, when prey cues are right, or near its brood.', 'SPECULATIVE', 3),
      MARS_FACT, CAVE_NOTE,
      M('Open questions', 'Breeding, lifespan, and whether more than one lives in the basin.', 'UNKNOWN', 4),
    ],
  },
];


// =============================================================================================== JUPITER
// After the user's 3x3 concept sheet (916.png), panels 01-09. ORIGINAL HYPOTHETICAL SPECIES: no life is known on
// Jupiter. The sheet's heroic sizes are kept as artScale (concept only); the simulated bodies are smaller, after an
// honest look at mass, lift and energy in 2.5 g.
const JUP_FACT = M('Jupiter', 'A hydrogen-helium giant with no solid surface; about 2.5 g at the 1-bar level; around 165 K near 1 bar, hotter and denser below; ammonia, ammonium-hydrosulphide and water cloud layers, strong zonal winds, lightning. No life has been found.', 'OBSERVED', 2);
const JUP_LIFT = M('Staying aloft', 'Hydrogen in a bag gives almost no lift in a hydrogen atmosphere; flyers here would need very light bodies, broad lifting surfaces and rising air. Any of these animals that loses its updraft sinks.', 'INFERRED', 3);
const SAGAN = M('Background', 'Sagan and Salpeter (1976) sketched possible sinkers, floaters and hunters for Jupiter as a thought experiment: it is not evidence that any exist.', 'HYPOTHETICAL', 4);

export const JUPITER_SPECIES: SpeciesDef[] = [
  {
    id: 'skimmer', planet: 'jupiter', name: 'Stormskimmer', latin: 'Ventoraia iridis', model: 'creatures/jupiter/skimmer', speculative: true, panel: 'jupiter_panel_01',
    built: 14, size: [10, 18], artScale: [15, 40], medium: 'air', locomotion: 'glide', archetype: 'glider',
    motion: {
      wave: { axis: 'right', waves: 0.3, tail: 1.5, amp: 0.05, freq: 0.15, headFix: 0.4 },
      fins: [0, 1, 2].map((k) => ({ l: `wL${k}_`, r: `wR${k}_`, axis: 'fwd' as const, amp: 0.14, freq: 0.18, lag: 0.5, ph0: -k * 0.7 })),
      chains: [{ prefix: 'tail', bend: 0, wave: 0.15, freq: 0.3, axis: 'up' }],
    },
    speed: { cruise: 9, burst: 22, turn: 0.18, accel: 2.5 },
    senses: { flow: 120, vision: 400, sound: 600 },
    habitat: { tags: ['upper'], alt: [60, 500] },
    population: 7, group: [2, 4],
    threat: { level: 'low', reach: 3, harm: 0.25 },
    sound: 'Membranes fluttering in the dense gas, a low thrum as it banks.',
    codex: [
      M('Role', 'An upper-air skyray that glides along wind shear and updrafts, filtering aeromites and organic aerosols.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 10 to 18 m across the wings; the concept sheet shows 15 to 40 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A slim near-black keel with a long pointed face; huge swept-back violet wing films stiffened by iridescent cobalt vein ridges; a forked tail; a comb-lined mouth slit.', 'SPECULATIVE', 2),
      M('Flight', 'Glides, it does not levitate: without rising air it loses height. It flexes its wings in waves to change the angle of attack.', 'HYPOTHETICAL', 3),
      M('Behaviour', 'Travels in loose strings along recurrent shear lanes, feeds through aeromite swarms; from a hunter it folds its wings and spirals down.', 'SPECULATIVE', 3),
      M('Threat', 'Not hostile; a panicked one can strike a probe with a wingtip.', 'SPECULATIVE', 2),
      JUP_FACT, JUP_LIFT,
    ],
  },
  {
    id: 'skyjelly', planet: 'jupiter', name: 'Skyjelly', latin: 'Aerocolonia umbella', model: 'creatures/jupiter/skyjelly', speculative: true, panel: 'jupiter_panel_02',
    built: 4, size: [1.5, 6], artScale: [1, 10], medium: 'air', locomotion: 'drift', archetype: 'drifter',
    motion: { swell: { prefix: 'bell', amp: 0.12, freq: 0.18 }, chains: [{ prefix: 'ten', bend: 0, wave: 0.12, freq: 0.15, axis: 'right' }] },
    speed: { cruise: 0.3, burst: 0.8, turn: 0.2, accel: 0.15 },
    senses: { touch: 2, flow: 15 },
    habitat: { tags: ['drift'], alt: [-40, 220] },
    population: 12, group: [2, 5],
    threat: { level: 'none', reach: 1, harm: 0.03 },
    sound: 'None that carries; a faint rustle of film at arm\'s length.',
    codex: [
      M('Role', 'A drifting gelatinous colony that collects aeromites and organic droplets on sticky filaments.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 1.5 to 6 m across; the concept sheet shows 1 to 10 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'Two nested translucent film domes on radial ribs over enclosed liquid microreservoirs, a bright rim, a central nutrient body and dozens of long filaments.', 'SPECULATIVE', 2),
      M('Physics', 'A film envelope of extremely low weight per area, kept up by small temperature and composition differences and by convection; torn ones fall.', 'HYPOTHETICAL', 3),
      M('Light', 'Its glow would cost energy and serve signalling (finding mates, warning predators).', 'HYPOTHETICAL', 3),
      M('Care', 'Its sticky filaments can clog small intakes; fly through slowly.', 'SPECULATIVE', 3),
      JUP_FACT, JUP_LIFT,
    ],
  },
  {
    id: 'beast', planet: 'jupiter', name: 'Stormbeast', latin: 'Procellivorax maximus', model: 'creatures/jupiter/beast', speculative: true, panel: 'jupiter_panel_03',
    built: 26, size: [20, 30], artScale: [50, 120], medium: 'air', locomotion: 'swim', archetype: 'ambush',
    motion: {
      wave: { axis: 'up', waves: 0.7, tail: 2.4, amp: 0.35, freq: 0.12, headFix: 0.1 },
      chains: [{ prefix: 'str', bend: 0, wave: 0.3, freq: 0.2, axis: 'up' }],
      jaw: { idle: 0.08, open: 0.8 },
    },
    speed: { cruise: 6, burst: 26, turn: 0.12, accel: 3 },
    senses: { flow: 300, sound: 900, vision: 120 },
    habitat: { tags: ['stormedge'], alt: [-700, -120] },
    population: 1,
    threat: { level: 'high', reach: 8, harm: 0.7 },
    sound: 'Low resonant rumbles through the dense gas, wind roar, the crack of its membranes.',
    codex: [
      M('Role', 'A rare superpredator of storm margins: a burst ambusher of large filter-feeders, using the shear at vortex boundaries.', 'SPECULATIVE', 1),
      M('Size', 'Simulated about 20 to 30 m, most of it streamers; the concept sheet\'s 50 to 120 m is a heroic design scale.', 'SPECULATIVE', 2),
      M('Anatomy', 'A serpentine forebody of layered muscle ribs, an oversized gaping maw with rows of hooked teeth and throat folds, recessed amber facial pits; the tail dissolves into long membranes.', 'SPECULATIVE', 2),
      M('Physics', 'A dense 120 m flying predator in 2.5 g is beyond any plausible lift: only a mostly airy, membrane-plumed body with a small dense core and sustained updrafts could fly at all.', 'INFERRED', 3),
      M('Hunting', 'Holds a concealed angle in the cloud below a grazing route, rises with folded fins, opens its jaws at the last moment, bites and flees upward. Missing costs it altitude.', 'SPECULATIVE', 3),
      M('Warning', 'Low pressure pulses and a cloud trail first; the neck compresses before a strike.', 'SPECULATIVE', 3),
      JUP_FACT, SAGAN,
    ],
  },
  {
    id: 'colony', planet: 'jupiter', name: 'Floating Colony', latin: 'Consortium nubivagum', model: 'creatures/jupiter/colony', speculative: true, panel: 'jupiter_panel_04',
    built: 2.5, size: [1.5, 4], artScale: [5, 5000], medium: 'air', locomotion: 'drift', archetype: 'drifter',
    motion: { chains: [{ prefix: 'th', bend: 0, wave: 0.15, freq: 0.1, axis: 'right' }] },
    speed: { cruise: 0.2, burst: 0.5, turn: 0.1, accel: 0.1 },
    senses: { touch: 3, flow: 10 },
    habitat: { tags: ['colony'], alt: [-120, 120] },
    population: 30, group: [10, 15],
    threat: { level: 'none', reach: 1, harm: 0.03 },
    sound: 'Faint crackle of breaking links between modules.',
    codex: [
      M('Role', 'A symbiotic consortium of many small floaters: producers, microbe harvesters and recyclers linked loosely into a drifting cloud ecology.', 'SPECULATIVE', 1),
      M('Size', 'Each module 1.5 to 4 m; a whole colony is a diffuse footprint that can spread over kilometres (the sheet\'s "up to 5 km"), never one rigid body.', 'SPECULATIVE', 2),
      M('Anatomy', 'Ragged porous masses with ember-like chemical pits (not fire), a fuzzy branching outer layer, hanging threads and budding satellite blobs.', 'SPECULATIVE', 2),
      M('Behaviour', 'Drifts slowly, links and unlinks with neighbours, breaks apart in strong shear and gathers again in calm currents; shed fragments feed the grazers.', 'SPECULATIVE', 3),
      M('Care', 'Flying through quickly clogs intakes and fouls optics.', 'SPECULATIVE', 3),
      JUP_FACT, JUP_LIFT,
    ],
  },
  {
    id: 'volt', planet: 'jupiter', name: 'Voltdrifter', latin: 'Electroteuthis aeria', model: 'creatures/jupiter/volt', speculative: true, panel: 'jupiter_panel_05',
    built: 6, size: [3, 8], artScale: [3, 15], medium: 'air', locomotion: 'swim', archetype: 'ambush',
    motion: {
      wave: { axis: 'right', waves: 0.6, tail: 1.2, amp: 0.1, freq: 0.5, headFix: 0.4 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.3, freq: 0.6, lag: 0.4 }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.25, freq: 0.6, lag: 0.4, ph0: -0.8 }],
      chains: [{ prefix: 'ten', bend: 0, wave: 0.2, freq: 0.5, axis: 'right' }],
    },
    speed: { cruise: 3, burst: 14, turn: 0.6, accel: 5 },
    senses: { electric: 80, vision: 60, flow: 30 },
    habitat: { tags: ['margin'], alt: [-150, 150] },
    population: 5,
    threat: { level: 'moderate', reach: 2, harm: 0.3 },
    sound: 'Low clicks; a faint crackle in charged air.',
    codex: [
      M('Role', 'An agile squidlike predator of storm margins, sensing charged aerosols and field changes to find particle-rich pockets and avoid violent cells.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 3 to 8 m; the concept sheet shows 3 to 15 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A narrow metallic blue-purple body, a hard forward beak, a cluster of large faceted eyes, electrosensory filament arrays, two pairs of sharp membrane fins, long whip tendrils.', 'SPECULATIVE', 2),
      M('Energy', 'It does not feed on lightning: absorbing a bolt would kill it. Its food is prey and chemistry; at most it does a little electrochemical work from small gradients.', 'INFERRED', 3),
      M('Hunting', 'Probes clouds with its tendrils, darts at aeromite swarms and young skyjellies, grasps with two tendrils and draws prey to the beak.', 'SPECULATIVE', 3),
      M('Threat', 'Inspects sensor masts and sampling nets; a defensive lash can damage fragile parts.', 'SPECULATIVE', 2),
      JUP_FACT,
    ],
  },
  {
    id: 'diver', planet: 'jupiter', name: 'Deepdiver', latin: 'Bathyaetes loricatus', model: 'creatures/jupiter/diver', speculative: true, panel: 'jupiter_panel_06',
    built: 12, size: [8, 14], artScale: [10, 30], medium: 'air', locomotion: 'swim', archetype: 'apex',
    motion: {
      wave: { axis: 'up', waves: 0.5, tail: 1.8, amp: 0.12, freq: 0.2, headFix: 0.3 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.12, freq: 0.2, lag: 0.3 }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.1, freq: 0.2, lag: 0.3, ph0: -0.6 }],
      chains: [{ prefix: 'str', bend: 0, wave: 0.2, freq: 0.3, axis: 'up' }],
    },
    speed: { cruise: 5, burst: 18, turn: 0.25, accel: 3 },
    senses: { flow: 120, vision: 60, thermal: 40 },
    habitat: { tags: ['deep'], alt: [-900, -350] },
    population: 3,
    threat: { level: 'high', reach: 4, harm: 0.55 },
    sound: 'A deep hiss of armour through dense air; a thump when it strikes.',
    codex: [
      M('Role', 'An armoured glider of the deeper, warmer, denser cloud levels: a carnivore and scavenger of sinking carcasses and slow floaters.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 8 to 14 m; the concept sheet shows 10 to 30 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A broad wedge snout, overlapping triangular charcoal plates with scratched pale rims, a reinforced keel, layered rigid wing fins, segmented throat filters, red sensory pits, rear streamers.', 'SPECULATIVE', 2),
      M('Environment', 'There is no water ocean here: it moves through thick droplet-laden gas within a narrow pressure band; deeper is fatal. Armour costs lift.', 'INFERRED', 3),
      M('Behaviour', 'Slow circles in its band, a fast strike from slightly above, presents its armoured flank when threatened, returns to stable air after a miss.', 'SPECULATIVE', 3),
      JUP_FACT, JUP_LIFT,
    ],
  },
  {
    id: 'grazer', planet: 'jupiter', name: 'Gasgrazer', latin: 'Pectinocetus nubium', model: 'creatures/jupiter/grazer', speculative: true, panel: 'jupiter_panel_07',
    built: 24, size: [18, 30], artScale: [20, 60], medium: 'air', locomotion: 'swim', archetype: 'filter',
    motion: {
      wave: { axis: 'right', waves: 0.5, tail: 2.0, amp: 0.1, freq: 0.08, headFix: 0.4 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.15, freq: 0.08, lag: 0.5 }],
      chains: [{ prefix: 'fr', bend: 0, wave: 0.18, freq: 0.12, axis: 'up' }],
    },
    speed: { cruise: 3, burst: 7, turn: 0.06, accel: 0.25 },
    senses: { flow: 200, sound: 2000, vision: 200 },
    habitat: { tags: ['lane'], alt: [-280, 60] },
    population: 4, group: [1, 3],
    threat: { level: 'none', reach: 6, harm: 0.4 },
    sound: 'Very low vibrations between individuals; the slow beat of its vanes.',
    codex: [
      M('Role', 'A slow filter-feeding giant that follows nutrient-rich flow lanes with its comb mouth open; prey for the rare storm hunters.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 18 to 30 m; the concept sheet shows 20 to 60 m.', 'SPECULATIVE', 2),
      M('Anatomy', 'A whale-like front with a huge forward-opening vertical filter mouth of tensioned comb strands (not fangs), long flow-sensing filaments under the jaw, broad lateral vanes, a light hindbody.', 'SPECULATIVE', 2),
      M('Physics', 'Its mass is its problem: broad vanes, low-density chambers of limited benefit and a life in strong updraft bands. Course and speed change slowly.', 'INFERRED', 3),
      M('Feeding', 'Sieves particles and aerosol clumps, not gas; filtering costs drag, and it closes and cleans its comb now and then.', 'SPECULATIVE', 3),
      M('Care', 'Not hostile; its wake and bulk are a collision hazard.', 'SPECULATIVE', 2),
      JUP_FACT, JUP_LIFT,
    ],
  },
  {
    id: 'aeromite', planet: 'jupiter', name: 'Aeromite Swarm', latin: 'Aeroseminis aurea', model: 'creatures/jupiter/aeromite', speculative: true, panel: 'jupiter_panel_08',
    built: 0.03, size: [0.01, 0.04], medium: 'air', locomotion: 'swarm', archetype: 'swarm',
    motion: {},
    speed: { cruise: 0.5, burst: 2, turn: 3, accel: 3 },
    senses: { flow: 1 },
    habitat: { tags: ['swarm'], alt: [-80, 150] },
    population: 0,
    threat: { level: 'none', reach: 0, harm: 0 },
    sound: 'Silent; a faint ticking on instruments as they cling.',
    codex: [
      M('Role', 'Centimetre-scale floaters in swarms tens to hundreds of metres across: the food base of most of the sky\'s animals.', 'SPECULATIVE', 1),
      M('Anatomy', 'Each a slender segmented seedlike body with a few narrow pale membranes and filaments and a reflective golden terminal dot.', 'SPECULATIVE', 2),
      M('Behaviour', 'Simple local rules, no swarm mind: align with the flow, keep a loose spacing, move toward food, scatter at a pressure pulse, regroup in coherent currents.', 'SPECULATIVE', 3),
      M('Light', 'The glints are mostly sunlight on reflective surfaces, with weak bioluminescence at most.', 'HYPOTHETICAL', 3),
      JUP_FACT,
    ],
  },
  {
    id: 'hunter', planet: 'jupiter', name: 'Stormhunter', latin: 'Nubivenator serratus', model: 'creatures/jupiter/hunter', speculative: true, panel: 'jupiter_panel_09',
    built: 20, size: [14, 24], artScale: [30, 80], medium: 'air', locomotion: 'swim', archetype: 'apex',
    motion: {
      wave: { axis: 'up', waves: 0.8, tail: 2.2, amp: 0.25, freq: 0.25, headFix: 0.1 },
      fins: [{ l: 'finL0_', r: 'finR0_', axis: 'fwd', amp: 0.16, freq: 0.25, lag: 0.4 }, { l: 'finL1_', r: 'finR1_', axis: 'fwd', amp: 0.12, freq: 0.25, lag: 0.4 }],
      jaw: { idle: 0.03, open: 0.6 },
    },
    speed: { cruise: 8, burst: 30, turn: 0.3, accel: 6 },
    senses: { flow: 250, vision: 400, sound: 800, chem: 200 },
    habitat: { tags: ['hunt'], alt: [-200, 300] },
    population: 1,
    threat: { level: 'high', reach: 5, harm: 0.6 },
    sound: 'A rumble, fin snaps, a short roar of displaced gas on the strike.',
    codex: [
      M('Role', 'A very rare armoured pursuit-and-ambush predator of the stable shear corridors, intercepting slow floaters and injured giants.', 'SPECULATIVE', 1),
      M('Size', 'Simulated 14 to 24 m; the concept sheet\'s 30 to 80 m is a heroic design scale.', 'SPECULATIVE', 2),
      M('Anatomy', 'An angular streamlined body, an armoured forehead over a long serrated hooked beak with rows of backward teeth, dark red-black ridged plates and spines, swept fin-webs with faint copper edges, gripping forestructures.', 'SPECULATIVE', 2),
      M('Senses', 'Pressure waves, sight where light reaches, local sound and chemistry. It cannot track anything through hundreds of kilometres of cloud: it learns the corridors where prey passes.', 'INFERRED', 3),
      M('Behaviour', 'Patrols, makes a broad assessment loop round anything new, strikes in a short burst; its stamina and altitude limit every attack.', 'SPECULATIVE', 3),
      M('Threat', 'Folding fins and a pitching head telegraph a strike. Changing altitude, going quiet or keeping distance are all answers.', 'SPECULATIVE', 2),
      JUP_FACT, SAGAN,
    ],
  },
];

export const SPECIES: Record<string, SpeciesDef> = {};
for (const s of [...MILLER_SPECIES, ...MARS_SPECIES, ...JUPITER_SPECIES]) SPECIES[s.id] = s;
