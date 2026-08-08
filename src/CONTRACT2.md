# STELLAR EXPANSE — Build Contract v2 (SUPERSEDES CONTRACT.md)

We are building **ONE self-contained `.html` file**: a photorealistic WebGL2 space-exploration
game — Kerbal Space Program orbital physics + No Man's Sky procedural planets — that runs
offline from a single file, on a **phone** as well as desktop.

**The v1 contract's `SEG.*` namespace is GONE.** All part-files are concatenated in order into
ONE `<script>` wrapped in a single IIFE. So: **plain top-level `const` / `function` / `let`
declarations, shared directly as globals within that scope.** No `SEG.`, no IIFE of your own,
no `import`/`export`, no `'use strict'` directive of your own.

## Hard constraints

* **Zero dependencies.** No three.js, no CDN, no fetch/XHR, no external images or fonts.
* **WebGL2 only. Shaders are GLSL ES 3.00.**
* **Must hit 30fps on a mid-range phone.** No 128-step raymarches. No per-frame allocation.
* Plain ES2020. Never use a name already defined in an earlier part-file (see the inventory
  below) — a duplicate `const` at top level is a fatal SyntaxError that kills the whole game.
* **Prefix every one of your own globals with your assigned tag** (given in your task) to
  guarantee no collisions.

## Concatenation order

```
p1-shell.html   (head/CSS/DOM)          — DONE, owned by lead
p2-core.js      (math, noise, field)    — DONE, owned by lead  ← read it before you start
p3-gl.js        (GL engine, mesh utils) — lead
p4-shaders.js   (GLSL library strings)  — agents B1, B2
p5-world.js     (solar system, terrain quadtree LOD) — lead
p6-ship.js      (ship mesh + PBR)       — agent B4
p7-physics.js   (orbits + flight model) — agent B3
p8-ui.js        (HUD, navball, wormhole state machine) — lead + agent B2
p9-main.js      (render loop, integration) — lead
p10-docs.js     (documentation payload) — agent B5
```

## Inventory of names ALREADY DEFINED in p2-core.js — do not redefine, do reuse

```
TAU DEG
v3 vset vcopy vadd vsub vscl vmad vdot vcross vlen vlen2 vdist vnorm vlerp
clamp sat mix smoothstep
m4id m4mul m4persp m4view m4model m3n
qid qmul qaxis qnorm qconj qrot qinvrot qslerp qlook
_v0.._v9 _q0 _q1 _q2          (module-scope scratch vectors — DO NOT use these in your own
                               code; declare your own scratch with your tag prefix)
GRAD hash3 noise3 fbm uberfbm ridged worley _D
makeDNA fieldHeight fieldNormal describeDNA
```

### Conventions from p2-core.js

* Vectors are `Float64Array(3)`, created by `v3(x,y,z)`. **Every vector function writes into
  its first argument `o` and returns it** — e.g. `vadd(out, a, b)`, `vscl(out, a, 3)`.
  `vmad(o,a,b,s)` computes `o = a + b*s`.
* Quaternions are `Float64Array(4)` as `[x,y,z,w]`. `qrot(o,q,v)` rotates a vec3;
  `qinvrot(o,q,v)` rotates by the inverse. `qlook(o,fwd,up)` builds a quat whose **−Z** is `fwd`.
* Matrices are `Float32Array(16)`, **column-major**. `m4view(o,q,p)` builds a camera-relative
  view matrix. `m4model(o,q,p,scale)` builds a model matrix.
* **Model space: −Z = forward (nose), +Y = up (dorsal), +X = right (starboard).**
* `noise3(x,y,z,D)` returns −1..1 and, if `D` (a `Float32Array(3)`) is passed, writes the
  analytic derivative into it. `uberfbm(x,y,z,oct,lac,gain,damp)` is derivative-damped fBm.
* `fieldHeight(dx,dy,dz,dna)` → **metres of elevation relative to `dna.radius`**, given a
  **unit direction** on the planet sphere. This is canonical: it drives both the terrain mesh
  and collision. `dna._oct` caps the octave count for cheap/distant samples.
* `makeDNA(seed,type,radius)` → the planet genome. `type`: 0 rocky/airless, 1 terrestrial,
  2 desert, 3 ice, 4 volcanic, 5 gas giant, 6 ocean world. DNA fields:
  `seed radius type amp ridgeAmp warp freq octaves seaLevel craters rivers dunes ice lava
   vegetation temp humidity hue pal[6] _oct`

## Units, scale, precision

* **1 unit = 1 metre, everywhere.** The solar system is at **true 1:1 scale**
  (Sun–Earth = 1.496e11 m).
* **Physics is Float64 in absolute heliocentric coordinates.**
* **Rendering is always camera-relative**: the engine subtracts the Float64 camera position
  before anything reaches the GPU, so all Float32 GPU data is small. Never put an absolute
  world position in a Float32Array.
* **Logarithmic depth** — near 0.1 m, far 1e13 m. Every vertex shader must end with
  `gl_Position = ...; segLog(gl_Position);`

## GL engine API (p3-gl.js, provided by lead — code against this)

```js
gl                                  // the WebGL2RenderingContext (global)
QUALITY                             // {tier:0|1|2, scale:0.5..1, mobile:bool, steps:{atmo,cloud,wh}}
prog(vsSrc, fsSrc, name)            // -> {p, u:{}, a:{}, use()}  auto-prepends
                                    //    "#version 300 es", precision, and GLSL_COMMON
mesh({position,normal,uv,color,index})  // Float32Array / Uint32Array -> {vao,count,draw()}
fbo(w,h,{float,depth,n})            // -> {fb, tex[], depthTex, bind(), resize(w,h)}
tex2D(w,h,fmt,data,opts)            // -> WebGLTexture
drawQuad()                          // fullscreen triangle; bind your program first
FSQUAD_VS                           // vertex shader source for fullscreen passes; gives `in vec2 vUV`
GLSL_COMMON                         // auto-prepended to EVERY shader — see below
```

Uniform locations are reflected into `.u` by name. **A uniform optimised out is `undefined`,
so always guard:** `if (P.u.uFoo) gl.uniform1f(P.u.uFoo, x);`

`GLSL_COMMON` already defines (do NOT redefine): `PI`, `TAU`, `sat()` (float/vec2/vec3),
`remap()`, `rotAxis()`, `luma()`, `hash11/hash21/hash22/hash33`, `vnoise3()`, `segLog(inout vec4)`,
`raySphere(ro,rd,center,radius) -> vec2(tNear,tFar)` (x>y means miss), `uLogFC` (uniform).

Fullscreen fragment shaders declare exactly: `in vec2 vUV; out vec4 fragColor;`

**GLSL naming:** prefix your functions with your tag (`atmo*`, `ocean*`, `cloud*`, `wh*`,
`post*`, `ship*`). Prefix uniforms with `u`. Never use `#version`, `precision`, `#extension`,
dynamic-bound `while`, or recursion. **All raymarch loop bounds come from a uniform** the
engine sets per quality tier — never a literal.

## Shared frame state — `CTX` (global object, updated each frame by the lead's loop)

```js
CTX = { t, dt, frame, W, H, view, proj, viewProj, prevViewProj,   // Float32Array(16)
        camPos, camQuat, camFwd, camUp, camRight,                 // Float64
        fov, exposure, sunDir, sunColor, sunIntensity,
        body,          // dominant Body or null
        altitude,      // m above sea level (Infinity in deep space)
        atmoDensity,   // 0..1
        speed, phase,  // 'space'|'orbit'|'reentry'|'atmo'|'landed'|'warp'
        reentryHeat,   // 0..1
        paused, quality }
```

`SHIP` (global, owned by agent B3):
```js
SHIP = { pos, vel, quat, angVel,          // Float64
         mass, dryMass, throttle, rcs, translate,   // rcs/translate: Float64Array(3), -1..1
         sas, sasMode, gearDown, brakes,
         fuel, oxygen, hull, power,        // 0..1
         maxThrust, engines[], rcsPorts[], gear[],
         soi, orbit }
```

`BODIES` (global array, owned by lead): each
```js
{ id, name, kind, mu, radius, rotPeriod, tilt, parent, a, e, inc, raan, argp, m0,
  pos, vel,                       // Float64, updated each frame
  atmo: {height, rho0, scaleH, rayleigh:[r,g,b], mie, tint:[r,g,b]} | null,
  ocean: {level, color:[r,g,b], deep:[r,g,b], kind} | null,
  dna, soi, color:[r,g,b], emissive:[r,g,b] }
```

## Deliverable rules

1. Write **only** your assigned file(s). Never touch another agent's file or the lead's files.
2. Code **defensively** against anything you don't own: `if (typeof SHIP !== 'undefined' && SHIP.gear) {...}`.
3. Export a `selfTest()` named `<yourtag>SelfTest` returning `{ok:true}` or `{ok:false,why}`.
   For shaders, self-test = compile every string and return the compile log on failure.
4. Also write a short markdown note to `/home/user/Main/src/docs/<yourtag>.md`: the technique,
   the papers/games it derives from, and its cost in ms on a phone.
5. **Do not run `npm install`, do not create a package.json, do not spawn subagents.**
   You may syntax-check with `node --check <file>` (files are fragments, so wrap in a function
   for the check if needed).

## The look we are chasing

Photoreal, cinematic, physically motivated. References: **Kerbal Space Program** (readable
physics, the navball, patched conics), **No Man's Sky** (planet variety, seamless descent,
saturated-but-believable palettes), **Elite Dangerous** (scale, cockpit), **Interstellar**
(gravitational lensing, the Endurance, NASA-brutalist hardware), **Star Citizen** (material
density, greebling). Every visual choice should be defensible as *"this is what the real
physics would look like."*
