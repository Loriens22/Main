// The three trolleybuses of line 9: specs + model factories (see ../README.md for the model interface).
import { SOLARIS4, SOLARIS3, IKARUS } from './specs.js';
import { GenericBusModel } from '../GenericBusModel.js';
import { TrolleyModel } from './TrolleyModel.js';

const MODELS = { solaris4: TrolleyModel, solaris3: TrolleyModel, ikarus: TrolleyModel };

/** Registers the detailed model class of a trolleybus (called by the model modules). */
export function registerTrolleyModel(id, Cls) {
  MODELS[id] = Cls;
}

for (const spec of [SOLARIS4, SOLARIS3, IKARUS]) {
  spec.create = (o) => {
    const Cls = MODELS[spec.id];
    if (Cls) {
      try {
        return new Cls(spec, o);
      } catch (e) {
        console.error(`[${spec.id}] detailed model failed`, e);
      }
    }
    return new GenericBusModel(spec, o);
  };
}

export const TROLLEYS = { solaris4: SOLARIS4, solaris3: SOLARIS3, ikarus: IKARUS };
