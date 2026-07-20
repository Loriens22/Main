/* =========================================================================
 * SpawnHub — engine: atlas, lighting, mesher, WebGL renderer, sky, controls
 * Browser-only (guarded); node smoke test never calls SpawnEngine.boot().
 * ========================================================================= */
(function () {
  const SH = globalThis.SpawnHub;
  const E = (SH.Engine = {});

  /* ================= texture atlas ================= */
  const ATLAS_TILES = 32;               // 32x32 tiles => 512px
  const TP = 16, ATLAS_PX = ATLAS_TILES * TP;
  const ANIMATED = ['water', 'lava', 'nether_portal', 'fire_tex'];

  E.buildAtlas = function () {
    const names = Object.keys(SH.TILES);
    if (names.length > ATLAS_TILES * ATLAS_TILES) throw new Error('atlas overflow: ' + names.length);
    const data = new Uint8ClampedArray(ATLAS_PX * ATLAS_PX * 4);
    names.forEach((n, i) => {
      SH.TILE_INDEX[n] = i;
      const tx = (i % ATLAS_TILES) * TP, ty = ((i / ATLAS_TILES) | 0) * TP;
      const ctx = SH.makePainterCtx(data, ATLAS_PX, tx, ty, n);
      try { SH.TILES[n](ctx); } catch (e) { console.warn('tile ' + n, e); }
    });
    E.atlasData = data;
    return data;
  };
  E.repaintTile = function (name, frame) {
    const i = SH.TILE_INDEX[name];
    const tx = (i % ATLAS_TILES) * TP, ty = ((i / ATLAS_TILES) | 0) * TP;
    const sub = new Uint8ClampedArray(TP * TP * 4);
    const ctx = SH.makePainterCtx(sub, TP, 0, 0, name + '#' + frame);
    SH.TILES[name](ctx);
    return { tx, ty, sub };
  };
  function uvOf(tile) {
    let i = SH.TILE_INDEX[tile];
    if (i == null) i = SH.TILE_INDEX['stone'] || 0;
    const u = (i % ATLAS_TILES) / ATLAS_TILES, v = ((i / ATLAS_TILES) | 0) / ATLAS_TILES;
    return [u, v];
  }
  const TS = 1 / ATLAS_TILES, EPSU = 0.06 / ATLAS_TILES; // inset to avoid bleeding

  /* ================= lighting ================= */
  E.computeLight = function (onProgress) {
    const W = SH.W, B = SH.BLOCKS;
    const { SX, SY, SZ, blocks } = W;
    const N = SX * SY * SZ;
    const skyL = (E.skyL = new Uint8Array(N));
    const blkL = (E.blkL = new Uint8Array(N));
    const opq = new Uint8Array(N);       // light blockers
    const emit = [];
    for (let i = 0; i < N; i++) {
      const id = blocks[i];
      if (id) {
        const d = B[id];
        if (d.opaque) opq[i] = 1;
        if (d.light) { blkL[i] = d.light; emit.push(i); }
      }
    }
    const strideY = SX * SZ, strideZ = SX;
    // --- sky light: pour straight down, then BFS sideways ---
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let i = (SY - 1) * strideY + z * strideZ + x;
      for (let y = SY - 1; y >= 0; y--, i -= strideY) {
        if (opq[i]) break;
        skyL[i] = 15; q[qt++] = i;
      }
    }
    function neighbors(i, cb) {
      const x = i % SX, zz = ((i / SX) | 0) % SZ, y = (i / strideY) | 0;
      if (x > 0) cb(i - 1); if (x < SX - 1) cb(i + 1);
      if (zz > 0) cb(i - strideZ); if (zz < SZ - 1) cb(i + strideZ);
      if (y > 0) cb(i - strideY); if (y < SY - 1) cb(i + strideY);
    }
    while (qh < qt) {
      const i = q[qh++];
      const l = skyL[i]; if (l <= 1) continue;
      neighbors(i, (j) => { if (!opq[j] && skyL[j] < l - 1) { skyL[j] = l - 1; if (qt < N) q[qt++] = j; else { q.copyWithin(0, qh); qt -= qh; qh = 0; q[qt++] = j; } } });
      if (qh > N - 8) { q.copyWithin(0, qh); qt -= qh; qh = 0; }
    }
    // --- block light BFS ---
    qh = 0; qt = 0;
    for (const i of emit) q[qt++] = i;
    while (qh < qt) {
      const i = q[qh++];
      const l = blkL[i]; if (l <= 1) continue;
      neighbors(i, (j) => { if (!opq[j] && blkL[j] < l - 1) { blkL[j] = l - 1; q[qt++] = j; } });
      if (qh > N - 8) { q.copyWithin(0, qh); qt -= qh; qh = 0; }
    }
    E.opq = opq;
  };

  /* ================= meshing ================= */
  const CHUNK = 16;
  // face defs: [nx,ny,nz, corners(4x3) CCW facing out, tangentU, tangentV]
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.80 },   // +X east
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.80 },  // -X west
    { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0 },    // +Y top
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },  // -Y bottom
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.68 },   // +Z south
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.68 },  // -Z north
  ];
  function faceTile(def, fi) {
    if (fi === 2) return def.tex.top;
    if (fi === 3) return def.tex.bottom;
    if (fi === 5) return def.tex.front; // north face gets 'front'
    return def.tex.side;
  }

  E.buildMeshes = function (onChunk) {
    const W = SH.W, BL = SH.BLOCKS;
    const { SX, SY, SZ, blocks, idx } = W;
    const skyL = E.skyL, blkL = E.blkL, opq = E.opq;
    const chunks = (E.chunks = []);
    const strideY = SX * SZ;

    const getId = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) ? 0 : blocks[idx(x, y, z)];
    const isOpq = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) ? 0 : opq[idx(x, y, z)];
    const lightAt = (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return [4, 15];
      const i = idx(x, y, z); return [blkL[i], skyL[i]];
    };

    function chunkBuild(cx, cz) {
      const x0 = cx * CHUNK, z0 = cz * CHUNK;
      const x1 = Math.min(x0 + CHUNK, SX), z1 = Math.min(z0 + CHUNK, SZ);
      const opaq = { pos: [], attr: [] }, trans = { pos: [], attr: [] };
      let minY = SY, maxY = 0;

      function quad(buf, verts, uvs, bl, sl, ao4, shade, glow) {
        // verts: 4x[x,y,z]; push 2 triangles 0,1,2 0,2,3
        const order = [0, 1, 2, 0, 2, 3];
        // flip quad for better AO interpolation
        const flip = (ao4[0] + ao4[2]) < (ao4[1] + ao4[3]);
        const ord = flip ? [1, 2, 3, 1, 3, 0] : order;
        for (const k of ord) {
          const v = verts[k];
          buf.pos.push(v[0], v[1], v[2], uvs[k][0], uvs[k][1]);
          const blv = Array.isArray(bl) ? bl[k] : bl, slv = Array.isArray(sl) ? sl[k] : sl;
          buf.attr.push(Math.min(255, blv * 17), Math.min(255, slv * 17), Math.max(0, Math.min(255, ao4[k] * shade * 255)), glow ? 255 : 0);
        }
      }

      function emitBox(buf, def, x, y, z, b, glow, faceMask, lightSelf) {
        // b = [x0,y0,z0,x1,y1,z1] in unit cell coords
        const [bx0, by0, bz0, bx1, by1, bz1] = b;
        const [Lb, Ls] = lightSelf;
        for (let fi = 0; fi < 6; fi++) {
          if (faceMask && !faceMask[fi]) continue;
          const f = FACES[fi];
          const tile = faceTile(def, fi);
          const [u0, v0] = uvOf(tile);
          const verts = [], uvs = [];
          for (let k = 0; k < 4; k++) {
            const c = f.c[k];
            const vx = c[0] ? bx1 : bx0, vy = c[1] ? by1 : by0, vz = c[2] ? bz1 : bz0;
            verts.push([x + vx, y + vy, z + vz]);
            // uv: map box extent onto tile
            let uu, vv;
            if (fi === 2 || fi === 3) { uu = vx; vv = vz; }
            else if (fi === 0 || fi === 1) { uu = vz; vv = 1 - vy; }
            else { uu = vx; vv = 1 - vy; }
            uvs.push([u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)]);
          }
          quad(buf, verts, uvs, Lb, Ls, [1, 1, 1, 1], f.shade, glow);
        }
      }

      function emitCross(buf, def, x, y, z, lightSelf, glow, scale, yScale, tileOverride) {
        const [Lb, Ls] = lightSelf;
        const s = scale || 1, h = yScale || 1;
        const a = 0.5 - 0.5 * s * 0.7071, b = 0.5 + 0.5 * s * 0.7071;
        const tile = tileOverride || def.tex.side;
        const [u0, v0] = uvOf(tile);
        const U = (uu, vv) => [u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)];
        const planes = [
          [[a, 0, a], [b, 0, b], [b, h, b], [a, h, a]],
          [[a, 0, b], [b, 0, a], [b, h, a], [a, h, b]],
        ];
        for (const p of planes) {
          const verts = p.map(([px, py, pz]) => [x + px, y + py, z + pz]);
          const uvs = [U(0, 1), U(1, 1), U(1, 0), U(0, 0)];
          // two-sided: emit both windings
          quad(buf, verts, uvs, Lb, Ls, [1, 1, 1, 1], 0.95, glow);
          quad(buf, [verts[3], verts[2], verts[1], verts[0]], [uvs[3], uvs[2], uvs[1], uvs[0]], Lb, Ls, [1, 1, 1, 1], 0.95, glow);
        }
      }

      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
        for (let y = 0; y < SY; y++) {
          const id = blocks[idx(x, y, z)];
          if (!id) continue;
          const def = BL[id];
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          const glow = def.light >= 9;
          const shape = def.shape;

          if (shape === 'cube') {
            const buf = def.cull === 'trans' ? trans : opaq;
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
              const nid = getId(nx, ny, nz);
              if (nid) {
                const nd = BL[nid];
                if (nd.opaque) continue;
                if (def.cull !== 'opaque' && nid === id) continue;              // glass-glass, leaves-leaves
                if (def.cull === 'trans' && nd.cull === 'trans') continue;      // between translucents
              }
              const tile = faceTile(def, fi);
              const [u0, v0] = uvOf(tile);
              const verts = [], uvs = [], aos = [], bls = [], sls = [];
              for (let k = 0; k < 4; k++) {
                const c = f.c[k];
                verts.push([x + c[0], y + c[1], z + c[2]]);
                let uu, vv;
                if (fi === 2 || fi === 3) { uu = c[0]; vv = c[2]; }
                else if (fi === 0 || fi === 1) { uu = c[2]; vv = 1 - c[1]; }
                else { uu = c[0]; vv = 1 - c[1]; }
                uvs.push([u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)]);
                // smooth light + AO at this corner
                // air cell in front of face:
                const ax = x + f.n[0], ay = y + f.n[1], az = z + f.n[2];
                // tangent offsets toward corner
                let t1, t2;
                if (fi === 2 || fi === 3) { t1 = [c[0] ? 1 : -1, 0, 0]; t2 = [0, 0, c[2] ? 1 : -1]; }
                else if (fi === 0 || fi === 1) { t1 = [0, 0, c[2] ? 1 : -1]; t2 = [0, c[1] ? 1 : -1, 0]; }
                else { t1 = [c[0] ? 1 : -1, 0, 0]; t2 = [0, c[1] ? 1 : -1, 0]; }
                const s1 = isOpq(ax + t1[0], ay + t1[1], az + t1[2]);
                const s2 = isOpq(ax + t2[0], ay + t2[1], az + t2[2]);
                const sc = isOpq(ax + t1[0] + t2[0], ay + t1[1] + t2[1], az + t1[2] + t2[2]);
                let ao;
                if (s1 && s2) ao = 0.45; else ao = 1 - (s1 + s2 + sc) * 0.18;
                aos.push(ao);
                // avg light of the 4 cells
                let lb = 0, ls = 0, cnt = 0;
                const cells = [[ax, ay, az], [ax + t1[0], ay + t1[1], az + t1[2]], [ax + t2[0], ay + t2[1], az + t2[2]], [ax + t1[0] + t2[0], ay + t1[1] + t2[1], az + t1[2] + t2[2]]];
                for (const [ccx, ccy, ccz] of cells) {
                  if (isOpq(ccx, ccy, ccz)) continue;
                  const L = lightAt(ccx, ccy, ccz); lb += L[0]; ls += L[1]; cnt++;
                }
                if (!cnt) { const L = lightAt(ax, ay, az); lb = L[0]; ls = L[1]; cnt = 1; }
                bls.push(lb / cnt); sls.push(ls / cnt);
              }
              quad(buf, verts, uvs, bls, sls, aos, f.shade, glow);
            }
            continue;
          }

          if (shape === 'water') {
            const buf = def.cull === 'trans' ? trans : opaq;
            const topAir = getId(x, y + 1, z) !== id;
            const h = topAir ? 0.875 : 1;
            const L = lightAt(x, y, z);
            for (let fi = 0; fi < 6; fi++) {
              const f = FACES[fi];
              const nid = getId(x + f.n[0], y + f.n[1], z + f.n[2]);
              if (nid === id) continue;
              if (nid && BL[nid].opaque) continue;
              if (fi !== 2 && nid && BL[nid].cull === 'trans') continue;
              const b = [0, 0, 0, 1, h, 1];
              emitBox(buf, def, x, y, z, b, glow, [fi === 0, fi === 1, fi === 2, fi === 3, fi === 4, fi === 5], L);
            }
            continue;
          }

          // ---- non-cube shapes ----
          const L = lightAt(x, y, z);
          const buf = def.cull === 'trans' ? trans : opaq;
          const P = (b) => emitBox(buf, def, x, y, z, b, glow, null, L);
          const dir = def.data && def.data.dir;
          switch (shape) {
            case 'cross': emitCross(buf, def, x, y, z, L, glow); break;
            case 'slab': P([0, 0, 0, 1, 0.5, 1]); break;
            case 'slab_t': P([0, 0.5, 0, 1, 1, 1]); break;
            case 'stair': case 'stair_f': {
              const flip = shape === 'stair_f';
              P(flip ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]);
              let hb;
              if (dir === 'N') hb = [0, 0, 0, 1, 1, 0.5];
              else if (dir === 'S') hb = [0, 0, 0.5, 1, 1, 1];
              else if (dir === 'W') hb = [0, 0, 0, 0.5, 1, 1];
              else hb = [0.5, 0, 0, 1, 1, 1];
              if (flip) hb = [hb[0], 0, hb[2], hb[3], 0.5, hb[5]];
              P(hb);
              break;
            }
            case 'carpet': P([0, 0, 0, 1, 0.0625, 1]); break;
            case 'plate': P([0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375]); break;
            case 'trapdoor_b': P([0, 0, 0, 1, 0.1875, 1]); break;
            case 'trapdoor_t': P([0, 0.8125, 0, 1, 1, 1]); break;
            case 'fence': {
              P([0.375, 0, 0.375, 0.625, 1, 0.625]);
              const conn = (dx, dz) => { const nid2 = getId(x + dx, y, z + dz); if (!nid2) return false; const nd = BL[nid2]; return nd.opaque || nd.shape === 'fence' || nd.shape === 'wallblock'; };
              if (conn(0, -1)) P([0.4375, 0.35, 0, 0.5625, 0.9, 0.375]);
              if (conn(0, 1)) P([0.4375, 0.35, 0.625, 0.5625, 0.9, 1]);
              if (conn(-1, 0)) P([0, 0.35, 0.4375, 0.375, 0.9, 0.5625]);
              if (conn(1, 0)) P([0.625, 0.35, 0.4375, 1, 0.9, 0.5625]);
              break;
            }
            case 'wallblock': {
              P([0.25, 0, 0.25, 0.75, 1, 0.75]);
              const conn = (dx, dz) => { const nid2 = getId(x + dx, y, z + dz); if (!nid2) return false; const nd = BL[nid2]; return nd.opaque || nd.shape === 'wallblock' || nd.shape === 'fence'; };
              if (conn(0, -1)) P([0.3125, 0, 0, 0.6875, 0.875, 0.25]);
              if (conn(0, 1)) P([0.3125, 0, 0.75, 0.6875, 0.875, 1]);
              if (conn(-1, 0)) P([0, 0, 0.3125, 0.25, 0.875, 0.6875]);
              if (conn(1, 0)) P([0.75, 0, 0.3125, 1, 0.875, 0.6875]);
              break;
            }
            case 'pillarblock': P([0.125, 0, 0.125, 0.875, 1, 0.875]); break;
            case 'pane': {
              const conn = (dx, dz) => { const nid2 = getId(x + dx, y, z + dz); if (!nid2) return false; const nd = BL[nid2]; return nd.opaque || nd.shape === 'pane' || nd.cull === 'trans'; };
              const n = conn(0, -1), s = conn(0, 1), w = conn(-1, 0), e = conn(1, 0);
              if (!n && !s && !w && !e) { P([0.4375, 0, 0, 0.5625, 1, 1]); P([0, 0, 0.4375, 1, 1, 0.5625]); break; }
              P([0.4375, 0, 0.4375, 0.5625, 1, 0.5625]);
              if (n) P([0.4375, 0, 0, 0.5625, 1, 0.4375]);
              if (s) P([0.4375, 0, 0.5625, 0.5625, 1, 1]);
              if (w) P([0, 0, 0.4375, 0.4375, 1, 0.5625]);
              if (e) P([0.5625, 0, 0.4375, 1, 1, 0.5625]);
              break;
            }
            case 'torch': P([0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]); break;
            case 'walltorch': {
              const off = 0.28;
              const dx2 = dir === 'E' ? off : dir === 'W' ? -off : 0;
              const dz2 = dir === 'S' ? off : dir === 'N' ? -off : 0;
              P([0.4375 - dx2, 0.2, 0.4375 - dz2, 0.5625 - dx2, 0.8, 0.5625 - dz2]);
              break;
            }
            case 'lantern': P([0.3125, 0, 0.3125, 0.6875, 0.4375, 0.6875]); P([0.4375, 0.4375, 0.4375, 0.5625, 0.5625, 0.5625]); break;
            case 'lantern_hang': P([0.3125, 0.375, 0.3125, 0.6875, 0.8125, 0.6875]); P([0.4375, 0.8125, 0.4375, 0.5625, 1, 0.5625]); break;
            case 'chain': P([0.4375, 0, 0.4375, 0.5625, 1, 0.5625]); break;
            case 'campfire': {
              emitBox(buf, { tex: { top: def.tex.side, bottom: def.tex.side, side: def.tex.side, front: def.tex.side } }, x, y, z, [0, 0, 0.125, 1, 0.25, 0.375], false, null, L);
              emitBox(buf, { tex: { top: def.tex.side, bottom: def.tex.side, side: def.tex.side, front: def.tex.side } }, x, y, z, [0, 0, 0.625, 1, 0.25, 0.875], false, null, L);
              emitBox(buf, { tex: { top: def.tex.side, bottom: def.tex.side, side: def.tex.side, front: def.tex.side } }, x, y, z, [0.125, 0.05, 0, 0.375, 0.3, 1], false, null, L);
              emitBox(buf, { tex: { top: def.tex.side, bottom: def.tex.side, side: def.tex.side, front: def.tex.side } }, x, y, z, [0.625, 0.05, 0, 0.875, 0.3, 1], false, null, L);
              emitCross(buf, def, x, y + 0.2, z, L, true, 0.8, 0.7, def.tex.top);
              break;
            }
            case 'flat': { // lily pad etc: single horizontal quad
              const [u0, v0] = uvOf(def.tex.side);
              const U = (uu, vv) => [u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)];
              const yy = y + 0.07;
              const verts = [[x, yy, z], [x, yy, z + 1], [x + 1, yy, z + 1], [x + 1, yy, z]];
              const uvs = [U(0, 0), U(0, 1), U(1, 1), U(1, 0)];
              // pads sit on water: light of cell above
              const L2 = lightAt(x, y + 1, z);
              const q1 = (b, u) => { };
              // two-sided
              (function () {
                const bufX = buf;
                const push = (vv, uu) => { for (const k of [0, 1, 2, 0, 2, 3]) { const v = vv[k]; bufX.pos.push(v[0], v[1], v[2], uu[k][0], uu[k][1]); bufX.attr.push(Math.min(255, L2[0] * 17), Math.min(255, L2[1] * 17), 240, 0); } };
                push(verts, uvs); push([verts[3], verts[2], verts[1], verts[0]], [uvs[3], uvs[2], uvs[1], uvs[0]]);
              })();
              break;
            }
            case 'rail': {
              const rot = def.data && def.data.rot;
              const [u0, v0] = uvOf(def.tex.side);
              const U = (uu, vv) => [u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)];
              const yy = y + 0.06;
              const verts = [[x, yy, z], [x, yy, z + 1], [x + 1, yy, z + 1], [x + 1, yy, z]];
              const uvs = rot ? [U(0, 0), U(1, 0), U(1, 1), U(0, 1)] : [U(0, 0), U(0, 1), U(1, 1), U(1, 0)];
              const L2 = lightAt(x, y, z);
              const push = (vv, uu) => { for (const k of [0, 1, 2, 0, 2, 3]) { const v = vv[k]; buf.pos.push(v[0], v[1], v[2], uu[k][0], uu[k][1]); buf.attr.push(Math.min(255, L2[0] * 17), Math.min(255, L2[1] * 17), 240, 0); } };
              push(verts, uvs); push([verts[3], verts[2], verts[1], verts[0]], [uvs[3], uvs[2], uvs[1], uvs[0]]);
              break;
            }
            case 'wallflat': {
              const th = 0.06;
              if (dir === 'N') P([0, 0, 0, 1, 1, th]);
              else if (dir === 'S') P([0, 0, 1 - th, 1, 1, 1]);
              else if (dir === 'W') P([0, 0, 0, th, 1, 1]);
              else P([1 - th, 0, 0, 1, 1, 1]);
              break;
            }
            case 'wallsign': {
              const th = 0.12;
              if (dir === 'N') P([0.06, 0.28, 0, 0.94, 0.78, th]);
              else if (dir === 'S') P([0.06, 0.28, 1 - th, 0.94, 0.78, 1]);
              else if (dir === 'W') P([0, 0.28, 0.06, th, 0.78, 0.94]);
              else P([1 - th, 0.28, 0.06, 1, 0.78, 0.94]);
              break;
            }
            case 'frame': {
              const th = 0.08;
              const fdef = { tex: { top: def.tex.top, bottom: def.tex.top, side: def.tex.top, front: def.tex.top } };
              const idef = def.tex.side;
              if (dir === 'N') { emitBox(buf, fdef, x, y, z, [0.12, 0.12, 0, 0.88, 0.88, th], false, null, L); emitCrossFlatWall(buf, idef, x, y, z, 'N', th + 0.01, L); }
              else if (dir === 'S') { emitBox(buf, fdef, x, y, z, [0.12, 0.12, 1 - th, 0.88, 0.88, 1], false, null, L); emitCrossFlatWall(buf, idef, x, y, z, 'S', th + 0.01, L); }
              else if (dir === 'W') { emitBox(buf, fdef, x, y, z, [0, 0.12, 0.12, th, 0.88, 0.88], false, null, L); emitCrossFlatWall(buf, idef, x, y, z, 'W', th + 0.01, L); }
              else { emitBox(buf, fdef, x, y, z, [1 - th, 0.12, 0.12, 1, 0.88, 0.88], false, null, L); emitCrossFlatWall(buf, idef, x, y, z, 'E', th + 0.01, L); }
              break;
            }
            case 'door': {
              const th = 0.19;
              if (dir === 'N') P([0, 0, 0, 1, 1, th]);
              else if (dir === 'S') P([0, 0, 1 - th, 1, 1, 1]);
              else if (dir === 'W') P([0, 0, 0, th, 1, 1]);
              else P([1 - th, 0, 0, 1, 1, 1]);
              break;
            }
            case 'sign': { P([0.4375, 0, 0.4375, 0.5625, 0.55, 0.5625]); P([0.05, 0.55, 0.41, 0.95, 1, 0.59]); break; }
            case 'anvil': { P([0.125, 0, 0.125, 0.875, 0.25, 0.875]); P([0.3, 0.25, 0.35, 0.7, 0.62, 0.65]); P([0.18, 0.62, 0.25, 0.82, 1, 0.75]); break; }
            case 'lectern': { P([0.06, 0, 0.06, 0.94, 0.12, 0.94]); P([0.34, 0.12, 0.34, 0.66, 0.75, 0.66]); P([0.1, 0.75, 0.12, 0.9, 0.95, 0.88]); break; }
            case 'brewing': { P([0.1, 0, 0.1, 0.9, 0.125, 0.9]); P([0.4375, 0.125, 0.4375, 0.5625, 0.875, 0.5625]); P([0.2, 0.35, 0.45, 0.8, 0.45, 0.55]); break; }
            case 'enchant': { P([0, 0, 0, 1, 0.75, 1]); break; }
            case 'cake': { P([0.0625, 0, 0.0625, 0.9375, 0.5, 0.9375]); break; }
            case 'ball': { P([0.25, 0, 0.25, 0.75, 0.5, 0.75]); break; }
            case 'bell': { P([0.3125, 0.4, 0.3125, 0.6875, 0.85, 0.6875]); P([0.42, 0.85, 0.42, 0.58, 1, 0.58]); break; }
            case 'pot': P([0.3125, 0, 0.3125, 0.6875, 0.375, 0.6875]); break;
            case 'potted': { P([0.3125, 0, 0.3125, 0.6875, 0.375, 0.6875]); emitCross(buf, def, x, y + 0.3, z, L, false, 0.55, 0.55, def.tex.side); break; }
            case 'bamboo': P([0.42, 0, 0.42, 0.58, 1, 0.58]); break;
            case 'cone': { P([0.25, 0.5, 0.25, 0.75, 1, 0.75]); P([0.375, 0, 0.375, 0.625, 0.5, 0.625]); break; }
            case 'bed': P([0, 0, 0, 1, 0.5625, 1]); break;
            case 'armor_stand': {
              P([0.1875, 0, 0.1875, 0.8125, 0.0625, 0.8125]);
              P([0.4375, 0.0625, 0.4375, 0.5625, 0.6875, 0.5625]);
              P([0.25, 0.6875, 0.4, 0.75, 0.8125, 0.6]);
              emitBox(buf, { tex: { top: def.tex.top, bottom: def.tex.top, side: def.tex.top, front: def.tex.top } }, x, y, z, [0.375, 0.8125, 0.375, 0.625, 1, 0.625], false, null, L);
              break;
            }
            default: P([0.25, 0, 0.25, 0.75, 0.5, 0.75]);
          }
        }
      }

      function emitCrossFlatWall(buf, tile, x, y, z, d, off, L) {
        const [u0, v0] = uvOf(tile);
        const U = (uu, vv) => [u0 + EPSU + uu * (TS - 2 * EPSU), v0 + EPSU + vv * (TS - 2 * EPSU)];
        let verts;
        if (d === 'N') verts = [[x + 0.2, y + 0.2, z + off], [x + 0.8, y + 0.2, z + off], [x + 0.8, y + 0.8, z + off], [x + 0.2, y + 0.8, z + off]];
        else if (d === 'S') verts = [[x + 0.8, y + 0.2, z + 1 - off], [x + 0.2, y + 0.2, z + 1 - off], [x + 0.2, y + 0.8, z + 1 - off], [x + 0.8, y + 0.8, z + 1 - off]];
        else if (d === 'W') verts = [[x + off, y + 0.2, z + 0.8], [x + off, y + 0.2, z + 0.2], [x + off, y + 0.8, z + 0.2], [x + off, y + 0.8, z + 0.8]];
        else verts = [[x + 1 - off, y + 0.2, z + 0.2], [x + 1 - off, y + 0.2, z + 0.8], [x + 1 - off, y + 0.8, z + 0.8], [x + 1 - off, y + 0.8, z + 0.2]];
        const uvs = [U(0, 1), U(1, 1), U(1, 0), U(0, 0)];
        for (const k of [0, 1, 2, 0, 2, 3]) { const v = verts[k]; buf.pos.push(v[0], v[1], v[2], uvs[k][0], uvs[k][1]); buf.attr.push(Math.min(255, L[0] * 17), Math.min(255, L[1] * 17), 255, 0); }
      }

      return {
        cx, cz,
        aabb: [x0, Math.max(0, minY - 1), z0, x1, Math.min(SY, maxY + 2), z1],
        opaq: { pos: new Float32Array(opaq.pos), attr: new Uint8Array(opaq.attr) },
        trans: { pos: new Float32Array(trans.pos), attr: new Uint8Array(trans.attr) },
      };
    }

    const NCX = Math.ceil(SX / CHUNK), NCZ = Math.ceil(SZ / CHUNK);
    const jobs = [];
    for (let cz = 0; cz < NCZ; cz++) for (let cx = 0; cx < NCX; cx++) jobs.push([cx, cz]);
    return { jobs, chunkBuild, chunks };
  };

  /* ================= matrices ================= */
  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
  }
  function mat4LookAt(out, eye, center, up) {
    const [ex, ey, ez] = eye;
    let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out.set([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1]);
  }
  function mat4Mul(out, a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    out.set(o);
  }

  /* ================= renderer ================= */
  E.boot = function (opts) {
    const W = SH.W;
    const canvas = document.getElementById('c');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) { document.getElementById('loadmsg').textContent = 'WebGL not available :('; return; }
    E.gl = gl;

    function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src); return s; }
    function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

    const worldVS = `
      attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aL;
      uniform mat4 uVP; varying vec2 vUV; varying vec4 vL; varying float vDist;
      void main(){ vUV=aUV; vL=aL; vec4 p=uVP*vec4(aPos,1.0); gl_Position=p; vDist=p.w; }`;
    const worldFS = `
      precision mediump float;
      varying vec2 vUV; varying vec4 vL; varying float vDist;
      uniform sampler2D uTex; uniform float uCutoff; uniform vec3 uFog; uniform float uT;
      void main(){
        vec4 tex = texture2D(uTex, vUV);
        if (tex.a < uCutoff) discard;
        float bl = vL.x; float sl = vL.y; float ao = vL.z;
        float flick = 1.0 + 0.04*sin(uT*7.0 + vUV.x*300.0) ;
        vec3 blockC = vec3(1.0,0.82,0.58) * bl * flick;
        vec3 skyC = vec3(0.5,0.62,0.95) * sl * 0.48;
        vec3 L = max(blockC, skyC) + vec3(0.05,0.055,0.075);
        if (vL.w > 0.5) L = max(L, vec3(1.0));
        vec3 col = tex.rgb * L * ao;
        float f = clamp(exp(-vDist*0.0035), 0.0, 1.0);
        col = mix(uFog, col, f);
        gl_FragColor = vec4(col, tex.a);
      }`;
    const pWorld = prog(worldVS, worldFS);

    const skyVS = `
      attribute vec2 aP; varying vec2 vP;
      void main(){ vP=aP; gl_Position=vec4(aP,0.9999,1.0); }`;
    const skyFS = `
      precision mediump float;
      varying vec2 vP;
      uniform vec3 uFwd,uRight,uUp; uniform vec2 uScale; uniform float uT;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 dir = normalize(uFwd + uRight*vP.x*uScale.x + uUp*vP.y*uScale.y);
        float h = clamp(dir.y, -0.1, 1.0);
        vec3 col = mix(vec3(0.045,0.06,0.11), vec3(0.004,0.006,0.016), smoothstep(-0.05,0.5,h));
        // stars
        if (dir.y > -0.02) {
          vec2 sp = dir.xz/(dir.y+0.25);
          vec2 cellId = floor(sp*46.0);
          float st = hash(cellId);
          if (st > 0.92) {
            vec2 fr = fract(sp*46.0)-0.5;
            float d = length(fr);
            float tw = 0.75+0.25*sin(uT*(1.0+st*3.0)+st*40.0);
            float b = smoothstep(0.12,0.02,d)*(st-0.92)/0.08*tw;
            col += vec3(b)*vec3(0.9,0.93,1.0);
          }
        }
        gl_FragColor = vec4(col,1.0);
      }`;
    const pSky = prog(skyVS, skyFS);

    const moonVS = `
      attribute vec3 aPos; attribute vec2 aUV; uniform mat4 uVP; varying vec2 vUV;
      void main(){ vUV=aUV; gl_Position=uVP*vec4(aPos,1.0); }`;
    const moonFS = `
      precision mediump float; varying vec2 vUV; uniform sampler2D uTex; uniform float uGlow;
      void main(){
        if (uGlow > 0.5) {
          float d = length(vUV-0.5)*2.0;
          float a = smoothstep(1.0,0.0,d)*0.18;
          gl_FragColor = vec4(0.75,0.8,0.95,a);
        } else {
          vec4 t = texture2D(uTex, vUV);
          gl_FragColor = vec4(t.rgb*1.02, 1.0);
        }
      }`;
    const pMoon = prog(moonVS, moonFS);

    const partVS = `
      attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
      uniform mat4 uVP; varying vec4 vCol;
      void main(){ vCol=aCol; vec4 p=uVP*vec4(aPos,1.0); gl_Position=p; gl_PointSize = aSize*160.0/max(p.w,1.0); }`;
    const partFS = `
      precision mediump float; varying vec4 vCol;
      void main(){
        vec2 d = gl_PointCoord-0.5;
        if (dot(d,d)>0.25) discard;
        gl_FragColor = vCol;
      }`;
    const pPart = prog(partVS, partFS);

    /* --- atlas texture --- */
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_PX, ATLAS_PX, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(E.atlasData.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /* --- chunk GPU buffers --- */
    const gpuChunks = [];
    for (const ch of E.chunks) {
      const mk = (m) => {
        if (!m.pos.length) return null;
        const vboP = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboP); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
        const vboA = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vboA); gl.bufferData(gl.ARRAY_BUFFER, m.attr, gl.STATIC_DRAW);
        return { vboP, vboA, n: m.pos.length / 5 };
      };
      gpuChunks.push({ aabb: ch.aabb, opaq: mk(ch.opaq), trans: mk(ch.trans) });
    }
    E.chunks = null; // free CPU copies

    /* --- moon geometry --- */
    const moonDir = [0.55, 0.62, -0.42];
    (function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]); v[0] /= l; v[1] /= l; v[2] /= l; })(moonDir);
    const moonBuf = gl.createBuffer();
    const moonGlowBuf = gl.createBuffer();

    /* --- particles --- */
    const PMAX = 900;
    const pData = new Float32Array(PMAX * 8); // x,y,z,r,g,b,a,size
    const parts = [];
    const pVbo = gl.createBuffer();
    // gather emitters
    const emitters = { smoke: [], ember: [], firefly: [] };
    {
      const { SX, SY, SZ, blocks, idx } = W;
      const idCampfire = SH.BLOCK_BY_NAME['CAMPFIRE'], idLava = SH.BLOCK_BY_NAME['LAVA'], idTorch = SH.BLOCK_BY_NAME['TORCH'];
      for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
        const id = blocks[idx(x, y, z)];
        if (!id) continue;
        if (id === idCampfire) { emitters.smoke.push([x + 0.5, y + 0.5, z + 0.5]); emitters.ember.push([x + 0.5, y + 0.4, z + 0.5]); }
        else if (id === idLava && (y + 1 >= SY || !blocks[idx(x, y + 1, z)])) { emitters.ember.push([x + 0.5, y + 1, z + 0.5]); if (Math.random() < 0.3) emitters.smoke.push([x + 0.5, y + 1, z + 0.5]); }
      }
      // fireflies around pond area
      for (let i = 0; i < 26; i++) emitters.firefly.push([150 + Math.random() * 40, W.GROUND + 1.5 + Math.random() * 3, 180 + Math.random() * 46]);
      if (emitters.ember.length > 260) emitters.ember.length = 260;
      if (emitters.smoke.length > 200) emitters.smoke.length = 200;
    }

    function spawnParticles(dt) {
      const want = Math.min(3, Math.ceil(dt * 120));
      for (let k = 0; k < want; k++) {
        if (parts.length >= PMAX - 1) break;
        const r = Math.random();
        if (r < 0.45 && emitters.ember.length) {
          const e = emitters.ember[(Math.random() * emitters.ember.length) | 0];
          parts.push({ x: e[0] + (Math.random() - .5) * .6, y: e[1], z: e[2] + (Math.random() - .5) * .6, vx: (Math.random() - .5) * .3, vy: 0.8 + Math.random() * 1.2, vz: (Math.random() - .5) * .3, life: 1.2 + Math.random(), t: 0, kind: 0 });
        } else if (r < 0.8 && emitters.smoke.length) {
          const e = emitters.smoke[(Math.random() * emitters.smoke.length) | 0];
          parts.push({ x: e[0] + (Math.random() - .5) * .4, y: e[1], z: e[2] + (Math.random() - .5) * .4, vx: (Math.random() - .5) * .15, vy: 0.5 + Math.random() * .5, vz: (Math.random() - .5) * .15, life: 2.5 + Math.random() * 2, t: 0, kind: 1 });
        } else if (emitters.firefly.length) {
          const e = emitters.firefly[(Math.random() * emitters.firefly.length) | 0];
          parts.push({ x: e[0], y: e[1], z: e[2], vx: (Math.random() - .5), vy: (Math.random() - .5) * .4, vz: (Math.random() - .5), life: 3 + Math.random() * 3, t: 0, kind: 2 });
        }
      }
    }
    function updateParticles(dt) {
      spawnParticles(dt);
      let n = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t > p.life) { parts.splice(i, 1); continue; }
        if (p.kind === 2) { p.vx += (Math.random() - .5) * dt * 3; p.vz += (Math.random() - .5) * dt * 3; p.vy += (Math.random() - .5) * dt * 2; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const f = 1 - p.t / p.life;
        let r, g, b, a, s;
        if (p.kind === 0) { r = 1; g = 0.55 * f + 0.2; b = 0.1; a = Math.min(1, f * 1.6); s = 0.05 + 0.04 * f; }
        else if (p.kind === 1) { const gg = 0.32 + 0.1 * (1 - f); r = gg; g = gg; b = gg + 0.02; a = 0.25 * f; s = 0.12 + 0.3 * (1 - f); }
        else { const tw = 0.5 + 0.5 * Math.sin(p.t * 6 + p.x); r = 0.8; g = 1; b = 0.3; a = 0.85 * f * tw; s = 0.05; }
        const o = n * 8;
        pData[o] = p.x; pData[o + 1] = p.y; pData[o + 2] = p.z; pData[o + 3] = r; pData[o + 4] = g; pData[o + 5] = b; pData[o + 6] = a; pData[o + 7] = s;
        n++;
      }
      return n;
    }

    /* --- camera / controls --- */
    const cam = E.cam = {
      target: [144, W.GROUND + 4, 150], yaw: 2.4, pitch: -0.42, dist: 60,
      auto: true, autoT: 0,
    };
    E.setView = function (v) {
      cam.target = v.target.slice(); cam.yaw = v.yaw; cam.pitch = v.pitch; cam.dist = v.dist; cam.auto = v.auto !== undefined ? v.auto : false;
    };
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.code] = 1; cam.auto = false; });
    window.addEventListener('keyup', e => { keys[e.code] = 0; });
    let dragging = 0, lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', e => { dragging = e.button === 2 ? 2 : 1; lastX = e.clientX; lastY = e.clientY; cam.auto = false; e.preventDefault(); });
    window.addEventListener('mouseup', () => dragging = 0);
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      if (dragging === 1) { cam.yaw -= dx * 0.008; cam.pitch = Math.max(-1.5, Math.min(0.6, cam.pitch - dy * 0.006)); }
      else panCam(dx, dy);
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { cam.dist = Math.max(4, Math.min(260, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); cam.auto = false; e.preventDefault(); }, { passive: false });
    // touch
    let touches = [];
    canvas.addEventListener('touchstart', e => { touches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier })); cam.auto = false; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      const cur = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier }));
      if (cur.length === 1 && touches.length >= 1) {
        const dx = cur[0].x - touches[0].x, dy = cur[0].y - touches[0].y;
        cam.yaw -= dx * 0.008; cam.pitch = Math.max(-1.5, Math.min(0.6, cam.pitch - dy * 0.006));
      } else if (cur.length >= 2 && touches.length >= 2) {
        const d0 = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
        if (d0 > 0) cam.dist = Math.max(4, Math.min(260, cam.dist * d0 / Math.max(1, d1)));
        const mx0 = (touches[0].x + touches[1].x) / 2, my0 = (touches[0].y + touches[1].y) / 2;
        const mx1 = (cur[0].x + cur[1].x) / 2, my1 = (cur[0].y + cur[1].y) / 2;
        panCam(mx1 - mx0, my1 - my0);
      }
      touches = cur; e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => { touches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier })); }, { passive: false });

    function panCam(dx, dy) {
      const s = cam.dist * 0.0022;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      cam.target[0] += (-cy * dx - sy * dy * 0.8) * s;
      cam.target[2] += (-sy * dx + cy * dy * 0.8) * s;
    }

    /* --- render loop --- */
    const proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    let lastT = performance.now() / 1000, animT = 0, frameC = 0;
    const fogColor = [0.02, 0.028, 0.055];

    function frustumPlanes(m) {
      // rows of m^T combos
      const p = [];
      const r = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
      const r0 = r(0), r1 = r(1), r2 = r(2), r3 = r(3);
      const add = (a, b, s) => p.push([b[0] + s * a[0], b[1] + s * a[1], b[2] + s * a[2], b[3] + s * a[3]]);
      add(r0, r3, 1); add(r0, r3, -1); add(r1, r3, 1); add(r1, r3, -1); add(r2, r3, 1); add(r2, r3, -1);
      return p;
    }
    function aabbVisible(planes, a) {
      for (const pl of planes) {
        const px = pl[0] > 0 ? a[3] : a[0], py = pl[1] > 0 ? a[4] : a[1], pz = pl[2] > 0 ? a[5] : a[2];
        if (pl[0] * px + pl[1] * py + pl[2] * pz + pl[3] < 0) return false;
      }
      return true;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = (canvas.clientWidth * dpr) | 0, h = (canvas.clientHeight * dpr) | 0;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    let statEl = document.getElementById('stats');
    function loop() {
      requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      let dt = Math.min(0.1, now - lastT); lastT = now;
      animT += dt; frameC++;
      resize();

      // input
      const spd = (keys['ShiftLeft'] ? 3 : 1) * 18 * dt;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      if (keys['KeyW']) { cam.target[0] += sy * spd; cam.target[2] -= cy * spd; cam.auto = false; }
      if (keys['KeyS']) { cam.target[0] -= sy * spd; cam.target[2] += cy * spd; cam.auto = false; }
      if (keys['KeyA']) { cam.target[0] -= cy * spd; cam.target[2] -= sy * spd; cam.auto = false; }
      if (keys['KeyD']) { cam.target[0] += cy * spd; cam.target[2] += sy * spd; cam.auto = false; }
      if (keys['KeyQ'] || keys['Space']) cam.target[1] += spd;
      if (keys['KeyE'] || keys['ControlLeft']) cam.target[1] -= spd;
      cam.target[1] = Math.max(2, Math.min(94, cam.target[1]));
      if (cam.auto) { cam.yaw += dt * 0.05; }

      const eye = [
        cam.target[0] - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
        cam.target[1] - Math.sin(cam.pitch) * cam.dist,
        cam.target[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      ];
      const aspect = canvas.width / canvas.height;
      mat4Perspective(proj, 1.15, aspect, 0.2, 900);
      mat4LookAt(view, eye, cam.target, [0, 1, 0]);
      mat4Mul(vp, proj, view);
      const planes = frustumPlanes(vp);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // ---- sky ----
      gl.useProgram(pSky);
      gl.depthMask(false);
      const fwd = [cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]];
      let fl = Math.hypot(fwd[0], fwd[1], fwd[2]); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
      let right = [fwd[2] * 0 - 0 * fwd[1], 0 * fwd[0] - fwd[2] * 1, fwd[1] * 1 - fwd[0] * 0]; // fwd x up(0,1,0) -> actually up x fwd; fix below
      right = [-fwd[2], 0, fwd[0]];
      let rl = Math.hypot(right[0], right[1], right[2]) || 1; right = [right[0] / rl, right[1] / rl, right[2] / rl];
      const up2 = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      const tanF = Math.tan(1.15 / 2);
      gl.uniform3fv(gl.getUniformLocation(pSky, 'uFwd'), fwd);
      gl.uniform3fv(gl.getUniformLocation(pSky, 'uRight'), right);
      gl.uniform3fv(gl.getUniformLocation(pSky, 'uUp'), up2);
      gl.uniform2f(gl.getUniformLocation(pSky, 'uScale'), tanF * aspect, tanF);
      gl.uniform1f(gl.getUniformLocation(pSky, 'uT'), animT);
      if (!E._skyVbo) {
        E._skyVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, E._skyVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, E._skyVbo);
      const aP = gl.getAttribLocation(pSky, 'aP');
      gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ---- moon (billboard quad far away) ----
      gl.useProgram(pMoon);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const mc = [eye[0] + moonDir[0] * 700, eye[1] + moonDir[1] * 700, eye[2] + moonDir[2] * 700];
      const mr = [-moonDir[2], 0, moonDir[0]]; const mrl = Math.hypot(mr[0], mr[2]) || 1; mr[0] /= mrl; mr[2] /= mrl;
      const mu = [mr[1] * moonDir[2] - mr[2] * moonDir[1], mr[2] * moonDir[0] - mr[0] * moonDir[2], mr[0] * moonDir[1] - mr[1] * moonDir[0]];
      function moonQuad(buf2, size) {
        const [u0, v0] = uvOf('moon');
        const q = [];
        const corn = [[-1, -1, u0 + EPSU, v0 + TS - EPSU], [1, -1, u0 + TS - EPSU, v0 + TS - EPSU], [1, 1, u0 + TS - EPSU, v0 + EPSU], [-1, 1, u0 + EPSU, v0 + EPSU]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const c = corn[k];
          q.push(mc[0] + (mr[0] * c[0] + mu[0] * c[1]) * size, mc[1] + (mr[1] * c[0] + mu[1] * c[1]) * size, mc[2] + (mr[2] * c[0] + mu[2] * c[1]) * size, c[2], c[3]);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.DYNAMIC_DRAW);
      }
      const aMP = gl.getAttribLocation(pMoon, 'aPos'), aMU = gl.getAttribLocation(pMoon, 'aUV');
      gl.uniformMatrix4fv(gl.getUniformLocation(pMoon, 'uVP'), false, vp);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(pMoon, 'uTex'), 0);
      // glow first
      gl.uniform1f(gl.getUniformLocation(pMoon, 'uGlow'), 1);
      moonQuad(moonGlowBuf, 90);
      gl.enableVertexAttribArray(aMP); gl.vertexAttribPointer(aMP, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(aMU); gl.vertexAttribPointer(aMU, 2, gl.FLOAT, false, 20, 12);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.uniform1f(gl.getUniformLocation(pMoon, 'uGlow'), 0);
      moonQuad(moonBuf, 34);
      gl.vertexAttribPointer(aMP, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(aMU, 2, gl.FLOAT, false, 20, 12);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disable(gl.BLEND);
      gl.depthMask(true);

      // ---- world ----
      gl.useProgram(pWorld);
      gl.uniformMatrix4fv(gl.getUniformLocation(pWorld, 'uVP'), false, vp);
      gl.uniform1i(gl.getUniformLocation(pWorld, 'uTex'), 0);
      gl.uniform3fv(gl.getUniformLocation(pWorld, 'uFog'), fogColor);
      gl.uniform1f(gl.getUniformLocation(pWorld, 'uT'), animT);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const locP = gl.getAttribLocation(pWorld, 'aPos'), locU = gl.getAttribLocation(pWorld, 'aUV'), locL = gl.getAttribLocation(pWorld, 'aL');
      const cutoffLoc = gl.getUniformLocation(pWorld, 'uCutoff');
      gl.uniform1f(cutoffLoc, 0.5);
      let drawn = 0, tris = 0;
      function drawMesh(m) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vboP);
        gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(locU); gl.vertexAttribPointer(locU, 2, gl.FLOAT, false, 20, 12);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vboA);
        gl.enableVertexAttribArray(locL); gl.vertexAttribPointer(locL, 4, gl.UNSIGNED_BYTE, true, 4, 0);
        gl.drawArrays(gl.TRIANGLES, 0, m.n);
        tris += m.n / 3;
      }
      const visible = [];
      for (const ch of gpuChunks) { if (aabbVisible(planes, ch.aabb)) { visible.push(ch); if (ch.opaq) { drawMesh(ch.opaq); drawn++; } } }
      // translucent pass
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(cutoffLoc, 0.02);
      for (const ch of visible) if (ch.trans) drawMesh(ch.trans);

      // ---- particles ----
      const np = updateParticles(dt);
      if (np > 0) {
        gl.useProgram(pPart);
        gl.uniformMatrix4fv(gl.getUniformLocation(pPart, 'uVP'), false, vp);
        gl.bindBuffer(gl.ARRAY_BUFFER, pVbo);
        gl.bufferData(gl.ARRAY_BUFFER, pData.subarray(0, np * 8), gl.DYNAMIC_DRAW);
        const lp = gl.getAttribLocation(pPart, 'aPos'), lc = gl.getAttribLocation(pPart, 'aCol'), ls = gl.getAttribLocation(pPart, 'aSize');
        gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(ls); gl.vertexAttribPointer(ls, 1, gl.FLOAT, false, 32, 28);
        gl.drawArrays(gl.POINTS, 0, np);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      // ---- animated tiles ----
      if ((frameC & 7) === 0) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        for (const nm of ANIMATED) {
          const { tx, ty, sub } = E.repaintTile(nm, frameC >> 3);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, tx, ty, TP, TP, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(sub.buffer));
        }
      }

      if (statEl && (frameC & 31) === 0) statEl.textContent = (tris | 0).toLocaleString() + ' tris · ' + drawn + ' chunks';
    }
    loop();
  };
})();
