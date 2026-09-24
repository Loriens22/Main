# Main
Create things

## Градски транспорт София: тролейбус 9 и трамвай 7 (driving simulator)

`trolleybus.html` is a single, self-contained HTML file (≈1.2 MB, works offline) with an
interactive 3D driving simulation of two Sofia public-transport lines. Open it in a browser and
pick a line on the start screen:

- **Тролейбус 1650, линия 9:** Škoda 27Tr Solaris, from ж.к. Борово to бул. „Гоце Делчев“.
- **Трамвай 2312, линия 7:** Pesa Swing 122NaSF, from кв. Манастирски ливади towards
  Метростанция „Хан Кубрат“ (the modelled section ends at бул. „Пенчо Славейков“).

On a phone, rotate to landscape and tap **СТАРТ**; the game goes fullscreen. `trolleybus.html?line=7`
or `?line=9` skips the picker, and **Смяна на линията** in the ☰ menu brings it back.

### Line 9: trolleybus
- **Vehicle:** built procedurally in Sofia livery, with 4 rigged double doors, steered wheels, a
  bending articulation, trolley poles that follow the wires and can come off them, kneeling,
  lights, LED destination displays and live mirrors. Inside are blue seats on podiums, orange
  handrails, stop buttons, validators and the cab with the **Bustec BT902** informator.
- **Route:** about 7 km with four stops: **ж.к. Борово**, **20 ДКЦ**, **36 СУ** and
  **бул. „Гоце Делчев“** (link to buses 76 and 74). There are six signalised junctions with
  left and right turns.
- **Last section:** the 3 km extension runs past two mini-parks, four modern office buildings
  and many kinds of panel blocks to the Гоце Делчев junction, which other lines also use. The
  stop is by Южен парк with its cafés. Opposite are two old blocks, industrial halls and a bank
  office, and there are pedestrian underpasses at the junction.

### Line 7: tram
- **Vehicle:** a five-section Pesa Swing 122NaSF (31.7 m, 2.4 m wide) in cobalt blue and white
  with the yellow nose and orange stripe, fleet number 2312. It has three bogies, articulated
  bellows, a pantograph that follows the contact wire, and plug doors on the right. The
  destination is shown on amber LED displays and inside on TFT screens. The interior has 2+2
  and longitudinal seats in dark blue-grey fabric, orange stanchions and straps, and LED
  ceiling light strips. The cab has a glass partition, a master controller, live desk screens
  (speed, traction/brake, doors, line voltage, train schematic) and the BT902.
- **Route:** about 3.8 km on бул. „България“ with a central grassed tram reservation, ballasted
  1009 mm track that becomes embedded track at the three signalised junctions, a centre-pole
  overhead line, and a balloon loop at the terminus. It turns left onto бул. „Пенчо Славейков“.
- **Stops:** each announcement is read by the informator.
  - **кв. Манастирски ливади** (link to tram 27): summer, modern residential blocks and
    purple-leaf plum trees around the loop.
  - **бул. „Гоце Делчев“:** the glazed-corner block with the notary, the dark glass tower, the
    curved СОТ 161 office and the round KPMG tower.
  - **пл. „Ручей“** (link to buses 64 and 204): the petrol station right behind the platform,
    T-Market behind it, 1980s colour-panel blocks behind birches, and the graffiti retaining wall.
  - **ПГ по дизайн „Елисавета Вазова“:** the school, the EKO station on the right, and Южен
    парк with a flower parterre and an art garden with sculptures.
  - **бул. „Пенчо Славейков“** (link to trams 1 and 6): Hotel Millennium Sofia next to the
    stop, the bTV Media Group tower behind it, and the ОББ tower and a curved office after it.
- **Other trams:** 2314 and 2318 run the opposite direction towards Манастирски ливади. They obey
  the signals, stop at the opposite platforms with their doors open and lay over in the loop.
- **Sound:** traction inverter whine, wheel clicks over rail joints for every axle, flange squeal
  in tight curves and the tram bell.

### Shared features
- **Autopilot (АВТО / G):** the vehicle drives itself, keeps to curve speeds and the limit,
  obeys signals, yields when turning left and stops accurately at every stop. You still open and
  close the doors. Once the doors are closed and you have triggered the next-stop announcement
  (**ИНФОРМ.**), it drives on. Touching the controls hands control back to you.
- **Passengers** board and alight at the doors, press the stop button and some ride beyond the
  modelled section. There are pedestrians, moving and parked traffic, traffic lights with public
  transport priority, and the HUD always shows the remaining distance to the next stop.
- **Informator:** each press of **ИНФОРМ.**, a BT902 button, or the 3D unit in the cab plays the
  chime, and a Bulgarian female voice (Web Speech) reads the next message. Without a Bulgarian
  voice the text is shown as a subtitle. You can choose a voice in the ☰ menu.
- **Graphics:** PBR materials with sky lighting, soft shadows, GTAO ambient occlusion, bloom,
  ACES tone mapping with colour grading, parallax-occlusion windows on every facade, and four
  times of day. Quality presets scale this down for phones.

### Controls
| | Touch | Keyboard |
|---|---|---|
| Walk | left stick, drag to look | W A S D / arrows, Shift = run |
| Sit in the driver's seat | walk in through door 1, then **ШОФЬОРСКОТО МЯСТО** | F |
| Trolleybus: steer / pedals | steering wheel (bottom left), pedals (bottom right) | A / D, W / S, Space = full brake |
| Tram: master controller | lever (bottom left): up = traction, down = brake, bottom = emergency; it stays where you release it | W / S move it, X = neutral, Space = emergency |
| Doors (all / single) | **ВРАТИ**, **1–4** | O |
| Informator | **ИНФОРМ.**, BT902 buttons | I / Enter |
| Autopilot | **АВТО** | G |
| Direction, parking brake | **D N R**, **P** | 1 2 3, P |
| Indicators, hazards, horn / bell | ◄ ▲ ► 📯 / 🔔 | Q / E, H |
| Poles / pantograph | **ЩАНГИ** / **ПАНТ.** | T |
| Kneeling / sanders | **КЛЯК.** / **ПЯСЪК** | K |
| Camera (cab / outside / saloon / cinematic) | 🎥, drag to look, pinch to zoom | C |

Graphics quality, time of day, dynamic resolution, mirrors, shadows, tilt steering, volume and
the line switch are in the ☰ menu. Tap the BT902 header to fold the unit down to its screen.

### Building from source
```
npm install
node build.mjs        # minified → trolleybus.html
node build.mjs --dev  # unminified, for debugging
```
Sources are in `src/`:
- `bus/` and `tram/`: vehicle models, materials and displays.
- `world/`: roads, catenary, buildings, landmarks, the per-line layouts and vegetation.
- `sim/`: bus and tram physics, traffic, signals, people, the informator and the autopilot.
- `route.js` and `tramRoute.js`: the two line geometries.
- The engine, post-processing, camera, UI and audio.

three.js is bundled into the HTML, so the page needs no network access.
`tools/shots.mjs list.json` renders headless screenshots with Playwright. Set `LINE=7` to use
the tram line, and `__dbg.auto(n)` runs the autopilot for regression checks.
