/* =========================================================================
 * 10_poor_shell.js — P1 (SHELL) of the POOR RESIDENTIAL COMPLEX
 * Plot [52,168,100,232] — footprint x64..88 (front plane x=88, faces EAST),
 * z178..214. Three sections:
 *   A "red-top tower"          z178..189  walls y33..59, red cap y60..62, rim y63
 *   B "elevator spine"         z190..197  walls y33..57, flat roof y58
 *   C "white-banded arch block"z198..214  walls y33..53, parapet y54
 * This file builds ALL structure: foundations/paving, exterior walls with the
 * exact material treatments, floor plates, partition walls + door gaps, window
 * openings + glazing, the water bubble elevator + spruce switchback stair core
 * in B, the front entrance door, basement shell + access stair, parapets and
 * roof slabs. Everything P2..P5 build sits on these exact coordinates
 * (REBUILD_SPEC.md is the contract — do not move anything).
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_shell', 10, [52, 168, 100, 232], function (W, B) {
    'use strict';

    /* ------------------------------------------------------------------ *
     * Layout constants (CONTRACT)
     * ------------------------------------------------------------------ */
    var XR = 64, XF = 88;                       // rear / front wall planes
    var AZ0 = 178, AZ1 = 189, ATOP = 59;        // section A
    var BZ0 = 190, BZ1 = 197, BTOP = 57;        // section B
    var CZ0 = 198, CZ1 = 214, CTOP = 53;        // section C
    var LEVELS = [33, 38, 43, 48, 53];          // feet-level of each storey
    var PLATE_YS = [37, 42, 47, 52, 57];        // 1-thick floor plates

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */
    // Deterministic integer hash -> 0..999 (seeded patchwork, stable per run)
    function h(x, y, z) {
      var n = (x * 374761393 + y * 668265263 + z * 1103515245 + 12345) | 0;
      n = (n ^ (n >>> 13)) | 0;
      n = Math.imul(n, 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) % 1000;
    }
    // fill a box choosing the block per-cell from fn(x,y,z)
    function fillFn(x1, y1, z1, x2, y2, z2, fn) {
      var xa = Math.min(x1, x2), xb = Math.max(x1, x2);
      var ya = Math.min(y1, y2), yb = Math.max(y1, y2);
      var za = Math.min(z1, z2), zb = Math.max(z1, z2);
      for (var y = ya; y <= yb; y++)
        for (var z = za; z <= zb; z++)
          for (var x = xa; x <= xb; x++) W.set(x, y, z, fn(x, y, z));
    }
    // 4 perimeter walls (no floor/ceiling) with a per-cell material fn
    function wallsFn(x1, y1, z1, x2, y2, z2, fn) {
      fillFn(x1, y1, z1, x2, y2, z1, fn);   // north
      fillFn(x1, y1, z2, x2, y2, z2, fn);   // south
      fillFn(x1, y1, z1, x1, y2, z2, fn);   // west (rear)
      fillFn(x2, y1, z1, x2, y2, z2, fn);   // east (front)
    }

    /* ------------------------------------------------------------------ *
     * Material palettes
     * ------------------------------------------------------------------ */
    // Section A: hand-worn deepslate patchwork (60% bricks + friends),
    // extra moss/cracks near the ground like the street-photo reference.
    function matPatchwork(x, y, z) {
      var r = h(x, y, z);
      if (y <= 38) {                       // weathered base courses
        if (r < 90) return B.MOSSY_STONE_BRICKS;
        if (r < 175) return B.CRACKED_STONE_BRICKS;
        if (r < 250) return B.MOSSY_COBBLESTONE;
      }
      if (r < 580) return B.DEEPSLATE_BRICKS;
      if (r < 710) return B.COBBLED_DEEPSLATE;
      if (r < 810) return B.DEEPSLATE_TILES;
      if (r < 900) return B.ANDESITE;
      return B.STONE_BRICKS;
    }
    // Section A cap: maroon mix like the reference roofline
    function matRedCap(x, y, z) {
      return h(x, y, z) < 600 ? B.CONCRETE_RED : B.TERRACOTTA_RED;
    }
    // Section C body: mostly clean deepslate bricks so the white bands pop
    function matBodyC(x, y, z) {
      return h(x, y, z) < 920 ? B.DEEPSLATE_BRICKS : B.COBBLED_DEEPSLATE;
    }
    // Floor plates: spruce with oak patches
    function matPlate(x, y, z) {
      return h(x, y, z) < 840 ? B.SPRUCE_PLANKS : B.OAK_PLANKS;
    }
    // Ground-floor paving (poor look: broken stone mix)
    function matPave(x, y, z) {
      var r = h(x, y, z);
      return r < 500 ? B.COBBLED_DEEPSLATE : r < 800 ? B.COBBLESTONE : B.ANDESITE;
    }

    /* ================================================================== *
     * SECTION A — "red-top tower"  (z178..189)
     * ================================================================== */
    // perimeter walls y33..59 in hash patchwork (front x88, rear x64,
    // north z178, south z189 = partition toward B)
    wallsFn(XR, 33, AZ0, XF, ATOP, AZ1, matPatchwork);

    // Deliberate rectangular "repair patches" — contrasting material slapped
    // over the patchwork like someone fixed holes over the years (reference
    // 075e21bd-2813.jpg). Kept clear of every window + the rear lava groove
    // column (x64, z183) and the drip/pod zones (those live at x89+, P2).
    var REPAIRS = [
      [88, 88, 41, 43, 179, 181, 'COBBLESTONE'],       // front, low left
      [88, 88, 46, 48, 186, 188, 'ANDESITE'],          // front, mid right
      [88, 88, 56, 58, 183, 185, 'DEEPSLATE_TILES'],   // front, under cap
      [64, 64, 44, 47, 185, 188, 'COBBLED_DEEPSLATE'], // rear (south of groove)
      [64, 64, 50, 53, 179, 181, 'ANDESITE'],          // rear, upper north
      [67, 70, 35, 37, 178, 178, 'STONE_BRICKS'],      // north face, near grade
    ];
    for (var rp = 0; rp < REPAIRS.length; rp++) {
      var p = REPAIRS[rp];
      W.fill(p[0], p[2], p[4], p[1], p[3], p[5], B[p[6]]);
    }

    // Red cap band y60..62 (concrete/terracotta maroon mix)
    wallsFn(XR, 60, AZ0, XF, 62, AZ1, matRedCap);

    // Roof deck sealing the attic: dark tiles flush with the cap top (y62)
    W.fill(XR + 1, 62, AZ0 + 1, XF - 1, 62, AZ1 - 1, B.DEEPSLATE_TILES);

    // White rim y63: CONCRETE_WHITE slabs on the wall tops, lipped 1 block
    // outward on the front face (x=89 — the allowed overhang).
    for (var az = AZ0; az <= AZ1; az++) {
      W.slab(XF, 63, az, 'CONCRETE_WHITE');
      W.slab(XR, 63, az, 'CONCRETE_WHITE');
      W.slab(89, 63, az, 'CONCRETE_WHITE');            // front lip
    }
    for (var ax = XR; ax <= XF; ax++) {
      W.slab(ax, 63, AZ0, 'CONCRETE_WHITE');
      W.slab(ax, 63, AZ1, 'CONCRETE_WHITE');
    }

    // Windows, front face x=88 (glazing replaces the 1-thick wall cell):
    // 2x2 purple at z181-182 (y44-45, y54-55); 2x2 clear at z185-186 (y39-40, y49-50)
    W.fill(88, 44, 181, 88, 45, 182, B.PANE_PURPLE);
    W.fill(88, 54, 181, 88, 55, 182, B.PANE_PURPLE);
    W.fill(88, 39, 185, 88, 40, 186, B.GLASS_PANE);
    W.fill(88, 49, 185, 88, 50, 186, B.GLASS_PANE);
    // Small 1x2 slits on the north face z=178
    var SLITS_N = [[68, 39], [74, 44], [80, 49], [71, 54]];
    for (var sn = 0; sn < SLITS_N.length; sn++) {
      var s = SLITS_N[sn];
      W.fill(s[0], s[1], 178, s[0], s[1] + 1, 178, B.GLASS_PANE);
    }
    // Rear face x=64 stays blank patchwork — P3 carves the lava groove into
    // the wall at z183; column (64, z183, y36..58) deliberately kept windowless.

    /* ================================================================== *
     * SECTION B — "elevator spine"  (z190..197)
     * ================================================================== */
    wallsFn(XR, 33, BZ0, XF, BTOP, BZ1, function () { return B.POLISHED_ANDESITE; });

    // Stone-brick quoins on the four section-edge corners (2-on/2-off rhythm)
    var QUOINS = [[XR, BZ0], [XR, BZ1], [XF, BZ0], [XF, BZ1]];
    for (var q = 0; q < QUOINS.length; q++) {
      for (var qy = 33; qy <= BTOP; qy++) {
        if ((qy - 33) % 4 < 2) W.set(QUOINS[q][0], qy, QUOINS[q][1], B.STONE_BRICKS);
      }
    }

    // Flat roof slab at y58 (hatch for the stair is carved later)
    W.fill(XR, 58, BZ0, XF, 58, BZ1, B.POLISHED_ANDESITE);

    // THE SIGNATURE — full-height teal window strip, front face x=88, z192..195.
    // Frame columns of PRISMARINE_BRICKS at z191/z196, doubled at x=89 so the
    // frame genuinely protrudes and reads as a vertical feature.
    for (var fz = 0; fz < 2; fz++) {
      var zc = fz === 0 ? 191 : 196;
      W.fill(88, 33, zc, 88, BTOP, zc, B.PRISMARINE_BRICKS);
      W.fill(89, 33, zc, 89, BTOP, zc, B.PRISMARINE_BRICKS);
    }
    W.fill(89, 57, 192, 89, 57, 195, B.PRISMARINE_BRICKS); // beam tying the frames

    // Per level module: floor-line course, DARK_PRISMARINE sill, 2-high x
    // 4-wide PANE_CYAN window (modules y34-36, 39-41, 44-46, 49-51, 54-56)
    for (var lv = 0; lv < LEVELS.length; lv++) {
      var L = LEVELS[lv];
      W.fill(88, L, 192, 88, L, 195, B.PRISMARINE_BRICKS);      // base/floor line
      W.fill(88, L + 1, 192, 88, L + 1, 195, B.DARK_PRISMARINE); // sill
      W.fill(88, L + 2, 192, 88, L + 3, 195, B.PANE_CYAN);       // teal glazing
    }
    // Prismarine-brick course across the strip at every plate line + top
    var STRIP_BANDS = [37, 42, 47, 52, 57];
    for (var sb = 0; sb < STRIP_BANDS.length; sb++) {
      W.fill(88, STRIP_BANDS[sb], 192, 88, STRIP_BANDS[sb], 195, B.PRISMARINE_BRICKS);
    }

    // Rear light slits for the stair core (west face x=64, z194, one per level)
    for (var rs = 0; rs < LEVELS.length; rs++) {
      W.fill(64, LEVELS[rs] + 2, 194, 64, LEVELS[rs] + 3, 194, B.GLASS_PANE);
    }

    /* ================================================================== *
     * SECTION C — "white-banded arch block"  (z198..214)
     * ================================================================== */
    wallsFn(XR, 33, CZ0, XF, CTOP, CZ1, matBodyC);

    // Crisp WHITE horizontal bands at y37/42/47/52 wrapping front + south
    var BANDS = [37, 42, 47, 52];
    for (var bi = 0; bi < BANDS.length; bi++) {
      var by = BANDS[bi];
      W.fill(88, by, CZ0, 88, by, CZ1, B.CONCRETE_WHITE);   // front face
      W.fill(XR, by, CZ1, XF, by, CZ1, B.CONCRETE_WHITE);   // south face
    }

    // Roof deck y53 (doubles as top wall course), parapet ring y54,
    // red slab edging on top of the parapet (reference red roofline trim).
    W.fill(XR, 53, CZ0, XF, 53, CZ1, B.DEEPSLATE_BRICKS);
    W.walls(XR, 54, CZ0, XF, 54, CZ1, B.DEEPSLATE_BRICKS);
    for (var pz = CZ0; pz <= CZ1; pz++) {
      W.slab(XF, 55, pz, 'CONCRETE_RED');
      W.slab(XR, 55, pz, 'CONCRETE_RED');
    }
    for (var px = XR; px <= XF; px++) {
      W.slab(px, 55, CZ0, 'CONCRETE_RED');
      W.slab(px, 55, CZ1, 'CONCRETE_RED');
    }
    // (Rooftop clutter = P3; striped pole at 87,213 = P2 — deck is ready.)

    // Front windows x=88 — upper 3 levels (rows start y39/44/49; the ground
    // level has the colonnade arches instead). Each window: 2x2 GLASS_PANE
    // inside a visible 1-block CONCRETE_WHITE frame ring.
    var WIN_ROWS_F = [39, 44, 49];
    var WIN_ZS = [200, 205, 210];
    for (var wr = 0; wr < WIN_ROWS_F.length; wr++) {
      for (var wz = 0; wz < WIN_ZS.length; wz++) {
        var sy = WIN_ROWS_F[wr], sz = WIN_ZS[wz];
        W.fill(88, sy - 1, sz - 1, 88, sy + 2, sz + 2, B.CONCRETE_WHITE); // ring
        W.fill(88, sy, sz, 88, sy + 1, sz + 1, B.GLASS_PANE);            // glazing
      }
    }

    // South face z=214: two white-framed 2x2 windows per level (all 4 levels)
    var WIN_ROWS_S = [34, 39, 44, 49];
    var WIN_XS = [69, 78];
    for (var wrs = 0; wrs < WIN_ROWS_S.length; wrs++) {
      for (var wxs = 0; wxs < WIN_XS.length; wxs++) {
        var sy2 = WIN_ROWS_S[wrs], sx2 = WIN_XS[wxs];
        W.fill(sx2 - 1, sy2 - 1, 214, sx2 + 2, sy2 + 2, 214, B.CONCRETE_WHITE);
        W.fill(sx2, sy2, 214, sx2 + 1, sy2 + 1, 214, B.GLASS_PANE);
      }
    }

    // Ground colonnade: three 2w x 3h arched openings, flipped-stair corners
    for (var ai = 0; ai < WIN_ZS.length; ai++) {
      var azc = WIN_ZS[ai];
      W.clear(88, 33, azc, 88, 35, azc + 1);
      W.stair(88, 35, azc, 'DEEPSLATE_BRICKS', 'N', true);      // lip toward z-
      W.stair(88, 35, azc + 1, 'DEEPSLATE_BRICKS', 'S', true);  // lip toward z+
      W.fill(88, 32, azc, 88, 32, azc + 1, B.COBBLESTONE);      // threshold
    }

    /* ================================================================== *
     * FLOOR PLATES — 1 thick, spruce with oak patches
     * ================================================================== */
    for (var pa = 0; pa < PLATE_YS.length; pa++) {         // A: 37,42,47,52,57
      fillFn(65, PLATE_YS[pa], AZ0 + 1, 87, PLATE_YS[pa], AZ1 - 1, matPlate);
    }
    for (var pb = 0; pb < 4; pb++) {                       // B: 37,42,47,52
      fillFn(65, PLATE_YS[pb], BZ0 + 1, 87, PLATE_YS[pb], BZ1 - 1, matPlate);
    }
    for (var pc = 0; pc < 4; pc++) {                       // C: 37,42,47,52
      fillFn(65, PLATE_YS[pc], CZ0 + 1, 87, PLATE_YS[pc], CZ1 - 1, matPlate);
    }

    /* ================================================================== *
     * B CORE 1 — spruce switchback stair, x66..71 z191..196, y33 -> 57
     * Three 2-wide lanes (x66-67, 68-69, 70-71); each storey = 4 risers +
     * a landing that merges with the plate. Plate holes are cut only where
     * a climbing body passes through; the top flight exits via a roof hatch.
     * ================================================================== */
    var FLIGHTS = [
      { x0: 66, x1: 67, y0: 33, dir: 'N', steps: [195, 194, 193, 192], land: 191, holeY: 37, hz0: 192, hz1: 193 },
      { x0: 68, x1: 69, y0: 38, dir: 'S', steps: [192, 193, 194, 195], land: 196, holeY: 42, hz0: 194, hz1: 195 },
      { x0: 70, x1: 71, y0: 43, dir: 'N', steps: [195, 194, 193, 192], land: 191, holeY: 47, hz0: 192, hz1: 193 },
      { x0: 66, x1: 67, y0: 48, dir: 'S', steps: [192, 193, 194, 195], land: 196, holeY: 52, hz0: 194, hz1: 195 },
      { x0: 68, x1: 69, y0: 53, dir: 'N', steps: [195, 194, 193, 192], land: 191, holeY: 58, hz0: 191, hz1: 192 }, // hatch
    ];
    for (var fi = 0; fi < FLIGHTS.length; fi++) {
      var f = FLIGHTS[fi];
      // headroom hole through the plate (or the roof, for the top flight)
      W.clear(f.x0, f.holeY, f.hz0, f.x1, f.holeY, f.hz1);
      // risers with solid spruce infill underneath (no floating stairs)
      for (var si = 0; si < f.steps.length; si++) {
        var sy3 = f.y0 + si, sz3 = f.steps[si];
        for (var sx3 = f.x0; sx3 <= f.x1; sx3++) {
          if (si > 0) W.fill(sx3, f.y0, sz3, sx3, sy3 - 1, sz3, B.SPRUCE_PLANKS);
          W.stair(sx3, sy3, sz3, 'SPRUCE_PLANKS', f.dir);
        }
      }
      // landing column + landing block at plate level
      for (var lx = f.x0; lx <= f.x1; lx++) {
        W.fill(lx, f.y0, f.land, lx, f.y0 + 3, f.land, B.SPRUCE_PLANKS);
        W.set(lx, f.y0 + 4, f.land, B.SPRUCE_PLANKS);
      }
    }

    /* ================================================================== *
     * B CORE 2 — water bubble elevator, glass shell x81..84 z192..195
     * 2x2 water column x82..83 z193..194, y33..56; open at each landing on
     * the west side; soul lanterns glowing at the shaft bottom.
     * ================================================================== */
    W.walls(81, 33, 192, 84, BTOP, 195, B.GLASS);   // ring passes through plates
    W.clear(82, 33, 193, 83, BTOP, 194);            // punch shaft through plates
    W.fill(82, 33, 193, 83, 56, 194, B.WATER);      // the ride
    W.set(82, 33, 193, B.SOUL_LANTERN);             // shaft-bottom glow
    W.set(83, 33, 194, B.SOUL_LANTERN);
    for (var el = 0; el < LEVELS.length; el++) {    // west-side landing openings
      W.clear(81, LEVELS[el], 193, 81, LEVELS[el] + 1, 194);
    }

    /* ================================================================== *
     * PARTITION DOOR GAPS — 2-high openings at x74..75 through both wall
     * pairs (z189/190 and z197/198) on every level both sections share,
     * so all floors connect through B's stair core.
     * ================================================================== */
    for (var g1 = 0; g1 < LEVELS.length; g1++) {            // A <-> B (all 5)
      W.clear(74, LEVELS[g1], 189, 75, LEVELS[g1] + 1, 190);
    }
    for (var g2 = 0; g2 < 4; g2++) {                        // B <-> C (4 levels)
      W.clear(74, LEVELS[g2], 197, 75, LEVELS[g2] + 1, 198);
    }

    /* ================================================================== *
     * BASEMENT — cobbled deepslate shell under B+C (x66..86, z191..212,
     * y28..32) + cobble access stair descending from B's ground floor.
     * ================================================================== */
    W.shell(66, 28, 191, 86, 32, 212, B.COBBLED_DEEPSLATE);
    W.clear(67, 29, 192, 85, 31, 211);              // hollow it out
    // Access stair: 2 wide (z192..193), descending eastward x76 -> x79
    // (blocks at y32,31,30,29), supports filled so nothing floats.
    for (var st = 0; st < 4; st++) {
      var stx = 76 + st, sty = 32 - st;
      W.clear(stx, sty, 192, stx, 32, 193);          // open ceiling + headroom
      for (var stz = 192; stz <= 193; stz++) {
        if (sty - 1 >= 29) W.fill(stx, 29, stz, stx, sty - 1, stz, B.COBBLED_DEEPSLATE);
        W.stair(stx, sty, stz, 'COBBLESTONE', 'W');  // ascends back toward west
      }
    }

    /* ================================================================== *
     * GROUND-FLOOR PAVING — y32 floors not covered by the basement ceiling
     * ================================================================== */
    fillFn(65, 32, AZ0 + 1, 87, 32, AZ1 - 1, matPave);       // all of A
    fillFn(65, 32, BZ0 + 1, 65, 32, BZ1 - 1, matPave);       // B west strip
    fillFn(87, 32, BZ0 + 1, 87, 32, BZ1 - 1, matPave);       // B east strip
    fillFn(65, 32, CZ0 + 1, 65, 32, CZ1 - 1, matPave);       // C west strip
    fillFn(87, 32, CZ0 + 1, 87, 32, CZ1 - 1, matPave);       // C east strip
    fillFn(66, 32, 213, 86, 32, 213, matPave);               // C south strip

    /* ================================================================== *
     * C GALLERY — open colonnade corridor behind the arches (x85..87,
     * y33..36, z199..212), cobblestone floor, hall wall at x=84 with door.
     * ================================================================== */
    W.clear(85, 33, 199, 87, 36, 212);
    W.fill(85, 32, 199, 87, 32, 212, B.COBBLESTONE);         // corridor floor
    W.fill(84, 33, 199, 84, 36, 212, B.DEEPSLATE_BRICKS);    // hall wall
    W.clear(84, 33, 205, 84, 34, 205);                       // door opening
    W.door(84, 33, 205, 'SPRUCE_DOOR', 'E');                 // into ground hall

    /* ================================================================== *
     * FRONT GROUND ENTRANCE — spruce door in the strip at x=88, z=195
     * ================================================================== */
    W.clear(88, 33, 195, 88, 34, 195);
    W.door(88, 33, 195, 'SPRUCE_DOOR', 'E');
    W.set(88, 32, 195, B.SMOOTH_STONE);                      // threshold
    W.slab(89, 33, 195, 'SMOOTH_STONE');                     // doorstep
  });
})();
