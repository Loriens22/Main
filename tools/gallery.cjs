// Fixed close-up views along a line for before/after comparisons of roads, kerbs, markings and facades.
//   node tools/gallery.cjs <game.html> <outdir> <line> <name:dir:s:kind> ...
// kind: kerb (on the right pavement looking along the kerb), road (driver height looking ahead),
//       facade (from the right pavement looking across at the left-hand buildings), down (kerb from above),
//       right (from the road centre at the right-hand facades)
// env: H (hour, default 11), Q (quality, default high), W (weather)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [html, out, line, ...views] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__TEST_PRESERVE__ = true; });
  const q = `noloop&q=${process.env.Q || 'high'}&line=${line}&h=${process.env.H || 11}${process.env.W ? '&w=' + process.env.W : ''}`;
  await p.goto('file://' + path.resolve(html) + '?' + q);
  await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 });
  for (const v of views) {
    const [name, dir, s, kind] = v.split(':');
    await p.evaluate(([dir, s, kind]) => {
      const G = __game, g = G.game, c = G.camera, H = (x, z) => G.world.hf.heightAt(x, z);
      document.getElementById('ui') && (document.getElementById('ui').style.display = 'none');
      const P = g.route.direction(dir).path;
      const a = P.at(s), t = P.tangent(s, 4);
      const hw = g.route.laneInfo(dir, s).halfWidth;
      const rx = -t.tz, rz = t.tx; // right of travel (x east, z south)
      let cam, tgt;
      if (kind === 'kerb') {
        cam = [a.x + rx * (hw + 1.4), 1.45, a.z + rz * (hw + 1.4)];
        tgt = [a.x + rx * (hw + 0.2) + t.tx * 9, 0.1, a.z + rz * (hw + 0.2) + t.tz * 9];
      } else if (kind === 'down') {
        cam = [a.x + rx * (hw + 1.6), 1.7, a.z + rz * (hw + 1.6)];
        tgt = [a.x + rx * (hw - 0.4) + t.tx * 2.5, 0.0, a.z + rz * (hw - 0.4) + t.tz * 2.5];
      } else if (kind === 'xing') {
        // the zebra crossing nearest to this point of the route: look at its kerb end from the pavement
        // prefer crossings with pavement on both sides (mid-block crossings show the dropped kerbs best)
        const cs = G.world.roadBuilder.crossings.filter((q) => (q.piece.swLeft || 0) > 1.5 && (q.piece.swRight || 0) > 1.5);
        let best = null, bd = 1e9;
        for (const q of cs) { const dd = Math.hypot(q.x - a.x, q.z - a.z); if (dd < bd) { bd = dd; best = q; } }
        const lx = best.dz, lz = -best.dx;
        const ex = best.x + lx * best.hw, ez = best.z + lz * best.hw;
        cam = [ex + lx * 4.2 + best.dx * 3.2, 1.6, ez + lz * 4.2 + best.dz * 3.2];
        tgt = [ex - lx * 0.5, 0.0, ez - lz * 0.5];
      } else if (kind === 'road') {
        cam = [a.x + rx * 1.6, 2.3, a.z + rz * 1.6];
        tgt = [a.x + rx * 1.0 + t.tx * 30, 0.4, a.z + rz * 1.0 + t.tz * 30];
      } else if (kind === 'facade') {
        cam = [a.x + rx * (hw + 1.5), 1.65, a.z + rz * (hw + 1.5)];
        tgt = [a.x - rx * 30 + t.tx * 6, 7, a.z - rz * 30 + t.tz * 6];
      } else {
        cam = [a.x, 1.7, a.z];
        tgt = [a.x + rx * 30 + t.tx * 6, 7, a.z + rz * 30 + t.tz * 6];
      }
      c.fov = 62; c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
      c.position.set(cam[0], H(cam[0], cam[2]) + cam[1] + (kind === 'kerb' || kind === 'down' || kind === 'facade' || kind === 'xing' ? 0.22 : 0.07), cam[2]);
      c.lookAt(tgt[0], H(tgt[0], tgt[2]) + tgt[1], tgt[2]);
      G.sky.follow(c.position.clone());
      G.world.updateVisibility(c.position);
      for (let i = 0; i < 3; i++) G.renderer.render();
      return 1;
    }, [dir, Number(s), kind]);
    const buf = await p.screenshot({ type: 'jpeg', quality: 88 });
    require('fs').writeFileSync(path.join(out, `${name}.jpg`), buf);
    console.log('shot', name);
  }
  if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 3).join(' | '));
  await b.close();
})();
