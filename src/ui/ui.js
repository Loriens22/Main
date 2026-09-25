// DOM user interface: title/loading screen, HUD, command bar, generation
// progress cards (ring + countdown + cancel), toasts, speech bubbles and name
// tags, created-objects panel, pause menu, save/load slots, settings, help.

import * as THREE from 'three';
import { G, settings, saveSettings, GRAPHICS_PRESETS } from '../core/context.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const EXAMPLES = [
  'a modern two-story house with large windows and a garden',
  'a 1.70 m tall slightly overweight man with short black hair wearing a blue shirt',
  'a friendly golden retriever',
  'a portal to an underwater city',
  'a red sports car in front of me',
  'a medieval castle far away',
  'a cozy log cabin next to the lake',
  'an old woman with gray hair in a red dress',
  'a floating island above me',
  'a giant glowing crystal',
  'a cherry blossom tree',
  'a campfire',
  'a dragon',
  'a portal to a low gravity crystal world',
  'make it night',
  'make it snow',
];

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.cards = new Map();
    this.bubbles = [];
    this.nametags = new Map();
    this.history = [];
    this.histIdx = -1;
    this.talkTarget = null;
    this.focused = false;
    this._statusTimer = 0;
    this._v = new THREE.Vector3();
    this._injectSvgDefs();
    this._bind();
  }

  _injectSvgDefs() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7cc8ff"/><stop offset="100%" stop-color="#b79bff"/></linearGradient></defs>';
    document.body.appendChild(svg);
  }

  _bind() {
    const input = $('command-input');
    const form = $('command-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        this.history.unshift(text); this.history = this.history.slice(0, 50); this.histIdx = -1;
        input.value = '';
        this.hooks.onCommand(text, this.talkTarget);
      }
      this.blurCommand(true);
    });
    input.addEventListener('focus', () => { this.focused = true; $('command').classList.add('focused'); G.input && (G.input.enabled = false); this._showSuggestions(true); });
    input.addEventListener('blur', () => {
      this.focused = false; $('command').classList.remove('focused');
      setTimeout(() => { if (!this.focused) this._showSuggestions(false); }, 150);
      if (G.input && !G.paused) G.input.enabled = true;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); input.value = ''; this.blurCommand(true); if (this.talkTarget) this.endTalk(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.history.length) { this.histIdx = Math.min(this.history.length - 1, this.histIdx + 1); input.value = this.history[this.histIdx]; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.histIdx = Math.max(-1, this.histIdx - 1); input.value = this.histIdx >= 0 ? this.history[this.histIdx] : ''; }
      e.stopPropagation();
    });
    $('talk-end').addEventListener('click', () => this.endTalk());
    // Phones: keep the bar above the on-screen keyboard (iOS does not resize the layout viewport).
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const fit = () => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--kb', (this.focused && kb > 80 ? kb : 0) + 'px');
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      input.addEventListener('focus', () => setTimeout(fit, 300));
      input.addEventListener('blur', () => setTimeout(fit, 50));
    }
    // Quickbar.
    $('qb-list').addEventListener('click', () => this.toggleEntityPanel());
    $('qb-cam').addEventListener('click', () => this.hooks.onToggleCamera && this.hooks.onToggleCamera());
    $('qb-menu').addEventListener('click', () => this.hooks.onPause());
    // Panels.
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close)));
    $('entity-undo').addEventListener('click', () => this.hooks.onUndo());
    $('entity-clear').addEventListener('click', () => { if (confirm('Delete everything you created?')) this.hooks.onClear(); });
    // Pause menu.
    $('pm-resume').addEventListener('click', () => this.hooks.onResume());
    $('pm-save').addEventListener('click', () => this.showSlots('save'));
    $('pm-load').addEventListener('click', () => this.showSlots('load'));
    $('pm-export').addEventListener('click', () => this.hooks.onExport());
    $('pm-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { this.hooks.onImport(JSON.parse(rd.result)); } catch (err) { this.toast('Could not read that file.', 'bad'); } };
      rd.readAsText(f);
      e.target.value = '';
    });
    $('pm-settings').addEventListener('click', () => this.showSettings());
    $('pm-help').addEventListener('click', () => this.showHelp());
    $('pm-new').addEventListener('click', () => { if (confirm('Start a new world? Unsaved creations will be lost.')) this.hooks.onNew(); });
    $('pm-quit').addEventListener('click', () => this.hooks.onQuit());
    $('title-settings').addEventListener('click', () => this.showSettings());
    $('title-help').addEventListener('click', () => this.showHelp());
    $('title-load').addEventListener('click', () => this.showSlots('load'));
    $('settings-done').addEventListener('click', () => this.close('settings'));
    $('start-btn').addEventListener('click', () => this.hooks.onStart());
    window.addEventListener('resize', () => this._checkOrientation());
    this._checkOrientation();
  }

  _checkOrientation() {
    const portrait = G.isTouch && window.innerHeight > window.innerWidth * 1.15;
    $('rotate-hint').classList.toggle('hidden', !portrait || !G.started);
  }

  // ---------------- Title / loading ----------------
  setLoading(p, text) {
    $('loader-fill').style.width = (p * 100).toFixed(1) + '%';
    if (text) $('loader-text').textContent = text;
  }
  loadingDone() {
    $('loader').classList.add('hidden');
    $('start-btn').classList.remove('hidden');
    $('title-row').classList.remove('hidden');
    $('title-screen').classList.add('loaded');
    $('title-hint').textContent = G.isTouch ? 'Left thumb: move · Right thumb: look · Tap the bar to create' : 'WASD move · Mouse look · Enter to type · Esc for menu';
  }
  hideTitle() { $('title-screen').classList.add('hidden'); $('hud').classList.remove('hidden'); this._checkOrientation(); }
  showTitle() {
    $('title-screen').classList.remove('hidden'); $('hud').classList.add('hidden');
    $('start-btn').textContent = 'Resume';
  }

  // ---------------- Command bar ----------------
  focusCommand(prefill = '') {
    const input = $('command-input');
    if (prefill) input.value = prefill;
    if (G.input) { G.input.enabled = false; G.input.exitLock(); }
    input.focus();
  }
  blurCommand(relock) {
    const input = $('command-input');
    input.blur();
    this.focused = false;
    if (G.input && !G.paused) { G.input.enabled = true; if (relock && !G.isTouch) G.input.requestLock(); }
  }
  _showSuggestions(on) {
    const el = $('suggestions');
    if (!on || this.talkTarget) { el.classList.add('hidden'); return; }
    const picks = [];
    const pool = EXAMPLES.slice();
    while (picks.length < (G.isTouch ? 3 : 5) && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    el.innerHTML = picks.map((p) => `<span class="chip">${esc(p)}</span>`).join('');
    el.querySelectorAll('.chip').forEach((c) => c.addEventListener('pointerdown', (e) => { e.preventDefault(); $('command-input').value = c.textContent; $('command-input').focus(); }));
    el.classList.remove('hidden');
  }

  startTalk(entity) {
    this.talkTarget = entity;
    $('talk-chip').classList.remove('hidden');
    $('talk-name').textContent = 'Talking to ' + entity.name;
    $('command').classList.add('talking');
    $('command-input').placeholder = G.isTouch ? `Say something to ${entity.name}…` : `Say something to ${entity.name}…  (Esc to stop)`;
  }
  endTalk() {
    if (this.talkTarget && this.hooks.onEndTalk) this.hooks.onEndTalk(this.talkTarget);
    this.talkTarget = null;
    $('talk-chip').classList.add('hidden');
    $('command').classList.remove('talking');
    $('command-input').placeholder = G.isTouch ? 'Tap here and describe anything…' : 'Describe anything to create…  (press Enter)';
  }

  // ---------------- Toasts ----------------
  toast(text, kind = '', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, ms);
  }

  // ---------------- Progress cards ----------------
  trackJob(job) {
    const el = document.createElement('div');
    el.className = 'gen-card';
    const C = 2 * Math.PI * 18;
    el.innerHTML = `
      <div class="ring"><svg width="44" height="44"><circle class="bg" cx="22" cy="22" r="18" fill="none" stroke-width="4"/>
      <circle class="fg" cx="22" cy="22" r="18" fill="none" stroke-width="4" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><div class="pct">0%</div></div>
      <div class="gen-info"><div class="gen-title"></div><div class="gen-status">Queued…</div><div class="gen-timer">Creating… --:-- remaining</div></div>
      <button class="gen-cancel" title="Cancel">×</button>`;
    el.querySelector('.gen-title').textContent = job.title;
    el.querySelector('.gen-cancel').addEventListener('click', () => job.cancel());
    $('progress-stack').appendChild(el);
    this.cards.set(job.id, { el, job, C, fg: el.querySelector('.fg'), pct: el.querySelector('.pct'), status: el.querySelector('.gen-status'), timer: el.querySelector('.gen-timer'), ended: false });
  }

  _updateCards() {
    for (const [id, c] of this.cards) {
      const j = c.job;
      const p = j.status === 'done' ? 1 : j.progressValue;
      c.fg.setAttribute('stroke-dashoffset', String(c.C * (1 - p)));
      c.pct.textContent = Math.round(p * 100) + '%';
      if (j.status === 'running' || j.status === 'queued') {
        c.status.textContent = j.status === 'queued' ? 'Queued…' : j.statusText + '…';
        const eta = j.eta();
        const el = j.status === 'running' ? (performance.now() - j.startTime) / 1000 : 0;
        c.timer.textContent = j.status === 'queued' ? `Waiting · est. ${fmtTime(j.estimateSec)}` : `Creating… ${fmtTime(eta)} remaining · ${fmtTime(el)} elapsed`;
      } else if (!c.ended) {
        c.ended = true;
        c.el.classList.add(j.status);
        const took = ((j.endTime - j.startTime) / 1000);
        c.status.textContent = j.status === 'done' ? 'Created ✓' : j.status === 'cancelled' ? 'Cancelled' : 'Failed: ' + (j.error ? j.error.message || j.error : 'unknown');
        c.timer.textContent = j.status === 'done' ? `Finished in ${took.toFixed(1)} s` : '';
        c.el.querySelector('.gen-cancel').style.visibility = 'hidden';
        setTimeout(() => { c.el.classList.add('out'); setTimeout(() => { c.el.remove(); this.cards.delete(id); }, 500); }, j.status === 'done' ? 2600 : 4000);
      }
    }
  }

  // ---------------- Bubbles & name tags ----------------
  bubble(entity, text, seconds = 4, opts = {}) {
    // Replace an existing bubble for the same speaker.
    this.bubbles = this.bubbles.filter((b) => { if (b.entity === entity) { b.el.remove(); return false; } return true; });
    const el = document.createElement('div');
    el.className = 'bubble' + (opts.player ? ' player' : '');
    el.innerHTML = `${opts.player ? '' : `<span class="who">${esc(entity.name || '')}</span>`}${esc(text)}`;
    $('bubbles').appendChild(el);
    this.bubbles.push({ entity, el, until: performance.now() + seconds * 1000, player: !!opts.player });
  }

  _updateBubbles() {
    const cam = G.camera;
    const now = performance.now();
    const w = window.innerWidth, h = window.innerHeight;
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) { b.el.style.opacity = '0'; setTimeout(() => b.el.remove(), 300); return false; }
      let pos;
      if (b.player) pos = G.player.position.clone().add(new THREE.Vector3(0, 2.3, 0));
      else if (b.entity.headPos) pos = b.entity.headPos(this._v).add(new THREE.Vector3(0, 0.45, 0));
      else pos = b.entity.root.position.clone().add(new THREE.Vector3(0, (b.entity.height || 2) + 0.4, 0));
      if (b.player && G.player.cameraMode === 'first') { b.el.style.display = 'none'; return true; }
      const v = pos.project(cam);
      const visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      b.el.style.display = visible ? '' : 'none';
      if (visible) { b.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px'; b.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px'; }
      return true;
    });
    // Name tags for nearby characters.
    const seen = new Set();
    if (G.world && G.player) {
      for (const e of G.world.entities) {
        if (!e.isCharacter || !e.root.visible) continue;
        const d = e.root.position.distanceTo(G.player.position);
        if (d > 14) continue;
        seen.add(e);
        let tag = this.nametags.get(e);
        if (!tag) { tag = document.createElement('div'); tag.className = 'nametag'; $('bubbles').appendChild(tag); this.nametags.set(e, tag); }
        tag.innerHTML = `${esc(e.name)}<small>${esc(e.subtitle || '')}</small>`;
        const hp = e.headPos ? e.headPos(this._v).add(new THREE.Vector3(0, 0.3, 0)) : e.root.position.clone().add(new THREE.Vector3(0, (e.height || 1.8) + 0.3, 0));
        const v = hp.project(cam);
        const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && !this.bubbles.some((b) => b.entity === e);
        tag.style.display = vis ? '' : 'none';
        tag.style.opacity = String(Math.max(0, Math.min(1, (14 - d) / 4)));
        if (vis) { tag.style.left = ((v.x * 0.5 + 0.5) * w) + 'px'; tag.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px'; }
      }
    }
    for (const [e, tag] of this.nametags) if (!seen.has(e)) { tag.remove(); this.nametags.delete(e); }
  }

  // ---------------- HUD ----------------
  setInteractHint(text) {
    const el = $('interact-hint');
    if (!text) { el.classList.add('hidden'); $('crosshair').classList.remove('active'); return; }
    el.classList.remove('hidden');
    el.querySelector('kbd').textContent = G.isTouch ? 'Use' : 'E';
    el.querySelector('span').textContent = text;
    $('crosshair').classList.add('active');
  }

  update(dt) {
    this._statusTimer -= dt;
    if (this._statusTimer <= 0) {
      this._statusTimer = 0.25;
      this._updateCards();
      if (G.world) {
        $('status-world').textContent = G.world.name;
        const at = G.world.atmosphere;
        if (at && G.world.kind === 'overworld') {
          const hh = Math.floor(at.timeOfDay), mm = Math.floor((at.timeOfDay - hh) * 60);
          $('status-time').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
          $('status-time').style.display = '';
        } else $('status-time').textContent = G.world.meta.label || '∞';
        $('status-weather').textContent = G.world.weather ? G.world.weather.type[0].toUpperCase() + G.world.weather.type.slice(1) : (G.world.meta.rulesLabel || '');
      }
      const fpsEl = $('status-fps');
      fpsEl.classList.toggle('hidden', !settings.showFps);
      if (settings.showFps) fpsEl.textContent = `${G.fps.toFixed(0)} fps · ${G.renderer.renderer.info.render.calls} dc · ${(G.renderer.renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
      if ($('entity-panel').classList.contains('hidden') === false) this.renderEntityList();
    }
    this._updateBubbles();
  }

  flash(color = '#ffffff', ms = 220) {
    const el = $('flash');
    el.style.background = color;
    el.style.transition = 'none'; el.style.opacity = '0.85';
    requestAnimationFrame(() => { el.style.transition = `opacity ${ms}ms`; el.style.opacity = '0'; });
  }

  // ---------------- Panels ----------------
  isOpen(id) { return !$(id).classList.contains('hidden'); }
  open(id) { $(id).classList.remove('hidden'); }
  close(id) {
    $(id).classList.add('hidden');
    if (id === 'entity-panel' && !G.paused && G.input) G.input.enabled = true;
  }
  anyOverlayOpen() { return ['pause', 'settings', 'help', 'slots'].some((id) => this.isOpen(id)); }

  showPause() { this.open('pause'); }
  hidePause() { for (const id of ['pause', 'settings', 'help', 'slots']) this.close(id); }

  toggleEntityPanel() {
    if (this.isOpen('entity-panel')) { this.close('entity-panel'); if (!G.isTouch && !G.paused) G.input.requestLock(); return; }
    this.renderEntityList();
    this.open('entity-panel');
    if (G.input) G.input.exitLock();
  }

  renderEntityList() {
    const list = $('entity-list');
    const ents = G.registry ? G.registry.list() : [];
    $('entity-count').textContent = ents.length ? `${ents.length}` : '';
    if (!ents.length) { list.innerHTML = '<div class="empty">Nothing created yet.<br>Type a description in the bar below — for example<br><i>“a red sports car in front of me”</i>.</div>'; return; }
    const pp = G.player.position;
    list.innerHTML = ents.map((e) => {
      const d = e.worldId === G.world.id ? Math.round(e.root.position.distanceTo(pp)) + ' m' : 'in ' + (G.worlds.get(e.worldId)?.name || 'another world');
      return `<div class="ent" data-id="${e.id}"><div class="ent-icon">${e.icon || '✦'}</div><div class="ent-info"><div class="ent-name">${esc(e.name)}</div><div class="ent-meta">${esc(e.category)} · ${d}</div></div>
        <button class="go">Go</button><button class="del">✕</button></div>`;
    }).join('');
    list.querySelectorAll('.ent').forEach((row) => {
      const id = Number(row.dataset.id);
      row.querySelector('.go').addEventListener('click', () => this.hooks.onTeleport(id));
      row.querySelector('.del').addEventListener('click', () => { this.hooks.onDelete(id); this.renderEntityList(); });
    });
  }

  showSlots(mode) {
    $('slots-title').textContent = mode === 'save' ? 'Save world' : 'Load world';
    const slots = this.hooks.getSlots();
    const list = $('slot-list');
    list.innerHTML = slots.map((s) => `<div class="slot" data-slot="${s.id}"><div class="grow"><div class="slot-name">${esc(s.label)}</div><div class="slot-meta">${s.empty ? 'Empty' : esc(s.meta)}</div></div><span class="muted small">${mode === 'save' ? 'Save here' : s.empty ? '' : 'Load'}</span></div>`).join('');
    list.querySelectorAll('.slot').forEach((el) => el.addEventListener('click', () => {
      const s = slots.find((x) => x.id === el.dataset.slot);
      if (mode === 'save') { this.hooks.onSave(s.id); this.close('slots'); }
      else if (!s.empty) { this.close('slots'); this.hooks.onLoad(s.id); }
    }));
    this.open('slots');
  }

  showSettings() {
    const grid = $('settings-grid');
    const S = settings;
    const rows = [
      ['section', 'Graphics'],
      ['select', 'graphics', 'Quality preset', [['auto', 'Auto'], ...Object.keys(GRAPHICS_PRESETS).map((k) => [k, k[0].toUpperCase() + k.slice(1)])]],
      ['range', 'renderScale', 'Render scale', 0.5, 1.5, 0.05, (v) => Math.round(v * 100) + '%'],
      ['range', 'fov', 'Field of view', 55, 110, 1, (v) => v + '°'],
      ['range', 'grassDensity', 'Grass density', 0, 2, 0.1, (v) => Math.round(v * 100) + '%'],
      ['toggle', 'shadows', 'Shadows'], ['toggle', 'ao', 'Ambient occlusion'], ['toggle', 'bloom', 'Bloom'], ['toggle', 'showFps', 'Show FPS'],
      ['section', 'Generation'],
      ['select', 'genQuality', 'Generation quality', [['fast', 'Fast'], ['balanced', 'Balanced'], ['highest', 'Highest detail']]],
      ['range', 'maxGenSeconds', 'Max generation time', 20, 300, 10, (v) => fmtTime(v)],
      ['section', 'Controls'],
      ['range', 'sensitivity', 'Look sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)],
      ['toggle', 'invertY', 'Invert Y'], ['toggle', 'headBob', 'Head bob'], ['toggle', 'thirdPerson', 'Third person by default'],
      ['select', 'touchControls', 'Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]],
      ['section', 'World & audio'],
      ['toggle', 'dayCycle', 'Day / night cycle'],
      ['range', 'dayLengthMin', 'Day length', 5, 120, 5, (v) => v + ' min'],
      ['range', 'volume', 'Volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
      ['toggle', 'tts', 'Character voices (speech synthesis)'],
    ];
    grid.innerHTML = rows.map((r) => {
      if (r[0] === 'section') return `<div class="settings-section">${r[1]}</div>`;
      if (r[0] === 'select') return `<div class="setting"><label>${r[2]}</label><select data-k="${r[1]}">${r[3].map(([v, l]) => `<option value="${v}" ${String(S[r[1]]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
      if (r[0] === 'range') return `<div class="setting"><label>${r[2]} <b data-v="${r[1]}">${r[6](S[r[1]])}</b></label><input type="range" data-k="${r[1]}" min="${r[3]}" max="${r[4]}" step="${r[5]}" value="${S[r[1]]}"></div>`;
      return `<div class="setting toggle"><label>${r[2]}</label><input type="checkbox" data-k="${r[1]}" ${S[r[1]] ? 'checked' : ''}></div>`;
    }).join('');
    grid.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const row = rows.find((r) => r[1] === k);
      el.addEventListener('input', () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        S[k] = v;
        if (row && row[0] === 'range') grid.querySelector(`[data-v="${k}"]`).textContent = row[6](v);
        saveSettings();
        this.hooks.onSettingChange && this.hooks.onSettingChange(k, v);
      });
    });
    this.open('settings');
  }

  showHelp() {
    const body = $('help-body');
    const keys = [
      ['WASD / arrows', 'Move'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['Space', 'Jump (swim up)'], ['C / Ctrl', 'Crouch'],
      ['Enter', 'Type a creation or command'], ['E', 'Talk / pick up / drive / sit / open'], ['Left click', 'Throw held object'], ['Q', 'Drop held object'],
      ['V', 'First / third person'], ['Mouse wheel', 'Third-person zoom'], ['G / B', 'Wave / dance'], ['X', 'Sit down'], ['F', 'Toggle flying'],
      ['Tab', 'Created objects'], ['Delete', 'Delete the object you look at'], ['Ctrl+Z', 'Undo last creation'], ['Esc', 'Menu / stop talking'], ['F3', 'Show FPS'],
    ];
    const cmds = [
      'a modern two-story house with large windows and a garden', 'a 1.70 m tall slightly overweight man with short black hair wearing a blue shirt',
      'a young woman with long red hair in a green dress', 'an old wizard with a long white beard', 'a police officer', 'a knight in armor',
      'a golden retriever next to me', 'three cats', 'a horse', 'a dragon', 'a unicorn', 'a robot', 'a drone',
      'a red sports car', 'a yellow taxi', 'a helicopter', 'a hot air balloon', 'a spaceship', 'a boat on the lake',
      'a medieval castle far away', 'a skyscraper', 'a japanese temple', 'a log cabin', 'a lighthouse', 'a windmill',
      'an oak tree', 'a forest', 'a mountain far away', 'a lake', 'a floating island above me', 'a volcano',
      'a wooden table with four chairs', 'a grand piano', 'a bookshelf', 'a campfire', 'a fountain', 'a statue of a woman',
      'a giant glowing crystal', 'a tesseract', 'a black hole', 'a melting clock', 'a portal to an underwater city', 'a portal to an infinite library', 'a portal to a nightmare dimension',
      'a village', 'a park', 'a campsite', 'a farm with animals',
      'make it night', 'set time to sunset', 'make it rain', 'make it snow', 'clear weather', 'make it bigger', 'paint it red', 'delete that', 'undo', 'follow me (while talking)',
    ];
    body.innerHTML = `<h4>Controls</h4><table>${keys.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <h4>Touch</h4><p>Left thumb: joystick (push to the edge to run) · Right side: drag to look · Buttons: jump, crouch, run, use, wave, sit. Tap the bar at the bottom to type.</p>
      <h4>Try typing</h4><div>${cmds.map((c) => `<span class="ex">${esc(c)}</span>`).join('')}</div>
      <h4>Talking to characters</h4><p>Look at a character and press <kbd>E</kbd> (or type <i>“hey Anna, how are you?”</i>). Everything you type then goes to them. Ask their name, how they feel, what they think, tell a joke, or say <i>follow me</i>, <i>wait here</i>, <i>dance</i>, <i>sit down</i>, <i>come here</i>.</p>`;
    body.querySelectorAll('.ex').forEach((el) => el.addEventListener('click', () => { this.hidePause(); this.hooks.onResume(); setTimeout(() => this.focusCommand(el.textContent), 50); }));
    this.open('help');
  }
}
