// BMC Procity CNG: spec + model factory (see ../README.md for the model interface).
import spec from './spec.js';
import { GenericBusModel } from '../GenericBusModel.js';
import { ProcityModel } from './ProcityModel.js';

spec.create = (o) => {
  try {
    return new ProcityModel(spec, o);
  } catch (e) {
    console.error('[procity] detailed model failed', e);
    return new GenericBusModel(spec, o);
  }
};
export default spec;
