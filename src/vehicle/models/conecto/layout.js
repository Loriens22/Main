// Seat map, wheel-arch podiums, engine platform and standing areas of the Mercedes-Benz Conecto G
// (section frames: front origin = middle axle, rear origin = rear axle, z backwards).
// Evidence: ref04 (operational interior: paired individual shell seats on both sides of a narrow
// aisle, red poles, a partition panel with a red rail behind the front door, seats facing the
// panel) and ref05 (stripped interior: cab partition, double glazed doors, wheel housings
// capped by flat grey-green panels, back-to-back seat rows). Row positions are fitted to the
// doors / axles measured in the exterior photos; the rear section is inferred from the exterior
// (window band rises over the engine at the tail, so the last rows sit on a raised platform).
import { frames } from '../../frames.js';

export const AISLE_X = 0.29; // |x| of the aisle edge of the aisle seats
export const WALL_X = 1.185; // inner face of the side walls
export const SEAT_XW = 0.97; // window seat centre |x|
export const SEAT_XA = 0.505; // aisle seat centre |x|
export const POD_H = 0.24; // wheel-arch podium height above the floor
export const PLAT_H = 0.5; // raised engine platform at the tail of the rear section
export const PLAT_Z0 = 1.2; // rear frame z where the platform stairs begin

export function buildLayout(spec) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const POD = FY + POD_H, PLAT = FY + PLAT_H;
  const seats = [];
  const lift = (fy) => (fy > FY + 0.05 && fy < FY + 0.3 ? fy + 0.04 : fy); // window seats rest on the closed wheel housing
  const pair = (sec, side, z, yaw = 0, fy = FY, extra = {}) => {
    const w = side < 0 ? -SEAT_XW : SEAT_XW, a = side < 0 ? -SEAT_XA : SEAT_XA;
    seats.push({ sec, x: w, z, yaw, fy: lift(fy), kind: 'fixed', side, ...extra }, { sec, x: a, z, yaw, fy, kind: 'fixed', side, ...extra });
  };
  // ---- front section, left (driver side)
  pair('front', -1, -6.0, 0, POD);
  pair('front', -1, -5.2, 0, POD);
  pair('front', -1, -4.2, 0, FY);
  pair('front', -1, -3.4, 0, FY);
  seats.push({ sec: 'front', x: -SEAT_XW, z: -2.45, yaw: 0, fy: FY, kind: 'fold', side: -1 }); // fold-up seat in the wheelchair / pram bay
  pair('front', -1, -1.3, 0, FY);
  pair('front', -1, -0.5, 0, POD);
  pair('front', -1, 0.3, 0, POD);
  // ---- front section, right (door side)
  pair('front', 1, -5.85, 0, POD, { sticker: true }); // behind the partition panel of door 1
  pair('front', 1, -5.05, 0, POD);
  pair('front', 1, -4.25, 0, FY);
  pair('front', 1, -3.55, 0, FY);
  pair('front', 1, -1.3, 0, FY);
  pair('front', 1, -0.5, 0, POD);
  pair('front', 1, 0.3, 0, POD);
  // ---- rear section (inferred), left
  pair('rear', -1, -3.0, Math.PI, FY); // rear-facing pair against the bellows end wall
  pair('rear', -1, -2.2, 0, FY);
  pair('rear', -1, -1.4, 0, FY);
  pair('rear', -1, -0.45, 0, POD);
  pair('rear', -1, 0.35, 0, POD);
  pair('rear', -1, 1.95, 0, PLAT);
  pair('rear', -1, 2.6, 0, PLAT);
  // right (door 3 between z -3.1 and -1.8)
  pair('rear', 1, -1.2, 0, FY);
  pair('rear', 1, -0.45, 0, POD);
  pair('rear', 1, 0.35, 0, POD);
  pair('rear', 1, 1.95, 0, PLAT);
  pair('rear', 1, 2.6, 0, PLAT);
  // bench across the engine bay
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) seats.push({ sec: 'rear', x, z: F.rearZ - 0.46, yaw: 0, fy: PLAT, kind: 'bench', side: Math.sign(x) || 1 });
  const standing = [
    { sec: 'front', x0: -0.26, x1: 0.26, z0: -6.3, z1: 0.95 },
    { sec: 'front', x0: 0.05, x1: 1.0, z0: -7.7, z1: -6.6 }, // door 1 landing
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -3.2, z1: -1.9 }, // door 2 landing
    { sec: 'front', x0: -1.1, x1: -0.35, z0: -3.0, z1: -1.9 }, // wheelchair / pram bay
    { sec: 'rear', x0: -0.26, x1: 0.26, z0: -3.1, z1: 1.2 },
    { sec: 'rear', x0: 0.3, x1: 1.0, z0: -3.1, z1: -1.8 }, // door 3 landing
    { sec: 'rear', x0: -0.26, x1: 0.26, z0: 1.3, z1: F.rearZ - 0.9 },
  ];
  const aisleFloorY = (sec, z) => {
    if (sec === 'rear') {
      if (z > PLAT_Z0 + 0.4) return PLAT;
      if (z > PLAT_Z0 + 0.2) return FY + (PLAT_H * 2) / 3;
      if (z > PLAT_Z0) return FY + PLAT_H / 3;
    }
    return FY;
  };
  const podiums = [
    { sec: 'front', side: -1, z0: -6.45, z1: -4.9, axle: -d.wb1 },
    { sec: 'front', side: 1, z0: -6.3, z1: -4.8, axle: -d.wb1 },
    { sec: 'front', side: -1, z0: -0.82, z1: 0.9, axle: 0 },
    { sec: 'front', side: 1, z0: -0.82, z1: 0.9, axle: 0 },
    { sec: 'rear', side: -1, z0: -0.82, z1: 0.82, axle: 0 },
    { sec: 'rear', side: 1, z0: -0.82, z1: 0.82, axle: 0 },
  ];
  return {
    seats,
    standing,
    aisleFloorY,
    fabric: true,
    podiums,
    podiumY: POD,
    platformY: PLAT,
    walk: {
      front: { zMin: F.frontZ + 0.75, zMax: F.frontEnd + 0.4, cabZ: -6.5, cabX: -0.2 },
      rear: { zMin: F.rearStart - 0.3, zMax: F.rearZ - 0.9 },
    },
  };
}
