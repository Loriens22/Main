// ---------------------------------------------------------------------------
// Heightfield terrain: 1 m resolution physics/edit grid, chunked LOD meshes,
// splat-mapped PBR material and GPU-side height/paint textures.
//
// - `heights` (Float32, (N+1)^2) is the single source of truth for collision,
//   placement, grass (sampled on the GPU from `heightTex`) and water depth.
// - Chunks (64 m) pick a LOD (64/32/16/8 segments) by distance, with skirts to
//   hide cracks. Edits (flatten for buildings, raise for hills/mountains,
//   carve for lakes/rivers) rebuild only the affected chunks.
// - The material is a MeshStandardMaterial patched via onBeforeCompile to
//   blend 8 baked texture layers (array textures) by slope, height, noise
//   and a paint texture (paths, bare dirt, sand, grass suppression), with
//   two-scale sampling to hide tiling and triplanar projection for cliffs.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { patchMaterial } from '../render/shaderPatches.js';
import { smoothstep } from '../core/noise.js';

export const LAYERS = ['grass', 'meadow', 'dirt', 'rock', 'sand', 'snow', 'gravel', 'forest'];

export class Terrain {
  constructor(opts) {
    this.size = opts.size || 1024;
    this.res = opts.res || 1;
    this.N = Math.round(this.size / this.res);
    this.half = this.size / 2;
    this.waterLevel = opts.waterLevel ?? 0;
    this.snowLine = opts.snowLine ?? 95;
    this.heightFn = opts.heightFn;
    this.chunkSize = opts.chunkSize || 64;
    this.chunksPerSide = Math.round(this.size / this.chunkSize);
    this.heights = new Float32Array((this.N + 1) * (this.N + 1));
    this.paint = new Uint8Array(this.N * this.N * 4);
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.layerDefs = opts.layers;
    this.lodBias = opts.lodBias || 1;
    this.edits = []; // replayable log (save/load)
    this.dirtyChunks = new Set();
    this.farRing = opts.farRing !== false;
    this.minHeight = 0; this.maxHeight = 0;
    this.listeners = new Set();
  }

  // Generate heights (generator: yields for loading progress).
  *generate(onProgress) {
    const N = this.N, res = this.res, h0 = -this.half;
    const H = this.heights;
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j <= N; j++) {
      const z = h0 + j * res;
      for (let i = 0; i <= N; i++) {
        const v = this.heightFn(h0 + i * res, z);
        H[i + j * (N + 1)] = v;
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      if ((j & 15) === 0) { if (onProgress) onProgress(j / N); yield; }
    }
    this.minHeight = mn; this.maxHeight = mx;
  }

  inBounds(x, z) { return Math.abs(x) < this.half && Math.abs(z) < this.half; }

  heightAt(x, z) {
    const N = this.N;
    let fx = (x + this.half) / this.res, fz = (z + this.half) / this.res;
    if (fx < 0 || fz < 0 || fx > N || fz > N) return this.heightFn(x, z);
    const i = Math.min(N - 1, Math.floor(fx)), j = Math.min(N - 1, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const H = this.heights, w = N + 1;
    const a = H[i + j * w], b = H[i + 1 + j * w], c = H[i + (j + 1) * w], d = H[i + 1 + (j + 1) * w];
    // Triangle interpolation matching the mesh diagonal (i,j)-(i+1,j+1).
    if (tx >= tz) return a + (b - a) * tx + (d - b) * tz;
    return a + (d - c) * tx + (c - a) * tz;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.res;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z, _v).y; }

  paintAt(x, z) {
    const i = Math.floor((x + this.half) / this.res), j = Math.floor((z + this.half) / this.res);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return [0, 0, 0, 0];
    const k = (i + j * this.N) * 4;
    return [this.paint[k], this.paint[k + 1], this.paint[k + 2], this.paint[k + 3]];
  }

  // Ray vs heightfield: coarse march + binary refinement.
  raycast(origin, dir, maxDist = 500) {
    let t = 0;
    let step = 0.5;
    let prevT = 0;
    let prevAbove = origin.y - this.heightAt(origin.x, origin.z);
    if (prevAbove < 0) return null;
    while (t < maxDist) {
      t += step;
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const above = y - this.heightAt(x, z);
      if (above <= 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          const yy = origin.y + dir.y * m;
          if (yy - this.heightAt(origin.x + dir.x * m, origin.z + dir.z * m) > 0) a = m; else b = m;
        }
        const point = new THREE.Vector3(origin.x + dir.x * b, origin.y + dir.y * b, origin.z + dir.z * b);
        return { point, distance: b, normal: this.normalAt(point.x, point.z) };
      }
      prevT = t; prevAbove = above;
      step = Math.min(4, Math.max(0.25, above * 0.4 + t * 0.01));
    }
    return null;
  }

  // ---------------- Editing ----------------
  // op: { type: 'flatten'|'raise'|'carve'|'paint', x, z, radius, ... }
  applyEdit(op, record = true) {
    if (record) this.edits.push(op);
    const N = this.N, w = N + 1, res = this.res, H = this.heights;
    const r = op.radius + (op.falloff || 0);
    const i0 = Math.max(0, Math.floor((op.x - r + this.half) / res));
    const i1 = Math.min(N, Math.ceil((op.x + r + this.half) / res));
    const j0 = Math.max(0, Math.floor((op.z - r + this.half) / res));
    const j1 = Math.min(N, Math.ceil((op.z + r + this.half) / res));
    if (op.type !== 'paint') {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -this.half + i * res, z = -this.half + j * res;
          const idx = i + j * w;
          const cur = H[idx];
          H[idx] = this._editHeight(op, x, z, cur);
        }
      }
      this._markDirty(op.x, op.z, r + 2);
      this.heightTexDirty = true;
    }
    if (op.paint || op.type === 'paint') this._paintRegion(op, i0, i1, j0, j1);
    for (const fn of this.listeners) fn(op);
  }

  _shapeWeight(op, x, z) {
    const falloff = op.falloff || 0;
    let d;
    if (op.shape === 'rect') {
      // Rotated rectangle: op.hw, op.hd half extents, op.yaw.
      const c = Math.cos(-(op.yaw || 0)), s = Math.sin(-(op.yaw || 0));
      const dx = x - op.x, dz = z - op.z;
      const lx = Math.abs(dx * c - dz * s) - op.hw, lz = Math.abs(dx * s + dz * c) - op.hd;
      d = Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
      if (d <= 0) return 1;
      return falloff > 0 ? 1 - smoothstep(0, falloff, d) : 0;
    }
    if (op.shape === 'path') {
      // Polyline with op.points [[x,z],...], radius = half width.
      d = Infinity;
      const pts = op.points;
      for (let k = 0; k < pts.length - 1; k++) {
        const ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0], bz = pts[k + 1][1];
        const vx = bx - ax, vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
        d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
      }
      d -= op.radius;
      if (d <= 0) return 1;
      return falloff > 0 ? 1 - smoothstep(0, falloff, d) : 0;
    }
    d = Math.hypot(x - op.x, z - op.z) - op.radius;
    if (d <= 0) return 1;
    return falloff > 0 ? 1 - smoothstep(0, falloff, d) : 0;
  }

  _editHeight(op, x, z, cur) {
    const w = this._shapeWeight(op, x, z);
    if (w <= 0) return cur;
    switch (op.type) {
      case 'flatten': return cur + (op.height - cur) * w;
      case 'raise': {
        // Smooth dome, optionally with ridged noise (mountains) via op.noise fn.
        const d = Math.hypot(x - op.x, z - op.z) / (op.radius + (op.falloff || 0));
        const dome = Math.max(0, 1 - d * d);
        const n = op.noiseFn ? op.noiseFn(x, z) : 1;
        return cur + op.amount * Math.pow(dome, op.power || 1.5) * n;
      }
      case 'carve': {
        const target = op.depthTo !== undefined ? op.depthTo : cur - op.amount;
        return Math.min(cur, cur + (target - cur) * w);
      }
      default: return cur;
    }
  }

  _paintRegion(op, i0, i1, j0, j1) {
    const N = this.N, P = this.paint;
    const ch = op.channel ?? 0; // 0 gravel path, 1 dirt, 2 sand, 3 grass suppression
    const val = op.value ?? 255;
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const x = -this.half + (i + 0.5) * this.res, z = -this.half + (j + 0.5) * this.res;
        const w = this._shapeWeight(op, x, z);
        if (w <= 0) continue;
        const k = (i + j * N) * 4 + ch;
        P[k] = Math.max(P[k], Math.round(val * w));
        if (op.clearOthers) for (let c = 0; c < 3; c++) if (c !== ch) P[(i + j * N) * 4 + c] = Math.round(P[(i + j * N) * 4 + c] * (1 - w));
        if (op.alsoSuppressGrass) { const kk = (i + j * N) * 4 + 3; P[kk] = Math.max(P[kk], Math.round(255 * w)); }
      }
    }
    this.paintTexDirty = true;
  }

  _markDirty(x, z, r) {
    const cs = this.chunkSize;
    const c0 = Math.max(0, Math.floor((x - r + this.half) / cs)), c1 = Math.min(this.chunksPerSide - 1, Math.floor((x + r + this.half) / cs));
    const r0 = Math.max(0, Math.floor((z - r + this.half) / cs)), r1 = Math.min(this.chunksPerSide - 1, Math.floor((z + r + this.half) / cs));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) this.dirtyChunks.add(i + j * this.chunksPerSide);
  }

  // ---------------- GPU resources ----------------
  buildTextures() {
    const N = this.N;
    this.heightTex = new THREE.DataTexture(this.heights, N + 1, N + 1, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.paintTex = new THREE.DataTexture(this.paint, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.paintTex.minFilter = this.paintTex.magFilter = THREE.LinearFilter;
    this.paintTex.needsUpdate = true;
  }

  buildMaterial(arrays, layerParams) {
    const uniforms = {
      uAlbArr: { value: arrays.albedo },
      uNorArr: { value: arrays.normal },
      uOrmArr: { value: arrays.orm },
      uPaint: { value: this.paintTex },
      uTerrainHalf: { value: this.half },
      uWaterLevel: { value: this.waterLevel },
      uSnowLine: { value: this.snowLine },
      uLayerScale: { value: layerParams.map((l) => 1 / l.world) },
      uRockSlope: { value: layerParams.rockSlope ?? 0.3 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uPalette: { value: layerParams.palette ?? 0 },
    };
    this.uniforms = uniforms;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.name = 'terrain';
    patchMaterial(mat, (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNrm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvTNrm = normalize( mat3( modelMatrix ) * objectNormal );');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_PARS)
        .replace('#include <map_fragment>', TERRAIN_FRAG_MAIN)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( tNrmW, 0.0 ) ).xyz );')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAO; reflectedLight.indirectSpecular *= tAO * tAO;');
    }, 'terrain-splat');
    this.material = mat;
    return mat;
  }

  // Build chunk objects (geometry built lazily per LOD).
  buildChunks() {
    const cps = this.chunksPerSide, cs = this.chunkSize;
    for (let j = 0; j < cps; j++) {
      for (let i = 0; i < cps; i++) {
        const x0 = -this.half + i * cs, z0 = -this.half + j * cs;
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.terrain = true;
        mesh.visible = false;
        const chunk = { i, j, x0, z0, cx: x0 + cs / 2, cz: z0 + cs / 2, mesh, lod: -1, lods: new Map() };
        this.chunks.push(chunk);
        this.group.add(mesh);
      }
    }
    if (this.farRing) this._buildFarRing();
  }

  _buildChunkGeometry(chunk, segs) {
    const cs = this.chunkSize, step = cs / segs;
    const vpr = segs + 1;
    const skirt = 4 * vpr; // four skirt edges
    const count = vpr * vpr + skirt;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const n = new THREE.Vector3();
    let v = 0;
    for (let j = 0; j <= segs; j++) {
      for (let i = 0; i <= segs; i++) {
        const x = chunk.x0 + i * step, z = chunk.z0 + j * step;
        pos[v * 3] = x; pos[v * 3 + 1] = this.heightAt(x, z); pos[v * 3 + 2] = z;
        this.normalAt(x, z, n);
        nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
        v++;
      }
    }
    const idx = [];
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = i + j * vpr, b = a + 1, c = a + vpr, d = c + 1;
        idx.push(a, c, d, a, d, b);
      }
    }
    // Skirts: duplicate edge vertices dropped by `drop` metres.
    const drop = Math.max(2, step * 1.5);
    const edges = [
      Array.from({ length: vpr }, (_, i) => i),                      // z0 edge
      Array.from({ length: vpr }, (_, i) => i + segs * vpr),         // z1 edge
      Array.from({ length: vpr }, (_, j) => j * vpr),                // x0 edge
      Array.from({ length: vpr }, (_, j) => segs + j * vpr),         // x1 edge
    ];
    edges.forEach((edge, e) => {
      const start = v;
      for (const src of edge) {
        pos[v * 3] = pos[src * 3]; pos[v * 3 + 1] = pos[src * 3 + 1] - drop; pos[v * 3 + 2] = pos[src * 3 + 2];
        nor[v * 3] = nor[src * 3]; nor[v * 3 + 1] = nor[src * 3 + 1]; nor[v * 3 + 2] = nor[src * 3 + 2];
        v++;
      }
      for (let k = 0; k < vpr - 1; k++) {
        const a = edge[k], b = edge[k + 1], c = start + k, d = start + k + 1;
        if (e === 0 || e === 3) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  _buildFarRing() {
    // Coarse terrain beyond the playable square, out to the horizon.
    const outer = 4200, segs = 160, step = (outer * 2) / segs;
    const pos = [], nor = [], idx = [];
    const grid = [];
    const n = new THREE.Vector3();
    for (let j = 0; j <= segs; j++) {
      grid.push([]);
      for (let i = 0; i <= segs; i++) {
        const x = -outer + i * step, z = -outer + j * step;
        const inside = Math.abs(x) < this.half - step && Math.abs(z) < this.half - step;
        let y = this.heightFn(x, z);
        if (inside) y -= 30; // hidden under the near terrain
        grid[j].push(pos.length / 3);
        pos.push(x, y, z);
        const e = step * 0.5;
        n.set(this.heightFn(x - e, z) - this.heightFn(x + e, z), 2 * e, this.heightFn(x, z - e) - this.heightFn(x, z + e)).normalize();
        nor.push(n.x, n.y, n.z);
      }
    }
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const x = -outer + (i + 0.5) * step, z = -outer + (j + 0.5) * step;
        if (Math.abs(x) < this.half - step * 1.5 && Math.abs(z) < this.half - step * 1.5) continue;
        const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
        idx.push(a, c, d, a, d, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.farMesh = new THREE.Mesh(g, this.material);
    this.farMesh.receiveShadow = false;
    this.farMesh.userData.terrain = true;
    this.farMesh.userData.noRaycast = true;
    this.group.add(this.farMesh);
  }

  // Select LODs, rebuild dirty chunks. Call every frame (cheap).
  update(camPos) {
    const b = this.lodBias;
    const lodSegs = [64, 32, 16, 8];
    let rebuilt = 0;
    for (const chunk of this.chunks) {
      const d = Math.max(0, Math.hypot(camPos.x - chunk.cx, camPos.z - chunk.cz) - this.chunkSize * 0.7);
      let lod = d < 70 * b ? 0 : d < 170 * b ? 1 : d < 380 * b ? 2 : 3;
      const idx = chunk.i + chunk.j * this.chunksPerSide;
      if (this.dirtyChunks.has(idx)) {
        for (const g of chunk.lods.values()) g.dispose();
        chunk.lods.clear();
        chunk.lod = -1;
        this.dirtyChunks.delete(idx);
      }
      if (lod !== chunk.lod) {
        if (!chunk.lods.has(lod)) {
          if (rebuilt > 3 && chunk.lod >= 0) continue; // spread work over frames
          chunk.lods.set(lod, this._buildChunkGeometry(chunk, lodSegs[lod]));
          rebuilt++;
        }
        chunk.mesh.geometry = chunk.lods.get(lod);
        chunk.mesh.visible = true;
        chunk.lod = lod;
        // Drop far-away cached high LODs to save memory.
        for (const [l, g] of chunk.lods) if (l < lod - 1) { g.dispose(); chunk.lods.delete(l); }
      }
    }
    if (this.heightTexDirty && this.heightTex) { this.heightTex.needsUpdate = true; this.heightTexDirty = false; }
    if (this.paintTexDirty && this.paintTex) { this.paintTex.needsUpdate = true; this.paintTexDirty = false; }
  }

  dispose() {
    for (const c of this.chunks) for (const g of c.lods.values()) g.dispose();
    if (this.farMesh) this.farMesh.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.heightTex) this.heightTex.dispose();
    if (this.paintTex) this.paintTex.dispose();
  }
}

const _v = new THREE.Vector3();

const TERRAIN_FRAG_PARS = /* glsl */`
precision highp sampler2DArray;
varying vec3 vTPos;
varying vec3 vTNrm;
uniform sampler2DArray uAlbArr;
uniform sampler2DArray uNorArr;
uniform sampler2DArray uOrmArr;
uniform sampler2D uPaint;
uniform float uTerrainHalf;
uniform float uWaterLevel;
uniform float uSnowLine;
uniform float uLayerScale[8];
uniform float uRockSlope;
uniform vec3 uTint;
uniform float uPalette;

float tHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float tNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( tHash( i ), tHash( i + vec2( 1, 0 ) ), u.x ), mix( tHash( i + vec2( 0, 1 ) ), tHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
float tFbm( vec2 p ) { return tNoise( p ) * 0.5 + tNoise( p * 2.03 + 7.1 ) * 0.3 + tNoise( p * 4.1 + 3.3 ) * 0.2; }

// Two-scale sample of one layer (hides tiling): returns albedo, writes normal (tangent xy) & orm.
vec3 sampleLayer( int li, vec2 wp, float dist, out vec3 nrm, out vec3 orm ) {
  float s = uLayerScale[ li ];
  vec2 uv1 = wp * s;
  vec2 uv2 = vec2( wp.x * 0.7071 - wp.y * 0.7071, wp.x * 0.7071 + wp.y * 0.7071 ) * s * 0.23 + 0.37;
  float fl = float( li );
  vec3 a1 = texture( uAlbArr, vec3( uv1, fl ) ).rgb;
  vec3 a2 = texture( uAlbArr, vec3( uv2, fl ) ).rgb;
  vec3 n1 = texture( uNorArr, vec3( uv1, fl ) ).xyz * 2.0 - 1.0;
  vec3 n2 = texture( uNorArr, vec3( uv2, fl ) ).xyz * 2.0 - 1.0;
  vec3 o1 = texture( uOrmArr, vec3( uv1, fl ) ).rgb;
  vec3 o2 = texture( uOrmArr, vec3( uv2, fl ) ).rgb;
  float far = smoothstep( 12.0, 90.0, dist );
  float w2 = 0.35 + 0.45 * far;
  nrm = normalize( mix( n1, n2, w2 * 0.8 ) );
  nrm.xy *= 1.0 - far * 0.6;
  orm = mix( o1, o2, w2 );
  return mix( a1, a2 * ( dot( a1, vec3( 0.33 ) ) / max( dot( a2, vec3( 0.33 ) ), 0.02 ) ), w2 * 0.5 ) ;
}
`;

const TERRAIN_FRAG_MAIN = /* glsl */`
vec3 tAlb = vec3( 0.0 ); vec3 tNrmW = vTNrm; float tRough = 0.9; float tAO = 1.0;
{
  vec3 N = normalize( vTNrm );
  vec2 wp = vTPos.xz;
  float h = vTPos.y;
  float dist = length( vTPos - cameraPosition );
  float slope = 1.0 - N.y;
  vec2 puv = ( wp + uTerrainHalf ) / ( 2.0 * uTerrainHalf );
  vec4 paint = ( puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 ) ? texture2D( uPaint, puv ) : vec4( 0.0 );
  float n1 = tFbm( wp * 0.012 ), n2 = tFbm( wp * 0.05 + 11.0 ), n3 = tFbm( wp * 0.2 + 3.0 );
  float w[8];
  w[0] = 1.0;                                                         // grass
  w[1] = smoothstep( 0.45, 0.75, n1 + n3 * 0.15 ) * 1.2;               // meadow / dry grass
  w[2] = smoothstep( 0.62, 0.8, n2 ) * 0.8 + smoothstep( 0.18, 0.3, slope ) * 0.6 + paint.g * 2.5; // dirt
  w[3] = smoothstep( uRockSlope, uRockSlope + 0.14, slope + ( n3 - 0.5 ) * 0.12 ) * 6.0;          // rock
  w[4] = smoothstep( uWaterLevel + 2.2, uWaterLevel + 0.6, h + ( n3 - 0.5 ) * 1.5 ) * 5.0 + paint.b * 4.0; // sand
  w[5] = smoothstep( uSnowLine - 8.0, uSnowLine + 12.0, h + ( n1 - 0.5 ) * 30.0 ) * ( 1.0 - smoothstep( 0.35, 0.65, slope ) ) * 8.0; // snow
  w[6] = paint.r * 6.0;                                                // gravel path
  w[7] = smoothstep( 0.55, 0.75, tFbm( wp * 0.008 + 5.0 ) ) * ( 1.0 - smoothstep( 0.2, 0.35, slope ) ) * 1.4; // forest floor
  // Exclusivity: strong layers suppress weaker ones.
  float hard = max( max( w[3], w[5] ), max( w[4], w[6] ) );
  for ( int i = 0; i < 3; i ++ ) w[ i ] *= max( 0.0, 1.0 - hard * 0.8 );
  w[7] *= max( 0.0, 1.0 - hard );
  float sum = 0.0;
  for ( int i = 0; i < 8; i ++ ) sum += w[ i ];
  vec3 nAcc = vec3( 0.0 ); vec3 oAcc = vec3( 0.0 );
  for ( int i = 0; i < 8; i ++ ) {
    float wi = w[ i ] / sum;
    if ( wi < 0.02 ) continue;
    vec3 ln, lo;
    vec3 la;
    if ( i == 3 ) {
      // Triplanar rock on cliffs.
      vec3 bw = pow( abs( N ), vec3( 4.0 ) ); bw /= bw.x + bw.y + bw.z;
      vec3 nx, ox, ny, oy, nz, oz;
      vec3 ax = sampleLayer( 3, vTPos.zy, dist, nx, ox );
      vec3 ay = sampleLayer( 3, vTPos.xz, dist, ny, oy );
      vec3 az = sampleLayer( 3, vTPos.xy, dist, nz, oz );
      la = ax * bw.x + ay * bw.y + az * bw.z;
      ln = normalize( nx * bw.x + ny * bw.y + nz * bw.z );
      lo = ox * bw.x + oy * bw.y + oz * bw.z;
    } else {
      la = sampleLayer( i, wp, dist, ln, lo );
    }
    tAlb += la * wi; nAcc += ln * wi; oAcc += lo * wi;
  }
  // Macro colour variation.
  tAlb *= 0.86 + 0.28 * n1;
  tAlb = mix( tAlb, tAlb * vec3( 1.06, 1.0, 0.86 ), smoothstep( 0.5, 0.8, n2 ) * 0.4 );
  // Wet shoreline / underwater darkening.
  float wet = smoothstep( uWaterLevel + 0.8, uWaterLevel - 0.2, h );
  tAlb *= 1.0 - wet * 0.45;
  tAlb *= uTint;
  nAcc = normalize( nAcc );
  // World-space normal from tangent-space map on a heightfield: T = +X, B = +Z.
  vec3 T = normalize( vec3( 1.0, 0.0, 0.0 ) - N * N.x );
  vec3 B = normalize( cross( T, N ) );
  tNrmW = normalize( T * nAcc.x + B * nAcc.y + N * nAcc.z );
  tRough = mix( oAcc.g, 0.15, wet * 0.8 );
  tAO = oAcc.r;
  diffuseColor.rgb *= tAlb;
}
`;
