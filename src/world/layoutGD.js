// Line 9 extension: ул. „Нишава“ (S5), бул. „Петко Ю. Тодоров“ (S6), the junction with бул. „Гоце Делчев“
// (X6, tram line) and the бул. Гоце Делчев stop by Южен парк.
import * as THREE from 'three';
import { WM } from './materials.js';
import { hmat, polyGeo, stripGeo } from './common.js';
import { streetPts } from './roads.js';
import * as BLD from './buildings.js';
import * as B2 from './buildings2.js';
import * as PR from './props.js';
import { R, rr, pick, chance, mat } from '../util.js';

export function layoutGD(L) {
  const { route, cb, occ, reg, S, at, fr, place, markB, addTree, tryTree, parkCar, faceRoadYaw } = L;
  const S5 = S.S5, S6 = S.S6, X6 = S.X6;
  const sGD = 1470, sI6 = 1350;

  /* ================= бул. Гоце Делчев stop (south side of S6, Южен парк) ================= */
  {
    const st = S6, side = 1, curb = st.halfW;
    const [px, pz] = at(st, sGD + 2, curb + 1.1);
    PR.stopPole(cb, px, pz, faceRoadYaw(st, sGD, 1), 'бул. Гоце Делчев');
    const sh = place(BLD.busShelter, st, sGD - 7, side, curb + 3.6, { L: 5.2 });
    occ.markRect(sh.x, sh.z, sh.h, 3.4, 1.5, 1);
    // light-box poster next to the shelter
    const [lx, lz, lh] = at(st, sGD - 11, curb + 3.3);
    cb.add(WM.metalDark, new THREE.BoxGeometry(1.3, 2.1, 0.22), mat(lx, 1.2, lz, 0, -lh), 0x2a2c30);
    // local +z of a yaw(-lh) frame points to (−sin lh, cos lh) in world
    for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(1.15, 1.9); if (s < 0) g.rotateY(Math.PI); cb.add(WM.posters[2], g, mat(lx - Math.sin(lh) * s * 0.12, 1.2, lz + Math.cos(lh) * s * 0.12, 0, -lh)); }
    const [bx, bz] = at(st, sGD - 1, curb + 1.0); PR.trashBin(cb, bx, bz);
    // striped bollards along the curb (both sides of the stop bay)
    const bol = []; for (let s = sGD - 40; s < sGD + 30; s += 3.2) if (Math.abs(s - (sGD - 7)) > 4) { const [x, z] = at(st, s, curb + 0.45); bol.push([x, z]); }
    PR.bollardRow(cb, bol);
    // old concrete trolley/lamp pole in the middle of the platform
    const [cx, cz] = at(st, sGD - 16, curb + 2.2);
    cb.add(WM.concrete, new THREE.CylinderGeometry(0.16, 0.24, 9.5, 10), mat(cx, 4.75, cz), 0xb7b5ae);
    // wide paved platform, then the park lawn with a diagonal path
    const plat = [at(st, sGD - 45, curb + 0.2), at(st, sGD + 25, curb + 0.2), at(st, sGD + 25, curb + 9), at(st, sGD - 45, curb + 9)].map(([x, z]) => [x, z]);
    cb.add(WM.pavers, polyGeo(plat, 0.155, [], 2));
    occ.markRect(...at(st, sGD - 10, curb + 4.6).slice(0, 2), st.poly.at(sGD).h, 35, 4.4, 2);
    const diag = [at(st, sGD - 30, curb + 9), at(st, sGD - 22, curb + 9), at(st, sGD + 30, curb + 60), at(st, sGD + 22, curb + 60)].map(([x, z]) => [x, z]);
    cb.add(WM.pavers, polyGeo(diag, 0.03, [], 2));
    const stopWait = [];
    for (let k = 0; k < 10; k++) { const [x, z] = at(st, sGD - rr(2, 16), curb + rr(1.2, 4.2)); stopWait.push({ p: new THREE.Vector3(x, 0.15, z), yaw: faceRoadYaw(st, sGD, 1) + rr(-0.7, 0.7) }); }
    reg.stopsInfo.push({ id: 'gd', pole: new THREE.Vector3(px, 0.15, pz), wait: stopWait, shelterBench: sh });

    // ---- Южен парк: big old trees, dry lawn, park cafés with green umbrellas ----
    for (let k = 0; k < 90; k++) {
      const s = rr(sI6 + 30, st.poly.length - 5), lat = curb + rr(12, 150);
      const [x, z] = at(st, s, lat);
      tryTree(x, z, pick(['linden', 'chestnut', 'linden', 'birch', 'spruce', 'chestnut']));
    }
    for (const [s, lat, name] of [[sGD + 70, curb + 30, 'РЕСТОРАНТ „ПАРКА“'], [sGD + 150, curb + 24, 'КАФЕ-БАР']]) {
      const pc = place(B2.parkCafe, st, s, side, lat, { W: 16, D: 11, name });
      occ.markRect(pc.x, pc.z, pc.h, 9.5, 7, 1);
    }
    // park paths & benches
    const path = streetPts(st, sGD + 25, st.poly.length - 10, 4);
    cb.add(WM.pavers, stripGeo(path, curb + 18, curb + 20.5, 0.03, 0.03, { uvScale: 2 }));
    for (let s = sGD + 40; s < st.poly.length - 20; s += 34) {
      const [x, z, h] = at(st, s, curb + 21.3);
      const bc = { add: (m, g, lm, col) => cb.add(m, g, lm, col) };
      BLD.bench(bc, x, z, -h + Math.PI); reg.benches.push({ p: new THREE.Vector3(x, 0.02, z), yaw: -h + 2 * Math.PI });
    }
    reg.reserve.push({ st, a: sI6 + 20, b: st.poly.length, side: 1 });
  }

  /* ---------- park cafés before the junction (stop side) + McDonald's-style billboard ---------- */
  {
    const st = S6;
    const pc = place(B2.parkCafe, st, sI6 - 95, 1, st.halfW + st.sidewalk + 14, { W: 20, D: 12, name: 'ГРАДИНА „ЮЖЕН ПАРК“' });
    occ.markRect(pc.x, pc.z, pc.h, 11, 7.5, 1);
    for (let k = 0; k < 26; k++) { const [x, z] = at(st, rr(sI6 - 200, sI6 - 30), st.halfW + rr(8, 70)); tryTree(x, z, pick(['spruce', 'linden', 'spruce', 'chestnut'])); }
    const bb = place(B2.billboard, st, sI6 - 45, 1, st.halfW + st.sidewalk + 3, { kind: 0 }, Math.PI / 2 - 0.5);
    occ.markDisc(bb.x, bb.z, 2, 1);
    // low graffiti wall with railing along the park edge
    const wall = streetPts(st, sI6 - 70, sI6 - 28, 3).map(([x, z], i) => { const f = fr(st, sI6 - 70 + i * 3); return [x + f.rx * (st.halfW + st.sidewalk + 1.2), z + f.rz * (st.halfW + st.sidewalk + 1.2)]; });
    for (let i = 0; i < wall.length - 1; i++) {
      const [ax, az] = wall[i], [bx, bz] = wall[i + 1], len = Math.hypot(bx - ax, bz - az);
      const g = new THREE.PlaneGeometry(len, 1.1); const uv = g.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setXY(j, (uv.getX(j) * len + i * len) / 8, uv.getY(j) * 0.3);
      for (const s of [0, Math.PI]) { const gg = g.clone(); gg.rotateY(s); cb.add(WM.graffiti, gg, mat((ax + bx) / 2, 0.55, (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax))); }
    }
    PR.barrier(cb, wall.map(([x, z]) => [x, z]));
    reg.reserve.push({ st, a: sI6 - 210, b: sI6 + 20, side: 1 });
  }

  /* ================= opposite the stop (north side of S6) ================= */
  {
    const st = S6, side = -1, base = st.halfW + st.sidewalk;
    // underpass right after the junction, on the far side
    const up = place(B2.underpass, st, sI6 + 32, side, base + 2.4, { L: 12, W: 3.6 }, Math.PI / 2);
    occ.markRect(up.x, up.z, up.h, 7, 3, 1);
    const up2 = place(B2.underpass, st, sI6 + 34, 1, st.halfW + st.sidewalk + 2.4, { L: 12, W: 3.6 }, -Math.PI / 2);
    occ.markRect(up2.x, up2.z, up2.h, 7, 3, 1);
    // tall brick-striped 1980s block with the UniCredit Bulbank annex (modern 2020 bank office)
    const t1 = place(B2.brickStripeTower, st, sGD + 10, side, base + 18 + 7, { L: 48, D: 13, floors: 15, bank: true });
    markB(t1.x, t1.z, t1.h, 48, 13 + 16, 2);
    // steel fence between sidewalk and the bank forecourt
    const fence = streetPts(st, sGD - 16, sGD + 36, 2.6).map(([x, z], i) => { const f = fr(st, sGD - 16 + i * 2.6); return [x - f.rx * (base + 0.5), z - f.rz * (base + 0.5)]; });
    PR.barrier(cb, fence);
    // second old block: 9-storey red brick with a giant billboard and BIKE CENTER on the ground floor
    const t2 = place(B2.redBrickBlock, st, sI6 + 62, side, base + 9 + 7, { L: 18, D: 14, floors: 9, billboard: 1, shops: [{ text: 'BIKE CENTER', bg: '#111111', fg: '#ffffff' }, { text: 'ОПТИКА', bg: '#f2f2f2', fg: '#1a4e8a' }] });
    markB(t2.x, t2.z, t2.h, 18, 14, 2);
    // 2006-style industrial / commercial buildings
    const i1 = place(B2.industrialHall, st, sGD + 70, side, base + 16 + 9, { L: 34, D: 18, H: 8.5, sign: 'АЛЕКСАНДЪР ЛОДЖИСТИКС', signBg: '#23408e' });
    markB(i1.x, i1.z, i1.h, 34, 18, 2);
    const i2 = place(B2.industrialHall, st, sGD + 120, side, base + 12 + 8, { L: 30, D: 16, H: 7.5, sign: 'АВТОЧАСТИ • СЕРВИЗ', signBg: '#b3262d', fmat: WM.industrialB });
    markB(i2.x, i2.z, i2.h, 30, 16, 2);
    const i3 = place(B2.industrialHall, st, sGD + 175, side, base + 20 + 10, { L: 40, D: 20, H: 10, sign: 'СТРОИТЕЛНИ МАТЕРИАЛИ', signBg: '#2e7d32' });
    markB(i3.x, i3.z, i3.h, 40, 20, 2);
    // service lot with a delivery truck
    for (let k = 0; k < 6; k++) { const [x, z, h] = at(st, sGD + 60 + k * 3, -(base + 5)); parkCar(x, z, h + Math.PI / 2, 0, k === 2 ? 'van' : undefined); }
    const lot = [at(st, sGD + 52, -(base + 1)), at(st, sGD + 200, -(base + 1)), at(st, sGD + 200, -(base + 9)), at(st, sGD + 52, -(base + 9))].map(([x, z]) => [x, z]);
    cb.add(WM.asphalt, polyGeo(lot, 0.004, [], 5));
    // birches along the fence (as in the photos)
    for (let s = sI6 + 40; s < sGD + 50; s += 7) { const [x, z] = at(st, s, -(base + 1.8)); tryTree(x, z, 'birch'); }
    reg.reserve.push({ st, a: sI6 + 20, b: st.poly.length, side: -1 });
  }

  /* ================= tram tracks & overhead on бул. „Гоце Делчев“ (X6) ================= */
  {
    const st = X6;
    for (const lat of [-1.75, 1.75]) {
      const pts = streetPts(st, 2, st.poly.length - 2, 3);
      cb.add(WM.concrete, stripGeo(pts, lat - 1.0, lat + 1.0, 0.004, 0.004, { uvScale: 3 }), null, 0x8f8d88);
      for (const g of [-0.5045, 0.5045]) { // Sofia narrow gauge (1009 mm)
        cb.add(WM.rail, stripGeo(pts, lat + g - 0.04, lat + g + 0.04, 0.012, 0.012, { uvScale: 1 }));
        cb.add(WM.railTop, stripGeo(pts, lat + g - 0.028, lat + g + 0.028, 0.014, 0.014, { uvScale: 1 }));
      }
    }
    // tram poles with double cantilevers on the median line
    const wires = [];
    for (let s = 20; s < st.poly.length - 10; s += 32) {
      const [x, z, h] = at(st, s, 0);
      if (Math.hypot(x - route.I6.x, z - route.I6.z) < 26) continue;
      cb.add(WM.galv, new THREE.CylinderGeometry(0.13, 0.19, 8.4, 10), mat(x, 4.2, z));
      for (const sd of [-1, 1]) {
        const ax = -Math.sin(h) * sd, az = Math.cos(h) * sd;
        cb.add(WM.galv, new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6).rotateZ(Math.PI / 2), mat(x + ax * 1.1, 6.9, z + az * 1.1, 0, -Math.atan2(az, ax)));
        cb.add(WM.galv, new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6).rotateZ(Math.PI / 2 + 0.25), mat(x + ax * 1.0, 6.45, z + az * 1.0, 0, -Math.atan2(az, ax)));
        cb.add(WM.metalDark, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), mat(x + ax * 1.75, 6.65, z + az * 1.75));
      }
      wires.push([x, z, h]);
    }
    reg.tramWires = reg.tramWires || [];
    for (const sd of [-1, 1]) {
      const line = wires.map(([x, z, h], i) => [x - Math.sin(h) * sd * 1.75 + Math.cos(h) * (i % 2 ? 0.2 : -0.2) * 0, 6.1, z + Math.cos(h) * sd * 1.75]);
      reg.tramWires.push(line);
    }
  }

  /* ================= mini-parks & 2023 buildings along S5 / S6 ================= */
  {
    const mp1 = place(B2.miniPark, S5, 720, 1, S5.halfW + S5.sidewalk + 3 + 17, { W: 46, D: 34, fountain: true }, Math.PI / 2);
    markB(mp1.x, mp1.z, mp1.h, 46, 34, 0);
    for (const [x, z] of mp1.res.trees) addTree(x, z, pick(['linden', 'chestnut', 'birch', 'small']));
    reg.reserve.push({ st: S5, a: 690, b: 760, side: 1 });
    const mp2 = place(B2.miniPark, S6, 620, -1, S6.halfW + S6.sidewalk + 3 + 15, { W: 40, D: 30, fountain: false }, 0);
    markB(mp2.x, mp2.z, mp2.h, 40, 30, 0);
    for (const [x, z] of mp2.res.trees) addTree(x, z, pick(['linden', 'chestnut', 'spruce', 'small']));
    reg.reserve.push({ st: S6, a: 590, b: 650, side: -1 });

    const offices = [
      [S5, 520, -1, { L: 44, D: 18, floors: 9, style: 'ceramic', sign: 'БИЗНЕС ЦЕНТЪР „НИШАВА“', signBg: '#2b2b2b', signFg: '#ffffff' }],
      [S5, 1010, 1, { L: 42, D: 16, floors: 8, style: 'white' }],
      [S5, 1480, -1, { L: 38, D: 20, floors: 11, style: 'curtain', glass: WM.curtainBlue, sign: 'OFFICE PARK', signBg: '#0d3b66' }],
      [S6, 880, 1, { L: 40, D: 16, floors: 7, style: 'beige' }],
    ];
    for (const [st, s, side, o] of offices) {
      const setback = 8;
      const r = place(B2.modernOffice, st, s, side, st.halfW + st.sidewalk + setback + o.D / 2, o);
      markB(r.x, r.z, r.h, o.L, o.D, 2);
      // landscaped forecourt
      for (let k = 0; k < 4; k++) { const [x, z] = at(st, s + (k - 1.5) * (o.L / 4), side * (st.halfW + st.sidewalk + 2.5)); tryTree(x, z, pick(['small', 'birch'])); }
      reg.reserve.push({ st, a: s - o.L / 2 - 6, b: s + o.L / 2 + 6, side });
    }
  }
}

/** Building mix for the communist-era corridor along S5 / S6 / X6 (used by the procedural fill). */
export function fillGD(cb, M, reg, kind, L, D, fl, rnd) {
  switch (kind) {
    case 'b80': {
      const n = L > 48 ? 3 : 2, segs = [];
      for (let k = 0; k < n; k++) segs.push([L / n, fl + (k % 2) * 2 + (rnd() < 0.3 ? 2 : 0)]);
      return B2.block80s(cb, M, reg, { segs, D });
    }
    case 'brick': return B2.brickStripeTower(cb, M, reg, { L, D, floors: fl });
    case 'red': return B2.redBrickBlock(cb, M, reg, { L: Math.min(L, 22), D, floors: Math.min(fl, 10), billboard: rnd() < 0.4 ? Math.floor(rnd() * 6) : undefined });
    case 'sliver': return B2.sliverTower(cb, M, reg, { W: 15, D: 13, floors: fl + 3 });
    case 'hall': return B2.industrialHall(cb, M, reg, { L, D, H: 7 + rnd() * 3, fmat: rnd() < 0.5 ? WM.industrial : WM.industrialB, sign: pick(['ТЕХНОМАРКЕТ', 'СКЛАД', 'АВТОСЕРВИЗ', 'МЕБЕЛИ', 'ПЕЧАТНИЦА']), signBg: pick(['#23408e', '#b3262d', '#2e7d32', '#444']) });
    default: return null;
  }
}
export { R, chance, hmat };
