/* =========================================================================
 * 43_modern_roof.js — MODERN MONOLITH roof deck, annex & glass bridge
 * Roof floor is y82 (deck items on y83+, inside the crenellation ring which
 * tops out ~y86). Annex is a separate cyan building south of the tower;
 * a glass bridge links them at y41..43.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('modern_roof', 43, [200, 44, 268, 120], function (W, B) {
    'use strict';
    var XW = 216, XE = 227, Z0 = 52, Z1 = 80;

    /* ================================================================== *
     * ROOF DECK (on y82, within the parapet ring)
     * ================================================================== */
    // mechanical penthouse (lightgray concrete), NW of the core
    W.fill(218, 83, 55, 222, 86, 59, B.CONCRETE_LIGHTGRAY);
    W.clear(219, 83, 56, 221, 85, 58);
    W.clear(218, 83, 57, 218, 84, 57);             // doorway (west)
    W.set(220, 83, 57, B.SEA_LANTERN);             // interior light
    // iron trapdoor roof vents + observer/piston greebles
    W.set(219, 87, 56, B.TRAPDOOR_B); W.set(221, 87, 58, B.TRAPDOOR_B);
    W.set(222, 84, 56, B.OBSERVER); W.set(222, 85, 58, B.PISTON);
    // campfire chimney (blackstone) with smoke
    W.fill(224, 83, 57, 224, 86, 58, B.BLACKSTONE);
    W.set(224, 86, 57, 0); W.set(224, 86, 57, B.CAMPFIRE);
    // spire: iron pillar + end rod, west-centre edge
    W.fill(219, 83, 66, 219, 86, 66, B.pillar('IRON_BLOCK'));
    W.set(219, 87, 66, B.END_ROD);
    // observation corner (south): sea-lantern floor ring, telescope, flag, benches
    for (var z = 70; z <= 78; z++) { W.set(218, 82, z, B.SEA_LANTERN); W.set(225, 82, z, B.SEA_LANTERN); }
    W.set(220, 83, 74, B.SCAFFOLDING); W.set(220, 84, 74, B.SCAFFOLDING); W.set(220, 85, 74, B.END_ROD);
    W.fencePost(224, 83, 72, 'SPRUCE_PLANKS'); W.fencePost(224, 84, 72, 'SPRUCE_PLANKS');
    W.set(224, 85, 72, B.WOOL_CYAN); W.set(224, 86, 72, B.WOOL_CYAN);
    W.stair(222, 83, 76, 'QUARTZ_BLOCK', 'S'); W.stair(223, 83, 76, 'QUARTZ_BLOCK', 'S');
    W.set(221, 83, 70, B.POTTED_AZALEA); W.set(225, 83, 78, B.POTTED_AZALEA);

    /* ================================================================== *
     * GLASS BRIDGE — tower south wall (z80) to annex north wall (z86),
     * at y41..43, 2 wide (x221..222).
     * ================================================================== */
    // carve the tower wall opening
    W.clear(XW + 5, 41, 80, XW + 6, 43, 80);       // x221..222 at z80
    // deck + glass tube across z81..85
    for (var bz = 81; bz <= 85; bz++) {
      W.fill(221, 40, bz, 222, 40, bz, B.SMOOTH_QUARTZ);      // floor
      W.set(220, 40, bz, B.GOLD_BLOCK); W.set(223, 40, bz, B.GOLD_BLOCK); // gold edge
      W.set(220, 41, bz, B.GLASS); W.set(223, 41, bz, B.GLASS);
      W.set(220, 42, bz, B.GLASS); W.set(223, 42, bz, B.GLASS);
      W.fill(220, 43, bz, 223, 43, bz, B.GLASS);              // ceiling
      // slender pier support down to grade
      if (bz === 83) W.fill(221, 33, bz, 221, 39, bz, B.QUARTZ_PILLAR);
    }
    W.set(221, 42, 83, B.LANTERN_HANGING);

    /* ================================================================== *
     * ANNEX — cyan 3-floor building south of the tower, x218..230 z86..96.
     * Plates at y38, y43; flat roof y47 with rooftop garden.
     * ================================================================== */
    var AX0 = 218, AX1 = 230, AZ0 = 86, AZ1 = 96;
    // shell
    W.walls(AX0, 33, AZ0, AX1, 46, AZ1, B.CONCRETE_CYAN);
    W.fill(AX0, 33, AZ0, AX1, 33, AZ1, B.SMOOTH_QUARTZ);      // ground floor
    W.fill(AX0, 47, AZ0, AX1, 47, AZ1, B.CONCRETE_CYAN);      // roof
    // gold trim rings at plate lines
    for (var g of [38, 43, 47]) {
      W.walls(AX0, g, AZ0, AX1, g, AZ1, B.GOLD_BLOCK);
    }
    // interior floor plates + stair holes
    W.fill(AX0 + 1, 38, AZ0 + 1, AX1 - 1, 38, AZ1 - 1, B.SMOOTH_QUARTZ);
    W.fill(AX0 + 1, 43, AZ0 + 1, AX1 - 1, 43, AZ1 - 1, B.SMOOTH_QUARTZ);
    W.clear(AX0 + 1, 38, AZ1 - 2, AX0 + 2, 38, AZ1 - 1);
    W.clear(AX0 + 1, 43, AZ1 - 2, AX0 + 2, 43, AZ1 - 1);
    // big glass windows (2x3) on each face per floor
    function annexWin(y) {
      W.fill(AX0, y, 89, AX0, y + 2, 90, B.GLASS);            // west
      W.fill(AX1, y, 89, AX1, y + 2, 90, B.GLASS);            // east
      W.fill(222, y, AZ1, 224, y + 2, AZ1, B.GLASS);          // south
      W.fill(226, y, AZ1, 227, y + 2, AZ1, B.GLASS);
    }
    annexWin(34); annexWin(39); annexWin(44);
    // north door connecting to the bridge landing
    W.clear(221, 34, AZ0, 222, 35, AZ0);
    // ground: café (counters, smoker, tables, jukebox)
    W.fill(220, 34, 88, 223, 34, 88, B.SMOOTH_QUARTZ);
    for (var cz = 88; cz <= 91; cz++) W.slab(220, 35, cz, 'SMOOTH_QUARTZ');
    W.set(221, 34, 88, B.SMOKER); W.set(222, 34, 88, B.BARREL);
    W.set(225, 34, 92, B.JUKEBOX); W.table(227, 34, 93); W.table(224, 34, 90);
    W.set(219, 34, 94, B.POTTED_AZALEA);
    W.set(221, 37, 90, B.SEA_LANTERN); W.set(226, 37, 92, B.SEA_LANTERN);
    // mid: studio (desks, shelves)
    W.fill(228, 39, 88, 228, 41, 92, B.BOOKSHELF);
    W.slab(220, 40, 89, 'SMOOTH_STONE'); W.slab(221, 40, 89, 'SMOOTH_STONE');
    W.stair(222, 39, 89, 'QUARTZ_BLOCK', 'W');
    W.set(224, 42, 90, B.SEA_LANTERN); W.set(220, 42, 94, B.SEA_LANTERN);
    // top: atelier (brewing, enchanting)
    W.set(220, 44, 88, B.BREWING_STAND); W.set(221, 44, 88, B.CAULDRON);
    W.set(227, 44, 94, B.ENCHANTING_TABLE);
    W.fill(226, 44, 92, 226, 46, 95, B.BOOKSHELF);
    W.set(223, 46, 91, B.SEA_LANTERN);
    // rooftop garden on y47
    for (var rx = AX0 + 1; rx <= AX1 - 1; rx += 2)
      for (var rz = AZ0 + 1; rz <= AZ1 - 1; rz += 2) W.set(rx, 47, rz, B.MOSS_BLOCK);
    W.set(220, 48, 88, B.FLOWERING_AZALEA_LEAVES); W.set(228, 48, 94, B.AZALEA_LEAVES);
    W.set(224, 48, 90, B.POPPY); W.set(226, 48, 92, B.DANDELION); W.set(222, 48, 93, B.CORNFLOWER);
    W.walls(AX0, 48, AZ0, AX1, 48, AZ1, B.IRON_BARS);        // garden rail
    for (var pz = AZ0 + 1; pz <= AZ1 - 1; pz++) W.set(AX0 + 3, 47, pz, B.SMOOTH_QUARTZ); // slab path
    // annex ↔ ground stair (from tower base): a couple of quartz steps outside north
    W.stair(221, 33, 85, 'SMOOTH_QUARTZ', 'S');
  });
})();
