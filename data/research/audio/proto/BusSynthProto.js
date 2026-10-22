/*
 * BusSynthProto.js — reference implementation of the sound design in ../sound_design.md
 *
 * Native WebAudio nodes only (PeriodicWave oscillators, biquads, buffer-source noise).
 * NO AudioWorklet, NO blob/data URL, NO sample files => works from file://, iOS Safari,
 * Android Chrome. Plain script (defines root.BusSynth); wrap it as an ES module when
 * integrating into src/audio/. This is research code: it lives outside src/ and was
 * only run headlessly (OfflineAudioContext) to measure spectra/levels (see sound_design.md §11).
 *
 * All dB numbers are dBFS of the peak/RMS at the *voice output* before the master bus,
 * measured with the harness in ./render.cjs.
 */
(function (root) {
  'use strict';
  const dB = (x) => Math.pow(10, x / 20);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ buffers
  /** Seamless looping noise buffers, all RMS-normalised to 0.25 (-12 dBFS). */
  function makeBuffers(ctx, seed) {
    const sr = ctx.sampleRate, R = rng(seed || 7);
    const loopBuf = (sec, gen) => {
      const xf = Math.floor(0.08 * sr), n = Math.floor(sec * sr);
      const x = new Float32Array(n + xf);
      gen(x);
      let s = 0;
      for (let i = 0; i < x.length; i++) s += x[i] * x[i];
      const k = 0.25 / Math.sqrt(s / x.length + 1e-12);
      const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = x[i] * k;
      for (let i = 0; i < xf; i++) { const w = i / xf; d[i] = x[i] * k * w + x[n + i] * k * (1 - w); } // equal-level cross-fade at the seam
      return b;
    };
    const white = loopBuf(6, (x) => { for (let i = 0; i < x.length; i++) x[i] = R() * 2 - 1; });
    const pink = loopBuf(8, (x) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < x.length; i++) {
        const w = R() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    });
    const brown = loopBuf(8, (x) => { let l = 0; for (let i = 0; i < x.length; i++) { l = (l + 0.03 * (R() * 2 - 1)) / 1.03; x[i] = l; } });
    // sparse random impulses (≈70/s at playbackRate 1): cobbles, joints, rattles
    const velvet = loopBuf(4, (x) => { for (let i = 0; i < x.length; i++) if (R() < 70 / sr) x[i] = (R() * 2 - 1) * (0.4 + R()); });
    return { white, pink, brown, velvet };
  }

  // -------------------------------------------------------------- periodic waves
  /**
   * One engine *cycle* (2 crankshaft revolutions) as a PeriodicWave. The oscillator runs at
   * f_cyc = rpm/120; harmonic 6k = the k-th firing harmonic (firing frequency rpm/20).
   * slope: dB/octave roll-off of the firing harmonics (idle ~7, full load ~4.2), kMax/rolloff: HF limits.
   */
  function firingWave(ctx, slope, kMax, rolloffK) {
    const H = 6 * kMax, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let k = 1; k <= kMax; k++) re[6 * k] = dB(-slope * Math.log2(k)) * Math.exp(-k / rolloffK); // cos phase => impulse-like pulses
    return ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }
  /** Cylinder-to-cylinder irregularity: the cycle harmonics that are NOT multiples of 6 (lope, half-order thud). */
  function lopeWave(ctx, seed) {
    const R = rng(seed || 3), H = 6 * 12, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    const w = { 1: 0.55, 2: 0.7, 3: 1.0, 4: 0.5, 5: 0.45 };
    for (let h = 1; h <= H; h++) {
      if (h % 6 === 0) continue;
      const a = (w[h] || 0.5 / (1 + h / 6)) * 0.6, ph = R() * Math.PI * 2;
      re[h] = a * Math.cos(ph); im[h] = a * Math.sin(ph);
    }
    return ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }
  /** Piezo-style buzzer: odd harmonics 1/h up to 9. */
  function buzzWave(ctx) {
    const re = new Float32Array(10), im = new Float32Array(10);
    for (let h = 1; h <= 9; h += 2) im[h] = 1 / h;
    return ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }

  // --------------------------------------------------------------- zone presets
  /**
   * Listener presets for the *engine group*. hp/lp in Hz; p = [freq, gainDb, Q] peaking filters;
   * gain = dB relative to the "outside, 6 m" reference; road = dB offset of the tyre/road group vs the
   * engine group in that zone; extra = additional engine-group tone toggles.
   */
  const ZONES = {
    cab:     { hp: 40, lp: 900,  p: [[100, 4, 1.2], [260, 6, 1.4], [640, 2, 1.0]], gain: -11.5, road: 0,  turbo: -4, whine: 0,  comp: -10, bed: -43 },
    front:   { hp: 40, lp: 1100, p: [[120, 4, 1.2], [210, 5, 1.5], [520, 2, 1.0]], gain: -11.0, road: 0,  turbo: -4, whine: 0,  comp: -8,  bed: -41 },
    rear:    { hp: 40, lp: 2600, p: [[140, 4, 1.2], [330, 6, 1.5], [820, 4, 1.2]], gain: -6.5, road: -8,  turbo: +4, whine: +5, comp: +6,  bed: -40 },
    outNear: { hp: 45, lp: 6500, p: [[175, 4, 2.2], [420, 3, 1.5], [1500, 1, 1.0]], gain: -5.0,  road: -3,  turbo: 0,  whine: 0,  comp: 0,  bed: -99 },
  };

  // ----------------------------------------------------------------- the voice
  class BusVoice {
    constructor(ctx, dest, bufs, opt) {
      opt = opt || {};
      const c = (this.ctx = ctx);
      this.B = bufs;
      this.n = [];
      const node = (x) => { this.n.push(x); return x; };
      const G = (v) => { const g = node(c.createGain()); g.gain.value = v == null ? 0 : v; return g; };
      const BQ = (type, f, q, g) => { const b = node(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; if (g != null) b.gain.value = g; return b; };
      const SRC = (buf, rate) => { const s = node(c.createBufferSource()); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * 3); return s; };
      const OSC = (type, f) => { const o = node(c.createOscillator()); o.type = type; o.frequency.value = f; o.start(); return o; };
      this._G = G; this._BQ = BQ;

      // ---- zone chain (shared by every layer) ----
      this.zIn = G(1);
      this.zHp = BQ('highpass', 40, 0.7);
      this.zP = [BQ('peaking', 100, 1, 0), BQ('peaking', 250, 1, 0), BQ('peaking', 600, 1, 0)];
      this.zLp = BQ('lowpass', 6000, 0.6);
      this.zGain = G(1);
      this.zPan = node(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
      this.zIn.connect(this.zHp); this.zHp.connect(this.zP[0]); this.zP[0].connect(this.zP[1]); this.zP[1].connect(this.zP[2]); this.zP[2].connect(this.zLp);
      this.zLp.connect(this.zGain); this.zGain.connect(this.zPan); this.zPan.connect(dest);

      // two groups: engine/driveline and tyres/road (their balance depends on the zone)
      this.engGrp = G(dB(9)); this.engGrp.connect(this.zIn);   // +9 dB make-up: the zone gains below are relative to a '-0 dB outside' engine
      this.roadGrp = G(dB(18)); this.roadGrp.connect(this.zIn);

      // ---- engine tonal part: firing harmonics (idle-weights and load-weights) + lope ----
      this.waveIdle = firingWave(c, 7.0, 40, 16);
      this.waveLoad = firingWave(c, 4.2, 48, 26);
      this.oIdle = node(c.createOscillator()); this.oIdle.setPeriodicWave(this.waveIdle); this.oIdle.frequency.value = 5; this.oIdle.start();
      this.oLoad = node(c.createOscillator()); this.oLoad.setPeriodicWave(this.waveLoad); this.oLoad.frequency.value = 5; this.oLoad.start();
      this.oLope = node(c.createOscillator()); this.oLope.setPeriodicWave(lopeWave(c)); this.oLope.frequency.value = 5; this.oLope.start();
      this.gIdle = G(0.5); this.gLoad = G(0); this.gLope = G(0.2);
      this.oIdle.connect(this.gIdle); this.oLoad.connect(this.gLoad); this.oLope.connect(this.gLope);
      // slow random-ish pitch wobble (cycle-to-cycle irregularity of a lean-burn spark-ignition engine)
      const wob = (f, cents) => { const l = OSC('sine', f), g = G(cents); l.connect(g); [this.oIdle, this.oLoad, this.oLope].forEach((o) => g.connect(o.detune)); return g; };
      this.wobA = wob(0.71, 9); this.wobB = wob(1.93, 5);
      this.tonal = G(1);
      this.gIdle.connect(this.tonal); this.gLoad.connect(this.tonal); this.gLope.connect(this.tonal);
      // formant cascade (fixed in Hz => harmonics sweep through them as rpm changes)
      this.fm = [BQ('peaking', 105, 1.0, 5), BQ('peaking', 190, 2.0, 6), BQ('peaking', 410, 2.5, 5), BQ('peaking', 760, 1.8, 3)];
      this.fmLp = BQ('lowpass', 1800, 0.7);
      // phone-speaker rule: tilt the sub-150 Hz fundamentals down (they only load the compressor) and let the 150-900 Hz harmonics carry the note
      this.fmShelf = BQ('lowshelf', 150, 0.7, -10);
      this.tonal.connect(this.fm[0]); this.fm[0].connect(this.fm[1]); this.fm[1].connect(this.fm[2]); this.fm[2].connect(this.fm[3]); this.fm[3].connect(this.fmShelf); this.fmShelf.connect(this.fmLp);
      this.engGain = G(0); // engine on/off + level
      this.dip = G(1);     // torque-interruption dip during gearbox shifts (separate node: never read .value, so it also works offline)
      this.fmLp.connect(this.engGain); this.engGain.connect(this.dip); this.dip.connect(this.engGrp);

      // ---- firing-synchronous amplitude shaper (for combustion roar and injector tick) ----
      const amRe = new Float32Array(14), amIm = new Float32Array(14);
      for (let h = 1; h < 14; h++) amRe[h] = 1 / Math.pow(h, 0.7);
      this.oAM = node(c.createOscillator()); this.oAM.setPeriodicWave(c.createPeriodicWave(amRe, amIm, { disableNormalization: false })); this.oAM.frequency.value = 30; this.oAM.start();
      const amNoise = (buf, f, q, base, depth) => {
        const s = SRC(buf), bp = BQ('bandpass', f, q), am = G(base), d = G(depth), out = G(0);
        s.connect(bp); bp.connect(am); am.connect(out); this.oAM.connect(d); d.connect(am.gain);
        return { bp, out };
      };
      this.roar = amNoise(bufs.white, 900, 0.8, 0.5, 0.45);   // combustion roar
      this.tick = amNoise(bufs.white, 3000, 1.4, 0.15, 0.85); // gas-injector / ignition tick (CNG signature)
      this.roar.out.connect(this.engGrp); this.tick.out.connect(this.engGrp);
      // intake breathing
      const iS = SRC(bufs.pink); this.intakeBp = BQ('bandpass', 330, 0.9); this.gIntake = G(0);
      iS.connect(this.intakeBp); this.intakeBp.connect(this.gIntake); this.gIntake.connect(this.engGrp);

      // ---- turbo whistle + whoosh ----
      this.turboO = OSC('sine', 3000); this.gTurbo = G(0); this.turboO.connect(this.gTurbo); this.gTurbo.connect(this.engGrp);
      const tn = SRC(bufs.white); this.turboBp = BQ('bandpass', 3200, 1.0); this.gTurboN = G(0);
      tn.connect(this.turboBp); this.turboBp.connect(this.gTurboN); this.gTurboN.connect(this.engGrp);

      // ---- driveline whines ----
      this.gbxO = OSC('sine', 400); this.gbxO2 = OSC('sine', 800); this.gGbx = G(0); this.gGbx2 = G(0);
      this.gbxO.connect(this.gGbx); this.gbxO2.connect(this.gGbx2); this.gGbx.connect(this.engGrp); this.gGbx2.connect(this.engGrp);
      this.axO = OSC('sine', 300); this.axO2 = OSC('sine', 600); this.gAx = G(0); this.gAx2 = G(0);
      this.axO.connect(this.gAx); this.axO2.connect(this.gAx2); this.gAx.connect(this.engGrp); this.gAx2.connect(this.engGrp);
      const rS = SRC(bufs.pink); this.retBp = BQ('bandpass', 400, 3.5); this.gRet = G(0);
      rS.connect(this.retBp); this.retBp.connect(this.gRet); this.gRet.connect(this.engGrp);

      // ---- tyres / road / wind ----
      const t1 = SRC(bufs.pink); this.tyreLoBp = BQ('bandpass', 300, 0.8); this.gTyreLo = G(0);
      t1.connect(this.tyreLoBp); this.tyreLoBp.connect(this.gTyreLo); this.gTyreLo.connect(this.roadGrp);
      const t2 = SRC(bufs.white); this.tyreHiBp = BQ('bandpass', 1200, 0.8); this.gTyreHi = G(0);
      t2.connect(this.tyreHiBp); this.tyreHiBp.connect(this.gTyreHi); this.gTyreHi.connect(this.roadGrp);
      this.cobS = SRC(bufs.velvet); this.cobBp = BQ('bandpass', 190, 1.5); this.cobBp2 = BQ('bandpass', 700, 1.2); this.gCob = G(0);
      this.cobS.connect(this.cobBp); this.cobBp.connect(this.gCob); this.cobS.connect(this.cobBp2); this.cobBp2.connect(this.gCob); this.gCob.connect(this.roadGrp);
      const w1 = SRC(bufs.white); this.windBp = BQ('bandpass', 1700, 0.5); this.windHp = BQ('highpass', 450, 0.7); this.gWind = G(0);
      w1.connect(this.windHp); this.windHp.connect(this.windBp); this.windBp.connect(this.gWind); this.gWind.connect(this.roadGrp);

      // ---- air compressor (running only while the governor is in "load") ----
      this.oComp = node(c.createOscillator()); this.oComp.setPeriodicWave(c.createPeriodicWave(amRe, amIm, { disableNormalization: false })); this.oComp.frequency.value = 12; this.oComp.start();
      const cS = SRC(bufs.white); this.compBp = BQ('bandpass', 1700, 1.4); this.compAm = G(0.35); this.compD = G(0.65); this.gComp = G(0);
      cS.connect(this.compBp); this.compBp.connect(this.compAm); this.compAm.connect(this.gComp); this.oComp.connect(this.compD); this.compD.connect(this.compAm.gain);
      const cT = SRC(bufs.pink); this.compLo = BQ('bandpass', 230, 2); this.compAm2 = G(0.3); this.compD2 = G(0.7);
      cT.connect(this.compLo); this.compLo.connect(this.compAm2); this.compAm2.connect(this.gComp); this.oComp.connect(this.compD2); this.compD2.connect(this.compAm2.gain);
      this.gComp.connect(this.engGrp);

      // ---- interior bed: HVAC / roof AC fans (cab + passenger area only; level set by the zone) ----
      const bS = SRC(bufs.pink); this.bedBp = BQ('bandpass', 650, 0.6); this.gBed = G(0);
      bS.connect(this.bedBp); this.bedBp.connect(this.gBed); this.gBed.connect(this.roadGrp);
      this.bedO = OSC('sine', 143); this.bedO2 = OSC('sine', 286); this.gBedO = G(0);
      this.bedO.connect(this.gBedO); this.bedO2.connect(this.gBedO); this.gBedO.connect(this.roadGrp);

      this.zone = 'outNear'; this.z = Object.assign({}, ZONES.outNear);
      this.boost = 0; this.lastT = 0;
      this.setListener(0, { zone: 'outNear', dist: 6 });
    }

    /** Listener: zone 'cab'|'cabin'|'out'; for cabin pass prox 0..1 (0 = front section/door, 1 = at the engine); for out pass dist (m), radial (m/s, + = approaching), pan -1..1. */
    setListener(t, L) {
      let z;
      if (L.zone === 'cab') z = Object.assign({}, ZONES.cab);
      else if (L.zone === 'cabin') {
        const p = clamp(L.prox == null ? 0 : L.prox, 0, 1), a = ZONES.front, b = ZONES.rear;
        z = { bed: lerp(a.bed, b.bed, p), hp: lerp(a.hp, b.hp, p), lp: Math.exp(lerp(Math.log(a.lp), Math.log(b.lp), p)), gain: lerp(a.gain, b.gain, p), road: lerp(a.road, b.road, p), turbo: lerp(a.turbo, b.turbo, p), whine: lerp(a.whine, b.whine, p), comp: lerp(a.comp, b.comp, p),
          p: a.p.map((q, i) => [lerp(q[0], b.p[i][0], p), lerp(q[1], b.p[i][1], p), lerp(q[2], b.p[i][2], p)]) };
      } else {
        const d = Math.max(L.dist == null ? 6 : L.dist, 3);
        z = Object.assign({}, ZONES.outNear);
        z.gain = ZONES.outNear.gain - 20 * Math.log10(Math.max(d, 6) / 6) - 0.012 * Math.max(0, d - 6);          // spherical spreading + air
        z.lp = clamp(6500 * Math.pow(8 / Math.max(d, 8), 0.55), 900, 6500);
        z.p = ZONES.outNear.p.map((q, i) => (i === 0 ? [q[0], q[1] + clamp(d / 30, 0, 3), q[2]] : q)); // far: low end carries
      }
      this.z = z; this.zone = L.zone;
      this.gBed.gain.setTargetAtTime(dB(z.bed), t, 0.2); this.gBedO.gain.setTargetAtTime(dB(z.bed - 10), t, 0.2);
      const T = t, tc = 0.06;
      this.zHp.frequency.setTargetAtTime(z.hp, T, tc);
      z.p.forEach((q, i) => { this.zP[i].frequency.setTargetAtTime(q[0], T, tc); this.zP[i].gain.setTargetAtTime(q[1], T, tc); this.zP[i].Q.setTargetAtTime(q[2], T, tc); });
      this.zLp.frequency.setTargetAtTime(z.lp, T, tc);
      this.zGain.gain.setTargetAtTime(dB(z.gain), T, 0.08);
      this.roadGrp.gain.setTargetAtTime(dB(18 + z.road), T, 0.08);
      if (this.zPan.pan) this.zPan.pan.setTargetAtTime(clamp(L.pan || 0, -1, 1), T, 0.1);
      // Doppler on every oscillator via detune (cents)
      const vr = clamp(L.radial || 0, -40, 40), cents = L.zone === 'out' ? 1200 * Math.log2(343 / (343 - vr)) : 0;
      this.doppler = cents;
      [this.oIdle, this.oLoad, this.oLope, this.oAM, this.turboO, this.gbxO, this.gbxO2, this.axO, this.axO2, this.oComp].forEach((o) => o.detune.setTargetAtTime(cents, T, 0.05));
    }

    /** Drive the voice. s: {rpm, load 0..1, speed m/s, retarder 0..1, surface 'asphalt'|'brick', engineOn, comp bool, gear 1..6} */
    setState(t, s) {
      const tc = 0.05, rpm = Math.max(0, s.rpm), load = clamp(s.load, 0, 1), v = Math.abs(s.speed), on = s.engineOn !== false && rpm > 120;
      const z = this.z, dt = Math.max(0, t - this.lastT); this.lastT = t;
      const fc = rpm / 120, ff = rpm / 20;
      const setF = (p, f) => p.setTargetAtTime(Math.max(0.5, f), t, tc);
      [this.oIdle, this.oLoad, this.oLope].forEach((o) => { setF(o.frequency, fc); });
      setF(this.oAM.frequency, ff);
      // harmonic weighting by load: crossfade idle-slope wave <-> load-slope wave
      const lw = clamp(load * 1.15, 0, 1);
      this.gIdle.gain.setTargetAtTime((1 - lw) * 0.9, t, 0.08); this.gLoad.gain.setTargetAtTime(lw * 1.0, t, 0.08);
      this.gLope.gain.setTargetAtTime(lerp(0.22, 0.07, lw) * (rpm < 900 ? 1.15 : 1), t, 0.1);
      const toneDb = lerp(-4, -3.5, lw) + (rpm < 900 ? 0 : 1.5 * clamp((rpm - 900) / 900, 0, 1)); // tonal level (pre-zone)
      this.engGain.gain.setTargetAtTime(on ? dB(toneDb) : 0, t, 0.06);
      this.fmLp.frequency.setTargetAtTime(1300 + 2400 * lw, t, 0.1);
      // combustion roar / tick / intake
      this.roar.bp.frequency.setTargetAtTime(700 + 1000 * lw, t, 0.1);
      this.roar.out.gain.setTargetAtTime(on ? dB(lerp(-21, -12, lw)) : 0, t, 0.08);
      this.tick.out.gain.setTargetAtTime(on ? dB(lerp(-27, -19, lw)) : 0, t, 0.08);
      this.gIntake.gain.setTargetAtTime(on ? dB(lerp(-21, -10, lw)) : 0, t, 0.1);
      this.intakeBp.frequency.setTargetAtTime(280 + 220 * lw, t, 0.1);
      // turbo (boost lags the pedal: 0.35 s up, 0.9 s down)
      const bt = clamp((load - 0.15) / 0.85, 0, 1) * clamp((rpm - 800) / 700, 0, 1);
      this.boost += (bt - this.boost) * (1 - Math.exp(-dt / (bt > this.boost ? 0.35 : 0.9)));
      setF(this.turboO.frequency, (2600 + 3400 * this.boost) * 1);
      this.gTurbo.gain.setTargetAtTime(on ? dB(-50 + 18 * this.boost + z.turbo) * (this.boost > 0.02 ? 1 : 0) : 0, t, 0.05);
      this.turboBp.frequency.setTargetAtTime(2400 + 1600 * this.boost, t, 0.1);
      this.gTurboN.gain.setTargetAtTime(on ? dB(-44 + 14 * this.boost + z.turbo) * (this.boost > 0.02 ? 1 : 0) : 0, t, 0.08);
      // gearbox + axle whine
      const drive = clamp(0.35 + load, 0, 1.2);
      const fg = 19 * rpm / 60, fa = 13 * 2.064 * v;
      setF(this.gbxO.frequency, fg); setF(this.gbxO2.frequency, 2 * fg);
      this.gGbx.gain.setTargetAtTime(on && v > 0.8 ? dB(-46 + z.whine + 6 * (drive - 0.35)) : 0, t, 0.1);
      this.gGbx2.gain.setTargetAtTime(on && v > 0.8 ? dB(-52 + z.whine + 6 * (drive - 0.35)) : 0, t, 0.1);
      setF(this.axO.frequency, fa); setF(this.axO2.frequency, 2 * fa);
      const axAmt = clamp((v - 1.5) / 6, 0, 1);
      this.gAx.gain.setTargetAtTime(dB(-47 + z.whine) * axAmt * (load < 0.05 ? 1.6 : 1), t, 0.1);
      this.gAx2.gain.setTargetAtTime(dB(-55 + z.whine) * axAmt, t, 0.1);
      const ret = clamp(s.retarder || 0, 0, 1);
      this.retBp.frequency.setTargetAtTime(240 + 70 * v, t, 0.1);
      this.gRet.gain.setTargetAtTime(dB(-34 + z.whine * 0.5) * Math.pow(ret, 1.2) * clamp(v / 3, 0, 1), t, 0.1);
      // tyres / road / wind (levels are for 50 km/h = 13.9 m/s)
      const vr = Math.max(v, 0.01), k = clamp(Math.pow(vr / 13.9, 1.35), 0, 3.2), brick = s.surface === 'brick' ? 1 : 0;
      this.gTyreLo.gain.setTargetAtTime(dB(-16) * k * (brick ? 0.8 : 1) * clamp(vr / 1.2, 0, 1), t, 0.12);
      this.tyreLoBp.frequency.setTargetAtTime(250 + 8 * vr, t, 0.15);
      this.gTyreHi.gain.setTargetAtTime(dB(-26) * k * (brick ? 0.7 : 1) * clamp(vr / 1.5, 0, 1), t, 0.12);
      this.tyreHiBp.frequency.setTargetAtTime(900 + 45 * vr, t, 0.15);
      this.cobS.playbackRate.setTargetAtTime(brick ? clamp(vr / 5, 0.15, 5) : 0.0001, t, 0.1); // joint rate ∝ speed (brick length ≈ 0.22 m)
      this.gCob.gain.setTargetAtTime(brick ? dB(-12) * clamp(vr / 8, 0, 1.4) : 0, t, 0.15);
      this.gWind.gain.setTargetAtTime(dB(-33) * Math.pow(vr / 13.9, 2.4) * (vr > 4 ? 1 : 0), t, 0.2);
      this.windBp.frequency.setTargetAtTime(1200 + 30 * vr, t, 0.2);
      // compressor
      setF(this.oComp.frequency, Math.max(6, rpm / 60 * 0.9));
      this.gComp.gain.setTargetAtTime(s.comp && on ? dB(-34 + z.comp) : 0, t, 0.25);
    }

    /** Short torque interruption + clunk when the gearbox shifts. */
    shift(t, up) {
      this.dip.gain.setValueAtTime(1, t);
      this.dip.gain.linearRampToValueAtTime(dB(-5), t + 0.08);
      this.dip.gain.linearRampToValueAtTime(1, t + 0.4);
      OneShots.clunk(this.ctx, this.zIn, t + 0.05, this.B, { f0: up ? 120 : 150, f1: up ? 62 : 80, peakDb: -27 });
      OneShots.hiss(this.ctx, this.zIn, t + 0.03, this.B, { dur: 0.16, f0: 900, f1: 550, q: 0.9, peakDb: -40, attack: 0.02, tau: 0.06 });
    }

    dispose() { this.n.forEach((x) => { try { if (x.stop) x.stop(); x.disconnect(); } catch (e) { /* */ } }); }
  }

  // ------------------------------------------------------------- one-shot recipes
  const env = (g, t, peak, attack, tau, dur) => {
    g.gain.setValueAtTime(0.00001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.00001, t + attack, tau);
    return t + dur;
  };
  const OneShots = {
    /** Band-passed noise burst. opts: dur, f0, f1, q, peakDb, attack, tau, hp */
    hiss(ctx, dest, t, B, o) {
      const s = ctx.createBufferSource(); s.buffer = B.white; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q == null ? 0.8 : o.q;
      bp.frequency.setValueAtTime(o.f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(50, o.f1), t + o.dur);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 500;
      const g = ctx.createGain(); env(g, t, dB(o.peakDb) / 0.25, o.attack == null ? 0.01 : o.attack, o.tau == null ? o.dur / 3 : o.tau, o.dur);
      s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
      s.start(t, Math.random() * 4); s.stop(t + o.dur + 0.3);
    },
    /** Decaying sine thump. */
    thump(ctx, dest, t, o) {
      const os = ctx.createOscillator(); os.type = 'sine';
      os.frequency.setValueAtTime(o.f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.dur || 0.12));
      const g = ctx.createGain(); env(g, t, dB(o.peakDb), 0.003, (o.dur || 0.12) / 3.2, o.dur || 0.12);
      os.connect(g); g.connect(dest); os.start(t); os.stop(t + (o.dur || 0.12) + 0.3);
    },
    /** Short filtered-noise click. */
    click(ctx, dest, t, B, o) {
      const s = ctx.createBufferSource(); s.buffer = B.white; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f; bp.Q.value = o.q == null ? 3 : o.q;
      const g = ctx.createGain(); env(g, t, dB(o.peakDb) / 0.25, 0.0008, (o.dur || 0.008) / 3, o.dur || 0.008);
      s.connect(bp); bp.connect(g); g.connect(dest); s.start(t, Math.random() * 4); s.stop(t + (o.dur || 0.008) + 0.1);
    },
    /** Mechanical clunk = low thump + a noise tick. */
    clunk(ctx, dest, t, B, o) {
      OneShots.thump(ctx, dest, t, { f0: o.f0, f1: o.f1, peakDb: o.peakDb, dur: 0.11 });
      OneShots.click(ctx, dest, t, B, { f: 700, q: 1.2, peakDb: o.peakDb - 6, dur: 0.025 });
    },
    /** Slowly gliding band-limited noise (door leaf on its rails, kneeling creak). */
    glide(ctx, dest, t, B, o) {
      const s = ctx.createBufferSource(); s.buffer = B.pink; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 2;
      bp.frequency.setValueAtTime(o.f0, t); bp.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
      const am = ctx.createGain(); am.gain.value = 0.6; const lfo = ctx.createOscillator(); lfo.frequency.value = o.am || 26; const ld = ctx.createGain(); ld.gain.value = 0.4;
      lfo.connect(ld); ld.connect(am.gain);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(dB(o.peakDb) / 0.25, t + Math.min(0.25, o.dur * 0.2));
      g.gain.setValueAtTime(dB(o.peakDb) / 0.25, t + o.dur - Math.min(0.25, o.dur * 0.2)); g.gain.linearRampToValueAtTime(0.00001, t + o.dur);
      s.connect(bp); bp.connect(am); am.connect(g); g.connect(dest); s.start(t, Math.random() * 6); s.stop(t + o.dur + 0.1); lfo.start(t); lfo.stop(t + o.dur + 0.1);
    },
    /** Piezo buzzer beep through a body resonance. */
    beep(ctx, dest, t, o) {
      const os = ctx.createOscillator(); os.setPeriodicWave(buzzWave(ctx)); os.frequency.value = o.f || 1850;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = (o.f || 1850) * 1.05; bp.Q.value = 2.2;
      const g = ctx.createGain(); const d = o.dur || 0.24, pk = dB(o.peakDb);
      g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(pk, t + 0.003); g.gain.setValueAtTime(pk, t + d - 0.012); g.gain.linearRampToValueAtTime(0.00001, t + d);
      os.connect(bp); bp.connect(g); g.connect(dest); os.start(t); os.stop(t + d + 0.05);
    },
    /** Bell partials (inharmonic). */
    bell(ctx, dest, t, o) {
      const parts = [[1, 1, 0.38], [2.76, 0.32, 0.2], [5.4, 0.12, 0.09], [8.93, 0.05, 0.05]];
      parts.forEach(([m, a, tau]) => {
        const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = o.f * m;
        const g = ctx.createGain(); env(g, t, dB(o.peakDb) * a, 0.002, tau * (o.len || 1), 1.6);
        os.connect(g); g.connect(dest); os.start(t); os.stop(t + 2);
      });
    },
  };

  // ---- composite events (what the game calls) ----
  const Events = {
    doorOpen(ctx, dest, t, B, k) {
      k = k || 0; // k = zone dB offset
      OneShots.click(ctx, dest, t, B, { f: 1900, q: 3, peakDb: -20 + k, dur: 0.01 });
      OneShots.thump(ctx, dest, t, { f0: 220, f1: 140, peakDb: -22 + k, dur: 0.04 });
      OneShots.hiss(ctx, dest, t + 0.03, B, { dur: 0.6, f0: 3600, f1: 1900, q: 0.9, peakDb: -17 + k, attack: 0.012, tau: 0.2 });
      OneShots.glide(ctx, dest, t + 0.1, B, { dur: 1.25, f0: 520, f1: 380, q: 2.2, peakDb: -31 + k, am: 28 });
      OneShots.thump(ctx, dest, t + 1.38, { f0: 150, f1: 70, peakDb: -19 + k, dur: 0.12 });
      OneShots.click(ctx, dest, t + 1.38, B, { f: 800, q: 1.2, peakDb: -24 + k, dur: 0.02 });
    },
    doorBeeps(ctx, dest, t, k, f) {
      [0, 0.42].forEach((dt) => OneShots.beep(ctx, dest, t + dt, { f: f || 1850, dur: 0.24, peakDb: -15 + (k || 0) }));
    },
    doorClose(ctx, dest, t, B, k) { // t = closeStart (≈0.95 s after the close request, i.e. after the 2nd beep)
      k = k || 0;
      OneShots.click(ctx, dest, t, B, { f: 1700, q: 3, peakDb: -22 + k, dur: 0.01 });
      OneShots.hiss(ctx, dest, t + 0.02, B, { dur: 0.5, f0: 3000, f1: 1700, q: 0.9, peakDb: -20 + k, attack: 0.01, tau: 0.16 });
      OneShots.glide(ctx, dest, t + 0.05, B, { dur: 1.8, f0: 480, f1: 300, q: 2.0, peakDb: -31 + k, am: 22 });
      OneShots.thump(ctx, dest, t + 1.9, { f0: 130, f1: 60, peakDb: -17 + k, dur: 0.14 });
      OneShots.click(ctx, dest, t + 1.9, B, { f: 300, q: 1, peakDb: -22 + k, dur: 0.06 });
      OneShots.hiss(ctx, dest, t + 1.92, B, { dur: 0.2, f0: 3800, f1: 2800, q: 1, peakDb: -28 + k, attack: 0.006, tau: 0.06 });
    },
    stopBell(ctx, dest, t, B, k) {
      OneShots.click(ctx, dest, t, B, { f: 2600, q: 2, peakDb: -34 + (k || 0), dur: 0.008 });
      OneShots.bell(ctx, dest, t + 0.01, { f: 1319, peakDb: -15 + (k || 0) });
      OneShots.bell(ctx, dest, t + 0.25, { f: 1047, peakDb: -16 + (k || 0), len: 1.15 });
    },
    brakeRelease(ctx, dest, t, B, k) { // service brake released at standstill ("pssst")
      OneShots.click(ctx, dest, t, B, { f: 1400, q: 2, peakDb: -26 + (k || 0), dur: 0.012 });
      OneShots.hiss(ctx, dest, t + 0.01, B, { dur: 0.5, f0: 4200, f1: 2600, q: 1.0, peakDb: -15 + (k || 0), attack: 0.006, tau: 0.11 });
    },
    parkingRelease(ctx, dest, t, B, k) {
      OneShots.click(ctx, dest, t, B, { f: 900, q: 1.5, peakDb: -24 + (k || 0), dur: 0.02 });
      OneShots.hiss(ctx, dest, t + 0.02, B, { dur: 1.0, f0: 3400, f1: 1800, q: 0.8, peakDb: -14 + (k || 0), attack: 0.05, tau: 0.3 });
      OneShots.hiss(ctx, dest, t + 0.5, B, { dur: 0.3, f0: 3000, f1: 2000, q: 0.9, peakDb: -22 + (k || 0), attack: 0.01, tau: 0.08 });
    },
    kneelDown(ctx, dest, t, B, k) {
      OneShots.hiss(ctx, dest, t, B, { dur: 1.3, f0: 3000, f1: 1400, q: 0.7, peakDb: -16 + (k || 0), attack: 0.06, tau: 0.5 });
      OneShots.glide(ctx, dest, t + 0.1, B, { dur: 1.1, f0: 300, f1: 200, q: 4, peakDb: -33 + (k || 0), am: 9 });
      OneShots.thump(ctx, dest, t + 1.25, { f0: 150, f1: 70, peakDb: -21 + (k || 0), dur: 0.12 });
    },
    kneelUp(ctx, dest, t, B, k) {
      OneShots.hiss(ctx, dest, t, B, { dur: 2.2, f0: 900, f1: 1900, q: 0.8, peakDb: -24 + (k || 0), attack: 0.4, tau: 0.9 });
      OneShots.glide(ctx, dest, t + 0.1, B, { dur: 2.0, f0: 200, f1: 320, q: 4, peakDb: -33 + (k || 0), am: 8 });
      OneShots.thump(ctx, dest, t + 2.25, { f0: 140, f1: 70, peakDb: -22 + (k || 0), dur: 0.1 });
    },
    dryerPurge(ctx, dest, t, B, k) {
      OneShots.click(ctx, dest, t, B, { f: 1100, q: 1.5, peakDb: -26 + (k || 0), dur: 0.015 });
      OneShots.hiss(ctx, dest, t + 0.01, B, { dur: 1.7, f0: 5200, f1: 2400, q: 0.7, peakDb: -14 + (k || 0), attack: 0.004, tau: 0.34, hp: 900 });
      OneShots.hiss(ctx, dest, t + 1.9, B, { dur: 0.35, f0: 4200, f1: 3000, q: 0.8, peakDb: -22 + (k || 0), attack: 0.004, tau: 0.09, hp: 900 });
    },
    indicator(ctx, dest, t, B, on, k) {
      OneShots.click(ctx, dest, t, B, { f: on ? 2300 : 1700, q: 2.5, peakDb: (on ? -13 : -17) + (k || 0), dur: 0.007 });
      OneShots.click(ctx, dest, t + 0.004, B, { f: on ? 4200 : 3100, q: 3, peakDb: (on ? -19 : -22) + (k || 0), dur: 0.004 });
      OneShots.thump(ctx, dest, t, { f0: on ? 330 : 250, f1: on ? 200 : 150, peakDb: (on ? -19 : -23) + (k || 0), dur: 0.03 });
    },
    /** Road bump: front axle hit, then the middle and rear axles follow after wheelbase/speed (this is what makes motion audible on a phone). */
    bump(ctx, dest, t, B, o) {
      const k = o.k || 0, v = Math.max(o.v || 8, 2), big = o.big ? 1 : 0;
      [[0, 0], [5.105 / v, -3], [(5.105 + 7.0) / v, -4]].forEach(([dt, a]) => {
        OneShots.thump(ctx, dest, t + dt, { f0: 210 - 30 * big, f1: 80, peakDb: -21 + 4 * big + a + k, dur: 0.13 + 0.05 * big });
        OneShots.click(ctx, dest, t + dt, B, { f: 800, q: 1.1, peakDb: -20 + 4 * big + a + k, dur: 0.06 });
        OneShots.click(ctx, dest, t + dt + 0.004, B, { f: 1800, q: 1.4, peakDb: -25 + 4 * big + a + k, dur: 0.03 });
      });
      for (let i = 0; i < 4 + 3 * big; i++) OneShots.click(ctx, dest, t + 0.03 + i * (0.03 + 0.02 * ((i * 7) % 3)), B, { f: 1400 + 350 * ((i * 5) % 4), q: 5, peakDb: -33 + k, dur: 0.012 }); // loose panel / handrail rattle
    },
    gearSelect(ctx, dest, t, B, k) { OneShots.clunk(ctx, dest, t, B, { f0: 240, f1: 100, peakDb: -20 + (k || 0) }); OneShots.click(ctx, dest, t + 0.005, B, { f: 1300, q: 2, peakDb: -16 + (k || 0), dur: 0.02 }); },
    starter(ctx, dest, t, B, k) { // crank 0.9 s then catch — pair with rpm automation (0 -> 230 rpm -> 920 -> 620)
      const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(95, t); os.frequency.linearRampToValueAtTime(150, t + 0.9);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(420, t); bp.frequency.linearRampToValueAtTime(650, t + 0.9); bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.00001, t); g.gain.linearRampToValueAtTime(dB(-17 + (k || 0)), t + 0.12); g.gain.setValueAtTime(dB(-17 + (k || 0)), t + 0.85); g.gain.linearRampToValueAtTime(0.00001, t + 1.05);
      os.connect(bp); bp.connect(g); g.connect(dest); os.start(t); os.stop(t + 1.2);
      OneShots.click(ctx, dest, t, B, { f: 800, q: 1.2, peakDb: -18 + (k || 0), dur: 0.03 });
      OneShots.clunk(ctx, dest, t + 0.02, B, { f0: 190, f1: 90, peakDb: -19 + (k || 0) });
    },
  };

  root.BusSynth = { BusVoice, OneShots, Events, makeBuffers, ZONES, dB };
})(typeof self !== 'undefined' ? self : globalThis);
