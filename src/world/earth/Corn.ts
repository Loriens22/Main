import * as THREE from 'three';
import type { EarthContent } from './EarthContent';
import { FIELDS, type FieldDef } from '../../data/earthLayout';
import { rng } from '../../util/noise';

const CHUNK = 16;
const ROW = 0.76;
const STEP = 0.24;
const STRIP = 9; // combine header width (m)

/** Harvest progress as serpentine strips across each field (fully described by one number per field). */
export class HarvestModel {
  constructor(readonly progress: number[]) {}

  strips(f: FieldDef) {
    const [x0, z0, x1, z1] = f.rect;
    const across = f.rowDir === 'z' ? x1 - x0 : z1 - z0;
    return Math.max(1, Math.floor(across / STRIP));
  }

  /** world position of the harvesting point for progress p (combine path) */
  pathPoint(f: FieldDef, p: number) {
    const [x0, z0, x1, z1] = f.rect;
    const n = this.strips(f);
    const s = Math.min(n - 1e-6, p * n);
    const k = Math.floor(s);
    const along = s - k;
    const fwd = k % 2 === 0;
    const a = fwd ? along : 1 - along;
    if (f.rowDir === 'z') return { x: x0 + (k + 0.5) * STRIP, z: z0 + 2 + a * (z1 - z0 - 4), dirX: 0, dirZ: fwd ? 1 : -1 };
    return { x: x0 + 2 + a * (x1 - x0 - 4), z: z0 + (k + 0.5) * STRIP, dirX: fwd ? 1 : -1, dirZ: 0 };
  }

  harvested(f: FieldDef, x: number, z: number) {
    const p = this.progress[f.id] ?? 0;
    if (p <= 0) return false;
    const [x0, z0, x1, z1] = f.rect;
    const n = this.strips(f);
    const across = f.rowDir === 'z' ? x - x0 : z - z0;
    const k = Math.floor(across / STRIP);
    const s = p * n;
    const done = Math.floor(s);
    if (k < done) return true;
    if (k > done) return false;
    const partial = s - done;
    const t = f.rowDir === 'z' ? (z - z0 - 2) / (z1 - z0 - 4) : (x - x0 - 2) / (x1 - x0 - 4);
    const along = k % 2 === 0 ? t : 1 - t;
    return along < partial;
  }
}

interface Chunk {
  key: string;
  cx: number;
  cz: number;
  data: Float32Array; // per plant: x, y, z, yaw, scale, tint, variant
  count: number;
}

const VARIANTS = 3;

/**
 * Corn fields: chunked GPU-instanced plants (two LODs × three variants) with wind sway,
 * a distant canopy shell, and harvest state shared with the combines.
 */
export class CornFields {
  readonly harvest: HarvestModel;
  private chunks = new Map<string, Chunk>();
  private lod: { geo: THREE.InstancedBufferGeometry; mesh: THREE.Mesh; offset: THREE.InstancedBufferAttribute; param: THREE.InstancedBufferAttribute; cap: number }[] = [];
  private lastRebuild = new THREE.Vector3(1e9, 0, 0);
  private ready = false;
  readonly uniforms = { uTime: { value: 0 }, uWind: { value: 0.25 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) }, uDust: { value: 0 } };
  private canopy: THREE.Mesh | null = null;
  private canopyUniforms: Record<string, THREE.IUniform> = {};
  private r0 = 18;
  private r1 = 52;
  private frustum = new THREE.Frustum();
  private dirtyHarvest = false;
  private harvestTimer = 0;

  constructor(readonly content: EarthContent) {
    const st = content.game.state;
    while (st.farm.harvest.length < FIELDS.length) st.farm.harvest.push(0);
    this.harvest = new HarvestModel(st.farm.harvest);
    (content as any).corn = this;
    this.applyDensity();
    this.paintHarvestAll();
    this.load();
  }

  private applyDensity() {
    const d = this.content.game.settings.graphics.vegetationDensity;
    this.r0 = 6 + 6 * d;
    this.r1 = 20 + 26 * d;
    this.lastRebuild.set(1e9, 0, 0);
  }

  onSettingsChanged() {
    this.applyDensity();
  }

  private async load() {
    const game = this.content.game;
    const g = await game.assets.load('corn');
    const geos: THREE.BufferGeometry[][] = [[], []];
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Group).isGroup) return;
      const match = /^corn_(\d)_lod(\d)$/.exec(o.name);
      if (!match) return;
      const v = +match[1], l = +match[2];
      // multi-material nodes come as a Group with child meshes: merge their geometries with groups
      const parts: THREE.Mesh[] = [];
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) parts.push(c as THREE.Mesh); });
      geos[l][v] = mergeWithGroups(parts);
    });
    const mats = this.makeMaterials();
    for (let l = 0; l < 2; l++) {
      for (let v = 0; v < VARIANTS; v++) {
        const src = geos[l][v];
        if (!src) continue;
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = src.index;
        for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
        for (const gr of src.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
        const cap = l === 0 ? 14000 : 40000;
        const offset = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        const param = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
        offset.setUsage(THREE.DynamicDrawUsage);
        param.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aOffset', offset);
        geo.setAttribute('aParam', param);
        geo.instanceCount = 0;
        const mesh = new THREE.Mesh(geo, mats.map((m) => m));
        mesh.frustumCulled = false;
        mesh.castShadow = l === 0 && game.settings.graphics.shadowQuality >= 2;
        mesh.receiveShadow = true;
        mesh.customDepthMaterial = this.depthMaterial();
        mesh.userData.owned = true;
        this.content.zone.scene.add(mesh);
        this.lod.push({ geo, mesh, offset, param, cap });
        (mesh as any).lodLevel = l;
        (mesh as any).variant = v;
      }
    }
    this.buildCanopy();
    this.ready = true;
  }

  private windChunk() {
    return /* glsl */ `
      attribute vec4 aOffset; attribute vec2 aParam;
      uniform float uTime, uWind; uniform vec2 uWindDir;
      varying float vTint; varying float vH;
      vec3 cornXform(vec3 p, out mat3 R) {
        float c = cos(aOffset.w), s = sin(aOffset.w);
        R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
        p *= aParam.x;
        float h = clamp(p.y / 2.4, 0.0, 1.0);
        float ph = dot(aOffset.xz, vec2(0.21, 0.17)) + uTime * (1.1 + uWind * 2.5);
        float gust = sin(dot(aOffset.xz, uWindDir) * 0.05 - uTime * (0.6 + uWind)) * 0.5 + 0.5;
        float amp = (0.05 + uWind * 0.55) * h * h * (0.6 + 0.8 * gust);
        vec3 q = R * p;
        q.xz += uWindDir * amp * (0.6 + 0.4 * sin(ph)) + vec2(-uWindDir.y, uWindDir.x) * amp * 0.25 * sin(ph * 1.7);
        q.y -= amp * amp * 0.5;
        return q + aOffset.xyz;
      }`;
  }

  private makeMaterials(): THREE.Material[] {
    const game = this.content.game;
    const cols = [new THREE.Color(0.26, 0.38, 0.12), new THREE.Color(0.42, 0.45, 0.2), new THREE.Color(0.66, 0.58, 0.36)];
    return cols.map((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: i === 0 ? 0.62 : 0.75, side: THREE.DoubleSide, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\n' + this.windChunk())
          .replace('#include <beginnormal_vertex>', 'mat3 cR; vec3 cP = cornXform(position, cR);\nvec3 objectNormal = cR * normal;')
          .replace('#include <begin_vertex>', 'vec3 transformed = cP;\nvTint = aParam.y; vH = uv.y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vTint; varying float vH; uniform float uDust;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            // dying-earth corn: yellowing tips, dusty lower leaves, darker under the canopy
            diffuseColor.rgb *= mix(vec3(1.0), vec3(1.25, 1.12, 0.62), vTint * smoothstep(0.2, 1.0, vH));
            diffuseColor.rgb *= 0.45 + 0.55 * smoothstep(0.0, 0.85, vH);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.49, 0.38), uDust * 0.5 * (1.0 - vH * 0.5));
            if (!gl_FrontFacing) diffuseColor.rgb *= 1.08;`);
      };
      m.customProgramCacheKey = () => 'corn' + i;
      return m;
    });
  }

  private depthMaterial() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + this.windChunk())
        .replace('#include <begin_vertex>', 'mat3 cR; vec3 transformed = cornXform(position, cR);');
    };
    m.customProgramCacheKey = () => 'corndepth';
    return m;
  }

  private buildCanopy() {
    const gen = this.content.zone.gen;
    const mats = this.content.game.materials;
    const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
    let base = 0;
    const cell = 6;
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + Math.min(x1 - x0, i * cell), z = z0 + Math.min(z1 - z0, j * cell);
        pos.push(x, gen.height(x, z) + 2.15, z);
        nrm.push(0, 1, 0);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      base += (nx + 1) * (nz + 1);
      // side walls along the field perimeter
      const edges: [number, number, number, number][] = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
      for (const [ax, az, bx, bz] of edges) {
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(L / cell);
        const ex = (bz - az) / L, ez = -(bx - ax) / L; // outward normal
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const y = gen.height(x, z);
          pos.push(x, y, z, x, y + 2.2, z);
          nrm.push(ex, 0.25, ez, ex, 0.25, ez);
        }
        for (let k = 0; k < n; k++) {
          const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
          idx.push(a, c, b, b, c, d);
        }
        base += (n + 1) * 2;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    const z = this.content.zone;
    this.canopyUniforms = {
      tCanopy: { value: mats.tex('corn_canopy_a', true, 1) },
      tNoiseC: { value: mats.tex('noise', false, 1) },
      tHarvest: { value: z.harvestTex },
      uHarvestRect: { value: z.harvestRect },
      uNear: { value: this.r1 },
      ...this.uniforms,
    };
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.canopyUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCW; varying vec3 vCN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(position, 1.0)).xyz; vCN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCW; varying vec3 vCN; uniform sampler2D tCanopy, tNoiseC, tHarvest; uniform vec4 uHarvestRect; uniform float uNear, uTime, uDust;\nfloat hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float dcam = distance(cameraPosition.xz, vCW.xz);
          float fade = smoothstep(uNear * 0.82, uNear * 1.0, dcam);
          if (hh(floor(gl_FragCoord.xy)) > fade) discard;
          vec2 huv = (vCW.xz - uHarvestRect.xy) / uHarvestRect.zw;
          if (texture2D(tHarvest, huv).r > 0.5) discard;
          bool wall = abs(vCN.y) < 0.5;
          float nz = texture2D(tNoiseC, vCW.xz / 23.0 + vec2(uTime * 0.004, 0.0)).g;
`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 cc = texture2D(tCanopy, vCW.xz / 9.0).rgb * 0.6 + texture2D(tCanopy, vCW.xz / 41.0).rgb * 0.4;
          if (abs(vCN.y) < 0.5) {
            float stalk = 0.5 + 0.5 * sin((vCW.x + vCW.z) * 25.0);
            float leafs = texture2D(tNoiseC, vec2(vCW.x + vCW.z, vCW.y * 2.0) / 3.0).b;
            cc = mix(vec3(0.1, 0.13, 0.05), vec3(0.3, 0.38, 0.14), leafs * 0.8 + stalk * 0.2);
          }
          cc = mix(cc, vec3(0.5, 0.45, 0.33), uDust * 0.5);
          diffuseColor.rgb = cc * (0.85 + 0.3 * nz);`);
    };
    m.customProgramCacheKey = () => 'cornCanopy';
    this.canopy = new THREE.Mesh(geo, m);
    this.canopy.receiveShadow = true;
    this.canopy.userData.owned = true;
    z.scene.add(this.canopy);
  }

  /** Plants of a chunk (cached). */
  private chunk(cx: number, cz: number): Chunk {
    const key = `${cx},${cz}`;
    let c = this.chunks.get(key);
    if (c) return c;
    const gen = this.content.zone.gen;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const out: number[] = [];
    const r = rng((cx * 73856093) ^ (cz * 19349663));
    for (const f of FIELDS) {
      const [fx0, fz0, fx1, fz1] = f.rect;
      const ax0 = Math.max(x0, fx0 + 0.8), ax1 = Math.min(x0 + CHUNK, fx1 - 0.8);
      const az0 = Math.max(z0, fz0 + 0.8), az1 = Math.min(z0 + CHUNK, fz1 - 0.8);
      if (ax0 >= ax1 || az0 >= az1) continue;
      if (f.rowDir === 'z') {
        // rows run along Z, spaced in X
        const i0 = Math.ceil((ax0 - fx0) / ROW), i1 = Math.floor((ax1 - fx0) / ROW);
        for (let i = i0; i <= i1; i++) {
          const x = fx0 + i * ROW;
          for (let z = az0 + r() * STEP; z < az1; z += STEP * (0.75 + r() * 0.5)) this.plant(out, f, x + (r() - 0.5) * 0.08, z, r, gen);
        }
      } else {
        const i0 = Math.ceil((az0 - fz0) / ROW), i1 = Math.floor((az1 - fz0) / ROW);
        for (let i = i0; i <= i1; i++) {
          const z = fz0 + i * ROW;
          for (let x = ax0 + r() * STEP; x < ax1; x += STEP * (0.75 + r() * 0.5)) this.plant(out, f, x, z + (r() - 0.5) * 0.08, r, gen);
        }
      }
    }
    c = { key, cx, cz, data: new Float32Array(out), count: out.length / 7 };
    this.chunks.set(key, c);
    return c;
  }

  private plant(out: number[], f: FieldDef, x: number, z: number, r: () => number, gen: { height(x: number, z: number): number }) {
    if (r() < 0.04) return; // gaps
    if (this.harvest.harvested(f, x, z)) return;
    const y = gen.height(x, z);
    const tint = Math.pow(r(), 2) * 0.9 + (Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.5 + 0.5) * 0.25;
    out.push(x, y, z, r() * Math.PI * 2, 0.85 + r() * 0.3, Math.min(1, tint), Math.floor(r() * VARIANTS));
  }

  update(dt: number) {
    this.uniforms.uTime.value += dt;
    const zone = this.content.zone;
    this.uniforms.uWind.value = 0.25 + zone.storm * 0.75;
    this.uniforms.uDust.value = zone.storm * 0.8 + (this.content.game.state.farm.stormLevel ?? 0) * 0.2;
    if (this.canopyUniforms.uNear) this.canopyUniforms.uNear.value = this.r1;
    if (!this.ready) return;
    this.harvestTimer -= dt;
    if (this.dirtyHarvest && this.harvestTimer <= 0) {
      zone.harvestTex.needsUpdate = true;
      this.dirtyHarvest = false;
      this.harvestTimer = 1.0;
    }
    const cam = this.content.game.camera;
    const cp = cam.position;
    if (cp.distanceTo(this.lastRebuild) < 1.5 && !this.forceRebuild) return;
    this.forceRebuild = false;
    this.lastRebuild.copy(cp);
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const counts = this.lod.map(() => 0);
    const r1 = this.r1, r0 = this.r0;
    const cmin = Math.floor((cp.x - r1) / CHUNK), cmax = Math.floor((cp.x + r1) / CHUNK);
    const kmin = Math.floor((cp.z - r1) / CHUNK), kmax = Math.floor((cp.z + r1) / CHUNK);
    const box = new THREE.Box3();
    // quick reject: is any field within range?
    let any = false;
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      if (cp.x > x0 - r1 && cp.x < x1 + r1 && cp.z > z0 - r1 && cp.z < z1 + r1) any = true;
    }
    if (any && cp.y - zone.height(cp.x, cp.z) < 120) {
      for (let cz = kmin; cz <= kmax; cz++) for (let cx = cmin; cx <= cmax; cx++) {
        const nx = Math.max(cx * CHUNK, Math.min(cp.x, cx * CHUNK + CHUNK)) - cp.x;
        const nz = Math.max(cz * CHUNK, Math.min(cp.z, cz * CHUNK + CHUNK)) - cp.z;
        if (nx * nx + nz * nz > r1 * r1) continue;
        const gy = zone.height(cx * CHUNK + 8, cz * CHUNK + 8);
        box.min.set(cx * CHUNK, gy - 4, cz * CHUNK);
        box.max.set(cx * CHUNK + CHUNK, gy + 4, cz * CHUNK + CHUNK);
        if (!this.frustum.intersectsBox(box)) continue;
        const c = this.chunk(cx, cz);
        const d = c.data;
        for (let i = 0; i < c.count; i++) {
          const k = i * 7;
          const dx = d[k] - cp.x, dz = d[k + 2] - cp.z;
          const dd = dx * dx + dz * dz;
          if (dd > r1 * r1) continue;
          const l = dd < r0 * r0 ? 0 : 1;
          const slot = l * VARIANTS + d[k + 6];
          const L = this.lod[slot];
          if (!L) continue;
          const n = counts[slot];
          if (n >= L.cap) continue;
          const o = L.offset.array as Float32Array;
          const p = L.param.array as Float32Array;
          o[n * 4] = d[k]; o[n * 4 + 1] = d[k + 1]; o[n * 4 + 2] = d[k + 2]; o[n * 4 + 3] = d[k + 3];
          p[n * 2] = d[k + 4]; p[n * 2 + 1] = d[k + 5];
          counts[slot] = n + 1;
        }
      }
    }
    this.lod.forEach((L, i) => {
      L.geo.instanceCount = counts[i];
      L.offset.needsUpdate = true;
      L.param.needsUpdate = true;
      L.offset.clearUpdateRanges();
      L.param.clearUpdateRanges();
      L.offset.addUpdateRange(0, counts[i] * 4);
      L.param.addUpdateRange(0, counts[i] * 2);
    });
  }

  private forceRebuild = false;

  // ------------------------------------------------------------------------------------------ harvest
  /** Advance harvest of a field to progress p (called by combines). Repaints the swath and invalidates chunks. */
  setProgress(fieldId: number, p: number) {
    const f = FIELDS[fieldId];
    const old = this.harvest.progress[fieldId] ?? 0;
    if (p <= old) return;
    this.harvest.progress[fieldId] = Math.min(1, p);
    // repaint region between old and new path points
    const a = this.harvest.pathPoint(f, old), b = this.harvest.pathPoint(f, p);
    this.paintField(f, Math.min(a.x, b.x) - STRIP, Math.min(a.z, b.z) - STRIP, Math.max(a.x, b.x) + STRIP, Math.max(a.z, b.z) + STRIP);
    for (const pt of [a, b]) {
      const cx = Math.floor(pt.x / CHUNK), cz = Math.floor(pt.z / CHUNK);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.chunks.delete(`${cx + dx},${cz + dz}`);
    }
    this.forceRebuild = true;
    this.dirtyHarvest = true;
  }

  private paintHarvestAll() {
    for (const f of FIELDS) this.paintField(f, f.rect[0], f.rect[1], f.rect[2], f.rect[3]);
    this.content.zone.harvestTex.needsUpdate = true;
  }

  private paintField(f: FieldDef, x0: number, z0: number, x1: number, z1: number) {
    const z = this.content.zone;
    const tex = z.harvestTex;
    const img = tex.image as { data: Uint8Array; width: number; height: number };
    const r = z.harvestRect;
    const cs = r.z / img.width;
    const i0 = Math.max(0, Math.floor((Math.max(x0, f.rect[0]) - r.x) / cs)), i1 = Math.min(img.width - 1, Math.ceil((Math.min(x1, f.rect[2]) - r.x) / cs));
    const j0 = Math.max(0, Math.floor((Math.max(z0, f.rect[1]) - r.y) / cs)), j1 = Math.min(img.height - 1, Math.ceil((Math.min(z1, f.rect[3]) - r.y) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = r.x + (i + 0.5) * cs, zz = r.y + (j + 0.5) * cs;
      if (x < f.rect[0] || x > f.rect[2] || zz < f.rect[1] || zz > f.rect[3]) continue;
      img.data[j * img.width + i] = this.harvest.harvested(f, x, zz) ? 255 : 0;
    }
  }

  /** Is (x,z) inside standing corn? (NPC/vehicle/player queries) */
  standing(x: number, z: number) {
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      if (x > x0 && x < x1 && z > z0 && z < z1) return !this.harvest.harvested(f, x, z);
    }
    return false;
  }

  writeState() {
    this.content.game.state.farm.harvest = this.harvest.progress.slice();
  }
}

/** Merge a multi-material mesh group into one geometry with material groups. */
function mergeWithGroups(parts: THREE.Mesh[]): THREE.BufferGeometry {
  if (parts.length === 1 && !Array.isArray(parts[0].material)) {
    const g = parts[0].geometry.clone();
    g.clearGroups();
    g.addGroup(0, g.index ? g.index.count : g.getAttribute('position').count, materialIndex(parts[0].material as THREE.Material));
    return g;
  }
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const groups: { start: number; count: number; mat: number }[] = [];
  let vbase = 0;
  for (const p of parts) {
    const g = p.geometry;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
    const start = idx.length;
    const I = g.index!;
    for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + vbase);
    groups.push({ start, count: I.count, mat: materialIndex(p.material as THREE.Material) });
    vbase += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  for (const g of groups) out.addGroup(g.start, g.count, g.mat);
  return out;
}

function materialIndex(m: THREE.Material) {
  const n = m?.name ?? '';
  if (n.startsWith('corn_stalk')) return 1;
  if (n.startsWith('corn_tassel')) return 2;
  return 0;
}
