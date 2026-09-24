// Tram line 7 corridor: set pieces around the five stops and procedural fill along бул. България.
import * as THREE from 'three';
import { WM } from './materials.js';
import { hmat, polyGeo, stripGeo } from './common.js';
import { streetPts } from './roads.js';
import * as BLD from './buildings.js';
import * as B2 from './buildings2.js';
import * as LM from './landmarks.js';
import * as PR from './props.js';
import { fillGD } from './layoutGD.js';
import { RES, CW, SW, TRACK } from '../tramRoute.js';
import { R, rr, pick, chance, mat, makeRng } from '../util.js';

const COLORS = [0xe8e8e8, 0xf4f4f2, 0x1b1c1e, 0x2a2d31, 0x8d949b, 0xa9afb4, 0x5f666d, 0x7a1414, 0xa5231f, 0x1f3f7a, 0x23508f, 0x2f5d3a, 0x6b5a3e, 0xc9b99a, 0x3a4a5a, 0x8a1c3b, 0xd8d8d8, 0x404448];
const SHOPS = [
  { text: 'АПТЕКА', bg: '#1b7a3a', fg: '#fff' }, { text: 'НОТАРИУС', bg: '#1d2c4d', fg: '#fff' }, { text: 'КАФЕ', bg: '#6d4c2e', fg: '#ffe7b0' },
  { text: 'ЦВЕТЯ', bg: '#8e24aa', fg: '#fff' }, { text: 'ФРИЗЬОР', bg: '#263238', fg: '#fff' }, { text: 'ОПТИКА', bg: '#1565c0', fg: '#fff' },
  { text: 'БАНКОМАТ', bg: '#0d47a1', fg: '#fff' }, { text: 'ПЕКАРНА', bg: '#a1887f', fg: '#fff' }, { text: 'ЗАЛОЖНА КЪЩА', bg: '#c62828', fg: '#fff' },
  { text: 'ВИНОТЕКА', bg: '#5d1f2c', fg: '#f4d9a0' }, { text: 'СТОМАТОЛОГ', bg: '#00897b', fg: '#fff' }, { text: 'ИМОТИ', bg: '#37474f', fg: '#ffca28' },
];

export function layoutTram(route, cb, occ, reg, infra) {
  const trees = [], parked = [];
  reg.trees = trees; reg.parked = parked;
  const { B1, B2: Bv, X1, X2 } = route.S;
  const { sJ1, sJ2, sJ3 } = route.J;
  const edge = (st) => st.halfW + st.sidewalk;
  const fr = (st, s) => { const p = st.poly.at(s); return { x: p.x, z: p.z, h: p.h, rx: -Math.sin(p.h), rz: Math.cos(p.h) }; };
  const at = (st, s, lat) => { const f = fr(st, s); return [f.x + f.rx * lat, f.z + f.rz * lat, f.h]; };
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
  const tryTree = (x, z, kind, s) => { if (occ.get(x, z) === 0) { addTree(x, z, kind, s); return true; } return false; };
  const parkCar = (x, z, h, type) => parked.push({ x, z, h, y: 0, type: type || pick(['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'small', 'small', 'van']), color: pick(COLORS) });
  const lot = (st, s0, s1, side, l0, l1) => { const q = [at(st, s0, side * l0), at(st, s1, side * l0), at(st, s1, side * l1), at(st, s0, side * l1)].map(([x, z]) => [x, z]); cb.add(WM.asphalt, polyGeo(q, 0.004, [], 5)); };
  const bld = (fn, st, s, side, setback, o, L, D, rot = 0) => { const r = place(fn, st, s, side, edge(st) + setback + D / 2, o, rot); markB(r.x, r.z, r.h, rot ? D : L, rot ? L : D, 2); return r; };
  const reserve = (st, a, b, side) => reg.reserve.push({ st, a, b, side });

  /* =================== кв. Манастирски ливади (terminus loop, summer) =================== */
  {
    // green island inside the loop, dispatcher kiosk, blossoming trees
    const L0 = route.loopEnd;
    void L0;
    const island = []; for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; island.push([Math.cos(a) * 15, 48 + Math.sin(a) * 22]); }
    cb.add(WM.grass, polyGeo(island, 0.06, [], 6), null, 0x8fa060);
    occ.markDisc(0, 45, 26, 3);
    const kiosk = hmat(-7, 0, 32, Math.PI / 2);
    const kc = new BLD.Ctx(cb, kiosk, reg);
    kc.box(WM.plainA, 6, 3, 4, 0, 1.5, 0, 0xe9e6de); kc.box(WM.glassDark, 4.6, 1.3, 0.05, 0, 1.8, -2.02); kc.box(WM.painted, 6.6, 0.25, 4.6, 0, 3.1, 0, 0x2a6fb0);
    const sgn = new THREE.PlaneGeometry(4, 0.5); sgn.rotateY(Math.PI); kc.add(BLD.SIGNS.mat, BLD.signUV(sgn, 'ДИСПЕЧЕР • ЦГМ', '#2a6fb0', '#ffffff', 900, 110), mat(0, 2.7, -2.04));
    reg.colliders.push({ M: kiosk, hl: 3, hd: 2 });
    for (let k = 0; k < 14; k++) { const a = rr(0, 6.28), r = rr(3, 12); tryTree(Math.cos(a) * r * 0.9, 48 + Math.sin(a) * r * 1.4, pick(['plum', 'plum', 'small', 'linden'])); }
    // second stop pole for tram 27 on the platform
    const [tx, tz] = at(B1, 20, RES - 0.6); PR.stopPole(cb, tx, tz, Math.PI / 2, 'ТМ 27');
    // modern residential blocks (2008-2020) around the terminus
    const blocks = [
      [B1, 90, 1, 12, { L: 52, D: 16, floors: 11, style: 'white' }],
      [B1, 170, 1, 10, { L: 40, D: 16, floors: 14, style: 'grey' }],
      [B1, 245, 1, 14, { L: 44, D: 16, floors: 9, style: 'beige' }],
      [B1, 100, -1, 10, { L: 56, D: 16, floors: 13, style: 'white' }],
      [B1, 190, -1, 12, { L: 46, D: 16, floors: 10, style: 'beige' }],
      [B1, 270, -1, 16, { L: 40, D: 16, floors: 8, style: 'grey' }],
    ];
    for (const [st, s, side, sb, o] of blocks) {
      const r = bld(B2.modernOffice, st, s, side, sb, o, o.L, o.D);
      for (let k = 0; k < 5; k++) { const v = new THREE.Vector3(rr(-o.L / 2, o.L / 2), 0, -o.D / 2 - rr(3, 8)).applyMatrix4(r.M); tryTree(v.x, v.z, pick(['plum', 'linden', 'birch', 'small'])); }
      lot(st, s - o.L / 2 + 2, s + o.L / 2 - 2, side, edge(st) + 1, edge(st) + 6);
      for (let x = s - o.L / 2 + 4; x < s + o.L / 2 - 3; x += 2.7) if (chance(0.7)) { const [px, pz, h] = at(st, x, side * (edge(st) + 3.5)); parkCar(px, pz, h + Math.PI / 2); }
      reserve(st, s - o.L / 2 - 8, s + o.L / 2 + 8, side);
    }
    // blocks south of the loop, facing it
    for (const [x, z, L, fl, style] of [[-50, 118, 50, 12, 'white'], [30, 124, 44, 9, 'beige'], [-78, 60, 36, 15, 'grey'], [72, 58, 40, 11, 'white']]) {
      const h = Math.abs(x) > 60 ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI;
      B2.modernOffice(cb, hmat(x, 0, z, h), reg, { L, D: 16, floors: fl, style });
      markB(x, z, h, L, 16, 2);
    }
    for (let k = 0; k < 30; k++) tryTree(rr(-90, 90), rr(12, 100), pick(['plum', 'linden', 'chestnut', 'birch', 'small', 'spruce']));
  }

  /* =================== бул. Гоце Делчев (J1 + stop gd7) =================== */
  {
    const s = sJ1;
    // NW corner: beige 12-storey block with a glazed corner tower and НОТАРИУС on the ground floor
    const nw = bld(BLD.panelBlock, B1, s + 45, -1, 6, { L: 36, floors: 12, fmat: WM.paleB, glazedP: 0.7, shops: [SHOPS[1], SHOPS[0], SHOPS[8]] }, 36, 12);
    const gc = new BLD.Ctx(cb, nw.M, reg);
    gc.box(WM.curtainGreen, 4.5, 12 * 2.8, 4.5, 36 / 2 + 1.5, 12 * 1.4, -2, 0xffffff);
    // SW corner: dark glass tower with a curved front (КРИТ)
    bld(LM.darkTower, B1, s - 60, -1, 10, {}, 22, 22);
    // west after the junction: СОТ 161 curved office, then residential blocks with glass balconies
    bld(LM.sot161, B1, s + 110, -1, 14, {}, 40, 20);
    bld(B2.modernOffice, B1, s + 175, -1, 10, { L: 40, D: 16, floors: 10, style: 'white' }, 40, 16);
    // east side: KPMG round tower behind trees, red-roof houses, residential
    const kp = bld(LM.kpmgTower, B1, s + 95, 1, 26, {}, 32, 32);
    for (let k = 0; k < 14; k++) { const [x, z] = at(B1, s + 40 + k * 9, edge(B1) + rr(3, 16)); tryTree(x, z, pick(['linden', 'chestnut', 'linden', 'spruce'])); }
    void kp;
    bld(BLD.oldHouse, B1, s + 160, 1, 12, { L: 10, D: 8, wall: 0xe6dcc6 }, 10, 8);
    bld(BLD.oldHouse, B1, s + 176, 1, 18, { L: 9, D: 8, wall: 0xd9cbb2 }, 9, 8);
    bld(B2.brickStripeTower, B1, s - 55, 1, 12, { L: 36, D: 13, floors: 12 }, 36, 13);
    // billboards at the junction
    const [bx, bz, bh] = at(B1, s + 30, edge(B1) + 3); B2.billboard(cb, hmat(bx, 0, bz, bh + Math.PI / 2), reg, { kind: 3 });
    const [cx, cz, ch] = at(B1, s + 60, -(edge(B1) + 3)); B2.billboard(cb, hmat(cx, 0, cz, ch - Math.PI / 2), reg, { kind: 1 });
    // buildings along бул. Гоце Делчев (X1)
    for (const [xs, side, o] of [[120, 1, { L: 42, floors: 9 }], [120, -1, { L: 36, floors: 8 }], [700, 1, { L: 48, floors: 8 }], [700, -1, { L: 42, floors: 9 }]]) bld(BLD.panelBlock, X1, xs, side, 8, { ...o, fmat: pick([WM.panelA, WM.panelC, WM.paleA]), shops: [pick(SHOPS), pick(SHOPS)] }, o.L, 12);
    reserve(B1, s - 90, s + 200, 1); reserve(B1, s - 90, s + 200, -1);
  }

  /* =================== пл. Ручей (J2 + stop) =================== */
  {
    const s = sJ2 + 75;
    // east: Shell station right behind the platform, T-Market behind it, ПРОТЕХ before, beige 10-storey blocks behind
    bld(LM.petrolStation, B1, s + 5, 1, 12, { brand: 'shell', W: 24, D: 14, shopX: 22, shopZ: 6 }, 40, 26);
    bld(LM.tMarket, B1, s + 25, 1, 44, { L: 32, D: 20 }, 32, 20);
    bld(LM.commercialBlock, B1, s - 50, 1, 8, { L: 34, D: 14 }, 34, 14);
    bld(BLD.panelBlock, B1, s + 30, 1, 82, { L: 48, floors: 10, fmat: WM.paleB, glazedP: 0.6 }, 48, 12);
    bld(BLD.panelBlock, B1, s - 30, 1, 70, { L: 30, floors: 12, fmat: WM.panelC, glazedP: 0.5 }, 30, 12);
    for (let k = 0; k < 5; k++) { const [x, z, h] = at(B1, s - 70 + k * 3, edge(B1) + 4); parkCar(x, z, h + Math.PI / 2, k === 1 ? 'taxi' : undefined); }
    const big = at(B1, s - 18, edge(B1) + 3.5); tryTree(big[0], big[1], 'chestnut', 1.35);
    // west: colourful 1980s blocks behind birches + billboard, graffiti retaining wall + sliver tower further on
    bld(B2.block80s, B1, s - 40, -1, 18, { segs: [[18, 10], [18, 12], [15, 14]], D: 13 }, 51, 14);
    bld(B2.block80s, B1, s + 50, -1, 22, { segs: [[16, 9], [20, 12]], D: 13, accents: [0xd9822b, 0xb8452f] }, 36, 14);
    for (let k = 0; k < 16; k++) { const [x, z] = at(B1, s - 80 + k * 8, -(edge(B1) + rr(3, 12))); tryTree(x, z, pick(['birch', 'birch', 'linden', 'willow'])); }
    const [bx, bz, bh] = at(B1, s - 75, -(edge(B1) + 3)); B2.billboard(cb, hmat(bx, 0, bz, bh - Math.PI / 2), reg, { kind: 5 });
    // graffiti retaining wall along the sidewalk with an underpass ramp, sliver tower behind
    const w0 = s + 110, w1 = s + 190;
    const wall = streetPts(B1, w0, w1, 4).map(([x, z], i, a) => { const f = fr(B1, w0 + (i / (a.length - 1)) * (w1 - w0)); return [x - f.rx * (edge(B1) + 0.6), z - f.rz * (edge(B1) + 0.6)]; });
    for (let i = 0; i < wall.length - 1; i++) {
      const [ax, az] = wall[i], [cx, cz] = wall[i + 1], len = Math.hypot(cx - ax, cz - az);
      const g = new THREE.PlaneGeometry(len, 2.2); const uv = g.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setXY(j, (uv.getX(j) * len + i * len) / 8, uv.getY(j) * 0.55);
      g.rotateY(Math.PI);
      cb.add(WM.graffiti, g, mat((ax + cx) / 2, 1.1, (az + cz) / 2, 0, -Math.atan2(cz - az, cx - ax)));
      cb.add(WM.concrete, new THREE.BoxGeometry(len, 0.3, 0.5), mat((ax + cx) / 2, 2.25, (az + cz) / 2, 0, -Math.atan2(cz - az, cx - ax)), 0xc9c4b8);
    }
    PR.barrier(cb, wall.map(([x, z]) => [x, z + 0]).map(([x, z]) => [x, z]));
    bld(B2.sliverTower, B1, s + 150, -1, 14, { W: 15, D: 13, floors: 13 }, 17, 13);
    reserve(B1, s - 90, s + 200, 1); reserve(B1, s - 90, s + 200, -1);
  }

  /* =================== ПГ по дизайн „Елисавета Вазова“ (stop pgd) + Южен парк =================== */
  {
    const s = 2900;
    // east: EKO station with KFC right next to the stop, school behind trees before it
    bld(LM.petrolStation, B1, s + 30, 1, 10, { brand: 'eko', W: 24, D: 15, shopX: 22, shopZ: 7, totemX: -16, totemZ: -10 }, 42, 28);
    bld(LM.designSchool, B1, s - 70, 1, 22, {}, 62, 15);
    for (let k = 0; k < 10; k++) { const [x, z] = at(B1, s - 110 + k * 9, edge(B1) + rr(3, 14)); tryTree(x, z, pick(['linden', 'chestnut', 'spruce'])); }
    // west: Южен парк — flower parterre, art garden, big trees, billboards
    const fp = place(LM.flowerParterre, B1, s - 80, -1, edge(B1) + 12, { W: 90, D: 16 });
    markB(fp.x, fp.z, fp.h, 90, 18, 0);
    const ag = place(LM.artGarden, B1, s + 40, -1, edge(B1) + 30, { W: 56, D: 30 });
    markB(ag.x, ag.z, ag.h, 56, 30, 0);
    const [bx, bz, bh] = at(B1, s - 20, -(edge(B1) + 3)); B2.billboard(cb, hmat(bx, 0, bz, bh - Math.PI / 2), reg, { kind: 2 });
    // yellow New Jersey barriers along the reservation (west side) before the stop
    const jb = streetPts(B1, s - 160, s - 45, 2).map(([x, z], i, a) => { const f = fr(B1, s - 160 + (i / (a.length - 1)) * 115); return [x - f.rx * (RES + 0.35), z - f.rz * (RES + 0.35)]; });
    LM.jerseyBarrier(cb, jb);
    reserve(B1, s - 140, s + 100, 1);
  }
  // Южен парк: the west side of бул. България from before пл. Ручей to the Витоша corner is park
  {
    for (let k = 0; k < 420; k++) {
      const s = rr(2280, 3690), lat = -(edge(B1) + rr(4, 140));
      const [x, z] = at(B1, s, lat);
      tryTree(x, z, pick(['linden', 'chestnut', 'linden', 'spruce', 'birch', 'chestnut', 'small']));
    }
    for (let s = 2300; s < 3680; s += 45) { const [x, z, h] = at(B1, s, -(edge(B1) + 7)); if (occ.get(x, z) === 0) { BLD.bench({ add: (m, g, lm, c) => cb.add(m, g, lm, c) }, x, z, -h); reg.benches.push({ p: new THREE.Vector3(x, 0.02, z), yaw: -h + Math.PI }); } }
    const path = streetPts(B1, 2290, 3680, 4);
    cb.add(WM.pavers, stripGeo(path, -(edge(B1) + 8.2), -(edge(B1) + 5.8), 0.03, 0.03, { uvScale: 2 }));
    reserve(B1, 2280, 3700, -1);
  }

  /* =================== бул. Пенчо Славейков (J3, stop ps): Millennium, bTV, ОББ =================== */
  {
    // Millennium Sofia next to the stop (north side of B2 = right of the westbound tram)
    const mil = place(LM.millennium, Bv, 300 + 120 + 30, 1, edge(Bv) + 8 + 18);
    markB(mil.x, mil.z, mil.h, 76, 38, 2);
    // bTV Media Group tower behind the stop (NE corner of the junction)
    const bt = place(LM.btvTower, B1, sJ3 + 50, 1, edge(B1) + 14 + 9);
    markB(bt.x, bt.z, bt.h, 34, 17, 2);
    // ОББ tower and the curved office a short distance after the stop (south side)
    const ob = place(LM.obbTower, Bv, 300 + 230, -1, edge(Bv) + 10 + 11);
    markB(ob.x, ob.z, ob.h, 26, 22, 2);
    const co = place(LM.curvedOffice, Bv, 300 + 95, -1, edge(Bv) + 10, { R: 42, ang: 1.1, floors: 6 });
    markB(co.x, co.z, co.h, 50, 20, 1);
    // tall residential tower beyond (glass balconies)
    const rt = place(B2.modernOffice, Bv, 300 + 330, 1, edge(Bv) + 14, { L: 34, D: 22, floors: 26, style: 'white' });
    markB(rt.x, rt.z, rt.h, 34, 22, 2);
    // pedestrian underpass stairs at the junction corners
    for (const [su, sv] of [[1, 1], [-1, 1], [1, -1]]) {
      const [x, z, h] = at(B1, sJ3 + su * 34, sv * (edge(B1) - 2.5));
      B2.underpass(cb, hmat(x, 0, z, h + (sv > 0 ? 0 : Math.PI)), reg, { L: 10, W: 3.4 });
      occ.markDisc(x, z, 7, 1);
    }
    for (let k = 0; k < 12; k++) { const [x, z] = at(Bv, 300 + 60 + k * 12, -(edge(Bv) + rr(2, 8))); tryTree(x, z, pick(['linden', 'small', 'plum'])); }
    reserve(Bv, 300, 1000, 1); reserve(Bv, 300, 700, -1); reserve(B1, sJ3 - 40, sJ3 + 120, 1);
  }

  /* =================== procedural fill =================== */
  const rnd = makeRng(707);
  const reserved = (st, s, side) => reg.reserve.some((r) => r.st === st && r.side === side && s > r.a && s < r.b);
  for (const st of [B1, Bv, X1, X2]) {
    for (const side of [1, -1]) {
      let s = 30; const end = st.poly.length - 20;
      while (s < end) {
        if (reserved(st, s, side)) { s += 10; continue; }
        const r = rnd();
        let kind, L, D, fl, setback;
        if (r < 0.2) { kind = 'panel'; L = pick([42, 48, 54, 60]); D = 12; fl = pick([6, 8, 9, 12]); setback = rr(6, 16); }
        else if (r < 0.4) { kind = 'b80'; L = pick([40, 48, 54]); D = 13; fl = pick([8, 9, 10]); setback = rr(8, 18); }
        else if (r < 0.52) { kind = 'brick'; L = pick([36, 42]); D = 13; fl = pick([10, 12, 14]); setback = rr(10, 20); }
        else if (r < 0.6) { kind = 'sliver'; L = 16; D = 13; fl = pick([9, 11]); setback = rr(8, 16); }
        else if (r < 0.7) { kind = 'modern'; L = pick([32, 40]); D = 16; fl = pick([7, 8, 10]); setback = rr(6, 12); }
        else if (r < 0.8) { kind = 'shop'; L = pick([8, 10, 12]); D = 7; setback = rr(1.5, 4); }
        else if (r < 0.86) { kind = 'red'; L = 20; D = 14; fl = pick([8, 9]); setback = rr(5, 12); }
        else { kind = 'gap'; L = rr(14, 36); }
        if (kind === 'gap') { s += L; continue; }
        const sc = s + L / 2;
        if (sc + L / 2 > end || reserved(st, sc + L / 2, side)) { s += 12; continue; }
        const latC = edge(st) + setback + D / 2;
        const f = fr(st, sc);
        const x = f.x + f.rx * latC * side, z = f.z + f.rz * latC * side;
        const h = side > 0 ? f.h : f.h + Math.PI;
        if (!freeB(x, z, h, L, D, 2)) { s += 10; continue; }
        const M = hmat(x, 0, z, h);
        if (kind === 'panel') BLD.panelBlock(cb, M, reg, { L, floors: fl, fmat: pick([WM.panelA, WM.panelB, WM.panelC, WM.paleA]), glazedP: rr(0.4, 0.75), shops: rnd() < 0.4 ? [pick(SHOPS), pick(SHOPS), pick(SHOPS)] : null, balc: rnd() < 0.3 ? 'both' : 'front' });
        else if (kind === 'modern') B2.modernOffice(cb, M, reg, { L, D, floors: fl, style: pick(['white', 'beige', 'grey', 'ceramic']) });
        else if (kind === 'shop') { const sp = pick(SHOPS); BLD.shopPavilion(cb, M, reg, { L, D, text: sp.text, bg: sp.bg, fg: sp.fg }); }
        else fillGD(cb, M, reg, kind, L, D, fl, rnd);
        markB(x, z, h, L, D, 2);
        for (let k = 0; k < 4; k++) { const v = new THREE.Vector3(rr(-L / 2, L / 2), 0, (rnd() < 0.5 ? -1 : 1) * (D / 2 + rr(4, 9))).applyMatrix4(M); tryTree(v.x, v.z, pick(['linden', 'chestnut', 'small', 'birch', 'spruce', 'linden', 'plum'])); }
        if ((kind === 'panel' || kind === 'b80') && setback > 11) {
          const q = [[-L / 2 + 1.5, -D / 2 - setback + 0.8], [L / 2 - 1.5, -D / 2 - setback + 0.8], [L / 2 - 1.5, -D / 2 - setback + 5.8], [-L / 2 + 1.5, -D / 2 - setback + 5.8]].map(([lx, lz]) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(M); return [v.x, v.z]; });
          cb.add(WM.asphalt, polyGeo(q, 0.004, [], 5));
          for (let k = 0; k < Math.floor(L / 2.7) - 2; k++) { if (rnd() < 0.3) continue; const v = new THREE.Vector3(-L / 2 + 3 + k * 2.7, 0, -D / 2 - setback + 3.2).applyMatrix4(M); parkCar(v.x, v.z, h + Math.PI / 2 + rr(-0.06, 0.06)); }
        }
        s += L + rr(6, 22);
      }
    }
  }
  // street trees on the outer sidewalk edge, bins
  for (const st of [B1, Bv, X1, X2]) for (const side of [1, -1]) {
    for (let s = 8; s < st.poly.length - 5; s += rr(9, 13)) { const [x, z] = at(st, s, side * (edge(st) - 1.2)); if (occ.get(x, z) <= 2) { if (occ.get(x, z) === 2 && R() < 0.5) continue; tryTreeForce(x, z); } }
    for (let s = 40; s < st.poly.length; s += rr(70, 130)) { const [x, z] = at(st, s, side * (edge(st) - 0.5)); if (occ.get(x, z) <= 2) PR.trashBin(cb, x, z); }
  }
  function tryTreeForce(x, z) { trees.push({ x, z, kind: pick(['linden', 'chestnut', 'linden', 'small']), s: rr(0.9, 1.2), rot: R() * 6.28, hue: rr(-0.03, 0.05) }); occ.markDisc(x, z, 1.2, 1); }
  // street name plates at the junctions
  for (const it of route.inters) { const hA = it.a.st.poly.at(it.a.s).h; PR.streetNamePlate(cb, it.x + Math.cos(hA) * 30 - Math.sin(hA) * 19, it.z + Math.sin(hA) * 30 + Math.cos(hA) * 19, -hA, it.b.st.name); }
  // kerbside parking on the cross streets
  for (const st of [X1, X2]) for (const side of [1, -1]) for (let s = 30; s < st.poly.length - 30; s += rr(5.4, 6.6)) {
    const j = route.inters.find((i) => i.b.st === st); if (j && Math.abs(s - j.b.s) < 40) continue;
    if (chance(0.7)) { const [x, z, h] = at(st, s, side * 5.3); parkCar(x, z, side > 0 ? h : h + Math.PI); }
  }

  /* =================== background city =================== */
  const g2 = makeRng(15);
  occ.buildDist(2);
  for (let x = -700; x < 1100; x += 64) for (let z = -4600; z < 400; z += 64) {
    const cx = x + g2() * 30, cz = z + g2() * 30;
    const dmin = occ.dist(cx, cz);
    if (dmin < 60 || dmin > 480) continue;
    const h = [0, Math.PI / 2, 0.3, -0.4][Math.floor(g2() * 4)];
    const L = 30 + g2() * 36, D = 12 + g2() * 3;
    if (!freeB(cx, cz, h, L, D, 4)) continue;
    const fl = g2() < 0.25 ? 14 + Math.floor(g2() * 6) : 6 + Math.floor(g2() * 6);
    BLD.panelBlock(cb, hmat(cx, 0, cz, h), reg, { L, floors: fl, fmat: pick([WM.panelA, WM.panelB, WM.panelC, WM.tower, WM.paleA, WM.paleC]), glazedP: 0.6, peopleP: 0.0, simple: true });
    markB(cx, cz, h, L, D, 2);
    if (dmin < 250) for (let k = 0; k < 3; k++) tryTree(cx + rr(-30, 30), cz + rr(-30, 30), pick(['linden', 'chestnut', 'spruce', 'small']));
  }
  return { trees, parked };
}
export { TRACK, CW, SW };
