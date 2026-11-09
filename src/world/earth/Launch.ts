import * as THREE from 'three';
import type EarthZone from '../zones/EarthZone';
import type { NasaSite } from './NasaSite';
import { Spacecraft, surfaceEnv, type FlightEnv } from '../../vehicles/Spacecraft';
import { FlightControl, type AutopilotProgram } from '../../vehicles/FlightControl';
import { CraftModel } from '../../vehicles/CraftModel';
import { Smoke } from '../../vehicles/Plume';
import { Plume } from '../../vehicles/Plume';
import type { VehicleState } from '../../core/State';
import type { SpacecraftSpec } from '../../data/vehicles';
import { h } from '../../ui/UI';
import { CREW } from '../../data/characters';

const COM_HEIGHT = 25; // centre of mass above the stack base (m)

const S1: SpacecraftSpec = {
  kind: 'rocket', dryMass: 30000, propMax: 380000, mainThrust: 10.0e6, mainIsp: 300, vtolThrust: 0, vtolIsp: 1, rcsThrust: 0,
  rcsTorque: [9e7, 9e7, 4e7], rcsIsp: 300, inertia: [1.4e8, 1.4e8, 3e6], dragArea: 22, liftCoef: 0, length: 80, crew: 4, powerDraw: 0, gearHeight: 0, dockPorts: [], label: 'LAUNCH VEHICLE',
};
const S2: SpacecraftSpec = { ...S1, dryMass: 8000, propMax: 88000, mainThrust: 1.1e6, mainIsp: 450, rcsTorque: [2e7, 2e7, 8e6], inertia: [2.4e7, 2.4e7, 9e5], dragArea: 12, length: 40, label: 'UPPER STAGE' };
const RANGER_WET = 41000;

/** Gravity-turn ascent guidance with max-Q throttling and staging handled by LaunchSequence. */
class AscentGuidance implements AutopilotProgram {
  name = 'ASCENT GUIDANCE';
  allowManual = false;
  constructor(readonly seq: LaunchSequence) {}
  update(c: Spacecraft, _dt: number, env: FlightEnv) {
    const hgt = c.pos[1] - this.seq.padY;
    const t = this.seq.missionT;
    const theta = hgt < 900 ? 0 : (85 * Math.pow(Math.min(1, (hgt - 900) / 44000), 0.55) * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(theta), Math.cos(theta), 0);
    c.sas = 'target';
    c.attTarget.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 0, -1)));
    const rho = env.density(c.pos);
    const v = c.speed();
    const q = 0.5 * rho * v * v;
    c.throttle = this.seq.coasting ? 0 : q > 26000 ? 0.72 : 1;
    const msg = hgt < 300 ? 'Clearing the silo' : q > 26000 ? 'Max-Q — throttling down' : this.seq.stageNo === 1 ? 'Stage 1 — gravity turn' : 'Stage 2 — climbing to orbit';
    return { msg, timeScale: t < 16 ? 1 : this.seq.stageNo === 1 ? 2.5 : 3 };
  }
}

/**
 * Launch of Ranger 1 from the NASA silo: boarding, checks, silo doors, countdown, liftoff, max-Q, staging,
 * cloud penetration, handover to orbital flight at ~45 km.
 */
export class LaunchSequence {
  phase: 'checks' | 'countdown' | 'ascent' | 'handover' | 'aborted' = 'checks';
  craft!: Spacecraft;
  control!: FlightControl;
  stack = new THREE.Group();
  stage1Node: THREE.Object3D | null = null;
  stageNo = 1;
  coasting = false;
  missionT = -999;
  padY = 0;
  private countdown = 10;
  private smoke: Smoke;
  private trail: Smoke;
  private s1plumes: Plume[] = [];
  private s2plume: Plume | null = null;
  private stackState: VehicleState;
  private env: FlightEnv;
  private s1Free: { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3 } | null = null;
  private rangerModel!: CraftModel;
  private mode: 'auto' | 'manual' = 'auto';
  private sub = 0;

  constructor(readonly zone: EarthZone, readonly nasa: NasaSite) {
    const st = zone.game.state;
    this.stackState = {
      id: 'stack', type: 'rocket', name: 'Launch vehicle', location: 'earth', pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0, 0], angVel: [0, 0, 0],
      fuel: S1.propMax, fuelMax: S1.propMax, power: 1, damage: {}, maintenance: 0, docked: null, landed: false, gearDown: false, passengers: [], autopilot: null, lights: true, hatchOpen: false, data: {},
    };
    this.env = surfaceEnv({ g0: 9.81, radius: 6.371e6, scaleHeight: 8500, rho0: 1.225 });
    const mats = zone.game.materials;
    this.smoke = new Smoke(2200, 0xe4dfd6, 14, mats.tex('noise', false, 1));
    this.trail = new Smoke(1600, 0xd8d0c4, 22, mats.tex('noise', false, 1));
    zone.scene.add(this.smoke.points, this.trail.points);
    void st;
  }

  get game() {
    return this.zone.game;
  }

  /** Board: seat the commander in the pilot seat, crew in the passenger seats, show the preparation panel. */
  begin() {
    const game = this.game;
    const n = this.nasa;
    const rocket = n.rocket, ranger = n.ranger;
    // build the stack group at the rocket base; children keep their world placement
    const base = rocket.root.position.clone();
    this.padY = base.y;
    this.stack.position.copy(base);
    this.zone.scene.add(this.stack);
    this.stack.attach(rocket.root);
    this.stack.attach(ranger.root);
    this.stage1Node = rocket.nodes.get('stage1') ?? null;
    // plumes on the stage-1 engines and the stage-2 nozzle
    const s1p = rocket.nodes.get('s1_plume');
    for (const [x, z] of [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
      const p = new Plume({ radius: 1.1, length: 70, core: 0xfff3d0, edge: 0xff8a2a, intensity: 9 });
      p.mesh.rotation.x = -Math.PI / 2; // point down the stack
      p.mesh.position.set(x, -2.7, -z);
      (this.stage1Node ?? rocket.root).add(p.mesh);
      this.s1plumes.push(p);
    }
    void s1p;
    const s2n = rocket.nodes.get('stage2');
    if (s2n) {
      this.s2plume = new Plume({ radius: 1.3, length: 55, core: 0xf2f6ff, edge: 0x7a9cff, intensity: 6 });
      this.s2plume.mesh.rotation.x = -Math.PI / 2;
      this.s2plume.mesh.position.set(0, 0.8, 0);
      s2n.add(this.s2plume.mesh);
    }
    this.rangerModel = new CraftModel(ranger, 'ranger');
    // craft simulation: body -Z = stack up
    this.craft = new Spacecraft(S1, this.stackState);
    this.craft.payload = 96000 + RANGER_WET;
    this.craft.pos[0] = base.x;
    this.craft.pos[1] = base.y + COM_HEIGHT;
    this.craft.pos[2] = base.z;
    this.craft.quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    this.craft.gearDown = false;
    this.craft.sas = 'target';
    this.craft.attTarget.copy(this.craft.quat);
    this.craft.unlimited = false;
    // seat the player
    const seat = ranger.nodes.get('seat_pilot');
    const eye = ranger.nodes.get('seat_pilot_eye');
    if (seat && eye) {
      game.player.sit({ id: 'ranger1_pilot', anchor: seat, eye, frame: this.zone.ground, exit: () => this.zone.ground.anchor.position.clone(), yawLimit: 1.6 });
    }
    // crew board and take their seats
    const people = (this.zone.content as any).people;
    const seats = ['seat_copilot', 'seat_p1', 'seat_p2'];
    let i = 0;
    for (const npc of people?.npcs ?? []) {
      if (!CREW.includes(npc.state.id)) continue;
      const s = ranger.nodes.get(seats[i++]);
      if (!s) continue;
      npc.visible = true;
      npc.sitting = null;
      npc.path = [];
      s.add(npc.body.root);
      npc.body.root.position.set(0, -0.05, 0.1);
      npc.body.root.rotation.set(0, 0, 0);
      npc.body.play('sit', 0);
      (npc as any).boarded = true;
      npc.state.aboard = 'ranger1';
      npc.state.frame = 'ranger1';
    }
    game.state.vehicles.ranger1.passengers = ['commander', ...CREW];
    // flight control (camera/HUD); manual input disabled until liftoff
    this.control = new FlightControl(game, 'launch', this.craft, this.stack, eye ?? null, this.env, 'RANGER 1 · LAUNCH');
    this.control.camModes = ['cockpit', 'chase', 'tower', 'orbital'];
    this.control.towerPos = new THREE.Vector3(base.x + 26, this.zone.gen.siloTop + 6, base.z + 26);
    this.control.infoFn = () => ({ extra: [['STAGE', this.stageNo === 1 ? 'S1 (5×)' : this.stageNo === 2 ? 'S2' : 'RANGER'], ['T+', this.missionT > 0 ? `${this.missionT.toFixed(0)} s` : `${(-this.countdown).toFixed(0)} s`]] });
    this.control.exitFn = () => {
      if (this.phase === 'checks') {
        this.abort();
        return true;
      }
      game.notify('You cannot leave the seat during launch.', 'warn', 2);
      return false;
    };
    game.player.mode = 'seat';
    game.setControl(this.control);
    game.audio.door('airlock');
    game.say('computer', 'Ranger 1 hatch sealed. Cabin pressurising.', 4);
    this.openChecklist();
  }

  private openChecklist() {
    const game = this.game;
    game.input.releaseLock();
    const items = ['Crew boarded and strapped in', 'Airlock closed — hatch seal verified', 'Cabin pressurised — 101.3 kPa', 'Launch computer initialised', 'Guidance platform aligned', 'Silo doors open', 'Range clear — GO for launch'];
    game.ui.openPanel('LAUNCH PREPARATION — RANGER 1', (b, p) => {
      const list = h('div', { class: 'list' });
      const rows = items.map((t) => {
        const st = h('span', { class: 'mono dim' }, 'PENDING');
        const row = h('div', { class: 'item' }, h('span', {}, t), st);
        list.append(row);
        return st;
      });
      const btns = h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } });
      const go = (mode: 'auto' | 'manual') => {
        this.mode = mode;
        p.close();
        game.input.requestLock();
        this.startCountdown();
      };
      const auto = game.ui.button('FULL LAUNCH AUTOPILOT', () => go('auto'), 'btn primary');
      const man = game.ui.button('MANUAL ASCENT (guidance cues)', () => go('manual'), 'btn');
      const abort = game.ui.button('ABORT — LEAVE THE CRAFT', () => { p.close(); this.abort(); }, 'btn danger');
      auto.disabled = man.disabled = true;
      btns.append(auto, man, abort);
      b.append(h('div', { class: 'dim', style: { fontSize: '12px', marginBottom: '10px' } }, 'The flight computer runs the checklist. Choose who flies the ascent: the autopilot flies the full sequence with cinematic compressed time; in manual you fly pitch and throttle with SAS assist (staging is automatic).'), list, btns);
      let i = 0;
      const tick = () => {
        if (!b.isConnected) return;
        if (i === 5) this.nasa.siloDoorsOpen = true;
        if (i < rows.length) {
          rows[i].textContent = 'GO';
          rows[i].className = 'mono status-ok';
          game.audio.ui('confirm');
          i++;
          setTimeout(tick, i === 6 ? 2600 : 900);
        } else auto.disabled = man.disabled = false;
      };
      setTimeout(tick, 600);
    }, { onClose: () => { if (this.phase === 'checks' && !game.ui.panelOpen) game.input.requestLock(); } });
  }

  abort() {
    const game = this.game;
    this.phase = 'aborted';
    game.setControl(null);
    this.control.dispose();
    const spot = this.nasa.site.inst.nodes.get('arm_tip');
    const p = spot ? this.nasa.site.localPos(spot) : game.player.pos.clone();
    game.player.enterFrame(this.zone.ground, p, Math.PI / 2);
    game.notify('Launch held. You may board again when ready.', 'info', 4);
    (this.zone as any).launch = null;
  }

  startCountdown() {
    this.phase = 'countdown';
    this.countdown = 10.99;
    this.game.ui.letterbox(true);
    this.game.audio.music?.setMood('launch');
    this.control.camMode = 'cockpit';
  }

  update(dt: number) {
    const game = this.game;
    if (this.phase === 'aborted') return;
    this.rangerModel?.update(dt, null, 1, { mainLevel: 0, vtolLevel: 0 });
    if (this.phase === 'countdown') {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== prev && now >= 0) {
        game.ui.countdown(now > 0 ? `T − ${now}` : 'LIFTOFF');
        if (now <= 10 && now > 0) game.say('capcom', now === 10 ? 'T minus ten.' : now === 6 ? 'Ignition sequence start.' : String(now), 1);
        game.audio.beep(now > 0 ? 880 : 1320, 0.12, 0.05);
      }
      // ignition at T-3: engines spool up while held down
      const spool = THREE.MathUtils.clamp((3 - this.countdown) / 3, 0, 1);
      for (const p of this.s1plumes) p.update(dt, spool * 0.9, 1);
      if (spool > 0) {
        this.craft.mainLevel = spool;
        this.emitPadSmoke(dt, spool);
        this.control.shakeExtra = spool * 0.6;
      }
      if (this.countdown <= 0) {
        this.phase = 'ascent';
        this.missionT = 0;
        this.control.setAutopilot(new AscentGuidance(this));
        if (this.mode === 'manual') {
          this.control.setAutopilot(null);
          this.craft.throttle = 1;
          this.craft.sas = 'stability';
          this.control.say('Manual ascent: hold vertical until clear of the silo, then pitch east (D) gently.');
        }
        this.control.camMode = 'tower';
        game.audio.thud(undefined, 0.8, 50);
        game.ui.countdown(null);
        setTimeout(() => game.ui.countdown(null), 1500);
        game.state.vehicles.ranger1.data.mounted = false;
        game.flag('launched', true);
        game.state.mission.stage = 'launched';
      }
      this.sync();
      this.smoke.update(dt, 0.35, 1.2, 3.5);
      return;
    }
    if (this.phase !== 'ascent') return;
    // physics with autopilot time compression (substeps)
    const scale = this.control.timeScale;
    let remaining = dt * scale;
    while (remaining > 1e-4) {
      const h = Math.min(remaining, 0.04);
      remaining -= h;
      this.missionT += h;
      this.control.runAutopilot(h);
      this.craft.step(h, this.env);
      this.staging(h);
    }
    // manual mode: keep throttle up while S1 burns unless the player reduced it
    this.sync();
    // plumes & effects
    const atmo = Math.min(1, this.env.density(this.craft.pos) / 1.225 * 4);
    const lvl = this.craft.mainLevel;
    for (const p of this.s1plumes) p.update(dt, this.stageNo === 1 ? lvl : 0, atmo);
    this.s2plume?.update(dt, this.stageNo === 2 ? lvl : 0, atmo);
    const alt = this.craft.pos[1] - this.padY;
    if (alt < 400) this.emitPadSmoke(dt, lvl);
    if (atmo > 0.05 && lvl > 0.1 && this.stageNo === 1) {
      const base = new THREE.Vector3(0, -COM_HEIGHT - 4, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)).applyQuaternion(this.craft.quat).add(new THREE.Vector3(...this.craft.pos));
      for (let k = 0; k < 3; k++) this.trail.emit(base, new THREE.Vector3((Math.random() - 0.5) * 4, -10, (Math.random() - 0.5) * 4), 8 + atmo * 10, 3);
    }
    this.smoke.update(dt, 0.25, 1.4, 4);
    this.trail.update(dt, 0.15, 0.2, 2.2);
    if (this.s1Free) {
      const f = this.s1Free;
      f.vel.y -= 9.81 * dt * scale;
      f.pos.addScaledVector(f.vel, dt * scale);
      f.obj.position.copy(f.pos);
      f.obj.rotation.x += f.spin.x * dt;
      f.obj.rotation.z += f.spin.z * dt;
      if (f.pos.distanceTo(new THREE.Vector3(...this.craft.pos)) > 20000) {
        f.obj.removeFromParent();
        this.s1Free = null;
      }
    }
    // cloud penetration whiteout
    const clouds = (this.zone as any).clouds as import('../../render/Clouds').CloudLayer | undefined;
    if (clouds) {
      const inside = clouds.inside(game.camera.position.y);
      game.renderer.fx.fade = inside * 0.75;
      game.renderer.fx.fadeColor.setRGB(0.85, 0.86, 0.88);
    }
    this.control.shakeExtra = atmo * lvl * 0.7;
    if (this.missionT > 16 && this.control.camMode === 'tower') this.control.camMode = 'chase';
    // handover to orbital flight
    if (alt > 45000 && this.phase === 'ascent') this.handover();
  }

  private staging(dt: number) {
    if (this.stageNo === 1 && this.craft.state.fuel <= 0) {
      this.stageNo = 2;
      this.coasting = true;
      this.game.say('computer', 'Main engine cutoff. Stage separation.', 3);
      this.game.audio.thud(undefined, 0.6, 90);
      // detach stage 1 as a free tumbling body
      if (this.stage1Node) {
        const wp = this.stage1Node.getWorldPosition(new THREE.Vector3());
        const wq = this.stage1Node.getWorldQuaternion(new THREE.Quaternion());
        this.zone.scene.attach(this.stage1Node);
        this.stage1Node.position.copy(wp);
        this.stage1Node.quaternion.copy(wq);
        this.s1Free = { obj: this.stage1Node, pos: wp, vel: new THREE.Vector3(...this.craft.vel).multiplyScalar(0.97), spin: new THREE.Vector3(0.12, 0, 0.05) };
      }
      // switch the craft to stage 2 (mass/thrust), offset the centre of mass upward
      const keepVel = [...this.craft.vel];
      this.craft.spec = S2;
      this.craft.state.fuel = S2.propMax;
      this.craft.state.fuelMax = S2.propMax;
      this.craft.payload = RANGER_WET;
      this.craft.vel[0] = keepVel[0];
      this.craft.vel[1] = keepVel[1];
      this.craft.vel[2] = keepVel[2];
      setTimeout(() => {
        this.coasting = false;
        this.game.say('computer', 'Stage two ignition.', 2);
      }, 1800 / Math.max(1, this.control.timeScale));
    }
    void dt;
  }

  private emitPadSmoke(dt: number, lvl: number) {
    const base = this.stack.position.clone();
    const n = Math.floor(lvl * 40 * Math.min(1, dt * 30));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 12 + Math.random() * 18;
      // steam billows up the silo and out of the doors
      this.smoke.emit(base.clone().add(new THREE.Vector3(Math.cos(a) * 6, 2, Math.sin(a) * 6)), new THREE.Vector3(Math.cos(a) * sp * 0.4, 25 + Math.random() * 20, Math.sin(a) * sp * 0.4), 6 + Math.random() * 6, 3);
    }
  }

  private sync() {
    const c = this.craft;
    // model: body -Z = stack up, the group origin is the stack base
    const q = c.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    this.stack.quaternion.copy(q);
    const baseOff = new THREE.Vector3(0, -COM_HEIGHT, 0).applyQuaternion(q);
    this.stack.position.set(c.pos[0] + baseOff.x, c.pos[1] + baseOff.y, c.pos[2] + baseOff.z);
    this.stack.updateMatrixWorld(true);
  }

  /** Hand the stack over to orbital flight (space zone). */
  private handover() {
    this.phase = 'handover';
    const game = this.game;
    const c = this.craft;
    const R = 6.371e6;
    const local = {
      // Earth-centred position in the local launch axes (east=+X, up=+Y, south=+Z)
      r: [c.pos[0] - this.stack.userData.x0 || 0, 0, 0],
    };
    void local;
    const st = game.state.vehicles.ranger1;
    const base = this.nasa.rocket.root.parent ? this.padY : this.padY;
    st.data.launch = {
      x: c.pos[0] - this.nasa.origin.x, y: c.pos[1] - base + R, z: c.pos[2] - this.nasa.origin.z,
      vx: c.vel[0] + 465 * Math.cos((39.2 * Math.PI) / 180), vy: c.vel[1], vz: c.vel[2],
      q: [c.quat.x, c.quat.y, c.quat.z, c.quat.w],
      stage: this.stageNo, s2fuel: this.stageNo === 2 ? c.state.fuel : S2.propMax, s1fuel: this.stageNo === 1 ? c.state.fuel : 0,
      t: this.missionT, mode: this.mode,
    };
    st.location = 'space';
    st.data.mounted = false;
    for (const id of CREW) {
      const n = game.state.npcs[id];
      n.frame = 'ranger1';
      n.aboard = 'ranger1';
    }
    game.ui.letterbox(false);
    game.renderer.fx.fade = 0;
    game.setControl(null);
    this.control.dispose();
    game.goTo('space', { at: 'launch' }, { fade: 0.8 });
  }
}
