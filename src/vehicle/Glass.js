// Shared optics of the bus models.
// glassMaterial: tinted glazing whose transparency follows the Fresnel term, so a pane shows the cabin when
// seen square-on and turns into a mirror of the street at grazing angles, as in the photographs. The
// reflection is added on top of the tinted view through the pane instead of being faded with it.
// occludeInterior: the roof and side walls shade the cabin from the sky, so the materials inside receive
// only part of the ambient and environment light (sunlight through the windows still falls through the
// shadow map).
import * as THREE from 'three';

/**
 * transmit: fraction of the light behind the pane that passes at normal incidence (windscreen ~0.7,
 * tinted side glass 0.25-0.45); color: tint of the diffuse film (keep it dark).
 */
export function glassMaterial({ color = 0x0b0e11, transmit = 0.5, side = THREE.FrontSide, rough = 0.04, env = 1, ...rest } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, transparent: true, depthWrite: false, side, envMapIntensity: env, ...rest });
  m.userData.transmit = transmit;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTransmit = { get value() { return m.userData.transmit; } };
    sh.fragmentShader = 'uniform float uTransmit;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float gNV = clamp(abs(dot(geometryNormal, geometryViewDir)), 0.0, 1.0);
      float gF = 0.04 + 0.96 * pow(1.0 - gNV, 5.0);
      float gA = clamp(1.0 - (1.0 - gF) * uTransmit, 0.0, 1.0);
      gl_FragColor = vec4((totalSpecular + totalDiffuse * (1.0 - uTransmit) + totalEmissiveRadiance) / max(gA, 0.02), gA);`);
  };
  m.customProgramCacheKey = () => 'bus-glass';
  return m;
}

/** Ambient/environment light reaching the cabin, relative to outside. */
export const CABIN_AMBIENT = 0.34;

/**
 * Scales the indirect light of every material used only inside the cabin (interior groups, cab). Materials
 * shared with the exterior (and the Blender kit's) are cloned for the interior first. Glass and emissive light
 * sources are left alone.
 */
export function occludeInterior(model, k = CABIN_AMBIENT, warm = new THREE.Color(1.15, 1.0, 0.84)) {
  const groups = model.interiorGroups || [];
  const inside = new Set();
  for (const g of groups) g.traverse((o) => { if (o.isMesh) inside.add(o); });
  const outsideMats = new Set();
  model.root.traverse((o) => {
    if (o.isMesh && !inside.has(o)) for (const m of [].concat(o.material)) outsideMats.add(m);
  });
  const clones = new Map();
  const patched = new Set();
  // lamps, buttons and strips are switched at runtime through the model's material table: never clone them
  const skip = (m) => !m.isMeshStandardMaterial || m.transparent || m.userData.noOcclusion || (m.emissive && m.emissive.getHex() !== 0);
  for (const o of inside) {
    const mats = [].concat(o.material).map((m) => {
      // shared materials (the Blender kit) are always cloned: patching them would darken every bus's exterior
      if (skip(m) || (!outsideMats.has(m) && !(m.userData && m.userData.shared))) return m;
      if (!clones.has(m)) {
        // clone() drops the shader hooks (the baked materials read roughness/metalness from attributes)
        const c = m.clone();
        c.onBeforeCompile = m.onBeforeCompile;
        c.customProgramCacheKey = m.customProgramCacheKey;
        // the clone belongs to this bus even when the original is a shared kit material; the kit's neutral albedo
        // gets the same warming as the models' own interior materials (the blue sky light turns greys blue)
        if (m.userData && m.userData.shared) c.color.multiply(warm);
        c.userData.shared = false;
        clones.set(m, c);
      }
      return clones.get(m);
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
    for (const m of mats) {
      if (skip(m) || patched.has(m)) continue;
      patched.add(m);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
          reflectedLight.indirectDiffuse *= ${k.toFixed(3)};
          reflectedLight.indirectSpecular *= ${k.toFixed(3)};`);
      };
      const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
      m.customProgramCacheKey = () => `${key()}|cabin${k}`;
      m.needsUpdate = true;
    }
  }
  // the model's material table points to the exterior instances; interior-only lookups keep working
  return patched.size;
}
