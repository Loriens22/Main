# Code audit: why the bus is silent or nearly silent while it moves

Scope: `src/audio/AudioManager.js`, `src/audio/VoiceAnnouncer.js`, `src/game/Game.js`, `src/game/PassengerMode.js`, `src/main.js`.
Audited at git `b55e3dc`. Nothing under `src/` was modified.

How this was verified (not just read):

- Built with `OUT=<scratch>/audio_test.html node build.mjs --dev`, then run in headless Chromium 141 through `tools/shot.cjs` from a `file://` URL. That is the same way the user opens the game.
- Measured the real master output (post-compressor) with a ScriptProcessor tap while calling `audio.update()` with synthetic states.
- Where a "phone speaker" level is given, it means the RMS after a 2nd-order high-pass at 250 Hz. That is a rough model of a phone loudspeaker, which has almost no output below ~200 Hz. Phone numbers are therefore indicative, not absolute.
- Scratch scripts: `/tmp/claude-0/-home-user-Main/d0959aea-e501-5c5f-870f-1158c17cc3d1/scratchpad/` (`mini.cjs`, `wk_sim.cjs`, `mk_steps.cjs`, `steps_real.json`, `steps_road.json`, `pass.json`).

## Summary: the three root causes of "no sound while moving"

| # | Cause | Severity | Confidence |
| --- | --- | --- | --- |
| A1 | The engine AudioWorklet **cannot load on `file://`**. Chromium rejects `addModule(blob:)` with `AbortError`, so the game silently drops to a 32 Hz sawtooth fallback at gain ~0.02. | Critical | High (reproduced) |
| A2 | Even when the worklet loads, **94 % of the engine energy is below 100 Hz** (the firing fundamental is 32–90 Hz and everything is low-passed at ~150 Hz). A phone speaker cannot reproduce it. | Critical | High (measured) |
| A3 | On iOS the context is never `resume()`d inside the gesture and is never unlocked against the mute switch (`navigator.audioSession`). It also never recovers from `interrupted`/`suspended`. | High (iOS only) | Medium (from WebKit docs and bug reports, not testable here) |

The remaining items are secondary: ranges, distance model, missing sounds, pause behaviour and the iOS speech gesture.

---

## A1. AudioWorklet blob URL fails on `file://` (the user's case) — CRITICAL

- **Where:** `src/audio/AudioManager.js:113-129`, with `:114` building the URL and `:115` calling `addModule`.
- **Evidence:**
  - `tools/shot.cjs` loads the page from `file://`. Calling `await __game.audio.start()` gave `{state:'running', ready:true, hasEngine:false, fallback:true}`. The `catch` branch ran.
  - A minimal page on `file://` in HeadlessChrome 141 shows that `addModule` rejects for every blob variant tried:

    | Module URL | Result |
    | --- | --- |
    | `blob:` with type `application/javascript` | `AbortError: Unable to load a worklet's module.` |
    | `blob:` with type `text/javascript` | `AbortError` |
    | `blob:` with no type | `AbortError` |
    | `data:text/javascript;base64,…` | **ok** |

  - So the MIME type is not the problem. The `file://` opaque origin is. The WPT worklet tests also expect `file:///` module URLs to reject.
  - The code comment says "fallback: oscillator stack", but the fallback is inaudible:
    - `:119-128` is a 32 Hz sawtooth (`rpm/20`, `Game`→`:224`) through a 300 Hz low-pass with `gain.value = 0.05`.
    - `update()` then sets its gain to `volEngine 0.8 × zoneGain 0.55 × 0.05 ≈ 0.022` (`:225`).
  - Measured master output with this fallback (cab zone):

    | State | Level |
    | --- | --- |
    | Idle, engine on | **-33.7 dBFS RMS** (phone model -41) |
    | Engine off and stopped (ambience bed only) | -36.1 dBFS |
    | Driving at 30 km/h (engine + road + wind) | -32.5 dBFS |

    The engine idles only ~2.4 dB above the city-ambience bed. At 30 km/h the road alone is -34.4 dBFS. A normal game mix sits around -18 to -14 dBFS, so the whole game is ~15–20 dB too quiet.
  - On Android Chrome the same Chromium rule applies to `file://` pages, so this is the most likely reason the user hears nothing. A `content://` open from a file manager is probably the same (not tested).
- **Fix (minimum):**
  ```js
  // AudioManager.js:113-117 — try blob, then data: (works on file://)
  const toDataUrl = (src) => 'data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(src)));
  let loaded = false;
  for (const mk of [() => toDataUrl(ENGINE_WORKLET), () => URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'text/javascript' }))]) {
    try { await ctx.audioWorklet.addModule(mk()); loaded = true; break; } catch (e) { /* try next */ }
  }
  if (loaded) { this.engine = new AudioWorkletNode(ctx, 'engine-processor', { outputChannelCount: [1] }); this.engine.connect(this.engineBus); }
  else { /* native-node engine, see below */ }
  ```
- **Fix (recommended):** do not depend on AudioWorklet for the engine at all. `sound_design.md` section 3 specifies an engine built only from native nodes (PeriodicWave oscillators, biquad filters and looped noise buffers; no AudioWorklet, no WaveShaper). That works on `file://`, old Safari and low-end Android, and it removes the 500 ms `addModule` wait. If the worklet is kept, it is only an optional quality upgrade behind the data-URL loader above.
- **Fix (the fallback must not be silent):** whatever remains as a fallback needs a fundamental that a phone can play. Use at least the 150–400 Hz harmonics (the PeriodicWave recipe in `sound_design.md` section 3.2) and real gain, not `0.05`.

## A2. Engine spectrum is below 100 Hz — inaudible on a phone speaker — CRITICAL

- **Where:** worklet DSP, `src/audio/AudioManager.js:25-57`:
  - `:32` firing frequency `rpm/20` (32.5 Hz at idle, 65 Hz at 1300 rpm, 90 Hz at 1800 rpm);
  - `:43-46` two one-pole low-passes at cut = 0.02..0.08 per sample, i.e. about 150–600 Hz corner;
  - `:48-49` sub-harmonic at `fire*0.5` (16 Hz at idle);
  - `:227` `engineFilter` low-pass at 900 Hz (cab) / 1300 Hz (cabin) / 2600 Hz (outside).
- **Evidence.** I ran the worklet code in Node, unit gain, and also in the page (worklet forced to load with a data URL, so this is what a desktop browser with `http://` would hear):

  | rpm / load | Share of energy 0-100 Hz | Share above 150 Hz |
  | --- | --- | --- |
  | 650 / 0.1 (idle) | **93.3 %** | 3.7 % |
  | 900 / 0.3 | 86.7 % | 7 % |
  | 1300 / 0.6 | 71.5 % | 13 % |
  | 1800 / 1.0 | 70.8 % | 29 % |

  End-to-end, post-compressor, in-page, with the worklet working:

  | Zone and state | Total RMS | Phone-model RMS | Energy < 100 Hz |
  | --- | --- | --- | --- |
  | Cab, idle | -18.0 dBFS | **-35.1 dBFS** | 94 % |
  | Cab, 30 km/h | -15.4 | -26.1 | 70 % |
  | Front cabin, 30 km/h | -16.2 | -27.2 | 72 % |
  | Rear cabin, 30 km/h | -11.1 | -22.4 | 72 % |
  | Outside 10 m, 30 km/h | -12.3 | -23.1 | 72 % |

  So even in the best case a phone loses 11–17 dB, and at idle it loses 17 dB.
- **Why:** the model is a physically plausible pressure pulse, but a real engine heard in a cabin or from a phone is carried by the 150–1000 Hz harmonics, the intake and exhaust resonances, and the structure-borne rattle. These do not exist here: `turbo` is 0.012 amplitude, `mech` is 0.035, and `body` is a smoothed pulse.
- **Fix:** replace the DSP with the design in `sound_design.md` section 3: a harmonic stack with explicit weights, formant filters, and a +10 to +18 dB tilt between 150 and 500 Hz. Target at least 60 % of the energy above 120 Hz at every rpm. The test is the same band analysis used above, which `sound_design.md` section 11 re-specifies.

## A3. iOS: context not resumed in the gesture; mute switch not defeated; no interruption recovery — HIGH on iOS

All of this is from WebKit behaviour and bug reports. It could not be reproduced here, so confidence is medium.

1. **No `ctx.resume()` on first start.**
   - `src/audio/AudioManager.js:75-82`: `start()` creates the context and never calls `resume()`. The only `resume()` is the re-entry path at `:77`.
   - On iOS Safari a new context is `suspended` until `resume()` is called, or a source node `start()`s, **synchronously inside the touch or click handler**.
   - Here, all `src.start()` calls (`:131-143`) happen **after** `await ctx.audioWorklet.addModule(url)` (`:115`), i.e. outside the gesture.
   - Result on iOS: the context stays suspended and nothing is ever audible.
   - **Fix:** in `start()`, before any `await`, call `ctx.resume()`, then start a one-sample silent buffer source. Create the whole node graph and call all `.start()`s synchronously; only the optional worklet should be awaited, and it connects later. See the patch at the end of this section.
2. **Hardware silent switch.**
   - Web Audio on iOS is silenced by the ringer switch unless the audio session category is `playback`. Nothing sets it (`grep audioSession src` returns nothing).
   - The WebKit default is `ambient`, which obeys the mute switch.
   - **Fix:** `navigator.audioSession.type = 'playback'` (guarded: `if ('audioSession' in navigator)`). For iOS versions without it, play a silent looping `<audio>` element from a data/blob URL inside the gesture. This is the "unmute" trick; see the patch below.
3. **Page hidden, phone locked, call, Siri, route change.**
   - `src/main.js:192-194`: `visibilitychange` only pauses the game.
   - `src/main.js:145`: `onResume` only unpauses. Neither touches the context.
   - Safari moves the context to `interrupted` (or `suspended`) and it stays silent for the rest of the session.
   - **Fix:** listen to `ctx.onstatechange` and `visibilitychange`, and call `ctx.resume()` on the next `pointerdown`/`touchend`/`keydown` whenever `ctx.state !== 'running'`.
   - Also `resume()` from `onResume` (the Resume button is a gesture).

Patch for 1 + 2 + 3 (drop-in for the top of `AudioManager.start()`; everything before the first `await`):

```js
start() {                      // not `async`: keep creation + resume synchronous
  if (this.ctx) { this.unlock(); return Promise.resolve(); }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  try { if ('audioSession' in navigator) navigator.audioSession.type = 'playback'; } catch (e) {}
  const ctx = (this.ctx = new Ctx({ latencyHint: 'playback' })); // see B6
  ctx.resume();                                                    // inside the gesture
  const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
  s.buffer = b; s.connect(ctx.destination); s.start(0);            // classic iOS unlock
  this.silentEl = this.makeSilentAudio();                          // mute-switch fallback
  ctx.onstatechange = () => { if (ctx.state !== 'running' && ctx.state !== 'closed') this.needUnlock = true; };
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => addEventListener(ev, () => this.unlock(), { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) this.unlock(); });
  /* ...build the whole graph and start all loops/oscillators here, synchronously... */
  return this.loadOptionalWorklet();   // the only awaited part
}
unlock() {
  if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  if (this.silentEl && this.silentEl.paused) this.silentEl.play().catch(() => {});
}
makeSilentAudio() {            // 0.25 s of silence, 8-bit mono 8 kHz WAV built at runtime
  const n = 2000, buf = new Uint8Array(44 + n).fill(128), dv = new DataView(buf.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  a.loop = true; a.play().catch(() => {}); return a;
}
```

In `src/main.js:100-104`, `onStart` already runs inside the click handler up to `await audio.start()`. With the patch, `start()` does its gesture work synchronously, so this call order is fine.

---

## B. Secondary defects (ordered by impact)

### B1. Distance model: the bus is inaudible until 120 m, and only one bus ever makes sound — HIGH for passenger mode
- **Where:** `AudioManager.js:215` `nearBus = max(0, 1 - dist/120)`; `:218` `0.9 * nearBus`; `Game.js:490-497` passes `this.bus` only.
- **Evidence** (headless passenger mode, stop 3, `pass.json`):
  - the approaching 280 is 542 m away at t=10 s and 203 m at t=40 s, so its engine gain is 0 for the whole approach;
  - at 67 m, `nearBus` is 0.44 (-7 dB);
  - `PassengerMode.js:138-139` sets `g.bus` to the ridden or nearest bus only, so the other 280 buses (`g.extra`), the player's own passed-by bus and all AI cars make no sound.
- Real city-bus engines are clearly audible at 150 m or more.
- **Fix:** use an inverse-distance model per source with a floor. For each bus in `allBuses()`: `gain_dB = -7 - 20*log10(max(d, 6)/6) - 0.012*max(0, d-6)` (-6 dB per doubling from 6 m, -7 dB being the 6 m reference level), plus a low-pass that closes with distance: `fc = clamp(6500*(8/max(d, 8))^0.55, 900, 6500)`. Add a small pool (nearest 3 buses get a voice), a Doppler pitch shift (`1200*log2(343/(343-vr))` cents) and a stereo pan from the camera's right vector. `sound_design.md` section 6 gives the numbers.

### B2. No engine-start, shift, retarder, brake-release or kneeling sounds — HIGH (the request says "no good sound effects")
- `Game.js:113` `bus.phys.onShift = () => {}` — gear shifts are silent. `ArticulatedBus.js` already calls `onShift(gear, 'up'|'down')`.
- `Game.js:199` starting the engine plays only `hiss(0.3, 0.05, 900)` at gain 0.05 (≈ -26 dB, inaudible). There is no starter and no cranking.
- `ArticulatedBus.js:249-250` has a `kneel` state, but no audio hook exists.
- The brake-release "pssst" exists only for the player's `P` key (`Game.js:206`). Nothing fires it at stops (when the bus stops, or when the parking or hold brake releases), for AI buses, or for the retarder.
- No transmission whine, no turbo whistle, no tyre squeal.
- **Fix:** wire an `onShift` handler to `audio.shift(gear, dir, bus)`, expose `phys.kneel` edges, `phys.stopBrake` edges and `parkingBrake` edges as events (each bus, not just the player's), and implement the one-shot recipes in `sound_design.md` section 8.

### B3. Pausing does not silence the audio — MEDIUM
- `Game.js:129-132`: when `paused`, `update()` returns before `updateAudio()`. The engine, road and wind keep their last values and drone while the pause menu is open. An announcement can also complete.
- **Fix:** in `update()`, when pausing, call `audio.setPaused(true)`, which ramps `master.gain` to 0.15 over 0.15 s (or `ctx.suspend()`), and resume on unpause.

### B4. Speech announcements on iOS and the silent switch — MEDIUM
- `VoiceAnnouncer.js:69`: `setTimeout(...)`, then `:77-92` `synth.cancel(); synth.speak(u)` from a timer. iOS Safari ignores `speak()` until one `speak()` has been made from a user gesture.
- `src/data/voice-clips.json` is `{}` (3 bytes), so the game always relies on `speechSynthesis`. Android needs the Google bg-BG voice installed; iOS has *Daria*.
- `speechSynthesis` also routes differently from Web Audio and is not affected by `navigator.audioSession` on all versions.
- **Fix:** in `AudioManager.start()` call `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` once, inside the gesture, to prime it. The real fix is bundled clips: the build step already exists (`tools/generate_announcements.py`). The chime alone does play, since it is Web Audio.

### B5. Compressor ducks the mix because of the sub-bass — LOW/MEDIUM
- `AudioManager.js:84-87`: `DynamicsCompressor` threshold -16 dB, ratio 4, default knee 30 dB, attack 3 ms, release 250 ms. The unit-gain worklet RMS is -5 to -0.5 dB (script `wk_sim.cjs`), and `update()` gives it `ev × zoneGain × 0.55`, so the compressor acts on LF energy that the phone cannot play, pulling down everything else (voice, beeps, road).
- **Fix:** with the new engine spectrum (section 3 in `sound_design.md`), set threshold -10 dB, knee 12, ratio 3, attack 0.01 s, release 0.25 s (section 2.3). The prototype voices peak at -0.9 dBFS (rear cabin, full load) and -6 dBFS (cab) before the master, so the compressor only trims transients.

### B6. `latencyHint: 'interactive'` on a busy phone — LOW/MEDIUM
- `AudioManager.js:82`. Heavy WebGL frames on a mid-range phone can starve the audio thread (crackle, dropouts, iOS ~10 ms buffers).
- **Fix:** `latencyHint: 'playback'` (a ~100–200 ms buffer is irrelevant for engine hum; one-shots should be scheduled by `ctx.currentTime` as they already are).

### B7. Per-source parameter issues — LOW
- `AudioManager.js:249-250` compressor sound is a constant 160 Hz-band brown-noise "drone" at 0.09 while `compressorOn`. A real compressor chugs (piston strokes at roughly 10-20 Hz at idle to cruise rpm, with valve chatter on top) and does not hum. Replace with the pulsed recipe in `sound_design.md` section 8.8.
- `AudioManager.js:233` road noise is a bandpass at `250 + v*35` Hz with a white-noise buffer at gain `sv*0.22*0.55`. At 30 km/h that is -34 dBFS; at 50 km/h -31 dBFS (measured, cab, engine off). It needs +10 dB and a 2-band structure (low rumble 80–200 Hz plus mid hiss 800–2500 Hz) so it is audible on a phone.
- `AudioManager.js:238` wind starts only above 6 m/s and tops out at (13.9-6)×0.006 = 0.047. It is fine as a background but not as the thing that tells the user the bus is moving.
- `AudioManager.js:131-137` all loops use `playbackRate 0.9..1.1` random. This is fine, but the `noiseBuf` is 2.5 s of white noise (audible loop point when low-passed). Use 6 s of pink noise.
- `AudioManager.js:363` the indicator tick is a 18 ms square pulse at gain 0.05 (outside 0.015). Real relays are a double click (see `sound_design.md` section 8.7). Level is too low for a phone.
- `AudioManager.js:300-313` door beeps: `vol*0.22` square through a Q 3 band-pass at 1850 Hz. Audible, but it is two identical beeps 0.42 s apart; the actual MAN pattern is researched in `sound_design.md` section 8.2 (confidence is low for the exact pitch).
- `AudioManager.js:421-425` stop bell: one 1318 Hz sine at gain 0.12. Sofia buses use a two-note "ding-dong" style chime; see section 8.3 (low-medium confidence).

### B8. Engine silent after start in driver mode until `I` is pressed — LOW (by design, but surprising)
- `Game.js:88` `bus.phys.engineOn = false`; the engine bus gain is multiplied by `st.engineOn ? 1 : 0` (`AudioManager.js:217`). The touch button "Запал." exists (`TouchControls.js:179`), but a first-time phone player sees a moving-looking scene with no sound until they find it.
- **Fix:** show the checklist toast on touch, or play the idle at low level before cranking. The design in `sound_design.md` section 7 handles engine-off, cranking, catch and idle explicitly.

### B9. The zone model is too coarse — MEDIUM
- `AudioManager.js:218`: engine gain 0.55 (cab), 0.5 (front cabin), 0.95 (rear cabin), 0.9·nearBus (outside), with a single low-pass (900/1300/2600 Hz).
- Real differences are mostly spectral: the cab has the engine behind two sections of structure, the rear passenger area sits right in front of the engine bay, and the outside has intake and exhaust at the rear corner. There is no cabin boom resonance and no rear-engine-cover rattle.
- **Fix:** five zones, with explicit per-zone EQ and gain tables: `sound_design.md` section 6.

---

## What was checked and is fine

| Check | Result |
| --- | --- |
| Passenger mode feeds the ridden AI bus's rpm/load to the engine | Yes. `Game.js:490-497` uses `this.bus`, which `PassengerMode.js:138` sets to the ridden bus. Logged `rpm` 946–1524, `load` 0–1, `engineOn: true` for `AIBusDriver` buses (`AIBusDriver.js:20`). |
| Engine gain zero in some mode | No; only when `engineOn` is false (driver start, `I` toggles it). |
| Parameter ranges | `rpm` 0–3000, `load` 0–1 and `gain` 0–2 match what is sent. `fire = max(1, rpm/20)` is the correct inline-six 4-stroke formula (`rpm/60*3`). |
| Door sound events for AI buses | `wireBus` (`Game.js:106-114`) is called for each spawned bus; `doorEvent` runs when the listener is within 200 m. |
| `ctx.sampleRate`-dependent buffers | Sized from `ctx.sampleRate`, so 44.1/48 kHz are both fine. |
| Second `start()` call | Safe (`:76-79` returns early; `ready` is set when the first call completes). |
| Zone switching | `setZone` is called every frame in driver (`Game.js:281`) and passenger (`PassengerMode.js:218, 349`) modes. |

## Suggested order of work for the implementer

1. A1 + A3: synchronous gesture work in `start()`, a native-node engine, and the data-URL loader only if a worklet is kept.
2. A2: the new engine voice and the 5-zone mix from `sound_design.md`, with the in-page band test as the acceptance check.
3. B1: per-bus voices with inverse-distance gain.
4. B2: the shift, start, brake-release, kneel and compressor events and one-shot recipes.
5. B3-B9 as time allows.
