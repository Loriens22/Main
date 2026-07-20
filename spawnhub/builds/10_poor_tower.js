/* =========================================================================
 * POOR RESIDENTIAL TOWER — humble 7-floor deepslate apartment block
 * Plot (52,168)-(100,232). Tower footprint x62..86(87), z182..204.
 * Ground floor y=33, storeys every 5 blocks, roof deck y=68.
 * Features: mixed "patched" masonry, lava fall in a south groove, red drip,
 * balconies, floating quartz platforms w/ chain supports, brick awning,
 * furnished apartments, basement storage, rooftop shack + clotheslines.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_tower', 10, [52, 168, 100, 232], function (W, B) {

    /* ---------------- geometry constants ---------------- */
    const F = k => 33 + 5 * k;            // floor slab y of storey k (0..6)
    const X2 = k => (k >= 4 ? 87 : 86);   // east wall x (upper floors overhang)
    const Z1 = k => (k >= 5 ? 181 : 182); // north wall z (top floors overhang)
    const TX1 = 62, TZ2 = 204;            // west wall x, south wall z (constant)
    const ROOF = 68;

    /* ---------------- deterministic positional hash ---------------- */
    function h3(x, y, z) {
      let n = (x * 374761393 + y * 668265263 + z * 2246822519) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }

    /* ---------------- material pickers ---------------- */
    function wallMat(x, y, z) {
      if (y <= 36) { // weathered base course
        const r2 = h3(x + 7, y, z);
        if (r2 < 0.12) return B.MOSSY_STONE_BRICKS;
        if (r2 < 0.20) return B.CRACKED_STONE_BRICKS;
        if (r2 < 0.28) return B.MOSSY_COBBLESTONE;
      }
      const r = h3(x, y, z);
      if (r < 0.40) return B.DEEPSLATE_BRICKS;
      if (r < 0.60) return B.DEEPSLATE_TILES;
      if (r < 0.75) return B.COBBLED_DEEPSLATE;
      if (r < 0.86) return B.STONE_BRICKS;
      if (r < 0.94) return B.COBBLESTONE;
      return B.ANDESITE;
    }
    function groundMat(x, z) {
      const r = h3(x, 33, z);
      return r < 0.5 ? B.DEEPSLATE_TILES : r < 0.8 ? B.POLISHED_ANDESITE : B.COBBLED_DEEPSLATE;
    }
    function roofMat(x, z) {
      const r = h3(x, ROOF, z);
      return r < 0.55 ? B.DEEPSLATE_TILES : r < 0.8 ? B.DEEPSLATE_BRICKS : B.COBBLED_DEEPSLATE;
    }
    function partMat(x, y, z) {
      const r = h3(x, y, z + 31);
      return r < 0.5 ? B.SPRUCE_PLANKS : r < 0.8 ? B.STONE_BRICKS : B.COBBLESTONE;
    }

    /* =========================================================
     * 1. FACADE WALLS (perimeter, y 33..67, per-storey extents)
     * ========================================================= */
    for (let y = 33; y <= 67; y++) {
      const k = Math.min(6, Math.floor((y - 33) / 5));
      const x2 = X2(k), z1 = Z1(k);
      for (let x = TX1; x <= x2; x++) {
        W.set(x, y, z1, wallMat(x, y, z1));
        W.set(x, y, TZ2, wallMat(x, y, TZ2));
      }
      for (let z = z1; z <= TZ2; z++) {
        W.set(TX1, y, z, wallMat(TX1, y, z));
        W.set(x2, y, z, wallMat(x2, y, z));
      }
    }
    // corbels supporting the overhangs (upside-down stairs)
    for (let z = 184; z <= 202; z += 3) W.stair(87, 52, z, 'COBBLED_DEEPSLATE', 'W', true);
    for (let x = 64; x <= 84; x += 3) W.stair(x, 57, 181, 'COBBLED_DEEPSLATE', 'S', true);

    // visible "patch repairs" — small rects of mismatched material
    W.fill(66, 44, 182, 69, 46, 182, B.COBBLESTONE);
    W.fill(80, 55, 182, 83, 57, 182, B.STONE_BRICKS);
    W.fill(72, 40, 204, 75, 43, 204, B.ANDESITE);
    W.fill(63, 50, 204, 65, 52, 204, B.COBBLESTONE);
    W.fill(62, 45, 194, 62, 48, 197, B.STONE_BRICKS);
    W.fill(86, 39, 188, 86, 41, 191, B.ANDESITE);
    W.fill(87, 60, 193, 87, 62, 196, B.COBBLESTONE);

    /* =========================================================
     * 2. FLOOR SLABS + INTERIOR CLEAR
     * ========================================================= */
    for (let k = 0; k <= 6; k++) {
      const y = F(k), x2 = X2(k), z1 = Z1(k);
      if (k === 0) {
        for (let z = 183; z <= 203; z++) for (let x = 63; x <= 85; x++) W.set(x, y, z, groundMat(x, z));
      } else {
        W.fill(63, y, z1 + 1, x2 - 1, y, 203, k % 2 ? B.OAK_PLANKS : B.SPRUCE_PLANKS);
      }
      W.clear(63, y + 1, z1 + 1, x2 - 1, y + 4, 203);
    }
    // roof deck
    for (let z = 181; z <= 204; z++) for (let x = 62; x <= 87; x++) W.set(x, ROOF, z, roofMat(x, z));

    /* =========================================================
     * 3. WINDOWS — irregular, panes + purple accents, shutters,
     *    window boxes, interior wool pelmets
     * ========================================================= */
    const PELMET = ['WOOL_RED', 'WOOL_ORANGE', 'WOOL_CYAN', 'WOOL_LIME', 'WOOL_PURPLE', 'WOOL_YELLOW', 'WOOL_RED'];
    // [face, storey, start(x or z), width, flags: p=purple s=shutters b=window box]
    const WIN = [
      ['N', 0, 65, 2, ''], ['N', 0, 69, 2, ''], ['N', 0, 79, 2, 's'], ['N', 0, 82, 2, ''],
      ['N', 1, 73, 2, ''], ['N', 1, 77, 2, 's'], ['N', 1, 81, 3, ''],
      ['N', 2, 64, 2, ''], ['N', 2, 69, 2, 'p'], ['N', 2, 75, 2, 'b'], ['N', 2, 80, 2, ''],
      ['N', 3, 64, 3, ''], ['N', 3, 70, 2, ''], ['N', 3, 84, 1, ''],
      ['N', 4, 65, 2, ''], ['N', 4, 72, 2, 'b'], ['N', 4, 78, 2, 'p'], ['N', 4, 83, 2, ''],
      ['N', 5, 64, 2, ''], ['N', 5, 70, 2, ''], ['N', 5, 76, 2, 's'], ['N', 5, 82, 3, ''],
      ['N', 6, 66, 3, ''], ['N', 6, 74, 2, 'p'], ['N', 6, 80, 2, ''], ['N', 6, 85, 2, ''],
      ['S', 0, 71, 2, ''], ['S', 0, 76, 2, ''], ['S', 0, 82, 3, ''],
      ['S', 1, 64, 2, ''], ['S', 1, 70, 2, 'b'], ['S', 1, 76, 2, 'p'], ['S', 1, 84, 2, ''],
      ['S', 2, 66, 3, ''], ['S', 2, 72, 2, ''], ['S', 2, 83, 2, 's'],
      ['S', 3, 64, 2, 'p'], ['S', 3, 70, 3, ''], ['S', 3, 77, 1, ''], ['S', 3, 84, 2, ''],
      ['S', 4, 66, 2, ''], ['S', 4, 74, 2, 'b'], ['S', 4, 83, 3, ''],
      ['S', 5, 64, 3, ''], ['S', 5, 71, 2, ''], ['S', 5, 77, 2, ''], ['S', 5, 84, 2, ''],
      ['S', 6, 67, 2, ''], ['S', 6, 73, 2, 'p'], ['S', 6, 77, 2, ''], ['S', 6, 83, 2, 's'],
      ['W', 0, 186, 2, ''], ['W', 0, 195, 2, ''], ['W', 0, 200, 2, ''],
      ['W', 1, 184, 2, ''], ['W', 1, 190, 2, 'p'], ['W', 1, 197, 2, ''],
      ['W', 2, 185, 2, ''], ['W', 2, 196, 2, ''], ['W', 2, 201, 2, 's'],
      ['W', 3, 184, 2, ''], ['W', 3, 190, 3, ''], ['W', 3, 199, 2, ''],
      ['W', 4, 184, 2, ''], ['W', 4, 195, 2, 'p'], ['W', 4, 201, 2, ''],
      ['W', 5, 184, 2, ''], ['W', 5, 191, 2, ''], ['W', 5, 200, 2, ''],
      ['W', 6, 185, 2, ''], ['W', 6, 191, 2, ''], ['W', 6, 202, 2, ''],
      ['E', 0, 189, 2, ''], ['E', 0, 194, 3, ''], ['E', 0, 200, 2, ''],
      ['E', 1, 185, 2, ''], ['E', 1, 191, 2, ''], ['E', 1, 198, 2, 'p'],
      ['E', 2, 184, 2, ''], ['E', 2, 192, 2, ''], ['E', 2, 201, 2, ''],
      ['E', 3, 184, 2, 's'], ['E', 3, 190, 2, ''], ['E', 3, 196, 2, ''], ['E', 3, 202, 2, ''],
      ['E', 4, 191, 2, ''], ['E', 4, 197, 2, ''], ['E', 4, 202, 2, ''],
      ['E', 5, 184, 2, ''], ['E', 5, 195, 2, 'p'], ['E', 5, 201, 2, ''],
      ['E', 6, 183, 2, ''], ['E', 6, 189, 2, ''], ['E', 6, 194, 2, ''], ['E', 6, 200, 3, ''],
    ];
    function placeWindow(face, k, c, w, flags) {
      const y0 = F(k) + 2, y1 = F(k) + 3;
      const pane = flags.includes('p') ? B.PANE_PURPLE : B.GLASS_PANE;
      // resolve wall plane + exterior/interior offsets
      let wx = 0, wz = 0, ex = 0, ez = 0, ix = 0, iz = 0, alongX = true;
      if (face === 'N') { wz = Z1(k); ez = wz - 1; iz = wz + 1; }
      else if (face === 'S') { wz = TZ2; ez = wz + 1; iz = wz - 1; }
      else if (face === 'W') { wx = TX1; ex = wx - 1; ix = wx + 1; alongX = false; }
      else { wx = X2(k); ex = wx + 1; ix = wx - 1; alongX = false; }
      for (let i = 0; i < w; i++) {
        const x = alongX ? c + i : wx, z = alongX ? wz : c + i;
        W.set(x, y0, z, pane); W.set(x, y1, z, pane);
        if (k >= 1) { // wool pelmet above window, interior side
          const px = alongX ? x : ix, pz = alongX ? iz : z;
          W.set(px, F(k) + 4, pz, B[PELMET[k]]);
        }
        if (flags.includes('b')) { // window box: slab sill + flower
          const bx = alongX ? x : ex, bz = alongX ? ez : z;
          W.slab(bx, F(k) + 1, bz, 'SPRUCE_PLANKS', true);
          if (i === 0) W.set(bx, y0, bz, B.TULIP_RED);
        }
      }
      if (flags.includes('s')) { // spruce trapdoor shutters flanking
        for (const side of [c - 1, c + w]) for (const y of [y0, y1]) {
          const x = alongX ? side : ex, z = alongX ? ez : side;
          W.set(x, y, z, B.TRAPDOOR_T);
        }
      }
    }
    for (const [f, k, c, w, fl] of WIN) placeWindow(f, k, c, w, fl);

    /* =========================================================
     * 4. INTERIOR PARTITIONS, STAIR CORE, DOORS
     * ========================================================= */
    for (let k = 1; k <= 5; k++) { // corridor wall z=187 + apartment divider x=74
      const y = F(k), x2i = X2(k) - 1;
      for (let yy = y + 1; yy <= y + 4; yy++) {
        for (let x = 63; x <= x2i; x++) W.set(x, yy, 187, partMat(x, yy, 187));
        for (let z = 188; z <= 203; z++) W.set(74, yy, z, partMat(74, yy, z));
      }
      W.door(68, y + 1, 187, 'OAK_DOOR', 'S');
      W.door(79, y + 1, 187, 'OAK_DOOR', 'S');
    }
    // switchback stair core at z=184, x63..68, connecting all 7 floors
    for (let k = 0; k <= 5; k++) {
      const y = F(k), even = k % 2 === 0;
      for (let i = 0; i < 4; i++) {
        const x = even ? 64 + i : 67 - i;
        W.stair(x, y + 1 + i, 184, 'COBBLESTONE', even ? 'E' : 'W');
        if (i > 0) W.fill(x, y + 1, 184, x, y + i, 184, B.COBBLESTONE); // solid under-fill
      }
      // hole in the floor above (keep the arrival cell solid)
      if (even) W.clear(63, y + 5, 184, 67, y + 5, 184);
      else W.clear(64, y + 5, 184, 68, y + 5, 184);
    }
    for (let k = 0; k <= 6; k++) W.set(65, F(k) + 3, 183, B.TORCH_WALL_N); // stairwell torches
    for (let k = 1; k <= 6; k++) // guard rail beside the stair hole
      for (let x = 64; x <= 67; x++) W.set(x, F(k) + 1, 185, B.fence('SPRUCE_PLANKS'));

    // exterior doors
    W.door(74, 34, 182, 'OAK_DOOR', 'N');    // main entrance (plaza side)
    W.door(67, 34, 204, 'SPRUCE_DOOR', 'S'); // back door to the yard
    for (let x = 73; x <= 75; x++) W.stair(x, 33, 181, 'COBBLESTONE', 'S'); // stoop
    W.stair(67, 33, 205, 'COBBLESTONE', 'N');

    /* =========================================================
     * 5. BALCONIES (floors 2-6, varied positions)
     * ========================================================= */
    function balcN(k, x1, x2, doorX) {
      const y = F(k);
      for (let x = x1; x <= x2; x++) for (let z = 180; z <= 181; z++) W.slab(x, y, z, 'OAK_PLANKS', true);
      for (let x = x1; x <= x2; x++) W.set(x, y + 1, 180, B.fence('OAK_PLANKS'));
      W.set(x1, y + 1, 181, B.fence('OAK_PLANKS')); W.set(x2, y + 1, 181, B.fence('OAK_PLANKS'));
      W.stair(x1 + 1, y - 1, 181, 'SPRUCE_PLANKS', 'S', true);
      W.stair(x2 - 1, y - 1, 181, 'SPRUCE_PLANKS', 'S', true);
      W.door(doorX, y + 1, 182, 'SPRUCE_DOOR', 'N');
      W.set(x2, y + 2, 180, B.LANTERN); // lantern on corner fence post
    }
    function balcE(k, z1, z2, doorZ) {
      const y = F(k), wx = X2(k), b1 = wx + 1, b2 = wx + 2;
      for (let z = z1; z <= z2; z++) for (let x = b1; x <= b2; x++) W.slab(x, y, z, 'OAK_PLANKS', true);
      for (let z = z1; z <= z2; z++) W.set(b2, y + 1, z, B.fence('OAK_PLANKS'));
      W.set(b1, y + 1, z1, B.fence('OAK_PLANKS')); W.set(b1, y + 1, z2, B.fence('OAK_PLANKS'));
      W.stair(b1, y - 1, z1, 'SPRUCE_PLANKS', 'W', true);
      W.stair(b1, y - 1, z2, 'SPRUCE_PLANKS', 'W', true);
      W.door(wx, y + 1, doorZ, 'SPRUCE_DOOR', 'E');
      return [b1, b2, y];
    }
    balcN(1, 66, 70, 68);
    balcN(3, 76, 80, 78);
    W.set(76, 49, 180, B.POTTED_TULIP_RED); W.set(80, 49, 180, B.POTTED_FERN);
    let bE;
    bE = balcE(2, 196, 199, 197); W.set(bE[0], bE[2] + 1, 198, B.CHEST); W.set(bE[1], bE[2] + 2, 196, B.LANTERN);
    bE = balcE(4, 185, 187, 186); W.set(bE[0], bE[2] + 1, 185, B.POTTED_AZALEA); W.set(bE[1], bE[2] + 2, 187, B.LANTERN);
    bE = balcE(5, 189, 191, 190); W.set(bE[0], bE[2] + 1, 191, B.POTTED_TULIP_PINK);

    // red "drip" — concrete-red fence run hanging off the floor-6 balcony
    for (let y = 46; y <= 57; y++) W.set(88, y, 190, B.fence('CONCRETE_RED'));
    W.set(88, 53, 190, B.WOOL_RED); W.set(88, 49, 190, B.WOOL_RED);
    W.set(88, 33, 190, B.WOOL_RED); W.set(87, 33, 191, B.WOOL_RED); // splash at the base

    /* =========================================================
     * 6. LAVA FALL — recessed groove on the south facade (x=80)
     * ========================================================= */
    W.fill(80, 34, 203, 80, 67, 203, B.COBBLED_DEEPSLATE);      // interior seal
    W.fill(80, 34, 204, 80, 67, 204, B.LAVA);                    // the fall itself
    W.fill(79, 33, 205, 79, 68, 205, B.COBBLED_DEEPSLATE);       // flanking groove columns
    W.fill(81, 33, 205, 81, 68, 205, B.COBBLED_DEEPSLATE);
    W.fill(80, 32, 204, 80, 32, 206, B.COBBLED_DEEPSLATE);       // channel bed
    W.set(80, 33, 204, B.LAVA); W.set(80, 33, 205, B.LAVA); W.set(80, 33, 206, B.LAVA);
    W.set(79, 33, 206, B.COBBLED_DEEPSLATE); W.set(81, 33, 206, B.COBBLED_DEEPSLATE);
    W.set(80, 33, 207, B.COBBLED_DEEPSLATE);                     // collecting pool rim

    /* =========================================================
     * 7. BRICK AWNING over entrance, on cobblestone-wall posts
     * ========================================================= */
    W.fill(70, 37, 180, 78, 37, 181, B.BRICKS);
    for (let x = 70; x <= 78; x++) W.stair(x, 37, 179, 'BRICKS', 'S');
    for (const px of [71, 77]) for (let y = 33; y <= 36; y++) W.set(px, y, 179, B.wall('COBBLESTONE'));
    W.set(72, 36, 180, B.LANTERN_HANGING); W.set(76, 36, 180, B.LANTERN_HANGING);
    W.set(74, 36, 181, B.BELL);
    // entrance micro-details: frames, sign, wall torches
    W.set(72, 35, 181, B.FRAME_SWORD_S); W.set(76, 35, 181, B.FRAME_BOOK_S);
    W.set(75, 35, 181, B.SIGN_WALL_S);
    W.set(73, 36, 181, B.TORCH_WALL_S); W.set(77, 36, 181, B.TORCH_WALL_S);

    /* =========================================================
     * 8. GROUND FLOOR — communal lobby
     * ========================================================= */
    W.set(63, 34, 190, B.FURNACE); W.set(63, 34, 191, B.SMOKER); W.set(63, 34, 192, B.BLAST_FURNACE);
    W.set(63, 34, 194, B.CRAFTING_TABLE); W.set(64, 34, 194, B.CRAFTING_TABLE);
    W.set(63, 34, 188, B.CAULDRON);
    W.set(66, 34, 201, B.ANVIL);
    // library corner (visible through the south ground windows)
    W.fill(81, 34, 203, 84, 35, 203, B.BOOKSHELF);
    W.fill(80, 34, 199, 84, 34, 201, B.CARPET_RED);
    W.set(82, 34, 200, B.LECTERN);
    W.chair(82, 34, 199, 'SPRUCE_PLANKS', 'S');
    // tables + chairs
    W.table(70, 34, 196); W.chair(69, 34, 196, 'OAK_PLANKS', 'E'); W.chair(71, 34, 196, 'OAK_PLANKS', 'W');
    W.table(74, 34, 199); W.chair(74, 34, 198, 'OAK_PLANKS', 'S');
    // wall art + lighting
    W.set(72, 36, 183, B.PAINTING2_N); W.set(85, 36, 193, B.PAINTING1_E);
    W.set(63, 36, 197, B.FRAME_PICK_W);
    W.set(68, 37, 191, B.LANTERN_HANGING); W.set(76, 37, 187, B.LANTERN_HANGING); W.set(80, 37, 197, B.LANTERN_HANGING);
    W.set(67, 36, 203, B.TORCH_WALL_S); W.set(84, 36, 183, B.TORCH_WALL_N);

    /* =========================================================
     * 9. APARTMENTS — two per floor on storeys 1..5
     * ========================================================= */
    const BEDC = ['RED', 'CYAN', 'YELLOW', 'LIME', 'PURPLE', 'ORANGE', 'BLUE', 'PINK', 'GREEN', 'WHITE'];
    const RUGC = ['CARPET_RED', 'CARPET_CYAN', 'CARPET_YELLOW', 'CARPET_LIME', 'CARPET_PURPLE', 'CARPET_ORANGE', 'CARPET_BLUE', 'CARPET_PINK', 'CARPET_GREEN', 'CARPET_WHITE'];
    const POTS = ['POTTED_TULIP_RED', 'POTTED_FERN', 'POTTED_POPPY', 'POTTED_CORNFLOWER', 'POTTED_DANDELION', 'POTTED_ALLIUM'];
    function apartment(k, side) { // side: 'W' (x63..73) or 'E' (x75..X2-1)
      const y = F(k) + 1, west = side === 'W';
      const xa = west ? 63 : 75, xb = west ? 73 : X2(k) - 1;
      const idx = (k * 2 + (west ? 0 : 1)) % 10;
      const bedX = west ? xa + 1 : xb - 1;
      W.bed(bedX, y, 203, BEDC[idx], 'N');
      W.set(bedX + (west ? 2 : -2), y, 203, B.CHEST);
      W.set(west ? 73 : 75, y, 190, B.FURNACE);
      // rug
      const cx = west ? 68 : Math.floor((xa + xb) / 2);
      W.fill(cx - 1, y, 194, cx + 1, y, 196, B[RUGC[(idx + 3) % 10]]);
      // table + chair for some apartments
      if (h3(k, west ? 1 : 2, 5) > 0.45) { W.table(cx, y, 199); W.chair(cx - 1, y, 199, 'OAK_PLANKS', 'E'); }
      // potted plant near the corridor wall
      W.set(west ? xa + 1 : xb - 1, y, 189, B[POTS[(k + (west ? 0 : 3)) % 6]]);
      // bookshelf pair (odd floors) or armor stand (even floors)
      if (k % 2 === 1) { const bx = west ? xa : xb; W.set(bx, y, 194, B.BOOKSHELF); W.set(bx, y + 1, 194, B.BOOKSHELF); }
      else W.set(west ? xa + 1 : xb - 1, y, 198, B.ARMOR_STAND);
      // wall art on the divider, alternating types
      if (west) W.set(73, y + 2, 192 + (k % 3), k % 2 ? B.PAINTING1_E : B.FRAME_MAP_E);
      else W.set(75, y + 2, 192 + (k % 3), k % 2 ? B.FRAME_POTION_W : B.PAINTING2_W);
      // lighting
      W.set(cx, y + 3, 196, B.LANTERN_HANGING);
      W.set(cx - 2, y + 2, 203, B.TORCH_WALL_S);
    }
    for (let k = 1; k <= 5; k++) {
      apartment(k, 'W'); apartment(k, 'E');
      // corridor: hanging lantern, runner carpet, a barrel at the east end
      W.set(76, F(k) + 4, 185, B.LANTERN_HANGING);
      for (let x = 70; x <= 80; x++) W.set(x, F(k) + 1, 186, B.CARPET_GRAY);
      W.set(X2(k) - 1, F(k) + 1, 183, B.BARREL);
    }

    /* ---------- storey 6: open attic loft ---------- */
    {
      const y = F(6) + 1; // 64
      W.bed(66, y, 203, 'PURPLE', 'N'); W.bed(84, y, 203, 'GREEN', 'N');
      W.set(68, y, 203, B.CHEST); W.set(82, y, 203, B.CHEST);
      W.fill(63, y, 195, 63, y + 1, 197, B.BOOKSHELF);
      W.set(75, y, 182, B.BREWING_STAND); W.set(77, y, 182, B.JUKEBOX);
      W.fill(73, y, 192, 77, y, 194, B.CARPET_PURPLE);
      W.set(85, y, 183, B.ARMOR_STAND);
      W.set(84, y, 188, B.POTTED_AZALEA);
      W.set(70, y + 3, 195, B.LANTERN_HANGING); W.set(80, y + 3, 189, B.LANTERN_HANGING);
      W.set(72, y + 2, 203, B.TORCH_WALL_S); W.set(80, y + 2, 182, B.TORCH_WALL_N);
      W.set(75, y + 2, 203, B.PAINTING2_S);
    }

    /* =========================================================
     * 10. ROOFTOP — parapet, shack, chimney, clotheslines
     * ========================================================= */
    for (let x = 62; x <= 87; x++) for (const z of [181, 204]) parapet(x, z);
    for (let z = 182; z <= 203; z++) for (const x of [62, 87]) parapet(x, z);
    function parapet(x, z) {
      if (x === 62 && z === 193) return; // ladder exit gap
      const corner = (x === 62 || x === 87) && (z === 181 || z === 204);
      if (corner) { W.fill(x, 69, z, x, 70, z, B.COBBLED_DEEPSLATE); W.set(x, 71, z, B.TORCH); return; }
      const r = h3(x, 69, z);
      if (r < 0.30) W.set(x, 69, z, B.wall('COBBLED_DEEPSLATE'));
      else if (r < 0.55) W.stair(x, 69, z, 'DEEPSLATE_BRICKS', x === 62 ? 'W' : x === 87 ? 'E' : z === 181 ? 'N' : 'S');
      else if (r < 0.8) W.slab(x, 69, z, 'DEEPSLATE_TILES');
      else W.set(x, 69, z, B.DEEPSLATE_BRICKS);
    }
    // rooftop shack
    W.walls(64, 69, 183, 69, 71, 187, B.SPRUCE_PLANKS);
    W.clear(66, 69, 187, 67, 70, 187); // door gap
    W.set(69, 70, 185, B.GLASS_PANE);
    for (let z = 183; z <= 187; z++) for (let x = 64; x <= 69; x++) W.slab(x, 72, z, 'SPRUCE_PLANKS');
    W.set(66, 71, 185, B.LANTERN_HANGING); W.set(65, 69, 184, B.BARREL); W.set(68, 69, 184, B.CHEST);
    // chimney with a campfire on top (smoke!)
    W.fill(83, 69, 200, 83, 70, 200, B.BRICKS); W.set(83, 71, 200, B.CAMPFIRE);
    // rooftop campfire corner + hay seat
    W.set(72, 69, 190, B.CAMPFIRE); W.set(73, 69, 190, B.HAY_BALE);
    W.stair(71, 69, 191, 'OAK_PLANKS', 'N');
    // clotheslines: fence posts + chain span
    for (const px of [73, 78]) { W.set(px, 69, 197, B.fence('SPRUCE_PLANKS')); W.set(px, 70, 197, B.fence('SPRUCE_PLANKS')); }
    for (let x = 74; x <= 77; x++) W.set(x, 70, 197, B.CHAIN);
    W.set(80, 69, 184, B.POTTED_CACTUS);

    /* =========================================================
     * 11. FLOATING QUARTZ PLATFORMS + DARK OAK BRIDGES + CHAINS
     * ========================================================= */
    function platform(x1, z1, y) { // 5x5, smooth quartz border, quartz core
      for (let z = z1; z <= z1 + 4; z++) for (let x = x1; x <= x1 + 4; x++) {
        const border = x === x1 || x === x1 + 4 || z === z1 || z === z1 + 4;
        W.set(x, y, z, border ? B.SMOOTH_QUARTZ : B.QUARTZ_BLOCK);
      }
      for (const [cx, cz] of [[x1, z1], [x1 + 4, z1], [x1, z1 + 4], [x1 + 4, z1 + 4]]) {
        for (let yy = y + 1; yy <= y + 7; yy++) W.set(cx, yy, cz, B.CHAIN);
        W.slab(cx, y + 8, cz, 'SMOOTH_QUARTZ');
      }
    }
    // platform A — connects to storey 5 (floor y=58)
    platform(53, 186, 58);
    for (let x = 53; x <= 57; x++) { if (x !== 57) W.set(x, 59, 186, B.fence('QUARTZ_BLOCK')); W.set(x, 59, 190, B.fence('QUARTZ_BLOCK')); }
    for (let z = 187; z <= 189; z++) { W.set(53, 59, z, B.fence('QUARTZ_BLOCK')); if (z !== 188) W.set(57, 59, z, B.fence('QUARTZ_BLOCK')); }
    W.set(55, 59, 187, B.LANTERN); W.set(54, 59, 189, B.POTTED_AZALEA);
    for (let x = 58; x <= 61; x++) { // bridge
      W.set(x, 58, 188, B.DARK_OAK_PLANKS);
      W.set(x, 59, 187, B.fence('DARK_OAK_PLANKS')); W.set(x, 59, 189, B.fence('DARK_OAK_PLANKS'));
    }
    W.clear(62, 59, 188, 62, 60, 188); // doorway in the west wall
    // platform B — connects to storey 6 (floor y=63)
    platform(54, 196, 63);
    for (let x = 54; x <= 58; x++) { W.set(x, 64, 196, B.fence('QUARTZ_BLOCK')); if (x !== 58) W.set(x, 64, 200, B.fence('QUARTZ_BLOCK')); }
    for (let z = 197; z <= 199; z++) { W.set(54, 64, z, B.fence('QUARTZ_BLOCK')); if (z !== 198) W.set(58, 64, z, B.fence('QUARTZ_BLOCK')); }
    W.lampPost(56, 64, 197); W.set(55, 64, 199, B.CHEST); W.set(57, 64, 199, B.POTTED_TULIP_WHITE);
    for (let x = 59; x <= 61; x++) {
      W.set(x, 63, 198, B.DARK_OAK_PLANKS);
      W.set(x, 64, 197, B.fence('DARK_OAK_PLANKS')); W.set(x, 64, 199, B.fence('DARK_OAK_PLANKS'));
    }
    W.clear(62, 64, 198, 62, 65, 198);

    // exterior ladder run to the rooftop (west wall)
    for (let y = 34; y <= 68; y++) W.set(61, y, 193, B.LADDER_E);

    /* =========================================================
     * 12. BASEMENT — dug storage under the tower (y 27..32)
     * ========================================================= */
    W.fill(63, 27, 183, 85, 27, 203, B.COBBLED_DEEPSLATE);
    W.walls(63, 28, 183, 85, 32, 203, B.COBBLED_DEEPSLATE);
    W.clear(64, 28, 184, 84, 32, 202);
    // stairs down from the lobby (hole at x=64, z196..200)
    W.clear(64, 33, 196, 64, 33, 200);
    for (let i = 0; i < 5; i++) W.stair(64, 32 - i, 196 + i, 'COBBLESTONE', 'N');
    for (let z = 196; z <= 200; z++) W.set(65, 34, z, B.fence('SPRUCE_PLANKS'));
    W.set(64, 34, 201, B.fence('SPRUCE_PLANKS'));
    // storage rows
    for (let x = 66; x <= 82; x += 2) { W.set(x, 28, 184, B.BARREL); if (h3(x, 1, 1) > 0.5) W.set(x, 29, 184, B.BARREL); }
    for (let x = 68; x <= 80; x += 3) W.set(x, 28, 202, B.CHEST);
    W.set(71, 29, 202, B.CHEST);
    W.set(84, 28, 195, B.BARREL); W.set(84, 28, 196, B.BARREL); W.set(84, 29, 195, B.BARREL);
    // dim, webby atmosphere
    W.set(65, 32, 185, B.COBWEB); W.set(83, 32, 185, B.COBWEB); W.set(83, 31, 201, B.COBWEB); W.set(66, 32, 201, B.COBWEB);
    W.set(67, 28, 193, B.MUSHROOM_BROWN); W.set(78, 28, 189, B.MUSHROOM_BROWN); W.set(73, 28, 198, B.MUSHROOM_BROWN);
    W.set(70, 32, 190, B.SOUL_LANTERN_HANGING); W.set(78, 32, 196, B.SOUL_LANTERN_HANGING); W.set(67, 32, 199, B.SOUL_LANTERN_HANGING);
    W.set(84, 28, 190, B.SOUL_LANTERN);
    W.set(64, 30, 201, B.TORCH_WALL_W);

    /* =========================================================
     * 13. YARD — pen, cow, campfire, crates, lamps, greenery
     * ========================================================= */
    // animal pen (south side) with a gate gap
    for (let x = 66; x <= 76; x++) for (const z of [212, 218]) W.set(x, 33, z, B.fence('SPRUCE_PLANKS'));
    for (let z = 213; z <= 217; z++) for (const x of [66, 76]) W.set(x, 33, z, B.fence('SPRUCE_PLANKS'));
    W.clear(70, 33, 212, 71, 33, 212); // gate gap
    W.set(66, 34, 212, B.TORCH); W.set(76, 34, 218, B.TORCH);
    W.set(67, 33, 216, B.HAY_BALE); W.set(68, 33, 216, B.HAY_BALE);
    W.set(75, 33, 213, B.COMPOSTER); W.set(75, 33, 216, B.CAULDRON);
    // cow statue: 2 fence legs, wool body + white patch, neck, head
    W.set(71, 33, 215, B.fence('SPRUCE_PLANKS')); W.set(72, 33, 215, B.fence('SPRUCE_PLANKS'));
    W.set(71, 34, 215, B.WOOL_WHITE); W.set(72, 34, 215, B.WOOL_BROWN);
    W.set(73, 34, 215, B.WOOL_BROWN); W.set(73, 35, 215, B.WOOL_BROWN);
    // campfire + hay stack outside the pen
    W.set(79, 33, 213, B.CAMPFIRE);
    W.set(80, 33, 213, B.HAY_BALE); W.set(80, 34, 213, B.HAY_BALE); W.set(81, 33, 214, B.HAY_BALE);
    W.set(73, 33, 211, B.SIGN);
    // stacked chests + barrels by the entrance
    W.set(79, 33, 180, B.CHEST); W.set(79, 34, 180, B.CHEST);
    W.set(80, 33, 180, B.BARREL); W.set(81, 33, 180, B.BARREL); W.set(80, 34, 180, B.BARREL);
    // lamp posts + loose torches around the plot
    W.lampPost(60, 33, 176); W.lampPost(90, 33, 186); W.lampPost(78, 33, 224); W.lampPost(56, 33, 206);
    W.torch(60, 33, 215); W.torch(88, 33, 210); W.torch(92, 33, 196); W.torch(64, 33, 226);
    W.tree(56, 33, 214, 'spruce');
    // hanging wall lanterns on chains
    W.set(61, 45, 186, B.CHAIN); W.set(61, 44, 186, B.LANTERN_HANGING);
    W.set(75, 46, 205, B.CHAIN); W.set(75, 45, 205, B.LANTERN_HANGING);
    W.set(87, 44, 194, B.CHAIN); W.set(87, 43, 194, B.LANTERN_HANGING);
    // wall torches on the facade
    W.set(65, 36, 181, B.TORCH_WALL_S); W.set(84, 36, 181, B.TORCH_WALL_S);
    W.set(61, 36, 187, B.TORCH_WALL_E); W.set(61, 36, 200, B.TORCH_WALL_E);
    W.set(87, 36, 187, B.TORCH_WALL_W); W.set(87, 36, 203, B.TORCH_WALL_W);
    // vines breaking up flat faces
    const VINES = [
      [63, 40, 205, 'N', 3], [68, 46, 205, 'N', 2], [74, 52, 205, 'N', 2], [85, 44, 205, 'N', 2],
      [61, 42, 190, 'E', 3], [61, 50, 202, 'E', 2], [61, 39, 184, 'E', 2],
      [87, 44, 187, 'W', 2], [87, 40, 200, 'W', 2],
      [63, 42, 181, 'S', 2], [84, 39, 181, 'S', 2],
    ];
    for (const [vx, vy, vz, vd, len] of VINES)
      for (let i = 0; i < len; i++) W.set(vx, vy - i, vz, B['VINE_' + vd]);
    // scattered grass tufts + flowers on the lawn
    for (let i = 0; i < 26; i++) {
      const gx = 54 + Math.floor(h3(i, 3, 7) * 44), gz = 170 + Math.floor(h3(i, 9, 2) * 60);
      if (gx >= 60 && gx <= 92 && gz >= 177 && gz <= 210) continue; // keep clear of tower + yard
      if (W.get(gx, 33, gz) !== 0) continue; // terrain (order 0) provides grass below
      const r = h3(i, 5, 5);
      W.set(gx, 33, gz, r < 0.55 ? B.TALL_GRASS : r < 0.75 ? B.FERN : r < 0.88 ? B.POPPY : B.OXEYE_DAISY);
    }
  });
})();
