/* =====================================================================
   TERRAIN  —  hills, terraces, pads, lake, rivers, caves, bedrock
   Runs first. Every other builder places blocks on top of what this
   produces. Building pads are perfectly flat at documented heights.
   ===================================================================== */

(function (root) {
  'use strict';
  const W = root.World, B = root.B;

  /* ---- flat construction pads ------------------------------------- */
  const PADS = [
    { name: 'plaza', x0: -24, z0: -18, x1: 16, z1: 30, y: 32, f: 7 },
    { name: 'poor', x0: -66, z0: 2, x1: -28, z1: 44, y: 34, f: 6 },
    { name: 'market', x0: 20, z0: -8, x1: 62, z1: 32, y: 32, f: 6 },
    { name: 'sports', x0: -28, z0: 36, x1: 18, z1: 76, y: 32, f: 7 },
    { name: 'modern', x0: 24, z0: -62, x1: 66, z1: -20, y: 38, f: 7 },
    { name: 'bee', x0: -18, z0: -52, x1: 16, z1: -22, y: 40, f: 8 },
    { name: 'lake', x0: -74, z0: -74, x1: -30, z1: -28, y: 25, f: 11 },
    { name: 'pond', x0: 30, z0: 40, x1: 52, z1: 60, y: 28, f: 7 },
  ];
  const WATER_Y = 30;      // lake / pond surface
  const POND_Y = 31;

  /* ---- value noise ------------------------------------------------- */
  function hash2(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  }
  function fbm(x, y, oct, scale) {
    let v = 0, amp = 1, tot = 0, s = scale;
    for (let i = 0; i < oct; i++) { v += vnoise(x / s, y / s) * amp; tot += amp; amp *= 0.5; s *= 0.5; }
    return v / tot;
  }

  function padDist(p, x, z) {
    const dx = Math.max(p.x0 - x, 0, x - p.x1);
    const dz = Math.max(p.z0 - z, 0, z - p.z1);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* background hill height — terraced, rises toward the map edges */
  function bgHeight(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const rim = Math.max(0, (r - 58) / 40);              // 0 near centre, 1 at border
    const n = fbm(x + 1000, z + 1000, 4, 46);
    const n2 = fbm(x - 500, z + 300, 3, 17);
    let h = 31 + n * 9 + n2 * 3 + rim * rim * 30;
    // terrace the outer hills into readable 2-block steps
    if (rim > 0.06) {
      const t = Math.min(1, rim * 3.2);
      const step = 2;
      const terr = Math.floor(h / step) * step + (h % step > 1.4 ? 1 : 0);
      h = h * (1 - t) + terr * t;
    }
    return h;
  }

  const heights = new Int16Array(W.SX * W.SZ);
  function hIndex(x, z) { return (z - W.Z0) * W.SX + (x - W.X0); }

  function computeHeights() {
    for (let z = W.Z0; z < W.Z0 + W.SZ; z++) {
      for (let x = W.X0; x < W.X0 + W.SX; x++) {
        let wsum = 0, hsum = 0;
        for (let i = 0; i < PADS.length; i++) {
          const p = PADS[i];
          const d = padDist(p, x, z);
          if (d > p.f) continue;
          const w = smooth(1 - d / p.f);
          const ww = w * w;
          hsum += ww * p.y; wsum += ww;
        }
        const bg = bgHeight(x, z);
        let h;
        if (wsum > 0) {
          const k = Math.min(1, wsum);
          h = (hsum / wsum) * k + bg * (1 - k);
        } else h = bg;
        heights[hIndex(x, z)] = Math.max(6, Math.round(h));
      }
    }
  }

  function inPad(name, x, z) {
    const p = PADS.find(q => q.name === name);
    return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
  }
  function inAnyWater(x, z) {
    return padDist(PADS.find(p => p.name === 'lake'), x, z) < 1 ||
      padDist(PADS.find(p => p.name === 'pond'), x, z) < 1;
  }

  /* ---- ground column ------------------------------------------------ */
  function layColumn(x, z) {
    const h = heights[hIndex(x, z)];
    const lakeD = padDist(PADS.find(p => p.name === 'lake'), x, z);
    const pondD = padDist(PADS.find(p => p.name === 'pond'), x, z);
    const isLake = lakeD < 3 && h < WATER_Y;
    const isPond = pondD < 3 && h < POND_Y;

    W.set(x, 0, z, B.BEDROCK);
    for (let y = 1; y <= 3; y++) W.set(x, y, z, W.rand() < 0.35 ? B.BEDROCK : B.DEEPSLATE);

    const stoneTop = h - 4;
    for (let y = 4; y <= stoneTop; y++) {
      let blk;
      if (y < 14) blk = W.rand() < 0.06 ? B.COBBLED_DEEPSLATE : B.DEEPSLATE;
      else {
        const r = W.rand();
        blk = r < 0.055 ? B.ANDESITE : r < 0.085 ? B.DIORITE : r < 0.115 ? B.GRANITE :
          r < 0.125 ? B.TUFF : B.STONE;
        if (r > 0.996) blk = B.COAL_ORE;
        else if (r > 0.993) blk = B.IRON_ORE;
      }
      W.set(x, y, z, blk);
    }
    for (let y = Math.max(4, stoneTop + 1); y < h; y++) W.set(x, y, z, B.DIRT);

    if (isLake || isPond) {
      // lake / pond bed
      const bed = W.rand() < 0.28 ? B.GRAVEL : (W.rand() < 0.4 ? B.CLAY : B.SAND);
      W.set(x, h, z, bed);
      const surf = isLake ? WATER_Y : POND_Y;
      for (let y = h + 1; y <= surf; y++) W.set(x, y, z, B.WATER);
      return;
    }

    // shoreline sand
    const nearWater = (lakeD < 7 && h <= WATER_Y + 2) || (pondD < 6 && h <= POND_Y + 2);
    if (nearWater) { W.set(x, h, z, W.rand() < 0.75 ? B.SAND : B.GRAVEL); return; }

    // steep faces expose stone / coarse dirt like the terraced reference hills
    let maxDrop = 0;
    for (let i = 0; i < 4; i++) {
      const nx = x + (i === 0 ? 1 : i === 1 ? -1 : 0);
      const nz = z + (i === 2 ? 1 : i === 3 ? -1 : 0);
      if (nx < W.X0 || nx >= W.X0 + W.SX || nz < W.Z0 || nz >= W.Z0 + W.SZ) continue;
      maxDrop = Math.max(maxDrop, h - heights[hIndex(nx, nz)]);
    }
    let top = B.GRASS_BLOCK;
    if (maxDrop >= 4) top = W.rand() < 0.5 ? B.STONE : B.COARSE_DIRT;
    else if (maxDrop === 3 && W.rand() < 0.4) top = B.COARSE_DIRT;
    if (h > 62 && W.rand() < 0.35) top = W.rand() < 0.5 ? B.PODZOL : B.COARSE_DIRT;
    W.set(x, h, z, top);
  }

  /* ---- trees --------------------------------------------------------- */
  function oakTree(x, y, z, big) {
    const th = big ? W.randRange(6, 8) : W.randRange(4, 6);
    for (let i = 0; i < th; i++) W.set(x, y + i, z, B.OAK_LOG);
    const top = y + th;
    const r = big ? 3 : 2;
    for (let dy = -2; dy <= 1; dy++) {
      const rr = dy === 1 ? r - 1 : dy === -2 ? r : r;
      for (let dz = -rr; dz <= rr; dz++)
        for (let dx = -rr; dx <= rr; dx++) {
          const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 0.6;
          if (d > rr + 0.9) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (W.rand() < 0.08) continue;
          W.setIfAir(x + dx, top + dy, z + dz, B.OAK_LEAVES);
        }
    }
    W.setIfAir(x, top + 1, z, B.OAK_LEAVES);
    if (W.chance(0.3)) W.face(x + 1, top - 2, z, B.VINE, 'w');
    if (W.chance(0.2)) W.face(x, top - 2, z + 1, B.VINE, 'n');
  }
  function birchTree(x, y, z) {
    const th = W.randRange(5, 7);
    for (let i = 0; i < th; i++) W.set(x, y + i, z, B.BIRCH_LOG);
    const top = y + th;
    for (let dy = -2; dy <= 1; dy++) {
      const rr = dy >= 1 ? 1 : 2;
      for (let dz = -rr; dz <= rr; dz++)
        for (let dx = -rr; dx <= rr; dx++) {
          if (Math.abs(dx) === rr && Math.abs(dz) === rr && W.rand() < 0.7) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          W.setIfAir(x + dx, top + dy, z + dz, B.BIRCH_LEAVES);
        }
    }
  }
  function spruceTree(x, y, z) {
    const th = W.randRange(7, 11);
    for (let i = 0; i < th; i++) W.set(x, y + i, z, B.SPRUCE_LOG);
    let r = 0;
    for (let dy = th - 1; dy >= 2; dy--) {
      const layer = (th - 1 - dy);
      r = (layer % 3 === 0) ? 1 : (layer % 3 === 1) ? 2 : 1;
      if (layer < 2) r = 1;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
          if (dx === 0 && dz === 0) continue;
          W.setIfAir(x + dx, y + dy, z + dz, B.SPRUCE_LEAVES);
        }
    }
    W.setIfAir(x, y + th, z, B.SPRUCE_LEAVES);
    W.setIfAir(x, y + th + 1, z, B.SPRUCE_LEAVES);
  }
  function azaleaBush(x, y, z) {
    W.setIfAir(x, y, z, B.OAK_LOG);
    for (let dy = 1; dy <= 2; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 2 && (dx || dz) && W.rand() < 0.6) continue;
          W.setIfAir(x + dx, y + dy, z + dz, W.chance(0.35) ? B.FLOWERING_AZALEA : B.AZALEA_LEAVES);
        }
  }
  function bambooClump(x, y, z) {
    for (let i = 0; i < 7; i++) {
      const bx = x + W.randRange(-2, 2), bz = z + W.randRange(-2, 2);
      const gy = W.heightAt(bx, bz, 70);
      if (gy < 0 || !W.isAir(bx, gy + 1, bz)) continue;
      const hgt = W.randRange(5, 12);
      for (let k = 1; k <= hgt; k++) W.setIfAir(bx, gy + k, bz, B.BAMBOO);
    }
  }

  function isFree(x, z, y) {
    for (let dy = 0; dy < 3; dy++) if (!W.isAir(x, y + dy, z)) return false;
    return true;
  }

  function decorate() {
    for (let z = W.Z0 + 2; z < W.Z0 + W.SZ - 2; z++) {
      for (let x = W.X0 + 2; x < W.X0 + W.SX - 2; x++) {
        const h = heights[hIndex(x, z)];
        if (h < WATER_Y) continue;
        const ground = W.get(x, h, z);
        if (ground !== B.GRASS_BLOCK && ground !== B.PODZOL && ground !== B.COARSE_DIRT) continue;
        if (!W.isAir(x, h + 1, z)) continue;

        // keep pads clear for the builders
        let onPad = false;
        for (const p of PADS) if (p.name !== 'lake' && p.name !== 'pond' && padDist(p, x, z) < 1) { onPad = true; break; }
        const r = W.rand();

        if (!onPad) {
          const dens = fbm(x + 77, z - 33, 3, 30);
          if (dens > 0.62 && r < 0.028 && isFree(x, z, h + 1)) {
            const kind = W.rand();
            if (h > 52) spruceTree(x, h + 1, z);
            else if (kind < 0.55) oakTree(x, h + 1, z, W.chance(0.35));
            else if (kind < 0.8) birchTree(x, h + 1, z);
            else spruceTree(x, h + 1, z);
            continue;
          }
          if (r < 0.006 && isFree(x, z, h + 1)) { azaleaBush(x, h + 1, z); continue; }
        }
        if (r < 0.135) W.set(x, h + 1, z, B.TALL_GRASS);
        else if (r < 0.165) W.set(x, h + 1, z, B.FERN);
        else if (r < 0.178) W.set(x, h + 1, z, W.pick([B.POPPY, B.DANDELION, B.CORNFLOWER, B.OXEYE_DAISY,
          B.ALLIUM, B.RED_TULIP, B.PINK_TULIP, B.ORANGE_TULIP, B.WHITE_TULIP, B.LILY_OF_THE_VALLEY]));
        else if (r < 0.181) W.set(x, h + 1, z, W.pick([B.RED_MUSHROOM, B.BROWN_MUSHROOM]));
        else if (r < 0.183 && h > 55) W.set(x, h + 1, z, B.SWEET_BERRY_BUSH);
      }
    }
  }

  /* ---- water-edge dressing ------------------------------------------- */
  function shoreline() {
    const lake = PADS.find(p => p.name === 'lake');
    const pond = PADS.find(p => p.name === 'pond');
    for (const [pad, surf] of [[lake, WATER_Y], [pond, POND_Y]]) {
      for (let z = pad.z0 - 10; z <= pad.z1 + 10; z++) {
        for (let x = pad.x0 - 10; x <= pad.x1 + 10; x++) {
          if (!W.inBounds(x, surf, z)) continue;
          const h = heights[hIndex(x, z)];
          if (W.get(x, surf, z) === B.WATER) {
            // lily pads + seagrass
            if (W.rand() < 0.035 && W.isAir(x, surf + 1, z)) W.set(x, surf + 1, z, B.LILY_PAD);
            else if (W.rand() < 0.03 && h < surf - 1) W.set(x, h + 1, z, B.SEAGRASS);
            continue;
          }
          if (h === surf || h === surf + 1) {
            if (W.rand() < 0.16 && W.isAir(x, h + 1, z)) {
              const n = W.randRange(1, 3);
              for (let k = 1; k <= n; k++) W.setIfAir(x, h + k, z, B.SUGAR_CANE);
            }
          }
        }
      }
    }
    // bamboo groves near the water
    W.seed(4242);
    bambooClump(-34, 0, -30); bambooClump(-28, 0, -40);
    bambooClump(38, 0, 64); bambooClump(48, 0, 38);
    bambooClump(-40, 0, -22);
  }

  /* ---- cave mouths ----------------------------------------------------- */
  function caves() {
    const spots = [
      { x: -74, z: 24, dir: [1, 0] },
      { x: 70, z: 8, dir: [-1, 0] },
      { x: -10, z: -78, dir: [0, 1] },
      { x: 30, z: 78, dir: [0, -1] },
    ];
    for (const s of spots) {
      const gy = W.heightAt(s.x, s.z, 90);
      if (gy < 0) continue;
      let cx = s.x, cz = s.z, cy = gy - 1;
      for (let i = 0; i < 26; i++) {
        const r = 2 + (i < 3 ? 1 : 0);
        W.ellipsoid(cx, cy, cz, r, r - 0, r, 0);
        if (i % 6 === 3) {
          W.set(cx, cy - r, cz, B.LAVA);
          W.marker('ambient', cx, cy - r + 1, cz, { kind: 'lavaGlow' });
        }
        if (i % 4 === 0) W.set(cx + 1, cy - r + 1, cz, B.GLOW_LICHEN, 3);
        cx += s.dir[0] * 2 + (W.chance(0.4) ? 1 : -1) * (s.dir[0] ? 0 : 1);
        cz += s.dir[1] * 2 + (W.chance(0.4) ? 1 : -1) * (s.dir[1] ? 0 : 1);
        cy -= W.chance(0.45) ? 1 : 0;
        if (cy < 10) break;
      }
      // torch-lit entrance
      W.set(s.x, gy + 1, s.z, 0);
      W.face(s.x + (s.dir[0] ? 0 : 1), gy, s.z + (s.dir[1] ? 0 : 1), B.WALL_TORCH, 'e');
    }
  }

  function build() {
    W.seed(1337);
    computeHeights();
    for (let z = W.Z0; z < W.Z0 + W.SZ; z++)
      for (let x = W.X0; x < W.X0 + W.SX; x++) layColumn(x, z);
    W.seed(9911);
    decorate();
    W.seed(5150);
    shoreline();
    W.seed(777);
    caves();
  }

  root.TERRAIN = { build, heights, hIndex, PADS, WATER_Y, POND_Y, bgHeight, fbm, inPad, inAnyWater };
  root.BUILDERS = root.BUILDERS || {};
  root.BUILDERS.terrain = build;
})(typeof globalThis !== 'undefined' ? globalThis : this);
