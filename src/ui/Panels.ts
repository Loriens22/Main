import { h, type PanelHandle } from './UI';
import { exobiologyTab } from './FieldLog';
import type { Game } from '../core/Game';
import { applyPreset, PRESETS, DEFAULT_BINDINGS, type PresetName, type Quality } from '../core/Settings';
import { listSaves, deleteSave } from '../core/Save';
import { MissionClock } from '../core/MissionClock';
import { SYSTEM_LABELS } from '../systems/ShipSystems';
import { SPECS, deltaV } from '../data/vehicles';
import { CHARACTERS, CREW } from '../data/characters';

// ==================================================================================================== main menu
let mainMenuEl: HTMLElement | null = null;

export function showMainMenu(game: Game) {
  hideMainMenu(game);
  const ui = game.ui;
  const items = h('div', { class: 'items' });
  let sub: HTMLElement | null = null;
  const btn = (label: string, fn: () => void) =>
    h('button', { class: 'mm-btn interactive', onclick: () => { game.audio.start(); game.audio.ui('click'); fn(); }, onmouseenter: () => game.audio.ui('hover') }, label);
  const play = btn('PLAY', () => {
    if (sub) { sub.remove(); sub = null; return; }
    sub = h('div', { class: 'mm-sub' },
      h('div', { class: 'note' }, 'Explore freely. Optional assists, automatic refuelling and repair, fast travel, and no forced objectives.'),
      btn('CREATIVE MODE', () => game.startCreative(true)),
      listSaves().length ? btn('CONTINUE', () => game.load(listSaves()[0].slot)) : null,
    );
    play.after(sub);
  });
  items.append(play, btn('SETTINGS', () => openSettings(game)));
  mainMenuEl = h('div', { class: 'mainmenu' },
    h('div', { class: 'title' }, 'INTERSTELLAR'),
    h('div', { class: 'subtitle' }, 'BEYOND ENDURANCE'),
    items,
    h('div', { class: 'foot' }, 'A fan-made simulation inspired by Interstellar (2014).', h('br'), 'Original assets, music and sound — all procedurally generated.'),
  );
  ui.root.append(mainMenuEl);
  requestAnimationFrame(() => setTimeout(() => mainMenuEl?.classList.add('show'), 600));
  game.audio.music?.setMood('menu');
  const startAudio = () => {
    game.audio.start().then(() => game.audio.music?.setMood('menu'));
    window.removeEventListener('pointerdown', startAudio);
    window.removeEventListener('keydown', startAudio);
  };
  window.addEventListener('pointerdown', startAudio);
  window.addEventListener('keydown', startAudio);
}

export function hideMainMenu(_game: Game) {
  if (!mainMenuEl) return;
  const el = mainMenuEl;
  mainMenuEl = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 1500);
}

// ==================================================================================================== in-game menu
export function openGameMenu(game: Game) {
  game.ui.openPanel('PAUSED', (b, p) => {
    const list = h('div', { class: 'menu-list' });
    const item = (label: string, fn: () => void) => list.append(game.ui.button(label, fn, ''));
    item('RESUME GAME', () => { p.close(); game.input.requestLock(); });
    item('SETTINGS', () => openSettings(game));
    item('MISSION COMPUTER', () => openMissionComputer(game));
    item('SPACECRAFT MANAGEMENT', () => openMissionComputer(game, 'vehicles'));
    item('CREATIVE MODE OPTIONS', () => openCreativePanel(game));
    item('SAVE GAME', () => openSaveLoad(game, 'save'));
    item('LOAD GAME', () => openSaveLoad(game, 'load'));
    item('RETURN TO MAIN MENU', () => {
      if (confirm('Return to the main menu? Unsaved progress will be lost.')) game.returnToMainMenu();
    });
    b.append(list);
  }, { narrow: true, onClose: () => { if (!game.ui.panelOpen) game.input.requestLock(); } });
}

// ==================================================================================================== settings
export function openSettings(game: Game) {
  const s = game.settings;
  const ui = game.ui;
  const apply = () => game.applySettings();
  const q: [Quality, string][] = [[0, 'Off / Low'], [1, 'Medium'], [2, 'High'], [3, 'Ultra']];
  ui.openPanel('SETTINGS', () => {}, {
    tabs: [
      {
        id: 'graphics', label: 'GRAPHICS', build: (b) => {
          const g = s.graphics;
          const rebuild = () => { b.innerHTML = ''; (ui as any)._gfx(b); };
          (ui as any)._gfx = (bb: HTMLElement) => {
            bb.append(ui.row('Graphics preset', ui.select<PresetName | 'custom'>(g.preset, [['cinematic', 'Cinematic'], ['ultra', 'Ultra'], ['high', 'High'], ['medium', 'Medium'], ['performance', 'Performance'], ['phone', 'Phone (low power)'], ['custom', 'Custom']], (v) => {
              g.autoPreset = false;
              if (v !== 'custom') applyPreset(g, v);
              else g.preset = 'custom';
              apply();
              rebuild();
            })));
            const custom = () => { g.preset = 'custom'; g.autoPreset = false; apply(); };
            const [rs, rv] = ui.slider(g.resolutionScale, 0.5, 1.5, 0.05, (v) => { g.resolutionScale = v; custom(); }, (v) => `${Math.round(v * 100)}%`);
            bb.append(ui.row('Resolution scale', rs, rv));
            const qs: [keyof typeof g, string][] = [['textureQuality', 'Texture quality'], ['shadowQuality', 'Shadow quality'], ['reflections', 'Reflections'], ['ambientOcclusion', 'Ambient occlusion'], ['volumetrics', 'Volumetric effects'], ['atmosphere', 'Atmospheric quality'], ['water', 'Water quality'], ['viewDistance', 'View distance']];
            for (const [k, label] of qs) bb.append(ui.row(label, ui.select<Quality>(g[k] as Quality, q, (v) => { (g as any)[k] = v; custom(); })));
            bb.append(ui.row('Anti-aliasing', ui.select(g.antiAliasing, [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa', 'MSAA 4×']], (v) => { g.antiAliasing = v; custom(); })));
            const [vd, vv] = ui.slider(g.vegetationDensity, 0.2, 1.5, 0.05, (v) => { g.vegetationDensity = v; custom(); });
            bb.append(ui.row('Vegetation density', vd, vv));
            bb.append(ui.row('Dynamic resolution (holds the frame rate)', ui.toggle(g.dynamicResolution, (v) => { g.dynamicResolution = v; custom(); })));
            bb.append(ui.row('Bloom', ui.toggle(g.bloom, (v) => { g.bloom = v; custom(); })));
            bb.append(ui.row('Camera motion blur', ui.toggle(g.motionBlur, (v) => { g.motionBlur = v; custom(); })));
            bb.append(ui.row('Film grain', ui.toggle(g.filmGrain, (v) => { g.filmGrain = v; custom(); })));
            bb.append(ui.row('Lens effects (vignette, chromatic aberration)', ui.toggle(g.lensEffects, (v) => { g.lensEffects = v; custom(); })));
            bb.append(ui.row('Frame-rate cap', ui.select(g.fpsCap, [[0, 'VSync / unlimited'], [30, '30'], [60, '60'], [120, '120']], (v) => { g.fpsCap = v; apply(); })));
            const [fv, fvv] = ui.slider(g.fov, 50, 100, 1, (v) => { g.fov = v; apply(); }, (v) => `${v}°`);
            bb.append(ui.row('Field of view', fv, fvv));
            bb.append(ui.row('Show performance counter', ui.toggle(ui.showFps, (v) => { ui.showFps = v; })));
          };
          (ui as any)._gfx(b);
        },
      },
      {
        id: 'audio', label: 'AUDIO', build: (b) => {
          const a = s.audio;
          for (const [k, label] of [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Sound effects'], ['dialogue', 'Dialogue'], ['ambience', 'Ambience']] as const) {
            const [sl, v] = ui.slider(a[k], 0, 1, 0.01, (x) => { a[k] = x; apply(); }, (x) => `${Math.round(x * 100)}`);
            b.append(ui.row(label, sl, v));
          }
          b.append(ui.row('Spoken dialogue (speech synthesis)', ui.toggle(game.audio.tts, (v) => { game.audio.tts = v; })));
        },
      },
      {
        id: 'controls', label: 'CONTROLS', build: (b) => {
          const c = s.controls;
          const [ms, mv] = ui.slider(c.mouseSensitivity, 0.2, 3, 0.05, (v) => { c.mouseSensitivity = v; apply(); });
          b.append(ui.row('Mouse sensitivity', ms, mv));
          const [gs, gv] = ui.slider(c.gamepadSensitivity, 0.2, 3, 0.05, (v) => { c.gamepadSensitivity = v; apply(); });
          b.append(ui.row('Gamepad sensitivity', gs, gv));
          const [ts, tv] = ui.slider(c.touchScale, 0.7, 1.6, 0.05, (v) => { c.touchScale = v; apply(); });
          b.append(ui.row('Touch control size', ts, tv));
          b.append(ui.row('Invert look Y', ui.toggle(c.invertY, (v) => { c.invertY = v; apply(); })));
          b.append(ui.row('Invert flight pitch', ui.toggle(c.invertFlightPitch, (v) => { c.invertFlightPitch = v; apply(); })));
          b.append(ui.row('Head bob', ui.toggle(c.headBob, (v) => { c.headBob = v; apply(); })));
          b.append(ui.row('Subtitles', ui.toggle(c.subtitles, (v) => { c.subtitles = v; apply(); })));
          b.append(h('div', { class: 'dim', style: { margin: '18px 0 8px', fontSize: '11px', letterSpacing: '0.2em' } }, 'KEY BINDINGS — click a binding, then press a key'));
          for (const action of Object.keys(DEFAULT_BINDINGS)) {
            const keys = c.bindings[action] ?? [];
            const btn = h('button', { class: 'btn small', style: { minWidth: '150px', textAlign: 'center' } }, keys.join(' / ') || '—');
            btn.addEventListener('click', () => {
              btn.textContent = 'press a key…';
              const handler = (e: KeyboardEvent) => {
                e.preventDefault();
                window.removeEventListener('keydown', handler, true);
                if (e.code === 'Escape') { btn.textContent = (c.bindings[action] ?? []).join(' / '); return; }
                c.bindings[action] = [e.code];
                btn.textContent = e.code;
                apply();
              };
              window.addEventListener('keydown', handler, true);
            });
            b.append(ui.row(action.replace(/([A-Z])/g, ' $1').toLowerCase(), btn));
          }
          b.append(h('div', { style: { marginTop: '14px' } }, ui.button('RESET BINDINGS', () => { c.bindings = structuredClone(DEFAULT_BINDINGS); apply(); }, 'btn small')));
        },
      },
      {
        id: 'life', label: 'ALIEN LIFE', build: (b) => {
          const l = s.life;
          const note = (t: string) => h('div', { class: 'dim', style: { fontSize: '12px', margin: '-4px 0 10px', lineHeight: '1.45' } }, t);
          b.append(ui.row('Alien life', ui.toggle(l.enabled, (v) => { l.enabled = v; apply(); })));
          b.append(note('Native creatures on other worlds. Off: no creatures anywhere.'));
          b.append(ui.row('Mars', ui.toggle(l.mars, (v) => { l.mars = v; apply(); })));
          b.append(note('Striders, burrowing stalkers, diving lancewings and drifting tether-kites on the surface; in the refuge cavern beside each landing site, the speculative-evolution nine: Crimson Icebloom, Ferric Cathedral, Glass Ribbon, Prism Architect, Ghost of Valles, Basalt Mimic, Thermal Rift Serpent, Subglacial Monarch — and the rare Red Dune Hermit at its fissure.'));
          b.append(ui.row('Jupiter', ui.toggle(l.jupiter, (v) => { l.jupiter = v; apply(); })));
          b.append(note('Singing gas-bag floaters, veil rays, maw rays, spore bulbs and balloon hunters in the cloud layer — met from Ranger 1. Shake off a creature by jabbing Q/E or full thrust.'));
          b.append(ui.row("Miller's Planet", ui.toggle(l.miller, (v) => { l.miller = v; apply(); })));
          b.append(note('An abyssal biosphere: reef grazers, buried suction traps, a camouflaged eight-limbed crawler, cave and deep-basin life. Mostly to be watched — some defend themselves.'));
          b.append(ui.row('Science mode', ui.select<'speculative' | 'conservative'>(l.science, [['speculative', 'Speculative evolution — the full biosphere'], ['conservative', 'Scientific / conservative']], (v) => { l.science = v; apply(); })));
          b.append(note('No life is known on Mars or Jupiter. Speculative: every creature, each labelled in the codex (observed · inferred · hypothetical · speculative). Conservative: no complex animals on Mars or Jupiter — only the environments and archive hypotheses. Takes effect on the next landing.'));
          b.append(ui.row('Heroic Jupiter scale', ui.toggle(l.heroic, (v) => { l.heroic = v; apply(); })));
          b.append(note("Creative: show the Jupiter giants at the reference sheet's poster size rather than the size the simulation can justify."));
          b.append(ui.row('Hostility', ui.select<'passive' | 'normal' | 'fierce'>(l.hostility, [['passive', 'Passive — they never attack'], ['normal', 'Normal'], ['fierce', 'Fierce']], (v) => { l.hostility = v; apply(); })));
          const [ds, dv] = ui.slider(l.density, 0.5, 2, 0.25, (v) => { l.density = v; apply(); }, (v) => `${Math.round(v * 100)} %`);
          b.append(ui.row('Creature numbers', ds, dv));
        },
      },
    ],
  });
}

// ==================================================================================================== save / load
export function openSaveLoad(game: Game, mode: 'save' | 'load') {
  game.ui.openPanel(mode === 'save' ? 'SAVE GAME' : 'LOAD GAME', (b, p) => {
    const render = () => {
      b.innerHTML = '';
      const saves = listSaves();
      const slots = ['slot1', 'slot2', 'slot3', 'quick', 'auto'];
      const list = h('div', { class: 'list' });
      for (const slot of slots) {
        const info = saves.find((s) => s.slot === slot);
        const desc = info ? `${info.label} · ${info.location.toUpperCase()} · ${MissionClock.formatDate(info.earthTime)} · saved ${new Date(info.savedAt).toLocaleString()}` : 'empty';
        const actions = h('div', { style: { display: 'flex', gap: '6px' } });
        if (mode === 'save' && slot !== 'auto') actions.append(game.ui.button('SAVE', () => { game.save(slot, `${game.zone?.describe().name ?? ''}`); render(); }, 'btn small primary'));
        if (mode === 'load' && info) actions.append(game.ui.button('LOAD', () => { p.close(); game.load(slot); }, 'btn small primary'));
        if (info) actions.append(game.ui.button('DELETE', () => { deleteSave(slot); render(); }, 'btn small danger'));
        list.append(h('div', { class: 'item' }, h('div', {}, h('div', { class: 'mono' }, slot.toUpperCase()), h('div', { class: 'dim', style: { fontSize: '11.5px' } }, desc)), actions));
      }
      b.append(list);
    };
    render();
  });
}

// ==================================================================================================== creative
export function openCreativePanel(game: Game) {
  const c = game.state.creative;
  const ui = game.ui;
  ui.openPanel('CREATIVE MODE OPTIONS', (b, p) => {
    const t = (label: string, key: keyof typeof c, note: string) => {
      b.append(h('div', { class: 'row' }, h('div', {}, h('label', {}, label), h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '3px' } }, note)), ui.toggle(c[key], (v) => { (c as any)[key] = v; (game.zone as any)?.onCreativeChanged?.(key); })));
    };
    t('Unlimited resource assist', 'unlimitedResources', 'Propellant, oxygen and power never deplete (consumption still displayed).');
    t('Automatic refuelling', 'autoRefuel', 'Enables the 10-second REFUEL command in spacecraft management (Creative override).');
    t('Automatic repair', 'autoRepair', 'Damaged systems are diagnosed and repaired automatically.');
    t('Autopilot assistance', 'autopilotAssist', 'Stability assist and compressed-time autopilots for launch, landing, ascent and docking.');
    t('Damage protection', 'damageProtection', 'Reduces impact and environmental damage; never lose a spacecraft.');
    t('Hazard protection', 'hazardProtection', 'Rescue from lethal hazards (tidal waves, falls, vacuum) instead of death.');
    t('Fast travel', 'fastTravel', 'Mission computer can move you instantly between visited locations.');
    t('Free camera', 'freeCamera', 'Detached spectator camera (toggle with the CAMERA key while on foot).');
    t('Allow time warp', 'timeWarpAllowed', 'Use , and . to change the simulation rate where physically safe.');
    b.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' } },
      ui.button('RECOVER SPACECRAFT', () => { (game.zone as any)?.recoverSpacecraft?.() ?? game.notify('No spacecraft to recover here', 'warn'); }, 'btn small'),
      ui.button('REPAIR ALL SYSTEMS', () => { for (const id of Object.keys(game.state.vehicles)) if (id !== 'oldlander') game.systems.repairAll(id, 'creative'); }, 'btn small'),
      ui.button('MISSION RESET', () => { if (confirm('Reset the whole mission to the farm? This cannot be undone.')) { p.close(); game.returnToMainMenu().then(() => game.startCreative(false)); } }, 'btn small danger'),
    ));
  }, { narrow: false });
}

// ==================================================================================================== refuelling (Creative override)
export function startRefuel(game: Game, vehicleId: string) {
  const v = game.state.vehicles[vehicleId];
  if (!v) return;
  if (!game.state.creative.autoRefuel) {
    game.notify('Automatic refuelling is disabled (Creative options).', 'warn');
    return;
  }
  if ((v.data as any).refuelling) return;
  (v.data as any).refuelling = true;
  const startFuel = v.fuel;
  const total = 10;
  let t = 0;
  let lastSec = -1;
  game.notify(`${v.name}: automatic refuelling started (Creative override) — 10 s`, 'info', 4);
  game.audio.burst({ dur: 10, freq: 300, q: 0.8, gain: 0.12, noise: 'brown', type: 'lowpass', attack: 0.5, air: false });
  const tick = (dt: number) => {
    t += dt > 0 ? dt : 1 / 60;
    const f = Math.min(1, t / total);
    v.fuel = startFuel + (v.fuelMax - startFuel) * f;
    const sec = Math.ceil(total - t);
    if (sec !== lastSec && sec >= 0) {
      lastSec = sec;
      game.ui.countdown(sec > 0 ? `REFUELLING ${sec}` : null);
      game.audio.beep(sec > 0 ? 660 : 990, 0.06, 0.04);
    }
    if (t >= total) {
      v.fuel = v.fuelMax;
      (v.data as any).refuelling = false;
      game.tickers.delete(tick);
      game.ui.countdown(null);
      game.audio.clank({ base: 120, gain: 0.2, decay: 0.8 });
      game.notify(`${v.name}: tanks full (${Math.round(v.fuelMax).toLocaleString()} ${SPECS[v.type] ? 'kg' : 'L'})`, 'ok', 4);
      game.log('maintenance', 'CREATIVE', `${v.name} refuelled to 100%`);
    }
  };
  game.tickers.add(tick);
}

// ==================================================================================================== mission computer
export function openMissionComputer(game: Game, initial = 'mission') {
  const ui = game.ui;
  const zoneTabs: { id: string; label: string; build: (b: HTMLElement) => void }[] = (game.zone as any)?.computerTabs?.() ?? [];
  const tabs = [
    ...zoneTabs,
    { id: 'mission', label: 'MISSION', build: (b: HTMLElement) => missionTab(game, b) },
    { id: 'vehicles', label: 'SPACECRAFT', build: (b: HTMLElement) => vehiclesTab(game, b) },
    { id: 'crew', label: 'CREW', build: (b: HTMLElement) => crewTab(game, b) },
    { id: 'clocks', label: 'CLOCKS', build: (b: HTMLElement) => clocksTab(game, b) },
    { id: 'logs', label: 'LOGS', build: (b: HTMLElement) => logsTab(game, b) },
    { id: 'bio', label: 'EXOBIOLOGY', build: (b: HTMLElement) => exobiologyTab(game, b) },
  ];
  const idx = tabs.findIndex((t) => t.id === initial);
  if (idx > 0) tabs.unshift(tabs.splice(idx, 1)[0]);
  ui.openPanel('MISSION COMPUTER', () => {}, { tabs, onClose: () => { if (!ui.panelOpen && game.phase === 'playing') game.input.requestLock(); } });
}

function missionTab(game: Game, b: HTMLElement) {
  const st = game.state;
  const ui = game.ui;
  const g = h('div', { class: 'grid2' });
  const status = h('div', { class: 'card' }, h('h3', {}, 'STATUS'),
    h('div', { class: 'kv' },
      h('span', {}, 'Location'), h('span', {}, game.zone?.describe().name ?? '—'),
      h('span', {}, 'Mission stage'), h('span', {}, st.mission.stage.toUpperCase()),
      h('span', {}, 'Decision'), h('span', {}, st.mission.decision === 'undecided' ? 'PENDING' : st.mission.decision === 'research' ? 'RESEARCH ON EARTH' : 'ENDURANCE MISSION'),
      h('span', {}, 'Earth date'), h('span', {}, MissionClock.formatDate(st.clock.earthTime)),
      h('span', {}, 'Discoveries'), h('span', {}, String(st.discoveries.length)),
    ));
  const obj = h('div', { class: 'card' }, h('h3', {}, 'OPTIONAL OBJECTIVES'));
  const objectives = (game.zone as any)?.objectives?.() as [string, boolean][] | undefined;
  const list = objectives ?? [];
  for (const [text, done] of list) obj.append(h('div', { class: 'row' }, h('span', {}, text), h('span', { class: done ? 'status-ok mono' : 'dim mono' }, done ? 'DONE' : 'OPEN')));
  if (!list.length) obj.append(h('div', { class: 'dim' }, 'No objectives here — explore freely.'));
  g.append(status, obj);
  if (st.creative.fastTravel) {
    const ft = h('div', { class: 'card' }, h('h3', {}, 'FAST TRAVEL (CREATIVE)'));
    const dests: [string, () => void][] = (game.zone as any)?.fastTravel?.() ?? [];
    for (const [label, fn] of dests) ft.append(ui.button(label, () => { ui.closeAllPanels(); fn(); }, 'btn small'), ' ');
    if (!dests.length) ft.append(h('div', { class: 'dim' }, 'No fast-travel destinations from here.'));
    g.append(ft);
  }
  const disc = h('div', { class: 'card' }, h('h3', {}, 'DISCOVERIES'));
  if (!st.discoveries.length) disc.append(h('div', { class: 'dim' }, 'None yet.'));
  for (const d of st.discoveries.slice(-12)) disc.append(h('div', { class: 'dim', style: { fontSize: '12px', padding: '3px 0' } }, '• ' + d));
  g.append(disc);
  b.append(g);
}

function vehiclesTab(game: Game, b: HTMLElement) {
  const st = game.state;
  const ui = game.ui;
  const render = () => {
    b.innerHTML = '';
    const g = h('div', { class: 'grid2' });
    for (const v of Object.values(st.vehicles)) {
      const spec = SPECS[v.type];
      const frac = v.fuelMax > 0 ? v.fuel / v.fuelMax : 0;
      const where = v.docked ? `Docked: ${v.docked.ship} / ${v.docked.port}` : v.landed ? `Landed: ${v.location}` : v.data?.mounted ? 'On launch vehicle (NASA silo)' : v.location.toUpperCase();
      const card = h('div', { class: 'card' }, h('h3', {}, v.name.toUpperCase()));
      const kv = h('div', { class: 'kv' },
        h('span', {}, 'Status'), h('span', {}, where),
        h('span', {}, spec ? 'Propellant' : 'Fuel'), h('span', {}, `${Math.round(v.fuel).toLocaleString()} ${spec ? 'kg' : 'L'} (${Math.round(frac * 100)}%)`),
      );
      if (spec) kv.append(h('span', {}, 'Δv remaining'), h('span', {}, `${(deltaV(spec, v.fuel) / 1000).toFixed(2)} km/s`));
      if (v.passengers.length) kv.append(h('span', {}, 'Aboard'), h('span', {}, v.passengers.map((p) => CHARACTERS[p]?.name.split(' ').pop()).join(', ')));
      card.append(kv, ui.meter(frac));
      const sys = game.systems.list(v.id);
      if (sys.length) {
        const sl = h('div', { style: { marginTop: '10px' } });
        for (const [k, s] of sys) {
          const job = game.systems.jobs.find((j) => j.key === `${v.id}.${k}`);
          const cls = s.integrity < 0.3 ? 'status-alert' : s.integrity < 0.95 || s.fault ? 'status-warn' : 'status-ok';
          sl.append(h('div', { class: 'row', style: { padding: '4px 0', fontSize: '11.5px' } },
            h('span', {}, SYSTEM_LABELS[k] ?? k),
            h('span', { class: `mono ${cls}` }, job ? `${job.stage.toUpperCase()} ${Math.round((job.t / job.dur) * 100)}%` : s.fault ? `${Math.round(s.integrity * 100)}% · ${s.fault}` : `${Math.round(s.integrity * 100)}%`)));
        }
        card.append(sl);
      }
      const acts = h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } });
      if (v.fuelMax > 0 && v.type !== 'endurance' || v.type === 'endurance') acts.append(ui.button('REFUEL (10 s)', () => { startRefuel(game, v.id); setTimeout(render, 200); }, 'btn small'));
      if (sys.some(([, s]) => s.fault || s.integrity < 0.999)) acts.append(ui.button('REPAIR NOW', () => { game.systems.repairAll(v.id, 'commander'); setTimeout(render, 200); }, 'btn small primary'));
      card.append(acts);
      g.append(card);
    }
    b.append(g);
  };
  render();
  const iv = setInterval(() => { if (!b.isConnected) clearInterval(iv); else if (game.systems.jobs.length || Object.values(st.vehicles).some((v) => (v.data as any).refuelling)) render(); }, 500);
}

function crewTab(game: Game, b: HTMLElement) {
  const g = h('div', { class: 'grid2' });
  const ids = [...CREW, ...['miller', 'mann'].filter((id) => game.state.npcs[id]?.memory.includes('joined'))];
  for (const id of ids) {
    const c = CHARACTERS[id];
    const n = game.state.npcs[id];
    if (!c || !n) continue;
    const card = h('div', { class: 'card' }, h('h3', {}, c.name.toUpperCase()),
      h('div', { class: 'dim', style: { fontSize: '11.5px', marginBottom: '8px' } }, c.role),
      h('div', { style: { fontSize: '12px', lineHeight: '1.5', marginBottom: '8px' } }, c.bio),
      h('div', { class: 'kv' },
        h('span', {}, 'Location'), h('span', {}, n.aboard ? `aboard ${n.aboard}` : n.frame),
        h('span', {}, 'Task'), h('span', {}, n.task.replace(/_/g, ' ')),
        h('span', {}, 'Health'), h('span', {}, `${Math.round(n.health * 100)}%`),
        h('span', {}, 'Stress'), h('span', {}, `${Math.round(n.stress * 100)}%`),
        h('span', {}, 'Trust'), h('span', {}, n.relationship > 0.5 ? 'HIGH' : n.relationship > 0 ? 'GOOD' : n.relationship > -0.3 ? 'WARY' : 'LOW'),
      ));
    g.append(card);
  }
  b.append(g);
}

function clocksTab(game: Game, b: HTMLElement) {
  const render = () => {
    const st = game.state;
    const z = game.zone as any;
    const ctx = { location: st.location, system: st.system, ...(z?.clockContext?.() ?? {}) };
    const fp = game.clock.playerDilation(ctx);
    const fe = game.clock.enduranceDilation(ctx);
    b.innerHTML = '';
    b.append(h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h3', {}, 'LOCAL PROPER TIME (YOU)'), h('div', { class: 'mono', style: { fontSize: '22px' } }, MissionClock.formatDuration(st.clock.playerProper)), h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '6px' } }, `dτ/dt = ${fp < 0.01 ? fp.toExponential(3) : fp.toFixed(6)}`)),
      h('div', { class: 'card' }, h('h3', {}, 'ENDURANCE SHIP TIME'), h('div', { class: 'mono', style: { fontSize: '22px' } }, MissionClock.formatDuration(st.clock.enduranceProper)), h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '6px' } }, `dτ/dt = ${fe.toFixed(6)}`)),
      h('div', { class: 'card' }, h('h3', {}, 'EARTH-REFERENCE TIME'), h('div', { class: 'mono', style: { fontSize: '22px' } }, MissionClock.formatDate(st.clock.earthTime)), h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '6px' } }, `elapsed since launch window: ${MissionClock.formatDuration(st.clock.earthTime - (st.flags.launchEarthTime as number ?? st.clock.earthTime))}`)),
    ),
    h('div', { class: 'dim', style: { fontSize: '12px', lineHeight: '1.6', marginTop: '14px' } },
      'Gravitational time dilation is modelled as a fixed ratio per location. Miller’s planet follows the film (1 hour ≈ 7 Earth years, a near-extremal rotating black hole — a fictional regime). Elsewhere the factors come from weak-field orbits.'));
  };
  render();
  const iv = setInterval(() => { if (!b.isConnected) clearInterval(iv); else render(); }, 1000);
}

function logsTab(game: Game, b: HTMLElement) {
  const st = game.state;
  const ui = game.ui;
  let channel = 'all';
  const render = () => {
    b.innerHTML = '';
    const sel = ui.select(channel, [['all', 'All channels'], ['maintenance', 'Maintenance'], ['access', 'Door & console access'], ['comms', 'Communications'], ['mission', 'Mission'], ['science', 'Science'], ['medical', 'Medical']], (v) => { channel = v; render(); });
    b.append(ui.row('Channel', sel));
    const log = h('div', { class: 'log', style: { maxHeight: '55vh' } });
    const entries = st.logs.filter((l) => channel === 'all' || l.channel === channel).slice(-200).reverse();
    for (const e of entries) {
      log.append(h('div', {}, h('span', {}, `[${MissionClock.formatDate(e.t)}] `), h('b', {}, `${e.who}: `), e.text));
    }
    if (!entries.length) log.append('No entries.');
    b.append(log);
  };
  render();
}

export type { PanelHandle };
