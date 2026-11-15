// Floor-hole audit for the NASA facility (regression test for "holes between the corridors you can fall into"): per
// walkable level, the physics floor under a 0.5 m grid; a flood fill from known standing points through cells whose
// floor steps < 0.4 m with no wall between them; a hole is a reachable cell's neighbour (no wall between) whose floor
// is missing or more than 1.2 m lower and wide enough for the player (0.6 m). Run once per elevator level: the
// landings without the car must be closed by their gates. Reports hole clusters in model coordinates.
//   node e2e/nasa_floor_audit.mjs <url>      (against a served build)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
p.setDefaultTimeout(900000);
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.zone.content.spawnAt('nasa_atrium'); g.step(30, 1 / 30, false); });
const all = [];
for (const lvIdx of [0, 1, 2, 3]) {
const res = await p.evaluate(async (lvIdx) => {
  const g = window.__game;
  const nn = g.zone.content.nasa;
  if (nn.moveTo) { nn.moveTo('nasa_elevator', lvIdx); for (let i = 0; i < 60; i++) { g.step(30, 1 / 30, false); const m = nn.mover('nasa_elevator'); if (m.y === m.target) break; } g.step(90, 1 / 30, false); }
  const elev = nn.mover('nasa_elevator');
  const n = g.zone.content.nasa, o = n.origin, ph = g.zone.ground.physics, V = g.camera.position.constructor;
  // model frame (Blender x, y north, z up) → world
  const W = (x, y, z) => new V(o.x + x, o.y + z, o.z - y);
  const down = new V(0, -1, 0);
  const STEP = 0.5;
  const levels = [
    { name: 'main (z 0)', z: 0, x0: -74, x1: 86, y0: -13, y1: 114, seeds: [[0, 66], [0, 82], [0, 20], [-40, 82], [30, 82], [-30, 78]] },
    { name: 'balcony 5.5', z: 5.5, x0: -22, x1: 22, y0: 60, y1: 112, seeds: [[0, 63.5], [17, 82]] },
    { name: 'balcony 11', z: 11, x0: -22, x1: 22, y0: 60, y1: 112, seeds: [[0, 63.5], [17, 82]] },
    { name: 'lower (z -35)', z: -35, x0: -26, x1: 26, y0: 98, y1: 226, seeds: [[0, 120], [0, 180], [0, 176]] },
  ];
  const out = [];
  for (const L of levels) {
    const nx = Math.round((L.x1 - L.x0) / STEP), ny = Math.round((L.y1 - L.y0) / STEP);
    const fl = new Float32Array(nx * ny).fill(NaN);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = L.x0 + (i + 0.5) * STEP, y = L.y0 + (j + 0.5) * STEP;
      const h = ph.raycast(W(x, y, L.z + 1.9), down, 4.5);
      if (h) fl[j * nx + i] = h.point.y - o.y;
    }
    const blocked = (x0, y0, x1, y1, z) => {
      const a = W(x0, y0, z), bb = W(x1, y1, z);
      const d = bb.clone().sub(a); const len = d.length(); d.normalize();
      return !!ph.raycast(a, d, len);
    };
    const reach = new Uint8Array(nx * ny);
    const q = [];
    for (const [sx, sy] of L.seeds) {
      const i = Math.floor((sx - L.x0) / STEP), j = Math.floor((sy - L.y0) / STEP);
      const k = j * nx + i;
      if (i >= 0 && j >= 0 && i < nx && j < ny && !isNaN(fl[k]) && Math.abs(fl[k] - L.z) < 1.5 && !reach[k]) { reach[k] = 1; q.push(k); }
    }
    const holes = [];
    while (q.length) {
      const k = q.pop();
      const i = k % nx, j = (k - i) / nx;
      const x = L.x0 + (i + 0.5) * STEP, y = L.y0 + (j + 0.5) * STEP, h = fl[k];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const kk = jj * nx + ii;
        if (reach[kk]) continue;
        const x2 = x + di * STEP, y2 = y + dj * STEP;
        if (blocked(x, y, x2, y2, h + 0.45) || blocked(x, y, x2, y2, h + 1.3)) continue;
        const h2 = fl[kk];
        if (isNaN(h2) || h2 < h - 1.2) {
          // narrower than the player (0.6 m capsule): floor within 0.3 m on either side of the gap
          const near = [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([ox, oy]) => { const r = ph.raycast(W(x2 + ox, y2 + oy, L.z + 1.9), down, 3.4); return r && Math.abs(r.point.y - o.y - h) < 0.45; });
          // outside the facility, where the hill stands higher than the ray's start
          const hi = ph.raycast(W(x2, y2, L.z + 30), down, 40); const ground = g.zone.height(o.x + x2, o.z - y2) - o.y > L.z + 1.0 || (hi && hi.point.y - o.y > L.z + 0.5);
          if (!near && !ground) holes.push([x2, y2, isNaN(h2) ? null : +(h2).toFixed(1)]);
          continue;
        }
        if (h2 - h > 0.4) continue; // a step up too high to walk (a wall top, a desk)
        reach[kk] = 1; q.push(kk);
      }
    }
    // cluster holes (cells within 1.5 m)
    const clusters = [];
    for (const hpt of holes) {
      let c = clusters.find((c) => hpt[0] >= c.x0 - 1.5 && hpt[0] <= c.x1 + 1.5 && hpt[1] >= c.y0 - 1.5 && hpt[1] <= c.y1 + 1.5);
      if (!c) { c = { x0: hpt[0], x1: hpt[0], y0: hpt[1], y1: hpt[1], n: 0, drop: hpt[2] }; clusters.push(c); }
      c.x0 = Math.min(c.x0, hpt[0]); c.x1 = Math.max(c.x1, hpt[0]); c.y0 = Math.min(c.y0, hpt[1]); c.y1 = Math.max(c.y1, hpt[1]); c.n++;
    }
    let reached = 0; for (const r of reach) reached += r;
    out.push({ level: L.name, reachedM2: reached * STEP * STEP, holes: clusters.map((c) => ({ x: [c.x0, c.x1], y: [c.y0, c.y1], cells: c.n, floorBelow: c.drop })) });
  }
  return { elevator: elev ? [elev.level, +elev.y.toFixed(1)] : null, out };
}, lvIdx);
all.push(res);
}
for (const r of all) { console.log(`######## elevator at level index ${r.elevator?.[0]} (z ${r.elevator?.[1]})`); for (const L of r.out) { console.log(`== ${L.level}: reachable ${L.reachedM2} m², ${L.holes.length} hole clusters`); for (const h of L.holes) console.log(`   x ${h.x[0]}..${h.x[1]}  y ${h.y[0]}..${h.y[1]}  cells ${h.cells}  floor below: ${h.floorBelow}`); } }
await b.close();
