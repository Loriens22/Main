import type { EarthContent } from './EarthContent';
// TEMPORARY STUB — replaced by the full implementation
export class EarthPeople {
  constructor(readonly content: EarthContent) {}
  async load() {}
  update(_dt: number, _dtEarth: number) {}
}
