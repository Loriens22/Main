import * as THREE from 'three';
import { J2000_MS } from '../core/MissionClock';

/** Farm / NASA site coordinates (eastern Colorado plains, Front Range to the west/north). */
export const SITE = { lat: 39.2, lon: -104.6 };

/**
 * Solar direction in local east-up-south coordinates (three: +X east, +Y up, +Z south) for an Earth
 * time (s since J2000), using the NOAA solar position approximation (declination + equation of time).
 */
export function sunDirection(earthTime: number, latDeg = SITE.lat, lonDeg = SITE.lon, out = new THREE.Vector3()): THREE.Vector3 {
  const d = new Date(J2000_MS + earthTime * 1000);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = (d.getTime() - start) / 86400000; // fractional day of year
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqTime + 4 * lonDeg; // true solar time, minutes
  const ha = ((tst / 4 - 180) * Math.PI) / 180; // hour angle
  const lat = (latDeg * Math.PI) / 180;
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const el = Math.PI / 2 - zen;
  // azimuth from north, clockwise
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen) || 1e-9))));
  az = ha > 0 ? (az + Math.PI) % (2 * Math.PI) : (3 * Math.PI - az) % (2 * Math.PI);
  // north = -Z, east = +X
  const ce = Math.cos(el);
  return out.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce).normalize();
}

/** Local solar time (hours) at the site. */
export function localSolarHours(earthTime: number, lonDeg = SITE.lon): number {
  const d = new Date(J2000_MS + earthTime * 1000);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + lonDeg / 15;
  return (h + 24) % 24;
}
