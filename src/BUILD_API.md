# Build API — read this before writing a single line

You are writing **one file**: `src/builds/<yourname>.js`.
It places voxels into a shared world using a global DSL. No imports, no
dependencies, no DOM, no `require`. Plain ES2018 that runs in `vm` and in a
browser.

## File skeleton (copy exactly)

```js
/* ==== <YOUR BUILDING NAME> ==== */
(function (root) {
  'use strict';
  const W = root.World, B = root.B;

  function build() {
    W.seed(20250724);           // pick your own constant; keeps output deterministic
    // ... everything you place goes here (call your own helper fns)
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.<yourname> = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

`<yourname>` must match the filename exactly (`poor.js` → `BUILDERS.poor`).

## World coordinates

* `X` runs **west → east**, `Z` runs **north → south**, `Y` is **up**.
* World volume: `X -96..95`, `Z -96..95`, `Y 0..111`. Writes outside are dropped
  and counted as errors.
* Terrain has already been generated when your builder runs. Your zone is a
  **perfectly flat pad**. The top solid ground block is at `y = GROUND`
  (given in your brief). Build **from `y = GROUND + 1` upward**.
* You may dig down to `GROUND - 8` for basements — that region is plain
  stone/dirt, overwrite it freely (use `clear()` then place walls).
* Stay strictly inside your zone rectangle. Slight overhangs (balconies,
  roof eaves) up to 2 blocks past the edge are fine; nothing more.

## The DSL (all of these are globals, and also on `W.`)

### placement
```js
set(x,y,z,id[,state])     // place one block (id 0 = air)
get(x,y,z) -> id
getState(x,y,z) -> 0..15
isAir(x,y,z) -> bool
isSolid(x,y,z) -> bool    // true only for opaque full blocks
setIfAir(x,y,z,id[,state])
```

### volumes  (all coordinate pairs are INCLUSIVE, order does not matter)
```js
fill(x0,y0,z0, x1,y1,z1, id[,state])   // solid box
fillAir(x0,y0,z0, x1,y1,z1, id)        // fill, but only where currently air
clear(x0,y0,z0, x1,y1,z1)              // set to air
box(x0,y0,z0, x1,y1,z1, id)            // hollow shell, all 6 sides
walls(x0,y0,z0, x1,y1,z1, id)          // 4 vertical walls only, no floor/ceiling
floor(x0,z0, x1,z1, y, id)             // one flat horizontal layer at height y
rect(x0,z0, x1,z1, y, id)              // outline of a rectangle at height y
column(x, y0,y1, z, id)                // vertical pillar
line3(x0,y0,z0, x1,y1,z1, id)          // 3-D line
cyl(cx,cz, r, y0,y1, id, state, hollow)// vertical cylinder
disc(cx,y,cz, r, id)                   // filled horizontal circle
ring(cx,y,cz, r, id)                   // circle outline
sphere(cx,cy,cz, r, id)
ellipsoid(cx,cy,cz, rx,ry,rz, id, state, hollow)
```

### oriented blocks  — use these, never hand-roll a state value
```js
stair(x,y,z, B.OAK_STAIRS, 'n'|'e'|'s'|'w', topHalf?)
   // direction = the side the FULL-HEIGHT back of the stair faces.
   // stair(x,y,z,id,'n') has its tall back on the north (-Z) side,
   // so you walk UP toward the north. topHalf=true => upside-down stair.
slab(x,y,z, B.OAK_SLAB, 'b'|'t')       // bottom (default) or top half
logAxis(x,y,z, B.OAK_LOG, 'x'|'y'|'z') // pillar / log orientation
face(x,y,z, id, 'n'|'e'|'s'|'w')       // anything mounted on a wall:
   //   WALL_TORCH, LADDER, VINE, WALL_SIGN, ITEM_FRAME, PAINTING_*, banners,
   //   GLOW_LICHEN. The direction is the side of the block it is attached to,
   //   i.e. face(x,y,z,B.WALL_TORCH,'n') sticks out toward -Z from a wall.
trapdoor(x,y,z, id, dir, {top:bool, open:bool})
door(x,y,z, id, dir)                   // places BOTH halves, y = bottom
bed(x,y,z, id, dir)                    // places BOTH halves, dir = foot -> head
```

### randomness (deterministic — always reseed at the top of `build()`)
```js
W.seed(12345)
rand() -> 0..1        randi(n) -> 0..n-1      randRange(a,b) -> a..b inclusive
pick([a,b,c])         chance(0.3) -> bool
```

### scene extras
```js
heightAt(x,z[,fromY]) -> y of the highest opaque block, or -1
scatter(x0,z0,x1,z1, yTop, [ids], density)  // sprinkle on top of solid ground

marker(type, x,y,z, opts)   // register a particle emitter, see below
poi(label, x,y,z, yaw, pitch)  // register a camera stop for the tour + menu
```

**Marker types** (the renderer draws these — use them, they are most of the
"atmosphere"):

| type | meaning | opts |
|---|---|---|
| `'smoke'` | grey smoke column (chimneys, campfires) | `{rate, rise, spread, size}` |
| `'lavaDrip'` | orange embers + drips falling | `{rate, fall}` |
| `'firefly'` | slow drifting warm glow motes | `{r, count}` |
| `'spark'` | small torch/lantern sparks | `{rate}` |
| `'splash'` | water droplets / ripples | `{rate}` |
| `'bee'` | tiny bees orbiting a point | `{r, count}` |
| `'glow'` | soft additive light halo (no motion) | `{r, color:[r,g,b], power}` |

**POI**: `yaw` is degrees, 0 = looking toward +Z (south), 90 = toward -X (west),
180 = toward -Z (north), 270 = toward +X (east). `pitch` in degrees, negative
looks down. Give 2–4 POIs: one hero exterior shot and one or two interiors.
Camera POIs must sit in air with a clear view.

## Block palette

Every id lives on `B.<NAME>`. **Read `src/blocks.js` for the authoritative
list** — using a name that is not defined there yields `undefined` and silently
places nothing. Highlights:

* Stone family: `STONE COBBLESTONE MOSSY_COBBLESTONE ANDESITE POLISHED_ANDESITE
  DIORITE GRANITE TUFF CALCITE DEEPSLATE COBBLED_DEEPSLATE DEEPSLATE_BRICKS
  DEEPSLATE_TILES POLISHED_DEEPSLATE SMOOTH_STONE STONE_BRICKS
  MOSSY_STONE_BRICKS CRACKED_STONE_BRICKS CHISELED_STONE_BRICKS BRICKS
  MUD_BRICKS SANDSTONE BLACKSTONE`
* Wood: `OAK/SPRUCE/BIRCH/DARK_OAK/JUNGLE/ACACIA_PLANKS`, `*_LOG`,
  `STRIPPED_OAK_LOG STRIPPED_SPRUCE_LOG`, `*_LEAVES`, `AZALEA_LEAVES
  FLOWERING_AZALEA`
* Modern: `QUARTZ_BLOCK SMOOTH_QUARTZ QUARTZ_PILLAR CHISELED_QUARTZ
  QUARTZ_BRICKS IRON_BLOCK GOLD_BLOCK DIAMOND_BLOCK EMERALD_BLOCK COPPER_BLOCK
  OXIDIZED_COPPER PRISMARINE PRISMARINE_BRICKS DARK_PRISMARINE SEA_LANTERN
  GLOWSTONE SHROOMLIGHT OCHRE_FROGLIGHT REDSTONE_LAMP OBSERVER PISTON TARGET`
* Concrete `*_CONCRETE`, terracotta `*_TERRACOTTA`, wool `*_WOOL`,
  glass `*_STAINED_GLASS`, panes `*_PANE` + `GLASS_PANE IRON_BARS`
  — colours: WHITE LIGHT_GRAY GRAY BLACK RED ORANGE YELLOW LIME GREEN CYAN
  LIGHT_BLUE BLUE PURPLE MAGENTA PINK BROWN (not every colour exists in every
  family — check blocks.js).
* Stairs: `<MAT>_STAIRS` — STONE_BRICK, COBBLE, MOSSY_COBBLE, DEEPSLATE_BRICK,
  COBBLED_DEEPSLATE, ANDESITE, STONE, SMOOTH_STONE, OAK, SPRUCE, BIRCH,
  DARK_OAK, QUARTZ, SMOOTH_QUARTZ, BRICK, NETHER_BRICK, PRISMARINE, PURPUR,
  WHITE_CONCRETE, GRAY_CONCRETE, CYAN_CONCRETE, YELLOW_TERRACOTTA,
  RED_TERRACOTTA, HONEYCOMB, GRASS
* Slabs: `<MAT>_SLAB` — same materials (see blocks.js).
* Fences/walls: `OAK_FENCE SPRUCE_FENCE BIRCH_FENCE DARK_OAK_FENCE
  NETHER_BRICK_FENCE COBBLE_WALL MOSSY_COBBLE_WALL STONE_BRICK_WALL
  DEEPSLATE_BRICK_WALL ANDESITE_WALL QUARTZ_WALL`, gates
  `OAK_FENCE_GATE SPRUCE_FENCE_GATE`
* Doors/trapdoors: `OAK_DOOR SPRUCE_DOOR DARK_OAK_DOOR IRON_DOOR`,
  `OAK_TRAPDOOR SPRUCE_TRAPDOOR DARK_OAK_TRAPDOOR IRON_TRAPDOOR`
* Furniture / utility: `CRAFTING_TABLE FURNACE BLAST_FURNACE SMOKER CHEST
  CHEST_OPEN TRAPPED_CHEST ENDER_CHEST BARREL BOOKSHELF CHISELED_BOOKSHELF
  LECTERN ANVIL CAULDRON BREWING_STAND ENCHANTING_TABLE HOPPER JUKEBOX
  NOTE_BLOCK LOOM SMITHING_TABLE CARTOGRAPHY_TABLE COMPOSTER HAY_BALE
  SHULKER_BOX FLOWER_POT CAKE SCAFFOLDING LADDER RAIL POWERED_RAIL
  ARMOR_STAND ITEM_FRAME MAP_FRAME PAINTING_A PAINTING_B PAINTING_C
  SIGN WALL_SIGN SHOP_SIGN FOOD_SIGN GEAR_SIGN TRADES_SIGN SPAWN_SIGN
  STONE_PLATE OAK_PLATE STONE_BUTTON REDSTONE_WIRE REDSTONE_TORCH
  SLIME_BLOCK BOAT MINECART`
* Lights: `TORCH WALL_TORCH SOUL_TORCH SOUL_WALL_TORCH LANTERN
  HANGING_LANTERN SOUL_LANTERN HANGING_SOUL_LANTERN CAMPFIRE SOUL_CAMPFIRE
  JACK_O_LANTERN CARVED_PUMPKIN PUMPKIN END_ROD CHAIN CANDLE`
* Beds: `RED_BED WHITE_BED BLUE_BED GREEN_BED YELLOW_BED PURPLE_BED`
* Carpets: `<COLOR>_CARPET`, plus `MOSS_CARPET SNOW_LAYER`
* Banners: `RED_BANNER BLUE_BANNER YELLOW_BANNER PURPLE_BANNER WHITE_BANNER
  GREEN_BANNER`
* Plants: `TALL_GRASS FERN LARGE_FERN DEAD_BUSH POPPY DANDELION BLUE_ORCHID
  ALLIUM CORNFLOWER OXEYE_DAISY LILY_OF_THE_VALLEY RED_TULIP PINK_TULIP
  ORANGE_TULIP WHITE_TULIP SUNFLOWER ROSE_BUSH LILAC WITHER_ROSE RED_MUSHROOM
  BROWN_MUSHROOM SWEET_BERRY_BUSH WHEAT WHEAT_YOUNG CARROTS POTATOES BEETROOTS
  SUGAR_CANE BAMBOO CACTUS VINE LILY_PAD SEAGRASS GLOW_LICHEN SPORE_BLOSSOM
  MELON PUMPKIN_STEM MOSS_BLOCK MOSS_CARPET`
* Nature/ground: `GRASS_BLOCK DIRT COARSE_DIRT ROOTED_DIRT PODZOL DIRT_PATH
  FARMLAND FARMLAND_WET SAND GRAVEL CLAY WATER ICE SNOW_BLOCK PACKED_ICE`
* Nether/lava: `NETHERRACK NETHER_BRICKS RED_NETHER_BRICKS OBSIDIAN
  CRYING_OBSIDIAN MAGMA_BLOCK LAVA SOUL_SAND SOUL_SOIL END_PORTAL_FRAME
  PURPUR_BLOCK`
* Bee: `HONEYCOMB_BLOCK HONEY_BLOCK BEE_NEST BEEHIVE`
* Critter props (decorative, not mobs): `CAT_STATUE WOLF_STATUE SHEEP_BODY
  COW_BODY CHICKEN_BODY BEE_BODY`

## Rules that keep the combined scene coherent

1. **Never touch anything outside your zone.** Other agents own the
   neighbouring ground.
2. **No unsupported floating blocks** unless the brief says so (the floating
   quartz platforms in the poor-district brief are intentional and must be
   linked with `CHAIN` or bridges).
3. **Interiors must be real**: every room needs a floor, four walls, a
   ceiling, a light source, a way in (door / stair / ladder), and furniture.
   Rooms must be at least 3 blocks tall inside and reachable.
4. **Light everything.** This scene is rendered at night. Anywhere a player
   could stand needs a `LANTERN`, `TORCH`, `WALL_TORCH`, `GLOWSTONE`,
   `SEA_LANTERN`, `CAMPFIRE` or `REDSTONE_LAMP` within ~6 blocks. Dark rooms
   read as solid black.
5. **Vary your blocks.** Never fill a large wall with a single block id —
   speckle in 5–15 % of a related material (`STONE_BRICKS` +
   `CRACKED_STONE_BRICKS` + `MOSSY_STONE_BRICKS`, `QUARTZ_BLOCK` +
   `SMOOTH_QUARTZ` + `CHISELED_QUARTZ`). Use `chance()` for this.
6. **Depth, not flat faces.** Push and pull the facade by 1 block, add
   stair/slab trim under every roofline and above every window, add
   balconies, awnings, corner pillars.
7. **Windows**: glass panes recessed 1 block with a stair or slab sill and a
   trapdoor shutter reads far better than a hole full of glass.
8. Place blocks in a sensible order — later `set()` calls overwrite earlier
   ones. Carve interiors with `clear()` after building the solid mass.

## Verify your work before you finish

```
node tools/checkbuild.js <yourname>
node tools/checkbuild.js <yourname> --slice <z>     # vertical cross-section
```

The report must show **0 out-of-bounds writes**, **0 blocks outside your
zone**, a healthy block count, and a top-down silhouette that looks like the
building you intended. Read the cross-section: check that floors are where you
think, that rooms are hollow, and that nothing is a solid block of stone.
Iterate until it looks right — the ASCII output is your only pair of eyes,
so use it repeatedly.
