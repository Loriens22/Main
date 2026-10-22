# Progress log

A concise record of what was built, how it was verified, and what is still open.
The newest entries are at the top.

## 2026-10-22 — verification pass

### Full-route drives

An AI driver drove each direction end to end, serving every stop, at noon with traffic
and pedestrians. The test harness is `tools/shot.cjs` in headless Chromium.

| Direction | Length | Time (simulated) | Stops served | Terminal reached | Collisions |
| --- | --- | --- | --- | --- | --- |
| A: СУ → Студентски град | 10.66 km | 25.4 min | 18 / 18 | yes | 0 |
| B: Студентски град → СУ | 10.31 km | 25.8 min | 18 / 18 | yes | 1 (low speed, with traffic) |

The longest stops outside the stop procedure were red-light waits of 25–40 s.

Three bugs were found and fixed by these runs:

- **Pole in the swept path.** A lamp pole stood in the bus's turning path on
  бул. Цариградско шосе. Lamps, trees, bins and parked cars are now kept out of the
  articulated bus's swept area. `src/gameplay/SweptPath.js` computes that area by
  following the drive line with tractrix curves for the middle axle and the trailer.
- **Doors never opened.** If a close request arrived while the doors were still opening,
  the AI waited forever for "all open". The AI now re-commands the doors and has a
  timeout.
- **Stop re-served.** After serving a stop, the AI still targeted it inside the 12 m
  departure window, and opened the doors again up to three times.

### Memory and performance

**JS heap after loading** (Chromium, `?memlog` logs it per loading stage):
**~650 MB → ~320 MB**. Two changes did this:

- The world geometry builders drop their JS arrays once the typed arrays are created.
- Static world meshes release their CPU-side arrays after the GPU upload.

**Draw calls and triangles per frame**, start of route at noon, including shadow passes
and post-processing:

| Preset | Cab view | Chase view |
| --- | --- | --- |
| Ultra | 1180 calls / 1.11 M triangles | 1386 calls / 1.24 M triangles |
| High | 848 calls / 0.71 M triangles | 1045 calls / 0.83 M triangles |
| Balanced | 527 calls / 0.46 M triangles | 743 calls / 0.59 M triangles |

That is down 25–30% after two changes:

- Small props, parked cars and trees now have shorter draw distances than buildings
  and roads.
- A bus's passenger interior is skipped when the camera is more than 70 m away.

Buses removed from the scene (passenger mode keeps spawning them) now free their
geometry, materials and textures. Before, they leaked GPU memory.

**Frame rate:** the headless renderer is SwiftShader (CPU), so frame rate there means
nothing. No real-GPU or phone frame-rate measurements are available yet.

### Phones and tablets

The layout was checked at **844×390 landscape** and **390×844 portrait** with touch
emulation. Screenshots are in `docs/screenshots/`.

- **Driver:** steering wheel bottom-left, pedals bottom-right, dash between them.
- **Checklist:** reduced to a single chip showing the next step.
- **Keyboard help:** hidden on touch screens.
- **Safe areas:** respected through `env(safe-area-inset-*)`.
- **Menu:** compact on short screens; the setup panel scrolls.

### Night and rain

- **Rain:**
  - an overcast cloud deck replaces the clear sky;
  - wet, darker asphalt and road paint;
  - puddles with animated raindrop rings;
  - raindrops on the windscreen, which the wipers clear along their real sweep arcs.
- **Night:**
  - low-beam spotlights on the driven or ridden bus;
  - LED cabin lighting in both sections;
  - lit windows and lamp pools.

### Other fixes

- Teleporting the bus no longer counts the skipped stops as missed.
- The **K** key toggles automatic kneeling. The help text listed it before it existed.
- All UI text follows the language setting (Bulgarian or English). In-world text stays
  Bulgarian: signs, announcements and stop names.
- A standing passenger can no longer be drawn inside the player's head.

## Earlier milestones

1. **Data pipeline** (`tools/`)
   - Overture Maps (OSM) roads, buildings, stops, signals, crossings, trees and land use
     for the corridor.
   - Terrarium elevation.
   - Route 280 routed per direction by official stop code.
   - Packed into `src/data/world.pack.b64`.
2. **Logic modules with unit tests**
   - Route data, stop manager, announcement manager and destination display.
   - Door controller (two-beep close, obstruction and reopen, interlock) and game state
     machine.
3. **Bus**
   - Procedural MAN Lion's City G CNG with livery, LED dot-matrix signs (front, side,
     rear, interior), inward-swinging doors, bellows, full interior and driver's cab.
   - Articulated physics: single-track front section, tractrix trailer, joint limits,
     6-speed automatic with torque converter, retarder, hill-hold, kneeling and
     body roll/pitch.
4. **World**
   - Junction-aware road meshes with kerbs, pavements, medians, markings and zebras.
   - Buildings with a procedural facade shader (lit windows at night).
   - Terrain splatting, vegetation, street furniture, bus stops (shelters, boards) and
     landmarks (Орлов мост eagles, Rectorate, ПЛИСКА).
5. **Gameplay**
   - Driver mode: checklist, scoring, timetable, red-light detection, return trip.
   - Passenger mode: AI buses, boarding, walking inside across the bellows, sitting,
     standing, STOP request, getting off.
   - Traffic: IDM car following and signal phases.
   - Pedestrians: crossings, waiting crowds, boarding and alighting.
6. **Audio**
   - Procedural engine (AudioWorklet), pneumatics, door beeps, ambience and three
     listening zones.
   - Bulgarian announcements via embedded clips or the device's voice.

## Open items

- **Female Bulgarian voice.** The clips are not bundled, because no TTS credentials were
  available. Run `tools/generate_announcements.py`; until then the device's voice is used.
  See [AUDIO.md](AUDIO.md).
- **Real-device testing.**
  - Frame rate on phones (especially iOS Safari memory limits).
  - Gyro steering.
  - Multi-touch edge cases.
- **Accuracy limits**, documented in `data/research/*.json`:
  - procedural facades;
  - generic traffic-signal timings;
  - estimated bus wheelbases and overhangs;
  - the unofficial timetable;
  - stop amenities not verified on site.
- **Draw calls.** Balanced still issues 500–750 draw calls. Merging the remaining
  per-material bus parts and the parked-car types would reduce this further.
