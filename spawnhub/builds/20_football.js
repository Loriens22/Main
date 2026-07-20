/* =========================================================================
 * FOOTBALL — kids' football pitch + playground  (plot 184,172 - 248,240)
 * Grass pitch with white carpet lines, quartz goals, oak fence ring,
 * spruce spectator stands + scorekeeper hut, playground in the north
 * (slide / swings / climbing frame / seesaw / sandbox), snack stand,
 * storage shed in the south. West edge kept open toward plaza/pond.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('football', 20, [184, 172, 248, 240], function (W, B) {
    const G = W.GROUND;     // 32 = terrain surface (top solid block)
    const Y = G + 1;        // 33 = level things stand on

    /* deterministic rng so the build is stable between runs */
    let seed = 20260720;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
    const pick = (arr) => arr[(rnd() * arr.length) | 0];

    /* ------- tiny helpers ------- */
    const ground = (x, z, id) => W.set(x, G, z, id);          // swap terrain top block
    const carpet = (x, z) => W.set(x, Y, z, B.CARPET_WHITE);  // pitch line
    const fenceRow = (x1, z1, x2, z2, mat) => {
      const f = B.fence(mat || 'OAK_PLANKS');
      W.fill(x1, Y, z1, x2, Y, z2, f);
    };
    function bench(x, z, dir) { // 3-wide bench along x with fence armrests
      W.set(x - 1, Y, z, B.fence('SPRUCE_PLANKS'));
      for (let i = 0; i < 3; i++) W.set(x + i, Y, z, B.stair('SPRUCE_PLANKS', dir));
      W.set(x + 3, Y, z, B.fence('SPRUCE_PLANKS'));
    }
    function flowerBed(x, z) { // 3x2 flower patch on coarse dirt
      const fl = [B.POPPY, B.DANDELION, B.TULIP_RED, B.TULIP_PINK, B.CORNFLOWER, B.OXEYE_DAISY];
      for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 2; dz++) {
        ground(x + dx, z + dz, B.COARSE_DIRT);
        W.set(x + dx, Y, z + dz, pick(fl));
      }
    }

    /* =====================================================================
     * 1) PITCH  x 196..217, z 184..215 — grass with worn patches + lines
     * ===================================================================== */
    const PX1 = 196, PX2 = 217, PZ1 = 184, PZ2 = 215;

    // worn patches (muddy pitch like the reference)
    for (let i = 0; i < 30; i++) {
      const cx = PX1 + 1 + ((rnd() * (PX2 - PX1 - 1)) | 0);
      const cz = PZ1 + 1 + ((rnd() * (PZ2 - PZ1 - 1)) | 0);
      const mat = rnd() < 0.6 ? B.COARSE_DIRT : B.DIRT_PATH;
      ground(cx, cz, mat);
      if (rnd() < 0.7) ground(cx + 1, cz, mat);
      if (rnd() < 0.5) ground(cx, cz + 1, mat);
      if (rnd() < 0.3) ground(cx + 1, cz + 1, mat);
    }
    // extra wear in both goal mouths and at the center
    for (const zc of [PZ1 + 2, PZ2 - 2]) {
      for (let x = 204; x <= 210; x++) if (rnd() < 0.7) ground(x, zc + (rnd() < .5 ? -1 : 0) + 0, B.COARSE_DIRT);
    }
    for (let x = 205; x <= 208; x++) for (let z = 198; z <= 201; z++) if (rnd() < 0.45) ground(x, z, B.DIRT_PATH);

    // perimeter line
    for (let x = PX1; x <= PX2; x++) { carpet(x, PZ1); carpet(x, PZ2); }
    for (let z = PZ1; z <= PZ2; z++) { carpet(PX1, z); carpet(PX2, z); }
    // halfway line (2 wide — pitch is even sized)
    for (let x = PX1; x <= PX2; x++) { carpet(x, 199); carpet(x, 200); }
    // center circle (approximate ring around 206.5, 199.5)
    for (let x = 201; x <= 212; x++) for (let z = 194; z <= 205; z++) {
      const dx = x - 206.5, dz = z - 199.5, d = Math.sqrt(dx * dx + dz * dz);
      if (Math.abs(d - 4.2) < 0.55) carpet(x, z);
    }
    // penalty boxes (x 201..212, 5 deep) + penalty spots
    for (let x = 201; x <= 212; x++) { carpet(x, PZ1 + 5); carpet(x, PZ2 - 5); }
    for (let z = PZ1 + 1; z <= PZ1 + 5; z++) { carpet(201, z); carpet(212, z); }
    for (let z = PZ2 - 5; z <= PZ2 - 1; z++) { carpet(201, z); carpet(212, z); }
    carpet(206, PZ1 + 7); carpet(206, PZ2 - 7);

    // match ball at the center spot
    W.set(206, Y, 200, B.BALL);

    // corner flags
    for (const [fx, fz] of [[PX1, PZ1], [PX2, PZ1], [PX1, PZ2], [PX2, PZ2]]) {
      W.set(fx, Y, fz, B.fence('OAK_PLANKS'));
      W.set(fx, Y + 1, fz, B.fence('OAK_PLANKS'));
      W.set(fx, Y + 2, fz, B.WOOL_RED);
    }

    /* =====================================================================
     * 2) GOALS — white quartz frames, mouth 5 wide x 3 high, cobweb nets
     * ===================================================================== */
    function goal(z, webZ) {
      W.column(204, z, Y, Y + 2, B.QUARTZ_BLOCK);         // posts
      W.column(210, z, Y, Y + 2, B.QUARTZ_BLOCK);
      W.fill(204, Y + 3, z, 210, Y + 3, z, B.QUARTZ_BLOCK); // crossbar
      // a few cobwebs behind as the net
      W.set(205, Y + 2, webZ, B.COBWEB);
      W.set(206, Y, webZ, B.COBWEB);
      W.set(208, Y + 1, webZ, B.COBWEB);
      W.set(209, Y + 2, webZ, B.COBWEB);
      W.set(207, Y + 2, webZ, B.COBWEB);
    }
    goal(PZ1, PZ1 - 1);   // north goal, webs at z 183
    goal(PZ2, PZ2 + 1);   // south goal, webs at z 216

    /* =====================================================================
     * 3) FENCE RING around the pitch, with entrance gaps + torches
     * ===================================================================== */
    const FX1 = 194, FX2 = 219, FZ1 = 182, FZ2 = 217;
    fenceRow(FX1, FZ1, FX2, FZ1); fenceRow(FX1, FZ2, FX2, FZ2);
    fenceRow(FX1, FZ1, FX1, FZ2); fenceRow(FX2, FZ1, FX2, FZ2);
    // gaps: west (main entrance), east (to the stands), north (playground), south (shed)
    W.clear(FX1, Y, 198, FX1, Y, 201);
    W.clear(FX2, Y, 195, FX2, Y, 204);
    W.clear(205, Y, FZ1, 208, Y, FZ1);
    W.clear(205, Y, FZ2, 208, Y, FZ2);
    // torches on the fence like the reference (corners + spaced along)
    for (const [tx, tz] of [[FX1, FZ1], [FX2, FZ1], [FX1, FZ2], [FX2, FZ2]]) W.torch(tx, Y + 1, tz);
    for (let x = FX1 + 5; x < FX2; x += 6) {
      if (W.get(x, Y, FZ1)) W.torch(x, Y + 1, FZ1);
      if (W.get(x, Y, FZ2)) W.torch(x, Y + 1, FZ2);
    }
    for (let z = FZ1 + 5; z < FZ2; z += 6) {
      if (W.get(FX1, Y, z)) W.torch(FX1, Y + 1, z);
      if (W.get(FX2, Y, z)) W.torch(FX2, Y + 1, z);
    }

    /* =====================================================================
     * 4) SPECTATOR STANDS — east side, 3 stepped rows facing the pitch
     * ===================================================================== */
    const SZ1 = 188, SZ2 = 211;
    const cushions = ['CARPET_RED', 'CARPET_YELLOW', 'CARPET_LIME', 'CARPET_LIGHTBLUE'];
    for (let z = SZ1; z <= SZ2; z++) {
      const rowSeat = (x, yTop) => {
        const k = (x + z) % 9;
        if (k === 4) {                       // hay bale accent seat
          W.set(x, yTop, z, B.HAY_BALE);
        } else if (k === 7) {                // plank block + colored cushion
          W.set(x, yTop, z, B.SPRUCE_PLANKS);
          W.set(x, yTop + 1, z, B[cushions[z % cushions.length]]);
        } else {
          W.set(x, yTop, z, B.stair('SPRUCE_PLANKS', 'E'));
        }
      };
      rowSeat(221, Y);
      W.set(222, Y, z, B.SPRUCE_PLANKS); rowSeat(222, Y + 1);
      W.fill(223, Y, z, 223, Y + 1, z, B.SPRUCE_PLANKS); rowSeat(223, Y + 2);
      // back wall with striped team colors + railing
      W.fill(224, Y, z, 224, Y + 1, z, (z % 6 === 0) ? B.STRIPPED_SPRUCE_LOG : B.SPRUCE_PLANKS);
      W.set(224, Y + 2, z, ((z >> 1) % 2 === 0) ? B.WOOL_RED : B.WOOL_WHITE);
      W.set(224, Y + 3, z, B.fence('SPRUCE_PLANKS'));
    }
    // lanterns on the back railing
    for (const z of [190, 197, 204, 210]) W.set(224, Y + 3, z, B.LANTERN);
    // stepped end caps
    for (const z of [SZ1 - 1, SZ2 + 1]) {
      W.set(221, Y, z, B.stair('SPRUCE_PLANKS', 'E'));
      W.fill(222, Y, z, 222, Y, z, B.SPRUCE_PLANKS); W.set(222, Y + 1, z, B.stair('SPRUCE_PLANKS', 'E'));
      W.fill(223, Y, z, 224, Y + 1, z, B.SPRUCE_PLANKS); W.set(223, Y + 2, z, B.stair('SPRUCE_PLANKS', 'E'));
      W.set(224, Y + 2, z, B.SPRUCE_PLANKS);
    }

    /* ---- scorekeeper hut (4x3) east of the stands ---- */
    const HX1 = 226, HX2 = 229, HZ1 = 196, HZ2 = 198;
    W.fill(HX1 + 1, G, HZ2 - 1, HX2 - 1, G, HZ2 - 1, B.SPRUCE_PLANKS); // floor swap
    W.walls(HX1, Y, HZ1, HX2, Y + 2, HZ2, B.SPRUCE_PLANKS);
    for (const [cx, cz] of [[HX1, HZ1], [HX2, HZ1], [HX1, HZ2], [HX2, HZ2]])
      W.column(cx, cz, Y, Y + 2, B.OAK_LOG);
    // window toward the pitch + door on the south side
    W.set(HX1, Y + 1, 197, B.GLASS_PANE);
    W.clear(227, Y, HZ2, 227, Y + 1, HZ2);
    // roof: overhanging spruce slabs
    W.fill(HX1 - 1, Y + 3, HZ1 - 1, HX2 + 1, Y + 3, HZ2 + 1, B.slab('SPRUCE_PLANKS'));
    W.fill(HX1, Y + 3, 197, HX2, Y + 3, 197, B.slab('SPRUCE_PLANKS', true));
    // scoreboard on the west face + interior
    W.set(225, Y + 1, 196, B.SIGN_WALL_E);
    W.set(225, Y + 1, 198, B.SIGN_WALL_E);
    W.set(225, Y + 1, 197, B.FRAME_MAP_E);
    W.table(227, Y, 197);
    W.chair(228, Y, 197, 'SPRUCE_PLANKS', 'E');
    W.set(228, Y + 2, 197, B.LANTERN_HANGING);

    /* =====================================================================
     * 5) PLAYGROUND — north strip z 173..181
     * ===================================================================== */
    // colorful terracotta path band + connector to the pitch's north gap
    const pathCols = ['TERRACOTTA_LIME', 'TERRACOTTA_YELLOW', 'TERRACOTTA_ORANGE', 'TERRACOTTA_CYAN'];
    for (let x = 190; x <= 232; x++) for (let z = 180; z <= 181; z++)
      ground(x, z, B[pathCols[(x + z) % 4]]);
    for (let x = 205; x <= 208; x++) ground(x, 182, B[pathCols[x % 4]]);

    /* ---- slide: lime climb + platform, chunky yellow run ---- */
    W.fill(192, Y, 173, 194, Y + 2, 175, B.CONCRETE_LIME);        // solid platform
    // railing on top (leave east side open for the slide, west for the stairs)
    for (const z of [173, 175]) for (let x = 192; x <= 194; x++) W.set(x, Y + 3, z, B.fence('OAK_PLANKS'));
    // climb from the west (ascending east)
    W.set(189, Y, 174, B.stair('CONCRETE_LIME', 'E'));
    W.set(190, Y, 174, B.CONCRETE_LIME); W.set(190, Y + 1, 174, B.stair('CONCRETE_LIME', 'E'));
    W.fill(191, Y, 174, 191, Y + 1, 174, B.CONCRETE_LIME); W.set(191, Y + 2, 174, B.stair('CONCRETE_LIME', 'E'));
    // descending yellow run to the east (solid wedge + slabs, reads chunky)
    W.fill(195, Y, 174, 195, Y + 1, 174, B.CONCRETE_YELLOW); W.set(195, Y + 2, 174, B.slab('CONCRETE_YELLOW'));
    W.set(196, Y, 174, B.CONCRETE_YELLOW); W.set(196, Y + 1, 174, B.slab('CONCRETE_YELLOW'));
    W.set(197, Y, 174, B.slab('CONCRETE_YELLOW'));
    W.set(198, Y, 174, B.slab('CONCRETE_YELLOW'));

    /* ---- swings: log frame, chains, trapdoor seats ---- */
    W.column(203, 174, Y, Y + 2, B.OAK_LOG);
    W.column(209, 174, Y, Y + 2, B.OAK_LOG);
    W.fill(203, Y + 3, 174, 209, Y + 3, 174, B.OAK_LOG);          // crossbar
    for (const sx of [205, 207]) {
      W.set(sx, Y + 2, 174, B.CHAIN);
      W.set(sx, Y + 1, 174, B.TRAPDOOR_B);
    }

    /* ---- climbing frame: plank corners, iron bar panels, top deck ---- */
    const CX1 = 214, CX2 = 217, CZ1 = 173, CZ2 = 176;
    for (const [cx, cz] of [[CX1, CZ1], [CX2, CZ1], [CX1, CZ2], [CX2, CZ2]])
      W.column(cx, cz, Y, Y + 2, B.OAK_PLANKS);
    W.fill(CX1 + 1, Y, CZ1, CX2 - 1, Y + 2, CZ1, B.IRON_BARS);    // north panel
    W.fill(CX2, Y, CZ1 + 1, CX2, Y + 2, CZ2 - 1, B.IRON_BARS);    // east panel
    W.fill(CX1, Y, CZ1 + 1, CX1, Y + 2, CZ2 - 1, B.IRON_BARS);    // west panel (ladder side)
    W.fill(CX1, Y + 3, CZ1, CX2, Y + 3, CZ2, B.OAK_PLANKS);       // top deck
    for (let x = CX1; x <= CX2; x++) for (const z of [CZ1, CZ2])
      if (!(x === CX1 && z === CZ2)) W.set(x, Y + 4, z, B.fence('OAK_PLANKS'));
    W.set(CX2, Y + 4, CZ1 + 1, B.fence('OAK_PLANKS'));
    W.set(CX2, Y + 4, CZ2 - 1, B.fence('OAK_PLANKS'));
    W.set(CX1, Y + 4, CZ1 + 1, B.fence('OAK_PLANKS'));
    W.set(CX1, Y + 4, CZ2 - 1, B.fence('OAK_PLANKS')); // gap stays at the ladder corner
    for (let y = Y; y <= Y + 3; y++) W.set(CX1 - 1, y, CZ2, B.LADDER_E); // ladder up the SW corner

    /* ---- seesaw: fence pivot + tilted slab beam ---- */
    W.set(224, Y, 176, B.fence('OAK_PLANKS'));
    W.set(222, Y, 176, B.slab('OAK_PLANKS'));
    W.set(223, Y, 176, B.slab('OAK_PLANKS', true));
    W.set(224, Y + 1, 176, B.slab('OAK_PLANKS'));
    W.set(225, Y + 1, 176, B.slab('OAK_PLANKS', true));

    /* ---- sandbox with a ball in it ---- */
    for (let x = 228; x <= 231; x++) for (let z = 174; z <= 177; z++) ground(x, z, B.SAND);
    for (let x = 227; x <= 232; x++) { W.set(x, Y, 173, B.slab('OAK_PLANKS')); W.set(x, Y, 178, B.slab('OAK_PLANKS')); }
    for (let z = 174; z <= 177; z++) { W.set(227, Y, z, B.slab('OAK_PLANKS')); W.set(232, Y, z, B.slab('OAK_PLANKS')); }
    W.set(229, Y, 175, B.BALL);

    /* ---- jack-o-lantern post for fun ---- */
    W.set(211, Y, 178, B.fence('OAK_PLANKS'));
    W.set(211, Y + 1, 178, B.fence('OAK_PLANKS'));
    W.set(211, Y + 2, 178, B.JACK_O_LANTERN);

    /* =====================================================================
     * 6) KIDS' CORNER — snack stand, benches, picnic fire, flowers, lamps
     * ===================================================================== */
    /* ---- snack stand (market-stall style) x 233..237, z 174..178 ---- */
    for (let x = 234; x <= 236; x++) for (let z = 175; z <= 177; z++) ground(x, z, B.GRAVEL);
    W.fill(234, Y, 175, 234, Y, 177, B.OAK_PLANKS);               // counter
    W.set(234, Y + 1, 176, B.CAKE);
    W.set(236, Y, 175, B.BARREL); W.set(236, Y, 176, B.BARREL); W.set(236, Y + 1, 176, B.BARREL);
    W.set(236, Y, 177, B.CRAFTING_TABLE);
    for (const [px, pz] of [[233, 174], [237, 174], [233, 178], [237, 178]])
      W.column(px, pz, Y, Y + 2, B.fence('SPRUCE_PLANKS'));
    for (let x = 233; x <= 237; x++) for (let z = 174; z <= 178; z++)
      W.set(x, Y + 3, z, ((x + z) % 2 === 0) ? B.WOOL_RED : B.WOOL_WHITE); // striped awning
    W.set(233, Y + 1, 176, B.SIGN_WALL_E);                        // menu sign on counter front
    W.set(235, Y + 2, 176, B.LANTERN_HANGING);

    /* ---- picnic campfire circle in the east meadow ---- */
    W.set(237, Y, 198, B.CAMPFIRE);
    W.set(235, Y, 198, B.OAK_LOG); W.set(239, Y, 198, B.OAK_LOG);
    W.set(237, Y, 196, B.OAK_LOG); W.set(237, Y, 200, B.OAK_LOG);

    /* ---- benches by the west entrance path ---- */
    bench(189, 197, 'N');   // faces the path (south)
    bench(189, 202, 'S');   // faces the path (north)
    bench(226, 208, 'N');   // near the stands' south end
    W.set(230, Y, 208, B.BALL);  // stray practice ball off-field

    /* ---- flower beds ---- */
    flowerBed(230, 186);
    flowerBed(187, 207);
    flowerBed(240, 214);
    flowerBed(213, 220);

    /* ---- lamp posts scattered around ---- */
    for (const [lx, lz] of [[186, 197], [186, 202], [196, 220], [219, 220],
                            [232, 182], [200, 179], [238, 205], [222, 186], [212, 179]])
      W.lampPost(lx, Y, lz);

    /* =====================================================================
     * 7) WEST ENTRANCE — path, hedges, welcome sign (keep edge open)
     * ===================================================================== */
    for (let x = 184; x <= 195; x++) for (let z = 199; z <= 200; z++) ground(x, z, B.DIRT_PATH);
    for (let x = 186; x <= 193; x++) {
      W.set(x, Y, 195, B.OAK_LEAVES);
      W.set(x, Y, 204, B.OAK_LEAVES);
      if (x % 3 === 0) { W.set(x, Y + 1, 195, B.OAK_LEAVES); W.set(x, Y + 1, 204, B.OAK_LEAVES); }
    }
    W.set(188, Y, 198, B.SIGN);   // "KIDS' FOOTBALL FIELD"

    /* =====================================================================
     * 8) SOUTH — path to storage shed, the shed, trees near the edges
     * ===================================================================== */
    for (let z = 218; z <= 226; z++) for (let x = 206; x <= 207; x++) ground(x, z, B.DIRT_PATH);
    for (let x = 199; x <= 207; x++) ground(x, 227, B.DIRT_PATH);

    /* ---- storage shed 5x4, cobble + planks ---- */
    const DX1 = 197, DX2 = 201, DZ1 = 228, DZ2 = 231;
    W.fill(DX1 + 1, G, DZ1 + 1, DX2 - 1, G, DZ2 - 1, B.COBBLESTONE);   // floor swap
    W.walls(DX1, Y, DZ1, DX2, Y + 1, DZ2, B.COBBLESTONE);
    W.walls(DX1, Y + 2, DZ1, DX2, Y + 2, DZ2, B.SPRUCE_PLANKS);
    for (const [cx, cz] of [[DX1, DZ1], [DX2, DZ1], [DX1, DZ2], [DX2, DZ2]]) {
      W.column(cx, cz, Y, Y + 2, B.MOSSY_COBBLESTONE);
    }
    W.clear(199, Y, DZ1, 199, Y + 1, DZ1);                        // door opening (north)
    W.set(199, Y + 1, DZ2, B.GLASS_PANE);                         // south window
    // slab roof with a raised ridge
    W.fill(DX1 - 1, Y + 3, DZ1 - 1, DX2 + 1, Y + 3, DZ2 + 1, B.slab('SPRUCE_PLANKS'));
    W.fill(DX1, Y + 3, 229, DX2, Y + 3, 230, B.slab('SPRUCE_PLANKS', true));
    // interior: barrels, spare ball, spare fences, light
    W.set(198, Y, 230, B.BARREL); W.set(198, Y + 1, 230, B.BARREL);
    W.set(200, Y, 230, B.BALL);
    W.set(200, Y, 229, B.fence('OAK_PLANKS'));
    W.set(198, Y + 2, 229, B.LANTERN_HANGING);
    W.torch(196, Y, 227);                                          // torch by the door

    /* ---- trees (kept >= 3 blocks off the plot edges) ---- */
    W.tree(189, Y, 233, 'oak', rnd);
    W.tree(242, Y, 231, 'spruce', rnd);
    W.tree(240, Y, 177, 'birch', rnd);
    W.tree(187, Y, 178, 'azalea', rnd);
    W.tree(244, Y, 195, 'oak', rnd);

    /* ---- a little tall grass scatter to soften the untouched meadows ---- */
    const meadows = [[230, 188, 245, 218], [186, 208, 193, 232], [204, 218, 216, 226]];
    for (const [mx1, mz1, mx2, mz2] of meadows) {
      for (let i = 0; i < 16; i++) {
        const x = mx1 + ((rnd() * (mx2 - mx1 + 1)) | 0);
        const z = mz1 + ((rnd() * (mz2 - mz1 + 1)) | 0);
        if (W.get(x, Y, z) === 0 && !(x >= 206 && x <= 207)) { // skip the shed path
          W.set(x, Y, z, rnd() < 0.8 ? B.TALL_GRASS : B.FERN);
        }
      }
    }
  });
})();
