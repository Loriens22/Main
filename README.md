# 🌕 Lunar Program

A single-file, physically-accurate KSP-style rocketry sim — build rockets, launch, reach orbit, and land on the Moon, by hand or on full autopilot.

**Play:** open `index.html` in any browser (desktop or mobile). No dependencies, no network needed.

## Features
- **Real physics**: real Earth/Moon gravity (μ, radii, 384,400 km), RK4 integration with lunar third-body perturbation, rotating Earth (465 m/s free at launch), exponential atmosphere, Mach-dependent drag, dynamic pressure, part heating with reentry plasma and heat shields.
- **Vehicle assembly**: 20-part catalog (pods, tanks, engines, decouplers, chutes, legs, fins), per-stage Δv/TWR readouts, plus 3 pre-built rockets (ARTEMIS V lunar stack, ORBITER K-2, STRATOS).
- **Full mission autopilot** (press `P`): gravity-turn ascent guidance → 185 km parking orbit → phase-angle-timed trans-lunar injection → predictive midcourse corrections (~20 m/s) → lunar orbit insertion → Apollo-style DOI → powered descent → soft touchdown, in ~4 days mission time (seconds at 100,000× warp).
- **Flight systems**: staging, SAS (hold/prograde/retrograde/up), throttle, time warp to 100,000×, navball, map view with numerically integrated trajectory prediction, Ap/Pe markers, SOI display, ghost Moon at arrival.
- **Detailed worlds**: procedurally generated Earth (continents, clouds, night lights, terminator) and Moon (craters, maria), terrain with launch complex, ocean splashdowns, cratered lunar surface.
- Touch controls for mobile, engine audio, particles, explosions.

## Controls
`A/D` rotate · `Shift/Ctrl` throttle · `Z/X` full/cut · `Space` stage · `T` SAS · `1-4` SAS modes · `M` map · `,`/`.` warp · `P` Moon autopilot · `C` chute · `G` gear · `+/-` zoom · `F` map focus · `Esc` menu

Verified headlessly: the autopilot flies launch → orbit → TLI → correction → LOI → powered descent → lunar touchdown end-to-end without errors.
