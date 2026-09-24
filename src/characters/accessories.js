// Head accessories built from lathe/tube geometry and attached to the head
// bone: glasses, sunglasses, caps, beanies, top hats, cowboy hats, crowns,
// wizard hats, chef toques, hard hats, police caps, helmets, headphones.

import * as THREE from 'three';
import { B } from './rig.js';
import { G } from '../core/context.js';

function lathe(points, segs = 32) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

export function buildAccessories(h, spec, info) {
  const out = [];
  const outfit = spec.outfit || {};
  const headBone = h.bones[B.head];
  const hb = h.J.head;
  const O = info.O, hs = info.hs;
  const local = (x, y, z) => new THREE.Vector3(O[0] + x * hs - hb.x, O[1] + y * hs - hb.y, O[2] + z * hs - hb.z);
  const M = G.materials;
  const add = (obj) => { obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); headBone.add(obj); out.push(obj); return obj; };
  const hairT = info.hairT || 0;

  // ---- Glasses ----
  if (outfit.glasses || outfit.sunglasses) {
    const g = new THREE.Group();
    const frameMat = M.plain(outfit.glassesColor || (outfit.sunglasses ? '#101010' : '#1a1410'), 0.35, 0.2);
    const lensMat = outfit.sunglasses ? M.get('tintedGlass', { color: '#101418', opacity: 0.85 }) : M.get('glass', { opacity: 0.12 });
    const round = outfit.glassesShape === 'round';
    for (const sd of [1, -1]) {
      const c = local(sd * 0.032, 0.001, 0.093);
      const rimR = (round ? 0.019 : 0.021) * hs;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.0016 * hs, 6, 28), frameMat);
      rim.scale.set(1, round ? 1 : 0.72, 1);
      rim.position.copy(c);
      g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(rimR, 28), lensMat);
      lens.scale.copy(rim.scale);
      lens.position.copy(c);
      g.add(lens);
      // Temple arm to the ear.
      const a = local(sd * 0.052, 0.004, 0.09), b = local(sd * 0.073, 0.0, -0.005);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0014 * hs, 0.0014 * hs, a.distanceTo(b), 5), frameMat);
      arm.position.copy(a).add(b).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.0065 * hs, 0.0014 * hs, 5, 12, Math.PI), frameMat);
    bridge.position.copy(local(0, 0.006, 0.098));
    g.add(bridge);
    add(g);
  }

  // ---- Hats ----
  const hat = outfit.hat;
  if (hat) {
    const color = outfit.hatColor;
    const top = 0.128 + hairT * 0.6;
    const g = new THREE.Group();
    const rr = (v) => v * hs;
    if (hat === 'cap' || hat === 'police') {
      const mat = M.get('cotton', { color: color || (hat === 'police' ? '#1a2238' : '#2a4a8a') });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rr(0.098), 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.scale.set(0.85, hat === 'police' ? 0.75 : 0.62, 1.02);
      dome.position.copy(local(0, 0.045, -0.012));
      g.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.06), rr(0.065), rr(0.006), 24, 1, false, -Math.PI / 2, Math.PI), mat);
      brim.position.copy(local(0, 0.047, 0.08));
      brim.rotation.x = 0.15;
      g.add(brim);
      if (hat === 'police') {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.087), rr(0.087), rr(0.022), 28, 1, true), M.plain('#101010', 0.5));
        band.position.copy(local(0, 0.05, -0.012)); band.scale.set(0.92, 1, 1.1);
        g.add(band);
        const badge = new THREE.Mesh(new THREE.CircleGeometry(rr(0.012), 6), M.get('gold'));
        badge.position.copy(local(0, 0.075, 0.09)); g.add(badge);
      }
    } else if (hat === 'beanie') {
      const mat = M.get('knit', { color: color || '#8a2a2a', world: 0.06 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rr(0.1), 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
      dome.scale.set(0.86, 0.95, 1.05);
      dome.position.copy(local(0, 0.03, -0.012));
      g.add(dome);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(rr(0.083), rr(0.012), 8, 32), mat);
      cuff.rotation.x = Math.PI / 2; cuff.scale.set(1, 1.22, 1.3);
      cuff.position.copy(local(0, 0.035, -0.012));
      g.add(cuff);
    } else if (hat === 'tophat' || hat === 'cowboy' || hat === 'wizard' || hat === 'chef' || hat === 'hardhat' || hat === 'witch') {
      let geo, mat;
      if (hat === 'tophat') { geo = lathe([[0.001, 0.2], [0.07, 0.2], [0.068, 0.02], [0.13, 0.012], [0.13, 0.0], [0.001, 0.0]].map(([x, y]) => [x * hs, y * hs])); mat = M.get('velvet', { color: color || '#141414' }); }
      else if (hat === 'cowboy') { geo = lathe([[0.001, 0.12], [0.06, 0.125], [0.078, 0.06], [0.08, 0.015], [0.17, 0.03], [0.18, 0.045], [0.18, 0.035], [0.08, 0.0], [0.001, 0.0]].map(([x, y]) => [x * hs, y * hs])); mat = M.get('leather', { color: color || '#7a5230' }); }
      else if (hat === 'wizard' || hat === 'witch') { geo = lathe([[0.001, 0.38], [0.02, 0.28], [0.06, 0.12], [0.085, 0.02], [0.2, 0.0], [0.2, -0.008], [0.001, -0.008]].map(([x, y]) => [x * hs, y * hs])); mat = M.get('velvet', { color: color || (hat === 'witch' ? '#141018' : '#2a2a7a') }); }
      else if (hat === 'chef') { geo = lathe([[0.001, 0.2], [0.08, 0.2], [0.11, 0.15], [0.1, 0.09], [0.078, 0.06], [0.078, 0.0], [0.001, 0.0]].map(([x, y]) => [x * hs, y * hs])); mat = M.get('cotton', { color: '#f6f6f2' }); }
      else { geo = lathe([[0.001, 0.1], [0.075, 0.095], [0.095, 0.04], [0.1, 0.005], [0.125, 0.0], [0.125, -0.008], [0.001, -0.008]].map(([x, y]) => [x * hs, y * hs])); mat = M.get('glossyPlastic', { color: color || '#f0c020' }); }
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(local(0, top - 0.035, -0.01));
      m.scale.set(0.95, 1, 1.08);
      if (hat === 'wizard' || hat === 'witch') m.rotation.z = 0.08;
      g.add(m);
    } else if (hat === 'crown') {
      const mat = M.get('gold');
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.075), rr(0.07), rr(0.035), 32, 1, true), mat);
      ring.position.copy(local(0, top - 0.01, -0.012));
      ring.material = mat;
      g.add(ring);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(rr(0.012), rr(0.04), 6), mat);
        sp.position.copy(local(Math.sin(a) * 0.072, top + 0.025, Math.cos(a) * 0.072 - 0.012));
        g.add(sp);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(rr(0.006), 8, 6), M.get('emissive', { color: ['#e02040', '#2060e0', '#20c060'][i % 3], emissiveIntensity: 1.2 }));
        gem.position.copy(local(Math.sin(a) * 0.078, top - 0.01, Math.cos(a) * 0.078 - 0.012));
        g.add(gem);
      }
    } else if (hat === 'helmet') {
      const mat = M.get('steel');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rr(0.112), 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
      dome.position.copy(local(0, 0.02, -0.012)); dome.scale.set(0.9, 1, 1.02);
      g.add(dome);
    } else if (hat === 'headphones') {
      const mat = M.plain(color || '#202020', 0.4, 0.1);
      const band = new THREE.Mesh(new THREE.TorusGeometry(rr(0.09), rr(0.008), 8, 28, Math.PI), mat);
      band.position.copy(local(0, 0.02, -0.01)); band.rotation.z = 0; band.scale.set(1, 1.25, 1);
      g.add(band);
      for (const sd of [1, -1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.03), rr(0.03), rr(0.022), 20), mat); cup.rotation.z = Math.PI / 2; cup.position.copy(local(sd * 0.088, -0.005, -0.005)); g.add(cup); }
    }
    add(g);
  }
  return out;
}
