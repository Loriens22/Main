/* =====================================================================
   MARKET DISTRICT  —  shops, stalls, walkways, water channel, bridges
   Zone : x 22..60   z -6..30   ground y=32   max y=62
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;
  const px = l => W.pick(l);
  const G = 32;

  const STONE = [B.STONE_BRICKS, B.STONE_BRICKS, B.STONE_BRICKS, B.COBBLESTONE,
    B.COBBLESTONE, B.MOSSY_STONE_BRICKS, B.CRACKED_STONE_BRICKS, B.ANDESITE];
  const PAVE = [B.STONE_BRICKS, B.STONE_BRICKS, B.COBBLESTONE, B.COBBLESTONE,
    B.ANDESITE, B.POLISHED_ANDESITE, B.GRAVEL, B.DIRT_PATH, B.MOSSY_COBBLESTONE];
  const OAKMIX = [B.OAK_PLANKS, B.OAK_PLANKS, B.OAK_PLANKS, B.SPRUCE_PLANKS, B.BIRCH_PLANKS];
  const FLOWERS = [B.POPPY, B.DANDELION, B.ALLIUM, B.CORNFLOWER, B.OXEYE_DAISY,
    B.RED_TULIP, B.PINK_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP, B.BLUE_ORCHID, B.LILY_OF_THE_VALLEY];
  const CANOPY = [B.RED_WOOL, B.BLUE_WOOL, B.YELLOW_WOOL, B.GREEN_WOOL, B.WHITE_WOOL,
    B.PURPLE_WOOL, B.ORANGE_WOOL, B.CYAN_WOOL];

  function fillMix(x0, y0, z0, x1, y1, z1, l) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) W.set(x, y, z, px(l));
  }
  function wallsMix(x0, y0, z0, x1, y1, z1, l) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          if (x === x0 || x === x1 || z === z0 || z === z1) W.set(x, y, z, px(l));
  }
  const OUT = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

  function win(x, y, z, side, pane, sill, lintel) {
    W.set(x, y, z, pane); W.set(x, y + 1, z, pane);
    const o = OUT[side];
    W.stair(x + o[0], y - 1, z + o[1], sill || B.STONE_BRICK_STAIRS, OPP[side], true);
    W.slab(x + o[0], y + 2, z + o[1], lintel || B.STONE_BRICK_SLAB, 'b');
    if (W.chance(0.35)) {
      W.set(x + o[0], y - 1, z + o[1], B.OAK_TRAPDOOR);        // flower-box shelf
      W.set(x + o[0], y, z + o[1], px(FLOWERS));
    } else if (W.chance(0.35)) {
      W.trapdoor(x + o[0], y + 1, z + o[1], B.SPRUCE_TRAPDOOR, side, { open: true });
    }
  }

  /* generic shop shell: returns interior bounds */
  function shopShell(x0, z0, x1, z1, h, wallMix, floorMix, roof) {
    fillMix(x0, G, z0, x1, G, z1, floorMix);
    wallsMix(x0, G + 1, z0, x1, G + h, z1, wallMix);
    // corner posts
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
      for (let y = G + 1; y <= G + h; y++) W.logAxis(cx, y, cz, px([B.OAK_LOG, B.SPRUCE_LOG, B.DARK_OAK_LOG]), 'y');
    W.clear(x0 + 1, G + 1, z0 + 1, x1 - 1, G + h, z1 - 1);
    // string course
    for (let x = x0; x <= x1; x++) { W.slab(x, G + h, z0, B.STONE_BRICK_SLAB, 't'); W.slab(x, G + h, z1, B.STONE_BRICK_SLAB, 't'); }

    if (roof === 'gable') {
      for (let k = 0; k <= Math.floor((z1 - z0) / 2); k++) {
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          W.stair(x, G + h + 1 + k, z0 + k, B.SPRUCE_STAIRS, 'n');
          W.stair(x, G + h + 1 + k, z1 - k, B.SPRUCE_STAIRS, 's');
          if (k > 0) { W.set(x, G + h + k, z0 + k, px(wallMix)); W.set(x, G + h + k, z1 - k, px(wallMix)); }
        }
      }
    } else if (roof === 'terracotta') {
      for (let k = 0; k <= Math.floor((z1 - z0) / 2); k++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          W.stair(x, G + h + 1 + k, z0 + k, B.YELLOW_TERRACOTTA_STAIRS, 'n');
          W.stair(x, G + h + 1 + k, z1 - k, B.YELLOW_TERRACOTTA_STAIRS, 's');
          if (k > 0) { W.set(x, G + h + k, z0 + k, B.ORANGE_TERRACOTTA); W.set(x, G + h + k, z1 - k, B.ORANGE_TERRACOTTA); }
        }
    } else if (roof === 'flat') {
      fillMix(x0, G + h + 1, z0, x1, G + h + 1, z1, [B.STONE_BRICKS, B.ANDESITE, B.POLISHED_ANDESITE]);
      for (let x = x0; x <= x1; x++) { W.set(x, G + h + 2, z0, B.STONE_BRICK_WALL); W.set(x, G + h + 2, z1, B.STONE_BRICK_WALL); }
      for (let z = z0; z <= z1; z++) { W.set(x0, G + h + 2, z, B.STONE_BRICK_WALL); W.set(x1, G + h + 2, z, B.STONE_BRICK_WALL); }
    } else if (roof === 'hip') {
      let k = 0;
      let ax0 = x0 - 1, ax1 = x1 + 1, az0 = z0 - 1, az1 = z1 + 1;
      while (ax0 < ax1 && az0 < az1) {
        for (let x = ax0; x <= ax1; x++) { W.stair(x, G + h + 1 + k, az0, B.DARK_OAK_STAIRS, 'n'); W.stair(x, G + h + 1 + k, az1, B.DARK_OAK_STAIRS, 's'); }
        for (let z = az0; z <= az1; z++) { W.stair(ax0, G + h + 1 + k, z, B.DARK_OAK_STAIRS, 'w'); W.stair(ax1, G + h + 1 + k, z, B.DARK_OAK_STAIRS, 'e'); }
        ax0++; ax1--; az0++; az1--; k++;
        if (k > 5) break;
      }
    }
    return { x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, y: G + 1, h };
  }

  function counter(x0, z, x1, y, front) {
    for (let x = x0; x <= x1; x++) {
      W.set(x, y, z, px([B.BARREL, B.OAK_PLANKS, B.SPRUCE_PLANKS]));
      W.slab(x, y + 1, z, px([B.OAK_SLAB, B.SPRUCE_SLAB, B.DARK_OAK_SLAB]), 't');
    }
    if (front) { W.set(x0, y + 2, z, B.LANTERN); W.set(x1, y + 2, z, B.LANTERN); }
  }
  function awning(x0, x1, y, z, dir, mat) {
    const o = OUT[dir];
    for (let x = x0; x <= x1; x++) {
      W.stair(x, y, z + o[1], mat, OPP[dir], true);
      W.slab(x, y, z + o[1] * 2, B.OAK_SLAB, 't');
      if ((x - x0) % 3 === 0) {
        for (let yy = G + 1; yy < y; yy++) W.set(x, yy, z + o[1] * 2, B.OAK_FENCE);
        W.set(x, y - 1, z + o[1] * 2, B.HANGING_LANTERN);
      }
    }
  }

  /* =================================================================== */
  /* SQUARE + WELL                                                        */
  /* =================================================================== */
  function square() {
    for (let z = 5; z <= 21; z++)
      for (let x = 29; x <= 47; x++) {
        if (!W.isSolid(x, G, z)) continue;
        W.set(x, G, z, px(PAVE));
        if (W.isAir(x, G + 1, z)) continue;
      }
    // worn diagonal desire-line
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      const x = Math.round(30 + t * 16), z = Math.round(6 + t * 14);
      W.set(x, G, z, W.chance(0.5) ? B.DIRT_PATH : B.COARSE_DIRT);
      W.set(x, G, z + 1, B.DIRT_PATH);
    }
    // the well
    const wx = 38, wz = 13;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      W.set(wx + dx, G, wz + dz, B.WATER);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      W.set(wx + dx, G + 1, wz + dz, px([B.COBBLE_WALL, B.MOSSY_COBBLE_WALL]));
    }
    for (const [cx, cz] of [[wx - 2, wz - 2], [wx + 2, wz - 2], [wx - 2, wz + 2], [wx + 2, wz + 2]])
      for (let y = G + 1; y <= G + 3; y++) W.set(cx, y, cz, B.OAK_FENCE);
    for (let dx = -2; dx <= 2; dx++) {
      W.stair(wx + dx, G + 4, wz - 2, B.OAK_STAIRS, 'n');
      W.stair(wx + dx, G + 4, wz + 2, B.OAK_STAIRS, 's');
      W.slab(wx + dx, G + 4, wz, B.DARK_OAK_SLAB, 'b');
      W.slab(wx + dx, G + 4, wz - 1, B.DARK_OAK_SLAB, 'b');
      W.slab(wx + dx, G + 4, wz + 1, B.DARK_OAK_SLAB, 'b');
    }
    W.set(wx, G + 3, wz, B.CHAIN); W.set(wx, G + 2, wz, B.CAULDRON);
    W.set(wx - 2, G + 3, wz, B.HANGING_LANTERN); W.set(wx + 2, G + 3, wz, B.HANGING_LANTERN);
    W.marker('splash', wx, G + 1, wz, { rate: 2.2 });
    W.face(wx - 2, G + 2, wz - 2, B.SPAWN_SIGN, 'w');
    // lamp posts around the square
    for (const [lx, lz] of [[31, 7], [45, 7], [31, 19], [45, 19], [38, 6], [38, 20], [30, 13], [46, 13]]) {
      W.set(lx, G + 1, lz, B.COBBLESTONE);
      for (let y = G + 2; y <= G + 4; y++) W.set(lx, y, lz, B.OAK_FENCE);
      W.set(lx, G + 5, lz, B.LANTERN);
      W.slab(lx, G + 6, lz, B.OAK_SLAB, 'b');
      W.marker('spark', lx, G + 5, lz, { rate: 0.8 });
      W.marker('glow', lx, G + 5, lz, { r: 6, color: [1, 0.78, 0.42], power: 0.75 });
    }
    // benches, crates, props
    for (const [bx, bz, d] of [[33, 9, 'n'], [42, 9, 'n'], [33, 17, 's'], [42, 17, 's']]) {
      for (let i = 0; i < 3; i++) W.stair(bx + i, G + 1, bz, B.OAK_STAIRS, d);
      W.set(bx - 1, G + 1, bz, B.OAK_FENCE); W.set(bx + 3, G + 1, bz, B.OAK_FENCE);
    }
    W.set(35, G + 1, 20, B.CAT_STATUE); W.set(43, G + 1, 6, B.WOLF_STATUE);
    W.set(30, G + 1, 10, B.BARREL); W.set(30, G + 2, 10, B.BARREL); W.set(31, G + 1, 10, B.CHEST);
    W.set(46, G + 1, 16, B.HAY_BALE); W.set(46, G + 2, 16, B.HAY_BALE);
    // bulletin board
    for (let dz = 0; dz <= 3; dz++) for (let dy = 1; dy <= 3; dy++) W.set(29, G + dy, 15 + dz, B.OAK_PLANKS);
    for (let dz = 0; dz <= 3; dz++) {
      W.face(30, G + 3, 15 + dz, px([B.SHOP_SIGN, B.TRADES_SIGN, B.FOOD_SIGN, B.GEAR_SIGN]), 'w');
      W.face(30, G + 2, 15 + dz, px([B.ITEM_FRAME, B.MAP_FRAME]), 'w');
    }
    W.set(29, G + 4, 15, B.LANTERN); W.set(29, G + 4, 18, B.LANTERN);
  }

  /* =================================================================== */
  /* STALLS                                                               */
  /* =================================================================== */
  function stalls() {
    const spots = [[32, 11], [32, 15], [44, 11], [44, 15], [36, 8], [41, 18], [36, 18]];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const col = CANOPY[i % CANOPY.length];
      for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]])
        for (let y = G + 1; y <= G + 3; y++) W.set(x + dx, y, z + dz, px([B.OAK_FENCE, B.SPRUCE_FENCE]));
      for (let dz = -1; dz <= 3; dz++)
        for (let dx = -1; dx <= 3; dx++) {
          const edge = (dx === -1 || dx === 3 || dz === -1 || dz === 3);
          if (edge) W.slab(x + dx, G + 4, z + dz, W.chance(0.5) ? B.OAK_SLAB : B.SPRUCE_SLAB, 'b');
          else W.set(x + dx, G + 4, z + dz, col);
        }
      counter(x, z + 1, x + 2, G + 1, false);
      W.set(x, G + 1, z, B.BARREL); W.set(x + 2, G + 1, z + 2, B.CHEST);
      W.set(x + 1, G + 1, z + 2, B.BARREL);
      W.set(x + 1, G + 3, z, B.HANGING_LANTERN);
      W.face(x, G + 3, z - 1, px([B.SHOP_SIGN, B.FOOD_SIGN, B.GEAR_SIGN, B.TRADES_SIGN]), 'n');
      W.face(x + 2, G + 2, z - 1, px([B.ITEM_FRAME, B.MAP_FRAME]), 'n');
      for (let dx = 0; dx <= 2; dx++) if (W.chance(0.5)) W.set(x + dx, G + 3, z + 2, px([B.HAY_BALE, B.MELON, B.PUMPKIN, B.SHULKER_BOX]));
      W.marker('spark', x + 1, G + 3, z, { rate: 0.6 });
    }
  }

  /* =================================================================== */
  /* SHOPS                                                                */
  /* =================================================================== */
  function bakery() {
    const s = shopShell(23, -1, 31, 6, 4,
      [B.YELLOW_TERRACOTTA, B.YELLOW_TERRACOTTA, B.ORANGE_TERRACOTTA, B.OAK_PLANKS, B.MUD_BRICKS],
      [B.OAK_PLANKS, B.SPRUCE_PLANKS], 'terracotta');
    W.clear(27, G + 1, 6, 28, G + 3, 6);
    W.door(27, G + 1, 6, B.OAK_DOOR, 's');
    W.set(28, G + 1, 6, B.OAK_DOOR, 2); W.set(28, G + 2, 6, B.OAK_DOOR, 10);
    win(25, G + 2, 6, 's', B.GLASS_PANE, B.OAK_STAIRS, B.OAK_SLAB);
    win(30, G + 2, 6, 's', B.GLASS_PANE, B.OAK_STAIRS, B.OAK_SLAB);
    win(23, G + 2, 3, 'w', B.GLASS_PANE, B.OAK_STAIRS, B.OAK_SLAB);
    awning(24, 30, G + 5, 6, 's', B.YELLOW_TERRACOTTA_STAIRS);
    counter(24, 7, 30, G + 1, true);
    W.face(26, G + 4, 7, B.FOOD_SIGN, 's');
    // interior
    W.set(s.x0, s.y, s.z0, B.SMOKER, 2); W.set(s.x0 + 1, s.y, s.z0, B.FURNACE, 2);
    W.set(s.x0 + 2, s.y, s.z0, B.BLAST_FURNACE, 2);
    W.face(s.x0, s.y + 2, s.z0, B.WALL_TORCH, 's');
    W.set(s.x1, s.y, s.z0, B.CAMPFIRE);
    W.marker('smoke', s.x1, s.y + 1, s.z0, { rate: 6, rise: 0.9 });
    for (let x = s.x0; x <= s.x1; x++) if (W.chance(0.5)) W.set(x, s.y, s.z1, px([B.BARREL, B.HAY_BALE, B.COMPOSTER, B.MELON, B.PUMPKIN]));
    W.set(s.x0 + 3, s.y, s.z0 + 2, B.OAK_FENCE); W.slab(s.x0 + 3, s.y + 1, s.z0 + 2, B.OAK_SLAB, 't');
    W.set(s.x0 + 4, s.y, s.z0 + 2, B.OAK_FENCE); W.set(s.x0 + 4, s.y + 1, s.z0 + 2, B.CAKE);
    W.set(s.x0 + 1, s.y + 3, s.z0 + 2, B.HANGING_LANTERN);
    W.set(s.x1, s.y + 3, s.z1 - 1, B.HANGING_LANTERN);
    W.set(s.x0, s.y, s.z1, B.CHICKEN_BODY);
    for (let x = s.x0; x <= s.x1; x += 2) W.set(x, s.y + 3, s.z0, B.HAY_BALE);
    W.set(29, G + 1, 8, B.CHICKEN_BODY); W.set(26, G + 1, 9, B.CHICKEN_BODY);
    // chimney
    for (let y = G + 5; y <= G + 10; y++) W.set(24, y, 1, px([B.BRICKS, B.COBBLESTONE, B.STONE_BRICKS]));
    W.marker('smoke', 24, G + 11, 1, { rate: 8, rise: 1.0, spread: 0.8 });
  }

  function armoury() {
    const s = shopShell(34, -4, 42, 3, 5,
      [B.STONE_BRICKS, B.STONE_BRICKS, B.COBBLESTONE, B.DARK_OAK_PLANKS, B.CRACKED_STONE_BRICKS, B.ANDESITE],
      [B.STONE_BRICKS, B.ANDESITE], 'gable');
    W.clear(38, G + 1, 3, 38, G + 3, 3);
    W.door(38, G + 1, 3, B.DARK_OAK_DOOR, 's');
    win(35, G + 2, 3, 's', B.GLASS_PANE, B.STONE_BRICK_STAIRS, B.STONE_BRICK_SLAB);
    win(41, G + 2, 3, 's', B.GLASS_PANE, B.STONE_BRICK_STAIRS, B.STONE_BRICK_SLAB);
    win(34, G + 2, 0, 'w', B.IRON_BARS, B.STONE_BRICK_STAIRS, B.STONE_BRICK_SLAB);
    win(42, G + 2, 0, 'e', B.IRON_BARS, B.STONE_BRICK_STAIRS, B.STONE_BRICK_SLAB);
    W.face(37, G + 4, 4, B.GEAR_SIGN, 's');
    W.set(36, G + 1, 4, B.ARMOR_STAND); W.set(40, G + 1, 4, B.ARMOR_STAND);
    for (let x = 35; x <= 41; x += 2) W.face(x, G + 3, 4, px([B.ITEM_FRAME, B.MAP_FRAME]), 's');
    W.set(35, G + 2, 4, B.IRON_BARS); W.set(41, G + 2, 4, B.IRON_BARS);
    // forge
    W.set(s.x0, s.y, s.z0, B.FURNACE, 2); W.set(s.x0 + 1, s.y, s.z0, B.BLAST_FURNACE, 2);
    W.set(s.x0 + 2, s.y, s.z0, B.ANVIL); W.set(s.x0 + 3, s.y, s.z0, B.SMITHING_TABLE);
    W.set(s.x0 + 4, s.y, s.z0, B.CARTOGRAPHY_TABLE);
    W.set(s.x1, s.y, s.z0, B.CAMPFIRE);
    W.marker('smoke', s.x1, s.y + 1, s.z0, { rate: 7, rise: 1.0 });
    W.marker('spark', s.x0 + 2, s.y + 1, s.z0, { rate: 6 });
    W.marker('glow', s.x0, s.y + 1, s.z0, { r: 6, color: [1, 0.55, 0.2], power: 1.0 });
    for (let z = s.z0; z <= s.z1; z++) { W.set(s.x1, s.y, z, W.chance(0.5) ? B.BARREL : B.CHEST); if (W.chance(0.4)) W.set(s.x1, s.y + 1, z, B.BARREL); }
    W.set(s.x0, s.y, s.z1, B.LECTERN, 2);
    for (let x = s.x0 + 1; x <= s.x1 - 1; x += 3) W.set(x, s.y + 4, s.z0 + 2, B.LANTERN);
    W.set(s.x0 + 2, s.y, s.z1, B.IRON_BLOCK); W.set(s.x0 + 3, s.y, s.z1, B.IRON_BLOCK);
    // chimney
    for (let y = G + 6; y <= G + 12; y++) W.set(43, y, -3, px([B.COBBLESTONE, B.BRICKS, B.STONE_BRICKS]));
    W.marker('smoke', 43, G + 13, -3, { rate: 9, rise: 1.1, spread: 0.9 });
    W.marker('glow', 43, G + 6, -3, { r: 4, color: [1, 0.5, 0.2], power: 0.7 });
  }

  function arcanum() {
    const s = shopShell(45, -2, 53, 6, 5,
      [B.PURPLE_TERRACOTTA, B.PURPLE_TERRACOTTA, B.DEEPSLATE_BRICKS, B.DEEPSLATE_TILES,
        B.POLISHED_DEEPSLATE, B.BLACKSTONE],
      [B.DEEPSLATE_TILES, B.POLISHED_DEEPSLATE], 'gable');
    W.clear(49, G + 1, 6, 49, G + 3, 6);
    W.door(49, G + 1, 6, B.DARK_OAK_DOOR, 's');
    win(46, G + 2, 6, 's', B.PURPLE_PANE, B.DEEPSLATE_BRICK_STAIRS, B.DEEPSLATE_BRICK_SLAB);
    win(52, G + 2, 6, 's', B.PURPLE_PANE, B.DEEPSLATE_BRICK_STAIRS, B.DEEPSLATE_BRICK_SLAB);
    win(45, G + 2, 2, 'w', B.PURPLE_PANE, B.DEEPSLATE_BRICK_STAIRS, B.DEEPSLATE_BRICK_SLAB);
    win(53, G + 2, 2, 'e', B.PURPLE_PANE, B.DEEPSLATE_BRICK_STAIRS, B.DEEPSLATE_BRICK_SLAB);
    W.face(48, G + 4, 7, B.TRADES_SIGN, 's');
    W.set(47, G + 2, 7, B.SOUL_LANTERN); W.set(51, G + 2, 7, B.SOUL_LANTERN);
    for (let y = G + 1; y <= G + 2; y++) { W.set(47, y, 7, B.COBBLE_WALL); W.set(51, y, 7, B.COBBLE_WALL); }
    // interior
    const cx = Math.floor((s.x0 + s.x1) / 2), cz = Math.floor((s.z0 + s.z1) / 2);
    W.set(cx, s.y, cz, B.ENCHANTING_TABLE);
    for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
      W.set(cx + dx, s.y, cz + dz, B.BOOKSHELF);
      W.set(cx + dx, s.y + 1, cz + dz, B.BOOKSHELF);
    }
    for (let x = s.x0; x <= s.x0 + 3; x++) W.set(x, s.y, s.z0, B.BREWING_STAND);
    W.set(s.x1, s.y, s.z0, B.CAULDRON); W.set(s.x1 - 1, s.y, s.z0, B.CAULDRON);
    W.set(s.x1, s.y, s.z1, B.ENDER_CHEST);
    W.set(s.x0, s.y, s.z1, B.LECTERN, 0);
    for (let z = s.z0; z <= s.z1; z++) for (let x = s.x0; x <= s.x1; x++)
      if (W.chance(0.4) && W.isAir(x, s.y, z)) W.set(x, s.y, z, px([B.PURPLE_CARPET, B.MAGENTA_CARPET, B.BLACK_CARPET]));
    for (const [lx, lz] of [[s.x0 + 1, s.z0 + 1], [s.x1 - 1, s.z1 - 1], [cx, s.z0 + 1]]) W.set(lx, s.y + 4, lz, B.SOUL_LANTERN);
    W.marker('glow', cx, s.y + 2, cz, { r: 6, color: [0.65, 0.4, 1.0], power: 0.9 });
    // cellar
    W.clear(47, 27, 0, 51, 31, 4);
    fillMix(46, 26, -1, 52, 26, 5, [B.COBBLESTONE, B.MOSSY_COBBLESTONE]);
    wallsMix(46, 27, -1, 52, 31, 5, [B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.STONE_BRICKS]);
    for (let i = 0; i < 18; i++) {
      const bx = W.randRange(47, 51), bz = W.randRange(0, 4);
      W.set(bx, 27, bz, px([B.BARREL, B.CHEST, B.HOPPER, B.BARREL]));
      if (W.chance(0.4)) W.set(bx, 28, bz, B.BARREL);
    }
    for (const [tx, tz] of [[47, 0], [51, 4], [47, 4]]) W.set(tx, 30, tz, B.TORCH);
    W.set(49, 31, 2, B.GLOWSTONE);
    // stair down from inside the shop
    W.clear(s.x0, 27, s.z1, s.x0 + 1, G, s.z1);
    for (let i = 0; i < 5; i++) W.stair(s.x0, G - 1 - i, s.z1 - i, B.COBBLE_STAIRS, 's');
    W.set(s.x0 + 1, G, s.z1, B.COBBLESTONE);
  }

  function generalStore() {
    const s = shopShell(49, 12, 58, 20, 5,
      [B.OAK_LOG, B.OAK_LOG, B.STRIPPED_OAK_LOG, B.OAK_PLANKS, B.SPRUCE_PLANKS],
      [B.OAK_PLANKS, B.SPRUCE_PLANKS], 'hip');
    W.clear(51, G + 1, 12, 51, G + 3, 12);
    W.door(51, G + 1, 12, B.OAK_DOOR, 'n');
    // big shopfront
    for (let x = 53; x <= 56; x++) for (let y = G + 2; y <= G + 3; y++) W.set(x, y, 12, B.GLASS_PANE);
    for (let x = 53; x <= 56; x++) { W.stair(x, G + 1, 11, B.OAK_STAIRS, 's', true); W.slab(x, G + 4, 11, B.OAK_SLAB, 'b'); }
    awning(50, 57, G + 5, 12, 'n', B.SPRUCE_STAIRS);
    W.face(52, G + 4, 11, B.SHOP_SIGN, 'n');
    // striped banners along the eaves
    for (let x = 50; x <= 57; x++) W.face(x, G + 4, 11, (x & 1) ? B.RED_BANNER : B.WHITE_BANNER, 'n');
    win(58, G + 2, 15, 'e', B.GLASS_PANE, B.OAK_STAIRS, B.OAK_SLAB);
    win(49, G + 2, 17, 'w', B.GLASS_PANE, B.OAK_STAIRS, B.OAK_SLAB);
    // interior
    for (let z = s.z0; z <= s.z1; z++) {
      W.set(s.x1, s.y, z, B.BARREL); W.set(s.x1, s.y + 1, z, W.chance(0.6) ? B.BARREL : B.CHEST);
      W.set(s.x1, s.y + 2, z, W.chance(0.5) ? B.SHULKER_BOX : 0);
    }
    counter(s.x0 + 1, s.z0 + 2, s.x0 + 4, s.y, false);
    W.set(s.x0 + 1, s.y + 1, s.z0 + 2, B.LECTERN, 2);
    W.set(s.x0, s.y, s.z1, B.JUKEBOX); W.set(s.x0 + 1, s.y, s.z1, B.NOTE_BLOCK);
    W.set(s.x0, s.y, s.z0, B.LOOM); W.set(s.x0 + 1, s.y, s.z0, B.CRAFTING_TABLE);
    for (let z = s.z0; z <= s.z1; z++) for (let x = s.x0; x <= s.x1; x++)
      if (W.chance(0.3) && W.isAir(x, s.y, z)) W.set(x, s.y, z, px([B.RED_CARPET, B.BROWN_CARPET, B.ORANGE_CARPET]));
    for (const [lx, lz] of [[s.x0 + 2, s.z0 + 1], [s.x0 + 2, s.z1 - 1], [s.x1 - 2, s.z0 + 3]]) W.set(lx, s.y + 4, lz, B.HANGING_LANTERN);
  }

  function library() {
    const s = shopShell(23, 12, 31, 20, 5,
      [B.BIRCH_PLANKS, B.BIRCH_PLANKS, B.STONE_BRICKS, B.SMOOTH_STONE, B.MOSSY_STONE_BRICKS],
      [B.BIRCH_PLANKS, B.SMOOTH_STONE], 'flat');
    W.clear(27, G + 1, 20, 27, G + 3, 20);
    W.door(27, G + 1, 20, B.SPRUCE_DOOR, 's');
    win(25, G + 2, 20, 's', B.GLASS_PANE, B.BIRCH_STAIRS, B.BIRCH_SLAB);
    win(29, G + 2, 20, 's', B.GLASS_PANE, B.BIRCH_STAIRS, B.BIRCH_SLAB);
    win(23, G + 2, 16, 'w', B.GLASS_PANE, B.BIRCH_STAIRS, B.BIRCH_SLAB);
    win(31, G + 2, 16, 'e', B.GLASS_PANE, B.BIRCH_STAIRS, B.BIRCH_SLAB);
    W.face(26, G + 4, 21, B.TRADES_SIGN, 's');
    for (let z = s.z0; z <= s.z1; z++) {
      for (const x of [s.x0, s.x1]) {
        W.set(x, s.y, z, B.BOOKSHELF); W.set(x, s.y + 1, z, B.BOOKSHELF);
        W.set(x, s.y + 2, z, W.chance(0.6) ? B.BOOKSHELF : B.CHISELED_BOOKSHELF);
      }
    }
    for (let x = s.x0 + 1; x <= s.x1 - 1; x++) { W.set(x, s.y, s.z0, B.BOOKSHELF); W.set(x, s.y + 1, s.z0, B.CHISELED_BOOKSHELF); }
    W.set(27, s.y, 16, B.CARTOGRAPHY_TABLE); W.set(26, s.y, 16, B.LECTERN, 1);
    W.set(28, s.y, 16, B.LECTERN, 3);
    W.stair(26, s.y, 17, B.BIRCH_STAIRS, 'n'); W.stair(28, s.y, 17, B.BIRCH_STAIRS, 'n');
    for (let z = 14; z <= 18; z++) for (let x = 25; x <= 29; x++)
      if (W.isAir(x, s.y, z) && W.chance(0.6)) W.set(x, s.y, z, px([B.BLUE_CARPET, B.CYAN_CARPET, B.LIGHT_BLUE_CARPET]));
    for (let x = s.x0 + 1; x <= s.x1 - 1; x += 3) W.face(x, s.y + 3, s.z1, px([B.MAP_FRAME, B.MAP_FRAME, B.PAINTING_A]), 'n');
    for (const [lx, lz] of [[26, 14], [29, 18], [26, 18]]) W.set(lx, s.y + 4, lz, B.LANTERN);
  }

  function flowerShop() {
    const x0 = 32, z0 = 23, x1 = 40, z1 = 29;
    fillMix(x0, G, z0, x1, G, z1, [B.OAK_PLANKS, B.SPRUCE_PLANKS, B.MOSS_BLOCK]);
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [Math.floor((x0 + x1) / 2), z0], [Math.floor((x0 + x1) / 2), z1]])
      for (let y = G + 1; y <= G + 4; y++) W.logAxis(cx, y, cz, B.OAK_LOG, 'y');
    for (let x = x0; x <= x1; x++) { W.logAxis(x, G + 5, z0, B.OAK_LOG, 'x'); W.logAxis(x, G + 5, z1, B.OAK_LOG, 'x'); }
    for (let z = z0; z <= z1; z++) { W.logAxis(x0, G + 5, z, B.OAK_LOG, 'z'); W.logAxis(x1, G + 5, z, B.OAK_LOG, 'z'); }
    for (let k = 0; k <= 3; k++)
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        W.stair(x, G + 6 + k, z0 - 1 + k, B.OAK_STAIRS, 'n');
        W.stair(x, G + 6 + k, z1 + 1 - k, B.OAK_STAIRS, 's');
      }
    // planting benches
    for (let z = z0 + 1; z <= z1 - 1; z += 2)
      for (let x = x0 + 1; x <= x1 - 1; x++) {
        W.set(x, G + 1, z, B.OAK_SLAB);
        W.set(x, G + 2, z, B.FLOWER_POT);
        W.set(x, G + 3, z, W.chance(0.2) ? px([B.SUNFLOWER, B.ROSE_BUSH, B.LILAC]) : px(FLOWERS));
      }
    for (let x = x0 + 1; x <= x1 - 1; x += 2) {
      W.set(x, G + 4, z0 + 1, B.SPORE_BLOSSOM);
      W.set(x, G + 4, z1 - 1, B.SPORE_BLOSSOM);
    }
    W.set(x0 + 1, G + 1, z0 + 2, B.CAULDRON); W.set(x1 - 1, G + 1, z1 - 2, B.COMPOSTER);
    W.set(x0 + 2, G + 1, z1 - 1, B.MOSS_BLOCK);
    for (const [lx, lz] of [[x0 + 2, z0 + 1], [x1 - 2, z0 + 1], [x0 + 2, z1 - 1], [x1 - 2, z1 - 1]])
      W.set(lx, G + 4, lz, B.HANGING_LANTERN);
    for (let x = x0; x <= x1; x += 3) { W.set(x, G + 1, z1 + 1, B.PODZOL); W.set(x, G + 2, z1 + 1, px([B.AZALEA_LEAVES, B.FLOWERING_AZALEA])); }
    W.face(x0 + 3, G + 4, z1, B.SHOP_SIGN, 's');
    W.marker('firefly', (x0 + x1) / 2 | 0, G + 3, (z0 + z1) / 2 | 0, { r: 4, count: 5 });
  }

  function fishHut() {
    const s = shopShell(44, 22, 51, 28, 4,
      [B.SPRUCE_PLANKS, B.SPRUCE_PLANKS, B.DARK_OAK_PLANKS, B.COBBLESTONE, B.PRISMARINE],
      [B.SPRUCE_PLANKS, B.DARK_OAK_PLANKS], 'gable');
    W.clear(47, G + 1, 22, 47, G + 3, 22);
    W.door(47, G + 1, 22, B.SPRUCE_DOOR, 'n');
    win(45, G + 2, 22, 'n', B.GLASS_PANE, B.SPRUCE_STAIRS, B.SPRUCE_SLAB);
    win(50, G + 2, 22, 'n', B.GLASS_PANE, B.SPRUCE_STAIRS, B.SPRUCE_SLAB);
    W.face(48, G + 4, 21, B.FOOD_SIGN, 'n');
    counter(45, 21, 50, G + 1, true);
    W.set(s.x0, s.y, s.z1, B.BARREL); W.set(s.x0 + 1, s.y, s.z1, B.BARREL);
    W.set(s.x1, s.y, s.z1, B.SMOKER, 0); W.set(s.x1, s.y, s.z0, B.CAULDRON);
    W.set(s.x0 + 2, s.y, s.z0, B.CAMPFIRE);
    W.marker('smoke', s.x0 + 2, s.y + 1, s.z0, { rate: 5, rise: 0.8 });
    for (let x = s.x0; x <= s.x1; x += 2) W.set(x, s.y + 3, s.z0 + 1, B.HANGING_LANTERN);
    W.set(s.x0, s.y, s.z0, B.CAT_STATUE);
    for (let x = 44; x <= 51; x++) W.set(x, G + 1, 29, B.SPRUCE_FENCE);
  }

  /* =================================================================== */
  /* WATER CHANNEL + BRIDGES + WALKWAYS                                   */
  /* =================================================================== */
  function channel() {
    // runs from the north-east corner south, then east toward the pond
    const pts = [];
    for (let z = -6; z <= 9; z++) pts.push([56, z]);
    for (let x = 56; x >= 54; x--) pts.push([x, 9]);
    for (let z = 9; z <= 30; z++) pts.push([54, z]);
    for (const [x, z] of pts) {
      for (let dx = -1; dx <= 1; dx++) {
        W.set(x + dx, G, z, px([B.GRAVEL, B.CLAY, B.SAND]));
        W.set(x + dx, G + 1, z, B.WATER);
      }
      W.set(x - 2, G + 1, z, px([B.STONE_BRICKS, B.COBBLESTONE, B.MOSSY_COBBLESTONE]));
      W.set(x + 2, G + 1, z, px([B.STONE_BRICKS, B.COBBLESTONE, B.MOSSY_COBBLESTONE]));
      if (W.chance(0.12)) W.set(x, G + 2, z, B.LILY_PAD);
      if (W.chance(0.10)) { W.set(x - 2, G + 2, z, B.SUGAR_CANE); W.set(x - 2, G + 3, z, B.SUGAR_CANE); }
      if (W.chance(0.08)) W.set(x + 2, G + 2, z, B.SUGAR_CANE);
    }
    W.marker('splash', 55, G + 2, 9, { rate: 3 });
    W.marker('splash', 54, G + 2, 24, { rate: 2 });
    // moored boat
    W.set(54, G + 2, 27, B.BOAT);
    // three bridges
    for (const [bz, mat] of [[2, B.OAK_PLANKS], [16, B.SPRUCE_PLANKS], [26, B.DARK_OAK_PLANKS]]) {
      const bx = (bz < 9) ? 56 : 54;
      for (let x = bx - 3; x <= bx + 3; x++) {
        W.set(x, G + 2, bz, mat); W.set(x, G + 2, bz + 1, mat);
        W.set(x, G + 3, bz - 1, B.OAK_FENCE); W.set(x, G + 3, bz + 2, B.OAK_FENCE);
        W.set(x, G + 2, bz - 1, B.OAK_SLAB); W.set(x, G + 2, bz + 2, B.OAK_SLAB);
      }
      for (const sx of [bx - 3, bx + 3]) {
        W.set(sx, G + 4, bz - 1, B.OAK_FENCE); W.set(sx, G + 5, bz - 1, B.LANTERN);
        W.stair(sx, G + 1, bz, B.STONE_BRICK_STAIRS, sx < bx ? 'e' : 'w');
        W.stair(sx, G + 1, bz + 1, B.STONE_BRICK_STAIRS, sx < bx ? 'e' : 'w');
      }
      W.marker('glow', bx - 3, G + 5, bz - 1, { r: 5, color: [1, 0.8, 0.45], power: 0.7 });
    }
  }

  function walkways() {
    // raised decking linking the shops, 1 block above the ground
    const runs = [
      [[24, 8], [24, 22]], [[24, 22], [32, 22]],
      [[32, 8], [48, 8]], [[48, 8], [48, 21]],
      [[33, 22], [44, 22]], [[47, 8], [47, -1]],
    ];
    for (const [[ax, az], [bx, bz]] of runs) {
      const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(ax + (bx - ax) * i / n), z = Math.round(az + (bz - az) * i / n);
        for (let d = 0; d <= 1; d++) {
          const wx = (ax === bx) ? x + d : x, wz = (ax === bx) ? z : z + d;
          if (W.get(wx, G + 1, wz) === B.WATER) continue;
          W.set(wx, G + 1, wz, px([B.OAK_PLANKS, B.OAK_PLANKS, B.SPRUCE_PLANKS]));
        }
        if (i % 5 === 0) {
          const px2 = (ax === bx) ? x - 1 : x, pz2 = (ax === bx) ? z : z - 1;
          W.set(px2, G + 1, pz2, B.OAK_LOG);
          W.set(px2, G + 2, pz2, B.OAK_FENCE);
          W.set(px2, G + 3, pz2, B.LANTERN);
        }
      }
    }
    // steps at the ends
    for (const [sx, sz, d] of [[24, 7, 'n'], [24, 23, 's'], [48, 22, 's'], [47, -2, 'n']])
      for (let k = 0; k < 2; k++) W.stair(sx + k, G + 1, sz, B.OAK_STAIRS, d);
  }

  function dressing() {
    // vines + moss on the older stone buildings
    for (let i = 0; i < 200; i++) {
      const x = W.randRange(22, 60), z = W.randRange(-6, 30), y = G + W.randRange(2, 6);
      if (!W.isAir(x, y, z)) continue;
      const dirs = [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]];
      const [d, dx, dz] = dirs[W.randi(4)];
      if (!W.isSolid(x + dx, y, z + dz)) continue;
      W.face(x, y, z, W.chance(0.8) ? B.VINE : B.GLOW_LICHEN, d === 'n' ? 'n' : d === 's' ? 's' : d === 'e' ? 'e' : 'w');
    }
    // scattered crates, plants, torches in the alleys
    for (let i = 0; i < 90; i++) {
      const x = W.randRange(23, 59), z = W.randRange(-5, 29);
      if (!W.isAir(x, G + 1, z) || !W.isSolid(x, G, z)) continue;
      const r = W.rand();
      if (r < 0.10) { W.set(x, G + 1, z, B.BARREL); if (W.chance(0.4)) W.set(x, G + 2, z, B.BARREL); }
      else if (r < 0.16) W.set(x, G + 1, z, B.CHEST);
      else if (r < 0.22) { W.set(x, G + 1, z, B.FLOWER_POT); W.set(x, G + 2, z, px(FLOWERS)); }
      else if (r < 0.30) W.set(x, G + 1, z, B.TORCH);
      else if (r < 0.36) W.set(x, G + 1, z, px([B.TALL_GRASS, B.FERN, B.MOSS_CARPET]));
      else if (r < 0.40) W.set(x, G + 1, z, B.HAY_BALE);
      else if (r < 0.43) W.set(x, G + 1, z, B.COMPOSTER);
    }
    for (const [fx, fz] of [[26, 10], [43, 25], [57, 15], [33, 4], [52, 10]])
      W.marker('firefly', fx, G + 3, fz, { r: 5, count: 4 });
  }

  /* =================================================================== */
  function build() {
    W.seed(31415926);
    square();
    bakery(); armoury(); arcanum(); generalStore(); library(); flowerShop(); fishHut();
    stalls();
    channel();
    walkways();
    dressing();

    poi('Market street', 48, 35, 19, 180, -3);
    poi('Market square', 38, 50, 32, 180, -30);
    poi('The arcanum', 49, 35, 2, 0, 0);
    poi('Canal bridge', 54, 38, 20, 350, -8);
    poi('The bakery', 27, 35, 3, 0, -2);
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.market = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
