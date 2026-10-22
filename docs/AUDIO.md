# Audio and announcements

The game ships with no sound files. Every sound is synthesised at runtime with
WebAudio, and the stop announcements use either embedded clips (when present)
or the device's Bulgarian speech voice.

## Sound design (`src/audio/AudioManager.js`)

| Sound | How it is made |
| --- | --- |
| Engine | An AudioWorklet (loaded from a Blob URL) models a six-cylinder CNG engine: firing pulses at the rpm, load-dependent harmonics, turbo whine and an exhaust resonance. Its rpm and load follow the simulated drivetrain, including the torque converter and gear changes. |
| Pneumatics | Filtered-noise hisses for the doors, parking brake and kneeling, with low thumps when the door leaves stop. |
| Air system | The compressor cuts in when braking drains the reservoir (simulated pressure) and ends with the dryer's purge „пссст“. |
| Door warning | Two beeps before the leaves move: close request → beep 1 → beep 2 → closing → closed. The pitch (default 1850 Hz) and length (0.24 s) are **synthesised and configurable** in Settings → Звук на вратите, with a test button. **This is not a recording of the real MAN bus.** The sequence timing is in `DOOR_TIMING` (`src/vehicle/DoorController.js`). |
| Cab and passengers | Indicator relay ticks, horn, stop-request bell and passenger information chime (three notes). |
| Road | Tyre and road noise scaled by speed, a rougher texture on the yellow paving and cobbles, kerb strikes and collisions. |
| City ambience | Brown-noise traffic bed, birds in the day, rain when it rains, and wind rising with speed. |

There are three listening zones, chosen from the camera:

- **Driver's cab:** the engine is muffled, the dashboard ticks are close.
- **Passenger cabin:** the engine is louder in the rear section, where it is mounted.
- **Exterior:** the engine is unfiltered, with distance attenuation.

## Announcements

The messages are produced by `src/gameplay/AnnouncementManager.js`, which is pure
logic and unit-tested in `tests/announcements.test.js`:

| When | Message |
| --- | --- |
| Shortly after departing a stop | **„Следваща спирка X.“** |
| Approaching a stop | **„Спирка X.“** — at the terminus followed by „Последна спирка.“ |

Timing rules:

- **Approach trigger:** `55 m + speed × 6.5 s`, capped at 220 m, so a fast bus is
  announced earlier.
- **Close stops:** if the bus is already within 25 m of the next stop, the pending
  „Следваща спирка“ is dropped in favour of „Спирка“.
- **No overlap:** messages are queued and played one at a time, and a stale message is
  superseded by a newer one for a later stop.

Each message is preceded by the chime and shown as a subtitle.

### Voice sources (`src/audio/VoiceAnnouncer.js`)

The voice is chosen in this order:

1. **Embedded clips** in `src/data/voice-clips.json`, a map from the exact message text
   to an mp3 data URL. This file is **empty in the current build**, so the clips must be
   generated first (below).
2. **The device's Bulgarian voice** via the Web Speech API. Female voices are preferred
   (macOS/iOS *Daria*, Edge *Kalina Online (Natural)*, Android *Google български*).
   The voice can be picked and tested in Settings.
3. **No Bulgarian voice on the device:** only the chime and the subtitle play.

The game never uses an English (or other) voice to read Bulgarian text. The settings
show which source is active, and say so when the selected voice is not female.

### Generating offline clips

`tools/generate_announcements.py` produces the clips for every message the game can
play: 38 messages covering both directions.

```sh
python3 tools/generate_announcements.py list          # the exact texts
AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=westeurope \
  python3 tools/generate_announcements.py azure        # bg-BG-KalinaNeural (female)
GOOGLE_TTS_API_KEY=… \
  python3 tools/generate_announcements.py google       # bg-BG-Standard-A (female)
python3 tools/generate_announcements.py pack recordings/   # human recordings + manifest.csv
node build.mjs                                         # embeds them into the single file
```

The generated mp3 files are cached in `assets/voice/`.

Before redistributing synthesised audio, check the terms of your TTS provider.
Recordings of a human speaker need that speaker's consent.

### Status

- Bulgarian text and timing: done and tested.
- Female Bulgarian voice: depends on the device until the clips are generated. No clips
  are bundled, because no TTS credentials were available while building this version.
- Real on-board audio of Sofia's buses: not used. The chime and beeps are original
  synthesised substitutes.
