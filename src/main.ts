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
import { LaunchDirector } from './mission/Launch';
import { LaunchPanel } from './ui/panels/LaunchPanel';

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
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset');
  if (preset && preset in PRESETS) game.settings.applyPreset(preset as PresetName);
  game.registerZone(new TestZone(game, 'test'));
  const earth = game.registerZone(new EarthZone(game, 'earth')) as EarthZone;
  const orbit = game.registerZone(new OrbitZone(game, 'orbit')) as OrbitZone;

  if (params.get('zone') === 'orbit') {
    // developer entry: Ranger 1 in Earth orbit near the Endurance (start=gate: aligned at the approach gate; start=far: 4 km out)
    await game.gotoZone('orbit', { fade: false });
    orbit.met = Number(params.get('met') ?? 900);
    const start = params.get('start') ?? 'gate';
    if (start === 'far') orbit.startInRanger(new THREE.Vector3(-4200, -260, 140), new THREE.Vector3(0.4, 0, 0));
    else if (start === 'near') orbit.startInRanger(new THREE.Vector3(-160, 14, 22));
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
