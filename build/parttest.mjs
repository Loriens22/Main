// Visual smoke-test for a single "part" module.
//   node parttest.mjs parts/railings.js createGlassBalustrade '[3,1.1]'
// Bundles the module + a studio scene (sky, env reflections, sun, ground),
// calls the named export with optional JSON args, frames the result and writes
// three PNGs (front / three-quarter / top) next to this script.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [, , modRel, exportName, argsJson = 'undefined', label] = process.argv;
if (!modRel || !exportName) {
  console.error('usage: node parttest.mjs <module-rel-path> <exportName> [jsonArgs] [label]');
  process.exit(2);
}
const modAbs = resolve(__dirname, 'src', modRel);
const outBase = label || exportName;

const entry = `
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as PART from ${JSON.stringify(modAbs)};

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(1);
renderer.setSize(1200, 900);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1200/900, 0.05, 2000);

const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
const sun = new THREE.Vector3();
const u = sky.material.uniforms;
u['turbidity'].value = 3; u['rayleigh'].value = 1.4;
u['mieCoefficient'].value = 0.005; u['mieDirectionalG'].value = 0.8;
sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(135));
u['sunPosition'].value.copy(sun);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(sky).texture;

scene.add(new THREE.HemisphereLight(0xbcd9ff, 0x6a6250, 0.5));
const sunLight = new THREE.DirectionalLight(0xfff2df, 3.0);
sunLight.position.copy(sun).multiplyScalar(50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048,2048);
Object.assign(sunLight.shadow.camera, { near:1, far:200, left:-20, right:20, top:20, bottom:-20 });
sunLight.shadow.bias = -0.0002; sunLight.shadow.normalBias = 0.02;
scene.add(sunLight, sunLight.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({ color:0xb9bcae, roughness:0.95 }));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

let group, err=null;
try {
  const args = ${argsJson === 'undefined' ? '[]' : `(${argsJson})`};
  group = PART[${JSON.stringify(exportName)}].apply(null, Array.isArray(args)?args:[args]);
  scene.add(group);
} catch(e){ err = (e&&e.stack)||String(e); }
window.__err = err;

// scan for NaN vertices (common cause of a NaN bounding box)
window.__nan = [];
if (group) { group.updateMatrixWorld(true); group.traverse(o => {
  if (!o.isMesh) return;
  const p = o.geometry.attributes.position;
  if (p) { const a=p.array; for (let i=0;i<a.length;i++) if(!Number.isFinite(a[i])){ window.__nan.push('POS '+(o.name||o.type)); break; } }
  if (o.matrixWorld.elements.some(e=>!Number.isFinite(e))) window.__nan.push(o.geometry.type+' p='+o.position.x+','+o.position.y+','+o.position.z+' s='+o.scale.x+','+o.scale.y+','+o.scale.z);
}); }

// frame the object
const box = group ? new THREE.Box3().setFromObject(group) : new THREE.Box3(new THREE.Vector3(-1,0,-1), new THREE.Vector3(1,1,1));
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
// drop object onto ground
if (group) group.position.y -= box.min.y;
center.y -= box.min.y;
const radius = Math.max(size.x, size.y, size.z) * 1.1 + 0.5;
window.__frame = { cx:center.x, cy:center.y, cz:center.z, r:radius, size:[size.x,size.y,size.z] };

window.__shot = (az, el) => {
  const f = window.__frame;
  const p = new THREE.Vector3().setFromSphericalCoords(f.r*2.2,
     THREE.MathUtils.degToRad(90-el), THREE.MathUtils.degToRad(az));
  camera.position.set(f.cx+p.x, f.cy+p.y, f.cz+p.z);
  camera.lookAt(f.cx, f.cy, f.cz);
  renderer.render(scene, camera);
};
window.__ready = true;
`;

const tmp = mkdtempSync(join(tmpdir(), 'parttest-'));
const entryFile = join(tmp, 'entry.js');
writeFileSync(entryFile, entry);
const res = await build({
  entryPoints: [entryFile], bundle: true, format: 'iife', platform: 'browser',
  target: ['es2019'], write: false, logLevel: 'silent',
  absWorkingDir: __dirname,
  nodePaths: [resolve(__dirname, 'node_modules')]
});
const html = `<!doctype html><html><head><meta charset=utf8></head><body style="margin:0">
<script>${res.outputFiles[0].text}</script></body></html>`;
const htmlFile = join(tmp, 'index.html');
writeFileSync(htmlFile, html);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport:{width:1200,height:900} });
const logs=[], errs=[];
page.on('console', m=>logs.push('['+m.type()+'] '+m.text()));
page.on('pageerror', e=>errs.push(String(e.stack||e)));
await page.goto(pathToFileURL(htmlFile).href, { waitUntil:'load', timeout:60000 });
await page.waitForFunction('window.__ready===true', { timeout:30000 }).catch(()=>{});
const info = await page.evaluate(()=>({ err:window.__err, frame:window.__frame, nan:window.__nan }));
if (info.nan && info.nan.length) console.log('NaN geometry in:', info.nan.slice(0,10));

async function shot(az, el, name){
  await page.evaluate(([a,e])=>window.__shot(a,e), [az,el]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(__dirname, name) });
}
if (!info.err) {
  await shot(35, 18, `part_${outBase}_34.png`);
  await shot(0, 8,  `part_${outBase}_front.png`);
  await shot(20, 62, `part_${outBase}_top.png`);
}
await browser.close();

console.log('=== PARTTEST', modRel, exportName, '===');
console.log('frame size:', info.frame ? info.frame.size.map(n=>Math.round(n*100)/100) : null);
console.log('build error:', info.err || 'none');
console.log('pageerrors :', errs.length); errs.slice(0,8).forEach(e=>console.log('  ',e));
console.log('console    :', logs.length); logs.slice(0,8).forEach(l=>console.log('  ',l));
const ok = !info.err && errs.length===0;
console.log(ok ? ('OK -> part_'+outBase+'_34.png') : 'FAILED');
process.exit(ok?0:1);
