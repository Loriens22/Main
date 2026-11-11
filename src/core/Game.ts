import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { MaterialLibrary } from '../render/Materials';
import { Assets } from '../render/Assets';
import { Input } from './Input';
import { AudioEngine } from '../audio/Audio';
import { UI, TouchControls } from '../ui/UI';
import { Emitter, type GameEvents } from './Events';
import { loadSettings, saveSettings, applyPreset, PRESET_ORDER, type Settings, type PresetName } from './Settings';
import { applyShaderQuality } from '../render/quality';
import type { GameState, LocationId, LogEntry } from './State';
import { newGameState } from '../data/newGame';
import { MissionClock } from './MissionClock';
import { Player } from '../player/Player';
import { Interaction } from '../interact/Interaction';
import type { Zone, SpawnSpec } from '../world/Zone';
import type { Controllable, Cinematic } from './Controllable';
import { initPhysics } from '../physics/Physics';
import { saveToSlot, loadFromSlot } from './Save';
import { ShipSystems } from '../systems/ShipSystems';
import { CHARACTERS } from '../data/characters';
import * as Panels from '../ui/Panels';

type ZoneFactory = () => Promise<{ default: new (g: Game) => Zone }>;

const ZONES: Record<LocationId, ZoneFactory> = {
  earth: () => import('../world/zones/EarthZone'),
  space: () => import('../world/zones/SpaceZone'),
  surface: () => import('../world/zones/SurfaceZone'),
  miller: () => import('../world/zones/MillerZone'),
  mann: () => import('../world/zones/MannZone'),
  edmunds: () => import('../world/zones/EdmundsZone'),
};

export type GamePhase = 'loading' | 'menu' | 'transition' | 'playing';

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly settings: Settings;
  readonly renderer: Renderer;
  readonly materials = new MaterialLibrary();
  readonly assets: Assets;
  readonly input: Input;
  readonly audio: AudioEngine;
  readonly ui: UI;
  readonly touch: TouchControls;
  readonly events = new Emitter<GameEvents>();
  readonly camera: THREE.PerspectiveCamera;
  readonly player = new Player();
  readonly interaction = new Interaction();
  readonly systems: ShipSystems;
  state: GameState;
  clock: MissionClock;
  zone: Zone | null = null;
  control: Controllable | null = null;
  cinematic: Cinematic | null = null;
  phase: GamePhase = 'loading';
  paused = false;
  time = 0;
  private last = 0;
  private fpsAcc = { t: 0, n: 0 };
  private zoneLoading = false;
  private menuT = 0;
  /** extra hooks executed every frame (systems registered by zones / missions) */
  readonly tickers = new Set<(dt: number, dtEarth: number) => void>();

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.settings = loadSettings();
    applyShaderQuality(this.settings.graphics);
    this.renderer = new Renderer(this.canvas, this.settings.graphics);
    this.materials.anisotropy = Math.min(8, this.renderer.maxAnisotropy);
    this.materials.textureQuality = this.settings.graphics.textureQuality;
    this.assets = new Assets(this.materials);
    this.input = new Input(this.canvas, this.settings.controls);
    this.audio = new AudioEngine(this.settings.audio);
    this.ui = new UI(this.input);
    this.ui.audio = this.audio;
    this.touch = new TouchControls(this.input, {
      menu: () => this.toggleMenu(),
      skip: () => {
        if (this.cinematic?.skippable) this.cinematic.skip?.();
      },
      fullscreen: () => {
        const d = document as Document & { webkitFullscreenElement?: Element };
        if (d.fullscreenElement || d.webkitFullscreenElement) void document.exitFullscreen?.();
        else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      },
    });
    this.touch.setScale(this.settings.controls.touchScale);
    this.camera = new THREE.PerspectiveCamera(this.settings.graphics.fov, this.renderer.aspect, 0.05, 30000);
    this.state = newGameState();
    this.clock = new MissionClock(this.state);
    this.systems = new ShipSystems(this);
    this.player.onStep = (s, p) => this.audio.footstep(s, p, this.player.sprinting ? 1.3 : 0.9);
    this.events.on('notify', (n) => this.ui.notify(n.text, n.kind, n.duration));
    window.addEventListener('resize', () => {
      this.camera.aspect = this.renderer.aspect;
      this.camera.updateProjectionMatrix();
    });
    this.canvas.addEventListener('click', () => {
      this.audio.start();
      if (this.phase === 'playing' && !this.ui.panelOpen && !this.input.touchActive && !this.cockpitMode) this.input.requestLock();
    });
    (window as any).__game = this;
  }

  cockpitMode = false;

  async init() {
    this.ui.showLoading();
    this.ui.setLoading(0.05, 'initialising physics');
    await initPhysics();
    this.ui.setLoading(0.1, 'loading world');
    await this.enterZone('earth', { at: 'menu' }, (p, m) => this.ui.setLoading(0.1 + p * 0.85, m));
    this.ui.setLoading(1, 'ready');
    this.phase = 'menu';
    this.ui.hideLoading();
    Panels.showMainMenu(this);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ===================================================================================== zones
  private async enterZone(id: LocationId, spawn: SpawnSpec, progress: (p: number, m: string) => void) {
    const mod = await ZONES[id]();
    const z = new mod.default(this);
    this.interaction.clear();
    await z.load(progress);
    this.zone = z;
    this.state.location = id;
    z.spawn(spawn);
    this.renderer.setAOScene(z.scene);
    this.audio.music?.setMood(z.music);
  }

  /** Travel to another location (zone swap) with a fade. */
  async goTo(id: LocationId, spawn: SpawnSpec = {}, opts: { fade?: number; card?: boolean; color?: THREE.Color; fadeIn?: number } = {}) {
    if (this.zoneLoading) return;
    this.zoneLoading = true;
    const fade = opts.fade ?? 1.0;
    await this.fadeTo(1, fade, opts.color);
    this.setControl(null);
    this.cinematic = null;
    const from = this.zone?.id ?? null;
    this.zone?.writeState();
    this.player.removeCollider();
    this.audio.stopAllLoops(0.3);
    this.zone?.dispose();
    this.zone = null;
    this.ui.showLoading();
    try {
      await this.enterZone(id, spawn, (p, m) => this.ui.setLoading(p, m));
    } catch (e) {
      console.error('[game] zone load failed', e);
      this.ui.notify(`Failed to load ${id}: ${(e as Error).message}`, 'alert', 10);
    }
    this.ui.hideLoading();
    this.events.emit('zoneChanged', { from, to: id });
    this.zoneLoading = false;
    await this.fadeTo(0, opts.fadeIn ?? fade, opts.color);
    if (opts.card !== false && this.zone) {
      const d = (this.zone as Zone).describe();
      this.ui.locationCard(d.name, d.sub);
    }
  }

  fadeTo(target: number, seconds: number, color = new THREE.Color(0, 0, 0)): Promise<void> {
    return new Promise((resolve) => {
      const fx = this.renderer.fx;
      fx.fadeColor.copy(color);
      const start = fx.fade;
      const t0 = performance.now();
      const step = () => {
        const k = seconds <= 0 ? 1 : Math.min(1, (performance.now() - t0) / (seconds * 1000));
        fx.fade = start + (target - start) * k;
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  // ===================================================================================== game flow
  async startCreative(fromMenu = true) {
    this.audio.start();
    this.phase = 'transition';
    Panels.hideMainMenu(this);
    this.state.creative.autoRefuel = true;
    const z = this.zone as any;
    if (fromMenu && z?.introToPlay) {
      await z.introToPlay();
    } else {
      this.zone?.spawn({ at: 'farm' });
    }
    this.phase = 'playing';
    this.ui.setHudVisible(true);
    this.input.requestLock();
    const d = this.zone!.describe();
    this.ui.locationCard(d.name, d.sub, 6);
    setTimeout(() => this.ui.notify('Creative Mode — explore freely. Press M for the mission computer, Esc for the menu.', 'info', 9), 2500);
  }

  async returnToMainMenu() {
    this.ui.closeAllPanels();
    this.ui.closeDialogue();
    this.ui.setHudVisible(false);
    this.input.releaseLock();
    this.setControl(null);
    this.state = newGameState();
    this.clock = new MissionClock(this.state);
    await this.goTo('earth', { at: 'menu' }, { card: false });
    this.phase = 'menu';
    Panels.showMainMenu(this);
  }

  // ===================================================================================== control
  setControl(c: Controllable | null) {
    this.control = c;
    this.input.context = c ? c.context : this.player.mode === 'seat' ? 'seat' : 'walk';
    this.syncTouch();
    this.ui.vhud.innerHTML = '';
    this.ui.layer.innerHTML = '';
    this.cockpitMode = false;
  }

  /** Pick the on-screen touch layout from what the player is doing right now. */
  syncTouch() {
    if (!this.input.touchActive) {
      this.touch.disable();
      return;
    }
    const p = this.player;
    const mode = this.ui.panelOpen || this.ui.dialogueOpen || this.phase !== 'playing'
      ? 'ui'
      : this.cinematic?.blocking
        ? 'cinematic'
        : this.control
          ? this.control.context === 'flight' ? 'flight' : this.control.context === 'drive' ? 'drive' : 'seat'
          : p.mode === 'seat' ? 'seat' : p.mode === 'float' ? 'float' : p.mode === 'ladder' ? 'ladder' : 'walk';
    this.touch.setMode(mode);
    this.touch.el.classList.toggle('skippable', !!this.cinematic?.skippable);
  }

  playCinematic(c: Cinematic) {
    this.cinematic = c;
  }

  // ===================================================================================== helpers
  notify(text: string, kind: 'info' | 'warn' | 'alert' | 'ok' = 'info', duration = 5) {
    this.ui.notify(text, kind, duration);
  }

  /** Character line: subtitles (+ optional speech synthesis). */
  say(who: string, text: string, duration = 0) {
    const c = CHARACTERS[who];
    const name = c?.name ?? who;
    if (this.settings.controls.subtitles) this.ui.subtitle(name, text, duration);
    this.audio.speak(text, c?.voice ?? {});
  }

  log(channel: LogEntry['channel'], who: string, text: string) {
    this.state.logs.push({ t: this.state.clock.earthTime, ship: this.state.clock.enduranceProper, channel, who, text });
    if (this.state.logs.length > 600) this.state.logs.splice(0, this.state.logs.length - 600);
  }

  flag(key: string, value?: number | string | boolean) {
    if (value !== undefined) {
      this.state.flags[key] = value;
      this.events.emit('flag', { key, value });
    }
    return this.state.flags[key];
  }

  get creative() {
    return this.state.creative;
  }

  applySettings() {
    saveSettings(this.settings);
    applyShaderQuality(this.settings.graphics);
    if (!this.settings.graphics.dynamicResolution) this.renderer.dynScale = 1;
    this.renderer.applySettings(this.settings.graphics);
    this.materials.textureQuality = this.settings.graphics.textureQuality;
    this.audio.applySettings(this.settings.audio);
    this.input.controls = this.settings.controls;
    this.input.rebuildBindings();
    this.touch.setScale(this.settings.controls.touchScale);
    this.camera.fov = this.settings.graphics.fov;
    this.camera.updateProjectionMatrix();
    (this.zone as any)?.onSettingsChanged?.();
  }

  // ===================================================================================== save/load
  save(slot = 'quick', label = '') {
    if (this.phase !== 'playing') return false;
    this.zone?.writeState();
    this.writePlayerState();
    const ok = saveToSlot(slot, this.state, label);
    this.notify(ok ? `Game saved (${slot})` : 'Save failed — storage unavailable', ok ? 'ok' : 'alert', 3);
    if (ok) this.events.emit('saved', { slot });
    return ok;
  }

  async load(slot = 'quick') {
    const s = loadFromSlot(slot);
    if (!s) {
      this.notify(`No save in slot "${slot}"`, 'warn');
      return false;
    }
    this.ui.closeAllPanels();
    this.ui.closeDialogue();
    this.setControl(null);
    this.state = s;
    this.clock = new MissionClock(this.state);
    this.systems.jobs = [];
    const p = s.player;
    const wasMenu = this.phase === 'menu';
    if (wasMenu) Panels.hideMainMenu(this);
    this.phase = 'transition';
    await this.goTo(s.location, { frame: p.frame, pos: new THREE.Vector3(...p.pos), yaw: p.yaw, at: p.seat ? `seat:${p.seat}` : undefined });
    this.phase = 'playing';
    this.ui.setHudVisible(true);
    this.events.emit('loaded', { slot });
    this.notify(`Loaded "${slot}"`, 'ok', 3);
    return true;
  }

  writePlayerState() {
    const p = this.player;
    const ps = this.state.player;
    if (!p.frame) return;
    ps.frame = p.frame.id;
    ps.pos = [p.pos.x, p.pos.y, p.pos.z];
    ps.yaw = p.yaw;
    ps.pitch = p.pitch;
    ps.mode = p.mode;
    ps.seat = p.seat?.id ?? null;
    ps.thirdPerson = p.thirdPerson;
  }

  // ===================================================================================== loop
  toggleMenu() {
    if (this.phase !== 'playing') return;
    if (this.ui.dialogueOpen) return;
    if (this.ui.closeTopPanel()) {
      if (!this.ui.panelOpen) this.input.requestLock();
      return;
    }
    this.input.releaseLock();
    Panels.openGameMenu(this);
  }

  /** debug/test control: when false the RAF loop idles and frames are advanced with step() */
  running = true;

  /** Advance n frames of dt seconds synchronously (tests / screenshots). Returns ms per frame. */
  step(n = 1, dt = 1 / 30, renderLast = true): number {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.skipRender = renderLast ? i < n - 1 : true;
      this.time += dt;
      try {
        this.update(dt);
      } catch (e) {
        console.error('[game] step error', e);
      }
      this.input.endFrame();
    }
    this.skipRender = false;
    return (performance.now() - t0) / Math.max(1, n);
  }
  skipRender = false;

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.running) {
      this.last = now;
      return;
    }
    let dt = (now - this.last) / 1000;
    this.last = now;
    const cap = this.settings.graphics.fpsCap;
    if (cap > 0 && dt < 1 / cap - 0.002) {
      this.last = now - dt * 1000;
      return;
    }
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      const r = this.renderer.stats;
      r.fps = this.fpsAcc.n / this.fpsAcc.t;
      this.ui.fps(`${r.fps.toFixed(0)} fps · ${r.calls} calls · ${(r.tris / 1000).toFixed(0)}k tris`);
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
    }
    this.adaptQuality(dt);
    try {
      this.update(dt);
    } catch (e) {
      console.error('[game] update error', e);
    }
    this.input.endFrame();
  }

  // ---- adaptive quality: dynamic resolution, then (for automatically chosen presets) one preset step down
  private adapt = { t: 0, n: 0, slow: 0, warm: 4 };
  private adaptQuality(dt: number) {
    const g = this.settings.graphics;
    const a = this.adapt;
    if (this.phase !== 'playing' || this.zoneLoading || document.visibilityState !== 'visible') {
      a.t = a.n = 0;
      a.warm = 3; // zone switches, menus: let shaders compile and caches fill before judging
      return;
    }
    if (a.warm > 0) {
      a.warm -= dt;
      return;
    }
    a.t += dt;
    a.n++;
    if (a.t < 2) return;
    const fps = a.n / a.t;
    a.t = a.n = 0;
    const target = g.fpsCap > 0 ? Math.min(g.fpsCap, 55) * 0.9 : this.renderer.isMobile || g.preset === 'phone' ? 30 : 50;
    const r = this.renderer;
    if (g.dynamicResolution) {
      let k = r.dynScale;
      if (fps < target * 0.92) k = Math.max(0.5, k * Math.max(0.75, Math.sqrt(fps / target)));
      else if (fps > target * 1.3 && k < 1) k = Math.min(1, k + 0.08);
      if (Math.abs(k - r.dynScale) > 0.02) {
        r.dynScale = k;
        r.resize();
      }
    }
    // still far too slow at the lowest resolution: an automatically chosen preset steps down once per 8 s
    const floor = !g.dynamicResolution || r.dynScale <= 0.52;
    a.slow = floor && fps < target * 0.7 ? a.slow + 2 : 0;
    if (g.autoPreset && a.slow >= 8) {
      a.slow = 0;
      const i = PRESET_ORDER.indexOf(g.preset as PresetName);
      if (i >= 0 && i < PRESET_ORDER.length - 1) {
        const next = PRESET_ORDER[i + 1];
        applyPreset(g, next);
        r.dynScale = 1;
        this.applySettings();
        this.notify(`Low frame rate (${fps.toFixed(0)} fps): graphics lowered to ${next === 'phone' ? 'Phone' : next[0].toUpperCase() + next.slice(1)}. Settings → Graphics to change.`, 'info', 6);
      }
    }
  }

  private update(dt: number) {
    const input = this.input;
    input.poll(dt);
    const z = this.zone;
    if (!z) {
      return;
    }
    if (this.phase === 'menu' || this.phase === 'transition') {
      this.menuT += dt;
      (z as any).menuUpdate?.(dt, this.camera, this.menuT);
      z.update(dt, dt);
      this.syncTouch();
      this.renderFrame(dt);
      return;
    }

    // ---- global keys
    if (input.pressed('menu')) this.toggleMenu();
    const uiBlocked = this.ui.panelOpen;
    if (!uiBlocked) {
      if (input.pressed('computer')) {
        this.input.releaseLock();
        Panels.openMissionComputer(this);
      }
      if (input.pressed('creative')) {
        this.input.releaseLock();
        Panels.openCreativePanel(this);
      }
      if (input.pressed('quickSave')) this.save('quick', 'Quick save');
      if (input.pressed('quickLoad')) this.load('quick');
      if (input.pressed('view') && !this.control) {
        this.player.thirdPerson = !this.player.thirdPerson;
        if (this.player.bodyModel) this.player.bodyModel.visible = this.player.thirdPerson;
      }
      if (input.pressed('cockpitMode') && (this.control || this.player.mode === 'seat')) {
        this.cockpitMode = !this.cockpitMode;
        if (this.cockpitMode) this.input.releaseLock();
        else this.input.requestLock();
        this.notify(this.cockpitMode ? 'Cockpit interaction: click switches and screens. Tab to return.' : 'Flight view', 'info', 2.5);
      }
      if (input.pressed('timeWarpUp') || input.pressed('timeWarpDown')) this.changeTimeWarp(input.pressed('timeWarpUp') ? 1 : -1);
    }

    // ---- time
    const paused = this.paused || (uiBlocked && !this.ui.dialogueOpen && !this.cinematic);
    const simDt = paused ? 0 : dt;
    const ctx = { location: this.state.location, system: this.state.system, ...((z as any).clockContext?.() ?? {}) };
    const dtEarth = simDt > 0 ? this.clock.advance(simDt, ctx) : 0;
    if (simDt > 0) this.state.playSeconds += dt;
    const warp = this.clock.timeScale;

    // ---- player / control
    if (!paused) {
      if (this.cinematic) {
        const running = this.cinematic.update(simDt, this.camera);
        if (!running) this.cinematic = null;
        else if (this.cinematic.skippable && input.pressed('menu')) this.cinematic.skip?.();
      }
      if (!this.cinematic || !this.cinematic.blocking) {
        if (this.control) {
          if (!uiBlocked && !this.ui.dialogueOpen) this.control.control(simDt, input);
          if (input.pressed('vehicle') && !uiBlocked) {
            if (this.control.exit()) this.setControl(null);
          }
          if (input.pressed('camera') && this.control) this.control.cycleCamera?.();
        } else {
          const look = input.look.clone();
          if (uiBlocked || this.ui.dialogueOpen || (!input.locked && !input.touchActive && !input.gamepadActive)) input.look.set(0, 0);
          if (this.ui.dialogueOpen) input.move.set(0, 0);
          this.player.update(simDt * Math.min(warp, 1), input);
          input.look.copy(look);
          if (this.player.mode === 'seat' && input.pressed('vehicle') && !uiBlocked) {
            this.player.stand();
            this.input.context = 'walk';
          }
        }
      }
    }

    // ---- zone & systems
    z.update(simDt, dtEarth);
    for (const t of this.tickers) t(simDt, dtEarth);
    this.systems.update(simDt);

    // ---- camera
    if (this.cinematic) {
      /* cinematic writes camera */
    } else if (this.control) this.control.camera(this.camera, dt);
    else this.player.applyToCamera(this.camera);
    this.camera.updateMatrixWorld(true);

    // ---- interaction
    if (!this.control && !this.cinematic && !uiBlocked && !this.ui.dialogueOpen) {
      const ndc = this.cockpitMode || input.tapped || (!input.locked && !input.touchActive && this.player.mode === 'seat') ? input.pointer : undefined;
      const f = this.interaction.update(this.camera, this.player.mode === 'seat' ? 2.2 : 3.0, ndc);
      this.ui.setCrosshair(!this.cockpitMode, !!f);
      this.ui.prompt(f ? f.label() : null);
      if (f && (input.pressed('interact') || (ndc && input.pointerClicked))) {
        f.use();
        this.audio.ui('click');
      }
    } else if (this.control && this.cockpitMode) {
      const f = this.interaction.update(this.camera, 2.5, input.pointer);
      this.ui.prompt(f ? f.label() : null, 'CLICK');
      if (f && input.pointerClicked) {
        f.use();
        this.audio.ui('click');
      }
      this.ui.setCrosshair(false);
    } else {
      this.ui.prompt(null);
      this.ui.setCrosshair(!this.control && !this.cinematic);
    }
    // HUD canvases only for frames that are presented (stepped test frames skip rendering; undisplayed 2D canvas
    // work would otherwise pile up in the compositor)
    if (!this.skipRender) this.control?.hud?.(dt);
    // on foot the input context follows the player's posture (zones may change it outside setControl, e.g. boarding)
    if (!this.control) this.input.context = this.player.mode === 'seat' ? 'seat' : 'walk';
    this.syncTouch();

    // ---- status line
    this.updateStatus();
    this.renderFrame(dt);
  }

  private changeTimeWarp(dir: number) {
    const levels = [1, 2, 5, 10, 50, 100, 1000, 10000, 100000];
    if (!this.state.creative.timeWarpAllowed) {
      this.notify('Time warp disabled in Creative options', 'warn', 2);
      return;
    }
    const z = this.zone as any;
    const maxWarp: number = z?.maxTimeWarp?.() ?? 1;
    let i = levels.indexOf(this.clock.timeScale);
    if (i < 0) i = 0;
    i = THREE.MathUtils.clamp(i + dir, 0, levels.length - 1);
    let v = levels[i];
    if (v > maxWarp) {
      v = maxWarp;
      if (dir > 0) this.notify(`Time warp limited to ×${maxWarp} here`, 'warn', 2);
    }
    this.clock.timeScale = v;
    this.notify(`Time ×${v}`, 'info', 1.5);
  }

  private statusT = 0;
  private updateStatus() {
    this.statusT -= 1;
    if (this.statusT > 0) return;
    this.statusT = 10;
    const st = this.state;
    const z = this.zone!;
    const d = z.describe();
    const warp = this.clock.timeScale !== 1 ? ` · <b>×${this.clock.timeScale}</b>` : '';
    this.ui.status.innerHTML =
      `<b>${d.name}</b> · ${d.sub}<br>` +
      `EARTH ${MissionClock.formatDate(st.clock.earthTime)}${warp}<br>` +
      `MISSION T+ ${MissionClock.formatDuration(st.clock.playerProper)}`;
  }

  private renderFrame(dt: number) {
    const z = this.zone;
    if (!z || this.skipRender) return;
    this.audio.updateListener(this.camera);
    this.audio.setVacuum(z.inVacuum());
    this.audio.music?.update();
    this.renderer.fx.exposure = z.exposure;
    this.renderer.render(z.layers(this.camera), this.camera, dt, this.time);
  }
}
