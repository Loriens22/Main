import * as THREE from 'three';
import { Settings } from './Settings';
import { Input } from './Input';
import { bus } from './events';
import { Renderer } from '../render/Renderer';
import { Player } from '../player/Player';
import { Interactions } from '../player/Interaction';
import { initPhysics } from '../physics/Physics';
import { Zone } from '../world/Zone';
import { W } from '../render/patch';

export type GameState = 'loading' | 'menu' | 'playing' | 'paused';
export interface System {
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
}

const H = 1 / 60;
const _g = new THREE.Vector3();

/** Owns the main loop and the active zone; everything else hangs off it as a system. */
export class Game {
  settings = new Settings();
  input: Input;
  renderer: Renderer;
  player = new Player();
  interactions = new Interactions();
  zone: Zone | null = null;
  zones = new Map<string, Zone>();
  systems: System[] = [];
  state: GameState = 'loading';
  /** seconds of unpaused play */
  time = 0;
  private acc = 0;
  private last = 0;
  private frameBudget = 0;
  alpha = 1;
  fps = 60;
  /** when set, this function positions the camera instead of the player's eyes */
  cameraDriver: ((dt: number, alpha: number) => void) | null = null;
  /** blocks gameplay input while a UI panel is open */
  uiFocus = false;
  private switching = false;

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, this.settings);
    this.renderer = new Renderer(canvas, this.settings);
    (window as any).__ibe = this;
  }

  async init() {
    await initPhysics();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  registerZone(z: Zone) { this.zones.set(z.id, z); return z; }

  /** Activate a zone (loading it on first use) with a fade. */
  async gotoZone(id: string, opts: { fade?: boolean; onEnter?: (z: Zone) => void } = {}) {
    if (this.switching) return;
    const z = this.zones.get(id);
    if (!z) throw new Error(`unknown zone ${id}`);
    this.switching = true;
    try {
      if (opts.fade !== false && this.zone) {
        this.renderer.fadeTo(1, 4);
        await wait(380);
      }
      if (!z.loaded) {
        bus.emit('loading', { active: true, label: 'Loading', f: 0 });
        await z.load((f, label) => bus.emit('loading', { active: true, label, f }));
        z.loaded = true;
        bus.emit('loading', { active: false });
      }
      this.zone?.leave();
      this.interactions.clear();
      this.zone = z;
      z.enter();
      opts.onEnter?.(z);
      bus.emit('zone', z);
      this.renderer.fadeTo(0, 1.6);
    } finally {
      this.switching = false;
    }
  }

  setState(s: GameState) {
    if (s === this.state) return;
    this.state = s;
    bus.emit('state', s);
  }

  private frame = (t: number) => {
    requestAnimationFrame(this.frame);
    let dt = (t - this.last) / 1000;
    const cap = this.settings.g.fpsCap;
    if (cap > 0) {
      this.frameBudget += dt;
      this.last = t;
      if (this.frameBudget < 1 / cap - 0.0005) return;
      dt = this.frameBudget;
      this.frameBudget = 0;
    } else this.last = t;
    dt = Math.min(dt, 0.1);
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.tick(dt);
  };

  /** One rendered frame. Exposed so automated tests can drive the game deterministically. */
  tick(dt: number, render = true) {
    this.input.poll(dt);
    this.input.enabled = !this.uiFocus;
    if (this.state === 'playing') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= H && n < 6) {
        this.fixed(H);
        this.acc -= H;
        n++;
      }
      if (n === 6) this.acc = 0;
      this.alpha = this.acc / H;
      this.time += dt;
    }
    this.update(dt);
    if (render) this.renderer.render(dt);
    this.input.endFrame();
  }

  private fixed(dt: number) {
    const z = this.zone;
    if (!z) return;
    z.gravityAt(this.player.pos, _g);
    this.player.gravity.copy(_g);
    this.player.step(dt, this.input);
    z.fixedUpdate(dt);
    for (const s of this.systems) s.fixedUpdate?.(dt);
    z.phys.step(dt);
  }

  private update(dt: number) {
    const z = this.zone;
    W.uSurf.value.w = this.time;
    if (this.state === 'playing') {
      this.player.look(this.input);
      if (this.cameraDriver) this.cameraDriver(dt, this.alpha);
      else this.player.applyCamera(this.renderer.camera, this.alpha, dt);
      this.renderer.camera.updateMatrixWorld();
      this.interactions.update(this.renderer.camera);
      if (this.input.pressed('interact')) this.interactions.use();
    }
    z?.update(dt);
    for (const s of this.systems) s.update?.(dt);
  }

  /** Test hook: simulate `seconds` of play without rendering. */
  advance(seconds: number, render = false) {
    const n = Math.round(seconds / H);
    for (let i = 0; i < n; i++) this.tick(H, render && i === n - 1);
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
