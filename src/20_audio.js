/* =====================================================================
 * 20_audio.js — SG.audio
 * 100 % synthesised Web Audio. No files, no samples, no network.
 * Oscillators, self-filled noise buffers, biquads, waveshapers, delay
 * lines and PeriodicWaves. Reverb is a hand-built Schroeder/FDN room.
 *
 * Everything degrades to silence: if there is no AudioContext the game
 * stays fully playable and every entry point returns a harmless stub.
 * ===================================================================== */
(function (SG) {
  'use strict';

  var A = SG.audio = SG.audio || {};
  var U = SG.util || {};

  var clamp = U.clamp || function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var W = (typeof window !== 'undefined') ? window : null;
  var ACtor = W && (W.AudioContext || W.webkitAudioContext);

  var ctx = null;
  var ok = false;              /* context exists and the graph is built */
  var dead = false;            /* construction failed — never try again */
  var buses = null;            /* {master, music, sfx, voice, amb} GainNodes */
  var masterGain = null, compNode = null, clipNode = null;
  var revIn = null, revReturn = null;
  var NOISE = {};              /* white / pink / brown, built once */
  var WAVES = {};              /* PeriodicWaves, built once */
  var active = [];             /* live one-shot handles */
  var MAXVOICES = 24;
  var ducked = false;
  var levels = { master: 0.85, music: 0.55, sfx: 0.9, voice: 1.0 };
  var pendingMusic;            /* music asked for before init() */
  var pendingAmb;

  var STUB = {
    stop: function () {}, setVolume: function () {}, setPosition: function () {},
    dur: 0, name: '', silent: true
  };

  /* ------------------------------------------------------------------ */
  /* Master chain                                                        */
  /* ------------------------------------------------------------------ */

  function softClipCurve(k) {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return c;
  }

  function fillNoise() {
    var sr = ctx.sampleRate || 44100;
    var len = Math.floor(sr * 2.5);

    var wb = ctx.createBuffer(1, len, sr);
    var w = wb.getChannelData(0);
    var i;
    for (i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    NOISE.white = wb;

    /* Pink — Paul Kellet's economical filter bank. */
    var pb = ctx.createBuffer(1, len, sr);
    var p = pb.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (i = 0; i < len; i++) {
      var white = w[i];
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      if (p[i] > 1) p[i] = 1; else if (p[i] < -1) p[i] = -1;
    }
    NOISE.pink = pb;

    /* Brown — leaky integration of white. */
    var bb = ctx.createBuffer(1, len, sr);
    var br = bb.getChannelData(0);
    var last = 0;
    for (i = 0; i < len; i++) {
      last = (last + 0.02 * w[i]) / 1.02;
      br[i] = last * 3.5;
      if (br[i] > 1) br[i] = 1; else if (br[i] < -1) br[i] = -1;
    }
    NOISE.brown = bb;
  }

  function pulseWave(duty, n) {
    var real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
    for (var i = 1; i <= n; i++) {
      imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
    }
    return ctx.createPeriodicWave(real, imag);
  }

  function harmWave(amps) {
    var n = amps.length;
    var real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
    for (var i = 0; i < n; i++) imag[i + 1] = amps[i];
    return ctx.createPeriodicWave(real, imag);
  }

  function buildWaves() {
    WAVES.pulse25 = pulseWave(0.25, 24);
    WAVES.pulse12 = pulseWave(0.12, 28);
    WAVES.reed = harmWave([1, 0.62, 0.42, 0.30, 0.22, 0.15, 0.10, 0.07]);
    WAVES.organ = harmWave([1, 0.0, 0.5, 0.0, 0.28, 0.0, 0.16]);
    WAVES.rhodes = harmWave([1, 0.28, 0.11, 0.05, 0.02]);
  }

  function allpass(input, time, g) {
    var d = ctx.createDelay(0.2); d.delayTime.value = time;
    var fb = ctx.createGain(); fb.gain.value = g;
    var ff = ctx.createGain(); ff.gain.value = -g;
    var out = ctx.createGain(); out.gain.value = 1;
    input.connect(d);
    input.connect(ff); ff.connect(out);
    d.connect(fb); fb.connect(d);
    d.connect(out);
    return out;
  }

  /* A small feedback-delay room: predelay -> 4 damped combs -> 2 allpass. */
  function buildReverb(dest) {
    revIn = ctx.createGain(); revIn.gain.value = 1;
    var pre = ctx.createDelay(0.25); pre.delayTime.value = 0.013;
    revIn.connect(pre);

    var sum = ctx.createGain(); sum.gain.value = 0.26;
    var times = [0.0297, 0.0371, 0.0411, 0.0437];
    var fbs = [0.805, 0.792, 0.783, 0.771];
    for (var i = 0; i < times.length; i++) {
      var d = ctx.createDelay(0.5); d.delayTime.value = times[i];
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.5;
      var g = ctx.createGain(); g.gain.value = fbs[i];
      pre.connect(d);
      d.connect(lp); lp.connect(g); g.connect(d);
      d.connect(sum);
    }
    var node = allpass(sum, 0.00507, 0.7);
    node = allpass(node, 0.00169, 0.7);

    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 180;
    node.connect(hp);

    revReturn = ctx.createGain(); revReturn.gain.value = 0.85;
    hp.connect(revReturn);
    revReturn.connect(dest);
  }

  function applyBus(name) {
    if (!ok) return;
    var g = buses[name];
    if (!g) return;
    var v = levels[name];
    if (v === undefined) v = 1;
    if ((name === 'music' || name === 'sfx') && ducked) v *= 0.251;  /* -12 dB */
    var t = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(v, t, 0.04);
    } catch (e) { g.gain.value = v; }
  }

  function readSettings() {
    var s = SG.state && SG.state.settings;
    if (!s) return;
    if (typeof s.master === 'number') levels.master = s.master;
    if (typeof s.music === 'number') levels.music = s.music;
    if (typeof s.sfx === 'number') levels.sfx = s.sfx;
    if (typeof s.voice === 'number') levels.voice = s.voice;
  }

  /* ------------------------------------------------------------------ */
  /* init                                                                */
  /* ------------------------------------------------------------------ */

  A.init = function () {
    if (dead) return false;
    if (ok) { A.resume(); return true; }
    if (!ACtor) { dead = true; return false; }

    try {
      ctx = new ACtor();
    } catch (e) { ctx = null; }
    if (!ctx) { dead = true; return false; }

    try {
      readSettings();

      masterGain = ctx.createGain();
      masterGain.gain.value = levels.master;

      compNode = ctx.createDynamicsCompressor();
      compNode.threshold.value = -14;
      compNode.knee.value = 10;
      compNode.ratio.value = 3;
      compNode.attack.value = 0.006;
      compNode.release.value = 0.22;

      clipNode = ctx.createWaveShaper();
      clipNode.curve = softClipCurve(1.6);
      clipNode.oversample = '2x';

      masterGain.connect(compNode);
      compNode.connect(clipNode);
      clipNode.connect(ctx.destination);

      buses = {};
      ['music', 'sfx', 'voice', 'amb'].forEach(function (n) {
        var g = ctx.createGain();
        g.gain.value = levels[n] === undefined ? 1 : levels[n];
        g.connect(masterGain);
        buses[n] = g;
      });
      buses.master = masterGain;
      /* the ambience bed rides under the sfx level */
      buses.amb.gain.value = (levels.sfx === undefined ? 0.9 : levels.sfx) * 0.9;

      fillNoise();
      buildWaves();
      buildReverb(masterGain);

      ok = true;
      A.ctx = ctx;
      A.buses = buses;

      applyBus('music'); applyBus('sfx'); applyBus('voice');
    } catch (e2) {
      ok = false; dead = true;
      if (W && W.console) W.console.warn('[audio] init failed', e2);
      return false;
    }

    A.resume();

    if (W && W.document) {
      W.document.addEventListener('visibilitychange', function () {
        if (!W.document.hidden) A.resume();
      }, false);
    }

    if (pendingMusic !== undefined) { var pm = pendingMusic; pendingMusic = undefined; A.music(pm); }
    if (pendingAmb !== undefined) { var pa = pendingAmb; pendingAmb = undefined; A.ambience(pa); }
    return true;
  };

  A.resume = function () {
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* nothing to do */ }
    }
  };

  A.isReady = function () { return !!ok; };
  A.ctx = null;
  A.buses = null;

  /* ------------------------------------------------------------------ */
  /* Rig — the little synth toolkit every SFX is written against         */
  /* ------------------------------------------------------------------ */

  function Rig(t0, out, opts, dur, loop, rate) {
    this.t = t0;
    this.out = out;
    this.opt = opts || {};
    this.dur = dur;
    this.loop = !!loop;
    this.rate = rate || 1;
    this.end = t0 + 0.05;
    this.srcs = [];
    this.nodes = [];
    this._rv = null;
  }

  Rig.prototype.hz = function (f) { return f * this.rate; };

  Rig.prototype.mark = function (t) { if (t > this.end) this.end = t; return t; };

  Rig.prototype.g = function (v, dest) {
    var g = ctx.createGain();
    g.gain.value = v === undefined ? 1 : v;
    if (dest !== null) g.connect(dest || this.out);
    this.nodes.push(g);
    return g;
  };

  Rig.prototype.f = function (type, freq, q, dest) {
    var b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = clamp(freq, 10, 21000);
    if (q !== undefined) b.Q.value = q;
    if (dest) b.connect(dest);
    this.nodes.push(b);
    return b;
  };

  Rig.prototype.osc = function (type, freq, dest) {
    var o = ctx.createOscillator();
    if (WAVES[type]) o.setPeriodicWave(WAVES[type]);
    else o.type = type;
    o.frequency.value = clamp(freq, 0.01, 21000);
    if (dest) o.connect(dest);
    this.srcs.push(o);
    return o;
  };

  Rig.prototype.n = function (kind, dest, rate) {
    var s = ctx.createBufferSource();
    s.buffer = NOISE[kind] || NOISE.white;
    s.loop = true;
    s.playbackRate.value = rate || 1;
    if (dest) s.connect(dest);
    this.srcs.push(s);
    return s;
  };

  /* envelope: pts = [[dt, value, mode]] mode 's' set | 'l' linear | 'e' exp */
  Rig.prototype.e = function (param, t, pts) {
    for (var i = 0; i < pts.length; i++) {
      var when = t + pts[i][0];
      var v = pts[i][1];
      var m = pts[i][2] || (i === 0 ? 's' : 'l');
      try {
        if (m === 's') param.setValueAtTime(v, when);
        else if (m === 'e') param.exponentialRampToValueAtTime(Math.max(1e-5, v), when);
        else param.linearRampToValueAtTime(v, when);
      } catch (err) { /* param out of range on old Safari */ }
    }
    this.mark(t + pts[pts.length - 1][0]);
    return param;
  };

  Rig.prototype.p = function (src, t, dur, off) {
    try {
      if (off === undefined) src.start(t); else src.start(t, off);
      src.stop(t + dur);
    } catch (e) { /* already started */ }
    this.mark(t + dur);
    return src;
  };

  /* start a source that lives as long as the instance does */
  Rig.prototype.go = function (src, off) {
    var t = this.t;
    try {
      if (off === undefined) src.start(t); else src.start(t, off);
      if (!this.loop) src.stop(t + this.dur + 0.25);
    } catch (e) { /* noop */ }
    this.mark(t + (this.loop ? 1 : this.dur + 0.25));
    return src;
  };

  /* decaying partial */
  Rig.prototype.ping = function (freq, t, dur, peak, type, dest) {
    var g = this.g(0, dest || this.out);
    var o = this.osc(type || 'sine', this.hz(freq), g);
    this.e(g.gain, t, [[0, 0, 's'], [0.004, peak], [dur, 0.0001, 'e']]);
    this.p(o, t, dur + 0.02);
    return g;
  };

  /* filtered noise burst */
  Rig.prototype.burst = function (t, dur, o) {
    o = o || {};
    var g = this.g(0, o.dest || this.out);
    var f = this.f(o.type || 'bandpass', this.hz(o.freq === undefined ? 1200 : o.freq),
      o.q === undefined ? 1 : o.q, g);
    var n = this.n(o.kind || 'white', f, o.rate || 1);
    var peak = o.peak === undefined ? 0.5 : o.peak;
    this.e(g.gain, t, [[0, 0, 's'], [o.atk || 0.004, peak], [dur, 0.0001, 'e']]);
    this.p(n, t, dur + 0.03, Math.random() * 2);
    return { g: g, f: f, n: n };
  };

  /* amplitude modulation gate: returns the gain node to route audio through */
  Rig.prototype.am = function (dest, freq, depth, type, dur) {
    var g = this.g(clamp(1 - depth, 0, 1), dest);
    var lfo = this.osc(type || 'sine', freq, null);
    var la = ctx.createGain();
    la.gain.value = depth;
    lfo.connect(la);
    la.connect(g.gain);
    this.nodes.push(la);
    if (this.loop || dur === undefined) this.go(lfo);
    else this.p(lfo, this.t, dur);
    return g;
  };

  /* sustained envelope helper for beds and loops */
  Rig.prototype.sus = function (param, peak, atk, rel) {
    var t = this.t, d = this.dur;
    atk = atk === undefined ? 0.18 : atk;
    rel = rel === undefined ? 0.30 : rel;
    this.e(param, t, [[0, 0.0001, 's'], [atk, peak, 'e']]);
    if (!this.loop) {
      var hold = Math.max(atk + 0.01, d - rel);
      this.e(param, t, [[hold, peak, 's'], [d, 0.0001, 'e']]);
    }
    return param;
  };

  Rig.prototype.rv = function (amt) {
    if (!revIn || this._rv) return this._rv;
    var s = ctx.createGain();
    s.gain.value = amt;
    this.out.connect(s);
    s.connect(revIn);
    this.nodes.push(s);
    this._rv = s;
    return s;
  };

  /* ------------------------------------------------------------------ */
  /* SFX definitions                                                     */
  /* ------------------------------------------------------------------ */

  var SFX = {};
  function def(name, o) { SFX[name] = o; }

  /* ---- doors ---- */

  def('doorChime', {
    dur: 3.4, gain: 0.55, tonal: true, rev: 0.45,
    build: function (R) {
      /* Two struck bars a major sixth apart. Inharmonic partials, real tail. */
      var strike = function (t, f0, amp) {
        var parts = [1, 2.76, 5.40, 8.93, 13.3];
        var amps = [1, 0.42, 0.22, 0.11, 0.05];
        var decs = [1.9, 1.25, 0.9, 0.6, 0.35];
        var body = R.g(1, R.out);
        var lp = R.f('lowpass', R.hz(7200), 0.7, body);
        for (var i = 0; i < parts.length; i++) {
          var det = 1 + (i * 0.0013);
          R.ping(f0 * parts[i] * det, t, decs[i], amp * amps[i], 'sine', lp);
        }
        /* hammer contact */
        R.burst(t, 0.035, { dest: lp, freq: 3200, q: 1.2, peak: amp * 0.35, atk: 0.001 });
      };
      strike(R.t, 880, 0.42);              /* A5 */
      strike(R.t + 0.42, 523.25, 0.34);    /* C5 — a major sixth below */
      R.rv(0.5);
      R.mark(R.t + 3.3);
    }
  });

  def('doorOpen', {
    dur: 1.0, gain: 0.6,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.05, { freq: 2600, q: 1.4, peak: 0.30, kind: 'white', atk: 0.001 });
      /* hinge creak: a thin resonant band drifting up */
      var g = R.g(0, R.out);
      var bp = R.f('bandpass', R.hz(520), 9, g);
      R.e(bp.frequency, t + 0.05, [[0, R.hz(500), 's'], [0.5, R.hz(880), 'e']]);
      var n = R.n('pink', bp, 0.7);
      R.e(g.gain, t, [[0.05, 0.0001, 's'], [0.16, 0.22], [0.42, 0.14], [0.62, 0.0001, 'e']]);
      R.p(n, t + 0.04, 0.62, Math.random());
      /* body swing */
      R.ping(96, t + 0.02, 0.28, 0.16, 'sine');
      R.rv(0.18);
    }
  });

  def('doorClose', {
    dur: 0.9, gain: 0.7,
    build: function (R) {
      var t = R.t;
      /* air */
      var a = R.burst(t, 0.22, { freq: 900, q: 0.8, peak: 0.16, kind: 'brown', atk: 0.06 });
      R.e(a.f.frequency, t, [[0, R.hz(1400), 's'], [0.22, R.hz(360), 'e']]);
      /* wood thump */
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(700), 1.1, g);
      var o = R.osc('sine', R.hz(120), lp);
      R.e(o.frequency, t + 0.2, [[0, R.hz(130), 's'], [0.12, R.hz(78), 'e']]);
      R.e(g.gain, t, [[0.2, 0, 's'], [0.206, 0.55], [0.42, 0.0001, 'e']]);
      R.p(o, t + 0.19, 0.3);
      R.burst(t + 0.2, 0.07, { freq: 1800, q: 0.9, peak: 0.28, atk: 0.001 });
      /* latch */
      R.burst(t + 0.29, 0.03, { freq: 3400, q: 2, peak: 0.22, atk: 0.001 });
      R.ping(2100, t + 0.29, 0.06, 0.12);
      R.rv(0.2);
    }
  });

  def('doorSteel', {
    dur: 1.8, gain: 0.7, rev: 0.4,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.09, { freq: 1500, q: 0.7, peak: 0.5, atk: 0.001, kind: 'white' });
      var parts = [118, 183, 271, 394, 617, 941];
      var amps = [0.34, 0.24, 0.18, 0.12, 0.08, 0.05];
      var decs = [1.1, 0.9, 0.72, 0.55, 0.38, 0.26];
      for (var i = 0; i < parts.length; i++) {
        R.ping(parts[i] * (1 + i * 0.002), t, decs[i], amps[i]);
      }
      /* slab settling */
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(240), 1.4, g);
      var o = R.osc('sine', R.hz(62), lp);
      R.e(g.gain, t, [[0, 0, 's'], [0.01, 0.4], [0.5, 0.0001, 'e']]);
      R.p(o, t, 0.52);
      R.rv(0.45);
    }
  });

  /* ---- footsteps: four genuinely different surfaces ---- */

  def('footstepCarpet', {
    dur: 0.3, gain: 0.55,
    build: function (R) {
      var t = R.t + rnd(0, 0.012);
      R.burst(t, 0.10, { kind: 'brown', type: 'lowpass', freq: rnd(700, 950), q: 0.9, peak: 0.42, atk: 0.004 });
      R.burst(t, 0.05, { kind: 'pink', type: 'bandpass', freq: rnd(1600, 2200), q: 1.1, peak: 0.10, atk: 0.002 });
      var g = R.g(0, R.out);
      var o = R.osc('sine', R.hz(rnd(64, 76)), g);
      R.e(g.gain, t, [[0, 0, 's'], [0.008, 0.20], [0.12, 0.0001, 'e']]);
      R.p(o, t, 0.14);
    }
  });

  def('footstepTile', {
    dur: 0.34, gain: 0.5, rev: 0.22,
    build: function (R) {
      var t = R.t + rnd(0, 0.012);
      R.burst(t, 0.035, { type: 'highpass', freq: rnd(2000, 2600), peak: 0.34, atk: 0.001 });
      R.burst(t, 0.09, { type: 'bandpass', freq: rnd(3200, 4200), q: 3.5, peak: 0.22, atk: 0.001 });
      R.ping(rnd(150, 190), t, 0.09, 0.16);
      R.ping(rnd(880, 1000), t, 0.06, 0.09);
      R.rv(0.25);
    }
  });

  def('footstepMetal', {
    dur: 0.5, gain: 0.5, rev: 0.3,
    build: function (R) {
      var t = R.t + rnd(0, 0.012);
      R.burst(t, 0.03, { type: 'highpass', freq: 2400, peak: 0.3, atk: 0.001 });
      var base = rnd(0.94, 1.06);
      R.ping(880 * base, t, 0.26, 0.16);
      R.ping(1387 * base, t, 0.19, 0.11);
      R.ping(2190 * base, t, 0.13, 0.07);
      R.ping(150 * base, t, 0.12, 0.14);
      R.rv(0.3);
    }
  });

  def('footstepGravel', {
    dur: 0.36, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var n = 5 + Math.floor(Math.random() * 5);
      for (var i = 0; i < n; i++) {
        var ti = t + Math.pow(Math.random(), 1.4) * 0.11;
        R.burst(ti, rnd(0.012, 0.035), {
          type: 'bandpass', freq: rnd(1800, 6000), q: rnd(1.5, 4),
          peak: rnd(0.08, 0.24), atk: 0.001
        });
      }
      R.burst(t, 0.09, { kind: 'brown', type: 'lowpass', freq: 500, peak: 0.24, atk: 0.004 });
    }
  });

  /* ---- bench work ---- */

  def('screwdriver', {
    dur: 0.7, gain: 0.5, sustain: true,
    build: function (R) {
      /* ratchet: pink noise gated by a square LFO, plus a friction bed */
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.5, 0.02, 0.06);
      var gate = R.am(body, R.hz(17), 0.85, 'square');
      var bp = R.f('bandpass', R.hz(1750), 3.2, gate);
      var n = R.n('pink', bp, 1);
      R.go(n, Math.random());
      var lo = R.f('lowpass', R.hz(320), 1.2, body);
      var n2 = R.n('brown', lo, 1);
      R.go(n2, Math.random());
      R.ping(210, R.t, 0.12, 0.08);
    }
  });

  def('screwDrop', {
    dur: 0.6, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var hits = [0, 0.062, 0.145, 0.26];
      for (var i = 0; i < hits.length; i++) {
        var a = 0.28 * Math.pow(0.6, i);
        var ti = t + hits[i] + rnd(-0.004, 0.004);
        R.ping(rnd(3000, 3400), ti, 0.055, a);
        R.ping(rnd(4600, 5100), ti, 0.04, a * 0.7);
        R.ping(rnd(6100, 6600), ti, 0.03, a * 0.4);
        R.burst(ti, 0.012, { type: 'highpass', freq: 4000, peak: a * 0.5, atk: 0.001 });
      }
      R.ping(140, t, 0.08, 0.10);
      R.rv(0.16);
    }
  });

  def('caseOpen', {
    dur: 0.85, gain: 0.55,
    build: function (R) {
      var t = R.t;
      var b = R.burst(t + 0.05, 0.45, { kind: 'pink', freq: 900, q: 4.5, peak: 0.24, atk: 0.05 });
      R.e(b.f.frequency, t + 0.05, [[0, R.hz(820), 's'], [0.42, R.hz(2500), 'e']]);
      R.burst(t, 0.03, { type: 'highpass', freq: 2800, peak: 0.26, atk: 0.001 });
      R.ping(430, t + 0.5, 0.22, 0.10);
      R.ping(690, t + 0.5, 0.16, 0.07);
    }
  });

  def('caseClose', {
    dur: 0.9, gain: 0.6,
    build: function (R) {
      var t = R.t;
      var b = R.burst(t, 0.34, { kind: 'pink', freq: 2400, q: 4, peak: 0.20, atk: 0.03 });
      R.e(b.f.frequency, t, [[0, R.hz(2400), 's'], [0.32, R.hz(760), 'e']]);
      /* sheet metal boing */
      var g = R.g(0, R.out);
      var o = R.osc('triangle', R.hz(232), g);
      R.e(o.frequency, t + 0.33, [[0, R.hz(250), 's'], [0.06, R.hz(214), 'e'], [0.2, R.hz(232), 'e']]);
      R.e(g.gain, t, [[0.33, 0, 's'], [0.34, 0.20], [0.62, 0.0001, 'e']]);
      R.p(o, t + 0.32, 0.34);
      R.burst(t + 0.33, 0.04, { type: 'highpass', freq: 3000, peak: 0.3, atk: 0.001 });
      R.ping(120, t + 0.33, 0.14, 0.22);
      R.rv(0.18);
    }
  });

  def('clipSnap', {
    dur: 0.22, gain: 0.55,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.008, { type: 'highpass', freq: 3400, peak: 0.5, atk: 0.0008 });
      R.ping(2250, t, 0.045, 0.26);
      R.ping(3380, t, 0.032, 0.16);
      R.ping(900, t, 0.05, 0.10);
    }
  });

  /* ---- fans & drives ---- */

  def('fanSpin', {
    dur: 2.4, gain: 0.5, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.45, 0.35, 0.5);
      var lp = R.f('lowpass', R.hz(1400), 0.8, body);
      var n = R.n('brown', lp, 1);
      R.go(n, Math.random());
      /* resonant peak rises with rate */
      var res = R.f('bandpass', R.hz(620), 6, body);
      var n2 = R.n('pink', res, 1);
      R.go(n2, Math.random());
      /* blade-pass tone + harmonics */
      var blade = R.hz(92);
      var bg = R.g(0.05, body);
      var o1 = R.osc('sine', blade, bg);
      var o2 = R.osc('sine', blade * 2, R.g(0.03, body));
      var o3 = R.osc('sine', blade * 3, R.g(0.015, body));
      R.go(o1); R.go(o2); R.go(o3);
      /* slow wobble so it never sits perfectly still */
      var lfo = R.osc('sine', 0.23, null);
      var la = ctx.createGain(); la.gain.value = R.hz(28);
      lfo.connect(la); la.connect(res.frequency);
      R.nodes.push(la);
      R.go(lfo);
    }
  });

  def('fanWhine', {
    dur: 2.4, gain: 0.4, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.34, 0.3, 0.4);
      var res = R.f('bandpass', R.hz(2400), 12, body);
      var n = R.n('white', res, 1);
      R.go(n, Math.random());
      var wg = R.g(0.07, body);
      var o = R.osc('sine', R.hz(3120), wg);
      R.go(o);
      var o2 = R.osc('sine', R.hz(1560), R.g(0.035, body));
      R.go(o2);
      var lp = R.f('lowpass', R.hz(900), 0.9, body);
      var n2 = R.n('brown', lp, 1);
      R.go(n2, Math.random());
    }
  });

  def('hddSeek', {
    dur: 0.95, gain: 0.55,
    build: function (R) {
      var t = R.t;
      /* platter hum bed */
      var hb = R.g(0, R.out);
      var o1 = R.osc('sine', R.hz(120), hb);
      var o2 = R.osc('sine', R.hz(240), R.g(0.03, R.out));
      R.e(hb.gain, t, [[0, 0.0001, 's'], [0.05, 0.06, 'e'], [0.75, 0.05, 's'], [0.9, 0.0001, 'e']]);
      R.p(o1, t, 0.92); R.p(o2, t, 0.92);
      var wn = R.f('bandpass', R.hz(1100), 1.6, R.g(0.05, R.out));
      R.p(R.n('pink', wn, 1), t, 0.9, Math.random());
      /* clustered actuator ticks */
      var clusters = 2 + Math.floor(Math.random() * 2);
      var at = t + 0.02;
      for (var c = 0; c < clusters; c++) {
        var n = 3 + Math.floor(Math.random() * 5);
        for (var i = 0; i < n; i++) {
          var ti = at + i * rnd(0.016, 0.030);
          R.burst(ti, 0.008, {
            type: 'bandpass', freq: rnd(1600, 3000), q: 4,
            peak: rnd(0.18, 0.34), atk: 0.0006
          });
          R.ping(rnd(680, 900), ti, 0.02, 0.07);
        }
        at += n * 0.026 + rnd(0.10, 0.22);
      }
      R.rv(0.1);
    }
  });

  def('floppySeek', {
    dur: 1.15, gain: 0.55,
    build: function (R) {
      var t = R.t;
      /* the stepper grind: a gated buzz through a fixed formant */
      var burstAt = function (t0, len, stepHz) {
        var body = R.g(0, R.out);
        R.e(body.gain, t0, [[0, 0, 's'], [0.01, 0.4], [len - 0.02, 0.36], [len, 0.0001, 'e']]);
        var bp = R.f('bandpass', R.hz(1150), 4.5, body);
        var gate = R.am(bp, stepHz, 0.95, 'square', len + 0.05);
        var sq = R.osc('square', R.hz(56), gate);
        R.p(sq, t0, len + 0.02);
        var nz = R.f('bandpass', R.hz(2600), 3, body);
        var gate2 = R.am(nz, stepHz, 0.9, 'square', len + 0.05);
        R.p(R.n('white', gate2, 1), t0, len + 0.02, Math.random());
        /* motor */
        R.ping(96, t0, len * 0.9, 0.10);
      };
      burstAt(t, 0.34, 47);
      burstAt(t + 0.44, 0.20, 61);
      burstAt(t + 0.72, 0.30, 44);
      R.burst(t + 1.03, 0.03, { type: 'highpass', freq: 2500, peak: 0.16, atk: 0.001 });
      R.rv(0.08);
    }
  });

  /* ---- CRT ---- */

  def('crtOn', {
    dur: 1.9, gain: 0.6,
    build: function (R) {
      var t = R.t;
      /* degauss thunk — the coil grabbing the shadow mask */
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(420), 1.6, g);
      var o = R.osc('sine', R.hz(92), lp);
      R.e(o.frequency, t, [[0, R.hz(96), 's'], [0.22, R.hz(44), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.006, 0.6], [0.09, 0.28], [0.34, 0.0001, 'e']]);
      R.p(o, t, 0.36);
      /* magnetised shell wobble */
      var wg = R.g(0, R.out);
      var wo = R.osc('triangle', R.hz(186), wg);
      var wlfo = R.osc('sine', 18, null);
      var wla = ctx.createGain(); wla.gain.value = R.hz(14);
      wlfo.connect(wla); wla.connect(wo.frequency); R.nodes.push(wla);
      R.e(wg.gain, t, [[0, 0, 's'], [0.01, 0.18], [0.3, 0.0001, 'e']]);
      R.p(wo, t, 0.32); R.p(wlfo, t, 0.32);
      R.burst(t, 0.06, { kind: 'brown', type: 'lowpass', freq: 600, peak: 0.4, atk: 0.002 });
      /* static crackle as the tube charges */
      for (var i = 0; i < 7; i++) {
        R.burst(t + 0.05 + Math.random() * 0.5, 0.01, {
          type: 'highpass', freq: rnd(4000, 9000), peak: rnd(0.04, 0.12), atk: 0.001
        });
      }
      /* flyback whine rising in */
      var fg = R.g(0, R.out);
      var fo = R.osc('sine', 15734, fg);
      var fo2 = R.osc('sine', 31468, R.g(0.006, R.out));
      R.e(fg.gain, t, [[0.06, 0.0001, 's'], [0.55, 0.045, 'e'], [1.7, 0.035, 's'], [1.88, 0.0001, 'e']]);
      R.p(fo, t + 0.05, 1.85); R.p(fo2, t + 0.05, 1.85);
      R.rv(0.12);
    }
  });

  def('crtOff', {
    dur: 0.9, gain: 0.6,
    build: function (R) {
      var t = R.t;
      /* whine falls away */
      var fg = R.g(0.04, R.out);
      var fo = R.osc('sine', 15734, fg);
      R.e(fo.frequency, t, [[0, 15734, 's'], [0.22, 5200, 'e']]);
      R.e(fg.gain, t, [[0, 0.045, 's'], [0.24, 0.0001, 'e']]);
      R.p(fo, t, 0.26);
      /* the collapse: a bright pop into a low thunk */
      R.burst(t + 0.02, 0.05, { type: 'highpass', freq: 3000, peak: 0.30, atk: 0.001 });
      var g = R.g(0, R.out);
      var o = R.osc('sine', R.hz(140), g);
      R.e(o.frequency, t + 0.02, [[0, R.hz(150), 's'], [0.16, R.hz(52), 'e']]);
      R.e(g.gain, t, [[0.02, 0, 's'], [0.03, 0.42], [0.3, 0.0001, 'e']]);
      R.p(o, t + 0.02, 0.32);
      /* static discharge tail */
      for (var i = 0; i < 5; i++) {
        R.burst(t + 0.1 + Math.random() * 0.45, 0.008, {
          type: 'highpass', freq: rnd(5000, 11000), peak: rnd(0.03, 0.09), atk: 0.001
        });
      }
      R.rv(0.14);
    }
  });

  def('crtHum', {
    dur: 3, gain: 0.4, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.5, 0.4, 0.5);
      R.go(R.osc('sine', 15734, R.g(0.035, body)));
      R.go(R.osc('sine', 100, R.g(0.10, body)));
      R.go(R.osc('sine', 50, R.g(0.06, body)));
      R.go(R.osc('sine', 200, R.g(0.03, body)));
      var hp = R.f('highpass', 4000, 0.7, R.g(0.012, body));
      R.go(R.n('white', hp, 1), Math.random());
    }
  });

  /* ---- beeps ---- */

  def('beepPost', {
    dur: 0.26, gain: 0.5, tonal: true,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(5200), 0.8, g);
      var o = R.osc('square', R.hz(930), lp);
      R.e(g.gain, t, [[0, 0, 's'], [0.004, 0.34], [0.176, 0.34, 's'], [0.182, 0.0001, 'e']]);
      R.p(o, t, 0.19);
    }
  });

  def('beepError', {
    dur: 1.25, gain: 0.5, tonal: true,
    build: function (R) {
      var t = R.t;
      var beep = function (t0, len) {
        var g = R.g(0, R.out);
        var lp = R.f('lowpass', R.hz(5200), 0.8, g);
        var o = R.osc('square', R.hz(930), lp);
        R.e(g.gain, t0, [[0, 0, 's'], [0.004, 0.32], [len - 0.005, 0.32, 's'], [len, 0.0001, 'e']]);
        R.p(o, t0, len + 0.01);
      };
      beep(t, 0.55);                 /* one long  */
      beep(t + 0.68, 0.15);          /* two short */
      beep(t + 0.93, 0.15);
    }
  });

  def('beepConfirm', {
    dur: 0.34, gain: 0.45, tonal: true,
    build: function (R) {
      var t = R.t;
      var tone = function (t0, f, len, peak) {
        var g = R.g(0, R.out);
        var o = R.osc('triangle', R.hz(f), g);
        var o2 = R.osc('sine', R.hz(f * 2), R.g(0.25, g));
        R.e(g.gain, t0, [[0, 0, 's'], [0.006, peak], [len, 0.0001, 'e']]);
        R.p(o, t0, len + 0.01); R.p(o2, t0, len + 0.01);
      };
      tone(t, 880, 0.09, 0.28);
      tone(t + 0.085, 1320, 0.17, 0.26);
      R.rv(0.12);
    }
  });

  /* ---- desk & UI ---- */

  def('keyType', {
    dur: 0.16, gain: 0.45,
    build: function (R) {
      var t = R.t + rnd(0, 0.01);
      var j = rnd(0.94, 1.07);
      R.burst(t, 0.006, { type: 'highpass', freq: 2600 * j, peak: 0.36, atk: 0.0006 });
      R.ping(1150 * j, t, 0.035, 0.20);
      R.ping(2400 * j, t, 0.02, 0.10);
      R.ping(185 * j, t, 0.045, 0.16);
    }
  });

  def('mouseClick', {
    dur: 0.12, gain: 0.45,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.004, { type: 'highpass', freq: 3600, peak: 0.34, atk: 0.0005 });
      R.ping(2850 * rnd(0.97, 1.03), t, 0.022, 0.18);
      R.ping(1400, t, 0.018, 0.09);
    }
  });

  def('uiHover', {
    dur: 0.14, gain: 0.35, tonal: true,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(4000), 0.8, g);
      var o = R.osc('sine', R.hz(1180), lp);
      R.e(o.frequency, t, [[0, R.hz(1180), 's'], [0.06, R.hz(1240), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.005, 0.20], [0.075, 0.0001, 'e']]);
      R.p(o, t, 0.09);
    }
  });

  def('uiSelect', {
    dur: 0.24, gain: 0.4, tonal: true,
    build: function (R) {
      var t = R.t;
      var tone = function (t0, f, len, peak) {
        var g = R.g(0, R.out);
        var o = R.osc('triangle', R.hz(f), g);
        var m = R.osc('sine', R.hz(f * 3), null);
        var ma = ctx.createGain(); ma.gain.value = R.hz(f * 0.5);
        m.connect(ma); ma.connect(o.frequency); R.nodes.push(ma);
        R.e(ma.gain, t0, [[0, R.hz(f * 0.5), 's'], [len * 0.6, 1, 'e']]);
        R.e(g.gain, t0, [[0, 0, 's'], [0.004, peak], [len, 0.0001, 'e']]);
        R.p(o, t0, len + 0.01); R.p(m, t0, len + 0.01);
      };
      tone(t, 1046.5, 0.07, 0.24);
      tone(t + 0.055, 1568, 0.13, 0.20);
      R.rv(0.14);
    }
  });

  def('uiBack', {
    dur: 0.2, gain: 0.4, tonal: true,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var o = R.osc('triangle', R.hz(880), g);
      R.e(o.frequency, t, [[0, R.hz(880), 's'], [0.11, R.hz(587.3), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.005, 0.22], [0.13, 0.0001, 'e']]);
      R.p(o, t, 0.15);
    }
  });

  def('paperRustle', {
    dur: 0.7, gain: 0.45,
    build: function (R) {
      var t = R.t;
      var n = 3 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) {
        var t0 = t + i * rnd(0.09, 0.17);
        var len = rnd(0.09, 0.19);
        var b = R.burst(t0, len, {
          kind: 'white', type: 'bandpass', freq: rnd(2600, 4800), q: rnd(0.9, 1.8),
          peak: rnd(0.12, 0.26), atk: rnd(0.01, 0.03)
        });
        R.e(b.f.frequency, t0, [[0, b.f.frequency.value, 's'],
          [len, b.f.frequency.value * rnd(0.7, 1.4), 'e']]);
      }
    }
  });

  def('briefcaseLatch', {
    dur: 0.5, gain: 0.55,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.006, { type: 'highpass', freq: 4200, peak: 0.5, atk: 0.0005 });
      R.ping(1820, t, 0.20, 0.26);
      R.ping(2930, t, 0.14, 0.16);
      R.ping(4610, t, 0.08, 0.08);
      R.ping(430, t, 0.09, 0.14);
      /* spring buzz */
      var g = R.g(0, R.out);
      var bp = R.f('bandpass', R.hz(3100), 8, g);
      R.p(R.n('white', bp, 1), t + 0.005, 0.12, Math.random());
      R.e(g.gain, t, [[0.005, 0.14, 's'], [0.11, 0.0001, 'e']]);
      R.rv(0.2);
    }
  });

  def('phoneVibrate', {
    dur: 1.8, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var buzz = function (t0, len) {
        var body = R.g(0, R.out);
        R.e(body.gain, t0, [[0, 0, 's'], [0.02, 0.4], [len - 0.03, 0.36], [len, 0.0001, 'e']]);
        var lp = R.f('lowpass', R.hz(420), 1.1, body);
        var gate = R.am(lp, 41, 0.75, 'square', len + 0.05);
        var o = R.osc('sine', R.hz(58), gate);
        var o2 = R.osc('sine', R.hz(119), R.g(0.5, gate));
        R.p(o, t0, len + 0.02); R.p(o2, t0, len + 0.02);
        /* the desk rattling back */
        var rn = R.f('bandpass', R.hz(1500), 2.5, R.g(0.10, body));
        var gate2 = R.am(rn, 41, 0.9, 'square', len + 0.05);
        R.p(R.n('white', gate2, 1), t0, len + 0.02, Math.random());
      };
      buzz(t, 0.42);
      buzz(t + 0.62, 0.42);
      buzz(t + 1.24, 0.42);
    }
  });

  def('phoneRing', {
    dur: 2.0, gain: 0.5, tonal: true,
    build: function (R) {
      var t = R.t;
      var ring = function (t0, len) {
        var body = R.g(0, R.out);
        R.e(body.gain, t0, [[0, 0, 's'], [0.01, 0.28], [len - 0.02, 0.26], [len, 0.0001, 'e']]);
        var lp = R.f('lowpass', R.hz(4200), 0.8, body);
        var trill = R.am(lp, 20, 0.9, 'square', len + 0.05);
        R.p(R.osc('sine', R.hz(1000), trill), t0, len + 0.02);
        R.p(R.osc('sine', R.hz(1250), R.g(0.8, trill)), t0, len + 0.02);
      };
      ring(t, 0.42);
      ring(t + 0.62, 0.42);
      ring(t + 1.3, 0.42);
      R.rv(0.16);
    }
  });

  def('zipperPull', {
    dur: 0.6, gain: 0.45,
    build: function (R) {
      var t = R.t;
      var body = R.g(0, R.out);
      R.e(body.gain, t, [[0, 0, 's'], [0.02, 0.32], [0.4, 0.28], [0.46, 0.0001, 'e']]);
      var bp = R.f('bandpass', R.hz(3000), 2.2, body);
      var gate = R.am(bp, 55, 0.9, 'square', 0.5);
      /* the gate rate climbs as the slider speeds up */
      var lfo = gate;
      R.p(R.n('white', bp, 1), t, 0.48, Math.random());
      void lfo;
      R.ping(220, t, 0.1, 0.05);
    }
  });

  /* ---- Kernel the cat: this one matters ---- */

  def('catMeow', {
    dur: 1.0, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var body = R.g(0, R.out);
      var jitter = rnd(0.92, 1.09);

      /* source: a bright saw with a hand-drawn pitch arc + vibrato */
      var src = R.g(1, null);
      var o = R.osc('sawtooth', R.hz(360 * jitter), src);
      R.e(o.frequency, t, [
        [0, R.hz(340 * jitter), 's'],
        [0.10, R.hz(620 * jitter), 'e'],
        [0.30, R.hz(560 * jitter), 'e'],
        [0.62, R.hz(300 * jitter), 'e']
      ]);
      var vib = R.osc('sine', rnd(5.4, 7.2), null);
      var vibA = ctx.createGain(); vibA.gain.value = R.hz(22 * jitter);
      vib.connect(vibA); vibA.connect(o.frequency); R.nodes.push(vibA);

      /* three formants make it a voice rather than a buzzer */
      var fs = [[820, 6, 1.0], [1980, 8, 0.5], [3100, 9, 0.22]];
      for (var i = 0; i < fs.length; i++) {
        var bp = R.f('bandpass', R.hz(fs[i][0] * jitter), fs[i][1], R.g(fs[i][2], body));
        src.connect(bp);
      }
      var thru = R.f('lowpass', R.hz(1400), 0.7, R.g(0.22, body));
      src.connect(thru);

      /* breath */
      var br = R.f('bandpass', R.hz(2400), 1.4, R.g(0.05, body));
      R.p(R.n('pink', br, 1), t, 0.6, Math.random());

      R.e(body.gain, t, [
        [0, 0, 's'], [0.05, 0.34], [0.28, 0.30], [0.5, 0.22], [0.72, 0.0001, 'e']
      ]);
      R.p(o, t, 0.74); R.p(vib, t, 0.74);
      R.rv(0.16);
    }
  });

  def('catPurr', {
    dur: 2.2, gain: 0.55, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.55, 0.3, 0.45);
      /* amplitude-modulated brown noise at ~26 Hz — the actual purr rate */
      var am = R.am(body, 26, 0.85, 'sine');
      var lp = R.f('lowpass', R.hz(340), 1.3, am);
      R.go(R.n('brown', lp, 1), Math.random());
      /* the chest tone under it */
      var tone = R.am(R.g(0.45, body), 26, 0.8, 'sine');
      R.go(R.osc('sine', R.hz(48), tone));
      R.go(R.osc('sine', R.hz(96), R.g(0.35, tone)));
      /* breathing drift */
      var slow = R.osc('sine', 0.28, null);
      var sa = ctx.createGain(); sa.gain.value = 0.14;
      slow.connect(sa); sa.connect(body.gain); R.nodes.push(sa);
      R.go(slow);
    }
  });

  def('catJump', {
    dur: 0.5, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var o = R.osc('sine', R.hz(90), g);
      R.e(o.frequency, t, [[0, R.hz(96), 's'], [0.12, R.hz(48), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.006, 0.30], [0.2, 0.0001, 'e']]);
      R.p(o, t, 0.22);
      R.burst(t, 0.06, { kind: 'brown', type: 'lowpass', freq: 700, peak: 0.2, atk: 0.003 });
      /* claws on the bench */
      for (var i = 0; i < 4; i++) {
        R.burst(t + 0.02 + Math.random() * 0.1, 0.01, {
          type: 'bandpass', freq: rnd(3500, 6500), q: 3, peak: rnd(0.05, 0.12), atk: 0.001
        });
      }
    }
  });

  /* ---- kitchen counter ---- */

  def('coffeePour', {
    dur: 2.6, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var body = R.g(0, R.out);
      R.e(body.gain, t, [[0, 0, 's'], [0.12, 0.34], [2.0, 0.30], [2.35, 0.0001, 'e']]);
      var bp = R.f('bandpass', R.hz(1600), 1.1, body);
      R.p(R.n('white', bp, 1), t, 2.4, Math.random());
      /* the vessel note rising as it fills */
      var res = R.f('bandpass', R.hz(700), 7, R.g(0.5, body));
      R.e(res.frequency, t, [[0, R.hz(700), 's'], [2.2, R.hz(1500), 'e']]);
      R.p(R.n('pink', res, 1), t, 2.4, Math.random());
      /* bubbles */
      for (var i = 0; i < 16; i++) {
        var ti = t + 0.15 + Math.random() * 2.0;
        var g = R.g(0, body);
        var o = R.osc('sine', rnd(600, 1600), g);
        R.e(o.frequency, ti, [[0, o.frequency.value, 's'], [0.035, o.frequency.value * 1.7, 'e']]);
        R.e(g.gain, ti, [[0, 0, 's'], [0.003, rnd(0.03, 0.09)], [0.045, 0.0001, 'e']]);
        R.p(o, ti, 0.05);
      }
    }
  });

  def('sipDrink', {
    dur: 1.0, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var body = R.g(0, R.out);
      R.e(body.gain, t, [[0, 0, 's'], [0.06, 0.26], [0.3, 0.20], [0.42, 0.0001, 'e']]);
      var bp = R.f('bandpass', R.hz(420), 5, body);
      R.e(bp.frequency, t, [[0, R.hz(400), 's'], [0.36, R.hz(1250), 'e']]);
      R.p(R.n('white', bp, 1), t, 0.42, Math.random());
      /* swallow */
      var g = R.g(0, R.out);
      var o = R.osc('sine', R.hz(180), g);
      R.e(o.frequency, t + 0.5, [[0, R.hz(210), 's'], [0.12, R.hz(120), 'e']]);
      R.e(g.gain, t, [[0.5, 0, 's'], [0.53, 0.16], [0.68, 0.0001, 'e']]);
      R.p(o, t + 0.49, 0.22);
      R.burst(t + 0.5, 0.07, { kind: 'brown', type: 'lowpass', freq: 600, peak: 0.12, atk: 0.02 });
    }
  });

  def('cashRegister', {
    dur: 1.9, gain: 0.5, rev: 0.25,
    build: function (R) {
      var t = R.t;
      /* bell */
      R.ping(1810, t, 1.05, 0.24);
      R.ping(2712, t, 0.72, 0.14);
      R.ping(4380, t, 0.4, 0.06);
      R.burst(t, 0.02, { type: 'highpass', freq: 4000, peak: 0.22, atk: 0.001 });
      /* drawer slide + clunk */
      var b = R.burst(t + 0.12, 0.3, { kind: 'pink', freq: 1100, q: 1.6, peak: 0.18, atk: 0.04 });
      R.e(b.f.frequency, t + 0.12, [[0, R.hz(900), 's'], [0.28, R.hz(1900), 'e']]);
      R.ping(160, t + 0.42, 0.16, 0.24);
      R.burst(t + 0.42, 0.05, { type: 'lowpass', freq: 900, peak: 0.26, atk: 0.002 });
      R.rv(0.28);
    }
  });

  def('clockTick', {
    dur: 0.1, gain: 0.4,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.005, { type: 'highpass', freq: 3000, peak: 0.30, atk: 0.0005 });
      R.ping(2250 * rnd(0.98, 1.02), t, 0.028, 0.16);
      R.ping(900, t, 0.02, 0.07);
    }
  });

  /* ---- hotel ---- */

  def('elevatorDing', {
    dur: 2.2, gain: 0.5, tonal: true, rev: 0.4,
    build: function (R) {
      var t = R.t;
      R.ping(1318.5, t, 1.5, 0.26);
      R.ping(2637, t, 0.9, 0.10);
      R.ping(3980, t, 0.5, 0.04);
      R.ping(1318.5 * 2.76, t, 0.3, 0.03);
      R.burst(t, 0.012, { type: 'highpass', freq: 5000, peak: 0.14, atk: 0.001 });
      R.rv(0.45);
    }
  });

  def('elevatorMotor', {
    dur: 3.2, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.45, 0.5, 0.8);
      var lp = R.f('lowpass', R.hz(380), 1.0, body);
      R.go(R.n('brown', lp, 1), Math.random());
      R.go(R.osc('sine', R.hz(46), R.g(0.22, body)));
      /* gear whine with a slow vibrato */
      var wg = R.g(0.05, body);
      var w = R.osc('sawtooth', R.hz(318), R.f('bandpass', R.hz(318), 6, wg));
      var lfo = R.osc('sine', 3.1, null);
      var la = ctx.createGain(); la.gain.value = 3.5;
      lfo.connect(la); la.connect(w.frequency); R.nodes.push(la);
      R.go(w); R.go(lfo);
      /* cable rub */
      var bp = R.f('bandpass', R.hz(1400), 2, R.g(0.05, body));
      R.go(R.n('pink', bp, 1), Math.random());
    }
  });

  def('badgeAccept', {
    dur: 0.55, gain: 0.5, tonal: true,
    build: function (R) {
      var t = R.t;
      /* relay first, then the polite pair of beeps */
      R.burst(t, 0.006, { type: 'bandpass', freq: 1800, q: 2, peak: 0.22, atk: 0.0006 });
      var tone = function (t0, f, len) {
        var g = R.g(0, R.out);
        var o = R.osc('sine', R.hz(f), g);
        var o2 = R.osc('triangle', R.hz(f), R.g(0.2, g));
        R.e(g.gain, t0, [[0, 0, 's'], [0.005, 0.26], [len, 0.0001, 'e']]);
        R.p(o, t0, len + 0.01); R.p(o2, t0, len + 0.01);
      };
      tone(t + 0.03, 1568, 0.09);
      tone(t + 0.12, 2093, 0.18);
      R.rv(0.15);
    }
  });

  def('badgeDeny', {
    dur: 0.75, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var buzz = function (t0, len) {
        var g = R.g(0, R.out);
        var lp = R.f('lowpass', R.hz(1500), 1.1, g);
        R.p(R.osc('square', R.hz(178), lp), t0, len + 0.01);
        R.p(R.osc('square', R.hz(186), R.g(0.7, lp)), t0, len + 0.01);
        R.e(g.gain, t0, [[0, 0, 's'], [0.004, 0.26], [len - 0.01, 0.24], [len, 0.0001, 'e']]);
      };
      buzz(t, 0.22);
      buzz(t + 0.3, 0.22);
      R.burst(t, 0.006, { type: 'bandpass', freq: 1600, q: 2, peak: 0.16, atk: 0.0006 });
    }
  });

  def('alarmKlaxon', {
    dur: 2.4, gain: 0.5, sustain: true, tonal: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.4, 0.06, 0.2);
      var bp = R.f('bandpass', R.hz(900), 1.6, body);
      var g1 = R.g(1, bp);
      var o = R.osc('reed', R.hz(660), g1);
      /* two-tone alternation, 0.6 s cycle, done with a square LFO on pitch */
      var lfo = R.osc('square', 1 / 0.62, null);
      var la = ctx.createGain(); la.gain.value = R.hz(110);
      lfo.connect(la); la.connect(o.frequency); R.nodes.push(la);
      R.go(o); R.go(lfo);
      R.go(R.osc('sawtooth', R.hz(220), R.g(0.10, body)));
      /* horn breath */
      var hp = R.f('highpass', R.hz(2000), 0.7, R.g(0.03, body));
      R.go(R.n('white', hp, 1), Math.random());
      R.rv(0.25);
    }
  });

  def('alarmSoft', {
    dur: 3.0, gain: 0.4, sustain: true, tonal: true, rev: 0.35,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.3, 0.3, 0.6);
      var pulse = R.am(body, 0.75, 0.92, 'sine');
      var lp = R.f('lowpass', R.hz(3000), 0.8, pulse);
      R.go(R.osc('sine', R.hz(880), lp));
      R.go(R.osc('sine', R.hz(1320), R.g(0.35, lp)));
      R.rv(0.4);
    }
  });

  def('serverRoomHum', {
    dur: 4.0, gain: 0.5, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.5, 0.6, 0.9);
      /* mains at 100 Hz with its odd harmonics */
      R.go(R.osc('sine', 100, R.g(0.16, body)));
      R.go(R.osc('sine', 200, R.g(0.055, body)));
      R.go(R.osc('sine', 300, R.g(0.03, body)));
      R.go(R.osc('sine', 50, R.g(0.05, body)));
      /* two close tones so the room beats slowly */
      R.go(R.osc('sine', 99.3, R.g(0.07, body)));
      R.go(R.osc('sine', 100.7, R.g(0.07, body)));
      /* broadband fan wall */
      var lp = R.f('lowpass', 900, 0.8, R.g(0.16, body));
      R.go(R.n('pink', lp, 1), Math.random());
      var bp = R.f('bandpass', 260, 1.4, R.g(0.14, body));
      R.go(R.n('brown', bp, 1), Math.random());
      var hiss = R.f('highpass', 3500, 0.7, R.g(0.02, body));
      R.go(R.n('white', hiss, 1), Math.random());
      /* drive whine */
      R.go(R.osc('sine', 2380, R.g(0.008, body)));
    }
  });

  def('relayClick', {
    dur: 0.16, gain: 0.5,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.004, { type: 'highpass', freq: 1500, peak: 0.42, atk: 0.0005 });
      R.ping(940 * rnd(0.97, 1.03), t, 0.03, 0.24);
      R.ping(1880, t, 0.018, 0.10);
      R.ping(128, t, 0.05, 0.16);
    }
  });

  def('sparkArc', {
    dur: 0.6, gain: 0.5,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.02, { type: 'highpass', freq: 2500, peak: 0.42, atk: 0.0006 });
      var n = 14 + Math.floor(Math.random() * 10);
      for (var i = 0; i < n; i++) {
        var ti = t + Math.pow(Math.random(), 1.5) * 0.42;
        R.burst(ti, rnd(0.004, 0.014), {
          type: 'highpass', freq: rnd(3000, 9000), peak: rnd(0.06, 0.22), atk: 0.0005
        });
      }
      /* the mains buzz that rides an arc */
      var g = R.g(0, R.out);
      var bp = R.f('bandpass', R.hz(4200), 3, g);
      var gate = R.am(bp, 100, 0.8, 'square', 0.3);
      R.p(R.n('white', gate, 1), t, 0.28, Math.random());
      R.e(g.gain, t, [[0, 0.18, 's'], [0.26, 0.0001, 'e']]);
      R.ping(120, t, 0.09, 0.12);
      R.rv(0.2);
    }
  });

  def('glassBreak', {
    dur: 1.6, gain: 0.5, rev: 0.3,
    build: function (R) {
      var t = R.t;
      /* the crack */
      R.burst(t, 0.05, { type: 'highpass', freq: 2200, peak: 0.55, atk: 0.0008 });
      R.ping(3100, t, 0.09, 0.2);
      R.ping(4700, t, 0.07, 0.15);
      R.ping(6350, t, 0.05, 0.1);
      /* the shower */
      var n = 16 + Math.floor(Math.random() * 8);
      for (var i = 0; i < n; i++) {
        var ti = t + 0.04 + Math.pow(Math.random(), 1.2) * 0.85;
        var f = rnd(2200, 6800);
        R.ping(f, ti, rnd(0.02, 0.06), rnd(0.04, 0.13));
        R.burst(ti, 0.006, { type: 'highpass', freq: f, peak: 0.05, atk: 0.0005 });
      }
      R.rv(0.35);
    }
  });

  def('metalClang', {
    dur: 1.8, gain: 0.55, rev: 0.4,
    build: function (R) {
      var t = R.t;
      var j = rnd(0.96, 1.05);
      var parts = [410, 617, 921, 1523, 2210, 3370];
      var amps = [0.26, 0.20, 0.15, 0.10, 0.07, 0.04];
      var decs = [1.20, 0.95, 0.78, 0.55, 0.38, 0.24];
      for (var i = 0; i < parts.length; i++) R.ping(parts[i] * j, t, decs[i], amps[i]);
      R.burst(t, 0.03, { type: 'highpass', freq: 2000, peak: 0.38, atk: 0.0008 });
      R.ping(146 * j, t, 0.22, 0.18);
      R.rv(0.42);
    }
  });

  def('radioStatic', {
    dur: 2.0, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.4, 0.05, 0.15);
      var hp = R.f('highpass', R.hz(320), 0.8, body);
      var lp = R.f('lowpass', R.hz(3400), 0.9, hp);
      /* squelch: noise level wobbling under two unrelated LFOs */
      var wob = R.g(0.7, lp);
      var l1 = R.osc('sine', 3.7, null);
      var a1 = ctx.createGain(); a1.gain.value = 0.28;
      l1.connect(a1); a1.connect(wob.gain); R.nodes.push(a1);
      var l2 = R.osc('sine', 0.91, null);
      var a2 = ctx.createGain(); a2.gain.value = 0.22;
      l2.connect(a2); a2.connect(wob.gain); R.nodes.push(a2);
      R.go(l1); R.go(l2);
      R.go(R.n('white', wob, 1), Math.random());
      /* carrier whistle */
      R.go(R.osc('sine', R.hz(1120), R.g(0.02, body)));
    }
  });

  def('planeCabinHum', {
    dur: 4.0, gain: 0.5, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.55, 0.8, 1.0);
      var lp = R.f('lowpass', R.hz(340), 0.9, body);
      R.go(R.n('brown', lp, 1), Math.random());
      var bp = R.f('bandpass', R.hz(760), 0.9, R.g(0.10, body));
      R.go(R.n('pink', bp, 1), Math.random());
      /* turbine tones, slightly apart so they beat */
      R.go(R.osc('sine', R.hz(88), R.g(0.10, body)));
      R.go(R.osc('sine', R.hz(87.4), R.g(0.09, body)));
      R.go(R.osc('sine', R.hz(176), R.g(0.035, body)));
      var hiss = R.f('highpass', R.hz(4200), 0.7, R.g(0.018, body));
      R.go(R.n('white', hiss, 1), Math.random());
    }
  });

  def('planeChime', {
    dur: 2.2, gain: 0.5, tonal: true, rev: 0.35,
    build: function (R) {
      var t = R.t;
      var bong = function (t0, f, peak) {
        R.ping(f, t0, 1.1, peak);
        R.ping(f * 2.01, t0, 0.7, peak * 0.35);
        R.ping(f * 3.02, t0, 0.4, peak * 0.12);
        R.burst(t0, 0.01, { type: 'highpass', freq: 4000, peak: peak * 0.3, atk: 0.001 });
      };
      bong(t, 784, 0.24);
      bong(t + 0.36, 587.3, 0.22);
      R.rv(0.4);
    }
  });

  def('seatbeltClick', {
    dur: 0.3, gain: 0.5,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.005, { type: 'highpass', freq: 3800, peak: 0.44, atk: 0.0005 });
      R.ping(1620, t, 0.10, 0.24);
      R.ping(2430, t, 0.07, 0.14);
      R.ping(620, t, 0.06, 0.10);
    }
  });

  def('cityAmbience', {
    dur: 4.0, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.45, 1.0, 1.2);
      var lp = R.f('lowpass', R.hz(480), 0.8, body);
      R.go(R.n('brown', lp, 1), Math.random());
      /* a slow filter drift reads as traffic moving */
      var l = R.osc('sine', 0.07, null);
      var la = ctx.createGain(); la.gain.value = R.hz(150);
      l.connect(la); la.connect(lp.frequency); R.nodes.push(la);
      R.go(l);
      var bp = R.f('bandpass', R.hz(1300), 0.7, R.g(0.06, body));
      R.go(R.n('pink', bp, 1), Math.random());
      var hp = R.f('highpass', R.hz(5000), 0.7, R.g(0.012, body));
      R.go(R.n('white', hp, 1), Math.random());
    }
  });

  def('rainLight', {
    dur: 4.0, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.42, 0.8, 1.0);
      var hp = R.f('highpass', R.hz(1100), 0.8, body);
      var lp = R.f('lowpass', R.hz(7000), 0.7, hp);
      R.go(R.n('white', lp, 1), Math.random());
      /* the gentle breathing of a shower passing over */
      var l = R.osc('sine', 0.11, null);
      var la = ctx.createGain(); la.gain.value = 0.12;
      l.connect(la); la.connect(body.gain); R.nodes.push(la);
      R.go(l);
      var pat = R.f('bandpass', R.hz(2600), 1.1, R.g(0.10, body));
      R.go(R.n('pink', pat, 1), Math.random());
    }
  });

  def('wind', {
    dur: 4.0, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.45, 1.0, 1.2);
      var bp = R.f('bandpass', R.hz(420), 1.6, body);
      R.go(R.n('brown', bp, 1), Math.random());
      var g1 = R.osc('sine', 0.09, null);
      var a1 = ctx.createGain(); a1.gain.value = R.hz(230);
      g1.connect(a1); a1.connect(bp.frequency); R.nodes.push(a1);
      var g2 = R.osc('sine', 0.052, null);
      var a2 = ctx.createGain(); a2.gain.value = 0.22;
      g2.connect(a2); a2.connect(body.gain); R.nodes.push(a2);
      R.go(g1); R.go(g2);
      var hi = R.f('bandpass', R.hz(2200), 1.1, R.g(0.05, body));
      R.go(R.n('white', hi, 1), Math.random());
    }
  });

  def('heartbeat', {
    dur: 1.1, gain: 0.55, loopEvery: 1.05,
    build: function (R) {
      var t = R.t;
      var thump = function (t0, peak) {
        var g = R.g(0, R.out);
        var lp = R.f('lowpass', R.hz(180), 1.2, g);
        var o = R.osc('sine', R.hz(78), lp);
        R.e(o.frequency, t0, [[0, R.hz(82), 's'], [0.12, R.hz(44), 'e']]);
        R.e(g.gain, t0, [[0, 0, 's'], [0.012, peak], [0.19, 0.0001, 'e']]);
        R.p(o, t0, 0.21);
        R.burst(t0, 0.04, { kind: 'brown', type: 'lowpass', freq: 240, peak: peak * 0.4, atk: 0.006 });
      };
      thump(t, 0.46);
      thump(t + 0.31, 0.32);
    }
  });

  def('breathHeavy', {
    dur: 1.9, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var swell = function (t0, len, f, peak, q) {
        var g = R.g(0, R.out);
        var bp = R.f('bandpass', R.hz(f), q, g);
        R.e(bp.frequency, t0, [[0, R.hz(f), 's'], [len, R.hz(f * 1.6), 'e']]);
        R.p(R.n('pink', bp, 1), t0, len + 0.02, Math.random());
        R.e(g.gain, t0, [[0, 0, 's'], [len * 0.35, peak], [len, 0.0001, 'e']]);
        var lp = R.f('lowpass', R.hz(700), 0.9, R.g(0.4, g));
        R.p(R.n('brown', lp, 1), t0, len + 0.02, Math.random());
      };
      swell(t, 0.6, 620, 0.30, 1.1);           /* in  */
      swell(t + 0.72, 0.75, 420, 0.24, 0.9);   /* out */
    }
  });

  def('whoosh', {
    dur: 0.9, gain: 0.5,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var bp = R.f('bandpass', R.hz(300), 1.3, g);
      R.e(bp.frequency, t, [
        [0, R.hz(280), 's'], [0.30, R.hz(2600), 'e'], [0.66, R.hz(420), 'e']
      ]);
      R.e(g.gain, t, [[0, 0, 's'], [0.16, 0.34], [0.36, 0.30], [0.68, 0.0001, 'e']]);
      R.p(R.n('white', bp, 1), t, 0.7, Math.random());
      var lp = R.f('lowpass', R.hz(500), 1.0, R.g(0.25, g));
      R.p(R.n('brown', lp, 1), t, 0.7, Math.random());
      R.rv(0.2);
    }
  });

  def('thud', {
    dur: 0.5, gain: 0.6,
    build: function (R) {
      var t = R.t;
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(300), 1.1, g);
      var o = R.osc('sine', R.hz(80), lp);
      R.e(o.frequency, t, [[0, R.hz(88), 's'], [0.14, R.hz(42), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.006, 0.55], [0.28, 0.0001, 'e']]);
      R.p(o, t, 0.3);
      R.burst(t, 0.05, { kind: 'brown', type: 'lowpass', freq: 480, peak: 0.28, atk: 0.002 });
      R.rv(0.15);
    }
  });

  def('cameraShutter', {
    dur: 0.3, gain: 0.5,
    build: function (R) {
      var t = R.t;
      R.burst(t, 0.008, { type: 'highpass', freq: 2600, peak: 0.4, atk: 0.0006 });
      R.ping(1750, t, 0.03, 0.2);
      /* mirror slap, then the second curtain */
      R.burst(t + 0.055, 0.012, { type: 'bandpass', freq: 1400, q: 1.6, peak: 0.34, atk: 0.0008 });
      R.ping(820, t + 0.055, 0.05, 0.18);
      R.ping(230, t + 0.055, 0.06, 0.12);
    }
  });

  def('tapeWhir', {
    dur: 2.5, gain: 0.45, sustain: true,
    build: function (R) {
      var body = R.g(0, R.out);
      R.sus(body.gain, 0.42, 0.25, 0.4);
      /* motor with flutter */
      var mg = R.g(0.14, body);
      var m = R.osc('sawtooth', R.hz(218), R.f('lowpass', R.hz(900), 1.4, mg));
      var fl = R.osc('sine', 5.6, null);
      var fa = ctx.createGain(); fa.gain.value = R.hz(4);
      fl.connect(fa); fa.connect(m.frequency); R.nodes.push(fa);
      R.go(m); R.go(fl);
      /* tape hiss and the reel rubbing */
      var bp = R.f('bandpass', R.hz(1900), 1.2, R.g(0.12, body));
      R.go(R.n('pink', bp, 1), Math.random());
      var lp = R.f('lowpass', R.hz(420), 1.0, R.g(0.10, body));
      R.go(R.n('brown', lp, 1), Math.random());
    }
  });

  def('voiceBlip', {
    dur: 0.16, gain: 0.5, tonal: true,
    build: function (R) {
      var t = R.t;
      var f = R.opt.freq || 200;
      var g = R.g(0, R.out);
      var lp = R.f('lowpass', R.hz(f * 9), 0.9, g);
      var o = R.osc(R.opt.wave || 'triangle', R.hz(f), lp);
      var o2 = R.osc('sine', R.hz(f * 2.01), R.g(0.3, lp));
      var slide = R.opt.slide === undefined ? 0.94 : R.opt.slide;
      var len = R.opt.len || 0.11;
      R.e(o.frequency, t, [[0, R.hz(f * 1.04), 's'], [len, R.hz(f * slide), 'e']]);
      R.e(g.gain, t, [[0, 0, 's'], [0.012, 0.26], [len * 0.6, 0.20], [len, 0.0001, 'e']]);
      R.p(o, t, len + 0.02); R.p(o2, t, len + 0.02);
      R.mark(t + len + 0.05);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Spawning                                                            */
  /* ------------------------------------------------------------------ */

  var warned = {};

  function panner() {
    var p = ctx.createPanner();
    p.panningModel = (SG.quality === 'low') ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.maxDistance = 30;
    p.rolloffFactor = 1.1;
    p.coneInnerAngle = 360;
    return p;
  }

  function setNodePos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else if (p.setPosition) {
      p.setPosition(x, y, z);
    }
  }

  function reap(h) {
    var i = active.indexOf(h);
    if (i >= 0) active.splice(i, 1);
    if (h._reaped) return;
    h._reaped = true;
    try { h.out.disconnect(); } catch (e) { /* already gone */ }
    if (h.pan) { try { h.pan.disconnect(); } catch (e2) { /* noop */ } }
    var r = h.rig;
    if (r) {
      for (var k = 0; k < r.nodes.length; k++) {
        try { r.nodes[k].disconnect(); } catch (e3) { /* noop */ }
      }
      r.nodes.length = 0; r.srcs.length = 0;
    }
    h.rig = null;
  }

  function stopHandle(h, fade) {
    if (!h || h._stopping) return;
    h._stopping = true;
    fade = fade === undefined ? 0.12 : fade;
    var t = ctx.currentTime;
    try {
      var v = h.out.gain.value;
      h.out.gain.cancelScheduledValues(t);
      h.out.gain.setValueAtTime(v, t);
      h.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* noop */ }
    if (h.rig) {
      for (var i = 0; i < h.rig.srcs.length; i++) {
        try { h.rig.srcs[i].stop(t + fade + 0.02); } catch (e2) { /* noop */ }
      }
    }
    if (h._timer) { clearTimeout(h._timer); h._timer = 0; }
    if (h._rep) { clearInterval(h._rep); h._rep = 0; }
    h._timer = setTimeout(function () { reap(h); }, (fade + 0.15) * 1000);
  }

  function cap() {
    if (active.length < MAXVOICES) return;
    /* drop the oldest non-looping voice */
    for (var i = 0; i < active.length; i++) {
      if (!active[i].looping) { stopHandle(active[i], 0.03); return; }
    }
    stopHandle(active[0], 0.03);
  }

  function spawn(name, opts) {
    if (!ok) {
      if (!ctx && !dead) A.init();
      if (!ok) return STUB;
    }
    opts = opts || {};
    var d = SFX[name];
    if (!d) {
      if (!warned[name]) {
        warned[name] = 1;
        if (W && W.console) W.console.warn('[audio] unknown sfx:', name);
      }
      d = SFX.uiHover;
      name = 'uiHover';
    }

    var loop = !!opts.loop;
    var jit = d.tonal ? 0.012 : 0.04;
    var rate = (opts.rate === undefined ? 1 : opts.rate) * (1 + rnd(-jit, jit));
    var vol = (opts.vol === undefined ? 1 : opts.vol) * (d.gain === undefined ? 1 : d.gain);
    var t0 = ctx.currentTime + (opts.delay || 0) + 0.008;
    var dur = (d.dur || 0.5);

    var out = ctx.createGain();
    out.gain.value = clamp(vol, 0, 4);

    var pan = null;
    var dest;
    if (opts.out) {
      dest = opts.out;
    } else {
      dest = buses.sfx;
    }
    if (opts.pos) {
      pan = panner();
      var p = opts.pos;
      setNodePos(pan, p.x || 0, p.y || 0, p.z || 0);
      out.connect(pan);
      pan.connect(dest);
    } else {
      out.connect(dest);
    }

    cap();

    var rig = new Rig(t0, out, opts, dur, loop && !!d.sustain, rate);
    var h = {
      name: name, out: out, pan: pan, rig: rig, looping: loop,
      dur: dur, t0: t0, silent: false,
      stop: function (fade) { stopHandle(h, fade); },
      setVolume: function (v, ramp) {
        try {
          var now = ctx.currentTime;
          out.gain.cancelScheduledValues(now);
          out.gain.setTargetAtTime(clamp(v, 0, 4), now, ramp === undefined ? 0.04 : ramp);
        } catch (e) { /* noop */ }
      },
      setPosition: function (v) { if (pan) setNodePos(pan, v.x, v.y, v.z); }
    };

    try {
      d.build(rig);
    } catch (e) {
      if (W && W.console) W.console.warn('[audio] sfx build failed:', name, e);
      reap(h);
      return STUB;
    }

    if (d.rev) rig.rv(d.rev);

    active.push(h);

    if (loop && !d.sustain) {
      /* a granular / rhythmic one-shot asked to loop: re-trigger it on a
       * single timer, not a timer per grain */
      var every = (d.loopEvery || d.dur) * 1000 / Math.max(0.25, rate);
      h._rep = setInterval(function () {
        if (h._stopping) return;
        var sub = spawn(name, {
          vol: opts.vol, rate: opts.rate, pos: opts.pos, out: opts.out
        });
        h._sub = sub;
      }, every);
      h._timer = 0;
    } else if (!loop) {
      var life = Math.max(0.05, (rig.end - ctx.currentTime) + 0.25);
      var last = rig.srcs.length ? rig.srcs[rig.srcs.length - 1] : null;
      if (last) {
        last.onended = function () { reap(h); };
      }
      h._timer = setTimeout(function () { reap(h); }, life * 1000);
    }

    return h;
  }

  A.sfx = function (name, opts) {
    return SG.safe ? SG.safe('audio.sfx:' + name, function () { return spawn(name, opts); }, STUB)
      : spawn(name, opts);
  };

  A.loop = function (name, opts) {
    opts = opts || {};
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    o.loop = true;
    return A.sfx(name, o);
  };

  A.has = function (name) { return !!SFX[name]; };
  A.names = function () { return Object.keys(SFX); };

  A.blip = function (profile, opts) {
    opts = opts || {};
    var p = profile;
    if (typeof profile === 'string') p = BLIP_PROFILES[profile] || BLIP_PROFILES.steve;
    if (!p) p = BLIP_PROFILES.steve;
    return A.sfx('voiceBlip', {
      vol: opts.vol === undefined ? (p.vol || 0.8) : opts.vol,
      freq: (p.freq || 200) * (opts.pitch || 1) * rnd(0.94, 1.07),
      wave: p.wave || 'triangle',
      len: opts.len || p.len || 0.1,
      slide: opts.slide === undefined ? p.slide : opts.slide,
      delay: opts.delay || 0,
      pos: opts.pos
    });
  };

  var BLIP_PROFILES = {
    steve: { freq: 178, wave: 'triangle', slide: 0.93, len: 0.10 },
    oleg: { freq: 104, wave: 'sawtooth', slide: 0.90, len: 0.12 },
    ellis: { freq: 268, wave: 'sine', slide: 0.96, len: 0.10 },
    guard: { freq: 152, wave: 'square', slide: 0.88, len: 0.08 },
    concierge: { freq: 206, wave: 'triangle', slide: 0.97, len: 0.10 },
    halcyon: { freq: 88, wave: 'square', slide: 1.0, len: 0.11 },
    pa: { freq: 232, wave: 'square', slide: 0.95, len: 0.09 },
    phone: { freq: 196, wave: 'square', slide: 0.94, len: 0.09 },
    narrator: { freq: 165, wave: 'triangle', slide: 0.94, len: 0.10 }
  };
  A.blipProfiles = BLIP_PROFILES;

  /* ------------------------------------------------------------------ */
  /* Buses, ducking, listener                                            */
  /* ------------------------------------------------------------------ */

  A.setBus = function (name, vol) {
    if (typeof vol !== 'number' || vol !== vol) return;
    vol = clamp(vol, 0, 1.5);
    levels[name] = vol;
    if (!ok) return;
    if (name === 'master') {
      try {
        masterGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.04);
      } catch (e) { masterGain.gain.value = vol; }
      return;
    }
    applyBus(name);
    if (name === 'sfx' && buses.amb) {
      try {
        buses.amb.gain.setTargetAtTime(vol * 0.9 * (ducked ? 0.251 : 1), ctx.currentTime, 0.04);
      } catch (e2) { /* noop */ }
    }
  };

  A.getBus = function (name) { return levels[name]; };

  A.duck = function (on) {
    on = !!on;
    if (on === ducked) return;
    ducked = on;
    applyBus('music');
    applyBus('sfx');
    if (ok && buses.amb) {
      try {
        buses.amb.gain.setTargetAtTime(levels.sfx * 0.9 * (ducked ? 0.251 : 1),
          ctx.currentTime, 0.06);
      } catch (e) { /* noop */ }
    }
  };

  A.setListener = function (camera) {
    if (!ok || !camera) return;
    try {
      if (camera.updateMatrixWorld) camera.updateMatrixWorld();
      var e = camera.matrixWorld && camera.matrixWorld.elements;
      if (!e) return;
      var L = ctx.listener;
      var px = e[12], py = e[13], pz = e[14];
      var fx = -e[8], fy = -e[9], fz = -e[10];
      var ux = e[4], uy = e[5], uz = e[6];
      if (L.positionX) {
        L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
        L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
        L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
      } else if (L.setPosition) {
        L.setPosition(px, py, pz);
        L.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    } catch (err) { /* older Safari throws on some of these */ }
  };

  /* ------------------------------------------------------------------ */
  /* Ambience beds                                                       */
  /* ------------------------------------------------------------------ */

  var AMB = {
    shop: [
      { n: 'crtHum', v: 0.20 },
      { n: 'fanSpin', v: 0.16, r: 0.85 },
      { n: 'cityAmbience', v: 0.10 },
      { n: 'serverRoomHum', v: 0.06, r: 1.0 }
    ],
    hotel: [
      { n: 'elevatorMotor', v: 0.05 },
      { n: 'wind', v: 0.07, r: 0.7 },
      { n: 'cityAmbience', v: 0.10 },
      { n: 'fanSpin', v: 0.08, r: 0.55 }
    ],
    vault: [
      { n: 'serverRoomHum', v: 0.42 },
      { n: 'fanWhine', v: 0.12, r: 1.05 },
      { n: 'crtHum', v: 0.08 }
    ],
    plane: [
      { n: 'planeCabinHum', v: 0.5 },
      { n: 'wind', v: 0.08, r: 1.3 }
    ],
    street: [
      { n: 'cityAmbience', v: 0.42 },
      { n: 'wind', v: 0.16 },
      { n: 'rainLight', v: 0.10 }
    ]
  };

  var ambCur = null;   /* {id, gain, handles[]} */

  function ambStop(a, fade) {
    if (!a) return;
    var t = ctx.currentTime;
    try {
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(a.gain.gain.value, t);
      a.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* noop */ }
    setTimeout(function () {
      for (var i = 0; i < a.handles.length; i++) {
        try { a.handles[i].stop(0.05); } catch (e2) { /* noop */ }
      }
      try { a.gain.disconnect(); } catch (e3) { /* noop */ }
    }, (fade + 0.1) * 1000);
  }

  A.ambience = function (id, opts) {
    if (!ok) {
      if (!ctx && !dead) A.init();
      if (!ok) { pendingAmb = id; return; }
    }
    opts = opts || {};
    var fade = opts.fade === undefined ? 1.5 : opts.fade;
    if (ambCur && ambCur.id === id) return;
    if (ambCur) { ambStop(ambCur, fade); ambCur = null; }
    if (!id) return;
    var layers = AMB[id];
    if (!layers) {
      if (W && W.console) W.console.warn('[audio] unknown ambience:', id);
      return;
    }
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(buses.amb);
    var hs = [];
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      hs.push(spawn(L.n, { loop: true, vol: L.v, rate: L.r || 1, out: g }));
    }
    var t = ctx.currentTime;
    try {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(opts.vol === undefined ? 1 : opts.vol, t + fade);
    } catch (e) { g.gain.value = 1; }
    ambCur = { id: id, gain: g, handles: hs };
  };

  /* ------------------------------------------------------------------ */
  /* Music — generative, scheduled on a lookahead timer                  */
  /* ------------------------------------------------------------------ */

  function envNote(g, t, atk, dec, peak, sus, len, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak), t + atk);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, sus), t + atk + dec);
    g.gain.setValueAtTime(Math.max(1e-4, sus), t + Math.max(atk + dec, len - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }

  function freeAt(node, sources, tEnd) {
    var last = sources[sources.length - 1];
    if (last) {
      last.onended = function () {
        try { node.disconnect(); } catch (e) { /* noop */ }
      };
    } else {
      setTimeout(function () {
        try { node.disconnect(); } catch (e) { /* noop */ }
      }, Math.max(50, (tEnd - ctx.currentTime + 0.2) * 1000));
    }
  }

  /* --- instruments ------------------------------------------------- */

  /* FM Rhodes: sine carrier, 2:1 modulator with a fast index decay */
  function iRhodes(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.6;
    var car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    var mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 2.001;
    var mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 3.4 * vel, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.18), t + 0.16);
    mod.connect(mg); mg.connect(car.frequency);
    car.connect(g); g.connect(lp); lp.connect(out);
    envNote(g, t, 0.006, 0.22, 0.20 * vel, 0.075 * vel, len, Math.min(0.3, len * 0.4));
    car.start(t); mod.start(t);
    car.stop(t + len + 0.05); mod.stop(t + len + 0.05);
    freeAt(lp, [car], t + len);
    car.onended = function () {
      try { lp.disconnect(); g.disconnect(); mg.disconnect(); } catch (e) { /* noop */ }
    };
  }

  /* Upright bass: triangle body, a felt-thump transient, filter that closes */
  function iBass(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, f * 2.2), t + 0.18);
    var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.004;
    var g2 = ctx.createGain(); g2.gain.value = 0.18;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(lp); lp.connect(out);
    envNote(g, t, 0.008, 0.25, 0.34 * vel, 0.10 * vel, len, Math.min(0.25, len * 0.5));
    o1.start(t); o2.start(t);
    o1.stop(t + len + 0.05); o2.stop(t + len + 0.05);
    /* the finger on the string */
    var nb = ctx.createBufferSource(); nb.buffer = NOISE.pink; nb.loop = true;
    var nf = ctx.createBiquadFilter(); nf.type = 'bandpass';
    nf.frequency.value = f * 5; nf.Q.value = 1.4;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.09 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    nb.connect(nf); nf.connect(ng); ng.connect(out);
    nb.start(t, Math.random() * 2); nb.stop(t + 0.08);
    o1.onended = function () {
      try { lp.disconnect(); g.disconnect(); g2.disconnect(); nf.disconnect(); ng.disconnect(); }
      catch (e) { /* noop */ }
    };
  }

  /* Warm detuned pad */
  function iPad(out, t, midi, len, vel, bright) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = (bright || 1) * 900;
    lp.Q.value = 0.8;
    var dets = [-7, 0, 7];
    var oscs = [];
    for (var i = 0; i < dets.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * Math.pow(2, dets[i] / 1200);
      var og = ctx.createGain(); og.gain.value = 0.33;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + len + 0.3);
      oscs.push(o);
    }
    g.connect(lp); lp.connect(out);
    var atk = Math.min(1.4, len * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * vel, t + atk);
    g.gain.setValueAtTime(0.10 * vel, t + Math.max(atk, len - 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
    oscs[0].onended = function () {
      try { lp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  /* Muted pulse bass — the infiltration engine */
  function iPulse(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(90, f * 2), t + Math.min(0.12, len));
    var o = ctx.createOscillator();
    if (WAVES.pulse25) o.setPeriodicWave(WAVES.pulse25); else o.type = 'square';
    o.frequency.value = f;
    var sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
    var sg = ctx.createGain(); sg.gain.value = 0.5;
    o.connect(g); sub.connect(sg); sg.connect(g);
    g.connect(lp); lp.connect(out);
    envNote(g, t, 0.004, 0.06, 0.26 * vel, 0.11 * vel, len, Math.min(0.08, len * 0.5));
    o.start(t); sub.start(t);
    o.stop(t + len + 0.03); sub.stop(t + len + 0.03);
    o.onended = function () {
      try { lp.disconnect(); g.disconnect(); sg.disconnect(); } catch (e) { /* noop */ }
    };
  }

  /* Cold arpeggiator — the vault */
  function iArp(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * 2.4; bp.Q.value = 3.2;
    var o = ctx.createOscillator();
    if (WAVES.pulse12) o.setPeriodicWave(WAVES.pulse12); else o.type = 'square';
    o.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    var g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(bp); bp.connect(out);
    envNote(g, t, 0.003, 0.05, 0.17 * vel, 0.03 * vel, len, Math.min(0.06, len * 0.6));
    o.start(t); o2.start(t);
    o.stop(t + len + 0.03); o2.stop(t + len + 0.03);
    if (revIn) {
      var s = ctx.createGain(); s.gain.value = 0.16;
      bp.connect(s); s.connect(revIn);
      o.onended = function () {
        try { bp.disconnect(); g.disconnect(); g2.disconnect(); s.disconnect(); }
        catch (e) { /* noop */ }
      };
    } else {
      o.onended = function () {
        try { bp.disconnect(); g.disconnect(); g2.disconnect(); } catch (e) { /* noop */ }
      };
    }
  }

  /* Low strings — briefing */
  function iStrings(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.7;
    var oscs = [];
    var dets = [-9, -3, 4, 11];
    for (var i = 0; i < dets.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * Math.pow(2, dets[i] / 1200);
      var og = ctx.createGain(); og.gain.value = 0.25;
      o.connect(og); og.connect(g);
      /* a slow bow vibrato keeps it from sounding like a synth pad */
      var v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 4.4 + i * 0.3;
      var va = ctx.createGain(); va.gain.value = f * 0.0035;
      v.connect(va); va.connect(o.frequency);
      v.start(t); v.stop(t + len + 0.4);
      o.start(t); o.stop(t + len + 0.4);
      oscs.push(o);
    }
    g.connect(lp); lp.connect(out);
    var atk = Math.min(1.1, len * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, t + atk);
    g.gain.setValueAtTime(0.11 * vel, t + Math.max(atk, len - 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.35);
    oscs[0].onended = function () {
      try { lp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  function iBell(out, t, midi, len, vel) {
    var f = mtof(midi);
    var parts = [1, 2.76, 5.4];
    var amps = [1, 0.3, 0.12];
    for (var i = 0; i < parts.length; i++) {
      var g = ctx.createGain();
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f * parts[i];
      o.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * vel * amps[i], t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.start(t); o.stop(t + len + 0.02);
      /* eslint-disable no-loop-func */
      (function (gg) {
        o.onended = function () { try { gg.disconnect(); } catch (e) { /* noop */ } };
      })(g);
      /* eslint-enable no-loop-func */
    }
  }

  function iSub(out, t, midi, len, vel) {
    var f = mtof(midi);
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(out);
    envNote(g, t, 0.01, 0.1, 0.30 * vel, 0.16 * vel, len, Math.min(0.2, len * 0.4));
    o.start(t); o.stop(t + len + 0.03);
    o.onended = function () { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  /* --- drums -------------------------------------------------------- */

  function dKick(out, t, vel) {
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.10);
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
    o.start(t); o.stop(t + 0.32);
    var n = ctx.createBufferSource(); n.buffer = NOISE.white; n.loop = true;
    var nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1800;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.10 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t, Math.random() * 2); n.stop(t + 0.05);
    o.onended = function () {
      try { g.disconnect(); nf.disconnect(); ng.disconnect(); } catch (e) { /* noop */ }
    };
  }

  function dBrush(out, t, vel, len) {
    len = len || 0.22;
    var n = ctx.createBufferSource(); n.buffer = NOISE.pink; n.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1900; bp.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, Math.random() * 2); n.stop(t + len + 0.02);
    n.onended = function () {
      try { bp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  function dSwirl(out, t, vel, len) {
    len = len || 0.4;
    var n = ctx.createBufferSource(); n.buffer = NOISE.pink; n.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + len);
    bp.Q.value = 0.6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09 * vel, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, Math.random() * 2); n.stop(t + len + 0.02);
    n.onended = function () {
      try { bp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  function dHat(out, t, vel, open) {
    var len = open ? 0.22 : 0.045;
    var n = ctx.createBufferSource(); n.buffer = NOISE.white; n.loop = true;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(hp); hp.connect(g); g.connect(out);
    n.start(t, Math.random() * 2); n.stop(t + len + 0.02);
    n.onended = function () {
      try { hp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  function dRim(out, t, vel) {
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1750;
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.start(t); o.stop(t + 0.08);
    o.onended = function () { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  function dTick(out, t, vel) {
    var n = ctx.createBufferSource(); n.buffer = NOISE.white; n.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 2400; bp.Q.value = 6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, Math.random() * 2); n.stop(t + 0.05);
    n.onended = function () {
      try { bp.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
    };
  }

  /* A continuous bed a track can own for its whole life. */
  function bedNoise(out, o) {
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.value = o.freq || 400;
    f.Q.value = o.q || 0.8;
    var n = ctx.createBufferSource();
    n.buffer = NOISE[o.kind || 'brown'];
    n.loop = true;
    n.connect(f); f.connect(g); g.connect(out);
    n.start(ctx.currentTime, Math.random() * 2);
    g.gain.setTargetAtTime(o.vol === undefined ? 0.1 : o.vol, ctx.currentTime, 1.2);
    return {
      stop: function () {
        var t = ctx.currentTime;
        try {
          g.gain.setTargetAtTime(0.0001, t, 0.4);
          n.stop(t + 2.2);
        } catch (e) { /* noop */ }
        setTimeout(function () {
          try { f.disconnect(); g.disconnect(); } catch (e2) { /* noop */ }
        }, 2600);
      }
    };
  }

  function bedTone(out, freq, vol) {
    var g = ctx.createGain(); g.gain.value = 0.0001;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(out);
    o.start(ctx.currentTime);
    g.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
    return {
      stop: function () {
        var t = ctx.currentTime;
        try { g.gain.setTargetAtTime(0.0001, t, 0.4); o.stop(t + 2.2); } catch (e) { /* noop */ }
        setTimeout(function () { try { g.disconnect(); } catch (e2) { /* noop */ } }, 2600);
      }
    };
  }

  /* --- tracks ------------------------------------------------------- */

  /* midi helpers */
  var N = {
    C1: 24, D1: 26, Eb1: 27, E1: 28, F1: 29, G1: 31, Ab1: 32, A1: 33, Bb1: 34, B1: 35,
    C2: 36, D2: 38, Eb2: 39, E2: 40, F2: 41, G2: 43, Ab2: 44, A2: 45, Bb2: 46, B2: 47,
    C3: 48, D3: 50, Eb3: 51, E3: 52, F3: 53, G3: 55, Ab3: 56, A3: 57, Bb3: 58, B3: 59,
    C4: 60, D4: 62, Eb4: 63, E4: 64, F4: 65, G4: 67, Ab4: 68, A4: 69, Bb4: 70, B4: 71,
    C5: 72, D5: 74, Eb5: 75, E5: 76, F5: 77, G5: 79, A5: 81, Bb5: 82, C6: 84
  };

  function ev(bar, step, list) {
    /* returns the events in `list[bar]` that land on `step` */
    var b = list[bar % list.length];
    var out = [];
    for (var i = 0; i < b.length; i++) if (b[i][0] === step) out.push(b[i]);
    return out;
  }

  var TRACKS = {};

  /* ---- titleTheme — F major, 72 bpm, warm Rhodes + upright bass ---- */
  TRACKS.titleTheme = {
    bpm: 72, key: 'F major', bars: 4,
    prog: [
      { r: N.F2, ch: [N.C4, N.E4, N.G4, N.C5] },
      { r: N.D2, ch: [N.A3, N.C4, N.F4, N.A4] },
      { r: N.Bb1 + 12, ch: [N.Bb3, N.D4, N.F4, N.A4] },
      { r: N.C2, ch: [N.C4, N.E4, N.G4, N.Bb4] }
    ],
    mel: [
      [[0, N.C5, 6], [6, N.A4, 2], [8, N.G4, 4], [12, N.E4, 4]],
      [[0, N.F4, 4], [4, N.E4, 2], [6, N.D4, 6], [12, N.C4, 4]],
      [[0, N.D4, 3], [3, N.F4, 3], [6, N.A4, 6], [12, N.G4, 4]],
      [[0, N.E4, 4], [4, N.G4, 4], [8, N.C5, 8]]
    ],
    step: function (S, s, bar, t, inten) {
      var p = this.prog[bar % this.prog.length];
      var spb = 60 / this.bpm;
      var sd = spb / 4;
      /* Rhodes chord on 1 and the "and" of 3 */
      if (s === 0 || s === 10) {
        var v = s === 0 ? 0.9 : 0.55;
        for (var i = 0; i < p.ch.length; i++) {
          iRhodes(S.gain, t + i * 0.012, p.ch[i], spb * (s === 0 ? 2.4 : 1.2), v * 0.8);
        }
      }
      /* walking bass on every beat */
      if (s % 4 === 0) {
        var walk = [0, 7, 5, 3];
        iBass(S.gain, t, p.r + (s === 0 ? 0 : walk[(s / 4) | 0]), spb * 0.9, 0.9);
      }
      /* melody */
      var evs = ev(bar, s, this.mel);
      for (var k = 0; k < evs.length; k++) {
        iRhodes(S.gain, t, evs[k][1] + 12, sd * evs[k][2] * 0.95, 0.6 + inten * 0.3);
      }
      if (s === 0 && bar % 4 === 0) iBell(S.gain, t, N.C6, 2.2, 0.35 * inten);
    },
    bed: function (out) { return bedNoise(out, { kind: 'brown', freq: 300, vol: 0.02 }); }
  };

  /* ---- shopAmbient — Bb major, 78 bpm, dusty lo-fi, brushed kit ---- */
  TRACKS.shopAmbient = {
    bpm: 78, key: 'B-flat major', bars: 4,
    prog: [
      { r: N.Bb1, ch: [N.Bb3, N.D4, N.F4, N.A4] },
      { r: N.G1, ch: [N.G3, N.Bb3, N.D4, N.F4] },
      { r: N.Eb1 + 12, ch: [N.Eb3, N.G3, N.Bb3, N.D4] },
      { r: N.F1 + 12, ch: [N.F3, N.A3, N.C4, N.Eb4] }
    ],
    mel: [
      [[4, N.F4, 3], [7, N.D4, 3], [12, N.Bb3, 4]],
      [[2, N.D4, 2], [6, N.Bb3, 4], [12, N.F4, 4]],
      [[0, N.G3, 4], [6, N.Bb3, 2], [8, N.D4, 6]],
      [[4, N.C4, 4], [10, N.Eb4, 2], [12, N.D4, 4]]
    ],
    step: function (S, s, bar, t, inten) {
      var p = this.prog[bar % this.prog.length];
      var spb = 60 / this.bpm, sd = spb / 4;
      /* the Rhodes leans a little late — lo-fi swing */
      var swing = (s % 2 === 1) ? sd * 0.16 : 0;
      if (s === 0 || s === 6) {
        for (var i = 0; i < p.ch.length; i++) {
          iRhodes(S.gain, t + swing + i * 0.018, p.ch[i], spb * 1.6, s === 0 ? 0.62 : 0.4);
        }
      }
      if (s === 0) iBass(S.gain, t, p.r, spb * 1.4, 0.85);
      if (s === 10) iBass(S.gain, t + swing, p.r + 7, spb * 0.7, 0.5);
      if (inten > 0.25) {
        if (s === 0 || s === 8) dKick(S.gain, t, 0.5 * inten);
        if (s === 4 || s === 12) { dBrush(S.gain, t + swing, 0.9 * inten, 0.26); }
        if (s === 6 || s === 14) dSwirl(S.gain, t, 0.5 * inten, 0.34);
        if (s % 2 === 0) dHat(S.gain, t + swing, (s % 4 === 0 ? 0.5 : 0.3) * inten);
      }
      var evs = ev(bar, s, this.mel);
      for (var k = 0; k < evs.length; k++) {
        iRhodes(S.gain, t + swing, evs[k][1] + 12, sd * evs[k][2], 0.42 + inten * 0.2);
      }
    },
    bed: function (out) { return bedNoise(out, { kind: 'brown', freq: 260, vol: 0.03 }); }
  };

  /* ---- briefing — D minor, 60 bpm, low strings + a ticking clock ---- */
  TRACKS.briefing = {
    bpm: 60, key: 'D minor', bars: 4,
    prog: [
      { r: N.D1, ch: [N.D3, N.F3, N.A3] },
      { r: N.Bb1, ch: [N.D3, N.F3, N.Bb3] },
      { r: N.G1, ch: [N.D3, N.G3, N.Bb3] },
      { r: N.A1, ch: [N.C4 - 1, N.E3, N.A3] }
    ],
    step: function (S, s, bar, t, inten) {
      var p = this.prog[bar % this.prog.length];
      var spb = 60 / this.bpm;
      if (s === 0) {
        for (var i = 0; i < p.ch.length; i++) {
          iStrings(S.gain, t + i * 0.05, p.ch[i], spb * 3.6, 0.85);
        }
        iSub(S.gain, t, p.r, spb * 3.4, 0.5);
      }
      /* the clock never stops */
      if (s % 4 === 0) dTick(S.gain, t, 0.75);
      if (s % 4 === 2) dTick(S.gain, t, 0.30);
      if (inten > 0.5 && s === 8 && bar % 2 === 1) {
        iRhodes(S.gain, t, p.ch[0] + 12, spb * 1.5, 0.4 * inten);
      }
      if (inten > 0.7 && s === 12 && bar % 4 === 3) {
        iBell(S.gain, t, N.D5, 2.6, 0.4);
      }
    },
    bed: function (out) { return bedNoise(out, { kind: 'brown', freq: 180, vol: 0.05 }); }
  };

  /* ---- flight — A minor, 54 bpm, ambient pad over a turbine bed ---- */
  TRACKS.flight = {
    bpm: 54, key: 'A minor', bars: 4,
    prog: [
      { r: N.A1, ch: [N.A3, N.C4, N.E4, N.B4] },
      { r: N.F1 + 12, ch: [N.A3, N.C4, N.F4, N.A4] },
      { r: N.C2, ch: [N.G3, N.C4, N.E4, N.G4] },
      { r: N.G1 + 12, ch: [N.G3, N.B3, N.D4, N.E4] }
    ],
    step: function (S, s, bar, t, inten) {
      var p = this.prog[bar % this.prog.length];
      var spb = 60 / this.bpm;
      if (s === 0) {
        for (var i = 0; i < p.ch.length; i++) {
          iPad(S.gain, t + i * 0.09, p.ch[i], spb * 3.8, 0.95, 0.8 + inten * 0.6);
        }
        iSub(S.gain, t, p.r, spb * 3.6, 0.4);
      }
      if (s === 8 && bar % 2 === 0 && inten > 0.35) {
        iBell(S.gain, t, p.ch[3] + 12, 3.0, 0.30 * inten);
      }
    },
    bed: function (out) {
      var a = bedNoise(out, { kind: 'brown', freq: 320, vol: 0.13 });
      var b = bedNoise(out, { kind: 'pink', type: 'bandpass', freq: 780, q: 0.9, vol: 0.05 });
      var c = bedTone(out, 88, 0.035);
      var d = bedTone(out, 87.3, 0.03);
      return { stop: function () { a.stop(); b.stop(); c.stop(); d.stop(); } };
    }
  };

  /* ---- infiltration — E minor, 96 bpm, tense muted pulse ---- */
  TRACKS.infiltration = {
    bpm: 96, key: 'E minor', bars: 4,
    roots: [N.E1, N.E1, N.C1 + 12, N.D1 + 12],
    chords: [
      [N.E3, N.G3, N.B3], [N.E3, N.G3, N.B3],
      [N.C3, N.E3, N.G3], [N.D3, N.F3 + 1, N.A3]
    ],
    arp: [0, 2, 1, 2, 0, 1, 2, 1],
    step: function (S, s, bar, t, inten) {
      var spb = 60 / this.bpm, sd = spb / 4;
      var root = this.roots[bar % this.roots.length];
      var ch = this.chords[bar % this.chords.length];
      /* eighth-note pulse bass — the heartbeat of the level */
      if (s % 2 === 0) {
        var accent = (s % 8 === 0) ? 1 : ((s % 4 === 0) ? 0.8 : 0.6);
        iPulse(S.gain, t, root + (s === 14 ? 3 : 0), sd * 1.4, accent);
      }
      if (s === 0) {
        for (var i = 0; i < ch.length; i++) {
          iPad(S.gain, t, ch[i], spb * 3.6, 0.55 + inten * 0.3, 0.5 + inten * 0.8);
        }
      }
      if (inten > 0.3 && s % 2 === 1) dHat(S.gain, t, 0.28 * inten);
      if (inten > 0.45 && (s === 4 || s === 12)) dRim(S.gain, t, 0.7 * inten);
      if (inten > 0.6) {
        var a = this.arp[s % this.arp.length];
        if (s % 2 === 0) iArp(S.gain, t, ch[a] + 12, sd * 1.1, 0.5 * inten);
      }
      if (inten > 0.8 && s === 0 && bar % 4 === 3) iSub(S.gain, t, root - 12, spb * 2, 0.6);
    },
    bed: function (out) { return bedNoise(out, { kind: 'brown', freq: 220, vol: 0.05 }); }
  };

  /* ---- vault — C minor, 120 bpm, cold arpeggio over the room hum ---- */
  TRACKS.vault = {
    bpm: 120, key: 'C minor', bars: 4,
    seqs: [
      [N.C4, N.Eb4, N.G4, N.Bb4, N.C5, N.Bb4, N.G4, N.Eb4],
      [N.C4, N.Eb4, N.Ab4, N.C5, N.Ab4, N.G4, N.Eb4, N.C4],
      [N.Bb3, N.D4, N.F4, N.Bb4, N.F4, N.D4, N.Bb3, N.F4],
      [N.Ab3, N.C4, N.Eb4, N.Ab4, N.G4, N.Eb4, N.C4, N.G3]
    ],
    roots: [N.C2, N.C2, N.Bb1, N.Ab1],
    step: function (S, s, bar, t, inten) {
      var spb = 60 / this.bpm, sd = spb / 4;
      var seq = this.seqs[bar % this.seqs.length];
      /* 16th arpeggio, cold and even */
      var n = seq[s % seq.length];
      iArp(S.gain, t, n, sd * 0.85, (s % 4 === 0 ? 0.85 : 0.55) * (0.6 + inten * 0.5));
      if (s === 0) {
        iSub(S.gain, t, this.roots[bar % this.roots.length], spb * 2, 0.75);
        for (var i = 0; i < 3; i++) {
          iPad(S.gain, t, seq[i * 2] - 12, spb * 3.6, 0.5 + inten * 0.3, 0.45);
        }
      }
      if (inten > 0.4 && (s === 0 || s === 8)) dKick(S.gain, t, 0.5 * inten);
      if (inten > 0.55 && s % 4 === 2) dHat(S.gain, t, 0.24 * inten);
      if (inten > 0.75 && s === 12) dRim(S.gain, t, 0.5 * inten);
    },
    bed: function (out) {
      var a = bedTone(out, 100, 0.045);
      var b = bedTone(out, 100.7, 0.04);
      var c = bedNoise(out, { kind: 'pink', freq: 900, vol: 0.05 });
      return { stop: function () { a.stop(); b.stop(); c.stop(); } };
    }
  };

  /* ---- alarm — G minor, 132 bpm, driving ---- */
  TRACKS.alarm = {
    bpm: 132, key: 'G minor', bars: 4,
    roots: [N.G1, N.G1, N.Eb1 + 12, N.D1 + 12],
    chords: [
      [N.G3, N.Bb3, N.D4], [N.G3, N.Bb3, N.D4],
      [N.Eb3, N.G3, N.Bb3], [N.D3, N.F3 + 1, N.A3]
    ],
    step: function (S, s, bar, t, inten) {
      var spb = 60 / this.bpm, sd = spb / 4;
      var root = this.roots[bar % this.roots.length];
      var ch = this.chords[bar % this.chords.length];
      if (s % 2 === 0) iPulse(S.gain, t, root, sd * 1.5, s % 8 === 0 ? 1 : 0.7);
      if (s % 4 === 0) dKick(S.gain, t, 0.85);
      if (s === 4 || s === 12) dBrush(S.gain, t, 1.1, 0.14);
      if (s % 2 === 1) dHat(S.gain, t, 0.4);
      /* two-note siren stab across the bar */
      if (s === 0) {
        iArp(S.gain, t, ch[0] + 12, sd * 3, 1.0);
        iArp(S.gain, t + sd * 3, ch[2] + 12, sd * 3, 0.9);
        for (var i = 0; i < ch.length; i++) iPad(S.gain, t, ch[i], spb * 3.6, 0.7, 1.4);
      }
      if (inten > 0.6 && (s === 8 || s === 10 || s === 11)) {
        iArp(S.gain, t, ch[(s / 3 | 0) % ch.length] + 24, sd * 0.9, 0.7);
      }
      if (s === 14 && bar % 4 === 3) iSub(S.gain, t, root - 12, spb, 0.9);
    }
  };

  /* ---- credits — the shop theme, resolved, B-flat major, 84 bpm ---- */
  TRACKS.credits = {
    bpm: 84, key: 'B-flat major', bars: 4,
    prog: [
      { r: N.Bb1, ch: [N.Bb3, N.D4, N.F4, N.A4] },
      { r: N.Eb1 + 12, ch: [N.Bb3, N.Eb4, N.G4, N.Bb4] },
      { r: N.G1, ch: [N.Bb3, N.D4, N.G4, N.Bb4] },
      { r: N.F1 + 12, ch: [N.A3, N.C4, N.F4, N.A4] }
    ],
    mel: [
      [[0, N.F4, 4], [4, N.D4, 2], [6, N.Bb3, 6], [12, N.D4, 4]],
      [[0, N.G4, 4], [4, N.Bb4, 4], [8, N.G4, 4], [12, N.Eb4, 4]],
      [[0, N.D4, 6], [6, N.G4, 4], [10, N.Bb4, 6]],
      [[0, N.A4, 4], [4, N.F4, 4], [8, N.C5, 8]]
    ],
    step: function (S, s, bar, t, inten) {
      var p = this.prog[bar % this.prog.length];
      var spb = 60 / this.bpm, sd = spb / 4;
      if (s === 0 || s === 8) {
        for (var i = 0; i < p.ch.length; i++) {
          iRhodes(S.gain, t + i * 0.015, p.ch[i], spb * 1.8, s === 0 ? 0.8 : 0.5);
        }
      }
      if (s % 8 === 0) iBass(S.gain, t, p.r, spb * 1.8, 0.9);
      if (s === 12) iBass(S.gain, t, p.r + 7, spb * 0.8, 0.55);
      if (inten > 0.2) {
        if (s === 0 || s === 8) dKick(S.gain, t, 0.42 * inten);
        if (s === 4 || s === 12) dBrush(S.gain, t, 0.8 * inten, 0.24);
        if (s % 2 === 0) dHat(S.gain, t, 0.26 * inten);
        if (s === 14) dSwirl(S.gain, t, 0.4 * inten, 0.3);
      }
      var evs = ev(bar, s, this.mel);
      for (var k = 0; k < evs.length; k++) {
        iRhodes(S.gain, t, evs[k][1] + 12, sd * evs[k][2], 0.5 + inten * 0.25);
      }
      if (s === 0 && bar % 4 === 0) iBell(S.gain, t, N.Bb5, 2.4, 0.3);
    },
    bed: function (out) { return bedNoise(out, { kind: 'brown', freq: 280, vol: 0.02 }); }
  };

  A.tracks = TRACKS;

  /* --- the scheduler ------------------------------------------------ */

  var M = { cur: null, dying: [], timer: 0, ahead: 0.25, tickMs: 45, targetInten: 1 };

  function makeVoiceState(id, def) {
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(buses.music);
    var st = {
      id: id, def: def, gain: g,
      t: ctx.currentTime + 0.12, step: 0, bar: 0,
      inten: 1, bed: null
    };
    if (def.bed) {
      try { st.bed = def.bed(g, st); } catch (e) { st.bed = null; }
    }
    return st;
  }

  function killState(st, fade) {
    if (!st) return;
    var t = ctx.currentTime;
    try {
      st.gain.gain.cancelScheduledValues(t);
      st.gain.gain.setValueAtTime(st.gain.gain.value, t);
      st.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* noop */ }
    if (st.bed && st.bed.stop) { try { st.bed.stop(); } catch (e2) { /* noop */ } }
    setTimeout(function () {
      try { st.gain.disconnect(); } catch (e3) { /* noop */ }
      var i = M.dying.indexOf(st);
      if (i >= 0) M.dying.splice(i, 1);
    }, (fade + 0.4) * 1000);
    M.dying.push(st);
  }

  function schedTick() {
    if (!ok) return;
    var st = M.cur;
    if (!st) {
      if (!M.dying.length) stopTimer();
      return;
    }
    var spb = 60 / st.def.bpm;
    var sd = spb / 4;
    var now = ctx.currentTime;
    if (st.t < now - 0.6) st.t = now + 0.05;    /* tab was backgrounded */
    st.inten += (M.targetInten - st.inten) * 0.25;
    var horizon = now + M.ahead;
    var guard = 0;
    while (st.t < horizon && guard++ < 96) {
      try {
        st.def.step(st, st.step, st.bar, st.t, clamp(st.inten, 0, 1));
      } catch (e) {
        if (W && W.console) W.console.warn('[music] step failed', st.id, e);
        st.def.step = function () {};
      }
      st.t += sd;
      st.step++;
      if (st.step >= 16) { st.step = 0; st.bar++; }
    }
  }

  function startTimer() {
    if (M.timer || !W) return;
    M.timer = W.setInterval(schedTick, M.tickMs);
  }
  function stopTimer() {
    if (M.timer && W) { W.clearInterval(M.timer); M.timer = 0; }
  }

  A.music = function (id, opts) {
    if (!ok) {
      if (!ctx && !dead) A.init();
      if (!ok) { pendingMusic = id; return; }
    }
    opts = opts || {};
    var fade = opts.fade === undefined ? 1.5 : opts.fade;
    if (opts.intensity !== undefined) M.targetInten = clamp(opts.intensity, 0, 1);

    if (M.cur && M.cur.id === id) return;

    if (M.cur) { killState(M.cur, fade); M.cur = null; }
    if (!id) { return; }

    var d = TRACKS[id];
    if (!d) {
      if (W && W.console) W.console.warn('[audio] unknown music track:', id);
      return;
    }
    var st = makeVoiceState(id, d);
    st.inten = M.targetInten;
    M.cur = st;
    var t = ctx.currentTime;
    try {
      st.gain.gain.setValueAtTime(0.0001, t);
      st.gain.gain.linearRampToValueAtTime(opts.vol === undefined ? 0.9 : opts.vol, t + fade);
    } catch (e) { st.gain.gain.value = 0.9; }
    schedTick();
    startTimer();
  };

  A.musicIntensity = function (v) { M.targetInten = clamp(v, 0, 1); };
  A.currentMusic = function () { return M.cur ? M.cur.id : null; };

  /* ------------------------------------------------------------------ */
  /* Stingers                                                            */
  /* ------------------------------------------------------------------ */

  var STINGERS = {
    reveal: function (out, t) {
      iBell(out, t, N.C5, 3.0, 1.0);
      iBell(out, t + 0.05, N.G5, 2.6, 0.7);
      iPad(out, t, N.C3, 3.0, 1.0, 1.2);
      iPad(out, t, N.G3, 3.0, 0.8, 1.2);
      iSub(out, t, N.C2, 2.4, 0.8);
    },
    warm: function (out, t) {
      iRhodes(out, t, N.F3, 2.4, 0.9);
      iRhodes(out, t + 0.03, N.A3, 2.4, 0.8);
      iRhodes(out, t + 0.06, N.C4, 2.6, 0.8);
      iBass(out, t, N.F1 + 12, 2.0, 0.8);
    },
    tension: function (out, t) {
      iStrings(out, t, N.D2, 3.2, 1.0);
      iStrings(out, t, N.Ab2, 3.2, 0.8);
      iSub(out, t, N.D1, 2.6, 0.9);
    },
    danger: function (out, t) {
      iPulse(out, t, N.E1, 0.5, 1.0);
      iPulse(out, t + 0.3, N.E1, 0.5, 0.9);
      iStrings(out, t, N.F3 + 1, 2.2, 0.9);
      iStrings(out, t, N.B3, 2.2, 0.7);
    },
    hit: function (out, t) {
      iSub(out, t, N.C1, 1.4, 1.0);
      dKick(out, t, 1.0);
      iStrings(out, t, N.C3, 1.6, 0.8);
      iStrings(out, t, N.Eb3, 1.6, 0.7);
    },
    sad: function (out, t) {
      iRhodes(out, t, N.A2, 3.0, 0.8);
      iRhodes(out, t + 0.04, N.C3, 3.0, 0.7);
      iRhodes(out, t + 0.08, N.E3, 3.2, 0.7);
      iRhodes(out, t + 0.12, N.G3, 3.2, 0.5);
    },
    success: function (out, t) {
      iRhodes(out, t, N.C4, 0.4, 0.9);
      iRhodes(out, t + 0.11, N.E4, 0.4, 0.9);
      iRhodes(out, t + 0.22, N.G4, 1.6, 0.9);
      iBell(out, t + 0.22, N.C5, 2.2, 0.6);
      iBass(out, t, N.C2, 1.4, 0.8);
    },
    fail: function (out, t) {
      iPulse(out, t, N.C2, 0.5, 0.9);
      iPulse(out, t + 0.22, N.B1, 0.5, 0.9);
      iStrings(out, t + 0.44, N.Bb1 + 12, 2.4, 0.9);
      iSub(out, t + 0.44, N.Bb1, 2.0, 0.7);
    },
    riser: function (out, t) {
      for (var i = 0; i < 12; i++) {
        iArp(out, t + i * 0.09, N.C3 + i * 2, 0.16, 0.4 + i * 0.05);
      }
      iSub(out, t + 1.08, N.C1, 1.6, 1.0);
    },
    logo: function (out, t) {
      iRhodes(out, t, N.F3, 2.6, 0.9);
      iRhodes(out, t + 0.02, N.C4, 2.6, 0.8);
      iRhodes(out, t + 0.04, N.A4, 2.8, 0.7);
      iBass(out, t, N.F1 + 12, 2.4, 0.9);
      iBell(out, t + 0.3, N.F5, 2.6, 0.5);
    },
    drone: function (out, t) {
      iPad(out, t, N.C2, 4.0, 1.0, 0.4);
      iPad(out, t, N.G2, 4.0, 0.8, 0.4);
      iSub(out, t, N.C1, 3.6, 0.7);
    }
  };
  STINGERS.discover = STINGERS.reveal;
  STINGERS.clue = STINGERS.reveal;
  STINGERS.done = STINGERS.success;
  STINGERS.sting = STINGERS.hit;
  STINGERS.alarm = STINGERS.danger;
  STINGERS.title = STINGERS.logo;

  A.stinger = function (name, opts) {
    if (!ok) {
      if (!ctx && !dead) A.init();
      if (!ok) return STUB;
    }
    opts = opts || {};
    var fn = STINGERS[name];
    if (!fn) {
      /* an unknown stinger still needs to land — pick one deterministically */
      var keys = ['reveal', 'tension', 'hit', 'warm', 'danger', 'success'];
      var h = 0, s = String(name || '');
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      fn = STINGERS[keys[Math.abs(h) % keys.length]];
    }
    var g = ctx.createGain();
    g.gain.value = (opts.vol === undefined ? 0.8 : opts.vol);
    g.connect(buses.music);
    if (revIn) {
      var rs = ctx.createGain(); rs.gain.value = 0.3;
      g.connect(rs); rs.connect(revIn);
      setTimeout(function () { try { rs.disconnect(); } catch (e) { /* noop */ } }, 6000);
    }
    var t = ctx.currentTime + 0.02;
    try { fn(g, t); } catch (e) { /* noop */ }
    setTimeout(function () { try { g.disconnect(); } catch (e2) { /* noop */ } }, 6000);
    return { stop: function () { try { g.disconnect(); } catch (e3) { /* noop */ } } };
  };

  A.stingers = function () { return Object.keys(STINGERS); };

  /* ------------------------------------------------------------------ */
  /* Per-frame update                                                    */
  /* ------------------------------------------------------------------ */

  var _lsAccum = 0;

  A.update = function (dt, camera) {
    if (!ok) return;
    _lsAccum += dt || 0;
    if (camera && _lsAccum >= 0.03) {
      _lsAccum = 0;
      A.setListener(camera);
    }
    /* keep the scheduler honest even if the interval timer is throttled */
    if (M.cur && M.timer) {
      var st = M.cur;
      if (st.t - ctx.currentTime < 0.06) schedTick();
    }
  };

  A.stopAll = function () {
    if (!ok) return;
    for (var i = active.length - 1; i >= 0; i--) stopHandle(active[i], 0.05);
    A.ambience(null, { fade: 0.2 });
    A.music(null, { fade: 0.3 });
  };

  /* Settings changed elsewhere (menu sliders, save load) */
  SG.bus.on('settings:changed', function () {
    readSettings();
    if (!ok) return;
    A.setBus('master', levels.master);
    A.setBus('music', levels.music);
    A.setBus('sfx', levels.sfx);
    A.setBus('voice', levels.voice);
  });

})(window.SG);
