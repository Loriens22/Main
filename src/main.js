// Entry point: loading screen → game loop.
import * as THREE from 'three';
import { Game } from './game.js';
import { B } from './bus/model.js';

const $ = (id) => document.getElementById(id);
const errEl = $('err');
const showErr = (msg) => { errEl.textContent += msg + '\n'; };
window.addEventListener('error', (e) => showErr((e.error && e.error.stack) || e.message));
window.addEventListener('unhandledrejection', (e) => showErr('Promise: ' + ((e.reason && e.reason.stack) || e.reason)));

const game = new Game();
window.__game = game;

const LINES = {
  9: { num: '9', title: 'Тролейбус <b>1650</b>', sub: 'Škoda 27Tr Solaris · Линия 9 · ж.к. Борово → бул. „Гоце Делчев“', cls: 'line-tb', doc: 'Тролейбус 1650 · Линия 9' },
  7: { num: '7', title: 'Трамвай <b>2312</b>', sub: 'Pesa Swing 122NaSF · Линия 7 · кв. Манастирски ливади → Метростанция „Хан Кубрат“', cls: 'line-tm', doc: 'Трамвай 2312 · Линия 7' },
};
/** Line from ?line=7 / ?line=9, otherwise the splash picker (the last choice is highlighted). */
function chooseLine() {
  const q = new URLSearchParams(location.search).get('line');
  if (q && LINES[q]) return Promise.resolve(q);
  let last = '9';
  try { last = localStorage.getItem('tb1650.line') || '9'; } catch (e) { /* storage unavailable */ }
  return new Promise((res) => {
    document.querySelectorAll('.line-card').forEach((b) => {
      b.classList.toggle('last', b.dataset.line === last);
      b.addEventListener('click', () => res(b.dataset.line));
    });
  });
}

async function boot() {
  const lineId = await chooseLine();
  try { localStorage.setItem('tb1650.line', lineId); } catch (e) { /* storage unavailable */ }
  const L = LINES[lineId];
  document.body.classList.add(L.cls);
  $('brandNum').textContent = L.num; $('brandNum').classList.toggle('tm', lineId === '7'); $('brandNum').classList.remove('hidden');
  $('brandTitle').innerHTML = L.title; $('brandSub').textContent = L.sub; document.title = L.doc;
  $('linePick').classList.add('hidden'); $('loadBox').classList.remove('hidden');
  try {
    await game.init((p, txt) => { $('progBar').style.width = (p * 100).toFixed(0) + '%'; $('progTxt').textContent = txt; }, lineId);
  } catch (e) { showErr('Init: ' + (e.stack || e)); return; }
  const btn = $('startBtn');
  btn.disabled = false;
  btn.addEventListener('click', async () => {
    game.audio.init();
    try {
      if (window.matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* fullscreen is optional */ }
    $('splash').classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.add('playing');
    game.ui.toast(`${game.route.stops[0].name} · влезте през предната врата в кабината`);
  });
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!window.__manual) { try { game.frame(dt); } catch (e) { showErr('Frame: ' + (e.stack || e)); return; } }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot();

// debugging / screenshot helpers
window.__dbg = {
  THREE, B,
  start() { $('splash').classList.add('hidden'); $('hud').classList.remove('hidden'); },
  view(px, py, pz, tx, ty, tz, fov = 55) {
    const g = game; g.camRig.mode = 'fixed';
    const cam = g.engine.camera; cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); cam.fov = fov; cam.updateProjectionMatrix();
    g.camRig.update = () => {};
  },
  /** Back to the normal camera rig after view(). */
  unview(mode = 'chase') { const g = game; delete g.camRig.update; g.engine.camera.fov = 55; g.engine.camera.updateProjectionMatrix(); g.camRig.setMode(mode); },
  busAt(s) { game.bus.placeOnRoute(s); game.rig.doors.forEach((d) => { d.target = 0; d.open = 0; }); },
  drive(cam = 'cab') { game.enterDriving(); game.camRig.setMode(cam); },
  pose(s, lat = 0) { return game.route.pose(s, lat); },
  /** Manual stepping for headless screenshots. */
  step(n = 1, dt = 1 / 30) { window.__manual = true; const t0 = performance.now(); for (let i = 0; i < n; i++) game.frame(dt); return Math.round(performance.now() - t0); },
  prof() {
    const agg = {};
    game.scene.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      const k = (o.isInstancedMesh ? 'I:' : '') + (o.name || o.material?.name || o.type).replace(/[-0-9,]+/g, '#');
      const c = o.isInstancedMesh ? o.count : 1;
      agg[k] = agg[k] || { tris: 0, meshes: 0 }; agg[k].tris += n * c; agg[k].meshes++;
    });
    return Object.entries(agg).sort((a, b) => b[1].tris - a[1].tris).slice(0, 30).map(([k, v]) => `${k}: ${(v.tris / 1000).toFixed(0)}k tris / ${v.meshes}`);
  },
  calls() {
    const cam = game.engine.camera; cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const agg = {}; let n = 0;
    game.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      if (o.frustumCulled) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(s)) return; }
      const k = (o.name || o.material?.name || o.type).replace(/[-0-9,]+/g, '#').split(':')[0] + ':' + (o.material?.name || '');
      agg[k] = (agg[k] || 0) + 1; n++;
    });
    return [n, game.reg && Object.keys(agg).length, (window.SIGNSN || 0), ...Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + '=' + v)];
  },
  /** Runs the game autopilot for n sim frames (no rendering), acting as the driver for doors and informator. */
  auto(n = 600, dt = 1 / 30) {
    const g = game, v = g.veh, r = g.route;
    window.__manual = true; g.noRender = true;
    if (g.mode !== 'drive') g.enterDriving();
    if (!g.auto.on) g.auto.toggle();
    const log = [];
    const D = g.__drv || (g.__drv = { t: 0, last: '' });
    for (let i = 0; i < n; i++) {
      // scripted driver: react to the autopilot hints like a player would
      const h = g.auto.hint; D.t += dt;
      if (h !== D.last) { D.last = h; D.t = 0; if (h) log.push(`${g.time.toFixed(0)}s ${h} (next=${g.nextStop} s=${(g.sFrontNow || 0).toFixed(1)})`); }
      if (D.t > 1.5) {
        const tgt = g.rig.doors.some((d) => d.target > 0);
        if (h.includes('отворете') && !tgt) { v.toggleDoors(); D.t = 0; }
        else if (h.includes('затворете') && tgt && !g.people.busy() && (D.t > 12 || g.people.waitingAt(r.stops[Math.min(g.nextStop, r.stops.length - 1)].id) === 0)) { v.toggleDoors(); D.t = 0; }
        else if (h.includes('обявете')) { g.announce(); D.t = 0; }
      }
      const ap = g.auto.update(dt);
      v.throttle = ap.throttle; v.brake = ap.brake; if (ap.steer !== null) v.steerCmd = ap.steer;
      g.frameSim(dt);
      if (v.lastHit && v.lastHit !== D.lastHit) { D.lastHit = v.lastHit; const t = `HIT ${JSON.stringify(v.lastHit)} s=${(g.sFrontNow || 0).toFixed(0)}`; if (t !== D.lastHitTxt) log.push(t); D.lastHitTxt = t; }
      if (v.power === false && !D.dew) { D.dew = true; log.push(`NO POWER at s=${(g.sFrontNow || 0).toFixed(0)}`); }
    }
    const pr = r.project(g.frontX, g.frontZ);
    return { s: +(g.sFrontNow || 0).toFixed(1), lat: +pr.lat.toFixed(2), v: +(v.v * 3.6).toFixed(1), next: g.nextStop, pax: g.people.onBoard(), inf: g.informator.idx, stats: g.stats, log };
  },
  info() {
    const R = game.engine.renderer, r = R.info;
    // count every pass of one frame (shadows, mirrors, scene, post)
    r.autoReset = false; r.reset(); game.frame(1 / 60); r.autoReset = true;
    return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, progs: r.programs.length };
  },
  /** Average ms per rendered frame (headless numbers are only useful relative to each other). */
  bench(n = 6) { const t0 = performance.now(); for (let i = 0; i < n; i++) game.frame(1 / 60); game.engine.renderer.getContext().finish(); return +((performance.now() - t0) / n).toFixed(1); },
};
