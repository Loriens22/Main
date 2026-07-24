/* =====================================================================
   THE BEE HALL  —  colossal bee statue on a honey-timber tower
   ---------------------------------------------------------------------
   Zone : x -16..14   z -50..-24   ground y=40   max y=84
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;

  /* ---------------- geometry constants ------------------------------ */
  const GY = 40;                              // top grass block

  const PX0 = -11, PX1 = 9, PZ0 = -46, PZ1 = -29;   // podium
  const PTOP = 44;                                  // podium top block

  const TX0 = -8, TX1 = 6, TZ0 = -44, TZ1 = -32;    // tower footprint 15x13
  const IX0 = TX0 + 1, IX1 = TX1 - 1;               // interior -7..5
  const IZ0 = TZ0 + 1, IZ1 = TZ1 - 1;               // interior -43..-33

  const F0 = 44;            // ground-floor slab   (stand 45)
  const F1 = 51;            // first-floor slab    (stand 52)
  const F2 = 57;            // loft slab           (stand 58)
  const FR = 63;            // roof slab
  const PLINTH = 64;        // bee plinth top

  const BX = -1, BY = 69;   // bee body axis
  const HEAD_Z = -26;       // front face of the head

  /* ---------------- tiny helpers ------------------------------------ */
  function px(list) { return W.pick(list); }

  /** speckled wall material */
  const TIMBER_FILL = [
    B.HONEYCOMB_BLOCK, B.HONEYCOMB_BLOCK, B.HONEYCOMB_BLOCK,
    B.YELLOW_TERRACOTTA, B.YELLOW_TERRACOTTA,
    B.ORANGE_TERRACOTTA, B.MUD_BRICKS, B.MUD_BRICKS,
  ];
  const PLANK_MIX = [B.SPRUCE_PLANKS, B.SPRUCE_PLANKS, B.SPRUCE_PLANKS, B.DARK_OAK_PLANKS];
  const STONE_MIX = [B.STONE_BRICKS, B.STONE_BRICKS, B.STONE_BRICKS, B.STONE_BRICKS,
    B.MOSSY_STONE_BRICKS, B.CRACKED_STONE_BRICKS, B.COBBLESTONE, B.ANDESITE];
  const COBBLE_MIX = [B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.ANDESITE];
  const FLOWERS = [B.POPPY, B.DANDELION, B.ALLIUM, B.CORNFLOWER, B.OXEYE_DAISY,
    B.RED_TULIP, B.PINK_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP,
    B.LILY_OF_THE_VALLEY, B.BLUE_ORCHID];
  const TALL_FLOWERS = [B.SUNFLOWER, B.ROSE_BUSH, B.LILAC];

  function fillMix(x0, y0, z0, x1, y1, z1, list) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          W.set(x, y, z, px(list));
  }
  function wallsMix(x0, y0, z0, x1, y1, z1, list) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          if (x === x0 || x === x1 || z === z0 || z === z1) W.set(x, y, z, px(list));
  }
  function onGrass(x, z) {
    const g = W.get(x, GY, z);
    return g === B.GRASS_BLOCK || g === B.PODZOL || g === B.COARSE_DIRT || g === B.DIRT_PATH;
  }

  /* =================================================================== */
  /* 1.  PODIUM / MOUND TERRACE                                          */
  /* =================================================================== */
  function podium() {
    // solid mass 41..44
    fillMix(PX0, 41, PZ0, PX1, PTOP - 1, PZ1, STONE_MIX);
    // top surface — flagstone with moss
    for (let z = PZ0; z <= PZ1; z++)
      for (let x = PX0; x <= PX1; x++) {
        const r = W.rand();
        W.set(x, PTOP, z, r < 0.10 ? B.MOSS_BLOCK : r < 0.22 ? B.MOSSY_COBBLESTONE :
          r < 0.34 ? B.ANDESITE : r < 0.42 ? B.COBBLESTONE : B.STONE_BRICKS);
      }
    // chamfered skirt: one extra ring at y41..42 so the terrace is not a cliff
    for (let z = PZ0 - 1; z <= PZ1 + 1; z++)
      for (let x = PX0 - 1; x <= PX1 + 1; x++) {
        if (x >= PX0 && x <= PX1 && z >= PZ0 && z <= PZ1) continue;
        W.set(x, 41, z, px(COBBLE_MIX));
        W.set(x, 42, z, px(COBBLE_MIX));
      }
    // stair trim around the skirt so it steps down to the meadow
    for (let x = PX0 - 1; x <= PX1 + 1; x++) {
      W.stair(x, 43, PZ0 - 1, B.STONE_BRICK_STAIRS, 's');
      W.stair(x, 43, PZ1 + 1, B.STONE_BRICK_STAIRS, 'n');
    }
    for (let z = PZ0 - 1; z <= PZ1 + 1; z++) {
      W.stair(PX0 - 1, 43, z, B.STONE_BRICK_STAIRS, 'e');
      W.stair(PX1 + 1, 43, z, B.STONE_BRICK_STAIRS, 'w');
    }

    // retaining wall on the terrace rim (gap for the grand stair + ramps)
    for (let x = PX0; x <= PX1; x++) {
      if (!(x >= -7 && x <= 5)) { W.set(x, PTOP + 1, PZ1, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL])); }
      W.set(x, PTOP + 1, PZ0, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL]));
    }
    for (let z = PZ0; z <= PZ1; z++) {
      if (z >= -40 && z <= -36) continue;           // side ramps
      W.set(PX0, PTOP + 1, z, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL]));
      W.set(PX1, PTOP + 1, z, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL]));
    }
    // lantern posts on the rim
    const posts = [[PX0, PZ0], [PX1, PZ0], [PX0, PZ1], [PX1, PZ1],
      [PX0, -38], [PX1, -38], [-11, -33], [9, -33], [-4, PZ0], [2, PZ0]];
    for (const [x, z] of posts) {
      W.set(x, PTOP + 1, z, B.STONE_BRICKS);
      W.set(x, PTOP + 2, z, B.COBBLE_WALL);
      W.set(x, PTOP + 3, z, B.LANTERN);
      W.marker('spark', x, PTOP + 3, z, { rate: 0.25 });
    }

    // side ramps up onto the terrace (west + east)
    for (let i = 0; i < 4; i++) {
      const y = 44 - i;
      W.stair(PX0 - 1 - i, y, -38, B.STONE_BRICK_STAIRS, 'e');
      W.stair(PX0 - 1 - i, y, -37, B.STONE_BRICK_STAIRS, 'e');
      W.fill(PX0 - 1 - i, 41, -38, PX0 - 1 - i, y - 1, -37, B.STONE_BRICKS);
      W.stair(PX1 + 1 + i, y, -38, B.STONE_BRICK_STAIRS, 'w');
      W.stair(PX1 + 1 + i, y, -37, B.STONE_BRICK_STAIRS, 'w');
      W.fill(PX1 + 1 + i, 41, -38, PX1 + 1 + i, y - 1, -37, B.STONE_BRICKS);
    }
  }

  /* ---- grand approach stair, south face, down toward the plaza ------ */
  function grandStair() {
    const steps = [[-28, 44], [-27, 43], [-26, 42], [-25, 41]];
    for (const [z, y] of steps) {
      for (let x = -7; x <= 5; x++) {
        W.fill(x, 41, z, x, y - 1, z, px(STONE_MIX));
        W.stair(x, y, z, W.chance(0.18) ? B.MOSSY_COBBLE_STAIRS : B.STONE_BRICK_STAIRS, 'n');
      }
      // cheek walls
      for (const cx of [-8, 6]) {
        W.fill(cx, 41, z, cx, y, z, px(COBBLE_MIX));
        W.set(cx, y + 1, z, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL]));
      }
    }
    // newel posts with lanterns at the head and foot of the stair
    for (const [cx, cz] of [[-8, -28], [6, -28], [-8, -25], [6, -25]]) {
      W.fill(cx, 41, cz, cx, 45, cz, px(STONE_MIX));
      W.set(cx, 46, cz, B.CHISELED_STONE_BRICKS);
      W.set(cx, 47, cz, B.LANTERN);
      W.marker('spark', cx, 47, cz, { rate: 0.3 });
    }
    // landing apron at the foot
    for (let z = -24; z <= -24; z++)
      for (let x = -8; x <= 6; x++) W.set(x, GY, z, W.chance(0.35) ? B.COBBLESTONE : B.DIRT_PATH);
  }

  /* =================================================================== */
  /* 2.  MEADOW + GARDEN FURNITURE (everything off the podium)           */
  /* =================================================================== */
  function meadow() {
    // dirt-path walkways looping round the mound
    const paths = [];
    for (let z = -47; z <= -24; z++) { paths.push([-13, z]); paths.push([-12, z]); paths.push([11, z]); paths.push([12, z]); }
    for (let x = -13; x <= 12; x++) { paths.push([x, -48]); paths.push([x, -47]); }
    for (let x = -8; x <= 6; x++) { paths.push([x, -24]); }
    for (const [x, z] of paths) {
      if (x < -16 || x > 14 || z < -50 || z > -24) continue;
      if (W.get(x, GY, z) === B.GRASS_BLOCK) W.set(x, GY, z, W.chance(0.2) ? B.COARSE_DIRT : B.DIRT_PATH);
      if (!W.isAir(x, GY + 1, z)) W.set(x, GY + 1, z, 0);
    }

    // dense flower meadow everywhere else on grass
    for (let z = -50; z <= -24; z++)
      for (let x = -16; x <= 14; x++) {
        if (!onGrass(x, z)) continue;
        if (W.get(x, GY, z) === B.DIRT_PATH) continue;
        if (!W.isAir(x, GY + 1, z)) W.set(x, GY + 1, z, 0);
        const r = W.rand();
        if (r < 0.30) W.set(x, GY + 1, z, px(FLOWERS));
        else if (r < 0.44) W.set(x, GY + 1, z, px(TALL_FLOWERS));
        else if (r < 0.70) W.set(x, GY + 1, z, W.chance(0.15) ? B.FERN : B.TALL_GRASS);
        else if (r < 0.74) W.set(x, GY, z, B.MOSS_BLOCK);
        else if (r < 0.77) W.set(x, GY + 1, z, B.MOSS_CARPET);
      }

    // moss + azalea clumps
    W.seed(60611);
    for (let i = 0; i < 14; i++) {
      const cx = W.randRange(-15, 13), cz = W.randRange(-49, -25);
      if (cx >= PX0 - 2 && cx <= PX1 + 2 && cz >= PZ0 - 2 && cz <= PZ1 + 2) continue;
      W.disc(cx, GY, cz, 2, B.MOSS_BLOCK);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
        if (W.chance(0.35) && W.isAir(cx + dx, GY + 1, cz + dz) && onGrass(cx + dx, cz + dz))
          W.set(cx + dx, GY + 1, cz + dz, B.MOSS_CARPET);
      if (W.chance(0.5)) {
        W.set(cx, GY + 1, cz, B.OAK_LOG);
        for (let dy = 2; dy <= 3; dy++)
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (dy === 3 && (dx || dz) && W.chance(0.6)) continue;
            W.setIfAir(cx + dx, GY + dy, cz + dz, W.chance(0.4) ? B.FLOWERING_AZALEA : B.AZALEA_LEAVES);
          }
      }
      W.marker('firefly', cx, GY + 2, cz, { r: 3, count: 5 });
    }
  }

  /* ---- free-standing beehive posts ---------------------------------- */
  function hivePosts() {
    const spots = [[-14, -43], [-14, -31], [12, -43], [12, -31], [-6, -49], [3, -49]];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const h = 3 + (i % 2);
      W.set(x, GY, z, B.COARSE_DIRT);
      for (let k = 1; k <= h; k++) W.set(x, GY + k, z, k === 1 ? B.OAK_LOG : B.OAK_FENCE);
      W.set(x, GY + h + 1, z, i % 2 ? B.BEEHIVE : B.BEE_NEST);
      W.set(x, GY + h + 2, z, W.chance(0.5) ? B.HONEYCOMB_SLAB : B.OAK_SLAB);
      W.marker('bee', x, GY + h + 1, z, { r: 2, count: 5 });
      // flowers crowding the post
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
        if (W.chance(0.5) && onGrass(x + dx, z + dz) && W.isAir(x + dx, GY + 1, z + dz))
          W.set(x + dx, GY + 1, z + dz, px(FLOWERS));
      // a couple of bee props hovering
      W.setIfAir(x + 1, GY + h + 3, z + 1, B.BEE_BODY);
      W.setIfAir(x - 1, GY + 3, z - 1, B.BEE_BODY);
    }
  }

  /* ---- honey pond, cauldron cluster, braziers ----------------------- */
  function gardenProps() {
    // honey pond (sunken bowl, north-west of the mound)
    const cx = -14, cz = -37;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.abs(dx) / 2.2 + Math.abs(dz) / 3.2;
        if (d > 1.05) continue;
        W.set(cx + dx, GY, cz + dz, d > 0.7 ? B.HONEYCOMB_BLOCK : B.HONEY_BLOCK);
        W.set(cx + dx, GY - 1, cz + dz, B.HONEYCOMB_BLOCK);
        if (W.isAir(cx + dx, GY + 1, cz + dz) && d < 0.7) W.set(cx + dx, GY + 1, cz + dz, B.HONEY_BLOCK);
      }
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.abs(dx) / 2.2 + Math.abs(dz) / 3.2;
        if (d <= 1.05 || d > 1.6) continue;
        if (onGrass(cx + dx, cz + dz)) W.set(cx + dx, GY, cz + dz, px(COBBLE_MIX));
      }
    W.marker('glow', cx, GY + 2, cz, { r: 5, color: [1.0, 0.72, 0.22], power: 0.7 });
    W.marker('bee', cx, GY + 3, cz, { r: 4, count: 8 });

    // cauldron cluster on a stone pad, east side
    const qx = 12, qz = -36;
    for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++)
      W.set(qx + dx, GY, qz + dz, px(COBBLE_MIX));
    W.set(qx, GY + 1, qz, B.CAULDRON);
    W.set(qx + 1, GY + 1, qz + 1, B.CAULDRON);
    W.set(qx - 1, GY + 1, qz + 2, B.CAULDRON);
    W.set(qx, GY + 1, qz + 2, B.BARREL);
    W.set(qx + 1, GY + 1, qz - 1, B.HONEY_BLOCK);
    W.set(qx - 1, GY + 1, qz, B.HONEY_BLOCK);
    W.set(qx - 1, GY + 2, qz, B.HONEYCOMB_SLAB);

    // campfire braziers on stone plinths
    const braz = [[-13, -28], [11, -28], [-13, -46], [11, -46], [-2, -49]];
    for (const [x, z] of braz) {
      W.set(x, GY, z, B.STONE_BRICKS);
      W.set(x, GY + 1, z, B.COBBLESTONE);
      W.set(x, GY + 2, z, B.CHISELED_STONE_BRICKS);
      W.set(x, GY + 3, z, B.CAMPFIRE);
      W.marker('smoke', x, GY + 4, z, { rate: 0.5, rise: 0.03, spread: 0.25, size: 0.7 });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (onGrass(x + dx, z + dz)) { W.set(x + dx, GY, z + dz, B.COBBLESTONE); W.set(x + dx, GY + 1, z + dz, 0); }
    }

    // torches + jack-o-lanterns along the paths
    for (let z = -47; z <= -25; z += 4) {
      for (const x of [-13, 12]) {
        if (W.get(x, GY, z) !== B.DIRT_PATH) continue;
        W.set(x, GY, z, B.COBBLESTONE);
        W.set(x, GY + 1, z, W.chance(0.4) ? B.JACK_O_LANTERN : B.TORCH);
      }
    }
    for (let x = -12; x <= 11; x += 5) {
      W.set(x, GY, -48, B.COBBLESTONE);
      W.set(x, GY + 1, -48, B.OAK_FENCE);
      W.set(x, GY + 2, -48, B.LANTERN);
    }
    // shroomlight accents nestled in the moss
    W.seed(4477);
    for (let i = 0; i < 12; i++) {
      const x = W.randRange(-15, 13), z = W.randRange(-49, -25);
      if (x >= PX0 - 1 && x <= PX1 + 1 && z >= PZ0 - 1 && z <= PZ1 + 1) continue;
      if (!onGrass(x, z)) continue;
      W.set(x, GY, z, B.SHROOMLIGHT);
      W.set(x, GY + 1, z, 0);
    }
    // free-flying bee props over the meadow
    W.seed(9001);
    for (let i = 0; i < 22; i++) {
      const x = W.randRange(-15, 13), z = W.randRange(-49, -25);
      if (x >= PX0 - 1 && x <= PX1 + 1 && z >= PZ0 - 1 && z <= PZ1 + 1) continue;
      W.setIfAir(x, GY + W.randRange(2, 4), z, B.BEE_BODY);
    }
    W.marker('bee', -13, 44, -40, { r: 5, count: 10 });
    W.marker('bee', 12, 44, -40, { r: 5, count: 10 });
    W.marker('firefly', 0, 43, -49, { r: 7, count: 14 });
    W.marker('firefly', -13, 43, -34, { r: 6, count: 12 });
    W.marker('firefly', 11, 43, -34, { r: 6, count: 12 });
  }

  /* =================================================================== */
  /* 3.  THE TIMBER TOWER                                                */
  /* =================================================================== */
  function beam(x0, y, z0, x1, z1, axis) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        W.logAxis(x, y, z, W.chance(0.25) ? B.STRIPPED_SPRUCE_LOG : B.SPRUCE_LOG, axis);
  }

  function window2(x, y, z, side, pane) {
    W.set(x, y, z, pane); W.set(x, y + 1, z, pane);
    const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[side];
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[side];
    W.stair(x + d[0], y - 1, z + d[1], B.DARK_OAK_STAIRS, opp, true);
    W.slab(x + d[0], y + 2, z + d[1], B.SPRUCE_SLAB, 'b');
    if (W.chance(0.4)) W.trapdoor(x + d[0], y + 1, z + d[1], B.DARK_OAK_TRAPDOOR, side, { open: true });
    if (W.chance(0.3)) { W.set(x + d[0], y - 1, z + d[1], B.FLOWER_POT); W.set(x + d[0], y, z + d[1], px(FLOWERS)); }
  }

  function tower() {
    const bands = [[45, 50], [52, 56], [58, 62]];
    // solid mass then hollow
    for (const [a, b] of bands) {
      wallsMix(TX0, a, TZ0, TX1, b, TZ1, TIMBER_FILL);
    }
    // timber frame: corner + regular vertical posts
    for (let x = TX0; x <= TX1; x++)
      for (const z of [TZ0, TZ1]) {
        if (x === TX0 || x === TX1 || (x - TX0) % 4 === 0)
          for (let y = 45; y <= 62; y++) W.logAxis(x, y, z, W.chance(0.22) ? B.STRIPPED_SPRUCE_LOG : B.SPRUCE_LOG, 'y');
      }
    for (let z = TZ0; z <= TZ1; z++)
      for (const x of [TX0, TX1]) {
        if (z === TZ0 || z === TZ1 || (z - TZ0) % 4 === 0)
          for (let y = 45; y <= 62; y++) W.logAxis(x, y, z, W.chance(0.22) ? B.STRIPPED_SPRUCE_LOG : B.SPRUCE_LOG, 'y');
      }
    // horizontal string courses
    for (const y of [45, 50, 51, 56, 57, 62]) {
      beam(TX0, y, TZ0, TX1, TZ0, 'x'); beam(TX0, y, TZ1, TX1, TZ1, 'x');
      beam(TX0, y, TZ0, TX0, TZ1, 'z'); beam(TX1, y, TZ0, TX1, TZ1, 'z');
    }
    // diagonal braces on the long faces
    for (let i = 0; i < 5; i++) {
      W.logAxis(TX0 + 1 + i, 46 + i, TZ0, B.SPRUCE_LOG, 'y');
      W.logAxis(TX1 - 1 - i, 46 + i, TZ0, B.SPRUCE_LOG, 'y');
      W.logAxis(TX0 + 1 + i, 52 + i, TZ1, B.SPRUCE_LOG, 'y');
      W.logAxis(TX1 - 1 - i, 52 + i, TZ1, B.SPRUCE_LOG, 'y');
    }
    // hollow out
    W.clear(IX0, 45, IZ0, IX1, 62, IZ1);
    // floor slabs
    for (const [Y, mat] of [[F1, PLANK_MIX], [F2, PLANK_MIX]]) {
      for (let z = IZ0; z <= IZ1; z++)
        for (let x = IX0; x <= IX1; x++) W.set(x, Y, z, px(mat));
      // honey inlay
      for (let i = 0; i < 14; i++) W.set(W.randRange(IX0, IX1), Y, W.randRange(IZ0, IZ1), B.HONEY_BLOCK);
    }
    // roof slab + overhanging eaves
    for (let z = IZ0; z <= IZ1; z++)
      for (let x = IX0; x <= IX1; x++) W.set(x, FR, z, px([B.DARK_OAK_PLANKS, B.SPRUCE_PLANKS, B.HONEYCOMB_BLOCK]));
    for (let x = TX0 - 2; x <= TX1 + 2; x++) {
      W.stair(x, FR, TZ0 - 1, B.DARK_OAK_STAIRS, 's', true);
      W.stair(x, FR, TZ1 + 1, B.DARK_OAK_STAIRS, 'n', true);
      W.stair(x, FR + 1, TZ0 - 2, B.SPRUCE_STAIRS, 's');
      W.stair(x, FR + 1, TZ1 + 2, B.SPRUCE_STAIRS, 'n');
    }
    for (let z = TZ0 - 1; z <= TZ1 + 1; z++) {
      W.stair(TX0 - 1, FR, z, B.DARK_OAK_STAIRS, 'e', true);
      W.stair(TX1 + 1, FR, z, B.DARK_OAK_STAIRS, 'w', true);
      W.stair(TX0 - 2, FR + 1, z, B.SPRUCE_STAIRS, 'e');
      W.stair(TX1 + 2, FR + 1, z, B.SPRUCE_STAIRS, 'w');
    }
    for (let x = TX0; x <= TX1; x++) for (let z = TZ0; z <= TZ1; z++)
      if (x === TX0 || x === TX1 || z === TZ0 || z === TZ1) W.set(x, FR, z, px([B.HONEYCOMB_BLOCK, B.DARK_OAK_PLANKS]));
    // hanging lanterns under the eaves
    for (let x = TX0 - 1; x <= TX1 + 1; x += 3) {
      W.set(x, FR - 1, TZ0 - 1, B.HANGING_LANTERN);
      W.set(x, FR - 1, TZ1 + 1, B.HANGING_LANTERN);
    }

    /* ---- plinth carrying the bee ---- */
    for (let z = TZ0 + 1; z <= TZ1; z++)
      for (let x = TX0 + 1; x <= TX1 - 1; x++)
        W.set(x, PLINTH, z, px([B.HONEYCOMB_BLOCK, B.HONEYCOMB_BLOCK, B.YELLOW_TERRACOTTA, B.DARK_OAK_PLANKS]));
    for (let x = TX0 + 1; x <= TX1 - 1; x++) {
      W.stair(x, PLINTH, TZ0, B.HONEYCOMB_STAIRS, 's', true);
      W.stair(x, PLINTH, TZ1 + 1, B.HONEYCOMB_STAIRS, 'n', true);
    }

    /* ---- grand arched entrance, south face ---- */
    W.clear(-2, 45, TZ1, 0, 48, TZ1);
    for (const x of [-3, 1]) for (let y = 45; y <= 49; y++)
      W.logAxis(x, y, TZ1, B.STRIPPED_SPRUCE_LOG, 'y');
    W.stair(-2, 49, TZ1, B.DARK_OAK_STAIRS, 'w', true);
    W.set(-1, 49, TZ1, B.HONEYCOMB_BLOCK);
    W.stair(0, 49, TZ1, B.DARK_OAK_STAIRS, 'e', true);
    W.door(-2, 45, TZ1, B.SPRUCE_DOOR, 's');
    W.door(-1, 45, TZ1, B.SPRUCE_DOOR, 's');
    W.door(0, 45, TZ1, B.SPRUCE_DOOR, 's');
    W.set(-3, 48, TZ1 + 1, B.HANGING_LANTERN);
    W.set(1, 48, TZ1 + 1, B.HANGING_LANTERN);
    W.face(-3, 47, TZ1 + 1, B.BEE_NEST, 's');
    W.face(1, 47, TZ1 + 1, B.BEE_NEST, 's');
    W.face(-1, 50, TZ1 + 1, B.SPAWN_SIGN, 's');
    // porch steps
    for (let x = -4; x <= 2; x++) W.stair(x, 44, TZ1 + 1, B.STONE_BRICK_STAIRS, 'n');

    /* ---- windows ---- */
    const panes = [B.YELLOW_PANE, B.ORANGE_STAINED_GLASS ? B.YELLOW_PANE : B.YELLOW_PANE, B.GLASS_PANE, B.YELLOW_PANE];
    for (const [Ybase, hgt] of [[47, 0], [53, 0], [59, 0]]) {
      void hgt;
      for (const x of [-6, -4, 2, 4]) {
        window2(x, Ybase, TZ0, 'n', px(panes));
        window2(x, Ybase, TZ1, 's', px(panes));
      }
      for (const z of [-42, -39, -36, -34]) {
        window2(TX0, Ybase, z, 'w', px(panes));
        window2(TX1, Ybase, z, 'e', px(panes));
      }
    }
    // big arched hall window facing the plaza
    W.clear(-6, 47, TZ1, -4, 49, TZ1);
    for (let y = 47; y <= 49; y++) for (let x = -6; x <= -4; x++)
      W.set(x, y, TZ1, y === 49 ? B.ORANGE_TERRACOTTA : B.YELLOW_STAINED_GLASS);
    W.clear(2, 47, TZ1, 4, 49, TZ1);
    for (let y = 47; y <= 49; y++) for (let x = 2; x <= 4; x++)
      W.set(x, y, TZ1, y === 49 ? B.ORANGE_TERRACOTTA : B.YELLOW_STAINED_GLASS);

    /* ---- internal stairs + floor openings ---- */
    // ground -> first, in the north-west corner
    W.clear(IX0, F1, IZ0, IX0 + 1, F1, IZ0 + 4);
    for (let i = 0; i <= 5; i++) W.stair(IX0, 45 + i, IZ0 + i, B.SPRUCE_STAIRS, 'n');
    for (let i = 0; i <= 5; i++) W.set(IX0 + 1, 45 + i, IZ0 + i, B.SPRUCE_PLANKS);
    // first -> loft, north-east corner
    W.clear(IX1 - 1, F2, IZ0, IX1, F2, IZ0 + 4);
    for (let i = 0; i <= 5; i++) W.stair(IX1, 52 + i, IZ0 + i, B.DARK_OAK_STAIRS, 'n');
    for (let i = 0; i <= 5; i++) W.set(IX1 - 1, 52 + i, IZ0 + i, B.DARK_OAK_PLANKS);
    // loft -> the bee, ladder through the roof
    W.clear(-1, 58, -36, -1, PLINTH, -36);
    for (let y = 58; y <= PLINTH; y++) W.face(-1, y, -36, B.LADDER, 's');
    for (const y of [FR, PLINTH]) W.set(-1, y, -36, 0);
  }

  /* =================================================================== */
  /* 4.  INTERIORS                                                       */
  /* =================================================================== */
  function longTable(x0, x1, y, z) {
    for (let x = x0; x <= x1; x++) {
      W.set(x, y, z, B.SPRUCE_FENCE);
      W.slab(x, y + 1, z, B.DARK_OAK_SLAB, 't');
      if (W.chance(0.75)) { W.set(x, y, z - 1, B.SPRUCE_FENCE); W.slab(x, y + 1, z - 1, B.SPRUCE_SLAB, 'b'); }
      if (W.chance(0.75)) { W.set(x, y, z + 1, B.SPRUCE_FENCE); W.slab(x, y + 1, z + 1, B.SPRUCE_SLAB, 'b'); }
    }
  }
  function potted(x, y, z) {
    W.set(x, y, z, B.FLOWER_POT);
    W.set(x, y + 1, z, W.chance(0.25) ? px(TALL_FLOWERS) : px(FLOWERS));
  }

  /* ---- ground floor: the Honey Hall -------------------------------- */
  function honeyHall() {
    const y = F0 + 1;
    for (let z = IZ0; z <= IZ1; z++)
      for (let x = IX0; x <= IX1; x++)
        if (W.chance(0.18)) W.set(x, F0, z, B.HONEY_BLOCK);
    // hearth in the north wall
    for (let x = -1; x <= 1; x++) for (let dy = 0; dy <= 5; dy++) W.set(x, y + dy, IZ0, px(STONE_MIX));
    W.clear(-1, y, IZ0, 1, y + 1, IZ0);
    W.set(0, y, IZ0, B.CAMPFIRE);
    W.set(-1, y, IZ0, B.COBBLESTONE); W.set(1, y, IZ0, B.COBBLESTONE);
    W.marker('smoke', 0, y + 2, IZ0, { rate: 7, rise: 0.8 });
    W.marker('glow', 0, y + 1, IZ0, { r: 7, color: [1, 0.65, 0.25], power: 1.2 });
    // bar counter along the west wall
    for (let z = -41; z <= -36; z++) {
      W.set(IX0, y, z, B.BARREL);
      W.slab(IX0 + 1, y, z, B.DARK_OAK_SLAB, 't');
      W.set(IX0, y + 1, z, W.chance(0.5) ? B.HONEY_BLOCK : 0);
      W.set(IX0, y + 3, z, W.chance(0.6) ? B.BOOKSHELF : B.CHEST);
    }
    W.set(IX0 + 1, y + 1, -38, B.LECTERN, 1);
    // long tables
    longTable(-4, 2, y, -40);
    longTable(-4, 2, y, -36);
    // honey vats
    for (const [x, z] of [[IX1, -42], [IX1, -40], [IX1 - 1, -42]]) {
      W.set(x, y, z, B.HONEY_BLOCK); W.set(x, y + 1, z, B.HONEY_BLOCK);
      W.set(x, y + 2, z, B.HONEYCOMB_BLOCK);
    }
    W.set(IX1, y, -38, B.CAULDRON); W.set(IX1, y, -37, B.COMPOSTER);
    // hive shrine
    W.set(0, y, -34, B.HONEYCOMB_BLOCK);
    W.set(0, y + 1, -34, B.BEE_NEST);
    W.set(-1, y, -34, B.HONEY_BLOCK); W.set(1, y, -34, B.HONEY_BLOCK);
    W.marker('bee', 0, y + 2, -34, { r: 1.6, count: 4 });
    // flowers everywhere
    for (let i = 0; i < 26; i++) {
      const x = W.randRange(IX0, IX1), z = W.randRange(IZ0, IZ1);
      if (W.isAir(x, y, z) && W.chance(0.6)) potted(x, y, z);
    }
    // rugs + lights
    for (let z = -41; z <= -34; z++) for (let x = -3; x <= 1; x++)
      if (W.isAir(x, y, z) && W.chance(0.5)) W.set(x, y, z, px([B.YELLOW_CARPET, B.ORANGE_CARPET, B.BROWN_CARPET]));
    for (const [x, z] of [[-5, -42], [3, -42], [-5, -35], [3, -35], [-1, -38]])
      W.set(x, F1 - 1, z, B.HANGING_LANTERN);
    for (const [x, z] of [[IX0, -35], [IX1, -35], [IX0, -42]]) W.face(x, y + 2, z, B.WALL_TORCH, 'e');
    W.face(-3, y + 2, IZ1, B.YELLOW_BANNER, 'n');
    W.face(1, y + 2, IZ1, B.YELLOW_BANNER, 'n');
  }

  /* ---- first floor: apiary workshop -------------------------------- */
  function workshop() {
    const y = F1 + 1;
    for (let z = IZ0; z <= IZ1; z++) for (let x = IX0; x <= IX1; x++)
      if (W.chance(0.3)) W.set(x, y, z, px([B.BROWN_CARPET, B.YELLOW_CARPET, B.ORANGE_CARPET]));
    let bx = IX0;
    for (const m of [B.COMPOSTER, B.BARREL, B.BARREL, B.CRAFTING_TABLE, B.SMOKER, B.LOOM, B.CAULDRON]) {
      W.set(bx, y, IZ0, m, 2); bx += 2;
      if (bx > IX1) break;
    }
    for (let x = IX0; x <= IX1; x += 2) W.face(x, y + 2, IZ0, B.WALL_TORCH, 's');
    W.set(IX1, y, -42, B.BREWING_STAND); W.set(IX1, y, -41, B.CAULDRON);
    W.set(IX1, y, -40, B.SMITHING_TABLE); W.set(IX1, y, -39, B.CARTOGRAPHY_TABLE);
    for (let z = -42; z <= -36; z++) { W.set(IX0, y, z, B.BARREL); if (W.chance(0.6)) W.set(IX0, y + 1, z, B.BARREL); }
    longTable(-4, 1, y, -38);
    W.set(-2, y + 1, -38, B.CAKE);
    for (const [x, z] of [[-5, -35], [2, -35], [-2, -34]]) { W.set(x, y, z, B.HONEY_BLOCK); W.set(x, y + 1, z, B.HONEY_BLOCK); }
    for (let i = 0; i < 8; i++) W.face(W.randRange(IX0 + 1, IX1 - 1), y + 2, IZ1, px([B.ITEM_FRAME, B.MAP_FRAME, B.PAINTING_A]), 'n');
    W.set(-1, y, -35, B.LECTERN, 2);
    for (const [x, z] of [[-4, -41], [2, -41], [-4, -36], [2, -36]]) W.set(x, F2 - 1, z, B.HANGING_LANTERN);
    W.face(IX0, y + 3, -38, B.BEE_NEST, 'e');
    W.marker('bee', IX0 + 1, y + 3, -38, { r: 1.2, count: 3 });
    for (let i = 0; i < 12; i++) {
      const x = W.randRange(IX0, IX1), z = W.randRange(IZ0, IZ1);
      if (W.isAir(x, y, z) && W.chance(0.6)) potted(x, y, z);
    }
  }

  /* ---- loft ---------------------------------------------------------- */
  function loft() {
    const y = F2 + 1;
    for (let z = IZ0; z <= IZ1; z++) for (let x = IX0; x <= IX1; x++)
      if (W.chance(0.45)) W.set(x, y, z, px([B.YELLOW_CARPET, B.ORANGE_CARPET, B.RED_CARPET, B.BROWN_CARPET]));
    W.bed(-5, y, -42, B.YELLOW_BED, 's');
    W.bed(3, y, -42, B.ORANGE_TERRACOTTA ? B.RED_BED : B.RED_BED, 's');
    W.set(-6, y, -42, B.CHEST); W.set(4, y, -42, B.CHEST);
    for (let z = -42; z <= -38; z++) { W.set(IX0, y, z, B.BOOKSHELF); W.set(IX0, y + 1, z, W.chance(0.6) ? B.BOOKSHELF : B.CHISELED_BOOKSHELF); }
    longTable(-3, 0, y, -39);
    W.set(-2, y + 1, -39, B.CAKE);
    W.set(IX1, y, -38, B.ENDER_CHEST);
    W.set(IX1, y, -37, B.JUKEBOX); W.set(IX1 - 1, y, -37, B.NOTE_BLOCK);
    for (const [x, z] of [[-4, -41], [1, -41], [-4, -35], [1, -35]]) W.set(x, F2 + 5, z, B.HANGING_LANTERN);
    for (let i = 0; i < 10; i++) {
      const x = W.randRange(IX0, IX1), z = W.randRange(IZ0, IZ1);
      if (W.isAir(x, y, z) && W.chance(0.6)) potted(x, y, z);
    }
    /* balcony over the plaza, south face */
    W.clear(-1, y, TZ1, -1, y + 2, TZ1);
    W.door(-1, y, TZ1, B.SPRUCE_DOOR, 's');
    for (let x = -4; x <= 2; x++) {
      W.slab(x, y - 1, TZ1 + 1, B.DARK_OAK_SLAB, 't');
      W.slab(x, y - 1, TZ1 + 2, B.DARK_OAK_SLAB, 't');
      W.set(x, y, TZ1 + 2, B.SPRUCE_FENCE);
      if ((x + 4) % 3 === 0) { W.set(x, y + 1, TZ1 + 2, B.FLOWER_POT); W.set(x, y + 2, TZ1 + 2, px(FLOWERS)); }
      W.stair(x, y - 2, TZ1 + 1, B.DARK_OAK_STAIRS, 'n', true);
    }
    W.set(-4, y, TZ1 + 1, B.SPRUCE_FENCE); W.set(2, y, TZ1 + 1, B.SPRUCE_FENCE);
    W.set(-4, y + 1, TZ1 + 1, B.HANGING_LANTERN); W.set(2, y + 1, TZ1 + 1, B.HANGING_LANTERN);
    W.set(-3, y, TZ1 + 2, B.SPRUCE_FENCE); W.set(1, y, TZ1 + 2, B.SPRUCE_FENCE);
  }

  /* =================================================================== */
  /* 5.  THE GIANT BEE                                                   */
  /* =================================================================== */
  /* z-profile of the body: [z, radius] from stinger tip to head front   */
  const PROFILE = [
    [-41, 1.0], [-40, 1.8], [-39, 2.6], [-38, 3.4], [-37, 4.0], [-36, 4.4],
    [-35, 4.6], [-34, 4.6], [-33, 4.5], [-32, 4.3], [-31, 4.0], [-30, 3.6],
    [-29, 3.5], [-28, 4.1], [-27, 4.3], [-26, 3.9],
  ];
  const YELLOW_MIX = [B.YELLOW_CONCRETE, B.YELLOW_CONCRETE, B.YELLOW_TERRACOTTA, B.HONEYCOMB_BLOCK];
  const BLACK_MIX = [B.BLACK_CONCRETE, B.BLACK_CONCRETE, B.BLACK_WOOL, B.BLACK_TERRACOTTA];

  function bandAt(z) {
    if (z <= -39) return BLACK_MIX;                       // stinger
    if (z >= -28) return BLACK_MIX;                       // head
    const k = Math.floor((-29 - z) / 2);                  // 2-block bands
    return (k % 2 === 0) ? YELLOW_MIX : BLACK_MIX;
  }

  function beeStatue() {
    /* ---- body shell ---- */
    for (const [z, r] of PROFILE) {
      const mix = bandAt(z);
      const ri = Math.round(r);
      for (let dy = -ri - 1; dy <= ri + 1; dy++)
        for (let dx = -ri - 1; dx <= ri + 1; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy * 0.92);
          if (d > r) continue;
          W.set(BX + dx, BY + dy, z, px(mix));
        }
    }
    /* ---- hollow the abdomen: the observation chamber ---- */
    W.clear(BX - 3, BY - 3, -37, BX + 3, BY + 3, -31);
    for (let z = -37; z <= -31; z++)
      for (let x = BX - 3; x <= BX + 3; x++) W.set(x, BY - 4, z, px([B.HONEY_BLOCK, B.HONEYCOMB_BLOCK]));
    for (let i = 0; i < 30; i++) {
      const gx = W.randRange(BX - 3, BX + 3), gz = W.randRange(-37, -31);
      if (!W.isSolid(gx, BY + 4, gz)) continue;
      W.set(gx, BY + 3, gz, W.chance(0.55) ? B.SHROOMLIGHT : B.GLOWSTONE);
    }
    for (const [x, z] of [[BX - 3, -36], [BX + 3, -36], [BX - 3, -33], [BX + 3, -33]]) {
      W.set(x, BY - 3, z, B.HONEY_BLOCK); W.set(x, BY - 2, z, B.SHROOMLIGHT);
    }
    // seats + a little table in the belly
    W.stair(BX - 2, BY - 3, -34, B.DARK_OAK_STAIRS, 'w');
    W.stair(BX + 2, BY - 3, -34, B.DARK_OAK_STAIRS, 'e');
    W.set(BX, BY - 3, -34, B.SPRUCE_FENCE); W.slab(BX, BY - 2, -34, B.DARK_OAK_SLAB, 't');
    W.set(BX, BY - 2, -35, B.LANTERN);
    // forward viewing slit through the waist, looking down over the plaza
    for (let x = BX - 2; x <= BX + 2; x++) {
      W.set(x, BY - 2, -31, B.LIGHT_BLUE_STAINED_GLASS);
      W.set(x, BY - 1, -31, B.LIGHT_BLUE_STAINED_GLASS);
    }
    // ladder shaft up from the loft roof hatch into the belly
    W.clear(-1, PLINTH + 1, -36, -1, BY - 4, -36);
    for (let y = PLINTH; y <= BY - 4; y++) W.face(-1, y, -36, B.LADDER, 's');
    W.set(-1, BY - 4, -36, 0);

    /* ---- head: solid mass from z -30 to -26, then carve the face ---- */
    for (let z = -30; z >= -26; z--) {
      const r = z <= -28 ? 4 : (z === -27 ? 4 : 3);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy * 0.92 > r * r) continue;
          W.set(BX + dx, BY + dy, z, px(BLACK_MIX));
        }
    }
    // glowing core behind the face so the glass reads as lit compound eyes
    for (let dy = -1; dy <= 2; dy++)
      for (let dx = -3; dx <= 3; dx++)
        W.set(BX + dx, BY + dy, -28, W.chance(0.5) ? B.SHROOMLIGHT : B.OCHRE_FROGLIGHT);
    // two compound eyes, wrapping from the face onto the cheeks
    for (const sx of [-1, 1]) {
      for (let dy = 0; dy <= 2; dy++)
        for (let k = 0; k < 2; k++) {
          W.set(BX + sx * (2 + k), BY + dy, -26, B.LIGHT_BLUE_STAINED_GLASS);
          W.set(BX + sx * (2 + k), BY + dy, -27, B.LIGHT_BLUE_STAINED_GLASS);
        }
      for (let dy = 0; dy <= 1; dy++) W.set(BX + sx * 4, BY + dy, -27, B.CYAN_STAINED_GLASS);
      W.marker('glow', BX + sx * 3, BY + 1, -26, { r: 5, color: [0.45, 0.8, 1.0], power: 0.9 });
    }
    // yellow face stripe between the eyes + a fuzzy crown
    for (let dy = -1; dy <= 3; dy++) W.set(BX, BY + dy, -26, B.YELLOW_CONCRETE);
    for (let dx = -1; dx <= 1; dx++) W.set(BX + dx, BY + 3, -26, B.YELLOW_CONCRETE);
    for (let dx = -3; dx <= 3; dx++) W.set(BX + dx, BY + 4, -27, px(YELLOW_MIX));
    // mandibles
    for (const sx of [-1, 1]) {
      W.set(BX + sx, BY - 3, -26, B.YELLOW_TERRACOTTA);
      W.set(BX + sx * 2, BY - 2, -26, B.YELLOW_TERRACOTTA);
      W.set(BX + sx, BY - 3, -27, B.YELLOW_TERRACOTTA);
    }

    /* ---- antennae ---- */
    for (const sx of [-2, 2]) {
      const x = BX + sx;
      for (let i = 0; i <= 4; i++) W.set(x, BY + 4 + i, -26, i === 2 ? B.IRON_BARS : B.QUARTZ_BLOCK);
      W.set(x, BY + 9, -26, B.LIGHT_GRAY_CONCRETE);       // kink forward, face-connected
      W.set(x, BY + 9, -25, B.LIGHT_GRAY_CONCRETE);
      W.set(x, BY + 10, -25, B.END_ROD);
      W.marker('glow', x, BY + 10, -25, { r: 4, color: [1, 0.95, 0.85], power: 0.8 });
    }

    /* ---- four wings ---- */
    function wing(sx, z0, len, up) {
      for (let i = 1; i <= len; i++) {
        const x = BX + sx * (4 + i);
        const y = BY + 2 + Math.round(i * up);
        const halfW = Math.max(1, Math.round(3.4 - i * 0.16));
        for (let dz = -halfW; dz <= halfW; dz++) {
          const z = z0 + dz;
          const edge = (dz === -halfW || i === len);
          W.set(x, y, z, edge ? B.LIGHT_GRAY_CONCRETE : (W.chance(0.3) ? B.GLASS : B.WHITE_STAINED_GLASS));
        }
        // keep the membrane face-connected as it climbs
        if (up > 0 && i > 1) W.set(x, y - 1, z0, W.chance(0.4) ? B.GLASS : B.WHITE_STAINED_GLASS);
        W.set(x, y, z0 - halfW - 1, B.IRON_BARS);           // leading-edge rib
      }
      // root: a solid shoulder joining the membrane to the thorax
      for (let k = -2; k <= 2; k++) {
        W.set(BX + sx * 4, BY + 2, z0 + k, B.LIGHT_GRAY_CONCRETE);
        W.set(BX + sx * 5, BY + 2, z0 + k, B.LIGHT_GRAY_CONCRETE);
        W.set(BX + sx * 4, BY + 3, z0 + k, px(BLACK_MIX));
      }
    }
        wing(-1, -35, 9, 0.42); wing(1, -35, 9, 0.42);
    wing(-1, -31, 6, 0.60); wing(1, -31, 6, 0.60);

    /* ---- stinger ---- */
    for (let i = 0; i < 3; i++) W.set(BX, BY - 1 - i, -42 + i * 0, B.BLACK_CONCRETE);
    W.set(BX, BY - 1, -42, B.BLACK_CONCRETE);
    W.set(BX, BY - 2, -43, B.BLACK_CONCRETE);

    /* ---- chimney vent out of the back of the thorax ---- */
    for (let y = BY + 5; y <= BY + 8; y++) W.set(BX + 3, y, -36, px(COBBLE_MIX));
    W.set(BX + 3, BY + 9, -36, B.CAMPFIRE);
    W.marker('smoke', BX + 3, BY + 10, -36, { rate: 10, rise: 1.1, spread: 1.4, size: 1.3 });
    W.marker('smoke', BX, BY + 6, -30, { rate: 4, rise: 0.9, spread: 1.0 });

    /* ---- glow + bees around the statue ---- */
    W.marker('glow', BX, BY, -34, { r: 10, color: [1, 0.82, 0.25], power: 0.9 });
    for (const [x, z] of [[-8, -30], [6, -30], [-1, -24], [-6, -40], [4, -40]])
      W.marker('bee', x, BY - 4, z, { r: 3.5, count: 5 });
  }

  /* =================================================================== */
  function build() {
    W.seed(606060);
    podium();
    grandStair();
    tower();
    honeyHall();
    workshop();
    loft();
    beeStatue();
    meadow();
    hivePosts();
    gardenProps();

    poi('The Bee Hall', -1, 46, -18, 180, 20);
    poi('Bee, close up', -1, 78, -8, 180, -16);
    poi('Honey Hall', -1, 47, -35, 180, -2);
    poi('Loft balcony', -1, 60, -29, 0, -10);
    poi('Bee belly', -1, 68, -36, 0, -6);

    W.marker('firefly', -10, 43, -34, { r: 7, count: 7 });
    W.marker('firefly', 8, 43, -34, { r: 7, count: 7 });
    W.marker('firefly', 0, 43, -47, { r: 8, count: 8 });
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.bee = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
