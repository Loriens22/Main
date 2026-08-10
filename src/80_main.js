/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   80_main.js - integration layer. Owns boot order, the frame loop, the
   over-the-shoulder camera, weather, the particle pool, and the story
   director that binds simulation events to dialogue, audio and UI.

   Every cross-module call is guarded: a missing or broken subsystem degrades
   into a documented stub rather than a black screen.
   ========================================================================== */
(function () {
  'use strict';

  var M4 = IP.M4, V3 = IP.V3, Q = IP.Q, U = IP.Util;

  var Game = {
    running: false,
    paused: false,
    booted: false,
    quality: 2,
    S: null,
    level: null,
    err: [],
    dbg: { noRender: false, freeCam: false, showColliders: false }
  };

  /* ------------------------------------------------------------------ */
  /*  Defensive module access                                            */
  /* ------------------------------------------------------------------ */
  function has(mod, fn) {
    return !!(IP[mod] && typeof IP[mod][fn] === 'function');
  }
  function note(where, e) {
    var msg = where + ': ' + (e && e.message ? e.message : e);
    if (Game.err.length < 40 && Game.err.indexOf(msg) < 0) { Game.err.push(msg); }
    if (typeof console !== 'undefined') { console.warn('[IP] ' + msg, e); }
  }
  function attempt(where, fn, fallback) {
    try { return fn(); } catch (e) { note(where, e); return fallback; }
  }
  function progress(f, msg) {
    if (typeof window !== 'undefined' && window.IP_BOOT) { window.IP_BOOT.progress(f, msg); }
  }

  /* ------------------------------------------------------------------ */
  /*  Tunables                                                           */
  /* ------------------------------------------------------------------ */
  var CAM = {
    pivotHeight: 1.50,
    pivotHeightAim: 1.545,
    pivotHeightCrouch: 0.98,
    shoulder: 0.42,
    shoulderAim: 0.56,
    dist: 2.45,
    distAim: 1.28,
    distSprint: 2.95,
    fov: 1.152,          /* 66 deg */
    fovAim: 0.855,       /* 49 deg */
    fovSprint: 1.257,    /* 72 deg */
    pitchMin: -1.15,
    pitchMax: 1.05,
    radius: 0.26,
    followLag: 14.0,
    aimLag: 22.0,
    sensYaw: 0.0026,
    sensPitch: 0.0024
  };

  var cam = {
    yaw: 0, pitch: 0.06, roll: 0,
    dist: CAM.dist, shoulder: CAM.shoulder, fov: CAM.fov, pivotY: CAM.pivotHeight,
    pos: V3.create(0, 2, 6),
    smoothPos: V3.create(0, 2, 6),
    quat: Q.create(),
    pivot: V3.create(0, 1.5, 0),
    shakeAmp: 0, shakeFreq: 26, shakeT: 0,
    recoilPitch: 0, recoilYaw: 0, recoilVelP: 0, recoilVelY: 0,
    swayT: 0, side: 1
  };

  /* scratch - never allocate in the frame loop */
  var _v0 = V3.create(), _v1 = V3.create(), _v2 = V3.create(), _v3 = V3.create();
  var _m0 = M4.create(), _m1 = M4.create();
  var _q0 = Q.create(), _q1 = Q.create();

  /* ------------------------------------------------------------------ */
  /*  Scene object (reused every frame)                                  */
  /* ------------------------------------------------------------------ */
  var scene = {
    camera: { pos: V3.create(), quat: Q.create(), fov: CAM.fov, near: 0.06, far: 420 },
    sun: { dir: [0.32, -0.78, 0.54], color: [0.42, 0.50, 0.66], intensity: 0.85,
           ambient: [0.045, 0.062, 0.085] },
    fog: { color: [0.035, 0.048, 0.062], density: 0.026, height: 9.0, heightFalloff: 0.14 },
    lights: [],
    items: [],
    transparent: [],
    sprites: [],
    post: { exposure: 1.0, bloom: 0.62, grain: 0.26, chroma: 0.38, vignette: 0.64,
            saturation: 0.80, contrast: 1.12, hurt: 0, flashbang: 0, lightning: 0 },
    time: 0,
    quality: 2
  };

  /* Array reuse: reset length to 0 rather than allocating a new array. */
  function reset(a) { a.length = 0; return a; }

  /* ------------------------------------------------------------------ */
  /*  GPU level cache                                                    */
  /* ------------------------------------------------------------------ */
  var gpuSections = {};   /* sectionId -> { chunks:[{mesh,mat,bounds}], transparent:[] } */
  var staticItems = [];   /* draw items for the active + adjacent sections */

  function uploadLevel(level) {
    var total = 0, done = 0, i, j, s;
    for (i = 0; i < level.sections.length; i++) {
      s = level.sections[i];
      total += ((s.geo && s.geo.opaque) ? s.geo.opaque.length : 0) +
               ((s.geo && s.geo.transparent) ? s.geo.transparent.length : 0);
    }
    if (!total) { total = 1; }
    for (i = 0; i < level.sections.length; i++) {
      s = level.sections[i];
      var entry = { chunks: [], transparent: [] };
      var op = (s.geo && s.geo.opaque) || [];
      for (j = 0; j < op.length; j++) {
        var c = op[j];
        var gd = c.geoData || c.geo || c;
        var mesh = attempt('upload ' + s.id, function () { return IP.Renderer.upload(gd); }, null);
        if (mesh) {
          entry.chunks.push({
            geo: mesh, mat: c.material || c.mat || {}, m: M4.create(),
            castShadow: c.castShadow !== false, skin: null
          });
        }
        done++;
        if ((done & 7) === 0) { progress(0.35 + 0.45 * (done / total), 'Uploading terrain'); }
      }
      var tr = (s.geo && s.geo.transparent) || [];
      for (j = 0; j < tr.length; j++) {
        var t = tr[j];
        var tgd = t.geoData || t.geo || t;
        var tmesh = attempt('upload-t ' + s.id, function () { return IP.Renderer.upload(tgd); }, null);
        if (tmesh) {
          entry.transparent.push({
            geo: tmesh, mat: t.material || t.mat || {}, m: M4.create(),
            castShadow: false, skin: null
          });
        }
        done++;
      }
      gpuSections[s.id] = entry;
    }
  }

  /* Sections kept resident: the active one plus anything it connects to. */
  var activeSections = [];
  function refreshActiveSections(sectionId) {
    reset(activeSections).push(sectionId);
    var tr = (Game.level && Game.level.transitions) || [];
    for (var i = 0; i < tr.length; i++) {
      if (tr[i].from === sectionId && activeSections.indexOf(tr[i].to) < 0) { activeSections.push(tr[i].to); }
      if (tr[i].to === sectionId && activeSections.indexOf(tr[i].from) < 0) { activeSections.push(tr[i].from); }
    }
    reset(staticItems);
    for (var k = 0; k < activeSections.length; k++) {
      var e = gpuSections[activeSections[k]];
      if (!e) { continue; }
      for (var c = 0; c < e.chunks.length; c++) { staticItems.push(e.chunks[c]); }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Actor instances                                                    */
  /* ------------------------------------------------------------------ */
  var rigs = { player: null, elena: null };
  var enemyRigs = [];      /* parallel to S.enemies; pooled per kind */
  var rigPool = {};        /* kind -> [rig,...] free list */
  var poseScratch = {
    anim: 'idle', t: 0, speed: 0, aimPitch: 0, aimYaw: 0, lookAt: null,
    blend: 1, injured: 0, fear: 0, limbLost: { larm: false, rarm: false, head: false },
    hitDir: [0, 0, 1]
  };

  function acquireRig(kind) {
    var pool = rigPool[kind] || (rigPool[kind] = []);
    if (pool.length) { return pool.pop(); }
    return attempt('makeRig ' + kind, function () { return IP.Actors.makeRig(kind); }, null);
  }
  function releaseRig(kind, rig) {
    if (!rig) { return; }
    (rigPool[kind] || (rigPool[kind] = [])).push(rig);
  }

  /* Map a simulation entity's logical state onto a poseState. */
  function fillPose(ent, out) {
    out.anim = ent.anim || (ent.dead ? 'death' : (ent.speed > 4.2 ? 'sprint'
              : ent.speed > 1.9 ? 'run' : ent.speed > 0.12 ? 'walk' : 'idle'));
    out.t = ent.animT || 0;
    out.speed = ent.speed || 0;
    out.aimPitch = ent.aimPitch || 0;
    out.aimYaw = ent.aimYaw || 0;
    out.lookAt = ent.lookAt || null;
    out.blend = ent.animBlend === undefined ? 1 : ent.animBlend;
    out.injured = ent.maxHealth ? U.clamp(1 - (ent.health / ent.maxHealth), 0, 1) : 0;
    out.fear = ent.fear || 0;
    if (ent.limbLost) {
      out.limbLost.larm = !!ent.limbLost.larm;
      out.limbLost.rarm = !!ent.limbLost.rarm;
      out.limbLost.head = !!ent.limbLost.head;
    } else {
      out.limbLost.larm = out.limbLost.rarm = out.limbLost.head = false;
    }
    if (ent.hitDir) {
      out.hitDir[0] = ent.hitDir[0]; out.hitDir[1] = ent.hitDir[1]; out.hitDir[2] = ent.hitDir[2];
    }
    return out;
  }

  function drawActor(rig, pos, yaw, ent, dt) {
    if (!rig) { return; }
    fillPose(ent, poseScratch);
    attempt('pose', function () { IP.Actors.pose(rig, poseScratch, dt); });
    Q.fromEuler(_q0, 0, yaw, 0);
    _v0[0] = pos[0]; _v0[1] = pos[1]; _v0[2] = pos[2];
    _v1[0] = _v1[1] = _v1[2] = ent.scale || 1;
    M4.fromTRS(_m0, _v0, _q0, _v1);
    attempt('collect', function () { IP.Actors.collect(rig, _m0, scene.items); });
  }

  function syncEnemyRigs(S, dt) {
    var i, e;
    /* release rigs whose entity is gone */
    for (i = enemyRigs.length - 1; i >= 0; i--) {
      if (i >= S.enemies.length || !S.enemies[i] || enemyRigs[i].kind !== S.enemies[i].kind) {
        releaseRig(enemyRigs[i].kind, enemyRigs[i].rig);
        enemyRigs.splice(i, 1);
      }
    }
    for (i = 0; i < S.enemies.length; i++) {
      e = S.enemies[i];
      if (!e) { continue; }
      if (!enemyRigs[i] || enemyRigs[i].kind !== e.kind) {
        enemyRigs[i] = { kind: e.kind, rig: acquireRig(e.kind) };
      }
      /* cull by distance and frustum-ish dot before posing (posing is the cost) */
      var dx = e.pos[0] - cam.pos[0], dz = e.pos[2] - cam.pos[2];
      if (dx * dx + dz * dz > 3600) { continue; }
      drawActor(enemyRigs[i].rig, e.pos, e.yaw || 0, e, dt);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Particle pool -> scene.sprites                                     */
  /* ------------------------------------------------------------------ */
  var MAXP = 2600;
  var P = {
    x: new Float32Array(MAXP), y: new Float32Array(MAXP), z: new Float32Array(MAXP),
    vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), vz: new Float32Array(MAXP),
    life: new Float32Array(MAXP), maxLife: new Float32Array(MAXP),
    size: new Float32Array(MAXP), size1: new Float32Array(MAXP),
    r: new Float32Array(MAXP), g: new Float32Array(MAXP), b: new Float32Array(MAXP),
    a0: new Float32Array(MAXP), drag: new Float32Array(MAXP), grav: new Float32Array(MAXP),
    kind: new Array(MAXP), n: 0, head: 0
  };
  var spritePool = [];
  for (var _sp = 0; _sp < MAXP + 3400; _sp++) {
    spritePool.push({ pos: V3.create(), size: 0.1, color: [1, 1, 1, 1], kind: 'spark' });
  }
  var spriteCursor = 0;
  function emitSprite(x, y, z, size, r, g, b, a, kind) {
    if (spriteCursor >= spritePool.length) { return; }
    var s = spritePool[spriteCursor++];
    s.pos[0] = x; s.pos[1] = y; s.pos[2] = z;
    s.size = size;
    s.color[0] = r; s.color[1] = g; s.color[2] = b; s.color[3] = a;
    s.kind = kind;
    scene.sprites.push(s);
  }

  function spawnParticle(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, kind) {
    var i = P.head;
    P.head = (P.head + 1) % MAXP;
    if (P.n < MAXP) { P.n++; }
    P.x[i] = x; P.y[i] = y; P.z[i] = z;
    P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.life[i] = life; P.maxLife[i] = life;
    P.size[i] = s0; P.size1[i] = s1;
    P.r[i] = r; P.g[i] = g; P.b[i] = b; P.a0[i] = a;
    P.drag[i] = drag; P.grav[i] = grav; P.kind[i] = kind;
  }

  var burstRand = IP.Rand.make(4242);
  function burst(kind, pos, dir, count, power) {
    var i, sx, sy, sz, sp;
    dir = dir || [0, 1, 0];
    for (i = 0; i < count; i++) {
      sx = (burstRand.f() - 0.5) * 2; sy = (burstRand.f() - 0.5) * 2; sz = (burstRand.f() - 0.5) * 2;
      sp = power * (0.35 + burstRand.f() * 0.9);
      switch (kind) {
        case 'blood':
          spawnParticle(pos[0], pos[1], pos[2],
            (dir[0] + sx * 0.85) * sp, (dir[1] + sy * 0.85) * sp + 1.1, (dir[2] + sz * 0.85) * sp,
            0.55 + burstRand.f() * 0.5, 0.055, 0.015,
            0.38, 0.028, 0.03, 0.95, 1.6, 8.2, 'blood');
          break;
        case 'spark':
          spawnParticle(pos[0], pos[1], pos[2],
            (dir[0] + sx) * sp * 2.1, (dir[1] + sy) * sp * 2.1 + 0.7, (dir[2] + sz) * sp * 2.1,
            0.25 + burstRand.f() * 0.32, 0.035, 0.004,
            1.0, 0.72, 0.28, 1.0, 2.4, 10.5, 'spark');
          break;
        case 'smoke':
          spawnParticle(pos[0], pos[1], pos[2],
            sx * sp * 0.35, sy * sp * 0.2 + 0.55, sz * sp * 0.35,
            1.5 + burstRand.f() * 1.6, 0.22, 1.35,
            0.14, 0.145, 0.15, 0.42, 0.9, -0.25, 'smoke');
          break;
        case 'spore':
          spawnParticle(pos[0], pos[1], pos[2],
            sx * 0.42, sy * 0.28 + 0.22, sz * 0.42,
            3.0 + burstRand.f() * 2.5, 0.05, 0.09,
            0.30, 0.95, 0.42, 0.55, 0.45, -0.06, 'spore');
          break;
        case 'debris':
          spawnParticle(pos[0], pos[1], pos[2],
            (dir[0] + sx) * sp * 1.4, Math.abs(dir[1] + sy) * sp * 1.9 + 1.4, (dir[2] + sz) * sp * 1.4,
            1.1 + burstRand.f() * 0.9, 0.07, 0.05,
            0.32, 0.29, 0.25, 0.9, 1.1, 9.4, 'smoke');
          break;
        case 'muzzle':
          spawnParticle(pos[0], pos[1], pos[2],
            dir[0] * 5.5 + sx, dir[1] * 5.5 + sy, dir[2] * 5.5 + sz,
            0.06, 0.32, 0.03,
            1.0, 0.85, 0.55, 1.0, 6.0, 0.4, 'muzzle');
          break;
        default:
          spawnParticle(pos[0], pos[1], pos[2], sx * sp, sy * sp, sz * sp,
            0.6, 0.1, 0.02, 1, 1, 1, 0.8, 1.5, 3.0, 'spark');
      }
    }
  }

  function updateParticles(dt) {
    var i, l, t, k, sz, al, d;
    for (i = 0; i < MAXP; i++) {
      l = P.life[i];
      if (l <= 0) { continue; }
      l -= dt;
      P.life[i] = l;
      if (l <= 0) { continue; }
      d = Math.exp(-P.drag[i] * dt);
      P.vx[i] *= d; P.vz[i] *= d;
      P.vy[i] = P.vy[i] * d - P.grav[i] * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      /* cheap ground stop so blood/debris pools instead of falling forever */
      if (P.y[i] < groundY - 0.02 && P.grav[i] > 1) {
        P.y[i] = groundY; P.vy[i] = 0; P.vx[i] *= 0.25; P.vz[i] *= 0.25;
        if (P.life[i] > 0.5) { P.life[i] = 0.5; }
      }
      t = 1 - l / P.maxLife[i];
      sz = P.size[i] + (P.size1[i] - P.size[i]) * t;
      k = P.kind[i];
      al = P.a0[i] * (k === 'smoke' || k === 'spore' ? (1 - t) * (1 - t) : (1 - t));
      if (al <= 0.004) { continue; }
      emitSprite(P.x[i], P.y[i], P.z[i], sz, P.r[i], P.g[i], P.b[i], al, k);
    }
  }
  var groundY = 0;

  /* ------------------------------------------------------------------ */
  /*  Weather                                                            */
  /* ------------------------------------------------------------------ */
  var weather = {
    rainIntensity: 0.85,
    wind: [0.9, 0, 0.35],
    indoor: 0,
    lightning: 0,
    lightningTimer: 6,
    thunderPending: -1,
    n: 0,
    x: null, y: null, z: null, v: null
  };
  function initWeather(count) {
    weather.n = count;
    weather.x = new Float32Array(count);
    weather.y = new Float32Array(count);
    weather.z = new Float32Array(count);
    weather.v = new Float32Array(count);
    var r = IP.Rand.make(77);
    for (var i = 0; i < count; i++) {
      weather.x[i] = (r.f() - 0.5) * 34;
      weather.y[i] = r.f() * 20;
      weather.z[i] = (r.f() - 0.5) * 34;
      weather.v[i] = 15 + r.f() * 11;
    }
  }
  function updateWeather(dt, S) {
    /* interior detection: sections tagged indoor damp the rain and the sky */
    var wantIndoor = 0;
    var sec = currentSection(S);
    if (sec && (sec.indoor || /cells|labs|power|tunnels/.test(sec.id || ''))) { wantIndoor = 1; }
    weather.indoor = U.damp(weather.indoor, wantIndoor, 2.2, dt);

    weather.lightningTimer -= dt;
    if (weather.lightningTimer <= 0) {
      weather.lightningTimer = 7 + IP.Rand.f() * 16;
      weather.lightning = 1.0;
      weather.thunderPending = 0.35 + IP.Rand.f() * 2.4;
      if (has('Audio', 'play')) { IP.Audio.play('lightning_crack', { volume: 0.35 }); }
    }
    if (weather.lightning > 0) { weather.lightning = Math.max(0, weather.lightning - dt * 3.4); }
    if (weather.thunderPending > 0) {
      weather.thunderPending -= dt;
      if (weather.thunderPending <= 0) {
        weather.thunderPending = -1;
        if (has('Audio', 'play')) { IP.Audio.play('thunder', { volume: 0.8 }); }
      }
    }
    scene.post.lightning = weather.lightning * weather.lightning * (1 - weather.indoor * 0.72) * 0.85;

    /* rain volume follows the camera; particles wrap inside a moving box */
    var vis = weather.rainIntensity * (1 - weather.indoor * 0.86);
    if (vis <= 0.02 || scene.quality === 0 && vis < 0.3) { return; }
    var n = Math.floor(weather.n * (scene.quality === 0 ? 0.28 : scene.quality === 1 ? 0.6 : 1) * vis);
    var cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
    for (var i = 0; i < n; i++) {
      weather.y[i] -= weather.v[i] * dt;
      weather.x[i] += weather.wind[0] * dt * 2.2;
      weather.z[i] += weather.wind[2] * dt * 2.2;
      if (weather.y[i] < -4) {
        weather.y[i] += 22;
        weather.x[i] = (IP.Rand.f() - 0.5) * 34;
        weather.z[i] = (IP.Rand.f() - 0.5) * 34;
      }
      if (weather.x[i] > 17) { weather.x[i] -= 34; } else if (weather.x[i] < -17) { weather.x[i] += 34; }
      if (weather.z[i] > 17) { weather.z[i] -= 34; } else if (weather.z[i] < -17) { weather.z[i] += 34; }
      emitSprite(cx + weather.x[i], cy + weather.y[i] - 6, cz + weather.z[i],
                 0.028, 0.55, 0.62, 0.72, 0.30 * vis, 'rain');
    }
  }

  function currentSection(S) {
    if (!Game.level || !S) { return null; }
    for (var i = 0; i < Game.level.sections.length; i++) {
      if (Game.level.sections[i].id === S.section) { return Game.level.sections[i]; }
    }
    return Game.level.sections[0];
  }

  /* ------------------------------------------------------------------ */
  /*  Camera                                                             */
  /* ------------------------------------------------------------------ */
  function updateCamera(S, input, dt) {
    var p = S.player;

    /* look input -> yaw/pitch (mouse delta, stick delta and touch swipe all
       arrive pre-normalised from IP.Input) */
    var sens = (IP.UI && IP.UI.settings && IP.UI.settings.sensitivity) || 1;
    cam.yaw -= input.lookX * CAM.sensYaw * sens;
    cam.pitch -= input.lookY * CAM.sensPitch * sens;
    cam.pitch = U.clamp(cam.pitch, CAM.pitchMin, CAM.pitchMax);
    if (cam.yaw > Math.PI) { cam.yaw -= U.TAU; } else if (cam.yaw < -Math.PI) { cam.yaw += U.TAU; }

    /* recoil springs (impulses pushed by the 'shot' event) */
    cam.recoilVelP -= cam.recoilPitch * 118 * dt;
    cam.recoilVelP *= Math.exp(-13.5 * dt);
    cam.recoilPitch += cam.recoilVelP * dt;
    cam.recoilVelY -= cam.recoilYaw * 108 * dt;
    cam.recoilVelY *= Math.exp(-12.0 * dt);
    cam.recoilYaw += cam.recoilVelY * dt;

    /* hand the authoritative aim direction to the simulation */
    p.aimYaw = cam.yaw + cam.recoilYaw;
    p.aimPitch = cam.pitch + cam.recoilPitch;
    p.camYaw = cam.yaw;

    var aiming = !!p.aiming;
    var sprinting = !!p.sprinting && !aiming;
    var lag = aiming ? CAM.aimLag : CAM.followLag;

    cam.dist = U.damp(cam.dist, aiming ? CAM.distAim : (sprinting ? CAM.distSprint : CAM.dist), lag * 0.55, dt);
    cam.shoulder = U.damp(cam.shoulder, (aiming ? CAM.shoulderAim : CAM.shoulder) * cam.side, lag * 0.6, dt);
    cam.fov = U.damp(cam.fov, aiming ? CAM.fovAim : (sprinting ? CAM.fovSprint : CAM.fov), 9.0, dt);
    var targetPivotY = p.crouching ? CAM.pivotHeightCrouch : (aiming ? CAM.pivotHeightAim : CAM.pivotHeight);
    cam.pivotY = U.damp(cam.pivotY, targetPivotY, 11.0, dt);

    /* orientation */
    var shake = 0;
    if (cam.shakeAmp > 0.0004) {
      cam.shakeT += dt;
      cam.shakeAmp *= Math.exp(-6.5 * dt);
      shake = cam.shakeAmp;
    } else { cam.shakeAmp = 0; }
    var reduceMotion = (IP.UI && IP.UI.settings && IP.UI.settings.reduceMotion) ? 0.3 : 1;
    var sYaw = shake * Math.sin(cam.shakeT * cam.shakeFreq) * 0.5 * reduceMotion;
    var sPit = shake * Math.sin(cam.shakeT * cam.shakeFreq * 1.37 + 1.1) * 0.5 * reduceMotion;

    /* breathing / weapon sway when idle-aiming */
    cam.swayT += dt * (aiming ? 0.9 : 1.4);
    var swayAmp = (aiming ? 0.0012 : 0.0028) * (1 + (p.stamina !== undefined ? (1 - p.stamina) * 1.8 : 0));
    var swayY = Math.sin(cam.swayT * 1.7) * swayAmp;
    var swayP = Math.sin(cam.swayT * 2.3 + 0.7) * swayAmp * 0.8;

    Q.fromEuler(cam.quat,
      cam.pitch + cam.recoilPitch + sPit + swayP,
      cam.yaw + cam.recoilYaw + sYaw + swayY,
      cam.roll);

    /* pivot at the player's shoulder */
    cam.pivot[0] = p.pos[0];
    cam.pivot[1] = p.pos[1] + cam.pivotY;
    cam.pivot[2] = p.pos[2];

    /* desired position = pivot + right*shoulder - forward*dist */
    Q.rotateVec3(_v0, cam.quat, RIGHT);
    Q.rotateVec3(_v1, cam.quat, FWD);
    var dx = cam.pivot[0] + _v0[0] * cam.shoulder - _v1[0] * cam.dist;
    var dy = cam.pivot[1] + _v0[1] * cam.shoulder - _v1[1] * cam.dist;
    var dz = cam.pivot[2] + _v0[2] * cam.shoulder - _v1[2] * cam.dist;

    /* collision: pull the camera in so it never clips through geometry */
    _v2[0] = cam.pivot[0]; _v2[1] = cam.pivot[1]; _v2[2] = cam.pivot[2];
    _v3[0] = dx; _v3[1] = dy; _v3[2] = dz;
    var t = sweepCamera(_v2, _v3);
    if (t < 1) {
      dx = _v2[0] + (dx - _v2[0]) * t;
      dy = _v2[1] + (dy - _v2[1]) * t;
      dz = _v2[2] + (dz - _v2[2]) * t;
    }

    /* position smoothing only on the follow axis - aiming must be 1:1 */
    var posLag = aiming ? 40 : 20;
    cam.pos[0] = U.damp(cam.pos[0], dx, posLag, dt);
    cam.pos[1] = U.damp(cam.pos[1], dy, posLag * 0.8, dt);
    cam.pos[2] = U.damp(cam.pos[2], dz, posLag, dt);

    scene.camera.pos[0] = cam.pos[0];
    scene.camera.pos[1] = cam.pos[1];
    scene.camera.pos[2] = cam.pos[2];
    Q.copy(scene.camera.quat, cam.quat);
    scene.camera.fov = cam.fov;
  }
  var FWD = V3.create(0, 0, -1), RIGHT = V3.create(1, 0, 0), UPV = V3.create(0, 1, 0);

  var _cmin = V3.create(), _cmax = V3.create();
  function sweepCamera(from, to) {
    var col = Game.level && Game.level.collision;
    if (!col || !col.boxes) { return 1; }
    var boxes = col.boxes, best = 1, r = CAM.radius, i, b, t;
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      if (b.tag === 'water' || b.tag === 'trigger' || b.noCamera) { continue; }
      /* broad reject on the segment's bounding box */
      if (Math.min(from[0], to[0]) - r > b.max[0] || Math.max(from[0], to[0]) + r < b.min[0]) { continue; }
      if (Math.min(from[1], to[1]) - r > b.max[1] || Math.max(from[1], to[1]) + r < b.min[1]) { continue; }
      if (Math.min(from[2], to[2]) - r > b.max[2] || Math.max(from[2], to[2]) + r < b.min[2]) { continue; }
      _cmin[0] = b.min[0] - r; _cmin[1] = b.min[1] - r; _cmin[2] = b.min[2] - r;
      _cmax[0] = b.max[0] + r; _cmax[1] = b.max[1] + r; _cmax[2] = b.max[2] + r;
      t = U.segIntersectAABB(from, to, _cmin, _cmax);
      if (t >= 0 && t < best) { best = t; }
    }
    return best * 0.94;
  }

  function shake(amount, freq) {
    var rm = (IP.UI && IP.UI.settings && IP.UI.settings.reduceMotion) ? 0.35 : 1;
    cam.shakeAmp = Math.min(0.16, cam.shakeAmp + amount * rm);
    if (freq) { cam.shakeFreq = freq; }
  }

  /* ------------------------------------------------------------------ */
  /*  Lighting assembly                                                  */
  /* ------------------------------------------------------------------ */
  var lightPool = [];
  for (var _lp = 0; _lp < 64; _lp++) {
    lightPool.push({ pos: V3.create(), color: [1, 1, 1], range: 10, intensity: 1, shadow: false });
  }
  function pushLight(x, y, z, r, g, b, range, intensity, shadowFlag) {
    var n = scene.lights.length;
    if (n >= lightPool.length) { return; }
    var L = lightPool[n];
    L.pos[0] = x; L.pos[1] = y; L.pos[2] = z;
    L.color[0] = r; L.color[1] = g; L.color[2] = b;
    L.range = range; L.intensity = intensity; L.shadow = !!shadowFlag;
    scene.lights.push(L);
  }

  var flickerPhase = IP.Rand.make(31337);
  function assembleLights(S, dt) {
    reset(scene.lights);
    var cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
    var i, k, sec, L, d2, fl, inten;
    /* static level lights from the resident sections, nearest-first */
    for (k = 0; k < activeSections.length; k++) {
      sec = null;
      for (i = 0; i < Game.level.sections.length; i++) {
        if (Game.level.sections[i].id === activeSections[k]) { sec = Game.level.sections[i]; break; }
      }
      if (!sec || !sec.lights) { continue; }
      for (i = 0; i < sec.lights.length; i++) {
        L = sec.lights[i];
        d2 = (L.pos[0] - cx) * (L.pos[0] - cx) + (L.pos[1] - cy) * (L.pos[1] - cy) + (L.pos[2] - cz) * (L.pos[2] - cz);
        var reach = (L.range + 6); if (d2 > reach * reach) { continue; }
        inten = L.intensity === undefined ? 1 : L.intensity;
        if (L.flicker) {
          fl = 1 - L.flicker * (0.5 + 0.5 * Math.sin(scene.time * 17.3 + i * 2.1)) *
                   (flickerPhase.f() < 0.06 ? 1 : 0.22);
          inten *= Math.max(0.05, fl);
        }
        if (S.flags && S.flags.powerOut && L.tag === 'mains') { inten *= 0.06; }
        pushLight(L.pos[0], L.pos[1], L.pos[2], L.color[0], L.color[1], L.color[2],
                  L.range, inten, false);
      }
    }
    /* player flashlight approximated as a bright forward point light */
    if (S.player.flashlight) {
      Q.rotateVec3(_v0, cam.quat, FWD);
      pushLight(cam.pos[0] + _v0[0] * 1.1, cam.pos[1] + _v0[1] * 1.1, cam.pos[2] + _v0[2] * 1.1,
                1.0, 0.94, 0.82, 16, 3.4, true);
    }
    /* muzzle flash light (set by the shot event, decays here) */
    if (muzzleLight > 0) {
      muzzleLight = Math.max(0, muzzleLight - dt * 9.0);
      pushLight(muzzlePos[0], muzzlePos[1], muzzlePos[2], 1.0, 0.78, 0.42,
                12, muzzleLight * 9.0, false);
    }
    /* fire / explosion lights carried on effects */
    if (S.effects) {
      for (i = 0; i < S.effects.length; i++) {
        var E = S.effects[i];
        if (!E || !E.light || !E.pos) { continue; }
        pushLight(E.pos[0], E.pos[1] + 0.4, E.pos[2],
          E.light[0], E.light[1], E.light[2],
          E.lightRange || 10, (E.lightIntensity || 3) * (E.life !== undefined && E.maxLife ? E.life / E.maxLife : 1), false);
      }
    }
    /* Elena's light source when she is carrying one */
    if (S.elena && S.elena.carryingLight && !S.elena.dead) {
      pushLight(S.elena.pos[0], S.elena.pos[1] + 1.2, S.elena.pos[2],
                0.95, 0.86, 0.66, 9, 1.7, false);
    }
  }
  var muzzleLight = 0;
  var muzzlePos = V3.create();

  /* ------------------------------------------------------------------ */
  /*  Story director                                                     */
  /* ------------------------------------------------------------------ */
  var director = {
    queue: [],
    cooldown: {},
    fired: {},
    dialogueTimer: 0,
    lastMusic: '',
    danger: 0
  };

  function say(speaker, text, dur) {
    if (has('UI', 'subtitle')) { IP.UI.subtitle(speaker, text, dur || 3); }
    if (has('Audio', 'play')) {
      IP.Audio.play(speaker === 'ANVIL' || speaker === 'CARRION-6' ? 'radio_voice' : 'voice_blip',
                    { volume: 0.5 });
    }
  }

  function playDialogue(triggerId, once) {
    var story = IP.STORY;
    if (!story || !story.dialogue) { return false; }
    if (once !== false) {
      if (director.fired[triggerId]) { return false; }
      director.fired[triggerId] = true;
    }
    var lines = story.dialogue[triggerId];
    if (!lines || !lines.length) { return false; }
    for (var i = 0; i < lines.length; i++) {
      director.queue.push({
        speaker: lines[i].speaker || 'ELENA',
        text: lines[i].text || '',
        dur: lines[i].dur || Math.max(1.8, (lines[i].text || '').length * 0.055)
      });
    }
    return true;
  }

  function bark(tier) {
    var story = IP.STORY;
    if (!story || !story.elenaBarks) { return; }
    var pool = story.elenaBarks[tier];
    if (!pool || !pool.length) { return; }
    if ((director.cooldown[tier] || 0) > 0) { return; }
    director.cooldown[tier] = 9 + IP.Rand.f() * 8;
    var line = pool[Math.floor(IP.Rand.f() * pool.length)];
    var text = typeof line === 'string' ? line : (line && line.text) || '';
    if (text) { director.queue.push({ speaker: 'ELENA', text: text, dur: Math.max(1.8, text.length * 0.055) }); }
  }

  function updateDirector(S, dt) {
    var k;
    for (k in director.cooldown) {
      if (director.cooldown[k] > 0) { director.cooldown[k] -= dt; }
    }
    director.dialogueTimer -= dt;
    if (director.dialogueTimer <= 0 && director.queue.length) {
      var line = director.queue.shift();
      say(line.speaker, line.text, line.dur);
      director.dialogueTimer = line.dur + 0.25;
    }

    /* danger scalar drives the adaptive music and Elena's bark tier */
    var nearest = 1e9, i, e, d2;
    for (i = 0; i < S.enemies.length; i++) {
      e = S.enemies[i];
      if (!e || e.dead) { continue; }
      d2 = V3.dist2(e.pos, S.player.pos);
      if (d2 < nearest) { nearest = d2; }
    }
    var proximity = nearest < 1e9 ? U.clamp(1 - Math.sqrt(nearest) / 26, 0, 1) : 0;
    var hpFrac = S.player.maxHealth ? S.player.health / S.player.maxHealth : 1;
    var elenaDanger = S.elena ? (S.elena.grabbed ? 1 : U.clamp(S.elena.fear || 0, 0, 1)) : 0;
    director.danger = U.damp(director.danger,
      Math.max(proximity, elenaDanger * 0.85, 1 - hpFrac), 3.0, dt);

    var music = 'explore';
    if (S.flags && S.flags.safeRoom) { music = 'safe'; }
    else if (S.boss && !S.boss.dead) { music = 'boss'; }
    else if (S.flags && S.flags.chase) { music = 'chase'; }
    else if (proximity > 0.55 && S.combat) { music = 'combat'; }
    else if (proximity > 0.2 || director.danger > 0.35) { music = 'tension'; }
    if (music !== director.lastMusic) {
      director.lastMusic = music;
      if (has('Audio', 'music')) { IP.Audio.music(music, { danger: director.danger }); }
    }

    /* ambient Elena chatter keyed to her fear tier */
    if (S.elena && !S.elena.dead && !S.combat) {
      var f = S.elena.fear || 0;
      bark(f > 0.72 ? 'panic' : f > 0.38 ? 'tense' : 'calm');
    }

    /* post-processing responds to player state */
    scene.post.hurt = U.damp(scene.post.hurt, U.clamp(1 - hpFrac * 1.35, 0, 1), 4.0, dt);
    scene.post.vignette = 0.6 + 0.28 * (1 - hpFrac);
    scene.post.saturation = 0.80 - 0.22 * (1 - hpFrac);
    scene.post.chroma = 0.34 + 0.5 * scene.post.hurt;
  }

  /* ------------------------------------------------------------------ */
  /*  Event wiring                                                       */
  /* ------------------------------------------------------------------ */
  function wireEvents() {
    U.on('shot', function (ev) {
      var S = Game.S; if (!S) { return; }
      var w = (ev && ev.weapon) || 'pistol';
      shake(w === 'shotgun' ? 0.055 : w === 'magnum' ? 0.07 : w === 'rifle' ? 0.05 : 0.024, 30);
      cam.recoilVelP += (ev && ev.recoil ? ev.recoil : 0.06) * 5.4;
      cam.recoilVelY += ((IP.Rand.f() - 0.5) * (ev && ev.recoil ? ev.recoil : 0.05)) * 3.4;
      if (ev && ev.muzzle) {
        muzzlePos[0] = ev.muzzle[0]; muzzlePos[1] = ev.muzzle[1]; muzzlePos[2] = ev.muzzle[2];
        muzzleLight = 1.0;
        burst('muzzle', ev.muzzle, ev.dir || [0, 0, -1], 6, 1);
        burst('smoke', ev.muzzle, [0, 1, 0], 3, 0.5);
      }
      if (has('Audio', 'play')) { IP.Audio.play(w + '_shot', { pos: ev && ev.muzzle, volume: 1 }); }
    });

    U.on('hit', function (ev) {
      if (!ev || !ev.pos) { return; }
      var organic = ev.material !== 'metal' && ev.material !== 'stone' && ev.material !== 'wood';
      if (organic) {
        burst('blood', ev.pos, ev.dir || [0, 0, 1], ev.location === 'head' ? 16 : 9, 2.6);
        if (has('Audio', 'play')) { IP.Audio.play(ev.location === 'head' ? 'headshot' : 'flesh_impact', { pos: ev.pos }); }
      } else {
        burst('spark', ev.pos, ev.normal || [0, 1, 0], 7, 1.6);
        burst('smoke', ev.pos, [0, 1, 0], 2, 0.3);
        if (has('Audio', 'play')) { IP.Audio.play('ric_' + (ev.material || 'concrete'), { pos: ev.pos }); }
      }
    });

    U.on('kill', function (ev) {
      if (!ev || !ev.pos) { return; }
      if (ev.mutated) {
        burst('blood', ev.pos, [0, 1, 0], 26, 3.4);
        burst('spore', ev.pos, [0, 1, 0], 18, 1);
        if (has('Audio', 'play')) { IP.Audio.play('parasite_burst', { pos: ev.pos }); }
      } else {
        burst('blood', ev.pos, [0, 1, 0], 14, 2.2);
      }
    });

    U.on('explosion', function (ev) {
      if (!ev || !ev.pos) { return; }
      burst('smoke', ev.pos, [0, 1, 0], 26, 2.5);
      burst('debris', ev.pos, [0, 1, 0], 22, 4.5);
      burst('spark', ev.pos, [0, 1, 0], 30, 5);
      var d = V3.dist(ev.pos, cam.pos);
      shake(U.clamp(0.19 - d * 0.011, 0.02, 0.19), 22);
      scene.post.flashbang = Math.max(scene.post.flashbang, U.clamp(1.4 - d * 0.09, 0, 1));
      if (has('Audio', 'play')) { IP.Audio.play('explosion', { pos: ev.pos }); }
    });

    U.on('damage', function (ev) {
      if (!ev || ev.target !== 'player') { return; }
      shake(0.05 + (ev.amount || 0) * 0.0018, 34);
      scene.post.hurt = Math.min(1, scene.post.hurt + 0.45);
      if (has('Audio', 'play')) { IP.Audio.play('player_hurt'); }
      var S = Game.S;
      if (S && S.player.health / (S.player.maxHealth || 1) < 0.3) { playDialogue('low_health'); }
    });

    U.on('reload', function (ev) {
      if (has('Audio', 'play')) { IP.Audio.play('reload_' + ((ev && ev.weapon) || 'pistol')); }
    });
    U.on('pickup', function (ev) {
      if (has('Audio', 'play')) { IP.Audio.play('pickup'); }
      if (has('UI', 'toast') && ev && ev.name) { IP.UI.toast('Acquired  ' + ev.name); }
    });
    U.on('stagger', function (ev) {
      if (has('Audio', 'play')) { IP.Audio.play('stagger', { pos: ev && ev.pos }); }
    });

    U.on('grab_start', function () {
      shake(0.09, 40);
      if (has('Audio', 'play')) { IP.Audio.play('grab'); }
    });
    U.on('elena_grabbed', function () {
      playDialogue('first_grab_elena');
      if (has('Audio', 'play')) { IP.Audio.play('stinger_elena'); }
      if (has('UI', 'toast')) { IP.UI.toast('ELENA IS BEING TAKEN'); }
    });
    U.on('elena_rescued', function () { playDialogue('elena_rescued', false); });
    U.on('elena_death', function () {
      playDialogue('elena_death', false);
      endGame('elena_lost');
    });
    U.on('player_death', function () {
      playDialogue('player_death', false);
      endGame('player_lost');
    });

    U.on('section_change', function (ev) {
      if (!ev || !ev.to) { return; }
      refreshActiveSections(ev.to);
      playDialogue(ev.to + '_enter');
      if (ev.to === 'compound') { playDialogue('act2_start'); }
      if (ev.to === 'cliffs') { playDialogue('act3_start'); }
      if (has('Systems', 'Save') && IP.Systems.Save.checkpoint) {
        attempt('checkpoint', function () { IP.Systems.Save.checkpoint(Game.S); });
      }
    });

    U.on('objective', function (ev) {
      if (has('UI', 'toast') && ev && ev.text) { IP.UI.toast('OBJECTIVE  ' + ev.text); }
      if (has('Audio', 'play')) { IP.Audio.play('objective'); }
    });

    U.on('dialogue', function (ev) {
      if (ev && ev.trigger) { playDialogue(ev.trigger, ev.once !== false); }
      else if (ev && ev.text) { director.queue.push({ speaker: ev.speaker || 'ANVIL', text: ev.text, dur: ev.dur || 3 }); }
    });

    U.on('boss_phase', function (ev) {
      shake(0.14, 16);
      if (has('Audio', 'play')) { IP.Audio.play('stinger_boss'); }
      if (ev && ev.phase === 1) { playDialogue('boss_serrano'); }
    });

    U.on('save', function () { if (has('UI', 'toast')) { IP.UI.toast('Progress saved'); } });

    U.on('ui_command', function (ev) {
      if (!ev) { return; }
      if (ev.cmd === 'resume') { setPaused(false); }
      else if (ev.cmd === 'quality') { setQuality(ev.value); }
      else if (ev.cmd === 'restart') { restart(); }
      else if (ev.cmd === 'save' && has('Systems', 'Save')) {
        attempt('save', function () { IP.Systems.Save.save(Game.S); });
      }
      else if (ev.cmd === 'load') { loadSave(); }
      else if (ev.cmd === 'newgame') { startNewGame(); }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Boot                                                               */
  /* ------------------------------------------------------------------ */
  var canvas = null, uiRoot = null;

  function boot() {
    canvas = document.getElementById('ip-canvas');
    uiRoot = document.getElementById('ip-ui');
    if (!canvas) {
      if (window.IP_BOOT) { window.IP_BOOT.fail('Missing canvas', 'ip-canvas element not found'); }
      return;
    }

    progress(0.05, 'Starting renderer');
    var ok = attempt('Renderer.init', function () {
      return has('Renderer', 'init') ? IP.Renderer.init(canvas, {}) : false;
    }, false);
    if (!ok) {
      if (window.IP_BOOT) {
        window.IP_BOOT.fail('WebGL 2 unavailable',
          'This game needs WebGL 2.\n\n' +
          'On iOS make sure you are on iOS 15 or newer.\n' +
          'On desktop enable hardware acceleration in your browser settings.\n\n' +
          Game.err.join('\n'));
      }
      return;
    }

    /* pick a starting quality from the device */
    var isTouch = (has('Input', 'init') && IP.Input.isTouch) ||
                  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    var mem = navigator.deviceMemory || 4;
    Game.quality = isTouch ? (mem >= 6 ? 1 : 0) : (mem >= 8 ? 2 : 1);
    setQuality(Game.quality);

    progress(0.12, 'Building interface');
    attempt('UI.init', function () { if (has('UI', 'init')) { IP.UI.init(uiRoot); } });
    attempt('Input.init', function () { if (has('Input', 'init')) { IP.Input.init(canvas, uiRoot); } });
    attempt('Audio.init', function () { if (has('Audio', 'init')) { IP.Audio.init(); } });

    progress(0.2, 'Assembling characters');
    attempt('Actors.build', function () { if (has('Actors', 'build')) { IP.Actors.build(); } });
    rigs.player = acquireRig('player');
    rigs.elena = acquireRig('elena');

    progress(0.3, 'Generating the island');
    Game.level = attempt('Level.build', function () {
      return has('Level', 'build') ? IP.Level.build(20260810) : null;
    }, null);
    if (!Game.level) {
      Game.level = fallbackLevel();
      note('Level', 'using fallback level');
    }

    progress(0.4, 'Uploading terrain');
    attempt('uploadLevel', function () { uploadLevel(Game.level); });

    progress(0.85, 'Priming systems');
    initWeather(1500);
    wireEvents();

    progress(0.95, 'Ready');
    Game.booted = true;

    startNewGame(true);
    if (window.IP_BOOT) { window.IP_BOOT.done(); }
    if (has('UI', 'show')) { IP.UI.show('title'); }

    Game.running = true;
    last = U.now();
    requestAnimationFrame(frame);
  }

  /* A minimal playable room so the game still boots if level generation dies. */
  function fallbackLevel() {
    var floor = { min: [-30, -1, -30], max: [30, 0, 30], tag: 'floor' };
    return {
      sections: [{
        id: 'fallback', name: 'Containment', act: 'prologue',
        bounds: { min: [-30, 0, -30], max: [30, 8, 30] },
        geo: { opaque: [], transparent: [] },
        props: [], spawns: [], triggers: [],
        lights: [{ pos: [0, 5, 0], color: [1, 0.3, 0.22], range: 30, intensity: 4, flicker: 0.3 }]
      }],
      transitions: [],
      collision: { boxes: [floor], ramps: [], water: [], ladders: [], doors: [] },
      navQuery: {
        isWalkable: function (x, z) { return x > -29 && x < 29 && z > -29 && z < 29; },
        sampleHeight: function () { return 0; },
        findPath: function (from, to, out) {
          out = out || []; out.length = 0;
          out.push([to[0], to[1], to[2]]);
          return out;
        }
      }
    };
  }

  function startNewGame(silent) {
    Game.S = attempt('createWorldState', function () {
      return has('Systems', 'createWorldState') ? IP.Systems.createWorldState(20260810) : null;
    }, null);
    if (!Game.S) { Game.S = minimalState(); note('Systems', 'using minimal state'); }
    Game.S.level = Game.level;
    Game.S._rt = Game.S._rt || {};
    Game.S._rt.level = Game.level;
    director.fired = {}; director.queue.length = 0; director.dialogueTimer = 0;
    refreshActiveSections(Game.S.section || Game.level.sections[0].id);
    cam.yaw = Game.S.player.yaw || 0;
    cam.pitch = 0.05;
    V3.copy(cam.pos, Game.S.player.pos);
    if (!silent) {
      if (has('UI', 'show')) { IP.UI.show('hud'); }
      playDialogue('game_start');
    }
  }

  function minimalState() {
    return {
      time: 0, section: (Game.level && Game.level.sections[0].id) || 'fallback',
      act: 'prologue', objective: '', flags: {}, stats: {}, difficulty: 1,
      player: {
        pos: V3.create(0, 0, 0), vel: V3.create(), yaw: 0, aimYaw: 0, aimPitch: 0,
        health: 100, maxHealth: 100, stamina: 1, aiming: false, sprinting: false,
        crouching: false, flashlight: true, speed: 0, anim: 'idle', animT: 0
      },
      elena: {
        pos: V3.create(1.5, 0, 1.5), yaw: 0, health: 100, maxHealth: 100,
        fear: 0.5, speed: 0, anim: 'idle', animT: 0, dead: false, grabbed: false
      },
      enemies: [], projectiles: [], pickups: [], props: [], effects: []
    };
  }

  function loadSave() {
    var data = attempt('Save.load', function () {
      return has('Systems', 'Save') && IP.Systems.Save.load ? IP.Systems.Save.load() : null;
    }, null);
    if (!data) { if (has('UI', 'toast')) { IP.UI.toast('No save found'); } return; }
    Game.S = data;
    Game.S.level = Game.level;
    Game.S._rt = Game.S._rt || {};
    refreshActiveSections(Game.S.section);
    if (has('UI', 'show')) { IP.UI.show('hud'); }
  }

  function restart() { startNewGame(false); setPaused(false); }

  function endGame(reason) {
    Game.paused = true;
    var ending = attempt('evaluateEnding', function () {
      return has('Systems', 'evaluateEnding') ? IP.Systems.evaluateEnding(Game.S, reason) : null;
    }, null);
    if (has('UI', 'show')) { IP.UI.show(reason === 'extraction' ? 'results' : 'gameover', { reason: reason, ending: ending }); }
    if (has('Audio', 'music')) { IP.Audio.music(reason === 'extraction' ? 'safe' : 'gameover'); }
  }

  function setPaused(p) {
    Game.paused = !!p;
    if (has('UI', 'show')) { IP.UI.show(Game.paused ? 'pause' : 'hud'); }
    if (has('Audio', 'setPaused')) { IP.Audio.setPaused(Game.paused); }
  }

  function setQuality(q) {
    Game.quality = U.clamp(q | 0, 0, 2);
    scene.quality = Game.quality;
    if (has('Renderer', 'setQuality')) { attempt('setQuality', function () { IP.Renderer.setQuality(Game.quality); }); }
  }

  /* ------------------------------------------------------------------ */
  /*  Frame loop                                                         */
  /* ------------------------------------------------------------------ */
  var last = 0, acc = 0, FIXED = 1 / 60, MAXSTEP = 5;
  var fpsAvg = 60, autoScaleTimer = 0;
  var noInput = {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0, aim: false, fire: false, firePressed: false,
    reload: false, sprint: false, crouch: false, interact: false, interactPressed: false,
    melee: false, meleePressed: false, swapPressed: false, inventoryPressed: false,
    flashlight: false, cmdFollow: false, cmdStay: false, cmdHide: false,
    cmdInteract: false, cmdCome: false, pausePressed: false, qteTapped: false, dt: 0
  };

  function frame(now) {
    if (!Game.running) { return; }
    requestAnimationFrame(frame);

    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) { dt = FIXED; }
    if (dt > 0.25) { dt = 0.25; }
    fpsAvg = fpsAvg * 0.94 + (1 / Math.max(dt, 1e-4)) * 0.06;

    var S = Game.S;
    if (!S) { return; }

    var input = attempt('Input.poll', function () {
      return has('Input', 'poll') ? IP.Input.poll(dt) : noInput;
    }, noInput) || noInput;

    if (input.pausePressed) { setPaused(!Game.paused); }

    scene.time += Game.paused ? 0 : dt;

    if (!Game.paused) {
      /* fixed-step simulation, variable-step presentation */
      acc += dt;
      var steps = 0;
      while (acc >= FIXED && steps < MAXSTEP) {
        updateCamera(S, steps === 0 ? input : noInput, FIXED);
        attempt('Systems.update', function () {
          if (has('Systems', 'update')) { IP.Systems.update(S, input, FIXED); }
        });
        acc -= FIXED; steps++;
      }
      if (steps === MAXSTEP) { acc = 0; }
      if (steps === 0) { updateCamera(S, input, dt); }

      updateDirector(S, dt);
      updateParticles(dt);
    } else {
      updateCamera(S, noInput, dt);
    }

    /* ---- assemble the frame ---- */
    reset(scene.items);
    reset(scene.transparent);
    reset(scene.sprites);
    spriteCursor = 0;

    for (var i = 0; i < staticItems.length; i++) { scene.items.push(staticItems[i]); }
    for (var k = 0; k < activeSections.length; k++) {
      var e = gpuSections[activeSections[k]];
      if (!e) { continue; }
      for (var t = 0; t < e.transparent.length; t++) { scene.transparent.push(e.transparent[t]); }
    }

    groundY = S.player.pos[1];

    /* the player body is hidden when the camera is inside it */
    if (rigs.player && cam.dist > 0.75) {
      drawActor(rigs.player, S.player.pos, S.player.aimYaw !== undefined ? S.player.aimYaw : S.player.yaw,
                S.player, dt);
    }
    if (rigs.elena && S.elena) {
      drawActor(rigs.elena, S.elena.pos, S.elena.yaw || 0, S.elena, dt);
    }
    syncEnemyRigs(S, dt);

    updateWeather(Game.paused ? 0 : dt, S);
    assembleLights(S, dt);

    scene.post.flashbang = Math.max(0, scene.post.flashbang - dt * 1.6);
    scene.sun.intensity = 0.85 * (1 - weather.indoor * 0.6);
    scene.fog.density = 0.026 + weather.indoor * 0.02 + (1 - weather.indoor) * weather.rainIntensity * 0.014;

    if (!Game.dbg.noRender) {
      attempt('renderFrame', function () {
        if (has('Renderer', 'renderFrame')) { IP.Renderer.renderFrame(scene, dt); }
      });
    }

    attempt('UI.update', function () { if (has('UI', 'update')) { IP.UI.update(S, dt); } });
    if (has('Audio', 'setListener')) {
      attempt('setListener', function () { IP.Audio.setListener(cam.pos, cam.quat); });
    }

    /* auto quality scaling: drop a tier if we stay under budget for 4s */
    autoScaleTimer += dt;
    if (autoScaleTimer > 4) {
      autoScaleTimer = 0;
      var budget = (IP.Input && IP.Input.isTouch) ? 27 : 48;
      if (fpsAvg < budget && Game.quality > 0 &&
          !(IP.UI && IP.UI.settings && IP.UI.settings.lockQuality)) {
        setQuality(Game.quality - 1);
        if (has('UI', 'toast')) { IP.UI.toast('Graphics lowered for performance'); }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Resize                                                             */
  /* ------------------------------------------------------------------ */
  function onResize() {
    if (!canvas) { return; }
    var dpr = Math.min(window.devicePixelRatio || 1, Game.quality === 0 ? 1.25 : 2);
    var w = Math.max(1, canvas.clientWidth || window.innerWidth);
    var h = Math.max(1, canvas.clientHeight || window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (has('Renderer', 'resize')) { attempt('resize', function () { IP.Renderer.resize(w, h, dpr); }); }
    if (has('UI', 'resize')) { attempt('ui-resize', function () { IP.UI.resize(w, h); }); }
    var rot = document.getElementById('ip-rotate');
    if (rot) { rot.classList.add('armed'); }
  }

  /* ------------------------------------------------------------------ */
  Game.boot = boot;
  Game.setQuality = setQuality;
  Game.setPaused = setPaused;
  Game.restart = restart;
  Game.shake = shake;
  Game.burst = burst;
  Game.cam = cam;
  Game.scene = scene;
  Game.say = say;
  Game.playDialogue = playDialogue;
  IP.Game = Game;

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 260); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && Game.running && !Game.paused) { setPaused(true); }
    });
    var go = function () {
      onResize();
      try { boot(); } catch (e) {
        note('boot', e);
        if (window.IP_BOOT) { window.IP_BOOT.fail('Startup failed', (e && e.stack) || String(e)); }
      }
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(go, 0);
    } else {
      document.addEventListener('DOMContentLoaded', go);
    }
  }
})();
