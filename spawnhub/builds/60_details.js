/* =========================================================================
 * 60_details — plaza, paths, lighting, rail line, animal statues, wear.
 * Runs LAST (order 60). Whole-map bounds, but surgical: only replaces
 * GRASS (or still-empty air, so the build also works before terrain lands)
 * at ground level, and only places decor into verified air cells.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('details', 60, [0, 0, 287, 287], function (W, B) {
    'use strict';
    const GY = W.GROUND; // 32 — terrain surface
    const AIR = 0;

    /* ---------------- deterministic rng ---------------- */
    let _s = 0x5EEDDE7A | 0;
    function rnd() {
      _s = (_s + 0x6D2B79F5) | 0;
      let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function pick(a) { return a[(rnd() * a.length) | 0]; }

    /* ---------------- cached ids ---------------- */
    const GRASS = B.GRASS, WATER = B.WATER;
    const PATH_MIX = [B.COBBLESTONE, B.STONE_BRICKS, B.ANDESITE, B.GRAVEL];
    const FLOWERS = [B.TALL_GRASS, B.TALL_GRASS, B.FERN, B.POPPY, B.DANDELION,
      B.TULIP_RED, B.TULIP_WHITE, B.TULIP_PINK, B.CORNFLOWER, B.OXEYE_DAISY, B.ALLIUM];
    const PLANT_IDS = new Set([B.TALL_GRASS, B.FERN, B.POPPY, B.DANDELION, B.TULIP_RED,
      B.TULIP_WHITE, B.TULIP_PINK, B.CORNFLOWER, B.OXEYE_DAISY, B.ALLIUM, B.LILY_OF_VALLEY,
      B.ROSE_BUSH, B.SWEET_BERRY_BUSH, B.DEAD_BUSH, B.MUSHROOM_RED, B.MUSHROOM_BROWN]);
    const ROCK_IDS = new Set([B.STONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.ANDESITE,
      B.TUFF, B.DEEPSLATE, B.COBBLED_DEEPSLATE, B.GRANITE, B.DIORITE]);
    // soft vegetation we may stomp where structures must pass (bridge deck, rails)
    const SOFT_IDS = new Set([...PLANT_IDS, B.SUGAR_CANE, B.BAMBOO, B.SEAGRASS]);

    const PLAZA = [116, 120, 172, 172];
    function inPlaza(x, z) { return x >= PLAZA[0] && z >= PLAZA[1] && x <= PLAZA[2] && z <= PLAZA[3]; }

    /* ---------------- surgical primitives ---------------- */
    // ground cell is claimable if it is still grass, or air (terrain not yet in bundle)
    function grassy(x, z) { const g = W.get(x, GY, z); return g === GRASS || g === AIR; }
    function airCol(x, z, y1, y2) {
      for (let y = y1; y <= y2; y++) if (W.get(x, y, z) !== AIR) return false;
      return true;
    }
    function pathBlk() { return rnd() < 0.6 ? B.DIRT_PATH : pick(PATH_MIX); }
    // replace a grass top with path material; inside our own plaza also stomp plants
    function carve(x, z, id) {
      if (!grassy(x, z)) return false;
      W.set(x, GY, z, id == null ? pathBlk() : id);
      if (inPlaza(x, z) && PLANT_IDS.has(W.get(x, GY + 1, z))) W.set(x, GY + 1, z, AIR);
      return true;
    }
    function tryLamp(x, z) {
      if (!grassy(x, z)) return false;
      if (PLANT_IDS.has(W.get(x, GY + 1, z))) W.set(x, GY + 1, z, AIR); // stomp a tuft
      if (airCol(x, z, GY + 1, GY + 3)) { W.lampPost(x, GY + 1, z); return true; }
      return false;
    }
    function sideDecor(x, z) {
      if (!grassy(x, z) || W.get(x, GY + 1, z) !== AIR) return;
      const r = rnd();
      if (r < 0.06) W.torch(x, GY + 1, z);            // ground torches at path edges
      else if (r < 0.30) W.set(x, GY + 1, z, pick(FLOWERS));
    }
    // surface for free-standing decor: y to place at, honoring hills; null = blocked
    function surfY(x, z) {
      const t = W.topY(x, z);
      if (t < 0) return GY + 1;                       // empty dev world — terrain lands later
      if (W.get(x, t, z) === GRASS) return t + 1;
      return null;
    }
    function decor(x, z, id) {
      const y = surfY(x, z);
      if (y != null && W.get(x, y, z) === AIR) { W.set(x, y, z, id); return true; }
      return false;
    }
    function clearPlazaPlants(x1, z1, x2, z2) {
      for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++)
        if (inPlaza(x, z) && PLANT_IDS.has(W.get(x, GY + 1, z))) W.set(x, GY + 1, z, AIR);
    }

    /* =====================================================================
     * 1. CENTRAL PLAZA
     * ===================================================================== */
    const CX = 144, CZ = 146; // spawn centerpiece

    /* ---- compass platform: concentric rings at y=32 ---- */
    clearPlazaPlants(CX - 9, CZ - 9, CX + 9, CZ + 9);
    W.disc(CX, GY, CZ, 8.4, B.DEEPSLATE_TILES);       // outer trim ring
    W.disc(CX, GY, CZ, 7.4, B.SMOOTH_STONE);
    W.disc(CX, GY, CZ, 5.4, B.POLISHED_ANDESITE);
    W.disc(CX, GY, CZ, 3.4, B.SMOOTH_STONE);
    W.disc(CX, GY, CZ, 1.6, B.DEEPSLATE_TILES);
    // compass spokes N/S/E/W
    for (let d = 2; d <= 8; d++) {
      W.set(CX, GY, CZ - d, B.DEEPSLATE_TILES); W.set(CX, GY, CZ + d, B.DEEPSLATE_TILES);
      W.set(CX - d, GY, CZ, B.DEEPSLATE_TILES); W.set(CX + d, GY, CZ, B.DEEPSLATE_TILES);
    }
    // 4 sea-lantern inlays flush in the floor at the diagonals
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]])
      W.set(CX + dx, GY, CZ + dz, B.SEA_LANTERN);
    // raised 3x3 chiseled dais + lodestone
    W.fill(CX - 1, GY + 1, CZ - 1, CX + 1, GY + 1, CZ + 1, B.CHISELED_STONE_BRICKS);
    W.set(CX, GY + 2, CZ, B.LODESTONE);
    // 4 lamp posts on the platform
    for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]])
      W.lampPost(CX + dx, GY + 1, CZ + dz);

    /* ---- community bulletin board (faces north, toward the shops path) ---- */
    clearPlazaPlants(131, 125, 137, 128);
    W.fencePost(132, GY + 1, 127, 'DARK_OAK_PLANKS');
    W.fencePost(136, GY + 1, 127, 'DARK_OAK_PLANKS');
    W.fill(132, GY + 2, 127, 136, GY + 3, 127, B.DARK_OAK_PLANKS);
    W.fill(133, GY + 2, 127, 135, GY + 2, 127, B.BULLETIN);
    for (let x = 133; x <= 135; x++) W.set(x, GY + 3, 126, B.SIGN_WALL_S); // pinned notes
    W.set(132, GY + 4, 127, B.LANTERN);
    W.set(136, GY + 4, 127, B.LANTERN);

    /* ---- armor-stand gallery on a slab podium, east of the board ---- */
    clearPlazaPlants(144, 124, 148, 125);
    for (let z = 124; z <= 125; z++) for (let x = 144; x <= 148; x++)
      W.slab(x, GY + 1, z, 'SMOOTH_STONE');
    for (const x of [144, 146, 148]) W.set(x, GY + 2, 124, B.ARMOR_STAND);
    W.torch(143, GY + 1, 125); W.torch(149, GY + 1, 125);

    /* ---- 4 flower planters (5x3 slab rims around dirt) + stair benches ---- */
    function planter(cx, cz, benchSide) { // benchSide: -1 bench north of it, +1 south
      clearPlazaPlants(cx - 2, cz - 1, cx + 2, cz + 1);
      for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 2; x <= cx + 2; x++) {
        const rim = (x === cx - 2 || x === cx + 2 || z === cz - 1 || z === cz + 1);
        if (rim) W.slab(x, GY + 1, z, 'STONE_BRICKS');
        else W.set(x, GY + 1, z, B.DIRT);
      }
      const blooms = [B.TULIP_RED, B.ROSE_BUSH, B.FLOWERING_AZALEA_LEAVES,
        B.TULIP_PINK, B.AZALEA_LEAVES];
      for (let x = cx - 1; x <= cx + 1; x++) W.set(x, GY + 2, cz, pick(blooms));
      // bench: 3 spruce stairs facing the planter
      const bz = cz + benchSide * 3;
      const dir = benchSide > 0 ? 'S' : 'N'; // stair high side = seat back, away from planter
      clearPlazaPlants(cx - 1, bz, cx + 1, bz);
      for (let x = cx - 1; x <= cx + 1; x++) W.chair(x, GY + 1, bz, 'SPRUCE_PLANKS', dir);
    }
    planter(130, 130, +1); planter(158, 130, +1);
    planter(126, 162, -1); planter(160, 162, -1);

    /* ---- fountain: 5x5 stone-brick basin, NW of the platform ---- */
    (function fountain() {
      const fx = 126, fz = 134; // center; footprint 124..128 x 132..136
      clearPlazaPlants(fx - 2, fz - 2, fx + 2, fz + 2);
      W.fill(fx - 2, GY, fz - 2, fx + 2, GY, fz + 2, B.STONE_BRICKS);     // basin floor
      W.walls(fx - 2, GY + 1, fz - 2, fx + 2, GY + 1, fz + 2, B.STONE_BRICKS); // rim
      W.fill(fx - 1, GY + 1, fz - 1, fx + 1, GY + 1, fz + 1, B.WATER);    // water inside rim
      W.set(fx, GY + 1, fz, B.wall('STONE_BRICKS'));                      // center pillar
      W.set(fx, GY + 2, fz, B.wall('STONE_BRICKS'));
      W.set(fx, GY + 3, fz, B.WATER);                                     // jet on top
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]])
        W.set(fx + dx, GY + 2, fz + dz, B.LANTERN);                       // 4 corner lanterns
      for (const [dx, dz] of [[0, -2], [0, 2], [-2, 0], [2, 0]])
        W.slab(fx + dx, GY + 2, fz + dz, 'STONE_BRICKS');                 // rim slab accents
    })();

    /* ---- nether portal corner, plaza south-east ---- */
    (function portal() {
      clearPlazaPlants(159, 164, 168, 171);
      for (let z = 165; z <= 171; z++) for (let x = 159; x <= 168; x++)   // gravel pad
        if (rnd() < 0.55) carve(x, z, B.GRAVEL);
      for (let x = 162; x <= 165; x++) carve(x, 168, B.GRAVEL);           // under the frame
      // obsidian frame 4 wide x 5 tall at z=168
      W.fill(162, GY + 1, 168, 165, GY + 1, 168, B.OBSIDIAN);
      W.fill(162, GY + 5, 168, 165, GY + 5, 168, B.OBSIDIAN);
      W.fill(162, GY + 2, 168, 162, GY + 4, 168, B.OBSIDIAN);
      W.fill(165, GY + 2, 168, 165, GY + 4, 168, B.OBSIDIAN);
      W.set(162, GY + 1, 168, B.CRYING_OBSIDIAN);                         // accents
      W.set(165, GY + 5, 168, B.CRYING_OBSIDIAN);
      W.fill(163, GY + 2, 168, 164, GY + 4, 168, B.NETHER_PORTAL);
      W.set(161, GY + 1, 168, B.SOUL_LANTERN);                            // flanking
      W.set(166, GY + 1, 168, B.SOUL_LANTERN);
      for (const [px, pz] of [[160, 170], [167, 166]]) {                  // soul lantern posts
        W.fencePost(px, GY + 1, pz, 'SPRUCE_PLANKS');
        W.set(px, GY + 2, pz, B.SOUL_LANTERN);
      }
      carve(161, 170, B.NETHERRACK); carve(166, 169, B.NETHERRACK);
      carve(163, 171, B.NETHERRACK);
    })();

    /* ---- creeper topiary in a small NW corner planter ---- */
    (function creeper() {
      const cx = 120, cz = 124;
      clearPlazaPlants(cx - 1, cz - 1, cx + 1, cz + 1);
      for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (x === cx && z === cz) W.set(x, GY + 1, z, B.DIRT);
        else W.slab(x, GY + 1, z, 'STONE_BRICKS');
      }
      W.set(cx, GY + 2, cz, B.WOOL_LIME);
      W.set(cx, GY + 3, cz, B.WOOL_LIME);
      W.set(cx, GY + 4, cz, B.WOOL_LIME);           // head
      W.set(cx, GY + 4, cz + 1, B.WOOL_BLACK);      // face block, looking into the plaza
    })();

    /* =====================================================================
     * 2 + 3. PATHS with lighting (lamp every ~9, alternating sides)
     * ===================================================================== */
    function lane(pts, w) {
      const hw = (w - 1) >> 1;
      let step = 0, lampSide = 1;
      for (let i = 0; i + 1 < pts.length; i++) {
        let x = pts[i][0], z = pts[i][1];
        const x2 = pts[i + 1][0], z2 = pts[i + 1][1];
        const dx = Math.sign(x2 - x), dz = Math.sign(z2 - z);
        const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0; // perpendicular axis
        for (;;) {
          for (let o = -hw; o <= hw; o++) carve(x + px * o, z + pz * o);
          step++;
          if (step % 9 === 0) {
            lampSide = -lampSide;
            tryLamp(x + px * (hw + 1) * lampSide, z + pz * (hw + 1) * lampSide);
          } else if (rnd() < 0.20) {
            const s = rnd() < 0.5 ? 1 : -1;
            sideDecor(x + px * (hw + 1) * s, z + pz * (hw + 1) * s);
          }
          if (x === x2 && z === z2) break;
          x += dx; z += dz;
        }
      }
    }

    // plaza -> shops gate (north, x~140; stub 3 into shops plot to z=114)
    lane([[140, 139], [140, 114]], 3);
    // plaza -> poor tower: west past the fountain, down the x~104 corridor,
    // west along z~194 into the tower plot edge (stub to x=98)
    lane([[136, 146], [104, 146], [104, 194], [98, 194]], 3);
    // plaza -> modern entrance: east along z~150, north along x~207, stub to z=119
    lane([[153, 150], [207, 150], [207, 119]], 3);
    // plaza -> bee: south with a westward dogleg to x~130, stub to z=178
    lane([[144, 155], [144, 162], [130, 162], [130, 178]], 3);
    // plaza -> football: south past the portal corner, east above the pond,
    // down the pond's east side, then east toward the pitch's west entrance
    lane([[170, 152], [170, 178], [184, 178], [184, 204], [192, 204]], 3);

    /* ---- pond loop: 1-wide stepping-stone ring just outside the pond plot ---- */
    (function pondLoop() {
      const x1 = 153, z1 = 183, x2 = 183, z2 = 223;
      for (let x = x1; x <= x2; x++) {
        if (rnd() < 0.78) carve(x, z1);
        if (rnd() < 0.78) carve(x, z2);
      }
      for (let z = z1 + 1; z < z2; z++) {
        if (rnd() < 0.78) carve(x1, z);
        if (rnd() < 0.78) carve(x2, z);
      }
      tryLamp(168, 181); tryLamp(184, 224); tryLamp(154, 224);
    })();

    /* ---- bridge where the east path crosses the pond's outlet stream ---- */
    (function bridge() {
      const wet = [];
      for (let x = 168; x <= 196; x++) {
        let hit = false;
        for (let z = 149; z <= 151 && !hit; z++)
          for (let y = 26; y <= 31 && !hit; y++)
            if (W.get(x, y, z) === WATER) hit = true;
        if (hit) wet.push(x);
      }
      if (!wet.length) return; // no stream found — skip gracefully
      const s = Math.min.apply(null, wet) - 1, e = Math.max.apply(null, wet) + 1;
      for (let x = s; x <= e; x++)             // stomp reeds/tufts in the deck corridor
        for (let z = 149; z <= 151; z++) for (let y = GY + 1; y <= GY + 4; y++)
          if (SOFT_IDS.has(W.get(x, y, z))) W.set(x, y, z, AIR);
      for (let z = 149; z <= 151; z++) {
        if (W.get(s, GY + 1, z) === AIR) W.stair(s, GY + 1, z, 'OAK_PLANKS', 'E');
        if (W.get(e, GY + 1, z) === AIR) W.stair(e, GY + 1, z, 'OAK_PLANKS', 'W');
        for (let x = s + 1; x < e; x++)
          if (W.get(x, GY + 2, z) === AIR) W.set(x, GY + 2, z, B.OAK_PLANKS);
      }
      for (let x = s + 1; x < e; x++) { // fence railings on the outer deck rows
        if (W.get(x, GY + 3, 149) === AIR) W.fencePost(x, GY + 3, 149, 'OAK_PLANKS');
        if (W.get(x, GY + 3, 151) === AIR) W.fencePost(x, GY + 3, 151, 'OAK_PLANKS');
      }
      const mid = (s + e) >> 1; // 2 lanterns on the mid railing posts
      if (W.get(mid, GY + 4, 149) === AIR) W.set(mid, GY + 4, 149, B.LANTERN);
      if (W.get(mid, GY + 4, 151) === AIR) W.set(mid, GY + 4, 151, B.LANTERN);
    })();

    /* =====================================================================
     * 4. MINECART LINE — scenic southern straight, x 60..200 at z=228
     * ===================================================================== */
    (function railLine() {
      for (let x = 60; x <= 200; x++) {
        for (let z = 227; z <= 229; z++) carve(x, z, B.GRAVEL);     // gravel bed
        if (W.get(x, GY, 228) === B.GRAVEL && W.get(x, GY + 1, 228) === AIR)
          W.set(x, GY + 1, 228, B.RAIL_X);                          // skip blocked cells
        if ((x - 60) % 12 === 0) tryLamp(x, 231);                   // fence+lantern posts
      }
      // tiny station platform at x~150
      const sx1 = 147, sx2 = 153, sz1 = 230, sz2 = 232;
      for (let z = sz1; z <= sz2; z++) for (let x = sx1; x <= sx2; x++)
        if (grassy(x, z) && W.get(x, GY + 1, z) === AIR) W.set(x, GY + 1, z, B.SMOOTH_STONE);
      for (const [px, pz] of [[sx1, sz1], [sx2, sz1], [sx1, sz2], [sx2, sz2]]) {
        W.fencePost(px, GY + 2, pz, 'SPRUCE_PLANKS');
        W.fencePost(px, GY + 3, pz, 'SPRUCE_PLANKS');
        W.fencePost(px, GY + 4, pz, 'SPRUCE_PLANKS');
      }
      for (let z = sz1 - 1; z <= sz2 + 1; z++) for (let x = sx1 - 1; x <= sx2 + 1; x++)
        if (W.get(x, GY + 5, z) === AIR) W.slab(x, GY + 5, z, 'SPRUCE_PLANKS');
      W.set(148, GY + 2, 231, B.CHEST);
      W.set(152, GY + 2, 230, B.SIGN);
      W.set(150, GY + 4, 231, B.LANTERN_HANGING);
      W.chair(150, GY + 2, 232, 'SPRUCE_PLANKS', 'S'); // bench facing the rails
      W.chair(151, GY + 2, 232, 'SPRUCE_PLANKS', 'S');
      W.slab(146, GY + 1, 231, 'SMOOTH_STONE');        // step up from the west
    })();

    /* =====================================================================
     * 5. ANIMAL STATUES & PLAYER TOUCHES
     * ===================================================================== */
    // cells: [dx, dy, dz, id]; base y from surface, all target cells must be air
    function statue(x, z, cells) {
      const sy = surfY(x, z);
      if (sy == null) return false;
      for (const c of cells) {
        if (c[1] === 0 && surfY(x + c[0], z + c[2]) !== sy) return false; // uneven ground
        if (W.get(x + c[0], sy + c[1], z + c[2]) !== AIR) return false;
      }
      for (const c of cells) W.set(x + c[0], sy + c[1], z + c[2], c[3]);
      return true;
    }
    const WW = B.WOOL_WHITE, WB = B.WOOL_BROWN;
    function sheep(x, z) {
      return statue(x, z, [[0, 0, 0, WW], [1, 0, 0, WW], [0, 1, 0, WW]]);
    }
    function cow(x, z) {
      return statue(x, z, [[0, 0, 0, WB], [1, 0, 0, WW], [0, 1, 0, WB]]);
    }
    function wolf(x, z) { // sitting: body 2 long, head up front, red collar carpet
      return statue(x, z, [[0, 0, 0, WW], [0, 0, 1, WW], [0, 1, 0, WW], [0, 1, 1, B.CARPET_RED]]);
    }
    // sheep near the poor-tower pens and southern hills
    sheep(104, 206); sheep(102, 215); sheep(76, 238);
    // cows grazing on the open grass east of the plaza
    cow(190, 158); cow(195, 163);
    // two tamed wolves sitting by the plaza's south-east benches
    wolf(155, 156); wolf(150, 158);

    /* =====================================================================
     * 6. EXTRA VEGETATION & WEAR
     * ===================================================================== */
    // moss / mossy cobble wear patches along the plaza edges
    for (let i = 0; i < 70; i++) {
      const edge = (rnd() * 4) | 0;
      let x, z;
      if (edge === 0) { x = 116 + ((rnd() * 57) | 0); z = 120 + ((rnd() * 3) | 0); }
      else if (edge === 1) { x = 116 + ((rnd() * 57) | 0); z = 170 + ((rnd() * 3) | 0); }
      else if (edge === 2) { x = 116 + ((rnd() * 3) | 0); z = 120 + ((rnd() * 53) | 0); }
      else { x = 170 + ((rnd() * 3) | 0); z = 120 + ((rnd() * 53) | 0); }
      carve(x, z, rnd() < 0.6 ? B.MOSS_BLOCK : B.MOSSY_COBBLESTONE);
    }
    // mushrooms in shadowed spots hugging building plot edges
    const shroomSpots = [[103, 118], [121, 118], [167, 117], [98, 118],
      [198, 60], [198, 82], [198, 104], [102, 180], [102, 199], [102, 221],
      [106, 190], [154, 180], [174, 121], [130, 118], [186, 170]];
    for (const [mx, mz] of shroomSpots)
      if (rnd() < 0.8) decor(mx, mz, rnd() < 0.5 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN);
    // jack-o-lantern accents beside paths
    decor(127, 175, B.JACK_O_LANTERN);
    decor(144, 234, B.JACK_O_LANTERN);
    decor(184, 182, B.JACK_O_LANTERN);
    // vines on hill rock faces around the map edges
    for (let i = 0; i < 260; i++) {
      const band = (rnd() * 4) | 0;
      let x, z;
      if (band === 0) { x = (rnd() * 40) | 0; z = (rnd() * 288) | 0; }
      else if (band === 1) { x = 287 - ((rnd() * 40) | 0); z = (rnd() * 288) | 0; }
      else if (band === 2) { z = (rnd() * 40) | 0; x = (rnd() * 288) | 0; }
      else { z = 287 - ((rnd() * 40) | 0); x = (rnd() * 288) | 0; }
      const y = GY + 2 + ((rnd() * 28) | 0);
      if (!ROCK_IDS.has(W.get(x, y, z))) continue;
      // hang a vine on one air face; VINE_<dir> = direction of the wall behind it
      if (W.get(x, y, z - 1) === AIR) W.set(x, y, z - 1, B.VINE_S);
      else if (W.get(x, y, z + 1) === AIR) W.set(x, y, z + 1, B.VINE_N);
      else if (W.get(x - 1, y, z) === AIR) W.set(x - 1, y, z, B.VINE_E);
      else if (W.get(x + 1, y, z) === AIR) W.set(x + 1, y, z, B.VINE_W);
    }
    // lily pads on open water (pond + stream); below must be water, above air
    for (let z = 100; z <= 240; z++) for (let x = 140; x <= 200; x++) {
      for (let y = GY - 4; y <= GY - 1; y++) {
        if (W.get(x, y, z) === WATER && W.get(x, y + 1, z) === AIR) {
          if (rnd() < 0.06) W.set(x, y + 1, z, B.LILY_PAD);
          break;
        }
      }
    }
    // a few scattered flower tufts on open meadows between the plots
    const meadows = [[104, 130, 114, 165], [174, 120, 196, 168], [104, 226, 150, 240],
      [186, 208, 196, 224], [154, 226, 182, 240]];
    for (const [mx1, mz1, mx2, mz2] of meadows) {
      const n = 6 + ((rnd() * 6) | 0);
      for (let i = 0; i < n; i++) {
        const x = mx1 + ((rnd() * (mx2 - mx1 + 1)) | 0);
        const z = mz1 + ((rnd() * (mz2 - mz1 + 1)) | 0);
        decor(x, z, pick(FLOWERS));
      }
    }
  });
})();
