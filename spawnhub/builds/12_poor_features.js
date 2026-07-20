/* =========================================================================
 * 12_poor_features.js — P3 (FEATURES) of the POOR RESIDENTIAL COMPLEX
 * Lava fall on the rear (west, x=64) face; two floating quartz platforms
 * with chains + dark-oak bridges; rooftop clutter + chimney on C; an
 * exterior ladder. Aligned to the shell contract coordinates.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_features', 12, [52, 168, 100, 232], function (W, B) {
    'use strict';
    var XR = 64;                                    // rear wall plane (faces -X)

    /* ------------------------------------------------------------------ *
     * LAVA FALL — recessed groove on the rear face of A at z183.
     * Lava sits at x=63 (just outside the wall), framed by cobbled-deepslate
     * guard columns, spilling into a rimmed pool at grade. Only stone-family
     * blocks touch the lava.
     * ------------------------------------------------------------------ */
    (function lavaFall() {
      var z = 183;
      // guard frame columns either side of the fall
      W.fill(63, 34, z - 1, 63, 59, z - 1, B.COBBLED_DEEPSLATE);
      W.fill(63, 34, z + 1, 63, 59, z + 1, B.COBBLED_DEEPSLATE);
      W.fill(62, 34, z - 1, 62, 59, z - 1, B.DEEPSLATE_BRICKS);
      W.fill(62, 34, z + 1, 62, 59, z + 1, B.DEEPSLATE_BRICKS);
      // back plate so lava doesn't touch open air behind
      W.fill(62, 34, z, 62, 59, z, B.COBBLED_DEEPSLATE);
      // source notch at the top, fed from a small basin cut into the wall
      W.set(63, 59, z, B.COBBLED_DEEPSLATE);
      W.fill(63, 58, z, 63, 36, z, B.LAVA);           // the falling column
      // collecting pool at grade: rimmed basin west of the wall
      W.fill(60, 31, 180, 63, 31, 186, B.STONE_BRICKS);          // basin floor
      W.walls(60, 32, 180, 63, 33, 186, B.DEEPSLATE_BRICKS);     // rim
      W.fill(61, 32, 181, 62, 32, 185, B.LAVA);                  // pooled lava
      W.set(63, 35, z, B.COBBLED_DEEPSLATE);                     // splash guard lip
      // a few cobbled-deepslate steps down the channel edge
      W.stair(63, 32, 180, 'COBBLED_DEEPSLATE', 'S');
      W.stair(63, 32, 186, 'COBBLED_DEEPSLATE', 'N');
    })();

    /* ------------------------------------------------------------------ *
     * FLOATING PLATFORMS — two 5x5 quartz decks west of the tower, chains
     * rising to hanging lanterns, dark-oak bridges into carved doorways.
     * ------------------------------------------------------------------ */
    function platform(cx, cz, y, connectZ, connectTopSection) {
      var x0 = cx - 2, x1 = cx + 2, z0 = cz - 2, z1 = cz + 2;
      // deck (quartz with a stone-brick rim)
      W.fill(x0, y, z0, x1, y, z1, B.QUARTZ_BLOCK);
      for (var e = x0; e <= x1; e++) { W.slab(e, y + 1, z0, 'SMOOTH_QUARTZ'); W.slab(e, y + 1, z1, 'SMOOTH_QUARTZ'); }
      for (var e2 = z0; e2 <= z1; e2++) { W.slab(x0, y + 1, e2, 'SMOOTH_QUARTZ'); W.slab(x1, y + 1, e2, 'SMOOTH_QUARTZ'); }
      // chains rising from the four corners to hanging lanterns
      var corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
      for (var c = 0; c < corners.length; c++) {
        for (var cy = 1; cy <= 5; cy++) W.set(corners[c][0], y + cy, corners[c][1], B.CHAIN);
        W.set(corners[c][0], y + 6, corners[c][1], B.LANTERN_HANGING);
      }
      // a bit of life on the deck
      W.set(cx, y + 1, cz, B.POTTED_AZALEA);
      W.set(x0 + 1, y + 1, z0 + 1, B.LANTERN);
      // bridge east from the deck edge into the tower wall (2 wide)
      for (var bx = x1 + 1; bx <= XR; bx++) {
        W.set(bx, y, connectZ, B.DARK_OAK_PLANKS);
        W.set(bx, y, connectZ + 1, B.DARK_OAK_PLANKS);
        W.fencePost(bx, y + 1, connectZ - 1 + 0, 'DARK_OAK_PLANKS');
      }
      // railings along the bridge
      for (var rx = x1 + 1; rx <= XR - 1; rx++) {
        W.fencePost(rx, y + 1, connectZ - 1, 'DARK_OAK_PLANKS');
        W.fencePost(rx, y + 1, connectZ + 2, 'DARK_OAK_PLANKS');
      }
      // carve a clean 2-high doorway through the rear wall so the bridge enters
      W.clear(XR, y, connectZ, XR, y + 1, connectZ + 1);
    }
    platform(58, 182, 56, 181, 'A');   // upper deck -> section A
    platform(58, 194, 50, 193, 'B');   // lower deck -> section B

    /* ------------------------------------------------------------------ *
     * ROOFTOP CLUTTER on section C (roof deck y53, parapet y54).
     * A spruce shack, a blackstone chimney with a campfire, clotheslines,
     * spare barrels + hay, a couple of uneven parapet accents.
     * ------------------------------------------------------------------ */
    (function rooftop() {
      // spruce shack (x67..71, z201..205), floor already the roof at y53
      W.walls(67, 54, 201, 71, 56, 205, B.SPRUCE_PLANKS);
      W.fill(67, 57, 201, 71, 57, 205, B.SPRUCE_PLANKS);      // flat roof
      W.clear(69, 54, 201, 69, 55, 201);                      // doorway
      W.door(69, 54, 201, 'SPRUCE_DOOR', 'N');
      W.set(68, 55, 205, B.GLASS_PANE);                       // little window
      W.set(70, 55, 205, B.GLASS_PANE);
      W.set(68, 54, 204, B.BARREL);
      W.set(70, 54, 204, B.CHEST);
      W.set(69, 54, 203, B.LANTERN);                          // interior light

      // blackstone chimney with a recessed campfire (smoke)
      W.fill(80, 54, 209, 81, 57, 210, B.BLACKSTONE);
      W.clear(80, 55, 209, 80, 57, 209);                      // flue
      W.set(80, 57, 209, B.CAMPFIRE);                         // smoke source at top

      // clotheslines: fence posts + chains strung between
      W.fencePost(74, 54, 208, 'SPRUCE_PLANKS');
      W.fencePost(74, 55, 208, 'SPRUCE_PLANKS');
      W.fencePost(78, 54, 208, 'SPRUCE_PLANKS');
      W.fencePost(78, 55, 208, 'SPRUCE_PLANKS');
      for (var cz = 209; cz <= 211; cz++) { /* keep in-bounds */ }
      W.set(75, 55, 208, B.CHAIN); W.set(76, 55, 208, B.CHAIN); W.set(77, 55, 208, B.CHAIN);
      W.set(75, 54, 208, B.WOOL_WHITE); W.set(77, 54, 208, B.WOOL_LIGHTBLUE);

      // spare barrels + hay + uneven parapet accents
      W.set(84, 54, 200, B.HAY_BALE);
      W.set(84, 55, 200, B.HAY_BALE);
      W.set(85, 54, 200, B.BARREL);
      W.slab(70, 55, 214, 'DEEPSLATE_BRICKS', true);
      W.set(66, 55, 205, B.LANTERN);
    })();

    /* ------------------------------------------------------------------ *
     * EXTERIOR LADDER — up the rear (west) face of C to the roof, plus a
     * roof-access gap through the deck.
     * ------------------------------------------------------------------ */
    (function ladder() {
      var x = 63, z = 200;
      for (var y = 33; y <= 53; y++) W.set(x, y, z, B.LADDER_E); // wall to east (x=64)
      // small platform + railings at the top so you can step onto the roof
      W.clear(XR, 53, z, XR, 54, z);                            // gap through wall/deck
      W.set(XR, 53, z, B.SPRUCE_PLANKS);
      W.fencePost(XR, 54, z - 1, 'SPRUCE_PLANKS');
      W.fencePost(XR, 54, z + 1, 'SPRUCE_PLANKS');
      W.set(63, 54, z, B.LANTERN);
    })();
  });
})();
