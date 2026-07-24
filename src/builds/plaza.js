/* =====================================================================
   CENTRAL PLAZA  —  the spawn point itself, plus every connecting path,
   bridge, stair and light that ties the five districts together.
   Runs last. Zone: the middle of the map, x -28..20, z -20..36.
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;
  const px = l => W.pick(l);
  const G = 32;
  const CX = -3, CZ = 6;                         // plaza centre / world spawn

  const PAVE = [B.STONE_BRICKS, B.STONE_BRICKS, B.STONE_BRICKS, B.COBBLESTONE,
    B.ANDESITE, B.POLISHED_ANDESITE, B.MOSSY_STONE_BRICKS, B.CRACKED_STONE_BRICKS,
    B.SMOOTH_STONE, B.GRAVEL];
  const FLOWERS = [B.POPPY, B.DANDELION, B.ALLIUM, B.CORNFLOWER, B.OXEYE_DAISY,
    B.RED_TULIP, B.PINK_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP, B.BLUE_ORCHID];

  /* ------------------------------------------------------------------ */
  function pave(x, z, mix) {
    if (!W.isSolid(x, G, z)) return;
    W.set(x, G, z, px(mix || PAVE));
    if (!W.isAir(x, G + 1, z)) {
      const d = W.get(x, G + 1, z);
      if (d && d !== B.WATER) W.clear(x, G + 1, z, x, G + 1, z);
    }
  }

  function plazaFloor() {
    for (let z = -16; z <= 28; z++)
      for (let x = -22; x <= 17; x++) {
        const d = Math.hypot(x - CX, (z - CZ) * 0.85);
        if (d > 21) continue;
        if (!W.isSolid(x, G, z)) continue;
        if (d < 4) pave(x, z, [B.CHISELED_STONE_BRICKS, B.SMOOTH_STONE, B.POLISHED_ANDESITE]);
        else if (d < 5.5) pave(x, z, [B.POLISHED_ANDESITE, B.ANDESITE]);
        else if (d > 18 && W.chance(0.55)) pave(x, z, [B.DIRT_PATH, B.COARSE_DIRT, B.GRAVEL, B.GRASS_BLOCK]);
        else pave(x, z);
      }
    // concentric inlay rings
    for (const [r, mat] of [[6, B.POLISHED_DIORITE], [11, B.ANDESITE], [16, B.COBBLESTONE]])
      for (let a = 0; a < 360; a += 2) {
        const x = Math.round(CX + Math.cos(a * Math.PI / 180) * r);
        const z = Math.round(CZ + Math.sin(a * Math.PI / 180) * r / 0.85);
        if (W.isSolid(x, G, z)) W.set(x, G, z, mat);
      }
    // radial spokes toward each district
    const spokes = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dz] of spokes)
      for (let r = 5; r <= 20; r++) {
        const x = Math.round(CX + dx * r * 0.9), z = Math.round(CZ + dz * r);
        if (W.isSolid(x, G, z)) W.set(x, G, z, W.chance(0.5) ? B.SMOOTH_STONE : B.POLISHED_ANDESITE);
      }
  }

  /* ---- the spawn monument -------------------------------------------- */
  function monument() {
    // stepped plinth
    for (let k = 0; k < 3; k++) {
      const r = 4 - k;
      W.disc(CX, G + k, CZ, r, px([B.CHISELED_STONE_BRICKS, B.SMOOTH_STONE, B.STONE_BRICKS]));
      for (let a = 0; a < 360; a += 6) {
        const x = Math.round(CX + Math.cos(a * Math.PI / 180) * r);
        const z = Math.round(CZ + Math.sin(a * Math.PI / 180) * r);
        W.stair(x, G + k, z, B.STONE_BRICK_STAIRS,
          Math.abs(x - CX) > Math.abs(z - CZ) ? (x > CX ? 'w' : 'e') : (z > CZ ? 'n' : 's'));
      }
    }
    W.disc(CX, G + 3, CZ, 2, B.SMOOTH_STONE);
    // obelisk
    for (let y = G + 4; y <= G + 12; y++) {
      const r = y < G + 9 ? 1 : 0;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          W.set(CX + dx, y, CZ + dz, px([B.QUARTZ_BLOCK, B.SMOOTH_QUARTZ, B.CHISELED_QUARTZ, B.QUARTZ_PILLAR]));
      if (y === G + 6 || y === G + 8) {
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) W.set(CX + dx, y, CZ + dz, B.SEA_LANTERN);
      }
    }
    W.set(CX, G + 13, CZ, B.GLOWSTONE);
    W.set(CX, G + 14, CZ, B.END_ROD);
    W.marker('glow', CX, G + 14, CZ, { r: 14, color: [0.85, 0.93, 1.0], power: 1.5 });
    W.marker('glow', CX, G + 6, CZ, { r: 9, color: [1, 0.85, 0.55], power: 0.9 });
    W.marker('spark', CX, G + 13, CZ, { rate: 2.5 });
    // signs & braziers around the base
    const dirs = [[4, 0, 'w'], [-4, 0, 'e'], [0, 4, 'n'], [0, -4, 's']];
    for (const [dx, dz, d] of dirs) {
      W.set(CX + dx, G + 3, CZ + dz, B.COBBLE_WALL);
      W.set(CX + dx, G + 4, CZ + dz, B.LANTERN);
    }
    for (const [dx, dz] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) {
      W.set(CX + dx, G + 1, CZ + dz, B.COBBLESTONE);
      W.set(CX + dx, G + 2, CZ + dz, B.COBBLE_WALL);
      W.set(CX + dx, G + 3, CZ + dz, B.CAMPFIRE);
      W.marker('smoke', CX + dx, G + 4, CZ + dz, { rate: 4, rise: 0.85, spread: 0.4 });
      W.marker('glow', CX + dx, G + 3, CZ + dz, { r: 6, color: [1, 0.6, 0.25], power: 0.9 });
    }
    W.face(CX + 1, G + 5, CZ + 1, B.SPAWN_SIGN, 's');
    W.face(CX - 1, G + 5, CZ - 1, B.SPAWN_SIGN, 'n');
  }

  /* ---- community board + noticeboards -------------------------------- */
  function board() {
    const bx = -14, bz = 14;
    for (let dz = 0; dz <= 4; dz++) {
      for (let dy = 1; dy <= 4; dy++) W.set(bx, G + dy, bz + dz, px([B.OAK_PLANKS, B.SPRUCE_PLANKS, B.DARK_OAK_PLANKS]));
      W.logAxis(bx, G + 5, bz + dz, B.DARK_OAK_LOG, 'z');
    }
    for (const dz of [0, 4]) for (let dy = 1; dy <= 5; dy++) W.logAxis(bx, G + dy, bz + dz, B.DARK_OAK_LOG, 'y');
    for (let dz = 1; dz <= 3; dz++) {
      W.face(bx + 1, G + 4, bz + dz, px([B.SHOP_SIGN, B.TRADES_SIGN, B.FOOD_SIGN, B.GEAR_SIGN]), 'e');
      W.face(bx + 1, G + 3, bz + dz, px([B.ITEM_FRAME, B.MAP_FRAME]), 'e');
      W.face(bx + 1, G + 2, bz + dz, px([B.ITEM_FRAME, B.PAINTING_A, B.MAP_FRAME]), 'e');
    }
    for (let x = bx - 1; x <= bx + 1; x++) W.stair(x, G + 6, bz + 2, B.DARK_OAK_STAIRS, 'e');
    W.set(bx + 1, G + 5, bz, B.HANGING_LANTERN);
    W.set(bx + 1, G + 5, bz + 4, B.HANGING_LANTERN);
    W.set(bx - 1, G + 1, bz, B.BARREL); W.set(bx - 1, G + 1, bz + 4, B.BARREL);
    W.set(bx + 2, G + 1, bz + 2, B.LECTERN, 3);
    W.set(bx + 2, G + 1, bz, B.ARMOR_STAND);
    W.set(bx + 2, G + 1, bz + 4, B.WOLF_STATUE);
  }

  /* ---- nether portal + end frames on a side terrace ------------------ */
  function portal() {
    const ox = 11, oz = -8;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++)
      if (W.isSolid(ox + dx, G, oz + dz)) W.set(ox + dx, G, oz + dz, px([B.BLACKSTONE, B.POLISHED_DEEPSLATE, B.OBSIDIAN, B.NETHER_BRICKS]));
    for (let dx = -2; dx <= 2; dx++) { W.set(ox + dx, G + 1, oz, B.OBSIDIAN); W.set(ox + dx, G + 5, oz, B.OBSIDIAN); }
    for (let y = G + 1; y <= G + 5; y++) { W.set(ox - 2, y, oz, B.OBSIDIAN); W.set(ox + 2, y, oz, B.OBSIDIAN); }
    for (let dx = -1; dx <= 1; dx++) for (let y = G + 2; y <= G + 4; y++) W.set(ox + dx, y, oz, B.PURPLE_STAINED_GLASS);
    W.marker('glow', ox, G + 3, oz, { r: 8, color: [0.65, 0.3, 1.0], power: 1.2 });
    W.marker('spark', ox, G + 3, oz, { rate: 5 });
    for (const [dx, dz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]]) {
      W.set(ox + dx, G + 1, oz + dz, B.CRYING_OBSIDIAN);
      W.set(ox + dx, G + 2, oz + dz, B.SOUL_LANTERN);
    }
    // end-portal ring display
    for (const [dx, dz] of [[-1, 3], [0, 3], [1, 3], [-1, 5], [0, 5], [1, 5], [-2, 4], [2, 4]])
      W.set(ox + dx, G + 1, oz + dz, B.END_PORTAL_FRAME);
    W.set(ox, G + 1, oz + 4, B.PURPUR_BLOCK);
    W.set(ox, G + 2, oz + 4, B.END_ROD);
    W.face(ox + 3, G + 2, oz + 4, B.TRADES_SIGN, 'e');
  }

  /* ---- farm plots + market gardens ------------------------------------ */
  function farms() {
    for (const [fx, fz, w, d] of [[-20, 20, 8, 7], [6, 18, 9, 8], [-19, -12, 7, 6]]) {
      for (let z = fz; z < fz + d; z++)
        for (let x = fx; x < fx + w; x++) {
          if (!W.isSolid(x, G, z)) continue;
          if (x === fx + (w >> 1)) { W.set(x, G, z, B.WATER); W.clear(x, G + 1, z, x, G + 1, z); continue; }
          W.set(x, G, z, Math.abs(x - (fx + (w >> 1))) <= 4 ? B.FARMLAND_WET : B.FARMLAND);
          const r = W.rand();
          W.set(x, G + 1, z, r < 0.46 ? B.WHEAT : r < 0.6 ? B.WHEAT_YOUNG : r < 0.74 ? B.CARROTS :
            r < 0.86 ? B.POTATOES : B.BEETROOTS);
        }
      for (let z = fz - 1; z <= fz + d; z++) { W.set(fx - 1, G + 1, z, B.OAK_FENCE); W.set(fx + w, G + 1, z, B.OAK_FENCE); }
      for (let x = fx - 1; x <= fx + w; x++) { W.set(x, G + 1, fz - 1, B.OAK_FENCE); W.set(x, G + 1, fz + d, B.OAK_FENCE); }
      W.set(fx + 1, G + 1, fz - 1, B.OAK_FENCE_GATE, 0);
      W.set(fx - 1, G + 2, fz - 1, B.TORCH); W.set(fx + w, G + 2, fz + d, B.TORCH);
      W.set(fx + w - 1, G + 1, fz + d + 1, B.COMPOSTER);
      W.set(fx, G + 1, fz + d + 1, B.BARREL);
      W.set(fx + 2, G + 2, fz - 1, B.CARVED_PUMPKIN, 2);
      W.set(fx + 2, G + 1, fz - 1, B.HAY_BALE);
    }
  }

  /* ---- minecart rail loop --------------------------------------------- */
  function rails() {
    const pts = [];
    for (let x = -20; x <= 15; x++) pts.push([x, -14]);
    for (let z = -14; z <= 30; z++) pts.push([15, z]);
    for (let x = 15; x >= -20; x--) pts.push([x, 30]);
    for (let z = 30; z >= -14; z--) pts.push([-20, z]);
    let i = 0;
    for (const [x, z] of pts) {
      if (!W.isSolid(x, G, z)) { i++; continue; }
      W.set(x, G, z, px([B.GRAVEL, B.COBBLESTONE, B.ANDESITE]));
      W.set(x, G + 1, z, (i % 9 === 0) ? B.POWERED_RAIL : B.RAIL);
      if (i % 16 === 0) {
        W.set(x, G, z, B.STONE_BRICKS);
        W.set(x + 1, G + 1, z, B.REDSTONE_TORCH);
      }
      i++;
    }
    W.set(-6, G + 2, -14, B.MINECART);
    W.set(15, G + 2, 12, B.MINECART);
  }

  /* ---- pond, bridge and stream near the plaza -------------------------- */
  function water() {
    // a small ornamental pool west of the monument
    const wx = -16, wz = 0;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx * 0.6 + dz * dz > 10) continue;
        W.set(wx + dx, G, wz + dz, B.WATER);
        W.set(wx + dx, G - 1, wz + dz, px([B.SAND, B.GRAVEL, B.CLAY]));
        W.clear(wx + dx, G + 1, wz + dz, wx + dx, G + 2, wz + dz);
      }
    for (let a = 0; a < 360; a += 8) {
      const x = Math.round(wx + Math.cos(a * Math.PI / 180) * 5);
      const z = Math.round(wz + Math.sin(a * Math.PI / 180) * 4);
      if (W.get(x, G, z) !== B.WATER) W.set(x, G, z, px([B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.STONE_BRICKS]));
    }
    for (let i = 0; i < 8; i++) {
      const x = wx + W.randRange(-3, 3), z = wz + W.randRange(-2, 2);
      if (W.get(x, G, z) === B.WATER && W.isAir(x, G + 1, z)) W.set(x, G + 1, z, B.LILY_PAD);
    }
    W.set(wx - 4, G + 1, wz, B.BOAT);
    W.marker('splash', wx, G + 1, wz, { rate: 2 });
    for (const [lx, lz] of [[wx - 5, wz - 3], [wx + 5, wz + 3], [wx - 5, wz + 3], [wx + 5, wz - 3]]) {
      W.set(lx, G + 1, lz, B.COBBLE_WALL); W.set(lx, G + 2, lz, B.LANTERN);
    }
    // fishing jetty
    for (let x = wx + 3; x <= wx + 7; x++) {
      W.set(x, G + 1, wz, B.OAK_PLANKS); W.set(x, G + 1, wz + 1, B.OAK_PLANKS);
      W.set(x, G + 2, wz - 1, B.OAK_FENCE); W.set(x, G + 2, wz + 2, B.OAK_FENCE);
    }
    W.set(wx + 7, G + 2, wz, B.BARREL);
    W.set(wx + 7, G + 3, wz + 1, B.LANTERN);
    W.set(wx + 7, G + 2, wz + 1, B.OAK_FENCE);
  }

  /* ---- the connecting paths ------------------------------------------- */
  function link(ax, az, bx, bz, width, mix) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x0 = ax + (bx - ax) * t, z0 = az + (bz - az) * t;
      for (let d = -width; d <= width; d++) {
        const x = Math.round(x0 + (Math.abs(bx - ax) < Math.abs(bz - az) ? d : 0));
        const z = Math.round(z0 + (Math.abs(bx - ax) < Math.abs(bz - az) ? 0 : d));
        const y = W.heightAt(x, z, 60);
        if (y < 0 || y < G - 6 || y > G + 14) continue;
        if (W.get(x, y, z) === B.WATER) continue;
        W.set(x, y, z, px(mix || [B.DIRT_PATH, B.DIRT_PATH, B.COBBLESTONE, B.GRAVEL, B.COARSE_DIRT]));
        W.clear(x, y + 1, z, x, y + 1, z);
      }
      if (i % 14 === 0) {
        const x = Math.round(x0) + (Math.abs(bx - ax) < Math.abs(bz - az) ? width + 1 : 0);
        const z = Math.round(z0) + (Math.abs(bx - ax) < Math.abs(bz - az) ? 0 : width + 1);
        const y = W.heightAt(x, z, 60);
        if (y > 0 && W.isAir(x, y + 1, z)) {
          W.set(x, y + 1, z, B.COBBLE_WALL);
          W.set(x, y + 2, z, B.LANTERN);
          W.marker('glow', x, y + 2, z, { r: 5, color: [1, 0.8, 0.45], power: 0.6 });
        }
      }
    }
  }

  /* stepped ramp for a path that has to climb */
  function ramp(x0, z0, x1, z1, w) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = Math.round(x0 + (x1 - x0) * t), cz = Math.round(z0 + (z1 - z0) * t);
      const y = W.heightAt(cx, cz, 70);
      for (let d = -w; d <= w; d++) {
        const ax = (Math.abs(x1 - x0) < Math.abs(z1 - z0)) ? cx + d : cx;
        const az = (Math.abs(x1 - x0) < Math.abs(z1 - z0)) ? cz : cz + d;
        const ay = W.heightAt(ax, az, 70);
        if (ay < 0) continue;
        W.set(ax, ay, az, px([B.STONE_BRICKS, B.COBBLESTONE, B.MOSSY_STONE_BRICKS, B.ANDESITE]));
        W.clear(ax, ay + 1, az, ax, ay + 2, az);
      }
      void y;
    }
  }

  function paths() {
    link(CX - 6, CZ, -30, 22, 2);                       // -> poor district
    link(CX + 6, CZ, 22, 8, 2);                         // -> market
    link(CX, CZ + 8, -4, 40, 2);                        // -> football ground
    link(CX, CZ - 8, -2, -22, 2, [B.STONE_BRICKS, B.COBBLESTONE, B.ANDESITE, B.DIRT_PATH]);  // -> bee mound
    link(CX + 8, CZ - 6, 30, -22, 2, [B.SMOOTH_STONE, B.STONE_BRICKS, B.POLISHED_ANDESITE]); // -> modern quarter
    ramp(-2, -20, -2, -23, 3);
    ramp(28, -20, 30, -23, 3);
    // grand stair up to the bee mound
    for (let k = 0; k < 8; k++) {
      const y = G + k, z = -19 - k;
      for (let x = -7; x <= 4; x++) {
        W.fill(x, G - 2, z, x, y - 1, z, px([B.STONE_BRICKS, B.COBBLESTONE, B.MOSSY_STONE_BRICKS]));
        W.stair(x, y, z, W.chance(0.2) ? B.MOSSY_COBBLE_STAIRS : B.STONE_BRICK_STAIRS, 'n');
      }
      for (const cx2 of [-8, 5]) {
        W.fill(cx2, G - 2, z, cx2, y, z, px([B.COBBLESTONE, B.STONE_BRICKS]));
        W.set(cx2, y + 1, z, B.COBBLE_WALL);
        if (k % 3 === 0) { W.set(cx2, y + 2, z, B.LANTERN); W.marker('glow', cx2, y + 2, z, { r: 6, color: [1, 0.8, 0.45], power: 0.7 }); }
      }
    }
    // stair up to the modern terrace
    for (let k = 0; k < 6; k++) {
      const y = G + k, x = 20 + k;
      for (let z = -26; z <= -18; z++) {
        W.fill(x, G - 2, z, x, y - 1, z, px([B.SMOOTH_STONE, B.STONE_BRICKS]));
        W.stair(x, y, z, B.SMOOTH_STONE_STAIRS, 'w');
      }
      if (k % 2 === 0) { W.set(x, y + 1, -27, B.QUARTZ_WALL); W.set(x, y + 2, -27, B.SEA_LANTERN); }
    }
  }

  /* ---- planting, benches, clutter, lighting ---------------------------- */
  function dressing() {
    // flower beds ringing the plaza
    for (let a = 0; a < 360; a += 30) {
      const x = Math.round(CX + Math.cos(a * Math.PI / 180) * 13);
      const z = Math.round(CZ + Math.sin(a * Math.PI / 180) * 15);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!W.isSolid(x + dx, G, z + dz)) continue;
          if (Math.abs(dx) === 1 && Math.abs(dz) === 1) { W.set(x + dx, G + 1, z + dz, B.COBBLE_WALL); continue; }
          W.set(x + dx, G, z + dz, B.GRASS_BLOCK);
          W.set(x + dx, G + 1, z + dz, W.chance(0.25) ? px([B.ROSE_BUSH, B.LILAC, B.SUNFLOWER]) : px(FLOWERS));
        }
    }
    // benches on the spokes
    for (const [bx, bz, d] of [[-9, 0, 'n'], [3, 0, 'n'], [-9, 12, 's'], [3, 12, 's'],
    [-12, 6, 'e'], [6, 6, 'w']]) {
      for (let i = -1; i <= 1; i++) {
        const x = (d === 'e' || d === 'w') ? bx : bx + i;
        const z = (d === 'e' || d === 'w') ? bz + i : bz;
        W.stair(x, G + 1, z, B.OAK_STAIRS, d);
      }
      W.set(bx + (d === 'e' || d === 'w' ? 0 : 2), G + 1, bz + (d === 'e' || d === 'w' ? 2 : 0), B.OAK_FENCE);
      W.set(bx - (d === 'e' || d === 'w' ? 0 : 2), G + 1, bz - (d === 'e' || d === 'w' ? 2 : 0), B.OAK_FENCE);
    }
    // lamp posts on the ring
    for (let a = 0; a < 360; a += 45) {
      const x = Math.round(CX + Math.cos(a * Math.PI / 180) * 9);
      const z = Math.round(CZ + Math.sin(a * Math.PI / 180) * 10);
      if (!W.isSolid(x, G, z)) continue;
      W.set(x, G + 1, z, B.STONE_BRICKS);
      for (let y = G + 2; y <= G + 4; y++) W.set(x, y, z, B.COBBLE_WALL);
      W.set(x, G + 5, z, B.LANTERN);
      W.slab(x, G + 6, z, B.STONE_BRICK_SLAB, 'b');
      W.marker('glow', x, G + 5, z, { r: 7, color: [1, 0.8, 0.45], power: 0.8 });
      W.marker('spark', x, G + 5, z, { rate: 0.7 });
    }
    // trees in the outer ring
    for (let a = 15; a < 360; a += 40) {
      const x = Math.round(CX + Math.cos(a * Math.PI / 180) * 18);
      const z = Math.round(CZ + Math.sin(a * Math.PI / 180) * 20);
      if (!W.isSolid(x, G, z) || !W.isAir(x, G + 1, z)) continue;
      const h = W.randRange(4, 6);
      for (let i = 1; i <= h; i++) W.set(x, G + i, z, W.chance(0.5) ? B.OAK_LOG : B.BIRCH_LOG);
      W.ellipsoid(x, G + h + 1, z, 3, 2, 3, W.chance(0.5) ? B.OAK_LEAVES : B.BIRCH_LEAVES);
      W.set(x + 1, G + 1, z, B.LANTERN);
      W.marker('firefly', x, G + h, z, { r: 5, count: 5 });
    }
    // scattered market clutter and props on the plaza edge
    for (let i = 0; i < 120; i++) {
      const x = W.randRange(-22, 17), z = W.randRange(-16, 28);
      if (!W.isAir(x, G + 1, z) || !W.isSolid(x, G, z)) continue;
      const d = Math.hypot(x - CX, (z - CZ) * 0.85);
      if (d < 6 || d > 21) continue;
      const r = W.rand();
      if (r < 0.06) { W.set(x, G + 1, z, B.BARREL); if (W.chance(0.4)) W.set(x, G + 2, z, B.BARREL); }
      else if (r < 0.10) W.set(x, G + 1, z, B.CHEST);
      else if (r < 0.14) W.set(x, G + 1, z, B.HAY_BALE);
      else if (r < 0.20) { W.set(x, G + 1, z, B.FLOWER_POT); W.set(x, G + 2, z, px(FLOWERS)); }
      else if (r < 0.26) W.set(x, G + 1, z, B.TORCH);
      else if (r < 0.30) W.set(x, G + 1, z, px([B.TALL_GRASS, B.FERN, B.MOSS_CARPET]));
      else if (r < 0.32) W.set(x, G + 1, z, W.chance(0.5) ? B.CAT_STATUE : B.WOLF_STATUE);
      else if (r < 0.335) W.set(x, G + 1, z, B.ARMOR_STAND);
      else if (r < 0.345) W.set(x, G + 1, z, B.JACK_O_LANTERN);
    }
    for (const [fx, fz] of [[-18, 24], [12, 22], [-20, -10], [14, 16], [0, 26], [-10, -14]])
      W.marker('firefly', fx, G + 3, fz, { r: 8, count: 7 });
  }

  /* =================================================================== */
  function build() {
    W.seed(112358);
    plazaFloor();
    paths();
    water();
    farms();
    rails();
    monument();
    board();
    portal();
    dressing();

    poi('Spawn', CX, G + 3, CZ + 16, 180, -4);
    poi('Plaza monument', CX + 9, G + 6, CZ + 11, 222, -12);
    poi('Ornamental pool', -16, G + 4, 9, 180, -10);
    poi('Nether gate', 11, G + 3, -2, 178, -3);
    poi('Spawn, from above', CX, G + 32, CZ + 34, 180, -30);
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.plaza = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
