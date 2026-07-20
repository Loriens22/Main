/* =========================================================================
 * BEE LANDMARK — rustic stripped-log tower topped by a giant blocky bee,
 * with an attached honey-processing hall, smoking chimney and flower field.
 * Plot: (108,176)-(152,224). Ground y=32, floors at y=33.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('bee', 50, [108, 176, 152, 224], function (W, B) {
    const H = SpawnHub.hash2;
    const st = (x, y, z, m, d, f) => W.set(x, y, z, B.stair(m, d, f));
    const sl = (x, y, z, m, t) => W.set(x, y, z, B.slab(m, t));
    const fn = (x, y, z, m) => W.set(x, y, z, B.fence(m));
    // walk the perimeter of a rect (inclusive)
    function perim(x1, z1, x2, z2, cb) {
      for (let x = x1; x <= x2; x++) { cb(x, z1); cb(x, z2); }
      for (let z = z1 + 1; z <= z2 - 1; z++) { cb(x1, z); cb(x2, z); }
    }
    // stair dir whose HIGH half points at the rect interior
    function inwardDir(x, z, x1, z1, x2, z2) {
      if (z === z1) return 'S'; if (z === z2) return 'N';
      if (x === x1) return 'E'; return 'W';
    }
    const stoneMix = (x, y, z) => {
      const v = H(x * 7 + z, y, 31);
      return v < 0.4 ? B.COBBLESTONE : v < 0.6 ? B.MOSSY_COBBLESTONE : v < 0.85 ? B.STONE_BRICKS : B.ANDESITE;
    };

    /* =====================================================================
     * 1. TOWER  shaft x124..131  z192..199, walls y34..55
     * ===================================================================== */
    const TX1 = 124, TZ1 = 192, TX2 = 131, TZ2 = 199;

    // foundation: cobble ring + plank floor plate at y33
    perim(TX1, TZ1, TX2, TZ2, (x, z) => W.set(x, 33, z, stoneMix(x, 33, z)));
    W.fill(TX1 + 1, 33, TZ1 + 1, TX2 - 1, 33, TZ2 - 1, B.SPRUCE_PLANKS);
    // cobble skirt stairs hugging the base
    perim(TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1, (x, z) =>
      st(x, 33, z, 'COBBLESTONE', inwardDir(x, z, TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1)));

    // walls: spruce log corners, stripped spruce/oak faces
    const corner = (x, z) => (x === TX1 || x === TX2) && (z === TZ1 || z === TZ2);
    for (let y = 34; y <= 55; y++) {
      perim(TX1, TZ1, TX2, TZ2, (x, z) => {
        if (corner(x, z)) { W.set(x, y, z, B.SPRUCE_LOG); return; }
        W.set(x, y, z, H(x * 97 + z, y, 11) < 0.3 ? B.STRIPPED_OAK_LOG : B.STRIPPED_SPRUCE_LOG);
      });
    }
    // honeycomb accent bands
    for (const y of [40, 48, 56]) perim(TX1, TZ1, TX2, TZ2, (x, z) => W.set(x, y, z, B.HONEYCOMB_BLOCK));

    // tall yellow-glass window slits (two tiers) on N, S, E faces + west
    for (const [y1, y2] of [[36, 38], [43, 45]]) {
      for (const x of [126, 129]) { W.fill(x, y1, TZ1, x, y2, TZ1, B.GLASS_YELLOW); W.fill(x, y1, TZ2, x, y2, TZ2, B.GLASS_YELLOW); }
      for (const z of [194, 197]) W.fill(TX2, y1, z, TX2, y2, z, B.GLASS_YELLOW);
    }
    W.fill(TX1, 36, 194, TX1, 38, 194, B.GLASS_YELLOW);          // west lower slit (clear of hall)
    for (const z of [194, 197]) W.fill(TX1, 43, z, TX1, 45, z, B.GLASS_YELLOW);
    // viewing-room picture windows just under the bee
    W.fill(126, 51, TZ1, 129, 52, TZ1, B.GLASS_YELLOW);
    W.fill(126, 51, TZ2, 129, 52, TZ2, B.GLASS_YELLOW);
    W.fill(TX2, 51, 194, TX2, 52, 197, B.GLASS_YELLOW);
    W.fill(TX1, 51, 194, TX1, 52, 197, B.GLASS_YELLOW);

    // small eave rings under the bands (upside-down stairs) + hanging lanterns
    for (const y of [40, 48]) {
      perim(TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1, (x, z) =>
        st(x, y, z, 'SPRUCE_PLANKS', inwardDir(x, z, TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1), true));
    }
    W.set(123, 39, 191, B.LANTERN_HANGING); W.set(132, 39, 200, B.LANTERN_HANGING);
    W.set(132, 47, 191, B.LANTERN_HANGING); W.set(123, 47, 200, B.LANTERN_HANGING);

    // lit item-frame niches sitting on the eave ledges
    W.set(125, 41, 191, B.FRAME_POTION_S); W.set(130, 41, 191, B.FRAME_MAP_S);
    W.set(132, 41, 194, B.FRAME_BOOK_W); W.set(132, 49, 197, B.FRAME_POTION_W);
    W.set(127, 41, 191, B.TORCH); W.set(132, 41, 196, B.TORCH); // torches on the eaves by the niches

    // vines creeping up the south + east faces
    for (const [vx, y1, y2] of [[125, 36, 46], [128, 41, 53], [130, 35, 44]])
      for (let y = y1; y <= y2; y++) if (W.get(vx, y, TZ2 + 1) === 0 && H(vx, y, 51) < 0.8) W.set(vx, y, TZ2 + 1, B.VINE_N);
    for (const [vz, y1, y2] of [[193, 36, 45], [196, 42, 54], [198, 35, 47]])
      for (let y = y1; y <= y2; y++) if (W.get(TX2 + 1, y, vz) === 0 && H(y, vz, 52) < 0.8) W.set(TX2 + 1, y, vz, B.VINE_W);

    // interior: clear, ladder shaft, loft floors
    W.clear(TX1 + 1, 34, TZ1 + 1, TX2 - 1, 55, TZ2 - 1);
    for (const fy of [41, 49]) W.fill(TX1 + 1, fy, TZ1 + 1, TX2 - 1, fy, TZ2 - 1, B.SPRUCE_PLANKS);
    for (let y = 34; y <= 57; y++) W.set(130, y, 198, B.LADDER_E); // continuous ladder, punches floor holes

    // front door facing the plaza (north) + wall torches
    W.clear(127, 34, TZ1, 127, 35, TZ1);
    W.door(127, 34, TZ1, 'SPRUCE_DOOR', 'N');
    st(127, 33, 191, 'COBBLESTONE', 'S'); // doorstep (overrides skirt, same shape)
    W.set(125, 36, 191, B.TORCH_WALL_S); W.set(129, 36, 191, B.TORCH_WALL_S);

    /* ---- tower ground floor: honey shop entry ---- */
    W.set(125, 34, 193, B.CRAFTING_TABLE); W.set(126, 34, 193, B.CHEST);
    W.set(125, 34, 194, B.BARREL); W.set(125, 34, 195, B.BARREL);
    W.set(126, 34, 198, B.BARREL); W.set(125, 34, 198, B.HAY_BALE);
    for (let x = 127; x <= 129; x++) for (let z = 194; z <= 197; z++)
      if (H(x, z, 61) < 0.7) W.set(x, 34, z, H(x, z, 62) < 0.5 ? B.CARPET_YELLOW : B.CARPET_BLACK);
    W.set(126, 36, 193, B.TORCH_WALL_N); W.set(129, 36, 199 - 1, 0) /* keep clear */;
    W.set(128, 40, 196, B.LANTERN_HANGING);
    W.set(126, 38, 199, B.PAINTING1_N === undefined ? B.TORCH : B.PAINTING1_N);

    /* ---- loft (y42..): honey storage ---- */
    W.set(125, 42, 193, B.HONEY_BLOCK); W.set(125, 43, 193, B.HONEY_BLOCK);
    W.set(126, 42, 193, B.HONEY_BLOCK); W.set(125, 42, 194, B.HONEY_BLOCK);
    W.set(129, 42, 193, B.BARREL); W.set(129, 43, 193, B.BARREL); W.set(129, 42, 194, B.BARREL);
    W.set(126, 42, 198, B.BEE_NEST); W.set(127, 42, 198, B.BEE_NEST); W.set(125, 42, 198, B.HAY_BALE);
    sl(128, 42, 193, 'HONEYCOMB_BLOCK');
    W.set(125, 44, 196, B.TORCH_WALL_W);
    W.set(128, 48, 195, B.LANTERN_HANGING);

    /* ---- viewing room (y50..56) under the bee ---- */
    for (let x = 126; x <= 129; x++) for (let z = 194; z <= 197; z++)
      W.set(x, 50, z, H(x, z, 63) < 0.5 ? B.CARPET_YELLOW : B.CARPET_BLACK);
    W.chair(126, 50, 193, 'SPRUCE_PLANKS', 'S'); W.chair(128, 50, 193, 'SPRUCE_PLANKS', 'S');
    W.table(127, 50, 195);
    W.set(125, 50, 193, B.POTTED_DANDELION); W.set(125, 50, 197, B.POTTED_TULIP_RED);
    W.set(125, 50, 198, B.BOOKSHELF); W.set(126, 50, 198, B.BOOKSHELF);
    W.set(127, 56, 195, B.LANTERN_HANGING); W.set(129, 56, 197, B.LANTERN_HANGING);

    /* ---- statue deck: corbels + plate + honeycomb rail ---- */
    perim(TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1, (x, z) =>
      st(x, 56, z, 'DARK_OAK_PLANKS', inwardDir(x, z, TX1 - 1, TZ1 - 1, TX2 + 1, TZ2 + 1), true));
    W.fill(122, 57, 191, 133, 57, 200, B.SPRUCE_PLANKS);
    perim(122, 191, 133, 200, (x, z) => W.set(x, 57, z, B.HONEYCOMB_BLOCK));
    W.set(128, 57, 195, B.GLOWSTONE); W.set(129, 57, 196, B.GLOWSTONE); // warm core under the bee
    for (let y = 34; y <= 57; y++) W.set(130, y, 198, B.LADDER_E); // re-assert ladder through deck
    perim(122, 191, 133, 200, (x, z) => {
      if (x === 122 && z >= 193 && z <= 197) return;              // bee head sits here
      W.set(x, 58, z, B.wall('HONEYCOMB_BLOCK'));
    });
    W.set(122, 59, 191, B.LANTERN); W.set(133, 59, 191, B.LANTERN);
    W.set(122, 59, 200, B.LANTERN); W.set(133, 59, 200, B.LANTERN);
    W.set(122, 56, 191, B.LANTERN_HANGING); W.set(133, 56, 191, B.LANTERN_HANGING);
    W.set(122, 56, 200, B.LANTERN_HANGING); W.set(133, 56, 200, B.LANTERN_HANGING);

    /* =====================================================================
     * 2. THE BEE  (belly y58..61, head west x122..125, stinger east x133+)
     * ===================================================================== */
    const stripe = { 122: 'WOOL_BLACK', 123: 'WOOL_BLACK', 124: 'WOOL_BLACK', 125: 'WOOL_YELLOW',
      126: 'WOOL_YELLOW', 127: 'WOOL_BLACK', 128: 'WOOL_BLACK', 129: 'WOOL_YELLOW',
      130: 'WOOL_YELLOW', 131: 'WOOL_BLACK', 132: 'WOOL_BLACK' };
    for (let x = 122; x <= 132; x++) {
      const m = stripe[x];
      W.fill(x, 58, 193, x, 61, 197, B[m]);
      // round the long z-edges with stairs (top + upside-down bottom)
      st(x, 61, 193, m, 'S'); st(x, 61, 197, m, 'N');
      st(x, 58, 193, m, 'S', true); st(x, 58, 197, m, 'N', true);
    }
    // rounded face/back edges
    for (let z = 194; z <= 196; z++) {
      st(122, 61, z, 'WOOL_BLACK', 'E'); st(122, 58, z, 'WOOL_BLACK', 'E', true);
      st(132, 61, z, 'WOOL_BLACK', 'W'); st(132, 58, z, 'WOOL_BLACK', 'W', true);
    }
    // compound eyes: two 2x2 light-blue glass panels with a 1-block gap
    W.fill(122, 59, 193, 122, 60, 194, B.GLASS_LIGHTBLUE);
    W.fill(122, 59, 196, 122, 60, 197, B.GLASS_LIGHTBLUE);
    // hidden glow core (leaks warm light through the stair seams)
    W.set(128, 59, 195, B.GLOWSTONE); W.set(129, 60, 195, B.GLOWSTONE);
    // antennae: blackstone fences angling forward, iron-bar + quartz tips
    for (const z of [194, 196]) {
      fn(123, 62, z, 'BLACKSTONE'); fn(123, 63, z, 'BLACKSTONE'); fn(122, 64, z, 'BLACKSTONE');
      W.set(122, 65, z, B.IRON_BARS); W.set(122, 66, z, B.QUARTZ_BLOCK);
    }
    // wings: two 5x4 stepped glass panels raking up and out in a V
    for (let i = 0; i < 4; i++) {
      W.fill(127, 62 + i, 194 - i, 131, 62 + i, 194 - i, B.GLASS_WHITE); // north wing
      W.fill(127, 62 + i, 196 + i, 131, 62 + i, 196 + i, B.GLASS_WHITE); // south wing
    }
    // stinger: 2-step black taper off the east end
    W.fill(133, 59, 194, 133, 60, 196, B.WOOL_BLACK);
    st(133, 60, 194, 'WOOL_BLACK', 'S'); st(133, 60, 196, 'WOOL_BLACK', 'N');
    st(133, 59, 194, 'WOOL_BLACK', 'S', true); st(133, 59, 196, 'WOOL_BLACK', 'N', true);
    st(134, 59, 195, 'WOOL_BLACK', 'W'); st(134, 60, 195, 'WOOL_BLACK', 'W', true);

    /* =====================================================================
     * 3. HONEY HALL  x111..123  z196..205 (attached to tower west face)
     * ===================================================================== */
    const HX1 = 111, HZ1 = 196, HX2 = 123, HZ2 = 205;
    // floor plate: spruce with dark oak border
    W.fill(HX1, 33, HZ1, HX2, 33, HZ2, B.SPRUCE_PLANKS);
    perim(HX1, HZ1, HX2, HZ2, (x, z) => W.set(x, 33, z, B.DARK_OAK_PLANKS));
    // walls: dark oak log frame, spruce plank infill
    for (let y = 34; y <= 39; y++) {
      perim(HX1, HZ1, HX2, HZ2, (x, z) => {
        const post = ((x === HX1 || x === HX2) && (z === HZ1 || z === HZ2)) ||
          ((z === HZ1 || z === HZ2) && (x === 114 || x === 120)) ||
          ((x === HX1 || x === HX2) && z === 200);
        W.set(x, y, z, post ? B.DARK_OAK_LOG : B.SPRUCE_PLANKS);
      });
    }
    perim(HX1, HZ1, HX2, HZ2, (x, z) => W.set(x, 40, z, B.DARK_OAK_LOG)); // top plate
    // windows
    for (const x of [113, 114, 120, 121]) W.fill(x, 36, HZ1, x, 37, HZ1, B.PANE_YELLOW);
    for (const x of [113, 114, 119, 120]) W.fill(x, 36, HZ2, x, 37, HZ2, B.PANE_YELLOW);
    W.fill(HX1, 36, 198, HX1, 37, 199, B.PANE_YELLOW);
    W.fill(HX2, 36, 202, HX2, 37, 203, B.PANE_YELLOW);
    // hall door (north, toward plaza) + sign + torches
    W.clear(117, 34, HZ1, 117, 35, HZ1);
    W.door(117, 34, HZ1, 'SPRUCE_DOOR', 'N');
    st(117, 33, 195, 'COBBLESTONE', 'S');
    W.set(115, 36, 195, B.TORCH_WALL_S); W.set(119, 36, 195, B.TORCH_WALL_S);
    W.set(118, 36, 195, B.SIGN_WALL_S); W.set(116, 36, 195, B.SIGN_WALL_S);

    // steep gabled roof: honeycomb + yellow terracotta stair mix, 1-block eaves
    const roofMat = (x, z) => (H(x, z, 71) < 0.6 ? 'HONEYCOMB_BLOCK' : 'TERRACOTTA_YELLOW');
    for (let i = 0; i <= 5; i++) {
      for (let x = HX1 - 1; x <= HX2; x++) {
        st(x, 41 + i, 195 + i, roofMat(x, 195 + i), 'S');
        st(x, 41 + i, 206 - i, roofMat(x, 206 - i), 'N');
      }
    }
    for (let x = HX1 - 1; x <= HX2; x++) { sl(x, 47, 200, 'HONEYCOMB_BLOCK'); sl(x, 47, 201, 'HONEYCOMB_BLOCK'); }
    // gable-end triangles
    for (const gx of [HX1, HX2]) for (let i = 1; i <= 5; i++)
      W.fill(gx, 40 + i, 195 + i, gx, 40 + i, 206 - i, B.SPRUCE_PLANKS);
    // honey "dripping" from the eaves
    for (const x of [113, 118, 122]) W.set(x, 40, 195, B.HONEY_BLOCK);
    for (const x of [112, 116, 121]) W.set(x, 40, 206, B.HONEY_BLOCK);
    W.set(118, 39, 195, B.HONEY_BLOCK);
    // lanterns tucked under the west roof overhang
    W.set(HX1 - 1, 44, 199, B.LANTERN_HANGING); W.set(HX1 - 1, 44, 202, B.LANTERN_HANGING);

    // clear the interior up to the roof underside
    W.clear(HX1 + 1, 34, HZ1 + 1, HX2 - 1, 40, HZ2 - 1);
    for (let z = HZ1 + 1; z <= HZ2 - 1; z++) {
      const roofY = 41 + Math.min(z - 195, 206 - z);
      if (roofY - 1 >= 41) W.clear(HX1 + 1, 41, z, HX2 - 1, roofY - 1, z);
    }
    // tie beam + hanging lanterns
    W.fill(HX1 + 1, 40, 201, HX2 - 1, 40, 201, B.DARK_OAK_LOG);
    W.set(113, 39, 201, B.LANTERN_HANGING); W.set(117, 39, 201, B.LANTERN_HANGING); W.set(121, 39, 201, B.LANTERN_HANGING);

    // archway connecting hall and tower
    W.clear(123, 34, 197, 124, 35, 198);

    /* ---- hall interior: honey-processing shop ---- */
    // shop counter (barrels + honeycomb slab top) with frames on the back wall
    for (let x = 115; x <= 120; x++) { W.set(x, 34, 203, B.BARREL); sl(x, 35, 203, 'HONEYCOMB_BLOCK'); }
    W.set(115, 36, 204, B.FRAME_POTION_S); W.set(117, 36, 204, B.FRAME_MAP_S);
    W.set(119, 36, 204, B.FRAME_POTION_S); W.set(120, 36, 204, B.FRAME_BOOK_S);
    W.set(121, 34, 204, B.CAULDRON); W.set(113, 34, 203, B.COMPOSTER);
    W.set(112, 34, 204, B.BARREL); W.set(112, 35, 204, B.BARREL); W.set(113, 34, 204, B.BARREL);
    W.set(122, 34, 204, B.HAY_BALE); W.set(122, 34, 203, B.HAY_BALE); W.set(122, 35, 204, B.HAY_BALE);
    // bee-nest wall stack + honey display pillars
    W.fill(112, 34, 199, 112, 36, 200, B.BEE_NEST);
    W.set(112, 34, 198, B.HONEYCOMB_BLOCK); W.set(112, 35, 198, B.HONEYCOMB_BLOCK);
    W.set(114, 34, 198, B.HONEY_BLOCK); W.set(114, 35, 198, B.HONEY_BLOCK); sl(114, 36, 198, 'HONEYCOMB_BLOCK');
    W.set(120, 34, 198, B.HONEY_BLOCK); W.set(120, 35, 198, B.HONEY_BLOCK); sl(120, 36, 198, 'HONEYCOMB_BLOCK');
    // hearth: campfire under a smoker, stone-brick surround
    W.fill(111, 34, 200, 111, 38, 202, B.STONE_BRICKS);
    W.set(112, 34, 200, B.STONE_BRICKS); W.set(112, 34, 202, B.STONE_BRICKS); W.set(112, 36, 201, B.STONE_BRICKS);
    W.set(112, 34, 201, B.CAMPFIRE); W.set(112, 35, 201, B.SMOKER);
    // table + chairs, carpet by the entrance, wall torches
    W.table(117, 34, 200); W.chair(116, 34, 200, 'SPRUCE_PLANKS', 'W'); W.chair(118, 34, 200, 'SPRUCE_PLANKS', 'E');
    for (let x = 114; x <= 119; x++) for (let z = 197; z <= 199; z++)
      if (H(x, z, 72) < 0.75) W.set(x, 34, z, H(x + z, z, 73) < 0.5 ? B.CARPET_YELLOW : B.CARPET_BLACK);
    W.set(114, 36, 197, B.TORCH_WALL_N); W.set(120, 36, 197, B.TORCH_WALL_N);

    /* ---- chimney: stone stack through the roof, campfire recessed on top ---- */
    for (let y = 33; y <= 48; y++)
      for (let x = 109; x <= 111; x++) for (let z = 200; z <= 202; z++)
        W.set(x, y, z, stoneMix(x, y, z));
    perim(109, 200, 111, 202, (x, z) => W.set(x, 49, z, B.wall('COBBLESTONE')));
    W.set(110, 49, 201, B.CAMPFIRE); // smoke rises from the stack, visible only from above

    /* =====================================================================
     * 4. GROUNDS: paths, wolf, lectern, nest posts, lamps, flower field
     * ===================================================================== */
    const pathBlock = (x, z) => {
      const v = H(x, z, 81);
      W.set(x, 32, z, v < 0.4 ? B.COBBLESTONE : v < 0.5 ? B.MOSSY_COBBLESTONE : B.DIRT_PATH);
      if (H(x, z, 82) < 0.05) W.torch(x, 33, z);
    };
    for (let z = 176; z <= 191; z++) { pathBlock(127, z); pathBlock(128, z); }   // tower -> plaza
    for (let z = 176; z <= 195; z++) { pathBlock(116, z); pathBlock(117, z); }   // hall -> plaza
    for (let x = 108; x <= 152; x++) { pathBlock(x, 186); pathBlock(x, 187); }   // west-east crossing
    for (let z = 188; z <= 224; z++) { pathBlock(137, z); pathBlock(138, z); }   // south run

    // sitting wolf statue by the entrance (facing the path, red collar)
    sl(131, 33, 189, 'WOOL_WHITE');                       // front paws
    W.set(132, 33, 189, B.WOOL_WHITE); W.set(132, 34, 189, B.WOOL_WHITE); // chest
    W.set(132, 35, 189, B.WOOL_RED);                      // collar
    W.set(132, 36, 189, B.WOOL_WHITE);                    // head
    sl(131, 36, 189, 'WOOL_WHITE');                       // snout
    fn(132, 37, 189, 'WOOL_WHITE');                       // ears
    W.set(133, 33, 189, B.WOOL_WHITE);                    // haunches
    st(133, 34, 189, 'WOOL_WHITE', 'W');                  // sloping back
    sl(134, 33, 189, 'WOOL_WHITE');                       // tail

    // lectern + signpost out front
    W.set(124, 33, 188, B.LECTERN); W.set(125, 33, 188, B.SIGN);
    W.set(123, 33, 188, B.POTTED_TULIP_RED);

    // bee-nest posts (fence + nest) scattered in the meadow
    for (const [nx, nz] of [[142, 189], [146, 206], [121, 217], [111, 186]]) {
      fn(nx, 33, nz, 'SPRUCE_PLANKS'); fn(nx, 34, nz, 'SPRUCE_PLANKS'); W.set(nx, 35, nz, B.BEE_NEST);
    }
    // azalea bushes + a couple of trees
    for (const [ax, az] of [[112, 190], [135, 204], [146, 196], [140, 219], [131, 214]]) W.tree(ax, 33, az, 'azalea');
    W.tree(147, 33, 214, 'oak'); W.tree(144, 33, 181, 'birch');
    // lamp posts along the paths
    for (const [lx, lz] of [[125, 179], [130, 190], [114, 180], [119, 193], [110, 188],
      [134, 185], [139, 210], [136, 218], [148, 207], [112, 210], [122, 222], [148, 188]])
      W.lampPost(lx, 33, lz);
    // hay bales by the hall
    W.set(113, 33, 207, B.HAY_BALE); W.set(114, 33, 207, B.HAY_BALE); W.set(113, 34, 207, B.HAY_BALE);

    // dense flower field: patch-weighted scatter over the whole plot
    const patches = [[138, 185, 8], [143, 212, 9], [118, 214, 8], [113, 184, 6], [147, 197, 6], [126, 208, 6]];
    const flowers = [B.TULIP_RED, B.TULIP_WHITE, B.TULIP_PINK, B.DANDELION, B.POPPY,
      B.OXEYE_DAISY, B.ALLIUM, B.DANDELION, B.POPPY, B.TULIP_RED, B.CORNFLOWER];
    for (let x = 109; x <= 151; x++) {
      for (let z = 177; z <= 223; z++) {
        if (W.get(x, 33, z) !== 0) continue;
        const below = W.get(x, 32, z);
        if (below !== 0 && below !== B.GRASS) continue; // keep off paths/stones
        let density = 0.06;
        for (const [px, pz, pr] of patches) {
          const d = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (d <= pr * pr) { density = 0.55; break; }
          if (d <= (pr + 3) * (pr + 3)) density = Math.max(density, 0.25);
        }
        const v = H(x, z, 91);
        if (v >= density) continue;
        const t = H(x, z, 92);
        W.set(x, 33, z, t < 0.3 ? B.TALL_GRASS : flowers[(H(x, z, 93) * flowers.length) | 0]);
      }
    }
    // a few stepping stones off the path edges
    for (let x = 109; x <= 151; x++) for (let z = 177; z <= 223; z++)
      if (H(x, z, 94) < 0.008 && W.get(x, 33, z) === 0 && W.get(x, 32, z) === 0)
        W.set(x, 32, z, B.COBBLESTONE);
  });
})();
