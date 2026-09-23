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

async function boot() {
  try {
    await game.init((p, txt) => { $('progBar').style.width = (p * 100).toFixed(0) + '%'; $('progTxt').textContent = txt; });
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
    game.ui.toast('ж.к. Борово · влезте през предната врата в кабината');
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
  /** Debug autopilot: follows the route, obeys signals, services stops. Runs n sim frames without rendering. */
  auto(n = 600, dt = 1 / 30, vmax = 12) {
    const g = game, b = g.bus, r = g.route;
    window.__manual = true; g.noRender = true;
    if (g.mode !== 'drive') g.enterDriving();
    b.park = false; b.gear = 'D';
    const log = [];
    const A = g.__auto || (g.__auto = { state: 'drive', t: 0 });
    for (let i = 0; i < n; i++) {
      const fb = b.frontBumper();
      const pr = r.bus.project(fb.x, fb.z);
      const sF = pr.s - r.busOffset;
      // pure pursuit from the middle axle
      const la = r.pose(sF + 5 - 8.625 + 5.9 + 6);
      const dx = la.x - b.x, dz = la.z - b.z; const Ld = Math.hypot(dx, dz);
      const alpha = Math.atan2(dz, dx) - b.h; const al = Math.atan2(Math.sin(alpha), Math.cos(alpha));
      const delta = Math.atan(2 * 5.9 * Math.sin(al) / Ld);
      b.steerCmd = Math.max(-1, Math.min(1, delta / (50 * Math.PI / 180)));
      // targets
      let vT = vmax;
      const ns = g.nextStop < r.stops.length ? r.stops[g.nextStop] : null;
      if (ns && A.state === 'drive') { const d = ns.s - sF; if (d < 60) vT = Math.min(vT, Math.max(0.6, Math.sqrt(2 * 1.0 * Math.max(0, d - 0.5)))); if (d < 0.8 && !g.served.has(g.nextStop)) { A.state = 'stopping'; } }
      for (const sl of r.stopLines) { const d = sl.s - sF; if (d > -1 && d < 70) { const st = g.tl.state(sl.inter, sl.group); if (st.c !== 'G') vT = Math.min(vT, Math.max(0, Math.sqrt(2 * 1.5 * Math.max(0, d - 1.5)))); } }
      // curves: slow down according to upcoming heading change
      const h0 = r.pose(sF).h, h1 = r.pose(sF + 25).h; const turn = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
      if (turn > 0.3) vT = Math.min(vT, 5);
      // follow traffic ahead on the bus path
      for (const c of g.traffic.boxes()) {
        if (Math.hypot(c.x - fb.x, c.z - fb.z) > 50) continue;
        const pc = r.bus.project(c.x, c.z); if (!pc || Math.abs(pc.lat) > 2.6) continue;
        const gap = pc.s - pr.s - c.hd; if (gap < -1 || gap > 45) continue;
        vT = Math.min(vT, Math.max(0, Math.sqrt(2 * 1.2 * Math.max(0, gap - 4))));
      }
      if (A.state === 'stopping') { vT = 0; if (Math.abs(b.v) < 0.05) { if (!b.doorsOpen()) b.toggleDoors(); A.state = 'dwell'; A.t = 0; log.push(`arrive ${r.stops[g.nextStop]?.name} err=${(r.stops[g.nextStop].s - sF).toFixed(2)} t=${g.time.toFixed(0)}`); } }
      if (A.state === 'dwell') { vT = 0; A.t += dt; if (A.t > 8 && !g.people.busy() && g.people.waitingAt(r.stops[Math.min(g.nextStop, 2)].id) === 0) { if (b.doorsOpen()) b.toggleDoors(); A.state = 'leaving'; A.t = 0; log.push('depart pax=' + g.people.onBoard()); } if (A.t > 60) { b.toggleDoors(); A.state = 'leaving'; log.push('forced depart'); } }
      if (A.state === 'leaving') { A.t += dt; vT = A.t > 2.5 ? vmax : 0; if (A.t > 2.5 && !b.doorsOpen()) A.state = 'drive2'; }
      if (A.state === 'drive2') { if (ns && ns.s - sF < -20) A.state = 'drive'; if (ns && ns.s - sF > 30) A.state = 'drive'; }
      const ev = vT - b.v;
      b.throttle = ev > 0.3 ? Math.min(1, ev * 0.5) : 0; b.brake = ev < -0.3 ? Math.min(1, -ev * 0.4) : 0;
      g.frameSim(dt);
      if (b.lastHit && b.lastHit !== A.lastHit) { A.lastHit = b.lastHit; log.push(`HIT ${JSON.stringify(b.lastHit)} s=${sF.toFixed(0)} v=${b.v.toFixed(1)}`); }
      if (!b.power && !A.dewiredLogged) { A.dewiredLogged = true; log.push(`DEWIRE at s=${sF.toFixed(0)} lat=${b.poles.map(p=>p.lat.toFixed(2))}`); }
    }
    const fb = b.frontBumper(); const pr = r.bus.project(fb.x, fb.z);
    return { s: +(pr.s - r.busOffset).toFixed(1), lat: +pr.lat.toFixed(2), v: +(b.v * 3.6).toFixed(1), next: g.nextStop, pax: g.people.onBoard(), power: b.power, stats: g.stats, log };
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
