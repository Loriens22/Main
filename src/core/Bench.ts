import * as THREE from 'three';
import type { Game } from './Game';

/**
 * A repeatable performance test (open the game with ?bench, or Settings → Graphics → Performance test). It flies a
 * fixed route and reports, per scene:
 *   fps          frames per second (median), and the 1 % low (the 99th-percentile frame time)
 *   draw calls   per frame (average, peak) — independent of the device
 *   triangles    per frame (average, peak) — independent of the device
 * Scenes: Jupiter's cloud layer (the flight view, an orbit of the floating colony, the sheet's animals close by)
 * and the Mars refuge cavern (a walk through the grove and under the lake). ?bench=jupiter or ?bench=refuge runs
 * one. The result is shown on screen, logged, and kept in window.__bench.
 */
export interface BenchScene {
  scene: string;
  seconds: number;
  frames: number;
  fpsMedian: number;
  fpsMean: number;
  low1Ms: number;
  callsAvg: number;
  callsMax: number;
  trisAvg: number;
  trisMax: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function overlay() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:999;font:13px/1.5 ui-monospace,Menlo,monospace;color:#f0ead8;' +
    'background:rgba(6,8,12,.78);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:10px 14px;max-width:calc(100vw - 32px);white-space:pre-wrap;pointer-events:auto';
  document.body.append(el);
  return el;
}

/** measure `seconds` of real frames while `path` drives the camera (t in 0..1) */
async function measure(game: Game, name: string, seconds: number, path: (k: number, cam: THREE.PerspectiveCamera) => void, ui: HTMLElement) {
  const info = game.renderer.gl.info;
  const times: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  let t0 = -1;
  let last = 0;
  let k = 0;
  game.cinematic = {
    blocking: true,
    update: (_dt, cam) => {
      path(k, cam);
      cam.updateMatrixWorld(true);
      return true;
    },
  };
  // a warm-up first (shaders compile, far-view atlases bake the first time a scene is seen): not measured
  await new Promise<void>((done) => {
    const w0 = performance.now();
    const warm = (now: number) => {
      k = 0;
      ui.textContent = `PERFORMANCE TEST — ${name}\nwarming up…`;
      if (now - w0 < 3000) requestAnimationFrame(warm);
      else done();
    };
    requestAnimationFrame(warm);
  });
  await new Promise<void>((done) => {
    const tick = (now: number) => {
      if (t0 < 0) {
        t0 = now;
        last = now;
      } else {
        times.push(now - last);
        last = now;
        // the renderer's totals for the frame just drawn
        calls.push(info.render.calls);
        tris.push(info.render.triangles);
      }
      k = Math.min(1, (now - t0) / (seconds * 1000));
      ui.textContent = `PERFORMANCE TEST — ${name}\n${Math.round(k * 100)} %`;
      if (k < 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  game.cinematic = null;
  const sorted = [...times].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 16.7;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || med;
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  return {
    scene: name, seconds, frames: times.length, fpsMedian: +(1000 / med).toFixed(1), fpsMean: +(1000 / mean).toFixed(1), low1Ms: +p99.toFixed(1),
    callsAvg: Math.round(avg(calls)), callsMax: Math.max(0, ...calls), trisAvg: Math.round(avg(tris)), trisMax: Math.max(0, ...tris),
  } satisfies BenchScene;
}

async function jupiter(game: Game, ui: HTMLElement): Promise<BenchScene[]> {
  ui.textContent = 'PERFORMANCE TEST — loading Jupiter…';
  await game.startCreative(false);
  game.cinematic = null;
  const L = await import('../data/landing');
  const s = L.SURFACES.jupiter.sites[0];
  const v = game.state.vehicles.ranger1;
  v.data.surface = { body: 'jupiter', lat: s.lat, lon: s.lon, name: s.name };
  v.landed = false;
  await game.goTo('surface', { at: 'cruise' }, { fade: 0 });
  const z = game.zone as unknown as { fauna: { creatures: { species: string; pos: THREE.Vector3; center?: THREE.Vector3 }[] } | null; craft: { pos: number[] } };
  for (let i = 0; i < 240 && !(z.fauna && z.fauna.creatures.some((c) => c.species === 'colony') && z.fauna.creatures.length > 14); i++) await wait(250);
  await wait(3000);
  const of = (sp: string) => z.fauna?.creatures.find((c) => c.species === sp) ?? null;
  const out: BenchScene[] = [];
  const P = new THREE.Vector3();
  // 1) the flight view: chase camera behind Ranger 1, looking along the path
  out.push(await measure(game, 'Jupiter — flight view', 12, (k, cam) => {
    P.set(z.craft.pos[0], z.craft.pos[1], z.craft.pos[2]);
    const a = k * 0.6;
    cam.position.set(P.x - 40 * Math.cos(a), P.y + 12, P.z - 40 * Math.sin(a));
    cam.lookAt(P.x + 600 * Math.cos(a), P.y - 20, P.z + 600 * Math.sin(a));
  }, ui));
  // 2) an orbit of the floating colony
  out.push(await measure(game, 'Jupiter — colony orbit', 12, (k, cam) => {
    const c = of('colony');
    const C = c?.center ?? c?.pos ?? P;
    const a = k * Math.PI * 0.8;
    cam.position.set(C.x + Math.cos(a) * 750, C.y + 60, C.z + Math.sin(a) * 750);
    cam.lookAt(C.x, C.y - 30, C.z);
  }, ui));
  // 3) the sheet's animals close by (each brought to a slot beside the camera's path)
  const sp = ['stormskimmer', 'skyjelly', 'stormbeast', 'voltdrifter', 'deepdiver', 'gasgrazer', 'stormhunter'];
  out.push(await measure(game, 'Jupiter — animals close', 12, (k, cam) => {
    P.set(z.craft.pos[0], z.craft.pos[1], z.craft.pos[2]);
    const base = new THREE.Vector3(P.x + 300, P.y + 40, P.z + 300);
    sp.forEach((name, i) => {
      const c = of(name);
      if (c) c.pos.set(base.x + (i - 3) * 90, base.y + ((i % 2) - 0.5) * 30, base.z + (i % 3) * 40);
    });
    cam.position.set(base.x - 320 + k * 640, base.y + 20, base.z - 160);
    cam.lookAt(base.x - 200 + k * 400, base.y, base.z);
  }, ui));
  return out;
}

async function refuge(game: Game, ui: HTMLElement): Promise<BenchScene[]> {
  ui.textContent = 'PERFORMANCE TEST — loading the Mars refuge…';
  await game.startCreative(false);
  game.cinematic = null;
  const L = await import('../data/landing');
  const s = L.SURFACES.mars.sites[2];
  const v = game.state.vehicles.ranger1;
  v.data.surface = { body: 'mars', lat: s.lat, lon: s.lon, name: s.name };
  v.landed = true;
  await game.goTo('surface', { at: 'landed' }, { fade: 0 });
  type Z = { refuge: { world: (x: number, y: number, z: number, o?: THREE.Vector3) => THREE.Vector3 } | null; fauna: { creatures: unknown[] } | null; beginEva: (q: boolean) => void };
  const z = game.zone as unknown as Z;
  z.beginEva(true);
  for (let i = 0; i < 240 && !(z.refuge && z.fauna && z.fauna.creatures.length > 15); i++) await wait(250);
  await wait(3000);
  if (!z.refuge) return [];
  const R = z.refuge;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  return [await measure(game, 'Mars refuge — cavern walk', 16, (k, cam) => {
    // ledge → over the grove → down to the shore → under the lake
    const path: [number, number, number][] = [[-22, -8.5, -50], [-6, -14, -30], [6, -20.5, 0], [-4, -23.5, 4]];
    const look: [number, number, number][] = [[8, -22, 6], [0, -24, 6], [-6, -24.5, 0], [10, -25, 8]];
    const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), t = f - i;
    R.world(...path[i], a).lerp(R.world(...path[i + 1], b), t);
    cam.position.copy(a);
    R.world(...look[i], a).lerp(R.world(...look[i + 1], b), t);
    cam.lookAt(a);
  }, ui)];
}

export async function runBench(game: Game, which: string) {
  const ui = overlay();
  const results: BenchScene[] = [];
  try {
    if (which !== 'refuge') results.push(...(await jupiter(game, ui)));
    if (which !== 'jupiter') results.push(...(await refuge(game, ui)));
  } catch (e) {
    console.error('[bench]', e);
  }
  const gl = game.renderer.gl;
  const ctx = gl.getContext();
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  const res = { preset: game.settings.graphics.preset, pixelRatio: +gl.getPixelRatio().toFixed(2), size: `${gl.domElement.width}×${gl.domElement.height}`, gpu, results };
  (window as unknown as { __bench: typeof res }).__bench = res;
  console.log('[bench]', JSON.stringify(res));
  ui.textContent = `PERFORMANCE TEST — done (graphics: ${res.preset}, ${res.size}, ${gpu})\n\n` +
    results.map((r) => `${r.scene.padEnd(28)} ${String(r.fpsMedian).padStart(5)} fps (1% low ${(1000 / r.low1Ms).toFixed(0)} fps)   ${r.callsAvg} draws   ${(r.trisAvg / 1e6).toFixed(2)} M tris`).join('\n') +
    '\n\nTap to close.';
  ui.onclick = () => ui.remove();
  return res;
}
