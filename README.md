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
| **Type in the chat** | Octo replies with witty/sarcastic lines (browser TTS voice), triggers animations & scene changes. Try: `make it rainy`, `let's cook`, `study time`, `go outside`, `tell me a joke`, `dance`, `I'm Luben`. |
| **⚙ Settings → AI model** | Slide-out panel: paste an **OpenRouter API key**, pick from the **live model menu** (free models tagged **◆ FREE**), and Octo starts thinking with a real LLM. |
| **Click / tap Octo** | Random funny reaction + emote burst (music notes, sparkles). |
| **Scene / Mood** | Chill · Study · Cook · Sleep — swaps camera focus, lighting, gesture & outfit. |
| **Go outside** | Leaves the apartment for a starry park (bench, street lamp, trees, fireflies, falling leaves). Say “go outside” / “come inside” or use the button. |
| **Weather** | Clear · Rain · Snow · Night · Sunset — particles, fog, sky, color grade. |
| **Outfit** | Bare · Headphones · Chef hat · Beanie · Red glasses — swapped live. |
| **Rhythm game** | "Octo Beat" — tap the button (or Space/Enter) on the beat line. |
| **Music** | Toggle the lofi radio; Octo head-bobs and floats music notes. |
| **Subtitles / High contrast / Voice** | Accessibility toggles (subtitles on by default; TTS voice toggle in the panel). |

Preferences, unlocked state, remembered name & topics persist in
`localStorage` (`octo.prefs`, `octo.memory`).

## 🧠 The AI companion — two brains

Octo has a **local offline brain** and an optional **OpenRouter LLM brain**.

### Local brain (default, no key)
Rule-based, offline, zero-API personality engine (`respondLocal()` in `index.html`):
- **Keyword intent matching** → scene/weather/outfit/outside/gesture actions + themed lines.
- **Memory**: remembers your name and recent topics, references them humorously.
- **Voice**: `SpeechSynthesis` with raised pitch/rate for character. Subtitles mirror every line.

### OpenRouter brain (bring your own key)
Open the **⚙ panel**, paste an [OpenRouter key](https://openrouter.ai/keys), and pick a model.
Now Octo is powered by a real LLM and can both **chat** *and* **control its world**.

- **Live model menu** — fetched at runtime from `GET https://openrouter.ai/api/v1/models`, so it's
  always current. Free models (`pricing.prompt === "0"`) are auto-detected and tagged **◆ FREE**.
  Search, and filter by **All / Free only / Featured / Tool-capable**. A curated offline
  fallback list (current as of **July 2026** — GPT‑5.6, Claude Opus 4.8, Gemini 3.6, Grok 4.5,
  DeepSeek V4, Qwen 3.7, Llama 4, Nemotron 3, gpt‑oss, Gemma 4 …) is used if the fetch is blocked.
- **Command protocol** — Octo is instructed to answer with a single JSON envelope:
  ```json
  { "say": "beach day! watch me dance in the rain", "actions": [
      {"cmd":"weather","arg":"rain"}, {"cmd":"outside","arg":"on"}, {"cmd":"dance","arg":""} ] }
  ```
  The app parses it (tolerant of code fences / prose), speaks `say`, and dispatches each action to
  the real in-app handler via `runCommand()`. This works on **every** model — including free ones
  that lack native tool-calling — because it only relies on prompt discipline + `response_format:
  {type:"json_object"}` (with an automatic retry for models that don't accept that flag).
- **Actions Octo can trigger**: `weather` (clear/rain/snow/night/sunset), `mode`
  (chill/study/cook/sleep), `outfit` (none/headphones/chef/beanie/glasses), `music` (on/off),
  `outside` (on/off — *go outside* / come in), `dance`, `expression`, `emote`. Just talk naturally:
  *“it's gloomy, make it rain and take me outside”*, *“chef hat on, let's cook”*.
- **Privacy**: the key is stored only in your browser (`localStorage: octo.key`) and sent directly
  to OpenRouter — never anywhere else. Toggle **actions** and **voice** off in the panel any time.
- **Graceful fallback**: any API error (bad key, offline, model down) drops back to the local brain
  so the app never breaks.

Integration lives in `index.html` §9b (`SYSTEM_PROMPT`, `runCommand`, `callOpenRouter`,
`extractJSON`, async `respond`) and §12b (the model picker / settings panel).

## 🏗️ Code structure (all inside `index.html`)

The `<script type="module">` is organized into numbered sections:

| # | Section | What it builds |
|---|---|---|
| 0 | Globals & helpers | palette, `state`, `box()` voxel factory |
| 1 | Renderer / scene / camera | WebGL, ACES tonemap, shadows, OrbitControls, per-mode camera focus |
| 2 | Lighting | ambient, hemisphere, moon (directional+shadow), lamp, desk spot, stove, fire |
| 3 | Environment | floor, walls, window (canvas sky + city parallax), desk, monitor, chair, kitchen (stove/pot/utensils/spices), fireplace, bookshelf, plants, posters, **outdoor park** (sky dome, street lamp, bench, trees, fireflies) |
| 4 | **Mascot rig** | body, eyes (with blink lids), brows, mouth expressions, blush, arm tentacles (3-seg IK), 7 waddle legs, headwear slot, emote sprites |
| 5 | Weather | rain/snow particle systems + CSS window overlay |
| 6 | State application | `applyMode` / `applyWeather` / `setHat` / `setExpression` |
| 7 | Animation loop | procedural idle breathing, waddle, gestures (wave/jump/nod/cook/type/read/sleep/dance), blink, music head-bob |
| 8 | Render loop | delta-timed update + render |
| 9 | Local AI companion | `respondLocal()`, memory, `say()`, TTS, subtitles, `goOutside()` |
| 9b | **OpenRouter brain** | `SYSTEM_PROMPT`, `runCommand`, `callOpenRouter`, `extractJSON`, async `respond` router |
| 10 | Music | YouTube IFrame API + WebAudio fallback |
| 11 | Rhythm mini-game | falling-note tap game |
| 12 | Interaction | raycast click, UI wiring, resize, persistence |
| 12b | **Model picker + panel** | live `/models` fetch, free-tagging, filters/search, key save, toggles |
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

- **Three.js 0.160**, loaded with a resilient multi-CDN fallback (unpkg → esm.sh → jsdelivr) and a
  friendly error screen if all fail · WebGL2, PCF soft shadows, ACES tonemap.
- **OrbitControls** for look/zoom; auto camera-focus per mood.
- **OpenRouter** chat completions (browser-direct, CORS-ok) with JSON-command actions + live model list.
- **SpeechSynthesis** (TTS) · **YouTube IFrame API** + WebAudio fallback (music).
- **localStorage** persistence (prefs + `octo.key` + `octo.memory`) · responsive + touch · high-contrast + subtitles.
- One file, zero install. Needs internet on first load (pulls Three.js from a CDN).

## 🔧 Extending

- Add a mood: extend `camFocus`, `applyMode`, and a `case` in the section-7 switch.
- Add a gesture: add a `case` in `animateMascot`'s switch, trigger via `gestureOnce('name')`.
- Add outfit: build a `THREE.Group` in the `hats` map, add a `data-hat` button.
- Add intents: add a branch in `respond()` with a regex + reply + action.
- Console API: `window.OCTO.applyMode('cook')`, `OCTO.applyWeather('night')`, etc.
