# Graphics & VFX Guide (HDRP)

## Pipeline setup
- Unity 2022.3 LTS+, **HDRP 14+**. Enable: volumetric clouds, volumetric fog,
  physically based sky, water system, SSGI/SSR (or ray tracing where available),
  exposure in physical units.
- Two-camera stack from `ScaleSpaceManager`: scaled camera (culling mask
  `ScaledSpace`, depth -1, far 1e7) renders first; local camera (depth 0,
  near 0.1, far 100 km) clears depth only.
- Color: ACES tonemapping, physical light units (sunlight ≈ 130,000 lux at Earth).

## Terrain material (planet surface)
- Base: **LitTessellation** ShaderGraph, triplanar sampling (no UV seams on a sphere).
- Splat by vertex color from the compute shader: `r`=biome id, `g`=moisture,
  `b`=temperature, `a`=slope. Blend 6–8 texture sets (albedo/normal/mask, 2K,
  from Quixel Megascans or similar).
- **Parallax occlusion mapping** on rock/gravel sets within 30 m; fade to plain
  normal maps beyond.
- **Tessellation**: distance-faded, max factor 16 within 50 m — gives the
  centimetre relief NMS achieves. Cheaper fallback: pre-displaced max-depth patches.
- **Subsurface scattering** (HDRP diffusion profile) on ice and snow biomes;
  slight SSS on sand for that soft NMS dune look.
- Detail normal (tiling 0.2 m) fades in under 5 m for first-person fidelity.

## Ocean
- HDRP **Water System**: one water surface per ocean world, spherical mode off —
  place a local planar patch under the player, snapped to the geoid, floating-origin aware.
- Foam from shoreline distance field; caustics projector in shallows.
- Storm states: drive `largeWindSpeed` from the weather system.

## Atmosphere & sky
- Per-planet **Physically Based Sky** profile (Rayleigh/Mie/ozone tuned per body:
  Mars thin & dusty, Titan orange smog, Venus crushing sulfur).
- The scaled-space layer uses `AtmosphereScattering.shader` (single-scatter
  ray-march) so planets have glowing limbs from orbit.
- **Volumetric clouds**: HDRP cloud layers for high cirrus + full volumetric
  clouds under 10 km. Weather map texture generated per-planet from the same
  noise seed. God rays: volumetric fog + high shadow-resolution sun.

## Re-entry plasma (VFX Graph)
- **Sheath**: cone-shaped GPU particle strip emitter anchored to the stagnation
  point, stretched billboards, scroll speed ∝ airspeed, HDR orange→blue-white
  gradient by `HeatIntensity` (from `AtmosphereEntry`).
- **Shock ring**: single quad, radial gradient shader, spawned at Mach transitions.
- **Trail**: ribbon of ionized streaks behind the ship, lifetime 2 s, turbulence noise.
- Post: heat-distortion (screen-space refraction quad in front of camera),
  chromatic aberration ramp, exposure kick. Hull emissive via `_EmissiveColor`
  (already driven by `AtmosphereEntry.cs`).

## Thrusters
- Main engine: layered VFX Graph — inner mach-diamond core (additive, 20k nits),
  outer plume (soft alpha), heat distortion cone, point light (60,000 lm) with
  flicker, dust interaction: spawn surface dust when raycast down < 15 m.
- In vacuum: plume expands wider & becomes transparent (real vacuum expansion) —
  lerp plume width by ambient pressure from `CelestialBody.AtmosphericDensity`.
- RCS: 0.2 s white puffs, cold-gas look, driven by `RCSController`.

## Wormhole
- Mouth: `Wormhole.shader` (grab-pass lensing + Doppler accretion disk).
  In HDRP use ShaderGraph + **HD Scene Color** node for the distortion.
- Tunnel: inverted cylinder, scrolling polar-warped star-streak texture,
  secondary rotating energy filaments layer, FOV 65→110 pull, heavy chromatic
  aberration + motion blur volume (`wormholeOverlayVolume`, weight 0→1).
- Exit flash: white bloom spike (exposure override for 0.3 s) sells the arrival.

## Post-processing stack
Bloom (scatter 0.7, HDR), HDR **lens flares** (SRP lens flare on the Sun +
engine lights), motion blur (shutter 0.5, off during cockpit view), per-biome
LUT color grading, vignette + film grain (subtle), depth of field only in
photo mode.

## Performance
- GPU instancing for all surface scatter (Graphics.RenderMeshInstanced, per-cell batches).
- Occlusion culling baked for cockpit interior; frustum + horizon culling for
  terrain patches (a whole hemisphere is always hidden — cull `dot(patchDir, camDir) < -0.1`).
- Texture streaming with 1.5 GB budget; async readback everywhere (never block on GPU).
- Target: 60 fps @ 1440p on RTX 3060; use DLSS/FSR2 for 4K.
