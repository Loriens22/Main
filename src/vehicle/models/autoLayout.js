// A plausible seat map and walkable area for a vehicle spec, generated from its doors,
// axles and cab: double seats along both sides, none in front of a door or in the
// wheelchair bay, raised over the wheel arches, a rear bench on rigid buses. Detailed
// vehicle models replace it with the seat map read from their photos.
import { frames } from '../frames.js';

export function autoLayout(spec, { pitch = 0.78, bay = null, cabEnd = null, rearBench = true } = {}) {
  const d = spec.dims, F = frames(spec), FY = d.floorY;
  const seats = [], standing = [];
  const xs = { L: [-0.975, -0.515], R: [0.975, 0.515] };
  const axles = spec.articulated
    ? [{ sec: 'front', z: -d.wb1 }, { sec: 'front', z: 0 }, { sec: 'rear', z: 0 }]
    : [{ sec: 'front', z: -d.wb1 }, { sec: 'front', z: 0 }];
  const cab = cabEnd ?? F.frontZ + 2.0;
  const sections = spec.articulated ? ['front', 'rear'] : ['front'];
  for (const sec of sections) {
    const z0 = sec === 'front' ? cab : F.rearStart + 0.5;
    const z1 = (sec === 'front' ? F.frontEnd : F.rearZ) - (rearBench && (sec === 'rear' || !spec.articulated) ? 1.2 : 0.4);
    const doors = spec.doors.filter((q) => q.section === sec);
    for (const side of ['L', 'R']) {
      for (let z = z0 + 0.4; z < z1; z += pitch) {
        if (side === 'R' && doors.some((q) => z > q.z0 - 0.45 && z < q.z1 + 0.45)) continue; // door landing
        if (side === 'R' && sec === 'front' && z < F.frontZ + 2.2) continue; // door 1 area
        if (bay && side === bay.side && sec === bay.sec && z > bay.z0 && z < bay.z1) continue; // wheelchair bay
        const overAxle = axles.some((a) => a.sec === sec && Math.abs(a.z - z) < 0.75);
        for (const x of xs[side]) seats.push({ sec, x, z, yaw: 0, fy: overAxle ? FY + 0.26 : FY, ins: false, kind: 'fixed', side: side === 'L' ? -1 : 1 });
      }
    }
    if (rearBench && (sec === 'rear' || !spec.articulated)) for (const x of [-0.975, -0.515, 0, 0.515, 0.975]) seats.push({ sec, x, z: (sec === 'front' ? F.frontEnd : F.rearZ) - 0.75, yaw: 0, fy: FY + 0.3, ins: false, kind: 'bench', side: Math.sign(x) || 1 });
    standing.push({ sec, x0: -0.26, x1: 0.26, z0: z0 + 0.3, z1: z1 - 0.3 });
    for (const q of doors) standing.push({ sec, x0: 0.3, x1: 1.0, z0: q.z0 + 0.1, z1: q.z1 - 0.1 });
  }
  return {
    seats,
    standing,
    aisleFloorY: () => FY,
    walk: {
      front: { zMin: F.frontZ + 0.75, zMax: spec.articulated ? F.frontEnd + 0.4 : F.rearZ - 1.4, cabZ: cab - 0.1, cabX: 0.2 },
      rear: { zMin: F.rearStart - 0.3, zMax: F.rearZ - 1.4 },
    },
  };
}
