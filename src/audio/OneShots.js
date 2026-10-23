// One-shot sound recipes (native nodes only): doors, beeps, bell, brakes, kneeling,
// dryer purge, indicator relay, bumps, bellows, gear select, starter, crash.
// Levels are the RMS/peak dBFS of the spec's "standing at the door" reference (sound_design.md
// section 8); callers add the zone offset k. B = noise buffers from dsp.makeBuffers.
import { dB, buzzWave } from './dsp.js';

const TINY = 0.00001;
const env = (g, t, peak, attack, tau) => {
  g.gain.setValueAtTime(TINY, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(TINY, t + attack, tau);
};

export const OneShots = {
  /** Band-passed noise burst. o: dur, f0, f1, q, peakDb, attack, tau, hp */
  hiss(ctx, dest, t, B, o) {
    const s = ctx.createBufferSource(); s.buffer = B.white; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q == null ? 0.8 : o.q;
    bp.frequency.setValueAtTime(o.f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(50, o.f1), t + o.dur);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 500;
    const g = ctx.createGain(); env(g, t, dB(o.peakDb) / 0.25, o.attack == null ? 0.01 : o.attack, o.tau == null ? o.dur / 3 : o.tau);
    s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t, Math.random() * 4); s.stop(t + o.dur + 0.3);
  },
  /** Decaying sine thump. */
  thump(ctx, dest, t, o) {
    const dur = o.dur || 0.12;
    const os = ctx.createOscillator(); os.type = 'sine';
    os.frequency.setValueAtTime(o.f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    const g = ctx.createGain(); env(g, t, dB(o.peakDb), 0.003, dur / 3.2);
    os.connect(g); g.connect(dest); os.start(t); os.stop(t + dur + 0.3);
  },
  /** Short filtered-noise click. */
  click(ctx, dest, t, B, o) {
    const dur = o.dur || 0.008;
    const s = ctx.createBufferSource(); s.buffer = B.white; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f; bp.Q.value = o.q == null ? 3 : o.q;
    const g = ctx.createGain(); env(g, t, dB(o.peakDb) / 0.25, 0.0008, dur / 3);
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t, Math.random() * 4); s.stop(t + dur + 0.1);
  },
  /** Mechanical clunk: low thump plus a noise tick. */
  clunk(ctx, dest, t, B, o) {
    OneShots.thump(ctx, dest, t, { f0: o.f0, f1: o.f1, peakDb: o.peakDb, dur: 0.11 });
    OneShots.click(ctx, dest, t, B, { f: o.clickF || 700, q: 1.2, peakDb: o.peakDb + (o.clickDb == null ? -6 : o.clickDb), dur: 0.025 });
  },
  /** Slowly gliding band-limited noise (door leaf on its rails, kneeling creak). */
  glide(ctx, dest, t, B, o) {
    const s = ctx.createBufferSource(); s.buffer = B.pink; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 2;
    bp.frequency.setValueAtTime(o.f0, t); bp.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
    const am = ctx.createGain(); am.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.am || 26;
    const ld = ctx.createGain(); ld.gain.value = 0.4;
    lfo.connect(ld); ld.connect(am.gain);
    const ramp = Math.min(0.25, o.dur * 0.2), pk = dB(o.peakDb) / 0.25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(TINY, t); g.gain.linearRampToValueAtTime(pk, t + ramp);
    g.gain.setValueAtTime(pk, t + o.dur - ramp); g.gain.linearRampToValueAtTime(TINY, t + o.dur);
    s.connect(bp); bp.connect(am); am.connect(g); g.connect(dest);
    s.start(t, Math.random() * 6); s.stop(t + o.dur + 0.1); lfo.start(t); lfo.stop(t + o.dur + 0.1);
  },
  /** Piezo buzzer beep through a body resonance. */
  beep(ctx, dest, t, B, o) {
    const f = o.f || 1850, d = o.dur || 0.24, pk = dB(o.peakDb);
    if (!B.buzz) B.buzz = buzzWave(ctx);
    const os = ctx.createOscillator(); os.setPeriodicWave(B.buzz); os.frequency.value = f;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.05; bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(TINY, t); g.gain.linearRampToValueAtTime(pk, t + 0.003);
    g.gain.setValueAtTime(pk, t + d - 0.012); g.gain.linearRampToValueAtTime(TINY, t + d);
    os.connect(bp); bp.connect(g); g.connect(dest); os.start(t); os.stop(t + d + 0.05);
    return g;
  },
  /** Inharmonic bell partials. */
  bell(ctx, dest, t, o) {
    const parts = [[1, 1, 0.38], [2.76, 0.32, 0.2], [5.4, 0.12, 0.09], [8.93, 0.05, 0.05]];
    for (const [m, a, tau] of parts) {
      const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = o.f * m;
      const g = ctx.createGain(); env(g, t, dB(o.peakDb) * a, 0.002, tau * (o.len || 1));
      os.connect(g); g.connect(dest); os.start(t); os.stop(t + 2);
    }
  },
};

/** Composite events (what the game calls). k = zone dB offset, dest = shot bus. */
export const Events = {
  doorOpen(ctx, dest, t, B, k, short) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 1900, q: 3, peakDb: -20 + k, dur: 0.01 });
    OneShots.thump(ctx, dest, t, { f0: 220, f1: 140, peakDb: -22 + k, dur: 0.04 });
    OneShots.hiss(ctx, dest, t + 0.03, B, { dur: 0.6, f0: 3600, f1: 1900, q: 0.9, peakDb: -17 + k, attack: 0.012, tau: 0.2 });
    const gl = short ? 0.8 : 1.25;
    OneShots.glide(ctx, dest, t + 0.1, B, { dur: gl, f0: 520, f1: 380, q: 2.2, peakDb: -31 + k, am: 28 });
    OneShots.thump(ctx, dest, t + 0.13 + gl, { f0: 150, f1: 70, peakDb: -19 + k, dur: 0.12 });
    OneShots.click(ctx, dest, t + 0.13 + gl, B, { f: 800, q: 1.2, peakDb: -24 + k, dur: 0.02 });
  },
  /** Safety edge: the closing door reverses, then runs the open sound with a short glide. */
  doorObstruct(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 1100, q: 2, peakDb: -20 + k, dur: 0.015 });
    OneShots.thump(ctx, dest, t, { f0: 180, f1: 90, peakDb: -22 + k, dur: 0.1 });
    Events.doorOpen(ctx, dest, t + 0.03, B, k, true);
  },
  /** One warning beep (the game fires beep 1 and beep 2 as separate door events). */
  doorBeep(ctx, dest, t, B, k, f, dur) {
    return OneShots.beep(ctx, dest, t, B, { f: f || 1850, dur: dur || 0.24, peakDb: -15 + (k || 0) });
  },
  /** t = closingStart (after the second beep). */
  doorClose(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 1700, q: 3, peakDb: -22 + k, dur: 0.01 });
    OneShots.hiss(ctx, dest, t + 0.02, B, { dur: 0.5, f0: 3000, f1: 1700, q: 0.9, peakDb: -20 + k, attack: 0.01, tau: 0.16 });
    OneShots.glide(ctx, dest, t + 0.05, B, { dur: 1.8, f0: 480, f1: 300, q: 2.0, peakDb: -31 + k, am: 22 });
    OneShots.thump(ctx, dest, t + 1.9, { f0: 130, f1: 60, peakDb: -17 + k, dur: 0.14 });
    OneShots.click(ctx, dest, t + 1.9, B, { f: 300, q: 1, peakDb: -22 + k, dur: 0.06 });
    OneShots.hiss(ctx, dest, t + 1.92, B, { dur: 0.2, f0: 3800, f1: 2800, q: 1, peakDb: -28 + k, attack: 0.006, tau: 0.06 });
  },
  /** Stop-request bell. style 'dingdong' (default) or 'ding'. */
  stopBell(ctx, dest, t, B, k, style) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 2600, q: 2, peakDb: -34 + k, dur: 0.008 });
    OneShots.bell(ctx, dest, t + 0.01, { f: 1319, peakDb: -15 + k });
    if (style !== 'ding') OneShots.bell(ctx, dest, t + 0.25, { f: 1047, peakDb: -16 + k, len: 1.15 });
  },
  brakeRelease(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 1400, q: 2, peakDb: -26 + k, dur: 0.012 });
    OneShots.hiss(ctx, dest, t + 0.01, B, { dur: 0.5, f0: 4200, f1: 2600, q: 1.0, peakDb: -15 + k, attack: 0.006, tau: 0.11 });
  },
  brakeApply(ctx, dest, t, B, k, short) {
    k = k || 0;
    OneShots.hiss(ctx, dest, t, B, { dur: short ? 0.2 : 0.35, f0: 3800, f1: 2600, q: 1, peakDb: (short ? -24 : -17) + k, attack: 0.004, tau: 0.08 });
    OneShots.click(ctx, dest, t, B, { f: 1200, q: 2, peakDb: -24 + k, dur: 0.01 });
  },
  parkingRelease(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 900, q: 1.5, peakDb: -24 + k, dur: 0.02 });
    OneShots.hiss(ctx, dest, t + 0.02, B, { dur: 1.0, f0: 3400, f1: 1800, q: 0.8, peakDb: -14 + k, attack: 0.05, tau: 0.3 });
    OneShots.hiss(ctx, dest, t + 0.5, B, { dur: 0.3, f0: 3000, f1: 2000, q: 0.9, peakDb: -22 + k, attack: 0.01, tau: 0.08 });
  },
  kneelDown(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.hiss(ctx, dest, t, B, { dur: 1.3, f0: 3000, f1: 1400, q: 0.7, peakDb: -16 + k, attack: 0.06, tau: 0.5 });
    OneShots.glide(ctx, dest, t + 0.1, B, { dur: 1.1, f0: 300, f1: 200, q: 4, peakDb: -33 + k, am: 9 });
    OneShots.thump(ctx, dest, t + 1.25, { f0: 150, f1: 70, peakDb: -21 + k, dur: 0.12 });
  },
  kneelUp(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.hiss(ctx, dest, t, B, { dur: 2.2, f0: 900, f1: 1900, q: 0.8, peakDb: -24 + k, attack: 0.4, tau: 0.9 });
    OneShots.glide(ctx, dest, t + 0.1, B, { dur: 2.0, f0: 200, f1: 320, q: 4, peakDb: -33 + k, am: 8 });
    OneShots.thump(ctx, dest, t + 2.25, { f0: 140, f1: 70, peakDb: -22 + k, dur: 0.1 });
  },
  dryerPurge(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 1100, q: 1.5, peakDb: -26 + k, dur: 0.015 });
    OneShots.hiss(ctx, dest, t + 0.01, B, { dur: 1.7, f0: 5200, f1: 2400, q: 0.7, peakDb: -14 + k, attack: 0.004, tau: 0.34, hp: 900 });
    OneShots.hiss(ctx, dest, t + 1.9, B, { dur: 0.35, f0: 4200, f1: 3000, q: 0.8, peakDb: -22 + k, attack: 0.004, tau: 0.09, hp: 900 });
  },
  /** Indicator relay: tick on the on-edge, tock on the off-edge. */
  indicator(ctx, dest, t, B, on, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: on ? 2300 : 1700, q: 2.5, peakDb: (on ? -13 : -17) + k, dur: 0.007 });
    OneShots.click(ctx, dest, t + 0.004, B, { f: on ? 4200 : 3100, q: 3, peakDb: (on ? -19 : -22) + k, dur: 0.004 });
    OneShots.thump(ctx, dest, t, { f0: on ? 330 : 250, f1: on ? 200 : 150, peakDb: (on ? -19 : -23) + k, dur: 0.03 });
  },
  /** Road bump: front axle, then the middle and rear axles after wheelbase/speed. The strongest "we are moving" cue on a phone. */
  bump(ctx, dest, t, B, o) {
    const k = o.k || 0, v = Math.max(o.v || 8, 2), big = o.big ? 1 : 0, rattle = o.rattle !== false;
    for (const [dt, a] of [[0, 0], [5.105 / v, -3], [(5.105 + 7.0) / v, -4]]) {
      OneShots.thump(ctx, dest, t + dt, { f0: 210 - 30 * big, f1: 80, peakDb: -21 + 4 * big + a + k, dur: 0.13 + 0.05 * big });
      OneShots.click(ctx, dest, t + dt, B, { f: 800, q: 1.1, peakDb: -20 + 4 * big + a + k, dur: 0.06 });
      OneShots.click(ctx, dest, t + dt + 0.004, B, { f: 1800, q: 1.4, peakDb: -25 + 4 * big + a + k, dur: 0.03 });
    }
    if (rattle) for (let i = 0; i < 4 + 3 * big; i++) OneShots.click(ctx, dest, t + 0.03 + i * (0.03 + 0.02 * ((i * 7) % 3)), B, { f: 1400 + 350 * ((i * 5) % 4), q: 5, peakDb: -33 + k, dur: 0.012 }); // loose panel / handrail
  },
  /** Articulation bellows and turntable: fabric/rubber creak over a floor-plate rumble. s scales the level. */
  bellowsCreak(ctx, dest, t, B, k, s) {
    k = (k || 0) + 20 * Math.log10(s || 1);
    OneShots.glide(ctx, dest, t, B, { dur: 1.3, f0: 160, f1: 210, q: 1.2, peakDb: -20 + k, am: 11 });
    OneShots.glide(ctx, dest, t + 0.05, B, { dur: 1.2, f0: 820, f1: 1100, q: 6, peakDb: -20 + k, am: 5 });
    OneShots.glide(ctx, dest, t + 0.25, B, { dur: 0.9, f0: 1500, f1: 1250, q: 5, peakDb: -27 + k, am: 7 });
    OneShots.click(ctx, dest, t + 1.1, B, { f: 600, q: 1.2, peakDb: -30 + k, dur: 0.03 });
  },
  gearSelect(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.clunk(ctx, dest, t, B, { f0: 240, f1: 100, peakDb: -20 + k });
    OneShots.click(ctx, dest, t + 0.005, B, { f: 1300, q: 2, peakDb: -16 + k, dur: 0.02 });
  },
  /** Automatic gearbox shift: clutch-fill "shhp" and a clunk. */
  shiftClunk(ctx, dest, t, B, k, up) {
    k = k || 0;
    OneShots.clunk(ctx, dest, t + 0.05, B, { f0: up ? 120 : 150, f1: up ? 62 : 80, peakDb: -23 + k, clickF: 900, clickDb: -3 });
    OneShots.hiss(ctx, dest, t + 0.03, B, { dur: 0.16, f0: 900, f1: 550, q: 0.9, peakDb: -34 + k, attack: 0.02, tau: 0.06 });
  },
  /** Starter motor crank 0.9 s then catch; pair with the rpm timeline (dsp.startRpm). */
  starter(ctx, dest, t, B, k) {
    k = k || 0;
    const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(95, t); os.frequency.linearRampToValueAtTime(150, t + 0.9);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(420, t); bp.frequency.linearRampToValueAtTime(650, t + 0.9); bp.Q.value = 2.5;
    const g = ctx.createGain(); const pk = dB(-17 + k);
    g.gain.setValueAtTime(TINY, t); g.gain.linearRampToValueAtTime(pk, t + 0.12); g.gain.setValueAtTime(pk, t + 0.85); g.gain.linearRampToValueAtTime(TINY, t + 1.05);
    os.connect(bp); bp.connect(g); g.connect(dest); os.start(t); os.stop(t + 1.2);
    OneShots.click(ctx, dest, t, B, { f: 800, q: 1.2, peakDb: -18 + k, dur: 0.03 });
    OneShots.clunk(ctx, dest, t + 0.02, B, { f0: 190, f1: 90, peakDb: -19 + k });
    OneShots.click(ctx, dest, t + 0.02, B, { f: 1500, q: 1.5, peakDb: -22 + k, dur: 0.02 }); // relay: keeps it audible on a phone
  },
  /** Engine switched off: last compression thumps, fuel-solenoid click, air sigh. */
  engineStop(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.click(ctx, dest, t, B, { f: 800, q: 1.5, peakDb: -26 + k, dur: 0.015 });
    OneShots.thump(ctx, dest, t + 0.7, { f0: 70, f1: 45, peakDb: -24 + k, dur: 0.15 });
    OneShots.thump(ctx, dest, t + 1.0, { f0: 70, f1: 45, peakDb: -24 + k, dur: 0.15 });
    OneShots.hiss(ctx, dest, t + 0.1, B, { dur: 0.4, f0: 1200, f1: 900, q: 0.8, peakDb: -34 + k, attack: 0.05, tau: 0.15 });
  },
  /** Turbo flutter chirp on lift-off (low confidence, inferred). */
  turboFlutter(ctx, dest, t, B, k) {
    OneShots.hiss(ctx, dest, t, B, { dur: 0.5, f0: 2600, f1: 1400, q: 1.2, peakDb: -34 + (k || 0), attack: 0.005, tau: 0.18, hp: 900 });
  },
  rattle(ctx, dest, t, B, k) {
    OneShots.click(ctx, dest, t, B, { f: 900 + Math.random() * 1200, q: 6, peakDb: -30 + (k || 0), dur: 0.015 });
  },
  /** Collision: body thump plus a noise burst and a metallic click (audible on a phone). */
  crash(ctx, dest, t, B, k, intensity) {
    const a = Math.min(8, intensity || 1);
    k = (k || 0) + Math.min(6, a * 0.8);
    OneShots.thump(ctx, dest, t, { f0: 140, f1: 55, peakDb: -12 + k, dur: 0.25 });
    OneShots.hiss(ctx, dest, t, B, { dur: 0.5, f0: 1800, f1: 600, q: 0.7, peakDb: -16 + k, attack: 0.003, tau: 0.12, hp: 200 });
    OneShots.click(ctx, dest, t, B, { f: 700, q: 1, peakDb: -16 + k, dur: 0.05 });
    OneShots.click(ctx, dest, t + 0.01, B, { f: 2200, q: 1.5, peakDb: -22 + k, dur: 0.03 });
  },
  kerb(ctx, dest, t, B, k) {
    k = k || 0;
    OneShots.thump(ctx, dest, t, { f0: 120, f1: 55, peakDb: -16 + k, dur: 0.18 });
    OneShots.click(ctx, dest, t, B, { f: 600, q: 1.1, peakDb: -20 + k, dur: 0.06 });
    OneShots.click(ctx, dest, t + 0.004, B, { f: 1600, q: 1.4, peakDb: -26 + k, dur: 0.03 });
  },
};
