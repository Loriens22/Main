import { Game } from './core/Game';

function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webgl2Available()) {
  document.body.innerHTML =
    '<div style="color:#ddd;font-family:sans-serif;padding:40px;line-height:1.6">Interstellar: Beyond Endurance needs a browser with WebGL2 support.</div>';
} else {
  const game = new Game();
  game.init().catch((e) => {
    console.error(e);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;color:#eee;background:#000;padding:40px;font-family:monospace;z-index:999;white-space:pre-wrap';
    d.textContent = 'Failed to start:\n' + (e?.stack ?? e);
    document.body.append(d);
  });
}
