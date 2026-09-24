# ✦ GENESIS — an offline text‑to‑3D sandbox in a single HTML file

**Type anything. Watch it come to life.** GENESIS is a first‑person 3D sandbox
where every sentence you type becomes something in the world: a modern house
with a garden, a slightly overweight man with short black hair in a blue
shirt, a golden retriever that follows you, a drivable police car, a volcano,
a portal to an underwater city… Everything is generated **procedurally, on
your machine, with no network access, no downloads and no AI servers**.

The whole game — engine, renderer, world, characters, generators, UI, audio —
ships as **one self‑contained HTML file** (`dist/genesis-sandbox.html`, also
copied to `index.html`, ~1.5 MB). Double‑click it and play. It works from a
USB stick, on an aeroplane, or on a phone.

---

## Contents

1. [Quick start](#quick-start)
2. [Controls](#controls)
3. [What you can type](#what-you-can-type)
4. [Engine & build](#engine--build)
5. [Hardware requirements](#hardware-requirements)
6. [Architecture](#architecture)
7. [The generation pipeline](#the-generation-pipeline)
8. [Rendering](#rendering)
9. [Characters](#characters)
10. [Vertical slice & measurements](#vertical-slice--measurements)
11. [Project layout](#project-layout)
12. [Testing](#testing)
13. [Limitations & future work](#limitations--future-work)
14. [Third‑party code](#third-party-code)

---

## Quick start

**Play:** open `dist/genesis-sandbox.html` (or `index.html`) in a recent
Chrome, Edge, Firefox or Safari. Wait for the loading bar (the world, its
textures and your own rigged body are generated on the spot — 5–20 s), then
press **Enter the world**.

**Build from source** (Node 18+):

```bash
npm install          # three.js + esbuild (dev dependencies only)
npm run build        # -> dist/genesis-sandbox.html and index.html
npm run dev          # unminified build for debugging
npm test             # headless end-to-end test of the vertical slice (Playwright + Chromium)
```

Useful URL parameters: `?q=low|medium|high|ultra` (graphics preset),
`?gen=fast|balanced|highest` (generation quality), `?touch` (force mobile
controls), `?time=19` (start at sunset), `?weather=rain`.

## Controls

| Desktop | Mobile | Action |
|---|---|---|
| **W A S D** / arrows | left thumb joystick (push to the edge to run) | move |
| mouse | drag on the right half | look |
| **Shift** | **»** button / full stick | sprint |
| **Space** | **⤒** | jump (swim up) |
| **C** / Ctrl | **⤓** | crouch (swim down) |
| **Enter** | tap the bar | type a creation or command |
| **E** / click | **Use** | talk · sit · open doors · drive · pick up · pet · enter portals |
| click / **Q** | — | throw / drop a carried object |
| **V** | ◐ | first / third person |
| **G / B / X** | 👋 / ⌓ | wave · dance · sit down |
| **F** | — | toggle flying |
| **Tab** | ☰ | created‑objects panel (teleport to / delete anything) |
| **Delete** | — | delete what you are looking at |
| **Ctrl+Z** | — | undo last creation |
| **Esc** | ⚙ | pause menu (save/load, settings, help) |

## What you can type

The text box at the bottom is always available. Some examples (all tested):

* **Buildings** — *a modern two‑story house with large windows and a garden*,
  *a Victorian house with a turret*, *a medieval castle far away*, *a 40 story
  skyscraper*, *a lighthouse*, *a windmill*, *a Japanese pagoda*, *a greek
  temple*, *a red barn*, *a bakery*, *an igloo*, *a treehouse*, *ancient
  ruins*, *an alien structure*.
* **People** — *a 1.70 m tall slightly overweight man with short black hair
  wearing a blue shirt*, *an old woman with gray hair in a red dress*, *a
  police officer*, *a wizard with a long white beard*, *a zombie*, *three
  children*. Every character has a unique face, body, outfit, name and
  personality; press **E** to talk (*“what's your name?”, “tell me a joke”,
  “follow me”, “wait here”, “dance!”*).
* **Animals & creatures** — *a friendly golden retriever*, *a dalmatian*,
  *a zebra*, *an elephant*, *a dragon*, *a unicorn*, *a T‑rex*, *a flock of
  birds*, *a shark in the lake*, *a slime*, *a ghost*, *a robot*, *a mech*.
* **Vehicles (drivable/flyable)** — *a red sports car*, *a police car*, *a
  taxi*, *a bus*, *a motorcycle*, *a tank*, *a steam train*, *a sailboat*,
  *a submarine*, *a helicopter*, *a plane*, *a spaceship*, *a UFO*, *a rocket*
  (launch it to reach orbit), *a hot air balloon*.
* **Nature & landscape** — *an oak tree*, *a cherry blossom tree*, *a
  forest*, *a giant glowing crystal*, *glowing mushrooms*, *a floating island
  above me*, *a mountain far away*, *a volcano*, *a lake*, *a river*, *a
  waterfall*, *a crater*.
* **Objects** — *a wooden table with four chairs*, *a grand piano*, *a
  campfire*, *a fountain*, *a treasure chest*, *a gift* (open it!), *a soccer
  ball* (kick it), *a sword in a stone*, *a sign that says “Welcome”*, *giant
  letters spelling HELLO*.
* **Surreal & abstract** — *a tesseract*, *a black hole*, *a melting clock*,
  *a giant eye*, *a hologram*, *a spiral galaxy*, *fireworks*, *a rainbow*.
  Unknown nouns become a unique sculpted art piece labelled with the word.
* **Portals** — *a portal to an underwater city*, *…to a low gravity crystal
  world*, *…to an infinite library*, *…to a nightmare dimension*, *…to the sky
  islands*, *…space*, *…a desert*, *…a frozen world*, *…a lava world*, *…a
  neon city*, *…candy land*, *…an alien jungle*.
* **Whole scenes** — *a village*, *a city*, *a park*, *a campsite*, *a farm*,
  *a beach*, *a graveyard*, *a living room*, *Stonehenge*, *a market*, *a
  zoo*, *a party*.
* **Placement** — *…in front of me / behind me / next to me / to my left /
  above me / far away / around me / next to the house / on the table / by the
  lake / on the lake / replace the house with a castle*.
* **Editing** — *make it bigger*, *paint it red*, *make the car blue*, *turn
  it around*, *move it closer*, *make it glow*, *make it float*, *delete
  that*, *delete all trees*, *undo*, *clear everything*.
* **World** — *make it night*, *set time to sunset*, *make it rain*, *make it
  snow*, *storm*, *fog*, *clear weather*, *low gravity*, *fly*, *third person*,
  *take me home*, *go to the castle*.

## Engine & build

| | |
|---|---|
| Rendering | **three.js r170** (`three@0.170.0`, WebGL 2) + custom shaders |
| Language | modern JavaScript (ES2020 modules), no framework |
| Bundler | **esbuild 0.24** → a single IIFE inlined into one HTML file (`tools/build.mjs`) |
| Assets | none — every texture is baked on the GPU from shader recipes at runtime, every sound is synthesised with WebAudio, every mesh is generated |
| Runtime dependencies | none (no CDN, no fetch, no workers from URLs, no fonts) |
| Output | `dist/genesis-sandbox.html` (≈1.5 MB, minified, license notices kept) |

Why a web stack and not Unity/Unreal: the brief asked for a single offline
HTML file with mobile controls. A native engine cannot produce that; WebGL 2
runs everywhere, and the generation workload (SDF meshing, procedural
geometry) is plain JavaScript that V8/SpiderMonkey JIT‑compile well.

## Hardware requirements

| | Minimum | Recommended |
|---|---|---|
| Browser | Chrome/Edge 100+, Firefox 110+, Safari 16.4+ (WebGL 2) | latest Chrome/Edge |
| GPU | any WebGL 2 GPU (Intel UHD 620, Adreno 6xx, Apple A12) → *Low* preset | GTX 1060 / RX 580 / Apple M1 or better → *High* |
| CPU | 4 cores | 6+ cores (generation runs on the main thread in time slices) |
| RAM | 4 GB | 8 GB+ (each portal dimension keeps its own world in memory) |
| Mobile | 2019+ phone/tablet, landscape | 2021+ flagship |

The graphics preset is chosen automatically (Settings → Quality) from the
GPU string and device type; you can switch between Low/Medium/High/Ultra, and
separately set generation quality (Fast/Balanced/Highest detail).

## Architecture

```
                          ┌────────────────────────────── single HTML file ──────────────────────────────┐
                          │                                                                              │
  keyboard / mouse /      │   ┌─────────┐   text    ┌──────────────┐  intents   ┌───────────────────┐     │
  touch joystick ─────────┼──▶│   UI    │──────────▶│  NLP parser  │───────────▶│ Command executor  │     │
                          │   │ (HUD,   │           │ lexicon+fuzzy│            │ create/talk/edit/ │     │
                          │   │ cards,  │◀── progress, countdown ──┐            │ time/weather/…    │     │
                          │   │ bubbles)│           └──────────────┘ │          └─────────┬─────────┘     │
                          │   └─────────┘                            │            create  │               │
                          │        ▲                                 │                    ▼               │
                          │        │                ┌────────────────┴───────────────────────────────┐   │
                          │        │                │ Generation pipeline (time-sliced jobs, ≤ 5 min) │   │
                          │        │                │  plan → generator stages → placement → register │   │
                          │        │                └──────┬─────────────────────────────────────────┘   │
                          │        │                       │ generators (18 families)                     │
                          │        │   ┌───────────────────┼──────────────────────────────────────────┐   │
                          │        │   │ buildings · humans · creatures · vehicles · nature · terrain │   │
                          │        │   │ props · furniture · structures · text · abstract · portals   │   │
                          │        │   │ scenes · birds · fish · snakes · blobs · robots · fallback   │   │
                          │        │   └───┬──────────────┬──────────────┬─────────────┬─────────────┘   │
                          │        │       │ SDF modeller │ MeshBuilder  │ GPU texture │ rig +         │   │
                          │        │       │ surface nets │ (merged per  │ baker (PBR  │ procedural    │   │
                          │        │       │ SDF skinning │  material)   │ recipes)    │ animator      │   │
                          │        │       └──────────────┴──────┬───────┴─────────────┴───────────────┘   │
                          │        │                             ▼                                        │
                          │   ┌────┴─────────────────────────────────────────────────────────────────┐  │
                          │   │ Registry: entities ⇄ worlds (scene graph, colliders, lights, terrain   │  │
                          │   │ edits, NPC brains, undo, save/load recipes)                            │  │
                          │   └────┬─────────────────────────────────────────────────────────────────┘  │
                          │        ▼                                                                    │
                          │   ┌──────────────────────── Worlds (overworld + portal dimensions) ─────────┐ │
                          │   │ terrain (chunked LOD, splat), grass, forests, water, weather, sky/atmo,  │ │
                          │   │ fixed point-light pool, collision set, rules (gravity/swim/speed), post │ │
                          │   └────┬───────────────────────────────────────────────────────────────────┘ │
                          │        ▼                                                                    │
                          │   Player controller + rigged avatar ──▶ Renderer: HDR → GTAO → bloom →       │
                          │   (physics, vehicles, seats, portals)   ACES → grade/vignette/grain → FXAA   │
                          │                                         + WebAudio procedural soundscape     │
                          └────────────────────────────────────────────────────────────────────────────┘
```

Main loop (per frame): input → player/vehicle physics → **job scheduler
slice** (generation gets a frame‑rate‑adaptive budget, 8–12 ms, escalating as a
job approaches its deadline) → interaction ray‑cast → entity updates (NPC
brains, animation, props physics, portal views) → world update (terrain LOD,
grass, weather, day/night) → light pool → materialise effect → render → HUD
→ audio.

## The generation pipeline

1. **Parsing (`src/gen/nlp.js`, `lexicon.js`)** — a rule‑based parser splits
   the sentence into commands or entity clauses (*“a man with a dog and two
   cats”* → man + companion dog + 2 cats), resolves the head noun against ~280
   concepts (with synonyms and **trigram fuzzy matching**, so *“skyscrapper”*
   still works), and binds attributes: counts, explicit dimensions (*1.70 m*,
   *30 story*), sizes, colours bound to parts (*blue shirt*, *red roof*,
   *black hair*), materials, styles (modern, medieval, futuristic…), body
   types, ages, hair styles/colours, clothing, personality words, placement
   phrases, quoted text and portal destinations. Unknown nouns fall through to
   a sculpted interpretation instead of failing.
2. **Job (`src/core/jobs.js`, `src/gen/pipeline.js`)** — each entity becomes a
   cooperative generator‑function job with named stages, so the game keeps
   running. The UI shows a non‑intrusive card with a progress ring,
   the current stage (*“Sculpting face & hair…”*), a live countdown
   (*“Creating… 00:42 remaining”*, ETA blended from the up‑front estimate and
   observed throughput, calibrated by a CPU micro‑benchmark) and **Cancel**.
   Every job has a hard deadline (Settings → max generation time, ≤ 5 min):
   past 60 % it lowers detail, past 92 % it finishes at once; generators check
   `ctx.mustFinish()` and skip optional work; if a generator throws, the
   fallback generator produces a simpler interpretation. Scenes skip optional
   parts when running late.
3. **Generators (`src/gen/generators/*`)** — one per family (see diagram).
   They use four toolkits:
   * **SDF modelling** (`core/sdf.js`): primitives with smooth booleans,
     nested groups and noise displacement are *compiled to straight‑line
     JavaScript* (`new Function`) and meshed with a coarse‑to‑fine
     narrow‑band sampler + **Naive Surface Nets**, Newton‑refined onto the
     true surface, with SDF ambient occlusion, per‑triangle material
     classification and **SDF skinning** (soft‑min distance to each bone's
     primitives). Used for humans, animals, birds, fish, sculptures.
   * **MeshBuilder** (`buildkit.js`): world‑space‑UV boxes/quads/walls with
     window & door openings, slabs with stairwells, stairs, railings and roofs
     (gable, hip, flat, cone, dome); geometry is merged per material so a
     whole house is a handful of draw calls, and every solid piece emits a
     collider.
   * **Procedural PBR textures** (`render/texbake.js`): ~45 GLSL recipes
     (brick, planks, marble, denim, knit, skin, fur, scales, rooftiles,
     facade with lit windows, lava, crystal…) baked on the GPU into
     albedo/normal/ORM(/emissive) maps with seeded variation and tint.
   * **Rig + procedural animation** (`characters/*`): see below.
4. **Placement (`placement.js`)** — resolves *in front of me*, *next to the
   house*, *on the table*, *on the lake*, *far away*, *around me*, *replace …*;
   searches for free, dry, not‑too‑steep ground, faces the player, spreads
   multiple copies.
5. **Registration (`registry.js`)** — adds the entity to its world: colliders,
   pooled lights, **terrain edits** (buildings flatten their plot, pools and
   moats carve, paths paint the ground, grass is suppressed; all edits are
   owned by the entity and **reverted when it is deleted**), vegetation
   clearing, materialise effect. Entities can be moved/recoloured/scaled,
   undone, deleted (GPU resources are released with ref‑counted shared
   materials) and saved.
6. **Persistence (`game/persistence.js`)** — saves store *recipes* (parsed
   item + seed + transform + runtime state), not meshes: a world with 50
   objects is a few kilobytes, and loading re‑runs the deterministic
   generators. Four localStorage slots (incl. autosave every 2 min) plus
   export/import to a JSON file.

### Why not neural text‑to‑3D?

Neural models (diffusion + NeRF/3DGS, point‑E/shap‑E, large reconstruction
models) need hundreds of MB–GB of weights and a strong GPU runtime; they
cannot be embedded in a 1.5 MB offline HTML file, and even when available they
produce un‑rigged, un‑segmented meshes. GENESIS instead implements the same
*idea* those systems use internally — predict an implicit field, then mesh it
— with a **procedural SDF program synthesised from the parsed prompt**, plus
hand‑built procedural grammars where structure matters (architecture,
vehicles). The result is rigged, animated, collidable, interactive and
unique per seed. A hook for optional neural back‑ends is described in
[future work](#limitations--future-work).

## Rendering

* PBR (`MeshStandard/Physical`) with image‑based lighting from a **PMREM
  environment captured from the live sky** (updated as the sun moves), sun
  shadows (PCF soft, texel‑snapped cascade‑like frustum following the camera),
  hemisphere bounce, **GTAO** ambient occlusion (High/Ultra), **bloom**, ACES
  tone mapping, colour grading, vignette, film grain, chromatic aberration,
  FXAA or MSAA.
* **Preetham sky** with analytic sun/moon, cloud layer, stars, aurora, nebula
  and planets; **height fog with sun in‑scattering**; day/night cycle.
* Global shader patches: wind sway for foliage, translucent leaves and grass,
  wrap‑lit skin (subsurface approximation), rain wetness (darkening + gloss)
  and snow accumulation on upward surfaces.
* Chunked LOD terrain with skirts and an 8‑layer splat shader (slope/height
  rules + painted paths/dirt/sand), heightfield‑driven GPU grass (hundreds of
  thousands of blades in one instanced draw, bends away from you), instanced
  forests with LOD, depth‑aware water with foam and flow.
* **Portals** render the destination world every frame from a mirrored camera
  into a half‑float render target with an oblique clip plane at the exit.
* Performance: fixed point‑light pool (no shader recompiles), instancing,
  merged building geometry, distance‑based entity update rates, LOD for
  forests/terrain, frustum‑culled portal renders, material/texture
  ref‑counting and garbage collection, adaptive generation budget.

## Characters

* **Bodies** — a 22‑bone rig laid out from proportions (height, age, sex,
  fat, muscle, leg/head ratios). The body is an SDF of ~60 primitives with
  clothing as shell groups (t‑shirts, shirts, hoodies, suits, dresses, jeans,
  skirts, shoes, boots…), clipped at hems, hard‑unioned over the skin.
* **Heads** — separate high‑resolution SDF: skull, jaw, cheekbones, brow,
  nose (bridge/tip/nostrils), lips, ears, eyelids, many hair styles (short,
  curly, afro, long, ponytail, bun, mohawk, bald, beards…) with per‑face
  random proportions. Vertex‑painted cheeks, lips, brows and stubble; glossy
  eyes with iris textures, blinking lids, a jaw morph for speech.
* **Animation** — no baked clips: an analytic animator synthesises walk/run
  gaits with foot IK on uneven ground, idle breathing and weight shifts,
  jump/land, crouch, sit, swim, look‑at (head + eyes), blinking, talking, and
  gestures (wave, point, cheer, clap, dance, shrug, bow, think…).
* **Minds** — personalities (traits, mood, favourite things, job), a
  template dialogue engine with intent classification, memory of your name,
  small talk about time/weather/nearby objects, jokes, and orders (follow,
  come, stay, sit, dance, go away). Optional speech synthesis (Settings) or
  procedural voice blips. NPCs path‑find around buildings (grid A*).
* **You** — the player is a 2.00 m man with short curly dark‑brown hair,
  t‑shirt, jeans and sneakers built by the same pipeline at startup. In first
  person your body and feet are visible; a mirror near the spawn and the
  third‑person camera (**V**) show your face.
* **Animals** use their own template system (≈45 species from 20 archetypes)
  → skeleton with N legs/tail/wings → SDF body → SDF skinning → procedural
  gaits (walk/trot/gallop phase offsets, reversed hind hocks, bipeds, hopping,
  sprawling reptiles) and coat patterns (zebra/tiger stripes, leopard
  rosettes via Voronoi, giraffe cells, dalmatian/cow spots, panda, fox, husky…).

## Vertical slice & measurements

The two required prompts are covered by `npm test` (`tools/smoke-test.mjs`),
which boots the built HTML in headless Chromium, enters the world, submits the
prompts through the real UI command path, waits for the jobs and captures
screenshots:

| Prompt | Result |
|---|---|
| *create a modern two‑story house with large windows and a garden* | `2‑story modern house`: cantilevered upper volume, floor‑to‑ceiling glass, flat roof terrace with glass railing, furnished interior, automatic front door, stairs, hedged garden with deck, stepping‑stone path, flower beds, trees and bollard lights (~28k triangles, ~35 draw calls) |
| *create a 1.70 m tall slightly overweight man with short black hair wearing a blue shirt* | parsed as height 1.70 m, fat 0.56, hair short/black, shirt blue → a unique, named, rigged NPC with personality who greets you and can be talked to |

**Measured generation times.** All numbers below come from the automated
test in a cloud container with **no GPU**: 4 vCPUs, headless Chromium, WebGL
through **SwiftShader** (a software rasteriser), running at 0.2–1 fps.
Because generation is time-sliced into the frame loop, this setup is roughly
10–30× slower than a desktop browser with a real GPU. I have **not** measured
on real GPU hardware, so treat these as a worst case. Every job stayed under
the 5-minute cap.

| Prompt (balanced generation quality, Low preset) | Time (SwiftShader) |
|---|---|
| modern two‑story house with large windows and a garden | 68 s |
| 1.70 m slightly overweight man, short black hair, blue shirt | 164 s |
| a campfire / a soccer ball / an oak tree / a giant crystal | 13 s / 12 s / 19.5 s / 11.7 s |
| a red sports car / a police car / a helicopter | 3.3 s / 18.7 s / 12 s |
| a mountain / a stone bridge / giant letters spelling HELLO | 6.3 s / 7.5 s / 20.8 s |
| a dog / a horse / a zebra / an eagle | 53 s / 46 s / 58 s / 11.6 s |
| a robot / a portal to an underwater city | 24.3 s / 62 s |
| a campsite (scene: campfire, 3 tents, 2 campers, a van, 7 trees) | 192 s |



## Project layout

```
index.html / dist/genesis-sandbox.html   the built game (single file)
tools/build.mjs                           esbuild bundler → single HTML
tools/smoke-test.mjs                      headless end-to-end test / benchmark
tools/shot.mjs                            screenshot helper for development
src/main.js                               boot, main loop, input bindings
src/core/        context & settings, seeded RNG, noise, time-sliced jobs, SDF modeller/mesher
src/render/      renderer & post chain, sky/atmosphere, GPU texture baker, material library,
                 global shader patches, point-light pool, materialise effect
src/world/       world container, overworld, terrain, grass, trees/rocks, vegetation, water,
                 weather, portal dimensions
src/physics/     2.5D collision world (boxes/cylinders, spatial hash, ground/ceiling queries)
src/player/      input (keyboard/mouse/pointer-lock/touch joystick), first/third-person controller
src/characters/  rig, body/head/hand SDFs, humanoid builder, animator, accessories,
                 specs from prompts, personality & dialogue, NPC brain & pathfinding
src/gen/         lexicon, NLP parser, pipeline, placement solver, entity registry
src/gen/generators/  18 generator families + shared kits (buildkit, sdfkit, physics, common)
src/game/        command executor, interaction, avatar, persistence, world switching
src/audio/       procedural WebAudio engine
src/ui/          HTML shell, CSS, UI controller
```

About 23 000 lines of commented source.

## Testing

* `npm test` — vertical slice (both required prompts) end to end, fails if a
  job fails, exceeds 300 s, or any page error is logged.
* `node tools/smoke-test.mjs --cmd "a dragon" --cmd "a portal to a neon city" --enter`
  — arbitrary prompts; `--enter` walks through a created portal and captures
  the inside; `--bench` skips rendering to measure pure generation time;
  `--q medium` picks a graphics preset; screenshots go to `tools/out/`.

## Limitations & future work

* **No neural generation.** Offline + single file rules out model weights.
  Future: an optional *plug‑in back‑end* (WebGPU ONNX/WebLLM) could (a) use a
  small local LLM to expand free‑form prompts into the parser's structured
  item format (better handling of long, compositional sentences), and (b) use
  a local image‑to‑3D model when present, falling back to the procedural
  pipeline otherwise.
* **Language understanding is rule‑based.** It handles a large vocabulary,
  attribute binding and typos, but unusual phrasings or deeply nested
  descriptions (*“a house whose second floor is made of glass except the
  balcony”*) are simplified. Unknown nouns become sculptures.
* **Faces are stylised‑realistic**, not photoreal: SDF sculpting at the voxel
  sizes that fit a few seconds of JavaScript cannot reach scan quality.
  Hair is solid sculpted volume, not strands.
* **Physics is gameplay‑grade**: 2.5D colliders (vertical boxes/cylinders),
  simple rigid props, arcade vehicle models. No ragdolls or destruction.
* **Generation runs on the main thread** in time slices. Moving the SDF
  sampler to Web Workers (via blob URLs, still single‑file) would keep the
  frame rate higher during heavy jobs.
* **Reflections** are environment‑map based (plus a planar mirror near the
  spawn); no screen‑space or ray‑traced reflections. DOF is not implemented.
* **Mobile**: works, but at the Low preset; long generations are slower on
  phones (the time cap still applies — detail is reduced to meet it).
* **Portal dimensions** are fixed archetypes (12) populated procedurally;
  the destination text selects the closest one.
* **Memory**: every portal keeps its dimension loaded for instant travel;
  deleting the portal frees it.

## Third‑party code

* [three.js](https://threejs.org) r170 — MIT License, © 2010‑2024 three.js
  authors (bundled; license notice preserved at the end of the build).
* [esbuild](https://esbuild.github.io) — build tool only (MIT).
* Playwright/Chromium — test tooling only.

Everything else — engine code, shaders, generators, UI, audio — is original to
this project.
