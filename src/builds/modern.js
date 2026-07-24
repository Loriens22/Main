/* =====================================================================
   MODERN QUARTER  —  quartz high-rise, teal annex, skybridge, plaza
   Zone : x 26..64   z -60..-22   ground y=38   max y=86
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;
  const px = l => W.pick(l);

  const G = 38;
  const TX0 = 32, TX1 = 51, TZ0 = -56, TZ1 = -41;      // tower footprint 20 x 16
  const IX0 = TX0 + 1, IX1 = TX1 - 1, IZ0 = TZ0 + 1, IZ1 = TZ1 - 1;
  const LOBBY = 39;                                     // lobby floor slab
  const DECKS = [48, 53, 58, 63, 68, 73];               // upper floor slabs
  const ROOF = 78;
  const SETBACK = 68;                                   // floors above this inset by 2

  const AX0 = 54, AX1 = 63, AZ0 = -54, AZ1 = -45;       // annex
  const ADECK = [39, 44, 49, 54];                       // annex slabs (54 = roof)

  const QUARTZ = [B.QUARTZ_BLOCK, B.QUARTZ_BLOCK, B.QUARTZ_BLOCK, B.SMOOTH_QUARTZ,
    B.SMOOTH_QUARTZ, B.QUARTZ_BRICKS, B.CALCITE, B.WHITE_CONCRETE];
  const GREY = [B.LIGHT_GRAY_CONCRETE, B.LIGHT_GRAY_CONCRETE, B.GRAY_CONCRETE,
    B.POLISHED_DIORITE, B.SMOOTH_STONE];
  const GLASSMIX = [B.LIGHT_BLUE_STAINED_GLASS, B.LIGHT_BLUE_STAINED_GLASS,
    B.BLUE_STAINED_GLASS, B.CYAN_STAINED_GLASS, B.TINTED_GLASS];
  const TEAL = [B.CYAN_CONCRETE, B.CYAN_CONCRETE, B.CYAN_TERRACOTTA,
    B.PRISMARINE, B.DARK_PRISMARINE, B.PRISMARINE_BRICKS];

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
  function inset(Y) { return Y >= SETBACK ? 2 : 0; }
  function foot(Y) {
    const k = inset(Y);
    return { x0: TX0 + k, x1: TX1 - k, z0: TZ0 + k, z1: TZ1 - k };
  }

  /* =================================================================== */
  /* 1.  TOWER SHELL                                                     */
  /* =================================================================== */
  function shell() {
    const levels = [LOBBY].concat(DECKS);
    for (let i = 0; i < levels.length; i++) {
      const Y = levels[i];
      const top = (i === levels.length - 1) ? ROOF : levels[i + 1];
      const F = foot(Y);
      // floor slab
      fillMix(F.x0, Y, F.z0, F.x1, Y, F.z1, i === 0 ? GREY : QUARTZ);
      // walls
      wallsMix(F.x0, Y + 1, F.z0, F.x1, top - 1, F.z1, QUARTZ);
      // curtain-wall bays between the pillars
      for (let y = Y + 2; y <= top - 2; y++) {
        for (let x = F.x0 + 1; x <= F.x1 - 1; x++) {
          if ((x - TX0) % 5 === 0) continue;                       // pillar rib
          W.set(x, y, F.z0, px(GLASSMIX)); W.set(x, y, F.z1, px(GLASSMIX));
        }
        for (let z = F.z0 + 1; z <= F.z1 - 1; z++) {
          if ((z - TZ0) % 5 === 0) continue;
          W.set(F.x0, y, z, px(GLASSMIX)); W.set(F.x1, y, z, px(GLASSMIX));
        }
      }
      // vertical quartz pillar ribs, projecting one block proud
      for (let x = F.x0; x <= F.x1; x++) {
        if ((x - TX0) % 5) continue;
        for (let y = Y; y <= top - 1; y++) {
          W.logAxis(x, y, F.z0 - 1, B.QUARTZ_PILLAR, 'y');
          W.logAxis(x, y, F.z1 + 1, B.QUARTZ_PILLAR, 'y');
        }
      }
      for (let z = F.z0; z <= F.z1; z++) {
        if ((z - TZ0) % 5) continue;
        for (let y = Y; y <= top - 1; y++) {
          W.logAxis(F.x0 - 1, y, z, B.QUARTZ_PILLAR, 'y');
          W.logAxis(F.x1 + 1, y, z, B.QUARTZ_PILLAR, 'y');
        }
      }
      // corner pillars
      for (const [cx, cz] of [[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]])
        for (let y = Y; y <= top - 1; y++) W.logAxis(cx, y, cz, B.QUARTZ_PILLAR, 'y');
      // spandrel band at every floor line, projecting one block
      const band = (i % 3 === 1) ? B.CYAN_TERRACOTTA : B.GRAY_CONCRETE;
      for (let x = F.x0 - 1; x <= F.x1 + 1; x++) {
        W.set(x, Y, F.z0 - 1, band); W.set(x, Y, F.z1 + 1, band);
        W.slab(x, Y + 1, F.z0 - 1, B.GRAY_CONCRETE_SLAB, 'b');
        W.slab(x, Y + 1, F.z1 + 1, B.GRAY_CONCRETE_SLAB, 'b');
      }
      for (let z = F.z0 - 1; z <= F.z1 + 1; z++) {
        W.set(F.x0 - 1, Y, z, band); W.set(F.x1 + 1, Y, z, band);
        W.slab(F.x0 - 1, Y + 1, z, B.GRAY_CONCRETE_SLAB, 'b');
        W.slab(F.x1 + 1, Y + 1, z, B.GRAY_CONCRETE_SLAB, 'b');
      }
      // sea-lantern strip washing the facade
      for (let x = F.x0 + 2; x <= F.x1 - 2; x += 4) {
        W.set(x, Y + 1, F.z0 - 1, B.SEA_LANTERN);
        W.set(x, Y + 1, F.z1 + 1, B.SEA_LANTERN);
      }
      // hollow the storey
      W.clear(F.x0 + 1, Y + 1, F.z0 + 1, F.x1 - 1, top - 1, F.z1 - 1);
    }
    // terrace where the tower steps back
    for (let z = TZ0; z <= TZ1; z++)
      for (let x = TX0; x <= TX1; x++) {
        if (x > TX0 + 1 && x < TX1 - 1 && z > TZ0 + 1 && z < TZ1 - 1) continue;
        W.set(x, SETBACK, z, px(QUARTZ));
        if (x === TX0 || x === TX1 || z === TZ0 || z === TZ1) W.set(x, SETBACK + 1, z, B.IRON_BARS);
      }
    for (let i = 0; i < 26; i++) {
      const x = W.randRange(TX0 + 1, TX1 - 1), z = W.randRange(TZ0 + 1, TZ1 - 1);
      if (x > TX0 + 1 && x < TX1 - 1 && z > TZ0 + 1 && z < TZ1 - 1) continue;
      if (!W.isAir(x, SETBACK + 1, z)) continue;
      W.set(x, SETBACK + 1, z, px([B.AZALEA_LEAVES, B.OAK_LEAVES, B.FLOWERING_AZALEA]));
    }
    // roof slab
    const RF = foot(ROOF - 1);
    fillMix(RF.x0, ROOF, RF.z0, RF.x1, ROOF, RF.z1, QUARTZ);
  }

  /* =================================================================== */
  /* 2.  CORE — stairs, elevator, doors                                   */
  /* =================================================================== */
  function core() {
    const cx = 42, cz = -50;                    // stair core
    const levels = [LOBBY].concat(DECKS);
    for (let i = 0; i < levels.length; i++) {
      const Y = levels[i], next = (i === levels.length - 1) ? ROOF : levels[i + 1];
      // shaft walls
      wallsMix(cx - 1, Y + 1, cz - 1, cx + 4, next - 1, cz + 4, GREY);
      W.clear(cx, Y + 1, cz, cx + 3, next - 1, cz + 3);
      // stair run
      const rise = next - Y;
      for (let s = 0; s < rise; s++) {
        const half = s < rise / 2;
        const x = half ? cx : cx + 3;
        const z = half ? cz + s : cz + (rise - 1 - s);
        W.stair(x, Y + 1 + s, z, B.QUARTZ_STAIRS, half ? 'n' : 's');
        W.set(half ? cx + 1 : cx + 2, Y + 1 + s, z, B.SMOOTH_QUARTZ);
      }
      W.clear(cx, next, cz, cx + 3, next, cz + 3);
      // doorway out of the core
      W.clear(cx + 1, Y + 1, cz + 4, cx + 2, Y + 3, cz + 4);
      W.set(cx + 1, Y + 4, cz + 4, B.SEA_LANTERN);
      W.set(cx + 2, Y + 4, cz + 4, B.GLOWSTONE);
    }
    // ---- bubble-column "elevator" ----
    const ex = 47, ez = -50;
    W.fill(ex - 1, LOBBY, ez - 1, ex + 2, ROOF, ez + 2, B.QUARTZ_BLOCK);
    W.clear(ex, LOBBY, ez, ex + 1, ROOF, ez + 1);
    W.fill(ex, LOBBY, ez, ex + 1, LOBBY, ez + 1, B.SOUL_SAND);
    W.fill(ex, LOBBY + 1, ez, ex + 1, ROOF - 1, ez + 1, B.WATER);
    for (let y = LOBBY; y < ROOF; y++) {
      W.set(ex - 1, y, ez, B.GLASS); W.set(ex - 1, y, ez + 1, B.GLASS);
      W.set(ex + 2, y, ez, B.IRON_BARS); W.set(ex + 2, y, ez + 1, B.IRON_BARS);
      if (y % 5 === 4) { W.set(ex - 1, y, ez, B.SEA_LANTERN); }
    }
    for (const Y of [LOBBY].concat(DECKS)) {
      W.set(ex, Y + 1, ez - 1, B.IRON_DOOR, 0); W.set(ex, Y + 2, ez - 1, B.IRON_DOOR, 8);
      W.set(ex + 1, Y + 1, ez - 1, B.IRON_DOOR, 0); W.set(ex + 1, Y + 2, ez - 1, B.IRON_DOOR, 8);
      W.set(ex - 1, Y + 1, ez - 1, B.STONE_PLATE);
      W.marker('splash', ex, Y + 2, ez, { rate: 1.4 });
    }
    // basement / plant level
    W.clear(TX0 + 2, 31, TZ0 + 2, TX1 - 2, 37, TZ1 - 2);
    fillMix(TX0 + 2, 31, TZ0 + 2, TX1 - 2, 31, TZ1 - 2, [B.POLISHED_ANDESITE, B.GRAY_CONCRETE, B.SMOOTH_STONE]);
    wallsMix(TX0 + 1, 32, TZ0 + 1, TX1 - 1, 37, TZ1 - 1, GREY);
    for (let x = TX0 + 4; x <= TX1 - 4; x += 5)
      for (let z = TZ0 + 4; z <= TZ1 - 4; z += 5) {
        W.fill(x, 32, z, x, 37, z, B.GRAY_CONCRETE);
        W.set(x, 36, z + 1, B.REDSTONE_LAMP);
      }
    for (let z = TZ0 + 4; z <= TZ1 - 4; z++) { W.set(TX0 + 4, 32, z, B.RAIL); }
    W.set(TX0 + 4, 33, TZ0 + 6, B.MINECART);
    for (let i = 0; i < 16; i++)
      W.set(W.randRange(TX0 + 3, TX1 - 3), 32, W.randRange(TZ0 + 3, TZ1 - 3), px([B.BARREL, B.SHULKER_BOX, B.CHEST]));
    for (let i = 0; i < 10; i++) W.set(W.randRange(TX0 + 3, TX1 - 3), 37, W.randRange(TZ0 + 3, TZ1 - 3), B.REDSTONE_LAMP);
    // stair from basement into the lobby
    W.clear(cx, 32, cz, cx + 3, LOBBY, cz + 3);
    for (let s = 0; s < 7; s++) W.stair(cx, 32 + s, cz + s % 4, B.QUARTZ_STAIRS, 'n');
    W.clear(cx, LOBBY, cz, cx + 3, LOBBY, cz + 3);
  }

  /* =================================================================== */
  /* 3.  LOBBY (double height 40..47)                                     */
  /* =================================================================== */
  function lobby() {
    const y = LOBBY + 1;
    for (let z = IZ0; z <= IZ1; z++)
      for (let x = IX0; x <= IX1; x++)
        W.set(x, LOBBY, z, ((x + z) & 1) ? B.SMOOTH_QUARTZ : B.QUARTZ_BLOCK);
    for (let z = -52; z <= -45; z++) for (let x = 36; x <= 47; x++)
      if ((x + z) % 4 === 0) W.set(x, LOBBY, z, B.GRAY_CONCRETE);
    // grand entrance on the south face
    W.clear(39, y, TZ1, 44, y + 4, TZ1);
    for (let x = 39; x <= 44; x++) {
      W.set(x, y + 5, TZ1, B.CHISELED_QUARTZ);
      if (x === 41 || x === 42) { W.set(x, y, TZ1, B.IRON_DOOR, 2); W.set(x, y + 1, TZ1, B.IRON_DOOR, 10); }
      else for (let dy = 0; dy <= 4; dy++) W.set(x, y + dy, TZ1, B.LIGHT_BLUE_STAINED_GLASS);
    }
    W.set(40, y, TZ1 + 1, B.STONE_PLATE); W.set(43, y, TZ1 + 1, B.STONE_PLATE);
    W.set(41, y, TZ1 + 1, B.STONE_PLATE); W.set(42, y, TZ1 + 1, B.STONE_PLATE);
    W.set(41, y, TZ1 - 1, B.STONE_PLATE); W.set(42, y, TZ1 - 1, B.STONE_PLATE);
    // wide entrance steps
    for (let i = 0; i < 4; i++) {
      for (let x = 38 - i; x <= 45 + i; x++) {
        W.stair(x, LOBBY - i, TZ1 + 1 + i, B.QUARTZ_STAIRS, 'n');
        W.fill(x, 34, TZ1 + 1 + i, x, LOBBY - 1 - i, TZ1 + 1 + i, B.SMOOTH_QUARTZ);
      }
    }
    for (const x of [37, 46]) {
      W.fill(x, LOBBY, TZ1 + 1, x, LOBBY + 2, TZ1 + 4, B.QUARTZ_BLOCK);
      W.set(x, LOBBY + 3, TZ1 + 2, B.SEA_LANTERN);
      W.set(x, LOBBY + 3, TZ1 + 4, B.END_ROD);
      W.marker('glow', x, LOBBY + 3, TZ1 + 2, { r: 7, color: [0.8, 0.93, 1], power: 1.0 });
    }
    // reception desk
    for (let x = 39; x <= 45; x++) {
      W.set(x, y, -50, B.QUARTZ_BLOCK); W.slab(x, y + 1, -50, B.SMOOTH_QUARTZ_SLAB, 'b');
      W.set(x, y, -51, B.SMOOTH_QUARTZ);
    }
    W.set(39, y + 1, -50, B.LECTERN, 2);
    W.set(45, y + 1, -50, B.MAP_FRAME);
    for (let x = 39; x <= 45; x += 2) W.set(x, y + 1, -51, B.SEA_LANTERN);
    // chandeliers on chains
    for (const [cx2, cz2] of [[37, -46], [47, -46], [42, -44], [37, -53], [47, -53]]) {
      for (let yy = y + 5; yy <= LOBBY + 8; yy++) W.set(cx2, yy, cz2, B.CHAIN);
      W.set(cx2, y + 4, cz2, B.SEA_LANTERN);
      W.set(cx2, y + 3, cz2, B.GLOWSTONE);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) W.set(cx2 + dx, y + 4, cz2 + dz, B.SEA_LANTERN);
      W.marker('glow', cx2, y + 4, cz2, { r: 9, color: [0.82, 0.95, 1.0], power: 1.25 });
    }
    // seating cluster
    for (const [sx, sz, d] of [[38, -44, 'n'], [38, -46, 's'], [46, -44, 'n'], [46, -46, 's']]) {
      W.stair(sx, y, sz, B.QUARTZ_STAIRS, d);
      W.stair(sx + 1, y, sz, B.QUARTZ_STAIRS, d);
    }
    for (let x = 38; x <= 47; x++) for (let z = -46; z <= -44; z++)
      if (W.isAir(x, y, z)) W.set(x, y, z, ((x + z) & 1) ? B.WHITE_CARPET : B.LIGHT_BLUE_CARPET);
    // planters
    for (const [pxx, pz] of [[35, -44], [35, -54], [49, -44], [49, -54], [42, -55]]) {
      for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) {
        W.set(pxx + dx, y, pz + dz, B.QUARTZ_BLOCK);
        W.set(pxx + dx, y + 1, pz + dz, B.PODZOL);
        W.set(pxx + dx, y + 2, pz + dz, px([B.AZALEA_LEAVES, B.FLOWERING_AZALEA, B.OAK_LEAVES]));
      }
      W.set(pxx, y + 3, pz, B.FLOWERING_AZALEA);
    }
    // art
    for (const z of [-47, -49, -52]) { W.face(IX0, y + 3, z, px([B.PAINTING_A, B.PAINTING_B, B.MAP_FRAME]), 'e'); }
    W.face(41, y + 3, IZ0, B.SPAWN_SIGN, 's');
    W.face(43, y + 3, IZ0, B.MAP_FRAME, 's');
  }

  /* =================================================================== */
  /* 4.  UPPER FLOORS                                                     */
  /* =================================================================== */
  function apartment(x0, z0, x1, z1, Y, i) {
    const y = Y + 1;
    const carpet = [B.WHITE_CARPET, B.LIGHT_BLUE_CARPET, B.GRAY_CARPET, B.CYAN_CARPET][i % 4];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (W.chance(0.55) && W.isAir(x, y, z)) W.set(x, y, z, carpet);
    W.bed(x0 + 1, y, z0 + 1, B.WHITE_BED, 's');
    W.set(x0, y, z0, B.ENDER_CHEST);
    W.set(x1, y, z1, px([B.BREWING_STAND, B.SMITHING_TABLE, B.CARTOGRAPHY_TABLE, B.LOOM]));
    W.set(x1 - 1, y, z1, B.BARREL);
    if (i % 3 === 0) {
      W.set(x1, y, z0, B.ENCHANTING_TABLE);
      for (const [dx, dz] of [[-1, 0], [-1, 1], [0, 1], [-2, 0], [0, 2]])
        if (W.isAir(x1 + dx, y, z0 + dz)) W.set(x1 + dx, y, z0 + dz, B.BOOKSHELF);
    } else {
      for (let z = z0; z <= Math.min(z1, z0 + 3); z++) {
        W.set(x1, y, z, B.BOOKSHELF); if (W.chance(0.7)) W.set(x1, y + 1, z, B.BOOKSHELF);
      }
    }
    const tx = Math.floor((x0 + x1) / 2), tz = Math.floor((z0 + z1) / 2);
    W.set(tx, y, tz, B.QUARTZ_BLOCK); W.slab(tx, y + 1, tz, B.SMOOTH_QUARTZ_SLAB, 't');
    W.stair(tx - 1, y, tz, B.QUARTZ_STAIRS, 'w'); W.stair(tx + 1, y, tz, B.QUARTZ_STAIRS, 'e');
    W.set(x0, y, z1, B.QUARTZ_BLOCK); W.set(x0, y + 1, z1, B.FLOWERING_AZALEA);
    W.face(tx, y + 2, z0, px([B.MAP_FRAME, B.ITEM_FRAME, B.PAINTING_C]), 's');
    W.set(tx, Y + 4, tz, B.SEA_LANTERN);
    W.set(x0 + 1, Y + 4, z1 - 1, B.GLOWSTONE);
  }

  function floors() {
    for (let i = 0; i < DECKS.length; i++) {
      const Y = DECKS[i], F = foot(Y);
      const ix0 = F.x0 + 1, ix1 = F.x1 - 1, iz0 = F.z0 + 1, iz1 = F.z1 - 1;
      // hallway along z = -47 with a carpet runner
      for (let x = ix0; x <= ix1; x++) {
        if (W.isAir(x, Y + 1, -47)) W.set(x, Y + 1, -47, i % 2 ? B.CYAN_CARPET : B.BLUE_CARPET);
        if (W.isAir(x, Y + 1, -46)) W.set(x, Y + 1, -46, i % 2 ? B.CYAN_CARPET : B.BLUE_CARPET);
      }
      // partition wall between the hall and the north flats
      for (let x = ix0; x <= ix1; x++) {
        if (x === 36 || x === 46) continue;
        for (let dy = 1; dy <= 4; dy++) W.set(x, Y + dy, -48, px(QUARTZ));
      }
      W.clear(36, Y + 1, -48, 36, Y + 3, -48);
      W.clear(46, Y + 1, -48, 46, Y + 3, -48);
      // wall lights in iron-bar niches
      for (let x = ix0 + 2; x <= ix1 - 2; x += 5) {
        W.set(x, Y + 3, -48, B.LANTERN);
        W.set(x, Y + 4, -48, B.IRON_BARS);
      }
      // flats
      const split = 41 + (i % 2 ? 1 : 0);
      for (let dy = 1; dy <= 4; dy++)
        for (let z = iz0; z <= -49; z++)
          if (z !== -52) W.set(split, Y + dy, z, px(QUARTZ));
      apartment(ix0, iz0, split - 1, -49, Y, i);
      apartment(split + 1, iz0, ix1, -49, Y, i + 1);
      // south side: one big office / studio (avoids the stair + lift cores)
      apartment(ix0, -45, 40, iz1, Y, i + 2);
      apartment(49, -45, ix1, iz1, Y, i + 3);
      // office kit in the middle
      for (const [ox, oz] of [[37, -43], [38, -43], [50, -43]]) {
        if (W.isAir(ox, Y + 1, oz)) W.set(ox, Y + 1, oz, px([B.LOOM, B.CARTOGRAPHY_TABLE, B.SMITHING_TABLE, B.BARREL]));
      }
      for (const [lx, lz] of [[37, -47], [45, -47], [39, -43], [48, -43]]) W.set(lx, Y + 4, lz, B.SEA_LANTERN);
    }
  }

  /* =================================================================== */
  /* 5.  ROOF DECK                                                        */
  /* =================================================================== */
  function roofDeck() {
    const F = foot(ROOF - 1);
    for (let z = F.z0; z <= F.z1; z++)
      for (let x = F.x0; x <= F.x1; x++) W.slab(x, ROOF + 1, z, B.SMOOTH_QUARTZ_SLAB, 'b');
    for (let x = F.x0; x <= F.x1; x++) { W.set(x, ROOF + 1, F.z0, B.IRON_BARS); W.set(x, ROOF + 1, F.z1, B.IRON_BARS); }
    for (let z = F.z0; z <= F.z1; z++) { W.set(F.x0, ROOF + 1, z, B.IRON_BARS); W.set(F.x1, ROOF + 1, z, B.IRON_BARS); }
    // rooftop garden
    for (let z = F.z0 + 1; z <= F.z0 + 4; z++)
      for (let x = F.x0 + 1; x <= F.x0 + 8; x++) {
        W.set(x, ROOF + 1, z, B.GRASS_BLOCK);
        const r = W.rand();
        if (r < 0.16) W.set(x, ROOF + 2, z, px([B.OAK_LEAVES, B.AZALEA_LEAVES, B.FLOWERING_AZALEA]));
        else if (r < 0.42) W.set(x, ROOF + 2, z, px([B.POPPY, B.CORNFLOWER, B.OXEYE_DAISY, B.ALLIUM, B.TALL_GRASS]));
      }
    W.fill(F.x0 + 3, ROOF + 1, F.z0 + 6, F.x0 + 6, ROOF + 1, F.z0 + 7, B.WATER);
    W.set(F.x0 + 4, ROOF + 1, F.z0 + 6, B.SEA_LANTERN);
    W.marker('splash', F.x0 + 4, ROOF + 2, F.z0 + 6, { rate: 2.5 });
    // helipad ring
    for (let a = 0; a < 32; a++) {
      const ang = a / 32 * Math.PI * 2;
      const x = Math.round(44 + Math.cos(ang) * 4), z = Math.round(-46 + Math.sin(ang) * 4);
      W.set(x, ROOF + 1, z, (a % 4 < 2) ? B.WHITE_CONCRETE : B.YELLOW_CONCRETE);
    }
    W.set(44, ROOF + 1, -46, B.YELLOW_CONCRETE);
    // telescope
    for (let y = ROOF + 1; y <= ROOF + 4; y++) W.set(F.x1 - 2, y, F.z1 - 2, B.SCAFFOLDING);
    W.set(F.x1 - 2, ROOF + 5, F.z1 - 2, B.IRON_BARS);
    W.set(F.x1 - 3, ROOF + 5, F.z1 - 2, B.END_ROD);
    // seating + banners
    for (let x = F.x1 - 7; x <= F.x1 - 4; x++) { W.stair(x, ROOF + 1, F.z1 - 3, B.QUARTZ_STAIRS, 'n'); W.stair(x, ROOF + 1, F.z1 - 5, B.QUARTZ_STAIRS, 's'); }
    for (const [bx, bz] of [[F.x0 + 1, F.z1 - 1], [F.x1 - 1, F.z0 + 1]]) {
      for (let y = ROOF + 1; y <= ROOF + 5; y++) W.set(bx, y, bz, B.OAK_FENCE);
      W.face(bx, ROOF + 5, bz, W.chance(0.5) ? B.WHITE_BANNER : B.BLUE_BANNER, 'n');
    }
    // plant / HVAC
    for (const [hx, hz] of [[38, -50], [41, -52], [46, -50]]) {
      W.fill(hx, ROOF + 1, hz, hx + 2, ROOF + 3, hz + 2, px([B.IRON_BLOCK, B.COPPER_BLOCK, B.OXIDIZED_COPPER, B.GRAY_CONCRETE]));
      W.set(hx + 1, ROOF + 4, hz + 1, B.PISTON);
      W.set(hx, ROOF + 4, hz, B.OBSERVER);
    }
    W.marker('smoke', 39, ROOF + 5, -50, { rate: 6, rise: 1.0, spread: 1.2 });
    // aircraft warning lights
    for (const [cx2, cz2] of [[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]]) {
      W.set(cx2, ROOF + 2, cz2, B.END_ROD);
      W.marker('glow', cx2, ROOF + 3, cz2, { r: 6, color: [1, 0.4, 0.35], power: 1.0 });
    }
    // stair-core head house
    W.fill(42, ROOF + 1, -50, 45, ROOF + 4, -47, B.SMOOTH_QUARTZ);
    W.clear(43, ROOF + 1, -49, 44, ROOF + 3, -48);
    W.clear(43, ROOF, -49, 44, ROOF, -48);
    W.set(43, ROOF + 1, -47, B.IRON_DOOR, 2); W.set(43, ROOF + 2, -47, B.IRON_DOOR, 10);
    W.set(44, ROOF + 4, -48, B.SEA_LANTERN);
    W.marker('glow', 43, ROOF + 3, -48, { r: 7, color: [0.85, 0.95, 1], power: 1.0 });
  }

  /* =================================================================== */
  /* 6.  ANNEX + SKYBRIDGE                                                */
  /* =================================================================== */
  function annex() {
    for (let i = 0; i < ADECK.length; i++) {
      const Y = ADECK[i], top = (i === ADECK.length - 1) ? Y : ADECK[i + 1];
      fillMix(AX0, Y, AZ0, AX1, Y, AZ1, i === ADECK.length - 1 ? [B.SMOOTH_QUARTZ] : TEAL);
      if (i === ADECK.length - 1) break;
      wallsMix(AX0, Y + 1, AZ0, AX1, top - 1, AZ1, TEAL);
      for (let y = Y + 2; y <= top - 2; y++) {
        for (let x = AX0 + 2; x <= AX1 - 2; x += 2) { W.set(x, y, AZ0, px(GLASSMIX)); W.set(x, y, AZ1, px(GLASSMIX)); }
        for (let z = AZ0 + 2; z <= AZ1 - 2; z += 2) { W.set(AX0, y, z, px(GLASSMIX)); W.set(AX1, y, z, px(GLASSMIX)); }
      }
      // gold trim line
      for (let x = AX0; x <= AX1; x++) { W.set(x, Y + 1, AZ0, B.GOLD_BLOCK); W.set(x, Y + 1, AZ1, B.GOLD_BLOCK); }
      for (let z = AZ0; z <= AZ1; z++) { W.set(AX0, Y + 1, z, B.GOLD_BLOCK); W.set(AX1, Y + 1, z, B.GOLD_BLOCK); }
      W.clear(AX0 + 1, Y + 1, AZ0 + 1, AX1 - 1, top - 1, AZ1 - 1);
      // interior
      const y = Y + 1;
      for (let z = AZ0 + 1; z <= AZ1 - 1; z++) for (let x = AX0 + 1; x <= AX1 - 1; x++)
        if (W.chance(0.4)) W.set(x, y, z, px([B.CYAN_CARPET, B.WHITE_CARPET, B.LIGHT_BLUE_CARPET]));
      W.bed(AX0 + 1, y, AZ0 + 2, B.WHITE_BED, 's');
      W.set(AX1 - 1, y, AZ1 - 1, B.ENDER_CHEST);
      W.set(AX1 - 1, y, AZ0 + 1, B.BREWING_STAND);
      for (let z = AZ0 + 1; z <= AZ0 + 3; z++) { W.set(AX1 - 1, y, z + 1, B.BOOKSHELF); }
      W.set(AX0 + 4, y, AZ0 + 4, B.QUARTZ_BLOCK); W.slab(AX0 + 4, y + 1, AZ0 + 4, B.SMOOTH_QUARTZ_SLAB, 't');
      W.stair(AX0 + 3, y, AZ0 + 4, B.QUARTZ_STAIRS, 'w'); W.stair(AX0 + 5, y, AZ0 + 4, B.QUARTZ_STAIRS, 'e');
      W.set(AX0 + 4, top - 1, AZ0 + 4, B.SEA_LANTERN);
      W.set(AX0 + 2, top - 1, AZ1 - 2, B.GLOWSTONE);
      // internal stair
      W.clear(AX1 - 3, top, AZ1 - 4, AX1 - 1, top, AZ1 - 1);
      for (let s = 0; s < top - Y; s++) W.stair(AX1 - 1, Y + 1 + s, AZ1 - 1 - s, B.QUARTZ_STAIRS, 's');
    }
    // ground entrance
    W.clear(AX0 + 4, 40, AZ1, AX0 + 5, 42, AZ1);
    W.door(AX0 + 4, 40, AZ1, B.IRON_DOOR, 's');
    W.set(AX0 + 5, 40, AZ1, B.IRON_DOOR, 2); W.set(AX0 + 5, 41, AZ1, B.IRON_DOOR, 10);
    for (let x = AX0 + 2; x <= AX0 + 7; x++) W.stair(x, 39, AZ1 + 1, B.QUARTZ_STAIRS, 'n');
    W.set(AX0 + 3, 42, AZ1 + 1, B.SEA_LANTERN); W.set(AX0 + 6, 42, AZ1 + 1, B.SEA_LANTERN);
    // roof terrace
    const RY = ADECK[ADECK.length - 1];
    for (let x = AX0; x <= AX1; x++) { W.set(x, RY + 1, AZ0, B.QUARTZ_WALL); W.set(x, RY + 1, AZ1, B.QUARTZ_WALL); }
    for (let z = AZ0; z <= AZ1; z++) { W.set(AX0, RY + 1, z, B.QUARTZ_WALL); W.set(AX1, RY + 1, z, B.QUARTZ_WALL); }
    for (const [tx, tz] of [[AX0 + 2, AZ0 + 2], [AX0 + 6, AZ0 + 2], [AX0 + 4, AZ1 - 2]]) {
      W.set(tx, RY + 1, tz, B.QUARTZ_BLOCK); W.slab(tx, RY + 2, tz, B.SMOOTH_QUARTZ_SLAB, 't');
      W.stair(tx - 1, RY + 1, tz, B.QUARTZ_STAIRS, 'w'); W.stair(tx + 1, RY + 1, tz, B.QUARTZ_STAIRS, 'e');
      W.set(tx, RY + 3, tz, B.LANTERN);
    }
    for (let x = AX0 + 1; x <= AX1 - 1; x += 3) { W.set(x, RY + 1, AZ0 + 1, B.PODZOL); W.set(x, RY + 2, AZ0 + 1, B.FLOWERING_AZALEA); }
    W.marker('glow', AX0 + 4, RY + 3, AZ0 + 4, { r: 7, color: [0.9, 0.95, 1], power: 0.9 });

    /* ---- skybridge at y = 52 ---- */
    const BYY = 52;
    for (let x = TX1; x <= AX0; x++) {
      W.slab(x, BYY, -50, B.QUARTZ_SLAB, 'b'); W.slab(x, BYY, -49, B.QUARTZ_SLAB, 'b');
      W.set(x, BYY - 1, -50, (x % 3 === 0) ? B.SEA_LANTERN : B.SMOOTH_QUARTZ);
      W.set(x, BYY - 1, -49, (x % 3 === 0) ? B.SEA_LANTERN : B.SMOOTH_QUARTZ);
      for (const z of [-51, -48]) {
        W.set(x, BYY, z, B.SMOOTH_QUARTZ);
        W.set(x, BYY + 1, z, px([B.GLASS_PANE, B.LIGHT_BLUE_PANE, B.GLASS_PANE]));
        W.set(x, BYY + 2, z, px([B.GLASS_PANE, B.LIGHT_BLUE_PANE]));
        W.set(x, BYY + 3, z, B.SMOOTH_QUARTZ);
      }
      if (x % 4 === 0) {
        for (const z of [-51, -48]) for (let dy = 0; dy <= 3; dy++) W.logAxis(x, BYY + dy, z, B.QUARTZ_PILLAR, 'y');
        W.logAxis(x, BYY + 3, -50, B.QUARTZ_PILLAR, 'z'); W.logAxis(x, BYY + 3, -49, B.QUARTZ_PILLAR, 'z');
      } else { W.set(x, BYY + 3, -50, B.GLASS); W.set(x, BYY + 3, -49, B.GLASS); }
      // support pillar down to the plaza
      if (x === 53) for (let y = 39; y < BYY; y++) { W.set(x, y, -50, B.QUARTZ_PILLAR); W.set(x, y, -49, B.QUARTZ_PILLAR); }
    }
    W.clear(TX1, BYY + 1, -50, TX1, BYY + 2, -49);
    W.clear(AX0, BYY + 1, -50, AX0, BYY + 2, -49);
    // connect the bridge into the annex stair level
    W.clear(AX0, BYY, -50, AX0 + 1, BYY + 2, -49);
    for (let s = 0; s < 4; s++) W.stair(AX0 + 1, BYY - s, -50 + 0, B.QUARTZ_STAIRS, 'e');
  }

  /* =================================================================== */
  /* 7.  PLAZA                                                            */
  /* =================================================================== */
  function plaza() {
    for (let z = -40; z <= -23; z++)
      for (let x = 27; x <= 62; x++) {
        if (!W.isSolid(x, G, z)) continue;
        const r = W.rand();
        const pat = ((x >> 1) + (z >> 1)) & 1;
        W.set(x, G, z, r < 0.06 ? B.GRAY_CONCRETE : r < 0.12 ? B.POLISHED_DIORITE :
          pat ? B.QUARTZ_BLOCK : B.SMOOTH_QUARTZ);
        if (W.isAir(x, G + 1, z) === false && W.get(x, G + 1, z) !== 0) continue;
      }
    // inlay bands
    for (let x = 27; x <= 62; x++) { W.set(x, G, -33, B.GRAY_CONCRETE); W.set(x, G, -30, B.GRAY_CONCRETE); }
    for (let z = -40; z <= -23; z++) { W.set(35, G, z, B.GRAY_CONCRETE); W.set(50, G, z, B.GRAY_CONCRETE); }
    // fountain
    const fx = 42, fz = -31;
    W.disc(fx, G, fz, 4, B.SMOOTH_QUARTZ);
    W.disc(fx, G, fz, 3, B.WATER);
    W.ring(fx, G + 1, fz, 4, B.QUARTZ_WALL);
    W.set(fx, G, fz, B.PRISMARINE_BRICKS);
    W.set(fx, G + 1, fz, B.PRISMARINE);
    W.set(fx, G + 2, fz, B.SEA_LANTERN);
    W.set(fx, G + 3, fz, B.END_ROD);
    W.marker('splash', fx, G + 3, fz, { rate: 9 });
    W.marker('glow', fx, G + 2, fz, { r: 8, color: [0.6, 0.9, 1.0], power: 1.2 });
    for (let a = 0; a < 4; a++) {
      const ax = fx + [3, -3, 0, 0][a], az = fz + [0, 0, 3, -3][a];
      W.stair(ax, G + 1, az, B.QUARTZ_STAIRS, ['w', 'e', 'n', 's'][a]);
    }
    // hedges
    for (const [hx0, hz0, hx1, hz1] of [[28, -38, 33, -37], [28, -27, 33, -26], [52, -38, 60, -37], [52, -27, 60, -26]]) {
      for (let z = hz0; z <= hz1; z++) for (let x = hx0; x <= hx1; x++) {
        W.set(x, G + 1, z, B.QUARTZ_WALL);
        W.set(x, G + 2, z, W.chance(0.2) ? B.FLOWERING_AZALEA : B.AZALEA_LEAVES);
      }
    }
    // tree planters
    for (const [tx, tz] of [[31, -33], [31, -29], [57, -33], [57, -29], [46, -36], [38, -36]]) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) W.set(tx + dx, G + 1, tz + dz, B.QUARTZ_BLOCK);
      W.set(tx, G + 1, tz, B.PODZOL);
      for (let y = G + 2; y <= G + 5; y++) W.set(tx, y, tz, B.OAK_LOG);
      W.ellipsoid(tx, G + 7, tz, 2, 2, 2, B.OAK_LEAVES);
      W.set(tx + 1, G + 2, tz, B.LANTERN);
      W.marker('firefly', tx, G + 5, tz, { r: 4, count: 4 });
    }
    // street lights
    for (let x = 29; x <= 61; x += 6)
      for (const z of [-39, -24]) {
        for (let y = G + 1; y <= G + 4; y++) W.set(x, y, z, B.QUARTZ_WALL);
        W.set(x, G + 5, z, B.SEA_LANTERN);
        W.set(x, G + 6, z, B.QUARTZ_SLAB);
        W.marker('glow', x, G + 5, z, { r: 8, color: [0.85, 0.94, 1.0], power: 0.9 });
      }
    // benches + racks
    for (const [bx, bz, d] of [[36, -28, 'n'], [40, -28, 'n'], [48, -28, 'n'], [36, -35, 's'], [48, -35, 's']]) {
      for (let i = 0; i < 3; i++) W.stair(bx + i, G + 1, bz, B.QUARTZ_STAIRS, d);
      W.set(bx - 1, G + 1, bz, B.QUARTZ_WALL); W.set(bx + 3, G + 1, bz, B.QUARTZ_WALL);
    }
    for (let x = 54; x <= 58; x++) { W.set(x, G + 1, -24, B.IRON_BARS); W.set(x, G + 2, -24, B.IRON_BARS); }
    // notice board
    for (let dz = -1; dz <= 1; dz++) for (let dy = 1; dy <= 2; dy++) W.set(29, G + dy, -32 + dz, B.SMOOTH_QUARTZ);
    W.face(30, G + 2, -33, B.SPAWN_SIGN, 'w'); W.face(30, G + 2, -32, B.MAP_FRAME, 'w');
    W.face(30, G + 2, -31, B.TRADES_SIGN, 'w');
    W.set(29, G + 3, -32, B.LANTERN);
    // steps down to the south-west toward the main plaza
    for (let i = 0; i < 5; i++) {
      for (let x = 27; x <= 40; x++) {
        W.stair(x, G - i, -23 + 0, B.QUARTZ_STAIRS, 'n');
        W.set(x, G - i, -22, B.SMOOTH_QUARTZ);
      }
    }
    for (let x = 27; x <= 40; x++) { W.set(x, G, -23, B.QUARTZ_SLAB); W.set(x, G - 1, -22, B.SMOOTH_QUARTZ); }
  }

  /* =================================================================== */
  function build() {
    W.seed(20260724);
    shell();
    core();
    lobby();
    floors();
    roofDeck();
    annex();
    plaza();

    poi('Modern quarter', 42, 43, -24, 180, 24);
    poi('Tower lobby', 39, 43, -43, 183, -5);
    poi('Upper apartment', 39, 70, -46, 0, -6);
    poi('Rooftop deck', 36, 82, -53, 8, -14);
    poi('Skybridge', 53, 53, -49, 90, 0);

    W.marker('firefly', 34, 41, -30, { r: 6, count: 5 });
    W.marker('firefly', 58, 41, -30, { r: 6, count: 5 });
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.modern = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
