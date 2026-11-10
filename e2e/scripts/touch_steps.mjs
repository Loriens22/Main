// Touch controls: per-mode layouts, sticks, look drag, tap, throttle slider, flight translation (run with TOUCH=1).
const probe = `const t = game.touch, c = game.zone?.craft; return { mode: t.mode, ctx: game.input.context, touch: game.input.touchActive, pmode: game.player.mode,
  pos: game.player.pos.toArray().map((v) => +v.toFixed(2)), yaw: +game.player.yaw.toFixed(3), btns: [...document.querySelectorAll('.touch .btns button, .touch .tbar button')].map((b) => b.textContent).join(' '),
  thr: c ? +c.throttle.toFixed(2) : null, vtol: c ? +c.vtol.toFixed(2) : null, w: c ? c.angVel.toArray().map((v) => +v.toFixed(3)) : null, panel: game.ui.panelOpen };`;
const center = (sel) => `(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; __touch('#game', 'touchstart', 400, 200, 9); __touch('#game', 'touchend', 400, 200, 9); return 1;`, wait: 1500, frames: 20, probe },
  { frames: 2, shot: 'touch_walk', ui: true, probe },
  // left stick forward for one second
  { js: `const [x, y] = ${center('.touch .stick.l')}; __touch('.touch .stick.l', 'touchstart', x, y, 1); __touch('.touch .stick.l', 'touchmove', x, y - 60, 1); return [x, y];`, frames: 30, probe },
  { js: `__touch('.touch .stick.l', 'touchend', 0, 0, 1); return 1;`, frames: 2, probe },
  // look drag (yaw) then a still tap
  { js: `__touch('.touch .look', 'touchstart', 700, 200, 2); __touch('.touch .look', 'touchmove', 640, 200, 2); return 1;`, frames: 2, probe },
  { js: `__touch('.touch .look', 'touchend', 640, 200, 2); return 1;`, frames: 2, probe },
  // space: free-flying Ranger
  { js: `await game.goTo('space', { at: 'orbit' }, { fade: 0 }); return game.zone.id;`, wait: 4000, frames: 10, probe },
  { frames: 2, shot: 'touch_flight', ui: true, probe },
  { js: `const r = document.querySelector('.touch .throttle').getBoundingClientRect(); __touch('.touch .throttle', 'touchstart', r.left + 10, r.top + r.height * 0.5, 3); return 1;`, frames: 3, probe },
  { js: `__touch('.touch .throttle', 'touchend', 0, 0, 3); [...document.querySelectorAll('.touch .btns button')].find((b) => b.textContent === 'CUT').dispatchEvent(new TouchEvent('touchstart', { cancelable: true })); return 1;`, frames: 2, probe },
  { js: `const [x, y] = ${center('.touch .stick.r')}; __touch('.touch .stick.r', 'touchstart', x, y, 4); __touch('.touch .stick.r', 'touchmove', x, y - 70, 4); return 1;`, frames: 30, probe },
  { js: `__touch('.touch .stick.r', 'touchend', 0, 0, 4); const b = [...document.querySelectorAll('.touch .btns button')].find((b) => b.dataset.action === 'yawLeft'); __touch(b, 'touchstart', undefined, undefined, 5); return 1;`, frames: 20, probe },
  { js: `const b = [...document.querySelectorAll('.touch .btns button')].find((b) => b.dataset.action === 'yawLeft'); __touch(b, 'touchend', undefined, undefined, 5); const a = [...document.querySelectorAll('.touch .tbar button')].find((b) => b.dataset.action === 'autopilot'); __touch(a, 'touchstart', undefined, undefined, 6); __touch(a, 'touchend', undefined, undefined, 6); return 1;`, frames: 3, probe },
  { frames: 1, shot: 'touch_autopilot', ui: true, probe },
  { js: `game.ui.closeAllPanels(); await game.goTo('space', { at: 'endurance:hub' }, { fade: 0 }); return game.player.mode;`, wait: 4000, frames: 10, probe },
  { js: `const b = [...document.querySelectorAll('.touch .btns button')].find((b) => b.dataset.action === 'jump'); __touch(b, 'touchstart', undefined, undefined, 7); return 1;`, frames: 20, probe },
  { js: `const b = [...document.querySelectorAll('.touch .btns button')].find((b) => b.dataset.action === 'jump'); __touch(b, 'touchend', undefined, undefined, 7); return 1;`, frames: 2, shot: 'touch_float', ui: true, probe },
];
