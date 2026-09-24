// Landmark buildings and street furniture of the tram line 7 corridor (бул. България / бул. Витоша area).
// Local frame as in buildings.js: front facade at z = −D/2 facing −z (towards the street), length along x.
import * as THREE from 'three';
import { WM } from './materials.js';
import { Ctx, wallGeo, boxUVm, signUV, SIGNS, bench } from './buildings.js';
import { mat, R, rr, pick, chance, tubePath, roundedBox } from '../util.js';
import * as TX from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Straight member (box) between two local points. */
function strut(c, material, a, b, t = 0.3, col) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.BoxGeometry(t, L, t);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1));
  c.add(material, g, m, col);
}
/** Box volume with the same curtain material on all four sides + roof. */
function glassBox(c, material, x, z, W, D, y0, H, tile = 12, roofCol = 0x8d9296) {
  for (const [w, ry, px, pz] of [[W, Math.PI, x, z - D / 2], [W, 0, x, z + D / 2], [D, Math.PI / 2, x + W / 2, z], [D, -Math.PI / 2, x - W / 2, z]]) {
    const g = wallGeo(w, H, tile, tile, px * 0.37); g.rotateY(ry); c.add(material, g, mat(px, y0 + H / 2, pz));
  }
  const r = new THREE.PlaneGeometry(W, D); r.rotateX(-Math.PI / 2); c.add(WM.flatRoof, r, mat(x, y0 + H, z), roofCol);
}
function sign(c, text, bg, fg, w, h, x, y, z, ry = Math.PI, extra = {}) {
  const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry);
  c.add(SIGNS.mat, signUV(g, text, bg, fg, 1024, Math.max(96, Math.round(1024 * h / w)), extra), mat(x, y, z));
}
function flag(c, x, z, col, H = 8, stripes = null) {
  c.add(WM.metal, new THREE.CylinderGeometry(0.05, 0.06, H, 8), mat(x, H / 2, z), 0xdfe2e4);
  if (stripes) stripes.forEach((sc, i) => c.box(WM.fabric, 0.02, 2.4, 0.9 / stripes.length, x, H - 1.5, z - 0.45 + (i + 0.5) * 0.9 / stripes.length, sc));
  else c.box(WM.fabric, 0.02, 2.6, 0.9, x, H - 1.6, z + 0.46, col);
}

/* =================================================================================== */
/** Millennium Sofia: podium with white fins and entrance canopy, hotel tower with a white zig-zag
 *  exoskeleton, glazed shoulder with a diamond lattice and a second residential tower. ~90 m. */
export function millennium(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const L = 74, D = 36, HP = 15;
  // ---- podium ----
  const back = wallGeo(L, HP, 12, 12); c.add(WM.curtainOffice, back, mat(0, HP / 2, D / 2));
  for (const s of [-1, 1]) { const e = wallGeo(D, HP, 12, 12); e.rotateY(s * Math.PI / 2); c.add(WM.curtainOffice, e, mat(s * L / 2, HP / 2, 0)); }
  const fg = wallGeo(L, HP - 4.6, 12, 12); fg.rotateY(Math.PI); c.add(WM.curtainBlue, fg, mat(0, 4.6 + (HP - 4.6) / 2, -D / 2 + 0.8));
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, HP, 0));
  // ground floor: white stone piers, glazing, shop signs
  const gf = wallGeo(L, 4.6, 5.6, 2.8); gf.rotateY(Math.PI); c.add(WM.shopA, gf, mat(0, 2.3, -D / 2 + 1.6));
  for (let x = -L / 2 + 1; x <= L / 2 - 0.5; x += 6.2) c.box(WM.plainA, 1.5, 4.6, 1.2, x, 2.3, -D / 2 + 0.9, 0xf0ede6);
  c.box(WM.plainA, L, 0.5, 1.4, 0, 4.85, -D / 2 + 0.9, 0xeceae4);
  // left: ribbed white wall (ballroom block)
  for (let x = -L / 2 + 0.3; x < -L / 2 + 16; x += 0.75) c.box(WM.painted, 0.3, HP - 4.6, 0.5, x, 4.6 + (HP - 4.6) / 2, -D / 2 + 0.55, 0xdde0e2);
  // right: white vertical fins in front of the blue glass
  for (let x = -L / 2 + 20; x < L / 2; x += 1.05) c.box(WM.painted, 0.22, HP - 4.6, 1.0, x, 4.6 + (HP - 4.6) / 2, -D / 2 + 0.2, 0xf2f3f3);
  // entrance canopy with the hotel name + inclined white V columns
  const ex = -L / 2 + 23;
  c.box(WM.painted, 14, 0.55, 6.5, ex, 5.0, -D / 2 - 2.4, 0xf4f4f2);
  c.box(WM.glass, 13.6, 0.05, 6.1, ex, 5.3, -D / 2 - 2.4);
  sign(c, 'MILLENNIUM SOFIA', '#f4f4f2', '#1d2f8f', 11, 0.5, ex, 5.0, -D / 2 - 5.67, Math.PI, { weight: 600 });
  sign(c, 'GRAND HOTEL', '#f4f4f2', '#34409a', 3.2, 0.45, ex + 7.05, 5.0, -D / 2 - 2.4, -Math.PI / 2, { weight: 500 });
  for (const s of [-1, 1]) { strut(c, WM.plainA, V(ex + s * 3.5, 0, -D / 2 - 4.6), V(ex + s * 1.8, 4.8, -D / 2 - 4.2), 0.55, 0xf1efe9); strut(c, WM.plainA, V(ex + s * 0.2, 0, -D / 2 - 4.0), V(ex + s * 1.8, 4.8, -D / 2 - 4.2), 0.55, 0xf1efe9); }
  // hotel logo disc on the glass
  const lg = new THREE.CircleGeometry(0.9, 24); lg.rotateY(Math.PI); c.add(WM.painted, lg, mat(ex + 3.5, 2.6, -D / 2 + 1.55), 0x3e4aa6);
  for (const [k, col] of [[0, 0x5a3e9e], [1, null], [2, 0x234a9e]]) {
    const fx = ex + 8.5 + k * 1.2, fz = -D / 2 - 1.2;
    if (col) flag(c, fx, fz, col, 9); else flag(c, fx, fz, 0, 9, [0xffffff, 0x00966e, 0xd62612]);
  }
  // restaurants and casino fascia on the right
  const shops = [['OZONE', '#141b35', '#ffffff'], ['T2 GALLERY', '#1d3585', '#ffffff'], ['VIENNA', '#1d3585', '#ffffff'], ['SPECTRUM', '#1d3585', '#ffffff']];
  shops.forEach(([t, bg, fgc], i) => sign(c, t, bg, fgc, 3.4, 1.6, 2 + i * 3.6, 4.0, -D / 2 - 0.02));
  sign(c, ['PALMS · ROYALE | SOFIA', 'CASINO'], '#0e1430', '#e9c46a', 13, 2.2, 23.5, 3.9, -D / 2 - 0.02, Math.PI, { weight: 800 });
  for (const x of [8, 18, 28]) { c.box(WM.painted, 0.3, 0.7, 0.3, x, 0.35, -D / 2 - 3, 0xf28a1b); }
  // ---- glazed shoulder with the diamond lattice ----
  const y0 = HP, HS = 12;
  glassBox(c, WM.curtainBlue, 6, -2, 56, 26, y0, HS);
  const zf = -2 - 13 - 0.6;
  const nodes = [];
  for (let x = -22; x <= 34; x += 8) for (const [y, off] of [[y0 + 0.5, 0], [y0 + 6, 4], [y0 + 11.5, 0]]) nodes.push(V(x + off, y, zf));
  for (const a of nodes) for (const b of nodes) {
    if (b.y <= a.y) continue;
    if (Math.abs(b.y - a.y - 5.5) < 0.1 && Math.abs(Math.abs(b.x - a.x) - 4) < 0.1) strut(c, WM.painted, a, b, 0.26, 0xf0f0ee);
  }
  for (const n of nodes) c.add(WM.painted, new THREE.SphereGeometry(0.45, 10, 8), mat(n.x, n.y, n.z), 0xf2f2f0);
  // ---- hotel tower with the zig-zag exoskeleton ----
  const tx = 10, tz = 0, TW = 26, TD = 20, ty = y0 + HS, TH = 62;
  glassBox(c, WM.curtainBlue, tx, tz, TW, TD, ty, TH);
  const zfr = tz - TD / 2 - 0.7;
  for (const s of [-1, 1]) {
    c.box(WM.painted, 1.1, TH + 4, 1.1, tx + s * 5.5, ty + (TH + 4) / 2, zfr, 0xf2f2f0);
    c.box(WM.painted, 0.5, TH, 0.6, tx + s * (TW / 2 + 0.2), ty + TH / 2, zfr + 0.3, 0xe9ebec); // corner fins
  }
  for (let y = ty + 1; y < ty + TH - 4; y += 7) {
    strut(c, WM.painted, V(tx + 5.5, y, zfr), V(tx - 5.5, y + 3.5, zfr), 0.45, 0xf2f2f0);
    strut(c, WM.painted, V(tx - 5.5, y + 3.5, zfr), V(tx + 5.5, y + 7, zfr), 0.45, 0xf2f2f0);
  }
  for (let y = ty + 3; y < ty + TH; y += 3.3) c.box(WM.painted, 3.2, 0.12, 1.2, tx + TW / 2 - 3, y, zfr + 0.3, 0xd9c7a0); // beige balcony soffits
  c.box(WM.metal, TW - 2, 2.2, TD - 2, tx, ty + TH + 1.1, tz, 0x9aa0a6);
  for (const s of [-1, 1]) c.box(WM.metal, 0.12, 1.4, TD + 1, tx + s * (TW / 2 + 0.3), ty + TH + 0.8, tz, 0xc9cdd1);
  // ---- second tower (left, residential) ----
  const sx = -24, sz = 3, SW = 20, SD = 18, SH = 58;
  glassBox(c, WM.curtainBlue, sx, sz, SW, SD, y0, SH);
  for (let y = y0 + 3.2; y < y0 + SH; y += 3.2) {
    c.box(WM.painted, SW + 0.8, 0.22, 0.9, sx, y, sz - SD / 2 - 0.4, 0xf1f1ef);
    c.box(WM.painted, 6, 0.1, 0.8, sx + SW / 2 - 4, y - 0.12, sz - SD / 2 - 0.4, 0xd9c7a0);
  }
  for (const s of [-1, 1]) c.box(WM.painted, 1.4, SH + 2, 1.4, sx + s * (SW / 2 + 0.2), y0 + (SH + 2) / 2, sz - SD / 2 - 0.2, 0xf2f2f0);
  c.box(WM.metal, 0.12, 8, 0.12, sx + 4, y0 + SH + 4, sz);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D };
}

/** ОББ office tower: white piers, glass bands, roof crown with the bank logo. */
export function obbTower(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const W = 26, D = 22, H = 82;
  glassBox(c, WM.curtainOffice, 0, 0, W, D, 0, H);
  for (const s of [-1, 1]) for (const f of [-1, 1]) c.box(WM.painted, 1.6, H + 3, 1.6, s * (W / 2 - 0.6), (H + 3) / 2, f * (D / 2 - 0.6), 0xeeefee);
  for (let y = 4.5; y < H; y += 3.4) { c.box(WM.painted, W + 0.4, 0.3, 0.5, 0, y, -D / 2 - 0.15, 0xe7e9ea); c.box(WM.painted, 0.5, 0.3, D + 0.4, -W / 2 - 0.15, y, 0, 0xe7e9ea); }
  c.box(WM.glassDark, W - 3, 4.4, 0.1, 0, 2.2, -D / 2 - 0.1);
  c.box(WM.metal, W - 4, 4, D - 4, 0, H + 2, 0, 0xb9bdc1);
  // crown with sign
  sign(c, 'ОББ', '#ffffff', '#1a4ea1', 8, 2.6, 0, H + 3.2, -D / 2 - 0.1);
  const lg = new THREE.CircleGeometry(1.1, 20); lg.rotateY(Math.PI); c.add(WM.painted, lg, mat(-5.5, H + 3.2, -D / 2 - 0.12), 0x1a4ea1);
  c.box(WM.metal, 0.2, 10, 0.2, 6, H + 9, 3);
  reg.colliders?.push({ M, hl: W / 2, hd: D / 2 });
}

/** bTV Media Group tower (former office tower on бул. Витоша): stepped floor slabs, ribbon windows, roof frame + sign. */
export function btvTower(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const W = 34, D = 17, fl = 14, fh = 3.3, H = fl * fh;
  // recessed ground floor
  c.box(WM.glassDark, W - 4, 3.6, D - 4, 0, 1.8, 0);
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 5) c.box(WM.concrete, 0.8, 3.6, 0.8, x, 1.8, -D / 2 + 2, 0xb8ae9a);
  for (let f = 1; f < fl; f++) {
    const y = f * fh + 0.3, grow = f < 3 ? 0 : 0.35;
    // slab band (beige concrete) + recessed ribbon glass
    c.box(WM.concrete, W + grow * 2, 0.95, D + grow * 2, 0, y + 0.47, 0, 0xc8b99c);
    const rg = wallGeo(W, fh - 0.95, 8, 8); rg.rotateY(Math.PI); c.add(WM.ribbonOld, rg, mat(0, y + 0.95 + (fh - 0.95) / 2, -D / 2 + 0.3));
    const rb = wallGeo(W, fh - 0.95, 8, 8); c.add(WM.ribbonOld, rb, mat(0, y + 0.95 + (fh - 0.95) / 2, D / 2 - 0.3));
    for (const s of [-1, 1]) { const e = wallGeo(D - 0.6, fh - 0.95, 8, 8); e.rotateY(s * Math.PI / 2); c.add(WM.ribbonOld, e, mat(s * (W / 2 - 0.3), y + 0.95 + (fh - 0.95) / 2, 0)); }
    // AC units hanging under the windows
    for (let k = 0; k < 6; k++) if (chance(0.5)) c.box(WM.metal, 0.8, 0.5, 0.35, rr(-W / 2 + 2, W / 2 - 2), y + 1.2, -D / 2 - 0.1, 0xe4e6e5);
  }
  c.box(WM.concrete, W + 0.7, 0.8, D + 0.7, 0, H + 0.7, 0, 0xc8b99c);
  const roof = new THREE.PlaneGeometry(W, D); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, H + 1.1, 0));
  // roof steel frame (open lattice) and antennas
  for (const s of [-1, 1]) for (const f of [-1, 1]) c.box(WM.metalDark, 0.25, 4.5, 0.25, s * (W / 2 - 0.5), H + 3.3, f * (D / 2 - 0.5));
  for (const y of [H + 3.2, H + 5.4]) { c.box(WM.metalDark, W, 0.2, 0.2, 0, y, -D / 2 + 0.5); c.box(WM.metalDark, W, 0.2, 0.2, 0, y, D / 2 - 0.5); c.box(WM.metalDark, 0.2, 0.2, D, -W / 2 + 0.5, y, 0); c.box(WM.metalDark, 0.2, 0.2, D, W / 2 - 0.5, y, 0); }
  for (let x = -W / 2 + 1; x < W / 2; x += 3) strut(c, WM.metalDark, V(x, H + 1.1, -D / 2 + 0.5), V(x + 3, H + 5.4, -D / 2 + 0.5), 0.12);
  for (let k = 0; k < 7; k++) c.box(WM.metal, 0.08, rr(2, 5), 0.08, rr(-W / 2 + 2, W / 2 - 2), H + 4, rr(-D / 2 + 2, D / 2 - 2));
  // sign: "b" boxes + Media Group
  for (const [x, ry, z] of [[-W / 2 + 4, Math.PI, -D / 2 + 0.3], [-W / 2 + 0.3, -Math.PI / 2, -D / 2 + 4]]) {
    const g = new THREE.PlaneGeometry(3.6, 4.2); g.rotateY(ry);
    c.add(SIGNS.mat, signUV(g, 'b', '#1e3a78', '#ffffff', 256, 300, { weight: 800 }), mat(x + (ry === Math.PI ? 0 : -0.05), H + 6.2, z + (ry === Math.PI ? -0.05 : 0)));
  }
  sign(c, 'Media Group', '#ffffff', '#1e3a78', 11, 1.4, 5, H + 5.9, -D / 2 + 0.25, Math.PI, { weight: 600 });
  reg.colliders?.push({ M, hl: W / 2, hd: D / 2 });
}

/** Curved 6-storey office with white bands, dark glass ribbons and an orange end fin (next to the tram curve). */
export function curvedOffice(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const Rr = o.R || 42, ang = o.ang || 1.1, fl = o.floors || 6, fh = 3.4, H = fl * fh, D = 14;
  const n = 22;
  for (let k = 0; k < n; k++) {
    const a0 = -ang / 2 + (k / n) * ang, a1 = -ang / 2 + ((k + 1) / n) * ang, am = (a0 + a1) / 2;
    const w = 2 * Rr * Math.sin((a1 - a0) / 2) + 0.05;
    const x = Math.sin(am) * Rr, z = Rr - Math.cos(am) * Rr;
    const m = mat(x, 0, z - D / 2, 0, -am);
    for (let f = 0; f < fl; f++) {
      const y = f * fh;
      c.add(WM.painted, new THREE.BoxGeometry(w, 1.1, 0.6), m.clone().multiply(mat(0, y + 0.55, 0)), 0xf1f1ef);
      const g = wallGeo(w, fh - 1.1, 4, 4, k * w); g.rotateY(Math.PI);
      c.add(WM.curtainDark, g, m.clone().multiply(mat(0, y + 1.1 + (fh - 1.1) / 2, 0.25)));
      if (chance(0.12) && f > 0) c.add(WM.painted, new THREE.PlaneGeometry(0.8, 0.8).rotateY(Math.PI), m.clone().multiply(mat(rr(-0.3, 0.3), y + 2.2, 0.2)), 0xd03a2a);
    }
    c.add(WM.painted, new THREE.BoxGeometry(w, 0.6, D), m.clone().multiply(mat(0, H + 0.3, D / 2)), 0xe9e9e6);
    c.add(WM.plainA, new THREE.BoxGeometry(w, H, 0.3), m.clone().multiply(mat(0, H / 2, D)), 0xe9e9e6);
  }
  const ex = Math.sin(ang / 2) * Rr, ez = Rr - Math.cos(ang / 2) * Rr - D / 2;
  c.add(WM.painted, new THREE.BoxGeometry(0.6, H + 1, D), mat(ex, (H + 1) / 2, ez + D / 2, 0, -ang / 2), 0xe8641b);
  c.add(WM.painted, new THREE.BoxGeometry(0.6, H + 1, D), mat(-ex, (H + 1) / 2, ez + D / 2, 0, ang / 2), 0xf1f1ef);
  reg.colliders?.push({ M: M.clone().multiply(mat(0, 0, 2)), hl: ex, hd: D / 2 + 2 });
}

/** СОТ 161 office: convex curved glass facade with a rooftop sign. */
export function sot161(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const Rr = 36, ang = 1.15, H = 22, D = 16, n = 20;
  for (let k = 0; k < n; k++) {
    const a0 = -ang / 2 + (k / n) * ang, a1 = -ang / 2 + ((k + 1) / n) * ang, am = (a0 + a1) / 2;
    const w = 2 * Rr * Math.sin((a1 - a0) / 2) + 0.05;
    const x = Math.sin(am) * Rr, z = -(Math.cos(am) * Rr - Rr * Math.cos(ang / 2)) - D / 2;
    const g = wallGeo(w, H, 12, 12, k * w); g.rotateY(Math.PI);
    c.add(WM.curtainOffice, g, mat(x, H / 2, z, 0, -am));
    c.add(WM.painted, new THREE.BoxGeometry(w, 0.5, D + 2), mat(x, H + 0.25, z + D / 2 + 1, 0, -am), 0xd9dcde);
  }
  const hw = Math.sin(ang / 2) * Rr;
  c.box(WM.plainA, hw * 2, H, D, 0, H / 2, D / 2 - 1, 0xd9d4ca);
  // sign on roof
  c.box(WM.metalDark, 14, 0.25, 0.25, 0, H + 0.6, -D / 2 - 2);
  sign(c, 'СОТ 161', '#ffffff', '#c41e2a', 13, 2.3, 0, H + 1.9, -D / 2 - 2.1, Math.PI, { weight: 800 });
  reg.colliders?.push({ M, hl: hw, hd: D / 2 + 3 });
}

/** Dark-glass tower with a curved front and a sloped sail roof (Кит/"КРИТ" building). */
export function darkTower(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const W = 20, D = 18, H = 44;
  glassBox(c, WM.curtainDark, 0, 2, W, D, 0, H);
  // curved front stack
  for (let y = 0; y < H - 4; y += 3.4) {
    const cyl = new THREE.CylinderGeometry(8, 8, 3.0, 28, 1, true, Math.PI / 2, Math.PI); c.add(WM.curtainDark, cyl, mat(-3, y + 1.5, -D / 2 + 2));
    const band = new THREE.CylinderGeometry(8.25, 8.25, 0.4, 28, 1, true, Math.PI / 2, Math.PI); c.add(WM.metalDark, band, mat(-3, y + 3.2, -D / 2 + 2), 0x2d3136);
  }
  // sail
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([W / 2, H, -D / 2 + 2, W / 2, H, D / 2 + 2, W / 2 - 2, H + 12, D / 2 + 2, W / 2, H, -D / 2 + 2, W / 2 - 2, H + 12, D / 2 + 2, W / 2 - 2, H + 9, -D / 2 + 2], 3));
  sail.computeVertexNormals();
  c.add(WM.curtainDark, sail);
  const s2 = sail.clone(); s2.scale(-1, 1, 1); s2.translate(W - 4, 0, 0); c.add(WM.curtainDark, s2);
  // vertical sign
  const g = new THREE.PlaneGeometry(1.4, 7); g.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(g, 'КРИТ', '#1b1f24', '#ffffff', 120, 600, { weight: 800 }), mat(-W / 2 - 0.1, H - 8, -D / 2 + 2.1));
  c.box(WM.metal, 0.25, 7, 0.25, 4, H + 12, 4);
  reg.colliders?.push({ M, hl: W / 2, hd: D / 2 + 2 });
}

/** KPMG round glass tower with an outer ring of columns, louvre bands and a steel crown. */
export function kpmgTower(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const Rr = 13, fl = 11, fh = 3.5, H = fl * fh;
  const cyl = new THREE.CylinderGeometry(Rr, Rr, H, 40, 1, true);
  const uv = cyl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * H / 12);
  c.add(WM.curtainBlue, cyl, mat(0, H / 2, 0));
  const top = new THREE.CircleGeometry(Rr, 40); top.rotateX(-Math.PI / 2); c.add(WM.flatRoof, top, mat(0, H, 0));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    c.box(WM.concrete, 0.9, H + 5, 0.9, Math.cos(a) * (Rr + 1.5), (H + 5) / 2, Math.sin(a) * (Rr + 1.5), 0xdcdcd6);
  }
  for (let f = 7; f <= fl; f++) {
    const ring = new THREE.CylinderGeometry(Rr + 1.0, Rr + 1.0, 0.25, 40, 1, true); c.add(WM.metal, ring, mat(0, f * fh - 0.2, 0), 0xc9cdd1);
    const ring2 = new THREE.CylinderGeometry(Rr + 1.0, Rr + 1.0, 0.1, 40, 1, true); c.add(WM.metal, ring2, mat(0, f * fh - 1.0, 0), 0xc9cdd1);
  }
  for (let f = 1; f < fl; f++) { const sl = new THREE.CylinderGeometry(Rr + 0.3, Rr + 0.3, 0.3, 40, 1, true); c.add(WM.painted, sl, mat(0, f * fh, 0), 0xe8eaec); }
  // crown
  for (const [r, y] of [[Rr - 1, H + 5], [Rr - 1, H + 9], [Rr - 4, H + 11]]) { const t = new THREE.TorusGeometry(r, 0.18, 6, 40); t.rotateX(Math.PI / 2); c.add(WM.metal, t, mat(0, y, 0), 0xd9dcdf); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; strut(c, WM.metal, V(Math.cos(a) * (Rr - 1), H + 5, Math.sin(a) * (Rr - 1)), V(Math.cos(a) * (Rr - 4), H + 11, Math.sin(a) * (Rr - 4)), 0.12, 0xd9dcdf); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; strut(c, WM.metal, V(Math.cos(a) * (Rr - 1), H + 9, Math.sin(a) * (Rr - 1)), V(Math.cos(a) * (Rr + 1.5), H + 10, Math.sin(a) * (Rr + 1.5)), 0.08, 0xd9dcdf); }
  c.box(WM.metal, 0.4, 16, 0.4, 0, H + 13, 0, 0xc9cdd1);
  // sign
  const g = new THREE.PlaneGeometry(7, 2.4); g.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(g, 'KPMG', '#1f3fa6', '#ffffff', 700, 240, { weight: 900 }), mat(0, H - 6, -Rr - 2.3));
  reg.colliders?.push({ M, hl: Rr + 2, hd: Rr + 2 });
}

/** Petrol station canopy + pumps + shop. brand: 'shell' | 'eko'. */
export function petrolStation(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const brand = o.brand || 'shell';
  const W = o.W || 24, D = o.D || 15, Hc = 5.4;
  // forecourt
  const fc = new THREE.PlaneGeometry(W + 12, D + 14); fc.rotateX(-Math.PI / 2); c.add(WM.concrete, fc, mat(0, 0.02, 0), 0xb8b6b0);
  // canopy
  c.box(WM.painted, W, 0.25, D, 0, Hc - 0.35, 0, 0xf2f2f0);
  const fascia = (col, y, h) => {
    c.box(WM.painted, W + 0.2, h, 0.2, 0, y, -D / 2, col); c.box(WM.painted, W + 0.2, h, 0.2, 0, y, D / 2, col);
    c.box(WM.painted, 0.2, h, D, -W / 2, y, 0, col); c.box(WM.painted, 0.2, h, D, W / 2, y, 0, col);
  };
  if (brand === 'shell') { fascia(0xf7c600, Hc + 0.05, 0.55); fascia(0xdd1d21, Hc + 0.6, 0.55); }
  else { fascia(0xd51f26, Hc + 0.25, 1.0); fascia(0xffffff, Hc - 0.28, 0.12); }
  // soffit LED panels
  for (let x = -W / 2 + 3; x < W / 2 - 1; x += 4) for (let z = -D / 2 + 3; z < D / 2 - 1; z += 4) c.box(WM.emissive, 1.2, 0.02, 1.2, x, Hc - 0.49, z, 0x9a9a9a);
  // columns + pump islands
  for (const x of [-W / 3, 0, W / 3]) {
    for (const z of [-D / 4, D / 4]) c.box(WM.painted, 0.45, Hc - 0.5, 0.45, x, (Hc - 0.5) / 2, z, brand === 'shell' ? 0xf2f2f0 : 0x8f9396);
    c.box(WM.concrete, 1.2, 0.2, 7, x, 0.1, 0, 0xd6d4ce);
    for (const z of [-2, 2]) {
      c.box(WM.painted, 0.8, 1.9, 0.5, x, 1.15, z, brand === 'shell' ? 0xf2f2f0 : 0xf4f4f4);
      c.box(WM.painted, 0.82, 0.35, 0.52, x, 2.0, z, brand === 'shell' ? 0xdd1d21 : 0xd51f26);
      c.box(WM.glassDark, 0.5, 0.35, 0.02, x, 1.45, z - 0.26);
      c.box(WM.metalDark, 0.08, 0.6, 0.08, x + 0.45, 1.0, z);
    }
  }
  // brand badge on the canopy corner
  if (brand === 'shell') {
    const g = new THREE.CircleGeometry(1.1, 20, 0, Math.PI); g.rotateY(Math.PI); c.add(WM.painted, g, mat(-W / 2 + 2, Hc + 0.1, -D / 2 - 0.12), 0xf7c600);
  } else {
    sign(c, 'EKO', '#ffffff', '#1f3f8e', 3.6, 1.0, W / 2 - 3, Hc + 0.25, -D / 2 - 0.12, Math.PI, { weight: 900 });
  }
  // shop
  const sx = o.shopX ?? W / 2 + 9, sz = o.shopZ ?? 4;
  const SW = 16, SD = 10, SH = 4.2;
  c.box(WM.plainA, SW, SH, SD, sx, SH / 2, sz, brand === 'shell' ? 0xf2f2ef : 0x5a5e62);
  const sf = wallGeo(SW - 2, SH - 1.2, 5.6, 2.8); sf.rotateY(Math.PI); c.add(WM.shopA, sf, mat(sx, (SH - 1.2) / 2 + 0.1, sz - SD / 2 - 0.02));
  c.box(WM.painted, SW + 0.2, 0.8, 0.3, sx, SH - 0.2, sz - SD / 2 - 0.1, brand === 'shell' ? 0xdd1d21 : 0x3b3e42);
  if (brand === 'eko') {
    sign(c, 'KFC', '#c8102e', '#ffffff', 2.4, 0.9, sx - 4, SH - 0.2, sz - SD / 2 - 0.3, Math.PI, { weight: 900 });
    sign(c, ['КОФА ЗА ЕДИН', '5,95 лв.'], '#e41f26', '#ffffff', 3.4, 2.2, sx + 4, 1.6, sz - SD / 2 - 0.08, Math.PI, { weight: 800 });
    sign(c, 'café', '#3b3e42', '#e0b98a', 1.8, 0.6, sx + 1, SH - 0.2, sz - SD / 2 - 0.3, Math.PI, { weight: 500 });
  } else {
    sign(c, '07:30-24:00', '#dd1d21', '#ffffff', 2.2, 0.5, sx, 3.0, sz - SD / 2 - 0.05);
  }
  c.box(WM.painted, 3, 2.4, 0.3, sx - SW / 2 - 2.5, 1.2, sz - 2, 0xd9dcde); // air/water machine
  // totem / price pylon
  const tx = o.totemX ?? -W / 2 - 3, tz = o.totemZ ?? -D / 2 - 4, TH = 8;
  if (brand === 'shell') {
    c.box(WM.painted, 1.6, TH, 0.5, tx, TH / 2, tz, 0xf2f2f0);
    c.box(WM.painted, 1.9, 1.9, 0.6, tx, TH - 0.6, tz, 0xdd1d21);
    const sh = new THREE.CircleGeometry(0.75, 20, 0, Math.PI); sh.rotateY(Math.PI); c.add(WM.painted, sh, mat(tx, TH - 0.95, tz - 0.31), 0xf7c600);
    c.box(WM.glassDark, 1.4, 3.2, 0.05, tx, 3.6, tz - 0.26);
  } else {
    c.box(WM.painted, 1.9, TH, 0.6, tx, TH / 2, tz, 0xf3f3f3);
    const g = new THREE.PlaneGeometry(1.8, 2.2); g.rotateY(Math.PI);
    c.add(SIGNS.mat, signUV(g, ['ξ'], '#d51f26', '#ffffff', 256, 300, { weight: 900 }), mat(tx, TH - 1.2, tz - 0.31));
    sign(c, 'EKO', '#ffffff', '#1f3f8e', 1.8, 0.6, tx, TH - 2.7, tz - 0.31, Math.PI, { weight: 900 });
    sign(c, 'ГАРАНЦИЯ', '#f4c20d', '#111111', 1.8, 0.5, tx, TH - 3.35, tz - 0.31, Math.PI, { weight: 800 });
    sign(c, 'KFC', '#c8102e', '#ffffff', 1.8, 0.55, tx, TH - 4.0, tz - 0.31, Math.PI, { weight: 900 });
    sign(c, ['2.67', '3.14', '2.64', '3.09', '1.19'], '#1a1d24', '#f4f4f4', 1.8, 2.6, tx, 2.2, tz - 0.31, Math.PI, { weight: 700, font: TX.FONT_MONO });
    // flags on poles along the road
    for (let k = 0; k < 5; k++) flag(c, tx - 3 - k * 2.2, tz - 1, k % 2 ? 0xffffff : 0xd51f26, 7);
  }
  // planters & cones
  for (let k = 0; k < 3; k++) c.box(WM.hedge, 3, 0.8, 1.4, -W / 2 + 4 + k * 5, 0.4, -D / 2 - 5, 0x4f7f3a);
  for (let k = 0; k < 4; k++) c.add(WM.painted, new THREE.ConeGeometry(0.18, 0.6, 10), mat(-W / 2 + 3 + k * 3.5, 0.32, D / 2 + 3), 0xf06a1a);
  reg.colliders?.push({ M: M.clone().multiply(mat(sx, 0, sz)), hl: SW / 2, hd: SD / 2 });
  for (const x of [-W / 3, 0, W / 3]) reg.colliders?.push({ M: M.clone().multiply(mat(x, 0, 0)), hl: 0.6, hd: 3.5, soft: true });
}

/** T-Market supermarket with red fascia and a big "100%" banner. */
export function tMarket(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 30, D = o.D || 20, H = 6.4;
  c.box(WM.plainA, L, H, D, 0, H / 2, 0, 0xeeeeea);
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, H + 0.01, 0));
  c.box(WM.painted, L + 0.3, 1.6, 0.4, 0, H + 0.4, -D / 2 - 0.2, 0xd52b1e);
  sign(c, 'T MARKET', '#d52b1e', '#ffffff', 10, 1.2, L * 0.18, H + 0.4, -D / 2 - 0.42, Math.PI, { weight: 900 });
  const lg = new THREE.CircleGeometry(0.62, 24); lg.rotateY(Math.PI); c.add(WM.painted, lg, mat(L * 0.18 - 5.8, H + 0.4, -D / 2 - 0.43), 0xf6b21a);
  const sf = wallGeo(L - 8, 3.4, 5.6, 2.8); sf.rotateY(Math.PI); c.add(WM.shopA, sf, mat(3, 1.9, -D / 2 - 0.02));
  sign(c, '07:30-24:00', '#d52b1e', '#ffffff', 2.4, 0.45, 8, 3.8, -D / 2 - 0.04);
  // poster wall
  for (let k = 0; k < 4; k++) { const g = new THREE.PlaneGeometry(1.4, 2); g.rotateY(Math.PI); c.add(WM.posters[k % 6], g, mat(-L / 2 + 2 + k * 1.6, 1.6, -D / 2 - 0.03)); }
  // big red banner on the side
  const bb = new THREE.PlaneGeometry(10, 4.4); bb.rotateY(-Math.PI / 2);
  c.add(SIGNS.mat, signUV(bb, ['100%', 'ПОЛОВИНАТА КЛЮЧОВИ ЧАСТИ'], '#d7261e', '#ffffff', 1024, 450, { weight: 900 }), mat(-L / 2 - 0.05, 3, -2));
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Commercial 2-storey building with a company sign (ПРОТЕХ). */
export function commercialBlock(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 34, D = o.D || 14, H = 8;
  const f = wallGeo(L, H, 9, 9); f.rotateY(Math.PI); c.add(WM.industrialB, f, mat(0, H / 2, -D / 2));
  c.box(WM.plainA, L, H, D - 0.2, 0, H / 2, 0.1, 0xcfd2d4);
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, H + 0.02, 0));
  sign(c, o.sign || 'ПРОТЕХ АД', '#e8e8e8', '#222222', 8, 0.9, -L / 2 + 6, H - 1.5, -D / 2 - 0.05, Math.PI, { weight: 800 });
  c.box(WM.painted, 10, 1.2, 0.2, L / 2 - 8, H - 1.5, -D / 2 - 0.1, 0xc62828);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Professional high school building (4 floors) with the school sign. */
export function designSchool(cb, M, reg) {
  const c = new Ctx(cb, M, reg);
  const L = 62, D = 15, fl = 4, fh = 3.6, H = fl * fh;
  const f = wallGeo(L, H, 7.2, 10.8); f.rotateY(Math.PI); c.add(WM.school, f, mat(0, H / 2, -D / 2));
  const b = wallGeo(L, H, 7.2, 10.8); c.add(WM.school, b, mat(0, H / 2, D / 2));
  for (const s of [-1, 1]) { const e = wallGeo(D, H, 6, 6); e.rotateY(s * Math.PI / 2); c.add(WM.plainA, e, mat(s * L / 2, H / 2, 0), 0xcfc6b4); }
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, H, 0));
  c.box(WM.plainA, L + 0.3, 0.7, D + 0.3, 0, H + 0.35, 0, 0xb7ad99);
  c.box(WM.concrete, 10, 0.3, 4, 0, 3.4, -D / 2 - 2, 0xb3aea4);
  for (const s of [-1, 1]) c.box(WM.concrete, 0.5, 3.4, 0.5, s * 4.6, 1.7, -D / 2 - 3.7, 0xb3aea4);
  c.box(WM.glassDark, 5, 2.8, 0.1, 0, 1.4, -D / 2 - 0.05);
  sign(c, ['ПРОФЕСИОНАЛНА ГИМНАЗИЯ ПО ДИЗАЙН', '„ЕЛИСАВЕТА ВАЗОВА“'], '#f4f1ea', '#2c3e50', 16, 1.6, 0, 4.4, -D / 2 - 0.06, Math.PI, { weight: 800 });
  flag(c, 7, -D / 2 - 3.5, 0, 9, [0xffffff, 0x00966e, 0xd62612]);
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
}

/** Art garden of Южен парк: abstract sculptures on plinths, gravel paths, benches. Returns sculpture spots. */
export function artGarden(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 50, D = o.D || 30;
  const path = new THREE.PlaneGeometry(W, 3); path.rotateX(-Math.PI / 2); c.add(WM.dirt, path, mat(0, 0.03, 0), 0xcab89a);
  const p2 = new THREE.PlaneGeometry(3, D); p2.rotateX(-Math.PI / 2); c.add(WM.dirt, p2, mat(W / 4, 0.03, 0), 0xcab89a);
  const plinth = (x, z, h = 0.8) => c.box(WM.stone, 1.6, h, 1.6, x, h / 2, z, 0xd8d2c4);
  // 1: steel ring
  plinth(-W / 2 + 6, -5); { const t = new THREE.TorusGeometry(1.3, 0.16, 12, 36); c.add(WM.metal, t, mat(-W / 2 + 6, 2.2, -5, 0, 0.6), 0xb9bec2); }
  // 2: stacked offset stone cubes
  plinth(-W / 2 + 14, 6, 0.4); for (let k = 0; k < 4; k++) c.box(WM.stone, 0.9 - k * 0.1, 0.9 - k * 0.1, 0.9 - k * 0.1, -W / 2 + 14 + (k % 2 ? 0.2 : -0.15), 0.85 + k * 0.85, 6 + (k % 2 ? -0.15 : 0.1), 0xbfb6a3, k * 0.5);
  // 3: twisted column
  plinth(-4, -6); for (let k = 0; k < 10; k++) c.box(WM.painted, 0.7, 0.28, 0.7, -4, 0.95 + k * 0.28, -6, 0xb0452c, k * 0.18);
  // 4: bronze arch
  plinth(8, 6, 0.3); c.add(WM.metalDark, tubePath([[7, 0.3, 6], [7.2, 2.2, 6.2], [8.4, 3.2, 6], [9.3, 1.8, 5.8], [9.2, 0.3, 6]], 0.18, 0.4), null, 0x7a5230);
  // 5: mosaic sphere
  plinth(W / 2 - 8, -5, 1.0); c.add(WM.painted, new THREE.IcosahedronGeometry(1.0, 1), mat(W / 2 - 8, 2.0, -5), 0x2f7fb8);
  // 6: figure with open hands (abstract)
  plinth(W / 2 - 16, 7, 0.6); c.add(WM.stone, new THREE.CylinderGeometry(0.3, 0.55, 2.4, 10), mat(W / 2 - 16, 1.8, 7), 0xe5dfd1); c.add(WM.stone, new THREE.SphereGeometry(0.34, 12, 10), mat(W / 2 - 16, 3.2, 7), 0xe5dfd1);
  const bc = { add: (m, g, lm, col) => c.add(m, g, lm, col) };
  for (const [x, z, ry] of [[-W / 2 + 10, 1.9, 0], [2, 1.9, 0], [W / 2 - 12, -1.9, Math.PI]]) { bench(bc, x, z, ry); reg.benches?.push({ p: c.world(x, 0.02, z), yaw: c.worldYaw(ry + Math.PI) }); }
  sign(c, 'ГРАДИНА НА ИЗКУСТВАТА', '#4b3a2a', '#f3e6c9', 4, 0.6, -W / 2 + 2, 1.5, -1.8, Math.PI, { weight: 700 });
  c.box(WM.wood, 0.1, 1.2, 0.1, -W / 2 + 0.3, 0.6, -1.8, 0x5b3c24); c.box(WM.wood, 0.1, 1.2, 0.1, -W / 2 + 3.7, 0.6, -1.8, 0x5b3c24);
}

/** Colourful bedding-plant parterre of Южен парк (flat wave-shaped beds). */
export function flowerParterre(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 60, D = o.D || 16;
  const cols = [0xd6283a, 0xf07a1a, 0xf2c230, 0x8e44ad, 0xf2e7f0, 0xe8537a, 0x3f7a2e];
  const bands = 7;
  for (let b = 0; b < bands; b++) {
    const col = cols[b % cols.length];
    const pts = [];
    const z0 = -D / 2 + (b / bands) * D, z1 = -D / 2 + ((b + 1) / bands) * D;
    for (let k = 0; k <= 24; k++) { const x = -W / 2 + (k / 24) * W; pts.push([x, z0 + Math.sin(k * 0.6 + b) * 0.8]); }
    for (let k = 24; k >= 0; k--) { const x = -W / 2 + (k / 24) * W; pts.push([x, z1 + Math.sin(k * 0.6 + b + 1) * 0.8]); }
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(sh, 4); g.rotateX(-Math.PI / 2);
    c.add(WM.painted, g, mat(0, 0.06 + b * 0.002, 0), col);
    for (let k = 0; k < 40; k++) c.box(WM.painted, 0.3, 0.22, 0.3, rr(-W / 2 + 0.5, W / 2 - 0.5), 0.16, rr(z0 + 0.8, z1 - 0.8), col);
  }
  c.box(WM.curb, W + 0.4, 0.12, 0.2, 0, 0.06, -D / 2 - 1, 0xcfcac0);
}

/** Tram shelter as on бул. България: slanted steel posts, curved glass roof, glass back, ad panel, bench. */
export function tramShelter(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 6, H = 2.7;
  for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) { strut(c, WM.metalDark, V(x, 0, 0.7), V(x, H, 0.1), 0.12, 0x3a4450); strut(c, WM.metalDark, V(x, H, 0.1), V(x, H - 0.3, -1.3), 0.1, 0x3a4450); }
  const roof = new THREE.CylinderGeometry(4, 4, L, 16, 1, true, -0.35, 0.7); roof.rotateZ(Math.PI / 2);
  c.add(WM.glass, roof, mat(0, H - 3.95, -0.4));
  c.add(WM.metalDark, new THREE.BoxGeometry(L, 0.1, 0.1), mat(0, H + 0.02, 0.1), 0x3a4450);
  c.box(WM.glass, L - 0.4, 2.1, 0.03, 0, 1.25, 0.72);
  const ad = new THREE.PlaneGeometry(1.2, 1.8); c.add(WM.posters[o.ad ?? 2], ad, mat(L / 2 - 0.9, 1.25, 0.7));
  c.box(WM.metalDark, 1.3, 1.95, 0.12, L / 2 - 0.9, 1.25, 0.76, 0x2a2e33);
  const g = new THREE.PlaneGeometry(1.4, 0.3); g.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(g, o.name || 'СПИРКА', '#b83a2a', '#ffffff', 700, 150, { weight: 700 }), mat(-L / 2 + 1.2, H - 0.25, -0.2));
  bench({ add: (m, gg, lm, col) => c.add(m, gg, lm, col) }, 0, 0.35, 0);
  reg.colliders?.push({ M, hl: L / 2, hd: 0.5, soft: true });
}

/** Signal gantry: black pole with yellow foot and a lattice truss arm over the road with signal heads. */
export function gantry(cb, x, z, yaw, span, heads, mats, headFn, headYaw) {
  const M = mat(x, 0, z, 0, yaw);
  const add = (m, g, lm, col) => cb.add(m, g, M.clone().multiply(lm), col);
  add(WM.metalDark, new THREE.CylinderGeometry(0.16, 0.2, 7.2, 12), mat(0, 3.6, 0), 0x16181b);
  add(WM.painted, new THREE.CylinderGeometry(0.21, 0.21, 1.2, 12), mat(0, 0.6, 0), 0xf2c200);
  for (const y of [6.2, 7.0]) add(WM.metalDark, new THREE.BoxGeometry(0.1, 0.1, span), mat(0, y, span / 2), 0x16181b);
  for (let t = 0; t < span; t += 1.2) {
    const a = V(0, 6.2, t), b = V(0, 7.0, t + 0.6), d = b.clone().sub(a), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    add(WM.metalDark, new THREE.BoxGeometry(0.05, L, 0.05), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)), 0x16181b);
    add(WM.metalDark, new THREE.BoxGeometry(0.05, 0.8, 0.05), mat(0, 6.6, t), 0x16181b);
  }
  // heads hang from the truss, facing −x of the gantry frame (towards approaching traffic)
  for (const hz of heads) {
    const w = new THREE.Vector3(0, 5.4, hz).applyMatrix4(M);
    headFn(cb, w.x, 5.3, w.z, headYaw, mats);
  }
}

/** Yellow/white New Jersey concrete barriers along a polyline. */
export function jerseyBarrier(cb, pts) {
  const sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.24, 0.25); sh.lineTo(0.1, 0.35); sh.lineTo(0.1, 0.8); sh.lineTo(-0.1, 0.8); sh.lineTo(-0.1, 0.35); sh.lineTo(-0.24, 0.25); sh.lineTo(-0.3, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
    const g = new THREE.ExtrudeGeometry(sh, { depth: L - 0.05, bevelEnabled: false }); g.translate(0, 0, -L / 2);
    const yaw = -Math.atan2(bz - az, bx - ax) + Math.PI / 2;
    cb.add(WM.concrete, g, mat((ax + bx) / 2, 0, (az + bz) / 2, 0, yaw), i % 2 ? 0xf2e3a0 : 0xf3efe2);
  }
}
export { R, pick };
