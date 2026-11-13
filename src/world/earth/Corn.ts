import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Model } from '../../render/Assets';
import { materials } from '../../render/Materials';
import { patchWorldMaterial, W } from '../../render/patch';
import { hash2 } from '../../core/math';
import { EarthMap } from './EarthMap';

const ROW = 0.76; // row spacing (30 in)
const NEAR = 8; // near cell size (m)
const FAR = 32; // card cell size (m)
const CARD_W = 2.23, CARD_H = 2.9;

interface NearCell { key: number; cx: number; cz: number; data: Float32Array; n: number; lod: number; m0: THREE.InstancedMesh[]; m1: THREE.InstancedMesh | null; version: number }
interface CardCell { key: number; cx: number; cz: number; mesh: THREE.Mesh | null; version: number }

const WIND_PARS = /* glsl */ `
uniform vec4 uWind;
uniform vec3 uPlayer;
uniform vec3 uSunColorF;
`;

/** World-space bending: gusts travel across the field; stalks part around the player. */
const WIND_PROJECT = /* glsl */ `
vec4 wpos = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  wpos = instanceMatrix * wpos;
  vec3 iorg = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#else
  vec3 iorg = vec3( wpos.x, color.r, wpos.z );
#endif
wpos = modelMatrix * wpos;
{
  float hgt = FOLIAGE_HEIGHT;
  float ph = iorg.x * 0.19 + iorg.z * 0.23;
  float gust = sin( uWind.z * 1.3 + ph ) * 0.55 + sin( uWind.z * 2.9 + ph * 1.9 ) * 0.3 + sin( uWind.z * 0.37 + ph * 0.31 ) * 0.5;
  float bend = uWind.w * ( 0.35 + 0.65 * gust ) * hgt * hgt * 0.09;
  wpos.xz += uWind.xy * bend;
  wpos.xz += vec2( sin( uWind.z * 7.0 + ph * 5.0 + hgt * 3.0 ), cos( uWind.z * 6.1 + ph * 4.0 ) ) * uWind.w * 0.035 * FOLIAGE_TIP * hgt;
  wpos.y -= bend * bend * 0.25;
  vec2 away = wpos.xz - uPlayer.xz;
  float pd = length( away );
  float push = ( 1.0 - smoothstep( 0.25, 1.1, pd ) ) * step( abs( wpos.y - uPlayer.y - 1.0 ), 2.2 );
  wpos.xz += away / max( pd, 0.05 ) * push * 0.55 * clamp( hgt, 0.0, 1.6 );
}
vec4 mvPosition = viewMatrix * wpos;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Crops rendered at three scales around the camera:
 *   0..R0   full 3D plants (instanced clumps of three variants)
 *   R0..R1  reduced plants
 *   R1..R2  impostor cards along the rows
 * Beyond that the terrain shader paints the canopy. Planting follows EarthMap.cornDensity exactly.
 */
export class Corn {
  group = new THREE.Group();
  private near = new Map<number, NearCell>();
  private cards = new Map<number, CardCell>();
  private clump0: THREE.BufferGeometry[] = [];
  private clump1!: THREE.BufferGeometry;
  private matPlant: THREE.MeshStandardMaterial;
  private matCard: THREE.MeshStandardMaterial;
  private pool0: THREE.InstancedMesh[][] = [];
  private pool1: THREE.InstancedMesh[] = [];
  R0 = 13;
  R1 = 34;
  R2 = 150;
  spacing = 0.66;
  /** returns true where the crop has been cut */
  harvested: ((x: number, z: number) => boolean) | null = null;
  /** bumped by the farm when harvesting changes an area; cells rebuild lazily */
  version = 0;
  castShadows = false;
  private dummy = new THREE.Object3D();
  private frame = 0;

  constructor(private map: EarthMap, model: Model, vegetation: number) {
    this.group.name = 'corn';
    this.R0 = 13 * Math.sqrt(vegetation);
    this.R1 = 34 * Math.sqrt(vegetation);
    this.R2 = 150 * Math.min(1.3, vegetation);
    const col = (name: string) => (materials.get(name) as THREE.MeshStandardMaterial).color;
    const variant = (id: string) => {
      const node = model.part(id)!;
      const geos: THREE.BufferGeometry[] = [];
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry.clone();
        const c = col((m.material as THREE.Material).name);
        const n = g.attributes.position.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        geos.push(g);
      });
      return mergeGeometries(geos, false)!;
    };
    const clump = (ids: string[], yaws: number[], sp: number, widen = 1) => {
      const parts = ids.map((id, i) => {
        const g = variant(id);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaws[i]).scale(new THREE.Vector3(widen, 1, widen)).setPosition((i - 1) * sp, 0, (i % 2 ? 0.05 : -0.05)));
        return g;
      });
      return mergeGeometries(parts, false)!;
    };
    const sp = this.spacing / 3;
    this.clump0 = [clump(['corn_a', 'corn_b', 'corn_c'], [0.3, 2.1, 4.0], sp), clump(['corn_c', 'corn_a', 'corn_b'], [5.2, 1.2, 3.3], sp)];
    this.clump1 = clump(['corn_b1', 'corn_a1', 'corn_c1'], [0.6, 2.9, 4.4], sp * 2, 1.2);

    this.matPlant = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
    this.patchFoliage(this.matPlant, 'position.y', 'uv.y', false);
    const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/textures/corn_card.webp`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.matCard = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.65, metalness: 0, color: 0xe6f0d8 });
    this.patchFoliage(this.matCard, 'position.y - color.r', 'uv.y', true);
  }

  private patchFoliage(m: THREE.MeshStandardMaterial, heightExpr: string, tipExpr: string, card: boolean) {
    patchWorldMaterial(m, { dirt: 0, wear: 0, dust: 0.7 }, { vao: false });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r);
      shader.uniforms.uWind = W.uWind;
      shader.uniforms.uPlayer = W.uPlayer;
      shader.uniforms.uSunColorF = W.uSunColor;
      shader.uniforms.uCardFade = { value: new THREE.Vector2(this.R1, this.R2) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + WIND_PARS + 'varying float vTip;\nvarying vec2 vUvF;\nvarying float vBaseY;\n' + (card ? 'attribute vec3 color;\n' : ''))
        .replace('#include <project_vertex>', WIND_PROJECT.replace(/FOLIAGE_HEIGHT/g, `( ${heightExpr} )`).replace(/FOLIAGE_TIP/g, `( ${tipExpr} )`) + '\nvTip = uv.y;\nvUvF = uv;\nvBaseY = iorg.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunColorF;\nuniform vec2 uCardFade;\nvarying float vTip;\nvarying vec2 vUvF;\nvarying float vBaseY;\nfloat roughnessFactorScale = 1.0;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * roughnessFactorScale, 0.05, 1.0 );')
        // darker toward the base of each blade, sun-bleached toward the tip
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + (card
          ? '{ float cd = length( vWPos - cameraPosition ); float n = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); if ( smoothstep( uCardFade.y - 45.0, uCardFade.y, cd ) > n || smoothstep( uCardFade.x + 5.0, uCardFade.x - 4.0, cd ) > n ) discard; }'
          : `{
            // blade detail from the leaf UVs: pale midrib, fine parallel veins, darker base, sun-bleached tips, dry blotches
            float across = abs( vUvF.x - 0.5 ) * 2.0;
            float midrib = 1.0 - smoothstep( 0.0, 0.12, across );
            float veins = 0.5 + 0.5 * sin( vUvF.x * 75.0 );
            float blotch = smoothstep( 0.55, 0.9, fract( sin( dot( floor( vWPos.xz * 3.0 ) + floor( vUvF.y * 9.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) );
            vec3 base = diffuseColor.rgb * mix( 0.5, 1.05, smoothstep( 0.0, 0.8, vTip ) );
            base *= 0.9 + 0.12 * veins;
            base = mix( base, base * vec3( 1.35, 1.3, 0.9 ), midrib * 0.55 );
            base = mix( base, vec3( dot( base, vec3( 0.4, 0.5, 0.1 ) ) ) * vec3( 1.25, 1.1, 0.55 ), blotch * 0.28 * smoothstep( 0.3, 1.0, vTip ) );
            // depth in the canopy: little light reaches the lower stalks
            float hgt = clamp( ( vWPos.y - vBaseY ) / 2.2, 0.0, 1.0 );
            diffuseColor.rgb = base * mix( 0.42, 1.0, smoothstep( 0.0, 0.8, hgt ) );
            roughnessFactorScale = 0.75 + 0.5 * veins;
          }`))
        // light shining through the blade when the sun is behind it
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n{ vec3 sdv = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz ); float back = max( dot( -normal, sdv ), 0.0 ); reflectedLight.directDiffuse += material.diffuseColor * uSunColorF * back * 0.32 * vec3( 1.0, 1.05, 0.55 ); }');
    };
    m.customProgramCacheKey = () => 'foliage' + (card ? 'c' : 'p');
  }

  private key(ix: number, iz: number) { return (ix + 32768) * 65536 + (iz + 32768); }

  /** Per-clump placement for one near cell: [x, y, z, yaw, scale] * n. */
  private plant(cx: number, cz: number): { data: Float32Array; n: number } {
    const map = this.map;
    const x0 = cx * NEAR, z0 = cz * NEAR;
    const d00 = map.cornDensity(x0, z0), d10 = map.cornDensity(x0 + NEAR, z0), d01 = map.cornDensity(x0, z0 + NEAR), d11 = map.cornDensity(x0 + NEAR, z0 + NEAR);
    const dc = map.cornDensity(x0 + NEAR / 2, z0 + NEAR / 2);
    const any = d00 + d10 + d01 + d11 + dc;
    if (any <= 0) return { data: new Float32Array(0), n: 0 };
    const full = d00 >= 1 && d10 >= 1 && d01 >= 1 && d11 >= 1 && dc >= 1;
    const h00 = map.height(x0, z0), h10 = map.height(x0 + NEAR, z0), h01 = map.height(x0, z0 + NEAR), h11 = map.height(x0 + NEAR, z0 + NEAR);
    const rows = map.plot(x0 + NEAR / 2, z0 + NEAR / 2).rows;
    const out: number[] = [];
    const sp = this.spacing;
    // rows and plant positions are aligned to a global lattice so neighbouring cells line up
    const r0 = Math.ceil((rows === 'x' ? z0 : x0) / ROW), r1 = Math.ceil(((rows === 'x' ? z0 : x0) + NEAR) / ROW);
    const p0 = Math.ceil((rows === 'x' ? x0 : z0) / sp), p1 = Math.ceil(((rows === 'x' ? x0 : z0) + NEAR) / sp);
    for (let r = r0; r < r1; r++) {
      for (let p = p0; p < p1; p++) {
        const j1 = hash2(r * 7 + 3, p * 13 + 1), j2 = hash2(r * 5 - 9, p * 3 + 17);
        const along = p * sp + (j1 - 0.5) * 0.16, across = r * ROW + (j2 - 0.5) * 0.07;
        const x = rows === 'x' ? along : across, z = rows === 'x' ? across : along;
        if (!full && map.cornDensity(x, z) < 0.5) continue;
        if (this.harvested && this.harvested(x, z)) continue;
        const u = (x - x0) / NEAR, v = (z - z0) / NEAR;
        const y = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
        out.push(x, y - 0.02, z, (rows === 'x' ? 0 : Math.PI / 2) + (j1 - 0.5) * 0.3 + (j2 > 0.5 ? Math.PI : 0), 0.86 + 0.3 * hash2(r + 91, p - 47));
      }
    }
    return { data: new Float32Array(out), n: out.length / 5 };
  }

  private fill(mesh: THREE.InstancedMesh, cell: NearCell, pick: (i: number) => boolean) {
    const d = this.dummy;
    let k = 0;
    for (let i = 0; i < cell.n; i++) {
      if (!pick(i)) continue;
      const o = i * 5;
      d.position.set(cell.data[o], cell.data[o + 1], cell.data[o + 2]);
      d.rotation.set((hash2(i, cell.key & 1023) - 0.5) * 0.12, cell.data[o + 3], (hash2(i + 7, cell.key & 511) - 0.5) * 0.12);
      const s = cell.data[o + 4];
      d.scale.set(s, s * (0.92 + 0.16 * hash2(i * 3, 5)), s);
      d.updateMatrix();
      mesh.setMatrixAt(k, d.matrix);
      const t = 0.82 + 0.3 * hash2(i * 11 + 1, cell.key & 255);
      _c.setRGB(t * (0.94 + 0.12 * hash2(i, 77)), t, t * 0.92);
      mesh.setColorAt(k, _c);
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.visible = k > 0;
  }

  private getMesh(geo: THREE.BufferGeometry, pool: THREE.InstancedMesh[], cap: number, shadow: boolean) {
    let m = pool.pop();
    if (!m) {
      m = new THREE.InstancedMesh(geo, this.matPlant, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    m.castShadow = shadow;
    return m;
  }

  private setLod(cell: NearCell, lod: number) {
    if (cell.lod === lod && cell.version === this.version) return;
    const cap = Math.ceil((NEAR / ROW + 1) * (NEAR / this.spacing + 1)) + 4;
    // release
    for (const m of cell.m0) { m.visible = false; this.pool0[m.userData.v].push(m); }
    cell.m0 = [];
    if (cell.m1) { cell.m1.visible = false; this.pool1.push(cell.m1); cell.m1 = null; }
    if (cell.version !== this.version) {
      const p = this.plant(cell.cx, cell.cz);
      cell.data = p.data; cell.n = p.n; cell.version = this.version;
    }
    cell.lod = lod;
    if (cell.n === 0) return;
    if (lod === 0) {
      for (let v = 0; v < 2; v++) {
        if (!this.pool0[v]) this.pool0[v] = [];
        const m = this.getMesh(this.clump0[v], this.pool0[v], cap, this.castShadows);
        m.userData.v = v;
        this.fill(m, cell, (i) => (i & 1) === v);
        cell.m0.push(m);
      }
    } else if (lod === 1) {
      const m = this.getMesh(this.clump1, this.pool1, cap, false);
      this.fill(m, cell, (i) => (i & 1) === 0);
      cell.m1 = m;
    }
  }

  private buildCards(cell: CardCell) {
    const map = this.map;
    const x0 = cell.cx * FAR, z0 = cell.cz * FAR;
    const G = 8;
    const hs = new Float32Array((G + 1) * (G + 1)), ds = new Float32Array((G + 1) * (G + 1));
    let any = 0;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const x = x0 + (i / G) * FAR, z = z0 + (j / G) * FAR;
      const d = map.cornDensity(x, z);
      ds[j * (G + 1) + i] = d;
      any += d;
      hs[j * (G + 1) + i] = d > 0 ? map.height(x, z) : 0;
    }
    cell.version = this.version;
    if (any <= 0) return;
    const sample = (arr: Float32Array, x: number, z: number) => {
      const fx = Math.min(G - 1e-4, Math.max(0, ((x - x0) / FAR) * G)), fz = Math.min(G - 1e-4, Math.max(0, ((z - z0) / FAR) * G));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = arr[j * (G + 1) + i], b = arr[j * (G + 1) + i + 1], c = arr[(j + 1) * (G + 1) + i], d = arr[(j + 1) * (G + 1) + i + 1];
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    };
    const rows = map.plot(x0 + FAR / 2, z0 + FAR / 2).rows;
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
    let v = 0;
    const quad = (ax: number, az: number, bx: number, bz: number, ya: number, yb: number, h: number, u0: number, u1: number) => {
      pos.push(ax, ya, az, bx, yb, bz, bx, yb + h, bz, ax, ya + h, az);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      // normals point mostly up so the cards take sky and sun like the canopy does; colour.r carries the base height
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      col.push(ya, 0, 0, yb, 0, 0, yb, 0, 0, ya, 0, 0);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    };
    const r0 = Math.ceil((rows === 'x' ? z0 : x0) / ROW), r1 = Math.ceil(((rows === 'x' ? z0 : x0) + FAR) / ROW);
    const a0 = rows === 'x' ? x0 : z0;
    for (let r = r0; r < r1; r++) {
      const across = r * ROW;
      for (let s = 0; s < FAR / CARD_W; s++) {
        const a = a0 + s * CARD_W + (hash2(r, 31) - 0.5) * 1.2, b = a + CARD_W;
        const ax = rows === 'x' ? a : across, az = rows === 'x' ? across : a;
        const bx = rows === 'x' ? b : across, bz = rows === 'x' ? across : b;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (sample(ds, mx, mz) < 0.5) continue;
        if (this.harvested && this.harvested(mx, mz)) continue;
        const flip = hash2(r * 3 + 1, s * 7) > 0.5;
        const h = CARD_H * (0.88 + 0.22 * hash2(r - 5, s + 11));
        quad(ax, az, bx, bz, sample(hs, ax, az) - 0.03, sample(hs, bx, bz) - 0.03, h, flip ? 1 : 0, flip ? 0 : 1);
        // a short cross card so rows do not vanish when viewed end-on
        if ((r + s) % 2 === 0) {
          const hw = ROW * 0.9;
          const cx1 = rows === 'x' ? mx : mx - hw, cz1 = rows === 'x' ? mz - hw : mz;
          const cx2 = rows === 'x' ? mx : mx + hw, cz2 = rows === 'x' ? mz + hw : mz;
          const yy = sample(hs, mx, mz) - 0.03;
          quad(cx1, cz1, cx2, cz2, yy, yy, h * 0.96, 0.1, 0.78);
        }
      }
    }
    if (!v) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.matCard);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    cell.mesh = m;
    this.group.add(m);
  }

  update(cam: THREE.Vector3) {
    this.frame++;
    // ---- near plants
    const R = this.R1 + NEAR;
    const ix0 = Math.floor((cam.x - R) / NEAR), ix1 = Math.floor((cam.x + R) / NEAR);
    const iz0 = Math.floor((cam.z - R) / NEAR), iz1 = Math.floor((cam.z + R) / NEAR);
    let budget = 6;
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const dx = (ix + 0.5) * NEAR - cam.x, dz = (iz + 0.5) * NEAR - cam.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const key = this.key(ix, iz);
      let cell = this.near.get(key);
      const lod = d < this.R0 + NEAR * 0.6 ? 0 : 1;
      if (!cell) {
        if (budget <= 0) continue;
        cell = { key, cx: ix, cz: iz, data: new Float32Array(0), n: 0, lod: -1, m0: [], m1: null, version: -1 };
        this.near.set(key, cell);
      }
      if (cell.lod !== lod || cell.version !== this.version) {
        if (budget <= 0 && cell.lod !== -1) continue;
        this.setLod(cell, lod);
        budget--;
      }
    }
    for (const [key, cell] of this.near) {
      const d = Math.hypot((cell.cx + 0.5) * NEAR - cam.x, (cell.cz + 0.5) * NEAR - cam.z);
      if (d > R + NEAR * 1.5) {
        for (const m of cell.m0) { m.visible = false; this.pool0[m.userData.v].push(m); }
        if (cell.m1) { cell.m1.visible = false; this.pool1.push(cell.m1); }
        this.near.delete(key);
      }
    }
    // ---- impostor cards
    const R2 = this.R2 + FAR * 0.75;
    const jx0 = Math.floor((cam.x - R2) / FAR), jx1 = Math.floor((cam.x + R2) / FAR);
    const jz0 = Math.floor((cam.z - R2) / FAR), jz1 = Math.floor((cam.z + R2) / FAR);
    let cb = 2;
    for (let ix = jx0; ix <= jx1; ix++) for (let iz = jz0; iz <= jz1; iz++) {
      const d = Math.hypot((ix + 0.5) * FAR - cam.x, (iz + 0.5) * FAR - cam.z);
      if (d > R2) continue;
      const key = this.key(ix, iz);
      let cell = this.cards.get(key);
      if (!cell) { cell = { key, cx: ix, cz: iz, mesh: null, version: -1 }; this.cards.set(key, cell); }
      if (cell.version !== this.version && cb > 0) {
        if (cell.mesh) { this.group.remove(cell.mesh); cell.mesh.geometry.dispose(); cell.mesh = null; }
        this.buildCards(cell);
        cb--;
      }
    }
    for (const [key, cell] of this.cards) {
      const d = Math.hypot((cell.cx + 0.5) * FAR - cam.x, (cell.cz + 0.5) * FAR - cam.z);
      if (d > R2 + FAR * 2) {
        if (cell.mesh) { this.group.remove(cell.mesh); cell.mesh.geometry.dispose(); }
        this.cards.delete(key);
      }
    }
  }

  /** True if the point is standing in uncut crop (for rustle audio and movement drag). */
  inCrop(x: number, z: number) {
    return this.map.cornDensity(x, z) > 0.5 && !(this.harvested && this.harvested(x, z));
  }

  dispose() {
    for (const c of this.cards.values()) if (c.mesh) c.mesh.geometry.dispose();
    this.matPlant.dispose();
    this.matCard.dispose();
  }
}

const _c = new THREE.Color();
