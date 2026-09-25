// ---------------------------------------------------------------------------
// GENESIS — offline text-to-3D sandbox. Entry point.
//
// Boot: settings -> renderer/post -> texture baker & material library ->
// overworld (terrain, lake, grass, forests, weather) -> player avatar
// (a procedural, rigged humanoid) -> title screen. The main loop drives
// input, the player controller, the time-sliced generation job scheduler,
// entities (NPC brains, animation, physics props), portals, lights, audio,
// the materialize effect and the HUD.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, settings, loadSettings, saveSettings, GRAPHICS_PRESETS } from './core/context.js';
import { applyShaderPatches, globalUniforms } from './render/shaderPatches.js';
import { Renderer, resolveQuality } from './render/renderer.js';
import { TextureBaker } from './render/texbake.js';
import { MaterialLibrary } from './render/materials.js';
import { Materializer } from './render/materialize.js';
import { JobScheduler } from './core/jobs.js';
import { buildOverworld } from './world/world.js';
import { Player } from './player/player.js';
import { Input } from './player/input.js';
import { UI } from './ui/ui.js';
import { Registry } from './gen/registry.js';
import { Pipeline } from './gen/pipeline.js';
import { AudioEngine } from './audio/audio.js';
import { PlayerAvatar } from './game/avatar.js';
import { Interaction } from './game/interaction.js';
import { executeCommand } from './game/commands.js';
import { Persistence } from './game/persistence.js';
import { registerWorld, switchWorld, applyPost } from './game/worlds.js';
import { attachMirror, furnitureMaterials } from './gen/generators/furniture.js';
import { RNG } from './core/rng.js';

const params = new URLSearchParams(location.search);
const BUDGET_OVERRIDE = Number(params.get('budget')) || 0; // ms per frame for generation (tests)
const NO_RENDER = params.has('norender'); // headless benchmark: measure generation without GPU rendering
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const tick = () => new Promise((r) => setTimeout(r, 0));

// Run a loading-time generator in slices while keeping the page responsive.
async function runSliced(gen, budget = 24) {
  let r;
  let sliceEnd = performance.now() + budget;
  while (!(r = gen.next()).done) {
    if (performance.now() > sliceEnd) { await tick(); sliceEnd = performance.now() + budget; }
  }
  return r.value;
}

function detectTouch() {
  if (settings.touchControls === 'on') return true;
  if (settings.touchControls === 'off') return false;
  if (params.has('touch')) return true;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

async function boot() {
  loadSettings();
  if (params.get('q')) settings.graphics = params.get('q');
  if (params.get('gen')) settings.genQuality = params.get('gen');
  applyShaderPatches();
  G.quality = resolveQuality();
  G.hooks = {};

  // ---- UI first so loading progress is visible ----
  const ui = new UI(makeHooks());
  G.ui = ui;
  ui.setLoading(0.01, 'Starting renderer…');
  await nextFrame();

  // ---- Renderer & camera ----
  const container = document.getElementById('app');
  try { G.renderer = new Renderer(container); } catch (e) {
    ui.setLoading(0, 'WebGL 2 is required but not available on this device/browser.');
    throw e;
  }
  G.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, G.quality.farDistance + 3000);
  G.camera.rotation.order = 'YXZ';
  G.baker = new TextureBaker(G.renderer.renderer);
  G.materials = new MaterialLibrary(G.baker);
  G.jobs = new JobScheduler();
  G.registry = new Registry();
  G.pipeline = new Pipeline(G.jobs, G.registry);
  G.pipeline.calibrate();
  G.materializer = new Materializer();
  if (params.has('nofx')) G.materializer.start = () => {};
  G.audio = new AudioEngine();
  G.interaction = new Interaction();
  G.persistence = new Persistence();
  G.isTouch = detectTouch();

  // ---- Overworld ----
  const world = await runSliced(buildOverworld((p, t) => ui.setLoading(0.02 + p * 0.78, t)));
  world.lightPool = null;
  registerWorld(world);
  G.overworld = world;
  G.world = world;
  G.renderer.setup(world.scene, G.camera, G.quality);
  if (params.get('time')) world.atmosphere.setTime(Number(params.get('time')));
  if (params.get('weather')) world.weather.set(params.get('weather'));
  world.weather.onThunder = () => G.audio.play('thunder', null, { dist: 1 + Math.random() * 2.5 });

  // ---- Player ----
  const player = new Player(G.camera);
  G.player = player;
  const sp = world.spawn.pos.clone();
  // Face the lake for a nice first view.
  const lake = world.lake;
  const spawnYaw = lake ? Math.atan2(-(lake.x - sp.x), -(lake.z - sp.z)) : 0;
  world.spawn.yaw = spawnYaw;
  player.teleport(sp, spawnYaw);
  player.pitch = -0.04;
  const input = new Input(G.renderer.renderer.domElement);
  G.input = input;
  input.enabled = false;
  if (G.isTouch) { input.enableTouch(document.getElementById('touch')); document.getElementById('command-input').placeholder = 'Tap here and describe anything…'; }
  bindInput(input);
  player.onStep = (speed) => { if (G.audio) G.audio.play('step', null, { surface: surfaceUnderPlayer(), gain: 0.1 + Math.min(0.15, speed * 0.02) }); };

  // ---- Player avatar (rigged procedural humanoid) ----
  ui.setLoading(0.82, 'Sculpting your body');
  const avatar = new PlayerAvatar();
  G.avatar = avatar;
  const actx = { shouldYield: () => true, detail: 1, stage() {}, progress() {}, mustFinish: () => false, cancelled: false };
  await runSliced(avatar.build(actx, (f, t) => ui.setLoading(0.82 + f * 0.14, t || 'Sculpting your body')), 30);
  world.scene.add(avatar.root);
  player.avatar = avatar;
  avatar.setFirstPerson(player.cameraMode === 'first');

  // ---- A mirror near the spawn so you can see yourself ----
  if (G.quality.name !== 'low' && !params.has('nomirror')) placeSpawnMirror(world, sp, spawnYaw);

  ui.setLoading(0.97, 'Compiling shaders');
  await nextFrame();
  G.renderer.renderer.compile(world.scene, G.camera);
  ui.setLoading(1, 'Ready');
  ui.loadingDone();

  window.addEventListener('resize', () => G.renderer.resize());
  window.addEventListener('beforeunload', () => { if (G.started && G.registry.entities.size) G.persistence.save('auto', true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.started && !G.paused) pause(); });
  window.G = G;
  startLoop();

  // Automation hooks (headless tests / demos): ?autostart&cmd=...
  if (params.has('autostart')) {
    start();
    const cmds = params.getAll('cmd');
    cmds.forEach((c, i) => setTimeout(() => executeCommand(c, null), 300 + i * 150));
  }
}

function placeSpawnMirror(world, sp, yaw) {
  const rng = new RNG(7);
  const mats = furnitureMaterials(rng, {});
  const root = new THREE.Group();
  attachMirror(root, rng, mats);
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const pos = sp.clone().addScaledVector(fwd, 3.2).addScaledVector(right, 2.6);
  pos.y = world.heightAt(pos.x, pos.z);
  root.position.copy(pos);
  // Face the spawn point.
  root.rotation.y = Math.atan2(sp.x - pos.x, sp.z - pos.z);
  G.materials.retainTree(root);
  world.scene.add(root);
  world.colliders.add({ type: 'box', x: pos.x, z: pos.z, y0: pos.y, y1: pos.y + 2, hx: 0.5, hz: 0.25, yaw: root.rotation.y });
  G.spawnMirror = root;
}

function surfaceUnderPlayer() {
  const P = G.player, w = G.world;
  if (w.colliders.lastGroundCollider) {
    const t = w.colliders.lastGroundCollider.tag;
    return t === 'metal' ? 'metal' : t === 'stone' ? 'stone' : 'wood';
  }
  if (w.waterLevel > -1e8 && P.position.y < w.waterLevel + 0.1) return 'water';
  if (w.meta.surface) return w.meta.surface;
  if (!w.terrain) return 'stone';
  const h = P.position.y;
  if (h > (w.terrain.snowLine || 1e9) || (w.weather && w.weather.snowCover > 0.5)) return 'snow';
  if (w.terrain.slopeAt(P.position.x, P.position.z) > 0.3) return 'stone';
  if (h < w.waterLevel + 1.5) return 'sand';
  const paint = w.terrain.paintAt ? w.terrain.paintAt(P.position.x, P.position.z) : null;
  if (paint && paint[0] > 128) return 'stone';
  if (paint && paint[1] > 128) return 'dirt';
  return 'grass';
}

// ---------------- Game state ----------------
function start() {
  G.audio.resume();
  G.ui.hideTitle();
  G.started = true;
  resume();
  if (!G.welcomed) {
    G.welcomed = true;
    setTimeout(() => G.ui.toast(G.isTouch ? 'Tap the bar at the bottom and describe anything to create it.' : 'Press Enter and describe anything — it will be generated in front of you.', 'good', 6500), 600);
  }
}

function pause(showMenu = true) {
  if (!G.started) return;
  G.paused = true;
  G.input.enabled = false;
  G.input.exitLock();
  if (showMenu) G.ui.showPause();
}

function resume() {
  G.ui.hidePause();
  G.paused = false;
  G.input.enabled = !G.ui.focused;
  if (!G.isTouch) G.input.requestLock();
}

function sitDown() {
  const P = G.player;
  if (P.sitting) { P.standUp(); return; }
  if (!P.grounded || P.vehicle) return;
  const f = P.forward(new THREE.Vector3());
  const feet = P.position.clone();
  P.sitAt({ feet, yaw: P.yaw, lookYaw: P.yaw + Math.PI, seatHeight: 0.02, height: 0.02, eye: feet.clone().add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(f, 0.15), exit: feet.clone() });
}

function teleportTo(id) {
  const e = G.registry.get(id);
  if (!e) return;
  const world = G.worlds.get(e.worldId);
  const r = (e.footprint ? e.footprint.radius : 1) * e.scale;
  const P = G.player;
  // Stand in front of the entity, looking at it.
  const yaw = e.root.rotation.y;
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const pos = e.root.position.clone().addScaledVector(dir, r + 2.5);
  pos.y = world.colliders.groundHeight(pos.x, pos.z, 0.3, pos.y + 30, 60);
  const lookYaw = Math.atan2(-(e.root.position.x - pos.x), -(e.root.position.z - pos.z));
  if (world !== G.world) switchWorld(world, pos, lookYaw);
  else P.teleport(pos, lookYaw);
  G.ui.close('entity-panel');
  if (!G.paused && !G.isTouch) G.input.requestLock();
}

function makeHooks() {
  G.hooks.pause = pause;
  G.hooks.resume = resume;
  G.hooks.sitDown = sitDown;
  G.hooks.teleportTo = teleportTo;
  return {
    onCommand: (text, talkTarget) => { try { executeCommand(text, talkTarget); } catch (e) { console.error(e); G.ui.toast('Something went wrong: ' + e.message, 'bad'); } },
    onToggleCamera: () => G.player.toggleCamera(),
    onPause: () => pause(),
    onResume: () => resume(),
    onUndo: () => { const e = G.registry.undo(); G.ui.toast(e ? `Removed ${e.name}` : 'Nothing to undo'); G.ui.renderEntityList(); },
    onClear: () => { G.registry.clear(null); G.ui.renderEntityList(); G.ui.toast('Cleared everything'); },
    onExport: () => G.persistence.exportFile(),
    onImport: (data) => { resume(); G.persistence.restore(data); },
    onNew: () => { G.persistence.reset(); const ow = G.overworld; G.player.teleport(ow.spawn.pos.clone(), ow.spawn.yaw); ow.atmosphere.setTime(9.6); ow.weather.set('clear'); resume(); G.ui.toast('A fresh new world'); },
    onQuit: () => { if (G.registry.entities.size) G.persistence.save('auto', true); G.paused = true; G.started = false; G.ui.hidePause(); G.ui.showTitle(); G.input.exitLock(); },
    onStart: () => start(),
    onEndTalk: (e) => { if (e && e.brain) e.brain.talkUntil = 0; },
    getSlots: () => G.persistence.getSlots(),
    onSave: (slot) => G.persistence.save(slot),
    onLoad: (slot) => { if (!G.started) start(); else resume(); G.persistence.load(slot); },
    onTeleport: (id) => teleportTo(id),
    onDelete: (id) => { const e = G.registry.get(id); if (e) { G.registry.remove(id); G.ui.toast(`Deleted ${e.name}`); } },
    onSettingChange: (k, v) => applySetting(k, v),
  };
}

function applySetting(k, v) {
  switch (k) {
    case 'fov': G.player.fov = v; break;
    case 'volume': G.audio.setVolume(v); break;
    case 'shadows': G.renderer.renderer.shadowMap.enabled = v; G.materials.materials.forEach((e) => { e.material.needsUpdate = true; }); break;
    case 'ao': case 'bloom': G.renderer.buildComposer(); break;
    case 'renderScale': G.renderer.resize(); break;
    case 'graphics': {
      const q = resolveQuality();
      Object.assign(G.quality, { pixelRatio: q.pixelRatio, ao: q.ao, bloom: q.bloom, fxaa: q.fxaa, msaa: q.msaa, name: q.name });
      G.renderer.resize(); G.renderer.buildComposer();
      G.ui.toast('Some quality changes (shadows, grass, textures) apply after reload.');
      break;
    }
    case 'thirdPerson': if ((G.player.cameraMode === 'third') !== v) G.player.toggleCamera(); break;
    case 'touchControls': G.ui.toast('Reload to apply touch control changes.'); break;
    case 'grassDensity': for (const g of G.overworld.grass) if (g.setDensity) g.setDensity(v); break;
    default: break;
  }
  saveSettings();
}

function bindInput(input) {
  input.on('enter', () => { if (G.started && !G.paused) G.ui.focusCommand(); });
  input.on('slash', () => { if (G.started && !G.paused) G.ui.focusCommand(); });
  input.on('escape', () => {
    if (!G.started) return;
    if (G.ui.isOpen('entity-panel')) { G.ui.close('entity-panel'); return; }
    if (G.ui.talkTarget) { G.ui.endTalk(); return; }
    if (G.paused) resume(); else pause();
  });
  input.on('lockchange', (locked) => {
    if (locked || !G.started || G.paused || G.isTouch) return;
    // Pointer lock lost (usually Esc): open the menu unless typing or in a panel.
    setTimeout(() => {
      if (G.input.locked || G.ui.focused || G.ui.isOpen('entity-panel') || G.paused || document.activeElement === document.getElementById('command-input')) return;
      pause();
    }, 60);
  });
  input.on('interact', () => { if (G.started && !G.paused) G.interaction.use(); });
  input.on('mouse0', () => { if (!G.started || G.paused) return; if (!G.interaction.throw()) G.interaction.use(); });
  input.on('tap', () => { if (G.started && !G.paused && G.interaction.target) G.interaction.use(); });
  input.on('drop', () => G.interaction.drop());
  input.on('camera', () => G.player.toggleCamera());
  input.on('wave', () => { G.avatar.gesture('wave', 2.2); for (const e of G.world.entities) if (e.brain && e.root.position.distanceTo(G.player.position) < 8 && Math.random() < 0.8) setTimeout(() => e.brain.command('wave'), 400 + Math.random() * 600); });
  input.on('dance', () => G.avatar.gesture('dance', 8));
  input.on('sit', () => sitDown());
  input.on('fly', () => { G.player.flying = !G.player.flying; G.ui.toast(G.player.flying ? 'Flying (Space up · C down · Shift fast)' : 'Walking'); });
  input.on('list', () => { if (G.started) G.ui.toggleEntityPanel(); });
  input.on('help', () => { if (G.started) { pause(false); G.ui.showHelp(); } });
  input.on('fps', () => { settings.showFps = !settings.showFps; saveSettings(); });
  input.on('delete', () => {
    const e = G.interaction.lookedAt;
    if (e) { G.registry.remove(e.id); G.ui.toast(`Deleted ${e.name}`); }
  });
  input.on('undo', (ev) => { if (ev && (ev.ctrlKey || ev.metaKey)) { const e = G.registry.undo(); G.ui.toast(e ? `Removed ${e.name}` : 'Nothing to undo'); } });
  input.on('talk', () => { const t = G.interaction.target; if (t && t.entity.isCharacter && !t.entity.creature) t.action.run(); });
}

// ---------------- Main loop ----------------
function startLoop() {
  const clock = new THREE.Clock();
  window.__frames = 0;
  let fpsAcc = 0, fpsN = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    G.dt = dt;
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > 0.5) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    try { frame(dt); } catch (e) { console.error(e); }
    window.__frames++;
  };
  loop();
  // Generation also soaks up the main thread's idle time between frames
  // (common when rendering is GPU-bound), without ever delaying a frame.
  if (typeof requestIdleCallback === 'function' && !BUDGET_OVERRIDE && !params.has('noidle')) {
    const idle = (deadline) => {
      const t = deadline.timeRemaining() - 1.5;
      if (t > 1.5 && G.jobs.hasRunnable) { try { G.jobs.tick(Math.min(t, 40), true); } catch (e) { console.error(e); } }
      requestIdleCallback(idle);
    };
    requestIdleCallback(idle);
  }
}

function frame(dt) {
  G.renderer.renderer.info.reset();
  const world = G.world;
  const P = G.player;
  const playing = G.started && !G.paused;
  if (playing) G.time += dt;
  else G.time += dt * 0.25; // keep water/grass gently alive behind menus
  globalUniforms.uGTime.value = G.time;

  // Generation jobs get a per-frame budget that adapts to the frame rate.
  const budget = BUDGET_OVERRIDE || (G.fps > 50 ? 12 : G.fps > 30 ? 10 : 8);
  G.jobs.tick(playing ? budget : budget * 2);

  if (playing) {
    P.update(dt, G.input, world);
    G.interaction.update(dt);
  } else if (!G.started) {
    // Title screen: slow cinematic pan.
    P.yaw += dt * 0.03;
    P._updateCamera(dt, world);
  }
  if (G.avatar) G.avatar.update(dt, P);
  if (G.timeTween && world.atmosphere) {
    const tw = G.timeTween;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const k = tw.t * tw.t * (3 - 2 * tw.t);
    world.atmosphere.setTime(tw.from + (tw.to - tw.from) * k);
    if (tw.t >= 1) G.timeTween = null;
  }
  if (playing) G.registry.update(dt, G.camera.position);
  world.update(dt, G.camera, P.position);
  if (world.lightPool) world.lightPool.update(dt, G.camera.position, world.atmosphere ? world.atmosphere.night : 1, G.time);
  G.materializer.update(dt);
  if (world.atmosphere) {
    world.atmosphere.applyGlobals();
    world.atmosphere.maybeUpdateEnv();
    G.renderer.exposure = world.atmosphere.exposure;
  }
  applyPost(world, dt);
  if (world.weather && world.weather.flash > 0.01 && G.renderer.passes.final) G.renderer.passes.final.uniforms.uFlash.value = world.weather.flash * 0.35;
  else if (G.renderer.passes.final) G.renderer.passes.final.uniforms.uFlash.value = 0;
  if (!NO_RENDER) G.renderer.render(dt);
  G.ui.update(dt);
  G.audio.update(dt);
  G.persistence.update(dt);
  G.input.endFrame();
  G.frame++;
  if ((G.frame & 1023) === 0) G.materials.collectGarbage(90000);
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loader-text');
  if (t) t.textContent = 'Error: ' + e.message;
});
