// Yutong ZK6126HGA (CNG, Euro 6) in the orange Sofia livery with white leaf ornaments.
// Reference photos: data/research/ref_photos/v2/ref12..15_yutong.jpg. Dimensions measured on them (NOTES.md).
import { K, FY } from './consts.js';
import { buildLayout } from './layout.js';

const dims = {
  length: K.rearZ - K.frontZ, width: 2.5, halfW: K.hw, roofY: K.roofY, podY: K.rearPodY, skirtY: K.skirtY, floorY: FY,
  beltY: K.beltY, windowTopY: K.winTopY, wheelR: K.wheelR, track: 2.06,
  frontOverhang: -K.frontZ + K.axleF, wb1: -K.axleF, rearOverhang: K.rearZ, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
  maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
};

const spec = {
  id: 'yutong',
  name: 'Yutong ZK6126HGA',
  short: 'Yutong ZK6126',
  lines: ['64'],
  articulated: false,
  dims,
  // measured on ref13: front door ahead of the steered axle, middle door ahead of the rear axle, rear door behind it
  doors: K.doors.map((d) => ({ ...d })),
  look: { body: 0xf28a1c, roof: 0xf28a1c, window: 0x08090b, lower: 0x111213, stripe: null, seat: 0xa7adb2, pole: 0xc9cdd0, floor: 0x3e4246, led: '#ff9a1a' },
  // CNG six-cylinder (~8.4 l, ~240 kW), 6-speed automatic (approximate)
  physics: {
    massEmpty: 12000,
    torque: (rpm) => (rpm < 600 ? 650 : rpm < 1200 ? 650 + ((rpm - 600) / 600) * 600 : rpm <= 1600 ? 1250 : rpm <= 2100 ? 1250 - ((rpm - 1600) / 500) * 280 : 950),
    idle: 640, maxRpm: 2200, gears: [3.49, 1.86, 1.41, 1.0, 0.75, 0.65], final: 5.83, reverse: 5.0, governed: 70 / 3.6, aeroArea: 7.3,
  },
  audio: { profile: 'yutong_cng' },
  doorWarning: { beeps: 3, freq: 2300, ms: 100 },
  // placeholders: no real Sofia fleet numbers / plates could be verified (NOTES.md)
  fleets: [{ fleet: '1501', plate: 'СВ 4501 НВ' }, { fleet: '1502', plate: 'СВ 4502 НВ' }, { fleet: '1503', plate: 'СВ 4503 НВ' }],
};
spec.layout = buildLayout(spec);
export default spec;
