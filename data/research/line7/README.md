# Tram line 7 — research notes

What is verified, what is estimated, and where each number comes from. Facts marked "via search summary"
were taken from a web search summary because the page itself could not be opened from the build
environment (the hosts that refused are listed at the end).

## Route

**Regular service, 18 stops per direction**, codes as given by the expansion directive. Every one of the 36
codes was matched to its OSM tram stop position (`railway=tram_stop`, `ref` = stop code) and its platform via
Overture Maps 2026-10-21.0 (`base/infrastructure`); every platform lies to the right of the track.

| # | A: Манастирски ливади → Хан Кубрат | code | B: Хан Кубрат → Манастирски ливади | code |
| --- | --- | --- | --- | --- |
| 1 | кв. Манастирски ливади – запад | 0582 | Метростанция „Хан Кубрат“ | 2477 |
| 2 | ул. Тодор Каблешков | 2211 | кв. Триъгълника | 1778 |
| 3 | ж.к. Мотописта | 0671 | Пета градска болница | 1254 |
| 4 | бул. Гоце Делчев | 0313 | Централна гара | 1331 |
| 5 | пл. Ручей | 1305 | ул. Клокотница | 1993 |
| 6 | бул. Акад. Иван Гешов | 0272 | бул. Сливница | 0377 |
| 7 | ПГД „Елисавета Вазова“ | 1738 | ул. Пиротска | 2112 |
| 8 | бул. Пенчо Славейков | 0357 | пл. Македония | 1282 |
| 9 | НДК | 1135 | бул. Прага | 0364 |
| 10 | бул. Прага | 0365 | НДК | 1134 |
| 11 | пл. Македония | 1281 | бул. Пенчо Славейков | 0356 |
| 12 | ул. Пиротска | 2113 | ПГД „Елисавета Вазова“ | 1737 |
| 13 | бул. Сливница | 0376 | бул. Акад. Иван Гешов | 0271 |
| 14 | ул. Клокотница | 1994 | пл. Ручей | 1304 |
| 15 | Централна гара | 1330 | бул. Гоце Делчев | 0312 |
| 16 | Пета градска болница | 1255 | ж.к. Мотописта | 0672 |
| 17 | кв. Триъгълника | 1777 | ул. Тодор Каблешков | 2212 |
| 18 | Метростанция „Хан Кубрат“ | 2663 | кв. Манастирски ливади – запад | 0581 |

OSM names two stop pairs differently: 0272 / 0271 "метростанция България" (the M3 station opened beside it)
and 0365 / 0364 "Петте кьошета" (the junction the stop is at). The directive's names are kept for the
displays and the announcements.

The path is routed on the OSM tram tracks (`railway=tram`, Overture `transportation/segment`, subtype rail,
class tram) by `tools/build_tram_route.py` (shortest path whose heading never turns by more than 40° at a
track node; the tram leaves each stop the way it came):

- direction A 8 933 m, direction B 8 933 m; turning loops: Хан Кубрат 390 m (2663 → 2477), Манастирски ливади
  – запад 166 m (0581 → 0582);
- streets (A): бул. България (Мотописта, Гоце Делчев, пл. Ручей, Акад. Иван Гешов, Елисавета Вазова, Пенчо
  Славейков), west of НДК to Петте кьошета, бул. Ген. Скобелев, бул. Христо Ботев (пл. Македония, Пиротска,
  Сливница, Клокотница), Централна гара, бул. Княгиня Мария Луиза / Рожен (Пета градска болница), Триъгълника,
  ул. Ген. Жостов to the Хан Кубрат loop;
- the tram network round the line: 1 006 track edges within 700 m (652 in a carriageway), 219 switch and
  crossing nodes. Two short OSM bridge flags on бул. България (the Perlovska river); no tunnels.

**Shared with line 12** from пл. Македония to Триъгълника (line 12's directions overlap line 7 over 3.3 km
each). In the line 7 world, line 12's trams (Schindler, T6M-700) run on their own track lines with their own
stops and destinations over that stretch (`src/gameplay/SharedTrams.js`); the trams see each other's
sections on the track ahead, whatever their line (`AITramDriver`), and the driven tram stops against them.

**Temporary changes (route variants).** Reported 2026 changes for the reconstruction of бул. Княгиня Мария
Луиза: a June–August phase (line 7 from Манастирски ливади on its usual route to Централна гара; dates
approximate) and 14 September – 12 October (lines 3, 4, 6 and 7 changed). Both are over and neither had a
published stop list in a reachable source, so they are stored as variants with `status: unverified` and the
game runs the regular route.

Track gauge 1 009 mm.

## Vehicles

### PESA Swing 122NaSF (photos 1–5)

- Pesa Swing family: 100 % low floor, five sections on three fixed (non-pivoting) bogies, length 30 120 mm
  (Wikipedia via search summary); the Sofia order: 30 m, 2.3 m wide, 41 seats, 160 standing (Railvolution,
  Railway Gazette); four 105 kW asynchronous traction motors, air-conditioned (Railway Gazette). 2013: 20
  ordered, 2016: 5 more, 2019: 13 of the variant 122NaSF2, 2021: 25 more.
- **Read from the photos:** cabs at both ends (the mirror and windscreen at the far end in photo 3, the
  pantograph seen over either end section in photos 1 and 3), doors on both sides: one single door behind
  each cab, two double doors in each suspended section, none in the bogie section in the middle (photos 2,
  3); arched louvred covers over the three bogies; light grey roof, skirt and bellows; blue window band; the
  yellow line under the windows; yellow front with two rows of three round lamps on a chrome line.
- **Estimated for the model:** section lengths 6.95 + 5.6 + 3.22 + 5.6 + 6.95 m with 0.45 m joints (30.12 m);
  bogie centres 4.9, 15.06 and 25.22 m from the front; doors at 2.0–2.9 m (single), 7.6–9.0, 11.4–12.8,
  17.32–18.72, 21.12–22.52 m (double), 27.22–28.12 m (single); height 3.40 m over the roof covers; floor
  0.38 m with the wheels under seat podiums; empty mass 39.5 t; the seat plan (41 seats, 2+1).

### Inekon T8M-700IT (photos 6–10)

- A twin-section T6M-700 cut at its Jacobs bogie with a low-floor centre section inserted (Railway Gazette:
  360 mm entrance height, wheelchair and pram ramp); 18 rebuilt, in service from 2009, fleet numbers
  2401–2418 (Wikipedia); length 26 620 mm, width 2 250 mm, height 3 100 mm, mass 30 040 kg, axle formula
  B0′ 2′ 2′ B0′ (bg/en Wikipedia, Wikidata via search summaries); the Cegelec TV Europulse converter
  (Wikipedia via search summary).
- **Read from the photos:** high-floor end sections with an unpowered bogie at their inner end and the
  powered bogie behind door 1 (front) and between the last two doors (rear) (photo 7); the centre section
  hung between them, lower, its blue dipping into the orange in a V (photos 7, 8); five doors on the right,
  none on the left (photos 6, 8); the raked windscreen with a yellow-green LED display; slanted
  three-lamp housings; the rear with the large window and pairs of round red lamps (photo 8).
- **Estimated for the model:** sections 10.25 + 5.52 + 10.25 m with 0.3 m joints; bogies at 5.0, 9.55, 17.07
  and 23.27 m; doors at 2.35–3.6, 7.55–8.75, 12.6–13.85 (low floor), 20.4–21.65 and 25.25–26.3 m; traction
  power 4 × 55 kW; four steps between the low and the high floor in the ends of the centre section.

Fleet numbers shown: the photographs' 2312 / 2314 (PESA) and 2413 / 2408 / 3406 (Inekon) and others of the
same series. Both types run on line 7 in the game, 50 / 50 by default: a game setting, not a claim about the
real fleet assignment.

## Landmarks along the line (sources and status)

- **НДК** (stops 1135 / 1134): built 1978–1981 (opened 31 March 1981), architects Alexander Barov and team,
  engineer Bogdan Atanasov; 123 000 m² on 8 floors above ground and 3 below, site 18 300 m², volume
  576 800 m³; clad in Vratsa limestone; the bronze "Sun" by Georgi Chapkanov on the facade (Capital, BTA,
  eurocom.bg, stolica.bg via search summaries). Height: 51 m in several sources; the OSM main part is
  tagged 40 m (used). Massing from the six OSM building parts; facade composition estimated.
- **Millennium Center / Grand Hotel Millennium Sofia**, бул. Витоша 89Б (stops 0357 / 0356): three towers on a
  five-storey base — a 32-storey hotel, an 18-storey residential and a 24-storey office tower (Amfion); 112 m
  and about 40 000 m² of glass "made up of geometric forms" (Reynaers); Wikipedia: 118 m to the top floor;
  architect Borislav Bogdanov (Amfion), developer NIKMI. Footprints and storeys from the OSM building parts;
  the facade pattern is estimated.
- **МБАЛ „Княгиня Клементина“** (the former Пета градска болница, stops 1254 / 1255): names from the place
  data (Overture), massing from the OSM building parts; facades estimated.
- **Bulgaria Mall** (бул. България / бул. Тодор Каблешков, stops 2211 / 2212): opened December 2012; the
  glass office tower beside it completed 2014 (Infinity Office Tower, Building of the Year 2014) (Wikipedia,
  Salamanca Group, Capital via search summaries); OSM parts: the mall body 25 m, a round-roofed atrium 30 m,
  "South Tower" 22 storeys / 85 m and "North Tower" parts of 16 and 14 storeys, tagged glass.
- **Metro stations** (entrances drawn at the OSM station points, names checked against the place data):
  България (M3), Хан Кубрат and Княгиня Мария Луиза (M2), Опълченска (M1), НДК (M2), Централна гара (M2).
- **Централна гара**: the line 12 landmark (the same OSM footprint in both worlds).
- Not hand-built (OSM massing with the neighbourhood building types): the Ministry of Agriculture on бул.
  Христо Ботев 55, the УМБАЛ „Александровска“ blocks by the Елисавета Вазова stops, the design school, the
  pre-war blocks of Пиротска, Сливница and Клокотница, the Хан Кубрат blocks.

## Neighbourhoods

The corridor crosses Център (6.7 km of route), Белите брези (2.2 km, with Мотописта), Иван Вазов (1.9 km),
Борово (1.7 km), Манастирски ливади (1.3 km), Триъгълника-Надежда, Банишора and Красно село. Their building
profiles are in `data/research/world/neighbourhoods.json`; Белите брези was revised (triangle between бул.
България, бул. Гоце Делчев and ул. Кюстендил; first brick and panel blocks in the early 1960s, EPK blocks of
the 1980s and houses in the south, new residential after 1990 — bg.wikipedia, imotsofia.com via search
summaries); profiles for Бъкстон, Славия, Крива река, Зона Б-19 and Южен парк were added as estimates.

## Sources

- [Pesa Swing (Wikipedia, via search summary)](https://en.wikipedia.org/wiki/Pesa_Swing)
- [Railway Gazette: Pesa Swing tram presented to Sofia](https://www.railwaygazette.com/modes/pesa-swing-tram-presented-to-sofia/55238.article)
- [Railvolution: New Swing trams in Sofia](https://www.railvolution.net/news/new-swing-trams-in-sofia)
- [International Railway Journal: new Pesa Swing LRVs for Sofia](https://www.railjournal.com/passenger/light-rail/new-pesa-swing-lrvs-for-sofia-launched-on-route-18/)
- [Inekon T8M-700IT (Wikipedia, via search summary)](https://en.wikipedia.org/wiki/Inekon_T8M-700IT), [bg.wikipedia](https://bg.wikipedia.org/wiki/Inekon_%D0%A28%D0%9C-700IT), [Wikidata](https://www.wikidata.org/wiki/Q4402314)
- [Railway Gazette: refurbished tram back in Sofia](https://railwaygazette.com/refurbished-tram-back-in-sofia/33033.article)
- [National Palace of Culture (Wikipedia, via search summary)](https://en.wikipedia.org/wiki/National_Palace_of_Culture), [Capital: Един дворец на 40](https://www.capital.bg/light/tema/2021/07/16/4232940_edin_dvorec_na_40/), [eurocom.bg: НДК на 45 години](https://eurocom.bg/2026/03/31/ndk-na-45-godini-ot-mashtabno-stroitelstvo-do-ezoterichna-simvolika/), [stolica.bg: Сградата на НДК](https://stolica.bg/sofia-tur/arhitekturni-pametnitsi/sgradata-na-ndk)
- [Millennium Center (Wikipedia, via search summary)](https://en.wikipedia.org/wiki/Millennium_Center_(Sofia)), [Reynaers: Millennium Centre Towers](https://www.reynaers.com/inspiration/aluminium-project-references/facades-sliding-folding-millennium-centre-towers-sofia), [Amfion: Millennium Center](https://amfion-bg.com/en/portfolio/millennium-center/)
- [Bulgaria Mall (Wikipedia, via search summary)](https://en.wikipedia.org/wiki/Bulgaria_Mall), [Salamanca Group: Infinity Office Tower](https://salamanca-group.com/infinity-office-tower-wins-office-building-of-the-year-at-bulgarias-building-of-the-year-awards-2014-2/)
- [bgdnes.bg: tram changes on Мария Луиза](https://www.bgdnes.bg/polezno/article/22988210), [stolica.bg: changes from 14 September](https://stolica.bg/trafik/novi-promeni-po-stolichniya-mariya-luiza-ot-14-septemvri)
- Map data © OpenStreetMap contributors (ODbL) via Overture Maps Foundation, release 2026-10-21.0; terrain:
  Mapzen / AWS Terrain Tiles.

Unreachable from the build environment (fetches refused): en.wikipedia.org, bg.wikipedia.org,
amfion-bg.com, www.visitsofia.bg, sosofia.com; from earlier sessions also sofiatraffic.bg, sofiatraffic.com,
sofia.bg, mysofia.bg, openstreetmap.org and its API, openrailwaymap.org, overpass mirrors, transphoto.org,
trainspo.com, commons.wikimedia.org.
