# Sound design: MAN Lion's City G CNG (Sofia 280), procedural WebAudio

This is an implementable synthesis spec. Nothing in `src/` was changed. The reference implementation is **`proto/BusSynthProto.js`** (native WebAudio nodes only), and every number in this document was run and measured with `proto/render.cjs` in headless Chromium (`OfflineAudioContext`, 24 kHz). **If prose and code disagree, the code is right**, because it is the version that was measured.

Companion files in this folder:

| File | What it is |
| --- | --- |
| `code_audit.md` | Why the current game is silent while moving, with fixes (read first) |
| `proto/BusSynthProto.js` | `BusVoice` (engine, driveline, road, wind, AC bed, compressor), `OneShots`, `Events`, `ZONES`, noise buffers |
| `proto/render.cjs` | Offline renderer and analyser (band shares, phone-speaker level); writes WAVs and `metrics.json` |
| `proto/metrics.json`, `proto/metrics_summary.txt`, `proto/snr_table.tsv` | Measured levels quoted below |
| `previews/*.wav` | `drive_cab`, `drive_rear`, `drive_out6` (26 s drive cycle), `passby_12ms`, `engine_start_rear`, `oneshots_sequence` (24 kHz, mono). I could not listen to them, so please judge by ear |

## 0. The three fixes at a glance

1. **`file://` worklet failure.** Chromium rejects `audioWorklet.addModule(blob:)` from a `file://` page (reproduced: `AbortError` for blob URLs of every MIME type; a `data:` URL works). The design removes the dependency: the engine is native nodes (section 3). If a worklet is ever reintroduced it must be loaded like this, and never be the only engine:
   ```js
   const toDataUrl = (src) => 'data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(src)));
   try { await ctx.audioWorklet.addModule(toDataUrl(SRC)); /* connect node */ } catch (e) { /* native BusVoice keeps playing */ }
   ```
2. **iOS unlock and resume.** `AudioManager.start()` must create the context, call `ctx.resume()`, play a one-sample silent buffer, set `navigator.audioSession.type = 'playback'`, start a silent looping `<audio>`, build the whole graph and call every `.start()` **before the first `await`**, and register `unlock()` on `pointerdown`/`touchend`/`keydown`/`visibilitychange`/`statechange`. Full code: `code_audit.md` section A3 ("Patch for 1 + 2 + 3"). Pause: `setPaused()` (2.6).
3. **Phone-speaker audibility.** The old engine had 93 % of its idle energy below 100 Hz; a phone speaker removes about 17 dB of that. The new engine tilts the fundamentals down (150 Hz low-shelf, -10 dB), carries the note on 150–800 Hz harmonics (formants at 190, 410, 760 Hz), adds 1–4 kHz texture (roar, injector tick, turbo, tyre hiss), and sets levels so that the phone-weighted RMS in the cab is -28.9 dBFS at idle and -22.1 dBFS at 50 km/h (the old file:// fallback measured -41 and -38). Sections 3, 9 and 10.

Legend: **confidence** is high / medium / low. **Basis** is a source URL, "repo" (this codebase), "measured" (my headless runs), or "inferred" (typology / physics).

---

## 1. Reference facts (research)

WebFetch could not reach `automotiveworld.com`, `man.eu` or `press.mantruckandbus.com` (`ENOTFOUND`), so the facts below come from WebSearch snippets only. No reachable source documents Sofia-specific door beeps, bell or announcement audio. Those are the weakest parts of the design and are parametrised on purpose.

| Fact | Value | Basis | Confidence |
| --- | --- | --- | --- |
| Engine | MAN E2876 LUH07, 12.8 l (12,816 cc) inline-six, turbocharged, intercooled, spark-ignited CNG; 3-way catalyst; rated 228 kW (310 hp) at 2,000 rpm; 1,250 Nm at 1,000–1,700 rpm | [Bus & Coach Buyer, Lion's City GL CNG](https://www.busandcoachbuyer.com/?p=9030) | High |
| Engine variants | 200 or 228 kW CNG; the 228 kW unit is the one offered on the articulated G | [auto.cz MAN CNG brochure summary](https://www.auto.cz/autobusy-man-na-cng-expanze-72019) | Medium |
| Combustion type | One German summary says lean-burn with spark plugs, the 2015 UK article says 3-way catalyst (stoichiometric). Either way: throttled, spark-ignited, no diesel knock | search snippets, conflicting | Medium |
| Idle rpm | Not found for the E2876. Neighbours: a CNG articulated six-cylinder idles at 700 rpm ([TRID Silver Line](https://trid.trb.org/View/813733)); MAN's EcoLife 2 is reported to allow idle down to 550 rpm. The repo uses 620 | search snippets, repo `ArticulatedBus.js` | Low–medium |
| Max rpm | Rated power at 2,000 rpm; repo `MAX_RPM` is 2,200 | above, repo | High |
| Firing frequency | Inline-six, 4-stroke: 3 firings per revolution = `rpm/60*3 = rpm/20` Hz. 620 rpm gives 31 Hz; 1,250 rpm gives 62.5 Hz; 2,000 rpm gives 100 Hz | physics | High |
| Gearbox in Sofia's A23 | **Not confirmed by any reachable source.** MAN fits the ZF EcoLife 6-speed as standard on Lion's City low-floor buses, with Voith DIWA.5/DIWA.6 as the alternative. The 2015 Bus-of-the-Year GL CNG had a Voith D864.5 4-speed with retarder. MAN's articulated CNG bus for EGO Ankara uses ZF EcoLife. EcoLife 2 (Nov 2020) has the retarder in the main cooling circuit | [MAN IAA 2016](https://www.automotiveworld.com/news-releases/buses-man-truck-bus-fair-iaa-2016-easy-use-efficient-accessible/), [EGO Ankara](https://cbwmagazine.com/?p=6352), [EcoLife 2](https://www.automotiveworld.com/news/the-new-gearbox-generation-ecolife-2-for-man-city-and-intercity-buses-hits-the-road/) | **Low.** Default to ZF EcoLife (the repo's 6-speed physics) and expose a `gearbox: 'ecolife' | 'diwa'` character switch |
| Sofia fleet | 126 CNG buses tendered 2013 (MAN won), then 60 more articulated MAN Lion's City G CNG announced for 2019; Wikipedia lists 186 MAN Lion's City G CNG A23 | [capital.bg](https://www.capital.bg/politika_i_ikonomika/bulgaria/2013/10/16/2162275_germanska_kompaniia_nai-veroiatno_shte_dostavi_novite/), [sofia.bg](https://www.sofia.bg/web/sofia-municipality/w/10-buses-for-the-lines-to-the-vitosha-mountain-are-arriving-in-sofia), [seenews](https://seenews.com/news/sofia-to-receive-60-new-cng-buses-by-end-of-next-week-629873) | Medium |
| Character of a CNG spark-ignited bus | Smoother and quieter than diesel (spark-ignition, encapsulation). MAN-linked claim: 74 dB vs 78 dB for a diesel bus; "CNG buses tend to be quieter" | [Gulf Industry Online](https://gulfindustryonline.com/Article/10937/MAN_bus_has_cleaner_emissions) | Medium (marketing figure) |
| Interior level | Lion's City 12 hybrid (diesel) measured at 50 km/h in 5th: **72.0 / 74.6 / 73.8 dB(A)** front / middle / rear; 60 km/h in 6th: 65.3 / 67.4 / 66.2. So the rear is only about 2 dB above the front at cruise | [Bustest 01/2020](https://www.busnetz.de/files/Bustest_01_2020.pdf) | Medium (different drivetrain) |
| Air governor | Cut-out stops the compressor and triggers the **dryer purge**; cut-in restarts it. Repo model uses 8.1 bar in, 10 bar out | [governor description](https://www.firgelliauto.com/blogs/mechanisms/air-compressor-governor), repo `AudioManager.js:241-247` | Medium |
| Door warning | The repo documents a **two-beep** warning (beep 1 at 0 s, beep 2 at 0.42 s, doors move at 0.95 s). I found no source for the real pitch or count on Sofia buses. Rail standard EN 16584-2 and UK DfT want 2 s of alarm before a rail door moves, which is not bus data | repo `DoorController.js:7-9`, [DfT sheet](https://assets.publishing.service.gov.uk/media/63481660d3bf7f618d8f8885/CL153_PRM_DfT_compliance_spreadsheet_TfW_Iss_2.pdf) | **Low** (count from repo, pitch inferred) |
| Stop-request bell | Sofia has a STOP button and sign (optional-stop lines), but I found no description of the chime | [investsofia](https://investsofia.com/en/wp-json/wp/v2/posts/32141) | **Low** (design default: two-tone) |
| Announcements | No source found for Sofia's recorded voice or whether a chime precedes it. Helsinki and Riga use female voices on buses, which is a common practice and not Sofia evidence | search | **Low** |
| Sofia yellow paving | Famous yellow brick paving in the centre. No acoustic measurements found. Joint spacing ≈ one brick length (repo uses 0.22 m) | repo `AudioManager.js:236` | Low (inferred) |

### 1.1 What it should sound like at each listening position (inferred from rear-engine articulated typology)

- **Driver's cab (about 16 m from the engine).** A dull, steady "wuuum" with a 31 Hz idle thrum carried by its 150–400 Hz harmonics, plus the gearbox clunks and relay ticks. The driver mostly hears the road, the wind, the dashboard relays, the door hisses beside him and the air valves under the floor.
- **Front passenger area.** Like the cab, plus more door and floor boom. The engine is felt more than heard.
- **Rear passenger area (the engine is behind the last seats).** The engine is clearly audible: a rougher, brighter hum with the intake whoosh, the turbo whistle under load, gearbox whine on the shift, the panel buzz of the engine cover, and the compressor chug.
- **Outside, near (3–10 m).** The exhaust and intake at the rear corner, the tailpipe "breath", gas-injector ticking, the whistle on pull-away, and the air hiss at stops. When it passes there is a Doppler shift of about ±60 cents at 12 m/s.
- **Outside, far (50 m+).** Only the low drone survives (low-pass about 1–2 kHz), with a slow swell on approach.

---

## 2. Architecture

### 2.1 Why native nodes, not an AudioWorklet
The audit showed that `addModule(blob:)` fails on `file://` (Chromium `AbortError`), so the old engine silently became a 32 Hz sawtooth. `BusVoice` uses only `OscillatorNode` + `PeriodicWave`, `AudioBufferSourceNode` (looped noise), `BiquadFilterNode`, `GainNode` and `StereoPannerNode`. It works from `file://`, in Safari, and in old Android WebViews. Measured: real-time `AudioContext` on `about:blank`, state `running`, 89 nodes per voice, RMS -17.6 dBFS. Offline render of 3 voices x 26 s took 2.1 s (8 % of real time on this machine).

### 2.2 Signal graph (per voice)
```
 oIdle/oLoad  (PeriodicWave, f = rpm/120, firing harmonics, two slopes) ─┐
 oLope        (PeriodicWave, cycle harmonics not multiple of 6)         ─┼─ tonal ─ 4 peaking "formants" ─ lowshelf(150,-10) ─ lowpass ─ engGain ─ dip ─┐
 roar (white→bp, AM at f_fire)   tick (white→bp 3 kHz, AM)   intake (pink→bp)   turbo sine + whoosh   gearbox/axle whine   retarder  ─────────────────────────┼─ engGrp (+9 dB)
 tyre low (pink→bp)  tyre high (white→bp)  cobble (velvet→bp x2)  wind  AC bed  ──────────────────────────────────────────────────────── roadGrp (+18 dB + zone.road)
 compressor chug (white→bp x pulse + pink→bp x pulse) ────────────────────────────────────────────────────────────────────────────────── engGrp
 engGrp + roadGrp → zIn → highpass → 3 peaking → lowpass → zGain → StereoPanner → engine bus
```
One-shots are separate, short-lived graphs that connect to `voice.zIn` (so they get the zone EQ) or to the sfx bus.

### 2.3 Master chain (replace `AudioManager.js:83-88`)
`master.gain = volMaster (0.9)` → `DynamicsCompressor` (threshold -10 dB, knee 12, ratio 3, attack 0.01 s, release 0.25 s) → `destination`. Add a 30 Hz high-pass in front of the compressor so that sub-bass never triggers it. Measured pre-master peaks: -0.8 dBFS at the loudest (rear cabin, full load), so the compressor only trims transients.

User sliders (`applyVolumes()`): `engineBus.gain = volEngine`, `sfxBus.gain = volSfx`, `ambBus.gain = volAmbience`, `voiceBus.gain = volVoice`, `master.gain = volMaster`. The old code applied `volEngine` inside `update()`, which would double-apply after the rewrite.

### 2.4 Gesture and resume (see `code_audit.md` A3)
`start()` must be synchronous up to the end of graph creation: `new AudioContext({latencyHint:'playback'})`, `ctx.resume()`, one silent buffer `start(0)`, `navigator.audioSession.type='playback'`, a silent looping `<audio>`, all `.start()` calls, `ready = true`. Only the *optional* worklet may be awaited. Add `unlock()` on `pointerdown`/`touchend`/`keydown`/`visibilitychange`/`statechange`, and `setPaused()`.

### 2.5 Files to add or change in `src/audio/` (exact names)

| File | Add / change |
| --- | --- |
| `src/audio/dsp.js` (new) | `dB(x)`, `clamp`, `lerp`, `rng(seed)`, `makeBuffers(ctx, seed)` (white 6 s, pink 8 s, brown 8 s, velvet 4 s, looped with an 80 ms cross-fade, RMS 0.25), `firingWave(ctx, slopeDbPerOct, kMax, rolloffK)`, `lopeWave(ctx, seed)`, `buzzWave(ctx)`, `ZONES` |
| `src/audio/BusVoice.js` (new) | `class BusVoice { constructor(ctx, dest, bufs, opt) ; setListener(t, L) ; setState(t, s) ; shift(t, up) ; dispose() }`. Port of the prototype class unchanged |
| `src/audio/OneShots.js` (new) | `OneShots.{hiss, thump, click, clunk, glide, beep, bell}` and `Events.{doorOpen, doorBeeps, doorClose, stopBell, brakeRelease, parkingRelease, kneelDown, kneelUp, dryerPurge, indicator, bump, bellowsCreak, gearSelect, starter}` |
| `src/audio/AudioManager.js` (rewrite) | See 2.6 |
| `src/audio/VoiceAnnouncer.js` | Prime `speechSynthesis` in the start gesture; duck the engine bus by -3 dB while a message plays (8.9) |

### 2.6 `AudioManager` methods (signatures)

```js
start()                                 // sync graph creation, returns Promise (see code_audit.md A3)
unlock()                                // resume ctx + silent <audio> if suspended/interrupted
setPaused(p)                            // master ramps to 0.15 in 0.15 s; restore on unpause
applyVolumes()                          // see 2.3
update(dt, S)                           // S = { listener:{zone,prox}, buses:[BusSnap], surface, weather, ambience, day, parkFactor, rainOn }
//   BusSnap = { id, focus, rpm, load, speed, engineOn, retarder, surface, comp, dist, radial, pan, section }
voiceFor(id)                            // pool: focus bus always has a voice; nearest 2 others within 150 m; others released
shift(id, gear, dir)                    // -> voice.shift(ctx.currentTime, dir==='up')
engineStart(id) / engineStop(id)        // section 7
doorEvent(e, where)                     // e.type: opening|opened|closeRequest|beep|closingStart|closed|obstruction; where:{dbOffset, lpHz}
brakeEvent(kind, where)                 // 'service'|'parkApply'|'parkRelease'|'stopApply'|'stopRelease'
kneelEvent(dir, where)                  // 'down'|'up'
purgeEvent(where)                       // dryer purge at governor cut-out
bellowsCreak(where)
indicatorTick(on, where)
stopBell(where)
gearSelect(sel)                         // 'D'|'N'|'R'
bump(speed, big)                        // Poisson-driven from update()
horn(on)                                // keep, see 8.10
chime() / announcementDuck(on)          // 8.9
```
`where` = `{ dbOffset, lpHz }` computed by `AudioManager.where(sourceSection, kind)` from the listener zone using the table in section 9.2.

---

## 3. The engine

### 3.1 Frequencies

`f_fire = rpm/20 Hz` (six firings per two revolutions). The `PeriodicWave` fundamental is the *cycle* `f_cyc = rpm/120`, so harmonic `6k` is the k-th firing harmonic and the harmonics in between are the cylinder-to-cylinder irregularity.

| rpm | f_cyc | f_fire (k=1) | k=2..8 (Hz) |
| --- | --- | --- | --- |
| 550 | 4.6 | 27.5 | 55, 82, 110, 138, 165, 192, 220 |
| 620 (idle) | 5.2 | 31.0 | 62, 93, 124, 155, 186, 217, 248 |
| 900 | 7.5 | 45.0 | 90, 135, 180, 225, 270, 315, 360 |
| 1250 (50 km/h) | 10.4 | 62.5 | 125, 188, 250, 312, 375, 438, 500 |
| 1800 | 15.0 | 90.0 | 180, 270, 360, 450, 540, 630, 720 |
| 2200 (max) | 18.3 | 110.0 | 220, 330, 440, 550, 660, 770, 880 |

At idle the first four firing harmonics (31, 62, 93, 124 Hz) are inaudible on a phone. What a phone plays is k = 5..25, i.e. 155–775 Hz. The weights below are therefore designed from the top down.

### 3.2 Harmonic stack (`firingWave`) and weights by load

`re[6k] = 10^(-slope*log2(k)/20) * exp(-k/rolloffK)` for k = 1..kMax, cos phase (impulse-like pulses), `im = 0`, `disableNormalization:false`.

| Wave | slope (dB/oct) | kMax | rolloffK | Used when |
| --- | --- | --- | --- | --- |
| `waveIdle` | 7.0 | 40 | 16 | closed throttle, idle: dull, thrumming |
| `waveLoad` | 4.2 | 48 | 26 | full load: brighter, more upper harmonics |

Resulting weights (dB relative to k=1; frequency at 620 rpm and 1250 rpm):

| k | idle | load | Hz @620 | Hz @1250 |
| --- | --- | --- | --- | --- |
| 1 | -0.5 | -0.3 | 31 | 62 |
| 2 | -8.1 | -4.9 | 62 | 125 |
| 3 | -12.7 | -7.7 | 93 | 188 |
| 4 | -16.2 | -9.7 | 124 | 250 |
| 5 | -19.0 | -11.4 | 155 | 312 |
| 6 | -21.4 | -12.9 | 186 | 375 |
| 8 | -25.3 | -15.3 | 248 | 500 |
| 10 | -28.7 | -17.3 | 310 | 625 |
| 12 | -31.6 | -19.1 | 372 | 750 |
| 16 | -36.7 | -22.1 | 496 | 1000 |
| 20 | -41.1 | -24.8 | 620 | 1250 |
| 30 | -50.6 | -30.6 | 930 | 1875 |

Crossfade by load: `lw = clamp(load*1.15, 0, 1)`; `oIdle` gain `(1-lw)*0.9`, `oLoad` gain `lw*1.0`. Both oscillators share frequency and phase, so the crossfade is coherent.

**Irregularity (`lopeWave`).** `oLope` carries the non-multiple-of-6 harmonics: h=1: 0.55, h=2: 0.70, h=3: 1.00 (the half-order thump), h=4: 0.50, h=5: 0.45, h≥7: `0.5/(1+h/6)`, all scaled by 0.6, with random but seeded phases. Gain `lerp(0.22, 0.07, lw)`, x1.15 below 900 rpm. This is the "lope" of a spark-ignited engine at idle. Two slow LFOs detune all three oscillators: 0.71 Hz at ±9 cents and 1.93 Hz at ±5 cents. Without these the engine sounds like a synthesiser. Measured side effect: the level wanders about 3 dB over a few seconds, which is intended.

### 3.3 Formants and resonances (fixed in Hz, so harmonics sweep through them as rpm changes)

| Node | Type | f (Hz) | Gain (dB) | Q | Models |
| --- | --- | --- | --- | --- | --- |
| `fm[0]` | peaking | 105 | +5 | 1.0 | block / engine mounts |
| `fm[1]` | peaking | 190 | +6 | 2.0 | exhaust pipe + silencer |
| `fm[2]` | peaking | 410 | +5 | 2.5 | intake duct / air box |
| `fm[3]` | peaking | 760 | +3 | 1.8 | body panels, engine cover |
| `fmShelf` | lowshelf | 150 | **-10** | 0.7 | phone-speaker tilt (section 10) |
| `fmLp` | lowpass | `1300 + 2400*lw` | | 0.7 | combustion brightness |

Then the zone chain (section 6): high-pass, three peaking filters, low-pass, gain.

### 3.4 Noise layers (all pre-zone dBFS, buffer RMS 0.25 already included in the gains)

| Layer | Source | Filter | Modulation | Level (idle → full load) |
| --- | --- | --- | --- | --- |
| `tonal` | PeriodicWave | cascade above | | `toneDb = lerp(-4, -3.5, lw) + 1.5*clamp((rpm-900)/900, 0, 1)` |
| `roar` (combustion) | white | bandpass `700+1000*lw`, Q 0.8 | AM by `oAM` (f_fire pulse), base 0.5 + depth 0.45 | `lerp(-21, -12, lw)` dB |
| `tick` (gas-injector / spark tick, the CNG signature) | white | bandpass 3000, Q 1.4 | AM base 0.15 + depth 0.85 | `lerp(-27, -19, lw)` dB |
| `intake` (throttle breathing) | pink | bandpass `280+220*lw`, Q 0.9 | | `lerp(-21, -10, lw)` dB |

`oAM` is a `PeriodicWave` with harmonics 1..13 at weight `1/h^0.7`, running at `f_fire`.

### 3.5 Turbo
- Boost target `bt = clamp((load-0.15)/0.85, 0, 1) * clamp((rpm-800)/700, 0, 1)`.
- Lag: `boost += (bt-boost)*(1-exp(-dt/tau))` with `tau = 0.35 s` rising and `0.9 s` falling.
- Whistle: sine at `2600 + 3400*boost` Hz, level `-50 + 18*boost + zone.turbo` dB (off when `boost < 0.02`).
- Whoosh: white → bandpass `2400 + 1600*boost` Hz, Q 1.0, level `-44 + 14*boost + zone.turbo` dB.
- `zone.turbo`: cab -4, front -4, rear +4, outside 0.
- On lift-off from `boost > 0.5` add a **flutter chirp** (not in the prototype): white → bandpass 2600→1400 Hz, Q 1.2, attack 5 ms, τ 0.18 s, -34 dB, once per lift-off. Inferred, low confidence.

### 3.6 Parameter mapping per update (`voice.setState(t, s)`)
`s = {rpm, load, speed (m/s), retarder 0..1, surface 'asphalt'|'brick', engineOn, comp (bool)}`. Every parameter is written with `setTargetAtTime(value, t, tc)`; call at most every 50 ms per voice. Time constants: frequencies 0.05 s, gains 0.05–0.25 s.

`on = engineOn && rpm > 120`. When `on` is false the engine gain targets 0 with τ 0.06 s.

### 3.7 Lite voice (not implemented in the prototype, spec only)
For the farther buses (rank 2 and 3): drop `oLope`, `roar`, `tick`, `turbo`, AC bed, compressor and the wobble LFOs; keep `oIdle`/`oLoad` crossfade, the four formants, `intake`, tyre low/high. About 35 nodes. Expected ~60 % cheaper.

---

## 4. Driveline: transmission, axle, retarder, shifts

| Sound | Formula | Level (pre-zone) | Notes |
| --- | --- | --- | --- |
| Gearbox whine (input gear mesh) | `f = 19*rpm/60` Hz (and 2x) | `-46 + zone.whine + 6*(drive-0.35)` dB, 2nd harmonic -6 dB lower; only when `speed > 0.8` | `drive = clamp(0.35+load, 0, 1.2)`. 1250 rpm gives 396 Hz. 19 teeth is an assumption |
| Axle (hypoid) whine | `f = 13 * 2.064 * v` Hz (and 2x); 2.064 = `FINAL(6.2)/(2*pi*wheelR(0.478))` | `-47 + zone.whine` dB, **x1.6 on coast** (load < 0.05); gated by `clamp((v-1.5)/6, 0, 1)` | 20 km/h = 149 Hz, 50 km/h = 373 Hz, 70 km/h = 522 Hz. 13-tooth pinion is an assumption |
| Retarder | noise → bandpass `240 + 70*v` Hz, Q 3.5 | `(-34 + 0.5*zone.whine) dB * ret^1.2`, gated `clamp(v/3, 0, 1)` | `ret = clamp(brake/0.25)` already computed by the physics (`retarder` in `ArticulatedBus.js`) |
| Gear shift (torque interruption) | `dip` gain: 1 → -5 dB in 0.08 s → 1 in 0.4 s | | `voice.shift(t, up)`; hook `bus.phys.onShift` (`Game.js:113`) |
| Shift clunk | thump 120→62 Hz (up) or 150→80 Hz (down), dur 0.11 s, -27 dB, plus a 700 Hz click -33 dB (25 ms) | | at `t+0.05` |
| Clutch-fill "shhp" | white → hp 500 → bp 900→550 Hz, Q 0.9, dur 0.16, attack 0.02, τ 0.06, -40 dB | | at `t+0.03` |

Zone factors `zone.whine`: cab 0, front 0, rear +5, outside 0. With a Voith DIWA character: shift dip -3 dB and 0.25 s (smoother), the hydrodynamic retarder -2 dB and bp Q 2.5, gearbox whine -4 dB. With ZF EcoLife (default) use the values above. Low confidence in all driveline levels; they are tuned to be audible, not measured on a bus.

---

## 5. Road, tyres, wind, bumps, bellows, AC bed

### 5.1 Tyres and road (inside `BusVoice`)
Let `vr = max(|v|, 0.01)`, `k = clamp((vr/13.9)^1.35, 0, 3.2)` (13.9 m/s = 50 km/h), `brick = surface==='brick'`.

| Layer | Source | Filter | Level (pre-roadGrp) | Notes |
| --- | --- | --- | --- | --- |
| tyre low | pink | bandpass `250 + 8*vr` Hz, Q 0.8 | `-16 dB * k * (brick ? 0.8 : 1) * clamp(vr/1.2, 0, 1)` | rumble |
| tyre high | white | bandpass `900 + 45*vr` Hz, Q 0.8 | `-26 dB * k * (brick ? 0.7 : 1) * clamp(vr/1.5, 0, 1)` | tread hiss |
| cobble (yellow paving) | velvet (sparse impulses) | bandpass 190 Q 1.5 **plus** bandpass 700 Q 1.2 | `-12 dB * clamp(vr/8, 0, 1.4)`, only if `brick` | `playbackRate = clamp(vr/5, 0.15, 5)` so the impulse rate scales with speed (the buffer has about 70 impulses/s at rate 1, so about 14 impulses per metre driven: several edge hits per brick, not one per joint) |
| wind | white | hp 450 → bp `1200 + 30*vr` Hz, Q 0.5 | `-33 dB * (vr/13.9)^2.4`, only above 4 m/s | |
| AC / HVAC bed | pink → bp 650 Q 0.6, plus 143 Hz and 286 Hz sines | | `zone.bed` dB for the noise, `zone.bed - 10` for the sines | cab -43, front -41, rear -40, outside off |

`roadGrp` gain = `+18 dB + zone.road`. `zone.road`: cab 0, front 0, rear -8, outside -3.

### 5.2 Suspension bumps and rattles (`Events.bump(ctx, dest, t, B, {k, v, big})`)
This is the strongest "we are moving" cue on a phone, because it is broadband.
- Poisson-driven from `update()`: rate `lambda = 0.08 + 0.012*v` per second on asphalt, `0.6 + 0.1*v` on yellow brick, gated by `v > 2`.
- Three impacts: front axle at `t`, middle axle at `t + 5.105/v` (-3 dB), rear axle at `t + (5.105+7.0)/v` (-4 dB).
- Each impact: thump `210→80 Hz` (big: `180→80`), peak -21 dB (big +4), dur 0.13 s (big 0.18); click 800 Hz Q 1.1 -20 dB (60 ms); click 1800 Hz Q 1.4 -25 dB (30 ms).
- Rattle: `4 + 3*big` clicks at `t + 0.03 + i*(0.03 + 0.02*((7i) mod 3))`, bandpass `1400 + 350*((5i) mod 4)` Hz Q 5, -33 dB, 12 ms (loose panel and handrail).
- Skip the rattle when the listener is outside (see 9.2).

### 5.3 Bellows and turntable (`Events.bellowsCreak(ctx, dest, t, B, k)`)
Trigger when `|d(articulation)/dt| > 0.05 rad/s`, at most once per 2.5 s, only for listeners inside and outside near. Three layers:

| Layer | Filter | Level | Dur |
| --- | --- | --- | --- |
| floor-plate rumble | `glide` bp 160→210 Hz, Q 1.2, AM 11 Hz | -20 dB | 1.3 s |
| bellows creak 1 (from `t+0.05`) | bp 820→1100 Hz, Q 6, AM 5 Hz | -20 dB | 1.2 s |
| bellows creak 2 | bp 1500→1250 Hz, Q 5, AM 7 Hz (from `t+0.25`) | -27 dB | 0.9 s |
| plate settles | click 600 Hz Q 1.2 at `t+1.1` | -30 dB | 30 ms |

`glide` envelope: linear attack `min(0.25, dur*0.2)`, hold, linear release of the same length. Scale all levels by `clamp(|dArt/dt|/0.3, 0.4, 1.2)` (this scaling is spec only, not in the prototype).

---

## 6. Listening zones

### 6.1 Five zones as presets of the zone chain
`voice.setListener(t, L)` with `L = {zone:'cab'|'cabin'|'out', prox, dist, radial, pan}`.

| Zone | hp | lp | peaking 1 (f, dB, Q) | peaking 2 | peaking 3 | gain | road | turbo | whine | comp | bed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cab` | 40 | 900 | 100, +4, 1.2 | 260, +6, 1.4 | 640, +2, 1.0 | -11.5 | 0 | -4 | 0 | -10 | -43 |
| `front` (cabin, `prox` 0) | 40 | 1100 | 120, +4, 1.2 | 210, +5, 1.5 | 520, +2, 1.0 | -11.0 | 0 | -4 | 0 | -8 | -41 |
| `rear` (cabin, `prox` 1) | 40 | 2600 | 140, +4, 1.2 | 330, +6, 1.5 | 820, +4, 1.2 | -7.5 | -8 | +4 | +5 | +6 | -40 |
| `outNear` (6 m) | 45 | 6500 | 175, +4, 2.2 | 420, +3, 1.5 | 1500, +1, 1.0 | -7.0 | -3 | 0 | 0 | 0 | off |
| `outFar` | derived from `outNear` with the distance law (6.3) | | | | | | | | | | |

Units: Hz and dB; "gain" is the zone gain in dB applied after the formants; "road", "turbo", "whine", "comp", "bed" are offsets in dB (see 3, 4, 5).

### 6.2 Inside the bus: where the engine is
Engine centre is at about `z = +2.2` in the rear section frame (inferred, medium–low). From the listener's section position `lz`:

```
dEng = section === 'rear' ? |2.2 - lz| : (1.70 - lz) + 7.27      // 1.70 = hitch in front frame, 7.27 = 2.2 + 5.07
prox = clamp(1 - (dEng - 2) / 14, 0, 1)                           // cab (lz ≈ -7) ≈ 0; front door 2 (lz ≈ -1.6) ≈ 0.38; rear seats ≈ 1
```
The `cabin` preset is a linear blend of `front` and `rear` by `prox` (the cutoffs blend in log-frequency). Walking back along the bus therefore raises the engine by 3.5 dB, opens the low-pass from 1.1 to 2.6 kHz, and adds the turbo, whine and compressor layers. The measured total level difference rear − front at cruise is +2.8 dB (Bustest on a comparable bus: +1.8 dB), and at idle +2.7 dB. Expose `rearBoostDb` (default 3.5, allowed up to 8) if the rear needs to be more dominant.

`cab`: zone chosen when `rig.mode === 'cab'`. Camera modes `follow/front/side/free` use `out` with the camera as listener.

### 6.3 Outside: distance, Doppler, pan, voice pool
```
gain_dB(d)  = outNear.gain(-7) - 20*log10(max(d, 6)/6) - 0.012*max(0, d - 6)        // -6 dB per doubling from 6 m
lowpass(d)  = clamp(6500 * (8 / max(d, 8))^0.55, 900, 6500)  Hz
peaking1(d) = 175 Hz, +4 + clamp(d/30, 0, 3) dB, Q 2.2                            // the low end carries
doppler     = 1200*log2(343 / (343 - vr))  cents, vr = approach speed (m/s, + = approaching), clamp ±40
pan         = clamp(lateralOffset / 40, -1, 1)  (camera right vector · (busPos - camPos))
cull        : no voice beyond 150 m; fade the voice gain to 0 between 120 and 150 m
```
`vr = -((vBus - vCam) · dir)`, where `dir` is the unit vector from camera to bus. When riding the bus, the ridden bus uses an interior zone and `vr = 0`. All other buses use `out`.

Measured with this law (`drive_out30`, `drive_out80`, `passby`): cruise RMS -14.9 dBFS at 6 m, -28.8 at 30 m, -36.9 at 80 m; a pass-by at 12 m/s (10 m off the road) goes from -32.2 at 85 m, to -20.5 at the nearest point, to -38.5 leaving. **Gameplay tweak:** if a distant bus must be audible while the player waits at a stop (passenger mode, the bus approaches from 500 m), raise the law's exponent to 0.8, i.e. `-16*log10(d/6)`. I did not prototype that.

Pool: the focus bus always owns a voice, the nearest two other buses within 150 m get the others, voices are reassigned with a 0.2 s fade and zero rpm. This fixes `Game.js:490-497` (only `this.bus` ever made sound).

---

## 7. Engine start, stop, idle; gear select; parking brake

**Start** (`engineStart(id)`, on the `p.engineOn` false→true edge, replacing `Game.js:199`). With the voice in the listener's zone:
1. `t0`: `Events.starter(ctx, dest, t0, B, k)`: sawtooth 95→150 Hz through a bandpass 420→650 Hz, Q 2.5, level -17 dB for 0.9 s, fading by 1.05 s; click 800 Hz -18 dB; clunk 190→90 Hz -19 dB.
2. `rpm` timeline for the voice: `t0+0.3 … +1.2`: 40 → 230 rpm (cranking chug at 11 Hz); `+1.2 … +1.5`: 230 → 920 (catch and flare); `+1.5 …`: `620 + 300*exp(-(t-1.5)/0.55)` (settle).
3. Measured (`engine_start_rear.wav`): crank RMS -29.0 dBFS, settled idle -19.1 dBFS in the rear cabin.
4. Cab only: 24 V relay click and a short air hiss: `hiss(dur 0.3, 900→..., -30)` replaces the current barely audible one.

**Stop** (edge true→false): rpm falls 900 rpm/s (the physics already does this); add two last compression thumps (thump 70→45 Hz, -24 dB at +0.7 s and +1.0 s), a fuel-solenoid click (800 Hz, -26 dB) and a brief air sigh (hiss 1.2 kHz, dur 0.4 s, -34 dB). Voice gain follows `on` (rpm > 120).

**Idle:** `rpm = 620`, `load = 0.03`. The engine is the loudest continuous layer at idle in all zones (measured -22.7 dBFS cab, -19.2 rear, -20.4 outside 6 m). Add the compressor chug while `comp` and the AC bed.

**Gear select** (`Game.js:322` currently plays a 1100 Hz beep): `Events.gearSelect`: clunk 240→100 Hz -20 dB plus a click at 1300 Hz Q 2, -16 dB (20 ms).

**Parking brake** (`Game.js:206`): apply `hiss(dur 0.35, 3800→2600, Q 1, peak -17, attack 0.004, τ 0.08)` plus a click 1200 Hz -24 dB; release `Events.parkingRelease` (8.4).

---

## 8. One-shot recipes

Notation: `hiss(dur, f0→f1, Q, peakDb, attack, τ, hp)` is white noise → high-pass (`hp`, default 500 Hz) → bandpass sweeping exponentially `f0→f1` over `dur`, enveloped by a linear attack and exponential decay (`setTargetAtTime`, time constant τ). `thump(f0→f1, dur, peakDb)` is a sine sweeping exponentially with an exponential decay (τ = dur/3.2). `click(f, Q, dur, peakDb)` is band-passed noise with τ = dur/3. `glide(dur, f0→f1, Q, peakDb, amHz)` is pink noise → bandpass sweeping linearly, with amplitude modulation `0.6 + 0.4*sin(2π*amHz*t)`. **`peakDb` is the RMS level at the envelope maximum in dBFS** for noise, and the amplitude for tones. All values are at the `out6` reference ("standing at the door"); add the zone offset from 9.2.

### 8.1 Door open and close (4 pneumatic doors; timing from `DOOR_TIMING`)

Open (door event `opening`, then `opened` 1.45 s later):

| t (s) | Layer | Recipe |
| --- | --- | --- |
| 0 | solenoid click | `click(1900, Q3, 10 ms, -20)` + `thump(220→140, 40 ms, -22)` |
| 0.03 | air to the cylinder | `hiss(0.6, 3600→1900, Q0.9, -17, attack 0.012, τ 0.2)` |
| 0.10–1.35 | leaf on its rails | `glide(1.25, 520→380, Q2.2, -31, 28 Hz)` |
| 1.38 (`opened`) | end stop | `thump(150→70, 0.12, -19)` + `click(800, Q1.2, 20 ms, -24)` |

Closing (door event `closeRequest` at 0; `closingStart` at 0.95; `closed` at 0.95 + 1.9 = 2.85):

| t (s) | Layer | Recipe |
| --- | --- | --- |
| 0, 0.42 | beeps | 8.2 |
| 0.95 | valve | `click(1700, Q3, 10 ms, -22)` + `hiss(0.5, 3000→1700, Q0.9, -20, 0.01, 0.16)` |
| 1.0–2.8 | leaf glides | `glide(1.8, 480→300, Q2.0, -31, 22 Hz)` |
| 2.85 (`closed`) | rubber seal bump | `thump(130→60, 0.14, -17)` + `click(300, Q1, 60 ms, -22)` + `hiss(0.2, 3800→2800, Q1, -28, 0.006, 0.06)` |

Obstruction (reopen): a sharp `click(1100, Q2, 15 ms, -20)` + `thump(180→90, 0.1, -22)`, then run the "open" layers 0.03 s onward but with the glide shortened to 0.8 s.

Measured `door_open` peak -12.6 dBFS, 97 % of energy above 120 Hz, mostly in 2–4 kHz (hiss) and 100–250 Hz (thumps).

### 8.2 Door-warning beeps (`Events.doorBeeps(ctx, dest, t, k, f)`)
Two beeps, at `t` and `t + 0.42`, each 0.24 s (matches the repo's `DOOR_TIMING`; **low confidence in both count and pitch**, so keep `beepFreq` 1850 Hz, `beepDur` 0.24 s and the count as settings).
- Source: `buzzWave` = odd harmonics 1/h up to h=9 (a square wave with a gentle slope), at `f`.
- Filter: bandpass at `1.05*f`, Q 2.2 (piezo-in-a-plastic-box resonance).
- Envelope: 3 ms linear attack, flat, 12 ms release.
- Level: peak -15 dB (inside, door section), zone offsets from 9.2. Optionally route a copy to the cabin reverb at -8 dB (impulse 0.25 s).
- Measured: peak -14.4 dBFS, 92 % of energy in 1–2 kHz, which is where phone speakers are most efficient.

### 8.3 Stop-request bell (`Events.stopBell`)
Default two-tone "ding-dong" (design guess, low confidence): button click `click(2600, Q2, 8 ms, -34)`, then a bell at 1319 Hz (E6) at `t+0.01`, peak -15 dB, then a bell at 1047 Hz (C6) at `t+0.25`, peak -16 dB, decay x1.15. Bell partials (ratio, amplitude, τ in s): `[1, 1, 0.38], [2.76, 0.32, 0.20], [5.4, 0.12, 0.09], [8.93, 0.05, 0.05]`, attack 2 ms, 1.6 s long. Measured peak -10.2 dBFS, 95 % of energy in 1–2 kHz. Interior only; cab -3 dB; not audible outside. Offer a settings choice "single ding / ding-dong".

### 8.4 Brake release and application ("pssst")
- **Service brake released at standstill** (`brakeRelease`, fires when `brakeOut` falls below 0.05 while `|v| < 0.3`, and also at each stop when the driver releases the pedal): `click(1400, Q2, 12 ms, -26)` + `hiss(0.5, 4200→2600, Q1.0, -15, 0.006, 0.11)`. Measured peak -11.6 dBFS.
- **Parking brake release** (`parkingRelease`): `click(900, Q1.5, 20 ms, -24)`, `hiss(1.0, 3400→1800, Q0.8, -14, 0.05, 0.3)`, then a second `hiss(0.3, 3000→2000, Q0.9, -22, 0.01, 0.08)` at `+0.5`. Peak -9.1 dBFS.
- **Parking brake apply** and **bus-stop brake (`phys.stopBrake`) engage**: `hiss(0.35 / 0.2, 3800→2600, Q1, -17 / -24, 0.004, 0.08)` + `click(1200, Q2, 10 ms, -24)`.
- Fire for **every** bus (AI buses too) from edge detection in `Game.update` (section 12).

### 8.5 Kneeling (`phys.kneel`, `ArticulatedBus.js:249-250`)
Derive events from `kneel` crossing 0.02 upward (down) and downward with the target at 0 (up).
- **Down** (`kneelDown`): `hiss(1.3, 3000→1400, Q0.7, -16, 0.06, 0.5)`; `glide(1.1, 300→200, Q4, -33, 9 Hz)` from `t+0.1` (air-bag creak); `thump(150→70, 0.12, -21)` at `t+1.25`. Peak -11.0 dBFS.
- **Up** (`kneelUp`): `hiss(2.2, 900→1900, Q0.8, -24, 0.4, 0.9)`; `glide(2.0, 200→320, Q4, -33, 8 Hz)` from `t+0.1`; `thump(140→70, 0.1, -22)` at `t+2.25`. Peak -21.0 dBFS.

### 8.6 Dryer purge and compressor (see also 8.8)
`dryerPurge` on governor cut-out (`pressure >= 10` in the repo model, `AudioManager.js:244-246`): `click(1100, Q1.5, 15 ms, -26)`, `hiss(1.7, 5200→2400, Q0.7, -14, 0.004, 0.34, hp 900)`, then a short second `hiss(0.35, 4200→3000, Q0.8, -22, 0.004, 0.09, hp 900)` at `+1.9`. Measured peak -9.8 dBFS, 67 % of energy above 4 kHz. Interval: whenever the reservoir passes cut-out, i.e. about every 40–90 s of normal driving with braking (repo model: pressure loss 0.06 bar/s braking, 0.004 idle; recovery 0.09 bar/s).

### 8.7 Indicator relay (`Events.indicator(ctx, dest, t, B, on, k)`)
Flash rate 90/min (period 0.667 s, 0.333 s on, 0.333 s off, inferred from EU 60–120/min). Two clicks per period (on-edge and off-edge), so a "tick-tock".

| Edge | Layers |
| --- | --- |
| on ("tick") | `click(2300, Q2.5, 7 ms, -13)`; `click(4200, Q3, 4 ms, -19)` at +4 ms; `thump(330→200, 30 ms, -19)` |
| off ("tock") | `click(1700, Q2.5, 7 ms, -17)`; `click(3100, Q3, 4 ms, -22)` at +4 ms; `thump(250→150, 30 ms, -23)` |

The click is the important part for phones: it sits at 2–4 kHz. Measured peak -13.6 dBFS (the repo's old tick was 18 ms at gain 0.05, ≈ -33 dBFS). Zone offsets in 9.2: cab 0, front -14, rear -20, outside -10 within 8 m.

### 8.8 Air compressor loop (inside `BusVoice`, replaces `AudioManager.js:137,249-250`)
Engine-driven piston compressor chug, running while `comp` (governor "load", pressure between 8.1 and 10 bar).
- Pulse oscillator `oComp`: the same 13-harmonic `PeriodicWave` as `oAM`, frequency `max(6, rpm/60*0.9)` Hz (12 Hz at idle, 20 Hz at 1,250 rpm).
- Valve chatter: white → bandpass 1700 Hz Q 1.4, amplitude `0.35 + 0.65*pulse`.
- Piston thump: pink → bandpass 230 Hz Q 2, amplitude `0.3 + 0.7*pulse`.
- Level `-34 dB + zone.comp`, gain τ 0.25 s. `zone.comp`: cab -10, front -8, rear +6, outside 0.
- Ends with the dryer purge (8.6).

### 8.9 Announcements and chime
- **Chime** (low confidence, since Sofia's real behaviour is unknown): two notes, G5 784 Hz then E5 659 Hz, 0.5 s apart, the same bell partials as 8.3 at -18 dB, with a reverb send of 12 % (impulse 0.35 s, decay 3). Shorter than the current three-note gong (`AudioManager.js:396-419`). Keep `chimeNotes` as a setting. Make the chime optional (`settings.chime`, default on).
- **Voice.** The Web Speech API cannot be routed through WebAudio, so the "PA speaker" band-pass (300–3400 Hz) can only be applied to embedded clips (`voice-clips.json` is empty today). With clips: `voiceBus` → bandpass 300–3400 → gain, reverb send 10 %. With `speechSynthesis`: prime it inside the start gesture (`speak(new SpeechSynthesisUtterance(''))`) and only control `u.volume`.
- **Ducking:** while a message plays (chime + speech) lower `engineBus` by 3 dB over 0.2 s and restore 0.4 s after (`announcementDuck(on)`).
- Female voice, calm pace (`rate 0.93`), as already configured.

### 8.10 Horn (not researched; keep)
Two sawtooth oscillators 370 and 466 Hz, band-passed at 900 Hz Q 0.7, gain attack 30 ms, release 80 ms, level -14 dB at the out6 reference. Real MAN buses may use air horns. Low confidence, low priority.

---

## 9. Mix levels

All levels are dBFS measured at the voice output before the master (24 kHz offline renders of the 26 s drive cycle: idle 3 s, pull-away at 70 % throttle to about 45 km/h, cruise at 25 %, coast, brake with retarder, stop). "Phone" is the RMS after a 2nd-order 250 Hz high-pass, which is a rough phone-speaker model.

### 9.1 Continuous layers (RMS dBFS)

| Zone | Idle | Pull-away | Cruise 50 km/h | Brake | % energy above 120 Hz (idle / cruise) |
| --- | --- | --- | --- | --- | --- |
| Cab | -22.7 (phone -28.9) | -16.9 (-20.6) | -17.4 (-22.1) | -18.7 | 66 % / 79 % |
| Front cabin (`prox` 0) | -21.9 (-28.6) | -16.3 (-20.6) | -16.6 (-22.1) | -18.0 | 72 % / 82 % |
| Rear cabin (`prox` 1) | -19.3 (-25.2) | -13.0 (-16.2) | -13.8 (-18.0) | -15.2 | 71 % / 82 % |
| Outside 6 m | -20.4 (-27.0) | -14.7 (-18.5) | -14.9 (-20.0) | -16.3 | 69 % / 80 % |
| Outside 30 m | -34.4 | -28.6 | -28.8 | -30.3 | 71 % / 81 % |
| Outside 80 m | -42.7 | -37.1 | -36.9 | -38.5 | 75 % / 84 % |

Engine vs road at the same time (RMS dBFS, `snr_table.tsv`; cab zone shown, 20 km/h pull-away / 30 / 50 / 70 km/h):

| | Idle | 20 pull | 30 km/h | 50 km/h | 70 km/h |
| --- | --- | --- | --- | --- | --- |
| Engine only | -22.7 | -17.7 | -18.2 | -17.3 | -15.2 |
| Road + wind + bed only | -43.3 | -36.8 | -33.0 | -27.5 | -24.0 |
| Engine minus road (dB) | +20.6 | +19.1 | +14.8 | +10.2 | +8.8 |

So the engine stays at least 8.8 dB above the road in the cab up to 70 km/h, and at least 15 dB in the rear cabin. That is the "engine is clearly audible at all times while driving" rule. Ambience floor in the current game: -36.1 dBFS (engine off, stopped, `silence` run), so the idle engine is 13 dB or more above it in every zone, compared with 2.4 dB for the old file:// fallback.

Pre-master peaks (pull-away): cab -6.1 dBFS, front -5.6, rear -0.8, outside 6 m -2.4.

### 9.2 One-shot level offsets (add to the recipe peaks in section 8; recipes are at "out6, at the door")

| Sound | Source position | Cab | Front area | Rear area | Outside ≤ 8 m | Outside 30 m |
| --- | --- | --- | --- | --- | --- | --- |
| Door open/close hiss and thumps | doors 1, 2 front; 3, 4 rear | door 1: -2; others -10 | same section 0; other -8 (+ lp 2.5 kHz) | same section 0; other -8 | 0 | -14 |
| Door beeps | at each door's buzzer | -3 | 0 (other section -8) | -3 (other section -8) | -12 | -26 |
| Stop bell | PA speakers | -3 | 0 | 0 | off | off |
| Brake release / parking | valve block under the cab | 0 | -4 | -10 | 0 | -14 |
| Kneel | right front air bag | -2 | 0 | -10 | 0 | -14 |
| Dryer purge | rear / mid under-floor | -20 | -14 | -4 | 0 | -14 |
| Indicator relay | dashboard | 0 | -14 | -20 | -10 | off |
| Bumps and rattles | whole body | 0 | 0 | +2 | -8, no rattles | off |
| Bellows creak | joint | -12 | 0 | 0 | -10 | off |
| Gear select, shift clunk | gearbox / dash | 0 | -6 | -4 | -8 | off |

Reference peaks measured with `dest = master` (out6 reference, no zone gain), `oneshots_sequence.wav`:

| Sound | Peak dBFS | Dominant band |
| --- | --- | --- |
| door open | -12.6 | 2–4 kHz hiss + 100–250 Hz thump |
| door beeps | -14.4 | 1–2 kHz |
| stop bell | -10.2 | 1–2 kHz |
| service brake release | -11.6 | 2–4 kHz and above |
| parking release | -9.1 | 2–4 kHz and above |
| kneel down / up | -11.0 / -21.0 | 2–4 kHz / 1–2 kHz |
| dryer purge | -9.8 | above 4 kHz |
| indicator | -13.6 | 250–500 Hz (body) + 2–4 kHz (click) |
| bump | -14.2 | 100–250 Hz (add the click layers for phones) |
| bellows | -17.6 | 100–250 Hz + 500 Hz–1 kHz |
| gear select | -16.4 | 100–250 Hz |
| starter | -19.5 | 250 Hz–1 kHz |

### 9.3 Ambience layers (existing graph, retuned)
| Layer | Source | Filter | Level |
| --- | --- | --- | --- |
| city bed | brown loop | lowpass 500 (outside) / 1200 (inside) | keep `0.30 / 0.12` x `volAmbience`, about -36 dBFS inside |
| rain | white | highpass 2500 | outside 0.22, inside 0.05; plus roof bandpass 1400 Q1.2 inside 0.12 |
| birds | `bird()` | | unchanged, daytime parks only |
| HVAC / AC fans | in `BusVoice` | 5.1 | cab -43, front -41, rear -40 dB (pre-roadGrp) |
| passenger murmur (optional) | pink → bp 300–1800 Hz, AM 3–5 Hz | | `-46 dBFS * min(1, riders/20)`, interior only |

Ducking: `ambBus` -6 dB while a one-shot with peak above -12 dBFS plays (door, purge, bell).

---

## 10. Phone-speaker rules (what the numbers above implement)

1. **No energy that exists only below 100 Hz.** The fundamental (31–110 Hz) is kept for headphones but tilted down 10 dB with the 150 Hz low-shelf. The old worklet had 93 % of its idle energy below 100 Hz; the new engine has 28–34 % below 100 Hz at idle and 66–72 % above 120 Hz (measured, 9.1).
2. **Carry the note on harmonics 150–800 Hz.** The 190, 410 and 760 Hz formants and the load crossfade put 48–62 % of the energy in the 100–250 Hz band and 14–35 % in 250–500 Hz.
3. **Mid and high texture.** The roar (0.7–1.7 kHz), the injector tick (3 kHz), the turbo whistle (2.6–6 kHz), the tyre hiss and the hisses of the pneumatics carry the 1–4 kHz range where phone speakers are most efficient.
4. **Short events must have a click or hiss component above 1 kHz** (indicator, gear select, bump, kerb), otherwise they vanish on a phone. Their low thump is only the body.
5. **Do not let sub-bass drive the compressor:** 30 Hz high-pass before it; threshold -10 dB; ratio 3.
6. **Level targets:** driving mix RMS -14 to -18 dBFS in all interior zones, phone-weighted RMS better than -26 dBFS even at idle in the cab.
7. **Optional "virtual bass"** (not prototyped): split the engine group below 140 Hz, saturate it with a `tanh` `WaveShaper` (k = 6), high-pass at 120 Hz and add it back at -9 dB. This makes the 31 Hz thrum audible as a 60–200 Hz buzz.

---

## 11. Acceptance tests

Run with `tools/shot.cjs` from `file://` (the user's case), after building with `OUT=<scratch>/audio_test.html node build.mjs --dev`.

1. **Context and graph on file://:** `await __game.audio.start()` then expect `ctx.state === 'running'`, `ready === true`, and the focus voice exists (`!!audio.voiceFor(id)`) with no worklet.
2. **Level and spectrum per state** (the measurement code from the audit, adapted): call `audio.update` with synthetic states, capture the master with a `ScriptProcessor`, and assert the thresholds below.

| Check | Threshold |
| --- | --- |
| Share of energy above 120 Hz (engine states, all interior zones) | ≥ 60 % (measured 63–90 %) |
| Phone-model RMS, cab, idle | ≥ -30 dBFS (measured -28.9) |
| Phone-model RMS, cab, 50 km/h | ≥ -24 dBFS (measured -22.2) |
| Total RMS, driving | between -20 and -10 dBFS |
| Pre-master peak | ≤ -0.5 dBFS |
| Engine minus road, cab, up to 70 km/h | ≥ +6 dB (measured +8.8) |
| Idle engine above ambience floor | ≥ +10 dB (measured +13 dB or more) |
| Outside pass-by: near − far (85 m) | ≥ 10 dB (measured 12–18 dB) |

3. **Regression:** `node proto/render.cjs <outdir>` reproduces `metrics.json` to within about ±2 dB (the buffers are seeded but the loop start offsets and the wobble LFO phase are random, so one-shot peaks move by up to ±2 dB between runs).
4. **iOS (manual, cannot be tested headless):** with the ringer switch set to silent, tap Start and hear the engine; lock and unlock the phone and hear it return within one tap; check that the Bulgarian voice speaks the first announcement.

---

## 12. Wiring map (what to change in the game, by line in the current code)

The prototype does not touch `src/`. When integrating:

| Where | Change |
| --- | --- |
| `main.js:100-104` `onStart` | keep, but `audio.start()` must be gesture-synchronous (audit A3). Add `onResume` → `audio.unlock(); audio.setPaused(false)` (`main.js:145`) and on pause → `audio.setPaused(true)` (`Game.js:129`) |
| `Game.js:106-114` `wireBus` | `bus.phys.onShift = (gear, dir) => this.audio.shift(bus.id, gear, dir)` for **every** bus; keep the door listener but pass `where` |
| `Game.js:196-199` | engine toggle → `audio.engineStart(id)` / `engineStop(id)` |
| `Game.js:204-207`, `Game.js:322` | parking brake → `brakeEvent('parkApply'/'parkRelease')`; gear select → `audio.gearSelect(g)` |
| `Game.update` (shared systems, after the buses update) | edge-detect for each `b` of `allBuses()`: `phys.stopBrake` (engage/release), `phys.parkingBrake`, `phys.brakeOut` falling below 0.05 at standstill, `phys.kneel` direction, `|d(articulation)/dt|` for the bellows, pressure model cut-out for the purge |
| `Game.js:486-500` `updateAudio` | build `S`: `buses = allBuses().map(...)` with `dist`, `radial` (from camera and bus velocities), `pan`, `section`, `focus`; `listener = {zone, prox}` where `zone` is `cab` (driver, cab camera), `cabin` (passenger, eyes) or `out`, and `prox` from 6.2 using `PassengerMode.section` and `PassengerMode.lz`. Remove the random rattle call at `:499` (replaced by the Poisson `bump`) |
| `PassengerMode.js:218, 233, 348` | `setZone('cabin')` calls become `setListener({zone:'cabin', prox})` |
| `VoiceAnnouncer.js:66,77` | duck the engine, prime `speechSynthesis` |
| `AudioManager.js` | delete `ENGINE_WORKLET`, `engineFallback`, loops `road/cobble/wind/compressor` and `cobbleLfo`; keep `city`, `rain`, `rainRoof`, `bird`, `crash`, `kerb`, `horn`, `chime` (retuned) |

Settings to expose (existing sliders plus new): `beepFreq` (default 1850), `beepDur` (0.24), `beepCount` (2), `bellStyle` ('dingdong' | 'ding'), `gearbox` ('ecolife' | 'diwa'), `rearBoostDb` (3.5), `chime` (on).

---

## 13. Uncertain, and what would settle it

| Item | Why uncertain | How to settle it |
| --- | --- | --- |
| Sofia gearbox (ZF EcoLife vs Voith DIWA) | No reachable source | A photo of the gearbox plate or fleet data; ask the user for a recording from the 280 |
| Door beep count and pitch, bell chime, announcement chime and voice | No source | A short phone recording from the real bus; then set `beepFreq`/`beepCount`/`chimeNotes` |
| Idle rpm (550 vs 620 vs 700) | Not found | MAN parameter sheet |
| Engine position (z = +2.2 in the rear frame) | Inferred from the bus layout | Photo of the rear section |
| Gear tooth counts (19 and 13) | Assumptions to place whine at 150–600 Hz | Irrelevant to realism as long as the whine is audible and rises with speed |
| Turbo flutter chirp, compressor stroke rate | Inferred | None needed |

All previews were rendered but not listened to. Adjust `ZONES.gain`, the `engGrp`/`roadGrp` make-up gains and the tilt shelf (-10 dB at 150 Hz) first if the balance feels wrong; they are the only level knobs the rest of the design depends on.
