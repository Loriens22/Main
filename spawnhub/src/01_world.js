/* =========================================================================
 * SpawnHub — world storage + builder API (W) + build registry (SpawnBuilds)
 * Pure JS, runs in node (smoke test) and browser identically.
 * ========================================================================= */
(function () {
  const SH = globalThis.SpawnHub;
  const SX = 288, SY = 96, SZ = 288;
  const GROUND = 32;            // terrain surface Y at all build plots
  const WATER_LEVEL = 30;

  const blocks = new Uint16Array(SX * SY * SZ);
  const idx = (x, y, z) => ((y * SZ) + z) * SX + x;

  const W = (SH.W = {
    SX, SY, SZ, GROUND, WATER_LEVEL,
    blocks, idx,
    _region: null, _outside: 0, _regionName: '',
    _violations: {},

    inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; },

    set(x, y, z, id) {
      x |= 0; y |= 0; z |= 0;
      if (!W.inBounds(x, y, z)) return;
      if (W._region) {
        const r = W._region;
        if (x < r[0] || z < r[1] || x > r[2] || z > r[3]) {
          W._violations[W._regionName] = (W._violations[W._regionName] || 0) + 1;
        }
      }
      blocks[idx(x, y, z)] = id;
    },
    get(x, y, z) { if (!W.inBounds(x, y, z)) return 0; return blocks[idx(x, y, z)]; },

    fill(x1, y1, z1, x2, y2, z2, id) {
      const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
      const [ya, yb] = y1 <= y2 ? [y1, y2] : [y2, y1];
      const [za, zb] = z1 <= z2 ? [z1, z2] : [z2, z1];
      for (let y = ya; y <= yb; y++) for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) W.set(x, y, z, id);
    },
    clear(x1, y1, z1, x2, y2, z2) { W.fill(x1, y1, z1, x2, y2, z2, 0); },
    // hollow box: walls on all 4 sides, no floor/ceiling
    walls(x1, y1, z1, x2, y2, z2, id) {
      W.fill(x1, y1, z1, x2, y2, z1, id); W.fill(x1, y1, z2, x2, y2, z2, id);
      W.fill(x1, y1, z1, x1, y2, z2, id); W.fill(x2, y1, z1, x2, y2, z2, id);
    },
    // full shell incl floor+ceiling
    shell(x1, y1, z1, x2, y2, z2, id) {
      W.walls(x1, y1, z1, x2, y2, z2, id);
      W.fill(x1, y1, z1, x2, y1, z2, id); W.fill(x1, y2, z1, x2, y2, z2, id);
    },
    column(x, z, y1, y2, id) { for (let y = y1; y <= y2; y++) W.set(x, y, z, id); },
    disc(cx, y, cz, r, id) {
      for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz <= r * r + 0.5) W.set(x, y, z, id);
      }
    },
    sphere(cx, cy, cz, r, id) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy, dz = z - cz;
        if (dx * dx + dy * dy + dz * dz <= r * r + 0.5) W.set(x, y, z, id);
      }
    },
    // highest non-air block y at column (or -1)
    topY(x, z) { for (let y = SY - 1; y >= 0; y--) { if (blocks[idx(x, y, z)] !== 0) return y; } return -1; },

    /* ---------- convenience placers ---------- */
    stair(x, y, z, mat, dir, flip) { W.set(x, y, z, SH.B.stair(mat, dir, flip)); },
    slab(x, y, z, mat, top) { W.set(x, y, z, SH.B.slab(mat, top)); },
    fencePost(x, y, z, mat) { W.set(x, y, z, SH.B.fence(mat)); },
    door(x, y, z, name, dir) { // 2-high door, name like 'OAK_DOOR'
      const id = SH.B[name + '_' + dir];
      W.set(x, y, z, id); W.set(x, y + 1, z, id);
    },
    torch(x, y, z) { W.set(x, y, z, SH.B.TORCH); },
    lampPost(x, y, z, mat) {
      mat = mat || 'SPRUCE_PLANKS';
      const f = SH.B.fence(mat);
      W.set(x, y, z, f); W.set(x, y + 1, z, f); W.set(x, y + 2, z, SH.B.LANTERN);
    },
    table(x, y, z) { W.set(x, y, z, SH.B.fence('OAK_PLANKS')); W.set(x, y + 1, z, SH.B.PRESSURE_PLATE_OAK); },
    chair(x, y, z, mat, dir) { W.set(x, y, z, SH.B.stair(mat || 'OAK_PLANKS', dir || 'N')); },
    bed(x, y, z, color, dir) { // head at (x,y,z), foot extends dir
      const dx = dir === 'E' ? 1 : dir === 'W' ? -1 : 0;
      const dz = dir === 'S' ? 1 : dir === 'N' ? -1 : 0;
      W.set(x, y, z, SH.B['BED_' + color + '_HEAD']);
      W.set(x + dx, y, z + dz, SH.B['BED_' + color + '_FOOT']);
    },

    /* ---------- trees ---------- */
    tree(x, y, z, type, rng) {
      const B = SH.B;
      rng = rng || Math.random;
      type = type || 'oak';
      if (type === 'oak') {
        const h = 4 + ((rng() * 2) | 0);
        for (let i = 0; i < h; i++) W.set(x, y + i, z, B.OAK_LOG);
        for (let dy = -2; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
          if (d <= 3 + (rng() > .5 ? 1 : 0) && !(dx === 0 && dz === 0 && dy < 1)) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng() > .5) continue;
            if (W.get(x + dx, y + h + dy, z + dz) === 0) W.set(x + dx, y + h + dy, z + dz, B.OAK_LEAVES);
          }
        }
        W.set(x, y + h, z, B.OAK_LEAVES); W.set(x, y + h + 1, z, B.OAK_LEAVES);
      } else if (type === 'birch') {
        const h = 5 + ((rng() * 2) | 0);
        for (let i = 0; i < h; i++) W.set(x, y + i, z, B.BIRCH_LOG);
        for (let dy = -2; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 1.4;
          if (d <= 3.4 && !(dx === 0 && dz === 0 && dy < 1)) {
            if (W.get(x + dx, y + h + dy, z + dz) === 0) W.set(x + dx, y + h + dy, z + dz, B.BIRCH_LEAVES);
          }
        }
        W.set(x, y + h, z, B.BIRCH_LEAVES); W.set(x, y + h + 1, z, B.BIRCH_LEAVES);
      } else if (type === 'spruce') {
        const h = 7 + ((rng() * 3) | 0);
        for (let i = 0; i < h; i++) W.set(x, y + i, z, B.SPRUCE_LOG);
        for (let layer = 0; layer < h - 2; layer++) {
          const yy = y + h - 1 - layer;
          const r = layer % 2 === 0 ? 1 + (layer / 2 | 0) % 2 : 2;
          const rr = Math.min(1 + ((layer + 1) / 2 | 0), 2);
          for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
            if (Math.abs(dx) + Math.abs(dz) <= rr + (layer % 2) && !(dx === 0 && dz === 0)) {
              if (W.get(x + dx, yy, z + dz) === 0) W.set(x + dx, yy, z + dz, B.SPRUCE_LEAVES);
            }
          }
        }
        W.set(x, y + h, z, B.SPRUCE_LEAVES);
      } else if (type === 'dark_oak') {
        const h = 5 + ((rng() * 2) | 0);
        for (let i = 0; i < h; i++) { W.set(x, y + i, z, B.DARK_OAK_LOG); W.set(x + 1, y + i, z, B.DARK_OAK_LOG); W.set(x, y + i, z + 1, B.DARK_OAK_LOG); W.set(x + 1, y + i, z + 1, B.DARK_OAK_LOG); }
        for (let dy = -2; dy <= 1; dy++) for (let dz = -3; dz <= 4; dz++) for (let dx = -3; dx <= 4; dx++) {
          const cx2 = dx > 0 ? dx - 1 : dx, cz2 = dz > 0 ? dz - 1 : dz;
          const d = Math.abs(cx2) + Math.abs(cz2) + Math.abs(dy) * 1.3;
          if (d <= 4.2 && W.get(x + dx, y + h + dy, z + dz) === 0) W.set(x + dx, y + h + dy, z + dz, B.DARK_OAK_LEAVES);
        }
      } else if (type === 'azalea') {
        W.set(x, y, z, B.OAK_LOG);
        for (let dy = 0; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (dy === 1 && (dx !== 0 || dz !== 0) && rng() > .6) continue;
          const leaf = rng() > .35 ? B.AZALEA_LEAVES : B.FLOWERING_AZALEA_LEAVES;
          if (W.get(x + dx, y + 1 + dy, z + dz) === 0) W.set(x + dx, y + 1 + dy, z + dz, leaf);
        }
      }
    },
  });

  /* ---------------- build registry ---------------- */
  const registry = [];
  SH.SpawnBuilds = globalThis.SpawnBuilds = {
    register(name, order, bounds, fn) {
      registry.push({ name, order, bounds, fn });
    },
    list() { return registry.slice().sort((a, b) => a.order - b.order); },
    runAll(log) {
      const errs = [];
      for (const b of SpawnBuilds.list()) {
        W._region = b.bounds; W._regionName = b.name;
        const t0 = Date.now();
        try { b.fn(W, SH.B); } catch (e) { errs.push({ build: b.name, error: e }); }
        if (log) log(b.name + ' built in ' + (Date.now() - t0) + 'ms');
        W._region = null;
      }
      return errs;
    },
  };
})();
