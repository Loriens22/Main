# ODYSSEY — Deep Space Explorer

A single-file, real-scale 3D space exploration simulator. Open
[`space-explorer.html`](space-explorer.html) in any WebGL2 browser — there is
nothing to install, nothing to build, and no network access required.

Kerbal-style orbital mechanics, No Man's Sky-style procedural planetary detail,
and seamless space-to-surface transitions, in about 1 MB.

---

## What's in it

**The Sol system, at true scale.** Sun, eight planets, Pluto and nine major
moons with real masses, radii and orbital elements. Bodies are propagated
on-rails with an exact Keplerian solution; the vessel feels the summed gravity
of every one of them.

**Procedural planets you can land on.** A GPU-displaced cube-sphere quadtree
generates terrain from orbit down to metre scale — continents, mountain chains,
craters, dune fields, oceans with waves, polar caps, city lights on the night
side. Saturn has rings that shadow the planet and are shadowed by it.

**Atmospheres.** Screen-space single-scattering (Rayleigh + Mie) raymarched
against the depth buffer, so you get a blue zenith from the ground, an orange
sunset, a blue limb from orbit and correct aerial perspective — from one
integral. Mars gets a butterscotch sky and a blue sunset for free. Volumetric
cloud decks with Beer-powder lighting.

**A flight model with two regimes.** Six-degree-of-freedom rigid body with
reaction wheels, RCS, SAS hold modes, and an aerodynamic model that blends in
with dynamic pressure — angle of attack in the body frame against the
co-rotating atmosphere, transonic drag rise, flat-plate lift with stall,
weathercock stability, and Sutton–Graves-flavoured stagnation heating.

**Re-entry as a sequence.** Ionisation, plasma sheath oriented to the relative
wind, trailing sparks, buffet, heat grade and chromatic aberration all driven
by one skin-temperature number.

**Landing that works.** Three independent spring-dampers raycast against the
CPU mirror of the terrain field — no collider exists on a procedural planet.
Dust kicked from each contact point, tinted by the local biome albedo.

**Wormholes.** A four-phase bridge sequencer with a screen-space gravitational
lensing pass, a photon-ring throat, a Doppler-beamed accretion disk and a
transit tunnel.

**EVA.** Get out and walk, jump and jetpack around on any solid surface.

## Engine documentation

Press **F1** in-game (or the *Engine Docs* button) for the full engineering
specification: Unity HDRP project structure, the C# for orbital propagation,
floating origin, the planet quadtree, the ship controller, aerodynamics,
landing gear and the wormhole sequencer; the HLSL for the shared noise contract
and the terrain compute shader; shader and VFX recipes; ship model import
guidelines; a performance budget; the Unreal Engine 5 variant; and a
six-milestone implementation roadmap.

## Controls

`W A S D` pitch/yaw · `Q E` roll · `⇧`/`Ctrl` throttle · `Space` full burn ·
`T` SAS · `1`–`9` SAS modes · `R` RCS · `G` gear · `V` camera · `C` scan ·
`M` wormhole · `F` EVA · `Tab` target · `,` `.` time warp · `H`/`?` full manual.

## Technical notes

The four hard problems and how they are solved:

| Problem | Solution |
| --- | --- |
| `float32` resolves only ~130 km at Saturn | **Floating origin** — the camera is pinned to (0,0,0) and the universe is translated around it in doubles before anything reaches the GPU |
| 0.05 m near and 8e13 m far in one depth buffer | **Logarithmic depth**, implemented identically in every custom shader so the post-process depth reads match |
| A 6371 km sphere at 1 m resolution is 5e14 texels | **Everything is a function** — a CDLOD quadtree evaluates the same noise field at whatever frequency the current LOD needs |
| Terrain is generated on the GPU but collision is queried on the CPU | One **bit-exact PCG integer hash** shared by both, never `frac(sin(dot(...)))` |

three.js r160 is inlined into the file (MIT), so it runs from `file://` with no
network. `window.ODYSSEY` exposes the simulation state for debugging and modding.
