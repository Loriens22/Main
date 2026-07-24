/* =====================================================================
   APP  —  boot pipeline, camera, desktop + touch controls, cinematic
   tour, HUD. Everything the page needs once the modules are loaded.
   ===================================================================== */

(function (root) {
  'use strict';

  const D = document;
  const $ = id => D.getElementById(id);
  const GXO = 96, GYO = 0, GZO = 96;              // world -> grid offset

  const ENV = {
    zenith: new Float32Array([0.016, 0.021, 0.055]),
    horizon: new Float32Array([0.055, 0.070, 0.135]),
    fog: new Float32Array([0.052, 0.066, 0.125]),
    skyTint: new Float32Array([0.42, 0.52, 0.86]),
    lampTint: new Float32Array([1.00, 0.70, 0.40]),
    skyPower: 0.155,
    fov: 74,
    vignette: 0.55,
    bloomThresh: 0.62,
  };

  const state = {
    cam: { x: 96, y: 44, z: 118, yaw: Math.PI, pitch: -0.12 },
    vel: { x: 0, y: 0, z: 0 },
    keys: Object.create(null),
    speed: 13,
    tour: true,
    tourIdx: 0, tourT: 0, tourFrom: null,
    quality: 'high',
    pois: [],
    lastInput: 0,
    fps: 0, frames: 0, fpsT: 0,
    running: false,
  };

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  const bar = () => $('bar');
  const note = () => $('note');
  function setProgress(p, text) {
    const b = bar(); if (b) b.style.width = Math.round(p * 100) + '%';
    if (text && note()) note().textContent = text;
  }
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  async function boot() {
    const canvas = $('gl');
    let R;
    try {
      R = new root.MCRender.Renderer(canvas, {});
    } catch (e) {
      $('loader').innerHTML = '<div class="fail"><h1>WebGL2 unavailable</h1>' +
        '<p>This scene needs WebGL2. Try an up-to-date Chrome, Safari, Firefox or Edge, ' +
        'and make sure hardware acceleration is switched on.</p><p class="dim">' +
        String(e.message || e) + '</p></div>';
      return;
    }
    state.R = R;

    const W = root.World, BLOCKS = root.MCBlocks.BLOCKS;

    setProgress(0.02, 'painting block textures');
    await nextFrame();
    const atlas = root.MCTextures.buildAtlas(root.MCBlocks.TEX_SET);
    R.uploadTextures(atlas);

    setProgress(0.08, 'raising terrain, hills and lakes');
    await nextFrame();
    root.BUILDERS.terrain();

    const order = [
      ['poor', 'building the tenement and the lava fall'],
      ['bee', 'raising the Bee Hall'],
      ['modern', 'assembling the modern quarter'],
      ['market', 'opening the market district'],
      ['sports', 'marking out the pitch'],
      ['plaza', 'laying the spawn plaza and the paths'],
    ];
    for (let i = 0; i < order.length; i++) {
      const [name, msg] = order[i];
      setProgress(0.12 + 0.28 * (i / order.length), msg);
      await nextFrame();
      if (root.BUILDERS[name]) root.BUILDERS[name]();
    }

    setProgress(0.44, 'propagating light');
    await nextFrame();
    const light = root.MCLight.computeLight(W, BLOCKS);

    setProgress(0.52, 'building meshes');
    await nextFrame();
    const gen = root.MCMesher.meshGen(W, BLOCKS, light, { chunk: 32 });
    let r = gen.next(), t0 = performance.now();
    while (!r.done) {
      setProgress(0.52 + 0.40 * (r.value || 0), 'building meshes');
      if (performance.now() - t0 > 60) { await nextFrame(); t0 = performance.now(); }
      r = gen.next();
    }
    const chunks = r.value;

    setProgress(0.94, 'uploading to the GPU');
    await nextFrame();
    R.uploadChunks(chunks, [0, 0, 0]);
    R.initParticles(state.quality === 'low' ? 1400 : 4200);

    /* particles + POIs, translated into grid space */
    const PS = new root.MCParticles.System(state.quality === 'low' ? 1400 : 4200);
    PS.setMarkers(W.markers.map(m => Object.assign({}, m, {
      x: m.x + GXO, y: m.y + GYO, z: m.z + GZO,
    })));
    state.PS = PS;

    state.pois = W.pois.map(p => ({
      label: p.label, x: p.x + GXO, y: p.y + GYO, z: p.z + GZO,
      yaw: p.yaw * Math.PI / 180, pitch: p.pitch * Math.PI / 180,
    }));
    // spawn first, then a pleasing order around the map
    state.pois.sort((a, b) => (a.label === 'Spawn' ? -1 : b.label === 'Spawn' ? 1 : 0));
    buildPlaceMenu();

    const spawn = state.pois[0];
    if (spawn) { state.cam.x = spawn.x; state.cam.y = spawn.y; state.cam.z = spawn.z; state.cam.yaw = spawn.yaw; state.cam.pitch = spawn.pitch; }

    setProgress(1, 'ready');
    await nextFrame();
    $('loader').classList.add('gone');
    setTimeout(() => { const l = $('loader'); if (l) l.style.display = 'none'; }, 900);
    $('hud').classList.add('on');

    state.running = true;
    applyQuality(detectQuality());
    requestAnimationFrame(loop);
  }

  function detectQuality() {
    const small = Math.min(innerWidth, innerHeight) < 620;
    const mem = navigator.deviceMemory || 4;
    const touch = matchMedia('(hover: none)').matches;
    if (small || mem <= 3) return 'low';
    if (touch || mem <= 6) return 'medium';
    return 'high';
  }

  function applyQuality(q) {
    state.quality = q;
    const R = state.R;
    R.quality = q;
    if (q === 'low') { R.fogStart = 34; R.fogEnd = 118; R.bloomAmt = 0.30; state.dprCap = 1.0; }
    else if (q === 'medium') { R.fogStart = 48; R.fogEnd = 175; R.bloomAmt = 0.38; state.dprCap = 1.35; }
    else { R.fogStart = 62; R.fogEnd = 235; R.bloomAmt = 0.44; state.dprCap = 2.0; }
    ENV.fov = q === 'low' ? 70 : 74;
    for (const b of D.querySelectorAll('[data-q]')) b.classList.toggle('sel', b.dataset.q === q);
    resize(true);
  }

  /* ------------------------------------------------------------------ */
  /* camera + tour                                                       */
  /* ------------------------------------------------------------------ */
  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function updateTour(dt) {
    const P = state.pois;
    if (!P.length) return;
    const HOLD = 4.6, MOVE = 6.2;
    state.tourT += dt;
    const cur = P[state.tourIdx % P.length];
    const nxt = P[(state.tourIdx + 1) % P.length];
    if (!state.tourFrom) state.tourFrom = { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch };

    if (state.tourT < HOLD) {
      // gentle drift while holding on a viewpoint
      const k = state.tourT / HOLD;
      const sw = Math.sin(state.tourT * 0.42);
      state.cam.x = cur.x + sw * 1.1;
      state.cam.y = cur.y + Math.sin(state.tourT * 0.31) * 0.5;
      state.cam.z = cur.z + Math.cos(state.tourT * 0.37) * 1.1;
      state.cam.yaw = cur.yaw + sw * 0.045;
      state.cam.pitch = cur.pitch + Math.sin(state.tourT * 0.29) * 0.018;
      void k;
      const el = $('placeName'); if (el && el.textContent !== cur.label) el.textContent = cur.label;
    } else {
      const t = Math.min(1, (state.tourT - HOLD) / MOVE), e = ease(t);
      const a = cur, b = nxt;
      // arc slightly upward between viewpoints so it reads as a fly-through
      const lift = Math.sin(t * Math.PI) * Math.min(22, Math.abs(a.x - b.x) * 0.22 + Math.abs(a.z - b.z) * 0.22 + 4);
      state.cam.x = a.x + (b.x - a.x) * e;
      state.cam.y = a.y + (b.y - a.y) * e + lift;
      state.cam.z = a.z + (b.z - a.z) * e;
      state.cam.yaw = lerpAngle(a.yaw, b.yaw, e);
      state.cam.pitch = a.pitch + (b.pitch - a.pitch) * e - Math.sin(t * Math.PI) * 0.10;
      if (t >= 1) { state.tourIdx = (state.tourIdx + 1) % P.length; state.tourT = 0; state.tourFrom = null; }
    }
  }

  function goTo(i) {
    const p = state.pois[i]; if (!p) return;
    state.tour = false; setTourBtn();
    state.cam.x = p.x; state.cam.y = p.y; state.cam.z = p.z;
    state.cam.yaw = p.yaw; state.cam.pitch = p.pitch;
    const el = $('placeName'); if (el) el.textContent = p.label;
    closeMenus();
  }

  function updateFree(dt) {
    const k = state.keys;
    let fx = 0, fz = 0, up = 0;
    if (k['w'] || k['arrowup']) fz += 1;
    if (k['s'] || k['arrowdown']) fz -= 1;
    if (k['a'] || k['arrowleft']) fx -= 1;
    if (k['d'] || k['arrowright']) fx += 1;
    if (k[' '] || k['e']) up += 1;
    if (k['shift'] || k['q']) up -= 1;
    if (state.joy) { fx += state.joy.x; fz += -state.joy.y; }

    const boost = k['control'] ? 3.2 : 1;
    const sp = state.speed * boost;
    const cy = Math.cos(state.cam.yaw), sy = Math.sin(state.cam.yaw);
    const cp = Math.cos(state.cam.pitch), sp2 = Math.sin(state.cam.pitch);
    const dirX = sy * cp, dirY = sp2, dirZ = cy * cp;
    const rX = cy, rZ = -sy;

    const tx = (dirX * fz + rX * fx) * sp;
    const ty = (dirY * fz) * sp + up * sp * 0.85;
    const tz = (dirZ * fz + rZ * fx) * sp;
    const a = 1 - Math.pow(0.0016, dt);
    state.vel.x += (tx - state.vel.x) * a;
    state.vel.y += (ty - state.vel.y) * a;
    state.vel.z += (tz - state.vel.z) * a;
    state.cam.x += state.vel.x * dt;
    state.cam.y += state.vel.y * dt;
    state.cam.z += state.vel.z * dt;
    state.cam.y = Math.max(2, Math.min(110, state.cam.y));
    state.cam.x = Math.max(1, Math.min(190, state.cam.x));
    state.cam.z = Math.max(1, Math.min(190, state.cam.z));
  }

  /* ------------------------------------------------------------------ */
  /* main loop                                                           */
  /* ------------------------------------------------------------------ */
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!state.running) return;
    const t = now / 1000;
    let dt = last ? Math.min(0.05, t - last) : 0.016;
    last = t;

    if (state.tour) updateTour(dt); else updateFree(dt);

    resize(false);
    const n = state.PS.update(dt, state.cam, {
      radius: state.quality === 'low' ? 62 : state.quality === 'medium' ? 88 : 118,
      scale: state.quality === 'low' ? 0.45 : state.quality === 'medium' ? 0.75 : 1,
    });
    state.R.frame(state.cam, t, state.PS.buf, n, ENV);

    state.frames++;
    if (t - state.fpsT > 0.5) {
      state.fps = Math.round(state.frames / (t - state.fpsT));
      state.frames = 0; state.fpsT = t;
      const s = $('stats');
      if (s) s.textContent = state.fps + ' fps · ' + (state.R.tris / 1000 | 0) + 'k tris · ' +
        state.R.drawn + ' chunks';
    }
  }

  function resize(force) {
    const dpr = Math.min(devicePixelRatio || 1, state.dprCap || 2);
    const w = innerWidth, h = innerHeight;
    if (force || w !== state._w || h !== state._h || dpr !== state._d) {
      state._w = w; state._h = h; state._d = dpr;
      state.R.resize(w, h, dpr);
    }
  }

  /* ------------------------------------------------------------------ */
  /* input                                                               */
  /* ------------------------------------------------------------------ */
  function stopTour() {
    if (state.tour) { state.tour = false; setTourBtn(); }
  }
  function setTourBtn() {
    const b = $('btnTour');
    if (b) { b.textContent = state.tour ? '❚❚' : '▶'; b.title = state.tour ? 'Pause the tour' : 'Play the tour'; }
    const n = $('placeName');
    if (n && !state.tour) n.textContent = 'Free flight';
  }

  function bindInput() {
    const c = $('gl');
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      state.keys[k] = true;
      if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === ' ' || k.startsWith('arrow')) { stopTour(); e.preventDefault(); }
      if (k === 't') toggleTour();
      if (k === 'h') toggle('help');
      if (k === 'p') toggle('places');
    });
    addEventListener('keyup', e => { state.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { state.keys = Object.create(null); });

    /* ---- mouse look ---- */
    let dragging = false, lx = 0, ly = 0;
    c.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing';
      stopTour();
    });
    c.addEventListener('pointermove', e => {
      if (!dragging || e.pointerType === 'touch') return;
      state.cam.yaw -= (e.clientX - lx) * 0.0032;
      state.cam.pitch -= (e.clientY - ly) * 0.0032;
      state.cam.pitch = Math.max(-1.5, Math.min(1.5, state.cam.pitch));
      lx = e.clientX; ly = e.clientY;
    });
    const end = () => { dragging = false; c.style.cursor = 'grab'; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', e => {
      state.speed = Math.max(3, Math.min(70, state.speed * (e.deltaY > 0 ? 0.86 : 1.16)));
      e.preventDefault();
    }, { passive: false });

    /* ---- touch: left half drives, right half looks ---- */
    const touches = new Map();
    const joyEl = $('joy'), joyKnob = $('joyKnob');
    c.addEventListener('touchstart', e => {
      stopTour();
      for (const t of e.changedTouches) {
        const left = t.clientX < innerWidth * 0.42;
        touches.set(t.identifier, { left, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY });
        if (left) {
          state.joy = { x: 0, y: 0 };
          joyEl.style.display = 'block';
          joyEl.style.left = (t.clientX - 55) + 'px';
          joyEl.style.top = (t.clientY - 55) + 'px';
          joyKnob.style.transform = 'translate(0,0)';
        }
      }
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        const rec = touches.get(t.identifier);
        if (!rec) continue;
        if (rec.left) {
          let dx = t.clientX - rec.sx, dy = t.clientY - rec.sy;
          const len = Math.hypot(dx, dy), max = 46;
          if (len > max) { dx = dx / len * max; dy = dy / len * max; }
          state.joy = { x: dx / max, y: dy / max };
          joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
        } else {
          state.cam.yaw -= (t.clientX - rec.x) * 0.0055;
          state.cam.pitch -= (t.clientY - rec.y) * 0.0055;
          state.cam.pitch = Math.max(-1.5, Math.min(1.5, state.cam.pitch));
        }
        rec.x = t.clientX; rec.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const tend = e => {
      for (const t of e.changedTouches) {
        const rec = touches.get(t.identifier);
        if (rec && rec.left) { state.joy = null; joyEl.style.display = 'none'; }
        touches.delete(t.identifier);
      }
    };
    c.addEventListener('touchend', tend);
    c.addEventListener('touchcancel', tend);

    /* ---- buttons ---- */
    $('btnTour').onclick = toggleTour;
    $('btnPlaces').onclick = () => toggle('places');
    $('btnHelp').onclick = () => toggle('help');
    $('btnUp').onclick = () => { stopTour(); state.cam.y = Math.min(105, state.cam.y + 14); };
    for (const b of D.querySelectorAll('[data-q]')) b.onclick = () => applyQuality(b.dataset.q);
    for (const b of D.querySelectorAll('[data-close]')) b.onclick = closeMenus;
    addEventListener('resize', () => resize(true));
  }

  function toggleTour() {
    state.tour = !state.tour;
    if (state.tour) { state.tourT = 0; state.tourFrom = null; }
    setTourBtn();
  }
  function toggle(id) {
    const el = $(id);
    const wasOpen = el.classList.contains('open');
    closeMenus();
    if (!wasOpen) el.classList.add('open');
  }
  function closeMenus() {
    for (const el of D.querySelectorAll('.panel')) el.classList.remove('open');
  }
  function buildPlaceMenu() {
    const list = $('placeList');
    list.innerHTML = '';
    state.pois.forEach((p, i) => {
      const b = D.createElement('button');
      b.textContent = p.label;
      b.onclick = () => goTo(i);
      list.appendChild(b);
    });
  }

  /* ------------------------------------------------------------------ */
  root.startApp = function () { bindInput(); setTourBtn(); boot(); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
