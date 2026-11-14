# Mars & Jupiter — speculative evolution expansion

Eighteen ORIGINAL HYPOTHETICAL SPECIES FOR FICTIONAL GAME DESIGN. No life is known on Mars or Jupiter. No rover or
probe has photographed these beings, and no agency has verified them. Every codex statement carries one of four
labels:

- **OBSERVED:** a real planetary measurement, about the environment and never the animal.
- **INFERRED:** a supported interpretation of real measurements.
- **HYPOTHETICAL:** scientifically conceivable but not demonstrated.
- **SPECULATIVE:** a game-world invention.

## Science modes (Settings → Alien life)

- **Speculative evolution** (the default): every species of the expansion, plus the earlier Mars and Jupiter creatures.
- **Scientific / conservative**: no complex animals on Mars or Jupiter.
  - The refuge stays as a landform.
  - The codex shows the entries as unverified archive hypotheses.
  - It takes effect on the next landing.
- **Heroic Jupiter scale** (Creative only): the giants shown at the reference sheet's poster sizes.
  - Their dossiers keep the poster figure as `artScale` and the size the simulation uses as `simScale`.

## Where

### Mars: the refuge

The refuge is a game alternate-history extension, not a known Mars feature. Its layout lives in
`src/world/surface/marsRefuge.json` and its geometry in `blender/assets/mars_refuge.py`. It sits 210 m east and 150 m
north of every Mars landing site, under a 17 m mesa on levelled ground. Its parts:

- **Entry:** a lava-tube mouth in the scarp. A tunnel and a ledge down the wall lead into a sealed cavern (r 58 m).
- **Lake:**
  - A brine lake: a shelf in the west with warm vent mounds, and a deep basin in the east.
  - The basin lies under an ice shelf lit through an ice skylight.
- **Rest of the cavern:** a warm channel from the west wall, mineral columns and stalactites.
- **Lighting:** survey floodlights, explained in game as left by the robotic precursor survey.
- **Floor:** a fine mesh with a collider. The terrain heightfield (4 m cells) is carved out of sight beneath it.
- **Animals' ground:** the floor mesh is rasterised into a height grid for the animals.
- **Inside:** sun and sky go dark, the suit lamp comes on, and under the lake surface the view becomes a silty
  underwater one.

### Jupiter: the cloud layer, met from Ranger 1

Each species keeps a bounded altitude corridor relative to the flight level, never "all atmospheric layers". Each is
recycled ahead on the wind. The Stormhunter breaks off when the Ranger climbs or dives out of its envelope.

## The species

Dossiers are in `src/data/speciesExpansion.ts`. Models are in `blender/assets/fauna_mars_deep.py` and
`blender/assets/fauna_jupiter_sheet.py`, with painted maps and baked normal maps. Behaviour is in
`src/world/fauna/marsDeep.ts` and `src/world/fauna/jupiterSheet.ts`.

### Mars

| Species | Behaviour in the game | Threat and the way out |
|---|---|---|
| Crimson Icebloom | Opens in the skylight's daylight and folds at night; touched, it tears and goes dormant | None |
| Ferric Cathedral | Static colonies on the vent mounds; tips retract when disturbed; gas rises from the seeps | None |
| Glass Ribbon | Instanced schools graze the grove; numbers follow a regrowing biofilm budget; they vanish into cracks when a hunter passes | None |
| Prism Architect | Forages and carries shards to the nest roof. Defence ladder: freeze and face, plates spread with clicks, then a short grapple only at the eggs. Habituates to calm distant observers | Keep more than 5 m from the nest |
| Ghost of Valles | Patrols over the grove; stalks, pauses with folded wings, lunges; a miss costs a recovery glide | Shy of the lamp beam; nips only if crowded |
| Basalt Mimic | Ambushes from cover, with pre-tension (body lowers, toes shift, breathing quickens) before a leap | Lit at range it is exposed and moves off, and remembers the light |
| Thermal Rift Serpent | Holds station in the channel, patrols, and makes one burst at the ribbons | Investigates, then displays, then gives a territorial shove; leave its channel |
| Subglacial Monarch | Slow loops under the ice; inspects divers sideways and from below | Warns before a rare ram; leave the water |
| Red Dune Hermit | Brief crossings from its fissure in mild light; curls when approached and hurries back | None |

### Jupiter (reference sheet panel order)

| Panel | Species | Behaviour in the game |
|---|---|---|
| 01 | Stormskimmer | Strings glide across shear lanes on a lift budget and sink where the lift fails; a wingtip strike only if rammed |
| 02 | Skyjelly | Drifts with the wind; its tendrils foul small intakes |
| 03 | Stormbeast | Very rare, at a storm wall: a long telegraph, one pass, then gone into the deep |
| 04 | Floating Colony | Thousands of instanced units over a wide volume; flying through fast fouls the intakes and the canopy |
| 05 | Voltdrifter | Hovers at a distance from a storm cell; an instrument readout of its field sensing; darts for aeromites |
| 06 | Deepdiver | An armoured cruiser in a low corridor, 500–1100 m below the flight level |
| 07 | Gasgrazer | Its comb mouth filters the Aeromite swarm, which regrows |
| 08 | Aeromite Swarm | Instanced seeds plus round glints |
| 09 | Stormhunter | Shadows the craft, calls, makes one telegraphed intercept, breaks off |

## Models

Each Jupiter model follows its panel of the reference sheet (own geometry, built in Blender from close study of the
panel; nothing traced or copied):

| Panel | Species | Model |
|---|---|---|
| 01 | Stormskimmer | Manta-like planform: the wing root runs the whole body; a convex swept leading edge with a thick spar; a concave trailing edge into the tail root; a shoulder-to-tip ridge and finger ribs; glowing vein net in a translucent violet membrane; short beak, silver-ringed eye, whip tail |
| 02 | Skyjelly | A shallow ribbed dome, glowing pink rim and gonad ring, four twisted frilled oral arms, 96 hair-fine beaded tentacles |
| 03 | Stormbeast | A serpentine eel: broad wrinkled head with a hooked snout, a ~65° gape with irregular needle teeth, a ridged pink palate and dark throat, annular neck folds, no fins |
| 04 | Floating Colony | One unit of the community: a cumulus dome of lumps on lumps with ember fissures, a beard of thin wavy branching threads |
| 05 | Voltdrifter | A long tapering mantle with rhomboid fins, a dark blue-ringed eye under a brow, eight sinuous splayed arms and two clubbed tentacles |
| 06 | Deepdiver | A blunt whale head with a long mouth line, large swept blade-plates along the back, three stacked swept blade-fins per side |
| 07 | Gasgrazer | A bowhead's mouth: an arched upper jaw under a pale hood, a great dark-red lower lip, a comb of ~190 transverse baleen plates following the head between them, a curtain of tusk-fringes and fine hairs |
| 08 | Aeromite | A golden seed with radiating hairs (instanced by the thousand, with glints) |
| 09 | Stormhunter | A long narrow dragon head with needle teeth, a crown of backswept spikes webbed in crimson, a crimson frill on each side of the neck, silver scale armour over a crimson underside |

**Levels of detail.** Every animal model carries two decimated copies (32 % and 9 % of the triangles, made in
Blender, bound to the same skeleton). The game swaps them by distance measured in body radii (under 28, under 80,
beyond). The Floating Colony draws its hundreds of units instanced in three tiers by camera distance.

## Living systems

- **Flight (Jupiter).** `src/world/fauna/jupiterAir.ts` is an approximate flight model, not CFD:
  - The air: density from the zone's own atmosphere, gravity 24.8 m/s², a wind with vertical shear, meanders and gusts, and convective cells about 1.6 km apart (a rising core, a downdraft ring, each waxing and waning over minutes).
  - The forces: each flyer integrates weight, partial buoyancy, lift ½ρV²S·C_L at a bank angle, drag with an induced term, and limited thrust, all against the relative wind.
  - The Stormskimmer has no thrust at all. It sinks in still air and finds a rising core when low, circling there to climb before gliding on.
  - A torn Skyjelly loses its gas and sinks.
  - Corridors are absolute heights about the cloud-cruise level, so descending really takes the Ranger into the Deepdiver's layer.
  - Unit-tested in `tests/jupiterAir.test.ts`: glide sink, climbing in a core, banking toward a goal, terminal fall, drag-limited drift, the cell field.
- **Sounds.** Each species has its own synthesised call (`src/audio/CreatureVoice.ts`), sent through the medium it travels in:
  - Underwater in the refuge lake: low-passed and quieter.
  - Contact only for the Red Dune Hermit outside, where the air is too thin to carry sound.
  - Hydrogen air on Jupiter.
  - The Crimson Icebloom and Ferric Cathedral stay silent, as the directive asks.
- **Carcasses.**
  - **On Mars:** the Basalt Mimic, when hungry, moves to cover by the Prism Architects' nest and ambushes the young one. It misses more often than not.
    - A kill leaves a carcass that decays on the site's clock: fresh (0–6 h), scavenged (6–24 h), under a spreading biofilm mat (24–60 h), loose plates (60–120 h), then gone.
    - The Mimic scavenges it, and a new young one hatches 72 h after the death.
  - **On Jupiter:** a Skyjelly torn by the Ranger sinks out of the layer, and a Deepdiver takes it as it falls through the lower corridor.
- **Memory between visits.** Saved with the game (`src/world/fauna/memory.ts`, flags `mem:<site>:<key>`). On arrival every system catches up with the time away. What is remembered:
  - **Mars ecosystem:** the biofilm (regrown logistically), each ribbon school's numbers (regrowing), the nest's size (it keeps growing), and the carcass and hatchling clocks.
  - **Prism Architects:** habituation to a calm observer, and separately to the drone.
  - **Basalt Mimic:** lamp exposures. It breaks cover earlier each time, and learns the drone is harmless after three.
  - **Thermal Rift Serpent:** shoves given. It warns sooner.
  - **Subglacial Monarch:** calm inspections. It approaches closer and slower each time.
  - **Stormhunter:** failed intercepts make it assess longer and keep further off. After three long calm encounters it stops turning in.

## Research tools and programmes

`src/world/research/`:

- **Survey drone / ROV (G, on foot):**
  - A tethered camera drone with its own lamp; under water it becomes a slower, battery-limited ROV.
  - Animals treat it by what it is:
    - The Prism Architects warn at it and later learn it.
    - The Mimic learns it is harmless.
    - The Serpent investigates it, displays, and shoves it out of the channel.
    - The Monarch follows it out of curiosity.
    - A crowded Ghost bites at it.
- **Sampler (N):**
  - On Mars: an ice core by the Icebloom, a biofilm swab at the Ferric groves, brine, a borehole through the skylight ice, minerals, regolith.
  - On Jupiter, from Ranger 1: aerosol (Aeromites), colony tissue, haze.
- **Photo mode (B):**
  - Controls: a free camera on a 40 m leash, with zoom (wheel or +/−).
  - Overlays:
    - the species tag with its panel ID and an optical size estimate with uncertainty;
    - the field-note annotation;
    - cave coordinates and depth, or altitude, pressure, temperature and the local wind vector.
  - Capture: saves a JPEG and records the photograph in the codex.
- **Touch:** walking adds DRONE / PHOTO / SAMPLE buttons. The drone and photo modes have their own layouts (stick to move, UP/DOWN, SAMPLE or SHOT, RECALL or EXIT).
- **Staged programmes:**
  - The directive's eight Mars stages and eight Jupiter stages (`programme.ts`), credited strictly in order from codex and sample evidence.
  - Shown on a RESEARCH PROGRAMMES card in the Exobiology tab with the samples taken.
  - Suspended in conservative science mode.
  - Unit-tested in `tests/research.test.ts`.

## Verification

- `e2e/scripts/refuge_steps.mjs`:
  - PART 1 shoots the landform; PART 2 the species close-ups.
  - PART 3 covers sampling, the drone (the Serpent's investigate, display and shove at it), photo mode, the Mimic's kill of the young Prism and the carcass stages over 75 h, and a return visit with memory.
  - PART 4 is conservative mode.
- `e2e/scripts/jupiter_steps.mjs`:
  - PART 7 is the sheet survey.
  - PART 8 covers free flight in the corridors, soaring in a core, the torn Skyjelly sinking and taken by a Deepdiver, the Stormhunter's remembered failure, photo mode in flight, and aerosol sampling.
  - PART 9 is conservative mode.

## Verified in game (this pass)

### Jupiter

| Check | Result |
|---|---|
| Free flight, 60 s | Each species stays in its corridor: Stormskimmers glide at +400…+480 m and sink 0.6–2.9 m/s; the Deepdiver holds −778 m at 69 m/s; the Voltdrifters hover on thrust in a downdraft |
| Soaring | A Stormskimmer put low over a core rising at 9 m/s circled, climbed 300 m in 30 s, then glided on |
| Torn Skyjelly | The Ranger at 147 m/s tore it; it sank 229 m in 20 s at a terminal 12.7 m/s |
| Deepdiver | Took the carcass by its racetrack pursuit after 42 s |
| Stormhunter memory | A broken-off intercept was remembered (`hunter.fails`) |
| Photo mode in flight | Tag `GASGRAZER — jupiter_panel_07`, a size estimate, altitude / pressure / temperature, the local wind; the capture recorded in the codex |
| Conservative mode | No fauna, no air model; the sampler still works; the programme suspended |

### Mars refuge

| Check | Result |
|---|---|
| Sampling | Regolith (N), biofilm and brine all recorded |
| Survey drone | Launched with G and flown from the move input |
| Rift Serpent and the ROV | It investigated the ROV in its channel and displayed at it |
| Photo mode | The Prism Architect tagged and captured |
| Mimic and young Prism | The Mimic killed the young Prism Architect and scavenged it |
| Carcass decay | +30 h: under the mat; +75 h: loose plates |
| Hatchling | A new hatchling after 72 h |
| Return visit | A fresh zone load restored the carcass and the hatchling from memory |
| Conservative mode | The refuge as a bare landform; the codex shows archive hypotheses and the suspended programmes |

### Not checked

Sound is synthesised and scheduled in the code paths these runs exercise, but the headless runs cannot listen to it.

### Captures

`docs/media/`:

- `jupiter_sheet_v3_ingame.jpg`
- `jupiter_stormskimmer_soaring.jpg`
- `jupiter_gasgrazer_comb.jpg`
- `tools_photo_mode_jupiter.jpg`
- `tools_rov_serpent.jpg`
- `tools_photo_mode_refuge.jpg`
- `refuge_mimic_carcass.jpg`
- `refuge_conservative_mode.jpg`

## Far detail, the colony mass, performance, dramatic light (latest pass)

- **Impostors (the directive's LOD3)** — `src/render/Impostors.ts`.
  - **Bake:** each species is rendered once into three small atlases (colour, normals, glow) from 8 headings × 4 elevations.
  - **Display:** at range, an animal is one camera-facing quad. The quad picks the nearest view and rolls with the animal's bank. It is relit by the scene's sun and sky, so it darkens at night; glow organs stay lit, and fog applies.
  - **Switch:** detail levels follow screen size. The model is drawn in full until ~12 body radii away, then the 32 % mesh to 36 radii, the 9 % mesh to 110 radii, then the impostor. The Phone preset switches sooner (×0.45).
  - **Coverage:** every animal model now has the decimated LODs, including the older Jupiter and Mars species.
- **Floating Colony:** one mass ~450 m across, like the poster. It is built of 21 overlapping cumulus lobes, 13 on the Phone preset (`jup_colony_lobe`, with LODs and impostors).
  - Only the bottom layer trails the tendrils, which hang hundreds of metres.
  - Each lobe floats on its own and rides its own air, and soft links pull it back. This is still no rigid body.
  - Small satellite colonies drift around it.
  - Flying into it fouls the intakes; the sampler works within 80 m of any lobe.
- **Skyjelly:** 36k triangles at full detail (was 80k), with 11k and 3k levels.
- **A cost bug found and fixed:** hidden instanced colony units (zero-scale matrices) were still drawn at every LOD tier. The flight view went from 8.7 M to 1.6 M triangles at High.
- **Performance test:** Settings → Graphics → "Run performance test", or open the game with `?bench`.
  - **Route:** a fixed flight through Jupiter's clouds (the flight view, a colony orbit, the animals close up) and a walk through the Mars refuge.
  - **Report:** median fps, 1 % low, draw calls and triangles for the device it runs on.
  - **Measured here:** this machine has no GPU (SwiftShader), so its fps says nothing about a phone. Draw calls and triangles do not depend on the device:

| Preset | Jupiter flight | Colony orbit | Animals close | Mars refuge |
|---|---|---|---|---|
| Phone | 382 draws · 0.56 M tris | 219 · 0.45 M | 192 · 0.51 M | 173 · 0.63 M |
| High | 1195 · 1.61 M | 924 · 1.83 M | 828 · 1.48 M | 941 · 1.98 M |

- **Dramatic light on Jupiter:**
  - **Clouds:** the cloud banks now follow the sun's height. They dim through dusk to dark at night, and the low sun reddens them.
  - **Twilight:** a red-orange band lights the haze toward a low sun.
  - **Nights:** they stay dark, with a smaller eye-adaptation boost.
  - **Lightning:** near strikes are drawn as branching bolts, with a flash that lights the animals nearby.
  - **Comparison:** `docs/media/jupiter_panels_vs_game_dramatic.jpg` puts the nine side by side, panel and game. Dusk light is used for the Stormskimmer, Stormbeast, Colony, Deepdiver, Gasgrazer and Aeromites; night with lightning for the Skyjelly, Voltdrifter and Stormhunter.

## Still not built

- Full resource-field or CFD simulation. The ecology uses budgets (biofilm, carrying capacity, aeromite regrowth), and the air uses the field model above.
