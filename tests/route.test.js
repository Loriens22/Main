import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, routeJson } from './helpers.js';

const EXPECT_A = '1697 0441 1287 2326 1696 0494 2352 0764 1740 0617 0800 1691 0524 1610 0533 0741 1606 1694'.split(' ');
const EXPECT_B = '1693 1609 0742 0534 1611 0530 1692 0801 0614 1743 0761 2351 0492 1258 1695 2327 1288 1697'.split(' ');

test('direction A stop codes follow the official order', () => {
  const r = makeRoute();
  assert.deepEqual(r.direction('A').stops.map((s) => s.code), EXPECT_A);
});

test('direction B stop codes follow the official order', () => {
  const r = makeRoute();
  assert.deepEqual(r.direction('B').stops.map((s) => s.code), EXPECT_B);
});

test('directions are independent (B is not a reversed copy of A)', () => {
  const r = makeRoute();
  const a = r.direction('A'), b = r.direction('B');
  assert.notDeepEqual(b.stops.map((s) => s.code), [...a.stops.map((s) => s.code)].reverse());
  assert.ok(b.stops.some((s) => s.code === '1258'), 'Площад на авиацията only served towards SU');
  assert.ok(!a.stops.some((s) => s.code === '1258'));
  // different street alignment in the centre: B uses бул. Цар Освободител, A does not
  assert.ok(b.streets.some((s) => s.name === 'бул. Цар Освободител'));
  assert.ok(!a.streets.some((s) => s.name === 'бул. Цар Освободител'));
});

test('stops are strictly increasing along each path', () => {
  const r = makeRoute();
  for (const id of ['A', 'B']) {
    const st = r.direction(id).stops;
    for (let i = 1; i < st.length; i++) assert.ok(st[i].s > st[i - 1].s, `${id} stop ${i} ordering`);
  }
});

test('path is continuous (no reversals or implausible jumps) and long enough', () => {
  const r = makeRoute();
  for (const id of ['A', 'B']) {
    const p = routeJson.directions[id].path;
    for (let i = 1; i < p.length; i++) {
      const g = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      assert.ok(g < 800, `${id} vertex gap ${g}`); // long straight boulevard sections have sparse vertices
      if (i > 1) {
        const ax = p[i - 1][0] - p[i - 2][0], az = p[i - 1][1] - p[i - 2][1];
        const bx = p[i][0] - p[i - 1][0], bz = p[i][1] - p[i - 1][1];
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
        if (la > 1 && lb > 1) assert.ok((ax * bx + az * bz) / (la * lb) > -0.9, `${id} reversal at vertex ${i}`);
      }
    }
    const d = r.direction(id);
    assert.ok(d.length > 9000 && d.length < 12000, `${id} length ${d.length}`);
    // every stop pole lies within 45 m of the bus path, on the right-hand side
    for (const s of d.stops) {
      const n = d.path.nearest(s.pole[0], s.pole[1]);
      assert.ok(n.d < 45, `${s.code} pole distance ${n.d}`);
    }
  }
});

test('terminals: A ends where B starts (Студентски град) and B ends where A starts (СУ)', () => {
  const r = makeRoute();
  const a = r.direction('A').stops, b = r.direction('B').stops;
  assert.equal(a.at(-1).name, 'Студентски град');
  assert.equal(b[0].name, 'Студентски град');
  assert.equal(b.at(-1).code, a[0].code);
  const link = routeJson.terminalLinks.AtoB;
  assert.ok(link.length >= 2, 'terminal loop link exists');
});

test('every stop has coordinates, a Bulgarian name and an announcement text', () => {
  const r = makeRoute();
  for (const id of ['A', 'B'])
    for (const s of r.direction(id).stops) {
      assert.match(s.name, /[А-Яа-я]/);
      assert.ok(s.speech && s.speech.length > 2);
      assert.ok(s.lat > 42.6 && s.lat < 42.71 && s.lon > 23.3 && s.lon < 23.4);
      assert.ok(s.source && s.source.osm);
    }
});
