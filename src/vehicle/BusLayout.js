// Passenger seat map, wheel-arch podiums and standing areas of the MAN Lion's City G CNG
// (section frames, see BusSpec.js). Kept separate so the interior can be reworked
// independently. Evidence and confidences: data/research/bus/interior/interior_spec.md.
import { BUS, AXLE1_Z } from './BusSpec.js';

const FY = BUS.floorY;

/** Top of the wheel-arch podiums (0.26 above the floor, photo 4). */
export const PODIUM_Y = FY + 0.26;
/** Aisle edge of the seat blocks: |x| of the inner side of the aisle seat. */
export const AISLE_X = 0.295;
/** Inner surface of the side walls: |x|. */
export const WALL_X = 1.19;
/** Window seat / aisle seat centres. */
export const SEAT_XW = 0.975;
export const SEAT_XA = 0.515;
/** Driver's platform (cab) height, absolute. */
export const CAB_Y = FY + 0.33;

/**
 * Wheel-arch podiums: section, side (-1 left / +1 right), z range (section frame), axle z.
 * The podium reaches from the wall to the aisle edge; the wheel housing sits on top of it.
 */
export const PODIUMS = [
  { sec: 'front', side: -1, z0: -5.84, z1: -4.30, axle: AXLE1_Z },
  { sec: 'front', side: 1, z0: -5.78, z1: -4.30, axle: AXLE1_Z },
  { sec: 'front', side: -1, z0: -0.85, z1: 1.30, axle: 0 },
  { sec: 'front', side: 1, z0: -0.85, z1: 1.30, axle: 0 },
  { sec: 'rear', side: -1, z0: -1.0, z1: 0.95, axle: 0 },
  { sec: 'rear', side: 1, z0: -0.68, z1: 0.68, axle: 0 },
];

/** z of the rear engine bulkhead in the rear section (engine bay behind it). */
export const REAR_BULKHEAD_Z = 2.2;

/**
 * Seat layout: section, x (centre of the pan), z (centre of the pan), yaw (0 = facing forward), fy (absolute
 * height of the floor/podium under the seat; rider height is derived from it), ins (moquette, fold seat only),
 * plus kind ('fixed' | 'fold'), sticker (priority-seat sticker on the backrest) and side.
 */
export const SEATS = (() => {
  const s = [];
  const pod = FY + 0.26;
  // window-side seats over a wheel arch rest on the closed wheel housing, 4.5 cm above the aisle step
  const HOUSING_LIFT = 0.045;
  const lift = (fy) => (fy > FY + 0.05 ? fy + HOUSING_LIFT : fy);
  const pair = (sec, side, z, yaw = 0, fy = FY, extra = {}) => {
    const w = side < 0 ? -0.975 : 0.975, a = side < 0 ? -0.515 : 0.515;
    s.push({ sec, x: w, z, yaw, fy: lift(fy), ins: false, kind: 'fixed', side, ...extra }, { sec, x: a, z, yaw, fy, ins: false, kind: 'fixed', side, ...extra });
  };
  const single = (sec, x, z, yaw = 0, fy = FY, extra = {}) => s.push({ sec, x, z, yaw, fy: Math.abs(x) > 0.7 ? lift(fy) : fy, ins: false, kind: 'fixed', side: Math.sign(x) || 1, ...extra });
  // ---- front section, left (driver side), all facing forward
  pair('front', -1, -5.45, 0, pod); // behind the cab partition, on the axle-1 podium
  pair('front', -1, -4.65, 0, pod);
  pair('front', -1, -3.75, 0, FY, { hoop: true }); // floor level, C-hoop guard on the aisle edge
  s.push({ sec: 'front', x: -0.98, z: -1.55, yaw: 0, fy: FY, ins: true, kind: 'fold', side: -1 }); // fold-up seat in the wheelchair/pram bay
  pair('front', -1, 0.0, 0, pod); // axle-2 podium
  pair('front', -1, 0.82, 0, pod);
  // ---- front section, right (door side)
  single('front', 0.975, -5.45, 0, pod, { sticker: true }); // behind door 1
  single('front', 0.975, -4.65, 0, pod);
  pair('front', 1, -3.7, 0, FY);
  pair('front', 1, -2.9, 0, FY);
  pair('front', 1, 0.0, 0, pod);
  pair('front', 1, 0.82, 0, pod);
  // ---- rear section (no interior photo: typology), left
  pair('rear', -1, -4.2, Math.PI, FY); // rear-facing pair behind the bellows
  pair('rear', -1, -3.45, 0, FY);
  pair('rear', -1, -2.7, 0, FY);
  pair('rear', -1, -1.95, 0, FY);
  pair('rear', -1, -0.45, 0, pod); // axle-3 podium
  pair('rear', -1, 0.4, 0, pod);
  pair('rear', -1, 1.2, 0, FY);
  // right: between the bellows and door 3, then the axle-3 podium between doors 3 and 4
  pair('rear', 1, -4.2, Math.PI, FY);
  pair('rear', 1, -3.45, 0, FY);
  pair('rear', 1, -2.7, 0, FY);
  pair('rear', 1, 0.0, 0, pod);
  // bench against the engine bulkhead, clear of the door-4 landing
  for (const x of [-0.3, 0.14, 0.58]) single('rear', x, REAR_BULKHEAD_Z - 0.35, 0, FY, { bench: true });
  s.find((q) => q.sec === 'front' && q.x === 0.975 && q.z === -3.7).sticker = true; // priority seat, window side of the first door-side pair
  return s;
})();

/** Aisle floor height at section z: low floor everywhere (door 4 is a low-floor door behind the rear axle). */
export function aisleFloorY() {
  return FY;
}

/** Standing areas (for NPCs / player) per section, x range & z range in section frame (all low floor). */
export const STANDING = [
  { sec: 'front', x0: -0.26, x1: 0.26, z0: -5.7, z1: 0.9 },
  { sec: 'front', x0: 0.15, x1: 1.0, z0: -7.05, z1: -6.05 }, // door 1 landing
  { sec: 'front', x0: 0.3, x1: 1.0, z0: -2.1, z1: -1.05 }, // door 2 landing
  { sec: 'front', x0: -1.1, x1: -0.35, z0: -2.95, z1: -1.7 }, // wheelchair / pram bay
  { sec: 'rear', x0: -0.26, x1: 0.26, z0: -4.4, z1: 1.5 },
  { sec: 'rear', x0: 0.3, x1: 1.0, z0: -1.95, z1: -0.9 }, // door 3 landing
  { sec: 'rear', x0: 0.3, x1: 1.0, z0: 0.9, z1: 1.95 }, // door 4 landing
];
