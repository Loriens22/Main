# Mobile Accessibility Strategy

HDRP does not run on phones. The mobile plan has two tracks:

## Track A — Native mobile build (URP)
Keep all gameplay/simulation code (it's pipeline-agnostic — physics, quadtree,
floating origin, wormhole flow are pure C#), swap the render layer:

| System | Desktop (HDRP) | Mobile (URP) |
|---|---|---|
| Sky/atmosphere | Physically Based Sky | `AtmosphereScattering.shader` (already URP-compatible) |
| Clouds | Volumetric clouds | Billboarded cloud domes + 2D noise flipbook |
| Terrain material | LitTessellation + POM | URP Lit, triplanar, no tessellation; maxDepth 14 |
| Water | HDRP Water System | Gerstner vertex waves + scrolling normals |
| Re-entry / thrusters | VFX Graph | Shuriken particle equivalents (already used in scripts) |
| Post | Full stack | Bloom + vignette only |

Scalability knobs already in the code: `ProceduralPlanet.maxDepth` (18→14),
`patchResolution` (33→17), build budget per frame (4→2), `noiseOctaves` (12→7),
shadow distance, half-res transparency. Target: 30 fps on a mid-range 2023 phone.

Compute shaders require Vulkan/Metal — supported on target devices; keep the
CPU fallback path (Burst-jobbed noise) for older GL ES 3.1 devices.

## Track B — Instant web demo (shipped in this repo)
`stellar-odyssey-demo.html` — a single-file Three.js/WebGL build of the core
loop that runs in any mobile browser with touch controls (virtual sticks,
throttle slider, wormhole button). No install, no store, works today. It shares
the same architecture: Newtonian n-body gravity, floating origin rebasing,
LOD'd procedural planets, seamless entry/landing, wormhole travel.

Use it as the playable design reference while the Unity build matures.
