import * as THREE from 'three';
import { materials } from '../../render/Materials';
import { patchWorldMaterial } from '../../render/patch';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../../physics/Physics';
import { buildChunk, ChunkData, ChunkRequest } from './chunk';
import { terrainSource, TerrainSource } from './sources';

export interface TerrainLayers {
  /** texture set names for the four splat layers + the slope (rock) layer */
  sets: [string, string, string, string, string];
  /** metres per texture repeat for each */
  tiles: [number, number, number, number, number];
  /** colour multipliers */
  tints?: [number, number, number][];
  /** what the aux channel means: distant crop canopy on Earth, none elsewhere */
  aux?: 'crop' | 'none';
  cropColor?: [number, number, number];
  rockSlope?: [number, number];
}

export interface TerrainOptions {
  source: string;
  layers: TerrainLayers;
  rootSize?: number;
  minSize?: number;
  resolution?: number;
  /** distance / size ratio below which a node splits */
  detail?: number;
  maxBuildsPerFrame?: number;
}

interface Node {
  x0: number; z0: number; size: number; level: number;
  children: Node[] | null;
  mesh: THREE.Mesh | null;
  pending: number; // request id or 0
  minY: number; maxY: number;
  visible: boolean;
  lastUsed: number;
}

const TEX = (set: string, map: string) => `${import.meta.env.BASE_URL}assets/textures/${set}_${map}.webp`;

/** Quadtree level-of-detail terrain streamed around the camera, meshed in a worker. */
export class Terrain {
  group = new THREE.Group();
  source: TerrainSource;
  material: THREE.MeshStandardMaterial;
  private root: Node;
  private worker: Worker;
  private nextId = 1;
  private requests = new Map<number, Node>();
  private inFlight = 0;
  private opts: Required<Omit<TerrainOptions, 'layers' | 'source'>> & { layers: TerrainLayers; source: string };
  private frame = 0;
  private cam = new THREE.Vector3();
  private uniforms: Record<string, THREE.IUniform> = {};
  // collision
  private colTiles = new Map<string, { collider: RAPIER.Collider; used: number }>();
  readonly colSize = 48;
  readonly colStep = 2;
  ready = false;

  constructor(private phys: PhysicsWorld, o: TerrainOptions) {
    this.opts = { rootSize: 32768, minSize: 64, resolution: 32, detail: 1.55, maxBuildsPerFrame: 4, ...o };
    this.source = terrainSource(o.source);
    this.worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<ChunkData>) => this.onChunk(e.data);
    const R = this.opts.rootSize;
    this.root = this.makeNode(-R / 2, -R / 2, R, 0);
    this.material = this.makeMaterial();
    this.group.name = 'terrain';
  }

  private makeNode(x0: number, z0: number, size: number, level: number): Node {
    return { x0, z0, size, level, children: null, mesh: null, pending: 0, minY: -50, maxY: 400, visible: false, lastUsed: 0 };
  }

  // ---------------------------------------------------------------------------------- material
  private makeMaterial() {
    const L = this.opts.layers;
    const loader = new THREE.TextureLoader();
    const tex = (set: string, map: string, srgb: boolean) => {
      const t = loader.load(TEX(set, map));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = materials.anisotropy;
      return t;
    };
    const tA = L.sets.map((s) => tex(s, 'albedo', true));
    const tN = L.sets.map((s) => tex(s, 'normal', false));
    const tO = L.sets.map((s) => tex(s, 'orm', false));
    const tints = (L.tints ?? [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]).map((c) => new THREE.Vector3(...c));
    this.uniforms = {
      tA: { value: tA }, tN: { value: tN }, tO: { value: tO },
      uTile: { value: L.tiles.map((t) => 1 / t) },
      uTint: { value: tints },
      uCrop: { value: new THREE.Vector4(...(L.cropColor ?? [0.19, 0.3, 0.09]), L.aux === 'crop' ? 1 : 0) },
      uRock: { value: new THREE.Vector2(...(L.rockSlope ?? [0.5, 0.72])) },
    };
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    patchWorldMaterial(m, { dirt: 0, wear: 0, dust: 1 }, { vao: false });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nattribute float aux;\nvarying vec4 vSplat;\nvarying float vAux;\nvarying vec3 vWN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = splat;\nvAux = aux;\nvWN = normalize( mat3( modelMatrix ) * normal );');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + TERRAIN_PARS)
        .replace('#include <map_fragment>', TERRAIN_ALBEDO)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + TERRAIN_NORMAL);
    };
    m.customProgramCacheKey = () => 'terrain|' + L.sets.join(',') + (L.aux ?? '');
    return m;
  }

  // ---------------------------------------------------------------------------------- streaming
  private onChunk(d: ChunkData) {
    const node = this.requests.get(d.id);
    this.requests.delete(d.id);
    this.inFlight--;
    if (!node || node.pending !== d.id) return;
    node.pending = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(d.splat, 4, true));
    g.setAttribute('aux', new THREE.BufferAttribute(d.aux, 1, true));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    const cy = (d.minY + d.maxY) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(node.size / 2, cy, node.size / 2), Math.hypot(node.size * 0.7072, (d.maxY - d.minY) / 2 + 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minY, 0), new THREE.Vector3(node.size, d.maxY, node.size));
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(node.x0, 0, node.z0);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    node.mesh = mesh;
    node.minY = d.minY;
    node.maxY = d.maxY;
    this.group.add(mesh);
  }

  private request(node: Node) {
    if (node.pending || node.mesh) return;
    const id = this.nextId++;
    node.pending = id;
    this.requests.set(id, node);
    this.inFlight++;
    const req: ChunkRequest = { id, source: this.opts.source, x0: node.x0, z0: node.z0, size: node.size, n: this.opts.resolution, skirt: node.size * 0.04 + 0.5 };
    this.worker.postMessage(req);
  }

  private dist(node: Node) {
    const c = this.cam;
    const dx = Math.max(node.x0 - c.x, 0, c.x - (node.x0 + node.size));
    const dz = Math.max(node.z0 - c.z, 0, c.z - (node.z0 + node.size));
    const dy = Math.max(node.minY - c.y, 0, c.y - node.maxY);
    return Math.hypot(dx, dy, dz);
  }

  private disposeNode(node: Node, self: boolean) {
    if (node.children) {
      for (const ch of node.children) this.disposeNode(ch, true);
      node.children = null;
    }
    if (self) {
      if (node.mesh) {
        this.group.remove(node.mesh);
        node.mesh.geometry.dispose();
        node.mesh = null;
      }
      if (node.pending) { this.requests.delete(node.pending); node.pending = 0; }
    }
  }

  private want: { node: Node; pri: number }[] = [];

  private ask(node: Node) {
    if (node.pending || node.mesh) return;
    // coarse tiles first (fast full coverage), then nearest
    this.want.push({ node, pri: this.dist(node) / node.size - node.size * 1e-4 });
  }

  /** Returns true if this node (or its descendants) fully covers its area with ready meshes. */
  private select(node: Node, budget: { n: number }): boolean {
    node.lastUsed = this.frame;
    const wantSplit = node.size > this.opts.minSize && this.dist(node) < node.size * this.opts.detail;
    if (wantSplit) {
      if (!node.children) {
        const h = node.size / 2;
        node.children = [
          this.makeNode(node.x0, node.z0, h, node.level + 1), this.makeNode(node.x0 + h, node.z0, h, node.level + 1),
          this.makeNode(node.x0, node.z0 + h, h, node.level + 1), this.makeNode(node.x0 + h, node.z0 + h, h, node.level + 1),
        ];
        for (const ch of node.children) { ch.minY = node.minY; ch.maxY = node.maxY; }
      }
      let all = true;
      for (const ch of node.children) if (!this.select(ch, budget)) all = false;
      if (all) {
        if (node.mesh) node.mesh.visible = false;
        return true;
      }
      // children not ready: keep showing this node (if available) and hide the children for now
      for (const ch of node.children) this.hide(ch);
      if (node.mesh) { node.mesh.visible = true; return true; }
      this.ask(node);
      return false;
    }
    // leaf at this distance
    if (node.children) {
      // collapse once our own mesh is ready
      if (node.mesh) this.disposeNode(node, false);
      else {
        let all = true;
        for (const ch of node.children) if (!this.selectAsIs(ch)) all = false;
        this.ask(node);
        return all;
      }
    }
    if (node.mesh) { node.mesh.visible = true; return true; }
    this.ask(node);
    return false;
  }

  private selectAsIs(node: Node): boolean {
    if (node.children) {
      let all = true;
      for (const ch of node.children) if (!this.selectAsIs(ch)) all = false;
      if (all) { if (node.mesh) node.mesh.visible = false; return true; }
    }
    if (node.mesh) { node.mesh.visible = true; return true; }
    return false;
  }

  private hide(node: Node) {
    if (node.mesh) node.mesh.visible = false;
    if (node.children) for (const ch of node.children) this.hide(ch);
  }

  update(camPos: THREE.Vector3) {
    this.frame++;
    this.cam.copy(camPos);
    const budget = { n: Math.max(0, this.opts.maxBuildsPerFrame - this.inFlight) };
    this.want.length = 0;
    const covered = this.select(this.root, budget);
    if (this.want.length && budget.n > 0) {
      this.want.sort((a, b) => a.pri - b.pri);
      for (let i = 0; i < this.want.length && budget.n > 0; i++) { this.request(this.want[i].node); budget.n--; }
    }
    if (covered && this.inFlight === 0 && this.want.length === 0) this.ready = true;
  }

  /** Fraction of streaming work still outstanding (for the loading screen). */
  get busy() { return this.inFlight; }

  setDetail(mult: number) { this.opts.detail = 1.55 * mult; }

  // ---------------------------------------------------------------------------------- collision
  /** Make sure exact-resolution collision exists around a point (player, vehicles). Synchronous. */
  ensureCollision(x: number, z: number, radius = 30) {
    const S = this.colSize;
    const i0 = Math.floor((x - radius) / S), i1 = Math.floor((x + radius) / S);
    const j0 = Math.floor((z - radius) / S), j1 = Math.floor((z + radius) / S);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = i + ',' + j;
      const t = this.colTiles.get(key);
      if (t) { t.used = this.frame; continue; }
      const d = buildChunk(this.source, { id: 0, source: '', x0: i * S, z0: j * S, size: S, n: S / this.colStep, skirt: 0 });
      const verts = d.positions;
      for (let k = 0; k < verts.length; k += 3) { verts[k] += i * S; verts[k + 2] += j * S; }
      if (d.index.length < 3) continue;
      const desc = RAPIER.ColliderDesc.trimesh(verts, Uint32Array.from(d.index)).setFriction(1.0).setCollisionGroups(groups(GROUP.WORLD, 0xffff));
      const collider = this.phys.world.createCollider(desc);
      this.colTiles.set(key, { collider, used: this.frame });
    }
    if (this.colTiles.size > 80) {
      for (const [k, t] of this.colTiles) {
        if (this.frame - t.used > 600) { this.phys.world.removeCollider(t.collider, false); this.colTiles.delete(k); }
      }
    }
  }

  height(x: number, z: number) { return this.source.height(x, z); }

  normal(x: number, z: number, out: THREE.Vector3) {
    const e = 0.6;
    const hx = this.source.height(x + e, z) - this.source.height(x - e, z);
    const hz = this.source.height(x, z + e) - this.source.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  dispose() {
    this.worker.terminate();
    this.disposeNode(this.root, true);
    for (const t of this.colTiles.values()) this.phys.world.removeCollider(t.collider, false);
    this.colTiles.clear();
    this.material.dispose();
  }
}

const TERRAIN_PARS = /* glsl */ `
uniform sampler2D tA[5];
uniform sampler2D tN[5];
uniform sampler2D tO[5];
uniform float uTile[5];
uniform vec3 uTint[5];
uniform vec4 uCrop;
uniform vec2 uRock;
varying vec4 vSplat;
varying float vAux;
varying vec3 vWN;
float terrRough;
vec3 terrN;
float tHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float tNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( tHash( i ), tHash( i + vec2( 1, 0 ) ), u.x ), mix( tHash( i + vec2( 0, 1 ) ), tHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
`;

// Replaces map_fragment: blends five PBR layers in world space, with distance-dependent re-tiling to hide repetition.
const TERRAIN_ALBEDO = /* glsl */ `
{
  vec3 wp = vWPos;
  float dist = length( wp - cameraPosition );
  float farK = smoothstep( 25.0, 220.0, dist ) * 0.75;
  vec4 w = vSplat;
  float slope = 1.0 - clamp( vWN.y, 0.0, 1.0 );
  float rock = smoothstep( uRock.x, uRock.y, slope + ( tNoise( wp.xz * 0.11 ) - 0.5 ) * 0.12 );
  w *= 1.0 - rock;
  // break up straight blend lines with noise before normalising
  float nz = tNoise( wp.xz * 0.37 ) * 0.5 + tNoise( wp.xz * 1.9 ) * 0.5;
  w = max( w + ( nz - 0.5 ) * 0.35 * step( 0.02, w ) * ( 1.0 - w ), 0.0 );
  float ws = w.x + w.y + w.z + w.w + rock + 1e-4;
  vec3 alb = vec3( 0.0 ); vec3 nrm = vec3( 0.0 ); vec3 orm = vec3( 0.0 );
  #define TLAYER( i, wt ) if ( wt > 0.004 ) { vec2 uv = wp.xz * uTile[ i ]; vec3 a = texture2D( tA[ i ], uv ).rgb; vec3 af = texture2D( tA[ i ], uv * 0.137 + 0.31 ).rgb; alb += mix( a, af, farK ) * uTint[ i ] * wt; nrm += ( texture2D( tN[ i ], uv ).xyz * 2.0 - 1.0 ) * wt * ( 1.0 - farK * 0.8 ); orm += texture2D( tO[ i ], uv ).rgb * wt; }
  TLAYER( 0, w.x )
  TLAYER( 1, w.y )
  TLAYER( 2, w.z )
  TLAYER( 3, w.w )
  if ( rock > 0.004 ) {
    // tri-planar for cliffs so the rock does not stretch
    vec3 bw = pow( abs( vWN ), vec3( 4.0 ) ); bw /= bw.x + bw.y + bw.z;
    vec2 ux = wp.zy * uTile[ 4 ], uy = wp.xz * uTile[ 4 ], uz = wp.xy * uTile[ 4 ];
    vec3 a = texture2D( tA[ 4 ], ux ).rgb * bw.x + texture2D( tA[ 4 ], uy ).rgb * bw.y + texture2D( tA[ 4 ], uz ).rgb * bw.z;
    vec3 af = texture2D( tA[ 4 ], uy * 0.137 ).rgb;
    alb += mix( a, af, farK * 0.6 ) * uTint[ 4 ] * rock;
    nrm += ( texture2D( tN[ 4 ], uy ).xyz * 2.0 - 1.0 ) * rock;
    orm += ( texture2D( tO[ 4 ], ux ).rgb * bw.x + texture2D( tO[ 4 ], uy ).rgb * bw.y + texture2D( tO[ 4 ], uz ).rgb * bw.z ) * rock;
  }
  alb /= ws; nrm /= ws; orm /= ws;
  // large-scale tonal variation so fields do not look uniform from the air
  float macro = tNoise( wp.xz * 0.0031 ) * 0.6 + tNoise( wp.xz * 0.017 ) * 0.4;
  alb *= 0.82 + 0.36 * macro;
  // crop canopy beyond the range where plants are drawn individually
  float crop = uCrop.w * vAux * smoothstep( 70.0, 150.0, dist );
  if ( crop > 0.003 ) {
    float rows = 0.5 + 0.5 * sin( ( wp.x + wp.z * 0.02 ) * 8.2673 );
    float cn = tNoise( wp.xz * 0.9 ) * 0.5 + tNoise( wp.xz * 0.21 ) * 0.5;
    vec3 cc = uCrop.rgb * ( 0.7 + 0.6 * cn ) * mix( 0.85 + 0.3 * rows, 1.0, smoothstep( 150.0, 500.0, dist ) );
    cc = mix( cc, cc * vec3( 1.25, 1.12, 0.6 ), smoothstep( 0.55, 0.9, tNoise( wp.xz * 0.013 + 7.0 ) ) * 0.5 );
    alb = mix( alb, cc, crop );
    orm.g = mix( orm.g, 0.62, crop );
    nrm = mix( nrm, vec3( ( cn - 0.5 ) * 0.9, ( rows - 0.5 ) * 0.7, 1.0 ), crop );
  }
  diffuseColor.rgb = alb;
  terrRough = clamp( orm.g, 0.05, 1.0 );
  terrN = nrm;
  // texture AO feeds the cavity term of the lighting
  diffuseColor.rgb *= mix( 1.0, orm.r, 0.6 );
}
`;

const TERRAIN_NORMAL = /* glsl */ `
{
  // world-aligned tangent frame (u -> +X, v -> +Z)
  vec3 Nw = normalize( vWN );
  vec3 Tw = normalize( vec3( 1.0, 0.0, 0.0 ) - Nw * Nw.x );
  vec3 Bw = normalize( cross( Nw, Tw ) );
  vec3 pn = normalize( Nw + Tw * terrN.x * 1.1 - Bw * terrN.y * 1.1 );
  normal = normalize( ( viewMatrix * vec4( pn, 0.0 ) ).xyz );
}
`;
