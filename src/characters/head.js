// ---------------------------------------------------------------------------
// Procedural head: an SDF sculpt meshed on a fine (2.5-4.5 mm) grid.
//
// Anatomy is built from ~40 primitives placed from real anthropometric
// measurements of an adult head (eye line at mid-height, interpupillary
// distance 64 mm, nose tip ~12 cm in front of the ear canal...), scaled by
// the character's head size and perturbed by face-shape parameters (jaw
// width, chin projection, cheekbones, brow ridge, eye size/spacing/tilt, nose
// length/width/bridge, lip fullness, ear size...), so every face is unique.
// Eye sockets are carved with smooth subtraction and refilled with eyelid
// shells that have an almond-shaped slit, through which separate eyeball
// meshes are visible. Hair and facial hair are extra SDF shells (with curly
// / straight displacement) clipped by a hairline surface.
// ---------------------------------------------------------------------------

import { B } from './rig.js';

export const HAIR_STYLES = ['short', 'curly', 'buzz', 'bald', 'long', 'wavy', 'ponytail', 'bun', 'afro', 'mohawk', 'bob', 'spiky', 'slicked', 'receding'];

export function randomFace(rng, spec) {
  const fem = spec.sex === 'female' ? 1 : 0;
  const eth = spec.ethnicity || '';
  const f = {
    jawW: rng.gauss(fem ? 0.93 : 1.05, 0.06, 0.8, 1.2),
    chin: rng.gauss(fem ? -0.1 : 0.15, 0.35, -1, 1),
    chinW: rng.gauss(fem ? 0.9 : 1.05, 0.08, 0.75, 1.25),
    cheek: rng.gauss(1, 0.1, 0.75, 1.3),
    brow: rng.gauss(fem ? 0.55 : 1.15, 0.15, 0.3, 1.5),
    eyeSize: rng.gauss(fem ? 1.04 : 1, 0.05, 0.88, 1.15),
    eyeSpace: rng.gauss(1, 0.035, 0.92, 1.08),
    eyeTilt: rng.gauss(0.04, 0.05, -0.08, 0.2),
    eyeOpen: rng.gauss(1, 0.08, 0.75, 1.2),
    noseLen: rng.gauss(fem ? 0.95 : 1.03, 0.07, 0.82, 1.2),
    noseW: rng.gauss(fem ? 0.93 : 1.02, 0.09, 0.8, 1.35),
    bridge: rng.gauss(1, 0.15, 0.55, 1.4),
    noseTip: rng.gauss(1, 0.1, 0.8, 1.25),
    lips: rng.gauss(fem ? 1.12 : 0.98, 0.12, 0.75, 1.45),
    lipW: rng.gauss(1, 0.06, 0.88, 1.12),
    ears: rng.gauss(1, 0.07, 0.85, 1.2),
    earOut: rng.gauss(0.3, 0.2, 0, 1),
    faceLen: rng.gauss(1, 0.035, 0.92, 1.08),
    cranW: rng.gauss(1, 0.03, 0.93, 1.07),
    forehead: rng.gauss(1, 0.06, 0.88, 1.14),
  };
  // Broad population tendencies (only when the prompt asks for them).
  if (/east asian|asian|chinese|japanese|korean/.test(eth)) { f.eyeOpen *= 0.85; f.eyeTilt += 0.06; f.bridge *= 0.7; f.noseW *= 1.05; f.cheek *= 1.08; }
  if (/african|black/.test(eth)) { f.noseW *= 1.18; f.lips *= 1.2; f.bridge *= 0.85; }
  if (/south asian|indian/.test(eth)) { f.eyeSize *= 1.04; f.noseLen *= 1.03; }
  if (/middle eastern|arab/.test(eth)) { f.noseLen *= 1.08; f.bridge *= 1.2; }
  if (/european|white|caucasian/.test(eth)) { f.bridge *= 1.1; f.noseW *= 0.95; }
  if (spec.elf) { f.ears *= 1.1; f.jawW *= 0.92; f.cheek *= 1.1; }
  if (spec.orc) { f.jawW *= 1.2; f.brow *= 1.5; f.noseW *= 1.3; f.chin += 0.3; }
  Object.assign(f, spec.face || {});
  return f;
}

// Plane helper: keeps the side opposite to `normal` (normal points toward the removed side).
function planeThrough(point, normal) {
  const l = Math.hypot(normal[0], normal[1], normal[2]);
  const n = [normal[0] / l, normal[1] / l, normal[2] / l];
  return [n, n[0] * point[0] + n[1] * point[1] + n[2] * point[2]];
}

// Build the head SDF. Returns metadata for eyes, lids, mouth and hair extras.
export function buildHeadSDF(sdf, P, J, spec, face, noise, neckPart) {
  const hs = P.headH / 0.232;
  const O = [0, J.eyes.y, J.head.z + 0.004 * hs];
  const p = (x, y, z) => [O[0] + x * hs, O[1] + y * hs, O[2] + z * hs];
  const r = (v) => v * hs;
  const fem = P.female;
  const fat = P.fat;
  const age = P.age;
  const F = face;
  const skin = { mat: 'skin', bone: B.head };
  const hair = spec.hair || { style: 'short' };
  const style = hair.style || 'short';

  // ---- Skull & face masses ----
  sdf.ellipsoid(p(0, 0.028 * F.forehead, -0.012), [r(0.076 * F.cranW), r(0.098 * F.forehead), r(0.1)], { ...skin, op: 'union' });
  sdf.ellipsoid(p(0, 0.034, 0.034), [r(0.068 * F.cranW), r(0.07 * F.forehead), r(0.07)], { ...skin, op: 'smooth', k: r(0.03) });
  sdf.ellipsoid(p(0, -0.034 * F.faceLen, 0.042), [r(0.066 * F.cheek * (1 + fat * 0.12)), r(0.066 * F.faceLen), r(0.058)], { ...skin, op: 'smooth', k: r(0.035) });
  for (const sd of [1, -1]) {
    sdf.ellipsoid(p(sd * 0.047 * F.cheek, -0.013, 0.061), [r(0.025), r(0.017), r(0.023)], { ...skin, op: 'smooth', k: r(0.022) });
    // Hollow below the cheekbone (less visible on fuller faces).
    if (fat < 0.55) sdf.sphere(p(sd * 0.058, -0.046, 0.046), r(0.008), { op: 'smoothSub', k: r(0.024 + fat * 0.02) });
    // Cheek fat / jowls with body fat and age.
    if (fat > 0.35 || age > 55) sdf.sphere(p(sd * 0.045, -0.06 - (age > 55 ? 0.01 : 0), 0.045), r(0.024 + fat * 0.012), { ...skin, op: 'smooth', k: r(0.03) });
  }
  // Jaw line (gonion -> chin) and chin.
  const jw = F.jawW * (1 + fat * 0.1) * 1.08;
  const chinZ = 0.08 + F.chin * 0.012;
  const chinY = -0.103 * F.faceLen;
  for (const sd of [1, -1]) {
    sdf.capsule(p(sd * 0.05 * jw, -0.072 * F.faceLen, -0.004), p(sd * 0.02 * F.chinW, chinY + 0.001, chinZ - 0.006), r(fem ? 0.017 : 0.021), { ...skin, op: 'smooth', k: r(0.032) });
  }
  sdf.ellipsoid(p(0, chinY + 0.002, chinZ), [r(0.024 * F.chinW), r(0.019), r(0.017)], { ...skin, op: 'smooth', k: r(0.02) });
  if (fat > 0.45) sdf.ellipsoid(p(0, chinY - 0.012, 0.045), [r(0.04), r(0.02 + fat * 0.012), r(0.035)], { ...skin, op: 'smooth', k: r(0.025) }); // double chin
  // Brow ridge.
  const bz = 0.084 + F.brow * 0.005;
  sdf.capsule(p(-0.051, 0.02, 0.071), p(0, 0.024, bz + 0.004), r(0.009 + F.brow * 0.0035), { ...skin, op: 'smooth', k: r(0.02) });
  sdf.capsule(p(0, 0.024, bz + 0.004), p(0.051, 0.02, 0.071), r(0.009 + F.brow * 0.0035), { ...skin, op: 'smooth', k: r(0.02) });

  // ---- Eyes: sockets + eyelid shells with almond slits ----
  const ex = 0.032 * F.eyeSpace, ey = 0.0, ez = 0.066;
  const eyeR = 0.0118 * F.eyeSize;
  // Shallow socket carve, refilled by an eyelid shell; the almond slit is cut
  // afterwards (root level) so smooth blending can never close it.
  for (const sd of [1, -1]) sdf.sphere(p(sd * ex, 0.003, 0.078), r(0.0145 * F.eyeSize), { op: 'smoothSub', k: r(0.007) });
  for (const sd of [1, -1]) sdf.sphere(p(sd * ex, ey, ez), r(eyeR + 0.0026), { ...skin, op: 'smooth', k: r(0.004), priority: 1 });
  // Upper-lid fold: a soft ridge just above the opening.
  for (const sd of [1, -1]) sdf.capsule(p(sd * (ex - 0.011), 0.0075, ez + 0.0115), p(sd * (ex + 0.011), 0.0082, ez + 0.0105), r(0.0022), { ...skin, op: 'smooth', k: r(0.003) });
  for (const sd of [1, -1]) {
    const tilt = F.eyeTilt * sd;
    sdf.ellipsoid(p(sd * ex + sd * 0.001, ey - 0.0006, ez + 0.022), [r(0.0152 * F.eyeSize), r(0.0049 * F.eyeSize * F.eyeOpen), r(0.03)], { op: 'smoothSub', k: r(0.0009), rot: [0, 0, tilt] });
  }

  // ---- Nose ----
  const nl = F.noseLen, nw = F.noseW, nb = F.bridge, nt = F.noseTip;
  sdf.roundCone(p(0, 0.014, 0.089 + nb * 0.005), p(0, -0.032 * nl, 0.111 + nb * 0.004 + nt * 0.003), r(0.0082 * (0.8 + nw * 0.2)), r(0.0085 * nw), { ...skin, op: 'smooth', k: r(0.011) });
  sdf.sphere(p(0, -0.036 * nl, 0.113 + nt * 0.004), r(0.0105 * nt * (0.85 + nw * 0.15)), { ...skin, op: 'smooth', k: r(0.009) });
  for (const sd of [1, -1]) sdf.sphere(p(sd * 0.0128 * nw, -0.0415 * nl, 0.1015), r(0.0078 * (0.85 + nw * 0.15)), { ...skin, op: 'smooth', k: r(0.008) });
  for (const sd of [1, -1]) sdf.ellipsoid(p(sd * 0.0072 * nw, -0.0465 * nl, 0.1045), [r(0.0042 * nw), r(0.0026), r(0.0052)], { op: 'smoothSub', k: r(0.0022) });

  // ---- Mouth ----
  const lf = F.lips, lw = F.lipW;
  const mouthY = -0.0705 * F.faceLen;
  const mouthZ = 0.1 + (nt - 1) * 0.004;
  sdf.group({ op: 'smooth', k: r(0.006), defaults: { mat: 'lips', bone: B.head } }, (g) => {
    g.capsule(p(-0.022 * lw, mouthY + 0.0042, mouthZ - 0.009), p(0, mouthY + 0.0055, mouthZ + 0.001), r(0.0043 * lf), { mat: 'lips', op: 'union', priority: 1 });
    g.capsule(p(0, mouthY + 0.0055, mouthZ + 0.001), p(0.022 * lw, mouthY + 0.0042, mouthZ - 0.009), r(0.0043 * lf), { mat: 'lips', op: 'smooth', k: r(0.004), priority: 1 });
    g.capsule(p(-0.019 * lw, mouthY - 0.0052, mouthZ - 0.009), p(0, mouthY - 0.0062 * lf, mouthZ + 0.0005), r(0.0051 * lf), { mat: 'lips', op: 'smooth', k: r(0.004), priority: 1 });
    g.capsule(p(0, mouthY - 0.0062 * lf, mouthZ + 0.0005), p(0.019 * lw, mouthY - 0.0052, mouthZ - 0.009), r(0.0051 * lf), { mat: 'lips', op: 'smooth', k: r(0.004), priority: 1 });
  });
  sdf.ellipsoid(p(0, mouthY, mouthZ + 0.002), [r(0.023 * lw), r(0.0008), r(0.012)], { op: 'smoothSub', k: r(0.001) });
  sdf.capsule(p(0, mouthY + 0.016, mouthZ + 0.004), p(0, mouthY + 0.0085, mouthZ + 0.004), r(0.0016), { op: 'smoothSub', k: r(0.002) });
  for (const sd of [1, -1]) sdf.sphere(p(sd * 0.0245 * lw, mouthY, mouthZ - 0.011), r(0.0024), { op: 'smoothSub', k: r(0.003) });
  sdf.capsule(p(-0.013, mouthY - 0.0155, mouthZ - 0.002), p(0.013, mouthY - 0.0155, mouthZ - 0.002), r(0.0017), { op: 'smoothSub', k: r(0.005) });
  // Nasolabial folds with age.
  if (age > 40) for (const sd of [1, -1]) sdf.capsule(p(sd * 0.018, -0.045, 0.098), p(sd * 0.027, -0.068, 0.088), r(0.0015 + (age - 40) / 40 * 0.0012), { op: 'smoothSub', k: r(0.004) });

  // ---- Ears ----
  const es = F.ears;
  for (const sd of [1, -1]) {
    const ang = sd * (0.28 + F.earOut * 0.3);
    sdf.group({ op: 'smooth', k: r(0.006), defaults: { ...skin } }, (g) => {
      g.ellipsoid(p(sd * 0.0735, -0.008, -0.009), [r(0.0085), r(0.031 * es), r(0.0195 * es)], { ...skin, op: 'union', rot: [0, ang, 0], priority: 1 });
      g.sphere(p(sd * 0.0745, -0.035 * es, -0.004), r(0.0085 * es), { ...skin, op: 'smooth', k: r(0.006) });
      if (spec.elf) g.roundCone(p(sd * 0.074, 0.012, -0.016), p(sd * 0.086, 0.052, -0.034), r(0.009), r(0.0025), { ...skin, op: 'smooth', k: r(0.008) });
      g.ellipsoid(p(sd * 0.0795, -0.006, -0.006), [r(0.0052), r(0.019 * es), r(0.0115 * es)], { op: 'smoothSub', k: r(0.003), rot: [0, ang, 0] });
      g.sphere(p(sd * 0.0715, -0.013, 0.0085), r(0.0042), { ...skin, op: 'smooth', k: r(0.003) });
    });
  }

  // ---- Neck (covers the body's neck; cut inside the collar) ----
  if (neckPart) {
    sdf.roundCone(neckPart.a, neckPart.b, neckPart.ra + neckPart.inset, neckPart.rb + neckPart.inset, { mat: 'skin', op: 'smooth', k: r(0.035), bone: B.neck, bones: [[B.neck, 0.8], [B.chest, 0.2]] });
    sdf.roundCone(p(0, -0.07, -0.03), neckPart.b, r(0.05) * (1 + fat * 0.3), neckPart.rb + neckPart.inset, { mat: 'skin', op: 'smooth', k: r(0.03), bone: B.neck });
    if (!fem && age > 14) sdf.ellipsoid([0, J.chin.y - 0.035 * hs, neckPart.b[2] + neckPart.rb * 0.85], [r(0.009), r(0.012), r(0.008)], { mat: 'skin', op: 'smooth', k: r(0.01), bone: B.neck });
  }

  // ---- Hair ----
  const extras = { curls: false, cards: false };
  const hairT = { short: 0.009, curly: 0.013, buzz: 0.0028, bald: 0, receding: 0.007, long: 0.011, wavy: 0.012, ponytail: 0.007, bun: 0.008, afro: 0.012, mohawk: 0.002, bob: 0.011, spiky: 0.01, slicked: 0.006 }[style] ?? 0.009;
  const covered = spec.outfit && spec.outfit.hat && ['cap', 'beanie', 'helmet', 'tophat', 'cowboy', 'crown', 'wizard', 'chef', 'police', 'hardhat'].includes(spec.outfit.hat);
  if (hairT > 0 && style !== 'bald') {
    const curlDisp = (amp, freq) => (x, y, z) => amp * (0.55 - noise.worley3(x * freq, y * freq, z * freq)) + amp * 0.3 * noise.n3(x * freq * 0.35, y * freq * 0.35, z * freq * 0.35);
    const strandDisp = (amp) => (x, y, z) => amp * (Math.sin(Math.atan2(x - O[0], z - O[2]) * 90 + noise.n3(x * 30, y * 30, z * 30) * 3) * 0.5 + noise.n3(x * 60, y * 20, z * 60) * 0.5);
    const baseDisp = style === 'curly' || style === 'afro' ? curlDisp(r(0.0042), 70 / hs) : style === 'wavy' ? strandDisp(r(0.0016)) : strandDisp(r(0.0011));
    // Hair is shorter at the sides/back (tapered) and fuller on top; big irregular lumps break the silhouette.
    const taper = style === 'curly' || style === 'short' || style === 'spiky' || style === 'slicked' || style === 'receding';
    const disp = taper ? (x, y, z) => {
      const top = Math.min(1, Math.max(0, (y - O[1] - 0.015 * hs) / (0.07 * hs)));
      const lump = style === 'curly' ? noise.n3(x * 26 / hs, y * 26 / hs, z * 26 / hs) * r(0.004) : 0;
      return baseDisp(x, y, z) * (0.45 + 0.55 * top) - r(hairT * 0.55) * (1 - top) + lump * top;
    } : baseDisp;
    sdf.group({ op: 'union', defaults: { mat: 'hair', bone: B.head } }, (g) => {
      // Main shell over the cranium (+ volume on top).
      const vol = style === 'curly' ? 1.18 : style === 'spiky' ? 1.1 : style === 'slicked' ? 0.95 : style === 'buzz' || style === 'mohawk' ? 0.98 : 1.04;
      g.ellipsoid(p(0, 0.028 * F.forehead, -0.012), [r(0.076 * F.cranW + hairT), r(0.098 * F.forehead + hairT * vol), r(0.1 + hairT)], { mat: 'hair', op: 'union', disp, dispAmp: r(0.006), priority: 2 });
      g.ellipsoid(p(0, 0.036, 0.03), [r(0.068 * F.cranW + hairT), r(0.07 * F.forehead + hairT * vol), r(0.07 + hairT * 0.8)], { mat: 'hair', op: 'smooth', k: r(0.03), disp, dispAmp: r(0.006), priority: 2 });
      if (style === 'curly' && !covered) g.ellipsoid(p(0, 0.078, 0.0), [r(0.066), r(0.058), r(0.088)], { mat: 'hair', op: 'smooth', k: r(0.035), disp, dispAmp: r(0.008), priority: 2 });
      if (style === 'afro' && !covered) g.ellipsoid(p(0, 0.05, -0.015), [r(0.135), r(0.13), r(0.14)], { mat: 'hair', op: 'smooth', k: r(0.04), disp, dispAmp: r(0.006), priority: 2 });
      if ((style === 'long' || style === 'wavy') && !covered || style === 'long' || style === 'wavy') {
        const L = hair.length === 'very long' ? 0.42 : hair.length === 'medium' ? 0.2 : 0.3;
        g.roundCone(p(0, 0.02, -0.075), p(0, -L, -0.09), r(0.085), r(0.07), { mat: 'hair', op: 'smooth', k: r(0.04), disp, dispAmp: r(0.004), priority: 2 });
        for (const sd of [1, -1]) g.roundCone(p(sd * 0.068, 0.0, -0.03), p(sd * 0.08, -L * 0.8, -0.05), r(0.03), r(0.025), { mat: 'hair', op: 'smooth', k: r(0.03), disp, dispAmp: r(0.004), priority: 2 });
      }
      if (style === 'bob') {
        g.cylinder(p(0, -0.035, -0.015), r(0.095), r(0.055), { mat: 'hair', op: 'smooth', k: r(0.035), round: r(0.03), disp, dispAmp: r(0.004), priority: 2 });
      }
      if (style === 'mohawk') {
        g.box(p(0, 0.1, -0.02), [r(0.016), r(0.05), r(0.105)], { mat: 'hair', op: 'union', round: r(0.012), disp: (x, y, z) => r(0.012) * Math.max(0, Math.sin((z - O[2]) / hs * 90)), dispAmp: r(0.014), priority: 2 });
      }
      if (style === 'spiky') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2, rr = 0.045;
          g.roundCone(p(Math.cos(a) * rr * 0.8, 0.09, Math.sin(a) * rr - 0.01), p(Math.cos(a) * rr * 1.4, 0.135, Math.sin(a) * rr * 1.5 - 0.01), r(0.018), r(0.003), { mat: 'hair', op: 'smooth', k: r(0.01), priority: 2 });
        }
      }
      // Hairline: remove the face & lower head. Normal points to the removed side.
      const front = style === 'receding' ? 0.078 : style === 'slicked' ? 0.064 : 0.062;
      const [n1, d1] = planeThrough(p(0, front, 0.09), [0, -1, style === 'long' || style === 'wavy' || style === 'bob' ? 0.55 : 0.95]);
      g.plane(n1, d1, { op: style === 'long' || style === 'wavy' || style === 'bob' || style === 'ponytail' ? 'inter' : 'smoothInter', k: r(0.004) });
      // Keep the face clear for long styles.
      if (style === 'long' || style === 'wavy' || style === 'bob') {
        g.ellipsoid(p(0, -0.03, 0.08), [r(0.056), r(0.1), r(0.06)], { op: 'smoothSub', k: r(0.01) });
      }
      // Ears stay uncovered (except long styles which fall over them).
      if (!(style === 'long' || style === 'wavy' || style === 'bob' || style === 'afro')) {
        for (const sd of [1, -1]) g.sphere(p(sd * 0.078, -0.012, -0.004), r(0.03), { op: 'smoothSub', k: r(0.008) });
      }
      if (style === 'receding' || (age > 60 && hair.style === 'short' && hair.receding !== false)) {
        g.ellipsoid(p(0, 0.09, 0.03), [r(0.05), r(0.04), r(0.06)], { op: 'smoothSub', k: r(0.02) });
      }
      if (style === 'mohawk') for (const sd of [1, -1]) g.plane([sd, 0, 0], r(0.02), { op: 'inter' });
      if (covered) g.plane(planeThrough(p(0, 0.02, 0), [0, 1, 0])[0], planeThrough(p(0, 0.02, 0), [0, 1, 0])[1], { op: 'inter' });
    });
    if (style === 'ponytail') {
      sdf.group({ op: 'union', defaults: { mat: 'hair', bone: B.head } }, (g) => {
        g.roundCone(p(0, 0.03, -0.1), p(0, -0.08, -0.14), r(0.026), r(0.022), { mat: 'hair', op: 'union', disp: strandDisp(r(0.0012)), dispAmp: r(0.002), priority: 2 });
        g.roundCone(p(0, -0.08, -0.14), p(0, -0.22, -0.125), r(0.022), r(0.008), { mat: 'hair', op: 'smooth', k: r(0.02), disp: strandDisp(r(0.0012)), dispAmp: r(0.002), priority: 2 });
      });
      sdf.torus(p(0, 0.028, -0.103), r(0.02), r(0.0045), { mat: 'accent', op: 'union', bone: B.head, rot: [1.2, 0, 0], priority: 3 });
    }
    if (style === 'bun') {
      sdf.sphere(p(0, 0.1, -0.075), r(0.042), { mat: 'hair', op: 'smooth', k: r(0.015), bone: B.head, disp: (x, y, z) => r(0.002) * Math.sin(Math.atan2(x - O[0], y - O[1] - 0.1 * hs) * 14), dispAmp: r(0.003), priority: 2 });
    }
  }

  // ---- Facial hair ----
  const fh = spec.facialHair || 'none';
  if (fh === 'beard' || fh === 'full' || fh === 'goatee' || fh === 'shortbeard') {
    const bt = fh === 'full' ? 0.014 : fh === 'shortbeard' ? 0.005 : 0.009;
    const curl = (x, y, z) => r(0.0022) * (0.55 - noise.worley3(x * 110 / hs, y * 110 / hs, z * 110 / hs));
    sdf.group({ op: 'union', defaults: { mat: 'hair', bone: B.head } }, (g) => {
      let f2 = true;
      if (fh !== 'goatee') {
        for (const sd of [1, -1]) {
          g.capsule(p(sd * 0.05 * jw, -0.076 * F.faceLen, -0.006), p(sd * 0.018 * F.chinW, chinY - 0.002, chinZ - 0.004), r((fem ? 0.016 : 0.0195) + bt), { mat: 'hair', op: f2 ? 'union' : 'smooth', k: r(0.03), disp: curl, dispAmp: r(0.003), priority: 2 });
          f2 = false;
          g.ellipsoid(p(sd * 0.042, -0.045, 0.05), [r(0.028 + bt), r(0.035 + bt), r(0.03 + bt)], { mat: 'hair', op: 'smooth', k: r(0.02), disp: curl, dispAmp: r(0.003), priority: 2 });
        }
      }
      g.ellipsoid(p(0, chinY + 0.002, chinZ), [r(0.026 * F.chinW + bt), r(0.021 + bt * 1.3), r(0.019 + bt)], { mat: 'hair', op: f2 ? 'union' : 'smooth', k: r(0.02), disp: curl, dispAmp: r(0.003), priority: 2 });
      // Mustache.
      g.capsule(p(-0.021, mouthY + 0.012, mouthZ - 0.004), p(0.021, mouthY + 0.012, mouthZ - 0.004), r(0.0055 + bt * 0.3), { mat: 'hair', op: 'smooth', k: r(0.008), disp: curl, dispAmp: r(0.003), priority: 2 });
      // Clip: only below the cheekbones, keep the lips clear.
      const [n1, d1] = planeThrough(p(0, -0.036, 0), [0, 1, -0.25]);
      g.plane(n1, d1, { op: 'smoothInter', k: r(0.006) });
      g.ellipsoid(p(0, mouthY, mouthZ + 0.004), [r(0.021 * lw), r(0.0075 * lf), r(0.02)], { op: 'smoothSub', k: r(0.003) });
      if (fh !== 'full') g.plane(...planeThrough(p(0, 0, -0.03), [0, 0, -1]), { op: 'inter' });
    });
  } else if (fh === 'mustache') {
    sdf.capsule(p(-0.022, mouthY + 0.0115, mouthZ - 0.003), p(0.022, mouthY + 0.0115, mouthZ - 0.003), r(0.0058), { mat: 'hair', op: 'smooth', k: r(0.006), bone: B.head, priority: 2, disp: (x, y, z) => r(0.0012) * noise.n3(x * 300, y * 300, z * 300), dispAmp: r(0.0015) });
  }
  // Orc tusks.
  if (spec.orc) for (const sd of [1, -1]) sdf.roundCone(p(sd * 0.016, mouthY - 0.008, mouthZ - 0.004), p(sd * 0.02, mouthY + 0.018, mouthZ + 0.006), r(0.004), r(0.0012), { mat: 'teeth', op: 'union', bone: B.head, priority: 3 });

  // Clip the neck bottom inside the collar.
  sdf.plane([0, -1, 0], -(J.neck.y - 0.028 * P.H), { op: 'inter' });

  return {
    O, hs,
    eyes: [1, -1].map((sd) => ({ pos: p(sd * ex, ey, ez), r: r(eyeR), side: sd, tilt: F.eyeTilt * sd, open: F.eyeOpen })),
    mouth: { pos: p(0, mouthY, mouthZ), width: r(0.024 * lw) },
    brows: [1, -1].map((sd) => [p(sd * 0.014, 0.019, 0.093 + F.brow * 0.003), p(sd * 0.032, 0.026, 0.09 + F.brow * 0.003), p(sd * 0.05, 0.021, 0.078 + F.brow * 0.002)]),
    beardZone: fh === 'stubble' || fh === 'beard' || fh === 'full' || fh === 'shortbeard' || fh === 'goatee',
    hairT, extras,
  };
}
