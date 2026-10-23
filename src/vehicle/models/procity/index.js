// BMC Procity CNG: spec + model factory (see ../README.md for the model interface).
import spec from './spec.js';
import { GenericBusModel } from '../GenericBusModel.js';

spec.create = (o) => new GenericBusModel(spec, o); // replaced by the detailed model when it is ready
export default spec;
