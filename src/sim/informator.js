// Bustec BT902 informator: boot screen, route selection, sequential stop announcements.
export class Informator {
  constructor(route, audio, onSay) {
    this.route = route; this.audio = audio; this.onSay = onSay || (() => {});
    this.state = 'off';
    this.t = 0;
    this.idx = 0;
    this.leds = { err: false, start: false, run: false, load: false };
    this.announcing = 0;
    this.history = [];
    const st = route.stops;
    // announcement sequence: "Спирка <first>", "Следваща спирка <k>" for every further stop, "Спирка <last>"
    const say = (x) => `${x.tts}${x.linkTts ? ', ' + x.linkTts : ''}.`;
    this.seq = [{ kind: 'stop', stop: 0, text: `Спирка ${say(st[0])}`, show: `Спирка ${st[0].name}${st[0].link ? ' · ' + st[0].link : ''}`, lcd: `СПИРКА: ${st[0].short}` }];
    for (let i = 1; i < st.length; i++) this.seq.push({ kind: 'next', stop: i, text: `Следваща спирка: ${say(st[i])}`, show: `Следваща спирка ${st[i].name}${st[i].link ? ' · ' + st[i].link : ''}`, lcd: `СЛЕДВ.: ${st[i].short}` });
    const last = st.length - 1;
    this.seq.push({ kind: 'stop', stop: last, text: `Спирка ${say(st[last])}`, show: `Спирка ${st[last].name}`, lcd: `СПИРКА: ${st[last].short}` });
    this.line = route.line || { header: 'ЛИНИЯ', menu: ['МАРШРУТ', '', ''] };
    this.menuSel = 0;
  }
  powerOn() { if (this.state !== 'off') return; this.state = 'boot'; this.t = 0; this.leds.run = true; this.leds.load = true; }
  get current() { return this.seq[Math.min(this.idx, this.seq.length - 1)]; }
  /** softkeys 0..3 : ◄  ►  ОБЯВИ  ПОВТОР */
  press(k) {
    if (this.state === 'off') { this.powerOn(); return; }
    if (this.state === 'boot') { this.state = 'route'; return; }
    if (this.state === 'route') {
      if (k === 0 || k === 1) { this.menuSel = (this.menuSel + (k === 0 ? 1 : 1)) % 2; return; }
      this.state = 'run'; this.leds.load = true; this.loadFlash = 0.6; return;
    }
    if (k === 0) { this.idx = Math.max(0, this.idx - 1); this.loadFlash = 0.3; }
    else if (k === 1) { this.idx = Math.min(this.seq.length, this.idx + 1); this.loadFlash = 0.3; }
    else if (k === 2) this.announce();
    else if (k === 3) this.repeat();
  }
  knob() { if (this.state === 'run') this.state = 'route'; else this.press(2); }
  /** Main action: chime + voice for the current message, then advance. */
  announce() {
    if (this.state === 'off') this.powerOn();
    if (this.state === 'boot') this.state = 'route';
    if (this.state === 'route') this.state = 'run';
    if (this.idx >= this.seq.length) { this.say({ text: 'Край на маршрута. Моля, освободете превозното средство.', kind: 'end', lcd: 'КРАЙ НА МАРШРУТА' }); return null; }
    const m = this.seq[this.idx];
    this.say(m);
    this.idx++;
    return m;
  }
  repeat() { const m = this.history[this.history.length - 1]; if (m) this.say(m, true); }
  say(m, isRepeat = false) {
    if (!isRepeat) this.history.push(m);
    const delay = this.audio.chime ? this.audio.chime() : 0;
    this.announcing = delay + 4;
    this.leds.start = true;
    this.onSay(m, 'chime');
    clearTimeout(this._to);
    this._to = setTimeout(() => {
      const ok = this.audio.speak(m.text, () => { this.announcing = 0.3; });
      this.onSay(m, ok ? 'voice' : 'novoice');
    }, delay * 1000);
  }
  update(dt, info) {
    this.t += dt;
    if (this.state === 'boot' && this.t > 2.6) this.state = 'route';
    if (this.announcing > 0) this.announcing -= dt;
    if (this.loadFlash > 0) this.loadFlash -= dt;
    this.leds.start = this.announcing > 0 && Math.floor(this.t * 4) % 2 === 0;
    this.leds.load = this.state === 'boot' ? Math.floor(this.t * 6) % 2 === 0 : this.loadFlash > 0;
    this.leds.err = !!info?.fault && Math.floor(this.t * 2) % 2 === 0;
    this.leds.run = this.state !== 'off';
  }
  /** 5 LCD lines (≈26 chars) for both the HTML replica and the 3D unit. */
  lines(info) {
    const pad = (s, n = 26) => (s.length > n ? s.slice(0, n) : s);
    if (this.state === 'off') return ['', '', '', '', ''];
    if (this.state === 'boot') return ['BT902', 'FW: 000022_V0081', 'DB: 1910190857', 'SD: No card installed', 'ID: -000001'];
    if (this.state === 'route') {
      const m = this.line.menu;
      return ['ИЗБОР НА МАРШРУТ', (this.menuSel === 0 ? '►' : ' ') + m[0], '   ' + m[1], (this.menuSel === 1 ? '►' : ' ') + m[2], '  ◄    ►    OK    OK'];
    }
    const cur = this.idx < this.seq.length ? this.seq[this.idx] : null;
    const clock = info?.clock || '';
    // distance to the stop the next message refers to
    const dist = cur && info?.distTo ? info.distTo(cur.stop) : info?.dist;
    const d = dist !== undefined ? (dist >= 1000 ? (dist / 1000).toFixed(2) + ' км' : Math.round(dist) + ' м') : '';
    return [
      pad(this.line.header),
      pad((cur ? '►' + cur.lcd : '► КРАЙ НА МАРШРУТА')),
      pad(`ДО СПИРКА: ${d}`),
      pad(`${clock}  ${info?.pax ?? 0} пътн.`),
      '  ◄    ►   ОБЯВИ  ПОВТ.',
    ];
  }
}
