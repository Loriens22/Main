// One synthesised tram, same interface as BusVoice (pooled by the AudioManager, positioned by GameAudio):
//   traction: gear mesh whine (rises with speed, louder under power and electric braking), the motor's own
//     sound — the Schindler's chopper hum at a fixed pitch, the T6M's DC motor rumble — and the auxiliary
//     converter / motor-generator hum while the main switch is on;
//   rail: rolling noise of steel wheels on steel rails (darker on street track in a concrete slab), the
//     "da-dum" of every bogie over each rail joint of the ballasted track, flange squeal in tight curves and
//     the friction brake squeal in the last metres before the stop.
// Profiles: 'tram_schindler', 'tram_t6m'. Inputs per frame (GameAudio): speed, load (power), brake, curv
// (1/m), street (bool), engineOn (main switch), bogies (distances from the front, m), travel (distance run, m).
import { dB, clamp, zoneFor, dopplerCents } from './dsp.js';

function setP(p, v, t, tc, eps) {
  if (!Number.isFinite(v)) return;
  const l = p._l;
  if (l !== undefined && Math.abs(v - l) <= 1e-5 + (eps == null ? 0.004 : eps) * Math.abs(v)) return;
  p._l = v;
  p.setTargetAtTime(v, t, tc);
}

export const TRAM_PROFILES = {
  // GTO chopper control (Siemens/BBC equipment of 1990): a steady whine under power and in electric braking
  tram_schindler: { chopper: 330, chopGain: -30, rumble: -60, mesh: 17, meshGain: -38, aux: 3900, auxGain: -48, mg: 0, joints: 1, squeal: 3900 },
  // resistance control and series DC motors: no electronic whine, a motor rumble and louder gears; the
  // motor-generator hums while the main switch is on
  tram_t6m: { chopper: 0, chopGain: -90, rumble: -40, mesh: 15, meshGain: -35, aux: 0, auxGain: -90, mg: 100, joints: 1.25, squeal: 3400 },
};
const RATIO = 6.9, R = 0.33, RAIL = 12.5; // gear ratio, wheel radius, rail length between joints

export class TramVoice {
  constructor(ctx, bufs, opt = {}) {
    const c = (this.ctx = ctx);
    this.B = bufs;
    this.lite = !!opt.lite;
    this.isTram = true;
    this.n = [];
    const node = (x) => { this.n.push(x); return x; };
    const G = (v) => { const g = node(c.createGain()); g.gain.value = v == null ? 0 : v; return g; };
    const BQ = (type, f, q) => { const b = node(c.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return b; };
    const SRC = (buf, rate) => { const s = node(c.createBufferSource()); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.start(0, Math.random() * 3); return s; };
    const OSC = (type, f) => { const o = node(c.createOscillator()); o.type = type; o.frequency.value = f; o.start(); return o; };
    this.dopOscs = [];
    // zone chain (as BusVoice)
    this.zIn = G(1);
    this.zHp = BQ('highpass', 40, 0.7);
    this.zP = [BQ('peaking', 100, 1), BQ('peaking', 250, 1), BQ('peaking', 600, 1)];
    this.zLp = BQ('lowpass', 6000, 0.6);
    this.zGain = G(1);
    this.zPan = node(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    this.out = G(1);
    this.zIn.connect(this.zHp); this.zHp.connect(this.zP[0]); this.zP[0].connect(this.zP[1]); this.zP[1].connect(this.zP[2]); this.zP[2].connect(this.zLp);
    this.zLp.connect(this.zGain); this.zGain.connect(this.zPan); this.zPan.connect(this.out);
    this.engGrp = G(dB(20)); this.engGrp.connect(this.zIn);
    this.roadGrp = G(dB(27)); this.roadGrp.connect(this.zIn);
    // gear mesh whine (two partials) and motor
    this.mesh = OSC('sine', 300); this.gMesh = G(0); this.mesh.connect(this.gMesh); this.gMesh.connect(this.engGrp);
    this.mesh2 = OSC('sine', 600); this.gMesh2 = G(0); this.mesh2.connect(this.gMesh2); this.gMesh2.connect(this.engGrp);
    this.dopOscs.push(this.mesh, this.mesh2);
    this.rumO = OSC('sawtooth', 120); this.rumLp = BQ('lowpass', 700, 0.9); this.gRum = G(0);
    this.rumO.connect(this.rumLp); this.rumLp.connect(this.gRum); this.gRum.connect(this.engGrp);
    this.dopOscs.push(this.rumO);
    // rolling noise: low roar and the brighter rail hiss
    const n1 = SRC(bufs.pink); this.rollLo = BQ('bandpass', 380, 0.8); this.gRollLo = G(0);
    n1.connect(this.rollLo); this.rollLo.connect(this.gRollLo); this.gRollLo.connect(this.roadGrp);
    const n2 = SRC(bufs.white); this.rollHi = BQ('bandpass', 1900, 0.9); this.gRollHi = G(0);
    n2.connect(this.rollHi); this.rollHi.connect(this.gRollHi); this.gRollHi.connect(this.roadGrp);
    if (!this.lite) {
      // chopper / converter whines
      this.chop = OSC('triangle', 330); this.chopBp = BQ('bandpass', 660, 3); this.gChop = G(0);
      this.chop.connect(this.chopBp); this.chopBp.connect(this.gChop); this.gChop.connect(this.engGrp);
      this.aux = OSC('sine', 3900); this.gAux = G(0); this.aux.connect(this.gAux); this.gAux.connect(this.engGrp);
      this.mgO = OSC('sawtooth', 100); this.mgLp = BQ('lowpass', 400, 1); this.gMg = G(0);
      this.mgO.connect(this.mgLp); this.mgLp.connect(this.gMg); this.gMg.connect(this.engGrp);
      this.dopOscs.push(this.chop, this.aux, this.mgO);
      // flange squeal (two partials with a tremolo) and the brake squeal
      // the tremolo has its own stage (1 +- 0.35) ahead of the level, so a silent squeal stays silent
      this.sq = OSC('sine', 3900); this.sq2 = OSC('sine', 7650); this.sqAm = G(1); this.gSq = G(0);
      this.trem = OSC('sine', 6.5); this.tremG = G(0.35); this.trem.connect(this.tremG); this.tremG.connect(this.sqAm.gain);
      this.sq.connect(this.sqAm); this.sq2.connect(this.sqAm); this.sqAm.connect(this.gSq); this.gSq.connect(this.roadGrp);
      this.bk = OSC('sine', 2750); this.gBk = G(0); this.bk.connect(this.gBk); this.gBk.connect(this.roadGrp);
      this.dopOscs.push(this.sq, this.sq2, this.bk);
    }
    this.P = TRAM_PROFILES.tram_schindler;
    this.prof = 'tram_schindler';
    this.z = zoneFor({ zone: 'out', dist: 6 });
    this.lastDist = null;
    this.attached = null;
    this.setListener(0, { zone: 'out', dist: 6 });
  }

  setProfile(name) {
    if (name === this.prof || !TRAM_PROFILES[name]) return;
    this.prof = name;
    this.P = TRAM_PROFILES[name];
  }

  attach(dest) {
    if (this.attached === dest) return;
    if (this.attached) this.out.disconnect();
    this.out.connect(dest);
    this.attached = dest;
  }

  detach() {
    if (!this.attached) return;
    this.out.disconnect();
    this.attached = null;
  }

  fadeIn(t, sec) {
    const g = this.out.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + (sec || 0.2));
    this.lastDist = null;
  }

  setListener(t, L) {
    const z = (this.z = zoneFor(L));
    const tc = 0.06;
    setP(this.zHp.frequency, z.hp, t, tc, 0.01);
    z.p.forEach((q, i) => { setP(this.zP[i].frequency, q[0], t, tc, 0.01); setP(this.zP[i].gain, q[1], t, tc, 0.01); setP(this.zP[i].Q, q[2], t, tc, 0.01); });
    setP(this.zLp.frequency, z.lp, t, tc, 0.01);
    setP(this.zGain.gain, dB(z.gain) * (L.cull == null ? 1 : L.cull), t, 0.08, 0.01);
    setP(this.roadGrp.gain, dB(27 + z.road), t, 0.08, 0.01);
    if (this.zPan.pan) setP(this.zPan.pan, clamp(L.pan || 0, -1, 1), t, 0.1, 0.02);
    const cents = L.zone === 'out' ? dopplerCents(L.radial) : 0;
    for (const o of this.dopOscs) setP(o.detune, cents, t, 0.05, 0.02);
  }

  setState(t, s) {
    if (s.profile) this.setProfile(s.profile);
    const P = this.P, z = this.z, tc = 0.06;
    const v = Math.abs(s.speed || 0), load = clamp(s.load || 0, 0, 1), brake = clamp(s.brake || 0, 0, 1.5), on = s.engineOn !== false;
    const motorRps = (v / R) * RATIO / (2 * Math.PI);
    const work = Math.max(load, Math.min(1, brake) * (v > 2 ? 0.8 : 0)); // electric braking loads the motors too
    // gear mesh
    const fm = Math.max(1, motorRps * P.mesh);
    setP(this.mesh.frequency, fm, t, tc, 0.002);
    setP(this.mesh2.frequency, fm * 2, t, tc, 0.002);
    const meshAmt = clamp((v - 0.6) / 4, 0, 1);
    setP(this.gMesh.gain, dB(P.meshGain + z.whine + 7 * work) * meshAmt, t, 0.1);
    setP(this.gMesh2.gain, dB(P.meshGain - 8 + z.whine + 6 * work) * meshAmt, t, 0.1);
    // DC motor (T6M): the slot / commutator hum follows the motor speed (above 120 Hz from ~15 km/h)
    setP(this.rumO.frequency, Math.max(20, motorRps * 6), t, tc, 0.01);
    setP(this.gRum.gain, dB(P.rumble - 4 + 9 * work) * clamp(v / 2, 0, 1), t, 0.1);
    // rolling noise (levels for 40 km/h); the concrete slab of street track is darker and quieter
    const k = clamp(Math.pow(Math.max(v, 0.01) / 11, 1.4), 0, 3), street = s.street ? 1 : 0;
    setP(this.gRollLo.gain, dB(-15 - street * 2) * k * clamp(v / 1.0, 0, 1), t, 0.12);
    setP(this.rollLo.frequency, 280 + 14 * v, t, 0.15, 0.01);
    setP(this.gRollHi.gain, dB(-24 - street * 5) * k * clamp(v / 1.5, 0, 1), t, 0.12);
    setP(this.rollHi.frequency, 1400 + 70 * v, t, 0.15, 0.01);
    // rail joints of the ballasted track: every bogie, both axles
    if (s.travel != null) {
      if (this.lastDist != null && !street && v > 0.8) {
        const a = Math.floor(this.lastDist / RAIL), b = Math.floor(s.travel / RAIL);
        if (b !== a && Math.abs(s.travel - this.lastDist) < 30) this.joint(t, v, s.bogies || [3, 10], s.wb || 1.8);
      }
      this.lastDist = s.travel;
    }
    if (this.lite) return;
    // chopper (Schindler): steady pitch, level with the motor current
    setP(this.chop.frequency, P.chopper || 1, t, tc);
    setP(this.gChop.gain, P.chopper ? dB(P.chopGain + 14 * work) * (work > 0.05 ? 1 : 0) : 0, t, 0.08);
    setP(this.gAux.gain, on && P.aux ? dB(P.auxGain + z.whine * 0.5) : 0, t, 0.3);
    setP(this.aux.frequency, P.aux || 1, t, 0.3);
    setP(this.gMg.gain, on && P.mg ? dB(-44 + z.whine * 0.4) : 0, t, 0.4);
    setP(this.mgO.frequency, P.mg || 1, t, 0.3);
    // flange squeal above ~1/60 m curvature
    const sqAmt = clamp((Math.abs(s.curv || 0) - 1 / 60) * 60, 0, 1) * clamp((v - 1.5) / 3, 0, 1) * clamp((9 - v) / 3 + 0.4, 0.2, 1);
    setP(this.sq.frequency, P.squeal + 120 * Math.sin(t * 0.7), t, 0.2);
    setP(this.sq2.frequency, P.squeal * 1.96, t, 0.2);
    setP(this.gSq.gain, dB(-30) * sqAmt, t, 0.15);
    // friction brake squeal as the tram comes to a stop
    const bkAmt = brake > 0.25 && v > 0.15 && v < 2.2 ? clamp((2.2 - v) / 1.2, 0, 1) : 0;
    setP(this.gBk.gain, dB(-38) * bkAmt, t, 0.1);
  }

  /** "da-dum": the two axles of every bogie over a joint, in order from the front. */
  joint(t, v, bogies, wb) {
    const c = this.ctx, B = this.B;
    for (const d of bogies) {
      for (const ax of [-wb / 2, wb / 2]) {
        const when = t + Math.max(0, d + ax) / Math.max(v, 0.5);
        if (when - t > 4) continue;
        const src = c.createBufferSource();
        src.buffer = B.white;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 230 + Math.random() * 60;
        bp.Q.value = 1.4;
        const g = c.createGain();
        const amp = dB(-6) * clamp(v / 8, 0.3, 1.4) * this.P.joints;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp, when + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, when + 0.09);
        src.connect(bp); bp.connect(g); g.connect(this.roadGrp);
        src.start(when, Math.random() * 2, 0.12);
      }
    }
  }

  shift() {}

  dispose() {
    this.detach();
    this.n.forEach((x) => { try { if (x.stop) x.stop(); x.disconnect(); } catch (e) { /* already stopped */ } });
  }
}

