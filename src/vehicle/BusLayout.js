// Passenger seat map and standing areas of the MAN Lion's City G CNG (section frames,
// see BusSpec.js). Kept separate so the interior can be reworked independently.
import { BUS } from './BusSpec.js';

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
