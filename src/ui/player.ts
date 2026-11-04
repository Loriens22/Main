import type { Director } from '../core/director';
import { T } from '../core/util';

const SUBS = [
  { t0: T.manor.line1 - 0.1, t1: T.manor.line1 + 3.9, bg: 'Жено, какво си го направила тоя телевизор, бе? Не пали!', en: 'Woman, what have you done to this TV? It won’t turn on!' },
  { t0: T.manor.line2 - 0.1, t1: T.manor.line2 + 3.4, bg: 'Хм, къв е тоя канал, бе? Кво си гледала преди?', en: 'Hm, what channel is this? What were you watching before?' },
];
const SCALES: Record<string, number> = { high: 1.0, medium: 0.75, low: 0.5 };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Transport, audio-locked clock, adaptive resolution, rendered-video mode and
 *  MP4 download (via the artifact `downloads` capability when available). */
export class Player {
  audio: HTMLAudioElement;
  playing = false;
  t = 0;
  clock0 = 0;
  t0 = 0;
  audioOk = true;
  scale = 0.85;
  quality = 'auto';
  subs = false;
  mode: 'rt' | 'vid' = 'rt';
  frameMs: number[] = [];
  videoBlob: Promise<Blob> | null = null;
  $ = (id: string) => document.getElementById(id) as any;

  constructor(private D: Director, private canvas: HTMLCanvasElement, private base: string) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.src = `${base}assets/audio/soundtrack.m4a`;
    this.audio.addEventListener('error', () => { this.audioOk = false; this.status('Soundtrack unavailable — playing silently.'); });
    this.audio.addEventListener('ended', () => this.pause());
    this.$('scrub').max = String(T.duration);
    this.wire();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.$('frame'));
    const pb = this.$('playBig');
    pb.disabled = false;
    pb.textContent = 'Play film';
    this.$('loadtxt').textContent = 'Best with sound on';
    this.D.render(0.01);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  status(s: string) { this.$('status').textContent = s; }

  wire() {
    this.$('playBig').onclick = () => { this.$('poster').classList.add('gone'); this.play(); };
    this.$('play').onclick = () => (this.playing ? this.pause() : (this.$('poster').classList.add('gone'), this.play()));
    const sc = this.$('scrub') as HTMLInputElement;
    sc.oninput = () => this.seek(+sc.value);
    this.$('mute').onclick = () => {
      const m = !this.audio.muted;
      this.audio.muted = m;
      const v = this.$('video') as HTMLVideoElement; v.muted = m;
      this.$('mute').setAttribute('aria-pressed', String(m));
      this.$('mute').textContent = m ? 'Muted' : 'Mute';
    };
    this.$('subs').onclick = () => {
      this.subs = !this.subs;
      this.$('subs').setAttribute('aria-pressed', String(this.subs));
      this.updateSubs();
    };
    this.$('quality').onchange = (e: any) => { this.quality = e.target.value; if (this.quality !== 'auto') this.scale = SCALES[this.quality]; this.resize(); };
    this.$('modeRT').onclick = () => this.setMode('rt');
    this.$('modeVid').onclick = () => this.setMode('vid');
    this.$('dl').onclick = () => this.download();
    document.querySelectorAll<HTMLButtonElement>('.chapters button').forEach((b) => {
      b.onclick = () => { this.$('poster').classList.add('gone'); this.seek(+b.dataset.t!); if (!this.playing) this.play(); };
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); this.$('play').click(); }
    });
    const v = this.$('video') as HTMLVideoElement;
    v.addEventListener('ended', () => this.pause());
  }

  resize() {
    const f = this.$('frame') as HTMLElement;
    const r = f.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.round(r.width * dpr * this.scale));
    const h = Math.round(w * 9 / 16);
    if (w !== this.D.w || h !== this.D.h) { this.D.setSize(w, h); if (!this.playing) this.D.render(this.t); }
  }

  now() {
    if (this.mode === 'vid') return (this.$('video') as HTMLVideoElement).currentTime;
    if (this.playing && this.audioOk && !this.audio.paused) return this.audio.currentTime;
    if (this.playing) return this.t0 + (performance.now() - this.clock0) / 1000;
    return this.t;
  }

  async play() {
    if (this.t >= T.duration - 0.05) this.seek(0);
    this.playing = true;
    this.$('play').innerHTML = '&#10074;&#10074;';
    this.$('play').setAttribute('aria-label', 'Pause');
    if (this.mode === 'vid') { (this.$('video') as HTMLVideoElement).play().catch(() => {}); return; }
    this.t0 = this.t; this.clock0 = performance.now();
    if (this.audioOk) {
      try { this.audio.currentTime = this.t; await this.audio.play(); } catch (e) { this.audioOk = false; this.status('Tap Play again to enable sound.'); }
    }
  }

  pause() {
    this.t = this.now();
    this.playing = false;
    this.audio.pause();
    (this.$('video') as HTMLVideoElement).pause();
    this.$('play').innerHTML = '&#9654;';
    this.$('play').setAttribute('aria-label', 'Play');
    if (this.mode === 'rt') this.D.render(this.t);
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(T.duration, t));
    this.t0 = this.t; this.clock0 = performance.now();
    if (this.mode === 'vid') (this.$('video') as HTMLVideoElement).currentTime = this.t;
    else {
      try { this.audio.currentTime = this.t; } catch (e) { /* not loaded yet */ }
      if (!this.playing) this.D.render(this.t);
    }
    this.ui();
  }

  ui() {
    this.$('scrub').value = String(this.t);
    this.$('time').textContent = `${fmt(this.t)} / ${fmt(T.duration)}`;
    this.updateSubs();
  }

  updateSubs() {
    const el = this.$('sub') as HTMLElement;
    const c = this.subs ? SUBS.find((s) => this.t >= s.t0 && this.t <= s.t1) : null;
    el.hidden = !c;
    if (c) el.innerHTML = `${c.bg}<br><span style="opacity:.8;font-size:.86em">${c.en}</span>`;
  }

  loop() {
    requestAnimationFrame(this.loop);
    if (!this.playing) return;
    this.t = this.now();
    if (this.t >= T.duration) { this.t = T.duration; this.pause(); }
    this.ui();
    if (this.mode === 'vid') return;
    const a = performance.now();
    this.D.render(this.t);
    const ms = performance.now() - a;
    if (this.quality === 'auto') {
      this.frameMs.push(ms);
      if (this.frameMs.length >= 30) {
        const avg = this.frameMs.reduce((x, y) => x + y, 0) / this.frameMs.length;
        this.frameMs = [];
        const old = this.scale;
        if (avg > 30 && this.scale > 0.45) this.scale = Math.max(0.45, this.scale - 0.1);
        else if (avg < 14 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
        if (old !== this.scale) this.resize();
      }
    }
  }

  /* --------------------------------------------- rendered MP4 (chunked) */
  fetchVideo(): Promise<Blob> {
    if (this.videoBlob) return this.videoBlob;
    this.videoBlob = (async () => {
      const man = await (await fetch(`${this.base}assets/film/manifest.json`)).json();
      const parts: BlobPart[] = [];
      let got = 0;
      for (const p of man.parts) {
        const r = await fetch(`${this.base}assets/film/${p.file}`);
        if (!r.ok) throw new Error(`missing ${p.file}`);
        parts.push(await r.arrayBuffer());
        got += p.bytes;
        this.status(`Fetching rendered film… ${Math.round((got / man.bytes) * 100)}%`);
      }
      this.status('');
      return new Blob(parts, { type: 'video/mp4' });
    })();
    this.videoBlob.catch(() => { this.videoBlob = null; });
    return this.videoBlob;
  }

  async setMode(m: 'rt' | 'vid') {
    if (m === this.mode) return;
    const v = this.$('video') as HTMLVideoElement;
    const was = this.playing;
    this.pause();
    if (m === 'vid') {
      try {
        const blob = await this.fetchVideo();
        if (!v.src) v.src = URL.createObjectURL(blob);
      } catch (e) {
        this.status('The rendered video is not available here; the realtime film is shown instead.');
        return;
      }
      v.hidden = false; this.canvas.style.visibility = 'hidden';
      v.muted = this.audio.muted;
      this.mode = 'vid';
      v.currentTime = this.t;
    } else {
      this.t = v.currentTime || this.t;
      v.hidden = true; this.canvas.style.visibility = 'visible';
      this.mode = 'rt';
      this.D.render(this.t);
    }
    this.$('modeRT').setAttribute('aria-pressed', String(m === 'rt'));
    this.$('modeVid').setAttribute('aria-pressed', String(m === 'vid'));
    if (was) { this.$('poster').classList.add('gone'); this.play(); }
  }

  async download() {
    const btn = this.$('dl') as HTMLButtonElement;
    btn.disabled = true;
    try {
      const blob = await this.fetchVideo();
      const filename = 'Happy_birthday_Matex_1080p.mp4';
      const cl = (window as any).claude;
      const dl = cl?.use ? await cl.use('downloads') : null;
      if (dl) {
        try { await dl.save({ filename, data: blob }); this.status('Saved Happy_birthday_Matex_1080p.mp4'); }
        catch (e: any) { this.status(e?.code === 'declined' ? 'Download cancelled.' : `Download unavailable here (${e?.code || 'error'}).`); }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        this.status('Download started.');
      }
    } catch (e) {
      this.status('The rendered MP4 is not published yet.');
    } finally { btn.disabled = false; }
  }
}
