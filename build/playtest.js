#!/usr/bin/env node
/* Drives the whole game headlessly: boots, starts a new game, skips each
 * cutscene, loads every level, measures real draw calls / triangles with the
 * post-FX chain bypassed, walks the player around, and fires every
 * interactable to shake out exceptions. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join('/opt/node22/lib/node_modules/playwright'));

const ROOT = path.resolve(__dirname, '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'steve.html');
const SHOTS = path.join(ROOT, 'dist', 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--mute-audio']
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/GL Driver|SwiftShader|willReadFrequently/.test(t)) {
      errors.push(t);
    }
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));

  await page.goto(FILE, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.SG && window.SG.engine && window.SG.engine.running,
    null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const out = { levels: [], errors, notes: [] };

  // Measure a level with post-FX bypassed so renderer.info reflects the scene.
  const measure = async () => page.evaluate(() => new Promise(res => {
    const E = window.SG.engine;
    const wasEnabled = window.SG.fx && window.SG.fx.enabled;
    if (window.SG.fx) window.SG.fx.enabled = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const info = E.renderer.info;
      const r = {
        calls: info.render.calls, tris: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures,
        lights: (() => { let n = 0; E.scene.traverse(o => { if (o.isLight) n++; }); return n; })(),
        objects: (() => { let n = 0; E.scene.traverse(() => n++); return n; })(),
        colliders: window.SG.phys.world.count ? window.SG.phys.world.count() : -1,
        interactables: E.ctx ? E.ctx.interactables.length : -1,
        triggers: E.ctx ? E.ctx.triggers.length : -1,
        objectives: E.ctx ? E.ctx.objectiveList.length : -1
      };
      if (window.SG.fx) window.SG.fx.enabled = wasEnabled;
      res(r);
    }));
  }));

  const loadLevel = async (id) => {
    await page.evaluate((lid) => {
      if (window.SG.cinema && window.SG.cinema.isPlaying()) window.SG.cinema.skip();
      window.SG.engine.loadLevel(lid);
    }, id);
    await page.waitForTimeout(2200);
  };

  // ---- 1. title ----
  out.levels.push(Object.assign({ id: 'title' }, await measure()));
  await page.screenshot({ path: path.join(SHOTS, '00-title.png') });

  // ---- 2. new game -> cutscene -> skip -> shop ----
  // Do NOT return the promise: goto() only settles when the cutscene ends.
  await page.evaluate(() => { window.SG.engine.startNewGame(); });
  await page.waitForTimeout(3000);
  const inCutscene = await page.evaluate(() =>
    !!(window.SG.cinema && window.SG.cinema.isPlaying()));
  out.notes.push('cutscene c1_open playing after startNewGame: ' + inCutscene);
  await page.screenshot({ path: path.join(SHOTS, '01-cutscene.png') });

  await page.evaluate(() => window.SG.cinema.skip());
  await page.waitForTimeout(4000);
  out.notes.push('chapter after skip: ' + await page.evaluate(() => window.SG.state.chapter));
  out.notes.push('level after skip: ' +
    await page.evaluate(() => window.SG.engine.level && window.SG.engine.level.id));

  // ---- 3. every playable level ----
  for (const id of ['shop', 'hotel', 'vault', 'escape', 'shop_set', 'flight_set']) {
    await loadLevel(id);
    const m = await measure();
    m.id = id;
    out.levels.push(m);
    await page.screenshot({ path: path.join(SHOTS, `lvl-${id}.png`) });
  }

  // ---- 4. walk around the shop and fire every interactable ----
  await loadLevel('shop');
  const walk = await page.evaluate(async () => {
    const E = window.SG.engine, THREE = window.THREE;
    const p = E.player;
    const start = p.getPosition(new THREE.Vector3()).clone();
    // Force movement through the real controller for 90 frames.
    const inp = window.SG.input;
    inp.axes.move.x = 0; inp.axes.move.y = 1;
    const savedUpdate = inp.update;
    inp.update = function () { inp.axes.move.x = 0; inp.axes.move.y = 1; };
    await new Promise(r => setTimeout(r, 1500));
    inp.update = savedUpdate;
    inp.axes.move.x = 0; inp.axes.move.y = 0;
    const end = p.getPosition(new THREE.Vector3()).clone();
    return {
      moved: +start.distanceTo(end).toFixed(2),
      start: start.toArray().map(n => +n.toFixed(2)),
      end: end.toArray().map(n => +n.toFixed(2)),
      grounded: end.y > -0.5 && end.y < 2
    };
  });
  out.notes.push('player walked ' + walk.moved + 'm ' +
    JSON.stringify(walk.start) + '->' + JSON.stringify(walk.end) +
    ' grounded=' + walk.grounded);

  const fired = await page.evaluate(() => {
    const ctx = window.SG.engine.ctx;
    let ok = 0, threw = [];
    ctx.interactables.forEach((it, i) => {
      try {
        if (it.onUse) { it.onUse(ctx, it); ok++; }
      } catch (e) { threw.push(i + ':' + (e && e.message)); }
    });
    return { total: ctx.interactables.length, ok, threw };
  });
  out.notes.push('shop interactables fired: ' + fired.ok + '/' + fired.total +
    (fired.threw.length ? ' THREW: ' + JSON.stringify(fired.threw) : ' (no throws)'));
  await page.waitForTimeout(1200);

  // ---- 5. cutscene definitions all resolve their lines ----
  const script = await page.evaluate(() => {
    const C = window.SG.cinema, L = window.SG.script.lines;
    const missing = [];
    let beats = 0, shots = 0;
    C.ids().forEach(id => {
      const d = C.get(id);
      (d.shots || []).forEach(() => shots++);
      (d.beats || []).forEach(b => {
        beats++;
        if (b.say && !L[b.say]) missing.push(id + ' -> ' + b.say);
      });
    });
    return { cutscenes: C.ids(), shots, beats, missingLines: missing, lines: Object.keys(L).length };
  });
  out.script = script;

  // ---- 6. voice fallback resolves on time ----
  const voice = await page.evaluate(async () => {
    const t0 = performance.now();
    const saved = window.speechSynthesis;
    try { delete window.speechSynthesis; } catch (e) { }
    const r = await window.SG.voice.say({ speaker: 'oleg', text: 'Thursday, Steve.' });
    const dt = (performance.now() - t0) / 1000;
    try { window.speechSynthesis = saved; } catch (e) { }
    return { resolved: r !== undefined, seconds: +dt.toFixed(2) };
  });
  out.notes.push('voice fallback resolved=' + voice.resolved + ' in ' + voice.seconds + 's');

  // ---- 7. mobile viewport ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-portrait.png') });
  const touch = await page.evaluate(() => ({
    mobileRoot: !!(window.SG.input && window.SG.input.mobileRoot),
    controls: window.SG.input && window.SG.input.mobileRoot
      ? window.SG.input.mobileRoot.children.length : 0
  }));
  out.notes.push('touch controls: root=' + touch.mobileRoot + ' children=' + touch.controls);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-landscape.png') });

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('HARNESS FAILURE', e); process.exit(2); });
