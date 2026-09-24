// Tram line 7 geometry (modelled section): кв. Манастирски ливади terminus loop → бул. „България“ with a
// central tram reservation → бул. Гоце Делчев → пл. Ручей → ПГ по дизайн → left curve onto
// бул. „Пенчо Славейков“ at the Millennium corner.
import { Turtle, Polyline, fillet } from './path.js';
import { DEG } from './util.js';

const NORTH = -Math.PI / 2;
export const GAUGE = 1.009;        // Sofia narrow-gauge tram network
export const TRACK = 1.8;          // track centre offset from the boulevard axis
export const RES = 5.9;            // reservation half-width (tracks + planting strip / platforms)
export const CW = 10.5;            // carriageway width (3 lanes)
export const SW = 5;               // sidewalk width
export const PLATFORM_Y = 0.25;

export function buildTramRoute() {
  const streets = [];
  const mk = (id, name, poly, o = {}) => {
    const st = { id, name, poly, kind: o.kind || 'street', halfW: o.halfW ?? 7, sidewalk: o.sidewalk ?? 4.5, minor: false, lanesPerDir: o.lanes ?? 2, tracks: o.tracks || null };
    if (st.kind === 'boulevard') { st.res = RES; st.cw = CW; st.halfW = RES + CW; st.sidewalk = SW; st.lanesPerDir = 3; }
    streets.push(st); return st;
  };
  // ---- бул. „България“ (B1): north from the terminus loop, two gentle bends ----
  const B1 = mk('B1', 'бул. „България“', new Turtle(0, 10, NORTH).line(700).arc(1200, 6 * DEG).line(1400).arc(1200, -6 * DEG).line(1800).build(), { kind: 'boulevard', tracks: [0, 99999] });
  const sJ1 = 1100, sJ2 = 1950, sJ3 = 3760;
  const J = (s) => B1.poly.at(s);
  const pj0 = J(0), pj1 = J(sJ1), pj2 = J(sJ2), pj3 = J(sJ3);
  const perp = (p, len, s0) => new Turtle(p.x - Math.cos(p.h + Math.PI / 2) * s0, p.z - Math.sin(p.h + Math.PI / 2) * s0, p.h + Math.PI / 2).line(len).build();
  // бул. „Тодор Каблешков“ (X0): бул. България ends at it in a T-junction; the terminus loop lies beyond
  const X0 = mk('X0', 'бул. „Тодор Каблешков“', perp(pj0, 500, 250), { halfW: 7 });
  const X1 = mk('X1', 'бул. „Гоце Делчев“', perp(pj1, 840, 420), { halfW: 7, lanes: 1 });
  const X2 = mk('X2', 'ул. „Хубча“', perp(pj2, 520, 260), { halfW: 7, lanes: 1 });
  // бул. „Пенчо Славейков“ (B2): crosses B1 at J3 heading west; tram tracks only on the west part
  const B2 = mk('B2', 'бул. „Пенчо Славейков“', new Turtle(pj3.x + 300, pj3.z, Math.PI).line(1000).build(), { kind: 'boulevard', tracks: [300, 99999] });

  const inters = [
    { id: 'J0', x: pj0.x, z: pj0.z, a: { st: B1, s: 0 }, b: { st: X0, s: 250 }, signal: true, tee: true, groups: { B1: 'A', X0: 'B' }, rc: 8, green: { A: 20, B: 22 } },
    { id: 'J1', x: pj1.x, z: pj1.z, a: { st: B1, s: sJ1 }, b: { st: X1, s: 420 }, signal: true, groups: { B1: 'A', X1: 'B' }, rc: 8, green: { A: 28, B: 18 } },
    { id: 'J2', x: pj2.x, z: pj2.z, a: { st: B1, s: sJ2 }, b: { st: X2, s: 260 }, signal: true, groups: { B1: 'A', X2: 'B' }, rc: 8, green: { A: 30, B: 14 } },
    { id: 'J3', x: pj3.x, z: pj3.z, a: { st: B1, s: sJ3 }, b: { st: B2, s: 300 }, signal: true, groups: { B1: 'A', B2: 'B' }, rc: 10, green: { A: 26, B: 22 } },
  ];

  // ---- tram track (right-hand track) with the balloon loop at Манастирски ливади ----
  const off = (st, s0, s1, lat, step = 2) => {
    const pts = [], o = {}, n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
    for (let k = 0; k <= n; k++) { st.poly.offsetAt(s0 + ((s1 - s0) * k) / n, lat, o); pts.push([o.x, o.z]); }
    return pts;
  };
  // racket loop: right swing a, left arc, left arc, right swing a; solve a so it ends on the other track
  const r1 = 30, RL = 22, SOUTH = Math.PI / 2;
  const loopT = (a) => new Turtle(-TRACK, -60, SOUTH).line(80, 2).arc(r1, a).arc(RL, -(Math.PI / 2 + a)).arc(RL, -(Math.PI / 2 + a)).arc(r1, a);
  let lo = 0.3, hi = 1.5;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (loopT(m).x > TRACK) lo = m; else hi = m; }
  const loop = loopT(lo);
  loop.line(10, 2); // back to z = 10 (start of B1)
  let pts = [...loop.pts, ...off(B1, 0, sJ3 - 30, TRACK)];
  const f = fillet(pts, off(B2, 300 - 30, B2.poly.length, TRACK), 22);
  pts = f.pts;
  const track = new Polyline(pts);
  const rawS = (x, z) => track.project(x, z).s;
  // stops: nose position where the tram stops
  const stopAt = (st, s) => { const p = st.poly.offsetAt(s, TRACK, {}); return rawS(p.x, p.z); };
  const s0 = stopAt(B1, 66);
  const rs = (raw) => raw - s0;
  const stops = [
    { id: 'ml', name: 'кв. Манастирски ливади', short: 'М. ЛИВАДИ', tts: 'квартал Манастирски ливади', link: 'връзка с трамвай № 27', linkTts: 'връзка с трамвай номер двадесет и седем', s: 0, st: B1, sb: 66 },
    { id: 'gd7', name: 'бул. Гоце Делчев', short: 'БУЛ. Г. ДЕЛЧЕВ', tts: 'Булевард Гоце Делчев', s: rs(stopAt(B1, sJ1 + 75)), st: B1, sb: sJ1 + 75 },
    { id: 'ruchey', name: 'пл. Ручей', short: 'ПЛ. РУЧЕЙ', tts: 'Площад Ручей', link: 'връзка с автобуси 64 и 204', linkTts: 'връзка с автобуси шестдесет и четири и двеста и четири', s: rs(stopAt(B1, sJ2 + 75)), st: B1, sb: sJ2 + 75 },
    { id: 'pgd', name: 'ПГ по дизайн „Е. Вазова“', short: 'ПГ ПО ДИЗАЙН', tts: 'Професионална гимназия по дизайн Елисавета Вазова', s: rs(stopAt(B1, 2900)), st: B1, sb: 2900 },
    { id: 'ps', name: 'бул. Пенчо Славейков', short: 'БУЛ. П. СЛАВЕЙКОВ', tts: 'булевард Пенчо Славейков', link: 'връзка с трамваи № 1 и 6', linkTts: 'връзка с трамваи номер едно и шест', s: rs(stopAt(B2, 300 + 135)), st: B2, sb: 300 + 135 },
  ];
  // tram stop lines before the three junctions on the way
  const stopLines = [
    { inter: inters[1], group: 'A', s: rs(stopAt(B1, sJ1 - 16)), turn: null },
    { inter: inters[2], group: 'A', s: rs(stopAt(B1, sJ2 - 16)), turn: null },
    { inter: inters[3], group: 'A', s: rs(stopAt(B1, sJ3 - 24)), turn: 'left', yield: false },
  ];
  // opposite track (for the overhead line): B2 eastbound → B1 southbound → loop entry
  let op = off(B2, B2.poly.length, 300 - 30, -TRACK);
  op = fillet(op, off(B1, sJ3 - 30, 70, -TRACK), 22).pts;
  const opp = new Polyline(op);

  // ---- car lanes ----
  const lanes = [];
  const mkLane = (id, pts, o = {}) => { const L = { id, poly: new Polyline(pts), speed: o.speed ?? 14, signals: [], next: null, spawn: o.spawn ?? true, neighbor: null, street: o.street, dir: o.dir }; lanes.push(L); return L; };
  const lanesFor = (st, idp, lats) => {
    const out = [];
    for (const dir of [1, -1]) {
      const ls = lats.map((l, k) => mkLane(`${idp}${dir > 0 ? 'f' : 'r'}${k}`, dir > 0 ? off(st, 0, st.poly.length, l) : off(st, st.poly.length, 0, -l), { street: st, dir }));
      for (let k = 0; k < ls.length; k++) { ls[k].neighbor = ls[k + 1] || ls[k - 1] || null; ls[k].neighborOffset = 0; }
      out.push(...ls);
    }
    return out;
  };
  // бул. България: every lane turns at the T-junction with бул. Тодор Каблешков (no lane just ends there)
  const BL = [RES + 1.75, RES + 5.25, RES + 8.75], XL = [1.75, 5.25], xc = 250, XLen = X0.poly.length, BLen = B1.poly.length;
  const b1S = (k) => off(B1, BLen, 0, -BL[k]), b1N = (k) => off(B1, 0, BLen, BL[k]);
  const xWw = (k) => off(X0, xc, 0, -XL[k]), xWe = (k) => off(X0, XLen, xc, -XL[k]);   // westbound: west arm / east arm
  const xEe = (k) => off(X0, xc, XLen, XL[k]), xEw = (k) => off(X0, 0, xc, XL[k]);     // eastbound: east arm / west arm
  const turn = (id, a, b, R, st, dir) => mkLane(id, fillet(a, b, R).pts, { street: st, dir });
  turn('B1r2', b1S(2), xWw(1), 9, B1, -1);     // right turns into the west arm
  turn('B1r1', b1S(1), xWw(0), 12, B1, -1);
  turn('B1r0', b1S(0), xEe(0), 10, B1, -1);    // left turn into the east arm
  turn('X0w1', xWe(1), b1N(2), 9, X0, -1);     // east arm: right turns onto бул. България
  turn('X0w0', xWe(0), b1N(1), 12, X0, -1);
  turn('X0e0', xEw(0), b1N(0), 12, X0, 1);     // west arm: left turn onto бул. България
  mkLane('X0t', off(X0, 0, XLen, XL[1]), { street: X0, dir: 1 }); // eastbound through
  lanesFor(B2, 'B2', [RES + 1.75, RES + 5.25, RES + 8.75]);
  // side streets: one lane each way plus a kerbside parking lane
  lanesFor(X1, 'X1', [1.9]);
  lanesFor(X2, 'X2', [1.9]);
  // signals per lane: every junction approach the lane passes (stop before the crossing street incl. sidewalks + zebra)
  for (const L of lanes) {
    for (const it of inters) for (const arm of [it.a, it.b]) {
      const other = arm === it.a ? it.b : it.a;
      const dist = other.st.halfW + other.st.sidewalk + 3.5;
      for (const dir of [1, -1]) {
        const sA = arm.s - dir * dist;
        if (sA < 0 || sA > arm.st.poly.length) continue;
        const p = arm.st.poly.at(sA);
        const pr = L.poly.project(p.x, p.z);
        if (pr.d > 16) continue;
        const lp = L.poly.at(pr.s), hd = p.h + (dir < 0 ? Math.PI : 0);
        if (Math.cos(lp.h - hd) < 0.9) continue;
        if ((lp.x - p.x) * -Math.sin(hd) + (lp.z - p.z) * Math.cos(hd) < 0.5) continue; // approach side (right-hand traffic)
        L.signals.push({ s: pr.s, inter: it, group: it.groups[arm.st.id], sCenter: pr.s + dist });
      }
    }
    L.signals.sort((a, b) => a.s - b.s);
  }

  const line = {
    code: 'ТМ7', vehicle: 'tram', number: '7', fleet: '2312',
    header: 'ТМ7 М.ЛИВАДИ-ХАН КУБРАТ', menu: ['ТМ 7 М.ЛИВАДИ→', 'МЕТРОСТ. ХАН КУБРАТ', 'ТМ 7 ХАН КУБРАТ→М.ЛИВАДИ'],
    dest: 'Метростанция Хан Кубрат', destShort: 'МЕТРОСТ. ХАН КУБРАТ', viaShort: 'М.ЛИВАДИ - ХАН КУБРАТ',
    destLong: 'кв. Манастирски ливади → Метростанция Хан Кубрат', title: 'Трамвай 2312 · Линия 7',
  };
  const route = {
    kind: 'tram', line, streets, inters, minors: [], lanes, ring: null, stops, stopLines,
    bus: track, busOffset: s0, opp, S: { B1, B2, X0, X1, X2 }, J: { sJ1, sJ2, sJ3 }, loopEnd: loop,
    platformY: PLATFORM_Y, waitCounts: { ml: 9, gd7: 7, ruchey: 6, pgd: 5, ps: 4 },
    pose(s, lat = 0) { const o = track.offsetAt(s + s0, lat); o.rx = -Math.sin(o.h); o.rz = Math.cos(o.h); return o; },
    project(x, z, hint) { const p = track.project(x, z, hint); p.s -= s0; return p; },
    get length() { return track.length - s0; },
  };
  return route;
}
