/**
 * Data-driven vehicle specifications.
 * Spacecraft numbers combine real rocket physics (F, Isp, ṁ = F/(Isp·g0)) with the film's
 * fictional, very capable propulsion. See docs/MISSION_AND_VEHICLES.md.
 */
export const G0 = 9.80665;

export interface SpacecraftSpec {
  kind: 'ranger' | 'lander' | 'endurance' | 'oldlander' | 'rocket';
  dryMass: number; // kg
  propMax: number; // kg
  mainThrust: number; // N (vacuum)
  mainIsp: number; // s
  vtolThrust: number; // N (ventral descent/hover thrusters)
  vtolIsp: number;
  rcsThrust: number; // N per axis (translation)
  rcsTorque: [number, number, number]; // N·m (pitch, yaw, roll)
  rcsIsp: number;
  inertia: [number, number, number]; // kg·m² about body x (pitch), y (yaw), z (roll)
  dragArea: number; // m² × Cd (frontal)
  liftCoef: number; // lifting-body lift slope per rad AoA
  length: number;
  crew: number;
  powerDraw: number; // kW nominal
  gearHeight: number; // m from hull origin to ground when gear down
  dockPorts: string[];
  label: string;
}

export const SPECS: Record<string, SpacecraftSpec> = {
  ranger: {
    kind: 'ranger',
    dryMass: 22000,
    propMax: 26000, // ≈11.5 km/s: a powered descent and a climb back to orbit on Mars-class worlds
    mainThrust: 950e3,
    mainIsp: 1500,
    vtolThrust: 780e3,
    vtolIsp: 1100,
    rcsThrust: 22e3,
    rcsTorque: [260e3, 260e3, 200e3],
    rcsIsp: 300,
    inertia: [5.6e5, 6.8e5, 2.2e5],
    dragArea: 18,
    liftCoef: 2.2,
    length: 17,
    crew: 4,
    powerDraw: 38,
    gearHeight: 1.465,
    dockPorts: ['rear'],
    label: 'RANGER',
  },
  lander: {
    kind: 'lander',
    dryMass: 61000,
    propMax: 52000,
    mainThrust: 1.6e6,
    mainIsp: 1300,
    vtolThrust: 2.6e6,
    vtolIsp: 1150,
    rcsThrust: 55e3,
    rcsTorque: [900e3, 900e3, 750e3],
    rcsIsp: 300,
    inertia: [2.6e6, 3.2e6, 2.4e6],
    dragArea: 70,
    liftCoef: 0.4,
    length: 16,
    crew: 2,
    powerDraw: 55,
    gearHeight: 1.9,
    dockPorts: ['top'],
    label: 'LANDER',
  },
  oldlander: {
    kind: 'oldlander',
    dryMass: 63000,
    propMax: 52000,
    mainThrust: 1.0e6,
    mainIsp: 1050,
    vtolThrust: 1.55e6,
    vtolIsp: 950,
    rcsThrust: 35e3,
    rcsTorque: [600e3, 600e3, 500e3],
    rcsIsp: 280,
    inertia: [2.6e6, 3.2e6, 2.4e6],
    dragArea: 72,
    liftCoef: 0.35,
    length: 16,
    crew: 2,
    powerDraw: 55,
    gearHeight: 1.9,
    dockPorts: ['top'],
    label: 'LANDER (LAZARUS-3)',
  },
  endurance: {
    kind: 'endurance',
    dryMass: 640000,
    propMax: 1400000,
    mainThrust: 4.2e6,
    mainIsp: 14000,
    vtolThrust: 0,
    vtolIsp: 1,
    rcsThrust: 120e3,
    rcsTorque: [6e6, 6e6, 9e6],
    rcsIsp: 320,
    inertia: [3.1e8, 5.8e8, 3.1e8],
    dragArea: 0,
    liftCoef: 0,
    length: 64,
    crew: 8,
    powerDraw: 420,
    gearHeight: 0,
    dockPorts: ['fwd', 'aft', 'top', 'bottom'],
    label: 'ENDURANCE',
  },
};

export function exhaustVelocity(isp: number) {
  return isp * G0;
}

/** Tsiolkovsky: Δv available for given propellant. */
export function deltaV(spec: SpacecraftSpec, prop: number, payload = 0, isp = spec.mainIsp) {
  const m0 = spec.dryMass + payload + prop;
  const m1 = spec.dryMass + payload;
  return exhaustVelocity(isp) * Math.log(m0 / m1);
}

/** Propellant needed to achieve Δv. */
export function propForDv(spec: SpacecraftSpec, currentProp: number, dv: number, payload = 0, isp = spec.mainIsp) {
  const m0 = spec.dryMass + payload + currentProp;
  const m1 = m0 / Math.exp(dv / exhaustVelocity(isp));
  return m0 - m1;
}

export interface GroundVehicleSpec {
  kind: 'car' | 'tractor' | 'combine';
  mass: number;
  engineForce: number;
  brakeForce: number;
  maxSteer: number;
  wheelRadius: number[];
  wheelPositions: [number, number, number][]; // chassis space (x, y, z) three.js coords
  steerWheels: number[];
  driveWheels: number[];
  suspensionRest: number;
  suspensionStiffness: number;
  chassisHalf: [number, number, number];
  chassisOffsetY: number;
  maxSpeed: number; // m/s
  fuelMax: number; // litres
  fuelPerKm: number;
  seatEye: [number, number, number];
  label: string;
}

export const GROUND: Record<string, GroundVehicleSpec> = {
  car: {
    kind: 'car',
    mass: 2100,
    engineForce: 7200,
    brakeForce: 90,
    maxSteer: 0.6,
    wheelRadius: [0.38, 0.38, 0.38, 0.38],
    wheelPositions: [
      [-0.82, 0.38, -1.75],
      [0.82, 0.38, -1.75],
      [-0.82, 0.38, 1.55],
      [0.82, 0.38, 1.55],
    ],
    steerWheels: [0, 1],
    driveWheels: [2, 3],
    suspensionRest: 0.35,
    suspensionStiffness: 28,
    chassisHalf: [0.98, 0.5, 2.8],
    chassisOffsetY: 0.85,
    maxSpeed: 38,
    fuelMax: 90,
    fuelPerKm: 0.14,
    seatEye: [-0.42, 1.56, 0.12],
    label: 'PICKUP',
  },
  tractor: {
    kind: 'tractor',
    mass: 14000,
    engineForce: 52000,
    brakeForce: 400,
    maxSteer: 0.5,
    wheelRadius: [1.0, 1.0, 1.0, 1.0],
    wheelPositions: [
      [-1.3, 1.0, -1.95],
      [1.3, 1.0, -1.95],
      [-1.3, 1.0, 1.95],
      [1.3, 1.0, 1.95],
    ],
    steerWheels: [0, 1],
    driveWheels: [0, 1, 2, 3],
    suspensionRest: 0.35,
    suspensionStiffness: 40,
    chassisHalf: [1.3, 0.8, 3.2],
    chassisOffsetY: 1.45,
    maxSpeed: 11,
    fuelMax: 900,
    fuelPerKm: 2.2,
    seatEye: [0, 3.2, 0.68],
    label: 'TRACTOR',
  },
  combine: {
    kind: 'combine',
    mass: 17000,
    engineForce: 48000,
    brakeForce: 420,
    maxSteer: 0.45,
    wheelRadius: [0.93, 0.93, 0.65, 0.65],
    wheelPositions: [
      [-1.55, 0.93, -1.3],
      [1.55, 0.93, -1.3],
      [-1.35, 0.65, 2.9],
      [1.35, 0.65, 2.9],
    ],
    steerWheels: [2, 3],
    driveWheels: [0, 1],
    suspensionRest: 0.3,
    suspensionStiffness: 45,
    chassisHalf: [1.6, 1.4, 4.2],
    chassisOffsetY: 1.7,
    maxSpeed: 7,
    fuelMax: 1000,
    fuelPerKm: 3,
    seatEye: [0, 4.65, -1.85],
    label: 'COMBINE',
  },
};
