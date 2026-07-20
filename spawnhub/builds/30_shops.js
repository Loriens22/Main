/* =========================================================================
 * SHOPS & MARKET — market street of 5 shops along an east-west lane.
 * Plot: (100,60)-(172,116). Lane z85..92, gate to plaza at south edge.
 *   North side (fronts face S at z=84): Food stall, Gear smith, Teal landmark
 *   South side (fronts face N at z=93): General store "Trades", Potions&Books
 * Ground top solid = y32, building floors at y33, interiors walk at y34.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('shops', 30, [100, 60, 172, 116], function (W, B) {

    /* ------------------------- small helpers ------------------------- */
    function h(x, z) { // deterministic hash 0..1
      let n = (x * 374761393 + z * 668265263) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) % 1000 / 1000;
    }
    function pave(x1, z1, x2, z2) { // patchwork street surface at y=32
      for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
        const r = h(x, z);
        const m = r < 0.48 ? 'DIRT_PATH' : r < 0.70 ? 'GRAVEL' : r < 0.90 ? 'COBBLESTONE' : 'MOSSY_COBBLESTONE';
        W.set(x, 32, z, B[m]);
      }
    }
    /* gable roof, ridge running east-west; stairs slope on N and S faces.
     * Spans x1..x2 / z1..z2 INCLUDING 1-block overhangs, base level y0.
     * gxs = x columns of the two end (gable) walls to fill with gMat. */
    function gableZ(x1, x2, z1, z2, y0, mat, gMat, gxs) {
      let zA = z1, zB = z2, y = y0;
      while (zA < zB) {
        for (let x = x1; x <= x2; x++) { W.stair(x, y, zA, mat, 'S'); W.stair(x, y, zB, mat, 'N'); }
        if (gxs && zA + 1 <= zB - 1) for (const gx of gxs) W.fill(gx, y, zA + 1, gx, y, zB - 1, B[gMat]);
        zA++; zB--; y++;
      }
      if (zA === zB) for (let x = x1; x <= x2; x++) W.slab(x, y, zA, mat, false);
    }
    function stripedSlabs(x1, x2, z1, z2, y, colA, colB) { // awning stripes along x
      for (let x = x1; x <= x2; x++) { const m = (x & 1) ? colA : colB; for (let z = z1; z <= z2; z++) W.slab(x, y, z, m, false); }
    }
    function twall(x, y, z, dir) { W.set(x, y, z, B['TORCH_WALL_' + dir]); }
    function frame(x, y, z, item, dir) { W.set(x, y, z, B['FRAME_' + item + '_' + dir]); }
    function postCol(x, z, y1, y2, mat) { W.fill(x, y1, z, x, y2, z, B[mat]); }
    function fenceCol(x, z, y1, y2, mat) { for (let y = y1; y <= y2; y++) W.fencePost(x, y, z, mat); }
    function cratePile(x, z) { // barrels + chest clutter on the ground (y33)
      W.set(x, 33, z, B.BARREL); W.set(x, 34, z, B.BARREL);
      W.set(x + 1, 33, z, B.CHEST); W.set(x, 33, z + 1, B.BARREL);
    }

    /* =========================== STREET =========================== */
    pave(101, 85, 171, 92);            // main market lane
    pave(141, 93, 147, 115);           // avenue south to the plaza gate

    /* =================== SHOP 1 — GENERAL STORE "TRADES" ===================
     * South side, x103..117 z93..104, oak log frame + oak/spruce planks,
     * yellow terracotta roof, red/white striped awning over the lane. */
    (function shopTrades() {
      // floor + cobble plinth
      W.fill(103, 33, 93, 117, 33, 104, B.OAK_PLANKS);
      W.walls(103, 33, 93, 117, 33, 104, B.COBBLESTONE);
      // walls: oak front, spruce sides/back, log posts + log top plate
      W.fill(103, 34, 93, 117, 38, 93, B.OAK_PLANKS);
      W.fill(103, 34, 104, 117, 38, 104, B.SPRUCE_PLANKS);
      W.fill(103, 34, 93, 103, 38, 104, B.SPRUCE_PLANKS);
      W.fill(117, 34, 93, 117, 38, 104, B.SPRUCE_PLANKS);
      for (const [px, pz] of [[103, 93], [117, 93], [103, 104], [117, 104], [103, 99], [117, 99]]) postCol(px, pz, 33, 38, 'OAK_LOG');
      W.walls(103, 39, 93, 117, 39, 104, B.OAK_LOG); // wall plate ring
      // door + windows + step
      W.door(110, 34, 93, 'OAK_DOOR', 'S');
      W.stair(110, 33, 92, 'COBBLESTONE', 'S');
      W.fill(105, 35, 93, 107, 36, 93, B.GLASS_PANE);
      W.fill(113, 35, 93, 115, 36, 93, B.GLASS_PANE);
      W.fill(103, 35, 97, 103, 36, 98, B.GLASS_PANE);
      W.fill(117, 35, 97, 117, 36, 98, B.GLASS_PANE);
      // item frames + sign on the front wall (wall is to the S of the frame)
      frame(106, 37, 92, 'PICK', 'S'); frame(110, 37, 92, 'SWORD', 'S'); frame(114, 37, 92, 'MAP', 'S');
      W.set(112, 35, 92, B.SIGN_WALL_S);
      // striped awning on fence posts over the lane edge
      fenceCol(103, 91, 33, 37, 'SPRUCE_PLANKS'); fenceCol(117, 91, 33, 37, 'SPRUCE_PLANKS');
      stripedSlabs(103, 117, 91, 92, 38, 'WOOL_RED', 'WOOL_WHITE');
      // interior: counter, barrels, chests, crafting corner
      for (let x = 106; x <= 112; x++) W.slab(x, 34, 98, 'SPRUCE_PLANKS', true);
      W.set(108, 35, 98, B.LANTERN);
      W.set(104, 34, 103, B.BARREL); W.set(104, 35, 103, B.BARREL); W.set(105, 34, 103, B.BARREL);
      W.set(105, 34, 102, B.BARREL); W.set(116, 34, 103, B.BARREL); W.set(116, 35, 103, B.BARREL);
      W.set(115, 34, 103, B.BARREL); W.set(116, 34, 94, B.CHEST); W.set(116, 34, 95, B.CHEST);
      W.set(116, 35, 94, B.CHEST); W.set(104, 34, 94, B.CRAFTING_TABLE);
      for (let x = 106; x <= 112; x++) for (let z = 95; z <= 96; z++)
        W.set(x, 34, z, ((x + z) & 1) ? B.CARPET_RED : B.CARPET_WHITE);
      frame(109, 36, 103, 'MAP', 'S');
      twall(105, 37, 94, 'S'); twall(115, 37, 94, 'S'); twall(105, 37, 103, 'N'); twall(115, 37, 103, 'N');
      // roof: yellow terracotta gable
      gableZ(102, 118, 92, 105, 39, 'TERRACOTTA_YELLOW', 'OAK_PLANKS', [103, 117]);
      // flower pots by the door
      W.set(104, 33, 92, B.POTTED_TULIP_RED); W.set(116, 33, 92, B.POTTED_DANDELION);
    })();

    /* ====================== SHOP 2 — FOOD STALL "FOOD" ======================
     * North side, x104..115 z75..84, open-air hay + oak-post stall with an
     * orange/white awning roof, smoker + campfire kitchen behind counter. */
    (function stallFood() {
      W.fill(104, 32, 75, 115, 32, 84, B.SPRUCE_PLANKS);       // deck at grade
      for (const [px, pz] of [[104, 75], [115, 75], [104, 84], [115, 84]]) postCol(px, pz, 33, 37, 'OAK_LOG');
      // front counter along the lane, goods on top
      W.fill(105, 33, 83, 114, 33, 83, B.SPRUCE_PLANKS);
      W.set(107, 33, 83, B.BARREL); W.set(111, 33, 83, B.BARREL);
      W.set(106, 34, 83, B.CAKE); W.set(108, 34, 83, B.MELON);
      W.set(110, 34, 83, B.HAY_BALE); W.set(112, 34, 83, B.PUMPKIN);
      W.set(114, 34, 83, B.LANTERN);
      // side counter with more produce
      W.fill(105, 33, 77, 105, 33, 82, B.SPRUCE_PLANKS);
      W.set(105, 34, 78, B.MELON); W.set(105, 34, 80, B.PUMPKIN); W.set(105, 34, 82, B.HAY_BALE);
      // kitchen at the back: smoker, campfire, crates of goods
      W.set(107, 33, 76, B.SMOKER); W.set(109, 33, 76, B.CAMPFIRE);
      W.set(112, 33, 76, B.CHEST); W.set(113, 33, 76, B.BARREL); W.set(113, 34, 76, B.BARREL);
      W.set(114, 33, 76, B.BARREL); W.set(114, 33, 77, B.BARREL);
      // hay dressing at the corners
      W.set(103, 33, 83, B.HAY_BALE); W.set(116, 33, 84, B.HAY_BALE); W.set(116, 34, 84, B.HAY_BALE);
      W.set(103, 33, 76, B.HAY_BALE);
      // hanging lanterns under the roof
      W.set(106, 37, 81, B.LANTERN_HANGING); W.set(112, 37, 81, B.LANTERN_HANGING);
      // awning roof: two striped tiers with a wool fascia band
      stripedSlabs(103, 116, 80, 85, 38, 'WOOL_ORANGE', 'WOOL_WHITE');
      for (let x = 103; x <= 116; x++) W.set(x, 38, 79, (x & 1) ? B.WOOL_ORANGE : B.WOOL_WHITE);
      stripedSlabs(103, 116, 75, 79, 39, 'WOOL_ORANGE', 'WOOL_WHITE');
      W.set(105, 36, 84, B.SIGN_WALL_W); // menu sign on the front post
    })();

    /* ===================== SHOP 3 — GEAR / SMITH "GEAR" =====================
     * North side, x120..134 z72..84. Stone bricks + deepslate, iron-bar
     * windows, lava display, chimney with campfire smoke, armor stands. */
    (function shopGear() {
      W.fill(120, 33, 72, 134, 33, 84, B.STONE);
      W.walls(120, 33, 72, 134, 33, 84, B.COBBLED_DEEPSLATE);
      W.walls(120, 34, 72, 134, 34, 84, B.DEEPSLATE_BRICKS);     // dark base course
      W.walls(120, 35, 72, 134, 39, 84, B.STONE_BRICKS);
      for (const [px, pz] of [[120, 72], [134, 72], [120, 84], [134, 84], [120, 78], [134, 78], [125, 84], [129, 84]])
        postCol(px, pz, 33, 39, 'COBBLED_DEEPSLATE');
      // door, step, iron-bar window grills
      W.door(127, 34, 84, 'DARK_DOOR', 'N');
      W.stair(127, 33, 85, 'COBBLESTONE', 'N');
      W.fill(122, 35, 84, 124, 36, 84, B.IRON_BARS);
      W.fill(130, 35, 84, 132, 36, 84, B.IRON_BARS);
      W.fill(120, 35, 76, 120, 36, 77, B.IRON_BARS);
      W.fill(134, 35, 76, 134, 36, 77, B.IRON_BARS);
      W.fill(126, 35, 72, 128, 36, 72, B.IRON_BARS);
      // item frames + wool banner stripes on the front (wall is N of them)
      frame(122, 37, 85, 'ARMOR', 'N'); frame(132, 37, 85, 'SWORD', 'N'); frame(124, 37, 85, 'PICK', 'N');
      W.fill(125, 35, 85, 125, 36, 85, B.WOOL_RED); W.fill(129, 35, 85, 129, 36, 85, B.WOOL_RED);
      // armor stands out front on the lane
      W.set(122, 33, 86, B.ARMOR_STAND); W.set(132, 33, 86, B.ARMOR_STAND);
      // interior: forge wall, anvil, lava behind glass framed in stone
      W.set(121, 34, 74, B.BLAST_FURNACE); W.set(121, 34, 75, B.BLAST_FURNACE); W.set(121, 34, 77, B.FURNACE);
      W.set(121, 34, 79, B.CRAFTING_TABLE); W.set(126, 34, 77, B.ANVIL);
      W.fill(127, 34, 73, 129, 36, 73, B.STONE_BRICKS);
      W.set(128, 34, 73, B.LAVA); W.set(128, 34, 74, B.GLASS);
      W.set(133, 34, 74, B.BARREL); W.set(133, 35, 74, B.BARREL); W.set(133, 34, 75, B.BARREL);
      W.set(133, 34, 77, B.CAULDRON); W.set(133, 34, 82, B.CHEST); W.set(132, 34, 82, B.CHEST);
      W.set(124, 34, 81, B.LANTERN);
      twall(122, 37, 83, 'N'); twall(132, 37, 83, 'N'); twall(122, 37, 73, 'S');
      // deepslate tile roof + chimney with campfire smoke
      gableZ(119, 135, 71, 85, 39, 'DEEPSLATE_TILES', 'STONE_BRICKS', [120, 134]);
      W.fill(132, 34, 73, 132, 47, 73, B.STONE_BRICKS);
      W.set(132, 48, 73, B.CAMPFIRE);
    })();

    /* ==================== SHOP 4 — POTIONS & BOOKS ====================
     * South side, x121..133 z93..106. Dark oak + purple, brewing corner,
     * enchanting table in a bookshelf ring, reading loft with ladder. */
    (function shopPotions() {
      W.fill(121, 33, 93, 133, 33, 106, B.DARK_OAK_PLANKS);
      W.walls(121, 33, 93, 133, 33, 106, B.COBBLESTONE);
      W.walls(121, 34, 93, 133, 38, 106, B.DARK_OAK_PLANKS);    // ground storey
      W.fill(122, 39, 94, 132, 39, 105, B.DARK_OAK_PLANKS);     // loft floor
      W.walls(121, 39, 93, 133, 39, 106, B.DARK_OAK_LOG);       // band beam
      W.walls(121, 40, 93, 133, 44, 106, B.SPRUCE_PLANKS);      // loft storey
      for (const [px, pz] of [[121, 93], [133, 93], [121, 106], [133, 106], [121, 100], [133, 100]])
        postCol(px, pz, 33, 44, 'DARK_OAK_LOG');
      // door, step, purple windows both storeys
      W.door(126, 34, 93, 'SPRUCE_DOOR', 'N');
      W.stair(126, 33, 92, 'COBBLESTONE', 'S');
      W.fill(123, 35, 93, 124, 36, 93, B.PANE_PURPLE);
      W.fill(129, 35, 93, 130, 36, 93, B.PANE_PURPLE);
      W.fill(123, 41, 93, 124, 42, 93, B.PANE_PURPLE);
      W.fill(129, 41, 93, 130, 42, 93, B.PANE_PURPLE);
      W.fill(121, 41, 98, 121, 42, 99, B.GLASS_PANE);
      W.fill(133, 41, 98, 133, 42, 99, B.GLASS_PANE);
      W.fill(121, 35, 98, 121, 36, 99, B.GLASS_PANE);
      W.fill(133, 35, 98, 133, 36, 99, B.GLASS_PANE);
      // front dressing: frames, sign, bee nests tucked under the eave
      frame(124, 37, 92, 'POTION', 'S'); frame(129, 37, 92, 'BOOK', 'S');
      W.set(127, 36, 92, B.SIGN_WALL_S);
      W.set(122, 43, 92, B.BEE_NEST); W.set(132, 43, 92, B.BEE_NEST);
      W.set(122, 33, 92, B.POTTED_ALLIUM); W.set(132, 33, 92, B.POTTED_FERN);
      // ground interior: brewing corner
      W.set(122, 34, 94, B.BARREL); W.set(122, 35, 94, B.BREWING_STAND);
      W.set(123, 34, 94, B.CAULDRON); W.set(124, 34, 94, B.CHEST);
      W.set(122, 34, 95, B.BOOKSHELF); W.set(122, 34, 96, B.BOOKSHELF);
      W.set(132, 34, 94, B.CHEST); W.set(132, 35, 94, B.CHEST); W.set(132, 34, 96, B.BARREL);
      // enchanting table inside a bookshelf ring (gap at the north side)
      for (let x = 125; x <= 129; x++) for (let z = 99; z <= 103; z++) {
        const border = (x === 125 || x === 129 || z === 99 || z === 103);
        if (border && !(z === 99 && x >= 126 && x <= 128)) W.set(x, 34, z, B.BOOKSHELF);
      }
      W.set(127, 34, 101, B.ENCHANTING_TABLE);
      for (const [cx, cz] of [[125, 99], [129, 99], [125, 103], [129, 103]]) W.set(cx, 35, cz, B.TORCH);
      for (let x = 124; x <= 130; x++) W.set(x, 34, 97, (x & 1) ? B.CARPET_PURPLE : B.CARPET_WHITE);
      W.set(125, 38, 100, B.LANTERN_HANGING); W.set(129, 38, 96, B.LANTERN_HANGING);
      twall(124, 37, 105, 'N'); twall(130, 37, 105, 'N');
      // ladder up to the loft (through a hole in the loft floor)
      for (let y = 34; y <= 39; y++) W.set(132, y, 105, B.LADDER_E);
      // loft: reading nook
      for (let x = 123; x <= 127; x++) for (let z = 95; z <= 98; z++)
        W.set(x, 40, z, ((x + z) & 1) ? B.CARPET_PURPLE : B.CARPET_WHITE);
      W.set(123, 40, 94, B.LECTERN);
      W.fill(124, 40, 105, 128, 40, 105, B.BOOKSHELF);
      W.fill(125, 41, 105, 127, 41, 105, B.BOOKSHELF);
      W.set(131, 40, 94, B.CHEST); W.set(127, 40, 100, B.LANTERN);
      W.table(122, 40, 99); W.chair(123, 40, 99, 'SPRUCE_PLANKS', 'W');
      W.set(122, 42, 101, B.PAINTING1_W);
      twall(126, 42, 94, 'S'); twall(129, 42, 104, 'N');
      // purple terracotta gable roof
      gableZ(120, 134, 92, 107, 44, 'TERRACOTTA_PURPLE', 'SPRUCE_PLANKS', [121, 133]);
    })();

    /* ================= SHOP 5 — TEAL COPPER LANDMARK =================
     * North side, x139..159 z66..84. Oxidized copper ground storey with a
     * chunky honeycomb + yellow-concrete overhanging top storey, big shop
     * window, warped trim, glass display cases, sea-lantern floor. */
    (function shopTeal() {
      // ground storey
      W.fill(139, 33, 66, 159, 33, 84, B.WARPED_PLANKS);
      W.walls(139, 33, 66, 159, 33, 84, B.OXIDIZED_CUT_COPPER); // plinth
      W.walls(139, 34, 66, 159, 37, 84, B.OXIDIZED_COPPER);
      W.walls(139, 38, 66, 159, 38, 84, B.WARPED_PLANKS);       // trim band
      for (const [px, pz] of [[139, 66], [159, 66], [139, 84], [159, 84], [139, 75], [159, 75], [142, 84], [150, 84], [154, 84], [148, 66]])
        postCol(px, pz, 33, 38, 'OXIDIZED_CUT_COPPER');
      // big shop window + iron door + side windows
      W.fill(143, 35, 84, 149, 37, 84, B.GLASS);
      W.door(153, 34, 84, 'IRON_DOOR', 'S');
      W.stair(153, 33, 85, 'OXIDIZED_CUT_COPPER', 'N');
      W.fill(139, 35, 70, 139, 36, 72, B.GLASS_PANE);
      W.fill(139, 35, 78, 139, 36, 80, B.GLASS_PANE);
      W.fill(159, 35, 78, 159, 36, 80, B.GLASS_PANE);
      // recessed sea-lantern floor lights
      for (const [lx, lz] of [[143, 71], [147, 69], [151, 73], [143, 79], [149, 77], [155, 71], [153, 81], [145, 75]])
        W.set(lx, 33, lz, B.SEA_LANTERN);
      // display cases: pedestal + item frame + glass box on top
      const west = [['SWORD', 70], ['ARMOR', 74], ['MAP', 78]];
      for (const [it, z] of west) {
        W.set(141, 34, z, B.WARPED_PLANKS); W.set(141, 35, z, B.GLASS); frame(142, 34, z, it, 'W');
      }
      const east = [['POTION', 70], ['BOOK', 74], ['PICK', 78]];
      for (const [it, z] of east) {
        W.set(157, 34, z, B.WARPED_PLANKS); W.set(157, 35, z, B.GLASS); frame(156, 34, z, it, 'E');
      }
      // counter + storage
      for (let x = 145; x <= 151; x++) W.slab(x, 34, 69, 'WARPED_PLANKS', true);
      W.set(150, 35, 69, B.LANTERN);
      W.set(145, 34, 67, B.BARREL); W.set(146, 34, 67, B.BARREL); W.set(146, 35, 67, B.BARREL);
      W.set(148, 34, 67, B.CHEST); W.set(140, 34, 67, B.BARREL); W.set(140, 35, 67, B.BARREL);
      W.set(141, 34, 67, B.BARREL);
      // hanging lanterns under the ceiling
      for (const [lx, lz] of [[144, 74], [152, 78], [148, 70], [143, 82], [155, 68]]) W.set(lx, 38, lz, B.LANTERN_HANGING);
      // ladder to the top storey
      for (let y = 34; y <= 39; y++) W.set(158, y, 67, B.LADDER_E);
      // overhanging upper storey: honeycomb + yellow concrete
      W.fill(138, 39, 65, 160, 39, 85, B.WARPED_PLANKS);        // overhang floor
      for (const bx of [141, 147, 151, 157]) W.stair(bx, 38, 85, 'WARPED_PLANKS', 'N', true);   // corbels
      for (const bz of [69, 75, 81]) { W.stair(138, 38, bz, 'WARPED_PLANKS', 'E', true); W.stair(160, 38, bz, 'WARPED_PLANKS', 'W', true); }
      for (const bx of [143, 149, 155]) W.stair(bx, 38, 65, 'WARPED_PLANKS', 'S', true);
      W.walls(138, 40, 65, 160, 40, 85, B.CONCRETE_YELLOW);
      W.walls(138, 41, 65, 160, 42, 85, B.HONEYCOMB_BLOCK);
      W.walls(138, 43, 65, 160, 43, 85, B.CONCRETE_YELLOW);
      W.walls(138, 44, 65, 160, 44, 85, B.HONEYCOMB_BLOCK);
      for (const [px, pz] of [[138, 65], [160, 65], [138, 85], [160, 85]]) postCol(px, pz, 40, 44, 'CONCRETE_YELLOW');
      // upper windows
      for (const wx of [141, 146, 151, 156]) { W.fill(wx, 41, 85, wx + 1, 42, 85, B.GLASS); W.fill(wx, 41, 65, wx + 1, 42, 65, B.GLASS); }
      for (const wz of [70, 76, 80]) { W.fill(138, 41, wz, 138, 42, wz + 1, B.GLASS); W.fill(160, 41, wz, 160, 42, wz + 1, B.GLASS); }
      // flat yellow roof with honeycomb parapet + corner lanterns
      W.fill(138, 45, 65, 160, 45, 85, B.CONCRETE_YELLOW);
      for (let x = 138; x <= 160; x++) { W.slab(x, 46, 65, 'HONEYCOMB_BLOCK', false); W.slab(x, 46, 85, 'HONEYCOMB_BLOCK', false); }
      for (let z = 66; z <= 84; z++) { W.slab(138, 46, z, 'HONEYCOMB_BLOCK', false); W.slab(160, 46, z, 'HONEYCOMB_BLOCK', false); }
      for (const [px, pz] of [[138, 65], [160, 65], [138, 85], [160, 85]]) { W.set(px, 46, pz, B.OXIDIZED_CUT_COPPER); W.set(px, 47, pz, B.LANTERN); }
      // upper interior: lounge/office
      for (let x = 142; x <= 146; x++) for (let z = 68; z <= 72; z++)
        W.set(x, 40, z, ((x + z) & 1) ? B.CARPET_CYAN : B.CARPET_WHITE);
      W.fill(140, 40, 84, 144, 40, 84, B.BOOKSHELF);
      W.set(139, 40, 66, B.CHEST); W.set(139, 40, 68, B.BARREL); W.set(139, 41, 68, B.BARREL);
      W.table(148, 40, 74); W.chair(147, 40, 74, 'SPRUCE_PLANKS', 'E'); W.chair(149, 40, 74, 'SPRUCE_PLANKS', 'W');
      W.set(145, 40, 79, B.LANTERN); W.set(154, 40, 70, B.LANTERN);
      W.set(150, 42, 66, B.PAINTING2_N); W.set(139, 42, 78, B.PAINTING1_W);
      twall(141, 42, 66, 'S'); twall(157, 42, 84, 'N');
      // front dressing: sign + yellow wool banner stripes
      W.set(155, 36, 85, B.SIGN_WALL_N);
      W.fill(140, 35, 85, 140, 36, 85, B.WOOL_YELLOW);
      W.fill(151, 35, 85, 151, 36, 85, B.WOOL_YELLOW);
      W.set(144, 33, 85, B.POTTED_CORNFLOWER); W.set(148, 33, 85, B.POTTED_TULIP_WHITE);
    })();

    /* ======================= MARKET GATE (to plaza) ======================= */
    (function gate() {
      postCol(140, 115, 33, 40, 'OAK_LOG'); postCol(148, 115, 33, 40, 'OAK_LOG');
      W.fill(140, 40, 115, 148, 40, 115, B.OAK_LOG);            // crossbeam
      W.fill(141, 39, 115, 147, 39, 115, B.SPRUCE_PLANKS);      // fascia
      W.stair(139, 39, 115, 'OAK_PLANKS', 'E'); W.stair(149, 39, 115, 'OAK_PLANKS', 'W');
      // MARKET signboards facing the plaza + bell + lanterns
      W.set(143, 39, 116, B.SIGN_WALL_N); W.set(144, 39, 116, B.SIGN_WALL_N); W.set(145, 39, 116, B.SIGN_WALL_N);
      W.set(142, 38, 115, B.LANTERN_HANGING); W.set(146, 38, 115, B.LANTERN_HANGING);
      W.set(144, 38, 115, B.BELL);
      twall(140, 38, 116, 'S'); twall(148, 38, 116, 'S');
      // bulletin boards flanking the gate
      W.fill(138, 33, 115, 138, 34, 115, B.BULLETIN); W.fill(150, 33, 115, 150, 34, 115, B.BULLETIN);
      W.set(138, 35, 115, B.TORCH); W.set(150, 35, 115, B.TORCH);
    })();

    /* ==================== STREET DRESSING & FURNITURE ==================== */
    (function dressing() {
      // lantern chains strung across the lane between the shops
      for (const cx of [119, 137, 161]) {
        fenceCol(cx, 85, 33, 38, 'SPRUCE_PLANKS'); fenceCol(cx, 91, 33, 38, 'SPRUCE_PLANKS');
        for (let z = 86; z <= 90; z++) W.set(cx, 38, z, B.CHAIN);
        W.set(cx, 37, 88, B.LANTERN_HANGING);
      }
      // lamp posts at the lane ends and along the avenue
      W.lampPost(102, 33, 85); W.lampPost(102, 33, 91); W.lampPost(170, 33, 85); W.lampPost(170, 33, 91);
      W.lampPost(140, 33, 100); W.lampPost(148, 33, 100); W.lampPost(140, 33, 108); W.lampPost(148, 33, 108);
      // ground torches scattered along the lane
      for (let x = 106; x <= 166; x += 10) W.torch(x, 33, 86);
      for (let x = 111; x <= 166; x += 10) W.torch(x, 33, 90);
      // market clutter in the gaps between shops
      cratePile(118, 94); W.set(118, 33, 96, B.POTTED_POPPY);
      cratePile(117, 80); W.set(118, 33, 83, B.HAY_BALE); W.set(116, 33, 84, B.POTTED_TULIP_PINK);
      W.set(136, 33, 74, B.HAY_BALE); W.set(136, 33, 75, B.HAY_BALE); W.set(136, 34, 74, B.HAY_BALE);
      cratePile(136, 80); W.set(137, 33, 76, B.COMPOSTER); W.set(135, 33, 82, B.POTTED_OXEYE_DAISY);
      // community well (SE court): cobble ring, water, roof, chained cauldron
      W.walls(155, 33, 97, 157, 34, 99, B.COBBLESTONE);
      W.fill(156, 30, 98, 156, 30, 98, B.COBBLESTONE);
      W.fill(156, 31, 98, 156, 33, 98, B.WATER);
      for (const [fx, fz] of [[155, 97], [157, 97], [155, 99], [157, 99]]) fenceCol(fx, fz, 35, 36, 'SPRUCE_PLANKS');
      W.fill(155, 37, 97, 157, 37, 99, 0);
      for (let x = 155; x <= 157; x++) for (let z = 97; z <= 99; z++) W.slab(x, 37, z, 'SPRUCE_PLANKS', false);
      W.set(156, 36, 98, B.CHAIN); W.set(156, 35, 98, B.CHAIN); W.set(156, 34, 98, B.CAULDRON);
      W.torch(154, 33, 98); W.torch(158, 33, 98);
      // benches by the well
      W.slab(151, 33, 96, 'SMOOTH_STONE', false); W.slab(152, 33, 96, 'SMOOTH_STONE', false);
      W.slab(151, 33, 100, 'SMOOTH_STONE', false); W.slab(152, 33, 100, 'SMOOTH_STONE', false);
      // jukebox + note block corner with carpet dance floor
      for (let x = 164; x <= 169; x++) for (let z = 104; z <= 109; z++)
        W.set(x, 33, z, ((x + z) & 1) ? B.CARPET_RED : B.CARPET_YELLOW);
      W.set(163, 33, 106, B.JUKEBOX); W.set(163, 33, 107, B.NOTE_BLOCK);
      W.lampPost(163, 33, 104); W.lampPost(170, 33, 110);
      // flower bed strip on the east court edge
      W.fill(168, 32, 93, 170, 32, 95, B.COARSE_DIRT);
      W.set(168, 33, 93, B.TULIP_RED); W.set(169, 33, 93, B.ROSE_BUSH); W.set(170, 33, 93, B.CORNFLOWER);
      W.set(168, 33, 94, B.OXEYE_DAISY); W.set(169, 33, 94, B.TULIP_WHITE); W.set(170, 33, 94, B.ALLIUM);
      W.set(168, 33, 95, B.POPPY); W.set(169, 33, 95, B.DANDELION); W.set(170, 33, 95, B.TULIP_PINK);
      // SE court trees + planters
      W.tree(167, 33, 100, 'oak'); W.tree(152, 33, 111, 'birch');
      W.set(160, 33, 105, B.POTTED_AZALEA); W.set(150, 33, 104, B.SWEET_BERRY_BUSH);
      // SW backyard behind the general store
      W.set(105, 33, 107, B.COMPOSTER);
      W.set(108, 33, 109, B.HAY_BALE); W.set(108, 34, 109, B.HAY_BALE); W.set(109, 33, 109, B.HAY_BALE);
      W.tree(112, 33, 112, 'spruce');
      W.set(103, 33, 108, B.SWEET_BERRY_BUSH); W.set(104, 33, 108, B.SWEET_BERRY_BUSH);
      W.set(114, 33, 107, B.CAMPFIRE); W.lampPost(103, 33, 113);
      W.set(102, 33, 96, B.TALL_GRASS); W.set(101, 33, 103, B.FERN);
      // yards behind the north-side shops
      W.tree(108, 33, 63, 'oak'); W.tree(114, 33, 65, 'birch');
      W.set(106, 33, 68, B.HAY_BALE); W.set(107, 33, 68, B.HAY_BALE); W.set(106, 34, 68, B.HAY_BALE);
      W.tree(124, 33, 63, 'oak'); cratePile(130, 66); W.lampPost(120, 33, 68);
      W.tree(144, 33, 62, 'oak'); W.lampPost(150, 33, 63); W.set(154, 33, 62, B.BARREL); W.set(155, 33, 62, B.BARREL);
      // NE corner grove
      W.tree(165, 33, 66, 'spruce'); W.tree(168, 33, 78, 'oak');
      W.set(162, 33, 82, B.HAY_BALE); W.set(163, 33, 82, B.HAY_BALE); W.lampPost(164, 33, 84);
      W.set(161, 33, 70, B.MUSHROOM_RED); W.set(170, 33, 72, B.TALL_GRASS); W.set(163, 33, 74, B.FERN);
    })();

    /* ===================== FINAL MICRO-DETAIL PASS ===================== */
    (function extras() {
      // leafy window boxes under the general store front windows
      for (let x = 105; x <= 107; x++) W.set(x, 34, 92, (x & 1) ? B.AZALEA_LEAVES : B.FLOWERING_AZALEA_LEAVES);
      for (let x = 113; x <= 115; x++) W.set(x, 34, 92, (x & 1) ? B.FLOWERING_AZALEA_LEAVES : B.AZALEA_LEAVES);
      // lanterns hanging from the underside of the striped awning
      W.set(105, 37, 91, B.LANTERN_HANGING); W.set(115, 37, 91, B.LANTERN_HANGING);
      // art + extra stock inside the general store
      W.set(104, 36, 100, B.PAINTING2_W); W.set(116, 36, 99, B.PAINTING1_E);
      W.set(106, 34, 103, B.BARREL); W.set(115, 34, 96, B.BARREL);
      // ivy creeping up the smith's west wall + a mossy patch at its base
      W.fill(119, 35, 74, 119, 37, 74, B.VINE_E); W.fill(119, 35, 76, 119, 36, 76, B.VINE_E);
      W.set(119, 34, 79, B.VINE_E); W.set(119, 32, 75, B.MOSSY_COBBLESTONE);
      // smithing bench along the smith's back wall (beside the lava niche)
      W.slab(124, 34, 73, 'SMOOTH_STONE', true); W.slab(125, 34, 73, 'SMOOTH_STONE', true);
      W.set(126, 34, 73, B.BARREL); W.slab(131, 34, 73, 'SMOOTH_STONE', true);
      W.set(130, 34, 73, B.CHEST);
      // wheat patch behind the food stall
      W.fill(109, 32, 66, 112, 32, 67, B.COARSE_DIRT);
      for (let x = 109; x <= 112; x++) for (let z = 66; z <= 67; z++)
        W.set(x, 33, z, ((x + z) & 1) ? B.WHEAT : B.WHEAT_YOUNG);
      W.fencePost(108, 33, 66, 'OAK_PLANKS'); W.fencePost(113, 33, 67, 'OAK_PLANKS');
      // azalea bushes flanking the teal shop's big window
      W.set(142, 33, 85, B.AZALEA_LEAVES); W.set(150, 33, 85, B.FLOWERING_AZALEA_LEAVES);
      // vines softening the teal shop's oxidized side wall
      W.fill(138, 35, 73, 138, 37, 73, B.VINE_E); W.set(138, 35, 81, B.VINE_E); W.set(138, 36, 81, B.VINE_E);
      // stray market goods along the lane edges
      W.set(120, 33, 92, B.PUMPKIN); W.set(134, 33, 92, B.MELON);
      W.set(136, 33, 92, B.BARREL); W.set(137, 33, 92, B.HAY_BALE);
      W.set(160, 33, 92, B.BARREL); W.set(160, 34, 92, B.POTTED_TULIP_RED);
      // a couple more ground torches so the lane reads warm at night
      W.torch(119, 33, 92); W.torch(135, 33, 92); W.torch(149, 33, 93); W.torch(139, 33, 93);
    })();
  });
})();
