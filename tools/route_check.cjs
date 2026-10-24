// Drives the player's bus along a whole direction with the AI driver (headless) and checks
// that every stop is served: doors open at each stop, nothing stalls, the trip ends at the terminal.
//   [VEH=conecto|procity|yutong] [LINE=64] [SEED=n] node tools/route_check.cjs <game.html> [A|B] [maxMinutes]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [html, dir = 'A', maxMin = '45'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(html) + `?noloop&q=balanced&autostart=driver&dir=${dir}&stop=0&h=12${process.env.VEH ? '&veh=' + process.env.VEH : ''}${process.env.LINE ? '&line=' + process.env.LINE : ''}${process.env.SEED ? '&seed=' + process.env.SEED : ''}`);
  await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  await p.evaluate(() => {
    const G = __game, g = G.game, bus = g.bus;
    const ai = new G.mods.AIBusDriver(bus, { traffic: g.traffic, signals: g.traffic && g.traffic.signals, peds: g.peds, serveAll: true });
    const orig = g.input.poll.bind(g.input);
    g.input.poll = (dt) => {
      const r = orig(dt);
      const c = ai.update(dt);
      return Object.assign(r, { throttle: c.throttle, brake: c.brake, steer: c.steer });
    };
    window.__ai = ai;
    window.__log = [];
    bus.doors.on((e) => { if (e.type === 'opened') window.__log.push({ t: +g.time.toFixed(0), stop: bus.stops.atStop }); });
  });
  const last = await p.evaluate(() => __game.game.bus.stops.dir.stops.length - 1);
  let stuck = 0, prevS = -1;
  for (let m = 0; m < Number(maxMin); m++) {
    const r = await p.evaluate(() => {
      const g = __game.game, bus = g.bus;
      __game.sim(60);
      return { s: Math.round(bus.routeS), next: bus.stops.next, served: [...bus.stops.served].sort((a, c) => a - c), why: __ai.why, state: __ai.state, v: +(bus.phys.v * 3.6).toFixed(1), off: +bus.offRoute.toFixed(1), score: g.scoring ? Math.round(g.scoring.total || 0) : null };
    });
    console.log(`${m + 1} min: s=${r.s} next=${r.next} served=${r.served.length}/${last + 1} v=${r.v} ${r.state} ${r.why || ''} off=${r.off}`);
    if (r.served.includes(last)) { console.log(`TRIP DONE in ${m + 1} min, served ${r.served.length}/${last + 1}: ${r.served.join(',')}`); break; }
    stuck = r.s === prevS ? stuck + 1 : 0;
    prevS = r.s;
    if (stuck >= 4) { console.log('STALLED'); break; }
  }
  const log = await p.evaluate(() => window.__log);
  console.log('door openings:', log.map((x) => `${x.stop}@${x.t}`).join(' '));
  if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | '));
  await b.close();
})();
