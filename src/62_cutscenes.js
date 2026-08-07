/* =====================================================================
 * 62_cutscenes.js — the five cinematics.
 *
 * Coverage, not coverage-shaped filler: a wide to establish, a two-shot to
 * put people in a room together, singles over the shoulder for the
 * dialogue, an insert on the hands for the thing that matters, and a
 * closing wide to let the scene breathe out. Lenses vary on purpose —
 * fov 24-30 compresses and makes a moment intimate, 45-55 is the room.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var C = SG.cinema;

  /* Shop set landmarks — must match 71_level_shop.js. Every camera target
   * below carries one of these as a fallback so a missing prop degrades to
   * a still-correct frame rather than a shot of the floor. */
  var BENCH = [-2.2, 1.05, 3.4];
  var TOWER = [-2.55, 1.15, 3.45];
  var COUNTER = [-2.6, 1.1, -0.95];
  var DOOR = [-2.1, 1.35, -4.1];
  var STEVE_BENCH = [-2.0, 1.55, 2.6];
  var ELLIS_STAND = [-2.4, 1.35, -1.75];

  function rig(name, fallback) {
    return { at: name, fallback: fallback, eye: true };
  }

  /* ================================================================== */
  /* c1_open — Closing Time                                              */
  /* ================================================================== */

  C.register('c1_open', {
    music: 'shopAmbient',
    letterbox: true,
    handheld: 1,

    onStart: function (ctx) {
      if (!ctx || !ctx.props) return;
      var P = ctx.props;
      if (P.steve && P.steve.root) {
        P.steve.root.position.set(-2.0, 0, 2.6);
        P.steve.root.rotation.y = Math.PI * 0.96;
        P.steve.play('work');
      }
      if (P.ellis && P.ellis.root) {
        P.ellis.root.position.set(-2.4, 0, -1.75);
        P.ellis.root.rotation.y = 0.05;
        P.ellis.play('idle');
      }
      if (P.oleg && P.oleg.root) {
        P.oleg.root.visible = false;
        P.oleg.root.position.set(-2.1, 0, -3.45);
        P.oleg.root.rotation.y = 0.0;
      }
      if (P.cat && P.cat.play) P.cat.play('catSleep');
    },

    shots: [
      /* 1 — the room, wide, a slow push. Late light through the front. */
      {
        t: 0, dur: 6.2, fov: 50, ease: 'inOutCubic',
        from: [3.1, 1.9, -2.4], to: [2.0, 1.78, -1.1],
        lookFrom: [-2.0, 1.1, 2.6], lookTo: [-2.2, 1.15, 3.1],
        fx: { grain: 0.22, vignette: 0.5 }
      },
      /* 2 — over Steve's shoulder onto the open machine. */
      {
        t: 6.2, dur: 7.1, cut: true, fov: 40,
        from: [-3.7, 1.52, 2.15], to: [-3.45, 1.48, 2.45],
        lookAt: { at: 'tower', fallback: TOWER, eye: true }, dof: 2.2
      },
      /* 3 — Ms. Ellis, single, from Steve's eyeline. */
      {
        t: 13.3, dur: 4.0, cut: true, fov: 36,
        from: [-1.35, 1.52, -0.35], to: [-1.3, 1.5, -0.5],
        lookAt: rig('ellis', ELLIS_STAND)
      },
      /* 4 — back to the bench; the work continues while he talks. */
      {
        t: 17.3, dur: 6.9, cut: true, fov: 44,
        from: [-0.9, 1.6, 2.0], to: [-1.15, 1.55, 2.25],
        lookAt: rig('steve', STEVE_BENCH), dof: 3.0
      },
      /* 5 — the two-shot: both of them, the length of the shop apart. */
      {
        t: 24.2, dur: 5.8, cut: true, fov: 46,
        from: [3.5, 1.6, 0.5], to: [3.2, 1.58, 0.35],
        lookFrom: [-2.2, 1.35, 0.6], lookTo: [-2.2, 1.35, 0.2]
      },
      /* 6 — insert. The three-dollar part, going in. */
      {
        t: 30.0, dur: 5.2, cut: true, fov: 25,
        from: [-2.95, 1.22, 2.92], to: [-2.86, 1.18, 3.02],
        lookAt: { at: 'tower', fallback: TOWER, eye: true },
        dof: 1.1, fx: { bloom: 0.5 }
      },
      /* 7 — she talks about Harold. Hold on her. */
      {
        t: 35.2, dur: 5.4, cut: true, fov: 34,
        from: [-1.5, 1.45, -0.55], to: [-1.45, 1.44, -0.7],
        lookAt: rig('ellis', ELLIS_STAND), dof: 2.4
      },
      /* 8 — his answer. */
      {
        t: 40.6, dur: 3.9, cut: true, fov: 38,
        from: [-1.1, 1.58, 1.7], to: [-1.15, 1.57, 1.85],
        lookAt: rig('steve', STEVE_BENCH)
      },
      /* 9 — the door. The chime. A shape in the glass. */
      {
        t: 44.5, dur: 5.0, cut: true, fov: 42,
        from: [-2.1, 1.62, -1.5], to: [-2.1, 1.6, -1.9],
        lookFrom: [-2.1, 1.5, -4.1], lookTo: [-2.1, 1.45, -4.1],
        shake: 0.004
      },
      /* 10 — "I'll be right with you, Mr. Thomas." Nothing changes in his
       * face, and that is the whole point of the shot. */
      {
        t: 49.5, dur: 5.3, cut: true, fov: 32,
        from: [-3.3, 1.6, 1.5], to: [-3.2, 1.6, 1.35],
        lookAt: rig('steve', STEVE_BENCH), dof: 1.9
      },
      /* 11 — closing wide, tracking, as he walks her out. */
      {
        t: 54.8, dur: 8.4, fov: 48, ease: 'inOutQuart',
        from: [3.3, 1.95, -2.6], to: [2.1, 1.82, -3.5],
        lookFrom: [-2.2, 1.2, -1.4], lookTo: [-2.1, 1.2, -3.9]
      }
    ],

    beats: [
      { t: 0.2, fx: { exposure: 1.0 } },
      { t: 1.0, say: 'c1.ellis.1' },
      { t: 6.2, say: 'c1.steve.1' },
      { t: 9.0, sfx: 'screwdriver', sfxOpts: { vol: 0.5 } },
      { t: 13.3, say: 'c1.ellis.2' },
      { t: 17.2, say: 'c1.steve.2' },
      { t: 24.2, say: 'c1.ellis.3' },
      { t: 26.9, say: 'c1.steve.3' },
      { t: 30.0, sfx: 'clipSnap', sfxOpts: { vol: 0.85 } },
      { t: 30.5, say: 'c1.ellis.4' },
      { t: 35.2, say: 'c1.steve.4' },
      { t: 36.9, say: 'c1.ellis.5' },
      { t: 40.6, say: 'c1.steve.5' },
      { t: 43.0, sfx: 'caseClose', sfxOpts: { vol: 0.6 } },

      /* The chime, and the man in the door. */
      { t: 44.6, sfx: 'doorChime' },
      {
        t: 44.7, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.oleg && P.oleg.root) {
            P.oleg.root.visible = true;
            P.oleg.play('idle');
          }
          if (P && P.door && P.door.open) P.door.open();
        }
      },
      { t: 45.4, anim: { who: 'oleg', clip: 'nod' } },
      { t: 46.0, say: 'c1.steve.6' },
      {
        t: 46.1, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.steve && P.steve.play) P.steve.play('idle');
        }
      },
      { t: 49.4, say: 'c1.ellis.6' },
      { t: 52.3, say: 'c1.steve.7' },
      { t: 54.8, say: 'c1.ellis.7' },
      {
        t: 55.0, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.steve && P.steve.play) P.steve.play('walk');
          if (P && P.ellis && P.ellis.play) P.ellis.play('walk');
        }
      },
      { t: 58.4, say: 'c1.steve.8' },
      { t: 62.0, fade: true, ms: 1100 }
    ],

    onEnd: function (ctx) {
      if (ctx && ctx.props && ctx.props.door && ctx.props.door.close) {
        ctx.props.door.close();
      }
    }
  });

  /* ================================================================== */
  /* c2_brief — The Briefing                                             */
  /* ================================================================== */

  C.register('c2_brief', {
    music: 'briefing',
    letterbox: true,
    handheld: 1.1,

    onStart: function (ctx) {
      if (!ctx || !ctx.props) return;
      var P = ctx.props;
      if (P.ellis && P.ellis.root) P.ellis.root.visible = false;
      if (P.steve && P.steve.root) {
        P.steve.root.visible = true;
        P.steve.root.position.set(-2.6, 0, -0.15);
        P.steve.root.rotation.y = Math.PI;
        P.steve.play('idle');
        if (P.steve.setMood) P.steve.setMood('focused');
      }
      if (P.oleg && P.oleg.root) {
        P.oleg.root.visible = true;
        P.oleg.root.position.set(-2.6, 0, -1.85);
        P.oleg.root.rotation.y = 0;
        P.oleg.play('idle');
      }
      if (P.briefKit) P.briefKit.visible = false;
      if (P.door && P.door.close) P.door.close();
    },

    shots: [
      /* 1 — the shop after hours: two men and a counter. */
      {
        t: 0, dur: 6.0, fov: 44, ease: 'inOutCubic',
        from: [1.9, 1.62, -1.2], to: [1.35, 1.58, -1.05],
        lookFrom: [-2.6, 1.3, -0.95], lookTo: [-2.6, 1.3, -1.0],
        fx: { grain: 0.3, vignette: 0.62 }
      },
      /* 2 — over Oleg onto Steve. */
      {
        t: 6.0, dur: 6.4, cut: true, fov: 38,
        from: [-2.15, 1.68, -2.15], to: [-2.2, 1.66, -2.0],
        lookAt: rig('steve', [-2.6, 1.6, -0.15]), dof: 2.0
      },
      /* 3 — reverse. Oleg, filling the frame, not moving. */
      {
        t: 12.4, dur: 7.6, cut: true, fov: 36,
        from: [-3.05, 1.72, -0.1], to: [-3.0, 1.72, -0.25],
        lookAt: rig('oleg', [-2.6, 1.75, -1.85]), dof: 2.2
      },
      /* 4 — insert: the latches. */
      {
        t: 20.0, dur: 4.4, cut: true, fov: 26,
        from: [-3.35, 1.42, -0.42], to: [-3.2, 1.36, -0.5],
        lookAt: { at: 'briefcase', fallback: [-3.0, 1.12, -0.7] },
        dof: 0.9, fx: { bloom: 0.45 }
      },
      /* 5 — the contents, laid out. A phone, a ticket, another man's name. */
      {
        t: 24.4, dur: 6.6, cut: true, fov: 32,
        from: [-2.55, 1.96, -0.28], to: [-2.55, 1.86, -0.4],
        lookFrom: [-2.6, 1.07, -0.72], lookTo: [-2.6, 1.07, -0.72],
        dof: 1.2
      },
      /* 6 — Oleg lays out the job. Hold on him; he doesn't move. */
      {
        t: 31.0, dur: 9.0, cut: true, fov: 34,
        from: [-2.95, 1.7, -0.35], to: [-2.92, 1.7, -0.45],
        lookAt: rig('oleg', [-2.6, 1.75, -1.85]), dof: 2.4
      },
      /* 7 — Steve. The question. */
      {
        t: 40.0, dur: 6.2, cut: true, fov: 28,
        from: [-2.3, 1.66, -1.75], to: [-2.32, 1.66, -1.68],
        lookAt: rig('steve', [-2.6, 1.6, -0.15]), dof: 1.5
      },
      /* 8 — Oleg's answer. Two seconds of nothing first. */
      {
        t: 46.2, dur: 5.4, cut: true, fov: 28,
        from: [-2.88, 1.72, -0.5], to: [-2.9, 1.72, -0.56],
        lookAt: rig('oleg', [-2.6, 1.75, -1.85]), dof: 1.5
      },
      /* 9 — out wide. The shop, the counter, the case, the two of them. */
      {
        t: 51.6, dur: 8.0, cut: true, fov: 47, ease: 'inOutQuart',
        from: [1.5, 1.7, -1.0], to: [2.9, 1.9, -0.6],
        lookFrom: [-2.6, 1.3, -1.0], lookTo: [-2.6, 1.25, -1.0]
      }
    ],

    beats: [
      { t: 1.2, say: 'c2.oleg.1' },
      { t: 3.6, say: 'c2.steve.1' },
      { t: 8.0, say: 'c2.oleg.2' },
      { t: 10.4, say: 'c2.oleg.3' },
      { t: 14.0, say: 'c2.steve.2' },
      { t: 16.2, say: 'c2.oleg.4' },
      { t: 20.1, sfx: 'briefcaseLatch' },
      {
        t: 20.2, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.briefKit) P.briefKit.visible = true;
          if (P && P.oleg && P.oleg.play) P.oleg.play('point');
        }
      },
      { t: 22.6, say: 'c2.steve.3' },
      { t: 24.6, say: 'c2.oleg.5' },
      { t: 31.2, say: 'c2.steve.4' },
      { t: 33.0, say: 'c2.oleg.6' },
      { t: 36.4, say: 'c2.oleg.7' },
      { t: 40.2, say: 'c2.steve.5' },
      { t: 41.6, say: 'c2.oleg.8' },
      { t: 43.0, sfx: 'paperRustle', sfxOpts: { vol: 0.6 } },
      { t: 43.4, say: 'c2.oleg.9' },
      { t: 46.4, say: 'c2.oleg.10' },
      { t: 51.0, say: 'c2.steve.6' },
      { t: 52.4, say: 'c2.oleg.11' },
      { t: 55.4, say: 'c2.oleg.12' },

      /* The best line in the game gets silence on both sides of it. */
      { t: 59.4, say: 'c2.steve.7' },
      { t: 62.6, stinger: 'briefingHit' },
      { t: 63.4, say: 'c2.oleg.13' },
      { t: 65.4, say: 'c2.steve.8' },
      { t: 68.4, say: 'c2.oleg.14' },
      {
        t: 68.5, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.oleg && P.oleg.play) P.oleg.play('nod');
        }
      },
      { t: 71.0, say: 'c2.steve.9' },
      { t: 74.8, fade: true, ms: 1200 }
    ],

    /* Shots 7-9 run past their authored length; the last shot holds. */
    dur: 76.5
  });

  /* ================================================================== */
  /* c3_flight — Nine Hours                                              */
  /* ================================================================== */

  C.register('c3_flight', {
    music: 'flight',
    letterbox: true,
    handheld: 0.5,

    onStart: function (ctx) {
      if (!ctx || !ctx.props) return;
      var P = ctx.props;
      if (P.steve && P.steve.root) {
        P.steve.root.visible = true;
        P.steve.play('sit');
      }
    },

    shots: [
      /* 1 — the cabin, dark, from the aisle. Almost nothing moves. */
      {
        t: 0, dur: 7.0, fov: 40, ease: 'inOutCubic',
        from: [0.0, 1.45, 3.6], to: [0.0, 1.38, 2.4],
        lookFrom: [-0.5, 1.15, -1.0], lookTo: [-0.5, 1.1, -1.4],
        fx: { grain: 0.34, vignette: 0.7, bloom: 0.6 }
      },
      /* 2 — the window. A city under cloud, eleven kilometres down. */
      {
        t: 7.0, dur: 6.5, cut: true, fov: 32,
        from: [-0.15, 1.28, -0.55], to: [-0.25, 1.28, -0.62],
        lookAt: { at: 'window', fallback: [-1.05, 1.25, -0.9] }, dof: 2.6
      },
      /* 3 — the phone, face-up on the tray. The job, in nine words. */
      {
        t: 13.5, dur: 6.0, cut: true, fov: 26,
        from: [-0.5, 1.28, -0.35], to: [-0.48, 1.22, -0.45],
        lookAt: { at: 'phone', fallback: [-0.62, 1.02, -0.75] },
        dof: 0.8, fx: { bloom: 0.75 }
      },
      /* 4 — his face, lit only by the screen. */
      {
        t: 19.5, dur: 6.2, cut: true, fov: 34,
        from: [0.35, 1.35, -1.5], to: [0.3, 1.34, -1.42],
        lookAt: rig('steve', [-0.55, 1.25, -1.15]), dof: 1.4
      },
      /* 5 — insert: he swipes past Brandt to a photograph of a cat. */
      {
        t: 25.7, dur: 6.4, cut: true, fov: 24,
        from: [-0.46, 1.24, -0.4], to: [-0.46, 1.2, -0.46],
        lookAt: { at: 'phone', fallback: [-0.62, 1.02, -0.75] }, dof: 0.7
      },
      /* 6 — he turns it face-down, and the cabin goes to sleep. */
      {
        t: 32.1, dur: 8.4, cut: true, fov: 44, ease: 'inOutQuart',
        from: [0.1, 1.5, 1.4], to: [0.1, 1.55, 2.6],
        lookFrom: [-0.5, 1.2, -1.0], lookTo: [-0.5, 1.2, -1.2]
      }
    ],

    beats: [
      { t: 0.4, sfx: 'planeCabinHum', sfxOpts: { loop: true, vol: 0.5 } },
      { t: 2.5, sfx: 'planeChime', sfxOpts: { vol: 0.35 } },
      { t: 3.0, say: 'c3.pa.1' },
      { t: 13.8, say: 'c3.phone.1' },
      { t: 17.4, say: 'c3.steve.1' },
      { t: 20.4, say: 'c3.steve.2' },
      { t: 26.2, sfx: 'keyType', sfxOpts: { vol: 0.35, rate: 1.4 } },
      { t: 27.4, say: 'c3.steve.3' },
      {
        t: 32.4, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.phone) P.phone.rotation.z = Math.PI;
          if (P && P.steve && P.steve.play) P.steve.play('sit');
        }
      },
      { t: 32.6, sfx: 'thud', sfxOpts: { vol: 0.25 } },
      { t: 34.0, fx: { dof: 3.5 } },
      { t: 38.0, fade: true, ms: 2000 }
    ],
    dur: 41.5
  });

  /* ================================================================== */
  /* c_vault_halcyon — in-level, when the machine works out what is       */
  /* happening to it                                                     */
  /* ================================================================== */

  C.register('c_vault_halcyon', {
    letterbox: true,
    handheld: 1.4,

    shots: [
      /* Framed off the player, wherever they happen to be standing. */
      {
        t: 0, dur: 5.0, fov: 38, ease: 'outCubic',
        from: { at: '@player', off: [0.6, 1.55, -2.4] },
        to: { at: '@player', off: [0.4, 1.5, -1.9] },
        lookAt: { at: 'halcyon', fallback: [0, 1.3, 6] },
        shake: 0.006, fx: { grain: 0.4, ca: 0.5 }
      },
      {
        t: 5.0, dur: 5.6, cut: true, fov: 26,
        from: { at: 'halcyon', off: [0.55, 1.5, -1.15], fallback: [0.55, 1.5, 4.85] },
        to: { at: 'halcyon', off: [0.42, 1.45, -0.95], fallback: [0.42, 1.45, 5.05] },
        lookAt: { at: 'halcyon', fallback: [0, 1.4, 6], off: [0, 0.35, 0] },
        dof: 0.9, shake: 0.01
      },
      {
        t: 10.6, dur: 5.2, cut: true, fov: 34,
        from: { at: '@player', off: [-0.75, 1.6, -1.5] },
        to: { at: '@player', off: [-0.6, 1.58, -1.3] },
        lookAt: { at: '@player', off: [0, 0, 0.6], eye: true },
        dof: 1.6
      },
      {
        t: 15.8, dur: 7.4, cut: true, fov: 30,
        from: { at: 'halcyon', off: [1.1, 1.7, -2.0], fallback: [1.1, 1.7, 4.0] },
        to: { at: 'halcyon', off: [0.7, 1.6, -1.5], fallback: [0.7, 1.6, 4.5] },
        lookAt: { at: 'halcyon', fallback: [0, 1.3, 6] },
        shake: 0.03, fx: { glitch: 0.7, ca: 0.9 }
      }
    ],

    beats: [
      { t: 0.3, music: 'vault', stinger: 'halcyonWake' },
      { t: 0.6, say: 'halcyon.1' },
      { t: 3.0, say: 'halcyon.2' },
      { t: 6.4, say: 'halcyon.3' },
      { t: 9.4, say: 'halcyon.4' },
      { t: 11.2, say: 'vault.steve.1' },
      { t: 12.6, say: 'halcyon.5' },
      { t: 14.6, say: 'vault.steve.2' },
      { t: 15.9, say: 'halcyon.6' },
      { t: 17.6, say: 'vault.steve.3' },
      { t: 19.4, say: 'halcyon.7' },
      { t: 19.5, fx: { glitch: 1.0 }, shake: 0.05 },
      { t: 20.2, sfx: 'sparkArc' },
      {
        t: 20.4, action: function (ctx) {
          var h = ctx && ctx.props && ctx.props.halcyon;
          if (h && h.userData && h.userData.setState) h.userData.setState('dying');
        }
      },
      { t: 21.4, say: 'vault.steve.4' },
      { t: 22.6, fx: { glitch: 0, ca: 0.2 } }
    ],
    dur: 24.0
  });

  /* ================================================================== */
  /* c7_home — Home                                                      */
  /* ================================================================== */

  C.register('c7_home', {
    music: 'credits',
    letterbox: true,
    handheld: 0.8,

    onStart: function (ctx) {
      if (!ctx || !ctx.props) return;
      var P = ctx.props;
      if (P.steve && P.steve.root) {
        P.steve.root.visible = true;
        P.steve.root.position.set(-2.3, 0, 2.8);
        P.steve.root.rotation.y = Math.PI * 0.92;
        P.steve.play('work');
        if (P.steve.setMood) P.steve.setMood('warm');
      }
      if (P.oleg && P.oleg.root) P.oleg.root.visible = false;
      if (P.ellis && P.ellis.root) {
        P.ellis.root.visible = false;
        P.ellis.root.position.set(-2.1, 0, -3.4);
        P.ellis.root.rotation.y = 0;
      }
      if (P.briefKit) P.briefKit.visible = false;
      if (P.cat && P.cat.root) {
        P.cat.root.position.set(-4.9, 1.82, 0.35);
        P.cat.play('catSleep');
      }
    },

    shots: [
      /* 1 — morning. Same room, different light. */
      {
        t: 0, dur: 6.5, fov: 46, ease: 'inOutCubic',
        from: [2.6, 1.85, -1.6], to: [1.7, 1.75, -0.6],
        lookFrom: [-2.4, 1.2, 2.4], lookTo: [-2.4, 1.2, 2.8],
        fx: { grain: 0.18, vignette: 0.42, exposure: 1.08 }
      },
      /* 2 — the cat, asleep on the warm one. */
      {
        t: 6.5, dur: 5.0, cut: true, fov: 30,
        from: [-3.6, 1.95, 0.9], to: [-3.4, 1.92, 0.75],
        lookAt: { at: 'cat', fallback: [-4.9, 1.9, 0.35] }, dof: 1.1
      },
      /* 3 — the chime, the door, and a 93-year-old woman with a problem. */
      {
        t: 11.5, dur: 5.4, cut: true, fov: 42,
        from: [-2.1, 1.62, -1.2], to: [-2.1, 1.6, -1.5],
        lookFrom: [-2.1, 1.4, -4.0], lookTo: [-2.1, 1.35, -3.6]
      },
      /* 4 — two-shot. Exactly the frame the game opened on. */
      {
        t: 16.9, dur: 7.2, cut: true, fov: 46,
        from: [3.4, 1.6, 0.4], to: [3.15, 1.58, 0.3],
        lookFrom: [-2.2, 1.35, 0.4], lookTo: [-2.2, 1.35, 0.1]
      },
      /* 5 — outside the glass, a car that doesn't stop. */
      {
        t: 24.1, dur: 6.0, cut: true, fov: 36,
        from: [-1.2, 1.7, -2.2], to: [-1.35, 1.68, -2.4],
        lookFrom: [-3.0, 1.5, -6.5], lookTo: [-3.6, 1.5, -7.5], dof: 3.0
      },
      /* 6 — pull back through the shop and out. Credits. */
      {
        t: 30.1, dur: 11.0, cut: true, fov: 50, ease: 'inOutQuart',
        from: [0.4, 1.7, -1.0], to: [1.2, 2.2, -3.9],
        lookFrom: [-2.3, 1.3, 1.6], lookTo: [-2.3, 1.3, 2.4]
      }
    ],

    beats: [
      { t: 6.8, sfx: 'catPurr', sfxOpts: { vol: 0.5 } },
      { t: 11.6, sfx: 'doorChime' },
      {
        t: 11.7, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.ellis && P.ellis.root) {
            P.ellis.root.visible = true;
            P.ellis.play('walk');
          }
          if (P && P.door && P.door.open) P.door.open();
        }
      },
      { t: 13.0, say: 'c7.steve.1' },
      {
        t: 14.6, action: function (ctx) {
          var P = ctx && ctx.props;
          if (P && P.ellis && P.ellis.play) P.ellis.play('idle');
          if (P && P.steve && P.steve.play) P.steve.play('idle');
        }
      },
      { t: 15.0, say: 'c7.ellis.1' },
      { t: 17.4, say: 'c7.steve.2' },
      { t: 20.2, say: 'c7.ellis.2' },
      { t: 22.0, say: 'c7.steve.3' },
      { t: 25.6, say: 'c7.ellis.3' },
      { t: 28.4, say: 'c7.steve.4' },
      { t: 30.2, stinger: 'homeResolve' },
      { t: 40.0, fade: true, ms: 2600 }
    ],
    dur: 43.5,

    onEnd: function () {
      if (SG.ui && SG.ui.menu && SG.ui.menu.credits) {
        SG.safe('credits', function () { SG.ui.menu.credits(); });
      }
    }
  });

})(window.SG, window.THREE);
