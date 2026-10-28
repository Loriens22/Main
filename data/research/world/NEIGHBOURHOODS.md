# Neighbourhoods along lines 64 and 280: what the buildings are

`neighbourhoods.json` holds one profile per neighbourhood (type mix of the multi-storey residential
buildings, the mix of detached houses, storeys for buildings without a height in OSM); `neighbourhoods.geojson`
the boundaries (Overture Maps *divisions*, OSM-derived, ODbL; macrohoods and neighbourhoods within 1.2 km of
either route). `tools/build_world.py` puts every building in the smallest area that contains it and decides
its type from the profile *and its own footprint*:

* long slabs 9-13.8 m deep, at least 2.2 times as long (Bs-69 and brick blocks) and square towers of 9+
  storeys (EPK) raise the odds of a socialist block;
* irregular plans (rectangularity < 0.8 or 12+ corners) and plans deeper than 15.5 m raise the odds of a new
  building;
* the villa quarters (Boyana, Dragalevtsi) never get panel blocks;
* researched buildings (`*/buildings_overrides.json`) and the hand-built landmarks keep what they are.

New residential buildings over ~17 m get their top storey (two above 36 m) set back by 1.8-3 m behind a roof
terrace with a glass guard (75 % of them); about half the low-rise blocks in the villa quarters, half the
villas and 60 % of the interwar buildings get hipped tiled roofs, now with eaves (soffit and fascia).

## What the route passes (km of route in the area, both directions)

| line | neighbourhood | km | buildings (from the profile notes) |
|---|---|---|---|
| 64 | Бояна | 4.2 / 3.3 | villas and modern houses, gated low-rise complexes (2-5 storeys), old village core; OSM median 3 storeys |
| 64 | Драгалевци | 3.5 / 3.5 | luxury villas, family houses, small complexes, the old village; OSM median 2, max 5 |
| 64 | Кръстова вада | 1.7 / 1.8 | new residential since the 2000s, 6-8 storeys typical, taller on Cherni vrah (OSM median 8, max 12); The Green District: 21 buildings on 50 dka |
| 64 | Манастирски ливади | 1.4 / 1.3 | 2005-2025 closed complexes of 4-8 storeys with underground garages (EIGHT, Mona 1-4, Alpha/Beta/Gamma, Elizium) |
| 64 | Промишлена зона Хладилника | 1.3 / 1.3 | former industrial zone: offices, the Paradise Center mall, new residential, remaining halls |
| 64 | Национален киноцентър, Резиденция Бояна | 1.1 / 0.9 | studios, villa zone, the residence (public perimeter only) |
| 64 | Хиподрума, Стрелбище, Гоце Делчев, Борово, Белите брези | 0.3-1.1 each | 1960s-80s panel (EPK, Bs-69) and brick blocks, EPK towers to 15-17 storeys, new infill |
| 280 | Студентски град | 4.4 / 3.8 | ~60 student-hostel blocks from the 1960s-90s, and many new residential, office and commercial buildings, clubs |
| 280 | Център (Oborishte / Sredets) | 1.4 / 1.1 | interwar 'кооперации' (4-6 storeys, plaster, bay windows, cornices, tiled roofs), neoclassical houses, Stalinist and socialist infill; OSM median 5 |
| 280 | Изток, Яворов, Гео Милев, Младост 1, Дървеница | 0.5-1.4 each | 1950s-60s brick blocks (Yavorov, Geo Milev, Iztok), 1970s-80s panel blocks (Mladost, Darvenitsa), new buildings on the boulevards |

## Building types in the game (facade shader archetypes)

* **panel** (style 0/1, archetypes 0-3): large-panel slabs with loggias, EPK towers, ETICS patchwork.
* **brick** (style 12, archetype 4): plastered socialist brick blocks with balconies.
* **stalinist** (style 13, archetype 5): string courses, pilasters, cornice.
* **interwar** (style 11, archetype 18): lime plaster in ochres and creams, rusticated ground floor or shops,
  window surrounds with cornice heads, small iron balconies, bay windows (еркери) projecting 0.85 m from the
  first floor to below the top one (real geometry, their front drawn by the facade shader).
* **modern** (style 9, archetype 9): smooth render with shadow joints at the slabs; accent cladding (wood-look
  HPL, anthracite panels, fibre-cement, brick slips) on some column pairs and ground floors; living rooms
  glazed to the floor behind cantilevered balcony bands with glass guards and a stainless top rail (real
  geometry, neighbouring balconies join into one band), bedroom windows over parapets, French windows,
  roller-shutter boxes, anthracite frames; shops on the ground floor of a third of them.
* **villa** (style 10, archetype 17): warm render, random-ashlar stone on the garden floor, large openings,
  terraces with glass guards, flat roofs or low hipped roofs with eaves.
* **house** (style 4, archetype 10): older detached houses with tiled roofs.

## Limits

Heights: only ~10 % of the buildings in Krastova vada have a height or storey count in OSM; the rest use the
profile's storeys by footprint area. A measured height layer would help: JRC GHSL built height
(jeodpp.jrc.ec.europa.eu, ghsl.jrc.ec.europa.eu) and Overpass (overpass-api.de) were refused by this
environment's network policy. Individual buildings are not identified from imagery: Street View was not
scraped or used as textures.

## Sources

* Capital.bg: [Домекс инвест / The Green District, 2024](https://www.capital.bg/biznes/imoti/2024/03/22/4603401_domeks_invest_zapochva_finala_na_megaproekta_si_vurhu/),
  [В градската строителна джунгла, 2021](https://www.capital.bg/biznes/imoti/2021/04/15/4198301_v_gradskata_stroitelna_djungla/),
  [Строителите хванаха яката на Витоша, 2021](https://www.capital.bg/biznes/imoti/2021/02/12/4173254_stroitelite_hvanaha_iakata_na_vitosha/),
  [Топ 10 строителни разрешения, 2026](https://www.capital.bg/biznes/imoti/2026/01/08/4869716_top_10_na_nai-golemite_stroitelni_razresheniia_v/),
  [Winslow Gardens отново се строи, 2015](https://www.capital.bg/biznes/imoti/2015/11/05/2643777_jilishtniiat_kompleks_winslow_gardens_otnovo_se_stroi/),
  [Инвестиция с двор, 2015](https://www.capital.bg/biznes/imoti/2015/04/09/2510176_investiciia_s_dvor/)
* [Studentski grad, Sofia (Wikipedia)](https://en.wikipedia.org/wiki/Studentski_grad,_Sofia), [Panel building (Wikipedia)](https://en.wikipedia.org/wiki/Panel_building)
* Real-estate listings (bazar.bg, alo.bg, ues.bg, suprimmo.net) for storey counts of new complexes - indicative only.
* OSM / Overture `building:levels` statistics per neighbourhood within 120 m of the routes.
