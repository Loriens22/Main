/**
 * Serializable game state — the single source of truth that survives save/load.
 * Everything here must be plain JSON (numbers, strings, arrays, records).
 */
export type LocationId = 'earth' | 'space' | 'surface' | 'miller' | 'mann' | 'edmunds';
export type SystemId = 'sol' | 'gargantua';
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const SAVE_VERSION = 3;

export type PlayerMode = 'walk' | 'float' | 'ladder' | 'seat' | 'cryo' | 'cinematic' | 'drive';

export interface PlayerState {
  /** frame id: 'earth', 'endurance', 'ranger1', 'lander2', 'miller', ... */
  frame: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  mode: PlayerMode;
  seat: string | null; // seat interaction id when seated
  vehicle: string | null; // vehicle being driven/piloted (ground or space)
  suit: boolean;
  helmet: boolean;
  o2: number; // suit oxygen 0..1
  health: number; // 0..1
  thirdPerson: boolean;
}

export type VehicleType = 'ranger' | 'lander' | 'endurance' | 'car' | 'tractor' | 'combine' | 'rocket' | 'oldlander';

export interface DockState {
  ship: string; // 'endurance'
  port: string; // port id on that ship
}

export interface VehicleState {
  id: string;
  type: VehicleType;
  name: string;
  location: LocationId;
  /**
   * Position: in surface zones metres in zone coordinates; in space metres relative to the system barycentre.
   */
  pos: Vec3;
  quat: Quat;
  vel: Vec3;
  angVel: Vec3;
  fuel: number; // kg propellant (ground vehicles: litres)
  fuelMax: number;
  power: number; // battery 0..1
  damage: Record<string, number>; // subsystem -> integrity 0..1 (1 = healthy)
  maintenance: number; // hours since service / wear 0..1
  docked: DockState | null;
  landed: boolean;
  gearDown: boolean;
  passengers: string[]; // crew ids aboard
  autopilot: string | null; // active program id
  lights: boolean;
  hatchOpen: boolean;
  /** misc vehicle specific data (e.g. tractor route progress, launch stage, cargo pod) */
  data: Record<string, unknown>;
}

export interface NpcState {
  id: string;
  frame: string; // frame/zone where the character currently is
  pos: Vec3;
  yaw: number;
  task: string; // current task id
  taskData: Record<string, unknown>;
  mood: number; // -1..1
  stress: number; // 0..1
  health: number; // 0..1
  relationship: number; // -1..1 with player
  memory: string[]; // remembered event keys
  following: boolean;
  aboard: string | null; // vehicle id when seated/travelling
  access: string[]; // access permissions (rooms/systems)
  alive: boolean;
  suit: boolean;
}

export interface SystemState {
  integrity: number; // 0..1
  online: boolean;
  fault: string | null; // fault description
  faultCause: string | null; // hidden cause (e.g. 'sabotage:mann')
  since: number; // earthTime when fault happened
}

export interface LogEntry {
  t: number; // earthTime
  ship: number; // endurance proper time
  channel: 'maintenance' | 'access' | 'comms' | 'mission' | 'medical' | 'science';
  who: string;
  text: string;
}

export interface CreativeSettings {
  unlimitedResources: boolean;
  autoRefuel: boolean;
  autoRepair: boolean;
  autopilotAssist: boolean;
  damageProtection: boolean;
  fastTravel: boolean;
  freeCamera: boolean;
  hazardProtection: boolean;
  timeWarpAllowed: boolean;
}

export interface EnduranceState {
  /** angular velocity of the ring (rad/s) around its local +Y axis */
  omega: number;
  targetOmega: number;
  autoGravity: boolean;
  spinAngle: number; // rad, accumulated
  /** current navigation */
  nav: NavState;
  cryo: CryoState;
}

export interface NavState {
  destination: string | null; // body id
  program: 'idle' | 'parking' | 'transfer' | 'coast' | 'capture' | 'wormhole' | 'approach';
  departT: number;
  arriveT: number;
  /** Lambert transfer arc (heliocentric) start state */
  arc: { r0: Vec3; v0: Vec3; t0: number; mu: number; center: string } | null;
  parkBody: string; // body Endurance orbits
  parkRadius: number;
  parkPhase: number;
  dvUsed: number;
}

export interface CryoState {
  active: boolean;
  wakeT: number;
  occupants: string[];
}

export interface MissionState {
  stage: 'earth' | 'launched' | 'docked' | 'solar' | 'saturn' | 'gargantua';
  decision: 'undecided' | 'research' | 'endurance';
  objectives: Record<string, 'open' | 'done' | 'failed'>;
}

export interface FarmState {
  harvest: number[]; // per-field harvest progress 0..1
  stormLevel: number; // 0..1 current dust storm intensity
  nextStormT: number; // earth time of next storm
}

export interface GameState {
  version: number;
  createdAt: number; // wall clock ms
  savedAt: number;
  playSeconds: number;
  clock: {
    earthTime: number; // TDB seconds since J2000 (Earth-reference coordinate time)
    playerProper: number;
    enduranceProper: number;
    timeScale: number;
  };
  location: LocationId;
  system: SystemId;
  player: PlayerState;
  vehicles: Record<string, VehicleState>;
  npcs: Record<string, NpcState>;
  systems: Record<string, SystemState>; // key `${vehicle}.${system}`
  endurance: EnduranceState;
  mission: MissionState;
  farm: FarmState;
  flags: Record<string, number | string | boolean>;
  creative: CreativeSettings;
  logs: LogEntry[];
  discoveries: string[];
  dialogueSeen: string[];
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}
