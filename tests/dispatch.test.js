import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchVehicle, lineVehicles, fleetFor, VEHICLES, LINE_FLEETS } from '../src/vehicle/Vehicles.js';
import { frames } from '../src/vehicle/frames.js';

test('each line dispatches only its own vehicle types', () => {
  assert.deepEqual(lineVehicles('280'), ['man', 'conecto']);
  assert.deepEqual(lineVehicles('64'), ['procity', 'yutong']);
  for (let n = 0; n < 500; n++) {
    assert.ok(['man', 'conecto'].includes(dispatchVehicle('280', n, 7)));
    assert.ok(['procity', 'yutong'].includes(dispatchVehicle('64', n, 7)));
  }
  // a type of the other line is never forced onto a line, even when asked for
  assert.ok(['procity', 'yutong'].includes(dispatchVehicle('64', 3, 1, 'man')));
  assert.ok(['man', 'conecto'].includes(dispatchVehicle('280', 3, 1, 'yutong')));
});

test('dispatch is deterministic per seed and service, and roughly 50/50 by default', () => {
  for (let n = 0; n < 50; n++) assert.equal(dispatchVehicle('280', n, 42), dispatchVehicle('280', n, 42));
  const count = (line, seed, shares) => {
    const c = {};
    for (let n = 0; n < 4000; n++) { const v = dispatchVehicle(line, n, seed, 'random', shares); c[v] = (c[v] || 0) + 1; }
    return c;
  };
  const a = count('280', 1), b = count('64', 99);
  assert.ok(Math.abs(a.man / 4000 - 0.5) < 0.04, JSON.stringify(a));
  assert.ok(Math.abs(b.procity / 4000 - 0.5) < 0.04, JSON.stringify(b));
  // different seeds give different sequences
  const seq = (seed) => Array.from({ length: 24 }, (_, n) => dispatchVehicle('64', n, seed)).join();
  assert.notEqual(seq(1), seq(2));
});

test('a configured distribution is honoured; a fixed choice always wins', () => {
  const c = {};
  for (let n = 0; n < 4000; n++) { const v = dispatchVehicle('64', n, 5, 'random', { procity: 0.8, yutong: 0.2 }); c[v] = (c[v] || 0) + 1; }
  assert.ok(Math.abs(c.procity / 4000 - 0.8) < 0.04, JSON.stringify(c));
  for (let n = 0; n < 20; n++) assert.equal(dispatchVehicle('64', n, 5, 'yutong'), 'yutong');
  for (let n = 0; n < 20; n++) assert.equal(dispatchVehicle('64', n, 5, 'random', { procity: 1, yutong: 0 }), 'procity');
});

test('every vehicle spec is complete and consistent', () => {
  for (const [id, s] of Object.entries(VEHICLES)) {
    assert.equal(s.id, id);
    if (s.kind === 'tram') continue; // tests/tram.test.js
    const F = frames(s);
    assert.ok(F.frontZ < -5, `${id} front bumper`);
    assert.ok(Math.abs((s.articulated ? -F.frontZ + F.hitchFront - F.hitchRear + F.rearZ : -F.frontZ + F.rearZ) - s.dims.length) < 0.6, `${id} length ${s.dims.length}`);
    assert.ok(s.doors.length >= 2 && s.doors.every((d) => d.z1 > d.z0), `${id} doors`);
    if (!s.articulated) assert.ok(s.doors.every((d) => d.section === 'front'), `${id} rigid doors`);
    assert.ok(s.layout.seats.length > 15, `${id} seats`);
    assert.ok(s.physics.gears.length >= 4 && s.physics.torque(1300) > 500, `${id} drivetrain`);
    assert.ok(s.fleets.length && fleetFor(id, 3).fleet, `${id} fleet`);
    assert.ok(Object.values(LINE_FLEETS).some((l) => l.some((v) => v.id === id)), `${id} runs on a line`);
  }
});
