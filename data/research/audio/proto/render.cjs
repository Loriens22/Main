// Offline renderer + analyser for BusSynthProto.js (headless Chromium, OfflineAudioContext).
//   node render.cjs [outdir]    -> writes previews/*.wav and prints a metrics table
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '..', 'previews');
const SR = 24000;

// ---------- mini drivetrain sim (same constants as src/vehicle/ArticulatedBus.js) ----------
const GEARS = [3.364, 1.909, 1.421, 1.0, 0.72, 0.615], FINAL = 6.2, WR = 0.478, IDLE = 620;
function simRun(segs, dt = 0.05) {
  // segs: [{t, thr, brake}] piecewise-constant controls; returns array of states per dt
  let v = 0, gear = 1, rpm = IDLE, shiftT = 0; const out = [], shifts = [];
  const T = segs[segs.length - 1].t;
  for (let t = 0; t < T; t += dt) {
    const seg = [...segs].reverse().find((s) => s.t <= t) || segs[0];
    const thr = seg.thr, brake = seg.brake;
    const ratio = GEARS[gear - 1], wheelRpm = v / WR * 60 / (2 * Math.PI), locked = wheelRpm * ratio * FINAL;
    const lockup = gear >= 2 && locked > 1000, stall = IDLE + thr * 1150;
    let target = lockup ? Math.max(IDLE, locked) : Math.max(locked, stall);
    if (shiftT > 0) target = Math.max(IDLE, target * 0.85);
    rpm += (target - rpm) * Math.min(1, dt * 6);
    shiftT = Math.max(0, shiftT - dt);
    if (shiftT <= 0 && gear < 6 && locked > 1250 + thr * 650 && thr > 0.02) { gear++; shiftT = 0.45; shifts.push({ t, up: true }); }
    else if (shiftT <= 0 && gear > 1 && locked < 820 + thr * 350) { gear--; shiftT = 0.35; shifts.push({ t, up: false }); }
    const maxA = 1.25 * Math.max(0.15, 1 - v / 17);
    const ret = v > 1.5 ? Math.min(1, brake / 0.25) : 0;
    let a = thr * maxA * (shiftT > 0 ? 0.4 : 1) - brake * 2.6 - 0.03 - 0.0012 * v * v;
    if (v <= 0.02 && a < 0) a = 0;
    v = Math.max(0, v + a * dt);
    const load = thr * (lockup ? 1 : 0.8);
    out.push({ t, rpm, load: v < 0.05 && thr < 0.02 ? 0.03 : load, speed: v, retarder: ret, gear, brake, comp: false });
  }
  return { states: out, shifts };
}

const html = '<!doctype html><meta charset=utf-8><body>';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html);
  await p.addScriptTag({ path: path.join(__dirname, 'BusSynthProto.js') });
  p.on('console', (m) => console.log('[page]', m.text()));
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));

  async function render(spec) {
    return p.evaluate(async ({ spec, SR }) => {
      const dur = spec.dur, ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
      const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
      const B = BusSynth.makeBuffers(ctx, 11);
      const voices = [];
      const v = new BusSynth.BusVoice(ctx, master, B); voices.push(v);
      for (const e of spec.timeline) {
        if (e.listener) v.setListener(e.t, e.listener);
        if (e.state) v.setState(e.t, e.state);
        if (e.shift) v.shift(e.t, e.shift.up);
      }
      for (const e of spec.shots || []) {
        const k = e.k || 0, E = BusSynth.Events;
        const dest = e.dest === 'master' ? master : v.zIn;
        if (e.type === 'doorOpen') E.doorOpen(ctx, dest, e.t, B, k);
        else if (e.type === 'doorBeeps') E.doorBeeps(ctx, dest, e.t, k, e.f);
        else if (e.type === 'doorClose') E.doorClose(ctx, dest, e.t, B, k);
        else if (e.type === 'stopBell') E.stopBell(ctx, dest, e.t, B, k);
        else if (e.type === 'brakeRelease') E.brakeRelease(ctx, dest, e.t, B, k);
        else if (e.type === 'parkingRelease') E.parkingRelease(ctx, dest, e.t, B, k);
        else if (e.type === 'kneelDown') E.kneelDown(ctx, dest, e.t, B, k);
        else if (e.type === 'kneelUp') E.kneelUp(ctx, dest, e.t, B, k);
        else if (e.type === 'dryerPurge') E.dryerPurge(ctx, dest, e.t, B, k);
        else if (e.type === 'indicator') E.indicator(ctx, dest, e.t, B, e.on, k);
        else if (e.type === 'gearSelect') E.gearSelect(ctx, dest, e.t, B, k);
        else if (e.type === 'bump') E.bump(ctx, dest, e.t, B, { k, v: e.v, big: e.big });
        else if (e.type === 'starter') E.starter(ctx, dest, e.t, B, k);
      }
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      const u8 = new Uint8Array(d.buffer.slice(0));
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(s);
    }, { spec, SR });
  }

  // ---------- analysis ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  function metrics(x, t0, t1) {
    const a = Math.floor(t0 * SR), b = Math.min(x.length, Math.floor(t1 * SR));
    const seg = x.slice(a, b), N = 8192; let eAll = 0, ePhone = 0, e120 = 0; const edges = [0, 100, 250, 500, 1000, 2000, 4000, 16001], be = new Array(7).fill(0);
    let pk = 0, s2 = 0; for (const v of seg) { s2 += v * v; pk = Math.max(pk, Math.abs(v)); }
    const rms = Math.sqrt(s2 / seg.length);
    // average periodogram
    const re = new Float64Array(N), im = new Float64Array(N); let cnt = 0; const P = new Float64Array(N / 2);
    for (let o = 0; o + N <= seg.length; o += N / 2) {
      for (let i = 0; i < N; i++) { re[i] = seg[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
      fft(re, im); for (let k = 1; k < N / 2; k++) P[k] += re[k] ** 2 + im[k] ** 2; cnt++;
    }
    for (let k = 1; k < N / 2; k++) {
      const f = k * SR / N, p = P[k] / Math.max(cnt, 1); eAll += p; const r = f / 250, h = (r * r) / Math.sqrt(1 + r ** 4); ePhone += p * h * h; if (f >= 120) e120 += p;
      for (let q = 0; q < 7; q++) if (f >= edges[q] && f < edges[q + 1]) { be[q] += p; break; }
    }
    const sc = rms / Math.sqrt(eAll || 1);
    return { rms: db(rms), peak: db(pk), phone: db(sc * Math.sqrt(ePhone)), above120: Math.round(100 * e120 / eAll), bands: be.map((v) => Math.round(100 * v / eAll)).join('/') };
  }
  function writeWav(name, x, gainDb) {
    const g = Math.pow(10, (gainDb || 0) / 20), buf = Buffer.alloc(44 + x.length * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * g * 32767))), 44 + i * 2);
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), buf);
  }
  const decode = (b64) => { const bb = Buffer.from(b64, 'base64'); return new Float32Array(bb.buffer, bb.byteOffset, bb.length / 4); };

  // ---------- scenarios ----------
  // drive profile: idle 3 s, pull away (thr .7) to ~40 km/h, cruise (thr .3) at ~50, brake w/ retarder to stop, idle
  const profile = simRun([
    { t: 0, thr: 0, brake: 0.3 }, { t: 3, thr: 0.7, brake: 0 }, { t: 11, thr: 0.25, brake: 0 }, { t: 17, thr: 0, brake: 0.0 },
    { t: 18, thr: 0, brake: 0.22 }, { t: 22, thr: 0, brake: 0.5 }, { t: 24.5, thr: 0, brake: 0.3 }, { t: 26, thr: 0, brake: 0.3 },
  ]);
  const DUR = 26;
  function timelineFor(listener, extraListener) {
    const tl = [{ t: 0, listener }];
    for (const s of profile.states) tl.push({ t: s.t, state: { rpm: s.rpm, load: s.load, speed: s.speed, retarder: s.retarder, surface: 'asphalt', engineOn: true, comp: s.t > 20 && s.t < 25 } });
    for (const sh of profile.shifts) tl.push({ t: sh.t, shift: { up: sh.up } });
    if (extraListener) tl.push(...extraListener);
    return tl;
  }
  const results = {};
  async function run(name, listener, win, opts) {
    opts = opts || {};
    const x = decode(await render({ dur: DUR, timeline: timelineFor(listener, opts.extra), shots: opts.shots }));
    writeWav(name + '.wav', x, opts.gain || 0);
    results[name] = {};
    for (const [wn, [a, c]] of Object.entries(win)) results[name][wn] = metrics(x, a, c);
    return x;
  }
  const W = { idle: [1, 3], pullaway: [4, 10], cruise: [12.5, 16.5], brake: [19, 22], stopped: [24.8, 26], all: [0, 26] };
  const KEEP = new Set(['drive_cab', 'drive_front', 'drive_rear', 'drive_out6']); // only these are saved as preview WAVs
  for (const [name, L] of Object.entries({
    cab: { zone: 'cab' }, front: { zone: 'cabin', prox: 0 }, mid: { zone: 'cabin', prox: 0.5 }, rear: { zone: 'cabin', prox: 1 },
    out6: { zone: 'out', dist: 6 }, out30: { zone: 'out', dist: 30 }, out80: { zone: 'out', dist: 80 },
  })) {
    const x = decode(await render({ dur: DUR, timeline: timelineFor(L) }));
    if (KEEP.has('drive_' + name)) writeWav('drive_' + name + '.wav', x);
    results['drive_' + name] = {};
    for (const [wn, [a, c]] of Object.entries(W)) results['drive_' + name][wn] = metrics(x, a, c);
  }
  // pass-by: listener 10 m off the road, bus at 12 m/s, x from -85 m to +85 m
  {
    const tl = [{ t: 0, state: { rpm: 1250, load: 0.3, speed: 12, retarder: 0, surface: 'asphalt', engineOn: true } }];
    for (let t = 0; t < 14; t += 0.05) { const x = -85 + 12 * t, d = Math.hypot(x, 10); tl.push({ t, listener: { zone: 'out', dist: d, radial: 12 * (-x) / d, pan: Math.max(-1, Math.min(1, x / 40)) } }); }
    const xx = decode(await render({ dur: 14, timeline: tl }));
    writeWav('passby_12ms.wav', xx);
    results.passby = { far_approach: metrics(xx, 0, 2), near: metrics(xx, 6, 8), far_leave: metrics(xx, 12, 14) };
  }
  // engine start (rear passenger area) then idle
  {
    const tl = [{ t: 0, listener: { zone: 'cabin', prox: 1 } }, { t: 0, state: { rpm: 0, load: 0, speed: 0, engineOn: false } }];
    const R = (t, rpm) => tl.push({ t, state: { rpm, load: 0.05, speed: 0, surface: 'asphalt', engineOn: true } });
    for (let t = 0.3; t < 1.2; t += 0.05) R(t, 40 + 190 * Math.min(1, (t - 0.3) / 0.25));       // cranking ~230 rpm
    for (let t = 1.2; t < 1.5; t += 0.05) R(t, 230 + (920 - 230) * ((t - 1.2) / 0.3));            // catches, flares
    for (let t = 1.5; t < 4; t += 0.05) R(t, 620 + 300 * Math.exp(-(t - 1.5) / 0.55));            // settles to 620
    const xx = decode(await render({ dur: 5, timeline: tl, shots: [{ type: 'starter', t: 0.3, k: 0 }] }));
    writeWav('engine_start_rear.wav', xx);
    results.start = { crank: metrics(xx, 0.4, 1.1), settle: metrics(xx, 3, 4.8) };
  }
  // all one-shots in sequence (dest = master => 'outside near' level; add the zone offset when integrating)
  {
    const seq = []; let t = 0.2; const add = (type, dt, extra) => { seq.push({ type, t, dest: 'master', ...(extra || {}) }); t += dt; };
    const marks = {};
    marks.door_open = t; add('doorOpen', 1.9);
    marks.door_beeps_close = t; add('doorBeeps', 0.95, { k: 0 }); add('doorClose', 2.4);
    marks.stop_bell = t; add('stopBell', 1.6);
    marks.brake_release = t; add('brakeRelease', 1.0);
    marks.parking_release = t; add('parkingRelease', 1.6);
    marks.kneel_down = t; add('kneelDown', 1.8); marks.kneel_up = t; add('kneelUp', 2.6);
    marks.purge = t; add('dryerPurge', 2.4);
    marks.indicator = t; for (let i = 0; i < 6; i++) add('indicator', 0.333, { on: i % 2 === 0 }); t += 0.5;
    marks.bump = t; add('bump', 1.2, { v: 9 }); add('bump', 1.8, { v: 9, big: true });
    marks.gear_select = t; add('gearSelect', 0.8);
    marks.starter = t; add('starter', 1.6);
    const dur = Math.ceil(t + 0.5);
    const xx = decode(await render({ dur, timeline: [{ t: 0, state: { rpm: 0, load: 0, speed: 0, engineOn: false } }, { t: 0, listener: { zone: 'out', dist: 6 } }], shots: seq }));
    writeWav('oneshots_sequence.wav', xx);
    results.shots = {}; const keys = Object.keys(marks);
    keys.forEach((k, i) => { const a = marks[k], c = i + 1 < keys.length ? marks[keys[i + 1]] : dur; results.shots[k] = { start: +a.toFixed(2), ...metrics(xx, a, c) }; });
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(results, null, 1));
  console.log('written', OUT);
  await b.close();
})();
