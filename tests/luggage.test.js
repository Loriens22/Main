// Air travellers on line 84: suitcases at the airport stops, on the way to the terminals, and where they get off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Route280 } from '../src/gameplay/Route280Data.js';
import { PedestrianManager, isAirportStop } from '../src/gameplay/PedestrianManager.js';
import { mulberry32 } from '../src/core/rng.js';

const route = new Route280(JSON.parse(readFileSync(new URL('../src/data/route84.json', import.meta.url), 'utf8')));
const make = () => new PedestrianManager({ scene: { add() {} }, world: { roadBuilder: { sidewalkInfo: [] }, stopObjects: [] }, route, quality: 'high' });
const stop = (dir, code) => route.dirs[dir].stops.find((s) => s.code === code);

test('airport stops: both terminals, not the business park or the air traffic control stop', () => {
  const names = Object.values(route.dirs).flatMap((d) => d.stops).filter(isAirportStop).map((s) => s.code).sort();
  assert.deepEqual(names, ['1006', '2454', '2455']);
});

test('crowds at the terminals mostly carry suitcases; some city riders bound for the airport do too', () => {
  const pm = make();
  pm.manageStops({ x: stop('B', '2455').pole[0], z: stop('B', '2455').pole[1] });
  const t2 = pm.stopCrowds.get('2455');
  assert.ok(t2.length >= 4, `${t2.length} waiting at T2`);
  assert.ok(t2.filter((p) => p.look.lug).length >= t2.length * 0.5);
  // stops towards the airport (direction A) are marked, the city-bound ones after the terminals are not
  assert.ok(pm.towardAirport.has(stop('A', '1700')));
  assert.ok(!pm.towardAirport.has(stop('B', '1289')));
  let lug = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    const q = make();
    q.rand = mulberry32(1000 + k * 97);
    const st = stop('A', '1287');
    q.manageStops({ x: st.pole[0], z: st.pole[1] });
    for (const p of q.stopCrowds.get('1287') || []) { n++; if (p.look.lug) lug++; }
  }
  assert.ok(n > 20 && lug > 0 && lug < n * 0.4, `${lug} of ${n} with suitcases at Orlov Most`);
});

test('travellers ride to the terminal; arrivals ride into town or across to Terminal 1', () => {
  const pm = make();
  const busA = { dir: route.dirs.A }, busB = { dir: route.dirs.B };
  const look = pm.giveLuggage(pm.newLook());
  assert.equal(pm.pickDest(busA, stop('A', '1287'), look), stop('A', '2454').index);
  const dests = new Set();
  for (let k = 0; k < 200; k++) dests.add(pm.pickDest(busB, stop('B', '2455'), look));
  assert.ok(dests.has(stop('B', '1006').index), 'some change to Terminal 1');
  for (const d of dests) assert.ok(d === stop('B', '1006').index || d > stop('B', '1006').index, `destination ${d}`);
  assert.ok([...dests].some((d) => d >= route.dirs.B.stops.length - 4), 'most go to the centre');
  // a traveller usually keeps standing beside the suitcase
  const bus = { riders: [], spec: { layout: { seats: new Array(30).fill({}) } } };
  let standing = 0;
  for (let k = 0; k < 200; k++) if (pm.freeSeat(bus, look) < 0) standing++;
  assert.ok(standing > 80, `${standing} of 200 standing`);
});
