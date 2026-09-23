// All sounds are synthesised with WebAudio (no samples). Announcements use the Web Speech API (bg-BG voice).
import { clamp, lerp } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null; this.vol = 0.8; this.inCab = true; this.voice = null; this.voices = [];
    this.speaking = false;
  }
  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // exterior sounds pass through a lowpass that closes when the listener is inside
    this.cabFilter = ctx.createBiquadFilter(); this.cabFilter.type = 'lowpass'; this.cabFilter.frequency.value = 2400;
    this.cabFilter.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeNoise(2, true);
    this.buildMotor();
    this.buildRoad();
    this.buildAmbience();
    this.unlockSpeech();
    this.loadVoices();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => this.loadVoices();
  }
  makeNoise(sec, brown = false) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  loopNoise(buf, dest) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest); s.start(); return s; }
  buildMotor() {
    const ctx = this.ctx;
    // traction inverter + asynchronous motor whine (Škoda IGBT drive)
    this.mGain = ctx.createGain(); this.mGain.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.value = 900;
    this.mBP = bp;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.35; const g2 = ctx.createGain(); g2.gain.value = 0.12; const g3 = ctx.createGain(); g3.gain.value = 0.5;
    this.osc1.connect(g1).connect(bp); this.osc2.connect(g2).connect(bp); this.osc3.connect(g3).connect(this.mGain);
    bp.connect(this.mGain); this.mGain.connect(this.master);
    for (const o of [this.osc1, this.osc2, this.osc3]) o.start();
    // auxiliary converter hum + whistle (constant when powered)
    this.auxGain = ctx.createGain(); this.auxGain.gain.value = 0;
    const hum = ctx.createOscillator(); hum.frequency.value = 100; hum.type = 'sine';
    const whistle = ctx.createOscillator(); whistle.frequency.value = 7800;
    const wg = ctx.createGain(); wg.gain.value = 0.02;
    hum.connect(this.auxGain); whistle.connect(wg).connect(this.auxGain); this.auxGain.connect(this.master);
    hum.start(); whistle.start();
    // compressor (periodic rattle)
    this.compGain = ctx.createGain(); this.compGain.gain.value = 0;
    const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 17; const lg = ctx.createGain(); lg.gain.value = 0.5;
    const cGainMod = ctx.createGain(); cGainMod.gain.value = 0.5;
    lfo.connect(lg).connect(cGainMod.gain); lfo.start();
    this.loopNoise(this.noiseBuf, cf); cf.connect(cGainMod).connect(this.compGain).connect(this.master);
    this.compT = 25; this.compOn = 0;
  }
  buildRoad() {
    const ctx = this.ctx;
    this.roadGain = ctx.createGain(); this.roadGain.gain.value = 0;
    this.roadLP = ctx.createBiquadFilter(); this.roadLP.type = 'lowpass'; this.roadLP.frequency.value = 300;
    this.loopNoise(this.brownBuf, this.roadLP); this.roadLP.connect(this.roadGain).connect(this.master);
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.5;
    this.loopNoise(this.noiseBuf, wf); wf.connect(this.windGain).connect(this.cabFilter);
  }
  buildAmbience() {
    const ctx = this.ctx;
    this.cityGain = ctx.createGain(); this.cityGain.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    this.loopNoise(this.brownBuf, lp); lp.connect(this.cityGain).connect(this.cabFilter);
    this.trafficGain = ctx.createGain(); this.trafficGain.gain.value = 0;
    const tl = ctx.createBiquadFilter(); tl.type = 'bandpass'; tl.frequency.value = 180; tl.Q.value = 0.7;
    this.loopNoise(this.brownBuf, tl); tl.connect(this.trafficGain).connect(this.cabFilter);
    this.birdT = 3;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  /** Called every frame. s: {v, throttle, brake, power, inCab, nearTraffic, nearKids} */
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.abs(s.v), kmh = v * 3.6;
    const load = clamp(Math.max(s.throttle, s.brake * 0.7, v > 0.5 && s.throttle < 0.05 ? 0.2 : 0), 0, 1);
    // inverter "music": carrier steps at low speed, then synchronous whine rising with speed
    let carrier;
    if (kmh < 6) carrier = 420 + kmh * 20; else if (kmh < 14) carrier = 560 + (kmh - 6) * 36; else if (kmh < 24) carrier = 850 + (kmh - 14) * 25; else carrier = 1100 + (kmh - 24) * 12;
    const rotor = 30 + kmh * 11.5;
    this.osc1.frequency.setTargetAtTime(rotor, t, 0.05);
    this.osc2.frequency.setTargetAtTime(carrier, t, 0.08);
    this.osc3.frequency.setTargetAtTime(rotor / 2, t, 0.05);
    this.mBP.frequency.setTargetAtTime(clamp(rotor * 1.4, 200, 3000), t, 0.1);
    const mg = s.power ? (v > 0.2 || s.throttle > 0.05 ? 0.035 + load * 0.11 : 0) : 0;
    this.mGain.gain.setTargetAtTime(mg * (s.inCab ? 1 : 0.7), t, 0.08);
    this.auxGain.gain.setTargetAtTime(s.power ? 0.03 : 0, t, 0.3);
    this.roadGain.gain.setTargetAtTime(clamp(v / 16, 0, 1) * 0.5, t, 0.2);
    this.roadLP.frequency.setTargetAtTime(160 + v * 30, t, 0.2);
    this.windGain.gain.setTargetAtTime(clamp((v - 6) / 12, 0, 1) * 0.07, t, 0.3);
    this.cabFilter.frequency.setTargetAtTime(s.inCab ? 1800 : 12000, t, 0.2);
    this.trafficGain.gain.setTargetAtTime(clamp(s.nearTraffic || 0, 0, 1) * 0.12, t, 0.3);
    // compressor cycles when stationary-ish
    this.compT -= dt;
    if (this.compT <= 0) { this.compOn = this.compOn ? 0 : 1; this.compT = this.compOn ? 6 + Math.random() * 4 : 40 + Math.random() * 40; }
    this.compGain.gain.setTargetAtTime(this.compOn && s.power ? 0.06 : 0, t, 0.4);
    // birds
    this.birdT -= dt;
    if (this.birdT <= 0) { this.birdT = 2 + Math.random() * 6; if (!s.inCab || v < 5) this.chirp(); }
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone(freq, dur, type = 'sine', vol = 0.2, dest = null, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest || this.master); o.start(t); o.stop(t + dur + 0.1);
  }
  noiseBurst(dur, freq, q, vol, delay = 0, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.master); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  /** Sofia-style informator gong: three descending bell tones. */
  chime() {
    if (!this.ctx) return 0;
    const notes = [784, 659.3, 523.3];
    notes.forEach((f, i) => {
      const d = i * 0.42;
      this.tone(f, 1.6, 'sine', 0.22, null, d);
      this.tone(f * 2.01, 0.9, 'sine', 0.06, null, d);
      this.tone(f * 3.0, 0.5, 'sine', 0.025, null, d);
    });
    return 1.55;
  }
  /** Passenger stop-request bell (two short electronic tones). */
  stopBell() {
    if (!this.ctx) return;
    this.tone(1318.5, 0.35, 'sine', 0.16, null, 0);
    this.tone(987.8, 0.55, 'sine', 0.16, null, 0.22);
  }
  doorOpen() { this.noiseBurst(0.9, 2600, 0.8, 0.25); this.tone(95, 0.25, 'sine', 0.3, null, 0.75); }
  doorWarn() { for (let k = 0; k < 3; k++) this.tone(2150, 0.14, 'square', 0.05, null, k * 0.36); }
  doorClose() { this.noiseBurst(0.7, 2200, 0.8, 0.2); this.tone(80, 0.3, 'sine', 0.35, null, 0.62); }
  tick(on) { this.noiseBurst(0.03, on ? 3800 : 2500, 4, 0.18); }
  hornOn() {
    if (!this.ctx || this.hornNodes) return;
    const ctx = this.ctx; const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 370;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 466;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(this.master); o1.start(); o2.start();
    this.hornNodes = { g, o1, o2 };
  }
  hornOff() { if (!this.hornNodes) return; const { g, o1, o2 } = this.hornNodes; const t = this.ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.03); o1.stop(t + 0.2); o2.stop(t + 0.2); this.hornNodes = null; }
  airHiss() { this.noiseBurst(1.1, 3200, 0.6, 0.18); }
  sparks() { for (let k = 0; k < 6; k++) this.noiseBurst(0.06 + Math.random() * 0.08, 5000 + Math.random() * 3000, 1, 0.25, k * 0.05); this.tone(60, 0.4, 'square', 0.12); }
  clunk() { this.tone(70, 0.35, 'sine', 0.5); this.noiseBurst(0.25, 400, 1, 0.4); }
  chirp() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      const f0 = 2800 + Math.random() * 1800, tk = t + k * 0.13;
      o.frequency.setValueAtTime(f0, tk); o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), tk + 0.09);
      g.gain.setValueAtTime(0.0001, tk); g.gain.linearRampToValueAtTime(0.02, tk + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tk + 0.1);
      o.connect(g).connect(this.cabFilter); o.start(tk); o.stop(tk + 0.12);
    }
  }
  /* ---------------------------- speech ---------------------------- */
  loadVoices() {
    if (!('speechSynthesis' in window)) return;
    this.voices = speechSynthesis.getVoices();
    const bg = this.voices.filter((v) => /^bg/i.test(v.lang));
    const fem = (v) => /female|жен|daria|kalina|google|siri|vesela|milena|irina/i.test(v.name);
    this.voice = this.userVoice || bg.find(fem) || bg[0] || null;
    this.onVoices?.(this.voices, bg);
  }
  unlockSpeech() {
    if (!('speechSynthesis' in window)) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'bg-BG'; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  }
  speak(text, onEnd) {
    if (!('speechSynthesis' in window)) { onEnd?.(); return false; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'bg-BG';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92; u.pitch = 1.08; u.volume = clamp(this.vol * 1.1, 0, 1);
      u.onend = () => { this.speaking = false; onEnd?.(); };
      u.onerror = () => { this.speaking = false; onEnd?.(); };
      this.speaking = true;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { onEnd?.(); return false; }
  }
}
export { lerp };
