// Unified input: keyboard + mouse (pointer lock) on desktop, virtual joystick
// + look-drag + buttons on touch devices. Game code reads actions and axes
// from here and never touches DOM events directly.

import { G, settings } from '../core/context.js';

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  interact: ['KeyE'],
  drop: ['KeyQ'],
  camera: ['KeyV'],
  wave: ['KeyG'],
  sit: ['KeyX'],
  fly: ['KeyF'],
  list: ['Tab'],
  delete: ['Delete'],
  undo: ['KeyZ'],
  help: ['F1'],
  fps: ['F3'],
  talk: ['KeyT'],
  photo: ['KeyP'],
  dance: ['KeyB'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.mdx = 0; this.mdy = 0;
    this.wheel = 0;
    this.mouseButtons = new Set();
    this.clicked = new Set();
    this.enabled = true;       // false while typing / in menus
    this.locked = false;
    this.touch = { active: false, joy: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, sprint: false, buttons: new Set(), pressed: new Set() };
    this.listeners = {};
    this._bindDesktop();
  }

  on(action, fn) { (this.listeners[action] || (this.listeners[action] = [])).push(fn); }
  emit(action, e) { for (const fn of this.listeners[action] || []) fn(e); }

  _actionFor(code) {
    for (const a in BINDINGS) if (BINDINGS[a].includes(code)) return a;
    return null;
  }

  _bindDesktop() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (typing) return;
      if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Enter') { this.emit('enter', e); return; }
      if (e.code === 'Escape') { this.emit('escape', e); return; }
      if (e.code === 'Slash') { e.preventDefault(); this.emit('slash', e); return; }
      if (!this.down.has(e.code)) {
        const a = this._actionFor(e.code);
        if (a) { this.pressedSet.add(a); if (this.enabled || a === 'list' || a === 'help') this.emit(a, e); }
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouseButtons.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX || 0; this.mdy += e.movementY || 0;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (G.isTouch) return;
      if (!this.locked && this.enabled && !G.paused) { this.requestLock(); return; }
      this.mouseButtons.add(e.button); this.clicked.add(e.button);
      if (this.locked) this.emit('mouse' + e.button, e);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.emit('lockchange', this.locked);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (G.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ---------------- Touch ----------------
  enableTouch(root) {
    G.isTouch = true;
    document.body.classList.add('touch');
    root.classList.remove('hidden');
    const joyZone = root.querySelector('#joy-zone');
    const base = root.querySelector('#joy-base');
    const knob = root.querySelector('#joy-knob');
    const look = root.querySelector('#look-zone');
    const T = this.touch;
    let joyId = null, joyCenter = null;
    const R = 56;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    joyZone.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;
      joyId = e.pointerId;
      joyZone.setPointerCapture(e.pointerId);
      const r = base.getBoundingClientRect();
      // Floating joystick: recentre under the finger if touching outside the base.
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(e.clientX - cx, e.clientY - cy) > r.width) {
        base.style.left = (e.clientX - r.width / 2) + 'px';
        base.style.bottom = (window.innerHeight - e.clientY - r.height / 2) + 'px';
        const r2 = base.getBoundingClientRect();
        joyCenter = { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
      } else joyCenter = { x: cx, y: cy };
      T.active = true;
      e.preventDefault();
    });
    const joyMove = (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y;
      const d = Math.hypot(dx, dy);
      const over = d > R * 1.25;
      if (d > R) { dx *= R / d; dy *= R / d; }
      setKnob(dx, dy);
      T.joy.x = dx / R; T.joy.y = -dy / R;
      T.sprint = over || T.sprintToggle;
      base.classList.toggle('sprint', T.sprint);
      e.preventDefault();
    };
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null; T.joy.x = 0; T.joy.y = 0; T.sprint = !!T.sprintToggle; setKnob(0, 0);
      base.classList.remove('sprint');
      base.style.left = ''; base.style.bottom = '';
    };
    joyZone.addEventListener('pointermove', joyMove);
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);
    // Look: drag anywhere on the right side.
    const lookIds = new Map();
    look.addEventListener('pointerdown', (e) => {
      look.setPointerCapture(e.pointerId);
      lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY });
      e.preventDefault();
    });
    look.addEventListener('pointermove', (e) => {
      const p = lookIds.get(e.pointerId);
      if (!p) return;
      T.lookDX += (e.clientX - p.x); T.lookDY += (e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
      e.preventDefault();
    });
    const lookEnd = (e) => {
      const p = lookIds.get(e.pointerId);
      if (p && performance.now() - p.t < 220 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10) this.emit('tap', e);
      lookIds.delete(e.pointerId);
    };
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);
    // Buttons.
    const btn = (id, action, hold = true) => {
      const el = root.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        T.buttons.add(action); T.pressed.add(action);
        this.pressedSet.add(action);
        this.emit(action, e);
        if (hold) el.classList.add('on');
      });
      const up = (e) => { T.buttons.delete(action); if (hold) el.classList.remove('on'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    btn('tb-jump', 'jump');
    btn('tb-crouch', 'crouch');
    btn('tb-use', 'interact', false);
    btn('tb-wave', 'wave', false);
    btn('tb-sit', 'sit', false);
    const sprintBtn = root.querySelector('#tb-sprint');
    sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      T.sprintToggle = !T.sprintToggle; T.sprint = T.sprintToggle;
      sprintBtn.classList.toggle('on', T.sprintToggle);
    });
  }

  // ---------------- Queries ----------------
  held(action) {
    if (!this.enabled) return false;
    if (this.touch.buttons.has(action)) return true;
    const codes = BINDINGS[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  pressed(action) { return this.enabled && this.pressedSet.has(action); }

  moveAxes() {
    if (!this.enabled) return { x: 0, y: 0, sprint: false };
    let x = 0, y = 0;
    if (this.held('forward')) y += 1;
    if (this.held('back')) y -= 1;
    if (this.held('right')) x += 1;
    if (this.held('left')) x -= 1;
    const tj = this.touch.joy;
    if (Math.abs(tj.x) > 0.08 || Math.abs(tj.y) > 0.08) { x += tj.x; y += tj.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, sprint: this.held('sprint') || this.touch.sprint };
  }

  lookDelta() {
    const s = settings.sensitivity;
    let dx = this.mdx * 0.0022 * s, dy = this.mdy * 0.0022 * s;
    dx += this.touch.lookDX * 0.0055 * s; dy += this.touch.lookDY * 0.0055 * s;
    if (settings.invertY) dy = -dy;
    return { dx, dy };
  }

  endFrame() {
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.touch.lookDX = 0; this.touch.lookDY = 0;
    this.pressedSet.clear(); this.clicked.clear(); this.touch.pressed.clear();
  }
}
