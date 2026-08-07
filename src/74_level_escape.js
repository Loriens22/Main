/* =====================================================================
 * 74_level_escape.js — Chapter Four: Checkout.
 *
 * Nine minutes before anyone believes the alarm. Service corridor, stair,
 * roof, laundry dock. The timer is generous on purpose — this is the exhale
 * after the vault, not a twitch test, and running out only costs you a
 * checkpoint.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  var TIME_LIMIT = 190;
  var ROOF_Y = 3.5;

  SG.levels.escape = {
    id: 'escape',
    music: 'alarm',

    build: function (ctx) {
      ctx.spawn = { pos: [0, 0, -5.0], yaw: 0 };
      var P = ctx.props;

      ctx.state.flags['escape.checkpoint'] = 'start';

      buildCorridor(ctx);
      buildStair(ctx);
      buildRoof(ctx);
      buildDock(ctx);
      wireRoute(ctx);

      ctx.objectives([
        { id: 'stair', text: 'Reach the service stair' },
        { id: 'roof', text: 'Get to the roof' },
        { id: 'van', text: 'Make the laundry run' }
      ]);

      ctx.sfx('alarmKlaxon', { loop: true, vol: 0.45 });
      if (SG.fx && SG.fx.set) {
        SG.fx.set('saturation', 0.82);
        SG.fx.set('vignette', 0.7);
      }

      /* The clock. */
      var t = TIME_LIMIT, failing = false;
      ctx.every(function (dt) {
        if (ctx.finished) return;
        t -= dt;
        if (SG.ui.hud && SG.ui.hud.timer) SG.ui.hud.timer(Math.max(0, t));
        if (t <= 0 && !failing) {
          failing = true;
          caught(ctx, function () { t = TIME_LIMIT; failing = false; });
        }
      });
      P.resetTimer = function () { t = TIME_LIMIT; };

      ctx.trigger({
        pos: [0, 0, -3.4], radius: 2.2, once: true,
        onEnter: function () { ctx.say('escape.objective'); }
      });
    },

    update: function () { },
    dispose: function () {
      if (SG.ui.hud && SG.ui.hud.timer) SG.ui.hud.timer(null);
      if (SG.audio && SG.audio.ambience) SG.audio.ambience(null);
    }
  };

  /* ------------------------------------------------------------------ */

  function caught(ctx, done) {
    var cps = {
      start: [0, 0, -5.0, 0],
      stair: [0, 0, 7.0, 0],
      roof: [0, ROOF_Y, 1.0, 0]
    };
    var cp = cps[ctx.state.flags['escape.checkpoint']] || cps.start;
    ctx.say('escape.guard');
    if (SG.ui && SG.ui.flash) SG.ui.flash('#ff3b3b', 200);
    ctx.fade(true, 700).then(function () {
      if (ctx.player) {
        ctx.player.teleport(new THREE.Vector3(cp[0], cp[1], cp[2]), cp[3]);
      }
      if (done) done();
      return ctx.fade(false, 700);
    });
  }

  function buildCorridor(ctx) {
    K.room(ctx, {
      name: 'corridorA',
      x0: -2, x1: 2, z0: -6, z1: 8, h: 2.6,
      floorMat: K.M('tileFloor', { color: 0x63676b, roughness: 0.75 }),
      wallMat: K.M('steelPainted', { color: 0x8e9498, roughness: 0.85, metalness: 0.1 }),
      ceilMat: K.M('concrete', { color: 0x74787c, roughness: 0.95 }),
      floorTag: 'tile',
      openings: { n: [{ at: 2.0, w: 1.6, y0: 0, y1: 2.2, noReveal: true }] }
    });

    /* Emergency lighting only. */
    K.ambient(ctx, { sky: 0x40202a, ground: 0x100c0e, intensity: 0.3 });
    var reds = [[0, 2.5, -4], [0, 2.5, 0], [0, 2.5, 4]];
    reds.forEach(function (p, i) {
      var l = new THREE.PointLight(0xff4436, 5, 6, 2);
      l.position.set(p[0], p[1], p[2]);
      ctx.add(l);
      var lamp = K.box(ctx.world,
        new THREE.MeshBasicMaterial({ color: 0xff5544, toneMapped: false }),
        p[0], p[1] + 0.05, p[2], 0.22, 0.09, 0.12);
      lamp.castShadow = false;
      var ph = i * 0.7;
      ctx.every(function (dt) {
        var k = 0.55 + 0.45 * Math.abs(Math.sin(SG.engine.clock * 3.1 + ph));
        l.intensity = 5 * k;
      });
    });

    if (SG.models.pipeRun) {
      ctx.add(SG.models.pipeRun([[1.8, 2.3, -5.6], [1.8, 2.3, 7.6]], { r: 0.06 }));
    }
    if (SG.models.conduitRun) {
      ctx.add(SG.models.conduitRun([[-1.8, 2.35, -5.6], [-1.8, 2.35, 7.6]], { r: 0.03 }));
    }
    var ext = SG.models.fireExtinguisher ? SG.models.fireExtinguisher({}) : null;
    if (ext) { K.at(ext, 1.75, 0, -2.0, -Math.PI / 2); ctx.add(ext); }
    var cart = SG.models.serviceCart ? SG.models.serviceCart({}) : null;
    if (cart) { K.at(cart, -1.3, 0, 2.4, 0.3); ctx.add(cart); ctx.box(-1.3, 0.5, 2.4, 0.6, 1, 0.9, 0, 'furniture'); }
  }

  function buildStair(ctx) {
    K.room(ctx, {
      name: 'stairwell',
      x0: -2.6, x1: 2.6, z0: 8, z1: 14, h: 7.2,
      floorMat: K.M('concrete', { color: 0x6a6d70, roughness: 0.95 }),
      wallMat: K.M('concrete', { color: 0x7b7e81, roughness: 0.95 }),
      ceiling: false,
      floorTag: 'concrete',
      openings: { s: [{ at: 2.6, w: 1.6, y0: 0, y1: 2.2, noReveal: true }] }
    });

    /* One straight flight, ramped so the capsule never catches on a nose. */
    var flight = SG.models.stairFlight
      ? SG.models.stairFlight({ rise: ROOF_Y, run: 5.0, w: 1.8 }) : null;
    if (flight) { K.at(flight, 0, 0, 8.6); ctx.add(flight); }

    if (SG.phys.world && SG.phys.world.addRamp) {
      SG.phys.world.addRamp(0, ROOF_Y / 2, 11.1, 0.9, ROOF_Y / 2 + 0.1, 2.5, 0, ROOF_Y, 'stair');
    } else {
      /* Fallback: a staircase of shallow boxes. */
      for (var i = 0; i < 18; i++) {
        var y = (i + 0.5) * (ROOF_Y / 18);
        var z = 8.8 + i * (5.0 / 18);
        ctx.box(0, y / 2, z, 1.8, y, 5.0 / 18 + 0.02, 0, 'stair');
      }
    }

    var rail = SG.models.railings ? SG.models.railings({ len: 5.4, rise: ROOF_Y }) : null;
    if (rail) { K.at(rail, 1.0, 0, 8.6); ctx.add(rail); }

    var l = new THREE.PointLight(0xffdca8, 8, 9, 2);
    l.position.set(0, 4.4, 11.5);
    ctx.add(l);

    /* Roof deck over the stairwell exit. */
    ctx.box(0, ROOF_Y - 0.15, 13.4, 5.2, 0.3, 1.4, 0, 'metal');
  }

  function buildRoof(ctx) {
    var deck = new THREE.Mesh(K.unitPlane(),
      K.M('asphalt', { color: 0x33363a, roughness: 0.98 }));
    deck.scale.set(24, 22, 1);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, ROOF_Y, 3);
    deck.receiveShadow = true;
    ctx.add(deck);
    ctx.box(0, ROOF_Y - 0.15, 3, 24, 0.3, 22, 0, 'gravel');

    /* Parapet — the roof is the widest space in the game and it needs an edge. */
    var par = K.M('brickPainted', { color: 0x5c5a56, roughness: 0.95 });
    [[0, -8, 24, 0.4], [0, 14, 24, 0.4]].forEach(function (p) {
      K.box(ctx.world, par, p[0], ROOF_Y + 0.5, p[1], p[2], 1.0, p[3]);
      ctx.box(p[0], ROOF_Y + 0.5, p[1], p[2], 1.0, p[3], 0, 'wall');
    });
    [[-12, 3, 0.4, 22], [12, 3, 0.4, 22]].forEach(function (p) {
      K.box(ctx.world, par, p[0], ROOF_Y + 0.5, p[1], p[2], 1.0, p[3]);
      ctx.box(p[0], ROOF_Y + 0.5, p[1], p[2], 1.0, p[3], 0, 'wall');
    });

    /* Plant. A roof is never empty. */
    var kit = new THREE.Group();
    [['aircon', -6, -3, 0.3], ['aircon', -6, 0.4, 0.3], ['aircon', 6.5, -2, -0.4],
    ['roofVent', -8.5, 6, 0], ['roofVent', 8.5, 6, 0], ['satelliteDish', 7.5, 9, -0.7],
    ['ductGrille', -2.5, 9.5, 0]].forEach(function (p) {
      var o = SG.models[p[0]] ? SG.models[p[0]]({}) : null;
      if (o) { K.at(o, p[1], ROOF_Y, p[2], p[3]); kit.add(o); }
      ctx.box(p[1], ROOF_Y + 0.5, p[2], 1.2, 1.0, 1.0, 0, 'furniture');
    });
    ctx.add(kit);

    if (SG.models.ductRun) {
      ctx.add(SG.models.ductRun([
        [-6, ROOF_Y + 1.2, -3], [-6, ROOF_Y + 1.2, 4], [2, ROOF_Y + 1.3, 4]
      ], { r: 0.28 }));
    }
    var walk = SG.models.catwalk ? SG.models.catwalk({ len: 8 }) : null;
    if (walk) { K.at(walk, 2, ROOF_Y, 6); ctx.add(walk); }

    /* Night. */
    ctx.scene.background = new THREE.Color('#080b14');
    ctx.scene.fog = new THREE.FogExp2(0x0a0e18, 0.016);
    var cityTex = K.T('nightCity');
    if (cityTex) {
      var sky = new THREE.Mesh(
        new THREE.CylinderGeometry(60, 60, 26, 24, 1, true),
        new THREE.MeshBasicMaterial({
          map: cityTex, side: THREE.BackSide, toneMapped: false, depthWrite: false
        }));
      sky.position.set(0, ROOF_Y + 4, 3);
      ctx.add(sky);
    }
    var moon = new THREE.DirectionalLight(0x9db4d8, 1.1);
    moon.position.set(-14, 18, -10);
    ctx.add(moon);
    K.ambient(ctx, { sky: 0x2b3a52, ground: 0x14161c, intensity: 0.5 });

    /* The neon of the hotel's own sign, spilling over the parapet. */
    var spill = new THREE.PointLight(0xff8a4c, 7, 14, 2);
    spill.position.set(0, ROOF_Y + 0.6, -7.4);
    ctx.add(spill);
  }

  function buildDock(ctx) {
    /* Down the far ramp: the loading dock, at street level. */
    var ramp = SG.models.stairFlight
      ? SG.models.stairFlight({ rise: ROOF_Y, run: 5.5, w: 1.6 }) : null;
    if (ramp) { K.at(ramp, -9.5, 0, 13.4, Math.PI); ctx.add(ramp); }
    if (SG.phys.world && SG.phys.world.addRamp) {
      SG.phys.world.addRamp(-9.5, ROOF_Y / 2, 10.9, 0.8, ROOF_Y / 2 + 0.1, 2.75, Math.PI,
        ROOF_Y, 'stair');
    } else {
      for (var i = 0; i < 18; i++) {
        var y = ROOF_Y - (i + 0.5) * (ROOF_Y / 18);
        var z = 8.5 + i * (5.5 / 18);
        ctx.box(-9.5, y / 2, z, 1.6, y, 5.5 / 18 + 0.02, 0, 'stair');
      }
    }

    var yard = new THREE.Mesh(K.unitPlane(),
      K.M('asphalt', { color: 0x2e3033, roughness: 0.98 }));
    yard.scale.set(14, 10, 1);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(-9.5, 0.005, 17);
    yard.receiveShadow = true;
    ctx.add(yard);
    ctx.box(-9.5, -0.15, 17, 14, 0.3, 10, 0, 'gravel');
    ctx.box(-9.5, 2, 22.5, 14, 4, 0.4, 0, 'wall');
    ctx.box(-16.8, 2, 17, 0.4, 4, 10, 0, 'wall');
    ctx.box(-2.2, 2, 17, 0.4, 4, 10, 0, 'wall');

    var van = SG.models.laundryVan ? SG.models.laundryVan({}) : null;
    if (van) { K.at(van, -9.0, 0, 18.6, Math.PI * 0.05); ctx.add(van); }
    ctx.box(-9.0, 1.1, 18.6, 2.1, 2.2, 5.4, 0, 'car');
    ctx.props.van = van;

    var dockLight = new THREE.PointLight(0xfff0d0, 9, 12, 2);
    dockLight.position.set(-9.5, 3.6, 15.5);
    ctx.add(dockLight);

    [[-13.5, 15.5], [-5.2, 16.2]].forEach(function (p) {
      var c = SG.models.trafficCone ? SG.models.trafficCone({}) : null;
      if (c) { K.at(c, p[0], 0, p[1]); ctx.add(c); }
    });
  }

  /* ------------------------------------------------------------------ */

  function wireRoute(ctx) {
    var P = ctx.props;

    /* Two doors on the way out — one of them locked the wrong way. */
    K.door(ctx, {
      pos: [0, 0, 0.0], yaw: 0, w: 1.5, h: 2.2,
      mat: K.M('steelPainted', { color: 0x7d848a, roughness: 0.6, metalness: 0.4 }),
      label: 'the fire door', sfx: 'doorSteel'
    });

    var jammed = false;
    K.hold(ctx, {
      object: K.anchor(ctx, 0, 1.1, 7.6),
      label: 'the stairwell door', verb: 'Force', seconds: 2.6, radius: 2.0,
      condition: function () { return !jammed; },
      onStart: function () { ctx.say('escape.door'); },
      onDone: function () {
        jammed = true;
        ctx.sfx('metalClang');
        ctx.done('stair');
        ctx.state.flags['escape.checkpoint'] = 'stair';
        ctx.toast('Checkpoint', 'objective');
      }
    });

    ctx.trigger({
      pos: [0, 0, 9.5], radius: 2.4, once: true,
      onEnter: function () { ctx.say('escape.stair'); }
    });

    ctx.trigger({
      pos: [0, ROOF_Y, 12.0], radius: 3.0, once: true, height: 4,
      onEnter: function () {
        ctx.done('roof');
        ctx.state.flags['escape.checkpoint'] = 'roof';
        ctx.say('escape.roof');
        ctx.toast('Checkpoint', 'objective');
        K.marker(ctx, -9.5, ROOF_Y, 9.0);
        if (SG.audio) ctx.sfx('wind', { loop: true, vol: 0.4 });
      }
    });

    /* A guard on the roof, sweeping. Being seen costs you the checkpoint. */
    var guard = K.npc(ctx, 'guard', [7, ROOF_Y, 7.5], Math.PI, { clip: 'walk' });
    K.patrol(ctx, guard, [
      [7, ROOF_Y, 10.5, 2.2, true], [7, ROOF_Y, 0.5, 2.0, true],
      [-1, ROOF_Y, -1.5, 1.6, false], [-1, ROOF_Y, 9.5, 1.8, true]
    ], { speed: 1.2, startDelay: 4 });
    P.roofGuard = guard;

    var susp = K.suspicion(ctx, {
      rate: 0.55, decay: 0.5,
      onCaught: function () {
        caught(ctx, function () { if (P.resetTimer) P.resetTimer(); });
        susp.reset();
      }
    });
    susp.watcher(guard, { range: 12, fov: 95 });
    susp.zone(-12, -8, 12, 14, 0.9);

    /* The van. */
    ctx.interact({
      object: P.van || K.anchor(ctx, -9.0, 1.2, 18.6),
      label: 'the laundry van', verb: 'Get in', radius: 2.6, once: true,
      onUse: function () {
        ctx.done('van');
        ctx.sfx('doorClose');
        ctx.say('escape.van').then(function () {
          return ctx.say('escape.done');
        }).then(function () {
          if (SG.audio && SG.audio.music) SG.audio.music(null);
          return ctx.fade(true, 1600);
        }).then(function () {
          ctx.finish();
        });
      }
    });

    /* One quiet thing to find on the way out. */
    ctx.interact({
      object: K.anchor(ctx, 8.5, ROOF_Y + 1.0, 6),
      label: 'the roof vent', verb: 'Look behind', radius: 1.8, once: true,
      onUse: function () {
        ctx.sfx('paperRustle', { vol: 0.5 });
        ctx.toast('Somebody sleeps up here. A blanket, a radio, a paperback.', 'info');
        ctx.egg('roofSleeper', 'Somebody sleeps up here');
      }
    });
  }

})(window.SG, window.THREE);
