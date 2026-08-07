/* =====================================================================
 * 75_level_flight.js — flight_set: the first-class cabin the c3 cutscene
 * is shot in. Night, eleven kilometres up, four people asleep.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  SG.levels.flight_set = {
    id: 'flight_set',
    music: 'flight',

    build: function (ctx) {
      ctx.spawn = { pos: [0, 0, 1.6], yaw: Math.PI };
      var P = ctx.props;

      ctx.scene.background = new THREE.Color('#05060a');
      ctx.scene.fog = new THREE.FogExp2(0x070910, 0.035);

      /* The tube. */
      var shell = ctx.prop('planeCabinShell', { len: 12, r: 1.9 });
      if (shell) K.at(shell, 0, 0, -1);
      ctx.box(0, -0.15, -1, 4.2, 0.3, 12, 0, 'metal');
      /* Fuselage walls so a stray camera cannot leave the aircraft. */
      ctx.box(-2.0, 1.3, -1, 0.2, 2.6, 12, 0, 'wall');
      ctx.box(2.0, 1.3, -1, 0.2, 2.6, 12, 0, 'wall');

      /* Seat pods: 1A/1B ahead, 2A/2B — Steve is 2A, port side. */
      var seatPos = [
        [-1.05, 0, -0.95, 0],      /* 2A — Steve */
        [1.05, 0, -0.95, 0],       /* 2B */
        [-1.05, 0, 0.75, 0],       /* 3A */
        [1.05, 0, 0.75, 0]         /* 3B */
      ];
      var seats = [];
      seatPos.forEach(function (s, i) {
        var pod = SG.models.planeSeatFirst ? SG.models.planeSeatFirst({ variant: i }) : null;
        if (!pod) return;
        K.at(pod, s[0], s[1], s[2], s[3]);
        ctx.add(pod);
        ctx.box(s[0], 0.45, s[2], 0.95, 0.9, 1.25, 0, 'furniture');
        seats.push(pod);
      });
      P.seat = seats[0] || shell;

      /* The window, and the country going past underneath it. */
      var win = SG.models.planeWindow ? SG.models.planeWindow({}) : null;
      if (win) {
        K.at(win, -1.86, 1.22, -0.9, Math.PI / 2);
        ctx.add(win);
        P.window = win;
      }
      var cityTex = K.T('nightCity');
      if (cityTex) {
        var cityMat = new THREE.MeshBasicMaterial({ map: cityTex, toneMapped: false });
        var city = new THREE.Mesh(K.unitPlane(), cityMat);
        city.scale.set(3.2, 2.0, 1);
        city.rotation.y = Math.PI / 2;
        city.position.set(-2.35, 1.2, -0.9);
        ctx.add(city);
        var drift = 0;
        ctx.every(function (dt) {
          drift += dt * 0.004;
          if (cityMat.map) { cityMat.map.offset.x = drift % 1; }
        });
      }
      /* A second window further forward, for the wide. */
      var win2 = SG.models.planeWindow ? SG.models.planeWindow({}) : null;
      if (win2) { K.at(win2, -1.86, 1.22, 0.8, Math.PI / 2); ctx.add(win2); }

      /* Steve's tray: the burner, the dossier, a glass nobody touched. */
      var phone = SG.models.phoneBurner ? SG.models.phoneBurner({ lit: true }) : null;
      if (phone) {
        K.at(phone, -0.62, 1.02, -0.75, 0.22);
        ctx.add(phone);
        P.phone = phone;
        var glow = new THREE.PointLight(0x9fd8ff, 1.6, 1.1, 2);
        glow.position.set(-0.62, 1.12, -0.75);
        ctx.add(glow);
        var pulse = 0;
        ctx.every(function (dt) {
          pulse += dt;
          glow.intensity = 1.35 + Math.sin(pulse * 1.4) * 0.18;
        });
      }
      var dossier = SG.models.dossierFolder ? SG.models.dossierFolder({ open: true }) : null;
      if (dossier) {
        K.at(dossier, -1.28, 1.01, -0.62, -0.35);
        ctx.add(dossier);
        P.dossier = dossier;
      }

      /* Steve, in 2A. */
      P.steve = K.npc(ctx, 'steve', [-1.05, 0.44, -1.05], 0, { clip: 'sit' });

      /* Three other people who will never know. */
      [[1.05, -0.02, -1.05, 1], [-1.05, -0.02, 0.65, 2], [1.05, -0.02, 0.65, 3]]
        .forEach(function (p, i) {
          var pax = K.npc(ctx, 'passenger', [p[0], 0.44, p[2]], p[1] > 0 ? 0 : 0,
            { variant: p[3], clip: 'sit' });
          if (pax && pax.root) pax.root.rotation.y = 0;
        });

      /* ---- light: almost none ---- */
      K.ambient(ctx, { sky: 0x1c2634, ground: 0x0d0f14, intensity: 0.32 });

      /* Cabin wash, cold and dim. */
      var wash = new THREE.PointLight(0x6f86b8, 2.4, 7, 2);
      wash.position.set(0, 1.95, -0.4);
      ctx.add(wash);

      /* Aisle floor strip — the only warm thing in the frame. */
      var strip = new THREE.Mesh(K.unitPlane(),
        new THREE.MeshBasicMaterial({ color: 0xffb066, toneMapped: false }));
      strip.scale.set(0.055, 9, 1);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.012, -1);
      ctx.add(strip);

      /* Reading light over 2A, the reason we can see his face at all. */
      var read = new THREE.SpotLight(0xffd9a8, 12, 3.4, 0.5, 0.6, 2);
      read.position.set(-1.05, 2.0, -1.15);
      read.target.position.set(-0.85, 1.0, -0.8);
      ctx.add(read.target);
      ctx.add(read);

      K.motes(ctx, {
        count: SG.qpick(0, 40, 80), size: 0.01, color: 0x9fb6d8,
        bounds: { x: 1.6, y: 1.6, z: 3, cx: 0, cy: 1.2, cz: -0.6 }
      });

      if (ctx.player) ctx.player.visible(false);
    },

    update: function () { },
    dispose: function () {
      if (SG.audio && SG.audio.ambience) SG.audio.ambience(null);
    }
  };

})(window.SG, window.THREE);
