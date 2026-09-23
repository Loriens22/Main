// Places buildings, set pieces, trees, parked cars and people spots along the route.
import * as THREE from 'three';
import { WM } from './materials.js';
import { hmat, polyGeo, stripGeo } from './common.js';
import { streetPts } from './roads.js';
import * as BLD from './buildings.js';
import * as PR from './props.js';
import { R, rr, ri, pick, chance, mat, makeRng } from '../util.js';

const SHOPS = [
  { text: 'АПТЕКА', bg: '#1b7a3a', fg: '#fff' }, { text: 'ХРАНИТЕЛНИ СТОКИ', bg: '#c0392b', fg: '#fff' }, { text: 'КАФЕ • БАНИЧКИ', bg: '#6d4c2e', fg: '#ffe7b0' },
  { text: 'ЦВЕТЯ', bg: '#8e24aa', fg: '#fff' }, { text: 'ФРИЗЬОР', bg: '#263238', fg: '#fff' }, { text: 'ОПТИКА', bg: '#1565c0', fg: '#fff' },
  { text: 'ЗАКУСВАЛНЯ', bg: '#ef6c00', fg: '#fff' }, { text: 'БАНКОМАТ', bg: '#0d47a1', fg: '#fff' }, { text: 'ЛОТАРИЯ', bg: '#f9a825', fg: '#222' },
  { text: 'ХЛЯБ', bg: '#795548', fg: '#fff' }, { text: 'ДРОГЕРИЯ', bg: '#ad1457', fg: '#fff' }, { text: 'ОБМЕННО БЮРО', bg: '#2e7d32', fg: '#fff' },
  { text: 'МОБИЛНИ ТЕЛЕФОНИ', bg: '#212121', fg: '#4fc3f7' }, { text: 'ВЕТЕРИНАРНА КЛИНИКА', bg: '#00796b', fg: '#fff' }, { text: 'ПЕКАРНА', bg: '#a1887f', fg: '#fff' },
];
const MARKETS = [
  { name: 'СУПЕРМАРКЕТ', band: 0xc0272d, signBg: '#c0272d' }, { name: 'МАРКЕТ 24/7', band: 0x1b5e20, signBg: '#1b5e20' },
  { name: 'ХИПЕРМАРКЕТ', band: 0x0d47a1, signBg: '#0d47a1' }, { name: 'ДЕЛИКАТЕСИ', band: 0x6a1b9a, signBg: '#6a1b9a' },
];

export function layoutWorld(route, cb, occ, reg, roadsInfo) {
  const trees = [], parked = [];
  reg.trees = trees; reg.parked = parked;
  const S = route.S;
  const fr = (st, s) => { const p = st.poly.at(s); return { x: p.x, z: p.z, h: p.h, rx: -Math.sin(p.h), rz: Math.cos(p.h) }; };
  const at = (st, s, lat) => { const f = fr(st, s); return [f.x + f.rx * lat, f.z + f.rz * lat, f.h]; };
  /** Place a building by street coordinates; side +1 right / -1 left; latC = lateral of building centre. */
  const place = (fn, st, s, side, latC, opts = {}, rot = 0) => {
    const f = fr(st, s);
    const x = f.x + f.rx * latC * side, z = f.z + f.rz * latC * side;
    const h = (side > 0 ? f.h : f.h + Math.PI) + rot;
    const M = hmat(x, 0, z, h);
    const res = fn(cb, M, reg, opts);
    return { x, z, h, M, res };
  };
  const markB = (x, z, h, L, D, m = 3) => occ.markRect(x, z, h, L / 2 + m, D / 2 + m, 1);
  const freeB = (x, z, h, L, D, m = 2) => occ.rectFree(x, z, h, L / 2 + m, D / 2 + m, 0);
  const addTree = (x, z, kind, s = rr(0.85, 1.15)) => { trees.push({ x, z, kind, s, rot: R() * 6.28, hue: rr(-0.03, 0.05) }); occ.markDisc(x, z, 1.5, 1); };
  const tryTree = (x, z, kind) => { if (occ.get(x, z) === 0) { addTree(x, z, kind); return true; } return false; };
  const carTypes = ['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'small', 'small', 'van', 'taxi'];
  const parkCar = (x, z, h, y = 0, type) => parked.push({ x, z, h, y, type: type || pick(carTypes.slice(0, 8)), color: pick(COLORS) });

  /* =========================================================
     BOROVO TERMINAL (ring centre at 0,0; stop on the west side)
     ========================================================= */
  {
    const pav = hmat(-40.5, 0, 1.5, Math.PI / 2);
    BLD.kioskPavilion(cb, pav, reg); occ.markRect(-40.5, 1.5, Math.PI / 2, 14, 5, 1);
    BLD.towerBlock(cb, hmat(-82, 0, 16, Math.PI / 2), reg, { floors: 17 }); markB(-82, 16, Math.PI / 2, 21, 19);
    BLD.panelBlock(cb, hmat(-78, 0, -62, Math.PI / 2 + 0.1), reg, { L: 54, floors: 5, fmat: WM.panelC }); markB(-78, -62, Math.PI / 2 + 0.1, 54, 12);
    BLD.utilityBox(cb, hmat(-37, 0, -35, Math.PI / 2 + 0.25), reg, { L: 10, D: 6.5 }); markB(-37, -35, Math.PI / 2 + 0.25, 10, 6.5, 1);
    parked.push({ x: -31.2, z: -31.5, h: -Math.PI / 2 + 0.25, y: 0.15, type: 'van', color: 0xc4231c, special: 'carpet' });
    BLD.oldHouse(cb, hmat(43, 0, 8, -Math.PI / 2), reg, { L: 9, D: 7, wall: 0xd9cbb2 }); markB(43, 8, -Math.PI / 2, 9, 7, 1);
    BLD.oldHouse(cb, hmat(49, 0, -18, -Math.PI / 2 - 0.2), reg, { L: 8, D: 6.5, wall: 0xe0d2bd }); markB(49, -18, -Math.PI / 2, 8, 6.5, 1);
    BLD.panelBlock(cb, hmat(92, 0, 18, -Math.PI / 2), reg, { L: 48, floors: 8, fmat: WM.panelA, balc: 'both' }); markB(92, 18, -Math.PI / 2, 48, 12);
    BLD.panelBlock(cb, hmat(8, 0, 78, 0), reg, { L: 66, floors: 8, fmat: WM.panelB, shops: [SHOPS[1], SHOPS[0], SHOPS[9]] }); markB(8, 78, 0, 66, 12);
    BLD.panelBlock(cb, hmat(-70, 0, 70, 0.25), reg, { L: 42, floors: 6, fmat: WM.panelA }); markB(-70, 70, 0.25, 42, 12);
    // stop furniture on the platform
    PR.stopPole(cb, -29.8, 2.4, Math.PI / 2, 'ж.к. Борово');
    PR.trashBin(cb, -30, 6); PR.trashBin(cb, -30, -9);
    PR.trafficMirror(cb, 26, -34, -2.4);
    const benchC = { cb, M: new THREE.Matrix4(), add(m, g, lm, c) { return cb.add(m, g, lm, c); } };
    BLD.bench(benchC, -33, 12, Math.PI / 2); BLD.bench(benchC, -33, -12, Math.PI / 2);
    reg.benches.push({ p: new THREE.Vector3(-32.9, 0.15, 12), yaw: -Math.PI / 2 }, { p: new THREE.Vector3(-32.9, 0.15, -12.6), yaw: -Math.PI / 2 });
    // central catenary mast on the island + island greenery
    cb.add(WM.metal, new THREE.CylinderGeometry(0.2, 0.3, 9.5, 12), mat(0, 4.9, 0));
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.3, r = 6 + (k % 3) * 4; addTree(Math.cos(a) * r, Math.sin(a) * r, k % 4 === 0 ? 'spruce' : pick(['linden', 'chestnut', 'small'])); }
    for (let k = 0; k < 14; k++) { const a = rr(0, 6.28); const x = -20 + rr(-35, -5), z = rr(-45, 50); void a; tryTree(x - 25, z, pick(['linden', 'chestnut', 'small', 'birch'])); }
    for (let k = 0; k < 18; k++) tryTree(rr(35, 75), rr(-60, 55), pick(['linden', 'chestnut', 'small', 'spruce', 'birch']));
    for (let k = 0; k < 10; k++) tryTree(rr(-60, 60), rr(40, 62), pick(['linden', 'chestnut', 'small']));
    // parking along the south-east
    for (let k = 0; k < 7; k++) parkCar(22 + k * 2.6, 44, Math.PI / 2 + rr(-0.05, 0.05), 0);
    const lot = polyGeo([[18, 40], [42, 40], [42, 48], [18, 48]], 0.005, [], 5); cb.add(WM.asphalt, lot);
    reg.stopsInfo.push({ id: 'borovo', pole: new THREE.Vector3(-29.8, 0.15, 2.4), wait: waitPts(-34, 2, 'borovo') });
  }
  function waitPts(cx, cz) {
    // around the pavilion front (Borovo)
    const out = []; for (let k = 0; k < 10; k++) out.push({ p: new THREE.Vector3(cx + rr(-2.5, 3.2), 0.15, cz + rr(-9, 9)), yaw: -Math.PI / 2 + rr(-0.6, 0.6) });
    return out;
  }

  /* =========================================================
     20 ДКЦ stop (ул. Ген. Стефан Тошев)
     ========================================================= */
  const stopDcc = route.stops[1];
  const pD = route.pose(stopDcc.s);
  const sD = S.S1.poly.project(pD.x, pD.z).s;
  {
    const st = S.S1;
    // stop pole + shelter on the right (east) sidewalk
    const [px, pz] = at(st, sD + 1.5, 7.7);
    PR.stopPole(cb, px, pz, faceRoadYaw(st, sD, 1), '20 ДКЦ');
    const sh = place(BLD.busShelter, st, sD - 6, 1, 7 + 3.5, { L: 4.4 });
    occ.markRect(sh.x, sh.z, sh.h, 3, 1.5, 1);
    const [bx, bz] = at(st, sD - 1, 8.1); PR.trashBin(cb, bx, bz);
    // 9-storey panel block with shops (lab, computers, pharmacy) right behind the sidewalk
    const blk = place(BLD.panelBlock, st, sD - 8, 1, 11.5 + 4.2 + 6, { L: 66, floors: 9, fmat: WM.panelB, glazedP: 0.75, shops: [{ text: 'КОМПЮТРИ • ЛАПТОПИ', bg: '#eceff1', fg: '#263238' }, { text: 'ЛАБОРАТОРИЯ „КАНДИЛАРОВ“', bg: '#1565c0', fg: '#fff' }, { text: 'АПТЕКА', bg: '#1b7a3a', fg: '#fff' }] });
    markB(blk.x, blk.z, blk.h, 66, 12, 1);
    // birch + bushes between the sidewalk and the block
    const [tx, tz] = at(st, sD - 2, 13.2); addTree(tx, tz, 'birch', 1.15);
    for (let k = 0; k < 5; k++) { const [hx, hz] = at(st, sD - 14 + k * 3, 13.0); cb.add(WM.hedge, new THREE.SphereGeometry(0.8, 8, 6), mat(hx, 0.4, hz, 0, 0, 0, 1, 0.7, 1), 0x3f6a2c); }
    // mehana Дойранъ across (west) + white van at the curb
    const meh = place(BLD.mehana, st, sD + 22, -1, 11.5 + 1.0 + 7.3);
    occ.markRect(meh.x, meh.z, meh.h, 14, 10, 1);
    const [vx, vz, vh] = at(st, sD + 24, -5.3); parked.push({ x: vx, z: vz, h: vh + Math.PI, y: 0, type: 'van', color: 0xf2f2f0, blocksLane: true });
    // polyclinic ДКЦ 20 set back behind trees (west, slightly before the stop)
    const pc = place(BLD.polyclinic, st, sD - 55, -1, 11.5 + 12 + 8);
    markB(pc.x, pc.z, pc.h, 54, 16);
    for (let k = 0; k < 8; k++) { const [x, z] = at(st, sD - 85 + k * 8, -(11.5 + 4.5)); tryTree(x, z, pick(['linden', 'chestnut'])); }
    // supermarket a bit further on the right
    const sm = place(BLD.supermarket, st, sD + 75, 1, 11.5 + 22 + 13, { L: 40, D: 26, ...MARKETS[0] });
    markB(sm.x, sm.z, sm.h, 40, 26);
    for (let k = 0; k < 12; k++) { const [x, z, h] = at(st, sD + 60 + k * 2.6, 11.5 + 8.5); parkCar(x, z, h + Math.PI / 2, 0); }
    const lotPts = [at(st, sD + 57, 12), at(st, sD + 93, 12), at(st, sD + 93, 30), at(st, sD + 57, 30)].map(([x, z]) => [x, z]);
    cb.add(WM.asphalt, polyGeo(lotPts, 0.004, [], 5));
    const stopWait = [];
    for (let k = 0; k < 10; k++) { const [x, z] = at(st, sD - rr(2, 13), 7 + rr(1.0, 3.6)); stopWait.push({ p: new THREE.Vector3(x, 0.15, z), yaw: faceRoadYaw(st, sD, 1) + rr(-0.7, 0.7) + Math.PI }); }
    reg.stopsInfo.push({ id: 'dcc20', pole: new THREE.Vector3(px, 0.15, pz), wait: stopWait, shelterBench: sh });
    reg.reserve.push({ st, a: sD - 90, b: sD + 100, side: 1 }, { st, a: sD - 90, b: sD + 40, side: -1 });
  }

  /* =========================================================
     36 СУ stop (S4)
     ========================================================= */
  const s36 = 870;
  {
    const st = S.S4;
    const [px, pz] = at(st, s36 + 1.5, 7.7);
    PR.stopPole(cb, px, pz, faceRoadYaw(st, s36, 1), '36 СУ');
    const sh = place(BLD.busShelter, st, s36 - 6, 1, 7 + 3.5, { L: 4.4 });
    occ.markRect(sh.x, sh.z, sh.h, 3, 1.5, 1);
    const [bx, bz] = at(st, s36 - 1, 8.1); PR.trashBin(cb, bx, bz);
    // small park with playground on the stop side (before the stop)
    const pg = place(BLD.playground, st, s36 - 42, 1, 11.5 + 5 + 8, { W: 22, D: 16 });
    reg.playground = pg.res;
    occ.markRect(pg.x, pg.z, pg.h, 12, 9, 1);
    for (let k = 0; k < 14; k++) { const [x, z] = at(st, s36 - 88 + k * 6, 11.5 + rr(1.5, 3)); tryTree(x, z, pick(['linden', 'chestnut', 'linden'])); }
    for (let k = 0; k < 12; k++) { const [x, z] = at(st, s36 - 90 + rr(0, 80), 11.5 + rr(22, 38)); tryTree(x, z, pick(['linden', 'chestnut', 'spruce', 'birch'])); }
    // park paths + benches
    const pathPts = streetPts(st, s36 - 88, s36 - 8, 4);
    cb.add(WM.pavers, stripGeo(pathPts, 11.5 + 18.5, 11.5 + 20.3, 0.03, 0.03, { uvScale: 2 }));
    for (const ds of [-70, -58]) { const [x, z, h] = at(st, s36 + ds, 11.5 + 21.4); const c = { add: (m, g, lm, col) => cb.add(m, g, lm, col) }; BLD.bench(c, x, z, -h + Math.PI); reg.benches.push({ p: new THREE.Vector3(x, 0.02, z), yaw: -h + 2 * Math.PI }); }
    // modern 2004 blocks after the stop (corner of ул. Пчела) + parking lot
    const mb = place(BLD.modernBlock, st, s36 + 60, 1, 11.5 + 9 + 7, { L: 38, floors: 7, fmat: WM.modernA, accent: 0x9a9fa6, shops: [SHOPS[5], SHOPS[3]] });
    markB(mb.x, mb.z, mb.h, 38, 14);
    for (let k = 0; k < 11; k++) { const [x, z, h] = at(st, s36 + 42 + k * 2.7, 11.5 + 4.3); parkCar(x, z, h + Math.PI / 2 + rr(-0.06, 0.06), 0); }
    const lot = [at(st, s36 + 39, 11.6), at(st, s36 + 82, 11.6), at(st, s36 + 82, 17.5), at(st, s36 + 39, 17.5)].map(([x, z]) => [x, z]);
    cb.add(WM.asphalt, polyGeo(lot, 0.004, [], 5));
    const mb2 = place(BLD.modernBlock, st, s36 + 115, 1, 11.5 + 6 + 7, { L: 45, floors: 6, fmat: WM.modernC, accent: 0xc9a25a });
    markB(mb2.x, mb2.z, mb2.h, 45, 14);
    // opposite: small market before the school, then the old school, then more modern blocks
    const mk = place(BLD.marketStalls, st, s36 - 55, -1, 11.5 + 3.2, { n: 6 });
    occ.markRect(mk.x, mk.z, mk.h, 11, 3, 1);
    const sc = place(BLD.schoolBuilding, st, s36 + 6, -1, 11.5 + 5.5 + 7, { L: 68, D: 14 });
    markB(sc.x, sc.z, sc.h, 68, 14, 2);
    // pedestrian barrier along the school
    const bar = streetPts(st, s36 - 28, s36 + 38, 3.3).map(([x, z], i, a) => { const f = fr(st, s36 - 28 + i * 3.3); return [x - f.rx * 7.35, z - f.rz * 7.35]; });
    PR.barrier(cb, bar);
    for (let k = 0; k < 9; k++) { const [x, z] = at(st, s36 - 30 + k * 8, -(11.5 + 1.8)); tryTree(x, z, pick(['linden', 'birch', 'chestnut'])); }
    const mb3 = place(BLD.modernBlock, st, s36 + 78, -1, 11.5 + 8 + 7, { L: 42, floors: 8, fmat: WM.modernB, accent: 0x6f7880, shops: [SHOPS[2], SHOPS[7]] });
    markB(mb3.x, mb3.z, mb3.h, 42, 14);
    const mb4 = place(BLD.modernBlock, st, s36 + 135, -1, 11.5 + 8 + 7, { L: 38, floors: 7, fmat: WM.modernA, accent: 0xb45d3f });
    markB(mb4.x, mb4.z, mb4.h, 38, 14);
    const stopWait = [];
    for (let k = 0; k < 8; k++) { const [x, z] = at(st, s36 - rr(2, 12), 7 + rr(1.0, 3.6)); stopWait.push({ p: new THREE.Vector3(x, 0.15, z), yaw: faceRoadYaw(st, s36, 1) + Math.PI + rr(-0.7, 0.7) }); }
    reg.stopsInfo.push({ id: 'su36', pole: new THREE.Vector3(px, 0.15, pz), wait: stopWait });
    reg.market = mk;
    reg.reserve.push({ st, a: s36 - 100, b: s36 + 160, side: 1 }, { st, a: s36 - 100, b: s36 + 160, side: -1 });
  }

  /* =========================================================
     Procedural fill along all major streets
     ========================================================= */
  const rnd = makeRng(99);
  const reserved = (st, s, side) => reg.reserve.some((r) => r.st === st && r.side === side && s > r.a && s < r.b);
  for (const st of [S.S1, S.S2, S.S3, S.S4]) {
    for (const side of [1, -1]) {
      let s = st === S.S1 ? 70 : 30;
      const end = st.poly.length - 20;
      let n = 0;
      while (s < end) {
        n++;
        if (reserved(st, s, side)) { s += 10; continue; }
        const r = rnd();
        let kind, L, D, fl, setback, rot = 0;
        if (r < 0.46) { kind = 'panel'; L = pick([36, 42, 48, 54, 60, 66]); D = 12; fl = pick([5, 8, 8, 9, 9, 6]); setback = rr(5, 16); if (rnd() < 0.25) rot = Math.PI / 2; }
        else if (r < 0.66) { kind = 'modern'; L = pick([30, 36, 42]); D = 14; fl = pick([5, 6, 7, 8]); setback = rr(4, 10); }
        else if (r < 0.78) { kind = 'shop'; L = pick([8, 10, 12]); D = 7; setback = rr(1.5, 4); }
        else if (r < 0.86) { kind = 'market'; L = pick([36, 40, 46]); D = 26; setback = rr(16, 22); }
        else { kind = 'gap'; L = rr(15, 40); }
        if (kind === 'gap') { s += L; continue; }
        const along = rot ? D : L, across = rot ? L : D;
        const sc = s + along / 2;
        if (sc + along / 2 > end || reserved(st, sc + along / 2, side)) { s += 12; continue; }
        const latC = st.halfW + st.sidewalk + setback + across / 2;
        const f = fr(st, sc);
        const x = f.x + f.rx * latC * side, z = f.z + f.rz * latC * side;
        const h = (side > 0 ? f.h : f.h + Math.PI) + rot;
        if (!freeB(x, z, h, L, D, 2)) { s += 10; continue; }
        const M = hmat(x, 0, z, h);
        if (kind === 'panel') BLD.panelBlock(cb, M, reg, { L, floors: fl, fmat: pick([WM.panelA, WM.panelB, WM.panelC]), glazedP: rr(0.4, 0.75), shops: rnd() < 0.35 && !rot ? [pick(SHOPS), pick(SHOPS), pick(SHOPS)] : null, balc: rnd() < 0.3 ? 'both' : 'front' });
        else if (kind === 'modern') BLD.modernBlock(cb, M, reg, { L, floors: fl, fmat: pick([WM.modernA, WM.modernB, WM.modernC]), accent: pick([0xb45d3f, 0x6f7880, 0xc9a25a, 0x5b7fa0]), shops: rnd() < 0.7 ? [pick(SHOPS), pick(SHOPS)] : null });
        else if (kind === 'shop') { const sp = pick(SHOPS); BLD.shopPavilion(cb, M, reg, { L, D, text: sp.text, bg: sp.bg, fg: sp.fg }); }
        else if (kind === 'market') {
          BLD.supermarket(cb, M, reg, { L, D, ...pick(MARKETS) });
          // parking lot in front
          const lot = [[-L / 2, -D / 2 - 2], [L / 2, -D / 2 - 2], [L / 2, -D / 2 - setback + 1], [-L / 2, -D / 2 - setback + 1]].map(([lx, lz]) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(M); return [v.x, v.z]; });
          cb.add(WM.asphalt, polyGeo(lot, 0.004, [], 5));
          for (let k = 0; k < Math.floor(L / 2.7) - 1; k++) { const v = new THREE.Vector3(-L / 2 + 2 + k * 2.7, 0, -D / 2 - 5).applyMatrix4(M); if (rnd() < 0.75) parkCar(v.x, v.z, h + Math.PI / 2 + rr(-0.05, 0.05), 0); }
        }
        markB(x, z, h, L, D, 2);
        // trees & bushes around the building
        for (let k = 0; k < 4; k++) {
          const v = new THREE.Vector3(rr(-L / 2, L / 2), 0, (rnd() < 0.5 ? -1 : 1) * (D / 2 + rr(4, 9))).applyMatrix4(M);
          tryTree(v.x, v.z, pick(['linden', 'chestnut', 'small', 'birch', 'spruce', 'linden']));
        }
        // perpendicular parking in front of panel blocks with deep setback
        if (kind === 'panel' && setback > 11 && !rot) {
          for (let k = 0; k < Math.floor(L / 2.7) - 2; k++) {
            if (rnd() < 0.3) continue;
            const v = new THREE.Vector3(-L / 2 + 3 + k * 2.7, 0, -D / 2 - setback + 3.2).applyMatrix4(M);
            parkCar(v.x, v.z, h + Math.PI / 2 + rr(-0.06, 0.06), 0);
          }
          const lot = [[-L / 2 + 1.5, -D / 2 - setback + 0.8], [L / 2 - 1.5, -D / 2 - setback + 0.8], [L / 2 - 1.5, -D / 2 - setback + 5.8], [-L / 2 + 1.5, -D / 2 - setback + 5.8]].map(([lx, lz]) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(M); return [v.x, v.z]; });
          cb.add(WM.asphalt, polyGeo(lot, 0.004, [], 5));
        }
        s += along + rr(6, 22);
      }
      void n;
    }
  }

  /* ---------------- minor streets: blocks + parked cars ---------------- */
  for (const m of route.minors) {
    for (const side of [1, -1]) {
      for (let s = 18; s < m.poly.length - 14; s += 5.4) if (chance(0.72)) { const [x, z, h] = at(m, s, side * 2.55); parkCar(x, z, side > 0 ? h : h + Math.PI, 0); }
      const L = pick([36, 42, 48]);
      const f = fr(m, 30 + L / 2), latC = m.halfW + m.sidewalk + 6 + 6;
      const x = f.x + f.rx * latC * side, z = f.z + f.rz * latC * side, h = side > 0 ? f.h : f.h + Math.PI;
      if (freeB(x, z, h, L, 12)) { BLD.panelBlock(cb, hmat(x, 0, z, h), reg, { L, floors: pick([5, 6, 8]), fmat: pick([WM.panelA, WM.panelC]) }); markB(x, z, h, L, 12); }
      for (let s = 12; s < m.poly.length; s += 11) { const [x2, z2] = at(m, s, side * (m.halfW + m.sidewalk + 1.4)); tryTree(x2, z2, pick(['linden', 'small', 'chestnut'])); }
      for (let s = 20; s < m.poly.length; s += 30) { const [lx, lz, lh] = at(m, s, side * (m.halfW + 0.6)); PR.streetLamp(cb, lx, lz, -(lh + (side > 0 ? Math.PI / 2 : -Math.PI / 2)), 6.5); }
    }
    // street name plate & give-way sign at the junction
    const j = m.join; const [nx, nz] = at(j.st, j.s - j.side * 0 - 9, j.side * (j.st.halfW + 1.0));
    PR.streetNamePlate(cb, nx, nz, -j.st.poly.at(j.s).h, m.name);
  }

  /* ---------------- street trees & furniture along major streets ---------------- */
  for (const st of [S.S1, S.S2, S.S3, S.S4]) {
    for (const side of [1, -1]) {
      for (let s = 8; s < st.poly.length - 5; s += rr(9, 13)) {
        const [x, z] = at(st, s, side * (st.halfW + st.sidewalk + 1.7));
        if (occ.get(x, z) === 0) addTree(x, z, R() < 0.12 ? 'birch' : R() < 0.5 ? 'linden' : 'chestnut', rr(0.9, 1.2));
      }
      for (let s = 40; s < st.poly.length; s += rr(70, 130)) {
        const [x, z] = at(st, s, side * (st.halfW + st.sidewalk - 0.5));
        if (occ.get(x, z) <= 2) PR.trashBin(cb, x, z);
      }
    }
  }
  // speed limit signs / name plates
  for (const [st, s, side] of [[S.S1, 150, 1], [S.S1, 1250, 1], [S.S2, 520, 1], [S.S3, 520, 1], [S.S4, 520, 1], [S.S1, 900, -1]]) {
    const [x, z, h] = at(st, s, side * (st.halfW + 0.8));
    PR.roadSign(cb, x, z, Math.atan2(-Math.cos(h) * side, -Math.sin(h) * side), '40');
  }
  for (const it of route.inters) {
    const hA = it.a.st.poly.at(it.a.s).h;
    PR.streetNamePlate(cb, it.x + Math.cos(hA) * 25 - Math.sin(hA) * 13, it.z + Math.sin(hA) * 25 + Math.cos(hA) * 13, -hA, it.b.st.name);
  }
  for (const cr of roadsInfo.crossings) {
    const rx = -Math.sin(cr.h), rz = Math.cos(cr.h);
    for (const sd of [-1, 1]) PR.roadSign(cb, cr.x + rx * sd * 8.6 + Math.cos(cr.h) * sd * 2.5, cr.z + rz * sd * 8.6 + Math.sin(cr.h) * sd * 2.5, Math.atan2(rx * -sd, rz * -sd) + Math.PI / 2, 'ped', 2.3);
  }
  // recycling containers & kiosks sprinkled along sidewalks
  for (const [st, s, side] of [[S.S1, 480, 1], [S.S1, 1500, -1], [S.S2, 300, -1], [S.S3, 700, 1], [S.S4, 1100, 1]]) {
    const [x, z, h] = at(st, s, side * (st.halfW + st.sidewalk + 2.2));
    if (occ.get(x, z) === 0) { PR.recyclingSet(cb, x, z, -h); occ.markDisc(x, z, 4, 1); }
  }

  /* ---------------- parked cars on S4 (north side lane) ---------------- */
  {
    const st = S.S4;
    for (let s = 440; s < st.poly.length - 10; s += rr(5.3, 6.4)) {
      if (Math.abs(s - 900) < 14 || (s > s36 - 30 && s < s36 + 30)) continue;
      if (chance(0.82)) { const [x, z, h] = at(st, s, -5.3); parkCar(x, z, h + Math.PI + rr(-0.02, 0.02), 0); }
    }
    // a few cars half on the sidewalk on S1 (Sofia classic)
    for (let s = 300; s < S.S1.poly.length - 450; s += rr(60, 140)) {
      if (Math.abs(s - sD) < 80) continue;
      const [x, z, h] = at(S.S1, s, -(7.6)); parkCar(x, z, h + Math.PI, 0.08);
    }
  }

  /* ---------------- background city (simple blocks further away) ---------------- */
  const g2 = makeRng(5);
  occ.buildDist(2);
  for (let x = -700; x < 1700; x += 64) for (let z = -3300; z < 700; z += 64) {
    const cx = x + g2() * 30, cz = z + g2() * 30;
    // distance to the nearest road/sidewalk cell (distance field over the occupancy grid)
    const dmin = occ.dist(cx, cz);
    if (dmin < 58 || Math.hypot(cx, cz) < 120) continue;
    const h = [0, Math.PI / 2, 0.3, -0.4][Math.floor(g2() * 4)];
    const L = 30 + g2() * 36, D = 12 + g2() * 3;
    if (!freeB(cx, cz, h, L, D, 4)) continue;
    const fl = g2() < 0.2 ? 14 + Math.floor(g2() * 4) : 5 + Math.floor(g2() * 5);
    if (dmin < 180) BLD.panelBlock(cb, hmat(cx, 0, cz, h), reg, { L, floors: fl, fmat: pick([WM.panelA, WM.panelB, WM.panelC, WM.tower]), glazedP: 0.6, peopleP: 0.0, simple: true });
    else simpleBlock(cb, hmat(cx, 0, cz, h), L, D, fl);
    markB(cx, cz, h, L, D, 2);
    if (dmin < 250) for (let k = 0; k < 3; k++) { const tx = cx + rr(-30, 30), tz = cz + rr(-30, 30); tryTree(tx, tz, pick(['linden', 'chestnut', 'spruce', 'small'])); }
  }
  return { trees, parked };
}

const COLORS = [0xe8e8e8, 0xf4f4f2, 0x1b1c1e, 0x2a2d31, 0x8d949b, 0xa9afb4, 0x5f666d, 0x7a1414, 0xa5231f, 0x1f3f7a, 0x23508f, 0x2f5d3a, 0x6b5a3e, 0xc9b99a, 0x3a4a5a, 0x8a1c3b, 0xd8d8d8, 0x404448];

function faceRoadYaw(st, s, side) {
  // yaw for a plane (facing +z) to face the road from the given side
  const p = st.poly.at(s); const rx = -Math.sin(p.h) * side, rz = Math.cos(p.h) * side;
  return Math.atan2(-rx, -rz);
}

/** Cheap far-away block: facade walls + roof only. */
function simpleBlock(cb, M, L, D, fl) {
  const H = fl * 2.8;
  const fmat = pick([WM.panelA, WM.panelB, WM.panelC, WM.tower]);
  for (const [w, rot, x, z] of [[L, Math.PI, 0, -D / 2], [L, 0, 0, D / 2], [D, Math.PI / 2, L / 2, 0], [D, -Math.PI / 2, -L / 2, 0]]) {
    const g = new THREE.PlaneGeometry(w, H);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / 12, (p.getY(i) + H / 2) / 11.2);
    g.rotateY(rot);
    cb.add(fmat, g, M.clone().multiply(mat(x, H / 2, z)));
  }
  const r = new THREE.PlaneGeometry(L, D); r.rotateX(-Math.PI / 2);
  cb.add(WM.flatRoof, r, M.clone().multiply(mat(0, H, 0)));
}
