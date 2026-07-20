/* =========================================================================
 * SpawnHub — boot sequence: build world -> light -> mesh -> render
 * ========================================================================= */
(function () {
  if (typeof document === 'undefined') return; // node smoke test stops here
  const SH = globalThis.SpawnHub;
  const E = SH.Engine, W = SH.W;

  const msg = (s) => { const el = document.getElementById('loadmsg'); if (el) el.textContent = s; };
  const bar = (f) => { const el = document.getElementById('loadbar'); if (el) el.style.width = (f * 100).toFixed(1) + '%'; };
  const sleep = () => new Promise(r => setTimeout(r, 0));

  const VIEWS = {
    plaza:    { target: [144, 38, 146], yaw: 2.6, pitch: -0.35, dist: 52, auto: true },
    overview: { target: [150, 40, 150], yaw: 0.8, pitch: -0.55, dist: 150, auto: true },
    tower:    { target: [76, 50, 200], yaw: 4.2, pitch: -0.25, dist: 55 },
    shops:    { target: [136, 38, 88], yaw: 3.6, pitch: -0.3, dist: 45 },
    modern:   { target: [232, 52, 82], yaw: 1.3, pitch: -0.3, dist: 70 },
    bee:      { target: [130, 45, 200], yaw: 5.6, pitch: -0.3, dist: 45 },
    field:    { target: [214, 36, 206], yaw: 0.6, pitch: -0.45, dist: 55 },
    pond:     { target: [168, 34, 202], yaw: 5.2, pitch: -0.25, dist: 35 },
  };

  async function boot() {
    try {
      msg('Painting textures…'); bar(0.05); await sleep();
      E.buildAtlas();

      msg('Building the world…'); bar(0.15); await sleep();
      const errs = SpawnBuilds.runAll();
      for (const e of errs) console.error('build "' + e.build + '" failed:', e.error);
      if (SH.warnings && SH.warnings.length) console.warn(SH.warnings.join('\n'));

      msg('Casting moonlight & lanterns…'); bar(0.35); await sleep();
      E.computeLight();

      msg('Meshing chunks…'); bar(0.5); await sleep();
      const { jobs, chunkBuild, chunks } = E.buildMeshes();
      for (let i = 0; i < jobs.length; i++) {
        chunks.push(chunkBuild(jobs[i][0], jobs[i][1]));
        if ((i & 15) === 15) { bar(0.5 + 0.45 * i / jobs.length); msg('Meshing chunks… ' + ((i / jobs.length * 100) | 0) + '%'); await sleep(); }
      }

      msg('Starting renderer…'); bar(0.98); await sleep();
      E.boot();
      E.setView(VIEWS.plaza);

      document.getElementById('loader').style.display = 'none';
      document.getElementById('hud').style.display = '';
    } catch (err) {
      console.error(err);
      msg('Error: ' + err.message);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    // view buttons
    const nav = document.getElementById('views');
    for (const [name, v] of Object.entries(VIEWS)) {
      const b = document.createElement('button');
      b.textContent = name[0].toUpperCase() + name.slice(1);
      b.onclick = () => E.setView(v);
      nav.appendChild(b);
    }
    const helpBtn = document.getElementById('helpbtn');
    helpBtn.onclick = () => {
      const h = document.getElementById('help');
      h.style.display = h.style.display === 'none' ? '' : 'none';
    };
    boot();
  });
})();
