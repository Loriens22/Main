# World research — EAST / SOUTH half of bus line 280

Scope: the real world around the 20 stop poles from "Технически университет" (бул. Св. Климент Охридски) to the terminal loop at Студентски град, both directions.
Nothing under `src/` or `tools/` was modified. Everything is in this folder.

## Files

| file | content |
| --- | --- |
| `stop_<code>.md` x 20 | one per pole (1740, 1743, 0617, 0614, 0800, 0801, 1691, 1692, 0524, 0530, 1610, 1611, 0533, 0534, 0741, 0742, 1606, 1609, 1694, 1693): coordinates, frame, what is seen ahead / left / right / behind with distances, furniture, table of the important buildings with confidence and sources |
| `buildings_overrides.json` | 219 entries keyed by OSM way/relation id (no `@version`), the format from the brief. Covers **every** OSM-keyed building within 110 m of each pole (227 pole-building pairs, 0 missing) plus the landmarks up to 330 m away. 89 entries carry `shop_signs` |
| `landmarks.json` | 14 entries needing custom geometry: Winter Palace, Hristo Botev hexagon, UNWE complex (outline, two courtyards, 17 parts), NSA complex + sports grounds, ЛТУ main building + forest belt, ХТМУ comb + octagon garden, TU campus blocks, student chapel, OMV station, kiosk modules on Йосифов, terminal loop geometry, the generic Sofia shelter model, and 10 clusters of named venues (clubs, cafes, fast food, banks) |
| `stop_furniture.json` | per pole: shelter/bench/bin/lamp/board flags (OSM), kerb gap from the game road width, curb type, pavement, pole design, e-board, mapped props within 30 m, nearby kiosks, placement notes |

## Method

1. Inputs: `data/research/stops/<code>.json` (buildings within 200 m, places within 220 m), `src/data/route280.json` (route path, stop flags), and the raw Overture extract (`bld.parquet`, `bpart.parquet`, `landuse.parquet`, `places.parquet`, kept in the session scratchpad) to see beyond the 200 m window: campus blocks, UNWE parts, NSA sports pitches, the forest polygon at ЛТУ.
2. For every pole I computed a local frame from the route path (ahead / right-hand lateral) and listed each building and place as `a` (metres ahead) and `l` (metres to the right), so the "what you see" text is geometrically consistent with the bus direction. The same frame gave the pole gap behind the kerb from the game's road widths.
3. I rendered top-down maps (buildings with OSM ids and levels, roads, route, poles) around every stop to understand the layout (these are not stored).
4. WebSearch (Bulgarian and English, standard and extended modes) for: Sofia stop shelters, the TU / ЛТУ / ХТМУ / UNWE / NSA campuses, Studentski grad, the Winter Palace, Hristo Botev hall, Дървеница, shops (Fantastico etc.). The tool returns only page summaries.
5. Classification of buildings: specific facts where found; otherwise typology by neighbourhood and era (1960s/70s/80s panel, EPK towers, brick socialist, institutional, kiosks, new-builds) with an area rule for the share of partly insulated (ETICS patchwork) blocks. Levels missing in OSM were inferred from footprint (flagged in `notes`).
6. Shop signs: Overture places whose coordinates fall inside (or within 6 m of) a building footprint become `shop_signs`; colours are brand colours where well known (KFC, Lidl, Hesburger, OMV, Yettel, Vivacom, Billa, banks) and category-based guesses otherwise (flagged in `sources`).

## Blocked / unavailable

- WebFetch failed for every host (DNS error: openstreetmap.org, tu-sofia.bg, archgyan.com all `ENOTFOUND`); curl to openstreetmap.org, tu-sofia.bg and archgyan.com returned proxy 403. Not retried. Only WebSearch summaries were usable, so there are **no photographs and no page text** for any building here.
- Wikipedia/Wikimedia are blocked as per the brief; Wikipedia facts (Winter Sports Palace 1982, 4,600 seats; Studentski grad) arrive via search summaries.
- No Google Maps/Street View data was used.

## Key findings

- **The campuses are not next to the bus.** TU blocks 1-4 are 215-450 m west of the boulevard behind the "Пазар ТУ" pavilion row; the UNWE complex is 56 m from stop 1692 but 125 m from 1691; the hexagonal Hristo Botev hall is 150 m from 1610 behind dormitories; the NSA main complex is 115 m east of the terminal loop and the NSA stadium/pitches form an open grass belt along the whole east side of Ак. Стефан Младенов (1606/1609).
- **ЛТУ main building** (`w169383001`) is an L-shaped slab 18.5 x 122 m, only 31 m from stop 0617, inside an OSM `forest` polygon (x 347-620, z 1734-1969): the whole west side of the boulevard and the north side of 8-ми декември up to the Дървеница stops is wooded.
- **Studentski grad main street** (ул. Д-р Йордан Йосифов and Ак. Борис Стефанов) is a dense strip of 1-3-storey kiosks, fast food (KFC, Hesburger, Domino's), bars/clubs (Modera, Access, Club Conte, Club 35, Marrakesh/Azzaro on 8-ми декември 43-45), the student canteens "Стол 4" and "Стол 33", Lidl, Billa, Fantastico Ф22, banks; 7-10-storey dormitory slabs (141 x 52 m and similar) and 14-storey square towers behind.
- **Winter Palace** (`w43275106`, 1982, 4,600 seats): chamfered octagon ~100 x 98 m, 2 levels, flat roof, forecourt facing the road; **Hristo Botev hall** (`w45196750`): hexagon 66 m across (vertices given). **UNWE**: 1971-77 + 1984-87, 6 floors, outline with two courtyards and a saw-tooth north front.
- **Furniture:** shelters (OSM) at 1743, 0614, 0801, 1691, 1692, 0530, 1610, 1611, 1694, 1693; free-standing bench only at 0742; pole-only elsewhere. The Sofia shelter standard length is 4-5 m (double 8-10 m) with an opaque roof and ads on one side (municipal 2026 report via search). Poles 0533, 0741, 0801, 0614 have OSM nodes inside the game carriageway (1.0-3.6 m): place the pole at the kerb.
- 28 buildings within 110 m have no OSM id (Overture-only footprints, mostly small huts and the terminal hut) and cannot be keyed in the overrides; they are described in the `stop_*.md` files.

## What remains uncertain

- **All facade colours, materials, heights and window rhythms** are typology guesses except where OSM gives levels/material (brick `w220309158`, plaster `w574814602`, concrete `w259113010`). Confidence is `low` for 196 of 219 overrides.
- Real condition of insulation in each panel block (the patchwork vs raw-grey split is a deterministic 40-42 % pseudo-random assignment by typology, not observed).
- Real design of Sofia stop poles (sign shapes, colours) and shelters; the shelter is a generic modular steel/glass model.
- Whether any pole has a real bay; the data only shows kerb gaps (0.4-4.2 m behind the kerb of 6.8-12.5 m roads).
- Fantastico, Pepco, Денси, bank brand colours are from memory; no sources.
- Exact look of the Winter Palace, the Hristo Botev hall, the NSA complex, ЛТУ main building, TU Block 1 (the rectorate).
- Identity of the former "Детски дом" the stop is named after (nearest institutional building: kindergarten `r1020109`).

## Suggested use in the build

1. Apply `buildings_overrides.json` by OSM id on top of the procedural styles; the `kind` values map one-to-one to the vocabulary in the brief. Where an entry has `confidence: low` treat it as a typology default rather than a fact.
2. Build the `landmarks.json` shapes (they use the OSM footprints, so positions are exact): the two sports halls, UNWE, NSA, the ЛТУ belt of trees and the terminal loop matter most for what the player sees; the TU blocks do not (far from the road).
3. Use `stop_furniture.json` for pole/shelter placement (pole gap behind kerb; apply the "inside the carriageway" correction), and the `studentski_grad_venues` list in `landmarks.json` for night-time neon/awnings along Йосифов and Борис Стефанов.
