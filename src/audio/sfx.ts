/**
 * Procedural one-shot sound effects. Every sound is synthesised from oscillators and filtered noise at
 * play time: nothing is sampled, so there is no third-party audio in the game.
 */
export interface SfxEnv { ctx: AudioContext; noise: AudioBuffer; brown: AudioBuffer }
export type Recipe = (e: SfxEnv, out: AudioNode, t: number, v: number) => number;

interface NoiseOpt { type?: BiquadFilterType; f?: number; f1?: number; q?: number; gain?: number; a?: number; d?: number; brown?: boolean; hold?: number }
interface ToneOpt { type?: OscillatorType; f?: number; f1?: number; gain?: number; a?: number; d?: number; hold?: number; curve?: 'exp' | 'lin' }

export function noise(e: SfxEnv, out: AudioNode, t: number, o: NoiseOpt) {
  const { ctx } = e;
  const src = ctx.createBufferSource();
  src.buffer = o.brown ? e.brown : e.noise;
  src.loop = true;
  src.loopStart = Math.random() * 1.5;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f ?? 1000, t);
  const dur = (o.a ?? 0.002) + (o.hold ?? 0) + (o.d ?? 0.1);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + (o.a ?? 0.002));
  if (o.hold) g.gain.setValueAtTime(peak, t + (o.a ?? 0.002) + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
  return dur;
}

export function tone(e: SfxEnv, out: AudioNode, t: number, o: ToneOpt) {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f ?? 440, t);
  const dur = (o.a ?? 0.002) + (o.hold ?? 0) + (o.d ?? 0.1);
  if (o.f1) {
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + dur);
    else osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  }
  const g = ctx.createGain();
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + (o.a ?? 0.002));
  if (o.hold) g.gain.setValueAtTime(peak, t + (o.a ?? 0.002) + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  return dur;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

const step = (e: SfxEnv, out: AudioNode, t: number, v: number, kind: string) => {
  switch (kind) {
    case 'wood':
      noise(e, out, t, { type: 'lowpass', f: r(380, 520), q: 1.5, gain: 0.5 * v, d: 0.09, brown: true });
      tone(e, out, t, { f: r(95, 120), f1: 60, gain: 0.35 * v, d: 0.11 });
      if (Math.random() < 0.25) tone(e, out, t + 0.03, { type: 'triangle', f: r(600, 900), f1: r(380, 500), gain: 0.03 * v, a: 0.02, d: 0.16 });
      return 0.2;
    case 'crop':
      noise(e, out, t, { type: 'bandpass', f: r(2600, 4200), q: 0.8, gain: 0.2 * v, a: 0.02, d: 0.22 });
      noise(e, out, t + 0.02, { type: 'lowpass', f: 300, gain: 0.25 * v, d: 0.08, brown: true });
      return 0.3;
    case 'metal':
      noise(e, out, t, { type: 'lowpass', f: 700, gain: 0.3 * v, d: 0.05, brown: true });
      tone(e, out, t, { type: 'triangle', f: r(240, 300), gain: 0.14 * v, d: 0.25 });
      tone(e, out, t, { f: r(820, 1150), gain: 0.05 * v, d: 0.18 });
      return 0.3;
    case 'grate':
      noise(e, out, t, { type: 'bandpass', f: r(1800, 2600), q: 3, gain: 0.16 * v, d: 0.07 });
      tone(e, out, t, { type: 'triangle', f: r(420, 520), gain: 0.1 * v, d: 0.3 });
      tone(e, out, t, { f: r(1500, 2100), gain: 0.035 * v, d: 0.22 });
      return 0.3;
    case 'concrete':
      noise(e, out, t, { type: 'bandpass', f: r(900, 1300), q: 1.2, gain: 0.3 * v, d: 0.05 });
      tone(e, out, t, { f: 110, f1: 70, gain: 0.2 * v, d: 0.07 });
      return 0.15;
    case 'snow':
      noise(e, out, t, { type: 'bandpass', f: r(1400, 2200), q: 2.5, gain: 0.34 * v, a: 0.015, d: 0.16 });
      noise(e, out, t + 0.05, { type: 'bandpass', f: r(700, 1000), q: 3, gain: 0.2 * v, a: 0.01, d: 0.1 });
      return 0.3;
    case 'water':
      noise(e, out, t, { type: 'bandpass', f: r(700, 1100), f1: 2400, q: 1.4, gain: 0.4 * v, a: 0.01, d: 0.3 });
      noise(e, out, t + 0.06, { type: 'highpass', f: 2800, gain: 0.12 * v, a: 0.03, d: 0.3 });
      return 0.4;
    case 'sand':
      noise(e, out, t, { type: 'bandpass', f: r(1100, 1700), q: 0.7, gain: 0.24 * v, a: 0.012, d: 0.14 });
      return 0.2;
    case 'suit':
      noise(e, out, t, { type: 'lowpass', f: 260, gain: 0.5 * v, d: 0.09, brown: true });
      noise(e, out, t + 0.02, { type: 'bandpass', f: 1500, q: 2, gain: 0.05 * v, a: 0.02, d: 0.1 });
      return 0.2;
    default: // dirt / gravel
      noise(e, out, t, { type: 'lowpass', f: r(420, 560), gain: 0.5 * v, d: 0.07, brown: true });
      noise(e, out, t + 0.012, { type: 'bandpass', f: r(2200, 3600), q: 1.1, gain: 0.1 * v, a: 0.01, d: 0.09 });
      return 0.15;
  }
};

/** id -> recipe. Returns the sound's duration in seconds. */
export const SFX: Record<string, Recipe> = {
  ui_tick: (e, o, t, v) => tone(e, o, t, { f: 1900, f1: 1500, gain: 0.05 * v, d: 0.04 }),
  ui_click: (e, o, t, v) => { tone(e, o, t, { f: 1250, gain: 0.05 * v, d: 0.05 }); return tone(e, o, t + 0.03, { f: 1880, gain: 0.03 * v, d: 0.07 }); },
  ui_open: (e, o, t, v) => { tone(e, o, t, { f: 520, f1: 780, gain: 0.06 * v, a: 0.01, d: 0.16 }); return noise(e, o, t, { type: 'highpass', f: 5000, gain: 0.02 * v, a: 0.03, d: 0.15 }); },
  ui_close: (e, o, t, v) => tone(e, o, t, { f: 760, f1: 480, gain: 0.05 * v, a: 0.01, d: 0.14 }),
  ui_confirm: (e, o, t, v) => { tone(e, o, t, { f: 660, gain: 0.06 * v, d: 0.12 }); return tone(e, o, t + 0.09, { f: 990, gain: 0.06 * v, d: 0.22 }); },
  ui_deny: (e, o, t, v) => { tone(e, o, t, { type: 'square', f: 180, gain: 0.05 * v, d: 0.1 }); return tone(e, o, t + 0.12, { type: 'square', f: 150, gain: 0.05 * v, d: 0.16 }); },
  switch: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 3200, q: 3, gain: 0.3 * v, d: 0.018 }); return tone(e, o, t, { type: 'triangle', f: 1100, f1: 500, gain: 0.07 * v, d: 0.04 }); },
  button: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 2400, q: 4, gain: 0.2 * v, d: 0.02 }); return tone(e, o, t + 0.015, { f: 2200, gain: 0.02 * v, d: 0.05 }); },
  toggle: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 1800, q: 5, gain: 0.35 * v, d: 0.025 }); return tone(e, o, t, { type: 'triangle', f: 640, f1: 300, gain: 0.12 * v, d: 0.05 }); },
  door_open: (e, o, t, v) => {
    noise(e, o, t, { type: 'bandpass', f: 1500, q: 4, gain: 0.25 * v, d: 0.03 });
    tone(e, o, t + 0.05, { type: 'sawtooth', f: r(280, 340), f1: r(420, 520), gain: 0.018 * v, a: 0.1, d: 0.5 });
    return noise(e, o, t + 0.05, { type: 'bandpass', f: 800, f1: 1300, q: 6, gain: 0.05 * v, a: 0.1, d: 0.5 });
  },
  door_close: (e, o, t, v) => { tone(e, o, t, { type: 'sawtooth', f: r(420, 480), f1: 300, gain: 0.012 * v, a: 0.08, d: 0.4 }); return 0.5; },
  door_latch: (e, o, t, v) => {
    noise(e, o, t, { type: 'lowpass', f: 600, gain: 0.7 * v, d: 0.09, brown: true });
    tone(e, o, t, { f: 90, f1: 55, gain: 0.4 * v, d: 0.14 });
    return noise(e, o, t + 0.01, { type: 'bandpass', f: 2400, q: 3, gain: 0.18 * v, d: 0.03 });
  },
  door_locked: (e, o, t, v) => { for (let i = 0; i < 2; i++) noise(e, o, t + i * 0.11, { type: 'bandpass', f: 1700, q: 5, gain: 0.3 * v, d: 0.035 }); return 0.25; },
  window: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 500, f1: 900, q: 3, gain: 0.25 * v, a: 0.05, d: 0.5, brown: false }); return noise(e, o, t + 0.5, { type: 'lowpass', f: 500, gain: 0.5 * v, d: 0.06, brown: true }); },
  hatch: (e, o, t, v) => {
    // pressure door: seal release, servo, heavy stop
    noise(e, o, t, { type: 'highpass', f: 3500, gain: 0.16 * v, a: 0.02, d: 0.5 });
    tone(e, o, t + 0.12, { type: 'sawtooth', f: 70, f1: 110, gain: 0.07 * v, a: 0.08, hold: 0.5, d: 0.2, curve: 'lin' });
    noise(e, o, t + 0.82, { type: 'lowpass', f: 380, gain: 0.8 * v, d: 0.16, brown: true });
    return tone(e, o, t + 0.82, { f: 62, f1: 40, gain: 0.5 * v, d: 0.3 });
  },
  door_slide: (e, o, t, v) => {
    noise(e, o, t, { type: 'bandpass', f: 900, f1: 1500, q: 2.5, gain: 0.12 * v, a: 0.05, hold: 0.45, d: 0.2 });
    tone(e, o, t, { type: 'sawtooth', f: 120, f1: 170, gain: 0.025 * v, a: 0.05, hold: 0.45, d: 0.15, curve: 'lin' });
    return noise(e, o, t + 0.68, { type: 'lowpass', f: 500, gain: 0.4 * v, d: 0.07, brown: true });
  },
  blast: (e, o, t, v) => {
    // heavy door on rollers: warning tone, motor, grinding mass, final stop
    for (let i = 0; i < 2; i++) tone(e, o, t + i * 0.35, { type: 'square', f: 620, gain: 0.05 * v, a: 0.01, hold: 0.16, d: 0.04 });
    tone(e, o, t + 0.7, { type: 'sawtooth', f: 52, f1: 64, gain: 0.12 * v, a: 0.4, hold: 5.0, d: 0.6, curve: 'lin' });
    noise(e, o, t + 0.7, { type: 'lowpass', f: 260, gain: 0.9 * v, a: 0.5, hold: 4.8, d: 0.7, brown: true });
    noise(e, o, t + 0.7, { type: 'bandpass', f: 1400, q: 3, gain: 0.05 * v, a: 0.5, hold: 4.8, d: 0.5 });
    noise(e, o, t + 6.4, { type: 'lowpass', f: 300, gain: 1.1 * v, d: 0.25, brown: true });
    return tone(e, o, t + 6.4, { f: 46, f1: 30, gain: 0.8 * v, d: 0.6 });
  },
  airlock: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 5200, f1: 900, q: 0.8, gain: 0.3 * v, a: 0.15, hold: 1.2, d: 2.2 }); return noise(e, o, t, { type: 'lowpass', f: 180, gain: 0.35 * v, a: 0.3, hold: 1.4, d: 1.6, brown: true }); },
  clamp: (e, o, t, v) => {
    // docking latches closing through the hull
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.22;
      noise(e, o, tt, { type: 'lowpass', f: 420, gain: 0.9 * v, d: 0.12, brown: true });
      tone(e, o, tt, { f: 58, f1: 36, gain: 0.6 * v, d: 0.35 });
      tone(e, o, tt, { type: 'triangle', f: r(310, 360), gain: 0.06 * v, d: 0.4 });
    }
    return 1.1;
  },
  contact: (e, o, t, v) => { noise(e, o, t, { type: 'lowpass', f: 260, gain: 1.0 * v, d: 0.22, brown: true }); return tone(e, o, t, { f: 44, f1: 30, gain: 0.7 * v, d: 0.5 }); },
  thud: (e, o, t, v) => { noise(e, o, t, { type: 'lowpass', f: 300, gain: 0.8 * v, d: 0.12, brown: true }); return tone(e, o, t, { f: 70, f1: 42, gain: 0.5 * v, d: 0.2 }); },
  rcs: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 1400, f1: 700, q: 0.6, gain: 0.32 * v, a: 0.006, hold: 0.07, d: 0.12 }); return noise(e, o, t, { type: 'lowpass', f: 220, gain: 0.3 * v, a: 0.006, hold: 0.07, d: 0.1, brown: true }); },
  engine_start: (e, o, t, v) => {
    for (let i = 0; i < 7; i++) tone(e, o, t + i * 0.12, { type: 'sawtooth', f: 46 + i * 2, gain: 0.16 * v, a: 0.01, d: 0.1 });
    noise(e, o, t, { type: 'bandpass', f: 900, q: 2, gain: 0.08 * v, a: 0.05, hold: 0.7, d: 0.1 });
    return tone(e, o, t + 0.85, { type: 'sawtooth', f: 38, f1: 30, gain: 0.25 * v, a: 0.02, d: 0.5 });
  },
  engine_stop: (e, o, t, v) => { tone(e, o, t, { type: 'sawtooth', f: 30, f1: 12, gain: 0.2 * v, a: 0.01, d: 0.7 }); return noise(e, o, t + 0.5, { type: 'bandpass', f: 2600, q: 6, gain: 0.03 * v, a: 0.02, d: 0.6 }); },
  horn: (e, o, t, v) => { tone(e, o, t, { type: 'sawtooth', f: 310, gain: 0.1 * v, a: 0.02, hold: 0.5, d: 0.1 }); return tone(e, o, t, { type: 'sawtooth', f: 392, gain: 0.08 * v, a: 0.02, hold: 0.5, d: 0.1 }); },
  alarm_soft: (e, o, t, v) => { for (let i = 0; i < 3; i++) tone(e, o, t + i * 0.42, { type: 'triangle', f: 880, gain: 0.07 * v, a: 0.01, hold: 0.16, d: 0.08 }); return 1.3; },
  alarm: (e, o, t, v) => { for (let i = 0; i < 4; i++) { tone(e, o, t + i * 0.5, { type: 'square', f: 740, gain: 0.05 * v, a: 0.005, hold: 0.2, d: 0.03 }); tone(e, o, t + i * 0.5 + 0.24, { type: 'square', f: 590, gain: 0.05 * v, a: 0.005, hold: 0.2, d: 0.03 }); } return 2; },
  caution: (e, o, t, v) => { for (let i = 0; i < 2; i++) tone(e, o, t + i * 0.3, { type: 'triangle', f: 1180, gain: 0.07 * v, a: 0.005, hold: 0.12, d: 0.05 }); return 0.6; },
  chime: (e, o, t, v) => { tone(e, o, t, { f: 880, gain: 0.07 * v, d: 0.5 }); return tone(e, o, t + 0.16, { f: 1318.5, gain: 0.06 * v, d: 0.8 }); },
  comm: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 2600, q: 1, gain: 0.07 * v, a: 0.005, hold: 0.07, d: 0.04 }); return tone(e, o, t + 0.1, { f: 1480, gain: 0.03 * v, d: 0.07 }); },
  repair: (e, o, t, v) => { for (let i = 0; i < 9; i++) { const tt = t + i * 0.19 + Math.random() * 0.04; noise(e, o, tt, { type: 'bandpass', f: r(2600, 3400), q: 5, gain: 0.25 * v, d: 0.02 }); tone(e, o, tt, { type: 'triangle', f: r(700, 900), gain: 0.04 * v, d: 0.05 }); } return 1.8; },
  refuel: (e, o, t, v) => {
    // ten seconds of pump and flow
    tone(e, o, t, { type: 'sawtooth', f: 96, gain: 0.035 * v, a: 0.3, hold: 9.2, d: 0.5 });
    tone(e, o, t, { type: 'triangle', f: 192.6, gain: 0.02 * v, a: 0.3, hold: 9.2, d: 0.5 });
    noise(e, o, t, { type: 'bandpass', f: 1300, f1: 2100, q: 0.9, gain: 0.08 * v, a: 0.4, hold: 9.0, d: 0.6 });
    noise(e, o, t + 9.9, { type: 'bandpass', f: 2000, q: 4, gain: 0.35 * v, d: 0.03 });
    return 10.1;
  },
  siren: (e, o, t, v) => {
    // hand-cranked storm siren rising, holding and winding down
    const { ctx } = e;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 * v, t + 3);
    g.gain.setValueAtTime(0.11 * v, t + 13);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 19);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    for (const [mul, type] of [[1, 'sawtooth'], [1.5, 'triangle']] as [number, OscillatorType][]) {
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(140 * mul, t);
      osc.frequency.exponentialRampToValueAtTime(470 * mul, t + 4);
      for (let k = 0; k < 3; k++) { osc.frequency.linearRampToValueAtTime(410 * mul, t + 6 + k * 3); osc.frequency.linearRampToValueAtTime(470 * mul, t + 7.5 + k * 3); }
      osc.frequency.exponentialRampToValueAtTime(110 * mul, t + 19);
      osc.connect(lp); osc.start(t); osc.stop(t + 19.2);
    }
    lp.connect(g).connect(o);
    return 19.2;
  },
  land: (e, o, t, v) => { noise(e, o, t, { type: 'lowpass', f: 420, gain: 0.8 * v, d: 0.12, brown: true }); return tone(e, o, t, { f: 80, f1: 45, gain: 0.4 * v, d: 0.16 }); },
  jump: (e, o, t, v) => noise(e, o, t, { type: 'bandpass', f: 1600, q: 1, gain: 0.07 * v, a: 0.01, d: 0.1 }),
  seat: (e, o, t, v) => { noise(e, o, t, { type: 'lowpass', f: 500, gain: 0.4 * v, a: 0.02, d: 0.18, brown: true }); return noise(e, o, t + 0.1, { type: 'bandpass', f: 2500, q: 2, gain: 0.04 * v, a: 0.02, d: 0.12 }); },
  buckle: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 3800, q: 6, gain: 0.3 * v, d: 0.02 }); return tone(e, o, t + 0.01, { type: 'triangle', f: 2400, gain: 0.03 * v, d: 0.05 }); },
  splash: (e, o, t, v) => { noise(e, o, t, { type: 'bandpass', f: 800, f1: 3000, q: 0.7, gain: 0.6 * v, a: 0.02, d: 0.9 }); return noise(e, o, t, { type: 'lowpass', f: 220, gain: 0.7 * v, a: 0.01, d: 0.4, brown: true }); },
  ice_crack: (e, o, t, v) => { noise(e, o, t, { type: 'highpass', f: 2600, gain: 0.5 * v, d: 0.05 }); tone(e, o, t, { type: 'triangle', f: 1900, f1: 400, gain: 0.1 * v, d: 0.25 }); return noise(e, o, t + 0.04, { type: 'lowpass', f: 300, gain: 0.6 * v, d: 0.5, brown: true }); },
  explosion: (e, o, t, v) => {
    noise(e, o, t, { type: 'lowpass', f: 2400, f1: 90, gain: 1.4 * v, a: 0.004, d: 2.6, brown: true });
    noise(e, o, t, { type: 'bandpass', f: 1800, f1: 300, q: 0.5, gain: 0.6 * v, a: 0.004, d: 0.9 });
    return tone(e, o, t, { f: 68, f1: 24, gain: 1.0 * v, a: 0.004, d: 2.2 });
  },
  cryo: (e, o, t, v) => { noise(e, o, t, { type: 'highpass', f: 4200, gain: 0.18 * v, a: 0.4, hold: 1.5, d: 2.5 }); return tone(e, o, t, { f: 180, f1: 60, gain: 0.08 * v, a: 0.5, hold: 1, d: 2.6 }); },
  // distant thunder: a low rolling rumble (several strokes), the highs lost on the way
  thunder: (e, o, t, v) => {
    for (let i = 0; i < 4; i++) noise(e, o, t + i * r(0.35, 0.8), { type: 'lowpass', f: r(90, 160), f1: 50, gain: r(0.5, 0.9) * v, a: 0.25, hold: r(0.2, 0.8), d: r(1.8, 3.2), brown: true });
    return 4.5;
  },
  whoosh: (e, o, t, v) => noise(e, o, t, { type: 'bandpass', f: 300, f1: 2400, q: 0.8, gain: 0.3 * v, a: 0.5, d: 0.9 }),
  beep: (e, o, t, v) => tone(e, o, t, { f: 1046, gain: 0.05 * v, a: 0.004, hold: 0.08, d: 0.04 }),
};

for (const k of ['dirt', 'wood', 'crop', 'metal', 'grate', 'concrete', 'snow', 'water', 'sand', 'suit']) {
  SFX[`step_${k}`] = (e, o, t, v) => step(e, o, t, v, k);
}
