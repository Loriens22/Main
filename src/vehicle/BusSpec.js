// Dimensions of the MAN Lion's City G (A23, NG313 CNG), Sofia fleet 2018/19.
// Sources / confidence are documented in data/research/bus_reference.json.
// Local frames: x = right, y = up, z = backwards (forward is -z).
//   front section origin = middle axle (axle 2) centre on the ground
//   rear section origin  = rear axle (axle 3) centre on the ground
export const BUS = {
  length: 17.98,
  width: 2.55,
  halfW: 1.275,
  roofY: 2.96, // top of the body shell (without roof equipment)
  podY: 3.34, // top of the CNG cylinder housings
  skirtY: 0.27, // lower edge of the side skirts
  floorY: 0.36, // passenger floor at the doors (low floor)
  beltY: 1.02, // window sill line
  windowTopY: 2.55,
  wheelR: 0.478, // 275/70 R22.5
  tyreW: 0.276,
  track: 2.1, // centre-to-centre of the front tyres
  frontOverhang: 2.7,
  wb1: 5.105, // axle 1 -> axle 2
  wb2: 6.77, // axle 2 -> axle 3
  rearOverhang: 3.405,
  hitchBehindAxle2: 1.7,
  bellowsGap: 0.4, // half length of the bellows (each side of the hitch)
  maxSteer: 0.68, // rad, front wheel lock (turning circle ~22 m)
  maxArticulation: 0.92, // rad (~53°)
  steeringRatio: 21,
  doors: [
    // section, z of leading edge, z of trailing edge (section frame), side +1 = right
    { id: 1, section: 'front', z0: -7.6, z1: -6.4 },
    { id: 2, section: 'front', z0: -2.27, z1: -1.07 },
    { id: 3, section: 'rear', z0: -4.29, z1: -3.09 },
    { id: 4, section: 'rear', z0: -1.97, z1: -0.77 },
  ],
};

export const FRONT_Z = -(BUS.frontOverhang + BUS.wb1); // front bumper, front frame (-7.805)
export const AXLE1_Z = -BUS.wb1;
export const HITCH_FRONT_Z = BUS.hitchBehindAxle2; // hitch in front frame (+1.70)
export const HITCH_REAR_Z = -(BUS.wb2 - BUS.hitchBehindAxle2); // hitch in rear frame (-5.07)
export const FRONT_BODY_END_Z = HITCH_FRONT_Z - BUS.bellowsGap; // 1.30
export const REAR_BODY_START_Z = HITCH_REAR_Z + BUS.bellowsGap; // -4.67
export const REAR_Z = BUS.rearOverhang; // rear bumper, rear frame (3.405)

/** Seat layout: section, x (centre), z (centre), yaw (0 = facing forward), floor height, insert (moquette). */
export const SEATS = (() => {
  const s = [];
  const L = -1.275 + 0.3, L2 = L + 0.47, R = 1.275 - 0.3, R2 = R - 0.47;
  const pair = (sec, side, z, yaw = 0, fy = BUS.floorY, ins = false) => {
    const a = side < 0 ? L : R, b = side < 0 ? L2 : R2;
    s.push({ sec, x: a, z, yaw, fy, ins }, { sec, x: b, z, yaw, fy, ins });
  };
  const single = (sec, x, z, yaw = 0, fy = BUS.floorY, ins = false) => s.push({ sec, x, z, yaw, fy, ins });
  // front section — left (driver side) behind the driver's cab
  pair('front', -1, -5.55, Math.PI, 0.66); // over front wheel arch, facing back
  pair('front', -1, -4.75, 0, 0.66);
  pair('front', -1, -3.75, 0);
  // multi-purpose area opposite door 2 (wheelchair / pram) — folding seat
  single('front', -0.98, -1.55, Math.PI / 2, BUS.floorY, true);
  pair('front', -1, 0.0, 0, 0.62); // over middle axle
  pair('front', -1, 0.82, 0, 0.62);
  // front section — right side
  single('front', 0.98, -5.45, Math.PI, 0.66);
  single('front', 0.98, -4.65, 0, 0.66);
  pair('front', 1, -3.7, 0);
  pair('front', 1, -2.9, 0);
  single('front', 0.98, -0.05, 0, 0.62);
  single('front', 0.98, 0.78, 0, 0.62);
  // rear section — left
  pair('rear', -1, -4.0, Math.PI);
  pair('rear', -1, -3.2, 0);
  pair('rear', -1, -2.4, 0);
  pair('rear', -1, -1.6, 0, 0.62);
  pair('rear', -1, -0.4, 0, 0.82);
  pair('rear', -1, 0.45, 0, 0.82);
  pair('rear', -1, 1.3, 0, 0.82);
  // rear section — right (between and behind doors 3/4)
  single('rear', 0.98, -2.55, 0);
  pair('rear', 1, -0.4, 0, 0.82);
  pair('rear', 1, 0.45, 0, 0.82);
  pair('rear', 1, 1.3, 0, 0.82);
  // rear bench (5 seats)
  for (let i = 0; i < 5; i++) single('rear', -0.96 + i * 0.48, 2.45, 0, 0.82, i === 2);
  return s;
})();

/** Standing areas (for NPCs / player) per section, x range & z range in section frame. */
export const STANDING = [
  { sec: 'front', x0: -0.45, x1: 0.45, z0: -5.8, z1: 0.9 },
  { sec: 'front', x0: -1.0, x1: 1.0, z0: -2.3, z1: -1.0 },
  { sec: 'rear', x0: -0.4, x1: 0.4, z0: -4.6, z1: -0.8 },
  { sec: 'rear', x0: 0.4, x1: 1.0, z0: -4.3, z1: -3.1 },
];
