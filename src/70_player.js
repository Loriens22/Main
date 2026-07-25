/* ============================================================================
 * STEVE THE PC REPAIR MAN — 70_player.js
 * Third-person character controller + spring-arm camera + interaction probe.
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  var STAND_H = 1.78, CROUCH_H = 1.16, RADIUS = 0.30;
  var SPEED_WALK = 2.15, SPEED_RUN = 4.55, SPEED_CROUCH = 1.05;
  var ACCEL_GROUND = 26, ACCEL_AIR = 5, FRICTION = 12;
  var JUMP_V = 5.4;

  function Player(ctx) {
    this.world = ctx.physics;
    this.scene = ctx.scene;
    this.camera = ctx.camera;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.body = {
      pos: this.pos, vel: this.vel,
      radius: RADIUS, height: STAND_H,
      grounded: false, groundY: 0, headHit: false,
      lastNormal: new THREE.Vector3()
    };

    this.yaw = 0;              // facing (model)
    this.camYaw = 0;           // camera orbit
    this.camPitch = -0.12;
    this.height = STAND_H;
    this.crouching = false;
    this.running = false;
    this.moving = false;
    this.speed = 0;
    this.noise = 0;            // 0..1, how loud we are right now (AI reads this)
    this.lightLevel = 0.5;     // 0..1, set by level (AI reads this)
    this.enabled = true;
    this.frozen = false;       // cutscenes
    this.locked = false;       // minigames

    this.coyote = 0;
    this.jumpBuffer = 0;
    this.stepAccum = 0;
    this.bobPhase = 0;
    this.footSurface = 'carpet';

    /* camera boom */
    this.boomDist = STV.isMobile ? 3.4 : 3.15;
    this.boomTarget = 3.15;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camShake = 0;
    this.fov = 62;
    this.fovTarget = 62;

    /* model */
    this.model = null;
    this.buildModel();

    /* interaction */
    this.focus = null;
    this._focusLabel = null;
    this._interactables = [];
    this._probeT = 0;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  Player.prototype.buildModel = function () {
    var g = null;
    try {
      if (STV.Geo && STV.Geo.human) {
        g = STV.Geo.human({
          height: STAND_H, build: 'avg', skin: 'mid',
          hair: { style: 'short', color: 0x3a2e26 },
          outfit: 'steve', seed: 1001
        });
      }
    } catch (e) { STV.warn('[player] human() failed', e); }
    if (!g) {
      g = new THREE.Group();
      var m = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.28, 1.1, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x33506b, roughness: 0.8 })
      );
      m.position.y = 0.89;
      g.add(m);
    }
    g.name = 'steve';
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.model = g;
    if (this.scene) this.scene.add(g);
  };

  Player.prototype.setLevel = function (level) {
    this.level = level;
    this._interactables = (level && level.interactables) || [];
    if (level && level.env && level.env.footstep) this.footSurface = level.env.footstep;
    if (level && level.spawn) this.teleport(level.spawn.pos, level.spawn.yaw);
  };

  Player.prototype.teleport = function (pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    if (typeof yaw === 'number') { this.yaw = yaw; this.camYaw = yaw; }
    this.camPitch = -0.10;
    this.body.grounded = false;
    // settle onto the floor if we spawned slightly off
    if (this.world) {
      var f = this.world.floorAt(this.pos.x, this.pos.z, this.pos.y + 1.2, RADIUS);
      if (f !== null && Math.abs(f - this.pos.y) < 1.5) this.pos.y = f;
    }
    this.updateCameraImmediate();
  };

  /* ---------------------------------------------------------------------- */
  Player.prototype.update = function (dt, input) {
    if (!this.enabled) return;
    if (!input) input = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };

    if (this.frozen || this.locked) {
      // still run physics so we settle, but no input
      this.vel.x = STV.damp(this.vel.x, 0, 14, dt);
      this.vel.z = STV.damp(this.vel.z, 0, 14, dt);
      if (this.world) this.world.moveCharacter(this.body, dt);
      this.moving = false;
      this.speed = 0;
      this.noise = 0;
      this.animate(dt);
      if (!this.frozen) this.updateCamera(dt);
      return;
    }

    /* ---- look ---- */
    var sens = (STV.settings.sens || 1) * (STV.isMobile ? 1.0 : 1.0);
    var lx = (input.look.x || 0) * sens;
    var ly = (input.look.y || 0) * sens * (STV.settings.invertY ? -1 : 1);
    input.look.x = 0; input.look.y = 0;
    this.camYaw -= lx;
    this.camPitch = STV.clamp(this.camPitch - ly, -1.15, 0.72);

    /* ---- crouch / run ---- */
    var wantCrouch = !!input.crouch;
    if (!wantCrouch && this.crouching && this.world) {
      // only stand if there is room
      if (!this.world.hasHeadroom(this.pos.x, this.pos.y, this.pos.z, RADIUS, STAND_H)) wantCrouch = true;
    }
    this.crouching = wantCrouch;
    this.height = STV.damp(this.height, this.crouching ? CROUCH_H : STAND_H, 14, dt);
    this.body.height = this.height;

    /* ---- move ---- */
    var mx = input.move.x || 0, my = input.move.y || 0;
    var mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }

    this.running = !!input.run && !this.crouching && mag > 0.65;
    var maxSpeed = this.crouching ? SPEED_CROUCH : (this.running ? SPEED_RUN : SPEED_WALK);
    if (mag < 0.98) maxSpeed *= Math.max(0.25, mag);   // analogue stick

    this._fwd.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    this._right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    this._desired.set(0, 0, 0)
      .addScaledVector(this._fwd, my)
      .addScaledVector(this._right, mx);
    if (this._desired.lengthSq() > 1) this._desired.normalize();

    var grounded = this.body.grounded;
    var accel = grounded ? ACCEL_GROUND : ACCEL_AIR;
    var tvx = this._desired.x * maxSpeed, tvz = this._desired.z * maxSpeed;

    if (mag > 0.02) {
      this.vel.x += (tvx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (tvz - this.vel.z) * Math.min(1, accel * dt);
      // face movement direction
      var targetYaw = Math.atan2(-this._desired.x, -this._desired.z);
      this.yaw = STV.dampAngle(this.yaw, targetYaw, this.running ? 13 : 10, dt);
    } else if (grounded) {
      var f = Math.max(0, 1 - FRICTION * dt);
      this.vel.x *= f; this.vel.z *= f;
      if (Math.abs(this.vel.x) < 0.01) this.vel.x = 0;
      if (Math.abs(this.vel.z) < 0.01) this.vel.z = 0;
    }

    /* ---- jump (with coyote time + input buffer) ---- */
    this.coyote = grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (input.jump) { this.jumpBuffer = 0.14; input.jump = false; }
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.crouching) {
      this.vel.y = JUMP_V;
      this.coyote = 0; this.jumpBuffer = 0;
      this.body.grounded = false;
      emitSfx('footstep' + cap(this.footSurface), null, 0.4);
    }

    /* ---- integrate ---- */
    var wasGrounded = this.body.grounded;
    if (this.world) this.world.moveCharacter(this.body, dt);
    else { this.pos.addScaledVector(this.vel, dt); this.pos.y = Math.max(0, this.pos.y); }

    if (!wasGrounded && this.body.grounded && this.vel.y > -0.1) {
      emitSfx('footstep' + cap(this.footSurface), this.pos, 0.6);
    }

    this.speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    this.moving = this.speed > 0.15;

    /* ---- footsteps ---- */
    if (this.body.grounded && this.moving) {
      var stride = this.running ? 1.55 : (this.crouching ? 1.05 : 1.25);
      this.stepAccum += this.speed * dt;
      if (this.stepAccum >= stride) {
        this.stepAccum -= stride;
        var v = this.crouching ? 0.22 : (this.running ? 0.72 : 0.46);
        emitSfx('footstep' + cap(this.footSurface), this.pos, v);
      }
    } else {
      this.stepAccum = Math.min(this.stepAccum, 0.9);
    }

    /* ---- noise for AI ---- */
    var n = 0;
    if (this.moving) n = this.crouching ? 0.12 : (this.running ? 1.0 : 0.42);
    this.noise = STV.damp(this.noise, n, 8, dt);

    /* ---- fov kick when sprinting ---- */
    this.fovTarget = this.running ? 68 : 62;

    this.animate(dt);
    this.updateCamera(dt);
    this.probeInteract(dt, input);
  };

  /* ---------------------------------------------------------------------- */
  Player.prototype.animate = function (dt) {
    if (!this.model) return;
    this.model.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.model.rotation.y = this.yaw;
    if (this.model.update) {
      try {
        this.model.update(dt, {
          speed: this.speed,
          crouch: this.crouching,
          run: this.running,
          grounded: this.body.grounded,
          talking: false
        });
      } catch (e) { /* model animation is non-critical */ }
    }
    // crouch squash for the fallback capsule
    var s = this.height / STAND_H;
    if (!this.model.rig) this.model.scale.set(1, s, 1);
  };

  /* ---------------------------------------------------------------------- */
  var _camDir = new THREE.Vector3();
  var _pivot = new THREE.Vector3();

  Player.prototype.computeBoom = function () {
    var headY = this.pos.y + this.height * 0.86;
    _pivot.set(this.pos.x, headY, this.pos.z);
    // shoulder offset so Steve isn't dead-centre
    var rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    _pivot.x += rx * 0.36;
    _pivot.z += rz * 0.36;

    var cp = Math.cos(this.camPitch);
    _camDir.set(Math.sin(this.camYaw) * cp, -Math.sin(this.camPitch), Math.cos(this.camYaw) * cp).normalize();

    var want = this.boomTarget;
    // collide the boom with the world so the camera never clips through walls
    if (this.world) {
      var hit = this.world.raycast(_pivot.x, _pivot.y, _pivot.z, _camDir.x, _camDir.y, _camDir.z, want + 0.35);
      if (hit) want = Math.max(0.55, hit.dist - 0.35);
    }
    return { pivot: _pivot, dir: _camDir, dist: want };
  };

  Player.prototype.updateCamera = function (dt) {
    if (!this.camera) return;
    var b = this.computeBoom();
    // pull in fast, push out slow — classic spring arm feel
    var lambda = b.dist < this.boomDist ? 30 : 6;
    this.boomDist = STV.damp(this.boomDist, b.dist, lambda, dt);

    this.camPos.set(
      b.pivot.x + b.dir.x * this.boomDist,
      b.pivot.y + b.dir.y * this.boomDist,
      b.pivot.z + b.dir.z * this.boomDist
    );
    this.camLook.copy(b.pivot).addScaledVector(b.dir, -0.6);
    this.camLook.y += 0.06;

    // subtle walk bob (disabled under reduce-motion)
    if (STV.settings.motion && this.moving && this.body.grounded) {
      this.bobPhase += dt * (this.running ? 11 : 7.5);
      var amp = this.running ? 0.035 : 0.018;
      this.camPos.y += Math.sin(this.bobPhase * 2) * amp;
      this.camPos.x += Math.cos(this.bobPhase) * amp * 0.5;
    }

    if (this.camShake > 0.001) {
      var t = STV.now() * 0.001;
      var s = this.camShake;
      this.camPos.x += STV.noise1(t * 37) * s * 0.14;
      this.camPos.y += STV.noise1(t * 31 + 100) * s * 0.14;
      this.camPos.z += STV.noise1(t * 41 + 200) * s * 0.14;
      this.camShake = STV.damp(this.camShake, 0, 3.2, dt);
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.fov = STV.damp(this.fov, this.fovTarget, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  };

  Player.prototype.updateCameraImmediate = function () {
    var b = this.computeBoom();
    this.boomDist = b.dist;
    this.camPos.set(b.pivot.x + b.dir.x * b.dist, b.pivot.y + b.dir.y * b.dist, b.pivot.z + b.dir.z * b.dist);
    this.camLook.copy(b.pivot);
    if (this.camera) { this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook); }
  };

  Player.prototype.shake = function (amount) {
    this.camShake = Math.min(1.6, this.camShake + amount);
  };

  /* ---------------------------------------------------------------------- */
  /* Interaction: nearest enabled interactable within radius, weighted by    */
  /* how directly the camera is looking at it.                               */
  /* ---------------------------------------------------------------------- */
  Player.prototype.probeInteract = function (dt, input) {
    this._probeT -= dt;
    if (this._probeT <= 0) {
      this._probeT = 0.08;
      var list = this._interactables;
      var best = null, bestScore = -Infinity;
      var head = this._tmp.set(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z);
      var viewDir = this._tmp2.copy(this.camLook).sub(this.camPos).normalize();

      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || it.enabled === false || !it.obj) continue;
        var wp = it._wp || (it._wp = new THREE.Vector3());
        it.obj.getWorldPosition(wp);
        if (it.offset) wp.add(it.offset);
        var d = head.distanceTo(wp);
        var rad = it.radius || 2.2;
        if (d > rad) continue;
        var dot = 0;
        if (d > 0.001) {
          dot = (wp.x - head.x) * viewDir.x + (wp.y - head.y) * viewDir.y + (wp.z - head.z) * viewDir.z;
          dot /= d;
        }
        if (dot < 0.1) continue;                     // roughly in front of us
        var score = dot * 2.2 - d / rad;
        if (score > bestScore) { bestScore = score; best = it; }
      }

      if (best !== this.focus) {
        if (this.focus && this.focus.onFocus) { try { this.focus.onFocus(false); } catch (e) {} }
        this.focus = best;
        if (best && best.onFocus) { try { best.onFocus(true); } catch (e) {} }
        var label = best ? (best.label || 'Use') : null;
        if (label !== this._focusLabel) {
          this._focusLabel = label;
          STV.bus.emit('interact:focus', best ? { label: label, key: best.key || 'e' } : null);
        }
      }
    }

    if (input.use) {
      input.use = false;
      if (this.focus && this.focus.enabled !== false && this.focus.onUse) {
        var f = this.focus;
        try { f.onUse(this, this.level); } catch (e) { STV.warn('[interact]', e); }
        if (f.once) {
          f.enabled = false;
          if (this.focus === f) {
            this.focus = null; this._focusLabel = null;
            STV.bus.emit('interact:focus', null);
          }
        }
        STV.bus.emit('interact:use', { target: f });
      } else {
        STV.bus.emit('sfx', { name: 'clickSoft', vol: 0.25 });
      }
    }
  };

  Player.prototype.clearFocus = function () {
    if (this.focus && this.focus.onFocus) { try { this.focus.onFocus(false); } catch (e) {} }
    this.focus = null;
    this._focusLabel = null;
    STV.bus.emit('interact:focus', null);
  };

  Player.prototype.setVisible = function (v) { if (this.model) this.model.visible = v; };

  Player.prototype.dispose = function () {
    if (this.model && this.model.parent) this.model.parent.remove(this.model);
    STV.disposeObject(this.model);
    this.model = null;
  };

  /* ---------------------------------------------------------------------- */
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Carpet'; }
  function emitSfx(name, pos, vol) {
    STV.bus.emit('sfx', { name: name, pos: pos ? pos.clone() : null, vol: vol });
  }

  STV.Player = Player;
  STV.log('player loaded');
})();
