#!/usr/bin/env node
/* Per-module visual preview. Builds a throwaway page from three.inline.js +
 * whichever src files you name, runs an init snippet, and writes a PNG you can
 * actually look at with the Read tool.
 *
 *   node build/preview.js --files 00_core.js,10_textures.js,30_models_shop.js \
 *                         --out /tmp/x/bench.png \
 *                         --code "SG.preview.show(SG.models.benchTable())"
 *
 * Inside --code you have: SG, THREE, scene, camera, renderer, and helpers:
 *   SG.preview.show(obj3d)            add + frame the camera on it
 *   SG.preview.grid()                 1 m reference grid + 1.8 m human scale bar
 *   SG.preview.tex(texture)           show a texture on a unit plane
 *   SG.preview.row([o1,o2,...])       lay objects out in a row and frame them
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join('/opt/node22/lib/node_modules/playwright'));

const ROOT = path.resolve(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const files = arg('files', '00_core.js').split(',').map(s => s.trim()).filter(Boolean);
const out = path.resolve(arg('out', path.join(ROOT, 'dist', 'preview.png')));
const code = arg('code', 'SG.preview.grid()');
const W = parseInt(arg('w', '900'), 10);
const H = parseInt(arg('h', '600'), 10);
const wait = parseInt(arg('wait', '1500'), 10);

let src = fs.readFileSync(path.join(ROOT, 'build', 'three.inline.js'), 'utf8');
for (const f of files) {
  const p = path.join(ROOT, 'src', f);
  if (!fs.existsSync(p)) { console.error('missing src file:', f); process.exit(1); }
  src += '\n;\n' + fs.readFileSync(p, 'utf8');
}

const harness = `
;(function(SG, THREE){
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#20242a');
  var camera = new THREE.PerspectiveCamera(45, ${W}/${H}, 0.02, 200);
  var renderer = new THREE.WebGLRenderer({canvas: document.getElementById('gl'), antialias:true});
  renderer.setSize(${W}, ${H}, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x40382e, 1.1); scene.add(hemi);
  var key = new THREE.DirectionalLight(0xfff2e0, 2.4);
  key.position.set(3,5,4); key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-6;key.shadow.camera.right=6;
  key.shadow.camera.top=6;key.shadow.camera.bottom=-6;
  scene.add(key);
  var fill = new THREE.DirectionalLight(0x99bbff, 0.7); fill.position.set(-4,2,-3); scene.add(fill);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(60,60),
    new THREE.MeshStandardMaterial({color:0x30343a, roughness:0.95}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  function frame(obj){
    var box = new THREE.Box3().setFromObject(obj);
    var size = box.getSize(new THREE.Vector3());
    var ctr = box.getCenter(new THREE.Vector3());
    var r = Math.max(0.2, size.length()*0.5);
    var d = r / Math.tan(22.5*Math.PI/180) * 1.15;
    camera.position.set(ctr.x + d*0.62, ctr.y + d*0.45, ctr.z + d*0.72);
    camera.lookAt(ctr);
  }

  SG.preview = {
    scene: scene, camera: camera, renderer: renderer,
    show: function(o){ if(!o) return null; scene.add(o); frame(o); return o; },
    grid: function(){
      var g = new THREE.GridHelper(20, 20, 0x556677, 0x333b44);
      g.position.y = 0.002; scene.add(g);
      var bar = new THREE.Mesh(new THREE.BoxGeometry(0.06,1.8,0.06),
        new THREE.MeshStandardMaterial({color:0xff5544}));
      bar.position.set(-1.2, 0.9, 0); scene.add(bar);
      return g;
    },
    tex: function(t, size){
      size = size || 2;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(size,size),
        new THREE.MeshBasicMaterial({map:t, transparent:true}));
      m.position.set(0, size/2, 0); scene.add(m); frame(m); return m;
    },
    row: function(list, gap){
      gap = gap || 0.4;
      var group = new THREE.Group(); var x = 0;
      list.forEach(function(o){
        if(!o) return;
        var b = new THREE.Box3().setFromObject(o);
        var s = b.getSize(new THREE.Vector3());
        o.position.x += x + s.x/2; x += s.x + gap;
        group.add(o);
      });
      group.position.x = -x/2; scene.add(group); frame(group); return group;
    },
    frame: frame,
    camAt: function(px,py,pz, tx,ty,tz){
      camera.position.set(px,py,pz); camera.lookAt(tx||0, ty||0, tz||0);
    }
  };

  try { ${code} } catch(e) { window.__err = (e && (e.stack||e.message)) || String(e); }

  var t0 = performance.now();
  (function loop(){
    requestAnimationFrame(loop);
    var dt = 1/60;
    if (SG.preview.onFrame) { try { SG.preview.onFrame(dt, (performance.now()-t0)/1000); } catch(e){} }
    renderer.render(scene, camera);
    window.__calls = renderer.info.render.calls;
    window.__tris = renderer.info.render.triangles;
  })();
})(window.SG, window.THREE);
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#20242a;overflow:hidden}canvas{display:block}
</style></head><body><canvas id="gl" width="${W}" height="${H}"></canvas>
<script>${src}</script><script>${harness}</script></body></html>`;

const tmp = path.join(require('os').tmpdir(), 'sgpreview-' + Date.now() + '.html');
fs.writeFileSync(tmp, html);

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + (e.stack || e.message)));
  await page.goto('file://' + tmp, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(wait);
  const info = await page.evaluate(() => ({
    err: window.__err || null, calls: window.__calls, tris: window.__tris
  }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log(JSON.stringify({ out, ...info, logs }, null, 2));
  if (info.err || logs.length) process.exit(1);
})().catch(e => { console.error('PREVIEW FAILURE', e); process.exit(2); });
