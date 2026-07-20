/* =========================================================================
 * MODERN QUARTZ COMPLEX — white high-rise tower + cyan annex, plot (200,44)-(268,120)
 * Sleek quartz tower: 9 floors, stepped massing (setbacks at floors 6 & 8),
 * recessed blue-glass window bays between quartz piers, honeycomb gold accents,
 * glass elevator w/ water column, switchback stair core, lit interiors,
 * roof observation deck + mechanical penthouse + iron spire.
 * Entrance faces WEST toward the plaza with hedge-lined walkway.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('modern', 40, [200, 44, 268, 120], function (W, B) {

    /* ---------------- massing constants ---------------- */
    const F = n => 34 + 4 * (n - 1);          // floor plate Y of floor n (stand on it)
    const ROOF = 70;                           // main roof plate
    const TA = { x1: 214, z1: 56, x2: 235, z2: 73 }; // tier A: floors 1-5 (22x18)
    const TB = { x1: 217, z1: 56, x2: 235, z2: 71 }; // tier B: floors 6-7
    const TC = { x1: 220, z1: 56, x2: 235, z2: 69 }; // tier C: floors 8-9
    const fp = n => (n <= 5 ? TA : (n <= 7 ? TB : TC));
    const inCore = (x, z) => x >= 228 && x <= 233 && z >= 63 && z <= 65;   // stair core
    const inShaft = (x, z) => x >= 230 && x <= 233 && z >= 58 && z <= 61;  // elevator

    /* ---------------- facade helpers ---------------- */
    // quartz-brick spandrel band ring at plate level, chiseled corners
    function band(n) {
      const f = fp(n), y = F(n);
      W.walls(f.x1, y, f.z1, f.x2, y, f.z2, B.QUARTZ_BRICKS);
      for (const [cx, cz] of [[f.x1, f.z1], [f.x1, f.z2], [f.x2, f.z1], [f.x2, f.z2]])
        W.set(cx, y, cz, B.CHISELED_QUARTZ);
    }

    // one 3-high wall strip: pillar corners, piers out 1, window bays recessed 1
    function facadeStrip(n) {
      const f = fp(n), y0 = F(n) + 1;
      const pane = (n <= 2 || n === 9) ? B.PANE_BLUE : B.PANE_LIGHTBLUE;
      const sides = [
        { ax: 'x', fix: f.z1, o: [0, -1], a: f.x1, b: f.x2 },
        { ax: 'x', fix: f.z2, o: [0, 1], a: f.x1, b: f.x2 },
        { ax: 'z', fix: f.x1, o: [-1, 0], a: f.z1, b: f.z2 },
        { ax: 'z', fix: f.x2, o: [1, 0], a: f.z1, b: f.z2 },
      ];
      for (const s of sides) {
        let pier = 0;
        for (let i = s.a; i <= s.b; i++) {
          const x = s.ax === 'x' ? i : s.fix, z = s.ax === 'x' ? s.fix : i;
          const put = (dy, id) => W.set(x, y0 + dy, z, id);
          if (i === s.a || i === s.b) { for (let d = 0; d < 3; d++) put(d, B.QUARTZ_PILLAR); continue; }
          if (i === s.a + 1 || i === s.b - 1) { put(0, B.QUARTZ_BLOCK); put(1, B.SMOOTH_QUARTZ); put(2, B.QUARTZ_BLOCK); continue; }
          const j = i - (s.a + 2);
          if (j % 4 === 3) {                    // pier: pillar + 1-out projection
            for (let d = 0; d < 3; d++) put(d, B.QUARTZ_PILLAR);
            const px = x + s.o[0], pz = z + s.o[1];
            pier++;
            if (n === 1) W.fill(px, 33, pz, px, y0 - 1, pz, B.QUARTZ_BRICKS);          // buttress to ground
            else if (fp(n) === fp(n - 1)) W.set(px, y0 - 1, pz, B.QUARTZ_BRICKS);      // continuous pier over band
            W.set(px, y0, pz, B.CHISELED_QUARTZ);
            W.set(px, y0 + 1, pz, B.QUARTZ_PILLAR);
            W.set(px, y0 + 2, pz, (n % 3 === 2 && pier % 2 === 1) ? B.HONEYCOMB_BLOCK : B.QUARTZ_PILLAR);
          } else {                              // recessed glass bay, set 1 back
            const ix = x - s.o[0], iz = z - s.o[1];
            W.set(ix, y0, iz, B.QUARTZ_BLOCK);
            W.set(ix, y0 + 1, iz, pane);
            W.set(ix, y0 + 2, iz, pane);
          }
        }
      }
    }

    // ceiling sea-lantern grid embedded in the plate above floor n
    function ceilLights(n) {
      const f = fp(n), y = n === 9 ? ROOF : F(n + 1);
      for (let x = f.x1 + 5; x <= f.x2 - 2; x += 4)
        for (let z = f.z1 + 3; z <= f.z2 - 3; z += 4) {
          if (inCore(x, z) || inShaft(x, z)) continue;
          W.set(x, y, z, B.SEA_LANTERN);
        }
    }

    /* ---------------- plinth + floor plates ---------------- */
    W.fill(TA.x1, 33, TA.z1, TA.x2, 34, TA.z2, B.SMOOTH_QUARTZ);       // 2-high plinth
    W.walls(TA.x1, 33, TA.z1, TA.x2, 34, TA.z2, B.QUARTZ_BRICKS);      // base course
    for (let n = 3; n <= 9; n++) {                                     // plates (ceiling of n-1)
      const f = fp(n - 1);
      W.fill(f.x1, F(n), f.z1, f.x2, F(n), f.z2, B.SMOOTH_QUARTZ);
    }
    W.fill(TC.x1, ROOF, TC.z1, TC.x2, ROOF, TC.z2, B.SMOOTH_QUARTZ);   // main roof
    // lobby is double height: plate 2 exists only as mezzanine (south) + core floor
    W.fill(216, F(2), 66, 233, F(2), 72, B.SMOOTH_QUARTZ);             // mezzanine
    W.fill(228, F(2), 63, 233, F(2), 65, B.SMOOTH_QUARTZ);             // core landing

    /* ---------------- bands + facade strips, floors 1..9 ---------------- */
    for (let n = 1; n <= 9; n++) { band(n); facadeStrip(n); }

    /* ---------------- switchback stair core (x228-233, z63-65) ------------- */
    // solid divider spine between the two flights
    W.fill(229, 35, 64, 232, 69, 64, B.SMOOTH_QUARTZ);
    // cut headroom holes in the plate above each flight, then build flights
    for (let n = 1; n <= 9; n++) {
      const py = n === 9 ? ROOF : F(n + 1);
      W.clear(229, py, n % 2 ? 63 : 65, 232, py, n % 2 ? 63 : 65);
    }
    for (let n = 1; n <= 9; n++) {
      const y = F(n);
      for (let k = 0; k < 4; k++) {
        const h = y + 1 + k;
        const x = n % 2 ? 229 + k : 232 - k, z = n % 2 ? 63 : 65;
        if (k > 0) W.fill(x, y + 1, z, x, h - 1, z, B.SMOOTH_QUARTZ);
        W.stair(x, h, z, 'SMOOTH_QUARTZ', n % 2 ? 'E' : 'W');
      }
    }

    /* ---------------- glass elevator: water column + soul glow ------------- */
    W.clear(230, 35, 58, 233, 69, 61);
    W.walls(230, 35, 58, 233, 69, 61, B.GLASS);
    W.set(231, 35, 59, B.SOUL_LANTERN); W.set(232, 35, 60, B.SOUL_LANTERN);
    W.set(232, 35, 59, B.WATER); W.set(231, 35, 60, B.WATER);
    W.fill(231, 36, 59, 232, 68, 60, B.WATER);
    W.fill(231, 69, 59, 232, 69, 60, B.GLASS);
    W.fill(230, 34, 58, 233, 34, 61, B.SEA_LANTERN);                   // glowing pit floor
    /* ---------------- WEST ENTRANCE (faces plaza) ---------------- */
    // carve opening + surrounding pier projections
    W.clear(214, 35, 62, 214, 40, 67);
    W.clear(215, 35, 62, 215, 40, 67);      // recessed bay cells behind
    W.clear(213, 35, 62, 213, 41, 67);      // outward pier bits over the steps
    // frame: pillars, header with gold accents
    W.column(214, 61, 35, 41, B.QUARTZ_PILLAR);
    W.column(214, 68, 35, 41, B.QUARTZ_PILLAR);
    W.fill(214, 41, 61, 214, 41, 68, B.QUARTZ_BRICKS);
    W.fill(214, 41, 63, 214, 41, 66, B.HONEYCOMB_BLOCK);
    W.set(214, 41, 62, B.CHISELED_QUARTZ); W.set(214, 41, 67, B.CHISELED_QUARTZ);
    // glass curtain above door + sidelights, double iron door
    W.fill(214, 38, 62, 214, 40, 67, B.GLASS_BLUE);
    W.fill(214, 35, 62, 214, 37, 63, B.GLASS_LIGHTBLUE);
    W.fill(214, 35, 66, 214, 37, 67, B.GLASS_LIGHTBLUE);
    W.door(214, 35, 64, 'IRON_DOOR', 'W'); W.door(214, 35, 65, 'IRON_DOOR', 'W');
    W.set(214, 37, 64, B.GLASS_LIGHTBLUE); W.set(214, 37, 65, B.GLASS_LIGHTBLUE);
    // vertical sea-lantern light strips beside the entrance
    W.column(214, 60, 35, 40, B.SEA_LANTERN);
    W.column(214, 69, 35, 40, B.SEA_LANTERN);
    // wide quartz steps: 3 rows up to the plinth door
    W.fill(213, 33, 61, 213, 34, 68, B.SMOOTH_QUARTZ);                 // landing
    for (let z = 62; z <= 67; z++) {
      W.stair(211, 33, z, 'SMOOTH_QUARTZ', 'E');
      W.set(212, 33, z, B.SMOOTH_QUARTZ); W.stair(212, 34, z, 'SMOOTH_QUARTZ', 'E');
    }
    W.set(213, 35, 64, B.PRESSURE_PLATE_STONE); W.set(213, 35, 65, B.PRESSURE_PLATE_STONE);
    W.set(215, 35, 64, B.PRESSURE_PLATE_STONE); W.set(215, 35, 65, B.PRESSURE_PLATE_STONE);
    // delivery box + potted azalea + wall signs on the pier faces
    W.set(213, 35, 61, B.CHEST);
    W.set(213, 35, 68, B.POTTED_AZALEA);
    W.set(212, 37, 61, B.SIGN_WALL_E); W.set(212, 37, 68, B.SIGN_WALL_E);
    // portico canopy: quartz pillars + slab roof with recessed sea-lantern downlights
    W.column(210, 61, 33, 38, B.QUARTZ_PILLAR);
    W.column(210, 68, 33, 38, B.QUARTZ_PILLAR);
    W.fill(209, 39, 60, 213, 39, 69, B.slab('SMOOTH_QUARTZ', true));
    W.set(210, 39, 63, B.SEA_LANTERN); W.set(210, 39, 66, B.SEA_LANTERN);
    W.set(212, 39, 62, B.SEA_LANTERN); W.set(212, 39, 67, B.SEA_LANTERN);
    // smooth stone walkway to plot edge + hedge rows + modern lamp posts
    W.fill(200, 32, 63, 212, 32, 66, B.SMOOTH_STONE);
    for (let x = 200; x <= 210; x++) {
      if (x === 203) continue;                                          // lamp gaps
      for (const z of [62, 67]) {
        let leaf = B.OAK_LEAVES;
        if (x % 4 === 1) leaf = B.AZALEA_LEAVES;
        if (x === 207) leaf = B.FLOWERING_AZALEA_LEAVES;
        W.set(x, 33, z, leaf);
      }
    }
    for (const z of [62, 67]) {
      W.set(203, 33, z, B.fence('SMOOTH_STONE'));
      W.set(203, 34, z, B.fence('SMOOTH_STONE'));
      W.set(203, 35, z, B.SEA_LANTERN);
    }

    /* ---------------- setback roof terraces ---------------- */
    function terrace(f, y) {   // iron-bar railing on exposed plate edges of footprint f
      const ry = y + 1;
      const rail = (x, z) => { if (!W.get(x, ry, z)) W.set(x, ry, z, B.IRON_BARS); };
      for (let x = f.x1; x <= f.x2; x++) { rail(x, f.z1); rail(x, f.z2); }
      for (let z = f.z1; z <= f.z2; z++) { rail(f.x1, z); rail(f.x2, z); }
    }
    terrace(TA, F(6));                        // terrace on tier-A roof (floors 6+ set back)
    terrace(TB, F(8));                        // terrace on tier-B roof
    // planters + seats on the west/south terrace strips
    for (const z of [58, 60, 62]) { W.set(215, 55, z, B.MOSS_BLOCK); W.set(215, 56, z, z === 60 ? B.FLOWERING_AZALEA_LEAVES : B.AZALEA_LEAVES); }
    W.stair(215, 55, 66, 'QUARTZ_BLOCK', 'W'); W.stair(215, 55, 67, 'QUARTZ_BLOCK', 'W');
    W.set(215, 55, 69, B.LANTERN);
    for (const x of [220, 224, 228]) { W.set(x, 55, 72, B.MOSS_BLOCK); W.set(x, 56, 72, x === 224 ? B.FLOWERING_AZALEA_LEAVES : B.AZALEA_LEAVES); }
    W.set(232, 55, 72, B.LANTERN);
    for (const z of [58, 61]) { W.set(218, 63, z, B.MOSS_BLOCK); W.set(218, 64, z, B.AZALEA_LEAVES); }
    W.set(218, 63, 66, B.LANTERN);
    for (const x of [223, 227]) { W.set(x, 63, 70, B.MOSS_BLOCK); W.set(x, 64, 70, B.FLOWERING_AZALEA_LEAVES); }

    /* ---------------- balconies (south face) ---------------- */
    function balcony(n, x1, x2, z1, z2, wallZ, doorX) {
      const y = F(n);
      W.fill(x1, y, z1, x2, y, z2, B.SMOOTH_QUARTZ);
      for (let x = x1; x <= x2; x++) W.set(x, y + 1, z2, B.IRON_BARS);
      W.set(x1, y + 1, z1, B.IRON_BARS); W.set(x2, y + 1, z1, B.IRON_BARS);
      for (let x = x1 + 1; x <= x2 - 1; x += 2) W.stair(x, y - 1, z1, 'QUARTZ_BLOCK', 'N', true); // corbels
      W.clear(doorX, y + 1, wallZ - 1, doorX + 1, y + 2, wallZ - 1);   // doorway through recessed bay
    }
    balcony(3, 225, 231, 74, 75, 73, 228);
    balcony(5, 225, 231, 74, 75, 73, 228);
    balcony(7, 223, 228, 72, 73, 71, 224);

    /* ---------------- rooftop: penthouse, deck, spire ---------------- */
    // iron-bar parapet around tier-C roof
    for (let x = TC.x1; x <= TC.x2; x++) for (const z of [TC.z1, TC.z2])
      W.set(x, 71, z, (x === TC.x1 || x === TC.x2 || x % 5 === 0) ? B.QUARTZ_BLOCK : B.IRON_BARS);
    for (let z = TC.z1; z <= TC.z2; z++) for (const x of [TC.x1, TC.x2])
      W.set(x, 71, z, (z === TC.z1 || z === TC.z2 || z % 5 === 0) ? B.QUARTZ_BLOCK : B.IRON_BARS);
    // mechanical penthouse (covers stair exit)
    W.walls(227, 71, 57, 234, 73, 66, B.CONCRETE_LIGHTGRAY);
    W.fill(227, 74, 57, 234, 74, 66, B.slab('CONCRETE_LIGHTGRAY'));
    W.door(227, 71, 63, 'IRON_DOOR', 'W');
    W.set(227, 72, 59, B.IRON_BARS); W.set(227, 72, 60, B.IRON_BARS);  // louvre vents
    W.set(230, 72, 66, B.IRON_BARS); W.set(231, 72, 66, B.IRON_BARS);
    W.set(234, 72, 61, B.IRON_BARS); W.set(234, 72, 62, B.IRON_BARS);
    W.set(229, 73, 58, B.SEA_LANTERN); W.set(232, 73, 65, B.SEA_LANTERN);
    // roof greebles: observers/pistons, chain, trapdoor vents on deck
    W.set(229, 74, 59, B.OBSERVER); W.set(230, 74, 59, B.PISTON); W.set(231, 74, 59, B.IRON_BLOCK);
    W.set(230, 75, 59, B.CHAIN);
    W.set(226, 71, 60, B.TRAPDOOR_B); W.set(226, 71, 62, B.TRAPDOOR_B);
    // chimney with campfire smoke
    W.set(233, 74, 58, B.CONCRETE_LIGHTGRAY); W.set(233, 75, 58, B.CONCRETE_LIGHTGRAY);
    W.set(233, 76, 58, B.CAMPFIRE);
    // lightning-rod spire
    for (let y = 74; y <= 78; y++) W.set(230, y, 62, B.pillar('IRON_BLOCK'));
    W.set(230, 79, 62, B.END_ROD);
    // observation deck (west of penthouse): sea-lantern floor ring, telescope, flag, bench
    for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]])
      W.set(223 + dx, ROOF, 62 + dz, B.SEA_LANTERN);
    W.set(222, 71, 58, B.SCAFFOLDING); W.set(222, 72, 58, B.SCAFFOLDING); W.set(222, 73, 58, B.END_ROD);
    W.column(221, 67, 71, 75, B.fence('IRON_BLOCK'));                  // flag pole
    W.set(222, 74, 67, B.WOOL_CYAN); W.set(223, 74, 67, B.WOOL_CYAN); W.set(222, 73, 67, B.WOOL_CYAN);
    for (let z = 60; z <= 62; z++) W.stair(221, 71, z, 'QUARTZ_BLOCK', 'W');  // bench
    W.set(221, 71, 57, B.POTTED_AZALEA); W.set(221, 71, 64, B.POTTED_TULIP_RED);
    W.set(225, 71, 68, B.POTTED_CORNFLOWER);
    /* ---------------- LOBBY (floors 1-2, double height) ---------------- */
    ceilLights(2);                                            // lanterns in the y42 ceiling
    // dark prismarine inlay ring + center medallion in the quartz floor
    W.walls(218, 34, 60, 231, 34, 69, B.DARK_PRISMARINE);
    W.fill(224, 34, 64, 225, 34, 65, B.CHISELED_QUARTZ);
    W.set(223, 34, 64, B.DARK_PRISMARINE); W.set(226, 34, 65, B.DARK_PRISMARINE);
    W.set(224, 34, 63, B.DARK_PRISMARINE); W.set(225, 34, 66, B.DARK_PRISMARINE);
    // reception desk + lectern
    W.fill(224, 35, 60, 226, 35, 60, B.SMOOTH_QUARTZ);
    W.set(227, 35, 60, B.LECTERN);
    W.fill(224, 35, 61, 226, 35, 61, B.CARPET_CYAN);
    // lounge seating under the mezzanine
    W.fill(218, 35, 67, 220, 35, 68, B.CARPET_WHITE);
    W.chair(218, 35, 66, 'CONCRETE_WHITE', 'N'); W.chair(219, 35, 66, 'CONCRETE_WHITE', 'N');
    W.chair(218, 35, 69, 'CONCRETE_CYAN', 'S'); W.chair(219, 35, 69, 'CONCRETE_CYAN', 'S');
    W.table(220, 35, 67);
    // potted azaleas + wall maps on pier faces
    W.set(217, 35, 59, B.POTTED_AZALEA); W.set(217, 35, 70, B.POTTED_AZALEA); W.set(226, 35, 57, B.POTTED_AZALEA);
    W.set(219, 37, 72, B.FRAME_MAP_S); W.set(227, 37, 72, B.FRAME_MAP_S);
    W.set(219, 37, 57, B.FRAME_MAP_N); W.set(227, 37, 57, B.PAINTING1_N);
    // chandelier: glowstone cluster on chains under the y42 plate
    for (const [cx, cz] of [[224, 64], [225, 64], [224, 65], [225, 65]]) {
      W.set(cx, 41, cz, B.CHAIN); W.set(cx, 40, cz, B.GLOWSTONE);
    }
    // mezzanine railing + downlights in its slab
    for (let x = 216; x <= 227; x++) W.set(x, 39, 66, B.IRON_BARS);
    W.set(219, 38, 70, B.SEA_LANTERN); W.set(224, 38, 70, B.SEA_LANTERN);
    W.fill(218, 39, 68, 226, 39, 71, B.CARPET_LIGHTBLUE);     // mezzanine rug
    W.set(217, 39, 71, B.POTTED_BAMBOO); W.set(227, 39, 71, B.POTTED_FERN);

    /* ---------------- OFFICES (floors 3-5) ---------------- */
    function office(n) {
      const y = F(n) + 1;
      ceilLights(n);
      for (const [dz, cdir, cz] of [[60, 'S', 61], [67, 'N', 66]]) {   // two desk banks
        for (let x = 219; x <= 224; x++) {
          W.set(x, y, dz, B.slab('SMOOTH_STONE', true));
          if (x % 2 === 1) W.chair(x, y, cz, 'CONCRETE_WHITE', cdir);
        }
      }
      // bookshelf wall along the west side + item frames on it
      W.fill(216, y, 59, 216, y + 1, 70, B.BOOKSHELF);
      W.set(217, y + 1, 62, B.FRAME_MAP_W); W.set(217, y + 1, 66, B.FRAME_BOOK_W);
      W.set(219, y, 57, B.ENDER_CHEST);
      // brewing lab behind a glass partition (SE corner)
      W.fill(229, y, 66, 233, y + 2, 66, B.GLASS_PANE);
      W.clear(231, y, 66, 231, y + 1, 66);
      W.fill(232, y, 68, 233, y, 68, B.SMOOTH_STONE);
      W.set(232, y + 1, 68, B.BREWING_STAND);
      W.set(230, y, 69, B.CAULDRON); W.set(233, y, 69, B.BOOKSHELF);
      W.set(229, y, 68, B.BARREL);
      W.fill(219, y, 63, 227, y, 64, B.CARPET_LIGHTGRAY);     // aisle carpet
      W.set(226, y, 57, B.POTTED_CACTUS);
      W.set(223, y + 1, 70, B.PAINTING2_S);
    }
    office(3); office(4); office(5);

    /* ---------------- APARTMENTS (floors 6-8) ---------------- */
    function cageLamp(x, y, z) {                              // lantern in an iron cage
      W.set(x, y, z, B.LANTERN_HANGING);
      W.set(x - 1, y, z, B.IRON_BARS); W.set(x + 1, y, z, B.IRON_BARS);
    }
    function apartment(n) {
      const y = F(n) + 1, big = n <= 7;                       // floors 6-7 tier B, 8 tier C
      const bx = big ? 220 : 223, kz = big ? 69 : 67;
      ceilLights(n);
      // bedroom corner
      W.bed(bx, y, 58, n === 7 ? 'LIGHTBLUE' : 'WHITE', 'S');
      W.set(bx - 1, y, 58, B.CHEST); W.set(bx - 1, y + 1, 58, B.LANTERN);
      W.fill(bx + 1, y, 58, bx + 1, y, 59, B.CARPET_WHITE);
      W.set(bx + 3, y, 58, B.ENDER_CHEST);
      // kitchen row along the south side
      W.set(bx, y, kz, B.SMOKER); W.set(bx + 1, y, kz, B.SMOOTH_STONE);
      W.set(bx + 2, y, kz, B.CAULDRON); W.set(bx + 3, y, kz, B.SMOOTH_STONE);
      W.set(bx + 4, y, kz, B.BARREL); W.set(bx + 5, y, kz, B.CRAFTING_TABLE);
      // dining
      W.table(bx + 7, y, 60); W.chair(bx + 6, y, 60, 'BIRCH_PLANKS', 'W'); W.chair(bx + 8, y, 60, 'BIRCH_PLANKS', 'E');
      // hallway runner + caged wall lanterns
      W.fill(bx, y, 62, bx + 7, y, 62, n === 7 ? B.CARPET_CYAN : B.CARPET_WHITE);
      cageLamp(bx + 2, y + 2, 62); cageLamp(bx + 6, y + 2, 62);
      if (n !== 7) {                                          // enchanting corner
        const ex = big ? 232 : 231, ez = big ? 68 : 66;
        W.set(ex, y, ez, B.ENCHANTING_TABLE);
        W.fill(ex - 1, y, ez + 1, ex + 1, y + 1, ez + 1, B.BOOKSHELF);
      } else {                                                // reading nook
        W.fill(231, y, 69, 233, y + 1, 69, B.BOOKSHELF);
        W.chair(232, y, 67, 'DARK_OAK_PLANKS', 'S');
        W.set(231, y, 67, B.CARPET_CYAN);
      }
      W.set(bx + 1, y + 1, big ? 70 : 68, B.PAINTING1_S);
      W.set(big ? 227 : 228, y, 57, B.POTTED_TULIP_WHITE);
    }
    apartment(6); apartment(7); apartment(8);

    /* ---------------- FLOOR 9: sky lounge ---------------- */
    {
      const y = F(9) + 1;                                     // 67
      ceilLights(9);
      W.fill(223, y, 60, 226, y, 63, B.CARPET_LIGHTBLUE);
      for (let x = 223; x <= 226; x++) W.chair(x, y, 59, 'CONCRETE_WHITE', 'N');
      for (let z = 60; z <= 63; z++) W.chair(222, y, z, 'CONCRETE_WHITE', 'W');
      W.table(224, y, 62);
      W.set(222, y, 66, B.JUKEBOX); W.set(223, y, 66, B.NOTE_BLOCK);
      W.fill(225, y, 67, 227, y + 1, 67, B.BOOKSHELF);
      W.set(226, y + 1, 66, B.FRAME_POTION_S);
      W.set(231, y, 66, B.SMOOTH_QUARTZ); W.set(231, y + 1, 66, B.CAKE);
      W.chair(230, y, 66, 'BIRCH_PLANKS', 'W');
      W.set(222, y, 57, B.POTTED_AZALEA); W.set(227, y, 57, B.POTTED_TULIP_RED);
      cageLamp(225, y + 2, 62);
    }
    /* ================= ANNEX (cyan concrete, 12x10, 3 storeys) ================= */
    const AN = { x1: 218, z1: 82, x2: 229, z2: 91 };
    W.fill(AN.x1, 33, AN.z1, AN.x2, 33, AN.z2, B.CONCRETE_WHITE);      // ground plate
    W.fill(AN.x1, 38, AN.z1, AN.x2, 38, AN.z2, B.CONCRETE_WHITE);
    W.fill(AN.x1, 42, AN.z1, AN.x2, 42, AN.z2, B.CONCRETE_WHITE);
    W.fill(AN.x1, 46, AN.z1, AN.x2, 46, AN.z2, B.CONCRETE_WHITE);      // roof garden slab
    W.walls(AN.x1, 34, AN.z1, AN.x2, 45, AN.z2, B.CONCRETE_CYAN);
    W.walls(AN.x1, 37, AN.z1, AN.x2, 37, AN.z2, B.GOLD_BLOCK);         // gold trim strips
    W.walls(AN.x1, 41, AN.z1, AN.x2, 41, AN.z2, B.GOLD_BLOCK);
    for (const [cx, cz] of [[AN.x1, AN.z1], [AN.x1, AN.z2], [AN.x2, AN.z1], [AN.x2, AN.z2]])
      W.column(cx, cz, 34, 45, B.CONCRETE_WHITE);                      // white corner piers
    // big glass windows on three storeys
    for (const y of [35, 39, 43]) {
      for (const zz of [84, 88]) { W.fill(AN.x1, y, zz, AN.x1, y + 1, zz + 1, B.GLASS); W.fill(AN.x2, y, zz, AN.x2, y + 1, zz + 1, B.GLASS); }
      for (const xx of [220, 223, 226]) {
        W.fill(xx, y, AN.z2, xx + 1, y + 1, AN.z2, B.GLASS);
        if (y !== 39) W.fill(xx === 223 ? 222 : xx, y, AN.z1, (xx === 223 ? 224 : xx + 1), y + 1, AN.z1, B.GLASS);
      }
    }
    // west double door + step
    W.clear(218, 36, 86, 218, 36, 87);
    W.door(218, 34, 86, 'IRON_DOOR', 'W'); W.door(218, 34, 87, 'IRON_DOOR', 'W');
    W.set(218, 36, 86, B.GLASS); W.set(218, 36, 87, B.GLASS);
    W.stair(217, 33, 86, 'SMOOTH_STONE', 'E'); W.stair(217, 33, 87, 'SMOOTH_STONE', 'E');
    W.fill(206, 32, 86, 216, 32, 87, B.SMOOTH_STONE);                  // path toward plaza side
    // interior stair ground->2 (along z=83) + ladder 2->roof
    W.clear(220, 38, 83, 223, 38, 83);
    for (let k = 0; k < 4; k++) {
      const x = 220 + k, h = 34 + k;
      if (k > 0) W.fill(x, 34, 83, x, h - 1, 83, B.CONCRETE_WHITE);
      W.stair(x, h, 83, 'CONCRETE_WHITE', 'E');
    }
    W.clear(228, 42, 83, 228, 42, 83); W.clear(228, 46, 83, 228, 46, 83);
    for (let y = 39; y <= 45; y++) W.set(228, y, 83, B.LADDER_N);
    // ground cafe
    W.fill(226, 34, 84, 228, 34, 84, B.SMOOTH_QUARTZ);
    W.set(227, 35, 84, B.CAKE); W.set(228, 34, 85, B.SMOKER); W.set(228, 34, 86, B.BARREL);
    W.table(221, 34, 88); W.chair(220, 34, 88, 'BIRCH_PLANKS', 'W'); W.chair(222, 34, 88, 'BIRCH_PLANKS', 'E');
    W.table(224, 34, 90); W.chair(225, 34, 90, 'BIRCH_PLANKS', 'E');
    W.fill(220, 34, 85, 222, 34, 86, B.CARPET_CYAN);
    W.set(221, 38, 86, B.SEA_LANTERN); W.set(226, 38, 89, B.SEA_LANTERN);
    W.set(224, 37, 87, B.LANTERN_HANGING);
    // floor 2 studio
    W.bed(220, 39, 89, 'CYAN', 'E');
    W.set(219, 39, 90, B.CHEST); W.set(228, 39, 90, B.ENDER_CHEST);
    W.fill(226, 39, 90, 227, 39, 90, B.slab('SMOOTH_STONE', true)); W.chair(226, 39, 89, 'CONCRETE_WHITE', 'S');
    W.fill(219, 39, 84, 219, 40, 85, B.BOOKSHELF);
    for (let x = 220; x <= 223; x++) W.set(x, 39, 84, B.IRON_BARS);    // stairwell rail
    W.fill(222, 39, 87, 225, 39, 88, B.CARPET_WHITE);
    W.set(222, 42, 87, B.SEA_LANTERN); W.set(226, 42, 85, B.SEA_LANTERN);
    // floor 3 studio/atelier
    W.set(221, 43, 88, B.ARMOR_STAND); W.set(228, 43, 90, B.CRAFTING_TABLE);
    W.set(223, 44, 84, B.PAINTING1_N); W.set(219, 44, 86, B.PAINTING2_W);
    W.set(226, 43, 90, B.BULLETIN); W.table(222, 43, 90); W.chair(223, 43, 90, 'BIRCH_PLANKS', 'E');
    W.set(222, 46, 86, B.SEA_LANTERN); W.set(226, 46, 89, B.SEA_LANTERN);
    // rooftop garden
    W.walls(AN.x1, 47, AN.z1, AN.x2, 47, AN.z2, B.slab('CONCRETE_WHITE'));
    W.fill(220, 47, 84, 222, 47, 85, B.MOSS_BLOCK);
    W.set(220, 48, 84, B.AZALEA_LEAVES); W.set(222, 48, 85, B.FLOWERING_AZALEA_LEAVES);
    W.set(221, 48, 85, B.TULIP_PINK); W.set(221, 48, 84, B.POPPY);
    W.fill(225, 47, 88, 227, 47, 89, B.MOSS_BLOCK);
    W.set(225, 48, 89, B.FLOWERING_AZALEA_LEAVES); W.set(227, 48, 88, B.AZALEA_LEAVES);
    W.set(226, 48, 89, B.CORNFLOWER); W.set(226, 48, 88, B.OXEYE_DAISY);
    W.fill(223, 47, 86, 228, 47, 87, B.slab('SMOOTH_STONE'));          // slab path
    W.set(219, 47, 90, B.LANTERN); W.set(228, 47, 84, B.LANTERN);

    /* ================= GLASS BRIDGE (tower floor 2 -> annex) ================= */
    W.fill(222, 38, 74, 224, 38, 81, B.SMOOTH_QUARTZ);
    W.fill(222, 38, 74, 222, 38, 81, B.GOLD_BLOCK);                    // gold edge strips
    W.fill(224, 38, 74, 224, 38, 81, B.GOLD_BLOCK);
    W.set(223, 38, 77, B.SEA_LANTERN); W.set(223, 38, 80, B.SEA_LANTERN);
    W.fill(222, 39, 74, 222, 40, 81, B.GLASS); W.fill(224, 39, 74, 224, 40, 81, B.GLASS);
    W.fill(222, 41, 74, 224, 41, 81, B.GLASS);
    for (const sx of [222, 224]) for (const sz of [77, 78]) W.column(sx, sz, 33, 37, B.QUARTZ_PILLAR);
    W.clear(222, 39, 73, 224, 40, 73);                                 // opening in tower wall
    W.clear(222, 39, 72, 224, 41, 72);                                 // and its recessed bay
    W.clear(222, 39, 82, 224, 40, 82);                                 // opening into annex

    /* ================= LANDSCAPING ================= */
    // hedge along tower south base (gap for the bridge piers)
    for (let x = 216; x <= 232; x++) {
      if (x >= 221 && x <= 225) continue;
      W.set(x, 33, 76, x % 5 === 2 ? B.FLOWERING_AZALEA_LEAVES : B.OAK_LEAVES);
    }
    // hedge-ringed flower garden SE of the annex
    W.walls(233, 33, 84, 241, 33, 90, B.OAK_LEAVES);
    W.set(237, 33, 84, B.AZALEA_LEAVES); W.set(233, 33, 87, B.AZALEA_LEAVES);
    const flow = [B.TULIP_RED, B.OXEYE_DAISY, B.CORNFLOWER, B.TULIP_WHITE, B.ALLIUM];
    for (let x = 234; x <= 240; x++) for (let z = 85; z <= 89; z++) {
      if (x === 237 && z === 87) continue;
      if ((x + z) % 2 === 0) W.set(x, 33, z, flow[(x * 3 + z) % flow.length]);
    }
    W.tree(237, 33, 87, 'azalea');
    // scattered trees + flowers around the plot
    W.tree(246, 33, 100, 'azalea'); W.tree(256, 33, 96, 'birch');
    W.tree(240, 33, 110, 'oak'); W.tree(260, 33, 110, 'azalea');
    W.tree(205, 33, 95, 'oak'); W.tree(207, 33, 110, 'birch');
    for (const [fx, fz, id] of [[206, 58, B.TULIP_WHITE], [207, 59, B.CORNFLOWER], [208, 58, B.OXEYE_DAISY],
    [206, 71, B.TULIP_RED], [207, 70, B.ALLIUM], [208, 71, B.TULIP_PINK]])
      W.set(fx, 33, fz, id);
    W.set(210, 33, 71, B.SIGN);                                        // walkway sign post

    /* ================= quartz retaining wall on N/E plot edges ================= */
    W.fill(200, 33, 44, 268, 34, 44, B.QUARTZ_BRICKS);
    W.fill(200, 35, 44, 268, 35, 44, B.slab('QUARTZ_BLOCK'));
    W.fill(200, 33, 45, 267, 33, 45, B.QUARTZ_BRICKS);
    W.fill(200, 34, 45, 267, 34, 45, B.slab('QUARTZ_BLOCK'));
    W.fill(268, 33, 45, 268, 34, 120, B.QUARTZ_BRICKS);
    W.fill(268, 35, 45, 268, 35, 120, B.slab('QUARTZ_BLOCK'));
    W.fill(267, 33, 46, 267, 33, 120, B.QUARTZ_BRICKS);
    W.fill(267, 34, 46, 267, 34, 120, B.slab('QUARTZ_BLOCK'));
    for (let x = 204; x <= 264; x += 8) W.set(x, 34, 44, B.CHISELED_QUARTZ);
    for (let z = 48; z <= 116; z += 8) W.set(268, 34, z, B.CHISELED_QUARTZ);
  });
})();
