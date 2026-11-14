// Blocker audit: in each zone, every Site's rooms and doors are checked against the terrain (ground rising inside a
// room or above a door's sill), surface boulders (inside rooms, at doors, under the landed Ranger) and forest density
// (trees can only grow where it is > 0). Points inside terrain cuts are skipped (not drawn, not collided).
//   node e2e/blocker_audit.mjs <url> <earth|mars|mann|edmunds|miller|moon>   (against a served build)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', where = 'earth'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.setDefaultTimeout(900000);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
const res = await p.evaluate(async (where) => {
  const g = window.__game; g.running = false;
  await g.startCreative(false); g.cinematic = null;
  const step = (n) => g.step(n, 1 / 30, false);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (where !== 'earth') {
    const lazarus = ['mann', 'edmunds', 'miller'].includes(where);
    if (lazarus) g.state.system = 'gargantua';
    // landing sites: the same table the game uses (read from the flight computer's data through the zone loader)
    const sites = { mars: { lat: 18.38, lon: 77.58, name: 'Jezero crater' }, moon: { lat: 0.67, lon: 23.47, name: 'Mare Tranquillitatis' },
      mann: { lat: 34, lon: 120, name: 'Mann camp glacier' }, edmunds: { lat: 12, lon: 40, name: 'Edmunds beacon' }, miller: { lat: 2, lon: 18, name: 'Miller beacon' } };
    const v = g.state.vehicles.ranger1;
    v.data.surface = { body: where, ...sites[where] };
    v.landed = true;
    await g.goTo('surface', { at: 'landed' }, { fade: 0 });
    g.zone.beginEva?.(true);
    // camps / rocks need the player near them: walk the player to the camp if there is one
    step(20);
    const L = g.zone.lazarus;
    if (L?.camp) { const s = L.spot?.('spot_main') ?? L.spot?.('spot_center'); if (s) g.player.enterFrame(g.zone.ground, new (g.camera.position.constructor)(s.x, g.zone.terrainY(s.x, s.z) + 0.1, s.z), 0, 'walk'); }
    for (let i = 0; i < 40; i++) { step(5); await wait(100); }
  } else step(30);
  const z = g.zone;
  const H = (x, zz) => (z.terrainY ? z.terrainY(x, zz) : z.height(x, zz));
  const ph = z.ground.physics; if (!ph.inTerrainCut) ph.inTerrainCut = () => false; // builds before terrain cuts
  const sites = [];
  if (z.content) { for (const s of z.content.sites ?? []) sites.push(s); if (z.content.nasa) sites.push(z.content.nasa.site, z.content.nasa.gate); }
  if (z.ranger?.site) sites.push(z.ranger.site);
  if (z.lazarus?.camp) sites.push(z.lazarus.camp);
  const forest = z.gen?.forestDensity ? (x, zz) => z.gen.forestDensity(x, zz) : null;
  const rocks = z.rocks?.placed ?? [];
  const out = { zone: z.id, body: z.site?.body, sites: sites.length, rocksPlaced: rocks.length, problems: [], checked: { rooms: 0, doors: 0 } };
  for (const s of sites) {
    const sn = s.opts.name;
    for (const r of s.rooms) {
      out.checked.rooms++;
      const bx = r.box; let worst = 0, at = null, n = 0, fmax = 0;
      for (let x = bx.min.x + 0.5; x < bx.max.x; x += 1) for (let zz = bx.min.z + 0.5; zz < bx.max.z; zz += 1) {
        const h = H(x, zz);
        if (forest && h > bx.min.y - 1 && h < bx.max.y) fmax = Math.max(fmax, forest(x, zz));
        if (h > bx.min.y + 0.3 && h < bx.max.y - 0.1 && !ph.inTerrainCut({ x, y: h, z: zz })) { n++; if (h - bx.min.y > worst) { worst = h - bx.min.y; at = [x, zz].map((v) => +v.toFixed(1)); } }
      }
      if (n) out.problems.push({ kind: 'terrain inside room', site: sn, room: r.name, points: n, worst: +worst.toFixed(2), at });
      if (fmax > 0.05) out.problems.push({ kind: 'forest density inside room', site: sn, room: r.name, density: +fmax.toFixed(2) });
      for (const k of rocks) if (k.x > bx.min.x - k.s && k.x < bx.max.x + k.s && k.z > bx.min.z - k.s && k.z < bx.max.z + k.s && k.y + k.s * 0.6 > bx.min.y + 0.2 && k.y < bx.max.y) out.problems.push({ kind: 'boulder in room', site: sn, room: r.name, rock: [k.x, k.y, k.z, k.s].map((v) => +v.toFixed(1)) });
    }
    for (const [id, d] of s.doors) {
      out.checked.doors++;
      const pv = s.localPos(d.node);
      let worst = 0, at = null, fmax = 0;
      for (let dx = -2.5; dx <= 2.5; dx += 0.5) for (let dz = -2.5; dz <= 2.5; dz += 0.5) {
        const x = pv.x + dx, zz = pv.z + dz;
        const h = H(x, zz);
        if (forest && Math.abs(h - pv.y) < 2.5) fmax = Math.max(fmax, forest(x, zz));
        if (h > pv.y + 0.35 && h < pv.y + 2.5 && !ph.inTerrainCut({ x, y: h, z: zz }) && h - pv.y > worst) { worst = h - pv.y; at = [dx, dz]; }
      }
      if (worst) out.problems.push({ kind: 'ground above door sill', site: sn, door: id, rise: +worst.toFixed(2), offset: at });
      if (fmax > 0.05) out.problems.push({ kind: 'forest density at door', site: sn, door: id, density: +fmax.toFixed(2) });
      for (const k of rocks) if (Math.hypot(k.x - pv.x, k.z - pv.z) < k.s * 0.72 + 2.2 && k.y + k.s * 0.6 > pv.y + 0.3 && k.y - k.s < pv.y + 2.2) out.problems.push({ kind: 'boulder at door', site: sn, door: id, rock: [k.x, k.y, k.z, k.s].map((v) => +v.toFixed(1)), dist: +Math.hypot(k.x - pv.x, k.z - pv.z).toFixed(1) });
    }
  }
  // the landed Ranger: boulders under the hull or at the ladder
  const c = z.craft;
  if (c && rocks.length) {
    const near = rocks.filter((k) => Math.hypot(k.x - c.pos[0], k.z - c.pos[2]) < c.spec.length / 2 + 5 + k.s);
    out.rangerClear = near.length === 0;
    if (near.length) out.problems.push({ kind: 'boulders under / beside the landed Ranger', n: near.length, biggest: Math.max(...near.map((k) => k.s)).toFixed(1) });
  }
  return out;
}, where);
console.log(JSON.stringify(res, null, 1));
console.log('errors', JSON.stringify(errs));
await b.close();
