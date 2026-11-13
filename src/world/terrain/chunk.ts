import type { TerrainSource } from './sources';

export interface ChunkRequest { id: number; source: string; x0: number; z0: number; size: number; n: number; skirt: number }
export interface ChunkData {
  id: number;
  positions: Float32Array; // relative to (x0, 0, z0)
  normals: Float32Array;
  splat: Uint8Array; // 4 per vertex
  aux: Uint8Array; // 1 per vertex
  index: Uint32Array | Uint16Array;
  minY: number;
  maxY: number;
}

/**
 * Build one terrain tile: an (n+1)^2 grid plus a skirt ring that hides cracks between LOD levels.
 * Pure function of the source, so it runs identically in the worker and on the main thread.
 */
export function buildChunk(src: TerrainSource, r: ChunkRequest): ChunkData {
  const { x0, z0, size, n } = r;
  const m = n + 1;
  const step = size / n;
  // heights with a one-cell border for central-difference normals
  const hm = m + 2;
  const hs = new Float32Array(hm * hm);
  for (let j = 0; j < hm; j++) for (let i = 0; i < hm; i++) hs[j * hm + i] = src.height(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const withSkirt = r.skirt > 0;
  const vcount = m * m + (withSkirt ? m * 4 : 0);
  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const splat = new Uint8Array(vcount * 4);
  const aux = new Uint8Array(vcount);
  const w = [0, 0, 0, 0];
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = j * m + i;
      const h = hs[(j + 1) * hm + (i + 1)];
      positions[k * 3] = i * step;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = j * step;
      const dx = hs[(j + 1) * hm + (i + 2)] - hs[(j + 1) * hm + i];
      const dz = hs[(j + 2) * hm + (i + 1)] - hs[j * hm + (i + 1)];
      const nx = -dx, ny = 2 * step, nz = -dz;
      const l = Math.hypot(nx, ny, nz);
      normals[k * 3] = nx / l; normals[k * 3 + 1] = ny / l; normals[k * 3 + 2] = nz / l;
      const wx = x0 + i * step, wz = z0 + j * step;
      src.splat(wx, wz, w);
      splat[k * 4] = w[0] * 255; splat[k * 4 + 1] = w[1] * 255; splat[k * 4 + 2] = w[2] * 255; splat[k * 4 + 3] = w[3] * 255;
      aux[k] = Math.round(src.aux(wx, wz) * 255);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (src.hole && src.hole(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (withSkirt) {
    // skirt: duplicate the border ring, pushed down
    let k = m * m;
    const ring: number[] = [];
    const push = (src0: number) => {
      positions[k * 3] = positions[src0 * 3];
      positions[k * 3 + 1] = positions[src0 * 3 + 1] - r.skirt;
      positions[k * 3 + 2] = positions[src0 * 3 + 2];
      normals[k * 3] = normals[src0 * 3]; normals[k * 3 + 1] = normals[src0 * 3 + 1]; normals[k * 3 + 2] = normals[src0 * 3 + 2];
      splat.copyWithin(k * 4, src0 * 4, src0 * 4 + 4);
      aux[k] = aux[src0];
      ring.push(src0, k);
      k++;
    };
    const edges: number[][] = [[], [], [], []];
    for (let i = 0; i < m; i++) { edges[0].push(i); edges[1].push((m - 1) * m + (m - 1 - i)); edges[2].push((m - 1 - i) * m); edges[3].push(i * m + (m - 1)); }
    // skirts are emitted double-sided (they are few and only ever seen edge-on through LOD cracks)
    for (let e = 0; e < 4; e++) {
      ring.length = 0;
      for (const s0 of edges[e]) push(s0);
      for (let q = 0; q < m - 1; q++) {
        const a = ring[q * 2], as = ring[q * 2 + 1], b = ring[q * 2 + 2], bs = ring[q * 2 + 3];
        idx.push(a, b, as, b, bs, as, a, as, b, b, as, bs);
      }
    }
  }
  const index = vcount > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { id: r.id, positions, normals, splat, aux, index, minY: minY - r.skirt, maxY };
}
