// The trams of line 12: dimensions, sections and their supports on the track, doors, seats, traction and
// braking, sounds. Sources and estimates: data/research/line12/README.md.
//
// Geometry is given as distances d from the front end of the tram along the track. Every section has two
// supports that lie on the track centre line (a bogie pivot or an articulation joint); the kinematics places
// the section on the chord between them. Section frames (models, doors, seats): origin on the track centre at
// the section's front end, x right, y up from the rail head, z backwards (z = d - d0 of the section).

import { SchindlerModel } from './SchindlerModel.js';
import { T6MModel } from './T6MModel.js';

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
  const MID = [[1.25, 1], [2.1, 0], [5.6, 1], [6.45, 0]];
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
      if (z < 0.45 || z > ML - 0.45) return hi;
      if (z < 0.9 || z > ML - 0.9) return (hi + lo) / 2;
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

/**
 * Fields the bus-era code reads: doors in their section frames (z0, z1), and dims that make frames(spec)
 * describe the tram (front end at z = 0 of the front section, the last section's end at its length).
 */
for (const spec of [SCHINDLER, T6M]) {
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

export const TRAMS = { schindler: SCHINDLER, t6m: T6M };
export { g };
