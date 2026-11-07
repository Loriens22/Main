// The two battery buses of line 84: specs + model factories (the shared TrolleyModel with a design on the spec;
// see ../README.md for the model interface).
import { SOR, E12 } from './specs.js';
import { GenericBusModel } from '../GenericBusModel.js';
import { TrolleyModel } from '../trolley/TrolleyModel.js';

for (const spec of [SOR, E12]) {
  spec.create = (o) => {
    try {
      return new TrolleyModel(spec, o);
    } catch (e) {
      console.error(`[${spec.id}] detailed model failed`, e);
    }
    return new GenericBusModel(spec, o);
  };
}

export const EBUSES = { sor: SOR, e12: E12 };
