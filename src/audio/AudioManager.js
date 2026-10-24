// Procedural WebAudio sound design for the bus and the city, built from native nodes only
// (no AudioWorklet: Chromium refuses worklet modules from blob: URLs on file://, and the engine
// must work from a single local HTML file on Android and iOS).
//
//   * BusVoice.js   engine, driveline, tyres, wind, compressor, HVAC of one bus (pooled, max 3)
//   * OneShots.js   doors, beeps, bell, brakes, kneeling, purge, indicator, bumps, starter ...
//   * dsp.js        buffers, waves, listener zones and the pure maths (unit-tested)
//   * GameAudio.js  translates game objects and events into calls on this class
//
// Gesture / unlock (iOS Safari, Android Chrome): the AudioContext is created and resumed
// synchronously inside the first user gesture, audioSession is set to 'playback' (mute switch),
// a silent <audio> keeps old iOS in the playback category, and the context recovers from
// 'interrupted' / 'suspended' / page-hide by itself. Design notes: data/research/audio/.
import { makeBuffers, dB, toDb, clamp, selectVoices, audioProfile } from './dsp.js';
import { BusVoice } from './BusVoice.js';
import { OneShots, Events } from './OneShots.js';

const GESTURES = ['pointerup', 'touchend', 'mouseup', 'click', 'keydown'];

const isIOS = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** 0.25 s of silence as a data: URL WAV (8-bit mono 8 kHz): keeps iOS < 16.4 in the 'playback' category. */
function silentWavUrl() {
  const n = 2000, buf = new Uint8Array(44 + n).fill(128), dv = new DataView(buf.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.zone = 'cab'; // 'cab' | 'cabin' | 'outside' (chosen by the game from the camera)
    this.pressure = 8.0; // bar, air system of the focus bus (shown on the dashboard); GameAudio drives it
    this.compressorOn = false;
    this.paused = false;
    this.hidden = false;
    this.quiet = false;
    this.offline = false;
    this.ctxFactory = null; // test seam: () => OfflineAudioContext
    this.gestureHooks = []; // run inside the first gesture (speech priming)
    this.gamePausedFn = null; // () => bool, lets a Resume tap un-pause the audio inside the gesture
    this.assign = new Map(); // bus id -> pool entry
    this.pool = [];
    this.acc = 0;
    this.retries = 0;
    this.lastBell = -9;
    this.birdTimer = 2;
    this.armGestureStart();
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  profile() {
    return audioProfile(this.settings.quality);
  }

  // ------------------------------------------------------------ start / unlock
  armGestureStart() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const on = () => {
      if (!this.ctx) this.start();
      else this.unlock();
    };
    for (const ev of GESTURES) window.addEventListener(ev, on, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.applyRunState();
      if (!this.hidden) this.unlock();
    });
    window.addEventListener('pageshow', () => this.unlock());
    window.addEventListener('focus', () => this.unlock());
  }

  /**
   * Must be called from a user gesture. Everything up to the end of the graph runs synchronously
   * inside the gesture (iOS needs resume() and the first source start() there); nothing here is awaited.
   */
  start() {
    if (this.ctx) {
      this.unlock();
      if (this.paused) this.audition();
      return Promise.resolve();
    }
    const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx && !this.ctxFactory) return Promise.resolve();
    let ctx;
    try {
      if (!this.ctxFactory) {
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
        try { ctx = new Ctx({ latencyHint: 'playback' }); } catch (e) { ctx = new Ctx(); }
      } else ctx = this.ctxFactory();
    } catch (e) {
      return Promise.resolve();
    }
    this.ctx = ctx;
    this.offline = typeof ctx.startRendering === 'function';
    if (!this.offline) {
      try { ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
      try { // classic iOS unlock: one silent sample
        const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) { /* ignore */ }
      this.startSilentElement();
      ctx.onstatechange = () => {
        if (ctx.state === 'running') this.retries = 0;
      };
      for (const fn of this.gestureHooks) { try { fn(); } catch (e) { /* ignore */ } }
    }
    this.buildGraph();
    this.applyRunState();
    return Promise.resolve();
  }

  /** iOS before 16.4 has no navigator.audioSession: a playing <audio> element switches the page to 'playback' (ignores the mute switch). */
  startSilentElement() {
    try {
      if (navigator.audioSession || !isIOS()) return;
      const a = new Audio(silentWavUrl());
      a.loop = true; a.volume = 0.01;
      a.setAttribute('playsinline', '');
      a.play().catch(() => {});
      this.silentEl = a;
    } catch (e) { /* ignore */ }
  }

  /** Resume the context after an interruption (call, lock screen, tab hidden). Safe to call at any time. */
  unlock() {
    if (!this.ctx || this.offline) return;
    if (this.paused && this.gamePausedFn && !this.gamePausedFn()) this.setPaused(false); // Resume tapped: inside the gesture
    this.retries = 0;
    if (this.quiet) return;
    const s = this.ctx.state;
    if (s !== 'running' && s !== 'closed') this.ctx.resume().catch(() => {});
    if (this.silentEl && this.silentEl.paused) this.silentEl.play().catch(() => {});
  }

  /** Called every frame by the game: silences and suspends while the pause menu is up. */
  setPaused(p) {
    p = !!p;
    if (p === this.paused) return;
    this.paused = p;
    this.applyRunState();
  }

  /** Let a test sound (settings screen) be heard while paused, without the engine and city. */
  audition(sec = 3.5) {
    if (!this.ctx || this.offline) return;
    this.auditionUntil = Date.now() + sec * 1000;
    this.applyRunState();
    clearTimeout(this.auditionTimer);
    this.auditionTimer = setTimeout(() => { this.auditionUntil = 0; this.applyRunState(); }, sec * 1000);
  }

  applyRunState() {
    const ctx = this.ctx;
    if (!ctx || !this.pauseGain) return;
    const aud = (this.auditionUntil || 0) > Date.now();
    const quiet = (this.paused || this.hidden) && !aud;
    this.quiet = quiet;
    const t = ctx.currentTime;
    this.pauseGain.gain.setTargetAtTime(quiet ? 0 : 1, t, 0.04);
    this.worldGain.gain.setTargetAtTime(this.paused && aud ? 0 : 1, t, 0.03);
    if (this.offline) return;
    clearTimeout(this.suspendTimer);
    if (quiet) {
      this.suspendTimer = setTimeout(() => {
        if (this.quiet && ctx.state === 'running') ctx.suspend().catch(() => {});
      }, 300);
    } else if (ctx.state !== 'running' && ctx.state !== 'closed') {
      ctx.resume().catch(() => {});
    }
  }

  /** Slow watchdog: a context that should run but does not (interruption ended) is resumed. */
  checkContext(dt) {
    if (this.offline) return;
    this.chk = (this.chk || 0) - dt;
    if (this.chk > 0) return;
    this.chk = 1.5;
    const s = this.ctx.state;
    if (!this.quiet && s !== 'running' && s !== 'closed' && this.retries < 6) {
      this.retries++;
      this.ctx.resume().catch(() => {});
    }
  }

  // --------------------------------------------------------------- the graph
  buildGraph() {
    const ctx = this.ctx, s = this.settings;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return b; };
    this.bufs = makeBuffers(ctx, 11);
    // master: sub-bass out BEFORE the compressor (the phone cannot play it and it only makes the mix pump)
    this.masterIn = G(s.mute ? 0 : s.volMaster ?? 0.9);
    this.hp = BQ('highpass', 30, 0.6);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 12; this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.pauseGain = G(1);
    // Chromium/WebKit add make-up gain to the compressor; -1.5 dB keeps the pre-master peaks under -0.8 dBFS
    this.trim = G(dB(-1.5));
    this.masterIn.connect(this.trim); this.trim.connect(this.hp); this.hp.connect(this.comp); this.comp.connect(this.pauseGain); this.pauseGain.connect(ctx.destination);
    this.tapPre = this.hp; // pre-compressor tap (tests)
    this.tapOut = this.pauseGain; // final output tap (tests)
    this.worldGain = G(1); // engine + city (muted while a test sound plays during pause)
    this.worldGain.connect(this.masterIn);
    // busses
    this.engineBus = G((s.volEngine ?? 0.8) / 0.8); // the default slider position is unity gain
    this.engineDuck = G(1); // -3 dB while an announcement plays
    this.engineBus.connect(this.engineDuck); this.engineDuck.connect(this.worldGain);
    this.sfxBus = G(s.volSfx ?? 0.9); this.sfxBus.connect(this.masterIn);
    this.ambBus = G(s.volAmbience ?? 0.7);
    this.ambFilter = BQ('lowpass', 6000, 0.7);
    this.ambDuck = G(1); // -6 dB under loud one-shots
    this.ambBus.connect(this.ambFilter); this.ambFilter.connect(this.ambDuck); this.ambDuck.connect(this.worldGain);
    this.voiceBus = G(s.volVoice ?? 1); // PA speaker band
    const paHp = BQ('highpass', 300, 0.7), paLp = BQ('lowpass', 3400, 0.7);
    this.voiceBus.connect(paHp); paHp.connect(paLp); paLp.connect(this.masterIn);
    // cabin reverb for announcements & door beeps
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(0.45, 3.2);
    this.reverbGain = G(0.18);
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.masterIn);
    // city ambience (buffers are RMS-normalised, the gains are scaled for that)
    this.city = this.loop(this.bufs.brown, 'lowpass', 500, 0.8, this.ambBus);
    this.rain = this.loop(this.bufs.white, 'highpass', 2500, 0.6, this.ambBus);
    this.rainRoof = this.loop(this.bufs.white, 'bandpass', 1400, 1.2, this.ambBus);
    // the first (full) bus voice exists from the start; the lite ones are created when a second bus is heard
    this.getVoice(true);
    this.ready = true;
    this.birdTimer = 2;
    this.acc = 1; // assign the voices on the first update
  }

  applyVolumes() {
    if (!this.ctx || !this.masterIn) return;
    const s = this.settings, t = this.ctx.currentTime;
    const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.03);
    set(this.masterIn, s.mute ? 0 : s.volMaster ?? 0.9);
    set(this.engineBus, (s.volEngine ?? 0.8) / 0.8);
    set(this.sfxBus, s.volSfx ?? 0.9);
    set(this.ambBus, s.volAmbience ?? 0.7);
    set(this.voiceBus, s.volVoice ?? 1);
  }

  impulse(sec, decay) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  loop(buf, type, freq, q, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.start(0, Math.random() * 3);
    return { src, filter: f, gain: g };
  }

  set(param, value, t = 0.08) {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, t);
  }

  setZone(zone) {
    this.zone = zone;
  }

  // ------------------------------------------------------------- voice pool
  /** A pooled bus voice: the first one is the full voice (focus bus), the others are lite. */
  getVoice(full) {
    const prof = this.profile();
    let e = this.pool.find((x) => x.full === full && !x.busId && x.slim === (full && prof.slim));
    if (e) return e;
    const old = this.pool.find((x) => x.full === full && !x.busId); // built for another quality preset
    if (old) { old.voice.dispose(); this.pool.splice(this.pool.indexOf(old), 1); }
    if (this.pool.filter((x) => x.full === full).length >= (full ? 1 : 2)) return null;
    const voice = new BusVoice(this.ctx, this.bufs, { lite: !full, slim: full && prof.slim, flutter: prof.flutter });
    e = { voice, full, slim: full && prof.slim, busId: null };
    this.pool.push(e);
    return e;
  }

  voiceFor(id) {
    const e = this.assign.get(id);
    return e ? e.voice : null;
  }

  releaseVoice(id) {
    const e = this.assign.get(id);
    if (!e) return;
    e.voice.detach();
    e.busId = null;
    this.assign.delete(id);
  }

  /** Pool: the interior/focus bus owns the full voice, the nearest others share the lite ones. */
  updateVoices(t, S) {
    const prof = this.profile();
    const cands = [];
    for (const b of S.buses) if (b.interior || b.focus || b.cull > 0) cands.push({ id: b.id, dist: b.dist, focus: b.focus, interior: b.interior });
    const chosen = selectVoices(cands, prof.maxVoices, new Set(this.assign.keys()));
    const fullId = chosen.length ? chosen[0] : null;
    for (const [id, e] of [...this.assign]) if (!chosen.includes(id) || e.full !== (id === fullId)) this.releaseVoice(id);
    for (const id of chosen) {
      if (this.assign.has(id)) continue;
      const e = this.getVoice(id === fullId);
      if (!e) continue;
      e.busId = id;
      this.assign.set(id, e);
      e.voice.attach(this.engineBus);
      e.voice.fadeIn(t, 0.2);
      e.fresh = true;
    }
    for (const b of S.buses) {
      const e = this.assign.get(b.id);
      if (!e) continue;
      e.voice.setListener(t, b);
      e.voice.setState(t, b);
      e.fresh = false;
    }
  }

  // --------------------------------------------------------------- per frame
  /**
   * S: {buses: [{id, focus, interior, zone 'cab'|'cabin'|'out', prox, dist, radial, pan, cull, rpm, load,
   *      speed, engineOn, retarder, surface, comp}], weather, ambience (0..1), parkFactor, day}
   */
  update(dt, S) {
    if (!this.ready) return;
    this.checkContext(dt);
    if (this.quiet && !this.offline) return;
    const t = this.ctx.currentTime;
    const inside = this.zone !== 'outside';
    // voices at a limited rate (12-20 Hz depending on the quality preset)
    this.acc += dt;
    if (this.acc >= 1 / this.profile().rate || this.offline) {
      this.acc = 0;
      this.updateVoices(t, S);
    }
    // city ambience
    const amb = S.ambience == null ? 1 : S.ambience;
    this.set(this.city.gain.gain, amb * (inside ? 0.1 : 0.25), 0.08);
    this.set(this.ambFilter.frequency, inside ? 1200 : 7000, 0.3);
    const rain = S.weather === 'rain' ? 1 : 0;
    this.set(this.rain.gain.gain, rain * amb * (inside ? 0.115 : 0.5), 0.5);
    this.set(this.rainRoof.gain.gain, rain * (inside ? 0.3 : 0.05), 0.5);
    // birds in parks during the day
    this.birdTimer -= dt;
    if (this.birdTimer < 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      if (S.parkFactor > 0.2 && S.day > 0.5 && S.weather !== 'rain') this.bird(amb * S.parkFactor * (inside ? 0.25 : 1));
    }
  }

  // ------------------------------------------------------------- one-shots
  now() {
    return this.ctx.currentTime + 0.01;
  }

  /** Output for a one-shot: where = {db, lp, pan} or undefined (interior, 0 dB). Returns null if not audible. */
  shot(where) {
    if (!this.ready || where === null || (this.quiet && !this.offline)) return null;
    const k = where ? where.db || 0 : 0;
    if (where && (where.lp > 0 || where.pan)) {
      const ctx = this.ctx, g = ctx.createGain();
      let tail = g;
      if (where.lp > 0) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = where.lp; lp.Q.value = 0.6; tail.connect(lp); tail = lp; }
      if (where.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(where.pan, -1, 1); tail.connect(p); tail = p; }
      tail.connect(this.sfxBus);
      return { dest: g, k, t: this.now() };
    }
    return { dest: this.sfxBus, k, t: this.now() };
  }

  duckAmb(sec) {
    const t = this.ctx.currentTime, g = this.ambDuck.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.5, t, 0.05); g.setTargetAtTime(1, t + sec, 0.3);
  }

  /** One door event (already merged over the doors that fired together by GameAudio). */
  doorEvent(e, where) {
    const o = this.shot(where);
    if (!o) return;
    switch (e.type) {
      case 'opening':
        Events.doorOpen(this.ctx, o.dest, o.t, this.bufs, o.k); this.duckAmb(1.8); break;
      case 'beep':
        this.beep(o, e.n, where && where.warn);
        break;
      case 'closingStart':
        Events.doorClose(this.ctx, o.dest, o.t, this.bufs, o.k); this.duckAmb(2.4); break;
      case 'obstruction':
        Events.doorObstruct(this.ctx, o.dest, o.t, this.bufs, o.k); break;
      default: // closeRequest (the beeps follow at once), opened and closed are part of the recipes above
        break;
    }
  }

  beep(o, n, warn = null) {
    const s = this.settings;
    void n; // the real pitch pattern of beep 1 and 2 is unconfirmed: both use the configured pitch
    // warn = {freq, ms} of a vehicle with its own buzzer (Conecto: one long buzz, BMC/Yutong: short beeps)
    const g = Events.doorBeep(this.ctx, o.dest, o.t, this.bufs, o.k, warn ? warn.freq : s.beepFreq ?? 1850, warn ? warn.ms / 1000 : s.beepDur ?? 0.24);
    if (this.zone !== 'outside' && g) { const send = this.ctx.createGain(); send.gain.value = dB(-8); g.connect(send); send.connect(this.reverb); }
  }

  /** Settings test button and compatibility: one door-warning beep. */
  doorBeep(n, where) {
    const o = this.shot(where);
    if (o) this.beep(o, n);
  }

  indicatorTick(on, where) {
    const o = this.shot(where);
    if (o) Events.indicator(this.ctx, o.dest, o.t, this.bufs, on, o.k);
  }

  stopBell(where) {
    if (where === undefined) {
      if (this.zone === 'outside') return; // interior only
      where = { db: this.zone === 'cab' ? -3 : 0 };
    }
    const o = this.shot(where);
    if (!o) return;
    this.lastBell = performance.now();
    Events.stopBell(this.ctx, o.dest, o.t, this.bufs, o.k, this.settings.bellStyle);
    this.duckAmb(1.2);
  }

  brakeEvent(kind, where) {
    const o = this.shot(where);
    if (!o) return;
    const E = Events, a = [this.ctx, o.dest, o.t, this.bufs, o.k];
    if (kind === 'parkApply') E.brakeApply(...a, false);
    else if (kind === 'stopApply') E.brakeApply(...a, true);
    else if (kind === 'parkRelease') E.parkingRelease(...a);
    else E.brakeRelease(...a); // 'release' | 'stopRelease'
  }

  kneelEvent(dir, where) {
    const o = this.shot(where);
    if (!o) return;
    (dir === 'down' ? Events.kneelDown : Events.kneelUp)(this.ctx, o.dest, o.t, this.bufs, o.k);
  }

  purgeEvent(where) {
    const o = this.shot(where);
    if (!o) return;
    Events.dryerPurge(this.ctx, o.dest, o.t, this.bufs, o.k);
    this.duckAmb(2.2);
  }

  bellowsCreak(where, scale) {
    const o = this.shot(where);
    if (o) Events.bellowsCreak(this.ctx, o.dest, o.t, this.bufs, o.k, scale);
  }

  bump(speed, big, where) {
    const o = this.shot(where);
    if (o) Events.bump(this.ctx, o.dest, o.t, this.bufs, { k: o.k, v: speed, big, rattle: !where || where.rattle !== false });
  }

  gearSelect(sel, where) {
    const o = this.shot(where);
    if (o) Events.gearSelect(this.ctx, o.dest, o.t, this.bufs, o.k);
    void sel;
  }

  /** Gearbox shift of a bus: torque dip on its voice and a clunk. */
  shift(id, gear, dir, where) {
    const o = this.shot(where);
    const v = this.voiceFor(id);
    if (v && this.ready) v.shift(this.now(), dir === 'up');
    if (o) Events.shiftClunk(this.ctx, o.dest, o.t, this.bufs, o.k, dir === 'up');
    void gear;
  }

  engineStart(where) {
    const o = this.shot(where);
    if (o) Events.starter(this.ctx, o.dest, o.t, this.bufs, o.k);
  }

  engineStop(where) {
    const o = this.shot(where);
    if (o) Events.engineStop(this.ctx, o.dest, o.t, this.bufs, o.k);
  }

  crash(intensity, where) {
    const o = this.shot(where);
    if (o) Events.crash(this.ctx, o.dest, o.t, this.bufs, o.k, intensity);
  }

  kerb(where) {
    const o = this.shot(where);
    if (o) Events.kerb(this.ctx, o.dest, o.t, this.bufs, o.k);
  }

  rattle(where) {
    if (this.zone === 'outside') return;
    const o = this.shot(where);
    if (o) Events.rattle(this.ctx, o.dest, o.t, this.bufs, o.k);
  }

  // ------------------------------------------------- compatibility synthesis
  tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, release = 0.05, dest = null, when = 0, detune = 0, filter = null } = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      f.Q.value = filter.q || 1;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return g;
  }

  /** Pneumatic exhaust "pssht" (kept for callers outside the audio folder). */
  hiss(dur = 0.6, gain = 0.3, freq = 2600, delay = 0) {
    const o = this.shot();
    if (o) OneShots.hiss(this.ctx, o.dest, o.t + delay, this.bufs, { dur, f0: freq, f1: freq * 0.55, q: 0.8, peakDb: toDb(gain * 0.6), attack: 0.03, tau: dur / 3 });
  }

  thump(gain = 0.4, freq = 90, delay = 0) {
    const o = this.shot();
    if (o) OneShots.thump(this.ctx, o.dest, o.t + delay, { f0: freq * 1.6, f1: freq * 0.6, peakDb: toDb(gain), dur: 0.22 });
  }

  horn(on) {
    if (!this.ready) return;
    if (on && !this.hornNodes) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.2, ctx.currentTime, 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.7;
      const os = [370, 466].map((fr) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      f.connect(g).connect(this.sfxBus);
      this.hornNodes = { g, os };
    } else if (!on && this.hornNodes) {
      const { g, os } = this.hornNodes;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      os.forEach((o) => o.stop(this.ctx.currentTime + 0.2));
      this.hornNodes = null;
    }
  }

  /** Passenger information chime (two notes, bell partials, short reverb send); returns its duration in seconds. */
  chime() {
    if (!this.ready || this.settings.chime === false) return 0;
    const ctx = this.ctx, notes = this.settings.chimeNotes || [784, 659.3];
    const vol = this.zone === 'outside' ? 0.3 : 1;
    const cg = ctx.createGain();
    cg.gain.value = vol;
    const send = ctx.createGain();
    send.gain.value = 0.12 / 0.18; // the reverb return is 0.18: net 12 %
    cg.connect(this.voiceBus); cg.connect(send); send.connect(this.reverb);
    const t0 = this.now();
    notes.forEach((f, i) => OneShots.bell(ctx, cg, t0 + i * 0.5, { f, peakDb: -18 }));
    return notes.length * 0.5 + 0.5;
  }

  /** Lower the engine by 3 dB while an announcement (chime + speech) plays. */
  announcementDuck(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, g = this.engineDuck.gain;
    g.cancelScheduledValues(t);
    if (on) g.setTargetAtTime(dB(-3), t, 0.2);
    else g.setTargetAtTime(1, t + 0.4, 0.2);
  }

  bird(vol) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2500 + Math.random() * 2000;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = t0 + i * (0.09 + Math.random() * 0.06);
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), t + 0.06);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025 * vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o.connect(g).connect(this.ambBus);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
}
