/* =========================================================================
 * 14_poor_grounds — P5 GROUNDS for the poor residential complex.
 * Everything OUTSIDE the building footprint (x64..88 (+89 overhangs),
 * z178..214) but inside the plot [52,168,100,232]:
 *   - fenced animal pen (x66..74, z218..226): wool cow + sheep statues,
 *     hay bales, composter trough, gate, corner lanterns
 *   - campfire circle with log seats
 *   - two kitchen gardens (log edging, coarse-dirt rows, wheat/carrots/
 *     potatoes) flanking the front paths, scarecrow
 *   - dirt-path patches (replace GRASS at y=32 only): front doors east to
 *     x=100 at z~195 and z~205, and around the north side to the lava
 *     pool side (keep-out: x60..64, z180..186 + 2-block lava buffer)
 *   - lamp posts along the front line x~92 + around the yard,
 *     freestanding torch posts like the reference
 *   - log pile, crates near the colonnade, covered well, pumpkin patch
 *   - 2-3 trees near the west plot edge, azalea bushes
 *   - tall grass / flower scatter; moss + mushrooms on the shaded west side
 * Surgical: only replaces GRASS at y=32; only places decor where y=33 is
 * air (stomping lone grass tufts first). Never writes into the lava zone.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('poor_grounds', 14, [52, 168, 100, 232], function (W, B) {
    'use strict';
    const GY = W.GROUND;          // 32
    const AIR = 0;

    /* ---------------- deterministic rng ---------------- */
    let _s = 0x9500D5 | 0;
    function rnd() {
      _s = (_s + 0x6D2B79F5) | 0;
      let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function pick(a) { return a[(rnd() * a.length) | 0]; }

    /* ---------------- cached ids / sets ---------------- */
    const GRASS = B.GRASS;
    const PLANT_IDS = new Set([B.TALL_GRASS, B.FERN, B.POPPY, B.DANDELION,
      B.TULIP_RED, B.TULIP_WHITE, B.TULIP_PINK, B.CORNFLOWER, B.OXEYE_DAISY,
      B.ALLIUM, B.LILY_OF_VALLEY, B.ROSE_BUSH, B.SWEET_BERRY_BUSH, B.DEAD_BUSH,
      B.MUSHROOM_RED, B.MUSHROOM_BROWN]);
    const FLOWERS = [B.TALL_GRASS, B.TALL_GRASS, B.TALL_GRASS, B.FERN,
      B.POPPY, B.DANDELION, B.TULIP_RED, B.CORNFLOWER, B.OXEYE_DAISY, B.ALLIUM];

    // lava keep-out: pool/channel x60..64, z180..186 (+2 buffer, lava @ 63,183)
    function banned(x, z) { return x >= 58 && x <= 66 && z >= 178 && z <= 188; }
    // building footprint (incl. x89 overhang line) — never touch these columns
    function inBuilding(x, z) { return x >= 64 && x <= 89 && z >= 178 && z <= 214; }
    function offLimits(x, z) { return banned(x, z) || inBuilding(x, z) || z >= 227; }

    /* ---------------- surgical primitives ---------------- */
    function grassy(x, z) { const g = W.get(x, GY, z); return g === GRASS || g === AIR; }
    function stomp(x, z) { if (PLANT_IDS.has(W.get(x, GY + 1, z))) W.set(x, GY + 1, z, AIR); }
    function airCol(x, z, y1, y2) {
      for (let y = y1; y <= y2; y++) if (W.get(x, y, z) !== AIR) return false;
      return true;
    }
    function carve(x, z, id) {          // replace a GRASS top at y=32 only
      if (offLimits(x, z) || !grassy(x, z)) return false;
      W.set(x, GY, z, id); stomp(x, z); return true;
    }
    function decor(x, z, id) {          // 1-high decor on grass, y33 must be air
      if (offLimits(x, z) || !grassy(x, z)) return false;
      stomp(x, z);
      if (W.get(x, GY + 1, z) !== AIR) return false;
      W.set(x, GY + 1, z, id); return true;
    }
    function lamp(x, z) {
      if (offLimits(x, z) || !grassy(x, z)) return false;
      stomp(x, z);
      if (!airCol(x, z, GY + 1, GY + 3)) return false;
      W.lampPost(x, GY + 1, z); return true;
    }
    function torchPost(x, z) {          // freestanding fence + torch (reference look)
      if (offLimits(x, z) || !grassy(x, z)) return false;
      stomp(x, z);
      if (!airCol(x, z, GY + 1, GY + 2)) return false;
      W.fencePost(x, GY + 1, z, 'SPRUCE_PLANKS');
      W.set(x, GY + 2, z, B.TORCH); return true;
    }
    function groundTorch(x, z) {
      if (offLimits(x, z) || !grassy(x, z)) return false;
      stomp(x, z);
      if (W.get(x, GY + 1, z) !== AIR) return false;
      W.torch(x, GY + 1, z); return true;
    }

    /* =====================================================================
     * 1. DIRT PATHS (y=32 grass replacement only)
     * ===================================================================== */
    function pathBlk() {
      const r = rnd();
      if (r < 0.60) return B.DIRT_PATH;
      if (r < 0.74) return B.COARSE_DIRT;
      if (r < 0.86) return B.COBBLESTONE;
      if (r < 0.94) return B.GRAVEL;
      return B.MOSSY_COBBLESTONE;
    }
    function pathRect(x1, z1, x2, z2) {
      for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++)
        carve(x, z, pathBlk());
      // ragged edges — scattered single patches just outside the lane
      for (let x = x1; x <= x2; x++) {
        if (rnd() < 0.22) carve(x, z1 - 1, pathBlk());
        if (rnd() < 0.22) carve(x, z2 + 1, pathBlk());
      }
      for (let z = z1; z <= z2; z++) {
        if (rnd() < 0.22) carve(x1 - 1, z, pathBlk());
        if (rnd() < 0.22) carve(x2 + 1, z, pathBlk());
      }
    }
    // front door (x88, z195) east to the plot edge — meets the plaza path
    pathRect(89, 194, 100, 196);
    // colonnade center arch east to the plot edge
    pathRect(89, 204, 100, 206);
    // around the building's north side to the lava-pool side (west yard)
    pathRect(90, 176, 91, 193);        // up the NE corner
    pathRect(58, 174, 91, 175);        // along the north face
    pathRect(56, 176, 57, 189);        // down the west side toward the pool
    // stray stepping-stone patches wandering the south yard (reference look)
    for (const [sx, sz] of [[93, 198], [95, 201], [97, 209], [88, 217], [84, 215],
      [79, 216], [75, 217], [70, 216], [70, 217], [65, 218], [61, 214], [58, 206]])
      carve(sx, sz, pathBlk());

    /* =====================================================================
     * 2. FENCED ANIMAL PEN  x66..74, z218..226 (gate gap at x70, z218)
     * ===================================================================== */
    (function pen() {
      for (let x = 66; x <= 74; x++) {
        if (x !== 70) { stomp(x, 218); W.fencePost(x, GY + 1, 218, 'OAK_PLANKS'); }
        stomp(x, 226); W.fencePost(x, GY + 1, 226, 'OAK_PLANKS');
      }
      for (let z = 219; z <= 225; z++) {
        stomp(66, z); W.fencePost(66, GY + 1, z, 'OAK_PLANKS');
        stomp(74, z); W.fencePost(74, GY + 1, z, 'OAK_PLANKS');
      }
      // corner lantern posts + torches flanking the gate
      for (const [cx, cz] of [[66, 218], [74, 226]]) {
        W.fencePost(cx, GY + 2, cz, 'OAK_PLANKS');
        W.set(cx, GY + 3, cz, B.LANTERN);
      }
      W.set(69, GY + 2, 218, B.TORCH);
      W.set(71, GY + 2, 218, B.TORCH);
      // trampled floor patches
      const MUD = [B.COARSE_DIRT, B.COARSE_DIRT, B.DIRT, B.PODZOL];
      for (let z = 219; z <= 225; z++) for (let x = 67; x <= 73; x++)
        if (rnd() < 0.45) carve(x, z, pick(MUD));
      // hay bales (one stacked) + composter trough + water cauldron
      decor(67, 219, B.HAY_BALE); decor(68, 219, B.HAY_BALE);
      if (W.get(67, GY + 2, 219) === AIR) W.set(67, GY + 2, 219, B.HAY_BALE);
      decor(73, 220, B.COMPOSTER); decor(73, 221, B.COMPOSTER);
      decor(73, 222, B.CAULDRON);
      // gate path + sign
      carve(70, 217, B.DIRT_PATH); carve(70, 216, B.COARSE_DIRT);
      decor(71, 217, B.SIGN);
    })();

    /* ---- chunky wool statues (each cell verified air first) ---- */
    function statue(cells) {
      for (const c of cells) if (W.get(c[0], c[1], c[2]) !== AIR) return false;
      for (const c of cells) W.set(c[0], c[1], c[2], c[3]);
      return true;
    }
    const BR = B.WOOL_BROWN, WH = B.WOOL_WHITE;
    // cow: brown, white saddle patch, head low at the west end
    statue([[68, 33, 222, BR], [70, 33, 222, BR],
      [68, 34, 222, BR], [69, 34, 222, WH], [70, 34, 222, BR],
      [67, 34, 222, BR]]);
    // sheep: white loaf + head east
    statue([[70, 33, 225, WH], [71, 33, 225, WH],
      [70, 34, 225, WH], [71, 34, 225, WH], [72, 34, 225, WH]]);
    // lamb by the hay
    statue([[70, 33, 219, WH], [70, 34, 219, WH], [71, 34, 219, WH]]);

    /* =====================================================================
     * 3. CAMPFIRE CIRCLE with log seats (south yard)
     * ===================================================================== */
    (function campfire() {
      const cx = 79, cz = 222;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (d <= 1) carve(cx + dx, cz + dz, B.STONE);
        else if (d <= 3 && rnd() < 0.7)
          carve(cx + dx, cz + dz, rnd() < 0.5 ? B.COBBLESTONE : B.GRAVEL);
      }
      decor(cx, cz, B.CAMPFIRE);
      decor(cx - 2, cz, B.OAK_LOG); decor(cx + 2, cz, B.OAK_LOG);
      decor(cx, cz - 2, B.SPRUCE_LOG);
      decor(cx - 1, cz + 2, B.OAK_LOG); decor(cx, cz + 2, B.OAK_LOG);
    })();

    /* =====================================================================
     * 4. KITCHEN GARDENS — log edging, coarse-dirt rows, crops
     * ===================================================================== */
    function garden(x1, z1, x2, z2, rows) {
      for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
        const border = (x === x1 || x === x2 || z === z1 || z === z2);
        if (border) { decor(x, z, rnd() < 0.85 ? B.OAK_LOG : B.SPRUCE_LOG); continue; }
        carve(x, z, rnd() < 0.72 ? B.COARSE_DIRT : B.DIRT);
        let crop = rows[(z - z1 - 1) % rows.length];
        if (crop === B.WHEAT && rnd() < 0.18) crop = B.WHEAT_YOUNG;
        if (rnd() < 0.9) decor(x, z, crop);
      }
    }
    // south garden, between the z~205 path and the log pile
    garden(90, 209, 97, 214, [B.WHEAT, B.CARROTS, B.POTATOES, B.WHEAT]);
    // north garden, between the z~195 path and the NE corner path
    garden(93, 184, 99, 190, [B.CARROTS, B.WHEAT, B.POTATOES, B.WHEAT, B.CARROTS]);
    // scarecrow in the north garden (jack-o-lantern head glows at night)
    if (airCol(96, 187, GY + 1, GY + 3)) {
      W.fencePost(96, GY + 1, 187, 'OAK_PLANKS');
      W.fencePost(96, GY + 2, 187, 'OAK_PLANKS');
      W.set(96, GY + 3, 187, B.JACK_O_LANTERN);
    }
    // small pumpkin patch in the north yard
    (function pumpkins() {
      for (let z = 169; z <= 173; z++) for (let x = 77; x <= 81; x++)
        if (rnd() < 0.5) carve(x, z, rnd() < 0.6 ? B.COARSE_DIRT : B.PODZOL);
      decor(78, 170, B.PUMPKIN); decor(80, 172, B.PUMPKIN);
      decor(79, 171, B.MELON); decor(77, 172, B.SWEET_BERRY_BUSH);
      decor(81, 169, B.SWEET_BERRY_BUSH);
    })();

    /* =====================================================================
     * 5. WELL (covered, south yard) + LOG PILE + CRATES
     * ===================================================================== */
    (function well() {
      const wx = 85, wz = 219;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        stomp(wx + dx, wz + dz);
        if (W.get(wx + dx, GY + 1, wz + dz) === AIR)
          W.set(wx + dx, GY + 1, wz + dz, rnd() < 0.7 ? B.COBBLESTONE : B.MOSSY_COBBLESTONE);
      }
      W.set(wx, GY, wz, B.STONE);           // shaft bottom
      W.set(wx, GY + 1, wz, B.WATER);       // water held by the cobble rim
      W.fencePost(wx - 1, GY + 2, wz, 'SPRUCE_PLANKS');
      W.fencePost(wx - 1, GY + 3, wz, 'SPRUCE_PLANKS');
      W.fencePost(wx + 1, GY + 2, wz, 'SPRUCE_PLANKS');
      W.fencePost(wx + 1, GY + 3, wz, 'SPRUCE_PLANKS');
      W.set(wx, GY + 3, wz, B.LANTERN_HANGING);   // hangs under the roof
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
        W.slab(wx + dx, GY + 4, wz + dz, 'SPRUCE_PLANKS');
    })();

    (function logPile() {              // horizontal log stack by the SE corner
      for (let z = 216; z <= 217; z++) for (let x = 90; x <= 93; x++)
        decor(x, z, rnd() < 0.6 ? B.OAK_LOG : B.SPRUCE_LOG);
      for (const [lx, lz] of [[91, 216], [92, 216], [93, 216], [90, 217], [91, 217]])
        if (W.get(lx, GY + 2, lz) === AIR && W.get(lx, GY + 1, lz) !== AIR)
          W.set(lx, GY + 2, lz, rnd() < 0.6 ? B.OAK_LOG : B.SPRUCE_LOG);
      if (W.get(92, GY + 3, 216) === AIR && W.get(92, GY + 2, 216) !== AIR)
        W.set(92, GY + 3, 216, B.OAK_LOG);
    })();

    // crates near the colonnade (between the arches, clear of awning posts)
    decor(90, 197, B.CHEST); decor(90, 198, B.BARREL); decor(91, 198, B.BARREL);
    if (W.get(90, GY + 2, 198) === AIR && W.get(90, GY + 1, 198) !== AIR)
      W.set(90, GY + 2, 198, B.BARREL);
    decor(90, 202, B.CHEST); decor(90, 203, B.BARREL);
    decor(91, 213, B.BARREL); decor(90, 216, B.CHEST);

    /* =====================================================================
     * 6. LIGHTING — lamp posts (front line x~92 + yard) and torch posts
     * ===================================================================== */
    lamp(92, 182); lamp(92, 199); lamp(95, 216);       // front line
    lamp(99, 192); lamp(99, 208);                      // path ends at plot edge
    lamp(75, 216); lamp(80, 171); lamp(60, 205);       // yard + west side
    lamp(87, 224);                                     // by the well/pen lane
    torchPost(91, 219); torchPost(68, 215); torchPost(88, 172);
    torchPost(94, 199); torchPost(55, 192); torchPost(63, 210);
    torchPost(77, 225);
    // plain torches stuck in the ground near paths, like the reference
    groundTorch(94, 193); groundTorch(97, 197); groundTorch(96, 207);
    groundTorch(89, 175); groundTorch(72, 214); groundTorch(57, 173);
    groundTorch(82, 216); groundTorch(65, 221); groundTorch(98, 211);

    /* =====================================================================
     * 7. TREES (west edge, >=3 from plot edges) + AZALEA BUSHES
     * ===================================================================== */
    if (grassy(57, 171) && airCol(57, 171, GY + 1, GY + 6)) { stomp(57, 171); W.tree(57, GY + 1, 171, 'spruce'); }
    if (grassy(56, 205) && airCol(56, 205, GY + 1, GY + 6)) { stomp(56, 205); W.tree(56, GY + 1, 205, 'oak'); }
    if (grassy(58, 221) && airCol(58, 221, GY + 1, GY + 6)) { stomp(58, 221); W.tree(58, GY + 1, 221, 'birch'); }
    function azalea(x, z, flowering) {
      const id = flowering ? B.FLOWERING_AZALEA_LEAVES : B.AZALEA_LEAVES;
      decor(x, z, id); decor(x + 1, z, B.AZALEA_LEAVES);
      if (W.get(x, GY + 2, z) === AIR && W.get(x, GY + 1, z) !== AIR)
        W.set(x, GY + 2, z, id);
    }
    azalea(61, 200, true); azalea(76, 215, false); azalea(91, 180, true);

    /* =====================================================================
     * 8. VEGETATION SCATTER
     *    moss + mushrooms on the shaded west side (never near the lava),
     *    grass/flower tufts across the open yard
     * ===================================================================== */
    for (let z = 169; z <= 226; z++) for (let x = 53; x <= 63; x++) {
      if (offLimits(x, z)) continue;
      // heavier moss ring just outside the lava keep-out
      const nearPool = x >= 54 && x <= 57 && z >= 177 && z <= 189;
      if (rnd() < (nearPool ? 0.42 : 0.16))
        carve(x, z, rnd() < 0.75 ? B.MOSS_BLOCK : B.MOSSY_COBBLESTONE);
      const r = rnd();
      if (r < 0.05) decor(x, z, rnd() < 0.5 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN);
      else if (r < 0.10) decor(x, z, B.FERN);
      else if (r < 0.13) decor(x, z, B.TALL_GRASS);
    }
    for (let z = 169; z <= 226; z++) for (let x = 64; x <= 99; x++) {
      if (offLimits(x, z)) continue;
      const r = rnd();
      if (r < 0.045) decor(x, z, pick(FLOWERS));
      else if (r < 0.052) decor(x, z, B.DEAD_BUSH);
    }
    // mushrooms tucked into the shade along the building's south face
    for (const [mx, mz] of [[66, 215], [71, 215], [80, 215], [86, 215], [63, 216]])
      if (rnd() < 0.8) decor(mx, mz, rnd() < 0.5 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN);
  });
})();
