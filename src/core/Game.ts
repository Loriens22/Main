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
import { ui } from '../ui/store';

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
  private expectUnlock = false;
  private hudTimer = 0;
  /** named services registered by gameplay modules (clock, crew, audio, save...) */
  services: Record<string, any> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, this.settings);
    this.renderer = new Renderer(canvas, this.settings);
    (window as any).__ibe = this;
    bus.on('loading', (l: any) => ui.set({ loading: { active: !!l.active, label: l.label ?? '', f: l.f ?? 0 } }));
    bus.on('ui:pause', () => this.pause());
    bus.on('ui:resume', () => this.resume());
    bus.on('ui:closePanel', () => this.closePanel());
    bus.on('ui:panel', (id: string) => this.openPanel(id));
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) return;
      if (this.expectUnlock) { this.expectUnlock = false; return; }
      if (this.state === 'playing' && !this.uiFocus && !this.input.usingTouch) this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (ui.get().panel) this.closePanel();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'playing' && !document.pointerLockElement) this.pause();
    });
    canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.uiFocus) this.input.requestPointerLock(); });
    window.addEventListener('touchstart', () => ui.set({ touch: true }), { passive: true, once: true });
  }

  async init() {
    await initPhysics();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  registerZone(z: Zone) { this.zones.set(z.id, z); return z; }

  /** Load a zone in the background so a later switch is instant. */
  async preload(id: string) {
    const z = this.zones.get(id);
    if (!z || z.loaded) return;
    if ((z as any).__loading) return (z as any).__loading;
    (z as any).__loading = z.load().then(() => { z.loaded = true; });
    return (z as any).__loading;
  }

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
      this.interactions.scope = id;
      this.interactions.current = null;
      if (!z.loaded && (z as any).__loading) await (z as any).__loading;
      if (!z.loaded) {
        bus.emit('loading', { active: true, label: 'Loading', f: 0 });
        await z.load((f, label) => bus.emit('loading', { active: true, label, f }));
        z.loaded = true;
        bus.emit('loading', { active: false });
      }
      this.zone?.leave();
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
    ui.set({ screen: s === 'menu' ? 'menu' : s === 'paused' ? 'pause' : s === 'loading' ? 'boot' : 'none' });
    bus.emit('state', s);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.expectUnlock = true;
    this.input.exitPointerLock();
    this.setState('paused');
    setTimeout(() => (this.expectUnlock = false), 100);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    if (!ui.get().panel) this.input.requestPointerLock();
  }

  openPanel(id: string, props: any = null) {
    if (this.state !== 'playing') return;
    this.uiFocus = true;
    this.expectUnlock = true;
    this.input.exitPointerLock();
    ui.openPanel(id, props);
    bus.emit('sfx', { id: 'ui_open' });
    setTimeout(() => (this.expectUnlock = false), 100);
  }

  closePanel() {
    if (!ui.get().panel) return;
    ui.closePanel();
    this.uiFocus = false;
    bus.emit('sfx', { id: 'ui_close' });
    if (this.state === 'playing') this.input.requestPointerLock();
  }

  /** test hook: freeze the real-time loop (automated tests drive tick() themselves) */
  holdLoop = false;

  private frame = (t: number) => {
    requestAnimationFrame(this.frame);
    if (this.holdLoop) { this.last = t; return; }
    let dt = (t - this.last) / 1000;
    const cap = this.settings.g.fpsCap;
    if (cap > 0) {
      this.frameBudget += dt;
      this.last = t;
      if (this.frameBudget < 1 / cap - 0.0005) return;
      dt = this.frameBudget;
      this.frameBudget = 0;
    } else this.last = t;
    if (dt > 0) this.fps += (1 / dt - this.fps) * (dt > 0.2 ? 0.5 : 0.05);
    dt = Math.min(dt, 0.1);
    this.tick(dt);
  };

  /** One rendered frame. Exposed so automated tests can drive the game deterministically. */
  tick(dt: number, render = true) {
    this.input.poll(dt);
    this.input.enabled = !this.uiFocus && this.state === 'playing';
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
    if (this.state !== 'paused') this.update(dt);
    if (render) this.renderer.render(this.state === 'paused' ? 0 : dt);
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
    // world first (vehicles and platforms settle their visual transforms), then the camera that rides on them
    z?.update(dt);
    for (const s of this.systems) s.update?.(dt);
    if (this.state === 'playing') {
      this.player.look(this.input);
      if (this.cameraDriver) this.cameraDriver(dt, this.alpha);
      else this.player.applyCamera(this.renderer.camera, this.alpha, dt);
      this.renderer.camera.updateMatrixWorld();
      this.interactions.update(this.renderer.camera);
      if (this.input.pressed('interact')) { if (this.interactions.use()) bus.emit('sfx', { id: 'ui_tick' }); }
      if (this.input.pressed('computer')) bus.emit('key:computer');
      if (this.input.pressed('creative')) bus.emit('key:creative');
      if (this.input.pressed('crew')) bus.emit('key:crew');
      if (this.input.pressed('codex') && !this.uiFocus) bus.emit('key:codex');
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.08;
        ui.set({ prompt: this.uiFocus ? '' : this.interactions.currentLabel, location: z?.locationName() ?? '' });
      }
    } else if (this.cameraDriver) {
      this.cameraDriver(dt, this.alpha);
      this.renderer.camera.updateMatrixWorld();
    }
  }

  /** Test hook: simulate `seconds` of play without rendering. */
  advance(seconds: number, render = false) {
    const n = Math.round(seconds / H);
    for (let i = 0; i < n; i++) this.tick(H, render && i === n - 1);
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
