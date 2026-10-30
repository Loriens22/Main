# Tram line 12 — research notes

What is verified, what is estimated, and where each number comes from. Hosts that could not be
reached from the build environment (sofiatraffic.bg, sofia.bg, mysofia.bg, openstreetmap.org and its
API, openrailwaymap.org, overpass mirrors, transphoto.org, trainspo.com, the Wikipedias) are listed at
the end; their facts were only taken where a web search summary quoted them.

## Route

**Regular service, 21 stops per direction** (codes from the expansion directive). Every code was matched
to its OSM tram stop position (`railway=tram_stop`, `ref` = stop code) and platform via Overture Maps
2026-10-21.0 (`base/infrastructure`). The path was routed on the OSM tram tracks (`railway=tram`, Overture
`transportation/segment`, subtype rail, class tram) by `tools/build_tram_route.py`:

- shortest path between consecutive stop positions whose heading never changes by more than 40° at a
  track node (switches are passed straight or along their curve, never back through the other branch);
  the tram leaves every stop in the direction it arrived;
- direction A (кв. Илиянци → пл. Журналист) 9 974 m, direction B 9 927 m;
- terminal loops: пл. Журналист 85 m (1273 → 1274), кв. Илиянци 145 m (0847 → 0848).

Streets in order (A): Илиянско шосе, бул. Рожен, Скопие, Опълченска, бул. Княгиня Мария Луиза, бул. Христо
Ботев (Централна гара, Клокотница, Сливница, Пиротска), пл. Македония, Алабин, Граф Игнатиев (пл. Гарибалди,
пл. Славейков), бул. Васил Левски, бул. Драган Цанков, бул. Христо Смирненски (УАСГ), пл. Журналист.

**Central Station junction.** In the current OSM data the tram tracks between the station stop (1330 /
1331, on the spur of бул. Христо Ботев) and the diagonal towards Пета градска болница are tagged as under
construction (`railway=construction`, ways w261526277, w23062705, w96478611, w261526226). The regular route
needs them; `build_tram_route.py` adds rails under construction that join the tram network.

**Temporary diversion (13 October – 3 November 2026, Княгиня Мария Луиза reconstruction).** Not part of
the default route. The route-variant data model keeps directions separate, so a variant can be added as
its own route file with its own verified stop list and dates.

Track gauge: 1 009 mm (Sofia narrow gauge; line 12 runs on the narrow-gauge network).

Track network round the line: 1 177 track edges within 700 m (764 street-running: the track lies inside a
road carriageway), 238 switch and crossing nodes (track nodes of degree ≥ 3).

## Vehicles

### Schindler/Siemens Be 4/6 S (photos 1–6), Sofia green

- Ex Basel BVB 659–686, nicknamed "Guggummere" (gherkins), built by Schindler Waggon AG, Pratteln, in
  Basel service since 1990/91; 28 cars shipped to Sofia from January 2017 (BVB press release), in
  service in Sofia from 24 April 2017 (BNT).
- Original two-section car: length over all 20 370 mm, the halves resting on an unpowered Jacobs bogie,
  bogie centre distances 2 × 6 400 mm, axle spacing in the bogie 1 750 mm (tram-bus-basel.ch portrait).
- Low-floor middle section 7 750 mm (wound fibre-composite body bolted to a welded steel underframe)
  inserted 1997–99 by Adtranz Pratteln (same source).
- **Estimated for the model** (from photos 1–4, no reachable drawing): front section 13.4 m with the cab
  and two powered bogies (centres 3.8 m and 10.2 m behind the front end), the low-floor module 7.75 m
  carried between the sections, rear section 7.0 m on one trailing bogie, total ≈ 28.2 m; width 2.20 m;
  single-ended (cab at the front, doors on the right side, rear window). Be 4/6: 6 axles, 4 powered.

### T6M-700 (photos 7–10), blue / orange / white

- Built by the Sofia tram works (Завод за трамваи – София) 1985–1989; six-axle two-section articulated
  car, 1 009 mm gauge, 600 V DC, maximum speed 60 km/h, 32 seats, mass 25 t, motor power 200 kW
  (bg.wikipedia via search summary; Trainspo).
- Length 20.75 m, width 2.25 m (Trainspo; single source).
- **Estimated for the model** (from photos 7–9): two equal sections on three bogies (outer bogies and a
  Jacobs bogie under the joint), four double doors (two per section) on the right side, single cab,
  rear window with route display, diamond pantograph on the front section.

## Landmarks along the line (sources and status)

- **Централна гара** (Sofia Central Station): building of 1974 (competition won by a team led by Hans
  Gericke), brutalist, white marble facing, renovated 2014–2016; the old locomotive and parts of the
  mosaic kept. Massing from the OSM footprint.
- **пл. Славейков**: bronze sculpture of Petko and Pencho Slaveykov on a bench, the open-air book market
  (132 tables after the 1998 renovation), the Sofia City Library building on the square, a former
  fountain spot.
- **пл. Македония**: the КНСБ building (пл. Македония 1, congress centre "Глобус"); several tram lines
  cross the square (бул. Македония, бул. Христо Ботев, Алабин).
- **пл. Гарибалди, Граф Игнатиев, УАСГ, Пета градска болница, пл. Журналист, Стоков базар Илиянци**:
  massing and position from OSM; facade details inferred from the building type (marked in the code).

## Sources

- [Basel Be 4/6 659–686 «Guggummere» (tram-bus-basel.ch)](https://wp.tram-bus-basel.ch/2019/04/06/be-4-6-659-686-guggummere/)
- [BVB press release, January 2017: shipment of the Guggummere to Sofia](https://www.bvb.ch/wp-content/bvb/Dokumente/Medienmitteilungen/2017/20170117_Start_Versand_Guggummere_fuer_Sofia.pdf)
- [BNT: Basel "Guggummere" trams start running in Sofia](https://bnt.bg/news/basel-guggummere-trams-strart-running-in-sofia-142125news.html)
- [Sofia Globe: Sofia to get 28 trams from Basel](https://sofiaglobe.com/2015/01/20/bulgarian-capital-sofia-to-get-28-trams-from-basel/)
- [Trams in Sofia (Wikipedia)](https://en.wikipedia.org/wiki/Trams_in_Sofia)
- [T6M-700 (bg.wikipedia)](https://bg.wikipedia.org/wiki/T6M-700), [T6M-700 (Trainspo)](https://trainspo.com/model/2853/)
- [Sofia Central Station (Wikipedia)](https://en.wikipedia.org/wiki/Sofia_Central_Station),
  [BNT: the renovated station re-opened](https://bntnews.bg/news/the-renovated-railway-station-in-sofia-re-opened-1315270news.html)
- [Slaveykov Square (Wikipedia)](https://en.wikipedia.org/wiki/Slaveykov_Square),
  [Capital: what to do with Slaveykov Square](https://www.capital.bg/politika_i_ikonomika/obshtestvo/2010/06/02/910397_kakvo_da_pravim_s_ploshtad_slaveikov/)
- [Macedonia Square, Sofia (Wikipedia)](https://en.wikipedia.org/wiki/Macedonia_Square,_Sofia)
- [BTA: temporary changes in tram traffic](https://www.bta.bg/bg/news/213996-Vremenno-se-promenya-dvizhenieto)
- Map data © OpenStreetMap contributors (ODbL) via Overture Maps Foundation, release 2026-10-21.0.

Unreachable from the build environment: sofiatraffic.bg, sofia.bg, mysofia.bg, openstreetmap.org,
api.openstreetmap.org, openrailwaymap.org, overpass.kumi.systems, nominatim.openstreetmap.org,
transphoto.org, trainspo.com (and, from earlier sessions, sofiatraffic.com, commons.wikimedia.org,
bg.wikipedia.org, en.wikipedia.org).
