# Main
Create things

## Тролейбус 1650 · Линия 9 (trolleybus driving simulator)

`trolleybus.html` is a single, self-contained HTML file (≈1 MB, works offline) with an
interactive 3D driving simulation of Sofia's Škoda 27Tr Solaris articulated trolleybus
№1650 on line 9, from ж.к. Борово towards пл. Сточна гара. Open it in a
browser. On a phone, rotate to landscape and tap **СТАРТ**; the game goes fullscreen.

### What's inside
- **Trolleybus:** built procedurally in Sofia livery, with rigged doors (4 double doors), steered
  and spinning wheels, an articulation bellows that bends, trolley poles that follow the
  overhead wires and can come off them (dewirement), kneeling, working lights, LED destination
  displays and live rear-view mirrors.
- **Interior:** blue patterned seats on podiums over the wheel housings, orange handrails, a red
  LED next-stop display, stop buttons, validators, a wheelchair area and the driver's cab with
  its dashboard and the **Bustec BT902** informator.
- **Route:** about 4.6 km with three stops: **ж.к. Борово** (start), **20 ДКЦ** (≈2 km) and
  **36 СУ** (≈2 km further, after three turns at signalised intersections). The HUD always
  shows the remaining distance to the next stop.
- **World:** panel blocks with people on their terraces, shops, the mehana and polyclinic at
  20 ДКЦ, and at 36 СУ the park with a playground, the old school, a small market and modern
  residential blocks. There is catenary over the whole route, traffic lights with bus priority,
  moving and parked traffic, and passengers who board and alight at the doors.
- **Informator:** press **ИНФОРМАТОР**, one of the BT902 buttons, or tap the 3D unit in the cab. Each
  press plays the chime and then a Bulgarian female voice reads the next message in order:
  „Спирка жилищен комплекс Борово“ → „Следваща спирка 20 диагностично-консултативен център“
  → „Следваща спирка 36-то средно образователно училище“.
  The voice comes from the device's Web Speech voices. If no Bulgarian voice is installed,
  the text is shown as a subtitle instead; Android and iOS usually include one. You can pick a
  voice in the menu (☰).

### Controls
| | Touch | Keyboard |
|---|---|---|
| Walk | left stick, drag to look | W A S D / arrows, Shift = run |
| Sit in the driver's seat | walk in through door 1, then **ШОФЬОРСКОТО МЯСТО** | F |
| Steer | drag the steering wheel (bottom left) | A / D |
| Throttle / brake | pedals (bottom right) | W / S, Space = full brake |
| Doors (all / single) | **ВРАТИ**, **1–4** | O |
| Informator | **ИНФОРМ.**, BT902 buttons | I / Enter |
| Gears, parking brake | **D N R**, **P** | 1 2 3, P |
| Indicators, hazards, horn | ◄ ▲ ► 📯 | Q / E, H |
| Re-raise poles, kneeling | **ЩАНГИ**, **КЛЯКАНЕ** | T, K |
| Camera (cab / outside / saloon / cinematic) | 🎥, drag to look, pinch to zoom | C |

Graphics quality, dynamic resolution, mirrors, shadows, tilt steering and volume are in the ☰ menu.

### Building from source
```
npm install
node build.mjs        # minified → trolleybus.html
node build.mjs --dev  # unminified, for debugging
```
Sources are in `src/`: `bus/` (model, materials, displays), `world/` (roads, catenary,
buildings, layout, vegetation, terrain), `sim/` (bus physics, traffic, signals, people,
informator), plus the engine, camera, UI and audio. three.js is bundled into the HTML, so
the page needs no network access. `tools/shots.mjs` renders headless screenshots with
Playwright for visual checks.
