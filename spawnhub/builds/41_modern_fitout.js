/* =========================================================================
 * 41_modern_fitout.js — MODERN MONOLITH entrance, lobby, core & interiors
 * Sits inside the shell (40_modern_shell.js). West front plane x=216.
 * Interior hollow is x217..226, z53..79. Plates at y41,45,49,53,57,61,65,
 * 69,73,77,81; ground/lobby y33..40. Core shaft hole x222..226, z62..68.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('modern_fitout', 41, [200, 44, 268, 120], function (W, B) {
    'use strict';
    var XW = 216, XE = 227, Z0 = 52, Z1 = 80;

    function litCeil(x0, z0, x1, z1, y) {          // sea-lantern ceiling insets
      for (var x = x0; x <= x1; x += 4)
        for (var z = z0; z <= z1; z += 4) W.set(x, y, z, B.SEA_LANTERN);
    }

    /* ================================================================== *
     * ENTRANCE — glaze the opening, doors, header, downlights, steps.
     * Opening: west face z60..72, y35..40, air to x=218.
     * ================================================================== */
    // light-blue curtain wall at x=218 across the opening
    W.fill(218, 35, 61, 218, 40, 71, B.GLASS_LIGHTBLUE);
    // double iron doors at the centre (z65..66), y35 (above plinth y34)
    W.clear(218, 35, 65, 218, 36, 66);
    W.door(218, 35, 65, 'IRON_DOOR', 'W');
    W.door(218, 35, 66, 'IRON_DOOR', 'W');
    W.set(217, 35, 65, B.SMOOTH_QUARTZ); W.set(217, 35, 66, B.SMOOTH_QUARTZ);
    // gold + honeycomb header band across the opening top (x216 plane, y40)
    for (var hz = 60; hz <= 72; hz++) W.set(XW, 40, hz, (hz % 3 === 0) ? B.HONEYCOMB_BLOCK : B.GOLD_BLOCK);
    // recessed sea-lantern downlights in the opening soffit (y40 underside)
    W.set(217, 40, 62, B.SEA_LANTERN); W.set(217, 40, 66, B.SEA_LANTERN); W.set(217, 40, 70, B.SEA_LANTERN);
    // descending quartz steps outside (x215,214,213), grade is y32
    for (var st = 0; st < 3; st++) {
      var sx = 215 - st, sy = 34 - st;
      for (var sz = 61; sz <= 71; sz++) W.stair(sx, sy, sz, 'SMOOTH_QUARTZ', 'W');
      W.slab(sx, sy, 60, 'SMOOTH_QUARTZ'); W.slab(sx, sy, 72, 'SMOOTH_QUARTZ'); // wings
    }
    // delivery chest + wall signs (reference detail)
    W.set(215, 33, 59, B.CHEST);
    W.set(215, 34, 59, B.SIGN_WALL_N);
    W.set(216, 36, 73, B.SIGN_WALL_S);

    /* ================================================================== *
     * LOBBY — double-height (y33..40), x217..226 z53..79.
     * ================================================================== */
    // floor inlay: dark prismarine grid over smooth quartz
    for (var fx = 217; fx <= 226; fx++)
      for (var fz = 53; fz <= 79; fz++)
        if (((fx + fz) % 3) === 0) W.set(fx, 33, fz, B.DARK_PRISMARINE);
    // reception desk (smooth-quartz slabs) + lectern, facing the doors
    W.fill(221, 34, 64, 221, 34, 68, B.SMOOTH_QUARTZ);
    for (var dz = 64; dz <= 68; dz++) W.slab(221, 35, dz, 'SMOOTH_QUARTZ');
    W.set(220, 34, 66, B.LECTERN);
    // seating clusters both wings
    function seat(z) {
      W.stair(224, 34, z, 'QUARTZ_BLOCK', 'S'); W.stair(224, 34, z + 1, 'QUARTZ_BLOCK', 'N');
      W.set(225, 34, z, B.CARPET_CYAN); W.set(225, 34, z + 1, B.CARPET_CYAN);
      W.set(223, 34, z, B.POTTED_AZALEA);
    }
    seat(56); seat(75);
    // wall maps + painting on the east interior wall
    W.set(226, 37, 60, B.FRAME_MAP_E); W.set(226, 37, 62, B.FRAME_MAP_E);
    W.set(226, 38, 72, B.PAINTING1_E);
    // chandelier: glowstone/sea-lantern cluster on chains at centre
    W.set(221, 40, 66, B.CHAIN); W.set(221, 39, 66, B.GLOWSTONE);
    W.set(220, 39, 66, B.SEA_LANTERN); W.set(222, 39, 66, B.SEA_LANTERN);
    W.set(221, 39, 65, B.SEA_LANTERN); W.set(221, 39, 67, B.SEA_LANTERN);
    // cyan banners flanking the doors (interior)
    W.set(217, 38, 63, B.WOOL_CYAN); W.set(217, 37, 63, B.WOOL_CYAN);
    W.set(217, 38, 68, B.WOOL_CYAN); W.set(217, 37, 68, B.WOOL_CYAN);
    litCeil(218, 54, 225, 78, 40);

    /* ================================================================== *
     * CORE — glass water elevator + switchback stairs in the shaft hole
     * (x222..226, z62..68) running the full height.
     * ================================================================== */
    var TOPY = 81;
    // elevator: glass shell x225..226 z63..64, water inside y33..TOPY
    W.walls(225, 33, 63, 226, TOPY, 64, B.GLASS);
    W.clear(225, 33, 63, 226, TOPY, 64);
    W.fill(225, 33, 63, 226, TOPY - 1, 64, B.WATER);
    W.set(225, 33, 63, B.SOUL_LANTERN); W.set(226, 33, 64, B.SOUL_LANTERN);
    // core walls (chiseled) around x222..226 z62..68 with door gaps per level
    var LVL = [33, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77];
    for (var l = 0; l < LVL.length; l++) {
      var y = LVL[l];
      // west core wall x222 (facing the floors), door gap at z65..66
      for (var z = 62; z <= 68; z++) {
        for (var yy = y + 1; yy <= y + 3; yy++) {
          if (z >= 65 && z <= 66 && yy <= y + 2) continue;   // doorway
          if (yy <= TOPY) W.set(222, yy, z, B.CHISELED_QUARTZ);
        }
      }
      // elevator access opening (west side of the water column) each level
      W.clear(224, y + 1, 63, 224, y + 2, 64);
      W.set(224, y + 1, 63, 0); W.set(224, y + 1, 64, 0);
      // FRAME_MAP beside the elevator (floor number marker)
      if (y >= 41) W.set(223, y + 2, 62, B.FRAME_MAP_W);
    }
    // switchback stairs filling x222..224, z65..68, landing every plate
    for (var f = 0; f < LVL.length - 1; f++) {
      var y0 = LVL[f], y1 = LVL[f + 1];
      var rise = y1 - y0;                          // 4 (or 8 for ground->41)
      var dir = (f % 2 === 0) ? 'S' : 'N';
      var baseZ = (dir === 'S') ? 65 : 68;
      var stp = (dir === 'S') ? 1 : -1;
      for (var r = 0; r < rise && r < 4; r++) {
        var zz = baseZ + stp * r;
        for (var sx2 = 223; sx2 <= 224; sx2++) {
          W.fill(sx2, y0 + 1, zz, sx2, y0 + r, zz, B.QUARTZ_BLOCK);
          W.stair(sx2, y0 + r + 1, zz, 'SMOOTH_QUARTZ', dir);
        }
      }
      // landing at the plate for the ground->41 tall run (needs extra height)
      if (rise > 4) {
        for (var sx3 = 223; sx3 <= 224; sx3++)
          for (var r2 = 4; r2 < rise; r2++)
            W.fill(sx3, y0 + 1, baseZ + stp * 3, sx3, y0 + r2, baseZ + stp * 3, B.QUARTZ_BLOCK);
      }
      W.set(223, y0 + 4, 66, B.LANTERN);          // stairwell light
    }
    // patch unused core hole cells (z67..68 at plates) with floor so no gaps
    for (var pfi = 1; pfi < LVL.length; pfi++) {
      W.set(225, LVL[pfi], 67, B.SMOOTH_QUARTZ); W.set(225, LVL[pfi], 68, B.SMOOTH_QUARTZ);
      W.set(226, LVL[pfi], 67, B.SMOOTH_QUARTZ); W.set(226, LVL[pfi], 68, B.SMOOTH_QUARTZ);
    }

    /* ================================================================== *
     * UPPER FLOOR INTERIORS — offices, apartments, penthouse, sky lounge.
     * Each level: space y (plate+1)..(plate+3), z53..79 west of the core.
     * ================================================================== */
    function baseRoom(y, tag) {
      litCeil(218, 54, 221, 78, y + 3);           // ceiling light (west of core)
      litCeil(218, 54, 220, 60, y + 3);
      // carpet runner along the core hallway
      for (var z = 54; z <= 78; z++) W.set(221, y, z, B.CARPET_LIGHTGRAY);
      // caged wall light on the north wall
      W.set(218, y + 2, 54, B.LANTERN); W.set(219, y + 2, 54, B.IRON_BARS);
      W.set(218, y + 2, 78, B.LANTERN);
    }
    function office(y) {
      baseRoom(y, 'office');
      // desk rows (smooth-stone slab tops + stair chairs)
      for (var z = 56; z <= 76; z += 4) {
        W.fill(218, y, z, 219, y, z, B.SMOOTH_STONE);
        W.slab(218, y + 1, z, 'SMOOTH_STONE'); W.slab(219, y + 1, z, 'SMOOTH_STONE');
        W.stair(220, y, z, 'QUARTZ_BLOCK', 'W');
      }
      // bookshelf wall + ender chest + frames
      W.fill(226, y, 54, 226, y + 2, 58, B.BOOKSHELF);
      W.set(225, y, 56, B.ENDER_CHEST);
      W.set(226, y + 1, 74, B.FRAME_BOOK_E ? B.FRAME_BOOK_E : B.PAINTING1_E);
      // glass partition meeting room in the south end
      W.walls(218, y, 72, 221, y + 3, 78, B.GLASS);
      W.clear(221, y, 74, 221, y + 1, 75);
      W.set(219, y, 75, B.LECTERN);
    }
    function apartment(y) {
      baseRoom(y, 'apt');
      // partition at z66 (two units) with door gaps
      W.fill(218, y, 66, 220, y + 3, 66, B.QUARTZ_BRICKS);
      W.clear(218, y, 66, 218, y + 1, 66);
      // unit A (north): bed + kitchen + table
      W.bed(218, y, 56, 'LIGHTBLUE', 'S');
      W.set(220, y, 54, B.SMOKER); W.set(219, y, 54, B.BARREL); W.set(218, y, 55, B.CAULDRON);
      W.slab(219, y + 1, 60, 'SMOOTH_QUARTZ'); W.set(218, y, 60, B.POTTED_AZALEA);
      W.set(220, y + 1, 58, B.PAINTING2_E ? B.PAINTING2_E : B.PAINTING1_E);
      // unit B (south): bed + shelves
      W.bed(218, y, 76, 'CYAN', 'N');
      W.fill(226, y, 72, 226, y + 2, 76, B.BOOKSHELF);
      W.set(225, y, 74, B.CHEST);
      W.set(220, y, 72, B.POTTED_FERN);
    }
    function lounge(y) {
      baseRoom(y, 'lounge');
      // sofa clusters (stairs + carpet)
      function sofa(z) {
        W.stair(218, y, z, 'QUARTZ_BLOCK', 'W'); W.stair(218, y, z + 1, 'QUARTZ_BLOCK', 'W');
        W.set(219, y, z, B.CARPET_CYAN); W.set(219, y, z + 1, B.CARPET_CYAN);
      }
      sofa(56); sofa(74);
      // cake bar + jukebox + gold accents
      W.fill(225, y, 60, 225, y, 64, B.GOLD_BLOCK);
      W.set(225, y + 1, 61, B.CAKE); W.set(225, y + 1, 63, B.CAKE);
      W.set(224, y, 60, B.JUKEBOX);
      W.set(220, y, 66, B.POTTED_AZALEA);
      // extra ceiling sea-lantern ring
      litCeil(218, 56, 226, 78, y + 3);
    }

    office(41); office(45); office(49);
    apartment(53); apartment(57); apartment(61); apartment(65); apartment(69);
    lounge(73); lounge(77);
  });
})();
