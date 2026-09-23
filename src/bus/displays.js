// Destination LED signs, interior next-stop display and the BT902 informator face (canvas textures).
import * as THREE from 'three';
import { LedDisplay, CanvasTex, FONT, FONT_MONO } from '../textures.js';

export class BusDisplays {
  constructor() {
    this.front = new LedDisplay(168, 22, { dot: 5 });
    this.side = new LedDisplay(120, 16, { dot: 5 });
    this.rear = new LedDisplay(28, 18, { dot: 6 });
    this.interior = new LedDisplay(150, 11, { dot: 5, color: [255, 40, 25], off: [40, 6, 4] });
    this.route = '9';
    this.dest = 'ПЛ. СТОЧНА ГАРА';
    this.via = 'ж.к. Борово';
    this.phase = 0;
    this.drawAll();
  }
  drawAll(next) {
    const r = this.route;
    this.front.draw([
      { text: r, x: 2, size: 22, w: 26, font: FONT, bold: true },
      { text: this.phase ? this.dest : 'ж.к.Борово - ПЛ.СТ.ГАРА', x: 97, align: 'center', size: 17, w: 136 },
    ]);
    this.side.draw([
      { text: r, x: 1, size: 16, w: 16, font: FONT },
      { text: this.dest, x: 68, align: 'center', size: 13, w: 100 },
    ]);
    this.rear.draw([{ text: r, x: 14, align: 'center', size: 18, font: FONT }]);
    this.setInterior(next || 'Линия 9  →  пл. Сточна гара');
  }
  setInterior(text) {
    if (text === this._int) return;
    this._int = text;
    this.interior.draw([{ text, x: 75, align: 'center', size: 11, w: 148, bold: false }]);
  }
  tick(t) {
    // front sign alternates between full route and destination every 4 s
    const ph = Math.floor(t / 4) % 2;
    if (ph !== this.phase) { this.phase = ph; this.drawAll(this._int); }
  }
}

/** 3D face of the Bustec BT902 informator, mirrors the HTML replica. */
export class InformatorFace {
  constructor() {
    this.ct = new CanvasTex(640, 332);
    this.ct.texture.colorSpace = THREE.SRGBColorSpace;
    this.lines = ['BT902', 'FW: 000022_V0081', 'DB: 1910190857', 'SD: No card installed', 'ID: -000001'];
    this.leds = { err: false, start: false, run: true, load: false };
    this.draw();
  }
  set(lines, leds) {
    const key = lines.join('|') + JSON.stringify(leds);
    if (key === this._key) return;
    this._key = key; this.lines = lines; this.leds = leds; this.draw();
  }
  draw() {
    const { ctx } = this.ct; const W = 640, H = 332;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#262626'); g.addColorStop(1, '#111');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 4; ctx.strokeRect(12, 12, W - 24, H - 24);
    // logo
    ctx.fillStyle = '#e57f2c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(34 + i * 7, 34 + j * 7, 2.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#bdbdbd'; ctx.font = `600 30px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('bustec', 68, 46);
    ctx.fillStyle = '#e8e8e8'; ctx.textAlign = 'right'; ctx.fillText('BT902', W - 30, 46); ctx.textAlign = 'left';
    // LEDs
    const leds = [['ERROR', this.leds.err, '#ff3b30', '#3b1414'], ['START', this.leds.start, '#6dff6d', '#173817'], ['RUN', this.leds.run, '#6dff6d', '#173817'], ['LOAD', this.leds.load, '#6dff6d', '#173817']];
    ctx.font = `600 15px ${FONT}`;
    leds.forEach(([name, on, c1, c0], i) => {
      const y = 96 + i * 30; ctx.fillStyle = '#ddd'; ctx.fillText(name, 30, y);
      ctx.fillStyle = on ? c1 : c0; ctx.beginPath(); ctx.arc(110, y, 7, 0, 7); ctx.fill();
      if (on) { ctx.shadowColor = c1; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; }
    });
    // LCD
    const lx = 130, ly = 78, lw = 380, lh = 150;
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh); lg.addColorStop(0, '#ffb52e'); lg.addColorStop(1, '#f39510');
    ctx.fillStyle = lg; ctx.fillRect(lx, ly, lw, lh); ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 3; ctx.strokeRect(lx, ly, lw, lh);
    ctx.fillStyle = '#2b1900'; ctx.font = `700 21px ${FONT_MONO}`;
    this.lines.slice(0, 5).forEach((l, i) => ctx.fillText(l.slice(0, 29), lx + 10, ly + 18 + i * 28.5));
    // softkey outlines under LCD
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(lx + 45 + i * 95, ly + lh + 4); ctx.lineTo(lx + 45 + i * 95, ly + lh + 16); ctx.stroke(); }
    ctx.fillStyle = '#ddd'; ctx.font = `600 20px ${FONT}`; ctx.fillText('USB', 30, 290); ctx.fillText('SETUP', 540, 250);
    this.ct.update();
  }
}
