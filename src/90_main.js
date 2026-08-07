/* =====================================================================
 * 90_main.js — engine, level context, chapter flow, main loop.
 * This is the integration backbone. Subsystems are optional: if one is
 * missing or throws during init the game still boots (degraded).
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;

  /* ------------------------------------------------------------------ */
  /* Chapter order                                                       */
  /* ------------------------------------------------------------------ */

  var CHAPTERS = [
    { id: 'c1_open', kind: 'cutscene', scene: 'shop', title: 'Closing Time' },
    { id: 'shop', kind: 'level', title: 'Chapter One — House Calls' },
    { id: 'c2_brief', kind: 'cutscene', scene: 'shop', title: 'The Briefing' },
    { id: 'c3_flight', kind: 'cutscene', scene: 'flight', title: 'Nine Hours' },
    { id: 'hotel', kind: 'level', title: 'Chapter Two — The Meridian Grand' },
    { id: 'vault', kind: 'level', title: 'Chapter Three — Halcyon' },
    { id: 'escape', kind: 'level', title: 'Chapter Four — Checkout' },
    { id: 'c7_home', kind: 'cutscene', scene: 'shop', title: 'Home' }
  ];
  SG.CHAPTERS = CHAPTERS;

  /* ------------------------------------------------------------------ */
  /* Engine                                                              */
  /* ------------------------------------------------------------------ */

  var E = SG.engine = {
    renderer: null,
    scene: null,
    camera: null,
    canvas: null,
    clock: 0,
    dt: 0,
    frame: 0,
    fps: 60,
    running: false,
    paused: false,
    mode: 'boot',        /* boot | title | level | cutscene | paused */
    level: null,         /* active level definition */
    ctx: null,           /* active LevelContext */
    world: null,         /* THREE.Group owned by the level */
    player: null,
    _accum: 0,
    _last: 0,
    _fpsAccum: 0,
    _fpsFrames: 0
  };

  E.init = function (canvas) {
    E.canvas = canvas;

    var opts = {
      canvas: canvas,
      antialias: SG.quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true
    };

    var r = null;
    try { r = new THREE.WebGLRenderer(opts); } catch (e) { r = null; }
    if (!r) {
      opts.antialias = false;
      try { r = new THREE.WebGLRenderer(opts); } catch (e2) { r = null; }
    }
    if (!r) {
      E.fatal('This device could not start WebGL. Try a different browser.');
      return false;
    }

    E.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, SG.qpick(1.0, 1.5, 2.0)));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = SG.quality !== 'low';
    r.shadowMap.type = SG.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.info.autoReset = true;

    E.scene = new THREE.Scene();
    E.scene.background = new THREE.Color('#05070a');

    E.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 220);
    E.camera.position.set(0, 1.65, 3);

    E.world = new THREE.Group();
    E.world.name = 'world';
    E.scene.add(E.world);

    window.addEventListener('resize', E.resize, false);
    window.addEventListener('orientationchange', function () {
      setTimeout(E.resize, 250);
    }, false);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && E.mode === 'level') SG.bus.emit('pause');
    }, false);

    return true;
  };

  E.resize = function () {
    if (!E.renderer) return;
    var w = window.innerWidth, h = Math.max(1, window.innerHeight);
    E.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SG.qpick(1.0, 1.5, 2.0)));
    E.renderer.setSize(w, h, false);
    E.camera.aspect = w / h;
    E.camera.updateProjectionMatrix();
    if (SG.fx && SG.fx.resize) SG.safe('fx.resize', function () { SG.fx.resize(w, h); });
    if (SG.ui && SG.ui.resize) SG.safe('ui.resize', function () { SG.ui.resize(w, h); });
  };

  E.fatal = function (msg) {
    var d = document.createElement('div');
    d.className = 'sg-fatal';
    d.textContent = msg;
    document.body.appendChild(d);
  };

  /* ------------------------------------------------------------------ */
  /* Level context                                                       */
  /* ------------------------------------------------------------------ */

  function makeContext(levelDef) {
    var world = new THREE.Group();
    world.name = 'level:' + levelDef.id;
    E.scene.add(world);

    var interactables = [];
    var triggers = [];
    var updaters = [];
    var objectives = [];

    var ctx = {
      THREE: THREE,
      SG: SG,
      id: levelDef.id,
      scene: E.scene,
      world: world,
      renderer: E.renderer,
      camera: E.camera,
      player: null,
      quality: SG.quality,
      state: SG.state,
      spawn: { pos: [0, 0, 0], yaw: 0 },
      t: 0,
      interactables: interactables,
      triggers: triggers,
      objectiveList: objectives,
      props: {},
      finished: false
    };

    ctx.add = function (obj) {
      if (obj) world.add(obj);
      return obj;
    };

    ctx.prop = function (name, opts) {
      var f = SG.models[name];
      if (typeof f !== 'function') {
        if (window.console) console.warn('[level] missing model:', name);
        var ph = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 1 }));
        ph.name = 'missing:' + name;
        world.add(ph);
        return ph;
      }
      var g = SG.safe('model:' + name, function () { return f(opts || {}); }, null);
      if (g) world.add(g);
      return g;
    };

    ctx.box = function (cx, cy, cz, sx, sy, sz, yaw, tag) {
      if (!SG.phys || !SG.phys.world) return -1;
      return SG.phys.world.addBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, yaw || 0,
        tag || 'static');
    };

    /* Collider that matches an object's own bounding box. */
    ctx.boxOf = function (obj, tag, inflate) {
      if (!obj) return -1;
      var b = new THREE.Box3().setFromObject(obj);
      var c = new THREE.Vector3(), s = new THREE.Vector3();
      b.getCenter(c); b.getSize(s);
      var k = inflate || 0;
      return ctx.box(c.x, c.y, c.z, s.x + k, s.y + k, s.z + k, 0, tag);
    };

    ctx.interact = function (o) {
      o.radius = o.radius === undefined ? 1.6 : o.radius;
      o.verb = o.verb || 'Use';
      o.uses = 0;
      o.enabled = o.enabled !== false;
      interactables.push(o);
      return o;
    };

    ctx.trigger = function (o) {
      o.radius = o.radius === undefined ? 1.2 : o.radius;
      o.fired = false;
      triggers.push(o);
      return o;
    };

    ctx.every = function (fn) { updaters.push(fn); return fn; };

    ctx.objectives = function (list) {
      objectives.length = 0;
      list.forEach(function (o) {
        objectives.push({ id: o.id, text: o.text, done: !!o.done, hidden: !!o.hidden });
      });
      if (SG.ui.hud) SG.safe('ui.objectives', function () {
        SG.ui.hud.objectives(objectives);
      });
      SG.bus.emit('objective:set', objectives);
      return objectives;
    };

    ctx.objective = function (text) { return ctx.objectives([{ id: 'main', text: text }]); };

    ctx.addObjective = function (id, text) {
      objectives.push({ id: id, text: text, done: false });
      if (SG.ui.hud) SG.ui.hud.objectives(objectives);
      return objectives;
    };

    ctx.done = function (id) {
      for (var i = 0; i < objectives.length; i++) {
        if (objectives[i].id === id && !objectives[i].done) {
          objectives[i].done = true;
          if (SG.ui.hud) SG.safe('ui.done', function () {
            SG.ui.hud.completeObjective(id);
          });
          ctx.sfx('beepConfirm', { vol: 0.5 });
          SG.bus.emit('objective:done', objectives[i]);
        }
      }
      if (SG.ui.hud) SG.ui.hud.objectives(objectives);
      return objectives;
    };

    ctx.allDone = function () {
      return objectives.every(function (o) { return o.done || o.hidden; });
    };

    ctx.sfx = function (name, opts) {
      if (SG.audio && SG.audio.sfx) SG.safe('sfx:' + name, function () {
        SG.audio.sfx(name, opts);
      });
    };

    ctx.music = function (id, opts) {
      if (SG.audio && SG.audio.music) SG.safe('music:' + id, function () {
        SG.audio.music(id, opts);
      });
    };

    ctx.say = function (lineOrId, opts) {
      return E.say(lineOrId, opts);
    };

    ctx.cutscene = function (id) {
      if (SG.cinema && SG.cinema.play) return SG.cinema.play(id, ctx);
      return Promise.resolve();
    };

    ctx.egg = function (id, title) {
      if (SG.eggs.find(id, title) && SG.ui.hud) {
        SG.safe('ui.egg', function () {
          SG.ui.hud.toast('Found: ' + (SG.eggs.all[id].title || id), 'egg');
        });
        ctx.sfx('uiSelect', { vol: 0.4, rate: 1.5 });
      }
    };

    ctx.toast = function (text, icon) {
      if (SG.ui.hud) SG.safe('ui.toast', function () { SG.ui.hud.toast(text, icon); });
    };

    ctx.prompt = function (text) {
      if (SG.ui.hud) SG.safe('ui.prompt', function () { SG.ui.hud.prompt(text); });
    };

    ctx.fade = function (toBlack, ms) {
      if (SG.ui.fade) return SG.ui.fade(toBlack, ms);
      return Promise.resolve();
    };

    ctx.wait = function (sec) {
      return new Promise(function (res) { setTimeout(res, sec * 1000); });
    };

    ctx.finish = function () {
      if (ctx.finished) return;
      ctx.finished = true;
      SG.bus.emit('level:done', ctx.id);
      E.advance();
    };

    ctx._updaters = updaters;
    return ctx;
  }

  /* ------------------------------------------------------------------ */
  /* Dialogue                                                            */
  /* ------------------------------------------------------------------ */

  E.say = function (lineOrId, opts) {
    opts = opts || {};
    var line = lineOrId;
    if (typeof lineOrId === 'string') {
      line = (SG.script.lines && SG.script.lines[lineOrId]) ||
        { speaker: 'steve', text: lineOrId };
    }
    var speaker = line.speaker || 'steve';
    var text = line.text || '';
    var dur = Math.max(1.1, Math.min(9, text.length * 0.052 + 0.85));

    if (SG.ui.hud && SG.ui.hud.subtitle) {
      SG.safe('ui.subtitle', function () {
        SG.ui.hud.subtitle(speaker, text, { duration: dur });
      });
    }

    if (SG.voice && SG.voice.say && SG.state.settings.voiceEnabled) {
      return SG.safe('voice.say', function () {
        return SG.voice.say({ speaker: speaker, text: text, emotion: line.emotion })
          .catch(function () { return ctxWait(dur); });
      }, ctxWait(dur));
    }
    return ctxWait(dur);
  };

  function ctxWait(sec) {
    return new Promise(function (res) { setTimeout(res, sec * 1000); });
  }
  E.wait = ctxWait;

  /* ------------------------------------------------------------------ */
  /* Level lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  E.unloadLevel = function () {
    if (E.ctx) {
      if (E.level && E.level.dispose) SG.safe('level.dispose', function () {
        E.level.dispose(E.ctx);
      });
      if (E.ctx.world) {
        E.scene.remove(E.ctx.world);
        util.disposeTree(E.ctx.world);
      }
    }
    if (SG.phys && SG.phys.world) SG.phys.world.reset();
    E.ctx = null;
    E.level = null;
    if (SG.ui.hud) {
      SG.ui.hud.prompt(null);
      SG.ui.hud.objectives([]);
      SG.ui.hud.timer(null);
    }
  };

  E.loadLevel = function (id) {
    var def = SG.levels[id];
    if (!def) {
      if (window.console) console.error('[engine] no such level:', id);
      E.advance();
      return Promise.resolve();
    }

    E.unloadLevel();
    E.level = def;
    var ctx = E.ctx = makeContext(def);

    /* Player */
    if (SG.player && SG.player.create) {
      if (!E.player) {
        E.player = SG.safe('player.create', function () {
          return SG.player.create({
            scene: E.scene, camera: E.camera,
            renderer: E.renderer, dom: E.canvas
          });
        }, null);
      }
      ctx.player = E.player;
    }

    SG.safe('level.build:' + id, function () { def.build(ctx); });

    if (E.player && E.player.teleport) {
      E.player.teleport(
        new THREE.Vector3(ctx.spawn.pos[0], ctx.spawn.pos[1], ctx.spawn.pos[2]),
        ctx.spawn.yaw || 0);
      E.player.setMode('play');
      E.player.visible(true);
    }

    if (def.music) ctx.music(def.music);
    E.mode = 'level';
    SG.state.chapter = id;
    SG.save();
    SG.bus.emit('level:built', ctx);

    if (def.start) {
      return Promise.resolve(SG.safe('level.start', function () {
        return def.start(ctx);
      }, null));
    }
    return Promise.resolve();
  };

  /* ------------------------------------------------------------------ */
  /* Chapter flow                                                        */
  /* ------------------------------------------------------------------ */

  E.chapterIndex = function (id) {
    for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return i;
    return -1;
  };

  E.advance = function () {
    var i = E.chapterIndex(SG.state.chapter);
    var next = CHAPTERS[i + 1];
    if (!next) { E.goto('title'); return; }
    E.goto(next.id);
  };

  E.goto = function (id) {
    SG.state.chapter = id;
    SG.save();

    /* Leaving the title means leaving the title menu. */
    if (id !== 'title' && SG.ui && SG.ui.menu && SG.ui.menu.close) {
      SG.safe('menu.close', function () { SG.ui.menu.close(); });
    }

    if (id === 'title') {
      E.unloadLevel();
      E.mode = 'title';
      if (E.player) E.player.visible(false);
      if (SG.levels.title) E.loadTitle();
      if (SG.ui.menu) SG.ui.menu.title();
      return Promise.resolve();
    }

    var ch = CHAPTERS[E.chapterIndex(id)];
    if (!ch) { return E.loadLevel(id); }

    if (SG.ui.hud && SG.ui.hud.chapterCard && ch.title) {
      SG.safe('chapterCard', function () { SG.ui.hud.chapterCard(ch.title); });
    }

    if (ch.kind === 'cutscene') {
      /* Cutscenes need a world to be shot in. Load the backing set level —
       * but only if we are not already standing in it, because rebuilding a
       * set between two consecutive cutscenes is a visible hitch. */
      var setId = ch.scene + '_set';
      var p = Promise.resolve();
      if (!E.ctx || E.ctx.id !== setId) {
        p = E.fadeThrough(function () {
          return E.loadLevel(setId);
        });
      }
      return p.then(function () {
        E.mode = 'cutscene';
        if (E.player && E.player.setMode) E.player.setMode('frozen');
        if (SG.cinema && SG.cinema.play) {
          return SG.cinema.play(id, E.ctx);
        }
        return null;
      }).then(function () {
        E.mode = 'level';
        E.advance();
      });
    }

    return E.fadeThrough(function () { return E.loadLevel(id); });
  };

  /* Building a level takes a few hundred milliseconds and drops frames while
   * it does. Hide that behind black rather than pretending it isn't there. */
  E.fadeThrough = function (work) {
    var toBlack = (SG.ui && SG.ui.fade) ? SG.ui.fade(true, 320) : Promise.resolve();
    return Promise.resolve(toBlack).then(function () {
      return work();
    }).then(function (r) {
      /* One frame on the new scene before lifting, so we never fade up on
       * a half-built world. */
      return new Promise(function (res) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { res(r); }); });
      });
    }).then(function (r) {
      if (SG.ui && SG.ui.fade) SG.ui.fade(false, 480);
      return r;
    });
  };

  E.loadTitle = function () {
    E.unloadLevel();
    E.level = SG.levels.title;
    var ctx = E.ctx = makeContext(SG.levels.title);
    SG.safe('title.build', function () { SG.levels.title.build(ctx); });
    if (SG.levels.title.music) ctx.music(SG.levels.title.music);
    E.mode = 'title';
  };

  E.startNewGame = function () {
    SG.state.chapter = CHAPTERS[0].id;
    SG.state.stats.started = Date.now();
    SG.save();
    return E.goto(CHAPTERS[0].id);
  };

  E.continueGame = function () {
    var id = SG.state.chapter;
    if (!id || id === 'title' || E.chapterIndex(id) < 0) return E.startNewGame();
    return E.goto(id);
  };

  /* ------------------------------------------------------------------ */
  /* Interaction scan                                                    */
  /* ------------------------------------------------------------------ */

  var _pv = new THREE.Vector3();
  var _fwd = new THREE.Vector3();
  var _to = new THREE.Vector3();

  function scanInteractables(ctx, dt) {
    if (!E.player || !ctx || E.mode !== 'level') return;
    if (SG.cinema && SG.cinema.isPlaying && SG.cinema.isPlaying()) return;

    E.player.getPosition(_pv);
    E.player.getForward(_fwd);

    var best = null, bestScore = -1;
    for (var i = 0; i < ctx.interactables.length; i++) {
      var it = ctx.interactables[i];
      if (!it.enabled) continue;
      if (it.once && it.uses > 0) continue;
      if (it.condition && !SG.safe('cond', function () { return it.condition(ctx); }, false)) {
        continue;
      }
      var obj = it.object;
      if (!obj) continue;
      obj.getWorldPosition(_to);
      if (it.offset) _to.y += it.offset;
      var d = _to.distanceTo(_pv);
      if (d > it.radius) continue;
      _to.sub(_pv).normalize();
      var facing = _to.dot(_fwd);
      if (facing < -0.35) continue;
      var score = (1 - d / it.radius) * 0.6 + (facing * 0.5 + 0.5) * 0.4;
      if (score > bestScore) { bestScore = score; best = it; }
    }

    if (best !== ctx._hover) {
      ctx._hover = best;
      ctx.prompt(best ? (best.verb + (best.label ? ' — ' + best.label : '')) : null);
      SG.bus.emit('interact:hover', best);
    }

    if (best && SG.input.pressed && SG.input.pressed('interact')) {
      best.uses++;
      SG.bus.emit('interact:use', best);
      SG.safe('interact.onUse', function () { best.onUse(ctx, best); });
      if (best.once) {
        ctx.prompt(null);
        ctx._hover = null;
      }
    }
  }

  function scanTriggers(ctx) {
    if (!E.player || !ctx) return;
    E.player.getPosition(_pv);
    for (var i = 0; i < ctx.triggers.length; i++) {
      var tr = ctx.triggers[i];
      if (tr.once && tr.fired) continue;
      var dx = _pv.x - tr.pos[0];
      var dz = _pv.z - tr.pos[2];
      var dy = tr.pos[1] === undefined ? 0 : (_pv.y - tr.pos[1]);
      var inside = (dx * dx + dz * dz) < tr.radius * tr.radius &&
        Math.abs(dy) < (tr.height || 3);
      if (inside && !tr.inside) {
        tr.inside = true; tr.fired = true;
        SG.safe('trigger.onEnter', function () { tr.onEnter(ctx, tr); });
      } else if (!inside && tr.inside) {
        tr.inside = false;
        if (tr.onExit) SG.safe('trigger.onExit', function () { tr.onExit(ctx, tr); });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                           */
  /* ------------------------------------------------------------------ */

  E.start = function () {
    if (E.running) return;
    E.running = true;
    E._last = util.now();
    requestAnimationFrame(tick);
  };

  function tick() {
    if (!E.running) return;
    requestAnimationFrame(tick);

    var t = util.now();
    var dt = t - E._last;
    E._last = t;
    if (dt > 0.1) dt = 0.1;      /* tab-switch guard */
    if (dt <= 0) dt = 1 / 60;
    E.dt = dt;
    E.clock += dt;
    E.frame++;

    E._fpsAccum += dt; E._fpsFrames++;
    if (E._fpsAccum >= 0.5) {
      E.fps = E._fpsFrames / E._fpsAccum;
      E._fpsAccum = 0; E._fpsFrames = 0;
      SG.bus.emit('fps', E.fps);
    }

    if (SG.input && SG.input.update) SG.safe('input.update', function () {
      SG.input.update(dt);
    });

    var playing = !E.paused;

    if (playing && SG.cinema && SG.cinema.update) {
      SG.safe('cinema.update', function () { SG.cinema.update(dt); });
    }

    var cine = SG.cinema && SG.cinema.isPlaying && SG.cinema.isPlaying();

    if (playing && E.player && E.player.update) {
      SG.safe('player.update', function () {
        E.player.update(cine ? 0 : dt, E.ctx);
      });
    }

    if (playing && E.ctx) {
      var ctx = E.ctx;
      ctx.t += dt;
      if (E.level && E.level.update) {
        SG.safe('level.update', function () { E.level.update(dt, ctx); });
      }
      for (var i = 0; i < ctx._updaters.length; i++) {
        var fn = ctx._updaters[i];
        SG.safe('ctx.every', function () { fn(dt, ctx); });
      }
      if (!cine) {
        scanInteractables(ctx, dt);
        scanTriggers(ctx);
      }
    }

    if (playing && SG.audio && SG.audio.update) {
      SG.safe('audio.update', function () { SG.audio.update(dt, E.camera); });
    }
    if (SG.ui && SG.ui.update) SG.safe('ui.update', function () { SG.ui.update(dt); });

    /* Render */
    if (SG.fx && SG.fx.render && SG.fx.enabled) {
      SG.safe('fx.render', function () { SG.fx.render(dt); }, null);
    } else if (E.renderer) {
      E.renderer.render(E.scene, E.camera);
    }
  }

  E.pause = function () {
    if (E.paused) return;
    E.paused = true;
    if (SG.audio && SG.audio.duck) SG.audio.duck(true);
    if (SG.ui.menu) SG.ui.menu.pause();
    SG.bus.emit('pause');
  };

  E.resume = function () {
    if (!E.paused) return;
    E.paused = false;
    E._last = util.now();
    if (SG.audio && SG.audio.duck) SG.audio.duck(false);
    SG.bus.emit('resume');
  };

  SG.bus.on('pause', function () { if (!E.paused) E.pause(); });
  SG.bus.on('resume', function () { if (E.paused) E.resume(); });

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  var boot = SG.boot = {};

  boot.steps = [];
  boot.step = function (label, fn) { boot.steps.push({ label: label, fn: fn }); };

  boot.run = function (onProgress) {
    var i = 0;
    function next() {
      if (i >= boot.steps.length) return Promise.resolve();
      var s = boot.steps[i++];
      if (onProgress) onProgress(s.label, i / boot.steps.length);
      return new Promise(function (res) {
        /* Yield to the browser between steps so the loading bar actually paints
         * and the tab never looks frozen on a phone. */
        setTimeout(function () {
          SG.safe('boot:' + s.label, s.fn);
          res();
        }, 0);
      }).then(next);
    }
    return next();
  };

  SG.main = function () {
    SG.load();

    var canvas = document.getElementById('gl');
    if (!E.init(canvas)) return;

    /* Register boot work. Subsystems add their own steps at file scope. */
    boot.step('Warming up the bench', function () {
      if (SG.tex && SG.tex.__warm) SG.tex.__warm();
    });
    boot.step('Soldering materials', function () {
      if (SG.mat && SG.mat.__warm) SG.mat.__warm();
    });
    boot.step('Winding fans', function () {
      if (SG.phys && SG.phys.init) SG.phys.init();
    });
    boot.step('Mapping the keyboard', function () {
      if (SG.input && SG.input.init) SG.input.init(E.canvas);
    });
    boot.step('Calibrating the monitor', function () {
      if (SG.fx && SG.fx.init) SG.fx.init(E.renderer, E.scene, E.camera);
    });
    boot.step('Printing the work order', function () {
      if (SG.ui && SG.ui.init) SG.ui.init();
    });
    boot.step('Checking the cat', function () {
      if (SG.voice && SG.voice.init) SG.voice.init();
    });

    var setProgress = function (label, p) {
      var el = document.getElementById('boot-label');
      var bar = document.getElementById('boot-bar');
      if (el) el.textContent = label + '…';
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    };

    boot.run(setProgress).then(function () {
      var bootEl = document.getElementById('boot');
      if (bootEl) {
        bootEl.classList.add('done');
        setTimeout(function () { bootEl.style.display = 'none'; }, 700);
      }
      E.resize();
      E.loadTitle();
      if (SG.ui.menu) SG.ui.menu.title();
      E.start();
    });
  };

  /* Audio can only start from a user gesture — arm it on the first one. */
  (function armAudio() {
    var armed = false;
    var go = function () {
      if (armed) return;
      armed = true;
      if (SG.audio && SG.audio.init) SG.safe('audio.init', function () { SG.audio.init(); });
      if (SG.voice && SG.voice.unlock) SG.safe('voice.unlock', function () { SG.voice.unlock(); });
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
      window.removeEventListener('touchstart', go, true);
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
    window.addEventListener('touchstart', go, true);
  })();

})(window.SG, window.THREE);
