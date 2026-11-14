import { Game } from './core/Game';
import { TestZone } from './world/TestZone';
import { EarthZone } from './world/earth/EarthZone';
import { FarmIntro } from './world/earth/Intro';
import { Driving } from './vehicles/Driving';
import { mountUI } from './ui/App';
import { registerPanel, ui } from './ui/store';
import { FarmPanel } from './ui/panels/FarmPanel';
import { DialoguePanel } from './ui/panels/DialoguePanel';
import { Conversation } from './npc/Dialogue';
import { story } from './core/Story';
import { bus } from './core/events';
import { PRESETS, PresetName } from './core/Settings';

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  mountUI(game);
  document.getElementById('boot')?.remove();
  const driving = new Driving(game);
  game.services.driving = driving;
  game.systems.push(driving);
  registerPanel('farm', FarmPanel);
  registerPanel('dialogue', DialoguePanel);
  game.services.dialogue = new Conversation(game);
  game.services.story = story;
  await game.init();
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset');
  if (preset && preset in PRESETS) game.settings.applyPreset(preset as PresetName);
  game.registerZone(new TestZone(game, 'test'));
  const earth = game.registerZone(new EarthZone(game, 'earth')) as EarthZone;

  if (params.get('zone') === 'test' || params.has('model')) {
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
