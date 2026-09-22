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

**Auto-land, in under two minutes.** One button (`O`) flies a complete guided descent to the nearest
world. There is no script and there are no waypoints: one closed-loop law commands an *acceleration
vector* — a descent-rate schedule plus the horizontal velocity error — and reads the attitude and
the throttle off it. The whole profile falls out of that by itself: cancel the orbit, dive, swap
ends, brake, land.

The schedule is derived rather than tuned. It is the fastest descent whose braking burn *and*
turn-around both still fit in the altitude that is left, at half the available braking authority —
so the vessel is allowed to point its nose **down** and accelerate into the descent, which is what
makes a big engine worth having. Inside an atmosphere a second ceiling applies, and it is not about
heating: a vessel braking on its engine flies nose-first into its own airstream, which is the
unstable way round, and past a few kilopascals it weathercocks and the wheels cannot bring it back.
So the powered corridor is thousands of pascals, evaluated on the air the vessel will be *in* when
the braking burn ends rather than the air it is in now.

That corridor also decides the strategy. A chemical stage cannot land propulsively from orbit, so it
aims its periapsis under the surface and lets drag remove seven kilometres a second for free. An
antimatter drive has three hundred kilometres a second of Δv, so it spends eight of them cancelling
the orbit outright and comes straight down — which is both faster and gentler, because the corridor
holds it inside a few kPa the whole way instead of taking whatever the trajectory hands it.

It picks its own landing site, sampling the height field for flat ground and biasing toward a nearby
landmark when one is in reach. It drives time warp itself, choosing the tier by what the vessel is
*doing* — 50× on an unpowered coast (which runs on the exact Keplerian propagation and costs
nothing), 10× on entry and on a powered descent high up, real time for the last couple of hundred
metres. If it touches down on a slope and starts to slide, it lifts off and tries another patch. Any
real stick input hands control straight back.

Measured headlessly, wall-clock seconds from pressing the button to the legs being down, with the
default antimatter drive at 4 g:

| From | Wall clock | Hull | Residual |
| --- | --- | --- | --- |
| Earth, 420 km circular (the opening orbit) | 98 s | 1.00 | 1.0 m/s |
| Luna, 150 km circular | 63 s | 1.00 | 0.6 m/s |
| Mercury, 150 km circular | 59 s | 1.00 | 0.8 m/s |
| Europa, 150 km circular | 62 s | 1.00 | 1.3 m/s |
| Mars, 60 km | 43 s | 1.00 | 0.7 m/s |
| Titan, 50 km | 148 s | 1.00 | 0.8 m/s |

At 8 g the Earth descent is 84 s. Two cases are slower and honestly so: **Titan**, which has the
thickest atmosphere in the system over a tenth of a gravity, so the descent is drag-limited whatever
is bolted to the back; and the **chemical** drive from low Earth orbit at about 200 s, because a
vessel with 5 km/s of Δv has to aerobrake, and aerobraking costs half an orbit no matter how it is
flown.

Verified on Luna, Mars, Earth, Titan, Europa and Mercury — vacuum and atmosphere, 0.13 g to 1 g —
landing every time with the hull intact and under 1.5 m/s of residual motion, and landing 198 m from
a named monolith when told to aim at one.

**Antimatter propulsion.** Three drives on one set of bells, cycled with `\`:

| Drive | Exhaust velocity | Thrust | Δv (40 t → 10 t) | Pays in |
| --- | --- | --- | --- | --- |
| Chemical | 3.75 km/s | 0.62 MN | 5 km/s | propellant |
| Antimatter **BOOST** | 245 km/s | 13.1 MN | 332 km/s | propellant, a little antimatter |
| Antimatter **CRUISE** | 2 450 km/s | 1.31 MN | 3 325 km/s — 1.1 % of *c* | antimatter, almost no propellant |

The two antimatter modes are the same engine at two points on one curve: at a fixed jet power,
`F = 2P/v_e`, so thrust and exhaust velocity trade against each other exactly. For the *same*
acceleration BOOST runs at a tenth of full power and sips antimatter while pouring propellant out of
the tank; CRUISE runs flat out, drinks antimatter and barely touches the propellant. Manoeuvre on
one, transfer on the other.

Which drive is fitted also changes how the autopilot flies: see **Auto-land** above.

**Thrust is not the limit — you are.** 13 MN on a 40-tonne vessel is 33 g, which is not "fast", it
is uncontrollable. Every drive is governed to an **acceleration limit** you set (`[` / `]`, 1–15 g,
default 4). Set 4 g and the vessel does 4 g whether it is full or empty, at Earth or at Titan;
structural damage still begins above 14 g, so the top of the range costs something. The HUD's TWR,
Δv and the autopilot all read the governed figure, so nothing anywhere hard-codes the engine.

**Unlimited propellant.** A toggle (`;` or *Settings ▸ Unlimited propellant*) for when you want to
fly rather than budget: propellant, monopropellant, antimatter, power and oxygen stay full and hull
damage repairs.

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
| A rigid-body attitude hold that looks fine by hand and never converges on a large slew | The angular velocity has to be in **one** frame. Euler's equation is body-frame, so the quaternion derivative must be `q' = ½·q ⊗ ω`, not `½·ω ⊗ q` — the two agree near identity, which is exactly why hand-flying hides it |
| Reaction wheels that lose to the vessel's own rotation | Feed the gyroscopic term **forward**. At 0.65 rad/s `ω × (Iω)` is half the wheel authority on a vessel whose principal moments differ by 2×, which makes any braking slew profile unfollowable |
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
