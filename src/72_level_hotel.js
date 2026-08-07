/* =====================================================================
 * 72_level_hotel.js — Chapter Two: the Meridian Grand, Prague.
 *
 * Not a stealth level. Steve walks in through the front door wearing the
 * right coveralls and the right badge, and the only thing that can go
 * wrong is behaving like a man who is not supposed to be there. Running,
 * skulking and standing where staff have no business standing raise
 * suspicion. Walking calmly across a marble lobby is, correctly, invisible.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  /* Lobby x[-9,9] z[-7,7] h6.5 | lift lobby x[9,15] z[-3,3] h3.2
   * service corridor x[10.4,13.6] z[3,15] h2.6 */

  SG.levels.hotel = {
    id: 'hotel',
    music: 'infiltration',

    build: function (ctx) {
      ctx.spawn = { pos: [0, 0, -6.0], yaw: 0 };
      var P = ctx.props;

      buildLobby(ctx);
      buildLiftLobby(ctx);
      buildService(ctx);

      ctx.objectives([
        { id: 'concierge', text: 'Report to the desk as the contractor' },
        { id: 'corridor', text: 'Find the service core' },
        { id: 'reader', text: 'Get past the card reader' },
        { id: 'lift', text: 'Take the freight lift down' }
      ]);

      if (SG.audio && SG.audio.ambience) SG.safe('amb', function () {
        SG.audio.ambience('hotel');
      });

      populate(ctx);

      ctx.trigger({
        pos: [0, 0, -4.6], radius: 2.6, once: true,
        onEnter: function () { ctx.say('hotel.arrive'); }
      });
    },

    update: function () { },
    dispose: function () {
      if (SG.audio && SG.audio.ambience) SG.audio.ambience(null);
    }
  };

  /* ------------------------------------------------------------------ */

  function buildLobby(ctx) {
    var marbleF = K.M('marbleFloor', { color: 0xcfc6b4, roughness: 0.12, metalness: 0 });
    var marbleW = K.M('marbleWall', { color: 0xb9ae9c, roughness: 0.22 });

    K.room(ctx, {
      name: 'lobby',
      x0: -9, x1: 9, z0: -7, z1: 7, h: 6.5,
      floorMat: marbleF, wallMat: marbleW,
      ceilMat: K.M('plasterCeiling', { color: 0xe6dfd0, roughness: 0.9 }),
      floorTag: 'tile',
      openings: {
        s: [{ at: 9.0, w: 3.0, y0: 0, y1: 3.0, noReveal: true }],   /* entrance */
        e: [{ at: 7.0, w: 3.2, y0: 0, y1: 3.4 }]                     /* to lifts */
      }
    });

    /* Columns down both sides — the thing that makes a lobby a lobby. */
    var cols = new THREE.Group();
    [-6.2, -2.1, 2.1, 6.2].forEach(function (x) {
      [-4.4, 4.4].forEach(function (z) {
        var c = SG.models.marbleColumn ? SG.models.marbleColumn({ h: 6.4 }) : null;
        if (c) { K.at(c, x, 0, z); cols.add(c); }
        ctx.box(x, 3.2, z, 0.62, 6.4, 0.62, 0, 'column');
      });
    });
    ctx.add(cols);

    /* Reception, north wall. */
    var desk = SG.models.receptionCounter ? SG.models.receptionCounter({ w: 5.0 }) : null;
    if (desk) { K.at(desk, 3.6, 0, 5.6, Math.PI); ctx.add(desk); }
    ctx.box(3.6, 0.6, 5.6, 5.0, 1.2, 0.75, 0, 'counter');
    ctx.props.reception = desk;

    /* Chandeliers — two, and they carry the whole room's light. */
    [[-3.4, 0], [3.4, 0]].forEach(function (p, i) {
      var ch = SG.models.chandelier ? SG.models.chandelier({ tiers: 3 }) : null;
      if (ch) { K.at(ch, p[0], 4.3, p[1]); ctx.add(ch); }
      var l = new THREE.PointLight(0xffe0b0, i === 0 ? 26 : 22, 17, 2);
      l.position.set(p[0], 3.9, p[1]);
      l.castShadow = SG.quality === 'high' && i === 0;
      if (l.castShadow) { l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.004; }
      ctx.add(l);
    });
    K.ambient(ctx, { sky: 0xdcc9a8, ground: 0x4a3c2c, intensity: 0.5 });

    /* Wall sconces, purely for the reflections in the marble. */
    var sconces = new THREE.Group();
    [[-8.8, -2], [-8.8, 2], [8.8, -5], [-0.5, 6.85], [7.5, 6.85]].forEach(function (p) {
      var s = SG.models.wallSconce ? SG.models.wallSconce({}) : null;
      if (s) { K.at(s, p[0], 2.4, p[1]); sconces.add(s); }
    });
    ctx.add(sconces);

    /* The guest lounge, behind a rope. Steve has no business in there. */
    var lounge = new THREE.Group();
    var rug = SG.models.rugPersian ? SG.models.rugPersian({ w: 5, d: 4 }) : null;
    if (rug) { K.at(rug, -5.0, 0.01, 2.0); lounge.add(rug); }
    [[-6.2, 1.0, 0.3], [-3.8, 1.0, -0.3], [-5.0, 3.4, Math.PI]].forEach(function (s) {
      var sofa = SG.models.hotelSofa ? SG.models.hotelSofa({}) : null;
      if (sofa) { K.at(sofa, s[0], 0, s[1], s[2]); lounge.add(sofa); }
      ctx.box(s[0], 0.4, s[1], 1.9, 0.8, 0.85, s[2], 'furniture');
    });
    [[-7.4, 2.0], [-2.6, 2.0]].forEach(function (p) {
      var pl = SG.models.potPalm ? SG.models.potPalm({}) : null;
      if (pl) { K.at(pl, p[0], 0, p[1]); lounge.add(pl); }
      ctx.box(p[0], 0.6, p[1], 0.7, 1.2, 0.7, 0, 'furniture');
    });
    ctx.add(lounge);

    var ropes = new THREE.Group();
    [[-8.4, -0.6], [-6.6, -0.6], [-4.8, -0.6], [-3.0, -0.6], [-2.2, 0.8]].forEach(function (p) {
      var r = SG.models.velvetRope ? SG.models.velvetRope({}) : null;
      if (r) { K.at(r, p[0], 0, p[1]); ropes.add(r); }
    });
    ctx.add(ropes);

    /* Entrance. */
    var rev = SG.models.revolvingDoor ? SG.models.revolvingDoor({}) : null;
    if (rev) { K.at(rev, 0, 0, -6.9); ctx.add(rev); ctx.props.entrance = rev; }
    ctx.box(-2.4, 1.6, -6.95, 3.4, 3.2, 0.3, 0, 'wall');
    ctx.box(2.4, 1.6, -6.95, 3.4, 3.2, 0.3, 0, 'wall');

    /* Night, outside the glass. */
    var cityTex = K.T('nightCity');
    if (cityTex) {
      var city = new THREE.Mesh(K.unitPlane(),
        new THREE.MeshBasicMaterial({ map: cityTex, toneMapped: false }));
      city.scale.set(22, 9, 1);
      city.position.set(0, 3.6, -13);
      ctx.add(city);
    }

    /* Dressing. */
    var paint = SG.models.paintingFramed ? SG.models.paintingFramed({ w: 1.6, h: 2.1 }) : null;
    if (paint) { K.at(paint, 8.85, 1.9, 2.2, -Math.PI / 2); ctx.add(paint); ctx.props.painting = paint; }
    var luggage = SG.models.luggageCart ? SG.models.luggageCart({}) : null;
    if (luggage) { K.at(luggage, 6.8, 0, -3.2, 0.4); ctx.add(luggage); }
    ctx.box(6.8, 0.6, -3.2, 1.1, 1.6, 0.7, 0, 'furniture');

    var bar = SG.models.minibar ? SG.models.minibar({}) : null;
    if (bar) { K.at(bar, -8.4, 0, 5.4, 0.4); ctx.add(bar); ctx.props.minibar = bar; }
    ctx.box(-8.4, 0.55, 5.4, 1.2, 1.1, 0.6, 0, 'furniture');
    var bottle = SG.models.waterBottle ? SG.models.waterBottle({}) : null;
    if (bottle) { K.at(bottle, -8.35, 1.1, 5.3); ctx.add(bottle); ctx.props.bottle = bottle; }

    K.motes(ctx, {
      count: SG.qpick(0, 60, 120), size: 0.02,
      bounds: { x: 8, y: 4, z: 6, cx: 0, cy: 2.6, cz: 0 }
    });
  }

  function buildLiftLobby(ctx) {
    K.room(ctx, {
      name: 'lifts',
      x0: 9, x1: 15, z0: -3, z1: 3, h: 3.4,
      floorMat: K.M('marbleFloor', { color: 0xc4bba9, roughness: 0.14 }),
      wallMat: K.M('marbleWall', { color: 0xa89d8b, roughness: 0.25 }),
      floorTag: 'tile',
      openings: {
        w: [{ at: 3.0, w: 3.2, y0: 0, y1: 3.4, noReveal: true }],
        n: [{ at: 3.0, w: 1.0, y0: 0, y1: 2.1 }]        /* service door */
      }
    });

    var lifts = SG.models.elevatorDoors ? SG.models.elevatorDoors({}) : null;
    if (lifts) { K.at(lifts, 14.9, 0, 0, -Math.PI / 2); ctx.add(lifts); }
    var panel = SG.models.elevatorPanel ? SG.models.elevatorPanel({}) : null;
    if (panel) { K.at(panel, 14.85, 1.2, 1.3, -Math.PI / 2); ctx.add(panel); }

    var l = new THREE.PointLight(0xffe4bc, 11, 9, 2);
    l.position.set(12, 3.0, 0);
    ctx.add(l);

    ctx.interact({
      object: lifts || panel,
      label: 'the guest lift', verb: 'Call', radius: 2.0,
      onUse: function () {
        ctx.sfx('badgeDeny');
        ctx.toast('Guest floors only — the vault is not on this lift', 'info');
      }
    });
  }

  function buildService(ctx) {
    /* Behind the marble: painted block, strip light, and a floor that has
     * never been polished by anyone. */
    K.room(ctx, {
      name: 'service',
      x0: 10.4, x1: 13.6, z0: 3, z1: 15, h: 2.6,
      floorMat: K.M('tileFloor', { color: 0x6f7276, roughness: 0.7 }),
      wallMat: K.M('steelPainted', { color: 0x9aa0a2, roughness: 0.85, metalness: 0.1 }),
      ceilMat: K.M('concrete', { color: 0x8d9094, roughness: 0.95 }),
      floorTag: 'tile',
      openings: { s: [{ at: 1.6, w: 1.0, y0: 0, y1: 2.1, noReveal: true }] }
    });

    K.lightGrid(ctx, [
      [12, 2.54, 5], [12, 2.54, 8.5], [12, 2.54, 12]
    ], { w: 1.1, d: 0.2, color: 0xdff0ff, real: SG.qpick(1, 2, 2), intensity: 6, dist: 7 });

    /* Corridor dressing: the runs nobody ever removed. */
    if (SG.models.conduitRun) {
      ctx.add(SG.models.conduitRun([
        [10.6, 2.35, 3.2], [10.6, 2.35, 8], [10.6, 2.3, 14.6]], { r: 0.03 }));
    }
    if (SG.models.pipeRun) {
      ctx.add(SG.models.pipeRun([
        [13.4, 2.2, 3.2], [13.4, 2.2, 9], [13.4, 2.25, 14.6]], { r: 0.055 }));
    }
    if (SG.models.cableTray) {
      ctx.add(SG.models.cableTray([
        [12, 2.42, 3.4], [12, 2.42, 14.4]], { w: 0.3 }));
    }
    var ext = SG.models.fireExtinguisher ? SG.models.fireExtinguisher({}) : null;
    if (ext) { K.at(ext, 13.4, 0, 6.2, -Math.PI / 2); ctx.add(ext); }
    var sign = SG.models.signExit ? SG.models.signExit({}) : null;
    if (sign) { K.at(sign, 12, 2.3, 14.8, Math.PI); ctx.add(sign); }

    /* The door at the end, and the reader that says no. */
    var reader = SG.models.keycardReader ? SG.models.keycardReader({}) : null;
    if (reader) { K.at(reader, 12.85, 1.15, 14.75, Math.PI); ctx.add(reader); }
    ctx.props.reader = reader;

    var freight = SG.models.elevatorDoors ? SG.models.elevatorDoors({ freight: true }) : null;
    if (freight) { K.at(freight, 11.7, 0, 14.9, Math.PI); ctx.add(freight); }
    ctx.props.freight = freight;
    ctx.box(11.7, 1.1, 14.98, 2.0, 2.2, 0.12, 0, 'door');
  }

  /* ------------------------------------------------------------------ */
  /* People, rules and the way through                                   */
  /* ------------------------------------------------------------------ */

  function populate(ctx) {
    var P = ctx.props;

    var concierge = K.npc(ctx, 'concierge', [3.6, 0, 6.35], Math.PI, { clip: 'idle' });
    P.concierge = concierge;

    var g1 = K.npc(ctx, 'guard', [-7.0, 0, -3.0], 0, { clip: 'walk' });
    var g2 = K.npc(ctx, 'guard', [7.6, 0, 3.4], Math.PI, { clip: 'walk' });
    P.guard1 = g1; P.guard2 = g2;

    K.patrol(ctx, g1, [
      [-7.0, 0, -4.6, 2.4, true], [-7.0, 0, 4.4, 1.6, false],
      [-1.6, 0, 5.2, 2.0, true], [-1.6, 0, -4.8, 1.4, false]
    ], { speed: 0.95 });

    K.patrol(ctx, g2, [
      [7.6, 0, 4.4, 3.0, true], [7.6, 0, -4.2, 2.2, true],
      [1.8, 0, -5.4, 1.8, false], [1.8, 0, 4.0, 1.6, true]
    ], { speed: 1.0, startDelay: 3 });

    /* Suspicion. Two guards and a concierge who misses nothing. */
    var susp = K.suspicion(ctx, {
      rate: 0.36, decay: 0.30, bark: 'hotel.guard.notice',
      onCaught: function () {
        ctx.say('hotel.guard.caught');
        ctx.fade(true, 700).then(function () {
          if (ctx.player) {
            ctx.player.teleport(new THREE.Vector3(0, 0, -6.0), 0);
          }
          susp.reset();
          return ctx.fade(false, 700);
        });
      }
    });
    susp.watcher(g1, { range: 10, fov: 105 });
    susp.watcher(g2, { range: 10, fov: 105 });
    susp.watcher(concierge, { range: 8, fov: 130, weight: 0.7 });
    /* Behind reception, and the guest lounge past the rope. */
    susp.zone(1.0, 4.9, 6.4, 6.9, 1.0);
    susp.zone(-9, -0.4, -2.2, 6.9, 0.65);
    P.suspicion = susp;

    /* ---- 1. the concierge ---- */
    var talked = false;
    ctx.interact({
      object: concierge.root, label: 'the concierge', verb: 'Speak to',
      radius: 2.2, offset: 1.3, once: true,
      onUse: function () {
        talked = true;
        concierge.play('nod');
        ctx.say('hotel.concierge.1')
          .then(function () { return ctx.say('hotel.concierge.2'); })
          .then(function () { return ctx.say('hotel.concierge.3'); })
          .then(function () {
            ctx.done('concierge');
            ctx.toast('Through the arch, past the lifts', 'objective');
            K.marker(ctx, 12, 0, 3.4);
          });
      }
    });

    ctx.every(function (dt) {
      if (ctx.player) {
        concierge.lookAt && concierge.lookAt(ctx.player.root.position);
      }
    });

    /* ---- 2. the service door ---- */
    var serviceDoor = K.door(ctx, {
      pos: [12, 0, 3.02], yaw: 0, w: 1.0, h: 2.1,
      mat: K.M('steelPainted', { color: 0x7d848a, roughness: 0.6, metalness: 0.4 }),
      label: 'the service door', sfx: 'doorSteel',
      onUse: function (c, st) {
        if (!talked) { ctx.say('hotel.objective'); return; }
        st.toggle();
        if (st.isOpen && !ctx.state.flags['hotel.inService']) {
          ctx.state.flags['hotel.inService'] = true;
          ctx.done('corridor');
        }
      }
    });

    ctx.trigger({
      pos: [12, 0, 5.5], radius: 2.0, once: true,
      onEnter: function () {
        ctx.say('hotel.reader.1');
        /* Nobody is watching back here. */
        susp.enabled = false;
        if (SG.ui.hud) SG.ui.hud.progress(null, null);
        ctx.music('infiltration', { intensity: 0.35 });
      }
    });

    /* ---- 3. the reader ---- */
    var reader = P.reader;
    var parts = (reader && reader.userData && reader.userData.parts) || {};

    K.hold(ctx, {
      object: parts.faceplate || reader || P.freight,
      label: 'the faceplate', verb: 'Unscrew', seconds: 2.6, radius: 1.6,
      condition: function () { return !ctx.state.flags['hotel.plateOff']; },
      sfx: 'screwdriver',
      onDone: function () {
        ctx.state.flags['hotel.plateOff'] = true;
        if (parts.faceplate) {
          var t = 0, from = parts.faceplate.position.clone();
          ctx.every(function (dt) {
            if (t >= 1) return;
            t = Math.min(1, t + dt * 2);
            parts.faceplate.position.z = from.z - util.ease.outCubic(t) * 0.14;
            parts.faceplate.rotation.x = -util.ease.outCubic(t) * 0.5;
          });
        }
        ctx.sfx('caseOpen', { vol: 0.6 });
        ctx.say('hotel.reader.2').then(function () {
          return ctx.say('hotel.reader.3');
        });
      }
    });

    var puzzle = K.wirePuzzle(ctx, {
      pos: [12.82, 1.15, 14.62], yaw: Math.PI, pairs: 4, seed: 4021,
      label: 'the reader loom',
      condition: function () {
        return ctx.state.flags['hotel.plateOff'] && !ctx.state.flags['hotel.readerDone'];
      },
      onStep: function (c, done, n) {
        if (reader && reader.userData && reader.userData.setState) {
          reader.userData.setState(done === n ? 'accept' : 'idle');
        }
      },
      onSolved: function () {
        ctx.state.flags['hotel.readerDone'] = true;
        if (reader && reader.userData && reader.userData.setState) {
          reader.userData.setState('accept');
        }
        ctx.done('reader');
        ctx.say('hotel.reader.done');
        K.marker(ctx, 11.7, 0, 14.3);
      }
    });

    /* ---- 4. down ---- */
    ctx.interact({
      object: P.freight || reader,
      label: 'the freight lift', verb: 'Open', radius: 2.2,
      condition: function () { return !!ctx.state.flags['hotel.readerDone']; },
      once: true,
      onUse: function () {
        ctx.sfx('badgeAccept');
        ctx.sfx('elevatorMotor', { vol: 0.7 });
        ctx.done('lift');
        ctx.say('hotel.elevator').then(function () {
          return ctx.fade(true, 1100);
        }).then(function () {
          ctx.sfx('elevatorDing');
          ctx.finish();
        });
      }
    });

    /* ---- things to poke ---- */
    if (P.bottle) {
      ctx.interact({
        object: P.bottle, label: 'a bottle of water', verb: 'Take', radius: 1.5, once: true,
        onUse: function () {
          ctx.sfx('clipSnap', { vol: 0.5 });
          ctx.say('hotel.minibar');
          ctx.egg('minibar', 'Eighteen euro');
        }
      });
    }
    if (P.painting) {
      ctx.interact({
        object: P.painting, label: 'the painting', verb: 'Look at', radius: 2.0,
        onUse: function () {
          ctx.say('hotel.painting');
          ctx.egg('painting', 'The real one is in Vienna');
        }
      });
    }
    if (P.reception) {
      ctx.interact({
        object: P.reception, label: 'the desk bell', verb: 'Ring', radius: 2.0,
        onUse: function () {
          var n = SG.count('bell');
          ctx.sfx('doorChime', { vol: 0.5, rate: 1.6 });
          if (n === 1) ctx.say('hotel.bell');
          if (n >= 4) {
            ctx.egg('bell', 'Ringing the bell four times');
            if (P.suspicion) P.suspicion.value = Math.min(0.9, P.suspicion.value + 0.25);
          }
        }
      });
    }

    /* A camera that actually sweeps. */
    var cam = SG.models.cctvCamera ? SG.models.cctvCamera({}) : null;
    if (cam) {
      K.at(cam, 8.6, 4.4, -6.2, -0.8);
      ctx.add(cam);
      var head = cam.userData && cam.userData.parts && cam.userData.parts.head;
      var ct = 0;
      ctx.every(function (dt) {
        ct += dt;
        if (head) head.rotation.y = Math.sin(ct * 0.105) * 2.1;
      });
      ctx.interact({
        object: cam, label: 'the camera', verb: 'Watch', radius: 3.0,
        onUse: function () { ctx.say('hotel.cctv'); ctx.egg('cctv', 'Hung too high'); }
      });
    }
  }

})(window.SG, window.THREE);
