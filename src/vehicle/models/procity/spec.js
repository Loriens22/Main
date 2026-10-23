// BMC Procity 12 CNG in Sofia livery (fleet 14xx / 25xx). Reference photos:
// data/research/ref_photos/v2/ref06..11_procity.jpg. Approximate until measured.
import { autoLayout } from '../autoLayout.js';

const dims = {
  length: 12.0, width: 2.55, halfW: 1.275, roofY: 2.95, podY: 3.4, skirtY: 0.32, floorY: 0.34,
  beltY: 1.12, windowTopY: 2.55, wheelR: 0.478, track: 2.08,
  frontOverhang: 2.7, wb1: 5.95, rearOverhang: 3.35, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
  maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
};

const spec = {
  id: 'procity',
  name: 'BMC Procity CNG',
  short: 'BMC Procity',
  lines: ['64'],
  articulated: false,
  dims,
  // rigid body: frame origin = rear axle; right side
  doors: [
    { id: 1, section: 'front', z0: -8.36, z1: -7.16 },
    { id: 2, section: 'front', z0: -3.9, z1: -2.7 },
    { id: 3, section: 'front', z0: 0.85, z1: 2.05 },
  ],
  look: { body: 0xf1f2ee, roof: 0xf1f2ee, window: 0x07090b, lower: 0x0e0f11, stripe: null, seat: 0x8f969c, pole: 0xc9cdd0, floor: 0x5d6266, led: '#ff9a1a' },
  // Cummins ISL G 320 (8.9 l CNG, 239 kW, 1356 Nm at 1300 rpm), ZF EcoLife 6-speed
  physics: {
    massEmpty: 12400,
    torque: (rpm) => (rpm < 600 ? 700 : rpm < 1300 ? 700 + ((rpm - 600) / 700) * 656 : rpm <= 1600 ? 1356 : rpm <= 2100 ? 1356 - ((rpm - 1600) / 500) * 300 : 1000),
    idle: 650, maxRpm: 2200, gears: [3.364, 1.909, 1.421, 1.0, 0.72, 0.615], final: 5.86, reverse: 4.18, governed: 70 / 3.6, aeroArea: 7.4,
  },
  audio: { profile: 'cummins_cng' },
  doorWarning: { beeps: 2, freq: 2000, ms: 120 },
  fleets: [{ fleet: '1411', plate: 'СВ 5156 НА' }, { fleet: '1421', plate: 'СВ 5322 НА' }, { fleet: '1401', plate: 'СВ 5386 НА' }, { fleet: '2512', plate: 'СВ 5417 НА' }],
};
spec.layout = autoLayout(spec, { bay: { sec: 'front', side: 'L', z0: -4.0, z1: -2.6 } });
export default spec;
