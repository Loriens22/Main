import './styles.css';
import type { AudioEngine } from '../audio/Audio';
import type { Input } from '../core/Input';

type Child = Node | string | number | null | undefined | false | Child[];

/** Tiny DOM builder. Attributes starting with "on" become listeners; class/style handled. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export interface PanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  close: () => void;
  setTitle: (t: string) => void;
  refresh?: () => void;
}

export interface DialogueOption {
  text: string;
  action: () => void;
}

export class UI {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  private crosshair: HTMLElement;
  private promptEl: HTMLElement;
  private toasts: HTMLElement;
  private subs: HTMLElement;
  readonly status: HTMLElement;
  readonly vitals: HTMLElement;
  private fpsEl: HTMLElement;
  private locCard: HTMLElement;
  readonly vhud: HTMLElement;
  readonly layer: HTMLElement; // for vehicle/flight HUD widgets
  private letterTop: HTMLElement;
  private letterBot: HTMLElement;
  readonly countdownEl: HTMLElement;
  private loading: HTMLElement | null = null;
  private panels: PanelHandle[] = [];
  private dialogueEl: HTMLElement | null = null;
  private subTimer = 0;
  touch: TouchControls | null = null;
  audio: AudioEngine | null = null;
  showFps = false;

  constructor(private input: Input) {
    this.root = document.getElementById('ui')!;
    this.hud = h('div', { class: 'hud' });
    this.layer = h('div', { class: 'hud' });
    this.crosshair = h('div', { class: 'crosshair' });
    this.promptEl = h('div', { class: 'prompt' });
    this.toasts = h('div', { class: 'toasts' });
    this.subs = h('div', { class: 'subtitles' });
    this.status = h('div', { class: 'status' });
    this.vitals = h('div', { class: 'vitals' });
    this.fpsEl = h('div', { class: 'fps' });
    this.locCard = h('div', { class: 'location-card' });
    this.vhud = h('div', { class: 'vhud' });
    this.letterTop = h('div', { class: 'letterbox top' });
    this.letterBot = h('div', { class: 'letterbox bot' });
    this.countdownEl = h('div', { class: 'countdown' });
    this.hud.append(this.layer, this.crosshair, this.promptEl, this.subs, this.status, this.vitals, this.vhud, this.locCard, this.countdownEl, this.fpsEl);
    this.root.append(this.hud, this.toasts, this.letterTop, this.letterBot);
    this.setHudVisible(false);
  }

  // ------------------------------------------------------------------------- loading
  showLoading() {
    this.loading = h('div', { class: 'loading' },
      h('div', { class: 't' }, 'INTERSTELLAR'),
      h('div', { class: 's' }, 'BEYOND ENDURANCE'),
      h('div', { class: 'bar' }, h('i')),
      h('div', { class: 'msg' }, 'initialising'),
    );
    document.body.append(this.loading);
  }
  setLoading(p: number, msg?: string) {
    if (!this.loading) return;
    (this.loading.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    if (msg) this.loading.querySelector('.msg')!.textContent = msg;
  }
  hideLoading() {
    const l = this.loading;
    if (!l) return;
    l.style.opacity = '0';
    l.style.pointerEvents = 'none';
    setTimeout(() => l.remove(), 1600);
    this.loading = null;
  }

  // ------------------------------------------------------------------------- generic HUD
  setHudVisible(v: boolean) {
    this.hud.style.display = v ? '' : 'none';
  }
  setCrosshair(visible: boolean, active = false) {
    this.crosshair.style.display = visible ? '' : 'none';
    this.crosshair.classList.toggle('active', active);
  }
  prompt(text: string | null, key = 'E') {
    if (!text) {
      this.promptEl.classList.remove('show');
      return;
    }
    const k = this.input.touchActive ? 'TAP' : this.input.gamepadActive ? 'A' : key;
    const html = `<kbd>${k}</kbd>${text}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.classList.add('show');
  }
  notify(text: string, kind: 'info' | 'warn' | 'alert' | 'ok' = 'info', duration = 5) {
    const t = h('div', { class: `toast ${kind === 'info' ? '' : kind}` }, text);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild!.remove();
    if (kind === 'alert') this.audio?.ui('alert');
    else this.audio?.ui('notify');
    setTimeout(() => {
      t.style.transition = 'opacity 0.6s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 700);
    }, duration * 1000);
  }
  subtitle(speaker: string, text: string, duration = 0) {
    const d = duration || Math.min(9, 2.2 + text.length * 0.055);
    this.subs.innerHTML = '';
    this.subs.append(h('span', { class: 'sp' }, speaker.toUpperCase()), text);
    this.subs.style.opacity = '1';
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => (this.subs.style.opacity = '0'), d * 1000);
  }
  locationCard(a: string, b: string, seconds = 5) {
    this.locCard.innerHTML = '';
    this.locCard.append(h('div', { class: 'a' }, a), h('div', { class: 'b' }, b));
    this.locCard.classList.add('show');
    setTimeout(() => this.locCard.classList.remove('show'), seconds * 1000);
  }
  letterbox(on: boolean) {
    this.letterTop.classList.toggle('on', on);
    this.letterBot.classList.toggle('on', on);
  }
  countdown(text: string | null) {
    this.countdownEl.textContent = text ?? '';
  }
  fps(text: string) {
    this.fpsEl.textContent = this.showFps ? text : '';
  }

  // ------------------------------------------------------------------------- panels
  get panelOpen() {
    return this.panels.length > 0 || !!this.dialogueEl;
  }

  openPanel(title: string, build: (body: HTMLElement, handle: PanelHandle) => void, opts: { narrow?: boolean; onClose?: () => void; tabs?: { id: string; label: string; build: (b: HTMLElement) => void }[] } = {}): PanelHandle {
    const body = h('div', { class: 'pb' });
    const titleEl = h('h2', {}, title);
    const close = () => {
      overlay.remove();
      this.panels = this.panels.filter((p) => p !== handle);
      this.audio?.ui('back');
      opts.onClose?.();
    };
    const head = h('div', { class: 'ph' }, titleEl, h('button', { class: 'x', onclick: close, title: 'Close' }, '✕'));
    const panel = h('div', { class: `panel ${opts.narrow ? 'narrow' : ''}` }, head);
    if (opts.tabs) {
      const tabs = h('div', { class: 'tabs' });
      let current = opts.tabs[0].id;
      const render = () => {
        tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', (t as HTMLElement).dataset.id === current));
        body.innerHTML = '';
        opts.tabs!.find((t) => t.id === current)!.build(body);
      };
      for (const t of opts.tabs) {
        const b = h('button', { class: 'tab', 'data-id': t.id, onclick: () => { current = t.id; this.audio?.ui('click'); render(); } }, t.label);
        tabs.append(b);
      }
      panel.append(tabs);
      setTimeout(render, 0);
    }
    panel.append(body);
    const overlay = h('div', { class: 'overlay', onmousedown: (e: MouseEvent) => { if (e.target === overlay) close(); } }, panel);
    this.root.append(overlay);
    const handle: PanelHandle = { root: overlay, body, close, setTitle: (t) => (titleEl.textContent = t) };
    this.panels.push(handle);
    if (!opts.tabs) build(body, handle);
    this.audio?.ui('confirm');
    return handle;
  }

  closeTopPanel(): boolean {
    if (this.dialogueEl) return false;
    const p = this.panels[this.panels.length - 1];
    if (!p) return false;
    p.close();
    return true;
  }

  closeAllPanels() {
    for (const p of [...this.panels]) p.close();
  }

  // ------------------------------------------------------------------------- dialogue
  dialogue(speaker: string, text: string, options: DialogueOption[]) {
    this.closeDialogue();
    const opts = h('div', { class: 'opts' });
    options.forEach((o, i) => {
      opts.append(h('button', {
        onclick: () => { this.audio?.ui('click'); o.action(); },
      }, h('span', { class: 'n' }, String(i + 1)), o.text));
    });
    this.dialogueEl = h('div', { class: 'dialogue' }, h('div', { class: 'who' }, speaker.toUpperCase()), h('div', { class: 'txt' }, text), opts);
    this.root.append(this.dialogueEl);
    const keyh = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= options.length && this.dialogueEl) {
        e.preventDefault();
        options[n - 1].action();
      }
    };
    window.addEventListener('keydown', keyh);
    (this.dialogueEl as any)._keyh = keyh;
  }
  closeDialogue() {
    if (this.dialogueEl) {
      window.removeEventListener('keydown', (this.dialogueEl as any)._keyh);
      this.dialogueEl.remove();
      this.dialogueEl = null;
    }
  }
  get dialogueOpen() {
    return !!this.dialogueEl;
  }

  // ------------------------------------------------------------------------- widgets
  toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const t = h('div', { class: `toggle interactive ${on ? 'on' : ''}`, role: 'switch', 'aria-checked': String(on), tabindex: '0' });
    const flip = () => {
      on = !on;
      t.classList.toggle('on', on);
      t.setAttribute('aria-checked', String(on));
      this.audio?.ui('click');
      onChange(on);
    };
    t.addEventListener('click', flip);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    return t;
  }

  row(label: string, control: HTMLElement | string, val?: HTMLElement): HTMLElement {
    return h('div', { class: 'row' }, h('label', {}, label), h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, control, val ?? null));
  }

  slider(value: number, min: number, max: number, step: number, onInput: (v: number) => void, fmt = (v: number) => v.toFixed(2)): [HTMLElement, HTMLElement] {
    const val = h('span', { class: 'val' }, fmt(value));
    const s = h('input', { type: 'range', min, max, step, value }) as HTMLInputElement;
    s.addEventListener('input', () => {
      const v = parseFloat(s.value);
      val.textContent = fmt(v);
      onInput(v);
    });
    return [s, val];
  }

  select<T extends string | number>(value: T, options: [T, string][], onChange: (v: T) => void): HTMLElement {
    const s = h('select', {}) as HTMLSelectElement;
    for (const [v, l] of options) {
      const o = h('option', { value: String(v) }, l) as HTMLOptionElement;
      if (v === value) o.selected = true;
      s.append(o);
    }
    s.addEventListener('change', () => {
      const raw = s.value;
      const opt = options.find(([v]) => String(v) === raw);
      if (opt) onChange(opt[0]);
    });
    return s;
  }

  button(label: string, onclick: () => void, cls = 'btn'): HTMLButtonElement {
    return h('button', { class: cls, onclick: () => { this.audio?.ui('click'); onclick(); }, onmouseenter: () => this.audio?.ui('hover') }, label);
  }

  meter(frac: number, warnBelow = 0.25): HTMLElement {
    const cls = frac < warnBelow * 0.5 ? 'alert' : frac < warnBelow ? 'warn' : '';
    return h('div', { class: `meter ${cls}` }, h('i', { style: { width: `${Math.max(0, Math.min(1, frac)) * 100}%` } }));
  }
}

// ============================================================================================ touch
export class TouchControls {
  readonly el: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private look: HTMLElement;
  private btns: HTMLElement;
  private tbar: HTMLElement;
  private throttle: HTMLElement;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private stickCenter = { x: 0, y: 0 };
  mode: 'walk' | 'drive' | 'flight' | 'seat' | 'ui' = 'walk';
  throttleValue = 0;

  constructor(private input: Input, private onMenu: () => void) {
    this.knob = h('i');
    this.stick = h('div', { class: 'stick' }, this.knob);
    this.look = h('div', { class: 'look' });
    this.btns = h('div', { class: 'btns' });
    this.tbar = h('div', { class: 'tbar' });
    this.throttle = h('div', { class: 'throttle' }, h('i'));
    this.el = h('div', { class: 'touch' }, this.look, this.stick, this.throttle, this.btns, this.tbar);
    document.getElementById('ui')!.append(this.el);
    this.bindStick();
    this.bindLook();
    this.bindThrottle();
    this.setMode('walk');
    window.addEventListener('touchstart', () => this.enable(), { passive: true, once: false });
  }

  enable() {
    if (!this.input.touchActive) {
      this.input.touchActive = true;
      this.el.classList.add('on');
    }
  }

  setScale(s: number) {
    this.el.style.setProperty('--ts', String(s));
  }

  setMode(mode: TouchControls['mode']) {
    if (mode === this.mode && this.btns.childElementCount) return;
    this.mode = mode;
    this.el.classList.toggle('flight', mode === 'flight');
    this.btns.innerHTML = '';
    this.tbar.innerHTML = '';
    const b = (label: string, action: string, hold = false) => {
      const el = h('button', {}, label);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (hold) this.input.virtualHold(action, true);
        this.input.virtualPress(action);
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (hold) this.input.virtualHold(action, false);
      }, { passive: false });
      return el;
    };
    const menu = h('button', {}, 'MENU');
    menu.addEventListener('touchstart', (e) => { e.preventDefault(); this.onMenu(); }, { passive: false });
    this.tbar.append(menu, b('VIEW', 'view'), b('MAP', 'computer'));
    this.stick.style.display = mode === 'ui' || mode === 'seat' ? 'none' : '';
    if (mode === 'walk') {
      this.btns.append(b('JUMP', 'jump'), b('USE', 'interact'), b('RUN', 'sprint', true), b('CROUCH', 'crouch', true), b('ENTER', 'vehicle'), b('CREW', 'crew'));
    } else if (mode === 'drive') {
      this.btns.append(b('BRAKE', 'brake', true), b('EXIT', 'vehicle'), b('CAM', 'camera'));
    } else if (mode === 'flight') {
      this.btns.append(b('◀ROLL', 'rollLeft', true), b('UP', 'transUp', true), b('ROLL▶', 'rollRight', true), b('SAS', 'sas'), b('DOWN', 'transDown', true), b('GEAR', 'gear'), b('AUTO', 'autopilot'), b('CAM', 'camera'), b('EXIT', 'vehicle'));
      this.tbar.append(b('COCKPIT', 'cockpitMode'));
    } else if (mode === 'seat') {
      this.btns.append(b('USE', 'interact'), b('STAND', 'vehicle'), b('PANEL', 'cockpitMode'));
    }
  }

  private bindStick() {
    const s = this.stick;
    s.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      const r = s.getBoundingClientRect();
      this.stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveStick(t.clientX, t.clientY);
    }, { passive: false });
    s.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) this.moveStick(t.clientX, t.clientY);
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          this.stickId = null;
          this.input.virtMove.set(0, 0);
          this.input.virtFlight.pitch = 0;
          this.input.virtFlight.roll = 0;
          this.knob.style.transform = '';
        }
      }
    };
    s.addEventListener('touchend', end);
    s.addEventListener('touchcancel', end);
  }

  private moveStick(x: number, y: number) {
    const r = this.stick.getBoundingClientRect().width / 2;
    let dx = (x - this.stickCenter.x) / r;
    let dy = (y - this.stickCenter.y) / r;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    this.knob.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
    if (this.mode === 'flight') {
      this.input.virtFlight.roll = dx;
      this.input.virtFlight.pitch = dy;
    } else this.input.virtMove.set(dx, -dy);
  }

  private bindLook() {
    const l = this.look;
    l.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
      this.input.pointer.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
    }, { passive: true });
    l.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        const dx = t.clientX - this.lookLast.x, dy = t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
        const k = 0.0045 * this.input.controls.mouseSensitivity;
        if (this.mode === 'flight') {
          this.input.virtFlight.yaw = THREE_clamp(-dx * 0.05, -1, 1);
        } else this.input.virtLook.set(this.input.virtLook.x - dx * k, this.input.virtLook.y - dy * k);
      }
    }, { passive: true });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookId) {
          this.lookId = null;
          this.input.virtFlight.yaw = 0;
          this.input.pointerClicked = true;
        }
      }
    };
    l.addEventListener('touchend', end);
  }

  private bindThrottle() {
    const th = this.throttle;
    const set = (y: number) => {
      const r = th.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, 1 - (y - r.top) / r.height));
      this.throttleValue = v;
      (th.firstElementChild as HTMLElement).style.height = `${v * 100}%`;
    };
    th.addEventListener('touchstart', (e) => { e.preventDefault(); set(e.changedTouches[0].clientY); }, { passive: false });
    th.addEventListener('touchmove', (e) => { e.preventDefault(); set(e.changedTouches[0].clientY); }, { passive: false });
  }
}

function THREE_clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
