# Line 64 — Зоопарка ↔ Център по хигиена: route research

Stop sequences live in `tools/lines.py` (`A64`, `B64`); `tools/build_route.py … 64` turns them into
`src/data/route64.json`, and `tools/build_world.py` builds `src/data/world64.pack.b64`.

## Sources

- Directive (Expansion 2.0): direction A, all 35 stops with codes; direction B, stops 1–18 with codes;
  request stops per direction.
- sofiatraffic.com, "Линия А 64: ЗООПАРКА - ЦЕНТЪР ПО ХИГИЕНА":
  https://sofiatraffic.com/transport/line/64-zooparka-tsentar-po-higiena
- metrosofia.bg, "Разписание Автобус 64 София" (35 stops in one direction, 33 in the other):
  https://metrosofia.bg/gradski-transport/bus-64
- sumc.bg, "Разписание на Автобус 64" (direction Център по хигиена → Зоопарка):
  https://sumc.bg/разписание-на-автобус-64/
- nsapb.bg, "Автобус 64 – маршрут със спирки": https://nsapb.bg/avtobus-64/
- gradskitransport.com, "Крайградска автобусна линия №64" (history: Център по хигиена – Автостанция
  Хладилника until 2015, then Център по хигиена – Зоопарка):
  https://gradskitransport.com/софия/крайградска-автобусна-линия-64/
- Moovit line page and timetable PDF ("Направление: Зоопарка / City Zoo, 33 спирки"):
  https://moovitapp.com/index/bg/градски_транспорт-line-64-Sofia_София-3501-857201-724853-3135829
- Stop poles and positions: OpenStreetMap `highway=bus_stop` nodes with the official code in `ref`,
  via Overture Maps 2026-10-21.0 (ODbL). All 68 codes exist in OSM.

From this environment the pages above could only be read through web-search excerpts: direct fetches of
sofiatraffic.com, nsapb.bg and appassets.mvtdev.com are blocked by the network policy.

## Direction B, stops 19–33 (not given by the directive; verified)

| # | Stop | Code |
|---|------|------|
| 19 | Киноцентър Бояна | 0931 |
| 20 | в.з. Киноцентър | 0413 |
| 21 | ул. 5 | 1803 |
| 22 | ул. 10 | 1791 |
| 23 | ул. Лешникова гора | 2026 |
| 24 | кв. Драгалевци | 0835 |
| 25 | Гробищен парк Драгалевци | 0509 |
| 26 | Околовръстен път | 1177 |
| 27 | кв. Кръстова вада | 0914 |
| 28 | ул. Асен Йорданов | 0783 |
| 29 | Метростанция „Витоша“ | 2780 |
| 30 | Метростанция „Витоша“ | 0912 |
| 31 | Хлебозавода | 2313 |
| 32 | ул. Сребърна | 0976 |
| 33 | Зоопарка | 0749 |

Each code is the pole on the B side of the street: its OSM node lies to the right of the B path.

## Deviations from the directive

- **B terminus is 0749, not 2764.** The directive lists 2764 as the last stop of B. The published
  timetables end direction B at stop 0749 (Зоопарка, arrival pole, 42.658314 N 23.328520 E). 2764
  (42.659096 N 23.327646 E) is the departure pole of direction A, about 115 m away. The game ends B at
  0749; the terminal link (B → A) drives the bus from 0749 round to 2764.
- **Request stops** are exactly as the directive gives them, per direction:
  - A: 1591 Скиорката, 1439 Резиденция Бояна, 0263 Гробищен парк Бояна.
  - B: 0262 Гробищен парк Бояна, 1448 Резиденция Бояна.
  - B's 1590 Скиорката is a normal stop, since the directive does not mark it.
- **Temporary diversions** mentioned by some sources (until 30.06.2024 and in October 2024) are ignored:
  the normal alignment is modelled.

## Route geometry checks (`route64.json`)

- Length: A 16.43 km, B 15.83 km. Each leg's path length is within 1.6× the straight-line distance,
  except at these places, which are real road geometry:
  - **A 2342 → 2343 (561 m for 87 m apart):** the bus arrives northbound on бул. Акад. Иван Гешов,
    turns at the next junction and serves 2343 southbound.
  - **B 0808 → 1590 (343 m vs 150 m):** the road loops around a block in кв. Бояна.
  - **B 0976 → 0749 (250 m vs 151 m):** the Zoo terminal loop on a service road.
  - **A 0510 → 0836 and B 0835 → 0509 (~900 m vs ~530 m):** the curving road (Папрат) up to Драгалевци.
- Streets in order (A): Сребърна → бул. Черни връх (Хлебозавода, Метростанция „Витоша“, Кръстова вада,
  Околовръстен път) → Папрат → Нарцис → Боянска → Кумата → Севастократор Калоян → Иваница Данчев →
  Даскал Стоян Попандреев → бул. България → бул. Петко Ю. Тодоров → бул. Акад. Иван Гешов.

## Announcements

- Every stop has a written `speech` form (`tools/lines.py`). `src/audio/pronounce.js` expands any
  abbreviation still left before the Bulgarian voice speaks: ж.к., кв., в.з., ул., бул., пл., акад., СУ,
  НСА, АД, and numbers become words.
- Request stops add "Спирка по желание." to the next-stop announcement. The HUD marks them, and in
  passenger mode a toast reminds you to press STOP.
- **Unverified:** how the official voice reads "ул. 10" and "ул. 5". The game says "Улица десет" and
  "Улица пет" (cardinal numbers); the official recording may use ordinals ("десета", "пета").
