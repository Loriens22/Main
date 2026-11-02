# Progress log

A concise record of what was built, how it was verified, and what is still open.
The newest entries are at the top.

## 2026-11-01 — Hero buildings in Blender, BILLA, parks, shops and murals

Request: much more detailed NDK, Grand Hotel Millennium and Bulgaria Mall, the missing BILLA next to the mall,
more diverse residential buildings, parks and shops inside and out, built in Blender, in stages, with
research; the user then supplied photographs of the mall and BILLA, the Millennium Center and the bTV tower,
and the NDK.

### Stages

1. **Research:** photo hosts are blocked here, so facts come from search summaries and the
   user's photographs (sources in `data/research/heroes/README.md`). BILLA was found in the place data
   at бул. „България“ 55, inside OSM way 203333240, a retail building the world builder had dropped.
2. **NDK** (`tools/blender/hero/ndk.py`): the palace on its six OSM parts.
   - Stone towers, bronze glass behind white fins with stepped ends, the ledge band, the sun panel.
   - The upper storey under the cornice, vaulted skylights, copper roofs and stage towers, the terraces.
   - The fountain court with its sphere and jets, the flags, the screen.
   - The cascade to the north with paired lit jets, herringbone edges, planting beds and globe lamps.
3. **Millennium Center and the bTV tower** (`millennium.py`, `btv.py`), from photographs 4–6.
   - The hotel's zig-zag frame, ledges, sky bar and helipad.
   - The base with the lattice, fins, canopy, shops and flags.
   - The office tower's ДЗИ / ОББ crown and the residential tower's balconies.
   - The NDK administrative tower with its concrete trays, ribbon windows, AC units and roof lettering.
4. **Bulgaria Mall and BILLA** (`mall.py`, `billa.py`), from photographs 1–3.
   - The mall: towers and slab with terrace stacks, the pixel-clad podium with its letters and shop signs,
     the glass entrance block with the BULGARIA MALL canopy and café, the freestanding letters, the
     billboard.
   - BILLA: the store, banner, poster, umbrellas, entrance with the supermarket behind the glass, the
     pylon with its letters and tenants, the canopies.
   - `tools/build_world.py` now keeps the part of an outline its mapped parts leave uncovered, which
     restored BILLA, the mall's entrance block and 38 other buildings on line 7.
5. **Residential:** original murals on the blank gables of tall slab blocks (65 on line 7) and roof gardens
   with planters, pergolas and deck chairs on some flat roofs.
6. **Parks:** the Blender street kit (`tools/blender/kit_street.py`, 30 pieces, vertex colours with baked
   occlusion), placed by `src/world/CityExtras.js` in the OSM playgrounds and parks near the route.
   - Playground sets: swings, slide towers, spring riders, sandboxes, see-saws, carousels, climbing
     pyramids.
   - Park furniture: gazebos, pergolas, drinking fountains, flower beds, fitness bars, table tennis,
     kiosks, bins.
   - Lanterns along the park paths.
7. **Shops:** the props in front of each real shop by its kind: café terraces with parasols, sandwich
   boards, fruit stands and freezers, florists' buckets, the green pharmacy cross, bank ATMs, entrance
   planters. The hero buildings' shop windows have rooms behind them: a café, a lobby, fashion with
   mannequins and racks, a supermarket with shelves and checkouts.

### Pipeline

- `tools/blender/hero/herolib.py` reads the world pack's footprints and terrain (the same triangles as the
  game) and builds in game coordinates.
  - Material names tell the game what to draw: curtain walls with lit windows at night, panels, stone,
    signs, glows, glass, water, interiors.
  - Real 3D letters come from Blender text.
  - Cycles bakes ambient occlusion to a second UV set.
- `tools/optimize_glb.mjs` (gltf-transform + meshopt) shrinks the GLBs, for example the mall from 3.5 MB to
  588 KB. It drops the UV sets a material does not use and quantizes the rest.
- `src/world/HeroBuildings.js` and `HeroStyle.js` load them and map materials. The procedural landmark
  builders stay as fallbacks.
- Sizes: NDK 360 KB + 251 KB AO, Millennium 489 + 187, bTV 345 + 97, mall 588 + 253, BILLA 176 + 66, street
  kit 182 KB.

### Verified

- Blender previews from the photographs' viewpoints, then in-game screenshots of each building.
  - From бул. „Тодор Каблешков“ and from the tram stop on бул. „България“ (mall, BILLA, pylon).
  - From бул. „Витоша“ (hotel entrance, bTV tower).
  - From the north along the cascade, from the north-west, and from street level near the tram (NDK).
- Playgrounds, a gazebo with a flower bed, café terraces, murals and roof gardens in game.
- Lines 280, 64, 12 and 7 load with the city extras in the production file with no errors; line 64 first
  exposed a crash (glow proxies without `userData` in the night list) and a slow route-distance query, both
  fixed.
- At night the NDK's fins are floodlit and the fountain floors lit from under the water (`lit:` materials).
- Unit tests 48 / 48.

### Open

- The road tunnel under the NDK plaza is not modelled: бул. „Ген. Скобелев“ crosses the plaza at grade as in
  the map data, and the fountain basin round that crossing is left out.
- The street kit and murals cover the corridor of each line (about 140–380 m either side), not the whole map.

## 2026-11-01 — Expansion 4.0: tram line 7 (кв. Манастирски ливади – запад ↔ Метростанция „Хан Кубрат“)

Request: tram line 7 with the PESA Swing 122NaSF (photos 1–5) and the Inekon T8M-700IT (photos 6–10),
50 / 50 dispatch, all 18 stops per direction with their direction codes, the corridor shared with line 12,
NDK, the Grand Hotel Millennium, бул. България, Central Station, Пета градска болница, Хан Кубрат, markets
and shops, neighbourhood building types, announcements.

### Built

- **Data:** the 36 stop codes matched to their OSM tram stop positions; the route on the OSM tram tracks,
  8.93 km each way through the loops at Хан Кубрат (390 m) and Манастирски ливади – запад (166 m); terrain
  grid and world pack (14 586 buildings typed by neighbourhood, 598 shop signs); building profiles for the
  corridor (Белите брези revised, five added as estimates); the 2026 changes on бул. Княгиня Мария Луиза as
  unverified variants.
- **Kinematics:** sections on one fixed bogie and sections hung between their neighbours' joints; on 25 m and
  18 m curves every joint stays within 2–3 cm (unit test).
- **PESA Swing 122NaSF:** five sections on three fixed low-floor bogies (independent wheels, motors along
  the frame), cabs at both ends, sliding plug doors on both sides, louvred bogie covers, the lofted cab with
  the panoramic windscreen, lamps on chrome lines, LED displays front, rear and sides, "SWING Sofia" and
  "pesa" on the windows; inside the orange poles and hanging loops, the dark blue accents, the striped glass
  screens at the doors, information screens, 41 seats with the wheels under podiums; VVVF inverter sound,
  four-beep door warning, its own gong.
- **Inekon T8M-700IT:** raked angular cab with the yellow-green LED display, three-lamp housings, the
  orange rising on the cab sides, the low centre section with the V-dip in the livery and its ramp, five
  folding doors with yellow handrails behind the glass, four steps up into the high-floor ends, the rear
  with its window and round red lamps, diamond pantograph and roof equipment; chopper sound.
- **Blender:** Cycles light bake of both trams (`tools/bake_bus_lightmaps.sh pesa inekon`).
- **Shared tracks:** line 12's trams run on line 7's world between пл. Македония and Триъгълника with their
  own stops (`SharedTrams.js`); trams see the trams of either line on the track ahead; the driven tram stops
  against another tram.
- **Landmarks:** НДК (six OSM parts: stone, bronze glass leaning out, the crown, the glazed portal with
  Chapkanov's Sun, terraces, staircase, flags, fountain jets), the Millennium Center (hotel tower with the
  lattice and the glazed crown, office and residential towers, the base with the hotel entrance), МБАЛ
  „Княгиня Клементина“ (the former Пета градска болница), Bulgaria Mall and its towers, the metro entrances;
  Central Station shared with line 12.
- **AI and contacts:** a tram that touched a car waits for it to clear instead of nudging it again; only
  the leading section can run into a car (a car beside a rear section on a curve no longer stops the tram).
  An Inekon run had 37 contacts at Петте кьошета and a PESA run 14 before Македония; now 1-4 a trip.
- **Shared stop codes:** with a line 7 and a line 12 tram at the same stop (1254 and others), each boarded
  passenger belongs to the tram they walk to; before, both trams waited for each other's passengers and one
  stood at Пета градска болница with its doors open (found by the route check). The AI closes its doors
  after two minutes at the latest.

### Verified

- Unit tests: 48 pass (new: line 7 dispatch, seat count, suspended sections on curves, the low-floor
  wheels under the podiums).
- Whole route with the AI driver, all stops served, with line 12's trams on the shared stretch: PESA A
  18/18 (26 min), PESA B 18/18 (25 min, 1 contact with a car), Inekon A 18/18 (27 min, 4 contacts), Inekon B
  18/18 (27 min, 2 contacts).
- The production file loads without errors on line 7 (driver, high; passenger, balanced, at night), line
  12 and line 280; a passenger rides a PESA through all five sections; the menu fits phones in portrait and
  landscape with the fourth line.

### Estimated (no reachable drawings or photographs)

Section lengths, bogie and door positions of both trams beyond the published lengths, the PESA's mass and
the Inekon's traction power; the facade compositions of NDK, the Millennium Center, the hospital and the
mall. Details and sources: `data/research/line7/README.md`.

## 2026-10-31 — Fix: Start button out of reach on small screens

On screens up to 820 px wide (phones in portrait, small phones in landscape) the passenger and driver
options panel and the settings panel lost their scroll container and ran off the bottom of the
screen, so Start could not be reached (passenger mode on 320×568, 360×640, 375×667, 568×320, 640×360,
740×360). The panel now covers the screen inside the safe areas and scrolls by itself, with Start
pinned at the bottom. Checked with touch swipes at 15 screen sizes from 320×568 to 1280×720: Start
(and Back in the settings) reachable on all.

## 2026-10-31 — Line 12: rails, poles, tram floors, more detail, landmarks, shops

Requests: rails sitting on kerbs or on each other, poles passing through the trams, wheels visible
inside the trams, trams without colliders, more detailed trams one-to-one with the photos, the main
buildings of line 12 one-to-one after research, shops with real exteriors and interiors.

### Fixed

- **Rails:** where the tram corridor is not a road (squares, medians, the Triangle loop, Граф
  Игнатиев) the world laid paving and kerbs over it and the street track ran underneath. The track
  panel now sits on whatever surface is there (road level in the carriageway, paving level
  elsewhere, ramps between, concrete edges where it stands above the ground) and the tram physics
  rides on the drawn rail height. Where two OSM edges overlap (points, duplicated ways: 41 pairs over
  8 m) the track is drawn once.
- **Poles:** catenary poles were placed only away from their own track; 130 stood inside a tram
  body somewhere on the line. A curve-aware envelope of every track (half body, mirrors, swing-out
  of the overhang) now keeps catenary poles, lamps, signals, trees, shelters and parked cars out;
  a sweep of both trams along both directions finds none inside.
- **Wheels inside:** the T6M's saloon floor was never emitted (the floor loop missed the end of the
  section), so the bogies showed; floors are built to the end of every section (unit test over
  every wheel). The round fan heaters, which looked like wheels, are now drums under the seat as in
  photo 7. Step wells cut the floor, stay outboard of the wheels, treads the right way round.
- **Colliders:** pedestrians wait for a tram standing across their way (the player, cars and the
  trams themselves already used the body boxes).

### Built

- Schindler: outward-swinging doors with fixed outer steps (photo 4), the destination box across
  the front with the blinds to the left, narrower roof box, knee-height crease, builder's plate,
  split cab windows, door lamps. T6M: the orange sweep of the front livery, chrome-ringed
  headlamps, round indicators, bumper bar (photo 10). Rain gutters on both.
- Blender (Cycles) light bake of both trams (`tools/bake_bus_lightmaps.sh schindler t6m`).
- Landmarks: храм „Свети Седмочисленици“ (all three OSM parts), УАСГ twelve-storey block (three
  parts and the podium) and rectorate.
- Shop fronts with interiors (`ShopFronts.js`): 845 shop fronts in the line 12 world.

### Research (sources in data/research/line12/README.md)

The searches gave the history of the church (1902 conversion, architects), the City Library's
architect and the Ministry of Agriculture's address and architect; no reachable source gave
drawings or facade descriptions of the UASG buildings, the КНСБ building or "TELUS Tower", so their
facades are typed from the building class and marked estimated.

## 2026-10-30 — Expansion 3.0: tram line 12 (кв. Илиянци ↔ пл. Журналист)

Request: tram line 12 with the Schindler/Siemens Be 4/6 S (photos 1–6) and the T6M-700 (photos
7–10), 50 / 50 per service, 1 009 mm track, overhead line, rail physics, a tram cab, passenger
mode, announcements, the regular 21-stop route per direction with a separate variant for the
temporary diversion, the landmarks along the line, mobile controls, all existing features kept.

### Built

- **Data:** `tools/build_tram_route.py` routes each direction on the OSM tram tracks between the
  stop positions matched by code (no turn over 40° at a node), through both terminal loops;
  street-running flags, 1 177 track edges and 238 switches round the line; world pack of 13 974
  buildings; 22 neighbourhood profiles for the districts on the line. Route variants are data
  (`variants` in `route12.json`), apart from the regular route.
- **Infrastructure:** rails, grooves and concrete slab on street track, ballast, sleepers and
  Vignole rails elsewhere, poles with brackets or cross-spans, contact wire and droppers
  (`TramTracks.js`); trees, lamps and parked cars kept off every track (`SweptPath.addTracks`).
- **Rail dynamics** (`TramDynamics.js`): the track line of a direction; supports placed so the
  chord between them equals the body (sections meet at their joints on curves); the carried
  low-floor module solved between the end sections; notched controller, adhesion and slip,
  sanding, rheostatic and friction brakes, magnetic track brakes, Davis resistance, gradient,
  door interlock, main switch, pantograph.
- **TramEntity:** the BusEntity interface (camera, scoring, passengers, pedestrians, sound and
  traffic work unchanged); speed limits from line, road, curves and points; derailment
  protection; head-on contacts with cars stop the tram; cars clear the track.
- **Models** (`src/vehicle/trams/`): shells with real window and door openings, folding doors,
  cab fronts and rear ends, destination blinds / number boxes, bogies posed on the rails,
  single-arm (Schindler) and diamond (T6M) pantographs raised to the wire, bellows, saloons from
  the seat maps (Schindler 2+1 blue moquette, low-floor module with steps; T6M grey plastic,
  orange poles, fan heaters), cabs with the controller and the instrument panel.
- **Gameplay:** tram driver controls and checklist, HUD notch display and line speed, AI tram
  driver (speed planning from the limits ahead, stops, signals, cars, the tram ahead), passenger
  mode across all sections, menu entry with the diversion notice, touch controls with a
  controller lever.
- **Sound** (`TramVoice.js`): gear whine, the Schindler's chopper, the T6M's DC motor and
  contactor steps, rolling noise darker on street track, rail joints per bogie, flange squeal in
  tight curves, brake squeal, the gong.
- **Central Station** hand-built on its footprint (`landmarks12/station.js`); **пл. Славейков**
  with the bronze bench of Petko and Pencho Slaveykov and the book market stalls
  (`landmarks12/slaveykov.js`).

### Verified

- `npm test`: 45 tests, including `tests/tram.test.js` (dispatch, specs, joints on 25 m and
  18 m curves, bogies on the rails, traction, stopping distances, adhesion, track line).
- Route check (AI tram, every stop served): Schindler A 21/21 in 31 min, Schindler B 21/21 in
  27 min, T6M A 21/21 in 34 min, T6M B 21/21 in 27 min (game time).
- Driver mode with both trams (start-up, notches, braking), passenger mode (boarding, walking
  through the gangway, riding), offline audio levels (cab −25 dB at 30 km/h, peaks below −3 dB).

### Open

- Landmarks along the line other than Central Station and пл. Славейков (Граф Игнатиев's
  buildings, пл. Гарибалди, пл. Македония, УАСГ, пл. Журналист, Стоков базар Илиянци, Пета
  градска болница) are OSM massing with the neighbourhood-typed facades.
- The diversion variant needs a verified stop list and path before it can be driven.
- Tram stops use the existing stop hardware on the OSM platforms; dedicated island platforms
  with tram shelters are not modelled.
- Unity and Unreal Engine 5 are not used (not available here, and neither can export into the
  single offline HTML file); the trams are procedural three.js geometry, not Blender kit parts.

## 2026-10-30 — Blender: buildings, landmarks, buses and baked bus lighting

Requests: a large upgrade of the buildings (the main ones on both lines in detail), the buses
one-to-one with the reference photos inside and out, better kerbs, road markings and graphics,
architecture that matches each neighbourhood (Кръстова вада: new 2005–2025 buildings, some tall),
all of it built "with Blender and Unity / Unreal Engine 5".

### Tools

Unity and Unreal Engine 5 are not used: neither is available in the build environment, Unreal
Engine 5 has no web export, and a Unity WebGL build is a separate player, not a scene inside the
single offline HTML file. Blender 5.2 (`bpy`) is the modelling and baking tool; three.js loads its
output. Four scripts in `tools/blender/` (README, *3D assets made in Blender*):

- `kit_facade.py`: facade and roof kit along the routes (24 pieces, one atlas, 570 KB).
- `kit_landmark.py`: sculpture and ornament for the landmarks (one atlas, 630 KB).
- `kit_bus.py`: tyres, steel and aluminium wheels, the seat shells of the four buses, straps,
  the Sofia validator, the MAN mirrors and the steering wheel (2048 atlas, 2.4 MB).
- `bake_bus_light.py`: Cycles light bake of the static body and cabin of every bus.

### Graphics, roads and buildings

- GTAO ambient occlusion from the scene's depth buffer (full resolution on Ultra, half on High,
  off on Balanced); a cabin-scale profile while the camera is inside a bus.
- Kerbs as real stones with dropped kerbs and tactile bands at crossings; slab and block paving;
  gully grates and manhole covers; yellow zig-zags at the stops of the line.
- Facade windows sit in a recess with parallax reveals; the facade kit is placed from the
  facade shader's own cell plan (units under windows, dishes on walls facing the satellites,
  downpipes on corners, lift rooms over staircases).
- Buildings typed by neighbourhood (`data/research/world/neighbourhoods.json`,
  `NEIGHBOURHOODS.md`): Кръстова вада and Манастирски ливади are new buildings with cladding
  accents, glazed balconies and a set-back top floor; Бояна and Драгалевци villas and low-rise
  complexes; the centre interwar buildings; Стрелбище, Хиподрума, Младост and Дървеница keep
  their panel blocks.
- Landmarks get real window openings, stone surrounds, pilasters and curtain walls with
  mullions, and the Blender sculpture.

### Buses

- Matched-camera comparison with the reference photos (camera fitted to each photo), then fixes
  per bus: MAN white shoulders rising to the A-pillars, windscreen down to 1.16 m, headlamps with
  two chrome bowls, ram's-horn mirror; Procity front cleaned up (band and lamp clusters); Conecto
  fleet number and lenses; interiors after the cabin photos (MAN ducts with slot grilles, light
  floor, grey seat tops; Procity neutral walls; Yutong silver poles and perforated ceiling;
  Conecto downlights and ducts).
- Glass with a Fresnel term (see-through square-on, mirror-like at grazing angles), a street
  skyline in the environment map, darker glazing outside and eye adaptation inside.
- Cabins kept inside the skin: flat panels, dashboards and rear walls built to the full cabin
  width stood out of the rounded corners as slabs (`clipFront` / `clipRear`).
- Mirrored parts had correct normals but reversed winding, so the renderer drew the inner far
  wall of every pole, strap and rail tube; `Parts.add` now turns such triangles.
- Driver's view: the clear screen beside the driver no longer stands in the windscreen, satin
  wheel badge, smoked sun blinds.
- **Baked lighting** (`src/vehicle/BusLightmap.js`): the static meshes of each bus are unwrapped
  into a lightmap atlas, exported, lit in Cycles by a uniform sky with three diffuse bounces, and
  the result is applied as the ambient-occlusion map of those parts. The cabin's sky light now
  falls off from the windows to the aisle, under the seats and into the door wells instead of
  being one constant; the body gets contact shading in the arches, door recesses and round the
  roof equipment. Two detail levels per bus (Ultra/High and Balanced); the geometry signature
  keeps a stale bake from being applied.

### Verification

- `npm test`: 38 / 38 (new: lightmap layout determinism, bounds, signature, detail levels);
  `tools/smoke.sh`: driver, passenger and bus studio load without errors.
- Full trips with the AI driver (`tools/route_check.cjs`, on the build before the light bake,
  which changes no physics): MAN 280 A 18 / 18 in 25 min, Conecto 280 B 18 / 18 in 32 min,
  Procity 64 A 35 / 35 in 40 min, Yutong 64 B 33 / 33 in 38 min.
- Light bake (`tools/bake_bus_lightmaps.sh`, Cycles on 4 CPU cores, 128 samples at 2048 px for
  Ultra / High, 96 at 1024 px for Balanced; about 100 s per bus at 2048):

  | Bus | Baked meshes (High) | Charts (High) | Texels per metre (2048 / 1024) | Maps (2048 + 1024) |
  | --- | --- | --- | --- | --- |
  | MAN Lion's City G | 44 | 3383 | 61 / 22 | 328 + 198 KB |
  | Mercedes Conecto G | 37 | 4110 | 60 / 19 | 398 + 257 KB |
  | BMC Procity | 27 | 2541 | 72 / 27 | 276 + 160 KB |
  | Yutong ZK6126HGA | 24 | 2269 | 81 / 29 | 262 + 158 KB |

  The maps apply in the game on High and Balanced for every bus (checked through
  `model.lightmapped`); the open-sky reference square bakes to exactly 1.0.
- Draw calls and triangles per frame in the cab at the start of the route at noon, shadow pass
  included: line 280 (MAN) High 1093 / 1.57 M, Balanced 631 / 0.80 M; line 64 (Procity) High
  1058 / 1.15 M, Balanced 601 / 0.64 M. That is more than on 10-24 (280 High 848 / 0.71 M): the
  facade kit, kerbstones, paving and landmark detail; the light bake adds no draw call.

### Still open

- The bake holds sky light only; the sunlit floor and seats would also throw light onto the
  ceiling, which the game approximates by applying 80 % of the baked cabin shading.
- The instanced Blender pieces inside the cabin (seats, straps, validators) are not in the
  lightmap; they keep the uniform cabin factor and their own baked contact shading.
- A change to a bus model needs a new bake (`tools/bake_bus_lightmaps.sh`); until then that bus
  falls back to its unbaked lighting.

## 2026-10-24 — expansion 2.0: line 64, three more buses, dispatch, landmarks

### Milestones

1. **Vehicle framework.** A registry of bus specs (`src/vehicle/Vehicles.js`): dimensions,
   doors, seat layout, physics (torque curve, gearbox, mass, steering lock), engine sound
   profile, door warning, fleet numbers. Rigid and articulated physics share one model;
   the AI, cameras, lights, audio zones and passengers read the spec of the bus they are on.
2. **Buses.** Mercedes-Benz Conecto G (280), BMC Procity 12 CNG and Yutong ZK6126HGA (64)
   built after the reference photos, each with its own cab and instrument cluster
   (VDO round gauges on the Conecto, LCD clusters on the BMC and the Yutong), seats, poles,
   floors and liveries. Sources and approximations: `src/vehicle/models/*/NOTES.md`.
3. **Line 64.** Both directions routed on the real street network from the official stop
   codes (A 35 stops, 16.4 km; B 33 stops, 15.8 km), request stops flagged, a terrain and
   world pack of its own. Stop 1591 (Скиорката) was snapped to the approach road 27 m from
   its pole; a way hint now puts it after the turn, 10 m from the pole.
4. **Dispatch.** Per service, 50 / 50 by default, a share slider and a seed in the menu;
   `?seed=` and `?veh=` for tests. MAN and Conecto never run on 64, Procity and Yutong never
   on 280 (unit-tested).
5. **Announcements.** Both directions of 64 in Bulgarian, „Спирка по желание.“ at request
   stops, a pronunciation dictionary for abbreviations and numbers (unit-tested). A
   passenger waiting down the street no longer gets the approaching bus's interior
   announcement as a subtitle and chime.
6. **Landmarks.** Line 280: the Oncology hospital, Sofiamed, the Technical Library, ХТМУ,
   TU Block 1, the NSA gate, a kindergarten and a nursery. Line 64: metro Vitosha's stair
   entrances, Paradise Center, the National Centre of Public Health and Analyses and the
   Sv. Sofia lung hospital at the terminus, the zoo's western entrance at the other
   terminus, the public perimeter of the Boyana Residence, the Boyana film studio gate,
   Боянско ханче, the Boyana and Dragalevtsi cemeteries with the Dragalevtsi chapel, and the
   Ring Road gantries. Sources and unverified details:
   `data/research/line64/landmarks/NOTES.md`, `data/research/world/institutions280/NOTES.md`.
7. **World.** No building may wall in the bus's lane (OSM footprints are clipped to the
   carriageway); garden walls, fences and trees in the villa districts; OSM fences render
   as see-through mesh panels instead of solid slabs; modernist institutional facades vary
   per building.
8. **AI driver.** Full lock when its target is beside or behind it (hairpins), a car probe
   along its own heading when off its line, a longer three-point back-up when wedged.

### Verification

Full trips with the AI driver on the final build (`tools/route_check.cjs`, every stop
must be served, simulated time):

| Line | Bus | Direction A | Direction B |
| --- | --- | --- | --- |
| 280 | MAN Lion's City G | 18 / 18, 25 min | 18 / 18, 25 min |
| 280 | Mercedes Conecto G | 18 / 18, 25 min | 18 / 18, 32 min |
| 64 | BMC Procity 12 CNG | 35 / 35, 40 min | 33 / 33, 37 min |
| 64 | Yutong ZK6126HGA | 35 / 35, 42 min | 33 / 33, 38 min |

Before the AI fix the Procity wedged at the Скиорката junction on 64 A (the route turns
back there through 135°) and drove 100 m off the line; it now passes it every time.

Draw calls on line 64 at Balanced: 530–640 per frame, 0.54–0.59 M triangles (line 280:
500–750).

Audio (cab, real game, headless): every bus is audible with no clipping (peaks −2 to
−4 dBFS); the CNG buses on 64 run about 3 dB quieter than the diesel Conecto at 30 km/h.

Phone layout (844 × 390): driver mode on 64 in rain and passenger mode at night load
without errors with the touch controls in place.

### Still open

- The Yutong's fleet numbers are placeholders; the exact engines and gearboxes of the
  Sofia builds are approximate.
- Landmark styling on line 64 is inferred where no source could be reached (listed per
  landmark in the notes). Boyana Church and Bulgaria Mall keep their OSM massing.
- The female Bulgarian voice still depends on the device (no TTS credentials for the
  embedded clips).

## 2026-10-23 — rebuild after the first play test

Feedback: the bus was not 1:1 with the photos (architecture, details, seats); the
buildings did not match reality, especially around the stops; after getting off there
should be another bus within about two minutes; the bus had no proper sound, none at all
while moving.

### Research (data/research/)

- **Bus exterior.** Pinhole cameras were fitted to photos 1–3 (plate corners, wheel
  contacts), and the lower fronts were rectified onto the plate plane. Findings:
  - belt 1.30 m, not 1.02;
  - windscreen 1.22–2.32 m, black LED header 2.30–2.86 m with a 1.72 × 0.32 m matrix;
  - door 1 sits 0.42 m further back; door 4 is behind the rear axle;
  - ram's-horn mirror on the right only, compact box mirror on the left;
  - the leaves hang down from the belt;
  - bellows are light aluminium grey.
- **Interior.** Measured from photos 4 and 5:
  - hard-shell grey seats with a charcoal cap and a grab slot, cantilevered from the wall;
  - podiums with yellow edges, 47 seats;
  - moquette only on the wheelchair-bay seat;
  - stanchions and rails, raised cab.
- **World.** Every stop pole (35) has a note covering what you see on each side, the
  stop furniture, and a building table. There are 329 building overrides
  (construction, floors, colours, windows, ground floor, shop signs), 34 landmarks, and
  stop hardware per pole.
- **Sound.** Root causes of the silence (below), a measured prototype and a sound design.

### Bus

- **Exterior** rebuilt to the survey. Run `tools/compare_bus.py` for side-by-side images.
- **Interior and cab** rebuilt to the interior spec.
- **Static parts merged.** Plain-colour parts are merged into vertex-coloured meshes
  (142 → 98 meshes, identical render).
- **Distance detail.**
  - Small trim is hidden beyond 140 m.
  - The interior is hidden beyond 70 m and casts no sun shadows.
- **Driver's view** checked: the screen post now sits beside the driver's head, and the
  sun blind is rolled up.

### Sound

Root causes:

1. **The engine worklet could not load from `file://`.** Chromium rejects `blob:`
   module URLs there, so the game fell back to a 32 Hz tone at −34 dBFS.
2. **94 % of the engine energy was below 100 Hz**, which phones cannot play.
3. **iOS was never unlocked inside the tap.**

Now:

- **Engine.** A native-node engine (no worklet): PeriodicWave firing harmonics,
  formants, roar, injector tick and turbo. Gearbox, road, wind, bellows and the air
  system are separate layers.
- **Listener zones.** Five: cab, front, rear, and outside near and far.
- **Outside.** Every bus is audible from outside with distance, Doppler and pan.
- **One-shots.** Door, brake and kneel sounds are wired to game events.
- **Start-up.** The AudioContext is created and resumed inside the tap. On iOS a
  playback audio session is set. The context recovers after interruptions and is
  silent while paused.

Measured from the real game (offline render of driver mode, cab zone):

| | RMS | Phone-weighted |
| --- | --- | --- |
| Idle | −22.9 dBFS | −29.5 dBFS |
| 30 km/h | −21.7 dBFS | −26.7 dBFS |
| 50 km/h | −17.3 dBFS | −22.0 dBFS |

Phone-weighted means after a 250 Hz high-pass. In passenger mode, the approaching bus
rises from the ambience floor (−35 dBFS phone) to −26 dBFS at the stop.

### World

- **Shop signs.** 666 real shop signs (Overture places plus the research) on the
  facades of the buildings the businesses are in, lit at night.
- **Facade shader.** It draws the researched archetypes:
  - 1960s and 1970s panel blocks with sealed joints, loggias open or glazed by owners,
    and ETICS insulation patchwork per flat;
  - EPK towers, plastered socialist brick, Stalinist and pre-war classical, modernist
    ribbon windows, curtain walls, modern residential, kiosks;
  - staircases with entrance doors;
  - AC units and satellite dishes;
  - parallax room interiors behind every window, curtains and blinds.
- **Real 3D geometry within 65 m of the route.** Balconies (slab, parapet or railing,
  owner glazing), entrance canopies with steps, cornices and copings. The geometry
  mirrors the shader's cell plan through a shared integer hash.
- **Landmarks and stop hardware.**
  - Landmarks: Rectorate, Eagles' Bridge, Aviation monument, Arena 8888, Winter Palace,
    Hristo Botev hall, campuses.
  - Stop hardware: Sofia shelters per stop, poles at the kerb, e-boards with live
    minutes.
- **Терминал Студентски град.** The spur and turn-around loop are paved 7 m wide for the
  bus.

### Passenger mode

- **Service frequency.** A bus every ~2 minutes, with a live ETA on the HUD and on the
  stop's e-board.
- **After getting off,** the next bus is already scheduled.
- **Inside the bus,** E takes the nearest free seat; you get off from an open doorway.

### Verification

- **Full-route drives with the AI driver** (`tools/route_check.cjs`):
  - A: 18/18 stops in 26 min;
  - B: 18/18 in 24 min.
- **Fixes found by those drives:**
  - The AI bus now squeezes towards the kerb for oncoming cars on narrow streets.
  - A car creeping at a waiting bus now counts as a deadlock and gives way.
- **Checks:** unit tests, `tools/smoke.sh`, phone layout at 844×390.

### Still open

- **Facade accuracy.** Most ordinary blocks are typed by typology (low confidence). No
  photos of them could be fetched: hosts such as Wikipedia, OSM and Mapillary are
  blocked by this environment's network policy.
- **Bus rear.** It is typology only, because none of the photos shows it.
- **Real-device testing.** Frame rate on phones, and iOS audio with the silent switch.
- **Female Bulgarian voice clips** are still not bundled (see AUDIO.md).

## 2026-10-22 — verification pass

### Full-route drives

An AI driver drove each direction end to end, serving every stop, at noon with traffic
and pedestrians. The test harness is `tools/shot.cjs` in headless Chromium.

Final run, after all the fixes below. The simulation is deterministic: the same build
gives the same result.

| Direction | Length | Time (simulated) | Stops served | Terminal reached | Longest halt | Contacts |
| --- | --- | --- | --- | --- | --- | --- |
| A: СУ → Студентски град | 10.66 km | 25.4 min | 18 / 18 | yes | 30 s (red light) | 1 brief touch by a turning car |
| B: Студентски град → СУ | 10.31 km | 24.9 min | 18 / 18 | yes | 27 s (red light) | 2 brief touches by turning cars |

Earlier runs exposed stalls of 135–455 s, all now fixed:

- **Grazing contacts** pinned the bus (see "Other fixes").
- **Oncoming deadlock.** The bus and an oncoming car queue each treated the other as
  "in the way" on a narrow road. Both checks now know about direction. The AI tests
  cars' oriented boxes against its own path ahead: tight clearance for oncoming cars,
  a buffer for cars ahead. Cars keep their full margin only for a bus in their lane, or
  while they are turning.

Near the Студентски град loop exit, a car and the bus could wait for each other. This
resolved only when the car was removed after 40 s. Cars blocked by a bus now give up
after 8 s, or 20 s while in view.

Three bugs were found and fixed by these runs:

- **Pole in the swept path.** A lamp pole stood in the bus's turning path on
  бул. Цариградско шосе. Lamps, trees, bins and parked cars are now kept out of the
  articulated bus's swept area. `src/gameplay/SweptPath.js` computes that area by
  following the drive line with tractrix curves for the middle axle and the trailer.
- **Doors never opened.** If a close request arrived while the doors were still opening,
  the AI waited forever for "all open". The AI now re-commands the doors and has a
  timeout.
- **Stop re-served.** After serving a stop, the AI still targeted it inside the 12 m
  departure window, and opened the doors again up to three times.

### Terminal and return trip

The terminal cycle was checked end to end in headless runs:

1. The bus arrives at Студентски град (pole 1694).
2. The signs switch to „280 СУ Св. Климент Охридски“ and the trip result appears.
3. „Обратен курс“ starts the return trip. The bus closes its doors and drives the
   turning loop.
4. It stops 0.4 m from the departure pole (1693), serves it, and continues to СК на НСА.

Bugs fixed on the way:

- Route and AI tracking kept the previous direction's position.
- A stop could count as passed while the bus was still 36 m away on the turning loop.
- Doors left open at the start were never closed by the AI.
- At the trip start the bus was placed 6 m past the first stop. It is now placed at the
  stop, with the rear following the incoming terminal link.
- That 6 m start error counted towards the stopping accuracy score; the first stop is no
  longer scored.

A keyboard/touch-input bot also drove the player's procedure for stop 1:

- engine on, doors closed, parking brake off, D;
- stopped 0.4 m from the pole ("Отлично спиране!");
- opened the doors, closed them with the two-beep sequence, and departed;
- scoring and penalties fired.

### Memory and performance

**JS heap after loading** (Chromium, `?memlog` logs it per loading stage):
**~650 MB → ~320 MB**. Two changes did this:

- The world geometry builders drop their JS arrays once the typed arrays are created.
- Static world meshes release their CPU-side arrays after the GPU upload.

**Draw calls and triangles per frame**, start of route at noon, including shadow passes
and post-processing:

| Preset | Cab view | Chase view |
| --- | --- | --- |
| Ultra | 1180 calls / 1.11 M triangles | 1386 calls / 1.24 M triangles |
| High | 848 calls / 0.71 M triangles | 1045 calls / 0.83 M triangles |
| Balanced | 527 calls / 0.46 M triangles | 743 calls / 0.59 M triangles |

That is down 25–30% after two changes:

- Small props, parked cars and trees now have shorter draw distances than buildings
  and roads.
- A bus's passenger interior is skipped when the camera is more than 70 m away.

Buses removed from the scene (passenger mode keeps spawning them) now free their
geometry, materials and textures. Before, they leaked GPU memory.

**Frame rate:** the headless renderer is SwiftShader (CPU), so frame rate there means
nothing. No real-GPU or phone frame-rate measurements are available yet.

### Phones and tablets

The layout was checked at **844×390 landscape** and **390×844 portrait** with touch
emulation. Screenshots are in `docs/screenshots/`.

- **Driver:** steering wheel bottom-left, pedals bottom-right, dash between them.
- **Checklist:** reduced to a single chip showing the next step.
- **Keyboard help:** hidden on touch screens.
- **Safe areas:** respected through `env(safe-area-inset-*)`.
- **Menu:** compact on short screens; the setup panel scrolls.

### Night and rain

- **Rain:**
  - an overcast cloud deck replaces the clear sky;
  - wet, darker asphalt and road paint;
  - puddles with animated raindrop rings;
  - raindrops on the windscreen, which the wipers clear along their real sweep arcs.
- **Night:**
  - low-beam spotlights on the driven or ridden bus;
  - LED cabin lighting in both sections;
  - lit windows and lamp pools.

### Other fixes

- **Grazing contacts.** A zero-depth touch of a pole or tree during a full-lock turn
  multiplied the bus's speed by −0.08 on every physics step. The bus was pinned for
  over two minutes; this was found in deterministic full-route runs. Speed is now
  damped only when the bus drives into an obstacle.
- **Collision penalty.** It is applied once per contact. A scrape spans many frames and
  must not be penalised on every one.
- **Prop clearance.** The swept-path margin grew to 1.0 m, because drivers cut tight
  corners slightly.
- **Older browsers.** Browsers without `DecompressionStream` (Safari < 16.4) decode the
  map with a built-in JavaScript gzip inflater. It is unit-tested byte for byte against
  zlib on the real world pack.

- Teleporting the bus no longer counts the skipped stops as missed.
- The **K** key toggles automatic kneeling. The help text listed it before it existed.
- All UI text follows the language setting (Bulgarian or English). In-world text stays
  Bulgarian: signs, announcements and stop names.
- A standing passenger can no longer be drawn inside the player's head.

## Earlier milestones

1. **Data pipeline** (`tools/`)
   - Overture Maps (OSM) roads, buildings, stops, signals, crossings, trees and land use
     for the corridor.
   - Terrarium elevation.
   - Route 280 routed per direction by official stop code.
   - Packed into `src/data/world.pack.b64`.
2. **Logic modules with unit tests**
   - Route data, stop manager, announcement manager and destination display.
   - Door controller (two-beep close, obstruction and reopen, interlock) and game state
     machine.
3. **Bus**
   - Procedural MAN Lion's City G CNG with livery, LED dot-matrix signs (front, side,
     rear, interior), inward-swinging doors, bellows, full interior and driver's cab.
   - Articulated physics: single-track front section, tractrix trailer, joint limits,
     6-speed automatic with torque converter, retarder, hill-hold, kneeling and
     body roll/pitch.
4. **World**
   - Junction-aware road meshes with kerbs, pavements, medians, markings and zebras.
   - Buildings with a procedural facade shader (lit windows at night).
   - Terrain splatting, vegetation, street furniture, bus stops (shelters, boards) and
     landmarks (Орлов мост eagles, Rectorate, ПЛИСКА).
5. **Gameplay**
   - Driver mode: checklist, scoring, timetable, red-light detection, return trip.
   - Passenger mode: AI buses, boarding, walking inside across the bellows, sitting,
     standing, STOP request, getting off.
   - Traffic: IDM car following and signal phases.
   - Pedestrians: crossings, waiting crowds, boarding and alighting.
6. **Audio**
   - Procedural engine (AudioWorklet), pneumatics, door beeps, ambience and three
     listening zones.
   - Bulgarian announcements via embedded clips or the device's voice.

## Open items

- **Female Bulgarian voice.** The clips are not bundled, because no TTS credentials were
  available. Run `tools/generate_announcements.py`; until then the device's voice is used.
  See [AUDIO.md](AUDIO.md).
- **Real-device testing.**
  - Frame rate on phones (especially iOS Safari memory limits).
  - Gyro steering.
  - Multi-touch edge cases.
- **Accuracy limits**, documented in `data/research/*.json`:
  - procedural facades;
  - generic traffic-signal timings;
  - estimated bus wheelbases and overhangs;
  - the unofficial timetable;
  - stop amenities not verified on site.
- **Draw calls.** Balanced still issues 500–750 draw calls. Merging the remaining
  per-material bus parts and the parked-car types would reduce this further.
