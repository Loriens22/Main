// A phone playtest: emulated phone (touch screen, mobile user agent, landscape or portrait), real touch events through
// the browser's input layer (CDP Input.dispatchTouchEvent: taps, stick drags, look swipes, multi-touch), against a
// running build. Every control is exercised and its effect on the game checked; screenshots at each step.
//   node e2e/mobile_play.mjs <url> <outDir> [landscape|portrait] [part]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const [url, outDir, orient = 'landscape', part = 'all'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const W = orient === 'portrait' ? 412 : 915, H = orient === 'portrait' ? 915 : 412;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') { const l = m.location(); errors.push(m.text().slice(0, 200) + (l?.url ? ` @ ${l.url.split('/').pop()}:${l.lineNumber}:${l.columnNumber}` : '') + ` [${lastStep}]`); } });
let lastStep = 'load';
const cdp = await ctx.newCDPSession(page);
const results = [];
const log = (k, v) => { lastStep = k; results.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const wait = (ms) => page.waitForTimeout(ms);
/** advance the game n frames (the real-time loop is paused once the game starts: software rendering is slow here) */
const run = (n, render = true) => page.evaluate(([n, r]) => window.__game.step(n, 1 / 30, r), [n, render]);
const shot = async (name) => { await run(1); await page.screenshot({ path: path.join(outDir, `${name}.png`), timeout: 180000 }); };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p[0], y: p[1], id: p[2] ?? 0, radiusX: 6, radiusY: 6, force: 1 })) });
const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await run(1, false); await touch('touchEnd', []); await run(2, false); };
/** drag one finger from (x, y) by (dx, dy) and hold for ms, then lift */
const drag = async (x, y, dx, dy, ms, id = 0) => {
  await touch('touchStart', [[x, y, id]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[x + (dx * i) / 6, y + (dy * i) / 6, id]]); await run(1, false); }
  await run(Math.round(ms / 33), false);
  await touch('touchEnd', []);
  await run(2, false);
};
const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; }, sel);
/** a visible button in the touch overlay by its label */
const btn = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('.touch button')].find((e) => e.textContent.trim() === l && e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, label);
const tapBtn = async (label) => { const b = await btn(label); if (!b) { log('MISSING button', label); return false; } await tapAt(b.x, b.y); return true; };
const state = () => page.evaluate(() => {
  const g = window.__game; const p = g.player; const c = g.camera; const t = document.querySelector('.touch');
  const vis = [...document.querySelectorAll('.touch button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim());
  const e = new c.rotation.constructor().setFromQuaternion(c.quaternion, 'YXZ');
  const z = g.zone; const craft = z?.craft;
  return { phase: g.phase, zone: z?.id, mode: p.mode, ctx: g.input.context, touchOn: t?.classList.contains('on'), touchMode: g.touch?.mode, panel: g.ui.panelOpen, cine: g.cinematic?.constructor?.name ?? null,
    pos: p.pos.toArray().map((v) => +v.toFixed(2)), yaw: +e.y.toFixed(3), pitch: +e.x.toFixed(3), buttons: vis,
    craft: craft ? { v: +Math.hypot(...craft.vel).toFixed(1), thr: +(craft.throttle ?? 0).toFixed(2), q: craft.quat.toArray().map((v) => +v.toFixed(4)), av: craft.angVel.toArray().map((v) => +v.toFixed(3)) } : null,
    ap: g.control?.autopilot?.name ?? null };
});

await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.phase === 'menu', null, { timeout: 300000, polling: 500 });
await wait(2500);
await shot('01_menu');
const menu = await page.evaluate(() => [...document.querySelectorAll('.panel button, .menu button, button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim()).slice(0, 30));
log('menu buttons', menu);

// ---------------------------------------------------------------- start the game from the menu by tapping
const tapText = async (re) => {
  const b = await page.evaluate((src) => { const r = new RegExp(src, 'i'); const e = [...document.querySelectorAll('button')].find((x) => r.test(x.textContent.trim()) && x.getBoundingClientRect().width > 0); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, t: e.textContent.trim() }; }, re.source);
  if (!b) { log('MISSING text button', re.source); return false; }
  await touch('touchStart', [[b.x, b.y]]); await wait(80); await touch('touchEnd', []); await wait(400);
  log('tapped', b.t);
  return true;
};
await tapText(/^PLAY$/);
await wait(800);
await shot('01b_play_sub');
await tapText(/^CREATIVE MODE$/);
// the tap on CREATIVE MODE is a user gesture: on a touch device the game asks for full screen (+ landscape) there
log('full screen after CREATIVE MODE', await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 4000, polling: 100 }).then(() => true, () => false));
await page.evaluate(() => { window.__game.running = false; });
for (let i = 0; i < 400; i++) {
  const s = await page.evaluate(() => ({ phase: window.__game.phase, cine: !!window.__game.cinematic, skip: !!window.__game.cinematic?.skippable }));
  if (s.phase === 'playing' && !s.cine) { log('in game after steps', i); break; }
  if (s.skip && i % 20 === 19) await tapText(/SKIP/);
  await run(10, false);
  await wait(150);
}
await page.evaluate(() => { window.__game.running = false; });
await run(30, false);
// held upright: the hint to turn the phone shows as soon as play starts
if (orient === 'portrait') {
  await run(2, false);
  log('rotate hint shown', await page.evaluate(() => { const e = document.querySelector('.touch .rotate'); return !!e && getComputedStyle(e).display !== 'none'; }));
  await shot('10_portrait');
  const r = await rect('.touch .rotate');
  if (r) await tapAt(r.x, r.y);
  await run(3, false);
  log('rotate hint after a tap on it', await page.evaluate(() => getComputedStyle(document.querySelector('.touch .rotate')).display));
}
// a first touch on the world (players do this): the touch layout appears
await tapAt(W * 0.75, orient === 'portrait' ? H * 0.2 : H * 0.45);
await run(20, false);
await shot('02_walk');
let s0 = await state();
log('after start', s0);

if (part === 'all' || part === 'walk') {
  log('walk buttons (Earth)', s0.buttons);
  // the interaction prompt: walk up to something usable; a tap on the prompt uses it (like the USE button)
  const pr = await page.evaluate(() => {
    const g = window.__game; const THREE = g.camera.position.constructor;
    const p = g.player; const items = [...g.interaction.items.values()];
    const me = p.worldPos();
    const cands = [];
    for (const it of items) {
      if (it.enabled && !it.enabled()) continue;
      let lab = null; try { lab = it.label(); } catch { /* */ }
      if (!lab) continue;
      for (const t of it.targets) {
        const w = new THREE(); t.getWorldPosition(w);
        const d = w.distanceTo(me);
        if (d < 60) cands.push({ id: it.id, d, w: w.toArray() });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    return cands.slice(0, 8);
  });
  log('usable things nearby', pr.map((c) => `${c.id} ${c.d.toFixed(1)} m`));
  let promptOk = false;
  for (const c of pr) {
    const r = await page.evaluate((c) => {
      const g = window.__game; const V = g.camera.position.constructor;
      const p = g.player; const it = g.interaction.items.get(c.id);
      window.__used = null;
      if (!it.__wrapped) { it.__orig = it.use; it.use = () => { window.__used = c.id; }; it.__wrapped = true; }
      const tw = new V(...c.w); const tl = p.frame.worldToLocal(tw.clone());
      // stand 1.6 m from it on the side facing the player, eye level ~1.6 m
      const dir = new V(p.pos.x - tl.x, 0, p.pos.z - tl.z); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
      const at = tl.clone().addScaledVector(dir, 1.6); at.y = p.pos.y;
      const yaw = Math.atan2(-(tl.x - at.x), -(tl.z - at.z));
      p.enterFrame(p.frame, at, yaw, 'walk');
      p.pitch = Math.atan2(tl.y - (at.y + 1.6), 1.6);
      return { yaw, pitch: p.pitch };
    }, c);
    await run(4, false);
    const vis = await page.evaluate(() => { const e = document.querySelector('.prompt.show'); return e ? { t: e.textContent, act: e.dataset.act } : null; });
    if (!vis || vis.act !== 'interact') continue;
    log('prompt shown', vis.t);
    await shot('02b_prompt');
    const q = await rect('.prompt.show');
    await tapAt(q.x, q.y);
    await run(2, false);
    const used = await page.evaluate(() => window.__used);
    log('tap on the prompt used', used);
    promptOk = used === c.id;
    break;
  }
  await page.evaluate(() => { for (const it of window.__game.interaction.items.values()) if (it.__wrapped) { it.use = it.__orig; it.__wrapped = false; } });
  log('prompt tap works', promptOk);
  // back to where play started (the prompt test parked the player against a vehicle)
  await page.evaluate(([p, yaw]) => { const g = window.__game; g.player.enterFrame(g.player.frame, new (g.camera.position.constructor)(...p), yaw, 'walk'); g.player.pitch = 0; }, [s0.pos, s0.yaw]);
  await run(10, false);
  // ---------------------------------------------------------------- walking: the left stick moves the player
  const stick = await rect('.touch .stick.l');
  log('left stick', stick);
  if (stick) {
    const a = await state();
    await drag(stick.x, stick.y, 0, -stick.h * 0.45, 2500, 1);
    const b = await state();
    log('walk forward moved (m)', +Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]).toFixed(2));
  }
  // look: a swipe on the right half turns the view
  {
    const a = await state();
    await drag(W * 0.75, H * 0.45, -W * 0.15, 0, 300, 2);
    const b = await state();
    log('look swipe turned (rad)', +(b.yaw - a.yaw).toFixed(3));
    const c = await state();
    await drag(W * 0.75, H * 0.45, 0, -H * 0.15, 300, 3);
    const d = await state();
    log('look swipe pitched (rad)', +(d.pitch - c.pitch).toFixed(3));
  }
  // both at once: walk and turn together (multi-touch)
  if (stick) {
    const a = await state();
    await touch('touchStart', [[stick.x, stick.y, 4]]);
    await touch('touchMove', [[stick.x, stick.y - stick.h * 0.45, 4]]);
    await touch('touchStart', [[stick.x, stick.y - stick.h * 0.45, 4], [W * 0.75, H * 0.5, 5]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[stick.x, stick.y - stick.h * 0.45, 4], [W * 0.75 - i * 12, H * 0.5, 5]]); await run(2, false); }
    await run(36, false);
    await touch('touchEnd', []);
    await run(3, false);
    const b = await state();
    log('walk+turn moved / turned', [+Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]).toFixed(2), +(b.yaw - a.yaw).toFixed(3)]);
  }
  // buttons: jump, run, crouch, view, light
  {
    const a = await state();
    await tapBtn('JUMP');
    await run(8, false);
    const b = await state();
    log('jump rose (m)', +(b.pos[1] - a.pos[1]).toFixed(2));
  }
  await tapBtn('VIEW');
  await run(15, false);
  await shot('03_view');
  log('view after VIEW', (await state()).mode);
  await tapBtn('VIEW');
  await run(10, false);
  // the mission computer and the pause menu by touch
  await tapBtn('COMP');
  await run(30, false);
  await shot('04_computer');
  log('computer open', (await state()).panel);
  // panels scroll with a finger: the tab with the longest page, then a swipe up inside it
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.panel .tabs button, .panel .tabs .tab')].map((b) => b.textContent.trim()));
  log('computer tabs', tabs);
  let scrolled = null;
  for (const t of tabs) {
    await tapText(new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await wait(300);
    const sc = await page.evaluate(() => { const b = document.querySelector('.panel .pb'); return b ? { sh: b.scrollHeight, ch: b.clientHeight } : null; });
    if (!sc || sc.sh < sc.ch + 200) continue;
    const pb = await rect('.panel .pb');
    await touch('touchStart', [[pb.x, pb.y + pb.h * 0.3, 9]]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[pb.x, pb.y + pb.h * 0.3 - i * pb.h * 0.05, 9]]); await wait(16); }
    await touch('touchEnd', []);
    await wait(600);
    scrolled = { tab: t, scrollTop: await page.evaluate(() => document.querySelector('.panel .pb').scrollTop), ...sc };
    await shot('04b_computer_scrolled');
    break;
  }
  log('panel swipe scroll', scrolled);
  const closeBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^(×|✕|CLOSE|Close)$/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; });
  log('close button', closeBtn);
  if (closeBtn) await tapAt(closeBtn.x, closeBtn.y);
  await run(15, false);
  log('computer closed', !(await state()).panel);
  await tapBtn('MENU');
  await run(25, false);
  await shot('05_menu_paused');
  const pm = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim()));
  log('pause menu buttons', pm);
  const resume = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /resume|continue/i.test(e.textContent) && e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  // Settings → Controls on a touch screen: the touch guide instead of the key bindings
  if (await tapText(/^SETTINGS$/)) {
    await wait(300);
    await tapText(/^CONTROLS$/);
    await wait(300);
    await shot('05b_settings_controls');
    log('controls tab', await page.evaluate(() => [...document.querySelectorAll('.panel .pb')].at(-1)?.innerText.slice(0, 600)));
    const x = await page.evaluate(() => { const b = [...document.querySelectorAll('.panel .ph .x')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').at(-1); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (x) await tapAt(x.x, x.y);
    await run(10, false);
  }
  const resume2 = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /resume|continue/i.test(e.textContent) && e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (resume) await tapAt((resume2 ?? resume).x, (resume2 ?? resume).y);
  await run(20, false);
  log('resumed', !(await state()).panel);
  // ⛶ leaves and re-enters full screen (on touchend: a user gesture)
  const fsBtn = await btn('⛶');
  if (fsBtn) {
    const before = await page.evaluate(() => !!document.fullscreenElement);
    await tapAt(fsBtn.x, fsBtn.y); await wait(500);
    const mid = await page.evaluate(() => !!document.fullscreenElement);
    await tapAt(fsBtn.x, fsBtn.y); await wait(500);
    log('⛶ full screen before / after tap / after second tap', [before, mid, await page.evaluate(() => !!document.fullscreenElement)]);
  }
}

if (part === 'all' || part === 'flight') {
  // ---------------------------------------------------------------- flying (Jupiter's clouds): sticks, throttle, autopilot, photo
  await page.evaluate(async () => {
    const game = window.__game;
    const L = await import('./assets/' + [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)).split('/assets/')[1]).catch(() => null);
    void L;
  });
  const ok = await page.evaluate(async () => {
    const game = window.__game;
    const v = game.state.vehicles.ranger1;
    v.data.surface = { body: 'jupiter', lat: 21.5, lon: 300, name: 'North Equatorial Belt' };
    v.landed = false;
    await game.goTo('surface', { at: 'cruise' }, { fade: 0 });
    return game.zone?.gas ?? null;
  });
  log('jupiter', ok);
  await run(200, false);
  await tapAt(W * 0.5, H * 0.4);
  await run(20, false);
  await shot('06_flight');
  const f0 = await state();
  log('flight state', f0);
  // AUTO opens the flight computer (a panel of choices); DISENGAGE AUTOPILOT hands over the stick
  await tapBtn('AUTO');
  await run(15, false);
  await shot('06b_flight_computer');
  log('flight computer', await page.evaluate(() => document.querySelector('.panel .pb')?.innerText.slice(0, 700)));
  await tapText(/^DISENGAGE AUTOPILOT$/);
  await run(10, false);
  log('after DISENGAGE: autopilot / panel', [(await state()).ap, (await state()).panel]);
  const stick = await rect('.touch .stick.l');
  if (stick) {
    const a = await state();
    // hold the stick to the right; read the roll rate while it is held, then the attitude change
    await touch('touchStart', [[stick.x, stick.y, 6]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[stick.x + (stick.w * 0.45 * i) / 6, stick.y, 6]]); await run(1, false); }
    await run(20, false);
    const mid = await state();
    await run(25, false);
    await touch('touchEnd', []);
    await run(2, false);
    const b = await state();
    const dot = Math.abs(a.craft.q.reduce((s, v, i) => s + v * b.craft.q[i], 0));
    log('roll stick: body rates while held / attitude change (deg)', [mid.craft.av, +(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI).toFixed(1)]);
  }
  const th = await rect('.touch .throttle');
  log('throttle slider', th);
  if (th) {
    await drag(th.x, th.y + th.h * 0.4, 0, -th.h * 0.7, 800, 7);
    log('throttle after slide', (await state()).craft?.thr);
  }
  log('flight buttons', (await state()).buttons);
  // SAMPLE from the tools column: the intake sampler
  {
    const before = await page.evaluate(() => Object.keys(window.__game.state.flags).filter((k) => k.startsWith('sample:')).length);
    await tapBtn('SAMPLE');
    await run(10, false);
    const after = await page.evaluate(() => Object.keys(window.__game.state.flags).filter((k) => k.startsWith('sample:')));
    log('SAMPLE in flight: sample flags before / after', [before, after]);
  }
  await tapBtn('PHOTO');
  await run(30, false);
  await shot('07_photo');
  const ps = await state();
  log('photo mode', { cine: ps.cine, touchMode: ps.touchMode, buttons: ps.buttons });
  const fov = () => page.evaluate(() => +window.__game.zone.research?.photo?.fov?.toFixed?.(2) || +window.__game.camera.fov.toFixed(2));
  {
    const f0 = await fov();
    // two fingers spread apart on the look area: zoom in
    const cx = W * 0.72, cy = H * 0.45;
    await touch('touchStart', [[cx - 30, cy, 11]]);
    await touch('touchStart', [[cx - 30, cy, 11], [cx + 30, cy, 12]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 30 - i * 14, cy, 11], [cx + 30 + i * 14, cy, 12]]); await run(1, false); }
    await touch('touchEnd', []);
    await run(4, false);
    const f1 = await fov();
    const zp = await btn('ZOOM−');
    if (zp) { await touch('touchStart', [[zp.x, zp.y, 13]]); await run(20, false); await touch('touchEnd', []); await run(2, false); }
    log('photo fov: start / after pinch out / after holding ZOOM−', [f0, f1, await fov()]);
  }
  await tapBtn('SHOT');
  await run(10, false);
  log('photo gallery', await page.evaluate(() => window.__game.zone.research?.gallery?.length ?? null));
  await tapBtn('EXIT');
  await run(20, false);
  log('photo exited', (await state()).cine);
}

if (part === 'all' || part === 'mars') {
  // ---------------------------------------------------------------- on foot on Mars: the drone by touch
  await page.evaluate(async () => {
    const game = window.__game;
    const v = game.state.vehicles.ranger1;
    v.data.surface = { body: 'mars', lat: -1.95, lon: 354.47, name: 'Meridiani Planum' };
    v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 });
    game.zone.beginEva(true);
  });
  await run(200, false);
  await tapAt(W * 0.75, H * 0.45);
  await run(15, false);
  await shot('08_mars_walk');
  const ms = await state();
  log('mars state', ms);
  log('walk buttons (Mars, outside)', ms.buttons);
  {
    const l0 = await page.evaluate(() => window.__game.zone.headlampOn);
    await tapBtn('LIGHT');
    await run(3, false);
    log('LIGHT toggles the helmet lamp', [l0, await page.evaluate(() => window.__game.zone.headlampOn)]);
  }
  await tapBtn('DRONE');
  await run(40, false);
  await shot('09_drone');
  const d0 = await page.evaluate(() => window.__game.zone.research?.drone?.pos.toArray());
  log('drone', { d0, st: await state() });
  const stick = await rect('.touch .stick.l');
  if (stick && d0) {
    await drag(stick.x, stick.y, 0, -stick.h * 0.45, 2000, 8);
    const d1 = await page.evaluate(() => window.__game.zone.research?.drone?.pos.toArray());
    log('drone moved (m)', d1 ? +Math.hypot(d1[0] - d0[0], d1[2] - d0[2]).toFixed(2) : null);
  }
  await tapBtn('UP');
  await tapBtn('RECALL');
  await run(20, false);
  log('drone recalled', (await state()).cine);
}
if (part === 'portrait') {
  // ---------------------------------------------------------------- held upright: the hint to turn the phone, and the controls still work
  await shot('11_portrait_controls');
  const stick = await rect('.touch .stick.l');
  if (stick) {
    const a = await state();
    await drag(stick.x, stick.y, 0, -stick.h * 0.45, 2000, 1);
    const b = await state();
    log('portrait: walk moved (m)', +Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]).toFixed(2));
  }
  {
    const a = await state();
    await drag(W * 0.6, H * 0.3, -W * 0.25, 0, 300, 2);
    const b = await state();
    log('portrait: look turned (rad)', +(b.yaw - a.yaw).toFixed(3));
  }
  log('portrait buttons', (await state()).buttons);
}
log('errors', errors.slice(0, 12));
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
await browser.close();
