import * as THREE from 'three';
import type { ControlSettings } from './Settings';

export type InputContext = 'walk' | 'drive' | 'flight' | 'ui' | 'seat';

/** Actions available per context; resolves key conflicts (e.g. E = interact on foot, roll in flight). */
const CONTEXT_ACTIONS: Record<InputContext, string[]> = {
  walk: ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'sprint', 'interact', 'vehicle', 'view', 'menu', 'computer', 'crew', 'flashlight', 'helmet', 'quickSave', 'quickLoad', 'creative', 'timeWarpUp', 'timeWarpDown', 'drone', 'photo', 'sample'],
  seat: ['interact', 'vehicle', 'view', 'menu', 'computer', 'crew', 'quickSave', 'quickLoad', 'creative', 'cockpitMode', 'timeWarpUp', 'timeWarpDown', 'photo'],
  drive: ['forward', 'back', 'left', 'right', 'brake', 'vehicle', 'view', 'menu', 'computer', 'flashlight', 'quickSave', 'quickLoad', 'creative', 'camera', 'sprint'],
  flight: ['throttleUp', 'throttleDown', 'throttleMax', 'throttleCut', 'pitchDown', 'pitchUp', 'yawLeft', 'yawRight', 'rollLeft', 'rollRight', 'transUp', 'transDown', 'transLeft', 'transRight', 'transFwd', 'transBack', 'sas', 'rcs', 'gear', 'autopilot', 'camera', 'vehicle', 'view', 'menu', 'computer', 'cockpitMode', 'quickSave', 'quickLoad', 'creative', 'timeWarpUp', 'timeWarpDown', 'brake', 'flashlight', 'crew', 'photo', 'sample'],
  ui: ['menu', 'computer'],
};

const PAD: Record<string, number[]> = {
  interact: [0], jump: [0], crouch: [1], vehicle: [2], view: [3], rollLeft: [4], rollRight: [5],
  throttleDown: [6], throttleUp: [7], brake: [6], computer: [8], menu: [9], sprint: [10], crew: [11],
  sas: [12], gear: [13], rcs: [14], autopilot: [15], camera: [3],
};

export class Input {
  context: InputContext = 'walk';
  readonly move = new THREE.Vector2(); // x = right, y = forward (-1..1)
  readonly look = new THREE.Vector2(); // radians this frame (yaw, pitch)
  readonly flight = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, throttle: 0, throttleSet: null as number | null };
  readonly pointer = new THREE.Vector2(); // NDC
  pointerClicked = false;
  /** a quick touch tap on the look area this frame (pointer holds its position) */
  tapped = false;
  wheel = 0;
  locked = false;
  gamepadActive = false;
  touchActive = false;
  private keys = new Set<string>();
  private down = new Set<string>(); // keys pressed this frame
  private up = new Set<string>();
  private padPrev: boolean[] = [];
  private padHeld = new Set<string>();
  private padPressed = new Set<string>();
  private virtHeld = new Set<string>();
  private virtPressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  readonly virtMove = new THREE.Vector2();
  readonly virtLook = new THREE.Vector2();
  readonly virtFlight = { pitch: 0, roll: 0, yaw: 0, throttle: 0, tx: 0, ty: 0, tz: 0, throttleSet: null as number | null };
  private bindingIndex = new Map<string, Set<string>>();

  constructor(private canvas: HTMLCanvasElement, public controls: ControlSettings) {
    this.rebuildBindings();
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (['Tab', 'F5', 'F9', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.down.add(e.code);
      this.keys.add(e.code);
      this.touchActive = false;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.up.add(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (this.locked) this.virtPressed.add('interact');
        else this.pointerClicked = true;
      }
    });
    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    window.addEventListener('gamepadconnected', () => (this.gamepadActive = true));
  }

  rebuildBindings() {
    this.bindingIndex.clear();
    for (const [action, codes] of Object.entries(this.controls.bindings)) {
      this.bindingIndex.set(action, new Set(codes));
    }
  }

  requestLock() {
    if (this.touchActive) return;
    if (document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => {});
      } catch {
        /* not available (e.g. iframe) */
      }
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private active(action: string) {
    return CONTEXT_ACTIONS[this.context].includes(action);
  }

  held(action: string): boolean {
    if (!this.active(action)) return false;
    if (this.padHeld.has(action) || this.virtHeld.has(action)) return true;
    const codes = this.bindingIndex.get(action);
    if (!codes) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  pressed(action: string): boolean {
    if (!this.active(action)) return false;
    if (this.padPressed.has(action) || this.virtPressed.has(action)) return true;
    const codes = this.bindingIndex.get(action);
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Raw key query (ignores context), used by debug tools. */
  key(code: string) {
    return this.keys.has(code);
  }

  /** Virtual (touch / UI) actions. */
  virtualPress(action: string) {
    this.virtPressed.add(action);
  }
  virtualHold(action: string, on: boolean) {
    if (on) this.virtHeld.add(action);
    else this.virtHeld.delete(action);
  }

  /** Called once per frame before game update. */
  poll(dt: number) {
    const sens = 0.0022 * this.controls.mouseSensitivity;
    const inv = this.controls.invertY ? -1 : 1;
    this.look.set(-this.mouseDX * sens, -this.mouseDY * sens * inv);
    this.mouseDX = this.mouseDY = 0;

    // gamepad
    this.padHeld.clear();
    this.padPressed.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    let lx = 0, ly = 0, rx = 0, ry = 0, lt = 0, rt = 0;
    if (gp) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      lx = dz(gp.axes[0] ?? 0);
      ly = dz(gp.axes[1] ?? 0);
      rx = dz(gp.axes[2] ?? 0);
      ry = dz(gp.axes[3] ?? 0);
      lt = gp.buttons[6]?.value ?? 0;
      rt = gp.buttons[7]?.value ?? 0;
      const btn = gp.buttons.map((b) => b.pressed);
      for (const [action, idxs] of Object.entries(PAD)) {
        for (const i of idxs) {
          if (btn[i]) this.padHeld.add(action);
          if (btn[i] && !this.padPrev[i]) this.padPressed.add(action);
        }
      }
      if (btn.some((b) => b) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0) this.gamepadActive = true;
      this.padPrev = btn;
      const gs = 2.6 * this.controls.gamepadSensitivity * dt;
      this.look.x += -rx * gs;
      this.look.y += -ry * gs * inv;
    }
    // touch look
    if (this.virtLook.lengthSq() > 0) {
      this.look.x += this.virtLook.x;
      this.look.y += this.virtLook.y;
      this.virtLook.set(0, 0);
    }

    // movement axes
    const k = (a: string) => (this.held(a) ? 1 : 0);
    if (this.context === 'walk' || this.context === 'drive') {
      this.move.set(k('right') - k('left'), k('forward') - k('back'));
      if (gp) {
        this.move.x += lx;
        this.move.y += -ly;
        if (this.context === 'drive') this.move.y += rt - lt;
      }
      if (this.virtMove.lengthSq() > 0) this.move.add(this.virtMove);
      if (this.move.lengthSq() > 1) this.move.normalize();
    } else this.move.set(0, 0);

    // flight axes
    const f = this.flight;
    if (this.context === 'flight') {
      const ip = this.controls.invertFlightPitch ? -1 : 1;
      f.pitch = (k('pitchUp') - k('pitchDown')) * ip;
      f.yaw = k('yawLeft') - k('yawRight');
      f.roll = k('rollRight') - k('rollLeft');
      f.tx = k('transRight') - k('transLeft');
      f.ty = k('transUp') - k('transDown');
      f.tz = k('transFwd') - k('transBack');
      f.throttle = k('throttleUp') - k('throttleDown');
      if (gp) {
        f.pitch += ly * ip;
        f.roll += lx;
        f.yaw += -rx;
        f.ty += -ry;
        f.throttle += rt - lt;
      }
      f.pitch += this.virtFlight.pitch;
      f.roll += this.virtFlight.roll;
      f.yaw += this.virtFlight.yaw;
      f.throttle += this.virtFlight.throttle;
      f.tx += this.virtFlight.tx;
      f.ty += this.virtFlight.ty;
      f.tz += this.virtFlight.tz;
      for (const key of ['pitch', 'yaw', 'roll', 'tx', 'ty', 'tz', 'throttle'] as const) f[key] = THREE.MathUtils.clamp(f[key], -1, 1);
      f.throttleSet = this.virtFlight.throttleSet;
    } else {
      f.pitch = f.yaw = f.roll = f.tx = f.ty = f.tz = f.throttle = 0;
      f.throttleSet = null;
    }
    this.virtFlight.throttleSet = null;
  }

  /** Called at frame end. */
  endFrame() {
    this.down.clear();
    this.up.clear();
    this.virtPressed.clear();
    this.pointerClicked = false;
    this.tapped = false;
    this.wheel = 0;
  }
}
