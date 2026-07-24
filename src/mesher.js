/* =====================================================================
   MESHER  —  turns the voxel volume into GPU-ready chunk meshes.
   Handles sub-voxel block shapes (slabs, stairs, fences, panes, torches,
   furniture...), face culling, ambient occlusion and smooth lighting.
   ===================================================================== */

(function (root) {
  'use strict';

  const S = 1 / 16;

  /* ------------------------------------------------------------------ */
  /* SHAPES — canonical boxes, facing "north" (-Z). Rotated at mesh time */
  /* ------------------------------------------------------------------ */
  const SHAPES = {
    full: [[0, 0, 0, 1, 1, 1]],
    slab: [[0, 0, 0, 1, .5, 1]],
    carpet: [[0, 0, 0, 1, S, 1]],
    plate: [[S, 0, S, 1 - S, S, 1 - S]],
    flat: [[0, 0, 0, 1, S, 1]],
    rail: [[0, 0, 0, 1, S, 1]],
    lily: [[0, 0, 0, 1, S, 1]],
    lilyUp: [[0, 1 - 2 * S, 0, 1, 1, 1]],
    torch: [[7 * S, 0, 7 * S, 9 * S, 10 * S, 9 * S]],
    wallTorch: [[7 * S, 3 * S, S, 9 * S, 13 * S, 4 * S]],
    lantern: [[5 * S, 0, 5 * S, 11 * S, 7 * S, 11 * S], [7 * S, 7 * S, 7 * S, 9 * S, 9 * S, 9 * S]],
    hangLantern: [[5 * S, 4 * S, 5 * S, 11 * S, 11 * S, 11 * S], [7 * S, 11 * S, 7 * S, 9 * S, 1, 9 * S]],
    end_rod: [[7 * S, 0, 7 * S, 9 * S, 1, 9 * S]],
    chain: [[6.5 * S, 0, 6.5 * S, 9.5 * S, 1, 9.5 * S]],
    candle: [[7 * S, 0, 7 * S, 9 * S, 8 * S, 9 * S]],
    stem: [[6 * S, 0, 6 * S, 10 * S, 1, 10 * S]],
    cactus: [[S, 0, S, 1 - S, 1, 1 - S]],
    chest: [[S, 0, S, 15 * S, 14 * S, 15 * S]],
    chestOpen: [[S, 0, S, 15 * S, 9 * S, 15 * S], [S, 9 * S, 6 * S, 15 * S, 14 * S, 15 * S]],
    bed: [[0, 0, 0, 1, 9 * S, 1]],
    cake: [[S, 0, S, 15 * S, 8 * S, 15 * S]],
    table: [[0, 0, 0, 1, 12 * S, 1]],
    pot: [[5 * S, 0, 5 * S, 11 * S, 6 * S, 11 * S]],
    cauldron: [[S, 0, S, 15 * S, 10 * S, 15 * S]],
    anvil: [[2 * S, 0, 2 * S, 14 * S, 4 * S, 14 * S],
    [6 * S, 4 * S, 5 * S, 10 * S, 10 * S, 11 * S],
    [S, 10 * S, 3 * S, 15 * S, 1, 13 * S]],
    brewing: [[2 * S, 0, 2 * S, 14 * S, 2 * S, 14 * S], [7 * S, 0, 7 * S, 9 * S, 14 * S, 9 * S]],
    hopper: [[0, 10 * S, 0, 1, 1, 1], [4 * S, 4 * S, 4 * S, 12 * S, 10 * S, 12 * S]],
    lectern: [[0, 0, 0, 1, 2 * S, 1], [4 * S, 2 * S, 4 * S, 12 * S, 10 * S, 12 * S],
    [S, 10 * S, S, 15 * S, 14 * S, 15 * S]],
    scaffold: [[0, 14 * S, 0, 1, 1, 1], [0, 0, 0, 2 * S, 1, 2 * S], [14 * S, 0, 0, 1, 1, 2 * S],
    [0, 0, 14 * S, 2 * S, 1, 1], [14 * S, 0, 14 * S, 1, 1, 1]],
    ladder: [[0, 0, 0, 1, 1, 2 * S]],
    vine: [[0, 0, 0, 1, 1, S]],
    frame: [[S, S, 0, 15 * S, 15 * S, S]],
    banner: [[S, 0, 0, 15 * S, 1, 2 * S]],
    wallSign: [[S, 4 * S, 0, 15 * S, 12 * S, 2 * S]],
    sign: [[7 * S, 0, 7 * S, 9 * S, 9 * S, 9 * S], [2 * S, 9 * S, 7 * S, 14 * S, 1, 9 * S]],
    door: [[0, 0, 0, 1, 1, 3 * S]],
    trapdoor: [[0, 0, 0, 1, 3 * S, 1]],
    button: [[5 * S, 6 * S, 0, 11 * S, 10 * S, 2 * S]],
    boat: [[S, 0, 2 * S, 15 * S, 6 * S, 14 * S]],
    minecart: [[2 * S, S, 2 * S, 14 * S, 10 * S, 14 * S]],
    armorstand: [[6 * S, 0, 6 * S, 10 * S, S, 10 * S], [7 * S, S, 7 * S, 9 * S, 1, 9 * S],
    [3 * S, 11 * S, 7 * S, 13 * S, 12 * S, 9 * S]],
    critter: [[3 * S, 0, 3 * S, 13 * S, 10 * S, 13 * S]],
    critterBig: [[S, 0, 2 * S, 15 * S, 13 * S, 14 * S]],
    critterSmall: [[4 * S, 0, 4 * S, 12 * S, 8 * S, 12 * S]],
    head: [[4 * S, 0, 4 * S, 12 * S, 8 * S, 12 * S]],
    campfire: [[0, 0, 0, 1, 7 * S, 1]],
    gate: [[0, 5 * S, 6 * S, 2 * S, 1, 10 * S], [14 * S, 5 * S, 6 * S, 1, 1, 10 * S],
    [2 * S, 6 * S, 7 * S, 14 * S, 9 * S, 9 * S], [2 * S, 12 * S, 7 * S, 14 * S, 15 * S, 9 * S]],
  };
  const POST_FENCE = [6 * S, 0, 6 * S, 10 * S, 1, 10 * S];
  const POST_WALL = [4 * S, 0, 4 * S, 12 * S, 1, 12 * S];
  const POST_PANE = [7 * S, 0, 7 * S, 9 * S, 1, 9 * S];

  function rotBox(b, f) {
    if (!f) return b;
    let x0 = b[0], y0 = b[1], z0 = b[2], x1 = b[3], y1 = b[4], z1 = b[5];
    let ax, az, bx, bz;
    if (f === 1) { ax = 1 - z1; az = x0; bx = 1 - z0; bz = x1; }
    else if (f === 2) { ax = 1 - x1; az = 1 - z1; bx = 1 - x0; bz = 1 - z0; }
    else { ax = z0; az = 1 - x1; bx = z1; bz = 1 - x0; }
    return [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
  }
  function flipY(b) { return [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5]]; }

  /* face corner generator: dir 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z */
  const FACE_V = [
    (b) => [[b[3], b[1], b[5]], [b[3], b[1], b[2]], [b[3], b[4], b[2]], [b[3], b[4], b[5]]],
    (b) => [[b[0], b[1], b[2]], [b[0], b[1], b[5]], [b[0], b[4], b[5]], [b[0], b[4], b[2]]],
    (b) => [[b[0], b[4], b[5]], [b[3], b[4], b[5]], [b[3], b[4], b[2]], [b[0], b[4], b[2]]],
    (b) => [[b[0], b[1], b[2]], [b[3], b[1], b[2]], [b[3], b[1], b[5]], [b[0], b[1], b[5]]],
    (b) => [[b[0], b[1], b[5]], [b[3], b[1], b[5]], [b[3], b[4], b[5]], [b[0], b[4], b[5]]],
    (b) => [[b[3], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[4], b[2]], [b[3], b[4], b[2]]],
  ];
  /* matching UVs, MC orientation (v grows downward from the texture top) */
  const FACE_UV = [
    (b) => [[b[5], 1 - b[1]], [b[2], 1 - b[1]], [b[2], 1 - b[4]], [b[5], 1 - b[4]]],
    (b) => [[1 - b[2], 1 - b[1]], [1 - b[5], 1 - b[1]], [1 - b[5], 1 - b[4]], [1 - b[2], 1 - b[4]]],
    (b) => [[b[0], b[5]], [b[3], b[5]], [b[3], b[2]], [b[0], b[2]]],
    (b) => [[b[0], 1 - b[2]], [b[3], 1 - b[2]], [b[3], 1 - b[5]], [b[0], 1 - b[5]]],
    (b) => [[1 - b[0], 1 - b[1]], [1 - b[3], 1 - b[1]], [1 - b[3], 1 - b[4]], [1 - b[0], 1 - b[4]]],
    (b) => [[b[3], 1 - b[1]], [b[0], 1 - b[1]], [b[0], 1 - b[4]], [b[3], 1 - b[4]]],
  ];
  const NOFF = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  /* which box coordinate must touch the cube boundary for this face to be cullable */
  const BOUND = [[3, 1], [0, 0], [4, 1], [1, 0], [5, 1], [2, 0]];
  /* AO tangent axes for each face: [uAxis, vAxis] as xyz offsets */
  const AO_AX = [
    [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1]], [[1, 0, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]],
  ];

  /* ------------------------------------------------------------------ */
  function* meshGen(W, BLOCKS, light, opts) {
    opts = opts || {};
    const CH = opts.chunk || 32;
    const SX = W.SX, SY = W.SY, SZ = W.SZ, AREA = W.AREA;
    const ids = W.ids, states = W.states;
    const sky = light.sky, blk = light.blk;

    const nFull = new Uint8Array(BLOCKS.length);      // full opaque cube?
    const nAlpha = new Uint8Array(BLOCKS.length);
    const nTrans = new Uint8Array(BLOCKS.length);     // translucent (blended) pass
    const nCross = new Uint8Array(BLOCKS.length);
    const nWave = new Uint8Array(BLOCKS.length);
    const TRANSSET = { GLASS: 1, TINTED_GLASS: 1, WATER: 1, ICE: 1, HONEY_BLOCK: 1, SLIME_BLOCK: 1 };
    for (let i = 0; i < BLOCKS.length; i++) {
      const d = BLOCKS[i];
      nFull[i] = (d.opaque && d.shape === 'full') ? 1 : 0;
      nAlpha[i] = d.alpha ? 1 : 0;
      nCross[i] = (d.shape === 'cross' || d.shape === 'bigcross') ? 1 : 0;
      nWave[i] = d.wave ? 1 : 0;
      nTrans[i] = (TRANSSET[d.name] || /_STAINED_GLASS$|_PANE$/.test(d.name) && d.name !== 'IRON_BARS') ? 1 : 0;
    }
    nTrans[0] = 0;

    const chunksX = Math.ceil(SX / CH), chunksZ = Math.ceil(SZ / CH);
    const chunks = [];

    /* scratch vertex builders */
    function Buf() { this.v = []; this.i = []; this.n = 0; }
    Buf.prototype.quad = function (p, uv, layer, lt, flags) {
      const v = this.v, b = this.n;
      for (let k = 0; k < 4; k++) {
        v.push(p[k][0], p[k][1], p[k][2], uv[k][0], uv[k][1], layer,
          lt[k][0], lt[k][1], lt[k][2], flags);
      }
      // flip the triangulation on strong AO gradients to avoid the classic seam
      if (lt[0][2] + lt[2][2] > lt[1][2] + lt[3][2]) {
        this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      } else {
        this.i.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
      }
      this.n += 4;
    };

    function opaqueAt(x, y, z) {
      if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return 0;
      return nFull[ids[y * AREA + z * SX + x]];
    }
    function lightAt(x, y, z) {
      if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return [15, 0];
      const i = y * AREA + z * SX + x;
      return [sky[i], blk[i]];
    }

    let done = 0;
    const total = chunksX * chunksZ;

    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const solid = new Buf(), trans = new Buf();
        const x0 = cx * CH, z0 = cz * CH;
        const x1 = Math.min(SX, x0 + CH), z1 = Math.min(SZ, z0 + CH);
        let miny = SY, maxy = 0;

        for (let y = 0; y < SY; y++) {
          for (let z = z0; z < z1; z++) {
            for (let x = x0; x < x1; x++) {
              const i = y * AREA + z * SX + x;
              const id = ids[i];
              if (!id) continue;
              const def = BLOCKS[id];

              /* fast reject: solid cube fully enclosed */
              if (nFull[id]) {
                if (opaqueAt(x + 1, y, z) && opaqueAt(x - 1, y, z) && opaqueAt(x, y + 1, z) &&
                  opaqueAt(x, y - 1, z) && opaqueAt(x, y, z + 1) && opaqueAt(x, y, z - 1)) continue;
              }
              if (y < miny) miny = y;
              if (y > maxy) maxy = y;

              const st = states[i];
              const buf = nTrans[id] ? trans : solid;
              const flags = nWave[id] ? 1 : 0;

              /* ---- cross-shaped plants ---------------------------- */
              if (nCross[id]) {
                const L = lightAt(x, y, z);
                const lt = [[L[0], L[1], 3], [L[0], L[1], 3], [L[0], L[1], 3], [L[0], L[1], 3]];
                const layer = def.faces[2];
                const tall = def.shape === 'bigcross' ? 1.55 : 1;
                const a = 0.1465, b2 = 1 - a;
                for (let s = 0; s < 2; s++) {
                  const p = s === 0
                    ? [[x + a, y, z + a], [x + b2, y, z + b2], [x + b2, y + tall, z + b2], [x + a, y + tall, z + a]]
                    : [[x + b2, y, z + a], [x + a, y, z + b2], [x + a, y + tall, z + b2], [x + b2, y + tall, z + a]];
                  const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
                  buf.quad(p, uv, layer, lt, flags | 2);
                  const pr = [p[1], p[0], p[3], p[2]];
                  const uvr = [[0, 1], [1, 1], [1, 0], [0, 0]];
                  buf.quad(pr, uvr, layer, lt, flags | 2);
                }
                continue;
              }

              /* ---- resolve the box list --------------------------- */
              let boxes = SHAPES[def.shape] || SHAPES.full;
              const facing = st & 3;
              const shp = def.shape;

              if (shp === 'stairs') {
                const top = (st & 4) !== 0;
                let base = [0, 0, 0, 1, .5, 1];
                let step = [0, .5, 0, 1, 1, .5];
                if (top) { base = flipY(base); step = flipY(step); }
                boxes = [base, rotBox(step, facing)];
              } else if (shp === 'slab') {
                boxes = (st & 1) ? [[0, .5, 0, 1, 1, 1]] : [[0, 0, 0, 1, .5, 1]];
              } else if (shp === 'fence' || shp === 'wall' || shp === 'pane') {
                const post = shp === 'fence' ? POST_FENCE : shp === 'wall' ? POST_WALL : POST_PANE;
                const arr = [post];
                const armY = shp === 'fence' ? [[6 * S, 9 * S], [12 * S, 15 * S]]
                  : shp === 'wall' ? [[0, 13 * S]] : [[0, 1]];
                const halfW = shp === 'fence' ? [7 * S, 9 * S] : shp === 'wall' ? [5 * S, 11 * S] : [7 * S, 9 * S];
                const conn = [[0, 0, -1, 'n'], [1, 0, 0, 'e'], [0, 0, 1, 's'], [-1, 0, 0, 'w']];
                for (const [dx, , dz] of conn) {
                  const nx = x + dx, nz = z + dz;
                  if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
                  const nid = ids[y * AREA + nz * SX + nx];
                  if (!nid) continue;
                  const nd = BLOCKS[nid];
                  const same = nd.shape === shp || nFull[nid] ||
                    (shp === 'pane' && (nd.shape === 'pane')) ||
                    (shp !== 'pane' && (nd.shape === 'fence' || nd.shape === 'wall' || nd.shape === 'gate'));
                  if (!same) continue;
                  for (const [ay0, ay1] of armY) {
                    if (dz === -1) arr.push([halfW[0], ay0, 0, halfW[1], ay1, post[2]]);
                    else if (dz === 1) arr.push([halfW[0], ay0, post[5], halfW[1], ay1, 1]);
                    else if (dx === -1) arr.push([0, ay0, halfW[0], post[0], ay1, halfW[1]]);
                    else arr.push([post[3], ay0, halfW[0], 1, ay1, halfW[1]]);
                  }
                }
                boxes = arr;
              } else if (shp === 'trapdoor') {
                const open = (st & 4) !== 0, top = (st & 8) !== 0;
                boxes = open ? [rotBox([0, 0, 0, 1, 1, 3 * S], facing)]
                  : [top ? [0, 1 - 3 * S, 0, 1, 1, 1] : [0, 0, 0, 1, 3 * S, 1]];
              } else if (shp === 'door') {
                boxes = [rotBox([0, 0, 0, 1, 1, 3 * S], facing)];
              } else if (shp === 'bed') {
                boxes = [[0, 3 * S, 0, 1, 9 * S, 1],
                [2 * S, 0, 2 * S, 5 * S, 3 * S, 5 * S], [11 * S, 0, 2 * S, 14 * S, 3 * S, 5 * S],
                [2 * S, 0, 11 * S, 5 * S, 3 * S, 14 * S], [11 * S, 0, 11 * S, 14 * S, 3 * S, 14 * S]];
              } else if (def.facing && (shp === 'wallTorch' || shp === 'ladder' || shp === 'vine' ||
                shp === 'frame' || shp === 'banner' || shp === 'wallSign' || shp === 'button')) {
                boxes = SHAPES[shp].map(b => rotBox(b, facing));
              } else if (shp === 'gate') {
                boxes = SHAPES.gate.map(b => rotBox(b, facing));
              } else if (def.axis && (st & 3)) {
                // rotate a pillar onto X or Z: only affects face texture choice below
                boxes = SHAPES.full;
              }

              /* ---- emit the boxes -------------------------------- */
              for (let bi = 0; bi < boxes.length; bi++) {
                const bx = boxes[bi];
                for (let f = 0; f < 6; f++) {
                  const bnd = BOUND[f];
                  const onBoundary = Math.abs(bx[bnd[0]] - bnd[1]) < 1e-6;
                  const no = NOFF[f];
                  const nx = x + no[0], ny = y + no[1], nz = z + no[2];

                  if (onBoundary) {
                    if (nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ) {
                      if (ny < 0 || ny >= SY) continue;
                    }
                    const nid = (nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ)
                      ? 0 : ids[ny * AREA + nz * SX + nx];
                    if (nFull[nid]) continue;
                    if (nid === id && (nTrans[id] || def.shape !== 'full')) continue;  // glass-to-glass
                    if (nTrans[id] && nTrans[nid]) continue;
                  } else if (boxes.length > 1) {
                    // interior faces between touching boxes of the same block: keep (cheap, rare)
                  }

                  /* texture layer, honouring pillar axis */
                  let layer;
                  if (def.axis) {
                    const ax = st & 3;   // 0=y 1=x 2=z
                    const isCap = (ax === 0 && (f === 2 || f === 3)) ||
                      (ax === 1 && (f === 0 || f === 1)) ||
                      (ax === 2 && (f === 4 || f === 5));
                    layer = isCap ? def.faces[2] : def.faces[0];
                  } else layer = def.faces[f];

                  /* lighting + AO */
                  const lt = [];
                  const sx = onBoundary ? nx : x, sy2 = onBoundary ? ny : y, sz = onBoundary ? nz : z;
                  const baseL = lightAt(sx, sy2, sz);
                  if (onBoundary && nFull[id]) {
                    const ax0 = AO_AX[f][0], ax1 = AO_AX[f][1];
                    const corners = FACE_V[f](bx);
                    // derive each corner's position along the two tangent axes
                    const uAx = ax0[0] ? 0 : ax0[1] ? 1 : 2, uSg = ax0[uAx];
                    const vAx = ax1[0] ? 0 : ax1[1] ? 1 : 2, vSg = ax1[vAx];
                    for (let k = 0; k < 4; k++) {
                      const su = (corners[k][uAx] > 0.5 ? 1 : -1) * uSg;
                      const sv = (corners[k][vAx] > 0.5 ? 1 : -1) * vSg;
                      const ux = ax0[0] * su, uy = ax0[1] * su, uz = ax0[2] * su;
                      const vx = ax1[0] * sv, vy = ax1[1] * sv, vz = ax1[2] * sv;
                      const s1 = opaqueAt(nx + ux, ny + uy, nz + uz);
                      const s2 = opaqueAt(nx + vx, ny + vy, nz + vz);
                      const co = opaqueAt(nx + ux + vx, ny + uy + vy, nz + uz + vz);
                      const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + co);
                      let ls = baseL[0], lb = baseL[1], cnt = 1;
                      const add = (px, py, pz) => {
                        if (opaqueAt(px, py, pz)) return;
                        const L = lightAt(px, py, pz); ls += L[0]; lb += L[1]; cnt++;
                      };
                      add(nx + ux, ny + uy, nz + uz);
                      add(nx + vx, ny + vy, nz + vz);
                      if (!(s1 && s2)) add(nx + ux + vx, ny + uy + vy, nz + uz + vz);
                      lt.push([ls / cnt, lb / cnt, ao]);
                    }
                    // corner order in FACE_V is (u-,v-),(u+,v-),(u+,v+),(u-,v+) for most faces
                  } else {
                    for (let k = 0; k < 4; k++) lt.push([baseL[0], baseL[1], 3]);
                  }

                  const p = FACE_V[f](bx);
                  const uv = FACE_UV[f](bx);
                  for (let k = 0; k < 4; k++) { p[k][0] += x; p[k][1] += y; p[k][2] += z; }
                  buf.quad(p, uv, layer, lt, flags);
                }
              }
            }
          }
        }

        if (solid.n || trans.n) {
          chunks.push({
            cx, cz, x0, z0, x1, z1, miny, maxy,
            solid: packBuf(solid), trans: packBuf(trans),
          });
        }
        done++;
        yield done / total;
      }
    }

    function packBuf(b) {
      if (!b.n) return null;
      const n = b.n;
      const data = new ArrayBuffer(n * 24);
      const f32 = new Float32Array(data);
      const u16 = new Uint16Array(data);
      const u8 = new Uint8Array(data);
      for (let k = 0; k < n; k++) {
        const s = k * 10, o = k * 24;
        f32[o / 4] = b.v[s]; f32[o / 4 + 1] = b.v[s + 1]; f32[o / 4 + 2] = b.v[s + 2];
        u16[o / 2 + 6] = Math.max(0, Math.min(65535, Math.round(b.v[s + 3] * 65535)));
        u16[o / 2 + 7] = Math.max(0, Math.min(65535, Math.round(b.v[s + 4] * 65535)));
        u16[o / 2 + 8] = b.v[s + 5];
        u8[o + 18] = Math.round(b.v[s + 6] * 17);      // sky  0..15 -> 0..255
        u8[o + 19] = Math.round(b.v[s + 7] * 17);      // block
        u8[o + 20] = Math.round(b.v[s + 8] * 85);      // ao 0..3 -> 0..255
        u8[o + 21] = b.v[s + 9];
      }
      const idx = (n > 65535) ? new Uint32Array(b.i) : new Uint16Array(b.i);
      return { data: new Uint8Array(data), index: idx, count: b.i.length, verts: n, big: n > 65535 };
    }

    return chunks;
  }

  function buildMeshes(W, BLOCKS, light, opts) {
    const g = meshGen(W, BLOCKS, light, opts);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  root.MCMesher = { buildMeshes, meshGen, SHAPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCMesher;
})(typeof globalThis !== 'undefined' ? globalThis : this);
