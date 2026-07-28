# THE DROWNING CSÁRDÁS

A single-file, real-time 3D surreal performance: a decaying amphitheater, four
uncanny women, Monti's *Csárdás* (1904, public domain) synthesised live, and the
water that has been waiting under the stage.

Open `index.html` in any browser with WebGL 2. No build step, no assets, no
network — every mesh, texture, animation and note is generated at runtime.

## The performance

| Phase | Time | What happens |
|---|---|---|
| I · Opening | 0–30s | Ritual csárdás. Heel stamps, freezes, broken mirroring. Slow orbit, faint Dutch angles. |
| II · Escalation | 30–70s | The dancers are drawn to the piano. Harsher light, geometry glitches, colour inversions. |
| III · The Flood | 70–185s | Water rises through the floor and the walls. Ankle → knee → waist → over the keys. |
| IV · Drowned | 185s+ | A slow underwater dance. The theme collapses into a drowning version of itself. |

## Controls

`tap / click` raise the chaos level · `drag` free look · `wheel` dolly ·
`C` auto ⇄ free camera · `1` `2` `3` `4` jump to a phase · `R` restart · `F` slow motion

## Systems

All in `index.html`, in file order, each section marked with a numbered banner:

1. **CONFIG** — every tunable in one object: phase boundaries, water rise speed and
   wave shape, chaos response, per-phase colour grading, post-processing amounts,
   quality budgets, audio mix.
2. **math** — mat4 / vector helpers (TRS composition, inverse, projection).
3. **GL core** — program + mesh + framebuffer wrappers, instancing, HDR targets.
4. **shaders** — scene (PBR, shadows, caustics, height fog, breathing and glitch
   vertex distortion), water (screen-space refraction, foam, glint), points, and the
   post chain (DOF, bloom, god rays, aberration, grain, glitch, film burn, grade).
5. **world** — procedural amphitheater: spiralling seat tiers, columns swept as
   melting wax, an arcade, a ribcage wall, and a decaying grand piano.
6. **cast** — 20-bone rigs with rigid tapered-capsule bones, facial blendshapes
   (jaw / brow / eyelid regions driven by `uMorph`), and verlet cloth costumes that
   drift between fabric, feather and liquid.
7. **audio** — the score as note data, a piano voice per note, reversed ghost passes,
   drones, water bed, distant screams, and a degradation chain (drive, muffle,
   detune, tempo sag) wired to the timeline. The pianist's hands are driven by the
   same note stream the speakers receive, so the sync is structural, not authored.
8. **water** — rising heightfield with wave sum, upward-flowing anomalies, refraction,
   caustics projected onto everything beneath the surface, foam at the shoreline.
9. **director** — seven cinematic shot types (orbit, push-in, dutch low, high wide,
   surface, submerged, handheld close) sequenced per phase, plus free-look.
10. **loop** — update, shadow pass, scene pass, water pass, particles, post.

## Tuning

Everything worth changing lives in `CONFIG` at the top:

```js
CONFIG.water.riseSpeed   // metres per second during the flood
CONFIG.water.maxLevel    // final depth
CONFIG.chaos.perClick    // how much a tap adds
CONFIG.grade.flood.tint  // colour grading per phase
CONFIG.quality.waterGrid // 150 → 90 on weak hardware
CONFIG.quality.dprCap    // render scale ceiling
CONFIG.timeline          // phase boundaries in seconds
```

## Performance

Forward renderer, one 1024² shadow map, quarter-resolution bloom, HDR (RGBA16F where
available, RGBA8 fallback), device-pixel-ratio capped at 1.5. Instanced seats,
columns, ribs, keys and debris; costumes are the only per-frame CPU geometry.
On weak GPUs, lower `waterGrid`, `dprCap` and `shadow` in `CONFIG.quality`.
