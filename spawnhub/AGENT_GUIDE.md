# SpawnHub Builder Guide

You are building one part of a large Minecraft-style survival-server spawn hub rendered
as a voxel scene in WebGL. You write **one JS file** in `spawnhub/builds/` that places
blocks through a shared API. Do NOT touch any other file.

## Scene & style
Nighttime, starry sky, square moon. Warm lantern/torch light everywhere. Classic vanilla
Minecraft aesthetic. Reference vibe: cozy multi-biome server spawn — deepslate "poor"
tower with a red/lava drip down its side, white quartz modern high-rise on a terraced
hill with vines, teal oxidized-copper shop with honey-yellow top, rustic bee-statue
tower of stripped logs, wheat farms, pond with bamboo + sugar cane, cobble stepping
stone paths, torches on the ground everywhere, terraced dirt/grass hills.

## Coordinates & ground rules
- World: X 0..287 (east+), Y 0..95 (up), Z 0..287 (south+). Y is height.
- **Terrain surface in every build plot is flat grass with the top solid block at y=32.**
  Your building's floor sits at **y=33**. Basements may dig below 32 (stay inside your plot).
- Water level of ponds is y=30.
- Do not place blocks outside your assigned plot (the smoke test counts violations).
  Terrain and Details agents have the whole map.
- North = -Z, South = +Z, East = +X, West = -X. Directions for stairs = the side the
  HIGH half is on (ascend toward that side). A staircase going UP toward north uses
  dir 'N' and each next step is 1 closer to -Z and 1 higher.

## Site plan (x1,z1)-(x2,z2) plots
- PLAZA        (116,120)-(172,172)  central plaza, spawn point ~ (144,146)
- SHOPS        (100, 60)-(172,116)  market street / stalls
- MODERN       (200, 44)-(268,120)  modern quartz complex + annex
- POOR_TOWER   ( 52,168)-(100,232)  poor residential tower + surroundings
- BEE          (108,176)-(152,224)  bee landmark building
- FOOTBALL     (184,172)-(248,240)  kids football pitch + playground
- POND         (154,184)-(182,222)  pond (terrain builds it; others keep out)
- Everything else: terrain (hills ring the map edges; keep the center walkable).

Paths between plots are built by the Details agent — leave your plot edges clean and
put your main entrance facing the plaza side.

## Your file format
`spawnhub/builds/NN_name.js` (NN = your order number):

```js
(function(){
  SpawnBuilds.register('myname', ORDER, [x1, z1, x2, z2], function (W, B) {
    // place blocks here
  });
})();
```

ORDER: terrain=0, buildings=10..50, details=60. Registration order between buildings
doesn't matter; the runner sorts by ORDER.

## API — the world object `W`
- `W.set(x,y,z,id)` / `W.get(x,y,z)` — id 0 = air.
- `W.fill(x1,y1,z1,x2,y2,z2,id)` — inclusive box fill (any corner order).
- `W.clear(...)` — fill with air.
- `W.walls(x1,y1,z1,x2,y2,z2,id)` — 4 walls, no floor/ceiling.
- `W.shell(...)` — walls + floor + ceiling.
- `W.column(x,z,y1,y2,id)`, `W.disc(cx,y,cz,r,id)`, `W.sphere(cx,cy,cz,r,id)`.
- `W.topY(x,z)` — highest non-air y in a column (after previous builds).
- `W.stair(x,y,z,'OAK_PLANKS','N',flip?)` — flip=true for upside-down.
- `W.slab(x,y,z,'STONE_BRICKS',top?)` — top=true for upper slab.
- `W.fencePost(x,y,z,'OAK_PLANKS')` — auto-connects to neighbors.
- `W.door(x,y,z,'OAK_DOOR','S')` — places 2-high door (names: OAK_DOOR, DARK_DOOR, IRON_DOOR, SPRUCE_DOOR).
- `W.torch(x,y,z)`, `W.lampPost(x,y,z)` (2 fence + lantern),
- `W.table(x,y,z)` (fence+pressure plate), `W.chair(x,y,z,mat,dir)`.
- `W.bed(x,y,z,'RED','S')` — head at x,z, foot 1 block toward dir.
  Colors: RED BLUE CYAN LIME YELLOW PURPLE WHITE ORANGE PINK GREEN BLACK LIGHTBLUE.
- `W.tree(x, groundY+1, z, 'oak'|'birch'|'spruce'|'dark_oak'|'azalea')`.
- `W.GROUND` = 32.

## Blocks — `B.NAME` (a typo logs a warning and falls back to stone — smoke test fails on warnings!)
Stone: STONE SMOOTH_STONE COBBLESTONE MOSSY_COBBLESTONE STONE_BRICKS MOSSY_STONE_BRICKS
CRACKED_STONE_BRICKS CHISELED_STONE_BRICKS ANDESITE POLISHED_ANDESITE DIORITE GRANITE TUFF
GRAVEL DEEPSLATE COBBLED_DEEPSLATE DEEPSLATE_BRICKS DEEPSLATE_TILES POLISHED_DEEPSLATE
BLACKSTONE OBSIDIAN CRYING_OBSIDIAN BRICKS MUD_BRICKS SANDSTONE SMOOTH_SANDSTONE SAND CLAY
Ground: DIRT COARSE_DIRT GRASS DIRT_PATH PODZOL MOSS_BLOCK GRAVEL SNOW_BLOCK
Wood: OAK_PLANKS SPRUCE_PLANKS BIRCH_PLANKS DARK_OAK_PLANKS ACACIA_PLANKS CRIMSON_PLANKS
WARPED_PLANKS OAK_LOG BIRCH_LOG SPRUCE_LOG DARK_OAK_LOG STRIPPED_OAK_LOG STRIPPED_SPRUCE_LOG
Leaves: OAK_LEAVES BIRCH_LEAVES SPRUCE_LEAVES DARK_OAK_LEAVES AZALEA_LEAVES FLOWERING_AZALEA_LEAVES
Modern: QUARTZ_BLOCK SMOOTH_QUARTZ QUARTZ_PILLAR QUARTZ_BRICKS CHISELED_QUARTZ IRON_BLOCK
GOLD_BLOCK EMERALD_BLOCK DIAMOND_BLOCK COPPER_BLOCK OXIDIZED_COPPER OXIDIZED_CUT_COPPER
PRISMARINE_BRICKS DARK_PRISMARINE
CONCRETE_<WHITE|LIGHTGRAY|GRAY|BLACK|CYAN|BLUE|LIGHTBLUE|GREEN|LIME|YELLOW|ORANGE|RED|PINK|PURPLE|BROWN>
TERRACOTTA, TERRACOTTA_<WHITE|YELLOW|CYAN|RED|ORANGE|LIME|GRAY|LIGHTGRAY|BLACK|PURPLE|PINK|BROWN|BLUE>
WOOL_<WHITE|LIGHTGRAY|GRAY|BLACK|RED|ORANGE|YELLOW|LIME|GREEN|CYAN|LIGHTBLUE|BLUE|PURPLE|MAGENTA|PINK|BROWN>
CARPET_<same colors as wool>
Light (emissive): GLOWSTONE SEA_LANTERN SHROOMLIGHT REDSTONE_LAMP JACK_O_LANTERN TORCH
SOUL_TORCH LANTERN SOUL_LANTERN LANTERN_HANGING SOUL_LANTERN_HANGING END_ROD CAMPFIRE FIRE
LAVA NETHER_PORTAL ENDER_CHEST ENCHANTING_TABLE CRYING_OBSIDIAN FURNACE BLAST_FURNACE SMOKER
  (CAMPFIRE and exposed LAVA emit smoke/ember particles automatically. TORCH_WALL_<N|S|E|W> for wall torches.)
Glass: GLASS TINTED_GLASS GLASS_<WHITE|BLUE|LIGHTBLUE|CYAN|PURPLE|MAGENTA|LIME|YELLOW|RED|ORANGE|BLACK>
Panes (thin, auto-connect): GLASS_PANE PANE_<same colors> IRON_BARS
Liquids: WATER LAVA  (a LAVA column against a wall = lava fall; put a stone channel/pool below)
Functional: CRAFTING_TABLE FURNACE BLAST_FURNACE SMOKER BARREL CHEST ENDER_CHEST BOOKSHELF
JUKEBOX NOTE_BLOCK CAULDRON COMPOSTER ANVIL LECTERN BREWING_STAND ENCHANTING_TABLE HAY_BALE
MELON PUMPKIN BEE_NEST HONEYCOMB_BLOCK HONEY_BLOCK OBSERVER PISTON SCAFFOLDING TARGET TNT
LODESTONE BULLETIN END_PORTAL_FRAME NETHERRACK CAKE BALL BELL COBWEB CHAIN
Deco shapes: SIGN, SIGN_WALL_<N|S|E|W>, PAINTING1_<N|S|E|W>, PAINTING2_<N|S|E|W>,
FRAME_<SWORD|PICK|POTION|BOOK|MAP|ARMOR>_<N|S|E|W> (item frames on walls; dir = which wall
face it hangs on, i.e. the wall is behind it in that direction), LADDER_<dir>, VINE_<dir>,
TRAPDOOR_B TRAPDOOR_T, PRESSURE_PLATE_OAK PRESSURE_PLATE_STONE, ARMOR_STAND, LILY_PAD,
RAIL_X RAIL_Z (flat rails running along X or Z), DRIPSTONE, FLOWER_POT,
POTTED_<TULIP_RED|TULIP_WHITE|TULIP_PINK|POPPY|DANDELION|FERN|CORNFLOWER|ALLIUM|OXEYE_DAISY|CACTUS|BAMBOO|AZALEA>
Plants: TALL_GRASS FERN POPPY DANDELION TULIP_RED TULIP_WHITE TULIP_PINK CORNFLOWER
OXEYE_DAISY ALLIUM LILY_OF_VALLEY ROSE_BUSH SWEET_BERRY_BUSH WHEAT WHEAT_YOUNG CARROTS
POTATOES BEETROOTS SUGAR_CANE BAMBOO MUSHROOM_RED MUSHROOM_BROWN DEAD_BUSH SEAGRASS
Beds: BED_<color>_HEAD / _FOOT (or use W.bed helper).
Dynamic: `B.stair('MAT','N'|'S'|'E'|'W',flip)`, `B.slab('MAT',top)`, `B.fence('MAT')`,
`B.wall('MAT')` (stone-wall shape), `B.pillar('MAT')` (thick column) — MAT is any cube
block name above, e.g. `W.set(x,y,z, B.stair('DEEPSLATE_BRICKS','W'))`.

## Interior lighting is IMPORTANT
The renderer computes real light propagation. A sealed room with no light source is
pitch black. Put LANTERN / TORCH / GLOWSTONE / SEA_LANTERN in every room, and remember
windows let the dim blue moonlight in. Warm sources read orange, soul sources read dim.

## Quality bar (this is the whole point)
- Think like a Minecraft builder: depth (walls that step in/out), material mixing
  (stone bricks + cobble + andesite, not one flat material), gradients, trim layers,
  overhangs with stairs/slabs, fences as beams, vines/plants to break up flat faces.
- Interiors: every floor furnished — beds, chests, crafting corners, carpets, paintings,
  item frames, potted plants, bookshelves, lanterns. Micro-details outside: flower beds,
  lamp posts, campfires, hay bales, barrels, signs.
- No floating blocks unless clearly intentional (chains/supports for floating platforms).
- Scale: buildings should look big and generous (the plots are large — use them).

## Test loop (run from repo root `/home/user/Main`)
```
node spawnhub/build.mjs && node spawnhub/test/smoke.mjs
```
Must print OK for your build, place a healthy number of blocks, no warnings, and ideally
0 out-of-region writes for your name (a few edge overlaps are tolerated; hundreds are not).
Iterate until clean. You cannot render images — rely on careful mental geometry.
Write generously detailed code (loops + small helper fns), typically 300-700 lines.
