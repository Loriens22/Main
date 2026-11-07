// Line 84 announcements: all 39 stops of both directions get their "next stop" and "stop" messages in order, the
// terminus adds "Последна спирка", and every spoken form reads cleanly (no abbreviations, digits or sign-only
// letters left for the voice). The spoken-form check runs over every line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Route280 } from '../src/gameplay/Route280Data.js';
import { StopManager } from '../src/gameplay/StopManager.js';
import { AnnouncementManager } from '../src/gameplay/AnnouncementManager.js';
import { pronounce } from '../src/audio/pronounce.js';
import { simulateTrip } from './helpers.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));

function runTrip(route, id) {
  const dir = route.direction(id);
  const sm = new StopManager(dir);
  const am = new AnnouncementManager(dir);
  am.startTrip();
  const played = [];
  sm.on((e) => am.onStopEvent(e));
  simulateTrip(dir, sm, {
    onStep: ({ s, v, doors }) => {
      am.update({ nextIndex: sm.next, distanceToNext: sm.distanceToNext(s), speed: v, doorsOpen: doors, frontS: s });
      let m;
      while ((m = am.pump())) {
        played.push(m);
        am.ended();
      }
    },
  });
  return { dir, played };
}

test('line 84: every stop of both directions is announced, in order, with the terminus suffix', () => {
  const route = new Route280(load('route84.json'));
  let total = 0;
  for (const id of ['A', 'B']) {
    const { dir, played } = runTrip(route, id);
    const n = dir.stops.length;
    total += n;
    for (let i = 1; i < n; i++) {
      const st = dir.stops[i];
      const sp = st.speech || st.name;
      const arr = played.filter((m) => m.kind === 'arrival' && m.stopIndex === i);
      assert.equal(arr.length, 1, `${id}: arrival at ${st.code} ${st.name}`);
      assert.equal(arr[0].text, `Спирка ${sp}.${i === n - 1 ? ' Последна спирка.' : ''}`);
      const nx = played.filter((m) => m.kind === 'next' && m.stopIndex === i);
      assert.ok(nx.length <= 1, `${id}: one "next" for ${st.code}`);
      if (nx.length) assert.ok(played.indexOf(nx[0]) < played.indexOf(arr[0]), `${id}: "next" before "stop" for ${st.code}`);
    }
    // the messages come in stop order
    const idx = played.map((m) => m.stopIndex);
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `${id}: announcement order`);
    // "next" for every stop after the first departure, except where the arrival came first (short hops)
    assert.ok(played.filter((m) => m.kind === 'next').length >= n - 3, `${id}: next-stop messages`);
  }
  assert.equal(total, 39);
});

test('line 84: the airport and Druzhba stops are spoken in full', () => {
  const r = load('route84.json');
  const all = Object.values(r.directions).flatMap((d) => d.stops);
  const said = (code) => pronounce(`Спирка ${all.find((s) => s.code === code).speech}.`);
  assert.equal(said('2452'), 'Спирка Ер Ве Де.');
  assert.equal(said('2451'), 'Спирка Ресторант Александрия.');
  assert.equal(said('2454'), 'Спирка Летище София Терминал две.');
  assert.equal(said('1006'), 'Спирка Летище София Терминал едно.');
  assert.equal(said('0128'), 'Спирка Блок сто и осем, жилищен комплекс Дружба едно.');
  assert.equal(said('1194'), 'Спирка Университетска болница Света Анна.');
  // the sign names alone (the voice's safety net) read the same way
  assert.equal(pronounce('бл. 3 ж.к. Дружба-1'), 'блок три жилищен комплекс Дружба едно');
  assert.equal(pronounce('Р-т Александрия'), 'ресторант Александрия');
  assert.equal(pronounce('УМБАЛ „Св. Анна“'), 'университетска болница света Анна');
  assert.equal(pronounce('Св. Николай'), 'свети Николай');
});

test('every line: spoken forms leave no abbreviations, digits or quotes for the voice', () => {
  const files = readdirSync(new URL('../src/data/', import.meta.url)).filter((f) => /^route\d+\.json$/.test(f));
  assert.ok(files.length >= 6);
  for (const f of files) {
    for (const d of Object.values(load(f).directions)) {
      for (const st of d.stops) {
        const t = pronounce(`Спирка ${st.speech || st.name}.`);
        assert.ok(!/\d/.test(t), `${f} ${st.code}: digits in "${t}"`);
        assert.ok(!/[„“”"]/.test(t), `${f} ${st.code}: quotes in "${t}"`);
        assert.ok(!/(?<![\p{L}])(ж\.к|бул\.|ул\.|бл\.|пл\.|Р-т|РВД|УМБАЛ)(?![\p{L}])/u.test(t), `${f} ${st.code}: abbreviation in "${t}"`);
      }
    }
  }
});
