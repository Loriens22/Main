// Line 9 route geometry: Borovo terminal loop → ул. Ген. Стефан Тошев (DCC 20) → 3 signalised turns → 36 СУ.
import { Turtle, Polyline, fillet } from './path.js';
import { smoothstep, DEG } from './util.js';

export const LANE = 3.5;
const NORTH = -Math.PI / 2, EAST = 0, SOUTH = Math.PI / 2;

export function buildRoute() {
  // ---------------- streets (centerlines) ----------------
  const streets = [];
  const mkStreet = (id, name, poly, opts = {}) => {
    const st = { id, name, poly, halfW: opts.halfW ?? 7, sidewalk: opts.sidewalk ?? 4.5, minor: !!opts.minor, wires: !!opts.wires, parkingLeft: opts.parkingLeft || null, lanesPerDir: opts.lanesPerDir ?? 2 };
    streets.push(st); return st;
  };
  const S1 = mkStreet('S1', 'ул. „Ген. Стефан Тошев“',
    new Turtle(0, -48, NORTH).line(330).arc(350, 20 * DEG).line(460).arc(350, -20 * DEG).line(1180 + 400).build(), { wires: true });
  const sI1 = S1.poly.length - 400;
  const I1 = S1.poly.at(sI1);
  const S2 = mkStreet('S2', 'ул. „Природа“', new Turtle(I1.x - 400, I1.z, EAST).line(400 + 560 + 400).build(), { wires: true });
  const I2 = { x: I1.x + 560, z: I1.z };
  const S3 = mkStreet('S3', 'ул. „Твърдишки проход“', new Turtle(I2.x, I2.z + 400, NORTH).line(400 + 560 + 400).build(), { wires: true });
  const I3 = { x: I2.x, z: I2.z - 560 };
  const S4 = mkStreet('S4', 'ул. „Пчела“ / „Ген. Тошев“', new Turtle(I3.x - 400, I3.z, EAST).line(400 + 1100 + 400).build(), { wires: true, parkingLeft: true });
  // ---- extension to бул. Гоце Делчев (2 signalised turns, then the junction with the tram line) ----
  const I4 = { x: I3.x + 1100, z: I3.z };
  const S5 = mkStreet('S5', 'ул. „Нишава“', new Turtle(I4.x, I4.z + 400, NORTH).line(400 + 1300 + 400).build(), { wires: true });
  const I5 = { x: I4.x, z: I4.z - 1300 };
  const S6 = mkStreet('S6', 'бул. „Петко Ю. Тодоров“', new Turtle(I5.x - 400, I5.z, EAST).line(400 + 950 + 420).build(), { wires: true, sidewalk: 5 });
  const I6 = { x: I5.x + 950, z: I5.z };
  const X6 = mkStreet('X6', 'бул. „Гоце Делчев“', new Turtle(I6.x, I6.z + 420, NORTH).line(840).build(), { tram: true });

  // ---------------- intersections ----------------
  const inters = [
    { id: 'I1', x: I1.x, z: I1.z, a: { st: S1, s: sI1 }, b: { st: S2, s: 400 }, signal: true, groups: { S1: 'A', S2: 'B' }, rc: 12, green: { A: 24, B: 16 } },
    { id: 'I2', x: I2.x, z: I2.z, a: { st: S2, s: 960 }, b: { st: S3, s: 400 }, signal: true, groups: { S2: 'A', S3: 'B' }, rc: 12, green: { A: 22, B: 16 } },
    { id: 'I3', x: I3.x, z: I3.z, a: { st: S3, s: 960 }, b: { st: S4, s: 400 }, signal: true, groups: { S3: 'A', S4: 'B' }, rc: 12, green: { A: 22, B: 16 } },
    { id: 'I4', x: I4.x, z: I4.z, a: { st: S4, s: 1500 }, b: { st: S5, s: 400 }, signal: true, groups: { S4: 'A', S5: 'B' }, rc: 12, green: { A: 22, B: 18 } },
    { id: 'I5', x: I5.x, z: I5.z, a: { st: S5, s: 1700 }, b: { st: S6, s: 400 }, signal: true, groups: { S5: 'A', S6: 'B' }, rc: 12, green: { A: 20, B: 20 } },
    { id: 'I6', x: I6.x, z: I6.z, a: { st: S6, s: 1350 }, b: { st: X6, s: 420 }, signal: true, groups: { S6: 'A', X6: 'B' }, rc: 12, green: { A: 24, B: 18 } },
  ];

  // ---------------- bus route ----------------
  const Rring = 26, r2 = 30;
  const aOut = Math.acos((5.25 + r2) / (Rring + r2));
  const tA = new Turtle(-5.25, -110, SOUTH).line(110 - (Rring + r2) * Math.sin(aOut), 1).arc(r2, aOut).arc(Rring, -aOut);
  const sStopBorovoLocal = tA.build().length;
  tA.arc(Rring, -(Math.PI + aOut)).arc(r2, aOut);
  const zJoin = tA.z;
  tA.line(zJoin - -48 > 0 ? zJoin + 48 : 0.01, 0.5);
  const partA = tA.pts;
  const lanePts = (st, s0, s1, off, step = 1) => {
    const o = {}; const pts = [];
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
    for (let k = 0; k <= n; k++) { const s = s0 + ((s1 - s0) * k) / n; st.poly.offsetAt(s, typeof off === 'function' ? off(s) : off, o); pts.push([o.x, o.z]); }
    return pts;
  };
  const shift = (sA, sB, from, to) => (s) => from + (to - from) * smoothstep(sA, sB, s);
  let pts = [...partA, ...lanePts(S1, 0, sI1, 5.25)];
  let f = fillet(pts, lanePts(S2, 400, 960, shift(800, 870, 5.25, 1.75)), 12.5); pts = f.pts;
  f = fillet(pts, lanePts(S3, 400, 960, shift(450, 520, 1.75, 5.25)), 12.5); pts = f.pts;
  f = fillet(pts, lanePts(S4, 400, 1500, shift(1380, 1450, 5.25, 1.75)), 12.5); pts = f.pts;
  f = fillet(pts, lanePts(S5, 400, 1700, shift(450, 520, 1.75, 5.25)), 12.5); pts = f.pts;
  f = fillet(pts, lanePts(S6, 400, S6.poly.length, 5.25), 12.5); pts = f.pts;
  const busPoly = new Polyline(pts);
  const s0 = sStopBorovoLocal; // route s of Borovo stop in the raw polyline
  // route "s" used in-game is measured from the Borovo stop
  const rs = (rawS) => rawS - s0;
  const rawS = (x, z) => busPoly.project(x, z).s;

  // stops
  const dccRaw = s0 + 2000;
  const s4Stop = S4.poly.offsetAt(870, 5.25);
  const suRaw = rawS(s4Stop.x, s4Stop.z);
  const gdPt = S6.poly.offsetAt(1470, 5.25);
  const gdRaw = rawS(gdPt.x, gdPt.z);
  const stops = [
    { id: 'borovo', name: 'ж.к. Борово', short: 'Ж.К. БОРОВО', tts: 'жилищен комплекс Борово', s: 0 },
    { id: 'dcc20', name: '20 ДКЦ', short: '20 ДКЦ', long: '20 диагностично-консултативен център', tts: 'двадесети диагностично-консултативен център', s: rs(dccRaw) },
    { id: 'su36', name: '36 СУ', short: '36 СУ', long: '36-то средно образователно училище', tts: 'тридесет и шесто средно образователно училище', s: rs(suRaw) },
    { id: 'gd', name: 'бул. Гоце Делчев', short: 'БУЛ. ГОЦЕ ДЕЛЧЕВ', tts: 'Булевард Гоце Делчев', link: 'връзка с автобуси 76 и 74', linkTts: 'връзка с автобуси седемдесет и шест и седемдесет и четири', s: rs(gdRaw) },
  ];
  const line = { code: 'ТБ9', header: 'ТБ9 БОРОВО-ПЛ.СТ.ГАРА', menu: ['ТБ 9 Ж.К.БОРОВО→', 'ПЛ. СТОЧНА ГАРА', 'ТБ 9 ПЛ.СТ.ГАРА→БОРОВО'], vehicle: 'trolleybus', number: '9', dest: 'пл. Сточна гара' };

  // stop lines & turns along the bus route (for red light detection + UI)
  const approach = [
    { inter: inters[0], st: S1, sC: sI1, dir: 1, turn: 'right' },
    { inter: inters[1], st: S2, sC: 960, dir: 1, turn: 'left' },
    { inter: inters[2], st: S3, sC: 960, dir: 1, turn: 'right' },
    { inter: inters[3], st: S4, sC: 1500, dir: 1, turn: 'left' },
    { inter: inters[4], st: S5, sC: 1700, dir: 1, turn: 'right' },
    { inter: inters[5], st: S6, sC: 1350, dir: 1, turn: null },
  ];
  const stopLines = approach.map((a) => {
    const p = a.st.poly.at(a.sC - 25.5);
    return { inter: a.inter, group: a.inter.groups[a.st.id], s: rs(rawS(p.x, p.z)), turn: a.turn };
  });

  // ---------------- opposite-direction wires ----------------
  const rev = (st, sA, sB, off) => lanePts(st, sA, sB, (s) => -off).map((p) => p); // left of street direction when travelling against it
  let op = lanePts(S6, S6.poly.length, 400, -5.25); // travelling west on S6 → right side is north (negative street offset)
  op = fillet(op, lanePts(S5, 1700, 400, -5.25), 18).pts;
  op = fillet(op, lanePts(S4, 1500, 400, -5.25), 12.5).pts;
  op = fillet(op, rev(S3, 960, 400, 5.25), 18).pts;
  op = fillet(op, rev(S2, 960, 400, 5.25), 12.5).pts;
  op = fillet(op, rev(S1, sI1, 62, 5.25), 18).pts;
  const oppPoly = new Polyline(op);

  // ---------------- car lanes ----------------
  const lanes = [];
  const mkLane = (id, pts, o = {}) => { const L = { id, poly: new Polyline(pts), speed: o.speed ?? 13.5, signals: [], next: null, spawn: o.spawn ?? true, neighbor: null, street: o.street, dir: o.dir }; lanes.push(L); return L; };
  // loop lane: S1 southbound inner → Borovo ring inner lane → S1 northbound inner
  const rIn = 21.75;
  const aIn = Math.acos((1.75 + r2) / (rIn + r2));
  const loopT = new Turtle(-1.75, -48, SOUTH).line(48 - (rIn + r2) * Math.sin(aIn), 1).arc(r2, aIn).arc(rIn, -(Math.PI + 2 * aIn)).arc(r2, aIn);
  loopT.line(loopT.z + 48, 1);
  const loopPts = [...lanePts(S1, S1.poly.length, 0, -1.75, 2), ...loopT.pts, ...lanePts(S1, 0, S1.poly.length, 1.75, 2)];
  const loop = mkLane('loop', loopPts, { street: S1 });
  const nbOut = mkLane('S1nbO', lanePts(S1, 0, S1.poly.length, 5.25, 2), { street: S1, dir: 1 });
  const sbOutPts = lanePts(S1, S1.poly.length, 170, -5.25, 2).concat(lanePts(S1, 170, 110, shift(110, 170, -1.75, -5.25), 1));
  const sbOut = mkLane('S1sbO', sbOutPts, { street: S1, dir: -1 });
  sbOut.next = { lane: loop };
  const both = (st, sA, sB, idp, opts = {}) => {
    const a = mkLane(idp + 'fI', lanePts(st, sA, sB, 1.75, 2), { street: st, dir: 1 });
    const b = mkLane(idp + 'fO', lanePts(st, sA, sB, 5.25, 2), { street: st, dir: 1 });
    const c = mkLane(idp + 'rI', lanePts(st, sB, sA, -1.75, 2), { street: st, dir: -1 });
    const d = opts.noRevOuter ? null : mkLane(idp + 'rO', lanePts(st, sB, sA, -5.25, 2), { street: st, dir: -1 });
    a.neighbor = b; b.neighbor = a; if (d) { c.neighbor = d; d.neighbor = c; }
    return [a, b, c, d];
  };
  both(S2, 0, S2.poly.length, 'S2');
  both(S3, 0, S3.poly.length, 'S3');
  both(S4, 0, S4.poly.length, 'S4', { noRevOuter: true });
  both(S5, 0, S5.poly.length, 'S5');
  both(S6, 0, S6.poly.length, 'S6');
  both(X6, 0, X6.poly.length, 'X6');
  // lane changes between S1 northbound outer lane and the northbound half of the loop lane
  const loopNBStart = new Polyline([...lanePts(S1, S1.poly.length, 0, -1.75, 2), ...loopT.pts]).length;
  for (const L of lanes) L.neighborOffset = 0;
  nbOut.neighbor = loop; nbOut.neighborOffset = loopNBStart;
  loop.neighbor = nbOut; loop.neighborOffset = -loopNBStart; loop.neighborFrom = loopNBStart;
  // signals per lane: find each intersection this lane passes straight through
  // a lane may pass the same intersection twice (the loop lane), so scan for every pass
  const o = {};
  for (const L of lanes) {
    for (const it of inters) {
      for (const arm of [it.a, it.b]) {
        if (arm.st !== L.street) continue;
        let best = null;
        const flush = () => {
          if (!best) return;
          const lh = L.poly.at(best.s).h, sh = arm.st.poly.at(arm.s).h;
          const same = Math.cos(lh - sh) > 0;
          const stopPt = arm.st.poly.at(arm.s + (same ? -25.5 : 25.5));
          const sp = L.poly.project(stopPt.x, stopPt.z, L.poly._seg(best.s), 40);
          L.signals.push({ s: sp.s, inter: it, group: it.groups[arm.st.id], sCenter: best.s });
          best = null;
        };
        for (let s = 0; s <= L.poly.length; s += 2) {
          L.poly.at(s, o);
          const d = Math.hypot(o.x - it.x, o.z - it.z);
          if (d < 8) { if (!best || d < best.d) best = { s, d }; } else flush();
        }
        flush();
      }
    }
    L.signals.sort((a, b) => a.s - b.s);
  }

  // ---------------- minor side streets (T-junctions, unsignalised) ----------------
  const minors = [];
  const addMinor = (st, s, side, len, name) => {
    const p = st.poly.at(s);
    const h = p.h + side * Math.PI / 2; // side +1 = right of street direction
    const x0 = p.x + Math.cos(h) * st.halfW, z0 = p.z + Math.sin(h) * st.halfW;
    const poly = new Turtle(x0, z0, h).line(len).build();
    const m = mkStreet('M' + minors.length, name, poly, { halfW: 3.6, sidewalk: 3, minor: true, lanesPerDir: 1 });
    m.join = { st, s, side };
    minors.push(m);
    return m;
  };
  addMinor(S1, 620, 1, 150, 'ул. „Мур“');
  addMinor(S1, 1180, -1, 140, 'ул. „Дойран“');
  addMinor(S1, 2060, 1, 150, 'ул. „Боянски водопад“');
  addMinor(S4, 900, 1, 140, 'ул. „Пчела“');
  addMinor(S2, 700, -1, 120, 'ул. „Милин камък“');
  addMinor(S5, 800, -1, 140, 'ул. „Костенски водопад“');
  addMinor(S5, 1250, 1, 130, 'ул. „Кричим“');
  addMinor(S6, 700, 1, 130, 'ул. „Хенрик Ибсен“');

  const ring = { cx: 0, cz: 0, rIn: 19.5, rOut: 28.3, busR: Rring, carR: rIn };

  const route = {
    streets, inters, minors, lanes, ring, stops, stopLines, line,
    bus: busPoly, busOffset: s0, opp: oppPoly,
    S: { S1, S2, S3, S4, S5, S6, X6 }, sI1, I6,
    /** pose on the bus route at game-s (right normal included) */
    pose(s, lat = 0) { const o = busPoly.offsetAt(s + s0, lat); o.rx = -Math.sin(o.h); o.rz = Math.cos(o.h); return o; },
    project(x, z, hint) { const p = busPoly.project(x, z, hint); p.s -= s0; return p; },
    get length() { return busPoly.length - s0; },
  };
  return route;
}
