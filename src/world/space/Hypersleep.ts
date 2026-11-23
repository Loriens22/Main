import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { clamp } from '../../core/math';
import { assets, Marker, Model } from '../../render/Assets';
import { Humanoid } from '../../npc/Humanoid';
import type { NPC, NPCManager } from '../../npc/NPC';
import type { PhysicsWorld } from '../../physics/Physics';
import type { Fixture, LightPool } from '../../render/LightPool';
import { mission } from '../../mission/Mission';
import { ui } from '../../ui/store';

/**
 * The hypersleep pods of the cryo-lab (blender/assets/cryopod.py). Each pod carries one authored 12 s timeline:
 * the lid opens, the eye climbs in and lies down, the film closes round the body, the lid closes. Going to sleep
 * plays it forward with the camera riding the eye; waking plays it backward (lid opens, film opens, the commander
 * sits up and climbs out, lid closes). The crew sleeps in the other pods meanwhile.
 */
const FPS = 30;
/** moments of the timeline (s): the eye lies down at T_LIE (from here the sleeper's body is in the pod) */
const T_LIE = 176 / FPS;
const T_WRAP = 195 / FPS;
const T_CLOSE = 285 / FPS;   // (film and lid sounds at these moments)
const CREW = ['reyes', 'hartmann', 'okoye'];
/** what the commander's own body wears (seen from the inside under the film) */
const COMMANDER = { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_brown', skin: 'skin', scale: 1.0 };

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _f = new THREE.Vector3();

export class CryoPod {
  readonly mixer: THREE.AnimationMixer;
  /** the timeline's clips (one per animated object: lid, film, eyes), all 12 s long and played together */
  private actions: THREE.AnimationAction[] = [];
  readonly duration: number;
  /** position on the timeline (s) */
  t = 0;
  private to = 0;
  private done: (() => void) | null = null;
  /** the crew member asleep in it */
  sleeper: NPC | null = null;
  /** the crew member who lies down in it once its timeline reaches the lying moment */
  expected: NPC | null = null;
  /** its light at the head of the tub: on while the pod is open or in use */
  light: Fixture | null = null;
  private sleeperBrain: unknown = null;

  constructor(public model: Model, public index: number, public side: 'l' | 'r') {
    this.mixer = new THREE.AnimationMixer(model.root);
    this.duration = Math.max(1, ...model.clips.map((c) => c.duration));
    for (const clip of model.clips) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      a.paused = true;
      this.actions.push(a);
    }
    this.seek(0);
  }

  get busy() { return this.done !== null; }
  get lieNode() { return this.model.node('lie', 'crew') ?? this.model.root; }

  seek(t: number) {
    this.t = clamp(t, 0, this.duration);
    if (!this.actions.length) return;
    for (const a of this.actions) a.time = Math.min(this.t, a.getClip().duration - 1e-4);
    this.mixer.update(0);
  }

  /** Run the timeline to `to` in real time, then call back. */
  run(to: number, done: () => void = () => {}) {
    this.to = clamp(to, 0, this.duration);
    this.done = done;
  }

  update(dt: number) {
    if (!this.done) return;
    const d = this.to - this.t;
    if (Math.abs(d) <= dt) {
      this.seek(this.to);
      const cb = this.done;
      this.done = null;
      cb();
      return;
    }
    this.seek(this.t + Math.sign(d) * dt);
  }

  /** Straight back to the start (closed and empty). */
  stop() {
    this.done = null;
    this.seek(0);
  }

  /** World pose of the eye for the side the commander climbs in from. */
  eye(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const n = this.model.node('eye', this.side) ?? this.model.root;
    n.updateWorldMatrix(true, false);
    n.matrixWorld.decompose(pos, quat, _s);
  }

  /** a crew member lies down in the pod (or gets up beside it) */
  setSleeper(n: NPC | null, standAt?: THREE.Vector3, yaw = 0) {
    if (n) {
      this.sleeper = n;
      this.sleeperBrain = n.brain;
      n.brain = null;
      n.attach(this.lieNode, 'lie');
      return;
    }
    const s = this.sleeper;
    if (!s) return;
    s.detach(standAt, yaw);
    s.brain = this.sleeperBrain as NPC['brain'];
    this.sleeper = null;
  }
}

export type BayState = 'idle' | 'entering' | 'asleep' | 'waking';

export class CryoBay {
  pods: CryoPod[] = [];
  state: BayState = 'idle';
  active: CryoPod | null = null;
  /** the commander's own body, lying in the active pod (head hidden: the camera is in it) */
  private body: Humanoid | null = null;
  private from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private blend = 0;
  private sleepUntil: number | null = null;
  /** the hibernation display has been seen open (closing it wakes the crew) */
  private shown = false;

  constructor(private game: Game, private parent: THREE.Object3D, private phys: PhysicsWorld, private npcs: () => NPCManager, private lights: LightPool) {}

  /** One pod per `cryo` marker of the interior, posed as the marker; `cull` adds it to its room's visibility. */
  async load(markers: Marker[], cull: (o: THREE.Object3D, at: THREE.Vector3) => void) {
    this.parent.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    for (const [k, m] of markers.entries()) {
      const model = await assets.load('cryo_pod');
      m.node.updateWorldMatrix(true, false);
      new THREE.Matrix4().multiplyMatrices(inv, m.node.matrixWorld).decompose(model.root.position, model.root.quaternion, _s);
      this.parent.add(model.root);
      model.root.updateMatrixWorld(true);
      this.phys.addTrimesh(model.colliders);
      const pod = new CryoPod(model, k, m.data.side === 'l' ? 'l' : 'r');
      const lm = model.ofKind('light')[0];
      if (lm) pod.light = this.lights.addFromMarker(lm.node, lm.data, false);
      this.pods.push(pod);
      cull(model.root, m.node.getWorldPosition(new THREE.Vector3()));
    }
    const bodyModel = await assets.load('char_civilian');
    const body = new Humanoid(bodyModel, COMMANDER);
    // the camera sits in the head: no head, no neck, no hair
    bodyModel.root.getObjectByName('neck')?.scale.setScalar(0.001);
    for (const p of ['hair', 'hair_long', 'cap']) { const o = bodyModel.part(p); if (o) o.visible = false; }
    body.pose = 'lie';
    bodyModel.root.visible = false;
    this.body = body;
  }

  /** Where the commander stands to use pod `k` (for the interaction prompt). */
  usePoint(k: number, out: THREE.Vector3) {
    const n = this.pods[k]?.model.marker('use', 'pod')?.node;
    return n ? n.getWorldPosition(out) : out.set(0, 0, 0);
  }

  /** Into pod `k`; asleep until `until` (voyage time, s) or, with null, a short rest. */
  sleep(k: number, until: number | null) {
    const pod = this.pods[k];
    const g = this.game;
    if (!pod || this.state !== 'idle') return;
    this.state = 'entering';
    this.active = pod;
    this.sleepUntil = until;
    // the commander's view leaves the body: frozen in place, the camera follows the pod's eye
    g.renderer.camera.getWorldPosition(this.from.pos);
    g.renderer.camera.getWorldQuaternion(this.from.quat);
    this.blend = 0;
    g.player.mode = 'frozen';
    g.player.setColliderEnabled(false);
    g.interactions.suspended = true;
    ui.set({ mode: 'cinematic', hints: [] });
    g.cameraDriver = (dt) => this.camera(dt);
    bus.emit('sfx', { id: 'door_slide', gain: 0.7 });
    bus.emit('sfx', { id: 'beep', ui: true, gain: 0.5 });
    // the crew lies down in the other pods
    const crew = this.npcs().list.filter((n) => CREW.includes(n.id) && !n.attached);
    for (const p of this.pods) {
      if (p === pod) continue;
      const n = crew.shift();
      if (!n) break;
      p.expected = n;
      p.run(p.duration);
    }
    pod.run(pod.duration, () => {
      bus.emit('sfx', { id: 'cryo', gain: 0.8 });
      this.state = 'asleep';
      this.asleepT = 0;
      this.shown = false;
      g.renderer.fadeTo(1, 2.2);
    });
    mission.note(until === null ? 'The commander rests in a hypersleep pod.' : 'The crew enters the hypersleep pods.');
  }

  /** Out of the pods: everything backward. */
  wake() {
    const pod = this.active;
    const g = this.game;
    if (!pod || this.state !== 'asleep') return;
    this.state = 'waking';
    g.renderer.fadeTo(0, 2.0);
    bus.emit('sfx', { id: 'airlock', gain: 0.5 });
    setTimeout(() => bus.emit('sfx', { id: 'door_slide', gain: 0.7 }), 300);
    for (const p of this.pods) if (p !== pod && p.sleeper) p.run(0, () => {});
    pod.run(0, () => this.release());
  }

  /** Back on the commander's feet beside the pod, where the timeline began. */
  private release() {
    const g = this.game, pod = this.active!;
    pod.eye(_p, _q);
    const pl = g.player;
    pl.mode = 'walk';
    pl.setColliderEnabled(true);
    // facing where the eye looked, in the body's own frame (the ring's floor)
    _f.set(0, 0, -1).applyQuaternion(_q).applyQuaternion(pl.basis.clone().invert());
    pl.teleportEye(_p, Math.atan2(-_f.x, -_f.z));
    pl.pitch = 0;
    g.cameraDriver = null;
    g.interactions.suspended = false;
    ui.set({ mode: 'foot', hints: [] });
    this.state = 'idle';
    this.active = null;
  }

  private camera(dt: number) {
    const pod = this.active;
    if (!pod) return;
    const cam = this.game.renderer.camera;
    pod.eye(_p, _q);
    // first from where the commander stood to the start of the climb (while the lid opens), then the eye itself
    this.blend = Math.min(1, this.blend + dt / 2.2);
    const k = this.state === 'entering' ? this.blend * this.blend * (3 - 2 * this.blend) : 1;
    cam.position.copy(this.from.pos).lerp(_p, k);
    cam.quaternion.copy(this.from.quat).slerp(_q, k);
    cam.updateMatrixWorld();
  }

  update(dt: number) {
    for (const p of this.pods) {
      const before = p.t;
      p.update(dt);
      // crew members lie down / get up as their pods' timelines pass the moment the eye lies down
      if (p.expected && before < T_LIE && p.t >= T_LIE) { p.setSleeper(p.expected); p.expected = null; }
      if (p.sleeper && before >= T_LIE && p.t < T_LIE) this.getUp(p);
    }
    // the commander's own body, in the pod from the moment of lying down
    const a = this.active, b = this.body;
    if (b) {
      const show = !!a && a.t >= T_LIE - 0.05;
      if (show && b.root.parent !== a!.lieNode) a!.lieNode.add(b.root);
      b.root.visible = show;
      if (show) b.update(dt);
    }
    // sounds of the film and the lid at their moments of the active timeline
    if (a && this.state !== 'asleep') {
      const t1 = a.t, t0 = this.lastT;
      const crossed = (m: number) => (t0 < m && t1 >= m) || (t0 > m && t1 <= m);
      if (crossed(T_WRAP + 0.2)) bus.emit('sfx', { id: 'whoosh', gain: 0.25 });
      if (crossed(T_CLOSE + 0.1)) bus.emit('sfx', { id: 'door_slide', gain: 0.7 });
      this.lastT = t1;
    }
    // asleep: the hibernation display counts the voyage down while it is skipped (opened once the screen has gone
    // dark, again if a pause got in the way); closing it wakes the crew
    if (this.state === 'asleep') {
      this.asleepT += dt;
      const open = ui.get().panel === 'cryo';
      if (open) this.shown = true;
      else if (this.shown) { this.shown = false; this.wake(); }
      else if (this.asleepT > 1.3 && this.game.state === 'playing' && !ui.get().panel) {
        this.game.openPanel('cryo', { mode: 'sleep', until: this.sleepUntil, pod: this.active?.index ?? 0 });
        this.shown = ui.get().panel === 'cryo';
      }
    }
    for (const p of this.pods) if (p.light) p.light.on = p.t > 0.12 && p.t < p.duration - 0.12;
  }
  private lastT = 0;
  private asleepT = 0;

  /** A crew member climbs out of pod p and stands at its head end, facing it (the aisle side is the commander's). */
  private getUp(p: CryoPod) {
    // pod frame in the engine: x across, y up (pit floor 0, cryo-lab floor 0.32), -z toward the head
    const m = p.model.root.matrixWorld;
    const at = new THREE.Vector3(0, 0.34, -1.85).applyMatrix4(m);
    const d = new THREE.Vector3(0, 0.34, 0).applyMatrix4(m).sub(at);
    this.parent.worldToLocal(at);
    p.setSleeper(null, at, Math.atan2(-d.x, -d.z));
  }

  /** Leaving the zone mid-sequence: everyone out, camera back. */
  abort() {
    if (this.state === 'idle') return;
    for (const p of this.pods) {
      if (p.sleeper) this.getUp(p);
      p.expected = null;
      p.stop();
    }
    this.shown = false;
    if (this.active) this.release();
  }
}
