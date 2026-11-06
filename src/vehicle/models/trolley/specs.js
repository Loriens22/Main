// The three trolleybuses of line 9 (Expansion 5.0): Škoda 27Tr Solaris IV (2020-2021, fleet 2801-2830, 30 kWh
// LTO traction battery), Škoda 27Tr Solaris III (2013-2014, fleet 1650-1674 and 2675-2699) and the Ikarus
// 280.92F (Ikarus 280.92 of 1985-1988 with Ganz electrical equipment, refurbished with a new front in Sofia
// 2008-2015, fleet 2104-2109 among others). Fleet facts: Wikipedia "Trolleybuses in Sofia"; appearance from the
// user's photographs 1-18. Dimensions, masses, motor powers and the battery's off-wire capability are
// estimates for the vehicle type (marked so in data/research/line9/README.md), not measured values.
import { solarisLayout, ikarusLayout } from './layout.js';

const solarisDims = (gen) => ({
  length: 18.0, width: 2.55, halfW: 1.275, roofY: 3.05, podY: 3.12, skirtY: 0.3, floorY: 0.34,
  beltY: gen === 4 ? 1.02 : 1.08, windowTopY: 2.6, wheelR: 0.48, track: 2.1,
  frontOverhang: 2.71, wb1: 5.9, wb2: 6.0, rearOverhang: 3.39, hitchBehindAxle2: 1.75, bellowsGap: 0.55,
  maxSteer: 0.68, maxArticulation: 0.92, steeringRatio: 20,
});

// door signals as heard and seen in Sofia (described by the user):
//   Solaris IV: LEDs beside every door: white when the doors are released at a stop, red slow flashing and
//               "tit-tit-tiit-tiit" while the doors open and close, green when open; quiet inverter drive
//   Solaris III: plug doors (swing out, slide aside); a red lamp over each door inside flashes with
//               "tiiiit, tiiiit, tiiit, tiit" while the doors open and close; noisier drive
//   Ikarus:     continuous hiss and rattle while opening; a long loud "beeeep" before closing, then a loud
//               hiss, the doors slam and rattle; the drive roars and the body shakes
export const SOLARIS4 = {
  id: 'solaris4',
  kind: 'trolleybus',
  name: 'Škoda 27Tr Solaris IV',
  short: 'Škoda 27Tr IV',
  lines: ['9'],
  articulated: true,
  dims: solarisDims(4),
  doors: [
    { id: 1, section: 'front', z0: -8.28, z1: -7.03 },
    { id: 2, section: 'front', z0: -2.35, z1: -1.1 },
    { id: 3, section: 'rear', z0: -3.5, z1: -2.25 },
    { id: 4, section: 'rear', z0: 0.82, z1: 2.07 },
  ],
  doorType: 'plug',
  look: { body: 0xf2a91c, blue: 0x3a94d8, roof: 0x45a6e2, window: 0x07090b, lower: 0x3a94d8, seat: 0x2e3238, seatFabric: 0x1f3f8f, pole: 0xd2241c, floor: 0x7d8186, bellows: 0x8a8c8e, led: '#ffb21a' },
  physics: {
    massEmpty: 19000, aeroArea: 8.0,
    electric: { power: 250e3, force: 31e3, regen: 36e3, vmax: 65, ramp: 0.7, ratio: 11.6, steps: 0 },
  },
  trolley: {
    base: [[-0.3, 3.38, -3.05], [0.3, 3.38, -3.05]], length: 6.15, hook: [3.05, 3.32], maxLateral: 4.4, autoLower: true,
    battery: { kWh: 30, usable: 0.8, power: 95e3, vmax: 35 },
  },
  audio: { profile: 'trolley_solaris4' },
  doorWarning: { kind: 'led', times: [0, 0.16, 0.32, 0.6], durs: [0.07, 0.07, 0.17, 0.17], freq: 2700, onOpen: true, closeStart: 0.95 },
  fleets: [{ fleet: '2811', plate: '2811' }, { fleet: '2829', plate: '2829' }, { fleet: '2806', plate: '2806' }],
};

export const SOLARIS3 = {
  id: 'solaris3',
  kind: 'trolleybus',
  name: 'Škoda 27Tr Solaris III',
  short: 'Škoda 27Tr III',
  lines: ['9'],
  articulated: true,
  dims: solarisDims(3),
  doors: [
    { id: 1, section: 'front', z0: -8.28, z1: -7.03 },
    { id: 2, section: 'front', z0: -2.4, z1: -1.15 },
    { id: 3, section: 'rear', z0: -3.5, z1: -2.25 },
    { id: 4, section: 'rear', z0: 0.85, z1: 2.1 },
  ],
  doorType: 'plug',
  look: { body: 0xf4b41e, blue: 0x4590d2, roof: 0x4b9ad8, window: 0x07090b, lower: 0x4590d2, seat: 0x6f7378, seatFabric: 0x2d2f86, pole: 0xe2401c, floor: 0x8f9396, bellows: 0x8c8f92, led: '#ffa600' },
  physics: {
    massEmpty: 18500, aeroArea: 8.1,
    electric: { power: 240e3, force: 30e3, regen: 32e3, vmax: 65, ramp: 0.9, ratio: 11.6, steps: 0 },
  },
  trolley: {
    base: [[-0.3, 3.36, -3.0], [0.3, 3.36, -3.0]], length: 6.1, hook: [3.0, 3.3], maxLateral: 4.3, autoLower: true,
    battery: null, retrievers: true,
  },
  audio: { profile: 'trolley_solaris3' },
  doorWarning: { kind: 'lamp', times: [0, 0.6, 1.14, 1.6], durs: [0.42, 0.36, 0.3, 0.2], freq: 2200, onOpen: true, closeStart: 1.95 },
  fleets: [{ fleet: '1650', plate: '1650' }, { fleet: '1661', plate: '1661' }, { fleet: '2681', plate: '2681' }],
};

export const IKARUS = {
  id: 'ikarus',
  kind: 'trolleybus',
  name: 'Ikarus 280.92F',
  short: 'Ikarus 280.92F',
  lines: ['9'],
  articulated: true,
  historical: true,
  dims: {
    length: 16.5, width: 2.5, halfW: 1.25, roofY: 3.0, podY: 3.05, skirtY: 0.42, floorY: 0.88,
    beltY: 1.58, windowTopY: 2.62, wheelR: 0.5, track: 2.06,
    frontOverhang: 2.55, wb1: 5.4, wb2: 5.65, rearOverhang: 2.9, hitchBehindAxle2: 1.6, bellowsGap: 0.5,
    maxSteer: 0.62, maxArticulation: 0.88, steeringRatio: 22,
  },
  // four doors of four narrow folding leaves: ahead of the front axle, mid front section, behind the bellows,
  // at the tail (images 11-13, 18)
  doors: [
    { id: 1, section: 'front', z0: -7.65, z1: -6.45 },
    { id: 2, section: 'front', z0: -3.3, z1: -2.1 },
    { id: 3, section: 'rear', z0: -3.35, z1: -2.15 },
    { id: 4, section: 'rear', z0: 1.2, z1: 2.4 },
  ],
  doorType: 'fold',
  look: { body: 0xf1ae17, blue: 0x3a6fb4, roof: 0xf1ae17, window: 0x0b0d0f, lower: 0x3a6fb4, seat: 0x4b5157, seatFabric: null, pole: 0xe8891a, floor: 0x5b5f63, bellows: 0x2b2d2f, led: '#c8ff2a' },
  physics: {
    massEmpty: 16200, aeroArea: 8.4,
    electric: { power: 170e3, force: 24e3, regen: 20e3, vmax: 60, ramp: 1.6, ratio: 12.5, steps: 9, shake: 1 },
  },
  trolley: {
    base: [[-0.3, 3.32, -2.95], [0.3, 3.32, -2.95]], length: 5.9, hook: [2.55, 3.25], maxLateral: 4.0, autoLower: false,
    battery: null, ropes: true,
  },
  audio: { profile: 'trolley_ikarus' },
  doorWarning: { kind: 'buzzer', times: [0], durs: [1.55], freq: 880, onOpen: false, closeStart: 1.75, slam: true, openDur: 1.7, closeDur: 1.15 },
  fleets: [{ fleet: '2106', plate: '2106' }, { fleet: '2105', plate: '2105' }, { fleet: '2107', plate: '2107' }],
};

SOLARIS4.layout = solarisLayout(SOLARIS4, 4);
SOLARIS3.layout = solarisLayout(SOLARIS3, 3);
IKARUS.layout = ikarusLayout(IKARUS);


