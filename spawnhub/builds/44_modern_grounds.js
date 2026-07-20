/* =========================================================================
 * 44_modern_grounds.js — MODERN MONOLITH landscaping
 * Hedge-lined stone walkway along the west (front) face, entrance connector,
 * gardens, corner vines, a rest spot. Only replaces GRASS at y=32 / places
 * decor where y=33 is air.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('modern_grounds', 44, [200, 44, 268, 120], function (W, B) {
    'use strict';
    var GRASS = B.GRASS;
    function h(x, z) {
      var n = (x * 73856093 + z * 19349663 + 5) | 0;
      n = (n ^ (n >>> 13)) | 0; n = Math.imul(n, 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) % 1000;
    }
    function pave(x, z) {
      if (W.get(x, 32, z) !== GRASS) return;
      var r = h(x, z);
      W.set(x, 32, z, r < 450 ? B.SMOOTH_STONE : r < 750 ? B.POLISHED_ANDESITE : B.STONE_BRICKS);
      if (W.get(x, 33, z) === GRASS || W.get(x, 33, z) === B.TALL_GRASS) W.set(x, 33, z, 0);
    }
    function onGrass(x, z) { return W.get(x, 32, z) === GRASS && W.get(x, 33, z) === 0; }
    function lampPost(x, z) { if (onGrass(x, z)) W.lampPost(x, 33, z, 'SMOOTH_STONE' in B ? 'STONE_BRICKS' : 'SPRUCE_PLANKS'); }

    /* ------------------------------------------------------------------ *
     * WALKWAY x210..212, z48..100 (patchwork paving), hedges at x209/x213
     * with a gap at the entrance (z60..72).
     * ------------------------------------------------------------------ */
    for (var z = 48; z <= 100; z++) {
      for (var x = 210; x <= 212; x++) pave(x, z);
      // hedges
      if (!(z >= 60 && z <= 72)) {
        for (var hx of [209, 213]) {
          if (W.get(hx, 33, z) === 0 && W.get(hx, 32, z) === GRASS) {
            W.set(hx, 33, z, (h(hx, z) < 180) ? B.FLOWERING_AZALEA_LEAVES : (h(hx, z) < 320 ? B.AZALEA_LEAVES : B.OAK_LEAVES));
          }
        }
      }
    }
    // lamp posts down the walkway + sea-lantern insets flanking the steps
    for (var lz = 50; lz <= 98; lz += 12) lampPost(208, lz);
    if (W.get(213, 32, 58) === GRASS) W.set(213, 32, 58, B.SEA_LANTERN);
    if (W.get(213, 32, 74) === GRASS) W.set(213, 32, 74, B.SEA_LANTERN);

    /* ------------------------------------------------------------------ *
     * ENTRANCE CONNECTOR — west from the walkway to the plot edge x200 at z66.
     * ------------------------------------------------------------------ */
    for (var ex = 200; ex <= 209; ex++)
      for (var ez = 65; ez <= 67; ez++) pave(ex, ez);

    /* ------------------------------------------------------------------ *
     * GARDENS along the tower's south face (z81..84) + SW rest spot.
     * ------------------------------------------------------------------ */
    var FLOWERS = [B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY, B.TULIP_RED, B.TULIP_PINK, B.ALLIUM];
    for (var gx = 214; gx <= 227; gx++) {
      for (var gz = 81; gz <= 84; gz++) {
        if (onGrass(gx, gz) && h(gx, gz) < 620) W.set(gx, 33, gz, FLOWERS[h(gx, gz) % FLOWERS.length]);
      }
    }
    // SW rest spot: bench + campfire
    if (onGrass(209, 96)) { W.set(209, 33, 96, B.CAMPFIRE); }
    W.stair(207, 33, 95, 'SPRUCE_PLANKS', 'N'); W.stair(207, 33, 97, 'SPRUCE_PLANKS', 'S');
    lampPost(206, 96);

    /* ------------------------------------------------------------------ *
     * CORNER VINES on the tower (NW z52, SW z80) climbing the quartz, plus
     * vines on the east retaining wall; azalea bushes at the base.
     * ------------------------------------------------------------------ */
    // NW corner: wall plane x216 at z52; vines on the west face cell x215, dir 'E'
    for (var vy = 35; vy <= 58; vy++) {
      if (h(215, vy) < 620) W.set(215, vy, 53, B.VINE_E);
      if (h(216, vy) < 560) W.set(215, vy, 79, B.VINE_E);
    }
    // south face vines (z80 wall, cell z81, dir 'N')
    for (var vy2 = 35; vy2 <= 55; vy2++) {
      if (h(vy2, 217) < 500) W.set(218, vy2, 81, B.VINE_N);
      if (h(vy2, 225) < 500) W.set(225, vy2, 81, B.VINE_N);
    }
    // retaining wall vines (east face x229, cell x230, dir 'W')
    for (var rz = 54; rz <= 78; rz += 2) if (h(230, rz) < 700) W.set(230, 36, rz, B.VINE_W);
    // azalea bushes at the base corners
    for (var az of [[214, 54], [214, 78], [214, 66]]) {
      if (onGrass(az[0], az[1])) W.tree(az[0], 33, az[1], 'azalea', function () { return 0.5; });
    }

    /* ------------------------------------------------------------------ *
     * TREES in the plot corners (≥3 from edges) + tall-grass/flower scatter.
     * ------------------------------------------------------------------ */
    var rng = SpawnHub.mulberry(4242);
    var TREES = [[204, 50, 'oak'], [206, 108, 'birch'], [262, 54, 'spruce'], [260, 110, 'oak']];
    for (var t = 0; t < TREES.length; t++) {
      var tp = TREES[t];
      if (onGrass(tp[0], tp[1])) W.tree(tp[0], 33, tp[1], tp[2], rng);
    }
    for (var i = 0; i < 260; i++) {
      var sx = 201 + ((rng() * 66) | 0), sz = 46 + ((rng() * 72) | 0);
      if (!onGrass(sx, sz)) continue;
      var rr = rng();
      W.set(sx, 33, sz, rr < 0.6 ? B.TALL_GRASS : rr < 0.75 ? B.FERN : FLOWERS[(rng() * FLOWERS.length) | 0]);
    }
  });
})();
