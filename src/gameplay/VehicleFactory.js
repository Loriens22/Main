// One place that turns a dispatched vehicle into its entity: a tram (rail-bound, TramEntity) or a bus.
import { BusEntity } from './BusEntity.js';
import { TramEntity } from './TramEntity.js';
import { vehicleSpec } from '../vehicle/Vehicles.js';

export function createVehicle(opts) {
  return vehicleSpec(opts.vehicle).kind === 'tram' ? new TramEntity(opts) : new BusEntity(opts);
}
