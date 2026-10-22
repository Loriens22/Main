import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, simulateTrip } from './helpers.js';
import { StopManager } from '../src/gameplay/StopManager.js';

test('a full trip serves every stop in order and ends at the terminal', () => {
  const r = makeRoute();
  for (const id of ['A', 'B']) {
    const dir = r.direction(id);
    const sm = new StopManager(dir);
    simulateTrip(dir, sm);
    const served = sm.log.filter((e) => e.type === 'served').map((e) => e.index);
    assert.deepEqual(served, dir.stops.map((_, i) => i), `${id} served order`);
    assert.equal(sm.log.at(-1).type, 'terminal');
    assert.equal(sm.log.filter((e) => e.type === 'passed').length, 0);
  }
});

test('skipped stops are reported as passed, the sequence continues', () => {
  const r = makeRoute();
  const dir = r.direction('A');
  const sm = new StopManager(dir);
  const skip = new Set(['0764', '0533']);
  simulateTrip(dir, sm, { serve: (s) => !skip.has(s.code) });
  const passed = sm.log.filter((e) => e.type === 'passed').map((e) => e.stop.code);
  assert.deepEqual(passed, ['0764', '0533']);
  const served = sm.log.filter((e) => e.type === 'served').map((e) => e.stop.code);
  assert.ok(!served.includes('0764'));
  assert.ok(served.includes('1740'));
});

test('stopping and waiting does not advance the stop counter twice', () => {
  const r = makeRoute();
  const dir = r.direction('B');
  const sm = new StopManager(dir);
  const st = dir.stops[3];
  sm.next = 3;
  for (let i = 0; i < 50; i++) sm.update({ frontS: st.frontS - 0.4, speed: 0, doorsOpen: i > 5 && i < 30, dt: 0.1 });
  assert.equal(sm.log.filter((e) => e.type === 'arrived').length, 1);
  assert.equal(sm.log.filter((e) => e.type === 'served').length, 1);
  assert.equal(sm.next, 3);
  for (let s = st.frontS; s < st.frontS + 30; s += 0.5) sm.update({ frontS: s, speed: 5, doorsOpen: false, dt: 0.1 });
  assert.equal(sm.next, 4);
  assert.equal(sm.log.filter((e) => e.type === 'departed').length, 1);
});

test('a bus far off the route line neither arrives at nor passes a stop', () => {
  const dir = makeRoute().direction('B');
  const sm = new StopManager(dir);
  // on the turning loop, 36 m from the line, projected beyond stop 0
  sm.update({ frontS: dir.stops[0].frontS + 50, speed: 0, doorsOpen: true, dt: 0.1, offRoute: 36 });
  assert.equal(sm.next, 0);
  assert.equal(sm.atStop, -1);
  // back on the line at the pole: arrives and is served
  sm.update({ frontS: dir.stops[0].frontS, speed: 0, doorsOpen: true, dt: 0.1, offRoute: 1 });
  assert.equal(sm.atStop, 0);
  assert.ok(sm.served.has(0));
});
