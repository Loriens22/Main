import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, simulateTrip } from './helpers.js';
import { StopManager } from '../src/gameplay/StopManager.js';
import { AnnouncementManager } from '../src/gameplay/AnnouncementManager.js';

function runTrip(id, serve) {
  const r = makeRoute();
  const dir = r.direction(id);
  const sm = new StopManager(dir);
  const am = new AnnouncementManager(dir);
  am.startTrip();
  const played = [];
  sm.on((e) => am.onStopEvent(e));
  simulateTrip(dir, sm, {
    serve,
    onStep: ({ s, v, doors }) => {
      am.update({ nextIndex: sm.next, distanceToNext: sm.distanceToNext(s), speed: v, doorsOpen: doors, frontS: s });
      // the voice is instantaneous in this test: play everything queued
      let m;
      while ((m = am.pump())) {
        played.push({ ...m, s, v, doors });
        am.ended();
      }
    },
  });
  return { dir, played };
}

test('each intermediate stop gets "Следваща спирка" after departure and "Спирка" on approach', () => {
  for (const id of ['A', 'B']) {
    const { dir, played } = runTrip(id);
    for (let i = 1; i < dir.stops.length; i++) {
      const msgs = played.filter((m) => m.stopIndex === i);
      const kinds = msgs.map((m) => m.kind);
      assert.ok(kinds.includes('arrival'), `${id} stop ${i} arrival`);
      const arrival = msgs.find((m) => m.kind === 'arrival');
      assert.equal(arrival.text.split('.')[0], `Спирка ${dir.stops[i].speech}`);
      if (kinds.includes('next')) {
        assert.ok(kinds.indexOf('next') < kinds.indexOf('arrival'), 'next before arrival');
        assert.equal(msgs.find((m) => m.kind === 'next').text, `Следваща спирка ${dir.stops[i].speech}.`);
      }
    }
    // the very first "next stop" message refers to stop 1 and is played while moving
    const first = played[0];
    assert.equal(first.kind, 'next');
    assert.equal(first.stopIndex, 1);
    assert.ok(first.v > 0.5 && !first.doors, 'announced after departing, not while stationary');
  }
});

test('next-stop messages are never played with doors open; no duplicates', () => {
  const { played } = runTrip('A');
  for (const m of played.filter((m) => m.kind === 'next')) assert.equal(m.doors, false);
  const keys = played.map((m) => `${m.kind}:${m.stopIndex}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('arrival trigger distance is speed aware', () => {
  const r = makeRoute();
  const am = new AnnouncementManager(r.direction('A'));
  assert.ok(am.triggerDistance(14) > am.triggerDistance(4));
  assert.ok(am.triggerDistance(100) <= am.opts.approachMax);
});

test('terminal arrival announces the last stop', () => {
  const { dir, played } = runTrip('A');
  const last = played.filter((m) => m.stopIndex === dir.stops.length - 1 && m.kind === 'arrival');
  assert.equal(last.length, 1);
  assert.match(last[0].text, /^Спирка Студентски град\. Последна спирка\.$/);
});

test('messages never overlap: pump returns nothing while one is playing', () => {
  const r = makeRoute();
  const dir = r.direction('B');
  const am = new AnnouncementManager(dir);
  am.onStopEvent({ type: 'departed', index: 0 });
  const a = am.pump();
  assert.ok(a && a.stopIndex === 1);
  // arrival for stop 1 becomes due while "next stop" is still being spoken
  am.update({ nextIndex: 1, distanceToNext: 40, speed: 8, doorsOpen: false });
  assert.equal(am.pump(), null, 'second message waits');
  am.ended();
  const b = am.pump();
  assert.ok(b && b.kind === 'arrival' && b.stopIndex === 1);
  // a stale "next" for an already-passed stop is superseded
  am.ended();
  am.onStopEvent({ type: 'departed', index: 2 });
  am.onStopEvent({ type: 'departed', index: 3 });
  assert.equal(am.pump().stopIndex, 4);
});

test('skipped stop: the following stop is still announced', () => {
  const skip = new Set(['0742']);
  const { dir, played } = runTrip('B', (s) => !skip.has(s.code));
  const idx = dir.stops.findIndex((s) => s.code === '0742');
  assert.ok(played.some((m) => m.kind === 'next' && m.stopIndex === idx + 1));
});
