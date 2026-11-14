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

## Verification

- `e2e/scripts/refuge_steps.mjs`: PART 1 shoots the landform; PART 2 the species close-ups.
- `e2e/scripts/jupiter_steps.mjs`: PART 7 is the sheet survey.

## Not built (the directive's wider scope)

- **Simulation depth:**
  - Separate LOD meshes and impostors.
  - Per-species synthesised calls beyond the shared creature voice.
  - Carcass decomposition.
  - Persistent per-individual memory across visits; placement is deterministic, but state resets.
- **Player tools and missions:**
  - The research tools: ROV, boreholes, photo mode.
  - The staged mission sequences.
- **Physics fields:** full resource-field and CFD-style wind and lift fields. The ecosystem uses a simple biofilm and
  carrying-capacity budget, and Jupiter lift is a scripted field.
