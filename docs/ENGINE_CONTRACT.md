# ISLAND PROTOCOL — ENGINE CONTRACT v1

**READ THIS ENTIRE DOCUMENT BEFORE WRITING ANY CODE.**

Final deliverable: ONE self-contained `index.html` file. Every JS source file listed
below is concatenated **in order** into a single `<script>` block at build time.

## HARD RULES (violating any of these breaks the build)

1. **No ES modules.** No `import`, no `export`, no `require`. No `type="module"`.
2. **No external libraries, no CDNs, no network fetches, no external assets.**
   No `fetch()`, no `<img src>`, no font URLs. Everything is generated in code.
   (The published page runs under a strict CSP that blocks all external hosts.)
3. **No top-level `const`/`let` name collisions across files.** Wrap all of your
   file's internals in an IIFE: `(function(){ 'use strict'; ... })();` and expose
   ONLY through the `IP` namespace slot assigned to you.
4. **ASCII only** in source (no smart quotes, no emoji in code identifiers).
5. **Do not touch `window` globals** other than reading `window.IP`.
6. Your file must be **syntactically valid on its own** (`node --check yourfile.js`
   must pass). Run that check yourself before finishing.
7. **Do not write `index.html`.** Do not write files outside your assigned path.
8. Assume your file runs AFTER `10_core.js` and can use everything in it.
9. Never call another agent's functions at *load time* (module top level) — only
   from inside functions that the integrator calls at runtime. Load order is:
   core -> render -> geometry -> actors -> systems -> ui -> story -> main.
10. Performance target: 60fps desktop, 30fps mobile. Allocate nothing per-frame in
    hot loops (reuse scratch vectors/matrices). No `new` inside per-frame loops.

## FILE ASSIGNMENTS

| File | Namespace slot | Owner |
|---|---|---|
| `src/10_core.js` | `IP.M4`, `IP.V3`, `IP.Q`, `IP.Rand`, `IP.Noise`, `IP.Util` | INTEGRATOR (already written — read it) |
| `src/20_render.js` | `IP.Renderer` | Agent C |
| `src/30_geometry.js` | `IP.Geo`, `IP.Level` | Agent D |
| `src/40_actors.js` | `IP.Actors` | Agent E |
| `src/50_systems.js` | `IP.Systems` | Agent F |
| `src/60_ui.js` | `IP.UI`, `IP.Input`, `IP.Audio` | Agent G |
| `src/70_story.js` | `IP.STORY` | Agent A |
| `src/80_main.js` | `IP.Game` | INTEGRATOR |
| `docs/RE4_RESEARCH.md` | — | Agent B |
| `docs/STORY.md` | — | Agent A |

## CORE API (from `src/10_core.js`) — use these, do not reimplement

All matrices are `Float32Array(16)`, **column-major** (same as GL / gl-matrix).
All vectors are `Float32Array(3)` or plain `[x,y,z]` arrays — functions accept both.
Every function that produces a matrix/vector takes an `out` parameter and returns it.

```js
IP.M4.create()                       -> new identity Float32Array(16)
IP.M4.identity(out)
IP.M4.copy(out, a)
IP.M4.mul(out, a, b)                 // out = a * b
IP.M4.translate(out, a, v)
IP.M4.rotateX/rotateY/rotateZ(out, a, rad)
IP.M4.scale(out, a, v)
IP.M4.fromTRS(out, pos, quat, scale)
IP.M4.fromRotationTranslationScale = fromTRS  // alias
IP.M4.perspective(out, fovyRad, aspect, near, far)
IP.M4.ortho(out, l, r, b, t, n, f)
IP.M4.lookAt(out, eye, center, up)
IP.M4.invert(out, a)
IP.M4.transpose(out, a)
IP.M4.getTranslation(out3, m)
IP.M4.transformPoint(out3, m, p3)
IP.M4.transformDir(out3, m, v3)

IP.V3.create(x,y,z) / set(out,x,y,z) / copy(out,a) / add / sub / mul / scale(out,a,s)
IP.V3.dot(a,b) / cross(out,a,b) / len(a) / len2(a) / dist(a,b) / dist2(a,b)
IP.V3.normalize(out,a) / lerp(out,a,b,t) / negate(out,a)
IP.V3.TMP0..TMP7                     // scratch vectors, free to clobber locally

IP.Q.create() / identity(out) / fromEuler(out, x, y, z)  // radians, YXZ order
IP.Q.fromAxisAngle(out, axis, rad) / mul(out,a,b) / slerp(out,a,b,t) / normalize(out,a)
IP.Q.rotateVec3(out3, q, v3)

IP.Rand.seed(n)            // deterministic PRNG
IP.Rand.f()                // [0,1)
IP.Rand.range(a,b)
IP.Rand.int(a,b)           // inclusive
IP.Rand.pick(array)
IP.Rand.make(seed)         // -> independent generator object {f, range, int, pick}

IP.Noise.perlin2(x,y)      // [-1,1]
IP.Noise.perlin3(x,y,z)
IP.Noise.fbm2(x,y,octaves,lacunarity,gain)
IP.Noise.worley2(x,y)      // [0,1] distance to nearest feature point

IP.Util.clamp(v,a,b) / lerp(a,b,t) / smoothstep(e0,e1,x) / damp(a,b,lambda,dt)
IP.Util.TAU / DEG2RAD / RAD2DEG
IP.Util.now()              // ms, monotonic
IP.Util.aabbOverlap(minA,maxA,minB,maxB)
IP.Util.segIntersectAABB(p0,p1,min,max) -> t in [0,1] or -1
IP.Util.on(evtName, fn) / IP.Util.emit(evtName, payload)   // global event bus
```

## SHARED DATA FORMATS

### Geometry (CPU-side mesh data) — produced by Agent D & E, consumed by Renderer

```js
// A "GeoData" object. positions/normals REQUIRED. Everything else optional.
{
  positions: Float32Array,   // xyz triplets
  normals:   Float32Array,   // xyz triplets, unit length
  uvs:       Float32Array,   // uv pairs (defaults to 0,0)
  colors:    Float32Array,   // rgb triplets, linear 0..1 (defaults to 1,1,1)
  indices:   Uint32Array,    // triangle list (REQUIRED)
  bounds:    { min:[x,y,z], max:[x,y,z] }   // optional; renderer computes if absent
}
```

### Material

```js
{
  albedo:   [r,g,b],   // linear 0..1        default [0.8,0.8,0.8]
  rough:    0..1,      // default 0.8
  metal:    0..1,      // default 0.0
  emissive: [r,g,b],   // linear, can exceed 1 for bloom.  default [0,0,0]
  tex:      'none'|'concrete'|'metal'|'rust'|'wood'|'dirt'|'rock'|'foliage'|
            'tile'|'flesh'|'fabric'|'glass'|'grate'|'blood',  // procedural texture id
  texScale: 1.0,       // world-space UV multiplier
  alpha:    1.0,       // <1 => rendered in transparent pass
  doubleSided: false,
  emissivePulse: 0     // hz; renderer animates emissive if > 0
}
```

### Draw item (what Renderer.draw consumes)

```js
{ geo: <GPUMesh from Renderer.upload>, mat: <Material>, m: Float32Array(16),
  castShadow: true, skin: null }
```

### Scene passed to `IP.Renderer.renderFrame(scene, dt)`

```js
{
  camera: { pos:[x,y,z], quat:Float32Array(4), fov: 1.05, near:0.08, far:400, aspect:auto },
  sun:    { dir:[x,y,z], color:[r,g,b], intensity: 1.0, ambient:[r,g,b] },
  fog:    { color:[r,g,b], density: 0.02, height: 8, heightFalloff: 0.15 },
  lights: [ { pos:[x,y,z], color:[r,g,b], range: 12, intensity: 2, shadow:false } ],  // max 48 active, renderer culls
  items:  [ <draw item>, ... ],
  transparent: [ <draw item>, ... ],
  sprites: [ { pos:[x,y,z], size:0.2, color:[r,g,b,a], kind:'spark'|'rain'|'smoke'|'blood'|'spore'|'muzzle' } ],
  post:   { exposure:1, bloom:0.6, grain:0.25, chroma:0.4, vignette:0.6,
            saturation:0.85, contrast:1.1, hurt:0, flashbang:0, lightning:0 },
  time:   seconds,
  quality: 0|1|2   // 0=low(mobile) 1=medium 2=high
}
```

## RENDERER PUBLIC API (Agent C must implement exactly this)

```js
IP.Renderer.init(canvas, opts) -> true/false     // creates WebGL2 ctx (fallback: report false)
IP.Renderer.resize(w, h, dpr)
IP.Renderer.upload(geoData) -> GPUMesh           // uploads VBO/IBO, returns opaque handle
IP.Renderer.updateMesh(gpuMesh, geoData)         // re-upload dynamic geometry
IP.Renderer.dispose(gpuMesh)
IP.Renderer.setQuality(0|1|2)
IP.Renderer.renderFrame(scene, dt)
IP.Renderer.screenToWorldRay(nx, ny, camera, outOrigin, outDir)  // nx,ny in [-1,1]
IP.Renderer.stats -> { drawCalls, tris, fps }
IP.Renderer.supportsWebGL2 -> bool
```

Renderer requirements: PBR (GGX + Smith + Schlick), cascaded-or-single directional
shadow map (PCF), up to 48 dynamic point lights (clustered or simple loop with
culling), procedurally generated textures (see `tex` ids) built once into a texture
array or atlas at init, height-based exponential fog, HDR framebuffer + bloom
(bright-pass + separable blur, 3 mips), ACES-ish tonemap, film grain, chromatic
aberration, vignette, saturation/contrast grade, screen-space rain streaks hook,
and a GPU-instanced sprite/particle pass with soft-depth fade.
Gracefully degrade at quality 0: no bloom mips beyond 1, 512 shadow map, no SSAO.

## ACTORS API (Agent E)

```js
IP.Actors.build()                        // called once after Renderer.init; builds all meshes
IP.Actors.makeRig(kind)                  // kind: 'player'|'elena'|'ganado'|'brute'|'shielder'|
                                         // 'spitter'|'crawler'|'boss'|'soldier'
   -> rig = { nodes:{name:{m:Mat4, parent, geo, mat}}, order:[names], state:{}, height, radius }
IP.Actors.pose(rig, poseState, dt)       // writes rig.nodes[*].m ; poseState described below
IP.Actors.collect(rig, worldMatrix, outItems)   // pushes draw items into outItems array
IP.Actors.getBoneWorld(rig, name, outMat)       // for muzzle flash / grab attach points
```

`poseState` (all optional, sensible defaults):
```js
{ anim:'idle'|'walk'|'run'|'aim'|'fire'|'reload'|'melee'|'hurt'|'death'|'crouch'|
        'climb'|'vault'|'grabbed'|'stagger'|'cower'|'sprint'|'crawl'|'mutate',
  t: seconds_in_anim, speed: 0..1, aimPitch: rad, aimYaw: rad, lookAt:[x,y,z]|null,
  blend: 0..1, injured: 0..1, fear: 0..1, limbLost: {larm:false,rarm:false,head:false} }
```
Use **procedural** animation (sin/cos driven IK-ish joint curves) — no imported clips.
Aim for readable, weighty motion: hip sway, counter-rotating shoulders, foot planting,
head look-at, additive breathing, recoil kick, injury limp.

## SYSTEMS API (Agent F) — pure logic, NO WebGL, NO DOM

```js
IP.Systems.createWorldState(seed) -> S     // the whole mutable game state object
IP.Systems.update(S, input, dt)            // one simulation tick
IP.Systems.WEAPONS / .ITEMS / .RECIPES / .UPGRADES   // data tables
IP.Systems.Inventory.*                     // grid inventory (case), rotate, stack, combine
IP.Systems.Companion.*                     // Elena behavior tree + commands
IP.Systems.EnemyAI.*                       // perception, flanking, grabs, mutation
IP.Systems.Save.save(S)/load()/hasSave()/clear()   // localStorage, key 'islandProtocolSave'
IP.Systems.damage(S, target, amount, type, hitPos, hitDir)
IP.Systems.fireWeapon(S, dt) / reload(S) / melee(S) / interact(S)
```
`input` shape (produced by Agent G, consumed by F):
```js
{ moveX:-1..1, moveY:-1..1, lookX:px_delta, lookY:px_delta,
  aim:bool, fire:bool, firePressed:bool, reload:bool, sprint:bool, crouch:bool,
  interact:bool, interactPressed:bool, melee:bool, meleePressed:bool,
  swapPressed:bool, inventoryPressed:bool, flashlight:bool,
  cmdFollow:bool, cmdStay:bool, cmdHide:bool, cmdInteract:bool, cmdCome:bool,
  pausePressed:bool, qteTapped:bool, dt }
```

## LEVEL API (Agent D)

```js
IP.Level.build(seed) -> {
  sections: [ { id, name, act, bounds, spawns:[], props:[], lights:[], triggers:[],
                nav:{grid,w,h,cell,origin}, geo:{ opaque:[{geoData,material}], ... } } ],
  collision: { boxes:[{min,max,tag}], ramps:[], water:[], ladders:[], doors:[] },
  navQuery: { isWalkable(x,z), sampleHeight(x,z), findPath(from,to,out) }
}
IP.Geo.box/cylinder/sphere/plane/torus/capsule/lathe/extrude/stairs/pipe/arch(...)
IP.Geo.merge([{geo, matrix, color}]) -> GeoData
IP.Geo.transform(geo, matrix) -> GeoData
IP.Geo.computeNormals(geo) / IP.Geo.computeBounds(geo)
IP.Geo.noiseDisplace(geo, amp, freq)
IP.Geo.terrain(w, h, cell, heightFn) -> GeoData
```

## UI / INPUT / AUDIO API (Agent G)

```js
IP.Input.init(canvasEl, uiRootEl)
IP.Input.poll(dt) -> <input object above>
IP.Input.isTouch -> bool
IP.Input.setMobileLayout(bool)
IP.UI.init(rootEl)         // builds all DOM/CSS. HUD, inventory, menus, subtitles, radial cmd menu
IP.UI.update(S, dt)        // reads game state, updates HUD
IP.UI.show(screen)         // 'title'|'hud'|'inventory'|'pause'|'gameover'|'map'|'upgrade'|'doc'
IP.UI.subtitle(speaker, text, seconds)
IP.UI.prompt(text)         // contextual "[E] Open" prompt; pass null to clear
IP.UI.toast(text)
IP.Audio.init() / IP.Audio.play(name, opts) / IP.Audio.music(state) / IP.Audio.setListener(pos,quat)
```
All audio must be **synthesized with WebAudio** (oscillators, noise buffers, filters,
convolver built from generated impulse). No audio files.

## STORY DATA (Agent A)

```js
IP.STORY = {
  title, subtitle, acts:[ {id,name,objective,beats:[...]} ],
  dialogue: { <triggerId>: [ {speaker, text, cond, fear, dur} ] },
  radio: [...], documents: [ {id, title, body, section} ],
  elenaBarks: { calm:[], tense:[], panic:[], hurt:[], combat:[], reassured:[] },
  endings: [ {id, name, cond, text} ],
  objectives: { <id>: {text, section, next} }
}
```

## STYLE

- Dark, oppressive, rain-soaked, desaturated with sickly green + arterial red accents.
- Sun/moon color roughly `[0.35,0.42,0.55]`, ambient `[0.05,0.07,0.09]`, fog near-black blue.
- Emergency lights: `[1.0,0.15,0.1]`. Containment tanks: `[0.25,1.0,0.45]`.

## WHEN YOU FINISH

Write your file(s) at the exact assigned path, run `node --check <file>` (JS only),
and reply with: the exact API surface you exposed, anything you deviated from,
and any assumption the integrator must know.
