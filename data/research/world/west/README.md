# World research - western / central half of line 280

Stops covered (15 poles, one `stop_<code>.md` each): 1697 (terminal at Sofia University), 0441, 1287, 1288, 2326, 2327, 1696, 1695, 1258, 0494, 0492, 2352, 2351, 0764, 0761.

Files here:

| file | content |
| --- | --- |
| `stop_<code>.md` x 15 | per pole: pole data, measured cross-section (offsets from the bus centreline), what is seen on each side, furniture, building table, uncertainty |
| `buildings_overrides.json` | 110 entries keyed by OSM way/relation id without version (all keys exist in `data/research/stops/*.json`; schema from the brief, validated: kinds, windows, ground floors, roofs, hex colours) |
| `landmarks.json` | 20 custom-geometry items: SU complex, NBKM, Military Academy, Havel Square, Eagles' Bridge with column positions and spec, yellow paving extent, Tsarigradsko cross-sections, Borisova gradina edge, Hotel Pliska / CCB tower, Pliska underpass canopies, Iztok tower, Aviation monument, Arena 8888, G. M. Dimitrov cross-section, metro pavilions, oncology campus, skyline towers, long slabs |
| `stop_furniture.json` | per pole: shelter (size, colours, placement), pole, bench, bin, kiosks, e-board, bay/kerb, pavement; plus archetypes |

## Method

1. Read the stop inventories (`data/research/stops/<code>.json`) and decoded the game's own world pack (`src/data/world.pack.b64`) to measure real cross-sections: for every pole a profile of roads, areas, buildings, fences and props along the normal to the bus path (offsets in metres, + = right of the bus). All "offset" numbers in the stop files come from this, so they match what the game renders.
2. Researched with WebSearch (Bulgarian + English): Rectorate, NBKM, Military Academy, Orlov Most, Hotel Pliska / CCB, Aviation monument, Arena 8888, Sofiamed, metro G. M. Dimitrov, oncology hospital, Sofia shelters. Only the search tool's summaries were available (see Blocked hosts).
3. Where nothing specific was findable, buildings were typed by neighbourhood and era and marked `confidence: low` with `inferred (typology)`.

## Key findings the implementer must know

1. **Direction B does not use Evlogi Georgiev.** After the Eagles' Bridge it drives NW along **бул. Цар Освободител on yellow paving** (365 m, from (-1226,-2427) to (-1450,-2682)), turns north on **бул. Васил Левски** right along the **Rectorate front** (west face 9 m behind the kerb) and turns right onto Шипка into the terminal. Direction A uses Шипка, which runs behind the Rectorate's **north wing** (stone slab, 18.6 m, its wall 4-5 m behind the stop pole).
2. **Rectorate facade**: the existing six-column portico + pediment has no source. Sources describe an eclectic, predominantly Baroque building with a "triumphal arch" parade entrance flanked by two lions and seated bronze statues of the Georgiev brothers at the foot of the staircase.
3. **Eagles' Bridge**: four columns of hewn granite, about 7 m high, topped by a cornice, stone ball and bronze eagle with spread wings (cast in Vienna). OSM carries four `artwork` nodes at the bridge: (-1183.2,-2401.7), (-1175.5,-2394.6), (-1196.1,-2375.7), (-1203.7,-2382.8) - use these. The current code finds no bridge piece, so no eagles are placed at all.
4. **Yellow paving ends at the Orlov Most junction node (-1211,-2410)**; Tsarigradsko shosse is asphalt. Direction A never touches yellow paving.
5. **Tsarigradsko shosse**: 120 m single 19 m road, then two 11 m carriageways about 2-2.5 m apart. Right side from Orlov Most for kilometres = Borisova gradina (trees from 6.7 m, promenade from 17 m, no service lane); from Pliska to Iztok both sides have a 5 m one-way service lane behind a guard fence and the stop poles stand in the 3-5 m strip between carriageway and fence.
6. **Hotel Pliska no longer exists as a hotel**: closed Oct 2012, since April 2015 the CCB bank HQ with a new aluminium-glass facade. Tower 58.6 m (OSM; sources 14-16 floors, up to 70 m) on a 2-storey zig-zag podium; do not rely on a neon "ПЛИСКА" sign. Note `LANDMARK_NAMES` in `tools/build_world.py` maps the name "Плиска" to the old institutional style; the researched override should win.
7. **Military Academy stop 0441** is a plain pole (no shelter) at a small junction beside the new Václav Havel square (sculpture "The Heart Travels", unveiled 31 Oct 2024). The Academy main building (1888-94, Antonín Kolář, fortress-like) is 330 m away at (-369,-2476) and is not seen in detail.
8. **Aviation Square (1258)** is a grade-separated interchange; the Aviation Monument is 75-110 m NNE of the pole: 10.6 m tapering grey-granite pillar, brass eagle (wingspan 2.5 m), two hyperbolic wing bodies 4.6 m and 3.0 m. No aircraft on a pylon is confirmed. Arena 8888 stands behind it (137 x 113 m, real height about 30 m, not the 12.6 m of the pack).
9. **Stop "НСБАЛ по онкология" (0764/0761)** is at the metro station G. M. Dimitrov (concourse pavilion 16 m behind the pole). The oncology campus itself (Plovdivsko pole 6) is 130-400 m south on the east side of Sv. Kliment Ohridski.
10. Shelter sizes available from OSM: 4.9 x 1.7 m (Iztok), 6.1 x 2.1 m (Pliska), canopies 12.9 x 4.3 m (underpass stairs), CGM cabins 4.3 x 3.1 m. 0441 has no shelter at all.

## Blocked / unavailable hosts

- WebFetch fails for every host in this environment (`getaddrinfo ENOTFOUND`), including uni-sofia.bg, stara-sofia.com, openstreetmap.org.
- curl through the proxy returned 403 for uni-sofia.bg, openstreetmap.org, bg.wikipedia.org, www.google.com, duckduckgo.com. Not retried.
- Result: only the WebSearch summaries were readable; no page was read in full and no photograph could be inspected.

## What remains uncertain

- Construction type, floors, colours of almost all ordinary blocks (108 of 110 overrides are `low`): the sources list prices, not building series. Typology used: Oborishte pre-war plastered 3-6 floors, 1950s-60s centre blocks, 1970s-80s panel (Iztok, Geo Milev, Musagenitsa) with partial ETICS patchwork, Musagenitsa long slabs (130-210 m, 8 storeys).
- Facades of the SU north wing and library, NBKM, Shipka 6 / 34, Sofiamed.
- Real lane markings and counts (3 lanes per carriageway on Tsarigradsko / G. M. Dimitrov are inferred from 10-11 m OSM widths).
- Shelter model, stop-plate design, e-board look, litter bin, pavement material: no source found, defaults provided.
- Whether the 2018-planned towers by G. M. Dimitrov metro (NV Tower 106 m, Artex 75 m) and Iztok Plaza (94 m, 2024/25) are built; OSM shows 49-84 m towers at (309..425, 371), (1067,-147).
- Two search-conflicting items: Hotel Pliska floor count (14, 15, 16, OSM 18) and the Aviation Square aircraft.
