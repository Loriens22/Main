// Yutong ZK6126HGA: spec + model factory (see ../README.md for the model interface).
import spec from './spec.js';
import { GenericBusModel } from '../GenericBusModel.js';
import { YutongModel } from './YutongModel.js';

// the detailed model; if it fails to build the generic placeholder keeps the vehicle playable
spec.create = (o) => {
  try {
    return new YutongModel(spec, o);
  } catch (e) {
    console.error('[yutong] detailed model failed', e);
    return new GenericBusModel(spec, o);
  }
};
export default spec;
