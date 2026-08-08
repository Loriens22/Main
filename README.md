# Stellar Expanse

A single-file, zero-dependency WebGL2 space exploration game — Kerbal Space Program
orbital physics meets No Man's Sky procedural planets.

**Play / download:** open `stellar-expanse.html` in any modern browser. No server, no
install, no network access required. Works on desktop and mobile (touch controls).

## What's in it

- **True 1:1 scale solar system** — Sun + 8 planets + Luna, Io, Europa, Ganymede, Callisto,
  Titan, Enceladus, Triton, Pluto, with real radii, GM, rotation periods and axial tilts.
- **4096 procedurally generated star systems** reachable by wormhole, each with its own
  star class, planets, moons, atmospheres and oceans.
- **Procedural planets** — cube-sphere quadtree chunked LOD terrain generated on the CPU
  from a layered noise stack (derivative-damped fBm, ridged multifractal, domain warping,
  Worley craters), explorable from orbit down to walking scale.
- **Real orbital mechanics** — Float64 patched-conic gravity, Keplerian elements,
  apoapsis/periapsis/period readouts, time warp, KSP-style navball.
- **Atmospheric scattering** — Rayleigh + Mie + ozone single scattering with aerial
  perspective, correct twilight, and a night side that never goes pure black.
- **Analytic Gerstner ocean** with Fresnel, GGX sun glint, subsurface scattering and foam.
- **Volumetric clouds** — raymarched shell with dual-lobe Henyey-Greenstein phase and
  Beer's-powder edge darkening.
- **Wormhole travel** — Ellis-metric ray deflection, Einstein ring, Doppler-beamed
  accretion disk, and a hyperspace transit tunnel.
- **Full flight model** — 6-DOF rigid body, pressure-dependent Isp, RCS, SAS, Mach-dependent
  drag, body lift with stall, aerodynamic weathercocking, Sutton-Graves re-entry heating,
  and spring-damper landing gear.
- **In-game documentation** (the DOCS button) — a complete Unity HDRP project structure,
  key C# scripts, an Unreal Engine 5 alternative plan, shader/VFX recommendations, ship
  import guidelines, an MVP→full roadmap, and a performance budget.

## Build

Sources live in `src/` as ordered part-files. `./tools/build.sh` concatenates them into
`stellar-expanse.html`. `tools/test.js` runs the result in headless Chromium and reports
errors plus a screenshot.
