// Temporary bootstrap used while bringing up the renderer (replaced later).
import * as THREE from 'three';
import { G, settings, loadSettings } from './core/context.js';
import { applyShaderPatches, globalUniforms } from './render/shaderPatches.js';
import { Renderer, resolveQuality } from './render/renderer.js';
import { TextureBaker } from './render/texbake.js';
import { MaterialLibrary } from './render/materials.js';
import { buildOverworld } from './world/world.js';
import { Humanoid } from './characters/humanoid.js';

async function boot() {
  loadSettings();
  applyShaderPatches();
  const params = new URLSearchParams(location.search);
  if (params.get('q')) settings.graphics = params.get('q');
  G.quality = resolveQuality();
  const container = document.getElementById('app');
  G.renderer = new Renderer(container);
  G.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, G.quality.farDistance + 3000);
  G.baker = new TextureBaker(G.renderer.renderer);
  G.materials = new MaterialLibrary(G.baker);
  const fill = document.getElementById('loader-fill');
  const txt = document.getElementById('loader-text');
  const gen = buildOverworld((p, t) => { fill.style.width = (p * 100).toFixed(0) + '%'; if (t) txt.textContent = t; });
  let r;
  while (!(r = gen.next()).done) await new Promise((res) => setTimeout(res, 0));
  const world = r.value;
  G.world = world;
  G.renderer.setup(world.scene, G.camera, G.quality);
  const cam = (params.get('cam') || '0,6,12,0,-0.05').split(',').map(Number);
  G.camera.position.set(cam[0], cam[1], cam[2]);
  if (params.has('ground')) G.camera.position.y = world.terrain.heightAt(cam[0], cam[2]) + 1.88;
  G.camera.rotation.order = 'YXZ';
  G.camera.rotation.set(cam[4] || 0, cam[3] || 0, 0);
  if (params.get('time')) world.atmosphere.setTime(Number(params.get('time')));
  if (params.has('nograss')) world.grass.forEach((g) => (g.mesh.visible = false));
  if (params.has('noveg')) world.vegetation.group.visible = false;
  if (params.has('nowater')) world.lakeMesh.visible = false;
  window.__info = { h: world.terrain.heightAt(0, 12), min: world.terrain.minHeight, max: world.terrain.maxHeight };
  console.log('info', JSON.stringify(window.__info));
  if (params.get('weather')) world.weather.set(params.get('weather'));
  let testH = null;
  if (params.get('test') === 'human') {
    const spec = { sex: params.get('sex') || 'male', age: Number(params.get('age') || 28), height: Number(params.get('h') || 2.0), fat: Number(params.get('fat') || 0.28), muscle: 0.45, skinTone: Number(params.get('skin') || 0.32), undertone: 0.2,
      hair: { style: params.get('hair') || 'curly', color: params.get('hc') || 'dark brown' }, facialHair: params.get('fh') || 'none', eyeColor: 'brown',
      outfit: { top: { type: params.get('top') || 'tshirt', color: params.get('tc') || '#3a4a5a' }, bottom: { type: params.get('bottom') || 'jeans', color: '#2b3e66' }, shoes: { type: params.get('shoes') || 'sneakers', color: '#f0f0ee' }, glasses: params.has('glasses'), hat: params.get('hat') || null } };
    const h = new Humanoid(spec, Number(params.get('seed') || 7));
    const t0 = performance.now();
    const g = h.build({ shouldYield: () => false, detail: 1 }, () => {});
    let rr; while (!(rr = g.next()).done);
    console.log('human built in', (performance.now() - t0).toFixed(0), 'ms', 'tris', h.meshes.map((m) => m.geometry.index.count / 3));
    const tx = 0, tz = 0;
    h.root.position.set(tx, world.terrain.heightAt(tx, tz), tz);
    h.root.rotation.y = Number(params.get('rot') || 0);
    world.scene.add(h.root);
    testH = h;
    const pose = params.get('pose');
    if (pose && pose !== 'walk' && pose !== 'run') h.gesture(pose, 1000);
    const dist = Number(params.get('dist') || 3.2), camY = Number(params.get('camy') || 1.1);
    G.camera.position.set(tx + Math.sin(Number(params.get('ang') || 0)) * dist, h.root.position.y + camY, tz + Math.cos(Number(params.get('ang') || 0)) * dist);
    G.camera.lookAt(tx, h.root.position.y + Number(params.get('look') || 1.0), tz);
  }
  document.getElementById('title-screen').classList.add('hidden');
  const clock = new THREE.Clock();
  window.__frames = 0;
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    G.time += dt;
    globalUniforms.uGTime.value = G.time;
    world.update(dt, G.camera, G.camera.position);
    if (testH) {
      const pose = params.get('pose');
      testH.update(dt, { speed: pose === 'walk' ? 1.6 : pose === 'run' ? 6 : 0, moveAngle: 0, grounded: true, look: params.has('lookcam') ? G.camera.position.clone().sub(testH.root.position) : null });
    }
    world.atmosphere.applyGlobals();
    world.atmosphere.maybeUpdateEnv();
    G.renderer.exposure = world.atmosphere.exposure;
    G.renderer.render(dt);
    window.__frames++;
    requestAnimationFrame(loop);
  };
  loop();
  window.G = G;
}
boot().catch((e) => { console.error(e); document.getElementById('loader-text').textContent = 'Error: ' + e.message; });
