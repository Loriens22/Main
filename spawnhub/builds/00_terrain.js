/* =========================================================================
 * 00_terrain.js — TERRAIN build for the spawn hub. ORDER 0, whole map.
 *
 * Layers of work (all deterministic, seeded rng = mulberry(12345)):
 *   1. heightmap    — flat y=32 in/near every plot, gentle 31..34 meadow
 *                     between plots, terraced hills ringing the map edges
 *   2. geology      — bedrock, bulk stone, deepslate blobs, per-column
 *                     stone/dirt/grass with patchy hill tops
 *   3. caves        — a few dark cave mouths carved into hill faces
 *   4. pond+stream  — natural basin in the POND plot, meandering stream
 *                     north to a spring pool between PLAZA and FOOTBALL
 *   5. farms        — two wheat/vegetable patches
 *   6. trees        — ~100 seeded trees (oak/birch/spruce/dark oak/azalea)
 *   7. vegetation   — tall grass, ferns, flowers, mushrooms, berry bushes
 *   8. assertions   — every build plot column must be flat grass @ y=32
 * ========================================================================= */
(function () {
  SpawnBuilds.register('terrain', 0, [0, 0, 287, 287], function (W, B) {
    'use strict';
    const SH = globalThis.SpawnHub;
    const rng = SH.mulberry(12345);
    const hash2 = SH.hash2;
    const G = W.GROUND;            // 32 — plot surface height
    const SX = 288, SZ = 288;

    /* ==================== site plan ==================== */
    const PLOTS6 = [               // these MUST end flat grass, top solid y=32
      [116, 120, 172, 172],        // PLAZA
      [100,  60, 172, 116],        // SHOPS
      [200,  44, 268, 120],        // MODERN
      [ 52, 168, 100, 232],        // POOR_TOWER
      [108, 176, 152, 224],        // BEE
      [184, 172, 248, 240],        // FOOTBALL
    ];
    const POND_PLOT = [154, 184, 182, 222];
    const STREAM_RECT = [171, 114, 185, 190];  // kept flat so banks stay tidy
    const FLAT_ZONES = PLOTS6.concat([POND_PLOT, STREAM_RECT]);

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    function rectDist(x, z, r) {   // chebyshev distance to a rect (0 inside)
      const dx = Math.max(r[0] - x, 0, x - r[2]);
      const dz = Math.max(r[1] - z, 0, z - r[3]);
      return Math.max(dx, dz);
    }
    function dFlat(x, z) {         // distance to nearest flat zone
      let m = 1e9;
      for (let i = 0; i < FLAT_ZONES.length; i++) {
        const d = rectDist(x, z, FLAT_ZONES[i]);
        if (d < m) m = d;
      }
      return m;
    }

    /* ==================== value noise ==================== */
    function vn(x, z, f, seed) {   // smooth bilinear value noise in [0,1]
      const gx = x * f, gz = z * f;
      const x0 = Math.floor(gx), z0 = Math.floor(gz);
      const fx = gx - x0, fz = gz - z0;
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
      const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
      return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
    }

    // normalized "how deep into the edge-hill ring" 0..1
    function edgeT(x, z) {
      const t = Math.max((48 - x) / 48, (x - 252) / 38, (40 - z) / 40, (z - 246) / 42);
      return t > 0 ? Math.min(t, 1) : 0;
    }

    /* ==================== 1. heightmap ==================== */
    const H = new Uint8Array(SX * SZ);
    const hAt = (x, z) => H[z * SX + x];

    function computeH(x, z) {
      const dp = dFlat(x, z);
      // -- gentle meadow: y 31..34, pinned to 32 in/next to flat zones --
      const n = vn(x, z, 1 / 11, 101) * 0.7 + vn(x, z, 1 / 29, 202) * 0.3;
      const ramp = clamp((dp - 1) / 6, 0, 1);
      let h = G + Math.round(ramp * (n - 0.38) * 3.2);
      h = clamp(h, 31, 34);
      // -- terraced ring hills --
      const t = edgeT(x, z);
      if (t > 0) {
        const amp = 21 + vn(x, z, 1 / 60, 303) * 9;        // corner-to-corner variety
        const pramp = clamp((dp - 3) / 9, 0, 1);           // hills never crowd plots
        let hv = Math.pow(t, 1.25) * amp * pramp;
        hv += (vn(x, z, 1 / 13, 404) - 0.5) * 3;           // wobble the terrace lines
        if (hv > 0.6) {
          // quantize into flat treads: mostly 2-high steps, zones of 1-high
          const split = vn(x, z, 1 / 37, 505);
          const terr = split > 0.55 ? Math.floor(hv) : Math.floor(hv / 2) * 2;
          h = Math.max(h, G + Math.min(terr, 28));         // cap at y=60
        }
      }
      return h;
    }
    for (let z = 0; z < SZ; z++)
      for (let x = 0; x < SX; x++) H[z * SX + x] = computeH(x, z);

    /* ==================== 2. geology ==================== */
    W.fill(0, 0, 0, 287, 0, 287, B.BEDROCK);
    W.fill(0, 1, 0, 287, 24, 287, B.STONE);
    // occasional deepslate blobs below y~20
    for (let i = 0; i < 90; i++) {
      const bx = 4 + rng() * 280, bz = 4 + rng() * 280;
      const by = 4 + rng() * 11, r = 1.5 + rng() * 2.5;
      W.sphere(bx | 0, by | 0, bz | 0, r, B.DEEPSLATE);
    }

    function stoneAt(x, y, z) {    // stone with flecks (shows on risers/caves)
      const r = hash2(x + y * 289, z - y * 127, 73);
      if (r < 0.050) return B.ANDESITE;
      if (r < 0.085) return B.TUFF;
      if (r < 0.100) return B.GRAVEL;
      return B.STONE;
    }
    function topBlock(x, z, h) {   // surface material
      if (dFlat(x, z) < 2) return B.GRASS;                 // plots + margin stay clean
      const t = edgeT(x, z);
      const p = vn(x, z, 1 / 6, 71), r = hash2(x, z, 72);
      if (t > 0.12) {                                      // hill terraces: patchy
        if (p > 0.78) return r < 0.40 ? B.STONE : r < 0.65 ? B.COBBLESTONE
          : r < 0.85 ? B.ANDESITE : B.TUFF;
        if (p > 0.66) return B.COARSE_DIRT;
        if (h >= 48 && p < 0.20) return B.PODZOL;          // high spruce ground
        return B.GRASS;
      }
      if (p > 0.84) return r < 0.5 ? B.COARSE_DIRT : B.PODZOL;
      return B.GRASS;
    }

    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const h = hAt(x, z);
        for (let y = 25; y <= h - 4; y++) W.set(x, y, z, stoneAt(x, y, z));
        W.set(x, h - 3, z, B.DIRT);
        W.set(x, h - 2, z, B.DIRT);
        W.set(x, h - 1, z, B.DIRT);
        W.set(x, h, z, topBlock(x, z, h));
      }
    }

    // a few mossy boulders on open meadow
    for (let i = 0; i < 10; i++) {
      const bx = (8 + rng() * 272) | 0, bz = (8 + rng() * 272) | 0;
      if (dFlat(bx, bz) < 6 || edgeT(bx, bz) > 0.4) continue;
      const gy = hAt(bx, bz);
      if (W.get(bx, gy, bz) !== B.GRASS) continue;
      for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
        if (rng() < 0.85) W.set(bx + dx, gy + 1, bz + dz,
          rng() < 0.55 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE);
      }
      if (rng() < 0.5) W.set(bx, gy + 2, bz, B.MOSSY_COBBLESTONE);
    }

    /* ==================== 3. cave mouths ==================== */
    function caveFloor(x, z) {
      const r = hash2(x, z, 91);
      return r < 0.40 ? B.COBBLED_DEEPSLATE : r < 0.60 ? B.DEEPSLATE
        : r < 0.85 ? B.STONE : B.GRAVEL;
    }
    // walk (dx,dz) into the ring until the hill face is tall enough, then
    // carve a 4-wide, 3-high, ~7-deep dark notch with a cobbled-deepslate rim
    function carveCave(sx, sz, dx, dz, drip) {
      let x = sx, z = sz, guard = 80;
      while (guard-- > 0 && x > 3 && x < 284 && z > 3 && z < 284 && hAt(x, z) < 41) {
        x += dx; z += dz;
      }
      if (guard <= 0 || hAt(x, z) < 41) return;
      const fl = clamp(hAt(x, z) - 5, 33, 40);   // cave floor air level
      const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;  // width direction
      for (let d = -2; d <= 6; d++) {
        const bx = x + dx * d, bz = z + dz * d;
        for (let w = -1; w <= 2; w++) {
          const cx = bx + px * w, cz = bz + pz * w;
          // floor / apron (only where supported — no floaters)
          if (W.get(cx, fl - 2, cz) !== 0) W.set(cx, fl - 1, cz, caveFloor(cx, cz));
          for (let y = fl; y <= fl + 2; y++)
            if (W.get(cx, y, cz) !== 0) W.set(cx, y, cz, 0);
          // ceiling rim
          if (d >= 0 && W.get(cx, fl + 3, cz) !== 0 && hash2(cx, cz, 92) < 0.55)
            W.set(cx, fl + 3, cz, B.COBBLED_DEEPSLATE);
          // side walls
          if (w === -1 || w === 2) {
            const s = w === -1 ? -1 : 1;
            const wx = cx + px * s, wz = cz + pz * s;
            for (let y = fl; y <= fl + 2; y++)
              if (W.get(wx, y, wz) !== 0 && hash2(wx + y, wz - y, 93) < 0.5)
                W.set(wx, y, wz, B.COBBLED_DEEPSLATE);
          }
          // hanging dripstone in the marked cave
          if (drip && d >= 1 && d <= 5 && (w === 0 || w === 1) &&
              W.get(cx, fl + 3, cz) !== 0 && W.get(cx, fl + 2, cz) === 0 &&
              hash2(cx, cz, 94) < 0.50)
            W.set(cx, fl + 2, cz, B.DRIPSTONE);
        }
      }
    }
    carveCave(52, 138, -1, 0, true);    // west hills, dripstone cave
    carveCave(86, 45, 0, -1, false);    // north hills
    carveCave(236, 42, 0, -1, false);   // NE hill behind the MODERN plot
    carveCave(250, 152, 1, 0, false);   // east hills

    /* ==================== 4. pond ==================== */
    const PCX = 171, PCZ = 202, PRX = 8.5, PRZ = 14.5;
    function pondD(x, z) {               // <1 water, <1.45 sandy bank
      const s = 1 + (vn(x, z, 1 / 9, 606) - 0.5) * 0.3;
      const dx = (x - PCX) / (PRX * s), dz = (z - PCZ) / (PRZ * s);
      return dx * dx + dz * dz;
    }
    function pondFloorBlock(x, z, d) {
      const r = hash2(x, z, 95);
      if (d < 0.35) return r < 0.7 ? B.CLAY : B.DIRT;
      if (d < 0.75) return r < 0.35 ? B.GRAVEL : r < 0.7 ? B.DIRT : B.SAND;
      return r < 0.7 ? B.SAND : B.DIRT;
    }
    for (let z = POND_PLOT[1]; z <= POND_PLOT[3]; z++) {
      for (let x = POND_PLOT[0]; x <= POND_PLOT[2]; x++) {
        const d = pondD(x, z);
        if (d < 1) {                     // basin: floor 27..29, water to y=30
          const depth = d < 0.3 ? 3 : d < 0.6 ? 2 : 1;
          const fl = 30 - depth;
          W.set(x, fl - 1, z, B.DIRT);
          W.set(x, fl, z, pondFloorBlock(x, z, d));
          for (let y = fl + 1; y <= 30; y++) W.set(x, y, z, B.WATER);
          for (let y = 31; y <= 35; y++) W.set(x, y, z, 0);
        } else if (d < 1.45) {           // bank: one step down, sandy mix
          const r = hash2(x, z, 96);
          W.set(x, 31, z, r < 0.5 ? B.SAND : r < 0.75 ? B.DIRT : r < 0.9 ? B.GRASS : B.CLAY);
          for (let y = 32; y <= 35; y++) W.set(x, y, z, 0);
        }
      }
    }
    // lily pads + seagrass
    for (let z = POND_PLOT[1]; z <= POND_PLOT[3]; z++) {
      for (let x = POND_PLOT[0]; x <= POND_PLOT[2]; x++) {
        const d = pondD(x, z);
        if (d >= 1 || W.get(x, 30, z) !== B.WATER) continue;
        const r = hash2(x, z, 97);
        if (d < 0.85 && r < 0.055 && W.get(x, 31, z) === 0) W.set(x, 31, z, B.LILY_PAD);
        if (d < 0.6 && r > 0.82 && W.get(x, 29, z) === B.WATER) W.set(x, 29, z, B.SEAGRASS);
      }
    }
    // sugar cane clusters hugging the waterline
    for (let z = POND_PLOT[1]; z <= POND_PLOT[3]; z++) {
      for (let x = POND_PLOT[0]; x <= POND_PLOT[2]; x++) {
        if (W.get(x, 31, z) === 0 || W.get(x, 31, z) === B.WATER) continue;
        if (W.get(x, 32, z) !== 0) continue;
        const nearWater = W.get(x + 1, 30, z) === B.WATER || W.get(x - 1, 30, z) === B.WATER ||
                          W.get(x, 30, z + 1) === B.WATER || W.get(x, 30, z - 1) === B.WATER;
        if (!nearWater) continue;
        if (vn(x, z, 1 / 4, 81) > 0.58 && hash2(x, z, 82) < 0.55) {
          const ch = 2 + (hash2(x, z, 83) < 0.5 ? 0 : 1);
          for (let i = 0; i < ch; i++) W.set(x, 32 + i, z, B.SUGAR_CANE);
        }
      }
    }
    // dense bamboo near the east bank
    for (let z = 188; z <= 218; z++) {
      for (let x = 176; x <= 181; x++) {
        const top = W.topY(x, z);
        if (top !== 31 && top !== 32) continue;
        const id = W.get(x, top, z);
        if (id === B.WATER || id === 0) continue;
        if (hash2(x, z, 84) < 0.4) {
          const bh = 5 + ((hash2(x, z, 85) * 4) | 0);
          for (let i = 1; i <= bh; i++) W.set(x, top + i, z, B.BAMBOO);
        }
      }
    }

    /* ==================== 4b. spring pool + stream ==================== */
    // spring pool between plaza NE corner and the shops/modern gap
    for (let z = 119; z <= 127; z++) {
      for (let x = 174; x <= 182; x++) {
        const dx = x - 178, dz = z - 123;
        const dd = dx * dx + dz * dz;
        if (dd <= 9.5) {
          W.set(x, 28, z, B.DIRT);
          W.set(x, 29, z, hash2(x, z, 86) < 0.5 ? B.GRAVEL : B.SAND);
          W.set(x, 30, z, B.WATER);
          for (let y = 31; y <= 35; y++) W.set(x, y, z, 0);
        } else if (dd <= 16.5) {
          const r = hash2(x, z, 87);
          W.set(x, 31, z, r < 0.4 ? B.COBBLESTONE : r < 0.6 ? B.MOSSY_COBBLESTONE
            : r < 0.85 ? B.GRAVEL : B.GRASS);
          for (let y = 32; y <= 35; y++) W.set(x, y, z, 0);
        }
      }
    }
    // meandering stream: pool -> pond, strictly inside x 174..182
    for (let z = 127; z <= 192; z++) {
      const cx = 178 + Math.round(Math.sin(z * 0.15) * 1.8);
      if (pondD(cx, z) < 1.05) break;              // reached the pond
      for (let x = cx - 1; x <= cx + 1; x++) {     // water channel, floor y=29
        W.set(x, 29, z, hash2(x, z, 88) < 0.6 ? B.GRAVEL : B.DIRT);
        W.set(x, 30, z, B.WATER);
        for (let y = 31; y <= 35; y++) W.set(x, y, z, 0);
      }
      for (const x of [cx - 2, cx + 2]) {          // banks, one step down
        if (W.get(x, 30, z) === B.WATER) continue;
        const r = hash2(x, z, 89);
        W.set(x, 31, z, r < 0.35 ? B.GRAVEL : r < 0.6 ? B.DIRT : B.GRASS);
        for (let y = 32; y <= 35; y++) W.set(x, y, z, 0);
        if (r > 0.82) W.set(x, 32, z, B.TALL_GRASS);
        else if (r > 0.74 && z % 3 === 0) {
          W.set(x, 32, z, B.SUGAR_CANE); W.set(x, 33, z, B.SUGAR_CANE);
        }
      }
    }

    /* ==================== 5. farms ==================== */
    // normalize one farm column to flat 32 ground of the given top material
    function farmGround(x, z, topId) {
      W.set(x, 30, z, B.DIRT); W.set(x, 31, z, B.DIRT);
      W.set(x, 32, z, topId);
      for (let y = 33; y <= 36; y++) W.set(x, y, z, 0);
    }
    // farm A — pond west bank strip (inside the POND plot, terrain owns it)
    (function farmA() {
      const z1 = 190, z2 = 212;
      for (let z = z1; z <= z2; z++) {
        for (let x = 154; x <= 159; x++) {
          const edge = (x === 154 || x === 159 || z === z1 || z === z2);
          if (edge) { farmGround(x, z, B.OAK_LOG); continue; }
          if (x === 157) {                       // irrigation channel
            W.set(x, 30, z, B.DIRT); W.set(x, 31, z, B.DIRT);
            W.set(x, 32, z, B.WATER);
            for (let y = 33; y <= 36; y++) W.set(x, y, z, 0);
            continue;
          }
          farmGround(x, z, B.COARSE_DIRT);       // farmland-look rows
          const crop = x === 155 ? B.WHEAT
            : x === 156 ? (z % 3 === 0 ? B.WHEAT_YOUNG : B.WHEAT)
            : (z < 201 ? B.CARROTS : B.POTATOES);
          W.set(x, 33, z, crop);
        }
      }
      W.torch(154, 33, z1); W.torch(159, 33, z1);
      W.torch(154, 33, z2); W.torch(159, 33, z2);
    })();
    // farm B — narrow strip just south of SHOPS (z 117..119 is between plots)
    (function farmB() {
      for (let x = 105; x <= 139; x++) {
        const edge = (x === 105 || x === 139);
        for (let z = 117; z <= 119; z++) {
          if (edge) { farmGround(x, z, B.OAK_LOG); continue; }
          if (z === 118) {                       // central irrigation channel
            W.set(x, 30, z, B.DIRT); W.set(x, 31, z, B.DIRT);
            W.set(x, 32, z, B.WATER);
            for (let y = 33; y <= 36; y++) W.set(x, y, z, 0);
            continue;
          }
          farmGround(x, z, B.COARSE_DIRT);
          const seg = ((x / 6) | 0) % 4;
          const crop = seg === 0 ? B.WHEAT : seg === 1 ? B.WHEAT_YOUNG
            : seg === 2 ? B.CARROTS : B.POTATOES;
          W.set(x, 33, z, crop);
        }
      }
      W.torch(105, 33, 118); W.torch(139, 33, 118);
    })();

    /* ==================== 6. trees ==================== */
    const treePts = [];
    let treeCount = 0;
    function tryTree(x, z, type, minD2) {
      x |= 0; z |= 0;
      if (x < 4 || x > 283 || z < 4 || z > 283) return false;
      if (dFlat(x, z) < 4) return false;         // never in/within 3 of plots
      const g = hAt(x, z);
      if (W.topY(x, z) !== g) return false;      // something already here
      if (W.get(x, g, z) !== B.GRASS) return false;
      // reasonably level footing
      if (Math.abs(hAt(x + 1, z) - g) > 1 || Math.abs(hAt(x - 1, z) - g) > 1 ||
          Math.abs(hAt(x, z + 1) - g) > 1 || Math.abs(hAt(x, z - 1) - g) > 1) return false;
      for (let i = 0; i < treePts.length; i++) {
        const dx = treePts[i][0] - x, dz = treePts[i][1] - z;
        if (dx * dx + dz * dz < minD2) return false;
      }
      W.tree(x, g + 1, z, type, rng);
      treePts.push([x, z]); treeCount++;
      return true;
    }
    function pickType(x, z) {
      const t = edgeT(x, z), h = hAt(x, z);
      if (t > 0.08) {                            // ring hills
        if ((x < 120 && z < 150) || h >= 46)     // NW / high ground -> spruce
          return rng() < 0.75 ? 'spruce' : 'oak';
        const r = rng();
        return r < 0.45 ? 'oak' : r < 0.75 ? 'birch' : 'spruce';
      }
      return rng() < 0.55 ? 'oak' : 'birch';     // open meadow
    }
    // a few chosen dark oaks + azaleas on the pond's south shore
    tryTree(161, 231, 'dark_oak', 16);
    tryTree(173, 234, 'dark_oak', 16);
    tryTree(157, 227, 'azalea', 9);
    tryTree(166, 226, 'azalea', 9);
    tryTree(178, 228, 'azalea', 9);
    tryTree(163, 238, 'azalea', 9);
    tryTree(176, 240, 'azalea', 9);
    // seeded scatter across meadow + terraces
    for (let i = 0; i < 6000 && treeCount < 115; i++) {
      const x = 4 + rng() * 280, z = 4 + rng() * 280;
      tryTree(x, z, pickType(x | 0, z | 0), 22);
    }

    /* ==================== 7. vegetation ==================== */
    const FLOWERS = [B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY,
      B.TULIP_RED, B.TULIP_WHITE, B.TULIP_PINK, B.ALLIUM];
    for (let z = 1; z < SZ - 1; z++) {
      for (let x = 1; x < SX - 1; x++) {
        if (dFlat(x, z) < 2) continue;           // keep plots + margin clean
        const g = hAt(x, z);
        const top = W.get(x, g, z);
        if (W.get(x, g + 1, z) !== 0) continue;  // occupied (trunk, cane, ...)
        const r1 = hash2(x, z, 911), r2 = hash2(x, z, 912);
        if (top === B.COARSE_DIRT) {
          if (r1 < 0.05) W.set(x, g + 1, z, B.DEAD_BUSH);
          continue;
        }
        if (top !== B.GRASS && top !== B.PODZOL) continue;
        // mushrooms in the shade (under canopies / overhangs)
        let shaded = false;
        for (let y = g + 2; y <= g + 8; y++) if (W.get(x, y, z) !== 0) { shaded = true; break; }
        if (shaded) {
          if (r2 < 0.14) W.set(x, g + 1, z, r1 < 0.5 ? B.MUSHROOM_RED : B.MUSHROOM_BROWN);
          continue;
        }
        const t = edgeT(x, z);
        if (t > 0.03 && t < 0.5 && r2 < 0.012) { // berry bushes near the hills
          W.set(x, g + 1, z, B.SWEET_BERRY_BUSH);
          continue;
        }
        if (r1 < 0.10) { W.set(x, g + 1, z, B.TALL_GRASS); continue; }
        if (r1 < 0.13 + (t > 0.1 ? 0.06 : 0)) { W.set(x, g + 1, z, B.FERN); continue; }
        const fp = vn(x, z, 1 / 8, 913);         // patchy flower beds
        if (fp > 0.64 && r1 < 0.42) {
          // stretch the noise so every flower species gets real beds
          const v = clamp((vn(x, z, 1 / 16, 914) - 0.22) / 0.56, 0, 0.999);
          W.set(x, g + 1, z, FLOWERS[(v * 8) | 0]);
        }
      }
    }

    /* ==================== 8. sanity assertions ==================== */
    for (const r of PLOTS6) {
      for (let z = r[1]; z <= r[3]; z++) {
        for (let x = r[0]; x <= r[2]; x++) {
          const t = W.topY(x, z);
          if (t !== G)
            throw new Error('terrain: plot column (' + x + ',' + z + ') top=' + t + ' expected ' + G);
          if (W.get(x, G, z) !== B.GRASS)
            throw new Error('terrain: plot column (' + x + ',' + z + ') top block is not grass');
        }
      }
    }
    if (treeCount < 40)
      throw new Error('terrain: only ' + treeCount + ' trees planted (need >= 40)');
  });
})();
