// Mercedes-Benz Conecto G: spec + model factory (see ../README.md for the model interface).
import spec from './spec.js';
import { GenericBusModel } from '../GenericBusModel.js';
import { ConectoModel } from './ConectoModel.js';

spec.create = (o) => {
  try {
    return new ConectoModel(spec, o);
  } catch (e) {
    console.error('[conecto] detailed model failed', e);
    return new GenericBusModel(spec, o);
  }
};
export default spec;
