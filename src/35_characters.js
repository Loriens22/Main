/* =====================================================================
 * 35_characters.js — SG.chars.*
 *
 * Segmented rigid-limb character rigs, procedurally animated. No skinning,
 * no keyframe data: nested Groups act as joints, meshes are children offset
 * so rotation happens AT the joint, and every pose is a function of time,
 * phase and speed.
 *
 * The legs are driven by a two-bone analytic IK against a foot path, which
 * is what makes the contact foot's world velocity ~0 (no sliding) and gives
 * the pelvis its weight-bearing dip for free — the low point of the bob
 * falls out of the geometry at foot-strike rather than being faked.
 *
 * Exports: steve, oleg, msEllis, guard, concierge, passenger, cat
 * ===================================================================== */
(function (SG, THREE) {
  'use strict';

  var CH = SG.chars;
  var U = SG.util;

  var PI = Math.PI;
  var TAU = PI * 2;
  var DEG = PI / 180;

  /* ------------------------------------------------------------------ */
  /* Lazy art resolvers — 11_materials.js may not exist yet.             */
  /* ------------------------------------------------------------------ */

  function M(name, fallback) {
    if (SG.mat && typeof SG.mat[name] === 'function') {
      try {
        var m = SG.mat[name]();
        if (m) return m;
      } catch (e) { /* fall through */ }
    }
    var f = new THREE.MeshStandardMaterial(fallback || { color: 0x9aa0a6, roughness: 0.8 });
    f.userData.shared = true;
    return f;
  }

  function T(name, opts) {
    if (SG.tex && typeof SG.tex[name] === 'function') {
      try { return SG.tex[name](opts || {}); } catch (e) { /* noop */ }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Shared geometry. Seven primitives dress the entire cast; every part  */
  /* is a scaled instance, so the GPU sees a handful of buffers total.    */
  /* A level teardown may dispose them (util.disposeTree walks the world) */
  /* so each cache entry evicts itself on 'dispose' and is rebuilt.       */
  /* ------------------------------------------------------------------ */

  var GEO = {};

  function G(key, make) {
    var g = GEO[key];
    if (g) return g;
    g = make();
    GEO[key] = g;
    g.addEventListener('dispose', function () {
      if (GEO[key] === g) delete GEO[key];
    });
    return g;
  }

  function gCyl() { return G('cyl8', function () { return new THREE.CylinderGeometry(1, 1, 1, 8, 1); }); }
  function gTap() { return G('tap8', function () { return new THREE.CylinderGeometry(1, 0.68, 1, 8, 1); }); }
  function gCyl6() { return G('cyl6', function () { return new THREE.CylinderGeometry(1, 1, 1, 6, 1); }); }
  function gCyl4() { return G('cyl4', function () { return new THREE.CylinderGeometry(1, 0.8, 1, 5, 1); }); }
  function gBox() { return G('box', function () { return new THREE.BoxGeometry(1, 1, 1); }); }
  function gSph() { return G('sph12', function () { return new THREE.SphereGeometry(1, 12, 8); }); }
  function gSphM() { return G('sph8', function () { return new THREE.SphereGeometry(1, 8, 6); }); }
  function gSphS() { return G('sph6', function () { return new THREE.SphereGeometry(1, 6, 4); }); }
  function gCone() { return G('cone6', function () { return new THREE.ConeGeometry(1, 1, 6); }); }
  function gDome() {
    return G('dome', function () {
      return new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, 0.80 * PI);
    });
  }
  function gRing() { return G('ring', function () { return new THREE.TorusGeometry(1, 0.16, 4, 10); }); }
  function gDisc() { return G('disc', function () { return new THREE.CircleGeometry(1, 10); }); }

  /* ------------------------------------------------------------------ */
  /* Shared materials                                                     */
  /* ------------------------------------------------------------------ */

  var MC = {};

  function cmat(key, o) {
    var got = MC[key];
    if (got) return got;
    var p = {
      color: o.color === undefined ? 0xffffff : o.color,
      roughness: o.rough === undefined ? 0.8 : o.rough,
      metalness: o.metal === undefined ? 0 : o.metal
    };
    var tx = null;
    if (o.tex) {
      tx = T(o.tex, o.texOpts);
      if (tx) p.map = tx;
    }
    var m = new THREE.MeshStandardMaterial(p);
    if (o.emissive !== undefined) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.emiI === undefined ? 1 : o.emiI;
    }
    m.userData.shared = true;
    if (!o.tex || tx) MC[key] = m;
    return m;
  }

  function skinMat(tone) {
    return cmat('skin_' + tone, {
      tex: 'skin', texOpts: { tone: tone, repeat: 1 },
      color: 0xffffff, rough: 0.68, metal: 0
    });
  }

  function clothMat(key, color, rough, texName, rep) {
    return cmat('cl_' + key, {
      tex: texName || 'cotton', texOpts: { repeat: rep || 2 },
      color: color, rough: rough === undefined ? 0.86 : rough, metal: 0
    });
  }

  function hairMat(key, color, which) {
    return cmat('hr_' + key, {
      tex: which || 'hairGrey', texOpts: { repeat: 2 },
      color: color, rough: 0.72, metal: 0
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mesh + joint helpers                                                 */
  /* ------------------------------------------------------------------ */

  function put(parent, geo, mat, px, py, pz, sx, sy, sz, rx, ry, rz) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* A limb segment: a tapered cylinder hanging from the joint at the top. */
  function limb(parent, mat, len, rTop, rBot, zsq) {
    var m = put(parent, gTap(), mat, 0, -len / 2, 0, rTop, len, rTop * (zsq || 1));
    m.userData.rBot = rBot;
    return m;
  }

  function jt(parent, x, y, z) {
    var g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    parent.add(g);
    return g;
  }

  function wrapPi(a) {
    return ((a + PI) % TAU + TAU) % TAU - PI;
  }

  /* ------------------------------------------------------------------ */
  /* Pose plumbing                                                        */
  /*                                                                      */
  /* A pose is a flat Float64Array of 3 rotation channels per bone plus    */
  /* one trailing pseudo-bone that carries the hips' translation offset.   */
  /* Clips write into it; blending, additive idle and look-at all operate  */
  /* on the same buffers, so nothing allocates per frame.                  */
  /* ------------------------------------------------------------------ */

  var _R = null, _O = null;      /* rig + out array currently being evaluated */

  function s3(n, x, y, z) {
    var i = _R.idx[n];
    if (i === undefined) return;
    i *= 3;
    _O[i] = x; _O[i + 1] = y; _O[i + 2] = z;
  }
  function a3(n, x, y, z) {
    var i = _R.idx[n];
    if (i === undefined) return;
    i *= 3;
    _O[i] += x; _O[i + 1] += y; _O[i + 2] += z;
  }
  function sx(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3] = v; }
  function sy(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3 + 1] = v; }
  function sz(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3 + 2] = v; }
  function ax(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3] += v; }
  function ay(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3 + 1] += v; }
  function az(n, v) { var i = _R.idx[n]; if (i !== undefined) _O[i * 3 + 2] += v; }
  function offset(x, y, z) {
    var i = _R.off * 3;
    _O[i] = x; _O[i + 1] = y; _O[i + 2] = z;
  }

  /* Add a channel by index — used by the additive layers. */
  function padd(R, arr, name, c, v) {
    var i = R.idx[name];
    if (i === undefined) return;
    arr[i * 3 + c] += v;
  }

  /* ------------------------------------------------------------------ */
  /* Two-bone analytic IK, sagittal plane. Knee always breaks forward.    */
  /* ------------------------------------------------------------------ */

  var _ik = [0, 0];

  function ik2(dz, dy, L1, L2) {
    var d = Math.sqrt(dz * dz + dy * dy);
    var maxD = (L1 + L2) * 0.995;
    var minD = Math.abs(L1 - L2) + 0.02;
    var dc = d < minD ? minD : (d > maxD ? maxD : d);
    var baseA = Math.atan2(dz, -dy);
    var ca = U.clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1);
    var ck = U.clamp((L1 * L1 + L2 * L2 - dc * dc) / (2 * L1 * L2), -1, 1);
    _ik[0] = -(baseA + Math.acos(ca));
    _ik[1] = PI - Math.acos(ck);
  }

  /* ------------------------------------------------------------------ */
  /* Locomotion — the heart of it.                                        */
  /* ------------------------------------------------------------------ */

  /* Foot path in the hips' local frame. Writes fz (forward) and fy (height)
   * into _fp. Stance is a straight line travelling backwards at exactly the
   * body speed; swing is a smoothed return with a lift arc. */
  var _fp = [0, 0, 0];   /* z, y, roll */

  function footPath(ph, stride, duty, lift, ankleY) {
    var half = stride * duty * 0.5;
    var roll;
    if (ph < duty) {
      var u = ph / duty;
      _fp[0] = half * (1 - 2 * u);
      /* heel-strike (toes up) -> flat -> toe-off (heel lifts, toes down) */
      var heel = -0.26 * Math.max(0, 1 - u / 0.20);
      var toe = 0.62 * Math.pow(U.clamp((u - 0.52) / 0.48, 0, 1), 1.7);
      roll = heel + toe;
      /* raising the ankle as the heel comes up keeps the toe out of the floor */
      _fp[1] = ankleY + toe * 0.16;
    } else {
      var v = (ph - duty) / (1 - duty);
      _fp[0] = -half + (half * 2) * U.smoother(v);
      _fp[1] = ankleY + lift * Math.sin(PI * Math.pow(v, 0.86));
      /* trailing toe flicks down out of toe-off, then dorsiflexes to clear */
      roll = 0.55 * Math.max(0, 1 - v / 0.22) - 0.22 * Math.sin(PI * U.clamp(v * 1.15, 0, 1));
    }
    _fp[2] = roll;
  }

  function loco(R, out, t) {
    var A = R.A;
    var H = R.height;
    var hs = H / 1.8;
    var sp = A.speed;
    var cr = A.crouch;                                     /* 0..1 */
    var run = U.clamp((sp - 1.95) / 1.5, 0, 1);
    var gait = U.clamp(sp / 0.85, 0, 1);                   /* stand -> stride */
    var ph = A.phase;
    var phR = ph + 0.5; if (phR >= 1) phR -= 1;

    var L1 = R.p.thigh, L2 = R.p.shin;
    var legLen = L1 + L2;
    var ankleY = R.p.ankleY;
    var hipRest = R.p.hipY * (1 - cr * 0.30);
    var stride = A.stride * (1 - cr * 0.35);
    var duty = U.lerp(0.62, 0.36, run);
    var lift = U.lerp(0.055, 0.17, run) * hs * (1 - cr * 0.3);

    /* --- foot targets ------------------------------------------------- */
    footPath(ph, stride, duty, lift, ankleY);
    var lz = _fp[0] * gait, ly = U.lerp(ankleY, _fp[1], gait), lroll = _fp[2] * gait;
    footPath(phR, stride, duty, lift, ankleY);
    var rz = _fp[0] * gait, ry = U.lerp(ankleY, _fp[1], gait), rroll = _fp[2] * gait;

    /* Rest stance is very slightly split so an idle character is not a plank. */
    lz += 0.012 * hs * (1 - gait);
    rz -= 0.012 * hs * (1 - gait);

    /* --- hip height: the tallest position that still lets both legs reach.
     * This is where the weight comes from — at foot-strike the feet are far
     * apart, the constraint tightens and the pelvis drops. --------------- */
    var reach = legLen * 0.99;
    var cL = ly + Math.sqrt(Math.max(0, reach * reach - lz * lz));
    var cR = ry + Math.sqrt(Math.max(0, reach * reach - rz * rz));
    var hipY = Math.min(hipRest, Math.min(cL, cR)) - 0.010 * hs * (0.35 + gait);

    /* Running has a flight phase, so pure kinematics would float. Add the
     * ballistic term and the stance compression by hand. */
    if (run > 0.001) {
      var stanceAmt = (ph < duty ? 1 : 0) + (phR < duty ? 1 : 0);
      var flight = stanceAmt === 0 ? 1 : 0;
      hipY += run * hs * (flight * 0.045 - (stanceAmt > 0 ? 0.028 : 0)
        * (0.5 + 0.5 * Math.cos(TAU * 2 * ph)));
    }
    offset(0, hipY - R.p.hipY, 0);

    /* --- legs --------------------------------------------------------- */
    ik2(lz, ly - hipY, L1, L2);
    var thL = _ik[0], knL = _ik[1];
    ik2(rz, ry - hipY, L1, L2);
    var thR = _ik[0], knR = _ik[1];

    s3('thighL', thL, 0, -0.035);
    s3('thighR', thR, 0, 0.035);
    s3('shinL', knL, 0, 0);
    s3('shinR', knR, 0, 0);
    /* Ankle keeps the sole level with the floor, then the roll curve on top. */
    s3('footL', -(thL + knL) + lroll, 0, 0);
    s3('footR', -(thR + knR) + rroll, 0, 0);

    /* --- pelvis / spine ----------------------------------------------- */
    var swing = gait * (1 - cr * 0.5);
    var hipYaw = 0.105 * swing * Math.cos(TAU * ph) * R.p.hipSwing;
    var hipRoll = -0.052 * swing * Math.sin(TAU * ph);
    s3('hips', 0, hipYaw, hipRoll);

    /* the torso counter-rotates ~40% of the hips, in world terms */
    var counter = -1.4 * hipYaw;
    var lean = U.lerp(0.02, 0.26, run) + cr * 0.42 + R.p.lean;
    s3('spine', lean * 0.45, counter * 0.5, -hipRoll * 0.35);
    s3('chest', lean * 0.55, counter * 0.5, -hipRoll * 0.25);
    /* the head stays level over all of it */
    s3('neck', -lean * 0.55 - cr * 0.10, -counter * 0.35, 0);
    sx('head', -lean * 0.25);

    /* --- arms --------------------------------------------------------- */
    var armA = U.lerp(0.16, 1.02, run) * gait * (1 - cr * 0.45);
    var swL = Math.cos(TAU * ph);        /* left arm back while left leg leads */
    var swR = Math.cos(TAU * phR);
    var elbowBase = U.lerp(-0.16, -1.28, run) - cr * 0.35;
    var shrugRun = run * 0.10;

    s3('shoulderL', 0, counter * -0.25, -shrugRun);
    s3('shoulderR', 0, counter * -0.25, shrugRun);
    s3('upperArmL', armA * swL, 0, 0);
    s3('upperArmR', armA * swR, 0, 0);
    s3('foreArmL', elbowBase - 0.28 * armA * (1 - swL), 0, 0);
    s3('foreArmR', elbowBase - 0.28 * armA * (1 - swR), 0, 0);
    s3('handL', 0.10 * swL, 0, 0);
    s3('handR', 0.10 * swR, 0, 0);

    /* --- shoulder bounce so the upper body is not a rigid mast --------- */
    var bounce = R.p.bounce * gait * 0.012 * (1 + run);
    ax('chest', bounce * Math.cos(TAU * 2 * ph));
  }

  /* ------------------------------------------------------------------ */
  /* Non-locomotion clips                                                 */
  /* ------------------------------------------------------------------ */

  /* Sit: hips lifted to seat height, thighs horizontal, shins down. */
  function poseSit(R, out, t, work) {
    var H = R.height;
    var seat = 0.255 * H;
    offset(0, seat - R.p.hipY, -0.035 * H);
    s3('hips', 0.06, 0, 0);
    s3('spine', 0.05, 0, 0);
    s3('chest', 0.04, 0, 0);
    s3('neck', -0.06, 0, 0);

    s3('thighL', -1.50, 0.06, -0.06);
    s3('thighR', -1.50, -0.06, 0.06);
    s3('shinL', 1.44, 0, 0);
    s3('shinR', 1.44, 0, 0);
    s3('footL', 0.06, 0, 0);
    s3('footR', 0.06, 0, 0);

    var br = Math.sin(t * TAU * 0.26);
    if (work) {
      /* forearms out over a desk, fingers busy */
      var k = Math.sin(t * 8.5), k2 = Math.sin(t * 7.3 + 1.9);
      s3('shoulderL', 0, -0.10, -0.05);
      s3('shoulderR', 0, 0.10, 0.05);
      s3('upperArmL', -0.42 + 0.02 * k, 0.16, -0.14);
      s3('upperArmR', -0.42 + 0.02 * k2, -0.16, 0.14);
      s3('foreArmL', -1.02 + 0.05 * k, 0.10, 0);
      s3('foreArmR', -1.02 + 0.05 * k2, -0.10, 0);
      s3('handL', 0.18 + 0.10 * k, 0, 0);
      s3('handR', 0.18 + 0.10 * k2, 0, 0);
      ax('neck', 0.22);
      ax('chest', 0.06);
    } else {
      s3('upperArmL', -0.30, 0.06, -0.10);
      s3('upperArmR', -0.30, -0.06, 0.10);
      s3('foreArmL', -0.72, 0.12, 0);
      s3('foreArmR', -0.72, -0.12, 0);
      s3('handL', 0.10, 0, 0.10);
      s3('handR', 0.10, 0, -0.10);
      ax('chest', br * 0.012);
    }
  }

  /* Standing at a bench: leaning in, hands doing small precise things. */
  function poseWork(R, out, t) {
    loco(R, out, t);
    var k = Math.sin(t * 5.2), k2 = Math.sin(t * 4.1 + 2.2), s = Math.sin(t * 0.7);
    a3('spine', 0.16, 0.05 * s, 0);
    a3('chest', 0.14, 0.05 * s, 0);
    s3('neck', 0.26, -0.04 * s, 0);
    sx('head', 0.16);

    s3('shoulderL', 0, -0.14, -0.06);
    s3('shoulderR', 0, 0.14, 0.06);
    s3('upperArmL', -0.62 + 0.03 * k, 0.30, -0.16);
    s3('upperArmR', -0.62 + 0.03 * k2, -0.30, 0.16);
    s3('foreArmL', -1.24 + 0.09 * k, 0.14, 0);
    s3('foreArmR', -1.30 + 0.11 * k2, -0.14, 0);
    s3('handL', 0.12 + 0.16 * k, 0.10 * k, 0);
    s3('handR', 0.12 + 0.20 * k2, -0.14 * k2, 0);
  }

  /* On your back / crouched reaching up under a desk. */
  function poseWorkUnder(R, out, t) {
    var H = R.height;
    offset(0, 0.30 * H - R.p.hipY, -0.02 * H);
    s3('hips', -0.20, 0, 0);
    s3('spine', -0.10, 0, 0);
    s3('chest', -0.06, 0, 0);
    s3('neck', 0.30, 0, 0);
    sx('head', 0.12);

    s3('thighL', -1.15, 0.10, -0.14);
    s3('thighR', -1.20, -0.10, 0.14);
    s3('shinL', 1.75, 0, 0);
    s3('shinR', 1.70, 0, 0);
    s3('footL', -0.05, 0, 0);
    s3('footR', -0.05, 0, 0);

    var k = Math.sin(t * 4.6), k2 = Math.sin(t * 3.9 + 1.1);
    s3('shoulderL', 0, -0.10, -0.16);
    s3('shoulderR', 0, 0.10, 0.16);
    s3('upperArmL', -1.30 + 0.06 * k, 0.22, -0.22);
    s3('upperArmR', -1.34 + 0.06 * k2, -0.22, 0.22);
    s3('foreArmL', -0.86 + 0.12 * k, 0, 0);
    s3('foreArmR', -0.90 + 0.14 * k2, 0, 0);
    s3('handL', 0.10 + 0.18 * k, 0, 0);
    s3('handR', 0.10 + 0.20 * k2, 0, 0);
  }

  function poseKneel(R, out, t) {
    var H = R.height;
    offset(0, 0.30 * H - R.p.hipY, -0.03 * H);
    s3('hips', 0.05, -0.12, 0);
    s3('spine', 0.06, 0.06, 0);
    s3('chest', 0.05, 0.06, 0);
    s3('neck', 0.06, 0, 0);

    /* right knee down, left foot planted */
    s3('thighR', 0.22, -0.08, 0.06);
    s3('shinR', 2.20, 0, 0);
    s3('footR', 0.55, 0, 0);
    s3('thighL', -1.28, 0.10, -0.10);
    s3('shinL', 1.36, 0, 0);
    s3('footL', -0.10, 0, 0);

    var k = Math.sin(t * 3.4);
    s3('upperArmL', -0.28, 0.10, -0.12);
    s3('upperArmR', -0.52 + 0.04 * k, -0.18, 0.10);
    s3('foreArmL', -0.55, 0.10, 0);
    s3('foreArmR', -0.98 + 0.10 * k, -0.10, 0);
    s3('handL', 0.10, 0, 0);
    s3('handR', 0.14 + 0.10 * k, 0, 0);
  }

  function poseCarry(R, out, t) {
    loco(R, out, t);
    var k = Math.sin(t * TAU * 0.4);
    a3('spine', -0.06, 0, 0);
    a3('chest', -0.04, 0, 0);
    s3('shoulderL', 0, -0.16, -0.06);
    s3('shoulderR', 0, 0.16, 0.06);
    s3('upperArmL', -0.72 + 0.02 * k, 0.30, -0.16);
    s3('upperArmR', -0.72 - 0.02 * k, -0.30, 0.16);
    s3('foreArmL', -1.26, 0.22, 0);
    s3('foreArmR', -1.26, -0.22, 0);
    s3('handL', 0, 0, -0.20);
    s3('handR', 0, 0, 0.20);
  }

  function poseType(R, out, t) {
    loco(R, out, t);
    var k = Math.sin(t * 15.5), k2 = Math.sin(t * 13.9 + 2.4);
    a3('spine', 0.12, 0, 0);
    s3('neck', 0.22, 0, 0);
    s3('shoulderL', 0, -0.12, -0.04);
    s3('shoulderR', 0, 0.12, 0.04);
    s3('upperArmL', -0.44, 0.24, -0.12);
    s3('upperArmR', -0.44, -0.24, 0.12);
    s3('foreArmL', -1.12, 0.12, 0);
    s3('foreArmR', -1.12, -0.12, 0);
    s3('handL', 0.20 + 0.16 * Math.max(0, k), 0, 0);
    s3('handR', 0.20 + 0.16 * Math.max(0, k2), 0, 0);
  }

  /* --- one shots ----------------------------------------------------- */

  function poseNod(R, out, t, u) {
    loco(R, out, t);
    var a = Math.sin(u * TAU * 2) * (1 - u) * 0.9;
    ax('neck', a * 0.16);
    ax('head', a * 0.14);
    ax('chest', a * 0.03);
  }

  function posePoint(R, out, t, u) {
    loco(R, out, t);
    var w = U.smooth(Math.min(1, u * 4)) * (1 - U.smooth(Math.max(0, (u - 0.72) / 0.28)));
    s3('shoulderR', 0, 0.10 * w, 0.16 * w);
    s3('upperArmR', -1.32 * w, -0.14 * w, 0.10 * w);
    s3('foreArmR', -0.14 * w, 0, 0);
    s3('handR', -0.10 * w, 0, 0);
    ay('chest', -0.10 * w);
    ay('neck', -0.06 * w);
  }

  function poseShrug(R, out, t, u) {
    loco(R, out, t);
    var w = Math.sin(U.clamp(u, 0, 1) * PI);
    az('shoulderL', -0.30 * w);
    az('shoulderR', 0.30 * w);
    a3('upperArmL', 0.10 * w, 0, -0.30 * w);
    a3('upperArmR', 0.10 * w, 0, 0.30 * w);
    a3('foreArmL', -0.70 * w, 0.30 * w, 0);
    a3('foreArmR', -0.70 * w, -0.30 * w, 0);
    a3('handL', -0.35 * w, 0, 0.4 * w);
    a3('handR', -0.35 * w, 0, -0.4 * w);
    ax('neck', 0.10 * w);
    ax('head', 0.06 * w);
  }

  function poseHandshake(R, out, t, u) {
    loco(R, out, t);
    var w = U.smooth(Math.min(1, u * 3.5)) * (1 - U.smooth(Math.max(0, (u - 0.78) / 0.22)));
    var pump = Math.sin(u * TAU * 2.4) * w * 0.16;
    s3('shoulderR', 0, 0.12 * w, 0.06 * w);
    s3('upperArmR', (-0.72 + pump) * w, -0.20 * w, 0.14 * w);
    s3('foreArmR', -0.80 * w, -0.18 * w, 0);
    s3('handR', (0.10 + pump * 0.6) * w, 0, -0.30 * w);
    ax('spine', 0.06 * w);
    ax('neck', 0.05 * w);
  }

  function poseWave(R, out, t, u) {
    loco(R, out, t);
    var w = U.smooth(Math.min(1, u * 3.5)) * (1 - U.smooth(Math.max(0, (u - 0.72) / 0.28)));
    s3('shoulderR', 0, 0, 0.28 * w);
    s3('upperArmR', -0.30 * w, -0.10 * w, 0.95 * w);
    s3('foreArmR', -1.10 * w, 0, 0);
    s3('handR', 0, 0, Math.sin(u * TAU * 3.6) * 0.42 * w);
    ax('neck', -0.05 * w);
  }

  function poseOpenDoor(R, out, t, u) {
    loco(R, out, t);
    var reach = Math.sin(U.clamp(u * 1.15, 0, 1) * PI * 0.9);
    var push = U.smooth(U.clamp((u - 0.45) / 0.5, 0, 1));
    s3('shoulderR', 0, 0.12 * reach, 0.10 * reach);
    s3('upperArmR', (-1.00 - 0.15 * push) * reach, -0.16 * reach, 0.10 * reach);
    s3('foreArmR', (-0.55 + 0.35 * push) * reach, 0, 0);
    s3('handR', -0.20 * reach, 0.30 * push, 0);
    ay('chest', -0.14 * reach);
    ay('hips', -0.06 * push);
    ax('spine', 0.08 * push);
  }

  function poseStagger(R, out, t, u) {
    loco(R, out, t);
    var e = Math.exp(-u * 2.6);
    var w = Math.sin(u * TAU * 1.4) * e;
    a3('hips', 0, 0.18 * w, 0.16 * w);
    a3('spine', -0.20 * e, -0.14 * w, -0.20 * w);
    a3('chest', -0.10 * e, -0.10 * w, -0.12 * w);
    a3('neck', 0.14 * e, 0.10 * w, 0);
    a3('upperArmL', -0.30 * e, 0, -0.85 * e);
    a3('upperArmR', -0.30 * e, 0, 0.85 * e);
    a3('foreArmL', -0.45 * e, 0, 0);
    a3('foreArmR', -0.45 * e, 0, 0);
    offset(_O[_R.off * 3] + 0.02 * w, _O[_R.off * 3 + 1] - 0.03 * e, _O[_R.off * 3 + 2]);
  }

  function poseLookAround(R, out, t) {
    loco(R, out, t);
    /* a genuine sweep: hold, swing, hold, swing back, with the chest following */
    var c = (t % 6.4) / 6.4;
    var a;
    if (c < 0.18) a = 0;
    else if (c < 0.34) a = U.smoother((c - 0.18) / 0.16);
    else if (c < 0.52) a = 1;
    else if (c < 0.72) a = 1 - 2 * U.smoother((c - 0.52) / 0.20);
    else if (c < 0.88) a = -1;
    else a = -1 + U.smoother((c - 0.88) / 0.12);
    var yaw = a * 0.92;
    ay('neck', yaw * 0.34);
    ay('head', yaw * 0.40);
    ay('chest', yaw * 0.16);
    ay('spine', yaw * 0.08);
    ax('head', -0.05 + 0.05 * Math.cos(t * 1.7));
    R.A.lookSuppress = 1;
  }

  var HUMAN_CLIPS = {
    idle: loco, walk: loco, run: loco, crouch: loco, crouchWalk: loco,
    sit: function (R, o, t) { poseSit(R, o, t, false); },
    sitWork: function (R, o, t) { poseSit(R, o, t, true); },
    work: poseWork,
    workUnder: poseWorkUnder,
    kneel: poseKneel,
    carry: poseCarry,
    type: poseType,
    point: posePoint,
    nod: poseNod,
    shrug: poseShrug,
    handshake: poseHandshake,
    wave: poseWave,
    openDoor: poseOpenDoor,
    stagger: poseStagger,
    lookAround: poseLookAround
  };

  var ONESHOT = {
    point: 1.7, nod: 1.15, shrug: 1.35, handshake: 1.9, wave: 2.0,
    openDoor: 1.5, stagger: 1.25, catJump: 0.95, catStretch: 2.3
  };

  var CROUCHY = { crouch: 1, crouchWalk: 1 };
  var LOCOISH = {
    idle: 0, walk: 1.25, run: 3.4, crouch: 0, crouchWalk: 0.8, carry: 0,
    work: 0, type: 0, lookAround: 0
  };

  var MOODS = {
    neutral: { brow: 0.00, head: 0.00, sh: 0.00, blink: 4.4, breath: 0.25, idle: 1.00 },
    warm: { brow: -0.10, head: -0.04, sh: -0.02, blink: 3.8, breath: 0.24, idle: 1.10 },
    wary: { brow: 0.13, head: 0.03, sh: 0.06, blink: 3.0, breath: 0.31, idle: 0.70 },
    tired: { brow: 0.06, head: 0.09, sh: -0.07, blink: 6.2, breath: 0.19, idle: 1.25 },
    focused: { brow: 0.15, head: 0.06, sh: 0.02, blink: 6.8, breath: 0.22, idle: 0.55 }
  };

  /* ------------------------------------------------------------------ */
  /* Scratch — hoisted, never allocated in update()                      */
  /* ------------------------------------------------------------------ */

  var _v1 = new THREE.Vector3();
  var _v2 = new THREE.Vector3();
  var _q1 = new THREE.Quaternion();
  var _e1 = new THREE.Euler(0, 0, 0, 'YXZ');

  /* ------------------------------------------------------------------ */
  /* Rig core — shared by humans and the cat                             */
  /* ------------------------------------------------------------------ */

  function makeRig(names, clips) {
    var R = {};
    R.names = names;
    R.idx = {};
    for (var i = 0; i < names.length; i++) R.idx[names[i]] = i;
    R.n = names.length;
    R.off = R.n;                              /* pseudo-bone: hips translation */
    var w = (R.n + 1) * 3;
    R.base = new Float64Array(w);
    R.pose = new Float64Array(w);
    R.tmp = new Float64Array(w);
    R.from = new Float64Array(w);
    R.bone = new Array(R.n);
    R.bones = {};
    R.clips = clips;
    R.clampJoints = true;
    R.eyes = null;
    R.brow = null;
    R.A = {
      clip: 'idle', baseClip: 'idle', clipT: 0, rate: 1, loop: true, dur: 0,
      onDone: null, fired: false,
      blendT: 1, blendDur: 0.18,
      speed: 0, targetSpeed: 0, phase: 0, stride: 1.3, crouch: 0, crouchT: 0,
      t: 0, breathT: 0, blinkIn: 2 + Math.random() * 3, blinkA: 0,
      lookOn: false, lookYaw: 0, lookPit: 0, lookSuppress: 0,
      lookT: new THREE.Vector3(),
      speaking: false, speakE: 0, jaw: 0,
      mood: 'neutral', wander: Math.random() * 100,
      followTarget: null, stillT: 0, catSpeed: 0,
      dead: false
    };
    return R;
  }

  function bindBone(R, name, obj) {
    var i = R.idx[name];
    if (i === undefined) return obj;
    R.bone[i] = obj;
    R.bones[name] = obj;
    return obj;
  }

  function setBase(R, name, x, y, z) {
    var i = R.idx[name];
    if (i === undefined) return;
    R.base[i * 3] = x || 0;
    R.base[i * 3 + 1] = y || 0;
    R.base[i * 3 + 2] = z || 0;
  }

  /* ------------------------------------------------------------------ */
  /* The animation loop shared by every rig                              */
  /* ------------------------------------------------------------------ */

  function rigPlay(R, clip, opts) {
    opts = opts || {};
    var A = R.A;
    if (!R.clips[clip]) {
      /* Never throw on an unknown clip — fall back to the nearest neighbour. */
      clip = R.fallback[clip] || R.defaultClip;
    }
    if (clip === A.clip && opts.force !== true &&
      (A.loop || A.clipT < 0.05)) {
      /* re-playing a looping clip is a no-op; re-playing a one-shot restarts */
      if (A.loop) return R.api;
    }
    R.pose.set(R.pose);
    A.from = null;
    R.from.set(R.pose);
    A.blendDur = opts.blend === undefined ? 0.18 : Math.max(0.001, opts.blend);
    A.blendT = 0;
    A.clip = clip;
    A.clipT = 0;
    A.fired = false;
    A.rate = opts.speed === undefined ? 1 : opts.speed;
    A.onDone = opts.onDone || null;
    A.dur = ONESHOT[clip] || 0;
    A.loop = opts.loop === undefined ? !ONESHOT[clip] : !!opts.loop;
    if (A.loop) A.baseClip = clip;
    A.crouch = CROUCHY[clip] ? 1 : 0;
    if (LOCOISH[clip] !== undefined && LOCOISH[clip] > 0) A.targetSpeed = LOCOISH[clip];
    if (clip === 'idle' || clip === 'crouch') A.targetSpeed = 0;
    return R.api;
  }

  function applyPose(R) {
    var b = R.bone, base = R.base, p = R.pose, i, o;
    for (i = 0; i < R.n; i++) {
      o = b[i];
      if (!o) continue;
      o.rotation.set(base[i * 3] + p[i * 3],
        base[i * 3 + 1] + p[i * 3 + 1],
        base[i * 3 + 2] + p[i * 3 + 2]);
    }
    if (R.clampJoints) {
      clampJoint(R, 'shinL', 0, 2.45);
      clampJoint(R, 'shinR', 0, 2.45);
      clampJointNeg(R, 'foreArmL', -2.5, 0);
      clampJointNeg(R, 'foreArmR', -2.5, 0);
    }
    var h = R.bones.hips;
    if (h) {
      h.position.set(R.p.hipX + p[R.off * 3],
        R.p.hipY + p[R.off * 3 + 1],
        R.p.hipZ + p[R.off * 3 + 2]);
    }
  }

  function clampJoint(R, n, lo, hi) {
    var o = R.bones[n];
    if (!o) return;
    o.rotation.x = o.rotation.x < lo ? lo : (o.rotation.x > hi ? hi : o.rotation.x);
  }
  function clampJointNeg(R, n, lo, hi) {
    var o = R.bones[n];
    if (!o) return;
    o.rotation.x = o.rotation.x < lo ? lo : (o.rotation.x > hi ? hi : o.rotation.x);
  }

  /* Breathing, weight shift, blink, idle head drift — always on. */
  function additive(R, dt) {
    var A = R.A;
    var mood = MOODS[A.mood] || MOODS.neutral;
    var p = R.pose;
    var still = 1 - U.clamp(A.speed / 0.8, 0, 1);

    A.breathT += dt * (mood.breath / 0.25);
    var br = Math.sin(A.breathT * TAU * 0.25);
    padd(R, p, 'chest', 0, br * 0.016 * mood.idle);
    padd(R, p, 'spine', 0, br * 0.007 * mood.idle);
    padd(R, p, 'shoulderL', 2, -br * 0.022);
    padd(R, p, 'shoulderR', 2, br * 0.022);
    padd(R, p, 'upperArmL', 2, -br * 0.010);
    padd(R, p, 'upperArmR', 2, br * 0.010);

    /* slow weight shift, only when standing about */
    if (still > 0.01) {
      var w = A.wander + A.t;
      var ws = Math.sin(w * 0.37) * 0.62 + Math.sin(w * 0.213 + 1.7) * 0.38;
      var wy = Math.sin(w * 0.29 + 0.6) * 0.6 + Math.sin(w * 0.157 + 2.4) * 0.4;
      var k = still * mood.idle * R.p.fidget;
      padd(R, p, 'hips', 2, ws * 0.022 * k);
      padd(R, p, 'hips', 1, wy * 0.030 * k);
      padd(R, p, 'chest', 2, -ws * 0.014 * k);
      padd(R, p, 'chest', 1, -wy * 0.018 * k);
      p[R.off * 3] += ws * 0.006 * k * R.height;
    }

    /* mood posture */
    padd(R, p, 'neck', 0, mood.head * 0.6);
    padd(R, p, 'head', 0, mood.head * 0.4);
    padd(R, p, 'shoulderL', 2, -mood.sh);
    padd(R, p, 'shoulderR', 2, mood.sh);
    if (R.brow) R.brow.rotation.x = mood.brow;

    /* blink */
    A.blinkIn -= dt;
    if (A.blinkA > 0) {
      A.blinkA -= dt;
      if (A.blinkA <= 0 && R.eyes) {
        R.eyes[0].scale.y = R.eyeSy; R.eyes[1].scale.y = R.eyeSy;
      }
    } else if (A.blinkIn <= 0) {
      A.blinkIn = mood.blink * (0.6 + (A.wander * 7 % 1) * 0.9) + 0.6;
      A.wander += 0.137;
      A.blinkA = 0.09;
      if (R.eyes) {
        R.eyes[0].scale.y = R.eyeSy * 0.10;
        R.eyes[1].scale.y = R.eyeSy * 0.10;
      }
    }
  }

  /* Head/neck aim. Damped, clamped, and it yields to lookAround. */
  function aim(R, dt) {
    var A = R.A;
    var tyaw = 0, tpit = 0;
    if (A.lookOn && !A.lookSuppress) {
      var head = R.bones.head || R.bones.neck || R.root;
      head.getWorldPosition(_v1);
      _v2.copy(A.lookT).sub(_v1);
      var hd = Math.sqrt(_v2.x * _v2.x + _v2.z * _v2.z);
      if (hd > 0.03 || Math.abs(_v2.y) > 0.03) {
        R.root.getWorldQuaternion(_q1);
        _e1.setFromQuaternion(_q1, 'YXZ');
        tyaw = U.clamp(wrapPi(Math.atan2(_v2.x, _v2.z) - _e1.y), -70 * DEG, 70 * DEG);
        tpit = U.clamp(-Math.atan2(_v2.y, Math.max(0.08, hd)), -35 * DEG, 35 * DEG);
      }
    } else if (!A.lookSuppress) {
      /* idle drift so the head is never frozen */
      var w = A.wander * 3.1 + A.t;
      tyaw = (Math.sin(w * 0.21) * 0.6 + Math.sin(w * 0.113 + 1.3) * 0.4) * 0.16 * R.p.fidget;
      tpit = Math.sin(w * 0.17 + 2.1) * 0.06 * R.p.fidget;
    }
    A.lookYaw = U.damp(A.lookYaw, tyaw, 6.5, dt);
    A.lookPit = U.damp(A.lookPit, tpit, 6.5, dt);
    var p = R.pose;
    padd(R, p, 'neck', 1, A.lookYaw * 0.38);
    padd(R, p, 'head', 1, A.lookYaw * 0.62);
    padd(R, p, 'neck', 0, A.lookPit * 0.34);
    padd(R, p, 'head', 0, A.lookPit * 0.66);
    A.lookSuppress = 0;
  }

  /* Jaw. Noisy ~7 Hz envelope, with a small nod on the stressed beats. */
  function speakLayer(R, dt) {
    var A = R.A;
    var target = 0;
    if (A.speaking) {
      var t = A.t;
      var e = Math.abs(Math.sin(t * TAU * 3.35));
      e *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * TAU * 1.17 + 1.2));
      e *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * TAU * 0.53 + 3.1));
      var gap = Math.sin(t * TAU * 0.31 + 0.7);
      if (gap < -0.72) e *= 0.06;
      target = 0.04 + 0.30 * e;
      A.speakE = e;
      var stress = Math.max(0, Math.sin(t * TAU * 0.62)) * e;
      padd(R, R.pose, 'neck', 0, stress * 0.035);
      padd(R, R.pose, 'head', 0, stress * 0.020);
      padd(R, R.pose, 'chest', 0, stress * 0.010);
    } else {
      A.speakE = 0;
    }
    A.jaw = U.damp(A.jaw, target, 22, dt);
    var j = R.bones.jaw;
    if (j) j.rotation.x = R.p.jawBase + A.jaw;
  }

  function rigUpdate(R, dt) {
    if (R.A.dead) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    var A = R.A;
    A.t += dt;

    /* speed -> gait */
    A.speed = U.damp(A.speed, A.targetSpeed, 8, dt);
    if (A.speed < 0.005) A.speed = 0;
    var hs = R.height / 1.8;
    A.stride = U.clamp(0.62 + 0.52 * A.speed, 0.85, 2.9) * hs * R.p.strideK;
    if (A.speed > 0.02) {
      A.phase += (A.speed / A.stride) * dt;
      A.phase -= Math.floor(A.phase);
    }

    /* auto locomotion switching, but only from inside the locomotion set */
    var c = A.clip;
    if (c === 'idle' || c === 'walk' || c === 'run') {
      var want = A.speed < 0.14 ? 'idle' : (A.speed < 2.35 ? 'walk' : 'run');
      if (want !== c) {
        var keep = A.targetSpeed;
        rigPlay(R, want, { blend: 0.22 });
        A.targetSpeed = keep;
      }
    } else if (c === 'crouch' || c === 'crouchWalk') {
      var wantC = A.speed < 0.14 ? 'crouch' : 'crouchWalk';
      if (wantC !== c) {
        var keepC = A.targetSpeed;
        rigPlay(R, wantC, { blend: 0.22 });
        A.targetSpeed = keepC;
      }
    }

    A.clipT += dt * A.rate;
    var u = A.dur > 0 ? U.clamp(A.clipT / A.dur, 0, 1) : 0;

    /* evaluate */
    var fn = R.clips[A.clip] || R.clips[R.defaultClip];
    _R = R; _O = R.tmp;
    R.tmp.fill(0);
    fn(R, R.tmp, A.clipT, u);
    _R = null; _O = null;

    /* blend */
    var i, n = R.tmp.length;
    if (A.blendT < 1) {
      A.blendT += dt / A.blendDur;
      if (A.blendT >= 1) { A.blendT = 1; R.pose.set(R.tmp); } else {
        var w = U.smooth(A.blendT);
        for (i = 0; i < n; i++) R.pose[i] = R.from[i] + (R.tmp[i] - R.from[i]) * w;
      }
    } else {
      R.pose.set(R.tmp);
    }

    /* additive layers */
    additive(R, dt);
    aim(R, dt);
    speakLayer(R, dt);
    if (R.extraLayer) R.extraLayer(R, dt);

    applyPose(R);

    /* one-shot completion */
    if (!A.loop && A.dur > 0 && A.clipT >= A.dur && !A.fired) {
      A.fired = true;
      var cb = A.onDone;
      A.onDone = null;
      rigPlay(R, A.baseClip || R.defaultClip, { blend: 0.24 });
      if (cb) { try { cb(); } catch (e) { /* a callback must not kill the frame */ } }
    }
  }

  /* Public surface shared by every rig. */
  function finish(R, opts) {
    opts = opts || {};
    var api = {
      root: R.root,
      bones: R.bones,
      height: R.height,
      rig: R,
      play: function (clip, o) { return rigPlay(R, clip, o); },
      update: function (dt) { rigUpdate(R, dt); },
      lookAt: function (v) {
        if (!v) { R.A.lookOn = false; return; }
        R.A.lookOn = true;
        R.A.lookT.set(v.x, v.y, v.z);
      },
      setSpeed: function (mps) {
        R.A.targetSpeed = mps > 0 ? mps : 0;
      },
      setMood: function (name) {
        R.A.mood = MOODS[name] ? name : 'neutral';
      },
      speak: function (on) { R.A.speaking = !!on; },
      dispose: function () {
        R.A.dead = true;
        R.A.followTarget = null;
        if (R.root.parent) R.root.parent.remove(R.root);
      }
    };
    R.api = api;
    U.setShadow(R.root, true, false);
    /* Eyes and specular dots are unlit — shadows on them read as dirt. */
    if (R.noShadow) {
      for (var i = 0; i < R.noShadow.length; i++) {
        R.noShadow[i].castShadow = false;
        R.noShadow[i].receiveShadow = false;
      }
    }
    U.measure(R.root);
    R.root.userData.rig = api;
    applyPose(R);
    rigPlay(R, opts.clip || R.defaultClip, { blend: 0.001 });
    return api;
  }

  /* ================================================================== */
  /* HUMAN CONSTRUCTION                                                  */
  /* ================================================================== */

  var HUMAN_BONES = [
    'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
    'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR',
    'foreArmL', 'foreArmR', 'handL', 'handR',
    'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'
  ];

  var HUMAN_FALLBACK = {
    sleep: 'sit', crouchIdle: 'crouch', jog: 'run', talk: 'idle',
    catIdle: 'idle', catWalk: 'walk', catSit: 'sit', catSleep: 'sit',
    catStretch: 'idle', catGroom: 'idle', catJump: 'idle',
    catTypeOnKeyboard: 'type'
  };

  /* Fractions of total height. These are the numbers that make a figure read
   * as a person rather than an action figure; do not fiddle with them
   * without a reference photo. */
  function proportions(H, cfg) {
    var w = cfg.build === undefined ? 1 : cfg.build;
    return {
      H: H,
      hipX: 0, hipY: 0.525 * H, hipZ: 0,
      thigh: 0.235 * H, shin: 0.245 * H, ankleY: 0.045 * H,
      spine: 0.095 * H, chest: 0.115 * H, neck: 0.115 * H,
      shoulderX: 0.055 * H * w, shoulderY: 0.085 * H, armX: 0.060 * H * w,
      upperArm: 0.165 * H, foreArm: 0.150 * H, hand: 0.085 * H,
      headR: 0.098 * H * (cfg.headScale || 1),
      hipW: 0.096 * H * w, chestW: 0.115 * H * w, chestD: 0.072 * H * (cfg.depth || 1),
      lean: cfg.lean || 0,
      bounce: cfg.bounce === undefined ? 1 : cfg.bounce,
      hipSwing: cfg.hipSwing === undefined ? 1 : cfg.hipSwing,
      strideK: cfg.strideK === undefined ? 1 : cfg.strideK,
      fidget: cfg.fidget === undefined ? 1 : cfg.fidget,
      jawBase: 0
    };
  }

  function buildHead(R, cfg, head) {
    var H = R.height;
    var p = R.p;
    var hr = p.headR;
    var skin = cfg.skinMat;
    var noS = R.noShadow;

    /* cranium — slightly flattened sphere, longer than it is wide */
    put(head, gSph(), skin, 0, hr * 0.50, -hr * 0.05, hr * 0.85, hr * 1.02, hr * 0.95);
    /* face block filling in below the cheekbones */
    put(head, gSphM(), skin, 0, hr * 0.16, hr * 0.10, hr * 0.68, hr * 0.60, hr * 0.72);

    /* brow ridge — one box, and it does more for a face than anything else */
    var brow = jt(head, 0, hr * 0.66, hr * 0.60);
    R.brow = brow;
    put(brow, gBox(), skin, 0, 0, 0, hr * 1.16, hr * 0.15, hr * 0.30);
    put(brow, gBox(), cfg.browMat || skin, 0, hr * 0.02, hr * 0.12,
      hr * 1.02, hr * 0.09, hr * 0.10);

    /* nose */
    put(head, gCone(), skin, 0, hr * 0.40, hr * 0.80, hr * 0.20, hr * 0.34, hr * 0.30,
      PI * 0.42, 0, 0);

    /* ears */
    put(head, gSphS(), skin, -hr * 0.86, hr * 0.44, -hr * 0.02, hr * 0.10, hr * 0.24, hr * 0.18);
    put(head, gSphS(), skin, hr * 0.86, hr * 0.44, -hr * 0.02, hr * 0.10, hr * 0.24, hr * 0.18);

    /* eyes: white sphere, dark iris, one specular dot */
    var eyeR = hr * 0.155;
    var white = cmat('eyeWhite', { color: 0xe9e6df, rough: 0.30 });
    var iris = cmat('iris_' + (cfg.eye || 0x4a3a2a), {
      color: cfg.eye || 0x4a3a2a, rough: 0.22
    });
    var spec = cmat('specDot', { color: 0xffffff, rough: 0.05, emissive: 0xffffff, emiI: 0.35 });
    var eyes = [];
    for (var s = -1; s <= 1; s += 2) {
      var eg = jt(head, s * hr * 0.36, hr * 0.50, hr * 0.62);
      var ew = put(eg, gSphS(), white, 0, 0, 0, eyeR, eyeR * 0.86, eyeR * 0.72);
      put(eg, gSphS(), iris, 0, 0, eyeR * 0.50, eyeR * 0.52, eyeR * 0.52, eyeR * 0.30);
      var sd = put(eg, gSphS(), spec, -s * eyeR * 0.18, eyeR * 0.24, eyeR * 0.66,
        eyeR * 0.16, eyeR * 0.16, eyeR * 0.10);
      noS.push(sd);
      eyes.push(ew);
      /* upper lid, so the eye is not a golf ball */
      put(eg, gSphM(), skin, 0, eyeR * 0.42, eyeR * 0.06,
        eyeR * 1.12, eyeR * 0.56, eyeR * 0.92);
    }
    R.eyes = eyes;
    R.eyeSy = eyeR * 0.86;

    /* jaw — pivot back near the ear line so it swings, not slides */
    var jaw = jt(head, 0, hr * 0.30, -hr * 0.18);
    bindBone(R, 'jaw', jaw);
    put(jaw, gSphM(), skin, 0, -hr * 0.30, hr * 0.36, hr * 0.62, hr * 0.36, hr * 0.62);
    put(jaw, gBox(), cfg.mouthMat || cmat('mouthDark', { color: 0x3a2420, rough: 0.7 }),
      0, -hr * 0.10, hr * 0.74, hr * 0.46, hr * 0.06, hr * 0.10);
    R.p.jawBase = 0.02;

    /* hair */
    hairShell(R, cfg, head, hr);
  }

  function hairShell(R, cfg, head, hr) {
    var style = cfg.hairStyle || 'short';
    if (style === 'bald') return;
    var m = cfg.hairMat || hairMat('def', 0x6b5a48, 'hairBrown');
    if (style === 'perm') {
      put(head, gDome(), m, 0, hr * 0.50, -hr * 0.06, hr * 1.10, hr * 1.14, hr * 1.10);
      /* lumps: a set is not a smooth helmet */
      var rnd = U.rng(41);
      for (var i = 0; i < 7; i++) {
        var a = rnd() * TAU, e = 0.15 + rnd() * 0.85;
        put(head, gSphS(), m,
          Math.sin(a) * hr * 0.86 * Math.sin(e * 1.4),
          hr * (0.52 + Math.cos(e * 1.4) * 0.72),
          Math.cos(a) * hr * 0.86 * Math.sin(e * 1.4) - hr * 0.06,
          hr * 0.30, hr * 0.26, hr * 0.30);
      }
      return;
    }
    if (style === 'crop') {
      put(head, gDome(), m, 0, hr * 0.50, -hr * 0.05, hr * 0.90, hr * 1.03, hr * 0.99);
      return;
    }
    if (style === 'neat') {
      put(head, gDome(), m, 0, hr * 0.52, -hr * 0.05, hr * 0.91, hr * 1.05, hr * 1.00);
      /* a parting */
      put(head, gBox(), m, -hr * 0.18, hr * 1.28, hr * 0.10, hr * 0.06, hr * 0.10, hr * 0.7);
      return;
    }
    if (style === 'bob') {
      put(head, gDome(), m, 0, hr * 0.50, -hr * 0.05, hr * 0.95, hr * 1.06, hr * 1.02);
      put(head, gCyl(), m, 0, hr * 0.10, -hr * 0.14, hr * 0.92, hr * 0.85, hr * 0.90);
      return;
    }
    /* 'short' — receding, which is most men over forty */
    put(head, gDome(), m, 0, hr * 0.48, -hr * 0.10, hr * 0.90, hr * 1.02, hr * 0.99);
    put(head, gBox(), m, 0, hr * 1.18, hr * 0.44, hr * 1.00, hr * 0.28, hr * 0.34);
  }

  function buildHuman(cfg) {
    cfg = cfg || {};
    var H = cfg.height || 1.8;
    var R = makeRig(HUMAN_BONES, HUMAN_CLIPS);
    R.height = H;
    R.defaultClip = 'idle';
    R.fallback = HUMAN_FALLBACK;
    R.noShadow = [];
    var p = R.p = proportions(H, cfg);
    var skin = cfg.skinMat = cfg.skinMat || skinMat(cfg.skin || 'pale');
    var hs = H / 1.8;

    var root = R.root = new THREE.Group();
    root.name = cfg.id || 'human';

    var hips = bindBone(R, 'hips', jt(root, 0, p.hipY, 0));
    var spine = bindBone(R, 'spine', jt(hips, 0, p.spine, 0));
    var chest = bindBone(R, 'chest', jt(spine, 0, p.chest, 0));
    var neck = bindBone(R, 'neck', jt(chest, 0, p.neck, 0));
    var head = bindBone(R, 'head', jt(neck, 0, 0, 0));

    /* --- torso volumes ------------------------------------------------ */
    var torsoMat = cfg.torsoMat || clothMat('def', 0x8a8f96, 0.88);
    var lowerMat = cfg.lowerMat || clothMat('deflow', 0x4c4f55, 0.9);

    /* pelvis (trousers) */
    put(hips, gCyl(), lowerMat, 0, p.spine * 0.14, 0,
      p.hipW, p.spine * 1.05, p.hipW * 0.72);
    /* abdomen */
    put(spine, gTap(), torsoMat, 0, p.chest * 0.42, 0,
      p.chestW * 0.88, p.chest * 1.15, p.chestD * 0.94, PI, 0, 0);
    /* chest — wider at the top, narrower at the waist */
    put(chest, gTap(), torsoMat, 0, p.neck * 0.34, 0,
      p.chestW, p.neck * 0.95, p.chestD, PI, 0, 0);
    /* shoulder shelf */
    put(chest, gCyl(), torsoMat, 0, p.neck * 0.70, 0,
      p.chestW * 1.02, p.neck * 0.30, p.chestD * 0.98);
    /* neck */
    put(neck, gCyl(), skin, 0, -p.neck * 0.28, -0.004 * H,
      0.038 * H, p.neck * 0.62, 0.036 * H);

    buildHead(R, cfg, head);

    /* --- arms --------------------------------------------------------- */
    var sleeve = cfg.sleeveMat || torsoMat;
    var handMat = cfg.handMat || skin;
    var sides = [['L', -1], ['R', 1]];
    for (var i = 0; i < 2; i++) {
      var sn = sides[i][0], sg = sides[i][1];
      var sh = bindBone(R, 'shoulder' + sn, jt(chest, sg * p.shoulderX, p.shoulderY, 0));
      put(sh, gSphM(), sleeve, sg * p.armX * 0.55, -0.004 * H, 0,
        0.052 * H * (cfg.build || 1), 0.050 * H, 0.050 * H);
      var ua = bindBone(R, 'upperArm' + sn, jt(sh, sg * p.armX, -0.012 * H, 0));
      limb(ua, sleeve, p.upperArm, 0.036 * H, 0.030 * H, 0.95);
      var fa = bindBone(R, 'foreArm' + sn, jt(ua, 0, -p.upperArm, 0));
      put(fa, gSphS(), sleeve, 0, 0, 0, 0.031 * H);
      limb(fa, cfg.foreMat || sleeve, p.foreArm, 0.030 * H, 0.024 * H, 0.92);
      var hd = bindBone(R, 'hand' + sn, jt(fa, 0, -p.foreArm, 0));
      put(hd, gBox(), handMat, 0, -p.hand * 0.42, 0.002 * H,
        0.030 * H, p.hand * 0.80, 0.048 * H);
      put(hd, gBox(), handMat, sg * 0.020 * H, -p.hand * 0.28, 0.012 * H,
        0.014 * H, p.hand * 0.36, 0.026 * H, 0, 0, sg * 0.5);
      setBase(R, 'upperArm' + sn, 0.03, 0, sg * 0.085);
      setBase(R, 'foreArm' + sn, -0.12, 0, 0);
    }

    /* --- legs --------------------------------------------------------- */
    var shoe = cfg.shoeMat || cmat('shoeDef', { color: 0x2b2724, rough: 0.55, tex: 'rubber' });
    for (i = 0; i < 2; i++) {
      var ln = sides[i][0], lg = sides[i][1];
      var th = bindBone(R, 'thigh' + ln, jt(hips, lg * p.hipW * 0.52, -0.014 * H, 0));
      limb(th, cfg.thighMat || lowerMat, p.thigh, 0.056 * H * (cfg.build || 1), 0.044 * H, 0.95);
      var sk = bindBone(R, 'shin' + ln, jt(th, 0, -p.thigh, 0));
      put(sk, gSphS(), cfg.thighMat || lowerMat, 0, 0, 0.002 * H, 0.045 * H);
      limb(sk, cfg.shinMat || lowerMat, p.shin, 0.043 * H, 0.030 * H, 0.94);
      var ft = bindBone(R, 'foot' + ln, jt(sk, 0, -p.shin, 0));
      /* boot: heel block, upper, toe */
      put(ft, gBox(), shoe, 0, -p.ankleY * 0.52, 0.020 * H,
        0.052 * H, p.ankleY * 0.95, 0.150 * H);
      put(ft, gBox(), shoe, 0, -p.ankleY * 0.16, -0.006 * H,
        0.048 * H, p.ankleY * 1.10, 0.062 * H);
      put(ft, gBox(), cfg.soleMat || shoe, 0, -p.ankleY * 0.92, 0.024 * H,
        0.054 * H, p.ankleY * 0.30, 0.152 * H);
    }

    /* --- posture ------------------------------------------------------ */
    setBase(R, 'spine', cfg.stoop ? cfg.stoop * 0.45 : 0, 0, 0);
    setBase(R, 'chest', cfg.stoop ? cfg.stoop * 0.55 : 0, 0, 0);
    setBase(R, 'neck', (cfg.headForward || 0) - (cfg.stoop || 0) * 0.55, 0, 0);
    setBase(R, 'head', -(cfg.headForward || 0) * 0.45 + (cfg.stoop || 0) * 0.30, 0, 0);

    if (cfg.dress) cfg.dress(R, cfg, hs);

    R.A.mood = cfg.mood || 'neutral';
    return finish(R, cfg);
  }

  /* ================================================================== */
  /* THE CAST                                                           */
  /* ================================================================== */

  /* --- Steve ---------------------------------------------------------
   * 1.80, mid-forties, deliberately unremarkable. He is the player and is
   * mostly seen from behind, so the back of him has to hold up: tool pouch,
   * phone bulge, a loop of cable in the cargo pocket. */
  CH.steve = function (opts) {
    opts = opts || {};
    return buildHuman({
      id: 'steve',
      height: opts.height || 1.80,
      skin: opts.skin || 'tan',
      build: 1.00, depth: 1.02,
      headScale: 0.99,
      headForward: 0.13,          /* twenty years over a bench */
      bounce: 0.35,               /* almost no bob; he walks like furniture */
      hipSwing: 0.75,
      fidget: 0.8,
      hairStyle: 'short',
      hairMat: hairMat('steve', 0x6a5b4c, 'hairBrown'),
      eye: 0x53422f,
      mood: opts.mood || 'neutral',
      torsoMat: clothMat('polo', 0x37536a, 0.88),
      sleeveMat: clothMat('polo', 0x37536a, 0.88),
      lowerMat: clothMat('cargo', 0x565247, 0.92),
      shoeMat: cmat('bootWorn', { color: 0x4b3b2e, rough: 0.72, tex: 'rubber' }),
      dress: dressSteve
    });
  };

  function dressSteve(R, cfg, hs) {
    var H = R.height, B = R.bones, p = R.p;
    var polo = cfg.torsoMat;
    var dark = cmat('steveTrim', { color: 0x22384a, rough: 0.85 });
    var metal = cmat('toolSteel', { color: 0xb9bec4, rough: 0.42, metal: 1.0 });
    var belt = cmat('beltLeather', { color: 0x3a2a1e, rough: 0.62 });

    /* polo collar + placket */
    put(B.chest, gCyl(), dark, 0, p.neck * 0.80, 0,
      0.052 * H, 0.020 * H, 0.048 * H);
    put(B.chest, gBox(), dark, 0, p.neck * 0.56, p.chestD * 0.94,
      0.020 * H, 0.070 * H, 0.006 * H);
    /* embroidered shop logo, left chest */
    var logo = cmat('shopLogo', { color: 0xd8c68a, rough: 0.75, emissive: 0x2a2410, emiI: 0.3 });
    put(B.chest, gBox(), logo, -0.040 * H, p.neck * 0.34, p.chestD * 0.96,
      0.030 * H, 0.016 * H, 0.004 * H);

    /* belt + multi-tool pouch on the right hip, phone bulge back-left */
    put(B.hips, gCyl(), belt, 0, p.spine * 0.56, 0, p.hipW * 1.03, 0.020 * H, p.hipW * 0.75);
    var pouch = put(B.hips, gBox(), belt, p.hipW * 0.88, p.spine * 0.20, -0.010 * H,
      0.028 * H, 0.055 * H, 0.038 * H);
    pouch.rotation.z = 0.08;
    put(B.hips, gBox(), metal, p.hipW * 0.88, p.spine * 0.48, -0.010 * H,
      0.016 * H, 0.024 * H, 0.024 * H);
    /* phone, back pocket */
    put(B.hips, gBox(), cmat('phoneBlk', { color: 0x1b1c1e, rough: 0.45 }),
      -p.hipW * 0.46, -p.spine * 0.05, -p.hipW * 0.72,
      0.036 * H, 0.062 * H, 0.010 * H, 0, 0, 0.06);
    /* a loop of cable poking out of the right cargo pocket */
    var cable = cmat('cableBlk', { color: 0x24262a, rough: 0.7 });
    var loop = put(B.thighR, gRing(), cable, 0.030 * H, -p.thigh * 0.42, -0.030 * H,
      0.030 * H, 0.030 * H, 0.030 * H, 0.5, 0.4, 0);
    loop.castShadow = false;
    /* cargo pockets */
    put(B.thighL, gBox(), cfg.lowerMat, -0.032 * H, -p.thigh * 0.52, 0.006 * H,
      0.020 * H, 0.060 * H, 0.050 * H);
    put(B.thighR, gBox(), cfg.lowerMat, 0.032 * H, -p.thigh * 0.52, 0.006 * H,
      0.020 * H, 0.060 * H, 0.050 * H);
    /* wristwatch */
    put(B.handL, gCyl(), metal, 0, 0.006 * H, 0, 0.030 * H, 0.010 * H, 0.030 * H);
  }

  /* --- Oleg -----------------------------------------------------------
   * 1.93, heavy through the chest, dark overcoat, short grey hair. Weight
   * even on both feet. His hands do not move when he talks. */
  CH.oleg = function (opts) {
    opts = opts || {};
    return buildHuman({
      id: 'oleg',
      height: opts.height || 1.93,
      skin: opts.skin || 'pale',
      build: 1.24, depth: 1.20,
      headScale: 1.03,
      headForward: 0.02,
      bounce: 0.5,
      hipSwing: 0.55,
      fidget: 0.18,              /* he does not shift his weight */
      strideK: 0.92,
      hairStyle: 'crop',
      hairMat: hairMat('olegGrey', 0xa8a49e, 'hairGrey'),
      eye: 0x3d4448,
      mood: opts.mood || 'neutral',
      torsoMat: cmat('coatWool', { color: 0x2b2f36, rough: 0.9, tex: 'suitWool', texOpts: { repeat: 2 } }),
      sleeveMat: cmat('coatWool', { color: 0x2b2f36, rough: 0.9, tex: 'suitWool', texOpts: { repeat: 2 } }),
      lowerMat: cmat('coatTrouser', { color: 0x23262b, rough: 0.9, tex: 'suitWool', texOpts: { repeat: 2 } }),
      shoeMat: cmat('shoeBlack', { color: 0x141414, rough: 0.35 }),
      dress: dressOleg
    });
  };

  function dressOleg(R, cfg, hs) {
    var H = R.height, B = R.bones, p = R.p;
    var coat = cfg.torsoMat;
    var shirt = clothMat('olegShirt', 0x9aa2ac, 0.9);

    /* the overcoat: skirts from the chest down past the hips */
    var skirtTop = put(B.spine, gTap(), coat, 0, -p.chest * 0.10, 0,
      p.chestW * 1.12, p.chest * 1.6, p.chestD * 1.10, PI, 0, 0);
    skirtTop.receiveShadow = true;
    put(B.hips, gTap(), coat, 0, -p.thigh * 0.44, 0,
      p.hipW * 1.34, p.thigh * 1.05, p.hipW * 1.02);
    /* lapels */
    put(B.chest, gBox(), coat, -0.036 * H, p.neck * 0.40, p.chestD * 1.02,
      0.038 * H, 0.115 * H, 0.010 * H, 0, 0, 0.28);
    put(B.chest, gBox(), coat, 0.036 * H, p.neck * 0.40, p.chestD * 1.02,
      0.038 * H, 0.115 * H, 0.010 * H, 0, 0, -0.28);
    /* collar */
    put(B.chest, gCyl(), coat, 0, p.neck * 0.76, -0.006 * H,
      0.060 * H, 0.034 * H, 0.058 * H);
    /* shirt showing at the throat */
    put(B.chest, gBox(), shirt, 0, p.neck * 0.50, p.chestD * 0.96,
      0.030 * H, 0.070 * H, 0.008 * H);
    /* wide shoulders — he takes up space */
    put(B.shoulderL, gSphM(), coat, -0.020 * H, 0.004 * H, 0, 0.058 * H, 0.052 * H, 0.055 * H);
    put(B.shoulderR, gSphM(), coat, 0.020 * H, 0.004 * H, 0, 0.058 * H, 0.052 * H, 0.055 * H);

    /* he stands square, arms slightly out over the chest */
    setBase(R, 'upperArmL', 0.02, 0, 0.135);
    setBase(R, 'upperArmR', 0.02, 0, -0.135);
    setBase(R, 'foreArmL', -0.14, 0.05, 0);
    setBase(R, 'foreArmR', -0.14, -0.05, 0);
  }

  /* --- Ms. Ellis ------------------------------------------------------
   * 1.52, 93, stooped about 15 degrees at the upper spine. Cardigan over a
   * floral blouse, glasses on a chain, a handbag she does not put down.
   * She is the emotional centre of the game. Play her straight. */
  CH.msEllis = function (opts) {
    opts = opts || {};
    return buildHuman({
      id: 'msEllis',
      height: opts.height || 1.52,
      skin: opts.skin || 'pale',
      build: 0.88, depth: 0.94,
      headScale: 1.06,           /* heads do not shrink with age */
      stoop: 15 * DEG,
      bounce: 0.55,
      hipSwing: 0.5,
      strideK: 0.62,             /* short, slow, with a pause on each step */
      fidget: 1.25,
      hairStyle: 'perm',
      hairMat: hairMat('ellisWhite', 0xe8e6e2, 'hairGrey'),
      eye: 0x5a6a70,
      mood: opts.mood || 'warm',
      torsoMat: clothMat('cardigan', 0xa9a3b4, 0.95, 'cotton', 3),
      sleeveMat: clothMat('cardigan', 0xa9a3b4, 0.95, 'cotton', 3),
      lowerMat: clothMat('ellisSkirt', 0x4c4a58, 0.93, 'cotton', 3),
      shoeMat: cmat('ellisShoe', { color: 0x35302c, rough: 0.5 }),
      dress: dressEllis
    });
  };

  function dressEllis(R, cfg, hs) {
    var H = R.height, B = R.bones, p = R.p;
    var cardi = cfg.torsoMat;
    var blouse = cmat('floral', { color: 0xd9c3cf, rough: 0.92, tex: 'cotton', texOpts: { repeat: 6 } });
    var chrome = cmat('glassFrame', { color: 0xbfa66a, rough: 0.3, metal: 1 });
    var lens = cmat('glassLens', { color: 0xcfe0e6, rough: 0.06, metal: 0 });

    /* the blouse showing down the front of the open cardigan */
    put(B.chest, gBox(), blouse, 0, p.neck * 0.30, p.chestD * 0.98,
      0.062 * H, 0.135 * H, 0.008 * H);
    put(B.spine, gBox(), blouse, 0, p.chest * 0.40, p.chestD * 0.94,
      0.055 * H, 0.100 * H, 0.008 * H);
    /* cardigan front edges + buttons */
    put(B.chest, gBox(), cardi, -0.042 * H, p.neck * 0.30, p.chestD * 1.00,
      0.024 * H, 0.140 * H, 0.010 * H);
    put(B.chest, gBox(), cardi, 0.042 * H, p.neck * 0.30, p.chestD * 1.00,
      0.024 * H, 0.140 * H, 0.010 * H);

    /* skirt */
    put(B.hips, gTap(), cfg.lowerMat, 0, -p.thigh * 0.36, 0,
      p.hipW * 1.30, p.thigh * 0.90, p.hipW * 1.05);

    /* glasses, and the chain that keeps them from being lost */
    var gg = jt(B.head, 0, p.headR * 0.50, p.headR * 0.74);
    for (var s = -1; s <= 1; s += 2) {
      put(gg, gRing(), chrome, s * p.headR * 0.36, 0, 0,
        p.headR * 0.22, p.headR * 0.20, p.headR * 0.22, PI / 2, 0, 0);
      var l = put(gg, gDisc(), lens, s * p.headR * 0.36, 0, 0.002 * H,
        p.headR * 0.20, p.headR * 0.18, 1);
      l.castShadow = false;
    }
    put(gg, gBox(), chrome, 0, 0, 0, p.headR * 0.30, p.headR * 0.03, p.headR * 0.04);
    var chain = cmat('specChain', { color: 0xb9a06a, rough: 0.5, metal: 0.9 });
    for (s = -1; s <= 1; s += 2) {
      put(B.neck, gCyl4(), chain, s * 0.040 * H, -p.neck * 0.18, 0.004 * H,
        0.0022 * H, 0.075 * H, 0.0022 * H, 0.25, 0, s * 0.22);
    }

    /* the handbag, hooked over the left forearm, never put down */
    var bagMat = cmat('handbag', { color: 0x54382b, rough: 0.55 });
    var bag = jt(B.foreArmL, 0, -p.foreArm * 0.72, 0.010 * H);
    put(bag, gBox(), bagMat, 0, -0.055 * H, 0, 0.052 * H, 0.070 * H, 0.036 * H);
    put(bag, gRing(), bagMat, 0, -0.006 * H, 0,
      0.028 * H, 0.028 * H, 0.010 * H, 0, PI / 2, 0);
    put(bag, gBox(), cmat('bagClasp', { color: 0xc0a462, rough: 0.35, metal: 1 }),
      0, -0.020 * H, 0.019 * H, 0.016 * H, 0.010 * H, 0.004 * H);

    /* she holds the bag arm across herself */
    setBase(R, 'upperArmL', 0.02, 0.10, 0.10);
    setBase(R, 'foreArmL', -0.85, 0.30, 0);
    setBase(R, 'upperArmR', 0.05, 0, -0.09);
    setBase(R, 'foreArmR', -0.28, 0, 0);
  }

  /* --- Guard ----------------------------------------------------------- */
  CH.guard = function (opts) {
    opts = opts || {};
    return buildHuman({
      id: 'guard',
      height: opts.height || 1.85,
      skin: opts.skin || (opts.variant === 1 ? 'brown' : 'tan'),
      build: 1.10, depth: 1.06,
      headScale: 0.99,
      bounce: 0.7,
      hipSwing: 0.85,
      fidget: 0.55,
      hairStyle: 'crop',
      hairMat: hairMat('guardHair', 0x3a3129, 'hairBrown'),
      eye: 0x3a3a3a,
      mood: opts.mood || 'wary',
      torsoMat: cmat('suitDark', { color: 0x2e323a, rough: 0.86, tex: 'suitWool', texOpts: { repeat: 2 } }),
      sleeveMat: cmat('suitDark', { color: 0x2e323a, rough: 0.86, tex: 'suitWool', texOpts: { repeat: 2 } }),
      lowerMat: cmat('suitDark2', { color: 0x282c33, rough: 0.88, tex: 'suitWool', texOpts: { repeat: 2 } }),
      shoeMat: cmat('shoeBlack', { color: 0x141414, rough: 0.35 }),
      dress: dressGuard
    });
  };

  function dressGuard(R, cfg, hs) {
    var H = R.height, B = R.bones, p = R.p;
    var suit = cfg.torsoMat;
    var shirt = clothMat('guardShirt', 0xe6e8ea, 0.88);
    var tie = cmat('guardTie', { color: 0x5a1f26, rough: 0.55 });
    var blk = cmat('gearBlack', { color: 0x191b1e, rough: 0.5 });
    var steel = cmat('toolSteel', { color: 0xb9bec4, rough: 0.42, metal: 1.0 });

    /* jacket skirt + lapels */
    put(B.hips, gTap(), suit, 0, -p.thigh * 0.22, 0,
      p.hipW * 1.18, p.thigh * 0.62, p.hipW * 0.92);
    put(B.chest, gBox(), shirt, 0, p.neck * 0.40, p.chestD * 0.98,
      0.040 * H, 0.120 * H, 0.008 * H);
    put(B.chest, gBox(), tie, 0, p.neck * 0.34, p.chestD * 1.02,
      0.016 * H, 0.110 * H, 0.006 * H);
    put(B.chest, gBox(), suit, -0.034 * H, p.neck * 0.40, p.chestD * 1.00,
      0.036 * H, 0.115 * H, 0.010 * H, 0, 0, 0.26);
    put(B.chest, gBox(), suit, 0.034 * H, p.neck * 0.40, p.chestD * 1.00,
      0.036 * H, 0.115 * H, 0.010 * H, 0, 0, -0.26);

    /* earpiece + the coiled wire down the collar */
    put(B.head, gSphS(), blk, p.headR * 0.90, p.headR * 0.40, 0, p.headR * 0.13);
    put(B.neck, gCyl4(), blk, 0.030 * H, -p.neck * 0.20, -0.012 * H,
      0.0025 * H, 0.085 * H, 0.0025 * H, 0.15, 0, 0.22);

    /* lanyard + badge */
    var lan = cmat('lanyard', { color: 0x1d2229, rough: 0.85 });
    put(B.chest, gBox(), lan, -0.030 * H, p.neck * 0.42, p.chestD * 0.98,
      0.008 * H, 0.110 * H, 0.004 * H, 0, 0, 0.20);
    put(B.chest, gBox(), lan, 0.030 * H, p.neck * 0.42, p.chestD * 0.98,
      0.008 * H, 0.110 * H, 0.004 * H, 0, 0, -0.20);
    put(B.chest, gBox(), cmat('badgeCard', { color: 0xdfe3e6, rough: 0.4 }),
      0, p.neck * 0.05, p.chestD * 1.02, 0.026 * H, 0.038 * H, 0.003 * H);

    /* torch on the belt */
    put(B.hips, gCyl(), steel, p.hipW * 0.92, -0.020 * H, -0.004 * H,
      0.013 * H, 0.090 * H, 0.013 * H, 0.12, 0, 0.06);
    put(B.hips, gCyl(), blk, 0, p.spine * 0.50, 0, p.hipW * 1.02, 0.018 * H, p.hipW * 0.76);

    setBase(R, 'upperArmL', 0.02, 0, 0.11);
    setBase(R, 'upperArmR', 0.02, 0, -0.11);
  }

  /* --- Concierge -------------------------------------------------------- */
  CH.concierge = function (opts) {
    opts = opts || {};
    return buildHuman({
      id: 'concierge',
      height: opts.height || 1.76,
      skin: opts.skin || 'pale',
      build: 0.96, depth: 0.96,
      headScale: 0.98,
      bounce: 0.45,
      hipSwing: 0.6,
      fidget: 0.30,               /* immaculate: he does not fidget */
      hairStyle: 'neat',
      hairMat: hairMat('concHair', 0x2b241d, 'hairBrown'),
      eye: 0x4a4038,
      mood: opts.mood || 'warm',
      torsoMat: cmat('uniformNavy', { color: 0x1f2a3d, rough: 0.78, tex: 'suitWool', texOpts: { repeat: 2 } }),
      sleeveMat: cmat('uniformNavy', { color: 0x1f2a3d, rough: 0.78, tex: 'suitWool', texOpts: { repeat: 2 } }),
      lowerMat: cmat('uniformNavy2', { color: 0x1b2436, rough: 0.8, tex: 'suitWool', texOpts: { repeat: 2 } }),
      handMat: cmat('whiteGlove', { color: 0xf0eee8, rough: 0.85, tex: 'cotton', texOpts: { repeat: 3 } }),
      shoeMat: cmat('shoeBlack', { color: 0x141414, rough: 0.3 }),
      dress: dressConcierge
    });
  };

  function dressConcierge(R, cfg, hs) {
    var H = R.height, B = R.bones, p = R.p;
    var uni = cfg.torsoMat;
    var brass = cmat('brass', { color: 0xc9a227, rough: 0.28, metal: 1.0 });

    /* tailcoat body + stand collar */
    put(B.hips, gTap(), uni, 0, -p.thigh * 0.26, 0,
      p.hipW * 1.14, p.thigh * 0.72, p.hipW * 0.90);
    put(B.chest, gCyl(), uni, 0, p.neck * 0.82, 0,
      0.050 * H, 0.030 * H, 0.048 * H);
    /* brass buttons, two rows */
    for (var i = 0; i < 4; i++) {
      var y = p.neck * 0.56 - i * 0.036 * H;
      put(B.chest, gSphS(), brass, -0.026 * H, y, p.chestD * 1.01, 0.008 * H);
      put(B.chest, gSphS(), brass, 0.026 * H, y, p.chestD * 1.01, 0.008 * H);
    }
    /* epaulettes */
    put(B.shoulderL, gBox(), brass, -0.024 * H, 0.020 * H, 0,
      0.048 * H, 0.008 * H, 0.030 * H);
    put(B.shoulderR, gBox(), brass, 0.024 * H, 0.020 * H, 0,
      0.048 * H, 0.008 * H, 0.030 * H);
    /* gold piping down the trouser seam */
    put(B.thighL, gBox(), brass, -0.030 * H, -p.thigh * 0.5, 0,
      0.004 * H, p.thigh * 0.95, 0.004 * H);
    put(B.thighR, gBox(), brass, 0.030 * H, -p.thigh * 0.5, 0,
      0.004 * H, p.thigh * 0.95, 0.004 * H);

    /* hands clasped at the waist — his default and his resting state */
    setBase(R, 'upperArmL', 0.30, 0.22, 0.05);
    setBase(R, 'upperArmR', 0.30, -0.22, -0.05);
    setBase(R, 'foreArmL', -1.18, 0.42, 0);
    setBase(R, 'foreArmR', -1.18, -0.42, 0);
    setBase(R, 'handL', 0.10, 0.20, 0);
    setBase(R, 'handR', 0.10, -0.20, 0);
    setBase(R, 'spine', -0.03, 0, 0);       /* chest up, shoulders back */
    setBase(R, 'chest', -0.02, 0, 0);
  }

  /* --- Passenger (first class, four of them, none alike) ---------------- */
  var PAX = [
    {
      h: 1.86, skin: 'pale', build: 1.02, hair: 'crop', hairC: 0x8d8a86,
      coat: 0x3b4048, low: 0x2f333a, mood: 'tired', headScale: 1.0
    },
    {
      h: 1.62, skin: 'brown', build: 0.90, hair: 'bob', hairC: 0x241c17,
      coat: 0x6e4550, low: 0x3a2c30, mood: 'neutral', headScale: 1.02
    },
    {
      h: 1.78, skin: 'tan', build: 1.14, hair: 'bald', hairC: 0x000000,
      coat: 0x5b5f52, low: 0x3d4038, mood: 'focused', headScale: 1.01
    },
    {
      h: 1.70, skin: 'pale', build: 0.94, hair: 'neat', hairC: 0xb08b4a,
      coat: 0x38505c, low: 0x2c3a42, mood: 'warm', headScale: 0.99
    }
  ];

  CH.passenger = function (opts) {
    opts = opts || {};
    var v = ((opts.variant | 0) % PAX.length + PAX.length) % PAX.length;
    var d = PAX[v];
    return buildHuman({
      id: 'passenger' + v,
      height: opts.height || d.h,
      skin: opts.skin || d.skin,
      build: d.build, depth: 1.0,
      headScale: d.headScale,
      headForward: v === 0 ? 0.08 : 0.03,
      bounce: 0.6, hipSwing: 0.8, fidget: 0.7 + v * 0.15,
      hairStyle: d.hair,
      hairMat: hairMat('pax' + v, d.hairC, v === 0 ? 'hairGrey' : 'hairBrown'),
      eye: v === 1 ? 0x2a201a : 0x4a4038,
      mood: opts.mood || d.mood,
      torsoMat: clothMat('paxTop' + v, d.coat, 0.88, v === 2 ? 'suitWool' : 'cotton', 2),
      sleeveMat: clothMat('paxTop' + v, d.coat, 0.88, v === 2 ? 'suitWool' : 'cotton', 2),
      lowerMat: clothMat('paxLow' + v, d.low, 0.9, 'cotton', 2),
      shoeMat: cmat('paxShoe' + v, { color: v === 1 ? 0x40312c : 0x1e1c1a, rough: 0.45 }),
      dress: function (R, cfg) { dressPassenger(R, cfg, v); }
    });
  };

  function dressPassenger(R, cfg, v) {
    var H = R.height, B = R.bones, p = R.p;
    var top = cfg.torsoMat;
    if (v === 0) {
      /* rumpled business shirt, sleeves rolled */
      put(B.chest, gBox(), clothMat('paxShirt0', 0xdadfe4, 0.9),
        0, p.neck * 0.36, p.chestD * 0.99, 0.044 * H, 0.130 * H, 0.008 * H);
      put(B.foreArmL, gCyl(), top, 0, -0.012 * H, 0, 0.033 * H, 0.030 * H, 0.031 * H);
      put(B.foreArmR, gCyl(), top, 0, -0.012 * H, 0, 0.033 * H, 0.030 * H, 0.031 * H);
    } else if (v === 1) {
      /* scarf */
      var sc = clothMat('paxScarf', 0xc4763f, 0.95, 'cotton', 4);
      put(B.chest, gCyl(), sc, 0, p.neck * 0.72, 0, 0.058 * H, 0.038 * H, 0.056 * H);
      put(B.chest, gBox(), sc, 0.024 * H, p.neck * 0.30, p.chestD * 1.00,
        0.026 * H, 0.120 * H, 0.008 * H);
    } else if (v === 2) {
      /* suit, no tie, reading glasses pushed up */
      put(B.chest, gBox(), clothMat('paxShirt2', 0xc8ccd0, 0.9),
        0, p.neck * 0.38, p.chestD * 0.99, 0.036 * H, 0.120 * H, 0.008 * H);
      var fr = cmat('paxFrames', { color: 0x2a2a2c, rough: 0.35 });
      put(B.head, gBox(), fr, 0, p.headR * 1.05, p.headR * 0.42,
        p.headR * 0.90, p.headR * 0.06, p.headR * 0.10);
    } else {
      /* cardigan over a polo, travel pillow */
      put(B.chest, gBox(), clothMat('paxPolo3', 0xdfd8c8, 0.9),
        0, p.neck * 0.40, p.chestD * 0.99, 0.038 * H, 0.110 * H, 0.008 * H);
      put(B.neck, gRing(), clothMat('paxPillow', 0x9fb0b8, 0.95, 'cotton', 3),
        0, -p.neck * 0.24, 0, 0.062 * H, 0.062 * H, 0.030 * H, PI / 2, 0, 0);
    }
    setBase(R, 'upperArmL', 0.03, 0, 0.10);
    setBase(R, 'upperArmR', 0.03, 0, -0.10);
  }

  /* ================================================================== */
  /* KERNEL THE CAT                                                      */
  /* ================================================================== */

  var CAT_BONES = [
    'hips', 'spine', 'spineB', 'spineC', 'chest', 'neck', 'head', 'jaw',
    'earL', 'earR',
    'tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5',
    'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
    'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR',
    'foreArmL', 'foreArmR', 'handL', 'handR'
  ];

  var CAT_FALLBACK = {
    idle: 'catIdle', walk: 'catWalk', run: 'catWalk', sit: 'catSit',
    sleep: 'catSleep', crouch: 'catIdle', crouchWalk: 'catWalk',
    sitWork: 'catTypeOnKeyboard', work: 'catTypeOnKeyboard',
    workUnder: 'catIdle', carry: 'catWalk', point: 'catSit', nod: 'catSit',
    shrug: 'catSit', handshake: 'catSit', type: 'catTypeOnKeyboard',
    wave: 'catSit', openDoor: 'catIdle', kneel: 'catSit',
    lookAround: 'catSit', stagger: 'catWalk'
  };

  /* Cat legs use big base rotations (digitigrade), so the generic
   * human joint clamps do not apply. */

  function catBreath(R, out, t, amp) {
    var b = Math.sin(t * TAU * 0.30);
    ax('spineB', b * amp);
    ax('spineC', b * amp * 0.8);
    ax('chest', b * amp * 0.6);
  }

  function catLegsStand(R, out, k) {
    k = k === undefined ? 1 : k;
    s3('thighL', 0, 0, 0); s3('thighR', 0, 0, 0);
    s3('shinL', 0, 0, 0); s3('shinR', 0, 0, 0);
    s3('footL', 0, 0, 0); s3('footR', 0, 0, 0);
    s3('upperArmL', 0, 0, 0); s3('upperArmR', 0, 0, 0);
    s3('foreArmL', 0, 0, 0); s3('foreArmR', 0, 0, 0);
    s3('handL', 0, 0, 0); s3('handR', 0, 0, 0);
  }

  function catIdle(R, out, t) {
    catLegsStand(R, out);
    catBreath(R, out, t, 0.030);
    var s = Math.sin(t * 0.6);
    ay('neck', s * 0.06);
    ay('head', s * 0.09);
    ax('head', Math.sin(t * 0.43 + 1.2) * 0.05);
    R.A.tailDriveY = Math.sin(t * 0.72) * 0.16 + Math.sin(t * 1.31) * 0.05;
    R.A.tailDriveX = -0.30 + Math.sin(t * 0.5) * 0.05;
    R.A.earTwitch = 1;
  }

  function catWalk(R, out, t) {
    var A = R.A;
    var sp = Math.max(0.35, A.catSpeed || A.speed || 0.9);
    var ph = A.phase;
    /* lateral-sequence walk: FL, HR, FR, HL */
    var oFL = 0, oHR = 0.25, oFR = 0.5, oHL = 0.75;
    var amp = 0.42, kamp = 0.5;

    function legPair(upper, lower, paw, off, front) {
      var q = ph + off; q -= Math.floor(q);
      var sw = Math.sin(q * TAU);
      var lift = Math.max(0, Math.sin(q * TAU)) ;
      sx(upper, (front ? -1 : 1) * amp * sw * 0.8);
      sx(lower, (front ? 1 : -1) * (kamp * lift * (front ? 1 : 1)));
      sx(paw, (front ? -1 : 1) * 0.35 * lift);
    }
    legPair('upperArmL', 'foreArmL', 'handL', oFL, true);
    legPair('upperArmR', 'foreArmR', 'handR', oFR, true);
    legPair('thighL', 'shinL', 'footL', oHL, false);
    legPair('thighR', 'shinR', 'footR', oHR, false);

    /* spine ripple + the body rocking over the diagonal */
    var w = Math.sin(ph * TAU * 2);
    s3('spine', 0.02 * w, 0.05 * Math.sin(ph * TAU), 0);
    s3('spineB', 0.03 * w, 0.05 * Math.sin(ph * TAU + 0.4), 0);
    s3('spineC', -0.02 * w, 0.04 * Math.sin(ph * TAU + 0.8), 0);
    s3('chest', -0.02 * w, 0.03 * Math.sin(ph * TAU + 1.2), 0);
    offset(0, 0.008 * Math.cos(ph * TAU * 2), 0);
    ax('neck', -0.06);
    A.tailDriveY = Math.sin(ph * TAU) * 0.14;
    A.tailDriveX = -0.55 - 0.06 * w;
    A.earTwitch = 0.4;
  }

  function catSit(R, out, t) {
    offset(0, -0.075, -0.030);
    s3('hips', -0.95, 0, 0);
    s3('spine', 0.36, 0, 0);
    s3('spineB', 0.24, 0, 0);
    s3('spineC', 0.18, 0, 0);
    s3('chest', 0.12, 0, 0);
    /* hind legs folded under */
    s3('thighL', 0.95, 0.10, 0); s3('thighR', 0.95, -0.10, 0);
    s3('shinL', 0.55, 0, 0); s3('shinR', 0.55, 0, 0);
    s3('footL', -0.70, 0, 0); s3('footR', -0.70, 0, 0);
    /* front legs straight, taking the weight */
    s3('upperArmL', 0.10, 0, 0); s3('upperArmR', 0.10, 0, 0);
    s3('foreArmL', -0.16, 0, 0); s3('foreArmR', -0.16, 0, 0);
    s3('handL', 0.10, 0, 0); s3('handR', 0.10, 0, 0);
    catBreath(R, out, t, 0.024);
    var s = Math.sin(t * 0.5);
    ay('head', s * 0.14);
    ax('head', Math.sin(t * 0.37 + 2.0) * 0.06);
    R.A.tailDriveY = Math.sin(t * 0.9) * 0.24 + Math.sin(t * 2.1) * 0.06;
    R.A.tailDriveX = 0.10;
    R.A.earTwitch = 1.2;
  }

  function catSleep(R, out, t) {
    offset(0, -0.115, -0.010);
    s3('hips', -0.30, 0.55, 0);
    s3('spine', 0.10, 0.42, 0);
    s3('spineB', 0.12, 0.42, 0);
    s3('spineC', 0.14, 0.40, 0);
    s3('chest', 0.16, 0.36, 0);
    s3('neck', 0.30, 0.42, 0);
    s3('head', 0.34, 0.30, 0.10);
    /* legs tucked */
    s3('thighL', 1.35, 0.20, 0); s3('thighR', 1.30, -0.10, 0);
    s3('shinL', 1.30, 0, 0); s3('shinR', 1.25, 0, 0);
    s3('footL', -0.55, 0, 0); s3('footR', -0.55, 0, 0);
    s3('upperArmL', 1.15, 0.16, 0); s3('upperArmR', 1.10, -0.06, 0);
    s3('foreArmL', -1.20, 0, 0); s3('foreArmR', -1.15, 0, 0);
    s3('handL', 0.55, 0, 0); s3('handR', 0.55, 0, 0);
    /* he breathes — this is the whole point of a sleeping cat */
    var b = Math.sin(t * TAU * 0.28);
    ax('spineB', b * 0.055);
    ax('spineC', b * 0.045);
    ax('chest', b * 0.035);
    ax('neck', -b * 0.030);
    R.A.tailDriveY = 1.15 + Math.sin(t * 0.31) * 0.05;
    R.A.tailDriveX = 0.16;
    R.A.earTwitch = 0.15;
    R.A.eyesShut = 1;
  }

  function catStretch(R, out, t, u) {
    /* down-dog: front legs out, chest to the floor, rear end up, then relax */
    var w = Math.sin(U.clamp(u, 0, 1) * PI);
    var w2 = Math.sin(U.clamp(u, 0, 1) * PI * 0.9);
    offset(0, -0.055 * w, 0.055 * w);
    s3('hips', -0.30 * w, 0, 0);
    s3('spine', -0.26 * w, 0, 0);
    s3('spineB', -0.22 * w, 0, 0);
    s3('spineC', 0.10 * w, 0, 0);
    s3('chest', 0.26 * w, 0, 0);
    s3('neck', -0.30 * w2, 0, 0);
    s3('head', 0.10 * w2, 0, 0);
    s3('upperArmL', -1.05 * w, 0.05, 0);
    s3('upperArmR', -1.05 * w, -0.05, 0);
    s3('foreArmL', 0.30 * w, 0, 0);
    s3('foreArmR', 0.30 * w, 0, 0);
    s3('handL', 0.45 * w, 0, 0);
    s3('handR', 0.45 * w, 0, 0);
    s3('thighL', -0.35 * w, 0, 0); s3('thighR', -0.35 * w, 0, 0);
    s3('shinL', 0.30 * w, 0, 0); s3('shinR', 0.30 * w, 0, 0);
    R.A.tailDriveY = 0;
    R.A.tailDriveX = -1.20 * w - 0.20;
    R.A.earTwitch = 0.6;
  }

  function catGroom(R, out, t) {
    catSit(R, out, t);
    var c = (t % 4.2) / 4.2;
    var raise = c < 0.62 ? U.smooth(Math.min(1, c / 0.12)) *
      (1 - U.smooth(Math.max(0, (c - 0.5) / 0.12))) : 0;
    var lick = Math.sin(t * 9.5) * raise;
    a3('upperArmR', -1.25 * raise, -0.20 * raise, 0);
    a3('foreArmR', -0.85 * raise, 0, 0);
    a3('handR', 0.30 * raise, 0, 0);
    a3('neck', 0.55 * raise + lick * 0.05, -0.22 * raise, 0);
    a3('head', 0.25 * raise + lick * 0.06, -0.10 * raise, 0);
    R.A.jawDrive = raise * (0.5 + 0.5 * Math.sin(t * 12));
    R.A.tailDriveY = Math.sin(t * 0.8) * 0.18;
  }

  function catJump(R, out, t, u) {
    var crouch = Math.max(0, 1 - u / 0.28);
    var air = Math.sin(U.clamp((u - 0.22) / 0.62, 0, 1) * PI);
    var land = U.clamp((u - 0.84) / 0.16, 0, 1);
    offset(0, -0.055 * crouch + 0.34 * air - 0.03 * land, 0.10 * air);
    s3('hips', -0.30 * crouch + 0.28 * air, 0, 0);
    s3('spine', -0.18 * crouch + 0.10 * air, 0, 0);
    s3('spineB', -0.16 * crouch + 0.08 * air, 0, 0);
    s3('spineC', 0.10 * crouch - 0.06 * air, 0, 0);
    s3('chest', 0.12 * crouch - 0.10 * air, 0, 0);
    s3('neck', -0.20 * crouch - 0.20 * air, 0, 0);
    s3('thighL', 0.80 * crouch - 0.75 * air, 0, 0);
    s3('thighR', 0.80 * crouch - 0.75 * air, 0, 0);
    s3('shinL', 0.90 * crouch - 0.30 * air, 0, 0);
    s3('shinR', 0.90 * crouch - 0.30 * air, 0, 0);
    s3('upperArmL', 0.40 * crouch - 0.95 * air, 0, 0);
    s3('upperArmR', 0.40 * crouch - 0.95 * air, 0, 0);
    s3('foreArmL', -0.55 * crouch + 0.40 * air, 0, 0);
    s3('foreArmR', -0.55 * crouch + 0.40 * air, 0, 0);
    R.A.tailDriveX = -0.9 * air - 0.1;
    R.A.tailDriveY = 0;
    R.A.earTwitch = 0.2;
  }

  function catTypeOnKeyboard(R, out, t) {
    catSit(R, out, t);
    /* paws up on the keys, alternating taps, entirely unbothered */
    var k1 = Math.max(0, Math.sin(t * 7.4));
    var k2 = Math.max(0, Math.sin(t * 6.1 + 2.2));
    a3('upperArmL', -0.55 - 0.22 * k1, 0.06, 0);
    a3('upperArmR', -0.55 - 0.22 * k2, -0.06, 0);
    a3('foreArmL', 0.20 + 0.28 * k1, 0, 0);
    a3('foreArmR', 0.20 + 0.28 * k2, 0, 0);
    a3('handL', 0.35 * k1, 0, 0);
    a3('handR', 0.35 * k2, 0, 0);
    a3('neck', 0.22, 0, 0);
    a3('head', 0.10, 0, 0);
    R.A.tailDriveY = Math.sin(t * 1.6) * 0.30;
    R.A.earTwitch = 1.6;
  }

  var CAT_CLIPS = {
    catIdle: catIdle, catWalk: catWalk, catSit: catSit, catSleep: catSleep,
    catStretch: catStretch, catGroom: catGroom, catJump: catJump,
    catTypeOnKeyboard: catTypeOnKeyboard
  };

  CH.cat = function (opts) {
    opts = opts || {};
    var R = makeRig(CAT_BONES, CAT_CLIPS);
    var k = opts.scale || 1;
    R.height = 0.25 * k;
    R.defaultClip = 'catIdle';
    R.fallback = CAT_FALLBACK;
    R.clampJoints = false;
    R.noShadow = [];

    var fur = cmat('catFurGrey', {
      tex: 'catFur', texOpts: { repeat: 2 }, color: 0xffffff, rough: 0.86
    });
    var furLight = cmat('catFurBelly', {
      tex: 'catFur', texOpts: { repeat: 3, light: '#d8d1c4' }, color: 0xd9d3c8, rough: 0.9
    });
    var pink = cmat('catNose', { color: 0xc98a86, rough: 0.5 });
    var dark = cmat('catPad', { color: 0x2e2a27, rough: 0.7 });

    R.p = {
      hipX: 0, hipY: 0.235 * k, hipZ: -0.115 * k,
      jawBase: 0.01, fidget: 1, bounce: 1, strideK: 1,
      lean: 0, hipSwing: 1
    };

    var root = R.root = new THREE.Group();
    root.name = 'kernel';

    var hips = bindBone(R, 'hips', jt(root, 0, R.p.hipY, R.p.hipZ));
    var sp = 0.052 * k;
    var spine = bindBone(R, 'spine', jt(hips, 0, 0.006 * k, sp));
    var spineB = bindBone(R, 'spineB', jt(spine, 0, 0.004 * k, sp));
    var spineC = bindBone(R, 'spineC', jt(spineB, 0, 0.002 * k, sp));
    var chest = bindBone(R, 'chest', jt(spineC, 0, 0.000, sp));
    var neck = bindBone(R, 'neck', jt(chest, 0, 0.020 * k, 0.048 * k));
    var head = bindBone(R, 'head', jt(neck, 0, 0.018 * k, 0.040 * k));

    /* body: four barrels along the spine, tapering to a narrow waist */
    put(hips, gCyl6(), fur, 0, -0.004 * k, sp * 0.5, 0.058 * k, sp * 1.15, 0.062 * k, PI / 2, 0, 0);
    put(spine, gCyl6(), fur, 0, 0, sp * 0.5, 0.055 * k, sp * 1.12, 0.058 * k, PI / 2, 0, 0);
    put(spineB, gCyl6(), fur, 0, 0, sp * 0.5, 0.054 * k, sp * 1.12, 0.056 * k, PI / 2, 0, 0);
    put(spineC, gCyl6(), fur, 0, 0, sp * 0.5, 0.058 * k, sp * 1.12, 0.058 * k, PI / 2, 0, 0);
    put(chest, gCyl6(), fur, 0, 0.004 * k, 0.024 * k, 0.062 * k, 0.052 * k, 0.062 * k, PI / 2, 0, 0);
    /* pale belly */
    put(spineB, gCyl6(), furLight, 0, -0.038 * k, sp * 0.5,
      0.036 * k, sp * 2.0, 0.030 * k, PI / 2, 0, 0);

    /* neck + head */
    put(neck, gCyl6(), fur, 0, 0.004 * k, 0.020 * k, 0.040 * k, 0.048 * k, 0.042 * k, PI / 2, 0, 0);
    put(head, gSphM(), fur, 0, 0.004 * k, 0.006 * k, 0.048 * k, 0.044 * k, 0.048 * k);
    /* muzzle */
    put(head, gSphS(), fur, 0, -0.012 * k, 0.040 * k, 0.030 * k, 0.022 * k, 0.026 * k);
    put(head, gSphS(), pink, 0, -0.004 * k, 0.060 * k, 0.008 * k, 0.006 * k, 0.006 * k);
    /* whisker pads read as two small bumps, cheaper than whiskers */
    put(head, gSphS(), furLight, -0.016 * k, -0.014 * k, 0.048 * k, 0.014 * k);
    put(head, gSphS(), furLight, 0.016 * k, -0.014 * k, 0.048 * k, 0.014 * k);

    /* jaw */
    var jaw = bindBone(R, 'jaw', jt(head, 0, -0.006 * k, 0.014 * k));
    put(jaw, gBox(), fur, 0, -0.014 * k, 0.024 * k, 0.030 * k, 0.014 * k, 0.044 * k);

    /* eyes — green, with the slit iris implied by a tall dark sphere */
    var eyeW = cmat('catEyeW', { color: 0xb9c96f, rough: 0.2, emissive: 0x2b3310, emiI: 0.5 });
    var eyeI = cmat('catEyeI', { color: 0x14170f, rough: 0.15 });
    var spec = cmat('specDot', { color: 0xffffff, rough: 0.05, emissive: 0xffffff, emiI: 0.35 });
    var eyes = [];
    for (var s = -1; s <= 1; s += 2) {
      var eg = jt(head, s * 0.026 * k, 0.012 * k, 0.036 * k);
      eg.rotation.y = s * 0.35;
      var ew = put(eg, gSphS(), eyeW, 0, 0, 0, 0.014 * k, 0.013 * k, 0.010 * k);
      put(eg, gSphS(), eyeI, 0, 0, 0.006 * k, 0.0035 * k, 0.011 * k, 0.005 * k);
      var sd = put(eg, gSphS(), spec, -s * 0.004 * k, 0.004 * k, 0.010 * k, 0.0028 * k);
      R.noShadow.push(sd);
      eyes.push(ew);
    }
    R.eyes = eyes;
    R.eyeSy = 0.013 * k;

    /* ears — independently rotating, which is most of a cat's expression */
    for (s = -1; s <= 1; s += 2) {
      var en = s < 0 ? 'earL' : 'earR';
      var ear = bindBone(R, en, jt(head, s * 0.030 * k, 0.036 * k, -0.004 * k));
      ear.rotation.z = s * 0.20;
      put(ear, gCone(), fur, 0, 0.020 * k, 0, 0.022 * k, 0.042 * k, 0.012 * k);
      put(ear, gCone(), pink, 0, 0.018 * k, 0.006 * k, 0.013 * k, 0.030 * k, 0.006 * k);
    }

    /* legs. Base rotations give the digitigrade stance; clips work in deltas. */
    var sides = [['L', -1], ['R', 1]];
    for (var i = 0; i < 2; i++) {
      var n = sides[i][0], g = sides[i][1];
      /* hind */
      var th = bindBone(R, 'thigh' + n, jt(hips, g * 0.036 * k, -0.010 * k, 0.004 * k));
      put(th, gTap(), fur, 0, -0.042 * k, 0.004 * k, 0.028 * k, 0.090 * k, 0.032 * k);
      var sh = bindBone(R, 'shin' + n, jt(th, 0, -0.086 * k, 0));
      put(sh, gTap(), fur, 0, -0.042 * k, 0, 0.019 * k, 0.086 * k, 0.020 * k);
      var ft = bindBone(R, 'foot' + n, jt(sh, 0, -0.084 * k, 0));
      put(ft, gTap(), fur, 0, -0.026 * k, 0.004 * k, 0.014 * k, 0.056 * k, 0.015 * k);
      put(ft, gBox(), fur, 0, -0.052 * k, 0.016 * k, 0.024 * k, 0.014 * k, 0.040 * k);
      put(ft, gBox(), dark, 0, -0.058 * k, 0.016 * k, 0.020 * k, 0.005 * k, 0.034 * k);
      setBase(R, 'thigh' + n, -0.62, 0, 0);
      setBase(R, 'shin' + n, 1.15, 0, 0);
      setBase(R, 'foot' + n, -0.62, 0, 0);

      /* front */
      var sd2 = bindBone(R, 'shoulder' + n, jt(chest, g * 0.032 * k, -0.010 * k, 0.012 * k));
      var ua = bindBone(R, 'upperArm' + n, jt(sd2, 0, -0.004 * k, 0));
      put(ua, gTap(), fur, 0, -0.040 * k, 0, 0.022 * k, 0.082 * k, 0.024 * k);
      var fa = bindBone(R, 'foreArm' + n, jt(ua, 0, -0.080 * k, 0));
      put(fa, gTap(), fur, 0, -0.038 * k, 0, 0.015 * k, 0.078 * k, 0.016 * k);
      var pw = bindBone(R, 'hand' + n, jt(fa, 0, -0.076 * k, 0));
      put(pw, gBox(), fur, 0, -0.012 * k, 0.010 * k, 0.024 * k, 0.024 * k, 0.038 * k);
      put(pw, gBox(), dark, 0, -0.022 * k, 0.012 * k, 0.020 * k, 0.005 * k, 0.032 * k);
      setBase(R, 'upperArm' + n, 0.30, 0, 0);
      setBase(R, 'foreArm' + n, -0.36, 0, 0);
      setBase(R, 'hand' + n, 0.10, 0, 0);
    }

    /* tail: six segments, each damping toward the one in front of it */
    var parent = hips;
    var tailLen = 0.048 * k;
    for (i = 0; i < 6; i++) {
      var tn = 'tail' + i;
      var t0 = bindBone(R, tn, jt(parent, 0, i === 0 ? 0.030 * k : 0, i === 0 ? -0.030 * k : -tailLen));
      var rr = (0.016 - i * 0.0018) * k;
      put(t0, gCyl4(), fur, 0, 0, -tailLen * 0.5, rr, tailLen, rr, PI / 2, 0, 0);
      parent = t0;
      setBase(R, tn, i === 0 ? -0.35 : 0.10, 0, 0);
    }
    R.tailX = new Float64Array(6);
    R.tailY = new Float64Array(6);

    R.A.tailDriveX = -0.35;
    R.A.tailDriveY = 0;
    R.A.earTwitch = 1;
    R.A.jawDrive = 0;
    R.A.eyesShut = 0;
    R.A.earT = [0, 0];
    R.A.earNext = 1.5;
    R.A.stride = 0.42 * k;

    /* Tail follow-through, ear twitches and the slow blink, applied after the
     * clip so every clip gets them for free. */
    R.extraLayer = function (RR, dt) {
      var A = RR.A;
      var i, prevX = A.tailDriveX, prevY = A.tailDriveY;
      /* a little life even when nothing is driving it */
      prevY += Math.sin(A.t * 1.9) * 0.03;
      for (i = 0; i < 6; i++) {
        RR.tailX[i] = U.damp(RR.tailX[i], prevX * (i === 0 ? 1 : 0.80), 9 - i * 0.7, dt);
        RR.tailY[i] = U.damp(RR.tailY[i], prevY * (i === 0 ? 1 : 0.86), 8 - i * 0.6, dt);
        prevX = RR.tailX[i];
        prevY = RR.tailY[i];
        var bi = RR.idx['tail' + i];
        var b = RR.bone[bi];
        if (b) {
          b.rotation.x = RR.base[bi * 3] + RR.tailX[i];
          b.rotation.y = RR.base[bi * 3 + 1] + RR.tailY[i];
        }
      }
      /* ears: mostly still, then a sudden flick */
      A.earNext -= dt;
      if (A.earNext <= 0) {
        A.earNext = 1.2 + Math.random() * 3.4 / Math.max(0.2, A.earTwitch);
        A.earT[Math.random() < 0.5 ? 0 : 1] = 0.22;
      }
      var el = RR.bones.earL, er = RR.bones.earR;
      for (i = 0; i < 2; i++) {
        if (A.earT[i] > 0) A.earT[i] -= dt;
      }
      if (el) el.rotation.x = Math.max(0, A.earT[0]) * -3.2 + Math.sin(A.t * 0.7) * 0.03;
      if (er) er.rotation.x = Math.max(0, A.earT[1]) * -3.2 + Math.sin(A.t * 0.9 + 1) * 0.03;
      /* a sleeping cat keeps its eyes shut */
      if (A.eyesShut && RR.eyes) {
        RR.eyes[0].scale.y = RR.eyeSy * 0.10;
        RR.eyes[1].scale.y = RR.eyeSy * 0.10;
        A.blinkIn = 1.5;
      }
      A.eyesShut = 0;
      if (A.jawDrive) {
        var j = RR.bones.jaw;
        if (j) j.rotation.x += A.jawDrive * 0.22;
        A.jawDrive = 0;
      }
      /* steering */
      if (A.followTarget) catSteer(RR, dt);
    };

    var api = finish(R, { clip: opts.clip || 'catIdle' });

    api.follow = function (target) {
      R.A.followTarget = target || null;
      if (!target) R.A.catSpeed = 0;
      return api;
    };
    api.stopFollow = function () { R.A.followTarget = null; };

    return api;
  };

  /* Trot after Steve, stop at 1.2 m, sit after 4 s of standing still. */
  function catSteer(R, dt) {
    var A = R.A;
    var tgt = A.followTarget;
    if (!tgt) return;
    if (tgt.getWorldPosition) tgt.getWorldPosition(_v1);
    else if (tgt.position) _v1.copy(tgt.position);
    else return;
    var pos = R.root.position;
    _v2.set(_v1.x - pos.x, 0, _v1.z - pos.z);
    var d = _v2.length();
    /* if he was up on the warm PSU, he comes down */
    if (pos.y > 0.001) pos.y = U.damp(pos.y, 0, 3.2, dt);

    if (d > 1.2) {
      _v2.multiplyScalar(1 / d);
      var sp = U.clamp(0.85 + (d - 1.2) * 0.55, 0.6, 2.1);
      pos.x += _v2.x * sp * dt;
      pos.z += _v2.z * sp * dt;
      R.root.rotation.y = U.angleDamp(R.root.rotation.y,
        Math.atan2(_v2.x, _v2.z), 6, dt);
      A.catSpeed = sp;
      A.stillT = 0;
      A.phase += (sp / (A.stride * 2.4)) * dt;
      A.phase -= Math.floor(A.phase);
      if (A.clip !== 'catWalk') rigPlay(R, 'catWalk', { blend: 0.2 });
    } else {
      A.catSpeed = 0;
      A.stillT += dt;
      if (A.clip === 'catWalk') rigPlay(R, 'catIdle', { blend: 0.28 });
      if (A.stillT > 4 && A.clip === 'catIdle') rigPlay(R, 'catSit', { blend: 0.45 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Debug / housekeeping                                                */
  /* ------------------------------------------------------------------ */

  CH.__flush = function () {
    var k;
    for (k in GEO) if (Object.prototype.hasOwnProperty.call(GEO, k)) delete GEO[k];
    for (k in MC) if (Object.prototype.hasOwnProperty.call(MC, k)) delete MC[k];
  };

  CH.__clips = function (which) {
    if (which === 'cat') return Object.keys(CAT_CLIPS);
    return Object.keys(HUMAN_CLIPS);
  };

})(window.SG, window.THREE);
