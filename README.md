# 🌕🔴 Lunar & Ares Program

A single-file, full-**3D**, physically-accurate KSP-style rocketry sim — build rockets, launch, reach orbit, and land on the **Moon** or **Mars**, by hand or on full autopilot.

**Play:** open `index.html` in any browser (desktop or mobile). Fully self-contained (Three.js inlined) — no network needed.

## The solar system
Real, heliocentric, and live: the Sun, Earth (rotating, with atmosphere), the Moon (384,400 km, tidally locked) and Mars (1.52 AU, thin CO₂ atmosphere) all move on true orbits with real gravitational parameters. Ship physics is RK4 over the full four-body field; SOI transitions, phase windows and transfer times are all real (a Mars window really is ~44° of lead angle, and the cruise really takes ~9 months — hence time warp to **10,000,000×**, selectable from 1× / 5× / 20× upward).

## Features
- **Full 3D WebGL rendering**: procedurally-textured planets (continents, clouds, night-side city lights, lunar maria and craters, martian canyons and polar caps), atmosphere rim scattering, dynamic sun-lit terrain patches, star field, chase camera you can orbit with a drag.
- **Launch site**: full complex — pad, service tower, crawlerway, VAB, fuel farm — plus a **research campus** with a glass laboratory, twin optical observatory domes and two giant radio telescopes that slowly track the sky.
- **Two autopilot missions** (press `P`): 🌕 Moon (ascent → 185 km orbit → phase-angle TLI → midcourse corrections → capture → powered descent) or 🔴 Mars (ascent → departure window wait → patched-conic escape alignment → TMI → interplanetary corrections → capture → atmospheric entry behind the heat shield → supersonic chute → retro-propulsive touchdown).
- **Vehicle assembly** with 20 parts, per-stage Δv/TWR, and four stock rockets: ARTEMIS V (Moon), ARES IX (Mars), ORBITER K-2, STRATOS.
- Aerodynamics with Mach effects on both atmospheres, part heating with shields and plasma, staging, fuel flow, SAS, map view with numerically integrated trajectory prediction across all four SOIs.

## Controls
`A/D` rotate · `Shift/Ctrl` throttle · `Z/X` full/cut · `Space` stage · `T` SAS · `1-4` SAS modes · `M` map · `,`/`.` warp · `P` autopilot (choose Moon or Mars) · `C` chute · `G` gear · drag = orbit camera · wheel/pinch = zoom · `F` map focus · `Esc` menu

Verified headlessly end-to-end: both the lunar and martian autopilot missions fly from the pad to touchdown without errors.
