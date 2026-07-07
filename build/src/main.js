// ---------------------------------------------------------------------------
//  LUXORA RESIDENCES — real-time photoreal 3D of a modern European luxury
//  apartment complex. Three.js (WebGL2), bundled offline into a single HTML.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createMaterials } from './materials.js';
import { ComplexBuilder } from './complex.js';
import { buildLandscape } from './landscape.js';

const CONFIG = { boulevardZ: 34 };

let renderer, scene, camera, controls, sky, sun, sunLight, hemi, materials, pmrem;
let landscapeRefs, layout;
const clock = new THREE.Clock();
let tween = null;
let autoRotate = false;
let frames = 0, fpsAcc = 0, fpsT = 0;

function setStatus(txt) {
  const el = document.getElementById('loadmsg');
  if (el) el.textContent = txt;
}

function init() {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc3d4de, 0.0016);

  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 4000);
  camera.position.set(58, 46, 66);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 6;
  controls.maxDistance = 260;
  controls.target.set(0, 12, -8);

  pmrem = new THREE.PMREMGenerator(renderer);

  // ----- sky + sun -----
  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);
  sun = new THREE.Vector3();

  hemi = new THREE.HemisphereLight(0xbcd9ff, 0x6a6250, 0.7);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.16);
  scene.add(amb);

  sunLight = new THREE.DirectionalLight(0xfff2df, 3.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 500;
  const S = 95;
  sunLight.shadow.camera.left = -S;
  sunLight.shadow.camera.right = S;
  sunLight.shadow.camera.top = S;
  sunLight.shadow.camera.bottom = -S;
  sunLight.shadow.bias = -0.0002;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  setSun(32, 148); // elevation, azimuth (bright day)

  // ----- materials -----
  materials = createMaterials();

  // ----- buildings -----
  setStatus('Constructing buildings…');
  buildComplex();

  // ----- site -----
  setStatus('Growing gardens & boulevard…');
  layout = { boulevardZ: CONFIG.boulevardZ };
  landscapeRefs = buildLandscape(scene, materials, layout);

  // ----- UI -----
  buildUI();

  window.__cam = camera; window.__ctrl = controls;
  // deterministic helpers used by the headless verification harness
  window.__setView = (p, t) => {
    tween = null;
    camera.position.set(p[0], p[1], p[2]);
    controls.target.set(t[0], t[1], t[2]);
    controls.update();
    renderer.render(scene, camera);
  };
  window.__setSun = (el, az) => { setSun(el, az); renderer.render(scene, camera); };
  window.__VIEWS = VIEWS;
  window.addEventListener('resize', onResize);
  document.getElementById('overlay').classList.add('hidden');

  animate();
}

function setSun(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  sun.setFromSphericalCoords(1, phi, theta);
  const u = sky.material.uniforms;
  u['turbidity'].value = 3.2;
  u['rayleigh'].value = elevationDeg < 14 ? 2.6 : 1.4;
  u['mieCoefficient'].value = 0.005;
  u['mieDirectionalG'].value = 0.8;
  u['sunPosition'].value.copy(sun);

  sunLight.position.copy(sun).multiplyScalar(260);
  sunLight.target.position.set(0, 6, -6);
  // warm the light and dim it near the horizon (golden hour)
  const warm = THREE.MathUtils.clamp((22 - elevationDeg) / 22, 0, 1);
  sunLight.color.setRGB(1.0, 0.95 - warm * 0.18, 0.87 - warm * 0.32);
  sunLight.intensity = 3.4 - warm * 1.3;
  hemi.intensity = 0.72 - warm * 0.22;
  if (scene.fog) scene.fog.color.setHSL(0.58, 0.28, 0.72 - warm * 0.25);

  // rebuild environment reflections from the current sky
  refreshEnv();
}

function refreshEnv() {
  const envScene = new THREE.Scene();
  const s2 = new Sky();
  s2.scale.setScalar(10000);
  const u = s2.material.uniforms;
  const su = sky.material.uniforms;
  u['turbidity'].value = su['turbidity'].value;
  u['rayleigh'].value = su['rayleigh'].value;
  u['mieCoefficient'].value = su['mieCoefficient'].value;
  u['mieDirectionalG'].value = su['mieDirectionalG'].value;
  u['sunPosition'].value.copy(su['sunPosition'].value);
  envScene.add(s2);
  const rt = pmrem.fromScene(envScene);
  if (scene.environment) scene.environment.dispose && scene.environment.dispose();
  scene.environment = rt.texture;
}

function buildComplex() {
  const c = new ComplexBuilder(materials);

  // North wing (back, longest, 6 storeys + wood penthouse) faces south (+Z)
  c.wing({
    origin: new THREE.Vector3(-34, 0, -22), dir: new THREE.Vector3(1, 0, 0), facing: new THREE.Vector3(0, 0, 1),
    bays: 19, bayWidth: 3.58, floors: 6, depth: 12, groundH: 4.2, floorH: 3.25,
    penthouse: true, penthouseAt: 6, entrance: true, seed: 11
  });

  // East wing (6 storeys, taller accent corner) faces the courtyard (-X)
  c.wing({
    origin: new THREE.Vector3(29, 0, -21.5), dir: new THREE.Vector3(0, 0, 1), facing: new THREE.Vector3(-1, 0, 0),
    bays: 10, bayWidth: 3.55, floors: 6, depth: 12, groundH: 4.2, floorH: 3.25,
    penthouse: true, penthouseAt: 3, entrance: true, seed: 22
  });

  // West wing (5 storeys) faces the courtyard (+X)
  c.wing({
    origin: new THREE.Vector3(-29, 0, -21.5), dir: new THREE.Vector3(0, 0, 1), facing: new THREE.Vector3(1, 0, 0),
    bays: 10, bayWidth: 3.55, floors: 5, depth: 12, groundH: 4.2, floorH: 3.25,
    penthouse: true, penthouseAt: 5, entrance: true, seed: 33
  });

  // hero courtyard trees (kept modest & toward the edges so paths stay visible)
  c.courtyard([
    [-20, -14, 4.5, 1], [-2, -16, 4, 0], [16, -15, 4.8, 2],
    [-22, -3, 4.2, 0], [22, -2, 4.5, 1], [-18, 7, 4, 2],
    [18, 7, 4.3, 0], [0, -9, 5, 2], [8, 4, 4, 1], [-9, 5, 4.2, 0]
  ]);
  c.benches([[-10, 3, 0.4], [6, -4, -0.6], [-16, -9, 1.1], [16, 2, 2.4], [0, 7, 0]]);
  c.bollards([[-12, -2], [-2, -8], [8, -4], [12, 4], [-6, 5], [2, -14]]);

  const grp = c.finalize();
  scene.add(grp);
  window.__complexGroup = grp;
}

// -------------------- camera presets & tweening --------------------
const VIEWS = {
  aerial:   { pos: [54, 44, 62],  tgt: [0, 11, -8] },
  courtyard:{ pos: [1, 15, 18],   tgt: [-1, 6, -15] },
  facade:   { pos: [-13, 9, 0],   tgt: [-17, 12, -22] },
  street:   { pos: [-44, 6, 58],  tgt: [2, 11, 2] },
  penthouse:{ pos: [16, 26, 16],  tgt: [11, 21, -14] }
};

function goTo(view) {
  const v = VIEWS[view];
  tween = {
    fromPos: camera.position.clone(),
    toPos: new THREE.Vector3(...v.pos),
    fromTgt: controls.target.clone(),
    toTgt: new THREE.Vector3(...v.tgt),
    t: 0, dur: 1.4
  };
}

function buildUI() {
  const ui = document.getElementById('ui');
  ui.classList.remove('hidden');
  document.querySelectorAll('[data-view]').forEach(b => {
    b.addEventListener('click', () => { goTo(b.dataset.view); setActive(b); });
  });
  const sunSlider = document.getElementById('sunEl');
  const azSlider = document.getElementById('sunAz');
  const update = () => setSun(parseFloat(sunSlider.value), parseFloat(azSlider.value));
  sunSlider.addEventListener('input', update);
  azSlider.addEventListener('input', update);
  document.getElementById('rotate').addEventListener('change', e => { autoRotate = e.target.checked; });
  document.getElementById('goldenBtn').addEventListener('click', () => {
    sunSlider.value = 7; azSlider.value = 108; update();
  });
  document.getElementById('dayBtn').addEventListener('click', () => {
    sunSlider.value = 34; azSlider.value = 148; update();
  });
}
function setActive(btn) {
  document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // camera tween
  if (tween) {
    tween.t += dt / tween.dur;
    const k = Math.min(tween.t, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
    controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
    if (k >= 1) tween = null;
  }

  if (autoRotate && !tween) {
    const a = dt * 0.12;
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(controls.target).add(off);
  }

  // moving cars
  if (layout && layout._cars) {
    for (const car of layout._cars) {
      car.position.x += car.userData.speed * dt;
      if (car.position.x > 88) car.position.x = -88;
      if (car.position.x < -88) car.position.x = 88;
      car.rotation.y = car.userData.speed > 0 ? 0 : Math.PI;
    }
  }

  // subtle canopy breeze
  if (landscapeRefs) for (const c of landscapeRefs.windGroups) {
    c.rotation.z = Math.sin(t * 0.6) * 0.006;
  }

  controls.update();
  renderer.render(scene, camera);

  // fps
  frames++; fpsAcc += dt; fpsT += dt;
  if (fpsT > 0.5) {
    const fps = Math.round(frames / fpsAcc);
    const el = document.getElementById('fps'); if (el) el.textContent = fps + ' fps';
    frames = 0; fpsAcc = 0; fpsT = 0;
  }
}

try {
  init();
} catch (err) {
  console.error(err);
  const o = document.getElementById('overlay');
  if (o) {
    o.classList.remove('hidden');
    o.innerHTML = '<div class="err"><h2>Unable to start 3D scene</h2><pre>' +
      (err && err.stack ? err.stack : err) + '</pre></div>';
  }
}
