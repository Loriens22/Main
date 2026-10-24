// One synthesised bus: engine (PeriodicWave firing harmonics, formants, roar, injector tick,
// intake, turbo), driveline whine, retarder, tyres, cobbles, wind, air compressor and the
// HVAC bed, all with native nodes only (works from file://, Safari and old Android WebViews).
// Port of data/research/audio/proto/BusSynthProto.js with a lite form for the farther buses,
// a slim form for the 'low' quality preset, an output switch (detached voices cost no CPU) and
// change-filtered parameter writes.
import { dB, clamp, lerp, firingWave, lopeWave, pulseWave, zoneFor, dopplerCents } from './dsp.js';
import { Events } from './OneShots.js';
import { engineProfile } from './EngineProfiles.js';

// write an AudioParam target only when it moved (the game calls setState 12-20 times a second)
function setP(p, v, t, tc, eps) {
  if (!Number.isFinite(v)) return;
  const l = p._l;
  if (l !== undefined && Math.abs(v - l) <= 1e-5 + (eps == null ? 0.004 : eps) * Math.abs(v)) return;
  p._l = v;
  p.setTargetAtTime(v, t, tc);
}

export class BusVoice {
  /** opt: {lite, slim, flutter} */
  constructor(ctx, bufs, opt) {
    opt = opt || {};
    const c = (this.ctx = ctx);
    this.B = bufs;
    this.lite = !!opt.lite;
    this.slim = !!opt.slim && !this.lite;
    this.flutterOn = !!opt.flutter && !this.lite;
    const full = !this.lite, rich = full && !this.slim; // rich = everything on
    this.n = [];
    const node = (x) => { this.n.push(x); return x; };
    const G = (v) => { const g = node(c.createGain()); g.gain.value = v == null ? 0 : v; return g; };
    const BQ = (type, f, q, g) => { const b = node(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; if (g != null) b.gain.value = g; return b; };
    const SRC = (buf, rate) => { const s = node(c.createBufferSource()); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * 3); return s; };
    const OSC = (type, f) => { const o = node(c.createOscillator()); o.type = type; o.frequency.value = f; o.start(); return o; };
    this.dopOscs = []; // oscillators that follow the Doppler shift

    // ---- zone chain (shared by every layer) ----
    this.zIn = G(1);
    this.zHp = BQ('highpass', 40, 0.7);
    this.zP = [BQ('peaking', 100, 1, 0), BQ('peaking', 250, 1, 0), BQ('peaking', 600, 1, 0)];
    this.zLp = BQ('lowpass', 6000, 0.6);
    this.zGain = G(1);
    this.zPan = node(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    this.out = G(1); // fade in/out when the voice is (re)assigned
    this.zIn.connect(this.zHp); this.zHp.connect(this.zP[0]); this.zP[0].connect(this.zP[1]); this.zP[1].connect(this.zP[2]); this.zP[2].connect(this.zLp);
    this.zLp.connect(this.zGain); this.zGain.connect(this.zPan); this.zPan.connect(this.out);

    // two groups: engine/driveline and tyres/road (their balance depends on the zone)
    this.engGrp = G(dB(9)); this.engGrp.connect(this.zIn);
    this.roadGrp = G(dB(18)); this.roadGrp.connect(this.zIn);

    // ---- engine tonal part: firing harmonics (idle and load slopes) + lope ----
    this.oIdle = node(c.createOscillator()); this.oIdle.setPeriodicWave(bufs.waveIdle || (bufs.waveIdle = firingWave(c, 7.0, 40, 16))); this.oIdle.frequency.value = 5; this.oIdle.start();
    this.oLoad = node(c.createOscillator()); this.oLoad.setPeriodicWave(bufs.waveLoad || (bufs.waveLoad = firingWave(c, 4.2, 48, 26))); this.oLoad.frequency.value = 5; this.oLoad.start();
    this.cycOscs = [this.oIdle, this.oLoad];
    this.gIdle = G(0.5); this.gLoad = G(0);
    this.tonal = G(1);
    this.oIdle.connect(this.gIdle); this.oLoad.connect(this.gLoad);
    this.gIdle.connect(this.tonal); this.gLoad.connect(this.tonal);
    if (full) {
      this.oLope = node(c.createOscillator()); this.oLope.setPeriodicWave(bufs.waveLope || (bufs.waveLope = lopeWave(c))); this.oLope.frequency.value = 5; this.oLope.start();
      this.cycOscs.push(this.oLope);
      this.gLope = G(0.2); this.oLope.connect(this.gLope); this.gLope.connect(this.tonal);
      // slow pitch wobble: cycle-to-cycle irregularity of a spark-ignition engine
      const wob = (f, cents) => { const l = OSC('sine', f), g = G(cents); l.connect(g); this.cycOscs.forEach((o) => g.connect(o.detune)); return g; };
      this.wobA = wob(0.71, 9);
      if (rich) this.wobB = wob(1.93, 5);
    }
    this.dopOscs.push(...this.cycOscs);
    // formant cascade (fixed in Hz, so harmonics sweep through them as rpm changes)
    this.fm = [BQ('peaking', 105, 1.0, 5), BQ('peaking', 190, 2.0, 6), BQ('peaking', 410, 2.5, 5), BQ('peaking', 760, 1.8, 3)];
    this.fmLp = BQ('lowpass', 1800, 0.7);
    this.fmShelf = BQ('lowshelf', 150, 0.7, -10); // phone-speaker tilt: the sub-150 Hz fundamentals only load the compressor
    this.tonal.connect(this.fm[0]); this.fm[0].connect(this.fm[1]); this.fm[1].connect(this.fm[2]); this.fm[2].connect(this.fm[3]); this.fm[3].connect(this.fmShelf); this.fmShelf.connect(this.fmLp);
    this.engGain = G(0); // engine on/off + level
    this.dip = G(1); // torque interruption during gearbox shifts
    this.fmLp.connect(this.engGain); this.engGain.connect(this.dip); this.dip.connect(this.engGrp);

    // ---- intake breathing ----
    const iS = SRC(bufs.pink); this.intakeBp = BQ('bandpass', 330, 0.9); this.gIntake = G(0);
    iS.connect(this.intakeBp); this.intakeBp.connect(this.gIntake); this.gIntake.connect(this.engGrp);

    // ---- tyres ----
    const t1 = SRC(bufs.pink); this.tyreLoBp = BQ('bandpass', 300, 0.8); this.gTyreLo = G(0);
    t1.connect(this.tyreLoBp); this.tyreLoBp.connect(this.gTyreLo); this.gTyreLo.connect(this.roadGrp);
    const t2 = SRC(bufs.white); this.tyreHiBp = BQ('bandpass', 1200, 0.8); this.gTyreHi = G(0);
    t2.connect(this.tyreHiBp); this.tyreHiBp.connect(this.gTyreHi); this.gTyreHi.connect(this.roadGrp);

    if (full) {
      // ---- firing-synchronous amplitude shaper (combustion roar, injector tick, compressor) ----
      const pw = bufs.pulse || (bufs.pulse = pulseWave(c));
      this.oAM = node(c.createOscillator()); this.oAM.setPeriodicWave(pw); this.oAM.frequency.value = 30; this.oAM.start();
      this.dopOscs.push(this.oAM);
      const amNoise = (buf, f, q, base, depth) => {
        const s = SRC(buf), bp = BQ('bandpass', f, q), am = G(base), d = G(depth), out = G(0);
        s.connect(bp); bp.connect(am); am.connect(out); this.oAM.connect(d); d.connect(am.gain);
        return { bp, out };
      };
      this.roar = amNoise(bufs.white, 900, 0.8, 0.5, 0.45); // combustion roar
      this.tick = amNoise(bufs.white, 3000, 1.4, 0.15, 0.85); // gas-injector / ignition tick (the CNG signature)
      this.roar.out.connect(this.engGrp); this.tick.out.connect(this.engGrp);

      // ---- turbo whistle (+ whoosh) ----
      this.turboO = OSC('sine', 3000); this.gTurbo = G(0); this.turboO.connect(this.gTurbo); this.gTurbo.connect(this.engGrp);
      this.dopOscs.push(this.turboO);
      if (rich) {
        const tn = SRC(bufs.white); this.turboBp = BQ('bandpass', 3200, 1.0); this.gTurboN = G(0);
        tn.connect(this.turboBp); this.turboBp.connect(this.gTurboN); this.gTurboN.connect(this.engGrp);
      }

      // ---- driveline whines ----
      this.gbxO = OSC('sine', 400); this.gGbx = G(0); this.gbxO.connect(this.gGbx); this.gGbx.connect(this.engGrp);
      this.axO = OSC('sine', 300); this.gAx = G(0); this.axO.connect(this.gAx); this.gAx.connect(this.engGrp);
      this.dopOscs.push(this.gbxO, this.axO);
      if (rich) {
        this.gbxO2 = OSC('sine', 800); this.gGbx2 = G(0); this.gbxO2.connect(this.gGbx2); this.gGbx2.connect(this.engGrp);
        this.axO2 = OSC('sine', 600); this.gAx2 = G(0); this.axO2.connect(this.gAx2); this.gAx2.connect(this.engGrp);
        this.dopOscs.push(this.gbxO2, this.axO2);
      }
      const rS = SRC(bufs.pink); this.retBp = BQ('bandpass', 400, 3.5); this.gRet = G(0);
      rS.connect(this.retBp); this.retBp.connect(this.gRet); this.gRet.connect(this.engGrp);

      // ---- cobbles and wind ----
      this.cobS = SRC(bufs.velvet); this.cobBp = BQ('bandpass', 190, 1.5); this.gCob = G(0);
      this.cobS.connect(this.cobBp); this.cobBp.connect(this.gCob); this.gCob.connect(this.roadGrp);
      if (rich) { this.cobBp2 = BQ('bandpass', 700, 1.2); this.cobS.connect(this.cobBp2); this.cobBp2.connect(this.gCob); }
      const w1 = SRC(bufs.white); this.windBp = BQ('bandpass', 1700, 0.5); this.windHp = BQ('highpass', 450, 0.7); this.gWind = G(0);
      w1.connect(this.windHp); this.windHp.connect(this.windBp); this.windBp.connect(this.gWind); this.gWind.connect(this.roadGrp);

      if (rich) {
        // ---- air compressor (only while the governor is in "load") ----
        this.oComp = node(c.createOscillator()); this.oComp.setPeriodicWave(pw); this.oComp.frequency.value = 12; this.oComp.start();
        const cS = SRC(bufs.white); this.compBp = BQ('bandpass', 1700, 1.4); this.compAm = G(0.35); this.compD = G(0.65); this.gComp = G(0);
        cS.connect(this.compBp); this.compBp.connect(this.compAm); this.compAm.connect(this.gComp); this.oComp.connect(this.compD); this.compD.connect(this.compAm.gain);
        const cT = SRC(bufs.pink); this.compLo = BQ('bandpass', 230, 2); this.compAm2 = G(0.3); this.compD2 = G(0.7);
        cT.connect(this.compLo); this.compLo.connect(this.compAm2); this.compAm2.connect(this.gComp); this.oComp.connect(this.compD2); this.compD2.connect(this.compAm2.gain);
        this.gComp.connect(this.engGrp);
        this.dopOscs.push(this.oComp);

        // ---- interior bed: HVAC / roof AC fans (cab + passenger area only; level set by the zone) ----
        const bS = SRC(bufs.pink); this.bedBp = BQ('bandpass', 650, 0.6); this.gBed = G(0);
        bS.connect(this.bedBp); this.bedBp.connect(this.gBed); this.gBed.connect(this.roadGrp);
        this.bedO = OSC('sine', 143); this.bedO2 = OSC('sine', 286); this.gBedO = G(0);
        this.bedO.connect(this.gBedO); this.bedO2.connect(this.gBedO); this.gBedO.connect(this.roadGrp);
      }
    }

    this.setProfile('man_cng');
    this.z = zoneFor({ zone: 'out', dist: 6 });
    this.boost = 0; this.lastT = 0; this.armed = false; this.lastFlutter = -9;
    this.attached = null;
    this.setListener(0, { zone: 'out', dist: 6 });
  }

  /** Retune the voice for an engine type (EngineProfiles.js); called when the voice changes bus. */
  setProfile(name) {
    if (name === this.profName) return;
    this.profName = name;
    const P = (this.P = engineProfile(name)), c = this.ctx, B = this.B;
    const wave = (k, sl, n, r) => B[k] || (B[k] = firingWave(c, sl, n, r));
    this.oIdle.setPeriodicWave(wave(`waveIdle_${name}`, P.slopes[0], 40, 16));
    this.oLoad.setPeriodicWave(wave(`waveLoad_${name}`, P.slopes[1], 48, 26));
    const t = c.currentTime;
    P.fm.forEach(([f, q, g], i) => {
      this.fm[i].frequency.setValueAtTime(f, t);
      this.fm[i].Q.setValueAtTime(q, t);
      this.fm[i].gain.setValueAtTime(g, t);
    });
    if (this.wobA) this.wobA.gain.setValueAtTime(P.wobble[0], t);
    if (this.wobB) this.wobB.gain.setValueAtTime(P.wobble[1], t);
    if (this.tick) { this.tick.bp.frequency.setValueAtTime(P.tickF, t); this.tick.bp.Q.setValueAtTime(P.tickQ, t); }
  }

  attach(dest) {
    if (this.attached === dest) return;
    if (this.attached) this.out.disconnect();
    this.out.connect(dest);
    this.attached = dest;
  }

  /** Detached voices are not pulled by the audio graph: no CPU. */
  detach() {
    if (!this.attached) return;
    this.out.disconnect();
    this.attached = null;
  }

  /** Fade in after (re)assignment to a bus. */
  fadeIn(t, sec) {
    const g = this.out.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + (sec || 0.2));
    this.boost = 0; this.armed = false;
  }

  /**
   * L: {zone: 'cab'|'cabin'|'out', prox (cabin: 0 front .. 1 at the engine), dist (m), radial (m/s, + approaching),
   * pan -1..1, cull 0..1 (voice gain by distance)}.
   */
  setListener(t, L) {
    const z = (this.z = zoneFor(L));
    this.zoneName = L.zone;
    const tc = 0.06;
    if (this.gBed) {
      setP(this.gBed.gain, dB(z.bed), t, 0.2, 0.01);
      setP(this.gBedO.gain, dB(z.bed - 10), t, 0.2, 0.01);
    }
    setP(this.zHp.frequency, z.hp, t, tc, 0.01);
    z.p.forEach((q, i) => { setP(this.zP[i].frequency, q[0], t, tc, 0.01); setP(this.zP[i].gain, q[1], t, tc, 0.01); setP(this.zP[i].Q, q[2], t, tc, 0.01); });
    setP(this.zLp.frequency, z.lp, t, tc, 0.01);
    setP(this.zGain.gain, dB(z.gain) * (L.cull == null ? 1 : L.cull), t, 0.08, 0.01);
    setP(this.roadGrp.gain, dB(18 + z.road), t, 0.08, 0.01);
    if (this.zPan.pan) setP(this.zPan.pan, clamp(L.pan || 0, -1, 1), t, 0.1, 0.02);
    // Doppler on every oscillator via detune (cents), outside only
    const cents = L.zone === 'out' ? dopplerCents(L.radial) : 0;
    this.doppler = cents;
    for (const o of this.dopOscs) setP(o.detune, cents, t, 0.05, 0.02);
  }

  /** Drive the voice. s: {rpm, load 0..1, speed m/s, retarder 0..1, surface, engineOn, comp bool} */
  setState(t, s) {
    const tc = 0.05, rpm = Math.max(0, s.rpm), load = clamp(s.load, 0, 1), v = Math.abs(s.speed), on = s.engineOn !== false && rpm > 120;
    if (s.profile && s.profile !== this.profName) this.setProfile(s.profile);
    const P = this.P;
    const z = this.z, dt = Math.max(0, t - this.lastT); this.lastT = t;
    const fc = rpm / 120, ff = rpm / 20;
    const setF = (p, f) => setP(p, Math.max(0.5, f), t, tc, 0.001);
    for (const o of this.cycOscs) setF(o.frequency, fc);
    // harmonic weighting by load: crossfade idle-slope wave <-> load-slope wave
    const lw = clamp(load * 1.15, 0, 1);
    setP(this.gIdle.gain, (1 - lw) * 0.9, t, 0.08);
    setP(this.gLoad.gain, lw * 1.0, t, 0.08);
    if (this.gLope) setP(this.gLope.gain, lerp(0.22, 0.07, lw) * (rpm < 900 ? 1.15 : 1) * P.lope, t, 0.1);
    const toneDb = lerp(-4, -3.5, lw) + (rpm < 900 ? 0 : 1.5 * clamp((rpm - 900) / 900, 0, 1)) + P.tone;
    setP(this.engGain.gain, on ? dB(toneDb) : 0, t, 0.06);
    setP(this.fmLp.frequency, 1300 + 2400 * lw, t, 0.1, 0.01);
    setP(this.gIntake.gain, on ? dB(lerp(-21, -10, lw) + P.intake) : 0, t, 0.1);
    setP(this.intakeBp.frequency, lerp(P.intakeF[0], P.intakeF[1], lw), t, 0.1, 0.01);

    // tyres (levels are for 50 km/h = 13.9 m/s)
    const vr = Math.max(v, 0.01), k = clamp(Math.pow(vr / 13.9, 1.35), 0, 3.2), brick = s.surface === 'brick' || s.surface === 'sett' ? 1 : 0;
    setP(this.gTyreLo.gain, dB(-16) * k * (brick ? 0.8 : 1) * clamp(vr / 1.2, 0, 1), t, 0.12);
    setP(this.tyreLoBp.frequency, 250 + 8 * vr, t, 0.15, 0.01);
    setP(this.gTyreHi.gain, dB(-26) * k * (brick ? 0.7 : 1) * clamp(vr / 1.5, 0, 1), t, 0.12);
    setP(this.tyreHiBp.frequency, 900 + 45 * vr, t, 0.15, 0.01);
    if (this.lite) return;

    setF(this.oAM.frequency, ff);
    // combustion roar / tick
    this.roar.bp.frequency.setTargetAtTime(lerp(P.roarF[0], P.roarF[1], lw), t, 0.1);
    setP(this.roar.out.gain, on ? dB(lerp(-21, -12, lw) + P.roar) : 0, t, 0.08);
    // ignition tick (CNG) or injector clatter (diesel: loudest at idle)
    setP(this.tick.out.gain, on ? dB(lerp(-27 + P.tickIdle, -19 + P.tick, lw)) : 0, t, 0.08);
    // turbo (boost lags the pedal: 0.35 s up, 0.9 s down)
    const bt = clamp((load - 0.15) / 0.85, 0, 1) * clamp((rpm - 800) / 700, 0, 1);
    this.boost += (bt - this.boost) * (1 - Math.exp(-dt / (bt > this.boost ? 0.35 : 0.9)));
    const bo = this.boost, spooled = bo > 0.02 ? 1 : 0;
    setF(this.turboO.frequency, lerp(P.turboF[0], P.turboF[1], bo));
    setP(this.gTurbo.gain, on ? dB(-50 + 18 * bo + z.turbo + P.turbo) * spooled : 0, t, 0.05);
    if (this.gTurboN) {
      setP(this.turboBp.frequency, 2400 + 1600 * bo, t, 0.1, 0.01);
      setP(this.gTurboN.gain, on ? dB(-44 + 14 * bo + z.turbo + P.turbo * 0.6) * spooled : 0, t, 0.08);
    }
    if (this.flutterOn) {
      if (bo > 0.5) this.armed = true;
      if (this.armed && bt < 0.1 && t - this.lastFlutter > 2) { this.armed = false; this.lastFlutter = t; Events.turboFlutter(this.ctx, this.engGrp, t, this.B, z.turbo); }
    }
    // gearbox + axle whine
    const drive = clamp(0.35 + load, 0, 1.2);
    const fg = P.gbxOrder * rpm / 60, fa = 13 * 2.064 * v;
    setF(this.gbxO.frequency, fg);
    setP(this.gGbx.gain, on && v > 0.8 ? dB(-46 + z.whine + 6 * (drive - 0.35) + P.gbx) : 0, t, 0.1);
    setF(this.axO.frequency, fa);
    const axAmt = clamp((v - 1.5) / 6, 0, 1);
    setP(this.gAx.gain, dB(-47 + z.whine) * axAmt * (load < 0.05 ? 1.6 : 1), t, 0.1);
    if (this.gbxO2) {
      setF(this.gbxO2.frequency, 2 * fg); setP(this.gGbx2.gain, on && v > 0.8 ? dB(-52 + z.whine + 6 * (drive - 0.35) + P.gbx) : 0, t, 0.1);
      setF(this.axO2.frequency, 2 * fa); setP(this.gAx2.gain, dB(-55 + z.whine) * axAmt, t, 0.1);
    }
    const ret = clamp(s.retarder || 0, 0, 1);
    setP(this.retBp.frequency, 240 + 70 * v, t, 0.1, 0.01);
    setP(this.gRet.gain, dB(-34 + z.whine * 0.5) * Math.pow(ret, 1.2) * clamp(v / 3, 0, 1), t, 0.1);
    // cobbles and wind
    setP(this.cobS.playbackRate, brick ? clamp(vr / 5, 0.15, 5) : 0.0001, t, 0.1, 0.01);
    setP(this.gCob.gain, brick ? dB(-12) * clamp(vr / 8, 0, 1.4) : 0, t, 0.15);
    setP(this.gWind.gain, dB(-33) * Math.pow(vr / 13.9, 2.4) * (vr > 4 ? 1 : 0), t, 0.2);
    setP(this.windBp.frequency, 1200 + 30 * vr, t, 0.2, 0.01);
    // compressor chug
    if (this.oComp) {
      setF(this.oComp.frequency, Math.max(6, rpm / 60 * 0.9));
      setP(this.gComp.gain, s.comp && on ? dB(-34 + z.comp) : 0, t, 0.25);
    }
  }

  /** Torque interruption of a gearbox shift (the clunk is a shot played by the AudioManager). */
  shift(t, up) {
    void up;
    this.dip.gain.cancelScheduledValues(t);
    this.dip.gain.setValueAtTime(1, t);
    this.dip.gain.linearRampToValueAtTime(dB(-5), t + 0.08);
    this.dip.gain.linearRampToValueAtTime(1, t + 0.4);
  }

  dispose() {
    this.detach();
    this.n.forEach((x) => { try { if (x.stop) x.stop(); x.disconnect(); } catch (e) { /* already stopped */ } });
  }
}
