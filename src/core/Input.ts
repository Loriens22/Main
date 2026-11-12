import { Settings } from './Settings';
import { clamp } from './math';

/**
 * Unified input: keyboard + mouse (pointer lock), gamepad and virtual (touch) controls all feed
 * the same named actions and axes, so gameplay code never looks at devices directly.
 */
export class Input {
  private keys = new Set<string>();
  private pressedNow = new Set<string>();
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();
  private virtualAxes: Record<string, number> = {};
  private padAxes: Record<string, number> = {};
  private padDown = new Set<string>();
  private padPrev = new Set<string>();
  lookX = 0; // accumulated look delta (radians) since last consume
  lookY = 0;
  wheel = 0;
  pointerLocked = false;
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  mouseX = 0;
  mouseY = 0;
  enabled = true;
  usingTouch = false;
  usingGamepad = false;
  private rebindCb: ((code: string) => void) | null = null;

  constructor(private canvas: HTMLElement, private settings: Settings) {
    window.addEventListener('keydown', (e) => {
      if (this.rebindCb) {
        e.preventDefault();
        const cb = this.rebindCb;
        this.rebindCb = null;
        cb(e.code);
        return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (!e.repeat) this.pressedNow.add(e.code);
      this.keys.add(e.code);
      if (this.pointerLocked || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = [false, false, false]; });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (!this.pointerLocked) return;
      const s = 0.0022 * this.settings.c.mouseSensitivity;
      this.lookX += clamp(e.movementX, -400, 400) * s;
      this.lookY += clamp(e.movementY, -400, 400) * s * (this.settings.c.invertY ? -1 : 1);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => { this.mouseDown[e.button] = false; });
    this.canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('touchstart', () => { this.usingTouch = true; }, { passive: true });
  }

  requestPointerLock() {
    if (this.usingTouch) return;
    const p = (this.canvas as any).requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Capture the next key press (settings screen). */
  captureKey(cb: (code: string) => void) { this.rebindCb = cb; }

  private codes(action: string): string[] {
    return this.settings.c.bindings[action] || [];
  }

  down(action: string): boolean {
    if (!this.enabled) return false;
    if (this.virtualDown.has(action) || this.padDown.has(action)) return true;
    for (const c of this.codes(action)) if (this.keys.has(c)) return true;
    return false;
  }

  pressed(action: string): boolean {
    if (!this.enabled) return false;
    if (this.virtualPressed.has(action)) return true;
    if (this.padDown.has(action) && !this.padPrev.has(action)) return true;
    for (const c of this.codes(action)) if (this.pressedNow.has(c)) return true;
    return false;
  }

  keyPressed(code: string) { return this.enabled && this.pressedNow.has(code); }
  keyDown(code: string) { return this.enabled && this.keys.has(code); }

  /** -1..1 from two opposing actions plus analog sources. */
  axis(neg: string, pos: string, analog?: string): number {
    if (!this.enabled) return 0;
    let v = (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0);
    if (analog) v += (this.virtualAxes[analog] || 0) + (this.padAxes[analog] || 0);
    return clamp(v, -1, 1);
  }

  analog(name: string): number {
    return clamp((this.virtualAxes[name] || 0) + (this.padAxes[name] || 0), -1, 1);
  }

  // -- virtual (touch UI) feeds
  setVirtualAxis(name: string, v: number) { this.virtualAxes[name] = v; }
  setVirtualDown(action: string, isDown: boolean) {
    if (isDown) {
      if (!this.virtualDown.has(action)) this.virtualPressed.add(action);
      this.virtualDown.add(action);
    } else this.virtualDown.delete(action);
  }
  tapVirtual(action: string) { this.virtualPressed.add(action); }
  addLook(dx: number, dy: number) { this.lookX += dx; this.lookY += dy; }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  /** Poll gamepad. Call once per frame before gameplay reads input. */
  poll(dt: number) {
    this.padPrev = new Set(this.padDown);
    this.padDown.clear();
    this.padAxes = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (lx || ly || rx || ry || p.buttons.some((b) => b.pressed)) this.usingGamepad = true;
      this.padAxes.moveX = lx;
      this.padAxes.moveY = -ly;
      this.padAxes.lookPadX = rx;
      this.padAxes.lookPadY = ry;
      const s = 2.6 * this.settings.c.gamepadSensitivity * dt;
      this.lookX += rx * Math.abs(rx) * s;
      this.lookY += ry * Math.abs(ry) * s * (this.settings.c.invertY ? -1 : 1);
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const map: Record<number, string> = { 0: 'jump', 1: 'crouch', 2: 'interact', 3: 'exit', 4: 'rollLeft', 5: 'rollRight', 8: 'computer', 9: 'menu', 10: 'sprint', 11: 'camera', 12: 'throttleUp', 13: 'throttleDown', 14: 'crew', 15: 'creative' };
      for (const k in map) if (b(+k)) this.padDown.add(map[k]);
      this.padAxes.trigL = p.buttons[6]?.value || 0;
      this.padAxes.trigR = p.buttons[7]?.value || 0;
      if (b(0)) { this.padDown.add('brake'); this.padDown.add('vtol'); }
      break;
    }
  }

  /** Clear one-frame state. Call at the end of each frame. */
  endFrame() {
    this.pressedNow.clear();
    this.virtualPressed.clear();
    this.mousePressed = [false, false, false];
    this.wheel = 0;
  }
}
