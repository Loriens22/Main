// Exports the bake scene of one bus for the Blender light bake (tools/blender/bake_bus_light.py): the bus
// is built in the bus studio exactly as the game builds it (straight, doors closed), and its static meshes
// with their lightmap UVs, plus every other opaque part as an occluder, are written as JSON.
//   node tools/bus_lightmap_export.cjs <game.html> <bus> <variant: full|balanced> <out.json> [size]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [html, bus, variant = 'full', out, size = '2048'] = process.argv.slice(2);
  if (!html || !bus || !out) {
    console.error('usage: node tools/bus_lightmap_export.cjs <game.html> <bus> <full|balanced> <out.json> [size]');
    process.exit(1);
  }
  const q = variant === 'full' ? 'high' : variant;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(html) + `?noloop&q=${q}&scene=bus&veh=${bus}&doors=0`);
  await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 });
  const scene = await p.evaluate((n) => {
    const s = __game.lightmapScene(n);
    s.bus = __game.spec.id;
    return s;
  }, Number(size));
  scene.variant = variant;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(scene));
  const verts = (list) => list.reduce((a, o) => a + (o.pos.length * 3) / 4 / 12, 0);
  console.log(`${bus} ${variant}: ${scene.lit.length} baked meshes (${Math.round(verts(scene.lit))} vertices, ${scene.charts} charts, ${scene.scale.toFixed(1)} texels/m), ${scene.occ.length} occluders (${Math.round(verts(scene.occ))} vertices), signature ${scene.signature}`);
  if (errs.length) console.log('page errors:', errs.slice(0, 3).join(' | '));
  await b.close();
})();
