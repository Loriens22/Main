# Interior and driver's cab spec: MAN Lion's City G CNG (A23), Sofia

Companion file: `interior_spec.json` (same content, machine-readable, includes the full seat map and polylines).
Crops used as evidence: `crops/` (earlier run) and `crops2/` (this run). Side-by-side photo|render images: `../baseline/compare_v4.jpg`, `compare_v5.jpg`.

Frames: as `src/vehicle/BusSpec.js`. x right, y up (absolute from the ground, `floorY = 0.36`), z backwards. "front" frame origin = middle axle, "rear" frame origin = rear axle. Metres, hex colours.

Confidence: **high** = measured on a photo and consistent in both; **medium** = estimated from a photo with an assumed scale, or typology with a visible hint; **low** = typology only / not visible.

Both photos are under-exposed with a cool cast (a white ceiling reads about `#a19c90` in photo 5 and `#706e6a` in photo 4). Hex values below are *recommended albedo*; raw samples are in the JSON. Raw photo values must not be used as material colours.

What could not be found: the seat supplier and the validator hardware vendor. Many WebSearch queries in EN/BG gave nothing. WebFetch is blocked for man.eu, auto.cz, automotiveworld and mtc-man.com (DNS/policy), so only search snippets were available. The seat is identified by its shape and the embossed MAN lion oval, not by a catalogue number.

## 1. Seats ("the seats are bad")

### What it is (high for look, low for supplier)
A one-piece hard-shell City seat in light-grey plastic. It has a **dark charcoal cap** across the top of the backrest. The cap forms an arch-shaped grab handle with a **through slot**. An **embossed oval with a lion silhouette** (the MAN lion badge) sits on the back of the cap (photo 5, `crops/p5_seat_left.png`, `p5_seat_right.png`). Photo 4 shows the sitting face: plain grey, dished, no insert (`crops/p4_seatL_grid.png`, `p4_seatpair_grid.png`). Kiel, Fainsa, Ster and Vogel are NOT confirmed by any source. An older MAN Lion's City brochure snippet says the seats are cantilevered with no under-seat props.

### Dimensions (m, seat-local frame)
Origin on the floor under the pan centre. +z toward the backrest, y above the local floor. yaw 0 faces forward (-z).

| item | value | basis | conf |
|---|---|---|---|
| shell width | 0.44 (cap 0.43) | photo 4 cap 275 px at about 2.0 m | medium |
| double seat | 0.90 total, 0.01-0.015 dark gap between shells | photo 4 seatL crop | medium |
| centres x | window seat ±0.975, aisle seat ±0.515 | aisle 0.55-0.60 m between seat blocks | medium |
| pan depth / thickness | 0.43 / 0.03 | typology | medium/low |
| pan top above floor | 0.445 | typology | medium |
| top of cap above floor | **1.085** (current model 1.17, 8 cm too tall) | photo 4 camera-height calibration | medium |
| backrest rake | 10.5 deg | photo 4 | medium |
| cap height | 0.16 | photo 4 120/275, photo 5 66/196 | medium |
| grab slot | 0.27 wide x 0.055 high (0.07 at the centre), flat bottom edge, arched top edge, ends R 0.03, centre at y 1.035, 0.03 rim above, 0.08 side walls | photo 4 62% and photo 5 70% of the width | medium |
| top corner radius | 0.11 | cap silhouette | medium |
| cap lower edge | y 0.93 at the sides, 0.915 at the centre (shallow smile) | photo 4 | medium |
| rear recess panel | 0.30 x 0.30 rounded rectangle, R 0.06, centre y 0.72, slightly lighter | photo 5 | medium |

**Side profile polyline (z, y), closed polygon:**
`(-0.225,0.405) (-0.232,0.432) (-0.222,0.458) (-0.12,0.452) (-0.02,0.440) (0.10,0.428) (0.18,0.436) (0.215,0.50) (0.238,0.62) (0.258,0.80) (0.285,0.99) (0.305,1.085) | (0.345,1.080) (0.340,0.95) (0.305,0.70) (0.250,0.47) (0.205,0.405) (0.205,0.385) (-0.20,0.385)`

**Front outline of the backrest (x, y):** `(-0.215,0.46) (-0.222,0.70) (-0.218,0.95) (-0.205,1.04) (-0.16,1.082) (0,1.088) (0.16,1.082) (0.205,1.04) (0.218,0.95) (0.222,0.70) (0.215,0.46)` (mirror for +x).

**Build recipe:**
1. Pan and backrest are one shell: extrude the side profile across 0.44 with 0.01 bevel and a concave dish on the face.
2. The cap is a separate dark mesh covering y 0.93..1.085, wrapping over the top and down the rear face to about 0.93, with the slot cut through it.
3. No cushion pad on ordinary seats.
4. Embossed lion oval 0.07 x 0.045 on the rear of the cap (a darker decal is enough).

### Mounting (medium)
- **Cantilever from the side wall**, no pedestal. The floor is visible under floor-level seats.
- **Aisle side**, one of three:
  - a grey stanchion (D 0.04) with a black two-bolt clamp beside the seat;
  - a C-hoop guard tube (D 0.025) from floor to backrest top, on the front-right pair in photo 4;
  - on podiums, a small flat L-foot (0.04 x 0.15, light grey) under the aisle-side pan corner.
- A padded grey fold-down armrest flap (0.10 x 0.07) at the aisle edge of the bus-right double seats (photo 4 at 830-870, 1170-1230).

### Materials and colours
| part | albedo | raw photo | note |
|---|---|---|---|
| shell and pan | **#9a9fa5** | lit #838c97, shaded #4f5966, sunlit (photo 5) #b9bdbc | rough 0.42, metal 0. The current #8e9398 is right, but the env map makes it blue-white. |
| cap, slot, rim | **#3b3e45** | shaded #202128, lit #4a4f5b | same on both faces |
| clamps | #16171a | | |

### Moquette (medium on where)
**Where:** the flip-up seat in the wheelchair/pram bay on the bus-left wall (photo 4 at x1310-1480, y700-920). The whole backrest is moquette, 0.39 x 0.52, top corners R 0.08. A grey U-hoop frames it (`crops2/p4_moq.png`). A second dark folded seat further back (x1040-1090, y640-820) is possibly the same type (low). **No ordinary fixed seat has an insert in either photo**, including the red-sticker priority seat. The current model puts moquette on the rear-bench centre seat; that is not supported.

**Procedural recipe:**
- Base `#08090b`.
- Staggered dot grid: dots D 0.004, pitch 0.016, colour `#26292d`.
- Wavy horizontal lines, colour `#92b04c` peak (dark `#4f6330`):
  - width 0.003-0.005, amplitude 0.012-0.02, wavelength 0.16-0.25;
  - vertical spacing about 0.055 (7-8 lines over 0.5 m);
  - random phase per line, tilt ±6 deg, fading near the edges.
- Tile 0.5 x 0.5, roughness 0.95.

### Stickers (high)
Priority seat sticker "**Внимание! / Седалка за майки с деца, възрастни и хора с увреждания!**": 0.17 x 0.25. Red frame `#c8202c` with a white italic "Внимание!" on red at the top, then a white panel with a red disc D 0.12 holding white pictograms (elderly person with cane, adult holding a child), then 3 lines of dark-red italic text. It is on the **front face** of the backrest, top 0.17 below the cap (centre y about 0.78), on the first seats behind door 1 and the first foreground double seat on the door side. A small copy (0.09 x 0.20) is on the adjacent window glass (photo 4 at 225-275, 890-1000).

### Complete seat map (front frame / rear frame; full list with notes in the JSON)
Pan top = floor_y + 0.445. Total **47 seats + 1 optional low-confidence second fold seat** (generic A23 listings 41-47 seats; the Sofia count is unverified).

FRONT, bus-left (driver side), all facing forward:
| id | z | floor_y | mount | conf |
|---|---|---|---|---|
| F-L1 w/a (x -0.975/-0.515) | -5.45 | 0.62 | podium axle 1 | medium |
| F-L2 w/a | -4.65 | 0.62 | podium axle 1 | medium |
| F-L3 w/a | -3.75 | 0.36 | wall cantilever, C-hoop on the aisle edge | high |
| F-LF1 fold, moquette, x -0.98, faces forward | -1.55 (±0.8) | 0.36 | wall | medium |
| F-LF2 fold (optional) | -0.95 | 0.36 | wall | low |
| F-L4 w/a | 0.0 | 0.62 | podium axle 2 | high |
| F-L5 w/a | 0.82 | 0.62 | podium axle 2 | medium |

FRONT, bus-right (door side), all facing forward:
| id | z | floor_y | note | conf |
|---|---|---|---|---|
| F-R1 single x 0.975 | -5.45 | 0.62 | behind door 1 (photo 5) | medium |
| F-R2 single | -4.65 | 0.62 | | low |
| F-R3 w/a (x 0.975/0.515) | -3.7 | 0.36 | photo 4 row A | high |
| F-R4 w/a | -2.9 | 0.36 | photo 4 row B, in front of door 2 | high |
| F-R5 w/a | 0.0 | 0.62 | **double seat**; the model has only the window seat | high |
| F-R6 w/a | 0.82 | 0.62 | | medium |

REAR (no interior photo; the existing layout is kept, confidence low):
- Left: pairs at z -4.0 (rear-facing, yaw pi), -3.2, -2.4 (floor 0.36), -1.6 (0.62), -0.4, 0.45, 1.3 (0.82).
- Right: a single at -2.55 between doors 3 and 4, and pairs at -0.4, 0.45, 1.3 (0.82).
- Rear bench: 5 seats at z 2.45, x -0.96..0.96 step 0.48, floor 0.82, no moquette.

**Changes against `BusLayout.js`:**
1. F-L1, F-L2 and F-R1 are `yaw: Math.PI`, so they face backward. Photo 5 shows them facing forward. Use 0.
2. The folding seat is `yaw: Math.PI/2`, which makes it face the left wall. It should face forward (0).
3. The right axle-2 podium has only window singles. Photo 4 shows double seats on both podiums.
4. The podium must reach the aisle edge (see 5).

**Standing areas** (JSON `standing_areas`):
- Aisle 0.54-0.60 wide between seat blocks, only 0.47 between the axle-2 podium edges (the current STANDING boxes are 0.9 m wide).
- Door landings.
- Wheelchair/pram bay: x -1.20..-0.30, z -3.0..-1.75, opposite door 2.
- Turntable zone.

## 2. Poles, rails, straps

**Colours:**
- Grey tubes `#b3b7ba`, roughness 0.4, **metalness 0.25**, envMapIntensity <= 0.5. The current pole material (metalness 0.75) mirrors the sky and renders blue.
- Yellow rails `#f1b90f`.
- Yellow floor strips `#f2e12c`.
- Collars `#c3c6c8`, clamps `#16171a`, foam grips `#1d1d1f`.

**Diameters** (basis: photo 4, 25 px at 600 px/m):

| part | D (m) | conf |
|---|---|---|
| vertical stanchion | 0.040 | medium |
| longitudinal rail | 0.032 | medium |
| yellow door rails | 0.034 | medium |
| arch tubes | 0.028 | low |
| seat C-hoop | 0.025 | low |

**Longitudinal rails (medium):**
- One continuous rail per side along the whole saloon, at **x = ±0.66, y = 2.12**, from z -5.0 to 1.15 in the front frame.
- Hung from the duct by short diagonal stays (D 0.025, about 1.6 m pitch).
- **The front end bends down 90 deg (R 0.12) into a vertical stanchion at the cab bulkhead/display** (photo 5: left at x285, right at x810). The rear end does the same at the bellows portal.
- The current model is a straight 0.032-equivalent tube at x 0.62, y 2.05 with thin hangers.

**Candy-cane arches (medium):**
- Most aisle stanchions continue above a collar on the rail as a swan-neck that sweeps outward and up into the lower edge of the duct (photo 5 at x930, y40-280; photo 4 right at x1240-1580).
- Path, right side (x, y above ground): `(0.30,1.70) (0.30,2.05) (0.34,2.22) (0.46,2.35) (0.66,2.44)`, D 0.04.
- Fit one every ~1.6 m; the other stanchions end in a collar under the rail.

**Vertical stanchions:** grey, D 0.04, floor/podium-top to y 2.05, at |x| = 0.30 (aisle edge of the seat blocks).
- Front, right side (z): -4.30, -3.30, -0.45, 0.95.
- Front, left side: -5.0, -3.45, -1.85, -0.45, 0.95.
- Podium-front poles (z -0.45) end in a **white module (0.04 x 0.14, two green LEDs)** just above the podium top (photo 4 at 1120, 1040-1070, `crops2/p4_stanchion_L.png`). This is probably the wheelchair stop request.
- Rear section: low confidence, same rule.

**Horizontal grab rails (medium):**
- Grey tube at y 1.0 from the aisle pole to the left wall at the wheelchair bay (z -2.9), with a 0.35 black foam grip.
- A ball-clamp + tube with a black foam grip across the axle-2 podium seat backs, y 1.05.
- A small D-shaped grey wall handle (0.10) at y 0.95 beside the first seats.

**Yellow (exactly these):**
1. Two vertical poles per door (D 0.034, floor to duct) at x +0.98, z = door.z0 - 0.08 and door.z1 + 0.08.
2. Behind the row in front of door 2 (and door 1): two crossing barrier tubes.
   - One tube from the door pole top (y 1.05) arcs outward (R 0.25) toward the window pillar and down.
   - A second, lower tube crosses it (photo 4 at x520-770, y750-860, `crops/p4_door_rail.png`).
3. A curved yellow pull handle on each door leaf's frame (photo 1 `crops/p1_door1.png`).
4. 0.045 floor edge strips on every podium (aisle edge and front edge, turning the corner), the door sill and the cab step.
5. A yellow oval emergency-release pull on the side duct above each door (photo 4 at 660, 390) with a small red lamp beside it.

Everything else is grey. Some tube ends carry small yellow plugs.

**Straps (medium):**
- A narrow teardrop loop of thin grey webbing, `#9aa0a4`, 0.36 long and 0.09 wide at the bottom.
- Hangs from a pale-grey sleeve clip (0.05, `#c9ccce`) on the rail. **No rigid rings** (the current model uses rings).
- Clusters of **3** side by side (0.04 apart) at every stanchion/collar, about 4 clusters per side per section. Loop bottom about y 1.70.

## 3. Ceiling (high for look, medium for sizes)

**Heights (medium).**
- Flat centre **y 2.74**, flat width 1.46.
- Side ducts slope from y 2.72 at |x| = 0.73 down to **2.56 at |x| = 1.20** (the window head):
  `(0.73,2.72) (0.90,2.68) (1.07,2.62) (1.20,2.56)`.
- The current ceiling is at 2.48, only 2.12 m of headroom. About 0.26 m too low.

**Flat panels.** Colour `#d6d4cc` (photo raw `#a19c90`), made of large panels with hairline seams. A curved lowered header (0.15) sits at the cab bulkhead and at the bellows portal.

**Side ducts.** Colour `#d2d1c9`, in segments of about 1 m alternating:
- a **pictogram panel**: blue discs D 0.09 (`#123a8a`) with a white "standing passenger holding on" figure, as pairs of overlapping discs, 2 pairs per panel;
- a **grille panel**: perforated rectangular field 0.55 x 0.34 in the slope, 14 rows x 30 staggered slots, slot 0.012 x 0.005, row pitch 0.022, column pitch 0.017, slot colour `#4a4c4d`. A smaller 6x4 dot field (0.05 x 0.04) sits near the cab bulkhead and near each light.
- Next to the bulkhead: one pair of pictograms plus a grey-white hand-pictogram sticker (0.10 x 0.12).
- A white info label (0.12 x 0.18) on the right slope (photo 4 at 1360-1410, 330-390).

**Light panels (medium).**
- **Not** two long strips. A single row of frosted rectangular panels 0.55 x 0.14 on the **bus-left half** at x -0.38, y 2.735.
- Pitch about 2.0 m: z_front -4.9, -2.9, -0.9, 1.0; z_rear -4.0, -2.0, 0.0, 2.0.
- Emissive `#f4f8ff`, about 4000-4500 K.
- Evidence: in photo 5 the panels are left of the display axis; in photo 4 right of the axis (consistent only with bus-left).

**Other ceiling items.**
- Round sensor/camera D 0.04 at the ceiling centre.
- An oval silver convex passenger mirror or dome-camera housing (0.28 x 0.20) above the front end of the bellows (photo 4 at x810-915, y340-420) and a smaller one behind it (low).
- **Roof hatches: none visible.** Leave out, or add one 0.5 x 0.5 at z -2.6 (typology, low).
- **Emergency hammers (high):** red holders 0.10 x 0.04 on the window header, 2 per side, y 2.50, x ±1.19 (photo 5 at 0-60, 295-325 and 1030-1067, 340-365).
- Yellow window-release tabs 0.04 x 0.02 on the window header.
- Green exit pictograms (0.06 x 0.12) on pillars and door glass (photo 4 at 665-690, 515-545).

## 4. Walls and floor

**Side wall (medium).**
- Lower panel `#cfd1cd` from floor to sill y 1.02, with a 0.06 rounded sill ledge `#c8cac6`.
- Window pillars **light grey `#d4d5d0`, 0.11 wide x 0.10 deep, rounded**. The current model draws thin black pillars.
- Window frames `#111315` (black aluminium). Each window has a lower fixed pane (1.02-1.62) and an upper pane (1.66-2.52) separated by a **0.07 black transom** (photo 4 at left). Dark-tinted glass.

**Floor covering (high).**
- Speckled grey rubber, granite look: base `#6a7077`, about 12% light flecks `#c4c8cc` (1-3 mm), about 5% black flecks `#2c2f33`, roughness 0.9, tile 0.5 m.
- Photo values: aisle in light #9da1a6 to #dde0e5, in shade #221e21.
- The current floor (0xc9d0d8 with a map) renders nearly black navy. Wrong.

**Podiums (wheel-arch housings, medium).**
- Top y **0.62** (0.26 above the floor; photo 4 riser 90 px at 349 px/m).
- **They span the whole double seat, from the wall to the aisle edge at |x| = 0.295.** In z they cover the wheel arch plus margin:
  - front-axle podium z -6.0..-4.3;
  - middle-axle podium z -0.85..1.30.
- Risers are vertical, R 0.06 on the aisle corner, the same speckled rubber `#6a7077`.
- **Yellow edge strip** (0.045) along the aisle edge and front edge, turning the corner (photo 4 right podium at x1075-1210, y840-1040, `crops2/p4_floor_mid.png`).
- Aisle between the axle-2 podiums is about **0.47 m** (high-medium; 165 px at 349 px/m).
- The current model has 0.5 m boxes at x ±0.97 (inner edge 0.72), so the seats float and the aisle is 1.44 m wide.

**Turntable plate (medium).** D 1.70 centred on the hitch (front z +1.70, rear z -5.07). Ribbed aluminium `#7d7a73`, ribs 0.012 every 0.025 running **across** the bus, thin black ring gap 0.015, flush with floor_y + 0.01 (photo 4 at x920-1065, y900-980). The current D 1.9 flat `#4b5157` disc is the right size but the wrong texture.

**Bellows tunnel.** Dark charcoal ribbed `#26282a`. A black arch header (0.22) with silver "MAN" lettering (0.20 x 0.05) on the rear-section front wall above the portal (photo 4 at 630-720, 495-515).

**Rear platform steps:** inferred 0.20 + 0.26 high with yellow nosing; keep the existing ones.

## 5. Doors from inside
- Two glazed leaves with a black frame 0.035, green exit pictograms (2 stacked) at 1.55 on the glass. The current leaves are fine.
- Yellow poles 0.22 inside the sill line (see section 2).
- **Request-to-open / stop button:** red round push-button D 0.06 with a yellow symbol on the yellow door pole at y 1.05 (photo 4 at 725-760, 825-865, raw `#c04336`, albedo `#d23a2c`).
- Ramp at door 2: a manual fold-out ramp (0.80 x 0.90, yellow edge) in the sill. Not visible in the photos (typology, low).

## 6. Displays and devices

**Interior next-stop LED display (medium).**
- A **light-grey rounded-rectangle housing** `#d4d3ce` (R 0.04, frame 0.02) around a black glass face. Housing 0.95 x 0.21 x 0.10, face 0.90 x 0.165, tilted 5 deg toward the passengers.
- Hung from the ceiling at the cab bulkhead, centre x -0.04, **y about 2.62**, z about -5.65.
- Content: a **single line of small amber dot-matrix text** (`#ffb12a` on `#0c0a08`), char height about 0.035, centred.
- Basis: photo 5, housing 372 x 82 px; scale from the stanchions at ±0.65 m gives 404 px/m.
- The current black box (1.1 x 0.2) at y 2.3 with two lines of large text is too low and wrongly styled.
- A second display at the rear-section front wall, facing rearward (low).

**Validators (low-medium).**
- Sofia's open-loop EMV + city-card system (BPC O-CITY with DSK Bank, about 3,900 validators fleet-wide per search snippets). Hardware vendor not found.
- A small black unit about 0.10 x 0.19 x 0.06 on a bracket on the yellow door pole at the **trailing edge** of each door, 1.10-1.25 above the floor, with a small colour screen on top, a green/red LED bar and an NFC mark. Body `#1c1d20`.
- Evidence: a dark rounded unit on the door-1 pole in photo 1 (`crops/p1_door1.png` at 185-240, 470-540) and dark upright blocks at the door-2 pillar in photo 4.
- The current position is OK; the box is too tall and wide.

**Stop-request buttons.** Red round push-button (above). Also the white two-LED module at the podium pole feet (medium). Dark half-disc pads on the aisle poles next to seat backs (low).

**Red items.** The red items in the photos are the hammer holders. The door emergency release is the yellow oval in the duct.

**Information stickers:**
- Priority seat sticker (section 1).
- **Cab partition glass, passenger side**, y 1.40-1.95 (photo 5 at 130-380, 50-340):
  - a no-smoking header "Пушенето забранено! При нарушения звънете на телефон 02 ... 71 11";
  - an A4 white sheet (0.21 x 0.30) with fine print and 6 small icons;
  - a violet/white "Безплатен интернет" Wi-Fi sticker (0.12 x 0.05) and a round no-mobile-phone sign, below it.
- Round red-ring no-phone/no-smoking signs (D 0.05) on the door-1 glass.
- At the wheelchair bay on the left wall glass (y 1.15-1.40): blue wheelchair disc D 0.10, white pram square 0.10, two blue rule discs with tiny text, yellow diagonal tape (photo 4 at 1620-1700, 740-890, `crops2/p4_pramarea.png`).

## 7. Driver's cab (photo 5; outside views in photos 1-3)

**Platform (medium).** The driver's platform is raised about 0.33 above the main floor (a MAN driving-comfort snippet says 330 mm) to **y 0.69**. Photo 5 shows a yellow step strip at the console base (492-503, 786-796). The current model keeps the seat and pedals on the passenger floor.

**Partition and screen (medium; the layout is low-medium).**
- **Rear wall behind the driver:** x -1.20..-0.45 at z_front -5.86.
  - Lower panel 0.85 high, `#d7d8d3`.
  - Above it a very dark smoked glazed panel (from y 1.25 to 2.55, `#14181c`, black frame). The notices are stuck on it. A white pillar (0.10, `#d9dad5`) at x -0.42.
  - Basis: photo 5, 280 px = 0.71 m at 392 px/m, 550 px tall.
- **Aisle-side clear screen** (glass/polycarbonate from the console top at 1.35 to the header at 2.55, black post). A clear cab door panel with a grey curved pull handle 0.40 long on the pillar.
- **Console** x -0.40..0.0, z -6.9..-6.3, top y 1.10:
  - navy-blue top shelf (`#1f3552`, raw `#49525f`) with a rounded front corner and a small black terminal on a stalk;
  - white lower body `#d9dcd8` with a red extinguisher sticker;
  - yellow step strip at the base.

**Dashboard.**
- Navy/anthracite soft **top pad** `#22303f` (raw `#464c4f`) across the whole windscreen width, front edge at about y 1.45.
- Light-grey lower panels `#cfd2d3` with a red extinguisher bracket (`#b3261e`), a red bucket and a teal cloth (photo 5 at 530-1000, 670-800).
- **Driver panel** (VDV-style MAN workplace; low confidence, typology). Dark grey `#2b2e33` binnacle in front of the driver with an instrument cluster about 0.33 x 0.16 (2 analog gauges, a central colour display, tell-tale rows). A lowered left panel with door buttons 1-4, kneeling/ramp and hazard. An angled right panel with rocker switches and the **D-N-R pushbutton selector** (3 square keys 0.03).
- Black ball knob (0.05) at the windscreen base right of the driver (photo 5 at 545-585, 598-632).
- Black block with a gooseneck mic on the dash at the right of the driver (photo 3 at 1000-1060, 355-410).

**Steering wheel (medium for angle, low for size).** D 0.50, rim 0.030, plane tilted about 30 deg from horizontal (photo 3: nearly flat ellipse 90 x 35 px), centre 0.80 above the platform, x -0.74, colour `#202124`, 3 spokes. The current model's -1.0 rad tilt is about right.

**Driver's seat (low).** Air-suspended high-back, dark grey cloth with navy bolsters (a navy seat with a blue cover is at photo 5 655-700, 735-780).

**Sun blind (high).** A dark grey `#4a4d50` roller blind with a diamond/X cord pattern across the upper windscreen. It covers the driver-side 55% (x -1.25..+0.10) and is pulled down about 0.45 from the header (photo 3 crop `crops/p3_windscreen.png`, photo 1).

**Cab ceiling and header (medium).**
- Light-grey cab ceiling with a closed grey header panel (0.20 deep) across the windscreen width. The back of the front destination sign sits behind it and is not visible.
- **Interior mirror:** an elongated convex mirror 0.26 x 0.10 in a light-grey frame (`#cfd0cc`), x -0.05, y 2.32, z_front -6.2 (photo 5 at 470-565, 420-460).

## 8. Lighting (medium)
- Bright, even, daylight-dominated. Add a hemisphere fill at about 35% of the sky colour. Ceiling and walls are a light warm grey.
- LED panels in cool white, about 4000-4500 K, emissive `#f4f8ff`, intensity about 1.0 (see section 3 for positions).
- At night, add one 0.9-intensity light per panel at 4200 K with a range of about 3.5 m.

## 9. Prioritised diff: current model vs reality
Based on `BusInterior.js`, `BusLayout.js` and the photo|render comparison images.

| # | area | current | reality | fix |
|---|---|---|---|---|
| 1 | **Seats** | flat rectangular plate, small rounded slot inside the face, dark-blue cushion pad, backs 1.17 m tall, blue-white tint | one-piece shell with a **dark charcoal arch cap** carrying the through handle slot (0.27 x 0.06), dished face, plain light-grey pan, cap top 1.085, lion oval on the back, rear recess panel, cantilever mount | rebuild `seatGeometry()` from section 1; materials `seat #9a9fa5` and `seatCap #3b3e45`; drop the cushion pads except on the fold seat |
| 2 | **Podiums and floor** | 0.5 m boxes at x ±0.97, near-black navy floor | podiums wall to aisle edge (x 0.295), 0.26 high, speckled grey rubber, yellow strips; floor speckled mid-grey; aisle 0.55 / 0.47 | podium boxes 0.905 wide; recolour the floor texture; yellow strips |
| 3 | **Ceiling** | flat grey at y 2.48, white sloping ducts with a thin vent line, two long strips at ±0.72 | ceiling 2.74 with panel seams, side ducts with slot grilles and blue pictogram stickers, one row of 0.55 x 0.14 panels on the bus-left | raise the ceiling; grille texture; pictogram decals; replace the strips |
| 4 | **Poles, rails, straps** | thin blue-metal straight rails at 2.05 with rigid rings and thin hangers; poles at x ±0.5 with red boxes | grey D 0.04 stanchions at x ±0.30 with candy-cane arches, D 0.032 rail with collars, teardrop strap loops in clusters of 3, foam-grip bars | section 2; pole material metalness 0.25 |
| 5 | **Seat facing and map** | front axle-1 rows face backward, fold seat faces the wall, right podium singles | all front seats face forward; right axle-2 podium double seats; 47 (+1) seats | apply the BusLayout changes |
| 6 | **Walls and windows** | huge windows with thick black pillars, white wall block | light-grey 0.11 pillars, two-pane black frames with transom, light-grey lower wall with sill ledge | section 4 |
| 7 | **Display and cab** | black box 1.1 x 0.2 at y 2.3 with two lines; dash, partition and console as boxes on the passenger floor | light-grey housing 0.95 x 0.21 at y 2.62, single amber line; platform +0.33 with yellow nosing; navy dash; black glazed partition with notices; console; mirror; sun blind | section 7 |
| 8 | **Door areas** | poles, validators, cylinder handles | plus yellow barrier arcs behind the row in front of door 2, red stop knob, yellow release pull, exit pictograms | sections 2 and 5 |
| 9 | **Turntable and bellows** | flat dark disc | ribbed aluminium plate with a ring gap, dark ribbed tunnel, MAN lettering | texture |
| 10 | **Stickers and details** | one sticker on a wrong seat | see section 6, hammer holders, wall pictograms | decals |

## 10. Open questions
- The exact seat supplier and the seat count of the Sofia A23 G.
- The rear-section layout (no interior photo; all rear entries are low confidence).
- The validator model, and whether it sits on the trailing or leading pole.
- The exact cab layout (partition vs door vs console). Photos 1-3 give only an outside view and photo 5 only a partial one.
- The z of the wheelchair-bay fold seat (±0.8 m).
- The true ceiling height: derived from a camera-height calibration (medium).
- The raised driver platform at 0.33 (medium).
