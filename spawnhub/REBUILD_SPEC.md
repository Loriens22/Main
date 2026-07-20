# REBUILD SPEC — Poor Complex & Modern Monolith (v2)

The first versions of the poor residential building and the modern complex did not
match the reference screenshots closely enough. They are being REBUILT from scratch
by 10 agents working in parallel, 5 per building. The old files
`builds/10_poor_tower.js` and `builds/40_modern.js` are DELETED. Each agent owns one
new file. Read `AGENT_GUIDE.md` first for the API, block names and test loop —
this file only adds the two blueprints and the division of labor.

**Reference images (READ the ones for your building with the Read tool — follow them
closely, they are ground truth):**
Poor complex: `/root/.claude/uploads/87f110fe-3fd7-57cc-9444-fced2313dd11/075e21bd-2813.jpg`
(street close-up: awning, red drip, purple glass, white pods, prismarine elevator strip,
library through window), `.../254a824e-2828.jpg` (from pond: balconies, green columns,
mixed sections), `.../0e7829ac-2843.jpg` (night from pond: LEFT side shows the whole
complex — red-topped section, teal window-strip section, white-banded deepslate section).
Modern monolith: `.../8b736400-2831.jpg` (full carved facade), `.../5dd9835a-2834.jpg`
(side wall + moon + AC boxes), `.../06b662de-2837.jpg` (street level: walkway, hedge,
chest with sign, blue glass), `.../0e7829ac-2843.jpg` (distant on hill, gold accents, vines).

Both buildings keep their plots. All agents: bounds = the plot; iterate the test loop
until OK / no warnings / ~0 out-of-region; do not modify ANY other file; do not commit.
The shell file (P1/M1) may not exist yet while you develop — code strictly to the
coordinates in this spec, never probe-and-adapt. Exact coordinates below are the
contract between agents. Minor artistic deviation is fine WITHIN your own zones,
never at shared boundaries (floor plates, walls, shafts, openings).

---

## POOR COMPLEX — plot [52,168,100,232], front faces EAST (+X, toward plaza/pond)

Footprint x64..88 (front plane x=88, rear x=64), z178..214. Ground floor y=33.
Floor plates (1 thick, SPRUCE_PLANKS with OAK patches) at y=37, 42, 47, 52, 57
(only where the section is tall enough). Rooms are the space between plates.

### Section A — "red-top tower", z178..189, walls y33..59, red cap y60..62, rim y63
- Wall material: patchwork of DEEPSLATE_BRICKS (60%), COBBLED_DEEPSLATE, DEEPSLATE_TILES,
  ANDESITE, STONE_BRICKS + MOSSY/CRACKED variants near ground. Use a seeded hash mix,
  plus 5-6 deliberate rectangular "repair patches" of a contrasting material.
- Top band y60..62: CONCRETE_RED / TERRACOTTA_RED mix (like the reference's maroon cap),
  then a white rim at y63: CONCRETE_WHITE slabs (B.slab('CONCRETE_WHITE',true) lipped
  1 block outward on the front face, i.e. also at x=89 — allowed 1-block overhang).
- Windows (front face x=88): 2x2 purple (PANE_PURPLE) at z181-182 y44-45 and y54-55;
  2x2 GLASS_PANE at z185-186, y39-40, y49-50; small 1x2 slits on north face z=178.
- Rear face x=64: mostly blank patchwork (the lava fall groove lives here, P3's job:
  leave column x=64, z183, y36..58 clear of windows).

### Section B — "elevator spine", z190..197, walls y33..57, flat roof slab y58
- Wall material: POLISHED_ANDESITE with STONE_BRICKS quoins at section edges.
- THE SIGNATURE: front face x=88, z192..195: full-height vertical strip —
  frame columns of PRISMARINE_BRICKS at z191 and z196 (y33..57, protruding to x=89),
  and between them at each level module (y34-36, 39-41, 44-46, 49-51, 54-56) a
  2-high x 4-wide teal window: GLASS_CYAN panes (PANE_CYAN) with a DARK_PRISMARINE
  sill line under each. Between modules (plate lines y37,42,47,52) run a
  PRISMARINE_BRICKS course across the strip.
- Interior (P1 builds): water bubble elevator at x82..83, z193..194: GLASS walls
  around a 2x2 WATER column from y33 up to y56, open at each landing on the west
  side; spiral/switchback SPRUCE stair filling x66..71, z191..196 connecting
  y33→57 with landings at each plate; SOUL_LANTERN at shaft bottom.
- Front ground entrance: SPRUCE_DOOR (dir 'E') at x=88, z=195, y33 (path from plaza
  arrives at z≈195) + step. Landing doors: SPRUCE_DOOR at each level on the strip's
  north edge (x=88, z=192? NO — doors go on interior landings, not the glass strip).
  Skip exterior landing doors; the reference's small doors are represented by the
  ground door + interior landings.

### Section C — "white-banded arch block", z198..214, walls y33..53, parapet y54
- Wall material: DEEPSLATE_BRICKS body. WHITE horizontal bands: 1-high courses of
  CONCRETE_WHITE at exactly y37, y42, y47, y52 wrapping front+south faces
  (this is the reference's striped look).
- Windows front face x=88: at each level (y34-36, 39-41, 44-46, 49-51) place 3 windows,
  each 2 wide x 2 high with a CONCRETE_WHITE 1-block frame ring visible (frame the
  opening sides with white), glass = GLASS_PANE, at z200-201, z205-206, z210-211
  (window rows start y34, 39, 44, 49).
- Ground floor colonnade (front face): three arched openings 2 wide x 3 high at
  z200-201, z205-206, z210-211, y33..35, arch top corners made with
  B.stair('DEEPSLATE_BRICKS','S'/'N', true) flipped stairs; behind them an open
  gallery corridor 3 deep (x85..87, y33..36, air) running z199..212 with
  COBBLESTONE floor; interior wall with door at x=84 into the ground hall.
- Roof y54: red slab edging (B.slab('CONCRETE_RED')) around the parapet perimeter,
  rooftop clutter zone (P3). Striped pole: at corner x=87, z=213: WOOL_RED/WOOL_WHITE
  alternating column y54..59 topped with a LANTERN.
- South face z=214: two 2x2 windows per level (white-framed), vines.

### Shared / misc
- Section partition walls at z=189/190 and z=197/198 boundaries with door gaps
  (2-high air openings) at x~75 on each level so floors connect.
- Basement y28..32 under B+C (x66..86, z191..212): COBBLED_DEEPSLATE shell,
  reached by a cobble stair from B's ground floor going down.
- Awning (P2): over the CENTER colonnade arch (z204..208): BRICKS platform at y37..38
  extending x89..92, edged with brick stairs, on COBBLESTONE B.wall posts at x=92,
  z=204 and z=208; hanging SIGN under front edge; under it stacks of CHEST/BARREL/
  BOOKSHELF against the wall; banners = 1x3 vertical WOOL strips (RED, PURPLE) on
  the facade beside arches.
- Red drip (P2): from under A's white rim at x=89, z=186: hang a strand y58 down to
  y37: alternating WOOL_RED blocks and B.fence('CONCRETE_RED') (chain-of-red look),
  with 2 small side branches 2-3 long. (This is the reference's red vine/drip.)
- White pods (P2): two cantilevered pods on A front face: 4 wide (z180..183) x
  3 deep (x89..91) x 3 high, CONCRETE_WHITE shell, one at y45..47, one at y53..55,
  each with a 2x1 GLASS_PANE window front (x=91) and open back into the tower
  (carve 2x2 door through x=88), TRAPDOOR_B awning over window, lantern under.
  These jut OUT of the facade (1-block-deep supports: 2 flipped white stairs under).
- Lava fall (P3): rear face: carve groove at x=63, z=183 (1 wide recess into x=64
  wall), LAVA column y36..58 fed from a source notch at top, falling into a
  COBBLED_DEEPSLATE channel + 3x3 pool at grade (y32..33) lined with stone, with
  DEEPSLATE_BRICKS spill guards. Nothing flammable adjacent.
- Floating platforms (P3): two 5x5 QUARTZ_BLOCK platforms west of the tower
  (centered x58, z182 at y56; x58, z194 at y50), CHAIN columns from each corner up
  8 blocks to nothing visible? NO — chains must anchor: run chains DOWN from the
  platforms is floating-by-design; per original brief chains go up — leave chains
  rising 6 blocks ending with a LANTERN_HANGING; connect each platform to A/B roof
  or windows with a 2-wide DARK_OAK_PLANKS bridge with fence rails.
- Interior program (P4): ground hall in C = communal lobby (crafting, furnaces row,
  anvil, tables) + library corner at z209..213 (bookshelf wall 2 high, lectern,
  red carpet, visible through south arch window); A floors y38/43/48/53 = one cozy
  apartment each; C floors y38/43/48 = two apartments each (partition at z206);
  every apartment: bed, chest, furnace or smoker, carpet rug, 1-2 wall deco
  (painting/frame), potted plant, LANTERN or wall torch. Elevator landings lit.
  Basement: barrels, chests, cobwebs, mushrooms, soul lanterns.
- Grounds (P5): yard mostly west/south: fenced animal pen (x66..74, z218..226) with
  cow+sheep statues, hay, trough (composter+water), campfire circle, kitchen garden
  rows, lamp posts along the front (x90..92 line), torch posts, dirt-path patches
  from front doors to plot edges east (x100) at z195 and z205, clutter (cart=chest
  on fence?, log pile = horizontal logs stack), 2-3 trees near west edge.

### Poor-complex files/orders
| agent | file | order | zone |
|---|---|---|---|
| P1 shell | builds/10_poor_shell.js | 10 | all walls/plates/roofs/bands/windows+glazing/colonnade/stairs/elevator/basement shell |
| P2 facade deco | builds/11_poor_facade.js | 11 | pods, drip, pole(already P1? no: P2), awning, banners, vines, lanterns, frames, street clutter, shutters |
| P3 features | builds/12_poor_features.js | 12 | lava fall, floating platforms+bridges, rooftop clutter+chimney(campfire), exterior ladder |
| P4 interiors | builds/13_poor_interior.js | 13 | all rooms, furniture, lighting, basement fill |
| P5 grounds | builds/14_poor_grounds.js | 14 | yard, pen, gardens, paths, lamp posts, statues |

(P1 also builds the striped pole base structure? — NO: P2 owns the striped pole.)

---

## MODERN MONOLITH — plot [200,44,268,120], front faces WEST (-X, toward plaza)

A single tall white slab: footprint x216..227 (12 deep) x z52..80 (29 wide),
height y33..86. Symmetric facade about z=66 on the west plane x=216.
Floor plates (SMOOTH_QUARTZ, 1 thick) at y=41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81
(ground/lobby is y33..40 double height). Interior hollow x217..226, z53..79.
Plinth: y33..34 course of SMOOTH_QUARTZ wrapping all faces, QUARTZ_BRICKS above.

### M1 — shell & carved facade (file builds/40_modern_shell.js, order 40)
- Exterior walls QUARTZ_BLOCK base with variation: QUARTZ_BRICKS bands at plate
  lines, SMOOTH_QUARTZ in recesses, CHISELED_QUARTZ corner quoins every 4th course.
- WEST FACADE (the star — study 8b736400-2831.jpg hard): vertical modules between
  plate lines, module rows starting y35, 43, 51, 59, 67, 75 (each 8 high区 minus bands):
  - Central column z63..69: per module, nested relief: outer ring flush QUARTZ_BLOCK;
    1-block-recessed ring QUARTZ_BRICKS (wall at x=217); center 3-wide: 2-recessed
    SMOOTH_QUARTZ (x=218) with a 2-wide x 5-high GLASS_LIGHTBLUE slit window
    (z65..66); single HONEYCOMB_BLOCK accents at the module's outer-ring corners
    (z63 & z69, top course) — sparse gold squares like the reference.
  - Flank panels z54..61 and z71..78: per module, carved nested rectangle: flush
    border; recess-1 field (x=217) of QUARTZ_BLOCK; recess-2 center (x=218)
    QUARTZ_BRICKS with 3x4 window cluster: GLASS_LIGHTBLUE panes with 1-block
    QUARTZ_PILLAR mullion center; one DIORITE course inside each panel for subtle
    tone shift; occasional single honeycomb accent (max 1 per panel, ~half the panels).
  - Recesses mean: actually shift wall blocks inward (carve to x=217/x=218) so the
    relief is real geometry with shadows, not texture.
- ENTRANCE ZONE: leave west face z60..72, y33..40 as a rough opening 3 deep
  (air to x=219) with QUARTZ_BRICKS surround — M2 fills it.
- Top y83..86: stepped crenellation: parapet rises in 3 steps toward corners and
  center (like reference roofline), CHISELED_QUARTZ caps, HONEYCOMB accents at the
  two top corners, iron-bar safety rail inside.
- SIDE FACES (z=52 and z=80) and EAST face x=227: QUARTZ_PILLAR vertical striping
  every 3rd column, small 1x2 slit windows sparsely (2 per face per 2 modules),
  4-5 white "AC box" greebles per side: 1x1x1 CONCRETE_WHITE protruding with an
  IRON_BARS face, at semi-random module positions; a few honeycomb single accents.
- EAST: 2-step QUARTZ retaining wall x228..229 y33..36 against the hill terraces.
- VINES: (M5 owns vines.)
- Floor plates as listed; leave a 4x4 shaft hole at x223..226, z63..66 in every
  plate (elevator+stair core zone, M3 fills) and a 2x2 hole at x224..225, z70..71
  for the service stair? NO — single core only: hole x222..226, z62..68 in each
  plate (M3 builds stairs+elevator inside and patches unused hole area).

### M2 — entrance & lobby (file builds/41_modern_entrance.js, order 41)
- Portal: within z60..72, y33..40: glass curtain wall of GLASS_LIGHTBLUE set at
  x=218 full width/height of the opening, with double IRON_DOOR at z65..66, y33
  (door dir 'W'), QUARTZ_BRICKS reveal walls x216..218 at z60 and z72,
  GOLD_BLOCK + HONEYCOMB header band across at y40 (x216 plane), SEA_LANTERN
  downlights recessed in the y41 underside at x217, z62/66/70.
- Steps: 3 descending rows of B.stair('SMOOTH_QUARTZ','W') at x215, 214, 213
  spanning z61..71 (y33 top step; grade is y32 so one row may be slab trim), with
  QUARTZ slab wings.
- Delivery chest + wall sign at x215, z59 (like the reference's chest with sign),
  plus a second SIGN_WALL_W at z73.
- Lobby (x219..226, z54..78, y33..40): DARK_PRISMARINE + SMOOTH_QUARTZ inlay floor
  pattern, reception desk of SMOOTH_QUARTZ slabs + LECTERN at z66..70 facing door,
  seating cluster (white stairs + CARPET_CYAN) both wings, potted azaleas, 2 wall
  MAPs + PAINTING on east wall, chandelier: 3x3 glowstone/sea-lantern cluster on
  CHAINs at y39 center, WOOL_CYAN banner pair flanking the door interior.

### M3 — interiors floors 2-12 (file builds/42_modern_interiors.js, order 42)
- Core in the plate holes x222..226, z62..68, all levels: glass-walled 2x2 WATER
  elevator column at x225..226, z63..64 (GLASS shell, water y33..80, SOUL_LANTERN
  bottom, open 1-wide at each floor on the west side); switchback QUARTZ stairs
  filling x222..224, z65..68 with landings; patch remaining hole area with
  SMOOTH_QUARTZ floor; CHISELED_QUARTZ core walls with door gaps each level.
- Floors y41..53 (3 levels): offices — desk rows (smooth-stone slabs + stair chairs),
  bookshelf wall, glass partition meeting room, brewing lab on one level (stand,
  cauldron, barrels), ender chest, item frames.
- Floors y57..69 (3 levels): apartments, two per level (partition wall at z66):
  WHITE/LIGHTBLUE/CYAN beds, kitchen (smoker+barrel+cauldron+counter), enchanting
  corner with bookshelves on one level, carpet runners in the core hallway,
  caged wall lights (LANTERN beside IRON_BARS), potted plants, paintings.
- Floors y73..81: penthouse (y73..76: one luxury apartment: big bed area, jukebox,
  gold accents) and SKY LOUNGE (y77..85 double height at top: sofa clusters
  (stairs+carpet), cake bar with barrels, big interior sea-lantern-lit ceiling
  ring, this level's west windows are the top facade modules — do not alter walls).
- Every room lit: SEA_LANTERN ceiling insets + lantern accents. Hallway floor
  numbering: 1 FRAME_MAP_E per level beside the elevator.

### M4 — roof, annex, bridge (file builds/43_modern_roof.js, order 43)
- Roof deck on y87 (above crenellation floor y86? the top plate is y86: deck ON y87
  blocks NO — roof slab at y86, deck items on y87): mechanical penthouse
  (CONCRETE_LIGHTGRAY 6x5x4 with iron TRAPDOOR vents + OBSERVER/PISTON greebles +
  door), campfire chimney (BLACKSTONE stack with CAMPFIRE recessed in top),
  spire: B.pillar('IRON_BLOCK') x4 high + END_ROD at center-west edge,
  observation corner: SEA_LANTERN floor ring, SCAFFOLDING+END_ROD telescope,
  flag pole (fence stack + 3 WOOL_CYAN), 2 benches, potted plants.
- Annex: x218..230, z86..96, y33..47 (3 floors, plates y37,41,45? use y38,43):
  CONCRETE_CYAN walls, GOLD_BLOCK trim rings at plate lines, big GLASS windows
  (2x3), flat roof y47 with rooftop garden (MOSS_BLOCK beds, azaleas, flowers,
  slab path, fence rail), interior: café (ground: counters, smoker, tables,
  jukebox), studio (mid: desks, shelves), atelier (top: brewing, enchanting).
  Ladder or stair between floors; every room lit.
- Glass bridge: y41..43, from tower south face z80 (opening 2 wide at x221..222 —
  carve through M1's wall at z80, y41..43) across to annex north face z86:
  GLASS walls+ceiling, SMOOTH_QUARTZ floor with GOLD edge strips, lanterns inside.

### M5 — landscaping (file builds/44_modern_grounds.js, order 44)
- Walkway x210..212 (3 wide), z48..100: SMOOTH_STONE/POLISHED_ANDESITE/STONE_BRICKS
  patchwork replacing grass at y32; hedge rows (OAK_LEAVES with occasional
  AZALEA_LEAVES / FLOWERING) at x209 and x213 full length with gaps at the entrance
  (z61..71) and at path junctions; 5 lamp posts down the line + 2 SEA_LANTERN
  ground insets flanking the steps.
- Entrance path: connect walkway west to plot edge x200 at z66 (3 wide, andesite mix)
  — it meets the existing plaza path outside the plot.
- Gardens: flower beds along the tower's south face (z81..84), a bench + campfire
  rest spot SW corner, 3-4 trees (small oak/birch) in plot corners ≥3 from edges,
  TALL_GRASS/flower scatter.
- Vines: VINE_* on the tower's NW and SW corner columns (attach to quartz, climbing
  y35..60, sparse) and on the retaining wall; azalea bushes at the tower base.
- A few stone-brick stair steps + vine accents where the walkway meets the grade at
  z48/z100 ends.

### Modern files/orders recap
| M1 | builds/40_modern_shell.js | 40 |
| M2 | builds/41_modern_entrance.js | 41 |
| M3 | builds/42_modern_interiors.js | 42 |
| M4 | builds/43_modern_roof.js | 43 |
| M5 | builds/44_modern_grounds.js | 44 |

Test loop per agent (own outdir!): e.g.
`node spawnhub/build.mjs dist-p1 && node spawnhub/test/smoke.mjs dist-p1`
