import * as THREE from 'three';
import type { Spacecraft, FlightEnv } from './Spacecraft';

export interface HudTarget {
  name: string;
  /** relative position target − craft (world frame) and relative velocity */
  relPos: THREE.Vector3;
  relVel: THREE.Vector3;
  /** port axis (world) pointing out of the port, and roll reference */
  portAxis?: THREE.Vector3;
  alignErr?: number; // deg
  rollErr?: number; // deg
  lateral?: number; // m
}

export interface HudInfo {
  title: string;
  autopilot: string | null;
  messages: string[];
  target?: HudTarget | null;
  orbit?: { body: string; ap: number; pe: number; period: number; inc: number } | null;
  extra?: [string, string][];
  timeWarp?: number;
}

/** Canvas flight HUD: attitude, velocity vector, gauges, docking display, orbital data, autopilot status. */
export class FlightHUD {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  constructor(private parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flighthud';
    parent.append(this.canvas);
    this.g = this.canvas.getContext('2d')!;
  }

  dispose() {
    this.canvas.remove();
  }

  /** compact layout for touch screens: blocks move to the top corners, clear of the on-screen sticks and buttons */
  compact = false;

  draw(craft: Spacecraft, env: FlightEnv, cam: THREE.PerspectiveCamera, info: HudInfo) {
    const c = this.canvas;
    // the HUD layer is cleared whenever control changes hands; the active controller re-attaches its canvas
    if (!c.isConnected) this.parent.append(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = '11px JetBrains Mono, monospace';
    g.lineWidth = 1.2;
    const accent = 'rgba(159,212,234,0.92)';
    const dim = 'rgba(236,235,230,0.62)';
    const up = new THREE.Vector3(...env.up(craft.pos));
    const vel = new THREE.Vector3(...craft.vel);
    const sv = env.surfaceVel?.(craft.pos);
    const vSurf = sv ? vel.clone().sub(new THREE.Vector3(...sv)) : vel.clone();
    const alt = env.altitude(craft.pos);
    const vs = vel.dot(up);
    const spd = (env.density(craft.pos) > 1e-4 ? vSurf : vel).length();
    // --- velocity vector markers (prograde / retrograde) on screen
    const proj = (dirWorld: THREE.Vector3) => {
      const p = cam.position.clone().add(dirWorld.clone().multiplyScalar(1000));
      const v = p.project(cam);
      if (v.z > 1 || v.z < -1) return null;
      return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
    };
    const vdir = (env.density(craft.pos) > 1e-4 ? vSurf : vel).clone();
    if (vdir.lengthSq() > 1) {
      vdir.normalize();
      const pp = proj(vdir);
      if (pp) this.marker(pp[0], pp[1], accent, 'pro');
      const pr = proj(vdir.clone().negate());
      if (pr) this.marker(pr[0], pr[1], 'rgba(232,192,112,0.9)', 'retro');
    }
    // nose marker
    const fwd = craft.forward();
    const pn = proj(fwd);
    if (pn) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.moveTo(pn[0] - 18, pn[1]); g.lineTo(pn[0] - 6, pn[1]); g.lineTo(pn[0], pn[1] + 6); g.lineTo(pn[0] + 6, pn[1]); g.lineTo(pn[0] + 18, pn[1]);
      g.stroke();
    }
    // horizon line (when within a gravity well & close to the planet)
    if (alt < 2e6) {
      const right = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
      if (right.lengthSq() < 0.1) right.set(1, 0, 0);
      const fwdH = new THREE.Vector3().crossVectors(right, up).normalize();
      const pts: number[][] = [];
      for (let k = -6; k <= 6; k++) {
        const a = (k / 6) * Math.PI;
        const d = fwdH.clone().multiplyScalar(Math.cos(a)).add(right.clone().multiplyScalar(Math.sin(a)));
        const pr = proj(d);
        if (pr) pts.push(pr);
      }
      if (pts.length > 1) {
        g.strokeStyle = 'rgba(236,235,230,0.25)';
        g.setLineDash([6, 8]);
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
        g.setLineDash([]);
      }
    }
    const cpt = this.compact;
    if (cpt) {
      this.drawCompact(craft, env, info, W, H, spd, alt, vs);
      if (info.target) this.drawDocking(info.target, W, H);
      return;
    }
    // --- left block: speed / altitude / vertical speed
    const lx = 26, ly = H * 0.36;
    g.fillStyle = dim;
    g.fillText(env.density(craft.pos) > 1e-4 ? 'AIRSPEED' : 'ORBITAL VEL', lx, ly);
    g.fillStyle = '#ecebe6';
    g.font = '22px Michroma, sans-serif';
    g.fillText(spd < 10000 ? `${spd.toFixed(1)}` : `${(spd / 1000).toFixed(2)}k`, lx, ly + 26);
    g.font = '11px JetBrains Mono, monospace';
    g.fillStyle = dim;
    g.fillText('m/s', lx + 120, ly + 26);
    g.fillText('ALTITUDE', lx, ly + 52);
    g.fillStyle = '#ecebe6';
    g.font = '18px Michroma, sans-serif';
    g.fillText(alt < 1e5 ? `${alt.toFixed(0)} m` : `${(alt / 1000).toFixed(1)} km`, lx, ly + 74);
    g.font = '11px JetBrains Mono, monospace';
    g.fillStyle = dim;
    g.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, lx, ly + 96);
    const gacc = new THREE.Vector3(...env.gravity(craft.pos)).length();
    const twr = (craft.spec.mainThrust * craft.efficiency) / (craft.mass * Math.max(gacc, 1e-6));
    g.fillText(gacc > 0.05 ? `TWR ${twr.toFixed(2)}` : 'TWR —', lx, ly + 112);
    // throttle bar
    const bx = lx, by = ly + 130, bh = 120;
    g.strokeStyle = 'rgba(236,235,230,0.35)';
    g.strokeRect(bx, by, 10, bh);
    g.fillStyle = 'rgba(217,201,163,0.85)';
    g.fillRect(bx, by + bh * (1 - craft.throttle), 10, bh * craft.throttle);
    if (craft.spec.vtolThrust > 0) {
      g.strokeRect(bx + 18, by, 10, bh);
      g.fillStyle = 'rgba(159,212,234,0.85)';
      g.fillRect(bx + 18, by + bh * (1 - craft.vtol), 10, bh * craft.vtol);
    }
    g.fillStyle = dim;
    g.fillText('MAIN', bx - 2, by + bh + 14);
    if (craft.spec.vtolThrust > 0) g.fillText('VTOL', bx + 22, by + bh + 28);
    // --- right block: propellant, Δv, systems
    const rx = W - 210, ry = H * 0.36;
    const frac = craft.state.fuelMax > 0 ? craft.state.fuel / craft.state.fuelMax : 0;
    g.fillStyle = dim;
    g.fillText('PROPELLANT', rx, ry);
    g.strokeStyle = 'rgba(236,235,230,0.35)';
    g.strokeRect(rx, ry + 8, 170, 6);
    g.fillStyle = frac < 0.1 ? '#ef7d6a' : frac < 0.25 ? '#e8c070' : accent;
    g.fillRect(rx, ry + 8, 170 * frac, 6);
    g.fillStyle = '#ecebe6';
    g.fillText(`${Math.round(craft.state.fuel).toLocaleString()} kg  (${Math.round(frac * 100)}%)`, rx, ry + 30);
    g.fillText(`Δv ${(craft.deltaV() / 1000).toFixed(2)} km/s`, rx, ry + 46);
    g.fillText(`MASS ${(craft.mass / 1000).toFixed(1)} t`, rx, ry + 62);
    const flags: [string, boolean][] = [['SAS ' + craft.sas.toUpperCase(), craft.sas !== 'off'], ['RCS', craft.rcsOn], ['GEAR', craft.gearDown], ['ENG', craft.engineOn]];
    flags.forEach(([t, on], i) => {
      g.fillStyle = on ? accent : 'rgba(236,235,230,0.35)';
      g.fillText(t, rx, ry + 88 + i * 16);
    });
    if (info.timeWarp && info.timeWarp !== 1) {
      g.fillStyle = '#e8c070';
      g.fillText(`TIME ×${info.timeWarp}`, rx, ry + 160);
    }
    let ey = ry + 180;
    for (const [k, v] of info.extra ?? []) {
      g.fillStyle = dim;
      g.fillText(k, rx, ey);
      g.fillStyle = '#ecebe6';
      g.fillText(v, rx + 92, ey);
      ey += 15;
    }
    // --- orbit block
    if (info.orbit) {
      const o = info.orbit;
      const oy = 26;
      g.fillStyle = dim;
      g.fillText(`ORBIT · ${o.body.toUpperCase()}`, W - 210, oy + 6);
      g.fillStyle = '#ecebe6';
      const km = (m: number) => (isFinite(m) ? `${(m / 1000).toFixed(0)} km` : 'ESCAPE');
      g.fillText(`Ap ${km(o.ap)}`, W - 210, oy + 24);
      g.fillText(`Pe ${km(o.pe)}`, W - 210, oy + 40);
      g.fillText(`T  ${fmtPeriod(o.period)}`, W - 210, oy + 56);
      g.fillText(`i  ${o.inc.toFixed(1)}°`, W - 210, oy + 72);
    }
    // --- title / autopilot / messages
    g.textAlign = 'center';
    g.fillStyle = '#ecebe6';
    g.font = '11px Michroma, sans-serif';
    g.fillText(info.title, W / 2, 30);
    if (info.autopilot) {
      g.fillStyle = '#9fd4ea';
      g.fillText(`AUTOPILOT · ${info.autopilot}`, W / 2, 50);
    }
    g.font = '12px Inter, sans-serif';
    info.messages.slice(0, 4).forEach((m, i) => {
      g.fillStyle = 'rgba(236,235,230,0.85)';
      g.fillText(m, W / 2, H - 120 + i * 18);
    });
    g.textAlign = 'left';
    // --- docking display
    if (info.target) this.drawDocking(info.target, W, H);
  }

  /** Touch layout: speed/altitude top-left under the status line, propellant/orbit top-right under the button bar. */
  private drawCompact(craft: Spacecraft, env: FlightEnv, info: HudInfo, W: number, H: number, spd: number, alt: number, vs: number) {
    const g = this.g;
    const dim = 'rgba(236,235,230,0.62)', fg = '#ecebe6', accent = 'rgba(159,212,234,0.92)';
    const lx = 12, ly = 74;
    g.font = '9px JetBrains Mono, monospace';
    g.fillStyle = dim;
    g.fillText(env.density(craft.pos) > 1e-4 ? 'AIRSPEED' : 'ORBITAL VEL', lx, ly);
    g.fillStyle = fg;
    g.font = '15px Michroma, sans-serif';
    g.fillText(`${spd < 10000 ? spd.toFixed(1) : (spd / 1000).toFixed(2) + 'k'} m/s`, lx, ly + 19);
    g.font = '9px JetBrains Mono, monospace';
    g.fillStyle = dim;
    g.fillText('ALTITUDE', lx, ly + 36);
    g.fillStyle = fg;
    g.font = '13px Michroma, sans-serif';
    g.fillText(alt < 1e5 ? `${alt.toFixed(0)} m` : `${(alt / 1000).toFixed(1)} km`, lx, ly + 53);
    g.font = '9px JetBrains Mono, monospace';
    g.fillStyle = dim;
    g.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, lx, ly + 68);
    if (craft.spec.vtolThrust > 0) {
      g.fillText('VTOL', lx, ly + 84);
      g.strokeStyle = 'rgba(236,235,230,0.35)';
      g.strokeRect(lx + 32, ly + 77, 60, 6);
      g.fillStyle = 'rgba(159,212,234,0.85)';
      g.fillRect(lx + 32, ly + 77, 60 * craft.vtol, 6);
    }
    // right column
    const rx = W - 168, ry = 64;
    const frac = craft.state.fuelMax > 0 ? craft.state.fuel / craft.state.fuelMax : 0;
    g.fillStyle = dim;
    g.fillText(`PROP ${Math.round(frac * 100)}% · Δv ${(craft.deltaV() / 1000).toFixed(2)} km/s`, rx, ry);
    g.strokeStyle = 'rgba(236,235,230,0.35)';
    g.strokeRect(rx, ry + 5, 156, 4);
    g.fillStyle = frac < 0.1 ? '#ef7d6a' : frac < 0.25 ? '#e8c070' : accent;
    g.fillRect(rx, ry + 5, 156 * frac, 4);
    let y = ry + 22;
    if (info.orbit) {
      const o = info.orbit;
      const km = (m: number) => (isFinite(m) ? `${(m / 1000).toFixed(0)}` : '∞');
      g.fillStyle = fg;
      g.fillText(`${o.body} ${km(o.pe)}×${km(o.ap)} km · i ${o.inc.toFixed(0)}°`, rx, y);
      y += 13;
    }
    const flags: [string, boolean][] = [['SAS ' + craft.sas.toUpperCase(), craft.sas !== 'off'], ['RCS', craft.rcsOn], ['GEAR', craft.gearDown]];
    let fx = rx;
    for (const [t, on] of flags) {
      g.fillStyle = on ? accent : 'rgba(236,235,230,0.35)';
      g.fillText(t, fx, y);
      fx += g.measureText(t).width + 10;
    }
    y += 13;
    if (info.timeWarp && info.timeWarp !== 1) {
      g.fillStyle = '#e8c070';
      g.fillText(`TIME ×${info.timeWarp}`, rx, y);
      y += 13;
    }
    for (const [k, v] of (info.extra ?? []).slice(0, 3)) {
      g.fillStyle = dim;
      g.fillText(k, rx, y);
      g.fillStyle = fg;
      g.fillText(v, rx + 56, y);
      y += 12;
    }
    g.textAlign = 'center';
    g.font = '10px Michroma, sans-serif';
    if (info.autopilot) {
      g.fillStyle = '#9fd4ea';
      g.fillText(`AUTOPILOT · ${info.autopilot}`, W / 2, 66);
    }
    g.font = '11px Inter, sans-serif';
    info.messages.slice(0, 3).forEach((m, i) => {
      g.fillStyle = 'rgba(236,235,230,0.85)';
      g.fillText(m, W / 2, H - 70 + i * 15);
    });
    g.textAlign = 'left';
  }

  private marker(x: number, y: number, col: string, kind: 'pro' | 'retro') {
    const g = this.g;
    g.strokeStyle = col;
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.stroke();
    if (kind === 'pro') {
      g.beginPath();
      g.moveTo(x, y - 8); g.lineTo(x, y - 15);
      g.moveTo(x - 8, y); g.lineTo(x - 15, y);
      g.moveTo(x + 8, y); g.lineTo(x + 15, y);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6);
      g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6);
      g.stroke();
    }
  }

  private drawDocking(t: HudTarget, W: number, H: number) {
    const g = this.g;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * (this.compact ? 0.15 : 0.18);
    g.strokeStyle = 'rgba(159,212,234,0.5)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.25, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const range = t.relPos.length();
    const closing = -t.relVel.dot(t.relPos.clone().normalize());
    const lat = t.lateral ?? 0;
    const ok = (b: boolean) => (b ? '#8fd6a2' : '#e8c070');
    g.font = this.compact ? '10px JetBrains Mono, monospace' : '12px JetBrains Mono, monospace';
    const lines: [string, string, boolean][] = [
      ['TARGET', t.name, true],
      ['RANGE', range < 1000 ? `${range.toFixed(2)} m` : `${(range / 1000).toFixed(2)} km`, true],
      ['CLOSING', `${closing.toFixed(2)} m/s`, range > 50 ? closing < 5 : range > 5 ? closing < 1 : closing < 0.3],
      ['LATERAL', `${lat.toFixed(2)} m`, lat < 0.3],
      ['ALIGN', `${(t.alignErr ?? 0).toFixed(1)}°`, (t.alignErr ?? 0) < 5],
      ['ROLL', `${(t.rollErr ?? 0).toFixed(1)}°`, Math.abs(t.rollErr ?? 0) < 5],
    ];
    lines.forEach(([k, v, good], i) => {
      g.fillStyle = 'rgba(236,235,230,0.6)';
      const step = this.compact ? 14 : 18, kx = this.compact ? cx - R - 150 : cx + R + 24;
      g.fillText(k, kx, cy - R + 14 + i * step);
      g.fillStyle = ok(good);
      g.fillText(v, kx + (this.compact ? 64 : 80), cy - R + 14 + i * step);
    });
  }
}

function fmtPeriod(s: number) {
  if (!isFinite(s)) return '—';
  if (s < 3 * 3600) return `${(s / 60).toFixed(1)} min`;
  if (s < 3 * 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
}
