// On-screen touch controls for phones/tablets. Multi-touch via pointer
// events; every control captures its own pointer so steering, pedals and
// look gestures work simultaneously without conflicts.
import { L } from './i18n.js';

export class TouchControls {
  constructor(root, input, game) {
    this.input = input;
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.root = root;
    root.appendChild(this.el);
    this.mode = 'none';
  }

  clear() {
    this.el.innerHTML = '';
    this.input.touch.active = false;
    this.input.touch.steer = null;
    this.input.touch.throttle = 0;
    this.input.touch.brake = 0;
    this.input.touch.moveX = this.input.touch.moveY = 0;
  }

  div(cls, html = '', parent = this.el) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    parent.appendChild(d);
    return d;
  }

  button(parent, label, fn, cls = '') {
    const b = this.div(`b ${cls}`, label, parent);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('on');
      fn(true, b);
    });
    const up = () => {
      b.classList.remove('on');
      fn(false, b);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }

  lookPad() {
    const pad = this.div('tc lookpad');
    pad.style.width = '100%';
    let id = null, lx = 0, ly = 0;
    pad.addEventListener('pointerdown', (e) => {
      if (id != null) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      pad.setPointerCapture(id);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.input.look.dx += (e.clientX - lx) * 1.6;
      this.input.look.dy += (e.clientY - ly) * 1.6;
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId === id) id = null;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    return pad;
  }

  setMode(mode) {
    this.mode = mode;
    this.clear();
    this.root.classList.toggle('is-touch', mode !== 'none');
    if (mode === 'none') return;
    this.input.touch.active = true;
    if (mode === 'driver') this.driver();
    else this.passenger();
  }

  driver() {
    const g = this.game;
    this.lookPad();
    // steering wheel
    const wheel = this.div('tc wheel', '<div class="spoke"></div><div class="mark"></div>');
    let wid = null, a0 = 0, base = 0, angle = 0;
    const center = () => {
      const r = wheel.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    wheel.addEventListener('pointerdown', (e) => {
      if (wid != null) return;
      wid = e.pointerId;
      wheel.setPointerCapture(wid);
      const [cx, cy] = center();
      a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
      base = angle;
    });
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== wid) return;
      const [cx, cy] = center();
      let d = Math.atan2(e.clientY - cy, e.clientX - cx) - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      angle = Math.max(-Math.PI * 1.25, Math.min(Math.PI * 1.25, base + d));
      a0 += d;
      base = angle;
      this.input.touch.steer = -angle / (Math.PI * 1.25);
      wheel.style.transform = `rotate(${angle}rad)`;
    });
    const release = (e) => {
      if (e.pointerId !== wid) return;
      wid = null;
      // self-centring
      const start = angle;
      const t0 = performance.now();
      const anim = () => {
        if (wid != null) return;
        const k = Math.min(1, (performance.now() - t0) / 450);
        angle = start * (1 - k);
        this.input.touch.steer = -angle / (Math.PI * 1.25);
        wheel.style.transform = `rotate(${angle}rad)`;
        if (k < 1) requestAnimationFrame(anim);
      };
      anim();
    };
    wheel.addEventListener('pointerup', release);
    wheel.addEventListener('pointercancel', release);
    // pedals: pressure from finger height on the pedal
    const pedal = (cls, label, key) => {
      const p = this.div(`tc pedal ${cls}`, `<i></i><span>${label}</span>`);
      const fill = p.querySelector('i');
      let id = null;
      const set = (e) => {
        const r = p.getBoundingClientRect();
        const v = Math.max(0.15, Math.min(1, 1 - (e.clientY - r.top) / r.height + 0.25));
        this.input.touch[key] = v;
        fill.style.height = `${v * 100}%`;
      };
      p.addEventListener('pointerdown', (e) => {
        id = e.pointerId;
        p.setPointerCapture(id);
        set(e);
      });
      p.addEventListener('pointermove', (e) => e.pointerId === id && set(e));
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        this.input.touch[key] = 0;
        fill.style.height = '0';
      };
      p.addEventListener('pointerup', up);
      p.addEventListener('pointercancel', up);
    };
    pedal('gas', L('ГАЗ', 'GAS'), 'throttle');
    pedal('brake', L('СПИР.', 'BRAKE'), 'brake');
    const key = (code) => () => g.input.pressed.add(code);
    const btns = this.div('tc btns');
    this.button(btns, L('Врати<br>⇔', 'Doors<br>⇔'), (d) => d && key('KeyO')());
    this.button(btns, L('Затв.<br>бип', 'Close<br>beep'), (d) => d && key('KeyC')());
    this.button(btns, 'D', (d) => d && key('Digit1')());
    this.button(btns, 'N', (d) => d && key('Digit2')());
    this.button(btns, 'P', (d) => d && key('KeyP')(), 'red');
    this.button(btns, 'R', (d) => d && key('Digit3')());
    this.button(btns, L('Фарове', 'Lights'), (d) => d && key('KeyL')(), 'sm');
    this.button(btns, L('Клаксон', 'Horn'), (d) => (g.touchHorn = d), 'sm');
    const lb = this.div('tc lbtns');
    this.button(lb, '◀', (d) => d && key('KeyQ')());
    this.button(lb, '⚠', (d) => d && key('KeyH')());
    this.button(lb, '▶', (d) => d && key('KeyE')());
    this.button(lb, L('Чист.', 'Wipers'), (d) => d && key('KeyY')());
    this.button(lb, L('Запал.', 'Engine'), (d) => d && key('KeyI')());
    this.button(lb, L('Курс', 'Reset'), (d) => d && key('KeyR')());
    const top = this.div('tc top');
    this.button(top, '🎥', (d) => d && g.cycleCamera());
    this.button(top, '❚❚', (d) => d && g.emit('pause'));
  }

  passenger() {
    const g = this.game;
    this.lookPad();
    const stick = this.div('tc stick', '<i></i>');
    const knob = stick.querySelector('i');
    let id = null;
    const set = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.input.touch.moveX = x;
      this.input.touch.moveY = -y;
      knob.style.transform = `translate(${x * 60}%, ${y * 60}%)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      stick.setPointerCapture(id);
      set(e);
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === id && set(e));
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.input.touch.moveX = this.input.touch.moveY = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', up);
    stick.addEventListener('pointercancel', up);
    const pb = this.div('tc pbtns');
    this.button(pb, L('Действие', 'Action'), (d) => d && g.input.pressed.add('KeyE'));
    this.button(pb, L('СТОП', 'STOP'), (d) => d && g.input.pressed.add('KeyB'), 'red');
    this.button(pb, L('Държи се', 'Hold on'), (d) => (g.holdGrip = d));
    const top = this.div('tc top');
    this.button(top, '🎥', (d) => d && g.cycleCamera());
    this.button(top, '❚❚', (d) => d && g.emit('pause'));
  }
}
