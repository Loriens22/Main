import * as THREE from 'three';
import { ScreenSurface, scr } from '../../render/ScreenSurface';
import type { Model } from '../../render/Assets';
import { hash2 } from '../../core/math';
import { LAUNCHER, LAZARUS, launcherDeltaV, mission } from '../../mission/Mission';
import type { EarthZone } from './EarthZone';
import type { NasaSite } from './Nasa';

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, W: number, H: number) => void;
const C = { ink: '#cfe9e6', dim: 'rgba(207,233,230,0.5)', line: 'rgba(160,220,215,0.35)', amber: '#f0b34a', red: '#ff5a43', green: '#5fe08a', cyan: '#7fd6cf', blue: '#5aa7ff' };

/**
 * Live content for every display in the facility. All of it is drawn from game state: door and lift
 * positions, where people actually are, the weather over the site, the mission phase and the vehicle data.
 */
export class NasaScreens {
  private list: { s: ScreenSurface; pos: THREE.Vector3 }[] = [];
  private t = 0;
  private cam = new THREE.Vector3();

  constructor(private zone: EarthZone, private site: NasaSite) {}

  build(...models: Model[]) {
    for (const m of models) for (const mk of m.ofKind('screen')) {
      const d = this.pick(mk.id);
      if (!d) continue;
      const big = mk.data.w > 2;
      const s = new ScreenSurface(mk.node, mk.data.w, mk.data.h, d, big ? 1024 : 384, big ? 1.25 : 1.5);
      s.interval = big ? 0.25 : 0.5;
      this.list.push({ s, pos: mk.node.getWorldPosition(new THREE.Vector3()) });
    }
  }

  update(dt: number) {
    this.t += dt;
    this.zone.game.renderer.camera.getWorldPosition(this.cam);
    for (const e of this.list) e.s.update(dt, e.pos.distanceTo(this.cam) < 34);
  }

  private pick(id: string): Draw | null {
    if (id === 'mc_wall0') return (c, W, H) => this.orbit(c, W, H);
    if (id === 'mc_wall1') return (c, W, H) => this.board(c, W, H);
    if (id === 'mc_wall2' || id === 'astro1') return (c, W, H) => this.transfer(c, W, H);
    if (id === 'brief0' || id === 'astro2') return (c, W, H) => this.worlds(c, W, H);
    if (id === 'brief1' || id === 'mc_dir1') return (c, W, H) => this.ring(c, W, H);
    if (id === 'astro0' || id === 'as10') return (c, W, H) => this.wormhole(c, W, H);
    if (id.startsWith('cctv') || id.startsWith('sec') || id === 'gate0') { const k = Number(id.replace(/\D/g, '')) || 0; return (c, W, H) => this.plan(c, W, H, id.startsWith('cctv') ? k : id === 'gate0' ? 4 : k % 4); }
    if (id === 'mc_dir0' || id.startsWith('lc')) return (c, W, H) => this.board(c, W, H);
    if (id.startsWith('ls')) return (c, W, H) => this.plots(c, W, H, 'LIFE SUPPORT', [['O₂ %', 20.9, 0.05], ['CO₂ ppm', 610, 22], ['N₂ %', 78.1, 0.04], ['H₂O RECLAIM %', 97.2, 0.3]], id);
    if (id.startsWith('gh')) return (c, W, H) => this.plots(c, W, H, 'GREENHOUSE', [['BED TEMP °C', 24.3, 0.3], ['SOIL MOISTURE %', 41, 1.2], ['PAR µmol', 620, 9], ['INFECTED BEDS', 3, 0]], id);
    if (id.startsWith('med')) return (c, W, H) => this.plots(c, W, H, 'CREW VITALS', [['REYES HR', 64, 3], ['OKOYE HR', 61, 3], ['HARTMANN HR', 58, 2], ['DOSE µSv/h', 0.11, 0.01]], id);
    if (id.startsWith('lab')) return (c, W, H) => this.plots(c, W, H, 'PATHOLOGY', [['CULTURE N₂ UPTAKE', 3.4, 0.12], ['SPORE COUNT k/ml', 88, 4], ['RESISTANT LINES', 2, 0], ['INCUBATOR °C', 27.0, 0.1]], id);
    if (id.startsWith('cc')) return (c, W, H) => this.plots(c, W, H, 'COMPUTER CENTER', [['CLUSTER LOAD %', 37, 6], ['TELEMETRY LINK Mb/s', 2.1, 0.2], ['RACK INLET °C', 19.4, 0.3], ['STORAGE USED %', 81.6, 0]], id);
    if (id.startsWith('mc')) {
      const k = Number(id.replace(/\D/g, '')) || 0;
      const sets: [string, [string, number, number][]][] = [
        ['PROPULSION', [['S1 LOX TANK kPa', 345, 3], ['S1 FUEL TANK kPa', 310, 3], ['S2 LH2 TANK kPa', 228, 2], ['HELIUM BOTTLE MPa', 31.2, 0.1]]],
        ['GUIDANCE', [['PLATFORM DRIFT °/h', 0.012, 0.003], ['AZIMUTH °', 90.0, 0], ['WIND ALOFT m/s', 0, 0], ['RANGE', 1, 0]]],
        ['ELECTRICAL', [['MAIN BUS V', 28.1, 0.1], ['GROUND POWER kW', 412, 9], ['BATTERY %', 100, 0], ['FUEL CELL A', 0, 0]]],
        ['ECLSS', [['CABIN kPa', 101.2, 0.1], ['CABIN O₂ %', 21.0, 0.05], ['CABIN °C', 21.3, 0.1], ['SUIT LOOP', 1, 0]]],
        ['RANGE', [['SILO CAP', 0, 0], ['ARMS', 0, 0], ['PERSONNEL IN PIT', 0, 0], ['TRACKING', 1, 0]]],
      ];
      const [title, series] = sets[k % sets.length];
      return (c, W, H) => this.plots(c, W, H, title, series, id);
    }
    return null;
  }

  private head(ctx: Ctx, W: number, title: string, s = 1) {
    scr.text(ctx, title, 14 * s, 18 * s, 13 * s, C.amber, 'left', '600');
    const w = this.zone.weather;
    scr.mono(ctx, `${String(Math.floor(w.hours)).padStart(2, '0')}:${String(Math.floor((w.hours % 1) * 60)).padStart(2, '0')}  ${mission.phase.toUpperCase()}`, W - 14 * s, 18 * s, 11 * s, C.dim, 'right');
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10 * s, 32 * s); ctx.lineTo(W - 10 * s, 32 * s); ctx.stroke();
  }

  /** Small strip charts: a steady value with live noise; a few read real state. */
  private plots(ctx: Ctx, W: number, H: number, title: string, series: [string, number, number][], id: string) {
    scr.bg(ctx, W, H);
    this.head(ctx, W, title);
    const z = this.zone, n = series.length, rh = (H - 44) / n;
    const seed = id.length * 7 + id.charCodeAt(id.length - 1);
    series.forEach(([name, base, noise], i) => {
      let v = base;
      if (name === 'WIND ALOFT m/s') v = z.weather.wind * 14;
      else if (name === 'SILO CAP') v = this.site.siloOpen;
      else if (name === 'ARMS') v = 1 - this.site.armsRetract;
      else if (name === 'PERSONNEL IN PIT') v = z.nasaStaff ? z.nasaStaff.npcs.list.filter((p) => this.site.toLocal(p.pos, new THREE.Vector3()).y < -6).length : 0;
      else if (name === 'RANGE' || name === 'TRACKING' || name === 'SUIT LOOP') v = 1;
      const y = 40 + i * rh;
      scr.text(ctx, name, 14, y + 10, 10.5, C.dim);
      const flag = ['SILO CAP', 'ARMS', 'RANGE', 'TRACKING', 'SUIT LOOP'].includes(name);
      const txt = flag ? (name === 'SILO CAP' ? (v > 0.99 ? 'OPEN' : v > 0.01 ? 'MOVING' : 'CLOSED') : name === 'ARMS' ? (v > 0.5 ? 'CONNECTED' : 'RETRACTED') : 'GO') : (Math.abs(v) < 10 ? v.toFixed(noise < 0.05 && noise > 0 ? 3 : 2) : v.toFixed(noise >= 1 ? 0 : 1));
      scr.mono(ctx, txt, W - 14, y + 10, 15, flag ? C.green : C.ink, 'right');
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const tt = Math.floor(this.t * 2) - (60 - k);
        const nv = (hash2(tt * 0.37 + seed, i * 9.1 + seed) - 0.5) * 2;
        const px = 14 + (k / 60) * (W - 28), py = y + rh * 0.62 - nv * Math.min(1, noise > 0 ? 1 : 0) * rh * 0.16;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }

  /** Earth, the parking orbit, the Endurance and the ascent ground track. */
  private orbit(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#03070a');
    const s = W / 512;
    this.head(ctx, W, 'ORBITAL TRAJECTORY — ENDURANCE RENDEZVOUS', s);
    const cx = W * 0.42, cy = H * 0.56, R = H * 0.26;
    ctx.fillStyle = '#0d2a3c'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,230,0.5)'; ctx.lineWidth = 2 * s; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,230,0.18)'; ctx.lineWidth = s;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, R * Math.sin((k * Math.PI) / 6), R, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy - R * Math.cos((k * Math.PI) / 6), R * Math.sin((k * Math.PI) / 6), R * 0.12 * Math.sin((k * Math.PI) / 6), 0, 0, 7); ctx.stroke(); }
    const ro = R * 1.0628; // 400 km
    ctx.strokeStyle = C.amber; ctx.setLineDash([6 * s, 5 * s]); ctx.beginPath(); ctx.ellipse(cx, cy, ro * 1.35, ro * 0.62, -0.42, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    const a = this.t * ((2 * Math.PI) / 5550) * 40 + 1.1;
    const ex = cx + Math.cos(a) * ro * 1.35 * Math.cos(-0.42) - Math.sin(a) * ro * 0.62 * Math.sin(-0.42), ey = cy + Math.cos(a) * ro * 1.35 * Math.sin(-0.42) + Math.sin(a) * ro * 0.62 * Math.cos(-0.42);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(ex, ey, 5 * s, 0, 7); ctx.fill();
    scr.text(ctx, 'ENDURANCE', ex + 10 * s, ey - 8 * s, 11 * s, C.ink);
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx - R * 0.52, cy - R * 0.36, 4 * s, 0, 7); ctx.fill();
    scr.text(ctx, 'FACILITY 7', cx - R * 0.52 + 8 * s, cy - R * 0.36 + 12 * s, 10 * s, C.green);
    ctx.strokeStyle = C.green; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(cx - R * 0.52, cy - R * 0.36); ctx.quadraticCurveTo(cx - R * 0.1, cy - R * 0.95, cx + R * 0.55, cy - R * 0.98); ctx.stroke();
    const x0 = W * 0.74;
    const rows: [string, string][] = [['PARKING ORBIT', '400 km × 400 km'], ['INCLINATION', '28.5°'], ['PERIOD', '92.4 min'], ['ORBITAL SPEED', '7.67 km/s'], ['ASCENT TIME', `${Math.round(LAUNCHER.stage1.burn + LAUNCHER.stage2.burn)} s`], ['PHASE', mission.phase.toUpperCase()]];
    rows.forEach(([k, v], i) => { scr.text(ctx, k, x0, H * 0.3 + i * 34 * s, 10 * s, C.dim); scr.mono(ctx, v, x0, H * 0.3 + i * 34 * s + 14 * s, 14 * s, C.ink); });
  }

  /** Launch status board: countdown, go / no-go from real conditions, stage data. */
  private board(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#04080a');
    const s = W / 512, z = this.zone, st = z.nasaStaff;
    this.head(ctx, W, 'LAUNCH STATUS', s);
    const cd = mission.countdown;
    scr.mono(ctx, cd >= 0 ? `T−${String(Math.floor(cd / 60)).padStart(2, '0')}:${String(Math.floor(cd % 60)).padStart(2, '0')}` : mission.phase === 'earth' ? 'NO LAUNCH SCHEDULED' : 'AWAITING COMMANDER', W / 2, H * 0.24, (cd >= 0 ? 44 : 22) * s, cd >= 0 ? C.amber : C.ink, 'center');
    const checks: [string, boolean][] = [
      ['COMMANDER', mission.choice === 'endurance'], ['CREW', !!st?.crewReady()], ['WEATHER', z.weather.storm === 'none'], ['PROPELLANT', true],
      ['GUIDANCE', true], ['RANGE', true], ['SILO CAP', this.site.siloOpen > 0.99], ['ARMS', this.site.armsRetract > 0.9],
    ];
    const cw = (W - 28 * s) / 4;
    checks.forEach(([k, ok], i) => {
      const x = 14 * s + (i % 4) * cw, y = H * 0.4 + Math.floor(i / 4) * 46 * s;
      ctx.fillStyle = ok ? 'rgba(60,200,120,0.18)' : 'rgba(255,90,60,0.16)'; ctx.fillRect(x + 2 * s, y, cw - 4 * s, 38 * s);
      scr.text(ctx, k, x + 10 * s, y + 13 * s, 9.5 * s, C.dim);
      scr.text(ctx, ok ? 'GO' : 'NO-GO', x + 10 * s, y + 27 * s, 12 * s, ok ? C.green : C.red, 'left', '700');
    });
    const dv = launcherDeltaV();
    scr.text(ctx, `LIFT-OFF MASS ${(dv.m0 / 1000).toFixed(0)} t   ·   T/W ${dv.twr.toFixed(2)}   ·   Δv ${(dv.total / 1000).toFixed(2)} km/s`, W / 2, H * 0.9, 10.5 * s, C.dim, 'center');
  }

  /** Heliocentric view: Earth and Saturn orbits, the transfer arc and the anomaly. */
  private transfer(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#03060a');
    const s = W / 512;
    this.head(ctx, W, 'EARTH — SATURN TRANSFER', s);
    const cx = W * 0.5, cy = H * 0.56, k = (H * 0.4) / 9.58;
    ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(cx, cy, 4 * s, 0, 7); ctx.fill();
    for (const [r, col] of [[1, C.blue], [1.52, 'rgba(255,120,80,0.5)'], [5.2, 'rgba(255,220,160,0.35)'], [9.58, C.amber]] as [number, string][]) { ctx.strokeStyle = col; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 7); ctx.stroke(); }
    const ae = this.t * 0.01, as = 2.2 + this.t * 0.01 / 29.46;
    ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(cx + Math.cos(ae) * k, cy + Math.sin(ae) * k, 3 * s, 0, 7); ctx.fill();
    const sx = cx + Math.cos(as) * 9.58 * k, sy = cy + Math.sin(as) * 9.58 * k;
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(sx, sy, 5 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = C.amber; ctx.beginPath(); ctx.ellipse(sx, sy, 10 * s, 3 * s, 0.4, 0, 7); ctx.stroke();
    scr.text(ctx, 'SATURN', sx + 14 * s, sy, 11 * s, C.amber);
    ctx.strokeStyle = C.cyan; ctx.beginPath(); ctx.arc(sx - 16 * s, sy - 12 * s, 4 * s, 0, 7); ctx.stroke();
    scr.text(ctx, 'ANOMALY', sx - 16 * s, sy - 24 * s, 9 * s, C.cyan, 'center');
    ctx.strokeStyle = C.green; ctx.setLineDash([5 * s, 4 * s]); ctx.beginPath(); ctx.moveTo(cx + k, cy);
    ctx.bezierCurveTo(cx + k * 2.5, cy + k * 4, cx - k * 2, cy + k * 8.5, sx, sy); ctx.stroke(); ctx.setLineDash([]);
    scr.text(ctx, 'FLIGHT TIME ≈ 2 YEARS  ·  CREW IN CRYOSLEEP OR AWAKE', W / 2, H * 0.94, 10 * s, C.dim, 'center');
  }

  /** The three Lazarus candidates around Gargantua. */
  private worlds(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#04070a');
    const s = W / 512;
    this.head(ctx, W, 'LAZARUS — CANDIDATE WORLDS', s);
    const cx = W * 0.2, cy = H * 0.56;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, 20 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffcf8a'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.ellipse(cx, cy, 44 * s, 9 * s, -0.15, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(cx, cy, 23 * s, Math.PI, 0); ctx.stroke();
    scr.text(ctx, 'GARGANTUA', cx, cy + 38 * s, 10 * s, C.amber, 'center');
    LAZARUS.forEach((w, i) => {
      const x = W * 0.4, y = H * 0.25 + i * H * 0.23;
      ctx.strokeStyle = C.line; ctx.lineWidth = s; ctx.strokeRect(x, y, W * 0.56, H * 0.2);
      ctx.fillStyle = ['#3f6f95', '#c9d6da', '#b98a55'][i]; ctx.beginPath(); ctx.arc(x + 26 * s, y + H * 0.1, 15 * s, 0, 7); ctx.fill();
      scr.text(ctx, w.name.toUpperCase(), x + 52 * s, y + 14 * s, 12 * s, C.ink, 'left', '600');
      scr.text(ctx, `${w.scout}  ·  ${w.gravity} g  ·  ${w.status.replace('Beacon: ', '')}`, x + 52 * s, y + 31 * s, 9 * s, C.dim);
      scr.text(ctx, w.dilation, x + 52 * s, y + 46 * s, 9 * s, i === 0 ? C.red : C.dim);
    });
  }

  /** Endurance configuration: the twelve-module ring, with the port Ranger 1 will take. */
  private ring(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#04070a');
    const s = W / 512;
    this.head(ctx, W, 'ENDURANCE — CONFIGURATION', s);
    const cx = W * 0.36, cy = H * 0.57, R = H * 0.33;
    const kinds = ['HAB', 'POD', 'ENG', 'HAB', 'ENG', 'POD', 'CRYO', 'POD', 'ENG', 'CMD', 'ENG', 'POD'];
    const rot = this.t * 0.55 * 0.05;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, R * 0.76, 0, 7); ctx.stroke();
    kinds.forEach((k, i) => {
      const a = rot + (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.save(); ctx.translate(cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84); ctx.rotate(a);
      ctx.fillStyle = k === 'ENG' ? '#3b4650' : k === 'POD' ? '#56636d' : '#8fa4ae'; ctx.fillRect(-R * 0.16, -R * 0.1, R * 0.32, R * 0.2);
      ctx.restore();
      scr.text(ctx, k, cx + Math.cos(a) * R * 1.14, cy + Math.sin(a) * R * 1.14, 8 * s, C.dim, 'center');
    });
    ctx.fillStyle = '#8fa4ae'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.13, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8fa4ae'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(rot) * R * 0.74, cy + Math.sin(rot) * R * 0.74); ctx.stroke();
    const x0 = W * 0.7;
    ([['RING', '64 m · 12 modules'], ['SPIN', '5.25 rpm'], ['RIM GRAVITY', '0.99 g'], ['DOCKED', 'RANGER 2 · LANDER 1 · LANDER 2'], ['FREE PORT', 'AXIAL FWD']] as [string, string][]).forEach(([k, v], i) => {
      scr.text(ctx, k, x0, H * 0.28 + i * 36 * s, 9.5 * s, C.dim); scr.mono(ctx, v, x0, H * 0.28 + i * 36 * s + 14 * s, 11.5 * s, C.ink);
    });
  }

  /** The anomaly: a sphere that lenses the starfield behind it. */
  private wormhole(ctx: Ctx, W: number, H: number) {
    scr.bg(ctx, W, H, '#020408');
    const s = W / 512;
    const cx = W * 0.5, cy = H * 0.54, R = H * 0.3;
    for (let i = 0; i < 260; i++) {
      let x = hash2(i, 1.7) * W, y = hash2(i, 9.3) * H;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      // points behind the sphere are pushed out to an Einstein ring; inside shows a compressed other sky
      if (d < R * 1.6) { const k = d < R ? 0.25 + 0.75 * (d / R) ** 2 : 1 + (R * R * 0.35) / (d * d); x = cx + dx * k * (d < R ? 0.9 : 1); y = cy + dy * k * (d < R ? 0.9 : 1); }
      const b = 0.3 + 0.7 * hash2(i, 4.1);
      ctx.fillStyle = d < R ? `rgba(190,220,255,${b})` : `rgba(255,240,220,${b * 0.8})`;
      ctx.fillRect(x, y, (d < R ? 1.6 : 1.1) * s, (d < R ? 1.6 : 1.1) * s);
    }
    const g = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.08);
    g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(0.6, 'rgba(190,220,255,0.55)'); g.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, 7); ctx.fill();
    this.head(ctx, W, 'ANOMALY — SATURN ORBIT  ·  OPTICAL', s);
    scr.text(ctx, `THROAT ≈ 2 km   ·   STABLE 48 y   ·   FRAME ${Math.floor(this.t * 4) % 1000}`, W / 2, H * 0.94, 10 * s, C.dim, 'center');
  }

  /** Plan of part of the facility with real door states, the lift, and everyone's actual position. */
  private plan(ctx: Ctx, W: number, H: number, view: number) {
    scr.bg(ctx, W, H, '#04080a');
    const V: [string, number, number, number, number][] = [
      ['TUNNEL · VEHICLE BAY', -22, 22, -6, 112], ['RESEARCH COMPLEX', -26, 22, 108, 234], ['ASSEMBLY HALL', -26, 26, 230, 284], ['LAUNCH CAVERN', -36, 28, 278, 332], ['PERIMETER', -40, 40, -150, -70],
    ];
    const [title, x0, x1, a0, a1] = V[view % V.length];
    this.head(ctx, W, `SECURITY — ${title}`);
    const m = 12, top = 40;
    const sc = Math.min((W - 2 * m) / (a1 - a0), (H - top - m) / (x1 - x0));
    const X = (along: number) => m + (along - a0) * sc, Y = (lat: number) => top + (lat - x0) * sc;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(X(a0), Y(x0), (a1 - a0) * sc, (x1 - x0) * sc);
    ctx.strokeStyle = 'rgba(160,220,215,0.2)';
    for (let a = Math.ceil(a0 / 10) * 10; a < a1; a += 10) { ctx.beginPath(); ctx.moveTo(X(a), Y(x0)); ctx.lineTo(X(a), Y(x1)); ctx.stroke(); }
    const z = this.zone, v = new THREE.Vector3();
    const dot = (p: THREE.Vector3Like, col: string, r = 3) => { this.site.toLocal(p, v); const al = -v.z; if (al < a0 || al > a1 || v.x < x0 || v.x > x1) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(al), Y(v.x), r, 0, 7); ctx.fill(); };
    for (const b of [this.site.building, this.site.launchB, this.site.gateB]) for (const d of b.slides.values()) { d.node.getWorldPosition(v); dot(v, d.open ? C.green : C.amber, 2.5); }
    if (this.site.lift && view === 3) { this.site.lift.node.getWorldPosition(v); dot(v, C.blue, 4); scr.mono(ctx, `LIFT ${this.site.lift.y.toFixed(0)} m`, W - 14, H - 12, 10, C.blue, 'right'); }
    if (z.nasaStaff) for (const n of z.nasaStaff.npcs.list) dot(n.pos, C.ink, 2.6);
    dot(z.game.player.pos, C.red, 3.4);
    scr.text(ctx, '● PERSONNEL   ● COMMANDER   ● DOOR', 14, H - 12, 9, C.dim);
  }
}
