import { Game } from './core/Game';
import { TestZone } from './world/TestZone';
import { EarthZone } from './world/earth/EarthZone';

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  await game.init();
  const params = new URLSearchParams(location.search);
  game.registerZone(new TestZone(game, 'test'));
  const earth = game.registerZone(new EarthZone(game, 'earth')) as EarthZone;
  canvas.addEventListener('click', () => game.input.requestPointerLock());
  if (params.get('zone') === 'test' || params.has('model')) {
    await game.gotoZone('test', { fade: false });
    game.setState('playing');
  } else {
    await game.gotoZone('earth', { fade: false });
    game.player.teleport(earth.spawnPoint(), Math.PI);
    game.setState('playing');
  }
  document.getElementById('boot')?.remove();
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + (e?.message || e);
});
