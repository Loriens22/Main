import * as THREE from 'three';
import { G0, type SpacecraftSpec } from '../data/vehicles';
import type { VehicleState } from '../core/State';
import type { V3 } from '../space/kepler';

/**
 * Flight environment for a craft. Positions are float64 in the zone/system frame (three.js axis convention: +Y up).
 */
export interface FlightEnv {
  gravity(p: V3): V3; // acceleration m/s²
  density(p: V3): number; // kg/m³
  up(p: V3): V3; // local vertical (unit)
  /** ground height & normal under p (surface zones). Height is measured along up. */
  ground?(p: V3): { h: number; n: V3 } | null;
  /** altitude above ground/surface */
  altitude(p: V3): number;
  /** surface velocity (rotating atmosphere / planet surface) */
  surfaceVel?(p: V3): V3;
  /** velocity-dependent frame accelerations (Coriolis in a rotating surface frame) */
  fictitious?(p: V3, v: V3): V3;
}

export type SasMode = 'off' | 'stability' | 'prograde' | 'retrograde' | 'radialOut' | 'radialIn' | 'normal' | 'antinormal' | 'target' | 'hold' | 'surface';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** 6-DOF rigid-body spacecraft (shared by launcher, Rangers, Landers and Endurance). */
export class Spacecraft {
  spec: SpacecraftSpec;
  readonly pos: V3 = [0, 0, 0];
  readonly vel: V3 = [0, 0, 0];
  readonly quat = new THREE.Quaternion();
  readonly angVel = new THREE.Vector3(); // body frame rad/s
  payload = 0; // extra mass (cargo pod, attached stages)
  // commands
  throttle = 0;
  vtol = 0;
  readonly rcsT = new THREE.Vector3(); // body-frame translation command -1..1
  readonly rcsR = new THREE.Vector3(); // pitch, yaw, roll command -1..1
  sas: SasMode = 'stability';
  readonly attTarget = new THREE.Quaternion();
  /** feed-forward angular velocity of a moving attitude target (world frame, rad/s), e.g. a spinning dock port */
  attRate: THREE.Vector3 | null = null;
  rcsOn = true;
  engineOn = true;
  // outputs
  mainLevel = 0;
  vtolLevel = 0;
  readonly rcsFire = new THREE.Vector3();
  readonly rcsRotFire = new THREE.Vector3();
  readonly accel = new THREE.Vector3(); // last non-gravitational acceleration (body-felt), world frame
  landed = false;
  gearDown = true;
  contact = false;
  lastImpact = 0;
  onImpact: ((speed: number) => void) | null = null;
  unlimited = false;
  efficiency = 1; // degraded engines (damage)
  rcsEfficiency = 1;
  /** gear contact points in body frame (y negative = below hull origin) */
  gearPoints: THREE.Vector3[] = [];
  heading = 0;

  constructor(spec: SpacecraftSpec, readonly state: VehicleState) {
    this.spec = spec;
    this.pos[0] = state.pos[0];
    this.pos[1] = state.pos[1];
    this.pos[2] = state.pos[2];
    this.vel[0] = state.vel[0];
    this.vel[1] = state.vel[1];
    this.vel[2] = state.vel[2];
    this.quat.set(...state.quat);
    this.angVel.set(...state.angVel);
    this.gearDown = state.gearDown;
    const gh = spec.gearHeight;
    const L = spec.length * 0.32;
    this.gearPoints = [new THREE.Vector3(-2.6, -gh, -L * 0.3), new THREE.Vector3(2.6, -gh, -L * 0.3), new THREE.Vector3(-2.9, -gh, L), new THREE.Vector3(2.9, -gh, L)];
  }

  get fuel() {
    return this.state.fuel;
  }
  set fuel(v: number) {
    this.state.fuel = v;
  }

  get mass() {
    return this.spec.dryMass + this.state.fuel + this.payload;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }
  upVec(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }

  /** Maximum main-engine acceleration right now. */
  maxAccel() {
    return (this.spec.mainThrust * this.efficiency) / this.mass;
  }

  /** Δv remaining on main engine. */
  deltaV() {
    const m0 = this.mass, m1 = this.spec.dryMass + this.payload;
    return this.spec.mainIsp * G0 * Math.log(m0 / m1);
  }

  speed() {
    return Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
  }

  // ---------------------------------------------------------------------------------------------- integration
  step(dt: number, env: FlightEnv) {
    if (dt <= 0) return;
    const s = this.spec;
    const m = this.mass;
    const fuelOk = this.unlimited || this.state.fuel > 0;
    // --- attitude control (SAS + RCS torque)
    this.attitudeControl(dt, env);
    // --- forces (world frame)
    const F = new THREE.Vector3();
    const fwd = this.forward(tmpV);
    let fuelUse = 0;
    this.mainLevel = fuelOk && this.engineOn ? THREE.MathUtils.clamp(this.throttle, 0, 1) : 0;
    if (this.mainLevel > 0) {
      const thrust = s.mainThrust * this.mainLevel * this.efficiency;
      F.addScaledVector(fwd, thrust);
      fuelUse += thrust / (s.mainIsp * G0);
    }
    this.vtolLevel = fuelOk && this.engineOn ? THREE.MathUtils.clamp(this.vtol, 0, 1) : 0;
    if (this.vtolLevel > 0 && s.vtolThrust > 0) {
      const thrust = s.vtolThrust * this.vtolLevel * this.efficiency;
      F.addScaledVector(this.upVec(tmpV2), thrust);
      fuelUse += thrust / (s.vtolIsp * G0);
    }
    // RCS translation
    this.rcsFire.copy(this.rcsT).clampScalar(-1, 1);
    if (this.rcsOn && fuelOk && this.rcsFire.lengthSq() > 0) {
      const rf = this.rcsFire.clone().multiplyScalar(s.rcsThrust * this.rcsEfficiency).applyQuaternion(this.quat);
      F.add(rf);
      fuelUse += rf.length() / (s.rcsIsp * G0);
    } else this.rcsFire.set(0, 0, 0);
    // aerodynamics
    const rho = env.density(this.pos);
    const sv = env.surfaceVel?.(this.pos) ?? [0, 0, 0];
    const va = new THREE.Vector3(this.vel[0] - sv[0], this.vel[1] - sv[1], this.vel[2] - sv[2]);
    const vaN = va.length();
    if (rho > 1e-6 && vaN > 0.1) {
      const q = 0.5 * rho * vaN * vaN;
      const vdir = va.clone().divideScalar(vaN);
      // drag grows as the body axis turns across the airflow (belly-first entry is draggier); nose-first and
      // tail-first (retro-braking) both present the small frontal area
      const along = THREE.MathUtils.clamp(vdir.dot(fwd), -1, 1);
      const cdA = s.dragArea * (1 + 2.5 * Math.sqrt(1 - along * along));
      F.addScaledVector(vdir, -q * cdA);
      // lift: perpendicular to the airflow in the plane of the body's up axis; signed angle of attack
      if (s.liftCoef > 0) {
        const lv = va.clone().applyQuaternion(this.quat.clone().invert());
        const aoaS = Math.atan2(-lv.y, -lv.z);
        const up = this.upVec(tmpV2);
        const liftDir = up.clone().sub(vdir.clone().multiplyScalar(up.dot(vdir)));
        if (liftDir.lengthSq() > 1e-6) {
          liftDir.normalize();
          const cl = s.liftCoef * 0.5 * Math.sin(2 * THREE.MathUtils.clamp(aoaS, -Math.PI / 2, Math.PI / 2));
          F.addScaledVector(liftDir, q * s.dragArea * cl);
        }
      }
      // aerodynamic weathervane torque (nose into the airflow), body frame
      const localV = va.clone().applyQuaternion(this.quat.clone().invert()).normalize();
      const k = q * s.dragArea * 0.02 * s.length;
      this.angVel.x += ((localV.y * k) / s.inertia[0]) * dt;
      this.angVel.y += ((-localV.x * k) / s.inertia[1]) * dt;
      // aero damping
      const damp = Math.min(0.9, (q * s.dragArea * s.length * s.length * 0.0006) / Math.max(s.inertia[0], 1) * dt);
      this.angVel.multiplyScalar(1 - damp);
    }
    // fuel
    if (!this.unlimited) this.state.fuel = Math.max(0, this.state.fuel - fuelUse * dt);
    // integrate translation
    const g = env.gravity(this.pos);
    if (env.fictitious) {
      const fa = env.fictitious(this.pos, this.vel);
      g[0] += fa[0];
      g[1] += fa[1];
      g[2] += fa[2];
    }
    const a = F.divideScalar(m);
    this.accel.copy(a);
    // trapezoidal position update (exact for constant acceleration): keeps the position consistent with the
    // reported velocity — semi-implicit Euler would add a spurious ½·a·dt drift (≈0.14 m/s in orbit at 30 Hz)
    const v0x = this.vel[0], v0y = this.vel[1], v0z = this.vel[2];
    this.vel[0] += (a.x + g[0]) * dt;
    this.vel[1] += (a.y + g[1]) * dt;
    this.vel[2] += (a.z + g[2]) * dt;
    this.pos[0] += (v0x + this.vel[0]) * 0.5 * dt;
    this.pos[1] += (v0y + this.vel[1]) * 0.5 * dt;
    this.pos[2] += (v0z + this.vel[2]) * 0.5 * dt;
    // integrate rotation
    const w = this.angVel;
    if (w.lengthSq() > 0) {
      const ang = w.length() * dt;
      tmpQ.setFromAxisAngle(tmpV.copy(w).normalize(), ang);
      this.quat.multiply(tmpQ).normalize();
    }
    // ground contact
    if (env.ground) this.groundContact(dt, env);
    else {
      this.contact = false;
      this.landed = false;
    }
  }

  private attitudeControl(dt: number, env: FlightEnv) {
    const s = this.spec;
    const I = s.inertia;
    const maxT = s.rcsTorque;
    const cmd = this.rcsR.clone().clampScalar(-1, 1);
    const manual = cmd.lengthSq() > 0.0001;
    const torque = new THREE.Vector3();
    if (manual) {
      torque.set(cmd.x * maxT[0], cmd.y * maxT[1], cmd.z * maxT[2]);
      if (this.sas !== 'off') this.attTarget.copy(this.quat);
    } else if (this.sas !== 'off') {
      // desired body angular velocity
      const wDes = new THREE.Vector3();
      const tgt = this.sasTarget(env);
      if (tgt) {
        const err = this.quat.clone().invert().multiply(tgt);
        if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
        const ang = 2 * Math.acos(THREE.MathUtils.clamp(err.w, -1, 1));
        if (ang > 1e-4) {
          const axis = new THREE.Vector3(err.x, err.y, err.z).normalize();
          const rate = Math.min(0.6, ang * 1.2);
          wDes.copy(axis).multiplyScalar(rate);
        }
        if (this.attRate) wDes.add(this.attRate.clone().applyQuaternion(this.quat.clone().invert()));
      }
      const e = wDes.sub(this.angVel);
      const kp = 3.0;
      torque.set(
        THREE.MathUtils.clamp(e.x * I[0] * kp, -maxT[0], maxT[0]),
        THREE.MathUtils.clamp(e.y * I[1] * kp, -maxT[1], maxT[1]),
        THREE.MathUtils.clamp(e.z * I[2] * kp, -maxT[2], maxT[2]),
      );
    }
    if (!this.rcsOn) torque.multiplyScalar(0.15); // reaction wheels only
    torque.multiplyScalar(this.rcsEfficiency);
    this.rcsRotFire.set(torque.x / maxT[0], torque.y / maxT[1], torque.z / maxT[2]);
    // ω̇ = I⁻¹(τ − ω × Iω)
    const w = this.angVel;
    const Iw = new THREE.Vector3(w.x * I[0], w.y * I[1], w.z * I[2]);
    const gyro = new THREE.Vector3().crossVectors(w, Iw);
    w.x += ((torque.x - gyro.x) / I[0]) * dt;
    w.y += ((torque.y - gyro.y) / I[1]) * dt;
    w.z += ((torque.z - gyro.z) / I[2]) * dt;
    if (!this.unlimited && this.rcsOn) this.state.fuel = Math.max(0, this.state.fuel - (torque.length() / (s.length * 0.5)) / (s.rcsIsp * G0) * dt * 0.2);
  }

  /** Attitude target quaternion for the current SAS mode (null = rate damping only). */
  sasTarget(env: FlightEnv): THREE.Quaternion | null {
    const v = new THREE.Vector3(...this.vel);
    const up = new THREE.Vector3(...env.up(this.pos));
    /** quaternion whose -Z axis points along dir with +Y as close as possible to upHint */
    const look = (dir: THREE.Vector3, upHint: THREE.Vector3) => {
      const d = dir.clone().normalize();
      let u = upHint.clone();
      if (Math.abs(u.clone().normalize().dot(d)) > 0.98) u = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), d, u)).normalize();
    };
    const curUp = this.upVec();
    switch (this.sas) {
      case 'stability':
        return null;
      case 'hold':
      case 'target':
        return this.attTarget;
      case 'prograde':
        return v.lengthSq() > 1 ? look(v.normalize(), curUp) : null;
      case 'retrograde':
        return v.lengthSq() > 1 ? look(v.normalize().negate(), curUp) : null;
      case 'radialOut':
        return look(up, curUp.clone().cross(up).lengthSq() > 0.01 ? this.forward() : new THREE.Vector3(1, 0, 0));
      case 'radialIn':
        return look(up.clone().negate(), this.forward());
      case 'surface': {
        // level flight: belly down, nose along horizontal heading
        const f = this.forward();
        f.sub(up.clone().multiplyScalar(f.dot(up)));
        if (f.lengthSq() < 1e-4) f.set(1, 0, 0);
        return look(f.normalize(), up);
      }
      case 'normal':
      case 'antinormal': {
        const p = new THREE.Vector3(...this.pos);
        const n = p.clone().cross(v).normalize();
        return look(this.sas === 'normal' ? n : n.negate(), up);
      }
    }
    return null;
  }

  private groundContact(dt: number, env: FlightEnv) {
    const gr = env.ground!(this.pos);
    if (!gr) {
      this.contact = false;
      return;
    }
    const up = new THREE.Vector3(...env.up(this.pos));
    const n = new THREE.Vector3(...gr.n);
    // lowest contact point (gear or hull)
    const pts = this.gearDown ? this.gearPoints : [new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(-3, -0.2, 3), new THREE.Vector3(3, -0.2, 3), new THREE.Vector3(0, -0.2, -6)];
    let pen = -Infinity;
    for (const lp of pts) {
      const wp = lp.clone().applyQuaternion(this.quat);
      const h = new THREE.Vector3(this.pos[0] + wp.x, this.pos[1] + wp.y, this.pos[2] + wp.z).dot(up);
      pen = Math.max(pen, gr.h - h);
    }
    if (pen <= 0) {
      this.contact = false;
      this.landed = false;
      return;
    }
    // push out along up, kill penetrating velocity, apply friction
    this.pos[0] += up.x * pen;
    this.pos[1] += up.y * pen;
    this.pos[2] += up.z * pen;
    const v = new THREE.Vector3(...this.vel);
    const vn = v.dot(n);
    if (!this.contact && vn < -0.5) {
      this.lastImpact = -vn;
      this.onImpact?.(-vn);
    }
    if (vn < 0) v.addScaledVector(n, -vn * (this.gearDown ? 1.0 : 1.1));
    const vt = v.clone().sub(n.clone().multiplyScalar(v.dot(n)));
    const fr = Math.min(1, dt * (this.gearDown ? 2.5 : 6));
    v.sub(vt.multiplyScalar(fr));
    this.vel[0] = v.x;
    this.vel[1] = v.y;
    this.vel[2] = v.z;
    this.contact = true;
    // settle: align up with ground normal, damp rotation
    if (this.gearDown) {
      const curUp = this.upVec();
      const corr = new THREE.Quaternion().setFromUnitVectors(curUp, curUp.clone().lerp(n, Math.min(1, dt * 3)).normalize());
      this.quat.premultiply(corr).normalize();
      this.angVel.multiplyScalar(1 - Math.min(1, dt * 4));
    }
    this.landed = this.gearDown && v.length() < 0.6 && this.mainLevel + this.vtolLevel < 0.35;
    if (this.landed) {
      this.vel[0] *= 0.5;
      this.vel[1] *= 0.5;
      this.vel[2] *= 0.5;
    }
  }

  writeState() {
    const st = this.state;
    st.pos = [this.pos[0], this.pos[1], this.pos[2]];
    st.vel = [this.vel[0], this.vel[1], this.vel[2]];
    st.quat = [this.quat.x, this.quat.y, this.quat.z, this.quat.w];
    st.angVel = [this.angVel.x, this.angVel.y, this.angVel.z];
    st.gearDown = this.gearDown;
    st.landed = this.landed;
  }
}

/** Uniform-gravity local environment for a planet surface zone (tangent-plane approximation). */
export function surfaceEnv(opts: { g0: number; radius: number; scaleHeight: number; rho0: number; ground?: (x: number, z: number) => number; groundNormal?: (x: number, z: number) => THREE.Vector3; water?: number }): FlightEnv {
  return {
    gravity: (p) => {
      const r = opts.radius + Math.max(0, p[1]);
      const g = opts.g0 * (opts.radius / r) ** 2;
      return [0, -g, 0];
    },
    density: (p) => opts.rho0 * Math.exp(-Math.max(0, p[1]) / opts.scaleHeight),
    up: () => [0, 1, 0],
    altitude: (p) => p[1] - (opts.ground ? opts.ground(p[0], p[2]) : 0),
    ground: opts.ground
      ? (p) => {
          const h = Math.max(opts.ground!(p[0], p[2]), opts.water ?? -Infinity);
          const n = opts.groundNormal ? opts.groundNormal(p[0], p[2]) : new THREE.Vector3(0, 1, 0);
          return { h, n: [n.x, n.y, n.z] };
        }
      : undefined,
  };
}
