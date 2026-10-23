// Mercedes-Benz O 345 Conecto G: the older-generation orange articulated buses of Sofia
// (fleet 11xx / 33xx). Reference photos: data/research/ref_photos/v2/ref01..05_conecto.jpg.
// Dimensions are approximate until measured from the photos (see the agent notes in
// data/research/bus/conecto/); the spec, not the model, is what physics and gameplay use.
import { autoLayout } from '../autoLayout.js';

const dims = {
  length: 17.94, width: 2.5, halfW: 1.25, roofY: 2.92, podY: 3.05, skirtY: 0.32, floorY: 0.36,
  beltY: 1.1, windowTopY: 2.42, wheelR: 0.49, track: 2.06,
  frontOverhang: 2.68, wb1: 5.3, wb2: 6.0, rearOverhang: 3.96, hitchBehindAxle2: 1.62, bellowsGap: 0.45,
  maxSteer: 0.66, maxArticulation: 0.9, steeringRatio: 20,
};

const spec = {
  id: 'conecto',
  name: 'Mercedes-Benz Conecto G',
  short: 'Conecto G',
  lines: ['280'],
  articulated: true,
  dims,
  // right side; front frame origin = middle axle, rear frame origin = rear axle
  doors: [
    { id: 1, section: 'front', z0: -7.66, z1: -6.46 },
    { id: 2, section: 'front', z0: -2.4, z1: -1.2 },
    { id: 3, section: 'rear', z0: -3.9, z1: -2.7 },
    { id: 4, section: 'rear', z0: 0.85, z1: 2.05 },
  ],
  look: { body: 0xf07a12, roof: 0xe9e9e4, window: 0x0a0c0e, lower: 0x2a2a2a, stripe: 0x2b2b2b, seat: 0xb9bdc0, seatFabric: 0x5a6b86, pole: 0xc8231c, floor: 0x3b3d40, bellows: 0x9b9586, led: '#c8ff2a' },
  // OM 457 hLA (12 l diesel, ~220-260 kW), ZF Ecomat 5-speed automatic (approximate)
  physics: {
    massEmpty: 16300,
    torque: (rpm) => (rpm < 600 ? 900 : rpm < 1100 ? 900 + ((rpm - 600) / 500) * 950 : rpm <= 1500 ? 1850 : rpm <= 2100 ? 1850 - ((rpm - 1500) / 600) * 520 : 1200),
    idle: 560, maxRpm: 2200, gears: [3.43, 2.01, 1.42, 1.0, 0.83], final: 6.21, reverse: 4.84, governed: 68 / 3.6, aeroArea: 7.9,
  },
  audio: { profile: 'mb_diesel' },
  doorWarning: { beeps: 1, freq: 1150, ms: 650 }, // older buzzer
  fleets: [{ fleet: '3314', plate: 'С 8385 НС' }, { fleet: '1129', plate: 'С 4764 НТ' }, { fleet: '1136', plate: 'С 4770 НТ' }],
};
spec.layout = autoLayout(spec, { bay: { sec: 'front', side: 'L', z0: -2.6, z1: -1.0 } });
spec.layout.fabric = true;
export default spec;
