# Sofia Public Transport — Bus 280

A 3D bus simulator of Sofia bus line **280**, СУ „Св. Климент Охридски“ ↔ Студентски град,
driven with a MAN Lion's City G CNG articulated bus. The whole game is **one HTML file**
(`index.html`, also copied to `dist/sofia-bus-280.html`). Open it in a desktop or mobile
browser with WebGL2. It works offline: no server, CDN or network access is needed.

![modes](docs/screenshots/driver-cab.png)

## Playing

Open `index.html`, pick **Шофьор** (driver) or **Пътник** (passenger), choose direction,
fleet number, time of day and weather, then start.

### Driver mode

- **Before departing:** start the engine (**I**), close the doors (**C**), release the
  parking brake (**P**), then select **D** (**1**).
- **Stops:** pull in to the kerb at each stop with the front door at the stop pole,
  open the doors (**O**), wait for boarding and alighting, then close them (**C**).
- **Door closing:** close request → beep 1 → beep 2 → the leaves close. Anyone in the
  doorway makes them reopen.
- **Interlock:** while any door is open, the throttle is cut and the bus-stop brake holds
  the bus.
- **Scoring:** comfort (jerk and lateral g), speed limits, kerb strikes, stop accuracy,
  red lights and punctuality against the timetable.
- **Terminal:** at the end of the line the destination signs switch over, and you can
  drive the return trip.

| Key | Action |
| --- | --- |
| W / S, arrows | throttle / brake |
| A / D | steer |
| 1 / 2 / 3 | D / N / R |
| P | parking brake |
| O / C | open doors / close doors (two beeps) |
| F | open the front door only |
| Q / E | indicators |
| H | hazard lights |
| L | headlights |
| Y | wipers (off / interval / fast) |
| K | automatic kneeling at stops on / off |
| T | destination sign: route / depot / off |
| R | recover onto the route (when stopped) |
| Space | horn |
| Tab | camera (cab, follow, front, side, articulation joint, free) |
| mouse | look around |
| Esc | pause |

### Passenger mode

You start on the pavement at a real stop on the line. The next bus 280 arrives with
its own AI driver. If you miss it, the next one follows.

| Key | Action |
| --- | --- |
| WASD | walk |
| mouse | look |
| E | board when near an open door; sit or stand inside; get off at an open door |
| B | stop request (bell) |
| G | hold on |
| Tab | eyes or cinematic camera |

Inside, you can walk through the bellows into the rear section. Other passengers board,
sit, stand and get off. The on-board display and the announcements give the next stop.

### Touch devices

Phones and tablets get on-screen controls automatically: a steering wheel, pedals, a
gear selector, door buttons and a camera button for the driver, and a walk stick plus
action buttons for the passenger. The controls respect the safe areas of
notched screens. Force the touch layout on desktop with `?touch`.

## Settings

| Setting | Options |
| --- | --- |
| Language | Bulgarian (default) or English UI |
| Graphics | quality preset **Ultra / High / Balanced** (auto-detected on first start), render scale, FPS counter |
| Audio | master, engine, voice, ambience and effects volumes |
| Voice | Bulgarian voice selection and a test button |
| Door beep | frequency, with a test button |
| Controls | mouse sensitivity, invert Y, gyro steering on phones, touch control size |

Settings and progress are stored in `localStorage` in the browser.

URL parameters for testing:

| Parameter | Effect |
| --- | --- |
| `q=ultra\|high\|balanced` | quality preset |
| `h=21.5` | time of day |
| `w=clear\|cloudy\|rain` | weather |
| `autostart=driver\|passenger` | skip the menu |
| `dir=A\|B` | direction |
| `stop=N` | passenger start stop |
| `fleet=3145` | fleet number |
| `touch` | force touch controls |
| `scene=bus` | bus model studio |
| `memlog` | log heap per loading stage |

## Announcements and voice

The stop announcements are in Bulgarian:

- **„Следваща спирка X.“** shortly after leaving a stop.
- **„Спирка X.“** on approach. The trigger distance grows with speed, and messages
  never overlap.

The voice is chosen in this order:

1. **Embedded clips** in `src/data/voice-clips.json`. This file is **empty in this
   build**. Generate it with `tools/generate_announcements.py` (Azure
   `bg-BG-KalinaNeural`, Google `bg-BG`, or your own recordings), then rebuild.
2. **The device's Bulgarian voice** (Web Speech API), preferring female voices.
3. **Text only:** a chime plus subtitles when the device has no Bulgarian voice.

The game never reads Bulgarian with an English voice. See [docs/AUDIO.md](docs/AUDIO.md).

## Building

```sh
npm install           # esbuild + three
npm test              # unit tests (route, stops, announcements, doors, state machine)
npm run build         # -> index.html and dist/sofia-bus-280.html (single file, ~10 MB)
node build.mjs --dev  # unminified with inline source maps
```

Rebuilding the map data from scratch (Python 3 with `pyarrow`, `shapely`, `numpy`,
`Pillow`) downloads Overture Maps and terrain tiles:

```sh
npm run data          # tools/rebuild_data.sh
node tools/make_manifest.mjs
```

## Data and accuracy

- **Map data:** roads, buildings, stops, signals, crossings, trees and land use come from
  **OpenStreetMap** via **Overture Maps** (ODbL, © OpenStreetMap contributors).
- **Elevation:** Mapzen/AWS Terrarium tiles.
- **Stops:** matched by their official stop codes.
- **Routing:** each direction is routed independently on the real one-way street network.
- **No Google data:** no Google Maps or Street View imagery or data is used.
- **Research manifest:** `data/research/route280_manifest.json` lists every stop with
  coordinates, sources, amenities, confidence and open discrepancies. Unresolved points
  are listed there honestly; for example, the building facades are procedural, not
  photographic.
- **Bus model:** `data/research/bus_reference.json` documents the dimensions and
  behaviour used for the bus, including what is estimated rather than verified.

## Code layout

| Folder | Contents |
| --- | --- |
| `src/core` | projection, maths, path sampling, seeded random |
| `src/gameplay` | route data, stop manager, announcements, destination display, bus entity, AI driver, traffic, pedestrians, scoring, state machine (pure logic is unit-tested) |
| `src/vehicle` | bus dimensions, articulated physics, door controller, procedural bus model, LED dot-matrix signs |
| `src/world` | heightfield, terrain, road network and meshes, buildings (facade shader), street furniture, vegetation, landmarks, spatial index |
| `src/render` | renderer and post-processing, sky, cameras, procedural textures, weather, bus lights |
| `src/audio` | procedural engine (AudioWorklet), doors, ambience, chime; voice announcer |
| `src/ui` | HUD, menus, input, touch controls, i18n |
| `src/game` | game modes, settings |
| `tools` | data pipeline, headless screenshot harness, manifest and announcement generators |
| `tests` | `node --test` unit tests |

Progress log: [docs/PROGRESS.md](docs/PROGRESS.md).

## Licences

- **Code:** in this repository.
- **Map data:** © OpenStreetMap contributors, ODbL 1.0, via Overture Maps Foundation.
- **Three.js:** MIT.
- **Livery and logos:** the bus livery, lion badge and graphics are drawn procedurally
  as an approximation for this simulator. They are not the operator's or MAN's artwork.
