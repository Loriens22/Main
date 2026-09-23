// Procedural building generators (local frame: front facade at z = -D/2 facing -z, length along x).
import * as THREE from 'three';
import { WM } from './materials.js';
import { mat, R, rr, pick, chance, roundedBox, tubePath } from '../util.js';
import * as TX from '../textures.js';
import { SIGNS } from './signatlas.js';
export { SIGNS };

/** Copy of a plane geometry with UVs mapped to a sign in the shared atlas. */
export function signUV(geo, text, bg = '#1d4e9e', fg = '#ffffff', w = 1024, h = 192, extra = {}) {
  const r = SIGNS.rect(Array.isArray(text) ? text : [text], { w, h, bg, fg, ...extra });
  const g = geo.clone(); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) > 0.5 ? r.u1 : r.u0, uv.getY(i) > 0.5 ? r.v1 : r.v0);
  return g;
}

const signCache = new Map();
export function signMat(text, bg = '#1d4e9e', fg = '#ffffff', w = 1024, h = 192, extra = {}) {
  const key = text + bg + fg + w + h;
  if (!signCache.has(key)) {
    const t = TX.signText(Array.isArray(text) ? text : [text], { w, h, bg, fg, ...extra });
    signCache.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.08 }));
  }
  return signCache.get(key);
}

/** Wall quad (faces +z) with metric UVs. */
function wallGeo(w, h, uTile, vTile, u0 = 0, v0 = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2 + u0) / uTile, (p.getY(i) + h / 2 + v0) / vTile);
  return g;
}
const boxUVm = (g, s = 2) => {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const u = ay > 0.5 ? p.getX(i) : ax > 0.5 ? p.getZ(i) : p.getX(i);
    const v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / s, v / s);
  }
  return g;
};

class Ctx {
  constructor(cb, M, reg) { this.cb = cb; this.M = M; this.reg = reg; }
  add(material, geo, m, color) { const mm = m ? this.M.clone().multiply(m) : this.M; return this.cb.add(material, geo, mm, color); }
  box(material, w, h, d, x, y, z, color, ry = 0) { return this.add(material, boxUVm(new THREE.BoxGeometry(w, h, d)), mat(x, y, z, 0, ry), color); }
  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }
  worldYaw(localYaw) { const e = new THREE.Euler().setFromRotationMatrix(this.M, 'YXZ'); return e.y + localYaw; }
}

const PARAPET_COLS = [0xb9b5ac, 0xc9c2b4, 0xa7a9a8, 0xd8cfb8, 0xb6c7d3, 0xd9b9b0, 0xe0d7a8, 0xc4c9b2, 0x9ea3a6];
const FRAME_COLS = [0xf1f1ee, 0xf1f1ee, 0xe8e8e4, 0x7a5a3a, 0xa9aaa8, 0x5d4632];

/** Bulgarian prefab panel block. opts: {L, D, floors, fmat, balc: 'front'|'both', shops, entrances} */
export function panelBlock(cb, M, reg, o) {
  const c = new Ctx(cb, M, reg);
  const fh = 2.8, bay = 3.0;
  const nb = Math.max(2, Math.round(o.L / bay)); const L = nb * bay; const D = o.D || 12;
  const H = o.floors * fh + 0.3;
  const fmat = o.fmat || WM.panelA;
  const tileU = 12, tileV = 11.2;
  // walls: front/back facade, ends plain
  const front = wallGeo(L, H, tileU, tileV); front.rotateY(Math.PI);
  c.add(fmat, front, mat(0, H / 2, -D / 2));
  const back = wallGeo(L, H, tileU, tileV, 3.0);
  c.add(fmat, back, mat(0, H / 2, D / 2));
  for (const s of [-1, 1]) {
    const e = wallGeo(D, H, 6, 6); e.rotateY(s * Math.PI / 2);
    c.add(WM.plainA, e, mat(s * L / 2, H / 2, 0), 0xf0ece4);
  }
  // plinth
  c.box(WM.concrete, L + 0.1, 0.8, D + 0.1, 0, 0.4, 0, 0x8a8a86);
  // roof + parapet + machine rooms
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, H - 0.05, 0));
  c.box(WM.plainA, L + 0.2, 0.5, 0.25, 0, H + 0.2, -D / 2, 0xd8d4cc);
  c.box(WM.plainA, L + 0.2, 0.5, 0.25, 0, H + 0.2, D / 2, 0xd8d4cc);
  c.box(WM.plainA, 0.25, 0.5, D, -L / 2, H + 0.2, 0, 0xd8d4cc);
  c.box(WM.plainA, 0.25, 0.5, D, L / 2, H + 0.2, 0, 0xd8d4cc);
  const entr = [];
  for (let x = -L / 2 + 10.5; x < L / 2 - 6; x += 24) entr.push(x);
  if (!entr.length) entr.push(0);
  for (const x of entr) {
    c.box(WM.plainA, 3.4, 2.6, 4.2, x, H + 1.3, 1.2, 0xcfcac0);
    // TV antennas
    for (let k = 0; k < 3; k++) c.box(WM.metal, 0.04, 2.2, 0.04, x - 1 + k, H + 3.6, 2.4);
  }
  // entrances (on the front) + canopies
  for (const x of entr) {
    c.box(WM.concrete, 3.0, 0.16, 1.8, x, 2.75, -D / 2 - 0.9, 0x9c9b96);
    c.box(WM.glassDark, 1.7, 2.3, 0.1, x, 1.15 + 0.1, -D / 2 - 0.05);
    c.box(WM.metalDark, 1.9, 0.08, 0.14, x, 2.45, -D / 2 - 0.05);
    c.box(WM.concrete, 3.0, 0.3, 1.4, x, 0.15, -D / 2 - 0.7, 0x8f8f8b);
    reg.doors?.push(c.world(x, 0, -D / 2 - 2));
  }
  // balconies
  const sides = o.simple ? [] : o.balc === 'both' ? [-1, 1] : [-1];
  for (const zs of sides) {
    for (let b = 0; b < nb; b++) {
      const xc = -L / 2 + bay / 2 + b * bay;
      const col = b % 4;
      if (!(col === 1 || col === 2)) continue;
      if (zs < 0 && entr.some((x) => Math.abs(x - xc) < 2.0)) continue;
      for (let f = 1; f < o.floors; f++) {
        const y = f * fh;
        const glazed = R() < (o.glazedP ?? 0.55);
        const pc = pick(PARAPET_COLS);
        const zf = zs * (D / 2 + 1.2);
        c.box(WM.concrete, bay - 0.04, 0.14, 1.25, xc, y + 0.07, zs * (D / 2 + 0.62), 0xb0aea8);
        c.box(WM.painted, bay - 0.04, 1.02, 0.08, xc, y + 0.63, zf, pc);
        c.box(WM.painted, 0.08, 1.02, 1.2, xc - bay / 2 + 0.06, y + 0.63, zs * (D / 2 + 0.6), pc);
        c.box(WM.painted, 0.08, 1.02, 1.2, xc + bay / 2 - 0.06, y + 0.63, zs * (D / 2 + 0.6), pc);
        if (glazed) {
          const fc = pick(FRAME_COLS);
          const gh = fh - 1.2;
          c.box(WM.glass, bay - 0.2, gh, 0.02, xc, y + 1.14 + gh / 2, zf);
          c.box(WM.painted, bay - 0.08, 0.06, 0.08, xc, y + 1.14, zf, fc);
          c.box(WM.painted, bay - 0.08, 0.06, 0.08, xc, y + fh - 0.06, zf, fc);
          for (let k = 1; k <= 2; k++) c.box(WM.painted, 0.05, gh, 0.07, xc - bay / 2 + 0.1 + (k * (bay - 0.2)) / 3, y + 1.14 + gh / 2, zf, fc);
          // sides glazed too
          c.box(WM.glass, 0.02, gh, 1.1, xc - bay / 2 + 0.06, y + 1.14 + gh / 2, zs * (D / 2 + 0.6));
          c.box(WM.glass, 0.02, gh, 1.1, xc + bay / 2 - 0.06, y + 1.14 + gh / 2, zs * (D / 2 + 0.6));
        } else {
          // open balcony: rail cap, occasional laundry / plants
          c.box(WM.metalDark, bay - 0.04, 0.05, 0.12, xc, y + 1.16, zf);
          if (chance(0.25)) for (let k = 0; k < 4; k++) c.box(WM.fabric, 0.35 + R() * 0.3, 0.5 + R() * 0.3, 0.02, xc - 1 + k * 0.6, y + 1.9, zs * (D / 2 + 0.7), pick([0xffffff, 0xd0e0ff, 0xffd0d0, 0xf5f0c0, 0x8090a0]));
          if (chance(0.3)) c.box(WM.hedge, 0.8, 0.35, 0.25, xc + 0.6, y + 1.3, zf - zs * 0.1, 0x4f7a34);
          if (zs < 0 && chance(o.peopleP ?? 0.07)) reg.terraces?.push({ p: c.world(xc + rr(-0.8, 0.8), y + 0.14, zs * (D / 2 + 0.75)), yaw: c.worldYaw(zs < 0 ? Math.PI : 0) });
        }
      }
    }
  }
  // ground-floor shops
  if (o.shops) {
    const n = Math.min(o.shops.length, Math.floor(nb / 3));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 4.5 + i * (L - 9) / Math.max(1, n - 1 || 1);
      if (entr.some((e) => Math.abs(e - x) < 3.5)) continue;
      const sm = i % 2 ? WM.shopB : WM.shopA;
      const g = wallGeo(5.6, 2.6, 5.6, 2.8); g.rotateY(Math.PI);
      c.add(sm, g, mat(x, 1.45, -D / 2 - 0.26));
      c.box(WM.metalDark, 5.8, 3.0, 0.24, x, 1.5, -D / 2 - 0.12, 0x555a60);
      const t = o.shops[i];
      const sg = new THREE.PlaneGeometry(5.2, 0.8); sg.rotateY(Math.PI);
      c.add(SIGNS.mat, signUV(sg, t.text, t.bg, t.fg, 1024, 160), mat(x, 3.35, -D / 2 - 0.3));
    }
  }
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D, H };
}

/** Point tower block (Borovo). */
export function towerBlock(cb, M, reg, o) {
  const c = new Ctx(cb, M, reg);
  const fh = 2.8, W = o.W || 21, D = o.D || 19, fl = o.floors || 17, H = fl * fh + 0.3;
  for (const [s, rot, w, x, z] of [[0, Math.PI, W, 0, -D / 2], [0, 0, W, 0, D / 2], [1, Math.PI / 2, D, W / 2, 0], [1, -Math.PI / 2, D, -W / 2, 0]]) {
    const g = wallGeo(w, H, 12, 11.2, s * 1.5); g.rotateY(rot);
    c.add(WM.tower, g, mat(x, H / 2, z));
  }
  c.box(WM.concrete, W + 0.1, 0.8, D + 0.1, 0, 0.4, 0, 0x8a8a86);
  const roof = new THREE.PlaneGeometry(W, D); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, H - 0.05, 0));
  c.box(WM.plainA, 6, 3.5, 5, 0, H + 1.7, 1, 0xd0cbc2);
  c.box(WM.plainA, W + 0.2, 0.6, 0.25, 0, H + 0.25, -D / 2, 0xd8d4cc);
  c.box(WM.plainA, W + 0.2, 0.6, 0.25, 0, H + 0.25, D / 2, 0xd8d4cc);
  c.box(WM.plainA, 0.25, 0.6, D, W / 2, H + 0.25, 0, 0xd8d4cc);
  c.box(WM.plainA, 0.25, 0.6, D, -W / 2, H + 0.25, 0, 0xd8d4cc);
  // antenna mast
  c.box(WM.metal, 0.12, 8, 0.12, 2, H + 7, 2);
  // corner loggias (vertical stacks of balconies on the front)
  for (const xs of [-1, 1]) for (let f = 1; f < fl; f++) {
    const y = f * fh, x = xs * (W / 2 - 3.2);
    c.box(WM.concrete, 5.8, 0.14, 1.3, x, y + 0.07, -D / 2 - 0.65, 0xb0aea8);
    c.box(WM.painted, 5.8, 1.0, 0.08, x, y + 0.62, -D / 2 - 1.26, pick(PARAPET_COLS));
    if (R() < 0.5) c.box(WM.glass, 5.6, 1.5, 0.02, x, y + 1.9, -D / 2 - 1.26);
    else if (chance(0.06)) reg.terraces?.push({ p: c.world(x + rr(-2, 2), y + 0.14, -D / 2 - 0.8), yaw: c.worldYaw(Math.PI) });
  }
  c.box(WM.glassDark, 2.4, 2.4, 0.1, 0, 1.3, -D / 2 - 0.05);
  c.box(WM.concrete, 4, 0.18, 2.4, 0, 2.8, -D / 2 - 1.2, 0x9c9b96);
  reg.colliders?.push({ M, hl: W / 2, hd: D / 2 });
}

/** 2004-style residential block: rendered facade, glass-railed terraces, setback top floor, shops below. */
export function modernBlock(cb, M, reg, o) {
  const c = new Ctx(cb, M, reg);
  const fh = 3.0, gf = 3.6, bay = 3.2;
  const nb = Math.max(3, Math.round(o.L / bay)); const L = nb * bay; const D = o.D || 14;
  const fl = o.floors || 6;
  const fmat = o.fmat || pick([WM.modernA, WM.modernB, WM.modernC]);
  const Hmain = gf + (fl - 1) * fh; // top of the main volume (last floor is set back)
  // ground floor commercial glazing on front, rendered elsewhere
  const g0 = wallGeo(L, gf, 5.6, 2.8); g0.rotateY(Math.PI);
  c.add(o.shopMat || WM.shopA, g0, mat(0, gf / 2, -D / 2 + 0.3));
  const gb = wallGeo(L, gf, 6, 6); c.add(WM.plainA, gb, mat(0, gf / 2, D / 2), 0xe6e1d8);
  for (const s of [-1, 1]) { const e = wallGeo(D, gf, 6, 6); e.rotateY(s * Math.PI / 2); c.add(WM.plainA, e, mat(s * L / 2, gf / 2, 0), 0xe6e1d8); }
  // upper floors
  const Hup = (fl - 2) * fh;
  const f1 = wallGeo(L, Hup, 9.6, 12); f1.rotateY(Math.PI); c.add(fmat, f1, mat(0, gf + Hup / 2, -D / 2));
  const f2 = wallGeo(L, Hup, 9.6, 12); c.add(fmat, f2, mat(0, gf + Hup / 2, D / 2));
  for (const s of [-1, 1]) { const e = wallGeo(D, Hup, 9.6, 12, 3.2); e.rotateY(s * Math.PI / 2); c.add(fmat, e, mat(s * L / 2, gf + Hup / 2, 0)); }
  // top floor, set back 2.2 m at the front
  const tb = 2.2, Dt = D - tb;
  const top = wallGeo(L - 2, fh, 9.6, 12, 0, 3); top.rotateY(Math.PI); c.add(fmat, top, mat(0, Hmain - fh + fh / 2 + fh, -D / 2 + tb));
  c.box(WM.plainA, L - 2, fh, 0.2, 0, Hmain + fh / 2, D / 2 - 0.1, 0xefece6);
  for (const s of [-1, 1]) c.box(WM.plainA, 0.2, fh, Dt, s * (L / 2 - 1), Hmain + fh / 2, -D / 2 + tb + Dt / 2, 0xefece6);
  // slabs & roof
  c.box(WM.concrete, L + 0.1, 0.3, D + 0.1, 0, gf, 0, 0xdedad2);
  const roofY = Hmain + fh;
  c.box(WM.plainA, L + 1.6, 0.35, D + 1.2, 0, roofY + 0.17, 0.2, 0xf2f0ea); // overhanging roof slab
  const roof = new THREE.PlaneGeometry(L - 2, D - 1); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, roofY + 0.36, 0.2));
  c.box(WM.concrete, L, 0.25, D, 0, Hmain, 0, 0xdedad2);
  // terraces for upper floors
  for (let f = 1; f < fl; f++) {
    const y = gf + (f - 1) * fh;
    const isTop = f === fl - 1;
    const zEdge = isTop ? -D / 2 - 0.0 : -D / 2 - 1.6;
    const depth = isTop ? tb : 1.6;
    c.box(WM.concrete, L - 0.2, 0.18, depth, 0, y + 0.09, zEdge + depth / 2, 0xe9e6df);
    // glass railing + top rail
    c.box(WM.glass, L - 0.4, 1.0, 0.03, 0, y + 0.7, zEdge + 0.05);
    c.box(WM.metal, L - 0.3, 0.06, 0.08, 0, y + 1.22, zEdge + 0.05);
    for (let k = 0; k <= nb; k += 2) {
      const x = -L / 2 + 0.1 + k * bay;
      c.box(WM.painted, 0.15, fh - 0.2, depth, Math.min(L / 2 - 0.1, x), y + fh / 2, zEdge + depth / 2, o.accent ?? 0xb45d3f);
    }
    for (let k = 0; k < nb; k++) {
      if (chance(0.05)) reg.terraces?.push({ p: c.world(-L / 2 + bay / 2 + k * bay, y + 0.18, zEdge + 0.6), yaw: c.worldYaw(Math.PI) });
      if (chance(0.18)) c.box(WM.hedge, 0.6, 0.6, 0.6, -L / 2 + bay / 2 + k * bay + 0.8, y + 0.5, zEdge + depth - 0.5, 0x4a7032);
    }
  }
  // accent corner fins
  for (const s of [-1, 1]) c.box(WM.painted, 0.5, Hmain - gf, 0.5, s * (L / 2 - 0.25), gf + (Hmain - gf) / 2, -D / 2 - 0.25, o.accent ?? 0xb45d3f);
  // shop signs
  if (o.shops) o.shops.forEach((t, i) => {
    const x = -L / 2 + (L / (o.shops.length + 1)) * (i + 1);
    const sg = new THREE.PlaneGeometry(Math.min(7, L / (o.shops.length + 1) - 1), 0.75); sg.rotateY(Math.PI);
    c.add(SIGNS.mat, signUV(sg, t.text, t.bg, t.fg, 1024, 128), mat(x, gf - 0.45, -D / 2 - 0.02));
  });
  c.box(WM.glassDark, 1.8, 2.4, 0.1, 0, 1.2, -D / 2 + 0.22);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D };
}

/** 36 СУ — old school building: roughcast plaster, white windows, tiled hip roof. */
export function schoolBuilding(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 68, D = o.D || 14, fh = 3.6, H = 3 * fh;
  const front = wallGeo(L, H, 6.8, H); front.rotateY(Math.PI); c.add(WM.school, front, mat(0, H / 2, -D / 2));
  const back = wallGeo(L, H, 6.8, H); c.add(WM.school, back, mat(0, H / 2, D / 2));
  for (const s of [-1, 1]) { const e = wallGeo(D, H, 6.8, H, 0.4); e.rotateY(s * Math.PI / 2); c.add(WM.school, e, mat(s * L / 2, H / 2, 0)); }
  // cornice
  c.box(WM.plainA, L + 0.9, 0.35, D + 0.9, 0, H + 0.1, 0, 0xd6d0c4);
  // hip roof
  const roofH = 3.4, ov = 0.6;
  const x0 = L / 2 + ov, z0 = D / 2 + ov, rx = L / 2 - D / 2;
  const P = (x, y, z) => [x, y, z];
  const A = P(-x0, H + 0.25, -z0), Bq = P(x0, H + 0.25, -z0), C = P(x0, H + 0.25, z0), Dq = P(-x0, H + 0.25, z0);
  const r0 = P(-rx, H + 0.25 + roofH, 0), r1 = P(rx, H + 0.25 + roofH, 0);
  const tri = [];
  const quad = (a, b, cc, d) => tri.push(a, b, cc, a, cc, d);
  quad(A, Bq, r1, r0);        // front slope
  quad(C, Dq, r0, r1);        // back slope
  tri.push(Bq, C, r1);        // right hip
  tri.push(Dq, A, r0);        // left hip
  const pos = []; tri.forEach((p) => pos.push(...p));
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.computeVertexNormals();
  // uv: planar along slope
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 3, (pos[i + 2] + pos[i + 1]) / 3);
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const rmat = WM.roofTiles.clone(); rmat.side = THREE.DoubleSide;
  c.add(rmat, rg, null);
  for (const x of [-L / 3, 0, L / 3]) c.box(WM.plainA, 0.9, 1.8, 0.9, x, H + roofH * 0.6 + 0.8, 1.8, 0xb8a894);
  // entrance portico + steps + sign
  c.box(WM.plainA, 6, 0.3, 2.4, 0, 3.5, -D / 2 - 1.2, 0xe2ddd2);
  for (const s of [-1, 1]) c.box(WM.plainA, 0.4, 3.4, 0.4, s * 2.6, 1.7, -D / 2 - 2.2, 0xe2ddd2);
  for (let k = 0; k < 3; k++) c.box(WM.concrete, 5 - k * 0.4, 0.16, 1.4 - k * 0.35, 0, 0.08 + k * 0.16, -D / 2 - 1.4 + k * 0.17, 0x9a9994);
  c.box(WM.glassDark, 2.4, 2.8, 0.1, 0, 1.45, -D / 2 - 0.05);
  const sg = new THREE.PlaneGeometry(5.5, 0.9); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, ['36 СУ „Максим Горки“'], '#f4f1e6', '#1b2b5a', 1024, 160), mat(0, 4.3, -D / 2 - 2.42));
  // flag
  c.box(WM.metal, 0.05, 2.2, 0.05, 3.4, 4.6, -D / 2 - 0.6);
  const fl = new THREE.PlaneGeometry(1.1, 0.7); c.add(new THREE.MeshStandardMaterial({ map: TX.flagBG(), side: THREE.DoubleSide, roughness: 0.8 }), fl, mat(3.95, 5.35, -D / 2 - 0.6));
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** 20 ДКЦ polyclinic with ribbon windows. */
export function polyclinic(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 54, D = o.D || 16, fh = 3.4, H = 3 * fh + 0.4;
  for (const [rot, w, x, z] of [[Math.PI, L, 0, -D / 2], [0, L, 0, D / 2], [Math.PI / 2, D, L / 2, 0], [-Math.PI / 2, D, -L / 2, 0]]) {
    const g = wallGeo(w, H - 0.4, 6, H - 0.4); g.rotateY(rot); c.add(WM.ribbon, g, mat(x, (H - 0.4) / 2, z));
  }
  c.box(WM.plainA, L + 0.6, 0.5, D + 0.6, 0, H - 0.2, 0, 0xe4e2dc);
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, H + 0.02, 0));
  c.box(WM.metal, 4, 1.4, 3, 8, H + 0.7, 2);
  c.box(WM.concrete, 9, 0.3, 4, 0, 3.3, -D / 2 - 2, 0xd0cfca);
  for (const s of [-1, 1]) c.box(WM.metal, 0.2, 3.2, 0.2, s * 4.2, 1.6, -D / 2 - 3.8);
  c.box(WM.glassDark, 4.2, 2.8, 0.1, 0, 1.4, -D / 2 - 0.05);
  const sg = new THREE.PlaneGeometry(7, 1.1); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, ['ДКЦ 20 ЕООД', 'Диагностично-консултативен център'], '#ffffff', '#0d4c8b', 1024, 200), mat(0, 4.1, -D / 2 - 4.02));
  // red cross
  c.box(WM.painted, 0.9, 0.25, 0.08, -L / 2 + 3, H - 1.4, -D / 2 - 0.08, 0xd4121b);
  c.box(WM.painted, 0.25, 0.9, 0.08, -L / 2 + 3, H - 1.4, -D / 2 - 0.08, 0xd4121b);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Single-storey supermarket with glazing, sign band. */
export function supermarket(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 40, D = o.D || 26, H = 6.2;
  const fr = wallGeo(L * 0.6, 4.2, 5.6, 2.8); fr.rotateY(Math.PI); c.add(WM.shopA, fr, mat(-L * 0.18, 2.1, -D / 2));
  c.box(WM.plainA, L * 0.4, H, 0.2, L * 0.3, H / 2, -D / 2 + 0.1, 0xd9dcdf);
  c.box(WM.plainA, L, H, 0.2, 0, H / 2, D / 2, 0xd9dcdf);
  for (const s of [-1, 1]) c.box(WM.plainA, 0.2, H, D, s * L / 2, H / 2, 0, 0xd9dcdf);
  c.box(WM.painted, L * 0.6, H - 4.2, 0.25, -L * 0.18, 4.2 + (H - 4.2) / 2, -D / 2, o.band ?? 0xc0272d);
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, H, 0));
  const sg = new THREE.PlaneGeometry(Math.min(16, L * 0.45), 1.3); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, o.name || 'СУПЕРМАРКЕТ', o.signBg || '#c0272d', '#ffffff', 1024, 128), mat(-L * 0.18, 5.15, -D / 2 - 0.14));
  // entrance canopy + cart shelter
  c.box(WM.metalDark, 7, 0.25, 3, -L * 0.18, 4.1, -D / 2 - 1.5);
  c.box(WM.metal, 3.5, 0.1, 2, L * 0.3 - 4, 2.3, -D / 2 - 5);
  for (const s of [-1, 1]) c.box(WM.metal, 0.08, 2.3, 0.08, L * 0.3 - 4 + s * 1.6, 1.15, -D / 2 - 5);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Small shop pavilion / kiosk building with awning. */
export function shopPavilion(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 9, D = o.D || 6, H = 3.5;
  const fr = wallGeo(L - 0.6, 2.6, 5.6, 2.8); fr.rotateY(Math.PI); c.add(R() < 0.5 ? WM.shopA : WM.shopB, fr, mat(0, 1.4, -D / 2 - 0.01));
  c.box(WM.plainA, L, H, D, 0, H / 2, 0, o.wall ?? pick([0xeae4d6, 0xdad5c7, 0xe8dcc8, 0xd7dde2]));
  c.box(WM.plainA, L + 0.4, 0.2, D + 0.4, 0, H + 0.1, 0, 0xcfc9bd);
  const sg = new THREE.PlaneGeometry(L - 0.8, 0.7); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, o.text || 'МАГАЗИН', o.bg || '#1d6e3a', o.fg || '#fff', 1024, 128), mat(0, 3.05, -D / 2 - 0.02));
  // awning
  const aw = new THREE.PlaneGeometry(L - 0.4, 1.3); aw.rotateX(-Math.PI / 2 + 0.35);
  c.add(WM.fabric, aw, mat(0, 2.55, -D / 2 - 0.62), o.awning ?? pick([0xc0392b, 0x2e7d32, 0x1565c0, 0xef6c00]));
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Mehana "Дойранъ": low building with tiled roof, timber pergola garden, hedge, stone wall, flags, umbrellas. */
export function mehana(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  // main building at the back
  const L = 16, D = 8, H = 3.3, zb = 5;
  c.box(WM.plainA, L, H, D, 0, H / 2, zb, 0xe9e0cf);
  c.box(WM.wood, L + 0.3, 0.5, 0.3, 0, H - 0.3, zb - D / 2 - 0.1, 0x9a6a44);
  const roofG = new THREE.CylinderGeometry(0.01, 6.2, 1.6, 4, 1, true); roofG.rotateY(Math.PI / 4); roofG.scale(L / 8.6, 1, D / 8.6);
  const rm = WM.roofTiles.clone(); rm.side = THREE.DoubleSide;
  c.add(rm, roofG, mat(0, H + 0.8, zb));
  c.box(WM.glassDark, 3, 2.2, 0.1, -3, 1.2, zb - D / 2 - 0.02);
  c.box(WM.wood, 1.2, 2.3, 0.12, 2.5, 1.15, zb - D / 2 - 0.02, 0x6a4526);
  // sign board
  const sg = new THREE.PlaneGeometry(3.8, 1.0); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, ['механа', 'Дойранъ'], '#6a3e1f', '#f3d9a4', 768, 200, { font: 'Georgia, "DejaVu Serif", serif' }), mat(0, 3.6, zb - D / 2 - 0.25));
  // tiled lean-to over entrance
  const lt = new THREE.PlaneGeometry(6, 1.8); lt.rotateX(-Math.PI / 2 + 0.4);
  c.add(rm, lt, mat(0, 3.1, zb - D / 2 - 0.8));
  // pergola garden in front
  const gx = 22, gz = 8;
  for (let i = 0; i <= 6; i++) for (const zz of [-gz / 2, gz / 2 - 1]) c.box(WM.wood, 0.18, 2.6, 0.18, -gx / 2 + (i * gx) / 6, 1.3, zz - 1, 0x7a5030);
  for (const zz of [-gz / 2, gz / 2 - 1]) c.box(WM.wood, gx + 0.4, 0.2, 0.22, 0, 2.65, zz - 1, 0x7a5030);
  for (let i = 0; i <= 12; i++) c.box(WM.wood, 0.12, 0.16, gz, -gx / 2 + (i * gx) / 12, 2.8, -1.5, 0x7a5030);
  // curtains
  for (let i = 0; i < 6; i++) { const cg = new THREE.PlaneGeometry(1.2, 2.3); c.add(WM.fabric, cg, mat(-gx / 2 + 1.8 + (i * gx) / 6, 1.35, -gz / 2 - 1.05), 0xf6f1e6); }
  // tables, benches
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const x = -8 + i * 4, z = -3.2 + j * 3;
    c.box(WM.wood, 1.8, 0.08, 0.9, x, 0.78, z, 0x8a5a36);
    c.box(WM.wood, 0.1, 0.75, 0.1, x, 0.38, z);
    c.box(WM.wood, 1.8, 0.06, 0.35, x, 0.45, z - 0.7, 0x8a5a36); c.box(WM.wood, 1.8, 0.06, 0.35, x, 0.45, z + 0.7, 0x8a5a36);
  }
  // umbrellas (Devin blue/white)
  for (const x of [-7, 0, 7]) {
    c.box(WM.metal, 0.05, 2.6, 0.05, x, 1.3, -6.8);
    const u = new THREE.ConeGeometry(1.7, 0.6, 8, 1, true); c.add(WM.fabric, u, mat(x, 2.75, -6.8), 0x1e5aa8);
    const u2 = new THREE.CylinderGeometry(1.72, 1.72, 0.22, 8, 1, true); c.add(WM.fabric, u2, mat(x, 2.35, -6.8), 0xf3f5f8);
  }
  // hedge + low stone wall along the street
  c.box(WM.hedge, gx + 4, 1.0, 0.8, 0, 0.5 + 0.3, -gz / 2 - 3.3, 0x406a2c);
  c.box(WM.stone, gx + 4, 0.6, 0.35, 0, 0.3, -gz / 2 - 3.85);
  // firewood pile
  c.box(WM.wood, 2.4, 1.0, 0.6, 9, 0.5, -gz / 2 - 2.4, 0x7d5a38);
  // flags
  for (const [x, col] of [[10.5, 'bg'], [12, 'green']]) {
    c.box(WM.metal, 0.06, 6, 0.06, x, 3, -gz / 2 - 2.2);
    const fg = new THREE.PlaneGeometry(1.2, 0.8);
    const fm = col === 'bg' ? new THREE.MeshStandardMaterial({ map: TX.flagBG(), side: THREE.DoubleSide, roughness: 0.8 }) : WM.fabric;
    c.add(fm, fg, mat(x + 0.62, 5.5, -gz / 2 - 2.2, 0, 0.3), col === 'bg' ? undefined : 0x2e7d32);
  }
  reg.colliders?.push({ M: M.clone().multiply(mat(0, 0, zb)), hl: L / 2, hd: D / 2 });
}

/** Borovo: covered market pavilion with a row of kiosks under a steel canopy (numbered 1618). */
export function kioskPavilion(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const L = 26, D = 7.5, H = 3.6;
  for (let i = 0; i <= 5; i++) for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) c.box(WM.metal, 0.14, H, 0.14, -L / 2 + (i * L) / 5, H / 2, z, 0x8d9398);
  for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) c.box(WM.metal, L, 0.18, 0.2, 0, H, z, 0x8d9398);
  // pitched corrugated roof
  for (const s of [-1, 1]) {
    const r = new THREE.PlaneGeometry(L + 0.8, D / 2 + 0.7, 40, 1);
    const p = r.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 12) * 0.02);
    r.computeVertexNormals();
    r.rotateX(-Math.PI / 2 + s * 0.2);
    const rm = WM.metal.clone(); rm.side = THREE.DoubleSide;
    c.add(rm, r, mat(0, H + 0.45, s * (D / 4 + 0.1)), 0xb0b5b8);
  }
  // kiosks
  const cols = [0x2a4f8e, 0x2a4f8e, 0xb22222, 0x2a4f8e, 0x3a6f3a, 0x2a4f8e];
  for (let i = 0; i < 6; i++) {
    const x = -L / 2 + 2.3 + i * 4.3;
    c.box(WM.painted, 4.0, 2.7, 3.2, x, 1.35, 0.4, cols[i]);
    const fw = wallGeo(3.4, 1.6, 3.4, 1.6); fw.rotateY(Math.PI);
    c.add(i % 2 ? WM.shopB : WM.shopA, fw, mat(x, 1.35, -1.22));
    c.box(WM.painted, 4.0, 0.08, 0.5, x, 0.95, -1.4, 0xd8d8d8);
  }
  const num = new THREE.PlaneGeometry(1.0, 0.5); num.rotateY(Math.PI / 2);
  c.add(SIGNS.mat, signUV(num, '1618', '#2a4f8e', '#ffffff', 256, 128), mat(L / 2 - 0.25, 2.0, 0.4));
  const sg = new THREE.PlaneGeometry(6, 0.6); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, 'ПАЗАР „БОРОВО“', '#f0f0f0', '#1d4e9e', 1024, 110), mat(0, H - 0.25, -D / 2 + 0.18));
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Old single-storey house with tiled gable roof. */
export function oldHouse(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 9, D = o.D || 7, H = 3.2;
  c.box(WM.plainA, L, H, D, 0, H / 2, 0, o.wall ?? 0xd8c9b0);
  const r = new THREE.CylinderGeometry(0.01, (D / 2 + 0.6) * 1.414, 2.2, 4, 1, true); r.rotateY(Math.PI / 4); r.scale((L + 1) / (D + 1.2), 1, 1);
  const rm = WM.roofTiles.clone(); rm.side = THREE.DoubleSide;
  c.add(rm, r, mat(0, H + 1.1, 0));
  for (let k = 0; k < 3; k++) {
    c.box(WM.glassDark, 1.1, 1.3, 0.08, -L / 2 + 1.8 + k * 2.8, 1.7, -D / 2 - 0.02);
    c.box(WM.painted, 1.3, 0.08, 0.18, -L / 2 + 1.8 + k * 2.8, 1.0, -D / 2 - 0.06, 0xf0f0ea);
  }
  c.box(WM.plainA, 0.6, 1.4, 0.6, L / 4, H + 1.6, 0, 0xa89a88);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Utility building (white, flat roof). */
export function utilityBox(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 10, D = o.D || 6.5, H = 3.3;
  c.box(WM.plainA, L, H, D, 0, H / 2, 0, 0xf2f2ef);
  c.box(WM.plainA, L + 0.3, 0.3, D + 0.3, 0, H + 0.15, 0, 0xe0e0dc);
  c.box(WM.metalDark, 1.1, 2.2, 0.08, -2, 1.1, -D / 2 - 0.02, 0x707a80);
  c.box(WM.metalDark, 1.1, 2.2, 0.08, 1, 1.1, -D / 2 - 0.02, 0x707a80);
  c.box(WM.painted, 2.2, 1.0, 0.05, L / 2 - 1.6, 1.9, -D / 2 - 0.02, 0xd9423a);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Market stalls with awnings and produce crates. */
export function marketStalls(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const n = o.n || 6;
  const aw = [0xc0392b, 0x2e7d32, 0xf1c40f, 0x1565c0, 0xe67e22, 0x8e44ad];
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * 3.4) / 2 + i * 3.4;
    c.box(WM.wood, 3.0, 0.9, 1.2, x, 0.45, 0, 0x9a6b40);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.5, 1.4]) c.box(WM.metal, 0.06, 2.4, 0.06, x + sx, 1.2, sz);
    const a = new THREE.PlaneGeometry(3.2, 2.3); a.rotateX(-Math.PI / 2 - 0.25);
    c.add(WM.fabric, a, mat(x, 2.35, 0.45), aw[i % aw.length]);
    for (let k = 0; k < 5; k++) {
      c.box(WM.wood, 0.5, 0.2, 0.36, x - 1.1 + k * 0.55, 1.0, -0.2, 0xb08a5a);
      c.box(WM.painted, 0.44, 0.1, 0.3, x - 1.1 + k * 0.55, 1.13, -0.2, pick([0xd62d20, 0xf4a300, 0x3c8d2f, 0x7b2d8b, 0xffe135, 0xe06c1f]));
    }
    reg.sellers?.push({ p: c.world(x, 0, 0.9), yaw: c.worldYaw(Math.PI) });
  }
  reg.colliders?.push({ M, hl: (n * 3.4) / 2, hd: 1.2 });
}

/** Children's playground with slide, swings, climbing tower, sandbox. Returns swing anchors. */
export function playground(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 22, D = o.D || 16;
  const surf = new THREE.PlaneGeometry(W, D); surf.rotateX(-Math.PI / 2); boxUVm(surf, 3);
  c.add(WM.rubber, surf, mat(0, 0.03, 0));
  // low fence
  for (const [x, z, w, d] of [[0, -D / 2, W, 0.05], [0, D / 2, W, 0.05], [-W / 2, 0, 0.05, D], [W / 2, 0, 0.05, D]]) {
    c.box(WM.painted, w, 0.05, d, x, 0.9, z, 0x2e7d32);
    c.box(WM.painted, w, 0.05, d, x, 0.2, z, 0x2e7d32);
  }
  for (let x = -W / 2; x <= W / 2; x += 2) { c.box(WM.painted, 0.06, 0.95, 0.06, x, 0.47, -D / 2, 0x2e7d32); c.box(WM.painted, 0.06, 0.95, 0.06, x, 0.47, D / 2, 0x2e7d32); }
  // climbing tower with roof + slide
  const tx = -5, tz = 2;
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.9, 0.9]) c.box(WM.painted, 0.12, 3.2, 0.12, tx + sx, 1.6, tz + sz, 0x1565c0);
  c.box(WM.wood, 2, 0.1, 2, tx, 1.5, tz, 0xa5754a);
  const roof = new THREE.ConeGeometry(1.7, 1.1, 4); roof.rotateY(Math.PI / 4);
  c.add(WM.painted, roof, mat(tx, 3.7, tz), 0xd32f2f);
  for (let k = 0; k < 5; k++) c.box(WM.painted, 1.6, 0.05, 0.05, tx, 0.3 + k * 0.3, tz + 1.0, 0xffc107);
  const slide = new THREE.PlaneGeometry(0.7, 3.4); slide.rotateX(-Math.PI / 2 + 0.47);
  c.add(WM.plastic, slide, mat(tx + 2.4, 0.8, tz), 0xffb300);
  for (const s of [-1, 1]) c.box(WM.plastic, 0.06, 0.25, 3.2, tx + 2.4 + s * 0.36, 0.95, tz, 0xff8f00, 0);
  // swings (two seats) — frame
  const sx0 = 4, sz0 = -3;
  for (const s of [-1, 1]) {
    c.add(WM.painted, tubePath([[sx0 - 1.8, 0, sz0 + s * 0.9], [sx0 - 1.8, 2.6, sz0], [sx0 - 1.8, 0, sz0 - s * 0.9]], 0.05, 0.1), null, 0xe65100);
  }
  for (const s of [-1, 1]) c.add(WM.painted, tubePath([[sx0 + 1.8, 0, sz0 + s * 0.9], [sx0 + 1.8, 2.6, sz0], [sx0 + 1.8, 0, sz0 - s * 0.9]], 0.05, 0.1), null, 0xe65100);
  c.add(WM.painted, tubePath([[sx0 - 1.8, 2.6, sz0], [sx0 + 1.8, 2.6, sz0]], 0.055), null, 0xe65100);
  const swings = [c.world(sx0 - 0.8, 2.6, sz0), c.world(sx0 + 0.8, 2.6, sz0)];
  // sandbox
  c.box(WM.wood, 3.2, 0.3, 0.15, -3, 0.15, -5, 0xa5754a); c.box(WM.wood, 3.2, 0.3, 0.15, -3, 0.15, -2, 0xa5754a);
  c.box(WM.wood, 0.15, 0.3, 3, -4.55, 0.15, -3.5, 0xa5754a); c.box(WM.wood, 0.15, 0.3, 3, -1.45, 0.15, -3.5, 0xa5754a);
  c.box(WM.dirt, 3, 0.2, 2.9, -3, 0.1, -3.5, 0xe8d8a8);
  // spring riders
  for (const [x, z, col] of [[7, 4, 0x43a047], [8.5, 5.5, 0xfdd835]]) { c.box(WM.metal, 0.08, 0.5, 0.08, x, 0.25, z); c.add(WM.plastic, roundedBox(0.8, 0.45, 0.3, 0.12), mat(x, 0.7, z), col); }
  // benches
  for (const x of [-8, 0, 8]) bench(c, x, D / 2 - 1, 0);
  reg.colliders?.push({ M, hl: W / 2, hd: D / 2, soft: true });
  return { swings, slideTop: c.world(tx + 1.1, 1.55, tz), slideBottom: c.world(tx + 4, 0.1, tz), area: { c: c.world(0, 0, 0), W, D } };
}

export function bench(c, x, z, ry) {
  const m = mat(x, 0, z, 0, ry);
  const g1 = new THREE.BoxGeometry(1.8, 0.06, 0.42); c.add(WM.wood, g1, m.clone().multiply(mat(0, 0.45, 0)), 0x8a5a36);
  const g2 = new THREE.BoxGeometry(1.8, 0.4, 0.05); c.add(WM.wood, g2, m.clone().multiply(mat(0, 0.75, 0.2, -0.15)), 0x8a5a36);
  for (const s of [-0.8, 0.8]) c.add(WM.metalDark, new THREE.BoxGeometry(0.06, 0.45, 0.4), m.clone().multiply(mat(s, 0.22, 0)));
}

/** Glass bus shelter with bench and backlit ad panel. Front faces local -z (towards the road). */
export function busShelter(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 4.2, D = 1.5, H = 2.5;
  for (const sx of [-L / 2, L / 2]) for (const sz of [-D / 2, D / 2]) c.box(WM.metal, 0.08, H, 0.08, sx, H / 2, sz, 0xa9aeb3);
  c.box(WM.metal, L + 0.3, 0.12, D + 0.4, 0, H + 0.05, 0, 0x9aa0a6);
  c.box(WM.glass, L, H - 0.3, 0.02, 0, H / 2 + 0.1, D / 2);
  c.box(WM.glass, 0.02, H - 0.3, D, -L / 2, H / 2 + 0.1, 0);
  c.box(WM.metalDark, 1.2, 1.9, 0.18, L / 2 - 0.1, 1.2, 0.2);
  const ad = new THREE.PlaneGeometry(1.08, 1.75); ad.rotateY(Math.PI / 2);
  c.add(SIGNS.mat, signUV(ad, ['СОФИЯ', 'обича', 'градския', 'транспорт'], '#0f6db3', '#ffffff', 256, 400), mat(L / 2 + 0.0, 1.2, 0.2));
  bench(c, -0.4, D / 2 - 0.35, 0);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2, soft: true });
}
