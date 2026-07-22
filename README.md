# 🐙 Lo-Fi Octopus — Cozy AI Companion

A single-file, full-stack-in-the-browser interactive web app: a chubby orange
voxel/pixel octopus mascot that lives in a cozy lo-fi apartment, reacts to your
chat in real time, plays lofi music, changes outfits, animations, weather and
lighting — inspired by the classic Lofi Girl / Chillhop study streams.

**Everything is in one file: [`index.html`](./index.html).** Open it in any modern
browser. No build step, no assets to download — the mascot and the entire
apartment are generated procedurally with [Three.js](https://threejs.org/)
(loaded from a CDN via import maps).

## ▶️ Run it

```bash
# just open the file…
xdg-open index.html          # linux
open index.html              # macOS
# …or serve it (recommended so the YouTube music embed works):
python3 -m http.server 8080  # then visit http://localhost:8080
```

> Music uses the **Lofi Girl** YouTube radio (`jfKfPfyJRdk`). If YouTube is
> blocked/offline, the app automatically falls back to a soft WebAudio ambient
> pad so the vibe never dies.

## 🎮 What you can do

| Interaction | Result |
|---|---|
| **Type in the chat** | Octo replies with witty/sarcastic lines (browser TTS voice), triggers animations & scene changes. Try: `make it rainy`, `let's cook`, `study time`, `tell me a joke`, `dance`, `I'm Luben`. |
| **Click / tap Octo** | Random funny reaction + emote burst (music notes, sparkles). |
| **Scene / Mood** | Chill · Study · Cook · Sleep — swaps camera focus, lighting, gesture & outfit. |
| **Weather** | Clear · Rain · Snow · Night · Sunset — particles, fog, sky, color grade. |
| **Outfit** | Bare · Headphones · Chef hat · Beanie · Red glasses — swapped live. |
| **Rhythm game** | "Octo Beat" — tap the button (or Space/Enter) on the beat line. |
| **Music** | Toggle the lofi radio; Octo head-bobs and floats music notes. |
| **Subtitles / High contrast** | Accessibility toggles (subtitles on by default). |

Preferences, unlocked state, remembered name & topics persist in
`localStorage` (`octo.prefs`, `octo.memory`).

## 🧠 The AI companion

Rule-based, offline, zero-API personality engine (`respond()` in `index.html`):

- **Keyword intent matching** → scene/weather/outfit/gesture actions + themed lines.
- **Memory**: remembers your name and recent topics, references them humorously.
- **Voice**: `SpeechSynthesis` with raised pitch/rate for character. Subtitles mirror every line.

Swap in a real LLM by replacing the body of `respond()` with a `fetch()` to your
endpoint and calling `say(reply)` / the `applyMode` / `applyWeather` / `setHat`
helpers based on the model's tool call.

## 🏗️ Code structure (all inside `index.html`)

The `<script type="module">` is organized into numbered sections:

| # | Section | What it builds |
|---|---|---|
| 0 | Globals & helpers | palette, `state`, `box()` voxel factory |
| 1 | Renderer / scene / camera | WebGL, ACES tonemap, shadows, OrbitControls, per-mode camera focus |
| 2 | Lighting | ambient, hemisphere, moon (directional+shadow), lamp, desk spot, stove, fire |
| 3 | Environment | floor, walls, window (canvas sky + city parallax), desk, monitor, chair, kitchen (stove/pot/utensils/spices), fireplace, bookshelf, plants, posters |
| 4 | **Mascot rig** | body, eyes (with blink lids), brows, mouth expressions, blush, arm tentacles (3-seg IK), 7 waddle legs, headwear slot, emote sprites |
| 5 | Weather | rain/snow particle systems + CSS window overlay |
| 6 | State application | `applyMode` / `applyWeather` / `setHat` / `setExpression` |
| 7 | Animation loop | procedural idle breathing, waddle, gestures (wave/jump/nod/cook/type/read/sleep/dance), blink, music head-bob |
| 8 | Render loop | delta-timed update + render |
| 9 | AI companion | `respond()`, memory, `say()`, TTS, subtitles |
| 10 | Music | YouTube IFrame API + WebAudio fallback |
| 11 | Rhythm mini-game | falling-note tap game |
| 12 | Interaction | raycast click, UI wiring, resize, persistence |
| 13 | Post-FX + boot | grain/rain canvas textures, load, greet |

Post-processing (film grain, vignette, scanlines, chromatic aberration, warm
teal/orange color grade) is done with layered CSS overlays (`.fx`) — cheap,
mobile-friendly, and disabled by the high-contrast toggle.

## 🎨 Using real voxel models instead of procedural boxes

The mascot and props are built from `THREE.BoxGeometry` so the file stays
self-contained. To use hand-made voxel art:

1. **Model in [MagicaVoxel](https://ephtracy.github.io/)** (free). Keep the
   octopus ~20–28 voxels tall for the chunky pixel look. Export `.vox`.
2. **Import to Blender** with the
   [MagicaVoxel importer](https://github.com/technistguru/MagicaVoxel_Importer)
   add-on (or use the built-in glTF pipeline). Rig with an armature — bones for
   head, each tentacle, and 2 arms. For natural tentacles add **IK constraints**.
3. **Animate** idle/walk/wave/dance/cook/type/sleep clips (or retarget from
   [Mixamo](https://www.mixamo.com/) onto a humanoid-ish rig).
4. **Export glTF** (`.glb`, embedded). Load in-app:
   ```js
   import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
   const gltf = await new GLTFLoader().loadAsync('octo.glb');
   scene.add(gltf.scene);
   mixer = new THREE.AnimationMixer(gltf.scene);
   const clips = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]));
   // then in the loop: mixer.update(dt); and crossfade clips per state
   ```
   Replace the section-4 procedural rig and the section-7 procedural poses with
   `AnimationMixer` clip crossfades — the rest of the app (chat, weather, music,
   UI) is unchanged.
5. For **pixel-perfect edges**, set `material.flatShading = true`, use a
   nearest-filtered texture atlas, and optionally render to a low-res target and
   upscale for a true retro/CRT feel.

### Asset list (if going the authored-asset route)

- `octo.glb` — rigged mascot + animation clips (idle, walk, wave, jump, nod,
  cook, type, read, sleep, dance).
- Modular headwear meshes: chef hat, headphones, beanie, glasses, scarf, backpack.
- Room `.glb`s or a voxel scene: kitchen, living-room/fireplace, study.
- Optional textures: sky/city strip, monitor screen, spice-jar labels, posters.
- Audio: a public-domain / CC lofi loop as a local fallback to the YT stream.

## 🖼️ AI-generated outfit/pose variants (optional extension)

The prompt calls for generating new mascot sprites on demand. Hook a free image
model into a new outfit button:

```js
async function genOutfit(desc){
  const r = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',{
    method:'POST',
    headers:{ Authorization:'Bearer '+HF_TOKEN, 'Content-Type':'application/json' },
    body: JSON.stringify({ inputs:
      `pixel art lo-fi orange octopus mascot ${desc}, same style as reference, transparent background, retro voxel` })
  });
  const blob = await r.blob();               // -> texture on a billboard, or a UI thumbnail
}
```

Provide the token via a prompt/env — no keys are committed here. Degrade
gracefully when unavailable (the current build never hard-depends on any API).

## ⚙️ Tech

- **Three.js 0.160** (import map, no bundler) · WebGL2, PCF soft shadows, ACES tonemap.
- **OrbitControls** for look/zoom; auto camera-focus per mood.
- **SpeechSynthesis** (TTS) · **YouTube IFrame API** + WebAudio fallback (music).
- **localStorage** persistence · responsive + touch · high-contrast + subtitles.
- One file, zero dependencies to install.

## 🔧 Extending

- Add a mood: extend `camFocus`, `applyMode`, and a `case` in the section-7 switch.
- Add a gesture: add a `case` in `animateMascot`'s switch, trigger via `gestureOnce('name')`.
- Add outfit: build a `THREE.Group` in the `hats` map, add a `data-hat` button.
- Add intents: add a branch in `respond()` with a regex + reply + action.
- Console API: `window.OCTO.applyMode('cook')`, `OCTO.applyWeather('night')`, etc.
