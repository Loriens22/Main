import { Game } from './core/Game';
import { TestZone } from './world/TestZone';

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  await game.init();
  const params = new URLSearchParams(location.search);
  game.registerZone(new TestZone(game, 'test'));
  if (params.has('zone') || params.has('model')) {
    await game.gotoZone('test', { fade: false });
    game.setState('playing');
    canvas.addEventListener('click', () => game.input.requestPointerLock());
  }
  document.getElementById('boot')?.remove();
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Failed to start: ' + (e?.message || e);
});
