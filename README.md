# Main
Create things

## Sofia Metro (`sofia-metro.html`)

A first-person 3D ride along a Sofia Metro line, in one HTML file. Open `sofia-metro.html` in a current desktop or mobile browser (Chrome, Edge, Firefox, Safari). It needs an internet connection the first time, because three.js loads from `cdn.jsdelivr.net` and the fonts from Google Fonts.

### What's in it

- **The line**: 32 stations over 66.86 km, with the real distances between them.
  - From the western terminus: Витоша → Джеймс Баучер (1.6 km) → Европейски съюз (1.8 km) → Национален Дворец на културата (НДК, 2.8 km). All three are underground, with their own curves and dips in the tunnels.
  - The western branch: НДК → Сердика 2 (1.9 km) → Лъвов мост (2.5 km) → Централна ЖП гара (2.2 km) → Княгиня Мария Луиза (1.9 km) → Хан Кубрат (1.2 km) → Надежда (1.8 km) → Бели Дунав (2.5 km) → Ломско шосе (2.51 km) → Обеля (1.8 km) → Сливница (2.3 km).
  - Then on to the airport: Сливница → Люлин (2 km) → Западен парк (3 km) → Вардар (2.5 km) → Константин Величков (3.7 km) → Опълченска (2 km) → Сердика (1.4 km) → СУ „Св. Климент Охридски“ (1.1 km) → Стадион Васил Левски (1 km) → Жолио Кюри (4 km) → Г.М. Димитров (1.2 km) → Мусагеница (1.1 km) → Младост 1 (1.3 km) → Младост 3 (3 km) → Интер Експо Център – Цариградско шосе (2.4 km) → Дружба (2.6 km) → Искърско шосе (2.8 km) → Софийска Света Гора (2.95 km) → Летище София (2 km).
  The tunnels curve and dip between stations. Сливница to СУ, НДК, Европейски съюз and Витоша have island platforms; the others have side platforms. Westbound trains run to Витоша, eastbound trains to Летище София.
- **West of Сливница**: the line climbs out of the tunnel through a portal and an open cutting with mesh fences to Обеля, a station at ground level next to the metro depot. The depot has a sandstone office building with a green roof ("МЕТРО ДЕПО ОБЕЛЯ"), a stabling yard with parked trains of all four types, and a maintenance shed. From Обеля a covered tube runs 1.8 km on an embankment and then a viaduct to the elevated Ломско шосе. The tube has ribbed grey sheeting low down, clear glazing, blue ribs and LED lines. After the station, 510 m more of covered tube ramp down to a second portal, followed by 2 km of tunnel to Бели Дунав. Outside: Ломско шосе boulevard with traffic, streets passing under the viaduct, panel-block estates and lawns.
- **Open-air sections**: after Жолио Кюри the line climbs out into a wavy glass tube for 800 m, then goes underground for the last 400 m to Г.М. Димитров. From there it runs 800 m underground, then 300 m in the open to Мусагеница, an open-air station under a glass roof. After Мусагеница come 900 m above ground and 400 m underground to Младост 1. Along these stretches you get sky, sun, clouds, grass, trees, street lamps, housing blocks and moving traffic on Цариградско шосе.
- **To the airport**: 2 km after Искърско шосе the line leaves the tunnel through a portal. For 950 m it runs in an arched polycarbonate tube, first in a cutting, then on an embankment, then up onto a girder to the elevated Софийска Света Гора. The last 2 km to Летище София are all above ground:
  - a short covered tube, then an open viaduct on piers with parapets, lamp posts and handrails;
  - the airport's wide metallic entrance barrel;
  - the terminus, where the rails end at buffer stops.

  Along the way: dry fields, a boulevard with traffic, office buildings and warehouses, streets passing under the viaduct. At the airport: Terminal 2 with its wave roof, the control tower, the apron with parked aircraft and jet bridges, car parks, the elevated departures road, and a runway where aircraft take off and land. Vitosha and Stara Planina stand on the horizon.
- **Time of day**: follows your clock by default, with the sun placed for Sofia. Menu → Settings has fixed presets from sunrise to night. At night the blocks' windows, the terminal, the street lamps and the tube lights come on, and the open-air stations switch to their own lamps.
- **Weather** (Menu → Settings: Auto, Clear, Overcast, Rain): cloud cover, a grey sky and weaker sun, rain falling outside (not under the station roofs or the tubes), wet glossy concrete and roads, and the sound of rain in the open air.
- **Stations**: each is modelled after its reference photos.
  - Витоша: island terminus. Glossy light-green tiles between a grey granite "mountain" (the outline of Vitosha) with a dark-green mosaic ridge dotted in yellow, and a cream frieze with a wavy edge. Black glossy pilasters and the name in dark green. A grey stepped vault with a turquoise crown and rows of downlights. Large dark-brown conical pendant lamps with white diffusers. A speckled polished floor with mosaic medallions, wooden-slat benches, escalators with stainless sides, and screens reading "Крайна станция / Final station".
  - Джеймс Баучер: side platforms. A white ceiling with terracotta free-form bulkheads and irregular light panels set into them. Grey granite walls with dark panels in brown frames, the name in silver on the big panels. A row of brown pillars between the tracks carries posters, one of them a portrait of James Bourchier. A light polished floor with dark swirling inlays, and silver benches.
  - Европейски съюз: island platform. A maroon free-form ceiling with white back-lit cut-outs, held by maroon Y-shaped brackets on the centre line, and maroon beams with LED lines. Beige walls with tone-on-tone organic shapes between maroon-tiled pilasters, over a band of dark glass, with the name in dark lettering. Speckled granite with maroon bands, silver seat rows, and a large stainless euro coin with the twelve stars.
  - НДК: island station (it was the terminus before the extension to Витоша). Glossy burgundy walls over a wavy grey-green band with a stainless trim. A silver relief of the palace. A white vault with LED lines and a red ribbon that winds along the hall and coils into spirals with purple lights. A polished floor with white wavy inlays, curved stainless tube benches and purple sign posts.
  - Сердика 2: a caramel vault with arched ribs and rows of round downlights. Curved bronze brackets hold tubular lamps. There are glass cases with Roman finds and granite benches with stainless seats. The floor has a checkerboard band. Stairs at the end lead up to a bridge across the tracks. It also has the blue/green Обеля / exit sign.
  - Лъвов мост: grey stone and terracotta walls with a crenellated band and a stone arch over the name. A stone lion relief and ring motifs. Black cast-iron double lamps along the platforms, wall lanterns, a warm-lit cove ceiling and wooden benches.
  - Централна ЖП гара: beige walls with blue bands and a stepped blue skirting, and cream pillars with two blue bands. Blue inverted-pyramid ceiling lamps and the green/blue Изход Банишора / Център sign.
  - Мария Луиза: light-green pillars with beige bands, curved green ribbed fascias with light lines, sand-coloured walls with dark-green lettering, and pixel mosaics.
  - Хан Кубрат: sage and khaki tiles in a stepped skyline, red lettering under a yellow beam with downlights, and grey curved panels over the tracks. The tracks curve away at one end.
  - Надежда: a gold quilted vault over the name side, with big red letters on cream tiles. A glossy orange wall curves into a polished metal ceiling on granite pillars. Orange chairs, chrome benches, and terracotta stripes in the floor.
  - Бели Дунав: cream tiles with light-green stripes, marble pilasters and green leaf murals. A geometric ceiling with round downlights, spotlight bars, yellow floor bands and green benches.
  - Ломско шосе: elevated. Blue lattice arches under a glass barrel and a coral spine beam with lighting. Glass walls with louvres and teal accents, and orange cube seats. Outside, the bright-blue station building with the round window and the blue arched canopy over the entrance.
  - Обеля: a green space-frame roof with half-round dormers, orange beams carrying the luminaires, and glass side walls. Green seats on brick plinths, brick pillar boxes, and a diamond-patterned floor.
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

  At side-platform stations you can cross to the other platform: at the top of the stairs underground, at the ticket gates at Обеля and the elevated stations.
  At the western stations, small lights set into the platform edge flash while a train pulls in and stay lit while it stands.
- **Four trains**, and any arrival can be any of them:
  - **Метровагон 81-740 (Rusich)**: 4 cars, car numbers 2024 …. Ivory body with a blue stripe, blue door frames and roof. Inside: grey seats and green grab poles.
  - **Red Rusich (81-740, cream and maroon)**: 4 cars, car numbers 2069, 2014 ….
    - Outside: a cream body with a continuous maroon stripe and roofline, maroon-framed doors with small maroon blocks at stripe level, and a maroon swoosh on the cab side. The rounded cab has a panoramic windscreen in a maroon frame, two wipers, LED headlight modules in the maroon band, the polished winged M emblem and a white LED destination display.
    - Inside: white walls and ceiling, grey moquette seats (worn on the most-used places), maroon poles, rails and overhead bars, a grey floor, cool LED lighting, cartoon adverts in the cove frames, stickers on the doors and windows, and mostly-glass door leaves.
    - Screens: modern TFT displays hang from the ceiling over the door areas, with the same layout as the green train's, and the HUD switches to the modern design when you ride it.
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
  - Reversal at either terminus (Витоша and Летище София) if you stay on board.
- **Announcements**: the exact Bulgarian and English phrases on arrival and at door closing, each after a chime, with subtitles.
  - The luggage reminder plays at Джеймс Баучер, Обеля, Надежда, Княгиня Мария Луиза, Лъвов мост, Г.М. Димитров, Мусагеница, Младост 3 and Софийска Света Гора.
  - Transfer messages: Сердика 2 "Връзка с линии М2 и М4" / "Transfer to M2 and M4 metro lines", and НДК "Връзка с линия М3" / "Transfer to the M3 metro line". Both are also in the next-station announcement before them.
  - The transfer message plays only at Младост 1: "Връзка с метровлаковете за Бизнес парк" / "Mladost 1. Transfer for metro trains to the Business Park".
  - The voices are recordings built into the file, so they play in every browser and in in-app browsers that have no speech engine. Bulgarian is a female voice, English a male voice.
  - Menu → Settings can switch to your browser's own speech voices instead.
  - The informator (red LED running text plus a route strip) runs in the HUD and inside the cars. With 32 stations, the route strips and the station line maps show the part of the line around you.
- **Sound**, all synthesised:
  - Train: traction motors, gear whine, rolling noise, rail-joint clacks, flange squeal on curves.
  - Doors and brakes: pneumatic doors, the brake-release hiss, the green train's escalating door beeper.
  - Weather: rain in the open air.
  - Stations: reverb, crowd murmur, escalator hum, footsteps.
- **Passengers** who wait at the platform edge, sit on benches, board through the nearest door, ride and get off.
- **Driving**: sit in the leading cab's driver's seat to drive any of the four trains yourself.
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
