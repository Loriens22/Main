import * as THREE from 'three';
import type { HeightField } from './Heightmap';

/**
 * CDLOD terrain renderer: quadtree node selection on the CPU, one instanced grid patch on the GPU,
 * heights fetched from float textures (near + far maps) with geomorphing to hide LOD transitions.
 * Shading is supplied per planet as a GLSL function `TerrainOut terrainShade(vec3 wpos, vec3 n)`.
 */
const GRID = 32;

export interface TerrainShading {
  uniforms: Record<string, THREE.IUniform>;
  /** GLSL declarations + `TerrainOut terrainShade(vec3 wpos, vec3 n)` implementation */
  glsl: string;
}

export interface TerrainOptions {
  field: HeightField;
  rootSize: number;
  rootCenter: [number, number];
  leafSize?: number;
  lodBase?: number; // range of the finest level
  shading: TerrainShading;
  maxInstances?: number;
}

const VERT_DECL = /* glsl */ `
attribute vec4 aNode;   // x0, z0, size, level
attribute vec2 aMorph;  // morph start, morph end
uniform sampler2D tHNear; uniform vec4 uNear;
uniform sampler2D tHFar; uniform vec4 uFar; uniform float uFarOn; uniform float uBlend;
varying vec3 vTWorld; varying vec3 vTNormal;
float tSample(sampler2D t, vec4 u, vec2 xz){
  vec2 p = (xz - u.xy) / u.z * (u.w - 1.0);
  p = clamp(p, vec2(0.0), vec2(u.w - 1.001));
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p);
  float a = texelFetch(t, i, 0).r; float b = texelFetch(t, i + ivec2(1,0), 0).r;
  float c = texelFetch(t, i + ivec2(0,1), 0).r; float d = texelFetch(t, i + ivec2(1,1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float tHeight(vec2 xz){
  vec2 r = xz - uNear.xy;
  float e = min(min(r.x, uNear.z - r.x), min(r.y, uNear.z - r.y));
  if (uFarOn < 0.5) return tSample(tHNear, uNear, xz);
  float hf = tSample(tHFar, uFar, xz);
  if (e <= 0.0) return hf;
  float hn = tSample(tHNear, uNear, xz);
  float t = clamp(e / uBlend, 0.0, 1.0);
  return mix(hf, hn, t * t * (3.0 - 2.0 * t));
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vTWorld; varying vec3 vTNormal;
struct TerrainOut { vec3 albedo; float rough; vec3 normal; float ao; };
`;

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private aNode: THREE.InstancedBufferAttribute;
  private aMorph: THREE.InstancedBufferAttribute;
  private ranges: number[] = [];
  private levels: number;
  private leaf: number;
  private count = 0;
  private max: number;
  private frustum = new THREE.Frustum();
  private box = new THREE.Box3();
  private camPos = new THREE.Vector3();
  readonly uniforms: Record<string, THREE.IUniform>;
  detailBias = 1; // view-distance setting multiplier

  constructor(readonly opts: TerrainOptions) {
    this.leaf = opts.leafSize ?? 64;
    this.levels = Math.max(1, Math.round(Math.log2(opts.rootSize / this.leaf)) + 1);
    const base = opts.lodBase ?? 90;
    for (let l = 0; l < this.levels; l++) this.ranges.push(base * Math.pow(2, l));
    this.max = opts.maxInstances ?? 1200;

    // grid patch in grid units (0..GRID)
    const g = new THREE.InstancedBufferGeometry();
    const n = GRID + 1;
    const pos = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = i; pos[k + 1] = 0; pos[k + 2] = j;
    }
    const idx: number[] = [];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // alternate diagonals for better shape
      if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * n * 2), 2));
    g.setIndex(idx);
    this.aNode = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.aMorph = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 2), 2);
    this.aNode.setUsage(THREE.DynamicDrawUsage);
    this.aMorph.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aNode', this.aNode);
    g.setAttribute('aMorph', this.aMorph);
    g.instanceCount = 0;
    this.geo = g;

    const f = opts.field;
    this.uniforms = {
      tHNear: { value: f.near.texture() },
      uNear: { value: new THREE.Vector4(f.near.minX, f.near.minZ, f.near.size, f.near.res) },
      tHFar: { value: f.far ? f.far.texture() : f.near.texture() },
      uFar: { value: f.far ? new THREE.Vector4(f.far.minX, f.far.minZ, f.far.size, f.far.res) : new THREE.Vector4(f.near.minX, f.near.minZ, f.near.size, f.near.res) },
      uFarOn: { value: f.far ? 1 : 0 },
      uBlend: { value: f.blend },
      ...opts.shading.uniforms,
    };
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace(
          '#include <beginnormal_vertex>',
          /* glsl */ `
          vec2 gIdx = position.xz;
          float nSize = aNode.z;
          vec2 wxz = aNode.xy + gIdx / ${GRID}.0 * nSize;
          float h0 = tHeight(wxz);
          float dist = distance(cameraPosition, vec3(wxz.x, h0, wxz.y));
          float morphK = clamp((dist - aMorph.x) / (aMorph.y - aMorph.x), 0.0, 1.0);
          vec2 fr = fract(gIdx * 0.5) * 2.0;
          gIdx -= fr * morphK;
          wxz = aNode.xy + gIdx / ${GRID}.0 * nSize;
          float hgt = tHeight(wxz);
          float e = max(nSize / ${GRID}.0, 1.0);
          vec3 objectNormal = normalize(vec3(tHeight(wxz - vec2(e, 0.0)) - tHeight(wxz + vec2(e, 0.0)), 2.0 * e, tHeight(wxz - vec2(0.0, e)) - tHeight(wxz + vec2(0.0, e))));
          vTWorld = vec3(wxz.x, hgt, wxz.y);
          vTNormal = objectNormal;
          `,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = vTWorld;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_DECL + opts.shading.glsl)
        .replace('#include <map_fragment>', '#include <map_fragment>\nTerrainOut T = terrainShade(vTWorld, normalize(vTNormal));\ndiffuseColor.rgb = T.albedo;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = T.rough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(T.normal, 0.0)).xyz);')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= T.ao;');
    };
    m.customProgramCacheKey = () => 'terrain-cdlod';
    this.material = m;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.owned = true;
  }

  height(x: number, z: number) {
    return this.opts.field.height(x, z);
  }

  update(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    const pv = new THREE.Matrix4().multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(pv);
    camera.getWorldPosition(this.camPos);
    this.count = 0;
    const s = this.opts.rootSize;
    const [cx, cz] = this.opts.rootCenter;
    this.select(cx - s / 2, cz - s / 2, s, this.levels - 1);
    this.geo.instanceCount = this.count;
    this.aNode.needsUpdate = true;
    this.aMorph.needsUpdate = true;
    this.aNode.addUpdateRange(0, this.count * 4);
    this.aMorph.addUpdateRange(0, this.count * 2);
  }

  private nodeBox(x0: number, z0: number, size: number) {
    const f = this.opts.field;
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
      const h = f.height(x0 + (size * i) / 2, z0 + (size * j) / 2);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    const pad = Math.min(250, 20 + size * 0.08);
    this.box.min.set(x0, lo - pad, z0);
    this.box.max.set(x0 + size, hi + pad, z0 + size);
    return this.box;
  }

  private range(l: number) {
    return this.ranges[l] * this.detailBias;
  }

  private select(x0: number, z0: number, size: number, level: number): boolean {
    const box = this.nodeBox(x0, z0, size);
    const r = level === this.levels - 1 ? Infinity : this.range(level);
    if (box.distanceToPoint(this.camPos) > r) return false;
    if (!this.frustum.intersectsBox(box)) return true;
    if (level === 0 || box.distanceToPoint(this.camPos) > this.range(level - 1)) {
      this.add(x0, z0, size, level);
      return true;
    }
    const hs = size / 2;
    const kids: [number, number][] = [[x0, z0], [x0 + hs, z0], [x0, z0 + hs], [x0 + hs, z0 + hs]];
    for (const [kx, kz] of kids) {
      if (!this.select(kx, kz, hs, level - 1)) {
        // child outside finer range: draw the quarter at this level's density (fully morphed child)
        this.add(kx, kz, hs, level - 1, true);
      }
    }
    return true;
  }

  private add(x0: number, z0: number, size: number, level: number, _quarter = false) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const a = this.aNode.array as Float32Array;
    a[i * 4] = x0;
    a[i * 4 + 1] = z0;
    a[i * 4 + 2] = size;
    a[i * 4 + 3] = level;
    const m = this.aMorph.array as Float32Array;
    const end = this.range(level);
    m[i * 2] = end * 0.72;
    m[i * 2 + 1] = end * 0.98;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
