// Procedural WebAudio sound design for the bus and the city. Every sound is
// synthesised at runtime (no sample files): an AudioWorklet engine model
// for the 12.8 l CNG inline-six, pneumatics, a two-beep door warning
// (synthesised and configurable, not a recording of the real bus), the
// indicator relay, tyre/road noise (incl. the cobbled yellow
// paving), wind, rain, city ambience, horn and the announcement chime.
// Three listening zones (driver's cab, passenger cabin, exterior) change
// filtering and levels.

const ENGINE_WORKLET = `
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 650, minValue: 0, maxValue: 3000 },
      { name: 'load', defaultValue: 0.1, minValue: 0, maxValue: 1 },
      { name: 'gain', defaultValue: 0.0, minValue: 0, maxValue: 2 },
    ];
  }
  constructor() {
    super();
    this.phase = 0; this.cyl = 0; this.env = 0; this.lp = 0; this.lp2 = 0; this.hp = 0;
    this.var = [1.0, 0.93, 1.05, 0.97, 1.02, 0.9];
    this.noise = 0; this.turboPh = 0; this.subPh = 0; this.res1 = [0, 0]; this.res2 = [0, 0];
  }
  process(inputs, outputs, params) {
    const out = outputs[0][0];
    const sr = sampleRate;
    for (let i = 0; i < out.length; i++) {
      const rpm = params.rpm.length > 1 ? params.rpm[i] : params.rpm[0];
      const load = params.load.length > 1 ? params.load[i] : params.load[0];
      const gain = params.gain.length > 1 ? params.gain[i] : params.gain[0];
      const fire = Math.max(1, rpm / 20); // 6 cylinders, 4-stroke
      this.phase += fire / sr;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) % 6;
        this.env = (0.55 + 0.45 * load) * this.var[this.cyl] * (0.94 + Math.random() * 0.12);
      }
      // combustion pulse: fast attack, exponential decay
      const pulse = this.env;
      this.env *= Math.exp(-fire * 5.0 / sr);
      // exhaust resonances (two band-ish filters via one-pole cascades)
      const cut = 0.02 + 0.06 * load + rpm / 60000;
      this.lp += (pulse - this.lp) * cut;
      this.lp2 += (this.lp - this.lp2) * cut * 0.8;
      const body = this.lp2 * 3.2 + (pulse - this.lp) * 0.08;
      // half-order rumble (uneven firing) for the CNG engine character
      this.subPh += (fire * 0.5) / sr;
      const sub = Math.sin(this.subPh * 6.28318) * 0.18 * (0.6 + load * 0.4);
      // mechanical noise & turbo whistle
      this.noise = this.noise * 0.6 + (Math.random() * 2 - 1) * 0.4;
      const mech = this.noise * 0.035 * (0.3 + load) * (0.5 + 0.5 * Math.sin(this.phase * 6.28318));
      this.turboPh += (2200 + rpm * 1.6) / sr;
      const turbo = Math.sin(this.turboPh * 6.28318) * 0.012 * load * Math.min(1, rpm / 1500);
      out[i] = (body + sub + mech + turbo) * gain;
    }
    return true;
  }
}
registerProcessor('engine-processor', EngineProcessor);
`;

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.zone = 'cab'; // 'cab' | 'cabin' | 'outside'
    this.voices = {};
    this.pressure = 9.5; // bar, air system
    this.compressorOn = false;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  async start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.applyVolumes();
    // busses
    this.engineBus = ctx.createGain();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1800;
    this.engineBus.connect(this.engineFilter).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 6000;
    this.ambBus.connect(this.ambFilter).connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    // cabin reverb for announcements & door beeps
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(0.45, 3.2);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.18;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.noiseBuf = this.makeNoise(2.5);
    this.brownBuf = this.makeBrown(4);
    // engine via AudioWorklet (fallback: oscillator stack)
    try {
      const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.engine = new AudioWorkletNode(ctx, 'engine-processor', { outputChannelCount: [1] });
      this.engine.connect(this.engineBus);
    } catch (e) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      o.connect(f).connect(g).connect(this.engineBus);
      o.start();
      this.engineFallback = { o, g };
    }
    // continuous loops
    this.road = this.loop(this.noiseBuf, 'bandpass', 400, 0.7, this.sfxBus);
    this.cobble = this.loop(this.brownBuf, 'lowpass', 180, 1, this.sfxBus);
    this.wind = this.loop(this.noiseBuf, 'highpass', 900, 0.5, this.sfxBus);
    this.city = this.loop(this.brownBuf, 'lowpass', 500, 0.8, this.ambBus);
    this.rain = this.loop(this.noiseBuf, 'highpass', 2500, 0.6, this.ambBus);
    this.rainRoof = this.loop(this.noiseBuf, 'bandpass', 1400, 1.2, this.sfxBus);
    this.compressor = this.loop(this.brownBuf, 'bandpass', 160, 3, this.sfxBus);
    this.cobbleLfo = ctx.createOscillator();
    this.cobbleLfoGain = ctx.createGain();
    this.cobbleLfo.frequency.value = 20;
    this.cobbleLfoGain.gain.value = 0;
    this.cobbleLfo.connect(this.cobbleLfoGain).connect(this.cobble.gain.gain);
    this.cobbleLfo.start();
    this.ready = true;
    this.birdTimer = 2;
  }

  applyVolumes() {
    if (!this.master) return;
    const s = this.settings;
    this.master.gain.value = s.volMaster ?? 0.9;
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
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
    src.start();
    return { src, filter: f, gain: g };
  }

  set(param, value, t = 0.08) {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, t);
  }

  setZone(zone) {
    this.zone = zone;
  }

  /**
   * Per-frame update.
   * st: {rpm, load, speed, engineOn, surface ('asphalt'|'brick'|'sett'), weather, ambience (0..1), parkFactor, distToBus}
   */
  update(dt, st) {
    if (!this.ready) return;
    const s = this.settings;
    const inside = this.zone !== 'outside';
    const nearBus = st.distToBus == null ? 1 : Math.max(0, 1 - st.distToBus / 120);
    // engine
    const ev = (s.volEngine ?? 0.8) * (st.engineOn ? 1 : 0);
    const zoneGain = this.zone === 'cab' ? 0.55 : this.zone === 'cabin' ? (st.rearCabin ? 0.95 : 0.5) : 0.9 * nearBus;
    if (this.engine) {
      this.set(this.engine.parameters.get('rpm'), st.rpm, 0.05);
      this.set(this.engine.parameters.get('load'), st.load, 0.1);
      this.set(this.engine.parameters.get('gain'), ev * zoneGain * 0.55, 0.1);
    } else if (this.engineFallback) {
      this.set(this.engineFallback.o.frequency, st.rpm / 20, 0.05);
      this.set(this.engineFallback.g.gain, ev * zoneGain * 0.05, 0.1);
    }
    this.set(this.engineFilter.frequency, inside ? (this.zone === 'cab' ? 900 : 1300) : 2600, 0.2);
    // tyres & road
    const v = Math.abs(st.speed);
    const sv = Math.min(1, v / 16);
    const cobble = st.surface === 'brick' || st.surface === 'sett';
    const roadZone = inside ? 0.55 : nearBus;
    this.set(this.road.gain.gain, sv * 0.22 * roadZone * (cobble ? 0.6 : 1));
    this.set(this.road.filter.frequency, 250 + v * 35);
    this.set(this.cobble.gain.gain, cobble ? sv * 0.35 * roadZone : 0, 0.2);
    this.set(this.cobbleLfo.frequency, Math.max(1, v / 0.22));
    this.set(this.cobbleLfoGain.gain, cobble ? sv * 0.25 : 0, 0.2);
    this.set(this.wind.gain.gain, Math.max(0, v - 6) * 0.006 * (inside ? 0.6 : nearBus));
    // air compressor: runs when the reservoir drops below the cut-in pressure
    this.pressure -= dt * (st.braking ? 0.06 : 0.004);
    if (this.pressure < 8.1 && st.engineOn) this.compressorOn = true;
    if (this.compressorOn) {
      this.pressure += dt * 0.09;
      if (this.pressure >= 10) {
        this.compressorOn = false;
        this.hiss(0.5, 0.35, 3200); // dryer purge "pssst"
      }
    }
    this.set(this.compressor.gain.gain, this.compressorOn ? 0.09 * (inside ? 1 : nearBus) : 0, 0.3);
    this.set(this.compressor.filter.frequency, 120 + (st.rpm / 20) * 0.5);
    // ambience
    const amb = (s.volAmbience ?? 0.7) * st.ambience;
    this.set(this.city.gain.gain, amb * (inside ? 0.12 : 0.3));
    this.set(this.ambFilter.frequency, inside ? 1200 : 7000, 0.3);
    const rain = st.weather === 'rain' ? 1 : 0;
    this.set(this.rain.gain.gain, rain * amb * (inside ? 0.05 : 0.22), 0.5);
    this.set(this.rainRoof.gain.gain, rain * (inside ? 0.12 : 0.02), 0.5);
    // birds in parks during the day
    this.birdTimer -= dt;
    if (this.birdTimer < 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      if (st.parkFactor > 0.2 && st.day > 0.5 && st.weather !== 'rain') this.bird(amb * st.parkFactor * (inside ? 0.25 : 1));
    }
  }

  // ---------------------------------------------------------------- one-shots
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

  /**
   * MAN door-closing warning: two distinct beeps. Timbre and timing are
   * configurable in the settings because no licensed reference recording
   * of the Sofia vehicles was available (see docs/AUDIO.md).
   */
  doorBeep(n) {
    if (!this.ready) return;
    const s = this.settings;
    const f = s.beepFreq ?? 1850;
    const d = s.beepDur ?? 0.24;
    const vol = (s.volSfx ?? 0.9) * (this.zone === 'outside' ? 0.35 : 0.6);
    // piezo buzzer: square through a resonant band-pass + slight pitch drop
    const g = this.tone(f, d, { type: 'square', gain: vol * 0.22, attack: 0.004, release: 0.02, filter: { type: 'bandpass', freq: f, q: 3 } });
    void g;
    this.tone(f * 2, d, { type: 'sine', gain: vol * 0.04, attack: 0.004, release: 0.02 });
    const dry = this.tone(f, d, { type: 'sine', gain: vol * 0.05, dest: this.reverb });
    void dry;
    void n;
  }

  /** Pneumatic exhaust "pssht" (doors, brakes, kneeling, dryer). */
  hiss(dur = 0.6, gain = 0.3, freq = 2600, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    const vol = gain * (this.settings.volSfx ?? 0.9) * (this.zone === 'outside' ? 0.6 : 1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  thump(gain = 0.4, freq = 90, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * (this.settings.volSfx ?? 0.9), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(g).connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + 0.25);
  }

  doorEvent(e) {
    if (!this.ready) return;
    if (e.type === 'beep') this.doorBeep(e.n);
    else if (e.type === 'opening') { this.hiss(0.9, 0.22, 2400); this.thump(0.08, 140, 1.2); }
    else if (e.type === 'closingStart') this.hiss(0.8, 0.18, 2000);
    else if (e.type === 'closed') { this.thump(0.25, 110); this.hiss(0.35, 0.12, 3000, 0.05); }
    else if (e.type === 'obstruction') this.thump(0.15, 160);
  }

  indicatorTick(on) {
    if (!this.ready) return;
    this.tone(on ? 1900 : 1500, 0.018, { type: 'square', gain: 0.05 * (this.zone === 'cab' ? 1 : 0.3), filter: { type: 'bandpass', freq: on ? 2400 : 1800, q: 4 } });
  }

  horn(on) {
    if (!this.ready) return;
    if (on && !this.hornNodes) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.16 * (this.settings.volSfx ?? 0.9), ctx.currentTime, 0.02);
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

  /** Passenger information chime (three-note gong) — returns its duration. */
  chime() {
    if (!this.ready) return 0;
    const s = this.settings;
    const vol = (s.volVoice ?? 1) * (this.zone === 'outside' ? 0.15 : 0.5);
    const notes = s.chimeNotes || [880, 698.5, 523.3];
    notes.forEach((f, i) => {
      for (const [mult, gg] of [[1, 1], [2, 0.25], [3.01, 0.08]]) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + i * 0.36;
        const o = ctx.createOscillator();
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol * 0.16 * gg, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 1.4);
        o.connect(g);
        g.connect(this.voiceBus);
        g.connect(this.reverb);
        o.start(t0);
        o.stop(t0 + 1.5);
      }
    });
    return notes.length * 0.36 + 0.5;
  }

  stopBell() {
    if (!this.ready) return;
    this.tone(1318, 0.5, { type: 'sine', gain: 0.12, release: 0.45 });
    this.tone(2637, 0.3, { type: 'sine', gain: 0.03, release: 0.28 });
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

  crash(intensity) {
    this.thump(Math.min(0.9, 0.3 + intensity * 0.1), 70);
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.15 + intensity * 0.05), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    src.stop(ctx.currentTime + 0.6);
  }

  kerb() {
    this.thump(0.35, 55);
  }

  rattle() {
    if (!this.ready || this.zone === 'outside') return;
    this.tone(300 + Math.random() * 900, 0.03, { type: 'square', gain: 0.012, filter: { type: 'bandpass', freq: 1200, q: 6 } });
  }
}
