// The trams of line 12: dimensions, sections and their supports on the track, doors, seats, traction and
// braking, sounds. Sources and estimates: data/research/line12/README.md.
//
// Geometry is given as distances d from the front end of the tram along the track. Every section has two
// supports that lie on the track centre line (a bogie pivot or an articulation joint); the kinematics places
// the section on the chord between them. Section frames (models, doors, seats): origin on the track centre at
// the section's front end, x right, y up from the rail head, z backwards (z = d - d0 of the section).

const g = 9.81;

function section(id, d0, d1, supports, extra = {}) {
  return { id, d0, d1, length: d1 - d0, supports, ...extra };
}

/** Traction force (N) at speed v (m/s) for full power: constant force up to the base speed, then constant power. */
function tractionCurve(F0, P) {
  return (v) => Math.min(F0, P / Math.max(0.5, v));
}

// ------------------------------------------------------------------ Schindler/Siemens Be 4/6 S (photos 1-6)
// Front section with the cab on two powered bogies (centres 3.8 m and 10.2 m behind the front, 6.4 m apart as on
// the original Basel car), the 7.75 m low-floor module carried between the sections, the short rear section on a
// trailing bogie. Total 28.2 m, width 2.20 m.
const SCH_J1 = 13.5, SCH_J2 = 21.65;
export const SCHINDLER = {
  id: 'schindler',
  kind: 'tram',
  name: 'Schindler/Siemens Be 4/6 S',
  short: 'Be 4/6 S',
  lines: ['12'],
  articulated: true,
  dims: {
    length: 28.2, width: 2.2, halfW: 1.1,
    roofY: 3.32, // body roof above the rail head
    floorY: 0.86, // high-floor sections (two steps at the doors)
    lowFloorY: 0.36, // the low-floor module
    beltY: 1.48, windowTopY: 2.52,
    wheelR: 0.33,
    // camera / legacy fields read by bus-era code
    frontOverhang: 3.8, wb1: 0, rearOverhang: 3.2, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
  },
  sections: [
    section('front', 0, 13.3, [{ d: 3.8, kind: 'bogie', powered: true }, { d: 10.2, kind: 'bogie', powered: true }]),
    section('middle', 13.7, 21.45, [{ d: SCH_J1, kind: 'joint' }, { d: SCH_J2, kind: 'joint' }], { lowFloor: true }),
    section('rear', 21.85, 28.2, [{ d: SCH_J2, kind: 'joint' }, { d: 25.0, kind: 'bogie', powered: false }]),
  ],
  // joint J2 is solved from the front section's rear joint and the rear bogie (the module is carried, not supported)
  carried: { section: 'middle', joints: [SCH_J1, SCH_J2] },
  bogies: { wheelbase: 1.75, wheelR: 0.33 },
  // right side, d along the tram (leading edge d0, trailing d1)
  doors: [
    { id: 1, section: 'front', d0: 2.15, d1: 2.95, leaves: 1 },
    { id: 2, section: 'front', d0: 7.7, d1: 9.0, leaves: 2 },
    { id: 3, section: 'middle', d0: 16.95, d1: 18.25, leaves: 2, lowFloor: true },
    { id: 4, section: 'rear', d0: 23.05, d1: 24.35, leaves: 2 },
  ],
  cab: { eye: [-0.42, 2.12, 1.25], d: 1.25 }, // driver's eye in the front section frame
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
    frontOverhang: 3.0, wb1: 0, rearOverhang: 3.0, wb2: 0, hitchBehindAxle2: 0, bellowsGap: 0,
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
  cab: { eye: [-0.38, 2.15, 1.2], d: 1.2 },
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

export const TRAMS = { schindler: SCHINDLER, t6m: T6M };
export { g };
