/*
 * Ranger 1 caught by Miller's tidal wave: a buoyant hull in the wave's flow, in the vertical plane along the wave's
 * direction of travel.
 *
 * The wave itself is the film's (1.2 km high, 40 m/s, over a knee-deep sea): no real ocean makes one, so its flow is
 * an assumption. The water's particle velocity is taken as that of a long wave whose moving mass is an effective
 * depth D thick: forward u = c eta / (eta + D); and since the surface is a streamline of the steady flow seen from the
 * moving wave, the surface water rises at w = -(c - u) d(eta)/dx on the face (fast: the face is steep) and sinks on
 * the long back. Everything else is ordinary mechanics:
 *
 *   buoyancy   rho g V_sub, the hull ~17 x 5 m in plan and 3.2 m deep (it floats 0.3 m deep: 28 t at 1.3 g)
 *   drag       0.5 rho Cd A |v_rel| v_rel against the water, A the wetted side (along) and bottom (vertical) areas
 *   added mass half the displaced water, gravity, the sea floor under the gear, friction on it.
 *
 * So the hull is swept up the face with the rising water (or briefly engulfed where the face rises faster than it
 * can follow), thrown off the crest if the water falls away faster than gravity can pull it down, rides down the
 * long back and is set down on the sea floor kilometres from where it stood. Peak acceleration and the depth of water
 * over the hull are recorded: they are what damages it.
 */

export interface WaterAt { h: number; slope: number; u: number }

const RHO = 1000;
const A_PLAN = 87;       // m^2, hull in plan (waterplane)
const BEAM = 9.0;        // m, side presented to the flow along the wave
const HULL_H = 3.2;      // m, hull depth
const CD = 1.0;

export class WaveRide {
  /** along-wave position from the start (m), height of the Ranger's reference point (m), velocities (m/s) */
  x = 0; z: number; vx = 0; vz = 0;
  /** water over the hull top (m), worst so far; specific force (g), worst so far */
  depth = 0; maxDepth = 0; gLoad = 0; maxG = 0;
  airborne = false;
  /** submerged fraction of the hull 0..1 */
  wet = 0;
  t = 0;

  constructor(public mass: number, public touchH: number, public g: number, public c: number, public D = 1500) {
    this.z = touchH;
  }

  /** advance dt (s); water(x) gives the surface height above the sea and its slope at along-wave position x */
  step(dt: number, water: (x: number) => WaterAt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, water);
  }

  private sub(dt: number, water: (x: number) => WaterAt) {
    const W = water(this.x);
    const eta = Math.max(0, W.h);
    const u = (this.c * eta) / (eta + this.D);
    const w = -(this.c - u) * W.slope;
    const zb = this.z - this.touchH;                       // hull bottom above the sea floor
    const dsub = Math.max(0, Math.min(HULL_H, eta - zb));
    this.wet = dsub / HULL_H;
    this.depth = Math.max(0, eta - (zb + HULL_H));
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    this.airborne = dsub <= 0 && zb > 0.5;
    const vSub = A_PLAN * dsub;
    const mEff = this.mass + 0.5 * RHO * vSub;
    // drag toward the water's velocity: exact exponential relaxation over the step (stiff when deeply wetted)
    const vx0 = this.vx, vz0 = this.vz;
    const ax = BEAM * Math.max(dsub, 0.05), az = A_PLAN * Math.min(1, dsub / 0.4);
    const rx = u - this.vx, rz = w - this.vz;
    const kx = (0.5 * RHO * CD * ax * Math.abs(rx)) / mEff, kz = (0.5 * RHO * CD * az * Math.abs(rz)) / mEff;
    this.vx = u - rx * Math.exp(-kx * dt);
    this.vz = w - rz * Math.exp(-kz * dt);
    // buoyancy and gravity
    this.vz += ((RHO * vSub * this.g - this.mass * this.g) / mEff) * dt;
    // the sea floor under the gear, and friction on it when the water is too shallow to float the hull
    if (this.z + this.vz * dt <= this.touchH) {
      this.vz = Math.max(0, this.vz);
      const fr = 0.6 * this.g * Math.max(0, 1 - (RHO * vSub) / this.mass) * dt;
      this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - Math.sign(this.vx) * fr;
    }
    this.x += this.vx * dt;
    this.z = Math.max(this.touchH, this.z + this.vz * dt);
    // what the crew feels: every acceleration but gravity's
    const axT = (this.vx - vx0) / dt, azT = (this.vz - vz0) / dt + this.g;
    this.gLoad = Math.hypot(axT, azT) / 9.80665;
    if (this.t > 0.2) this.maxG = Math.max(this.maxG, this.gLoad);
    this.t += dt;
  }

  /** on the sea floor again, at rest, the wave gone by */
  settled(W: WaterAt) { return this.t > 20 && W.u < -300 && W.h < 1.0 && this.z - this.touchH < 0.05 && Math.abs(this.vx) < 0.2 && Math.abs(this.vz) < 0.2; }
}
