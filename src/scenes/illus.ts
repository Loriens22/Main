import * as THREE from 'three';

/** Shared "antique natural-history plate" shading: Lambert lighting, then
 *  screen-space ink hatching that deepens in shadow, paper fibre and a gentle
 *  warm watercolour tint.  Works for skinned + instanced meshes. */
export const ILLUS = { res: { value: 1080 }, paper: { value: null as THREE.Texture | null }, time: { value: 0 } };

export function illus(mat: THREE.Material, ink = 1.0, extraVertex?: (vs: string) => string) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh: any, r: any) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uIRes = ILLUS.res;
    sh.uniforms.tIPaper = ILLUS.paper;
    sh.uniforms.uInk = { value: ink };
    if (extraVertex) sh.vertexShader = extraVertex(sh.vertexShader);
    sh.fragmentShader = 'uniform float uIRes; uniform sampler2D tIPaper; uniform float uInk;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        vec3 c = gl_FragColor.rgb;
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        vec2 sp = gl_FragCoord.xy * (1080.0 / uIRes);
        float l1 = abs(fract((sp.x + sp.y) / 6.0) - 0.5);
        float l2 = abs(fract((sp.x - sp.y) / 7.0) - 0.5);
        float dark = 1.0 - smoothstep(0.12, 0.5, lum);
        float hatch = mix(1.0, smoothstep(0.08, 0.2, l1), smoothstep(0.0, 0.6, dark));
        hatch *= mix(1.0, smoothstep(0.06, 0.18, l2), smoothstep(0.55, 1.0, dark));
        vec3 paper = texture2D(tIPaper, gl_FragCoord.xy / 512.0 * (1080.0 / uIRes)).rgb;
        c = mix(c, c * (0.62 + 0.38 * hatch), uInk);
        c *= 0.9 + paper * 0.16;
        // pigment: lift shadows toward warm sepia, keep it printed rather than CG
        c = mix(c, vec3(0.36, 0.27, 0.18) * (0.6 + lum), 0.12 * dark);
        gl_FragColor.rgb = c;
      }`);
  };
  mat.needsUpdate = true;
  return mat;
}

/** Inverted-hull ink outline that follows skinning (bind-space normal push). */
export function outlineMat(width = 0.012, color = 0x2a1d14) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh: any) => {
    sh.uniforms.uOW = { value: width };
    sh.vertexShader = 'uniform float uOW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOW;');
  };
  return m;
}

export function addOutline(mesh: THREE.Mesh, width = 0.012) {
  let o: THREE.Mesh;
  if ((mesh as any).isSkinnedMesh) {
    const sm = mesh as THREE.SkinnedMesh;
    o = new THREE.SkinnedMesh(sm.geometry, outlineMat(width));
    (o as THREE.SkinnedMesh).bind(sm.skeleton, sm.bindMatrix);
    if (sm.morphTargetInfluences) (o as any).morphTargetInfluences = sm.morphTargetInfluences;
  } else {
    o = new THREE.Mesh(mesh.geometry, outlineMat(width));
  }
  o.frustumCulled = false;
  o.castShadow = false;
  mesh.add(o);
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
  return o;
}
