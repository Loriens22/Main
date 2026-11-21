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
- **Atmospheric mode of the drive** (fiction built on real proposals: Zubrin's NIMF rocket heating Martian CO2,
  nuclear ramjets for Jupiter's atmosphere): in dense air the drive heats intake gas as reaction mass instead of
  tank propellant. The fraction taken from the air is the intake's mass flow (density x airspeed x 1.5 m^2) over
  what the thrust needs at the heated gas's exhaust speed (300 s for CO2/N2, 800 s for hydrogen). It matters where
  gravity losses pile up, low and slow in thick air: the Venus climb out of 92 bar now uses about half the tanks
  (tested), the Miller climb two thirds; on Mars and airless worlds it does nothing.
- **Gas and ice giants: floating stations.** There is no surface. Each giant has a station at the 1-bar level
  (Aeolus at Jupiter, Zephyr at Saturn, Boreas at Uranus, Notus at Neptune): a deck carried by three 110 m
  hot-hydrogen envelopes (the only aerostat that floats in a hydrogen atmosphere: heated hydrogen inside, cold
  outside; ~0.1 kg of lift per m^3 at Jupiter, ~230 t in all). It liquefies hydrogen from the air (ISRU), refuels
  the Ranger on landing and builds an ascent booster: two pods strapped beside the Ranger (Jupiter 62 t of
  propellant, Saturn 30 t, Uranus 16 t, Neptune 18 t), engines firing with the Ranger's, the Ranger drawing from them
  (cross-feed), dropped when dry or at injection. The climb to orbit at Jupiter needs ~35 km/s (orbital speed 42 km/s
  less the rotation): no single-stage craft of the Ranger's size does it.
- **The survey orbit.** Station landings are flown from a low circular orbit (Jupiter 4,000 km, Saturn 3,000 km,
  Uranus and Neptune 2,500 km: below the radiation belts, as Juno and Cassini's last orbits went close in), chosen
  for the capture in the navigation console or reached later by a Hohmann transfer (its cost and time shown). From
  the high parking orbit a descent is impossible to time (a slow two-day orbit over a ten-hour rotation) and the
  return would need over 50 km/s.
- The entry at a giant is fast (Jupiter ~30 km/s relative to the air, the Galileo probe met 47): the Ranger's heat
  shield is fiction. Guidance: the glide may fly lift-down when faster than circular, keeps lateral authority when
  the co-rotating air drags it sideways, and ends where the engines (only ~1.5 g of thrust at Jupiter's 2.5 g) can
  still stop the fall; the ascent goes onto a transfer ellipse from just above the air, trims the apoapsis, coasts and
  closes in. Tests: all four giants land on the pad at 1 m/s and return to within 35 m of the Endurance.
- In the browser (Jupiter): station landing ~140 s of real time, return to the docking gate ~150 s (longer than
  elsewhere: the climb from 2.5 g takes two hours of simulated time); docking ~45 s.
- Inside a giant (render/Sky.ts giant mode, world/space/Giants.ts): a cloud deck below (Jupiter's ammonium
  hydrosulphide ~25 km down, tan zones and brown belts drawn out east-west, gaps to the deep air), broken cloud
  above (ammonia ice), H2/He Rayleigh scattering scaled to 1-bar density, haze or methane absorption, lightning glowing
  in the deep clouds with muffled thunder (sound in cold hydrogen ~1.1 km/s).
- **Earth**: the Ranger comes home to a levelled field by the NASA gate (the same terrain map as the Earth zone,
  centred on the pad). Back on the ground, "Walk out at NASA" opens the full Earth zone round the field with Ranger 1
  standing on it; boarding it returns to its cockpit. The climb back to orbit is single-stage (the fiction drive and
  its atmospheric mode: ~60% of the tanks), unlike the film's rocket launch.
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
- The image is traced at the story's spin, a = 1 - 1e-14. The GPU's single precision holds it as 1.0; the
  quantities that differ (horizon 1 + 1.4e-7 M, innermost stable orbit 1.000034 M) are computed in double precision on
  the CPU, and Delta is written (r - 1)^2 + a^2 - 1 to keep its precision near the horizon. The near-extremal
  signatures show: the shadow's prograde edge is flat, with a bright line of near-horizon emission along it (the
  "NHEK line" of Gralla, Lupsasca & Strominger 2017), and the disk image is strongly lopsided.
- Its galaxy's sky is procedural (not ours: Earth's constellations would be wrong there).
- Light in that system comes from the beamed inner disk, not the hole's centre.

## Miller, Mann, Edmunds

- Miller: knee-deep sea over a rippled floor; the tidal wave (1.2 km, 40 m/s, once per local hour), first seen as a
  mountain range on the horizon, with warnings and a growing roar. The wave is the film's (no real ocean makes one
  over a knee-deep sea), so its flow is an assumption: the water's particle velocity is that of a long wave whose
  moving mass is ~1.5 km thick, forward u = c eta/(eta + D), the surface water rising up the face at -(c - u) d(eta)/dx
  (the surface is a streamline of the steady flow seen from the wave); the crest is rounded (a smooth minimum of the
  front and back profiles, not a cusp). The Ranger's response is ordinary mechanics (world/space/WaveRide.ts,
  tests/waveride.test.ts): buoyancy of a 17 x 5 x 3.2 m hull, drag against the water on its wetted side and bottom,
  added mass, gravity, the sea floor and friction. Caught on the pad it is swept up the face at up to ~100 m/s
  (briefly engulfed, ~35 m of water over the hull), thrown a second or so clear of the crest, rides down the long back
  and is set down about 2.6 km on, five minutes later, at worst ~3 g. Peak loads and depth damage the hull; the
  engines are flooded: 45 minutes of local time (over five years on Earth) to drain them, as in the film, with time
  compression on the ground for the wait. The launch then starts from where the Ranger stands. A crew member outside
  is swept off their feet and hauled back aboard.
- Mann: glacier with pressure ridges and crevasses under frozen clouds held aloft.
- Edmunds: stony desert, mesas, dry washes, boulder fields and mountain ranges, breathable air.

### The Lazarus camps (`world/space/Lazarus.ts`, `blender/assets/lazarus.py`, `world/terrain/sites.ts`)

All the models are built in Blender (lazarus.py): the scouts' one-way lander (a low, dark, faceted hull on four
short legs, no ascent stage), Miller's wreck, Mann's shelter and survey robot, Edmunds' camp. Mann's shelter and
Edmunds' camp follow the reference photos: a barrel vault of telescoping orange ribs with a dark rear shell, half
buried in grey ice dust, a white panelled room inside (ceiling panels and light strips, cable trays, padded bags
overhead, stacked crates, the boxy frosted cryo casket); long white inflatable tents with rib seams among granite
boulder piles, a flag, a container on stilts, a rover, crates and lamp posts. The ground under each camp is
levelled (sites.ts, used by the terrain worker and the zone alike). Every surface is solid: the models' meshes are
static trimesh colliders, the doors are kinematic bodies.

- Miller: the lander lies on its side in the shallows, roof torn off and lying apart, legs snapped, debris strewn
  the way the waves run. The flight recorder strobes beside it, its antenna above the water; recovering it reads her
  68 minutes on the surface (nearly eight years outside).
- Mann: open the cryo casket and he climbs out. He tells the crew what they came to hear and offers to show the
  survey site on a ridge 355 m off; follow him up and he cracks the commander's visor, then runs for Ranger 1 (locked
  to him), and seals himself in his shelter. A cracked visor leaves 120 s of oxygen (the HUD counts it, frost and
  fractures creep across the view): enough to reach a pressurised cabin at a run, not at a walk; inside the Ranger
  the visor is patched. Running out blacks the commander out (the crew drag them back aboard); Creative Mode's damage
  protection holds the oxygen at reserve instead. His log at the desk tells the truth (and can be put to him). The
  survey robot's data core is wired to its power cell: opening it blind blows it (and the shelter's power) apart and
  cracks the visor; cutting the cable first recovers the robot's own survey: a dead world.
- Edmunds: the camp is dark, the beacon silent, the greenhouse mostly dead. His journal tells the story and where the
  power feed is; reconnecting it lights the camp and the tents glow; the beacon can be restarted, seeds collected
  (a few seedlings of the hardy strain live), and a cairn raised where he asked to lie.

Dialogue and story text are original. What has been done is kept as story facts across saves and visits.
