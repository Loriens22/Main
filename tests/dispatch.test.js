import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchVehicle, lineVehicles, lineShares, fleetFor, VEHICLES, LINE_FLEETS } from '../src/vehicle/Vehicles.js';
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
    const E = s.physics.electric;
    if (s.kind === 'trolleybus') {
      assert.ok(E && E.power > 100e3 && E.force >= 20e3 && E.vmax >= 50, `${id} electric traction`);
      assert.ok(s.trolley && s.trolley.base.length === 2 && s.trolley.length > 5, `${id} trolley poles`);
    } else if (E) {
      // battery-electric buses (line 84): traction motor and a finite traction battery with depot charging
      assert.ok(E.power > 100e3 && E.force >= 14e3 && E.vmax >= 50, `${id} electric traction`);
      assert.ok(s.battery && s.battery.kWh > 100 && s.battery.usable < 1 && s.battery.charge && s.battery.charge.kW > 0, `${id} traction battery`);
    } else assert.ok(s.physics.gears.length >= 4 && s.physics.torque(1300) > 500, `${id} drivetrain`);
    assert.ok(s.fleets.length && fleetFor(id, 3).fleet, `${id} fleet`);
    assert.ok(Object.values(LINE_FLEETS).some((l) => l.some((v) => v.id === id)), `${id} runs on a line`);
  }
});

test('line 9: one third each of Solaris IV, Solaris III and Ikarus; fleet modes', () => {
  assert.deepEqual(lineVehicles('9'), ['solaris4', 'solaris3', 'ikarus']);
  const sum = LINE_FLEETS['9'].reduce((a, v) => a + v.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const c = {};
  for (let n = 0; n < 6000; n++) { const v = dispatchVehicle('9', n, 11, 'random', lineShares('9', {})); c[v] = (c[v] || 0) + 1; }
  for (const id of ['solaris4', 'solaris3', 'ikarus']) assert.ok(Math.abs(c[id] / 6000 - 1 / 3) < 0.03, JSON.stringify(c));
  // a service keeps its vehicle (deterministic per seed and service number)
  for (let n = 0; n < 30; n++) assert.equal(dispatchVehicle('9', n, 3), dispatchVehicle('9', n, 3));
  // historical fleet mode: only the Ikarus; modern: only the two Solaris
  for (let n = 0; n < 200; n++) assert.equal(dispatchVehicle('9', n, 4, 'random', lineShares('9', { fleetMode9: 'historical' })), 'ikarus');
  for (let n = 0; n < 200; n++) assert.notEqual(dispatchVehicle('9', n, 4, 'random', lineShares('9', { fleetMode9: 'modern' })), 'ikarus');
  // custom weights
  const w = {};
  for (let n = 0; n < 4000; n++) { const v = dispatchVehicle('9', n, 8, 'random', lineShares('9', { shares9: { solaris4: 2, solaris3: 1, ikarus: 1 } })); w[v] = (w[v] || 0) + 1; }
  assert.ok(Math.abs(w.solaris4 / 4000 - 0.5) < 0.04, JSON.stringify(w));
  // manual choice in driver mode
  assert.equal(dispatchVehicle('9', 5, 1, 'ikarus'), 'ikarus');
  // trolleybuses never run on bus lines and vice versa
  for (let n = 0; n < 200; n++) assert.ok(['man', 'conecto'].includes(dispatchVehicle('280', n, 2)));
  assert.ok(['solaris4', 'solaris3', 'ikarus'].includes(dispatchVehicle('9', 1, 1, 'man')));
});

test('trolleybus specs: battery only on the Solaris IV, high floor and steps on the Ikarus', () => {
  const S4 = VEHICLES.solaris4, S3 = VEHICLES.solaris3, IK = VEHICLES.ikarus;
  assert.ok(S4.trolley.battery && S4.trolley.battery.kWh > 0);
  assert.equal(S3.trolley.battery, null);
  assert.equal(IK.trolley.battery, null);
  assert.ok(IK.dims.floorY > 0.8 && S4.dims.floorY < 0.4 && S3.dims.floorY < 0.4);
  assert.ok(IK.layout.steps && IK.layout.steps.length === 3 && IK.layout.steps.every((h, i, a) => i === 0 || h > a[i - 1]));
  assert.ok(IK.historical && !S4.historical && !S3.historical);
  // distinct door warnings: LED pattern / lamp pattern / long buzzer
  assert.equal(S4.doorWarning.kind, 'led');
  assert.equal(S3.doorWarning.kind, 'lamp');
  assert.equal(IK.doorWarning.kind, 'buzzer');
  assert.ok(IK.doorWarning.durs[0] > 1);
});
