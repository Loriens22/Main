// Seat map, wheel-arch podiums, standing areas and walkable aisle of the Yutong ZK6126HGA as run in Sofia.
// Pure data (no three.js): the spec embeds it (spec.layout) and the model draws its seats FROM it.
// Frame: rigid bus, section 'front', origin = rear axle, x right, z backwards (front = -z).
// Evidence: data/research/ref_photos/v2/ref15_yutong.jpg (interior: double seats both sides, podiums with
// yellow edges), ref13 (door positions). Rows are inferred from the doors and the wheel housings.

export const FY = 0.34; // passenger floor (low floor, 340 mm entrance height per BMC)
export const PODIUM_Y = FY + 0.26; // wheel-arch podium top
export const AISLE_X = 0.295; // aisle edge of the seat blocks (|x|)
export const WALL_X = 1.17; // inner face of the side walls (|x|), 2.50 m body
export const SEAT_XW = 0.955; // window seat centre |x|
export const SEAT_XA = 0.515; // aisle seat centre |x|
export const REAR_PLATFORM = FY + 0.34; // raised floor under the rear bench
export const HOUSING_HALF = 0.64; // half length of a wheel housing around its axle
export const HOUSING_X = 0.73; // inner face of the wheel housing (|x|)

/** Wheel-arch podiums (wall to aisle edge): side (-1 left / +1 right), z range, axle z. */
export function podiums(d) {
  const a1 = -d.wb1, a2 = 0;
  return [
    { side: -1, z0: a1 - 0.735, z1: a1 + 0.805, axle: a1 },
    { side: 1, z0: a1 - 0.735, z1: a1 + 0.805, axle: a1 },
    { side: -1, z0: a2 - 0.735, z1: a2 + 0.805, axle: a2 },
    { side: 1, z0: a2 - 0.735, z1: a2 + 0.805, axle: a2 },
  ];
}

/** Cab bulkhead (partition behind the driver), z. */
export const cabPartitionZ = (d) => -(d.frontOverhang + d.wb1) + 1.95;
/** Engine bulkhead / rear wall of the saloon, z (behind it: engine bay on the left, bench platform on the right). */
export const rearWallZ = (d) => d.rearOverhang - 0.18;

export function buildLayout(spec) {
  const d = spec.dims;
  const a1 = -d.wb1;
  const pod = PODIUM_Y;
  const seats = [];
  const seat = (x, z, fy, extra = {}) => seats.push({ sec: 'front', x, z, yaw: 0, fy, ins: false, kind: 'fixed', side: Math.sign(x) || 1, ...extra });
  // window seats over a wheel housing sit 4.5 cm above the aisle step
  const lift = (x, fy) => (fy > FY + 0.05 && Math.abs(x) > 0.7 ? fy + 0.045 : fy);
  const pair = (side, z, fy = FY, extra = {}) => {
    seat(side * SEAT_XW, z, lift(side * SEAT_XW, fy), extra);
    seat(side * SEAT_XA, z, fy, extra);
  };
  // ---- left (driver side), all facing forward; the wheelchair / pram bay is opposite door 2
  pair(-1, a1 - 0.35, pod); // behind the cab partition, over the front wheel housing
  pair(-1, a1 + 0.45, pod);
  pair(-1, a1 + 1.25, FY);
  pair(-1, a1 + 2.05, FY, { hoop: true }); // last row before the bay: C-hoop guard
  seat(-SEAT_XW, -2.55, FY, { kind: 'fold', ins: true }); // fold-up seat in the bay (against the left wall)
  pair(-1, -1.25, FY);
  pair(-1, -0.4, pod); // over the rear wheel housing
  pair(-1, 0.4, pod);
  pair(-1, 1.2, FY);
  // ---- right (door side): single window seats behind door 1 over the arch, pairs up to door 2, then to door 3
  seat(SEAT_XW, a1 - 0.35, lift(SEAT_XW, pod), { sticker: true });
  seat(SEAT_XW, a1 + 0.45, lift(SEAT_XW, pod));
  pair(1, a1 + 1.25, FY);
  pair(1, a1 + 2.05, FY);
  pair(1, -1.25, FY, { screen: true }); // first row behind door 2: glass screen on the door side
  pair(1, -0.4, pod);
  pair(1, 0.4, pod);
  // ---- rear bench over the raised platform, right of the engine tower
  const zb = rearWallZ(d) - 0.36;
  for (const x of [0.05, 0.49, 0.93]) seat(x, zb, REAR_PLATFORM, { kind: 'bench', side: 1 });
  seats.find((q) => q.side === 1 && Math.abs(q.z - (a1 + 1.25)) < 1e-6 && q.x > 0.9).sticker = true; // priority seat

  const standing = [
    { sec: 'front', x0: -0.26, x1: 0.26, z0: a1 - 0.2, z1: 1.9 },
    { sec: 'front', x0: 0.15, x1: 1.0, z0: -8.05, z1: -7.1 }, // door 1 landing
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -2.95, z1: -1.9 }, // door 2 landing
    { sec: 'front', x0: -1.1, x1: -0.35, z0: -3.4, z1: -2.0 }, // wheelchair / pram bay
    { sec: 'front', x0: 0.3, x1: 1.0, z0: 1.1, z1: 2.25 }, // door 3 landing
  ];
  const F = -(d.frontOverhang + d.wb1);
  return {
    seats,
    standing,
    podiums: podiums(d),
    aisleFloorY: () => FY,
    walk: {
      front: { zMin: F + 0.75, zMax: zb - 0.45, cabZ: cabPartitionZ(d) + 0.1, cabX: 0.2 },
      rear: { zMin: 0, zMax: 0 },
    },
    fabric: false,
  };
}
