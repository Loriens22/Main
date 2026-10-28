// Buildings from OSM footprints: extruded walls with a fully procedural
// facade shader (window grids, Sofia panel blocks with loggias, classical
// plaster, curtain walls, shopfronts, lit windows at night), flat / hipped
// roofs and mapped domes. Merged per 256 m tile.
import * as THREE from 'three';
import { TileBuckets } from './GeoBuffer.js';
import { hashStr, mulberry32 } from '../core/rng.js';
import { makeNoiseTexture } from '../render/Textures.js';
import { replacedFor } from './LandmarkData.js';
import { addFacadeDetail, addRoofKit, detailMaterials } from './FacadeDetail.js';
import { KitPlacer } from './FacadeKit.js';

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
  constructor({ world, hf, quality, route = null }) {
    this.world = world;
    this.hf = hf;
    this.quality = quality;
    // real balconies, canopies and cornices on the buildings along the route (not on 'low')
    this.detailPaths = route && quality !== 'low' ? ['A', 'B'].map((d) => route.direction(d).path) : null;
    this.detailRange = quality === 'ultra' ? 90 : quality === 'high' ? 65 : 40;
    this.detailCount = 0;
    // Blender kit pieces (AC units, dishes, downpipes, roof rooms, awnings...) on the same buildings
    this.kit = this.detailPaths ? new KitPlacer(256, quality === 'balanced') : null;
    this.buckets = new TileBuckets(256, {
      walls: { color: true, extra: [{ name: 'aFacade', size: 4 }, { name: 'aFacade2', size: 4 }] },
      flat: { color: true }, tiles: { color: true }, metal: { color: true }, gold: {}, copper: {}, glassroof: {},
      dflat: { color: true }, rail: { color: true }, glazing: { color: true },
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
    if (replacedFor(this.world.line).some((r) => Math.hypot(r.x - cx, r.z - cz) < (r.r || 4))) return; // hand-built in Landmarks.js
    const col = hexToRgb(color);
    const seed = (hashStr(`${b.id}`) % 1000) / 1000;
    let floorH = style === STYLE.PANEL || style === STYLE.RENOVATED ? 2.8 : style === STYLE.CLASSIC || style === STYLE.STONE ? 3.5 : style === STYLE.GLASS ? 3.7 : style === STYLE.HOUSE ? 3.0 : style === STYLE.INDUSTRIAL ? 6.0 : 3.4;
    if (b.levels > 0 && b.minH === 0) floorH = Math.max(2.6, Math.min(4.2, b.h / b.levels));
    // aFacade = (style, seed, wall height, floor height); aFacade2 = researched (accent rgb packed, window
    // pattern, ground floor, kind), -1 = unknown -> procedural defaults
    const rs = b.research;
    const fac = [style, seed, b.h, floorH, rs && rs.accent != null ? rs.accent : -1, rs ? rs.window : -1, rs ? rs.ground : -1, rs ? rs.kind : -1];
    const detail = this.detailPaths && !b.part && b.minH === 0 && b.h > 2.5 && this.nearRoute(cx, cz, outer);
    if (detail) fac[7] += 64; // tells the shader that FacadeDetail.js draws balconies and canopies
    const walls = this.buckets.get(cx, cz, 'walls');
    const vOff = b.minH > 0 ? b.minH : 0;
    this.extrudeRing(walls, outer, bottom, top, base, col, fac, vOff);
    const K = detail && this.kit && !b.landmark ? { placer: this.kit, tx: cx, tz: cz, researched: !!rs } : null;
    if (detail) {
      const acc = rs && rs.accent != null ? hexToRgb('#' + rs.accent.toString(16).padStart(6, '0')) : null;
      this.detailCount += addFacadeDetail((m) => this.buckets.get(cx, cz, m), outer, fac, (v) => base + v, col, acc, K);
    }
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
    if (K && !b.holes.length && b.roof !== 'dome' && b.roof !== 'onion' && b.roof !== 'round') addRoofKit(K, outer, fac, top, b.inner && b.roofH > 0 ? b.inner : null, b.roofH);
    if (b.minH === 0) this.footprints.push({ pts: outer, top, bottom, id: b.id, landmark: b.landmark });
  }

  /** Any footprint vertex within detailRange of either direction's path. */
  nearRoute(cx, cz, outer) {
    const R = this.detailRange;
    for (const p of this.detailPaths) {
      const q = p.nearest(cx, cz);
      if (q.d < R) return true;
      if (q.d > R + 150) continue;
      for (let i = 0; i < outer.length; i += 2) if (p.nearest(outer[i], outer[i + 1]).d < R) return true;
    }
    return false;
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
    // bitumen membrane, grey or (on many slabs) silver aluminium paint
    const silver = b.id % 5 < 2;
    const tint = kind === 'metal' ? [0.55, 0.57, 0.58] : silver ? [0.36 + (b.id % 7) * 0.01, 0.36, 0.355] : [0.13 + (b.id % 7) * 0.008, 0.13, 0.125];
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
      uInterior: { value: this.quality === 'low' ? 0 : 1 }, // parallax room interiors behind the glass
    };
    const walls = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    walls.userData.uniforms = uniforms;
    walls.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aFacade; attribute vec4 aFacade2; flat varying vec4 vFac; flat varying vec4 vFac2; varying vec2 vUvM; varying vec3 vWP; varying vec3 vWN;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = mat3(modelMatrix) * objectNormal;')
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
    walls.customProgramCacheKey = () => 'facade-v5';
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const tilesMat = makeTileRoofMaterial(noise);
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c25a, roughness: 0.22, metalness: 1.0 });
    const copper = new THREE.MeshStandardMaterial({ color: 0x5e9c84, roughness: 0.55, metalness: 0.25 });
    const dm = detailMaterials();
    this._mats = { walls, flat, tiles: tilesMat, metal, gold, copper, uniforms, dflat: flat, rail: dm.rail, glazing: dm.glazing };
    return this._mats;
  }

  meshes() {
    const mats = this.materials();
    const out = [];
    const DETAIL = new Set(['dflat', 'rail', 'glazing']);
    for (const [key, t] of this.buckets.map) {
      const group = new THREE.Group();
      group.name = `bld:${key}`;
      const det = new THREE.Group();
      det.name = `bdetail:${key}`;
      for (const [mk, buf] of t) {
        if (buf.empty) continue;
        const m = new THREE.Mesh(buf.toGeometry(), mats[mk] || mats.flat);
        m.castShadow = mk !== 'glazing';
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.name = mk;
        (DETAIL.has(mk) ? det : group).add(m);
      }
      for (const g of [group, det]) {
        if (!g.children.length) continue;
        g.userData.tile = key.split(',').map(Number);
        out.push(g);
      }
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
// building base), vFac = (style, seed, wall height, floor height), vFac2 =
// researched data (accent rgb packed, window pattern, ground floor, kind).
// Each building is drawn as one of the Sofia archetypes below; windows show
// a parallax room interior (interior mapping), reflections come from PBR.
const FACADE_GLSL = /* glsl */ `
flat varying vec4 vFac;
flat varying vec4 vFac2;
varying vec2 vUvM;
varying vec3 vWP;
varying vec3 vWN;
uniform float uNight;
uniform float uWet;
uniform float uDebug;
uniform float uInterior;
uniform sampler2D tNoise;
struct FacadeOut { vec3 albedo; float rough; float metal; vec3 emissive; vec2 bump; float ao; };
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { return h21(p.xy + p.z * 17.13); }
float boxMask(vec2 p, vec4 r, vec2 aa) {
  vec2 a = smoothstep(r.xy - aa, r.xy + aa, p);
  vec2 b = 1.0 - smoothstep(r.zw - aa, r.zw + aa, p);
  return a.x * a.y * b.x * b.y;
}
float lineMask(float d, float w, float aa) { return 1.0 - smoothstep(w, w + aa, abs(d)); }
// integer hash, mirrored bit for bit in FacadePlan.js (hcell) so 3D balconies line up with the shader
uint hu(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float hcell(float bx, float fl, float seedI, uint salt) {
  uint h = hu(uint(bx + 8192.0) ^ hu(uint(fl + 64.0) ^ hu(uint(seedI) ^ (salt * 0x9e3779b9u))));
  return float(h >> 8u) / 16777216.0;
}
vec3 unpackRGB(float v) {
  vec3 c = vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0;
  return pow(c, vec3(2.2)); // sRGB -> linear
}
vec3 srgb(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }
// archetypes (= research kinds): 0 panel 1960s, 1 panel 1970s, 2 insulated panel patchwork, 3 EPK tower,
// 4 socialist brick (plastered), 5 Stalinist, 6 pre-war neoclassical, 7 modernist institutional,
// 8 glass office, 9 modern residential, 10 house, 11 sports hall, 12 industrial, 13 church/stone,
// 14 kiosk / pavilion, 15 modernist hotel, 16 commercial
float archOf(float style, float kind, float H, float seedI) {
  if (kind > -0.5 && kind < 15.5) return kind;
  if (style < 0.5) return H > 17.0 ? (seedI < 450.0 ? 2.0 : 1.0) : (seedI < 350.0 ? 2.0 : 0.0);
  if (style < 1.5) return seedI < 650.0 ? 2.0 : 9.0;
  if (style < 2.5) return H > 19.0 ? 4.0 : (seedI < 550.0 ? 6.0 : 4.0);
  if (style < 3.5) return 8.0;
  if (style < 4.5) return 10.0;
  if (style < 5.5) return 12.0;
  if (style < 6.5) return 7.0;
  if (style < 7.5) return 16.0;
  return 13.0;
}
vec3 pastel(float h) {
  // ETICS render colours seen on Sofia blocks
  if (h < 0.125) return srgb(0.93, 0.86, 0.68);
  if (h < 0.25) return srgb(0.95, 0.78, 0.62);
  if (h < 0.375) return srgb(0.84, 0.88, 0.74);
  if (h < 0.5) return srgb(0.95, 0.83, 0.80);
  if (h < 0.625) return srgb(0.80, 0.86, 0.90);
  if (h < 0.75) return srgb(0.96, 0.93, 0.84);
  if (h < 0.875) return srgb(0.92, 0.74, 0.58);
  return srgb(0.88, 0.89, 0.86);
}
// Interior mapping: the ray enters a box room of size (w, h, depth) through the window
// plane at pe (metres from the cell's lower-left corner). kindR: 0 home, 1 shop, 2 office.
vec3 roomColor(vec3 rt, vec2 pe, vec2 sz, float depth, float rs, float kindR, float lit, float day) {
  vec3 d = normalize(vec3(rt.xy, max(rt.z, 0.05)));
  float tx = d.x > 0.0 ? (sz.x - pe.x) / d.x : -pe.x / min(d.x, -1e-4);
  float ty = d.y > 0.0 ? (sz.y - pe.y) / d.y : -pe.y / min(d.y, -1e-4);
  float tz = depth / d.z;
  float t = min(min(tx, ty), tz);
  vec3 p = vec3(pe, 0.0) + d * t;
  float wallH = rs;
  vec3 wallC = kindR > 0.5 ? (kindR < 1.5 ? (rs < 0.3 ? srgb(0.86, 0.86, 0.84) : rs < 0.55 ? srgb(0.78, 0.66, 0.5) : rs < 0.8 ? srgb(0.5, 0.5, 0.52) : srgb(0.82, 0.76, 0.66)) : srgb(0.86, 0.86, 0.84)) : (wallH < 0.3 ? srgb(0.86, 0.82, 0.72) : wallH < 0.55 ? srgb(0.78, 0.82, 0.74) : wallH < 0.75 ? srgb(0.80, 0.80, 0.84) : srgb(0.88, 0.80, 0.70));
  vec3 c;
  float lamp = 0.0;
  if (t == tz) {
    // back wall with furniture
    c = wallC * 0.9;
    vec2 q = p.xy / sz;
    if (kindR < 0.5) {
      float f0 = fract(rs * 7.3) * 0.5, f1 = f0 + 0.3 + fract(rs * 3.1) * 0.25;
      float fh = 0.25 + fract(rs * 11.0) * 0.55;
      if (q.x > f0 && q.x < f1 && q.y < fh) c = mix(srgb(0.30, 0.20, 0.13), srgb(0.55, 0.55, 0.57), step(0.5, fract(rs * 5.0)));
      if (q.x > 0.15 && q.x < 0.32 && q.y > 0.55 && q.y < 0.72 && fract(rs * 13.0) > 0.4) c = srgb(0.35, 0.30, 0.25);
    } else if (kindR < 1.5) {
      // shop shelves with goods
      float row = floor(p.y / 0.42);
      float sh = fract(p.y / 0.42);
      vec3 goods = vec3(h21(vec2(floor(p.x / 0.22), row + rs * 31.0)), h21(vec2(floor(p.x / 0.22) + 7.0, row)), h21(vec2(floor(p.x / 0.22), row + 3.0)));
      goods = pow(goods, vec3(2.2)) * 0.8;
      c = p.y < 2.1 ? mix(srgb(0.55, 0.55, 0.56), goods, step(0.18, sh) * step(sh, 0.85)) : wallC * 0.8;
    } else {
      if (q.y > 0.27 && q.y < 0.3) c = srgb(0.35, 0.35, 0.36);
    }
  } else if (t == ty) {
    if (d.y < 0.0) c = kindR < 0.5 ? srgb(0.42, 0.28, 0.17) : kindR < 1.5 ? srgb(0.78, 0.78, 0.76) : srgb(0.36, 0.38, 0.40);
    else {
      c = srgb(0.92, 0.92, 0.9);
      vec2 lc = p.xz - vec2(sz.x * 0.5, depth * 0.45);
      lamp = kindR > 0.5 ? step(0.5, fract(p.z / 1.2)) * step(abs(lc.x), 0.5) : smoothstep(0.35, 0.1, length(lc));
    }
  } else {
    c = wallC * 0.75;
    if (kindR > 0.5 && kindR < 1.5 && p.y < 2.1) c = mix(c, srgb(0.85, 0.85, 0.85), step(0.2, fract(p.y / 0.42)));
  }
  float fade = mix(1.0, 0.45, clamp(p.z / depth, 0.0, 1.0));
  vec3 warm = kindR > 0.5 ? vec3(1.0, 0.97, 0.9) : vec3(1.0, 0.78, 0.5);
  vec3 dayL = c * fade * day * (kindR > 0.5 && kindR < 1.5 ? 0.1 : kindR > 1.5 ? 0.1 : 0.08);
  float kL = kindR > 0.5 && kindR < 1.5 ? 0.13 : kindR > 1.5 ? 0.3 : 0.42;
  vec3 nightL = c * fade * warm * lit * kL + warm * lamp * lit * (kindR > 0.5 ? 0.3 : 0.8);
  return dayL + nightL + warm * lamp * day * 0.05 * step(0.5, kindR);
}
FacadeOut facade(vec2 uvm, vec4 fac, vec4 fac2, vec3 wallCol) {
  FacadeOut o;
  float style = floor(fac.x + 0.5);
  float seed = floor(fac.y * 997.0 + 0.5) / 997.0; // quantised: hashes must not see interpolation noise
  float H = fac.z;
  float fh = fac.w;
  bool hasAccent = fac2.x > -0.5;
  vec3 accent = hasAccent ? unpackRGB(floor(fac2.x + 0.5)) : vec3(0.0);
  float winPat = floor(fac2.y + 0.5); // -1 unknown, 0 punched, 1 ribbon, 2 curtain, 3 loggias, 4 balconies, 5 shopfront only
  float gfl = floor(fac2.z + 0.5);    // -1 unknown, 0 shops, 1 lobby, 2 blank, 3 columns, 4 garages, 5 entrances
  float kind = floor(fac2.w + 0.5);
  bool detail = kind > 31.5; // near the route: balconies, canopies and cornices are real geometry (FacadeDetail.js)
  if (detail) kind -= 64.0;
  float seedI = floor(fac.y * 1000.0 + 0.5);
  bool researched = winPat > -0.5 || gfl > -0.5 || kind > -0.5 || hasAccent;
  float ar = archOf(style, kind, H, seedI);
  bool block = ar < 4.5 || (ar > 8.5 && ar < 9.5) || (ar > 14.5 && ar < 15.5);   // residential slab with stairs
  bool panel = ar < 3.5;
  vec4 nz = texture2D(tNoise, vec2(uvm.x * 0.031 + seed * 7.0, uvm.y * 0.043));
  vec4 nz2 = texture2D(tNoise, uvm * 0.045 + seed);
  vec4 nzf = texture2D(tNoise, uvm * 0.61 + seed * 3.0);
  vec3 wall = wallCol * (0.9 + nz.r * 0.18);
  float streak = smoothstep(0.4, 0.9, texture2D(tNoise, vec2(uvm.x * 0.35 + seed, uvm.y * 0.012)).g);
  wall *= 1.0 - streak * 0.12;
  wall *= mix(0.62, 1.0, smoothstep(-0.3, 1.6, uvm.y));
  o.albedo = wall; o.rough = 0.92; o.metal = 0.0; o.emissive = vec3(0.0); o.bump = vec2(0.0); o.ao = 1.0;
  if (uvm.y < 0.0) { o.albedo *= 0.75; return o; } // foundation below the base
  // ---------------- grid
  float bayW = ar < 0.5 ? 3.0 : ar < 2.5 ? 3.6 : ar < 3.5 ? 3.0 : ar < 4.5 ? 3.2 : ar < 5.5 ? 3.4 : ar < 6.5 ? 2.9 :
               ar < 7.5 ? 1.5 : ar < 8.5 ? 1.55 : ar < 9.5 ? 3.4 : ar < 10.5 ? 3.6 : ar < 12.5 ? 6.0 : ar < 13.5 ? 4.2 : ar < 14.5 ? 2.4 : ar < 15.5 ? 1.8 : 3.0;
  if (winPat > 0.5 && winPat < 1.5) bayW = 1.5;
  if (winPat > 1.5 && winPat < 2.5) bayW = 1.55;
  bool shops = gfl > -0.5 ? (gfl < 0.5 || winPat > 4.5) : ((ar > 5.5 && ar < 6.5 && seedI < 620.0) || ar > 15.5 || ar > 13.5 && ar < 14.5);
  float plinth = block && !shops ? 0.9 : 0.0;          // raised ground floor with basement windows
  float gh = shops ? max(fh, 4.2) : plinth + fh;
  if (ar > 13.5 && ar < 14.5) gh = H;                   // kiosk: one storey
  float u = uvm.x / bayW;
  float bx = floor(u);
  float lx = fract(u);
  bool ground = uvm.y < gh;
  float fl = ground ? -1.0 : floor((uvm.y - gh) / fh);
  float cellH = ground ? gh - plinth : fh;
  float ly = ground ? (uvm.y - plinth) / max(cellH, 0.1) : fract((uvm.y - gh) / fh);
  vec2 aa = vec2(fwidth(u), fwidth(uvm.y / fh)) * 1.2;
  float lod = clamp(max(aa.x, aa.y) * 3.2 - 0.3, 0.0, 1.0);
  bool top = uvm.y > H - 0.7;
  bool lastPartial = !ground && (gh + (fl + 1.0) * fh > H - 0.35);
  float rnd = h31(vec3(bx, fl, seed * 91.0));
  float colRnd = hcell(bx, 0.0, seedI, 1u);
  // staircase columns (entrances) on residential slabs: one every ~20 m
  float stairN = max(3.0, floor(21.0 / bayW));
  bool stair = block && ar < 9.5 && mod(bx + mod(seedI, 13.0), stairN) < 0.5 && H > 8.0;
  // flats: two bays wide on slabs
  float flatId = floor(bx / 2.0);
  float flatRnd = h31(vec3(flatId, fl, seed * 53.0));
  // ---------------- wall material per archetype
  vec3 alb = wall;
  if (panel) {
    // large panels: sealed joints, exposed-aggregate finish
    float jx = lineMask(min(lx, 1.0 - lx) * bayW, 0.012, 0.012 + aa.x * bayW);
    float jy = lineMask(min(ly, 1.0 - ly) * cellH, 0.016, 0.012 + aa.y * fh);
    alb *= 0.9 + nzf.r * 0.16 + nz2.b * 0.06;
    float joint = max(jx, jy) * (ground ? 0.0 : 1.0);
    alb = hasAccent ? mix(alb, accent, joint * 0.85) : mix(alb, alb * 0.55 + vec3(0.02), joint * 0.7);
    // ETICS insulation per flat (patchwork), on the insulated archetype and on some flats of the others
    float insP = ar > 1.5 && ar < 2.5 ? 0.62 : 0.12;
    if (!ground && !stair && flatRnd < insP) {
      vec3 pc = pastel(h31(vec3(flatId, fl, seed * 7.0 + 2.0)));
      float px = fract(bx / 2.0) * 2.0; // 0..2 across the flat
      float edge = min(min(px, 2.0 - px) * bayW, min(ly, 1.0 - ly) * fh);
      alb = mix(pc * (0.94 + nz2.r * 0.08), alb, 0.0);
      o.ao *= mix(0.86, 1.0, smoothstep(0.0, 0.06, edge)); // edge of the 10 cm insulation board
      o.bump.y += (1.0 - smoothstep(0.0, 0.05, min(ly, 1.0 - ly) * fh)) * 0.25 * (ly > 0.5 ? 1.0 : -1.0) * (1.0 - lod);
    }
  } else if (ar < 4.5 || (ar > 8.5 && ar < 10.5) || ar > 14.5) {
    // plaster: slab edge bands per floor, slight roughness variation
    alb *= 0.95 + nzf.g * 0.07;
    if (!ground) alb = mix(alb, alb * 1.07, lineMask(ly * fh - 0.08, 0.08, 0.02));
  } else if (ar < 6.5) {
    // Stalinist / pre-war: string courses, rustication, pilasters
    if (!ground) alb = mix(alb, alb * 1.1, smoothstep(0.9, 0.93, ly));
    if (ground) alb *= 1.0 - lineMask(fract(uvm.y / 0.55) - 0.5, 0.025, 0.02) * 0.22;
    if (ar < 5.5 && mod(bx, 2.0) < 0.5) alb = mix(alb, alb * 1.08, boxMask(vec2(lx, ly), vec4(-0.1, -0.1, 0.12, 1.1), aa));
    if (uvm.y > H - 1.1) alb *= 1.12 - 0.25 * lineMask(uvm.y - (H - 1.1), 0.05, 0.03);
  } else if (ar > 10.5 && ar < 12.5) {
    float rib = sin(uvm.x * 18.0);
    alb *= 0.92 + rib * 0.05;
    o.bump.x += rib * 0.08 * (1.0 - lod);
  } else if (ar > 12.5 && ar < 13.5) {
    float row = floor(uvm.y / 0.45);
    float blk = fract(uvm.x / 0.9 + mod(row, 2.0) * 0.5);
    float jt = 1.0 - smoothstep(0.0, 0.03, min(min(blk, 1.0 - blk) * 2.0, abs(fract(uvm.y / 0.45) - 0.5) * 2.0));
    alb *= 1.0 - jt * 0.15;
  } else if (ar > 6.5 && ar < 7.5) {
    alb *= 0.94 + nzf.r * 0.1; // concrete
    // modernist institutes (hospitals, faculties, ministries) vary: half carry pale enamel spandrel
    // panels under strip windows, the rest punched windows between plastered piers
    if (fract(seed * 13.7) < 0.5 && !ground) alb = mix(alb, pastel(fract(seed * 5.3)) * 0.93, (1.0 - smoothstep(0.29, 0.31, ly)) * 0.85);
  }
  // ---------------- openings
  vec4 win = vec4(0.27, 0.28, 0.73, 0.83);
  float frame = 0.035;
  vec3 frameCol = srgb(0.93, 0.93, 0.92);
  float frameRnd = h31(vec3(flatId, fl, seed * 19.0 + 4.0));
  if (block && frameRnd > 0.72) frameCol = frameRnd > 0.88 ? srgb(0.42, 0.28, 0.18) : srgb(0.55, 0.57, 0.58); // wood / aluminium
  float loggia = 0.0;   // recessed loggia (1) or projecting balcony (2)
  float roomKind = 0.0;
  float depth = 3.6;
  bool skipWin = false;
  if (ar < 0.5) {
    win = vec4(0.28, 0.30, 0.72, 0.80);
    if (colRnd < 0.3) { win = vec4(0.1, 0.0, 0.9, 0.82); loggia = 2.0; }
  } else if (ar < 2.5) {
    if (colRnd < 0.48) { win = vec4(0.05, 0.0, 0.95, 0.94); loggia = 1.0; }
    else win = colRnd < 0.62 ? vec4(0.36, 0.34, 0.64, 0.80) : vec4(0.2, 0.28, 0.8, 0.82);
  } else if (ar < 3.5) {
    if (colRnd < 0.55) { win = vec4(0.04, 0.0, 0.96, 0.95); loggia = 1.0; } else win = vec4(0.22, 0.28, 0.78, 0.84);
  } else if (ar < 4.5) {
    win = vec4(0.27, 0.27, 0.73, 0.83); frame = 0.045;
    if (colRnd < 0.38) { win = vec4(0.08, 0.0, 0.92, 0.85); loggia = 2.0; }
  } else if (ar < 5.5) {
    win = vec4(0.3, 0.2, 0.7, 0.84); frame = 0.05; frameCol = srgb(0.85, 0.83, 0.78);
  } else if (ar < 6.5) {
    win = vec4(0.3, 0.18, 0.7, 0.86); frame = 0.05; frameCol = colRnd > 0.6 ? srgb(0.42, 0.3, 0.2) : srgb(0.95, 0.95, 0.94);
  } else if (ar < 7.5) {
    float iv = fract(seed * 13.7);
    win = iv < 0.5 ? vec4(0.0, 0.32, 1.0, 0.84) : vec4(0.13, 0.28, 0.87, 0.84);
    frame = 0.03; roomKind = 2.0; depth = 6.0;
    frameCol = fract(seed * 7.1) < 0.45 ? srgb(0.9, 0.9, 0.88) : srgb(0.32, 0.33, 0.34);
  } else if (ar < 8.5) {
    win = vec4(0.03, 0.08, 0.97, 1.0); frame = 0.02; frameCol = srgb(0.3, 0.32, 0.33); roomKind = 2.0; depth = 7.0;
  } else if (ar < 9.5) {
    win = vec4(0.14, 0.08, 0.86, 0.9); frame = 0.03; frameCol = srgb(0.25, 0.26, 0.27);
    if (colRnd < 0.5) { win = vec4(0.05, 0.0, 0.95, 0.92); loggia = 2.0; }
  } else if (ar < 10.5) {
    win = vec4(0.32, 0.32, 0.68, 0.8); frame = 0.05;
  } else if (ar < 12.5) {
    win = vec4(0.06, 0.74, 0.94, 0.92); frame = 0.02; frameCol = srgb(0.4, 0.4, 0.4); roomKind = 2.0; depth = 12.0;
  } else if (ar < 13.5) {
    win = vec4(0.36, 0.2, 0.64, 0.82); frame = 0.06; frameCol = srgb(0.3, 0.25, 0.2);
  } else if (ar < 14.5) {
    win = vec4(0.03, 0.04, 0.97, 0.74); frame = 0.025; frameCol = srgb(0.62, 0.64, 0.66); roomKind = 1.0; depth = 3.0;
  } else if (ar < 15.5) {
    win = vec4(0.12, 0.25, 0.88, 0.85); frame = 0.04; frameCol = srgb(0.85, 0.86, 0.86);
    if (colRnd < 0.6) loggia = 2.0;
  } else {
    win = vec4(0.2, 0.35, 0.8, 0.75);
  }
  // researched window pattern overrides (upper floors)
  if (winPat > -0.5 && !ground) {
    if (winPat < 0.5) { win = vec4(0.24, 0.28, 0.76, 0.84); loggia = 0.0; }
    else if (winPat < 1.5) { win = vec4(0.0, 0.32, 1.0, 0.82); frame = 0.03; loggia = 0.0; roomKind = 2.0; depth = 6.0; }
    else if (winPat < 2.5) { win = vec4(0.04, 0.06, 0.96, 1.0); frame = 0.025; frameCol = srgb(0.3, 0.32, 0.33); loggia = 0.0; roomKind = 2.0; depth = 7.0; }
    else if (winPat < 3.5) { if (colRnd < 0.5) { win = vec4(0.05, 0.0, 0.95, 0.94); loggia = 1.0; } else { win = vec4(0.25, 0.3, 0.75, 0.84); loggia = 0.0; } }
    else if (winPat < 4.5) { win = vec4(0.08, 0.0, 0.92, 0.9); loggia = 2.0; }
    else { win = vec4(0.0); loggia = 0.0; skipWin = true; }
  }
  // staircase: narrow windows offset by half a floor, entrance door with canopy at the bottom
  float canopy = 0.0;
  if (stair && !ground) {
    float ly2 = fract((uvm.y - gh) / fh + 0.5);
    loggia = 0.0;
    win = vec4(0.38, 0.0, 0.62, 0.0);
    ly = ly2; // the stair window sits between floors
    win = vec4(0.38, 0.3, 0.62, 0.78);
    frameCol = srgb(0.8, 0.8, 0.78);
  }
  // ground floor
  bool basement = false;
  if (ground) {
    loggia = 0.0;
    if (uvm.y < plinth) {
      basement = true;
      win = vec4(0.35, 0.3, 0.65, 0.75);
      ly = uvm.y / max(plinth, 0.1);
      frameCol = srgb(0.3, 0.3, 0.3);
    } else if (shops) {
      win = vec4(0.05, 0.06, 0.95, 0.72); frame = 0.02; frameCol = srgb(0.2, 0.2, 0.21); roomKind = 1.0; depth = 5.0;
      if (ar > 13.5 && ar < 14.5) win = vec4(0.03, 0.04, 0.97, 0.74);
    } else if (ar > 10.5 && ar < 12.5) {
      win = vec4(0.12, 0.0, 0.88, 0.7); frameCol = srgb(0.5, 0.52, 0.5);
    }
    if (gfl > 0.5 && gfl < 1.5) { win = vec4(0.08, 0.04, 0.92, 0.8); frame = 0.02; frameCol = srgb(0.22, 0.22, 0.22); roomKind = 2.0; }
    else if (gfl > 1.5 && gfl < 2.5) skipWin = true;
    else if (gfl > 2.5 && gfl < 3.5) { win = vec4(0.18, 0.0, 0.82, 0.86); frameCol = srgb(0.12, 0.12, 0.12); }
    else if (gfl > 3.5 && gfl < 4.5) { win = vec4(0.1, 0.0, 0.9, 0.72); frameCol = srgb(0.55, 0.56, 0.55); skipWin = true; }
    if (stair && !basement && !shops) {
      // entrance: door from street level (steps up to the raised floor) and a concrete canopy
      float lyE = uvm.y / (plinth + 2.4);
      ly = lyE;
      win = vec4(0.3, 0.0, 0.7, 1.0);
      frameCol = srgb(0.36, 0.3, 0.24);
      if (!detail) canopy = boxMask(vec2(lx, uvm.y), vec4(0.15, plinth + 2.4, 0.85, plinth + 2.62), vec2(aa.x, 0.01));
    }
  }
  if (top || lastPartial) skipWin = true;
  if (ar > 10.5 && ar < 12.5 && !ground && rnd > 0.55) skipWin = true;
  if (ar > 15.5 && !ground && rnd > 0.8) skipWin = true;
  // ---------------- window recess (parallax): the glass sits rec metres behind the wall plane. Through
  // the opening the eye sees the window (frame, glass, room) where its ray meets the glass plane, and the
  // reveals - lit sill, jambs, shadowed lintel soffit - where it meets the sides of the opening first.
  vec3 vdirR = normalize(vWP - cameraPosition);
  vec3 nWR = normalize(vWN);
  vec3 tWR = normalize(vec3(-nWR.z, 0.0, nWR.x));
  vec3 rtR = vec3(dot(vdirR, tWR), vdirR.y, -dot(vdirR, nWR));
  float rec = (loggia > 0.5 || skipWin) ? 0.0 : ar < 3.5 ? 0.18 : ar < 4.5 ? 0.24 : ar < 6.5 ? 0.32 : ar < 7.5 ? 0.16 : ar < 8.5 ? 0.03 : ar < 9.5 ? 0.12 : ar < 10.5 ? 0.16 : ar < 13.5 ? 0.3 : 0.12;
  if (ground && shops) rec = 0.12;
  if (basement) rec = 0.1;
  rec *= 1.0 - lod;
  vec2 gp = vec2(lx, ly) + rtR.xy * (rec / max(rtR.z, 0.25)) / vec2(bayW, max(cellH, 0.1));
  float wm = skipWin ? 0.0 : boxMask(vec2(lx, ly), win, aa); // the opening in the wall plane
  float wmG = skipWin ? 0.0 : boxMask(gp, win, aa) * wm;      // ... and the window seen through it
  float inner = skipWin ? 0.0 : boxMask(gp, win + vec4(frame, frame * 1.2, -frame, -frame * 1.2), aa) * wm;
  // mullions / transoms (in the glass plane)
  float mull = 0.0;
  if (ar > 7.5 && ar < 8.5 || winPat > 1.5 && winPat < 2.5) mull = lineMask(fract(gp.x), 0.006, aa.x);
  if (!ground && loggia < 0.5 && !stair && (block || ar > 4.5 && ar < 7.5 || ar > 9.5 && ar < 10.5)) {
    float midx = (win.x + win.z) * 0.5;
    mull = max(mull, lineMask(gp.x - midx, 0.008, 0.004 + aa.x));
    mull = max(mull, lineMask(gp.y - mix(win.y, win.w, 0.72), 0.01, 0.004 + aa.y) * step(win.x, gp.x) * step(gp.x, win.z));
  }
  if (ground && shops) mull = max(mull, lineMask(fract(gp.x * 2.0) - 0.0, 0.006, aa.x * 2.0));
  float glassMask = inner * (1.0 - mull);
  // ---------------- loggias and balconies
  float parapet = 0.0;
  vec3 parCol = alb;
  bool enclosed = false;
  if (loggia > 0.5 && !ground && !skipWin) {
    if (detail && loggia > 1.5) {
      // a real balcony stands in front (FacadeDetail.js): the wall behind it has a door and a window
      vec4 bd = vec4(0.12, 0.0, 0.42, 0.88), bwn = vec4(0.52, 0.3, 0.88, 0.86);
      wm = max(boxMask(vec2(lx, ly), bd, aa), boxMask(vec2(lx, ly), bwn, aa));
      inner = max(boxMask(vec2(lx, ly), bd + vec4(0.03, 0.03, -0.03, -0.03), aa), boxMask(vec2(lx, ly), bwn + vec4(0.03, 0.04, -0.03, -0.04), aa));
      glassMask = inner;
      win = vec4(0.12, 0.0, 0.88, 0.88);
    } else {
      float pTop = loggia < 1.5 ? 0.4 : 0.38;
      parapet = boxMask(vec2(lx, ly), vec4(win.x - 0.01, -0.02, win.z + 0.01, pTop), aa);
      float pr = hcell(bx, fl, seedI, 9u);
      if (panel) {
        // ribbed concrete parapet panels, some painted by the owners
        parCol = mix(wall * 0.97, srgb(0.86, 0.86, 0.84), step(0.6, pr));
        if (hasAccent) parCol = mix(accent, parCol, step(0.75, pr));
        parCol *= 0.94 + 0.06 * sin(lx * bayW * 40.0) * (1.0 - lod);
      } else if (ar > 8.5 && ar < 9.5) {
        parCol = mix(srgb(0.35, 0.45, 0.48), wall, 0.25); // glass railing
      } else {
        // metal railing over a concrete slab edge
        float bars = lineMask(fract(lx * bayW / 0.12) - 0.5, 0.12, 0.08 + aa.x * 8.0);
        parCol = mix(alb * 0.5, srgb(0.2, 0.2, 0.21), bars);
        if (pr > 0.55) parCol = mix(srgb(0.72, 0.72, 0.7), srgb(0.6, 0.62, 0.62), bars * 0.3); // filled in
      }
      enclosed = hcell(bx, fl, seedI, 3u) < (ar < 3.5 ? 0.6 : 0.45);
      if (!enclosed) {
        // open loggia: the recessed back wall with its own door and window
        float back = boxMask(vec2(lx, ly), vec4(win.x, pTop, win.z, win.w), aa) * (1.0 - parapet);
        vec4 bw = vec4(0.18, 0.0, 0.52, 0.86);
        float bwin = boxMask(vec2(lx, ly), bw, aa);
        alb = mix(alb, wall * 0.62, back);
        o.ao *= mix(1.0, 0.55, back * (1.0 - bwin));
        glassMask = bwin * boxMask(vec2(lx, ly), bw + vec4(0.02, 0.02, -0.02, -0.02), aa) * back;
        wm = max(bwin * back, parapet);
        inner = glassMask;
        // laundry and plants
        float stuff = h31(vec3(bx, fl, 77.0));
        if (stuff < 0.25) alb = mix(alb, srgb(0.85, 0.85, 0.9) * (0.8 + 0.2 * h21(vec2(floor(lx * 9.0), fl))), boxMask(vec2(lx, ly), vec4(0.55, 0.55, 0.9, 0.75), aa) * step(0.5, fract(lx * 9.0)) * back);
        else if (stuff < 0.4) alb = mix(alb, srgb(0.2, 0.38, 0.15), boxMask(vec2(lx, ly), vec4(0.6, pTop, 0.85, pTop + 0.18), aa) * back);
      } else {
        // enclosed by the owners: their own window frames over the parapet
        vec4 ew = vec4(win.x + 0.01, pTop, win.z - 0.01, win.w);
        float ewm = boxMask(vec2(lx, ly), ew, aa);
        float sash = lineMask(fract((lx - ew.x) * bayW / 0.85) - 0.0, 0.03, 0.02 + aa.x * 4.0);
        glassMask = ewm * (1.0 - sash) * boxMask(vec2(lx, ly), ew + vec4(0.015, 0.03, -0.015, -0.03), aa);
        wm = max(ewm, parapet);
        inner = glassMask;
      }
    }
    alb = mix(alb, parCol, parapet);
    // slab shadow under the balcony / loggia floor
    o.ao *= 1.0 - (1.0 - smoothstep(0.0, 0.05, ly)) * 0.0 + (loggia > 1.5 ? -0.25 * (1.0 - smoothstep(0.96, 1.0, ly)) * step(0.96, ly) : 0.0);
  }
  // ---------------- small details on residential slabs: AC units, satellite dishes
  if (block && !ground && !top && !lastPartial && !stair && lod < 0.9 && !detail) { // near the route they are Blender models (FacadeKit.js)
    float acR = h31(vec3(bx, fl, seed * 5.0 + 8.0));
    if (acR < 0.16) {
      vec4 ac = acR < 0.08 ? vec4(0.74, 0.04, 0.95, 0.27) : vec4(0.05, 0.04, 0.26, 0.27);
      float acm = boxMask(vec2(lx, ly), ac, aa);
      vec2 al = (vec2(lx, ly) - ac.xy) / (ac.zw - ac.xy);
      float fan = 1.0 - smoothstep(0.26, 0.3, length((al - vec2(0.35, 0.5)) * vec2(1.6, 1.0)));
      vec3 acC = srgb(0.86, 0.87, 0.86) * (1.0 - fan * 0.45) * (1.0 - 0.18 * step(0.94, al.y));
      alb = mix(alb, acC, acm);
      glassMask *= 1.0 - acm; wm *= 1.0 - acm;
      o.bump += (al - 0.5) * acm * 0.25 * (1.0 - lod) * step(0.8, max(abs(al.x - 0.5), abs(al.y - 0.5)) * 2.0);
      o.ao *= 1.0 - boxMask(vec2(lx, ly), vec4(ac.x, ac.y - 0.05, ac.z, ac.y), aa) * 0.35;
      o.rough = mix(o.rough, 0.5, acm);
    }
    float dR = h31(vec3(bx, fl, seed * 9.0 + 3.0));
    if (dR < 0.07 && loggia > 0.5) {
      vec2 dp = (vec2(lx, ly) - vec2(0.78, 0.5)) * vec2(bayW, fh);
      float dish = 1.0 - smoothstep(0.26, 0.28, length(dp * vec2(1.0, 1.15)));
      alb = mix(alb, srgb(0.82, 0.83, 0.82) * (0.85 + 0.15 * smoothstep(0.3, -0.2, dp.x + dp.y)), dish);
      glassMask *= 1.0 - dish;
    }
  }
  // ---------------- sign bands on unresearched shop floors (researched buildings carry real signs)
  if (ground && shops && !researched && !basement) {
    float band = boxMask(vec2(lx, ly), vec4(0.0, 0.76, 1.0, 0.92), aa);
    float sk = floor(h21(vec2(floor(bx / 3.0), seed * 11.0)) * 5.0);
    vec3 signCol = sk < 1.0 ? vec3(0.62, 0.08, 0.07) : sk < 2.0 ? vec3(0.06, 0.2, 0.5) : sk < 3.0 ? vec3(0.08, 0.35, 0.16) : sk < 4.0 ? vec3(0.85, 0.6, 0.1) : vec3(0.9);
    alb = mix(alb, signCol, band * step(0.35, h21(vec2(floor(bx / 3.0), seed))));
  }
  // window surrounds on classical facades
  if ((ar > 4.5 && ar < 6.5) && !ground && !skipWin) {
    float surround = boxMask(vec2(lx, ly), win - vec4(0.04, 0.03, -0.04, -0.09), aa) - wm;
    alb = mix(alb, alb * 1.12 + 0.03, clamp(surround, 0.0, 1.0));
    if (fl < 0.5 && ar > 5.5) alb = mix(alb, alb * 1.15 + 0.03, boxMask(vec2(lx, ly), vec4(win.x - 0.05, win.w + 0.02, win.z + 0.05, win.w + 0.09), aa)); // pediment
  }
  // window sills
  if (!ground && loggia < 0.5 && !skipWin && block) alb = mix(alb, srgb(0.78, 0.78, 0.76), boxMask(vec2(lx, ly), vec4(win.x - 0.03, win.y - 0.035, win.z + 0.03, win.y), aa));
  // entrance canopy
  if (canopy > 0.0) { alb = mix(alb, srgb(0.7, 0.7, 0.68), canopy); o.ao *= 1.0 - canopy * 0.2; }
  // window frame (in the glass plane) and the reveals around it
  float revealR = clamp(wm - wmG, 0.0, 1.0);
  alb = mix(alb, frameCol, clamp(wmG - glassMask, 0.0, 1.0));
  vec3 revCol = wall * (gp.y < win.y ? 0.95 : gp.y > win.w ? 0.4 : 0.68);
  alb = mix(alb, revCol, revealR);
  o.ao *= 1.0 - revealR * 0.12;
  // ---------------- glass: room interiors and reflections
  float roomId = h31(vec3(bx, fl, seed * 13.0 + 5.0));
  float lit = step(roomId, uNight * (ground && shops ? 0.95 : roomKind > 1.5 ? 0.3 : 0.45));
  if (roomKind > 0.5 && roomKind < 1.5) lit = max(lit, 0.0);
  float day = 1.0 - uNight;
  vec3 interior = vec3(0.0);
  vec3 vdir = normalize(vWP - cameraPosition);
  vec3 nW = normalize(vWN);
  vec3 tW = normalize(vec3(-nW.z, 0.0, nW.x));
  vec3 rt = vec3(dot(vdir, tW), vdir.y, -dot(vdir, nW));
  if (glassMask > 0.001 && uInterior > 0.5 && lod < 0.95) {
    vec2 pe = vec2(gp.x * bayW, gp.y * cellH);
    float shopLit = roomKind > 0.5 && roomKind < 1.5 ? 0.12 * day + uNight : lit; // shops are lit, dimmer than daylight
    interior = roomColor(rt, pe, vec2(bayW, cellH), depth, roomId, roomKind, shopLit, day);
  } else {
    interior = mix(vec3(0.02, 0.022, 0.025), vec3(0.05, 0.045, 0.04), roomId) * day + vec3(1.0, 0.75, 0.45) * lit * 0.3;
  }
  // curtains and blinds in homes
  if (roomKind < 0.5 && !ground) {
    float cr = h31(vec3(bx, fl, seed * 29.0));
    vec2 wl = (gp - win.xy) / max(win.zw - win.xy, vec2(0.01));
    float curtain = cr < 0.45 ? 0.5 : cr < 0.55 ? step(0.5, fract(wl.y * 14.0)) * 0.8 * step(wl.y, 0.6 + cr * 0.4) : cr < 0.75 ? step(abs(wl.x - 0.5), 0.5) * (1.0 - smoothstep(0.18, 0.22, min(wl.x, 1.0 - wl.x))) : 0.0;
    vec3 cc = cr < 0.45 ? vec3(0.85, 0.84, 0.8) : cr < 0.55 ? vec3(0.78, 0.76, 0.7) : pastel(fract(cr * 7.0)) * 0.7;
    interior = mix(interior, cc * (day * 0.13 + lit * vec3(1.0, 0.8, 0.55) * 0.42), curtain);
  }
  vec3 tint = roomKind > 1.5 && (ar > 7.5 && ar < 8.5 || winPat > 1.5 && winPat < 2.5) ? vec3(0.06, 0.1, 0.12) : vec3(0.025, 0.03, 0.035);
  alb = mix(alb, tint, glassMask);
  float rough = mix(0.92, 0.06, glassMask);
  float metal = mix(0.0, ar > 7.5 && ar < 8.5 ? 0.6 : 0.0, glassMask);
  o.rough = min(o.rough, rough);
  // recess shading and bump at the window reveals
  float reveal = clamp(wmG - inner, 0.0, 1.0);
  vec2 cwin = vec2((win.x + win.z) * 0.5, (win.y + win.w) * 0.5);
  o.bump += (vec2(lx, ly) - cwin) * reveal * 0.35 * (1.0 - lod) * (1.0 - smoothstep(0.15, 0.4, max(aa.x, aa.y) * 4.0));
  o.ao *= 1.0 - inner * 0.12 * (1.0 - lod);
  vec3 em = interior * glassMask;
  // distant: average the pattern to avoid shimmering
  float gAvg = (win.z - win.x) * (win.w - win.y) * 0.75 * (skipWin ? 0.0 : 1.0);
  vec3 avgCol = mix(wall, tint, gAvg);
  vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.86, 0.66), h31(vec3(bx, fl, 3.0)));
  o.albedo = mix(alb, avgCol, lod);
  o.rough = mix(o.rough, mix(0.92, 0.3, gAvg), lod);
  o.metal = mix(metal, 0.1 * gAvg, lod);
  o.emissive = mix(em, warm * gAvg * uNight * 0.3 + vec3(0.03) * gAvg * day, lod);
  // rain darkening
  o.albedo *= 1.0 - uWet * 0.25 * (1.0 - glassMask);
  if (uDebug > 0.5) { o.metal = 0.0; o.rough = 1.0; o.emissive = vec3(0.0); o.bump = vec2(0.0); o.ao = 1.0; }
  if (uDebug > 0.5 && uDebug < 1.5) o.albedo = vec3(glassMask);
  if (uDebug > 1.5 && uDebug < 2.5) o.albedo = vec3(inner, wm, mull);
  if (uDebug > 2.5 && uDebug < 3.5) o.albedo = vec3(lod, aa * 10.0);
  if (uDebug > 3.5 && uDebug < 4.5) o.albedo = vec3(fract(bx * 0.37), fract(fl * 0.29), rnd);
  if (uDebug > 4.5 && uDebug < 5.5) o.albedo = vec3(fract(ar * 0.31), fract(ar * 0.17), fract(ar * 0.71));
  return o;
}
`;
