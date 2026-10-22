# Research brief (shared by all research agents)

You are helping rebuild a single-file three.js bus simulator of Sofia bus line 280
(СУ „Св. Климент Охридски“ ↔ Студентски град). The repo is at /home/user/Main.

The user says the current result is poor:
- the bus is not 1:1 with their photos (architecture, details, seats);
- the buildings don't match reality, especially around the stops;
- the sound is weak, or absent while driving.

Your job in this phase is **research plus a precise, implementable spec** for your area.
Do **not** modify anything under `src/` or `tools/`. Write files only inside your own output folder.

## Environment (already verified, do not re-test at length)

- **WebSearch works** (server-side). Use it a lot, in Bulgarian and in English.
- **Blocked hosts.** WebFetch and curl cannot reach wikipedia.org, wikimedia.org, overpass-api.de, mapillary,
  OSM tiles, sofiatraffic.bg, transport-sofia.info or freesound (network policy).
  - If a host is denied, note it once and move on. Never retry denied hosts in loops.
- **Never use Google Maps / Street View** imagery or data.
- **The user's 5 reference photos** are in `/home/user/Main/data/research/ref_photos/` as `user_ref_1.jpg` … `user_ref_5.jpg`:

  | # | Bus | What it shows |
  | --- | --- | --- |
  | 1 | fleet 3145 (CB 5696 HM) | front-left 3/4 in a depot, door 1 open, side LED sign visible |
  | 2 | fleet 3153 (CB 5713 HM) | front 3/4, low angle, mirrors very visible |
  | 3 | fleet 2319 (CB 5720 HM) | in service, front 3/4, the whole articulated side with the leaf livery |
  | 4 | — | interior of the front section looking back to the bellows (seats, poles, ceiling, floor) |
  | 5 | — | interior looking forward to the driver's cab (cab partition, interior LED display, ceiling, poles) |

  - View them with the Read tool.
  - To inspect details, crop or zoom with Python PIL (python3 is available). Write the crops to your output folder, e.g. `crops/…png`, then Read them.
  - Sample colours with PIL and report them as hex.
- **Existing crops.** A previous run of this phase was stopped. If your output folder already contains crops,
  reuse them instead of redoing that work.
- **Renders of the current game bus** from the same viewpoints as the photos are in
  `data/research/bus/baseline/`: `cur_view1_front_left.png`, `cur_view2_front_right_low.png`,
  `cur_view3_side_3q.png`, `cur_view4_interior_back.png`, `cur_view5_interior_cab.png`.
  Compare them with the photos.
- **Game coordinates** are in metres: x = east, z = south, origin at lat 42.669, lon 23.352.
- **Bus local frames** (see `src/vehicle/BusSpec.js`):
  - axes: x = right, y = up, z = backwards (forward is −z);
  - the front section's origin is the middle axle centre on the ground;
  - the rear section's origin is the rear axle centre on the ground.
- **Every fact needs a basis and a confidence.**
  - Basis: a source URL, "user photo N" (with what you measured), or "inferred (typology / proportions)".
  - Confidence: high, medium or low.
  - Never present a guess as a fact.
  - Write numbers, not adjectives: metres, hex colours, counts, positions.
- **Final answer:** a concise summary listing the files you wrote, the key findings, any blocked hosts and open questions.

## World research format (world agents only)

### Inputs prepared for you

- **Stop inventories.** `data/research/stops/INDEX.md` and `data/research/stops/<code>.json` cover every stop pole:
  - the stop record: name, road, lat/lon, pole x/z;
  - every OSM/Overture building within 200 m: overture id, OSM way id such as "w123456@4", centroid lat/lon and x/z,
    oriented size in metres, levels/height/class/name/roof/facade data when OSM has it, and the distance from the pole;
  - named places and POIs within 220 m (shops, cafés, banks, pharmacies…), with category, address and distance.

  The footprints are accurate (OSM). What is missing is what the buildings **look like**: construction type, era,
  floors, colours, balconies or loggias, window rhythm, roof, ground-floor shops, signage, fences, and what is at
  the stop itself.
- **Code to skim** so your spec is implementable:
  - `src/data/route280.json` (the route path per direction and the stop order);
  - `src/world/Buildings.js` and `tools/build_world.py` (buildings are currently styled with a handful of procedural
    facade styles chosen by heuristics).

### Method: go stop by stop, every stop in your list, both direction poles

1. **Pick the buildings that matter.** Read the stop JSON. Take everything within ~120 m of the pole that is visible
   from the street the bus drives on, plus any landmark within 200 m. Identify each one (name, function, address) from
   the places list and names. For example, a pharmacy and a bank at the same address are ground-floor shops of that block.
2. **Research each building with WebSearch.**
   - Bulgarian queries work best:
     - the street and number from the addresses;
     - "блок <N> <квартал>";
     - "<address> панел/тухла/ЕПК етаж".
   - Real-estate listing snippets (imot.bg, address.bg, imoti.net…) reveal the construction type and number of floors per block.
   - Use Wikipedia and news for landmarks and institutions, and architecture articles for famous buildings.
   - Also research the stop itself:
     - whether there is a shelter, and which design (Sofia uses several — find which);
     - kiosks, the stop sign or pole design, an electronic departure board;
     - pavement type, trees, fences, parking.
3. **When nothing specific is findable, classify by typology** of that neighbourhood and era, and say "inferred".
   Sofia typologies you can use:

   | Typology | Typical form |
   | --- | --- |
   | 1960s large-panel blocks (Бс-IV-Сф) | 5–8 floors |
   | 1970s–80s panel blocks (Бс-69-Сф) | 8–16 floors, loggias |
   | ЕПК / пакетно-повдигани плочи | towers |
   | socialist-era brick blocks (тухла) | plastered, 4–8 floors |
   | 1950s Stalinist | neoclassical |
   | pre-war | neoclassical / neo-baroque (centre) |
   | modernist institutional (universities, hospitals) | concrete frames, ribbon windows |
   | post-2000 | glass offices; residential (новострой) |
   | houses | tiled roofs |
   | others | sports halls, kiosks/pavilions |

   Many panel blocks are now partially insulated (ETICS) in pastel colours, flat by flat, giving a patchwork. Note it
   where typical.

### Files to write in your output folder

- **`stop_<code>.md`**, one per stop pole:
  - what a person standing at the pole sees on each side;
  - the stop furniture;
  - a table of the important buildings: osm id, what it is, type, floors, colours, features, confidence, sources.
- **`buildings_overrides.json`**: an object keyed by OSM way/relation id **without** the @version (e.g. `"w123456"`):
  ```
  {
    "label": "what it is",
    "kind": "panel_1960s"|"panel_1970s"|"panel_insulated_patchwork"|"epk_tower"|"brick_socialist"|"stalinist"|
            "neoclassical_prewar"|"modernist_institutional"|"glass_office"|"modern_residential"|"house"|
            "sports_hall"|"industrial"|"church"|"kiosk"|"hotel_modernist"|"other",
    "levels": int, "height_m": number, "roof": "flat"|"hipped"|"gabled"|"dome"|"mansard"|"shed",
    "wall_hex": "#rrggbb", "accent_hex": "#rrggbb" (panel joints / trim / balcony fronts), "roof_hex": "#rrggbb",
    "window": "punched_grid"|"ribbon"|"curtain_wall"|"loggia_bands"|"balcony_bands"|"shopfront_only",
    "ground_floor": "shops"|"lobby"|"blank"|"columns"|"garages"|"entrances",
    "shop_signs": [ { "text": "…", "bg_hex": "#…", "fg_hex": "#…" } ],
    "features": [ "free-form strings" ],
    "confidence": "high"|"medium"|"low", "sources": [ "urls or inferred: …" ], "notes": "…"
  }
  ```
- **`landmarks.json`**: buildings or structures that need custom geometry beyond a box with a facade (towers, domes,
  colonnades, sports halls, monuments, the stop shelters themselves). For each: id/position, overall dimensions,
  massing parts with sizes, materials/colours, and sources. The shape description must be precise enough to model.
- **`stop_furniture.json`**: per stop pole, the shelter type with its dimensions and colours, sign pole, bench, bin,
  kiosk, e-board, the curb/bay type (bus bay or on-lane) and the pavement material.
- **`README.md`**: the method, the coverage, and what remains uncertain.
