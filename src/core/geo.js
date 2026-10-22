// Local tangent-plane projection. MUST match tools/geo.py.
// World axes: x = east, y = up, z = south (north is -z).
export const ORIGIN_LAT = 42.669;
export const ORIGIN_LON = 23.352;
const phi = (ORIGIN_LAT * Math.PI) / 180;
export const M_PER_DEG_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
export const M_PER_DEG_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);

export function toXZ(lon, lat) {
  return [(lon - ORIGIN_LON) * M_PER_DEG_LON, -(lat - ORIGIN_LAT) * M_PER_DEG_LAT];
}

export function toLonLat(x, z) {
  return [ORIGIN_LON + x / M_PER_DEG_LON, ORIGIN_LAT - z / M_PER_DEG_LAT];
}
