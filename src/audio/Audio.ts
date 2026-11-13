import * as THREE from 'three';
import type { AudioSettings } from '../core/Settings';

/**
 * Procedural audio engine. Every sound in the game is synthesised at runtime (no recordings):
 * noise-based ambiences, oscillator engines, modal-synthesis metal clanks, pneumatic hisses, and a
 * generative orchestral-organ score. Buses: master → {music, sfx, dialogue, ambience}.
 */
export type Medium = 'air' | 'vacuum' | 'structure';

export interface LoopHandle {
  id: string;
  set(param: string, value: number, ramp?: number): void;
  setPosition(p: THREE.Vector3 | null): void;
  stop(fade?: number): void;
  readonly gain: GainNode;
  medium: Medium;
  base: number;
}

type LoopFactory = (a: AudioEngine, out: AudioNode) => { params: Record<string, (v: number, t: number) => void>; nodes: AudioNode[]; stop: () => void };

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses!: Record<'music' | 'sfx' | 'dialogue' | 'ambience', GainNode>;
  private noise: Record<'white' | 'pink' | 'brown', AudioBuffer> | null = null;
  reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private loops = new Map<string, LoopHandle>();
  vacuum = false; // listener outside pressurised volume, in vacuum
  readonly listenerPos = new THREE.Vector3();
  music: GenerativeMusic | null = null;
  tts = true;

  constructor(public settings: AudioSettings) {}

  /** Must be called from a user gesture. */
  async start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      dialogue: ctx.createGain(),
      ambience: ctx.createGain(),
    };
    for (const b of Object.values(this.buses)) b.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.buses.sfx);
    this.noise = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    this.applySettings(this.settings);
    this.music = new GenerativeMusic(this);
  }

  applySettings(s: AudioSettings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.music, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.buses.dialogue.gain.setTargetAtTime(s.dialogue, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.ambience, t, 0.05);
  }

  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseSource(kind: 'white' | 'pink' | 'brown' = 'white'): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise![kind];
    src.loop = true;
    src.loopStart = Math.random() * 3;
    return src;
  }

  // -------------------------------------------------------------------------------- loops
  loop(id: string, bus: 'sfx' | 'ambience' | 'music', factory: LoopFactory, opts: { pos?: THREE.Vector3; medium?: Medium; gain?: number } = {}): LoopHandle | null {
    if (!this.ctx) return null;
    const existing = this.loops.get(id);
    if (existing) return existing;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let panner: PannerNode | null = null;
    let out: AudioNode = gain;
    if (opts.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.maxDistance = 4000;
      panner.rolloffFactor = 1.1;
      panner.positionX.value = opts.pos.x;
      panner.positionY.value = opts.pos.y;
      panner.positionZ.value = opts.pos.z;
      gain.connect(panner).connect(this.buses[bus]);
    } else gain.connect(this.buses[bus]);
    const inst = factory(this, gain);
    const base = opts.gain ?? 1;
    gain.gain.setTargetAtTime(base, ctx.currentTime, 0.3);
    const h: LoopHandle = {
      id,
      gain,
      medium: opts.medium ?? 'air',
      base,
      set: (param, value, ramp = 0.08) => {
        if (param === 'gain') {
          h.base = value;
          gain.gain.setTargetAtTime(this.mediumGain(h) * value, ctx.currentTime, ramp);
          return;
        }
        inst.params[param]?.(value, ramp);
      },
      setPosition: (p) => {
        if (!panner || !p) return;
        const t = ctx.currentTime;
        panner.positionX.setTargetAtTime(p.x, t, 0.03);
        panner.positionY.setTargetAtTime(p.y, t, 0.03);
        panner.positionZ.setTargetAtTime(p.z, t, 0.03);
      },
      stop: (fade = 0.4) => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        setTimeout(() => {
          try {
            inst.stop();
            gain.disconnect();
            panner?.disconnect();
          } catch {
            /* already stopped */
          }
        }, fade * 1000 + 200);
        this.loops.delete(id);
      },
    };
    this.loops.set(id, h);
    return h;
  }

  getLoop(id: string) {
    return this.loops.get(id) ?? null;
  }

  stopLoop(id: string, fade = 0.4) {
    this.loops.get(id)?.stop(fade);
  }

  stopAllLoops(fade = 0.5) {
    for (const l of [...this.loops.values()]) l.stop(fade);
  }

  private mediumGain(h: LoopHandle) {
    if (!this.vacuum) return 1;
    return h.medium === 'air' ? 0 : 1;
  }

  setVacuum(v: boolean) {
    if (v === this.vacuum || !this.ctx) return;
    this.vacuum = v;
    for (const h of this.loops.values()) h.gain.gain.setTargetAtTime(this.mediumGain(h) * h.base, this.ctx.currentTime, 0.4);
  }

  updateListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(new THREE.Vector3());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    this.listenerPos.copy(p);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02);
      l.upY.setTargetAtTime(u.y, t, 0.02);
      l.upZ.setTargetAtTime(u.z, t, 0.02);
    }
  }

  /** A spatial (or flat) output for custom one-shot graphs (creature voices); null when audio is off or muted by vacuum. */
  out(pos?: THREE.Vector3, reverb = 0.2, air = true): AudioNode | null {
    if (!this.ctx) return null;
    if (this.vacuum && air && pos) return null;
    return this.dest(pos, 'sfx', reverb);
  }

  // -------------------------------------------------------------------------------- one-shots
  private dest(pos?: THREE.Vector3, bus: 'sfx' | 'ambience' | 'dialogue' = 'sfx', reverb = 0.15): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.refDistance = 3;
      p.rolloffFactor = 1.2;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      g.connect(p).connect(this.buses[bus]);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        p.connect(s).connect(this.reverbSend);
      }
    } else {
      g.connect(this.buses[bus]);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        g.connect(s).connect(this.reverbSend);
      }
    }
    setTimeout(() => g.disconnect(), 8000);
    return g;
  }

  /** Short filtered noise burst. */
  burst(opts: { pos?: THREE.Vector3; dur?: number; freq?: number; q?: number; type?: BiquadFilterType; gain?: number; noise?: 'white' | 'pink' | 'brown'; sweepTo?: number; attack?: number; air?: boolean }) {
    if (!this.ctx) return;
    if (this.vacuum && opts.air !== false && opts.pos) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource(opts.noise ?? 'white');
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq ?? 1200;
    f.Q.value = opts.q ?? 1;
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + (opts.dur ?? 0.2));
    const g = ctx.createGain();
    const dur = opts.dur ?? 0.15;
    const att = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.5, t + att);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.dest(opts.pos));
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Modal synthesis metal hit: several inharmonic partials with exponential decay. */
  clank(opts: { pos?: THREE.Vector3; base?: number; gain?: number; decay?: number; partials?: number[] } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = opts.base ?? 180;
    const parts = opts.partials ?? [1, 2.32, 3.87, 5.43, 7.1];
    const out = this.dest(opts.pos, 'sfx', 0.3);
    parts.forEach((p, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = base * p * (1 + (Math.random() - 0.5) * 0.02);
      const g = ctx.createGain();
      const amp = (opts.gain ?? 0.25) / (i + 1.2);
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.decay ?? 0.9) / (1 + i * 0.35));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 2);
    });
    this.burst({ pos: opts.pos, dur: 0.05, freq: base * 6, q: 0.7, gain: (opts.gain ?? 0.25) * 0.8 });
  }

  beep(freq = 880, dur = 0.08, gain = 0.12, type: OscillatorType = 'sine', pos?: THREE.Vector3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.dest(pos, 'sfx', 0.05));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** UI / computer sounds */
  ui(kind: 'hover' | 'click' | 'confirm' | 'back' | 'alert' | 'notify' | 'type') {
    switch (kind) {
      case 'hover': return this.beep(2200, 0.025, 0.025);
      case 'click': return this.beep(1400, 0.04, 0.06, 'triangle');
      case 'confirm': this.beep(880, 0.06, 0.06); setTimeout(() => this.beep(1320, 0.09, 0.06), 70); return;
      case 'back': return this.beep(520, 0.07, 0.05, 'triangle');
      case 'alert': this.beep(760, 0.18, 0.09, 'square'); setTimeout(() => this.beep(570, 0.18, 0.09, 'square'), 220); return;
      case 'notify': return this.beep(1046, 0.12, 0.05);
      case 'type': return this.beep(3000 + Math.random() * 800, 0.012, 0.02, 'square');
    }
  }

  footstep(surface: 'wood' | 'gravel' | 'metal' | 'dirt' | 'concrete' | 'ice' | 'water' | 'rock', pos?: THREE.Vector3, gain = 1) {
    switch (surface) {
      case 'wood': this.burst({ pos, dur: 0.09, freq: 420, q: 2.5, gain: 0.22 * gain, noise: 'pink' }); this.clank({ pos, base: 140, gain: 0.03 * gain, decay: 0.12 }); break;
      case 'gravel': this.burst({ pos, dur: 0.14, freq: 2600, q: 0.6, gain: 0.18 * gain, type: 'highpass' }); break;
      case 'metal': this.clank({ pos, base: 310 + Math.random() * 40, gain: 0.07 * gain, decay: 0.35 }); this.burst({ pos, dur: 0.05, freq: 1800, q: 1, gain: 0.08 * gain }); break;
      case 'concrete': this.burst({ pos, dur: 0.07, freq: 900, q: 1.2, gain: 0.16 * gain, noise: 'pink' }); break;
      case 'ice': this.burst({ pos, dur: 0.16, freq: 3800, q: 0.7, gain: 0.16 * gain, type: 'highpass' }); this.burst({ pos, dur: 0.05, freq: 600, q: 3, gain: 0.08 * gain }); break;
      case 'water': this.burst({ pos, dur: 0.3, freq: 700, q: 0.8, gain: 0.22 * gain, noise: 'pink', sweepTo: 2400 }); break;
      case 'rock': this.burst({ pos, dur: 0.1, freq: 1600, q: 0.9, gain: 0.15 * gain }); break;
      default: this.burst({ pos, dur: 0.12, freq: 700, q: 0.9, gain: 0.16 * gain, noise: 'pink' });
    }
  }

  hiss(pos?: THREE.Vector3, dur = 1.2, gain = 0.25) {
    this.burst({ pos, dur, freq: 5000, q: 0.5, gain, type: 'highpass', attack: 0.05, air: false });
  }

  thud(pos?: THREE.Vector3, gain = 0.6, freq = 70) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.dest(pos, 'sfx', 0.3));
    o.start(t);
    o.stop(t + 0.7);
    this.burst({ pos, dur: 0.3, freq: 300, q: 0.5, gain: gain * 0.5, noise: 'brown', type: 'lowpass', air: false });
  }

  /** Door / hatch sounds */
  door(kind: 'wood' | 'hatch' | 'blast' | 'airlock' | 'car' | 'elevator', pos?: THREE.Vector3) {
    switch (kind) {
      case 'wood':
        this.burst({ pos, dur: 0.5, freq: 900, q: 8, gain: 0.07, sweepTo: 1300, noise: 'pink' });
        setTimeout(() => this.thud(pos, 0.2, 110), 380);
        break;
      case 'car':
        this.clank({ pos, base: 120, gain: 0.25, decay: 0.25 });
        this.thud(pos, 0.4, 90);
        break;
      case 'hatch':
        this.clank({ pos, base: 95, gain: 0.3, decay: 1.2 });
        this.hiss(pos, 1.0, 0.18);
        break;
      case 'airlock':
        this.hiss(pos, 2.4, 0.3);
        setTimeout(() => this.clank({ pos, base: 70, gain: 0.35, decay: 1.8 }), 600);
        break;
      case 'blast':
        this.burst({ pos, dur: 4, freq: 90, q: 2, gain: 0.5, noise: 'brown', type: 'lowpass', attack: 0.4 });
        setTimeout(() => this.clank({ pos, base: 45, gain: 0.6, decay: 3 }), 3800);
        break;
      case 'elevator':
        this.clank({ pos, base: 160, gain: 0.2, decay: 0.6 });
        this.beep(988, 0.25, 0.05, 'sine', pos);
        break;
    }
  }

  /** Spoken dialogue through the browser speech synthesiser (optional), always paired with subtitles. */
  speak(text: string, voice: { pitch?: number; rate?: number; female?: boolean } = {}) {
    if (!this.tts || !('speechSynthesis' in window) || this.settings.dialogue <= 0.01) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = voice.pitch ?? 1;
      u.rate = voice.rate ?? 1;
      u.volume = Math.min(1, this.settings.dialogue * this.settings.master);
      const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
      if (vs.length) {
        const pick = vs.find((v) => (voice.female ? /female|samantha|victoria|zira|karen|moira|tessa|fiona/i : /male|daniel|alex|fred|david|mark|george/i).test(v.name));
        u.voice = pick ?? vs[0];
      }
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }
}

// =========================================================================================== loop factories
export const Loops = {
  wind: (): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const src = a.noiseSource('pink');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.3;
    const gl = ctx.createOscillator();
    gl.frequency.value = 0.07;
    const gg = ctx.createGain();
    gg.gain.value = 0.12;
    gl.connect(gg).connect(g.gain);
    const hi = a.noiseSource('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const hg = ctx.createGain();
    hg.gain.value = 0.04;
    src.connect(bp).connect(g).connect(out);
    hi.connect(hp).connect(hg).connect(out);
    src.start(); lfo.start(); gl.start(); hi.start();
    return {
      nodes: [src],
      params: {
        intensity: (v, r) => {
          g.gain.setTargetAtTime(0.15 + v * 0.7, ctx.currentTime, r);
          bp.frequency.setTargetAtTime(380 + v * 700, ctx.currentTime, r);
          hg.gain.setTargetAtTime(0.02 + v * 0.25, ctx.currentTime, r);
        },
      },
      stop: () => { src.stop(); lfo.stop(); gl.stop(); hi.stop(); },
    };
  },
  rustle: (): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const src = a.noiseSource('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const am = ctx.createOscillator();
    am.type = 'sawtooth';
    am.frequency.value = 7;
    const ag = ctx.createGain();
    ag.gain.value = 0.03;
    am.connect(ag).connect(g.gain);
    src.connect(hp).connect(g).connect(out);
    src.start(); am.start();
    return { nodes: [src], params: { intensity: (v, r) => g.gain.setTargetAtTime(v * 0.12, ctx.currentTime, r) }, stop: () => { src.stop(); am.stop(); } };
  },
  engine: (cyl = 6, idle = 700): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const sub = ctx.createOscillator(); sub.type = 'sine';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
    const g1 = ctx.createGain(); g1.gain.value = 0.12;
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    const gs = ctx.createGain(); gs.gain.value = 0.25;
    const n = a.noiseSource('brown'); const ng = ctx.createGain(); ng.gain.value = 0.2;
    o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); sub.connect(gs).connect(out); n.connect(ng).connect(lp);
    lp.connect(out);
    const setRpm = (rpm: number, r: number) => {
      const f = (rpm / 60) * (cyl / 2);
      o1.frequency.setTargetAtTime(f, ctx.currentTime, r);
      o2.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, r);
      sub.frequency.setTargetAtTime(f * 0.25, ctx.currentTime, r);
    };
    setRpm(idle, 0.01);
    o1.start(); o2.start(); sub.start(); n.start();
    return {
      nodes: [o1],
      params: {
        rpm: setRpm,
        load: (v, r) => { lp.frequency.setTargetAtTime(400 + v * 2200, ctx.currentTime, r); g1.gain.setTargetAtTime(0.08 + v * 0.14, ctx.currentTime, r); },
      },
      stop: () => { o1.stop(); o2.stop(); sub.stop(); n.stop(); },
    };
  },
  rocket: (): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const n = a.noiseSource('brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
    const g = ctx.createGain(); g.gain.value = 0;
    const crackle = a.noiseSource('white');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.4;
    const cg = ctx.createGain(); cg.gain.value = 0;
    const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 23;
    const amg = ctx.createGain(); amg.gain.value = 0;
    am.connect(amg).connect(cg.gain);
    const sub = ctx.createOscillator(); sub.frequency.value = 32;
    const sg = ctx.createGain(); sg.gain.value = 0;
    n.connect(lp).connect(g).connect(out);
    crackle.connect(bp).connect(cg).connect(out);
    sub.connect(sg).connect(out);
    n.start(); crackle.start(); am.start(); sub.start();
    return {
      nodes: [n],
      params: {
        thrust: (v, r) => {
          const t = ctx.currentTime;
          g.gain.setTargetAtTime(v * 1.2, t, r);
          lp.frequency.setTargetAtTime(160 + v * 500, t, r);
          cg.gain.setTargetAtTime(v * 0.12, t, r);
          amg.gain.setTargetAtTime(v * 0.1, t, r);
          sg.gain.setTargetAtTime(v * 0.6, t, r);
        },
        muffle: (v, r) => lp.frequency.setTargetAtTime(100 + (1 - v) * 600, ctx.currentTime, r),
      },
      stop: () => { n.stop(); crackle.stop(); am.stop(); sub.stop(); },
    };
  },
  hum: (freq = 60, noiseLevel = 0.25, lowpass = 380): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const n = a.noiseSource('brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lowpass;
    const ng = ctx.createGain(); ng.gain.value = noiseLevel;
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.frequency.value = freq * 2;
    const og = ctx.createGain(); og.gain.value = 0.04;
    const og2 = ctx.createGain(); og2.gain.value = 0.02;
    n.connect(lp).connect(ng).connect(out);
    o.connect(og).connect(out); o2.connect(og2).connect(out);
    n.start(); o.start(); o2.start();
    return { nodes: [n], params: { level: (v, r) => ng.gain.setTargetAtTime(v * noiseLevel, ctx.currentTime, r) }, stop: () => { n.stop(); o.stop(); o2.stop(); } };
  },
  ocean: (): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const n = a.noiseSource('pink');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.25;
    const swell = ctx.createOscillator(); swell.frequency.value = 0.11;
    const sg = ctx.createGain(); sg.gain.value = 0.15;
    swell.connect(sg).connect(g.gain);
    const sl = ctx.createGain(); sl.gain.value = 400;
    swell.connect(sl).connect(lp.frequency);
    n.connect(lp).connect(g).connect(out);
    n.start(); swell.start();
    return { nodes: [n], params: { intensity: (v, r) => g.gain.setTargetAtTime(0.1 + v * 0.8, ctx.currentTime, r) }, stop: () => { n.stop(); swell.stop(); } };
  },
  rcs: (): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const n = a.noiseSource('white');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    n.connect(bp).connect(g).connect(out);
    n.start();
    return { nodes: [n], params: { level: (v, r) => g.gain.setTargetAtTime(v * 0.35, ctx.currentTime, r * 0.3) }, stop: () => n.stop() };
  },
  alarm: (f1 = 740, f2 = 554): LoopFactory => (a, out) => {
    const ctx = a.ctx!;
    const o = ctx.createOscillator(); o.type = 'square';
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
    const lg = ctx.createGain(); lg.gain.value = (f1 - f2) / 2;
    o.frequency.value = (f1 + f2) / 2;
    lfo.connect(lg).connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
    const g = ctx.createGain(); g.gain.value = 0.05;
    o.connect(lp).connect(g).connect(out);
    o.start(); lfo.start();
    return { nodes: [o], params: {}, stop: () => { o.stop(); lfo.stop(); } };
  },
  creak: (): LoopFactory => (a, out) => {
    // slow structural creaks of the rotating ring: random resonant noise events
    const ctx = a.ctx!;
    let alive = true;
    const g = ctx.createGain(); g.gain.value = 0.6; g.connect(out);
    const tick = () => {
      if (!alive) return;
      const t = ctx.currentTime;
      const n = a.noiseSource('pink');
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18; bp.frequency.setValueAtTime(140 + Math.random() * 200, t);
      bp.frequency.linearRampToValueAtTime(110 + Math.random() * 300, t + 1.2);
      const eg = ctx.createGain(); eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.25, t + 0.4); eg.gain.linearRampToValueAtTime(0, t + 1.4);
      n.connect(bp).connect(eg).connect(g);
      n.start(t); n.stop(t + 1.5);
      setTimeout(tick, 3000 + Math.random() * 9000);
    };
    setTimeout(tick, 2000);
    return { nodes: [g], params: { level: (v, r) => g.gain.setTargetAtTime(v, ctx.currentTime, r) }, stop: () => { alive = false; } };
  },
};

// =========================================================================================== generative score
/**
 * Original generative score: a slow additive "pipe organ" pad over modal chord progressions,
 * with sparse piano-like motifs and a soft clock-pulse in tension states. Moods crossfade.
 */
export type MusicMood = 'silence' | 'menu' | 'earth' | 'facility' | 'launch' | 'space' | 'wonder' | 'tension' | 'ocean' | 'ice' | 'desert' | 'wormhole';

const MOODS: Record<MusicMood, { root: number; scale: number[]; prog: number[][]; pad: number; motif: number; pulse: number; bright: number; tempo: number }> = {
  silence: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 2, 4]], pad: 0, motif: 0, pulse: 0, bright: 0.3, tempo: 60 },
  menu: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 2, 4, 7], [5, 7, 9, 12], [3, 5, 7, 10], [4, 6, 8, 11]], pad: 0.55, motif: 0.35, pulse: 0, bright: 0.45, tempo: 54 },
  earth: { root: 43, scale: [0, 2, 4, 5, 7, 9, 10], prog: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]], pad: 0.32, motif: 0.25, pulse: 0, bright: 0.4, tempo: 50 },
  facility: { root: 40, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 2, 4], [5, 7, 9], [6, 8, 10]], pad: 0.3, motif: 0.1, pulse: 0.25, bright: 0.3, tempo: 60 },
  launch: { root: 38, scale: [0, 2, 4, 6, 7, 9, 11], prog: [[0, 2, 4, 7], [1, 3, 5, 8], [4, 6, 8, 11], [0, 4, 7, 9]], pad: 0.8, motif: 0.4, pulse: 0.5, bright: 0.7, tempo: 72 },
  space: { root: 41, scale: [0, 2, 4, 6, 7, 9, 11], prog: [[0, 2, 4, 6], [3, 5, 7, 9], [1, 3, 5, 7], [4, 6, 8, 10]], pad: 0.45, motif: 0.3, pulse: 0, bright: 0.55, tempo: 46 },
  wonder: { root: 36, scale: [0, 2, 4, 6, 7, 9, 11], prog: [[0, 4, 7, 9], [3, 7, 9, 11], [5, 7, 9, 13], [4, 6, 9, 11]], pad: 0.75, motif: 0.4, pulse: 0, bright: 0.8, tempo: 42 },
  tension: { root: 40, scale: [0, 1, 3, 5, 6, 8, 10], prog: [[0, 2, 4], [1, 3, 5], [0, 2, 5], [6, 8, 10]], pad: 0.5, motif: 0.15, pulse: 0.9, bright: 0.35, tempo: 92 },
  ocean: { root: 38, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [6, 8, 10]], pad: 0.4, motif: 0.15, pulse: 0.55, bright: 0.35, tempo: 66 },
  ice: { root: 47, scale: [0, 1, 3, 5, 7, 8, 10], prog: [[0, 2, 4], [1, 3, 5], [5, 7, 9]], pad: 0.35, motif: 0.25, pulse: 0, bright: 0.6, tempo: 40 },
  desert: { root: 42, scale: [0, 2, 4, 5, 7, 9, 11], prog: [[0, 2, 4, 6], [4, 6, 8, 10], [5, 7, 9, 11], [3, 5, 7, 9]], pad: 0.4, motif: 0.35, pulse: 0, bright: 0.6, tempo: 48 },
  wormhole: { root: 33, scale: [0, 2, 4, 6, 8, 10, 11], prog: [[0, 2, 4, 6], [1, 3, 5, 7], [2, 4, 6, 8]], pad: 1.0, motif: 0.5, pulse: 0.3, bright: 0.9, tempo: 80 },
};

class GenerativeMusic {
  mood: MusicMood = 'silence';
  private bus: GainNode;
  private padBus: GainNode;
  private filt: BiquadFilterNode;
  private chordIdx = 0;
  private nextChordT = 0;
  private nextNoteT = 0;
  private nextPulseT = 0;
  private voices: { osc: OscillatorNode[]; g: GainNode }[] = [];
  intensity = 1;

  constructor(private a: AudioEngine) {
    const ctx = a.ctx!;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.filt = ctx.createBiquadFilter();
    this.filt.type = 'lowpass';
    this.filt.frequency.value = 2400;
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0;
    this.padBus.connect(this.filt).connect(this.bus);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.bus.connect(a.buses.music);
    this.bus.connect(wet).connect(a.reverb);
  }

  setMood(m: MusicMood) {
    if (m === this.mood) return;
    this.mood = m;
    const ctx = this.a.ctx!;
    const md = MOODS[m];
    this.padBus.gain.setTargetAtTime(md.pad * 0.16, ctx.currentTime, 2.5);
    this.filt.frequency.setTargetAtTime(700 + md.bright * 3400, ctx.currentTime, 2);
    this.nextChordT = Math.min(this.nextChordT, ctx.currentTime + 1.5);
  }

  private midi(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  private degree(md: (typeof MOODS)[MusicMood], d: number) {
    const s = md.scale;
    const oct = Math.floor(d / s.length);
    return md.root + s[((d % s.length) + s.length) % s.length] + oct * 12;
  }

  update() {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const md = MOODS[this.mood];
    const beat = 60 / md.tempo;
    if (t >= this.nextChordT) {
      this.nextChordT = t + beat * 8;
      this.playChord(md, t, beat * 8);
    }
    if (md.motif > 0 && t >= this.nextNoteT) {
      this.nextNoteT = t + beat * (Math.random() < 0.6 ? 1 : 2) * (1 + Math.random());
      if (Math.random() < md.motif) {
        const chord = md.prog[this.chordIdx % md.prog.length];
        const d = chord[Math.floor(Math.random() * chord.length)] + 14;
        this.pluck(this.midi(this.degree(md, d)), t, 0.06 * md.motif);
      }
    }
    if (md.pulse > 0 && t >= this.nextPulseT) {
      this.nextPulseT = t + beat * 0.5;
      this.tick(t, md.pulse);
    }
  }

  private playChord(md: (typeof MOODS)[MusicMood], t: number, dur: number) {
    const ctx = this.a.ctx!;
    if (md.pad <= 0) return;
    const chord = md.prog[this.chordIdx++ % md.prog.length];
    // release old voices
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setTargetAtTime(0, t, dur * 0.18);
      v.osc.forEach((o) => o.stop(t + dur * 0.9));
    }
    this.voices = [];
    const notes = [this.degree(md, chord[0]) - 12, ...chord.map((d) => this.degree(md, d))];
    notes.forEach((n, i) => {
      const f = this.midi(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.14, t + dur * 0.35);
      g.connect(this.padBus);
      // organ-like additive partials (8', 4', 2 2/3', 2')
      const osc: OscillatorNode[] = [];
      [[1, 1], [2, 0.45], [3, 0.22], [4, 0.18], [6, 0.06]].forEach(([h, a]) => {
        const o = ctx.createOscillator();
        o.frequency.value = f * h * (1 + (Math.random() - 0.5) * 0.003);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(t);
        osc.push(o);
      });
      this.voices.push({ osc, g });
    });
  }

  private pluck(f: number, t: number, amp: number) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.frequency.value = f * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g).connect(this.bus);
    o2.connect(g2).connect(g);
    o.start(t); o2.start(t);
    o.stop(t + 3.6); o2.stop(t + 3.6);
  }

  private tick(t: number, amp: number) {
    const ctx = this.a.ctx!;
    const src = this.a.noiseSource('white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(bp).connect(g).connect(this.bus);
    src.start(t);
    src.stop(t + 0.06);
  }
}
