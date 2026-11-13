# Miller's Planet — abyssal biosphere (design + status)

Source: the player's master directive (ten species, ecology, tides, research) and ten concept images. The species are
original speculative designs for this game, not canonical Interstellar animals and not established science.
Premise (in-game, labelled hypothesis): the planet carried life from a long earlier history around a normal star before
it was captured into Gargantua's orbit; survivors were filtered by the tides. Local biology runs on local time — time
dilation only affects the mission clock.

## Phase 1 audit (what exists, what must keep working)
- Miller surface: `SURFACES.miller` (style `ocean`), seabed `SurfaceGen.detail` ≈ −0.75 m under still water at 0
  (curvature-corrected `SurfaceZone.waterLevel`). Rescue site: Miller's capsule at (78, −42) from the landing origin
  (`LazarusSites.buildMiller`), beacon, recorder, Dr. Miller beside it.
- Tidal waves: `MillerWaves` (deterministic crests every ~690 s ± 75 s, 105 m/s, 820–1300 m, from the east ±25°).
  `next(x, z, t)` gives each place its own time-to-arrival: the ecosystem's precursors come from it.
  `SurfaceZone.updateTide`: warnings, Ranger ride, player swept (`swimStep`), camera-under-water fog.
- Player: `Player.updateWalk` (no swimming), no suit headlamp on planets (the walk-context `flashlight` action is
  unhandled there).
- Creature framework: `world/fauna/Fauna.ts` (FaunaManager per surface zone, Rig, CreatureVoice, puffs, holds,
  suit damage + visor cracks, settings switch), used by Mars and Jupiter.
- No submersible, drone or ROV exists. The directive's drone/ROV scenes are not built on assumed tools: research uses
  what the player has (eyes, helmet camera, suit sensors).

### Non-regression checklist (run after each phase)
- [ ] Land on Miller (origin), walk the flats, wave warnings at 330/125/35 s, Ranger ride, player swept and recovered.
- [ ] Miller rescue: recorder, Dr. Miller boards, beacon.
- [ ] Mars and Jupiter fauna e2e still pass; settings switches still remove creatures.
- [ ] Creative mode hazard protection: creatures may still hunt and display, but no forced failure.
- [ ] Other worlds land/fly unchanged (style `ocean` is Miller-only).
- [ ] Mobile touch controls (new actions reachable).

## Habitat map (local metres from the landing origin; x east, z south)
Waves come from the east, so the west/lee sides of rocks are wave shadows.
- **Zone A — the flats** (unchanged look, 0.7 m water to the horizon). Two hotspots only:
  - *Black reef* around (−210, 140): low basalt ledges breaking the surface, wet black rock, crevices, a sheltered
    pool (≈2 m) on the west side. Ferracaris colonies, a Breaker Shield nest in the lee notch, a Mimic Crawler den.
  - *Soft hollow* around (150, 230): a fine-sediment depression ≈1.5 m deep. Two or three Sediment Maws.
- **Zone B — the rift**: a channel opening from the reef's west edge, (−330, 200) → (−700, 650), 50–110 m wide,
  floor dropping from −3 m to −45 m, steep basalt walls with ledges and overhangs; mineral vents near (−560, 470).
  Mimic Crawlers, Rift Architects (vents), Luminous Sirens (overhang caves), juvenile Abyssal Stalkers.
- **Zone C — the basin**: (−760, 900), ≈380 m radius, floor −160 m, walls stepping down. Chorus Hunters, Abyssal
  Cathedral, Abyssal Stalkers on the rim ledges, rarely the Gargantuan Crown. Suit rated to 60 m: deeper is visible
  only as darkness below (the giants rise into the reachable band).
- **Zone D — refugia**: the basin floor and rift overhangs, where the surge is weakest (flow falls with depth and in
  rock lee); the ecosystem moves animals there before a crest.

## Species registry (game-design estimates)
| id | name | size | zone | locomotion | senses | diet / role | threat |
|---|---|---|---|---|---|---|---|
| ferracaris | Ferracaris depressa | 8–30 cm | A reef rocks | many-legged crawl, clamp | touch fringe, flow | biofilm grazer | none |
| sedimentmaw | Sediment Maw | 1.2–2.5 m | A soft hollow | buried; digging paddles | tactile rim, flow, chemical | suction ambush, small benthic prey | foot entrapment, fall |
| mimic | Mimic Crawler | 1.5–2.8 m span | A reef, B | 8-limb crawl, jet | eyes, chem, touch | omnivore, scavenger, curious | grapple + bite if cornered/nest |
| architect | Rift Architect | 0.8–1.8 m | B vents | 6 legs + 2 manipulators | multi-eyes, tendrils | benthic omnivore, builder | nest defence swipes |
| breaker | Breaker Shield | 2–4 m | A reef lee | 6 thick legs, bracing | flow, vibration, chem | biofilm/carrion browser | shove/ram near nest |
| siren | Luminous Siren | 0.6–1.5 m | B caves | fin undulation | low-light eyes, flow | lure predator of small prey | defensive nip |
| stalker | Abyssal Stalker | 5–8 m | B/C overhangs | tail burst | flow → vision → electric | ambush medium swimmers | strike if cornered/feeding |
| chorus | Chorus Hunters | 2–3.5 m (3–8) | C channel | sustained swim | clicks/echo, contact calls | social predator | investigate, rarely strike |
| cathedral | Abyssal Cathedral | 12–18 m | C basin | slow wing strokes | flow, low light | plankton filter feeder | collision, wake |
| crown | Gargantuan Crown | 8–11 m | C deep (rare, 1) | burst + patrol | flow, chem, acoustic | apex, medium-large prey | committed strike, rare |

## Reference images — what each shows (shape notes for modelling)
1. **Chorus Hunters**: five long ichthyosaur/whale-like swimmers. Narrow tapering snout, slightly hooked tip; a long
   gape with pale lip line; a row of pale sensory pores along the top of the snout; small eye high behind the gape;
   8–10 pale gill slits on the throat; long swept-back blade pectoral fins with rays, a smaller pelvic pair; a low
   dorsal ridge/crest; horizontal crescent fluke with a long upper blade. Dark blue-grey, iridescent, faint flank grooves.
2. **Luminous Siren**: slender glass-clear eel body, dark mottled visceral core; small head, pointed snout, needle
   teeth, large eye; a thin clear stalk from the crown arcing up and forward into a loop, ending in a cyan teardrop
   light hanging before the face; two pairs of big fan fins with rays (pectoral, larger pelvic), a sail-like dorsal
   membrane, a broad forked fan tail.
3. **Sediment Maw**: a low mound in sediment, back crusted with sand and dark pebbles; a huge round funnel mouth with
   ribbed, radially pleated inner walls and fleshy rim; thick ringed (annulated) digging limbs at the sides, two to
   three per side, curling into the water.
4. **Mimic Crawler**: octopoid; mantle and limb tops shingled with rough rock-mottled plates (charcoal, bronze, rust
   specks), heavy brow plate over a large gold eye with a dark slit pupil; eight thick limbs, armoured above, pink-purple
   undersides with suckers and curved hooks, a pointed claw at each tip, bristly distal fringes; holds a small
   cylindrical probe.
5. **Gargantuan Crown**: broad flat head head-on; a crown of thick curved mineralised ridges — two central ones
   sweeping up and back, two to three per side curving out; ridged brows; small eyes; huge maw with long recurved pale
   teeth in rows, dark red gums, fine barbels under the jaw; glossy black wrinkled skin; broad pectoral fin, big tail.
6. **Ferracaris**: flat oval grazers; overlapping translucent amber-olive plates with scalloped rear margins and pink
   rims, a broad head shield, a fringe of clear pink filaments around the margin, many short pale jointed legs beneath.
7. **Rift Architect**: crab-like; broad spiny overlapping carapace (purple-grey, rust/yellow encrustation); a cluster of
   small black bead eyes on the front; long thin tendrils under the face and two long antennae; two slender
   multi-jointed manipulators with fingered grippers; six thick plated walking legs; stacks flat stones and nacreous
   shells around a crevice holding pearl-white eggs; vents nearby.
8. **Breaker Shield**: huge turtle-like; carapace of big shingled serrated plates with up-turned points, a helmet-like
   head shield, small dark eyes, thick hanging mouth feelers/mandibles; plated thick forelimbs with broad clawed feet;
   speckled pale eggs beside it.
9. **Abyssal Stalker**: black eel/pliosaur; long flat crocodilian head, rows of needle teeth, small side eye; dark
   blue-black wrinkled skin; two big ray-membrane pectoral fins, a pelvic pair, long tail with a flat fin.
10. **Abyssal Cathedral**: colossal manta-whale; long wings with fringed iridescent ray edges; domed head sculpted with
    bony ridges and hollows; enormous mouth packed with pale lace-patterned vertical filter lamellae; faint cyan
    dotted bioluminescent lines on the jaw/cheek; slate blue.
The images' ringed planet in the sky is not added (Miller's sky shows Gargantua and its disk).

## Tidal ecosystem states (from MillerWaves.next at each animal's position)
0 quiet (tta > 240 s) · 1 precursors (240–120 s: current shifts, pressure pulses) · 2 anticipatory retreat (120–40 s)
· 3 high hazard (< 40 s or the crest overhead) · 4 post-wave (≤ 90 s after the crest, sediment settling).

## Phases
1. Audit + this doc — done.
2. Habitats (reef, pool, hollow, rift, basin), underwater (swim, helmet lamp L, depth light, murk, marine snow, depth
   gauge + 60 m suit rating, deep surge instead of the sweep), tidal states, Settings → Alien life → Miller — done.
3. Vertical slice — done, verified in-browser (`e2e/scripts/miller_steps.mjs` PART 2):
   - Ferracaris colonies (instanced, shader legs/fringe) on the reef's wet rock at the waterline; graze, clamp on a
     fast pass or rising flow, hide in fissures before a crest, some swept away, juveniles resettle later.
   - Sediment Maws buried in the hollow (only a faint pucker ring and breathing puffs give them away); footstep
     vibration → snap-open suction pulse (short range) → boot clamped (E to pull free) or a costly miss; relocate
     after repeated disturbance; bury deeper before a crest.
   - Mimic Crawler in the pool's den with a clutch of eggs: camouflage shader (rock mottle ↔ own colours), eyes
     track; forages; inspects and carries Miller's drifted instrument canister into its den; rippling-band warning
     near the eggs; a leg grip and bites only if the intruder stays; a cooldown after a grapple (time to back off);
     memory of encounters (reaches earlier next time); goes home and compresses before a crest.
   - Field log: sightings and witnessed behaviours stored as `bio:<species>:<key>` flags (saved with the game).
4. Remaining seven species — done, verified in-browser (`miller_steps.mjs` PART 3):
   - Breaker Shield (reef lee nest): browses; faces an intruder between it and the eggs, shield up, knocks on the
     rock; a short shove only if crowded; flattens over the nest before a crest.
   - Rift Architect (by the vents): carries loose stones and nacre to the wall round its egg crevice and fits them;
     a crest knocks part of the wall down and it rebuilds; threat posture and a swipe only near the eggs.
   - Luminous Siren (rift walls): hovers with a pulsing lure (a real point light); small drifting animals gather and
     one is snapped up now and then; a flash and retreat if disturbed; dims and shelters before a crest.
   - Abyssal Stalker (basin rim ledges, an adult and a younger one): ambush stillness; investigates lamp and movement
     at a distance; crowded at its ledge it goes still (telegraph), then one straight burst (no homing) and tires.
   - Chorus Hunters (a pod of 5 with a juvenile): loose flocking without a rigid leader, per-animal click patterns,
     investigate a diver and move on, flank and burst into a prey school (some prey eaten, the school refills
     slowly), regroup deep before a crest.
   - Abyssal Cathedral: wide slow circuits, feeding passes with the mouth open through a plankton bloom, luminous
     lines; its wake shoves a diver who gets too close (no attack); goes deep before a crest.
   - Gargantuan Crown (one): patrols below the suit's reach, deep pulses heard first, rarely rises; circles a lamp
     out of interest and leaves; only if pressed with the lamp at close range: display (jaw open, broadside), then
     one heavy burst; goes deep before a crest.
5. Ecosystem/wave integration — tidal states drive every species (above); the post-wave state knocks the
   Architect's wall down and sweeps unsheltered Ferracaris away (juveniles resettle).
6. Research database — Mission computer → EXOBIOLOGY: per species OBSERVED (dated evidence actually witnessed),
   WORKING HYPOTHESIS (unlocked by confidence: sighted → behaviour noted → studied) and UNKNOWN.
7. Verification — `miller_steps.mjs` PART 1 (habitats/underwater), 2 (vertical slice), 3 (deep species + field
   database); regression: Miller rescue (`lazarus_steps.mjs`), Mars fauna, unit tests.

## Known limits (honest list)
- No submersible, drone or ROV in the game: research is done on foot with the suit (eyes, helmet camera).
- Prey for the Sediment Maw and Mimic Crawler (small benthic animals) is implied, not simulated as individuals.
- The suit is rated to 60 m; the basin's floor (−160 m) is out of reach by design (a pressure blackout floats the
  diver up at 35 % integrity).
- Caves are separate rock shells at five habitat spots (two siren shelters, two stalker ledges, the mimic den); the
  rest of the rift is still heightfield walls and ledges.
- Skin detail is procedural (object-space noise), matched to the images by colour, pattern and relief; it is not
  hand-painted and not photographic. Hatchlings/calves/young are separate models, but there is no growth over time.
- Juvenile Ferracaris are not modelled separately (a colony's sizes vary 0.55–1.15 ×); the Sediment Maw and Rift
  Architect have no young in the world (the Architect's eggs are props).
- The deep stays dark without a light, as it should; the helmet lamp (L) and the creatures' own light are the light.

## Realism pass — what was done
1. **Pipeline.** `blender/lib/organic.py`: smooth parametric bodies (Catmull-Rom cross-sections, outward normals,
   displacement callbacks for keels, grooves, gill slits, cavities), plates that conform to a body or limb surface
   (domed, keeled, pointed, spined, polygonal), rayed fin membranes (corrugation, scalloped/ruffled edges, droop, ray
   tubes), curved fangs, ringed limbs, eyes with iris/pupil/cornea. Ambient occlusion is baked in Cycles to a vertex
   layer (`AO`, exported by name) and used at runtime for indirect light and partly the albedo.
2. **Skin** (`src/render/CreatureSkin.ts`): every Miller material has a spec — domain-warped scale cells, ridged
   wrinkles, pores, two mottle layers (one can be streaked along an axis), reticulation, spots, countershading,
   lattice cut-outs (the Cathedral's filter plates), derivative bump, wet darker cavities. Patterns are in bind-pose
   object space (glued to a bending body, no UV seams); each relief layer fades as it nears pixel size (no glitter);
   the lowest graphics preset keeps the colour layers and drops the costliest relief.
3. **Models** rebuilt against each image (`fauna_miller_deep.py`, `fauna_miller_shore.py`):
   Crown (ridged skull, five tines per side with barbs, irregular recurved fangs on swollen gums, beard of barbels,
   swept rayed pectorals, crescent tail); Stalker (flat crocodilian head, brow ridges, sensory pits, needle teeth,
   rayed paddle flippers, down-bent tail into a crescent); Chorus (long pointed snout, gape line, golden lateral dots,
   seven pale gill slits, flank grooves, serrated crest, sickle pectorals); Cathedral (sculpted cranial cavities and
   arches, lattice filter plates in a fan, pleated throat pouch with lines of cyan light, feathered manta wings);
   Siren (glass body over a mottled organ mass, underslung needle jaw, fan fins with ragged edges, flowing tail,
   arched lure); Breaker (keeled overlapping scutes, spiked skirt, helmet casque, ringed feelers, banded limb armour,
   clawed toes); Architect (serrated plates crusted with tubercles, marginal lobes, rostrum over six eyes, whiskers,
   spined manipulators with jointed fingers, armoured flattened legs); Mimic (leaf-scale mantle, slit-pupil eyes under
   brows, scaled arms with cupped suckers, curved hooks, bristles, tip claws); Sediment Maw (fluted, nodular funnel,
   rolled ringed lip, dense grit, ring-segment limbs); Ferracaris (scalloped lobed plates, fine translucent fringe,
   ringed legs).
4. **Young**: own models with juvenile proportions — Chorus juvenile, Stalker young (short snout, big eyes, fine
   teeth), Cathedral calf (keeps station under its mother's wing), Breaker hatchlings (scatter round the nest, run
   under the adult's shell), Mimic juvenile (watches from a crack by the pool, flattens into it).
5. **Prey** (`src/world/fauna/prey.ts`): instanced lantern shrimp drawn to the Siren's lure and snapped up, a dart-fish
   school that schools (cohesion, separation, alignment) and scatters from the Chorus Hunters and from divers, a krill
   swarm the Cathedral filters (the swarm visibly thins where it passed; it refills slowly). Each animal turns along
   its motion and swims with a body wave in the vertex shader.
6. **Caves** (`blender/assets/miller_caves.py`, `src/world/surface/millerCaves.ts`): rock shells with arched openings
   and trimesh colliders — a shelter at each Siren perch, an overhanging ledge over each Stalker post, the Mimic's den.
7. **Deep light**: two-component water attenuation (red/green gone in tens of metres, the blue part carries much
   deeper), a floor of scattered water light, a stronger wider dive lamp with a soft suit flood light, and the lamp
   beam made visible by suspended particles.
8. **Verification**: e2e PART=8 (close-up skin survey), PART=9 (caves, prey, young, the deep through the player's lamp),
   PART=10 (an unforced crest with every species, state logged every 5 s).
