import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Controllable } from '../core/Controllable';
import type { Input } from '../core/Input';
import type { Spacecraft, FlightEnv, SasMode } from './Spacecraft';
import { FlightHUD, type HudInfo } from './FlightHUD';
import { Loops, type LoopHandle } from '../audio/Audio';

export interface AutopilotResult {
  done?: boolean;
  msg?: string;
  /** requested simulation rate (cinematic compressed time) */
  timeScale?: number;
  /** longest safe physics step while coasting (s) — lets the zone propagate analytically up to the next event */
  maxStep?: number;
}

export interface AutopilotProgram {
  name: string;
  update(craft: Spacecraft, dt: number, env: FlightEnv): AutopilotResult;
  /** manual input aborts the program unless this returns true */
  allowManual?: boolean;
  onEnd?(): void;
}

export type CamMode = 'cockpit' | 'chase' | 'orbital' | 'docking' | 'tower' | 'free' | 'cinematic';

const SAS_CYCLE: SasMode[] = ['stability', 'prograde', 'retrograde', 'radialOut', 'radialIn', 'normal', 'antinormal', 'surface', 'off'];

/**
 * Player flight control for any Spacecraft. The owning zone provides the render root (camera-relative in space),
 * the environment and the HUD data; it also performs physics stepping (with autopilot time compression).
 */
export class FlightControl implements Controllable {
  readonly context = 'flight' as const;
  hudView: FlightHUD;
  autopilot: AutopilotProgram | null = null;
  camMode: CamMode = 'cockpit';
  camModes: CamMode[] = ['cockpit', 'chase', 'orbital'];
  private camYaw = 0;
  private camPitch = -0.05;
  private chaseYaw = 0;
  private chasePitch = 0.18;
  private chaseDist = 1;
  private freePos = new THREE.Vector3();
  private freeQ = new THREE.Quaternion();
  messages: string[] = [];
  private msgT = 0;
  infoFn: (() => Partial<HudInfo>) | null = null;
  exitFn: (() => boolean) | null = null;
  towerPos: THREE.Vector3 | null = null;
  /** optional aim point for the tower camera (default: the craft root) */
  towerAim: (() => THREE.Vector3) | null = null;
  dockingCamNode: THREE.Object3D | null = null;
  engineLoop: LoopHandle | null = null;
  rcsLoop: LoopHandle | null = null;
  shakeExtra = 0;
  /** time compression requested by the active autopilot (zone reads this) */
  timeScale = 1;
  /** longest coast step the autopilot allows right now (s) */
  maxStep = 0.05;
  manualThrottleRate = 0.6;

  constructor(
    readonly game: Game,
    readonly id: string,
    readonly craft: Spacecraft,
    readonly root: THREE.Object3D, // craft render root (world-space transform used for cameras)
    readonly eye: THREE.Object3D | null, // cockpit eye anchor
    public env: FlightEnv,
    readonly title: string,
  ) {
    this.hudView = new FlightHUD(game.ui.layer);
    if (game.state.creative.freeCamera) this.camModes.push('free');
  }

  setAutopilot(p: AutopilotProgram | null) {
    if (this.autopilot && this.autopilot !== p) this.autopilot.onEnd?.();
    this.autopilot = p;
    if (p) this.say(`Autopilot engaged: ${p.name}`);
    else this.timeScale = 1;
  }

  say(m: string) {
    this.messages.unshift(m);
    this.messages = this.messages.slice(0, 4);
    this.msgT = 6;
  }

  /** the stick and throttle are busy with something else (fighting off a creature): they do not abort the autopilot */
  struggle = false;

  control(dt: number, input: Input) {
    const c = this.craft;
    const f = input.flight;
    const manual = Math.abs(f.pitch) + Math.abs(f.yaw) + Math.abs(f.roll) + Math.abs(f.tx) + Math.abs(f.ty) + Math.abs(f.tz) + Math.abs(f.throttle) > 0.05 || f.throttleSet !== null;
    if (this.autopilot && manual && !this.autopilot.allowManual && !this.struggle) {
      this.say('Manual input — autopilot disengaged');
      this.setAutopilot(null);
    }
    if (!this.autopilot) {
      // attitude: pitch (W/S), yaw (A/D), roll (Q/E)
      c.rcsR.set(f.pitch, f.yaw, f.roll);
      c.rcsT.set(f.tx, f.ty, -f.tz);
      c.throttle = THREE.MathUtils.clamp(c.throttle + f.throttle * this.manualThrottleRate * dt, 0, 1);
      if (f.throttleSet !== null) c.throttle = f.throttleSet;
      if (input.pressed('throttleMax')) c.throttle = 1;
      if (input.pressed('throttleCut')) c.throttle = 0;
      // VTOL: on craft with ventral thrusters, translate-up/down (keys, stick or touch pad) drives hover thrust
      if (c.spec.vtolThrust > 0) {
        const want = f.ty > 0.25 ? Math.min(1, f.ty) : f.ty < -0.25 ? 0 : null;
        if (want !== null) c.vtol = THREE.MathUtils.damp(c.vtol, want, 3 * Math.abs(f.ty), dt);
        else if (input.held('brake')) c.vtol = THREE.MathUtils.damp(c.vtol, 0, 6, dt);
        if (Math.abs(f.ty) > 0.25) c.rcsT.y = 0;
      }
    }
    if (input.pressed('sas')) {
      const i = SAS_CYCLE.indexOf(c.sas);
      c.sas = SAS_CYCLE[(i + 1) % SAS_CYCLE.length];
      c.attTarget.copy(c.quat);
      this.say(`SAS: ${c.sas.toUpperCase()}`);
      this.game.audio.ui('click');
    }
    if (input.pressed('rcs')) {
      c.rcsOn = !c.rcsOn;
      this.say(`RCS ${c.rcsOn ? 'ON' : 'OFF'}`);
    }
    if (input.pressed('gear')) {
      c.gearDown = !c.gearDown;
      this.say(`Landing gear ${c.gearDown ? 'DOWN' : 'UP'}`);
      this.game.audio.burst({ dur: 2.5, freq: 260, q: 2, gain: 0.12, noise: 'brown', type: 'lowpass', attack: 0.2, air: false });
    }
    if (input.pressed('autopilot')) (this.game.zone as any)?.openAutopilotMenu?.(this);
    // camera look
    if (this.camMode === 'cockpit') {
      this.camYaw = THREE.MathUtils.clamp(this.camYaw + input.look.x, -2.4, 2.4);
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + input.look.y, -1.2, 1.4);
    } else if (this.camMode === 'free') {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(input.look.y, input.look.x, 0, 'YXZ'));
      this.freeQ.multiply(q);
      const mv = new THREE.Vector3(f.yaw * -1, 0, -f.pitch).applyQuaternion(this.freeQ).multiplyScalar(dt * 40);
      this.freePos.add(mv);
    } else {
      this.chaseYaw += input.look.x;
      this.chasePitch = THREE.MathUtils.clamp(this.chasePitch + input.look.y, -1.3, 1.3);
    }
    if (input.wheel) this.chaseDist = THREE.MathUtils.clamp(this.chaseDist * (1 + input.wheel * 0.12), 0.25, 30);
    this.msgT -= dt;
    if (this.msgT < 0 && this.messages.length) {
      this.messages.pop();
      this.msgT = 2;
    }
  }

  /** Run the autopilot for this physics substep (called by the zone before craft.step). */
  runAutopilot(dt: number) {
    if (!this.autopilot) {
      this.timeScale = 1;
      this.maxStep = 0.05;
      return;
    }
    const prog = this.autopilot;
    const r = prog.update(this.craft, dt, this.env);
    if (r.msg && r.msg !== this.messages[0]) this.say(r.msg);
    this.timeScale = r.timeScale ?? 1;
    this.maxStep = r.maxStep ?? 0.05;
    if (r.done) {
      // a program may chain its successor from inside update(); only clear it if it is still the active one
      if (this.autopilot === prog) {
        this.autopilot = null;
        this.timeScale = 1;
        this.maxStep = 0.05;
      }
      prog.onEnd?.();
    }
  }

  cycleCamera() {
    const i = this.camModes.indexOf(this.camMode);
    this.camMode = this.camModes[(i + 1) % this.camModes.length];
    if (this.camMode === 'free') {
      this.freePos.copy(this.game.camera.position);
      this.freeQ.copy(this.game.camera.quaternion);
    }
    this.say(`Camera: ${this.camMode.toUpperCase()}`);
  }

  camera(cam: THREE.PerspectiveCamera, dt: number) {
    this.root.updateMatrixWorld(true);
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const rp = this.root.getWorldPosition(new THREE.Vector3());
    const len = this.craft.spec.length;
    switch (this.camMode) {
      case 'cockpit': {
        const m = (this.eye ?? this.root).matrixWorld;
        const s = new THREE.Vector3();
        m.decompose(cam.position, cam.quaternion, s);
        cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.camPitch, this.camYaw, 0, 'YXZ')));
        break;
      }
      case 'chase':
      case 'orbital': {
        const dist = (this.camMode === 'chase' ? len * 2.1 + 8 : len * 9 + 120) * this.chaseDist;
        const off = new THREE.Vector3(0, 0, dist).applyEuler(new THREE.Euler(-this.chasePitch, this.chaseYaw, 0, 'YXZ')).applyQuaternion(rq);
        cam.position.copy(rp).add(off);
        const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
        cam.up.copy(upv);
        cam.lookAt(rp);
        cam.up.set(0, 1, 0);
        break;
      }
      case 'docking': {
        const n = this.dockingCamNode ?? this.root;
        n.updateWorldMatrix(true, false);
        const s = new THREE.Vector3();
        n.matrixWorld.decompose(cam.position, cam.quaternion, s);
        // the dock empty's local +Y (Blender) = outward along the port → three -Z
        break;
      }
      case 'tower': {
        const p = this.towerPos ?? rp.clone().add(new THREE.Vector3(60, -20, 60));
        cam.position.copy(p);
        cam.lookAt(this.towerAim?.() ?? rp);
        break;
      }
      case 'free':
        cam.position.copy(this.freePos);
        cam.quaternion.copy(this.freeQ);
        break;
      default:
        break;
    }
    // vibration from engines
    const shake = (this.craft.mainLevel * (this.env.density(this.craft.pos) > 0.01 ? 1 : 0.25) + this.shakeExtra) * (this.camMode === 'cockpit' ? 1 : 0.4);
    this.game.renderer.fx.shake = THREE.MathUtils.damp(this.game.renderer.fx.shake, shake * 0.35, 6, dt);
    cam.updateMatrixWorld(true);
  }

  hud() {
    if (this.game.input.touchActive) this.game.touch.syncFlight(this.craft.throttle, this.craft.spec.vtolThrust > 0);
    const extra = this.infoFn?.() ?? {};
    const info: HudInfo = {
      title: this.title,
      autopilot: this.autopilot?.name ?? null,
      messages: this.messages,
      timeWarp: this.game.clock.timeScale * this.timeScale,
      ...extra,
    };
    this.hudView.compact = this.game.input.touchActive;
    this.hudView.draw(this.craft, this.env, this.game.camera, info);
    this.updateAudio();
  }

  private updateAudio() {
    const a = this.game.audio;
    if (!a.ctx) return;
    if (!this.engineLoop) {
      this.engineLoop = a.loop(`craft_engine_${this.id}`, 'sfx', Loops.rocket(), { medium: 'structure', gain: 0.9 });
      this.rcsLoop = a.loop(`craft_rcs_${this.id}`, 'sfx', Loops.rcs(), { medium: 'structure', gain: 1 });
    }
    const lvl = Math.max(this.craft.mainLevel, this.craft.vtolLevel * 0.8);
    const inside = this.camMode === 'cockpit';
    this.engineLoop?.set('thrust', lvl * (inside ? 0.55 : 0.9), 0.1);
    this.engineLoop?.set('muffle', inside ? 0.8 : 0.2, 0.3);
    const rcs = Math.min(1, this.craft.rcsFire.length() + this.craft.rcsRotFire.length() * 0.6);
    this.rcsLoop?.set('level', rcs, 0.05);
  }

  exit(): boolean {
    if (this.exitFn) return this.exitFn();
    return false;
  }

  dispose() {
    this.hudView.dispose();
    this.engineLoop?.stop(0.5);
    this.rcsLoop?.stop(0.2);
    this.game.renderer.fx.shake = 0;
  }
}
