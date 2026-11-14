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

  // ------------------------------------------------------------------------------------------- the expansion's signatures
  /**
   * a spatial output through the medium the sound travels in: 'water' (the refuge lake: low-passed, a little
   * delayed, quieter), 'contact' (felt through boots or the hull rather than heard: very low and very short), 'air'
   */
  private mout(pos: THREE.Vector3, reverb = 0.2, medium: 'air' | 'water' | 'contact' = 'air') {
    const out = this.a.out(pos, medium === 'water' ? reverb * 1.5 : reverb, medium !== 'contact');
    if (!out || !this.ctx) return null;
    if (medium === 'air') return out;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = medium === 'water' ? 650 : 160;
    f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = medium === 'water' ? 0.75 : 0.5;
    f.connect(g).connect(out);
    return f;
  }

  /** Glass Ribbon: a delicate scrape on mineral film */
  ribbonScrape(pos: THREE.Vector3, gain = 0.06, medium: 'air' | 'water' = 'water') {
    const out = this.mout(pos, 0.2, medium);
    if (!out) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 5; i++) this.noise('white', t + i * 0.06 + Math.random() * 0.03, 0.05, out, gain, { type: 'bandpass', f0: 2400 + Math.random() * 1500, q: 6 }, 0.004);
  }

  /** Prism Architect: ceramic scraping and a fragment tap */
  prismScrape(pos: THREE.Vector3, gain = 0.15) {
    const out = this.mout(pos, 0.3);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(23, 0.9, out, t, 0.5);
    this.noise('white', t, 0.45, tr, gain, { type: 'bandpass', f0: 2600, f1: 1900, q: 4 }, 0.02);
    // the tap: a short ringing ceramic click (inharmonic partials)
    for (const [f, k] of [[2730, 1], [4180, 0.5], [6020, 0.3]] as const) this.osc('sine', f, f * 0.98, t + 0.5, 0.12, out, gain * 0.7 * k, 0.001);
  }

  /** Ghost of Valles: a faint fluid pulse; `lunge` adds the rush of its wake */
  ghostPulse(pos: THREE.Vector3, gain = 0.12, lunge = false) {
    const out = this.mout(pos, 0.4, 'water');
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 78, 46, t, 0.6, out, gain, 0.08);
    this.noise('pink', t, lunge ? 0.9 : 0.5, out, gain * (lunge ? 1.6 : 0.6), { type: 'lowpass', f0: lunge ? 900 : 400, f1: 200 }, 0.05);
  }

  /** Basalt Mimic: grit shifting under a moving body; `warn` adds the short low warning signal */
  mimicGrit(pos: THREE.Vector3, gain = 0.15, warn = false) {
    const out = this.mout(pos, 0.25);
    if (!out) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 14; i++) this.noise('brown', t + i * 0.03 + Math.random() * 0.02, 0.025, out, gain * (0.4 + Math.random() * 0.6), { type: 'bandpass', f0: 600 + Math.random() * 1600, q: 3 }, 0.002);
    if (warn) {
      const tr = this.trem(17, 0.7, out, t + 0.45, 0.7);
      this.osc('sawtooth', 68, 58, t + 0.45, 0.6, tr, gain * 0.8, 0.04);
    }
  }

  /** Red Dune Hermit: footfalls felt through the boots (near-vacuum outside: contact only) */
  hermitStep(pos: THREE.Vector3, gain = 0.25) {
    const out = this.mout(pos, 0, 'contact');
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 52, 38, t, 0.08, out, gain, 0.003);
  }

  /** Thermal Rift Serpent: a low submerged resonance; `crack` adds the jaw crack and a heavy rub */
  serpentCall(pos: THREE.Vector3, gain = 0.25, crack = false) {
    const out = this.mout(pos, 0.4, 'water');
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 58, 44, t, 1.8, out, gain, 0.3);
    this.osc('triangle', 116, 90, t, 1.6, out, gain * 0.35, 0.3);
    if (crack) {
      this.noise('white', t + 0.2, 0.04, out, gain * 1.4, { type: 'highpass', f0: 1200 }, 0.001);
      this.noise('brown', t + 0.25, 0.5, out, gain, { type: 'lowpass', f0: 300 }, 0.02);
    }
  }

  /** Subglacial Monarch: a long deep rumble through the water; `wake` adds the pressure wake of its pass */
  monarchRumble(pos: THREE.Vector3, gain = 0.4, wake = false) {
    const out = this.mout(pos, 0.6, 'water');
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(3, 0.4, out, t, 5);
    this.osc('sine', 34, 27, t, 4.5, tr, gain, 0.8);
    this.noise('brown', t, 4.5, tr, gain * 0.6, { type: 'lowpass', f0: 140 }, 0.8);
    if (wake) this.noise('pink', t + 1, 2.5, out, gain * 0.9, { type: 'lowpass', f0: 500, f1: 120 }, 0.4);
  }

  /** Stormskimmer: a wide soft rush of air over the membranes, their flex */
  skimmerRush(pos: THREE.Vector3, gain = 0.25) {
    const out = this.mout(pos, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noise('pink', t, 3.2, out, gain, { type: 'bandpass', f0: 300, f1: 950, q: 0.7 }, 0.9);
    for (let i = 0; i < 3; i++) this.noise('brown', t + 0.6 + i * 0.8, 0.25, out, gain * 0.5, { type: 'lowpass', f0: 180 }, 0.05);
  }

  /** Skyjelly: near silence — a faint flutter of the bell */
  jellyFlutter(pos: THREE.Vector3, gain = 0.06) {
    const out = this.mout(pos, 0.4);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(6, 0.9, out, t, 1.6);
    this.noise('pink', t, 1.5, tr, gain, { type: 'lowpass', f0: 800 }, 0.3);
  }

  /** Stormbeast: a low intimidating gas vibration; `maw` adds the abrupt opening and the air it displaces */
  beastRumble(pos: THREE.Vector3, gain = 0.5, maw = false) {
    const out = this.mout(pos, 0.7);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(7, 0.6, out, t, 3.5);
    this.osc('sawtooth', 38, 26, t, 3.2, tr, gain * 0.5, 0.5);
    this.noise('brown', t, 3.2, tr, gain, { type: 'lowpass', f0: 160 }, 0.5);
    if (maw) this.noise('white', t + 1.5, 1.4, out, gain * 0.8, { type: 'bandpass', f0: 1400, f1: 200, q: 0.6 }, 0.05);
  }

  /** Floating Colony: a broad diffuse hiss (an environment, not a voice) */
  colonyHiss(pos: THREE.Vector3, gain = 0.08) {
    const out = this.mout(pos, 0.6);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noise('white', t, 4, out, gain, { type: 'bandpass', f0: 2600, q: 0.4 }, 1.5);
  }

  /** Voltdrifter: an electrosensory clicking response and the rush of its tendrils */
  voltClicks(pos: THREE.Vector3, gain = 0.15) {
    const out = this.mout(pos, 0.2);
    if (!out) return;
    let t = this.ctx!.currentTime;
    for (let i = 0; i < 9; i++) {
      this.noise('white', t, 0.008, out, gain * (0.6 + Math.random() * 0.4), { type: 'highpass', f0: 4200 }, 0.0005);
      t += 0.02 + Math.random() * 0.07;
    }
    this.noise('pink', this.ctx!.currentTime + 0.1, 0.8, out, gain * 0.5, { type: 'bandpass', f0: 700, q: 1 }, 0.1);
  }

  /** Deepdiver: dense armour resonance and deep fin buffeting */
  diverResonance(pos: THREE.Vector3, gain = 0.3) {
    const out = this.mout(pos, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    for (const [f, k] of [[96, 1], [151, 0.6], [233, 0.4], [347, 0.25]] as const) this.osc('sine', f, f * 0.97, t, 2.2, out, gain * k * 0.5, 0.01);
    for (let i = 0; i < 4; i++) this.noise('brown', t + 0.3 + i * 0.45, 0.3, out, gain * 0.6, { type: 'lowpass', f0: 120 }, 0.04);
  }

  /** Gasgrazer: the rhythmic vibration of its comb and a low call */
  combCall(pos: THREE.Vector3, gain = 0.35) {
    const out = this.mout(pos, 0.7);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(16, 0.8, out, t, 2.5);
    this.noise('pink', t, 2.4, tr, gain * 0.7, { type: 'bandpass', f0: 420, q: 2 }, 0.3);
    this.osc('sine', 62, 48, t + 1.0, 3.5, out, gain, 0.6);
    this.osc('sine', 93, 72, t + 1.0, 3.5, out, gain * 0.4, 0.6);
  }

  /** Aeromite Swarm: a faint shimmering rustle near a dense swarm */
  aeromiteRustle(pos: THREE.Vector3, gain = 0.05) {
    const out = this.mout(pos, 0.3);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const tr = this.trem(37, 0.95, out, t, 2.5);
    this.noise('white', t, 2.4, tr, gain, { type: 'highpass', f0: 5200 }, 0.6);
  }

  /** Stormhunter: a short resonant call; `rush` adds the tearing rush of its fins in the intercept */
  hunterCall(pos: THREE.Vector3, gain = 0.4, rush = false) {
    const out = this.mout(pos, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.9);
    bp.connect(out);
    this.osc('sawtooth', 310, 180, t, 0.9, bp, gain, 0.03);
    this.osc('sawtooth', 465, 270, t, 0.9, bp, gain * 0.5, 0.03);
    if (rush) this.noise('white', t + 0.6, 1.2, out, gain * 0.9, { type: 'bandpass', f0: 1800, f1: 400, q: 0.5 }, 0.05);
  }
}
