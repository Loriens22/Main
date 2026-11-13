import * as THREE from 'three';
import type { AudioEngine } from './Audio';

/**
 * Synthesised creature voices (Web Audio only; nothing sampled). Each call builds a short graph into the engine's
 * spatial output and lets it free itself.
 */
export class CreatureVoice {
  constructor(private a: AudioEngine) {}

  private get ctx() {
    return this.a.ctx;
  }

  private env(g: GainNode, t: number, peak: number, att: number, hold: number, rel: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + att + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + hold + rel);
  }

  private osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode, peak: number, att = 0.02) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, att, dur * 0.6, dur * 0.4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(kind: 'white' | 'pink' | 'brown', t: number, dur: number, out: AudioNode, peak: number, filt: { type: BiquadFilterType; f0: number; f1?: number; q?: number }, att = 0.01) {
    const ctx = this.ctx!;
    const src = this.a.noiseSource(kind);
    const f = ctx.createBiquadFilter();
    f.type = filt.type;
    f.Q.value = filt.q ?? 1;
    f.frequency.setValueAtTime(filt.f0, t);
    if (filt.f1) f.frequency.exponentialRampToValueAtTime(filt.f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, att, dur * 0.5, dur * 0.5);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** a tremolo node (amplitude modulation at `rate` Hz, depth 0..1) */
  private trem(rate: number, depth: number, out: AudioNode, t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 1 - depth / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.value = depth / 2;
    lfo.connect(lg).connect(g.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    g.connect(out);
    return g;
  }

  // ------------------------------------------------------------------------------------------- Mars
  /** strider: the rising sonic shriek (two detuned saws through a sweeping resonant band, rattling) */
  shriek(pos: THREE.Vector3, dur = 1.6, gain = 0.5) {
    const out = this.a.out(pos, 0.35);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(3400, t + dur * 0.7);
    const tr = this.trem(34, 0.7, out, t, dur);
    bp.connect(tr);
    this.osc('sawtooth', 380, 2400, t, dur, bp, gain);
    this.osc('sawtooth', 395, 2550, t, dur, bp, gain * 0.8);
    this.noise('white', t + dur * 0.4, dur * 0.6, out, gain * 0.25, { type: 'highpass', f0: 2500 });
  }

  /** strider: low stridulating buzz while it displays */
  stridulate(pos: THREE.Vector3, dur = 1.2, gain = 0.18) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 2;
    const tr = this.trem(16, 0.95, out, t, dur);
    bp.connect(tr);
    this.osc('square', 42, 48, t, dur, bp, gain);
  }

  /** strider: short chirps (herd contact) */
  chirp(pos: THREE.Vector3, gain = 0.12) {
    const out = this.a.out(pos, 0.25);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 1700, 2600, t, 0.09, out, gain);
    this.osc('sine', 2100, 1500, t + 0.13, 0.08, out, gain * 0.8);
  }

  /** stalker: echolocation clicks */
  clicks(pos: THREE.Vector3, n = 6, gain = 0.25) {
    const out = this.a.out(pos, 0.15);
    if (!out || !this.ctx) return;
    let t = this.ctx.currentTime;
    for (let i = 0; i < n; i++) {
      this.noise('white', t, 0.012, out, gain, { type: 'bandpass', f0: 3200 + Math.random() * 900, q: 9 }, 0.001);
      t += 0.035 + Math.random() * 0.05;
    }
  }

  /** stalker: wet growl rising to a hiss */
  growl(pos: THREE.Vector3, dur = 1.0, gain = 0.4) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const tr = this.trem(11, 0.8, out, t, dur);
    this.noise('brown', t, dur, tr, gain, { type: 'lowpass', f0: 240, q: 3 });
    this.osc('sawtooth', 62, 48, t, dur, tr, gain * 0.3);
    this.noise('white', t + dur * 0.6, dur * 0.5, out, gain * 0.35, { type: 'highpass', f0: 3000 });
  }

  /** stalker: the pounce scream */
  scream(pos: THREE.Vector3, gain = 0.55) {
    const out = this.a.out(pos, 0.3);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    bp.connect(out);
    this.osc('sawtooth', 520, 260, t, 0.6, bp, gain);
    this.osc('square', 760, 300, t, 0.5, bp, gain * 0.4);
    this.noise('white', t, 0.6, out, gain * 0.3, { type: 'bandpass', f0: 2600, q: 1.5 });
  }

  /** burrowing: dust and grit moving under the surface */
  burrow(pos: THREE.Vector3, gain = 0.2) {
    const out = this.a.out(pos, 0.05);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise('brown', t, 0.5, out, gain, { type: 'bandpass', f0: 300, f1: 500, q: 1.2 }, 0.08);
  }

  /** lancewing: a screech (FM) */
  screech(pos: THREE.Vector3, gain = 0.4) {
    const out = this.a.out(pos, 0.4);
    if (!out || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const car = ctx.createOscillator();
    car.frequency.setValueAtTime(1300, t);
    car.frequency.exponentialRampToValueAtTime(900, t + 0.9);
    const mod = ctx.createOscillator();
    mod.frequency.value = 330;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(200, t);
    mg.gain.linearRampToValueAtTime(900, t + 0.5);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, gain, 0.03, 0.5, 0.4);
    car.connect(g).connect(out);
    car.start(t);
    mod.start(t);
    car.stop(t + 1);
    mod.stop(t + 1);
  }

  /** lancewing: the dive whistle, rising as it comes */
  whistle(pos: THREE.Vector3, dur = 2.2, gain = 0.35) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(3600, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 9;
    const vg = ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(g).connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.2);
    vib.stop(t + dur + 0.2);
    this.noise('pink', t + dur * 0.5, dur * 0.5, out, gain * 0.4, { type: 'bandpass', f0: 800, f1: 2500, q: 0.8 }, dur * 0.4);
  }

  /** a slow wingbeat whoosh */
  wingbeat(pos: THREE.Vector3, gain = 0.12) {
    const out = this.a.out(pos, 0.1);
    if (!out || !this.ctx) return;
    this.noise('pink', this.ctx.currentTime, 0.45, out, gain, { type: 'lowpass', f0: 500, f1: 220, q: 0.7 }, 0.12);
  }

  /** tether-kite: a taut line twanging */
  twang(pos: THREE.Vector3, gain = 0.2) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('triangle', 180, 120, t, 0.7, out, gain, 0.005);
    this.osc('sine', 362, 240, t, 0.6, out, gain * 0.5, 0.005);
  }

  // ------------------------------------------------------------------------------------------- Jupiter
  /** floater: a deep, slow song (whale-like glide through formants) */
  song(pos: THREE.Vector3, dur = 4.5, gain = 0.45) {
    const out = this.a.out(pos, 0.6);
    if (!out || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(700, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(260, t + dur);
    f.connect(out);
    const base = 46 + Math.random() * 20;
    this.osc('sawtooth', base, base * 1.6, t, dur, f, gain, 0.6);
    this.osc('sine', base * 2, base * 2.8, t, dur, out, gain * 0.35, 0.8);
  }

  /** an electrical discharge */
  zap(pos: THREE.Vector3 | undefined, gain = 0.5) {
    const out = this.a.out(pos, 0.25, false);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noise('white', t + i * 0.04 + Math.random() * 0.03, 0.06, out, gain * (1 - i * 0.15), { type: 'highpass', f0: 1800 }, 0.001);
    this.osc('square', 120, 60, t, 0.35, out, gain * 0.3, 0.002);
  }

  /** maw ray: sonar ping before it strikes */
  ping(pos: THREE.Vector3, gain = 0.3) {
    const out = this.a.out(pos, 0.5);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 2300, 2250, t, 0.5, out, gain, 0.003);
    this.osc('sine', 1150, 1120, t + 0.02, 0.7, out, gain * 0.4, 0.003);
  }

  /** a wet heartbeat thud */
  heartbeat(gain = 0.35) {
    const out = this.a.out(undefined, 0.05, false);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc('sine', 62, 40, t, 0.16, out, gain, 0.004);
    this.osc('sine', 58, 38, t + 0.24, 0.14, out, gain * 0.7, 0.004);
  }

  /** hull under strain: grinding and creaking */
  hullGrind(gain = 0.3) {
    const out = this.a.out(undefined, 0.15, false);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise('brown', t, 0.9, out, gain, { type: 'bandpass', f0: 140, f1: 90, q: 2 }, 0.05);
    this.osc('sawtooth', 70 + Math.random() * 40, 55, t, 0.7, out, gain * 0.25, 0.1);
  }

  /** spore bladders bursting */
  pop(pos: THREE.Vector3, gain = 0.35) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise('white', t, 0.08, out, gain, { type: 'bandpass', f0: 700, q: 1.5 }, 0.002);
    this.noise('pink', t + 0.05, 1.0, out, gain * 0.4, { type: 'highpass', f0: 1800 }, 0.1);
  }

  /** hunter: the harpoon cord firing, and the eerie chime it calls with */
  harpoon(pos: THREE.Vector3, gain = 0.4) {
    const out = this.a.out(pos, 0.2);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise('white', t, 0.15, out, gain, { type: 'bandpass', f0: 1500, f1: 400, q: 1.2 }, 0.002);
    this.osc('triangle', 300, 90, t, 0.5, out, gain * 0.4, 0.002);
  }
  chime(pos: THREE.Vector3, gain = 0.25) {
    const out = this.a.out(pos, 0.6);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    [1, 1.5, 2.37].forEach((k, i) => this.osc('sine', 520 * k, 500 * k, t + i * 0.12, 1.4, out, gain / (i + 1), 0.01));
  }

  // ------------------------------------------------------------------------------------------- player
  /** ringing in the ears after a sonic blast */
  tinnitus(dur = 3, gain = 0.06) {
    const out = this.a.out(undefined, 0, false);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.value = 5600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** visor cracking */
  crack(gain = 0.4) {
    const out = this.a.out(undefined, 0.05, false);
    if (!out || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noise('white', t + i * 0.025, 0.03, out, gain * (1 - i * 0.2), { type: 'highpass', f0: 3500 }, 0.001);
  }
}
