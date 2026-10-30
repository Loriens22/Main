// Vehicle registry: every bus type the game can run, with everything the game needs
// to know about it (dimensions, doors, seat map, physics, sound, door warning, fleet).
// Game code never imports a particular bus: it asks bus.spec (see BusEntity).
//
// Spec fields (all lengths in metres, section frames as in BusSpec.js):
//   id, name, short, lines        identity; which lines may dispatch it
//   articulated                   two sections (front + rear) joined by a turntable, or one rigid body
//   dims                          length, width, halfW, roofY, floorY, wheelR, frontOverhang, wb1,
//                                 wb2, hitchBehindAxle2, bellowsGap, rearOverhang, maxSteer,
//                                 maxArticulation, steeringRatio
//                                 Frame origin of the front section: the middle axle (articulated) or
//                                 the rear axle (rigid). wb1 = steered axle -> that axle.
//   doors                         [{id, section, z0, z1}] right side
//   layout                        {seats, standing, aisleFloorY(sec, z), walk: {front, rear}}
//   physics                       {massEmpty, torque(rpm), idle, maxRpm, gears, final, reverse,
//                                  governed, aeroArea}
//   audio                         sound profile (engine type, cylinders, idle, formants, gearbox)
//   doorWarning                   {beeps, freq, ms}
//   fleets                        [{fleet, plate}]
//   create(opts)                  -> model with the BusModel interface (see models/README.md)
import { BUS } from './BusSpec.js';
import { SEATS, STANDING, aisleFloorY, REAR_BULKHEAD_Z } from './BusLayout.js';
import { BusModel, FLEET } from './BusModel.js';
import { engineTorque } from './ArticulatedBus.js';
import { frames } from './frames.js';
import conecto from './models/conecto/index.js';
import procity from './models/procity/index.js';
import yutong from './models/yutong/index.js';
import { TRAMS } from './trams/TramSpecs.js';

const MAN_FRONT_Z = -(BUS.frontOverhang + BUS.wb1);

export const MAN = {
  id: 'man',
  name: "MAN Lion's City G CNG",
  short: "MAN Lion's City G",
  lines: ['280'],
  articulated: true,
  dims: BUS,
  doors: BUS.doors,
  layout: {
    seats: SEATS,
    standing: STANDING,
    aisleFloorY,
    // walkable aisle limits per section; the cab takes the left side ahead of cabZ
    walk: {
      front: { zMin: MAN_FRONT_Z + 0.75, zMax: BUS.hitchBehindAxle2 - BUS.bellowsGap + 0.4, cabZ: -5.75, cabX: 0.2 },
      rear: { zMin: -(BUS.wb2 - BUS.hitchBehindAxle2) + BUS.bellowsGap - 0.3, zMax: REAR_BULKHEAD_Z - 0.3 },
    },
  },
  physics: { massEmpty: 17600, torque: engineTorque, idle: 620, maxRpm: 2200, gears: [3.364, 1.909, 1.421, 1.0, 0.72, 0.615], final: 6.2, reverse: 4.18, governed: 70 / 3.6, aeroArea: 8.2 },
  audio: { profile: 'man_cng' },
  doorWarning: { beeps: 2, freq: 1850, ms: 240, times: [0, 0.42], closeStart: 0.95 },
  fleets: Object.entries(FLEET).map(([fleet, v]) => ({ fleet, plate: v.plate })),
  create: (o) => new BusModel(o),
};

// trams (kind 'tram'): TramEntity instead of BusEntity, see src/vehicle/trams
export const VEHICLES = { man: MAN, conecto, procity, yutong, ...TRAMS };

/** Vehicles a line dispatches, with default shares (sum 1). */
export const LINE_FLEETS = {
  280: [{ id: 'man', share: 0.5 }, { id: 'conecto', share: 0.5 }],
  64: [{ id: 'procity', share: 0.5 }, { id: 'yutong', share: 0.5 }],
  12: [{ id: 'schindler', share: 0.5 }, { id: 't6m', share: 0.5 }],
};

export { frames };

export function vehicleSpec(id) {
  return VEHICLES[id] || MAN;
}

/** Section of a door ('front' | 'rear'). */
export function doorSection(spec, id) {
  const d = spec.doors.find((q) => q.id === id);
  return d ? d.section : 'front';
}

/** Vehicle types a line may dispatch (ids), in menu order. */
export function lineVehicles(line) {
  return (LINE_FLEETS[line] || LINE_FLEETS[280]).map((v) => v.id);
}

/**
 * Picks a vehicle for a service: deterministic for a given (seed, service number) pair, so a service keeps
 * its bus for the whole trip and a debug seed reproduces a whole day of dispatches. A choice that is not
 * 'random' (and belongs to the line) is always used; shares = {id: weight} overrides the line's default
 * distribution (a vehicle never runs on a line that does not list it).
 */
export function dispatchVehicle(line, serviceNo, seed = 0, choice = 'random', shares = null) {
  let list = LINE_FLEETS[line] || LINE_FLEETS[280];
  if (choice && choice !== 'random' && list.some((v) => v.id === choice)) return choice;
  if (shares) {
    const w = list.map((v) => Math.max(0, shares[v.id] ?? v.share));
    const sum = w.reduce((a, b) => a + b, 0);
    if (sum > 0) list = list.map((v, i) => ({ id: v.id, share: w[i] / sum }));
  }
  let h = (Math.imul(serviceNo + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  const u = (h >>> 8) / 16777216;
  let acc = 0;
  for (const v of list) {
    acc += v.share;
    if (u < acc) return v.id;
  }
  return list[list.length - 1].id;
}

/** A fleet number and plate of that vehicle type for a service (stable per service). */
export function fleetFor(id, serviceNo) {
  const f = vehicleSpec(id).fleets;
  return f[Math.abs(Math.floor(serviceNo)) % f.length];
}
