/* =====================================================================
   POOR DISTRICT  —  patched tenement tower, lava fall, laundry & chickens
   Zone: x -64..-30, z 4..42, ground y=34, max y=78
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;

  /* ---------------------------------------------------------------- */
  /* geometry constants                                                */
  /* ---------------------------------------------------------------- */
  const G = 34;                    // top solid ground block
  const LX0 = -56, LX1 = -41, LZ0 = 10, LZ1 = 23;   // lower floors 0..3
  const UX0 = -58, UX1 = -41, UZ0 = 10, UZ1 = 25;   // upper floors 4..6
  const NF = 7;                                      // storeys
  const DECK = f => 35 + 5 * f;                      // deck (floor slab) level
  const ROOF = 70;                                   // roof deck
  const foot = f => (f <= 3
    ? { x0: LX0, x1: LX1, z0: LZ0, z1: LZ1 }
    : { x0: UX0, x1: UX1, z0: UZ0, z1: UZ1 });

  /* ---------------------------------------------------------------- */
  /* palettes                                                          */
  /* ---------------------------------------------------------------- */
  let P_WALL, P_WALL2, P_DECK, P_BASE, P_CHIM, P_LAVA, P_PLAT, P_PATCH;
  function initPalettes() {
    P_WALL = [
      B.DEEPSLATE_BRICKS, B.DEEPSLATE_BRICKS, B.DEEPSLATE_BRICKS, B.DEEPSLATE_BRICKS,
      B.COBBLED_DEEPSLATE, B.COBBLED_DEEPSLATE, B.COBBLED_DEEPSLATE,
      B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE,
      B.STONE_BRICKS, B.STONE_BRICKS,
      B.ANDESITE, B.ANDESITE,
      B.MOSSY_COBBLESTONE, B.MOSSY_STONE_BRICKS, B.CRACKED_STONE_BRICKS,
      B.DEEPSLATE_TILES, B.TUFF,
    ];
    // upper floors read a touch browner / more patched
    P_WALL2 = [
      B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE,
      B.MOSSY_COBBLESTONE, B.MOSSY_COBBLESTONE,
      B.DEEPSLATE_BRICKS, B.DEEPSLATE_BRICKS, B.COBBLED_DEEPSLATE,
      B.ANDESITE, B.STONE_BRICKS, B.CRACKED_STONE_BRICKS, B.MOSSY_STONE_BRICKS,
      B.SPRUCE_PLANKS, B.OAK_PLANKS,
    ];
    P_PATCH = [B.OAK_PLANKS, B.SPRUCE_PLANKS, B.DIRT, B.COARSE_DIRT,
      B.DARK_OAK_PLANKS, B.BROWN_TERRACOTTA, B.MUD_BRICKS, B.GRAVEL];
    P_DECK = [B.OAK_PLANKS, B.OAK_PLANKS, B.OAK_PLANKS, B.SPRUCE_PLANKS,
      B.SPRUCE_PLANKS, B.DARK_OAK_PLANKS, B.STONE_BRICKS, B.COBBLESTONE];
    P_BASE = [B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.MOSSY_COBBLESTONE,
      B.COBBLED_DEEPSLATE, B.STONE, B.ANDESITE, B.CRACKED_STONE_BRICKS,
      B.MOSSY_STONE_BRICKS, B.STONE_BRICKS];
    P_CHIM = [B.COBBLESTONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE,
      B.COBBLED_DEEPSLATE, B.ANDESITE, B.CRACKED_STONE_BRICKS, B.BLACKSTONE];
    P_LAVA = [B.COBBLESTONE, B.BLACKSTONE, B.BLACKSTONE, B.MAGMA_BLOCK,
      B.NETHERRACK, B.OBSIDIAN, B.COBBLED_DEEPSLATE, B.MOSSY_COBBLESTONE];
    P_PLAT = [B.QUARTZ_BLOCK, B.QUARTZ_BLOCK, B.QUARTZ_BLOCK, B.SMOOTH_QUARTZ,
      B.SMOOTH_QUARTZ, B.QUARTZ_BRICKS, B.STONE_BRICKS, B.CHISELED_QUARTZ];
  }

  /* ---------------------------------------------------------------- */
  /* small helpers                                                     */
  /* ---------------------------------------------------------------- */
  function lo(a, b) { return a <= b ? a : b; }
  function hi(a, b) { return a <= b ? b : a; }

  function mixFill(x0, y0, z0, x1, y1, z1, pal) {
    for (let y = lo(y0, y1); y <= hi(y0, y1); y++)
      for (let z = lo(z0, z1); z <= hi(z0, z1); z++)
        for (let x = lo(x0, x1); x <= hi(x0, x1); x++) set(x, y, z, pick(pal));
  }
  function mixWalls(x0, y0, z0, x1, y1, z1, pal, patchP) {
    const ax = lo(x0, x1), bx = hi(x0, x1), az = lo(z0, z1), bz = hi(z0, z1);
    for (let y = lo(y0, y1); y <= hi(y0, y1); y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) {
          if (x !== ax && x !== bx && z !== az && z !== bz) continue;
          set(x, y, z, chance(patchP || 0) ? pick(P_PATCH) : pick(pal));
        }
  }
  function mixRect(x0, z0, x1, z1, y, pal) {
    const ax = lo(x0, x1), bx = hi(x0, x1), az = lo(z0, z1), bz = hi(z0, z1);
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++)
        if (x === ax || x === bx || z === az || z === bz) set(x, y, z, pick(pal));
  }
  const OUT = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

  /* ---------------------------------------------------------------- */
  /* recessed window with sill + lintel + shutter                      */
  /* ---------------------------------------------------------------- */
  function windowAt(wx, wy, wz, side, paneId, sillId, slabId) {
    const o = OUT[side], ox = wx + o[0], oz = wz + o[1];
    set(wx, wy, wz, 0); set(wx, wy + 1, wz, 0);
    set(wx, wy, wz, paneId); set(wx, wy + 1, wz, paneId);
    // sill: upside-down stair pushed out one block
    stair(ox, wy - 1, oz, sillId || B.COBBLE_STAIRS, OPP[side], true);
    // lintel eyebrow
    slab(ox, wy + 2, oz, slabId || B.COBBLE_SLAB, 'b');
    // occasional shutter
    if (chance(0.35)) {
      trapdoor(ox, wy + 1, oz, chance(0.5) ? B.SPRUCE_TRAPDOOR : B.DARK_OAK_TRAPDOOR,
        side, { open: true });
    }
    if (chance(0.30)) face(ox, wy, oz, B.VINE, OPP[side]);
  }

  /* ---------------------------------------------------------------- */
  /* BASEMENT  (y 29 floor .. 33 air, ceiling 34)                      */
  /* ---------------------------------------------------------------- */
  const BX0 = -55, BX1 = -42, BZ0 = 12, BZ1 = 22;
  function basement() {
    // dig + shell
    clear(BX0 - 1, 29, BZ0 - 1, BX1 + 1, 34, BZ1 + 1);
    mixFill(BX0 - 1, 29, BZ0 - 1, BX1 + 1, 29, BZ1 + 1, P_BASE);          // floor
    mixWalls(BX0 - 1, 30, BZ0 - 1, BX1 + 1, 33, BZ1 + 1, P_BASE, 0.05);   // walls
    mixFill(BX0 - 1, 34, BZ0 - 1, BX1 + 1, 34, BZ1 + 1, P_BASE);          // ceiling
    // support piers so the ceiling reads as held up
    for (let x = BX0 + 3; x <= BX1 - 2; x += 5)
      for (let z = BZ0 + 3; z <= BZ1 - 2; z += 5) {
        for (let y = 30; y <= 33; y++) set(x, y, z, chance(0.3) ? B.MOSSY_COBBLESTONE : B.COBBLED_DEEPSLATE);
        face(x, 32, z + 1, B.WALL_TORCH, 'n');
      }
    // floor dressing
    for (let z = BZ0; z <= BZ1; z++)
      for (let x = BX0; x <= BX1; x++) {
        if (!isAir(x, 30, z)) continue;
        if (chance(0.06)) set(x, 29, z, B.MOSSY_COBBLESTONE);
        else if (chance(0.05)) set(x, 29, z, B.GRAVEL);
      }
    // rows of barrels / chests along the north wall
    for (let x = BX0 + 1; x <= BX1 - 1; x++) {
      if (x === -46) continue;
      set(x, 30, BZ0, chance(0.5) ? B.BARREL : B.CHEST);
      if (chance(0.55)) set(x, 31, BZ0, chance(0.6) ? B.BARREL : B.HAY_BALE);
      if (chance(0.25)) set(x, 32, BZ0, B.BARREL);
    }
    for (let x = BX0 + 2; x <= BX1 - 3; x += 3) {
      set(x, 30, BZ1, B.CHEST); set(x + 1, 30, BZ1, B.TRAPPED_CHEST);
      if (chance(0.5)) set(x, 31, BZ1, B.BARREL);
    }
    // hoppers + minecart on rail
    set(BX1 - 2, 30, 16, B.HOPPER); set(BX1 - 2, 31, 16, B.BARREL);
    set(BX1 - 3, 30, 17, B.HOPPER);
    for (let z = 14; z <= 21; z++) set(BX1 - 1, 30, z, B.RAIL);
    set(BX1 - 1, 30, 18, B.POWERED_RAIL);
    set(BX1 - 1, 30, 17, B.MINECART);
    set(BX1 - 1, 31, 21, B.CHEST);
    // odds and ends
    set(-52, 30, 15, B.CAULDRON); set(-51, 30, 15, B.COMPOSTER);
    set(-50, 30, 20, B.BARREL); set(-50, 31, 20, B.BARREL);
    set(-49, 30, 20, B.HAY_BALE); set(-49, 31, 20, B.HAY_BALE);
    set(-53, 30, 21, B.CRAFTING_TABLE);
    set(-54, 30, 18, B.BREWING_STAND);
    set(-44, 30, 13, B.SHULKER_BOX);
    // neglected cobwebby corners: mossy + vines + lichen
    for (let i = 0; i < 26; i++) {
      const x = randRange(BX0, BX1), z = randRange(BZ0, BZ1);
      if (isAir(x, 33, z)) face(x, 33, z, B.GLOW_LICHEN, 'n');
    }
    for (let i = 0; i < 20; i++) {
      const x = randRange(BX0, BX1), z = randRange(BZ0, BZ1);
      if (isAir(x, 32, z) && isSolid(x, 32, z - 1)) face(x, 32, z, B.VINE, 'n');
    }
    // lighting
    set(-48, 33, 16, B.GLOWSTONE);
    set(-53, 30, 13, B.TORCH); set(-45, 30, 21, B.TORCH); set(-44, 30, 15, B.TORCH);
    face(BX0, 32, 16, B.WALL_TORCH, 'w'); face(BX1, 32, 19, B.WALL_TORCH, 'e');
    marker('glow', -48, 32, 16, { r: 7, color: [1, 0.85, 0.5], power: 0.9 });

    // ---- stair up to the lobby (x=-46, z 19 -> 14) -----------------
    clear(-46, 30, 13, -46, 36, 19);
    for (let i = 0; i <= 5; i++) stair(-46, 30 + i, 19 - i, B.COBBLE_STAIRS, 'n');
    // walls flanking the stair opening through the ground slab
    for (let z = 13; z <= 18; z++)
      for (let y = 34; y <= 35; y++) {
        if (isAir(-47, y, z)) set(-47, y, z, pick(P_BASE));
        if (isAir(-45, y, z)) set(-45, y, z, pick(P_BASE));
      }
    // railing round the hole in the lobby floor
    for (let z = 14; z <= 17; z++) {
      set(-47, 36, z, B.OAK_FENCE); set(-45, 36, z, B.OAK_FENCE);
    }
    set(-46, 36, 13, B.OAK_FENCE_GATE, 0);
    face(-45, 32, 18, B.WALL_TORCH, 'e');
    face(-47, 35, 16, B.WALL_TORCH, 'w');
    set(-46, 33, 19, B.LANTERN);
  }

  /* ---------------------------------------------------------------- */
  /* SHELL — decks, walls, corner posts, string courses, windows       */
  /* ---------------------------------------------------------------- */
  function shell() {
    for (let f = 0; f < NF; f++) {
      const Y = DECK(f), F = foot(f), pal = f >= 4 ? P_WALL2 : P_WALL;
      // deck
      mixFill(F.x0, Y, F.z0, F.x1, Y, F.z1, f === 0 ? P_BASE : P_DECK);
      // walls
      mixWalls(F.x0, Y + 1, F.z0, F.x1, Y + 4, F.z1, pal, f >= 4 ? 0.14 : 0.10);
      // corner timber posts
      const cor = [[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]];
      for (const c of cor)
        for (let y = Y + 1; y <= Y + 4; y++)
          logAxis(c[0], y, c[1], chance(0.25) ? B.STRIPPED_SPRUCE_LOG : B.DARK_OAK_LOG, 'y');
      // string course of slabs projecting one block out at every deck
      mixRect(F.x0 - 1, F.z0 - 1, F.x1 + 1, F.z1 + 1, Y, [B.COBBLE_SLAB]);
      for (let x = F.x0 - 1; x <= F.x1 + 1; x++) {
        slab(x, Y, F.z0 - 1, chance(0.3) ? B.MOSSY_COBBLE_SLAB : B.COBBLE_SLAB, 't');
        slab(x, Y, F.z1 + 1, chance(0.3) ? B.MOSSY_COBBLE_SLAB : B.COBBLE_SLAB, 't');
      }
      for (let z = F.z0 - 1; z <= F.z1 + 1; z++) {
        slab(F.x0 - 1, Y, z, chance(0.3) ? B.MOSSY_COBBLE_SLAB : B.COBBLE_SLAB, 't');
        slab(F.x1 + 1, Y, z, chance(0.3) ? B.MOSSY_COBBLE_SLAB : B.COBBLE_SLAB, 't');
      }
      // hollow it out
      clear(F.x0 + 1, Y + 1, F.z0 + 1, F.x1 - 1, Y + 4, F.z1 - 1);
    }
    // top: roof deck
    mixFill(UX0, ROOF, UZ0, UX1, ROOF, UZ1, [B.COBBLESTONE, B.COBBLESTONE,
      B.MOSSY_COBBLESTONE, B.COBBLED_DEEPSLATE, B.ANDESITE, B.SPRUCE_PLANKS,
      B.STONE_BRICKS, B.CRACKED_STONE_BRICKS]);

    /* ---- overhang braces under the upper block -------------------- */
    // west overhang: x -58..-57 juts past x -56 ; south: z 24..25 past z 23
    for (let z = UZ0; z <= LZ1; z++) {
      logAxis(-57, 54, z, B.DARK_OAK_LOG, 'x');
      logAxis(-58, 54, z, B.DARK_OAK_LOG, 'x');
      if (z % 3 === 1) {
        stair(-57, 53, z, B.DARK_OAK_STAIRS, 'e', true);
        set(-58, 53, z, B.SPRUCE_FENCE);
        set(-58, 52, z, B.SPRUCE_FENCE);
      }
    }
    for (let x = LX0; x <= UX1; x++) {
      logAxis(x, 54, 24, B.DARK_OAK_LOG, 'z');
      logAxis(x, 54, 25, B.DARK_OAK_LOG, 'z');
      if (x % 3 === 0) {
        stair(x, 53, 24, B.DARK_OAK_STAIRS, 'n', true);
        set(x, 53, 25, B.SPRUCE_FENCE);
        set(x, 52, 25, B.SPRUCE_FENCE);
      }
    }
    // west+south corner of the overhang
    for (let x = UX0; x <= LX0 - 1; x++)
      for (let z = LZ1 + 1; z <= UZ1; z++) {
        logAxis(x, 54, z, B.DARK_OAK_LOG, 'x');
      }
    set(-58, 53, 25, B.SPRUCE_FENCE); set(-58, 52, 25, B.SPRUCE_FENCE);
    set(-57, 53, 24, B.SPRUCE_FENCE);

    /* ---- windows --------------------------------------------------- */
    const panes = [B.GLASS_PANE, B.GLASS_PANE, B.GLASS_PANE, B.PURPLE_PANE,
      B.YELLOW_PANE, B.LIGHT_BLUE_PANE, B.RED_PANE, B.GLASS_PANE, B.IRON_BARS];
    const sills = [B.COBBLE_STAIRS, B.MOSSY_COBBLE_STAIRS, B.STONE_BRICK_STAIRS,
      B.DEEPSLATE_BRICK_STAIRS, B.SPRUCE_STAIRS];
    const lint = [B.COBBLE_SLAB, B.STONE_BRICK_SLAB, B.DEEPSLATE_BRICK_SLAB,
      B.SPRUCE_SLAB, B.MOSSY_COBBLE_SLAB];
    for (let f = 0; f < NF; f++) {
      const Y = DECK(f), F = foot(f), wy = Y + 2;
      const nx = [-54, -51, -48, -45, -43];
      for (const x of nx) {
        if (x < F.x0 + 1 || x > F.x1 - 1) continue;
        windowAt(x, wy, F.z0, 'n', pick(panes), pick(sills), pick(lint));
      }
      const sx = (f === 0) ? [-54, -52, -45, -43] : [-54, -52, -46, -44, -43];
      for (const x of sx) {
        if (x < F.x0 + 1 || x > F.x1 - 1) continue;
        windowAt(x, wy, F.z1, 's', pick(panes), pick(sills), pick(lint));
      }
      for (const z of [19, 21]) windowAt(F.x1, wy, z, 'e', pick(panes), pick(sills), pick(lint));
      for (const z of [12, 14, 21]) windowAt(F.x0, wy, z, 'w', pick(panes), pick(sills), pick(lint));
      if (f >= 4) windowAt(F.x0, wy, 24, 'w', pick(panes), pick(sills), pick(lint));
    }

    /* ---- front door + porch (south face, f=0) ---------------------- */
    clear(-49, 36, LZ1, -48, 38, LZ1);
    door(-49, 36, LZ1, B.OAK_DOOR, 's');
    door(-48, 36, LZ1, B.OAK_DOOR, 's');
    stair(-49, 39, LZ1, B.DARK_OAK_STAIRS, 'n', true);
    stair(-48, 39, LZ1, B.DARK_OAK_STAIRS, 'n', true);
    // porch canopy
    for (let x = -51; x <= -46; x++) {
      slab(x, 39, LZ1 + 1, B.DARK_OAK_SLAB, 't');
      stair(x, 39, LZ1 + 2, B.DARK_OAK_STAIRS, 'n');
      if (x === -51 || x === -46) {
        for (let y = 35; y <= 38; y++) set(x, y, LZ1 + 2, B.OAK_FENCE);
        set(x, 39, LZ1 + 2, B.DARK_OAK_LOG);
      }
    }
    set(-50, 38, LZ1 + 2, B.HANGING_LANTERN);
    set(-47, 38, LZ1 + 2, B.HANGING_LANTERN);
    face(-50, 37, LZ1, B.WALL_TORCH, 's');
    face(-47, 37, LZ1, B.WALL_TORCH, 's');
    face(-50, 38, LZ1, B.SPAWN_SIGN, 's');
    face(-47, 38, LZ1, B.SHOP_SIGN, 's');
    // steps down to the ground
    for (let x = -51; x <= -46; x++) stair(x, 35, LZ1 + 3, B.COBBLE_STAIRS, 'n');
  }

  /* ---------------------------------------------------------------- */
  /* STAIRWELL  (switchback in the hall x -55..-51)                    */
  /* ---------------------------------------------------------------- */
  function stairwell() {
    for (let f = 0; f < NF; f++) {
      const Y = DECK(f), nextY = Y + 5;
      const east = (f % 2 === 0), z = east ? 20 : 21;
      for (let i = 0; i <= 4; i++) {
        const x = east ? (-55 + i) : (-51 - i);
        const y = Y + 1 + i;
        if (y === nextY) {
          // top step sits in the next deck
          stair(x, y, z, B.OAK_STAIRS, east ? 'w' : 'e');
        } else {
          stair(x, y, z, B.OAK_STAIRS, east ? 'w' : 'e');
        }
      }
      // headroom holes through the next deck
      const h1 = east ? -53 : -53, h2 = east ? -52 : -54;
      set(h1, nextY, z, 0); set(h2, nextY, z, 0);
      // stringer / balustrade
      for (let i = 0; i <= 4; i++) {
        const x = east ? (-55 + i) : (-51 - i);
        const y = Y + 1 + i;
        const rz = east ? z + 1 : z - 1;
        if (isAir(x, y, rz)) set(x, y, rz, B.OAK_FENCE);
      }
      // landing light
      set(east ? -51 : -55, Y + 4, east ? 18 : 22, B.HANGING_LANTERN);
      face(-56 + (f >= 4 ? -2 : 0) + 1, Y + 3, 19, B.WALL_TORCH, 'w');
    }
    // roof hatch out of the loft stair (f=6 ends on the roof deck)
    clear(-52, 66, 20, -51, 70, 20);
    clear(-53, 70, 20, -51, 70, 20);
    trapdoor(-52, 70, 20, B.OAK_TRAPDOOR, 'n', { open: true, top: true });
  }

  /* ---------------------------------------------------------------- */
  /* LADDER SHAFT (east wall, x=-42 z=18)                              */
  /* ---------------------------------------------------------------- */
  function ladderShaft() {
    for (let y = 36; y <= ROOF; y++) {
      set(-42, y, 18, 0);
      face(-42, y, 18, B.LADDER, 'e');
    }
    set(-42, ROOF, 18, 0);
    face(-42, ROOF, 18, B.LADDER, 'e');
    // rails round the shaft mouth at each deck so it is not a bare hole
    for (let f = 1; f < NF; f++) {
      const Y = DECK(f);
      set(-42, Y, 18, 0);
      if (isAir(-42, Y + 1, 17)) set(-42, Y + 1, 17, B.OAK_FENCE);
      if (isAir(-42, Y + 1, 19)) set(-42, Y + 1, 19, B.OAK_FENCE);
      set(-43, Y + 4, 18, B.HANGING_LANTERN);
    }
    set(-42, ROOF, 18, 0);
  }

  /* ---------------------------------------------------------------- */
  /* CHIMNEY BREAST — north face, ground to stack                      */
  /* ---------------------------------------------------------------- */
  function chimney() {
    const cx0 = -52, cx1 = -50, cz = 9;
    // breast: 3 wide, 2 deep, hugging the north wall
    mixFill(cx0, 35, cz - 1, cx1, ROOF + 2, cz, P_CHIM);
    // flue
    clear(cx0 + 1, 40, cz - 1, cx0 + 1, ROOF + 3, cz - 1);
    // stack cap
    mixFill(cx0 - 1, ROOF + 3, cz - 2, cx1 + 1, ROOF + 3, cz + 1, P_CHIM);
    clear(cx0 + 1, ROOF + 3, cz - 1, cx0 + 1, ROOF + 3, cz - 1);
    mixFill(cx0 - 1, ROOF + 4, cz - 2, cx1 + 1, ROOF + 4, cz + 1, [B.COBBLE_SLAB]);
    for (let x = cx0 - 1; x <= cx1 + 1; x++)
      for (let z = cz - 2; z <= cz + 1; z++) slab(x, ROOF + 4, z, B.COBBLE_SLAB, 'b');
    clear(cx0 + 1, ROOF + 4, cz - 1, cx0 + 1, ROOF + 4, cz - 1);
    // banding + texture
    for (let y = 38; y <= ROOF + 2; y += 6) {
      for (let x = cx0 - 1; x <= cx1 + 1; x++) slab(x, y, cz - 2, B.COBBLE_SLAB, 't');
      for (let x = cx0; x <= cx1; x++) {
        if (isAir(x, y, cz - 2)) slab(x, y, cz - 2, B.MOSSY_COBBLE_SLAB, 't');
      }
    }
    for (let y = 36; y <= ROOF; y++) {
      if (chance(0.22)) face(cx0 - 1, y, cz - 1, B.VINE, 'w');
      if (chance(0.22)) face(cx1 + 1, y, cz - 1, B.VINE, 'e');
      if (chance(0.10)) face(randRange(cx0, cx1), y, cz - 2, B.VINE, 'n');
    }
    marker('smoke', cx0 + 1, ROOF + 5, cz - 1, { rate: 26, rise: 0.9, spread: 0.35, size: 1.5 });
    marker('smoke', cx0 + 1, ROOF + 8, cz - 1, { rate: 10, rise: 1.2, spread: 0.8, size: 2.2 });
  }

  /* ---------------------------------------------------------------- */
  /* ROOF                                                              */
  /* ---------------------------------------------------------------- */
  function roof() {
    // parapet
    for (let x = UX0; x <= UX1; x++) {
      set(x, ROOF + 1, UZ0, chance(0.3) ? B.MOSSY_COBBLE_WALL : B.COBBLE_WALL);
      set(x, ROOF + 1, UZ1, chance(0.3) ? B.MOSSY_COBBLE_WALL : B.COBBLE_WALL);
      if (chance(0.3)) set(x, ROOF + 2, UZ0, B.COBBLE_WALL);
      if (chance(0.3)) set(x, ROOF + 2, UZ1, B.COBBLE_WALL);
    }
    for (let z = UZ0; z <= UZ1; z++) {
      set(UX0, ROOF + 1, z, chance(0.3) ? B.MOSSY_COBBLE_WALL : B.COBBLE_WALL);
      set(UX1, ROOF + 1, z, chance(0.3) ? B.MOSSY_COBBLE_WALL : B.COBBLE_WALL);
      if (chance(0.3)) set(UX0, ROOF + 2, z, B.COBBLE_WALL);
      if (chance(0.3)) set(UX1, ROOF + 2, z, B.COBBLE_WALL);
    }
    // roof clutter: water butts, laundry lines, aerials, a shed
    mixFill(-50, ROOF + 1, 20, -46, ROOF + 4, 23, [B.SPRUCE_PLANKS, B.SPRUCE_PLANKS,
      B.OAK_PLANKS, B.COBBLESTONE, B.MOSSY_COBBLESTONE]);
    clear(-49, ROOF + 1, 21, -47, ROOF + 3, 22);
    door(-48, ROOF + 1, 20, B.SPRUCE_DOOR, 'n');
    for (let x = -51; x <= -45; x++) stair(x, ROOF + 5, 21, B.SPRUCE_STAIRS, 'n');
    for (let x = -51; x <= -45; x++) stair(x, ROOF + 5, 22, B.SPRUCE_STAIRS, 's');
    set(-49, ROOF + 2, 21, B.BARREL); set(-47, ROOF + 2, 21, B.CHEST);
    set(-48, ROOF + 3, 21, B.LANTERN);
    face(-49, ROOF + 2, 20, B.WALL_TORCH, 'n');
    // water butts & junk
    set(-55, ROOF + 1, 13, B.CAULDRON); set(-54, ROOF + 1, 13, B.BARREL);
    set(-54, ROOF + 2, 13, B.BARREL); set(-56, ROOF + 1, 14, B.COMPOSTER);
    set(-44, ROOF + 1, 13, B.HAY_BALE); set(-44, ROOF + 2, 13, B.HAY_BALE);
    set(-45, ROOF + 1, 13, B.HAY_BALE);
    set(-43, ROOF + 1, 22, B.BARREL); set(-43, ROOF + 2, 22, B.CHEST);
    // laundry line across the roof
    for (let y = ROOF + 1; y <= ROOF + 4; y++) { set(-56, y, 18, B.OAK_FENCE); set(-44, y, 18, B.OAK_FENCE); }
    const laun = [B.RED_CARPET, B.WHITE_CARPET, B.BLUE_CARPET, B.YELLOW_CARPET,
      B.GREEN_CARPET, B.ORANGE_CARPET, B.CYAN_CARPET, B.PINK_CARPET, B.PURPLE_CARPET];
    for (let x = -56; x <= -44; x++) {
      set(x, ROOF + 5, 18, B.OAK_FENCE);
      if (chance(0.55)) set(x, ROOF + 6, 18, pick(laun));
    }
    // campfire brazier on the roof
    set(-53, ROOF + 1, 24, B.COBBLESTONE); set(-52, ROOF + 1, 24, B.COBBLESTONE);
    set(-53, ROOF + 2, 24, B.CAMPFIRE);
    marker('smoke', -53, ROOF + 3, 24, { rate: 16, rise: 0.7, spread: 0.3, size: 1.1 });
    marker('glow', -53, ROOF + 3, 24, { r: 7, color: [1, 0.6, 0.2], power: 1.1 });
    // scattered lights
    for (const p of [[-57, 12], [-57, 24], [-42, 11], [-42, 24], [-49, 11], [-46, 16]]) {
      set(p[0], ROOF + 1, p[1], B.LANTERN);
      marker('spark', p[0], ROOF + 2, p[1], { rate: 5 });
    }
    // aerial / pole
    for (let y = ROOF + 1; y <= ROOF + 7; y++) set(-45, y, 16, B.OAK_FENCE);
    set(-45, ROOF + 8, 16, B.REDSTONE_TORCH);
    face(-46, ROOF + 5, 16, B.WHITE_BANNER, 'w');
    // moss & puddles
    for (let i = 0; i < 60; i++) {
      const x = randRange(UX0 + 1, UX1 - 1), z = randRange(UZ0 + 1, UZ1 - 1);
      if (isAir(x, ROOF + 1, z) && isSolid(x, ROOF, z)) {
        if (chance(0.35)) set(x, ROOF + 1, z, B.MOSS_CARPET);
        else if (chance(0.2)) set(x, ROOF, z, B.MOSS_BLOCK);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* interior furnishing helpers                                       */
  /* ---------------------------------------------------------------- */
  const CARPETS = [B.RED_CARPET, B.BLUE_CARPET, B.GREEN_CARPET, B.YELLOW_CARPET,
    B.PURPLE_CARPET, B.ORANGE_CARPET, B.BROWN_CARPET, B.GRAY_CARPET,
    B.CYAN_CARPET, B.PINK_CARPET, B.LIGHT_BLUE_CARPET];
  const BEDS = [B.RED_BED, B.WHITE_BED, B.BLUE_BED, B.GREEN_BED, B.YELLOW_BED, B.PURPLE_BED];
  const ART = [B.PAINTING_A, B.PAINTING_B, B.PAINTING_C, B.ITEM_FRAME, B.MAP_FRAME];

  function table(x, y, z, w, d, legId, topId) {
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < d; dz++) {
        set(x + dx, y, z + dz, legId || B.OAK_FENCE);
        slab(x + dx, y + 1, z + dz, topId || B.OAK_SLAB, 't');
      }
  }
  function stool(x, y, z) { set(x, y, z, B.OAK_FENCE); slab(x, y + 1, z, B.SPRUCE_SLAB, 'b'); }
  function rug(x0, z0, x1, z1, y, c) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (isAir(x, y, z)) set(x, y, z, c);
  }
  function partition(x0, y, z0, x1, z1, mat, doorX, doorZ) {
    for (let z = lo(z0, z1); z <= hi(z0, z1); z++)
      for (let x = lo(x0, x1); x <= hi(x0, x1); x++)
        for (let dy = 1; dy <= 4; dy++) set(x, y + dy, z, chance(0.16) ? pick(P_PATCH) : mat);
    if (doorX !== undefined) { clear(doorX, y + 1, doorZ, doorX, y + 3, doorZ); }
  }
  function ceilingLamp(x, y, z) {
    if (!isAir(x, y, z)) return;
    set(x, y, z, chance(0.4) ? B.HANGING_LANTERN : B.LANTERN);
  }

  /* one small dwelling: bed, storage, cooking, art, plant, light ------ */
  function apartment(x0, z0, x1, z1, Y, idx) {
    const y = Y + 1;
    rug(x0, z0, x1, z1, y, 0);
    // floor covering
    const c = CARPETS[idx % CARPETS.length];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++)
      if (chance(0.42) && isAir(x, y, z)) set(x, y, z, c);
    // bed against a wall
    bed(x0, y, z0 + 1, BEDS[idx % BEDS.length], 's');
    set(x0, y, z0, B.OAK_TRAPDOOR);
    // storage stack
    set(x1, y, z1, chance(0.5) ? B.CHEST : B.BARREL);
    if (chance(0.55)) set(x1, y + 1, z1, B.BARREL);
    set(x1 - 1, y, z1, chance(0.4) ? B.TRAPPED_CHEST : B.BARREL);
    // cooking corner
    set(x1, y, z0, B.FURNACE, 2);
    if (chance(0.5)) set(x1 - 1, y, z0, pick([B.SMOKER, B.CRAFTING_TABLE, B.CAULDRON, B.COMPOSTER]));
    // table + stools
    const tx = Math.floor((x0 + x1) / 2), tz = Math.floor((z0 + z1) / 2);
    table(tx, y, tz, 1 + (chance(0.5) ? 1 : 0), 1, B.OAK_FENCE, pick([B.OAK_SLAB, B.SPRUCE_SLAB, B.DARK_OAK_SLAB]));
    stool(tx - 1, y, tz);
    if (chance(0.6)) stool(tx + 1, y, tz + 1);
    // shelf
    if (chance(0.6)) { set(x0, y + 2, z1, B.BOOKSHELF); set(x0, y + 3, z1, chance(0.5) ? B.BOOKSHELF : B.FLOWER_POT); }
    // wall art + frames
    face(tx, y + 2, z0 - 1 >= z0 ? z0 : z0, pick(ART), 's');
    if (chance(0.7)) face(x0 - 0, y + 2, tz, pick(ART), 'e');
    // greenery
    if (chance(0.8)) { set(x0 + 1, y, z1, B.FLOWER_POT); set(x0 + 1, y + 1, z1, pick([B.POPPY, B.DANDELION, B.RED_TULIP, B.ALLIUM, B.CORNFLOWER, B.FERN])); }
    // armour stand / clutter
    if (chance(0.45)) set(x1, y, tz, B.ARMOR_STAND);
    if (chance(0.35)) set(x0, y, tz, B.CAULDRON);
    // light
    ceilingLamp(tx, Y + 4, tz);
    face(tx + 1, y + 2, z1, B.WALL_TORCH, 'n');
    marker('spark', tx, Y + 4, tz, { rate: 1.2 });
  }

  /* ---------------------------------------------------------------- */
  /* FLOOR 0 — communal lobby                                          */
  /* ---------------------------------------------------------------- */
  function lobby() {
    const Y = DECK(0), y = Y + 1;
    // hearth wall on the west
    for (let z = 13; z <= 16; z++) for (let dy = 1; dy <= 4; dy++)
      set(-55, Y + dy, z, pick(P_CHIM));
    clear(-55, y, 14, -55, y + 1, 15);
    set(-55, y, 14, B.CAMPFIRE); set(-55, y, 15, B.CAMPFIRE);
    stair(-54, y, 14, B.COBBLE_STAIRS, 'w'); stair(-54, y, 15, B.COBBLE_STAIRS, 'w');
    marker('smoke', -55, y + 2, 14, { rate: 9, rise: 0.8, spread: 0.35 });
    marker('glow', -55, y + 1, 15, { r: 8, color: [1, 0.62, 0.22], power: 1.25 });
    // kitchen row along the north wall
    let kx = -53;
    for (const m of [B.FURNACE, B.FURNACE, B.SMOKER, B.BLAST_FURNACE, B.CRAFTING_TABLE, B.CAULDRON]) {
      set(kx, y, 11, m, 2);
      face(kx, y + 2, 11, B.WALL_TORCH, 's');
      slab(kx, y + 1, 11, B.STONE_BRICK_SLAB, 'b');
      kx += 2;
    }
    set(-42, y, 11, B.ANVIL); set(-43, y, 11, B.SMITHING_TABLE);
    // long communal tables
    table(-52, y, 14, 6, 1, B.OAK_FENCE, B.OAK_SLAB);
    for (let x = -52; x <= -47; x++) { stool(x, y, 13); stool(x, y, 16); }
    table(-52, y, 18, 6, 1, B.SPRUCE_FENCE, B.SPRUCE_SLAB);
    for (let x = -52; x <= -47; x++) if (chance(0.7)) stool(x, y, 17);
    rug(-53, 13, -46, 19, y, 0);
    for (let z = 13; z <= 19; z++) for (let x = -53; x <= -46; x++)
      if (chance(0.3) && isAir(x, y, z)) set(x, y, z, pick([B.RED_CARPET, B.BROWN_CARPET, B.ORANGE_CARPET]));
    table(-52, y, 14, 6, 1, B.OAK_FENCE, B.OAK_SLAB);
    // library corner (south-east)
    for (let z = 19; z <= 22; z++) { set(-42, y, z, B.BOOKSHELF); set(-42, y + 1, z, chance(0.75) ? B.BOOKSHELF : B.CHISELED_BOOKSHELF); set(-42, y + 2, z, chance(0.5) ? B.BOOKSHELF : 0); }
    for (let x = -46; x <= -43; x++) { set(x, y, 22, B.BOOKSHELF); set(x, y + 1, 22, chance(0.7) ? B.BOOKSHELF : B.CHISELED_BOOKSHELF); }
    set(-44, y, 20, B.LECTERN, 2); set(-45, y, 20, B.LECTERN, 0);
    stair(-45, y, 21, B.OAK_STAIRS, 'n'); stair(-44, y, 21, B.OAK_STAIRS, 'n');
    rug(-46, 19, -43, 21, y, B.RED_CARPET);
    ceilingLamp(-44, Y + 4, 20);
    // bulletin board
    for (let z = 12; z <= 14; z++) for (let dy = 2; dy <= 3; dy++) set(-42, Y + dy, z, B.OAK_PLANKS);
    face(-43, Y + 3, 12, B.SHOP_SIGN, 'w'); face(-43, Y + 3, 13, B.TRADES_SIGN, 'w');
    face(-43, Y + 3, 14, B.FOOD_SIGN, 'w'); face(-43, Y + 2, 13, B.ITEM_FRAME, 'w');
    face(-43, Y + 2, 12, B.MAP_FRAME, 'w'); face(-43, Y + 2, 14, B.ITEM_FRAME, 'w');
    set(-43, y, 13, B.LANTERN);
    // lights + clutter
    for (const p of [[-52, 12], [-47, 12], [-52, 21], [-49, 17], [-44, 16]]) ceilingLamp(p[0], Y + 4, p[1]);
    set(-53, y, 21, B.JUKEBOX); set(-52, y, 21, B.NOTE_BLOCK);
    set(-54, y, 12, B.BARREL); set(-54, y + 1, 12, B.BARREL);
    set(-53, y, 12, B.CHEST);
    set(-46, y, 12, B.FLOWER_POT); set(-46, y + 1, 12, B.FLOWERING_AZALEA);
    set(-50, y, 22, B.CAT_STATUE);
    marker('firefly', -49, y + 2, 17, { r: 3, count: 3 });
  }

  /* ---------------------------------------------------------------- */
  /* FLOORS 1..5 — apartments                                          */
  /* ---------------------------------------------------------------- */
  function apartments() {
    for (let f = 1; f <= 5; f++) {
      const Y = DECK(f), F = foot(f);
      const ix0 = F.x0 + 1, ix1 = F.x1 - 1, iz0 = F.z0 + 1, iz1 = F.z1 - 1;
      // corridor along z=18 (leaves the stairwell at z 20..21 reachable)
      const mat = pick([B.COBBLESTONE, B.STONE_BRICKS, B.SPRUCE_PLANKS, B.DEEPSLATE_BRICKS]);
      // hall carpet
      for (let x = ix0; x <= ix1; x++) if (chance(0.8)) set(x, Y + 1, 19, pick([B.RED_CARPET, B.BROWN_CARPET, B.GRAY_CARPET]));
      // two or three flats north of the corridor
      const splitA = -50, splitB = f % 2 ? -45 : -46;
      partition(splitA, Y, iz0, splitA, 17, mat, splitA, 16);
      if (f % 2 === 0) partition(splitB, Y, iz0, splitB, 17, mat, splitB, 15);
      // dividing wall between flats and the corridor
      for (let x = ix0; x <= ix1; x++) {
        if (x === -49 || x === -44) continue;                 // doorways
        for (let dy = 1; dy <= 4; dy++) set(x, Y + dy, 18, chance(0.14) ? pick(P_PATCH) : mat);
      }
      clear(-49, Y + 1, 18, -49, Y + 2, 18);
      clear(-44, Y + 1, 18, -44, Y + 2, 18);
      door(-49, Y + 1, 18, B.SPRUCE_DOOR, 's');
      door(-44, Y + 1, 18, B.OAK_DOOR, 's');
      face(-49, Y + 3, 19, B.WALL_TORCH, 'n');
      face(-44, Y + 3, 19, B.WALL_TORCH, 'n');

      apartment(ix0, iz0, splitA - 1, 17, Y, f * 3);
      if (f % 2 === 0) {
        apartment(splitA + 1, iz0, splitB - 1, 17, Y, f * 3 + 1);
        apartment(splitB + 1, iz0, ix1, 17, Y, f * 3 + 2);
      } else {
        apartment(splitA + 1, iz0, ix1, 17, Y, f * 3 + 1);
      }
      // a flat south of the corridor (east half; stairwell owns the west)
      apartment(-48, 20, ix1, iz1, Y, f * 3 + 5);
      // corridor light
      ceilingLamp(-47, Y + 4, 19);
      ceilingLamp(-53, Y + 4, 19);
      // an occasional exposed redstone run
      if (f === 2 || f === 4) {
        for (let x = -54; x <= -46; x++) set(x, Y + 4, 19, B.REDSTONE_WIRE);
        set(-55, Y + 4, 19, B.REDSTONE_TORCH);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* FLOOR 6 — storage loft                                            */
  /* ---------------------------------------------------------------- */
  function loft() {
    const Y = DECK(6), y = Y + 1, F = foot(6);
    for (let i = 0; i < 46; i++) {
      const x = randRange(F.x0 + 1, F.x1 - 1), z = randRange(F.z0 + 1, F.z1 - 1);
      if (!isAir(x, y, z)) continue;
      if (x >= -55 && x <= -51 && z >= 19 && z <= 22) continue;   // keep the stair clear
      const h = randRange(1, 3);
      for (let k = 0; k < h; k++)
        set(x, y + k, z, pick([B.HAY_BALE, B.HAY_BALE, B.BARREL, B.CHEST, B.SHULKER_BOX, B.OAK_PLANKS]));
    }
    for (let z = F.z0 + 2; z <= F.z1 - 2; z += 4) set(F.x1 - 1, y, z, B.SCAFFOLDING);
    for (const p of [[-54, 12], [-48, 13], [-44, 20], [-50, 23]]) ceilingLamp(p[0], Y + 4, p[1]);
    set(-46, y, 12, B.CRAFTING_TABLE); set(-45, y, 12, B.CHEST);
    set(-52, y, 24, B.COMPOSTER); set(-51, y, 24, B.CAULDRON);
    face(-43, y + 2, 12, B.ITEM_FRAME, 'w');
    // ladder up through the roof
    clear(-46, Y + 1, 16, -46, ROOF, 16);
    for (let yy = Y + 1; yy <= ROOF; yy++) face(-46, yy, 16, B.LADDER, 'e');
    set(-46, ROOF, 16, 0);
  }

  /* ---------------------------------------------------------------- */
  /* LAVA FALL — east flank                                            */
  /* ---------------------------------------------------------------- */
  function lavaFall() {
    const XW = -40;                       // channel face, one east of the wall
    const TOP = 64, BOT = 37;
    // channel cheeks
    // Cheeks only — the channel mouth stays open toward the east so the
    // fall is visible from the plaza. The tower wall at x=-41 backs it.
    for (let y = BOT - 2; y <= TOP + 3; y++) {
      for (const z of [14, 18]) {
        mixFill(XW, y, z, XW + 1, y, z, P_LAVA);
        if (y % 6 === 0) mixFill(XW + 2, y, z, XW + 2, y, z, P_LAVA);
      }
      if (y % 6 === 0) { mixFill(XW + 1, y, 13, XW + 1, y, 14, P_LAVA); mixFill(XW + 1, y, 18, XW + 1, y, 19, P_LAVA); }
    }
    // header basin at the top (kept clear of the tower wall at x = -41)
    mixFill(XW, TOP + 1, 13, XW + 3, TOP + 3, 19, P_LAVA);
    clear(XW, TOP + 2, 15, XW + 2, TOP + 3, 17);
    fill(XW, TOP + 2, 15, XW + 2, TOP + 2, 17, B.LAVA);
    for (let z = 14; z <= 18; z++) set(XW + 3, TOP + 3, z, B.NETHER_BRICK_FENCE);
    // the fall itself
    for (let y = BOT; y <= TOP + 1; y++) {
      for (let z = 15; z <= 17; z++) set(XW, y, z, B.LAVA);
      if (y % 7 === 2) { set(XW - 1, y, 15, B.MAGMA_BLOCK); set(XW - 1, y, 17, B.MAGMA_BLOCK); }
    }
    // catch pool — sits east of the tower wall so the lobby is never breached
    mixFill(XW, 34, 12, XW + 6, 35, 20, P_LAVA);
    clear(XW, 36, 13, XW + 5, 39, 19);
    clear(XW, 35, 13, XW + 5, 35, 19);
    fill(XW, 35, 13, XW + 5, 35, 19, B.LAVA);
    for (let z = 12; z <= 20; z++) set(XW + 6, 36, z, B.COBBLE_WALL);
    for (let x = XW; x <= XW + 6; x++) { set(x, 36, 12, B.COBBLE_WALL); set(x, 36, 20, B.COBBLE_WALL); }
    clear(XW, 36, 15, XW, 36, 17);
    // obsidian rim + soul lanterns
    for (const p of [[XW, 12], [XW + 6, 12], [XW, 20], [XW + 6, 20]]) {
      set(p[0], 36, p[1], B.BLACKSTONE); set(p[0], 37, p[1], B.SOUL_LANTERN);
    }
    // drips & glow
    for (const y of [62, 55, 48, 41]) marker('lavaDrip', XW - 1, y, 16, { rate: 11, fall: 1.2 });
    marker('smoke', XW, 37, 16, { rate: 12, rise: 1.15, spread: 1.5, size: 1.4 });
    marker('glow', XW, 36, 16, { r: 11, color: [1, 0.45, 0.1], power: 1.6 });
    marker('glow', XW, TOP + 2, 16, { r: 8, color: [1, 0.5, 0.12], power: 1.2 });
    marker('lavaDrip', XW, 36, 16, { rate: 6, fall: 0.2 });
  }

  /* ---------------------------------------------------------------- */
  /* BALCONIES                                                         */
  /* ---------------------------------------------------------------- */
  function balcony(x0, x1, y, z, side, idx) {
    const dz = side === 's' ? 1 : -1;
    for (let x = x0; x <= x1; x++) {
      slab(x, y, z + dz, chance(0.3) ? B.SPRUCE_SLAB : B.OAK_SLAB, 't');
      slab(x, y, z + dz * 2, chance(0.35) ? B.DARK_OAK_SLAB : B.OAK_SLAB, 't');
      stair(x, y, z + dz * 3, B.OAK_STAIRS, side === 's' ? 'n' : 's', true);
      set(x, y + 1, z + dz * 3, chance(0.2) ? B.DARK_OAK_FENCE : B.OAK_FENCE);
      if (chance(0.42)) set(x, y + 2, z + dz * 3, pick(CARPETS));    // laundry over the rail
      if ((x - x0) % 3 === 0) set(x, y - 1, z + dz * 2, B.HANGING_LANTERN);
    }
    set(x0, y + 1, z + dz, B.OAK_FENCE); set(x1, y + 1, z + dz, B.OAK_FENCE);
    set(x0, y + 1, z + dz * 2, B.OAK_FENCE); set(x1, y + 1, z + dz * 2, B.OAK_FENCE);
    // clutter
    set(x0 + 1, y + 1, z + dz, B.FLOWER_POT);
    set(x0 + 1, y + 2, z + dz, pick([B.RED_TULIP, B.ORANGE_TULIP, B.POPPY, B.FERN, B.PINK_TULIP]));
    set(x1 - 1, y + 1, z + dz, chance(0.5) ? B.CHEST : B.BARREL);
    if (chance(0.5)) set(x1 - 1, y + 2, z + dz, B.BARREL);
    if (idx % 3 === 0) { set(x0 + 2, y + 1, z + dz * 2, B.CAMPFIRE); marker('smoke', x0 + 2, y + 2, z + dz * 2, { rate: 5, rise: 0.9 }); }
    if (idx % 2 === 1) { set(x1 - 2, y + 1, z + dz * 2, B.COMPOSTER); }
    // doorway out of the flat
    const mid = Math.floor((x0 + x1) / 2);
    clear(mid, y + 1, z, mid, y + 2, z);
    door(mid, y + 1, z, B.SPRUCE_DOOR, side);
    face(mid + 1, y + 2, z, B.WALL_TORCH, side);
  }

  function balconies() {
    balcony(-53, -48, DECK(1), 23, 's', 0);
    balcony(-47, -43, DECK(2), 23, 's', 1);
    balcony(-53, -49, DECK(3), 23, 's', 2);
    balcony(-55, -50, DECK(4), 25, 's', 3);
    balcony(-50, -45, DECK(5), 25, 's', 4);
    // north-facing pair
    balcony(-52, -48, DECK(2), 10, 'n', 5);
    balcony(-46, -42, DECK(4), 10, 'n', 6);
  }

  /* ---------------------------------------------------------------- */
  /* FLOATING PLATFORMS                                                */
  /* ---------------------------------------------------------------- */
  function platform(cx, cy, cz, r, kind) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        set(cx + dx, cy, cz + dz, pick(P_PLAT));
        if (Math.abs(dx) + Math.abs(dz) === r + 1 || Math.abs(dx) === r || Math.abs(dz) === r)
          slab(cx + dx, cy + 1, cz + dz, B.QUARTZ_SLAB, 'b');
      }
    for (let dz = -r + 1; dz <= r - 1; dz++)
      for (let dx = -r + 1; dx <= r - 1; dx++)
        if (Math.abs(dx) + Math.abs(dz) <= r - 1) set(cx + dx, cy - 1, cz + dz, chance(0.5) ? B.STONE_BRICKS : B.QUARTZ_BLOCK);
    // chains anchoring it upward
    for (const p of [[cx - r + 1, cz - r + 1], [cx + r - 1, cz + r - 1], [cx - r + 1, cz + r - 1]])
      for (let y = cy + 1; y <= cy + 9; y++) set(p[0], y, p[1], B.CHAIN);
    if (kind === 'garden') {
      for (let dz = -r + 1; dz <= r - 1; dz++)
        for (let dx = -r + 1; dx <= r - 1; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > r - 1) continue;
          set(cx + dx, cy, cz + dz, B.GRASS_BLOCK);
          if (chance(0.4)) set(cx + dx, cy + 1, cz + dz, pick([B.TALL_GRASS, B.POPPY, B.DANDELION, B.CORNFLOWER, B.ALLIUM, B.OXEYE_DAISY, B.FERN]));
        }
      set(cx, cy + 1, cz, B.OAK_LOG);
      for (let d = 0; d < 3; d++) set(cx, cy + 2 + d, cz, B.OAK_LOG);
      ellipsoid(cx, cy + 6, cz, 2, 2, 2, B.OAK_LEAVES);
      set(cx + 1, cy + 1, cz + 1, B.LANTERN);
      marker('firefly', cx, cy + 3, cz, { r: 3, count: 5 });
    } else if (kind === 'portal') {
      for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0]])
        set(cx + dx, cy + 1, cz + dz, B.END_PORTAL_FRAME);
      set(cx, cy + 1, cz, B.PURPUR_BLOCK);
      set(cx, cy + 2, cz, B.END_ROD);
      marker('glow', cx, cy + 2, cz, { r: 6, color: [0.6, 0.35, 1.0], power: 1.1 });
    } else {
      set(cx, cy + 1, cz, B.IRON_BLOCK);
      set(cx, cy + 2, cz, B.GLOWSTONE);
      set(cx, cy + 3, cz, B.SEA_LANTERN);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) set(cx + dx, cy + 1, cz + dz, B.QUARTZ_WALL);
      marker('glow', cx, cy + 3, cz, { r: 9, color: [0.8, 0.92, 1.0], power: 1.3 });
    }
  }
  function bridge(x0, x1, y, z, mat) {
    for (let x = lo(x0, x1); x <= hi(x0, x1); x++) {
      set(x, y, z, mat); set(x, y, z + 1, mat);
      set(x, y + 1, z - 1, B.DARK_OAK_FENCE);
      set(x, y + 1, z + 2, B.DARK_OAK_FENCE);
      set(x, y, z - 1, B.DARK_OAK_SLAB); set(x, y, z + 2, B.DARK_OAK_SLAB);
      if ((x & 3) === 0) set(x, y + 2, z - 1, B.HANGING_LANTERN);
    }
  }
  function platforms() {
    platform(-34, 61, 13, 4, 'garden');
    bridge(-41, -37, 61, 13, B.DARK_OAK_PLANKS);
    platform(-33, 68, 22, 3, 'portal');
    bridge(-41, -35, 68, 22, B.DARK_OAK_PLANKS);
    platform(-36, 55, 30, 3, 'beacon');
    bridge(-41, -38, 55, 30, B.DARK_OAK_PLANKS);
    for (let z = 24; z <= 29; z++) { set(-38, 55, z, B.DARK_OAK_PLANKS); set(-37, 55, z, B.DARK_OAK_PLANKS); set(-38, 56, z, B.DARK_OAK_FENCE); }
  }

  /* ---------------------------------------------------------------- */
  /* SHACK, PEN, FARM, YARD                                            */
  /* ---------------------------------------------------------------- */
  function shack() {
    const x0 = -63, x1 = -56, z0 = 30, z1 = 36, Y = 34;
    mixFill(x0, Y + 1, z0, x1, Y + 1, z1, [B.SPRUCE_PLANKS, B.OAK_PLANKS, B.COBBLESTONE]);
    mixWalls(x0, Y + 2, z0, x1, Y + 6, z1, [B.SPRUCE_PLANKS, B.SPRUCE_PLANKS, B.COBBLESTONE,
      B.MOSSY_COBBLESTONE, B.OAK_PLANKS, B.ANDESITE], 0.14);
    clear(x0 + 1, Y + 2, z0 + 1, x1 - 1, Y + 6, z1 - 1);
    for (const c of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
      for (let y = Y + 2; y <= Y + 6; y++) logAxis(c[0], y, c[1], B.SPRUCE_LOG, 'y');
    // second storey floor
    mixFill(x0 + 1, Y + 5, z0 + 1, x1 - 1, Y + 5, z1 - 1, [B.SPRUCE_PLANKS, B.OAK_PLANKS]);
    clear(x0 + 2, Y + 5, z0 + 2, x0 + 2, Y + 5, z0 + 2);
    for (let i = 0; i < 3; i++) stair(x0 + 1 + i, Y + 2 + i, z1 - 1, B.SPRUCE_STAIRS, 'w');
    // pitched roof
    for (let k = 0; k <= 3; k++) {
      for (let x = x0 - 1 + k; x <= x1 + 1 - k; x++) {
        stair(x, Y + 7 + k, z0 - 1 + k, B.SPRUCE_STAIRS, 'n');
        stair(x, Y + 7 + k, z1 + 1 - k, B.SPRUCE_STAIRS, 's');
      }
      for (let z = z0 - 1 + k; z <= z1 + 1 - k; z++) {
        stair(x0 - 1 + k, Y + 7 + k, z, B.SPRUCE_STAIRS, 'w');
        stair(x1 + 1 - k, Y + 7 + k, z, B.SPRUCE_STAIRS, 'e');
      }
    }
    fill(x0 + 2, Y + 10, z0 + 2, x1 - 2, Y + 10, z1 - 2, B.SPRUCE_SLAB);
    // door + windows
    clear(-60, Y + 2, z1, -60, Y + 3, z1);
    door(-60, Y + 2, z1, B.SPRUCE_DOOR, 's');
    face(-61, Y + 3, z1, B.WALL_TORCH, 's');
    set(-59, Y + 3, z1 + 1, B.JACK_O_LANTERN, 2);
    windowAt(-62, Y + 3, z1, 's', B.GLASS_PANE, B.SPRUCE_STAIRS, B.SPRUCE_SLAB);
    windowAt(-58, Y + 3, z1, 's', B.YELLOW_PANE, B.SPRUCE_STAIRS, B.SPRUCE_SLAB);
    windowAt(x0, Y + 3, 33, 'w', B.GLASS_PANE, B.COBBLE_STAIRS, B.SPRUCE_SLAB);
    windowAt(x1, Y + 6, 33, 'e', B.GLASS_PANE, B.COBBLE_STAIRS, B.SPRUCE_SLAB);
    // interior
    bed(-62, Y + 2, 31, B.BLUE_BED, 's');
    set(-57, Y + 2, 31, B.FURNACE, 2); set(-57, Y + 2, 32, B.CHEST);
    set(-58, Y + 2, 31, B.CRAFTING_TABLE);
    table(-60, Y + 2, 32, 2, 1, B.OAK_FENCE, B.OAK_SLAB);
    set(-61, Y + 4, 33, B.LANTERN);
    set(-59, Y + 2, 34, B.BARREL);
    rug(-61, 32, -59, 34, Y + 2, B.RED_CARPET);
    // upper room
    bed(-62, Y + 6, 32, B.GREEN_BED, 's');
    set(-57, Y + 6, 32, B.CHEST); set(-58, Y + 6, 31, B.BOOKSHELF);
    set(-60, Y + 9, 33, B.LANTERN);
    // leaning porch
    for (let x = -62; x <= -58; x++) {
      stair(x, Y + 1, z1 + 2, B.SPRUCE_STAIRS, 'n');
      slab(x, Y + 5, z1 + 1, B.SPRUCE_SLAB, 't');
    }
    for (const x of [-62, -58]) { for (let y = Y + 2; y <= Y + 4; y++) set(x, y, z1 + 1, B.OAK_FENCE); }
    set(-60, Y + 4, z1 + 1, B.HANGING_LANTERN);
    // laundry line to the tower
    for (let y = Y + 2; y <= Y + 8; y++) set(-55, y, 33, B.OAK_FENCE);
    for (let x = -55; x >= -57; x--) { set(x, Y + 8, 33, B.OAK_FENCE); if (chance(0.6)) set(x, Y + 9, 33, pick(CARPETS)); }
    marker('smoke', -60, Y + 11, 33, { rate: 4, rise: 0.7 });
    set(-60, Y + 10, 33, B.CAMPFIRE);
  }

  function yard() {
    const Y = 34;
    // animal pen
    const px0 = -52, px1 = -44, pz0 = 30, pz1 = 38;
    for (let x = px0; x <= px1; x++) { set(x, Y + 1, pz0, B.OAK_FENCE); set(x, Y + 1, pz1, B.OAK_FENCE); }
    for (let z = pz0; z <= pz1; z++) { set(px0, Y + 1, z, B.OAK_FENCE); set(px1, Y + 1, z, B.OAK_FENCE); }
    set(-48, Y + 1, pz0, B.OAK_FENCE_GATE, 0);
    for (let i = 0; i < 26; i++) {
      const x = randRange(px0 + 1, px1 - 1), z = randRange(pz0 + 1, pz1 - 1);
      if (!isAir(x, Y + 1, z)) continue;
      const r = rand();
      if (r < 0.14) set(x, Y + 1, z, B.COW_BODY);
      else if (r < 0.28) set(x, Y + 1, z, B.SHEEP_BODY);
      else if (r < 0.36) set(x, Y + 1, z, B.CHICKEN_BODY);
      else if (r < 0.55) set(x, Y + 1, z, pick([B.TALL_GRASS, B.TALL_GRASS, B.DANDELION]));
    }
    set(-50, Y + 1, 34, B.CAULDRON); set(-49, Y, 34, B.WATER);
    set(-46, Y + 1, 32, B.HAY_BALE); set(-46, Y + 2, 32, B.HAY_BALE); set(-47, Y + 1, 32, B.HAY_BALE);
    set(-45, Y + 1, 37, B.COMPOSTER);
    face(-48, Y + 2, pz0 - 1, B.WALL_TORCH, 'n');
    for (const p of [[px0, pz0], [px1, pz0], [px0, pz1], [px1, pz1]]) { set(p[0], Y + 2, p[1], B.OAK_FENCE); set(p[0], Y + 3, p[1], B.LANTERN); }

    // crop patch
    const fx0 = -40, fx1 = -33, fz0 = 27, fz1 = 34;
    for (let z = fz0; z <= fz1; z++)
      for (let x = fx0; x <= fx1; x++) {
        if (x === -36) { set(x, Y, z, B.WATER); continue; }
        set(x, Y, z, Math.abs(x + 36) <= 4 ? B.FARMLAND_WET : B.FARMLAND);
        const r = rand();
        set(x, Y + 1, z, r < 0.5 ? B.WHEAT : r < 0.7 ? B.CARROTS : r < 0.85 ? B.POTATOES : B.BEETROOTS);
      }
    for (let z = fz0 - 1; z <= fz1 + 1; z++) { set(fx0 - 1, Y + 1, z, B.OAK_FENCE); set(fx1 + 1, Y + 1, z, B.OAK_FENCE); }
    for (let x = fx0 - 1; x <= fx1 + 1; x++) { set(x, Y + 1, fz0 - 1, B.OAK_FENCE); set(x, Y + 1, fz1 + 1, B.OAK_FENCE); }
    set(-37, Y + 1, fz0 - 1, B.OAK_FENCE_GATE, 0);
    set(fx1 + 1, Y + 2, fz1 + 1, B.TORCH); set(fx0 - 1, Y + 2, fz0 - 1, B.TORCH);
    set(-34, Y + 1, 36, B.COMPOSTER); set(-35, Y + 1, 36, B.BARREL);
    set(-38, Y + 2, 26, B.CARVED_PUMPKIN, 2); set(-38, Y + 1, 26, B.HAY_BALE);

    // chest heap + junk beside the front door
    let hx = -53;
    for (const stackH of [3, 2, 3, 1, 2, 2]) {
      for (let k = 0; k < stackH; k++)
        set(hx, Y + 1 + k, 27, pick([B.CHEST, B.BARREL, B.TRAPPED_CHEST, B.BARREL]));
      hx++;
    }
    face(-53, Y + 3, 26, B.SHOP_SIGN, 'n');
    set(-47, Y + 1, 27, B.CAULDRON); set(-46, Y + 1, 27, B.ANVIL);
    set(-45, Y + 1, 27, B.ARMOR_STAND); set(-44, Y + 1, 27, B.WOLF_STATUE);
    set(-51, Y + 2, 28, B.LANTERN); set(-51, Y + 1, 28, B.COBBLE_WALL);

    // paths
    for (let z = 26; z <= 42; z++)
      for (let x = -51; x <= -47; x++)
        if (isSolid(x, Y, z) && chance(0.85)) set(x, Y, z, chance(0.2) ? B.COBBLESTONE : B.DIRT_PATH);
    for (let x = -62; x <= -30; x++)
      if (isSolid(x, Y, 29) && chance(0.85)) { set(x, Y, 29, chance(0.25) ? B.GRAVEL : B.DIRT_PATH); set(x, Y, 30, chance(0.8) ? B.DIRT_PATH : B.COARSE_DIRT); }
    // torch posts along the paths
    for (let z = 27; z <= 41; z += 4) { set(-52, Y + 1, z, B.COBBLE_WALL); set(-52, Y + 2, z, B.TORCH); marker('spark', -52, Y + 2, z, { rate: 2 }); }
    for (let x = -60; x <= -32; x += 6) { set(x, Y + 1, 31, B.OAK_FENCE); set(x, Y + 2, 31, B.LANTERN); }

    // greenery + fireflies
    for (let i = 0; i < 130; i++) {
      const x = randRange(-64, -30), z = randRange(4, 42);
      if (!isAir(x, Y + 1, z) || !isSolid(x, Y, z)) continue;
      if (get(x, Y, z) !== B.GRASS_BLOCK) continue;
      const r = rand();
      if (r < 0.5) set(x, Y + 1, z, B.TALL_GRASS);
      else if (r < 0.7) set(x, Y + 1, z, B.FERN);
      else if (r < 0.9) set(x, Y + 1, z, pick([B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY, B.RED_TULIP]));
      else set(x, Y + 1, z, B.MOSS_CARPET);
    }
    for (const p of [[-58, 40], [-45, 40], [-35, 20], [-60, 12], [-36, 38]])
      marker('firefly', p[0], Y + 3, p[1], { r: 6, count: 5 });
  }

  /* ---------------------------------------------------------------- */
  /* vines on the walls                                                */
  /* ---------------------------------------------------------------- */
  function vines() {
    for (let i = 0; i < 260; i++) {
      const f = randi(NF), F = foot(f), Y = DECK(f);
      const y = Y + randRange(1, 4);
      const side = randi(4);
      let x, z, d;
      if (side === 0) { x = randRange(F.x0, F.x1); z = F.z0 - 1; d = 'n'; }
      else if (side === 1) { x = randRange(F.x0, F.x1); z = F.z1 + 1; d = 's'; }
      else if (side === 2) { x = F.x0 - 1; z = randRange(F.z0, F.z1); d = 'w'; }
      else { x = F.x1 + 1; z = randRange(F.z0, F.z1); d = 'e'; }
      if (!isAir(x, y, z)) continue;
      face(x, y, z, B.VINE, d === 'n' ? 's' : d === 's' ? 'n' : d === 'w' ? 'e' : 'w');
      if (chance(0.5) && isAir(x, y - 1, z)) face(x, y - 1, z, B.VINE, d === 'n' ? 's' : d === 's' ? 'n' : d === 'w' ? 'e' : 'w');
    }
  }

  /* ---------------------------------------------------------------- */
  function build() {
    W.seed(880417);
    initPalettes();
    basement();
    shell();
    stairwell();
    ladderShaft();
    chimney();
    lobby();
    apartments();
    loft();
    roof();
    lavaFall();
    balconies();
    platforms();
    shack();
    yard();
    vines();

    poi('Poor district', -28, 48, 46, 215, -12);
    poi('Lava fall', -26, 46, 16, 270, 6);
    poi('Tenement lobby', -44, 37, 17, 270, -2);
    poi('Rooftops & platforms', -31, 76, 36, 223, -20);
    poi('The shack', -59, 39, 43, 186, -6);

    marker('firefly', -50, 40, 28, { r: 7, count: 6 });
    marker('firefly', -57, 38, 20, { r: 6, count: 5 });
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.poor = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
