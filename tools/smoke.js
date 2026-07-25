#!/usr/bin/env node
/* Headless smoke test: boots the built HTML in Chromium, captures every
 * console error / page exception, drives past the title screen, and reports
 * renderer stats + screenshots. Run:  node tools/smoke.js  */
'use strict';

var path = require('path');
var fs = require('fs');
var ROOT = path.resolve(__dirname, '..');
var FILE = 'file://' + path.join(ROOT, 'SteveThePCRepairMan.html');
var SHOTS = path.join(ROOT, 'shots');

var chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  try { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
  catch (e2) { console.error('playwright not found'); process.exit(2); }
}

var MOBILE = process.argv.indexOf('--mobile') >= 0;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  var ctxOpts = MOBILE
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 760 } };

  var ctx = await browser.newContext(ctxOpts);
  var page = await ctx.newPage();

  var errors = [], warns = [], logs = [];
  page.on('console', function (m) {
    var t = m.type(), x = m.text();
    if (t === 'error') errors.push(x);
    else if (t === 'warning') warns.push(x);
    else logs.push(x);
  });
  page.on('pageerror', function (e) { errors.push('PAGEERROR: ' + (e && e.message ? e.message : e)); });
  page.on('requestfailed', function (r) {
    // any network request at all is a contract violation (must be self-contained)
    errors.push('NETWORK REQUEST: ' + r.url().slice(0, 120));
  });
  page.on('request', function (r) {
    var u = r.url();
    if (u.indexOf('file://') !== 0 && u.indexOf('data:') !== 0 && u.indexOf('blob:') !== 0) {
      errors.push('EXTERNAL REQUEST: ' + u.slice(0, 120));
    }
  });

  console.log('→ loading ' + (MOBILE ? '[mobile 390x844]' : '[desktop 1280x760]'));
  await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });
  await sleep(2500);

  var boot = await page.evaluate(function () {
    return {
      three: !!window.THREE,
      stv: !!window.STV,
      mods: window.STV ? {
        Audio: !!window.STV.Audio, Voice: !!window.STV.Voice,
        Tex: !!window.STV.Tex, Mat: !!window.STV.Mat, Geo: !!window.STV.Geo,
        Physics: !!window.STV.Physics, UI: !!window.STV.UI,
        Levels: !!window.STV.Levels, Cine: !!window.STV.Cine,
        Player: !!window.STV.Player, Game: !!window.STV.Game
      } : null,
      state: window.STV && window.STV.Game ? window.STV.Game.state : null,
      canvas: !!document.querySelector('#app canvas'),
      splashGone: !document.getElementById('splash')
    };
  });
  console.log('  modules:', JSON.stringify(boot.mods));
  console.log('  state:', boot.state, '| canvas:', boot.canvas, '| splash removed:', boot.splashGone);

  await page.screenshot({ path: path.join(SHOTS, (MOBILE ? 'm' : 'd') + '-01-title.png') });

  /* try to get past the title: click the most obvious button, else tap centre */
  await page.evaluate(function () {
    var btns = document.querySelectorAll('button, [role="button"], .stv-btn, .stv-start');
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].textContent || '').toLowerCase();
      if (/start|begin|play|new/.test(t)) { btns[i].click(); return 'clicked:' + t.trim(); }
    }
    if (btns.length) { btns[0].click(); return 'clicked:first'; }
    return 'none';
  });
  await sleep(1200);
  await page.mouse.click(640, 400);
  await sleep(4000);

  var mid = await page.evaluate(function () {
    var g = window.STV && window.STV.Game;
    return {
      state: g ? g.state : null,
      info: g && g.debugInfo ? g.debugInfo() : null,
      chapter: g ? g.chapter : null,
      level: g ? g.levelId : null,
      cine: window.STV && window.STV.Cine ? !!window.STV.Cine.playing : null
    };
  });
  console.log('  after start:', JSON.stringify(mid));
  await page.screenshot({ path: path.join(SHOTS, (MOBILE ? 'm' : 'd') + '-02-after-start.png') });

  /* skip any cutscene and try to reach gameplay */
  for (var k = 0; k < 8; k++) {
    await page.keyboard.press('Escape').catch(function () {});
    await page.evaluate(function () {
      if (window.STV && window.STV.Cine && window.STV.Cine.playing && window.STV.Cine.skip) window.STV.Cine.skip();
    });
    await sleep(900);
    var st = await page.evaluate(function () {
      return window.STV && window.STV.Game ? window.STV.Game.state : null;
    });
    if (st === 'play') break;
  }
  await sleep(1500);

  /* drive the player a little to exercise physics + input */
  await page.evaluate(function () {
    var i = window.STV && window.STV.UI && window.STV.UI.input;
    if (i) { i.move.x = 0.2; i.move.y = 1; }
  });
  await sleep(2200);
  await page.evaluate(function () {
    var i = window.STV && window.STV.UI && window.STV.UI.input;
    if (i) { i.move.x = 0; i.move.y = 0; }
  });
  await sleep(600);

  var play = await page.evaluate(function () {
    var g = window.STV && window.STV.Game;
    var p = g && g.player;
    return {
      state: g ? g.state : null,
      level: g ? g.levelId : null,
      info: g && g.debugInfo ? g.debugInfo() : null,
      pos: p ? [ +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2) ] : null,
      grounded: p ? p.body.grounded : null,
      interactables: g && g.level && g.level.interactables ? g.level.interactables.length : 0,
      actors: g && g.level && g.level.actors ? g.level.actors.length : 0
    };
  });
  console.log('  gameplay:', JSON.stringify(play));
  await page.screenshot({ path: path.join(SHOTS, (MOBILE ? 'm' : 'd') + '-03-gameplay.png') });

  /* exercise every level builder directly — the fastest way to find crashes */
  var levelReport = await page.evaluate(function () {
    var out = [];
    if (!window.STV || !window.STV.Levels || !window.STV.Levels.build) return out;
    var ids = window.STV.Levels.list || [];
    var THREEs = window.THREE;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        var scene = new THREEs.Scene();
        var cam = new THREEs.PerspectiveCamera(60, 1.6, 0.1, 200);
        var phys = window.STV.Physics.create();
        var lv = window.STV.Levels.build(id, {
          scene: scene, camera: cam, renderer: window.STV.Game.ctx.renderer,
          physics: phys, rng: window.STV.rng(1), player: window.STV.Game.player,
          game: window.STV.Game
        });
        var meshes = 0, lights = 0;
        if (lv && lv.root) lv.root.traverse(function (o) { if (o.isMesh) meshes++; if (o.isLight) lights++; });
        out.push({ id: id, ok: !!lv, meshes: meshes, lights: lights,
                   colliders: lv && lv.colliders ? lv.colliders.length : 0,
                   inter: lv && lv.interactables ? lv.interactables.length : 0,
                   actors: lv && lv.actors ? lv.actors.length : 0,
                   spawn: !!(lv && lv.spawn) });
        if (lv && lv.dispose) lv.dispose();
      } catch (e) {
        out.push({ id: id, ok: false, err: String(e && e.message ? e.message : e).slice(0, 160) });
      }
    }
    return out;
  });
  console.log('\n  LEVELS:');
  for (var li = 0; li < levelReport.length; li++) console.log('   ', JSON.stringify(levelReport[li]));

  /* exercise every Geo factory */
  var geoReport = await page.evaluate(function () {
    if (!window.STV || !window.STV.Geo) return { missing: 'STV.Geo absent' };
    var ok = [], bad = [];
    for (var k in window.STV.Geo) {
      if (typeof window.STV.Geo[k] !== 'function') continue;
      try {
        var g = window.STV.Geo[k]();
        if (g && g.isObject3D) ok.push(k); else bad.push(k + ':notObject3D');
      } catch (e) { bad.push(k + ':' + String(e && e.message).slice(0, 60)); }
    }
    return { okCount: ok.length, bad: bad };
  });
  console.log('\n  GEO factories ok:', geoReport.okCount || 0,
              '| failing:', JSON.stringify(geoReport.bad || geoReport.missing || []).slice(0, 900));

  /* cutscene registry */
  var cine = await page.evaluate(function () {
    if (!window.STV || !window.STV.Cine) return null;
    var ids = [];
    try { ids = window.STV.Cine.ids ? window.STV.Cine.ids() : Object.keys(window.STV.Cine._defs || window.STV.Cine.defs || {}); } catch (e) {}
    return { ids: ids };
  });
  console.log('  CINE:', JSON.stringify(cine));

  console.log('\n─── ERRORS (' + errors.length + ') ───');
  var seen = {};
  for (var e2 = 0; e2 < errors.length; e2++) {
    var msg = errors[e2].slice(0, 240);
    if (seen[msg]) continue; seen[msg] = 1;
    console.log('  ✖ ' + msg);
  }
  console.log('─── WARNINGS (' + warns.length + ') ───');
  var seenw = {}, wc = 0;
  for (var w = 0; w < warns.length && wc < 20; w++) {
    var wm = warns[w].slice(0, 200);
    if (seenw[wm]) continue; seenw[wm] = 1; wc++;
    console.log('  ⚠ ' + wm);
  }

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(function (e) {
  console.error('HARNESS FAILURE:', e);
  process.exit(3);
});
