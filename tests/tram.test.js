import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchVehicle, lineVehicles, VEHICLES, LINE_FLEETS } from '../src/vehicle/Vehicles.js';
import { frames } from '../src/vehicle/frames.js';
import { TrackLine, placeSections, bogiePoses, TramPhysics } from '../src/vehicle/trams/TramDynamics.js';
import { Route280 } from '../src/gameplay/Route280Data.js';

const TRAMS = Object.values(VEHICLES).filter((s) => s.kind === 'tram');

/** A straight track (radius 0) or a circle of radius R turning right, front end at s = 0. */
function track(R = 0) {
  return {
    at: (s) => (R ? { x: R * (1 - Math.cos(s / R)), z: -R * Math.sin(s / R) } : { x: 0, z: -s }),
    y: () => 0,
  };
}
const pt = (pose, d0, d) => [pose.x + pose.ux * (d - d0), pose.z + pose.uz * (d - d0)];

test('line 12 dispatches the Schindler and the T6M-700 half and half', () => {
  assert.deepEqual(lineVehicles('12'), ['schindler', 't6m']);
  assert.deepEqual(LINE_FLEETS['12'].map((v) => v.share), [0.5, 0.5]);
  const c = {};
  for (let n = 0; n < 4000; n++) { const v = dispatchVehicle('12', n, 3); c[v] = (c[v] || 0) + 1; }
  assert.ok(Math.abs(c.schindler / 4000 - 0.5) < 0.04, JSON.stringify(c));
  for (let n = 0; n < 500; n++) assert.ok(!['schindler', 't6m'].includes(dispatchVehicle('280', n, 3)));
});

test('tram specs: contiguous sections, doors inside their sections, seat map, frames', () => {
  assert.equal(TRAMS.length, 2);
  for (const s of TRAMS) {
    const secs = s.sections;
    assert.equal(secs[0].d0, 0, `${s.id} starts at its front end`);
    assert.ok(Math.abs(secs[secs.length - 1].d1 - s.dims.length) < 1e-6, `${s.id} length`);
    for (let i = 1; i < secs.length; i++) assert.ok(Math.abs(secs[i].d0 - secs[i - 1].d1 - 0.4) < 1e-6, `${s.id} joint gap`);
    for (const sec of secs) assert.equal(sec.supports.length, 2, `${s.id} ${sec.id} two supports`);
    for (const d of s.doors) {
      const sec = secs.find((q) => q.id === d.section);
      assert.ok(d.z0 > 0 && d.z1 < sec.length && d.z1 > d.z0, `${s.id} door ${d.id}`);
    }
    assert.ok(s.layout.seats.length >= 30, `${s.id} seats`);
    for (const st of s.layout.seats) assert.ok(secs.some((q) => q.id === st.sec && st.z > 0 && st.z < q.length), `${s.id} seat in its section`);
    const F = frames(s);
    assert.ok(Math.abs(F.frontZ) < 1e-9);
    assert.ok(Math.abs(F.rearZ - secs[secs.length - 1].length) < 1e-6);
    assert.equal(typeof s.create, 'function');
  }
});

test('sections meet at their joints on straight and curved track; bogies sit on the rails', () => {
  for (const s of TRAMS) {
    for (const R of [0, 25, -18]) {
      const line = track(R);
      const poses = placeSections(s, line, 0);
      for (let i = 1; i < s.sections.length; i++) {
        const A = s.sections[i - 1], B = s.sections[i];
        const J = B.supports[0].d; // the joint (or Jacobs bogie) shared by the two sections
        const pa = pt(poses[A.id], A.d0, J), pb = pt(poses[B.id], B.d0, J);
        assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 0.02, `${s.id} R=${R} joint ${A.id}/${B.id}: ${pa} vs ${pb}`);
      }
      for (const b of bogiePoses(s, line, 0)) {
        const r = R ? Math.hypot(b.x - R, b.z) : Math.abs(b.x);
        // the bogie centre lies on the chord of its two axles: a few mm inside the arc
        assert.ok(Math.abs(r - Math.abs(R)) < 0.03, `${s.id} R=${R} bogie at ${b.d}: ${r}`);
      }
      // the front end swings out of the curve by the overhang ahead of the first bogie (a(a + c) / 2R)
      const f = poses[s.sections[0].id], [b1, b2] = s.sections[0].supports;
      const over = R ? (b1.d * (b1.d + b2.d - b1.d)) / (2 * Math.abs(R)) : 0;
      const off = R ? Math.hypot(f.x - R, f.z) - Math.abs(R) : Math.abs(f.x);
      assert.ok(Math.abs(off - over) < 0.15, `${s.id} R=${R} front overhang ${off.toFixed(2)} expected ${over.toFixed(2)}`);
    }
  }
});

function run(spec, { notch = spec.physics.notches, t = 10, v0 = 0, setup = null } = {}) {
  const p = new TramPhysics(spec);
  p.engineOn = true; p.parkingBrake = false; p.selector = 'D'; p.pantoH = 1; p.v = v0;
  p.notch = notch;
  if (setup) setup(p);
  const dt = 1 / 120;
  let s0 = p.s;
  for (let k = 0; k < t / dt; k++) p.step(dt, { interlock: !!(setup && setup.interlock) });
  return { p, dist: p.s - s0 };
}

test('traction: plausible acceleration, top speed, no power with the pantograph down or doors open', () => {
  for (const s of TRAMS) {
    const a = run(s, { t: 10 });
    const kmh = a.p.v * 3.6;
    assert.ok(kmh > 22 && kmh < 48, `${s.id} 10 s at full power: ${kmh.toFixed(1)} km/h`);
    const top = run(s, { t: 120 });
    assert.ok(top.p.v <= s.physics.vmax + 0.6, `${s.id} top speed ${top.p.v * 3.6}`);
    assert.ok(run(s, { setup: (p) => (p.pantoH = 0) }).p.v < 0.01, `${s.id} pantograph down`);
    const doors = (p) => p;
    doors.interlock = true;
    assert.ok(run(s, { setup: doors }).p.v < 0.01, `${s.id} door interlock`);
  }
});

test('braking: service brake and emergency brake stopping distances from 40 km/h', () => {
  for (const s of TRAMS) {
    const v0 = 40 / 3.6;
    const sb = run(s, { notch: -s.physics.brakeNotches, v0, t: 30 });
    assert.ok(sb.p.v === 0 && sb.dist > 35 && sb.dist < 80, `${s.id} service brake ${sb.dist.toFixed(1)} m`);
    const eb = run(s, { notch: 0, v0, t: 30, setup: (p) => (p.emergency = true) });
    assert.ok(eb.p.v === 0 && eb.dist < 32 && eb.dist < sb.dist, `${s.id} emergency brake ${eb.dist.toFixed(1)} m`);
  }
});

test('adhesion: on a wet rail full power slips, sand helps', () => {
  const s = VEHICLES.t6m;
  const dry = run(s, { t: 3 });
  const wet = run(s, { t: 3, setup: (p) => (p.wet = 1) });
  assert.ok(wet.p.v < dry.p.v && wet.p.slip > 0, `wet ${wet.p.v} dry ${dry.p.v}`);
  const sand = run(s, { t: 3, setup: (p) => { p.wet = 1; p.sand = true; } });
  assert.ok(sand.p.v > wet.p.v);
});

test('the track line of line 12 starts at the first stop and runs through both loops', () => {
  const route = new Route280(JSON.parse(fs.readFileSync(new URL('../src/data/route12.json', import.meta.url))));
  const hf = { heightAt: () => 500 };
  for (const dir of ['A', 'B']) {
    const L = new TrackLine(route, dir, hf);
    const d = route.direction(dir);
    const p0 = d.path.at(0), a = L.at(0);
    assert.ok(Math.hypot(a.x - p0.x, a.z - p0.z) < 0.5, `${dir} s = 0 at the path start`);
    assert.ok(Math.abs(L.length - d.length) < 1e-6);
    assert.ok(L.end > L.length + 50, `${dir} continues through the loop`);
    // a tram 30 m long fits behind the first stop
    const back = L.at(-30), b0 = L.at(-29);
    assert.ok(Math.hypot(back.x - b0.x, back.z - b0.z) > 0.9);
    for (let s = 0; s < L.length; s += 500) assert.ok(L.y(s) > 500 && L.y(s) < 501, `${dir} rail height at ${s}`);
    assert.ok([...L.street].some((v) => v === 1) && [...L.street].some((v) => v === 0), `${dir} street and ballast track`);
  }
});
