/* =====================================================================
 * 73_level_vault.js — Chapter Three: Halcyon.
 *
 * Steve cannot reach an air-gapped machine over a wire, so he does what a
 * repair man does: he takes away everything the machine needs in order to
 * keep being a machine. Cooling, uplink, power, and then the thing he was
 * actually paid to bring.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  /* Room x[-8,8] z[-6,10] h3.4. Cold aisle down the middle. */

  SG.levels.vault = {
    id: 'vault',
    music: 'vault',

    build: function (ctx) {
      ctx.spawn = { pos: [0, 0, -5.0], yaw: 0 };
      var P = ctx.props;

      buildRoom(ctx);
      buildRacks(ctx);
      buildPlant(ctx);
      buildHalcyon(ctx);
      wireJob(ctx);

      ctx.objectives([
        { id: 'crac', text: 'Shut down the cooling' },
        { id: 'fibre', text: 'Pull the uplink to the tape library' },
        { id: 'floor', text: 'Splice the power feed under the floor' },
        { id: 'key', text: 'Deploy the key at the console' },
        { id: 'burn', text: 'Finish it' }
      ]);

      if (SG.audio && SG.audio.ambience) SG.safe('amb', function () {
        SG.audio.ambience('vault');
      });
      ctx.sfx('serverRoomHum', { loop: true, vol: 0.55 });

      ctx.trigger({
        pos: [0, 0, -3.6], radius: 2.4, once: true,
        onEnter: function () {
          ctx.say('vault.arrive').then(function () { return ctx.say('vault.plan'); });
        }
      });
    },

    update: function () { },
    dispose: function () {
      if (SG.audio && SG.audio.ambience) SG.audio.ambience(null);
    }
  };

  /* ------------------------------------------------------------------ */

  function buildRoom(ctx) {
    K.room(ctx, {
      name: 'vault',
      x0: -8, x1: 8, z0: -6, z1: 10, h: 3.4,
      floorMat: K.M('steelBrushed', { color: 0x4c5155, roughness: 0.45, metalness: 0.75 }),
      wallMat: K.M('steelPainted', { color: 0x585f66, roughness: 0.7, metalness: 0.25 }),
      ceilMat: K.M('concrete', { color: 0x3d4247, roughness: 0.95 }),
      floorTag: 'metal',
      openings: { s: [{ at: 8.0, w: 2.0, y0: 0, y1: 2.2, noReveal: true }] }
    });

    /* Raised floor grid — cheap, and it is what the room is famous for. */
    var tiles = new THREE.Group();
    var tileMat = K.M('steelBrushed', { color: 0x4a5054, roughness: 0.5, metalness: 0.8 });
    for (var x = -7.5; x <= 7.5; x += 0.6) {
      var l = K.box(tiles, tileMat, x, 0.004, 2, 0.012, 0.008, 16);
      l.castShadow = false;
    }
    for (var z = -5.7; z <= 9.7; z += 0.6) {
      var m = K.box(tiles, tileMat, 0, 0.004, z, 16, 0.008, 0.012);
      m.castShadow = false;
    }
    K.freeze(ctx, tiles);

    /* Light: cold, even, and slightly too bright. */
    K.ambient(ctx, { sky: 0x9fc4e8, ground: 0x1e2429, intensity: 0.55 });
    var pos = [];
    for (var lz = -4; lz <= 9; lz += 2.6) {
      pos.push([-4, 3.34, lz]); pos.push([4, 3.34, lz]);
    }
    K.lightGrid(ctx, pos, {
      w: 1.2, d: 0.22, color: 0xdcefff,
      real: SG.qpick(1, 2, 3), intensity: 8, dist: 8
    });

    /* Overhead trays and the fibre coming in. */
    if (SG.models.cableTray) {
      ctx.add(SG.models.cableTray([[-6.6, 3.05, -5.4], [-6.6, 3.05, 9.4]], { w: 0.34 }));
      ctx.add(SG.models.cableTray([[6.6, 3.05, -5.4], [6.6, 3.05, 9.4]], { w: 0.34 }));
      ctx.add(SG.models.cableTray([[-6.6, 3.05, 8.6], [6.6, 3.05, 8.6]], { w: 0.34 }));
    }
    if (SG.models.ductRun) {
      ctx.add(SG.models.ductRun([[-7.2, 3.0, -5.0], [-7.2, 3.0, 6.0]], { r: 0.24 }));
    }
  }

  function buildRacks(ctx) {
    var racks = [];
    var labels = ['A01', 'A02', 'A03', 'A04', 'A05', 'B01', 'B02', 'prod-do-not-touch',
      'B04', 'B05'];
    var n = 0;
    [-4.2, 4.2].forEach(function (x, side) {
      for (var i = 0; i < 5; i++) {
        var z = -2.2 + i * 1.35;
        var r = SG.models.serverRack ? SG.models.serverRack({ label: labels[n] }) : null;
        if (r) {
          K.at(r, x, 0, z, side === 0 ? Math.PI / 2 : -Math.PI / 2);
          ctx.add(r);
          racks.push(r);
        }
        ctx.box(x, 1.0, z, 1.07, 2.0, 0.62, side === 0 ? Math.PI / 2 : -Math.PI / 2, 'rack');
        n++;
      }
    });
    ctx.props.racks = racks;

    /* Activity lights, driven once per frame for all racks at once. */
    var t = 0;
    ctx.every(function (dt) {
      t += dt;
      if (SG.engine.frame % 4 !== 0) return;
      var health = ctx.state.flags['vault.cooling'] === false ? 0.35 : 1;
      for (var i = 0; i < racks.length; i++) {
        var r = racks[i];
        if (r && r.userData && r.userData.setActivity) {
          r.userData.setActivity(health * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.7 + i))));
        }
      }
    });

    /* The rack somebody laminated a sign for. */
    var joke = racks[7];
    if (joke) {
      ctx.interact({
        object: joke, label: "'prod — do not touch'", verb: 'Touch', radius: 1.8,
        onUse: function () {
          var c = SG.count('prodRack');
          ctx.sfx('relayClick', { vol: 0.4 });
          if (c === 1) ctx.say('vault.rackJoke');
          if (c === 8) {
            ctx.say('vault.rackJoke8');
            ctx.sfx('beepError');
            ctx.egg('prodRack', 'TOLD YOU');
            if (SG.fx && SG.fx.pulse) SG.fx.pulse('glitch', 0.6, 500);
          }
        }
      });
    }
  }

  function buildPlant(ctx) {
    var P = ctx.props;

    /* Cooling, west wall. */
    var crac = SG.models.crac ? SG.models.crac({}) : null;
    if (crac) { K.at(crac, -7.3, 0, 1.2, Math.PI / 2); ctx.add(crac); }
    ctx.box(-7.3, 1.1, 1.2, 0.9, 2.2, 1.6, 0, 'plant');
    P.crac = crac;

    var crac2 = SG.models.crac ? SG.models.crac({}) : null;
    if (crac2) { K.at(crac2, -7.3, 0, 6.0, Math.PI / 2); ctx.add(crac2); }
    ctx.box(-7.3, 1.1, 6.0, 0.9, 2.2, 1.6, 0, 'plant');

    /* Power, west wall south. */
    var ups = SG.models.upsCabinet ? SG.models.upsCabinet({}) : null;
    if (ups) { K.at(ups, -7.3, 0, -3.6, Math.PI / 2); ctx.add(ups); }
    ctx.box(-7.3, 1.0, -3.6, 0.8, 2.0, 1.4, 0, 'plant');
    P.ups = ups;

    var breaker = SG.models.breakerPanel ? SG.models.breakerPanel({}) : null;
    if (breaker) { K.at(breaker, -7.85, 1.4, -1.4, Math.PI / 2); ctx.add(breaker); }
    P.breaker = breaker;

    /* Uplink, east wall. */
    var patch = SG.models.patchPanel ? SG.models.patchPanel({}) : null;
    if (patch) { K.at(patch, 7.5, 1.35, 2.4, -Math.PI / 2); ctx.add(patch); }
    ctx.box(7.6, 1.3, 2.4, 0.4, 1.6, 1.2, 0, 'plant');
    P.patch = patch;

    var tape = SG.models.tapeLibrary ? SG.models.tapeLibrary({}) : null;
    if (tape) { K.at(tape, 7.2, 0, 5.6, -Math.PI / 2); ctx.add(tape); }
    ctx.box(7.2, 1.0, 5.6, 0.9, 2.0, 1.6, 0, 'plant');
    P.tape = tape;

    if (SG.models.fiberBundle) {
      ctx.add(SG.models.fiberBundle([
        [7.4, 1.7, 2.4], [7.0, 2.6, 3.4], [6.6, 3.0, 5.0], [6.6, 3.0, 8.4],
        [2.0, 3.0, 8.6], [0.3, 2.6, 8.7], [0.15, 2.2, 8.7]
      ], { r: 0.03 }));
    }

    /* The floor tile that comes up. */
    var tile = SG.models.raisedFloorTile ? SG.models.raisedFloorTile({}) : null;
    if (tile) { K.at(tile, 0, 0.02, 2.4); ctx.add(tile); }
    P.tile = tile;

    /* The console. */
    var kvm = SG.models.kvmConsole ? SG.models.kvmConsole({}) : null;
    if (kvm) { K.at(kvm, 1.9, 0, 7.4, -0.6); ctx.add(kvm); }
    ctx.box(1.9, 0.6, 7.4, 0.7, 1.2, 0.7, 0, 'furniture');
    P.kvm = kvm;
  }

  function buildHalcyon(ctx) {
    var h = SG.models.halcyonCore ? SG.models.halcyonCore({}) : null;
    if (h) { K.at(h, 0, 0, 8.7, Math.PI); ctx.add(h); }
    ctx.box(0, 1.05, 8.7, 1.3, 2.1, 0.9, 0, 'halcyon');
    ctx.props.halcyon = h;

    /* Its own light. Amber, slow, and the only warm thing in the room. */
    var amber = new THREE.PointLight(0xffa83a, 4.5, 6, 2);
    amber.position.set(0, 1.5, 8.1);
    ctx.add(amber);
    var t = 0;
    ctx.every(function (dt) {
      t += dt;
      var st = ctx.state.flags['vault.state'] || 'idle';
      var base = st === 'dead' ? 0 : (st === 'dying' ? 6.5 : 4.2);
      var wob = st === 'dying' ? (Math.random() * 3) : Math.sin(t * 0.7) * 0.55;
      amber.intensity = util.damp(amber.intensity, Math.max(0, base + wob), 6, dt);
      if (st === 'dying') amber.color.setHex(0xff5a2a);
      if (st === 'dead') amber.color.setHex(0x331a10);
    });
  }

  /* ------------------------------------------------------------------ */
  /* The job                                                             */
  /* ------------------------------------------------------------------ */

  function wireJob(ctx) {
    var P = ctx.props;

    /* 1 — cooling. */
    K.hold(ctx, {
      object: P.crac, label: 'the cooling unit', verb: 'Shut down',
      seconds: 2.8, radius: 1.9,
      onStart: function () { ctx.say('vault.crac'); },
      onDone: function () {
        ctx.state.flags['vault.cooling'] = false;
        ctx.sfx('relayClick');
        ctx.sfx('fanWhine', { vol: 0.8, rate: 0.6 });
        ctx.done('crac');
        ctx.say('vault.cracDone');
        if (SG.fx && SG.fx.set) SG.fx.set('saturation', 0.88);
        ctx.music('vault', { intensity: 0.55 });
      }
    });

    /* 2 — the uplink. */
    K.hold(ctx, {
      object: P.patch, label: 'the uplink', verb: 'Pull', seconds: 2.2, radius: 1.7,
      onStart: function () { ctx.say('vault.fibre'); },
      onDone: function () {
        ctx.sfx('clipSnap', { vol: 0.9 });
        ctx.done('fibre');
        ctx.say('vault.fibreDone');
        if (P.tape && P.tape.userData && P.tape.userData.setActivity) {
          P.tape.userData.setActivity(0);
        }
      }
    });

    /* 3 — the floor, and the loom under it. */
    var lifted = false;
    K.hold(ctx, {
      object: P.tile, label: 'the floor tile', verb: 'Lift', seconds: 1.6, radius: 1.6,
      condition: function () { return !lifted; },
      onStart: function () { ctx.say('vault.floor'); },
      onDone: function () {
        lifted = true;
        ctx.sfx('metalClang', { vol: 0.7 });
        if (P.tile) {
          var t = 0, from = P.tile.position.clone();
          ctx.every(function (dt) {
            if (t >= 1) return;
            t = Math.min(1, t + dt * 1.8);
            var e = util.ease.outCubic(t);
            P.tile.position.y = from.y + e * 0.16;
            P.tile.position.x = from.x + e * 0.62;
            P.tile.rotation.z = -e * 0.32;
          });
        }
        ctx.toast('The feed is exposed', 'objective');
      }
    });

    K.wirePuzzle(ctx, {
      pos: [0, 0.16, 2.42], yaw: 0, pairs: 5, seed: 90210,
      label: 'the power feed', radius: 1.7,
      condition: function () { return lifted && !ctx.state.flags['vault.spliced']; },
      onSolved: function () {
        ctx.state.flags['vault.spliced'] = true;
        ctx.sfx('sparkArc');
        if (SG.fx && SG.fx.pulse) SG.fx.pulse('bloom', 0.8, 400);
        ctx.done('floor');
        ctx.say('vault.floorDone');
      }
    });

    /* 4 — the key, and the machine noticing. */
    K.hold(ctx, {
      object: P.kvm, label: 'the console', verb: 'Deploy the key',
      seconds: 3.4, radius: 1.7,
      condition: function () {
        return ctx.state.flags['vault.spliced'] &&
          !ctx.state.flags['vault.keyed'];
      },
      onStart: function () { ctx.say('vault.key'); },
      onDone: function () {
        ctx.state.flags['vault.keyed'] = true;
        ctx.sfx('keyType', { vol: 0.8 });
        ctx.sfx('hddSeek', { vol: 0.7 });
        ctx.done('key');
        var h = P.halcyon;
        if (h && h.userData && h.userData.setState) h.userData.setState('alert');
        ctx.state.flags['vault.state'] = 'alert';
        ctx.say('vault.keyDone').then(function () {
          return ctx.cutscene('c_vault_halcyon');
        }).then(function () {
          ctx.state.flags['vault.state'] = 'dying';
          ctx.toast('It is going. Finish it.', 'objective');
          K.marker(ctx, 0, 0, 7.9, 0xff7a3a);
        });
      }
    });

    /* 5 — finish it. */
    K.hold(ctx, {
      object: P.halcyon, label: 'Halcyon', verb: 'Finish it',
      seconds: 4.0, radius: 2.0,
      condition: function () {
        return ctx.state.flags['vault.state'] === 'dying' &&
          !ctx.state.flags['vault.dead'];
      },
      onDone: function () {
        ctx.state.flags['vault.dead'] = true;
        ctx.state.flags['vault.state'] = 'dead';
        var h = P.halcyon;
        if (h && h.userData && h.userData.setState) h.userData.setState('dead');
        ctx.done('burn');
        ctx.sfx('sparkArc', { vol: 1 });
        ctx.sfx('glassBreak', { vol: 0.4 });
        if (SG.fx) {
          if (SG.fx.pulse) SG.fx.pulse('glitch', 1, 900);
          if (SG.fx.set) SG.fx.set('saturation', 0.7);
        }
        if (SG.ui && SG.ui.flash) SG.ui.flash('#ffb066', 180);

        setTimeout(function () {
          ctx.sfx('alarmKlaxon', { loop: true, vol: 0.7 });
          ctx.music('alarm');
          if (SG.ui && SG.ui.flash) SG.ui.flash('#ff3b3b', 240);
          ctx.say('escape.start').then(function () {
            return ctx.fade(true, 900);
          }).then(function () {
            ctx.finish();
          });
        }, 2400);
      }
    });

    /* Everything else you can put a screwdriver near. */
    if (P.breaker) {
      ctx.interact({
        object: P.breaker, label: 'the breaker panel', verb: 'Read', radius: 1.6,
        onUse: function () {
          ctx.sfx('relayClick', { vol: 0.4 });
          ctx.toast('Circuit 14: "ARCHIVE — DO NOT ISOLATE"', 'info');
          ctx.egg('breaker', 'Do not isolate');
        }
      });
    }
    if (P.tape) {
      ctx.interact({
        object: P.tape, label: 'the tape library', verb: 'Inspect', radius: 1.8,
        onUse: function () {
          ctx.sfx('tapeWhir', { vol: 0.6 });
          ctx.toast('Oldest tape: 09 MAR 2017. Newest: yesterday.', 'info');
          ctx.egg('tapes', 'Nine years of names');
        }
      });
    }
  }

})(window.SG, window.THREE);
