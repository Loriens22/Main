// Amber LED destination signs and the TFT passenger-information screens of the tram.
import * as THREE from 'three';
import { LedDisplay, CanvasTex, FONT } from '../textures.js';

export class TramDisplays {
  constructor(line) {
    this.line = line;
    this.front = new LedDisplay(176, 22, { dot: 5 });
    this.side = new LedDisplay(128, 16, { dot: 5 });
    this.rear = new LedDisplay(40, 20, { dot: 6 });
    this.tft = new CanvasTex(640, 200);
    this.tft.texture.colorSpace = THREE.SRGBColorSpace;
    this.phase = 0;
    this.stops = [];
    this.next = '';
    this.drawAll();
  }
  drawAll() {
    const L = this.line;
    this.front.draw([
      { text: L.number, x: 2, size: 22, w: 26, font: FONT, bold: true },
      { text: this.phase ? L.destShort : L.viaShort, x: 101, align: 'center', size: 16, w: 146 },
    ]);
    this.side.draw([{ text: L.number, x: 1, size: 16, w: 18, font: FONT }, { text: L.destShort, x: 72, align: 'center', size: 13, w: 108 }]);
    this.rear.draw([{ text: L.number, x: 20, align: 'center', size: 20, font: FONT }]);
    this.drawTFT();
  }
  setInterior(text) { if (text === this.next) return; this.next = text; this.drawTFT(); }
  drawTFT() {
    const { ctx } = this.tft; const W = 640, H = 200;
    ctx.fillStyle = '#f4f5f6'; ctx.fillRect(0, 0, W, H);
    // left block: line number + date (orange / yellow as in Sofia trams)
    ctx.fillStyle = '#f39200'; ctx.fillRect(0, 0, 150, 92);
    ctx.fillStyle = '#ffffff'; ctx.font = `700 30px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('tram', 12, 46);
    ctx.font = `800 58px ${FONT}`; ctx.fillText(this.line.number, 94, 48);
    ctx.fillStyle = '#ffd200'; ctx.fillRect(0, 92, 150, 108);
    const d = new Date();
    ctx.fillStyle = '#1b1b1b'; ctx.font = `700 26px ${FONT}`; ctx.fillText(d.toTimeString().slice(0, 5), 14, 120);
    ctx.font = `600 18px ${FONT}`; ctx.fillText(d.toLocaleDateString('bg-BG'), 14, 160);
    // right: next stop + route line
    ctx.fillStyle = '#8a1c1c'; ctx.font = `600 20px ${FONT}`; ctx.fillText('Следваща спирка', 170, 30);
    ctx.fillStyle = '#111'; ctx.font = `800 34px ${FONT}`;
    let t = this.next.replace(/^Следваща спирка:\s*/, '').replace(/^Спирка:\s*/, '');
    let s = 34; while (ctx.measureText(t).width > 450 && s > 16) { s -= 2; ctx.font = `800 ${s}px ${FONT}`; }
    ctx.fillText(t, 170, 72);
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(180, 150); ctx.lineTo(620, 150); ctx.stroke();
    for (let k = 0; k < 6; k++) { ctx.fillStyle = k === 1 ? '#c62828' : '#fff'; ctx.strokeStyle = '#c62828'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(190 + k * 85, 150, 9, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.font = `500 15px ${FONT}`; ctx.fillText(this.line.destLong || '', 180, 185);
    this.tft.update();
  }
  tick(t) {
    const ph = Math.floor(t / 4) % 2;
    if (ph !== this.phase) { this.phase = ph; this.drawAll(); }
  }
}

/** Driver's desk TFT screens: speed gauge + status (left), train diagnostics with doors and traction (right). */
export class CabScreens {
  constructor() {
    this.left = new CanvasTex(384, 204); this.right = new CanvasTex(352, 204);
    for (const c of [this.left, this.right]) c.texture.colorSpace = THREE.SRGBColorSpace;
    this.t = 0; this.draw({ v: 0, thr: 0, brk: 0, power: true, panto: 'up', doors: [], park: true, gear: 'N', next: '', dist: 0 });
  }
  update(dt, s) { this.t -= dt; if (this.t > 0) return; this.t = 0.2; this.draw(s); }
  draw(s) {
    { // ---- left: speed ----
      const { ctx } = this.left, W = 384, H = 204;
      ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H);
      const cx = 110, cy = 112, R = 84, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, vmax = 70;
      ctx.lineWidth = 10; ctx.strokeStyle = '#1d2530'; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
      const kmh = Math.abs(s.v) * 3.6;
      ctx.strokeStyle = kmh > 50 ? '#ff4b3a' : '#29c7ff'; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.min(1, kmh / vmax)); ctx.stroke();
      ctx.fillStyle = '#9fb0c2'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let k = 0; k <= 70; k += 10) {
        const a = a0 + (a1 - a0) * (k / vmax);
        ctx.fillText(String(k), cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20));
      }
      const al = a0 + (a1 - a0) * (50 / vmax); ctx.strokeStyle = '#ff4b3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(al) * (R - 6), cy + Math.sin(al) * (R - 6)); ctx.lineTo(cx + Math.cos(al) * (R + 7), cy + Math.sin(al) * (R + 7)); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `800 44px ${FONT}`; ctx.fillText(String(Math.round(kmh)), cx, cy + 4);
      ctx.fillStyle = '#9fb0c2'; ctx.font = `600 13px ${FONT}`; ctx.fillText('km/h', cx, cy + 34);
      // traction / brake bar
      const bx = 226, by = 24, bh = 150;
      ctx.fillStyle = '#1d2530'; ctx.fillRect(bx, by, 16, bh);
      ctx.fillStyle = '#3ddc84'; ctx.fillRect(bx, by + bh / 2 - (bh / 2) * s.thr, 16, (bh / 2) * s.thr);
      ctx.fillStyle = '#ff4b3a'; ctx.fillRect(bx, by + bh / 2, 16, (bh / 2) * s.brk);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx - 3, by + bh / 2 - 1, 22, 2);
      ctx.textAlign = 'left'; ctx.font = `700 13px ${FONT}`;
      const row = (y, label, val, col) => { ctx.fillStyle = '#9fb0c2'; ctx.fillText(label, 256, y); ctx.fillStyle = col; ctx.fillText(val, 318, y); };
      row(34, 'ПОС.', s.gear, '#ffffff');
      row(62, 'U КМ', s.power ? `${600 + Math.round(Math.sin(performance.now() / 900) * 8)} V` : '0 V', s.power ? '#3ddc84' : '#ff4b3a');
      row(90, 'ПАНТ.', s.panto === 'up' ? 'ГОРЕ' : s.panto === 'down' ? 'ДОЛУ' : '…', s.panto === 'up' ? '#3ddc84' : '#ffc20e');
      row(118, 'СПИР.', s.park ? 'ПРУЖ.' : s.brk > 0.97 ? 'АВАР.' : s.brk > 0.02 ? 'ЕЛ.ДИН.' : '—', s.park || s.brk > 0.97 ? '#ff4b3a' : '#ffffff');
      row(146, 'ВРАТИ', s.doors.some((d) => d > 0.02) ? 'ОТВ.' : 'ЗАТВ.', s.doors.some((d) => d > 0.02) ? '#ffc20e' : '#3ddc84');
      ctx.fillStyle = '#29c7ff'; ctx.font = `600 12px ${FONT}`;
      const nx = (s.next || '').slice(0, 30); ctx.fillText(nx ? `► ${nx}  ${(s.dist / 1000).toFixed(2)} км` : '', 12, 192);
      this.left.update();
    }
    { // ---- right: diagnostics ----
      const { ctx } = this.right, W = 352, H = 204;
      ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#29c7ff'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('PESA SWING 122NaSF · 2312', 12, 16);
      // train schematic (modules A–E), doors on the right side
      const mods = [[12, 74], [90, 40], [134, 62], [200, 40], [244, 74]];
      mods.forEach(([x, w], i) => {
        ctx.fillStyle = '#1d2a3a'; ctx.strokeStyle = '#6f8aa6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, 50, w, 40, i === 0 ? [14, 3, 3, 14] : i === 4 ? [3, 14, 14, 3] : 3) : ctx.rect(x, 50, w, 40); ctx.fill(); ctx.stroke();
        if (i % 2 === 0) { ctx.fillStyle = '#6f8aa6'; ctx.fillRect(x + w / 2 - 12, 94, 24, 6); }
      });
      const doorX = [30, 102, 212, 290];
      s.doors.forEach((d, i) => { ctx.fillStyle = d > 0.02 ? (d > 0.98 ? '#ffc20e' : '#ff8a1c') : '#3ddc84'; ctx.fillRect(doorX[i] ?? 0, 86, 20, 6); });
      // pantograph on module C
      ctx.strokeStyle = s.panto === 'up' ? '#3ddc84' : '#ffc20e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(152, 50); ctx.lineTo(165, s.panto === 'up' ? 30 : 44); ctx.lineTo(178, 50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(155, s.panto === 'up' ? 30 : 44); ctx.lineTo(175, s.panto === 'up' ? 30 : 44); ctx.stroke();
      // traction current & rows
      const I = Math.round(s.thr * 820 * (s.power ? 1 : 0) - s.brk * 520 * Math.min(1, Math.abs(s.v) / 3));
      ctx.font = `700 13px ${FONT}`;
      const row = (y, a, b, col = '#fff') => { ctx.fillStyle = '#9fb0c2'; ctx.fillText(a, 12, y); ctx.fillStyle = col; ctx.fillText(b, 150, y); };
      row(122, 'Ток на тягата', `${I} A`, I >= 0 ? '#3ddc84' : '#29c7ff');
      row(144, 'Рекуперация', I < 0 ? 'АКТИВНА' : '—', I < 0 ? '#29c7ff' : '#fff');
      row(166, 'Климатизация', '22 °C · АВТО');
      ctx.fillStyle = '#6f8aa6'; ctx.font = `600 12px ${FONT}`; ctx.fillText(new Date().toTimeString().slice(0, 8), 12, 190);
      ctx.textAlign = 'right'; ctx.fillText('СИСТЕМА OK', W - 12, 190);
      this.right.update();
    }
  }
}
