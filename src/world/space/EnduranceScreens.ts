import * as THREE from 'three';
import { ScreenSurface, scr } from '../../render/ScreenSurface';
import type { Model } from '../../render/Assets';
import { mission } from '../../mission/Mission';
import { R_EARTH, PARKING_ALT, meanMotion } from '../../space/Earth';
import { ENDURANCE } from '../../space/Endurance';
import type { EnduranceZone } from './EnduranceZone';
import type { OrbitZone } from './OrbitZone';

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, W: number, H: number) => void;
const C = { ink: '#cfe9e6', dim: 'rgba(207,233,230,0.5)', line: 'rgba(160,220,215,0.35)', amber: '#f0b34a', red: '#ff5a43', green: '#5fe08a', cyan: '#7fd6cf', blue: '#5aa7ff', white: '#f4f6f6' };
const SHORT = ['HAB A', 'POD 1', 'ENG 1', 'HAB B', 'ENG 2', 'POD 2', 'CRYO', 'POD 3', 'ENG 3', 'CMD', 'ENG 4', 'POD 4'];
const _p = new THREE.Vector3();

/**
 * Live content for the Endurance's displays, all drawn from the simulation: the orbit and mission clock, the ring's
 * spin and the gravity it makes, the docked vehicles, hatches and propellant, where the crew and the commander are,
 * the spoke lift, and the engine stations.
 */
export class EnduranceScreens {
  private list: { s: ScreenSurface; pos: THREE.Vector3 }[] = [];
  private t = 0;
  private cam = new THREE.Vector3();
  private hist = new Map<string, number[]>();

  constructor(private zone: EnduranceZone) {}

  private get o() { return this.zone.game.zones.get('orbit') as OrbitZone; }

  build(...models: Model[]) {
    for (const m of models) for (const mk of m.ofKind('screen')) {
      const d = this.pick(mk.id);
      if (!d) continue;
      const big = mk.data.w > 1.0;
      const s = new ScreenSurface(mk.node, mk.data.w, mk.data.h, d, big ? 1024 : 448, big ? 1.25 : 1.45);
      s.interval = big ? 0.25 : 0.4;
      this.list.push({ s, pos: mk.node.getWorldPosition(new THREE.Vector3()) });
    }
  }

  update(dt: number) {
    this.t += dt;
    this.zone.game.renderer.camera.getWorldPosition(this.cam);
    for (const e of this.list) e.s.update(dt, e.pos.distanceTo(this.cam) < 14);
  }

  private pick(id: string): Draw | null {
    if (id === 'cmd_flt0') return (c, W, H) => this.orbit(c, W, H);
    if (id === 'cmd_flt1') return (c, W, H) => this.spin(c, W, H);
    if (id === 'cmd_flt2') return (c, W, H) => this.vehicles(c, W, H);
    if (id === 'cmd_map') return (c, W, H) => this.ringMap(c, W, H);
    if (id === 'cmd_chart') return (c, W, H) => this.groundTrack(c, W, H);
    if (id.startsWith('cmd_main')) {
      const k = Number(id.replace(/\D/g, '')) || 0;
      return [
        (c: Ctx, W: number, H: number) => this.plots(c, W, H, 'ECLSS', [['CABIN kPa', 101.3, 0.08], ['O₂ PARTIAL kPa', 21.2, 0.05], ['CO₂ kPa', 0.31, 0.01], ['CABIN °C', 21.4, 0.06]], id),
        (c: Ctx, W: number, H: number) => this.plots(c, W, H, 'ELECTRICAL', [['MAIN BUS A V', 120.2, 0.2], ['MAIN BUS B V', 119.8, 0.2], ['ARRAY OUTPUT kW', 46.5, 0.4], ['BATTERY %', 92, 0.05]], id),
        (c: Ctx, W: number, H: number) => this.spin(c, W, H),
        (c: Ctx, W: number, H: number) => this.comms(c, W, H),
        (c: Ctx, W: number, H: number) => this.orbit(c, W, H),
      ][k % 5];
    }
    if (id === 'cryo_mon') return (c, W, H) => this.cryo(c, W, H);
    if (id === 'hab0_ws') return (c, W, H) => this.log(c, W, H);
    if (id === 'hab3_info') return (c, W, H) => this.plots(c, W, H, 'AIR · WATER', [['O₂ GENERATION g/h', 84, 1.5], ['CO₂ SCRUB g/h', 96, 2], ['WATER RECOVERY %', 93, 0.2], ['POTABLE STORE L', 1840, 0]], id);
    const eng = /^eng(\d+)(_(\d))?$/.exec(id);
    if (eng) {
      const i = Number(eng[1]), n = [2, 4, 8, 10].indexOf(i) + 1, sub = eng[3] === undefined ? -1 : Number(eng[3]);
      if (sub < 0) return (c, W, H) => this.engine(c, W, H, n);
      return [
        (c: Ctx, W: number, H: number) => this.plots(c, W, H, `ENGINE ${n} · LH2`, [['TANK kPa', 228, 0.6], ['TANK K', 20.6, 0.02], ['ULLAGE %', 6.1, 0], ['BOIL-OFF g/h', 41, 1.4]], id),
        (c: Ctx, W: number, H: number) => this.plots(c, W, H, `ENGINE ${n} · LOX`, [['TANK kPa', 345, 0.8], ['TANK K', 90.3, 0.04], ['ULLAGE %', 4.8, 0], ['BOIL-OFF g/h', 12, 0.6]], id),
        (c: Ctx, W: number, H: number) => this.engine(c, W, H, n),
      ][sub % 3];
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------- helpers
  private head(ctx: Ctx, W: number, title: string, s = 1) {
    scr.text(ctx, title, 14 * s, 18 * s, 13 * s, C.amber, 'left', '600');
    const t = this.o?.met ?? 0, pad = (x: number) => String(Math.floor(x)).padStart(2, '0');
    scr.mono(ctx, `MET ${pad(t / 3600)}:${pad((t % 3600) / 60)}:${pad(t % 60)}`, W - 14 * s, 18 * s, 11 * s, C.dim, 'right');
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10 * s, 32 * s); ctx.lineTo(W - 10 * s, 32 * s); ctx.stroke();
  }

  /** steady values with live noise, each with a short strip chart */
  private plots(ctx: Ctx, W: number, H: number, title: string, series: [string, number, number][], id: string) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, title, s);
    const rows = series.length, top = 42 * s, rh = (H - top - 8 * s) / rows;
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

  // ------------------------------------------------------------------------------------------- pages
  private orbit(ctx: Ctx, W: number, H: number) {
    const s = W / 448, o = this.o;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'ORBIT', s);
    const r = R_EARTH + PARKING_ALT, n = meanMotion(r), P = (2 * Math.PI) / n;
    const met = o?.met ?? 0, ph = ((met % P) / P) * Math.PI * 2;
    const cx = W * 0.27, cy = H * 0.58, re = Math.min(W, H) * 0.24, ro = re * 1.18;
    ctx.fillStyle = '#123a5a'; ctx.beginPath(); ctx.arc(cx, cy, re, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.arc(cx, cy, ro, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(cx + Math.cos(ph) * ro, cy - Math.sin(ph) * ro, 4 * s, 0, Math.PI * 2); ctx.fill();
    const alt = o ? (o as any).rE - R_EARTH : PARKING_ALT;
    const rows: [string, string][] = [
      ['ALTITUDE', `${(alt / 1000).toFixed(1)} km`], ['PERIOD', `${(P / 60).toFixed(1)} min`], ['SPEED', `${(Math.sqrt(3.986004418e14 / r) / 1000).toFixed(2)} km/s`],
      ['INCLINATION', '38.7°'], ['ORBIT', `${Math.floor(met / P) + 1}`], ['PHASE', mission.phase.toUpperCase()],
    ];
    rows.forEach(([k, v], i) => { scr.text(ctx, k, W * 0.56, 52 * s + i * 22 * s, 11 * s, C.dim); scr.mono(ctx, v, W - 14 * s, 52 * s + i * 22 * s, 13 * s, C.ink, 'right'); });
  }

  private spin(ctx: Ctx, W: number, H: number) {
    const s = W / 448, e = this.o?.endurance;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'RING ROTATION', s);
    if (!e) return;
    const w = e.rate, firing = Math.abs(e.targetRate - e.rate) > 1e-3;
    scr.mono(ctx, `${e.rpm.toFixed(2)} rpm`, 14 * s, 56 * s, 24 * s, C.white);
    scr.text(ctx, `TARGET ${(e.targetRate * 60 / (2 * Math.PI)).toFixed(2)} rpm${e.autoGravity ? '  ·  AUTO GRAVITY' : ''}`, 14 * s, 82 * s, 11 * s, e.autoGravity ? C.green : C.dim);
    scr.text(ctx, firing ? (e.targetRate > e.rate ? 'SPIN THRUSTERS · SPIN-UP' : 'SPIN THRUSTERS · SPIN-DOWN') : 'SPIN THRUSTERS · IDLE', 14 * s, 100 * s, 11 * s, firing ? C.amber : C.dim);
    const decks: [string, number][] = [['MAIN DECKS', 29], ['CORRIDOR', 25], ['SPOKE MID', 12], ['HUB', 2.35]];
    decks.forEach(([k, r], i) => {
      const g = (w * w * r) / 9.81, y = 124 * s + i * 22 * s;
      scr.text(ctx, k, 14 * s, y, 11 * s, C.dim);
      scr.bar(ctx, W * 0.36, y - 5 * s, W * 0.42, 10 * s, g / 1.1, g > 0.7 ? C.green : g > 0.2 ? C.cyan : C.dim);
      scr.mono(ctx, `${g.toFixed(2)} g`, W - 14 * s, y, 12 * s, C.ink, 'right');
    });
    // a little ring that turns at the real rate
    const cx = W * 0.82, cy = 70 * s, rr = 26 * s, a = (this.zone as any).spinAngle?.() ?? this.t * w;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 12; k++) { const q = a + (k * Math.PI) / 6; ctx.fillStyle = k === 9 ? C.amber : C.cyan; ctx.fillRect(cx + Math.sin(q) * rr - 2.5 * s, cy - Math.cos(q) * rr - 2.5 * s, 5 * s, 5 * s); }
    scr.mono(ctx, `RIM ${(w * ENDURANCE.ringR).toFixed(1)} m/s`, W - 14 * s, 108 * s, 10 * s, C.dim, 'right');
  }

  private vehicles(ctx: Ctx, W: number, H: number) {
    const s = W / 448, o: any = this.o, z: any = this.zone;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'VEHICLES · PORTS', s);
    if (!o) return;
    const crafts: [string, any, string][] = [['RANGER 1', o.ranger, 'axial_fwd'], ['RANGER 2', o.ranger2, 'axial_aft']];
    crafts.forEach(([name, c, port], i) => {
      const y = 54 * s + i * 62 * s;
      const link = c ? o.docking.linkOf(c) : null;
      const pg = z.ports?.find((p: any) => p.id === port);
      scr.text(ctx, name, 14 * s, y, 13 * s, C.ink, 'left', '600');
      scr.text(ctx, link ? `DOCKED · ${port === 'axial_fwd' ? 'FWD' : 'AFT'} AXIAL` : c ? 'FREE FLIGHT' : '—', W * 0.4, y, 11 * s, link ? C.green : C.amber);
      scr.text(ctx, pg ? (pg.open ? 'HATCHES OPEN' : 'HATCHES SHUT') : '', W - 14 * s, y, 11 * s, pg?.open ? C.amber : C.dim, 'right');
      if (c) {
        scr.text(ctx, 'PROPELLANT', 14 * s, y + 22 * s, 10 * s, C.dim);
        scr.bar(ctx, W * 0.3, y + 17 * s, W * 0.44, 10 * s, c.fuel / c.spec.fuelMax, c.fuel < 1500 ? C.red : C.cyan);
        scr.mono(ctx, `${(c.fuel / 1000).toFixed(1)} t`, W - 14 * s, y + 22 * s, 11 * s, C.ink, 'right');
        scr.text(ctx, c.damage > 0 ? `HULL ${(c.damage * 100).toFixed(0)} % DAMAGE` : 'HULL NOMINAL', 14 * s, y + 40 * s, 10 * s, c.damage > 0 ? C.red : C.dim);
      }
    });
    scr.text(ctx, 'LANDER PORTS 12 · 6 O\'CLOCK  ·  FREE', 14 * s, H - 16 * s, 10 * s, C.dim);
  }

  private comms(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'COMMUNICATIONS', s);
    const rows: [string, string, string][] = [['HIGH-GAIN', 'TRACKING', C.green], ['DOWNLINK', '2.1 Mb/s', C.ink], ['GROUND STATION', 'NASA · CONCEALED SITE', C.ink], ['LIGHT TIME', '1.3 ms', C.ink], ['LAST CONTACT', 'CONTINUOUS', C.green]];
    rows.forEach(([k, v, col], i) => { scr.text(ctx, k, 14 * s, 56 * s + i * 24 * s, 11 * s, C.dim); scr.mono(ctx, v, W - 14 * s, 56 * s + i * 24 * s, 12 * s, col, 'right'); });
    // carrier lock trace
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2 * s; ctx.beginPath();
    for (let x = 0; x < W - 28 * s; x += 2) { const y = H - 30 * s + Math.sin(x * 0.08 + this.t * 4) * 8 * s * Math.exp(-(((x / W) - 0.5) ** 2) * 18); if (x) ctx.lineTo(14 * s + x, y); else ctx.moveTo(14 * s + x, y); }
    ctx.stroke();
  }

  private groundTrack(ctx: Ctx, W: number, H: number) {
    const s = W / 448, o = this.o;
    scr.bg(ctx, W, H, '#06100f');
    this.head(ctx, W, 'GROUND TRACK', s);
    const r = R_EARTH + PARKING_ALT, n = meanMotion(r), met = o?.met ?? 0, inc = (38.7 * Math.PI) / 180;
    const x0 = 14 * s, y0 = 42 * s, w = W - 28 * s, h = H - 56 * s;
    scr.frame(ctx, x0, y0, w, h);
    ctx.strokeStyle = 'rgba(160,220,215,0.15)';
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x0 + (w * k) / 6, y0); ctx.lineTo(x0 + (w * k) / 6, y0 + h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0, y0 + h / 2); ctx.lineTo(x0 + w, y0 + h / 2); ctx.stroke();
    const OMEGA_E = 7.2921159e-5;
    const pt = (t: number) => {
      const u = n * t, lat = Math.asin(Math.sin(inc) * Math.sin(u));
      let lon = Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) - OMEGA_E * t - 1.75;
      lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return [x0 + ((lon + Math.PI) / (2 * Math.PI)) * w, y0 + h / 2 - (lat / (Math.PI / 2)) * (h / 2)];
    };
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2 * s;
    let prev: number[] | null = null;
    for (let t = met - 5400; t <= met + 1800; t += 60) {
      const p = pt(t);
      if (prev && Math.abs(p[0] - prev[0]) < w / 2) { ctx.globalAlpha = t > met ? 0.35 : 1; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
      prev = p;
    }
    ctx.globalAlpha = 1;
    const p = pt(met);
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(p[0], p[1], 4 * s, 0, Math.PI * 2); ctx.fill();
  }

  /** The ring seen from forward: modules, hub, spoke and lift car, the docked Rangers, and where everyone is. */
  private ringMap(ctx: Ctx, W: number, H: number) {
    const s = W / 1024, z: any = this.zone;
    scr.bg(ctx, W, H, '#04080a');
    this.head(ctx, W, 'ENDURANCE · CREW AND SHIP', s * 1.6);
    const cx = W * 0.36, cy = H * 0.56, R = Math.min(W, H) * 0.38, k = R / 32;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(cx, cy, 24 * k, 0, Math.PI * 2); ctx.stroke();
    const here = z.locate ? String(z.locationName()) : '';
    for (let i = 0; i < 12; i++) {
      const th = (i * Math.PI) / 6;
      ctx.save(); ctx.translate(cx - Math.sin(th) * 26.7 * k, cy - Math.cos(th) * 26.7 * k); ctx.rotate(-th);
      const mine = here.includes(['Habitat A', 'Landing pod 1', 'Engine 1', 'Habitat B', 'Engine 2', 'Landing pod 2', 'Cryo-lab', 'Landing pod 3', 'Engine 3', 'Command module', 'Engine 4', 'Landing pod 4'][i]);
      ctx.fillStyle = mine ? 'rgba(240,179,74,0.25)' : 'rgba(127,214,207,0.08)';
      ctx.strokeStyle = mine ? C.amber : C.cyan;
      ctx.fillRect(-3.8 * k, -5.3 * k, 7.6 * k, 10.6 * k); ctx.strokeRect(-3.8 * k, -5.3 * k, 7.6 * k, 10.6 * k);
      ctx.restore();
      scr.text(ctx, SHORT[i], cx - Math.sin(th) * 35 * k, cy - Math.cos(th) * 35 * k, 15 * s * 1.6, mine ? C.amber : C.dim, 'center', '600');
    }
    // hub, spoke and the lift car where it really is
    ctx.strokeStyle = C.cyan; ctx.beginPath(); ctx.arc(cx, cy, 2.6 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 2.6 * k, cy); ctx.lineTo(cx - 21.4 * k, cy); ctx.stroke();
    if (z.lift) { const lr = z.lift.r; ctx.fillStyle = z.lift.moving ? C.amber : C.cyan; ctx.fillRect(cx - lr * k - 4 * s, cy - 6 * s, 8 * s, 12 * s); }
    // people: the commander (white) and the crew (green), from their actual positions in the ship's frame
    const dot = (p: THREE.Vector3, col: string, label: string) => {
      const x = cx + p.x * k, y = cy - p.y * k;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 7 * s * 1.4, 0, Math.PI * 2); ctx.fill();
      scr.text(ctx, label, x + 12 * s, y, 13 * s * 1.5, col);
    };
    for (const n of z.npcs?.list ?? []) { n.root.getWorldPosition(_p); dot(_p, C.green, String(n.name).split(' ').pop()!); }
    dot(z.game.player.pos, C.white, 'YOU');
    // side list
    const x0 = W * 0.72;
    scr.text(ctx, 'CREW', x0, 90 * s * 1.6, 15 * s * 1.6, C.amber, 'left', '600');
    let y = 120 * s * 1.6;
    scr.text(ctx, 'COMMANDER', x0, y, 12 * s * 1.6, C.white); scr.text(ctx, here.replace('Endurance · ', '').toUpperCase(), x0, y + 20 * s * 1.6, 10 * s * 1.6, C.dim); y += 52 * s * 1.6;
    for (const n of z.npcs?.list ?? []) {
      scr.text(ctx, String(n.name).toUpperCase(), x0, y, 12 * s * 1.6, C.green);
      scr.text(ctx, String(n.post ?? (n.attached ? 'RANGER 1 · SEATED' : 'ON BOARD')).toUpperCase(), x0, y + 20 * s * 1.6, 10 * s * 1.6, C.dim);
      y += 52 * s * 1.6;
    }
  }

  private cryo(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'HIBERNATION', s);
    for (let k = 0; k < 4; k++) {
      const y = 54 * s + k * 30 * s;
      scr.text(ctx, `POD ${k + 1}`, 14 * s, y, 12 * s, C.ink, 'left', '600');
      scr.text(ctx, 'READY · EMPTY', W * 0.3, y, 11 * s, C.green);
      scr.mono(ctx, `${(21.2 + Math.sin(this.t * 0.3 + k) * 0.05).toFixed(1)} °C`, W - 14 * s, y, 12 * s, C.ink, 'right');
    }
    scr.text(ctx, 'COOLANT LOOP NOMINAL  ·  INDUCTION AGENT 4 DOSES', 14 * s, H - 16 * s, 10 * s, C.dim);
  }

  private log(ctx: Ctx, W: number, H: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, 'MISSION LOG', s);
    const notes: string[] = mission.log.slice(-6).reverse().map((n) => n.text);
    const lines = notes.length ? notes : ['No entries yet.'];
    ctx.font = `${11 * s}px "Helvetica Neue", Arial, sans-serif`;
    let y = 50 * s;
    for (const t of lines) {
      const words = t.split(' ');
      let row = '';
      for (const w of words) {
        if (ctx.measureText(row + w).width > W - 28 * s) { scr.text(ctx, row, 14 * s, y, 11 * s, C.ink); y += 15 * s; row = ''; }
        row += w + ' ';
      }
      scr.text(ctx, row, 14 * s, y, 11 * s, C.ink); y += 21 * s;
      if (y > H - 10 * s) break;
    }
  }

  private engine(ctx: Ctx, W: number, H: number, n: number) {
    const s = W / 448;
    scr.bg(ctx, W, H);
    this.head(ctx, W, `ENGINE ${n}`, s);
    const rows: [string, string, string][] = [['STATE', 'SAFED · STANDING BY', C.green], ['IGNITERS', 'DISARMED', C.dim], ['MAIN VALVES', 'CLOSED', C.dim], ['GIMBAL', '0.0° · 0.0°', C.ink], ['CHILL-DOWN', 'NOT REQUIRED', C.dim], ['NEXT BURN', 'NONE SCHEDULED', C.dim]];
    rows.forEach(([k, v, col], i) => { scr.text(ctx, k, 14 * s, 54 * s + i * 22 * s, 11 * s, C.dim); scr.mono(ctx, v, W - 14 * s, 54 * s + i * 22 * s, 12 * s, col, 'right'); });
  }
}
