// Unified input: keyboard, mouse look, gamepad and the on-screen touch
// controls (which write into the same state object).
import { clamp } from '../core/math.js';

export const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.state = { throttle: 0, brake: 0, steer: 0, lookX: 0, lookY: 0, moveX: 0, moveY: 0, run: false };
    this.touch = { active: false, steer: null, throttle: 0, brake: 0, moveX: 0, moveY: 0 };
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.steerAxis = 0;
    this.gyro = { enabled: false, beta0: null, value: 0 };
    this.sensitivity = 1;
    this.invertY = false;
    this.dragging = false;
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      } else if (this.dragging) {
        this.look.dx += e.clientX - this.lastX;
        this.look.dy += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.look.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  down(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True once per key press. */
  hit(code) {
    return this.pressed.has(code);
  }

  enableGyro(on) {
    this.gyro.enabled = on;
    this.gyro.beta0 = null; // re-centre on the current hold
    // iOS asks for motion permission; this must run inside a user gesture (the settings toggle)
    const DOE = window.DeviceOrientationEvent;
    if (on && DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().catch(() => {});
    if (on && !this._gyroBound) {
      this._gyroBound = true;
      window.addEventListener('deviceorientation', (e) => {
        if (!this.gyro.enabled || e.beta == null) return;
        // landscape: tilting the phone like a wheel changes beta
        const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
        const v = (angle === 90 ? -1 : 1) * e.beta;
        if (this.gyro.beta0 == null) this.gyro.beta0 = v;
        this.gyro.value = clamp((v - this.gyro.beta0) / 35, -1, 1);
      });
    }
  }

  /** Builds the analogue control state for this frame. */
  poll(dt) {
    const s = this.state;
    // keyboard: ramped pedals and self-centring steering
    const kThr = this.down(KEYMAP.throttle) ? 1 : 0;
    const kBrk = this.down(KEYMAP.brake) ? 1 : 0;
    const shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let thr = kThr ? Math.min(1, (s._kThr || 0) + dt * (shift ? 3 : 1.4)) : 0;
    let brk = kBrk ? Math.min(1, (s._kBrk || 0) + dt * (shift ? 4 : 1.6)) : 0;
    s._kThr = thr;
    s._kBrk = brk;
    const kl = this.down(KEYMAP.left) ? 1 : 0, kr = this.down(KEYMAP.right) ? 1 : 0;
    if (kl || kr) this.steerAxis = clamp(this.steerAxis + (kl - kr) * dt * 1.1, -1, 1);
    else this.steerAxis -= Math.sign(this.steerAxis) * Math.min(Math.abs(this.steerAxis), dt * 1.6);
    let steer = this.steerAxis;
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.08) steer = -ax;
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      thr = Math.max(thr, rt);
      brk = Math.max(brk, lt);
      if (Math.abs(gp.axes[2] || 0) > 0.1) this.look.dx += gp.axes[2] * 8;
      if (Math.abs(gp.axes[3] || 0) > 0.1) this.look.dy += gp.axes[3] * 8;
      s.moveX = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : s.moveX;
      s.moveY = Math.abs(gp.axes[1]) > 0.15 ? -gp.axes[1] : s.moveY;
      this.gamepadButtons = gp.buttons.map((b) => b.pressed);
    }
    // touch
    if (this.touch.active) {
      if (this.touch.steer != null) steer = this.touch.steer;
      thr = Math.max(thr, this.touch.throttle);
      brk = Math.max(brk, this.touch.brake);
    }
    if (this.gyro.enabled) steer = -this.gyro.value;
    s.throttle = thr;
    s.brake = brk;
    s.steer = steer;
    // walking (passenger)
    const fw = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const st = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    s.moveX = this.touch.active && (this.touch.moveX || this.touch.moveY) ? this.touch.moveX : st;
    s.moveY = this.touch.active && (this.touch.moveX || this.touch.moveY) ? this.touch.moveY : fw;
    s.run = shift;
    s.lookX = this.look.dx * 0.0032 * this.sensitivity;
    s.lookY = this.look.dy * 0.0032 * this.sensitivity * (this.invertY ? -1 : 1);
    s.zoom = this.look.zoom;
    this.look.dx = 0;
    this.look.dy = 0;
    this.look.zoom = 0;
    return s;
  }

  endFrame() {
    this.pressed.clear();
  }
}
