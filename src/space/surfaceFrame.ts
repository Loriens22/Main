import * as THREE from 'three';
import { SolarSystem, helio } from '../render/SolarSystem';
import { BODIES } from '../data/bodies';
import { gmst } from './earthFrame';
import type { V3 } from './kepler';

/**
 * Body-fixed and local surface frames.
 *   inertial  — three equatorial axes (J2000), origin at the body centre (the SpaceZone frame)
 *   body-fixed — three axes: x = prime meridian, y = north pole, −z = 90° E (same as the renderer's texture lookup)
 *   local     — a landing site's tangent frame: X east, Y up, Z south; origin on the datum sphere under the site.
 *               The body centre is at (0, −R, 0); heights in surface zones include the sphere's curvature.
 */
export interface SurfaceSite {
  body: string;
  lat: number; // deg, planetocentric
  lon: number; // deg, east
  R: number; // datum radius (m)
  /** body-fixed unit basis of the local axes */
  east: THREE.Vector3;
  up: THREE.Vector3;
  south: THREE.Vector3;
}

export function makeSite(body: string, lat: number, lon: number): SurfaceSite {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  const up = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  const east = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
  const south = new THREE.Vector3().crossVectors(east, up);
  return { body, lat, lon, R: BODIES[body].radius, east, up, south };
}

/** Inertial → body-fixed rotation at Earth time t (tidally locked moons face their parent). */
export function bodyRot(id: string, t: number): THREE.Matrix3 {
  const def = BODIES[id];
  let lock: THREE.Vector3 | undefined;
  if (def?.parent && def.parent !== 'sun' && def.circ) {
    const s = helio(id, t).r, p = helio(def.parent, t).r;
    lock = new THREE.Vector3(p[0] - s[0], p[1] - s[1], p[2] - s[2]).normalize();
  }
  return SolarSystem.bodyFrame(id, t, gmst(t), lock).rot;
}

/** Body angular velocity (rad/s) in the inertial frame, from the rotation's time derivative. */
export function bodyOmega(id: string, t: number): THREE.Vector3 {
  const h = 20;
  const B0 = bodyRot(id, t - h).transpose(), B1 = bodyRot(id, t + h).transpose(), B = bodyRot(id, t); // B = body→inertial
  const d = B1.elements.map((v, i) => (v - B0.elements[i]) / (2 * h));
  const dB = new THREE.Matrix3().fromArray(d);
  const W = dB.multiply(B); // Ω = dB · Bᵀ  (B here is inertial→body, i.e. Bᵀ of body→inertial)
  const e = W.elements; // column-major: e[col*3+row]
  return new THREE.Vector3((e[5] - e[7]) / 2, (e[6] - e[2]) / 2, (e[1] - e[3]) / 2);
}

/** local → body-fixed position */
export function localToBF(s: SurfaceSite, p: V3, out = new THREE.Vector3()) {
  return out.copy(s.up).multiplyScalar(s.R + p[1]).addScaledVector(s.east, p[0]).addScaledVector(s.south, p[2]);
}

export function bfToLocal(s: SurfaceSite, b: THREE.Vector3): V3 {
  const d = b.clone().addScaledVector(s.up, -s.R);
  return [d.dot(s.east), d.dot(s.up), d.dot(s.south)];
}

/** local axes as a rotation matrix (columns east, up, south) mapping local → body-fixed */
export function siteMatrix(s: SurfaceSite) {
  return new THREE.Matrix4().makeBasis(s.east, s.up, s.south);
}

/** latitude/longitude (deg) of a local position */
export function localLatLon(s: SurfaceSite, p: V3) {
  const d = localToBF(s, p).normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))), lon: THREE.MathUtils.radToDeg(Math.atan2(-d.z, d.x)) };
}

export interface LocalState { p: V3; v: V3; q: THREE.Quaternion }
export interface InertialState { r: V3; v: V3; q: THREE.Quaternion }

/** Inertial state (relative to the body centre) → local site frame (velocity relative to the rotating surface). */
export function inertialToLocal(s: SurfaceSite, t: number, r: V3, v: V3, q: THREE.Quaternion): LocalState {
  const Rm = bodyRot(s.body, t);
  const w = bodyOmega(s.body, t);
  const R = new THREE.Vector3(...r);
  const vRel = new THREE.Vector3(...v).sub(new THREE.Vector3().crossVectors(w, R));
  const pb = R.applyMatrix3(Rm);
  const vb = vRel.applyMatrix3(Rm);
  const M = siteMatrix(s);
  const Mt = M.clone().transpose();
  const R4 = new THREE.Matrix4().setFromMatrix3(Rm);
  const qL = new THREE.Quaternion().setFromRotationMatrix(Mt.multiply(R4).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)));
  return { p: bfToLocal(s, pb), v: [vb.dot(s.east), vb.dot(s.up), vb.dot(s.south)], q: qL };
}

export function localToInertial(s: SurfaceSite, t: number, p: V3, v: V3, q: THREE.Quaternion): InertialState {
  const Rt = bodyRot(s.body, t).transpose(); // body → inertial
  const w = bodyOmega(s.body, t);
  const pb = localToBF(s, p);
  const vb = new THREE.Vector3().addScaledVector(s.east, v[0]).addScaledVector(s.up, v[1]).addScaledVector(s.south, v[2]);
  const r = pb.applyMatrix3(Rt);
  const vi = vb.applyMatrix3(Rt).add(new THREE.Vector3().crossVectors(w, r));
  const M = siteMatrix(s);
  const R4 = new THREE.Matrix4().setFromMatrix3(Rt);
  const qI = new THREE.Quaternion().setFromRotationMatrix(R4.multiply(M).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)));
  return { r: r.toArray() as V3, v: vi.toArray() as V3, q: qI };
}

/** Local → inertial rotation (for the far-layer camera) at time t. */
export function localToInertialRot(s: SurfaceSite, t: number) {
  const Rt = bodyRot(s.body, t).transpose();
  return new THREE.Matrix4().setFromMatrix3(Rt).multiply(siteMatrix(s));
}

/** Body angular velocity in local axes. */
export function localOmega(s: SurfaceSite, t: number) {
  const w = bodyOmega(s.body, t).applyMatrix3(bodyRot(s.body, t));
  return new THREE.Vector3(w.dot(s.east), w.dot(s.up), w.dot(s.south));
}
