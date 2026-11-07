// Battery-electric buses of line 84: energy accounting, power and regeneration limits, charging, dispatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatterySystem } from '../src/vehicle/BatterySystem.js';
import { VEHICLES, LINE_FLEETS, lineVehicles, dispatchVehicle, lineShares } from '../src/vehicle/Vehicles.js';

const SOR = VEHICLES.sor, E12 = VEHICLES.e12;

test('battery energy: one hour at 60 kW traction draws traction / efficiency + auxiliaries', () => {
  const b = new BatterySystem(E12, { soc: 1, ambient: 20 }); // no heating or cooling at 20 °C
  const phys = { motorPower: 60e3, v: 10 };
  for (let i = 0; i < 3600 * 10; i++) b.step(0.1, phys);
  const expectKWh = 60 / E12.battery.driveEff + E12.battery.aux / 1000;
  const usedKWh = (1 - b.soc) * b.capacity;
  assert.ok(Math.abs(usedKWh - expectKWh) < expectKWh * 0.03, `${usedKWh} vs ${expectKWh}`);
  assert.ok(b.temp > 20 && b.temp < 50, `cells ${b.temp}`);
});

test('battery limits: power derated when empty, regeneration when full, nothing below 2 %', () => {
  const b = new BatterySystem(SOR, { soc: 0.5 });
  b.limits();
  assert.equal(b.dischargeLimit, SOR.battery.maxDischarge);
  b.soc = 0.1; b.limits();
  assert.ok(b.dischargeLimit < SOR.battery.maxDischarge * 0.8 && b.dischargeLimit > 0);
  b.soc = 0.015; b.limits();
  assert.equal(b.dischargeLimit, 0);
  b.soc = 0.99; b.limits();
  assert.ok(b.regenLimit < SOR.battery.maxRegen * 0.2);
  b.soc = 1; b.limits();
  assert.equal(b.regenLimit, 0);
  // regeneration puts energy back
  b.soc = 0.5;
  const before = b.soc;
  for (let i = 0; i < 600; i++) b.step(0.1, { motorPower: -50e3, v: 8 });
  assert.ok(b.soc > before);
});

test('range and depot charging: plausible for both types', () => {
  const s = new BatterySystem(SOR, { soc: 1 }), e = new BatterySystem(E12, { soc: 1 });
  // SOR brochure: 120-150 km; Yutong E12: over 300 km (estimates from the typical consumption)
  assert.ok(s.rangeKm > 100 && s.rangeKm < 160, `SOR ${s.rangeKm}`);
  assert.ok(e.rangeKm > 280 && e.rangeKm < 400, `E12 ${e.rangeKm}`);
  e.soc = 0.2;
  const min = e.chargeMinutes(1);
  assert.ok(min > 100 && min < 220, `E12 20-100 % ${min} min`);
  let t = 0;
  while (e.soc < 0.8 && t < 4 * 3600) { e.charge(1); t++; }
  assert.ok(Math.abs(t / 60 - (0.6 * e.capacity) / E12.battery.charge.kW * 60) < 3, `${t / 60} min to 80 %`);
});

test('line 84: SOR EBN 11, Yutong E12, Yutong ZK6126HGA one third each; historical demonstration mode', () => {
  assert.deepEqual(lineVehicles('84'), ['sor', 'e12', 'yutong']);
  assert.ok(Math.abs(LINE_FLEETS['84'].reduce((a, v) => a + v.share, 0) - 1) < 1e-9);
  const c = {};
  for (let n = 0; n < 6000; n++) { const v = dispatchVehicle('84', n, 5, 'random', lineShares('84', {})); c[v] = (c[v] || 0) + 1; }
  for (const id of ['sor', 'e12', 'yutong']) assert.ok(Math.abs(c[id] / 6000 - 1 / 3) < 0.03, JSON.stringify(c));
  for (let n = 0; n < 200; n++) assert.equal(dispatchVehicle('84', n, 4, 'random', lineShares('84', { fleetMode84: 'historical' })), 'sor');
  for (let n = 0; n < 200; n++) assert.notEqual(dispatchVehicle('84', n, 4, 'random', lineShares('84', { fleetMode84: 'modern' })), 'sor');
  // the orange Yutong keeps its CNG drivetrain (no battery) and still runs on line 64
  assert.ok(!VEHICLES.yutong.battery && VEHICLES.yutong.physics.gears.length >= 4);
  assert.ok(LINE_FLEETS['64'].some((v) => v.id === 'yutong'));
});
