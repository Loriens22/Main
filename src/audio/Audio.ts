import * as THREE from 'three';
import type { Game } from '../core/Game';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import { SFX, SfxEnv } from './sfx';
import { impulse, Music } from './Music';

export type ReverbKind = 'open' | 'room' | 'hall' | 'ship' | 'cave' | 'helmet';

/** What the active zone sounds like right now; polled every frame. */
export interface Soundscape {
  wind: number;
  dust: number;
  indoors: number;
  rustle: number;
  hum: number;
  air: number;
  water: number;
  rumble: number;
  /** 1 = the listener is in vacuum: only structure-borne sound */
  vacuum: number;
  /** 1 = wearing a sealed helmet */
  helmet: number;
  reverb: ReverbKind;
  music: string;
  intensity: number;
}

export const SILENT: Soundscape = { wind: 0, dust: 0, indoors: 0, rustle: 0, hum: 0, air: 0, water: 0, rumble: 0, vacuum: 0, helmet: 0, reverb: 'open', music: '', intensity: 0.3 };

const REVERBS: Record<ReverbKind, [seconds: number, decay: number, tone: number, mix: number]> = {
  open: [0.5, 3.0, 2500, 0.05], room: [0.6, 2.6, 5000, 0.16], hall: [3.6, 2.0, 3800, 0.34], ship: [1.0, 2.4, 7000, 0.2], cave: [2.4, 2.0, 2600, 0.3], helmet: [0.18, 2.0, 3000, 0.25],
};

type Params = Record<string, number>;
interface Voice { out: GainNode; set(p: Params, t: number): void; stop(): void }
export interface Emitter { remove(): void }
interface EmitterRec { voice: Voice; panner: PannerNode | null; pos: (() => THREE.Vector3 | null) | null; params: () => Params; dead: boolean; interior?: () => boolean }

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

/**
 * WebAudio sound engine. Five mix buses (master, music, effects, dialogue, ambience), positional one-shots
 * and loops, environment reverb, vacuum / helmet / indoor filtering, and the generative score.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private uiBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private dialogBus!: GainNode;
  private worldFilter!: BiquadFilterNode;
  private worldGain!: GainNode;
  private ambFilter!: BiquadFilterNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private reverbKind: ReverbKind | '' = '';
  private irs = new Map<ReverbKind, AudioBuffer>();
  private env!: SfxEnv;
  music: Music | null = null;
  private emitters: EmitterRec[] = [];
  private pending: (() => void)[] = [];
  private amb: Record<string, Voice> = {};
  private scape: Soundscape = { ...SILENT };
  /** overrides the zone's music cue (cinematics, menu) */
  musicOverride: string | null = null;
  intensityOverride: number | null = null;
  private lastStep = 0;

  constructor(private game: Game) {
    const start = () => this.start();
    window.addEventListener('pointerdown', start, { once: false });
    window.addEventListener('keydown', start, { once: false });
    window.addEventListener('touchend', start, { once: false });
    bus.on('sfx', (e: any) => this.play(e.id, e));
    bus.on('ui:click', () => this.play('ui_click', { ui: true }));
    bus.on('player:footstep', (e: any) => {
      const now = performance.now();
      if (now - this.lastStep < 180) return;
      this.lastStep = now;
      this.play(`step_${SFX[`step_${e.surface}`] ? e.surface : 'dirt'}`, { gain: e.run ? 0.9 : 0.6 });
    });
    bus.on('player:land', (e: any) => { this.play('land', { gain: 0.7 }); void e; });
    bus.on('player:jump', () => this.play('jump', { gain: 0.6 }));
    bus.on('player:sit', () => this.play('seat', { gain: 0.6 }));
    bus.on('player:stand', () => this.play('seat', { gain: 0.4 }));
    bus.on('settings', () => this.applyVolumes());
    bus.on('npc:say', (e: any) => this.speak(e.text, e.npc?.def?.look));
    // radio traffic: a squelch click, then the line (spoken when voices are enabled)
    bus.on('radio:say', (e: any) => { this.play('comm', { ui: true, gain: 0.5 }); this.speak(e.text, { radio: true, longHair: e.female }); });
    bus.on('state', (s: string) => { if (this.ctx) this.master.gain.setTargetAtTime(s === 'paused' ? 0.25 * this.game.settings.a.master : this.game.settings.a.master, this.ctx.currentTime, 0.15); });
  }

  /** Browsers only allow audio after a user gesture. */
  private start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    const mk = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.sfxBus = mk(); this.uiBus = mk(); this.ambBus = mk(); this.musicBus = mk(); this.dialogBus = mk();
    // world sounds pass through a filter that models vacuum / helmet muffling
    this.worldFilter = ctx.createBiquadFilter(); this.worldFilter.type = 'lowpass'; this.worldFilter.frequency.value = 20000;
    this.worldGain = ctx.createGain();
    this.worldGain.connect(this.worldFilter).connect(this.sfxBus);
    this.ambFilter = ctx.createBiquadFilter(); this.ambFilter.type = 'lowpass'; this.ambFilter.frequency.value = 20000;
    this.ambFilter.connect(this.ambBus);
    this.reverb = ctx.createConvolver();
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.05;
    this.worldGain.connect(this.reverbSend).connect(this.reverb).connect(this.sfxBus);
    // shared noise sources
    const mkNoise = (brown: boolean) => {
      const n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return b;
    };
    this.env = { ctx, noise: mkNoise(false), brown: mkNoise(true) };
    this.music = new Music(ctx, this.musicBus, this.env.noise);
    this.applyVolumes();
    this.setReverb('open');
    // ambience beds
    for (const k of ['wind', 'dust', 'rustle', 'hum', 'air', 'water', 'rumble', 'room'] as const) {
      const v = this.voice(k);
      v.out.connect(this.ambFilter);
      this.amb[k] = v;
    }
    for (const f of this.pending) f();
    this.pending.length = 0;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const a = this.game.settings.a, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(a.sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(a.sfx * 0.8, t, 0.05);
    this.ambBus.gain.setTargetAtTime(a.ambience, t, 0.05);
    this.musicBus.gain.setTargetAtTime(a.music * 0.9, t, 0.05);
    this.dialogBus.gain.setTargetAtTime(a.dialogue, t, 0.05);
  }

  private setReverb(k: ReverbKind) {
    if (!this.ctx || k === this.reverbKind) return;
    this.reverbKind = k;
    let ir = this.irs.get(k);
    const [sec, decay, tone, mix] = REVERBS[k];
    if (!ir) { ir = impulse(this.ctx, sec, decay, tone); this.irs.set(k, ir); }
    this.reverb.buffer = ir;
    this.reverbSend.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.3);
  }

  private panner(pos: THREE.Vector3, ref = 3, rolloff = 1.1) {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 2000;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    return p;
  }

  /** One-shot effect. `node` or `pos` makes it positional; `ui` bypasses the world filters. */
  play(id: string, o: { node?: THREE.Object3D; pos?: THREE.Vector3Like; gain?: number; ui?: boolean; delay?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return 0;
    const rec = SFX[id];
    if (!rec) return 0;
    const t = ctx.currentTime + 0.005 + (o.delay ?? 0);
    const ui = o.ui || id.startsWith('ui_');
    let out: AudioNode = ui ? this.uiBus : this.worldGain;
    let dur = 0;
    if (!ui && (o.node || o.pos)) {
      if (o.node) o.node.getWorldPosition(_p); else _p.set(o.pos!.x, o.pos!.y, o.pos!.z);
      const pn = this.panner(_p, id === 'siren' ? 60 : id === 'horn' || id === 'explosion' ? 12 : 2.2);
      pn.connect(out);
      out = pn;
      dur = rec(this.env, out, t, o.gain ?? 1);
      setTimeout(() => pn.disconnect(), (dur + 1.5 + (o.delay ?? 0)) * 1000);
    } else dur = rec(this.env, out, t, o.gain ?? 1);
    return dur;
  }

  /** Text-to-speech for dialogue when the player has enabled it. */
  private speak(text: string, look?: any) {
    const a = this.game.settings.a;
    if (!a.voice || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.volume = clamp(a.master * a.dialogue, 0, 1);
      u.rate = look?.radio ? 1.04 : 0.96; u.pitch = look?.longHair ? 1.15 : 0.82;
      window.speechSynthesis.speak(u);
    } catch { /* speech synthesis unavailable */ }
  }

  // ------------------------------------------------------------------------------------------ loops
  /**
   * A continuous positional (or ambient, when `pos` is omitted) sound whose parameters follow the game:
   * engines, rockets, pumps, radios.
   */
  loop(kind: string, params: () => Params, pos?: () => THREE.Vector3 | null, opts: { ref?: number; interior?: () => boolean } = {}): Emitter {
    const rec: EmitterRec = { voice: null as any, panner: null, pos: pos ?? null, params, dead: false, interior: opts.interior };
    const build = () => {
      if (rec.dead) return;
      rec.voice = this.voice(kind);
      if (pos) { rec.panner = this.panner(pos() ?? _p.set(0, -1000, 0), opts.ref ?? 4, 1.0); rec.voice.out.connect(rec.panner).connect(this.worldGain); }
      else rec.voice.out.connect(this.worldGain);
      this.emitters.push(rec);
    };
    if (this.ctx) build(); else this.pending.push(build);
    return { remove: () => { rec.dead = true; if (rec.voice) { rec.voice.stop(); const i = this.emitters.indexOf(rec); if (i >= 0) this.emitters.splice(i, 1); } } };
  }

  private noiseSrc(brown = false, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.env.brown : this.env.noise;
    s.loop = true; s.playbackRate.value = rate;
    s.start(0, Math.random() * 2);
    return s;
  }

  /** Slow random control signal (-1..1) from the noise table played far below audio rate. */
  private lfoNoise(rate: number, depth: number, target: AudioParam) {
    const s = this.noiseSrc(false, rate);
    const lp = this.ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6;
    const g = this.ctx!.createGain(); g.gain.value = depth;
    s.connect(lp).connect(g).connect(target);
    return { s, g };
  }

  private voice(kind: string): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    const nodes: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f: number) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); nodes.push(o); return o; };
    const nz = (brown = false, rate = 1) => { const s = this.noiseSrc(brown, rate); nodes.push(s); return s; };
    const bq = (type: BiquadFilterType, f: number, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gn = (v: number) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const ramp = (p: AudioParam, v: number, t: number, tc = 0.12) => p.setTargetAtTime(v, t, tc);
    let set: Voice['set'] = () => {};
    switch (kind) {
      case 'wind': {
        const lp = bq('lowpass', 500, 0.5), body = gn(0.5);
        nz(true).connect(lp).connect(body).connect(out);
        const g1 = this.lfoNoise(0.0009, 0.35, body.gain); nodes.push(g1.s);
        const bp = bq('bandpass', 900, 1.2), wh = gn(0.12);
        nz().connect(bp).connect(wh).connect(out);
        const g2 = this.lfoNoise(0.0006, 500, bp.frequency); nodes.push(g2.s);
        const g3 = this.lfoNoise(0.0013, 0.1, wh.gain); nodes.push(g3.s);
        set = (p, t) => { ramp(out.gain, p.level * 0.9, t, 0.6); ramp(lp.frequency, 300 + 900 * p.level, t, 0.8); ramp(bp.frequency, 600 + 1400 * p.level, t, 0.8); };
        break;
      }
      case 'dust': {
        const hp = bq('highpass', 2600), g = gn(0.16);
        nz().connect(hp).connect(g).connect(out);
        const l = this.lfoNoise(0.002, 0.1, g.gain); nodes.push(l.s);
        const lp = bq('lowpass', 110), r = gn(0.9);
        nz(true).connect(lp).connect(r).connect(out);
        const l2 = this.lfoNoise(0.0011, 0.5, r.gain); nodes.push(l2.s);
        set = (p, t) => ramp(out.gain, p.level, t, 0.8);
        break;
      }
      case 'rustle': {
        const bp = bq('bandpass', 3800, 0.5), g = gn(0.1);
        nz().connect(bp).connect(g).connect(out);
        const l = this.lfoNoise(0.0016, 0.085, g.gain); nodes.push(l.s);
        set = (p, t) => ramp(out.gain, p.level, t, 0.5);
        break;
      }
      case 'hum': {
        const g = gn(0.5);
        osc('sine', 60).connect(gn(0.5)).connect(g);
        osc('sine', 120.3).connect(gn(0.22)).connect(g);
        osc('triangle', 180.2).connect(gn(0.05)).connect(g);
        nz(true).connect(bq('lowpass', 240)).connect(gn(0.5)).connect(g);
        g.connect(out);
        set = (p, t) => ramp(out.gain, p.level * 0.22, t, 0.6);
        break;
      }
      case 'room': {
        nz(true).connect(bq('lowpass', 160)).connect(gn(0.5)).connect(out);
        nz().connect(bq('bandpass', 420, 0.4)).connect(gn(0.012)).connect(out);
        set = (p, t) => ramp(out.gain, p.level * 0.16, t, 0.6);
        break;
      }
      case 'air': {
        nz().connect(bq('bandpass', 5200, 0.5)).connect(gn(0.05)).connect(out);
        nz().connect(bq('bandpass', 900, 0.6)).connect(gn(0.03)).connect(out);
        set = (p, t) => ramp(out.gain, p.level * 0.5, t, 0.5);
        break;
      }
      case 'water': {
        const lp = bq('lowpass', 480), g = gn(0.7);
        nz(true).connect(lp).connect(g).connect(out);
        const l = this.lfoNoise(0.0007, 0.45, g.gain); nodes.push(l.s);
        const hs = gn(0.05);
        nz().connect(bq('bandpass', 1900, 0.4)).connect(hs).connect(out);
        const l2 = this.lfoNoise(0.0009, 0.04, hs.gain); nodes.push(l2.s);
        set = (p, t) => ramp(out.gain, p.level, t, 0.8);
        break;
      }
      case 'rumble': {
        const g = gn(1.0);
        nz(true).connect(bq('lowpass', 75)).connect(g).connect(out);
        const l = this.lfoNoise(0.003, 0.5, g.gain); nodes.push(l.s);
        set = (p, t) => ramp(out.gain, p.level * 1.3, t, 0.25);
        break;
      }
      case 'engine': {
        // diesel: firing-rate sawtooth stack with combustion clatter amplitude-modulated at the firing rate
        const o1 = osc('sawtooth', 30), o2 = osc('square', 15), o3 = osc('sawtooth', 60.4);
        const lp = bq('lowpass', 420, 0.8), tone = gn(0.3);
        o1.connect(gn(0.5)).connect(lp); o2.connect(gn(0.35)).connect(lp); o3.connect(gn(0.12)).connect(lp);
        lp.connect(tone).connect(out);
        const bp = bq('bandpass', 420, 0.8), cl = gn(0.0);
        nz().connect(bp).connect(cl).connect(out);
        const am = gn(0.12); o1.connect(am).connect(cl.gain);
        const ex = gn(0.4);
        nz(true).connect(bq('lowpass', 150)).connect(ex).connect(out);
        set = (p, t) => {
          const rpm = clamp(p.rpm ?? 0, 0, 1.2), f = (p.base ?? 24) * (1 + rpm * 2.6);
          ramp(o1.frequency, f, t, 0.07); ramp(o2.frequency, f * 0.5, t, 0.07); ramp(o3.frequency, f * 2.015, t, 0.07);
          ramp(lp.frequency, 260 + 1500 * rpm + 500 * (p.load ?? 0), t);
          ramp(bp.frequency, 380 + 1500 * rpm, t);
          ramp(cl.gain, 0.05 + 0.1 * rpm, t);
          ramp(ex.gain, 0.25 + 0.5 * (p.load ?? 0), t);
          ramp(out.gain, (p.on ? 1 : 0) * (0.35 + 0.4 * rpm + 0.25 * (p.load ?? 0)) * (p.gain ?? 1), t, 0.15);
        };
        break;
      }
      case 'tyres': {
        const bp = bq('bandpass', 700, 0.5);
        nz(true).connect(bp).connect(gn(1.2)).connect(out);
        const hi = gn(0.1);
        nz().connect(bq('highpass', 2500)).connect(hi).connect(out);
        const l = this.lfoNoise(0.004, 0.06, hi.gain); nodes.push(l.s);
        set = (p, t) => { const s = clamp((p.speed ?? 0) / 28, 0, 1); ramp(out.gain, Math.pow(s, 0.7) * 0.55 * (0.5 + 0.5 * (p.rough ?? 1)), t, 0.15); ramp(bp.frequency, 400 + 900 * s, t); };
        break;
      }
      case 'rocket': {
        // broadband roar with random crackle; thrust opens the spectrum
        const lp = bq('lowpass', 300, 0.4), body = gn(1.2);
        nz(true).connect(lp).connect(body).connect(out);
        const bp = bq('bandpass', 700, 0.3), mid = gn(0.3);
        nz().connect(bp).connect(mid).connect(out);
        const crack = this.lfoNoise(0.05, 0.25, mid.gain); nodes.push(crack.s);
        const c2 = this.lfoNoise(0.02, 0.5, body.gain); nodes.push(c2.s);
        const sub = osc('sine', 34), subg = gn(0.3); sub.connect(subg).connect(out);
        set = (p, t) => {
          const th = clamp(p.thrust ?? 0, 0, 1.2);
          ramp(out.gain, Math.pow(th, 0.8) * (p.gain ?? 1) * 1.1, t, 0.2);
          ramp(lp.frequency, 160 + 1500 * th, t, 0.2); ramp(bp.frequency, 500 + 1300 * th, t, 0.2);
          ramp(subg.gain, 0.2 + 0.3 * th, t, 0.2);
        };
        break;
      }
      case 'static': {
        const g = gn(0.06);
        nz().connect(bq('bandpass', 2300, 0.6)).connect(g).connect(out);
        const l = this.lfoNoise(0.004, 0.04, g.gain); nodes.push(l.s);
        // a carrier whine drifting in and out behind the static
        const w = osc('sine', 1240), wg = gn(0.004); w.connect(wg).connect(out);
        const l2 = this.lfoNoise(0.0007, 0.004, wg.gain); nodes.push(l2.s);
        set = (p, t) => ramp(out.gain, p.on ? 1 : 0, t, 0.1);
        break;
      }
      case 'pump': {
        const o1 = osc('sawtooth', 48), lp = bq('lowpass', 300);
        o1.connect(lp).connect(gn(0.2)).connect(out);
        nz().connect(bq('bandpass', 1300, 2)).connect(gn(0.03)).connect(out);
        set = (p, t) => { ramp(out.gain, p.level ?? 0, t, 0.2); ramp(o1.frequency, 40 + 30 * (p.level ?? 0), t); };
        break;
      }
      case 'fan': {
        const o1 = osc('triangle', 118), g = gn(0.05); o1.connect(g).connect(out);
        nz().connect(bq('bandpass', 1500, 0.5)).connect(gn(0.05)).connect(out);
        set = (p, t) => { ramp(out.gain, p.level ?? 0, t, 0.4); ramp(o1.frequency, 60 + 90 * (p.speed ?? 0.6), t, 0.5); };
        break;
      }
    }
    return { out, set, stop: () => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } } out.disconnect(); }, 500); } };
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const g = this.game, t = ctx.currentTime;
    const cam = g.renderer.camera;
    cam.getWorldPosition(_p); cam.getWorldDirection(_f); _u.copy(cam.up).applyQuaternion(cam.quaternion);
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(_p.x, t, 0.02); L.positionY.setTargetAtTime(_p.y, t, 0.02); L.positionZ.setTargetAtTime(_p.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else { (L as any).setPosition(_p.x, _p.y, _p.z); (L as any).setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }

    const z = g.zone;
    const s = z && g.state !== 'loading' ? z.soundscape(this.scape) : Object.assign(this.scape, SILENT);
    const menu = g.state === 'menu';
    // exterior ambience is muffled indoors; everything is muffled in a helmet and nearly silent in vacuum
    const outside = 1 - 0.78 * s.indoors;
    this.amb.wind.set({ level: s.wind * outside * (1 - s.vacuum) }, t);
    this.amb.dust.set({ level: s.dust * (0.25 + 0.75 * outside) * (1 - s.vacuum) }, t);
    this.amb.rustle.set({ level: s.rustle * outside * (1 - s.vacuum) }, t);
    this.amb.hum.set({ level: s.hum }, t);
    this.amb.air.set({ level: s.air }, t);
    this.amb.water.set({ level: s.water * outside * (1 - s.vacuum) }, t);
    this.amb.rumble.set({ level: s.rumble }, t);
    this.amb.room.set({ level: s.indoors * (1 - s.vacuum) }, t);
    this.ambFilter.frequency.setTargetAtTime(20000 - 17500 * Math.max(s.indoors * 0.85, s.helmet * 0.8), t, 0.2);
    const cutoff = s.vacuum > 0.5 ? 240 : 20000 - 16000 * s.helmet;
    this.worldFilter.frequency.setTargetAtTime(cutoff, t, 0.15);
    this.worldGain.gain.setTargetAtTime(s.vacuum > 0.5 ? 0.5 : 1, t, 0.15);
    this.setReverb(s.vacuum > 0.5 || s.helmet > 0.5 ? 'helmet' : s.reverb);

    for (const e of this.emitters) {
      const pos = e.pos?.();
      if (e.panner && pos) { e.panner.positionX.setTargetAtTime(pos.x, t, 0.03); e.panner.positionY.setTargetAtTime(pos.y, t, 0.03); e.panner.positionZ.setTargetAtTime(pos.z, t, 0.03); }
      e.voice.set(e.params(), t);
    }
    if (this.music) {
      this.music.set(this.musicOverride ?? (menu ? 'menu' : s.music));
      this.music.intensity += ((this.intensityOverride ?? s.intensity) - this.music.intensity) * Math.min(1, dt * 0.5);
      this.music.update(dt);
    }
  }
}
