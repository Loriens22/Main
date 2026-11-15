import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { EarthMap, NASA, SILO_ALONG } from '../src/world/earth/EarthMap';

/** Facility-local coordinates: `along` the tunnel axis into the mountain, `lat` to the right, height above the portal floor. */
describe('NASA site', () => {
  const m = new EarthMap();
  const H = (along: number, lat: number) => {
    const x = NASA.portal.x + NASA.dir.x * along - NASA.dir.z * lat, z = NASA.portal.z + NASA.dir.z * along + NASA.dir.x * lat;
    return m.height(x, z) - m.nasaY;
  };

  test('rock cover over the underground halls', () => {
    // complex rooms and corridors (ceilings up to 8 m) and the assembly hall (18 m)
    for (let a = 16; a <= 290; a += 6) for (let l = -56; l <= 56; l += 8) expect(H(a, l)).toBeGreaterThan(a < 236 ? 12 : 22);
    // launch cavern around the silo (roof at 30 m)
    for (let a = 272; a <= 338; a += 6) for (let l = -34; l <= 34; l += 6) expect(H(a, l)).toBeGreaterThan(33);
  });

  test('silo cap is a level bench and the site file is current', () => {
    const top = m.siloY - m.nasaY;
    expect(top).toBeGreaterThan(45);
    for (const r of [0, 12, 24, 32]) expect(Math.abs(H(SILO_ALONG, r) - top)).toBeLessThan(0.6);
    const site = { nasaY: +m.nasaY.toFixed(3), siloTop: +top.toFixed(3), siloAlong: SILO_ALONG, gateAlong: -112, portal: NASA.portal, dir: NASA.dir, roadLength: +m.roadLength.toFixed(1) };
    writeFileSync(new URL('../shared/nasa_site.json', import.meta.url), JSON.stringify(site, null, 2) + '\n');
  });
});
