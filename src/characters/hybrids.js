// ---------------------------------------------------------------------------
// Hybrid humanoids: bolt-on parts for mythical people.
//
//   animalHead  an SDF animal head (bull, wolf, jackal, cat, lizard...) with
//               its own neck replaces the sculpted human head: minotaur,
//               werewolf, jackal-headed god, lizard folk, cat people
//   wings       'feather' (angel, harpy), 'bat' (demon, gargoyle) or 'fairy'
//   halo        a glowing ring floating above the head
//   horns       curved horns on the brow
//   tail        'devil' (thin, spade tip) or 'cat' / 'lizard'
//
// Every part hangs off a rig bone (bones have identity rest rotations, so a
// part's local offset is simply its world rest offset from the joint) and
// gets a little idle motion. Returns tick functions for the entity update.
// (The mermaid tail is part of the body SDF itself, see body.js.)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { B } from './rig.js';
import { G } from '../core/context.js';
import { buildAnimalHead } from '../gen/generators/creatures.js';

const PI = Math.PI;

// A tube with a tapering radius along any curve.
export function taperTube(curve, r0, r1, seg = 16, radial = 8) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], nor = [], idx = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i], Bn = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// Wing outline (x outward, y up) for one side, in units of the span.
function wingShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'bat') {
    // Leading edge to the wrist, then four finger tips with sagging membrane.
    s.moveTo(0, 0.02);
    s.lineTo(0.28, 0.3); s.lineTo(0.52, 0.36);
    const tips = [[1.0, 0.16], [0.86, -0.22], [0.6, -0.42], [0.3, -0.44], [0.04, -0.2]];
    let prev = [0.52, 0.36];
    for (const t of tips) {
      const mx = (prev[0] + t[0]) / 2, my = (prev[1] + t[1]) / 2;
      // Sag toward the wrist.
      s.quadraticCurveTo(mx + (0.5 - mx) * 0.28, my + (0.28 - my) * 0.28, t[0], t[1]);
      prev = t;
    }
    s.lineTo(0, -0.02);
    return { shape: s, fingers: [[0.52, 0.36], ...tips.slice(0, 4)] };
  }
  if (kind === 'fairy') {
    // Upper lobe.
    s.moveTo(0, 0);
    s.bezierCurveTo(0.2, 0.55, 0.8, 0.8, 0.95, 0.5);
    s.bezierCurveTo(1.05, 0.25, 0.5, 0.05, 0.02, -0.02);
    // Lower lobe.
    s.bezierCurveTo(0.3, -0.15, 0.62, -0.42, 0.5, -0.58);
    s.bezierCurveTo(0.36, -0.72, 0.1, -0.35, 0, 0);
    return { shape: s };
  }
  // Feathered: the arm and covert area; flight feathers are added separately.
  s.moveTo(0, -0.05);
  s.bezierCurveTo(0.15, 0.3, 0.45, 0.46, 0.72, 0.44);
  s.quadraticCurveTo(0.95, 0.42, 1.02, 0.34);
  s.quadraticCurveTo(0.7, 0.18, 0.1, -0.22);
  s.closePath();
  return { shape: s, feathers: true };
}

// One flight feather (pointing +Y), in units of the span.
function featherShape(len, w) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w, len * 0.35, w * 0.6, len * 0.85);
  s.quadraticCurveTo(0, len * 1.05, -w * 0.4, len * 0.85);
  s.quadraticCurveTo(-w * 0.7, len * 0.35, 0, 0);
  return s;
}

function wingMesh(kind, span, color) {
  const { shape, fingers, feathers } = wingShape(kind);
  const g = new THREE.ShapeGeometry(shape, 12);
  g.scale(span, span, span);
  let mat;
  if (kind === 'fairy') {
    mat = new THREE.MeshPhysicalMaterial({ color: color || '#d8b8ff', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, iridescence: 1, iridescenceIOR: 1.6, emissive: new THREE.Color(color || '#c8a8ff').multiplyScalar(0.25) });
  } else if (kind === 'bat') {
    mat = new THREE.MeshStandardMaterial({ color: color || '#3a1418', roughness: 0.75, side: THREE.DoubleSide });
  } else {
    mat = G.materials.get('fur', { color: color || '#f4f2ee', world: 0.06, side: THREE.DoubleSide });
  }
  const group = new THREE.Group();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = kind !== 'fairy';
  group.add(m);
  if (feathers) {
    // Primaries fan from the wing's leading edge, pointing down near the
    // body and outward at the tip; a shorter row of coverts overlaps them.
    const geos = [];
    const n = 14;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const len = row ? 0.2 + 0.08 * t : 0.36 + 0.26 * Math.sin(t * PI * 0.75);
        const fg = new THREE.ShapeGeometry(featherShape(len, row ? 0.05 : 0.06), 4);
        fg.rotateZ(-1.6 + t * 1.3 - Math.PI / 2); // down near the body, outward at the tip
        const bx = 0.06 + t * 0.9, by = 0.02 + Math.sin(t * PI * 0.9) * 0.38 - t * 0.05;
        fg.translate(bx, by - (row ? 0.02 : 0.05), (row ? 0.012 : 0.004) + i * 0.0006);
        geos.push(fg);
      }
    }
    const merged = mergeGeos(geos);
    merged.scale(span, span, span);
    const f = new THREE.Mesh(merged, mat);
    f.castShadow = true;
    group.add(f);
  }
  if (fingers) {
    const boneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#3a1418').multiplyScalar(0.6), roughness: 0.6 });
    const wrist = new THREE.Vector3(0.52 * span, 0.36 * span, 0);
    const arm = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), wrist);
    group.add(new THREE.Mesh(taperTube(arm, span * 0.03, span * 0.022, 4, 6), boneMat));
    for (const f of fingers.slice(1)) {
      const tip = new THREE.Vector3(f[0] * span, f[1] * span, 0);
      group.add(new THREE.Mesh(taperTube(new THREE.LineCurve3(wrist, tip), span * 0.016, span * 0.005, 4, 5), boneMat));
    }
    // Claw at the wrist.
    const claw = new THREE.Mesh(new THREE.ConeGeometry(span * 0.02, span * 0.07, 6), boneMat);
    claw.position.copy(wrist).add(new THREE.Vector3(0, span * 0.04, 0));
    group.add(claw);
  }
  return group;
}

function mergeGeos(list) {
  let n = 0, m = 0;
  for (const g of list) { n += g.attributes.position.count; m += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + o);
    o += g.attributes.position.count;
    g.dispose();
  }
  void m;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export function* applyHybrid(h, spec, ctx, rng) {
  const ticks = [];
  const J = h.J, P = h.P, bones = h.bones;
  const info = h.headInfo, O = info.O, hs = info.hs;
  const headBone = bones[B.head], chestBone = bones[B.chest], hipsBone = bones[B.hips];
  const s = P.s;
  const local = (bone, x, y, z) => new THREE.Vector3(x, y, z).sub(J[bone]);

  // ---- Animal head ----
  if (spec.animalHead) {
    const size = 0.17 * hs * (spec.animalHeadScale || 1.2);
    const head = yield* buildAnimalHead(spec.animalHead, size, ctx, rng, { neck: true, mane: !!spec.animalMane, color: spec.animalHeadColor });
    head.position.copy(local('head', O[0], O[1] + 0.01 * hs, O[2] + 0.005 * hs));
    headBone.add(head);
    h.hideHumanHead();
    h.headOnly.push(head);
    // Idle ear/snout flick: tiny head bob on top of the rig's own motion.
    let tt = rng.range(0, 10);
    ticks.push((dt) => { tt += dt; head.rotation.x = Math.sin(tt * 0.7) * 0.04; });
  }

  // ---- Wings ----
  if (spec.wings) {
    const kind = spec.wings;
    const span = (kind === 'fairy' ? 0.42 : kind === 'bat' ? 0.95 : 1.05) * P.H * 0.55;
    const pivots = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.copy(local('chest', side * 0.05 * s, J.chest.y + 0.06 * s, J.chest.z - 0.11 * s * (1 + P.fat * 0.3)));
      const w = wingMesh(kind, span, spec.wingColor);
      w.scale.x = side;
      // Angle backward and up a little.
      const holder = new THREE.Group();
      holder.rotation.set(0, side * 0.55, side * (kind === 'fairy' ? 0.15 : 0.25));
      holder.add(w);
      pivot.add(holder);
      chestBone.add(pivot);
      pivots.push([pivot, side]);
    }
    const fast = kind === 'fairy';
    let tt = rng.range(0, 10);
    ticks.push((dt) => {
      tt += dt;
      const f = fast ? Math.sin(tt * 26) * 0.55 : Math.sin(tt * 1.6) * 0.12 + Math.max(0, Math.sin(tt * 0.23)) * Math.sin(tt * 5) * 0.25;
      for (const [p, side] of pivots) p.rotation.y = side * (f - (fast ? 0 : 0.1));
    });
  }

  // ---- Halo ----
  if (spec.halo) {
    const r = 0.1 * hs;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 10, 40), G.materials.get('emissive', { color: '#ffd860', emissiveIntensity: 2.6 }));
    halo.rotation.x = Math.PI / 2 - 0.25;
    const baseY = J.crown.y + 0.07 * hs;
    halo.position.copy(local('head', 0, baseY, O[2] - 0.03 * hs));
    headBone.add(halo);
    h.headOnly.push(halo);
    let tt = rng.range(0, 10);
    const y0 = halo.position.y;
    ticks.push((dt) => { tt += dt; halo.position.y = y0 + Math.sin(tt * 1.8) * 0.008 * hs; });
  }

  // ---- Horns ----
  if (spec.horns && !spec.animalHead) {
    const col = spec.hornColor || '#1a1210';
    const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 0.6 });
    const big = spec.horns === 'ram' ? 1.4 : 1;
    for (const side of [1, -1]) {
      const b = new THREE.Vector3(side * 0.045 * hs, J.crown.y - 0.035 * hs, O[2] + 0.035 * hs);
      const curve = new THREE.CatmullRomCurve3([
        b,
        b.clone().add(new THREE.Vector3(side * 0.03, 0.05, -0.005).multiplyScalar(hs * big)),
        b.clone().add(new THREE.Vector3(side * 0.05, 0.1, -0.035).multiplyScalar(hs * big)),
        b.clone().add(new THREE.Vector3(side * 0.045, 0.14, -0.08).multiplyScalar(hs * big)),
      ]);
      const horn = new THREE.Mesh(taperTube(curve, 0.016 * hs * big, 0.001, 14, 8), mat);
      horn.position.copy(local('head', 0, 0, 0));
      horn.castShadow = true;
      headBone.add(horn);
      h.headOnly.push(horn);
    }
  }

  // ---- Tail ----
  if (spec.tail) {
    const kind = spec.tail;
    const L = (kind === 'devil' ? 0.62 : kind === 'lizard' ? 0.8 : 0.6) * P.H * 0.6;
    const base = new THREE.Vector3(0, J.hips.y - 0.05 * s, -0.11 * s * (1 + P.fat * 0.4));
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(Math.sin(t * 3) * 0.08 * L, -Math.sin(t * 1.4) * 0.55 * L + t * t * 0.5 * L, -t * 0.75 * L));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const r0 = kind === 'lizard' ? 0.06 * s : kind === 'cat' ? 0.02 * s : 0.014 * s;
    const col = spec.tailColor || spec.skinColor || '#8a1414';
    const mat = kind === 'devil' ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.45, clearcoat: 0.3 }) : G.materials.get(kind === 'lizard' ? 'scales' : 'fur', { color: col, world: 0.1 });
    const pivot = new THREE.Group();
    pivot.position.copy(local('hips', base.x, base.y, base.z));
    const tail = new THREE.Mesh(taperTube(curve, r0, kind === 'devil' ? r0 * 0.5 : r0 * 0.25, 20, 8), mat);
    tail.castShadow = true;
    pivot.add(tail);
    if (kind === 'devil') {
      const sp = new THREE.Shape();
      const w = 0.05 * s;
      sp.moveTo(0, 0); sp.quadraticCurveTo(w * 1.2, w * 0.6, 0, w * 2.2); sp.quadraticCurveTo(-w * 1.2, w * 0.6, 0, 0);
      const spade = new THREE.Mesh(new THREE.ExtrudeGeometry(sp, { depth: 0.006 * s, bevelEnabled: false }), mat);
      const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
      spade.position.copy(end);
      spade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      spade.castShadow = true;
      pivot.add(spade);
    }
    hipsBone.add(pivot);
    let tt = rng.range(0, 10);
    ticks.push((dt) => { tt += dt; pivot.rotation.y = Math.sin(tt * 1.3) * 0.35; pivot.rotation.x = Math.sin(tt * 0.9) * 0.08; });
  }
  return ticks;
}
