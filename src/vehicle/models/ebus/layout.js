// Seat maps, podiums and walkable areas of the two battery buses of line 84 (rigid: one section, origin = rear
// axle, z backwards, front = -z). Read from the interior photographs supplied with the directive:
//   SOR EBN 11 (images 5-6): low-entry. Blue padded seats in pairs, podium seats over the front wheel housings,
//     the wheelchair bay opposite door 2, then from behind door 3 the raised rear section over the rear axle and the
//     motor: two steps up with yellow edges, seats in pairs on the platform and a bench across the back.
//   Yutong E12 (image 10): low floor to door 3; grey shells in pairs, podiums over both axles, the wheelchair bay
//     opposite door 2, raised seats behind door 3 and a bench across the back.
// Seat positions are fitted to the doors and axles of the exterior photographs; they are estimates.
import { frames } from '../../frames.js';

const POD_H = 0.26; // wheel-arch podium
const XW = 0.97, XA = 0.52; // seat centres |x|: window, aisle

function builder(sec = 'front') {
  const seats = [];
  const pair = (side, z, fy, yaw = 0, extra = {}) => {
    seats.push({ sec, x: side * XW, z, yaw, fy, kind: 'fixed', side, ...extra }, { sec, x: side * XA, z, yaw, fy, kind: 'fixed', side, aisle: true, ...extra });
  };
  const single = (side, z, fy, yaw = 0, extra = {}) => seats.push({ sec, x: side * XW, z, yaw, fy, kind: 'fixed', side, ...extra });
  return { seats, pair, single };
}

/** SOR EBN 11: 11.1 m, doors in the front overhang, behind the front axle and 2 m ahead of the rear axle. */
export function sorLayout(spec) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const POD = FY + POD_H;
  const PLAT = FY + 0.4, PLAT_Z = -1.2; // raised rear section from 0.3 m behind door 3
  const { seats, pair, single } = builder();
  const a1 = -d.wb1;
  // ---- left (driver side)
  pair(-1, a1 - 0.25, POD); // over the front wheel housing, behind the cab
  seats.push({ sec: 'front', x: -XW, z: -4.7, yaw: 0, fy: FY, kind: 'fold', side: -1 }); // wheelchair bay opposite door 2
  pair(-1, -3.75, FY);
  pair(-1, -2.95, FY);
  pair(-1, -2.15, FY);
  pair(-1, -0.75, PLAT);
  pair(-1, 0.05, PLAT);
  pair(-1, 0.85, PLAT);
  // ---- right (door side): over the front wheel housing between doors 1 and 2, between doors 2 and 3, on the platform
  single(1, a1 - 0.62, POD, Math.PI); // facing back, behind door 1 (image 5)
  single(1, a1 + 0.18, POD);
  pair(1, -3.95, FY);
  pair(1, -3.15, FY);
  pair(1, -0.55, PLAT);
  pair(1, 0.25, PLAT);
  // bench across the back of the platform
  const zb = F.rearZ - 0.62;
  for (const x of [-0.97, -0.5, 0, 0.5, 0.97]) seats.push({ sec: 'front', x, z: zb, yaw: 0, fy: PLAT, kind: 'bench', side: Math.sign(x) || 1 });
  const standing = [
    { sec: 'front', x0: -0.26, x1: 0.26, z0: a1 - 0.6, z1: -1.5 },
    { sec: 'front', x0: 0.1, x1: 1.0, z0: -8.55, z1: -7.7 }, // door 1 landing
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -5.5, z1: -4.5 }, // door 2 landing
    { sec: 'front', x0: -1.1, x1: -0.35, z0: -5.4, z1: -4.2 }, // wheelchair / pram bay
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -2.62, z1: -1.64 }, // door 3 landing
  ];
  const aisleFloorY = (sec, z) => (z > PLAT_Z + 0.32 ? PLAT : z > PLAT_Z ? FY + 0.2 : FY);
  const podiums = [
    { sec: 'front', side: -1, z0: a1 - 0.7, z1: a1 + 0.62, axle: a1 },
    { sec: 'front', side: 1, z0: a1 - 1.0, z1: a1 + 0.62, axle: a1 },
  ];
  return {
    seats, standing, aisleFloorY, fabric: true, podiums, podiumY: POD, platformY: PLAT, platformZ: PLAT_Z,
    walk: { front: { zMin: F.frontZ + 0.8, zMax: zb - 0.5, cabZ: F.frontZ + 1.85, cabX: -0.2 }, rear: { zMin: 0, zMax: 0 } },
  };
}

/** Yutong E12: 12.17 m low floor, doors behind the front corner, ahead of and behind the rear axle. */
export function e12Layout(spec) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const POD = FY + POD_H;
  const PLAT = FY + 0.36, PLAT_Z = 1.95; // raised floor behind door 3
  const { seats, pair, single } = builder();
  const a1 = -d.wb1;
  // ---- left (driver side)
  pair(-1, a1 - 0.3, POD);
  pair(-1, a1 + 0.5, POD);
  pair(-1, -4.8, FY);
  pair(-1, -4.0, FY);
  pair(-1, -3.2, FY);
  seats.push({ sec: 'front', x: -XW, z: -2.2, yaw: 0, fy: FY, kind: 'fold', side: -1 }); // wheelchair bay opposite door 2
  pair(-1, -0.45, POD);
  pair(-1, 0.35, POD);
  pair(-1, 1.2, FY);
  pair(-1, 2.05, PLAT);
  // ---- right (door side)
  single(1, a1 - 0.35, POD);
  single(1, a1 + 0.45, POD);
  pair(1, -4.75, FY);
  pair(1, -3.95, FY);
  pair(1, -1.2, FY);
  pair(1, -0.4, POD);
  pair(1, 2.1, PLAT);
  // bench across the back on the raised floor
  const zb = F.rearZ - 0.55;
  for (const x of [-0.97, -0.5, 0, 0.5, 0.97]) seats.push({ sec: 'front', x, z: zb, yaw: 0, fy: PLAT, kind: 'bench', side: Math.sign(x) || 1 });
  const standing = [
    { sec: 'front', x0: -0.26, x1: 0.26, z0: a1 - 0.5, z1: 1.9 },
    { sec: 'front', x0: 0.1, x1: 1.0, z0: -8.35, z1: -7.45 },
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -2.95, z1: -1.95 },
    { sec: 'front', x0: -1.1, x1: -0.35, z0: -2.9, z1: -1.6 },
    { sec: 'front', x0: 0.3, x1: 1.0, z0: 0.76, z1: 1.76 },
  ];
  const aisleFloorY = (sec, z) => (z > PLAT_Z + 0.3 ? PLAT : z > PLAT_Z ? FY + 0.18 : FY);
  const podiums = [
    { sec: 'front', side: -1, z0: a1 - 0.7, z1: a1 + 0.9, axle: a1 },
    { sec: 'front', side: 1, z0: a1 - 0.75, z1: a1 + 0.85, axle: a1 },
    { sec: 'front', side: -1, z0: -0.85, z1: 0.75, axle: 0 },
    { sec: 'front', side: 1, z0: -0.8, z1: 0.55, axle: 0 },
  ];
  return {
    seats, standing, aisleFloorY, fabric: false, podiums, podiumY: POD, platformY: PLAT, platformZ: PLAT_Z,
    walk: { front: { zMin: F.frontZ + 0.8, zMax: zb - 0.5, cabZ: F.frontZ + 1.9, cabX: -0.2 }, rear: { zMin: 0, zMax: 0 } },
  };
}
