// The two battery-electric buses of line 84 (Expansion 6.0), built on the line-9 vehicle framework
// (models/trolley/TrolleyModel.js with a design object on the spec):
//   SOR EBN 11      Czech 11.1 m low-entry battery bus by SOR Libchavy; the demonstrator #3639 (Czech plate 5E6 6529)
//                   ran on line 84 in Sofia in spring 2017 (the user's photographs 1-6, one with the line-84 card in
//                   the windscreen). In the game it is a historical demonstration vehicle, not a claim of current
//                   regular service.
//   Yutong E12      Chinese 12.17 m low-floor battery bus (ZK6128BEVG) in the white zero-emission livery of Sofia with
//                   the blue and turquoise leaves (photographs 7-10, fleet numbers 2807 and 2808).
// The orange Yutong ZK6126HGA of line 64 is the third line-84 bus and keeps its own model, CNG drive and sounds.
//
// Sources and what is estimated: data/research/line84/README.md. Published figures: SOR EBN 11 length 11 100 mm,
// width 2 525 mm, height 2 920 mm, wheelbase 6 320 mm, 172 kWh LiFePO4 battery, asynchronous traction motor 120 kW
// continuous / 180 kW peak (SOR brochure, via search summaries); Yutong E12 length 12 170 mm, LFP battery, 215 kW
// motor (Yutong, Wikipedia), 0.99 kWh/km average consumption in Sofia (Yutong press release, 2018). The E12 battery
// capacity (374 kWh) is the directive's figure and is not confirmed by a reachable source. Masses, overhangs, door
// positions, charging powers and auxiliary loads are estimates for the vehicle types.
import { SOR_DESIGN, E12_DESIGN } from './designs.js';
import { sorLayout, e12Layout } from './layout.js';

// door signals and sounds as described by the user:
//   SOR EBN 11: outward plug doors (the leaves swing out, then slide aside), quiet modern door drives; before the
//               doors close a fast modern warning "ni ni ni ni ni ni ni ni", then they close
//   Yutong E12: doors open and close inwards, a modern and loud drive noise, a slight thump of the seal at the end
//               of closing; a white lamp over each door, inside and outside, is lit while the door is open
export const SOR = {
  id: 'sor',
  kind: 'bus',
  name: 'SOR EBN 11',
  short: 'SOR EBN 11',
  lines: ['84'],
  historical: true, // the 2017 demonstrator: offered in the historical demonstration fleet mode
  articulated: false,
  dims: {
    length: 11.1, width: 2.525, halfW: 1.2625, roofY: 2.78, podY: 3.1, skirtY: 0.3, floorY: 0.34,
    beltY: 1.08, windowTopY: 2.52, wheelR: 0.48, track: 2.08,
    frontOverhang: 2.65, wb1: 6.32, rearOverhang: 2.13, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
    maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
  },
  // clear openings (z0 = leading edge, rear-axle frame): door 1 in the front overhang, door 2 just behind the front
  // wheel, door 3 about 2 m ahead of the rear axle (photograph 1); the raised rear section has no door
  doors: [
    { id: 1, section: 'front', z0: -8.75, z1: -7.6 },
    { id: 2, section: 'front', z0: -5.6, z1: -4.42 },
    { id: 3, section: 'front', z0: -2.72, z1: -1.54 },
  ],
  doorType: 'plug',
  // colours measured on photographs 1-4 (sunlit panels) and 5-6 (saloon)
  look: { body: 0xf3f4f2, band: 0xf6f7f5, roof: 0xf3f4f2, window: 0x07090b, lower: 0x58b836, seat: 0x6f7378, seatFabric: 0x2768b9, pole: 0xc9cdd1, floor: 0x93a3b2, led: '#ffb21a' },
  physics: {
    massEmpty: 12300, aeroArea: 7.2,
    // asynchronous motor 120 kW continuous, 180 kW peak, 968 N m through the drive axle (estimated ratio)
    electric: { power: 180e3, cont: 120e3, force: 15.5e3, regen: 17e3, vmax: 70, ramp: 0.6, ratio: 11.5, steps: 0 },
  },
  battery: {
    kWh: 172, usable: 0.85, chem: 'LiFePO4', maxDischarge: 190e3, maxRegen: 80e3, cellsRef: '180 x 300 Ah (Winston)',
    // the demonstrator charged from a plug at the depot (estimated 80 kW); no charger at the line-84 stops
    charge: { kind: 'plug', kW: 80 }, aux: 2.4e3, hvac: { heat: 11e3, cool: 9e3 }, driveEff: 0.86, regenEff: 0.72,
    thermal: { capacity: 3.2e6, cooling: 260, heatK: 2.2e-7 },
  },
  audio: { profile: 'ebus_sor' },
  doorWarning: {
    kind: 'none', doorSound: 'electricQuiet',
    // the fast "ni ni ni ni ni ni ni ni" before closing: eight short tones (estimated pitch and timing)
    times: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 0.96, 1.12], durs: [0.085], freq: 2350, closeStart: 1.3, openDur: 1.9, closeDur: 2.1,
  },
  fleets: [{ fleet: '3639', plate: '5E6 6529', plateStyle: 'cz' }],
  design: SOR_DESIGN,
};

export const E12 = {
  id: 'e12',
  kind: 'bus',
  name: 'Yutong E12',
  short: 'Yutong E12',
  lines: ['84'],
  articulated: false,
  dims: {
    length: 12.17, width: 2.55, halfW: 1.275, roofY: 3.0, podY: 3.3, skirtY: 0.3, floorY: 0.36,
    beltY: 1.22, windowTopY: 2.92, wheelR: 0.48, track: 2.1,
    frontOverhang: 2.7, wb1: 6.1, rearOverhang: 3.37, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
    maxSteer: 0.72, maxArticulation: 0, steeringRatio: 20,
  },
  // door 1 behind the front corner, door 2 ahead of the rear axle, door 3 just behind it (photographs 7 and 9)
  doors: [
    { id: 1, section: 'front', z0: -8.5, z1: -7.3 },
    { id: 2, section: 'front', z0: -3.05, z1: -1.85 },
    { id: 3, section: 'front', z0: 0.66, z1: 1.86 },
  ],
  doorType: 'swing', // inward-opening leaves
  look: { body: 0xf1f1ef, band: 0xf1f1ef, roof: 0xf1f1ef, window: 0x07090b, lower: 0xf1f1ef, seat: 0xc3c6ca, seatFabric: 0x2c2e33, pole: 0xb9bdc1, floor: 0x6f6370, led: '#ffb21a' },
  physics: {
    massEmpty: 13600, aeroArea: 7.6,
    // permanent-magnet motor 215 kW, 3 500 N m (Wikipedia); tractive force limited by adhesion (estimated)
    electric: { power: 215e3, cont: 150e3, force: 24e3, regen: 26e3, vmax: 70, ramp: 0.5, ratio: 9.5, steps: 0 },
  },
  battery: {
    kWh: 374, usable: 0.9, chem: 'LiFePO4', maxDischarge: 320e3, maxRegen: 160e3,
    charge: { kind: 'plug', kW: 150 }, aux: 2.8e3, hvac: { heat: 14e3, cool: 13e3 }, driveEff: 0.9, regenEff: 0.78,
    thermal: { capacity: 6.5e6, cooling: 420, heatK: 1.2e-7 },
  },
  audio: { profile: 'ebus_e12' },
  doorWarning: { kind: 'white', doorSound: 'electricLoud', times: [], closeStart: 0.25, openDur: 1.6, closeDur: 1.8 },
  fleets: [{ fleet: '2807', plate: 'СВ 9617 МХ' }, { fleet: '2808', plate: 'СВ 9618 МХ' }],
  design: E12_DESIGN,
};

SOR.layout = sorLayout(SOR);
E12.layout = e12Layout(E12);
