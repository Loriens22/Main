// Driver mode of a tram (Game.updateDriver hands over here when the player drives a tram). The controls of a
// tram cab instead of pedals and a wheel:
//   W / ↑   controller one notch towards power      S / ↓   one notch towards braking (held: repeats)
//   N       controller to zero                       X       emergency brake (magnetic track brakes)
//   I       main switch                              U       pantograph up / down
//   1 2 3   direction forward / neutral / reverse    P       parking (spring) brake
//   O / F / C  doors all / door 1 / close            Space   bell (gong)      B (held)  horn
//   Z (held) sand                                    L lights, H hazard, Q / E indicators, Y wipers, T display
// Touch: the throttle and brake sliders set the power and brake notches.
import { L, t } from '../ui/i18n.js';
import { DRIVER_CAMS } from '../render/CameraRig.js';

const REPEAT = 0.28; // s between notches while a key is held

/** Checklist before departure of a tram. */
export function tramChecklist(bus) {
  const p = bus.phys;
  return [
    { label: L('Главен прекъсвач', 'Main switch'), key: 'I', done: p.engineOn },
    { label: L('Вдигни пантографа', 'Raise the pantograph'), key: 'U', done: p.pantoH > 0.95 },
    { label: L('Затвори вратите', 'Close the doors'), key: 'C', done: bus.doors.allClosed },
    { label: L('Освободи ръчната спирачка', 'Release the parking brake'), key: 'P', done: !p.parkingBrake },
    { label: L('Посока напред', 'Direction forward'), key: '1', done: p.selector === 'D' },
  ];
}

export function updateTramDriver(game, dt, inp) {
  const bus = game.bus, p = bus.phys, I = game.input, P = bus.spec.physics;
  // --- discrete controls
  if (I.hit('KeyI')) {
    p.engineOn = !p.engineOn;
    game.hud.toast(p.engineOn ? L('Главният прекъсвач е включен', 'Main switch on') : L('Главният прекъсвач е изключен', 'Main switch off'));
    game.audio.gearSelect && game.audio.gearSelect('N');
  }
  if (I.hit('KeyU')) {
    p.pantoUp = !p.pantoUp;
    game.hud.toast(p.pantoUp ? L('Пантографът се вдига', 'Raising the pantograph') : L('Пантографът се сваля', 'Lowering the pantograph'));
  }
  if (I.hit('Digit1') || I.hit('Numpad1')) game.selectGear('D');
  if (I.hit('Digit2') || I.hit('Numpad2')) game.selectGear('N');
  if (I.hit('Digit3') || I.hit('Numpad3')) game.selectGear('R');
  if (I.hit('KeyP')) p.parkingBrake = !p.parkingBrake;
  if (I.hit('KeyO')) game.openDoors(null);
  if (I.hit('KeyF')) game.openDoors([1]);
  if (I.hit('KeyC')) bus.doors.close();
  if (I.hit('KeyQ')) { bus.lights.left = !bus.lights.left; bus.lights.right = false; }
  if (I.hit('KeyE')) { bus.lights.right = !bus.lights.right; bus.lights.left = false; }
  if (I.hit('KeyH')) bus.lights.hazard = !bus.lights.hazard;
  if (I.hit('KeyL')) bus.lights.head = !bus.lights.head;
  if (I.hit('KeyY')) bus.wiper.mode = (bus.wiper.mode + 1) % 3;
  if (I.hit('KeyT')) {
    const modes = ['route', 'depot', 'off'];
    bus.display.mode = modes[(modes.indexOf(bus.display.mode) + 1) % 3];
    bus.updateSigns();
  }
  if (I.hit('Tab')) game.hud.toast(`${t('camera')}: ${game.rig.cycle(DRIVER_CAMS)}`);
  if (I.hit('Space') || game.touchBell) { game.touchBell = false; bus.bellRing = (bus.bellRing || 0) + 1; }
  game.audio.horn(I.keys.has('KeyB') || !!game.touchHorn);
  p.sand = I.keys.has('KeyZ');
  // --- the controller: notches by key presses (held keys repeat), touch sliders set it directly
  const up = I.down ? I.down(['KeyW', 'ArrowUp']) : I.keys.has('KeyW') || I.keys.has('ArrowUp');
  const dn = I.down ? I.down(['KeyS', 'ArrowDown']) : I.keys.has('KeyS') || I.keys.has('ArrowDown');
  const st = bus._ctl || (bus._ctl = { rep: 0 });
  if (I.hit('KeyW') || I.hit('ArrowUp')) { p.notch = Math.min(P.notches, p.notch + 1); st.rep = REPEAT * 1.6; }
  else if (I.hit('KeyS') || I.hit('ArrowDown')) { p.notch = Math.max(-P.brakeNotches, p.notch - 1); st.rep = REPEAT * 1.6; }
  else if (up || dn) {
    st.rep -= dt;
    if (st.rep <= 0) {
      st.rep = REPEAT;
      p.notch = up ? Math.min(P.notches, p.notch + 1) : Math.max(-P.brakeNotches, p.notch - 1);
    }
  }
  if (I.hit('KeyN')) p.notch = 0;
  const tc = I.touch;
  if (tc && tc.active) {
    if (tc.throttle > 0.05) p.notch = Math.max(1, Math.ceil(tc.throttle * P.notches - 1e-6));
    else if (tc.brake > 0.05) p.notch = -Math.max(1, Math.ceil(tc.brake * P.brakeNotches - 1e-6));
    else if (st.touchWas) p.notch = 0;
    st.touchWas = tc.throttle > 0.05 || tc.brake > 0.05;
  }
  if (I.hit('KeyX')) {
    p.emergency = true;
    p.notch = -P.brakeNotches;
    game.hud.toast(L('Аварийна спирачка!', 'Emergency brake!'), true);
  }
  if (p.notch !== st.lastNotch) {
    if (st.lastNotch != null && game.gameAudio.notch) game.gameAudio.notch(bus, p.notch, st.lastNotch);
    st.lastNotch = p.notch;
  }
  bus.model.setController(p.notch > 0 ? p.notch / P.notches : p.notch / P.brakeNotches);
  // --- continuous
  bus.update(dt, { notch: p.notch });
  bus.clearTrack(game.traffic, dt);
  bus.syncVisual();
  // --- derailment protection: a tram far over the limit in a curve or over points brakes itself
  const lim = bus.limit;
  if (Math.abs(p.v) > 1 && (lim.why === 'curve' || lim.why === 'switch')) {
    const over = Math.abs(p.v) - lim.v;
    if (over > lim.v * 0.4 && !p.emergency) {
      p.emergency = true;
      p.notch = -P.brakeNotches;
      game.scoring.add('derail', -40, L('Защита от дерайлиране: аварийно спиране!', 'Derailment protection: emergency brake!'));
      game.rig.shake = 0.8;
    } else if (over > 1.4 && game.time - (st.warnT ?? -9) > 4) {
      st.warnT = game.time;
      game.hud.toast(lim.why === 'curve' ? L(`Завой: най-много ${Math.round(lim.v * 3.6)} км/ч`, `Curve: ${Math.round(lim.v * 3.6)} km/h max`) : L(`Стрелка: най-много ${Math.round(lim.v * 3.6)} км/ч`, `Points: ${Math.round(lim.v * 3.6)} km/h max`), true);
    }
  }
  if (!p.wireOk || (p.pantoH < 0.95 && p.notch > 0 && game.time - (st.pantoT ?? -9) > 5)) {
    st.pantoT = game.time;
    game.hud.toast(L('Няма напрежение: вдигнете пантографа (U)', 'No line voltage: raise the pantograph (U)'), true);
  }
  // --- events
  if (p.lastCollision) {
    const fresh = game.time - (game.lastContactT ?? -9) > 1.5;
    game.lastContactT = game.time;
    if (fresh && p.lastCollision.speed > 0.5) {
      game.audio.crash(p.lastCollision.speed);
      game.rig.shake = 1;
      game.scoring.add('collision', -Math.round(25 + p.lastCollision.speed * 12), L('Сблъсък!', 'Collision!'));
      game.hud.toast(L('Сблъсък!', 'Collision!'), true);
    }
    p.lastCollision = null;
  }
  for (const e of bus.events.splice(0)) game.onStopEvent(bus, e);
  game.scoring.update(dt, bus, game.world);
  if (game.traffic && bus.signalsAhead) {
    for (const sg of bus.signalsAhead) {
      if (bus.prevFrontS != null && bus.prevFrontS < sg.s && bus.frontS >= sg.s && bus.frontS - bus.prevFrontS < 5) {
        const s = game.traffic.signals.state(sg.node, sg.end);
        if (s === 'R') game.scoring.add('redlight', -30, L('Преминахте на червен светофар!', 'You ran a red light!'));
      }
    }
  }
  bus.prevFrontS = bus.frontS;
  for (const m of game.scoring.messages.splice(0)) game.hud.toast(m.text, m.bad);
  // --- checklist
  if (!game.checklistDone) {
    const items = tramChecklist(bus);
    game.hud.setChecklist(items);
    if (items.every((i) => i.done)) {
      game.checklistDone = true;
      game.hud.setChecklist(null);
      game.hud.toast(L('Готови за тръгване — W: контролер напред, S: спирачка', 'Ready to go — W: power notch, S: brake notch'));
    }
  }
  // --- camera, HUD, instruments
  game.rig.updateBus(dt, bus, inp);
  game.audio.setZone(game.rig.mode === 'cab' ? 'cab' : 'outside');
  game.hud.cross.classList.remove('show');
  game.updateDriverHud(dt);
  drawDash(game, bus);
}

function drawDash(game, bus) {
  game.dashTimer = (game.dashTimer || 0) + 1;
  if (game.dashTimer % 4) return;
  const m = bus.model, p = bus.phys;
  const c = m.dashCanvas;
  m.drawDash(c.getContext('2d'), {
    w: c.width, h: c.height, speedKmh: p.speedKmh, currentA: p.currentA, volts: p.pantoH > 0.95 && p.wireOk ? 600 + Math.sin(game.time * 0.7) * 12 - p.currentA * 0.04 : 0,
    notch: p.notch, emergency: p.emergency, selector: p.selector, mainOn: p.engineOn, pantoUp: p.pantoH > 0.95,
    doorsOpen: bus.doors.anyOpen, parking: p.parkingBrake, slip: p.slip, head: bus.lights.head, sand: !!p.sand, bell: (bus.bellT || 0) > 0,
  });
  m.dashTex.needsUpdate = true;
}
