# Main
Create things

## Sofia Metro (`sofia-metro.html`)

A first-person 3D ride along a Sofia Metro line, in one HTML file. Open `sofia-metro.html` in a current desktop or mobile browser (Chrome, Edge, Firefox, Safari). It needs an internet connection the first time, because three.js loads from `cdn.jsdelivr.net` and the fonts from Google Fonts.

### What's in it

- **The line**: 19 stations over 40.05 km, with the real distances between them.
  Сливница → Люлин (2 km) → Западен парк (3 km) → Вардар (2.5 km) → Константин Величков (3.7 km) → Опълченска (2 km) → Сердика (1.4 km) → СУ „Св. Климент Охридски“ (1.1 km) → Стадион Васил Левски (1 km) → Жолио Кюри (4 km) → Г.М. Димитров (1.2 km) → Мусагеница (1.1 km) → Младост 1 (1.3 km) → Младост 3 (3 km) → Интер Експо Център – Цариградско шосе (2.4 km) → Дружба (2.6 km) → Искърско шосе (2.8 km) → Софийска Света Гора (2.95 km) → Летище София (2 km).
  The tunnels curve and dip between stations. The first eight stations have island platforms; the others have side platforms.
- **Open-air sections**: after Жолио Кюри the line climbs out into a wavy glass tube for 800 m, then goes underground for the last 400 m to Г.М. Димитров. From there it runs 800 m underground, then 300 m in the open to Мусагеница, an open-air station under a glass roof. After Мусагеница come 900 m above ground and 400 m underground to Младост 1. Along these stretches you get sky, sun, clouds, grass, trees, street lamps, housing blocks and moving traffic on Цариградско шосе.
- **To the airport**: 2 km after Искърско шосе the line leaves the tunnel through a portal. For 950 m it runs in an arched polycarbonate tube, first in a cutting, then on an embankment, then up onto a girder to the elevated Софийска Света Гора. The last 2 km to Летище София are all above ground:
  - a short covered tube, then an open viaduct on piers with parapets, lamp posts and handrails;
  - the airport's wide metallic entrance barrel;
  - the terminus, where the rails end at buffer stops.

  Along the way: dry fields, a boulevard with traffic, office buildings and warehouses, streets passing under the viaduct. At the airport: Terminal 2 with its wave roof, the control tower, the apron with parked aircraft and jet bridges, car parks, the elevated departures road, and a runway where aircraft take off and land. Vitosha and Stara Planina stand on the horizon.
- **Time of day**: follows your clock by default, with the sun placed for Sofia. Menu → Settings has fixed presets from sunrise to night. At night the blocks' windows, the terminal, the street lamps and the tube lights come on, and the open-air stations switch to their own lamps.
- **Weather** (Menu → Settings: Auto, Clear, Overcast, Rain): cloud cover, a grey sky and weaker sun, rain falling outside (not under the station roofs or the tubes), wet glossy concrete and roads, and the sound of rain in the open air.
- **Stations**: each is modelled after its reference photos.
  - Сливница: marble panels, orange benches.
  - Люлин: white marble pillars, purple seats.
  - Западен парк: green circle-relief tiles.
  - Вардар: glossy red panels.
  - Константин Величков: red ducts, zig-zag tiles.
  - Опълченска: dark blue panels, stepped louvre ceiling.
  - Сердика: wavy mesh vault, teal columns.
  - СУ: undulating blue ceiling.
  - Стадион Васил Левски: red ducts, turquoise oval lights, beige-pink tiles.
  - Жолио Кюри: blue walls, white ovals with dark-red discs, black curved ribs.
  - Г.М. Димитров: terracotta tiles, grey angled panels, orange seats.
  - Мусагеница: open-air hall with green arches, yellow shells and a blue glass roof.
  - Младост 1: yellow marble, blue tile bands, transverse silver vaults.
  - Младост 3: orange and cream triangles, white folded light structures.
  - Цариградско шосе: sage cylindrical columns, slatted ceiling.
  - Дружба: green glass walls with tree motifs, a wooden slatted ceiling with round lights. There were no photos of Дружба, so it is built from the written description.
  - Искърско шосе: glossy mauve and beige tiles, grey angled struts, square amber lanterns, red/green direction signs, slatted steel benches.
  - Софийска Света Гора: elevated; teal steel arches under a glass roof, leaning glazing with lime-green accents, the name on a green fascia, ticket gates and a police booth, the tube mouths at both ends, a stainless "belly" and columns underneath.
  - Летище София: elevated terminus; a white space-frame vault with glass walls onto the airfield, a polished marble floor with dark inlays, sky murals, pendant lamps, planters with trees, stainless benches on marble plinths.

  At side-platform stations you can cross to the other platform: at the top of the stairs underground, at the ticket gates at the elevated stations.
- **Three trains**, and any arrival can be any of them:
  - **Метровагон 81-740 (Rusich)**: 4 cars, car numbers 2024 …. Ivory body with a blue stripe, blue door frames and roof. Inside: grey seats and green grab poles.
  - **Škoda Varsovia**: 3 cars, car numbers 4002 …, with open gangways you can walk through. Outside: white body with a red lower band and yellow stripes, a black front with a green LED destination display (M4 badge), LED headlights, black doors. Inside: grey seats, red handrails and Y-shaped poles, warm LED strips along the ceiling, and passenger screens showing M4, the destination and the route.
  - **Green-and-white train**: 4 cars.
    - Outside: white with a ribbed lower body, a green window band and a green swoosh at the cab. The panoramic windscreen has a green frame, wipers, an amber LED destination display and an "A11" route card. Four round LED headlights sit in green pods, with the black winged M between them and red markers on the roof. There are set numbers on the cab sides, bogies with coil springs, and a coupler with hoses.
    - Inside: cream walls, beige seats with dark grey side screens and tall end panels, green poles and curved handrails, stainless overhead bars, two continuous LED lines, a speckled grey floor and a wheelchair bay. The end doors swing open as you walk up to them.
    - Door warning: a beeper starts at a moderate pace with the closing announcement, speeds up, then turns into a loud, fast two-tone alarm while the doors actually close.
    - Screens: modern TFT displays in every car, and the same design in the HUD. They show the direction, the clock, the next stop or arrival with the exit side, transfers, time and distance to the next station, and a line diagram that scrolls with the train.
- **Train operation**:
  - Automatic driving with jerk-limited acceleration and braking to the stop mark.
  - Door cycles with chimes and dwell times.
  - A second train in the other direction that passes you on the way.
  - Reversal at either terminus if you stay on board.
- **Announcements**: the exact Bulgarian and English phrases on arrival and at door closing, each after a chime, with subtitles.
  - The luggage reminder plays at Г.М. Димитров, Мусагеница, Младост 3 and Софийска Света Гора.
  - The transfer message plays only at Младост 1: "Връзка с метровлаковете за Бизнес парк" / "Mladost 1. Transfer for metro trains to the Business Park".
  - The voices are recordings built into the file, so they play in every browser and in in-app browsers that have no speech engine. Bulgarian is a female voice, English a male voice.
  - Menu → Settings can switch to your browser's own speech voices instead.
  - The informator (red LED running text plus a route strip) runs in the HUD and inside the cars.
- **Sound**, all synthesised:
  - Train: traction motors, gear whine, rolling noise, rail-joint clacks, flange squeal on curves.
  - Doors and brakes: pneumatic doors, the brake-release hiss, the green train's escalating door beeper.
  - Weather: rain in the open air.
  - Stations: reverb, crowd murmur, escalator hum, footsteps.
- **Passengers** who wait at the platform edge, sit on benches, board through the nearest door, ride and get off.
- **Driving**: sit in the leading cab's driver's seat to drive any of the three trains yourself.
- **Graphics**:
  - PBR materials with procedurally generated albedo, normal and roughness maps.
  - Image-based lighting captured from every station and from the sky.
  - Mirror-like polished floors, and sun shadows outdoors on High and Ultra.
  - Bloom, ACES tone mapping, film grain and vignette.
  - Quality presets from Low to Ultra; resolution scales automatically to hold the frame rate.
  - Stations are built as you approach them and freed behind you, which keeps memory use low on phones.

### Controls

| Desktop | Action |
|---|---|
| Click | capture the mouse |
| W A S D, mouse | walk and look |
| Shift | run |
| E | sit, stand, take the driver's seat, cross to the other platform (top of the stairs, or at the ticket gates) |
| V | camera: first person, chase, cinematic |
| T | time ×1, ×2, ×4, ×8 |
| N | skip the dwell, or bring the next train closer |
| I | informator on or off |
| M | mute |
| Esc | menu: jump to any station, settings, help |
| In the cab: W / S, Space, O, C, P | controller up/down, emergency brake, open doors, close doors, back to automatic |

On phones and tablets:
- Drag on the left side of the screen to walk and on the right side to look.
- The on-screen buttons are Use, Run, Skip, time, camera and menu.
- In the cab you also get a controller slider and a Doors button.
- Phones start on the Low graphics preset; you can raise it in the menu.

### About the recorded voices

The announcements were synthesised offline with the Piper neural TTS voices below and embedded as MP3.
- **Bulgarian**: `ru_RU-irina-medium`, driven with Bulgarian phonemes and hand-set stress, so it may carry a slight accent. Its model card gives the dataset as RHVoice (https://github.com/RHVoice/RHVoice), with the licence listed as "Unknown".
- **English**: `en_GB-alan-medium`. Its model card points to https://github.com/MycroftAI/mimic3-voices for the dataset licence.

Check both licences before redistributing the file commercially.
