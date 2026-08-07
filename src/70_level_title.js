/* =====================================================================
 * 70_level_title.js — the title scene.
 *
 * A bench, a lamp, an open machine, a sleeping cat. The camera drifts. It
 * is the last thing Steve looks at before he locks up, and the first thing
 * the player sees. No menu art — the menu is an overlay on a real room.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var K = SG.kit;
  var util = SG.util;

  SG.levels.title = {
    id: 'title',
    music: 'titleTheme',

    build: function (ctx) {
      ctx.spawn = { pos: [0, 0, 2], yaw: Math.PI };

      ctx.scene.background = new THREE.Color('#05070a');
      ctx.scene.fog = new THREE.FogExp2(0x05070a, 0.055);

      /* A pool of floor, so the bench isn't standing in the void. */
      var floor = new THREE.Mesh(
        new THREE.CircleGeometry(9, 40),
        K.M('carpetOffice', { color: 0x2a2b28, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      ctx.add(floor);

      /* Back wall, far enough behind the bench that the desk lamp falls off
       * before it reaches it — at 0.35 m it simply blew out. */
      K.box(ctx.world, K.M('drywall', { color: 0x4a463f, roughness: 0.95 }),
        0, 1.6, 2.6, 9, 3.2, 0.12);

      /* The bench. */
      var bench = ctx.prop('benchTable', { w: 3.2, d: 0.78 });
      K.at(bench, 0, 0, 0.9);

      var mat = ctx.prop('antistaticMat');
      K.at(mat, -0.2, 0.9, 0.85);

      var tower = ctx.prop('pcTowerOpen', { beige: true });
      K.at(tower, -0.42, 0.9, 0.8, Math.PI * 0.12);

      var crt = ctx.prop('crtMonitor');
      K.at(crt, 1.15, 0.9, 0.98, -0.42);

      var kb = ctx.prop('keyboardBeige');
      K.at(kb, 1.0, 0.9, 0.4, -0.36);

      var drivers = ctx.prop('screwdriverSet');
      K.at(drivers, -1.25, 0.91, 0.62, 0.5);

      var mug = ctx.prop('coffeeMug', { text: "WORLD'S OKAYEST TECH" });
      K.at(mug, 0.55, 0.9, 0.5, 0.7);

      var duck = ctx.prop('rubberDuck');
      K.at(duck, 0.18, 0.9, 1.16, -0.8);

      var lamp = ctx.prop('deskLamp');
      K.at(lamp, -1.55, 0.9, 1.15, 0.75);

      /* Kernel, asleep on the warm one. */
      var psu = ctx.prop('psu');
      K.at(psu, -2.0, 0.9, 0.95, Math.PI / 2);
      var cat = K.npc(ctx, 'cat', [-2.0, 1.03, 0.95], 1.1, { clip: 'catSleep' });
      ctx.props.cat = cat;

      /* ---- light ---- */
      K.ambient(ctx, { sky: 0x223044, ground: 0x140f0c, intensity: 0.13 });

      var deskLight = new THREE.PointLight(0xffcf94, 7.5, 4.0, 2);
      deskLight.position.set(-1.35, 1.62, 1.0);
      deskLight.castShadow = SG.quality !== 'low';
      if (deskLight.castShadow) {
        deskLight.shadow.mapSize.set(SG.qpick(256, 512, 1024), SG.qpick(256, 512, 1024));
        deskLight.shadow.bias = -0.004;
      }
      ctx.add(deskLight);

      /* The monitor's own glow, cold against the lamp's warm. */
      var crtLight = new THREE.PointLight(0x6fd8ff, 3.2, 3.4, 2);
      crtLight.position.set(1.0, 1.28, 0.62);
      ctx.add(crtLight);

      var rim = new THREE.DirectionalLight(0x5c78a8, 0.18);
      rim.position.set(4, 3, -5);
      ctx.add(rim);

      K.motes(ctx, {
        count: SG.qpick(0, 70, 150),
        bounds: { x: 2.6, y: 1.8, z: 1.6, cx: 0, cy: 1.3, cz: 0.7 }
      });

      /* The CRT runs the shop's diagnostic idler. */
      var screenMesh = (crt && crt.userData && crt.userData.screen) || null;
      var lines = [
        'STEVE’S PC & LAPTOP REPAIR',
        '--------------------------------',
        'BENCH 1  : IDLE',
        'BENCH 2  : IDLE',
        'QUEUE    : 0 TICKETS',
        '',
        'LAST JOB : ELLIS, M.  CMOS CELL',
        'STATUS   : CLOSED  —  NO CHARGE',
        '',
        'OPEN 9-6 MON-FRI',
        'WE FIX WHAT THE OTHER SHOPS WON’T'
      ];
      K.screen(ctx, screenMesh, function (g, w, h, time) {
        K.termStyle(g, w, h, { size: Math.round(h / 20) });
        var lh = Math.round(h / 15.5);
        K.termLines(g, lines, Math.round(w * 0.06), Math.round(h * 0.07), lh);
        if (Math.floor(time * 1.6) % 2 === 0) {
          g.fillRect(Math.round(w * 0.06), Math.round(h * 0.07) + lines.length * lh,
            lh * 0.5, lh * 0.8);
        }
        K.scanlines(g, w, h, 0.15);
      }, { w: 400, h: 300, hz: 4 });

      /* ---- the drifting camera ---- */
      var cam = ctx.camera;
      var t = 0;
      cam.fov = 38;
      cam.updateProjectionMatrix();
      var look = new THREE.Vector3(-0.2, 1.05, 0.85);

      ctx.every(function (dt) {
        if (SG.cinema && SG.cinema.isPlaying && SG.cinema.isPlaying()) return;
        t += dt;
        /* An arc in FRONT of the bench, never behind it — the back wall is
         * only half a metre past the subject. Two incommensurate periods so
         * the move never visibly loops. */
        var a = Math.sin(t * 0.085) * 0.5 + Math.sin(t * 0.031) * 0.12;
        var r = 2.95 + Math.sin(t * 0.061) * 0.28;
        cam.position.set(
          look.x + Math.sin(a) * r,
          1.46 + Math.sin(t * 0.052) * 0.10,
          look.z - Math.cos(a) * r * 0.86
        );
        cam.lookAt(look);
        /* Push the subject right of centre so the menu has the left third. */
        cam.rotateY(-0.17);
        /* A touch of handheld, so it reads as photographed. */
        cam.rotation.z += Math.sin(t * 0.37) * 0.0035;
        cam.rotation.x += Math.sin(t * 0.51 + 1.3) * 0.0025;
      });

      if (ctx.player) ctx.player.visible(false);
      if (SG.fx && SG.fx.set) {
        SG.fx.set('vignette', 0.72);
        SG.fx.set('grain', 0.3);
        SG.fx.set('bloom', 0.55);
      }
    },

    update: function () { },

    dispose: function () {
      if (SG.engine && SG.engine.camera) {
        SG.engine.camera.fov = 55;
        SG.engine.camera.updateProjectionMatrix();
      }
    }
  };

})(window.SG, window.THREE);
