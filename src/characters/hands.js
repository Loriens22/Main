// Procedural hands (SDF on a fine grid): palm, four articulated fingers in a
// relaxed curl, thumb, knuckles and nails. Built in a canonical frame (wrist
// at origin, fingers along -Y, palm facing -X, thumb toward +Z) and then
// rotated into the A-pose bind orientation of each arm.

import { B, A_POSE } from './rig.js';

export function buildHandSDF(sdf, P, J, side, spec) {
  const S = side > 0 ? 'L' : 'R';
  const wrist = J['hand' + S];
  const hsz = P.hand / 0.19;
  const bulk = 1 + P.fat * 0.25 + P.muscle * 0.1 - P.female * 0.08;
  // Canonical -> bind pose: rotate about Z by side * A_POSE, mirror X for the right hand.
  const ca = Math.cos(side * A_POSE), sa = Math.sin(side * A_POSE);
  const T = (x, y, z) => {
    const mx = x * side; // mirror (palm faces the body on both sides)
    const rx = mx * ca - y * sa, ry = mx * sa + y * ca;
    return [wrist.x + rx * hsz, wrist.y + ry * hsz, wrist.z + z * hsz];
  };
  const R = (v) => v * hsz;
  const hand = B['hand' + S], fore = B['fore' + S];
  const skin = { mat: 'skin', bone: hand };
  const glove = spec.outfit && spec.outfit.gloves;
  const mat = glove ? 'glove' : 'skin';
  // Wrist blending into the forearm.
  sdf.roundCone(T(0, 0.035, 0), T(0, -0.012, 0), R(0.024 * bulk), R(0.025 * bulk), { mat, op: 'union', bone: hand, bones: [[fore, 0.55], [hand, 0.45]] });
  // Palm.
  sdf.box(T(-0.001, -0.052, 0.002), [R(0.0125 * bulk), R(0.043), R(0.039)], { mat, op: 'smooth', k: R(0.014), bone: hand, round: R(0.011) });
  sdf.ellipsoid(T(-0.008, -0.03, 0.022), [R(0.012), R(0.024), R(0.016)], { mat, op: 'smooth', k: R(0.012), bone: hand }); // thenar pad
  // Fingers: [z offset, length, radius, curl].
  const fingers = [[0.027, 0.074, 0.0094, 0.28], [0.009, 0.082, 0.0097, 0.32], [-0.0095, 0.077, 0.0092, 0.36], [-0.0265, 0.061, 0.0082, 0.42]];
  for (const [fz, len, rad, curl] of fingers) {
    let x = 0.001, y = -0.09, ang = 0.06;
    const segs = [0.45, 0.3, 0.25];
    let rr = rad * bulk;
    let first = true;
    for (let i = 0; i < 3; i++) {
      ang += curl * (i === 0 ? 0.6 : 1.0);
      const l = len * segs[i];
      const nx = x - Math.sin(ang) * l, ny = y - Math.cos(ang) * l;
      const r2 = rr * (i === 2 ? 0.78 : 0.9);
      sdf.roundCone(T(x, y, fz * (first ? 1 : 0.98)), T(nx, ny, fz * 0.97), R(rr), R(r2), { mat, op: 'smooth', k: R(first ? 0.009 : 0.004), bone: hand });
      if (i === 2 && !glove) {
        // Nail.
        sdf.box(T(nx + Math.cos(ang) * r2 * 0.55 + 0.002, ny + 0.005, fz * 0.97), [R(0.0022), R(0.0055), R(r2 * 0.7)], { mat: 'nail', op: 'union', bone: hand, round: R(0.0015), rot: [0, 0, -side * ang] });
      }
      x = nx; y = ny; rr = r2; first = false;
    }
    // Knuckle.
    sdf.sphere(T(0.003, -0.09, fz), R(rad * 1.05 * bulk), { mat, op: 'smooth', k: R(0.006), bone: hand });
  }
  // Thumb: from the base of the palm, forward (+Z) and slightly toward the palm.
  const tb = [[-0.006, -0.018, 0.03], [-0.016, -0.045, 0.052], [-0.024, -0.066, 0.064], [-0.029, -0.083, 0.07]];
  const tr = [0.014, 0.0115, 0.0102, 0.0085];
  for (let i = 0; i < 3; i++) {
    sdf.roundCone(T(...tb[i]), T(...tb[i + 1]), R(tr[i] * bulk), R(tr[i + 1] * bulk), { mat, op: 'smooth', k: R(i === 0 ? 0.012 : 0.004), bone: hand });
  }
  if (!glove) sdf.box(T(tb[3][0] - 0.003, tb[3][1] + 0.004, tb[3][2] + 0.004), [R(0.0035), R(0.0055), R(0.005)], { mat: 'nail', op: 'union', bone: hand, round: R(0.0015) });
  return { wrist };
}
