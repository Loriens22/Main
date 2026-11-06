// Seat maps, podiums and walkable areas of the three trolleybuses of line 9 (section frames: front origin =
// middle axle, rear origin = rear axle, z backwards). Read from the interior photographs supplied with the
// directive: Solaris IV (images 4-6: individual shells in pairs on both sides of the aisle, podium seats over
// the wheel arches, the wheelchair bay opposite door 2), Solaris III (images 9-10: the same arrangement with
// the older podiums, seats facing each other at the bellows end), Ikarus 280.92F (images 16-17, refurbished:
// high floor at 0.88 m, single seats along the left windows, pairs on the right, steps at every door).
// Seat positions are fitted to the doors and axles of the exterior photographs; they are estimates.
import { frames } from '../../frames.js';

const POD_H = 0.26; // wheel-arch podium of the low-floor buses
const PLAT_H = 0.42; // raised floor over the rear axle / electrical equipment

/** The two Solaris Urbino 18 trolleybuses: low floor, four double doors. */
export function solarisLayout(spec, gen) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const POD = FY + POD_H, PLAT = FY + PLAT_H;
  const seats = [];
  const XW = 0.98, XA = 0.52;
  const pair = (sec, side, z, fy = FY, yaw = 0, extra = {}) => {
    const w = side * XW, a = side * XA;
    seats.push({ sec, x: w, z, yaw, fy, kind: 'fixed', side, ...extra }, { sec, x: a, z, yaw, fy, kind: 'fixed', side, ...extra });
  };
  const single = (sec, side, z, fy = FY, yaw = 0, x = XW) => seats.push({ sec, x: side * x, z, yaw, fy, kind: 'fixed', side });
  // ---- front section, left (behind the cab)
  pair('front', -1, -6.35, POD);
  pair('front', -1, -5.55, POD);
  pair('front', -1, -4.75);
  if (gen === 4) pair('front', -1, -3.95);
  else single('front', -1, -3.95);
  seats.push({ sec: 'front', x: -XW, z: -2.0, yaw: 0, fy: FY, kind: 'fold', side: -1 }); // wheelchair / pram bay opposite door 2
  pair('front', -1, -0.7, POD);
  pair('front', -1, 0.1, POD);
  // ---- front section, right (door side): between door 1 and door 2, after door 2
  pair('front', 1, -6.2, POD);
  pair('front', 1, -5.4, POD);
  pair('front', 1, -4.6);
  pair('front', 1, -3.8);
  pair('front', 1, -0.3, POD);
  if (gen === 3) pair('front', 1, 0.5, POD, Math.PI); // facing back towards the bellows (image 9)
  else pair('front', 1, 0.5, POD);
  // ---- rear section, left
  pair('rear', -1, -3.1, FY, gen === 3 ? Math.PI : 0); // the Solaris III pair faces the bellows end
  pair('rear', -1, -2.3);
  pair('rear', -1, -1.5);
  pair('rear', -1, -0.65, POD);
  pair('rear', -1, 0.15, POD);
  pair('rear', -1, 1.05, PLAT);
  pair('rear', -1, 1.85, PLAT);
  // ---- rear section, right: door 3 behind the bellows, door 4 behind the rear axle
  pair('rear', 1, -1.55);
  pair('rear', 1, -0.65, POD);
  pair('rear', 1, 0.15, POD);
  // bench across the back, on the platform over the electrical equipment
  for (const x of [-0.98, -0.52, 0, 0.52, 0.98]) seats.push({ sec: 'rear', x, z: F.rearZ - 0.62, yaw: 0, fy: PLAT, kind: 'bench', side: Math.sign(x) || 1 });
  const standing = [
    { sec: 'front', x0: -0.26, x1: 0.26, z0: -6.4, z1: 0.9 },
    { sec: 'front', x0: 0.1, x1: 1.0, z0: -8.0, z1: -7.1 },
    { sec: 'front', x0: 0.3, x1: 1.0, z0: -2.3, z1: -1.15 },
    { sec: 'front', x0: -1.1, x1: -0.35, z0: -3.4, z1: -1.4 },
    { sec: 'rear', x0: -0.26, x1: 0.26, z0: -3.4, z1: 2.4 },
    { sec: 'rear', x0: 0.3, x1: 1.0, z0: -3.45, z1: -2.35 },
    { sec: 'rear', x0: 0.3, x1: 1.0, z0: 0.9, z1: 2.0 },
  ];
  const aisleFloorY = (sec, z) => {
    if (sec === 'rear' && z > 0.75) return z > 1.05 ? PLAT : FY + PLAT_H / 2;
    return FY;
  };
  const podiums = [
    { sec: 'front', side: -1, z0: -6.75, z1: -5.1, axle: -d.wb1 },
    { sec: 'front', side: 1, z0: -6.6, z1: -4.95, axle: -d.wb1 },
    { sec: 'front', side: -1, z0: -1.1, z1: 0.6, axle: 0 },
    { sec: 'front', side: 1, z0: -0.7, z1: 0.95, axle: 0 },
    { sec: 'rear', side: -1, z0: -1.05, z1: 0.6, axle: 0 },
    { sec: 'rear', side: 1, z0: -1.05, z1: 0.6, axle: 0 },
  ];
  return {
    seats, standing, aisleFloorY, fabric: true, podiums, podiumY: POD, platformY: PLAT, platformZ: 0.75,
    walk: {
      front: { zMin: F.frontZ + 0.8, zMax: F.frontEnd + 0.4, cabZ: -7.0, cabX: -0.2 },
      rear: { zMin: F.rearStart - 0.3, zMax: F.rearZ - 1.0 },
    },
  };
}

/** Ikarus 280.92F: high floor (steps at the doors), singles on the left, pairs on the right. */
export function ikarusLayout(spec) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const seats = [];
  const single = (sec, z, fy = FY, yaw = 0) => seats.push({ sec, x: -0.9, z, yaw, fy, kind: 'fixed', side: -1 });
  const pair = (sec, z, fy = FY, yaw = 0) => {
    seats.push({ sec, x: 0.92, z, yaw, fy, kind: 'fixed', side: 1 }, { sec, x: 0.46, z, yaw, fy, kind: 'fixed', side: 1 });
  };
  // front section: singles all along the left behind the cab; pairs between the doors on the right
  for (let z = -6.0; z <= 0.6; z += 0.8) single('front', z);
  for (const z of [-5.85, -5.05, -4.25]) pair('front', z);
  for (const z of [-1.3, -0.5, 0.3]) pair('front', z);
  // rear section
  for (let z = -3.0; z <= 1.9; z += 0.8) single('rear', z);
  for (const z of [-1.6, -0.8, 0.0]) pair('rear', z);
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) seats.push({ sec: 'rear', x, z: F.rearZ - 0.55, yaw: 0, fy: FY + 0.1, kind: 'bench', side: Math.sign(x) || 1 });
  const standing = [
    { sec: 'front', x0: -0.3, x1: 0.2, z0: -6.2, z1: 0.8 },
    { sec: 'front', x0: 0.25, x1: 0.95, z0: -3.2, z1: -2.2 },
    { sec: 'rear', x0: -0.3, x1: 0.2, z0: -3.3, z1: 2.0 },
    { sec: 'rear', x0: 0.25, x1: 0.95, z0: -3.3, z1: -2.3 },
  ];
  return {
    seats, standing, aisleFloorY: () => FY, fabric: false, podiums: [], podiumY: FY, platformY: FY,
    // three steps at every door: 0.33 -> 0.52 -> 0.70 -> floor 0.88 (estimated)
    steps: [0.33, 0.52, 0.7],
    walk: {
      front: { zMin: F.frontZ + 0.8, zMax: F.frontEnd + 0.4, cabZ: -6.45, cabX: -0.25 },
      rear: { zMin: F.rearStart - 0.3, zMax: F.rearZ - 0.9 },
    },
  };
}
