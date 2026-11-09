# Architecture & Implementation Plan

This is the living engineering plan for **Interstellar: Beyond Endurance**. It records what each part is
responsible for and the conventions every system follows, so later work stays consistent.

## Stack

| Layer | Choice |
|---|---|
| Language / build | TypeScript, Vite 8 |
| Rendering | three.js r187 (WebGL2), EffectComposer post stack |
| Physics | Rapier 3D (WASM) for colliders, character controller and ray-cast vehicles; a custom 6-DOF integrator for spacecraft |
| Orbital mechanics | Custom double-precision Kepler propagation, universal-variable Lambert solver, patched conics |
| Assets | Blender 5.2 (`bpy` Python module) procedural build scripts that export GLB, plus numpy-generated tileable PBR textures |
| Audio | Web Audio API, every sound synthesised procedurally, plus a generative score (no recordings) |
| UI | Plain DOM/CSS overlay (fonts from @fontsource, bundled locally) |
| Tests | Vitest for simulation units, Playwright for gameplay acceptance runs |

## Coordinate conventions

* three.js world: +Y up, -Z forward. Blender scripts build in Z-up / +Y-forward; the glTF exporter converts.
* All space-simulation state is held in **float64 metres** relative to the dominant system barycentre
  (`sol` or `gargantua`). Rendering is **camera-relative** (floating origin): every frame the camera sits at
  the render origin and objects are placed at `(pos - camPos)` in float32.
* Far bodies (planets, Sun, Saturn, Gargantua) use **scaled space**. They render in a separate far layer at a
  compressed distance, with radius scaled by the same factor, so their angular size is exact. The near layer
  (spacecraft) is drawn after clearing depth.
* Surface zones (Earth, Miller, Mann, Edmunds) use local east-up-south metre coordinates, with the origin at
  the zone's main site.

## Runtime structure

```
Game
 ├─ Renderer (WebGL2 + post: layered render, GTAO, bloom, grade, AA; presets)
 ├─ Input (keyboard/mouse, gamepad, touch → unified action state; remappable)
 ├─ AudioEngine (buses: master/music/sfx/dialogue/ambience; synth voices; generative music)
 ├─ UI (menus, HUD, terminals, dialogue, creative panel, touch controls)
 ├─ GameState  ← serialisable single source of truth (versioned save format)
 │    clock, player, vehicles{}, crew{}, flags{}, creative{}, discoveries{}
 ├─ MissionClock (Earth-reference coordinate time + proper times; dilation factors)
 ├─ Zone (exactly one active): EarthZone | SpaceZone | MillerZone | MannZone | EdmundsZone
 │    owns scene(s), Rapier worlds ("Frames"), NPC instances, vehicles present
 ├─ Player (modes: walk, float, ladder, seat, cryo, cinematic) bound to one Frame
 └─ Systems: ShipSystems (damage/repair), Fuel, LifeSupport, Creative, Missions, NPC director
```

### Frames

A **Frame** is a local physics space: a Rapier world plus a render anchor (an `Object3D`) and a
`gravityAt(localPos)` function. Examples are the Earth ground, the Endurance body frame (which rotates, so
gravity is ω²r outward plus Coriolis), a Ranger cabin, and a Lander cockpit. The player and NPCs always live
in exactly one frame. Hatches and docking ports are *portals* between frames. Crossing one re-expresses the
position in the destination frame. Docking rigidly attaches the craft's frame to Endurance, so walking
through the hatch is seamless.

### Spacecraft

`Spacecraft` is shared by Ranger, Lander and Endurance. It carries a 6-DOF rigid body (mass from dry mass plus
propellant), engines (thrust, Isp), RCS, and an attitude controller (SAS / target-hold). Fuel use follows the
rocket equation, `ṁ = F / (Isp·g0)`. Vehicle-specific parameters live in `src/data/vehicles.ts`.
`Autopilot` programs are shared, including launch, rendezvous, docking, descent, landing and ascent. Each
program is a state machine that drives the same actuators the player uses. Time compression only scales the
integrator step. It never teleports.

### Time

`MissionClock.earthTime` is TDB seconds since J2000 (float64). Each location has a dilation factor
`dτ/dt` (Miller: 1/61 320, i.e. 1 h : 7 y). Player and Endurance proper times accumulate separately.
Cryosleep and transit skips advance `earthTime` analytically: orbits are propagated in closed form, and NPC
and ship events are processed through an event queue.

## Asset pipeline

* `blender/lib/kit.py` provides primitives with real bevels, booleans, panel-groove cutting, cube-projected
  metre-scale UVs, named PBR materials, custom properties (`col`, `interact`, `id`) and GLB export.
* `blender/assets/*.py` each build one asset family. `blender/build_all.py` runs them all.
* Materials are named (`hull_white`, `hull_dark`, `glass_window`, ...). At runtime `MaterialLibrary`
  upgrades them to full PBR materials with tiling detail textures from `public/assets/textures`.
* Collision: meshes with `col=mesh` become trimesh colliders, `col=box` becomes a bounding-box collider, and
  `col=none` is skipped. Invisible `COL_*` meshes are collision-only.

## Creative-mode overrides (clearly marked as assists)

10 s refuel, auto repair, damage protection, fast travel, recover spacecraft, and compressed-time autopilots
(landing ≤ 2 min, return ≤ 2 min, docking ≤ 60 s).

## Progress log

See `docs/DEV_LOG.md`.
