// Main menu, pre-game setup, settings, credits and pause screens.
import { t, L, setLang, getLang } from './i18n.js';
import { saveSettings, loadSave } from '../game/Settings.js';
import { lineVehicles, vehicleSpec } from '../vehicle/Vehicles.js';

/** The playable lines: number, termini (Bulgarian, English). */
export const LINE_INFO = {
  280: { bg: 'СУ „Св. Климент Охридски“ – Студентски град', en: 'Sofia University – Studentski Grad', sbg: 'СУ – Студентски град', sen: 'University – Studentski Grad' },
  64: { bg: 'Зоопарка – Център по хигиена', en: 'Zoo – Hygiene Centre', sbg: 'Зоопарка – Център по хигиена', sen: 'Zoo – Hygiene Centre' },
  12: { bg: 'кв. Илиянци – пл. Журналист (трамвай)', en: 'Iliyantsi – Zhurnalist Square (tram)', sbg: 'Илиянци – пл. Журналист', sen: 'Iliyantsi – Zhurnalist Sq.' },
};

// a function, not a constant: the text must follow the language chosen at runtime
const logo = (line = '280') => `<svg class="logo" viewBox="0 0 420 120" aria-label="${t('title')}">
<rect x="2" y="20" width="150" height="80" rx="14" fill="#f4f4ef"/><rect x="12" y="30" width="130" height="30" rx="5" fill="#101010"/>
<text x="77" y="53" font-family="monospace" font-size="24" font-weight="700" text-anchor="middle" fill="#ffae1a">${line}</text>
<path d="M4 84c26-16 44 8 70-6s40 10 76-4v14c0 6-4 10-10 10H14C8 98 4 94 4 88z" fill="#3a9d4a"/>
<circle cx="38" cy="100" r="11" fill="#1d1d1d"/><circle cx="118" cy="100" r="11" fill="#1d1d1d"/>
<text x="170" y="56" font-size="30" font-weight="700" fill="#eef3ee" font-family="Segoe UI,Roboto,Arial" textLength="244" lengthAdjust="spacingAndGlyphs">${L('Градски транспорт', 'Public Transport')}</text>
<text x="170" y="92" font-size="30" font-weight="300" fill="#ffae1a" font-family="Segoe UI,Roboto,Arial">${L('София · Sofia', 'Sofia')}</text></svg>`;

const ICON_WHEEL = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 14.5V21M9.6 11.2 3.5 9.5M14.4 11.2l6.1-1.7"/></svg>';
const ICON_PERSON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2.5"/><path d="M12 8v7m0 0-3 6m3-6 3 6M7 11h10"/></svg>';

export class Menu {
  constructor(root, { settings, route, onStart, onSettingsChanged, voice, onLine }) {
    this.root = root;
    this.onLine = onLine || (() => {});
    this.settings = settings;
    this.route = route;
    this.onStart = onStart;
    this.onSettingsChanged = onSettingsChanged;
    this.voice = voice;
    this.el = document.createElement('div');
    this.el.className = 'ui-root';
    root.appendChild(this.el);
    this.line = String(route.line);
    this.setup = { mode: 'driver', vehicle: settings[`vehicle${this.line}`] || 'random', fleet: settings.fleet || '3145', dirId: 'A', weather: 'clear', hour: 10.5, stopIndex: 3, traffic: settings.traffic || 'medium' };
  }

  clear() {
    this.el.innerHTML = '';
  }

  hide() {
    this.clear();
  }

  /** A temporary diversion valid today: say so (the game runs the regular route; see Route280Data.variants). */
  variantNote() {
    const today = new Date().toISOString().slice(0, 10);
    const v = this.route.variantsOn ? this.route.variantsOn(today)[0] : null;
    if (!v) return '';
    const d = (x) => x.split('-').reverse().join('.');
    return `<div class="tag" style="opacity:.8;font-size:.8em">${L(`${v.label} ${d(v.validFrom)}–${d(v.validTo)}: играта кара редовния маршрут`, `${v.labelEn} ${d(v.validFrom)}–${d(v.validTo)}: the game runs the regular route`)}</div>`;
  }

  main() {
    this.clear();
    const save = loadSave();
    const line = this.line;
    const info = LINE_INFO[line] || LINE_INFO[280];
    const fleetNames = lineVehicles(line).map((id) => vehicleSpec(id).short).join(' · ');
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = `<div class="col">
      ${logo(line)}
      <div class="tag">${L(`Линия ${line} · ${info.bg}`, `Line ${line} · ${info.en}`)}</div>
      ${this.variantNote()}
      <div class="seg line-pick">${Object.keys(LINE_INFO).map((n) => `<button data-line="${n}" class="${n === line ? 'on' : ''}"><b>${n}</b> <small>${L(LINE_INFO[n].sbg, LINE_INFO[n].sen)}</small></button>`).join('')}</div>
      <button class="btn big primary" data-a="driver">${ICON_WHEEL}<span>${t('driver')}<small>${fleetNames} · ${L(`управлявайте линия ${line}`, `drive line ${line}`)}</small></span></button>
      <button class="btn big green" data-a="passenger">${ICON_PERSON}<span>${t('passenger')}<small>${L('пътувайте като пътник', 'ride as a passenger')}</small></span></button>
      <button class="btn big" data-a="continue" ${save ? '' : 'disabled'}>▶<span>${t('cont')}<small>${save ? `${save.mode === 'driver' ? t('driver') : t('passenger')} · ${L('линия', 'line')} ${save.line || 280}` : '—'}</small></span></button>
      <div class="row"><button class="btn" data-a="settings">⚙ ${t('settings')}</button><button class="btn" data-a="credits">ⓘ ${t('credits')}</button>
      <button class="btn" data-a="lang">${L('EN', 'БГ')}</button></div>
      <div class="foot">© OpenStreetMap contributors (ODbL) · Overture Maps · Mapzen Terrain Tiles.<br>Fan-made simulator; not affiliated with Sofia Urban Mobility Center or the bus manufacturers.</div>
    </div>`;
    this.el.appendChild(m);
    for (const b of m.querySelectorAll('[data-line]')) {
      b.onclick = () => {
        if (b.dataset.line === line) return;
        b.innerHTML += ` <small>${L('зареждане…', 'loading…')}</small>`;
        this.onLine(b.dataset.line); // the other line's world is loaded fresh (page reload)
      };
    }
    m.querySelector('[data-a=driver]').onclick = () => this.setupScreen('driver');
    m.querySelector('[data-a=passenger]').onclick = () => this.setupScreen('passenger');
    m.querySelector('[data-a=settings]').onclick = () => this.settingsScreen(() => this.main());
    m.querySelector('[data-a=credits]').onclick = () => this.credits();
    m.querySelector('[data-a=lang]').onclick = () => {
      const l = getLang() === 'bg' ? 'en' : 'bg';
      setLang(l);
      this.settings.lang = l;
      saveSettings(this.settings);
      this.main();
    };
    const c = m.querySelector('[data-a=continue]');
    if (save) c.onclick = () => (String(save.line || 280) !== line ? this.onLine(String(save.line)) : this.onStart({ ...save, resume: true }));
  }

  seg(field, options, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'seg';
    for (const [val, label] of options) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = this.setup[field] === val ? 'on' : '';
      b.onclick = () => {
        this.setup[field] = val;
        [...wrap.children].forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        if (onChange) onChange(val);
      };
      wrap.appendChild(b);
    }
    return wrap;
  }

  field(label, node) {
    const f = document.createElement('div');
    f.className = 'field';
    const l = document.createElement('label');
    l.textContent = label;
    f.append(l, node);
    return f;
  }

  setupScreen(mode) {
    this.setup.mode = mode;
    this.main();
    const p = document.createElement('div');
    p.className = 'panel setup';
    p.innerHTML = `<h2>${mode === 'driver' ? t('driver') : t('passenger')}</h2>`;
    // bus: one of the line's vehicle types (with a fleet number) or a random dispatch per service
    const line = this.line;
    const ids = lineVehicles(line);
    if (this.setup.vehicle !== 'random' && !ids.includes(this.setup.vehicle)) this.setup.vehicle = 'random';
    const busBox = document.createElement('div');
    const fleetBox = document.createElement('div');
    const drawFleet = () => {
      fleetBox.innerHTML = '';
      const v = this.setup.vehicle;
      if (v === 'random') {
        // share of the first type when dispatching at random, and the seed that makes a day reproducible
        const a = vehicleSpec(ids[0]).short, b = vehicleSpec(ids[1]).short;
        const r = document.createElement('input');
        r.type = 'range';
        r.min = 0;
        r.max = 100;
        r.step = 5;
        r.value = Math.round((this.settings[`share${line}`] ?? 0.5) * 100);
        const lab = document.createElement('div');
        lab.className = 'share-lab';
        const upd = () => (lab.textContent = `${a} ${r.value}% · ${b} ${100 - r.value}%`);
        r.oninput = () => {
          this.settings[`share${line}`] = Number(r.value) / 100;
          upd();
        };
        upd();
        fleetBox.append(this.field(L('Разпределение', 'Distribution'), r), lab);
        const seed = document.createElement('input');
        seed.type = 'text';
        seed.inputMode = 'numeric';
        seed.placeholder = L('случаен', 'random');
        seed.value = this.settings.dispatchSeed ?? '';
        seed.oninput = () => (this.settings.dispatchSeed = seed.value.replace(/[^0-9]/g, ''));
        fleetBox.append(this.field(L('Seed на разпределението (по избор)', 'Dispatch seed (optional)'), seed));
        return;
      }
      const spec = vehicleSpec(v);
      const bp = document.createElement('div');
      bp.className = 'bus-pick';
      if (!spec.fleets.some((f) => f.fleet === this.setup.fleet)) this.setup.fleet = spec.fleets[0].fleet;
      for (const f of spec.fleets) {
        const b = document.createElement('button');
        b.innerHTML = `<b>${f.fleet}</b><small>${f.plate || spec.short}</small>`;
        b.className = this.setup.fleet === f.fleet ? 'on' : '';
        b.onclick = () => {
          this.setup.fleet = f.fleet;
          [...bp.children].forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        };
        bp.appendChild(b);
      }
      fleetBox.appendChild(this.field(L('Гаражен номер', 'Fleet number'), bp));
    };
    busBox.appendChild(this.seg('vehicle', [...ids.map((id) => [id, vehicleSpec(id).short]), ['random', L('Случаен', 'Random')]], drawFleet));
    p.appendChild(this.field(vehicleSpec(ids[0]).kind === 'tram' ? L('Трамвай', 'Tram') : t('bus'), busBox));
    p.appendChild(fleetBox);
    drawFleet();
    const dirOpts = ['A', 'B'].map((id) => [id, `→ ${this.route.direction(id).headsign}`]);
    let stopSel = null;
    const fillStops = () => {
      if (!stopSel) return;
      stopSel.innerHTML = '';
      const d = this.route.direction(this.setup.dirId);
      d.stops.slice(0, -1).forEach((s, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = `${s.name} (${s.code})`;
        stopSel.appendChild(o);
      });
      this.setup.stopIndex = Math.min(this.setup.stopIndex, d.stops.length - 2);
      stopSel.value = this.setup.stopIndex;
    };
    p.appendChild(this.field(mode === 'driver' ? t('terminal') : t('direction'), this.seg('dirId', dirOpts, fillStops)));
    if (mode === 'passenger') {
      stopSel = document.createElement('select');
      stopSel.onchange = () => (this.setup.stopIndex = Number(stopSel.value));
      p.appendChild(this.field(t('startStop'), stopSel));
      fillStops();
    }
    p.appendChild(this.field(t('weather'), this.seg('weather', [['clear', t('clear')], ['cloudy', t('cloudy')], ['rain', t('rain')]])));
    p.appendChild(this.field(t('time'), this.seg('hour', [[7.5, t('morning')], [12.5, t('noon')], [18.6, t('evening')], [21.8, t('night')]])));
    p.appendChild(this.field(t('traffic'), this.seg('traffic', [['low', t('low')], ['medium', t('medium')], ['high', t('high')]])));
    const q = { quality: this.settings.quality };
    const qs = document.createElement('div');
    qs.className = 'seg';
    for (const [v, l] of [['ultra', 'Ultra'], ['high', 'High'], ['balanced', 'Balanced']]) {
      const b = document.createElement('button');
      b.textContent = l;
      b.className = q.quality === v ? 'on' : '';
      b.onclick = () => {
        q.quality = v;
        [...qs.children].forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      };
      qs.appendChild(b);
    }
    p.appendChild(this.field(t('graphics'), qs));
    const row = document.createElement('div');
    row.className = 'row go-row'; // stays visible at the bottom while the options scroll
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginTop = 'auto';
    const back = document.createElement('button');
    back.className = 'btn';
    back.textContent = t('back');
    back.onclick = () => this.main();
    const go = document.createElement('button');
    go.className = 'btn primary';
    go.style.flex = '1';
    go.textContent = `${t('start')} ▶`;
    go.onclick = () => {
      this.settings[`vehicle${line}`] = this.setup.vehicle;
      if (this.setup.vehicle === 'man') this.settings.fleet = this.setup.fleet;
      this.settings.traffic = this.setup.traffic;
      const qualityChanged = q.quality !== this.settings.quality;
      this.settings.quality = q.quality;
      saveSettings(this.settings);
      this.onStart({ ...this.setup, qualityChanged });
    };
    row.append(back, go);
    p.appendChild(row);
    this.el.appendChild(p);
  }

  settingsScreen(onBack) {
    this.clear();
    const s = this.settings;
    const p = document.createElement('div');
    p.className = 'panel setup center';
    p.innerHTML = `<h2>${t('settings')}</h2>`;
    const slider = (key, label, min, max, step) => {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = min;
      i.max = max;
      i.step = step;
      i.value = s[key];
      i.oninput = () => {
        s[key] = Number(i.value);
        this.onSettingsChanged(s);
      };
      p.appendChild(this.field(label, i));
    };
    const toggle = (key, label) => {
      const w = document.createElement('div');
      w.className = 'seg';
      for (const [v, l] of [[true, L('Да / On', 'On')], [false, L('Не / Off', 'Off')]]) {
        const b = document.createElement('button');
        b.textContent = l;
        b.className = s[key] === v ? 'on' : '';
        b.onclick = () => {
          s[key] = v;
          [...w.children].forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          this.onSettingsChanged(s);
        };
        w.appendChild(b);
      }
      p.appendChild(this.field(label, w));
    };
    slider('volMaster', `${t('volume')} · ${t('master')}`, 0, 1, 0.05);
    slider('volEngine', t('engine'), 0, 1, 0.05);
    slider('volVoice', t('voice'), 0, 1, 0.05);
    slider('volAmbience', t('ambience'), 0, 1, 0.05);
    slider('volSfx', t('sfx'), 0, 1, 0.05);
    // voice selection
    const vs = document.createElement('select');
    const voices = this.voice.bulgarianVoices();
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = voices.length ? L('Автоматично (женски глас, ако има)', 'Automatic (female voice if available)') : L('Няма български глас на устройството — само текст', 'No Bulgarian voice on this device — text only');
    vs.appendChild(o0);
    for (const v of voices) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = `${v.name} (${v.lang})`;
      vs.appendChild(o);
    }
    vs.value = s.voiceName || '';
    vs.onchange = () => {
      s.voiceName = vs.value;
      this.voice.pickVoice();
      this.onSettingsChanged(s);
    };
    p.appendChild(this.field(t('voiceSel'), vs));
    const info = document.createElement('div');
    info.style.color = 'var(--dim)';
    info.style.fontSize = '.8em';
    info.textContent = L(`Текущ глас: ${this.voice.describe()}`, `Current voice: ${this.voice.describe()}`);
    p.appendChild(info);
    const test = document.createElement('button');
    test.className = 'btn';
    test.textContent = L('▶ Тест: „Следваща спирка …“', '▶ Test the announcement voice (Bulgarian)');
    test.onclick = () => this.onSettingsChanged(s, 'testVoice');
    p.appendChild(test);
    const tb = document.createElement('button');
    tb.className = 'btn';
    tb.textContent = L('▶ Тест: сигнал при затваряне на вратите (бип-бип)', '▶ Test: door closing warning (beep-beep)');
    tb.onclick = () => this.onSettingsChanged(s, 'testBeep');
    p.appendChild(tb);
    slider('beepFreq', `${t('beep')} — Hz`, 900, 3200, 50);
    slider('sensitivity', t('sensitivity'), 0.3, 2.5, 0.1);
    toggle('invertY', t('invertY'));
    toggle('gyro', t('gyro'));
    slider('controlsSize', t('controlsSize'), 0.75, 1.4, 0.05);
    slider('renderScale', t('renderScale'), 0.5, 1, 0.05);
    toggle('showFps', t('showFps'));
    const back = document.createElement('button');
    back.className = 'btn primary';
    back.textContent = t('back');
    back.onclick = () => {
      saveSettings(s);
      onBack();
    };
    p.appendChild(back);
    this.el.appendChild(p);
  }

  credits() {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel setup center';
    p.innerHTML = `<h2>${t('credits')}</h2>
      <p><b>Sofia Public Transport — ${L('линии 280, 64 и трамвай 12', 'lines 280, 64 and tram 12')}</b><br>${L('Независим фен проект / independent fan project.', 'Independent fan project.')}</p>
      <p>${L('<b>Карта и спирки:</b> © OpenStreetMap contributors (ODbL 1.0), разпространено чрез Overture Maps Foundation (release 2026-10-21.0). Кодовете на спирките са официалните кодове на ЦГМ / sofiatraffic.bg.', '<b>Map and stops:</b> © OpenStreetMap contributors (ODbL 1.0), distributed via the Overture Maps Foundation (release 2026-10-21.0). Stop codes are the official codes of the Sofia Urban Mobility Center / sofiatraffic.bg.')}</p>
      <p>${L('<b>Релеф:</b>', '<b>Terrain:</b>')} Mapzen / AWS Terrain Tiles (SRTM, EU-DEM).</p>
      <p>${L('<b>Автобуси:</b> MAN Lion\'s City G CNG, Mercedes-Benz Conecto G, BMC Procity CNG, Yutong ZK6126HGA — процедурни 3D модели по референтни снимки; размери по публични данни (приблизителни).', '<b>Buses:</b> MAN Lion\'s City G CNG, Mercedes-Benz Conecto G, BMC Procity CNG, Yutong ZK6126HGA — procedural 3D models based on reference photos; dimensions from public data (approximate).')}</p>
      <p>${L('<b>Звук:</b> изцяло синтезиран в реално време (WebAudio). Гласът на съобщенията е българският глас на устройството или вградени лицензирани записи.', '<b>Sound:</b> fully synthesised in real time (WebAudio). Announcements use the device\'s Bulgarian voice or bundled licensed recordings.')}</p>
      <p>${L('<b>Технологии:</b>', '<b>Technology:</b>')} three.js (MIT), esbuild.</p>
      <p style="color:var(--dim);font-size:.85em">${L('MAN, Lion\'s City, Mercedes-Benz, Conecto, BMC, Procity и Yutong са търговски марки на съответните притежатели. Проектът не е свързан с производителите, Столичен автотранспорт или Центъра за градска мобилност.', 'MAN, Lion\'s City, Mercedes-Benz, Conecto, BMC, Procity and Yutong are trademarks of their owners. This project is not affiliated with the manufacturers, Stolichen Avtotransport or the Sofia Urban Mobility Center.')}</p>`;
    const back = document.createElement('button');
    back.className = 'btn primary';
    back.textContent = t('back');
    back.onclick = () => this.main();
    p.appendChild(back);
    this.el.appendChild(p);
  }

  pause({ onResume, onMenu, onRestart, onCamera }) {
    this.clear();
    const w = document.createElement('div');
    w.className = 'pause';
    w.innerHTML = `<div class="panel"><h2 style="margin:0 0 6px">${t('paused')}</h2></div>`;
    const panel = w.firstChild;
    const add = (label, fn, cls = 'btn') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      panel.appendChild(b);
    };
    add(t('resume'), onResume, 'btn primary');
    add(t('camera'), onCamera);
    add(t('settings'), () => this.settingsScreen(() => this.pause({ onResume, onMenu, onRestart, onCamera })));
    add(t('restart'), onRestart);
    add(t('mainMenu'), onMenu);
    this.el.appendChild(w);
  }
}
