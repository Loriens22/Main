/* =====================================================================
 * 42_player.js — SG.player
 *
 * Steve. A capsule with a spring arm and opinions about footwear.
 *
 *   - Character integration is fixed-step (60 Hz, max 3 substeps/frame) so
 *     a 30 fps phone and a 144 Hz desktop feel identical.
 *   - Collision is entirely SG.phys.world.moveCapsule().
 *   - Camera is third-person over-the-shoulder by default with a
 *     sphere-cast spring arm that pulls in instantly and pushes back out
 *     slowly, so it never pops.
 *   - Head bob is driven by the stride phase, not a free-running sine, so
 *     the footstep sound lands on the foot.
 *   - Every cosmetic (bob, FOV kick, roll, landing dip) scales to zero
 *     under SG.state.settings.reduceMotion.
 *
 * Zero allocation per frame: all vectors are closure-scope scratch.
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var util = SG.util;
  var DEG = Math.PI / 180;

  /* ------------------------------------------------------------------ */
  /* Tunables — all of them, here, at the top.                           */
  /* ------------------------------------------------------------------ */

  var RADIUS = 0.30;          /* capsule radius, m                       */
  var STAND_H = 1.80;         /* capsule height standing, m              */
  var CROUCH_H = 1.15;
  var EYE_STAND = 1.62;       /* eye above the feet, m                   */
  var EYE_CROUCH = 1.00;
  var HEIGHT_LAMBDA = 12;     /* crouch/stand blend                      */

  var SPEED_WALK = 1.55;      /* m/s                                     */
  var SPEED_SPRINT = 3.40;
  var SPEED_CROUCH = 0.85;
  var ACC_GROUND = 28;        /* m/s^2                                   */
  var FRICTION = 8;           /* 1/s                                     */
  var ACC_AIR = 6;            /* m/s^2                                   */
  var AIR_CONTROL = 0.25;     /* fraction of wish speed steerable midair */
  var JUMP_APEX = 0.55;       /* m                                       */
  var MAX_FALL = 28;          /* m/s terminal                            */
  var SPRINT_MIN_FWD = 0.35;  /* must be pushing forward-ish to sprint   */

  var PITCH_MIN = -78 * DEG;
  var PITCH_MAX = 78 * DEG;

  var FIXED = 1 / 60;
  var MAX_SUB = 3;

  /* Camera */
  var CAM_BACK = 2.60;        /* m behind the head                       */
  var CAM_RIGHT = 0.35;       /* m to the shoulder                       */
  var CAM_LIFT = 0.06;        /* m above the head pivot                  */
  var CAM_POS_LAMBDA = 12;
  var CAM_LOOK_LAMBDA = 16;
  var CAM_PROBE_R = 0.20;     /* sphere-cast radius                      */
  var CAM_MIN_LEN = 0.32;     /* never closer than this to the head      */
  var CAM_OUT_LAMBDA = 3.2;   /* push back out slowly                    */
  var CAM_SKIN = 0.04;
  var LOOK_AHEAD = 2.4;       /* look-at target distance                 */
  var FOV_SPRINT = 6;         /* degrees                                 */
  var FOV_LAMBDA = 12;        /* ~0.25 s to settle                       */
  var ROLL_MAX = 1.5 * DEG;
  var ROLL_LAMBDA = 7;

  /* Stride / bob */
  var STRIDE_LEN = 0.78;      /* metres per step                         */
  var BOB_UP = 0.032;         /* m at walk speed                         */
  var BOB_SIDE = 0.026;
  var BOB_FP = 1.0;           /* bob scale, first person                 */
  var BOB_TP = 0.35;          /* bob scale, third person                 */
  var DIP_LAMBDA = 9;
  var DIP_MAX = 0.14;

  /* Footsteps */
  var STEP_SFX = {
    carpet: 'footstepCarpet', rug: 'footstepCarpet', mat: 'footstepCarpet',
    tile: 'footstepTile', floor: 'footstepTile', concrete: 'footstepTile',
    wood: 'footstepTile', lino: 'footstepTile', marble: 'footstepTile',
    metal: 'footstepMetal', grate: 'footstepMetal', steel: 'footstepMetal',
    gravel: 'footstepGravel', dirt: 'footstepGravel', grass: 'footstepGravel'
  };
  var STEP_DEFAULT = 'footstepTile';

  /* ------------------------------------------------------------------ */
  /* Scratch — hoisted. One player exists at a time; update is not        */
  /* reentrant, so sharing these across instances is safe.                */
  /* ------------------------------------------------------------------ */

  var _fwd = new THREE.Vector3();
  var _right = new THREE.Vector3();
  var _wish = new THREE.Vector3();
  var _pivot = new THREE.Vector3();
  var _off = new THREE.Vector3();
  var _dir = new THREE.Vector3();
  var _want = new THREE.Vector3();
  var _tgt = new THREE.Vector3();
  var _tmp = new THREE.Vector3();
  var _down = new THREE.Vector3(0, -1, 0);
  var _rayO = new THREE.Vector3();
  var _impulse = new THREE.Vector3();

  var warnedRig = false;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function sfx(name, vol, rate) {
    if (!SG.audio || typeof SG.audio.sfx !== 'function') return;
    try { SG.audio.sfx(name, { vol: vol, rate: rate }); } catch (e) { /* audio optional */ }
  }

  function reduceMotion() {
    return !!(SG.state && SG.state.settings && SG.state.settings.reduceMotion);
  }

  function makeFallbackRig() {
    var g = new THREE.Group();
    g.name = 'steve_fallback';
    var mat = new THREE.MeshStandardMaterial({
      color: 0x51705f, roughness: 0.85, metalness: 0
    });
    var body;
    if (THREE.CapsuleGeometry) {
      body = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, STAND_H - RADIUS * 2, 4, 12), mat);
    } else {
      body = new THREE.Mesh(
        new THREE.CylinderGeometry(RADIUS, RADIUS, STAND_H - RADIUS * 2, 12), mat);
    }
    body.position.y = STAND_H * 0.5;
    body.castShadow = true;
    g.add(body);

    /* A nose, so "which way am I facing" is answerable. */
    var nose = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.12), mat);
    nose.position.set(0, STAND_H - 0.28, RADIUS + 0.04);
    nose.castShadow = true;
    g.add(nose);

    return {
      root: g, bones: {}, height: STAND_H, fallback: true,
      play: function () { }, update: function () { },
      lookAt: function () { }, setSpeed: function () { }
    };
  }

  function makeRig() {
    if (SG.chars && typeof SG.chars.steve === 'function') {
      var r = SG.safe('player.rig', function () { return SG.chars.steve({ player: true }); }, null);
      if (r && r.root) return r;
    }
    if (!warnedRig) {
      warnedRig = true;
      if (window.console) {
        console.warn('[player] SG.chars.steve() unavailable — using a placeholder capsule.');
      }
    }
    return makeFallbackRig();
  }

  /* ------------------------------------------------------------------ */
  /* Factory                                                             */
  /* ------------------------------------------------------------------ */

  SG.player.create = function (opts) {
    opts = opts || {};
    var scene = opts.scene;
    var camera = opts.camera;

    var world = SG.phys && SG.phys.world;
    var GRAV = (SG.phys && SG.phys.GRAVITY) || -9.81;
    var JUMP_V = Math.sqrt(2 * Math.abs(GRAV) * JUMP_APEX);

    /* --- scene graph ------------------------------------------------- */
    var root = new THREE.Group();
    root.name = 'player';
    var rig = makeRig();
    var body = rig.root;
    root.add(body);
    if (scene) scene.add(root);

    /* --- state ------------------------------------------------------- */
    var position = new THREE.Vector3(0, 0, 0);   /* feet, world space     */
    var vel = new THREE.Vector3(0, 0, 0);
    var yaw = 0, pitch = 0, bodyYaw = 0;
    var mode = 'play';
    var camMode = 'third';
    var wantVisible = true;

    var curH = STAND_H, curEye = EYE_STAND;
    var crouching = false, sprinting = false;
    var grounded = false, wasGrounded = false;
    var speedScale = 1;
    var jumpBuf = 0;
    var accum = 0;
    var hSpeed = 0;

    /* stride + cosmetics */
    var stride = 0;            /* 0..1 gait cycle                        */
    var strideAmp = 0;
    var bobY = 0, bobX = 0;
    var dip = 0;
    var roll = 0;
    var fovBase = camera ? camera.fov : 55;
    var fovCur = fovBase;
    var surfaceTag = 'floor';
    var surfaceTimer = 0;
    var lastClip = '';

    /* camera */
    var camPivot = new THREE.Vector3();
    var camLook = new THREE.Vector3();
    var armLen = CAM_BACK;
    var camSnap = true;

    /* physics scratch owned by this player (moveCapsule reuses it) */
    var mv = null;

    /* ------------------------------------------------------------- */
    function forwardOf(y, out) { return out.set(Math.sin(y), 0, Math.cos(y)); }
    function rightOf(y, out) { return out.set(-Math.cos(y), 0, Math.sin(y)); }

    function targetSpeed() {
      var s;
      if (crouching) s = SPEED_CROUCH;
      else if (sprinting) s = SPEED_SPRINT;
      else s = SPEED_WALK;
      return s * speedScale;
    }

    function accelerate(dt, wx, wz, wishSpeed, accel) {
      var cur = vel.x * wx + vel.z * wz;
      var add = wishSpeed - cur;
      if (add <= 0) return;
      var a = accel * dt * wishSpeed;
      if (a > add) a = add;
      vel.x += wx * a;
      vel.z += wz * a;
    }

    function applyFriction(dt) {
      var sp = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (sp < 1e-4) { vel.x = 0; vel.z = 0; return; }
      var drop = sp * FRICTION * dt;
      var ns = sp - drop;
      if (ns < 0) ns = 0;
      var k = ns / sp;
      vel.x *= k; vel.z *= k;
    }

    /* One fixed 60 Hz character step. */
    function substep(dt, wx, wz, wishMag) {
      var wishSpeed = targetSpeed() * wishMag;

      if (grounded) {
        applyFriction(dt);
        if (wishMag > 1e-4) accelerate(dt, wx, wz, wishSpeed, ACC_GROUND);
      } else if (wishMag > 1e-4) {
        var cap = wishSpeed * AIR_CONTROL + SPEED_WALK * AIR_CONTROL;
        accelerate(dt, wx, wz, Math.min(wishSpeed, cap), ACC_AIR);
      }

      vel.y += GRAV * dt;
      if (vel.y < -MAX_FALL) vel.y = -MAX_FALL;

      jumpBuf -= dt;
      if (jumpBuf > 0 && grounded && !crouching) {
        vel.y = JUMP_V;
        jumpBuf = 0;
        grounded = false;
        if (mv) { mv.groundedRaw = false; mv._coyote = 0; }
        SG.bus.emit('player:jump', 1);
      }

      if (world && world.moveCapsule) {
        mv = world.moveCapsule(position, vel, RADIUS, curH, dt, mv);
        position.copy(mv.pos);
        vel.copy(mv.vel);
        grounded = !!mv.grounded;
      } else {
        position.x += vel.x * dt;
        position.y += vel.y * dt;
        position.z += vel.z * dt;
        if (position.y <= 0) { position.y = 0; vel.y = 0; grounded = true; }
        else grounded = false;
      }
    }

    /* Pick the footstep sound from a short downward probe. */
    function probeSurface() {
      if (!world || !world.raycast) return;
      _rayO.set(position.x, position.y + 0.45, position.z);
      var hit = world.raycast(_rayO, _down, 0.95);
      surfaceTag = (hit && hit.tag) ? hit.tag : 'floor';
    }

    function footstep() {
      var name = STEP_SFX[surfaceTag] || STEP_DEFAULT;
      var v = crouching ? 0.28 : (sprinting ? 0.75 : 0.5);
      sfx(name, v, 0.94 + Math.random() * 0.12);
      SG.bus.emit('player:step', surfaceTag);
    }

    /* --- cosmetics + camera, once per frame ------------------------- */
    function cosmetics(dt) {
      var rm = reduceMotion() ? 0 : 1;

      /* stride phase — advanced by distance travelled, not by time. */
      var moving = grounded && hSpeed > 0.12;
      if (moving) {
        var prev = stride;
        stride += (hSpeed * dt) / (STRIDE_LEN * 2);
        strideAmp = util.damp(strideAmp, util.clamp(hSpeed / SPEED_WALK, 0, 1.6), 8, dt);
        /* two contacts per cycle: at 0.0 and 0.5 */
        if (Math.floor(prev * 2) !== Math.floor(stride * 2)) footstep();
        if (stride >= 1) stride -= Math.floor(stride);
      } else {
        strideAmp = util.damp(strideAmp, 0, 6, dt);
        if (!moving && stride !== 0 && strideAmp < 0.02) stride = 0;
      }

      surfaceTimer -= dt;
      if (surfaceTimer <= 0) { surfaceTimer = 0.25; probeSurface(); }

      var amp = strideAmp * rm;
      bobY = Math.cos(stride * 4 * Math.PI) * BOB_UP * amp;
      bobX = Math.sin(stride * 2 * Math.PI) * BOB_SIDE * amp;

      dip = util.damp(dip, 0, DIP_LAMBDA, dt);

      /* strafe roll */
      var strafe = 0;
      if (hSpeed > 0.05) {
        rightOf(yaw, _right);
        strafe = util.clamp((vel.x * _right.x + vel.z * _right.z) / SPEED_WALK, -1, 1);
      }
      roll = util.damp(roll, -strafe * ROLL_MAX * rm, ROLL_LAMBDA, dt);

      if (!camera) return;

      /* FOV kick */
      var fovWant = fovBase + (sprinting && hSpeed > SPEED_WALK * 1.1 ? FOV_SPRINT * rm : 0);
      fovCur = util.damp(fovCur, fovWant, FOV_LAMBDA, dt);
      if (Math.abs(camera.fov - fovCur) > 0.01) {
        camera.fov = fovCur;
        camera.updateProjectionMatrix();
      }

      forwardOf(yaw, _fwd);
      rightOf(yaw, _right);

      /* head pivot */
      _pivot.set(position.x, position.y + curEye, position.z);

      if (camMode === 'first') {
        _pivot.x += _right.x * bobX;
        _pivot.z += _right.z * bobX;
        _pivot.y += bobY * BOB_FP - dip;
        if (camSnap) camPivot.copy(_pivot);
        else {
          camPivot.x = util.damp(camPivot.x, _pivot.x, 26, dt);
          camPivot.y = util.damp(camPivot.y, _pivot.y, 26, dt);
          camPivot.z = util.damp(camPivot.z, _pivot.z, 26, dt);
        }
        camera.position.copy(camPivot);

        var cp = Math.cos(pitch);
        _tgt.set(
          camPivot.x + _fwd.x * cp * LOOK_AHEAD,
          camPivot.y + Math.sin(pitch) * LOOK_AHEAD,
          camPivot.z + _fwd.z * cp * LOOK_AHEAD);
        if (camSnap) camLook.copy(_tgt);
        else {
          camLook.x = util.damp(camLook.x, _tgt.x, 40, dt);
          camLook.y = util.damp(camLook.y, _tgt.y, 40, dt);
          camLook.z = util.damp(camLook.z, _tgt.z, 40, dt);
        }
        camera.up.set(0, 1, 0);
        camera.lookAt(camLook);
        if (roll) camera.rotateZ(roll);
        camSnap = false;
        return;
      }

      /* ---- third person ------------------------------------------- */
      _pivot.y += bobY * BOB_TP - dip * 0.6;
      if (camSnap) camPivot.copy(_pivot);
      else {
        camPivot.x = util.damp(camPivot.x, _pivot.x, CAM_POS_LAMBDA, dt);
        camPivot.y = util.damp(camPivot.y, _pivot.y, CAM_POS_LAMBDA * 1.15, dt);
        camPivot.z = util.damp(camPivot.z, _pivot.z, CAM_POS_LAMBDA, dt);
      }

      /* desired arm, in world space */
      var cpz = Math.cos(pitch), spz = Math.sin(pitch);
      /* A phone held upright has a tall, narrow frame: the vertical FOV is
       * unchanged but the horizontal view collapses, so the same spring arm
       * that frames Steve nicely on a desktop puts the back of his head in
       * your face. Pull the camera back as the frame gets taller. */
      var _aspect = (opts.camera && opts.camera.aspect) || 1.6;
      var _portrait = _aspect < 1 ? util.clamp(1.5 / (_aspect + 0.35), 1, 1.85) : 1;
      var _back = CAM_BACK * _portrait;

      _off.set(
        _right.x * CAM_RIGHT - _fwd.x * cpz * _back,
        CAM_LIFT - spz * _back,
        _right.z * CAM_RIGHT - _fwd.z * cpz * _back);
      var want = _off.length();
      if (want < 1e-4) want = 1e-4;
      _dir.copy(_off).divideScalar(want);

      /* camera collision: sphere-cast from the head outward */
      var allowed = want;
      if (world && world.sphereCast) {
        var hit = world.sphereCast(camPivot, _dir, CAM_PROBE_R, want + CAM_SKIN);
        if (hit && hit.hit) allowed = Math.max(CAM_MIN_LEN, hit.dist - CAM_SKIN);
      }
      if (camSnap) armLen = allowed;
      else if (allowed < armLen) armLen = allowed;                  /* snap in  */
      else armLen = util.damp(armLen, allowed, CAM_OUT_LAMBDA, dt); /* ease out */
      if (armLen > want) armLen = want;

      camera.position.set(
        camPivot.x + _dir.x * armLen,
        camPivot.y + _dir.y * armLen,
        camPivot.z + _dir.z * armLen);

      _tgt.set(
        camPivot.x + _fwd.x * cpz * LOOK_AHEAD,
        camPivot.y + spz * LOOK_AHEAD,
        camPivot.z + _fwd.z * cpz * LOOK_AHEAD);
      if (camSnap) camLook.copy(_tgt);
      else {
        camLook.x = util.damp(camLook.x, _tgt.x, CAM_LOOK_LAMBDA, dt);
        camLook.y = util.damp(camLook.y, _tgt.y, CAM_LOOK_LAMBDA, dt);
        camLook.z = util.damp(camLook.z, _tgt.z, CAM_LOOK_LAMBDA, dt);
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(camLook);
      if (roll) camera.rotateZ(roll);
      camSnap = false;
    }

    function driveRig(dt) {
      if (!rig) return;
      var clip;
      if (!grounded) clip = 'jump';
      else if (crouching) clip = hSpeed > 0.15 ? 'crouchWalk' : 'crouch';
      else if (hSpeed > SPEED_WALK * 1.25) clip = 'run';
      else if (hSpeed > 0.15) clip = 'walk';
      else clip = 'idle';

      if (clip !== lastClip) {
        lastClip = clip;
        if (typeof rig.play === 'function') {
          SG.safe('rig.play', function () { rig.play(clip); });
        }
      }
      if (typeof rig.setSpeed === 'function') {
        SG.safe('rig.setSpeed', function () { rig.setSpeed(hSpeed); });
      }
      if (typeof rig.update === 'function') {
        SG.safe('rig.update', function () { rig.update(dt); });
      }
    }

    /* ------------------------------------------------------------- */
    /* Public object                                                  */
    /* ------------------------------------------------------------- */

    var P = {
      root: root,
      rig: rig,
      position: position,
      velocity: vel,
      yaw: 0,
      pitch: 0,
      mode: 'play',
      cameraMode: 'third',
      radius: RADIUS
    };

    P.update = function (dt, ctx) {
      /* Cosmetic props settle even while gameplay dt is held at zero. */
      if (SG.phys && SG.phys.step) SG.phys.step(dt);

      if (!(dt > 0)) return;
      if (dt > 0.1) dt = 0.1;

      var IN = SG.input;
      var playable = (mode === 'play');

      /* ---- look ---------------------------------------------------- */
      if (playable && IN && IN.axes) {
        yaw -= IN.axes.look.x;
        pitch = util.clamp(pitch + IN.axes.look.y, PITCH_MIN, PITCH_MAX);
        if (yaw > Math.PI) yaw -= util.TAU;
        else if (yaw < -Math.PI) yaw += util.TAU;
      }

      /* ---- intent -------------------------------------------------- */
      var mx = 0, my = 0;
      if (playable && IN && IN.axes) { mx = IN.axes.move.x; my = IN.axes.move.y; }
      var wishMag = Math.sqrt(mx * mx + my * my);
      if (wishMag > 1) { mx /= wishMag; my /= wishMag; wishMag = 1; }

      forwardOf(yaw, _fwd);
      rightOf(yaw, _right);
      var wx = 0, wz = 0;
      if (wishMag > 1e-4) {
        wx = (_fwd.x * my + _right.x * mx) / wishMag;
        wz = (_fwd.z * my + _right.z * mx) / wishMag;
        var wl = Math.sqrt(wx * wx + wz * wz) || 1;
        wx /= wl; wz /= wl;
      }

      if (playable && IN && IN.down) {
        sprinting = !!IN.down('sprint') && my > SPRINT_MIN_FWD && !crouching;
        var wantCrouch = !!IN.down('crouch');
        if (wantCrouch !== crouching) {
          if (!wantCrouch) {
            /* Only stand up if there is room. */
            var free = true;
            if (world && world.capsuleFree) {
              free = world.capsuleFree(position.x, position.y + 0.02, position.z,
                RADIUS, STAND_H);
            }
            if (free) crouching = false;
          } else {
            crouching = true;
          }
        }
        if (IN.pressed && IN.pressed('jump')) jumpBuf = 0.12;
      } else {
        sprinting = false;
        wishMag = 0; wx = 0; wz = 0;
      }

      /* ---- capsule height ------------------------------------------ */
      var hWant = crouching ? CROUCH_H : STAND_H;
      curH = util.damp(curH, hWant, HEIGHT_LAMBDA, dt);
      if (Math.abs(curH - hWant) < 0.005) curH = hWant;
      curEye = EYE_CROUCH + (curH - CROUCH_H) / (STAND_H - CROUCH_H) *
        (EYE_STAND - EYE_CROUCH);

      /* ---- fixed-step integration ---------------------------------- */
      if (playable) {
        var landImpact = 0;
        accum += dt;
        if (accum > 0.25) accum = 0.25;
        var n = 0;
        while (accum >= FIXED && n < MAX_SUB) {
          wasGrounded = grounded;
          var vyBefore = vel.y;
          substep(FIXED, wx, wz, wishMag);
          accum -= FIXED;
          n++;
          if (!wasGrounded && grounded && vyBefore < -1.4 && -vyBefore > landImpact) {
            landImpact = -vyBefore;
          }
        }
        if (n >= MAX_SUB) accum = 0;     /* never spiral                 */
        if (landImpact > 0) {
          dip = Math.min(DIP_MAX, (landImpact - 1.4) * 0.035 + 0.02);
          sfx(STEP_SFX[surfaceTag] || STEP_DEFAULT,
            Math.min(0.9, 0.35 + landImpact * 0.08), 0.8);
          SG.bus.emit('player:land', landImpact);
        }
      } else {
        vel.set(0, 0, 0);
        jumpBuf = 0;
        accum = 0;
      }

      hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

      /* ---- transforms ---------------------------------------------- */
      root.position.copy(position);
      bodyYaw = camMode === 'first' ? yaw : util.angleDamp(bodyYaw, yaw, 14, dt);
      root.rotation.y = bodyYaw;
      /* The placeholder capsule has no crouch pose, so squash it instead.
       * A real rig gets told to play 'crouch' and handles its own height. */
      if (rig.fallback) body.scale.y = curH / STAND_H;

      driveRig(dt);
      if (playable) cosmetics(dt);

      P.yaw = yaw;
      P.pitch = pitch;
      P.grounded = grounded;
    };

    P.teleport = function (v, y) {
      if (v) position.set(v.x, v.y, v.z);
      if (typeof y === 'number') { yaw = y; bodyYaw = y; }
      pitch = 0;
      vel.set(0, 0, 0);
      grounded = false; wasGrounded = false;
      accum = 0; jumpBuf = 0; hSpeed = 0;
      stride = 0; strideAmp = 0; bobX = 0; bobY = 0; dip = 0; roll = 0;
      crouching = false; sprinting = false;
      curH = STAND_H; curEye = EYE_STAND;
      if (mv) { mv.groundedRaw = false; mv._coyote = 0; }
      root.position.copy(position);
      root.rotation.y = bodyYaw;
      if (rig.fallback) body.scale.y = 1;
      armLen = CAM_BACK;
      camSnap = true;
      surfaceTimer = 0;
      probeSurface();
      P.yaw = yaw; P.pitch = pitch;
      return P;
    };

    P.setMode = function (m) {
      if (m !== 'play' && m !== 'frozen' && m !== 'hidden') m = 'play';
      mode = m;
      P.mode = m;
      if (m !== 'play') { vel.set(0, 0, 0); accum = 0; jumpBuf = 0; hSpeed = 0; }
      root.visible = wantVisible && m !== 'hidden';
      return P;
    };

    P.visible = function (b) {
      wantVisible = !!b;
      root.visible = wantVisible && mode !== 'hidden';
      return P;
    };

    P.setCameraMode = function (m) {
      m = (m === 'first') ? 'first' : 'third';
      if (m === camMode) return P;
      camMode = m;
      P.cameraMode = m;
      body.visible = (m !== 'first');
      camSnap = true;
      armLen = m === 'first' ? 0 : CAM_BACK;
      return P;
    };

    P.setSpeedScale = function (n) {
      n = +n;
      speedScale = (n > 0) ? util.clamp(n, 0.1, 4) : 1;
      return P;
    };

    P.addImpulse = function (v) {
      if (!v) return P;
      _impulse.set(v.x || 0, v.y || 0, v.z || 0);
      vel.add(_impulse);
      if (_impulse.y > 0.05) {
        grounded = false;
        if (mv) { mv.groundedRaw = false; mv._coyote = 0; }
      }
      return P;
    };

    P.getPosition = function (out) {
      /* Chest height: what NPC sight lines, interaction probes and
       * proximity checks actually want. Feet are P.position / getFeet(). */
      if (!out) return position;
      return out.set(position.x, position.y + Math.max(0.35, curEye - 0.45),
        position.z);
    };

    P.getFeet = function (out) {
      if (!out) return position;
      return out.copy(position);
    };

    P.getEye = function (out) {
      if (!out) return position;
      return out.set(position.x, position.y + curEye, position.z);
    };

    P.getForward = function (out) {
      if (!out) return _fwd;
      var cp = Math.cos(pitch);
      return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    };

    P.getFlatForward = function (out) {
      if (!out) return _fwd;
      return out.set(Math.sin(yaw), 0, Math.cos(yaw));
    };

    P.getVelocity = function (out) {
      if (!out) return vel;
      return out.copy(vel);
    };

    P.isMoving = function () { return hSpeed > 0.18; };
    P.isCrouching = function () { return crouching; };
    P.isSprinting = function () { return sprinting && hSpeed > SPEED_WALK * 1.1; };
    P.isGrounded = function () { return grounded; };
    P.getSpeed = function () { return hSpeed; };
    P.getHeight = function () { return curH; };
    P.getSurface = function () { return surfaceTag; };

    P.setYaw = function (y) { yaw = y; bodyYaw = y; camSnap = true; P.yaw = y; return P; };
    P.setPitch = function (p) {
      pitch = util.clamp(p, PITCH_MIN, PITCH_MAX); P.pitch = pitch; return P;
    };

    P.dispose = function () {
      if (root.parent) root.parent.remove(root);
      util.disposeTree(root);
    };

    /* Constants, so levels and cutscenes can agree with us. */
    P.EYE_HEIGHT = EYE_STAND;
    P.RADIUS = RADIUS;
    P.HEIGHT = STAND_H;

    P.teleport(position, 0);
    return P;
  };

})(window.SG, window.THREE);
