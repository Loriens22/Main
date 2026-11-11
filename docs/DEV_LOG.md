# Development Log

## Status (latest first)

### Landings checked body by body, Miller's waves, phone performance mode (this pass)
Verified headless (SwiftShader, one browser at a time) unless marked otherwise. RESULTS_PLACEHOLDER

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
  cheaper and slower), holds follow the moving throat, Miller orbit and surface run on Miller time (1 h ≈ 7 years).
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
1. Earth return: re-entry corridor and landing back at the NASA site.
2. Miller's tidal waves (moving water mountains), Mann and Edmunds story content, the Lander.
3. Crew aboard the Endurance (NPCs walking the ring), interior detail pass, animated iris doors.
4. Performance tiers for the black-hole and terrain shaders on mobile GPUs.

## Conventions
- `e2e/run.sh steps.mjs outDir w h` starts and stops the Vite server for one run (TOUCH=1 for touch, MEMLOG=1 logs RSS).
  Steps support `untilJs`/`max`/`chunk` to advance until a condition holds.
- `game.step(n, dt)` and `game.running=false` give deterministic tests. `e2e/shot.mjs out.png script.js frames` saves screenshots;
  `e2e/multi.mjs steps.mjs outDir` runs a step list (js / frames / shot / probe). Keep renders per run few with the forest in view.
- Exposure snaps on camera jumps. Screens refresh at 2 Hz.
