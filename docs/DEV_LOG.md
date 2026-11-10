# Development Log

## Status (latest first)

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

### Next after the realism pass
1. Wire `Launch.ts`: `EarthZone.startLaunch(nasa)` creates a `LaunchSequence`, calls `begin()`, and updates it every frame. Add a `CloudLayer` to EarthZone.
2. `SpaceZone`: starfield, scaled-space planets, Endurance (Blender model + rotating interior frame), the `launch` spawn (continue the S2 burn → orbit → separation), the
   rendezvous autopilot, docking (≤60 s), and the interior walk.
3. Nav computer, cryo, Saturn, wormhole and Gargantua shaders.
4. Planet zones (Miller, Mann, Edmunds), Lander model, universal landing.
5. Docs, tests, screenshots.

## Conventions
- `game.step(n, dt)` and `game.running=false` give deterministic tests. `e2e/shot.mjs out.png script.js frames` saves screenshots.
- Exposure snaps on camera jumps. Screens refresh at 2 Hz.
