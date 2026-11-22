import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { bus } from '../core/events';
import { clamp, damp, lerp } from '../core/math';
import { ui } from '../ui/store';
import { mission } from './Mission';
import { story } from '../core/Story';
import { AscentEvent, AscentSim } from './Ascent';
import type { EarthZone } from '../world/earth/EarthZone';
import type { OrbitZone } from '../world/space/OrbitZone';
import type { Flight } from '../vehicles/Flight';
import type { NPC } from '../npc/NPC';
import { Smoke } from '../render/Smoke';
import { D2R, LAUNCH_SITE, OMEGA_EARTH, R_EARTH } from '../space/Earth';
import { W } from '../render/patch';
import type { AudioEngine, Emitter } from '../audio/Audio';

export type LaunchState = 'idle' | 'prep' | 'countdown' | 'liftoff' | 'ascent' | 'orbit' | 'scrubbed';

/** Who sits where in Ranger 1 (the commander flies from the left seat). */
const SEATING: [crewId: string, seat: string][] = [['reyes', 'pilot_r'], ['hartmann', 'crew_l'], ['okoye', 'crew_r']];

/** Radio calls of the terminal count: time to lift-off (s), speaker, line, optional action. */
interface Call { t: number; who: string; text: string; female?: boolean; act?: (d: LaunchDirector) => void; done?: boolean }

const CLOUD_Y = 3200;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _a = new THREE.Color();

/**
 * Runs the departure from Earth: crew boarding, the cockpit checklist (hatch, cabin pressure, launch computer),
 * the terminal count with silo cap and access arm, ignition, lift-off out of the silo with exhaust and vibration,
 * cloud penetration into the orbital zone, staging, orbit insertion and Ranger separation. Either the pilot steers
 * the ascent or the full launch autopilot flies it; compressed time is available for the long climb.
 */
export class LaunchDirector implements System {
  state: LaunchState = 'idle';
  check = { crew: false, hatch: false, pressure: 0, computer: 0 };
  private pressT = -1;
  private compT = -1;
  /** 'auto' = full launch autopilot; 'manual' = the pilot steers pitch and throttle, staging is automatic */
  mode: 'auto' | 'manual' = 'auto';
  /** compressed time during the ascent (sim seconds per real second) */
  warp = 1;
  /** seconds relative to lift-off (negative during the count) */
  t = -60;
  hold = false;
  sim: AscentSim | null = null;
  private prevH = 0; private curH = 0; private prevTilt = 0; private curTilt = 0; private prevDr = 0; private curDr = 0;
  private roll = 0;
  private calls: Call[] = [];
  private smoke: Smoke | null = null;
  private rocketSnd: Emitter | null = null;
  private thrustVis = 0;
  private flash = 0;
  private switching = false;
  private seated: NPC[] = [];
  private autoRun = false;
  /** between the fade-out and the seating */
  private boarding = false;
  private emitAcc = 0;
  /** ascent events already narrated */
  private seen = new Set<string>();

  constructor(private game: Game) {
    bus.on('launch:board', (o?: { auto?: boolean }) => this.board(!!o?.auto));
  }

  private get earth() { return this.game.zones.get('earth') as EarthZone; }
  private get orbit() { return this.game.zones.get('orbit') as OrbitZone; }
  private get flight() { return this.game.services.flight as Flight; }
  private get audio() { return this.game.services.audio as AudioEngine | undefined; }

  radio(who: string, text: string, female = false) {
    ui.say(who, text, Math.max(2.6, text.length * 0.055));
    bus.emit('radio:say', { who, text, female });
    mission.note(`${who}: ${text}`);
  }

  // ------------------------------------------------------------------------------------------- boarding and checklist
  /** Can the crew board Ranger 1 now (on Earth, nobody in the seats, no count running)? */
  canBoard() {
    const z = this.earth;
    return !this.boarding && (this.state === 'idle' || this.state === 'scrubbed') && !!z?.nasa?.ranger && this.game.zone === z && !this.flight.craft;
  }

  /**
   * Crew and commander into Ranger 1. `auto`: started from the mission computer, which then runs the cockpit
   * checklist and the count itself (the full launch autopilot), so the mission begins without walking to the arm.
   */
  board(auto = false) {
    if (!this.canBoard()) return false;
    const z = this.earth, nasa = z.nasa, g = this.game;
    this.boarding = true;
    void g.preload('orbit');
    g.renderer.fadeTo(1, 3);
    setTimeout(() => {
      this.boarding = false;
      if (g.zone !== z || this.flight.craft) { g.renderer.fadeTo(0, 1); return; }
      // out of the pickup (or any other vehicle) first
      const driving = g.services.driving as { vehicle: unknown; exit(): void } | undefined;
      if (driving?.vehicle) driving.exit();
      // started from a computer elsewhere: the commander is brought to the access arm first (location, sound, light)
      const arm = nasa.launch.marker('board', 'ranger');
      if (arm && g.player.pos.distanceTo(arm.node.getWorldPosition(_v)) > 20) g.player.stand(_v.clone().add(new THREE.Vector3(0, -0.95, 0)), 0);
      // the crew climbs in through the top hatch with the commander
      const staff = z.nasaStaff;
      this.seated = [];
      for (const [id, seat] of SEATING) {
        const n = staff?.npcs.get(id);
        const node = nasa.ranger.model.node('seat', seat);
        if (!n || !node) continue;
        (n as any).__brain = n.brain;
        n.brain = null;
        n.attach(node, 'sit', new THREE.Vector3(0, -0.5, 0.02));
        this.seated.push(n);
      }
      this.check = { crew: true, hatch: false, pressure: 0, computer: 0 };
      this.flight.enter(nasa.ranger, nasa.rangerEnv, 'pilot_l');
      this.flight.setLocked(true);
      this.flight.hudOverride = false;
      this.flight.chaseWorldUp = true;
      this.padCameras();
      this.flight.canLeave = () => (this.state === 'prep' ? null : 'Strapped in for launch.');
      this.flight.onLeave = () => this.unboard();
      this.state = 'prep';
      mission.setPhase('boarding');
      mission.note('Crew aboard Ranger 1.');
      bus.emit('sfx', { id: 'buckle', ui: true });
      g.renderer.fadeTo(0, 1.4);
      bus.emit('launch:state', this.state);
      if (auto) {
        ui.toast('Launch computer has the checklist and the count · Y opens it (hold, scrub, manual ascent)', 'info', 7);
        setTimeout(() => this.radio('Launch Control', 'Ranger 1, Launch Control. Crew aboard. Your computer is running the checklist; we pick up the count at T minus sixty.'), 1600);
        setTimeout(() => { if (this.state === 'prep') this.fullAuto(); }, 3200);
      } else {
        ui.toast(g.input.usingTouch ? 'Ranger 1 · launch computer: tap Auto for the checklist' : 'Ranger 1 · launch computer: press Y for the checklist', 'info', 6);
        setTimeout(() => this.radio('Launch Control', 'Ranger 1, Launch Control. We have you and three crew aboard. Close up and run your checklist when ready.'), 1600);
      }
    }, 900);
    return true;
  }

  /** leaving the seat before the count: the crew climbs back out with you */
  private unboard() {
    if (this.state !== 'prep') return;
    const nasa = this.earth.nasa;
    for (const n of this.seated) { n.detach(); n.brain = (n as any).__brain ?? null; }
    this.seated = [];
    const m = nasa.launch.marker('board', 'ranger');
    if (m) { m.node.getWorldPosition(_v); this.game.player.stand(_v.clone().add(new THREE.Vector3(0, -0.95, 0)), 0); }
    this.flight.canLeave = null;
    this.flight.onLeave = null;
    this.state = 'idle';
    mission.setPhase('prep');
    bus.emit('launch:state', this.state);
  }

  closeHatch() {
    if (this.state !== 'prep' || this.check.hatch) return;
    this.check.hatch = true;
    bus.emit('sfx', { id: 'hatch', node: this.earth.nasa.ranger.root, gain: 1 });
    setTimeout(() => bus.emit('sfx', { id: 'door_latch', ui: true }), 700);
    this.radio('Reyes', 'Top hatch closed and locked. Seal indicators green.');
  }

  pressurize() {
    if (this.state !== 'prep' || !this.check.hatch || this.pressT >= 0 || this.check.pressure >= 1) return;
    this.pressT = 0;
    bus.emit('sfx', { id: 'airlock', ui: true, gain: 0.7 });
  }

  initComputer() {
    if (this.state !== 'prep' || this.check.pressure < 1 || this.compT >= 0 || this.check.computer >= 1) return;
    this.compT = 0;
    bus.emit('sfx', { id: 'beep', ui: true });
  }

  ready() { return this.check.crew && this.check.hatch && this.check.pressure >= 1 && this.check.computer >= 1; }

  /** Full launch autopilot: the computer runs what is left of the checklist, then the count. */
  fullAuto() {
    if (this.state !== 'prep') return;
    this.mode = 'auto';
    this.autoRun = true;
    this.radio('Ranger 1', 'Full launch autopilot selected. Computer has the checklist.');
  }

  startCount(mode?: 'auto' | 'manual') {
    if (this.state !== 'prep' || !this.ready()) return false;
    if (mode) this.mode = mode;
    this.state = 'countdown';
    this.t = -60;
    this.hold = false;
    mission.setPhase('countdown');
    mission.countdown = 60;
    void this.game.preload('orbit');
    this.flight.canLeave = () => 'Strapped in: the count is running (scrub it from the launch computer first).';
    this.flight.hudOverride = true;
    this.calls = this.script();
    this.audio && (this.audio.musicOverride = 'launch');
    bus.emit('launch:state', this.state);
    return true;
  }

  setHold(on: boolean) {
    if (this.state !== 'countdown' || this.t > -8) return;
    this.hold = on;
    mission.hold = on;
    this.radio('Launch Control', on ? `Hold, hold, hold. Clock stopped at T minus ${Math.ceil(-this.t)}.` : 'Resuming the count.');
  }

  /** Abort before ignition: the count stops, the cap closes, the arm swings back. */
  scrub() {
    if (this.state !== 'countdown' || this.t > -6.5) return;
    const nasa = this.earth.nasa;
    this.state = 'prep';
    nasa.siloTarget = 0;
    nasa.armsTarget = 0;
    mission.countdown = -1;
    mission.setPhase('boarding');
    this.flight.canLeave = () => null;
    this.flight.hudOverride = false;
    if (this.audio) this.audio.musicOverride = null;
    this.radio('Launch Control', 'Scrub, scrub. Safing the vehicle. Closing the silo cap.');
    bus.emit('launch:state', this.state);
  }

  private script(): Call[] {
    const n = this.earth.nasa;
    const c: Call[] = [
      { t: -60, who: 'Launch Control', text: 'All stations, terminal count is running. T minus sixty seconds.' },
      { t: -53, who: 'Reyes', text: 'Ranger 1 on internal power. Cabin holding at one-oh-one point three.' },
      { t: -46, who: 'Launch Control', text: 'Opening the silo cap. Clear the upper levels.', act: () => { n.siloTarget = 1; bus.emit('sfx', { id: 'siren', pos: n.toWorld(0, 60, 305, new THREE.Vector3()), gain: 1 }); } },
      { t: -31, who: 'Launch Control', text: 'Cap open and locked. Retracting the crew access arm.', act: () => { n.armsTarget = 1; bus.emit('sfx', { id: 'blast', pos: n.toWorld(-6, 9, 305, new THREE.Vector3()), gain: 0.7 }); } },
      { t: -25, who: 'Hartmann', text: 'Crew biomed is nominal. We are go.', female: true },
      { t: -20, who: 'Launch Control', text: 'Guidance is internal. Range is green.' },
      { t: -15, who: 'Launch Control', text: 'Tank pressurisation complete. Ranger 1, you are go for launch.' },
      { t: -12, who: 'Ranger 1', text: 'Go for launch. See you on the other side.' },
      { t: -6, who: 'Launch Control', text: 'Ignition sequence start.', act: () => { bus.emit('sfx', { id: 'engine_start', node: n.stack.root, gain: 1 }); } },
      { t: 0, who: 'Launch Control', text: 'Lift-off. Ranger 1 has cleared the pad.' },
    ];
    for (let k = 10; k >= 1; k--) if (k !== 6) c.push({ t: -k, who: 'Launch Control', text: ['', 'One.', 'Two.', 'Three.', 'Four.', 'Five.', '', 'Seven.', 'Eight.', 'Nine.', 'T minus ten.'][k] });
    return c.sort((a, b) => a.t - b.t);
  }

  // ------------------------------------------------------------------------------------------- simulation
  fixedUpdate(dt: number) {
    if (this.state === 'prep') this.prepStep(dt);
    if (this.state === 'countdown') this.countStep(dt);
    if (this.state === 'liftoff' || this.state === 'ascent') this.flyStep(dt);
  }

  private prepStep(dt: number) {
    if (this.pressT >= 0) {
      this.pressT += dt;
      this.check.pressure = clamp(this.pressT / 4, 0, 1);
      if (this.check.pressure >= 1) { this.pressT = -1; this.radio('Hartmann', 'Cabin pressurised. No leaks in five minutes of decay check.', true); }
    }
    if (this.compT >= 0) {
      this.compT += dt;
      this.check.computer = clamp(this.compT / 5, 0, 1);
      if (Math.floor(this.compT * 2) !== Math.floor((this.compT - dt) * 2)) bus.emit('sfx', { id: 'ui_tick', ui: true });
      if (this.check.computer >= 1) { this.compT = -1; this.radio('Reyes', 'Launch computer initialised. Platform aligned, trajectory loaded: four hundred kilometres, thirty-eight point seven degrees.'); }
    }
    if (this.autoRun) {
      // the computer works through the list at a believable pace
      if (!this.check.hatch) this.closeHatch();
      else if (this.check.pressure < 1 && this.pressT < 0) this.pressurize();
      else if (this.check.pressure >= 1 && this.check.computer < 1 && this.compT < 0) this.initComputer();
      else if (this.ready()) { this.autoRun = false; this.startCount('auto'); }
    }
  }

  private countStep(dt: number) {
    if (this.hold) return;
    this.t += dt;
    mission.countdown = Math.max(0, -this.t);
    for (const c of this.calls) if (!c.done && this.t >= c.t) { c.done = true; if (c.text) this.radio(c.who, c.text, c.female); c.act?.(this); }
    const n = this.earth.nasa;
    // ignition at T-6: thrust builds while the hold-downs keep the stack in the silo
    if (this.t > -6) {
      const k = clamp((this.t + 6) / 5, 0, 1);
      n.stack.level1 = 0.25 + 0.75 * k * k;
      this.thrustVis = n.stack.level1;
    }
    if (this.t >= 0) this.liftoff();
  }

  private liftoff() {
    const z = this.earth, n = z.nasa;
    this.state = 'liftoff';
    mission.setPhase('ascent');
    mission.countdown = 0;
    story.set('launched');
    n.releaseStackColliders();
    n.flying = true;
    this.sim = new AscentSim();
    this.sim.siloClear = 110;
    this.sim.manual = this.mode === 'manual';
    this.sim.onEvent = (e) => this.onEvent(e);
    this.prevH = this.curH = 0;
    this.seen.clear();
    bus.emit('launch:state', this.state);
    bus.emit('sfx', { id: 'blast', node: n.stack.root, gain: 1 });
    if (this.mode === 'manual') ui.toast('Manual ascent: W / S pitch the stack, SHIFT / CTRL throttle. The flight director shows the guidance pitch.', 'info', 7);
  }

  private stepSim(dt: number) {
    const s = this.sim!;
    // manual steering and throttle
    if (s.manual) {
      const inp = this.game.input;
      s.pitchCmd = clamp(s.pitchCmd + inp.axis('forward', 'back', 'moveY') * 0.04 * dt * 60 * (Math.PI / 180) * 3, -0.2, Math.PI / 2);
      if (inp.down('throttleUp')) s.throttle = clamp(s.throttle + dt * 0.4, 0.6, 1);
      if (inp.down('throttleDown')) s.throttle = clamp(s.throttle - dt * 0.4, 0.6, 1);
    }
    s.step(dt);
  }

  private flyStep(dt: number) {
    const s = this.sim!;
    this.prevH = this.curH; this.prevTilt = this.curTilt; this.prevDr = this.curDr;
    if (this.state === 'liftoff') {
      // in the Earth zone: real time, out of the silo and up through the cloud deck
      this.stepSim(dt);
      // distance over the ground: the inertial angle minus what the Earth's rotation carried the pad along
      this.curH = s.h; this.curTilt = Math.PI / 2 - s.pitch; this.curDr = (s.phi - OMEGA_EARTH * Math.cos(LAUNCH_SITE.lat * D2R) * s.t) * R_EARTH;
      const n = this.earth.nasa;
      // roll program right after the vehicle clears the silo
      if (s.h > s.siloClear + 20) this.roll = clamp(this.roll + dt / 7, 0, 1);
      n.placeStack(this.curH, this.curDr, this.curTilt, this.roll * this.roll * (3 - 2 * this.roll));
      n.stack.carryRanger();
      n.stack.level1 = s.burning && s.stage === 0 ? s.throttle : 0;
      const camY = this.game.renderer.camera.position.y;
      if (!this.switching && (camY > CLOUD_Y - 260 || s.h > CLOUD_Y + 400)) { this.switching = true; this.flash = 0.0001; }
      if (this.switching && this.flash >= 0.95) this.toOrbitZone();
      return;
    }
    // ascent in the orbital zone: compressed time in sub-steps
    const n = Math.max(1, Math.round(this.warp));
    for (let i = 0; i < n && !s.done; i++) this.stepSim(dt);
    this.curH = s.h;
    this.orbit.ascentFixed(dt * n, s);
    if (s.done && this.state === 'ascent') this.inserted();
  }

  private toOrbitZone() {
    const g = this.game, o = this.orbit, s = this.sim!;
    this.state = 'ascent';
    const crew = this.seated;
    // move the crew to the orbital zone's Ranger
    const nasa = this.earth.nasa;
    const camMode = this.flight.cam;
    this.flight.onLeave = null;
    this.flight.leave(true);
    void g.gotoZone('orbit', {
      fade: false,
      onEnter: () => {
        nasa.stack.root.visible = false;
        nasa.ranger.root.visible = false;
        if (this.smoke) this.smoke.clear();
        o.beginAscent(s, this.roll);
        this.flight.enter(o.ranger!, o.env, 'pilot_l');
        this.flight.hudOverride = true;
        this.flight.chaseWorldUp = true;
        this.flight.setLocked(true);
        this.flight.canLeave = () => 'Strapped in for ascent.';
        this.flight.onLeave = null;
        o.seatCrew(crew, SEATING);
        this.addCameras();
        if (camMode === 'chase') this.flight.cycleCamera('chase');
        else if (camMode !== 'cockpit') this.flight.cycleCamera('chaseplane');
      },
    });
  }

  /** cameras of the launch site: on the silo rim, and in the cavern level with the access arm */
  private padCameras() {
    const n = this.earth.nasa, map = this.earth.map;
    // on the lip of the shaft, looking down past the cap rails; and a tracking camera down the mountainside
    const rim = n.toWorld(0, 72.6, 288.2, new THREE.Vector3());
    const cav = n.toWorld(-21, 10.5, 296, new THREE.Vector3());
    // in front of the portal, beside the approach road: the stack climbs out of the mountain top beyond
    const range = n.toWorld(70, 0, -160, new THREE.Vector3());
    range.y = map.height(range.x, range.z) + 3;
    const look = (cam: THREE.PerspectiveCamera, from: THREE.Vector3, minFov: number) => {
      const t = n.ranger.root.getWorldPosition(_v);
      cam.position.copy(from);
      cam.up.set(0, 1, 0);
      cam.lookAt(t);
      // the camera operator zooms to keep the vehicle framed as it climbs away
      const fov = clamp(2 * Math.atan(40 / Math.max(1, from.distanceTo(t))) * 180 / Math.PI, minFov, 70);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    };
    this.flight.extraCams = [
      { id: 'cavern', label: 'Launch cavern camera', drive: (cam) => look(cam, cav, 20) },
      { id: 'silorim', label: 'Silo rim camera', drive: (cam) => look(cam, rim, 8) },
      { id: 'range', label: 'Range tracking camera', drive: (cam) => look(cam, range, 0.6) },
    ];
    // a chase view from beside the vehicle rather than over the nose
    (this.flight as any).orbitYaw = Math.PI / 2;
    (this.flight as any).orbitPitch = 0.12;
    (this.flight as any).chaseDist = 48;
  }

  private addCameras() {
    const o = this.orbit;
    this.flight.extraCams = [
      { id: 'chaseplane', label: 'Chase plane', fov: 40, drive: (cam) => o.chasePlane(cam) },
      { id: 'stagecam', label: 'Stage camera', fov: 75, drive: (cam) => o.stageCamera(cam) },
    ];
  }

  private inserted() {
    this.state = 'orbit';
    if (this.audio) this.audio.musicOverride = null;
    mission.setPhase('orbit');
    mission.note('Orbit insertion. Ranger separation.');
    story.set('in_orbit');
    this.warp = 1;
    this.flight.hudOverride = false;
    this.flight.chaseWorldUp = false;
    this.orbit.separateRanger(() => {
      this.flight.setLocked(false);
      this.flight.extraCams = [];
      this.flight.canLeave = null;
      this.radio('Okoye', 'Endurance has us on its beacon. Range four kilometres, she is right where the numbers said.', true);
      setTimeout(() => { if (this.game.zone === this.orbit && !this.orbit.docking.linkOf(this.orbit.ranger!)) this.game.openPanel('docking'); }, 3500);
    });
    bus.emit('launch:state', this.state);
  }

  private onEvent(e: AscentEvent) {
    if (this.seen.has(e)) return;
    this.seen.add(e);
    const s = this.sim!;
    const say: Partial<Record<AscentEvent, [string, string, boolean?]>> = {
      tower: ['Launch Control', 'Vehicle has cleared the silo. Ranger 1, you are on your own.'],
      pitch: ['Ranger 1', 'Roll program complete. Pitching downrange.'],
      maxq: ['Launch Control', 'Maximum dynamic pressure. Vehicle is through max-Q.'],
      meco: ['Reyes', 'Main engine cut-off. Stand by for staging.'],
      separation: ['Reyes', 'Staging. First stage is away.'],
      ignition2: ['Reyes', 'Second stage ignition. Good thrust.'],
      seco: ['Reyes', 'Second stage cut-off.'],
      rangerBurn: ['Reyes', 'Second stage depleted. Ranger main engines finishing the insertion.'],
      orbit: ['Launch Control', `Orbit insertion confirmed. ${(s.h / 1000).toFixed(0)} kilometres, circular. Ranger 1, welcome to orbit.`],
      recovery: ['Ranger 1', 'Trajectory off nominal. Guidance has the stack.'],
    };
    const l = say[e];
    if (l) this.radio(l[0], l[1], l[2]);
    if (e === 'separation') this.orbit.stageSeparation(1);
    if (e === 'tower') bus.emit('sfx', { id: 'whoosh', ui: true, gain: 0.5 });
  }

  // ------------------------------------------------------------------------------------------- per frame
  update(dt: number) {
    const g = this.game;
    if (this.state === 'idle' || this.state === 'scrubbed') return;
    if ((this.state === 'prep' || this.state === 'countdown' || this.state === 'liftoff' || this.state === 'ascent') && g.state === 'playing' && !g.uiFocus && g.input.pressed('autopilot')) g.openPanel('launch');
    const a = g.alpha;
    // smoke, vibration, sound
    const s = this.sim;
    let thrust = this.thrustVis;
    if (this.state === 'liftoff' && s) {
      const n = this.earth.nasa;
      n.placeStack(lerp(this.prevH, this.curH, a), lerp(this.prevDr, this.curDr, a), lerp(this.prevTilt, this.curTilt, a), this.roll * this.roll * (3 - 2 * this.roll));
      thrust = s.burning ? s.throttle : 0;
    } else if (this.state === 'ascent' && s) {
      thrust = s.burning ? s.throttle : 0;
    } else if (this.state === 'orbit') thrust = 0;
    this.thrustVis = damp(this.thrustVis, thrust, 6, dt);
    this.exhaust(dt);
    const h = s ? s.h : 0;
    const q = s ? s.q : 0;
    // vibration: strongest at ignition and through max-Q, fading in vacuum
    const vib = (this.state === 'countdown' || this.state === 'liftoff' || this.state === 'ascent') ? this.thrustVis * (0.0035 + 0.006 * clamp(q / 35000, 0, 1) + (h < 300 ? 0.004 : 0)) * (s && s.stage > 0 ? 0.45 : 1) : 0;
    g.renderer.shake = damp(g.renderer.shake, vib, 8, dt);
    if (!this.rocketSnd && this.audio && (this.state === 'countdown' || this.state === 'liftoff')) {
      this.rocketSnd = this.audio.loop('rocket', () => ({ thrust: this.thrustVis * (this.sim && this.sim.stage > 0 ? 0.5 : 1) * (1 - 0.6 * clamp(h / 60000, 0, 1)), gain: 1.4 }));
    }
    if (this.state === 'orbit' && this.rocketSnd) { this.rocketSnd.remove(); this.rocketSnd = null; }
    // cloud penetration: whiteout while the zone changes underneath
    if (this.switching) {
      if (this.state === 'liftoff') this.flash = Math.min(1, this.flash + dt * 1.6);
      else this.flash = Math.max(0, this.flash - dt * 0.7);
      const f = this.flash * this.flash;
      g.renderer.flash.set(f * 2.2, f * 2.25, f * 2.3);
      if (this.state !== 'liftoff' && this.flash <= 0) { this.switching = false; g.renderer.flash.set(0, 0, 0); }
    }
    if (this.state === 'liftoff' || this.state === 'ascent' || this.state === 'countdown') this.hud();
  }

  /** Exhaust in the Earth zone: billows up the silo and out of its mouth, then the trail behind the climbing stack. */
  private exhaust(dt: number) {
    const z = this.earth;
    if (this.game.zone !== z || (this.state !== 'countdown' && this.state !== 'liftoff')) return;
    const n = z.nasa;
    if (!this.smoke) { this.smoke = new Smoke(1800); z.root.add(this.smoke.points); }
    const lvl = n.stack.level1 * (this.state === 'liftoff' && this.sim && !this.sim.burning ? 0 : 1);
    this.emitAcc += dt * 70 * lvl;
    const base = n.stack.base(_v);
    const axis = _w.set(0, -1, 0).applyQuaternion(n.stack.root.getWorldQuaternion(new THREE.Quaternion()));
    const mouth = n.toWorld(0, 70, 305, new THREE.Vector3());
    while (this.emitAcc > 1) {
      this.emitAcc -= 1;
      const r = () => (Math.random() - 0.5);
      const inSilo = base.y < mouth.y - 4;
      if (inSilo) {
        // trapped exhaust boils up the shaft and spills out of the open cap
        const y = base.y - 3 + Math.random() * Math.max(2, mouth.y - base.y);
        this.smoke.emit({ x: mouth.x + r() * 18, y, z: mouth.z + r() * 18 }, { x: r() * 6, y: 18 + Math.random() * 20, z: r() * 6 }, 5 + Math.random() * 4, 6, 22, y < base.y + 12 ? 1 : 0.2);
        if (Math.random() < 0.5) this.smoke.emit({ x: mouth.x + r() * 26, y: mouth.y + 2, z: mouth.z + r() * 26 }, { x: r() * 22, y: 14 + Math.random() * 18, z: r() * 22 }, 9 + Math.random() * 6, 12, 48, 0.1);
      } else {
        // the plume's own trail behind the vehicle
        const p = _w.copy(axis).multiplyScalar(30 + Math.random() * 25).add(base);
        this.smoke.emit({ x: p.x + r() * 6, y: p.y + r() * 6, z: p.z + r() * 6 }, { x: r() * 4 + axis.x * 30, y: r() * 4 + axis.y * 30, z: r() * 4 + axis.z * 30 }, 14 + Math.random() * 8, 9, 34, 0.25);
      }
    }
    const sky = z.sky;
    _c.copy(sky.sunColor).multiplyScalar(sky.sun.intensity);
    _a.copy(W.uFogZ.value).multiplyScalar(1.4);
    this.smoke.update(dt, this.game.renderer.camera, sky.sunDir, _c, _a);
  }

  private hud() {
    const s = this.sim;
    if (this.state === 'countdown') {
      ui.set({ gauges: [{ label: 'T−', value: `${Math.max(0, -this.t).toFixed(0)} s${this.hold ? ' HOLD' : ''}` }, { label: 'mode', value: this.mode === 'auto' ? 'AUTOPILOT' : 'MANUAL' }, { label: 'silo cap', value: `${Math.round(this.earth.nasa.siloOpen * 100)}%` }] });
      return;
    }
    if (!s) return;
    const g = (s.accel / 9.81).toFixed(1);
    const gauges = [
      { label: 'T+', value: `${s.t.toFixed(0)} s` }, { label: 'alt', value: s.h < 10000 ? `${s.h.toFixed(0)} m` : `${(s.h / 1000).toFixed(1)} km` },
      { label: 'm/s', value: s.speed < 1000 ? s.airSpeed.toFixed(0) : `${(s.speed / 1000).toFixed(2)}k` }, { label: 'stage', value: ['S1', 'S2', 'RANGER'][s.stage] ?? '—' },
      { label: 'pitch', value: `${(s.pitch * 180 / Math.PI).toFixed(1)}°` }, { label: 'q kPa', value: (s.q / 1000).toFixed(1) }, { label: 'g', value: g },
      { label: 'prop', value: `${Math.round((s.propLeft / Math.max(1, [560000, 108000, 6000][s.stage] ?? 1)) * 100)}%` },
    ];
    if (s.manual) gauges.push({ label: 'guide', value: `${(s.guidePitch * 180 / Math.PI).toFixed(1)}°` });
    if (this.warp > 1) gauges.push({ label: 'time', value: `×${this.warp}` });
    ui.set({ gauges });
  }

  serialize() { return { state: this.state, check: this.check, mode: this.mode }; }
}
