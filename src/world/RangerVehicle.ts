import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Frame } from './Frame';
import type { ModelInstance } from '../render/Assets';
import { SPECS } from '../data/vehicles';
import { Spacecraft, type FlightEnv } from '../vehicles/Spacecraft';
import { FlightControl } from '../vehicles/FlightControl';
import type { HudInfo } from '../vehicles/FlightHUD';
import { CraftModel } from '../vehicles/CraftModel';
import { Site } from './Site';
import type { Interactable } from '../interact/Interaction';
import type { LadderRef } from '../player/Player';
import type { VehicleState } from '../core/State';
import type { V3 } from '../space/kepler';

/** What a zone with a free-flying / landed Ranger 1 provides (surface zones, the Earth zone on return). */
export interface RangerHost {
  readonly game: Game;
  readonly scene: THREE.Scene;
  readonly ground: Frame;
  readonly env: FlightEnv;
  groundHeight(x: number, z: number): number;
  groundNormal(x: number, z: number): THREE.Vector3;
  hudInfo(): Partial<HudInfo>;
}

/**
 * Ranger 1 flying over or standing on a planet's surface: the 6-DOF craft and its flight controls; once landed it
 * becomes a walkable site (cabin colliders, the cabin door, the rear hatch and the boarding ladder) the player can
 * leave and re-board. While the craft moves the site is dismantled and the model rides the craft again.
 */
export class RangerVehicle {
  inst!: ModelInstance;
  readonly root = new THREE.Group();
  model!: CraftModel;
  craft!: Spacecraft;
  control!: FlightControl;
  /** centre of mass in model space (the model root is offset by −com under `root`) */
  readonly com = new THREE.Vector3();
  site: Site | null = null;
  /** called once the craft has settled on its gear */
  onTouchdown: (() => void) | null = null;
  /** called when the hand-off to an exit is refused (e.g. in flight) */
  private landedT = 0;

  constructor(readonly host: RangerHost) {}

  get game() {
    return this.host.game;
  }

  async load() {
    this.inst = await this.game.assets.instance('ranger');
    this.root.add(this.inst.root);
    this.root.name = 'ranger1';
    this.host.scene.add(this.root);
    this.model = new CraftModel(this.inst, 'ranger');
    this.inst.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (!/glass/i.test(m.name)) return;
      // the exterior 'dark glass' is too opaque from the seat: the crew must see the sky and the ground
      const swap = (mat: THREE.Material) => {
        if (!mat.name.startsWith('glass_dark')) return mat;
        const c = (mat as THREE.MeshPhysicalMaterial).clone();
        c.opacity = 0.18;
        c.color.setRGB(0.05, 0.06, 0.07);
        c.depthWrite = false;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
  }

  /** Pose resting on the gear at (x, z), heading `yaw` (rad). */
  landedPose(x: number, z: number, yaw: number) {
    const n = this.host.groundNormal(x, z);
    // a few millimetres of gear compression, so contact holds even in milli-g gravity
    const y = this.host.groundHeight(x, z) + SPECS.ranger.gearHeight - 0.004;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    return { pos: [x, y, z] as V3, q };
  }

  create(st: VehicleState) {
    this.craft = new Spacecraft(SPECS.ranger, st);
    this.craft.unlimited = this.game.state.creative.unlimitedResources;
    this.craft.sas = 'stability';
    this.craft.onImpact = (s) => this.impact(s);
    if (st.landed) {
      this.craft.landed = true;
      this.craft.contact = true;
      this.craft.gearDown = true;
    }
    this.syncRoot();
    this.model.gearT = this.craft.gearDown ? 1 : 0;
    return this.craft;
  }

  /** Sit in the pilot seat and take the controls. */
  seat() {
    const game = this.game;
    const seat = this.inst.nodes.get('seat_pilot');
    const eye = this.inst.nodes.get('seat_pilot_eye');
    const p = game.player;
    const frame = this.host.ground;
    p.enterFrame(frame, new THREE.Vector3(0, 0, 0), 0, 'walk');
    if (seat && eye) p.sit({ id: 'ranger1_pilot', anchor: seat, eye, frame, exit: () => this.modelToLocal(new THREE.Vector3(0, 0.45, 1.1)), yawLimit: 1.6 });
    p.mode = 'seat';
    const prev = this.control;
    this.control = new FlightControl(game, 'ranger1', this.craft, this.root, eye ?? null, this.host.env, 'RANGER 1');
    if (prev) {
      this.control.setAutopilot(prev.autopilot);
      this.control.camMode = prev.camMode;
      prev.dispose();
    }
    this.control.camModes = ['cockpit', 'chase', 'orbital'];
    this.control.infoFn = () => this.host.hudInfo();
    this.control.exitFn = () => this.leaveSeat();
    game.setControl(this.control);
  }

  /** model-space point (three axes, relative to the GLB root) → frame local */
  modelToLocal(v: THREE.Vector3) {
    this.inst.root.updateWorldMatrix(true, false);
    return v.clone().applyMatrix4(this.inst.root.matrixWorld);
  }

  leaveSeat(): boolean {
    if (!this.craft.landed) {
      this.game.notify('Land first — you cannot leave the pilot seat in flight.', 'warn', 2.5);
      return false;
    }
    this.makeSite();
    setTimeout(() => {
      const pl = this.game.player;
      if (pl.mode === 'seat') pl.stand();
      this.game.notify('Cabin door, then the rear hatch (E) — the ladder takes you down to the ground.', 'info', 6);
    }, 0);
    return true;
  }

  /** Straight out beside the ladder (debug / quick EVA). */
  beginEva(quiet = false) {
    this.makeSite();
    this.game.setControl(null);
    const foot = this.modelToLocal(new THREE.Vector3(0, -1.2, 10.4));
    foot.y = this.host.groundHeight(foot.x, foot.z) + 0.05;
    this.game.player.stand?.();
    this.game.player.enterFrame(this.host.ground, foot, Math.PI, 'walk');
    this.game.input.context = 'walk';
    if (!quiet) this.game.notify('On the ground beside Ranger 1.', 'info', 3);
  }

  makeSite() {
    if (this.site) return;
    const inst = this.inst;
    inst.root.updateWorldMatrix(true, false);
    const placement = inst.root.matrixWorld.clone();
    this.site = new Site(this.game, inst, {
      name: 'ranger1', frame: this.host.ground, parent: this.host.scene, placement, doorSound: 'hatch', colliders: 'all',
      handlers: {
        ladder: (n, site) => this.ladder(n, site),
        hatch: (n, site) => {
          const d = site.registerDoor(n, 'hatch');
          d.locked = () => null;
          return null;
        },
      },
    });
    const seat = inst.nodes.get('seat_pilot');
    if (seat) {
      this.site.register({
        id: 'ranger1:pilot', targets: [seat], range: 2,
        label: () => 'Take the pilot seat',
        use: () => {
          this.seat();
          this.game.audio.ui('click');
        },
      } as Interactable);
    }
  }

  removeSite() {
    const s = this.site;
    if (!s) return;
    const ph = this.host.ground.physics;
    for (const cols of s.colliderMap.values()) for (const c of cols) ph.world.removeCollider(c, false);
    for (const id of ['ranger_rear_hatch', 'ranger_cabin_door']) ph.doors.delete(id);
    for (const d of s.doors.values()) {
      d.open = false;
      d.t = 0;
      d.node.quaternion.copy(d.baseQ);
    }
    s.dispose();
    this.site = null;
    this.inst.root.position.copy(this.com).negate();
    this.inst.root.quaternion.identity();
    this.inst.root.scale.setScalar(1);
    this.root.add(this.inst.root);
  }

  private ladder(n: THREE.Object3D, site: Site): Interactable | null {
    const top = this.modelToLocal(new THREE.Vector3(0, 0.42, 8.62));
    const bottom = this.modelToLocal(new THREE.Vector3(0, -1.25, 8.62));
    const exitB = this.modelToLocal(new THREE.Vector3(0, 0.5, 7.85));
    const exitA = this.modelToLocal(new THREE.Vector3(0, -1.2, 9.5));
    exitA.y = this.host.groundHeight(exitA.x, exitA.z) + 0.05;
    bottom.y = Math.max(bottom.y, exitA.y + 0.2);
    const face = this.modelToLocal(new THREE.Vector3(0, 0, 0)).sub(this.modelToLocal(new THREE.Vector3(0, 0, 1))).normalize();
    const ref: LadderRef = { id: 'ranger_ladder', frame: this.host.ground, a: bottom, b: top, exitA, exitB, face };
    return {
      id: 'ranger1:ladder', targets: [n], range: 2.4,
      label: () => {
        const d = site.doors.get('ranger_rear_hatch');
        return d && !d.open ? 'Open the rear hatch first' : 'Climb the ladder';
      },
      use: () => {
        const d = site.doors.get('ranger_rear_hatch');
        if (d && !d.open) {
          site.toggleDoor('ranger_rear_hatch', true);
          return;
        }
        this.game.player.grabLadder(ref);
      },
    } as Interactable;
  }

  /** inside the cabin with the rear hatch shut */
  cabinPressurised(l: THREE.Vector3) {
    if (!this.inst) return false;
    const inv = new THREE.Matrix4().copy(this.inst.root.matrixWorld).invert();
    const m = l.clone().applyMatrix4(inv);
    const inside = Math.abs(m.x) < 2.3 && m.y > -0.2 && m.y < 2.6 && m.z > -2 && m.z < 8.4;
    const hatch = this.site?.doors.get('ranger_rear_hatch');
    return inside && !(hatch && hatch.t > 0.05);
  }

  /** external kinematic override (Miller's waves carry the craft): return true to skip this frame's physics */
  hold: ((dt: number) => boolean) | null = null;
  /** seconds until flooded engines can fire again */
  flooded = 0;

  /** Physics (with autopilot), touchdown detection, model sync. */
  update(dt: number) {
    const c = this.craft;
    if (this.flooded > 0) {
      this.flooded -= dt;
      c.efficiency = 0;
      if (this.flooded <= 0) {
        c.efficiency = Math.max(0.5, this.game.state.vehicles.ranger1.damage.engines ?? 1);
        this.game.notify(`Engines drained — thrust restored${c.efficiency < 0.99 ? ` (${Math.round(c.efficiency * 100)} %)` : ''}.`, 'ok', 4);
      }
    }
    if (!this.site && this.hold?.(dt)) {
      c.writeState();
      this.syncRoot();
      this.model.update(dt, c, 0);
      return;
    }
    const flying = this.game.control === this.control;
    // leave the walkable-site mode when the craft is about to move
    if (this.site && flying && (c.throttle > 0.01 || c.vtol > 0.05 || this.control.autopilot)) {
      this.removeSite();
      c.landed = false;
    }
    if (!this.site) {
      let rem = dt;
      let guard = 0;
      while (rem > 1e-6 && guard++ < 200) {
        const h = Math.min(rem, 0.02);
        if (this.control.autopilot) this.control.runAutopilot(h);
        c.step(h, this.host.env);
        rem -= h;
      }
      // settled on the gear: contact may flicker frame to frame in milli-g, so let the timer decay rather than reset
      const still = Math.hypot(c.vel[0], c.vel[1], c.vel[2]) < 0.4;
      if ((c.landed || (c.contact && c.gearDown && still)) && c.throttle < 0.01 && c.vtol < 0.02) {
        this.landedT += dt;
        if (this.landedT > 0.6) {
          for (let k = 0; k < 3; k++) c.vel[k] = 0;
          c.angVel.set(0, 0, 0);
          c.landed = true;
        }
      } else this.landedT = Math.max(0, this.landedT - dt * 2);
      c.writeState();
      if (this.landedT > 1.2 && !this.control.autopilot) {
        this.makeSite();
        this.onTouchdown?.();
      }
    }
    this.syncRoot();
    this.model.update(dt, this.site ? null : c, 0);
    this.site?.update(dt);
  }

  syncRoot() {
    const c = this.craft;
    if (this.site) return;
    this.root.position.set(c.pos[0], c.pos[1], c.pos[2]);
    this.root.quaternion.copy(c.quat);
    this.inst.root.position.copy(this.com).negate();
    this.root.updateMatrixWorld(true);
  }

  private impact(speed: number) {
    if (speed < 3.5) return;
    const g = this.game;
    if (speed < 9) {
      g.notify(`Hard landing — ${speed.toFixed(1)} m/s. Gear stressed.`, 'warn', 4);
      const d = g.state.vehicles.ranger1.damage;
      d.gear = Math.max(0, (d.gear ?? 1) - (speed - 3.5) * 0.08);
      g.renderer.fx.shake = 0.6;
      return;
    }
    g.renderer.fx.shake = 1.2;
    if (g.state.creative.damageProtection) {
      g.notify(`Crash at ${speed.toFixed(0)} m/s — Creative mode: the Ranger survives.`, 'alert', 6);
      return;
    }
    g.notify(`Ranger 1 crashed at ${speed.toFixed(0)} m/s.`, 'alert', 8);
    const d = g.state.vehicles.ranger1.damage;
    d.hull = Math.max(0, (d.hull ?? 1) - speed * 0.03);
    d.engines = Math.max(0, (d.engines ?? 1) - speed * 0.02);
  }

  dispose() {
    this.control?.dispose();
  }
}
