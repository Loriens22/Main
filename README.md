# Main
Create things

## Sofia Metro (`sofia-metro.html`)

A first-person 3D ride along a Sofia Metro line, in one HTML file. Open `sofia-metro.html` in a current desktop or mobile browser (Chrome, Edge, Firefox, Safari). It needs an internet connection the first time, because three.js loads from `cdn.jsdelivr.net` and the fonts from Google Fonts.

### What's in it

- **The line**, with the real distances between stations:
  Сливница → Люлин (2 km) → Западен парк (3 km) → Вардар (2.5 km) → Константин Величков (3.7 km) → Опълченска (2 km) → Сердика (1.4 km) → СУ „Св. Климент Охридски“ (1.1 km). 15.7 km in total. The tunnels curve and dip between stations, and the tracks spread apart to reach each island platform.
- **Eight stations**, each modelled after its reference photos: marble panels and orange benches at Сливница, white marble pillars and purple seats at Люлин, green circle-relief tiles at Западен парк, glossy red panels at Вардар, red ducts and zig-zag tiles at Константин Величков, dark blue panels and a stepped louvre ceiling at Опълченска, a wavy mesh vault with teal columns at Сердика, and an undulating blue ceiling at СУ. Every station has stairs with moving escalators, direction signs, an LED line map, a next-train board, signals and "СТОП" boards, and most have adverts.
- **The train**: ivory body with a blue stripe, blue door frames and roof, a raked cab front with the emblem and paired headlights, a green LED destination display, car numbers (2024 …) and sliding doors. The interior follows photo 4: grey seats with cracked vinyl, green grab poles, adverts in the ceiling coves and light boxes. Wheels turn, cars sway, the lights flicker over current-rail gaps.
- **Train operation**: automatic driving with jerk-limited acceleration and braking to the stop mark, door cycles with chimes, dwell times, a second train in the other direction that passes you in the tunnel, and reversal at the terminus if you stay on board.
- **Announcements**: the exact Bulgarian and English phrases on arrival and at door closing, a chime before each one, subtitles, and an informator (red LED running text plus a route strip) in the HUD and inside the cars. Bulgarian lines use a female voice and English lines a male voice, picked from the voices your browser offers. You can change them in Menu → Settings.
- **Sound**, all synthesised: traction motors, gear whine, rolling noise, rail-joint clacks, flange squeal on curves, pneumatic doors, the brake-release hiss, station reverb, crowd murmur, escalator hum and footsteps.
- **Passengers** who wait at the platform edge, sit on benches, board through the nearest door, ride and get off.
- **Driving**: sit in the leading cab's driver's seat to drive yourself.
- **Graphics**: PBR materials with procedurally generated albedo, normal and roughness maps; image-based lighting captured from every station; mirror-like polished floors; bloom, ACES tone mapping, film grain and vignette. Quality presets go from Low to Ultra, and resolution scales automatically to hold the frame rate.

### Controls

| Desktop | Action |
|---|---|
| Click | capture the mouse |
| W A S D, mouse | walk and look |
| Shift | run |
| E | sit, stand, take the driver's seat |
| V | camera: first person, chase, cinematic |
| T | time ×1, ×2, ×4, ×8 |
| N | skip the dwell, or bring the next train closer |
| I | informator on or off |
| M | mute |
| Esc | menu: jump to any station, settings, help |
| In the cab: W / S, Space, O, C, P | controller up/down, emergency brake, open doors, close doors, back to automatic |

On phones and tablets, drag on the left side of the screen to walk and on the right side to look. The on-screen buttons are Use, Run, Skip, time, camera and menu. In the cab you also get a controller slider and a Doors button. Phones start on the Low graphics preset; you can raise it in the menu.
