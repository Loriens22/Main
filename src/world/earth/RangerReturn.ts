import * as THREE from 'three';
import type EarthZone from '../zones/EarthZone';
import { RangerVehicle, type RangerHost } from '../RangerVehicle';
import type { FlightEnv, Spacecraft } from '../../vehicles/Spacecraft';
import type { FlightControl } from '../../vehicles/FlightControl';
import { PoweredDescent, LandHere, AscentToOrbit, type SurfaceAPHost } from '../../space/Landing';
import { siteBasisECEF, ecefToEci, orbitSummary, MU_EARTH, R_EARTH } from '../../space/earthFrame';
import { SITE } from '../../space/astro';
import type { V3 } from '../../space/kepler';
import { h } from '../../ui/UI';

/**
 * Ranger 1 back on Earth. The Earth zone is a flat frame (X east, Y up, Z south) around the NASA facility, the same
 * frame the launch hands over from: these helpers convert between it and the orbital zone's inertial frame, the
 * returning Ranger flies the shared landing guidance down to the forecourt or the farm, lands, can be left and
 * re-boarded, and can climb back to orbit (hand-over at 45 km, like the launch).
 */
export const EARTH_HANDOVER = 15e3;
const OMEGA_E = (2 * Math.PI) / 86164.1;

export interface EarthTarget {
  id: 'nasa' | 'farm';
  name: string;
  x: number;
  z: number;
  /** heading of the parked craft (rad) */
  yaw: number;
}
export const EARTH_TARGETS: EarthTarget[] = [
  { id: 'nasa', name: 'NASA facility forecourt', x: 2900, z: -3118, yaw: Math.PI / 2 },
  { id: 'farm', name: 'The farm (north cornfield)', x: 270, z: -270, yaw: 0.4 },
];

/** Earth-zone position of the NASA portal (the frame origin the launch used); fixed by the terrain layout. */
const ORIGIN = { x: 2900, z: -3150 };

/** Latitude/longitude (deg) of an Earth-zone point. */
export function earthLatLon(x: number, z: number) {
  const lat = SITE.lat + THREE.MathUtils.radToDeg(-(z - ORIGIN.z) / R_EARTH);
  const lon = SITE.lon + THREE.MathUtils.radToDeg((x - ORIGIN.x) / (R_EARTH * Math.cos(THREE.MathUtils.degToRad(lat))));
  return { lat, lon };
}

function axes(t: number) {
  const b = siteBasisECEF(SITE.lat, SITE.lon);
  return { up: ecefToEci(b.up, t), east: ecefToEci(b.east, t), north: ecefToEci(b.north, t) };
}

/** Earth zone (y relative to y0, the portal's ground level) → inertial, as in the launch hand-over. */
export function earthToInertial(p: V3, v: V3, q: THREE.Quaternion, t: number, y0: number) {
  const { up, east, north } = axes(t);
  const Lx = p[0] - ORIGIN.x, Ly = p[1] - y0 + R_EARTH, Lz = p[2] - ORIGIN.z;
  const r = up.clone().multiplyScalar(Ly).addScaledVector(east, Lx).addScaledVector(north, -Lz);
  const vr = east.clone().multiplyScalar(v[0]).addScaledVector(up, v[1]).addScaledVector(north, -v[2]);
  vr.add(new THREE.Vector3(0, OMEGA_E, 0).cross(r));
  const M = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  const qi = new THREE.Quaternion().setFromRotationMatrix(M).multiply(q);
  return { r: r.toArray() as V3, v: vr.toArray() as V3, q: qi };
}

export function inertialToEarth(r: V3, v: V3, q: THREE.Quaternion, t: number, y0: number) {
  const { up, east, north } = axes(t);
  const R = new THREE.Vector3(...r);
  const vrel = new THREE.Vector3(...v).sub(new THREE.Vector3(0, OMEGA_E, 0).cross(R));
  const p: V3 = [R.dot(east) + ORIGIN.x, R.dot(up) - R_EARTH + y0, -R.dot(north) + ORIGIN.z];
  const vl: V3 = [vrel.dot(east), vrel.dot(up), -vrel.dot(north)];
  const M = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  const ql = new THREE.Quaternion().setFromRotationMatrix(M.clone().invert()).multiply(q);
  return { p, v: vl, q: ql };
}

/** True when a ground point (Earth-zone coordinates) lies inside the mapped terrain. */
export function insideEarthMap(x: number, z: number) {
  return Math.abs(x - 2000) < 60000 && Math.abs(z + 1500) < 60000;
}

export interface EarthReentry {
  r: V3;
  v: V3;
  q: [number, number, number, number];
  t: number;
  target: EarthTarget['id'];
  autoland: boolean;
}

export class RangerReturn implements RangerHost, SurfaceAPHost {
  readonly ranger: RangerVehicle;
  readonly env: FlightEnv;
  target: V3 = [0, 0, 0];
  targetName = '';
  private handing = false;
  private y0 = 0;

  constructor(readonly zone: EarthZone) {
    this.ranger = new RangerVehicle(this);
    const R = R_EARTH;
    this.env = {
      gravity: (p) => [0, -9.81 * (R / (R + Math.max(0, p[1]))) ** 2, 0],
      density: (p) => 1.225 * Math.exp(-Math.max(0, p[1]) / 8500),
      up: () => [0, 1, 0],
      altitude: (p) => p[1] - this.groundHeight(p[0], p[2]),
      ground: (p) => {
        const n = this.groundNormal(p[0], p[2]);
        return { h: this.groundHeight(p[0], p[2]), n: [n.x, n.y, n.z] };
      },
    };
  }

  get game() {
    return this.zone.game;
  }
  get scene() {
    return this.zone.scene;
  }
  get ground() {
    return this.zone.ground;
  }
  get craft() {
    return this.ranger.craft;
  }
  get control() {
    return this.ranger.control;
  }

  groundHeight(x: number, z: number) {
    return this.zone.height(x, z);
  }
  groundNormal(x: number, z: number) {
    return this.zone.gen.field.normal(x, z, 3);
  }
  now() {
    return this.game.state.clock.earthTime;
  }
  say(who: string, text: string) {
    this.game.say(who, text);
    this.game.log('comms', who, text);
  }
  orbit(c: Spacecraft) {
    const I = earthToInertial(c.pos as V3, c.vel as V3, c.quat, this.now(), this.y0);
    return orbitSummary(I.r, I.v, MU_EARTH, R_EARTH);
  }

  async load() {
    this.y0 = (this.zone.content as unknown as { nasa?: { origin: THREE.Vector3 } })?.nasa?.origin?.y ?? this.groundHeight(ORIGIN.x, ORIGIN.z);
    await this.ranger.load();
    this.ranger.onTouchdown = () => {
      this.game.notify(`Ranger 1 is down — ${this.targetName}. F to stand up.`, 'ok', 6);
      this.say('ward', this.targetName.startsWith('The farm') ? 'Home. The corn is still standing.' : 'Wheels down at the facility. Welcome home.');
      const st = this.game.state.vehicles.ranger1;
      st.data.onEarth = true;
      if (!this.game.state.discoveries.includes('returned_to_earth')) this.game.state.discoveries.push('returned_to_earth');
    };
  }

  /** Arriving from orbit (hand-over below 15 km). */
  startReentry(re: EarthReentry) {
    const st = this.game.state.vehicles.ranger1;
    const L = inertialToEarth(re.r, re.v, new THREE.Quaternion(...re.q), this.now(), this.y0);
    st.pos = L.p;
    st.vel = L.v;
    st.quat = [L.q.x, L.q.y, L.q.z, L.q.w];
    st.angVel = [0, 0, 0];
    st.landed = false;
    st.gearDown = false;
    st.location = 'earth';
    st.docked = null;
    this.setTarget(re.target);
    this.ranger.create(st);
    this.ranger.seat();
    if (re.autoland) this.control.setAutopilot(new PoweredDescent(this, this.targetName));
    this.control.camMode = 'chase';
  }

  /** Ranger already parked on Earth (after a return; save/load): 'seat' / 'eva' put the player there, 'none' only parks it. */
  startParked(mode: 'seat' | 'eva' | 'none') {
    const st = this.game.state.vehicles.ranger1;
    const tg = EARTH_TARGETS.find((x) => x.id === st.data.earthTarget) ?? EARTH_TARGETS[0];
    this.setTarget(tg.id);
    if (!st.landed || !st.pos || !Number.isFinite(st.pos[0])) {
      const p = this.ranger.landedPose(tg.x, tg.z, tg.yaw);
      st.pos = p.pos;
      st.quat = [p.q.x, p.q.y, p.q.z, p.q.w];
    }
    st.vel = [0, 0, 0];
    st.landed = true;
    st.gearDown = true;
    this.ranger.create(st);
    if (mode === 'none') {
      this.ranger.makeSite();
      return;
    }
    this.ranger.seat();
    if (mode === 'eva') this.ranger.beginEva(true);
  }

  private setTarget(id: EarthTarget['id']) {
    const tg = EARTH_TARGETS.find((x) => x.id === id) ?? EARTH_TARGETS[0];
    this.target = [tg.x, this.groundHeight(tg.x, tg.z), tg.z];
    this.targetName = tg.name;
    this.game.state.vehicles.ranger1.data.earthTarget = tg.id;
  }

  hudInfo() {
    const c = this.craft;
    const agl = c.pos[1] - this.groundHeight(c.pos[0], c.pos[2]);
    const v = new THREE.Vector3(...c.vel);
    const rng = Math.hypot(c.pos[0] - this.target[0], c.pos[2] - this.target[2]);
    const s = this.orbit(c);
    return {
      orbit: agl > 20e3 ? { body: 'EARTH', ap: s.ap, pe: s.pe, period: s.period, inc: THREE.MathUtils.radToDeg(s.inc) } : null,
      target: null,
      extra: [
        ['AGL', agl > 2000 ? `${(agl / 1000).toFixed(2)} km` : `${agl.toFixed(1)} m`],
        ['H-SPD', `${Math.hypot(v.x, v.z).toFixed(1)} m/s`],
        ['SITE', rng > 2000 ? `${(rng / 1000).toFixed(1)} km` : `${rng.toFixed(0)} m`],
        ['Δv', `${(c.deltaV() / 1000).toFixed(2)} km/s`],
      ] as [string, string][],
    };
  }

  ascend() {
    this.control.setAutopilot(new AscentToOrbit(this, 160e3, 60e3, 420));
  }

  openMenu(ctrl: FlightControl) {
    const game = this.game;
    game.input.releaseLock();
    const c = this.craft;
    const agl = c.pos[1] - this.groundHeight(c.pos[0], c.pos[2]);
    game.ui.openPanel('RANGER 1 — FLIGHT COMPUTER', (b, p) => {
      const pick = (fn: () => void) => () => {
        fn();
        p.close();
        game.input.requestLock();
      };
      const add = (label: string, desc: string, ok: boolean, fn: () => void) => {
        const btn = game.ui.button(label, pick(fn), ok ? 'btn primary' : 'btn');
        btn.disabled = !ok;
        b.append(h('div', { style: { margin: '8px 0' } }, btn, h('div', { class: 'dim', style: { fontSize: '12px', marginTop: '4px' } }, desc)));
      };
      b.append(h('div', { class: 'mono', style: { marginBottom: '10px' } }, `Earth · ${c.landed ? 'landed' : `${agl.toFixed(0)} m AGL`} · Δv ${(c.deltaV() / 1000).toFixed(2)} km/s`));
      for (const tg of EARTH_TARGETS) {
        add(`POWERED DESCENT — ${tg.name.toUpperCase()}`, 'Braking burn, hover approach and vertical touchdown.', !c.landed && agl > 200, () => {
          this.setTarget(tg.id);
          ctrl.setAutopilot(new PoweredDescent(this, this.targetName));
        });
      }
      add('LAND HERE', 'Null the horizontal speed and set down below the current position.', !c.landed && agl > 3, () => {
        this.target = [c.pos[0] + c.vel[0] * 4, 0, c.pos[2] + c.vel[2] * 4];
        this.target[1] = this.groundHeight(this.target[0], this.target[2]);
        this.targetName = 'touchdown point';
        ctrl.setAutopilot(new LandHere(this));
      });
      const short = !game.state.creative.unlimitedResources && c.deltaV() < 9600;
      const atNasa = Math.hypot(c.pos[0] - EARTH_TARGETS[0].x, c.pos[2] - EARTH_TARGETS[0].z) < 250;
      add('ASCENT TO ORBIT', `Lift-off, steep climb through the atmosphere, orbit insertion near 280 km (needs about 9.6 km/s with losses).${short ? ` Only ${(c.deltaV() / 1000).toFixed(1)} km/s aboard — ${atNasa ? 'wait for the ground crew to finish refuelling' : 'not enough to reach orbit; the NASA forecourt can refuel the Ranger'}.` : ''}`, true, () => this.ascend());
      add('DISENGAGE AUTOPILOT', 'Manual flight.', !!ctrl.autopilot, () => ctrl.setAutopilot(null));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }

  private refuelSaid = 0;

  update(dt: number) {
    if (!this.craft) return;
    this.groundService(dt);
    const game = this.game;
    const ts = this.control.autopilot && game.control === this.control ? Math.max(1, this.control.timeScale) : 1;
    if (ts > 1 && dt > 0) game.clock.advance(dt * (ts - 1), { location: game.state.location, system: game.state.system });
    this.ranger.update(dt * ts);
    // climb back to orbit: hand over at 45 km (the launch's altitude) — measured on the sphere, as the autopilot
    // steers (hundreds of km down-range the flat zone's "height" lags the true altitude by kilometres) — or as soon
    // as the craft leaves the mapped region above 20 km
    const c = this.craft;
    const s = !this.handing && !this.ranger.site && c.pos[1] - this.y0 > 15e3 ? this.orbit(c) : null;
    if (s && s.vr > 0 && (s.alt > 45e3 || (s.alt > 20e3 && !insideEarthMap(c.pos[0], c.pos[2])))) {
      this.handing = true;
      this.writeHandover();
      // the autopilot keeps flying through the fade-out; writeState() refreshes the hand-over with the final state
      void this.game.goTo('space', { at: 'ascent' }, { fade: 0.6 });
    }
  }

  /**
   * Parked on the NASA forecourt: the ground crew connects a propellant line and tops the tanks up (~60 kg/s, a
   * full load in about seven minutes). The farm has no such service.
   */
  private groundService(dt: number) {
    const st = this.game.state.vehicles.ranger1;
    const c = this.craft;
    const nasa = EARTH_TARGETS[0];
    const atNasa = !!this.ranger.site && Math.hypot(c.pos[0] - nasa.x, c.pos[2] - nasa.z) < 250;
    if (!atNasa || st.fuel >= st.fuelMax - 0.5) {
      if (this.refuelSaid === 1 && st.fuel >= st.fuelMax - 0.5) {
        this.refuelSaid = 2;
        this.say('capcom', 'Ranger 1, propellant load complete. Line disconnected.');
      }
      return;
    }
    if (this.refuelSaid === 0) {
      this.refuelSaid = 1;
      this.say('capcom', 'Ranger 1, ground crew is connecting the propellant line. Hold position.');
    }
    st.fuel = Math.min(st.fuelMax, st.fuel + 60 * dt);
  }

  private writeHandover() {
    const c = this.craft;
    const st = this.game.state.vehicles.ranger1;
    const t = this.now();
    const I = earthToInertial(c.pos as V3, c.vel as V3, c.quat, t, this.y0);
    const asc = this.control.autopilot instanceof AscentToOrbit ? this.control.autopilot : null;
    const prev = st.data.handover as { program?: string } | undefined;
    st.data.handover = { r: I.r, v: I.v, q: [I.q.x, I.q.y, I.q.z, I.q.w], t, program: asc ? 'orbit-insertion' : prev?.program, apTarget: 290e3 };
    delete st.data.surface;
    delete st.data.onEarth;
    st.landed = false;
    st.location = 'space';
  }

  writeState() {
    this.craft?.writeState();
    if (this.handing && this.craft) this.writeHandover();
  }

  dispose() {
    this.ranger.dispose();
  }
}
