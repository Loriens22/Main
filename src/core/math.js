export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};
/** Exponential approach factor that is frame-rate independent. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Forward unit vector (x,z) for a yaw angle; yaw 0 faces north (-z), positive yaw turns left. */
export const fwdX = (yaw) => -Math.sin(yaw);
export const fwdZ = (yaw) => -Math.cos(yaw);
/** Yaw angle for a direction vector (x,z). */
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
