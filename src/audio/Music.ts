import { rng } from '../core/math';

/**
 * Original generative score. Each cue is a small harmonic plan (key, scale, chord cycle) and a set of
 * layers that are synthesised note by note; an intensity control brings layers in and out so the same cue
 * can sit quietly under exploration or build under a launch. Nothing is sampled or transcribed.
 */
type LayerKind = 'pad' | 'organ' | 'drone' | 'bass' | 'arp' | 'pulse' | 'bell' | 'tick' | 'shimmer';
interface Layer { kind: LayerKind; gain: number; from?: number; to?: number; oct?: number; every?: number; density?: number }
interface Cue {
  bpm: number;
  /** MIDI note of the tonic */
  root: number;
  scale: number[];
  /** chords as scale degrees (0-based), one per `bars` bars */
  prog: number[][];
  bars: number;
  beats: number;
  layers: Layer[];
  /** seconds of music / seconds of silence for ambient cues (omit for continuous) */
  duty?: [number, number];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], DORIAN = [0, 2, 3, 5, 7, 9, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], PHRYG = [0, 1, 3, 5, 7, 8, 10];
const tri = (d: number) => [d, d + 2, d + 4];
const add = (d: number, ...x: number[]) => [d, d + 2, d + 4, ...x.map((k) => d + k)];

export const CUES: Record<string, Cue> = {
  menu: { bpm: 56, root: 45, scale: MINOR, prog: [add(0, 8), tri(5), add(2, 6), tri(4)], bars: 2, beats: 3, layers: [{ kind: 'pad', gain: 0.5 }, { kind: 'organ', gain: 0.22 }, { kind: 'bell', gain: 0.3, density: 0.3 }, { kind: 'drone', gain: 0.2 }] },
  farm: { bpm: 62, root: 43, scale: DORIAN, prog: [tri(0), add(3, 6), tri(6), tri(4)], bars: 2, beats: 4, duty: [95, 70], layers: [{ kind: 'pad', gain: 0.42 }, { kind: 'bell', gain: 0.34, density: 0.28 }, { kind: 'bass', gain: 0.25, from: 0.3 }, { kind: 'arp', gain: 0.16, from: 0.55, every: 2 }] },
  storm: { bpm: 70, root: 38, scale: PHRYG, prog: [tri(0), tri(1), tri(0), tri(5)], bars: 2, beats: 4, layers: [{ kind: 'drone', gain: 0.5 }, { kind: 'pad', gain: 0.4 }, { kind: 'pulse', gain: 0.22, from: 0.45 }, { kind: 'bass', gain: 0.3, from: 0.3 }] },
  road: { bpm: 84, root: 40, scale: MINOR, prog: [add(0, 8), tri(5), tri(2), add(6, 8)], bars: 2, beats: 4, duty: [120, 45], layers: [{ kind: 'pad', gain: 0.36 }, { kind: 'arp', gain: 0.22, every: 2 }, { kind: 'bass', gain: 0.3 }, { kind: 'bell', gain: 0.2, density: 0.2, from: 0.4 }, { kind: 'organ', gain: 0.2, from: 0.7 }] },
  nasa: { bpm: 60, root: 37, scale: MINOR, prog: [tri(0), add(5, 6), tri(3), tri(4)], bars: 4, beats: 4, duty: [110, 60], layers: [{ kind: 'drone', gain: 0.36 }, { kind: 'pad', gain: 0.34 }, { kind: 'bell', gain: 0.24, density: 0.18 }, { kind: 'tick', gain: 0.12, from: 0.5 }, { kind: 'organ', gain: 0.24, from: 0.65 }] },
  launch: { bpm: 96, root: 38, scale: MINOR, prog: [tri(0), tri(5), tri(2), tri(6), tri(0), tri(5), add(3, 6), tri(4)], bars: 2, beats: 4, layers: [{ kind: 'drone', gain: 0.3 }, { kind: 'pulse', gain: 0.3 }, { kind: 'tick', gain: 0.1, to: 0.6 }, { kind: 'bass', gain: 0.36, from: 0.2 }, { kind: 'organ', gain: 0.4, from: 0.35 }, { kind: 'arp', gain: 0.24, from: 0.55, every: 1 }, { kind: 'shimmer', gain: 0.16, from: 0.8 }] },
  orbit: { bpm: 52, root: 41, scale: LYDIAN, prog: [add(0, 6), tri(1), add(4, 8), tri(0)], bars: 4, beats: 4, duty: [140, 50], layers: [{ kind: 'pad', gain: 0.46 }, { kind: 'organ', gain: 0.2 }, { kind: 'bell', gain: 0.26, density: 0.2 }, { kind: 'shimmer', gain: 0.12, from: 0.5 }] },
  dock: { bpm: 104, root: 45, scale: MINOR, prog: [tri(0), tri(5), tri(3), tri(4)], bars: 2, beats: 4, layers: [{ kind: 'tick', gain: 0.16 }, { kind: 'pulse', gain: 0.26, from: 0.15 }, { kind: 'bass', gain: 0.3, from: 0.3 }, { kind: 'organ', gain: 0.4, from: 0.5 }, { kind: 'arp', gain: 0.2, from: 0.7, every: 1 }] },
  ship: { bpm: 50, root: 38, scale: DORIAN, prog: [add(0, 6), tri(3), tri(0), tri(6)], bars: 4, beats: 4, duty: [90, 110], layers: [{ kind: 'pad', gain: 0.36 }, { kind: 'bell', gain: 0.22, density: 0.16 }, { kind: 'drone', gain: 0.18 }] },
  transit: { bpm: 58, root: 36, scale: LYDIAN, prog: [add(0, 6), add(1, 6), tri(4), add(0, 8)], bars: 4, beats: 4, layers: [{ kind: 'pad', gain: 0.4 }, { kind: 'shimmer', gain: 0.22 }, { kind: 'organ', gain: 0.34, from: 0.3 }, { kind: 'arp', gain: 0.18, from: 0.5, every: 1 }, { kind: 'bass', gain: 0.25, from: 0.4 }] },
  gargantua: { bpm: 44, root: 34, scale: MINOR, prog: [tri(0), tri(5), add(3, 6), tri(4)], bars: 4, beats: 4, layers: [{ kind: 'drone', gain: 0.5 }, { kind: 'organ', gain: 0.46 }, { kind: 'pad', gain: 0.3 }, { kind: 'bell', gain: 0.16, density: 0.12 }, { kind: 'tick', gain: 0.08, from: 0.6 }] },
  miller: { bpm: 60, root: 45, scale: MINOR, prog: [tri(0), tri(0), tri(5), tri(3)], bars: 4, beats: 4, layers: [{ kind: 'tick', gain: 0.2 }, { kind: 'pad', gain: 0.3 }, { kind: 'pulse', gain: 0.24, from: 0.4 }, { kind: 'organ', gain: 0.4, from: 0.6 }, { kind: 'bass', gain: 0.3, from: 0.5 }] },
  mann: { bpm: 48, root: 39, scale: PHRYG, prog: [tri(0), tri(1), tri(5), tri(0)], bars: 4, beats: 4, layers: [{ kind: 'drone', gain: 0.3 }, { kind: 'shimmer', gain: 0.2 }, { kind: 'bell', gain: 0.24, density: 0.16 }, { kind: 'pad', gain: 0.28 }, { kind: 'pulse', gain: 0.26, from: 0.6 }, { kind: 'organ', gain: 0.36, from: 0.75 }] },
  edmunds: { bpm: 60, root: 43, scale: MAJOR, prog: [add(0, 8), tri(3), tri(5), add(4, 6)], bars: 2, beats: 4, duty: [120, 60], layers: [{ kind: 'pad', gain: 0.44 }, { kind: 'bell', gain: 0.32, density: 0.3 }, { kind: 'bass', gain: 0.22 }, { kind: 'organ', gain: 0.26, from: 0.5 }] },
};

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  private out: GainNode;
  private rev: ConvolverNode;
  private cueId = '';
  private cue: Cue | null = null;
  private cueGain: GainNode | null = null;
  private next = 0;
  private step = 0;
  private rand = rng(7);
  private phraseT = 0;
  private resting = false;
  intensity = 0.3;
  private bellLast = 0;

  constructor(private ctx: AudioContext, dest: AudioNode, private noiseBuf: AudioBuffer) {
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
    // long, dark hall for the score
    this.rev = ctx.createConvolver();
    this.rev.buffer = impulse(ctx, 5.5, 2.2, 3200);
    const send = ctx.createGain();
    send.gain.value = 0.55;
    this.rev.connect(send).connect(dest);
  }

  /** Cross-fade to another cue ('' = silence). */
  set(id: string) {
    if (id === this.cueId) return;
    const t = this.ctx.currentTime;
    if (this.cueGain) { const g = this.cueGain; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 1.6); setTimeout(() => g.disconnect(), 9000); }
    this.cueId = id;
    this.cue = CUES[id] ?? null;
    this.cueGain = null;
    if (!this.cue) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(1, t + 0.5, 2.2);
    g.connect(this.out);
    g.connect(this.rev);
    this.cueGain = g;
    this.next = t + 0.6;
    this.step = 0;
    this.phraseT = 0;
    this.resting = false;
  }

  get current() { return this.cueId; }

  /** Schedule notes a little ahead of the audio clock. Call every frame. */
  update(dt: number) {
    const c = this.cue, g = this.cueGain;
    if (!c || !g) return;
    const ctx = this.ctx;
    // phrases and rests for ambient cues
    if (c.duty) {
      this.phraseT += dt;
      const lim = this.resting ? c.duty[1] : c.duty[0];
      if (this.phraseT > lim) {
        this.phraseT = 0;
        this.resting = !this.resting;
        g.gain.setTargetAtTime(this.resting ? 0 : 1, ctx.currentTime, this.resting ? 5 : 3);
      }
    }
    const sixteenth = 60 / c.bpm / 4;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.35) {
      if (!this.resting) this.schedule(c, g, this.step, this.next, sixteenth);
      this.step++;
      this.next += sixteenth;
    }
  }

  private schedule(c: Cue, out: AudioNode, step: number, t: number, s16: number) {
    const perBar = c.beats * 4;
    const bar = Math.floor(step / perBar), inBar = step % perBar;
    const chordIdx = Math.floor(bar / c.bars) % c.prog.length;
    const chord = c.prog[chordIdx];
    const chordStart = inBar === 0 && bar % c.bars === 0;
    const chordDur = c.bars * perBar * s16;
    const note = (deg: number, oct = 0) => c.root + oct * 12 + c.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const I = this.intensity;
    for (const L of c.layers) {
      const lo = L.from ?? -1, hi = L.to ?? 2;
      const w = Math.min(1, Math.max(0, (I - lo) / 0.12)) * Math.min(1, Math.max(0, (hi - I) / 0.12));
      if (w <= 0.01) continue;
      const gain = L.gain * w;
      switch (L.kind) {
        case 'pad':
          if (chordStart) for (const d of chord) this.pad(out, hz(note(d, 1 + (L.oct ?? 0))), t, chordDur, gain * 0.2, 500 + 1500 * I);
          break;
        case 'organ':
          if (chordStart) {
            this.organ(out, hz(note(chord[0], 0)), t, chordDur, gain * 0.3);
            for (const d of chord) this.organ(out, hz(note(d, 1)), t, chordDur, gain * 0.16);
            if (I > 0.75) this.organ(out, hz(note(chord[1], 2)), t, chordDur, gain * 0.09);
          }
          break;
        case 'drone':
          if (chordStart && chordIdx % 2 === 0) { this.sine(out, hz(c.root - 12), t, chordDur * 2, gain * 0.34, 4, 5); this.sine(out, hz(c.root - 5), t, chordDur * 2, gain * 0.12, 5, 5); }
          break;
        case 'bass':
          if (inBar === 0) this.bass(out, hz(note(chord[0], -1)), t, s16 * perBar * 0.95, gain * 0.5);
          break;
        case 'arp': {
          const every = L.every ?? 2;
          if (inBar % every === 0) {
            const k = Math.floor(step / every);
            const pat = [0, 1, 2, 1, 3, 2, 1, 2];
            const p = pat[k % pat.length];
            const deg = chord[p % chord.length] + (p >= chord.length ? 7 : 0);
            const acc = k % 4 === 0 ? 1 : 0.62;
            this.pluck(out, hz(note(deg, 2 + (L.oct ?? 0))), t, s16 * every * 2.2, gain * 0.34 * acc);
          }
          break;
        }
        case 'pulse':
          if (inBar % 2 === 0) {
            const acc = inBar % 8 === 0 ? 1 : 0.7;
            this.stab(out, hz(note(chord[0], 1)), t, s16 * 1.6, gain * 0.2 * acc);
            this.stab(out, hz(note(chord[2 % chord.length], 1)), t, s16 * 1.6, gain * 0.14 * acc);
          }
          break;
        case 'bell': {
          // sparse melody: a slow random walk over chord and scale tones, never on a fixed grid
          if (inBar % 2 === 0 && this.rand() < (L.density ?? 0.2) * (0.6 + 0.8 * I) && t - this.bellLast > s16 * 3) {
            const pool = [...chord, chord[0] + 7, chord[1] + 7, 4, 8, 9];
            const deg = pool[Math.floor(this.rand() * pool.length)];
            this.bell(out, hz(note(deg, 2)), t + this.rand() * s16 * 0.5, gain * 0.3);
            if (this.rand() < 0.3) this.bell(out, hz(note(deg + 2, 2)), t + s16 * 2, gain * 0.2);
            this.bellLast = t;
          }
          break;
        }
        case 'tick':
          if (inBar % 4 === 0) this.tick(out, t, gain * (inBar === 0 ? 1 : 0.7));
          break;
        case 'shimmer':
          if (inBar % 4 === 2 && this.rand() < 0.7) {
            const deg = chord[Math.floor(this.rand() * chord.length)];
            this.sine(out, hz(note(deg, 4)), t, s16 * 10, gain * 0.07, s16 * 3, s16 * 6);
            this.sine(out, hz(note(deg, 4)) * 1.003, t, s16 * 10, gain * 0.05, s16 * 3, s16 * 6);
          }
          break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ voices
  private env(g: GainNode, t: number, dur: number, peak: number, a: number, r: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + r * 0.5);
  }

  private sine(out: AudioNode, f: number, t: number, dur: number, gain: number, a: number, r: number) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = f;
    this.env(g, t, dur, gain, a, r);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + r);
  }

  private pad(out: AudioNode, f: number, t: number, dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(cutoff * 0.5, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur + 1);
    const g = ctx.createGain();
    this.env(g, t, dur, gain, Math.min(2.4, dur * 0.4), Math.min(2.6, dur * 0.5));
    for (const det of [-7, 0, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 2.8);
    }
    lp.connect(g).connect(out);
  }

  /** Additive pipe-organ-like tone: principal, octave, twelfth, fifteenth with slow wind-up. */
  private organ(out: AudioNode, f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this.env(g, t, dur, gain, Math.min(1.2, dur * 0.25), Math.min(1.6, dur * 0.4));
    const parts: [number, number][] = [[1, 1], [2, 0.5], [3, 0.24], [4, 0.2], [6, 0.07], [8, 0.05]];
    for (const [m, a] of parts) {
      if (f * m > 6000) continue;
      const o = ctx.createOscillator(), pg = ctx.createGain();
      o.frequency.value = f * m * (1 + (this.rand() - 0.5) * 0.002);
      pg.gain.value = a;
      o.connect(pg).connect(g); o.start(t); o.stop(t + dur + 1.8);
    }
    // a breath of wind noise on the attack
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(4000, f * 4); bp.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05, t + 0.15); ng.gain.exponentialRampToValueAtTime(0.004, t + 1.2);
    n.connect(bp).connect(ng).connect(g); n.start(t, this.rand()); n.stop(t + dur + 1.8);
    g.connect(out);
  }

  private bass(out: AudioNode, f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o = ctx.createOscillator(); o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.2;
    o.connect(g); o2.connect(g2).connect(g); g.connect(out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  private pluck(out: AudioNode, f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 6), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.2), t + dur);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.frequency.value = f * 2.001; const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  private stab(out: AudioNode, f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.setValueAtTime(gain, t + dur * 0.55); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const [m, a] of [[1, 1], [2, 0.45], [3, 0.2], [4, 0.12]] as [number, number][]) {
      const o = ctx.createOscillator(), pg = ctx.createGain(); o.frequency.value = f * m; pg.gain.value = a;
      o.connect(pg).connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
    g.connect(out);
  }

  private bell(out: AudioNode, f: number, t: number, gain: number) {
    const ctx = this.ctx;
    for (const [m, a, d] of [[1, 1, 3.2], [2, 0.32, 1.6], [3.01, 0.12, 0.9], [4.2, 0.05, 0.5]] as [number, number, number][]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0003, t + d);
      o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.05);
    }
  }

  private tick(out: AudioNode, t: number, gain: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(2100, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.03);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(gain * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
    n.connect(hp).connect(ng).connect(out); n.start(t, this.rand()); n.stop(t + 0.05);
  }
}

/** Synthetic impulse response: decaying noise, darker towards the tail. */
export function impulse(ctx: BaseAudioContext, seconds: number, decay: number, tone = 6000) {
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const k = Math.exp(-2 * Math.PI * tone / ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const white = Math.random() * 2 - 1;
      lp = lp * k + white * (1 - k);
      const mix = Math.min(1, x * 3);
      d[i] = (white * (1 - mix) + lp * mix * 2.2) * Math.pow(1 - x, decay) * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}
