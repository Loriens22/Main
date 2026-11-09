import { Zone } from '../Zone';
// TEMPORARY STUB
export default class MillerZone extends Zone {
  readonly id = 'space' as any;
  async load() {}
  update() {}
  spawn() {}
  describe() { return { name: 'MillerZone', sub: '' }; }
}
