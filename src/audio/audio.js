// ---------------------------------------------------------------------------
// Procedural audio (WebAudio, no sound files).
//
// Ambience: wind (filtered noise, gusting with the weather), birdsong
// (FM chirps, daytime), crickets (night), rain (noise hiss + drops), and
// per-dimension drones (underwater, space, nightmare...). One-shots:
// footsteps (surface-dependent filtered noise bursts), jumps/landings,
// UI clicks, the materialize shimmer, doors, thunder, splashes, portal
// whooshes, fireworks, engine hum for vehicles and "voice blips" for
// characters (pitch from personality) when speech synthesis is off.
// Positional sounds use simple distance attenuation + stereo panning
// relative to the camera.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, settings } from '../core/context.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
    this.noiseBuf = null;
    this.amb = {};
    this.birdTimer = 2;
    this.cricketTimer = 0;
    this.dropTimer = 0;
    this.engines = new Set();
    this._tmp = new THREE.Vector3();
  }

  // Must be called from a user gesture (browser autoplay policy).
  resume() {
    try {
      if (!this.ctx) this._init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio unavailable */ }
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // Shared white/brown noise buffers.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // Ambience beds.
    this.amb.wind = this._loopNoise(this.brownBuf, 'lowpass', 500, 0.0);
    this.amb.rain = this._loopNoise(this.noiseBuf, 'highpass', 1800, 0.0);
    this.amb.drone = this._drone();
    this.ready = true;
  }

  _loopNoise(buf, type, freq, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  _drone() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const oscs = [55, 82.5, 110.3].map((fr, i) => { const o = ctx.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
    f.connect(g).connect(this.master);
    return { g, f, oscs };
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  // Distance attenuation + stereo pan for a world position.
  _spatial(pos, refDist = 4, maxDist = 60) {
    if (!pos || !G.camera) return { gain: 1, pan: 0 };
    const cam = G.camera;
    const d = cam.position.distanceTo(pos);
    if (d > maxDist) return null;
    const gain = Math.min(1, refDist / Math.max(refDist, d)) * (1 - d / maxDist);
    const rel = this._tmp.copy(pos).sub(cam.position);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const pan = Math.max(-1, Math.min(1, rel.normalize().dot(right)));
    return { gain, pan };
  }

  _out(pos, refDist, maxDist) {
    const s = this._spatial(pos, refDist, maxDist);
    if (!s) return null;
    const g = this.ctx.createGain();
    g.gain.value = s.gain;
    let node = g;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = s.pan * 0.8; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return node;
  }

  _noiseBurst(out, { dur = 0.1, type = 'bandpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, freqEnd = null, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _tone(out, { freq = 440, freqEnd = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.01, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos = null, opts = {}) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const out = pos ? this._out(pos, opts.ref || 4, opts.max || 70) : this.master;
    if (!out) return;
    switch (name) {
      case 'step': {
        const s = opts.surface || 'grass';
        const p = { grass: [650, 0.9, 0.14], dirt: [500, 1, 0.12], wood: [260, 3, 0.1], stone: [1400, 2, 0.08], sand: [900, 0.6, 0.16], snow: [1100, 0.7, 0.2], water: [1200, 0.5, 0.25], metal: [2200, 6, 0.08] }[s] || [700, 1, 0.12];
        this._noiseBurst(out, { freq: p[0] * (0.85 + Math.random() * 0.3), q: p[1], dur: p[2], gain: (opts.gain ?? 0.22) });
        if (s === 'wood') this._tone(out, { freq: 110 + Math.random() * 30, dur: 0.08, gain: 0.08 });
        break;
      }
      case 'jump': this._noiseBurst(out, { freq: 500, q: 0.8, dur: 0.12, gain: 0.12 }); break;
      case 'land': this._noiseBurst(out, { freq: 300, q: 0.7, dur: 0.2, gain: Math.min(0.5, 0.12 + (opts.v || 0) * 0.03), type: 'lowpass' }); break;
      case 'click': this._tone(out, { freq: 1200, freqEnd: 900, dur: 0.05, type: 'triangle', gain: 0.08 }); break;
      case 'submit': this._tone(out, { freq: 660, dur: 0.12, gain: 0.08 }); this._tone(out, { freq: 990, dur: 0.18, gain: 0.07, when: 0.07 }); break;
      case 'error': this._tone(out, { freq: 220, freqEnd: 160, dur: 0.25, type: 'square', gain: 0.05 }); break;
      case 'materialize': {
        for (let i = 0; i < 7; i++) this._tone(out, { freq: 700 + i * 180 + Math.random() * 60, dur: 0.6, gain: 0.05, when: i * 0.07, type: 'sine' });
        this._noiseBurst(out, { freq: 3000, freqEnd: 8000, q: 2, dur: 1.2, gain: 0.08, attack: 0.3 });
        break;
      }
      case 'door': this._noiseBurst(out, { freq: 380, freqEnd: 900, q: 8, dur: 0.5, gain: 0.08 }); this._tone(out, { freq: 90, dur: 0.15, gain: 0.08, when: 0.45 }); break;
      case 'thunder': {
        const dist = opts.dist || 1;
        this._noiseBurst(out, { type: 'lowpass', freq: 900 / dist, freqEnd: 60, dur: 3.5, gain: 0.7 / Math.sqrt(dist), attack: 0.02, when: dist * 0.4 });
        this._noiseBurst(out, { type: 'lowpass', freq: 200, dur: 4.5, gain: 0.5 / Math.sqrt(dist), attack: 0.4, when: dist * 0.4 + 0.2 });
        break;
      }
      case 'splash': this._noiseBurst(out, { freq: 1500, freqEnd: 400, q: 0.6, dur: 0.6, gain: 0.35 }); break;
      case 'portal': this._noiseBurst(out, { freq: 200, freqEnd: 3000, q: 3, dur: 1.2, gain: 0.35, attack: 0.3 }); this._tone(out, { freq: 80, freqEnd: 320, dur: 1.2, type: 'sawtooth', gain: 0.06 }); break;
      case 'firework': this._noiseBurst(out, { type: 'lowpass', freq: 2500, freqEnd: 80, dur: 1.4, gain: 0.6, attack: 0.005 }); for (let i = 0; i < 10; i++) this._noiseBurst(out, { freq: 4000, q: 4, dur: 0.05, gain: 0.08, when: 0.3 + Math.random() * 1.2 }); break;
      case 'pickup': this._tone(out, { freq: 500, freqEnd: 800, dur: 0.1, gain: 0.08 }); break;
      case 'throw': this._noiseBurst(out, { freq: 900, freqEnd: 300, q: 1, dur: 0.25, gain: 0.15 }); break;
      case 'bounce': this._tone(out, { freq: 160 + Math.random() * 40, freqEnd: 90, dur: 0.12, gain: Math.min(0.3, opts.v ? opts.v * 0.04 : 0.15) }); break;
      case 'bark': this._tone(out, { freq: opts.pitch || 420, freqEnd: (opts.pitch || 420) * 0.6, dur: 0.14, type: 'sawtooth', gain: 0.12 }); this._noiseBurst(out, { freq: 900, q: 1, dur: 0.1, gain: 0.1 }); break;
      case 'meow': this._tone(out, { freq: 700, freqEnd: 500, dur: 0.5, type: 'triangle', gain: 0.1 }); break;
      case 'moo': this._tone(out, { freq: 140, freqEnd: 110, dur: 1.1, type: 'sawtooth', gain: 0.1, attack: 0.15 }); break;
      case 'roar': this._noiseBurst(out, { type: 'lowpass', freq: 600, freqEnd: 150, dur: 1.6, gain: 0.5, attack: 0.1 }); this._tone(out, { freq: 90, freqEnd: 60, dur: 1.5, type: 'sawtooth', gain: 0.15, attack: 0.1 }); break;
      case 'chirp': this._bird(out); break;
      case 'robot': for (let i = 0; i < 4; i++) this._tone(out, { freq: 300 + Math.random() * 900, dur: 0.07, type: 'square', gain: 0.04, when: i * 0.08 }); break;
      case 'honk': this._tone(out, { freq: 400, dur: 0.35, type: 'square', gain: 0.08 }); this._tone(out, { freq: 500, dur: 0.35, type: 'square', gain: 0.06 }); break;
      // Instruments: opts.freq (Hz) and opts.timbre.
      case 'note': this._note(out, opts.freq || 440, opts.timbre || 'piano', opts.when || 0); break;
      case 'chord': for (const [i, f] of (opts.freqs || [262, 330, 392]).entries()) this._note(out, f, opts.timbre || 'piano', (opts.when || 0) + i * (opts.strum || 0)); break;
      case 'beep': this._tone(out, { freq: opts.freq || 880, dur: 0.09, type: 'square', gain: 0.04 }); break;
      case 'ding': this._tone(out, { freq: 1320, dur: 0.9, gain: 0.08 }); this._tone(out, { freq: 2640, dur: 0.5, gain: 0.03 }); break;
      case 'bell': for (const [f, g] of [[opts.freq || 330, 0.12], [(opts.freq || 330) * 2.76, 0.05], [(opts.freq || 330) * 5.4, 0.025]]) this._tone(out, { freq: f, dur: 2.8, gain: g, attack: 0.004 }); break;
      case 'gong': this._tone(out, { freq: 110, freqEnd: 96, dur: 4, gain: 0.16, attack: 0.02 }); this._noiseBurst(out, { freq: 600, q: 2, dur: 2.5, gain: 0.06 }); break;
      case 'zap': this._tone(out, { freq: 1800, freqEnd: 120, dur: 0.35, type: 'sawtooth', gain: 0.07 }); this._noiseBurst(out, { freq: 3000, q: 1, dur: 0.2, gain: 0.08 }); break;
      case 'bubble': for (let i = 0; i < 5; i++) this._tone(out, { freq: 300 + Math.random() * 500, freqEnd: 900 + Math.random() * 600, dur: 0.08, gain: 0.05, when: i * 0.09 + Math.random() * 0.05 }); break;
      case 'magic': for (let i = 0; i < 7; i++) this._tone(out, { freq: 880 * Math.pow(1.122, i), dur: 0.5, gain: 0.04, when: i * 0.06 }); this._noiseBurst(out, { freq: 6000, q: 2, dur: 0.8, gain: 0.03, attack: 0.2 }); break;
      case 'whirr': this._tone(out, { freq: 90, freqEnd: 240, dur: 1.2, type: 'sawtooth', gain: 0.05, attack: 0.3 }); this._noiseBurst(out, { freq: 700, q: 3, dur: 1.2, gain: 0.05, attack: 0.3 }); break;
      case 'creak': this._tone(out, { freq: 180, freqEnd: 120, dur: 0.6, type: 'sawtooth', gain: 0.04 }); break;
      case 'pop': this._tone(out, { freq: 700, freqEnd: 180, dur: 0.12, gain: 0.12 }); break;
      case 'whoosh': this._noiseBurst(out, { freq: 400, freqEnd: 1800, q: 1.2, dur: 0.9, gain: 0.25, attack: 0.25 }); break;
      case 'squeak': this._tone(out, { freq: 1200, freqEnd: 1800, dur: 0.18, type: 'triangle', gain: 0.07 }); break;
      default: this._tone(out, { freq: 600, dur: 0.1, gain: 0.05 });
    }
  }

  // One instrument note: a few oscillators shaped to suggest the timbre.
  _note(out, f, timbre, when = 0) {
    switch (timbre) {
      case 'pluck': this._tone(out, { freq: f, dur: 1.2, type: 'triangle', gain: 0.12, attack: 0.002, when }); this._tone(out, { freq: f * 2, dur: 0.4, gain: 0.04, attack: 0.002, when }); break;
      case 'brass': this._tone(out, { freq: f, dur: 0.7, type: 'sawtooth', gain: 0.06, attack: 0.04, when }); this._tone(out, { freq: f * 1.005, dur: 0.7, type: 'square', gain: 0.025, attack: 0.05, when }); break;
      case 'reed': this._tone(out, { freq: f, dur: 0.8, type: 'square', gain: 0.045, attack: 0.03, when }); this._tone(out, { freq: f * 2, dur: 0.6, type: 'triangle', gain: 0.03, attack: 0.03, when }); break;
      case 'string': this._tone(out, { freq: f, dur: 1.4, type: 'sawtooth', gain: 0.05, attack: 0.12, when }); this._tone(out, { freq: f * 1.004, dur: 1.4, type: 'sawtooth', gain: 0.03, attack: 0.15, when }); break;
      case 'flute': this._tone(out, { freq: f, dur: 0.9, gain: 0.1, attack: 0.06, when }); this._noiseBurst(out, { freq: f * 2, q: 6, dur: 0.5, gain: 0.02, attack: 0.05, when }); break;
      case 'bell': this._tone(out, { freq: f, dur: 1.8, gain: 0.08, attack: 0.002, when }); this._tone(out, { freq: f * 2.76, dur: 0.8, gain: 0.03, attack: 0.002, when }); break;
      case 'mallet': this._tone(out, { freq: f, dur: 0.6, gain: 0.12, attack: 0.002, when }); this._tone(out, { freq: f * 4, dur: 0.15, gain: 0.03, attack: 0.002, when }); break;
      case 'synth': this._tone(out, { freq: f, dur: 0.8, type: 'sawtooth', gain: 0.05, attack: 0.01, when }); this._tone(out, { freq: f / 2, dur: 0.8, type: 'square', gain: 0.03, attack: 0.01, when }); break;
      case 'kick': this._tone(out, { freq: 150, freqEnd: 45, dur: 0.35, gain: 0.35, attack: 0.002, when }); break;
      case 'snare': this._noiseBurst(out, { freq: 1800, q: 0.7, dur: 0.2, gain: 0.25, when }); this._tone(out, { freq: 220, freqEnd: 160, dur: 0.1, gain: 0.08, when }); break;
      case 'hat': this._noiseBurst(out, { freq: 8000, q: 1.5, dur: 0.06, gain: 0.12, type: 'highpass', when }); break;
      case 'cymbal': this._noiseBurst(out, { freq: 6000, q: 0.8, dur: 1.4, gain: 0.12, type: 'highpass', when }); break;
      case 'tom': this._tone(out, { freq: f || 120, freqEnd: (f || 120) * 0.7, dur: 0.4, gain: 0.25, attack: 0.002, when }); break;
      default: // piano
        this._tone(out, { freq: f, dur: 1.6, type: 'triangle', gain: 0.1, attack: 0.003, when });
        this._tone(out, { freq: f * 2, dur: 0.7, gain: 0.035, attack: 0.003, when });
        this._tone(out, { freq: f * 3.01, dur: 0.3, gain: 0.015, attack: 0.003, when });
    }
  }

  // Character speech stand-in: short vowel-like FM blips at the speaker's pitch.
  voiceBlip(pitch = 1, length = 20, pos = null, animal = false) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const out = pos ? this._out(pos, 3, 30) : this.master;
    if (!out) return;
    const n = Math.min(14, Math.max(2, Math.round(length / 6)));
    const base = (animal ? 380 : 170) * pitch;
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + Math.random() * 0.4);
      this._tone(out, { freq: f, freqEnd: f * (0.9 + Math.random() * 0.2), dur: 0.07 + Math.random() * 0.05, type: 'triangle', gain: 0.05, when: i * 0.085 });
    }
  }

  _bird(out, when = 0) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const n = 2 + Math.floor(Math.random() * 5);
    const base = 2200 + Math.random() * 2400;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.08 + Math.random() * 0.06);
      const o = ctx.createOscillator(); o.type = 'sine';
      const lfo = ctx.createOscillator(); lfo.frequency.value = 30 + Math.random() * 40;
      const lg = ctx.createGain(); lg.gain.value = 300 + Math.random() * 600;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.12); lfo.start(t); lfo.stop(t + 0.12);
    }
  }

  // Continuous engine sound for vehicles: returns a handle with set(rpm, load) / stop().
  engine(kind = 'car') {
    if (!this.ready) return { set() {}, stop() {} };
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = kind === 'electric' ? 'sine' : 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o.start(); o2.start();
    const h = {
      set: (rpm, load = 0.5) => {
        const base = kind === 'heli' ? 18 : kind === 'jet' ? 90 : kind === 'boat' ? 35 : 28;
        const fr = base + rpm * (kind === 'jet' ? 300 : 90);
        o.frequency.setTargetAtTime(fr, ctx.currentTime, 0.05);
        o2.frequency.setTargetAtTime(fr * 0.5, ctx.currentTime, 0.05);
        f.frequency.setTargetAtTime(250 + rpm * 1200 + load * 400, ctx.currentTime, 0.1);
        g.gain.setTargetAtTime(0.035 + rpm * 0.05, ctx.currentTime, 0.1);
      },
      stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { try { o.stop(); o2.stop(); } catch (e) { /* ignore */ } }, 400); this.engines.delete(h); },
    };
    this.engines.add(h);
    return h;
  }

  // Per-frame ambience mixing.
  update(dt) {
    if (!this.ready || this.ctx.state !== 'running') return;
    this.master.gain.value = G.paused ? settings.volume * 0.4 : settings.volume;
    const w = G.world;
    if (!w) return;
    const now = this.ctx.currentTime;
    const weather = w.weather ? w.weather.cur : { wind: w.meta.wind ?? 0.3, rain: 0, storm: 0 };
    const amb = w.ambientSound || 'nature';
    const indoor = G.player && G.player.position.y < (w.heightAt(G.player.position.x, G.player.position.z) - 5);
    // Wind: gusting.
    const gust = 0.6 + 0.4 * Math.sin(G.time * 0.37) * Math.sin(G.time * 0.13 + 1);
    const windLevel = (amb === 'space' || amb === 'library' ? 0.05 : 0.05 + weather.wind * 0.12) * gust * (indoor ? 0.3 : 1);
    this.amb.wind.g.gain.setTargetAtTime(windLevel, now, 0.3);
    this.amb.wind.f.frequency.setTargetAtTime(300 + gust * 500 * (0.5 + weather.wind), now, 0.5);
    this.amb.rain.g.gain.setTargetAtTime((weather.rain || 0) * 0.12, now, 0.5);
    // Dimension drones.
    const droneMap = { underwater: [0.1, 300, 1], space: [0.05, 700, 0.5], nightmare: [0.12, 350, 0.7], library: [0.03, 500, 1], lava: [0.08, 250, 0.6], crystal: [0.04, 1600, 2], neon: [0.05, 900, 1.5] };
    const dm = droneMap[amb];
    this.amb.drone.g.gain.setTargetAtTime(dm ? dm[0] : 0, now, 1);
    if (dm) { this.amb.drone.f.frequency.setTargetAtTime(dm[1], now, 1); this.amb.drone.oscs.forEach((o, i) => o.frequency.setTargetAtTime([55, 82.5, 110.3][i] * dm[2], now, 1)); }
    // Birds by day, crickets by night (overworld / nature dimensions).
    const night = w.atmosphere ? w.atmosphere.night : 0;
    if (amb === 'nature' && !weather.rain) {
      this.birdTimer -= dt;
      if (this.birdTimer < 0 && night < 0.4) {
        this.birdTimer = 1.5 + Math.random() * 5;
        const p = G.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, 6 + Math.random() * 8, (Math.random() - 0.5) * 40));
        const out = this._out(p, 10, 80);
        if (out) this._bird(out);
      }
      this.cricketTimer -= dt;
      if (this.cricketTimer < 0 && night > 0.5) {
        this.cricketTimer = 0.25 + Math.random() * 0.6;
        const p = G.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30));
        const out = this._out(p, 6, 40);
        if (out) for (let i = 0; i < 3; i++) this._tone(out, { freq: 4200 + Math.random() * 300, dur: 0.03, gain: 0.015, when: i * 0.05 });
      }
    }
    if (weather.rain > 0.3) {
      this.dropTimer -= dt;
      if (this.dropTimer < 0) { this.dropTimer = 0.03 + Math.random() * 0.08; this._noiseBurst(this.master, { freq: 3000 + Math.random() * 3000, q: 5, dur: 0.02, gain: 0.02 * weather.rain }); }
    }
  }
}
