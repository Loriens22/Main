/* ============================================================================
   p10-docs.js — DOCUMENTATION PAYLOAD          agent B5, tag: doc
   Declares: DOCS_HTML (template literal of HTML injected into #docs)
             docSelfTest() — contract rule 3
   NOTE: this is a JS template literal. Every backtick is escaped \` and every
   dollar-brace is escaped \${. Angle brackets and ampersands inside <pre><code>
   are HTML-escaped (&lt; &gt; &amp;).
   ========================================================================= */

const DOCS_HTML = `<div class="w">

<h1>STELLAR EXPANSE — ENGINE PORTING &amp; PRODUCTION GUIDE</h1>

<p>This document is the bridge between the single-file WebGL2 prototype you are
currently flying and a full production build in Unity HDRP or Unreal Engine 5. It is
written against the algorithms this build actually uses — the Float64 heliocentric
state vectors, the camera-relative render path, the derivative-damped fBm heightfield
in <code>fieldHeight()</code>, the cube-sphere quadtree, the patched-conic solver —
so that a port reproduces the same behaviour rather than a superficially similar one.</p>

<p>Everything below assumes the prototype's unit and precision contract, because it
is the only one that works at this scale:</p>

<ul>
<li><strong>1 unit = 1 metre, everywhere.</strong> The solar system is at true 1:1
scale (Sun–Earth = 1.496e11 m). No "Kerbal-scale" 1:10 fudge.</li>
<li><strong>Simulation state is double precision, in absolute coordinates</strong>
(heliocentric, or barycentric if you go n-body).</li>
<li><strong>Rendering is always camera-relative.</strong> The camera's double-precision
position is subtracted before anything is handed to the GPU. No absolute world position
ever enters a <code>float</code>.</li>
<li>Depth is handled by <em>layered cameras</em> (and, in this WebGL build,
a logarithmic depth term), not by a single 0.1 m → 1e13 m projection. That projection
does not exist; see §1.6.</li>
</ul>

<div class="note"><strong>On confidence.</strong> Engine behaviour drifts between minor
versions, especially in HDRP and in Unreal's Nanite/Lumen. Where a number or a feature
is version-dependent I say so explicitly instead of quoting a false precision. Verify
the flagged items against the version you actually ship on.</div>

<h2>0. WHAT THE PROTOTYPE DOES, IN ONE PAGE</h2>

<p>A port is only faithful if it reproduces these five things. Read this before §1.</p>

<h3>0.1 The heightfield is the single source of truth</h3>
<p><code>fieldHeight(x, y, z, dna)</code> takes a <em>unit direction</em> on the planet
sphere and returns <strong>metres of elevation relative to <code>dna.radius</code></strong>.
It drives the render mesh <em>and</em> the collision mesh <em>and</em> the altimeter.
Its structure is:</p>
<ol>
<li>A three-channel <strong>domain warp</strong> (three independent noise lookups scaled by
<code>dna.warp</code>) applied to the sample position, which is what stops the continents
looking like blobby Perlin.</li>
<li><strong>Derivative-damped fBm</strong> (<code>uberfbm</code>): each octave's contribution
is attenuated by <code>1 / (1 + damp * |accumulated gradient|²)</code>. This is the
No Man's Sky-style trick that keeps plains flat and mountain ranges coherent instead of
producing uniform crumple everywhere. <strong>It requires analytic noise derivatives</strong>,
which is why <code>noise3()</code> returns its gradient.</li>
<li><strong>Orogenic ridges</strong> (<code>ridged</code> fBm) gated by a continental-gradient
mask, squared — so ridges appear in belts near continental edges, not uniformly.</li>
<li><strong>Terracing and river carving</strong>, masked by a noise field, using a
quantise-and-lerp for mesas and a converging inverted-ridge field for valleys.</li>
<li><strong>Dunes, Worley-cell impact craters</strong> (three octaves, bowl-plus-rim profile,
depth ≈ 0.2 × diameter), volcanic shields, and polar ice accumulation.</li>
</ol>
<p>An octave cap (<code>dna._oct</code>) lets distant/cheap samples skip the expensive
late stages. Any port must keep that cap and must keep the <em>ordering</em> of these stages
identical between CPU and GPU (§2.10).</p>

<h3>0.2 Physics is Float64, absolute, and patched-conic by default</h3>
<p>Bodies carry <code>mu</code> (standard gravitational parameter, m³/s²), <code>soi</code>
(sphere-of-influence radius), and classical elements <code>a, e, inc, raan, argp, m0</code>.
The ship integrates under one dominant attractor at a time; SOI crossings swap the frame.
The optional n-body path exists but is not the default, for reasons in §2.6.</p>

<h3>0.3 Model space convention</h3>
<p><strong>−Z = forward (nose), +Y = up (dorsal), +X = right (starboard)</strong>. Quaternions
are <code>[x, y, z, w]</code>. This matters enormously for asset import (§5.3): Unity is
+Z-forward, Unreal is +X-forward, Blender is −Y-forward/+Z-up. Pick one convention, write it
on the wall, and put a conversion in exactly one place.</p>

<h3>0.4 Quality tiers are data, not branches</h3>
<p>Every raymarch loop bound in the prototype comes from a uniform the engine sets per tier
(<code>QUALITY.steps.atmo</code>, <code>.cloud</code>, <code>.wh</code>). Keep this discipline
in the port: shader variants explode combinatorially, and a uniform loop bound with a small
constant maximum compiles fine and is far cheaper to maintain than eight permutations.</p>

<h3>0.5 The frame contract</h3>
<p><code>CTX</code> is rebuilt once per frame with <code>phase</code> ∈
{space, orbit, reentry, atmo, landed, warp}, <code>altitude</code>, <code>atmoDensity</code>,
<code>reentryHeat</code>. Almost every visual and audio decision keys off that one struct.
Reproduce it as a single frame-state object in the port; resist the temptation to let each
system query the world independently, because that is how you get systems disagreeing about
which planet you are near during an SOI transition.</p>

<h2>1. UNITY HDRP PROJECT STRUCTURE</h2>

<div class="note"><strong>HDRP does not run on phones.</strong> The High Definition Render
Pipeline targets desktop and current-gen consoles only. If the mobile 30 fps target in §7
is a hard requirement, you are shipping <em>two</em> render pipelines: HDRP for desktop/console
and URP for mobile, with a shared simulation layer. Plan the folder structure for that from
day one — it is the single most expensive thing to retrofit. The tree below marks
pipeline-specific folders explicitly.</div>

<h3>1.1 The Assets tree</h3>

<pre><code>Assets/
  _Project/                         &lt;- everything we own; keeps 3rd-party out of the way
    Art/
      Materials/
        Ship/          M_Hull_Steel.mat, M_Hull_Ceramic.mat, MI_*.mat (variants)
        Terrain/       M_Terrain_Rock.mat, M_Terrain_Regolith.mat, M_Terrain_Ice.mat
        Sky/           M_AtmosphereOverride.mat
        Debug/         M_Wireframe.mat, M_QuadtreeDebug.mat
      Meshes/
        Ship/          FBX source + .meta; one folder per vessel
        Props/         landing pads, antennae, greeble kit
        Scatter/       rocks/plants for GPU-instanced surface scatter (LOD0 only, tiny)
      Textures/
        Ship/          T_Hull_BC.png  T_Hull_N.png  T_Hull_MaskMap.png  T_Hull_E.png
        Terrain/       tiling detail albedo/normal arrays (Texture2DArray, not atlases)
        Lut/           precomputed transmittance/multiscatter LUTs (see 4.1)
        Noise/         3D Perlin-Worley 128^3, 32^3 Worley (see 4.2)
      VFX/
        Graphs/        VFX_EnginePlume.vfx, VFX_ReentryWake.vfx, VFX_LandingDust.vfx
        Particles/     legacy Shuriken systems that must be CPU-readable
        Meshes/        plume bell mesh, shock cone mesh
    Audio/
      Mixers/          MainMixer.mixer (Vacuum snapshot and Atmosphere snapshot)
      SFX/  Music/  Ambience/
    Code/
      Runtime/
        Numerics/      DoubleVector3.cs  DoubleQuaternion.cs  DoubleMath.cs
        Origin/        FloatingOrigin.cs  IOriginShiftable.cs  OriginRoot.cs
        Orbital/       OrbitalBody.cs  KeplerSolver.cs  PatchedConicSolver.cs
                       NBodyGravity.cs  OrbitPredictor.cs  ManeuverNode.cs
        Ship/          ShipController.cs  Engine.cs  RcsPort.cs  AttitudeController.cs
                       SasMode.cs  LandingGear.cs  ResourceSystem.cs
        Flight/        AtmosphericFlight.cs  AtmosphereModel.cs  AeroSurface.cs
                       HeatShield.cs  DragCurves.cs
        Planet/        PlanetGenerator.cs  QuadtreeNode.cs  ChunkBuilder.cs
                       ChunkMeshJob.cs  TerrainCollision.cs  PlanetDNA.cs
                       BiomeResolver.cs  SurfaceScatter.cs
        Scale/         ScaleManager.cs  ScaledSpaceProxy.cs  CameraStack.cs
        Wormhole/      WormholeController.cs  WormholeVisual.cs  ArrivalPlanner.cs
        Save/          SaveGame.cs  SaveMigration.cs
        UI/            Navball.cs  HudBinder.cs  MapView.cs  DocsPanel.cs
        Core/          FrameContext.cs (the CTX equivalent)  GameClock.cs  TimeWarp.cs
      Editor/          PlanetDnaInspector.cs, ChunkDebugWindow.cs, build hooks
      Tests/
        EditMode/      KeplerRoundTripTests.cs  FieldHeightParityTests.cs
        PlayMode/      OriginShiftTests.cs  SoiTransitionTests.cs
    Data/                             &lt;- ScriptableObjects, the tuning surface
      Bodies/          SO_Sun.asset  SO_Earth.asset  SO_Luna.asset ...
      PlanetArchetypes/  SO_Archetype_Rocky.asset ... SO_Archetype_OceanWorld.asset
      Ships/           SO_Ship_Lander.asset  SO_Engine_Merlin.asset  SO_Rcs_Draco.asset
      DragCurves/      SO_Drag_Capsule.asset  SO_Drag_Slender.asset
      Biomes/          SO_Biome_Tundra.asset ...
      Config/          SO_QualityTiers.asset  SO_SimulationConfig.asset
    Prefabs/
      Ships/           P_Lander.prefab (+ variants per loadout)
      Planet/          P_PlanetRoot.prefab, P_ChunkTemplate.prefab
      Systems/         P_GameSystems.prefab (all singletons, one DontDestroyOnLoad root)
      UI/              P_Hud.prefab, P_MapView.prefab
    Scenes/
      Boot.unity            tiny: loads config, spawns systems, additively loads the rest
      Space.unity           persistent: cameras, sun, scaled-space proxies, systems
      Surface_Streaming.unity   empty container that quadtree chunks parent into
      Dev_SinglePlanet.unity    the Phase-0/2 harness — keep it forever
      Dev_KeplerBench.unity     numerical regression scene
    Settings/
      HDRP/            HDRP_Desktop_High.asset  HDRP_Desktop_Med.asset  HDRP_Console.asset
                       (HDRenderPipelineAsset per tier; assigned from SO_QualityTiers)
      URP/             URP_Mobile_High.asset  URP_Mobile_Low.asset      (the phone build)
      Volumes/         VP_Space.asset  VP_Orbit.asset  VP_Reentry.asset
                       VP_Atmosphere.asset  VP_Surface_Day.asset  VP_Surface_Night.asset
      Quality/         QualitySettings tiers, shadow/LOD bias per tier
      Diagnostics/     HDRP Frame Settings overrides used only in dev builds
    Shaders/
      Terrain/         Terrain.shadergraph (+ TerrainCommon.hlsl)
      Ship/            ShipPBR.shadergraph, ShipDecal.shadergraph
      Sky/             AtmosphereSky.cs + AtmosphereSkyRenderer.cs + Atmosphere.shader
      Clouds/          VolumetricClouds override OR custom CloudPass.hlsl
      Ocean/           OceanFFT.compute, Ocean.shadergraph
      Wormhole/        Wormhole.shader, GeodesicLUT.compute
      Compute/         TerrainHeight.compute  ScatterCull.compute  ChunkNormals.compute
      Include/         Noise.hlsl  FieldHeight.hlsl  Constants.hlsl  &lt;- SHARED, see 2.10
      PostProcess/     CustomPostReentry.cs (HDRP Custom Post Process Volume)
    StreamingAssets/
      Lut/             baked atmosphere LUTs shipped rather than rebuilt on low tiers
  ThirdParty/                       &lt;- never mix with _Project
  Plugins/</code></pre>

<h3>1.2 Why this shape</h3>
<ul>
<li><strong><code>Code/Runtime</code> subfoldered by system, with an asmdef per top-level
folder.</strong> Assembly definitions are the only thing that keeps iteration times sane once
you pass roughly 1500 scripts, and they enforce the dependency direction you want:
<code>Numerics</code> ← <code>Orbital</code> ← <code>Ship</code> ← <code>UI</code>, never
backwards. <code>Numerics</code> and <code>Orbital</code> should have <em>no</em> UnityEngine
dependency beyond <code>Unity.Mathematics</code>, so you can unit-test them headlessly and run
the Kepler regression suite in CI.</li>
<li><strong>Data as ScriptableObjects, not as fields on prefabs.</strong> A planet is
<code>SO_Body</code> (μ, radius, rotation period, axial tilt, parent, elements) plus
<code>SO_PlanetArchetype</code> (the DNA generator's ranges: amplitude, ridge amplitude, warp,
frequency, crater/river/dune/ice/lava/vegetation weights, palette). The DNA object in this
prototype is exactly a serialisable archetype roll — port it verbatim as a
<code>[Serializable] struct PlanetDNA</code> and have the archetype produce it from a seed.
Designers then tune ranges, not instances.</li>
<li><strong>Engines and RCS ports as ScriptableObjects too</strong>
(<code>SO_Engine</code>: vacuum thrust, nozzle exit area, vacuum Isp, throttle range, gimbal
limit, spool rate). Two of the three quantities {F_vac, F_sl, A_e} determine the third — store
F_vac and A_e and derive the rest, so a designer cannot author a physically impossible engine
(§2.7).</li>
<li><strong>Scenes are thin.</strong> <code>Boot</code> loads <code>Space</code> additively.
Planet surfaces are <em>not</em> scenes; they are runtime-generated chunk GameObjects parented
under <code>Surface_Streaming</code>. Do not try to make Unity's scene streaming own planet
terrain — it is built around author-time content, and a quadtree over a sphere is not that.</li>
<li><strong>Keep <code>Dev_SinglePlanet</code> alive forever.</strong> When a physics or LOD bug
appears at hour 40 of a playthrough, the only affordable way to reproduce it is a scene that
boots into the exact configuration in three seconds.</li>
</ul>

<h3>1.3 Camera-relative rendering</h3>
<p>HDRP has a compile-time option <code>ShaderOptions.CameraRelativeRendering</code>, defined in
<code>ShaderConfig.cs</code> inside the HDRP package and mirrored into
<code>ShaderConfig.cs.hlsl</code>. It defaults to <strong>on</strong> and you should leave it on.
What it does: object-to-world matrices are pre-translated by the camera position on the CPU, so
the shader works in a space centred on the camera and world-space positions in the shader never
exceed the scene's local extent. That removes precision loss in <em>shading</em> — normal
reconstruction, specular, shadow lookups, screen-space effects.</p>

<div class="note"><strong>What camera-relative rendering does NOT do:</strong> it does not make
<code>Transform.position</code> double precision. Unity Transforms are float32 regardless.
A ship parked 1.5e11 m from the origin has a position ULP of roughly 16 km. Camera-relative
rendering fixes the shader; only a floating origin (§2.2) fixes the scene graph. Both are
required and they are independent. If you ever need to change this option, copy the HDRP package
into <code>Packages/</code>, edit the C# enum, and run
<code>Edit &gt; Rendering &gt; Generate Shader Includes</code>, or the .hlsl will silently
disagree with the C#.</div>

<h3>1.4 Sky: physically based vs custom override</h3>
<p>HDRP's <strong>Physically Based Sky</strong> is a Bruneton-family precomputed atmosphere with
planetary parameters exposed (planetary radius, ground tint, air and aerosol density and scale
heights, per-channel Rayleigh extinction, Mie anisotropy, ozone layer). It renders correctly from
orbit as well as from the ground, which most sky implementations do not, and it is the right
default.</p>
<p>Its limitations, which will bite you:</p>
<ul>
<li><strong>One atmosphere at a time.</strong> There is a single active sky. During an SOI
transition or a low pass over a moon you must cross-fade parameters, not swap instantly. Drive
every parameter from your <code>FrameContext</code> and interpolate over about two seconds.</li>
<li><strong>Rebuild cost when parameters change.</strong> Changing atmosphere parameters
invalidates the precomputed tables. Amortise: start the blend when the ship enters the
destination SOI, tens of minutes of game time before it matters — or move to Hillaire's
formulation (§4.1), whose LUTs are cheap enough to rebuild every frame, which is the real
answer for procedurally generated planets.</li>
<li><strong>No second scattering body.</strong> A ringed gas giant lighting its moon is not
modelled. Approximate it with a directional bounce light driven by the geometry.</li>
</ul>
<p>Write a custom sky when you need something PBS cannot do — a wormhole-lensed background, a
nebula, or Hillaire's four-LUT model. Subclass <code>SkySettings</code> with a
<code>[SkyUniqueID]</code> attribute and pair it with a <code>SkyRenderer</code>; register with
<code>[VolumeComponentMenu]</code>. Budget roughly a week for a correct one, including the
ambient-probe convolution path — easy to forget, and it is what lights your ship in shadow.</p>

<h3>1.5 Depth precision: why the default fails and what to do</h3>
<p>Unity uses reversed-Z on all modern graphics APIs and HDRP uses a 32-bit float depth buffer.
That combination is close to optimal: reversed-Z pairs the float's dense small-value precision
with the far plane, giving near-uniform relative precision. It still cannot span 0.1 m to 1e13 m.
A working rule of thumb for a single reversed-Z float depth buffer is a
<strong>far/near ratio up to about 1e6 comfortably, 1e7 with visible artefacts</strong>. You
need 1e14.</p>

<p>Three techniques, used together:</p>
<ol>
<li><strong>Layered cameras.</strong> Three cameras sharing a transform, rendered far-to-near
with increasing <code>Camera.depth</code> and a depth clear between them:
<ul>
<li><em>Near</em>: 0.05 m → 20 km. Ship, cockpit, props, near terrain chunks, VFX.</li>
<li><em>Mid</em>: 20 km → 2e7 m. Far terrain chunks, the local planet's full sphere, moons.</li>
<li><em>Far / scaled</em>: 1e3 → 1e9 <em>proxy</em> units. Everything else, in scaled space.</li>
</ul>
Ratios of 4e5, 1e3 and 1e6 — all safe. Culling masks partition the layers; the mid and far
cameras use <code>clearFlags = Depth</code> or <code>Nothing</code>.</li>
<li><strong>Scaled space</strong> for the far camera. Do not render a planet 6e11 m away at its
real size; float cannot express that transform. Place a proxy at a chosen proxy distance
<code>d_p</code> (say 1e6 units) along the true direction, with
<code>scale = trueRadius * d_p / trueDistance</code>. The proxy subtends an identical solid
angle, so it is pixel-identical, but every number involved is small. Kerbal Space Program does
exactly this. The handoff to real geometry lives in <code>ScaleManager</code> (§2.12).</li>
<li><strong>Do not use logarithmic depth in HDRP.</strong> The WebGL prototype uses it
(<code>segLog()</code>) because it is a simple forward path with no depth-buffer consumers. In
HDRP a modified clip-space Z breaks early-Z rejection, hierarchical-Z culling, the depth prepass,
SSAO, SSR, contact shadows, decals and TAA motion-vector reprojection. It is not worth it.
Layered cameras cost you one extra pair of culling passes and nothing else.</li>
</ol>

<h3>1.6 Exposure</h3>
<p>A space game has the widest dynamic range in games: the unattenuated Sun at 1 AU is about
1.36 kW/m² (roughly 120 000 lux at the ground through a clear atmosphere), and the night side of
an airless moon lit only by starlight is nine or ten orders of magnitude below that.</p>
<ul>
<li><strong>Physical Camera on</strong> (aperture, shutter speed, ISO) so exposure is expressed
in EV100 and artists can reason in real units. Set the sun as a directional light in lux, put
albedo in the material, and stop hand-tuning intensities.</li>
<li><strong>Exposure mode: Automatic Histogram.</strong> Plain Automatic meters on an average
and is destroyed by a single sun disc in frame, or by 95 % black space. Histogram mode lets you
discard percentiles: a lower percentile around 40 and an upper around 90 puts both the black of
space and the specular sun outside the metering window.</li>
<li><strong>Clamp the limits per phase</strong> using Volume Profiles: <code>VP_Space</code>
might allow EV100 −4 to +16, <code>VP_Surface_Day</code> +8 to +16,
<code>VP_Surface_Night</code> −6 to +6. Without clamps, crossing a terminator produces a
five-second white-out.</li>
<li><strong>Asymmetric adaptation speed</strong>: fast dark-to-light, slow light-to-dark,
approximating human adaptation and stopping the strobe when the ship tumbles.</li>
<li><strong>Exposure compensation is the artistic knob, not exposure.</strong> Leave metering
physical; expose a compensation curve per phase.</li>
<li><strong>Tonemapping: prefer AgX over ACES</strong> if your HDRP version offers it. The ACES
hue skew turns a bright engine plume or a re-entry shock into a flat white blob; AgX desaturates
toward white far more gracefully across six stops of over-exposure, which is exactly the regime a
rocket exhaust lives in. With ACES only, add a pre-tonemap highlight desaturation.</li>
</ul>

<h3>1.7 Shadows at planetary scale</h3>
<p>Cascaded shadow maps are a local technique. Do not try to shadow a planet with them.</p>
<ul>
<li><strong>Cap shadow distance hard</strong>: 300–800 m on the surface, 2–4 km when high and
fast. Four cascades with a manual, front-loaded split (e.g. 0.05 / 0.15 / 0.4 / 1.0 of max
distance).</li>
<li><strong>Large-scale terrain shadowing comes from the heightfield, not the shadow map.</strong>
Compute a per-chunk horizon-angle map: for N azimuthal directions, march the heightfield and
store the maximum elevation angle; 8 or 16 directions in a compute shader, packed into two
RGBA8 textures. At runtime a mountain shadows a valley by comparing the sun's elevation to the
stored horizon angle. Cost: a fraction of a millisecond per chunk build, one texture fetch per
frame. This is also what gives correct terminator shadowing across tens of kilometres, which no
cascade can do.</li>
<li><strong>Contact shadows</strong> (screen-space or ray-traced) for landing gear and greebles —
the sub-metre detail cascades cannot resolve.</li>
<li><strong>Cast the planet's own shadow analytically.</strong> An eclipse or a night-side
transition is a ray-sphere test against the body radius plus atmosphere, evaluated on the CPU
each frame, feeding a light-intensity multiplier and a reddened tint. One line of maths, and it
is what makes orbital night feel real.</li>
</ul>

<h3>1.8 Volumetric clouds and fog</h3>
<p>HDRP's <strong>Volumetric Clouds</strong> override (Unity 2021.2 / HDRP 12 and later) is
planet-aware — it has an earth-curvature mode and renders correctly when you look down at the
layer from above, which is the hard part. Use it for the local planet and accept its constraints:
one layer, one planet, and a cost that in practice lands in the 1.5–4 ms range on desktop at half
resolution. Above roughly 100 km, cross-fade it out and swap to a cloud <em>impostor</em> — a
low-frequency shell texture on the planet sphere generated from the same weather-map noise — so
the transition is continuous. Doing that swap well is about a week of work and is the difference
between "seamless descent" and "the clouds pop in at 80 km".</p>
<p>HDRP <strong>Fog</strong> with volumetrics is a froxel volume with a bounded distance set in
the HDRP asset; beyond a few kilometres it becomes unaffordable. It is the right tool for a dust
storm, a canyon inversion layer, or engine-plume ground interaction. It is <em>not</em> the tool
for atmospheric perspective at 100 km — that is the aerial-perspective LUT's job (§4.1). Using
volumetric fog for atmospheric scattering is the most common mistake in this genre and it costs
you both performance and correctness.</p>

<h3>1.9 Other HDRP settings, briefly</h3>
<table>
<tr><th>Setting</th><th>Value</th><th>Why</th></tr>
<tr><td>Lit Shader Mode</td><td>Deferred (desktop), Forward (VR)</td><td>Terrain has few materials and near-zero overdraw; deferred wins. Forward only if you need per-material custom lighting.</td></tr>
<tr><td>Color Buffer Format</td><td>RGBA16F unless you have measured no banding</td><td>Sun-adjacent gradients band badly in R11G11B10.</td></tr>
<tr><td>Decal atlas</td><td>Large; decal layers on</td><td>Hull weathering, scorch marks and landing-pad markings are all decals.</td></tr>
<tr><td>Custom Pass Volumes</td><td>Injection point AfterOpaqueAndSky</td><td>Where the re-entry plasma shell and the wormhole distortion belong.</td></tr>
<tr><td>Dynamic Resolution</td><td>On, hardware DRS if available, 60–100 %</td><td>Re-entry and landing are the frame spikes; DRS absorbs them.</td></tr>
<tr><td>Ray tracing</td><td>Off by default; optional RTAO/RTGI tier</td><td>Runtime-generated terrain must be re-added to the acceleration structure on every rebuild. Measure before enabling.</td></tr>
<tr><td>Motion vectors</td><td>On, and correct for planet rotation</td><td>TAA and motion blur are wrong on a rotating planet unless terrain chunks write proper motion vectors. This is a real bug you will hit.</td></tr>
<tr><td>LOD bias / max LOD</td><td>Per quality tier via QualitySettings, not per camera</td><td>The layered cameras must share LOD decisions or the near/mid seam pops.</td></tr>
</table>

<h2>2. KEY C# SCRIPTS</h2>

<div class="note"><strong>Frame convention for the code below.</strong> The simulation works in a
right-handed, <strong>Z-up</strong> inertial frame, because that is what every astrodynamics
textbook uses and translating Vallado into a Y-up frame is a reliable way to introduce sign
errors you will not find for a month. Conversion to Unity's left-handed Y-up frame happens in
exactly one place, in <code>FloatingOrigin.ToScene()</code> / <code>ToWorld()</code>. The model
convention from §0.3 (−Z nose, +Y dorsal) applies on the <em>rendering</em> side of that
boundary.</div>

<h3>2.1 DoubleVector3.cs</h3>

<pre><code>using System;
using System.Runtime.CompilerServices;
using UnityEngine;

namespace StellarExpanse.Numerics
{
    /// &lt;summary&gt;
    /// Double-precision 3-vector. ALL simulation state is stored in this type.
    /// UnityEngine.Vector3 is produced only at the last possible moment, and always
    /// relative to the floating origin — never as an absolute world position.
    /// &lt;/summary&gt;
    [Serializable]
    public struct DoubleVector3 : IEquatable&lt;DoubleVector3&gt;
    {
        public double x, y, z;

        public static readonly DoubleVector3 zero = new DoubleVector3(0, 0, 0);
        public static readonly DoubleVector3 one  = new DoubleVector3(1, 1, 1);
        // Simulation frame is Z-up (see note above).
        public static readonly DoubleVector3 poleZ = new DoubleVector3(0, 0, 1);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public DoubleVector3(double x, double y, double z) { this.x = x; this.y = y; this.z = z; }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public DoubleVector3(Vector3 v) { x = v.x; y = v.y; z = v.z; }

        public double sqrMagnitude { [MethodImpl(MethodImplOptions.AggressiveInlining)]
                                     get { return x * x + y * y + z * z; } }

        public double magnitude { [MethodImpl(MethodImplOptions.AggressiveInlining)]
                                  get { return Math.Sqrt(x * x + y * y + z * z); } }

        public DoubleVector3 normalized
        {
            get
            {
                double m = Math.Sqrt(x * x + y * y + z * z);
                // Threshold is 1e-300, not Unity's 1e-9: magnitudes of 1e11 are routine
                // here and a 1e-9 epsilon would silently zero legitimate tiny vectors.
                return m &gt; 1e-300 ? new DoubleVector3(x / m, y / m, z / m) : zero;
            }
        }

        public static DoubleVector3 operator +(DoubleVector3 a, DoubleVector3 b)
            =&gt; new DoubleVector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static DoubleVector3 operator -(DoubleVector3 a, DoubleVector3 b)
            =&gt; new DoubleVector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static DoubleVector3 operator -(DoubleVector3 a)
            =&gt; new DoubleVector3(-a.x, -a.y, -a.z);
        public static DoubleVector3 operator *(DoubleVector3 a, double s)
            =&gt; new DoubleVector3(a.x * s, a.y * s, a.z * s);
        public static DoubleVector3 operator *(double s, DoubleVector3 a)
            =&gt; new DoubleVector3(a.x * s, a.y * s, a.z * s);
        public static DoubleVector3 operator /(DoubleVector3 a, double s)
            =&gt; new DoubleVector3(a.x / s, a.y / s, a.z / s);

        public static bool operator ==(DoubleVector3 a, DoubleVector3 b)
            =&gt; a.x == b.x &amp;&amp; a.y == b.y &amp;&amp; a.z == b.z;
        public static bool operator !=(DoubleVector3 a, DoubleVector3 b) =&gt; !(a == b);

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Dot(DoubleVector3 a, DoubleVector3 b)
            =&gt; a.x * b.x + a.y * b.y + a.z * b.z;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static DoubleVector3 Cross(DoubleVector3 a, DoubleVector3 b)
            =&gt; new DoubleVector3(a.y * b.z - a.z * b.y,
                                 a.z * b.x - a.x * b.z,
                                 a.x * b.y - a.y * b.x);

        public static double Distance(DoubleVector3 a, DoubleVector3 b) =&gt; (a - b).magnitude;

        public static DoubleVector3 Lerp(DoubleVector3 a, DoubleVector3 b, double t)
            =&gt; new DoubleVector3(a.x + (b.x - a.x) * t,
                                 a.y + (b.y - a.y) * t,
                                 a.z + (b.z - a.z) * t);

        /// Component of \`a\` perpendicular to unit vector \`n\`.
        public static DoubleVector3 ProjectOnPlane(DoubleVector3 a, DoubleVector3 n)
            =&gt; a - n * Dot(a, n);

        /// Numerically stable angle between two vectors (rad). acos(dot) loses all
        /// precision near 0 and pi; the atan2 form does not. This matters: the true
        /// anomaly near periapsis of a near-circular orbit is exactly that case.
        public static double Angle(DoubleVector3 a, DoubleVector3 b)
        {
            DoubleVector3 an = a.normalized, bn = b.normalized;
            return 2.0 * Math.Atan2((an - bn).magnitude, (an + bn).magnitude);
        }

        /// Rotate by a unit quaternion (x,y,z,w), double precision throughout.
        public static DoubleVector3 Rotate(DoubleQuaternion q, DoubleVector3 v)
        {
            double tx = 2.0 * (q.y * v.z - q.z * v.y);
            double ty = 2.0 * (q.z * v.x - q.x * v.z);
            double tz = 2.0 * (q.x * v.y - q.y * v.x);
            return new DoubleVector3(v.x + q.w * tx + q.y * tz - q.z * ty,
                                     v.y + q.w * ty + q.z * tx - q.x * tz,
                                     v.z + q.w * tz + q.x * ty - q.y * tx);
        }

        /// Convert to a render-space Vector3. ONLY call this on a vector that has
        /// already had the scene origin subtracted, or you throw away 30 bits.
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public Vector3 ToVector3() =&gt; new Vector3((float)x, (float)y, (float)z);

        public bool Equals(DoubleVector3 o) =&gt; this == o;
        public override bool Equals(object o) =&gt; o is DoubleVector3 d &amp;&amp; Equals(d);
        public override int GetHashCode()
            =&gt; x.GetHashCode() ^ (y.GetHashCode() &lt;&lt; 2) ^ (z.GetHashCode() &gt;&gt; 2);
        public override string ToString() =&gt; string.Concat("(", x.ToString("G17"), ", ",
                                                            y.ToString("G17"), ", ",
                                                            z.ToString("G17"), ")");
    }
}</code></pre>

<p><code>DoubleQuaternion</code> is the obvious analogue and is omitted for space: four doubles,
Hamilton product, conjugate, normalise, slerp, <code>FromAxisAngle</code>, <code>LookRotation</code>
matching the prototype's <code>qlook()</code> (−Z looks along the forward vector). Renormalise it
every time you integrate it; a quaternion integrated for an hour of game time at 50 Hz without
renormalisation drifts off the unit sphere and starts scaling your ship.</p>

<h3>2.2 FloatingOrigin.cs</h3>

<p>Float32 has a 24-bit significand. At 10 km from the origin the ULP is about 1.2 mm; at 100 km
it is about 12 mm, which is visible vertex swim and audible physics buzz on a landed ship.
The threshold below is 4 km, giving sub-millimetre precision everywhere in the scene.</p>

<pre><code>using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using StellarExpanse.Numerics;

namespace StellarExpanse.Origin
{
    public interface IOriginShiftable { void OnOriginShift(Vector3 delta); }

    /// &lt;summary&gt;
    /// Keeps the Unity scene within \`threshold\` metres of (0,0,0) by translating
    /// everything. SceneOrigin is the double-precision simulation position that
    /// Unity's (0,0,0) currently represents.
    /// &lt;/summary&gt;
    [DefaultExecutionOrder(900)]   // after gameplay Update, before rendering
    public sealed class FloatingOrigin : MonoBehaviour
    {
        public static FloatingOrigin Instance { get; private set; }

        [SerializeField] double threshold  = 4000.0;   // metres
        [SerializeField] Transform focus;              // usually the active vessel
        [SerializeField] Camera[] cameras;             // for TAA history correction

        public DoubleVector3 SceneOrigin { get; private set; }
        public event Action&lt;Vector3&gt; Shifted;

        static readonly List&lt;IOriginShiftable&gt; s_listeners = new List&lt;IOriginShiftable&gt;(256);
        readonly List&lt;GameObject&gt; _roots      = new List&lt;GameObject&gt;(512);
        readonly List&lt;ParticleSystem&gt; _worldPs = new List&lt;ParticleSystem&gt;(64);
        readonly List&lt;Rigidbody&gt; _bodies       = new List&lt;Rigidbody&gt;(256);
        ParticleSystem.Particle[] _pScratch = new ParticleSystem.Particle[8192];
        bool _rootsDirty = true;
        bool _restoreInterpolation;

        void Awake()
        {
            Instance = this;
            // We take responsibility for syncing transforms: one sync after the whole
            // shift instead of one per Transform write. This is the single biggest
            // contributor to rebase cost in a naive implementation.
            Physics.autoSyncTransforms = false;
            SceneManager.sceneLoaded   += (a, b) =&gt; _rootsDirty = true;
            SceneManager.sceneUnloaded += a =&gt; _rootsDirty = true;
        }

        public static void Register(IOriginShiftable l)
        { if (!s_listeners.Contains(l)) s_listeners.Add(l); }
        public static void Unregister(IOriginShiftable l) { s_listeners.Remove(l); }

        /// Mark the cached root list stale after spawning/destroying top-level objects.
        public void InvalidateRoots() { _rootsDirty = true; }

        public Vector3 ToScene(DoubleVector3 world)
        {
            DoubleVector3 d = world - SceneOrigin;
            // Simulation is Z-up right-handed; Unity is Y-up left-handed.
            return new Vector3((float)d.x, (float)d.z, (float)d.y);
        }

        public DoubleVector3 ToWorld(Vector3 scene)
            =&gt; SceneOrigin + new DoubleVector3(scene.x, scene.z, scene.y);

        void LateUpdate()
        {
            if (_restoreInterpolation) RestoreInterpolation();
            if (focus == null) return;
            Vector3 p = focus.position;
            if (p.sqrMagnitude &lt; threshold * threshold) return;
            Shift(-p);
        }

        void Shift(Vector3 delta)
        {
            SceneOrigin = SceneOrigin - new DoubleVector3(delta.x, delta.z, delta.y);

            if (_rootsDirty) RebuildCaches();

            // 1) Kill Rigidbody interpolation for exactly one frame. Otherwise the
            //    renderer interpolates from the PRE-shift pose to the POST-shift pose
            //    and the entire world smears across the screen for one frame. This is
            //    the classic "rebase hitch" and it is a visual artefact, not a CPU cost.
            for (int i = 0; i &lt; _bodies.Count; i++)
            {
                Rigidbody rb = _bodies[i];
                if (rb == null) continue;
                rb.interpolation = RigidbodyInterpolation.None;
            }
            _restoreInterpolation = true;

            // 2) Translate scene roots. Children come along for free.
            for (int i = 0; i &lt; _roots.Count; i++)
            {
                GameObject go = _roots[i];
                if (go == null) continue;
                Transform t = go.transform;
                t.position = t.position + delta;
            }

            // 3) One physics sync for the whole shift.
            Physics.SyncTransforms();

            // 4) World-simulated particle systems. Prefer to avoid this entirely — see
            //    the note below — but some systems (a re-entry wake) genuinely need
            //    world simulation and must be moved manually.
            for (int i = 0; i &lt; _worldPs.Count; i++)
            {
                ParticleSystem ps = _worldPs[i];
                if (ps == null) continue;
                int count = ps.particleCount;
                if (count == 0) continue;
                if (_pScratch.Length &lt; count)
                    _pScratch = new ParticleSystem.Particle[Mathf.NextPowerOfTwo(count)];
                bool wasPlaying = ps.isPlaying;
                if (wasPlaying) ps.Pause(false);
                int n = ps.GetParticles(_pScratch, count);
                for (int k = 0; k &lt; n; k++) _pScratch[k].position += delta;
                ps.SetParticles(_pScratch, n);
                if (wasPlaying) ps.Play(false);
            }

            // 5) Trails and line renderers keep world-space history. Shifting a
            //    TrailRenderer is not exposed, so clear it; a one-frame trail gap during
            //    a 4 km rebase is invisible, a 4 km trail spike is not.
            //    (LineRenderer with useWorldSpace CAN be shifted via GetPositions.)

            // 6) Anything with its own cached world state.
            for (int i = 0; i &lt; s_listeners.Count; i++) s_listeners[i].OnOriginShift(delta);

            // 7) Correct temporal history so TAA / motion blur do not ghost. Translating
            //    the previous-frame view matrix by the same delta keeps motion vectors
            //    correct through the rebase. Almost nobody does this, and it is why most
            //    floating-origin implementations flash on every shift.
            for (int i = 0; i &lt; cameras.Length; i++)
                if (cameras[i] != null) cameras[i].ResetProjectionMatrix();
            OnHistoryShift(delta);

            Shifted?.Invoke(delta);
        }

        void RestoreInterpolation()
        {
            for (int i = 0; i &lt; _bodies.Count; i++)
                if (_bodies[i] != null)
                    _bodies[i].interpolation = RigidbodyInterpolation.Interpolate;
            _restoreInterpolation = false;
        }

        void RebuildCaches()
        {
            _roots.Clear(); _worldPs.Clear(); _bodies.Clear();
            for (int s = 0; s &lt; SceneManager.sceneCount; s++)
            {
                Scene sc = SceneManager.GetSceneAt(s);
                if (!sc.isLoaded) continue;
                sc.GetRootGameObjects(_roots);
            }
            for (int i = 0; i &lt; _roots.Count; i++)
            {
                _roots[i].GetComponentsInChildren(true, _bodiesTmp);
                _bodies.AddRange(_bodiesTmp);
                _roots[i].GetComponentsInChildren(true, _psTmp);
                for (int k = 0; k &lt; _psTmp.Count; k++)
                    if (_psTmp[k].main.simulationSpace == ParticleSystemSimulationSpace.World)
                        _worldPs.Add(_psTmp[k]);
            }
            _rootsDirty = false;
        }
        static readonly List&lt;Rigidbody&gt; _bodiesTmp = new List&lt;Rigidbody&gt;(64);
        static readonly List&lt;ParticleSystem&gt; _psTmp = new List&lt;ParticleSystem&gt;(64);

        partial void OnHistoryShift(Vector3 delta);   // implemented by the render layer
    }
}</code></pre>

<h3>2.2.1 How to avoid the rebase hitch</h3>
<ol>
<li><strong>Shift often and small.</strong> A 4 km threshold means a rebase roughly every few
seconds in atmospheric flight and every fraction of a second in orbit. That sounds bad; it is
not. A frequent, cheap shift is far better than a rare, expensive one, because the cost is
dominated by the fixed overhead of walking the scene and that overhead does not grow with the
distance shifted.</li>
<li><strong>Cache the root list.</strong> <code>Scene.GetRootGameObjects</code> allocates and
walks; calling it plus <code>GetComponentsInChildren</code> every shift is what makes naive
implementations cost 3–8 ms. Cache, and invalidate only on spawn/destroy of top-level
objects.</li>
<li><strong><code>Physics.autoSyncTransforms = false</code></strong> and one explicit
<code>Physics.SyncTransforms()</code>. With auto-sync on, every Transform write dirties the
physics scene.</li>
<li><strong>Disable Rigidbody interpolation for the shift frame.</strong> This is the actual
visible "hitch" in most implementations — not a frame-time spike, a one-frame smear.</li>
<li><strong>Make particle systems free.</strong> Set <code>simulationSpace = Custom</code> with
<code>customSimulationSpace</code> pointing at a transform that never moves relative to the
scene, or use Local space with a parent that moves with the emitter. Then step 4 above becomes
a no-op. Reserve World space for the handful of systems that genuinely need it.</li>
<li><strong>Shift in <code>LateUpdate</code>, never inside <code>FixedUpdate</code>.</strong>
A shift between substeps of the same frame will be seen by half your physics callbacks and not
the other half.</li>
<li><strong>Translate the temporal-reprojection history.</strong> See step 7 — otherwise TAA and
motion blur produce a one-frame ghost on every rebase, which at a 4 km threshold means a
permanent shimmer.</li>
<li><strong>Never store an absolute world position in a Vector3 field.</strong> Enforce it with a
Roslyn analyser or a naming convention; this rule is violated by accident constantly, and the
symptom (things drift apart after twenty minutes) is very hard to trace back.</li>
</ol>

<h3>2.3 OrbitalBody.cs</h3>

<pre><code>using System;
using UnityEngine;
using StellarExpanse.Numerics;

namespace StellarExpanse.Orbital
{
    /// A gravitating body: star, planet or moon. Positions are propagated on rails
    /// (Keplerian) because a solar system's own motion does not need to be simulated.
    public sealed class OrbitalBody : MonoBehaviour
    {
        [Header("Physical")]
        public string bodyName;
        public double mu;              // GM, m^3/s^2  — store mu, never mass*G
        public double radius;          // mean equatorial radius, m
        public double rotationPeriod;  // sidereal, s (negative = retrograde)
        public double axialTilt;       // rad, about the +X axis of the parent frame
        public double siderealAtEpoch; // rotation phase at t = 0, rad

        [Header("Hierarchy")]
        public OrbitalBody parent;
        public KeplerSolver.Elements elements;   // relative to \`parent\`

        [Header("Environment")]
        public AtmosphereModel atmosphere;       // null for airless bodies
        public PlanetDNA dna;                    // the procedural genome (see 0.1)

        // Current state, absolute (root-frame) coordinates.
        public DoubleVector3 position;
        public DoubleVector3 velocity;

        /// Sphere of influence radius (Laplace): r_soi = a * (m / M)^(2/5).
        /// Expressed in mu, since mu ratio == mass ratio.
        public double SphereOfInfluence
        {
            get
            {
                if (parent == null) return double.PositiveInfinity;
                return elements.a * Math.Pow(mu / parent.mu, 0.4);
            }
        }

        /// Surface gravity at the reference radius, m/s^2. Useful for UI and for
        /// sanity-checking a procedurally generated body.
        public double SurfaceGravity =&gt; mu / (radius * radius);

        /// Body-fixed rotation at time t (seconds since epoch).
        public DoubleQuaternion RotationAt(double t)
        {
            double spin = siderealAtEpoch + (rotationPeriod != 0.0
                        ? 2.0 * Math.PI * t / rotationPeriod : 0.0);
            DoubleQuaternion tilt = DoubleQuaternion.FromAxisAngle(
                new DoubleVector3(1, 0, 0), axialTilt);
            DoubleQuaternion spinQ = DoubleQuaternion.FromAxisAngle(
                new DoubleVector3(0, 0, 1), spin);
            return DoubleQuaternion.Multiply(tilt, spinQ);
        }

        /// Surface velocity of the atmosphere/ground at an absolute point (co-rotation).
        public DoubleVector3 SurfaceVelocityAt(DoubleVector3 absolutePoint)
        {
            if (rotationPeriod == 0.0) return velocity;
            DoubleVector3 rel = absolutePoint - position;
            DoubleVector3 axis = DoubleVector3.Rotate(
                DoubleQuaternion.FromAxisAngle(new DoubleVector3(1, 0, 0), axialTilt),
                new DoubleVector3(0, 0, 1));
            double omega = 2.0 * Math.PI / rotationPeriod;
            return velocity + DoubleVector3.Cross(axis * omega, rel);
        }

        /// Advance this body's on-rails state to absolute time t.
        public void PropagateTo(double t)
        {
            if (parent == null) { position = DoubleVector3.zero; velocity = DoubleVector3.zero; return; }
            KeplerSolver.ElementsToState(elements, parent.mu, t,
                                         out DoubleVector3 r, out DoubleVector3 v);
            position = parent.position + r;
            velocity = parent.velocity + v;
        }

        /// Gravitational acceleration this body exerts at an absolute point.
        /// Includes the J2 oblateness term, which is what makes a real low orbit
        /// precess and is cheap enough to always have on.
        public DoubleVector3 AccelerationAt(DoubleVector3 p, double j2 = 0.0)
        {
            DoubleVector3 d = position - p;
            double r2 = d.sqrMagnitude;
            if (r2 &lt; 1.0) return DoubleVector3.zero;
            double r = Math.Sqrt(r2);
            DoubleVector3 a = d * (mu / (r2 * r));
            if (j2 != 0.0)
            {
                // Standard J2 perturbation in the body's equatorial frame (z = pole).
                DoubleVector3 rel = p - position;
                double z2r2 = (rel.z * rel.z) / r2;
                double k = 1.5 * j2 * mu * radius * radius / (r2 * r2 * r);
                a += new DoubleVector3(rel.x * k * (5.0 * z2r2 - 1.0),
                                       rel.y * k * (5.0 * z2r2 - 1.0),
                                       rel.z * k * (5.0 * z2r2 - 3.0));
            }
            return a;
        }
    }
}</code></pre>

<h3>2.4 KeplerSolver.cs</h3>

<p>Three things must work: state vector to elements, elements to state at an arbitrary time, and
direct propagation of a state vector by a time interval. The first two go through anomaly
solving; the third uses universal variables, which handles elliptic, parabolic and hyperbolic
orbits with one code path and is what you want for the patched-conic solver's SOI search.</p>

<pre><code>using System;
using StellarExpanse.Numerics;

namespace StellarExpanse.Orbital
{
    public static class KeplerSolver
    {
        public const double TwoPi = 6.283185307179586;

        [Serializable]
        public struct Elements
        {
            public double a;      // semi-major axis, m. NEGATIVE for hyperbolic orbits.
            public double e;      // eccentricity
            public double i;      // inclination, rad
            public double raan;   // right ascension of ascending node, rad
            public double argp;   // argument of periapsis, rad
            public double m0;     // mean anomaly at epoch, rad (elliptic)
                                  // or hyperbolic mean anomaly (hyperbolic)
            public double epoch;  // seconds
            public double p;      // semi-latus rectum, m. Authoritative when e -&gt; 1.
        }

        // ---------------------------------------------------------------- RV -&gt; COE
        /// Vallado's RV2COE. Frame is Z-up; the reference plane is XY.
        public static Elements StateToElements(DoubleVector3 r, DoubleVector3 v,
                                               double mu, double t)
        {
            Elements el = default;
            el.epoch = t;

            double rm = r.magnitude;
            double v2 = v.sqrMagnitude;
            double rdotv = DoubleVector3.Dot(r, v);

            DoubleVector3 h = DoubleVector3.Cross(r, v);
            double hm = h.magnitude;
            el.p = hm * hm / mu;

            // Eccentricity vector: e = ((v^2 - mu/r) r - (r.v) v) / mu
            DoubleVector3 ev = (r * (v2 - mu / rm) - v * rdotv) / mu;
            el.e = ev.magnitude;

            // Specific orbital energy. a is undefined for a true parabola; p is not.
            double energy = v2 * 0.5 - mu / rm;
            el.a = (Math.Abs(el.e - 1.0) &gt; 1e-10) ? -mu / (2.0 * energy)
                                                  : double.PositiveInfinity;

            el.i = Math.Acos(Math.Max(-1.0, Math.Min(1.0, h.z / hm)));

            // Node vector n = zhat x h
            DoubleVector3 n = new DoubleVector3(-h.y, h.x, 0.0);
            double nm = n.magnitude;

            const double EQUATORIAL = 1e-11;
            const double CIRCULAR   = 1e-11;

            if (nm &gt; EQUATORIAL)
            {
                el.raan = Math.Atan2(n.y, n.x);
                if (el.raan &lt; 0.0) el.raan += TwoPi;
            }
            else el.raan = 0.0;   // equatorial: RAAN is degenerate, fold it into argp

            double nu;
            if (el.e &gt; CIRCULAR)
            {
                if (nm &gt; EQUATORIAL)
                {
                    el.argp = Math.Acos(Math.Max(-1.0, Math.Min(1.0,
                                  DoubleVector3.Dot(n, ev) / (nm * el.e))));
                    if (ev.z &lt; 0.0) el.argp = TwoPi - el.argp;
                }
                else
                {
                    el.argp = Math.Atan2(ev.y, ev.x);    // true longitude of periapsis
                    if (el.argp &lt; 0.0) el.argp += TwoPi;
                }
                nu = Math.Acos(Math.Max(-1.0, Math.Min(1.0,
                          DoubleVector3.Dot(ev, r) / (el.e * rm))));
                if (rdotv &lt; 0.0) nu = TwoPi - nu;
            }
            else
            {
                // Circular: periapsis is undefined. Use argument of latitude.
                el.argp = 0.0;
                if (nm &gt; EQUATORIAL)
                {
                    nu = Math.Acos(Math.Max(-1.0, Math.Min(1.0,
                              DoubleVector3.Dot(n, r) / (nm * rm))));
                    if (r.z &lt; 0.0) nu = TwoPi - nu;
                }
                else
                {
                    nu = Math.Atan2(r.y, r.x);
                    if (nu &lt; 0.0) nu += TwoPi;
                }
            }

            el.m0 = TrueToMean(nu, el.e);
            return el;
        }

        // ---------------------------------------------------------------- COE -&gt; RV
        public static void ElementsToState(Elements el, double mu, double t,
                                           out DoubleVector3 r, out DoubleVector3 v)
        {
            double dt = t - el.epoch;
            double nu;

            if (el.e &lt; 1.0)
            {
                double n = Math.Sqrt(mu / (el.a * el.a * el.a));
                double M = WrapPi(el.m0 + n * dt);
                double E = SolveEccentric(M, el.e);
                // Half-angle form: stable at all e, unlike acos of the cos(nu) identity.
                nu = 2.0 * Math.Atan2(Math.Sqrt(1.0 + el.e) * Math.Sin(E * 0.5),
                                      Math.Sqrt(1.0 - el.e) * Math.Cos(E * 0.5));
            }
            else
            {
                double aAbs = Math.Abs(el.a);
                double n = Math.Sqrt(mu / (aAbs * aAbs * aAbs));
                double M = el.m0 + n * dt;                 // hyperbolic M does NOT wrap
                double H = SolveHyperbolic(M, el.e);
                nu = 2.0 * Math.Atan2(Math.Sqrt(el.e + 1.0) * Math.Sinh(H * 0.5),
                                      Math.Sqrt(el.e - 1.0) * Math.Cosh(H * 0.5));
            }

            double p = el.p &gt; 0.0 ? el.p : el.a * (1.0 - el.e * el.e);
            double rm = p / (1.0 + el.e * Math.Cos(nu));
            double sqrtMuP = Math.Sqrt(mu / p);

            // Perifocal frame (x toward periapsis, z along h)
            DoubleVector3 rPf = new DoubleVector3(rm * Math.Cos(nu), rm * Math.Sin(nu), 0.0);
            DoubleVector3 vPf = new DoubleVector3(-sqrtMuP * Math.Sin(nu),
                                                   sqrtMuP * (el.e + Math.Cos(nu)), 0.0);

            // R3(-raan) R1(-i) R3(-argp)
            double cO = Math.Cos(el.raan), sO = Math.Sin(el.raan);
            double ci = Math.Cos(el.i),    si = Math.Sin(el.i);
            double cw = Math.Cos(el.argp), sw = Math.Sin(el.argp);

            double m11 = cO * cw - sO * sw * ci, m12 = -cO * sw - sO * cw * ci, m13 =  sO * si;
            double m21 = sO * cw + cO * sw * ci, m22 = -sO * sw + cO * cw * ci, m23 = -cO * si;
            double m31 = sw * si,                m32 =  cw * si,               m33 =  ci;

            r = new DoubleVector3(m11 * rPf.x + m12 * rPf.y + m13 * rPf.z,
                                  m21 * rPf.x + m22 * rPf.y + m23 * rPf.z,
                                  m31 * rPf.x + m32 * rPf.y + m33 * rPf.z);
            v = new DoubleVector3(m11 * vPf.x + m12 * vPf.y + m13 * vPf.z,
                                  m21 * vPf.x + m22 * vPf.y + m23 * vPf.z,
                                  m31 * vPf.x + m32 * vPf.y + m33 * vPf.z);
        }

        // ------------------------------------------------------- anomaly conversions
        public static double TrueToMean(double nu, double e)
        {
            if (e &lt; 1.0)
            {
                double E = 2.0 * Math.Atan2(Math.Sqrt(1.0 - e) * Math.Sin(nu * 0.5),
                                            Math.Sqrt(1.0 + e) * Math.Cos(nu * 0.5));
                return E - e * Math.Sin(E);
            }
            double H = 2.0 * Atanh(Math.Sqrt((e - 1.0) / (e + 1.0)) * Math.Tan(nu * 0.5));
            return e * Math.Sinh(H) - H;
        }

        static double Atanh(double x) =&gt; 0.5 * Math.Log((1.0 + x) / (1.0 - x));

        public static double WrapPi(double x)
        {
            x %= TwoPi;
            if (x &gt;  Math.PI) x -= TwoPi;
            if (x &lt; -Math.PI) x += TwoPi;
            return x;
        }

        // ------------------------------------------------- elliptic Kepler equation
        /// Solve M = E - e sin(E) for E. Newton-Raphson with a damped step and a
        /// guaranteed-convergent bisection fallback.
        public static double SolveEccentric(double M, double e,
                                            double tol = 1e-13, int maxIter = 40)
        {
            M = WrapPi(M);
            if (e &lt; 1e-12) return M;                 // circular

            // Danby's starter. Good to ~1e-2 even at e = 0.99, which halves the
            // iteration count versus the naive E0 = M.
            double E = M + 0.85 * e * Math.Sign(Math.Sin(M) == 0.0 ? 1.0 : Math.Sin(M));

            for (int k = 0; k &lt; maxIter; k++)
            {
                double f  = E - e * Math.Sin(E) - M;
                double fp = 1.0 - e * Math.Cos(E);
                if (fp &lt; 1e-14) break;               // near-parabolic stall -&gt; bisect
                double dE = -f / fp;
                // Damp the step. Undamped NR overshoots wildly for e &gt; 0.97 when the
                // guess lands on the near-flat part of the curve at periapsis.
                if (dE &gt;  0.5) dE =  0.5;
                if (dE &lt; -0.5) dE = -0.5;
                E += dE;
                if (Math.Abs(dE) &lt; tol) return E;
            }
            return BisectEccentric(M, e, tol);
        }

        /// f(E) = E - e sin E - M is strictly increasing for e &lt; 1, and
        /// E - M = e sin E is bounded by e, so [M - e, M + e] always brackets the root.
        static double BisectEccentric(double M, double e, double tol)
        {
            double lo = M - e, hi = M + e;
            for (int k = 0; k &lt; 200; k++)
            {
                double mid = 0.5 * (lo + hi);
                if (mid - e * Math.Sin(mid) - M &gt; 0.0) hi = mid; else lo = mid;
                if (hi - lo &lt; tol) break;
            }
            return 0.5 * (lo + hi);
        }

        // ----------------------------------------------- hyperbolic Kepler equation
        /// Solve M = e sinh(H) - H for H. Note M is unbounded here — do not wrap it.
        public static double SolveHyperbolic(double M, double e,
                                             double tol = 1e-13, int maxIter = 60)
        {
            // Starter: linear near M = 0, logarithmic once sinh dominates.
            double H = (Math.Abs(M) &lt; 6.0)
                     ? M / (e - 1.0)
                     : Math.Sign(M) * Math.Log(2.0 * Math.Abs(M) / e + 1.8);

            for (int k = 0; k &lt; maxIter; k++)
            {
                double f  = e * Math.Sinh(H) - H - M;
                double fp = e * Math.Cosh(H) - 1.0;    // &gt;= e - 1 &gt; 0, never singular
                double dH = -f / fp;
                if (dH &gt;  1.0) dH =  1.0;              // sinh is brutally stiff
                if (dH &lt; -1.0) dH = -1.0;
                H += dH;
                if (Math.Abs(dH) &lt; tol) return H;
            }
            return BisectHyperbolic(M, e, tol);
        }

        static double BisectHyperbolic(double M, double e, double tol)
        {
            // f is strictly increasing; expand a bracket by doubling.
            double lo = -1.0, hi = 1.0;
            while (e * Math.Sinh(lo) - lo - M &gt; 0.0) lo *= 2.0;
            while (e * Math.Sinh(hi) - hi - M &lt; 0.0) hi *= 2.0;
            for (int k = 0; k &lt; 300; k++)
            {
                double mid = 0.5 * (lo + hi);
                if (e * Math.Sinh(mid) - mid - M &gt; 0.0) hi = mid; else lo = mid;
                if (hi - lo &lt; tol * Math.Max(1.0, Math.Abs(hi))) break;
            }
            return 0.5 * (lo + hi);
        }

        // --------------------------------------------- universal-variable propagation
        /// Stumpff functions C(z) and S(z).
        /// The series branch is not an optimisation — it is required. The closed forms
        /// suffer catastrophic cancellation as z -&gt; 0 (1 - cos(s) with s ~ 1e-3 loses
        /// about seven significant digits).
        public static void Stumpff(double z, out double c2, out double c3)
        {
            if (z &gt; 1e-4)
            {
                double s = Math.Sqrt(z);
                c2 = (1.0 - Math.Cos(s)) / z;
                c3 = (s - Math.Sin(s)) / (s * s * s);
            }
            else if (z &lt; -1e-4)
            {
                double s = Math.Sqrt(-z);
                c2 = (1.0 - Math.Cosh(s)) / z;
                c3 = (Math.Sinh(s) - s) / (s * s * s);
            }
            else
            {
                c2 = 0.5      - z / 24.0  + z * z / 720.0  - z * z * z / 40320.0;
                c3 = 1.0/6.0  - z / 120.0 + z * z / 5040.0 - z * z * z / 362880.0;
            }
        }

        /// Propagate (r0, v0) forward by dt under a point mass mu, using the universal
        /// anomaly chi. One code path for ellipse, parabola and hyperbola — which is
        /// exactly what the patched-conic SOI search needs, because a trajectory can
        /// change type mid-search.
        public static bool UniversalPropagate(DoubleVector3 r0, DoubleVector3 v0,
                                              double dt, double mu,
                                              out DoubleVector3 r, out DoubleVector3 v,
                                              double tol = 1e-9, int maxIter = 60)
        {
            r = r0; v = v0;
            if (dt == 0.0) return true;

            double r0m    = r0.magnitude;
            double rdotv  = DoubleVector3.Dot(r0, v0);
            double sqrtMu = Math.Sqrt(mu);
            double alpha  = 2.0 / r0m - v0.sqrMagnitude / mu;   // = 1/a

            double chi;
            if (alpha &gt; 1e-12)                       // elliptic
            {
                chi = sqrtMu * dt * alpha;
            }
            else if (alpha &lt; -1e-12)                 // hyperbolic
            {
                double a = 1.0 / alpha;              // negative
                double sgn = Math.Sign(dt);
                chi = sgn * Math.Sqrt(-a) * Math.Log(
                        (-2.0 * mu * alpha * dt) /
                        (rdotv + sgn * Math.Sqrt(-mu * a) * (1.0 - r0m * alpha)));
            }
            else                                     // near-parabolic (Barker)
            {
                DoubleVector3 h = DoubleVector3.Cross(r0, v0);
                double p = h.sqrMagnitude / mu;
                double s = 0.5 * (Math.PI * 0.5 - Math.Atan(3.0 * Math.Sqrt(mu / (p*p*p)) * dt));
                double w = Math.Atan(Math.Pow(Math.Tan(s), 1.0 / 3.0));
                chi = Math.Sqrt(p) * 2.0 / Math.Tan(2.0 * w);
            }

            double z = 0.0, c2 = 0.5, c3 = 1.0 / 6.0, rm = r0m;
            bool converged = false;
            for (int k = 0; k &lt; maxIter; k++)
            {
                z = chi * chi * alpha;
                Stumpff(z, out c2, out c3);
                // rm is exactly dF/dchi, so this is Newton's method with an
                // analytic derivative and no extra work.
                rm = chi * chi * c2
                   + (rdotv / sqrtMu) * chi * (1.0 - z * c3)
                   + r0m * (1.0 - z * c2);
                double F = (rdotv / sqrtMu) * chi * chi * c2
                         + (1.0 - r0m * alpha) * chi * chi * chi * c3
                         + r0m * chi - sqrtMu * dt;
                if (Math.Abs(rm) &lt; 1e-12) break;
                double dchi = F / rm;
                chi -= dchi;
                if (Math.Abs(dchi) &lt; tol) { converged = true; break; }
            }

            // Lagrange f and g coefficients.
            double f    = 1.0 - (chi * chi / r0m) * c2;
            double g    = dt - (chi * chi * chi / sqrtMu) * c3;
            double gdot = 1.0 - (chi * chi / rm) * c2;
            double fdot = (sqrtMu / (rm * r0m)) * chi * (z * c3 - 1.0);

            r = r0 * f + v0 * g;
            v = r0 * fdot + v0 * gdot;

            // Sanity identity: f*gdot - fdot*g must equal 1. Assert it in dev builds;
            // it catches every sign error in this function immediately.
            return converged;
        }
    }
}</code></pre>

<div class="note"><strong>Regression test you must have.</strong> Round-trip 10 000 random state
vectors through <code>StateToElements</code> → <code>ElementsToState</code> and assert position
error below 1e-6 relative. Include eccentricities at 0, 1e-9, 0.5, 0.9, 0.999, 1.0, 1.001, 3.0
and inclinations at 0, 1e-9, π/2, π. The degenerate cases (circular, equatorial, circular AND
equatorial, exactly parabolic) are where every implementation of this is wrong, and they are
exactly the orbits players end up in.</div>

<!--SPLICE-->
</div>`;

/* Contract rule 3 — self test. Verifies the payload parsed, is non-trivial,
   contains no unescaped template-literal hazards, and has balanced .w wrapper. */
function docSelfTest(){
  try{
    if(typeof DOCS_HTML !== 'string') return {ok:false, why:'DOCS_HTML is not a string'};
    if(DOCS_HTML.length < 20000) return {ok:false, why:'DOCS_HTML suspiciously short: '+DOCS_HTML.length};
    if(DOCS_HTML.indexOf('<script') !== -1) return {ok:false, why:'contains <script>'};
    if(DOCS_HTML.indexOf('<!--'+'SPL'+'ICE-->') !== -1) return {ok:false, why:'unspliced placeholder left in payload'};
    if(DOCS_HTML.indexOf('<div class="w">') !== 0) return {ok:false, why:'missing .w wrapper'};
    var opens = (DOCS_HTML.match(/<div/g)||[]).length, closes = (DOCS_HTML.match(/<\/div>/g)||[]).length;
    if(opens !== closes) return {ok:false, why:'unbalanced <div>: '+opens+' open vs '+closes+' close'};
    var pre = (DOCS_HTML.match(/<pre>/g)||[]).length, prec = (DOCS_HTML.match(/<\/pre>/g)||[]).length;
    if(pre !== prec) return {ok:false, why:'unbalanced <pre>: '+pre+' vs '+prec};
    var tb = (DOCS_HTML.match(/<table>/g)||[]).length, tbc = (DOCS_HTML.match(/<\/table>/g)||[]).length;
    if(tb !== tbc) return {ok:false, why:'unbalanced <table>: '+tb+' vs '+tbc};
    return {ok:true};
  }catch(e){ return {ok:false, why:String(e)}; }
}
