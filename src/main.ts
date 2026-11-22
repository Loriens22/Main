import { Game } from './core/Game';
import { TestZone } from './world/TestZone';
import { EarthZone } from './world/earth/EarthZone';
import { FarmIntro } from './world/earth/Intro';
import { Driving } from './vehicles/Driving';
import { Flight } from './vehicles/Flight';
import { mountUI } from './ui/App';
import { registerPanel, ui } from './ui/store';
import { FarmPanel } from './ui/panels/FarmPanel';
import { DialoguePanel } from './ui/panels/DialoguePanel';
import { MissionPanel } from './ui/panels/MissionPanel';
import { mission } from './mission/Mission';
import { Conversation } from './npc/Dialogue';
import { story } from './core/Story';
import { AudioEngine } from './audio/Audio';
import { bus } from './core/events';
import { PRESETS, PresetName } from './core/Settings';
import { OrbitZone } from './world/space/OrbitZone';
import { DockingPanel } from './ui/panels/DockingPanel';
import * as THREE from 'three';
import { parkingOverride } from './space/Bodies';
import { RAPIER } from './physics/Physics';
import type { NPC } from './npc/NPC';
import { LaunchDirector } from './mission/Launch';
import { LaunchPanel } from './ui/panels/LaunchPanel';
import { EnduranceZone } from './world/space/EnduranceZone';
import { ViewerZone } from './world/space/ViewerZone';
import { ShipPanel } from './ui/panels/ShipPanel';
import { CryoPanel } from './ui/panels/CryoPanel';
import { SurfacePanel } from './ui/panels/SurfacePanel';
import { ReaderPanel } from './ui/panels/ReaderPanel';
import { CodexPanel } from './ui/panels/CodexPanel';
import { assets } from './render/Assets';
import { Creature } from './life/Creature';
import { SPECIES } from './life/species';
import { BRAINS } from './life/brains';
import { codex } from './life/Codex';
import { SurfaceZone } from './world/space/SurfaceZone';
import { state, surfacePoint } from './space/Ephemeris';

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  mountUI(game);
  document.getElementById('boot')?.remove();
  const driving = new Driving(game);
  game.services.driving = driving;
  game.systems.push(driving);
  const flight = new Flight(game);
  game.services.flight = flight;
  game.systems.push(flight);
  registerPanel('farm', FarmPanel);
  registerPanel('dialogue', DialoguePanel);
  registerPanel('mission', MissionPanel);
  registerPanel('docking', DockingPanel);
  registerPanel('launch', LaunchPanel);
  registerPanel('ship', ShipPanel);
  registerPanel('cryo', CryoPanel);
  registerPanel('surfaceops', SurfacePanel);
  registerPanel('reader', ReaderPanel);
  registerPanel('codex', CodexPanel);
  bus.on('key:codex', () => {
    if (ui.get().panel === 'codex') { bus.emit('ui:closePanel'); return; }
    const body = (game.zone as any)?.body?.id;
    game.openPanel('codex', { planet: body === 'mars' || body === 'jupiter' ? body : 'miller' });
  });
  const launch = new LaunchDirector(game);
  game.services.launch = launch;
  game.systems.push(launch);
  game.services.mission = mission;
  game.systems.push({ update: (dt) => mission.update(dt) });
  game.services.dialogue = new Conversation(game);
  game.services.story = story;
  const audio = new AudioEngine(game);
  game.services.audio = audio;
  game.systems.push(audio);
  await game.init();
  // the out-of-the-world guards (Player, WheeledVehicle) say what happened
  bus.on('player:rescued', () => ui.toast('Back on solid ground', 'info', 2.5));
  bus.on('vehicle:rescued', () => ui.toast('Vehicle put back on solid ground', 'info', 2.5));
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset');
  if (preset && preset in PRESETS) game.settings.applyPreset(preset as PresetName);
  game.registerZone(new TestZone(game, 'test'));
  const earth = game.registerZone(new EarthZone(game, 'earth')) as EarthZone;
  const orbit = game.registerZone(new OrbitZone(game, 'orbit')) as OrbitZone;
  game.registerZone(new EnduranceZone(game, 'endurance'));
  const surface = game.registerZone(new SurfaceZone(game, 'surface')) as SurfaceZone;
  const viewer = game.registerZone(new ViewerZone(game, 'viewer')) as ViewerZone;
  if (import.meta.env.DEV) Object.assign(window as any, { __life: { Creature, SPECIES, BRAINS, assets, codex }, __codex: codex, __THREE: THREE, __RAPIER: RAPIER, __parkOv: (b: { id: string; surveyAlt?: number }) => { if (b.surveyAlt) parkingOverride[b.id] = b.surveyAlt; } });   // test scripts

  if (params.get('zone') === 'viewer') {
    // developer entry: look at any body from space (appearance checks)
    const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
    viewer.body = params.get('body') ?? 'mars';
    await game.gotoZone('viewer', { fade: false });
    viewer.setTarget(viewer.body, num('dist', 3), num('az', 30), num('el', 10), params.has('jd') ? num('jd', 0) : undefined);
    viewer.fov = num('fov', 40);
    game.setState('playing');
    return;
  }

  if (params.get('zone') === 'endurance') {
    // developer entry: Ranger 1 docked at the forward port, the commander unbuckled in its cabin (or start=hub)
    await game.gotoZone('orbit', { fade: false });
    orbit.met = 1800;
    if (params.has('body')) orbit.setBody(params.get('body')!);
    orbit.startInRanger(new THREE.Vector3(-60, 0, 0));
    orbit.docking.attachNow(orbit.ranger!, orbit.endurance.port('axial_fwd')!);
    // the crew of three in their Ranger seats, as after the launch
    const crew: NPC[] = [];
    for (const [id, name, role, look] of [
      ['reyes', 'Tomas Reyes', 'Flight Systems Engineer', { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_black', skin: 'skin', scale: 1.01 }],
      ['hartmann', 'Dr. Lena Hartmann', 'Mission & Medical Specialist', { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_blond', skin: 'skin', scale: 0.97, width: 0.94 }],
      ['okoye', 'Dr. Imani Okoye', 'Planetary Scientist', { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_black', skin: 'skin_dark', scale: 0.95, width: 0.93 }],
    ] as [string, string, string, any][]) crew.push(await orbit.npcs.spawn({ id, name, role, model: 'char_civilian', look }, new THREE.Vector3(), 0));
    orbit.seatCrew(crew, [['reyes', 'pilot_r'], ['hartmann', 'crew_l'], ['okoye', 'crew_r']]);
    await game.preload('endurance');
    game.setState('playing');
    // settle the docked pose and the seat camera before unbuckling, as after a real docking
    for (let k = 0; k < 30; k++) game.tick(1 / 60, k === 29);
    const f = game.services.flight;
    f.leave(true);
    await new Promise((res) => { const t = setInterval(() => { if (game.zone?.id === 'endurance') { clearInterval(t); res(null); } }, 50); });
    if (ui.get().mode === 'cinematic') ui.set({ mode: 'foot' });
    if (params.get('start') === 'hub') {
      const ez = game.zones.get('endurance') as EnduranceZone;
      ez.ports[0] && ez.setHatches(ez.ports[0], true);
      const sp = ez.int.marker('spawn', 'hub');
      if (sp) game.player.teleport(sp.node.getWorldPosition(new THREE.Vector3()), 0);
    }
    return;
  }

  if (params.get('zone') === 'surface') {
    // developer entry: standing beside Ranger 1 on the pad of a world (body=moon|mars|miller|mann|edmunds)
    await game.gotoZone('orbit', { fade: false });
    orbit.met = 3600;
    orbit.setBody(params.get('body') ?? 'moon');
    if (params.has('sun')) {
      // advance the clock to the first time the Sun stands at this elevation (deg) over the site, rising
      const want = Number(params.get('sun')) * Math.PI / 180, b = orbit.body, L = b.landing!;
      const elev = (met: number) => {
        const jd = orbit.jd0 + met / 86400;
        const rel = surfacePoint(b.id, L.lat, L.lon, jd), bp = state(b.id, jd).r;
        const site = [bp[0] + rel[0], bp[1] + rel[1], bp[2] + rel[2]];
        const up = rel.map((x) => x / Math.hypot(...rel)), toSun = site.map((x) => -x / Math.hypot(...site));
        return Math.asin(up[0] * toSun[0] + up[1] * toSun[1] + up[2] * toSun[2]);
      };
      const step = Math.max(600, Math.abs(b.rotation) / 400);
      for (let m = orbit.met, k = 0; k < 4000; k++, m += step) if (elev(m) < want && elev(m + step) >= want) { orbit.met = m + step; break; }
      orbit.setBody(b.id);
    }
    // Ranger 1 is down on the pad: in the orbit zone it is out of the picture until the ascent hands it back
    orbit.ranger!.setCarried(true);
    orbit.ranger!.root.visible = false;
    await game.gotoZone('surface', { fade: false, onEnter: (z) => { const s = z as SurfaceZone; s.setBody(orbit.body.id); s.landed = true; } });
    game.setState('playing');
    if (params.get('start') !== 'seat') {
      game.player.suited = true;
      game.player.teleport(new THREE.Vector3(9, 2, 9), 2.3);
      ui.set({ mode: 'foot' });
    } else surface.board();
    return;
  }

  if (params.get('zone') === 'orbit') {
    // developer entry: Ranger 1 in Earth orbit near the Endurance (start=gate: aligned at the approach gate; start=far: 4 km out)
    await game.gotoZone('orbit', { fade: false });
    orbit.met = Number(params.get('met') ?? 900);
    if (params.has('body')) orbit.setBody(params.get('body')!);
    const start = params.get('start') ?? 'gate';
    if (start === 'far') orbit.startInRanger(new THREE.Vector3(-4200, -260, 140), new THREE.Vector3(0.4, 0, 0));
    else if (start === 'near') orbit.startInRanger(new THREE.Vector3(-160, 14, 22));
    else if (start === 'stage') orbit.startInRanger(new THREE.Vector3(-300, 0, 0));
    else orbit.startInRanger(new THREE.Vector3(-57.6, 0, 0), new THREE.Vector3(), 'tail');
    game.setState('playing');
    return;
  }

  if (params.get('zone') === 'test' || params.has('model') || params.has('craft')) {
    await game.gotoZone('test', { fade: false });
    game.setState('playing');
    ui.set({ mode: 'foot' });
    return;
  }
  await game.gotoZone('earth', { fade: false });
  game.player.teleport(earth.spawnPoint(), 0);
  if (params.has('skipintro')) {
    game.setState('playing');
    ui.set({ mode: 'foot' });
    return;
  }
  // cinematic opening behind the main menu
  const intro = new FarmIntro(game, earth);
  game.cameraDriver = intro.driver;
  game.setState('menu');
  setTimeout(() => ui.set({ menuReady: true }), 4500);
  bus.on('ui:start', () => {
    game.input.requestPointerLock();
    intro.begin(() => {
      game.setState('playing');
      ui.set({ mode: 'foot' });
      ui.toast('Creative Mode. The pickup by the porch has the route to the NASA facility.', 'info', 7);
    });
  });
}

boot().catch((e) => {
  console.error(e);
  ui.set({ loading: { active: true, label: 'Failed to start: ' + (e?.message || e), f: 0 } });
});
