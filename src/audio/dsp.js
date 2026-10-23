// Shared DSP helpers for the bus sound: noise buffers, PeriodicWaves, the five
// listener zones and the pure maths (distance law, Doppler, voice pool, level
// offsets for one-shots, start-up rpm, air governor). Everything that does not
// need an AudioContext is exported separately and unit-tested (tests/audio.test.js).
// Reference implementation and measurements: data/research/audio/ (sound_design.md).

export const dB = (x) => Math.pow(10, x / 20);
export const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-9));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

export function rng(seed) {
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
export function makeBuffers(ctx, seed) {
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
  const pink = loopBuf(7, (x) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < x.length; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    }
  });
  const brown = loopBuf(6, (x) => { let l = 0; for (let i = 0; i < x.length; i++) { l = (l + 0.03 * (R() * 2 - 1)) / 1.03; x[i] = l; } });
  // sparse random impulses (about 70/s at playbackRate 1): cobbles, joints, rattles
  const velvet = loopBuf(4, (x) => { for (let i = 0; i < x.length; i++) if (R() < 70 / sr) x[i] = (R() * 2 - 1) * (0.4 + R()); });
  return { white, pink, brown, velvet };
}

// -------------------------------------------------------------- periodic waves
/**
 * One engine cycle (2 crankshaft revolutions) as a PeriodicWave. The oscillator runs at
 * f_cyc = rpm/120; harmonic 6k is the k-th firing harmonic (firing frequency rpm/20).
 * slope: dB/octave roll-off of the firing harmonics (idle about 7, full load about 4.2).
 */
export function firingWave(ctx, slope, kMax, rolloffK) {
  const H = 6 * kMax, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let k = 1; k <= kMax; k++) re[6 * k] = dB(-slope * Math.log2(k)) * Math.exp(-k / rolloffK); // cos phase: impulse-like pulses
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

/** Cylinder-to-cylinder irregularity: the cycle harmonics that are not multiples of 6 (the lope). */
export function lopeWave(ctx, seed) {
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
export function buzzWave(ctx) {
  const re = new Float32Array(10), im = new Float32Array(10);
  for (let h = 1; h <= 9; h += 2) im[h] = 1 / h;
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

/** Amplitude shaper at the firing rate (harmonics 1..13, weight 1/h^0.7). */
export function pulseWave(ctx) {
  const re = new Float32Array(14), im = new Float32Array(14);
  for (let h = 1; h < 14; h++) re[h] = 1 / Math.pow(h, 0.7);
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// --------------------------------------------------------------- zone presets
/**
 * Listener presets for the engine/road group. hp/lp in Hz; p = [freq, gainDb, Q] peaking filters;
 * gain = dB relative to the "outside, 6 m" reference; road = dB offset of the tyre/road group;
 * turbo/whine/comp = dB offsets of those layers; bed = HVAC bed level in dB.
 */
export const ZONES = {
  cab:     { hp: 40, lp: 900,  p: [[100, 4, 1.2], [260, 6, 1.4], [640, 2, 1.0]], gain: -11.5, road: 0,  turbo: -4, whine: 0,  comp: -10, bed: -43 },
  front:   { hp: 40, lp: 1100, p: [[120, 4, 1.2], [210, 5, 1.5], [520, 2, 1.0]], gain: -11.0, road: 0,  turbo: -4, whine: 0,  comp: -8,  bed: -41 },
  rear:    { hp: 40, lp: 2600, p: [[140, 4, 1.2], [330, 6, 1.5], [820, 4, 1.2]], gain: -7.5,  road: -8, turbo: +4, whine: +5, comp: +6,  bed: -40 },
  outNear: { hp: 45, lp: 6500, p: [[175, 4, 2.2], [420, 3, 1.5], [1500, 1, 1.0]], gain: -7.0,  road: -3, turbo: 0,  whine: 0,  comp: 0,  bed: -99 },
};

// ------------------------------------------------------- outside: distance law
export const REF_DIST = 6; // m: the "outside near" reference distance
/**
 * Engine level vs distance, dB relative to the 6 m reference. The spec's spherical law is
 * -20*log10(d/6); the bus must stay audible from a bus stop while it approaches from far
 * away, so the exponent is the spec's "gameplay tweak" 0.8 (-16 dB per decade) plus 0.012 dB/m of air.
 */
export function distanceGainDb(d) {
  const x = Math.max(d, REF_DIST);
  return -16 * Math.log10(x / REF_DIST) - 0.012 * (x - REF_DIST);
}
/** Same law with the spherical exponent, used for the short pneumatic/beep one-shots (spec 9.2: -14 dB at 30 m). */
export function shotDistanceDb(d) {
  const x = Math.max(d, REF_DIST);
  return -20 * Math.log10(x / REF_DIST) - 0.012 * (x - REF_DIST);
}
/** Low-pass cut-off that closes with distance. */
export function outsideLowpassHz(d) {
  return clamp(6500 * Math.pow(8 / Math.max(d, 8), 0.55), 900, 6500);
}
/** Doppler shift in cents for an approach speed vr (m/s, positive = approaching). */
export function dopplerCents(vr) {
  const v = clamp(vr || 0, -40, 40);
  return 1200 * Math.log2(343 / (343 - v));
}
/** Voice gain 0..1 by distance: others are culled between 120 and 150 m, the focus bus later. */
export function cullGain(d, focus) {
  const a = focus ? 180 : 120, b = focus ? 240 : 150;
  return clamp((b - d) / (b - a), 0, 1);
}
/** Stereo pan from the lateral offset (m, + = right of the listener). */
export function panFor(lateral) {
  return clamp((lateral || 0) / 40, -1, 1);
}

// ---------------------------------------------------- inside: engine proximity
/** Engine centre in the rear section frame (z backwards), spec 6.2. */
export const ENGINE_Z = 2.2;
/** 0 = far from the engine (cab, front door) .. 1 = beside it (rear seats). dEng in metres. */
export function cabinProx(dEng) {
  return clamp(1 - (dEng - 2) / 14, 0, 1);
}

function blend(a, b, p) {
  return {
    hp: lerp(a.hp, b.hp, p), lp: Math.exp(lerp(Math.log(a.lp), Math.log(b.lp), p)), gain: lerp(a.gain, b.gain, p),
    road: lerp(a.road, b.road, p), turbo: lerp(a.turbo, b.turbo, p), whine: lerp(a.whine, b.whine, p),
    comp: lerp(a.comp, b.comp, p), bed: lerp(a.bed, b.bed, p),
    p: a.p.map((q, i) => [lerp(q[0], b.p[i][0], p), lerp(q[1], b.p[i][1], p), lerp(q[2], b.p[i][2], p)]),
  };
}

/**
 * Zone preset for a listener. L = {zone: 'cab'|'cabin'|'out', prox, dist}.
 * 'cabin' blends front and rear by prox; 'out' applies the distance law to outNear.
 */
export function zoneFor(L) {
  if (L.zone === 'cab') return blend(ZONES.cab, ZONES.cab, 0);
  if (L.zone === 'cabin') return blend(ZONES.front, ZONES.rear, clamp(L.prox == null ? 0 : L.prox, 0, 1));
  const d = Math.max(L.dist == null ? REF_DIST : L.dist, 3);
  const z = blend(ZONES.outNear, ZONES.outNear, 0);
  z.gain = ZONES.outNear.gain + distanceGainDb(d);
  z.lp = outsideLowpassHz(d);
  z.p[0] = [z.p[0][0], z.p[0][1] + clamp(d / 30, 0, 3), z.p[0][2]]; // far: the low end carries
  return z;
}

// ---------------------------------------------------------------- voice pool
/**
 * Choose which buses get a synth voice. cands: [{id, dist, focus, interior}]; held: Set of ids that
 * already own a voice (they get a 20 % distance bonus so two equally distant buses do not flap).
 * The interior bus and the focus bus always come first. Returns ids, best first, at most max.
 */
export function selectVoices(cands, max, held) {
  const key = (c) => (c.interior ? -2e9 : c.focus ? -1e9 : c.dist * (held && held.has(c.id) ? 0.8 : 1));
  return cands.slice().sort((a, b) => key(a) - key(b)).slice(0, max).map((c) => c.id);
}

// --------------------------------------------------------------- engine start
/** rpm heard during the first seconds after the engine is switched on (spec 7): crank, catch, flare, settle. */
export function startRpm(t, physRpm) {
  if (t < 0.3) return 0;
  if (t < 1.2) return 40 + 190 * Math.min(1, (t - 0.3) / 0.25);
  if (t < 1.5) return 230 + (920 - 230) * ((t - 1.2) / 0.3);
  return physRpm + 300 * Math.exp(-(t - 1.5) / 0.55);
}
export const START_DURATION = 4;

// ------------------------------------------------------------------ air system
/** Governor of the compressor: cut-in 8.1 bar, cut-out 10 bar. Returns true when the dryer purges. */
export function stepAir(st, dt, { braking, engineOn }) {
  st.pressure -= dt * (braking ? 0.06 : 0.004);
  if (!engineOn) { st.comp = false; return false; }
  if (st.pressure < 8.1) st.comp = true;
  if (st.comp) {
    st.pressure += dt * 0.09;
    if (st.pressure >= 10) { st.comp = false; return true; }
  }
  return false;
}

// ---------------------------------------------------- one-shot level offsets
/** Doors 1 and 2 are in the front section, 3 and 4 in the rear section (BusSpec). */
export const DOOR_SECTION = { 1: 'front', 2: 'front', 3: 'rear', 4: 'rear' };

// [cab, front area, rear area, outside within 8 m], then max audible distance outside (m)
const SHOT = {
  brake:    { v: [0, -4, -10, 0], far: 100 },
  kneel:    { v: [-2, 0, -10, 0], far: 100 },
  purge:    { v: [-20, -14, -4, 0], far: 100 },
  indicator:{ v: [0, -14, -20, -10], far: 8 },
  bump:     { v: [0, 0, 2, -8], far: 20 },
  bellows:  { v: [-12, 0, 0, -10], far: 20 },
  gear:     { v: [0, -6, -4, -8], far: 15 },
  starter:  { v: [-6, -6, 0, 0], far: 100 },
  engine:   { v: [-6, -6, 0, 0], far: 100 },
  crash:    { v: [0, 0, 0, 0], far: 120 },
  bell:     { v: [-3, 0, 0, null], far: 0 },
};
// door-related kinds depend on the source door's section relative to the listener
const DOOR = {
  hiss: { cab1: -2, cabOther: -10, same: 0, other: -8, out: 0, far: 100 },
  beep: { cab: -3, sameFront: 0, sameRear: -3, other: -8, out: -12, far: 80 },
};

/**
 * Level offset (dB) and low-pass for a one-shot heard by the listener, or null if inaudible.
 * L = {zone: 'cab'|'cabin'|'out', prox, section: 'front'|'rear', dist}; o = {door}.
 * kind: doorHiss|doorBeep|brake|kneel|purge|indicator|bump|bellows|gear|starter|engine|crash|bell
 */
export function shotOffsetDb(kind, L, o) {
  o = o || {};
  const out = L.zone === 'out';
  const d = L.dist == null ? REF_DIST : L.dist;
  if (kind === 'doorHiss' || kind === 'doorBeep') {
    const D = kind === 'doorHiss' ? DOOR.hiss : DOOR.beep;
    if (out) return d > D.far ? null : { db: D.out + shotDistanceDb(d), lp: d > 8 ? outsideLowpassHz(d) : 0 };
    if (L.zone === 'cab') return { db: kind === 'doorHiss' ? (o.door === 1 ? D.cab1 : D.cabOther) : D.cab, lp: 0 };
    const sec = o.sec || DOOR_SECTION[o.door] || 'front', same = sec === L.section;
    if (kind === 'doorHiss') return { db: same ? D.same : D.other, lp: same ? 0 : 2500 };
    return { db: same ? (L.section === 'front' ? D.sameFront : D.sameRear) : D.other, lp: same ? 0 : 2500 };
  }
  const S = SHOT[kind];
  if (!S) return { db: 0, lp: 0 };
  if (out) {
    if (S.v[3] == null || d > S.far) return null;
    return { db: S.v[3] + shotDistanceDb(d), lp: d > 8 ? outsideLowpassHz(d) : 0 };
  }
  if (L.zone === 'cab') return { db: S.v[0], lp: 0 };
  const p = clamp(L.prox == null ? (L.section === 'rear' ? 1 : 0) : L.prox, 0, 1);
  return { db: lerp(S.v[1], S.v[2], p), lp: 0 };
}

/** Settings of the quality presets that matter to the sound (CPU budget on phones). */
export function audioProfile(quality) {
  switch (quality) {
    case 'low': return { maxVoices: 2, flutter: false, slim: true, rate: 12 };
    case 'balanced': return { maxVoices: 3, flutter: false, slim: false, rate: 16 };
    default: return { maxVoices: 3, flutter: true, slim: false, rate: 20 };
  }
}
