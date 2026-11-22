import * as THREE from 'three';
import type { Game } from '../core/Game';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import type { Model } from '../render/Assets';
import type { Fixture, LightPool } from '../render/LightPool';
import { GROUP, groups, PhysicsWorld, RAPIER } from '../physics/Physics';
import { ui } from '../ui/store';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

/** what the sub needs from the world it dives in */
export interface SubWorld {
  floor(x: number, z: number): number;
  /** the water surface (a very low value where there is no water) */
  surface(x: number, z: number): number;
  /** water current at a point (m/s) */
  current(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
}

/**
 * A two-person research submersible: neutrally buoyant when trimmed (ballast is not simulated beyond that), six
 * thrusters give it about 1.6 m/s ahead (2.4 boosted), 0.8 m/s up or down and a slow yaw; water drag bleeds speed
 * within seconds; it is pushed by the current like everything else in the water. It collides with rock through a
 * kinematic character controller (the canyon walls, overhangs, the outcrops) and rests on the floor on its skids.
 * In water too shallow to float it crawls on the tracks of its skids. The hatch only opens at the surface.
 */
export class Submersible {
  root = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  yawRate = 0;
  pitch = 0;
  hull = 1;
  lights = true;
  piloted = false;
  /** 0..1 how hard the thrusters are working (noise for the animals that hear it) */
  thrust = 0;
  cam: 'cockpit' | 'chase' = 'chase';
  private body: RAPIER.RigidBody;
  private col: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  private lamps: Fixture[] = [];
  /** the instrument glow in the sphere (on while someone is aboard) */
  private cabin: Fixture | null = null;
  private shakeT = 0;
  private chaseYaw = 0;
  /** water column over the hull top (m); negative: surfaced */
  depth = 0;
  /** model scale (an ROV is the same frame built small) */
  scale = 1;
  /** flown remotely from where the crew member stands (no cabin; the controls can be put down anywhere) */
  remote = false;

  constructor(private game: Game, public model: Model, private phys: PhysicsWorld, private lightsPool: LightPool, private W: SubWorld, opts: { scale?: number; remote?: boolean } = {}) {
    this.scale = opts.scale ?? 1;
    this.remote = !!opts.remote;
    this.root.add(model.root);
    model.root.scale.setScalar(this.scale);
    this.root.name = this.remote ? 'rov' : 'minisub';
    const k = this.scale;
    this.body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.col = phys.world.createCollider(RAPIER.ColliderDesc.capsule(1.0 * k, 1.05 * k).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }).setTranslation(0, 1.1 * k, 0)
      .setCollisionGroups(groups(GROUP.VEHICLE, GROUP.WORLD | GROUP.PLAYER)), this.body);
    this.kcc = phys.world.createCharacterController(0.05);
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(0.3, 0.3, false);
    this.kcc.setMaxSlopeClimbAngle(Math.PI / 2);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    for (const m of model.ofKind('light')) {
      const f = lightsPool.addFromMarker(m.node, m.data, true);
      f.group = 'sub';
      if (m.data.room === 'cabin') this.cabin = f;
      else this.lamps.push(f);
    }
  }

  place(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p); this.yaw = yaw; this.vel.set(0, 0, 0);
    this.body.setTranslation(this.pos, true);
    this.sync();
  }

  get submerged() { return this.depth > 0.3; }

  setLights(on: boolean) {
    this.lights = on;
    for (const f of this.lamps) f.on = on;
    bus.emit('sfx', { id: 'switch', ui: true });
  }

  /** forward direction (the model's +Y in Blender is -Z here) */
  forward(out: THREE.Vector3) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  fixedUpdate(dt: number) {
    const g = this.game, inp = g.input, W = this.W;
    const floor = W.floor(this.pos.x, this.pos.z);
    const surf = W.surface(this.pos.x, this.pos.z);
    const waterDepth = surf - floor;
    const k = this.scale;
    this.depth = surf - (this.pos.y + 2.1 * k);
    const afloat = waterDepth > 2.4 * k;
    // controls
    let fwd = 0, side = 0, up = 0, turn = 0;
    if (this.piloted && !g.uiFocus) {
      fwd = (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0);
      turn = (inp.down('left') ? 1 : 0) - (inp.down('right') ? 1 : 0);
      up = (inp.down('jump') ? 1 : 0) - (inp.down('crouch') ? 1 : 0);
      side = 0;
      if (inp.pressed('flashlight') || inp.pressed('headlights')) this.setLights(!this.lights);
      if (inp.pressed('camera')) this.toggleCam();
    }
    const boost = this.piloted && inp.down('sprint') ? 1.5 : 1;
    const damaged = 0.4 + 0.6 * this.hull;
    // thrusters accelerate against linear drag: terminal ~1.6 m/s ahead, 0.8 m/s vertically
    const drag = 0.9;
    this.forward(_v);
    const a = new THREE.Vector3().addScaledVector(_v, fwd * 1.45 * boost * damaged).addScaledVector(new THREE.Vector3(-_v.z, 0, _v.x), side * 0.6);
    a.y = up * 0.75 * damaged;
    this.thrust = clamp(Math.abs(fwd) * boost * 0.6 + Math.abs(up) * 0.3 + Math.abs(turn) * 0.2, 0, 1);
    W.current(this.pos, _w);
    if (afloat) {
      // water: thrust, drag toward the current, neutral buoyancy
      this.vel.addScaledVector(a, dt);
      this.vel.x += (_w.x - this.vel.x) * (1 - Math.exp(-drag * dt));
      this.vel.z += (_w.z - this.vel.z) * (1 - Math.exp(-drag * dt));
      this.vel.y += (_w.y - this.vel.y) * (1 - Math.exp(-drag * 1.6 * dt));
      // at the surface it floats with the hatch clear
      if (this.depth < -0.5 && this.vel.y > 0) this.vel.y *= 0.5;
      if (this.depth < -0.6) this.vel.y -= 2 * dt;
    } else {
      // in the shallows it sits on its skids: their tracks crawl it along the floor (about 2 m/s at most)
      this.vel.x *= Math.exp(-1.5 * dt); this.vel.z *= Math.exp(-1.5 * dt);
      this.vel.addScaledVector(_v, fwd * 3.2 * boost * damaged * dt);
      this.vel.y = -1;
    }
    this.yawRate += ((afloat ? turn * 0.45 : turn * 0.4) - this.yawRate) * (1 - Math.exp(-1.5 * dt));
    this.yaw += this.yawRate * dt;
    // collide and slide (rock, overhangs, the terrain under the hull)
    const desired = _w.copy(this.vel).multiplyScalar(dt);
    this.kcc.computeColliderMovement(this.col, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(GROUP.VEHICLE, GROUP.WORLD));
    const mv = this.kcc.computedMovement();
    const hitScale = desired.lengthSq() > 1e-9 ? Math.hypot(mv.x, mv.y, mv.z) / desired.length() : 1;
    if (hitScale < 0.5 && this.vel.length() > 0.8) this.impact(this.vel.length() * (1 - hitScale));
    this.pos.x += mv.x; this.pos.y += mv.y; this.pos.z += mv.z;
    // the analytic floor and the surface bound it as well (terrain colliders stream round the player only); afloat it
    // rides with the top of its frame just awash
    const fl = W.floor(this.pos.x, this.pos.z);
    if (afloat && this.pos.y > surf - 1.4 * k) { this.pos.y = surf - 1.4 * k; this.vel.y = Math.min(0, this.vel.y); }
    if (this.pos.y < fl + 0.02) { if (this.vel.y < -0.8) this.impact(-this.vel.y); this.pos.y = fl + 0.02; this.vel.y = Math.max(0, this.vel.y); }
    // the vel reflects the actual movement (so sliding along a wall kills the into-wall speed)
    if (dt > 0) { this.vel.set(mv.x / dt, this.vel.y, mv.z / dt); }
    this.body.setNextKinematicTranslation(this.pos);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setNextKinematicRotation(_q);
    this.pitch += ((fwd * -0.04 + up * 0.06) - this.pitch) * (1 - Math.exp(-2 * dt));
    if (this.cabin) this.cabin.on = this.piloted;
    this.sync();
    // the pilot is carried along (the terrain streams round the player); an ROV's pilot stays put
    if (this.piloted && !this.remote) g.player.pos.copy(this.pos).add(_v.set(0, 1.0, 0));
  }

  /** a knock against rock or a creature: the hull takes it in proportion to the speed */
  impact(speed: number, from = 'rock') {
    if (speed < 0.6) return;
    const dmg = Math.min(0.25, (speed - 0.5) * 0.05);
    if (this.game.settings.creative.damageProtection || this.game.settings.creative.autoRepair) { this.shakeT = 0.5; bus.emit('sfx', { id: 'thud', ui: true, gain: 0.6 }); return; }
    this.hull = Math.max(0, this.hull - dmg);
    this.shakeT = 0.6;
    bus.emit('sfx', { id: 'thud', ui: true, gain: Math.min(1, speed / 3) });
    if (dmg > 0.03) ui.toast(`${this.remote ? 'ROV' : 'Hull'} struck (${from}) · integrity ${(this.hull * 100).toFixed(0)} %`, 'warn', 3);
    if (this.hull < 0.3) ui.toast('Hull integrity low: surface and return', 'warn', 5);
  }

  private sync() {
    this.root.position.copy(this.pos);
    this.root.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - 1 / 60);
      this.game.renderer.shake = this.shakeT * 0.03;
    }
  }

  toggleCam() {
    this.cam = this.cam === 'chase' ? 'cockpit' : 'chase';
    this.applyCam();
  }

  applyCam() {
    const g = this.game;
    // from inside, the acrylic sphere is the window itself (its reflections of the sky would fog the whole view)
    const shell = this.model.root.getObjectByName('sub_sphere');
    if (shell) shell.visible = !(this.piloted && this.cam === 'cockpit' && !this.remote);
    if (!this.piloted) return;
    if (this.cam === 'cockpit' && this.remote) {
      // the ROV's own camera, at the front of its frame
      g.cameraDriver = () => {
        const cam = g.renderer.camera;
        this.forward(_v);
        cam.position.copy(this.pos).addScaledVector(_v, 1.7 * this.scale).add(_w.set(0, 1.0 * this.scale, 0));
        cam.quaternion.setFromEuler(new THREE.Euler(this.pitch - 0.08, this.yaw, 0, 'YXZ'));
      };
    } else if (this.cam === 'cockpit') {
      // the pilot's own view out of the acrylic sphere
      g.cameraDriver = null;
    } else {
      this.chaseYaw = this.yaw;
      g.cameraDriver = (dt) => {
        const cam = g.renderer.camera;
        this.chaseYaw += (this.yaw - this.chaseYaw) * (1 - Math.exp(-2.5 * dt));
        const back = new THREE.Vector3(Math.sin(this.chaseYaw), 0, Math.cos(this.chaseYaw));
        const target = _v.copy(this.pos).add(new THREE.Vector3(0, 1.2, 0));
        cam.position.copy(target).addScaledVector(back, 8.5 * Math.max(0.45, this.scale)).add(new THREE.Vector3(0, 2.6 * Math.max(0.45, this.scale), 0));
        // keep the chase camera out of the rock and under the surface
        const fl = this.W.floor(cam.position.x, cam.position.z);
        cam.position.y = Math.max(cam.position.y, fl + 1.0);
        cam.position.y = Math.min(cam.position.y, this.W.surface(cam.position.x, cam.position.z) - 0.3 + (this.depth < 0 ? 3 : 0));
        cam.lookAt(target.x, target.y + 0.3, target.z);
      };
    }
  }

  board() {
    const g = this.game;
    this.piloted = true;
    g.player.suited = true;
    g.interactions.suspended = true;
    if (this.remote) {
      // the crew member stands at the controls; the ROV goes where they send it
      g.player.mode = 'frozen';
      this.cam = 'chase';
    } else {
      // seated in the sphere (the pilot moves with the sub; the seat sets the cockpit view)
      const seat = this.model.marker('seat', 'pilot');
      if (seat) g.player.sit({ node: seat.node, eye: 0.62, yawLimit: 2.2 });
    }
    this.applyCam();
    ui.set({ mode: 'sub', hints: ['W / S  ahead / astern · A / D  turn', 'SPACE / C  up / down · SHIFT  boost', `L  lamps · V  camera · E  ${this.remote ? 'put down the controls' : 'leave (at the surface)'}`, 'R  scan · J  field codex'] });
    bus.emit('sfx', { id: this.remote ? 'beep' : 'hatch', ui: true });
  }

  /** out through the top hatch: only at the surface (or stranded in the shallows) */
  leave(at: (p: THREE.Vector3) => void): boolean {
    if (this.remote) {
      const g = this.game;
      this.piloted = false;
      this.applyCam();
      g.cameraDriver = null;
      g.player.mode = 'walk';
      g.interactions.suspended = false;
      this.thrust = 0;
      ui.set({ mode: 'foot', hints: [], gauges: [] });
      bus.emit('sfx', { id: 'beep', ui: true });
      return true;
    }
    if (this.depth > -0.2 && this.W.surface(this.pos.x, this.pos.z) - this.W.floor(this.pos.x, this.pos.z) > 2.4 * this.scale) {
      ui.toast(`Surface first: ${this.depth.toFixed(0)} m of water over the hatch`, 'warn', 3);
      bus.emit('sfx', { id: 'ui_deny', ui: true });
      return false;
    }
    const g = this.game;
    this.piloted = false;
    this.applyCam();
    g.cameraDriver = null;
    g.player.lookEnabled = true;
    g.interactions.suspended = false;
    this.thrust = 0;
    this.forward(_v);
    const p = this.pos.clone().addScaledVector(new THREE.Vector3(-_v.z, 0, _v.x), 2.6);
    at(p);
    ui.set({ mode: 'foot', hints: [], gauges: [] });
    bus.emit('sfx', { id: 'hatch', ui: true });
    return true;
  }

  hud(): { label: string; value: string; warn?: boolean }[] {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    return [
      { label: 'Depth', value: `${Math.max(0, this.W.surface(this.pos.x, this.pos.z) - this.pos.y - 1.1).toFixed(0)} m` },
      { label: 'Under keel', value: `${Math.max(0, this.pos.y - this.W.floor(this.pos.x, this.pos.z)).toFixed(1)} m` },
      { label: 'Speed', value: `${sp.toFixed(1)} m/s` },
      { label: 'Heading', value: `${String(Math.round(((-this.yaw * 180) / Math.PI + 360) % 360)).padStart(3, '0')}°` },
      { label: 'Hull', value: `${(this.hull * 100).toFixed(0)} %`, warn: this.hull < 0.5 },
      { label: 'Lamps', value: this.lights ? 'on' : 'off' },
    ];
  }

  dispose() {
    for (const f of this.lamps) this.lightsPool.remove(f);
    if (this.cabin) this.lightsPool.remove(this.cabin);
    this.phys.world.removeCharacterController(this.kcc);
    if (this.phys.world.bodies.contains(this.body.handle)) this.phys.world.removeRigidBody(this.body);
    this.root.removeFromParent();
  }
}
