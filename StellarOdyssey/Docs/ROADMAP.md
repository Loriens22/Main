# Implementation Roadmap — MVP → Full Feature

## Phase 0 — Foundations (week 1–2)
- [x] Double-precision `Vector3d` + `FloatingOrigin` rebasing.
- [x] `ScaleSpaceManager` dual-layer rendering (local 1:1 + scaled 1:100k).
- [x] Kepler solver, element↔state-vector conversion, RK4 integrator.
- [ ] Unit tests: orbit round-trips, energy conservation over 10⁶ s, rebase invariance.
- **Exit criterion:** a debug sphere holds a 400 km orbit for 24 h game-time with < 1 m drift.

## Phase 1 — Solar system & flight MVP (week 3–5)
- [x] `CelestialBody` on rails with real ephemeris-ish data (Sun → Neptune + major moons).
- [x] `ShipController` hybrid rails/RK4, RCS, SAS, throttle.
- [x] `GravitySimulation` universal clock + time warp (1×–100,000×).
- [ ] Map view: orbit line rendering (osculating elements → line strip), maneuver nodes.
- [ ] HUD navball.
- **Exit criterion:** fly Earth → Moon with a Hohmann transfer, on instruments alone.

## Phase 2 — Procedural planets (week 6–10)
- [x] Quadtree cube-sphere with GPU compute patch generation + async readback.
- [x] Multi-layer noise stack (continents / ridged mountains / canyons / detail) + biome classification.
- [ ] Skirts or stitched edge tessellation to hide LOD seams.
- [ ] Triplanar terrain material (HDRP LitTessellation base) with height/slope/biome splatting.
- [ ] HDRP Water System oceans + shoreline blending; simple river mask from flow-accumulated noise.
- [ ] GPU-instanced surface scatter (rocks, grass, trees) driven by biome density.
- [ ] Collision streaming stress test: 200 m/s low-level flight without hitches.
- **Exit criterion:** descend from orbit to walking altitude anywhere on Earth-analog with stable 60 fps.

## Phase 3 — Seamless transitions & landing (week 11–13)
- [x] `SeamlessTransitionManager` five-state altitude pipeline with HDRP volume blending.
- [x] `AtmosphereEntry` physically-driven plasma/heat/shake/damage.
- [x] `LandingGear` raycast suspension + biome dust.
- [ ] Re-entry shockwave VFX Graph effect + sonic boom audio.
- [ ] Takeoff dust occlusion + engine plume terrain interaction (depth-based).
- **Exit criterion:** orbit → surface → orbit round trip, no cuts, all effects continuous.

## Phase 4 — Wormhole travel (week 14–15)
- [x] `WormholeSystem` flow: button → target picker → mouth growth → tunnel → exit orbit.
- [x] Lensing/accretion shader (reference implementation).
- [ ] Tunnel interior: cylindrical ShaderGraph with parallax star-streaks, camera FOV pull 65→110.
- [ ] Warp charge economy + UI feedback.
- **Exit criterion:** Earth orbit → Titan orbit in under 20 s of player time, visually spectacular.

## Phase 5 — Ship systems & gameplay loop (week 16–18)
- [x] Fuel/oxygen/hull (`ShipSystems`), scanner tool.
- [ ] Cockpit interior: interactable throttle/stick, MFD screens (render textures showing orbit map).
- [ ] Refueling: mine ice / scoop gas giants; O₂ refill on ocean worlds.
- [ ] Failure states: hull breach → cracked-glass overlay + alarm; oxygen → blackout.
- **Exit criterion:** complete gameplay loop with consequences; 30-minute play session holds attention.

## Phase 6 — Visual polish (week 19–22)
- [ ] HDRP volumetric clouds per planet type; dynamic weather (rain/dust storms via VFX Graph + wind zones).
- [ ] Physically Based Sky per-planet profiles; aurora shader on magnetized worlds.
- [ ] Post stack: bloom, HDR lens flares, motion blur, LUT color grading per biome.
- [ ] Day/night city lights (emissive masks), ring systems for Saturn (shadow-casting shader).
- [ ] Performance pass: occlusion culling, GPU instancing audit, texture streaming budget, DLSS/FSR.

## Phase 7 — Beyond MVP
- Galaxy layer: seeded star catalog, wormhole network between systems.
- Ship building (modular parts, KSP-style assembly).
- EVA + first-person surface exploration with jetpack.
- Multiplayer ghosts / photo mode.

## Testing checklist (run every phase)
1. Precision: no jitter at 4.5e12 m from origin (Neptune).
2. Physics: circular orbit stays circular for 100 orbits at max warp.
3. Transitions: 20 consecutive orbit↔surface cycles without artifacts.
4. Performance: 60 fps desktop (RTX 3060), 30 fps mobile (see MOBILE_PORT.md).
5. Memory: patch pool stays < 2 GB VRAM during full descent.
