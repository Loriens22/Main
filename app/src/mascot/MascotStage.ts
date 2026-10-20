import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  Emotion,
  InteractionKind,
  MascotAction,
  MascotAnchor,
  MascotId,
  MascotStageApi,
  MascotStageOptions,
  Quality,
  RoamMode,
  StageStats,
} from './types';
import { ACTION_DURATION, ENTER_ACTION, makeParams, targetParams, type ExprParams } from './emotions';
import type { ActiveAction, FrameState } from './frame';
import { MaverickRig } from './Maverick';
import { SparkyRig } from './Sparky';
import { Particles, P } from './particles';
import { makeParticleAtlas, makeShadowTexture, makeStrandTexture } from './textures';
import { Spring, Spring2, approach, clamp, noise1, smoothstep } from './util';

const FOV = 22;
const TAP_MOVE_TOLERANCE = 10;
const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 320;

interface QualityLevel {
  name: Exclude<Quality, 'auto'>;
  dpr: number;
  shells: number;
  beret: number;
}
const LEVELS: QualityLevel[] = [
  { name: 'high', dpr: 2, shells: 30, beret: 12 },
  { name: 'medium', dpr: 1.5, shells: 22, beret: 9 },
  { name: 'low', dpr: 1.25, shells: 15, beret: 6 },
  { name: 'low', dpr: 1, shells: 11, beret: 5 },
];

type Rig = MaverickRig | SparkyRig;

interface Visit {
  x: number;
  y: number;
  arrived: boolean;
  until: number;
  resolve: () => void;
  deadline: number;
}

class MascotCtl {
  readonly id: MascotId;
  readonly rig: Rig;
  readonly holder = new THREE.Group();
  readonly shadow: THREE.Mesh;
  anchor: MascotAnchor | null = null;
  homeKnown = false;
  pos = new Spring2(0, 0, 2.6, 0.82);
  size = new Spring(100, 3, 0.9);
  vis = new Spring(0, 2.2, 0.55);
  emotion: Emotion = 'idle';
  emotionUntil = 0;
  intensity = 1;
  params: ExprParams = makeParams();
  target: ExprParams = makeParams();
  actions: ActiveAction[] = [];
  speakTarget = 0;
  speakAt = -1;
  speak = 0;
  roam: RoamMode = 'off';
  roamTarget: { x: number; y: number } | null = null;
  roamNext = 0;
  roamDwellUntil = 0;
  visit: Visit | null = null;
  drag: { x: number; y: number; ox: number; oy: number } | null = null;
  hop = 0; // normalised travel hop height
  hopPhase = 0;
  blink = 0;
  blinkNext = 1 + Math.random() * 3;
  blinkT = -1;
  lookX = 0;
  lookY = 0;
  emitTimers: Record<string, number> = {};
  frame: FrameState;
  /** Rendered screen-space centre (CSS px) and diameter. */
  screenX = 0;
  screenY = 0;
  screenSize = 0;

  constructor(id: MascotId, rig: Rig, shadowMat: THREE.MeshBasicMaterial, shadowGeo: THREE.PlaneGeometry) {
    this.id = id;
    this.rig = rig;
    this.holder.add(rig.group);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
    this.shadow.renderOrder = -1;
    this.frame = {
      t: 0,
      dt: 0,
      p: this.params,
      emotion: 'idle',
      actions: this.actions,
      speak: 0,
      lookX: 0,
      lookY: 0,
      velX: 0,
      velY: 0,
      dragging: false,
      travelHop: 0,
      blink: 0,
      reduced: false,
    };
  }

  get visible() {
    return this.vis.x > 0.002 || this.vis.v > 0.01;
  }
}

/**
 * The imperative three.js engine behind both mascots. A single transparent full-screen
 * canvas; world units are CSS pixels on the z=0 plane, so anchors map 1:1 to the DOM.
 */
export class MascotStage implements MascotStageApi {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private strandTex: THREE.DataTexture;
  private atlas: THREE.Texture;
  private shadowTex: THREE.Texture;
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private shadowMat: THREE.MeshBasicMaterial;
  private particles: Particles;
  private maverick: MascotCtl;
  private sparky: MascotCtl;
  private ctls: MascotCtl[];
  private theme: 'light' | 'dark';
  private quality: Quality;
  private level = 0;
  private reduced: boolean;
  private paused = false;
  private disposed = false;
  private contextLost = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private W = 1;
  private H = 1;
  private dpr = 1;
  private fpsEMA = 60;
  private frameEMA = 16.7;
  private slowFor = 0;
  private fastFor = 0;
  private lastLevelChange = 0;
  private lookTarget: { x: number; y: number } | null = null;
  private pointer = { x: -1, y: -1, at: -1e9 };
  private listeners = new Set<(id: MascotId, kind: InteractionKind) => void>();
  private press: {
    id: MascotId;
    pointerId: number;
    x0: number;
    y0: number;
    t0: number;
    dragging: boolean;
    long: boolean;
    timer: number;
  } | null = null;
  private lastTap: { id: MascotId; at: number } | null = null;
  private consumedAt = -1e9;
  private stats: StageStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, quality: 'high', dpr: 1 };
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private warmPos = new THREE.Vector3();
  private resizeObs: ResizeObserver | null = null;

  constructor(opts: MascotStageOptions) {
    this.canvas = opts.canvas;
    this.theme = opts.theme;
    this.quality = opts.quality ?? 'auto';
    this.reduced = !!opts.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 10000);

    // Lighting: warm key, cool rim, soft hemisphere + room environment for glossy bits.
    this.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x3b2f36, 1.1);
    this.keyLight = new THREE.DirectionalLight(0xfff0dd, 2.6);
    this.keyLight.position.set(-0.45, 0.75, 0.55);
    this.rimLight = new THREE.DirectionalLight(0xa8ccff, 1.6);
    this.rimLight.position.set(0.6, 0.35, -0.7);
    this.scene.add(this.hemi, this.keyLight, this.rimLight);
    this.buildEnvironment();

    this.strandTex = makeStrandTexture();
    this.atlas = makeParticleAtlas();
    this.shadowTex = makeShadowTexture();
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      toneMapped: false,
    });

    const mav = new MaverickRig({ strandTex: this.strandTex });
    const spk = new SparkyRig();
    this.maverick = new MascotCtl('maverick', mav, this.shadowMat, this.shadowGeo);
    this.sparky = new MascotCtl('sparky', spk, this.shadowMat, this.shadowGeo);
    this.sparky.size.set(45);
    this.ctls = [this.maverick, this.sparky];
    for (const c of this.ctls) {
      c.holder.visible = false;
      c.shadow.visible = false;
      this.scene.add(c.holder, c.shadow);
    }
    this.scene.add(spk.light);

    this.particles = new Particles(this.atlas);
    this.scene.add(this.particles.group);

    this.applyTheme();
    this.applyLevel(this.quality === 'auto' ? 0 : this.qualityToLevel(this.quality));
    this.resize();

    // Events.
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    window.addEventListener('resize', this.onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', this.onPointerUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', this.onPointerCancel, { capture: true, passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { capture: true, passive: false });
    window.addEventListener('click', this.onClickCapture, { capture: true });
    window.addEventListener('contextmenu', this.onContextMenu, { capture: true });
    if ('ResizeObserver' in window) {
      this.resizeObs = new ResizeObserver(() => this.onResize());
      this.resizeObs.observe(this.canvas);
    }
    this.wake();
  }

  // ------------------------------------------------------------------ public API

  setAnchor(id: MascotId, anchor: MascotAnchor | null, opts?: { immediate?: boolean }) {
    const c = this.ctl(id);
    if (!c) return;
    const first = !c.homeKnown;
    c.anchor = anchor ? { ...anchor } : null;
    if (anchor) {
      if (first || opts?.immediate) {
        // Appear in place (with a pop-in), never fly in from the corner.
        if (!(id === 'sparky' && c.visible)) c.pos.set(anchor.x, anchor.y);
        if (first) c.size.set(anchor.size);
      }
      c.homeKnown = true;
    }
    this.wake();
  }

  setEmotion(id: MascotId, emotion: Emotion, opts?: { durationMs?: number; intensity?: number }) {
    const c = this.ctl(id);
    if (!c) return;
    const changed = c.emotion !== emotion;
    c.emotion = emotion;
    c.intensity = clamp(opts?.intensity ?? 1, 0, 1.5);
    c.emotionUntil = opts?.durationMs ? this.time + opts.durationMs / 1000 : 0;
    if (changed) {
      const a = ENTER_ACTION[emotion];
      if (a) this.react(id, a);
      this.onEmotionEnter(c, emotion);
    }
    this.wake();
  }

  react(id: MascotId, action: MascotAction) {
    const c = this.ctl(id);
    if (!c) return;
    let kind = action;
    if (this.reduced && (kind === 'spin' || kind === 'celebrate' || kind === 'jump')) kind = 'nod';
    // Replace an identical running action rather than stacking it.
    c.actions = c.actions.filter((a) => a.kind !== kind);
    c.frame.actions = c.actions;
    c.actions.push({ kind, t0: this.time, dur: ACTION_DURATION[kind], p: 0 });
    if (kind === 'celebrate') this.burstConfetti(c);
    if (kind === 'poke') this.emitSparkles(c, 5);
    this.wake();
  }

  setSpeaking(id: MascotId, level: number) {
    const c = this.ctl(id);
    if (!c) return;
    c.speakTarget = clamp(level, 0, 1);
    c.speakAt = this.time;
    this.wake();
  }

  setLookAt(target: { x: number; y: number } | null) {
    this.lookTarget = target ? { ...target } : null;
  }

  roam(id: MascotId, mode: RoamMode) {
    const c = this.ctl(id);
    if (!c) return;
    c.roam = mode;
    c.roamTarget = null;
    c.roamNext = this.time + 0.6 + Math.random();
    this.wake();
  }

  moveTo(id: MascotId, point: { x: number; y: number }, opts?: { hop?: boolean; durationMs?: number }): Promise<void> {
    const c = this.ctl(id);
    if (!c) return Promise.resolve();
    if (c.visit) c.visit.resolve();
    return new Promise<void>((resolve) => {
      const dur = (opts?.durationMs ?? 1200) / 1000;
      c.visit = {
        x: point.x,
        y: point.y,
        arrived: false,
        until: 0,
        resolve,
        deadline: this.time + dur + 2.5,
      };
      if (opts?.hop === false && c.id === 'maverick') c.hopPhase = 0;
      this.wake();
    });
  }

  hitTest(x: number, y: number): MascotId | null {
    // Sparky is smaller and usually in front — test it first.
    for (const c of [this.sparky, this.maverick]) {
      if (!c.visible || c.vis.x < 0.3) continue;
      const r = c.screenSize * 0.45;
      const dx = x - c.screenX;
      const dy = y - c.screenY;
      if (dx * dx + dy * dy <= r * r) return c.id;
    }
    return null;
  }

  getPosition(id: MascotId) {
    const c = this.ctl(id);
    if (!c || !c.homeKnown) return null;
    return { x: c.screenX, y: c.screenY, size: c.screenSize, visible: c.visible && c.vis.x > 0.05 };
  }

  onInteract(cb: (id: MascotId, kind: InteractionKind) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    this.applyTheme();
    this.wake();
  }

  setQuality(q: Quality) {
    this.quality = q;
    if (q !== 'auto') this.applyLevel(this.qualityToLevel(q));
    this.wake();
  }

  setReducedMotion(v: boolean) {
    this.reduced = v;
    this.wake();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.stop();
    else this.wake();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.W = w;
    this.H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, LEVELS[this.level].dpr);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.particles.uniforms.uPixelRatio.value = dpr;
    const cam = this.camera;
    cam.aspect = w / h;
    const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    cam.near = dist * 0.3;
    cam.far = dist * 2;
    cam.position.set(w / 2, -h / 2, dist);
    cam.lookAt(w / 2, -h / 2, 0);
    cam.updateProjectionMatrix();
    this.wake();
  }

  getStats(): StageStats {
    return { ...this.stats };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
    window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', this.onPointerCancel, { capture: true });
    window.removeEventListener('touchmove', this.onTouchMove, { capture: true });
    window.removeEventListener('click', this.onClickCapture, { capture: true });
    window.removeEventListener('contextmenu', this.onContextMenu, { capture: true });
    this.resizeObs?.disconnect();
    if (this.press) clearTimeout(this.press.timer);
    for (const c of this.ctls) {
      c.visit?.resolve();
      c.rig.dispose();
      (c.shadow.material as THREE.Material).dispose();
    }
    this.particles.dispose();
    this.strandTex.dispose();
    this.atlas.dispose();
    this.shadowTex.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.envRT?.dispose();
    this.pmrem?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ internals

  private ctl(id: MascotId) {
    return id === 'maverick' ? this.maverick : id === 'sparky' ? this.sparky : null;
  }

  private buildEnvironment() {
    this.envRT?.dispose();
    this.pmrem?.dispose();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envRT = this.pmrem.fromScene(room, 0.04);
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
  }

  private qualityToLevel(q: Quality) {
    return q === 'high' ? 0 : q === 'medium' ? 1 : q === 'low' ? 3 : 0;
  }

  private applyLevel(i: number) {
    this.level = clamp(i, 0, LEVELS.length - 1);
    const L = LEVELS[this.level];
    (this.maverick.rig as MaverickRig).setShells(L.shells, L.beret);
    this.lastLevelChange = this.time;
    this.slowFor = this.fastFor = 0;
    if (this.W > 1) this.resize();
  }

  private applyTheme() {
    const dark = this.theme === 'dark';
    const mav = this.maverick.rig as MaverickRig;
    mav.furU.uRimStrength.value = dark ? 1.25 : 0.75;
    mav.beretU.uRimStrength.value = dark ? 1.4 : 0.9;
    this.renderer.toneMappingExposure = dark ? 1.08 : 1.0;
    this.rimLight.intensity = dark ? 2.0 : 1.2;
    for (const c of this.ctls) {
      (c.shadow.material as THREE.MeshBasicMaterial).opacity = dark ? 0.7 : 0.42;
    }
  }

  private emit(c: MascotCtl, ev: InteractionKind) {
    for (const l of this.listeners) {
      try {
        l(c.id, ev);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private wake = () => {
    if (this.disposed || this.paused || this.contextLost || this.raf) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  };

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.paused || this.contextLost) return;
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(rawDt, 0.001, 0.05);
    this.time += dt;

    const active = this.update(dt);
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    this.stats.drawCalls = info.calls;
    this.stats.triangles = info.triangles;
    this.trackPerformance(rawDt * 1000);

    if (active) this.raf = requestAnimationFrame(this.loop);
    else {
      // Nothing to show: clear once and sleep until something changes.
      this.renderer.clear();
    }
  };

  private trackPerformance(frameMs: number) {
    if (frameMs > 0 && frameMs < 1000) {
      this.frameEMA = this.frameEMA * 0.92 + frameMs * 0.08;
      this.fpsEMA = 1000 / this.frameEMA;
    }
    this.stats.fps = Math.round(this.fpsEMA);
    this.stats.frameMs = Math.round(this.frameEMA * 10) / 10;
    this.stats.quality = LEVELS[this.level].name;
    this.stats.dpr = this.dpr;
    if (this.quality !== 'auto') return;
    const sinceChange = this.time - this.lastLevelChange;
    if (this.frameEMA > 18.5) {
      this.slowFor += frameMs / 1000;
      this.fastFor = 0;
    } else if (this.frameEMA < 12.5 || (this.frameEMA < 17.5 && this.frameEMA > 15.5)) {
      // ~60Hz vsync-locked (16.7ms) counts as "good enough" to try stepping up.
      this.fastFor += frameMs / 1000;
      this.slowFor = 0;
    }
    if (this.slowFor > 1.5 && this.level < LEVELS.length - 1 && sinceChange > 1.5) {
      this.applyLevel(this.level + 1);
    } else if (this.fastFor > 8 && this.level > 0 && sinceChange > 10) {
      this.applyLevel(this.level - 1);
    }
  }

  /** Advance simulation. Returns whether another frame is needed. */
  private update(dt: number): boolean {
    const t = this.time;
    let anyVisible = false;
    const pointerFresh = t - this.pointer.at < 4;

    for (const c of this.ctls) {
      this.updateCtl(c, dt, t, pointerFresh);
      if (c.visible) anyVisible = true;
    }

    // Warm flame light for Maverick's fur.
    const spk = this.sparky.rig as SparkyRig;
    const mav = this.maverick.rig as MaverickRig;
    if (this.sparky.visible) {
      spk.getHeadTop(this.tmpV);
      this.tmpV.y -= 0.6;
      this.sparky.holder.localToWorld(this.tmpV);
      this.warmPos.copy(this.tmpV);
      spk.light.position.copy(this.tmpV);
      spk.light.distance = this.sparky.screenSize * 3.2;
      spk.light.visible = true;
      mav.furU.uWarmLightPos.value.copy(this.warmPos);
      mav.furU.uWarmLight.value = 0.35 * spk.flamePower * this.sparky.vis.x * (this.sparky.screenSize / 60);
    } else {
      spk.light.visible = false;
      mav.furU.uWarmLight.value = 0;
    }

    this.particles.update(dt, t);
    return anyVisible || this.particles.alive > 0;
  }

  private updateCtl(c: MascotCtl, dt: number, t: number, pointerFresh: boolean) {
    const isMav = c.id === 'maverick';
    const mav = this.maverick;

    // Emotion expiry.
    if (c.emotionUntil && t > c.emotionUntil) {
      c.emotionUntil = 0;
      c.emotion = 'idle';
    }
    // Speech level decays if the caller stops feeding it.
    if (t - c.speakAt > 0.25) c.speakTarget = 0;
    c.speak = approach(c.speak, c.speakTarget, 20, dt);

    // Actions.
    for (let i = c.actions.length - 1; i >= 0; i--) {
      const a = c.actions[i];
      a.p = (t - a.t0) / a.dur;
      if (a.p >= 1) c.actions.splice(i, 1);
    }

    // Expression params.
    let emo = c.emotion;
    if (emo === 'idle' && c.speak > 0.05) emo = 'speaking';
    targetParams(emo, c.intensity, c.target);
    const rate = 5;
    for (const k in c.target) {
      const key = k as keyof ExprParams;
      c.params[key] = approach(c.params[key], c.target[key], rate, dt);
    }

    // ---- where should we be?
    const companion = !isMav && !c.anchor && mav.anchor && mav.homeKnown;
    const hasHome = !!c.anchor || !!companion;
    let homeX = c.anchor?.x ?? 0;
    let homeY = c.anchor?.y ?? 0;
    let targetSize = c.anchor?.size ?? 0;
    if (companion) {
      const ms = mav.size.x;
      const orbit = t * 0.5;
      targetSize = ms * 0.42;
      // Orbit just outside Maverick's silhouette so the two never overlap, even at small sizes.
      const gap = ms * 0.5 + targetSize * 0.62;
      homeX = mav.pos.x + gap + ms * Math.cos(orbit) * 0.05;
      homeY = mav.pos.y - ms * (0.28 + Math.sin(orbit * 1.3) * 0.05) - mav.hop * ms * 0.5;
      // Stay on screen: mirror to Maverick's left when he sits near the right edge, and keep below the top edge.
      const half = targetSize * 0.6;
      if (homeX > this.W - half) homeX = mav.pos.x - gap - ms * Math.cos(orbit) * 0.05;
      homeX = clamp(homeX, half, Math.max(half, this.W - half));
      homeY = clamp(homeY, half + 6, Math.max(half + 6, this.H - half));
      if (!c.homeKnown) {
        c.pos.set(homeX, homeY);
        c.size.set(targetSize);
        c.homeKnown = true;
      }
    }

    let tx = homeX;
    let ty = homeY;
    let travelling = false;
    if (c.drag) {
      tx = c.drag.x + c.drag.ox;
      ty = c.drag.y + c.drag.oy;
    } else if (c.visit) {
      const v = c.visit;
      tx = v.x;
      ty = v.y;
      const d = Math.hypot(c.pos.x - v.x, c.pos.y - v.y);
      if (!v.arrived && (d < 6 || t > v.deadline)) {
        v.arrived = true;
        v.until = t + 2.5;
        v.resolve();
      }
      if (v.arrived && t > v.until) c.visit = null;
      travelling = true;
    } else if (c.roam !== 'off' && hasHome && !this.reduced) {
      this.updateRoam(c, t, homeX, homeY);
      if (c.roamTarget) {
        tx = c.roamTarget.x;
        ty = c.roamTarget.y;
        travelling = true;
      }
    }

    // Movement dynamics.
    const s = Math.max(20, c.size.x);
    const dist = Math.hypot(tx - c.pos.x, ty - c.pos.y);
    if (c.drag) {
      c.pos.freq = 6;
      c.pos.damping = 0.7;
    } else if (travelling || dist > s * 0.6) {
      c.pos.freq = isMav ? 1.5 : 1.2;
      c.pos.damping = isMav ? 0.9 : 0.75;
    } else {
      c.pos.freq = 3.2;
      c.pos.damping = 0.85;
    }
    // Sparky flies loops while exploring.
    if (!isMav && c.roam === 'explore' && c.roamTarget && !c.drag) {
      tx += Math.cos(t * 2.1) * s * 0.6;
      ty += Math.sin(t * 2.1) * s * 0.35;
    }
    c.pos.step(tx, ty, dt);
    c.size.step(targetSize || c.size.x, dt);

    const speed = Math.hypot(c.pos.vx, c.pos.vy);
    // Hopping travel (Maverick) — phase advances with speed.
    if (isMav && !c.drag && speed > s * 0.35) {
      c.hopPhase += (speed / (s * 1.4)) * Math.PI * dt;
      const target = Math.abs(Math.sin(c.hopPhase)) * clamp(speed / (s * 2), 0.25, 1);
      c.hop = approach(c.hop, target, 18, dt);
    } else {
      c.hop = approach(c.hop, 0, 10, dt);
      if (c.hop < 0.01) c.hopPhase = 0;
    }

    // Visibility pop.
    const wantVisible = hasHome && c.homeKnown;
    c.vis.step(wantVisible ? 1 : 0, dt);
    if (c.vis.x < 0.001 && !wantVisible) {
      c.vis.x = 0;
      c.vis.v = 0;
    }
    const visible = c.visible;
    c.holder.visible = visible;
    c.shadow.visible = visible;
    if (!visible) {
      c.screenSize = 0;
      return;
    }

    // Blink.
    if (c.blinkT < 0 && t > c.blinkNext) c.blinkT = 0;
    if (c.blinkT >= 0) {
      c.blinkT += dt;
      const bt = c.blinkT / 0.15;
      c.blink = bt < 0.5 ? bt * 2 : Math.max(0, 2 - bt * 2);
      if (bt >= 1) {
        c.blinkT = -1;
        c.blink = 0;
        c.blinkNext = t + 1.8 + Math.random() * 3.5 + (Math.random() < 0.15 ? -1.5 : 0);
      }
    }

    // Look target: explicit target > recent pointer > idle wander.
    let lx: number;
    let ly: number;
    const look = this.lookTarget ?? (pointerFresh ? this.pointer : null);
    if (look && look.x >= 0) {
      lx = clamp((look.x - c.pos.x) / (s * 2.5), -1, 1);
      ly = clamp((look.y - c.pos.y) / (s * 2.5), -1, 1);
    } else {
      lx = noise1(t * 0.23 + (isMav ? 0 : 50)) * 0.7;
      ly = noise1(t * 0.19 + 9 + (isMav ? 0 : 50)) * 0.4;
    }
    c.lookX = approach(c.lookX, lx, 4, dt);
    c.lookY = approach(c.lookY, ly, 4, dt);

    // Feed the rig.
    const f = c.frame;
    f.t = t;
    f.dt = dt;
    f.p = c.params;
    f.emotion = emo;
    f.actions = c.actions;
    f.speak = c.speak;
    f.lookX = c.lookX;
    f.lookY = c.lookY;
    f.velX = c.pos.vx / s;
    f.velY = c.pos.vy / s;
    f.dragging = !!c.drag;
    f.travelHop = c.hop;
    f.blink = c.blink;
    f.reduced = this.reduced;
    c.rig.update(f);

    // Place in world (CSS px on z=0, y flipped). Hop raises the body.
    const size = c.size.x;
    const pop = c.vis.x;
    const modelScale = size / 2 / c.rig.fitHalf;
    const hopPx = c.hop * size * 0.55;
    // Sparky sits a little in front of Maverick so it overlaps correctly; compensate the
    // perspective so the on-screen position/size still match the anchor exactly.
    const wz = isMav ? 0 : Math.min(size * 0.9, 120);
    const camZ = this.camera.position.z;
    const k = (camZ - wz) / camZ;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const wx = cx + (c.pos.x - cx) * k;
    const wy = -(cy + (c.pos.y - hopPx - cy) * k);
    c.holder.position.set(wx, wy, wz);
    c.holder.scale.setScalar(Math.max(0.0001, modelScale * pop * k));
    c.holder.lookAt(this.camera.position);
    c.holder.updateMatrixWorld();

    // Screen-space footprint for hit testing.
    c.screenX = c.pos.x;
    c.screenY = c.pos.y - hopPx - c.rig.lift * modelScale * 0.5;
    c.screenSize = size * clamp(pop, 0, 1.2);

    // Contact shadow on the "ground" below the home position.
    const liftPx = hopPx + c.rig.lift * modelScale;
    const fade = clamp(1 - liftPx / (size * 0.9), 0.15, 1);
    const sz = wz - size * 0.6;
    const ks = (camZ - sz) / camZ;
    const groundY = -(cy + (c.pos.y + size * (isMav ? 0.45 : 0.44) - cy) * ks);
    c.shadow.position.set(cx + (c.pos.x - cx) * ks, groundY, sz);
    c.shadow.scale.set(size * (isMav ? 0.72 : 0.5) * (0.6 + 0.4 * fade) * pop * ks, size * 0.1 * (0.6 + 0.4 * fade) * pop * ks, 1);
    c.shadow.quaternion.copy(this.camera.quaternion);
    const sm = c.shadow.material as THREE.MeshBasicMaterial;
    const baseOpacity = this.theme === 'dark' ? 0.7 : 0.42;
    // Small header-sized mascots get no contact shadow (it would spill onto labels below).
    sm.opacity = baseOpacity * fade * clamp(pop, 0, 1) * smoothstep(110, 170, size);

    // Fur physics: gravity + inertia into mesh space.
    if (isMav) {
      const rig = c.rig as MaverickRig;
      this.tmpQ.copy(c.holder.quaternion).invert();
      rig.furU.uGravity.value.set(0, -0.32, 0).applyQuaternion(this.tmpQ);
      const k = 0.0045;
      const ax = clamp(-c.pos.ax / s, -260, 260) * k;
      const ay = clamp(c.pos.ay / s, -260, 260) * k; // screen y down → world up flip
      const hopAcc = c.hop * 0.15;
      rig.furU.uInertia.value.set(ax, ay - hopAcc, 0).applyQuaternion(this.tmpQ);
      if (rig.furU.uInertia.value.length() > 1.1) rig.furU.uInertia.value.setLength(1.1);
      rig.beretU.uInertia.value.copy(rig.furU.uInertia.value).multiplyScalar(0.4);
      rig.setOpacity(1);
    } else {
      (c.rig as SparkyRig).setOpacity(clamp(pop, 0, 1));
    }

    this.updateEmitters(c, dt, size);
  }

  private updateRoam(c: MascotCtl, t: number, homeX: number, homeY: number) {
    const s = Math.max(30, c.size.x);
    if (c.roamTarget) {
      const d = Math.hypot(c.pos.x - c.roamTarget.x, c.pos.y - c.roamTarget.y);
      if (d < s * 0.2 && !c.roamDwellUntil) c.roamDwellUntil = t + (c.roam === 'explore' ? 1.2 + Math.random() * 2.2 : 1.4 + Math.random() * 1.8);
      if (c.roamDwellUntil && t > c.roamDwellUntil) {
        c.roamTarget = null;
        c.roamDwellUntil = 0;
        c.roamNext = t + (c.roam === 'explore' ? 0.4 + Math.random() * 1.2 : 2.5 + Math.random() * 3.5);
      }
      return;
    }
    if (t < c.roamNext) return;
    if (c.roam === 'gentle') {
      // Short excursion around home, then come back (null target = home).
      if (Math.hypot(c.pos.x - homeX, c.pos.y - homeY) > s * 0.3) {
        c.roamNext = t + 1;
        return;
      }
      const ang = Math.random() * Math.PI * 2;
      // Small excursion relative to home (home may legitimately sit in a header near the top).
      const m = s * 0.6;
      c.roamTarget = {
        x: clamp(homeX + Math.cos(ang) * s * 0.75, m, Math.max(m, this.W - m)),
        y: clamp(homeY + Math.sin(ang) * s * 0.25, m, Math.max(m, this.H - 120 - m)),
      };
    } else {
      // Explore the whole viewport, occasionally checking back in at home.
      if (Math.random() < 0.18) {
        c.roamTarget = { x: homeX, y: homeY };
      } else {
        const m = s * 0.6;
        c.roamTarget = this.clampSafe(
          { x: m + Math.random() * (this.W - 2 * m), y: 80 + m + Math.random() * (this.H - 200 - 2 * m) },
          s,
        );
      }
    }
    c.roamDwellUntil = 0;
  }

  private clampSafe(p: { x: number; y: number }, s: number) {
    const m = s * 0.6;
    return {
      x: clamp(p.x, m, Math.max(m, this.W - m)),
      y: clamp(p.y, 70 + m, Math.max(70 + m, this.H - 120 - m)),
    };
  }

  // ------------------------------------------------------------------ particles

  private headWorld(c: MascotCtl, out: THREE.Vector3) {
    (c.rig as MaverickRig | SparkyRig).getHeadTop(out);
    return c.holder.localToWorld(out);
  }

  private timer(c: MascotCtl, key: string, every: number, dt: number) {
    const v = (c.emitTimers[key] ?? Math.random() * every) - dt;
    if (v <= 0) {
      c.emitTimers[key] = every * (0.7 + Math.random() * 0.6);
      return true;
    }
    c.emitTimers[key] = v;
    return false;
  }

  private onEmotionEnter(c: MascotCtl, e: Emotion) {
    if (e === 'love') this.emitHearts(c, 4);
    if (e === 'excited') this.emitSparkles(c, 6);
    if (e === 'error' && c.id === 'sparky') this.emitSmoke(c, 5);
  }

  private updateEmitters(c: MascotCtl, dt: number, size: number) {
    const e = c.frame.emotion;
    const red = this.reduced ? 3 : 1;
    if (e === 'love' && this.timer(c, 'heart', 0.42 * red, dt)) this.emitHearts(c, 1);
    if (e === 'sleepy' && this.timer(c, 'z', 1.3 * red, dt)) {
      const p = this.headWorld(c, this.tmpV);
      this.particles.emit({
        x: p.x + size * 0.25,
        y: p.y,
        z: p.z + 2,
        vx: size * 0.25,
        vy: size * 0.45,
        life: 2.2,
        size: size * 0.22,
        sizeEnd: size * 0.36,
        color: this.theme === 'dark' ? '#d9e6ff' : '#5b6b8c',
        shape: P.z,
        drag: 0.6,
        flutter: size * 0.12,
      });
    }
    if (e === 'confused' && this.timer(c, 'q', 1.6 * red, dt)) {
      const p = this.headWorld(c, this.tmpV);
      this.particles.emit({
        x: p.x + size * 0.18,
        y: p.y,
        z: p.z + 2,
        vy: size * 0.35,
        life: 1.6,
        size: size * 0.3,
        sizeEnd: size * 0.34,
        color: this.theme === 'dark' ? '#ffd166' : '#e09f00',
        shape: P.question,
        drag: 1.4,
      });
    }
    if (e === 'thinking' && this.timer(c, 'think', 1.1 * red, dt)) {
      const p = this.headWorld(c, this.tmpV);
      this.particles.emit({
        x: p.x + size * 0.3,
        y: p.y - size * 0.05,
        z: p.z + 2,
        vx: size * 0.1,
        vy: size * 0.25,
        life: 1.4,
        size: size * 0.08,
        sizeEnd: size * 0.16,
        color: this.theme === 'dark' ? '#ffffff' : '#7a8aa8',
        shape: P.dot,
        alpha: 0.75,
      });
    }
    if ((e === 'excited' || e === 'celebrate') && this.timer(c, 'sparkle', 0.35 * red, dt)) this.emitSparkles(c, 1);
    if (c.frame.emotion === 'speaking' && c.id === 'maverick' && c.speak > 0.6 && this.timer(c, 'note', 1.8, dt)) {
      // occasional tiny sparkle to sell the voice energy
      this.emitSparkles(c, 1);
    }

    if (c.id === 'sparky') {
      const p = c.params;
      // Embers rising from the flame tip.
      if (p.emberRate > 0.05 && this.timer(c, 'ember', 1 / (p.emberRate * (this.reduced ? 0.3 : 1)), dt)) {
        const h = this.headWorld(c, this.tmpV);
        this.particles.emit({
          x: h.x + (Math.random() - 0.5) * size * 0.3,
          y: h.y - size * 0.35,
          z: h.z + 1,
          vx: (Math.random() - 0.5) * size * 0.3 - c.pos.vx * 0.2,
          vy: size * (0.8 + Math.random() * 0.6),
          life: 0.9,
          size: size * 0.07,
          sizeEnd: size * 0.02,
          color: p.flameBlue > 0.5 ? '#8fb4ff' : p.flameGold > 0.5 ? '#ffd35a' : '#ff8a2a',
          shape: P.dot,
          additive: true,
          drag: 0.8,
          flutter: size * 0.2,
        });
      }
      if (p.smokeRate > 0.05 && this.timer(c, 'smoke', 1 / p.smokeRate, dt)) this.emitSmoke(c, 1);
    }
  }

  private emitHearts(c: MascotCtl, n: number) {
    const s = c.size.x;
    for (let i = 0; i < n; i++) {
      this.particles.emit({
        x: c.pos.x + (Math.random() - 0.5) * s * 0.7,
        y: -(c.pos.y - s * 0.2),
        z: 0,
        vx: (Math.random() - 0.5) * s * 0.4,
        vy: s * (0.55 + Math.random() * 0.4),
        life: 1.8,
        size: s * 0.2,
        sizeEnd: s * 0.28,
        color: Math.random() < 0.5 ? '#ff4d7d' : '#ff7aa8',
        shape: P.heart,
        drag: 0.9,
        flutter: s * 0.25,
      });
    }
  }

  private emitSparkles(c: MascotCtl, n: number) {
    const s = c.size.x;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit({
        x: c.pos.x + Math.cos(a) * s * 0.55,
        y: -(c.pos.y) + Math.sin(a) * s * 0.5,
        z: 0,
        vx: Math.cos(a) * s * 0.3,
        vy: Math.sin(a) * s * 0.3 + s * 0.2,
        life: 0.8,
        size: s * 0.16,
        sizeEnd: 0,
        color: c.id === 'sparky' ? '#ffd35a' : this.theme === 'dark' ? '#bfe3ff' : '#ffc53d',
        shape: P.sparkle,
        additive: this.theme === 'dark',
        drag: 1.5,
      });
    }
  }

  private emitSmoke(c: MascotCtl, n: number) {
    const s = c.size.x;
    const h = this.headWorld(c, this.tmpV);
    for (let i = 0; i < n; i++) {
      this.particles.emit({
        x: h.x + (Math.random() - 0.5) * s * 0.3,
        y: h.y - s * 0.4,
        z: h.z + 1,
        vx: (Math.random() - 0.5) * s * 0.3,
        vy: s * 0.5,
        life: 1.6,
        size: s * 0.25,
        sizeEnd: s * 0.7,
        color: this.theme === 'dark' ? '#9aa0ad' : '#b4bcc8',
        shape: P.smoke,
        alpha: this.theme === 'dark' ? 0.5 : 0.38,
        drag: 0.8,
      });
    }
  }

  private burstConfetti(c: MascotCtl) {
    const s = c.size.x;
    const colors = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#9b5de5', '#f15bb5', '#ffffff'];
    const n = this.reduced ? 10 : 46;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + Math.random() * 0.7);
      const v = s * (2.2 + Math.random() * 2.2);
      this.particles.emit({
        x: c.pos.x,
        y: -(c.pos.y - s * 0.2),
        z: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 2.2,
        size: s * (0.08 + Math.random() * 0.06),
        color: colors[i % colors.length],
        shape: P.confetti,
        gravity: -s * 4.5,
        drag: 1.6,
        flutter: s * 0.5,
      });
    }
  }

  // ------------------------------------------------------------------ input

  private onResize = () => {
    this.resize();
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.wake();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.stop();
  };

  private onContextRestored = () => {
    this.contextLost = false;
    // GL objects from the lost context are gone; drop them without deleting.
    this.envRT = null;
    this.pmrem = null;
    this.buildEnvironment();
    this.resize();
    this.wake();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.press || e.button > 0) return;
    const id = this.hitTest(e.clientX, e.clientY);
    if (!id) return;
    e.stopPropagation();
    e.preventDefault();
    this.consumedAt = performance.now();
    const pressId = id;
    const timer = window.setTimeout(() => {
      if (!this.press || this.press.dragging) return;
      this.press.long = true;
      const c = this.ctl(pressId)!;
      this.setEmotion(pressId, 'love', { durationMs: 2600 });
      this.emitHearts(c, 5);
      this.emit(c, 'longpress');
    }, LONG_PRESS_MS);
    this.press = { id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dragging: false, long: false, timer };
  };

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.at = this.time;
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    const c = this.ctl(p.id)!;
    if (!p.dragging && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP_MOVE_TOLERANCE) {
      p.dragging = true;
      clearTimeout(p.timer);
      c.drag = { x: e.clientX, y: e.clientY, ox: c.pos.x - p.x0, oy: c.pos.y - p.y0 };
      c.visit?.resolve();
      c.visit = null;
      if (c.emotion === 'idle') this.setEmotion(c.id, 'surprised', { durationMs: 900 });
      this.emit(c, 'drag-start');
    }
    if (p.dragging && c.drag) {
      c.drag.x = e.clientX;
      c.drag.y = e.clientY;
    }
    this.wake();
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(p.timer);
    this.press = null;
    this.consumedAt = performance.now();
    const c = this.ctl(p.id)!;
    if (p.dragging) {
      c.drag = null;
      // Fling back home with a hop and a happy wiggle.
      this.react(c.id, 'jump');
      this.setEmotion(c.id, 'happy', { durationMs: 1400 });
      this.emit(c, 'drag-end');
      return;
    }
    if (p.long) return;
    const now = performance.now();
    if (this.lastTap && this.lastTap.id === c.id && now - this.lastTap.at < DOUBLE_TAP_MS) {
      this.lastTap = null;
      this.react(c.id, 'spin');
      this.setEmotion(c.id, 'excited', { durationMs: 1500 });
      this.emit(c, 'doubletap');
      return;
    }
    this.lastTap = { id: c.id, at: now };
    this.react(c.id, 'poke');
    if (c.emotion === 'idle' || c.emotion === 'happy') this.setEmotion(c.id, 'happy', { durationMs: 1300 });
    this.emit(c, 'tap');
  };

  private onPointerCancel = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    clearTimeout(p.timer);
    this.press = null;
    const c = this.ctl(p.id)!;
    if (c.drag) {
      c.drag = null;
      this.emit(c, 'drag-end');
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.press) e.preventDefault();
  };

  private onClickCapture = (e: MouseEvent) => {
    if (performance.now() - this.consumedAt < 450) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  private onContextMenu = (e: Event) => {
    if (this.press || performance.now() - this.consumedAt < 800) e.preventDefault();
  };
}

/** True if this device can create a WebGL2 context. */
export function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl;
    (gl as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
