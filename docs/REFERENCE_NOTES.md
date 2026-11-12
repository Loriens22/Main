# Reference study — measurements used for modelling

Working notes from the 19 supplied reference images (the directive lists 23; images 20–23 —
Edmunds' planet and the Lander — were not attached, so those assets follow the written description
plus what is visible of the Landers in image 8). Every dimension below was measured from the images
and is the number the Blender scripts use. Categories: **[ref]** read from an image, **[film]**
established movie detail, **[game]** decision made for this project.

## Ranger (images 3, 4, 5 exterior · 6, 7 interior)

Scale **[game]**: overall length **17.4 m** (the 1/72 kit in image 3 is ~9.5 in). The film's
full-size prop was shorter, but the interior set is larger than the exterior; 17.4 m is the smallest
size at which the cabin of images 6–7 physically fits inside the hull. Cross-checked against image
8, where the docked Ranger measures ≈17 m against the 64 m ring.

Axes: s = fraction of length from the rear face (0) to the nose tip (1); y = half-width; z = height
above the belly.

| Feature [ref img 3] | s | half-width (m) | z (m) |
|---|---|---|---|
| Rear face (white panel + hatch + 2 thrusters) | 0.00–0.03 | 2.75 (rounded shoulders) | 0.0–1.75 |
| Radiator ("Upper Panel BLACK", span-wise slats) | 0.07–0.18 | 2.2–2.4 | 1.85 (top) |
| Chine frame, rear arm starts (top of hull) | 0.10 | 2.4 | 1.9 |
| Canopy peak / window cluster | 0.21–0.60 | windows within ±2.4 | 2.0 → 1.25 |
| **Chine apex — widest point** | 0.43 | **4.55** | 0.28 |
| Canopy blends into flat fore-deck (D-shaped crease) | 0.63–0.76 | 2.0 | 1.18 → 0.9 |
| Fore-deck (flat, panel-lined) | 0.76–0.92 | 2.0 → 1.74 | 0.9 → 0.74 |
| Blade tips (stand 0.36 m above the deck, gap to hull) | 0.905 | 2.24 | 1.12 |
| Nose bracket (black, C-shaped, lightening holes) | 0.915–1.0 | 2.2 | 0.57–0.74 |

* Planform **[ref]**: elongated hexagon. Width/length = 0.523 → 9.1 m span. Outer edge is a straight
  line from the rear corner (s 0.02, y 2.9) to the apex, and another straight line from the apex to
  the nose (s 0.905, y 2.24).
* The black **V-shaped chine frame** on each side is one continuous member: a chunky bevelled rail
  (≈0.6–0.9 m wide in plan) that leaves the hull top at the radiator corners, *descends* to the apex
  at belly level, then becomes a thin blade (≈0.12 m) that *rises* forward to end above and outboard
  of the nose deck. Side-view polyline (s, z): (0.10, 1.95) → (0.43, 0.28) → (0.90, 1.12).
* Upper fuselage white; lower fuselage, wings, nose, window frames black; windows gloss black.
* Side profile top line (s, z): (0.03, 1.5) (0.055, 1.85) (0.32, 1.95) (0.63, 1.18) (0.72, 0.9)
  (1.0, 0.74). Belly at z = 0 with a central keel pod (−0.27 m, 2 m wide) under the rear half; nose
  underside rises from (0.80, 0) to (1.0, 0.57).
* Windows **[ref img 3, 5]**: ~20 irregular polygons, mirror-symmetric, two rows per side plus two
  small panes on the centreline at the front of the cluster; each in a black bolted frame. Largest
  panes are the forward pair (s ≈ 0.55–0.60).
* Side vent panels (black, 6–7 oval holes) just outboard of the outer window row, s 0.28–0.45.
* Rear face **[ref img 3 rear view]**: white centre panel 1.73 × 1.46 m with the round hatch (outer
  ring Ø1.35 m, door Ø1.1 m, yellow release-handle edges, 4 corner latches); two octagonal thruster
  nozzles 1.57 × 0.87 m, nested 3-step frames, dark interior with a horizontal vane; black surround.
* Rear lower sides: black stepped panel with three slanted louvre slots.
* Flanks between rail and canopy: quilted white thermal-blanket tiles in rows (image 5).
* Landing gear: **4 legs** — two short vertical rear legs (3.6 m apart, ~0.8 m, small square pads)
  and two long main legs attached near the apex, splayed outward/forward, twin struts + silver
  retraction cylinder, long skid feet (1.9 m). No nose gear.
* Interior **[ref img 6, 7]**: sunken central aisle between raised side decks; 4 maroon ribbed seats
  (two pilots forward, two aft, facing forward); dense padded dark ceiling with warm rectangular
  light boxes; side consoles with blue displays; beige equipment lockers aft; round rear hatch at the
  end of the aisle; ceiling ladder near the rear.

## Endurance (images 8, 9, 10 exterior · 11–16 interior)

* Ring outer Ø **64 m** [ref img 9]. 12 modules at 30°. Clock positions (forward view, image 9):
  12 Habitat · 1 Pod · 2 Engine · 3 Habitat (spine tunnel) · 4 Engine · 5 Pod · 6 Cryo-lab · 7 Pod ·
  8 Engine · 9 Command · 10 Engine · 11 Pod.
* Module boxes are **elongated radially** [ref img 8, 9]: ≈10.5 m radial × 6.6 m tangential × 5.6 m
  axial, outer face at r = 32 m. Engine modules are plain boxes with chamfered corners; the others
  carry large blue-grey panel arrays and 2×3 window clusters on their axial faces.
* Communicating tunnels join neighbouring modules at **mid radius (r ≈ 24 m)** through cylindrical
  knuckle nodes; four nodes carry outward-pointing ring airlocks.
* Spine [ref img 8, 9]: one long 3-segment tunnel from the hub to the 3-o'clock Habitat, and a short
  capped stub on the opposite side (not reaching the Command module).
* Hub ports **[game, resolving img 8 vs 9]**: two **axial** ports on the spin axis (fore/aft) for the
  Rangers, which dock by their rear hatch and point along the axis; two **radial** ports in the ring
  plane, perpendicular to the spine, for the Landers (dorsal docking ring). Ports are a common
  standard: any free compatible port may be used, axial ports while spinning (match roll rate),
  radial ports via the rotating-frame approach or after de-spin.
* Spin [film/physics]: 5.25 rpm → ω = 0.55 rad/s → 9.7 m/s² at r = 32 m. Decks stack radially inside
  each module (floor-to-floor ≈3.2 m): outer deck 1.0 g, tunnel deck ≈0.75 g.
* Interior palette [ref img 11–16]: pale grey-green structural walls, black studded rubber floor with
  inset white/blue hatch plates, cream ceiling light boxes with blue padded panels between them,
  white cargo bags behind nets, quilted padding, maroon folding seats with harnesses, beige/blue
  console racks with small cyan displays, white 10 cm tiles in the cryo/medical bay with two large
  white capsules (one maroon band, one blue band) over floor pits, circular hatches with blue padded
  collars in the hub.

## Farm (images 1, 2)

* Two-storey gabled main block (ridge front-to-back, gable facing the porch side), boarded upper
  windows, small diamond vent in the gable; one-storey wing to the left with its ridge parallel to
  the front, gable end with door + windows; long hip-roofed wrap-around porch on slender posts across
  the wing front and the main gable; weathered cream clapboard, grey shingles; satellite dish, weather
  vane, stove pipe.
* Yard: dust-covered crew-cab pickup at the porch, two blue poly water tanks, sand piles, propane
  tank, clothes line, utility poles; red articulated 4WD tractors with dual wheels, red combines,
  red grain cart, teal tank; dense knee-to-chest-high corn right up to the gravel yard; rolling
  hills left, blue mountain range right; pale yellow-green hazy sky (image 1) / blue-grey overcast
  (image 2).

## Planets (images 17, 18, 19)

* Miller: flat grey-blue shallow ocean to a hazy horizon, fine wind ripples, pale cream sky; wave is a
  smooth dark wall filling half the frame with streaky foam lines running up its face.
* Mann: grey-white crevassed glacier, ridged flow bands with dark dirt lines, overhanging layered ice
  cliffs, dense low-contrast haze.
