# STEVE — THE PC REPAIR MAN · BUILD CONTRACT

**READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.**

A single-file 3D browser game (Three.js r160). Every asset — geometry, texture,
sound, music, voice — is generated **procedurally at runtime**. No external files,
no network calls, no base64 blobs of pre-made media, no CDN. The finished game is
ONE `.html` file that runs offline on a phone.

---

## 1. Build system

Sources live in `/home/user/Main/src/NN_name.js`. `build/build.js` concatenates
them **in filename order** into `dist/steve.html`, wrapped in a single classic
`<script>` tag, after the inlined Three.js IIFE.

Consequences you MUST respect:

* **Classic scripts, not modules.** No `import` / `export` / `import.meta`.
* **No top-level `const`/`let`/`class` with a common name.** Everything you
  create must live inside an IIFE and be attached to the `SG` namespace:

  ```js
  (function (SG, THREE) {
    'use strict';
    // ... your code ...
    SG.tex.wood = function (opts) { /* ... */ };
  })(window.SG, window.THREE);
  ```

  Never declare a bare global. One IIFE per file. This is non-negotiable —
  a leaked `const r` will break the whole build.
* Target **ES2019** syntax (no `?.`, no `??`, no class fields, no top-level
  await). Some mobile browsers in the wild are older than you think.
* Your file must pass `node --check`.

---

## 2. The `SG` namespace

`src/00_core.js` (already written) creates:

```js
SG.util   // math + rng helpers        SG.bus    // event bus
SG.tex    // texture factories         SG.mat    // material factories
SG.models // prop model factories      SG.chars  // character factories
SG.audio  // sfx + music               SG.voice  // speech
SG.phys   // collision world           SG.input  // keyboard/mouse/touch
SG.ui     // HUD + menus               SG.fx     // post-processing
SG.cinema // cutscene player           SG.script // dialogue data
SG.levels // level definitions         SG.eggs   // easter eggs
SG.state  // persistent game state
```

Read `src/00_core.js` and `src/90_main.js` before you start. They are the
source of truth; this document describes intent.

### 2.1 `SG.util`

```
TAU, DEG
clamp(v,a,b)  lerp(a,b,t)  smooth(t)          // smoothstep 0..1
damp(a,b,lambda,dt)                            // frame-rate independent lerp
rand(a,b)  randi(a,b)  chance(p)  pick(arr)
rng(seed) -> function() // deterministic 0..1, use this for anything
                        // that must look the same every playthrough
noise2(x,y)      // value noise, -1..1, seeded, deterministic
fbm2(x,y,oct)    // fractal brownian motion, -1..1
now()            // seconds, monotonic
```

### 2.2 `SG.bus`

`SG.bus.on(name, fn)`, `SG.bus.off(name, fn)`, `SG.bus.emit(name, payload)`.

Events the engine emits: `level:built`, `level:done`, `objective:set`,
`objective:done`, `interact:hover`, `interact:use`, `egg:found`,
`state:change`, `pause`, `resume`.

---

## 3. Performance budget (HARD REQUIREMENTS)

The game must hold **60 fps on desktop and ≥30 fps on a mid-range phone**.

* **Total draw calls per frame: ≤ 250.** Merge static geometry aggressively
  (`SG.util.mergeGroup(group)` is provided — use it on anything that never moves).
* **Total triangles: ≤ 300k.** A screw does not need 32 radial segments; use 6–8.
* **Textures: 256×256 by default, 512 only where the player's face is
  centimetres from it** (monitor screens, posters, labels). Generate once,
  cache forever. `SG.tex.*` factories MUST memoise by their options key.
* **Materials: share them.** `SG.mat.*` factories MUST memoise.
* **Lights: ≤ 6 dynamic lights per level, ≤ 2 casting shadows.** Bake the rest
  into vertex colours or emissive materials.
* Never allocate `THREE.Vector3`/`Matrix4` inside an update loop. Hoist scratch
  vectors into your IIFE closure.
* Never build geometry inside an update loop.

Quality tiers: `SG.quality` is `'low' | 'med' | 'high'` (auto-detected, user
overridable). Respect it: on `'low'`, halve texture resolution, disable
shadows, skip decorative particle systems. Read it at build time, not per frame.

---

## 4. Art direction

Grounded, physically plausible, slightly cinematic. Think *"a real repair shop
photographed on a 35mm lens"*, not *"low-poly pastel"*.

* **Units are metres.** Steve is 1.80 m. A desk is 0.74 m high. A door is
  2.05 × 0.92 m. An ATX tower is 0.45 × 0.19 × 0.45 m. A CR2032 is 20 mm across.
  Get this right — wrong scale is the #1 thing that makes a 3D scene feel fake.
* **Physically-based materials.** Use `MeshStandardMaterial` with sane values:
  painted drywall `roughness .92 metalness 0`, brushed aluminium `.35 / 1.0`,
  bare steel `.5 / 1.0`, ABS plastic `.6 / 0`, glass `.05 / 0` + transparent,
  old beige plastic `.75 / 0`, varnished wood `.4 / 0`. Never `metalness: 0.5`
  on a non-metal — it is either metal or it is not.
* **Colour**: everything authored in sRGB via `new THREE.Color('#rrggbb')`.
  The renderer uses `outputColorSpace = SRGBColorSpace` and ACESFilmic tone
  mapping, so raw hex values will look about right.
* **Wear is what sells it.** Scuffed skirting boards, coffee rings, dust on the
  top of the CRT, cable spaghetti, a bent PCI slot cover, sun-bleached posters.

---

## 5. Story (all modules must agree on these facts)

Steve runs a nondescript PC repair shop in a small office park. He fixes
hardware for elderly customers nobody else will touch without gouging them.
He also, quietly, takes contracts — any job, any client, **100 % up front**.

| # | Chapter | Kind | Notes |
|---|---------|------|-------|
| 0 | `title` | menu | 3D title scene: neon shop sign, rotating motherboard |
| 1 | `c1_open` | cutscene | Steve finishes Ms. Ellis's Windows 98 CMOS battery. Door chime. Oleg enters, nods. "I'll be right with you, Mr. Thomas." |
| 2 | `shop` | playable | Free-roam the shop. Do the actual repair, walk Ms. Ellis out, come back to Oleg. |
| 3 | `c2_brief` | cutscene | Oleg's briefing. Briefcase: burner phone, first-class tickets, coveralls + badge, driver set, the "key". |
| 4 | `c3_flight` | cutscene | First class, night, dossier on the burner. |
| 5 | `hotel` | playable | Meridian Grand, Prague. Cover: contracted IT tech "T. Beckett". Reach the service core. |
| 6 | `vault` | playable | The server vault. Take down HALCYON. |
| 7 | `escape` | playable | Timed exfil. |
| 8 | `c7_home` | cutscene | Home. The cat. Ms. Ellis returns. Credits. |

**Canon names — spell them exactly:**

* **Steve** — the player. Calm, dry, kind to customers. Never raises his voice.
* **Oleg** — the handler. Broad, unhurried, economical with words. In the shop
  he is "Mr. Thomas". Slavic cadence.
* **Ms. Ellis** — 93, widow, Windows 98 beige tower, a Buick in the car park.
* **Kernel** — Steve's cat. Grey tabby. Sleeps on the warm PSU. Interactive.
* **HALCYON** — the target. Not a person: an air-gapped identity ledger that
  sells the names of retired assets. Housed in the Meridian Grand's vault.
* **Nikolai Brandt** — "the Archivist", HALCYON's owner. Seen only on screens.
* **Meridian Grand Hotel** — Prague. Marble, brass, 1930s, bad WiFi.

**Tone:** understated competence. The comedy is in the contrast — a man who
can drop a corporate ledger also has to explain to Ms. Ellis, again, that the
computer is not "out of internet". Violence stays off-screen and technical:
Steve's weapon is a screwdriver and a boot USB. No gore, no gunplay.

---

## 6. Asset manifest

Every name here is a contract. If you own the module, you implement **all** of
your rows. If you consume, you may call any of them.

### 6.1 `SG.tex.*` — `fn(opts) -> THREE.Texture` (memoised)

`wood, laminate, carpetOffice, carpetHotel, concrete, drywall, ceilingTile,
plasterCeiling, brickPainted, tileFloor, marbleFloor, marbleWall, steelBrushed,
steelPainted, aluminium, beigePlastic, blackPlastic, rubber, fabricSeat,
cardboard, paper, pcb, silicon, copperTrace, dust, grime, noise, scratches,
skin, hairGrey, hairBrown, denim, cotton, coverallBlue, suitWool, catFur,
screenCRT, screenLCD, screenTerminal, posterA, posterB, posterC, signShop,
signHotel, labelPart, keycapSet, ceilingLightPanel, asphalt, skyGradient,
nightCity, cloudSprite, particleSoft, glassDirty`

Plus:
* `SG.tex.normalFrom(canvasTexture, strength)` — derive a normal map.
* `SG.tex.roughFrom(canvasTexture, lo, hi)` — derive a roughness map.
* `SG.tex.text(str, opts)` — text on a transparent canvas → texture. Used for
  every label, sign, screen line and poster in the game.
* `SG.tex.screen(drawFn, w, h)` — returns `{texture, ctx, update()}` so a
  monitor can animate. Call `update()` at most 10 Hz.

### 6.2 `SG.mat.*` — `fn(opts) -> THREE.Material` (memoised, shared)

One per texture family above, plus `emissive(colour, intensity)`,
`glass(opts)`, `chrome()`, `matte(colour)`, `plastic(colour)`, `metal(colour)`.

### 6.3 `SG.models.*` — `fn(opts) -> THREE.Group` (fresh instance each call)

Shop: `benchTable, shelfUnit, partsBin, pcTowerBeige, pcTowerGaming,
pcTowerOpen, motherboard, ramStick, gpuCard, psu, hdd, ssd, cpuChip,
heatsink, caseFan, cr2032, screwdriverSet, multimeter, solderStation,
antistaticMat, cableCoil, keyboardBeige, keyboardMech, mouseBall, crtMonitor,
lcdMonitor, laptopOld, laptopModern, printerOld, routerBox, ups, toolChest,
counterDesk, cashRegister, waitingChair, coffeeMug, coffeeMaker, rubberDuck,
deskLamp, ceilingLightStrip, doorGlass, doorSteel, windowShop, blindsSlat,
poster, whiteboard, calendar, clockWall, plantPotted, binMetal, cardboardBox,
catBed, boxOfScrews, floppyBox, cdSpindle, tapeDrive, vhsTape`

Travel / hotel: `briefcase, phoneBurner, ticketFirstClass, dossierFolder,
badgeLanyard, coverallsFolded, planeSeatFirst, planeCabinShell, planeWindow,
trolleyCart, hotelDesk, hotelLamp, hotelSofa, chandelier, marbleColumn,
elevatorDoors, elevatorPanel, keycardReader, luggageCart, potPalm, rugPersian,
paintingFramed, fireExtinguisher, ductGrille, ladderRung, doorFireExit,
signExit, cctvCamera, serverRack, serverBlade, patchPanel, cableTray,
fiberBundle, upsCabinet, crac (cooling unit), raisedFloorTile, kvmConsole,
tapeLibrary, halcyonCore, thermiteCharge, laundryVan, streetLamp, cobbleStreet`

Every model MUST:
* be built around the origin with **+Y up** and **feet/base at y = 0**,
* face **+Z**,
* set `userData.size = {x,y,z}` (its bounding box), and
* set `castShadow`/`receiveShadow` sensibly on its meshes.

### 6.4 `SG.chars.*` — `fn(opts) -> CharacterRig`

`steve, oleg, msEllis, guard, concierge, passenger, cat`

A `CharacterRig` is:

```js
{
  root,          // THREE.Group, feet at y=0, facing +Z
  bones: {...},  // named joints you can rotate
  height,        // metres
  play(clipName, opts),   // 'idle','walk','run','crouch','sit','work','carry',
                          // 'point','nod','handshake','type','sleep' (cat)
  update(dt),             // advance the current clip
  lookAt(vec3),           // head/neck aim, clamped
  setSpeed(mps)           // blends idle<->walk<->run
}
```

Animation is **procedural** — sine-driven joint rotation with proper phase
offsets, weight shift, arm counter-swing, and a small vertical bob. No
keyframe data, no skinning required: segmented rigid limbs parented in a
hierarchy is fine and reads well at gameplay distance. Heads get a simple
blendshape-free jaw bone that `SG.voice` drives while a line is speaking.

### 6.5 `SG.audio.*`

```
init()                       // must be called from a user gesture
sfx(name, opts)              // opts: {vol, rate, pos:Vector3, delay}
music(trackId, opts)         // crossfades; trackId or null to stop
stinger(name)                // one-shot musical hit for cutscenes
setListener(camera)
setBus(name, volume)         // 'master','music','sfx','voice'
```

SFX names (all synthesised — oscillators, filtered noise, convolution-free
reverb via feedback delay networks):

`doorChime, doorOpen, doorClose, doorSteel, footstepCarpet, footstepTile,
footstepMetal, footstepGravel, screwdriver, screwDrop, caseOpen, caseClose,
clipSnap, fanSpin, fanWhine, hddSeek, floppySeek, crtOn, crtOff, crtHum,
beepPost, beepError, beepConfirm, keyType, mouseClick, uiHover, uiSelect,
uiBack, paperRustle, briefcaseLatch, phoneVibrate, phoneRing, zipperPull,
catMeow, catPurr, catJump, coffeePour, sipDrink, cashRegister, clockTick,
elevatorDing, elevatorMotor, badgeAccept, badgeDeny, alarmKlaxon, alarmSoft,
serverRoomHum, relayClick, sparkArc, glassBreak, metalClang, radioStatic,
planeCabinHum, planeChime, seatbeltClick, cityAmbience, rainLight, wind,
heartbeat, breathHeavy, whoosh, thud, cameraShutter, tapeWhir, voiceBlip`

Music tracks (procedural, generative, loopable, each with its own key/tempo):
`titleTheme` (warm Rhodes + upright bass), `shopAmbient` (dusty lo-fi,
brushed kit, 78 bpm), `briefing` (low strings + ticking clock, tension),
`flight` (ambient pad + turbine bed), `infiltration` (pulsing bass, 96 bpm,
muted), `vault` (cold arpeggio + server hum, 120 bpm), `alarm` (driving,
132 bpm), `credits` (the shop theme, resolved, in a major key).

### 6.6 `SG.voice.*`

```
init()
say(lineId | {speaker, text, emotion}) -> Promise   // resolves when finished
cancel()
isSpeaking()
setEnabled(bool)
```

Uses **`window.speechSynthesis`** — no network, no API keys. Per-character
voice profiles (voice pick by lang/name heuristics, plus pitch + rate):

| Speaker | pitch | rate | notes |
|---|---|---|---|
| steve | 0.95 | 0.98 | calm, even |
| oleg | 0.62 | 0.84 | low, unhurried |
| ellis | 1.45 | 0.80 | thin, warm |
| guard | 0.85 | 1.05 | clipped |
| concierge | 1.10 | 1.00 | polished |
| halcyon | 0.45 | 1.20 | flat, synthetic |
| pa | 1.20 | 0.95 | tannoy, filtered |
| phone | 0.90 | 1.02 | thin, band-limited |

**Fallback is mandatory.** If `speechSynthesis` is missing, has no voices, or
is silently blocked (iOS is hostile here), fall back to a per-syllable
`voiceBlip` from `SG.audio` pitched to the speaker's profile, timed to the
subtitle's reveal. The game must be fully playable and fully comprehensible
with audio entirely off — subtitles are always shown.

### 6.7 `SG.phys.*`

A small deterministic collision world. No third-party physics.

```
world.reset()
world.addBox(cx,cy,cz, hx,hy,hz, yaw, tag)   -> id     // OBB about Y only
world.addRamp(...)                                     // for stairs
world.removeBody(id)
world.raycast(origin, dir, maxDist) -> {hit, point, normal, tag} | null
world.sphereCast(origin, dir, radius, maxDist)
world.moveCapsule(pos, vel, radius, height, dt) -> {pos, grounded, normal, hits}
```

`moveCapsule` must do **swept collide-and-slide with up to 4 depenetration
passes**, step-up over obstacles ≤ 0.30 m, slope limit 50°, and separate
horizontal/vertical resolution so the player never sticks to walls or jitters
on corners. Gravity is −9.81 m/s². Acceleration is force-based with ground
friction (µ ≈ 8 /s) and a much lower air control factor (0.25). Head bob and
foot IK are the character controller's job, not the collision world's.

### 6.8 `SG.input.*`

```
init(domElement)
update()                 // call once per frame, before gameplay
axes.move  {x, y}        // -1..1, WASD or left stick
axes.look  {x, y}        // delta this frame, radians
down(action) / pressed(action) / released(action)
```

Actions: `interact, sprint, crouch, jump, cancel, pause, look, zoom, flash,
inventory, hint`.

**Mobile is a first-class citizen, not a port.**
* Left half of the screen: floating virtual stick (appears where you touch).
* Right half: drag to look, with a sensible dead-zone and 1:1 feel.
* Context button (bottom-right, thumb-reachable, ≥ 64 px) that shows the
  current interaction verb, plus small sprint/crouch buttons.
* All UI text ≥ 16 px, all tap targets ≥ 44 px, safe-area insets respected
  (`env(safe-area-inset-*)`), no hover-only affordances, no double-tap zoom,
  landscape and portrait both handled, and a "rotate your device" nudge
  (never a hard block).
* Gyro is opt-in only, off by default.

### 6.9 `SG.ui.*`

```
init()
hud.objective(text) / hud.objectives(list) / hud.completeObjective(id)
hud.prompt(text | null)          // "E — Open the case" / tap hint on mobile
hud.subtitle(speaker, text, opts)
hud.toast(text, icon)
hud.crosshair(on)
hud.timer(seconds | null)
hud.progress(label, t | null)
menu.title() / menu.pause() / menu.settings() / menu.chapters()
letterbox(on, ms)
fade(toBlack, ms) -> Promise
flash(colour, ms)
```

The visual language: thin monospaced type, hairline rules, a single accent
colour (`#39d98a` phosphor green) against near-black, everything with a
faint scanline. It should feel like a diagnostic overlay, not a video-game
HUD. Full keyboard navigation AND full touch operation. Respect
`prefers-reduced-motion`.

### 6.10 `SG.fx.*`

Hand-written post-processing — **no `EffectComposer`, no `examples/` imports**,
because only the core Three.js build is inlined. Render the scene to a
`WebGLRenderTarget`, then run fullscreen-quad shader passes:

```
init(renderer, scene, camera)
resize(w,h)
render(dt)
set(name, value)         // 'bloom','grain','vignette','ca','dof','scanline',
                         // 'exposure','saturation','fadeToBlack','glitch'
pulse(name, amount, ms)
```

Bloom is a threshold + separable blur at ¼ resolution. Grain is animated.
Chromatic aberration is radial and subtle. DOF is a cheap two-tap circle
of confusion, used only in cutscenes. On `SG.quality === 'low'`, collapse to
grain + vignette only and skip the extra targets entirely.

### 6.11 `SG.cinema.*`

```
register(id, definition)
play(id) -> Promise      // resolves when the cutscene finishes or is skipped
skip()
isPlaying()
```

A cutscene definition is a timeline of beats:

```js
{
  id: 'c2_brief',
  music: 'briefing',
  letterbox: true,
  shots: [
    { t: 0,   cam: {from:[...], to:[...], lookFrom:[...], lookTo:[...],
                    fov: 38, dur: 6.5, ease: 'inOutCubic', shake: 0.02 },
      dof: 2.4, fx: {grain: 0.3} },
    ...
  ],
  beats: [
    { t: 0.4, say: 'c2.oleg.1' },
    { t: 5.0, sfx: 'briefcaseLatch' },
    { t: 5.2, action: function (ctx) { ctx.props.briefcase.open(); } },
    ...
  ]
}
```

The player can skip with Esc / a tap-and-hold on mobile; skipping must leave
the world in the exact state the cutscene would have left it in (run every
remaining `action` immediately). **Dialogue is always subtitled**, TTS or not.

### 6.12 `SG.script.*`

All dialogue lives here as data — `SG.script.lines[id] = {speaker, text}` —
so the cinema and the levels both reference lines by id. Write it well: dry,
specific, never expository for its own sake. Ms. Ellis should be funny
because she is real, not because she is a joke.

### 6.13 `SG.levels.*`

```js
SG.levels.shop = {
  id: 'shop',
  music: 'shopAmbient',
  build: function (ctx) { /* populate ctx.world, colliders, interactables */ },
  update: function (dt, ctx) {},
  dispose: function () {}
};
```

The `ctx` the engine hands you:

```
ctx.THREE ctx.scene ctx.world ctx.renderer ctx.camera ctx.player ctx.quality
ctx.spawn = {pos:[x,y,z], yaw}          // you set this
ctx.box(cx,cy,cz, sx,sy,sz, yaw)        // add a static collider
ctx.add(obj3d)                          // add to ctx.world
ctx.prop(name, opts)                    // = ctx.add(SG.models[name](opts))
ctx.interact({object, label, verb, radius, once, condition, onUse})
ctx.trigger({pos, radius, once, onEnter})
ctx.objectives([{id, text}])  ctx.done(id)  ctx.objective(text)
ctx.say(lineId) -> Promise              // subtitle + voice
ctx.sfx(name, opts)  ctx.music(id)
ctx.cutscene(id) -> Promise
ctx.finish()                            // advance to the next chapter
ctx.state                               // persistent save state
ctx.egg(id, description)                // register an easter egg as found
ctx.t                                   // seconds since the level started
```

---

## 7. Easter eggs (≥ 24, tracked in a findable list)

They should reward curiosity, not scavenger-hunting. A few that MUST exist:

* Petting **Kernel** the cat three times → he follows Steve for the rest of the
  level. Petting him ten times → he sits on the keyboard and types a line.
* The **rubber duck** on the bench: press it and Steve explains his current
  objective to it, out loud. (This doubles as the hint system. Good design is
  a joke you can lean on.)
* A **Windows 98** boot chime plays if you set Ms. Ellis's BIOS date to
  `01/01/2000` — the machine posts, then throws a Y2K error.
* The shop's **CRT** runs a working, playable 5-line text adventure.
* A **floppy disk** labelled `TAXES_FINAL_final_v3.DOC`.
* A drawer with a **passport for every name Steve has used**. One is "Thomas".
* The **coffee mug** says "WORLD'S OKAYEST TECH". Drinking it speeds Steve up
  for 20 s and adds a caffeine wobble to the camera.
* The **whiteboard** shows a hand-drawn network diagram; one node is labelled
  HALCYON, months before the job. Steve knew.
* A **Konami code** anywhere → wireframe mode + a debug overlay in the voice of
  a 1997 shareware readme.
* The **hotel minibar** has a €18 bottle of water; taking it triggers a toast:
  "Some clients you don't rob."
* Ms. Ellis's tower has a **sticky note with her password** under the keyboard.
  It is `password`. Steve sighs.
* In the vault, one rack is labelled **`prod-do-not-touch`**. Touching it does
  nothing. Touching it eight times crashes a screen that reads `TOLD YOU`.

Invent the rest in the same register. Log them via `ctx.egg(id, desc)`; the
pause menu shows `found / total`.

---

## 8. Definition of done

* One HTML file. Opens with a double-click. Works offline. Works on a phone.
* No console errors, no console warnings you introduced.
* No external requests of any kind (verify in the network panel: zero).
* Every subsystem degrades gracefully: no WebGL2 → WebGL1; no
  `speechSynthesis` → blips; no audio until gesture → silent but playable;
  no pointer lock → drag-to-look.
* First interactive frame within **8 s** on a mid-range phone. Generate heavy
  assets progressively behind a real loading screen that says what it is doing.
* A full playthrough, from title to credits, is possible without ever getting
  stuck. Every objective is reachable. Every door that looks openable is.
