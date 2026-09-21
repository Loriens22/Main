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

**Get out and walk.** Land anywhere and an **EXPLORE ON FOOT** prompt appears; step outside into a
first-person view and walk, sprint, jump and jetpack around the same terrain the ship landed on,
with the same gravity, wind and surface normals. Walk up to a landmark and look at it.

**Auto-land.** One button (`O`) flies a complete guided descent to the nearest world: de-orbit burn,
coast, atmospheric entry, then a closed-loop powered descent. The law commands an *acceleration
vector* — vertical schedule plus horizontal error — and reads the attitude and throttle off it, so
it has real braking authority even on a world where holding altitude costs 12 % throttle. It picks
its own landing site, sampling the height field for flat ground and biasing toward a nearby landmark
when one is in reach, and it limits its lean by both altitude and dynamic pressure so it does not
tumble on the way in. It drives time warp itself — 50× in vacuum, 5× in thin air, real time near the
ground — so a landing from orbit takes about a minute rather than twenty. If it touches down on a
slope and starts to slide, it lifts off and tries another patch. Any real stick input hands control
straight back.

Verified headlessly on Luna, Mars, Earth, Titan, Europa and Mercury — vacuum and atmosphere, 0.13 g
to 1 g — landing every time with the hull intact and under 1.5 m/s of residual motion.

**Unlimited propellant.** A toggle (`;` or *Settings ▸ Unlimited propellant*) for when you want to
fly rather than budget: fuel, monopropellant, power and oxygen stay full and hull damage repairs.

**An unbounded universe.** Sol is one address among roughly 130 billion star systems per galaxy,
across **4 294 967 296 galaxies**. The address scheme is No Man's Sky's: a fixed
**4096 × 256 × 4096 voxel grid**, up to 768 systems per voxel, up to 6 planets per system, written
as a twelve-glyph portal string `[P][SSS][YY][ZZZ][XXX]`. Nothing is stored — every galaxy, star,
world, biome and name is hashed from its address on demand, so a twelve-character string is a
complete, shareable pointer to a planet.

Galaxies are not a list, they are a function of the index, so each one has its own **morphology**:
spiral, barred, flocculent, elliptical, lenticular, ring or irregular, with its own arm count,
winding and thickness — and its own **metallicity**, which reweights the stellar population and the
planetary archetypes. A metal-poor elliptical is all red dwarfs, rock and ice; a metal-rich
starburst is full of hot blue stars and worlds with atmospheres. One density formula covers all
seven shapes and runs three times over: in JS to decide how many systems a voxel holds, and in two
fragment shaders to draw the galaxy's haze and its sprite in the universe view.

**A map with four zoom levels.** *Universe* — a field of galaxies, each sprite running its own
morphology in the fragment shader. *Galaxy* — the star cloud. *System* — the star and its worlds on
their real semi-major axes, built by calling the same generator you fly into. *World* — one planet
close up, shaded from its own terrain parameters, with its inhabitants, landmarks, fauna, hazards
and resources. Tap to go deeper, breadcrumbs or ▲ to come back, and warp from any level.

**Inhabitants and landmarks.** A dominant species is assigned per **region** — a 16×8×16 block of
voxels, about 400 light years — so a cultural sphere covers many systems the way it would in
reality. Individual worlds carry observatories, habitat bases, trading posts, monoliths, crashed
freighters, ruins and distress beacons; these are not menu entries but real geometry, pinned in the
body-fixed frame, stood on the terrain normal and lit by a beam you can see from 40 km up.

**Mobile controls.** A full touch flight stack: a floating pitch/yaw stick that spawns wherever
your thumb lands, an absolute throttle slider with a momentary BURN button, roll and RCS pads, and
a collapsible action rail that changes with what you are doing. Detection is layered: a stored choice wins over everything, then the
first genuine touch or pen `pointerdown` (which catches touch laptops and tablets that the
screen-size heuristic misses), then touch capability plus a small viewport at boot, re-evaluated on
rotate and resize. There is always a visible way out in both directions — a **Touch controls**
button in the desktop bar, and a **SETUP** entry on the touch rail, since the touch stylesheet
hides the desktop bar.

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
`T` SAS · `1`–`9` SAS modes · `R` RCS · `G` gear · **`O` auto-land** · `V` camera · `C` scan ·
`M` galactic map · `Y` wormhole · **`F` step outside** · `;` unlimited propellant ·
`Tab` target · `,` `.` time warp · `H`/`?` full manual.

On a phone: left thumb steers, right slider is throttle (double-tap to cut), BURN for full power,
two-finger pinch to zoom, drag anywhere else to orbit the camera. The right rail carries MAP,
AUTO-land, on-FOOT, VIEW, SAS and GEAR, with the rest behind MORE — and the moment you step
outside, the right-hand controls become JUMP / RUN / BOARD.

## Technical notes

The hard problems and how they are solved:

| Problem | Solution |
| --- | --- |
| `float32` resolves only ~130 km at Saturn | **Floating origin** — the camera is pinned to (0,0,0) and the universe is translated around it in doubles before anything reaches the GPU |
| 0.05 m near and 8e13 m far in one depth buffer | **Logarithmic depth**, implemented identically in every custom shader so the post-process depth reads match |
| A 6371 km sphere at 1 m resolution is 5e14 texels | **Everything is a function** — a CDLOD quadtree evaluates the same noise field at whatever frequency the current LOD needs |
| Terrain is generated on the GPU but collision is queried on the CPU | One **bit-exact PCG integer hash** shared by both, never `frac(sin(dot(...)))` |
| An infinite universe cannot be stored | The address **is** the seed — content is a pure function of galaxy, voxel, system and planet index |
| An autopilot that follows a script breaks the first time the ground is not where the script assumed | One **closed-loop guidance law** — point up, tilt into the horizontal velocity error, throttle to a vertical-speed schedule — with no waypoints and no assumptions |

three.js r160 is inlined into the file (MIT), so it runs from `file://` with no
network. `window.ODYSSEY` exposes the simulation state — including `ODYSSEY.galaxy` for
addressing, generation and warping — for debugging and modding.

### Sources for the galaxy architecture

The address scheme is modelled on No Man's Sky's, documented here:

- [Procedural generation — No Man's Sky Wiki](https://nomanssky.fandom.com/wiki/Procedural_generation)
- [Portal address — No Man's Sky Wiki](https://nomanssky.fandom.com/wiki/Portal_address)
- [Galactic Coordinates — No Man's Sky Wiki](https://nomanssky.miraheze.org/wiki/Galactic_Coordinates)
- [The algorithms of No Man's Sky — Rambus](https://www.rambus.com/blogs/the-algorithms-of-no-mans-sky-2/)
