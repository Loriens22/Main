// Buildings from OSM footprints: extruded walls with a fully procedural
// facade shader (window grids, Sofia panel blocks with loggias, classical
// plaster, curtain walls, shopfronts, lit windows at night), flat / hipped
// roofs and mapped domes. Merged per 256 m tile.
import * as THREE from 'three';
import { TileBuckets } from './GeoBuffer.js';
import { hashStr, mulberry32 } from '../core/rng.js';
import { makeNoiseTexture } from '../render/Textures.js';
import { REPLACED } from './LandmarkData.js';

export const STYLE = { PANEL: 0, RENOVATED: 1, CLASSIC: 2, GLASS: 3, HOUSE: 4, INDUSTRIAL: 5, INSTITUTIONAL: 6, COMMERCIAL: 7, STONE: 8 };

const PALETTE = {
  0: ['#b9b7af', '#aaa89f', '#c3bfb4', '#b3ada2', '#a6a49d'],
  1: ['#e6dbc0', '#d9c9ad', '#cdd8c8', '#e0c7b2', '#c6cfdb', '#e9e4d6', '#d8c0b8', '#e3dcbc', '#d1d9d2', '#d9d2e0'],
  2: ['#d9c9a6', '#e3d9c2', '#cfbb9c', '#d6c6b8', '#cdc9bf', '#ddd0b2', '#c9b9a3', '#e2dcd2', '#bec4c4', '#d8cfc0'],
  3: ['#7d8a8f', '#6f7f86', '#8b9496'],
  4: ['#e8dcc6', '#d9c8a8', '#e6d2b8', '#dbd3c4', '#cbb79a'],
  5: ['#a8a49a', '#b5ae9f', '#9ea3a3', '#b9b4a6'],
  6: ['#cfcabd', '#dcd6c6', '#c8c3b6', '#d7d1c0', '#bdb9ae'],
  7: ['#d6d0c4', '#c7c2b8', '#e0dacf', '#b8b4ab'],
  8: ['#d8d0bd', '#cfc6b0', '#e0d8c6'],
};

const LANDMARK_STYLE = {
  su_rectorate: { style: STYLE.CLASSIC, color: '#e3d2a2' },
  military_academy: { style: STYLE.CLASSIC, color: '#e0cc9a' },
  alexander_nevsky: { style: STYLE.STONE, color: '#d9d3c4' },
  parliament: { style: STYLE.CLASSIC, color: '#ebe6d8' },
  national_library: { style: STYLE.CLASSIC, color: '#cfc0a2' },
  su_library: { style: STYLE.CLASSIC, color: '#e4d6b4' },
  hotel_pliska: { style: STYLE.INSTITUTIONAL, color: '#d9d6cc' },
  bnt: { style: STYLE.INSTITUTIONAL, color: '#cfccc2' },
  winter_palace: { style: STYLE.COMMERCIAL, color: '#c9c6bd' },
  botev_hall: { style: STYLE.COMMERCIAL, color: '#d3cfc3' },
  arena: { style: STYLE.GLASS, color: '#8a9599' },
  tu_block1: { style: STYLE.INSTITUTIONAL, color: '#cbc6b9' },
  synergy: { style: STYLE.GLASS, color: '#6f838d' },
  tech_one: { style: STYLE.GLASS, color: '#7c8c93' },
  sopharma: { style: STYLE.GLASS, color: '#6d7f8a' },
  hyatt: { style: STYLE.GLASS, color: '#80878a' },
};

function signedArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
}

function toVec2(p) {
  const out = [];
  for (let i = 0; i < p.length; i += 2) out.push(new THREE.Vector2(p[i], p[i + 1]));
  return out;
}

function hexToRgb(h) {
  const c = new THREE.Color(h);
  c.convertSRGBToLinear();
  return [c.r, c.g, c.b];
}

export class BuildingBuilder {
  constructor({ world, hf, quality }) {
    this.world = world;
    this.hf = hf;
    this.quality = quality;
    this.buckets = new TileBuckets(256, {
      walls: { color: true, extra: [{ name: 'aFacade', size: 4 }, { name: 'aFacade2', size: 4 }] },
      flat: { color: true }, tiles: { color: true }, metal: { color: true }, gold: {}, copper: {}, glassroof: {},
    });
    this.footprints = []; // for collision: {pts, h}
    this.roofBoxes = [];
  }

  ground(pts) {
    let mn = Infinity, sum = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const h = this.hf.heightAt(pts[2 * i], pts[2 * i + 1]);
      mn = Math.min(mn, h);
      sum += h;
    }
    return { min: mn, avg: sum / n };
  }

  build() {
    for (const b of this.world.buildings) this.addBuilding(b);
    this.addBlocks(this.world.blocks);
    return this;
  }

  styleOf(b) {
    const lm = b.landmark && LANDMARK_STYLE[b.landmark];
    const rs = b.research;
    if (rs && rs.wall != null) return { style: b.style, color: '#' + rs.wall.toString(16).padStart(6, '0') };
    if (lm) return { style: lm.style, color: lm.color };
    const pal = PALETTE[b.style] || PALETTE[0];
    const r = mulberry32(b.id * 7919 + 13);
    return { style: b.style, color: pal[Math.floor(r() * pal.length)] };
  }

  addBuilding(b) {
    let outer = b.pts;
    if (outer.length < 6) return;
    if (signedArea(outer) < 0) outer = reverse(outer);
    const { style, color } = this.styleOf(b);
    const g = this.ground(outer);
    const base = g.avg;
    const bottom = b.minH > 0 ? base + b.minH : g.min - 0.6;
    const top = base + b.h;
    if (top - bottom < 0.5) return;
    const cx = centroidX(outer), cz = centroidZ(outer);
    if (REPLACED.some((r) => Math.hypot(r.x - cx, r.z - cz) < (r.r || 4))) return; // hand-built in Landmarks.js
    const col = hexToRgb(color);
    const seed = (hashStr(`${b.id}`) % 1000) / 1000;
    let floorH = style === STYLE.PANEL || style === STYLE.RENOVATED ? 2.8 : style === STYLE.CLASSIC || style === STYLE.STONE ? 3.5 : style === STYLE.GLASS ? 3.7 : style === STYLE.HOUSE ? 3.0 : style === STYLE.INDUSTRIAL ? 6.0 : 3.4;
    if (b.levels > 0 && b.minH === 0) floorH = Math.max(2.6, Math.min(4.2, b.h / b.levels));
    // aFacade = (style, seed, wall height, floor height); aFacade2 = researched (accent rgb packed, window
    // pattern, ground floor, kind), -1 = unknown -> procedural defaults
    const rs = b.research;
    const fac = [style, seed, b.h, floorH, rs && rs.accent != null ? rs.accent : -1, rs ? rs.window : -1, rs ? rs.ground : -1, rs ? rs.kind : -1];
    const walls = this.buckets.get(cx, cz, 'walls');
    const vOff = b.minH > 0 ? b.minH : 0;
    this.extrudeRing(walls, outer, bottom, top, base, col, fac, vOff);
    for (let h of b.holes) {
      if (h.length < 6) continue;
      if (signedArea(h) > 0) h = reverse(h); // holes clockwise so normals face the courtyard
      this.extrudeRing(walls, h, bottom, top, base, col, fac, vOff);
    }
    // roof
    const roofKind = this.roofKind(b, style);
    if (b.roof === 'dome' || b.roof === 'onion' || b.roof === 'round') this.dome(b, outer, top, cx, cz);
    else if (b.inner && b.roofH > 0) this.hipRoof(outer, b.inner, top, b.roofH, cx, cz, roofKind);
    else this.flatRoof(outer, b.holes, top, cx, cz, roofKind, b, style);
    if (b.minH === 0) this.footprints.push({ pts: outer, top, bottom, id: b.id, landmark: b.landmark });
  }

  roofKind(b, style) {
    if (b.roofColor) {
      const c = b.roofColor.toLowerCase();
      if (c === '#ffdf00' || c === '#ffd700' || c === 'gold') return 'gold';
    }
    if (b.inner) return style === STYLE.INDUSTRIAL ? 'metal' : 'tiles';
    if (style === STYLE.INDUSTRIAL) return 'metal';
    return 'flat';
  }

  extrudeRing(buf, pts, bottom, top, base, col, fac, vOff) {
    const n = pts.length / 2;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = pts[2 * i], az = pts[2 * i + 1], bx = pts[2 * j], bz = pts[2 * j + 1];
      const dx = bx - ax, dz = bz - az;
      const L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      // CCW ring in the (x,z) math plane => outward normal = (dz, -dx)
      const nx = dz / L, nz = -dx / L;
      // snap the facade grid so bays are centred on each wall
      const u0 = Math.round(u * 10) / 10;
      const vb = bottom - base + vOff, vt = top - base + vOff;
      const a = buf.vertex(ax, bottom, az, nx, 0, nz, u0, vb, 0, 0, col, fac);
      const b = buf.vertex(bx, bottom, bz, nx, 0, nz, u0 + L, vb, 0, 0, col, fac);
      const c = buf.vertex(bx, top, bz, nx, 0, nz, u0 + L, vt, 0, 0, col, fac);
      const d = buf.vertex(ax, top, az, nx, 0, nz, u0, vt, 0, 0, col, fac);
      // outward facing: a(bottom-left) b(bottom-right) c d  seen from outside
      buf.idx.push(a, c, b, a, d, c);
      u += L + 0.7; // gap so neighbouring walls do not share the same bay phase
    }
  }

  flatRoof(outer, holes, top, cx, cz, kind, b, style) {
    const buf = this.buckets.get(cx, cz, kind === 'metal' ? 'metal' : 'flat');
    const contour = toVec2(outer);
    const hs = (holes || []).filter((h) => h.length >= 6).map(toVec2);
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    } catch (e) {
      return;
    }
    const all = contour.concat(...hs);
    const tint = kind === 'metal' ? [0.55, 0.57, 0.58] : [0.42 + (b.id % 7) * 0.012, 0.41, 0.4];
    const ids = all.map((v) => buf.vertex(v.x, top, v.y, 0, 1, 0, v.x / 6, v.y / 6, 0, 0, tint));
    for (const t of tris) buf.tri(ids[t[0]], ids[t[2]], ids[t[1]]);
    // rooftop structures on taller flat-roofed buildings
    const area = Math.abs(signedArea(outer));
    if (b.h > 15 && area > 250 && !b.part && (style === STYLE.PANEL || style === STYLE.RENOVATED || style === STYLE.INSTITUTIONAL || style === STYLE.GLASS)) {
      this.roofBoxes.push({ x: cx, z: cz, y: top, area, seed: b.id, outer });
    }
  }

  hipRoof(outer, inner, top, rh, cx, cz, kind) {
    let inn = inner;
    if (signedArea(inn) < 0) inn = reverse(inn);
    const buf = this.buckets.get(cx, cz, kind === 'gold' ? 'gold' : kind === 'metal' ? 'metal' : 'tiles');
    const contour = toVec2(outer);
    const hole = toVec2(reverse(inn));
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, [hole]);
    } catch (e) {
      return;
    }
    const all = contour.concat(hole);
    const ys = all.map((_, i) => (i < contour.length ? top : top + rh));
    const tint = kind === 'metal' ? [0.42, 0.44, 0.46] : [0.4, 0.13, 0.07];
    for (const t of tris) {
      const p = [t[0], t[2], t[1]].map((k) => new THREE.Vector3(all[k].x, ys[k], all[k].y));
      const nrm = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
      if (nrm.y < 0) { nrm.negate(); p.reverse(); }
      const ids = p.map((v) => buf.vertex(v.x, v.y, v.z, nrm.x, nrm.y, nrm.z, v.x / 3, (v.z + v.y * 2) / 3, 0, 0, tint));
      buf.tri(ids[0], ids[1], ids[2]);
    }
    // ridge cap
    const ic = toVec2(inn);
    let ctr;
    try {
      ctr = THREE.ShapeUtils.triangulateShape(ic, []);
    } catch (e) {
      return;
    }
    const ids = ic.map((v) => buf.vertex(v.x, top + rh, v.y, 0, 1, 0, v.x / 3, v.y / 3, 0, 0, tint));
    for (const t of ctr) buf.tri(ids[t[0]], ids[t[2]], ids[t[1]]);
  }

  dome(b, outer, top, cx, cz) {
    const area = Math.abs(signedArea(outer));
    const R = Math.sqrt(area / Math.PI) * 0.97;
    const gold = b.roofColor && /^#ff(d|df)/i.test(b.roofColor);
    const buf = this.buckets.get(cx, cz, gold ? 'gold' : b.roofColor ? 'copper' : 'metal');
    const onion = b.roof === 'onion';
    const H = b.roofH > 0 ? Math.max(b.roofH, R * 0.7) : R * (b.roof === 'round' ? 0.5 : 1.0);
    const rings = 12, segs = 28;
    const prof = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      let r, y;
      if (onion) {
        r = R * (Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.62) * 1.12) * (1 - t * t * 0.95);
        y = H * t;
      } else {
        const a = (t * Math.PI) / 2;
        r = R * Math.cos(a);
        y = H * Math.sin(a);
      }
      prof.push([Math.max(0.001, r), y]);
    }
    const ids = [];
    for (let i = 0; i <= rings; i++) {
      const row = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const [r, y] = prof[i];
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        // approximate normal from profile slope
        const [r0, y0] = prof[Math.max(0, i - 1)], [r1, y1] = prof[Math.min(rings, i + 1)];
        const dr = r1 - r0, dy = y1 - y0;
        let nr = dy, ny = -dr;
        const l = Math.hypot(nr, ny) || 1;
        nr /= l; ny /= l;
        row.push(buf.vertex(x, top + y, z, Math.cos(a) * nr, ny, Math.sin(a) * nr, k / segs, t2(i, rings)));
      }
      ids.push(row);
    }
    for (let i = 0; i < rings; i++)
      for (let k = 0; k < segs; k++) buf.quad(ids[i][k], ids[i + 1][k], ids[i + 1][k + 1], ids[i][k + 1]);
    if (b.landmark === 'alexander_nevsky' || gold) this.crosses = (this.crosses || []).concat([[cx, top + H, cz, Math.max(1.2, R * 0.25)]]);
  }

  /** Far context buildings outside the detailed corridor: oriented boxes. */
  addBlocks(blocks) {
    if (!blocks) return;
    for (let i = 0; i < blocks.length; i += 6) {
      const x = blocks[i] / 10, z = blocks[i + 1] / 10, w = blocks[i + 2] / 2, d = blocks[i + 3] / 2;
      const ang = (blocks[i + 4] / 255) * Math.PI, h = blocks[i + 5] / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const pts = [];
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(x + ca * a * w * 0.5 - sa * c * d * 0.5, z + sa * a * w * 0.5 + ca * c * d * 0.5);
      const ring = signedArea(pts) < 0 ? reverse(pts) : pts;
      const id = 100000 + i;
      const style = h > 14 ? (id % 3 ? 0 : 1) : h < 5 ? 4 : 2;
      this.addBuilding({ id, pts: Float32Array.from(ring), holes: [], h, minH: 0, style, roof: 'flat', inner: null, roofH: 0, levels: 0, part: true, landmark: null });
    }
  }

  materials(sky) {
    if (this._mats) return this._mats;
    const noise = makeNoiseTexture(256, 4242);
    const uniforms = {
      uDebug: { value: 0 },
      uNight: { value: 0 }, // 0 day .. 1 night (lit windows)
      uWet: { value: 0 },
      tNoise: { value: noise },
    };
    const walls = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    walls.userData.uniforms = uniforms;
    walls.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aFacade; attribute vec4 aFacade2; flat varying vec4 vFac; flat varying vec4 vFac2; varying vec2 vUvM; varying vec3 vWP;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFac = aFacade; vFac2 = aFacade2; vUvM = uv;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
${FACADE_GLSL}`)
        .replace('#include <map_fragment>', `
FacadeOut fo = facade(vUvM, vFac, vFac2, vColor.rgb);
diffuseColor.rgb = fo.albedo;`)
        .replace('#include <color_fragment>', '')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fo.rough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fo.metal;')
        .replace('#include <normal_fragment_maps>', `
{
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 tV = normalize(cross(upV, normal));
  normal = normalize(normal + tV * fo.bump.x + upV * fo.bump.y);
}`)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += fo.emissive;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= fo.ao;
reflectedLight.indirectSpecular *= mix(1.0, fo.ao, 0.5);`);
    };
    walls.customProgramCacheKey = () => 'facade-v4';
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const tilesMat = makeTileRoofMaterial(noise);
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c25a, roughness: 0.22, metalness: 1.0 });
    const copper = new THREE.MeshStandardMaterial({ color: 0x5e9c84, roughness: 0.55, metalness: 0.25 });
    this._mats = { walls, flat, tiles: tilesMat, metal, gold, copper, uniforms };
    return this._mats;
  }

  meshes() {
    const mats = this.materials();
    const out = [];
    for (const [key, t] of this.buckets.map) {
      const group = new THREE.Group();
      group.name = `bld:${key}`;
      for (const [mk, buf] of t) {
        if (buf.empty) continue;
        const m = new THREE.Mesh(buf.toGeometry(), mats[mk] || mats.flat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.name = mk;
        group.add(m);
      }
      group.userData.tile = key.split(',').map(Number);
      out.push(group);
    }
    return out;
  }
}

function t2(i, n) {
  return i / n;
}

function reverse(p) {
  const out = new Float32Array(p.length);
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    out[2 * i] = p[2 * (n - 1 - i)];
    out[2 * i + 1] = p[2 * (n - 1 - i) + 1];
  }
  return out;
}

function centroidX(p) {
  let s = 0;
  for (let i = 0; i < p.length; i += 2) s += p[i];
  return s / (p.length / 2);
}

function centroidZ(p) {
  let s = 0;
  for (let i = 1; i < p.length; i += 2) s += p[i];
  return s / (p.length / 2);
}

function makeTileRoofMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: noise };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoofUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoofUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoofUv; uniform sampler2D tNoise;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 t = vRoofUv * vec2(3.0, 9.0);
  float row = floor(t.y);
  float lx = fract(t.x + mod(row, 2.0) * 0.5);
  float ly = fract(t.y);
  float shade = 0.78 + 0.22 * smoothstep(0.0, 0.25, ly) - 0.25 * smoothstep(0.85, 1.0, ly);
  shade *= 0.9 + 0.2 * smoothstep(0.0, 0.08, lx) * smoothstep(1.0, 0.92, lx);
  vec4 n = texture2D(tNoise, vRoofUv * 0.07);
  diffuseColor.rgb *= shade * (0.8 + n.r * 0.45);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.24, 0.2), smoothstep(0.62, 0.8, n.g) * 0.5);
}`);
  };
  m.customProgramCacheKey = () => 'tileroof';
  return m;
}

// ---------------------------------------------------------------------------
// Procedural facade shader. vUvM = (metres along the wall, metres above the
// building base), vFac = (style, seed, wall height, floor height).
const FACADE_GLSL = /* glsl */ `
flat varying vec4 vFac;
flat varying vec4 vFac2;
varying vec2 vUvM;
varying vec3 vWP;
uniform float uNight;
uniform float uWet;
uniform float uDebug;
uniform sampler2D tNoise;
struct FacadeOut { vec3 albedo; float rough; float metal; vec3 emissive; vec2 bump; float ao; };
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { return h21(p.xy + p.z * 17.13); }
float boxMask(vec2 p, vec4 r, vec2 aa) {
  vec2 a = smoothstep(r.xy - aa, r.xy + aa, p);
  vec2 b = 1.0 - smoothstep(r.zw - aa, r.zw + aa, p);
  return a.x * a.y * b.x * b.y;
}
vec3 unpackRGB(float v) {
  vec3 c = vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0;
  return pow(c, vec3(2.2)); // sRGB -> linear
}
FacadeOut facade(vec2 uvm, vec4 fac, vec4 fac2, vec3 wallCol) {
  FacadeOut o;
  float style = floor(fac.x + 0.5);
  // researched data: accent colour (panel joints, trim, balcony fronts), window pattern, ground floor
  bool hasAccent = fac2.x > -0.5;
  vec3 accent = hasAccent ? unpackRGB(floor(fac2.x + 0.5)) : vec3(0.0);
  float winPat = floor(fac2.y + 0.5); // -1 unknown, 0 punched, 1 ribbon, 2 curtain, 3 loggias, 4 balconies, 5 shopfront only
  float gfl = floor(fac2.z + 0.5);    // -1 unknown, 0 shops, 1 lobby, 2 blank, 3 columns, 4 garages, 5 entrances
  float seed = floor(fac.y * 997.0 + 0.5) / 997.0; // quantised: hashes must not see interpolation noise
  float H = fac.z;
  float fh = fac.w;
  vec4 nz = texture2D(tNoise, vec2(uvm.x * 0.031 + seed * 7.0, uvm.y * 0.043));
  vec4 nz2 = texture2D(tNoise, uvm * 0.045 + seed);
  vec3 wall = wallCol * (0.9 + nz.r * 0.18);
  // weathering streaks and ground dirt
  float streak = smoothstep(0.4, 0.9, texture2D(tNoise, vec2(uvm.x * 0.35 + seed, uvm.y * 0.012)).g);
  wall *= 1.0 - streak * 0.13;
  wall *= mix(0.62, 1.0, smoothstep(-0.3, 1.6, uvm.y));
  o.albedo = wall; o.rough = 0.92; o.metal = 0.0; o.emissive = vec3(0.0); o.bump = vec2(0.0); o.ao = 1.0;
  if (uvm.y < 0.0) { o.albedo *= 0.75; return o; } // plinth / foundation
  float bayW = style < 1.5 ? 3.3 : style < 2.5 ? 2.9 : style < 3.5 ? 1.55 : style < 4.5 ? 3.6 : style < 5.5 ? 6.0 : style < 6.5 ? 1.25 : style < 7.5 ? 3.0 : 4.2;
  bool hasShop = (style > 1.5 && style < 2.5 && seed < 0.62) || (style > 6.5 && style < 7.5);
  if (gfl > -0.5) hasShop = gfl < 0.5 || winPat > 4.5;
  if (winPat > 0.5 && winPat < 1.5) bayW = 1.5;  // ribbon windows: narrow mullion rhythm
  if (winPat > 1.5 && winPat < 2.5) bayW = 1.55; // curtain wall modules
  float gh = hasShop ? max(fh, 4.2) : fh;
  float u = uvm.x / bayW;
  float bx = floor(u);
  float lx = fract(u);
  bool ground = uvm.y < gh;
  float fl = ground ? -1.0 : floor((uvm.y - gh) / fh);
  float ly = ground ? uvm.y / gh : fract((uvm.y - gh) / fh);
  vec2 aa = vec2(fwidth(u), fwidth(uvm.y / fh)) * 1.2;
  float lod = clamp(max(aa.x, aa.y) * 3.2 - 0.3, 0.0, 1.0);
  bool top = uvm.y > H - 0.6;
  float rnd = h31(vec3(bx, fl, seed * 91.0));
  float colRnd = h21(vec2(bx, seed * 37.0));
  // ---------------- window layout per style
  vec4 win = vec4(0.27, 0.28, 0.73, 0.83);
  float frame = 0.035;
  vec3 frameCol = vec3(0.92);
  float glassMask = 0.0;
  float balcony = 0.0;
  if (style < 1.5) {
    // Sofia large-panel blocks: stacked loggias and windows per column
    if (colRnd < 0.38) {
      win = vec4(0.06, 0.02, 0.94, 0.97); balcony = 1.0;
    } else if (colRnd < 0.5) {
      win = vec4(0.38, 0.42, 0.62, 0.8);
    } else win = vec4(0.22, 0.3, 0.78, 0.84);
  } else if (style < 2.5) {
    win = vec4(0.3, 0.18, 0.7, 0.86); frame = 0.05; frameCol = mix(vec3(0.95), vec3(0.42, 0.3, 0.2), step(0.6, colRnd));
  } else if (style < 3.5) {
    win = vec4(0.04, 0.16, 0.96, 1.02); frame = 0.025; frameCol = vec3(0.35, 0.37, 0.38);
  } else if (style < 4.5) {
    win = vec4(0.3, 0.3, 0.7, 0.8); frame = 0.05; frameCol = vec3(0.95);
  } else if (style < 5.5) {
    win = vec4(0.1, 0.72, 0.9, 0.9); frame = 0.02; frameCol = vec3(0.4);
  } else if (style < 6.5) {
    win = vec4(0.06, 0.34, 0.94, 0.84); frame = 0.04; frameCol = vec3(0.75);
  } else if (style < 7.5) {
    win = vec4(0.2, 0.35, 0.8, 0.75);
  } else {
    win = vec4(0.36, 0.2, 0.64, 0.82); frame = 0.06; frameCol = vec3(0.3, 0.25, 0.2);
  }
  // researched window pattern overrides the style default (upper floors)
  if (winPat > -0.5 && !ground) {
    if (winPat < 0.5) { win = vec4(0.24, 0.28, 0.76, 0.84); balcony = 0.0; }
    else if (winPat < 1.5) { win = vec4(0.0, 0.32, 1.0, 0.82); frame = 0.03; balcony = 0.0; }
    else if (winPat < 2.5) { win = vec4(0.04, 0.06, 0.96, 1.0); frame = 0.025; frameCol = vec3(0.3, 0.32, 0.33); balcony = 0.0; }
    else if (winPat < 3.5) { if (mod(bx, 3.0) < 1.5) { win = vec4(0.06, 0.02, 0.94, 0.97); balcony = 1.0; } else { win = vec4(0.25, 0.3, 0.75, 0.84); balcony = 0.0; } }
    else if (winPat < 4.5) { win = vec4(0.08, 0.02, 0.92, 0.97); balcony = 1.0; }
    else { win = vec4(0.0); balcony = 0.0; }
  }
  // ground floor
  if (ground) {
    if (hasShop) {
      win = vec4(0.05, 0.06, 0.95, 0.72); frame = 0.02; frameCol = vec3(0.18);
    } else if (style < 1.5) {
      win = vec4(0.3, 0.45, 0.7, 0.85);
      if (colRnd > 0.88) win = vec4(0.32, 0.0, 0.68, 0.75); // entrance
    } else if (style > 4.5 && style < 5.5) {
      win = vec4(0.12, 0.0, 0.88, 0.7); frameCol = vec3(0.5, 0.52, 0.5); // roller door
    }
    if (gfl > 0.5 && gfl < 1.5) { win = vec4(0.08, 0.04, 0.92, 0.8); frame = 0.02; frameCol = vec3(0.22); } // lobby glazing
    else if (gfl > 1.5 && gfl < 2.5) win = vec4(0.0);                                                       // blank plinth
    else if (gfl > 2.5 && gfl < 3.5) { win = vec4(0.18, 0.0, 0.82, 0.86); frameCol = vec3(0.12); }         // colonnade shade
    else if (gfl > 3.5 && gfl < 4.5) { win = vec4(0.1, 0.0, 0.9, 0.72); frameCol = vec3(0.55, 0.56, 0.55); } // garage doors
    else if (gfl > 4.5 && gfl < 5.5) win = mod(bx, 4.0) < 0.5 ? vec4(0.3, 0.0, 0.7, 0.78) : vec4(0.32, 0.45, 0.68, 0.85);
  }
  // skip some windows on industrial / blank walls
  bool skip = (style > 4.5 && style < 5.5 && !ground && rnd > 0.55) || (style > 6.5 && style < 7.5 && !ground && rnd > 0.7);
  if (top) skip = true;
  if (uvm.y > H - fh * 0.15) skip = true;
  float wm = skip ? 0.0 : boxMask(vec2(lx, ly), win, aa);
  float inner = skip ? 0.0 : boxMask(vec2(lx, ly), win + vec4(frame, frame * 1.2, -frame, -frame * 1.2), aa);
  // mullions / transoms
  float mull = 0.0;
  if (style > 2.5 && style < 3.5) {
    mull = 1.0 - smoothstep(0.0, aa.x * 2.0 + 0.01, abs(fract(u * 1.0) - 0.5) - 0.48);
  }
  if (!ground && style < 2.5 && balcony < 0.5) {
    float midx = (win.x + win.z) * 0.5;
    mull = max(mull, 1.0 - smoothstep(0.004, 0.012 + aa.x, abs(lx - midx)));
  }
  glassMask = inner * (1.0 - mull);
  // ---------------- wall detailing
  vec3 alb = wall;
  if (style < 1.5) {
    // panel joints (researched accent colour where known)
    float j = max(1.0 - smoothstep(0.0, 0.012 + aa.x, min(lx, 1.0 - lx)), 1.0 - smoothstep(0.0, 0.02 + aa.y, min(ly, 1.0 - ly)));
    alb = hasAccent ? mix(alb, accent, j * 0.8) : alb * (1.0 - j * 0.35);
    // exposed-aggregate texture
    alb *= 0.93 + nz2.b * 0.12;
  } else if (style < 2.5) {
    // string courses, rusticated ground floor, window surrounds, cornice
    if (!ground) alb = mix(alb, alb * 1.08, smoothstep(0.92, 0.95, ly));
    if (ground) alb *= 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(fract(uvm.y / 0.6) - 0.5) - 0.44)) * 0.25;
    float surround = boxMask(vec2(lx, ly), win - vec4(0.04, 0.03, -0.04, -0.09), aa) - wm;
    alb = mix(alb, alb * 1.12 + 0.03, clamp(surround, 0.0, 1.0));
    if (uvm.y > H - 0.9) alb = alb * 1.1;
  } else if (style > 4.5 && style < 5.5) {
    float rib = sin(uvm.x * 18.0);
    alb *= 0.92 + rib * 0.05;
    o.bump.x += rib * 0.08 * (1.0 - lod);
  } else if (style > 7.5) {
    float row = floor(uvm.y / 0.45);
    float blk = fract(uvm.x / 0.9 + mod(row, 2.0) * 0.5);
    float jt = 1.0 - smoothstep(0.0, 0.03, min(min(blk, 1.0 - blk) * 2.0, abs(fract(uvm.y / 0.45) - 0.5) * 2.0 - 0.0) );
    alb *= 1.0 - jt * 0.15;
  } else if (style > 6.5 && style < 7.5 && ground && hasShop) {
    // sign band
    float band = boxMask(vec2(lx, ly), vec4(0.0, 0.76, 1.0, 0.92), aa);
    float sk = floor(h21(vec2(floor(bx / 3.0), seed * 11.0)) * 5.0);
    vec3 signCol = sk < 1.0 ? vec3(0.62, 0.08, 0.07) : sk < 2.0 ? vec3(0.06, 0.2, 0.5) : sk < 3.0 ? vec3(0.08, 0.35, 0.16) : sk < 4.0 ? vec3(0.85, 0.6, 0.1) : vec3(0.9);
    alb = mix(alb, signCol, band * step(0.35, h21(vec2(floor(bx / 3.0), seed))));
  }
  if (hasShop && ground && style < 2.5) {
    float band = boxMask(vec2(lx, ly), vec4(0.0, 0.76, 1.0, 0.9), aa);
    vec3 signCol = mix(vec3(0.75, 0.12, 0.1), vec3(0.1, 0.3, 0.6), step(0.5, colRnd));
    signCol = mix(signCol, vec3(0.1, 0.45, 0.25), step(0.8, colRnd));
    alb = mix(alb, signCol, band * step(0.45, colRnd));
  }
  // window frame
  alb = mix(alb, frameCol, clamp(wm - glassMask, 0.0, 1.0));
  // balcony slabs and parapets (panel blocks)
  if (balcony > 0.5 && !ground) {
    float slab = boxMask(vec2(lx, ly), vec4(0.04, 0.0, 0.96, 0.4), aa);
    float glazed = step(0.45, rnd);
    vec3 parapet = mix(wall * 0.95, vec3(0.88, 0.88, 0.86), step(0.7, h21(vec2(bx, fl + 9.0))));
    if (hasAccent) parapet = mix(accent, parapet, step(0.8, h21(vec2(bx, fl + 9.0)))); // owners re-clad some
    alb = mix(alb, parapet, slab);
    glassMask *= 1.0 - slab;
    glassMask *= mix(0.25, 1.0, glazed);
    o.ao = mix(1.0, 0.7, inner * (1.0 - slab));
  }
  // ---------------- glass / interior
  float lit = step(h31(vec3(bx, fl, seed * 13.0 + 5.0)), uNight * (ground && hasShop ? 0.95 : 0.42));
  float curtain = step(0.55, h31(vec3(bx * 1.3, fl, seed)));
  vec3 interior = mix(vec3(0.03, 0.035, 0.04), vec3(0.075, 0.07, 0.065), h31(vec3(bx, fl, seed * 5.0)));
  interior = mix(interior, vec3(0.45, 0.42, 0.36) * 0.4, curtain * smoothstep(0.55, 0.9, ly) * 0.8);
  vec3 tint = style > 2.5 && style < 3.5 ? vec3(0.13, 0.2, 0.24) : vec3(0.06, 0.08, 0.09);
  vec3 glassCol = mix(interior, tint, 0.5);
  alb = mix(alb, glassCol, glassMask);
  float rough = mix(0.92, 0.17, glassMask);
  float metal = mix(0.0, style > 2.5 && style < 3.5 ? 0.75 : 0.45, glassMask);
  // recess shading and bump at window reveals
  float reveal = clamp(wm - inner, 0.0, 1.0);
  vec2 cwin = vec2((win.x + win.z) * 0.5, (win.y + win.w) * 0.5);
  o.bump += (vec2(lx, ly) - cwin) * reveal * 0.35 * (1.0 - lod) * (1.0 - smoothstep(0.15, 0.4, max(aa.x, aa.y) * 4.0));
  o.ao *= 1.0 - inner * 0.18 * (1.0 - lod);
  // night lighting
  vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.86, 0.66), h31(vec3(bx, fl, 3.0)));
  if (h31(vec3(bx, fl, 7.0)) > 0.9) warm = vec3(0.55, 0.7, 1.0);
  vec3 em = warm * lit * glassMask * (ground && hasShop ? 1.6 : 0.9) * (0.6 + 0.4 * curtain);
  // distant: average the pattern to avoid shimmering
  float gAvg = (win.z - win.x) * (win.w - win.y) * 0.75;
  vec3 avgCol = mix(wall, glassCol, gAvg);
  o.albedo = mix(alb, avgCol, lod);
  o.rough = mix(rough, mix(0.92, 0.3, gAvg), lod);
  o.metal = mix(metal, 0.15 * gAvg, lod);
  o.emissive = mix(em, warm * gAvg * uNight * 0.3, lod);
  // rain darkening
  o.albedo *= 1.0 - uWet * 0.25 * (1.0 - glassMask);
  if (uDebug > 0.5) { o.metal = 0.0; o.rough = 1.0; o.emissive = vec3(0.0); o.bump = vec2(0.0); o.ao = 1.0; }
  if (uDebug > 0.5 && uDebug < 1.5) o.albedo = vec3(glassMask);
  if (uDebug > 1.5 && uDebug < 2.5) o.albedo = vec3(inner, wm, mull);
  if (uDebug > 2.5 && uDebug < 3.5) o.albedo = vec3(lod, aa * 10.0);
  if (uDebug > 3.5 && uDebug < 4.5) o.albedo = vec3(fract(bx * 0.37), fract(fl * 0.29), rnd);
  return o;
}
`;
