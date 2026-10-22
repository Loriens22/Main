// Ground rendering: detailed near terrain (16 m DEM, splat-mapped from land
// use / roads / buildings) and a far terrain (250 m DEM) for Sofia valley and
// Vitosha mountain on the horizon.
import * as THREE from 'three';
import { BASE_ELEVATION } from './Heightfield.js';
import { makeGrass, makeDirt, makeLitter, makePavers } from '../render/Textures.js';

const LAYER = {
  green: ['park', 'grass', 'garden', 'meadow', 'pitch', 'dog_park', 'flowerbed', 'stadium', 'zoo', 'farmland', 'allotments'],
  paved: ['plaza', 'commercial', 'industrial', 'railway', 'parking', 'hospital', 'university', 'school', 'kindergarten', 'religious', 'military'],
  dirt: ['playground', 'construction', 'brownfield', 'track', 'sand', 'bare_rock'],
  forest: ['forest', 'scrub', 'cemetery', 'heath'],
};

function drawPoly(g, pts, holes, tx) {
  g.beginPath();
  const ring = (p) => {
    for (let i = 0; i < p.length; i += 2) {
      const [x, y] = tx(p[i], p[i + 1]);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  };
  ring(pts);
  for (const h of holes || []) ring(h);
  g.fill('evenodd');
}

/** Rasterises land cover into a 4-layer splat texture + hole mask. */
export function buildSplat(world, hf, metresPerPixel = 4) {
  const W = Math.ceil((hf.xMax - hf.xMin) / metresPerPixel);
  const H = Math.ceil((hf.zMax - hf.zMin) / metresPerPixel);
  const tx = (x, z) => [(x - hf.xMin) / metresPerPixel, (z - hf.zMin) / metresPerPixel];
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    return g;
  };
  const L = { green: mk(), paved: mk(), dirt: mk(), forest: mk(), hole: mk() };
  // residential land in Sofia's panel districts = lawns with trees between blocks
  for (const a of world.areas) {
    if (a.type === 'residential') {
      L.green.globalAlpha = 0.55;
      drawPoly(L.green, a.pts, a.holes, tx);
      L.green.globalAlpha = 1;
    }
  }
  for (const a of world.areas) {
    for (const [k, list] of Object.entries(LAYER)) {
      if (list.includes(a.type)) {
        // later (more specific) layers win: clear others where this one is drawn
        for (const other of Object.keys(LAYER)) {
          if (other === k || a.layer < 2) continue;
          L[other].fillStyle = '#000';
          drawPoly(L[other], a.pts, a.holes, tx);
          L[other].fillStyle = '#fff';
        }
        drawPoly(L[k], a.pts, a.holes, tx);
      }
    }
    if (a.type === 'water') drawPoly(L.hole, a.pts, a.holes, tx);
  }
  // roads and paths are paved; a margin around them is worn/paved too
  for (const r of world.roads) {
    const p = r.pts;
    const g = L.paved;
    const minor = ['footway', 'path', 'track', 'steps', 'cycleway'].includes(r.cls);
    g.lineWidth = (r.width + (minor ? 0.8 : 7)) / metresPerPixel;
    g.beginPath();
    for (let i = 0; i < p.length; i += 2) {
      const [x, y] = tx(p[i], p[i + 1]);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    if (r.cls === 'path' || r.cls === 'track') {
      L.dirt.lineWidth = (r.width + 1) / metresPerPixel;
      L.dirt.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const [x, y] = tx(p[i], p[i + 1]);
        if (i === 0) L.dirt.moveTo(x, y); else L.dirt.lineTo(x, y);
      }
      L.dirt.stroke();
    }
  }
  // building plots: paved apron around footprints
  L.paved.lineWidth = 3 / metresPerPixel;
  for (const b of world.buildings) {
    if (b.minH > 0) continue;
    drawPoly(L.paved, b.pts, null, tx);
    L.paved.stroke();
  }
  const read = (g) => g.getImageData(0, 0, W, H).data;
  const gr = read(L.green), pv = read(L.paved), dr = read(L.dirt), fo = read(L.forest), ho = read(L.hole);
  const data = new Uint8Array(W * H * 4);
  const holeMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let g = gr[i * 4], p = pv[i * 4], d = dr[i * 4], f = fo[i * 4];
    if (g + p + d + f < 40) { g = 140; d = 90; } // unclassified ground: unkempt grass
    data[i * 4] = g;
    data[i * 4 + 1] = p;
    data[i * 4 + 2] = d;
    data[i * 4 + 3] = f;
    holeMask[i] = ho[i * 4];
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  const holeTex = new THREE.DataTexture(holeMask, W, H, THREE.RedFormat);
  holeTex.magFilter = THREE.LinearFilter;
  holeTex.minFilter = THREE.LinearFilter;
  holeTex.needsUpdate = true;
  return { tex, holeTex, W, H, mpp: metresPerPixel, holeMask };
}

export function createTerrainMaterial(splat, hf, quality) {
  const grass = makeGrass(quality === 'balanced' ? 256 : 512);
  const dirt = makeDirt(quality === 'balanced' ? 256 : 512);
  const litter = makeLitter(256);
  const pav = makePavers(quality === 'balanced' ? 256 : 512);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.userData.uniforms = {
    uSplat: { value: splat.tex },
    uHole: { value: splat.holeTex },
    uSplatOrigin: { value: new THREE.Vector2(hf.xMin, hf.zMin) },
    uSplatSize: { value: new THREE.Vector2(hf.xMax - hf.xMin, hf.zMax - hf.zMin) },
    tGrass: { value: grass.map }, tDirt: { value: dirt.map }, tLitter: { value: litter.map }, tPav: { value: pav.map },
    nGrass: { value: grass.normalMap }, nPav: { value: pav.normalMap },
    uWet: { value: 0 },
    uSeason: { value: 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D uSplat, uHole, tGrass, tDirt, tLitter, tPav, nGrass, nPav;
uniform vec2 uSplatOrigin, uSplatSize;
uniform float uWet, uSeason;
vec4 gSplat;`)
      .replace('#include <map_fragment>', `
vec2 suv = (vWPos.xz - uSplatOrigin) / uSplatSize;
if (texture2D(uHole, suv).r > 0.55) discard;
gSplat = texture2D(uSplat, suv);
// break up the splat boundaries with world noise
vec2 wuv = vWPos.xz / 8.0;
vec3 cG = texture2D(tGrass, wuv).rgb;
vec3 cG2 = texture2D(tGrass, vWPos.xz / 37.0).rgb;
cG = mix(cG, cG2, 0.35);
vec3 cD = texture2D(tDirt, wuv * 0.8).rgb;
vec3 cL = texture2D(tLitter, wuv).rgb;
vec3 cP = texture2D(tPav, vWPos.xz / 4.0).rgb;
float macro = texture2D(tDirt, vWPos.xz / 190.0).r;
vec4 w = gSplat + vec4(0.0, 0.0, (macro - 0.45) * 0.5, 0.0);
w = max(w, 0.0);
w.r *= 0.9 + macro * 0.3;
w = pow(w, vec4(1.6));
w /= max(dot(w, vec4(1.0)), 1e-3);
vec3 albedo = cG * w.r + cP * w.g + cD * w.b + cL * w.a;
albedo = mix(albedo, albedo * vec3(1.05, 0.95, 0.75), uSeason * (w.r + w.a));
albedo *= mix(1.0, 0.55, uWet * (1.0 - w.r * 0.5));
diffuseColor.rgb *= albedo;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
roughnessFactor = mix(0.97, 0.82, w.g);
roughnessFactor = mix(roughnessFactor, 0.25, uWet * w.g);
`)
      .replace('#include <normal_fragment_maps>', `
{
  vec3 ng = texture2D(nGrass, wuv).xyz * 2.0 - 1.0;
  vec3 np = texture2D(nPav, vWPos.xz / 4.0).xyz * 2.0 - 1.0;
  vec3 nd = normalize(mix(ng, np, w.g));
  // terrain is nearly horizontal: build TBN from world axes in view space
  vec3 T = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 B = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  normal = normalize(normal + (T * nd.x - B * nd.y) * 0.6);
}
`);
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

/** Terrain mesh for one rectangular block of the near grid. */
export function buildNearTerrainChunk(hf, i0, j0, cells, mat) {
  const g = hf.near;
  const i1 = Math.min(g.nx - 1, i0 + cells), j1 = Math.min(g.nz - 1, j0 + cells);
  const nx = i1 - i0 + 1, nz = j1 - j0 + 1;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = g.x0 + (i0 + i) * g.dx;
      pos[k + 1] = g.h[(j0 + j) * g.nx + i0 + i] - BASE_ELEVATION;
      pos[k + 2] = g.z0 + (j0 + j) * g.dx;
    }
  const idx = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = j * nx + i + 1, c = (j + 1) * nx + i, d = (j + 1) * nx + i + 1;
      // triangles (00,01,10) & (01,11,10) — must match Heightfield.sampleTri
      idx.push(a, c, b, c, d, b);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

/** Far backdrop: Sofia valley, Vitosha, Lyulin, Lozen. Vertex-coloured by altitude. */
export function buildFarTerrain(hf) {
  const g = hf.far;
  const pos = new Float32Array(g.nx * g.nz * 3);
  const col = new Float32Array(g.nx * g.nz * 3);
  const c = new THREE.Color();
  const forest = new THREE.Color(0x2c4227), meadow = new THREE.Color(0x6f7148), city = new THREE.Color(0x8a877c),
    rock = new THREE.Color(0x837d72), field = new THREE.Color(0x7d7a55);
  for (let j = 0; j < g.nz; j++)
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      const x = g.x0 + i * g.dx, z = g.z0 + j * g.dx;
      let h = g.h[k];
      // hide the far mesh under the detailed corridor terrain
      const inside = hf.inNear(x, z, 300);
      if (inside) h -= 25;
      pos[k * 3] = x;
      pos[k * 3 + 1] = h - BASE_ELEVATION;
      pos[k * 3 + 2] = z;
      const hl = (hf.far.h[Math.min(k + 1, hf.far.h.length - 1)] - h);
      const slope = Math.min(1, Math.abs(hl) / 60);
      if (h < 640) c.copy(city).lerp(field, (Math.sin(x * 0.0013) * Math.cos(z * 0.0011) + 1) * 0.25);
      else if (h < 900) c.copy(field).lerp(forest, (h - 640) / 260);
      else if (h < 1750) c.copy(forest);
      else if (h < 2050) c.copy(forest).lerp(meadow, (h - 1750) / 300);
      else c.copy(meadow).lerp(rock, Math.min(1, (h - 2050) / 250 + slope * 0.5));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  const idx = [];
  for (let j = 0; j < g.nz - 1; j++)
    for (let i = 0; i < g.nx - 1; i++) {
      const a = j * g.nx + i, b = a + 1, cc = a + g.nx, d = cc + 1;
      idx.push(a, cc, b, cc, d, b);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'farTerrain';
  m.frustumCulled = false;
  return m;
}
