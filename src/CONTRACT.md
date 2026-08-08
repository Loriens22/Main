# SEG — "Stellar Expanse" Single-File Engine — Integration Contract v1

**READ THIS ENTIRELY BEFORE WRITING ANY CODE.** You are one of 15 agents building ONE
self-contained HTML file: a photorealistic 3D space-exploration game (Kerbal Space Program
orbital physics + No Man's Sky procedural planets) that runs in a browser, offline, from a
single `.html` file with **zero external requests**.

---

## 0. Non-negotiable constraints

| Constraint | Rule |
|---|---|
| Dependencies | **NONE.** No three.js, no npm, no CDN, no fetch/XHR/WebSocket, no external images/fonts. Everything is hand-written JS + GLSL. |
| Graphics API | **WebGL2 only**, shaders are **GLSL ES 3.00**. |
| Target device | **Must run on a mid-range mobile phone at 30fps** and on desktop at 60fps. The end user is on a phone. Budget accordingly: no 128-step raymarches, no 4K buffers, no per-frame allocation. |
| Input | Must work with **keyboard+mouse AND touch**. |
| Language | Plain ES2020 JS. No modules, no `import`/`export`, no bundler. |
| Style | No `debugger`, no `console.log` in shipped code paths (a `SEG.log()` exists for dev). |

## 1. File & namespace layout

Write **exactly one file**, at the path given in your task, into
`/home/user/Main/src/modules/`. Files are concatenated in filename order inside
`<script>` tags. Therefore:

```js
// Top of every module file:
(function (SEG) {
  'use strict';
  // ... your code ...
  SEG.YourExport = { /* ... */ };
})(window.SEG = window.SEG || {});
```

Never touch the DOM at load time, never start timers at load time. Everything is lazily
initialised by the engine calling your `init()`.

**Namespace map (do not write outside your slot):**

| Slot | Owner | Exports |
|---|---|---|
| `00-math.js` | engine | `SEG.M` |
| `01-gl.js` | engine | `SEG.GL` |
| `02-glsl-common.js` | engine | `SEG.GLSL.common`, `SEG.GLSL.fsquadVS` |
| `10-noise.js` | A4 | `SEG.Noise`, `SEG.GLSL.noise` |
| `11-field.js` | A4 | `SEG.Field`, `SEG.GLSL.field` |
| `20-atmosphere.js` | A5 | `SEG.GLSL.atmosphere`, `SEG.Atmo` |
| `21-ocean.js` | A6 | `SEG.GLSL.ocean`, `SEG.Ocean` |
| `22-clouds.js` | A7 | `SEG.GLSL.clouds` |
| `23-wormhole.js` | A8 | `SEG.GLSL.wormhole`, `SEG.Wormhole` |
| `24-fx.js` | A9 | `SEG.GLSL.fx`, `SEG.FX` |
| `25-post.js` | A14 | `SEG.GLSL.post`, `SEG.Post` |
| `30-orbit.js` | A10 | `SEG.Orbit` |
| `31-shipctl.js` | A11 | `SEG.ShipController` |
| `32-shipmesh.js` | A12 | `SEG.ShipMesh` |
| `40-ui.js` | A13 | `SEG.UI` |
| `50-world.js` | engine | `SEG.World` (solar system data + terrain LOD) |
| `90-main.js` | engine | boot |
| `95-docs.js` | A15 | `SEG.DOCS` (HTML string) |

## 2. Math library — `SEG.M` (provided by engine, assume it exists)

Vectors are **`Float64Array(3)`** (physics precision). Matrices are
**`Float32Array(16)`, column-major** (WebGL convention). Quaternions are
**`Float64Array(4)` as `[x,y,z,w]`**.

```js
SEG.M.v3(x,y,z)            -> Float64Array(3)
SEG.M.set(o,x,y,z)         -> o
SEG.M.copy(o,a)            -> o
SEG.M.add(o,a,b)           -> o          // every fn writes into `o` and returns it
SEG.M.sub(o,a,b)           -> o
SEG.M.scale(o,a,s)         -> o
SEG.M.addScaled(o,a,b,s)   -> o          // o = a + b*s
SEG.M.dot(a,b)             -> number
SEG.M.cross(o,a,b)         -> o
SEG.M.len(a)               -> number
SEG.M.len2(a)              -> number
SEG.M.dist(a,b)            -> number
SEG.M.norm(o,a)            -> o          // safe: zero-length -> (0,0,0)
SEG.M.lerp(o,a,b,t)        -> o

SEG.M.m4id(o)              -> o
SEG.M.m4mul(o,a,b)         -> o
SEG.M.m4persp(o,fovyRad,aspect,near,far) -> o
SEG.M.m4lookAt(o,eye,center,up)          -> o
SEG.M.m4invert(o,a)        -> o
SEG.M.m4transpose(o,a)     -> o
SEG.M.m4fromQuatPos(o,q,p) -> o
SEG.M.m3fromM4(o9,a16)     -> o9         // Float32Array(9)

SEG.M.qid(o)               -> o
SEG.M.qmul(o,a,b)          -> o
SEG.M.qaxis(o,axis,angle)  -> o
SEG.M.qnorm(o,a)           -> o
SEG.M.qconj(o,a)           -> o
SEG.M.qrot(o,q,v)          -> o          // rotate vec3 v by quat q
SEG.M.qslerp(o,a,b,t)      -> o
SEG.M.qlook(o,fwd,up)      -> o          // quat whose -Z is fwd

SEG.M.clamp(x,a,b) SEG.M.saturate(x) SEG.M.mix(a,b,t) SEG.M.smoothstep(e0,e1,x)
SEG.M.TAU = 6.283185307179586
```

**Model space convention:** `-Z` = forward (nose), `+Y` = up (dorsal), `+X` = right (starboard).

## 3. GL helper — `SEG.GL` (provided by engine)

```js
SEG.GL.gl                                   // the WebGL2RenderingContext
SEG.GL.program(vsSrc, fsSrc, name)          // -> {prog, u:{name->loc}, a:{name->loc}, use()}
                                            // auto-prepends "#version 300 es\nprecision highp float;\nprecision highp int;\n"
                                            // + SEG.GLSL.common. Reflects ALL active uniforms/attribs into .u/.a
SEG.GL.mesh({position:Float32Array, normal, uv, tangent, color, index:Uint32Array})
                                            // -> {vao, count, draw()}
SEG.GL.fbo(w,h,{float:true,depth:true,n:1}) // -> {fb, tex:[...], depthTex, resize(w,h), bind()}
SEG.GL.tex2D(w,h,fmt,data,opts)             // -> WebGLTexture
SEG.GL.tex3D(w,h,d,fmt,data,opts)           // -> WebGLTexture
SEG.GL.drawFullscreen()                     // draws the fullscreen triangle (bind your program first)
SEG.GL.quality                              // {tier: 0|1|2, scale: 0.5..1.0, mobile: bool}
                                            // tier 0 = phone, 1 = laptop, 2 = desktop. RESPECT IT.
```

Uniform setting is plain WebGL: `gl.uniform1f(p.u.uTime, t)`. If a uniform is optimised
out, `p.u.x` is `undefined` — **always guard**: `if (p.u.uFoo) gl.uniform1f(p.u.uFoo, v);`

## 4. GLSL rules

Your GLSL strings **must not** contain `#version` or `precision` — the engine prepends them,
followed by `SEG.GLSL.common`, followed by any libraries you declare you need.

`SEG.GLSL.common` (already available in EVERY shader — do not redefine any of these):

```glsl
#define PI 3.141592653589793
#define TAU 6.283185307179586
float sat(float x);            vec2 sat(vec2 x);   vec3 sat(vec3 x);
float remap(float x, float a, float b, float c, float d);
mat3  rotAxis(vec3 axis, float a);
vec3  srgbToLin(vec3 c);       vec3 linToSrgb(vec3 c);
float luma(vec3 c);
vec2  hash21(float p);  vec2 hash22(vec2 p);  vec3 hash33(vec3 p);  float hash11(float p);
float valueNoise3(vec3 p);     // cheap, always available
// Logarithmic depth (huge scene ranges). Vertex shaders MUST call:
//   gl_Position = ...; segLogDepth(gl_Position);
void  segLogDepth(inout vec4 clipPos);   // uses uniform float uLogFC (engine sets it)
// Ray/sphere: returns vec2(tNear,tFar), x>y means miss
vec2  raySphere(vec3 ro, vec3 rd, vec3 c, float r);
```

Fullscreen fragment shaders: the engine supplies the vertex shader. Declare exactly:
```glsl
in vec2 vUV;            // 0..1
out vec4 fragColor;
```

**Naming:** prefix every uniform with `u`, every varying with `v`. Prefix every function you
define with your module tag to avoid collisions across concatenated libraries:
`segNoise*`, `segField*`, `segAtmo*`, `segOcean*`, `segCloud*`, `segWh*`, `segFx*`, `segPost*`.

**Never** use: `while` loops with dynamic bounds, recursion, `textureLod` on a non-mipmapped
texture, `#extension`, integer division by a possibly-zero value, or arrays indexed by a
non-constant expression at global scope.

## 5. Units, scale and the floating-origin system

* **1 unit = 1 metre.** Everywhere. Always.
* The solar system is at 1:1 real scale (Sun–Earth = 1.496e11 m). Distances are therefore
  far beyond `float` precision.
* **Physics** runs in absolute heliocentric coordinates in **Float64** (`SEG.M` vectors).
* **Rendering** is always **camera-relative**: the engine subtracts the camera's Float64
  position before uploading anything to the GPU. Model matrices you receive are already
  camera-relative and safe in Float32.
* Never bake an absolute world position into a Float32 array. If you need world position in a
  shader, use the provided `uCamWorldHi/uCamWorldLo` split or work in camera-relative space.
* Depth: single depth buffer with **logarithmic depth** (see `segLogDepth`). Near plane 0.1 m,
  far plane 1e13 m.

## 6. Frame / engine callbacks

The engine calls your module (only the hooks you define):

```js
SEG.YourExport.init(ctx)          // once, after GL is up. ctx = SEG.Ctx (see below)
SEG.YourExport.resize(w,h)        // on canvas resize
SEG.YourExport.update(dt, ctx)    // fixed-ish sim step, dt seconds (clamped <= 1/20)
SEG.YourExport.render(ctx)        // draw calls
SEG.YourExport.dispose()
```

`SEG.Ctx` — the shared per-frame state object (read-only unless you own the field):

```js
SEG.Ctx = {
  t: 0,                 // seconds since boot
  dt: 0,
  frame: 0,
  gl, canvas, W, H,     // W/H = render-target size (already multiplied by quality.scale)
  view: Float32Array16, proj: Float32Array16, viewProj: Float32Array16,
  prevViewProj: Float32Array16,          // for motion blur / TAA
  camPos: Float64Array3,                 // absolute heliocentric position of camera
  camQuat: Float64Array4,
  camFwd: Float64Array3, camUp: Float64Array3, camRight: Float64Array3,
  fov: 1.0,             // vertical FOV, radians
  exposure: 1.0,
  sunDirWorld: Float64Array3,            // normalised, camera -> sun
  sunColor: Float32Array3, sunIntensity: 1.0,
  ship: SEG.Ship,       // see below
  body: null,           // nearest/dominant SEG.Body, or null in deep space
  altitude: 0,          // metres above the dominant body's sea level (Infinity in deep space)
  atmoDensity: 0,       // 0..1 local air density fraction
  speed: 0,             // m/s relative to dominant body's rotating frame
  phase: 'space',       // 'space' | 'orbit' | 'reentry' | 'atmo' | 'landed' | 'warp' | 'eva'
  reentryHeat: 0,       // 0..1 drives plasma / shockwave FX
  paused: false,
  quality: SEG.GL.quality
};
```

**Ship state** (`SEG.Ship`, owned by A11, everyone may read):

```js
SEG.Ship = {
  pos: Float64Array3,   // absolute heliocentric, metres
  vel: Float64Array3,   // m/s
  quat: Float64Array4,
  angVel: Float64Array3,// rad/s, body frame
  mass: 0,              // kg (wet)
  dryMass: 0,
  throttle: 0,          // 0..1
  rcs: Float64Array3,   // -1..1 per body axis (pitch,yaw,roll) commanded
  translate: Float64Array3, // -1..1 RCS translation command (x=right,y=up,z=fwd)
  sas: true, gearDown: false, brakes: false,
  fuel: 1, oxygen: 1, hull: 1, power: 1,   // 0..1 fractions
  maxThrust: 0,         // N
  engines: [ {posLocal:[x,y,z], dirLocal:[x,y,z], radius, throttle01, temp01} ],
  rcsPorts: [ {posLocal, dirLocal, fire01} ],
  gear: [ {posLocal, compression01, contact:bool, dustRate} ],
  soi: null,            // SEG.Body currently dominating
  orbit: null           // SEG.Orbit elements (see A10)
};
```

**Body** (`SEG.Body`, owned by engine):

```js
{ id, name, kind:'star'|'planet'|'moon'|'gasgiant',
  mu,               // GM, m^3/s^2
  radius,           // mean sea-level radius, m
  rotPeriod, axialTilt, obliquityQuat,
  parent, a, e, i, raan, argp, m0,   // Keplerian elements about parent
  pos: Float64Array3, vel: Float64Array3,   // updated each frame
  atmo: { height, seaLevelDensity, scaleHeight, rayleigh:vec3, mie, sunsetTint:vec3 } | null,
  ocean: { level, color:vec3, deep:vec3 } | null,
  dna: PlanetDNA,   // see §7
  soiRadius, color:vec3, emissive:vec3 }
```

## 7. PlanetDNA — the shared procedural genome (defined by A4, used by everyone)

```js
dna = {
  seed: 0,             // float, the master seed
  radius: 6.371e6,     // m
  type: 0,             // 0 rocky/airless, 1 terran, 2 desert, 3 ice, 4 volcanic, 5 gas giant, 6 ocean world
  amp: 8000,           // continental relief amplitude, m
  ridgeAmp: 6000,      // mountain-ridge amplitude, m
  warp: 0.35,          // domain-warp strength
  freq: 1.6,           // base continental frequency
  octaves: 9,
  seaLevel: 0.0,       // elevation (m) that counts as sea level; ocean exists iff body.ocean
  craters: 0.0,        // 0..1 crater density
  rivers: 0.0,         // 0..1 river carving strength
  dunes: 0.0, ice: 0.0, lava: 0.0, vegetation: 0.0,
  temp: 288, humidity: 0.6,   // biome drivers
  palette: [ [r,g,b] x 6 ]    // linear-space base biome colours
}
```

GLSL mirror struct (`SEG.GLSL.field` declares it):

```glsl
struct SegDNA { float seed, radius, amp, ridgeAmp, warp, freq, seaLevel,
                craters, rivers, dunes, ice, lava, vegetation, temp, humidity;
                int type; vec3 pal[6]; };
float segFieldHeight(vec3 dir, SegDNA d);              // metres, relative to d.radius
vec3  segFieldBiome(vec3 dir, float h, float slope, SegDNA d);   // linear RGB albedo
float segFieldDetail(vec3 dir, float scaleM, SegDNA d);// fine sub-metre detail for normals
```

JS mirror (canonical — the CPU one drives real geometry & collision):

```js
SEG.Field.height(dirX,dirY,dirZ, dna) -> metres        // MUST be allocation-free & fast
SEG.Field.biome(dirX,dirY,dirZ, h, slope, dna, out3)   // writes out3
SEG.Field.normal(dirX,dirY,dirZ, dna, out3, eps)
```

The GPU and CPU versions do **not** need bit-exact parity — CPU drives the mesh, GPU only adds
sub-mesh detail. But they must agree in *character* at large scale (same continents).

## 8. Quality tiers — respect them

```js
tier 0 (phone):  render scale 0.6-0.75, no volumetric clouds raymarch (use 2-layer billboard
                 cloud shell), 8-step atmosphere, bloom at 1/4 res, no motion blur, LOD depth 8
tier 1 (laptop): render scale 0.85, 16-step clouds, 12-step atmosphere, LOD depth 10
tier 2 (desktop):render scale 1.0, 32-step clouds, 24-step atmosphere, full post chain, LOD 12
```

Every raymarch loop must read its step count from a uniform the engine sets, never a literal.

## 9. Deliverable format for YOUR file

1. The module file itself (working, self-contained, commented).
2. A short block comment at the top: what it exports, what uniforms it expects, what it costs
   in ms on a phone.
3. **A `selfTest()` function** on your export that the engine's test harness runs headlessly:
   `SEG.YourExport.selfTest()` must return `{ok:true}` or `{ok:false, why:'...'}`. For shader
   modules, self-test by compiling each shader string and reporting the compile log.
4. Append a short markdown note to `/home/user/Main/src/docs/<yourslot>.md` describing the
   technique, the papers/games it is derived from, and its performance cost.

**Do not modify any file outside your own slot.** If you need something from another module
that does not exist yet, code defensively against the interface above
(`if (SEG.Field && SEG.Field.height) ... else fallback`).

## 10. The look we are chasing

Photoreal, cinematic, physically-motivated. References: Kerbal Space Program (physics
readability, navball, patched conics), No Man's Sky (planet variety, seamless descent,
saturated but believable palettes), Elite Dangerous (scale + cockpit), Interstellar
(gravitational lensing, the Endurance), Star Citizen (material density, ship greebling).
Every visual choice should be defensible as "this is what the real physics would look like."
