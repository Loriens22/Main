// Pictures of the NASA base (model coordinates: x east, y north, z up): a fresh browser every few views, since on a
// software renderer each new area's first read-back compiles its shaders and costs gigabytes.
//   node e2e/nasa_views.mjs <url> <outDir> [view names…]      (against a served build)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [url = 'http://localhost:5200/', out = 'e2e/out/nasa_views', ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// name: [camera from, look at, setup]
const VIEWS = {
  tunnel_door: [[1.2, 40.0, 1.7], [0, 46, 3.0], 'closed'],
  door_raised: [[0.5, 39.5, 1.7], [0, 60, 2.6], 'open'],
  atrium_overview: [[-13, 67, 9.5], [9, 95, 3.5], 'open'],
  atrium_floor: [[2.5, 64.5, 1.7], [0, 95, 3.0], 'open'],
  balcony: [[-12.5, 68.5, 7.3], [12, 96, 5.5], 'open'],
  mc_aisle: [[-22.0, 82, 1.7], [-40, 82, 1.6], 'open'],
  mc_overview: [[-27, 70, 4.5], [-62, 92, 2.0], 'open'],
  labs_corridor: [[23.0, 82.6, 1.7], [60, 82, 1.4], 'open'],
  medical: [[59.2, 86.2, 2.4], [65, 97, 0.9], 'open'],
  cryo: [[71, 86.0, 2.4], [77, 94, 0.8], 'open'],
  suits: [[60, 78.2, 2.4], [62.5, 66.5, 1.2], 'open'],
  elevator_landing: [[1.0, 93.5, 1.7], [0, 104, 1.6], 'open'],
  kiosk: [[3.6, 69.3, 1.75], [3.2, 70.7, 1.3], 'open'],
  lower_corridor: [[0, 114, -33.3], [0, 170, -32.5], 'low'],
  silo_hall: [[0, 179.5, -32.8], [0, 200, -20], 'low'],
  // the crew access arm 64.8 m up the gantry (the lift brought up first)
  arm_walkway: [[10.2, 200.2, 31.6], [2.0, 200.0, 31.0], 'arm'],
  arm_landing: [[8.2, 196.9, 31.7], [13.0, 197.2, 30.6], 'arm'],
  arm_outside: [[-9.5, 186.0, 36.0], [6.5, 199.0, 30.5], 'arm'],
};
const names = Object.keys(VIEWS).filter((n) => !only.length || only.includes(n));
const PER = 3;
for (let i = 0; i < names.length; i += PER) {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.setDefaultTimeout(900000);
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { polling: 500 });
  await p.evaluate(async () => { const g = window.__game; g.running = false; await g.startCreative(false); g.cinematic = null; g.zone.content.spawnAt('nasa_atrium'); g.step(60, 1 / 30, false); });
  for (const n of names.slice(i, i + PER)) {
    const [from, at, setup] = VIEWS[n];
    await p.evaluate(([from, at, setup]) => {
      const g = window.__game, nasa = g.zone.content.nasa, o = nasa.origin, V = g.camera.position.constructor;
      if (setup === 'closed' && nasa.site.doors.get('nasa_inner')?.open) nasa.site.toggleDoor('nasa_inner');
      if (setup !== 'closed' && !nasa.site.doors.get('nasa_inner')?.open) nasa.site.toggleDoor('nasa_inner');
      if (setup === 'low') nasa.moveTo('nasa_elevator', 3);
      if (setup === 'arm' && nasa.mover('gantry_lift').level === 0) { nasa.callMover('gantry_lift'); for (let k = 0; k < 700; k++) g.step(1, 1 / 30, false); }
      // the player stands just behind the camera (lights, doors and NPCs react to where the player is)
      const feet = setup === 'arm' ? [9.0, 200.0, 29.85] : [from[0], from[1], setup === 'low' ? -35 : from[2] > 6 ? 5.5 : 0];
      g.player.enterFrame(g.player.frame, new V(o.x + feet[0], o.y + feet[2] + 0.05, o.z - feet[1]), 0, 'walk');
      g.cinematic = { blocking: true, update: (_dt, c) => { c.position.set(o.x + from[0], o.y + from[2], o.z - from[1]); c.lookAt(o.x + at[0], o.y + at[2], o.z - at[1]); c.updateMatrixWorld(true); return true; } };
    }, [from, at, setup]);
    await p.evaluate((low) => { const g = window.__game; for (let k = 0; k < (low ? 12 : 3); k++) g.step(30, 1 / 30, false); g.step(1, 1 / 30, true); }, setup === 'low' || setup === 'arm');
    fs.writeFileSync(`${out}/${n}.png`, Buffer.from((await p.evaluate(() => window.__game.renderer.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
    console.log('saved', n);
  }
  await b.close();
}
