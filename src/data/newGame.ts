import { SAVE_VERSION, type GameState, type VehicleState, type NpcState, type SystemState, type Vec3 } from '../core/State';
import { START_EARTH_TIME } from '../core/MissionClock';
import { SPECS, GROUND } from './vehicles';
import { FARM_SPAWN, FARM_VEHICLE_SPOTS } from './earthLayout';

function vehicle(id: string, type: VehicleState['type'], name: string, location: VehicleState['location'], pos: Vec3, extra: Partial<VehicleState> = {}): VehicleState {
  const spec = (SPECS as any)[type] ?? null;
  const g = (GROUND as any)[type] ?? null;
  const fuelMax = spec ? spec.propMax : g ? g.fuelMax : 0;
  return {
    id, type, name, location, pos, quat: [0, 0, 0, 1], vel: [0, 0, 0], angVel: [0, 0, 0],
    fuel: fuelMax, fuelMax, power: 1, damage: {}, maintenance: 0, docked: null, landed: false, gearDown: true,
    passengers: [], autopilot: null, lights: false, hatchOpen: false, data: {}, ...extra,
  };
}

function npc(id: string, frame: string, pos: Vec3, extra: Partial<NpcState> = {}): NpcState {
  return {
    id, frame, pos, yaw: 0, task: 'idle', taskData: {}, mood: 0.2, stress: 0.1, health: 1, relationship: 0.2,
    memory: [], following: false, aboard: null, access: [], alive: true, suit: false, ...extra,
  };
}

const SHIP_SYSTEMS: Record<string, string[]> = {
  endurance: ['comms', 'nav', 'engines', 'sensors', 'environment', 'docking', 'power', 'cryo', 'rotation'],
  ranger: ['engines', 'rcs', 'avionics', 'lifesupport', 'gear', 'comms', 'docking'],
  lander: ['engines', 'rcs', 'avionics', 'lifesupport', 'gear', 'comms', 'docking', 'cargo'],
  oldlander: ['engines', 'rcs', 'avionics', 'lifesupport', 'gear', 'comms', 'docking', 'cargo'],
};

function sys(integrity = 1, fault: string | null = null): SystemState {
  return { integrity, online: integrity > 0.3, fault, faultCause: null, since: 0 };
}

export function newGameState(): GameState {
  const vehicles: Record<string, VehicleState> = {};
  const add = (v: VehicleState) => (vehicles[v.id] = v);

  // ---- Earth
  add(vehicle('pickup', 'car', 'Farm pickup', 'earth', FARM_VEHICLE_SPOTS.pickup.pos, { quat: FARM_VEHICLE_SPOTS.pickup.quat }));
  add(vehicle('tractor1', 'tractor', 'Tractor 1', 'earth', FARM_VEHICLE_SPOTS.tractor1.pos, { quat: FARM_VEHICLE_SPOTS.tractor1.quat }));
  add(vehicle('tractor2', 'tractor', 'Tractor 2', 'earth', FARM_VEHICLE_SPOTS.tractor2.pos, { quat: FARM_VEHICLE_SPOTS.tractor2.quat }));
  add(vehicle('combine1', 'combine', 'Combine 1', 'earth', FARM_VEHICLE_SPOTS.combine1.pos, { quat: FARM_VEHICLE_SPOTS.combine1.quat }));
  add(vehicle('combine2', 'combine', 'Combine 2', 'earth', FARM_VEHICLE_SPOTS.combine2.pos, { quat: FARM_VEHICLE_SPOTS.combine2.quat }));
  // Ranger 1 stands on its launch vehicle in the NASA silo
  // launched with 19 t aboard (the launch vehicle's rated payload); the Endurance tops the tanks up once docked
  add(vehicle('ranger1', 'ranger', 'Ranger 1', 'earth', [0, 0, 0], { fuel: 19000, data: { mounted: true, stage: 'pad' }, gearDown: false }));

  // ---- In orbit: Endurance with Ranger 2 and both Landers docked
  add(vehicle('endurance', 'endurance', 'Endurance', 'space', [0, 0, 0], { gearDown: false }));
  add(vehicle('ranger2', 'ranger', 'Ranger 2', 'space', [0, 0, 0], { docked: { ship: 'endurance', port: 'aft' }, gearDown: false }));
  add(vehicle('lander1', 'lander', 'Lander 1', 'space', [0, 0, 0], { docked: { ship: 'endurance', port: 'top' }, gearDown: false }));
  add(vehicle('lander2', 'lander', 'Lander 2', 'space', [0, 0, 0], { docked: { ship: 'endurance', port: 'bottom' }, gearDown: false }));

  // ---- Edmunds' planet: abandoned, weathered Lander next to the base
  add(vehicle('oldlander', 'oldlander', 'Lazarus-3 Lander', 'edmunds', [38, 0, -22], {
    landed: true, fuel: 9000, power: 0.18, maintenance: 1,
    quat: [0, Math.sin(0.35), 0, Math.cos(0.35)],
  }));

  const systems: Record<string, SystemState> = {};
  for (const [vid, v] of Object.entries(vehicles)) {
    const list = SHIP_SYSTEMS[v.type];
    if (!list) continue;
    for (const s of list) systems[`${vid}.${s}`] = sys();
  }
  // the old lander is barely operational
  Object.assign(systems, {
    'oldlander.engines': sys(0.34, 'Combustion instability, injector corrosion'),
    'oldlander.rcs': sys(0.45, 'Two RCS quads unresponsive'),
    'oldlander.avionics': sys(0.4, 'Intermittent bus faults'),
    'oldlander.lifesupport': sys(0.3, 'Seal degradation, CO₂ scrubber saturated'),
    'oldlander.gear': sys(0.55, 'Hydraulic leak'),
    'oldlander.comms': sys(0.25, 'Antenna feed corroded'),
    'oldlander.docking': sys(0.5, 'Latch actuator stiff'),
    'oldlander.cargo': sys(0.6, null),
  });

  const npcs: Record<string, NpcState> = {
    ward: npc('ward', 'earth', [0, 0, 0], { task: 'nasa_station', taskData: { station: 'mc_eng' }, access: ['all'] }),
    sato: npc('sato', 'earth', [0, 0, 0], { task: 'nasa_station', taskData: { station: 'mc_sci' }, access: ['all'] }),
    reyes: npc('reyes', 'earth', [0, 0, 0], { task: 'nasa_station', taskData: { station: 'mc_med' }, access: ['all'] }),
    kessler: npc('kessler', 'earth', [0, 0, 0], { task: 'nasa_station', taskData: { station: 'mc_dir' } }),
    walt: npc('walt', 'earth', [0, 0, 0], { task: 'schedule', relationship: 0.5 }),
    june: npc('june', 'earth', [0, 0, 0], { task: 'schedule', relationship: 0.4 }),
    tomas: npc('tomas', 'earth', [0, 0, 0], { task: 'schedule', relationship: 0.3 }),
    miller: npc('miller', 'miller', [0, 0, 0], { task: 'miller_base', mood: -0.7, stress: 0.9, relationship: 0 }),
    mann: npc('mann', 'mann', [0, 0, 0], { task: 'mann_sleep', mood: 0.3, relationship: 0, taskData: { phase: 'asleep' } }),
  };

  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    savedAt: 0,
    playSeconds: 0,
    clock: { earthTime: START_EARTH_TIME, playerProper: 0, enduranceProper: 0, timeScale: 1 },
    location: 'earth',
    system: 'sol',
    player: {
      frame: 'earth', pos: FARM_SPAWN.pos, yaw: FARM_SPAWN.yaw, pitch: 0, mode: 'walk', seat: null, vehicle: null,
      suit: false, helmet: false, o2: 1, health: 1, thirdPerson: false,
    },
    vehicles,
    npcs,
    systems,
    endurance: {
      omega: 0.5537, // ≈ 5.29 rpm → 1 g at r = 32 m
      targetOmega: 0.5537,
      autoGravity: true,
      spinAngle: 0,
      nav: {
        destination: null, program: 'parking', departT: 0, arriveT: 0, arc: null,
        parkBody: 'earth', parkRadius: 6371e3 + 420e3, parkPhase: 0, dvUsed: 0,
      },
      cryo: { active: false, wakeT: 0, occupants: [] },
    },
    mission: { stage: 'earth', decision: 'undecided', objectives: {} },
    farm: { harvest: [0, 0, 0, 0, 0, 0, 0, 0], stormLevel: 0, nextStormT: START_EARTH_TIME + 25 * 60 },
    flags: {},
    creative: {
      unlimitedResources: false, autoRefuel: true, autoRepair: false, autopilotAssist: true, damageProtection: true,
      fastTravel: true, freeCamera: false, hazardProtection: true, timeWarpAllowed: true,
    },
    logs: [],
    discoveries: [],
    dialogueSeen: [],
  };
}
