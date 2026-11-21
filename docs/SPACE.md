# Space: worlds, voyages, landings, the wormhole and Gargantua

What is simulated, how, and where the game departs from physics on purpose. Code references are to `src/`.

## Bodies and ephemeris (`space/Bodies.ts`, `space/Ephemeris.ts`)

- Planets: JPL approximate Keplerian elements (Standish), heliocentric ecliptic J2000 frame, double precision.
  Moons: circular orbits about their planet in the planet's equatorial plane (the Moon: the ecliptic), IAU pole
  directions and prime meridians; synchronous moons keep their prime meridian toward the parent.
- Beyond the wormhole the frame is centred on Gargantua with its disk in the x-y plane. Gargantua: 10^8 solar
  masses (M = GM/c^2 = 1 au, 493 s of light time), spin a = 1 - 1e-14. Navigation radii in M: Miller 12, Edmunds
  120, the wormhole's far mouth 300, Mann 420. Orbits are inclined 4-9 degrees to the disk (the view of the disk and
  its lensed far side; a planet in the disk plane would be inside the disk).

## Voyages (`space/Voyage.ts`, `world/space/OrbitZone.ts`)

- Transfers between planets are Lambert arcs between their real positions on the departure and arrival dates.
  The burn is scheduled at the point of the parking orbit where a hyperbola from that point leaves along the arc
  (the true cost includes any plane change, which is why a fast Mars transfer from the 38.7 degree Earth orbit costs
  more than the ideal coplanar figure); the capture hyperbola is chosen with its periapsis on the target's parking
  orbit, so the flown path is continuous from burn point to capture point (tested).
- Moon transfers: Hohmann-like arcs about the planet, re-solved with Lambert from the actual burn point.
- Gargantua legs ("slingshots"): Kepler transfer times between the orbits and a fixed, documented cost. A literal
  two-body solution there moves at a third of light speed and would mean nothing (fiction, as in the film).
- The Endurance's drive: 60 km/s of manoeuvre capability (fiction; the film's ship is never given numbers).
- Cruise: two-body propagation about the Sun (or planet), time compression up to one day per second, hibernation
  in the cryo-lab skipping ahead analytically.

## Landing and takeoff (`space/Descent.ts`, `space/FlightProgram.ts`, `world/space/SurfaceZone.ts`)

- The Ranger is flown as a double-precision point mass about the body: gravity, co-rotating exponential atmosphere,
  drag with the attitude's area (belly into the flow in entry, engine-first while braking, nose-first climbing),
  lift in entry (L/D 0.6).
- Descent: wait for the window (the site passing under the orbit in daylight), deorbit burn sized to the periapsis,
  coast, lifting entry with bank steering for cross-range, powered descent with ZEM/ZEV feedback guidance written
  in curvilinear coordinates (straight-line prediction along the curved ground, the vertical "gravity" relieved by
  the horizontal speed), the gate 1.2 km above the pad, terminal descent at ~1 m/s at touchdown. The planner flies a
  reference descent to measure how far round the body the coast and entry carry the ship, then bisects the burn time
  on the simulated miss.
- Ascent: vertical rise, a climb held under 25 kPa dynamic pressure with a vertical-speed profile, insertion into the
  Endurance's orbit (plane, radius, circular speed; along-track point free), a short ZEM/ZEV close-in to a point
  600 m behind the Endurance and a velocity trim; the window is planned from a reference climb. Then the existing
  rendezvous and docking autopilots (Clohessy-Wiltshire) bring it in.
- Tests (`tests/descent.test.ts`): on all 19 landable worlds the descent reaches the gate within ~20 m, touches down
  on the pad at 1 m/s, and the ascent arrives within ~20 m and 0.3 m/s of the rendezvous point. In the game (browser
  runs): automatic landing ~100-145 s of real time from the staging point; automatic return from the pad to the
  Endurance's docking approach gate ~105-110 s (Moon, Mars, Miller), docking ~45 s from the gate.
- **Fiction: the Ranger's drive.** The film's Ranger reaches orbit from 1.3 g Miller single-stage. No chemical rocket
  of its size can (about 11 km/s to orbit). The game gives it a high exhaust velocity (Isp ~5000 s main, ~4200 s
  lift) and enough thrust to hover fully fuelled at 1.3 g. Reaction control is conventional.
- **Venus**: landing works; climbing out of 92 bar at near-terminal speed costs more propellant than the Ranger
  carries. The computer says so; Creative Mode "unlimited resources" lifts the limit (the trajectory is the same).
- **Gas and ice giants** have no surface, and a craft at their cloud tops could not climb back to orbit (orbital
  speed 15-42 km/s). The flight computer explains this and lists their landable moons.
- Surfaces are procedural height fields around each named site, with the curve of the world built into the height
  (d^2 / 2R) so what is drawn, walked on and the globe beyond the terrain edge agree. Venus and Titan skies are set
  explicitly (the sky shader is single-scattering and cannot produce the bottom of a 92-bar or a hazy 1.5-bar
  atmosphere).

- Entry plasma (`render/EntryPlasma.ts`): the shock layer glows on the windward face, white-hot at the stagnation
  point and in the gas's own colour toward the edges (air orange-pink, CO2 paler, Titan's nitrogen-methane violet),
  with streamers trailing aft. Brightness follows the convective heating (Sutton-Graves, sqrt(rho) v^3) with a steep
  onset: entries from low orbit at Miller (~8.8 km/s), Edmunds, Mann and Venus glow; Mars from orbit (3.5 km/s) and
  Titan (1.8 km/s) hardly at all. The buffeting and the roar follow the dynamic pressure.

## Globes up close (`render/Planet.ts`)

- Each body's map is procedural (no mission imagery is used), 4096x2048 at most: a texel is kilometres across. As the
  camera closes in (low orbit, descent) the map's relief fades out and a procedural crater field takes over: five
  octaves of craters from ~60 m to ~10 km radius with the saturated size-frequency distribution of the lunar
  highlands (N(>D) ~ D^-2), fewer large ones on the maria, fresh sharp-rimmed bowls (depth/diameter 0.2) to
  degraded dimples, flat floors on the larger ones, and cast shadows solved exactly for the convex bowl (black on an
  airless world, with a little light from the sunlit far wall). Each octave fades in by its size on screen so nothing
  aliases. Crater density per body follows its surface age (Moon, Mercury, Callisto, Rhea saturated; Europa, Triton
  sparse; Io none).

## Time (`space/Relativity.ts`, `OrbitZone.missionClocks`)

- Three clocks: LOCAL (the player's proper time), ENDURANCE, EARTH. Near Gargantua the Endurance's clock runs at the
  weak-field rate for its navigation radius, 1/sqrt(1 - 3M/r).
- Miller's planet: the near-horizon Kerr value for a prograde circular orbit, 61,362 (one hour = seven years),
  computed with a cancellation-free form. It applies on the planet and ramps in with depth on the descent.
- **Fiction**: Miller's dilation requires an orbit deep in the hole's throat, yet the game draws Miller at 12 M and
  lets the Endurance park in orbit round it (the film parked it farther out). Rendering and orbital motion run on
  the player's time; dilation is applied to the clocks (as in the film, the sky does not visibly race).

## The wormhole (`render/Wormhole.ts`, `OrbitZone` traversal)

- An Ellis wormhole (throat radius 1 km, no mass: a lens, not a gravity well). Per pixel, the exact azimuthal sweep
  of the ray, dphi/dl = (b/r^2)/sqrt(1 - b^2/r^2), integrated in a regularised variable (l = b0 tan t; turning
  points with a square-root substitution). Rays with impact parameter below the throat's go through.
- Both skies are real renders captured into cube maps: Saturn, its rings, the Sun and the stars on this side;
  Gargantua and its galaxy on the far side. The mouths' directions are identified so a ship going straight through
  comes out at the far station and Gargantua sits at the centre of the sphere seen from Saturn.
- Traversal: automatic or manual approach speed (abort before the throat), vibration peaking in the throat,
  structural sound, star-tracker loss and scrambled clocks, eye adaptation blending between the two universes.

## Gargantua (`render/BlackHole.ts`)

- Per-pixel null geodesics in the Kerr metric (Boyer-Lindquist, Hamiltonian form, RK4, traced backward from the
  camera with momenta from the zero-angular-momentum observer's frame, as in James et al. 2015). Thin disk from the
  ISCO with a Novikov-Thorne-like flux; observed colour a blackbody at g T and intensity g^4 (gravitational redshift
  and Doppler beaming, which the film toned down). Rays far from the hole use the weak-field 4M/b.
- The image is traced with a = 0.999 (indistinguishable at screen resolution from 1 - 1e-14, numerically stable).
- Its galaxy's sky is procedural (not ours: Earth's constellations would be wrong there).
- Light in that system comes from the beamed inner disk, not the hole's centre.

## Miller, Mann, Edmunds

- Miller: knee-deep sea over a rippled floor; the tidal wave (1.2 km, 40 m/s, once per local hour), first seen as a
  mountain range on the horizon, with warnings and a growing roar. If it reaches the Ranger on the pad (or waiting for
  its launch window), the craft is engulfed at the foot of the front, lifted up the face and over the crest, ridden
  down the long back and set down on the sea floor about 3.5 minutes later with its engines flooded: 45 minutes of
  local time (over five years on Earth) to drain them before it can lift off, as in the film. Time compression on the
  ground (x10, x60) is offered for the wait and switches off when the next wave approaches. A crew member outside is
  swept off their feet and hauled back aboard. (A floating hull's ride up a 1.2 km wall is stylised: it lags the
  water and rides about two metres deep, tilted with the surface up to 40 degrees.)
- Mann: glacier with pressure ridges and crevasses under frozen clouds held aloft.
- Edmunds: stony desert, mesas, dry washes, boulder fields and mountain ranges, breathable air.
