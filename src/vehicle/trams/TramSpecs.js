// The trams of lines 12 and 7: dimensions, sections and their supports on the track, doors, seats, traction and
// braking, sounds. Sources and estimates: data/research/line12/README.md, data/research/line7/README.md.
//
// Geometry is given as distances d from the front end of the tram along the track. Every section has two
// supports that lie on the track centre line (a bogie pivot or an articulation joint); the kinematics places
// the section on the chord between them. Section frames (models, doors, seats): origin on the track centre at
// the section's front end, x right, y up from the rail head, z backwards (z = d - d0 of the section).

import { SchindlerModel } from './SchindlerModel.js';
import { T6MModel } from './T6MModel.js';
import { PesaModel } from './PesaModel.js';
import { InekonModel } from './InekonModel.js';

const g = 9.81;

function section(id, d0, d1, supports, extra = {}) {
  return { id, d0, d1, length: d1 - d0, supports, ...extra };
}

/** Traction force (N) at speed v (m/s) for full power: constant force up to the base speed, then constant power. */
function tractionCurve(F0, P) {
  return (v) => Math.min(F0, P / Math.max(0.5, v));
}

// ------------------------------------------------------------------ Schindler/Siemens Be 4/6 S (photos 1-6)
// The original Basel car: two halves on two powered end bogies and a Jacobs bogie, bogie centres 2 x 6.40 m,
// 20.37 m. The 7.75 m low-floor module ("Sänfte", sedan chair) was inserted at the joint: the front half keeps
// its powered bogie and the former Jacobs bogie under its rear end, the module is carried between the halves
// and the rear half runs on its powered bogie 6.4 m behind its front joint. Section lengths from photos 1, 4-6
// (estimated): 10.4 + 7.75 + 9.65 m with 0.4 m joints, 28.6 m in all; width 2.20 m.
const SCH_J1 = 10.6, SCH_J2 = 18.75;
export const SCHINDLER = {
  id: 'schindler',
  kind: 'tram',
  name: 'Schindler/Siemens Be 4/6 S',
  short: 'Be 4/6 S',
  lines: ['12'],
  articulated: true,
  dims: {
    length: 28.6, width: 2.2, halfW: 1.1,
    roofY: 3.42, // top of the roof fairings above the rail head
    floorY: 0.86, // high-floor sections (two steps at the doors)
    lowFloorY: 0.36, // the low-floor module
    beltY: 1.42, windowTopY: 2.5,
    wheelR: 0.33,
    // fields read by bus-era code: set below from the sections
  },
  sections: [
    section('front', 0, 10.4, [{ d: 3.785, kind: 'bogie', powered: true }, { d: 10.185, kind: 'bogie', powered: false }]),
    section('middle', 10.8, 18.55, [{ d: SCH_J1, kind: 'joint' }, { d: SCH_J2, kind: 'joint' }], { lowFloor: true }),
    section('rear', 18.95, 28.6, [{ d: SCH_J2, kind: 'joint' }, { d: SCH_J2 + 6.4, kind: 'bogie', powered: true }]),
  ],
  // joint J2 is solved from the front section's rear joint and the rear bogie (the module is carried, not supported)
  carried: { section: 'middle', joints: [SCH_J1, SCH_J2] },
  bogies: { wheelbase: 1.75, wheelR: 0.33 },
  // right side, d along the tram (leading edge d0, trailing d1); positions from photos 1, 4, 6 (estimated)
  doors: [
    { id: 1, section: 'front', d0: 1.6, d1: 2.4, leaves: 1 },
    { id: 2, section: 'front', d0: 6.3, d1: 7.6, leaves: 2 },
    { id: 3, section: 'middle', d0: 14.4, d1: 15.7, leaves: 2, lowFloor: true },
    { id: 4, section: 'rear', d0: 21.35, d1: 22.65, leaves: 2 },
  ],
  cab: { eye: [-0.3, 2.13, 0.98], d: 0.98, wallZ: 1.5 }, // driver's eye in the front section frame
  physics: {
    massEmpty: 33500, // estimate: Be 4/6 S about 30 t plus the low-floor module
    poweredMassShare: 0.62,
    traction: tractionCurve(64000, 4 * 75000 * 0.92),
    vmax: 65 / 3.6,
    notches: 4,
    brakeNotches: 4,
    serviceDecel: 1.25, // rheostatic + disc brake at the last notch
    emergencyDecel: 2.7, // with the magnetic track brakes
    davis: [900, 30, 4.2],
    electricBrake: 'rheostatic',
  },
  audio: { profile: 'tram_schindler' },
  doorWarning: { beeps: 3, freq: 1150, ms: 220, times: [0, 0.35, 0.7], closeStart: 1.1 },
  look: { body: 0x2f9e46, stripe: 0xf3f3ee, window: 0x0b0e10, seat: 0x23436e, pole: 0xb9bec1, floor: 0x3b3d3f },
  fleets: [{ fleet: '666' }, { fleet: '661' }, { fleet: '685' }, { fleet: '677' }, { fleet: '663' }, { fleet: '672' }],
};

// ------------------------------------------------------------------ T6M-700 (photos 7-10)
// Two equal sections on three bogies: the outer bogies and a Jacobs bogie under the joint. 20.75 m, 2.25 m.
const T6_J = 10.375;
export const T6M = {
  id: 't6m',
  kind: 'tram',
  name: 'T6M-700',
  short: 'T6M-700',
  lines: ['12'],
  articulated: true,
  dims: {
    length: 20.75, width: 2.25, halfW: 1.125,
    roofY: 3.12,
    floorY: 0.9, // high floor, three steps at the doors
    beltY: 1.52, windowTopY: 2.55,
    wheelR: 0.33,
  },
  sections: [
    section('front', 0, T6_J - 0.2, [{ d: 3.0, kind: 'bogie', powered: true }, { d: T6_J, kind: 'bogie', powered: true, jacobs: true }]),
    section('rear', T6_J + 0.2, 20.75, [{ d: T6_J, kind: 'bogie', powered: true, jacobs: true }, { d: 17.75, kind: 'bogie', powered: true }]),
  ],
  bogies: { wheelbase: 1.8, wheelR: 0.33 },
  doors: [
    { id: 1, section: 'front', d0: 1.95, d1: 3.2, leaves: 2 },
    { id: 2, section: 'front', d0: 7.25, d1: 8.5, leaves: 2 },
    { id: 3, section: 'rear', d0: 12.35, d1: 13.6, leaves: 2 },
    { id: 4, section: 'rear', d0: 17.85, d1: 19.1, leaves: 2 },
  ],
  cab: { eye: [-0.35, 2.17, 1.05], d: 1.05, wallZ: 1.75 },
  physics: {
    massEmpty: 25000, // bg.wikipedia
    poweredMassShare: 1.0,
    traction: tractionCurve(52000, 4 * 50000 * 0.9), // 4 x 50 kW DC motors (200 kW)
    vmax: 60 / 3.6,
    notches: 5, // resistance controller: series steps, then parallel and field weakening
    brakeNotches: 4,
    serviceDecel: 1.15,
    emergencyDecel: 2.6,
    davis: [800, 26, 3.8],
    electricBrake: 'rheostatic',
    steps: true, // the notches come in with an audible jerk (contactors)
  },
  audio: { profile: 'tram_t6m' },
  doorWarning: { beeps: 1, freq: 820, ms: 900, times: [0], closeStart: 0.9 },
  look: { blue: 0x3f9fd8, orange: 0xf29a1d, skirt: 0xe9e8e2, window: 0x0b0e10, seat: 0x55595e, pole: 0xf0a020, floor: 0x7d7f7c },
  fleets: [{ fleet: '711' }, { fleet: '714' }, { fleet: '703' }, { fleet: '708' }, { fleet: '719' }, { fleet: '722' }],
};

// ------------------------------------------------------------------ PESA Swing 122NaSF (line 7, photos 1-5)
// Five sections, 100 % low floor, 30.12 m x 2.30 m (Pesa Swing data; the Sofia order: 30 m, 2.3 m, 41 seats).
// Three fixed bogies (the bogie frame is bolted to the body) under sections 1, 3 and 5; sections 2 and 4 hang
// between them. Cabs at both ends and doors on both sides (photos 1-3: the single door behind each cab, two
// double doors in each suspended section, none in the middle section). Section lengths and door positions are
// estimated from photos 1-3 (no reachable drawing); the joints are 0.45 m.
const PJ = [7.175, 13.225, 16.895, 22.945];
export const PESA = {
  id: 'pesa',
  kind: 'tram',
  name: 'PESA Swing 122NaSF',
  short: 'PESA Swing',
  lines: ['7'],
  articulated: true,
  kinematics: 'suspended',
  bidirectional: true,
  dims: {
    length: 30.12, width: 2.3, halfW: 1.15,
    roofY: 3.4, // roof equipment covers (3.40 m without the pantograph)
    floorY: 0.38, // low floor everywhere (estimated 0.35 at the doors)
    lowFloorY: 0.38,
    beltY: 1.26, windowTopY: 2.45,
    wheelR: 0.3,
  },
  sections: [
    section('front', 0, 6.95, [{ d: 4.9, kind: 'bogie', powered: true, fixed: true }]),
    section('second', 7.4, 13.0, [{ d: PJ[0], kind: 'joint' }, { d: PJ[1], kind: 'joint' }], { lowFloor: true }),
    section('middle', 13.45, 16.67, [{ d: 15.06, kind: 'bogie', powered: false, fixed: true }]),
    section('fourth', 17.12, 22.72, [{ d: PJ[2], kind: 'joint' }, { d: PJ[3], kind: 'joint' }], { lowFloor: true }),
    section('rear', 23.17, 30.12, [{ d: 25.22, kind: 'bogie', powered: true, fixed: true }]),
  ],
  bogies: { wheelbase: 1.8, wheelR: 0.3, lowFloor: true },
  // right side; the left side has the same doors (they stay closed: every line 7 platform is on the right)
  doors: [
    { id: 1, section: 'front', d0: 2.0, d1: 2.9, leaves: 1 },
    { id: 2, section: 'second', d0: 7.6, d1: 9.0, leaves: 2 },
    { id: 3, section: 'second', d0: 11.4, d1: 12.8, leaves: 2 },
    { id: 4, section: 'fourth', d0: 17.32, d1: 18.72, leaves: 2 },
    { id: 5, section: 'fourth', d0: 21.12, d1: 22.52, leaves: 2 },
    { id: 6, section: 'rear', d0: 27.22, d1: 28.12, leaves: 1 },
  ],
  doorsBothSides: true,
  cab: { eye: [-0.12, 2.02, 1.48], d: 1.48, wallZ: 1.9 },
  physics: {
    massEmpty: 39500, // estimated (five-section 30 m Swing)
    poweredMassShare: 0.66, // two powered bogies of three
    traction: tractionCurve(80000, 4 * 105000 * 0.93), // four 105 kW asynchronous motors (Railway Gazette)
    vmax: 70 / 3.6, // design speed; the line limits apply
    notches: 7, // the master controller is stepless: seven positions with smooth ramps
    brakeNotches: 5,
    serviceDecel: 1.35, // electric (regenerative) + disc brakes
    emergencyDecel: 2.9, // with the magnetic track brakes
    davis: [1050, 34, 4.6],
    electricBrake: 'regenerative',
    smooth: true,
  },
  audio: { profile: 'tram_pesa' },
  doorWarning: { beeps: 4, freq: 1480, ms: 140, times: [0, 0.26, 0.52, 0.78], closeStart: 1.05 },
  look: { blue: 0x1f86d0, yellow: 0xf3a50b, silver: 0xc6cacd, roof: 0x8d9296, seat: 0x3c4a63, pole: 0xf06a14 },
  fleets: [{ fleet: '2312' }, { fleet: '2314' }, { fleet: '2303' }, { fleet: '2307' }, { fleet: '2318' }, { fleet: '2322' }, { fleet: '2329' }],
};

// ------------------------------------------------------------------ Inekon T8M-700IT (line 7, photos 6-10)
// A T6M-700 cut at its Jacobs bogie with a low-floor centre section inserted (Railway Gazette: 360 mm entrance
// height, wheelchair ramp). 26.62 m x 2.25 m, height 3.10 m, 30 040 kg, axle formula B0' 2' 2' B0' (bg/en
// Wikipedia via search summaries): each high-floor end section on its powered outer bogie and an unpowered
// bogie at its inner end, the centre section hung between them. Bogie and door positions estimated from photos
// 6-8 (the front bogie behind door 1, the rear bogie between doors 4 and 5).
export const INEKON = {
  id: 'inekon',
  kind: 'tram',
  name: 'Inekon T8M-700IT',
  short: 'T8M-700IT',
  lines: ['7'],
  articulated: true,
  kinematics: 'suspended',
  dims: {
    length: 26.62, width: 2.25, halfW: 1.125,
    roofY: 3.12,
    floorY: 0.9, // high-floor end sections (three steps at the doors)
    lowFloorY: 0.36, // the centre section
    beltY: 1.45, windowTopY: 2.56,
    wheelR: 0.33,
  },
  sections: [
    section('front', 0, 10.25, [{ d: 5.0, kind: 'bogie', powered: true }, { d: 9.55, kind: 'bogie', powered: false }]),
    section('middle', 10.55, 16.07, [{ d: 10.4, kind: 'joint' }, { d: 16.22, kind: 'joint' }], { lowFloor: true }),
    section('rear', 16.37, 26.62, [{ d: 17.07, kind: 'bogie', powered: false }, { d: 23.27, kind: 'bogie', powered: true }]),
  ],
  bogies: { wheelbase: 1.8, wheelR: 0.33 },
  doors: [
    { id: 1, section: 'front', d0: 2.35, d1: 3.6, leaves: 2 },
    { id: 2, section: 'front', d0: 7.55, d1: 8.75, leaves: 2 },
    { id: 3, section: 'middle', d0: 12.6, d1: 13.85, leaves: 2, lowFloor: true },
    { id: 4, section: 'rear', d0: 20.4, d1: 21.65, leaves: 2 },
    { id: 5, section: 'rear', d0: 25.25, d1: 26.3, leaves: 2 },
  ],
  cab: { eye: [-0.35, 2.17, 1.05], d: 1.05, wallZ: 1.8 },
  physics: {
    massEmpty: 30040, // Wikipedia
    poweredMassShare: 0.55,
    traction: tractionCurve(54000, 4 * 55000 * 0.9), // DC motors on a Cegelec TV Europulse IGBT converter (power estimated)
    vmax: 60 / 3.6,
    notches: 5,
    brakeNotches: 4,
    serviceDecel: 1.2,
    emergencyDecel: 2.6,
    davis: [880, 28, 4.0],
    electricBrake: 'regenerative',
    smooth: true, // the converter: no contactor steps
  },
  audio: { profile: 'tram_inekon' },
  doorWarning: { beeps: 2, freq: 960, ms: 380, times: [0, 0.55], closeStart: 1.05 },
  look: { blue: 0x3a9ddb, orange: 0xf4a21c, white: 0xe9e8e2, seat: 0x55565d, pole: 0xf0761c },
  fleets: [{ fleet: '2413' }, { fleet: '2408' }, { fleet: '3406' }, { fleet: '2401' }, { fleet: '2405' }, { fleet: '2411' }, { fleet: '2416' }],
};

// ------------------------------------------------------------------ seat maps, floors, aisles
// seats: {sec, x, z, yaw, fy} in the section frames; yaw 0 faces forward (-z), PI backwards. Face-to-face bays
// are listed front seat first (it faces backwards).
const seat = (sec, x, z, yaw, fy) => ({ sec, x, z, yaw, fy, kind: 'tram', side: x < 0 ? 'left' : 'right' });
function bays(list, sec, xs, fy) {
  const out = [];
  for (const [z, back] of list) for (const x of xs) out.push(seat(sec, x, z, back ? Math.PI : 0, fy));
  return out;
}

// Schindler (photos 2, 3): 2+1 in the high-floor sections (double seats on the left, single seats on the
// right between the doors), 1+1 in the low-floor module with a wheelchair space opposite door 3. Estimated.
{
  const hi = SCHINDLER.dims.floorY, lo = SCHINDLER.dims.lowFloorY;
  const F = [[2.0, 1], [2.85, 0], [3.85, 1], [4.7, 0], [5.7, 1], [6.55, 0], [7.55, 1], [8.4, 0], [9.4, 1]];
  const FR = [[2.9, 1], [3.75, 0], [4.75, 1], [5.6, 0], [8.15, 1], [9.0, 0], [9.9, 0]];
  const MID = [[1.6, 1], [2.45, 0], [5.3, 1], [6.15, 0]];
  const R = [[0.75, 1], [1.6, 0], [2.6, 1], [3.45, 0], [4.45, 1], [5.3, 0], [6.3, 1], [7.15, 0], [8.15, 1], [9.0, 0]];
  const RR = [[0.75, 1], [1.6, 0], [4.3, 1], [5.15, 0], [6.15, 1], [7.0, 0], [8.0, 1], [8.85, 0]];
  const seats = [
    ...bays(F, 'front', [-0.75, -0.3], hi), ...bays(FR, 'front', [0.74], hi),
    ...bays(MID, 'middle', [-0.72, 0.72], lo),
    ...bays(R, 'rear', [-0.75, -0.3], hi), ...bays(RR, 'rear', [0.74], hi),
  ];
  const ML = SCHINDLER.sections[1].length;
  SCHINDLER.layout = {
    seats,
    standing: [
      { sec: 'front', x0: -0.05, x1: 0.45, z0: 1.7, z1: 10.1, fy: hi }, { sec: 'front', x0: 0.2, x1: 0.85, z0: 6.35, z1: 7.55, fy: hi },
      { sec: 'middle', x0: -0.6, x1: 0.6, z0: 1.1, z1: 6.6, fy: lo },
      { sec: 'rear', x0: -0.05, x1: 0.45, z0: 0.4, z1: 9.2, fy: hi }, { sec: 'rear', x0: 0.2, x1: 0.85, z0: 2.45, z1: 3.65, fy: hi },
    ],
    // the low-floor module: two steps up at each end to the high floor of the end sections
    aisleFloorY: (sec, z) => {
      if (sec !== 'middle') return hi;
      // the raised ends clear the wheels of the bogie under the joint (its rear axle reaches 0.6 m into the module)
      if (z < 0.8 || z > ML - 0.8) return hi;
      if (z < 1.25 || z > ML - 1.25) return (hi + lo) / 2;
      return lo;
    },
    walk: {
      front: { zMin: 1.62, zMax: SCHINDLER.sections[0].length - 0.12 },
      middle: { zMin: 0.12, zMax: ML - 0.12 },
      rear: { zMin: 0.12, zMax: SCHINDLER.sections[2].length - 0.35 },
    },
  };
}

// T6M-700 (photo 7): single plastic seats on both sides, 32 in all (bg.wikipedia).
{
  const fy = T6M.dims.floorY;
  const step = (z0, n, d = 0.78) => Array.from({ length: n }, (_, i) => [z0 + i * d, 0]);
  const seats = [
    ...bays(step(2.3, 9), 'front', [-0.72], fy), ...bays(step(3.75, 5), 'front', [0.72], fy),
    ...bays(step(0.6, 11), 'rear', [-0.72], fy), ...bays(step(3.55, 5), 'rear', [0.72], fy), ...bays(step(9.1, 2, 0.75), 'rear', [0.72], fy),
  ];
  const L = T6M.sections[0].length;
  T6M.layout = {
    seats,
    standing: [
      { sec: 'front', x0: -0.3, x1: 0.3, z0: 2.2, z1: 9.9, fy }, { sec: 'front', x0: 0.2, x1: 0.85, z0: 7.3, z1: 8.45, fy },
      { sec: 'rear', x0: -0.3, x1: 0.3, z0: 0.4, z1: 9.6, fy }, { sec: 'rear', x0: 0.2, x1: 0.85, z0: 1.8, z1: 3.0, fy },
    ],
    aisleFloorY: () => fy,
    walk: { front: { zMin: 2.0, zMax: L - 0.1 }, rear: { zMin: 0.1, zMax: T6M.sections[1].length - 0.35 } },
  };
}

// PESA Swing (photos 4, 5): 2+1 seating, the double seats on the left; seats over the bogies stand on podiums
// that cover the wheels; between the doors of the suspended sections a face-to-face bay on the left and a
// wheelchair / pram space with tip-up seats on the right. 41 seats.
{
  const fy = PESA.dims.floorY, pod = fy + 0.3;
  const L1 = PESA.sections[0].length;
  const seats = [
    // front: over the bogie (podium), behind the single door
    ...bays([[3.3, 1], [4.15, 0], [4.8, 1], [5.65, 0]], 'front', [-0.84, -0.4], pod), ...bays([[4.8, 1], [5.65, 0]], 'front', [0.84], pod),
    // second: between its doors
    ...bays([[1.95, 1], [2.8, 0]], 'second', [-0.84, -0.4], fy), ...bays([[2.1, 0], [2.95, 0]], 'second', [0.86], fy),
    // middle (bogie section): two bays on podiums
    ...bays([[0.45, 1], [1.3, 0], [1.9, 1], [2.75, 0]], 'middle', [-0.84, -0.4], pod), ...bays([[1.3, 0], [1.9, 1]], 'middle', [0.84], pod),
    // fourth
    ...bays([[1.95, 1], [2.8, 0]], 'fourth', [-0.84, -0.4], fy), ...bays([[2.7, 1]], 'fourth', [0.86], fy),
    // rear: mirror of the front up to the single door and the rear cab
    ...bays([[1.3, 1], [2.15, 0], [2.8, 1], [3.65, 0]], 'rear', [-0.84, -0.4], pod), ...bays([[1.3, 1], [2.15, 0]], 'rear', [0.84], pod),
  ];
  PESA.layout = {
    seats,
    // podium zones over the wheels (the model builds them; seats on them have fy = pod)
    podiums: [
      { sec: 'front', z0: 2.95, z1: 6.85 }, { sec: 'middle', z0: 0.1, z1: 3.12 }, { sec: 'rear', z0: 0.1, z1: 4.0 },
    ],
    standing: [
      { sec: 'front', x0: -0.15, x1: 0.35, z0: 2.0, z1: 6.8, fy }, { sec: 'second', x0: -0.15, x1: 0.85, z0: 0.15, z1: 5.45, fy },
      { sec: 'middle', x0: -0.15, x1: 0.35, z0: 0.15, z1: 3.05, fy }, { sec: 'fourth', x0: -0.15, x1: 0.85, z0: 0.15, z1: 5.45, fy },
      { sec: 'rear', x0: -0.15, x1: 0.35, z0: 0.15, z1: 4.9, fy },
    ],
    aisleFloorY: () => fy,
    walk: {
      front: { zMin: 2.0, zMax: L1 - 0.1 }, second: { zMin: 0.1, zMax: 5.5 }, middle: { zMin: 0.1, zMax: 3.12 },
      fourth: { zMin: 0.1, zMax: 5.5 }, rear: { zMin: 0.1, zMax: L1 - 2.0 },
    },
  };
}

// T8M-700IT (photos 9, 10): single seats with grey patterned moquette and black backs along both sides of the
// high-floor sections, raised on plinths along the windows; the low centre section with the door, a wheelchair
// space and tip-up seats, four steps up to the high floor at each end.
{
  const hi = INEKON.dims.floorY, lo = INEKON.dims.lowFloorY;
  const ML = INEKON.sections[1].length;
  const step = (z0, n, d = 0.8) => Array.from({ length: n }, (_, i) => [z0 + i * d, 0]);
  const seats = [
    ...bays(step(2.1, 10), 'front', [-0.72], hi), ...bays(step(3.85, 5), 'front', [0.72], hi), ...bays(step(9.05, 1), 'front', [0.72], hi),
    ...bays([[1.55, 1], [3.95, 0]], 'middle', [-0.72], lo), ...bays([[4.0, 0]], 'middle', [0.72], lo),
    ...bays(step(0.75, 11), 'rear', [-0.72], hi), ...bays(step(0.75, 4), 'rear', [0.72], hi), ...bays(step(5.6, 4), 'rear', [0.72], hi),
  ];
  INEKON.layout = {
    seats,
    standing: [
      { sec: 'front', x0: -0.3, x1: 0.3, z0: 2.1, z1: 9.9, fy: hi }, { sec: 'front', x0: 0.2, x1: 0.85, z0: 7.6, z1: 8.7, fy: hi },
      { sec: 'middle', x0: -0.5, x1: 0.7, z0: 1.3, z1: 4.2, fy: lo },
      { sec: 'rear', x0: -0.3, x1: 0.3, z0: 0.3, z1: 9.9, fy: hi }, { sec: 'rear', x0: 0.2, x1: 0.85, z0: 4.1, z1: 5.2, fy: hi },
    ],
    // the centre section: level with the high floor at the joints, four steps down to the low floor
    aisleFloorY: (sec, z) => {
      if (sec !== 'middle') return hi;
      const e = Math.min(z, ML - z);
      if (e < 0.3) return hi;
      if (e >= 1.2) return lo;
      const k = Math.min(3, Math.floor((e - 0.3) / 0.3) + 1);
      return hi - ((hi - lo) * k) / 4;
    },
    walk: {
      front: { zMin: 1.95, zMax: INEKON.sections[0].length - 0.1 },
      middle: { zMin: 0.1, zMax: ML - 0.1 },
      rear: { zMin: 0.1, zMax: INEKON.sections[2].length - 0.35 },
    },
  };
}

/**
 * Fields the bus-era code reads: doors in their section frames (z0, z1), and dims that make frames(spec)
 * describe the tram (front end at z = 0 of the front section, the last section's end at its length).
 */
for (const spec of [SCHINDLER, T6M, PESA, INEKON]) {
  const first = spec.sections[0], last = spec.sections[spec.sections.length - 1];
  for (const d of spec.doors) {
    const sec = spec.sections.find((q) => q.id === d.section);
    d.z0 = d.d0 - sec.d0;
    d.z1 = d.d1 - sec.d0;
  }
  Object.assign(spec.dims, {
    frontOverhang: 0, wb1: 0, hitchBehindAxle2: first.length + 0.2, bellowsGap: 0.2, wb2: first.length + 0.4,
    rearOverhang: last.length, maxSteer: 0.01, steeringRatio: 1, maxArticulation: 0.6,
  });
  spec.physics.wheelR = spec.bogies.wheelR;
}
SCHINDLER.create = (o) => new SchindlerModel(SCHINDLER, o);
T6M.create = (o) => new T6MModel(T6M, o);
PESA.create = (o) => new PesaModel(PESA, o);
INEKON.create = (o) => new InekonModel(INEKON, o);

export const TRAMS = { schindler: SCHINDLER, t6m: T6M, pesa: PESA, inekon: INEKON };
export { g };
