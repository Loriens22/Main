/**
 * Latitude/longitude as "12.34°N 56.78°W". The hemisphere comes from the rounded value, so a latitude a hair below
 * zero prints "0.00°N", not "0.00°S".
 */
export function fmtLatLon(lat: number, lon: number, digits = 2) {
  const f = (v: number, pos: string, neg: string) => {
    const r = Number(v.toFixed(digits));
    const z = r === 0 ? 0 : r; // drops −0
    return `${Math.abs(z).toFixed(digits)}°${z >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}
