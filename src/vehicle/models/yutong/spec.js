// Yutong ZK6126HGA (CNG, per Yutong Bulgaria) in the orange Sofia livery with white leaves.
// Reference photos: data/research/ref_photos/v2/ref12..15_yutong.jpg. Approximate until measured.
import { autoLayout } from '../autoLayout.js';

const dims = {
  length: 12.0, width: 2.5, halfW: 1.25, roofY: 2.95, podY: 3.25, skirtY: 0.33, floorY: 0.34,
  beltY: 1.1, windowTopY: 2.55, wheelR: 0.478, track: 2.05,
  frontOverhang: 2.55, wb1: 6.1, rearOverhang: 3.35, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
  maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
};

const spec = {
  id: 'yutong',
  name: 'Yutong ZK6126HGA',
  short: 'Yutong ZK6126',
  lines: ['64'],
  articulated: false,
  dims,
  doors: [
    { id: 1, section: 'front', z0: -8.36, z1: -7.16 },
    { id: 2, section: 'front', z0: -2.25, z1: -1.05 },
    { id: 3, section: 'front', z0: 0.9, z1: 2.1 },
  ],
  look: { body: 0xf28a1c, roof: 0xf28a1c, window: 0x08090b, lower: 0x111213, stripe: null, seat: 0xa7adb2, pole: 0xc9cdd0, floor: 0x3e4246, led: '#ff9a1a' },
  // CNG six-cylinder (~8.4 l, ~240 kW), 6-speed automatic (approximate)
  physics: {
    massEmpty: 12000,
    torque: (rpm) => (rpm < 600 ? 650 : rpm < 1200 ? 650 + ((rpm - 600) / 600) * 600 : rpm <= 1600 ? 1250 : rpm <= 2100 ? 1250 - ((rpm - 1600) / 500) * 280 : 950),
    idle: 640, maxRpm: 2200, gears: [3.49, 1.86, 1.41, 1.0, 0.75, 0.65], final: 5.83, reverse: 5.0, governed: 70 / 3.6, aeroArea: 7.3,
  },
  audio: { profile: 'yutong_cng' },
  doorWarning: { beeps: 3, freq: 2300, ms: 100 },
  fleets: [{ fleet: '1501', plate: 'СВ 4501 НВ' }, { fleet: '1502', plate: 'СВ 4502 НВ' }, { fleet: '1503', plate: 'СВ 4503 НВ' }],
};
spec.layout = autoLayout(spec, { bay: { sec: 'front', side: 'L', z0: -2.4, z1: -1.0 } });
export default spec;
