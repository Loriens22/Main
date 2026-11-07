# Line 84 research notes: ул. Ген. Гурко – Летище София Терминал 2

Line 84 runs from ул. „Ген. Гурко“ via Orlov Most, бул. „Цариградско шосе“, Iztok, Druzhba 1 and the airport ring road to
Terminal 2. Direction A has 19 stops and direction B has 20; Terminal 1 (stop 1006) is served only in direction B and
Hermes Park (2593) only inbound. Stops, paths, terrain and the world pack are built by `tools/lines.py`,
`tools/build_route.py`, `tools/build_dem.py` and `tools/build_world.py` from Overture Maps (OSM-derived, ODbL) and the AWS
Terrarium elevation tiles.

## Reference photographs

All photographs were supplied by the user. They are kept as references only; none is used as a game texture.

| Files | Subject |
| --- | --- |
| `../ref_photos/line84/ref01-06.jpg` | SOR EBN 11 demonstrator 3639 (exterior, doors, saloon, cab) |
| `../ref_photos/line84/ref07-10.jpg` | Yutong E12 (ZK6128BEVG) 2807 / 2808 (livery, rear, saloon) |
| `../ref_photos/line84/landmark01-03.jpg` | Sofia Airport Terminal 2 (front, curbside with the tower, aerial view) |
| `../ref_photos/line84/landmark04-06.jpg` | The former Hotel Pliska, now the Central Cooperative Bank tower |
| `../ref_photos/line84/landmark07-09.jpg` | Ministry of Foreign Affairs (with the bull sculpture, the entrance canopy, the corner) |
| `../ref_photos/line84/landmark10-12.jpg` | Bulgarian Academy of Sciences (main front, corner tower, aerial view) |
| `../ref_photos/line84/landmark13-16.jpg` | The Mall, бул. „Цариградско шосе“ 115 (front, older view, entrance axis, aerial view) |

## Landmarks modelled in Blender (`tools/blender/hero/*.py`)

Every model sits on its OSM outline in the world84 pack, at the pack's terrain. Shop, bank and institution names appear
as plain lettering in generic typefaces. No logo artwork is reproduced: the airport, the bank and the state arms get
plain drawn plaques.

### Sofia Airport Terminal 2 (`airport.py`)

The model covers the terminal (#8056), the central hall (#8052-8055), the canopies (#8032 and #8042), the control tower
(#8030 and #8031), the car park (#8036-8038) and the metro station (#8040).

- **Facts:** Terminal 2 opened in December 2006 and was built by Strabag. The metro station adjoins its east side. The
  50 m control tower opened in December 2012.
- **Estimated from the photographs:**
  - canopy nose about 14.5 m high, glass prow 28 m, curtain wall 10.6 m;
  - prow profile (top radius 5 m to base radius 21 m, side half-angle 9° to 40°), drawn so that the front view
    matches photograph 1;
  - tower levels: shaft 38 m, glazed ring, collar, cab to about 48 m.
- **Placeholder OSM data:** the OSM heights (6.3 m) are placeholders. The car park roof is set 1.15 m above the
  forecourt, from the parapet in photograph 1; OSM gives 19.2 m.
- **Drawn, not copied:** the embroidery pattern on the car park roof is drawn in the style of the photographed one.
- **Generic aircraft:** the airliners are generic narrow-bodies with no airline markings.
- **Terrain:** the 16 m elevation grid sloped about 10 m across the forecourt. `tools/terrain_pads.py` levels the
  terminal, curbside, apron and the first and last 160 m of the bus paths to game y 7.0 (`tools/pads84.json`),
  with a 110 m blend. It also grades the departure road (direction B, 150-420 m) evenly at about 4 %; the
  first version left 17-20 % ramps at the path ends, which a loaded SOR could not climb. Apply it once to a
  freshly built `world84.pack.b64`.

### Central Cooperative Bank tower, ex Hotel Pliska (`ccb.py`; shared with line 280)

- **Outline:** tower #5035 (36.6 × 18.7 m, 58.6 m) and podium #5036 (7.4 m), with the same centroids in the line 280 pack.
- **Estimated:** storey height 3.2 m, the frame bands (top 3.4 m, sides 1.3 m) and the slot position.

### Ministry of Foreign Affairs (`mfa.py`; shared with line 280)

- **Outline:** #5656, a 73 × 73 m ring round a 45 × 45 m courtyard. The main front faces the boulevard.
- **Estimated:**
  - ground zone 8.4 m, three storeys of 3.3 m, cornice 1.5 m, attic 2.6 m (the OSM height of 16.5 m is lower);
  - 31 fin bays on the front;
  - the extent of the entrance canopy and of the pillar section.
- **Free rendering:** the bronze bull.

### Bulgarian Academy of Sciences (`bas.py`; shared with line 9)

- **Outline:** central block #1689 and wings #1691 and #1692; the round corner towers are fitted to the circular
  vertices of the wing outlines.
- **Estimated:** storey heights (5.2 m, 5.8 m, 4.6 m), bay widths, the dome profile and the roof pitch (38°).
- **Roofs:** the hipped roofs follow a distance field, which approximates a straight skeleton.

### The Mall (`themall.py`)

- **Outline:**
  - the mall #7419, with its entrance-hall bulge;
  - the west tower #7455;
  - the south-east towers #7410-#7417, up to 48.6 m.
- **Estimated from the photographs** (cars and people for scale):
  - shop floor 4.8 m, stripe band 4.6 m, terrace floor 3.3 m;
  - arch of the entrance hall 17.2 m;
  - west tower 31 m.

  These are higher than OSM's 9.6 m and 24.6 m.
- **Removed:** a strip mapped in front of the right wing (#7418) does not appear in the photographs.

## Gameplay checks

### Luggage passengers (`src/gameplay/PedestrianManager.js`)

- **Airport stops:** Terminal 1 and Terminal 2 (not the „Летищен център“ business park). There, larger crowds wait
  and about 80 % pull a wheeled suitcase.
- **Elsewhere:** on stops before the terminals, about 18 % of riders carry luggage and ride to Terminal 2. Walkers
  within 380 m of the terminals carry one about half the time.
- **Boarding:** lifting the case in or out holds the passenger in the doorway 1.3 s longer. Inside, most of them
  stand beside the case.
- **Arrivals:** passengers arriving at the airport ride into town (mostly to the centre) or across to Terminal 1.

### Announcements

All 39 stops have a spoken form and read cleanly (`tests/announcements84.test.js`):

- РВД → „Ер Ве Де“, Р-т → „Ресторант“;
- бл. 108 → „Блок сто и осем“, Дружба-1 → „Дружба едно“;
- Терминал 2 → „Терминал две“, „Св. Анна“ → „Света Анна“;
- „Последна спирка“ only at the termini.

`tools/generate_announcements.py list` now covers every line, so clips can be recorded for line 84.

### Full-route tests (AI driving the player's bus, traffic and signals on, every stop served)

| Bus | Direction | Stops | Time | Battery | Net energy |
| --- | --- | --- | --- | --- | --- |
| SOR EBN 11 | A | 19/19 | 1600 s | 79.2 % → 68.1 % | 1.40 kWh/km |
| SOR EBN 11 | B | 20/20 | 1680 s | 79.2 % → 67.9 % | 1.39 kWh/km |
| Yutong E12 | A | 19/19 | 1460 s | 79.2 % → 74.9 % | 1.25 kWh/km |
| Yutong E12 | B | 20/20 | 1640 s | 79.2 % → 73.9 % | 1.50 kWh/km |
| Yutong ZK6126HGA (CNG) | A | 19/19 | 1500 s | – | – |
| Yutong ZK6126HGA (CNG) | B | 20/20 | 1620 s | – | – |

- **Announcements in the runs:** every "next stop" and "stop" message played once, in order.
- **Faults found and fixed:**
  - The first terrain pad left 17-20 % ramps at both path ends. The SOR could not leave Terminal 2 and the
    E12 rolled back there; the pad and road grading above fixed this.
  - Direction A ended on the main road, 18.75 m from the Terminal 2 stop pole. `tools/route84_t2_curb.py`
    now ends it at the departures curb, 0.8 m from the pole.
  - An OSM strip (#8038) mapped over the curb road was solid; it no longer is.
- **Remaining contacts:** a few low-speed bumps with traffic cars, which come from the general AI driver and
  traffic behaviour, not from line 84.

## Vehicles

- **SOR EBN 11:**
  - 11.1 m long; three outward-opening plug doors; raised rear platform.
  - Battery 172 kWh (85 % usable), 80 kW depot charging, 180 kW traction power.
  - Range about 120-150 km (the brochure range).
- **Yutong E12:**
  - 12.17 m long; three inward-opening doors with white door lamps inside and out.
  - Battery 374 kWh (90 % usable), 150 kW depot charging, 215 kW traction power.
  - Typical consumption 0.99 kWh/km.
- **Yutong ZK6126HGA:** the CNG bus of line 64, reused unchanged.

Efficiencies, auxiliary loads and thermal figures are estimates (`src/vehicle/models/ebus/specs.js`,
`src/vehicle/BatterySystem.js`).

## Hosts that were not reachable from the build environment

The following were refused by the network policy:

- overpass-api.de and overpass.kumi.systems;
- openstreetmap.org;
- sofiatraffic.bg;
- wikipedia.org;
- the photo hosts;
- www.sor.cz;
- imhd.sk.

Map data came from the Overture Maps release on AWS S3 instead.
