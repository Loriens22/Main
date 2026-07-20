/* =========================================================================
 * 11_poor_facade.js — P2 (FACADE DECO) of the POOR RESIDENTIAL COMPLEX
 * Sits on P1's shell (10_poor_shell.js). Front plane x=88 faces EAST (+X);
 * everything decorative lives at x>=89 (overhang) or hangs on the walls.
 * White pods, red drip, striped pole, brick awning, banners, vines, wall
 * lanterns, item frames, shutters, window flower boxes.
 * Coordinates are the CONTRACT from REBUILD_SPEC.md / the shell file.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_facade', 11, [52, 168, 100, 232], function (W, B) {
    'use strict';

    var XF = 88;                                // front wall plane (faces +X)
    // Item/painting frames on the EAST front wall live in air cell x=89 with
    // dir 'W' (wall is to the west, item faces east/out).

    /* ------------------------------------------------------------------ *
     * WHITE PODS — two cantilevered pods on section A's front face.
     * 4 wide (z180..183) x 3 deep (x89..91) x 3 high; open back into the
     * tower through a 2x2 hole in the wall; glass window front (x=91);
     * trapdoor awning over the window; lantern under; stair supports below.
     * ------------------------------------------------------------------ */
    function pod(yBase) {
      var z0 = 180, z1 = 183, x0 = 89, x1 = 91;
      var yb = yBase, yt = yBase + 2;
      // shell: white concrete box, hollow interior
      W.fill(x0, yb, z0, x1, yt, z1, B.CONCRETE_WHITE);
      W.clear(x0, yb + 1, z0 + 1, x1 - 1, yt - 1, z1 - 1);   // hollow (front stays)
      W.fill(x0, yb, z0 + 1, x0, yt, z1 - 1, 0);             // reopen back toward wall
      // punch the tower wall so the pod connects to the room
      W.clear(XF, yb + 1, z0 + 1, XF, yb + 1, z1 - 1);
      // front window (x=91) 3 wide x 1 high of glass
      W.fill(x1, yb + 1, z0 + 1, x1, yb + 1, z1 - 1, B.GLASS_PANE);
      // floor + ceiling
      W.fill(x0, yb, z0, x1, yb, z1, B.CONCRETE_WHITE);
      W.fill(x0, yt, z0, x1, yt, z1, B.CONCRETE_WHITE);
      // cantilever supports: flipped white stairs under the two front corners
      W.stair(x1, yb - 1, z0, 'CONCRETE_WHITE', 'S', true);
      W.stair(x1, yb - 1, z1, 'CONCRETE_WHITE', 'N', true);
      W.stair(x0, yb - 1, z0, 'CONCRETE_WHITE', 'S', true);
      W.stair(x0, yb - 1, z1, 'CONCRETE_WHITE', 'N', true);
      // trapdoor awning over the window + lantern glow under the pod
      W.set(x1 + 1, yb + 2, z0 + 1, B.TRAPDOOR_T);
      W.set(x1 + 1, yb + 2, z0 + 2, B.TRAPDOOR_T);
      W.set(x1 + 1, yb + 2, z1 - 1, B.TRAPDOOR_T);
      W.set(x0 + 1, yb - 1, z0 + 1, B.LANTERN_HANGING);
      // a little life inside the pod
      W.set(x0 + 1, yb + 1, z0 + 1, B.POTTED_TULIP_RED);
      W.set(x1 - 1, yb + 1, z1 - 1, B.FLOWER_POT);
    }
    pod(45);
    pod(53);

    /* ------------------------------------------------------------------ *
     * RED DRIP — hangs from under A's white rim at x=89, z=186, down to y37;
     * alternating WOOL_RED and red-concrete fence (the reference's red vine).
     * Two short side branches. A wool splash where it meets the ground.
     * ------------------------------------------------------------------ */
    (function redDrip() {
      var x = 89, z = 186;
      for (var y = 58; y >= 37; y--) {
        W.set(x, y, z, (y % 3 === 0) ? B.WOOL_RED : B.fence('CONCRETE_RED'));
      }
      // side branches
      W.set(x, 52, z - 1, B.fence('CONCRETE_RED'));
      W.set(x, 51, z - 1, B.WOOL_RED);
      W.set(x, 44, z + 1, B.fence('CONCRETE_RED'));
      W.set(x, 43, z + 1, B.WOOL_RED);
      W.set(x, 42, z + 1, B.fence('CONCRETE_RED'));
      // ground splash
      W.set(x, 33, z, B.WOOL_RED);
      W.set(x, 33, z - 1, B.WOOL_RED);
      W.set(x + 1, 33, z, B.CARPET_RED);
    })();

    /* ------------------------------------------------------------------ *
     * STRIPED POLE — red/white alternating column on C's roof SE corner
     * (x=87, z=213), y54..59, topped with a lantern.
     * ------------------------------------------------------------------ */
    (function stripedPole() {
      for (var y = 54; y <= 59; y++) {
        W.set(87, y, 213, (y % 2 === 0) ? B.WOOL_RED : B.WOOL_WHITE);
      }
      W.set(87, 60, 213, B.LANTERN);
    })();

    /* ------------------------------------------------------------------ *
     * BRICK AWNING — over the centre colonnade arch (z204..208).
     * Brick platform y37..38 out to x89..92 on cobblestone-wall posts,
     * brick-stair front lip, hanging sign, clutter stacks against the wall,
     * vertical wool banners beside the arches.
     * ------------------------------------------------------------------ */
    (function awning() {
      // posts
      W.set(92, 33, 204, B.wall('COBBLESTONE'));
      W.set(92, 34, 204, B.wall('COBBLESTONE'));
      W.set(92, 35, 204, B.wall('COBBLESTONE'));
      W.set(92, 33, 208, B.wall('COBBLESTONE'));
      W.set(92, 34, 208, B.wall('COBBLESTONE'));
      W.set(92, 35, 208, B.wall('COBBLESTONE'));
      // deck
      W.fill(89, 37, 203, 92, 37, 209, B.BRICKS);
      W.fill(89, 38, 204, 91, 38, 208, B.BRICKS);
      // front stair lip
      for (var z = 203; z <= 209; z++) W.stair(92, 38, z, 'BRICKS', 'E', true);
      // hanging lanterns + sign under front edge
      W.set(92, 36, 205, B.LANTERN_HANGING);
      W.set(92, 36, 207, B.LANTERN_HANGING);
      W.set(89, 36, 206, B.SIGN_WALL_W);
      // clutter against the wall under the awning
      W.set(89, 33, 203, B.CHEST);
      W.set(89, 34, 203, B.CHEST);
      W.set(90, 33, 203, B.BARREL);
      W.set(89, 33, 209, B.BARREL);
      W.set(89, 34, 209, B.BOOKSHELF);
      W.set(90, 33, 209, B.BARREL);
    })();

    // Vertical wool banners beside the colonnade arches (front face x=89)
    var BANNERS = [[199, 'WOOL_RED'], [203, 'WOOL_PURPLE'], [208, 'WOOL_RED'], [212, 'WOOL_PURPLE']];
    for (var bi = 0; bi < BANNERS.length; bi++) {
      var bz = BANNERS[bi][0], bw = B['CARPET_' + BANNERS[bi][1].split('_')[1]];
      // use thin wool strips hung on the wall via panes? use wool blocks 1 out
      W.set(89, 36, bz, B[BANNERS[bi][1]]);
      W.set(89, 35, bz, B[BANNERS[bi][1]]);
      W.set(89, 34, bz, B[BANNERS[bi][1]]);
    }

    /* ------------------------------------------------------------------ *
     * VINES + MOSS accents on all three sections' walls (front + south).
     * ------------------------------------------------------------------ */
    function vineCol(x, z, dir, y0, y1) {
      for (var y = y0; y <= y1; y++) W.set(x, y, z, B['VINE_' + dir]);
    }
    // front face (x=89, wall to west => dir 'W')
    vineCol(89, 179, 'W', 34, 44);
    vineCol(89, 188, 'W', 40, 52);
    vineCol(89, 197, 'W', 34, 41);
    vineCol(89, 213, 'W', 34, 47);
    vineCol(89, 201, 'W', 50, 53);
    // south face (z=215, wall to north => dir 'N')
    vineCol(66, 215, 'N', 34, 46);
    vineCol(72, 215, 'N', 34, 42);
    vineCol(82, 215, 'N', 34, 50);
    // moss ledge planters on a couple of window boxes (front)
    var BOXES = [[88, 41, 185], [88, 46, 200], [88, 46, 210]];
    for (var mb = 0; mb < BOXES.length; mb++) {
      var bx = BOXES[mb];
      W.slab(89, bx[1], bx[2], 'SPRUCE_PLANKS');
      W.set(89, bx[1] + 1, bx[2], (mb % 2 === 0) ? B.POTTED_TULIP_RED : B.POTTED_DANDELION);
    }

    /* ------------------------------------------------------------------ *
     * WALL LANTERNS + WALL TORCHES around entrances and arches.
     * ------------------------------------------------------------------ */
    // flanking the front strip entrance (B, z=195)
    W.set(89, 36, 197, B.LANTERN_HANGING);
    W.set(89, 36, 190, B.LANTERN_HANGING);
    // wall torches on the colonnade piers
    var PIERS = [199, 204, 209, 213];
    for (var pi = 0; pi < PIERS.length; pi++) {
      W.set(89, 35, PIERS[pi], B.TORCH_WALL_W);
    }
    // A tower front torches
    W.set(89, 43, 184, B.TORCH_WALL_W);
    W.set(89, 52, 179, B.TORCH_WALL_W);

    /* ------------------------------------------------------------------ *
     * ITEM FRAMES + shutters near the ground entrance (lived-in clutter).
     * ------------------------------------------------------------------ */
    W.set(89, 34, 194, B.FRAME_PICK_W);
    W.set(89, 35, 194, B.FRAME_SWORD_W);
    W.set(89, 34, 196, B.FRAME_MAP_W);
    // spruce trapdoor shutters flanking a couple of C's white-framed windows
    W.set(89, 40, 199, B.TRAPDOOR_B); W.set(89, 40, 202, B.TRAPDOOR_B);
    W.set(89, 45, 204, B.TRAPDOOR_B); W.set(89, 45, 207, B.TRAPDOOR_B);
  });
})();
