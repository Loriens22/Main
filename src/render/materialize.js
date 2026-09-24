// "Materialize" reveal effect for newly generated entities: materials are
// temporarily cloned with a dissolve patch that discards fragments above a
// rising world-space height (with noise) and paints a glowing cyan edge,
// while sparkles swirl around the object. Afterwards the original shared
// materials are restored and the clones disposed.

import * as THREE from 'three';
import { patchMaterial } from './shaderPatches.js';
import { markNoAO, unmarkNoAO } from './renderer.js';

const DISSOLVE_KEY = 'materialize-dissolve';

function makeDissolve(mat, uniforms) {
  const m = mat.clone();
  m.defines = { ...(mat.defines || {}) }; // Material.copy resets custom defines
  m.userData = { dissolveClone: true };
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uRevealY = uniforms.uRevealY;
    shader.uniforms.uRevealEdge = uniforms.uRevealEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 rvp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          rvp = instanceMatrix * rvp;
        #endif
        vRevealPos = ( modelMatrix * rvp ).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRevealPos;
        uniform float uRevealY;
        uniform vec3 uRevealEdge;
        float rvHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float rvN = rvHash( floor( vRevealPos * 22.0 ) ) * 0.18;
        float rvD = vRevealPos.y - uRevealY + rvN;
        if ( rvD > 0.0 ) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uRevealEdge * smoothstep( -0.22, 0.0, rvD ) * 6.0;`);
  };
  m.customProgramCacheKey = () => prevKey + '|' + DISSOLVE_KEY;
  return m;
}

export class Materializer {
  constructor() { this.active = []; }

  start(root, scene, duration = 1.8) {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const uniforms = { uRevealY: { value: box.min.y - 0.1 }, uRevealEdge: { value: new THREE.Color(0.35, 0.8, 1.0) } };
    const swaps = [];
    root.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) return;
      if (!o.material) return;
      const orig = o.material;
      const arr = Array.isArray(orig) ? orig : [orig];
      const ok = arr.every((m) => m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
      if (!ok) { swaps.push({ o, orig, hidden: true }); o.visible = false; return; }
      const clones = arr.map((m) => makeDissolve(m, uniforms));
      o.material = Array.isArray(orig) ? clones : clones[0];
      swaps.push({ o, orig, clones });
    });
    // Sparkles.
    const n = 260;
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    for (let i = 0; i < n; i++) { seeds[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9fe6ff, size: Math.max(0.05, Math.min(0.25, size.length() * 0.012)), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    markNoAO(pts);
    scene.add(pts);
    this.active.push({ root, box, uniforms, swaps, t: 0, duration: duration * Math.min(2, 0.7 + size.y / 8), pts, seeds, size, center, scene });
  }

  update(dt) {
    this.active = this.active.filter((a) => {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      const e = k * k * (3 - 2 * k);
      a.uniforms.uRevealY.value = a.box.min.y - 0.2 + (a.box.max.y - a.box.min.y + 0.5) * e;
      // Sparkles spiral around the reveal line.
      const pos = a.pts.geometry.attributes.position;
      const rad = Math.max(a.size.x, a.size.z) * 0.6 + 0.3;
      for (let i = 0; i < pos.count; i++) {
        const s = a.seeds[i];
        const ang = s * 40 + a.t * (2 + s * 3);
        const y = a.uniforms.uRevealY.value + (s - 0.5) * 0.6 + Math.sin(a.t * 4 + s * 20) * 0.1;
        const r = rad * (0.7 + 0.5 * Math.sin(s * 91));
        pos.setXYZ(i, a.center.x + Math.cos(ang) * r, y, a.center.z + Math.sin(ang) * r);
      }
      pos.needsUpdate = true;
      a.pts.material.opacity = 0.9 * (1 - Math.max(0, (k - 0.8) / 0.2));
      if (k >= 1) {
        for (const s of a.swaps) {
          if (s.hidden) { s.o.visible = true; continue; }
          s.o.material = s.orig;
          for (const c of s.clones) c.dispose();
        }
        a.scene.remove(a.pts);
        unmarkNoAO(a.pts);
        a.pts.geometry.dispose(); a.pts.material.dispose();
        return false;
      }
      return true;
    });
  }

  cancel(root) {
    this.active = this.active.filter((a) => {
      if (a.root !== root) return true;
      for (const s of a.swaps) { if (s.hidden) s.o.visible = true; else { s.o.material = s.orig; for (const c of s.clones) c.dispose(); } }
      a.scene.remove(a.pts); a.pts.geometry.dispose(); a.pts.material.dispose();
      return false;
    });
  }
}

export { patchMaterial };
