// Sofia Public Transport — Bus 280. Entry point: boot, load the world, menus.
import * as THREE from 'three';
import route280 from './data/route280.json';
import route64 from './data/route64.json';
import route12 from './data/route12.json';
import { Route280 } from './gameplay/Route280Data.js';
import { loadWorldPack } from './world/WorldData.js';
import { World } from './world/World.js';
import { Renderer } from './render/Renderer.js';
import { SkySystem } from './render/SkySystem.js';
import { vehicleSpec, frames } from './vehicle/Vehicles.js';
import { loadBusKit } from './vehicle/BusKit.js';
import { loadBusLightmaps, exportLightmapScene } from './vehicle/BusLightmap.js';
import { Game } from './game/Game.js';
import { Menu } from './ui/Menu.js';
import { Input } from './ui/Input.js';
import { injectStyles } from './ui/styles.js';
import { setLang, L } from './ui/i18n.js';
import { loadSettings, saveSettings, detectQuality, writeSave } from './game/Settings.js';
import { AudioManager } from './audio/AudioManager.js';
import { VoiceAnnouncer } from './audio/VoiceAnnouncer.js';
import { GameStateManager } from './gameplay/GameStateManager.js';
import { AIBusDriver } from './gameplay/AIBusDriver.js';
import { AITramDriver } from './gameplay/AITramDriver.js';

const params = new URLSearchParams(location.search);
/** Route data of the playable lines; the world of one line is loaded per session (?line= or the menu). */
const ROUTES = { 280: route280, 64: route64, 12: route12 };

async function boot() {
  injectStyles();
  const canvas = document.getElementById('gl');
  const bar = document.getElementById('loadbar');
  const msg = document.getElementById('loadmsg');
  const progress = (p, txt) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    if (txt) msg.textContent = txt;
    if (params.has('memlog') && performance.memory) console.warn(`MEM ${p.toFixed(2)} ${Math.round(performance.memory.usedJSHeapSize / 1e6)}MB ${txt || ''}`);
  };
  const settings = loadSettings();
  if (!settings.quality) settings.quality = detectQuality();
  if (params.get('q')) settings.quality = params.get('q');
  saveSettings(settings);
  if (params.has('seed')) settings.dispatchSeed = params.get('seed'); // test/debug: reproducible dispatch (not saved)
  setLang(settings.lang);
  const quality = settings.quality;
  if (!document.createElement('canvas').getContext('webgl2')) throw new Error(L('WebGL2 не се поддържа от този браузър / WebGL2 not supported', 'WebGL2 is not supported by this browser'));
  const R = new Renderer(canvas, quality);
  R.renderScale = settings.renderScale || 1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 40000);
  R.setupPost(scene, camera);
  R.resize();
  const sky = new SkySystem(R.renderer, scene, quality);
  const line = ROUTES[params.get('line')] ? params.get('line') : ROUTES[settings.line] ? String(settings.line) : '280';
  const route = new Route280(ROUTES[line]);
  // Blender-modelled bus parts: parsed while the world loads, ready before the first bus is built
  const busKit = Promise.all([loadBusKit(), loadBusLightmaps()]);
  if (params.get('scene') === 'bus') return busKit.then(() => busStudio({ R, scene, camera, sky, progress }));
  const states = new GameStateManager();
  states.go('menu');
  const data = await loadWorldPack(progress, line);
  const world = await new World({ scene, data, quality, route }).build(progress);
  progress(0.72, L('Растителност, улично обзавеждане и спирки…', 'Vegetation, street furniture and stops…'));
  await new Promise((r) => setTimeout(r, 0));
  const extras = await import('./world/Extras.js').then((m) => m.buildExtras({ scene, world, data, route, quality, sky })).catch((e) => {
    console.error('extras failed', e);
    return {};
  });
  const audio = new AudioManager(settings);
  const voice = new VoiceAnnouncer(audio, settings);
  const input = new Input(canvas);
  input.sensitivity = settings.sensitivity;
  input.invertY = settings.invertY;
  const uiRoot = document.getElementById('ui');
  await busKit;
  const game = new Game({ renderer: R, scene, camera, sky, world, route, audio, voice, input, settings, uiRoot, quality });
  Object.assign(game, extras);
  if (extras.init) extras.init(game);
  sky.set(10.5, 'clear');
  world.setNight(sky.night);
  progress(0.9, L('Компилиране на шейдърите…', 'Compiling shaders…'));
  game.startAttract();
  game.update(0.016);
  R.renderer.compile(scene, camera);
  progress(1, '');
  document.getElementById('loading').classList.add('hidden');

  let touchUI = null;
  const menu = new Menu(uiRoot, {
    settings, route, voice,
    // another line: its world is a different map, loaded fresh
    onLine: (n) => {
      settings.line = String(n);
      saveSettings(settings);
      const u = new URL(location.href);
      for (const k of ['autostart', 'dir', 'stop', 'veh', 'fleet']) u.searchParams.delete(k);
      u.searchParams.set('line', String(n));
      location.href = u.toString();
    },
    onSettingsChanged: (s, action) => {
      audio.applyVolumes();
      input.sensitivity = s.sensitivity;
      input.invertY = s.invertY;
      input.enableGyro(!!s.gyro);
      document.documentElement.style.setProperty('--tc', s.controlsSize || 1);
      if (Math.abs((R.renderScale || 1) - s.renderScale) > 0.01) {
        R.renderScale = s.renderScale;
        R.resize();
      }
      if (action === 'testVoice' || action === 'testBeep') {
        audio.start().then(() => {
          if (action === 'testBeep') {
            audio.doorBeep(1);
            setTimeout(() => audio.doorBeep(2), 420);
          } else {
            const st = route.direction('A').stops[1];
            voice.play({ text: `Следваща спирка ${st.speech || st.name}.`, display: st.name, kind: 'next' }, 1, () => {});
          }
        });
      }
      saveSettings(s);
    },
    onStart: async (opts) => {
      const audioReady = audio.start(); // creates and resumes the AudioContext synchronously, inside the tap (iOS/Android)
      if (settings.gyro) input.enableGyro(true); // inside the tap, for the iOS permission prompt
      await audioReady;
      menu.hide();
      startMode(opts);
    },
  });
  document.documentElement.style.setProperty('--tc', settings.controlsSize || 1);
  if (settings.gyro) input.enableGyro(true);

  const startMode = (opts) => {
    if (states.state !== 'loading') {
      if (states.can('loading')) states.go('loading');
    }
    if (opts.qualityChanged || (opts.quality && opts.quality !== R.quality)) applyQuality(settings.quality);
    const env = { hour: opts.hour ?? 10.5, weather: opts.weather || 'clear', vehicle: opts.vehicle || settings[`vehicle${line}`] || 'random', fleet: opts.fleet || null, dirId: opts.dirId || 'A', traffic: opts.traffic || 'medium' };
    if (game.traffic) game.traffic.setDensity(env.traffic);
    if (opts.mode === 'passenger') game.startPassenger({ ...env, vehicle: opts.vehicle || 'random', stopIndex: opts.stopIndex ?? 3 });
    else game.startDriver(env);
    game.lastStart = { ...opts };
    states.go('playing');
    writeSave({ mode: opts.mode, line, ...env, stopIndex: opts.stopIndex });
    if (touchUI) touchUI.setMode(opts.mode);
  };

  const applyQuality = (q) => {
    R.setQuality(q);
    sky.setQuality(q);
    world.setQuality(q);
    game.quality = q;
  };

  const toMenu = () => {
    game.paused = false;
    if (states.state !== 'menu') states.go('menu');
    game.startAttract();
    menu.main();
    if (touchUI) touchUI.setMode('none');
  };

  game.on((type) => {
    if (type === 'pause' && states.state === 'playing') {
      states.go('paused');
      game.paused = true;
      menu.pause({
        onResume: () => { menu.hide(); game.paused = false; states.go('playing'); },
        onMenu: () => { menu.hide(); toMenu(); },
        onRestart: () => { menu.hide(); game.paused = false; states.go('playing'); startMode(game.lastStart); },
        onCamera: () => { menu.hide(); game.paused = false; states.go('playing'); game.cycleCamera(); },
      });
    }
    if (type === 'menu') toMenu();
  });

  // touch controls are created lazily on touch devices
  if (matchMedia('(pointer: coarse)').matches || params.has('touch')) {
    const { TouchControls } = await import('./ui/TouchControls.js');
    touchUI = new TouchControls(uiRoot, input, game);
    touchUI.setMode('none');
    game.touchUI = touchUI;
  }

  menu.main();
  window.__game = {
    game, menu, world, route, scene, camera, renderer: R, sky, audio, THREE, startMode, applyQuality, ready: true, mods: { AIBusDriver, AITramDriver },
    /** Test helper: advance the game deterministically with held keys / one-shot key presses. */
    sim(seconds, { hold = [], press = [] } = {}, dt = 1 / 30) {
      for (const k of press) input.pressed.add(k);
      for (const k of hold) input.keys.add(k);
      for (let t = 0; t < seconds; t += dt) {
        game.update(dt);
        for (const k of press) input.pressed.delete(k);
      }
      for (const k of hold) input.keys.delete(k);
      R.render();
      const b = game.bus;
      return b ? { v: +(b.phys.v * 3.6).toFixed(1), gear: b.phys.selector + b.phys.gear, s: Math.round(b.routeS), next: b.stops.next, off: +b.offRoute.toFixed(1), doors: b.doors.doors.map((d) => d.state[0]).join('') } : null;
    },
  };
  if (params.get('autostart')) menu.hide(), startMode({ mode: params.get('autostart'), dirId: params.get('dir') || 'A', hour: Number(params.get('h') || 10.5), weather: params.get('w') || 'clear', stopIndex: Number(params.get('stop') || 3), vehicle: params.get('veh') || (line === '280' && params.get('autostart') === 'driver' ? 'man' : 'random'), fleet: params.get('fleet') || null });

  // main loop
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
    R.adapt(dt);
    R.render();
  };
  if (!params.has('noloop')) requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && states.state === 'playing') game.emit('pause');
  });
}

/** Studio scene to inspect the bus model against the reference photos. */
async function busStudio({ R, scene, camera, sky, progress }) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  sky.set(Number(params.get('h') || 11), params.get('w') || 'clear');
  // ?veh=man|conecto|procity|yutong|schindler|t6m picks the vehicle type
  const spec = vehicleSpec(params.get('veh') || 'man'), F = frames(spec);
  const bus = spec.create({ fleet: params.get('fleet') || spec.fleets[0].fleet, quality: params.get('q') || 'high', interior: true });
  scene.add(bus.root);
  bus.setDestination(params.get('line') || spec.lines[0], params.get('dest') || 'Студентски град');
  bus.setInteriorText('Следваща спирка:', 'Военна академия');
  const art = Number(params.get('art') || 0);
  // a tram: every section on a straight track, or on a curve of radius ?curve= (metres, + right)
  const placeTram = async (radius) => {
    const { placeSections: place, bogiePoses } = await import('./vehicle/trams/TramDynamics.js');
    const line = {
      at: (s) => (radius ? { x: radius * (1 - Math.cos(s / radius)), z: -radius * Math.sin(s / radius) } : { x: 0, z: -s }),
      y: () => 0,
    };
    const poses = place(spec, line, 0);
    for (const sec of spec.sections) {
      const q = poses[sec.id];
      bus[sec.id].position.set(q.x, q.y, q.z);
      bus[sec.id].rotation.set(q.pitch, q.yaw, 0, 'YXZ');
    }
    bus.placeBogiePoses(bogiePoses(spec, line, 0));
    bus.afterPose();
  };
  const placeSections = (phi) => {
    if (spec.kind === 'tram') return placeTram(phi ? 1 / phi : 0);
    bus.front.position.set(0, 0, 0);
    bus.front.rotation.set(0, 0, 0);
    const hf = new THREE.Vector3(0, 0, F.hitchFront);
    bus.rear.rotation.set(0, spec.articulated ? phi : 0, 0);
    const off = new THREE.Vector3(0, 0, F.hitchRear).applyEuler(bus.rear.rotation);
    bus.rear.position.copy(hf).sub(off);
    bus.afterPose();
  };
  await placeSections(art);
  bus.setSteer(Number(params.get('steer') || 0));
  for (const d of spec.doors) bus.setDoor(d.id, Number(params.get('doors') || 0));
  bus.setLights({ head: true, left: false, interior: 1 });
  // facade test buildings (one per style) for shader inspection
  if (params.has('facades')) {
    const { BuildingBuilder } = await import('./world/Buildings.js');
    const hf = { heightAt: () => 0 };
    const buildings = [];
    for (let k = 0; k < 9; k++) {
      const x0 = -60 + k * 14, z0 = 20;
      buildings.push({ id: k, pts: Float32Array.from([x0, z0, x0 + 12, z0, x0 + 12, z0 + 10, x0, z0 + 10]), holes: [], h: 18 + (k % 3) * 6, minH: 0, style: k, roof: 'flat', inner: null, roofH: 0, levels: 0, part: false, landmark: null });
    }
    const bb = new BuildingBuilder({ world: { buildings, blocks: [] }, hf, quality: 'high' });
    bb.build();
    for (const g of bb.meshes()) scene.add(g);
  }
  progress(1, '');
  document.getElementById('loading').classList.add('hidden');
  const api = {
    THREE, scene, camera, bus, spec, frames: F, sky, renderer: R, placeSections,
    /** tools/bus_lightmap_export.cjs: the bake scene of this bus (Blender light bake). */
    lightmapScene: (size) => exportLightmapScene(bus, size),
    look(x, y, z, tx, ty, tz, fov = 50) {
      camera.fov = fov;
      camera.aspect = R.canvas.clientWidth / R.canvas.clientHeight;
      camera.updateProjectionMatrix();
      camera.position.set(x, y, z);
      camera.lookAt(tx, ty, tz);
      R.setInterior(Math.abs(x) < 1.27 && y > 0.3 && y < 2.9 && z > F.frontZ && z < 13);
      R._gain = null; // stills: no adaptation delay
      sky.follow(new THREE.Vector3(0, 0, 0));
      bus.afterPose();
      R.render();
    },
    ready: true,
  };
  window.__game = api;
  api.look(6, 1.6, -14, 0, 1.4, -6);
}

boot().catch((e) => {
  console.error(e);
  const m = document.getElementById('loadmsg');
  if (m) m.textContent = L(`Грешка: ${e.message}`, `Error: ${e.message}`);
});
