import type { Vec3, Quat } from '../core/State';

/**
 * Earth zone geography (metres). +X = east, -Z = north, +Y = up. Farmhouse main block at the origin.
 * The farm → NASA route is ~6.0 km by road: driveway (S) → county gravel road (E) → dirt road (N)
 * → winding asphalt access road into the foothills → concealed NASA portal.
 */
function yawQuat(a: number): Quat {
  return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
}

export const FARM_SPAWN = { pos: [-4, 0, 26] as Vec3, yaw: 0.15 };

export const FARM_VEHICLE_SPOTS: Record<string, { pos: Vec3; quat: Quat }> = {
  // parked nose-out at the east end of the porch (reference image 2)
  pickup: { pos: [4.8, 0, 10.4], quat: yawQuat(Math.PI - 0.3) },
  // big 4WD parked east of the house, nose toward the yard (reference image 2)
  tractor1: { pos: [17, 0, 7.5], quat: yawQuat(Math.PI / 2 + 0.3) },
  tractor2: { pos: [-9.5, 0, 21], quat: yawQuat(-0.08) },
  combine1: { pos: [26, 0, 20], quat: yawQuat(0.0) },
  combine2: { pos: [40, 0, 19], quat: yawQuat(0.1) },
};

export const FARM_PROPS = {
  grainCart: { pos: [-34, 0, 18] as Vec3, yaw: 0.1 },
  waterTanks: [[-38, 0, 6], [-36, 0, 3]] as Vec3[],
  fuelTank: { pos: [16, 0, 26] as Vec3, yaw: 0 },
  barn: { pos: [-30, 0, -32] as Vec3, yaw: 0.0 },
  garage: { pos: [24, 0, -14] as Vec3, yaw: Math.PI / 2 },
  silo: [[-48, 0, -22], [-48, 0, -10]] as Vec3[],
  pole: [[30, 0, 6], [62, 0, 6], [94, 0, 6]] as Vec3[],
};

export type Surface = 'gravel' | 'dirt' | 'asphalt';
export interface RoadSegment {
  points: [number, number][]; // (x, z) control points
  width: number;
  surface: Surface;
  name: string;
}

/** The single drivable route farm → NASA, in order. */
export const ROUTE: RoadSegment[] = [
  { name: 'Farm driveway', surface: 'gravel', width: 4.5, points: [[6, 6], [8, 40], [10, 120], [12, 200], [14, 250]] },
  {
    name: 'County Road 9', surface: 'gravel', width: 7, points: [
      [14, 250], [300, 252], [700, 250], [1100, 246], [1500, 252], [1850, 254], [1990, 240],
    ],
  },
  {
    name: 'Section line road', surface: 'dirt', width: 6, points: [
      [1990, 240], [2010, 0], [2020, -400], [2060, -800], [2100, -1150], [2190, -1450],
    ],
  },
  {
    name: 'Facility access road', surface: 'asphalt', width: 7.5, points: [
      [2190, -1450], [2330, -1700], [2410, -1960], [2560, -2180], [2650, -2440], [2780, -2660], [2850, -2880],
      [2895, -3060], [2900, -3135],
    ],
  },
];

/** Secondary county road (decorative continuity, not part of the GPS route). */
export const SIDE_ROADS: RoadSegment[] = [
  { name: 'County Road 9 W', surface: 'gravel', width: 7, points: [[14, 250], [-500, 252], [-1200, 249], [-2400, 252], [-4000, 250]] },
  { name: 'County Road 9 E', surface: 'gravel', width: 7, points: [[1990, 240], [2400, 238], [3200, 245], [4500, 250]] },
  { name: 'Hollis lane', surface: 'dirt', width: 4, points: [[1300, 250], [1305, 420], [1310, 640]] },
  { name: 'Pike lane', surface: 'dirt', width: 4, points: [[-900, 250], [-905, 0], [-910, -420], [-1150, -700]] },
];

export const NASA = {
  /** security gate on the access road */
  gate: { pos: [2855, 0, -2905] as Vec3, yaw: -0.25 },
  /** portal: centre of the blast-door opening at road level; tunnel runs north (−Z) */
  portal: { x: 2900, z: -3150, level: 0 }, // level filled from terrain at runtime
  /** silo centre (vertical axis) inside the mountain */
  silo: { x: 2900, z: -3350 },
  parking: [[2875, -3090], [2885, -3092], [2915, -3092], [2925, -3090]] as [number, number][],
  /** structures on the hill above the portal (nasa_hill.glb nodes), placed on the terrain; forest is cleared round them */
  hillSites: [
    { kind: 'vent_stack', x: 2878, z: -3210, yaw: 0.2 },
    { kind: 'vent_stack', x: 2926, z: -3236, yaw: -0.4 },
    { kind: 'antenna_mast', x: 2944, z: -3298, yaw: 0.9 },
  ] as { kind: string; x: number; z: number; yaw: number }[],
};

export interface FieldDef {
  id: number;
  rect: [number, number, number, number]; // xmin, zmin, xmax, zmax
  rowDir: 'x' | 'z';
  crop: 'corn';
}

export const FIELDS: FieldDef[] = [
  { id: 0, rect: [-620, -560, -52, 230], rowDir: 'z', crop: 'corn' },
  { id: 1, rect: [-40, -640, 720, -56], rowDir: 'x', crop: 'corn' },
  { id: 2, rect: [62, 34, 960, 236], rowDir: 'x', crop: 'corn' },
  { id: 3, rect: [-640, 266, -20, 940], rowDir: 'z', crop: 'corn' },
  { id: 4, rect: [40, 266, 1240, 1020], rowDir: 'z', crop: 'corn' },
  { id: 5, rect: [740, -1400, 1975, 226], rowDir: 'z', crop: 'corn' },
  { id: 6, rect: [2035, -1300, 3100, 222], rowDir: 'z', crop: 'corn' },
  { id: 7, rect: [-1600, -1200, -680, 226], rowDir: 'x', crop: 'corn' },
  // small field right up against the farmyard south-west of the house (reference image 2 viewpoint)
  { id: 8, rect: [-52, 30, -8, 230], rowDir: 'z', crop: 'corn' },
];

/** Neighbouring farmsteads (house positions); generic farm buildings placed around them. */
export const NEIGHBOURS = [
  { id: 'hollis', name: 'Hollis farm', pos: [1330, 0, 690] as Vec3, yaw: Math.PI },
  { id: 'pike', name: 'Pike farm', pos: [-1180, 0, -760] as Vec3, yaw: 0.6 },
  { id: 'ruiz', name: 'Ruiz place', pos: [2420, 0, 420] as Vec3, yaw: -0.3 },
  { id: 'abandoned', name: 'Abandoned farm', pos: [-2200, 0, 620] as Vec3, yaw: 2.2 },
];

/** Total terrain extent (square, centred) and high-res region. */
export const EARTH_TERRAIN = {
  size: 8192, // m, near heightmap covers this square
  center: [1450, -1450] as [number, number],
  res: 2049, // samples per side (4 m spacing)
  farSize: 120000,
  farRes: 513,
};
