/* ============================================================================
 * STEVE THE PC REPAIR MAN — 80_game.js
 * Renderer, chapter state machine, level streaming, main loop.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  /* The spine of the whole game: an ordered list of chapters.
     'cine' chapters play a cutscene; 'level' chapters hand control to the
     player and wait for a `level:complete` event (or Game.completeLevel). */
  var CHAPTERS = [
    { type: 'cine',  id: 'c_intro',     level: 'shop'  },
    { type: 'level', id: 'shop',        phase: 'ellis' },
    { type: 'cine',  id: 'c_ellis_out', level: 'shop'  },
    { type: 'level', id: 'shop',        phase: 'oleg'  },
    { type: 'cine',  id: 'c_oleg',      level: 'shop'  },
    { type: 'cine',  id: 'c_depart',    level: null    },
    { type: 'level', id: 'flight'                      },
    { type: 'cine',  id: 'c_arrival',   level: null    },
    { type: 'level', id: 'plaza'                       },
    { type: 'level', id: 'lobby'                       },
    { type: 'level', id: 'serverfloor'                 },
    { type: 'cine',  id: 'c_kestrel',   level: 'vault' },
    { type: 'level', id: 'vault'                       },
    { type: 'cine',  id: 'c_twist',     level: 'vault' },
    { type: 'cine',  id: 'c_choice',    level: 'vault' },
    { type: 'level', id: 'escape'                      },
    { type: 'cine',  id: 'c_epilogue',  level: 'epilogue' },
    { type: 'level', id: 'epilogue'                    },
    { type: 'end' }
  ];

  var Game = STV.Game = {
    state: 'boot',
    chapter: -1,
    level: null,
    levelId: null,
    paused: false,
    running: false,
    ending: null,
    checkpoint: null
  };

  var renderer, scene, camera, clock, player, physics;
  var container, canvas;
  var acc = 0, last = 0, frames = 0, fpsT = 0, fps = 60;
  var screenFlushT = 0;
  var pendingChapterAdvance = false;

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                    */
  /* ---------------------------------------------------------------------- */
  Game.boot = function (mount) {
    container = mount || document.getElementById('app') || document.body;

    canvas = document.createElement('canvas');
    canvas.id = 'gl';
    container.appendChild(canvas);

    var ctxOpts = {
      canvas: canvas,
      antialias: STV.quality === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      failIfMajorPerformanceCaveat: false
    };

    try {
      renderer = new THREE.WebGLRenderer(ctxOpts);
    } catch (e) {
      showFatal('This game needs WebGL. Your browser blocked it or it is unavailable.');
      return;
    }
    if (!renderer || !renderer.getContext()) {
      showFatal('WebGL could not start.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, STV.pixelRatioCap()));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = (STV.quality === 'high');
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x05070a, 1);

    /* probe the GPU and demote quality if it looks weak */
    probeQuality();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.06, 260);
    camera.position.set(0, 1.7, 4);

    physics = STV.Physics.create();
    clock = { t: STV.now() };

    Game.ctx = {
      scene: scene, camera: camera, renderer: renderer,
      physics: physics, rng: STV.rng(0xC0FFEE), game: Game
    };

    if (STV.UI && STV.UI.init) STV.UI.init(container);

    player = new STV.Player(Game.ctx);
    player.enabled = false;
    player.setVisible(false);
    Game.player = player;
    Game.ctx.player = player;

    window.addEventListener('resize', onResize, false);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 250); }, false);
    document.addEventListener('visibilitychange', onVisibility, false);

    wireBus();

    Game.running = true;
    last = STV.now();
    requestAnimationFrame(tick);

    STV.bus.emit('boot:ready', {});
    Game.setState('title');

    if (STV.UI && STV.UI.showTitle) {
      STV.UI.showTitle(function (opt) { Game.start(opt); });
    } else {
      Game.start({});
    }
  };

  function probeQuality() {
    try {
      var gl = renderer.getContext();
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var rn = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      STV.log('[gpu]', rn);
      if (/SwiftShader|Software|llvmpipe|Mesa OffScreen/i.test(rn)) {
        STV.quality = 'low';
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
      }
    } catch (e) {}
  }

  function showFatal(msg) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:#08090c;color:#f0a24b;font:500 16px/1.6 system-ui,sans-serif;padding:32px;text-align:center;z-index:99999';
    d.textContent = msg;
    document.body.appendChild(d);
  }

  /* ---------------------------------------------------------------------- */
  Game.setState = function (s) {
    if (Game.state === s) return;
    Game.state = s;
    STV.bus.emit('game:state', { state: s });
    if (STV.UI && STV.UI.setMode) {
      if (s === 'play') STV.UI.setMode('play');
      else if (s === 'cine') STV.UI.setMode('cine');
      else if (s === 'title') STV.UI.setMode('title');
      else if (s === 'end') STV.UI.setMode('end');
    }
  };

  Game.start = function (opt) {
    if (STV.Audio && STV.Audio.init) { try { STV.Audio.init(); } catch (e) {} }
    if (STV.Voice && STV.Voice.init) { try { STV.Voice.init(); } catch (e) {} }
    Game.chapter = -1;
    Game.ending = null;
    nextChapter();
  };

  /* ---------------------------------------------------------------------- */
  /* Chapter flow                                                            */
  /* ---------------------------------------------------------------------- */
  function nextChapter() {
    Game.chapter++;
    if (Game.chapter >= CHAPTERS.length) { Game.chapter = CHAPTERS.length - 1; }
    var ch = CHAPTERS[Game.chapter];
    if (!ch) return;
    STV.log('[chapter]', Game.chapter, ch.type, ch.id);

    if (ch.type === 'end') { runEnd(); return; }

    if (ch.type === 'cine') {
      // make sure the cutscene's staging level exists
      var need = ch.level;
      var go = function () {
        Game.setState('cine');
        playCine(ch.id, function () { nextChapter(); });
      };
      if (need && Game.levelId !== need) loadLevel(need, go);
      else go();
      return;
    }

    if (ch.type === 'level') {
      var enter = function () {
        Game.setState('play');
        player.enabled = true;
        player.frozen = false;
        player.setVisible(true);
        if (Game.level && Game.level.onEnter) {
          try { Game.level.onEnter(player, ch.phase); } catch (e) { STV.warn('[onEnter]', e); }
        }
        if (Game.level && Game.level.setPhase && ch.phase) {
          try { Game.level.setPhase(ch.phase); } catch (e) {}
        }
        Game.checkpoint = { chapter: Game.chapter, pos: player.pos.clone(), yaw: player.yaw };
      };
      if (Game.levelId !== ch.id) loadLevel(ch.id, enter);
      else enter();
      return;
    }
  }

  Game.completeLevel = function (id) {
    var ch = CHAPTERS[Game.chapter];
    if (!ch || ch.type !== 'level') return;
    if (id && ch.id !== id) return;
    if (pendingChapterAdvance) return;
    pendingChapterAdvance = true;
    player.enabled = false;
    player.clearFocus();
    var fade = (STV.UI && STV.UI.fade) ? STV.UI.fade(1, 550) : null;
    setTimeout(function () {
      pendingChapterAdvance = false;
      nextChapter();
      if (STV.UI && STV.UI.fade) STV.UI.fade(0, 650);
    }, 600);
    return fade;
  };

  function playCine(id, done) {
    if (!STV.Cine || !STV.Cine.play) { done(); return; }
    player.enabled = false;
    player.frozen = true;
    player.clearFocus();
    var ctx = {
      scene: scene, camera: camera, renderer: renderer,
      level: Game.level, player: player, game: Game
    };
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      player.frozen = false;
      done();
    };
    try {
      var p = STV.Cine.play(id, ctx);
      if (p && p.then) p.then(finish);
      else finish();
    } catch (e) {
      STV.warn('[cine] failed', id, e);
      finish();
    }
  }

  function runEnd() {
    Game.setState('end');
    player.enabled = false;
    if (STV.UI && STV.UI.showEnd) STV.UI.showEnd(Game.ending, STV.eggCount(), STV.EGGS.length);
    else if (STV.UI && STV.UI.setMode) STV.UI.setMode('end');
  }

  /* ---------------------------------------------------------------------- */
  /* Level streaming                                                         */
  /* ---------------------------------------------------------------------- */
  function loadLevel(id, done) {
    if (STV.UI && STV.UI.loading) STV.UI.loading(0, 'Loading');
    STV.bus.emit('level:load', { id: id });

    unloadLevel();

    // give the browser one frame so the fade/loader paints before we block
    setTimeout(function () {
      var lvl = null;
      try {
        if (STV.Levels && STV.Levels.build) lvl = STV.Levels.build(id, Game.ctx);
      } catch (e) {
        STV.warn('[level] build failed', id, e);
      }
      if (!lvl) lvl = fallbackLevel(id);

      Game.level = lvl;
      Game.levelId = id;
      if (lvl.root && !lvl.root.parent) scene.add(lvl.root);

      /* physics */
      physics.clear();
      if (lvl.colliders) physics.addColliders(lvl.colliders, id);

      /* environment */
      applyEnv(lvl.env || {});

      player.setLevel(lvl);
      STV.clearTweens();

      if (STV.UI && STV.UI.loading) STV.UI.loading(1, 'Ready');
      STV.bus.emit('level:ready', { id: id, level: lvl });
      if (done) done();
    }, 30);
  }

  function unloadLevel() {
    if (!Game.level) return;
    STV.bus.emit('level:unload', { id: Game.levelId });
    try { if (Game.level.dispose) Game.level.dispose(); } catch (e) { STV.warn(e); }
    if (Game.level.root && Game.level.root.parent) Game.level.root.parent.remove(Game.level.root);
    STV.disposeObject(Game.level.root);
    Game.level = null;
    Game.levelId = null;
    physics.clear();
  }

  function applyEnv(env) {
    if (env.sky !== undefined) scene.background = new THREE.Color(env.sky);
    if (env.fog) {
      if (env.fog.type === 'exp2') scene.fog = new THREE.FogExp2(env.fog.color, env.fog.density);
      else scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    } else scene.fog = null;
    renderer.toneMappingExposure = env.exposure || 1.0;
    if (STV.Audio && STV.Audio.ambience && env.ambience) {
      try { STV.Audio.ambience(env.ambience, 900); } catch (e) {}
    }
    if (STV.Audio && STV.Audio.music && env.music) {
      try { STV.Audio.music(env.music, 1200); } catch (e) {}
    }
  }

  function fallbackLevel(id) {
    var root = new THREE.Group();
    root.name = 'fallback_' + id;
    var floor = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.4, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.95 })
    );
    floor.position.y = -0.2;
    root.add(floor);
    var amb = new THREE.HemisphereLight(0x9fb6cc, 0x2a2620, 1.1);
    root.add(amb);
    var dir = new THREE.DirectionalLight(0xffe9c9, 1.2);
    dir.position.set(6, 12, 5);
    root.add(dir);
    return {
      id: id, root: root,
      spawn: { pos: new THREE.Vector3(0, 0, 0), yaw: 0 },
      colliders: [{ type: 'box', c: new THREE.Vector3(0, -0.2, 0), h: new THREE.Vector3(20, 0.2, 20) }],
      interactables: [], actors: [], lights: [amb, dir],
      env: { footstep: 'concrete', ambience: null },
      update: function () {}, onEnter: function () {},
      dispose: function () {}
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Bus wiring                                                              */
  /* ---------------------------------------------------------------------- */
  function wireBus() {
    STV.bus.on('level:complete', function (p) { Game.completeLevel(p && p.id); });

    STV.bus.on('minigame:open', function (p) {
      if (!p) return;
      player.locked = true;
      player.clearFocus();
      if (STV.UI && STV.UI.minigame) {
        STV.UI.minigame(p.id, p.opts || {}, function (ok) {
          player.locked = false;
          STV.bus.emit('minigame:result', { id: p.id, success: !!ok });
          if (p.done) { try { p.done(!!ok); } catch (e) { STV.warn(e); } }
        });
      } else {
        player.locked = false;
        if (p.done) p.done(true);
      }
    });

    STV.bus.on('cine:start', function () { player.enabled = false; player.frozen = true; });
    STV.bus.on('cine:end', function () { if (Game.state === 'play') { player.frozen = false; player.enabled = true; } });

    STV.bus.on('alarm', function (p) {
      var l = p && p.level || 0;
      if (l >= 3) respawnAtCheckpoint();
    });

    STV.bus.on('player:shake', function (p) { player.shake((p && p.amount) || 0.5); });

    STV.bus.on('checkpoint', function (p) {
      Game.checkpoint = {
        chapter: Game.chapter,
        pos: (p && p.pos) ? p.pos.clone() : player.pos.clone(),
        yaw: (p && p.yaw !== undefined) ? p.yaw : player.yaw
      };
      STV.bus.emit('toast', { text: 'Checkpoint', icon: 'save', ms: 1400 });
    });

    STV.bus.on('ending', function (p) {
      Game.ending = p && p.id;
      STV.progress.ending = Game.ending;
      STV.saveProgress();
    });

    STV.bus.on('settings:changed', function () {
      var cap = STV.pixelRatioCap();
      if (STV.settings.quality === 'low') cap = 1;
      else if (STV.settings.quality === 'med') cap = Math.min(1.5, window.devicePixelRatio || 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
      onResize();
    });

    STV.bus.on('ui:pause', function (p) { Game.paused = !!(p && p.paused); });
  }

  function respawnAtCheckpoint() {
    var cp = Game.checkpoint;
    if (!cp) return;
    if (STV.UI && STV.UI.fade) STV.UI.fade(1, 350);
    setTimeout(function () {
      player.teleport(cp.pos, cp.yaw);
      player.vel.set(0, 0, 0);
      if (Game.level && Game.level.onRespawn) { try { Game.level.onRespawn(player); } catch (e) {} }
      STV.bus.emit('alarm', { level: 0, silent: true });
      STV.bus.emit('dialogue:line', {
        speaker: 'Steve', voice: 'steve',
        text: 'Alright. Let’s pretend that didn’t happen.', ms: 2600
      });
      if (STV.UI && STV.UI.fade) STV.UI.fade(0, 500);
    }, 400);
  }

  /* ---------------------------------------------------------------------- */
  /* Main loop                                                               */
  /* ---------------------------------------------------------------------- */
  function tick(now) {
    if (!Game.running) return;
    requestAnimationFrame(tick);

    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;      // tab was backgrounded
    if (dt <= 0) return;

    /* fps meter */
    frames++; fpsT += dt;
    if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; if (STV.debug) STV.bus.emit('debug:fps', { fps: fps }); }

    if (Game.paused) { renderer.render(scene, camera); return; }

    STV.updateTweens(dt);

    var input = (STV.UI && STV.UI.input) ? STV.UI.input : null;

    /* cutscene drives the camera itself */
    if (STV.Cine && STV.Cine.playing) {
      try { STV.Cine.update(dt); } catch (e) { STV.warn('[cine.update]', e); }
    }

    if (player) {
      try { player.update(dt, input); } catch (e) { STV.warn('[player.update]', e); }
    }

    if (Game.level && Game.level.update) {
      try { Game.level.update(dt, player); } catch (e) { STV.warn('[level.update]', e); }
    }

    if (Game.level && Game.level.actors) {
      var a = Game.level.actors;
      for (var i = 0; i < a.length; i++) {
        if (a[i] && a[i].update) { try { a[i].update(dt, player); } catch (e) {} }
      }
    }

    if (STV.Audio && STV.Audio.ready && STV.Audio.listener) {
      try { STV.Audio.listener(camera); } catch (e) {}
    }

    /* live screens are throttled hard — they are canvas uploads */
    screenFlushT += dt;
    if (screenFlushT >= 1 / 15) {
      screenFlushT = 0;
      if (STV.Mat && STV.Mat.flushScreens) { try { STV.Mat.flushScreens(); } catch (e) {} }
    }

    if (STV.UI && STV.UI.tick) { try { STV.UI.tick(dt); } catch (e) {} }

    renderer.render(scene, camera);
  }

  function onResize() {
    if (!renderer || !camera) return;
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / (h || 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (STV.UI && STV.UI.onResize) STV.UI.onResize(w, h);
  }

  function onVisibility() {
    if (document.hidden) {
      if (STV.Audio && STV.Audio.suspend) { try { STV.Audio.suspend(); } catch (e) {} }
    } else {
      last = STV.now();
      if (STV.Audio && STV.Audio.resume) { try { STV.Audio.resume(); } catch (e) {} }
    }
  }

  /* expose a few things for debugging / the console */
  Game.jumpTo = function (chapterIndex) {
    Game.chapter = chapterIndex - 1;
    nextChapter();
  };
  Game.debugInfo = function () {
    return {
      fps: Math.round(fps), chapter: Game.chapter, level: Game.levelId,
      draws: renderer ? renderer.info.render.calls : 0,
      tris: renderer ? renderer.info.render.triangles : 0,
      boxes: physics ? physics.boxes.length : 0
    };
  };
  Game.CHAPTERS = CHAPTERS;

  STV.log('game loaded');
})();
