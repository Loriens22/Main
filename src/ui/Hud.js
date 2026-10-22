// In-game HUD (DOM overlay): route badge, next stop, schedule, speed, gear,
// doors, lamps, minimap, toasts, subtitles of announcements, checklist,
// interaction prompts and trip results.
import { t } from './i18n.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Hud {
  constructor(root) {
    this.root = el('div', 'hud');
    root.appendChild(this.root);
    this.route = el('div', 'route');
    this.top = el('div', 'panel top', '<span class="badge">280</span><span class="dest"></span>');
    this.next = el('div', 'panel next', `<div class="lbl">${t('nextStop')}</div><div class="name">—</div><div class="meta"><span class="dist"></span><span class="sched"></span></div>`);
    this.stopReq = el('div', 'stopreq', 'СТОП');
    this.route.append(this.top, this.next, this.stopReq);
    this.dash = el('div', 'panel dash', `
      <div class="spd">0<small>${t('speed')}</small></div>
      <div class="gear"><span>D</span><span>N</span><span class="r">R</span></div>
      <div class="doors"><span>1</span><span>2</span><span>3</span><span>4</span></div>
      <div class="lamps"><span class="lamp ind l">◀</span><span class="lamp p">P</span><span class="lamp sb">Ⓢ</span><span class="lamp hl">◐</span><span class="lamp ind r">▶</span></div>`);
    this.toastEl = el('div', 'panel toast');
    this.sub = el('div', 'sub');
    this.check = el('div', 'panel check');
    this.mapWrap = el('div', 'panel map');
    this.map = document.createElement('canvas');
    this.map.width = this.map.height = 380;
    this.mapWrap.appendChild(this.map);
    this.fps = el('div', 'fps');
    this.prompt = el('div', 'panel prompt');
    this.help = el('div', 'panel help');
    this.cross = el('div', 'crosshair');
    this.root.append(this.route, this.dash, this.toastEl, this.sub, this.check, this.mapWrap, this.fps, this.prompt, this.help, this.cross);
    this.toastTimer = 0;
    this.subTimer = 0;
    this.q = {
      spd: this.dash.querySelector('.spd'), gear: [...this.dash.querySelectorAll('.gear span')], doors: [...this.dash.querySelectorAll('.doors span')],
      il: this.dash.querySelector('.lamp.l'), ir: this.dash.querySelector('.lamp.r'), p: this.dash.querySelector('.lamp.p'),
      sb: this.dash.querySelector('.lamp.sb'), hl: this.dash.querySelector('.lamp.hl'),
      dest: this.top.querySelector('.dest'), name: this.next.querySelector('.name'), dist: this.next.querySelector('.dist'),
      sched: this.next.querySelector('.sched'), lbl: this.next.querySelector('.lbl'),
    };
    this.mode = 'driver';
  }

  setMode(mode) {
    this.mode = mode;
    this.dash.style.display = mode === 'driver' ? '' : 'none';
    this.check.style.display = mode === 'driver' ? '' : 'none';
    this.help.innerHTML = mode === 'driver'
      ? '<b>W/S</b> газ / спирачка · <b>A/D</b> волан<br><b>1/2/3</b> D N R · <b>P</b> ръчна спирачка<br><b>O</b> отвори врати · <b>C</b> затвори (бип-бип)<br><b>Q/E</b> мигачи · <b>H</b> аварийни · <b>L</b> фарове<br><b>Y</b> чистачки · <b>Space</b> клаксон · <b>K</b> накланяне<br><b>Tab</b> камера · <b>мишка</b> оглеждане · <b>Esc</b> пауза'
      : '<b>WASD</b> ходене · <b>мишка</b> оглеждане<br><b>E</b> действие (качи се / седни / стани / слез)<br><b>B</b> бутон СТОП · <b>Tab</b> камера · <b>Esc</b> пауза';
  }

  show(on) {
    this.root.style.display = on ? '' : 'none';
  }

  toast(msg, bad = false, sec = 2.5) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.toggle('bad', bad);
    this.toastEl.classList.add('show');
    this.toastTimer = sec;
  }

  subtitle(text, sec = 6) {
    this.sub.textContent = text;
    this.sub.classList.add('show');
    this.subTimer = sec;
  }

  setChecklist(items) {
    if (!items) {
      this.check.style.display = 'none';
      return;
    }
    this.check.style.display = this.mode === 'driver' ? '' : 'none';
    this.check.innerHTML = `<h4>${t('checklist')}</h4>` + items.map((i) => `<div class="${i.done ? 'done' : ''}"><i></i>${i.label}<kbd>${i.key}</kbd></div>`).join('');
  }

  setPrompt(text) {
    if (!text) this.prompt.classList.remove('show');
    else {
      this.prompt.innerHTML = text;
      this.prompt.classList.add('show');
    }
  }

  update(dt, s) {
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    this.subTimer -= dt;
    if (this.subTimer <= 0) this.sub.classList.remove('show');
    const q = this.q;
    q.dest.textContent = `→ ${s.headsign}`;
    q.name.textContent = s.nextStop || '—';
    q.lbl.textContent = s.atStop ? t('stop') : t('nextStop');
    q.dist.textContent = s.dist != null && isFinite(s.dist) ? (s.dist > 1000 ? `${(s.dist / 1000).toFixed(1)} км` : `${Math.max(0, Math.round(s.dist))} м`) : '';
    if (s.delay != null) {
      const d = Math.round(s.delay);
      const m = Math.floor(Math.abs(d) / 60), sec = Math.abs(d) % 60;
      const txt = Math.abs(d) < 30 ? t('onTime') : `${d > 0 ? '+' : '−'}${m}:${String(sec).padStart(2, '0')}`;
      q.sched.textContent = `${t('schedule')}: ${txt}`;
      q.sched.className = `sched ${Math.abs(d) < 30 ? 'ontime' : d > 0 ? 'late' : 'early'}`;
    } else q.sched.textContent = '';
    this.stopReq.classList.toggle('on', !!s.stopRequested);
    if (this.mode === 'driver') {
      q.spd.firstChild.nodeValue = String(Math.round(s.speed));
      const g = s.selector;
      q.gear.forEach((e, i) => e.classList.toggle('on', ['D', 'N', 'R'][i] === g));
      q.gear[0].textContent = g === 'D' ? `D${s.gear}` : 'D';
      q.doors.forEach((e, i) => {
        const st = s.doors[i];
        e.classList.toggle('open', st !== 'closed');
        e.classList.toggle('warn', st === 'warning' || st === 'closing');
      });
      q.il.classList.toggle('on', s.indL);
      q.ir.classList.toggle('on', s.indR);
      q.p.classList.toggle('on', s.parking);
      q.sb.classList.toggle('on', s.stopBrake);
      q.hl.classList.toggle('on', s.head);
    }
    if (s.fps != null) this.fps.textContent = `${s.fps.toFixed(0)} FPS · ${s.quality}`;
  }

  /** Minimap: route polyline, stops, bus position, heading-up. */
  drawMap(route, dirId, bus, stopsDone) {
    const c = this.map, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#121a16';
    g.fillRect(0, 0, W, H);
    const scale = 0.45; // px per metre
    g.translate(W / 2, H / 2);
    g.rotate(bus.yaw);
    g.scale(scale, scale);
    g.translate(-bus.x, -bus.z);
    if (this._roads) {
      g.strokeStyle = '#2c3a33';
      g.lineCap = 'round';
      for (const r of this._roads) {
        g.lineWidth = r.w;
        g.beginPath();
        for (let i = 0; i < r.p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, r.p[i], r.p[i + 1]);
        g.stroke();
      }
    }
    const d = route.direction(dirId);
    g.strokeStyle = '#f39200';
    g.lineWidth = 9;
    g.beginPath();
    const P = d.path;
    for (let i = 0; i < P.n; i++) (i ? g.lineTo : g.moveTo).call(g, P.x[i], P.z[i]);
    g.stroke();
    for (const st of d.stops) {
      g.fillStyle = st.index < stopsDone ? '#5a6a60' : '#fff';
      g.beginPath();
      g.arc(st.pole[0], st.pole[1], 14, 0, Math.PI * 2);
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffae1a';
    g.beginPath();
    g.moveTo(W / 2, H / 2 - 16);
    g.lineTo(W / 2 + 10, H / 2 + 12);
    g.lineTo(W / 2, H / 2 + 6);
    g.lineTo(W / 2 - 10, H / 2 + 12);
    g.closePath();
    g.fill();
  }

  setMapRoads(network) {
    this._roads = network.pieces.filter((p) => !p.minor).map((p) => ({ p: p.pts, w: Math.max(6, p.width * 0.9) }));
  }

  showResult(title, rows, onContinue, onMenu) {
    this.hideResult();
    const box = el('div', 'panel result');
    box.innerHTML = `<h2>${title}</h2><table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
    const row = el('div', '');
    row.style.display = 'flex';
    row.style.gap = '10px';
    const b1 = el('button', 'btn primary', 'Обратен курс ↩');
    b1.onclick = () => { this.hideResult(); onContinue(); };
    const b2 = el('button', 'btn', t('mainMenu'));
    b2.onclick = () => { this.hideResult(); onMenu(); };
    row.append(b1, b2);
    box.appendChild(row);
    this.root.appendChild(box);
    this.resultEl = box;
  }

  hideResult() {
    if (this.resultEl) this.resultEl.remove();
    this.resultEl = null;
  }
}
