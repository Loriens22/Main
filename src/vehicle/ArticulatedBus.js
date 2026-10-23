// Articulated city-bus vehicle simulation (pure logic, fixed time step).
//
// Lateral motion: kinematic single-track model of the tractor (front section)
// with a speed-dependent understeer gradient; the trailer (rear section)
// follows the off-axle hitch exactly (tractrix update), so the rear section
// cuts corners like a real articulated bus and can jack-knife in reverse
// (the articulation-angle protection then brakes the bus, as the MAN ATC does).
//
// Longitudinal motion: engine torque curve, automatic gearbox with torque
// converter, retarder, service/parking/bus-stop brake, rolling/aero/grade
// resistance and creep. Everything vehicle-specific (dimensions, torque curve,
// gear ratios, mass) comes from the vehicle spec (Vehicles.js); a rigid bus
// (spec.articulated false) keeps its "rear section" glued to the front one, so
// rx/rz/yawR always describe the body behind the last axle and callers need no
// special case.
import { BUS } from './BusSpec.js';
import { frames } from './frames.js';
import { clamp, wrapAngle, fwdX, fwdZ } from '../core/math.js';

const G = 9.81;
export const GEARS = [3.364, 1.909, 1.421, 1.0, 0.72, 0.615];

/** MAN E2876 LUH (CNG, 12.8 l, 228 kW) — approximate full-load torque (Nm). */
export function engineTorque(rpm) {
  if (rpm < 600) return 650;
  if (rpm < 1000) return 650 + ((rpm - 600) / 400) * 600;
  if (rpm <= 1600) return 1250;
  if (rpm <= 2200) return 1250 - ((rpm - 1600) / 600) * 260;
  return 900;
}

const MAN_SPEC = {
  articulated: true,
  dims: BUS,
  physics: { massEmpty: 17600, torque: engineTorque, idle: 620, maxRpm: 2200, gears: GEARS, final: 6.2, reverse: 4.18, governed: 70 / 3.6, aeroArea: 8.2 },
};

export class ArticulatedBus {
  constructor(opts = {}) {
    const spec = opts.spec || MAN_SPEC;
    const d = spec.dims, P = spec.physics, F = frames(spec);
    this.spec = spec;
    this.dims = d;
    this.articulated = spec.articulated !== false;
    this.L1 = d.wb1;
    this.c = this.articulated ? F.hitchFront : 0; // hitch behind axle 2
    this.L2 = this.articulated ? -F.hitchRear : 0; // hitch to axle 3
    this.torque = P.torque;
    this.gears = P.gears;
    this.final = P.final;
    this.reverseRatio = P.reverse;
    this.idle = P.idle;
    this.maxRpm = P.maxRpm;
    this.governed = P.governed;
    this.aeroArea = P.aeroArea;
    this.massEmpty = P.massEmpty;
    // body extents per section (section z, forward is -z) for the collision boxes
    this.box = this.articulated
      ? [{ c: -(F.frontZ + F.frontEnd) / 2, hl: (F.frontEnd - F.frontZ) / 2 }, { c: -(F.rearStart + F.rearZ) / 2, hl: (F.rearZ - F.rearStart) / 2 }]
      : [{ c: -(F.frontZ + F.rearZ) / 2, hl: (F.rearZ - F.frontZ) / 2 }];
    this.hw = d.halfW + 0.005;
    this.passengers = 0;
    this.heightAt = opts.heightAt || (() => 0);
    this.collide = opts.collide || null; // (state) => {nx,nz,depth} | null
    this.reset(0, 0, 0);
  }

  get mass() {
    return this.massEmpty + this.passengers * 72;
  }

  /** Place the bus straight with axle 2 at (x, z) facing yaw. */
  reset(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const hx = x - fwdX(yaw) * this.c, hz = z - fwdZ(yaw) * this.c;
    this.rx = hx - fwdX(yaw) * this.L2;
    this.rz = hz - fwdZ(yaw) * this.L2;
    this.yawR = yaw;
    this.v = 0;
    this.delta = 0;
    this.rpm = this.idle;
    this.gear = 1;
    this.selector = 'N'; // 'D' | 'N' | 'R'
    this.shiftTimer = 0;
    this.engineOn = true;
    this.parkingBrake = true;
    this.stopBrake = false;
    this.distF = 0;
    this.distR = 0;
    this.aLong = 0;
    this.aLat = 0;
    this.roll = [0, 0];
    this.rollV = [0, 0];
    this.pitch = [0, 0];
    this.pitchV = [0, 0];
    this.kneel = 0;
    this.holdTimer = 0;
    this.jackknife = false;
    this.lastCollision = null;
    this.load = 0;
    this.throttleOut = 0;
    this.brakeOut = 0;
  }

  get articulation() {
    return wrapAngle(this.yaw - this.yawR);
  }

  get speedKmh() {
    return Math.abs(this.v) * 3.6;
  }

  /** Front bumper position along the heading. */
  frontPoint() {
    const d = this.dims.frontOverhang + this.dims.wb1; // bumper ahead of axle 2 (rigid: rear axle)
    return [this.x + fwdX(this.yaw) * d, this.z + fwdZ(this.yaw) * d];
  }

  hitch() {
    return [this.x - fwdX(this.yaw) * this.c, this.z - fwdZ(this.yaw) * this.c];
  }

  /**
   * @param {number} dt fixed step (s)
   * @param {object} ctl {throttle 0..1, brake 0..1, steer -1..1 (left +), interlock bool}
   */
  step(dt, ctl) {
    // ---------------- steering (power steering rate limit, speed sensitive)
    const sp = Math.abs(this.v);
    const maxSteer = this.dims.maxSteer * clamp(1 - sp / 30, 0.28, 1);
    const target = clamp(ctl.steer, -1, 1) * maxSteer;
    const rate = 0.55 + 0.6 * clamp(1 - sp / 10, 0, 1); // rad/s at the wheels
    this.delta += clamp(target - this.delta, -rate * dt, rate * dt);

    // ---------------- drivetrain
    const m = this.mass;
    let throttle = this.engineOn ? clamp(ctl.throttle, 0, 1) : 0;
    let brake = clamp(ctl.brake, 0, 1);
    const interlock = !!ctl.interlock;
    this.stopBrake = interlock;
    if (interlock) throttle = 0;
    if (this.parkingBrake) throttle = Math.min(throttle, 0.15);
    const dirSign = this.selector === 'R' ? -1 : 1;
    const inGear = this.selector === 'D' || this.selector === 'R';
    const IDLE = this.idle, MAX_RPM = this.maxRpm, FINAL = this.final, nG = this.gears.length;
    const ratio = this.selector === 'R' ? this.reverseRatio : this.gears[this.gear - 1];
    const wheelR = this.dims.wheelR;
    const wheelRpm = (Math.abs(this.v) / wheelR) * (60 / (2 * Math.PI));
    const lockedRpm = wheelRpm * ratio * FINAL;
    // torque converter: engine can run above the locked speed (slip) at low road speed
    const stallRpm = IDLE + throttle * 1150;
    const lockup = this.selector === 'D' && this.gear >= 2 && lockedRpm > 1000;
    let rpmTarget;
    if (!inGear) rpmTarget = IDLE + throttle * (MAX_RPM - IDLE);
    else if (lockup) rpmTarget = Math.max(IDLE, lockedRpm);
    else rpmTarget = Math.max(lockedRpm, stallRpm);
    if (this.shiftTimer > 0) rpmTarget = Math.max(IDLE, rpmTarget * 0.85);
    this.rpm += (rpmTarget - this.rpm) * clamp(dt * 6, 0, 1);
    if (!this.engineOn) this.rpm = Math.max(0, this.rpm - 900 * dt);
    let drive = 0;
    if (inGear && this.engineOn) {
      const slipRatio = lockup ? 1 : clamp(lockedRpm / Math.max(this.rpm, 1), 0, 1);
      const tcMult = lockup ? 1 : 1 + 1.15 * (1 - slipRatio); // converter torque multiplication
      const engT = throttle > 0 ? this.torque(this.rpm) * throttle : 0;
      const creepT = !lockup ? 260 * (1 - slipRatio) * (brake > 0.05 ? 0 : 1) : 0; // idle creep
      const shiftCut = this.shiftTimer > 0 ? 0.35 : 1;
      drive = ((engT * tcMult + creepT) * ratio * FINAL * 0.9 * shiftCut) / wheelR;
      if (this.selector === 'D' && Math.abs(this.v) > this.governed) drive *= 0.1;
      if (this.rpm > MAX_RPM) drive *= 0.2;
      // transmission shifting
      if (this.selector === 'D') {
        this.shiftTimer = Math.max(0, this.shiftTimer - dt);
        const upAt = 1250 + throttle * 650;
        if (this.shiftTimer <= 0 && this.gear < nG && lockedRpm > upAt) {
          this.gear++;
          this.shiftTimer = 0.45;
          this.onShift && this.onShift(this.gear, 'up');
        } else if (this.shiftTimer <= 0 && this.gear > 1 && lockedRpm < 820 + throttle * 350) {
          this.gear--;
          this.shiftTimer = 0.35;
          this.onShift && this.onShift(this.gear, 'down');
        }
      } else this.gear = 1;
    }
    if (this.selector !== 'D') this.gear = 1;
    // resistances
    const slope = this.slope || 0; // rise per metre along the heading
    const grade = m * G * (slope / Math.sqrt(1 + slope * slope));
    const roll = 0.0085 * m * G;
    const aero = 0.5 * 1.2 * 0.68 * this.aeroArea * this.v * this.v;
    // brakes: first quarter of the pedal = retarder only, then service brake
    const retarder = this.selector === 'D' && Math.abs(this.v) > 1.5 ? clamp(brake / 0.25, 0, 1) * 1.1 * m : 0;
    const service = clamp((brake - 0.12) / 0.88, 0, 1) * 6.8 * m;
    let brakeF = service + retarder;
    if (this.parkingBrake) brakeF = Math.max(brakeF, 4.5 * m);
    if (interlock) brakeF = Math.max(brakeF, 3.5 * m);
    // hill-hold for 1.5 s after the brake is released at standstill
    if (brake > 0.2 && Math.abs(this.v) < 0.1) this.holdTimer = 1.5;
    else this.holdTimer = Math.max(0, this.holdTimer - dt);
    if (this.holdTimer > 0 && throttle < 0.05 && Math.abs(this.v) < 0.3) brakeF = Math.max(brakeF, 2.0 * m);
    // jack-knife protection (articulation angle control)
    const art = this.articulation;
    if (this.articulated && Math.abs(art) > this.dims.maxArticulation - 0.06 && this.v < 0) brakeF = Math.max(brakeF, 5 * m), (this.jackknife = true);
    else this.jackknife = false;
    const Fdrive = drive * dirSign;
    const Fres = -grade; // along the travel direction (+v = forwards)
    let F = Fdrive + Fres;
    const vs = Math.sign(this.v);
    const resist = roll + aero + brakeF;
    const prevV = this.v;
    if (Math.abs(this.v) < 0.02) {
      // static: move only if the net force exceeds braking & rolling resistance
      if (Math.abs(F) > resist) this.v += ((F - Math.sign(F) * resist) / m) * dt;
      else this.v = 0;
    } else {
      this.v += ((F - vs * resist) / m) * dt;
      if (Math.sign(this.v) !== vs && brakeF > Math.abs(F)) this.v = 0;
    }
    this.aLong = (this.v - prevV) / dt;
    this.throttleOut = throttle;
    this.brakeOut = brake;
    this.load = inGear && this.engineOn ? clamp(throttle * (lockup ? 1 : 0.8) + Math.max(0, grade) / (m * 2), 0, 1) : throttle * 0.3;

    // ---------------- kinematics
    const understeer = 1 / (1 + 0.0016 * this.v * this.v);
    const dEff = this.delta * understeer;
    const omega = (this.v * Math.tan(dEff)) / this.L1;
    const ox = this.x, oz = this.z;
    this.yaw = wrapAngle(this.yaw + omega * dt);
    this.x += fwdX(this.yaw) * this.v * dt;
    this.z += fwdZ(this.yaw) * this.v * dt;
    this.aLat = this.v * omega;
    // trailer follows the hitch
    const orx = this.rx, orz = this.rz;
    if (this.articulated) {
      const [hx, hz] = this.hitch();
      let dx = hx - this.rx, dz = hz - this.rz;
      const dl = Math.hypot(dx, dz) || 1;
      this.rx = hx - (dx / dl) * this.L2;
      this.rz = hz - (dz / dl) * this.L2;
      this.yawR = Math.atan2(-(hx - this.rx), -(hz - this.rz));
      // articulation limit
      const a2 = wrapAngle(this.yaw - this.yawR);
      if (Math.abs(a2) > this.dims.maxArticulation) {
        const lim = this.yaw - Math.sign(a2) * this.dims.maxArticulation;
        this.yawR = lim;
        this.rx = hx - fwdX(lim) * this.L2;
        this.rz = hz - fwdZ(lim) * this.L2;
      }
    } else {
      this.rx = this.x;
      this.rz = this.z;
      this.yawR = this.yaw;
    }
    // ---------------- collisions against static geometry
    this.lastCollision = null;
    if (this.collide) {
      for (let it = 0; it < 3; it++) {
        const c = this.collide(this);
        if (!c) break;
        this.x += c.nx * c.depth;
        this.z += c.nz * c.depth;
        this.rx += c.nx * c.depth;
        this.rz += c.nz * c.depth;
        if (!this.lastCollision) this.lastCollision = { ...c, speed: Math.abs(this.v) };
        // stop only when driving into the obstacle; a graze or a touch from the
        // side must not pin the bus (it could never pull away again)
        const into = this.v * (fwdX(this.yaw) * c.nx + fwdZ(this.yaw) * c.nz);
        if (into < -0.05 && c.depth > 0.002) this.v *= -0.08;
        else this.v *= 0.97;
      }
    }
    const df = Math.hypot(this.x - ox, this.z - oz) * Math.sign(this.v || 1);
    const dr = Math.hypot(this.rx - orx, this.rz - orz) * Math.sign(this.v || 1);
    this.distF += df;
    this.distR += dr;

    // ---------------- body motion (roll / pitch spring-dampers per section)
    const kneelTarget = interlock && this.autoKneel !== false && Math.abs(this.v) < 0.1 ? 1 : 0;
    this.kneel += clamp(kneelTarget - this.kneel, -dt * 0.8, dt * 0.8);
    const rollTarget = [-this.aLat * 0.0065, -this.aLat * 0.0058];
    const pitchTarget = [this.aLong * 0.0035, this.aLong * 0.0025];
    for (let i = 0; i < 2; i++) {
      const k = 38, c = 7.5;
      this.rollV[i] += ((rollTarget[i] - this.roll[i]) * k - this.rollV[i] * c) * dt;
      this.roll[i] += this.rollV[i] * dt;
      this.pitchV[i] += ((pitchTarget[i] - this.pitch[i]) * k * 1.4 - this.pitchV[i] * c) * dt;
      this.pitch[i] += this.pitchV[i] * dt;
    }
  }

  /** Oriented boxes of the sections (one for a rigid bus) in world space for collision tests. */
  boxes() {
    const fx = fwdX(this.yaw), fz = fwdZ(this.yaw), [bf, br] = this.box, hw = this.hw;
    // MAN front: bumper (-7.805) to body end (1.3) in section z => centre 3.25 ahead of axle 2
    const out = [{ cx: this.x + fx * bf.c, cz: this.z + fz * bf.c, fx, fz, hl: bf.hl, hw }];
    if (br) {
      const rfx = fwdX(this.yawR), rfz = fwdZ(this.yawR);
      out.push({ cx: this.rx + rfx * br.c, cz: this.rz + rfz * br.c, fx: rfx, fz: rfz, hl: br.hl, hw });
    }
    return out;
  }
}
