// More building generators for the line 9 extension and the tram line 7 corridor.
// Local frame as in buildings.js: front facade at z = -D/2 facing −z, length along x, origin at ground centre.
import * as THREE from 'three';
import { WM } from './materials.js';
import { Ctx, wallGeo, boxUVm, signUV, SIGNS, PARAPET_COLS, bench } from './buildings.js';
import { mat, R, rr, pick, chance, tubePath } from '../util.js';

const FH = 2.8;

/** Four facade walls of a box volume (front/back with fmat, ends with emat), metric UVs. */
function shell(c, L, D, y0, H, fmat, emat = fmat, o = {}) {
  const tu = o.tu || 12, tv = o.tv || 11.2;
  const f = wallGeo(L, H, tu, tv, o.u0 || 0, o.v0 || 0); f.rotateY(Math.PI); c.add(fmat, f, mat(0, y0 + H / 2, -D / 2), o.col);
  const b = wallGeo(L, H, tu, tv, (o.u0 || 0) + 3, o.v0 || 0); c.add(o.backMat || fmat, b, mat(0, y0 + H / 2, D / 2), o.col);
  for (const s of [-1, 1]) {
    const e = wallGeo(D, H, o.etu || tu, o.etv || tv, 1.5); e.rotateY(s * Math.PI / 2);
    c.add(emat, e, mat(s * L / 2, y0 + H / 2, 0), o.ecol);
  }
}
function flatTop(c, L, D, H, parapet = 0xd0cbc2, ph = 0.6) {
  const roof = new THREE.PlaneGeometry(L, D); roof.rotateX(-Math.PI / 2); boxUVm(roof, 4);
  c.add(WM.flatRoof, roof, mat(0, H - 0.05, 0));
  c.box(WM.plainA, L + 0.2, ph, 0.25, 0, H + ph / 2 - 0.05, -D / 2, parapet);
  c.box(WM.plainA, L + 0.2, ph, 0.25, 0, H + ph / 2 - 0.05, D / 2, parapet);
  c.box(WM.plainA, 0.25, ph, D, -L / 2, H + ph / 2 - 0.05, 0, parapet);
  c.box(WM.plainA, 0.25, ph, D, L / 2, H + ph / 2 - 0.05, 0, parapet);
}
function rooftopJunk(c, L, D, H, n = 3) {
  for (let k = 0; k < n; k++) {
    const x = rr(-L / 2 + 3, L / 2 - 3), z = rr(-D / 2 + 2, D / 2 - 2);
    if (chance(0.5)) c.box(WM.metal, 1.4, 0.9, 1.0, x, H + 0.45, z, 0xb8bcbf); // AC unit
    else for (let a = 0; a < 3; a++) c.box(WM.metal, 0.04, 2.4, 0.04, x + a * 0.8, H + 1.2, z);
  }
}
function entrance(c, x, D, reg, col = 0x9c9b96) {
  c.box(WM.concrete, 3.0, 0.16, 1.8, x, 2.75, -D / 2 - 0.9, col);
  c.box(WM.glassDark, 1.7, 2.3, 0.1, x, 1.25, -D / 2 - 0.05);
  c.box(WM.metalDark, 1.9, 0.08, 0.14, x, 2.45, -D / 2 - 0.05);
  c.box(WM.concrete, 3.0, 0.3, 1.4, x, 0.15, -D / 2 - 0.7, 0x8f8f8b);
  reg.doors?.push(c.world(x, 0, -D / 2 - 2));
}
/** Ground-floor shopfront with a sign from the shared atlas. */
function shopfront(c, x, D, w, text, bg, fg, h = 3.0) {
  const g = wallGeo(w - 0.4, h - 0.4, 5.6, 2.8); g.rotateY(Math.PI);
  c.add(pick([WM.shopA, WM.shopB]), g, mat(x, 0.2 + (h - 0.4) / 2, -D / 2 - 0.26));
  c.box(WM.metalDark, w, h, 0.24, x, h / 2, -D / 2 - 0.12, 0x44484d);
  const sg = new THREE.PlaneGeometry(w - 0.6, 0.75); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, text, bg, fg, 1024, 150), mat(x, h + 0.42, -D / 2 - 0.3));
}

/**
 * Tall 1980s slab with red-brick pilasters and stacked concrete loggias (the block opposite the
 * бул. Гоце Делчев stop). opts {L, D, floors, bank: true adds the UniCredit ground-floor annex}.
 */
export function brickStripeTower(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const bay = 3.0, nb = Math.max(4, Math.round((o.L || 42) / bay)), L = nb * bay, D = o.D || 13, fl = o.floors || 14;
  const H = fl * FH + 0.4;
  shell(c, L, D, 0, H, WM.brickStripe, WM.plainA, { ecol: 0x9c9384 });
  c.box(WM.concrete, L + 0.1, 0.9, D + 0.1, 0, 0.45, 0, 0x7d7a74);
  flatTop(c, L, D, H, 0x8f8a80, 0.8);
  rooftopJunk(c, L, D, H, 5);
  c.box(WM.plainA, 5, 3, 4, -L / 4, H + 1.5, 1, 0x938d82); c.box(WM.plainA, 5, 3, 4, L / 4, H + 1.5, 1, 0x938d82);
  // stacked loggias: every other pair of bays, concrete slab + parapet, some glazed, AC units, satellite dishes
  for (const zs of [-1, 1]) for (let b = 1; b < nb - 1; b += 2) {
    const xc = -L / 2 + (b + 0.5) * bay;
    for (let f = 1; f < fl; f++) {
      const y = f * FH, z = zs * (D / 2 + 0.7);
      c.box(WM.concrete, bay * 1.6, 0.16, 1.4, xc, y + 0.08, zs * (D / 2 + 0.7), 0x9d978b);
      c.box(WM.concrete, bay * 1.6, 1.05, 0.12, xc, y + 0.6, z + zs * 0.64, pick([0x9d978b, 0xa39c90, 0x8e887d]));
      c.box(WM.concrete, 0.12, 1.05, 1.3, xc - bay * 0.8, y + 0.6, z, 0x9d978b);
      c.box(WM.concrete, 0.12, 1.05, 1.3, xc + bay * 0.8, y + 0.6, z, 0x9d978b);
      if (chance(0.45)) c.box(WM.glass, bay * 1.55, FH - 1.3, 0.03, xc, y + 1.15 + (FH - 1.3) / 2, z + zs * 0.64);
      else {
        if (chance(0.3)) c.box(WM.metal, 0.7, 0.5, 0.3, xc + rr(-1.5, 1.5), y + 1.4, z + zs * 0.55, 0xe8eae9);
        if (chance(0.2)) c.box(WM.fabric, 1.6, 0.6, 0.02, xc, y + 1.9, z, pick([0xffffff, 0xd8e4f0, 0xf0d0c8]));
        if (zs < 0 && chance(o.peopleP ?? 0.06)) reg.terraces?.push({ p: c.world(xc + rr(-1, 1), y + 0.16, z + zs * 0.1), yaw: c.worldYaw(Math.PI) });
      }
      if (chance(0.08)) { const d = new THREE.CircleGeometry(0.35, 12); d.rotateY(zs < 0 ? Math.PI : 0); c.add(WM.painted, d, mat(xc - bay * 0.6, y + 2.0, z + zs * 0.72), 0xf2f2f0); }
    }
  }
  for (let x = -L / 2 + 7; x < L / 2 - 4; x += 18) entrance(c, x, D, reg, 0x8e8a82);
  // UniCredit Bulbank annex (2020): one-storey white pavilion in front of the block
  if (o.bank) {
    const bw = Math.min(L - 4, 34), bd = 6.5, bz = -D / 2 - bd / 2 - 0.2;
    c.box(WM.painted, bw, 0.9, bd + 0.4, 0, 3.55, bz, 0xf4f4f2);                       // white fascia band
    c.box(WM.painted, bw + 0.3, 0.12, bd + 0.7, 0, 4.05, bz, 0xe9e9e6);
    for (let x = -bw / 2 + 0.4; x <= bw / 2 - 0.3; x += 3.2) c.box(WM.painted, 0.55, 3.1, 0.55, x, 1.55, bz - bd / 2 + 0.25, 0xf1f1ef); // white piers
    c.box(WM.glassDark, bw - 0.6, 2.9, 0.08, 0, 1.5, bz - bd / 2 + 0.3);
    c.box(WM.wood, 2.2, 3.1, 0.3, -bw / 2 + 1.4, 1.55, bz - bd / 2 + 0.35, 0xa26a3c);   // wood-clad corner
    c.box(WM.wood, 0.3, 3.1, 2.4, -bw / 2 + 0.2, 1.55, bz - bd / 2 + 1.4, 0xa26a3c);
    for (const sx of [-1, 1]) c.box(WM.painted, 0.3, 3.1, bd, sx * bw / 2, 1.55, bz, 0xf1f1ef);
    const roof = new THREE.PlaneGeometry(bw, bd); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, 4.0, bz));
    for (const [x, w] of [[-bw * 0.18, bw * 0.34], [bw * 0.22, bw * 0.3]]) {
      const sg = new THREE.PlaneGeometry(w, 0.7); sg.rotateY(Math.PI);
      c.add(SIGNS.mat, signUV(sg, 'UniCredit Bulbank', '#ffffff', '#1d1d1b', 1024, 150, { weight: 600 }), mat(x, 3.55, bz - bd / 2 - 0.23));
      const lg = new THREE.CircleGeometry(0.34, 20); lg.rotateY(Math.PI); c.add(WM.painted, lg, mat(x - w / 2 - 0.2, 3.55, bz - bd / 2 - 0.24), 0xe2001a);
    }
    c.box(WM.metalDark, 0.9, 1.7, 0.4, bw / 2 - 2.5, 0.95, bz - bd / 2 + 0.1, 0x55595e); // ATM
    c.box(WM.emissive, 0.5, 0.35, 0.02, bw / 2 - 2.5, 1.45, bz - bd / 2 - 0.11, 0x6a8fb0);
    const poster = new THREE.PlaneGeometry(1.6, 2.2); poster.rotateY(Math.PI);
    c.add(WM.posters[4], poster, mat(bw * 0.38, 1.6, bz - bd / 2 + 0.2));
    reg.colliders?.push({ M: M.clone().multiply(mat(0, 0, bz)), hl: bw / 2, hd: bd / 2 });
  }
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D, H };
}

/** Red-brick 1970s block with white floor bands; optional huge billboard on the end wall and dark shopfronts. */
export function redBrickBlock(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 18, D = o.D || 14, fl = o.floors || 9, H = fl * FH + 0.4;
  shell(c, L, D, 0, H, WM.redBrick, WM.redBrick, {});
  c.box(WM.concrete, L + 0.1, 0.7, D + 0.1, 0, 0.35, 0, 0x6f6c68);
  flatTop(c, L, D, H, 0xe2ddd4, 0.5);
  // telecom mast on the roof
  for (const [x, z] of [[-2, -3], [2, -3], [0, 2]]) c.box(WM.metal, 0.12, 5, 0.12, x, H + 2.5, z);
  for (let k = 0; k < 4; k++) c.box(WM.painted, 0.3, 1.4, 0.15, -2 + (k % 2) * 4, H + 4, -3 + Math.floor(k / 2) * 5, 0xf0f0ee);
  if (o.billboard !== undefined) {
    const bw = Math.min(D - 1, 9), bh = Math.min(H * 0.55, 14);
    const g = new THREE.PlaneGeometry(bw, bh); g.rotateY(-Math.PI / 2);
    c.add(WM.posters[o.billboard], g, mat(-L / 2 - 0.26, H - bh / 2 - 1.5, 0));
    c.box(WM.metalDark, 0.2, bh + 0.3, bw + 0.3, -L / 2 - 0.12, H - bh / 2 - 1.5, 0, 0x222428);
  }
  if (o.shops) {
    c.box(WM.metalDark, L, 3.4, 0.3, 0, 1.7, -D / 2 - 0.15, 0x1c1e21);
    o.shops.forEach((t, i) => shopfront(c, -L / 2 + (i + 0.5) * (L / o.shops.length), D, L / o.shops.length - 0.3, t.text, t.bg, t.fg));
  }
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D, H };
}

/**
 * 1980s Sofia block with stepped sections and coloured loggia fronts (as along бул. България).
 * opts {segs: [[length, floors], ...], D, accents: [hex...], fmat}
 */
export function block80s(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const segs = o.segs || [[18, 10], [18, 12], [15, 14]];
  const D = o.D || 13;
  const Ltot = segs.reduce((a, s) => a + s[0], 0);
  const fmat = o.fmat || pick([WM.paleA, WM.paleB, WM.paleC]);
  const accents = o.accents || [0xd9822b, 0xe0b04a, 0xb8452f, 0xc86c3a, 0x9e5a3a];
  let x0 = -Ltot / 2, k = 0;
  for (const [Ls, fl] of segs) {
    const xc = x0 + Ls / 2, H = fl * FH + 0.4;
    const sc = new Ctx(cb, M.clone().multiply(mat(xc, 0, (k % 2) * 1.5)), reg);
    shell(sc, Ls, D, 0, H, fmat, WM.plainA, { ecol: 0xe6e1d6, u0: k * 3 });
    sc.box(WM.concrete, Ls + 0.1, 0.8, D + 0.1, 0, 0.4, 0, 0x85827c);
    flatTop(sc, Ls, D, H, 0xd8d2c6, 0.5);
    rooftopJunk(sc, Ls, D, H, 2);
    if (chance(0.5)) sc.box(WM.plainA, 4, 2.6, 3.5, 0, H + 1.3, 1, 0xd6d0c4);
    // loggia column(s) with a coloured front
    const acc = accents[k % accents.length];
    for (const lx of [-Ls / 2 + 3.2, Ls / 2 - 3.2]) {
      for (let f = 1; f < fl; f++) {
        const y = f * FH;
        sc.box(WM.painted, 4.6, 1.1, 0.14, lx, y + 0.6, -D / 2 - 1.25, f % 3 === 0 ? 0xe9e5dc : acc);
        sc.box(WM.concrete, 4.6, 0.14, 1.3, lx, y + 0.07, -D / 2 - 0.65, 0xb3ada2);
        sc.box(WM.painted, 0.14, FH, 1.3, lx - 2.3, y + FH / 2, -D / 2 - 0.65, 0xe4dfd5);
        sc.box(WM.painted, 0.14, FH, 1.3, lx + 2.3, y + FH / 2, -D / 2 - 0.65, 0xe4dfd5);
        if (chance(0.5)) sc.box(WM.glass, 4.4, 1.5, 0.03, lx, y + 1.95, -D / 2 - 1.25);
        else if (chance(0.06)) reg.terraces?.push({ p: sc.world(lx + rr(-1.5, 1.5), y + 0.14, -D / 2 - 0.8), yaw: sc.worldYaw(Math.PI) });
      }
    }
    // brick stair tower on the back
    sc.box(WM.plainA, 3.2, H + 1.4, 2.2, 0, (H + 1.4) / 2, D / 2 + 1.1, 0xa8563c);
    entrance(sc, 0, D, reg);
    x0 += Ls; k++;
  }
  reg.colliders?.push({ M, hl: Ltot / 2, hd: D / 2 + 1 });
  return { L: Ltot, D };
}

/** Narrow late-1970s point tower with a curved balcony front (as next to пл. Ручей). */
export function sliverTower(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 14, D = o.D || 12, fl = o.floors || 13, H = fl * FH + 0.4;
  shell(c, W, D, 0, H, o.fmat || WM.paleC, WM.plainA, { ecol: 0xd9d4ca });
  c.box(WM.concrete, W + 0.1, 0.9, D + 0.1, 0, 0.45, 0, 0x7f7c76);
  flatTop(c, W, D, H, 0xd4cec2, 0.7);
  // blade wall on one side (full height)
  c.box(WM.plainA, 0.5, H + 2.2, D + 2.2, W / 2 + 0.25, (H + 2.2) / 2, -0.6, 0xdcd7cc);
  // curved balcony front made of stacked arcs
  for (let f = 1; f < fl; f++) {
    const y = f * FH;
    const arc = new THREE.CylinderGeometry(W * 0.62, W * 0.62, 1.05, 24, 1, true, Math.PI * 0.84, Math.PI * 0.32);
    c.add(WM.painted, arc, mat(-0.5, y + 0.55, -D / 2 + W * 0.62 - 1.6), 0xe4dfd6);
    const slab = new THREE.CylinderGeometry(W * 0.62, W * 0.62, 0.14, 24, 1, false, Math.PI * 0.84, Math.PI * 0.32);
    c.add(WM.concrete, slab, mat(-0.5, y + 0.07, -D / 2 + W * 0.62 - 1.6), 0xb3ada2);
    if (chance(0.06)) reg.terraces?.push({ p: c.world(rr(-3, 2), y + 0.14, -D / 2 - 0.8), yaw: c.worldYaw(Math.PI) });
  }
  // graffiti on the ground floor
  const gg = wallGeo(W, 3.2, 8, 3.2); gg.rotateY(Math.PI); c.add(WM.graffiti, gg, mat(0, 1.6, -D / 2 - 0.03));
  reg.colliders?.push({ M, hl: W / 2 + 0.5, hd: D / 2 });
  return { W, D, H };
}

/** 2006-style industrial / commercial hall with sandwich-panel cladding. opts {L, D, H, sign, signBg, fmat} */
export function industrialHall(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 30, D = o.D || 18, H = o.H || 9;
  shell(c, L, D, 0, H, o.fmat || WM.industrial, o.fmat || WM.industrial, { tu: 9, tv: 9, etu: 9, etv: 9 });
  c.box(WM.concrete, L + 0.1, 0.5, D + 0.1, 0, 0.25, 0, 0x7a7874);
  flatTop(c, L, D, H, 0x9ea3a8, 0.9);
  rooftopJunk(c, L, D, H, 4);
  // roller doors & loading
  for (let k = 0; k < 2; k++) {
    const x = L / 2 - 5 - k * 6;
    c.box(WM.metal, 4.2, 4.5, 0.12, x, 2.25, -D / 2 - 0.06, 0xb9bdc1);
    for (let y = 0.3; y < 4.5; y += 0.3) c.box(WM.metalDark, 4.2, 0.03, 0.14, x, y, -D / 2 - 0.07);
  }
  c.box(WM.glassDark, 3, 2.6, 0.1, -L / 2 + 4, 1.3, -D / 2 - 0.05);
  c.box(WM.painted, 4.4, 0.14, 1.6, -L / 2 + 4, 2.9, -D / 2 - 0.8, 0x3a3f45);
  if (o.sign) {
    const sg = new THREE.PlaneGeometry(Math.min(L * 0.5, 14), 1.4); sg.rotateY(Math.PI);
    c.add(SIGNS.mat, signUV(sg, o.sign, o.signBg || '#1e3f7a', '#ffffff', 1024, 130), mat(-L * 0.12, H - 1.3, -D / 2 - 0.08));
  }
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D, H };
}

/**
 * Modern office / residential building (2020s). style: 'ceramic' (brown panels + glass),
 * 'curtain' (full glass), 'white' (white render + dark frames, glass balconies).
 */
export function modernOffice(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 40, D = o.D || 16, fl = o.floors || 8;
  const style = o.style || 'ceramic';
  const gf = 4.2, fh = 3.3, H = gf + (fl - 1) * fh;
  const fmat = style === 'ceramic' ? WM.ceramic : style === 'curtain' ? (o.glass || WM.curtainOffice) : style === 'beige' ? WM.beigeModern : style === 'grey' ? WM.greyModern : WM.whiteModern;
  // glazed ground floor (retail / lobby)
  const g0 = wallGeo(L, gf, 5.6, 2.8); g0.rotateY(Math.PI); c.add(WM.shopA, g0, mat(0, gf / 2, -D / 2 + 0.6));
  c.box(WM.metalDark, L, 0.5, D, 0, gf - 0.25, 0, 0x2f3236);
  const gb = wallGeo(L, gf, 6, 6); c.add(WM.plainA, gb, mat(0, gf / 2, D / 2), 0xd9d6d0);
  for (const s of [-1, 1]) { const e = wallGeo(D, gf, 6, 6); e.rotateY(s * Math.PI / 2); c.add(WM.plainA, e, mat(s * L / 2, gf / 2, 0), 0xd9d6d0); }
  for (let x = -L / 2 + 1; x <= L / 2 - 0.5; x += 4) c.box(WM.painted, 0.35, gf, 0.35, x, gf / 2, -D / 2 + 0.3, 0x2d2f33);
  // upper volume
  const Hup = (fl - 2) * fh;
  const tu = style === 'curtain' ? 12 : style === 'ceramic' ? 9.6 : 9.6, tv = style === 'curtain' ? 12 : 13.2;
  shell(c, L, D, gf, Hup, fmat, style === 'curtain' ? fmat : WM.plainA, { tu, tv, ecol: style === 'ceramic' ? 0x8a6048 : 0xe8e6e0, etu: style === 'curtain' ? 12 : 6, etv: style === 'curtain' ? 12 : 6 });
  // vertical fins / balconies
  if (style === 'ceramic') for (let x = -L / 2; x <= L / 2 + 0.1; x += 2.4) c.box(WM.painted, 0.18, Hup, 0.5, x, gf + Hup / 2, -D / 2 - 0.25, 0x6e4a35);
  if (style === 'white' || style === 'beige' || style === 'grey') {
    for (let f = 0; f < fl - 2; f++) {
      const y = gf + f * fh;
      for (let x = -L / 2 + 4; x < L / 2 - 3; x += 8) {
        c.box(WM.concrete, 5.6, 0.2, 1.6, x, y + 0.1, -D / 2 - 0.8, 0xe8e6e0);
        c.box(WM.glass, 5.6, 1.05, 0.03, x, y + 0.72, -D / 2 - 1.58);
        c.box(WM.metalDark, 5.6, 0.05, 0.06, x, y + 1.25, -D / 2 - 1.58);
        if (chance(0.05)) reg.terraces?.push({ p: c.world(x + rr(-2, 2), y + 0.2, -D / 2 - 1.0), yaw: c.worldYaw(Math.PI) });
      }
    }
  }
  // set-back glass top floor + roof
  const yT = gf + Hup;
  c.box(WM.concrete, L + 0.3, 0.35, D + 0.3, 0, yT + 0.17, 0, 0xdfe2e4);
  const tg = wallGeo(L - 4, fh, 12, 12); tg.rotateY(Math.PI); c.add(WM.curtainGreen, tg, mat(0, yT + 0.35 + fh / 2, -D / 2 + 2));
  const tb = wallGeo(L - 4, fh, 12, 12); c.add(WM.curtainGreen, tb, mat(0, yT + 0.35 + fh / 2, D / 2 - 2));
  for (const s of [-1, 1]) { const e = wallGeo(D - 4, fh, 12, 12); e.rotateY(s * Math.PI / 2); c.add(WM.curtainGreen, e, mat(s * (L / 2 - 2), yT + 0.35 + fh / 2, 0)); }
  const roof = new THREE.PlaneGeometry(L - 4, D - 4); roof.rotateX(-Math.PI / 2); c.add(WM.flatRoof, roof, mat(0, yT + 0.35 + fh, 0));
  c.box(WM.metal, L - 3.6, 0.3, D - 3.6, 0, yT + 0.5 + fh, 0, 0x3a3d41);
  c.box(WM.glass, L + 0.2, 1.05, 0.03, 0, yT + 0.35 + 0.55, -D / 2);
  if (o.sign) {
    const sg = new THREE.PlaneGeometry(Math.min(12, L * 0.4), 1.2); sg.rotateY(Math.PI);
    c.add(SIGNS.mat, signUV(sg, o.sign, o.signBg || '#ffffff', o.signFg || '#1b1b1b', 1024, 128), mat(-L * 0.25, gf - 0.25, -D / 2 - 0.05));
  }
  reg.colliders?.push({ M, hl: L / 2, hd: D / 2 });
  return { L, D, H: yT + fh };
}

/** Small park café with a deck, green umbrellas, tables and a hedge (the "mini-restaurants" in Южен парк). */
export function parkCafe(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 14, D = o.D || 10;
  // kiosk building
  c.box(WM.wood, 5, 3, 3.5, -W / 2 + 2.8, 1.5, D / 2 - 2, 0x8a5a36);
  c.box(WM.painted, 5.6, 0.25, 4.1, -W / 2 + 2.8, 3.1, D / 2 - 2, 0x2f5a34);
  c.box(WM.glassDark, 3.2, 1.2, 0.05, -W / 2 + 2.8, 1.6, D / 2 - 3.76);
  const sg = new THREE.PlaneGeometry(4.2, 0.55); sg.rotateY(Math.PI);
  c.add(SIGNS.mat, signUV(sg, o.name || 'КАФЕ-БАР', '#2f5a34', '#ffffff', 1024, 130), mat(-W / 2 + 2.8, 2.7, D / 2 - 3.8));
  // wooden deck
  c.box(WM.wood, W, 0.2, D, 0, 0.1, 0, 0x9b6b44);
  const umbCol = o.umbrella || 0x2f7a3a;
  let k = 0;
  for (let x = -W / 2 + 6; x < W / 2 - 1; x += 3.4) for (let z = -D / 2 + 2; z < D / 2 - 1; z += 3.6) {
    k++;
    c.box(WM.metal, 0.06, 2.3, 0.06, x, 1.35, z, 0x777a7d);
    const u = new THREE.ConeGeometry(1.5, 0.55, 8, 1, true); c.add(WM.fabric, u, mat(x, 2.55, z), umbCol);
    c.box(WM.painted, 0.8, 0.05, 0.8, x, 0.95, z, 0xece9e3);
    c.box(WM.metal, 0.06, 0.75, 0.06, x, 0.55, z, 0x555);
    for (const [dx, dz] of [[-0.75, 0], [0.75, 0], [0, 0.75]]) { c.box(WM.painted, 0.42, 0.05, 0.42, x + dx, 0.66, z + dz, 0x3d3f42); c.box(WM.painted, 0.42, 0.45, 0.04, x + dx, 0.9, z + dz + (dz ? 0.2 : 0), 0x3d3f42); }
    if (chance(0.55)) reg.benches?.push({ p: c.world(x + 0.75, 0.2, z), yaw: c.worldYaw(-Math.PI / 2) });
  }
  void k;
  // hedge around, open towards the path
  c.box(WM.hedge, W, 0.9, 0.7, 0, 0.45, -D / 2 - 0.4, 0x3d6a2a);
  c.box(WM.hedge, 0.7, 0.9, D, W / 2 + 0.4, 0.45, 0, 0x3d6a2a);
  // lamp posts
  for (const x of [-W / 2, W / 2]) { c.box(WM.metalDark, 0.08, 3.2, 0.08, x, 1.6, -D / 2 - 1.1); c.box(WM.painted, 0.3, 0.4, 0.3, x, 3.3, -D / 2 - 1.1, 0xf2eee0); }
  reg.colliders?.push({ M: M.clone().multiply(mat(-W / 2 + 2.8, 0, D / 2 - 2)), hl: 2.6, hd: 1.8 });
}

/**
 * Small neighbourhood park: paths (cross + ring), benches, lamps, flower beds, a sculpture.
 * Returns tree positions for the caller (trees are drawn by the vegetation system).
 */
export function miniPark(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const W = o.W || 40, D = o.D || 30;
  const trees = [];
  // paths
  c.box(WM.pavers, W, 0.06, 2.4, 0, 0.03, 0);
  c.box(WM.pavers, 2.4, 0.06, D, 0, 0.03, 0);
  // central plaza with a sculpture / fountain
  const plaza = new THREE.CylinderGeometry(4.5, 4.5, 0.08, 32); c.add(WM.pavers, plaza, mat(0, 0.04, 0));
  if (o.fountain) {
    c.add(WM.stone, new THREE.CylinderGeometry(2.4, 2.6, 0.55, 32), mat(0, 0.3, 0));
    c.add(WM.glassDark, new THREE.CylinderGeometry(2.15, 2.15, 0.05, 32), mat(0, 0.5, 0));
    c.add(WM.stone, new THREE.CylinderGeometry(0.35, 0.5, 1.2, 12), mat(0, 0.9, 0));
  } else {
    c.add(WM.stone, new THREE.BoxGeometry(1.2, 0.8, 1.2), mat(0, 0.4, 0));
    c.add(WM.metalDark, tubePath([[0, 0.8, 0], [0.4, 1.8, 0.2], [-0.2, 2.6, -0.1], [0.3, 3.3, 0]], 0.12, 0.3), null, 0x7a5a3a);
  }
  // flower beds
  const flowers = [0xd83a3a, 0xf0a020, 0xe8e0f0, 0x9a4ac8, 0xf06a9a, 0xf2d23a];
  for (const [x, z] of [[-W / 4, -D / 4], [W / 4, -D / 4], [-W / 4, D / 4], [W / 4, D / 4]]) {
    c.add(WM.curb, new THREE.CylinderGeometry(2.6, 2.6, 0.25, 24, 1, true), mat(x, 0.12, z));
    c.add(WM.dirt, new THREE.CylinderGeometry(2.55, 2.55, 0.2, 24), mat(x, 0.1, z));
    for (let k = 0; k < 26; k++) { const a = R() * 6.28, r = Math.sqrt(R()) * 2.3; c.box(WM.painted, 0.35, 0.3, 0.35, x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r, pick(flowers)); }
  }
  // benches along the paths
  const bc = { add: (m, g, lm, col) => c.add(m, g, lm, col) };
  for (const [x, z, ry] of [[-W / 2 + 6, -1.9, 0], [W / 2 - 6, -1.9, 0], [-W / 2 + 12, 1.9, Math.PI], [1.9, D / 2 - 6, Math.PI / 2], [-1.9, -D / 2 + 6, -Math.PI / 2]]) {
    bench(bc, x, z, ry);
    reg.benches?.push({ p: c.world(x, 0.02, z), yaw: c.worldYaw(ry + Math.PI) });
  }
  // lamps
  for (const [x, z] of [[-W / 2 + 3, 1.6], [W / 2 - 3, 1.6], [1.6, -D / 2 + 3], [-1.6, D / 2 - 3]]) {
    c.box(WM.metalDark, 0.1, 3.8, 0.1, x, 1.9, z);
    c.add(WM.painted, new THREE.SphereGeometry(0.28, 12, 8), mat(x, 3.95, z), 0xf4f0e2);
  }
  for (let k = 0; k < (o.trees ?? 14); k++) {
    const x = rr(-W / 2 + 2, W / 2 - 2), z = rr(-D / 2 + 2, D / 2 - 2);
    if (Math.abs(x) < 2.5 || Math.abs(z) < 2.5 || Math.hypot(x, z) < 6) continue;
    const v = c.world(x, 0, z); trees.push([v.x, v.z]);
  }
  return { trees, W, D };
}

/** Pedestrian underpass entrance: stairs going down between graffiti walls, black railings on top. */
export function underpass(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const L = o.L || 12, W = o.W || 3.6, depth = 3.4;
  const n = 18;
  for (let k = 0; k < n; k++) {
    const t = k / n;
    c.box(WM.concrete, W, 0.2, L / n + 0.02, 0, -t * depth + 0.05, -L / 2 + (k + 0.5) * (L / n), 0x8f8c86);
  }
  // side walls with graffiti inside, cap on top
  for (const s of [-1, 1]) {
    const g = wallGeo(L, depth + 0.9, 8, depth + 0.9); g.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    c.add(WM.graffiti, g, mat(s * (W / 2 + 0.01), 0.9 - (depth + 0.9) / 2, 0));
    c.box(WM.concrete, 0.35, 0.3, L, s * (W / 2 + 0.17), 0.95, 0, 0xa19d95);
    // black railing on the wall top
    for (let z = -L / 2; z <= L / 2; z += 0.12) c.box(WM.metalDark, 0.03, 0.9, 0.03, s * (W / 2 + 0.17), 1.55, z, 0x1b1c1e);
    c.box(WM.metalDark, 0.06, 0.05, L, s * (W / 2 + 0.17), 2.0, 0, 0x1b1c1e);
  }
  // tunnel mouth at the bottom
  c.box(WM.glassDark, W + 0.4, 2.6, 0.2, 0, -depth + 1.3, L / 2 + 0.2, 0x050505);
  c.box(WM.concrete, W + 1, 0.8, 1.2, 0, 0.5, L / 2 + 0.6, 0xa19d95);
  c.box(WM.metalDark, 0.08, 0.9, W + 0.4, 0, 1.4, -L / 2 - 0.05, 0x1b1c1e);
  reg.colliders?.push({ M, hl: W / 2 + 0.3, hd: L / 2 });
}

/** Free-standing billboard (6 x 3 m) on a single pole, poster on both sides. */
export function billboard(cb, M, reg, o = {}) {
  const c = new Ctx(cb, M, reg);
  const w = o.w || 6, h = o.h || 3, H = o.H || 4.6;
  c.add(WM.metalDark, new THREE.CylinderGeometry(0.22, 0.25, H, 10), mat(0, H / 2, 0), 0x2a2c30);
  c.box(WM.metalDark, w + 0.3, h + 0.3, 0.35, 0, H + h / 2, 0, 0x2a2c30);
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(w, h); if (s < 0) g.rotateY(Math.PI);
    c.add(WM.posters[((o.kind ?? 0) + (s < 0 ? 0 : 3)) % 6], g, mat(0, H + h / 2, s * 0.18));
  }
  c.box(WM.metal, w, 0.08, 0.5, 0, H + h + 0.25, 0, 0x777b80);
  reg.colliders?.push({ M, hl: 0.4, hd: 0.4, soft: true });
}

/** Low hedge of red-leaf barberry along a polyline of [x,z] points (tram reservations). */
export function hedgeLine(cb, pts, h = 0.8, w = 0.9, col = 0x7a2c3a) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
    const g = new THREE.BoxGeometry(L + 0.1, h, w); boxUVm(g, 1);
    cb.add(WM.hedge, g, mat((ax + bx) / 2, h / 2, (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax)), col);
  }
}

/** Green welded-mesh fence panels along a polyline (tram platforms, dog park). */
export function meshFence(cb, pts, h = 1.2, col = 0x1f4a32) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
    const yaw = -Math.atan2(bz - az, bx - ax);
    const n = Math.max(1, Math.round(L / 2.5));
    for (let k = 0; k <= n; k++) { const t = k / n; cb.add(WM.metalDark, new THREE.BoxGeometry(0.06, h + 0.1, 0.06), mat(ax + (bx - ax) * t, (h + 0.1) / 2, az + (bz - az) * t), col); }
    for (let y = 0.1; y <= h; y += 0.2) cb.add(WM.metalDark, new THREE.BoxGeometry(L, 0.012, 0.012), mat((ax + bx) / 2, y, (az + bz) / 2, 0, yaw), col);
    for (let t = 0; t < L; t += 0.2) { const k = t / L; cb.add(WM.metalDark, new THREE.BoxGeometry(0.012, h - 0.1, 0.012), mat(ax + (bx - ax) * k, h / 2, az + (bz - az) * k, 0, yaw), col); }
  }
}

/** Road guardrail (W-beam) along a polyline. */
export function guardrail(cb, pts, y = 0.55) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
    const yaw = -Math.atan2(bz - az, bx - ax);
    const g = new THREE.BoxGeometry(L + 0.05, 0.32, 0.06);
    cb.add(WM.galv, g, mat((ax + bx) / 2, y, (az + bz) / 2, 0, yaw));
    cb.add(WM.galv, new THREE.BoxGeometry(L + 0.05, 0.05, 0.1), mat((ax + bx) / 2, y + 0.1, (az + bz) / 2, 0, yaw));
    const n = Math.max(1, Math.round(L / 2));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; cb.add(WM.galv, new THREE.BoxGeometry(0.1, y + 0.1, 0.12), mat(ax + (bx - ax) * t, (y + 0.1) / 2, az + (bz - az) * t, 0, yaw)); }
  }
}
