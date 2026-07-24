/* =====================================================================
   LIGHTING  —  Minecraft-style flood-fill sky light + block light
   Produces two Uint8Arrays (0..15) the mesher samples for smooth
   per-vertex lighting.
   ===================================================================== */

(function (root) {
  'use strict';

  function computeLight(W, BLOCKS, onProgress) {
    const SX = W.SX, SY = W.SY, SZ = W.SZ, AREA = W.AREA;
    const N = SX * SY * SZ;
    const ids = W.ids;
    const sky = new Uint8Array(N);
    const blk = new Uint8Array(N);

    /* opacity lookup: 0 = fully transparent, 1 = attenuates, 15 = blocks */
    const OPAQ = new Uint8Array(BLOCKS.length);
    const EMIT = new Uint8Array(BLOCKS.length);
    for (let i = 0; i < BLOCKS.length; i++) {
      const d = BLOCKS[i];
      OPAQ[i] = d.air ? 0 : d.opaque ? 15 : (d.liquid || d.shape === 'full') ? 2 : 0;
      EMIT[i] = d.light;
    }

    const queue = new Int32Array(N);
    let qh = 0, qt = 0;

    /* ---- 1. direct sky column ---------------------------------------- */
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        let level = 15;
        for (let y = SY - 1; y >= 0; y--) {
          const i = y * AREA + z * SX + x;
          const op = OPAQ[ids[i]];
          if (op >= 15) break;
          if (op > 0) { level -= op; if (level <= 0) break; }
          sky[i] = level;
          queue[qt++] = i;
        }
      }
      if (onProgress && (z & 31) === 0) onProgress(0.05 + 0.25 * (z / SZ));
    }

    /* ---- 2. sky flood fill ------------------------------------------- */
    const NB = [1, -1, SX, -SX, AREA, -AREA];
    while (qh < qt) {
      const i = queue[qh++];
      const lv = sky[i];
      if (lv <= 1) continue;
      const x = i % SX, z = ((i / SX) | 0) % SZ, y = (i / AREA) | 0;
      for (let n = 0; n < 6; n++) {
        if (n === 0 && x === SX - 1) continue;
        if (n === 1 && x === 0) continue;
        if (n === 2 && z === SZ - 1) continue;
        if (n === 3 && z === 0) continue;
        if (n === 4 && y === SY - 1) continue;
        if (n === 5 && y === 0) continue;
        const j = i + NB[n];
        const op = OPAQ[ids[j]];
        if (op >= 15) continue;
        const nl = lv - 1 - (op > 0 ? op - 1 : 0);
        if (nl > sky[j]) {
          sky[j] = nl;
          if (qt >= N) { qt = 0; }              // ring-buffer safety (never hit in practice)
          queue[qt++] = j;
          if (qt >= N) qt = N - 1;
        }
      }
    }
    if (onProgress) onProgress(0.45);

    /* ---- 3. block light --------------------------------------------- */
    qh = 0; qt = 0;
    for (let i = 0; i < N; i++) {
      const e = EMIT[ids[i]];
      if (e) { blk[i] = e; queue[qt++] = i; }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const lv = blk[i];
      if (lv <= 1) continue;
      const x = i % SX, z = ((i / SX) | 0) % SZ, y = (i / AREA) | 0;
      for (let n = 0; n < 6; n++) {
        if (n === 0 && x === SX - 1) continue;
        if (n === 1 && x === 0) continue;
        if (n === 2 && z === SZ - 1) continue;
        if (n === 3 && z === 0) continue;
        if (n === 4 && y === SY - 1) continue;
        if (n === 5 && y === 0) continue;
        const j = i + NB[n];
        if (OPAQ[ids[j]] >= 15) continue;
        const nl = lv - 1;
        if (nl > blk[j]) {
          blk[j] = nl;
          queue[qt++] = j;
          if (qt >= N) qt = N - 1;
        }
      }
    }
    if (onProgress) onProgress(0.6);

    return { sky, blk, OPAQ, EMIT };
  }

  root.MCLight = { computeLight };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCLight;
})(typeof globalThis !== 'undefined' ? globalThis : this);
