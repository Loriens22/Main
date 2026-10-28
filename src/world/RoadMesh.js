// Builds the visible street surfaces from RoadNetwork: carriageways,
// junction surfaces, raised sidewalks with kerbs, medians, lane markings,
// stop lines and zebra crossings. Meshes are merged per 256 m tile.
import * as THREE from 'three';
import { TileBuckets } from './GeoBuffer.js';
import { SIDEWALK_WIDTH } from './RoadNetwork.js';
import { makeAsphalt, makeYellowBricks, makePavers, makeGrass, makeDirt, makeNoiseTexture, makeSlabs, makeBlockPavers, makeKerbStone, makeTactile, makeIronCover } from '../render/Textures.js';
import { hash2 } from '../core/rng.js';
import { clamp } from '../core/math.js';

const ROAD_Y = 0.07; // carriageway above terrain
const KERB = 0.15; // kerb height
const PAINT_Y = ROAD_Y + 0.012;
const KERB_W = 0.18; // width of the kerb stone's top
const TACTILE_W = 0.6; // tactile warning band behind a dropped kerb
const RAMP_W = 1.1; // the pavement ramps back up to full height over this width
const ZEBRA_HALF = 2.0; // half width of a zebra crossing along the road

/** Pavement surface by street class: slabs on the main roads, block pavers in residential streets. */
const paveFor = (cls) => (['residential', 'living_street', 'unclassified', 'service'].includes(cls) ? 'pavers' : 'sidewalk');

function polyNormals(pts) {
  // per-vertex left normal (x,z), miter limited
  const n = pts.length / 2;
  const out = new Float32Array(n * 2);
  const scale = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let dx1 = pts[2 * i] - pts[2 * i0], dz1 = pts[2 * i + 1] - pts[2 * i0 + 1];
    let dx2 = pts[2 * i1] - pts[2 * i], dz2 = pts[2 * i1 + 1] - pts[2 * i + 1];
    let l1 = Math.hypot(dx1, dz1), l2 = Math.hypot(dx2, dz2);
    if (l1 < 1e-6) { dx1 = dx2; dz1 = dz2; l1 = l2; }
    if (l2 < 1e-6) { dx2 = dx1; dz2 = dz1; l2 = l1; }
    dx1 /= l1 || 1; dz1 /= l1 || 1; dx2 /= l2 || 1; dz2 /= l2 || 1;
    let tx = dx1 + dx2, tz = dz1 + dz2;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // left normal = (tz, -tx)
    out[2 * i] = tz;
    out[2 * i + 1] = -tx;
    const cosHalf = tx * dx2 + tz * dz2;
    scale[i] = clamp(1 / Math.max(cosHalf, 0.5), 1, 2);
  }
  return { nrm: out, scale };
}

function trimPolyline(pts, a, b) {
  // keep arc-length range [a, L-b]; negative values extend the ends
  const n = pts.length / 2;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
  const L = s[n - 1];
  const s0 = a, s1 = L - b;
  if (s1 - s0 < 0.3) return null;
  const at = (v) => {
    if (v <= 0) {
      const dx = pts[2] - pts[0], dz = pts[3] - pts[1], l = Math.hypot(dx, dz) || 1;
      return [pts[0] + (dx / l) * v, pts[1] + (dz / l) * v];
    }
    if (v >= L) {
      const dx = pts[2 * n - 2] - pts[2 * n - 4], dz = pts[2 * n - 1] - pts[2 * n - 3], l = Math.hypot(dx, dz) || 1;
      return [pts[2 * n - 2] + (dx / l) * (v - L), pts[2 * n - 1] + (dz / l) * (v - L)];
    }
    let i = 1;
    while (i < n - 1 && s[i] < v) i++;
    const t = (v - s[i - 1]) / Math.max(1e-9, s[i] - s[i - 1]);
    return [pts[2 * i - 2] + (pts[2 * i] - pts[2 * i - 2]) * t, pts[2 * i - 1] + (pts[2 * i + 1] - pts[2 * i - 1]) * t];
  };
  const out = [...at(s0)];
  for (let i = 0; i < n; i++) if (s[i] > s0 + 0.2 && s[i] < s1 - 0.2) out.push(pts[2 * i], pts[2 * i + 1]);
  out.push(...at(s1));
  return { pts: resample(out, 4), s0 };
}

export function resample(pts, step) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = out[out.length - 2], z0 = out[out.length - 1];
    const x1 = pts[i], z1 = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.05) continue;
    const k = Math.ceil(L / step);
    for (let j = 1; j <= k; j++) out.push(x0 + ((x1 - x0) * j) / k, z0 + ((z1 - z0) * j) / k);
  }
  return out;
}

function surfaceMat(p) {
  if (p.surface === 'yellow_brick') return 'brick';
  if (p.surface === 'sett' || p.surface === 'paving_stones') return 'sett';
  if (p.surface === 'gravel' || p.surface === 'unpaved' || p.surface === 'dirt') return 'gravel';
  return 'asphalt';
}

export class RoadMeshBuilder {
  constructor({ network, hf, buildings, quality = 'high' }) {
    this.net = network;
    this.hf = hf;
    this.bgrid = buildings; // SegmentGrid of building footprints
    this.quality = quality;
    this.buckets = new TileBuckets(256, { asphalt: { uv2: true }, brick: { uv2: true }, sett: { uv2: true }, gravel: { uv2: true } });
    this.sidewalkInfo = []; // for pedestrians/props: {piece, side, pts, width}
    this.decals = []; // cast-iron covers set into the road: {kind, x, y, z, yaw}
    this.crossings = []; // zebra crossings: {x, z, dx, dz, hw, piece}
    this.dropGrid = new Map(); // 16 m cells -> kerb points of zebra crossings (dropped kerbs)
  }

  /**
   * Zebra crossings from OSM crossing nodes (x10 fixed point, type): kept for the paint and, before the
   * pavements are built, turned into the kerb points where the kerb drops to road level.
   */
  setCrossings(raw) {
    for (let k = 0; k < raw.length; k += 3) {
      const x = raw[k] / 10, z = raw[k + 1] / 10, type = raw[k + 2];
      if (!type) continue;
      const q = this.net.query(x, z, 8, (p) => !p.minor);
      if (!q || q.d > q.piece.hw + 0.5) continue;
      const p = q.piece;
      const ax = p.pts[q.i], az = p.pts[q.i + 1];
      const cx = ax + (p.pts[q.i + 2] - ax) * q.t, cz = az + (p.pts[q.i + 3] - az) * q.t;
      const c = { x: cx, z: cz, dx: q.dir[0], dz: q.dir[1], hw: p.hw, piece: p };
      this.crossings.push(c);
      for (const sd of [-1, 1]) {
        const kx = cx + q.dir[1] * p.hw * sd, kz = cz - q.dir[0] * p.hw * sd;
        const key = `${Math.floor(kx / 16)},${Math.floor(kz / 16)}`;
        let a = this.dropGrid.get(key);
        if (!a) this.dropGrid.set(key, (a = []));
        a.push(kx, kz);
      }
    }
  }

  /** Distance from (x, z) to the nearest kerb point of a zebra crossing (searched within ~30 m). */
  nearestDrop(x, z) {
    let best = Infinity;
    const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
    for (let i = gx - 2; i <= gx + 2; i++)
      for (let j = gz - 2; j <= gz + 2; j++) {
        const a = this.dropGrid.get(`${i},${j}`);
        if (a) for (let k = 0; k < a.length; k += 2) best = Math.min(best, Math.hypot(a[k] - x, a[k + 1] - z));
      }
    return best;
  }

  /** How far the kerb at (x, z) is dropped for a crossing: 1 = flush with the road, 0 = full height. */
  dropAt(x, z) {
    const best = this.nearestDrop(x, z);
    return best < ZEBRA_HALF ? 1 : best < ZEBRA_HALF + 1.2 ? 1 - (best - ZEBRA_HALF) / 1.2 : 0;
  }

  y(x, z) {
    return this.hf.heightAt(x, z);
  }

  materials() {
    if (this._mats) return this._mats;
    const q = this.quality;
    const sz = q === 'balanced' ? 256 : 512;
    const asph = makeAsphalt(sz), brick = makeYellowBricks(sz), pav = makePavers(sz), grass = makeGrass(256), dirt = makeDirt(256);
    const slabs = makeSlabs(sz), blocks = makeBlockPavers(sz), kerb = makeKerbStone(), tactile = makeTactile(q === 'balanced' ? 128 : 256);
    const sett = makeYellowBricks(sz, 91, [128, 126, 120]);
    const noise = makeNoiseTexture(256);
    const wetUniform = { value: 0 };
    const timeUniform = { value: 0 };
    const roadPatch = (mat, kind) => {
      mat.userData.uniforms = { uWet: wetUniform, uTime: timeUniform, tNoise: { value: noise } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, mat.userData.uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 uv1; varying vec2 vLane; varying vec3 vWP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLane = uv1; vWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uWet, uTime; uniform sampler2D tNoise; varying vec2 vLane; varying vec3 vWP; float gPuddle;
// expanding raindrop rings on standing water; returns a world-space xz slope
vec2 ripples(vec2 p) {
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 2.3 : 3.1) + float(k) * 17.3;
    vec2 c = floor(q), f = fract(q);
    float h = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
    float t = fract(uTime * (0.9 + h * 0.5) + h * 7.0);
    vec2 d = f - (0.25 + 0.5 * vec2(h, fract(h * 13.7)));
    float r = length(d) + 1e-4;
    float w = sin((r - t * 0.45) * 55.0) * smoothstep(0.0, 0.05, t * 0.45 - r + 0.05) * (1.0 - t) * smoothstep(0.42, 0.0, r);
    g += d / r * w;
  }
  return g;
}`)
          .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 nz = texture2D(tNoise, vWP.xz / 61.0);
  vec4 nz2 = texture2D(tNoise, vWP.xz / 9.0);
  // large scale tone variation & patches
  diffuseColor.rgb *= 0.86 + nz.r * 0.28;
  ${kind === 'asphalt' ? `
  float patchMask = smoothstep(0.62, 0.64, nz.g) * step(0.5, nz2.b);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, patchMask);
  // wheel tracks: lanes ~3.3 m, tyres at ±0.9 m from lane centre
  float lane = vLane.x;
  float lc = fract(lane / 3.3) * 3.3 - 1.65;
  float track = exp(-pow((abs(lc) - 0.9) / 0.35, 2.0));
  diffuseColor.rgb *= 1.0 - track * 0.10 * (0.6 + nz2.r);
  // grime along the kerb
  float edge = smoothstep(1.2, 0.0, vLane.y);
  diffuseColor.rgb *= 1.0 - edge * 0.22;
  ` : ''}
  gPuddle = smoothstep(${kind === 'asphalt' ? '0.58, 0.66' : '0.66, 0.72'}, nz.b + nz2.a * 0.25) * uWet;
  diffuseColor.rgb *= mix(1.0, 0.55, uWet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, gPuddle);
}`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet);
roughnessFactor = mix(roughnessFactor, 0.13, gPuddle);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize(vNormal), gPuddle));
if (gPuddle > 0.01) {
  vec2 rg = ripples(vWP.xz);
  normal = normalize(normal + (viewMatrix * vec4(rg.x, 0.0, rg.y, 0.0)).xyz * 0.22 * gPuddle);
}`);
      };
      mat.customProgramCacheKey = () => `road-${kind}`;
      return mat;
    };
    const std = (set, extra = {}) =>
      new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, ...extra });
    const ns = new THREE.Vector2(0.8, 0.8);
    this._mats = {
      wet: wetUniform,
      time: timeUniform,
      asphalt: roadPatch(std(asph, { normalScale: ns, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'asphalt'),
      brick: roadPatch(std(brick, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'brick'),
      sett: roadPatch(std(sett, { color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'sett'),
      gravel: roadPatch(std(dirt, { color: 0xb8b0a0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'gravel'),
      sidewalk: roadPatch(std(slabs, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'sidewalk'),
      pavers: roadPatch(std(blocks, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'pavers'),
      tactile: roadPatch(std(tactile, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'tactile'),
      footway: roadPatch(std(pav, { color: 0xd8d4cc, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'footway'),
      path: std(dirt, { color: 0xc2b49a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      curb: new THREE.MeshStandardMaterial({ map: kerb.map, roughnessMap: kerb.roughnessMap, roughness: 1, metalness: 0 }),
      grate: new THREE.MeshStandardMaterial({ map: makeIronCover('grate'), roughness: 0.55, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
      manhole: new THREE.MeshStandardMaterial({ map: makeIronCover('manhole'), alphaTest: 0.5, roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
      median: std(grass, { color: 0xcfe0c0 }),
      // thermoplastic road paint: brighter than concrete, with glass beads (lower roughness)
      paint: new THREE.MeshStandardMaterial({ color: 0xf2f2ec, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
      paintYellow: new THREE.MeshStandardMaterial({ color: 0xf0b81e, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
      railing: new THREE.MeshStandardMaterial({ color: 0x5d6466, roughness: 0.5, metalness: 0.7 }),
    };
    // paint wear via noise
    const paint = this._mats.paint;
    paint.userData.uniforms = { tNoise: { value: noise }, uWet: wetUniform };
    paint.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, paint.userData.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tNoise; uniform float uWet; varying vec3 vWP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec4 n = texture2D(tNoise, vWP.xz / 3.0); vec4 n2 = texture2D(tNoise, vWP.xz / 0.7);
  float wear = smoothstep(0.35, 0.7, n.g * 0.7 + n2.r * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3), wear * 0.55);
  diffuseColor.rgb *= 1.0 - uWet * 0.3; }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, uWet);');
    };
    paint.customProgramCacheKey = () => 'paint';
    return this._mats;
  }

  build() {
    const net = this.net;
    for (const p of net.pieces) this.buildPiece(p);
    for (const n of net.nodes.values()) if (n.type === 'junction') this.buildJunction(n);
    for (const path of net.paths) this.buildPath(path);
    return this.buckets;
  }

  /** Clearance from the kerb outwards on one side: {clear, hit: 'road'|'building'|null, median}. */
  probeSide(p, x, z, nx, nz, maxW) {
    const net = this.net;
    let clear = maxW, hit = null, median = false;
    for (let t = 0.6; t <= maxW + 0.01; t += 0.9) {
      const qx = x + nx * (p.hw + t), qz = z + nz * (p.hw + t);
      const q = net.query(qx, qz, 16, (o) => o !== p && !o.minor);
      if (q && q.d < q.piece.hw + 0.05) {
        const dot = Math.abs(q.dir[0] * -nz + q.dir[1] * nx);
        const shares = q.piece.a === p.a || q.piece.a === p.b || q.piece.b === p.a || q.piece.b === p.b;
        if (shares && dot < 0.8) continue; // a road joining at our own junction
        clear = Math.max(0, t - 0.6);
        hit = 'road';
        median = dot > 0.85;
        break;
      }
    }
    if (this.bgrid) {
      const d = this.bgrid.raycast(x + nx * p.hw, z + nz * p.hw, nx, nz, clear + 0.3);
      if (d < clear + 0.3) {
        clear = Math.max(0, Math.min(clear, d - 0.1));
        hit = 'building';
        median = false;
      }
    }
    return { clear, hit, median };
  }

  buildPiece(p) {
    const tr = trimPolyline(p.pts, p.trimA - p.extA, p.trimB - p.extB);
    if (!tr) return;
    const pts = tr.pts;
    const n = pts.length / 2;
    const { nrm, scale } = polyNormals(pts);
    const mid = n >> 1;
    const mk = surfaceMat(p);
    const buf = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], mk);
    // carriageway strip: left edge, centre line, right edge.
    // uv1 = (distance from the right kerb, distance to the nearest kerb) drives wear shading
    let s = tr.s0;
    const L = [], C = [], R = [];
    const aligned = mk === 'brick' || mk === 'sett';
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
      const x = pts[2 * i], z = pts[2 * i + 1];
      const lx = nrm[2 * i] * p.hw * scale[i], lz = nrm[2 * i + 1] * p.hw * scale[i];
      const ax = x + lx, az = z + lz, bx = x - lx, bz = z - lz;
      const uvL = aligned ? [-p.hw / 8, s / 8] : [ax / 8, az / 8];
      const uvC = aligned ? [0, s / 8] : [x / 8, z / 8];
      const uvR = aligned ? [p.hw / 8, s / 8] : [bx / 8, bz / 8];
      L.push(buf.vertex(ax, this.y(ax, az) + ROAD_Y, az, 0, 1, 0, uvL[0], uvL[1], p.width, 0));
      C.push(buf.vertex(x, this.y(x, z) + ROAD_Y, z, 0, 1, 0, uvC[0], uvC[1], p.hw, p.hw));
      R.push(buf.vertex(bx, this.y(bx, bz) + ROAD_Y, bz, 0, 1, 0, uvR[0], uvR[1], 0, 0));
    }
    for (let i = 0; i < n - 1; i++) {
      buf.quad(L[i], C[i], C[i + 1], L[i + 1]);
      buf.quad(C[i], R[i], R[i + 1], C[i + 1]);
    }
    // sidewalks / medians on both sides
    const want = SIDEWALK_WIDTH[p.cls] || 0;
    if (want > 0) {
      for (const side of [1, -1]) {
        const widths = [];
        const medians = [];
        let last = null;
        for (let i = 0; i < n; i++) {
          // probe every 3rd vertex (and the ends); reuse in between
          if (last && i % 3 !== 0 && i !== n - 1) {
            widths.push(last.w);
            medians.push(last.m);
            continue;
          }
          const x = pts[2 * i], z = pts[2 * i + 1];
          const nx = nrm[2 * i] * side, nz = nrm[2 * i + 1] * side;
          const pr = this.probeSide(p, x, z, nx, nz, want + 3.2);
          let w;
          if (pr.hit === 'building') w = pr.clear; // central streets: pavement up to the façade
          else if (pr.hit === 'road') w = pr.median ? pr.clear : Math.min(want, pr.clear);
          else w = want;
          last = { w, m: pr.median ? 1 : 0 };
          widths.push(w);
          medians.push(last.m);
        }
        // smooth widths to avoid jagged edges
        const sm = widths.map((_, i) => {
          let a = 0, c = 0;
          for (let k = -2; k <= 2; k++) {
            const j = clamp(i + k, 0, n - 1);
            a += widths[j]; c++;
          }
          return Math.min(widths[i] + 0.3, a / c);
        });
        const isMedian = medians.filter((m) => m).length > n / 2;
        this.sideStrip(p, pts, nrm, scale, side, sm, isMedian, tr.s0);
      }
    }
    if (p.bridge) this.bridgeRails(p, pts, nrm, scale);
    if (!p.minor) this.markings(p, pts, nrm, scale, tr.s0);
    if (!p.minor && !p.bridge && p.width >= 5.5) this.manholes(p, pts, nrm, tr.s0);
  }

  /** Cast-iron manhole covers in the carriageway every ~70 m (sewer and water lines run under the roads). */
  manholes(p, pts, nrm, s0) {
    const n = pts.length / 2;
    let s = s0;
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[2 * i], az = pts[2 * i + 1], bx = pts[2 * i + 2], bz = pts[2 * i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      const slot0 = Math.floor(s / 70), slot1 = Math.floor((s + L) / 70);
      if (slot1 !== slot0) {
        const h = hash2(slot1 * 13 + Math.round(ax), Math.round(az));
        const t = clamp((slot1 * 70 - s) / Math.max(L, 1e-6), 0, 1);
        const off = (h - 0.5) * (p.width - 2.4);
        const x = ax + (bx - ax) * t + nrm[2 * i] * off, z = az + (bz - az) * t + nrm[2 * i + 1] * off;
        if (h > 0.15) this.decals.push({ kind: 'manhole', x, y: this.y(x, z) + ROAD_Y + 0.004, z, yaw: h * 6.283 });
      }
      s += L;
    }
  }

  sideStrip(p, pts, nrm, scale, side, widths, isMedian, s0 = 0) {
    const n = pts.length / 2;
    const mid = n >> 1;
    const run = [];
    const info = [];
    let s = s0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
      const w = widths[i];
      const x = pts[2 * i], z = pts[2 * i + 1];
      const nx = nrm[2 * i] * side, nz = nrm[2 * i + 1] * side;
      const k = scale[i];
      run.push({ x: x + nx * p.hw * k, z: z + nz * p.hw * k, nx, nz, w, s });
      if (!isMedian && w > 1.2) info.push(x + nx * (p.hw * k + w * 0.55), z + nz * (p.hw * k + w * 0.55));
    }
    this.kerbRun(run, isMedian ? 'median' : paveFor(p.cls), pts[2 * mid], pts[2 * mid + 1], { median: isMedian, seed: p.id ?? (pts[0] * 7 + pts[1]) });
    if (info.length >= 4) this.sidewalkInfo.push({ piece: p, side, pts: info, median: isMedian, width: widths.reduce((a, b) => a + b, 0) / widths.length });
    p[side > 0 ? 'swLeft' : 'swRight'] = isMedian ? 0 : widths.reduce((a, b) => a + b, 0) / widths.length;
    p[side > 0 ? 'medianLeft' : 'medianRight'] = isMedian;
  }

  /**
   * Kerb stones and the pavement behind them along a kerb line. run: [{x, z, nx, nz, w, s}] with (nx, nz)
   * pointing from the carriageway onto the pavement, w = pavement width from the kerb line, s = distance
   * along the kerb (stone joints). The kerb is a real stone profile (face, chamfer, 18 cm top); at zebra
   * crossings it drops to road level, with a yellow tactile band and a ramp back up behind it.
   * Gully grates are set into the road along it every ~35 m.
   */
  kerbRun(run0, paveKey, cx, cz, { median = false, seed = 0 } = {}) {
    // polyline vertices can be tens of metres apart: near a crossing, resample every 0.5 m so the
    // dropped kerb and its ramps get vertices of their own
    const run = [];
    for (let i = 0; i < run0.length; i++) {
      const a = run0[i];
      run.push(a);
      const b = run0[i + 1];
      if (!b || median) continue;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (L < 0.6 || this.nearestDrop(mx, mz) > L / 2 + ZEBRA_HALF + 1.5) continue;
      const k = Math.ceil(L / 0.5);
      for (let j = 1; j < k; j++) {
        const t = j / k;
        run.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t, w: a.w + (b.w - a.w) * t, s: a.s + (b.s - a.s) * t });
      }
    }
    const n = run.length;
    if (n < 2) return;
    const curb = this.buckets.get(cx, cz, 'curb');
    const rows = { k: [[], [], [], [], [], []], pv: [[], [], [], []] };
    const P = { k: [[], [], [], [], [], []], pv: [[], [], [], []] }; // positions, for the winding check
    const drops = [];
    for (const r of run) {
      const yi = this.y(r.x, r.z) + ROAD_Y;
      const d = median ? 0 : this.dropAt(r.x, r.z);
      drops.push(d);
      const kh = KERB * (1 - 0.86 * d);
      const kw = Math.min(KERB_W, Math.max(0.06, r.w - 0.02));
      const at = (o) => [r.x + r.nx * o, r.z + r.nz * o];
      const fn = [-r.nx, 0, -r.nz], ch = [-r.nx * 0.7, 0.71, -r.nz * 0.7], up = [0, 1, 0];
      const u = r.s / 8;
      // kerb profile: foot, face top, (chamfer) start, chamfer end, (top) start, back edge
      const prof = [[0, yi - 0.05, fn, 0], [0.012, yi + kh - 0.022, fn, 0.42], [0.012, yi + kh - 0.022, ch, 0.42], [0.035, yi + kh, ch, 0.5], [0.035, yi + kh, up, 0.5], [kw, yi + kh, up, 1]];
      prof.forEach(([o, y, nn, v], j) => {
        const [x, z] = at(o);
        rows.k[j].push(curb.vertex(x, y, z, nn[0], nn[1], nn[2], u, v));
        P.k[j].push([x, y, z]);
      });
      // pavement: back of the kerb, end of the tactile band, top of the ramp, outer edge
      const top = yi + KERB - 0.005, low = yi + kh - 0.005;
      const span = Math.max(0, r.w - kw);
      const tW = Math.min(TACTILE_W, span * 0.45), rW = Math.min(RAMP_W, span * 0.75);
      const [ox, oz] = at(Math.max(r.w, kw + 0.05));
      const yo = this.y(ox, oz);
      const topO = Math.max(top - 0.02, yo + 0.05);
      const rowsAt = [[kw, low], [kw + tW, low + (top - low) * (tW / Math.max(rW, 1e-3))], [kw + rW, top], [null, topO]];
      rowsAt.forEach(([o, y], j) => {
        const [x, z] = o === null ? [ox, oz] : at(o);
        P.pv[j].push([x, y, z]);
      });
    }
    // pavement vertices go into the band's bucket: tactile only along a dropped kerb
    const pave = this.buckets.get(cx, cz, paveKey);
    const tact = this.buckets.get(cx, cz, 'tactile');
    const vtx = (buf, p, tile) => buf.vertex(p[0], p[1], p[2], 0, 1, 0, p[0] / tile, p[2] / tile, 0, 1);
    const pvIds = P.pv.map((row) => row.map((p) => vtx(pave, p, 4)));
    const tIds = new Map();
    const tv = (j, i) => {
      const key = j * 100000 + i;
      if (!tIds.has(key)) tIds.set(key, vtx(tact, P.pv[j][i], 0.6));
      return tIds.get(key);
    };
    const quad = (buf, ids, pos, want) => {
      // a-b-c-d around the quad; flip if its normal does not face `want`
      const [a, b, , d] = pos;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) buf.quad(ids[0], ids[1], ids[2], ids[3]);
      else buf.quad(ids[0], ids[3], ids[2], ids[1]);
    };
    for (let i = 0; i < n - 1; i++) {
      const r = run[i];
      const fn = [-r.nx, 0, -r.nz];
      // kerb face, chamfer, top
      for (const [j, want] of [[0, fn], [2, [-r.nx * 0.7, 0.7, -r.nz * 0.7]], [4, [0, 1, 0]]]) {
        quad(curb, [rows.k[j][i], rows.k[j][i + 1], rows.k[j + 1][i + 1], rows.k[j + 1][i]], [P.k[j][i], P.k[j][i + 1], P.k[j + 1][i + 1], P.k[j + 1][i]], want);
      }
      // pavement bands
      const tactile = !median && drops[i] > 0.6 && drops[i + 1] > 0.6;
      for (let j = 0; j < 3; j++) {
        const pos = [P.pv[j][i], P.pv[j][i + 1], P.pv[j + 1][i + 1], P.pv[j + 1][i]];
        if (j === 0 && tactile) quad(tact, [tv(0, i), tv(0, i + 1), tv(1, i + 1), tv(1, i)], pos, [0, 1, 0]);
        else quad(pave, [pvIds[j][i], pvIds[j][i + 1], pvIds[j + 1][i + 1], pvIds[j + 1][i]], pos, [0, 1, 0]);
      }
      // outer skirt down to the terrain
      const a = P.pv[3][i], b = P.pv[3][i + 1];
      const yA = this.y(a[0], a[2]) - 0.25, yB = this.y(b[0], b[2]) - 0.25;
      const sk = [curb.vertex(a[0], a[1], a[2], r.nx, 0, r.nz, i, 0.2), curb.vertex(b[0], b[1], b[2], r.nx, 0, r.nz, i + 1, 0.2), curb.vertex(b[0], yB, b[2], r.nx, 0, r.nz, i + 1, 0), curb.vertex(a[0], yA, a[2], r.nx, 0, r.nz, i, 0)];
      quad(curb, sk, [a, b, [b[0], yB, b[2]], [a[0], yA, a[2]]], [r.nx, 0, r.nz]);
    }
    // gully grates in the road along the kerb (not at crossings, not on medians)
    if (!median) {
      for (let i = 0; i < n - 1; i++) {
        const a = run[i], b = run[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 0.01) continue;
        const slot0 = Math.floor(a.s / 35), slot1 = Math.floor(b.s / 35);
        if (slot1 === slot0) continue;
        const sg = slot1 * 35 + 35 * (0.2 + 0.6 * hash2(slot1 + seed * 3, 17));
        if (sg < a.s || sg > b.s) continue;
        const t = (sg - a.s) / Math.max(1e-6, b.s - a.s);
        const x = a.x + (b.x - a.x) * t - a.nx * 0.24, z = a.z + (b.z - a.z) * t - a.nz * 0.24;
        if (this.dropAt(x, z) > 0) continue;
        this.decals.push({ kind: 'grate', x, y: this.y(x, z) + ROAD_Y + 0.003, z, yaw: Math.atan2(b.x - a.x, b.z - a.z) });
      }
    }
  }

  bridgeRails(p, pts, nrm, scale) {
    const n = pts.length / 2;
    const mid = n >> 1;
    const buf = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], 'railing');
    for (const side of [1, -1]) {
      const sw = (side > 0 ? p.swLeft : p.swRight) || 0;
      for (let i = 0; i < n - 1; i++) {
        const off = p.hw + sw + 0.05;
        const ax = pts[2 * i] + nrm[2 * i] * side * off * scale[i], az = pts[2 * i + 1] + nrm[2 * i + 1] * side * off * scale[i];
        const bx = pts[2 * i + 2] + nrm[2 * i + 2] * side * off * scale[i + 1], bz = pts[2 * i + 3] + nrm[2 * i + 3] * side * off * scale[i + 1];
        const ya = this.y(ax, az) + ROAD_Y + KERB, yb = this.y(bx, bz) + ROAD_Y + KERB;
        const nx = nrm[2 * i] * side, nz = nrm[2 * i + 1] * side;
        // parapet: a low granite wall with metal top rail
        for (const [h0, h1] of [[0, 0.55], [0.95, 1.05]]) {
          const a = buf.vertex(ax, ya + h0, az, nx, 0, nz, 0, 0), b = buf.vertex(bx, yb + h0, bz, nx, 0, nz, 1, 0);
          const c = buf.vertex(bx, yb + h1, bz, nx, 0, nz, 1, 1), d = buf.vertex(ax, ya + h1, az, nx, 0, nz, 0, 1);
          if (side > 0) buf.quad(a, b, c, d); else buf.quad(a, d, c, b);
          const a2 = buf.vertex(ax, ya + h0, az, -nx, 0, -nz, 0, 0), b2 = buf.vertex(bx, yb + h0, bz, -nx, 0, -nz, 1, 0);
          const c2 = buf.vertex(bx, yb + h1, bz, -nx, 0, -nz, 1, 1), d2 = buf.vertex(ax, ya + h1, az, -nx, 0, -nz, 0, 1);
          if (side > 0) buf.quad(a2, d2, c2, b2); else buf.quad(a2, b2, c2, d2);
        }
      }
    }
  }

  /** Lane markings along a piece. */
  markings(p, pts, nrm, scale, s0) {
    const cls = p.cls;
    if (!['trunk', 'primary', 'secondary', 'tertiary', 'unclassified'].includes(cls)) return;
    if (p.width < 6 || p.surface === 'yellow_brick' || p.surface === 'sett') return;
    const lines = [];
    if (p.oneway) {
      const lanes = Math.max(1, Math.round(p.width / 3.3));
      for (let k = 1; k < lanes; k++) lines.push({ off: -p.hw + (k * p.width) / lanes, dash: [3, 6], w: 0.13 });
    } else {
      const per = Math.max(1, Math.round(p.hw / 3.25));
      if (per >= 2) {
        lines.push({ off: -0.12, dash: null, w: 0.12 }, { off: 0.12, dash: null, w: 0.12 });
      } else lines.push({ off: 0, dash: cls === 'unclassified' ? [3, 6] : [4, 4], w: 0.12 });
      for (const sd of [1, -1]) for (let k = 1; k < per; k++) lines.push({ off: (sd * k * p.hw) / per, dash: [3, 6], w: 0.12 });
    }
    // edge lines only on the ring road; kerbed city streets have none
    if (cls === 'trunk' && p.width >= 9) {
      lines.push({ off: p.hw - 0.4, dash: null, w: 0.15 }, { off: -p.hw + 0.4, dash: null, w: 0.15 });
    }
    const n = pts.length / 2;
    const mid = n >> 1;
    const buf = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], 'paint');
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
    const total = cum[n - 1];
    const at = (s) => {
      let i = 1;
      while (i < n - 1 && cum[i] < s) i++;
      const t = clamp((s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), 0, 1);
      return [
        pts[2 * i - 2] + (pts[2 * i] - pts[2 * i - 2]) * t, pts[2 * i - 1] + (pts[2 * i + 1] - pts[2 * i - 1]) * t,
        nrm[2 * i - 2] + (nrm[2 * i] - nrm[2 * i - 2]) * t, nrm[2 * i - 1] + (nrm[2 * i + 1] - nrm[2 * i - 1]) * t,
      ];
    };
    for (const ln of lines) {
      const segs = [];
      if (ln.dash) {
        const period = ln.dash[0] + ln.dash[1];
        let s = ((-(s0 % period)) + period) % period;
        for (; s < total - 0.5; s += period) segs.push([Math.max(0.3, s), Math.min(total - 0.3, s + ln.dash[0])]);
      } else segs.push([0.5, total - 0.5]);
      for (const [a, b] of segs) {
        if (b - a < 0.4) continue;
        const steps = Math.max(1, Math.ceil((b - a) / 4));
        let prev = null;
        for (let k = 0; k <= steps; k++) {
          const s = a + ((b - a) * k) / steps;
          const [x, z, nx, nz] = at(s);
          const o1 = ln.off - ln.w / 2, o2 = ln.off + ln.w / 2;
          const x1 = x + nx * o1, z1 = z + nz * o1, x2 = x + nx * o2, z2 = z + nz * o2;
          const v1 = buf.vertex(x1, this.y(x1, z1) + PAINT_Y, z1, 0, 1, 0, 0, 0);
          const v2 = buf.vertex(x2, this.y(x2, z2) + PAINT_Y, z2, 0, 1, 0, 1, 0);
          if (prev) buf.quad(prev[1], prev[0], v1, v2);
          prev = [v1, v2];
        }
      }
    }
  }

  /** Paved junction polygon + corner sidewalks following the kerb fillets. */
  buildJunction(n) {
    const poly = n.poly;
    if (!poly || poly.length < 3) return;
    const surf = n.sorted.some((e) => e.piece.surface === 'yellow_brick') ? 'brick' : 'asphalt';
    const buf = this.buckets.get(n.x, n.z, surf);
    const c = buf.vertex(n.x, this.y(n.x, n.z) + ROAD_Y, n.z, 0, 1, 0, n.x / 8, n.z / 8, 0, 3);
    const ids = poly.map(([x, z]) => buf.vertex(x, this.y(x, z) + ROAD_Y, z, 0, 1, 0, x / 8, z / 8, 0, 0));
    for (let i = 0; i < ids.length; i++) {
      // polygon is ordered clockwise on the map (x east, z south) => counter-clockwise seen from +y
      buf.tri(c, ids[(i + 1) % ids.length], ids[i]);
    }
    // corner sidewalks
    for (const f of n.fillets) {
      const wA = SIDEWALK_WIDTH[f.clsA] || 0, wB = SIDEWALK_WIDTH[f.clsB] || 0;
      const swA = f.pieceA.swRight ?? f.pieceA.swLeft ?? wA;
      const w = Math.min(Math.max(wA, wB), 4.5);
      if (w <= 0 || f.reflex === undefined) continue;
      const curve = [f.from, ...f.pts, f.to];
      if (curve.length < 2) continue;
      const run = [];
      let sAcc = 0;
      for (let i = 0; i < curve.length; i++) {
        const [x, z] = curve[i];
        const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        let nx = tz, nz = -tx;
        // the normal points away from the junction centre, onto the corner pavement
        if ((x - n.x) * nx + (z - n.z) * nz < 0) { nx = -nx; nz = -nz; }
        if (i > 0) sAcc += Math.hypot(x - curve[i - 1][0], z - curve[i - 1][1]);
        run.push({ x, z, nx, nz, w: Math.min(w, swA || w), s: sAcc });
      }
      this.kerbRun(run, paveFor(f.clsA), n.x, n.z, { seed: Math.round(n.x * 3 + n.z) });
    }
    // stop lines on signalised approaches
    if (n.signal) {
      const pb = this.buckets.get(n.x, n.z, 'paint');
      for (const e of n.sorted) {
        const p = e.piece;
        const incoming = p.oneway ? !e.atStart : true;
        if (!incoming || p.minor) continue;
        const t = e.trim + 1.2;
        const bx = n.x + e.d[0] * t, bz = n.z + e.d[1] * t;
        const lx = e.d[1], lz = -e.d[0];
        const o0 = p.oneway ? -p.hw + 0.3 : 0.2, o1 = p.hw - 0.3;
        // incoming lanes are on the left of the outward direction (right of the driver)
        const ax = bx + lx * o0, az = bz + lz * o0, cx = bx + lx * o1, cz = bz + lz * o1;
        const dx = e.d[0] * 0.2, dz = e.d[1] * 0.2;
        const v = [[ax - dx, az - dz], [cx - dx, cz - dz], [cx + dx, cz + dz], [ax + dx, az + dz]].map(([x, z]) => pb.vertex(x, this.y(x, z) + PAINT_Y, z, 0, 1, 0, 0, 0));
        pb.quad(v[0], v[3], v[2], v[1]);
        pb.quad(v[0], v[1], v[2], v[3]);
      }
    }
  }

  buildPath(path) {
    const pts = path.pts;
    if (pts.length < 4) return;
    const n = pts.length / 2;
    const mk = path.cls === 'path' || path.cls === 'track' || path.surface === 'dirt' || path.surface === 'gravel' || path.surface === 'unpaved' ? 'path' : 'footway';
    const { nrm } = polyNormals(pts);
    const hw = Math.max(0.8, path.width / 2);
    const mid = n >> 1;
    const buf = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], mk);
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i], z = pts[2 * i + 1];
      const ax = x + nrm[2 * i] * hw, az = z + nrm[2 * i + 1] * hw, bx = x - nrm[2 * i] * hw, bz = z - nrm[2 * i + 1] * hw;
      L.push(buf.vertex(ax, this.y(ax, az) + 0.035, az, 0, 1, 0, ax / 4, az / 4));
      R.push(buf.vertex(bx, this.y(bx, bz) + 0.035, bz, 0, 1, 0, bx / 4, bz / 4));
    }
    for (let i = 0; i < n - 1; i++) buf.quad(L[i], R[i], R[i + 1], L[i + 1]);
  }

  /** Zebra crossings from OSM crossing nodes. */
  zebras() {
    for (const c of this.crossings) {
      const p = c.piece;
      const { x: cx, z: cz, dx, dz } = c;
      const lx = dz, lz = -dx;
      const buf = this.buckets.get(cx, cz, 'paint');
      // М8.1: stripes 0.5 m wide and 0.5 m apart, parallel to the road, across the whole carriageway
      const stripes = Math.floor((p.width - 0.6) / 1.0);
      for (let s = 0; s < stripes; s++) {
        const off = -p.hw + 0.55 + s * 1.0 + 0.25;
        const corners = [[-ZEBRA_HALF, -0.25], [ZEBRA_HALF, -0.25], [ZEBRA_HALF, 0.25], [-ZEBRA_HALF, 0.25]].map(([a, b]) => {
          const px = cx + dx * a + lx * (off + b), pz = cz + dz * a + lz * (off + b);
          return buf.vertex(px, this.y(px, pz) + PAINT_Y + 0.002, pz, 0, 1, 0, 0, 0);
        });
        buf.quad(corners[0], corners[3], corners[2], corners[1]);
        buf.quad(corners[0], corners[1], corners[2], corners[3]);
      }
    }
  }

  /**
   * Yellow zig-zag along the kerb at the bus stops of the line (Наредба № 2: yellow is used only for
   * broken lines marking such areas): 24 m around each stop pole, 0.12 m line, between 0.3 and 1.0 m
   * from the kerb, 2 m period. stops: [{x, z, rx, rz}] = the route at the stop and the right-hand side of
   * the direction of travel (poles can stand well back from the kerb, behind a verge).
   */
  busStopMarkings(stops) {
    for (const st of stops) {
      const q = this.net.query(st.x, st.z, 8, (p) => !p.minor);
      if (!q) continue;
      const p = q.piece;
      const ax = p.pts[q.i], az = p.pts[q.i + 1];
      const cx = ax + (p.pts[q.i + 2] - ax) * q.t, cz = az + (p.pts[q.i + 3] - az) * q.t;
      const [dx, dz] = q.dir;
      let nx = dz, nz = -dx;
      if (nx * st.rx + nz * st.rz < 0) { nx = -nx; nz = -nz; }
      const buf = this.buckets.get(cx, cz, 'paintYellow');
      const pt = (a, off) => {
        const x = cx + dx * a + nx * (p.hw - off), z = cz + dz * a + nz * (p.hw - off);
        return [x, this.y(x, z) + PAINT_Y + 0.003, z];
      };
      const line = (A, B, w) => {
        const ex = B[0] - A[0], ez = B[2] - A[2], L = Math.hypot(ex, ez) || 1;
        const ox = (-ez / L) * w / 2, oz = (ex / L) * w / 2;
        const v = [[A[0] + ox, A[1], A[2] + oz], [B[0] + ox, B[1], B[2] + oz], [B[0] - ox, B[1], B[2] - oz], [A[0] - ox, A[1], A[2] - oz]].map((q) => buf.vertex(q[0], q[1], q[2], 0, 1, 0, 0, 0));
        buf.quad(v[0], v[1], v[2], v[3]);
        buf.quad(v[0], v[3], v[2], v[1]);
      };
      const L = 12;
      for (let a = -L; a < L - 0.01; a += 1) line(pt(a, (Math.round(a + L) % 2) ? 1.0 : 0.3), pt(a + 1, (Math.round(a + 1 + L) % 2) ? 1.0 : 0.3), 0.12);
      line(pt(-L, 0.05), pt(-L, 1.0), 0.12);
      line(pt(L, 0.05), pt(L, 1.0), 0.12);
    }
  }

  /** Converts buckets into meshes grouped per tile. */
  meshes() {
    const mats = this.materials();
    const out = [];
    for (const [key, t] of this.buckets.map) {
      const group = new THREE.Group();
      group.name = `roads:${key}`;
      for (const [mk, buf] of t) {
        if (buf.empty) continue;
        const m = new THREE.Mesh(buf.toGeometry(), mats[mk]);
        m.receiveShadow = true;
        m.castShadow = mk === 'railing';
        m.matrixAutoUpdate = false;
        m.name = mk;
        group.add(m);
      }
      const [tx, tz] = key.split(',').map(Number);
      group.userData.tile = [tx, tz];
      out.push(group);
    }
    // cast-iron covers: one instanced mesh per kind and tile
    const geo = { grate: new THREE.PlaneGeometry(0.36, 0.52).rotateX(-Math.PI / 2), manhole: new THREE.PlaneGeometry(0.72, 0.72).rotateX(-Math.PI / 2) };
    const byTile = new Map();
    for (const d of this.decals) {
      const key = `${Math.floor(d.x / 256)},${Math.floor(d.z / 256)}|${d.kind}`;
      let a = byTile.get(key);
      if (!a) byTile.set(key, (a = []));
      a.push(d);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of byTile) {
      const [tile, kind] = key.split('|');
      const im = new THREE.InstancedMesh(geo[kind], mats[kind], list.length);
      list.forEach((d, i) => im.setMatrixAt(i, M.compose(V.set(d.x, d.y, d.z), Q.setFromAxisAngle(UP, d.yaw), ONE)));
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = kind;
      const group = new THREE.Group();
      group.name = `roads:${tile}`;
      group.add(im);
      out.push(group);
    }
    return out;
  }
}
