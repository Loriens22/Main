/* ============================================================================
 * STEVE THE PC REPAIR MAN — 10_audio.js
 * STV.Audio  — 100% Web Audio synthesis. No samples, no files, no network.
 * STV.Voice  — Web Speech API narration with guaranteed subtitle fallback.
 *
 * Architecture
 *   master (compressor -> destination)
 *     ├── sfx        (one-shot voice allocator, hard cap, optional PannerNode)
 *     ├── music      -> musicDuck
 *     ├── voice
 *     └── ambience   -> ambDuck
 *   verbSend -> convolver(procedural impulse) -> verbReturn -> master
 * ==========================================================================*/
(function () {
  'use strict';

  var STV = window.STV = window.STV || {};

  var AC = window.AudioContext || window.webkitAudioContext || null;

  /* ------------------------------------------------------------------ state */
  var ctx = null;
  var ready = false;
  var initTried = false;
  var nodes = {};           // bus graph
  var vol = { master: 0.9, sfx: 0.9, music: 0.6, voice: 1.0, ambience: 0.7 };
  var active = [];          // live one-shot voices
  var MAX_VOICES = 24;
  var housekeeper = null;
  var arng = STV.rng(0xA0D107);   // audio-only jitter; never affects world layout
  var suspendedByUs = false;

  function rnd() { return arng(); }
  function rr(a, b) { return a + (b - a) * arng(); }

  /* ------------------------------------------------------- context lifecycle */
  function makeContext() {
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
    } catch (e) {
      STV.warn('[audio] AudioContext unavailable', e);
      ctx = null;
    }
    return ctx;
  }

  function buildGraph() {
    if (!ctx || nodes.master) return;

    var comp = ctx.createDynamicsCompressor();
    try {
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
    } catch (e) {}

    var master = ctx.createGain();
    master.gain.value = vol.master;
    master.connect(comp);
    comp.connect(ctx.destination);

    function bus(name, v) {
      var g = ctx.createGain();
      g.gain.value = v;
      return g;
    }

    nodes.comp = comp;
    nodes.master = master;
    nodes.sfx = bus('sfx', vol.sfx);
    nodes.music = bus('music', vol.music);
    nodes.voice = bus('voice', vol.voice);
    nodes.ambience = bus('ambience', vol.ambience);

    // duck stages sit between the musical buses and master
    nodes.musicDuck = ctx.createGain(); nodes.musicDuck.gain.value = 1;
    nodes.ambDuck = ctx.createGain(); nodes.ambDuck.gain.value = 1;

    nodes.sfx.connect(master);
    nodes.voice.connect(master);
    nodes.music.connect(nodes.musicDuck); nodes.musicDuck.connect(master);
    nodes.ambience.connect(nodes.ambDuck); nodes.ambDuck.connect(master);

    // procedural reverb
    var conv = ctx.createConvolver();
    try { conv.buffer = impulse(1.9, 2.6, 0.28); } catch (e) {}
    var send = ctx.createGain(); send.gain.value = 1;
    var ret = ctx.createGain(); ret.gain.value = 0.9;
    var vlp = ctx.createBiquadFilter();
    vlp.type = 'lowpass'; vlp.frequency.value = 4200;
    send.connect(conv); conv.connect(vlp); vlp.connect(ret); ret.connect(master);
    nodes.verbSend = send;
    nodes.verbReturn = ret;
    nodes.convolver = conv;
  }

  function init() {
    if (ready) { kick(); return true; }
    if (!AC) {
      if (!initTried) STV.warn('[audio] no Web Audio support — running silent');
      initTried = true;
      return false;
    }
    initTried = true;
    if (!makeContext()) return false;
    try {
      buildGraph();
    } catch (e) {
      STV.warn('[audio] graph build failed', e);
      return false;
    }
    ready = true;
    Api.ready = true;
    Api.master = nodes.master;
    Api.ctx = ctx;
    applySettings();
    kick();
    if (!housekeeper) housekeeper = window.setInterval(sweep, 60);
    if (musicEngine && musicEngine.start) musicEngine.start();
    STV.log('[audio] ready, sampleRate=' + ctx.sampleRate);
    return true;
  }

  /* resume a context that started (or went) suspended — mobile Safari */
  function kick() {
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        var p = ctx.resume();
        if (p && p.then) p.then(function () { STV.log('[audio] resumed'); }, function () {});
      } catch (e) {}
    }
  }

  /* ------------------------------------------------------ procedural buffers */
  var bufCache = {};

  function fillWhite(d, r) {
    for (var i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }
  function fillPink(d, r) {
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < d.length; i++) {
      var w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  function fillBrown(d, r) {
    var last = 0;
    for (var i = 0; i < d.length; i++) {
      var w = r() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }

  /* cached noise buffer; kind: white|pink|brown, seconds long, mono */
  function noiseBuf(kind, secs) {
    if (!ctx) return null;
    secs = secs || 2;
    var key = kind + '@' + secs;
    return STV.memo(bufCache, key, function () {
      var n = Math.max(128, Math.floor(ctx.sampleRate * secs));
      var b = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = b.getChannelData(0);
      var r = STV.rng(kind.length * 7919 + Math.floor(secs * 1000) + 13);
      if (kind === 'pink') fillPink(d, r);
      else if (kind === 'brown') fillBrown(d, r);
      else fillWhite(d, r);
      return b;
    });
  }

  /* procedural reverb impulse: stereo decaying noise with an early cluster */
  function impulse(secs, decay, spread) {
    var n = Math.floor(ctx.sampleRate * secs);
    var b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c);
      var rr2 = STV.rng(0x51EE + c * 977);
      for (var i = 0; i < n; i++) {
        var t = i / n;
        var env = Math.pow(1 - t, decay);
        var s = (rr2() * 2 - 1) * env;
        // sparse early reflections give it a room, not a wash
        if (i < ctx.sampleRate * spread && rr2() > 0.985) s += (rr2() * 2 - 1) * (1 - t) * 0.8;
        d[i] = s * 0.7;
      }
    }
    return b;
  }

  /* ------------------------------------------------------------- node sugar */
  function gainNode(v) { var g = ctx.createGain(); g.gain.value = (v == null ? 1 : v); return g; }
  function biquad(type, freq, q, gainDb) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    if (freq != null) f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    if (gainDb != null) f.gain.value = gainDb;
    return f;
  }
  function oscNode(type, freq) {
    var o = ctx.createOscillator();
    if (type === 'custom') return o;
    o.type = type || 'sine';
    if (freq != null) o.frequency.value = freq;
    return o;
  }
  function noiseNode(kind, secs, rate) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf(kind || 'white', secs || 2);
    if (rate) s.playbackRate.value = rate;
    return s;
  }
  /* waveshaper curve for warmth / distortion; k 0..100 */
  var shaperCache = {};
  function shaperCurve(k) {
    var key = 'k' + Math.round(k);
    return STV.memo(shaperCache, key, function () {
      var n = 1024, c = new Float32Array(n), deg = Math.PI / 180;
      for (var i = 0; i < n; i++) {
        var x = (i * 2) / n - 1;
        c[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      return c;
    });
  }
  function shaper(k) {
    var ws = ctx.createWaveShaper();
    ws.curve = shaperCurve(k == null ? 8 : k);
    ws.oversample = '2x';
    return ws;
  }

  var MIN = 0.0001;
  function safe(v) { return v > MIN ? v : MIN; }

  /* percussive envelope: silence -> peak (atk) -> exp decay (dec) */
  function perc(param, t0, peak, atk, dec) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(MIN, t0);
    param.linearRampToValueAtTime(safe(peak), t0 + Math.max(0.0005, atk));
    param.exponentialRampToValueAtTime(MIN, t0 + Math.max(0.0015, atk + dec));
    return atk + dec;
  }
  /* full ADSR; returns total seconds */
  function adsr(param, t0, o) {
    var a = o.a == null ? 0.01 : o.a;
    var d = o.d == null ? 0.08 : o.d;
    var s = o.s == null ? 0.6 : o.s;
    var h = o.hold == null ? 0.2 : o.hold;
    var r = o.r == null ? 0.2 : o.r;
    var pk = o.peak == null ? 1 : o.peak;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(MIN, t0);
    param.linearRampToValueAtTime(safe(pk), t0 + a);
    param.exponentialRampToValueAtTime(safe(pk * s), t0 + a + d);
    param.setValueAtTime(safe(pk * s), t0 + a + d + h);
    param.exponentialRampToValueAtTime(MIN, t0 + a + d + h + r);
    return a + d + h + r;
  }
  /* linear-in, hold, linear-out — for pads and drones */
  function swell(param, t0, peak, up, hold, down) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(MIN, t0);
    param.linearRampToValueAtTime(safe(peak), t0 + up);
    param.setValueAtTime(safe(peak), t0 + up + hold);
    param.linearRampToValueAtTime(MIN, t0 + up + hold + down);
    return up + hold + down;
  }
  function ramp(param, to, t, secs) {
    try {
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(to, t + Math.max(0.001, secs));
    } catch (e) {}
  }
  function glide(param, from, to, t, secs) {
    try {
      param.setValueAtTime(Math.max(0.01, from), t);
      param.exponentialRampToValueAtTime(Math.max(0.01, to), t + Math.max(0.005, secs));
    } catch (e) {}
  }

  /* midi -> Hz */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ------------------------------------------------------- 3D panner support */
  function makePanner(pos) {
    var p = ctx.createPanner();
    try {
      p.panningModel = STV.isMobile ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.6;
      p.maxDistance = 60;
      p.rolloffFactor = 1.3;
      p.coneInnerAngle = 360;
    } catch (e) {}
    setPannerPos(p, pos);
    return p;
  }
  function setPannerPos(p, pos) {
    if (!p || !pos) return;
    var x = pos.x || 0, y = pos.y || 0, z = pos.z || 0;
    if (p.positionX) {
      try {
        var t = ctx.currentTime;
        p.positionX.setValueAtTime(x, t);
        p.positionY.setValueAtTime(y, t);
        p.positionZ.setValueAtTime(z, t);
        return;
      } catch (e) {}
    }
    if (p.setPosition) { try { p.setPosition(x, y, z); } catch (e) {} }
  }

  /* --------------------------------------------------------- voice allocator */
  function killVoice(v, fast) {
    if (v.dead) return;
    v.dead = true;
    var t = ctx.currentTime;
    try {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.linearRampToValueAtTime(0, t + (fast ? 0.012 : 0.05));
    } catch (e) {}
    var srcs = v.srcs;
    window.setTimeout(function () {
      for (var i = 0; i < srcs.length; i++) {
        try { srcs[i].stop(); } catch (e) {}
        try { srcs[i].disconnect(); } catch (e) {}
      }
      try { v.out.disconnect(); } catch (e) {}
      if (v.panner) { try { v.panner.disconnect(); } catch (e) {} }
      if (v.send) { try { v.send.disconnect(); } catch (e) {} }
    }, fast ? 30 : 90);
    var idx = active.indexOf(v);
    if (idx >= 0) active.splice(idx, 1);
  }

  function sweep() {
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = active.length - 1; i >= 0; i--) {
      var v = active[i];
      if (v.endAt && t > v.endAt) killVoice(v, true);
    }
  }

  function allocVoice(busKey, opts) {
    if (!ready) return null;
    opts = opts || {};
    if (active.length >= MAX_VOICES) {
      // steal the voice closest to finishing, else the oldest
      var best = null;
      for (var i = 0; i < active.length; i++) {
        if (active[i].priority > 0) continue;
        if (!best || active[i].endAt < best.endAt) best = active[i];
      }
      killVoice(best || active[0], true);
    }
    var dest = nodes[busKey] || nodes.sfx;
    var out = gainNode(opts.vol == null ? 1 : opts.vol);
    var panner = null;
    if (opts.pos && !opts.flat) {
      panner = makePanner(opts.pos);
      out.connect(panner);
      panner.connect(dest);
    } else {
      out.connect(dest);
    }
    var v = {
      out: out, panner: panner, srcs: [], send: null, dead: false,
      t0: ctx.currentTime + (opts.delay || 0),
      endAt: 0, priority: opts.priority || 0
    };
    /* attach a reverb send from this voice */
    v.verb = function (amount) {
      if (v.send || !nodes.verbSend) return;
      v.send = gainNode(amount);
      out.connect(v.send);
      v.send.connect(nodes.verbSend);
    };
    v.add = function (src) { v.srcs.push(src); return src; };
    v.release = function (secs) {
      v.endAt = v.t0 + Math.max(0.05, secs) + 0.25;
      for (var i = 0; i < v.srcs.length; i++) {
        try { v.srcs[i].stop(v.endAt); } catch (e) {}
      }
    };
    v.stop = function () { killVoice(v, false); };
    v.move = function (pos) { setPannerPos(v.panner, pos); };
    active.push(v);
    return v;
  }

  /* ------------------------------------------------ declarative sound blocks */
  /* tone(): one oscillator + amp env (+ optional pitch sweep, filter, vibrato) */
  function tone(v, o) {
    var t = (o.t == null ? v.t0 : o.t);
    var osc = v.add(oscNode(o.type || 'sine', o.freq || 440));
    var g = gainNode(0);
    var last = osc;
    if (o.detune) { try { osc.detune.value = o.detune; } catch (e) {} }
    if (o.to != null) glide(osc.frequency, o.freq || 440, o.to, t, o.sweep == null ? (o.dur || 0.2) : o.sweep);
    if (o.filter) {
      var f = biquad(o.filter.type || 'lowpass', o.filter.freq || 1200, o.filter.q, o.filter.gain);
      if (o.filter.to != null) glide(f.frequency, o.filter.freq || 1200, o.filter.to, t, o.filter.sweep || o.dur || 0.2);
      last.connect(f); last = f;
    }
    if (o.shape) { var ws = shaper(o.shape); last.connect(ws); last = ws; }
    last.connect(g);
    g.connect(v.out);
    var dur;
    if (o.adsr) dur = adsr(g.gain, t, o.adsr);
    else dur = perc(g.gain, t, o.peak == null ? 0.5 : o.peak, o.atk == null ? 0.005 : o.atk, o.dur == null ? 0.25 : o.dur);
    if (o.vib) {
      var lfo = v.add(oscNode('sine', o.vib.rate || 5));
      var lg = gainNode(o.vib.depth || 4);
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.06);
    return dur;
  }

  /* nz(): a filtered noise burst */
  function nz(v, o) {
    var t = (o.t == null ? v.t0 : o.t);
    var src = v.add(noiseNode(o.kind || 'white', o.buf || 2, o.rate || 1));
    var g = gainNode(0);
    var last = src;
    if (o.loop) src.loop = true;
    if (o.filter) {
      var f = biquad(o.filter.type || 'bandpass', o.filter.freq || 1000, o.filter.q, o.filter.gain);
      if (o.filter.to != null) glide(f.frequency, o.filter.freq || 1000, o.filter.to, t, o.filter.sweep || o.dur || 0.2);
      if (o.filter.q2 != null) ramp(f.Q, o.filter.q2, t, o.filter.sweep || o.dur || 0.2);
      last.connect(f); last = f;
      if (o.filter2) {
        var f2 = biquad(o.filter2.type || 'highpass', o.filter2.freq || 200, o.filter2.q);
        last.connect(f2); last = f2;
      }
    }
    if (o.shape) { var ws = shaper(o.shape); last.connect(ws); last = ws; }
    last.connect(g);
    g.connect(v.out);
    var dur;
    if (o.adsr) dur = adsr(g.gain, t, o.adsr);
    else dur = perc(g.gain, t, o.peak == null ? 0.4 : o.peak, o.atk == null ? 0.002 : o.atk, o.dur == null ? 0.2 : o.dur);
    src.start(t, o.offset == null ? rnd() * 1.5 : o.offset);
    src.stop(t + dur + 0.05);
    return dur;
  }

  /* click(): a tiny impulse — the glue in almost every mechanical sound */
  function click(v, t, peak, freq, len) {
    return nz(v, {
      t: t, peak: peak == null ? 0.35 : peak, atk: 0.0006, dur: len == null ? 0.02 : len,
      filter: { type: 'bandpass', freq: freq == null ? 2600 : freq, q: 1.4 }
    });
  }

  /* ---------------------------------------------------------- the sfx table */
  var SFX = {};
  function def(name, fn) { SFX[name] = fn; }

  function play(name, opts) {
    if (!ready) {
      if (!initTried) init();
      if (!ready) return null;
    }
    var fn = SFX[name];
    if (!fn) { STV.warn('[audio] unknown sfx "' + name + '"'); return null; }
    opts = opts || {};
    var v = allocVoice(opts.bus || 'sfx', opts);
    if (!v) return null;
    if (opts.rate || opts.detune) { v.rate = opts.rate || 1; v.detune = opts.detune || 0; }
    var dur = 0.4;
    try { dur = fn(v, opts) || 0.4; } catch (e) { STV.warn('[audio] sfx "' + name + '" failed', e); }
    v.release(dur);
    return v;
  }

  /* ------------------------------------------------------------ core UI sfx */
  def('click', function (v) {
    click(v, v.t0, 0.5, 3200, 0.018);
    tone(v, { type: 'square', freq: 1800, to: 900, peak: 0.14, dur: 0.035, atk: 0.001 });
    return 0.07;
  });
  def('clickSoft', function (v) {
    nz(v, { peak: 0.22, atk: 0.001, dur: 0.03, filter: { type: 'lowpass', freq: 2200, q: 0.8 } });
    tone(v, { type: 'sine', freq: 620, to: 380, peak: 0.1, dur: 0.05 });
    return 0.08;
  });
  def('uiHover', function (v) {
    tone(v, { type: 'sine', freq: 1240, peak: 0.09, atk: 0.004, dur: 0.06 });
    tone(v, { type: 'sine', freq: 2480, peak: 0.03, atk: 0.002, dur: 0.04 });
    return 0.09;
  });
  def('uiConfirm', function (v) {
    var t = v.t0;
    tone(v, { t: t, type: 'triangle', freq: mtof(76), peak: 0.22, atk: 0.004, dur: 0.11 });
    tone(v, { t: t + 0.055, type: 'triangle', freq: mtof(83), peak: 0.2, atk: 0.004, dur: 0.18 });
    tone(v, { t: t + 0.055, type: 'sine', freq: mtof(95), peak: 0.07, atk: 0.004, dur: 0.22 });
    v.verb(0.1);
    return 0.34;
  });
  def('uiBack', function (v) {
    var t = v.t0;
    tone(v, { t: t, type: 'triangle', freq: mtof(79), peak: 0.18, atk: 0.003, dur: 0.09 });
    tone(v, { t: t + 0.05, type: 'triangle', freq: mtof(72), peak: 0.16, atk: 0.003, dur: 0.16 });
    return 0.26;
  });
  def('uiError', function (v) {
    var t = v.t0;
    tone(v, { t: t, type: 'sawtooth', freq: 220, to: 190, peak: 0.16, atk: 0.003, dur: 0.13,
              filter: { type: 'lowpass', freq: 1400, q: 3 } });
    tone(v, { t: t + 0.13, type: 'sawtooth', freq: 165, to: 140, peak: 0.16, atk: 0.003, dur: 0.22,
              filter: { type: 'lowpass', freq: 1100, q: 3 } });
    return 0.4;
  });
  def('mouseClick', function (v) {
    click(v, v.t0, 0.42, 4200, 0.012);
    click(v, v.t0 + 0.055, 0.3, 3400, 0.014);
    return 0.09;
  });
  def('keyType', function (v) {
    var t = v.t0;
    nz(v, { t: t, peak: 0.3, atk: 0.0005, dur: 0.022,
            filter: { type: 'bandpass', freq: rr(1800, 3400), q: 2.2 } });
    tone(v, { t: t, type: 'square', freq: rr(320, 460), to: 180, peak: 0.06, dur: 0.03 });
    nz(v, { t: t + 0.035, peak: 0.12, atk: 0.0005, dur: 0.018,
            filter: { type: 'bandpass', freq: rr(1400, 2200), q: 2 } });
    return 0.07;
  });
  def('whoosh', function (v) {
    nz(v, { kind: 'pink', peak: 0.32, atk: 0.14, dur: 0.42,
            filter: { type: 'bandpass', freq: 300, to: 2600, q: 0.9, sweep: 0.5 } });
    nz(v, { kind: 'brown', peak: 0.18, atk: 0.2, dur: 0.5,
            filter: { type: 'lowpass', freq: 900, to: 240, q: 1, sweep: 0.6 } });
    v.verb(0.2);
    return 0.62;
  });

  /* ------------------------------------------------------------- public API */
  var musicEngine = null;    // filled in by the music section below
  var ambEngine = null;      // filled in by the ambience section below

  function setVolume(kind, v) {
    v = STV.clamp(v == null ? 1 : v, 0, 1.6);
    if (!(kind in vol)) return;
    vol[kind] = v;
    if (!ready) return;
    var n = kind === 'master' ? nodes.master : nodes[kind];
    if (n) ramp(n.gain, v, ctx.currentTime, 0.05);
  }

  function applySettings() {
    var s = STV.settings || {};
    setVolume('master', s.master == null ? 0.9 : s.master);
    setVolume('sfx', s.sfx == null ? 0.9 : s.sfx);
    setVolume('music', s.music == null ? 0.6 : s.music);
    setVolume('voice', s.voice == null ? 1.0 : s.voice);
    setVolume('ambience', (s.sfx == null ? 0.9 : s.sfx) * 0.8);
    if (STV.Voice && STV.Voice.setEnabled && s.voiceOn != null) {
      try { STV.Voice.setEnabled(!!s.voiceOn); } catch (e) {}
    }
  }

  var duckUntil = 0;
  function duckFor(ms) {
    if (!ready) return;
    var t = ctx.currentTime;
    var end = t + (ms || 1200) / 1000;
    if (end < duckUntil) return;
    duckUntil = end;
    var d = 0.34;
    try {
      nodes.musicDuck.gain.cancelScheduledValues(t);
      nodes.musicDuck.gain.setValueAtTime(nodes.musicDuck.gain.value, t);
      nodes.musicDuck.gain.linearRampToValueAtTime(d, t + 0.18);
      nodes.musicDuck.gain.setValueAtTime(d, end);
      nodes.musicDuck.gain.linearRampToValueAtTime(1, end + 0.5);
      nodes.ambDuck.gain.cancelScheduledValues(t);
      nodes.ambDuck.gain.setValueAtTime(nodes.ambDuck.gain.value, t);
      nodes.ambDuck.gain.linearRampToValueAtTime(0.55, t + 0.18);
      nodes.ambDuck.gain.setValueAtTime(0.55, end);
      nodes.ambDuck.gain.linearRampToValueAtTime(1, end + 0.5);
    } catch (e) {}
  }

  function stopAll() {
    for (var i = active.length - 1; i >= 0; i--) killVoice(active[i], true);
    if (musicEngine) musicEngine.stop(0);
    if (ambEngine) ambEngine.stop(0);
    if (STV.Voice && STV.Voice.cancel) { try { STV.Voice.cancel(); } catch (e) {} }
  }

  /* listener follows the camera; uses the modern AudioParam API when present */
  var listenerWarned = false;
  function updateListener(camera) {
    if (!ready || !camera) return;
    var L = ctx.listener;
    if (!L) return;
    try {
      if (camera.updateMatrixWorld) camera.updateMatrixWorld();
      var m = camera.matrixWorld && camera.matrixWorld.elements;
      if (!m) return;
      var px = m[12], py = m[13], pz = m[14];
      var fx = -m[8], fy = -m[9], fz = -m[10];
      var ux = m[4], uy = m[5], uz = m[6];
      var t = ctx.currentTime;
      if (L.positionX) {
        L.positionX.setValueAtTime(px, t);
        L.positionY.setValueAtTime(py, t);
        L.positionZ.setValueAtTime(pz, t);
        if (L.forwardX) {
          L.forwardX.setValueAtTime(fx, t);
          L.forwardY.setValueAtTime(fy, t);
          L.forwardZ.setValueAtTime(fz, t);
          L.upX.setValueAtTime(ux, t);
          L.upY.setValueAtTime(uy, t);
          L.upZ.setValueAtTime(uz, t);
        }
      } else {
        /* Safari 14 and friends */
        if (L.setPosition) L.setPosition(px, py, pz);
        if (L.setOrientation) L.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    } catch (e) {
      if (!listenerWarned) { listenerWarned = true; STV.warn('[audio] listener update failed', e); }
    }
  }

  var Api = {
    ready: false,
    ctx: null,
    master: null,
    init: function () { return init(); },
    setVolume: setVolume,
    play: play,
    listener: updateListener,
    duckFor: duckFor,
    stopAll: stopAll,
    has: function (name) { return !!SFX[name]; },
    names: function () { var a = []; for (var k in SFX) a.push(k); return a.sort(); },
    music: function (track, fadeMs) {
      if (!ready) init();
      if (!musicEngine) return;
      musicEngine.request(track, fadeMs == null ? 900 : fadeMs);
    },
    ambience: function (name, fadeMs) {
      if (!ready) init();
      if (!ambEngine) return;
      ambEngine.set(name, fadeMs == null ? 900 : fadeMs);
    },
    nowPlaying: function () {
      return {
        music: musicEngine ? musicEngine.current() : null,
        ambience: ambEngine ? ambEngine.current() : null
      };
    },
    suspend: function () {
      if (!ctx) return;
      suspendedByUs = true;
      try { ctx.suspend(); } catch (e) {}
    },
    resume: function () {
      if (!ctx) { init(); return; }
      suspendedByUs = false;
      kick();
    },
    voices: function () { return active.length; }
  };
  STV.Audio = Api;

  /* --------------------------------------------------------------- wiring */
  STV.bus.on('sfx', function (p) {
    if (!p || !p.name) return;
    play(p.name, { pos: p.pos || null, vol: p.vol == null ? 1 : p.vol, rate: p.rate, detune: p.detune });
  });
  STV.bus.on('music', function (p) {
    if (!p) return;
    Api.music(p.track == null ? null : p.track, p.fade == null ? (p.fadeMs == null ? 900 : p.fadeMs) : p.fade);
  });
  STV.bus.on('settings:changed', function () { applySettings(); });
  STV.bus.on('dialogue:line', function (p) {
    if (!p) return;
    duckFor((p.ms || 2400) + 400);
  });
  STV.bus.on('level:unload', function () {
    for (var i = active.length - 1; i >= 0; i--) killVoice(active[i], true);
  });

  /* first-gesture unlock (mobile Safari starts suspended) */
  (function () {
    var evts = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'];
    function unlock() {
      if (!ready) init(); else kick();
      if (ready && ctx && ctx.state === 'running') {
        for (var i = 0; i < evts.length; i++) {
          try { window.removeEventListener(evts[i], unlock, true); } catch (e) {}
        }
      }
    }
    for (var i = 0; i < evts.length; i++) {
      try { window.addEventListener(evts[i], unlock, true); } catch (e) {}
    }
  })();

  try {
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) {
        try { ctx.suspend(); } catch (e) {}
      } else if (!suspendedByUs) {
        kick();
      }
    }, false);
  } catch (e) {}

  /* ==========================================================================
   * SFX — doors, footsteps, and the physical world
   * ========================================================================*/

  /* the shop doorbell: two inharmonic struck bells, bright then settling */
  def('doorChime', function (v) {
    var t = v.t0;
    var parts = [1, 2.76, 5.4, 8.93];
    var base = 1046;
    for (var i = 0; i < parts.length; i++) {
      tone(v, {
        t: t, type: 'sine', freq: base * parts[i],
        peak: 0.24 / (i + 1.2), atk: 0.002, dur: 1.5 / (i * 0.7 + 1)
      });
      tone(v, {
        t: t + 0.13, type: 'sine', freq: base * 1.335 * parts[i],
        peak: 0.2 / (i + 1.2), atk: 0.002, dur: 1.8 / (i * 0.7 + 1)
      });
    }
    nz(v, { t: t, peak: 0.12, atk: 0.0008, dur: 0.03, filter: { type: 'highpass', freq: 4000 } });
    v.verb(0.28);
    return 2.0;
  });

  /* hinge creak: a resonant band walking up, then the latch letting go */
  def('doorOpen', function (v) {
    var t = v.t0;
    nz(v, { t: t, kind: 'pink', peak: 0.16, atk: 0.02, dur: 0.5, rate: 0.8,
            filter: { type: 'bandpass', freq: 420, to: 900, q: 12, sweep: 0.5 } });
    nz(v, { t: t + 0.08, kind: 'pink', peak: 0.09, atk: 0.03, dur: 0.42,
            filter: { type: 'bandpass', freq: 1350, to: 2100, q: 16, sweep: 0.45 } });
    nz(v, { t: t, kind: 'brown', peak: 0.18, atk: 0.05, dur: 0.55,
            filter: { type: 'lowpass', freq: 700, q: 1 } });
    click(v, t + 0.02, 0.22, 2200, 0.02);
    v.verb(0.12);
    return 0.75;
  });

  def('doorClose', function (v) {
    var t = v.t0;
    nz(v, { t: t, kind: 'brown', peak: 0.2, atk: 0.06, dur: 0.16,
            filter: { type: 'lowpass', freq: 1400, to: 500, q: 1, sweep: 0.2 } });
    tone(v, { t: t + 0.15, type: 'sine', freq: 128, to: 62, peak: 0.5, atk: 0.003, dur: 0.22 });
    nz(v, { t: t + 0.15, kind: 'brown', peak: 0.42, atk: 0.001, dur: 0.14,
            filter: { type: 'lowpass', freq: 900, q: 1.6 } });
    click(v, t + 0.19, 0.3, 2800, 0.025);
    v.verb(0.15);
    return 0.5;
  });

  /* fire door / vault door: mass, then a long metallic tail */
  def('doorHeavy', function (v) {
    var t = v.t0;
    nz(v, { t: t, kind: 'brown', peak: 0.3, atk: 0.12, dur: 0.5,
            filter: { type: 'lowpass', freq: 380, q: 1.2 } });
    tone(v, { t: t + 0.42, type: 'sine', freq: 74, to: 36, peak: 0.75, atk: 0.004, dur: 0.7 });
    tone(v, { t: t + 0.42, type: 'triangle', freq: 112, to: 92, peak: 0.24, atk: 0.004, dur: 0.45 });
    nz(v, { t: t + 0.42, kind: 'brown', peak: 0.45, atk: 0.002, dur: 0.35,
            filter: { type: 'lowpass', freq: 620, q: 2.2 } });
    tone(v, { t: t + 0.44, type: 'sine', freq: 1730, peak: 0.05, atk: 0.003, dur: 1.1 });
    tone(v, { t: t + 0.44, type: 'sine', freq: 2410, peak: 0.035, atk: 0.003, dur: 0.9 });
    v.verb(0.4);
    return 1.6;
  });

  /* footsteps — one generator, five surface profiles */
  var STEP = {
    footstepCarpet:   { lp: 900,  bp: 320,  q: 1.1, peak: 0.30, dur: 0.10, kind: 'pink',  grit: 0,    body: 60,  bodyPk: 0.12 },
    footstepTile:     { lp: 6800, bp: 2400, q: 2.4, peak: 0.34, dur: 0.075, kind: 'white', grit: 0.16, body: 150, bodyPk: 0.10, ring: 3100 },
    footstepConcrete: { lp: 3200, bp: 900,  q: 1.6, peak: 0.32, dur: 0.09, kind: 'white', grit: 0.12, body: 95,  bodyPk: 0.16 },
    footstepGrass:    { lp: 7200, bp: 3600, q: 0.9, peak: 0.22, dur: 0.14, kind: 'white', grit: 0.34, body: 0,   bodyPk: 0 },
    footstepMetal:    { lp: 8000, bp: 1800, q: 3.0, peak: 0.30, dur: 0.08, kind: 'white', grit: 0.1,  body: 180, bodyPk: 0.13, ring: 1420 }
  };
  function makeStep(cfg) {
    return function (v, o) {
      var t = v.t0;
      var sc = (o && o.rate) ? o.rate : 1;
      nz(v, { t: t, kind: cfg.kind, peak: cfg.peak, atk: 0.003, dur: cfg.dur,
              filter: { type: 'bandpass', freq: cfg.bp * sc, to: cfg.bp * 0.55 * sc, q: cfg.q, sweep: cfg.dur },
              filter2: { type: 'lowpass', freq: cfg.lp } });
      if (cfg.body) {
        tone(v, { t: t, type: 'sine', freq: cfg.body * sc, to: cfg.body * 0.62 * sc,
                  peak: cfg.bodyPk, atk: 0.004, dur: cfg.dur * 1.6 });
      }
      if (cfg.grit) {
        var n = 3;
        for (var i = 0; i < n; i++) {
          nz(v, { t: t + 0.006 + rnd() * 0.05, peak: cfg.grit * (0.5 + rnd() * 0.5),
                  atk: 0.0004, dur: 0.012 + rnd() * 0.02,
                  filter: { type: 'bandpass', freq: 2200 + rnd() * 4200, q: 3 } });
        }
      }
      if (cfg.ring) {
        tone(v, { t: t + 0.004, type: 'sine', freq: cfg.ring * (0.96 + rnd() * 0.08),
                  peak: 0.05, atk: 0.002, dur: 0.28 });
      }
      return cfg.dur * 2.2 + 0.1;
    };
  }
  (function () {
    for (var k in STEP) if (Object.prototype.hasOwnProperty.call(STEP, k)) def(k, makeStep(STEP[k]));
  })();

  /* ==========================================================================
   * SFX — the machines Steve actually repairs
   * ========================================================================*/

  /* CRT: 15.734kHz flyback whine over 50Hz mains hum and its harmonics */
  function crtWhine(v, t, dur, peak) {
    var o = v.add(oscNode('sawtooth', 15734));
    var f = biquad('highpass', 9000, 0.7);
    var g = gainNode(0);
    o.connect(f); f.connect(g); g.connect(v.out);
    swell(g.gain, t, peak, 0.12, Math.max(0.01, dur - 0.3), 0.18);
    /* the whine is never perfectly stable */
    var lfo = v.add(oscNode('sine', 0.7));
    var lg = gainNode(28);
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function mainsHum(v, t, dur, peak) {
    var harm = [1, 2, 3, 4];
    var amp = [1, 0.42, 0.2, 0.09];
    for (var i = 0; i < harm.length; i++) {
      var o = v.add(oscNode(i === 0 ? 'sine' : 'triangle', 50 * harm[i]));
      var g = gainNode(0);
      o.connect(g); g.connect(v.out);
      swell(g.gain, t, peak * amp[i], 0.2, Math.max(0.01, dur - 0.45), 0.25);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  def('crtHum', function (v, o) {
    var dur = (o && o.dur) || 4.0;
    var t = v.t0;
    mainsHum(v, t, dur, 0.075);
    crtWhine(v, t, dur, 0.055);
    nz(v, { t: t, kind: 'pink', peak: 0.012, atk: 0.3, dur: dur,
            filter: { type: 'highpass', freq: 3000 } });
    return dur + 0.4;
  });

  /* switch-on: degauss thunk, static rush, then the whine spins up */
  def('crtOn', function (v) {
    var t = v.t0;
    click(v, t, 0.45, 900, 0.03);
    tone(v, { t: t + 0.01, type: 'sine', freq: 96, to: 44, peak: 0.55, atk: 0.004, dur: 0.5,
              vib: { rate: 14, depth: 22 } });
    nz(v, { t: t + 0.02, kind: 'white', peak: 0.2, atk: 0.01, dur: 0.35,
            filter: { type: 'highpass', freq: 1600, to: 5200, sweep: 0.35 } });
    var o = v.add(oscNode('sawtooth', 6000));
    var f = biquad('highpass', 8000, 0.7);
    var g = gainNode(0);
    o.connect(f); f.connect(g); g.connect(v.out);
    glide(o.frequency, 6000, 15734, t + 0.05, 0.5);
    swell(g.gain, t + 0.05, 0.05, 0.5, 1.3, 0.4);
    o.start(t + 0.05); o.stop(t + 2.4);
    mainsHum(v, t + 0.3, 1.9, 0.05);
    return 2.5;
  });

  /* switch-off: the whine collapses, the picture shrinks to a dot, tick */
  def('crtOff', function (v) {
    var t = v.t0;
    var o = v.add(oscNode('sawtooth', 15734));
    var f = biquad('highpass', 6000, 0.7);
    var g = gainNode(0.05);
    o.connect(f); f.connect(g); g.connect(v.out);
    glide(o.frequency, 15734, 3200, t, 0.22);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(MIN, t + 0.3);
    o.start(t); o.stop(t + 0.35);
    nz(v, { t: t, kind: 'white', peak: 0.22, atk: 0.002, dur: 0.14,
            filter: { type: 'bandpass', freq: 5200, to: 1200, q: 1.2, sweep: 0.16 } });
    tone(v, { t: t + 0.02, type: 'sine', freq: 220, to: 40, peak: 0.3, atk: 0.004, dur: 0.28 });
    click(v, t + 0.26, 0.3, 3400, 0.02);
    return 0.5;
  });

  /* case fan: brown-noise air + blade-pass tone, with spin-up */
  def('fanSpin', function (v, o) {
    var dur = (o && o.dur) || 3.2;
    var t = v.t0;
    var src = v.add(noiseNode('brown', 2, 1));
    src.loop = true;
    var lp = biquad('lowpass', 900, 1.4);
    var bp = biquad('bandpass', 260, 2.2);
    var g = gainNode(0);
    src.connect(lp); lp.connect(g); g.connect(v.out);
    var g2 = gainNode(0);
    src.connect(bp); bp.connect(g2); g2.connect(v.out);
    swell(g.gain, t, 0.16, 0.6, Math.max(0.01, dur - 1.1), 0.5);
    swell(g2.gain, t, 0.1, 0.6, Math.max(0.01, dur - 1.1), 0.5);
    src.start(t); src.stop(t + dur + 0.1);
    /* blade pass: 7 blades at ~1800rpm -> ~210Hz, plus a whiny harmonic */
    var blade = v.add(oscNode('triangle', 60));
    var bg = gainNode(0);
    blade.connect(bg); bg.connect(v.out);
    glide(blade.frequency, 60, 212, t, 0.9);
    swell(bg.gain, t, 0.055, 0.8, Math.max(0.01, dur - 1.3), 0.5);
    blade.start(t); blade.stop(t + dur + 0.1);
    var hi = v.add(oscNode('sine', 424));
    var hg = gainNode(0);
    hi.connect(hg); hg.connect(v.out);
    glide(hi.frequency, 120, 424, t, 0.9);
    swell(hg.gain, t, 0.02, 0.9, Math.max(0.01, dur - 1.4), 0.5);
    hi.start(t); hi.stop(t + dur + 0.1);
    return dur + 0.3;
  });

  /* mechanical hard disk: voice-coil servo clicks + platter whine + seek chatter */
  def('hddSeek', function (v) {
    var t = v.t0;
    /* platter spindle whine underneath */
    tone(v, { t: t, type: 'triangle', freq: 120, peak: 0.045, atk: 0.02, dur: 0.6 });
    tone(v, { t: t, type: 'sine', freq: 7200, peak: 0.012, atk: 0.02, dur: 0.6 });
    var n = 4 + Math.floor(rnd() * 4);
    var tt = t;
    for (var i = 0; i < n; i++) {
      /* the actuator arm slamming: short bandpassed noise burst */
      nz(v, { t: tt, peak: 0.3 - i * 0.02, atk: 0.0008, dur: 0.018 + rnd() * 0.02,
              filter: { type: 'bandpass', freq: 1400 + rnd() * 2600, q: 5 + rnd() * 6 } });
      /* the servo click that lands with it */
      tone(v, { t: tt, type: 'square', freq: 2600 + rnd() * 1400, to: 700,
                peak: 0.07, atk: 0.0005, dur: 0.012 });
      nz(v, { t: tt + 0.012, peak: 0.09, atk: 0.0005, dur: 0.03,
              filter: { type: 'highpass', freq: 5200 } });
      tt += 0.045 + rnd() * 0.075;
    }
    return (tt - t) + 0.6;
  });

  /* 3.5" floppy: a stepper motor grinding through tracks, then the head thunk */
  def('floppySeek', function (v) {
    var t = v.t0;
    var steps = 14 + Math.floor(rnd() * 10);
    var rate = 0.0125;
    for (var i = 0; i < steps; i++) {
      var tt = t + i * rate;
      nz(v, { t: tt, peak: 0.16, atk: 0.0004, dur: 0.008,
              filter: { type: 'bandpass', freq: 1150, q: 9 } });
      tone(v, { t: tt, type: 'square', freq: 168, peak: 0.05, atk: 0.0004, dur: 0.009,
                filter: { type: 'lowpass', freq: 2400, q: 2 } });
    }
    var end = t + steps * rate;
    tone(v, { t: t, type: 'sawtooth', freq: 80, peak: 0.05, atk: 0.02,
              dur: steps * rate, filter: { type: 'lowpass', freq: 420, q: 4 } });
    nz(v, { t: end + 0.02, kind: 'brown', peak: 0.24, atk: 0.001, dur: 0.09,
            filter: { type: 'lowpass', freq: 800, q: 1.4 } });
    click(v, end + 0.02, 0.2, 1800, 0.02);
    return (end - t) + 0.35;
  });

  /* the PC speaker. One transistor, one square wave, no apologies. */
  def('beepPC', function (v, o) {
    var f = (o && o.freq) || 1000;
    var d = (o && o.dur) || 0.16;
    var t = v.t0;
    var osc = v.add(oscNode('square', f));
    var g = gainNode(0);
    var hp = biquad('highpass', 400, 0.7);
    osc.connect(hp); hp.connect(g); g.connect(v.out);
    g.gain.setValueAtTime(MIN, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.004);
    g.gain.setValueAtTime(0.14, t + d);
    g.gain.linearRampToValueAtTime(MIN, t + d + 0.008);
    osc.start(t); osc.stop(t + d + 0.03);
    return d + 0.05;
  });

  /* POST complete: warm major arpeggio with a bell on top */
  def('bootChime', function (v) {
    var t = v.t0;
    var seq = [53, 60, 65, 69, 72];   /* F2 C3 F3 A3 C4 */
    for (var i = 0; i < seq.length; i++) {
      var tt = t + i * 0.085;
      tone(v, { t: tt, type: 'triangle', freq: mtof(seq[i]), peak: 0.16, atk: 0.006,
                dur: 0.9 - i * 0.06, filter: { type: 'lowpass', freq: 3600, q: 0.8 } });
      tone(v, { t: tt, type: 'sine', freq: mtof(seq[i] + 12), peak: 0.05, atk: 0.004, dur: 0.5 });
    }
    tone(v, { t: t + 0.42, type: 'sine', freq: mtof(84), peak: 0.09, atk: 0.003, dur: 1.5 });
    tone(v, { t: t + 0.42, type: 'sine', freq: mtof(84) * 2.76, peak: 0.02, atk: 0.003, dur: 0.7 });
    v.verb(0.3);
    return 1.9;
  });

  /* ==========================================================================
   * SFX — workshop, props, the cat, the world outside
   * ========================================================================*/

  /* parallel formant bank — the thing that makes a saw sound like a throat.
     F = [{f0,f1,a}, ...] each entry sweeps f0 -> f1 over dur */
  function formants(v, input, t, dur, F, out) {
    for (var i = 0; i < F.length; i++) {
      var bp = biquad('bandpass', F[i].f0, F[i].q == null ? 7 : F[i].q);
      glide(bp.frequency, F[i].f0, F[i].f1, t, dur);
      var g = gainNode(F[i].a == null ? 1 : F[i].a);
      input.connect(bp); bp.connect(g); g.connect(out);
    }
  }

  def('solderSizzle', function (v) {
    var t = v.t0;
    /* flux flashing off: a hiss that blooms then dies, plus micro-crackles */
    nz(v, { t: t, kind: 'white', peak: 0.26, atk: 0.012, dur: 0.32,
            filter: { type: 'highpass', freq: 2600, to: 5400, sweep: 0.3 } });
    nz(v, { t: t, kind: 'pink', peak: 0.14, atk: 0.02, dur: 0.42,
            filter: { type: 'bandpass', freq: 1500, q: 1.1 } });
    for (var i = 0; i < 9; i++) {
      nz(v, { t: t + 0.02 + rnd() * 0.36, peak: 0.06 + rnd() * 0.09, atk: 0.0004,
              dur: 0.006 + rnd() * 0.012,
              filter: { type: 'bandpass', freq: 3200 + rnd() * 5000, q: 6 } });
    }
    return 0.6;
  });

  def('screwTurn', function (v) {
    var t = v.t0;
    var n = 5 + Math.floor(rnd() * 3);
    for (var i = 0; i < n; i++) {
      var tt = t + i * (0.055 + rnd() * 0.02);
      nz(v, { t: tt, peak: 0.16 + i * 0.012, atk: 0.001, dur: 0.035,
              filter: { type: 'bandpass', freq: 900 + i * 130 + rnd() * 200, q: 4.5 } });
      tone(v, { t: tt, type: 'triangle', freq: 260 + i * 22, to: 190, peak: 0.05,
                atk: 0.001, dur: 0.04 });
    }
    return n * 0.07 + 0.15;
  });

  def('toolClink', function (v) {
    var t = v.t0;
    var base = 1400 + rnd() * 900;
    var parts = [1, 2.41, 4.07, 6.3];
    for (var i = 0; i < parts.length; i++) {
      tone(v, { t: t, type: 'sine', freq: base * parts[i], peak: 0.16 / (i + 1.3),
                atk: 0.0008, dur: 0.42 / (i * 0.8 + 1) });
    }
    nz(v, { t: t, peak: 0.18, atk: 0.0005, dur: 0.02, filter: { type: 'highpass', freq: 3200 } });
    tone(v, { t: t + 0.09, type: 'sine', freq: base * 0.97, peak: 0.05, atk: 0.001, dur: 0.2 });
    v.verb(0.12);
    return 0.55;
  });

  def('caseOpen', function (v) {
    var t = v.t0;
    click(v, t, 0.3, 2100, 0.02);
    /* thin steel panel flexing as it comes away */
    nz(v, { t: t + 0.03, kind: 'pink', peak: 0.2, atk: 0.03, dur: 0.34,
            filter: { type: 'bandpass', freq: 620, to: 1500, q: 6, sweep: 0.35 } });
    tone(v, { t: t + 0.05, type: 'triangle', freq: 340, to: 290, peak: 0.07, atk: 0.02, dur: 0.4 });
    nz(v, { t: t + 0.3, peak: 0.12, atk: 0.001, dur: 0.06,
            filter: { type: 'bandpass', freq: 2400, q: 3 } });
    return 0.62;
  });

  def('latchClick', function (v) {
    var t = v.t0;
    click(v, t, 0.4, 3000, 0.014);
    tone(v, { t: t, type: 'square', freq: 900, to: 380, peak: 0.1, atk: 0.0006, dur: 0.03 });
    click(v, t + 0.028, 0.24, 1700, 0.02);
    return 0.09;
  });

  def('briefcaseOpen', function (v) {
    var t = v.t0;
    /* two latches, a beat apart, then the lid and its hinge */
    click(v, t, 0.42, 3400, 0.018);
    tone(v, { t: t, type: 'square', freq: 1300, to: 420, peak: 0.12, atk: 0.0005, dur: 0.035 });
    click(v, t + 0.18, 0.42, 3100, 0.018);
    tone(v, { t: t + 0.18, type: 'square', freq: 1180, to: 400, peak: 0.12, atk: 0.0005, dur: 0.035 });
    nz(v, { t: t + 0.34, kind: 'pink', peak: 0.14, atk: 0.05, dur: 0.5,
            filter: { type: 'bandpass', freq: 700, to: 1250, q: 8, sweep: 0.5 } });
    tone(v, { t: t + 0.34, type: 'sine', freq: 190, to: 150, peak: 0.1, atk: 0.04, dur: 0.5 });
    nz(v, { t: t + 0.82, kind: 'brown', peak: 0.16, atk: 0.002, dur: 0.1,
            filter: { type: 'lowpass', freq: 700 } });
    v.verb(0.14);
    return 1.05;
  });

  def('paperRustle', function (v) {
    var t = v.t0;
    for (var i = 0; i < 5; i++) {
      var tt = t + i * (0.05 + rnd() * 0.05);
      nz(v, { t: tt, kind: 'white', peak: 0.1 + rnd() * 0.1, atk: 0.006, dur: 0.07 + rnd() * 0.06,
              filter: { type: 'highpass', freq: 2400 + rnd() * 2400 },
              filter2: { type: 'lowpass', freq: 9000 } });
    }
    return 0.55;
  });

  def('phoneBuzz', function (v) {
    var t = v.t0;
    /* vibration motor against a desk: eccentric-mass buzz, two pulses */
    for (var p = 0; p < 2; p++) {
      var tt = t + p * 0.55;
      var o = v.add(oscNode('square', 47));
      var lp = biquad('lowpass', 260, 3);
      var g = gainNode(0);
      o.connect(lp); lp.connect(g); g.connect(v.out);
      swell(g.gain, tt, 0.3, 0.03, 0.3, 0.06);
      o.start(tt); o.stop(tt + 0.42);
      nz(v, { t: tt, kind: 'brown', peak: 0.14, atk: 0.02, dur: 0.34,
              filter: { type: 'bandpass', freq: 130, q: 2 } });
      nz(v, { t: tt + 0.005, peak: 0.07, atk: 0.004, dur: 0.3,
              filter: { type: 'bandpass', freq: 2100, q: 1.4 } });
    }
    return 1.05;
  });

  def('phoneRing', function (v) {
    var t = v.t0;
    /* a cheap electronic warble: two tones alternating, twice */
    for (var b = 0; b < 2; b++) {
      var bt = t + b * 0.9;
      for (var i = 0; i < 10; i++) {
        var f = (i % 2) ? 1150 : 880;
        tone(v, { t: bt + i * 0.05, type: 'square', freq: f, peak: 0.09, atk: 0.003, dur: 0.05,
                  filter: { type: 'bandpass', freq: 1400, q: 1.1 } });
      }
    }
    v.verb(0.16);
    return 1.9;
  });

  /* Kernel. Formant-swept saw with a pitch arc — a real meow, not a beep. */
  def('catMeow', function (v, o) {
    var t = v.t0;
    var dur = 0.62 + rnd() * 0.18;
    var base = 420 * ((o && o.rate) ? o.rate : 1) * (0.92 + rnd() * 0.18);
    var src = v.add(oscNode('sawtooth', base));
    /* mrr-EE-ow: up fast, hold, then fall away */
    src.frequency.setValueAtTime(base * 0.72, t);
    src.frequency.exponentialRampToValueAtTime(base * 1.32, t + dur * 0.22);
    src.frequency.exponentialRampToValueAtTime(base * 1.18, t + dur * 0.55);
    src.frequency.exponentialRampToValueAtTime(base * 0.62, t + dur);
    var pre = gainNode(0.5);
    src.connect(pre);
    var mix = gainNode(0);
    /* vowel sweep [æ] -> [ɔ]: F1 down, F2 way down, F3 roughly parked */
    formants(v, pre, t, dur, [
      { f0: 860, f1: 460, a: 1.0, q: 8 },
      { f0: 1900, f1: 820, a: 0.55, q: 9 },
      { f0: 2750, f1: 2500, a: 0.22, q: 11 },
      { f0: 3600, f1: 3300, a: 0.09, q: 12 }
    ], mix);
    mix.connect(v.out);
    mix.gain.setValueAtTime(MIN, t);
    mix.gain.linearRampToValueAtTime(0.55, t + 0.05);
    mix.gain.setValueAtTime(0.55, t + dur * 0.6);
    mix.gain.exponentialRampToValueAtTime(MIN, t + dur + 0.06);
    /* the little bleat in a cat's voice */
    var lfo = v.add(oscNode('sine', 22));
    var lg = gainNode(base * 0.035);
    lfo.connect(lg); lg.connect(src.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    src.start(t); src.stop(t + dur + 0.12);
    /* breath */
    nz(v, { t: t, kind: 'pink', peak: 0.035, atk: 0.04, dur: dur,
            filter: { type: 'bandpass', freq: 1600, to: 900, q: 1.4, sweep: dur } });
    v.verb(0.1);
    return dur + 0.25;
  });

  def('catPurr', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 2.6;
    var src = v.add(noiseNode('brown', 2, 1));
    src.loop = true;
    var lp = biquad('lowpass', 380, 2.6);
    var amp = gainNode(0);
    src.connect(lp); lp.connect(amp); amp.connect(v.out);
    /* the purr is amplitude modulation at ~25Hz, not a tone */
    var mod = v.add(oscNode('triangle', 25));
    var modg = gainNode(0.5);
    mod.connect(modg); modg.connect(amp.gain);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.5, t + 0.25);
    amp.gain.setValueAtTime(0.5, t + dur - 0.4);
    amp.gain.linearRampToValueAtTime(0, t + dur);
    mod.start(t); mod.stop(t + dur + 0.05);
    src.start(t); src.stop(t + dur + 0.05);
    /* the chest resonance under it */
    var sub = v.add(oscNode('sine', 25));
    var sg = gainNode(0);
    sub.connect(sg); sg.connect(v.out);
    swell(sg.gain, t, 0.09, 0.3, Math.max(0.01, dur - 0.7), 0.4);
    sub.start(t); sub.stop(t + dur + 0.05);
    return dur + 0.2;
  });

  def('bubbles', function (v) {
    var t = v.t0;
    var n = 5 + Math.floor(rnd() * 5);
    for (var i = 0; i < n; i++) {
      var tt = t + rnd() * 1.1;
      var f = 380 + rnd() * 900;
      tone(v, { t: tt, type: 'sine', freq: f, to: f * (1.8 + rnd()), peak: 0.13,
                atk: 0.0015, dur: 0.045 + rnd() * 0.04, sweep: 0.05 });
      nz(v, { t: tt, peak: 0.04, atk: 0.0005, dur: 0.01,
              filter: { type: 'bandpass', freq: f * 2.2, q: 4 } });
    }
    nz(v, { t: t, kind: 'pink', peak: 0.03, atk: 0.2, dur: 1.2,
            filter: { type: 'bandpass', freq: 2600, q: 0.8 } });
    return 1.5;
  });

  def('vendingThunk', function (v) {
    var t = v.t0;
    /* spiral motor whirs, the can lets go, then the flap */
    var m = v.add(oscNode('sawtooth', 84));
    var mf = biquad('lowpass', 520, 5);
    var mg = gainNode(0);
    m.connect(mf); mf.connect(mg); mg.connect(v.out);
    swell(mg.gain, t, 0.11, 0.08, 0.6, 0.1);
    m.start(t); m.stop(t + 0.85);
    nz(v, { t: t, kind: 'brown', peak: 0.07, atk: 0.06, dur: 0.7,
            filter: { type: 'bandpass', freq: 300, q: 2 } });
    /* the drop */
    nz(v, { t: t + 0.85, kind: 'brown', peak: 0.45, atk: 0.002, dur: 0.16,
            filter: { type: 'lowpass', freq: 640, q: 1.8 } });
    tone(v, { t: t + 0.85, type: 'sine', freq: 130, to: 52, peak: 0.55, atk: 0.003, dur: 0.3 });
    tone(v, { t: t + 0.86, type: 'triangle', freq: 470, to: 420, peak: 0.09, atk: 0.003, dur: 0.35 });
    /* flap swinging shut */
    nz(v, { t: t + 1.14, kind: 'brown', peak: 0.18, atk: 0.004, dur: 0.12,
            filter: { type: 'lowpass', freq: 1100 } });
    v.verb(0.2);
    return 1.5;
  });

  def('coinDrop', function (v) {
    var t = v.t0;
    var base = 2400 + rnd() * 800;
    var gap = 0.11;
    for (var i = 0; i < 5; i++) {
      var tt = t + (i * gap) - (i * i * 0.012);
      var amp = 0.2 * Math.pow(0.62, i);
      tone(v, { t: tt, type: 'sine', freq: base * (1 + i * 0.01), peak: amp, atk: 0.0006, dur: 0.22 });
      tone(v, { t: tt, type: 'sine', freq: base * 2.73, peak: amp * 0.5, atk: 0.0006, dur: 0.14 });
      tone(v, { t: tt, type: 'sine', freq: base * 5.1, peak: amp * 0.22, atk: 0.0006, dur: 0.08 });
      nz(v, { t: tt, peak: amp * 0.4, atk: 0.0003, dur: 0.01,
              filter: { type: 'highpass', freq: 5000 } });
    }
    v.verb(0.2);
    return 0.9;
  });

  def('clockTick', function (v, o) {
    var t = v.t0;
    var tock = o && o.tock;
    nz(v, { t: t, peak: 0.2, atk: 0.0004, dur: 0.011,
            filter: { type: 'bandpass', freq: tock ? 2100 : 2900, q: 3.2 } });
    tone(v, { t: t, type: 'triangle', freq: tock ? 620 : 780, to: 300, peak: 0.055,
              atk: 0.0004, dur: 0.018 });
    return 0.06;
  });

  /* ------------------------------------------------------------- vehicles */
  def('carDoor', function (v) {
    var t = v.t0;
    nz(v, { t: t, kind: 'brown', peak: 0.42, atk: 0.003, dur: 0.18,
            filter: { type: 'lowpass', freq: 700, q: 1.6 } });
    tone(v, { t: t, type: 'sine', freq: 110, to: 48, peak: 0.6, atk: 0.004, dur: 0.26 });
    tone(v, { t: t + 0.005, type: 'triangle', freq: 320, to: 260, peak: 0.12, atk: 0.003, dur: 0.2 });
    click(v, t + 0.03, 0.26, 2600, 0.02);
    /* trim rattle */
    for (var i = 0; i < 3; i++) {
      nz(v, { t: t + 0.05 + rnd() * 0.12, peak: 0.05, atk: 0.0006, dur: 0.02,
              filter: { type: 'bandpass', freq: 1800 + rnd() * 2000, q: 5 } });
    }
    v.verb(0.1);
    return 0.55;
  });

  def('carStart', function (v) {
    var t = v.t0;
    /* starter motor: a whining saw that hunts, then the engine catches */
    var st = v.add(oscNode('sawtooth', 55));
    var sf = biquad('bandpass', 430, 4);
    var sg = gainNode(0);
    st.connect(sf); sf.connect(sg); sg.connect(v.out);
    glide(st.frequency, 42, 62, t, 0.9);
    swell(sg.gain, t, 0.16, 0.06, 0.75, 0.12);
    st.start(t); st.stop(t + 1.0);
    var wob = v.add(oscNode('sine', 9));
    var wg = gainNode(90);
    wob.connect(wg); wg.connect(sf.frequency);
    wob.start(t); wob.stop(t + 1.0);
    nz(v, { t: t, kind: 'brown', peak: 0.1, atk: 0.05, dur: 0.85,
            filter: { type: 'bandpass', freq: 240, q: 1.4 } });
    /* catch */
    var et = t + 0.95;
    var eng = v.add(oscNode('sawtooth', 42));
    var elp = biquad('lowpass', 340, 3.4);
    var eg = gainNode(0);
    var ews = shaper(14);
    eng.connect(ews); ews.connect(elp); elp.connect(eg); eg.connect(v.out);
    glide(eng.frequency, 62, 118, et, 0.28);
    glide(eng.frequency, 118, 46, et + 0.3, 0.9);
    swell(eg.gain, et, 0.3, 0.05, 1.3, 0.5);
    eng.start(et); eng.stop(et + 2.0);
    nz(v, { t: et, kind: 'brown', peak: 0.22, atk: 0.02, dur: 1.6,
            filter: { type: 'lowpass', freq: 420, q: 1.2 } });
    return 3.0;
  });

  def('carAway', function (v) {
    var t = v.t0;
    var eng = v.add(oscNode('sawtooth', 92));
    var lp = biquad('lowpass', 420, 3);
    var ws = shaper(12);
    var g = gainNode(0);
    eng.connect(ws); ws.connect(lp); lp.connect(g); g.connect(v.out);
    glide(eng.frequency, 52, 128, t, 1.1);
    glide(eng.frequency, 128, 96, t + 1.15, 0.5);
    glide(eng.frequency, 96, 150, t + 1.7, 1.3);
    glide(lp.frequency, 620, 190, t, 3.0);
    swell(g.gain, t, 0.3, 0.15, 1.6, 1.6);
    eng.start(t); eng.stop(t + 3.5);
    nz(v, { t: t, kind: 'brown', peak: 0.16, atk: 0.2, dur: 3.1,
            filter: { type: 'lowpass', freq: 900, to: 260, q: 1, sweep: 3.0 } });
    /* tyres on wet tarmac, receding */
    nz(v, { t: t + 0.2, kind: 'pink', peak: 0.1, atk: 0.3, dur: 2.9,
            filter: { type: 'bandpass', freq: 1400, to: 500, q: 0.9, sweep: 2.8 } });
    return 3.6;
  });

  /* ---------------------------------------------------------- environment */
  def('wind', function (v, o) {
    var dur = (o && o.dur) || 4.5;
    var t = v.t0;
    var src = v.add(noiseNode('pink', 2, 1));
    src.loop = true;
    var bp = biquad('bandpass', 520, 1.1);
    var lp = biquad('lowpass', 2400, 0.8);
    var g = gainNode(0);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(v.out);
    swell(g.gain, t, 0.24, 0.9, Math.max(0.01, dur - 2.2), 1.3);
    /* gusts: two slow LFOs on the band centre so it never repeats obviously */
    var l1 = v.add(oscNode('sine', 0.11));
    var g1 = gainNode(280);
    l1.connect(g1); g1.connect(bp.frequency);
    var l2 = v.add(oscNode('sine', 0.29));
    var g2 = gainNode(140);
    l2.connect(g2); g2.connect(bp.frequency);
    l1.start(t); l1.stop(t + dur + 0.1);
    l2.start(t); l2.stop(t + dur + 0.1);
    src.start(t); src.stop(t + dur + 0.1);
    return dur + 0.3;
  });

  def('rainLight', function (v, o) {
    var dur = (o && o.dur) || 4.0;
    var t = v.t0;
    var src = v.add(noiseNode('white', 2, 1));
    src.loop = true;
    var hp = biquad('highpass', 1800, 0.7);
    var lp = biquad('lowpass', 8200, 0.7);
    var g = gainNode(0);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(v.out);
    swell(g.gain, t, 0.12, 0.6, Math.max(0.01, dur - 1.4), 0.8);
    src.start(t); src.stop(t + dur + 0.1);
    /* individual drops hitting glass */
    var n = Math.floor(dur * 7);
    for (var i = 0; i < n; i++) {
      nz(v, { t: t + rnd() * dur, peak: 0.03 + rnd() * 0.05, atk: 0.0004, dur: 0.012,
              filter: { type: 'bandpass', freq: 2800 + rnd() * 5000, q: 7 } });
    }
    return dur + 0.3;
  });

  def('planeCabin', function (v, o) {
    var dur = (o && o.dur) || 5.0;
    var t = v.t0;
    var src = v.add(noiseNode('brown', 2, 1));
    src.loop = true;
    var lp = biquad('lowpass', 340, 1.1);
    var pk = biquad('peaking', 92, 2.4, 9);
    var g = gainNode(0);
    src.connect(lp); lp.connect(pk); pk.connect(g); g.connect(v.out);
    swell(g.gain, t, 0.5, 1.2, Math.max(0.01, dur - 2.6), 1.4);
    src.start(t); src.stop(t + dur + 0.1);
    /* the hiss of the air vents on top */
    var s2 = v.add(noiseNode('pink', 2, 1));
    s2.loop = true;
    var bp2 = biquad('bandpass', 2600, 0.9);
    var g2 = gainNode(0);
    s2.connect(bp2); bp2.connect(g2); g2.connect(v.out);
    swell(g2.gain, t, 0.06, 1.2, Math.max(0.01, dur - 2.6), 1.4);
    s2.start(t); s2.stop(t + dur + 0.1);
    return dur + 0.3;
  });

  def('seatbeltDing', function (v) {
    var t = v.t0;
    /* the two-note cabin chime, sine-clean with a long tail */
    tone(v, { t: t, type: 'sine', freq: mtof(81), peak: 0.22, atk: 0.004, dur: 0.9 });
    tone(v, { t: t, type: 'sine', freq: mtof(81) * 2, peak: 0.05, atk: 0.004, dur: 0.5 });
    tone(v, { t: t + 0.36, type: 'sine', freq: mtof(76), peak: 0.22, atk: 0.004, dur: 1.3 });
    tone(v, { t: t + 0.36, type: 'sine', freq: mtof(76) * 2, peak: 0.05, atk: 0.004, dur: 0.7 });
    v.verb(0.3);
    return 1.9;
  });

  /* ==========================================================================
   * SFX — security, infiltration, and the back half of the game
   * ========================================================================*/

  def('badgeBeep', function (v) {
    var t = v.t0;
    tone(v, { t: t, type: 'square', freq: 2093, peak: 0.1, atk: 0.002, dur: 0.06,
              filter: { type: 'bandpass', freq: 2300, q: 1.4 } });
    tone(v, { t: t + 0.09, type: 'square', freq: 3136, peak: 0.09, atk: 0.002, dur: 0.09,
              filter: { type: 'bandpass', freq: 3300, q: 1.4 } });
    click(v, t, 0.12, 5200, 0.008);
    return 0.22;
  });

  def('badgeDeny', function (v) {
    var t = v.t0;
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.19;
      tone(v, { t: tt, type: 'square', freq: 196, peak: 0.16, atk: 0.002, dur: 0.13,
                filter: { type: 'lowpass', freq: 1100, q: 2.6 } });
      nz(v, { t: tt, peak: 0.07, atk: 0.002, dur: 0.12,
              filter: { type: 'bandpass', freq: 700, q: 2 } });
    }
    return 0.42;
  });

  /* pan/tilt head: a small stepper crawling, with the clunk at each end */
  def('cameraServo', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 0.55;
    click(v, t, 0.16, 2400, 0.012);
    var m = v.add(oscNode('square', 74));
    var bp = biquad('bandpass', 640, 7);
    var g = gainNode(0);
    m.connect(bp); bp.connect(g); g.connect(v.out);
    glide(m.frequency, 68, 88, t, dur);
    swell(g.gain, t, 0.075, 0.03, Math.max(0.01, dur - 0.09), 0.06);
    m.start(t); m.stop(t + dur + 0.05);
    nz(v, { t: t, kind: 'pink', peak: 0.05, atk: 0.02, dur: dur,
            filter: { type: 'bandpass', freq: 1900, q: 3 } });
    click(v, t + dur, 0.14, 1900, 0.014);
    return dur + 0.12;
  });

  /* a real two-tone klaxon: high/low alternation, saw through a screaming band */
  def('alarmKlaxon', function (v, o) {
    var t = v.t0;
    var cycles = (o && o.cycles) || 3;
    var hi = 622, lo = 466;                 /* an augmented-fourth: nobody likes it */
    var seg = 0.42;
    var osc = v.add(oscNode('sawtooth', lo));
    var bp = biquad('bandpass', 1250, 3.4);
    var ws = shaper(22);
    var g = gainNode(0);
    osc.connect(ws); ws.connect(bp); bp.connect(g); g.connect(v.out);
    var tt = t, total = 0;
    for (var i = 0; i < cycles * 2; i++) {
      var f = (i % 2) ? lo : hi;
      osc.frequency.setValueAtTime(f, tt);
      /* the horn takes a moment to spin up on each blast */
      osc.frequency.linearRampToValueAtTime(f * 1.01, tt + seg * 0.9);
      g.gain.setValueAtTime(MIN, tt);
      g.gain.linearRampToValueAtTime(0.3, tt + 0.05);
      g.gain.setValueAtTime(0.3, tt + seg - 0.06);
      g.gain.linearRampToValueAtTime(0.02, tt + seg);
      bp.frequency.setValueAtTime(f * 2.0, tt);
      tt += seg;
      total += seg;
    }
    osc.start(t); osc.stop(tt + 0.1);
    /* an octave-down body so it carries down a corridor */
    var sub = v.add(oscNode('square', lo / 2));
    var slp = biquad('lowpass', 400, 1.4);
    var sg = gainNode(0);
    sub.connect(slp); slp.connect(sg); sg.connect(v.out);
    var t2 = t;
    for (var j = 0; j < cycles * 2; j++) {
      var f2 = ((j % 2) ? lo : hi) / 2;
      sub.frequency.setValueAtTime(f2, t2);
      sg.gain.setValueAtTime(MIN, t2);
      sg.gain.linearRampToValueAtTime(0.11, t2 + 0.05);
      sg.gain.setValueAtTime(0.11, t2 + seg - 0.06);
      sg.gain.linearRampToValueAtTime(MIN, t2 + seg);
      t2 += seg;
    }
    sub.start(t); sub.stop(tt + 0.1);
    v.verb(0.35);
    return total + 0.5;
  });

  def('alarmSoft', function (v) {
    var t = v.t0;
    for (var i = 0; i < 3; i++) {
      var tt = t + i * 0.42;
      tone(v, { t: tt, type: 'sine', freq: mtof(79), peak: 0.14, atk: 0.006, dur: 0.3 });
      tone(v, { t: tt, type: 'sine', freq: mtof(86), peak: 0.05, atk: 0.006, dur: 0.22 });
      tone(v, { t: tt + 0.16, type: 'sine', freq: mtof(74), peak: 0.11, atk: 0.006, dur: 0.32 });
    }
    v.verb(0.25);
    return 1.6;
  });

  /* handler on the radio: squelch, syllable-gated band-limited noise, squelch */
  def('radioChatter', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 2.2;
    click(v, t, 0.18, 2600, 0.02);
    nz(v, { t: t + 0.005, peak: 0.1, atk: 0.002, dur: 0.05,
            filter: { type: 'highpass', freq: 3000 } });
    var src = v.add(noiseNode('pink', 2, 1));
    src.loop = true;
    var hp = biquad('highpass', 380, 0.8);
    var lp = biquad('lowpass', 2900, 0.9);
    var pk = biquad('peaking', 1600, 1.6, 8);
    var amp = gainNode(0);
    src.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(amp); amp.connect(v.out);
    /* fake syllables: gate the amplitude in speech-shaped chunks */
    var tt = t + 0.06;
    amp.gain.setValueAtTime(MIN, t);
    while (tt < t + dur - 0.1) {
      var len = 0.06 + rnd() * 0.13;
      var pkv = 0.06 + rnd() * 0.12;
      amp.gain.linearRampToValueAtTime(pkv, tt + 0.02);
      amp.gain.setValueAtTime(pkv, tt + len);
      amp.gain.linearRampToValueAtTime(0.004, tt + len + 0.03);
      tt += len + 0.04 + rnd() * 0.1;
    }
    amp.gain.linearRampToValueAtTime(MIN, t + dur);
    src.start(t); src.stop(t + dur + 0.1);
    /* ring-mod garble so it reads as a radio, not a person in the room */
    var rm = v.add(oscNode('square', 118));
    var rg = gainNode(0.35);
    rm.connect(rg); rg.connect(amp.gain);
    rm.start(t); rm.stop(t + dur + 0.05);
    click(v, t + dur, 0.14, 2200, 0.02);
    nz(v, { t: t + dur, peak: 0.09, atk: 0.002, dur: 0.07,
            filter: { type: 'highpass', freq: 2600 } });
    return dur + 0.2;
  });

  /* a wall of fans in a cold room, tuned around 400Hz with beating harmonics */
  def('serverHum', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 5.0;
    var src = v.add(noiseNode('brown', 2, 1));
    src.loop = true;
    var lp = biquad('lowpass', 1400, 0.9);
    var g = gainNode(0);
    src.connect(lp); lp.connect(g); g.connect(v.out);
    swell(g.gain, t, 0.24, 1.0, Math.max(0.01, dur - 2.2), 1.2);
    src.start(t); src.stop(t + dur + 0.1);
    var freqs = [98, 199, 400, 401.7, 598, 802];
    var amps = [0.09, 0.05, 0.06, 0.055, 0.028, 0.016];
    for (var i = 0; i < freqs.length; i++) {
      var o2 = v.add(oscNode(i < 2 ? 'sine' : 'triangle', freqs[i]));
      var g2 = gainNode(0);
      o2.connect(g2); g2.connect(v.out);
      swell(g2.gain, t, amps[i], 1.2, Math.max(0.01, dur - 2.6), 1.4);
      o2.start(t); o2.stop(t + dur + 0.1);
    }
    /* air moving through a grille */
    nz(v, { t: t, kind: 'pink', peak: 0.07, atk: 1.0, dur: dur,
            filter: { type: 'bandpass', freq: 3200, q: 0.7 } });
    return dur + 0.3;
  });

  def('relayClack', function (v) {
    var t = v.t0;
    nz(v, { t: t, peak: 0.34, atk: 0.0004, dur: 0.014,
            filter: { type: 'bandpass', freq: 1700, q: 2.4 } });
    tone(v, { t: t, type: 'square', freq: 420, to: 150, peak: 0.16, atk: 0.0005, dur: 0.03 });
    tone(v, { t: t, type: 'sine', freq: 2900, peak: 0.05, atk: 0.0005, dur: 0.11 });
    nz(v, { t: t + 0.028, peak: 0.16, atk: 0.0004, dur: 0.02,
            filter: { type: 'bandpass', freq: 1150, q: 3 } });
    v.verb(0.18);
    return 0.16;
  });

  def('vaultUnlock', function (v) {
    var t = v.t0;
    /* three relays arming */
    for (var i = 0; i < 3; i++) {
      var tt = t + i * 0.26;
      nz(v, { t: tt, peak: 0.26, atk: 0.0005, dur: 0.016,
              filter: { type: 'bandpass', freq: 1500 + i * 300, q: 2.6 } });
      tone(v, { t: tt, type: 'square', freq: 380 + i * 60, to: 140, peak: 0.12,
                atk: 0.0005, dur: 0.03 });
    }
    /* the motor pulling the bolts */
    var mt = t + 0.85;
    var m = v.add(oscNode('sawtooth', 58));
    var mf = biquad('lowpass', 420, 4.5);
    var mg = gainNode(0);
    m.connect(mf); mf.connect(mg); mg.connect(v.out);
    glide(m.frequency, 46, 66, mt, 1.1);
    swell(mg.gain, mt, 0.15, 0.12, 0.9, 0.2);
    m.start(mt); m.stop(mt + 1.4);
    nz(v, { t: mt, kind: 'brown', peak: 0.14, atk: 0.1, dur: 1.15,
            filter: { type: 'bandpass', freq: 280, q: 1.6 } });
    /* bolts landing home */
    var bt = mt + 1.2;
    for (var j = 0; j < 4; j++) {
      var bj = bt + j * 0.075;
      nz(v, { t: bj, kind: 'brown', peak: 0.3, atk: 0.001, dur: 0.11,
              filter: { type: 'lowpass', freq: 620, q: 2 } });
      tone(v, { t: bj, type: 'sine', freq: 90 - j * 6, to: 40, peak: 0.35, atk: 0.002, dur: 0.24 });
    }
    /* and the room lets out a breath */
    tone(v, { t: bt + 0.32, type: 'sine', freq: mtof(41), peak: 0.2, atk: 0.06, dur: 2.2 });
    tone(v, { t: bt + 0.32, type: 'sine', freq: mtof(53), peak: 0.1, atk: 0.08, dur: 1.9 });
    tone(v, { t: bt + 0.32, type: 'sine', freq: mtof(60), peak: 0.05, atk: 0.1, dur: 1.7 });
    v.verb(0.45);
    return 4.4;
  });

  def('powerDown', function (v) {
    var t = v.t0;
    /* mains hum sagging, fans coasting to a stop, one last relay */
    var h = v.add(oscNode('sine', 100));
    var hg = gainNode(0.1);
    h.connect(hg); hg.connect(v.out);
    glide(h.frequency, 100, 26, t, 1.5);
    hg.gain.setValueAtTime(0.1, t);
    hg.gain.exponentialRampToValueAtTime(MIN, t + 1.7);
    h.start(t); h.stop(t + 1.8);
    var f = v.add(oscNode('triangle', 210));
    var fl = biquad('lowpass', 1200, 1.4);
    var fg = gainNode(0.09);
    f.connect(fl); fl.connect(fg); fg.connect(v.out);
    glide(f.frequency, 210, 22, t, 2.0);
    glide(fl.frequency, 1200, 180, t, 2.0);
    fg.gain.setValueAtTime(0.09, t);
    fg.gain.exponentialRampToValueAtTime(MIN, t + 2.1);
    f.start(t); f.stop(t + 2.2);
    var src = v.add(noiseNode('brown', 2, 1));
    src.loop = true;
    var lp = biquad('lowpass', 900, 1);
    var g = gainNode(0.18);
    src.connect(lp); lp.connect(g); g.connect(v.out);
    glide(lp.frequency, 900, 90, t, 2.0);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(MIN, t + 2.2);
    src.start(t); src.stop(t + 2.3);
    click(v, t + 2.05, 0.24, 1400, 0.025);
    v.verb(0.3);
    return 2.6;
  });

  def('glitch', function (v) {
    var t = v.t0;
    var n = 6 + Math.floor(rnd() * 5);
    var tt = t;
    for (var i = 0; i < n; i++) {
      var len = 0.012 + rnd() * 0.05;
      if (rnd() < 0.5) {
        tone(v, { t: tt, type: 'square', freq: 120 + rnd() * 2600, peak: 0.12,
                  atk: 0.0005, dur: len, shape: 30 });
      } else {
        nz(v, { t: tt, peak: 0.16, atk: 0.0005, dur: len,
                filter: { type: 'bandpass', freq: 400 + rnd() * 6000, q: 2 + rnd() * 8 } });
      }
      tt += len + rnd() * 0.03;
    }
    tone(v, { t: t, type: 'sawtooth', freq: 60, to: 34, peak: 0.14, atk: 0.002,
              dur: (tt - t), filter: { type: 'lowpass', freq: 500, q: 3 } });
    return (tt - t) + 0.2;
  });

  def('heartbeat', function (v) {
    var t = v.t0;
    function thump(tt, pk) {
      tone(v, { t: tt, type: 'sine', freq: 68, to: 34, peak: pk, atk: 0.01, dur: 0.26 });
      nz(v, { t: tt, kind: 'brown', peak: pk * 0.35, atk: 0.006, dur: 0.13,
              filter: { type: 'lowpass', freq: 190, q: 1.4 } });
    }
    thump(t, 0.6);
    thump(t + 0.3, 0.42);
    return 0.8;
  });

  def('stinger', function (v) {
    var t = v.t0;
    var chord = [45, 52, 57, 64, 69];
    for (var i = 0; i < chord.length; i++) {
      tone(v, { t: t, type: 'sawtooth', freq: mtof(chord[i]), peak: 0.11, atk: 0.006,
                dur: 1.4 - i * 0.1, detune: (i % 2 ? 6 : -6),
                filter: { type: 'lowpass', freq: 900, to: 5200, q: 1.6, sweep: 0.25 } });
    }
    nz(v, { t: t, kind: 'white', peak: 0.2, atk: 0.004, dur: 0.5,
            filter: { type: 'highpass', freq: 2200, to: 7000, sweep: 0.4 } });
    tone(v, { t: t, type: 'sine', freq: 70, to: 40, peak: 0.5, atk: 0.005, dur: 0.7 });
    v.verb(0.4);
    return 1.8;
  });

  def('stingerDark', function (v) {
    var t = v.t0;
    var chord = [33, 40, 44, 51, 56];    /* minor, with a tritone sitting in it */
    for (var i = 0; i < chord.length; i++) {
      tone(v, { t: t, type: 'sawtooth', freq: mtof(chord[i]), peak: 0.1, atk: 0.03,
                dur: 2.6 - i * 0.15, detune: (i % 2 ? 11 : -9),
                filter: { type: 'lowpass', freq: 2400, to: 420, q: 2.2, sweep: 2.2 } });
    }
    tone(v, { t: t, type: 'sine', freq: 41, peak: 0.42, atk: 0.02, dur: 2.4 });
    nz(v, { t: t, kind: 'brown', peak: 0.18, atk: 0.25, dur: 2.0,
            filter: { type: 'lowpass', freq: 600, to: 160, q: 1, sweep: 1.9 } });
    v.verb(0.5);
    return 3.0;
  });

  def('success', function (v) {
    var t = v.t0;
    var seq = [65, 69, 72, 77];
    for (var i = 0; i < seq.length; i++) {
      var tt = t + i * 0.075;
      tone(v, { t: tt, type: 'triangle', freq: mtof(seq[i]), peak: 0.17, atk: 0.004,
                dur: 0.7 - i * 0.05 });
      tone(v, { t: tt, type: 'sine', freq: mtof(seq[i] + 12), peak: 0.05, atk: 0.003, dur: 0.3 });
    }
    tone(v, { t: t + 0.3, type: 'sine', freq: mtof(89), peak: 0.07, atk: 0.004, dur: 1.1 });
    v.verb(0.3);
    return 1.5;
  });

  def('fail', function (v) {
    var t = v.t0;
    var seq = [60, 56, 51];
    for (var i = 0; i < seq.length; i++) {
      var tt = t + i * 0.13;
      tone(v, { t: tt, type: 'sawtooth', freq: mtof(seq[i]), peak: 0.14, atk: 0.005,
                dur: 0.5 + i * 0.2, detune: -8,
                filter: { type: 'lowpass', freq: 1800, to: 700, q: 2, sweep: 0.6 } });
    }
    tone(v, { t: t + 0.26, type: 'sine', freq: mtof(39), to: mtof(35), peak: 0.3,
              atk: 0.02, dur: 1.0, sweep: 0.9 });
    return 1.5;
  });

  def('detected', function (v) {
    var t = v.t0;
    /* the stab */
    for (var i = 0; i < 3; i++) {
      tone(v, { t: t, type: 'sawtooth', freq: mtof([44, 51, 57][i]), peak: 0.13, atk: 0.003,
                dur: 0.5, detune: i * 7 - 7,
                filter: { type: 'lowpass', freq: 4200, to: 900, q: 2.4, sweep: 0.5 } });
    }
    tone(v, { t: t, type: 'sine', freq: 96, to: 44, peak: 0.5, atk: 0.004, dur: 0.6 });
    /* the rising whoop that tells you they know */
    tone(v, { t: t + 0.12, type: 'square', freq: 420, to: 1500, peak: 0.1, atk: 0.03,
              dur: 0.55, sweep: 0.5, filter: { type: 'bandpass', freq: 900, to: 2600, q: 3, sweep: 0.5 } });
    nz(v, { t: t, kind: 'white', peak: 0.16, atk: 0.003, dur: 0.35,
            filter: { type: 'highpass', freq: 3000, to: 900, sweep: 0.35 } });
    v.verb(0.35);
    return 1.1;
  });

  def('stealthEnter', function (v) {
    var t = v.t0;
    /* the room getting quieter: a sub swell and a reversed-feeling riser */
    tone(v, { t: t, type: 'sine', freq: mtof(29), peak: 0.4, atk: 0.5, dur: 1.6 });
    tone(v, { t: t, type: 'triangle', freq: mtof(41), peak: 0.1, atk: 0.7, dur: 1.4 });
    nz(v, { t: t, kind: 'pink', peak: 0.14, atk: 1.1, dur: 1.3,
            filter: { type: 'bandpass', freq: 400, to: 2600, q: 1.4, sweep: 1.2 } });
    tone(v, { t: t + 1.1, type: 'sine', freq: mtof(72), peak: 0.08, atk: 0.006, dur: 1.2 });
    v.verb(0.4);
    return 2.4;
  });

  def('typewriter', function (v) {
    var t = v.t0;
    /* type bar hitting the platen, then the little bell of the carriage */
    nz(v, { t: t, peak: 0.32, atk: 0.0005, dur: 0.03,
            filter: { type: 'bandpass', freq: 1800 + rnd() * 900, q: 2.2 } });
    tone(v, { t: t, type: 'square', freq: 240, to: 90, peak: 0.11, atk: 0.0005, dur: 0.035 });
    nz(v, { t: t + 0.018, peak: 0.1, atk: 0.0005, dur: 0.05,
            filter: { type: 'highpass', freq: 4200 } });
    tone(v, { t: t + 0.01, type: 'sine', freq: 3100, peak: 0.03, atk: 0.001, dur: 0.09 });
    return 0.14;
  });

  def('dataStream', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 1.1;
    var tt = t;
    while (tt < t + dur) {
      var f = 700 + Math.floor(rnd() * 9) * 220;
      var len = 0.018 + rnd() * 0.02;
      tone(v, { t: tt, type: 'square', freq: f, peak: 0.055, atk: 0.001, dur: len,
                filter: { type: 'bandpass', freq: f * 1.2, q: 3 } });
      tt += len + 0.006;
    }
    /* carrier underneath, like a handshake that never quite finishes */
    tone(v, { t: t, type: 'sine', freq: 1200, peak: 0.02, atk: 0.05, dur: dur });
    tone(v, { t: t, type: 'sine', freq: 2100, peak: 0.014, atk: 0.05, dur: dur });
    nz(v, { t: t, kind: 'white', peak: 0.02, atk: 0.05, dur: dur,
            filter: { type: 'bandpass', freq: 3000, q: 1 } });
    return dur + 0.2;
  });

  def('emp', function (v) {
    var t = v.t0;
    /* charge */
    tone(v, { t: t, type: 'sawtooth', freq: 120, to: 2600, peak: 0.12, atk: 0.4, dur: 0.7,
              sweep: 0.65, filter: { type: 'bandpass', freq: 400, to: 4200, q: 4, sweep: 0.65 } });
    /* discharge */
    var dt = t + 0.7;
    nz(v, { t: dt, kind: 'white', peak: 0.5, atk: 0.001, dur: 0.35,
            filter: { type: 'lowpass', freq: 9000, to: 260, q: 1.6, sweep: 0.35 } });
    tone(v, { t: dt, type: 'sine', freq: 220, to: 24, peak: 0.65, atk: 0.002, dur: 0.9 });
    tone(v, { t: dt, type: 'square', freq: 90, to: 20, peak: 0.16, atk: 0.002, dur: 0.5, shape: 40 });
    /* the ringing afterwards */
    tone(v, { t: dt + 0.05, type: 'sine', freq: 6200, peak: 0.05, atk: 0.01, dur: 1.6 });
    tone(v, { t: dt + 0.05, type: 'sine', freq: 8300, peak: 0.03, atk: 0.01, dur: 1.3 });
    v.verb(0.45);
    return 2.4;
  });

  def('sparkArc', function (v) {
    var t = v.t0;
    var n = 10 + Math.floor(rnd() * 8);
    for (var i = 0; i < n; i++) {
      var tt = t + rnd() * 0.4;
      nz(v, { t: tt, kind: 'white', peak: 0.1 + rnd() * 0.22, atk: 0.0003,
              dur: 0.005 + rnd() * 0.02,
              filter: { type: 'bandpass', freq: 2400 + rnd() * 6000, q: 1.6 } });
    }
    /* the mains-frequency buzz of a sustained arc */
    tone(v, { t: t, type: 'sawtooth', freq: 100, peak: 0.09, atk: 0.004, dur: 0.34,
              shape: 45, filter: { type: 'bandpass', freq: 2600, q: 1.2 } });
    nz(v, { t: t, kind: 'white', peak: 0.12, atk: 0.004, dur: 0.4,
            filter: { type: 'highpass', freq: 4000 } });
    return 0.6;
  });

  def('metalDrag', function (v, o) {
    var t = v.t0;
    var dur = (o && o.dur) || 1.1;
    var src = v.add(noiseNode('white', 2, 0.7));
    src.loop = true;
    var bp = biquad('bandpass', 1200, 14);
    var bp2 = biquad('bandpass', 2450, 18);
    var g = gainNode(0);
    var g2 = gainNode(0);
    src.connect(bp); bp.connect(g); g.connect(v.out);
    src.connect(bp2); bp2.connect(g2); g2.connect(v.out);
    glide(bp.frequency, 900, 1600, t, dur);
    glide(bp2.frequency, 2300, 2700, t, dur);
    swell(g.gain, t, 0.2, 0.08, Math.max(0.01, dur - 0.24), 0.16);
    swell(g2.gain, t, 0.12, 0.08, Math.max(0.01, dur - 0.24), 0.16);
    src.start(t); src.stop(t + dur + 0.1);
    /* low scraping body */
    nz(v, { t: t, kind: 'brown', peak: 0.14, atk: 0.06, dur: dur,
            filter: { type: 'lowpass', freq: 500, q: 2 } });
    /* the judder */
    var jl = v.add(oscNode('sawtooth', 17));
    var jg = gainNode(0.4);
    jl.connect(jg); jg.connect(g.gain);
    jl.start(t); jl.stop(t + dur + 0.05);
    v.verb(0.15);
    return dur + 0.3;
  });

  def('ventOpen', function (v) {
    var t = v.t0;
    /* two screws' worth of grille, a creak, then it slides free */
    click(v, t, 0.28, 2400, 0.018);
    nz(v, { t: t + 0.04, kind: 'pink', peak: 0.17, atk: 0.03, dur: 0.4,
            filter: { type: 'bandpass', freq: 900, to: 1700, q: 11, sweep: 0.4 } });
    tone(v, { t: t + 0.04, type: 'triangle', freq: 380, to: 320, peak: 0.06, atk: 0.03, dur: 0.42 });
    nz(v, { t: t + 0.5, kind: 'white', peak: 0.16, atk: 0.03, dur: 0.3,
            filter: { type: 'bandpass', freq: 2400, q: 3 } });
    nz(v, { t: t + 0.78, kind: 'brown', peak: 0.2, atk: 0.002, dur: 0.13,
            filter: { type: 'lowpass', freq: 850, q: 1.6 } });
    tone(v, { t: t + 0.78, type: 'sine', freq: 1650, peak: 0.05, atk: 0.002, dur: 0.4 });
    v.verb(0.2);
    return 1.2;
  });

  /*__APPEND__*/

  STV.log('audio loaded');
})();
