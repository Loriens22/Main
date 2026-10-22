# MAN Lion's City G CNG (A23 facelift), Sofia: exterior spec

Machine-readable twin: `exterior_spec.json` (same numbers, with basis + confidence per item).
Crops and rectified views: `crops/`. Photos: `data/research/ref_photos/user_ref_{1,2,3}.jpg`.

## 0. Read this first

**Which side is which (confirmed).**
- Photos 1 and 3 show the bus's **RIGHT (kerb, door) side**. The brief calls photo 1 "front-left"; it is front-right.
- Photo 2 shows the **LEFT (driver) side**: no doors, a flat window band, a flap ahead of the front wheel.
- The curved **ram's-horn mirror is on the RIGHT side only**. The LEFT mirror is a compact tall black two-segment box bolted to the A-pillar corner.
- The game model puts identical ram's horns on both sides. That is wrong.

**Frames.**
- x = +right (the image-LEFT side when you look at the bus from the front), Y = up from the ground.
- `S` = metres behind the front face plane along the front section. BusSpec front frame: `z = -7.805 + S`.
- Rear-section values use the BusSpec rear frame: origin at the axle-3 centre, +z backwards.

**Confidence.**
- high: two sources agree, or a direct measurement was cross-checked.
- medium: one source, about +/-0.1 m.
- low: inferred, or about +/-0.3 m.

**Method (so you can judge the numbers).**
1. Rectified the lower front of photos 1-3 onto the plane of the registration plate (plate frame assumed 0.54 x 0.15 m) → `crops/rect_p*_lower.png`. These give frontal elevations of grille, letters, fleet number and lamps. Photos 2 and 1 agree with photo 3.
2. Fitted a pinhole camera to photo 3 (plate corners + 3 wheel ground points, residual 2-3 px; camera about 5 m right of and 9.6 m ahead of the bus, yaw 22 degrees). Every "P3cam" number is a back-projection onto the front plane or the right-side plane. Heights and lateral positions near the front are good to +/-0.05..0.1 m. Along-body positions are good to +/-0.1..0.3 m, worse at the far end.
3. The first attempt used 156 px/m from the plate width for heights. That is wrong because yaw foreshortens only the horizontal. The camera model corrected it: front header top is 2.86 m, not 3.03 m.

**Blocked hosts / tooling.** WebFetch could not resolve any host (sofia.bg, kamioni.bg, busphoto.eu, man.eu, mtc-man.com, capital.bg, seenews.com, bahnbus.lima-city.de). capital.bg returns 403 through curl. Only WebSearch summaries were usable, so the MAN brochure PDFs were not read directly.

---

## 1. Fleet, order and the vehicle

| Fact | Value | Basis | Conf. |
|---|---|---|---|
| Order | 126 articulated MAN Lion's City G CNG, Euro 6; first 49 in 2014, other 77 in 2015; 60 more of the same type in 2019 (186 in the fleet) | sofia.bg "Novi avtobusi MAN po linia 204"; capital.bg 2013-14; Wikipedia "Public buses in Sofia" (via search) | medium |
| Contract | 66,553,050 BGN, MAN Truck & Bus, OP Environment funding; buses have A/C and a mechanical ramp | capital.bg, economynews.bg | medium |
| Version | **NG 313 CNG, A23 platform "Lion's City G"**, 18 m. Not the 18.75 m GL (A40) | BUSPHOTO lists Sofia 3105 as "A23 Lion's City G NG313 CNG"; datasheet length 17.98 m; photos show 3 axles + 4 doors | medium |
| Model year | 2014/15 for the first 126. The user's plates CB 5696/5713/5720 HM cannot be mapped to a delivery year. The 2019 batch looks the same | - | low |
| Seats | datasheet (diesel G) 40 seats + 122 standing; line-204 release: about 190 places. The interior agent owns the layout | Hirschler datasheet Dec 2014; sofia.bg | low |
| Engine | MAN E2876 LUH 12.8 l CNG, 228 kW (310 hp), rear-mounted lying engine; 8 aluminium cylinders x 214 l on the roof (the Ankara batch has 9 x 205 l) | busandcoachbuyer.com, cbwmagazine.com, Kuhn 2018 | medium / low (cylinder count) |

Datasheet (Hirschler, Dec 2014, via search): length 17.98, width 2.5(5), height 2.88 (diesel), wheelbase 5.11 + 6.77, overhang 2.67 / 3.46, turning circle 23.39 m, doors "3 or 4 pneumatic double-width swing doors". CNG height with roof pods: 3,320 mm (GL CNG listings).

---

## 2. Overall dimensions

| Item | Value | Basis | Conf. |
|---|---|---|---|
| Length | 17.98 m | datasheet | high |
| Width (body, no mirrors) | 2.55 m | listings / EU limit (datasheet says 2.5) | medium |
| Height, front header top | **2.86 m** | P3cam 2.80-2.89; datasheet body 2.88 | medium |
| Height, side roof edge (white rail top) | 2.80 m | P3cam | medium |
| Height with CNG pods | 3.32 m (BusSpec 3.34 is fine) | GL CNG listings | medium |
| Skirt / lower body edge | **0.33 m** (BusSpec 0.27) | P3cam 0.31-0.36 | medium |
| Front bumper lower edge | 0.31 m | P3cam/P2rect | low |
| Floor / threshold at doors | 0.33 m (BusSpec 0.36) | P3cam thresholds 0.31-0.38 | medium |
| Axle 1 / 2 / 3 | S = 2.70 / 7.805 / 14.575 (wheelbases 5.105 + 6.77) | datasheet | high |
| Rear overhang | 3.46 m (BusSpec 3.405, fine) | datasheet | medium |
| Tyres | 275/70 R22.5, R 0.478, twin on axle 3 | typology; P3 | medium |
| Articulation | hitch 1.7 m behind axle 2 (kept from BusSpec); visible straight bellows about 0.9 m long | not independently measured | low |
| Front corner radius (plan) | about 0.50 m on the lower body; flat centre panel only \|x\| < 0.78 | P2/P3 | low |
| Side-wall tumblehome | x 1.275 up to Y 1.30, 1.255 at Y 2.0, 1.235 at Y 2.65 (about 2 degrees); roof radius about 0.20 from Y 2.78 | P3 | low |

---

## 3. FRONT (most important)

Front-view numbers in the bus frame (x +right, Y above ground). Full structure in the JSON `front` block.

### 3.1 Colour zones
About **75 % of the lower front is WHITE**, not black.
- Black: the grille trapezoid, the windscreen base band (Y 1.00-1.22), the LED header (Y 2.30-2.86), the mirror housings, the door/A-pillar frames.
- The current render reads mostly black below the screen because of the grille plane and the dark headlamp housings.

### 3.2 Face profile
- Centre panel: flat and vertical for \|x\| <= 0.78, from bumper bottom Y 0.31 to the chrome strip at Y 1.00.
- Outside that, a curved seam separates the corner modules, which wrap back with R about 0.5.
- Corner modules carry the headlamp and indicator units, and on the right side the three pictograms.
- Bumper: white, lower edge Y 0.31, rising to about 0.40 at the corners. No black bumper strip.

### 3.3 Grille (gloss black, recessed 0.01-0.02 m)

Polygon (x, Y): `(+0.77,0.785) (-0.78,0.785) (-0.64,0.525) (-0.52,0.495) (+0.52,0.495) (+0.62,0.525)`

- That is a trapezoid 1.55 m wide at the top and 0.29 m tall.
- Side edges slant inwards by about 0.14 m. Lower corners are chamfered.
- Very fine horizontal texture. A thin grey bar sits at each lower-outer edge.
- Basis: P3cam and P2rect agree (top Y 0.78, bottom 0.50). Confidence high.

### 3.4 Letters, strip and emblem

| Part | Value |
|---|---|
| "MAN" letters | 0.51 x 0.10 m, centre (0.0, Y 0.69), raised 0.01 m. Satin chrome #b9bcbe with bevel #6f7377, extended bold sans. high |
| Chrome strip | 0.02 m thick polished moulding along the top of the white face, from x +0.92 to -0.88 at Y 1.00. In the middle it dips into a **gull-wing / V pocket 0.34 m wide, 0.07 m deep** that holds the lion emblem. high |
| Lion emblem | centre (0.0, Y 0.94), 0.22 x 0.09 m. Chrome #d5d9dc on a recess #2a2c30. high |

### 3.5 Plate, fleet number, pictograms, CNG diamond

| Part | Value |
|---|---|
| Plate | frame 0.54 x 0.15, plate 0.52 x 0.112, centre (0, Y 0.405), bottom Y 0.33. BG blue band on the left (bus right). Black holder with a text strip below. high |
| Fleet number | digits **0.135 m tall**, block 0.36 m wide, x from +0.75 to +0.38 (right of the centreline), baseline Y 0.78 (it sits on the grille top), top 0.915. Heavy upright condensed grotesque (DIN-Engschrift / Arial Narrow Bold), black #0b0b0b, digit width 0.075, gap 0.012. high |
| 3 blue pictograms | pram, wheelchair, walking person, from the corner inwards. Disc **0.14 m**, pitch 0.145, centres x = 1.23 / 1.09 / 0.94, Y 0.84. Disc #1560b5, white glyph and rim. **RIGHT half only**, on the curved corner module. high |
| Green CNG diamond | square turned 45 degrees, diagonal 0.125 m, centre **x = +0.45 (right of centre)**, Y 1.08, on the black base band. Fill #1d8a5a, white border + "CNG". high |
| Windscreen route card | cream card 0.35 x 0.22 m with black digits, x 1.11..0.76, Y 1.17..1.36 (lower passenger corner, behind the glass). medium |

### 3.6 Windscreen

Single panoramic glass, no centre mullion visible, 0.04 m black frit border. Glass Y 1.22-2.32 (1.10 m).

Outline (x, Y): `(-0.95,1.22) (0.95,1.22) (1.06,1.45) (1.12,1.80) (1.12,2.15) (1.02,2.32) (-1.02,2.32) (-1.12,2.15) (-1.12,1.80) (-1.06,1.45)`

- Plan: flat for \|x\| < 0.9 at S about 0.15. The outer 0.25 m curves back to S about 0.45 at \|x\| = 1.12.
- Side: rake about 8 degrees (top edge about 0.15 m behind the bottom edge), slight bulge. Bottom corners swept R 0.38, top corners R 0.15.
- Tint: nearly black (#0b0f14..#12202a) with strong reflections. The current opacity of 0.16 shows the whole cab; use about 0.6.
- Black base band: Y 1.00-1.22, glossy #0d0f12, carrying the diamond and the wiper pivots. It wraps round to the A-pillar.
- Confidence medium.

### 3.7 Black header with the LED destination sign

- Housing Y 2.30-2.86, x +/-1.27. It overhangs the glass slightly. Top corners R about 0.25 in plan.
- LED matrix: **1.72 x 0.32 m**, Y 2.36-2.68, x +/-0.86. Inferred 24 rows x about 128 columns, pitch 0.013 m (the "204" in photo 2 is about 21 dots tall).
- Text cap height 0.25 m, text Y 2.38-2.63.
- Route number left-aligned at x = +0.84, destination starting about 0.35 m to its right, bold proportional LED font.
- Colours: emitter #ff9a1a, hot centre #ffd27a, halo #c8630a, unlit dots #171310 on #0a0a0c. Amber-orange, not yellow.
- Thin dark bezel 0.03 m. Confidence medium.

### 3.8 Lamps

| Part | Value |
|---|---|
| Headlamp unit | rectangular **0.27 x 0.14 m**, right x 0.95..1.22, left x -0.94..-1.21, Y 0.64..0.78, in a white rounded recess about 0.34 x 0.20 (corner R 0.02). Clear lens, dark-grey frame #4a4d52. Two cells: **outer** (towards the corner) 0.11 m wide with a round chrome reflector and visible bulb; **inner** 0.16 m wide with a larger rectangular reflector or second projector. Halogen; **no LED DRL visible**. medium |
| Indicator / fog unit | 0.25 x 0.075 m at Y 0.49-0.58, directly under the headlamp. Inner 60 % = clear lens with fine vertical ribs (fog / cornering lamp); **outer 40 % = amber indicator #e07b0a**. Amber is on the outer end on both sides. right x 0.92..1.18, left -0.92..-1.18. medium |
| Marker repeater | orange-red 0.10 x 0.06 at Y about 1.15 on the right panel next to door 1 |

### 3.9 Wipers (low confidence)

Two tandem arms. Pivots sit on the black base band.
- Passenger (bus right): pivot (+1.02, Y 1.24), 0.95 m. Parked horizontal along the glass bottom edge, pointing to the centre.
- Driver (bus left): pivot (-0.72, Y 1.22), 1.0 m. Parked angled up about 18-20 degrees towards bus-right. This is the diagonal line seen in all three photos.
- Matte black #14161a.

### 3.10 Mirrors (the part the user stares at)

**RIGHT = ram's horn.**
- Root on the A-pillar roof corner at (x 1.15, Y 2.62, S 0.30).
- Arm path (x, Y, S): `(1.15,2.62,0.30) (1.30,2.56,0.12) (1.46,2.52,-0.10) (1.58,2.46,-0.32) (1.58,2.36,-0.40)`. The arm runs outwards **and forwards** in a smooth arc about 0.45 m long, then bends down with an inner radius of about 0.12 m.
- Arm section 0.09 x 0.06 (a flattened tube, not a 3.5 cm wire).
- Head: bean/capsule **0.26 w x 0.58 h x 0.14 d**, Y 1.82-2.40, centre (1.53, 2.10, S -0.40). The convex shell faces out; the mirror glass faces back and inwards (#59626a).
- Colour: satin black #15171a. Confidence low-medium (triangulated from photos 2 and 3).

**LEFT = compact box.**
- Tall rectangular housing bolted to the roof corner and A-pillar, with no arm.
- Size 0.25 x 0.68 x 0.14, Y 1.78-2.46, centre (x -1.34, S 0.10).
- Upper segment (main mirror) Y 2.04-2.46; shorter lower segment (wide-angle) Y 1.78-2.04; a visible horizontal seam between them; rounded vertical edges.
- Satin black #181a1d. Confidence medium.

---

## 4. SIDES

### 4.1 Bands (right and left)

| Band | Y |
|---|---|
| Lower white panel | 0.33-**1.30** |
| Black glazed band (windows) | **1.30**-2.68 |
| Black frame strip | 2.68-2.76 |
| White roof-edge fairing | from 2.76 (top 2.80) |

- **The belt is at 1.30 m, not 1.02 m.** The white panel is about 40 % of the body height.
- Door headers are at Y 2.45 with black transom glass above them.
- Basis: P3cam, 10 points, belt 1.29-1.37. Confidence medium.

### 4.2 Right side, front section (S from the front face; z = -7.805 + S)

| Element | S range | z (front frame) | Notes |
|---|---|---|---|
| **Door 1** | 0.62-1.87 | -7.185..-5.935 | BusSpec has -7.6..-6.4, **0.42 m too far forward**. Opening 1.25 m. medium |
| Panel + 2 amber lamps | 1.87-2.10 | | upper orange lamp Y 1.15, lower red-orange lamp Y 0.55 |
| Wheel arch 1 | 2.10-3.30 | | R 0.60 |
| Pane W1 | 1.95-2.95 | | carries the side LED sign at its top |
| Pillar | 2.95-3.12 | | 0.08 wide |
| Service flap | 3.55-3.98 | | Y 0.36-0.90, hairline-outlined, black slotted handle edge. Probably the CNG filling flap (60 %) |
| Pane W2 | 3.15-4.50 | | top hopper sash Y 2.22-2.62 over S 3.55-4.50 |
| Pillar | 4.50-4.68 | | 0.10 wide |
| Pane W3 | 4.70-5.45 | | narrow; route-number sticker in the glass |
| **Door 2** | 5.60-6.85 | -2.205..-0.955 | matches BusSpec within 0.1 m. medium |
| Narrow panel | 6.85-7.21 | | |
| Wheel arch 2 | 7.21-8.41 | | |
| Pane W4 | 7.05-8.95 | | one wide pane up to the bellows |

**Side LED sign.**
- S 2.05-3.05, Y 2.48-2.68, behind the glass at the top of pane W1. Orange, text about 0.17 m tall.
- The model has it 0.2 m too low (Y 2.38).

**Side stickers.**
- Blue priority sticker (pram/wheelchair), about 0.4 x 0.18 m, on the glass behind each door's rear jamb at Y 1.4-1.6.
- Marker lamps (red-orange 0.09 x 0.05) low on every lower panel at Y 0.45-0.55.

### 4.3 Right side, rear section (BusSpec rear frame, origin axle 3)

| Element | z range | Notes |
|---|---|---|
| Bellows plates | -5.07..-4.67 | |
| Panel + leaves + logo | -4.60..-2.15 | 2 panes |
| **Door 3** | **-2.05..-0.80** | ahead of axle 3 |
| Wheel arch 3 | -0.60..+0.60 | |
| **Door 4** | **+0.80..+2.05** | **behind axle 3**, over the rear overhang |
| Engine-bay side louvres | +2.15..+3.0 | white slotted panel Y 0.45-1.25, black louvre band Y 1.35-1.75 |

**Finding: door 4 is behind the rear axle.**
- Photo 3 (zoom `crops/p3_s_rear.png`) shows a full-height glazed double door with a header at door-3 height and a threshold strip at floor level behind the rear wheel. Its glass runs down to the floor, unlike a window.
- BusSpec has door 4 at -1.97..-0.77 and door 3 at -4.29..-3.09, so both doors are in the wrong place: door 4 sits where door 3 really is.
- Topology: confidence medium. Position: +/-0.3 m.

### 4.4 Left side
- No doors. Continuous window band from the A-pillar to the bellows and across the rear section. Panes 1.3-1.5 m, pillars 0.08-0.10, top hoppers on alternate panes.
- Front service flap S 0.85-1.75, Y 0.36-1.00, ahead of the front arch (low confidence).
- Leaf clusters on the lower panels as on the right.

### 4.5 Doors
- Double leaf, **inward swinging**. With door 1 open in photo 1 no leaves are visible outside, only the black frame and the yellow rail.
- Leaf about 0.62 m wide. Black anodised frame 0.05. Upper pane Y 1.25-2.40, lower pane Y 0.45-1.15, both tinted. Centre stile with black rubber seals. No outside handles.
- Portal: front pillar 0.10-0.12 wide (it is the A-pillar at door 1), rear pillar 0.08, header Y 2.45. Silver/stainless threshold strip at Y 0.33.
- Inside: curved yellow grab rail #d8b02a at the front jamb.
- Opening height about 2.05 m.

### 4.6 Wheels
- Silver painted steel disc wheel (#b5bac0 lit), dished, 10 elongated hand-holes, 10 nut studs on a raised hub ring. Not chrome.
- Tyre #0a0b0b, plain.
- Arches R 0.60 (centre Y 0.477, apex 1.08), black liner, plain white edge, no big flare. The tyre face sits about 0.15 m inside the side wall.

### 4.7 Skirt
- White bottom edge at Y 0.33 with a dark underbody behind it. No visible rubber lip.

---

## 5. LIVERY: the green leaves

**The leaves hang DOWN from the belt line like a fringe. They are not grass blades growing up from the skirt.**

| Property | Value |
|---|---|
| Rooting | top edge cut straight by the sill (Y 1.30) |
| Direction | tips point down; lowest tips reach Y 1.00-1.05 |
| Coverage | leaves fill only the top 0.2-0.33 m of the 0.97 m panel; the rest of the panel is plain white (logo, flap) |
| Shape | pointed oval / teardrop: broad rounded top, sharp tip. Some are fat with a rounded bottom |
| Length | 0.18-0.33 m (mean 0.26) |
| Width | 0.18-0.40 m (mean 0.28) |
| Orientation | vertical, +/-15 degrees random; leaves at cluster ends lean outwards |
| Density | about 5-6 per metre, overlapping 30-40 % in 2-3 layers (dark behind, light in front); a 2.2 m panel shows about 12 leaves |
| Outline | every leaf has a pale cream outline (about 0.012 m); some have a lighter midrib |

Colours (four greens):

| Tone | Hex |
|---|---|
| dark teal-green | #1f5e44 (shaded #0b3822) |
| mid green | #3d8f55 |
| light grass green | #6fb35a |
| pale yellow-green highlight | #9ccc6a |
| outline / vein | #eef3e8 |

Raw samples under cool or evening light, for reference: P1 #2a6a41 #4c8061 #0b3822; P3 #336850 #4b8259 #629563 #82aa87.

Placement (right side):

| Panel | Leaves |
|---|---|
| door 1 to arch 1 (S 1.87-2.10) | none |
| above arch 1 (S 2.10-3.30) | none, bare white (both photos show the cluster stopping at the arch edge) |
| arch 1 to door 2 (S 3.30-5.45), the big panel | full cluster, about 12 leaves over S 3.40-5.40 |
| door 2 to bellows | small cluster of 5-6 leaves at S 6.95-7.60 |
| rear section: bellows to door 3 (z -4.60..-2.15) | full cluster, about 10 leaves |
| rear section: arch 3 / between doors 3 and 4 (z -0.80..+0.80) | small cluster of 4-5 leaves |
| doors, behind door 4 | none |

Decals:
- Small multicolour vertical logo, about 0.17 x 0.30 m, at Y 0.60-0.90, centred under the big cluster (S 4.4) and again on the rear-section panel. It looks like the Sofia Urban Mobility Centre mark (low confidence on the identity).
- A small black fleet number (about 0.12 m) on the upper window of the front section's last pane, on the right side. Presumably the same on the rear face (inferred).
- The model's leaf texture placement, 12 evenly spaced clusters over the whole length including doors and arches, is wrong.

---

## 6. ROOF

| Item | Value | Conf. |
|---|---|---|
| Front pod | S 1.7-8.4 (z -6.1..+0.6), width 2.20, base Y 2.80, top **3.32**. Gloss white #eeefee, smooth with no visible hatches or ribs. Gently crowned. Convex shoulders R about 0.30. Nose tapers down to the black header over about 0.5 m. Rear end is a vertical rounded cap about 0.7 m before the bellows | medium (length/height), low (ends) |
| Rear pod | z -4.4..-0.8, width 2.1, top 3.2. The rear-section silhouette in photo 3 stands taller than a bare roof, so a lower pod or equipment fairing exists; exact length unknown | low |
| Cylinders | 8 x 214 l under the fairing (count not confirmed for Sofia) | low |
| Roof-edge fairing | white rail 0.08-0.15 high along the body above the windows, rounding into the roof | medium |
| AC / hatches | no separate AC unit visible on the front section; a flat vented hatch near the rear tail is inferred. No hatches are visible in the photos, so the black seam lines in the model should go | low |

---

## 7. BELLOWS / turntable

- Colour: **light aluminium grey, satin** (#a5a8a8, grooves #6e7173). Photo 1 shows #949fa2; photo 3 shows #6c6b67 in shade. The model's charcoal #26282a is wrong.
- Form: smooth cover with only 2-3 broad vertical folds visible from the side (pitch about 0.3-0.35 m), not 14 narrow folds.
- Side protection plates: vertical white-grey plates on each side of the joint.
- Height from Y 0.40 to the roof edge at 2.78. Width equals the body minus 0.04 m each side. Visible length about 0.9 m.
- Confidence low-medium.

---

## 8. REAR (inferred; not visible in photos 1-3)

- No rear photo exists, and web searches returned no description. Everything here except the tail-side louvres is typology (MAN rear-engine low-floor).
- Confirmed in photo 3: a white slotted panel on the tail side (z +2.15..+3.0, Y 0.45-1.25) and a black louvre band at Y 1.35-1.75 above it. That is the engine-air intake on both sides.
- Rear face (plane z 3.405): plan corner radius about 0.40, top edge about 0.15 m forward of the bottom.
- Rear window: probably a small dark panel (1.4 x 0.45 m at Y 1.95-2.40) or none. The model's full-width Y 1.18-2.5 glass is likely wrong.
- Engine hatch: white, with a black louvre field about 1.3 x 0.5 m centred at Y 1.0.
- Tail lamps: tall narrow vertical LED clusters at both corners, about 0.12 x 0.55, top at Y 1.5.
- Rear route display: top corner, about 0.45 x 0.18 at Y 2.3-2.5.
- Plate: on the hatch at Y about 0.62. Bumper white, lower edge about 0.45 with a black step.
- All low confidence. Ask the user for a rear 3/4 photo if the rear matters.

---

## 9. MATERIALS

| Surface | Value |
|---|---|
| Body paint | #f1f1ec near-white (RAL 9016-like), glossy clearcoat, roughness 0.25-0.32. Photos: #cdd1d4 (P3 shade, up to #ebeced), #bebab7 / #cecac6 (P2 warm), #abc0ce..#c1d6e0 (P1 blue skylight). The game's #f1f2ee is right |
| Side glass and black zones | #0c0e12, tinted, mirror-like reflections, only faint interior; opacity about 0.85 |
| Gloss black plastic | #0d0f12 (base band, header, grille, door frames) |
| Satin black plastic | #15171a (mirror housings, wipers, lamp bezels) |
| Chrome | #d5d9dc, metalness 1, roughness 0.12 (strip, emblem); satin chrome #b9bcbe for the letters |
| LED | amber #ff9a1a emitter, with bloom |
| Wheels | rim silver #b5bac0, tyre #0a0b0b |
| Misc | yellow rail #d8b02a; side marker #d9501e; bellows #a5a8a8 |

---

## 10. PRIORITISED DIFF: current model vs reality (biggest visual gain first)

Files after the split: `BusSpec.js`, `BusModel.js` (exterior), `BusGeom.js` (helpers), `BusTextures.js`, `BusInterior.js`, `BusLayout.js`.

1. **Front proportions.**
   - Current: windscreen Y 0.97-2.55 (1.58 m), black band 2.55-2.86 (0.31 m), black strip 0.8-0.97, LED 1.9 x 0.23 at Y 2.7.
   - Reality: glass 1.22-2.32 (1.10 m), base band 1.00-1.22, black LED header 2.30-2.86 (0.56 m), matrix 1.72 x 0.32 at Y 2.36-2.68.
   - Fix in `buildFront` (the `outlineStrip` calls) and `buildSigns`.
2. **Lower face.**
   - Current: one 1.05 x 0.30 textured plane for the grille, round emissive headlamp discs on black trapezoids at x +/-0.5-0.9, fog discs.
   - Reality: white face, black trapezoid grille 1.55 x 0.29 (polygon in 3.3), chrome MAN 0.51 x 0.10, chrome gull-wing strip at Y 1.0 with lion emblem, rectangular lamp units 0.27 x 0.14 at x +/-0.95..1.22 on the white corners, amber/ribbed indicator-fog units below.
   - Remove the black headlamp housings and fog discs.
3. **Belt height.**
   - `beltY` 1.02 -> **1.30**; window top 2.55 -> 2.68; skirt 0.27 -> 0.33.
   - Redo `windowBand` panes: right side pillars at S 3.04 and 4.59, with hoppers on W2 only; left side continuous.
   - Remove the white band above the windows; use a black strip 2.68-2.76.
4. **Livery.**
   - `makeLivery` draws blades growing UP from the texture bottom, 12 even clusters over 18 m, narrow.
   - Replace with leaves hanging from the belt: dark-to-light layering, cream outlines, per-panel clusters (section 5) and a logo. No leaves over doors or above arch 1.
   - Keep the texture-to-panel mapping aligned (texture v=top is the sill).
5. **Doors.**
   - Door 1 -> z -7.185..-5.935.
   - Doors 3/4 -> rear frame -2.05..-0.80 and +0.80..+2.05. Door 4 is behind the axle.
   - Update `BusSpec.doors`, and anything keyed to door z in `BusInterior.js`/`BusLayout.js` (poles, validators, standing areas).
6. **Mirrors.**
   - Right: one ram's horn (path in 3.10, head 0.26 x 0.58 at (1.53, 2.10, S -0.40)).
   - Left: tall compact box 0.25 x 0.68 on the A-pillar.
   - Current: two thin-tube arms with 0.32 x 0.5 ellipsoid heads, mirrored.
7. **Decals.**
   - CNG diamond to x +0.45 / Y 1.08 / 0.125 m (it is on the wrong side now).
   - Pictograms 0.14 m at x 1.23 / 1.09 / 0.94, Y 0.84.
   - Fleet number 0.135 m digits at x +0.75..+0.38, baseline Y 0.78.
   - Plate 0.33-0.48 is correct.
8. **Bellows:** light aluminium grey, 2-3 broad folds instead of 14 narrow dark ones.
9. **Windscreen glass:** make it darker and more reflective (opacity about 0.6, #0b0f14). The cab shows far too clearly now.
10. **Arches:** R 0.60 instead of 0.535 (`BusGeom.skirtShape`); remove the black rubber lip along the skirt.
11. **Roof pods:**
    - Front pod S 1.7-8.4, 2.2 wide, tapering nose.
    - Smooth top: drop the black seam lines.
    - Rear pod about 3.6 m, top 3.2.
12. **Wipers:** pivots x +1.02 / -0.72, Y 1.22; the passenger blade parked horizontal, the driver arm angled up about 18 degrees.
13. **Side LED:** Y 2.48-2.68 (now 2.38), S 2.05-3.05.
14. **Plan outline:** flat centre |x| < 0.78 plus R 0.5 corners on the lower body; raked panoramic screen.
15. **Rear end:** reduce the glass, add a tall engine hatch, vertical tail lamps and the confirmed side louvres.
16. **Door leaves:** structurally fine; add a silver threshold strip and a 0.11 m front pillar.

## 11. Open questions
- Pod end shapes and the rear-pod length (grazing angle only).
- Rear end (no photo).
- One-piece vs two-piece windscreen (no mullion seen, so one-piece is assumed).
- Ram's-horn head position to +/-0.15 m.
- Delivery batch of fleet 3145/3153/2319 (2014/15 vs 2019).
- Identity of the Sofia logo (low value).
