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
export type TouchMode = 'walk' | 'float' | 'ladder' | 'seat' | 'drive' | 'flight' | 'ui' | 'cinematic' | 'drone' | 'photo';

export interface TouchHost {
  menu(): void;
  /** skip the running cinematic (if skippable) */
  skip(): void;
  fullscreen(): void;
}

interface StickState {
  el: HTMLElement;
  knob: HTMLElement;
  id: number | null;
  cx: number;
  cy: number;
  apply: (dx: number, dy: number) => void;
}

/**
 * On-screen controls for touch devices. One layout per control context, chosen every frame from what the player is
 * doing (Game.syncTouch): on foot, floating in zero-g, on a ladder, seated, driving, flying, a panel open or a
 * cinematic. Every button maps to the same input action as its keyboard binding (no touch-only behaviour), plus:
 *   • the look area: drag to look; a quick tap uses whatever is under the finger (doors, switches, screens);
 *   • flight: left stick = pitch/roll, right stick = RCS translation (up/down drives VTOL hover thrust),
 *     an absolute throttle slider (synced back from the craft, so autopilot throttle shows), yaw and fore/aft buttons.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private look: HTMLElement;
  private btns: HTMLElement;
  private tbar: HTMLElement;
  private throttle: HTMLElement;
  private throttleFill: HTMLElement;
  private throttleLabel: HTMLElement;
  private skipBtn: HTMLElement;
  private left: StickState;
  private right: StickState;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookStart = { x: 0, y: 0, t: 0, moved: 0 };
  private throttleId: number | null = null;
  mode: TouchMode = 'walk';
  throttleValue = 0;
  /** extra layout hints from the active zone/vehicle (e.g. VTOL craft label UP/DOWN as HOVER) */
  private vtol = false;

  constructor(private input: Input, private host: TouchHost) {
    this.look = h('div', { class: 'look' });
    this.btns = h('div', { class: 'btns' });
    this.tbar = h('div', { class: 'tbar' });
    this.throttleFill = h('i');
    this.throttleLabel = h('b', {}, '0%');
    this.throttle = h('div', { class: 'throttle' }, this.throttleFill, this.throttleLabel, h('span', {}, 'THR'));
    this.skipBtn = h('button', { class: 'skip' }, 'SKIP ▸▸');
    this.skipBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.host.skip(); }, { passive: false });
    this.left = this.makeStick('stick l', (dx, dy) => {
      if (this.mode === 'flight') {
        this.input.virtFlight.roll = dx;
        this.input.virtFlight.pitch = dy;
      } else this.input.virtMove.set(dx, -dy);
    });
    this.right = this.makeStick('stick r', (dx, dy) => {
      this.input.virtFlight.tx = dx;
      this.input.virtFlight.ty = -dy;
    });
    this.el = h('div', { class: 'touch' }, this.look, this.left.el, this.right.el, this.throttle, this.btns, this.tbar, this.skipBtn);
    document.getElementById('ui')!.append(this.el);
    this.bindLook();
    this.bindThrottle();
    this.setMode('walk', true);
    window.addEventListener('touchstart', () => this.enable(), { passive: true });
  }

  enable() {
    if (!this.input.touchActive) {
      this.input.touchActive = true;
      this.el.classList.add('on');
      document.body.classList.add('touch-ui');
    }
  }

  /** keyboard used on a hybrid device: hide the overlay until the next touch */
  disable() {
    if (!this.el.classList.contains('on')) return;
    this.el.classList.remove('on');
    document.body.classList.remove('touch-ui');
    this.releaseAll();
  }

  setScale(s: number) {
    this.el.style.setProperty('--ts', String(s));
  }

  /** Flight-state feedback (called by the active FlightControl every frame). */
  syncFlight(throttle: number, vtol: boolean) {
    if (this.throttleId === null && Math.abs(throttle - this.throttleValue) > 0.004) this.showThrottle(throttle);
    if (vtol !== this.vtol) {
      this.vtol = vtol;
      if (this.mode === 'flight') this.setMode('flight', true);
    }
  }

  setMode(mode: TouchMode, force = false) {
    if (mode === this.mode && !force) return;
    if (mode !== this.mode) this.releaseAll();
    this.mode = mode;
    for (const m of ['walk', 'float', 'ladder', 'seat', 'drive', 'flight', 'ui', 'cinematic', 'drone', 'photo']) this.el.classList.toggle(m, m === mode);
    this.btns.innerHTML = '';
    this.tbar.innerHTML = '';
    const b = (label: string, action: string, hold = false, cls = '') => {
      const el = h('button', { class: cls }, label);
      el.dataset.action = action;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        el.classList.add('down');
        if (hold) this.input.virtualHold(action, true);
        this.input.virtualPress(action);
      }, { passive: false });
      const up = (e: TouchEvent) => {
        e.preventDefault();
        el.classList.remove('down');
        if (hold) this.input.virtualHold(action, false);
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      return el;
    };
    const fn = (label: string, f: () => void, cls = '') => {
      const el = h('button', { class: cls }, label);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); f(); }, { passive: false });
      return el;
    };
    if (mode === 'ui' || mode === 'cinematic') return;
    const warp = [b('◂◂', 'timeWarpDown', false, 'sm'), b('▸▸', 'timeWarpUp', false, 'sm')];
    this.tbar.append(fn('MENU', () => this.host.menu()), b('COMP', 'computer'));
    if (mode === 'walk') {
      this.tbar.append(b('VIEW', 'view'), b('LIGHT', 'flashlight'), b('HELMET', 'helmet'), ...warp, fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('CROUCH', 'crouch', true), b('USE', 'interact', false, 'big'), b('JUMP', 'jump'), b('RUN', 'sprint', true), b('ENTER', 'vehicle'), b('CREW', 'crew'));
      this.tbar.append(b('DRONE', 'drone', false, 'sm'), b('PHOTO', 'photo', false, 'sm'), b('SAMPLE', 'sample', false, 'sm'));
    } else if (mode === 'float') {
      this.tbar.append(b('VIEW', 'view'), b('LIGHT', 'flashlight'), ...warp, fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('DOWN', 'crouch', true), b('USE', 'interact', false, 'big'), b('UP', 'jump', true), b('FAST', 'sprint', true), b('CREW', 'crew'));
    } else if (mode === 'ladder') {
      this.tbar.append(b('LIGHT', 'flashlight'), fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('USE', 'interact', false, 'big'), b('LET GO', 'jump'));
    } else if (mode === 'seat') {
      this.tbar.append(b('CREW', 'crew'), ...warp, fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('PANEL', 'cockpitMode'), b('USE', 'interact', false, 'big'), b('STAND', 'vehicle'));
    } else if (mode === 'drone') {
      // the survey drone / ROV: the left stick flies it, the right side looks; up/down, fast, sample, recall
      this.tbar.append(b('RECALL', 'drone', false, 'hi'), fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('DOWN', 'crouch', true), b('SAMPLE', 'sample', false, 'big'), b('UP', 'jump', true), b('FAST', 'sprint', true));
    } else if (mode === 'photo') {
      this.tbar.append(b('EXIT', 'photo', false, 'hi'), fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('DOWN', 'crouch', true), b('SHOT', 'interact', false, 'big'), b('UP', 'jump', true), b('ZOOM+', 'zoomIn', true), b('ZOOM−', 'zoomOut', true));
    } else if (mode === 'drive') {
      this.tbar.append(b('VIEW', 'view'), b('LIGHTS', 'flashlight'), fn('⛶', () => this.host.fullscreen(), 'sm'));
      this.btns.append(b('BRAKE', 'brake', true, 'big'), b('BOOST', 'sprint', true), b('CAM', 'camera'), b('EXIT', 'vehicle'));
    } else if (mode === 'flight') {
      this.tbar.append(b('AUTO', 'autopilot', false, 'hi'), b('SAS', 'sas'), b('RCS', 'rcs'), b('GEAR', 'gear'), b('CAM', 'camera'), b('PANEL', 'cockpitMode'), b('PHOTO', 'photo', false, 'sm'), ...warp, b('EXIT', 'vehicle'));
      // right cluster around the translation stick: yaw on the sides, fore/aft above, throttle shortcuts below
      this.btns.append(
        b('◀ YAW', 'yawLeft', true), b(this.vtol ? 'FWD' : 'FWD', 'transFwd', true), b('YAW ▶', 'yawRight', true),
        b('CUT', 'throttleCut', false, 'sm'), b('AFT', 'transBack', true), b('MAX', 'throttleMax', false, 'sm'),
      );
      if (this.vtol) this.right.el.dataset.label = 'HOVER ▲▼ · SLIDE ◀▶';
      else this.right.el.dataset.label = 'RCS TRANSLATE';
    }
  }

  /** Lift every held virtual action / axis (mode change, panel opened). */
  private releaseAll() {
    for (const s of [this.left, this.right]) {
      s.id = null;
      s.knob.style.transform = '';
    }
    this.lookId = null;
    this.throttleId = null;
    const v = this.input.virtFlight;
    v.pitch = v.roll = v.yaw = v.tx = v.ty = v.tz = v.throttle = 0;
    v.throttleSet = null;
    this.input.virtMove.set(0, 0);
    for (const a of ['jump', 'crouch', 'sprint', 'brake', 'transFwd', 'transBack', 'yawLeft', 'yawRight']) this.input.virtualHold(a, false);
  }

  private makeStick(cls: string, apply: (dx: number, dy: number) => void): StickState {
    const knob = h('i');
    const el = h('div', { class: cls }, knob);
    const st: StickState = { el, knob, id: null, cx: 0, cy: 0, apply };
    const move = (x: number, y: number) => {
      const r = el.getBoundingClientRect().width / 2;
      let dx = (x - st.cx) / r, dy = (y - st.cy) / r;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      knob.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`;
      // small dead zone, then a gentle curve for fine control near centre
      const curve = (v: number) => (Math.abs(v) < 0.08 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.08) / 0.92, 1.4));
      apply(curve(dx), curve(dy));
    };
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      st.id = t.identifier;
      const r = el.getBoundingClientRect();
      st.cx = r.left + r.width / 2;
      st.cy = r.top + r.height / 2;
      move(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === st.id) move(t.clientX, t.clientY);
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== st.id) continue;
        st.id = null;
        knob.style.transform = '';
        apply(0, 0);
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return st;
  }

  private bindLook() {
    const l = this.look;
    l.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
      this.lookStart = { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 };
    }, { passive: false });
    l.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        const dx = t.clientX - this.lookLast.x, dy = t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
        this.lookStart.moved = Math.max(this.lookStart.moved, Math.hypot(t.clientX - this.lookStart.x, t.clientY - this.lookStart.y));
        const k = 0.0045 * this.input.controls.mouseSensitivity;
        const inv = this.input.controls.invertY ? -1 : 1;
        this.input.virtLook.set(this.input.virtLook.x - dx * k, this.input.virtLook.y - dy * k * inv);
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookId) continue;
        this.lookId = null;
        // a quick, still tap acts on whatever is under the finger
        if (e.type === 'touchend' && this.lookStart.moved < 12 && performance.now() - this.lookStart.t < 350) {
          this.input.pointer.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
          this.input.pointerClicked = true;
          this.input.tapped = true;
        }
      }
    };
    l.addEventListener('touchend', end);
    l.addEventListener('touchcancel', end);
  }

  private showThrottle(v: number) {
    this.throttleValue = v;
    this.throttleFill.style.height = `${v * 100}%`;
    this.throttleLabel.textContent = `${Math.round(v * 100)}%`;
  }

  private bindThrottle() {
    const th = this.throttle;
    const set = (y: number) => {
      const r = th.getBoundingClientRect();
      let v = Math.max(0, Math.min(1, 1 - (y - r.top - 6) / (r.height - 12)));
      if (v < 0.03) v = 0;
      if (v > 0.97) v = 1;
      this.showThrottle(v);
      this.input.virtFlight.throttleSet = v;
    };
    th.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.throttleId = t.identifier;
      set(t.clientY);
    }, { passive: false });
    th.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.throttleId) set(t.clientY);
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.throttleId) this.throttleId = null;
    };
    th.addEventListener('touchend', end);
    th.addEventListener('touchcancel', end);
  }
}
