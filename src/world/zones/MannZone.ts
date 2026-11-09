import { Zone } from '../Zone';
// TEMPORARY STUB
export default class MannZone extends Zone {
  readonly id = 'space' as any;
  async load() {}
  update() {}
  spawn() {}
  describe() { return { name: 'MannZone', sub: '' }; }
}
