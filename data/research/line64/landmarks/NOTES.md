# Line 64 landmarks — sources and what is not verified

All builders live in `src/world/landmarks64/`. Footprints, heights and positions come from the
OpenStreetMap data in the line 64 world pack (`src/data/world64.pack.b64`, Overture Maps 2026-10
release, ODbL); pack building ids are listed in `landmarks64/data.js`. No photographs or Street View
imagery are used as textures — every texture is drawn procedurally on a canvas.

| Landmark | Stops | From data | From public sources | Inferred / NOT verified |
|---|---|---|---|---|
| Metro station "Vitosha" (M2), stair entrances | 0909, 2756, 2780, 0912 | OSM `highway=steps` ways give each entrance's mouth and direction | opened 20 Jul 2016 | canopy, "M" pylons, glazing |
| Paradise Center | 2756, 2780 | OSM footprint 11848, 24 m | bul. Cherni vrah 100, opened 28 Mar 2013 | cladding colours, entrance bays, sign layout |
| National Centre of Public Health and Analyses (NCPHA, НЦОЗА) | 2342, 2343 (terminus) | OSM parts 13476–13481 (9.9 m) and 13515 (13.2 m); fence gap at the stop | seat: bul. "Akad. Ivan Geshov" 15, under the Ministry of Health (ncpha.government.bg rules and journal) | the plastered 3-storey styling, portico, plaque wording and flag masts; which OSM wing is the main one |
| СБАЛ по белодробни болести "Св. София" | 2342, 2343 | OSM building 13482 with this name, 3 levels | — | colours, sign, entrance canopy |
| Sofia Zoo, western entrance | 2764, 0749 (terminus) | OSM guardhouse 14980 standing in the zoo fence (fence lines 374 / 415) | zoosofia.eu: western entrance at ul. Srebarna 1, reached from metro Vitosha; main entrance on Simeonovsko shose; ticket offices 9:30–18:00; 36 ha | pavilion layout, turnstiles, name board design, the silhouettes |
| Boyana Residence — public perimeter only | 1439, 1448 | OSM fence line 34 (the park boundary along the road) | — | the stone plinth / bar fence / piers design. Nothing inside the park is modelled. |
| Boyana film studios gate | 0930, 0931 | OSM service road 3662 from the stop into the grounds; OSM area "Киноцентър Бояна" | studio name Nu Boyana Film Studios | gate position along the road, piers, barrier, booth, name wall |
| Боянско ханче | 0265, 0266 | OSM building 5293 with this name, 9.3 m | — | revival-style styling (stone ground floor, timber band, tiled hip roof), porch, sign |
| Гробищен парк Бояна | 0263, 0262 (request) | OSM cemetery area; footpath 2840 enters its NW corner (gate placed there) | — | wall, gate, florists' stalls, cypresses |
| Гробищен парк Драгалевци | 0510, 0509 | OSM cemetery area; OSM building 8747 (12.4 m) inside | — | gate position on the road edge, wall, chapel form (nave, apse, belfry) |
| Ring Road gantries | 1176, 1177 | OSM carriageways 7029 / 7040 (13.7 m apart) | — | gantry positions (~135 m before the junction) and the destinations on the boards (follow the geography) |

Fences and walls a landmark redraws are masked out of the OSM street furniture with
`LINE_MASKS64` (circles or polylines) in `landmarks64/data.js`.

Not modelled (seen only from far or off the route): Boyana Church (169 m from the road behind
villas), Bulgaria Mall (≈200 m south of stop 2213; the OSM massing stays).

Hosts that could not be reached from the build environment (403 / no DNS): sofiatraffic.com,
nsapb.bg, commons.wikimedia.org, zoosofia.eu, bg.wikipedia.org.
