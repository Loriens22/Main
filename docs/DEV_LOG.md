# Development Log

## Status (latest first)

### Mann's and Edmunds' camps rebuilt from the reference photos (this pass)
Both camps are now Blender models (`blender/assets/mann_camp.py`, `edmunds_camp.py`, shared pieces in
`blender/lib/camp.py`) placed as interactive Sites by `world/surface/LazarusSites.ts`. Original geometry built from the
photos; no logos, name patches or photo textures.
- **Mann's camp** (glacier): a long, low hab of thick rust-orange arch segments stepping down from front to back, each
  with a rounded rim at its rear edge and a dark seal in the gap; a charcoal pill-nosed end-cap inside an orange collar,
  with a 4 × 3 cluster of round vents and a service hatch; an airlock porch recessed under the ribs (grey bulkhead,
  arched pocket door that slides into the wall, keypad, hazard stripe, steps). It stands on a raised ice shelf; a
  wind-packed drift buries its back and rear end and blankets the rear roof; two crevasses with broken plates tipped up
  along their lips run across the ice in front; a dark streaked ice cliff rises behind. Around it: an ice-core drill
  derrick with a tray of cores, a supply sled, a finned power unit cabled to the end-cap, flood lamps (on at dusk), an
  antenna and dish, a weather mast, stake flags, the beacon strobe.
  Inside (walkable, airlock → main room through a second pocket door): coffered grid ceiling with light strips, cable
  trays and a duct, a full wall of white drawers with recessed grips, quilted bags strapped to an overhead rack, a big
  round wall hatch with dogs, hinges and a hand-wheel, the survey terminal on a ceiling arm over the desk with a status
  box, a life-support rack, a grated floor lit from below, red gear at the back; suit lockers, spare helmets and an
  ice-core rack in the airlock. The cryo pod: rounded white body, side latches and hinges, foot-end control screen,
  frosted lid — its lid swings open when you wake him. Mann walks the doorways when he follows you out (waypoints
  through the airlock; he opens the doors on his way).
- **Edmunds' camp** (desert): a cleared flat ringed by piles of wind-rounded granite boulders (rounded-block core
  stones). The lantern hab: a low greenhouse tunnel and a taller living module of pillowed ribs, glowing warm after dark;
  a rigid door portal with a lamp. Inside: cot, workbench with the log on a laptop, soil jars and microscope, shelves of
  supply cases, water tank, a board of seed packets, hanging lamps; through the joint, the greenhouse — raised beds of
  beans climbing strings, rye and blue flowers, drip lines, grow-light bars, the condenser and its trough. Outside:
  supply crates, standing gas bottles and bins, small light boxes on posts, a flag pole with a striped flag and a dark
  pennant, a glowing cone tent, the dead beacon's dark transmitter cabinet and mast, his faceted dark lander on four
  legs with belly lights, a boxy rover, a ribbed container lab on legs (walkable: sample shelves, bench, seismometer
  spares) with lights under it, lamp poles throwing pools of light, solar panels, drums and cases. The camp lights come
  on at dusk off the solar array (the transmitter's own cells are dead). At the foot of the boulder ridge behind the
  camp: fresh scree, the toppled seismometer above, his cracked helmet.
- **Terrain pads** (`SurfaceGen` `pads`): each camp stands on levelled ground (flat inside r, blending back to the
  natural terrain), clear of the random boulder field; boulder piles and the ice cliff that reach past the pad are
  dropped onto the natural ground (`snap` nodes).
- New runtime materials: weathered rust-orange paint, wind-packed snow, streaked cliff ice, ice plates, crevasse,
  frost, the glowing hab fabric, flag cloth, bed soil, leaves, pale granite (Edmunds' world's loose boulder field is
  paler now to match).
- **Indoors** (camera inside a camp room): sky light (hemisphere, IBL) and the outdoor eye adaptation give way to the
  room's lamps — without it the white hab interiors were washed out.
- **Doorways are level**: every outer door has a landing flush with the floor outside it and the step-up beyond the
  frame. The character controller's auto-step lifts the capsule by its full 0.35 m before stepping, so a step-up
  directly under a door head (Edmunds' hab had 3 cm to spare) refused to climb — found with
  `e2e/scripts/camp_door_debug.mjs` (ray-casts from the stuck point, then the same walk with the head collider off).
- Verified (SwiftShader, `lazarus_steps.mjs` BODY=mann|edmunds in parts, `camp_door_debug.mjs`): holding forward
  walks through all four doorways (Mann porch → airlock, airlock → main room; Edmunds door → living module, steps →
  container lab). Mann: wake from the pod (lid opens), read the terminal, the confrontation, "come with us" — he
  walks the doorways out (180 frames) and boards Ranger 1 (660 frames). Edmunds: log, greenhouse, beacon and helmet
  → `edmunds_habitable`. Day and night views of both camps.
- Test memory: in the long screenshot runs Chrome's browser and renderer processes swell during SwiftShader renders
  (to ~14 GB, then the page is killed); with the camp loaded, 360 unrendered frames keep the JS heap (254 MB),
  geometries, textures and programs flat — same as a site without a camp (`camp_mem_probe.mjs`). The flows are
  split into parts (`PART=n`), each in its own browser.

### Every body flown, the Lazarus sites (this pass)
- **All 20 landable bodies flown end to end** (orbit → deorbit → descent → touchdown → ascent → orbit, one run each,
  from each body's navigation parking orbit, `landing_steps.mjs`): Moon 0.0 m, Mercury 0.0 m, Mars 0.1 m, Phobos 1.8 m,
  Deimos 3.6 m, Io 0.3 m, Europa 0.1 m, Ganymede 0.0 m, Callisto 0.0 m, Mimas 2.2 m, Enceladus 0.0 m, Dione 0.0 m,
  Rhea 0.0 m, Titan 0.0 m, Iapetus 0.0 m, Titania 0.0 m, Triton 0.1 m, Miller 0.0 m, Mann 0.0 m, Edmunds 0.0 m from the
  target; every one back in a stable orbit (airless moons ~42 × 55 km, Phobos 7.5 km and Deimos 4.2 km circular,
  Mars 141 × 151, Titan 379 × 380, Mann 80 × 95, Edmunds 100 × 115, Miller 110 × 125 — the Gargantua worlds with
  unlimited propellant). Earth: launch → orbit 275 × 290 km (`launch_steps.mjs`, now run on to orbit).
- **Navigation** offers Deimos, Mimas, Dione, Rhea and Iapetus — landable before but unreachable (`tests/navigation.test.ts`).
- **The Lazarus sites** (`world/surface/LazarusSites.ts`, dialogue in `data/lazarus.ts`; original writing for this
  game's timeline), at the first named site of each Gargantua world:
  - *Miller*: her capsule lies tilted in the shallows 90 m from the landing point, beacon strobing; Dr. Laura Miller
    waves the Ranger in. She will not leave without her data recorder (behind the capsule's port hatch) — then she
    follows you and climbs aboard when you reach the Ranger. She calls the next wave two minutes out. Flags
    `miller_recorder`, `miller_rescued`; discovery `miller_ocean_data`.
  - *Mann*: a hab dome with a work lamp he never switched off, a beacon, a cryo shelter (wake him from its panel)
    and a survey terminal listing the summaries he broadcast beside the raw logs. Reading them unlocks the
    confrontation; take him along or leave him supplies. Flags `mann_awake`, `mann_logs_read`, `mann_aboard`/`mann_left`.
  - *Edmunds*: a silent beacon with a dead power unit, his hab and its last log entries, a greenhouse still growing
    in local soil, and his cracked helmet in fresh scree at the foot of the ridge. All three found → discovery
    `edmunds_habitable` and a settlement recommendation.
  Explorers who board join Ranger 1's passengers. Verified in `e2e/scripts/lazarus_steps.mjs` (BODY=miller|mann|edmunds).
- **Memory** in long stepped headless runs: the forest's coarse chunk cache was unbounded (a launch or re-entry
  sweeping hundreds of km kept every chunk) — both forest caches are now pruned by distance. The remaining growth
  in multi-zone test chains sits mostly in Chrome's browser process and the renderer (JS heap, GPU resources,
  colliders and terrain patches stay flat; suspending audio does not stop it), so it looks harness-side; the tests
  now keep audio suspended unless `AUDIO=1`. Tooling: `MEMLOG` names Chrome process types, `CDP_SAMPLE=1` tries the
  native sampling heap profiler (this headless build returned no samples).

### Landings checked body by body, Miller's waves, phone performance mode
Verified headless (SwiftShader, one browser at a time) unless marked otherwise.
- **End-to-end landings** (orbit → deorbit → entry → hand-over → powered descent → touchdown → ascent → orbit, one
  run each, `e2e/scripts/landing_steps.mjs`, final code): Moon 0.0 m off target → 42 × 55 km; Titan 0.0 m (4.4 t
  for the landing; it missed by 2 400 km before) → 379 × 380 km with 6.3 t left; Miller 0.0 m → 110 × 125 km;
  Phobos 1.8 m → circular 7.5 km. Earlier in the pass: Mars 0.0 m → 120 × 128 km; Edmunds and Mann 0.0 m (their
  ascents were then fixed and verified separately, below). Every landable body loads (`surface_load.mjs`).
  The descent no longer starts its vertical leg kilometres up in dense air (brake → approach also needs the
  high-gate height; approach → terminal below 250 m; faster sink rate on the approach when high).
- **Ascents** from the surface to a stable orbit (`ascent_steps.mjs`): Moon 41.8 × 55.1 km (3.85 t of
  propellant), Mars 141 × 153 km, Titan 375 × 389 km (4.4 t left of 19 t), Mann 80 × 95 km, Edmunds 100 × 115 km,
  Miller 110 × 125 km (Gargantua worlds with unlimited propellant: Miller needs about as much Δv as a full Ranger
  carries — the ascent menu now shows the estimate against Δv aboard). Earth orbit insertion test: 275 × 290 km.
- **Entry targeting** (`space/Landing.ts`, `tests/entry.test.ts`): the predictor–corrector moves the deorbit burn
  and the aim point together along the orbit (a rotated copy of the same transfer, so the predicted hit moves
  one-for-one), secant updates along and across track, near-180° transfers excluded (their plane is ill-defined).
  Offline: Mars 36 m, Titan 0.3 km, Edmunds 0.1 km from the gate.
- **Physics fixes** found on the way: drag used the angle from the *tail* (nose-first flight paid broadside drag,
  tail-first none); the surface zone's ground clamped at the far map edge (a craft hundreds of km down-range met a
  phantom ground and was pushed up); Titan's scale height was 40 km (now RT/Mg ≈ 21 km); surface and Earth zones
  ignored the autopilot's time warp while the HUD showed ×4; the hand-over to orbit stopped the engine for the
  fade-out (now the autopilot flies on and the final state is handed over).
- **Guidance**: ascents pitch from the vertical force balance (weight less centrifugal relief + climb-rate error over
  the thrust), angle of attack limited to what the attitude control holds, max-q at the cheapest climb pressure
  (drag = weight: ≈3 kPa on Titan, 25 kPa on Earth), apoapsis above the modelled atmosphere, climb 20 km past the
  hand-over; Phobos/Deimos climb to orbit on the hover thrusters; dense-air braking flies faster than the drift.
- **Miller's tidal waves** (`world/surface/MillerWaves.ts`): single long crests 0.8–1.3 km high moving at 105 m/s,
  asymmetric sech² profile (650 m front, 2.6 km back), one every ~11.5 minutes of local time — the first about
  4½ minutes after touchdown. The same height field drives the water mesh (camera-centred polar grid out to 62 km,
  so crests show through the haze), the physics and the warnings: the computer calls the swell with bearing and
  height, two-minute and 30-second warnings, a HUD countdown and a growing rumble. A crest that reaches the landed
  Ranger lifts it up the face, over the top and down the back (carried ~2 km), floods the engines (55 s purge —
  about 40 days at home; damage to engines and hull) unless Creative damage protection is on (12 s, no damage).
  Anyone walking in the cabin is thrown into the seat; a player on foot is swept up and over the crest once per
  wave (suit integrity −45 %, a tether winches you back aboard if it runs out; Creative hazard protection: no
  injury). The camera inside the water gets underwater fog. Verified in `e2e/scripts/miller_waves.mjs`.
- **Phone performance mode**: new "Phone (low power)" preset; first-run detection (phones → Performance, or Phone
  with ≤4 cores or ≤3 GB); dynamic resolution (holds 30 fps on phones, 50 on desktops, scale 0.5–1); presets chosen
  by detection step down automatically when even the lowest resolution cannot hold 70 % of the target; device-pixel-
  ratio cap per preset (Phone renders at 1×); shared shader-quality uniforms (`render/quality.ts`) retune live
  materials: atmosphere ray-march samples (sky dome, Earth globe, planets), black-hole geodesic steps (260 → 94 with
  longer steps), terrain detail octaves and shadow-march steps, orbital crater field; slower environment captures.
  Measured with `e2e/scripts/perf_presets.mjs` (one scene per page; SwiftShader, so only the ratios mean anything):
  Earth farm 4.5 s → 1.9 s per frame (2.4×, draw calls 2 561 → 758), Moon surface 2.9 → 1.2 s (2.3×, 607 → 174),
  Miller orbit 4.3 → 1.4 s (3.1×, 434 → 79). Black-hole steps lengthen only far from the hole (a long step near the
  photon sphere jumps grazing rays into the horizon). Dynamic resolution and the step-down run in the real-time loop
  on real elapsed time (`e2e/scripts/dynres.mjs`: on SwiftShader, Medium went to 56 % resolution within seconds, then
  stepped down to Performance with a notice, then 56 % again).
- **Return to Earth** (`world/earth/RangerReturn.ts`): orbit → RETURN TO EARTH (NASA forecourt or the farm) →
  entry → hand-over into the Earth zone below 15 km → powered descent → touchdown → EVA → re-board → ascent →
  hand-over at 45 km (measured on the sphere: the flat Earth frame lags the true altitude by 12 km 400 km
  down-range) → orbit insertion. The NASA ground crew refuels a Ranger parked on the forecourt (~60 kg/s); the
  farm has no propellant, and the flight computer says so when Δv aboard is short of the ~9.6 km/s an ascent needs.
  Verified: re-entry handed over 14.6 km up and 30–38 km up-range; touchdown 0.0 m from the forecourt target;
  refuel 8.2 → 26 t; EVA; re-board; from the pad to a 276 × 280 km orbit with 1.5 t left (`earth_ascent_steps.mjs`).
  The brake phase's time-to-go now comes from the speed at the start of the brake (re-deriving it from the current
  speed stalled the countdown: the Ranger hovered 18 km at walking pace and burned 16 t).
- **Miller orbit clock**: the orbital zone integrates orbits on Earth time, so the dilated clock in Miller orbit ran
  every orbit ~61 000× too fast for the crew. Miller time (1 h ≈ 7 years) now applies on the surface and below the
  hand-over; in orbit the clock keeps the Endurance's rate (as in the film, where the ship waited higher up).
- **Known issue**: a very long stepped headless run (space → re-entry → Earth zone → landing → EVA → ascent in one
  page) grows native memory ~80 MB/s until the test browser is killed; the JS heap, GPU resources, colliders and
  scene objects stay flat, and each leg run on its own stays flat (≈0.7–1 GB). Not reproduced outside that chain;
  the Earth-return test is split in two meanwhile.
- **Tooling**: `e2e/run.sh` starts its own Vite server per run and now really stops it (it killed the npx wrapper
  and left the server running — a later run on the same port silently tested old code); it refuses a busy port.
  `SNAPSHOT=<dir>` serves a copy of `src/` so edits cannot hot-reload a running test; `PORT` for parallel runs (keep
  to one browser at a time: two SwiftShader runs exhausted memory). Probes print every `every` chunks.
- Fixed the "0.00°S" latitude display (`util/format.ts`).

### Landing everywhere, the wormhole, Gargantua, mobile controls
Verified headless (SwiftShader) unless marked otherwise:
- **Universal landing** — `world/zones/SurfaceZone.ts` serves every landable body (`data/landing.ts`: Moon, Mercury,
  Mars, Phobos, Deimos, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Dione, Rhea, Titan, Iapetus, Titania, Triton,
  Miller, Mann, Edmunds; named sites per body). Frame: the landing site's tangent frame (`space/surfaceFrame.ts`,
  X east / Y up / Z south, body centre at (0, −R, 0)); terrain heights include the sphere's curvature, gravity is radial
  plus centrifugal, Coriolis enters through `FlightEnv.fictitious`, so orbital motion stays exact through the descent and
  velocities are relative to the rotating surface. The sky is the full Solar-System renderer from the camera.
  - Terrain (`world/surface/SurfaceGen.ts`, `surfaceShading.ts`): orbital height map × relief + procedural landforms by
    style; crater octaves 0.75 m–25 km with a production function and degradation states, the same integer hash on the
    CPU (height maps, physics) and GPU (octaves below the map resolution, analytic bowl shadows); near 4 m / mid 32 m /
    far maps with double-buffered streaming; per-pixel normals, regolith micro-relief, dithered height-map shadow march
    (crater rims, hills, horizon); boulders with colliders (`Rocks.ts`); plume dust; Mars/Titan/Gargantua-world sky
    domes with aerial fog; Miller's knee-deep sea (curved wave-normal water over a rippled seabed).
  - Guidance (`space/Landing.ts`): DeorbitLanding (Lambert search to an approach gate up-range of the site),
    PoweredDescent (E-guidance braking on the main engine; velocity-profile VTOL approach with altitude-priority hover
    allocation, tilt limits scaled to gravity and RCS trim; vertical terminal descent), LandHere, AscentToOrbit.
    Handovers: orbit → surface below `handoverAltitude` (site from the autopilot, or the braking point of a manual
    descent), surface → orbit on the way up with OrbitInsertion resuming. Gas giants and Venus are fatal below the clouds.
  - Measured: Moon orbit → deorbit → descent → touchdown 0.0 m from Mare Tranquillitatis target → ascent → 41 × 55 km
    orbit (19.0 t → 12.0 t → 8.2 t propellant). Touchdown test from 450 m with 30 m/s drift: 0.1 m off target.
  - Landed Ranger is a walkable site: stand up, cabin door, rear hatch, ladder; helmet visor outside the cabin.
- **Orbital close-ups** — rocky-body shader adds a 0.25–8 km crater field in body-fixed 3-D cells (one layer at the
  surface), bowl shadows near the terminator and immature-ejecta brightening (Moon/Mars from 130–400 km are now crisp).
- **The wormhole** — `traverse()` from either mouth (navigation tab): approach, lens fills the view, warp, white-out,
  zone rebuilt on the far side, emergence cinematic. `render/Gargantua.ts`: per-pixel Schwarzschild photon paths
  (shadow, photon ring, lensed sky from the geometry), thin disk with Shakura–Sunyaev profile, sheared turbulence,
  Doppler beaming and redshift; another galaxy as the sky.
- **Gargantua system** — game-scale gravitational parameter (2×10²² m³/s²; orbital speeds 26–106 km/s inside the
  Endurance's ~160 km/s; periods derived from it). Miller 6 Rs (tidally locked), Mann 22 Rs, exit throat 30 Rs, Edmunds
  40 Rs. Lambert navigation around Gargantua (fast transfers ≈ 3–9 years under cryosleep, ≈105–110 km/s; efficient is
  cheaper and slower), holds follow the moving throat, Miller's surface runs on Miller time (1 h ≈ 7 years).
- **Mobile controls** — per-mode layouts chosen every frame (walk, float, ladder, seat, drive, flight, panels,
  cinematics with SKIP); flight: pitch/roll stick, RCS translation stick (up/down = hover thrust), absolute throttle
  slider synced from the craft, yaw/fore-aft/CUT/MAX, top bar (autopilot, SAS, RCS, gear, camera, cockpit panel, warp,
  exit); tap-to-use; compact flight HUD on touch screens; fullscreen. Verified with synthetic multi-touch at 844×390.
- Fixes: flight HUD canvas was removed by `setControl` (never visible); inclination shown in degrees once; input
  context stuck on 'seat' after spawning aboard; HUD canvases drew on unpresented frames (stepped tests leaked GBs);
  body-relative orbit thresholds (safe altitude, insertion target, free-orbit spawn); vacuum coasting disabled inside
  atmospheres (entry drag is integrated).
- Regression re-run: Earth docking approach, full rendezvous + dock, Earth orbit insertion (275 × 290 km).
- Not yet: Earth re-entry/landing back at the NASA site; Miller's giant tidal waves; landers (only Ranger 1 flies);
  the traversal's opening frames are dark-ish; GPU cost of the black hole at full screen on weak devices.

### The Solar System
- Maps (`scripts/gen_planets.py`, public/assets/textures/planet_*): Moon (real mare layout, ray craters Tycho/Copernicus/
  Kepler/Aristarchus, South Pole–Aitken), Mercury (Caloris), Venus cloud tops (super-rotation chevrons), Mars (albedo
  regions incl. the southern dark belt, Syrtis Major, Acidalium; Tharsis volcanoes, Valles Marineris, Hellas, Argyre,
  dichotomy, polar caps), Jupiter (belt/zone latitudes, GRS at 22° S, ovals, festoons), Saturn (bands, polar hexagon),
  Uranus, Neptune (dark spot, cirrus), Io, Europa (lineae), Ganymede, Callisto (Valhalla), Titan, Enceladus (tiger
  stripes), Mimas (Herschel), Dione, Rhea, Iapetus (Cassini Regio), Titania, Triton, Phobos, Deimos; height maps for
  bump; Saturn ring profile (D, C, B, Cassini Division, A with Encke/Keeler gaps, F).
- Renderer (`src/render/SolarSystem.ts`): every body ray-traced analytically in the km far layer; earth / rocky
  (lunar-Lambert, map bump + procedural sub-texel relief) / gas (limb darkening, haze) / star modes; per-body
  single-scattering atmospheres (Earth, Venus, Mars, Titan, giants); IAU poles + prime meridians, tidally locked moons;
  rings with view-angle opacity, lit/unlit scattering, planet shadow on rings and ring shadow on the planet; scaled
  space beyond 40 000 km; point markers for unresolved bodies; game-scaled solar flux with exposure adaptation.
- The Anomaly (`WormholeLens`): view through the throat into another galaxy, our sky lensed from a cube capture,
  Einstein rings. The Endurance station-keeps 6 km sunward of it.
- Patched conics: `PRIMARY` (earthFrame.ts) drives gravity, drag, orbit summaries and all autopilots; the zone
  re-centres on Earth, the Sun (cruise) or the destination; Lambert prograde is judged from the craft's own orbit normal.
- Navigation (`src/space/Navigation.ts`, NAVIGATION tab in the mission computer, command-deck console, P menu):
  19 destinations incl. major moons and the Anomaly; efficient (window search) and fast (Δv-budget) Lambert profiles,
  moon legs, Δv from/to parking orbits; departure/capture burn cinematics; cruise with cryosleep or ×100 000 warp;
  parking orbits inclined to show rings/poles; propellant by the rocket equation (Isp 14 000 s).
- Undock (P menu) and fly the Ranger at any body; the docking autopilot works around any primary.

Verified: Earth → Mars fast (41 d, capture 400 km) and Earth → Saturn fast (530 d, 190 000 km orbit) with departure,
cruise, cryosleep, capture (`voyage_steps`); arrival at the Anomaly (`anomaly_steps`); undock + re-dock at Mars
(`planet_flight_steps`); navigation tab UI (`navui_steps`); Earth rendezvous regression (`rdv_steps`).
Not yet: landing on Solar-System bodies (orbit/flyby only), wormhole traversal to Gargantua.


### Launch → orbit → Endurance
- Lander (`blender/assets/lander.py`): spine, four splayed pods with VTOL bells, dorsal dock ring, cockpit with six seats,
  consoles, overhead panel; 25.8k tris.
- Endurance exterior (`blender/assets/endurance.py`), rebuilt from reference renders 3/4 and the module/node/hub crops:
  twelve radial box modules (≈12.5 × 8 × 7.2 m) on the 64 m ring, twin panel fields, 2×2 window clusters,
  X-braced end vents, cross-shaped node junctions with porthole drums and stepped stubs, four airlocks, segmented
  spokes, hub with four docking ports and a high-gain antenna; ~108k tris, merged per ring sector.
- Endurance interior (`blender/assets/endurance_interior.py` → `endurance_int.glb`, ~112k tris) from interior refs
  1/6/7/11/15/19/20: hub with iris doors, spoke tubes with ladders, all twelve ring vestibules + junction tunnels,
  command deck, galley, crew quarters, cryo-lab. Colliders, ladders, rooms, lamps and light empties follow the Site
  conventions. Engine/pod decks are sealed (vestibule only).
- Launch wired into `EarthZone` (`startLaunch`), with a cloud deck, altitude fog falloff, a range camera on the
  summit clearing and a terrain cut-out over the silo shaft (`Terrain` `uHole`).
- Earth from orbit (`src/render/Globe.ts`): ray-traced planet + single-scattering atmosphere in a km-scale far layer,
  maps generated by `scripts/gen_earth.py` from Natural Earth public-domain data (coastlines, lakes, glaciers, ice
  shelves, populated places) and a climate model (prevailing-wind moisture, mountain belts, sea ice, clouds with
  cyclone vortices, city lights); procedural sub-texel detail in the shader. Starfield + Milky Way, sun disc.
- `SpaceZone`: Earth-centred inertial frame (+Y north) with floating origin, eclipse/earthshine lighting, Endurance on
  a Kepler orbit with LVLH attitude and ring spin, docked Ranger 2/Landers, Ranger 1 from the launch handover
  (upper stage → separation), autopilot menu (P).
- Autopilots (`src/space/Proximity.ts`): orbit insertion (ascent / coast with exact time-to-apoapsis / circularise),
  Lambert-planned rendezvous (Lambert steering during burns, mid-course correction, arrival brake centred on the
  arrival time), docking at the spinning forward port (spin-matched, latch phasing, fly-around if on the aft side).
- Walkable Endurance: rotating `Frame` with ω²r gravity about the ring axis; leave the pilot seat when docked → hub;
  iris door → back to the pilot seat; spawns `endurance:hub|command|galley|quarters|cryo`.
- Physics fix: `Spacecraft.step` now uses a trapezoidal position update (semi-implicit Euler added ~0.14 m/s drift in
  orbit, which stalled docking).

Verified (headless SwiftShader, `e2e/multi.mjs` + `e2e/scripts/*_steps.mjs`):
- launch: board → checklist → countdown → liftoff → handover at 45 km (`launch_steps`, `liftoff_steps`);
- insertion from a handover state: upper-stage burn, staging, coast, circularise → 275 × 290 km (`insertion_steps`);
- docking from the 160 m hold point: capture in ≈50 s (`dock_steps`);
- full rendezvous from a 290 km parking orbit trailing 14°: transfer, correction, brake 268 m in front, dock;
  189 m/s Δv (`rdv_steps`);
- aboard: 0.99 g on the deck floors, ladder route deck → vestibule (0.73 g) → spoke → hub (float), seat ↔ hub transfer
  (`aboard_steps`, `ladder_steps`, `transfer_steps`).
Not verified as one continuous run: launch → orbit → rendezvous → dock (each segment tested on its own; the headless
renderer runs out of memory over very long sessions with the forest in view).

Known gaps: crew NPCs stay seated in Ranger 1 (no NPC walking aboard yet); iris doors are not animated; interior
furniture is a first pass (seats and consoles are boxy compared with refs 6/19); pod/engine module decks are sealed.


### Realism pass (requested by the user)
The user asked for far more 3D detail and realism, one asset at a time, after careful study of the reference photos.
The order is farmhouse, then pickup, tractor, combine and grain cart, then the NASA site (which sits in a **dense conifer forest**).
Each asset is rebuilt in `blender/assets/*.py`, checked with Cycles previews (`blender/renders/`), then checked in the engine through
`e2e/shot.mjs`.

Reference analysis (images 1–2, farmhouse):
- Main block: two storeys with the gable end facing the front (south), two tall upper windows in that gable end, clapboard siding,
  corner boards and a steep roof.
- West wing: lower, one and a half storeys, with its **ridge running east–west (perpendicular to the main block)** and its gable on the west end.
- A long low-slope porch roof on thin posts runs along the wing front and the main block front. The deck is raised, with clutter (chairs, bikes, crates).
- Weathervane on the wing ridge, satellite dish on the main block's west wall, dust mounds by the steps.
- Yard (image 2): a blue pickup parked by the porch, two blue poly tanks, a clothesline, a power pole, a propane tank and a big tractor.

Realism pass results (all rebuilt in Blender scripts, checked with Cycles previews and in-engine screenshots):
- R1 farmhouse (`farm_house.py`, `farm.py`): geometry matched to images 1–2. Real 3-D lap siding and shingle courses
  (`arch.lap_surface`), Victorian windows, screen doors that follow their main doors, eave returns, gutters, porch
  continuing the wing roof, clutter, dust drifts, woodpile, tanks; interior re-laid out.
- R2 pickup (`pickup.py`): unbadged early-1970s style long-bed 4x4 with two-tone band, ladder rack, full chassis and cab
  interior; lamp lenses glow with the lights; door swing direction fixed.
- R3 tractor (`tractor.py`): articulated 4WD with lofted hood, glass cab, duals with chevron-lug tyres, hitch.
- R4 combine and grain cart (`combine.py`): 12-row corn head, auger flights on the rotating `reel`, folding unloading auger;
  cart with ribbed hopper, roll tarp, folding auger.
- R5 NASA site: dense conifer forest (`trees.py`, `src/world/earth/Forest.ts`, density map baked in `EarthGen`), new
  cut-and-cover portal and forecourt (`nasa_portal.py`), hill structures and parked trucks, mission-control finish
  (acoustic panels, ceiling grid, carpet, console clutter, textured telemetry monitors), canvas screens no longer upside down.

### Done
- Engine core: renderer and post stack, physical sky, material library, Rapier frames, player controller, input, audio and music, UI, saves.
- Blender kit (`blender/lib/kit.py`, `arch.py`).
- Assets: Ranger, farm, neighbour house, corn, rocks, pickup, tractor, combine, grain cart, NASA, gate, rocket, silo doors, humans.
- Earth zone: CDLOD terrain, roads, corn with harvest model, vehicles with AI, NASA facility site, NPCs, dialogue, weather.
- Spaceflight groundwork: `space/kepler.ts` (tested), `space/ephemeris.ts`, `data/bodies.ts`, `vehicles/Spacecraft.ts`,
  `Plume.ts`, `CraftModel.ts`, `FlightHUD.ts`, `FlightControl.ts`, `world/earth/Launch.ts` (not yet wired into EarthZone).

### Next
1. Rescued explorers aboard the Endurance (walking the ring, story beats), the Lander.
2. Root-cause the native-memory growth in long multi-zone headless runs (browser process).

## Conventions
- `e2e/run.sh steps.mjs outDir w h` starts and stops the Vite server for one run (TOUCH=1 for touch, MEMLOG=1 logs RSS).
  Steps support `untilJs`/`max`/`chunk` to advance until a condition holds.
- `game.step(n, dt)` and `game.running=false` give deterministic tests. `e2e/shot.mjs out.png script.js frames` saves screenshots;
  `e2e/multi.mjs steps.mjs outDir` runs a step list (js / frames / shot / probe). Keep renders per run few with the forest in view.
- Exposure snaps on camera jumps. Screens refresh at 2 Hz.
