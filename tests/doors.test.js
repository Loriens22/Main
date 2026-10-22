import test from 'node:test';
import assert from 'node:assert/strict';
import { Door, DoorSystem, DOOR_TIMING } from '../src/vehicle/DoorController.js';

function run(door, seconds, dt = 0.01) {
  for (let t = 0; t < seconds; t += dt) door.update(dt);
}

test('closing sequence: request -> beep 1 -> beep 2 -> closing starts -> closed', () => {
  const d = new Door(1);
  const ev = [];
  let time = 0;
  d.on((e) => ev.push({ ...e, time }));
  d.open();
  for (; time < 2; time += 0.01) d.update(0.01);
  assert.equal(d.state, 'open');
  ev.length = 0;
  d.requestClose();
  for (; time < 8; time += 0.01) d.update(0.01);
  const seq = ev.map((e) => (e.type === 'beep' ? `beep${e.n}` : e.type));
  assert.deepEqual(seq, ['closeRequest', 'beep1', 'beep2', 'closingStart', 'closed']);
  const b1 = ev.find((e) => e.n === 1).time, b2 = ev.find((e) => e.n === 2).time;
  const cs = ev.find((e) => e.type === 'closingStart').time;
  assert.ok(b2 > b1 + 0.3, 'two distinct beeps');
  assert.ok(cs > b2, 'doors move only after the second beep');
  assert.equal(d.openness, 0);
});

test('door does not move during the warning beeps', () => {
  const d = new Door(2);
  d.open();
  run(d, 2);
  d.requestClose();
  run(d, DOOR_TIMING.closeStartAt - 0.05);
  assert.equal(d.state, 'warning');
  assert.equal(d.openness, 1);
});

test('obstruction while closing reopens the door', () => {
  const d = new Door(3);
  const ev = [];
  d.on((e) => ev.push(e.type));
  d.open();
  run(d, 2);
  d.requestClose();
  run(d, DOOR_TIMING.closeStartAt + 0.4);
  assert.equal(d.state, 'closing');
  d.obstructed = true;
  run(d, 0.05);
  assert.ok(ev.includes('obstruction'));
  run(d, 2);
  assert.equal(d.state, 'open');
  d.obstructed = false;
  run(d, DOOR_TIMING.reopenRetry + DOOR_TIMING.closeStartAt + DOOR_TIMING.closeDuration + 0.5);
  assert.equal(d.state, 'closed', 'retries automatically after the doorway clears');
});

test('interlock: doors refuse to open while moving; interlock active while open', () => {
  const ds = new DoorSystem();
  assert.equal(ds.open(null, 5), false);
  assert.equal(ds.allClosed, true);
  assert.equal(ds.open(null, 0), true);
  assert.equal(ds.interlockActive, true);
  run(ds, 2);
  ds.close();
  run(ds, 5);
  assert.equal(ds.allClosed, true);
  assert.equal(ds.interlockActive, false);
});
