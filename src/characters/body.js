// ---------------------------------------------------------------------------
// Body + clothing as one signed distance field.
//
// The anatomical body is a set of named parts (ellipsoids / round cones)
// placed on the rig's joints and scaled by fat/muscle/sex/age. Clothing is
// modelled as *inflated copies* of the covered parts inside an SDF group:
// the group is clipped by planes (hems, cuffs, collar) and hard-unioned over
// the skin, so garment edges appear as real geometric steps. Low-frequency
// displacement adds cloth folds (waist wrinkles, knee creases, stacking at
// the ankles). Every primitive carries a material key and bone weights, so
// meshing produces a skinned, multi-material character in one pass.
// ---------------------------------------------------------------------------

import { B } from './rig.js';

const V = (v) => [v.x, v.y, v.z];
const lerp3 = (a, b, t) => [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];

// Create the anatomical parts list.
export function bodyParts(P, J) {
  const s = P.s, f = P.fat, m = P.muscle, fem = P.female;
  const parts = [];
  const add = (name, type, params, bone, extra = {}) => parts.push({ name, type, ...params, bone, ...extra });
  const hipY = J.thighL.y;
  // Torso.
  add('pelvis', 'ellipsoid', { c: [0, hipY + P.H * 0.012, -0.004 * P.H], r: [0.172 * s * (1 + 0.22 * f) * (1 + 0.1 * fem), 0.105 * s, 0.118 * s * (1 + 0.25 * f)] }, B.hips);
  for (const side of [1, -1]) {
    add(side > 0 ? 'buttL' : 'buttR', 'ellipsoid', { c: [side * 0.062 * s, hipY - 0.012 * P.H, -0.058 * s * (1 + 0.2 * f)], r: [0.075 * s * (1 + 0.25 * f), 0.085 * s, 0.07 * s * (1 + 0.3 * f + 0.15 * fem)] }, B.hips, { k: 0.05 * s });
  }
  add('abdomen', 'ellipsoid', { c: [0, J.spine.y, 0.004 * P.H], r: [0.14 * s * (1 + 0.45 * f) * (1 - 0.1 * fem), 0.115 * s, 0.1 * s * (1 + 0.6 * f)] }, B.spine, { k: 0.06 * s });
  if (f > 0.25) add('belly', 'ellipsoid', { c: [0, J.spine.y - 0.025 * s, 0.03 * s + 0.07 * s * f], r: [0.125 * s * (0.55 + f * 0.8), 0.105 * s * (0.65 + f * 0.5), 0.085 * s * (0.35 + f)] }, B.spine, { k: 0.07 * s });
  add('chest', 'ellipsoid', { c: [0, J.chest.y - 0.01 * s, -0.006 * P.H], r: [0.152 * s * (1 + 0.12 * m + 0.14 * f) * (1 - 0.07 * fem), 0.135 * s, 0.104 * s * (1 + 0.12 * m + 0.2 * f)] }, B.chest, { k: 0.07 * s });
  if (fem < 0.5) {
    for (const side of [1, -1]) add(side > 0 ? 'pecL' : 'pecR', 'ellipsoid', { c: [side * 0.062 * s, J.chest.y + 0.03 * s, 0.068 * s * (1 + 0.1 * f)], r: [0.07 * s, 0.05 * s, 0.035 * s * (0.6 + m * 0.8 + f * 0.4)] }, B.chest, { k: 0.04 * s });
  } else if (P.bust > 0) {
    for (const side of [1, -1]) add(side > 0 ? 'bustL' : 'bustR', 'sphere', { c: [side * 0.056 * s, J.chest.y - 0.012 * s, 0.07 * s * (1 + 0.1 * f)], r: 0.056 * s * (0.75 + P.bust * 0.35 + f * 0.25) }, B.chest, { k: 0.035 * s });
  }
  for (const side of [1, -1]) {
    add(side > 0 ? 'trapsL' : 'trapsR', 'capsule', { a: [0, J.neck.y - 0.005 * s, -0.03 * s], b: [side * 0.13 * s, J.armL.y - 0.03 * s, -0.022 * s], r: 0.044 * s * (1 + 0.25 * m + 0.1 * f) }, B.chest, { k: 0.06 * s });
  }
  // The body's neck sits 6 mm inside the (finer) head mesh's neck so the two never z-fight.
  const neckInset = 0.006;
  add('neck', 'roundCone', { a: [0, J.neck.y - 0.03 * s, -0.018 * s], b: [0, J.chin.y + 0.005 * s, -0.012 * s], ra: 0.052 * s * (1 + 0.25 * m + 0.35 * f) * (1 - 0.1 * fem) - neckInset, rb: 0.045 * s * (1 + 0.2 * f + 0.1 * m) * (1 - 0.1 * fem) - neckInset, inset: neckInset }, B.neck, { k: 0.04 * s, bones: [[B.neck, 0.7], [B.chest, 0.3]] });
  // Arms.
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const sh = J['arm' + S], el = J['fore' + S], wr = J['hand' + S];
    add('delt' + S, 'sphere', { c: [sh.x - side * 0.004 * s, sh.y - 0.016 * s, sh.z], r: 0.047 * s * (1 + 0.3 * m + 0.2 * f) }, B['arm' + S], { k: 0.05 * s, bones: [[B['arm' + S], 0.6], [B['clav' + S], 0.4]] });
    add('upperArm' + S, 'roundCone', { a: V(sh), b: V(el), ra: 0.048 * s * (1 + 0.38 * m + 0.45 * f), rb: 0.035 * s * (1 + 0.2 * m + 0.3 * f) }, B['arm' + S], { k: 0.04 * s });
    const fwd = [0, 0, 0.012 * s];
    const b0 = lerp3(sh, el, 0.3), b1 = lerp3(sh, el, 0.72);
    add('bicep' + S, 'roundCone', { a: [b0[0] + fwd[0], b0[1], b0[2] + fwd[2]], b: [b1[0] + fwd[0], b1[1], b1[2] + fwd[2]], ra: 0.036 * s * (1 + 0.5 * m), rb: 0.032 * s * (1 + 0.4 * m) }, B['arm' + S], { k: 0.025 * s });
    add('elbow' + S, 'sphere', { c: V(el), r: 0.034 * s * (1 + 0.2 * f) }, B['fore' + S], { k: 0.03 * s, bones: [[B['arm' + S], 0.5], [B['fore' + S], 0.5]] });
    add('forearm' + S, 'roundCone', { a: V(el), b: V(wr), ra: 0.04 * s * (1 + 0.3 * m + 0.3 * f), rb: 0.027 * s * (1 + 0.1 * f) }, B['fore' + S], { k: 0.03 * s });
    const f0 = lerp3(el, wr, 0.08), f1 = lerp3(el, wr, 0.45);
    add('foreBulge' + S, 'roundCone', { a: f0, b: f1, ra: 0.041 * s * (1 + 0.4 * m + 0.2 * f), rb: 0.034 * s * (1 + 0.2 * m) }, B['fore' + S], { k: 0.02 * s });
  }
  // Legs.
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R';
    const hp = J['thigh' + S], kn = J['shin' + S], an = J['foot' + S];
    const top = [hp.x * 0.8, hp.y + 0.04 * s, hp.z];
    add('thigh' + S, 'roundCone', { a: top, b: V(kn), ra: 0.088 * s * (1 + 0.35 * f + 0.18 * m) * (1 + 0.06 * fem), rb: 0.056 * s * (1 + 0.2 * f) }, B['thigh' + S], { k: 0.05 * s });
    add('knee' + S, 'sphere', { c: [kn.x, kn.y, kn.z + 0.006 * s], r: 0.05 * s * (1 + 0.18 * f) }, B['shin' + S], { k: 0.03 * s, bones: [[B['thigh' + S], 0.5], [B['shin' + S], 0.5]] });
    add('shin' + S, 'roundCone', { a: V(kn), b: V(an), ra: 0.05 * s * (1 + 0.25 * f + 0.1 * m), rb: 0.031 * s * (1 + 0.1 * f) }, B['shin' + S], { k: 0.03 * s });
    const c0 = lerp3(kn, an, 0.12), c1 = lerp3(kn, an, 0.55);
    add('calf' + S, 'roundCone', { a: [c0[0], c0[1], c0[2] - 0.02 * s], b: [c1[0], c1[1], c1[2] - 0.012 * s], ra: 0.05 * s * (1 + 0.3 * m + 0.2 * f), rb: 0.036 * s }, B['shin' + S], { k: 0.03 * s });
    // Bare foot.
    const toe = J['toe' + S], heel = J['heel' + S], tip = J['toeTip' + S];
    add('foot' + S, 'roundCone', { a: [heel.x, heel.y + 0.012 * s, heel.z], b: [toe.x, toe.y + 0.01 * s, toe.z], ra: 0.03 * s, rb: 0.026 * s }, B['foot' + S], { k: 0.02 * s });
    add('ankle' + S, 'sphere', { c: [an.x, an.y, an.z], r: 0.033 * s }, B['foot' + S], { k: 0.025 * s, bones: [[B['foot' + S], 0.6], [B['shin' + S], 0.4]] });
    add('toes' + S, 'roundCone', { a: [toe.x - side * 0.01 * s, toe.y + 0.008 * s, toe.z], b: [tip.x, tip.y + 0.006 * s, tip.z], ra: 0.028 * s, rb: 0.02 * s }, B['toe' + S], { k: 0.015 * s });
  }
  return parts;
}

// Emit a part into the SDF, optionally inflated (clothing).
function emit(sdf, p, inflate, opts) {
  const o = { k: opts.k ?? p.k ?? 0, op: opts.op || 'smooth', mat: opts.mat, bone: p.bone, bones: p.bones, disp: opts.disp, dispAmp: opts.dispAmp, priority: opts.priority || 0 };
  switch (p.type) {
    case 'ellipsoid': return sdf.ellipsoid(p.c, [p.r[0] + inflate, p.r[1] + inflate, p.r[2] + inflate], o);
    case 'sphere': return sdf.sphere(p.c, p.r + inflate, o);
    case 'capsule': return sdf.capsule(p.a, p.b, p.r + inflate, o);
    case 'roundCone': return sdf.roundCone(p.a, p.b, p.ra + inflate, p.rb + inflate, o);
    default: return null;
  }
}

const TORSO_UPPER = ['abdomen', 'belly', 'chest', 'pecL', 'pecR', 'bustL', 'bustR', 'trapsL', 'trapsR', 'deltL', 'deltR'];
const HIPS = ['pelvis', 'buttL', 'buttR'];

// Build the full body SDF with outfit. Returns list of material keys used.
export function buildBodySDF(sdf, P, J, spec, noise) {
  const parts = bodyParts(P, J);
  const byName = Object.fromEntries(parts.map((p) => [p.name, p]));
  const s = P.s;
  const outfit = spec.outfit || {};
  const top = outfit.top || { type: 'tshirt' };
  const bottom = outfit.bottom || { type: 'jeans' };
  const shoes = outfit.shoes || { type: 'sneakers' };
  const mats = new Set(['skin']);
  const hipY = J.thighL.y;

  // ---- Skin body ----
  const LEG = /^(thigh|knee|shin|calf|foot|ankle|toes)[LR]$/;
  let first = true;
  for (const p of parts) {
    // The neck comes from the finer head mesh (it plunges into the torso), so the
    // body skips it; this avoids coarse/fine surfaces fighting at the collar.
    if (p.name === 'neck') continue;
    if (spec.mermaid && LEG.test(p.name)) continue;
    emit(sdf, p, 0, { mat: 'skin', op: first ? 'union' : 'smooth' });
    first = false;
  }

  // ---- Mermaid tail ----
  // Scaled tail from the hips to the ground, curling forward into a fluke;
  // bound to the hips so it sways with the body.
  if (spec.mermaid) {
    mats.add('tail');
    const H = P.H, f = P.fat;
    const w = 1 + 0.25 * f + 0.1 * P.female;
    const pts = [
      [0, hipY + 0.035 * H, -0.006 * H, 0.15 * s * w],
      [0, hipY - 0.1 * H, 0.004 * H, 0.14 * s * w],
      [0, hipY - 0.24 * H, 0, 0.1 * s * w],
      [0, 0.15 * H, -0.02 * H, 0.066 * s],
      [0, 0.05 * H, 0.03 * H, 0.042 * s],
      [0, 0.03 * H, 0.14 * H, 0.03 * s],
    ];
    const scaleDisp = (x, y, z) => 0.0025 * s * Math.sin(y * 260 / s + Math.sin(Math.atan2(x, z) * 9) * 1.6) * Math.sin(Math.atan2(x, z) * 14);
    sdf.chain(pts, { mat: 'tail', op: 'smooth', k: 0.05 * s, bone: B.hips, priority: 3, disp: scaleDisp, dispAmp: 0.003 * s });
    // Fluke: two flattened lobes spreading sideways.
    for (const side of [1, -1]) {
      sdf.ellipsoid([side * 0.1 * s, 0.028 * H, 0.2 * H], [0.13 * s, 0.014 * s, 0.07 * s], { rot: [0, side * 0.55, 0], mat: 'tail', op: 'smooth', k: 0.03 * s, bone: B.hips, priority: 3 });
    }
    // Fin frills at the hips where scales meet skin.
    sdf.torus([0, hipY + 0.04 * H, -0.004 * H], 0.15 * s * w, 0.012 * s, { mat: 'tail', op: 'smooth', k: 0.01 * s, bone: B.hips, priority: 3 });
  }

  const n3 = (x, y, z) => noise.n3(x, y, z);
  // Cloth fold displacement generators.
  const shirtFolds = (amp) => (x, y, z) => {
    const waist = Math.exp(-Math.pow((y - hipY - 0.04 * P.H) / (0.06 * P.H), 2));
    return amp * (n3(x * 9, y * 4, z * 9) * 0.6 + n3(x * 22, y * 10, z * 22) * 0.25) + amp * 0.9 * waist * Math.sin(y * 180 + n3(x * 12, 0, z * 12) * 3);
  };
  const pantsFolds = (amp) => (x, y, z) => {
    const kneeY = J.shinL.y, ankleY = J.footL.y;
    const knee = Math.exp(-Math.pow((y - kneeY) / (0.05 * P.H), 2));
    const ankle = Math.exp(-Math.pow((y - ankleY - 0.06 * P.H) / (0.045 * P.H), 2));
    return amp * n3(x * 8, y * 3, z * 8) * 0.5 + amp * (knee * 0.8 + ankle * 1.5) * Math.sin(y * 150 + n3(x * 20, y * 5, z * 20) * 2.5);
  };

  // ---- Bottoms ----
  const bType = bottom.type;
  if (bType && bType !== 'none' && top.type !== 'dress' && top.type !== 'robe' && !spec.mermaid) {
    mats.add('bottom');
    const t = bType === 'jeans' ? 0.011 * s : bType === 'sweatpants' ? 0.024 * s : 0.016 * s;
    const waistTop = hipY + 0.065 * P.H;
    let cuffY;
    if (bType === 'shorts') cuffY = J.shinL.y + 0.07 * P.H;
    else if (bType === 'skirt') cuffY = null;
    else cuffY = J.footL.y + 0.018 * P.H;
    sdf.group({ op: 'union', defaults: { mat: 'bottom' } }, (g) => {
      let f2 = true;
      for (const n of HIPS) { const p = byName[n]; if (p) { emit(g, p, t + 0.004 * s, { mat: 'bottom', op: f2 ? 'union' : 'smooth', k: 0.05 * s, disp: pantsFolds(0.0035 * s), dispAmp: 0.006 * s, priority: 2 }); f2 = false; } }
      // Lower abdomen under the waistband.
      emit(g, byName.abdomen, t, { mat: 'bottom', op: 'smooth', k: 0.05 * s, priority: 2 });
      if (byName.belly) emit(g, byName.belly, t, { mat: 'bottom', op: 'smooth', k: 0.06 * s, priority: 2 });
      if (bType === 'skirt') {
        const len = bottom.length === 'long' ? 0.36 : bottom.length === 'mini' ? 0.14 : 0.24;
        g.roundCone([0, hipY + 0.03 * P.H, -0.01 * s], [0, hipY - len * P.H, 0], P.hipW * 0.95 + 0.07 * s, P.hipW * 1.1 + 0.12 * s, { mat: 'bottom', op: 'smooth', k: 0.04 * s, bone: B.hips, disp: (x, y, z) => 0.012 * s * Math.sin(Math.atan2(x, z) * 9 + noise.n2(x * 5, z * 5)) * Math.min(1, (hipY - y) / (0.2 * P.H) + 0.2), dispAmp: 0.015 * s, priority: 2 });
        g.plane([0, -1, 0], -(hipY - len * P.H), { op: 'inter' });
      } else {
        for (const S of ['L', 'R']) {
          for (const n of ['thigh', 'knee', 'shin', 'calf']) {
            const p = byName[n + S];
            const extra = n === 'shin' || n === 'calf' ? (bType === 'jeans' ? 0.006 * s : 0.012 * s) : 0;
            emit(g, p, t + extra, { mat: 'bottom', op: 'smooth', k: 0.04 * s, disp: pantsFolds(0.003 * s), dispAmp: 0.006 * s, priority: 2 });
          }
        }
        g.plane([0, -1, 0], -cuffY, { op: 'inter' });
      }
      g.plane([0, 1, 0], waistTop, { op: 'inter' });
    });
    // Waistband + belt.
    const waistR = Math.max(byName.abdomen.r[0], byName.pelvis.r[0] * 0.92) + t + 0.006 * s;
    const beltY = waistTop - 0.012 * s;
    if (outfit.belt !== false && bType !== 'sweatpants' && bType !== 'skirt') {
      mats.add('belt');
      sdf.ellipsoid([0, beltY, byName.abdomen.c[2] * 0.5 + (byName.belly ? 0.012 * s : 0)], [waistR * 0.98, 0.016 * s, (byName.abdomen.r[2] + t + 0.006 * s) * 0.98 + (byName.belly ? 0.012 * s : 0)], { mat: 'belt', op: 'union', bone: B.hips, priority: 3 });
      mats.add('metal');
      sdf.box([0, beltY, byName.abdomen.r[2] + t + 0.012 * s + (byName.belly ? 0.03 * s * P.fat : 0) + byName.abdomen.c[2]], [0.022 * s, 0.014 * s, 0.006 * s], { mat: 'metal', op: 'union', bone: B.hips, round: 0.003 * s, priority: 4 });
    }
  }

  // ---- Tops ----
  const tt = top.type;
  if (tt && tt !== 'none') {
    mats.add('top');
    const loose = tt === 'hoodie' || tt === 'sweater' || tt === 'coat' || tt === 'robe' ? 0.024 * s : tt === 'jacket' || tt === 'suit' || tt === 'labcoat' ? 0.02 * s : 0.013 * s;
    const hemY = tt === 'crop' ? J.spine.y + 0.02 * P.H
      : tt === 'coat' || tt === 'labcoat' ? J.shinL.y + 0.04 * P.H
        : tt === 'robe' ? J.footL.y + 0.035 * P.H
          : tt === 'dress' ? null
            : tt === 'shirt' || tt === 'polo' ? hipY + 0.058 * P.H
              : hipY - (tt === 'suit' || tt === 'jacket' ? 0.035 : 0.012) * P.H;
    const sleeve = top.sleeves || (tt === 'tank' || tt === 'dress' && !top.sleeves ? 'none' : tt === 'tshirt' || tt === 'polo' ? 'short' : 'long');
    const sleeveT = sleeve === 'short' ? 0.46 : sleeve === 'elbow' ? 0.8 : 1.0;
    sdf.group({ op: 'union', defaults: { mat: 'top' } }, (g) => {
      let f2 = true;
      for (const n of TORSO_UPPER) {
        const p = byName[n];
        if (!p) continue;
        emit(g, p, loose, { mat: 'top', op: f2 ? 'union' : 'smooth', k: (p.k || 0.06 * s) + 0.01 * s, disp: shirtFolds(0.0028 * s), dispAmp: 0.006 * s, priority: 3 });
        f2 = false;
      }
      // Cover hips when the hem is low enough.
      if (hemY === null || hemY < hipY + 0.02 * P.H) for (const n of HIPS) emit(g, byName[n], loose + 0.012 * s, { mat: 'top', op: 'smooth', k: 0.06 * s, priority: 3 });
      emit(g, byName.neck, loose * 0.35, { mat: 'top', op: 'smooth', k: 0.03 * s, priority: 3 });
      // Long garments flare out below the waist (coats, robes, dresses).
      if (tt === 'coat' || tt === 'labcoat' || tt === 'robe' || tt === 'dress') {
        const bottomY = tt === 'dress' ? J.shinL.y + (top.length === 'long' ? -0.2 : 0.02) * P.H : hemY;
        const flare = tt === 'robe' ? 0.2 : tt === 'dress' ? 0.14 : 0.1;
        g.roundCone([0, hipY + 0.05 * P.H, -0.01 * s], [0, bottomY + 0.02, -0.01 * s], P.hipW * 0.9 + 0.08 * s, P.hipW + flare * s, {
          mat: 'top', op: 'smooth', k: 0.05 * s, bone: B.hips,
          disp: (x, y, z) => 0.01 * s * Math.sin(Math.atan2(x, z) * 11 + noise.n2(x * 4, z * 4) * 2) * Math.min(1, (hipY - y) / (0.25 * P.H) + 0.1),
          dispAmp: 0.012 * s, priority: 3,
        });
        if (tt === 'dress') g.plane([0, -1, 0], -bottomY, { op: 'inter' });
      }
      // Sleeves: each in its own nested group so its end cut only clips the sleeve.
      if (sleeve !== 'none') {
        for (const S of ['L', 'R']) {
          const ua = byName['upperArm' + S], sh = J['arm' + S], el = J['fore' + S], wr = J['hand' + S];
          const wide = tt === 'robe' ? 0.03 * s : 0;
          g.group({ op: 'smooth', k: 0.035 * s, defaults: { mat: 'top' } }, (sg) => {
            const upEnd = sleeve === 'short' || sleeve === 'elbow' ? lerp3(sh, el, Math.min(1, sleeveT)) : V(el);
            sg.roundCone(V(sh), upEnd, ua.ra + loose + 0.008 * s + wide, ua.ra * 0.8 + loose + 0.012 * s + wide, { mat: 'top', op: 'union', bone: B['arm' + S], disp: shirtFolds(0.002 * s), dispAmp: 0.004 * s, priority: 3 });
            if (sleeve === 'long') {
              const fa = byName['forearm' + S];
              sg.roundCone(V(el), lerp3(el, wr, 0.95), fa.ra + loose + 0.004 * s + wide, fa.rb + loose + 0.006 * s + wide * 1.5, { mat: 'top', op: 'smooth', k: 0.03 * s, bone: B['fore' + S], disp: shirtFolds(0.002 * s), dispAmp: 0.004 * s, priority: 3 });
              const end = wr.clone().lerp(el, 0.06);
              const d2 = wr.clone().sub(el).normalize();
              sg.plane([d2.x, d2.y, d2.z], d2.dot(end), { op: 'inter' });
            } else {
              const dir = el.clone().sub(sh).normalize();
              const end = sh.clone().lerp(el, sleeveT);
              sg.plane([dir.x, dir.y, dir.z], dir.dot(end), { op: 'inter' });
            }
          });
        }
      } else {
        // Armholes.
        for (const S of ['L', 'R']) {
          const sh = J['arm' + S];
          g.sphere([sh.x * 1.05, sh.y - 0.01 * s, sh.z], 0.07 * s, { op: 'smoothSub', k: 0.01 * s });
        }
      }
      // Neckline.
      const neckR = byName.neck.ra;
      const nlY = J.neck.y - (tt === 'tank' || tt === 'dress' ? 0.06 : tt === 'shirt' || tt === 'suit' || tt === 'jacket' || tt === 'coat' || tt === 'labcoat' ? 0.03 : 0.006) * P.H;
      g.cylinder([0, nlY + 0.2, -0.015 * s], neckR + byName.neck.inset + 0.007 * s, 0.2, { op: 'smoothSub', k: 0.008 * s, round: 0.006 * s });
      if (tt === 'shirt' || tt === 'suit' || tt === 'jacket' || tt === 'coat' || tt === 'labcoat' || top.vneck) {
        // V-neck opening at the front.
        g.box([0, nlY - 0.02 * P.H, 0.12 * s], [0.028 * s, 0.05 * P.H, 0.06 * s], { rot: [0, 0, 0], op: 'smoothSub', k: 0.012 * s });
      }
      if (hemY !== null) g.plane([0, -1, 0], -hemY, { op: 'inter' });
    });
    // Collar / accessories on the garment.
    const chestFront = byName.chest.c[2] + byName.chest.r[2] + loose;
    if (tt === 'tshirt' || tt === 'sweater' || tt === 'polo') {
      sdf.torus([0, J.neck.y - 0.006 * P.H, -0.015 * s], byName.neck.ra + byName.neck.inset + 0.008 * s, 0.006 * s, { mat: 'top', op: 'union', bone: B.chest, rot: [0.1, 0, 0], priority: 3 });
    }
    if (tt === 'shirt' || tt === 'suit' || tt === 'polo') {
      // Collar flaps.
      for (const side of [1, -1]) {
        sdf.box([side * 0.03 * s, J.neck.y - 0.004 * P.H, 0.02 * s], [0.028 * s, 0.022 * s, 0.004 * s], { rot: [0.35, side * 0.55, side * 0.5], mat: tt === 'suit' ? 'shirt' : 'top', op: 'union', bone: B.chest, round: 0.002 * s, priority: 4 });
      }
    }
    if (tt === 'shirt' || tt === 'labcoat') {
      mats.add('button');
      const y0 = J.neck.y - 0.06 * P.H, y1 = hipY + 0.01 * P.H;
      sdf.box([0, (y0 + y1) / 2, chestFront - 0.004 * s], [0.012 * s, (y0 - y1) / 2, 0.006 * s], { mat: 'top', op: 'union', bone: B.chest, round: 0.003 * s, priority: 4 });
      for (let i = 0; i < 5; i++) {
        const y = y0 - (i / 4) * (y0 - y1) * 0.9;
        const z = (i < 3 ? byName.chest.c[2] + byName.chest.r[2] * Math.sqrt(Math.max(0, 1 - Math.pow((y - byName.chest.c[1]) / byName.chest.r[1], 2))) : byName.abdomen.c[2] + byName.abdomen.r[2]) + loose + 0.003 * s;
        sdf.cylinder([0, y, z], 0.0055 * s, 0.002 * s, { rot: [Math.PI / 2, 0, 0], mat: 'button', op: 'union', bone: i < 3 ? B.chest : B.spine, priority: 5 });
      }
    }
    if (tt === 'suit' || outfit.tie) {
      mats.add('tie'); mats.add('shirt');
      // Shirt triangle + tie.
      sdf.box([0, J.neck.y - 0.05 * P.H, chestFront - 0.012 * s], [0.03 * s, 0.05 * P.H, 0.004 * s], { mat: 'shirt', op: 'union', bone: B.chest, priority: 4 });
      sdf.roundCone([0, J.neck.y - 0.015 * P.H, chestFront - 0.006 * s], [0, J.chest.y - 0.06 * P.H, chestFront + 0.004 * s], 0.009 * s, 0.017 * s, { mat: 'tie', op: 'union', bone: B.chest, priority: 5 });
    }
    if (tt === 'hoodie') {
      // Hood resting on the shoulders + front pocket + drawstrings.
      sdf.group({ op: 'union', defaults: { mat: 'top', bone: B.chest } }, (g) => {
        g.ellipsoid([0, J.neck.y + 0.01 * P.H, -0.085 * s], [0.12 * s, 0.07 * s, 0.07 * s], { mat: 'top', priority: 3 });
        g.ellipsoid([0, J.neck.y + 0.02 * P.H, -0.06 * s], [0.085 * s, 0.06 * s, 0.07 * s], { op: 'sub' });
      });
      sdf.box([0, J.spine.y - 0.02 * P.H, byName.abdomen.c[2] + byName.abdomen.r[2] + loose + 0.002 * s + (byName.belly ? 0.05 * s * P.fat : 0)], [0.1 * s, 0.045 * s, 0.008 * s], { mat: 'top', op: 'smooth', k: 0.01 * s, bone: B.spine, round: 0.006 * s, priority: 4 });
      for (const side of [1, -1]) sdf.capsule([side * 0.035 * s, J.neck.y - 0.02 * P.H, chestFront - 0.008 * s], [side * 0.04 * s, J.chest.y - 0.02 * P.H, chestFront + 0.01 * s], 0.003 * s, { mat: 'accent', op: 'union', bone: B.chest, priority: 5 });
      mats.add('accent');
    }
    if (tt === 'jacket' || tt === 'coat') {
      mats.add('accent');
      // Zip line.
      sdf.box([0, (J.neck.y + hemY) / 2, chestFront + 0.002 * s], [0.004 * s, (J.neck.y - hemY) / 2 * 0.9, 0.004 * s], { mat: 'accent', op: 'union', bone: B.spine, priority: 5 });
    }
  }

  // ---- Shoes ----
  const st = shoes.type;
  if (st && st !== 'barefoot' && !spec.mermaid) {
    mats.add('shoe'); mats.add('sole');
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const an = J['foot' + S], toe = J['toe' + S], tip = J['toeTip' + S], heel = J['heel' + S];
      const len = tip.z - heel.z + 0.03 * s;
      const cz = (tip.z + heel.z) / 2 + 0.008 * s;
      const w = (st === 'boots' ? 0.052 : st === 'dress' || st === 'heels' ? 0.042 : 0.05) * s;
      const heelLift = st === 'heels' ? 0.06 * s : 0;
      const soleH = st === 'sneakers' ? 0.016 * s : st === 'boots' ? 0.018 * s : 0.01 * s;
      // Sole.
      sdf.box([an.x + side * 0.002 * s, soleH * 0.5, cz], [w, soleH * 0.55, len / 2], { mat: 'sole', op: 'union', bone: B['foot' + S], round: Math.min(w, soleH) * 0.5, priority: 6 });
      // Upper.
      sdf.group({ op: 'union', defaults: { mat: 'shoe' } }, (g) => {
        g.roundCone([heel.x, soleH + 0.03 * s + heelLift, heel.z + 0.02 * s], [toe.x, soleH + 0.024 * s, toe.z + 0.02 * s], 0.042 * s * (w / (0.05 * s)), 0.034 * s * (w / (0.05 * s)), { bone: B['foot' + S], priority: 6 });
        g.roundCone([toe.x, soleH + 0.022 * s, toe.z], [tip.x, soleH + (st === 'dress' ? 0.012 : 0.02) * s, tip.z + 0.012 * s], 0.034 * s * (w / (0.05 * s)), (st === 'dress' || st === 'heels' ? 0.016 : 0.028) * s, { op: 'smooth', k: 0.02 * s, bone: B['toe' + S], priority: 6 });
        g.sphere([an.x, an.y + 0.01 * s, an.z + 0.005 * s], 0.045 * s, { op: 'smooth', k: 0.03 * s, bone: B['foot' + S], bones: [[B['foot' + S], 0.8], [B['shin' + S], 0.2]], priority: 6 });
        if (st === 'boots') {
          g.roundCone([an.x, an.y, an.z], [an.x, an.y + 0.16 * P.H, an.z - 0.005 * s], 0.05 * s, 0.047 * s * (1 + P.fat * 0.2), { op: 'smooth', k: 0.02 * s, bone: B['shin' + S], bones: [[B['shin' + S], 0.7], [B['foot' + S], 0.3]], priority: 6 });
          g.plane([0, 1, 0], an.y + 0.16 * P.H, { op: 'inter' });
        } else {
          // Opening for the ankle.
          g.plane([0, 1, 0], an.y + 0.022 * s, { op: 'inter' });
        }
        g.plane([0, -1, 0], -soleH * 0.8, { op: 'inter' });
      });
      if (st === 'sneakers') {
        mats.add('lace');
        for (let i = 0; i < 4; i++) {
          const t = 0.25 + i * 0.13;
          const z = heel.z + (tip.z - heel.z) * t + 0.03 * s;
          const y = soleH + 0.058 * s - t * 0.03 * s;
          sdf.box([an.x, y, z], [0.02 * s, 0.0025 * s, 0.004 * s], { rot: [-0.5, 0, 0], mat: 'lace', op: 'union', bone: B['foot' + S], round: 0.002 * s, priority: 7 });
        }
      }
      if (st === 'heels') {
        sdf.cylinder([heel.x, heelLift * 0.5 + 0.005 * s, heel.z + 0.01 * s], 0.009 * s, heelLift * 0.5 + 0.005 * s, { mat: 'sole', op: 'union', bone: B['foot' + S], priority: 6 });
      }
    }
  }
  return { mats: [...mats], parts: byName };
}
