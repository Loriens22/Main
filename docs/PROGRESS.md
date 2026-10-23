# Progress log

A concise record of what was built, how it was verified, and what is still open.
The newest entries are at the top.

## 2026-10-23 — rebuild after the first play test

Feedback: the bus was not 1:1 with the photos (architecture, details, seats); the
buildings did not match reality, especially around the stops; after getting off there
should be another bus within about two minutes; the bus had no proper sound, none at all
while moving.

### Research (data/research/)

- **Bus exterior.** Pinhole cameras were fitted to photos 1–3 (plate corners, wheel
  contacts), and the lower fronts were rectified onto the plate plane. Findings:
  - belt 1.30 m, not 1.02;
  - windscreen 1.22–2.32 m, black LED header 2.30–2.86 m with a 1.72 × 0.32 m matrix;
  - door 1 sits 0.42 m further back; door 4 is behind the rear axle;
  - ram's-horn mirror on the right only, compact box mirror on the left;
  - the leaves hang down from the belt;
  - bellows are light aluminium grey.
- **Interior.** Measured from photos 4 and 5:
  - hard-shell grey seats with a charcoal cap and a grab slot, cantilevered from the wall;
  - podiums with yellow edges, 47 seats;
  - moquette only on the wheelchair-bay seat;
  - stanchions and rails, raised cab.
- **World.** Every stop pole (35) has a note covering what you see on each side, the
  stop furniture, and a building table. There are 329 building overrides
  (construction, floors, colours, windows, ground floor, shop signs), 34 landmarks, and
  stop hardware per pole.
- **Sound.** Root causes of the silence (below), a measured prototype and a sound design.

### Bus

- **Exterior** rebuilt to the survey. Run `tools/compare_bus.py` for side-by-side images.
- **Interior and cab** rebuilt to the interior spec.
- **Static parts merged.** Plain-colour parts are merged into vertex-coloured meshes
  (142 → 98 meshes, identical render).
- **Distance detail.**
  - Small trim is hidden beyond 140 m.
  - The interior is hidden beyond 70 m and casts no sun shadows.
- **Driver's view** checked: the screen post now sits beside the driver's head, and the
  sun blind is rolled up.

### Sound

Root causes:

1. **The engine worklet could not load from `file://`.** Chromium rejects `blob:`
   module URLs there, so the game fell back to a 32 Hz tone at −34 dBFS.
2. **94 % of the engine energy was below 100 Hz**, which phones cannot play.
3. **iOS was never unlocked inside the tap.**

Now:

- **Engine.** A native-node engine (no worklet): PeriodicWave firing harmonics,
  formants, roar, injector tick and turbo. Gearbox, road, wind, bellows and the air
  system are separate layers.
- **Listener zones.** Five: cab, front, rear, and outside near and far.
- **Outside.** Every bus is audible from outside with distance, Doppler and pan.
- **One-shots.** Door, brake and kneel sounds are wired to game events.
- **Start-up.** The AudioContext is created and resumed inside the tap. On iOS a
  playback audio session is set. The context recovers after interruptions and is
  silent while paused.

Measured from the real game (offline render of driver mode, cab zone):

| | RMS | Phone-weighted |
| --- | --- | --- |
| Idle | −22.9 dBFS | −29.5 dBFS |
| 30 km/h | −21.7 dBFS | −26.7 dBFS |
| 50 km/h | −17.3 dBFS | −22.0 dBFS |

Phone-weighted means after a 250 Hz high-pass. In passenger mode, the approaching bus
rises from the ambience floor (−35 dBFS phone) to −26 dBFS at the stop.

### World

- **Shop signs.** 666 real shop signs (Overture places plus the research) on the
  facades of the buildings the businesses are in, lit at night.
- **Facade shader.** It draws the researched archetypes:
  - 1960s and 1970s panel blocks with sealed joints, loggias open or glazed by owners,
    and ETICS insulation patchwork per flat;
  - EPK towers, plastered socialist brick, Stalinist and pre-war classical, modernist
    ribbon windows, curtain walls, modern residential, kiosks;
  - staircases with entrance doors;
  - AC units and satellite dishes;
  - parallax room interiors behind every window, curtains and blinds.
- **Real 3D geometry within 65 m of the route.** Balconies (slab, parapet or railing,
  owner glazing), entrance canopies with steps, cornices and copings. The geometry
  mirrors the shader's cell plan through a shared integer hash.
- **Landmarks and stop hardware.**
  - Landmarks: Rectorate, Eagles' Bridge, Aviation monument, Arena 8888, Winter Palace,
    Hristo Botev hall, campuses.
  - Stop hardware: Sofia shelters per stop, poles at the kerb, e-boards with live
    minutes.
- **Терминал Студентски град.** The spur and turn-around loop are paved 7 m wide for the
  bus.

### Passenger mode

- **Service frequency.** A bus every ~2 minutes, with a live ETA on the HUD and on the
  stop's e-board.
- **After getting off,** the next bus is already scheduled.
- **Inside the bus,** E takes the nearest free seat; you get off from an open doorway.

### Verification

- **Full-route drives with the AI driver** (`tools/route_check.cjs`):
  - A: 18/18 stops in 26 min;
  - B: 18/18 in 24 min.
- **Fixes found by those drives:**
  - The AI bus now squeezes towards the kerb for oncoming cars on narrow streets.
  - A car creeping at a waiting bus now counts as a deadlock and gives way.
- **Checks:** unit tests, `tools/smoke.sh`, phone layout at 844×390.

### Still open

- **Facade accuracy.** Most ordinary blocks are typed by typology (low confidence). No
  photos of them could be fetched: hosts such as Wikipedia, OSM and Mapillary are
  blocked by this environment's network policy.
- **Bus rear.** It is typology only, because none of the photos shows it.
- **Real-device testing.** Frame rate on phones, and iOS audio with the silent switch.
- **Female Bulgarian voice clips** are still not bundled (see AUDIO.md).

## 2026-10-22 — verification pass

### Full-route drives

An AI driver drove each direction end to end, serving every stop, at noon with traffic
and pedestrians. The test harness is `tools/shot.cjs` in headless Chromium.

Final run, after all the fixes below. The simulation is deterministic: the same build
gives the same result.

| Direction | Length | Time (simulated) | Stops served | Terminal reached | Longest halt | Contacts |
| --- | --- | --- | --- | --- | --- | --- |
| A: СУ → Студентски град | 10.66 km | 25.4 min | 18 / 18 | yes | 30 s (red light) | 1 brief touch by a turning car |
| B: Студентски град → СУ | 10.31 km | 24.9 min | 18 / 18 | yes | 27 s (red light) | 2 brief touches by turning cars |

Earlier runs exposed stalls of 135–455 s, all now fixed:

- **Grazing contacts** pinned the bus (see "Other fixes").
- **Oncoming deadlock.** The bus and an oncoming car queue each treated the other as
  "in the way" on a narrow road. Both checks now know about direction. The AI tests
  cars' oriented boxes against its own path ahead: tight clearance for oncoming cars,
  a buffer for cars ahead. Cars keep their full margin only for a bus in their lane, or
  while they are turning.

Near the Студентски град loop exit, a car and the bus could wait for each other. This
resolved only when the car was removed after 40 s. Cars blocked by a bus now give up
after 8 s, or 20 s while in view.

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

### Terminal and return trip

The terminal cycle was checked end to end in headless runs:

1. The bus arrives at Студентски град (pole 1694).
2. The signs switch to „280 СУ Св. Климент Охридски“ and the trip result appears.
3. „Обратен курс“ starts the return trip. The bus closes its doors and drives the
   turning loop.
4. It stops 0.4 m from the departure pole (1693), serves it, and continues to СК на НСА.

Bugs fixed on the way:

- Route and AI tracking kept the previous direction's position.
- A stop could count as passed while the bus was still 36 m away on the turning loop.
- Doors left open at the start were never closed by the AI.
- At the trip start the bus was placed 6 m past the first stop. It is now placed at the
  stop, with the rear following the incoming terminal link.
- That 6 m start error counted towards the stopping accuracy score; the first stop is no
  longer scored.

A keyboard/touch-input bot also drove the player's procedure for stop 1:

- engine on, doors closed, parking brake off, D;
- stopped 0.4 m from the pole ("Отлично спиране!");
- opened the doors, closed them with the two-beep sequence, and departed;
- scoring and penalties fired.

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

- **Grazing contacts.** A zero-depth touch of a pole or tree during a full-lock turn
  multiplied the bus's speed by −0.08 on every physics step. The bus was pinned for
  over two minutes; this was found in deterministic full-route runs. Speed is now
  damped only when the bus drives into an obstacle.
- **Collision penalty.** It is applied once per contact. A scrape spans many frames and
  must not be penalised on every one.
- **Prop clearance.** The swept-path margin grew to 1.0 m, because drivers cut tight
  corners slightly.
- **Older browsers.** Browsers without `DecompressionStream` (Safari < 16.4) decode the
  map with a built-in JavaScript gzip inflater. It is unit-tested byte for byte against
  zlib on the real world pack.

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
