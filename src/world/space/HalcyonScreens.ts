import * as THREE from 'three';
import { ScreenSurface, scr } from '../../render/ScreenSurface';
import type { Model } from '../../render/Assets';
import { ASTERION, asterionHZ } from '../../space/Asterion';
import type { OrbitZone } from './OrbitZone';
import type { PlatformZone } from './PlatformZone';

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, W: number, H: number) => void;
const C = { ink: '#cfe9e6', dim: 'rgba(207,233,230,0.5)', line: 'rgba(160,220,215,0.35)', amber: '#f0b34a', red: '#ff5a43', green: '#5fe08a', cyan: '#7fd6cf', blue: '#5aa7ff', white: '#f4f6f6', pink: '#ff8ea0' };

/** star field for the maps: fixed pseudo-random positions */
const STARS = Array.from({ length: 140 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12345.678;
  return { x: a - Math.floor(a), y: b - Math.floor(b), m: (i * 7) % 5 };
});

/**
 * Live content for the Meridian platform's and the Halcyon's displays, drawn from the simulation: where the ship
 * is and what holds it, the field rings' standby, the target system (4.24 ly, the binary pair, four planets),
 * power, life support, the hibernation capsules, the pods, hatches and airlocks.
 */
export class HalcyonScreens {
  private list: { s: ScreenSurface; pos: THREE.Vector3 }[] = [];
  private t = 0;
  private cam = new THREE.Vector3();
  private hist = new Map<string, number[]>();

  constructor(private zone: PlatformZone) {}

  private get o() { return this.zone.game.zones.get('orbit') as OrbitZone; }

  build(...models: Model[]) {
    for (const m of models) for (const mk of m.ofKind('screen')) {
      const d = this.pick(mk.id);
      const big = mk.data.w > 1.2;
      const s = new ScreenSurface(mk.node, mk.data.w, mk.data.h, d, big ? 1024 : 448, big ? 1.2 : 1.4);
      s.interval = big ? 0.3 : 0.45;
      this.list.push({ s, pos: mk.node.getWorldPosition(new THREE.Vector3()) });
    }
  }

  update(dt: number) {
    this.t += dt;
    this.zone.game.renderer.camera.getWorldPosition(this.cam);
    for (const e of this.list) e.s.update(dt, e.pos.distanceTo(this.cam) < 16);
  }

  private pick(id: string): Draw {
    const P = (title: string, series: [string, number, number][]) => (c: Ctx, W: number, H: number) => this.plots(c, W, H, title, series, id);
    if (id === 'astro_map') return (c, W, H) => this.starmap(c, W, H);
    if (id === 'astro_l' || id === 'hall_map') return (c, W, H) => this.system(c, W, H);
    if (id === 'astro_r') return (c, W, H) => this.planets(c, W, H);
    if (id.startsWith('astro_c')) return (c, W, H) => this.route(c, W, H);
    if (id === 'warp_wall') return (c, W, H) => this.field(c, W, H);
    if (id.startsWith('ring_fwd') || id === 'ring_a' || id === 'gal_ring') return (c, W, H) => this.ring(c, W, H, 'A · FORWARD', id);
    if (id.startsWith('ring_aft') || id === 'ring_b') return (c, W, H) => this.ring(c, W, H, 'B · AFT', id);
    if (id.startsWith('br_pilot') || id.startsWith('br_copilot') || id.startsWith('br_rear1') || id.startsWith('br_arm')) {
      return id.endsWith('_b') || id === 'br_arm_r' ? (c, W, H) => this.attitude(c, W, H) : (c, W, H) => this.flight(c, W, H);
    }
    if (id === 'br_rear0' || id.startsWith('br_nav')) return (c, W, H) => this.route(c, W, H);
    if (id === 'br_rear2' || id.startsWith('br_eng') || id.startsWith('eng_master')) return (c, W, H) => this.power(c, W, H);
    if (id.startsWith('eng_')) return P('PUMPS · COOLANT', [['PRIMARY LOOP kPa', 412, 1.2], ['SECONDARY LOOP kPa', 388, 1.0], ['CORE INLET K', 291, 0.2], ['RADIATOR OUT K', 268, 0.3]]);
    if (id.startsWith('cryo')) return (c, W, H) => this.vitals(c, W, H, id);
    if (id === 'med_vitals') return (c, W, H) => this.vitals(c, W, H, id);
    if (id.startsWith('podctl') || /^pod\d$/.test(id)) return (c, W, H) => this.pods(c, W, H, id);
    if (id === 'ls_status' || id === 'mess_wall') return P('LIFE SUPPORT', [['CABIN kPa', 101.3, 0.06], ['O₂ PARTIAL kPa', 21.1, 0.04], ['CO₂ kPa', 0.28, 0.01], ['WATER RECOVERY %', 94.2, 0.1]]);
    if (id.startsWith('cabin')) return P('CREW · PERSONAL', [['CABIN °C', 21.6, 0.05], ['HUMIDITY %', 41, 0.2], ['LIGHT CYCLE h', 14.0, 0], ['MESSAGES', 3, 0]]);
    if (id.startsWith('laba') || id.startsWith('sensing')) return P('SPECTROMETRY', [['DETECTOR K', 77.2, 0.03], ['SIGNAL counts/s', 1420, 18], ['BASELINE', 0.94, 0.01], ['SAMPLES LOGGED', 0, 0]]);
    if (id === 'lock_status' || id.startsWith('lock_')) return (c, W, H) => this.airlock(c, W, H);
    if (id === 'vest_deck' || id.startsWith('trf')) return (c, W, H) => this.berth(c, W, H);
    if (id.startsWith('ops') || id === 'jun_wall' || id.startsWith('jun_fwd') || id.startsWith('gw')) return id.startsWith('gw') ? (c, W, H) => this.airlock(c, W, H) : (c, W, H) => this.yard(c, W, H);
    return P('SHIP STATUS', [['MAIN BUS A V', 270, 0.3], ['MAIN BUS B V', 269, 0.3], ['CABIN kPa', 101.3, 0.05], ['FIELD STANDBY %', 3.0, 0.05]]);
  }

  // ------------------------------------------------------------------------------------------- helpers
  private head(ctx: Ctx, W: number, title: string, s = 1) {
    scr.text(ctx, title, 14 * s, 18 * s, 13 * s, C.amber, 'left', '600');
    const t = this.o?.met ?? 0, pad = (x: number) => String(Math.floor(x)).padStart(2, '0');
    scr.mono(ctx, `MET ${pad(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)}`, W - 14 * s, 18 * s, 11 * s, C.dim, 'right');
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10 * s, 32 * s); ctx.lineTo(W - 10 * s, 32 * s); ctx.stroke();
  }

  private rows(ctx: Ctx, x: number, y: number, w: number, s: number, rows: [string, string, string?][], dy = 22) {
    rows.forEach(([k, v, col], i) => {
      scr.text(ctx, k, x, y + i * dy * s, 11 * s, C.dim);
      scr.mono(ctx, v, x + w, y + i * dy * s, 13 * s, col ?? C.ink, 'right');
    });
  }

  private plots(ctx: Ctx, W: number, H: number, title: string, series: [string, number, number][], id: string) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, title, s);
    const top = 42 * s, rh = (H - top - 8 * s) / series.length;
    series.forEach(([label, v0, noise], k) => {
      const key = `${id}:${k}`;
      const h = this.hist.get(key) ?? [];
      const v = v0 + (noise ? (Math.sin(this.t * 0.7 + k * 1.3) * 0.5 + (Math.random() - 0.5)) * noise : 0);
      h.push(v); if (h.length > 60) h.shift();
      this.hist.set(key, h);
      const y = top + k * rh;
      scr.text(ctx, label, 14 * s, y + 12 * s, 11 * s, C.dim);
      scr.mono(ctx, Math.abs(v0) < 10 ? v.toFixed(2) : Math.abs(v0) < 1000 ? v.toFixed(1) : v.toFixed(0), W * 0.46, y + 12 * s, 14 * s, C.ink, 'right');
      const x0 = W * 0.52, x1 = W - 14 * s, yb = y + rh - 6 * s, yt = y + 6 * s;
      scr.frame(ctx, x0, yt, x1 - x0, yb - yt);
      const lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1e-6, hi - lo);
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2 * s; ctx.beginPath();
      h.forEach((q, j) => { const x = x0 + ((x1 - x0) * j) / 59, yy = yb - 3 * s - ((q - lo) / span) * (yb - yt - 6 * s); if (j) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); });
      ctx.stroke();
    });
  }

  private status() {
    const z = this.zone;
    const glow = z.ship?.glow?.emissiveIntensity ?? 1;
    return {
      berthed: true,
      field: z.ship?.field ?? 0,
      breath: Math.max(0, Math.min(1, (glow - 1.1) / 0.9)),
      hatch: z.dorsal?.open ?? false,
    };
  }

  // ------------------------------------------------------------------------------------------- pages
  private flight(ctx: Ctx, W: number, H: number) {
    const s = W / 448, st = this.status();
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'FLIGHT · WSV-1 HALCYON', s);
    this.rows(ctx, 14 * s, 50 * s, W - 28 * s, s, [
      ['FRAME OF REFERENCE', 'EARTH · LVLH · 400 km'],
      ['STATE', st.berthed ? 'BERTHED · MERIDIAN CRADLE' : 'FREE FLIGHT', st.berthed ? C.green : C.amber],
      ['DESTINATION', 'ASTERION BINARY SYSTEM'],
      ['DISTANCE', `${ASTERION.distanceLy.toFixed(2)} ly · ${(ASTERION.distanceLy * 63241).toFixed(0)} AU`],
      ['ARRIVAL ESTIMATE', 'ROUTE NOT ARMED'],
      ['BUBBLE STABILITY', st.field > 0 ? `${(99.2 + Math.sin(this.t) * 0.4).toFixed(1)} %` : 'FIELD STANDBY'],
      ['SAFETY', st.hatch ? 'DORSAL HATCH OPEN · WARP INHIBIT' : 'WARP INHIBIT · BERTHED', C.amber],
    ]);
  }

  private attitude(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'ATTITUDE · ENERGY', s);
    const cx = W * 0.28, cy = H * 0.58, r = Math.min(W, H) * 0.27;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#163a5c'; ctx.fillRect(cx - r, cy - r, 2 * r, r);
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(cx - r, cy, 2 * r, r);
    ctx.restore();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx - r * 0.15, cy); ctx.moveTo(cx + r * 0.15, cy); ctx.lineTo(cx + r * 0.5, cy); ctx.stroke();
    scr.frame(ctx, cx - r, cy - r, 2 * r, 2 * r);
    this.rows(ctx, W * 0.56, 52 * s, W * 0.4, s, [['PITCH', '+0.0°'], ['YAW', '+0.0°'], ['ROLL', '+0.0°'], ['REACTOR', 'COLD'], ['BATTERY', '97 %'], ['FIELD', 'STANDBY']]);
  }

  private route(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'ROUTE PLANNER · SPECULATIVE', s);
    const x0 = 30 * s, x1 = W - 30 * s, y = H * 0.48;
    ctx.strokeStyle = C.line; ctx.setLineDash([6 * s, 5 * s]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x0, y, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x1 - 3 * s, y - 2 * s, 5 * s, 0, Math.PI * 2); ctx.arc(x1 + 3 * s, y + 3 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
    scr.text(ctx, 'SOL', x0, y + 18 * s, 11 * s, C.ink, 'center');
    scr.text(ctx, 'ASTERION A+B', x1, y + 18 * s, 11 * s, C.ink, 'center');
    scr.mono(ctx, `${ASTERION.distanceLy.toFixed(2)} ly`, W / 2, y - 14 * s, 14 * s, C.white, 'center');
    this.rows(ctx, 14 * s, H - 66 * s, W - 28 * s, s, [['STAGING', 'EARTH ORBIT +2 000 km'], ['INSERTION', 'LYRAVIA PARKING ORBIT'], ['COLLISION MARGIN', 'CLEAR']], 18);
  }

  private starmap(ctx: Ctx, W: number, H: number) {
    const s = W / 1024;
    scr.bg(ctx, W, H, '#03060a');
    for (const st of STARS) {
      ctx.fillStyle = `rgba(220,235,255,${0.25 + 0.15 * st.m})`;
      ctx.fillRect(st.x * W, st.y * H, 1.5 * s + st.m * 0.5 * s, 1.5 * s + st.m * 0.5 * s);
    }
    this.head(ctx, W, 'ASTROMETRY · LOCAL STELLAR NEIGHBOURHOOD (2D PROJECTION)', s * 2);
    const sol = { x: W * 0.22, y: H * 0.62 }, ast = { x: W * 0.64, y: H * 0.42 };
    ctx.strokeStyle = 'rgba(127,214,207,0.6)'; ctx.lineWidth = 2 * s; ctx.setLineDash([10 * s, 8 * s]);
    ctx.beginPath(); ctx.moveTo(sol.x, sol.y); ctx.lineTo(ast.x, ast.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(sol.x, sol.y, 9 * s, 0, Math.PI * 2); ctx.fill();
    scr.text(ctx, 'SOL · EARTH SYSTEM', sol.x, sol.y + 28 * s, 22 * s, C.white, 'center', '600');
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 2);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(ast.x - 6 * s, ast.y, 8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9a6a'; ctx.beginPath(); ctx.arc(ast.x + 8 * s, ast.y + 4 * s, 5.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,140,110,${pulse})`; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(ast.x, ast.y, 26 * s, 0, Math.PI * 2); ctx.stroke();
    scr.text(ctx, ASTERION.name, ast.x, ast.y - 42 * s, 22 * s, C.white, 'center', '600');
    scr.mono(ctx, `${ASTERION.distanceLy.toFixed(2)} ly · 268 000 AU`, (sol.x + ast.x) / 2, (sol.y + ast.y) / 2 - 22 * s, 20 * s, C.cyan, 'center');
    // the system inset
    const bx = W * 0.76, by = H * 0.18, bw = W * 0.22, bh = H * 0.72;
    ctx.fillStyle = 'rgba(5,10,14,0.85)'; ctx.fillRect(bx, by, bw, bh); scr.frame(ctx, bx, by, bw, bh);
    scr.text(ctx, 'ASTERION · 4 PLANETS', bx + 12 * s, by + 20 * s, 16 * s, C.amber, 'left', '600');
    ASTERION.planets.forEach((p, i) => {
      const y = by + 52 * s + i * (bh - 64 * s) / 4;
      scr.text(ctx, `${p.index}  ${p.name.toUpperCase()}`, bx + 12 * s, y, 17 * s, C.white, 'left', '600');
      scr.text(ctx, `${p.a.toFixed(3)} AU · ${p.radius.toFixed(2)} R⊕ · ${(p.gravity / 9.80665).toFixed(2)} g`, bx + 12 * s, y + 20 * s, 13 * s, C.dim);
      scr.text(ctx, p.fauna ? p.faunaNote.toUpperCase() : 'NO FAUNA', bx + 12 * s, y + 38 * s, 12 * s, p.fauna ? C.green : C.dim);
    });
  }

  private system(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H, '#03060a');
    this.head(ctx, W, 'ASTERION BINARY SYSTEM', s);
    const cx = W * 0.5, cy = H * 0.58, R = Math.min(W * 0.46, H * 0.4), amax = 0.27;
    const hz = asterionHZ();
    ctx.fillStyle = 'rgba(95,224,138,0.10)'; ctx.beginPath(); ctx.arc(cx, cy, R * hz.outer / amax, 0, Math.PI * 2); ctx.arc(cx, cy, R * hz.inner / amax, 0, Math.PI * 2, true); ctx.fill();
    const ph = this.t * 0.6;
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(cx + Math.cos(ph) * 4 * s, cy + Math.sin(ph) * 4 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9a6a'; ctx.beginPath(); ctx.arc(cx - Math.cos(ph) * 7 * s, cy - Math.sin(ph) * 7 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    ASTERION.planets.forEach((p, i) => {
      const r = R * p.a / amax, a = this.t * (2 * Math.PI / p.period) * 0.4 + i * 1.7;
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.fillStyle = [C.pink, C.blue, C.green, '#c9b8ff'][i]; ctx.beginPath(); ctx.arc(x, y, 3.5 * s, 0, Math.PI * 2); ctx.fill();
      scr.text(ctx, p.name.toUpperCase(), x + 7 * s, y - 7 * s, 10 * s, C.ink);
    });
    scr.text(ctx, `HZ ${hz.inner.toFixed(3)}–${hz.outer.toFixed(3)} AU · BINARY ${ASTERION.binary.periodDays} d`, 14 * s, H - 14 * s, 10 * s, C.dim);
  }

  private planets(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'TARGET WORLDS', s);
    ASTERION.planets.forEach((p, i) => {
      const y = 46 * s + i * (H - 54 * s) / 4;
      scr.text(ctx, `${p.index} · ${p.name.toUpperCase()}`, 14 * s, y + 6 * s, 13 * s, C.white, 'left', '600');
      scr.text(ctx, `${p.pressure} bar · ${p.temp[0]}…${p.temp[1]} °C · ${p.gravity.toFixed(1)} m/s²`, 14 * s, y + 24 * s, 10 * s, C.dim);
      scr.text(ctx, p.fauna ? 'FAUNA' : 'NO FAUNA', W - 14 * s, y + 6 * s, 10 * s, p.fauna ? C.green : C.dim, 'right');
    });
  }

  private ring(ctx: Ctx, W: number, H: number, which: string, id: string) {
    const s = W / 448, st = this.status();
    scr.bg(ctx, W, H);
    this.head(ctx, W, `FIELD RING ${which}`, s);
    const cx = W * 0.25, cy = H * 0.6, r = Math.min(W, H) * 0.26;
    ctx.strokeStyle = `rgba(110,232,255,${0.3 + 0.6 * st.breath})`; ctx.lineWidth = 7 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r + 8 * s, 0, Math.PI * 2); ctx.arc(cx, cy, r - 8 * s, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ctx.fillStyle = k % 6 === 0 ? C.amber : C.green;
      ctx.fillRect(cx + Math.cos(a) * r - 1.5 * s, cy + Math.sin(a) * r - 1.5 * s, 3 * s, 3 * s);
    }
    this.rows(ctx, W * 0.52, 52 * s, W * 0.44, s, [
      ['MODE', st.field > 0 ? 'FIELD UP' : 'STANDBY', st.field > 0 ? C.cyan : C.green],
      ['COIL CHANNELS', `${(30 + st.breath * 25).toFixed(0)} % LUM`],
      ['COIL TEMP', `${(41.2 + Math.sin(this.t * 0.3) * 0.2).toFixed(1)} K`],
      ['SYMMETRY A/B', `${(99.94 + Math.sin(this.t * 0.7) * 0.02).toFixed(2)} %`],
      ['SEGMENTS OK', '120 / 120', C.green],
      ['CRADLE LOAD', `${id.includes('aft') || id.endsWith('b') ? '39' : '41'} MPa`],
    ]);
  }

  private field(ctx: Ctx, W: number, H: number) {
    const s = W / 1024;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'WARP ENVELOPE · QUALITATIVE CURVATURE MODEL (SPECULATIVE)', s * 2);
    const cx = W * 0.42, cy = H * 0.56, a = W * 0.26, b = H * 0.26;
    for (let k = 0; k < 6; k++) {
      const f = 1 + k * 0.12;
      ctx.strokeStyle = `rgba(127,214,207,${0.5 - k * 0.07})`; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.ellipse(cx, cy, a * f, b * f, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = C.white; ctx.fillRect(cx - 60 * s, cy - 6 * s, 120 * s, 12 * s);
    for (const dx of [-30 * s, 40 * s]) { ctx.strokeStyle = C.cyan; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.ellipse(cx + dx, cy, 8 * s, 46 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
    scr.text(ctx, 'CONTRACTION AHEAD →', cx + a * 1.1, cy - b * 0.9, 20 * s, C.amber, 'left');
    scr.text(ctx, '← EXPANSION BEHIND', cx - a * 1.7, cy + b * 1.0, 20 * s, C.amber, 'left');
    this.rows(ctx, W * 0.74, H * 0.3, W * 0.22, s * 2, [['ENVELOPE', 'STANDBY'], ['SYMMETRY', '99.94 %'], ['STABILISERS', 'ARMED'], ['PATH SAFETY', 'CLEAR', C.green]]);
    scr.text(ctx, 'Display shows a schematic, not a solution of the field equations.', 14 * s * 2, H - 18 * s, 18 * s, C.dim);
  }

  private power(ctx: Ctx, W: number, H: number) {
    const s = W / (W > 600 ? 1024 : 448) * (W > 600 ? 2 : 1);
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'POWER · FIELD CORE', s);
    this.rows(ctx, 14 * s, 52 * s, W - 28 * s, s, [
      ['FIELD CORE', 'COLD STANDBY · BRIDGE START-UP', C.amber],
      ['MAIN BUS A', `${(270 + Math.sin(this.t) * 0.4).toFixed(1)} V`],
      ['MAIN BUS B', `${(269.6 + Math.cos(this.t) * 0.4).toFixed(1)} V`],
      ['PLATFORM UMBILICAL', '42 kW IN', C.green],
      ['BATTERY BANKS', '97 %'],
      ['PUMP ARRAYS', '6 / 6 RUNNING', C.green],
      ['EMERGENCY SHUTDOWN', 'GUARDED · READY'],
    ]);
  }

  private vitals(ctx: Ctx, W: number, H: number, id: string) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, id === 'med_vitals' ? 'MEDICAL · DIAGNOSTICS' : 'HIBERNATION · BIOMONITOR', s);
    const z = this.zone, k = Number(id.replace(/\D/g, '')) || 0;
    const busy = z.cryo && z.cryo.state !== 'idle' && z.cryo.active?.index === k;
    ctx.strokeStyle = busy ? C.green : C.line; ctx.lineWidth = 1.6 * s; ctx.beginPath();
    for (let x = 0; x < W - 28 * s; x += 2) {
      const ph = (x / 60 + this.t * 1.4) % 1;
      const yv = busy ? (ph < 0.05 ? -30 : ph < 0.08 ? 18 : Math.sin(ph * 20) * 2) * s : 0;
      const y = H * 0.45 + yv;
      if (x) ctx.lineTo(14 * s + x, y); else ctx.moveTo(14 * s + x, y);
    }
    ctx.stroke();
    this.rows(ctx, 14 * s, H * 0.7, W - 28 * s, s, busy
      ? [['STATE', 'OCCUPIED', C.green], ['CORE TEMP', '33.8 °C'], ['HEART RATE', '9 /min']]
      : [['STATE', 'READY · EMPTY'], ['COUCH TEMP', '21.0 °C'], ['FLUIDS', 'PRIMED', C.green]], 18);
  }

  private pods(ctx: Ctx, W: number, H: number, id: string) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    const one = /^pod(\d)$/.exec(id);
    this.head(ctx, W, one ? `POD 0${one[1]} · PREFLIGHT` : 'POD LAUNCH CONTROL', s);
    const list = one ? [Number(one[1])] : [1, 2, 3, 4];
    list.forEach((n, i) => {
      const y = 50 * s + i * 30 * s;
      scr.text(ctx, `POD 0${n}`, 14 * s, y, 13 * s, C.white, 'left', '600');
      scr.text(ctx, 'SECURED · DOORS SHUT · UMBILICALS', W * 0.3, y, 10 * s, C.green);
      scr.bar(ctx, W * 0.82, y - 4 * s, W * 0.14, 8 * s, 1, C.green);
    });
    if (one) this.rows(ctx, 14 * s, 100 * s, W - 28 * s, s, [['PROPELLANT', '100 %'], ['GEAR', 'STOWED'], ['RESTRAINTS', 'OPEN'], ['BAY', 'PRESSURISED', C.green]]);
  }

  private airlock(ctx: Ctx, W: number, H: number) {
    const s = W / 448, st = this.status();
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'DORSAL AIRLOCK · GANGWAY', s);
    this.rows(ctx, 14 * s, 52 * s, W - 28 * s, s, [
      ['GANGWAY', 'SEALED TO COLLAR', C.green],
      ['PRESSURE', `${(101.3 + Math.sin(this.t) * 0.05).toFixed(2)} kPa`],
      ['OUTER HATCH', st.hatch ? 'OPEN' : 'CLOSED', st.hatch ? C.amber : C.green],
      ['INNER HATCH', st.hatch ? 'OPEN' : 'CLOSED', st.hatch ? C.amber : C.green],
      ['SHAFT', 'WEIGHTLESS · HOLD THE RAIL'],
    ]);
  }

  private berth(ctx: Ctx, W: number, H: number) {
    const s = W / 448, o = this.o, c = o?.ranger, l = c ? o.docking.linkOf(c) : null;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'BERTH 1 · RANGER', s);
    this.rows(ctx, 14 * s, 52 * s, W - 28 * s, s, [
      ['RANGER 1', l && l.port.host === o.platform ? 'HARD DOCK' : 'NOT BERTHED', l ? C.green : C.amber],
      ['RESTRAINTS', l ? 'CLOSED · 4/4' : 'OPEN'],
      ['PROPELLANT', c ? `${(c.fuel / 1000).toFixed(2)} t` : '—'],
      ['DECK', 'CLEAR · FLOODS ON'],
      ['ENDURANCE', '1.60 km AFT'],
    ]);
  }

  private yard(ctx: Ctx, W: number, H: number) {
    const s = W / 448, st = this.status();
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'MERIDIAN · HALCYON READINESS', s);
    this.rows(ctx, 14 * s, 52 * s, W - 28 * s, s, [
      ['CRADLE A / B', '41 / 39 MPa', C.green],
      ['FIELD RINGS', `STANDBY · ${(30 + st.breath * 25).toFixed(0)} %`, C.cyan],
      ['REACTOR', 'COLD STANDBY'],
      ['GANGWAY', 'PRESSURISED', C.green],
      ['DORSAL HATCH', st.hatch ? 'OPEN' : 'CLOSED'],
      ['PODS 01–04', 'SECURED', C.green],
    ]);
  }
}
