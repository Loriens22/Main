import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from './helpers.js';
import { SweptPath } from '../src/gameplay/SweptPath.js';
import { buildDriveLine } from '../src/gameplay/DriveLine.js';
import { BUS } from '../src/vehicle/BusSpec.js';

const route = makeRoute();
const sweep = new SweptPath(route);

test('the drive line of both directions lies inside the swept area', () => {
  for (const id of ['A', 'B']) {
    const L = buildDriveLine(route, id);
    for (let s = 10; s < L.length - 10; s += 25) {
      const p = L.at(s);
      assert.ok(sweep.hits(p.x, p.z), `${id} s=${s} not covered`);
    }
  }
});

test('the swept area is about one bus wide on straight road', () => {
  const L = buildDriveLine(route, 'A');
  const other = buildDriveLine(route, 'B');
  let checked = 0;
  for (let s = 100; s < L.length - 100; s += 20) {
    if (Math.abs(L.curvature(s, 20)) > 1 / 400) continue;
    const p = L.at(s), t = L.tangent(s, 6);
    const rx = -t.tz, rz = t.tx; // right of travel
    const inner = BUS.halfW + 0.2, outer = BUS.halfW + 1.6;
    // the bus body just right of the line is covered...
    assert.ok(sweep.hits(p.x + rx * inner, p.z + rz * inner), `A s=${s} body not covered`);
    // ...but the pavement beyond it is not, unless the other direction is there
    const qx = p.x + rx * outer, qz = p.z + rz * outer;
    if (other.nearest(qx, qz).d < 6) continue;
    assert.equal(sweep.hits(qx, qz), false, `A s=${s}: swept area too wide`);
    checked++;
  }
  assert.ok(checked > 50, `only ${checked} straight samples checked`);
});

test('the inside of a tight turn is covered beyond the front-axle track (rear section cuts in)', () => {
  const L = buildDriveLine(route, 'A');
  let found = 0;
  for (let s = 60; s < L.length - 60; s += 2) {
    const k = L.curvature(s, 6);
    if (Math.abs(k) < 1 / 25) continue;
    const p = L.at(s), t = L.tangent(s, 6);
    // inside of the curve: k < 0 turns right, and right of travel is (-tz, tx)
    const sx = t.tz * Math.sign(k), sz = -t.tx * Math.sign(k);
    const a = sweep.hits(p.x + sx * (BUS.halfW + 0.9), p.z + sz * (BUS.halfW + 0.9));
    const b = sweep.hits(p.x - sx * (BUS.halfW + 0.9), p.z - sz * (BUS.halfW + 0.9));
    if (a && !b) found++;
    if (found > 3) break;
    s += 30;
  }
  assert.ok(found > 0, 'no turn where only the inside is swept beyond the body');
});
