// BMC Procity 12 CNG in Sofia livery (fleet 14xx / 25xx), the 12 m rigid white/green CNG bus of line 64.
// Reference photos: data/research/ref_photos/v2/ref06..11_procity.jpg. Numbers and sources: ./NOTES.md.
// Frame: rigid body, origin = rear axle; x right, y up, z backwards (front = -z).
import { buildLayout } from './layout.js';

const dims = {
  // BMC data: length 12 090 mm, width 2 550 mm, wheelbase 5 850 mm, entrance height 340 mm, 275/70 R22.5.
  length: 12.09, width: 2.55, halfW: 1.275,
  roofY: 2.88, // top of the body shell (flat roof between the pods)
  podY: 3.38, // top of the roof CNG cylinder housing
  skirtY: 0.33, // lower edge of the side panels
  floorY: 0.34,
  beltY: 1.30, // window sill line
  windowTopY: 2.70, // top of the side glazing
  wheelR: 0.478, track: 2.08,
  frontOverhang: 2.74, wb1: 5.85, rearOverhang: 3.5, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
  maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
};

const spec = {
  id: 'procity',
  name: 'BMC Procity 12 CNG',
  short: 'BMC Procity',
  lines: ['64'],
  articulated: false,
  dims,
  // Three double doors on the right: door 1 ahead of the front axle (beside the driver), door 2 between the axles,
  // door 3 behind the rear axle (photos ref06, ref07). z0 = leading edge, clear opening 1.2 m.
  doors: [
    { id: 1, section: 'front', z0: -7.8, z1: -6.6 },
    { id: 2, section: 'front', z0: -4.0, z1: -2.8 },
    { id: 3, section: 'front', z0: 0.85, z1: 2.05 },
  ],
  look: { body: 0xf1f2ee, roof: 0xf1f2ee, window: 0x07090b, lower: 0x0e0f11, stripe: null, seat: 0x474c52, pole: 0xc9cdd0, floor: 0x9a9a95, led: '#ff9a1a' },
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
spec.layout = buildLayout(spec);
export default spec;
