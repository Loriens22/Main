/* =====================================================================
   THE KIDS' PITCH  —  floodlit football field, stands, playground, club
   Zone : x -26..16   z 38..74   ground y=32   max y=56
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;
  const px = l => W.pick(l);
  const G = 32;

  /* pitch: 20 wide (x) x 30 long (z) */
  const FX0 = -14, FX1 = 5, FZ0 = 42, FZ1 = 71;
  const CX = -4, CZ = 56;                       // centre spot

  const LINE = B.WHITE_CONCRETE;
  const WOODS = [B.OAK_PLANKS, B.SPRUCE_PLANKS, B.BIRCH_PLANKS];
  const STONE = [B.STONE_BRICKS, B.STONE_BRICKS, B.COBBLESTONE, B.ANDESITE, B.MOSSY_STONE_BRICKS];
  const TERRA = [B.RED_TERRACOTTA, B.YELLOW_TERRACOTTA, B.LIME_TERRACOTTA,
    B.LIGHT_BLUE_TERRACOTTA, B.ORANGE_TERRACOTTA, B.PINK_TERRACOTTA];
  const BALLS = [B.WHITE_WOOL, B.WHITE_CONCRETE, B.RED_WOOL, B.LIME_WOOL, B.BLUE_WOOL, B.YELLOW_WOOL];

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

  /* =================================================================== */
  /* 1.  THE PITCH                                                        */
  /* =================================================================== */
  function pitch() {
    // mow: clear anything the terrain left on the field and its apron
    for (let z = FZ0 - 4; z <= Math.min(FZ1 + 4, 74); z++)
      for (let x = Math.max(FX0 - 5, -26); x <= Math.min(FX1 + 5, 16); x++) {
        W.clear(x, G + 1, z, x, G + 3, z);
        if (W.isSolid(x, G, z)) W.set(x, G, z, B.GRASS_BLOCK);
      }
    // subtle turf mowing stripes
    for (let z = FZ0; z <= FZ1; z++)
      for (let x = FX0; x <= FX1; x++)
        if (((z - FZ0) >> 1) % 2 === 0 && W.chance(0.22)) W.set(x, G, z, B.MOSS_BLOCK);

    // Line blocks double as flush pitch lighting — every fourth marker is a
    // sea lantern, which reads white from a distance but floods the turf.
    let lineN = 0;
    const line = (x, z) => { W.set(x, G, z, (lineN++ % 4 === 0) ? B.SEA_LANTERN : LINE); };
    // touchlines + goal lines
    for (let x = FX0; x <= FX1; x++) { line(x, FZ0); line(x, FZ1); }
    for (let z = FZ0; z <= FZ1; z++) { line(FX0, z); line(FX1, z); }
    // halfway line
    for (let x = FX0; x <= FX1; x++) line(x, CZ);
    // centre circle + spot
    W.ring(CX, G, CZ, 5, LINE);
    W.set(CX, G, CZ, LINE);
    // penalty boxes (16 wide, 6 deep) and 6-yard boxes
    function boxAt(zEdge, dir) {
      const pz = zEdge + dir * 6;
      for (let x = FX0 + 2; x <= FX1 - 2; x++) line(x, pz);
      for (let d = 0; d <= 6; d++) { line(FX0 + 2, zEdge + dir * d); line(FX1 - 2, zEdge + dir * d); }
      const sz = zEdge + dir * 2;
      for (let x = FX0 + 6; x <= FX1 - 6; x++) line(x, sz);
      for (let d = 0; d <= 2; d++) { line(FX0 + 6, zEdge + dir * d); line(FX1 - 6, zEdge + dir * d); }
      line(CX, zEdge + dir * 4);                       // penalty spot
    }
    boxAt(FZ0, 1); boxAt(FZ1, -1);
    // corner arcs
    for (const [cx, cz, sx, sz] of [[FX0, FZ0, 1, 1], [FX1, FZ0, -1, 1], [FX0, FZ1, 1, -1], [FX1, FZ1, -1, -1]])
      for (let a = 0; a <= 6; a++) {
        const ang = a / 6 * Math.PI / 2;
        line(cx + Math.round(Math.cos(ang) * 2) * sx, cz + Math.round(Math.sin(ang) * 2) * sz);
      }
    // worn goal mouths + touchline traffic
    for (const gz of [FZ0 + 1, FZ1 - 1])
      for (let z = gz - 1; z <= gz + 1; z++)
        for (let x = CX - 3; x <= CX + 3; x++)
          if (W.chance(0.45) && W.get(x, G, z) !== LINE) W.set(x, G, z, W.chance(0.5) ? B.COARSE_DIRT : B.DIRT_PATH);
    for (let z = FZ0; z <= FZ1; z++) {
      if (W.chance(0.35)) W.set(FX0 - 1, G, z, B.DIRT_PATH);
      if (W.chance(0.35)) W.set(FX1 + 1, G, z, B.COARSE_DIRT);
    }
  }

  function goals() {
    for (const [gz, dir] of [[FZ0, 1], [FZ1, -1]]) {
      for (let x = CX - 2; x <= CX + 2; x++) {
        if (x === CX - 2 || x === CX + 2) {
          for (let y = G + 1; y <= G + 3; y++) W.set(x, y, gz, B.BIRCH_FENCE);
        }
        W.set(x, G + 4, gz, B.BIRCH_FENCE);              // crossbar
        // net
        for (let d = 1; d <= 2; d++)
          for (let y = G + 1; y <= G + 3; y++) W.set(x, y, gz - dir * d, B.IRON_BARS);
        W.set(x, G + 4, gz - dir, B.IRON_BARS);
        W.set(x, G, gz - dir, B.GRAY_CARPET);
      }
      for (let d = 1; d <= 2; d++)
        for (const x of [CX - 2, CX + 2])
          for (let y = G + 1; y <= G + 4; y++) W.set(x, y, gz - dir * d, B.IRON_BARS);
      W.set(CX - 1, G + 1, gz - dir * 2, px(BALLS));
    }
  }

  function perimeter() {
    for (let x = FX0 - 2; x <= FX1 + 2; x++) {
      if (Math.abs(x - CX) > 2) {
        W.set(x, G + 1, FZ0 - 2, px([B.OAK_FENCE, B.SPRUCE_FENCE, B.BIRCH_FENCE]));
        W.set(x, G + 1, FZ1 + 2, px([B.OAK_FENCE, B.SPRUCE_FENCE, B.BIRCH_FENCE]));
      }
    }
    for (let z = FZ0 - 2; z <= FZ1 + 2; z++) {
      if (z === 50 || z === 51 || z === 62 || z === 63) continue;      // gates
      W.set(FX0 - 2, G + 1, z, px([B.OAK_FENCE, B.SPRUCE_FENCE]));
      W.set(FX1 + 2, G + 1, z, px([B.OAK_FENCE, B.SPRUCE_FENCE]));
    }
    W.set(FX0 - 2, G + 1, 50, B.OAK_FENCE_GATE, 1);
    W.set(FX1 + 2, G + 1, 62, B.OAK_FENCE_GATE, 1);
    W.set(CX, G + 1, FZ0 - 2, B.OAK_FENCE_GATE, 0);
  }

  /* =================================================================== */
  /* 2.  SPECTATOR STAND (west) + benches (east)                          */
  /* =================================================================== */
  function stand() {
    const z0 = 48, z1 = 66;
    for (let k = 0; k < 4; k++) {
      const x = FX0 - 3 - k, y = G + 1 + k;
      for (let z = z0; z <= z1; z++) {
        W.fill(x, G, z, x, y - 1, z, px(STONE));
        W.stair(x, y, z, W.chance(0.2) ? B.MOSSY_COBBLE_STAIRS : B.STONE_BRICK_STAIRS, 'e');
        if (k > 0 && W.chance(0.55))
          W.set(x, y + 1, z, px([B.RED_CARPET, B.BLUE_CARPET, B.YELLOW_CARPET, B.LIME_CARPET, B.WHITE_CARPET]));
        if (k === 3 && (z - z0) % 4 === 0) { W.set(x, y + 1, z, B.HAY_BALE); }
      }
    }
    // back wall + roof over the middle
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      for (let y = G + 5; y <= G + 8; y++) W.set(FX0 - 7, y, z, px(STONE));
      W.set(FX0 - 7, G + 9, z, B.STONE_BRICK_SLAB);
    }
    for (let z = 52; z <= 62; z++) {
      for (let x = FX0 - 7; x <= FX0 - 2; x++) W.slab(x, G + 9, z, B.DARK_OAK_SLAB, 'b');
      W.stair(FX0 - 1, G + 9, z, B.SPRUCE_STAIRS, 'e');
      for (let y = G + 5; y <= G + 8; y++) if ((z - 52) % 5 === 0) W.logAxis(FX0 - 2, y, z, B.DARK_OAK_LOG, 'y');
      if ((z - 52) % 5 === 0) W.set(FX0 - 3, G + 8, z, B.HANGING_LANTERN);
    }
    for (let z = z0; z <= z1; z += 3) W.face(FX0 - 6, G + 7, z, px([B.RED_BANNER, B.BLUE_BANNER, B.YELLOW_BANNER, B.GREEN_BANNER, B.WHITE_BANNER]), 'e');
    W.marker('glow', FX0 - 4, G + 8, 57, { r: 7, color: [1, 0.8, 0.5], power: 0.8 });
    // east benches under the trees
    for (let z = 44; z <= 54; z += 5) {
      for (let i = 0; i < 4; i++) W.stair(FX1 + 4 + i, G + 1, z, B.OAK_STAIRS, 's');
      W.set(FX1 + 3, G + 1, z, B.OAK_FENCE); W.set(FX1 + 8, G + 1, z, B.OAK_FENCE);
      // picnic table
      for (let i = 0; i < 3; i++) {
        W.set(FX1 + 5 + i, G + 1, z + 2, B.OAK_FENCE);
        W.slab(FX1 + 5 + i, G + 2, z + 2, B.OAK_SLAB, 't');
      }
      W.set(FX1 + 4, G + 2, z + 2, B.LANTERN);
    }
  }

  /* =================================================================== */
  /* 3.  FLOODLIGHTS                                                      */
  /* =================================================================== */
  function floodlights() {
    const spots = [[FX0 - 3, FZ0 - 3, 1, 1], [FX1 + 3, FZ0 - 3, -1, 1],
    [FX0 - 3, FZ1 + 3, 1, -1], [FX1 + 3, FZ1 + 3, -1, -1],
    [FX0 - 3, 52, 1, 0], [FX1 + 3, 52, -1, 0],
    [FX0 - 3, 62, 1, 0], [FX1 + 3, 62, -1, 0]];
    for (const [x, z, dx, dz] of spots) {
      for (let y = G + 1; y <= G + 12; y++)
        W.set(x, y, z, y < G + 3 ? px([B.COBBLESTONE, B.STONE_BRICKS]) : (y % 2 ? B.COBBLE_WALL : B.IRON_BARS));
      // head platform
      for (let ddx = -1; ddx <= 1; ddx++)
        for (let ddz = -1; ddz <= 1; ddz++) W.slab(x + ddx, G + 13, z + ddz, B.SMOOTH_STONE_SLAB, 'b');
      for (let ddx = -1; ddx <= 1; ddx++)
        for (let ddz = -1; ddz <= 1; ddz++) {
          W.set(x + ddx, G + 14, z + ddz, W.chance(0.5) ? B.GLOWSTONE : B.SEA_LANTERN);
          W.set(x + ddx, G + 15, z + ddz, B.IRON_BARS);
        }
      W.set(x, G + 14, z, B.REDSTONE_LAMP);
      // tilt the head in toward the pitch
      W.set(x + dx, G + 13, z + dz, B.SEA_LANTERN);
      W.stair(x + dx * 2, G + 13, z + dz, B.SMOOTH_STONE_STAIRS, dx > 0 ? 'w' : 'e');
      // guy braces
      W.set(x + dx, G + 4, z, B.COBBLE_WALL); W.set(x, G + 4, z + dz, B.COBBLE_WALL);
      W.marker('glow', x + dx, G + 14, z + dz, { r: 11, color: [1, 0.95, 0.82], power: 1.0 });
      W.marker('spark', x, G + 14, z, { rate: 0.6 });
    }
  }

  function scoreboard() {
    const x0 = FX1 + 4, z = 44;
    for (const bx of [x0, x0 + 6]) for (let y = G + 1; y <= G + 7; y++) W.logAxis(bx, y, z, B.DARK_OAK_LOG, 'y');
    for (let x = x0; x <= x0 + 6; x++) {
      W.logAxis(x, G + 8, z, B.DARK_OAK_LOG, 'x');
      for (let y = G + 4; y <= G + 7; y++) W.set(x, y, z, B.BLACK_CONCRETE);
    }
    // numerals
    for (const [dx, dy] of [[1, 5], [1, 6], [2, 6], [2, 4], [4, 4], [4, 5], [4, 6], [5, 6], [3, 5]])
      W.set(x0 + dx, G + dy, z, B.WHITE_CONCRETE);
    W.set(x0 + 3, G + 5, z, B.REDSTONE_LAMP);
    W.face(x0 + 3, G + 3, z, B.SPAWN_SIGN, 's');
    W.set(x0, G + 8, z + 1, B.LANTERN); W.set(x0 + 6, G + 8, z + 1, B.LANTERN);
    for (let x = x0; x <= x0 + 6; x++) W.stair(x, G + 9, z, B.DARK_OAK_STAIRS, 'n');
    W.marker('glow', x0 + 3, G + 6, z + 1, { r: 5, color: [1, 0.6, 0.4], power: 0.7 });
  }

  /* =================================================================== */
  /* 4.  PLAYGROUND (north-east strip)                                    */
  /* =================================================================== */
  function playground() {
    /* colourful terracotta path through the play area (x 7..15, z 58..73) */
    for (let z = 57; z <= 73; z++)
      for (let x = 7; x <= 15; x++)
        if (W.isSolid(x, G, z) && W.chance(0.7)) W.set(x, G, z, px(TERRA));

    /* ---- slide: deck on posts, ladder up, slime chute down ---- */
    const sx = 8, sz = 58;
    for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]])
      for (let y = G + 1; y <= G + 5; y++) W.set(sx + dx, y, sz + dz, B.OAK_LOG);
    for (let dz = 0; dz <= 3; dz++)
      for (let dx = 0; dx <= 3; dx++) W.set(sx + dx, G + 6, sz + dz, px([B.OAK_PLANKS, B.SPRUCE_PLANKS]));
    for (let dx = 0; dx <= 3; dx++) { W.set(sx + dx, G + 7, sz, B.OAK_FENCE); }
    for (let dz = 0; dz <= 3; dz++) { W.set(sx, G + 7, sz + dz, B.OAK_FENCE); W.set(sx + 3, G + 7, sz + dz, B.OAK_FENCE); }
    W.set(sx, G + 8, sz, B.LANTERN);
    for (let y = G + 1; y <= G + 6; y++) W.face(sx + 3, y, sz + 1, B.LADDER, 'w');
    W.clear(sx + 3, G + 7, sz + 1, sx + 3, G + 7, sz + 1);
    // chute running south, one block down per step
    for (let i = 0; i < 6; i++) {
      const y = G + 6 - i, z = sz + 4 + i;
      W.set(sx + 1, y, z, B.SLIME_BLOCK); W.set(sx + 2, y, z, B.SLIME_BLOCK);
      W.set(sx + 1, y - 1, z, B.OAK_PLANKS); W.set(sx + 2, y - 1, z, B.OAK_PLANKS);
      W.set(sx, y, z, B.OAK_FENCE); W.set(sx + 3, y, z, B.OAK_FENCE);
      W.set(sx, y - 1, z, B.OAK_LOG); W.set(sx + 3, y - 1, z, B.OAK_LOG);
    }
    // sand landing pit
    for (let z = 69; z <= 72; z++)
      for (let x = sx - 1; x <= sx + 4; x++) { W.set(x, G, z, B.SAND); W.clear(x, G + 1, z, x, G + 1, z); }
    for (let x = sx - 1; x <= sx + 4; x++) { W.slab(x, G + 1, 73, B.OAK_SLAB, 'b'); W.slab(x, G + 1, 68, B.OAK_SLAB, 'b'); }
    for (let z = 68; z <= 73; z++) { W.slab(sx - 2, G + 1, z, B.OAK_SLAB, 'b'); W.slab(sx + 5, G + 1, z, B.OAK_SLAB, 'b'); }

    /* ---- swings ---- */
    const wx = 14, wz = 58;
    for (const dz of [0, 4]) for (let y = G + 1; y <= G + 5; y++) W.set(wx, y, wz + dz, B.DARK_OAK_LOG);
    for (let dz = 0; dz <= 4; dz++) W.logAxis(wx, G + 6, wz + dz, B.DARK_OAK_LOG, 'z');
    for (const dz of [1, 3]) {
      W.set(wx, G + 5, wz + dz, B.CHAIN); W.set(wx, G + 4, wz + dz, B.CHAIN);
      W.trapdoor(wx, G + 3, wz + dz, B.OAK_TRAPDOOR, 'n', { top: true });
    }
    W.set(wx, G + 7, wz, B.LANTERN);
    W.marker('glow', wx, G + 7, wz, { r: 5, color: [1, 0.82, 0.5], power: 0.6 });

    /* ---- climbing frame / monkey bars ---- */
    const cx = 12, cz = 64;
    for (let dz = 0; dz <= 3; dz++)
      for (let dx = 0; dx <= 3; dx++)
        if (dx === 0 || dx === 3 || dz === 0 || dz === 3)
          for (let y = G + 1; y <= G + 4; y++) W.set(cx + dx, y, cz + dz, W.chance(0.5) ? B.SCAFFOLDING : B.IRON_BARS);
    for (let dz = 0; dz <= 3; dz++)
      for (let dx = 0; dx <= 3; dx++) W.set(cx + dx, G + 5, cz + dz, B.IRON_BARS);
    for (let y = G + 1; y <= G + 5; y++) W.face(cx + 1, y, cz, B.LADDER, 's');
    W.set(cx + 3, G + 6, cz + 3, B.LANTERN);

    /* ---- seesaw ---- */
    const ox = 14, oz = 71;
    W.set(ox, G + 1, oz, B.OAK_LOG);
    W.stair(ox, G + 1, oz - 1, B.OAK_STAIRS, 's'); W.stair(ox, G + 1, oz + 1, B.OAK_STAIRS, 'n');
    W.slab(ox, G + 1, oz - 2, B.OAK_SLAB, 'b'); W.slab(ox, G + 1, oz + 2, B.OAK_SLAB, 'b');

    /* ---- balls scattered about ---- */
    for (let i = 0; i < 16; i++) {
      const x = W.randRange(FX0 - 1, 15), z = W.randRange(FZ0, 73);
      if (!W.isAir(x, G + 1, z) || !W.isSolid(x, G, z)) continue;
      W.set(x, G + 1, z, px(BALLS));
      if (W.chance(0.4) && W.isAir(x + 1, G + 1, z)) W.set(x + 1, G + 1, z, B.BLACK_WOOL);
    }
  }

  /* =================================================================== */
  /* 5.  CLUBHOUSE                                                        */
  /* =================================================================== */
  function clubhouse() {
    const x0 = -25, x1 = -16, z0 = 40, z1 = 47;
    fillMix(x0, G, z0, x1, G, z1, [B.OAK_PLANKS, B.SPRUCE_PLANKS, B.STONE_BRICKS]);
    wallsMix(x0, G + 1, z0, x1, G + 5, z1, [B.OAK_PLANKS, B.OAK_PLANKS, B.STONE_BRICKS,
      B.COBBLESTONE, B.SPRUCE_PLANKS, B.CRACKED_STONE_BRICKS]);
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
      for (let y = G + 1; y <= G + 5; y++) W.logAxis(cx, y, cz, B.SPRUCE_LOG, 'y');
    W.clear(x0 + 1, G + 1, z0 + 1, x1 - 1, G + 5, z1 - 1);
    // pitched roof
    for (let k = 0; k <= 4; k++)
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        W.stair(x, G + 6 + k, z0 - 1 + k, B.SPRUCE_STAIRS, 'n');
        W.stair(x, G + 6 + k, z1 + 1 - k, B.SPRUCE_STAIRS, 's');
        if (k > 0) { W.set(x, G + 5 + k, z0 - 1 + k, B.SPRUCE_PLANKS); W.set(x, G + 5 + k, z1 + 1 - k, B.SPRUCE_PLANKS); }
      }
    // door + windows
    W.clear(-20, G + 1, z1, -20, G + 3, z1);
    W.door(-20, G + 1, z1, B.OAK_DOOR, 's');
    for (const x of [-23, -18]) {
      W.set(x, G + 3, z1, B.GLASS_PANE); W.set(x, G + 4, z1, B.GLASS_PANE);
      W.stair(x, G + 2, z1 + 1, B.OAK_STAIRS, 'n', true);
      W.slab(x, G + 5, z1 + 1, B.OAK_SLAB, 'b');
    }
    for (const z of [42, 45]) {
      W.set(x1, G + 3, z, B.GLASS_PANE); W.set(x1, G + 4, z, B.GLASS_PANE);
      W.set(x0, G + 3, z, B.GLASS_PANE); W.set(x0, G + 4, z, B.GLASS_PANE);
    }
    W.face(-21, G + 4, z1, B.SPAWN_SIGN, 's');
    W.face(-19, G + 4, z1, B.GEAR_SIGN, 's');
    // interior
    const y = G + 1;
    for (let z = z0 + 1; z <= z1 - 1; z++) for (let x = x0 + 1; x <= x1 - 1; x++)
      if (W.chance(0.4)) W.set(x, y, z, px([B.GREEN_CARPET, B.LIME_CARPET, B.WHITE_CARPET]));
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      W.set(x, y, z0 + 1, W.chance(0.5) ? B.CHEST : B.BARREL);
      if (W.chance(0.5)) W.set(x, y + 1, z0 + 1, B.BARREL);
    }
    W.stair(x0 + 1, y, z0 + 3, B.OAK_STAIRS, 'w'); W.stair(x0 + 1, y, z0 + 4, B.OAK_STAIRS, 'w');
    W.set(x0 + 2, y, z0 + 3, B.ARMOR_STAND);
    W.set(x1 - 1, y, z0 + 2, B.FURNACE, 2); W.set(x1 - 1, y, z0 + 3, B.CAULDRON);
    for (let i = 0; i < 3; i++) { W.set(-21 + i, y, 44, B.OAK_FENCE); W.slab(-21 + i, y + 1, 44, B.OAK_SLAB, 't'); }
    W.set(-20, y + 2, 44, B.CAKE);
    for (let x = x0 + 2; x <= x1 - 2; x += 3) W.face(x, y + 3, z0 + 1, px([B.ITEM_FRAME, B.MAP_FRAME, B.PAINTING_B]), 'n');
    for (const [lx, lz] of [[-23, 42], [-18, 42], [-23, 46], [-18, 46], [-20, 44]]) W.set(lx, G + 5, lz, B.LANTERN);
    W.face(x0 + 1, y + 3, 45, B.GREEN_BANNER, 'e');
    W.face(x1 - 1, y + 3, 45, B.RED_BANNER, 'w');
    // terrace + BBQ facing the pitch
    for (let x = x0; x <= x1; x++) {
      for (let z = z1 + 1; z <= z1 + 3; z++) W.set(x, G, z, px([B.STONE_BRICKS, B.ANDESITE, B.COBBLESTONE]));
      W.slab(x, G + 6, z1 + 2, B.DARK_OAK_SLAB, 't');
    }
    for (const x of [x0, x0 + 4, x1]) for (let yy = G + 1; yy <= G + 5; yy++) W.set(x, yy, z1 + 2, B.OAK_FENCE);
    for (const [tx, tz] of [[-23, 49], [-18, 49]]) {
      W.set(tx, G + 1, tz, B.OAK_FENCE); W.slab(tx, G + 2, tz, B.OAK_SLAB, 't');
      W.stair(tx - 1, G + 1, tz, B.OAK_STAIRS, 'w'); W.stair(tx + 1, G + 1, tz, B.OAK_STAIRS, 'e');
      W.set(tx, G + 5, tz, B.HANGING_LANTERN);
    }
    W.set(-16, G + 1, 49, B.CAMPFIRE);
    W.set(-17, G + 1, 49, B.COBBLESTONE); W.set(-15, G + 1, 49, B.COBBLESTONE);
    W.marker('smoke', -16, G + 2, 49, { rate: 7, rise: 0.9, spread: 0.6 });
    W.marker('glow', -16, G + 2, 49, { r: 7, color: [1, 0.6, 0.25], power: 1.0 });
    // chimney
    for (let yy = G + 6; yy <= G + 11; yy++) W.set(x0 + 1, yy, 42, px([B.COBBLESTONE, B.BRICKS, B.STONE_BRICKS]));
    W.marker('smoke', x0 + 1, G + 12, 42, { rate: 5, rise: 0.9 });
  }

  /* =================================================================== */
  /* 6.  SURROUNDINGS                                                     */
  /* =================================================================== */
  function grounds() {
    // path from the north edge (plaza) down to the ground
    for (let z = 38; z <= 50; z++)
      for (let x = -8; x <= -4; x++)
        if (W.isSolid(x, G, z) && W.chance(0.85)) W.set(x, G, z, W.chance(0.2) ? B.COBBLESTONE : B.DIRT_PATH);
    for (let x = -24; x <= 15; x++)
      if (W.isSolid(x, G, 39)) W.set(x, G, 39, W.chance(0.25) ? B.GRAVEL : B.DIRT_PATH);
    // lamp posts along the paths
    for (let x = -22; x <= 14; x += 6) {
      W.set(x, G + 1, 38, B.COBBLE_WALL); W.set(x, G + 2, 38, B.LANTERN);
      W.marker('spark', x, G + 2, 38, { rate: 0.5 });
    }
    for (let z = 42; z <= 72; z += 6) {
      W.set(-24, G + 1, z, B.OAK_FENCE); W.set(-24, G + 2, z, B.LANTERN);
      W.marker('glow', -24, G + 2, z, { r: 5, color: [1, 0.8, 0.45], power: 0.6 });
    }
    // trees and bushes round the edges
    const spots = [[-24, 55], [-23, 62], [-22, 70], [13, 44], [13, 51], [13, 56], [-22, 44], [-24, 48], [-20, 52]];
    for (const [x, z] of spots) {
      if (!W.isSolid(x, G, z)) continue;
      const h = W.randRange(4, 6);
      for (let i = 1; i <= h; i++) W.set(x, G + i, z, B.OAK_LOG);
      W.ellipsoid(x, G + h + 1, z, 2, 2, 2, B.OAK_LEAVES);
      W.ellipsoid(x, G + h + 2, z, 1, 1, 1, B.OAK_LEAVES);
      W.marker('firefly', x, G + h, z, { r: 4, count: 4 });
    }
    // flower beds
    for (const [bx, bz] of [[-24, 44], [12, 68], [-20, 72], [10, 40]]) {
      for (let dz = 0; dz <= 2; dz++) for (let dx = 0; dx <= 3; dx++) {
        if (!W.isSolid(bx + dx, G, bz + dz)) continue;
        W.set(bx + dx, G, bz + dz, B.GRASS_BLOCK);
        if (W.chance(0.8)) W.set(bx + dx, G + 1, bz + dz,
          px([B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY, B.RED_TULIP, B.ALLIUM, B.TALL_GRASS]));
      }
    }
    // props
    W.set(-25, G + 1, 52, B.WOLF_STATUE); W.set(14, G + 1, 60, B.CAT_STATUE);
    for (const [ax, az] of [[-25, 60], [-25, 64], [13, 70], [12, 42]]) {
      if (W.isAir(ax, G + 1, az)) W.set(ax, G + 1, az, W.chance(0.5) ? B.SHEEP_BODY : B.CHICKEN_BODY);
    }
    W.set(-23, G + 1, 51, B.CAULDRON);                     // bin
    W.set(12, G + 1, 50, B.CAULDRON); W.set(12, G, 50, B.STONE_BRICKS);
    for (let x = 10; x <= 13; x++) { W.set(x, G + 1, 46, B.IRON_BARS); W.set(x, G + 2, 46, B.IRON_BARS); }
    for (const [hx, hz] of [[-25, 68], [14, 66]]) { W.set(hx, G + 1, hz, B.HAY_BALE); W.set(hx, G + 2, hz, B.HAY_BALE); W.set(hx + 1, G + 1, hz, B.HAY_BALE); }
    // grass detail outside the fence
    for (let i = 0; i < 180; i++) {
      const x = W.randRange(-26, 16), z = W.randRange(38, 74);
      if (x >= FX0 - 2 && x <= FX1 + 2 && z >= FZ0 - 2 && z <= FZ1 + 2) continue;
      if (!W.isAir(x, G + 1, z) || W.get(x, G, z) !== B.GRASS_BLOCK) continue;
      const r = W.rand();
      if (r < 0.55) W.set(x, G + 1, z, B.TALL_GRASS);
      else if (r < 0.75) W.set(x, G + 1, z, B.FERN);
      else if (r < 0.95) W.set(x, G + 1, z, px([B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY]));
    }
    for (const [fx, fz] of [[-20, 60], [10, 55], [-6, 73], [8, 62]])
      W.marker('firefly', fx, G + 3, fz, { r: 7, count: 6 });
  }

  /* =================================================================== */
  function build() {
    W.seed(4041999);
    pitch();
    goals();
    perimeter();
    stand();
    floodlights();
    scoreboard();
    playground();
    clubhouse();
    grounds();

    poi('Behind the goal', -4, 36, 77, 180, -4);
    poi('Floodlit pitch', -4, 50, 74, 182, -22);
    poi('Spectator stand', -20, 38, 55, 90, -8);
    poi('Playground', 11, 37, 70, 180, -8);
    poi('Clubhouse', -18, 35, 45, 280, -4);
  }

  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.sports = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
