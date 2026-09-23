// DOM HUD + touch/keyboard input.
import { clamp, damp } from './util.js';
import { WHEEL_TURNS } from './sim/bus.js';

const $ = (id) => document.getElementById(id);

const WHEEL_SVG = `<svg viewBox="-100 -100 200 200">
<defs><radialGradient id="wg" cx="40%" cy="35%"><stop offset="0" stop-color="#4a4f55"/><stop offset="1" stop-color="#15171a"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3e44"/><stop offset=".5" stop-color="#16181b"/><stop offset="1" stop-color="#2a2d31"/></linearGradient></defs>
<circle r="92" fill="none" stroke="url(#rim)" stroke-width="15"/>
<circle r="92" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>
<g stroke="#1b1d20" stroke-width="15" stroke-linecap="round"><line x1="-84" y1="10" x2="-26" y2="6"/><line x1="84" y1="10" x2="26" y2="6"/><line x1="0" y1="30" x2="0" y2="86"/></g>
<circle r="34" fill="url(#wg)" stroke="#0c0d0f" stroke-width="3"/>
<text y="7" text-anchor="middle" font-size="15" font-weight="700" fill="#c8cdd2" font-family="Arial">ŠKODA</text>
<rect x="-6" y="-100" width="12" height="16" rx="3" fill="#ffc20e"/>
</svg>`;

export class UI {
  constructor(game) {
    this.g = game;
    this.wheelDeg = 0; this.wheelHeld = false;
    this.acc = 0; this.brk = 0;
    this.keys = new Set();
    this.stick = { x: 0, y: 0, id: null };
    this.lastHud = 0;
    this.tilt = false; this.assist = true;
    this.toastT = 0; this.subT = 0;
    $('wheelRot').innerHTML = WHEEL_SVG;
    this.bindDrive(); this.bindLook(); this.bindWalk(); this.bindButtons(); this.bindKeys(); this.bindMenu(); this.bindInformator();
    this.mm = $('minimap').getContext('2d');
    this.scaleUI(); window.addEventListener('resize', () => this.scaleUI());
  }
  scaleUI() {
    const s = clamp(Math.min(window.innerHeight / 430, window.innerWidth / 900), 0.62, 1.35);
    document.documentElement.style.setProperty('--ui', s.toFixed(3));
  }
  /* ------------------------------ driving controls ------------------------------ */
  bindDrive() {
    const wheel = $('wheel');
    let lastAng = 0, pid = null;
    const angOf = (e) => { const r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    wheel.addEventListener('pointerdown', (e) => { pid = e.pointerId; wheel.setPointerCapture(pid); lastAng = angOf(e); this.wheelHeld = true; e.preventDefault(); });
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const a = angOf(e); let d = a - lastAng; if (d > 180) d -= 360; if (d < -180) d += 360; lastAng = a;
      const max = WHEEL_TURNS * 360;
      this.wheelDeg = clamp(this.wheelDeg + d, -max, max);
    });
    const up = (e) => { if (e.pointerId !== pid) return; pid = null; this.wheelHeld = false; };
    wheel.addEventListener('pointerup', up); wheel.addEventListener('pointercancel', up);
    const pedal = (el, set) => {
      let id = null;
      const val = (e) => { const r = el.getBoundingClientRect(); return clamp((r.bottom - e.clientY) / r.height * 1.25, 0.18, 1); };
      el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(val(e)); e.preventDefault(); this.g.audio.init(); });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(val(e)); });
      const end = (e) => { if (e.pointerId === id) { id = null; set(0); } };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    };
    pedal($('accel'), (v) => { this.acc = v; });
    pedal($('brake'), (v) => { this.brk = v; });
    // tilt steering
    window.addEventListener('deviceorientation', (e) => {
      if (!this.tilt || e.beta === null) return;
      const landscape = window.innerWidth > window.innerHeight;
      const ang = landscape ? e.beta * (window.orientation === -90 ? -1 : 1) : e.gamma;
      this.tiltVal = clamp(ang / 35, -1, 1);
    });
  }
  bindLook() {
    const c = $('c');
    const pts = new Map();
    let lastTap = 0, pinch0 = 0;
    c.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId);
      const now = performance.now(); if (now - lastTap < 280 && pts.size === 1) this.g.camRig.resetLook(); lastTap = now;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
      this.g.audio.init();
      this.g.tapWorld?.(e);
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.g.camRig.zoom(pinch0 / d); pinch0 = d; return;
      }
      this.g.camRig.drag(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = (e) => { pts.delete(e.pointerId); pinch0 = 0; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { this.g.camRig.zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: true });
  }
  bindWalk() {
    const st = $('stick'), knob = $('knob');
    const upd = (e) => {
      const r = st.getBoundingClientRect(); const R = r.width / 2;
      let x = (e.clientX - (r.left + R)) / R, y = (e.clientY - (r.top + R)) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.stick.x = x; this.stick.y = y; knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    };
    st.addEventListener('pointerdown', (e) => { this.stick.id = e.pointerId; st.setPointerCapture(e.pointerId); upd(e); e.preventDefault(); this.g.audio.init(); });
    st.addEventListener('pointermove', (e) => { if (e.pointerId === this.stick.id) upd(e); });
    const end = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    $('actBtn').addEventListener('click', () => this.g.enterDriving());
  }
  bindButtons() {
    const g = this.g;
    const on = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); g.audio.init(); fn(e); });
    on('bDoors', () => g.bus.toggleDoors());
    on('bInf', () => g.announce());
    on('bIndL', () => { g.bus.indicator = g.bus.indicator === -1 ? 0 : -1; g.bus.hazard = false; });
    on('bIndR', () => { g.bus.indicator = g.bus.indicator === 1 ? 0 : 1; g.bus.hazard = false; });
    on('bHazard', () => { g.bus.hazard = !g.bus.hazard; });
    on('bD', () => g.setGear('D')); on('bN', () => g.setGear('N')); on('bR', () => g.setGear('R'));
    on('bPark', () => g.togglePark());
    on('bPoles', () => g.bus.raisePoles());
    on('bKneel', () => { g.bus.kneelCmd = !g.bus.kneelCmd; g.audio.airHiss(); });
    on('bAuto', () => g.auto.toggle());
    const horn = $('bHorn');
    horn.addEventListener('pointerdown', (e) => { e.preventDefault(); g.audio.init(); g.audio.hornOn(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) horn.addEventListener(ev, () => g.audio.hornOff());
    document.querySelectorAll('#btnGrid .d').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); const i = +b.dataset.d; g.bus.setDoor(i, !(g.bus.rig.doors[i].target > 0)); }));
    on('bCam', () => g.cycleCamera());
    on('bView', () => g.camRig.resetLook());
    on('bMode', () => (g.mode === 'walk' ? g.enterDriving() : g.enterWalk()));
    on('bMenu', () => this.openMenu());
  }
  bindKeys() {
    const g = this.g;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { this.keys.add(e.code); return; }
      this.keys.add(e.code); g.audio.init();
      switch (e.code) {
        case 'KeyO': g.bus.toggleDoors(); break;
        case 'KeyI': case 'Enter': g.announce(); break;
        case 'KeyC': g.cycleCamera(); break;
        case 'KeyQ': g.bus.indicator = g.bus.indicator === -1 ? 0 : -1; break;
        case 'KeyE': g.bus.indicator = g.bus.indicator === 1 ? 0 : 1; break;
        case 'KeyH': g.audio.hornOn(); break;
        case 'KeyP': g.togglePark(); break;
        case 'KeyT': g.bus.raisePoles(); break;
        case 'KeyK': g.bus.kneelCmd = !g.bus.kneelCmd; break;
        case 'KeyG': if (g.mode === 'drive') g.auto.toggle(); break;
        case 'Digit1': g.setGear('D'); break; case 'Digit2': g.setGear('N'); break; case 'Digit3': g.setGear('R'); break;
        case 'KeyF': g.mode === 'walk' ? g.enterDriving() : g.enterWalk(); break;
        case 'Escape': this.openMenu(); break;
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyH') g.audio.hornOff(); });
  }
  bindMenu() {
    const g = this.g;
    $('bClose').addEventListener('click', () => $('menu').classList.add('hidden'));
    $('optQuality').addEventListener('change', (e) => g.setQuality(e.target.value));
    $('optTime').addEventListener('change', (e) => g.setTimeOfDay(e.target.value));
    $('optDynRes').addEventListener('change', (e) => { g.engine.dynRes = e.target.checked; if (!e.target.checked) { g.engine.resScale = 1; g.engine.resize(); } });
    $('optMirrors').addEventListener('change', (e) => { g.mirrors.enabled = e.target.checked; });
    $('optShadows').addEventListener('change', (e) => { g.engine.sun.castShadow = e.target.checked; });
    $('optTilt').addEventListener('change', async (e) => {
      this.tilt = e.target.checked;
      if (this.tilt && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { try { await DeviceOrientationEvent.requestPermission(); } catch (err) { /* ignore */ } }
    });
    $('optAssist').addEventListener('change', (e) => { this.assist = e.target.checked; });
    $('optVol').addEventListener('input', (e) => g.audio.setVolume(+e.target.value));
    $('optVoice').addEventListener('change', (e) => { const v = g.audio.voices.find((x) => x.name === e.target.value); g.audio.userVoice = v || null; g.audio.voice = v || g.audio.voice; });
    $('bTestVoice').addEventListener('click', () => { g.audio.init(); g.audio.chime(); setTimeout(() => g.audio.speak('Спирка жилищен комплекс Борово.'), 1500); });
    $('bReset').addEventListener('click', () => { $('menu').classList.add('hidden'); g.restart(); });
    $('bRecover').addEventListener('click', () => { $('menu').classList.add('hidden'); g.recover(); });
    $('bEndContinue').addEventListener('click', () => $('endPanel').classList.add('hidden'));
    $('bEndRestart').addEventListener('click', () => { $('endPanel').classList.add('hidden'); g.restart(); });
    g.audio.onVoices = (all, bg) => {
      const sel = $('optVoice'); sel.innerHTML = '';
      const list = bg.length ? bg : all.slice(0, 30);
      if (!list.length) { sel.innerHTML = '<option>(няма наличен глас)</option>'; return; }
      for (const v of list) { const o = document.createElement('option'); o.value = v.name; o.textContent = `${v.name} (${v.lang})`; if (g.audio.voice && v.name === g.audio.voice.name) o.selected = true; sel.appendChild(o); }
    };
  }
  bindInformator() {
    const g = this.g;
    document.querySelectorAll('.bt-b').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); g.audio.init(); g.informatorKey(+b.dataset.k); }));
    $('btKnob').addEventListener('pointerdown', (e) => { e.preventDefault(); g.audio.init(); g.informator.knob(); });
    // tap the header to fold the unit down to its screen (more windscreen on small phones)
    const bt = $('bt902');
    try { if (localStorage.getItem('tb1650.btMini') === '1') bt.classList.add('mini'); } catch (e) { /* storage unavailable */ }
    bt.querySelector('.bt-head').addEventListener('pointerdown', (e) => {
      e.preventDefault(); bt.classList.toggle('mini');
      try { localStorage.setItem('tb1650.btMini', bt.classList.contains('mini') ? '1' : '0'); } catch (err) { /* storage unavailable */ }
    });
  }
  openMenu() {
    $('menu').classList.remove('hidden');
    const e = this.g.engine;
    $('perf').textContent = `Резолюция: ×${e.renderer.getPixelRatio().toFixed(2)}  ·  draw calls: ${e.renderer.info.render.calls}  ·  триъгълници: ${(e.renderer.info.render.triangles / 1e6).toFixed(2)} M  ·  FPS: ${this.g.fps.toFixed(0)}`;
  }
  /* ------------------------------ per-frame input ------------------------------ */
  readDrive(dt, bus) {
    const k = this.keys;
    let acc = this.acc, brk = this.brk;
    if (k.has('KeyW') || k.has('ArrowUp')) acc = Math.max(acc, 1);
    if (k.has('KeyS') || k.has('ArrowDown')) brk = Math.max(brk, 0.8);
    if (k.has('Space')) brk = 1;
    if (this.g.auto?.on) return { throttle: acc, brake: brk, steer: 0 };
    const kl = k.has('KeyA') || k.has('ArrowLeft'), kr = k.has('KeyD') || k.has('ArrowRight');
    const max = WHEEL_TURNS * 360;
    if (kl || kr) { this.wheelDeg = clamp(this.wheelDeg + (kr ? 1 : -1) * 260 * dt, -max, max); }
    else if (this.tilt && this.tiltVal !== undefined) this.wheelDeg = damp(this.wheelDeg, this.tiltVal * max, 6, dt);
    else if (!this.wheelHeld && this.assist) {
      const rate = (90 + Math.abs(bus.v) * 22) * dt;
      this.wheelDeg = Math.abs(this.wheelDeg) < rate ? 0 : this.wheelDeg - Math.sign(this.wheelDeg) * rate;
    }
    $('wheelRot').style.transform = `rotate(${this.wheelDeg.toFixed(1)}deg)`;
    return { throttle: acc, brake: brk, steer: this.wheelDeg / max };
  }
  /** Autopilot turns the on-screen wheel (steer −1..1). */
  setWheel(steer) {
    const max = WHEEL_TURNS * 360;
    this.wheelDeg = damp(this.wheelDeg, steer * max, 10, 1 / 60);
    $('wheelRot').style.transform = `rotate(${this.wheelDeg.toFixed(1)}deg)`;
  }
  readWalk() {
    const k = this.keys;
    let x = this.stick.x, y = this.stick.y;
    if (k.has('KeyW') || k.has('ArrowUp')) y = -1; if (k.has('KeyS') || k.has('ArrowDown')) y = 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x = -1; if (k.has('KeyD') || k.has('ArrowRight')) x = 1;
    return { x, y, run: k.has('ShiftLeft') };
  }
  /* ------------------------------ HUD ------------------------------ */
  toast(msg, kind = '') {
    const t = $('toast'); t.textContent = msg; t.className = 'show ' + kind; this.toastT = 3.2;
  }
  subtitle(msg) { const s = $('subtitle'); s.textContent = msg; s.classList.add('show'); this.subT = 5; }
  prompt(msg) { const p = $('prompt'); if (msg) { p.textContent = msg; p.classList.add('show'); } else p.classList.remove('show'); }
  showMode(mode) {
    $('drive').classList.toggle('hidden', mode !== 'drive');
    $('bt902').classList.toggle('hidden', mode !== 'drive');
    $('walk').classList.toggle('hidden', mode !== 'walk');
    $('bMode').textContent = mode === 'walk' ? '🚌' : '🚶';
  }
  update(dt, s) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subtitle').classList.remove('show'); }
    const now = performance.now();
    if (now - this.lastHud < 90) return;
    this.lastHud = now;
    $('spd').textContent = Math.round(Math.abs(s.v) * 3.6);
    $('stopLbl').textContent = s.atStop ? 'На спирка' : 'Следваща спирка';
    $('nextStop').textContent = s.nextName;
    $('dist').textContent = s.dist >= 1000 ? (s.dist / 1000).toFixed(2) : (s.dist / 1000).toFixed(3);
    document.querySelectorAll('.gears span').forEach((el) => el.classList.toggle('on', el.dataset.g === s.gear));
    for (const g of ['D', 'N', 'R']) $('b' + g).classList.toggle('on', s.gear === g);
    $('bPark').classList.toggle('on', s.park); $('bPark').classList.toggle('warn', !s.park && Math.abs(s.v) < 0.1 && s.gear === 'N');
    $('icPark').className = 'ic ' + (s.park ? 'bad' : '');
    $('icStop').className = 'ic ' + (s.stopReq ? 'bad' : '');
    $('icDoors').className = 'ic ' + (s.doors ? 'warn' : '');
    $('icPoles').className = 'ic ' + (s.power ? 'on' : 'bad');
    $('bPoles').classList.toggle('bad', !s.power); $('bPoles').classList.toggle('blink', !s.power && s.canRaise);
    $('bDoors').classList.toggle('warn', s.doors);
    const blink = Math.floor(now / 400) % 2 === 0;
    $('icL').className = 'ic ind ' + ((s.ind < 0 || s.hazard) && blink ? 'on' : '');
    $('icR').className = 'ic ind ' + ((s.ind > 0 || s.hazard) && blink ? 'on' : '');
    $('bIndL').classList.toggle('on', s.ind < 0); $('bIndR').classList.toggle('on', s.ind > 0); $('bHazard').classList.toggle('on', s.hazard);
    $('bKneel').classList.toggle('on', s.kneel);
    $('bAuto').classList.toggle('on', !!s.auto);
    document.querySelectorAll('#btnGrid .d').forEach((b, i) => b.classList.toggle('warn', s.doorStates[i] > 0.02));
    $('accel').querySelector('.fill').style.height = (s.throttle * 100).toFixed(0) + '%';
    $('brake').querySelector('.fill').style.height = (s.brake * 100).toFixed(0) + '%';
    $('wheelAngle').textContent = `${Math.round(this.wheelDeg)}°`;
    $('bInf').classList.toggle('blink', !!s.announceHint);
    // informator
    $('lcd').textContent = s.lcd.join('\n');
    const L = s.leds; $('ledErr').classList.toggle('on', L.err); $('ledStart').classList.toggle('on', L.start); $('ledRun').classList.toggle('on', L.run); $('ledLoad').classList.toggle('on', L.load);
    this.drawMinimap(s);
  }
  drawMinimap(s) {
    const c = this.mm, W = 220, R = W / 2;
    c.clearRect(0, 0, W, W);
    c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = 'rgba(12,20,30,0.85)'; c.fillRect(0, 0, W, W);
    const scale = 0.32; // px per metre
    c.translate(R, R); c.rotate(-s.heading - Math.PI / 2); c.scale(scale, scale); c.translate(-s.x, -s.z);
    // streets
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(160,175,190,0.55)'; c.lineWidth = 14;
    for (const st of s.streets) { c.beginPath(); st.poly.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
    // route
    c.strokeStyle = '#ffc20e'; c.lineWidth = 7;
    c.beginPath(); s.routePts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    // signals
    for (const it of s.inters) { c.fillStyle = it.col; c.beginPath(); c.arc(it.x, it.z, 9, 0, 7); c.fill(); }
    // stops
    for (const st of s.stopPts) { c.fillStyle = st.next ? '#29a8e0' : '#fff'; c.beginPath(); c.arc(st.x, st.z, st.next ? 16 : 11, 0, 7); c.fill(); }
    c.restore();
    // bus arrow (always centred, heading up)
    c.fillStyle = '#29a8e0'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(R, R - 11); c.lineTo(R + 7, R + 8); c.lineTo(R, R + 4); c.lineTo(R - 7, R + 8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '600 11px system-ui'; c.textAlign = 'center'; c.fillText('N', R + Math.cos(-s.heading - Math.PI / 2 - Math.PI / 2) * (R - 12), R + Math.sin(-s.heading - Math.PI) * (R - 12) + 4);
  }
}
