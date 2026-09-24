// World switching (portals / returning home) and per-world post-processing.

import * as THREE from 'three';
import { G } from '../core/context.js';
import { LightPool } from '../render/lights.js';
import { globalUniforms } from '../render/shaderPatches.js';

export function registerWorld(world) {
  G.worlds.set(world.id, world);
  if (!world.lightPool) world.lightPool = new LightPool(world.scene, G.quality.maxPointLights);
  return world;
}

// Push the world's colour grading into the final post pass.
export function applyPost(world, dt = 0) {
  const fin = G.renderer.passes.final;
  if (!fin) return;
  const p = world.post;
  const u = fin.uniforms;
  const k = Math.min(1, dt * 3 || 1);
  u.uTint.value.lerp(new THREE.Color(p.tint[0], p.tint[1], p.tint[2]), k);
  u.uLift.value.lerp(new THREE.Color(p.lift[0], p.lift[1], p.lift[2]), k);
  u.uSaturation.value += (p.saturation - u.uSaturation.value) * k;
  u.uContrast.value += (p.contrast - u.uContrast.value) * k;
  u.uVignette.value += (p.vignette - u.uVignette.value) * k;
  u.uWobble.value += (p.wobble - u.uWobble.value) * k;
  u.uCA.value += (p.ca - u.uCA.value) * k;
  u.uGrain.value = p.grain;
  u.uPulse.value += ((p.pulse || 0) - u.uPulse.value) * k;
  u.uInvert.value += ((p.invert || 0) - u.uInvert.value) * k;
}

// Move the player (and avatar) into another world.
export function switchWorld(world, pos, yaw) {
  const prev = G.world;
  if (prev === world) { G.player.teleport(pos, yaw); return; }
  registerWorld(world);
  if (G.avatar && G.avatar.root.parent) G.avatar.root.parent.remove(G.avatar.root);
  if (G.mirrorWorld === prev && G.mirror) { /* mirror stays in its world */ }
  G.world = world;
  world.scene.add(G.avatar ? G.avatar.root : new THREE.Object3D());
  G.renderer.setScene(world.scene);
  G.player.teleport(pos, yaw);
  if (G.player.held) G.interaction && G.interaction.drop(true);
  if (!world.weather) { globalUniforms.uWetness.value = 0; globalUniforms.uSnowCover.value = 0; globalUniforms.uWindStrength.value = world.meta.wind ?? 0.3; }
  if (world.atmosphere) { world.atmosphere.update(0, G.camera, true); world.atmosphere.applyGlobals(); world.atmosphere.maybeUpdateEnv(true); }
  applyPost(world);
  if (world.onEnter) world.onEnter();
  if (prev && prev.onLeave) prev.onLeave();
  if (G.ui) { G.ui.flash('#ffffff', 600); G.ui.toast(world.kind === 'overworld' ? 'Back in the overworld' : `Entered: ${world.name}` + (world.meta.rulesLabel ? ` — ${world.meta.rulesLabel}` : ''), 'good', 4200); }
  if (G.audio) G.audio.play('portal');
}
