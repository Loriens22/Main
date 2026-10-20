import type {
  Emotion,
  InteractionKind,
  MascotAction,
  MascotAnchor,
  MascotId,
  MascotStageApi,
  Quality,
  RoamMode,
  StageStats,
} from './types';
import { Spring2, approach, clamp } from './util';

/**
 * Canvas2D fallback for devices without WebGL2. Same API, simplified drawing:
 * a soft gradient star with beret + eyes, and a little flame buddy.
 */
interface Mascot2D {
  id: MascotId;
  anchor: MascotAnchor | null;
  pos: Spring2;
  size: number;
  vis: number;
  emotion: Emotion;
  emotionUntil: number;
  bounceT: number;
  spinT: number;
  speak: number;
  speakAt: number;
  roam: RoamMode;
  visit: { x: number; y: number; until: number; resolve: () => void; arrived: boolean } | null;
  sx: number;
  sy: number;
}

export class Fallback2DStage implements MascotStageApi {
  private ctx: CanvasRenderingContext2D;
  private m: Record<MascotId, Mascot2D>;
  private theme: 'light' | 'dark';
  private reduced = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private t = 0;
  private W = 1;
  private H = 1;
  private dpr = 1;
  private listeners = new Set<(id: MascotId, kind: InteractionKind) => void>();
  private look: { x: number; y: number } | null = null;
  private consumedAt = 0;

  constructor(private canvas: HTMLCanvasElement, theme: 'light' | 'dark', reducedMotion = false) {
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
    this.reduced = reducedMotion;
    const mk = (id: MascotId): Mascot2D => ({
      id,
      anchor: null,
      pos: new Spring2(0, 0, 2.5, 0.85),
      size: 0,
      vis: 0,
      emotion: 'idle',
      emotionUntil: 0,
      bounceT: -1,
      spinT: -1,
      speak: 0,
      speakAt: -1,
      roam: 'off',
      visit: null,
      sx: 0,
      sy: 0,
    });
    this.m = { maverick: mk('maverick'), sparky: mk('sparky') };
    this.resize();
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { capture: true, passive: false });
    window.addEventListener('click', this.onClick, { capture: true });
    document.addEventListener('visibilitychange', this.onVis);
    this.wake();
  }

  setAnchor(id: MascotId, anchor: MascotAnchor | null, opts?: { immediate?: boolean }) {
    const m = this.m[id];
    const first = !m.anchor;
    m.anchor = anchor ? { ...anchor } : null;
    if (anchor && (first || opts?.immediate)) {
      m.pos.set(anchor.x, anchor.y);
      m.size = anchor.size;
    }
    this.wake();
  }
  setEmotion(id: MascotId, emotion: Emotion, opts?: { durationMs?: number }) {
    const m = this.m[id];
    m.emotion = emotion;
    m.emotionUntil = opts?.durationMs ? this.t + opts.durationMs / 1000 : 0;
    if (emotion === 'celebrate' || emotion === 'excited') m.bounceT = 0;
    this.wake();
  }
  react(id: MascotId, action: MascotAction) {
    const m = this.m[id];
    if (action === 'spin' || action === 'celebrate') m.spinT = 0;
    m.bounceT = 0;
    this.wake();
  }
  setSpeaking(id: MascotId, level: number) {
    const m = this.m[id];
    m.speak = clamp(level, 0, 1);
    m.speakAt = this.t;
    this.wake();
  }
  setLookAt(target: { x: number; y: number } | null) {
    this.look = target;
  }
  roam(id: MascotId, mode: RoamMode) {
    this.m[id].roam = mode;
  }
  moveTo(id: MascotId, point: { x: number; y: number }) {
    const m = this.m[id];
    m.visit?.resolve();
    return new Promise<void>((resolve) => {
      m.visit = { ...point, until: 0, resolve, arrived: false };
      this.wake();
    });
  }
  hitTest(x: number, y: number): MascotId | null {
    for (const id of ['sparky', 'maverick'] as MascotId[]) {
      const m = this.m[id];
      if (m.vis < 0.3) continue;
      if (Math.hypot(x - m.sx, y - m.sy) < m.size * 0.45) return id;
    }
    return null;
  }
  getPosition(id: MascotId) {
    const m = this.m[id];
    if (!m.anchor && m.vis < 0.01) return null;
    return { x: m.sx, y: m.sy, size: m.size * m.vis, visible: m.vis > 0.05 };
  }
  onInteract(cb: (id: MascotId, kind: InteractionKind) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
  }
  setQuality(_q: Quality) {}
  setReducedMotion(v: boolean) {
    this.reduced = v;
  }
  setPaused(p: boolean) {
    this.paused = p;
    if (p) cancelAnimationFrame(this.raf), (this.raf = 0);
    else this.wake();
  }
  resize() {
    this.W = this.canvas.clientWidth || window.innerWidth;
    this.H = this.canvas.clientHeight || window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.wake();
  }
  getStats(): StageStats {
    return { fps: 60, frameMs: 16.7, drawCalls: 0, triangles: 0, quality: 'low', dpr: this.dpr };
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.onDown, { capture: true });
    window.removeEventListener('click', this.onClick, { capture: true });
    document.removeEventListener('visibilitychange', this.onVis);
    this.listeners.clear();
  }

  private onResize = () => this.resize();
  private onVis = () => (document.hidden ? (cancelAnimationFrame(this.raf), (this.raf = 0)) : this.wake());
  private onDown = (e: PointerEvent) => {
    const id = this.hitTest(e.clientX, e.clientY);
    if (!id) return;
    e.stopPropagation();
    e.preventDefault();
    this.consumedAt = performance.now();
    this.react(id, 'poke');
    this.setEmotion(id, 'happy', { durationMs: 1200 });
    for (const l of this.listeners) l(id, 'tap');
  };
  private onClick = (e: MouseEvent) => {
    if (performance.now() - this.consumedAt < 450) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  private wake() {
    if (this.raf || this.paused || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;
    this.t += dt;
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    let any = false;
    const mav = this.m.maverick;
    for (const id of ['maverick', 'sparky'] as MascotId[]) {
      const m = this.m[id];
      if (m.emotionUntil && this.t > m.emotionUntil) {
        m.emotion = 'idle';
        m.emotionUntil = 0;
      }
      if (this.t - m.speakAt > 0.25) m.speak = 0;
      let hx = m.anchor?.x;
      let hy = m.anchor?.y;
      let size = m.anchor?.size ?? 0;
      if (id === 'sparky' && !m.anchor && mav.anchor) {
        hx = mav.pos.x + mav.size * 0.56;
        hy = mav.pos.y - mav.size * 0.3;
        size = mav.size * 0.42;
        if (m.vis === 0) m.pos.set(hx, hy);
      }
      const want = hx !== undefined;
      m.vis = approach(m.vis, want ? 1 : 0, 8, dt);
      if (hx === undefined || hy === undefined) {
        if (m.vis < 0.01) continue;
        hx = m.pos.x;
        hy = m.pos.y;
      }
      let tx = hx;
      let ty = hy;
      if (m.visit) {
        tx = m.visit.x;
        ty = m.visit.y;
        if (!m.visit.arrived && Math.hypot(m.pos.x - tx, m.pos.y - ty) < 6) {
          m.visit.arrived = true;
          m.visit.until = this.t + 2.5;
          m.visit.resolve();
        }
        if (m.visit.arrived && this.t > m.visit.until) m.visit = null;
      }
      m.pos.step(tx, ty, dt);
      m.size = approach(m.size, size || m.size, 6, dt);
      any = true;
      let bounce = 0;
      if (m.bounceT >= 0) {
        m.bounceT += dt;
        bounce = Math.sin(Math.min(1, m.bounceT / 0.6) * Math.PI) * m.size * 0.25;
        if (m.bounceT > 0.6) m.bounceT = -1;
      }
      let spin = 1;
      if (m.spinT >= 0) {
        m.spinT += dt;
        spin = Math.cos(Math.min(1, m.spinT / 0.9) * Math.PI * 2);
        if (m.spinT > 0.9) m.spinT = -1;
      }
      const bob = this.reduced ? 0 : Math.sin(this.t * 2.2 + (id === 'sparky' ? 1 : 0)) * m.size * 0.025;
      const x = m.pos.x;
      const y = m.pos.y - bounce + bob;
      m.sx = x;
      m.sy = y;
      g.save();
      g.globalAlpha = clamp(m.vis, 0, 1);
      g.translate(x, y);
      g.scale(spin * m.vis, m.vis);
      if (id === 'maverick') this.drawStar(g, m);
      else this.drawSparky(g, m);
      g.restore();
    }
    if (any) this.raf = requestAnimationFrame(this.loop);
  };

  private eyes(g: CanvasRenderingContext2D, m: Mascot2D, r: number, ex: number, ey: number, ink: string) {
    const happy = m.emotion === 'happy' || m.emotion === 'celebrate' || m.emotion === 'love' || m.emotion === 'excited';
    const blink = Math.sin(this.t * 1.3) > 0.985;
    const lx = this.look ? clamp((this.look.x - m.sx) / (m.size * 3), -1, 1) * r * 0.04 : 0;
    for (const s of [-1, 1]) {
      const x = s * ex + lx;
      g.fillStyle = ink;
      g.strokeStyle = ink;
      if (happy) {
        g.lineWidth = r * 0.05;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(x, ey + r * 0.03, r * 0.06, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else if (blink || m.emotion === 'sleepy') {
        g.lineWidth = r * 0.03;
        g.beginPath();
        g.moveTo(x - r * 0.05, ey);
        g.lineTo(x + r * 0.05, ey);
        g.stroke();
      } else {
        const w = m.emotion === 'surprised' ? 1.3 : 1;
        g.beginPath();
        g.ellipse(x, ey, r * 0.06 * w, r * 0.078 * w, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x - r * 0.02, ey - r * 0.03, r * 0.016, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (m.speak > 0.05) {
      g.fillStyle = '#3a0a14';
      g.beginPath();
      g.ellipse(0, ey + r * 0.2, r * 0.06, r * (0.02 + m.speak * 0.06), 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawStar(g: CanvasRenderingContext2D, m: Mascot2D) {
    const r = m.size / 2 / 1.1;
    const sad = m.emotion === 'error' || m.emotion === 'sad';
    g.save();
    g.shadowColor = this.theme === 'dark' ? 'rgba(80,160,255,0.55)' : 'rgba(30,80,160,0.35)';
    g.shadowBlur = r * 0.18;
    const grd = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    grd.addColorStop(0, sad ? '#7c9cc4' : '#7cc0ff');
    grd.addColorStop(0.55, sad ? '#4f74a6' : '#2f8cff');
    grd.addColorStop(1, sad ? '#2e4b74' : '#1458c9');
    g.fillStyle = grd;
    g.beginPath();
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const aw = a > 0 && a < Math.PI ? a + 0.22 * Math.sin(2 * a) : a;
      const c = 0.5 + 0.5 * Math.cos(6 * aw);
      const up = Math.max(0, Math.sin(a));
      const tuck = 1 - 0.2 * Math.min(1, Math.max(0, (up - 0.62) / 0.38));
      const R = r * (0.66 + 0.34 * Math.pow(c, 1.25)) * tuck;
      const x = Math.cos(a) * R;
      const y = -Math.sin(a) * R;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
    g.restore();
    // beret
    // Domed beret tilted down to the right, sitting in the top dip.
    g.save();
    g.translate(r * 0.02, -r * 0.74);
    g.rotate(0.2);
    g.fillStyle = '#1a1a20';
    g.beginPath();
    g.ellipse(0, -r * 0.1, r * 0.58, r * 0.27, 0, Math.PI, 0);
    g.ellipse(0, -r * 0.1, r * 0.58, r * 0.1, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#26262e';
    g.beginPath();
    g.ellipse(0, -r * 0.02, r * 0.48, r * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.ellipse(-r * 0.18, -r * 0.27, r * 0.24, r * 0.06, -0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1a20';
    g.beginPath();
    g.arc(0, -r * 0.39, r * 0.04, 0, Math.PI * 2);
    g.fill();
    g.restore();
    this.eyes(g, m, r, r * 0.255, -r * 0.17, '#060608');
  }

  private drawSparky(g: CanvasRenderingContext2D, m: Mascot2D) {
    const r = m.size / 2 / 0.78;
    // flame
    const fl = 0.78 + Math.sin(this.t * 13) * 0.05 + Math.sin(this.t * 7.1) * 0.04;
    const blue = m.emotion === 'error';
    const fg = g.createLinearGradient(0, -r * 0.3, 0, -r * 1.5 * fl);
    fg.addColorStop(0, blue ? '#6e8bff' : '#ff4a1c');
    fg.addColorStop(0.5, blue ? '#9fc0ff' : '#ff9a1c');
    fg.addColorStop(1, 'rgba(255,220,90,0)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(-r * 0.36, -r * 0.3);
    g.quadraticCurveTo(-r * 0.4, -r * 0.9 * fl, 0, -r * 1.45 * fl);
    g.quadraticCurveTo(r * 0.4, -r * 0.9 * fl, r * 0.36, -r * 0.3);
    g.fill();
    // body
    const bg = g.createLinearGradient(0, -r * 0.45, 0, r * 0.45);
    bg.addColorStop(0, '#ffe2bf');
    bg.addColorStop(1, '#ff9f5a');
    g.fillStyle = bg;
    const w = r;
    const h = r * 0.9;
    const rr = r * 0.3;
    g.beginPath();
    g.moveTo(-w / 2 + rr, -h / 2);
    g.arcTo(w / 2, -h / 2, w / 2, h / 2, rr);
    g.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
    g.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr);
    g.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr);
    g.fill();
    this.eyes(g, m, r * 1.6, r * 0.28, -r * 0.05, '#1b0f12');
  }
}
