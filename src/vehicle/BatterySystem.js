// Traction battery of a battery-electric bus (line 84: SOR EBN 11, Yutong E12). Shared module, configured by
// spec.battery; each bus type keeps its own capacity, power limits, efficiencies, auxiliary loads and thermal mass.
//
// Every physics step:
//   battery power = traction / drive efficiency  (motoring)   or  regenerated power x regen efficiency (braking)
//                   + auxiliaries (24 V systems, air compressor, displays) + heating / air conditioning
//                   + the battery's own thermal management
//   state of charge falls (rises) with the energy drawn (returned); the battery warms with the current (I²R
//   ~ P²) and cools towards the ambient temperature, with active cooling above 35 °C and heating below 5 °C.
// Limits handed to the physics (ArticulatedBus.powerLimit / regenLimit):
//   discharge  derated below 20 % (to 30 % of the maximum at 5 %, nothing below 2 %), when the cells are cold
//              (below 0 °C) or hot (above 50 °C)
//   regeneration derated above 92 % state of charge (none when full) and in cold cells
// Range: usable energy left / the running consumption (kWh/km, a distance-weighted average seeded with the type's
// typical figure). Depot charging (simulated, configurable power): constant power to 80 %, then tapering.
// All figures are estimates for the vehicle types unless the spec says otherwise (data/research/line84/README.md).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BatterySystem {
  constructor(spec, { soc = 0.92, ambient = 16, hvac = 'auto', typicalKWhKm = null } = {}) {
    const B = spec.battery;
    this.spec = B;
    this.capacity = B.kWh * B.usable; // usable kWh
    this.soc = clamp(soc, 0, 1);
    this.ambient = ambient;
    this.temp = clamp(ambient + 6, 5, 32); // cell temperature, °C
    this.hvacMode = hvac; // 'auto' | 'off'
    this.typical = typicalKWhKm || (spec.id === 'e12' ? 0.99 : 1.15); // kWh/km (E12: Yutong, Sofia 2018)
    this.avg = this.typical;
    this.distAcc = 0;
    this.energyAcc = 0;
    this.power = 0; // battery power, W (+ discharge)
    this.tractionPower = 0;
    this.auxPower = 0;
    this.hvacPower = 0;
    this.regenPower = 0;
    this.usedKWh = 0;
    this.regenKWh = 0;
    this.odo = 0;
    this.charging = false;
    this.chargePower = 0;
    this.warnings = [];
    this.dischargeLimit = B.maxDischarge;
    this.regenLimit = B.maxRegen;
  }

  /** Heating / cooling demand of the saloon from the ambient temperature (W). */
  hvacDemand(doorsOpen = false) {
    if (this.hvacMode === 'off') return 0;
    const H = this.spec.hvac;
    const t = this.ambient;
    let w = 0;
    if (t < 18) w = H.heat * clamp((18 - t) / 22, 0, 1);
    else if (t > 23) w = H.cool * clamp((t - 23) / 14, 0, 1);
    return w * (doorsOpen ? 1.25 : 1); // open doors let the conditioned air out
  }

  /** Limits from the state of charge and the cell temperature. */
  limits() {
    const B = this.spec, s = this.soc, T = this.temp;
    let d = 1;
    if (s < 0.02) d = 0;
    else if (s < 0.05) d = 0.3 * (s - 0.02) / 0.03;
    else if (s < 0.2) d = 0.3 + 0.7 * (s - 0.05) / 0.15;
    if (T < 0) d *= clamp(0.5 + (T + 20) / 40, 0.3, 1);
    if (T > 50) d *= clamp(1 - (T - 50) / 15, 0.2, 1);
    let r = 1;
    if (s > 0.92) r = clamp((1 - s) / 0.08, 0, 1);
    if (T < 5) r *= clamp((T + 10) / 15, 0.1, 1);
    this.dischargeLimit = B.maxDischarge * d;
    this.regenLimit = B.maxRegen * r;
  }

  /**
   * One step. phys: the vehicle physics (motorPower W, v m/s); returns the traction power the battery can give
   * (W, for phys.powerLimit) and the regenerative power it can take (W, for phys.regenLimit).
   */
  step(dt, phys, { doorsOpen = false, passengers = 0 } = {}) {
    const B = this.spec;
    this.limits();
    const mp = phys.motorPower || 0;
    const v = Math.abs(phys.v || 0);
    this.tractionPower = mp > 0 ? mp / B.driveEff : 0;
    this.regenPower = mp < 0 ? -mp * B.regenEff : 0;
    // auxiliaries: base load + the air compressor topping up after the doors and brakes + lighting per passenger
    this.auxPower = B.aux + (doorsOpen ? 600 : 0) + passengers * 6;
    this.hvacPower = this.hvacDemand(doorsOpen);
    // battery thermal management: cooling when warm, heating when cold
    const btms = this.temp > 35 ? 1800 : this.temp < 5 ? 2500 : 0;
    const P = this.tractionPower - this.regenPower + this.auxPower + this.hvacPower + btms - (this.charging ? this.chargePower : 0);
    this.power = P;
    const dE = (P * dt) / 3.6e6; // kWh
    this.soc = clamp(this.soc - dE / this.capacity, 0, 1);
    if (P > 0) this.usedKWh += dE; else this.regenKWh -= dE;
    // cell temperature
    const Th = B.thermal;
    const heat = Th.heatK * P * P + (this.charging ? Th.heatK * this.chargePower * this.chargePower : 0);
    const cool = Th.cooling * (this.temp - this.ambient) * (btms > 0 && this.temp > 35 ? 3 : 1);
    const warm = btms > 0 && this.temp < 5 ? btms * 0.9 : 0;
    this.temp += ((heat + warm - cool) / Th.capacity) * dt;
    // consumption average over distance (net energy per km), seeded with the type's typical value
    const ds = v * dt;
    this.odo += ds;
    this.distAcc += ds;
    this.energyAcc += dE;
    if (this.distAcc > 200) {
      const k = this.energyAcc / (this.distAcc / 1000);
      this.avg += (clamp(k, 0.3, 3.5) - this.avg) * 0.25;
      this.distAcc = 0;
      this.energyAcc = 0;
    }
    this.updateWarnings();
    return { powerLimit: Math.max(0, this.dischargeLimit - this.auxPower - this.hvacPower - btms), regenLimit: this.regenLimit };
  }

  /** Depot charging (simulated): constant power to 80 %, then tapering to 10 % of it at full. */
  charge(dt, kW = null) {
    const B = this.spec;
    const pmax = (kW ?? B.charge.kW) * 1000;
    let p = pmax;
    if (this.soc > 0.8) p = pmax * clamp(1 - ((this.soc - 0.8) / 0.2) * 0.9, 0.1, 1);
    if (this.temp > 45) p *= 0.5;
    if (this.soc >= 0.999) p = 0;
    this.charging = p > 0;
    this.chargePower = p;
    const dE = (p * dt) / 3.6e6;
    this.soc = clamp(this.soc + dE / this.capacity, 0, 1);
    this.temp += ((B.thermal.heatK * p * p - B.thermal.cooling * (this.temp - this.ambient)) / B.thermal.capacity) * dt;
    return p;
  }

  stopCharging() {
    this.charging = false;
    this.chargePower = 0;
  }

  /** Minutes to charge to a target state of charge at the depot charger. */
  chargeMinutes(target = 1) {
    const pk = this.spec.charge.kW;
    let s = this.soc, t = 0;
    while (s < target - 1e-4 && t < 600) {
      const p = s > 0.8 ? pk * clamp(1 - ((s - 0.8) / 0.2) * 0.9, 0.1, 1) : pk;
      s += (p / 60) / this.capacity;
      t += 1;
    }
    return t;
  }

  /** Estimated range, km. */
  get rangeKm() {
    return (this.soc * this.capacity) / Math.max(0.3, this.avg);
  }

  updateWarnings() {
    const w = [];
    if (this.soc < 0.05) w.push('critical');
    else if (this.soc < 0.2) w.push('low');
    if (this.temp > 50) w.push('hot');
    if (this.temp < 0) w.push('cold');
    if (this.regenLimit < this.spec.maxRegen * 0.5) w.push('regenLimited');
    if (this.dischargeLimit < this.spec.maxDischarge * 0.6) w.push('powerLimited');
    this.warnings = w;
  }
}
