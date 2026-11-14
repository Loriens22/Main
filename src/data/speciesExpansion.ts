/**
 * Mars & Jupiter — speculative evolution expansion: the eighteen species dossiers (research codex, spawning, scale).
 *
 * Every creature here is an ORIGINAL HYPOTHETICAL SPECIES FOR FICTIONAL GAME DESIGN. No life has been found on Mars or
 * Jupiter; no rover or probe has photographed these beings and no agency has verified them. Each statement carries a
 * certainty label:
 *   OBSERVED      a real planetary measurement (the environment, never the animal)
 *   INFERRED      a supported interpretation of real measurements
 *   HYPOTHETICAL  scientifically conceivable, not demonstrated
 *   SPECULATIVE   a game-world invention
 * Jupiter's nine keep the names and panel order of the player's 3×3 reference sheet (jupiter_panel_01 … 09). Where the
 * sheet's heroic size exceeds a credible mass/energy/buoyancy budget, `artScale` keeps the poster's figure and
 * `simScale` is the body the simulation uses (Creative Mode may show the heroic size; it is never claimed as real).
 */
export type Certainty = 'OBSERVED' | 'INFERRED' | 'HYPOTHETICAL' | 'SPECULATIVE';
export type Fact = [Certainty, string];

export interface SpeciesDossier {
  id: string;
  name: string;
  latin: string;
  planet: 'mars' | 'jupiter';
  /** Jupiter: the reference sheet panel (reading order, upper-left = 01) */
  panel?: string;
  zone: string;
  /** survivable envelope (depth / altitude / pressure / temperature) */
  envelope: string;
  type: string;
  /** the concept art's size */
  artScale: string;
  /** the simulated body */
  simScale: string;
  /** the model's scale factor relative to its mesh in Creative Mode's heroic display (1 = simulation size) */
  heroic: number;
  diet: string;
  reproduction: string;
  senses: string;
  /** behaviour-tree states this taxon uses */
  states: string[];
  threat: string;
  /** what the player can do instead of fighting */
  avoid: string;
  sound: string;
  facts: Fact[];
  /** evidence keys (flags bio:<id>:<key>) the field log can record, with what each shows */
  evidence: Record<string, string>;
  note: string;
}

export const SPECIES_EXPANSION: Record<string, SpeciesDossier> = {
  // ============================================================================================== MARS (refuge)
  icebloom: {
    id: 'icebloom', name: 'Crimson Icebloom', latin: 'Cryoflora sanguinea', planet: 'mars',
    zone: 'Refuge ice shelf under the skylight; sub-ice melt pockets', envelope: 'Liquid films in ice, −15…+2 °C, light through ≤ 2 m of clear ice',
    type: 'Colonial sub-ice phototroph (passive)', artScale: 'Rosettes 0.1–0.4 m, patches to ~2 m', simScale: 'Same — linked rosettes, ~2 m patches', heroic: 1,
    diet: 'Phototrophic production from cold light through ice; carbon and nutrients from meltwater films',
    reproduction: 'Resistant propagules and fragments; new rosettes in compatible adjacent melt pockets',
    senses: 'None in the animal sense: light-driven pigment and turgor responses', states: ['DORMANT', 'IDLE', 'HEAL'],
    threat: 'None', avoid: 'Do not touch or drill: the lamellae tear and the colony goes dormant', sound: 'Silent — only water and instrument contact',
    facts: [
      ['OBSERVED', 'Water ice exists at and below the Martian surface; sunlight penetrates clear ice.'],
      ['HYPOTHETICAL', 'Shallow ice could shelter light-driven microbes from UV while passing photosynthetically useful light.'],
      ['SPECULATIVE', 'A macroscopic, layered colonial phototroph with red-violet pigments and a capillary net.'],
      ['SPECULATIVE', 'Growth tied to seasonal melt; months of slow growth compressed into time-lapse.'],
    ],
    evidence: {
      sighting: 'Translucent crimson rosettes in the ice under the skylight.',
      light: 'The lamellae opened slowly while daylight came through the skylight and closed again in the dark.',
      touch: 'Touched: the thin lamellae contracted and dulled — the colony went dormant.',
    },
    note: 'A quiet first find: production, not prey. Its colour is chemistry, not decoration.',
  },
  ferric: {
    id: 'ferric', name: 'Ferric Cathedral', latin: 'Ferroarbor cathedralis', planet: 'mars',
    zone: 'Refuge lake shelf on warm mineral seeps', envelope: 'Brine 2–12 °C at the seeps, 4–8 m depth, redox gradient between seep water and lake water',
    type: 'Anchored chemosynthetic/symbiotic colony', artScale: '0.2–3 m branching assemblages', simScale: '2–3.4 m colonies on vent mounds', heroic: 1,
    diet: 'Symbiont chemolithotrophy: electron donors from rock–water reactions, acceptors from a separate oxidant-bearing inflow',
    reproduction: 'Budding, break-off fragments, propagules dispersed to new seeps', senses: 'Contact and chemical gradients; tip retraction',
    states: ['IDLE', 'STARTLE', 'HEAL', 'DORMANT'], threat: 'None', avoid: 'Keep thrust and drills away; disturbed tips retract and broken surfaces seal slowly',
    sound: 'Almost silent: gurgles of the seep, bubbles',
    facts: [
      ['OBSERVED', 'Mars has iron-rich basalts and minerals altered by water.'],
      ['INFERRED', 'Rock–water reactions can release electron donors (e.g. H₂, Fe²⁺); life would also need an electron acceptor supply.'],
      ['SPECULATIVE', 'A branching mineral-scaffold colony with velvet living tissue and microbial symbionts.'],
    ],
    evidence: {
      sighting: 'Branching dark-scarlet colonies on the warm vent mounds of the lake shelf.',
      flow: 'Fluid moves steadily across the fans; gas rises in strings from the vent beneath.',
      retract: 'When disturbed close by, the live tips drew in.',
    },
    note: 'A dense grove marks a stable, productive patch — and raises the odds of grazers and the things that eat them.',
  },
  ribbon: {
    id: 'ribbon', name: 'Glass Ribbon', latin: 'Vitreoserpens halophilus', planet: 'mars',
    zone: 'Refuge lake: walls, cracks, the Ferric grove', envelope: 'Brine 1–10 °C, 0.5–12 m depth',
    type: 'Transparent brine grazer (microfauna prey)', artScale: '15–60 cm', simScale: '42 cm', heroic: 1,
    diet: 'Microbial film grazed from mineral surfaces', reproduction: 'Encapsulated eggs in protected crevices; juveniles are small ribbons',
    senses: 'Mechanoreceptive edge cilia, a sensory tip; no large eyes', states: ['FORAGE', 'STARTLE', 'ESCAPE', 'IDLE'],
    threat: 'None', avoid: 'A school that vanishes into cracks is a cue: a predator or a flow change nearby', sound: 'Delicate scrape, fluid motion',
    facts: [
      ['INFERRED', 'Brines can stay liquid well below 0 °C; salinity changes viscosity and swimming cost.'],
      ['SPECULATIVE', 'A soft hydrated membrane animal supported by fine transverse strands, with a violet organ tract.'],
    ],
    evidence: {
      sighting: 'Transparent ribbons rippling along the lake walls; a violet tract runs down each.',
      graze: 'They folded against the cathedral branches, grazing the film.',
      hide: 'The whole school slid into the cracks at once — something was hunting.',
    },
    note: 'A gentle bioindicator: abundant where the film is rich, gone where a hunter passes.',
  },
  prism: {
    id: 'prism', name: 'Prism Architect', latin: 'Prismatoarchitectus lapidarius', planet: 'mars',
    zone: 'Refuge north-west shore: the nest by the wall', envelope: 'Humid pressurised cave air and shallow water, 2–15 °C',
    type: 'Intelligent benthic builder, opportunistic omnivore', artScale: '0.6–1.4 m', simScale: '1.25 m body, 1.8 m across the legs', heroic: 1,
    diet: 'Biofilm, detritus, small invertebrates', reproduction: 'Eggs in a built nest; pair or small group care; juveniles learn from adults',
    senses: 'Eyes under a ridge, tactile antennae, learned material recognition', states: ['FORAGE', 'INVESTIGATE', 'WARN', 'DEFEND_NEST', 'ATTACK', 'RECOVER', 'IDLE'],
    threat: 'Short grappling strikes only when the intruder closes on the eggs', avoid: 'Keep more than ~5 m from the nest; it habituates to calm, distant observers',
    sound: 'Ceramic scraping, fragment taps, dry defence clicks',
    facts: [
      ['SPECULATIVE', 'An exoskeletal builder that sorts mineral fragments by shape and seals them with secreted adhesive.'],
      ['SPECULATIVE', 'Bounded learning: it can come to ignore recurring harmless equipment.'],
    ],
    evidence: {
      sighting: 'Broad iridescent plated animals by a stone-slab nest roofed with shards.',
      build: 'One carried a shard back and set it into the nest roof.',
      warn: 'Approached, it froze, raised its manipulators and clicked — a warning.',
      habituate: 'After a long quiet watch it went back to work as if you were part of the cave.',
    },
    note: 'Watch from a distance: the nest changes between visits.',
  },
  ghost: {
    id: 'ghost', name: 'Ghost of Valles', latin: 'Umbrovelum lucens', planet: 'mars',
    zone: 'Refuge lake: mid-water over the Ferric grove', envelope: 'Brine 1–10 °C, 2–16 m depth, low light',
    type: 'Membrane-winged ambush hunter (medium threat)', artScale: '1.5–2.5 m span', simScale: '2.85 m span', heroic: 1,
    diet: 'Small swimmers — Glass Ribbons, juveniles', reproduction: 'Adhesive egg packets in protected water pockets; translucent juveniles',
    senses: 'Pressure-wave receptors (the dotted pores), small recessed eyes', states: ['IDLE', 'STALK', 'ATTACK', 'RECOVER', 'ESCAPE', 'DEFEND_NEST'],
    threat: 'Small: may nip if crowded', avoid: 'Hold still, dim the lamp, give it room; it leaves through passages a diver cannot follow',
    sound: 'Faint fluid pulses; a rush of wake in the lunge',
    facts: [
      ['SPECULATIVE', 'Broad translucent membranes with branching veins; a short underside lunge and clasp.'],
      ['SPECULATIVE', 'A miss costs it energy and a recovery glide.'],
    ],
    evidence: {
      sighting: 'A pale membrane shape crossed the beam and was gone behind the columns.',
      hunt: 'It paused, folded its wings, then lunged under a ribbon school.',
      shy: 'In the lamp beam it turned away into the dark.',
    },
    note: 'Elegant and unsettling, not a monster: it hunts things the size of your hand.',
  },
  bmimic: {
    id: 'bmimic', name: 'Basalt Mimic', latin: 'Basaltomimus insidiator', planet: 'mars',
    zone: 'Refuge dry floor near the tunnel foot', envelope: 'Damp pressurised cave air, 4–20 °C; never the open surface',
    type: 'Six-limbed cave ambush predator (dangerous)', artScale: '1.4–2.6 m', simScale: '2.4 m', heroic: 1,
    diet: 'Medium cave fauna, carcasses', reproduction: 'Brood hidden in deep wall cavities; restricted aggression while breeding',
    senses: 'Vibration and chemical sensing lines; small amber eyes', states: ['IDLE', 'STALK', 'WARN', 'ATTACK', 'RECOVER', 'ESCAPE', 'SEEK_SHELTER'],
    threat: 'A short leap and forelimb latch at close range; telegraphed by pre-tension', avoid: 'Scan the rock and light it up at range — exposed, it moves off. Never step within ~4 m.',
    sound: 'Grit shifting, claws on basalt, a short low warning',
    facts: [
      ['SPECULATIVE', 'Chromatophore-like pigment and movable papillae let it match basalt; it does not become stone or invisible to a scanner.'],
      ['SPECULATIVE', 'Prefers prey smaller than a suited human; attacks a person only when surprised close or cornered.'],
    ],
    evidence: {
      sighting: 'What looked like a basalt slab had amber eyes.',
      tension: 'Its body lowered, toes shifted, breathing changed — the warning before a leap.',
      exposed: 'Lit up at range, it lost its cover and crawled away to another crevice.',
    },
    note: 'A bio-signature that does not match the rock is the clue.',
  },
  hermit: {
    id: 'hermit', name: 'Red Dune Hermit', latin: 'Noctovagans hermeticus', planet: 'mars',
    zone: 'Surface beside the refuge fissure (brief crossings only)', envelope: 'Minutes on the open surface at mild temperatures; sealed internal water',
    type: 'Rare surface-crossing forager — the most speculative Mars adaptation (optional in strict mode)', artScale: '15–45 cm', simScale: '46 cm', heroic: 1,
    diet: 'Scraped mineral residues and detritus carried back underground', reproduction: 'Underground only; no surface colonies',
    senses: 'Protected recessed receptors: light, chemistry, ground vibration', states: ['DORMANT', 'FORAGE', 'SEEK_SHELTER', 'STARTLE', 'IDLE'],
    threat: 'None — short defensive claw taps if handled', avoid: 'Keep still; it curls and waits, then hurries back to its fissure',
    sound: 'None in the near-vacuum outside: contact vibrations through boots or rover gear',
    facts: [
      ['OBSERVED', 'Surface pressure is a few millibars; UV and oxidants make the exposed surface hostile.'],
      ['SPECULATIVE', 'A sealed-water armoured forager making metre-scale crossings between pressurised entrances.'],
    ],
    evidence: {
      sighting: 'A small domed rock walked out of the fissure.',
      curl: 'It stopped and curled when you came close, then hurried back underground.',
    },
    note: 'Do not overpopulate the dunes: one rare crossing is the whole story.',
  },
  serpent: {
    id: 'serpent', name: 'Thermal Rift Serpent', latin: 'Thermoserpens rimae', planet: 'mars',
    zone: 'Refuge warm channel (west) and the lake shallows', envelope: 'Warm brine 8–30 °C in flowing channels',
    type: 'Amphibious apex predator of the channels (critical at close range)', artScale: '2.5–4 m', simScale: '3.6 m', heroic: 1,
    diet: 'Medium aquatic fauna; scavenges', reproduction: 'Rare clutches in insulated chambers; young stay near low-energy refuges',
    senses: 'Thermosensory pores, jaw whiskers (mechanosensory), small eyes', states: ['IDLE', 'INVESTIGATE', 'WARN', 'ATTACK', 'RECOVER', 'STALK'],
    threat: 'Investigates, displays, then a territorial shove if a diver blocks its channel', avoid: 'Map the flow and stay out of the channel; it lets you pass if you yield',
    sound: 'Low submerged resonance, a heavy rub, the jaw crack',
    facts: [
      ['HYPOTHETICAL', 'Geothermal warmth could keep subsurface brines liquid locally.'],
      ['SPECULATIVE', 'A thermal-gradient hunter: local gradients only — no sensing through rock.'],
    ],
    evidence: {
      sighting: 'A long wet black-and-copper body lay still in the warm channel.',
      display: 'It raised its head and opened its jaws: a display, not yet an attack.',
      hunt: 'One acceleration, a snap, and it settled again to swallow.',
    },
    note: 'The channel is narrow: read the flow, not the fight.',
  },
  monarch: {
    id: 'monarch', name: 'Subglacial Monarch', latin: 'Cryopelagor rex', planet: 'mars',
    zone: 'Refuge deep basin under the ice shelf', envelope: 'Cold brine −2…4 °C, 8–17 m depth',
    type: 'Rare deep-water superpredator — the most speculative Mars megafauna', artScale: '4–6 m (poster: larger beside a submersible)', simScale: '5.4 m', heroic: 2.4,
    diet: 'Larger fish-like prey (background biomass, not modelled individually); scavenges', reproduction: 'Few offspring; long rest cycles; a handful of adults per basin at most',
    senses: 'Current and pressure sensing, small dark eyes, low-frequency hearing', states: ['IDLE', 'INVESTIGATE', 'STALK', 'ATTACK', 'RECOVER', 'ESCAPE'],
    threat: 'Attacks only when crowded, provoked or defending: a long approach, a burst and a ram/bite', avoid: 'Leave the water; it inspects, passes below and turns away',
    sound: 'A deep rumble through the water; silence broken by its pressure wake',
    facts: [
      ['INFERRED', 'Seismic data have been interpreted as liquid water deep in the Martian mid-crust — not as open underground lakes.'],
      ['SPECULATIVE', 'An isolated relic basin with enough productivity for a few large predators (this game\'s alternate history).'],
    ],
    evidence: {
      sighting: 'A vast black-blue shape with pale chevron scars moved under the ice.',
      inspect: 'It came sideways, passed below the camera and turned slowly away.',
    },
    note: 'A twenty-second sighting is the reward; most visits it is only a pressure wave.',
  },
  // ============================================================================================== JUPITER (sheet 916)
  stormskimmer: {
    id: 'stormskimmer', name: 'Stormskimmer', latin: 'Fulguroptera velivolans', planet: 'jupiter', panel: 'jupiter_panel_01',
    zone: 'Upper shear corridor above the ammonia cloud deck', envelope: '0.5–1.5 bar, ~150–200 K in the corridor (seasonal thermal use)',
    type: 'Gliding filter-feeder', artScale: '15–40 m wingspan', simScale: '24 m span, membrane-dominated mass', heroic: 1.6,
    diet: 'Airborne particles and aerosol microbiota filtered on the glide', reproduction: 'Display of wing colour; loose seasonal strings',
    senses: 'Wind vector, vibration, turbulence, light gradients', states: ['MIGRATE', 'FORAGE', 'ESCAPE', 'IDLE'],
    threat: 'A panicked wingtip strike on a probe', avoid: 'Ride a parallel shear lane at matched speed', sound: 'A wide soft air rush; flexing membrane',
    facts: [
      ['OBSERVED', 'Gravity near the 1-bar level is ~2.4–2.7 g; the visible cloud tops are near 165 K.'],
      ['OBSERVED', 'Jupiter has strong east–west zonal winds and shear between bands.'],
      ['SPECULATIVE', 'A glider of taut, light membrane with little dense muscle; it loses height without rising air.'],
    ],
    evidence: { sighting: 'A violet-black wing shape crossed the cloud bank.', glide: 'It held a shear lane without a wingbeat, sinking where the lift failed.' },
    note: 'Not free levitation: lift comes from moving air and the corridor.',
  },
  skyjelly: {
    id: 'skyjelly', name: 'Skyjelly', latin: 'Aeromedusa caerulea', planet: 'jupiter', panel: 'jupiter_panel_02',
    zone: 'Upper-middle cloud layers', envelope: '0.7–3 bar', type: 'Drifting filter-feeder', artScale: '1–10 m', simScale: '4–7 m bell, very low areal density', heroic: 1.3,
    diet: 'Particles and microfauna on sticky tendrils', reproduction: 'Budding; release of light microcolonies; juveniles common, huge adults rare',
    senses: 'Light and contact', states: ['IDLE', 'FORAGE', 'ESCAPE', 'DEAD'], threat: 'Sticky tendrils can clog small intakes', avoid: 'Slow thrust through them',
    sound: 'Silence, faint flutter',
    facts: [
      ['OBSERVED', 'A hydrogen-filled bladder in a hydrogen atmosphere gains far less lift than in air; helium is heavier, not a lifting gas here.'],
      ['SPECULATIVE', 'A thin-film envelope buoyed by small density differences and convection; torn bells sink.'],
    ],
    evidence: { sighting: 'Pale violet bells drifted between the clouds.', drift: 'Its bell pulsed gently while it drifted with the wind, not against it.' },
    note: 'Majestic and fragile; storm shear shreds them.',
  },
  stormbeast: {
    id: 'stormbeast', name: 'Stormbeast', latin: 'Procellodraco vorax', planet: 'jupiter', panel: 'jupiter_panel_03',
    zone: 'Peripheral shear lane of large storms (very rare)', envelope: '1–4 bar near vortex boundaries', type: 'Burst-ambush apex predator', artScale: '50–120 m (concept)', simScale: '38 m, mostly fin and sheet', heroic: 2.6,
    diet: 'Large floaters and damaged animals', reproduction: 'Unknown; very few adults', senses: 'Turbulence, pressure', states: ['IDLE', 'STALK', 'ATTACK', 'RECOVER'],
    threat: 'An ambush at the storm edge', avoid: 'Stay out of the vortex boundary; it does not pursue far', sound: 'Low gas vibration, abrupt maw opening',
    facts: [['OBSERVED', 'Jupiter\'s great storms have strong shear at their boundaries.'], ['SPECULATIVE', 'A serpentine ambusher whose size is mostly trailing membrane, not muscle.']],
    evidence: { sighting: 'A rust-brown serpentine shape surged along the storm wall.' },
    note: 'Witnessed, not fought: a rare event at the edge of a storm.',
  },
  colony: {
    id: 'colony', name: 'Floating Colony', latin: 'Consortium nubivagum', planet: 'jupiter', panel: 'jupiter_panel_04',
    zone: 'Mid cloud layers', envelope: '1–3 bar', type: 'Distributed consortium of small floaters', artScale: '"up to 5 km" (poster)', simScale: 'Thousands of 0.5–3 m units over a km-scale diffuse region — never one rigid body', heroic: 1,
    diet: 'Producers, consumers and recyclers exchanging real nutrients', reproduction: 'Branching, budding, break-up and recombination',
    senses: 'Per-unit: light, chemistry, airflow', states: ['IDLE', 'MIGRATE', 'ESCAPE'], threat: 'Clogs intakes, fouls optics if flown through fast', avoid: 'Fly through slowly',
    sound: 'A broad diffuse hiss',
    facts: [['SPECULATIVE', 'Each unit balances its own lift and drag; temporary links break in strong shear.'], ['SPECULATIVE', 'Its "size" is the extent of a circulating community.']],
    evidence: { sighting: 'Porous dark-orange modules hung in the cloud, linked by threads.' },
    note: 'A community spread through a volume, not a 5-km animal.',
  },
  voltdrifter: {
    id: 'voltdrifter', name: 'Voltdrifter', latin: 'Electroteuthis nebulosa', planet: 'jupiter', panel: 'jupiter_panel_05',
    zone: 'Around thunderstorms, at a distance', envelope: '1–5 bar', type: 'Tendril predator of small floaters', artScale: '3–15 m', simScale: '8 m', heroic: 1.4,
    diet: 'Aeromites, juvenile Skyjellies, small floaters', reproduction: 'Eggs/microfloaters in protected aerosol layers', senses: 'Charged-aerosol and field sensing (a UI readout, not an aura), eyes',
    states: ['FORAGE', 'STALK', 'ATTACK', 'ESCAPE', 'IDLE'], threat: 'Low to a craft', avoid: 'Keep away from the lightning; it ignores you', sound: 'Clicking electrosensory response, rushing tendrils',
    facts: [['OBSERVED', 'Lightning occurs in Jupiter\'s water clouds.'], ['SPECULATIVE', 'It senses changing fields; it does NOT eat lightning — a bolt would be lethal.']],
    evidence: { sighting: 'A blue-purple tendrilled squid hung near a distant storm.' },
    note: 'Field-sensing helps it avoid storms and find particle-rich pockets.',
  },
  deepdiver: {
    id: 'deepdiver', name: 'Deepdiver', latin: 'Bathynautes loricatus', planet: 'jupiter', panel: 'jupiter_panel_06',
    zone: 'Lower corridor: moist, droplet-rich cloud levels', envelope: '3–8 bar, 250–320 K', type: 'Armoured air-swimmer; takes sinking carrion', artScale: '10–30 m', simScale: '14 m', heroic: 1.5,
    diet: 'Sinking carrion, medium prey', reproduction: 'Unknown', senses: 'Pressure, vibration', states: ['FORAGE', 'IDLE', 'ESCAPE'], threat: 'Low', avoid: 'Watch the hull pressure: the corridor itself is the danger',
    sound: 'Dense armour resonances, deep fin buffeting',
    facts: [['INFERRED', 'Deeper layers are warmer and denser; pressure rises steeply with depth.'], ['SPECULATIVE', '"Aerial-aquatic" means flying through dense droplet-rich cloud, not swimming in an ocean.']],
    evidence: { sighting: 'A charcoal armoured wedge cruised the lower haze.' },
    note: 'The descent, not the animal, is the hazard.',
  },
  gasgrazer: {
    id: 'gasgrazer', name: 'Gasgrazer', latin: 'Pectinocetus jovialis', planet: 'jupiter', panel: 'jupiter_panel_07',
    zone: 'Dense food fronts in the mid layers', envelope: '1–4 bar', type: 'Huge filter-feeder', artScale: '20–60 m', simScale: '30 m, low-density body', heroic: 1.8,
    diet: 'Aeromite swarms and colony fragments through a vertical comb mouth', reproduction: 'Few calves', senses: 'Plume chemistry, low calls', states: ['FORAGE', 'MIGRATE', 'IDLE', 'ESCAPE'],
    threat: 'None', avoid: 'Do not fly into its mouth line', sound: 'Rhythmic comb vibrations, low calls',
    facts: [['SPECULATIVE', 'Its comb must actually meet a particle plume to feed.']],
    evidence: { sighting: 'A vast comb-mouthed grazer trailed fringes through the cloud.' },
    note: 'Scale is communicated by what it eats: whole swarms.',
  },
  aeromite: {
    id: 'aeromite', name: 'Aeromite Swarm', latin: 'Aeromyrmex aurata', planet: 'jupiter', panel: 'jupiter_panel_08',
    zone: 'Optically rich cloud regions', envelope: '0.5–3 bar', type: 'Centimetre-scale swarming organisms', artScale: 'cm each, vast swarms', simScale: '1–3 cm each, thousands per swarm', heroic: 1,
    diet: 'Aerosol microbiota and organics', reproduction: 'Rapid, seasonal', senses: 'Light, airflow', states: ['FORAGE', 'ESCAPE', 'MIGRATE'], threat: 'None', avoid: '—',
    sound: 'A faint shimmering rustle, only near dense swarms',
    facts: [['HYPOTHETICAL', 'Sagan & Salpeter (1976) considered small "sinkers" and "floaters" as conceivable Jovian niches — a thought experiment, not evidence.'], ['SPECULATIVE', 'Gold seed-like fliers with star membranes.']],
    evidence: { sighting: 'A glittering golden swarm drifted through the haze.' },
    note: 'The base of the speculative food web.',
  },
  stormhunter: {
    id: 'stormhunter', name: 'Stormhunter', latin: 'Venator procellae', planet: 'jupiter', panel: 'jupiter_panel_09',
    zone: 'Stable shear corridors (track-and-intercept)', envelope: 'A bounded 1–4 bar envelope — not "all atmospheric layers"', type: 'Mobile apex predator', artScale: '30–80 m', simScale: '26 m', heroic: 2,
    diet: 'Large floaters, Stormskimmers', reproduction: 'Rare', senses: 'Vision, pressure', states: ['IDLE', 'STALK', 'WARN', 'ATTACK', 'RECOVER', 'ESCAPE'],
    threat: 'An intercept with credible warning; retreat is always possible', avoid: 'Leave its corridor; it breaks off when you climb or dive out of its envelope',
    sound: 'Short resonant calls, a fin-tearing rush',
    facts: [['SPECULATIVE', 'A bounded survivable envelope — it cannot follow you everywhere.']],
    evidence: { sighting: 'A red-black armoured hunter with a serrated beak shadowed the corridor.' },
    note: 'Distinct from the Stormbeast: pursuit in calm shear, not ambush at storm walls.',
  },
};

export const MARS_EXPANSION = ['icebloom', 'ferric', 'ribbon', 'prism', 'ghost', 'bmimic', 'hermit', 'serpent', 'monarch'];
export const JUPITER_EXPANSION = ['stormskimmer', 'skyjelly', 'stormbeast', 'colony', 'voltdrifter', 'deepdiver', 'gasgrazer', 'aeromite', 'stormhunter'];
