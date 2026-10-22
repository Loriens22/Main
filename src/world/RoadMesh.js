// Builds the visible street surfaces from RoadNetwork: carriageways,
// junction surfaces, raised sidewalks with kerbs, medians, lane markings,
// stop lines and zebra crossings. Meshes are merged per 256 m tile.
import * as THREE from 'three';
import { TileBuckets } from './GeoBuffer.js';
import { SIDEWALK_WIDTH } from './RoadNetwork.js';
import { makeAsphalt, makeYellowBricks, makePavers, makeCurb, makeGrass, makeDirt, makeNoiseTexture } from '../render/Textures.js';
import { clamp } from '../core/math.js';

const ROAD_Y = 0.07; // carriageway above terrain
const KERB = 0.15; // kerb height
const PAINT_Y = ROAD_Y + 0.012;

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
  }

  y(x, z) {
    return this.hf.heightAt(x, z);
  }

  materials() {
    if (this._mats) return this._mats;
    const q = this.quality;
    const sz = q === 'balanced' ? 256 : 512;
    const asph = makeAsphalt(sz), brick = makeYellowBricks(sz), pav = makePavers(sz), curb = makeCurb(256), grass = makeGrass(256), dirt = makeDirt(256);
    const sett = makeYellowBricks(sz, 91);
    const noise = makeNoiseTexture(256);
    const wetUniform = { value: 0 };
    const roadPatch = (mat, kind) => {
      mat.userData.uniforms = { uWet: wetUniform, tNoise: { value: noise } };
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, mat.userData.uniforms);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 uv1; varying vec2 vLane; varying vec3 vWP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLane = uv1; vWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uWet; uniform sampler2D tNoise; varying vec2 vLane; varying vec3 vWP; float gPuddle;')
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
  gPuddle = smoothstep(0.58, 0.66, nz.b + nz2.a * 0.25) * uWet;
  diffuseColor.rgb *= mix(1.0, 0.55, uWet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, gPuddle);
}`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet);
roughnessFactor = mix(roughnessFactor, 0.04, gPuddle);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize(vNormal), gPuddle));`);
      };
      mat.customProgramCacheKey = () => `road-${kind}`;
      return mat;
    };
    const std = (set, extra = {}) =>
      new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, ...extra });
    const ns = new THREE.Vector2(0.8, 0.8);
    this._mats = {
      wet: wetUniform,
      asphalt: roadPatch(std(asph, { normalScale: ns, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'asphalt'),
      brick: roadPatch(std(brick, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'brick'),
      sett: roadPatch(std(sett, { color: 0x8c8a84, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'sett'),
      gravel: roadPatch(std(dirt, { color: 0xb8b0a0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'gravel'),
      sidewalk: roadPatch(std(pav, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'sidewalk'),
      footway: roadPatch(std(pav, { color: 0xd8d4cc, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'footway'),
      path: std(dirt, { color: 0xc2b49a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      curb: std(curb, { color: 0xd0d0cc }),
      median: std(grass, { color: 0xcfe0c0 }),
      paint: new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
      paintYellow: new THREE.MeshStandardMaterial({ color: 0xe8b62a, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
      railing: new THREE.MeshStandardMaterial({ color: 0x5d6466, roughness: 0.5, metalness: 0.7 }),
    };
    // paint wear via noise
    const paint = this._mats.paint;
    paint.userData.uniforms = { tNoise: { value: noise } };
    paint.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, paint.userData.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tNoise; varying vec3 vWP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec4 n = texture2D(tNoise, vWP.xz / 3.0); vec4 n2 = texture2D(tNoise, vWP.xz / 0.7);
  float wear = smoothstep(0.35, 0.7, n.g * 0.7 + n2.r * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3), wear * 0.55); }`);
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
        this.sideStrip(p, pts, nrm, scale, side, sm, isMedian);
      }
    }
    if (p.bridge) this.bridgeRails(p, pts, nrm, scale);
    if (!p.minor) this.markings(p, pts, nrm, scale, tr.s0);
  }

  sideStrip(p, pts, nrm, scale, side, widths, isMedian) {
    const n = pts.length / 2;
    const mid = n >> 1;
    const matKey = isMedian ? 'median' : 'sidewalk';
    const buf = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], matKey);
    const curb = this.buckets.get(pts[2 * mid], pts[2 * mid + 1], 'curb');
    const inner = [], outer = [], cTop = [], cBot = [], oBot = [];
    const info = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
      const w = widths[i];
      const x = pts[2 * i], z = pts[2 * i + 1];
      const nx = nrm[2 * i] * side, nz = nrm[2 * i + 1] * side;
      const k = scale[i];
      const ix = x + nx * p.hw * k, iz = z + nz * p.hw * k;
      const ox = x + nx * (p.hw * k + Math.max(w, 0.05)), oz = z + nz * (p.hw * k + Math.max(w, 0.05));
      const yi = this.y(ix, iz) + ROAD_Y, yo = this.y(ox, oz);
      const top = yi + KERB;
      const topO = Math.max(top - 0.02, yo + 0.05);
      inner.push(buf.vertex(ix, top, iz, 0, 1, 0, ix / 4, iz / 4, 0, 1));
      outer.push(buf.vertex(ox, topO, oz, 0, 1, 0, ox / 4, oz / 4, 0, 1));
      // kerb face (normal pointing towards the carriageway)
      cTop.push(curb.vertex(ix, top, iz, -nx, 0, -nz, s / 1.0, 0.2));
      cBot.push(curb.vertex(ix, yi - 0.05, iz, -nx, 0, -nz, s / 1.0, 0));
      oBot.push([ox, oz, topO, yo - 0.25, nx, nz]);
      if (!isMedian && w > 1.2) info.push(x + nx * (p.hw * k + w * 0.55), z + nz * (p.hw * k + w * 0.55));
    }
    for (let i = 0; i < n - 1; i++) {
      if (side > 0) {
        buf.quad(inner[i], inner[i + 1], outer[i + 1], outer[i]);
        curb.quad(cBot[i], cBot[i + 1], cTop[i + 1], cTop[i]);
      } else {
        buf.quad(inner[i], outer[i], outer[i + 1], inner[i + 1]);
        curb.quad(cBot[i], cTop[i], cTop[i + 1], cBot[i + 1]);
      }
    }
    // outer skirt face down to the terrain
    const sk = [];
    for (let i = 0; i < n; i++) {
      const [ox, oz, t, b, nx, nz] = oBot[i];
      sk.push([curb.vertex(ox, t, oz, nx, 0, nz, i, 0.2), curb.vertex(ox, b, oz, nx, 0, nz, i, 0)]);
    }
    for (let i = 0; i < n - 1; i++) {
      if (side > 0) curb.quad(sk[i][1], sk[i][0], sk[i + 1][0], sk[i + 1][1]);
      else curb.quad(sk[i][1], sk[i + 1][1], sk[i + 1][0], sk[i][0]);
    }
    if (info.length >= 4) this.sidewalkInfo.push({ piece: p, side, pts: info, median: isMedian, width: widths.reduce((a, b) => a + b, 0) / widths.length });
    p[side > 0 ? 'swLeft' : 'swRight'] = isMedian ? 0 : widths.reduce((a, b) => a + b, 0) / widths.length;
    p[side > 0 ? 'medianLeft' : 'medianRight'] = isMedian;
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
    if ((cls === 'trunk' || cls === 'primary') && p.width >= 9) {
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
      const wbuf = this.buckets.get(n.x, n.z, 'sidewalk');
      const cbuf = this.buckets.get(n.x, n.z, 'curb');
      const inn = [], out = [], ct = [], cb = [];
      for (let i = 0; i < curve.length; i++) {
        const [x, z] = curve[i];
        const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        let nx = tz, nz = -tx;
        if ((x - n.x) * nx + (z - n.z) * nz < 0) { nx = -nx; nz = -nz; }
        const ww = Math.min(w, swA || w);
        const ox = x + nx * ww, oz = z + nz * ww;
        const yi = this.y(x, z) + ROAD_Y;
        inn.push(wbuf.vertex(x, yi + KERB, z, 0, 1, 0, x / 4, z / 4));
        out.push(wbuf.vertex(ox, Math.max(yi + KERB - 0.02, this.y(ox, oz) + 0.05), oz, 0, 1, 0, ox / 4, oz / 4));
        ct.push(cbuf.vertex(x, yi + KERB, z, -nx, 0, -nz, i * 0.5, 0.2));
        cb.push(cbuf.vertex(x, yi - 0.05, z, -nx, 0, -nz, i * 0.5, 0));
      }
      for (let i = 0; i < curve.length - 1; i++) {
        // orientation: decide by cross product so faces point up
        const ax = curve[i][0], az = curve[i][1], bx = curve[i + 1][0], bz = curve[i + 1][1];
        const cross = (bx - ax) * (n.z - az) - (bz - az) * (n.x - ax);
        if (cross > 0) {
          wbuf.quad(inn[i], inn[i + 1], out[i + 1], out[i]);
          cbuf.quad(cb[i], cb[i + 1], ct[i + 1], ct[i]);
        } else {
          wbuf.quad(inn[i], out[i], out[i + 1], inn[i + 1]);
          cbuf.quad(cb[i], ct[i], ct[i + 1], cb[i + 1]);
        }
      }
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
  zebras(crossings) {
    for (let k = 0; k < crossings.length; k += 3) {
      const x = crossings[k] / 10, z = crossings[k + 1] / 10, type = crossings[k + 2];
      if (!type) continue;
      const q = this.net.query(x, z, 8, (p) => !p.minor);
      if (!q || q.d > q.piece.hw + 0.5) continue;
      const p = q.piece;
      // centre on the road centreline
      const ax = p.pts[q.i], az = p.pts[q.i + 1];
      const cx = ax + (p.pts[q.i + 2] - ax) * q.t, cz = az + (p.pts[q.i + 3] - az) * q.t;
      const [dx, dz] = q.dir;
      const lx = dz, lz = -dx;
      const buf = this.buckets.get(cx, cz, 'paint');
      const stripes = Math.floor((p.width - 0.6) / 1.0);
      for (let s = 0; s < stripes; s++) {
        const off = -p.hw + 0.55 + s * 1.0 + 0.25;
        const corners = [[-2, -0.25], [2, -0.25], [2, 0.25], [-2, 0.25]].map(([a, b]) => {
          const px = cx + dx * a + lx * (off + b), pz = cz + dz * a + lz * (off + b);
          return buf.vertex(px, this.y(px, pz) + PAINT_Y + 0.002, pz, 0, 1, 0, 0, 0);
        });
        buf.quad(corners[0], corners[3], corners[2], corners[1]);
        buf.quad(corners[0], corners[1], corners[2], corners[3]);
      }
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
    return out;
  }
}
