// Game orchestration: modes (driver / passenger / attract), the main update
// loop, scoring, timetable, announcements and audio routing.
import * as THREE from 'three';
import { createVehicle } from '../gameplay/VehicleFactory.js';
import { updateTramDriver, tramChecklist } from './TramDriving.js';
import { CameraRig, DRIVER_CAMS } from '../render/CameraRig.js';
import { Hud } from '../ui/Hud.js';
import { t, L } from '../ui/i18n.js';
import { clamp, fwdX, fwdZ } from '../core/math.js';
import { Scoring } from '../gameplay/Scoring.js';
import { PassengerMode } from './PassengerMode.js';
import { dispatchVehicle, fleetFor, lineVehicles, vehicleSpec } from '../vehicle/Vehicles.js';
import { BusLightRig } from '../render/BusLights.js';
import { GameAudio } from '../audio/GameAudio.js';

const CAM_NAMES = {
  cab: ['кабина', 'cab'], follow: ['отзад', 'chase'], front: ['отпред', 'front'],
  side: ['отстрани', 'side'], joint: ['хармоника', 'articulation joint'], free: ['свободна', 'free'],
};
const camName = (m) => (CAM_NAMES[m] ? L(...CAM_NAMES[m]) : m);

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, scene, camera, sky, world, route, audio, voice, input, settings, uiRoot
    this.rig = new CameraRig(this.camera, this.world);
    this.hud = new Hud(this.uiRoot);
    this.hud.setLine(this.route.line);
    this.hud.setMapRoads(this.world.roads);
    this.busLights = new BusLightRig(this.scene);
    this.hud.show(false);
    this.mode = 'attract';
    this.paused = false;
    this.time = 0;
    this.fpsAcc = { t: 0, n: 0, fps: 60 };
    this.focus = new THREE.Vector3();
    this.listeners = [];
    this.voiceBusy = false;
    this.gameAudio = new GameAudio(this); // sound events and listener for every bus (src/audio)
    this.voice.onSubtitle = (m) => this.hud.subtitle(m.display ? `${m.kind === 'next' ? t('nextStop') : t('stop')}: ${m.display}` : m.text, 7);
  }

  emit(type, data) {
    for (const fn of this.listeners) fn(type, data);
  }

  on(fn) {
    this.listeners.push(fn);
  }

  /**
   * The bus of the next service on this line: {serviceNo, vehicle, fleet}. With 'random' the vehicle type
   * is dispatched per service (deterministic for the dispatch seed: settings.dispatchSeed, else this
   * session's seed) using the line's share setting; a service keeps its bus for the whole trip.
   */
  nextService(choice = null) {
    const line = String(this.route.line);
    const s = this.settings;
    if (this.serviceCounter == null) this.serviceCounter = 0;
    if (this.sessionSeed == null) this.sessionSeed = Math.floor(Math.random() * 1e6);
    const serviceNo = this.serviceCounter++;
    const fixed = String(s.dispatchSeed ?? '').trim();
    const seed = fixed !== '' && Number.isFinite(Number(fixed)) ? Number(fixed) : this.sessionSeed;
    const ids = lineVehicles(line);
    const share = Number(s[`share${line}`] ?? 0.5);
    const shares = { [ids[0]]: share, [ids[1]]: 1 - share };
    const vehicle = dispatchVehicle(line, serviceNo, seed, choice ?? s[`vehicle${line}`] ?? 'random', shares);
    return { serviceNo, vehicle, fleet: fleetFor(vehicle, serviceNo + seed).fleet, seed };
  }

  /** Remove the current bus and all mode state. */
  clear() {
    if (this.bus) this.bus.dispose();
    this.bus = null;
    if (this.extra) for (const b of this.extra) b.dispose();
    this.extra = [];
    if (this.passengerMode) this.passengerMode.dispose();
    this.passengerMode = null;
    if (this.traffic) this.traffic.reset();
    if (this.peds) this.peds.reset();
    this.hud.hideResult();
  }

  setEnvironment(hour, weather) {
    this.hour = hour;
    this.weather = weather;
    this.sky.set(hour, weather);
    this.world.setNight(this.sky.night);
    this.world.setWet(weather === 'rain' ? 1 : 0);
    if (this.weatherFx) this.weatherFx.set(weather);
  }

  /** Background scene behind the menu: the bus waiting at the SU terminal. */
  startAttract() {
    this.clear();
    this.mode = 'attract';
    this.hud.show(false);
    const sv = this.nextService();
    const bus = (this.bus = createVehicle({ scene: this.scene, world: this.world, route: this.route, dirId: 'A', vehicle: sv.vehicle, fleet: sv.fleet, quality: this.quality, serviceNo: sv.serviceNo }));
    bus.placeAt(this.route.direction('A').stops[0].frontS + 1);
    bus.doors.open(null, 0);
    bus.lights.head = this.sky.night > 0.3;
    this.attractT = 0;
  }

  startDriver(opts) {
    this.clear();
    this.mode = 'driver';
    this.setEnvironment(opts.hour, opts.weather);
    const dirId = opts.dirId || 'A';
    // the bus: the one chosen in the menu, or the one dispatched to this service
    const choice = opts.vehicle && opts.vehicle !== 'random' && lineVehicles(this.route.line).includes(opts.vehicle) ? opts.vehicle : 'random';
    const sv = this.nextService(choice);
    const fleet = choice !== 'random' && opts.fleet && vehicleSpec(sv.vehicle).fleets.some((f) => f.fleet === String(opts.fleet)) ? String(opts.fleet) : sv.fleet;
    const bus = (this.bus = createVehicle({ scene: this.scene, world: this.world, route: this.route, dirId, vehicle: sv.vehicle, fleet, quality: this.quality, player: true, serviceNo: sv.serviceNo }));
    bus.placeAt(bus.dir.stops[0].frontS);
    bus.phys.parkingBrake = true;
    bus.phys.selector = 'N';
    bus.phys.engineOn = false;
    if (bus.isTram) { bus.phys.pantoUp = false; bus.phys.pantoH = 0; }
    bus.doors.open(null, 0);
    bus.lights.head = this.sky.night > 0.3;
    this.wireBus(bus);
    bus.extraColliders = [(b) => (this.traffic ? this.traffic.collideBus(b) : null), (b) => this.collideSmall(b)];
    this.rig.setMode('cab');
    this.hud.tram = !!bus.isTram;
    this.hud.setMode('driver');
    this.hud.show(true);
    this.scoring = new Scoring();
    this.tripStart = null;
    this.trips = 0;
    this.checklistDone = false;
    this.hud.toast(`${t('driver')} · ${this.route.line} → ${bus.dir.headsign} · ${bus.spec.short} #${bus.fleet}`);
    if (this.traffic) this.traffic.setFocusBus(bus);
    if (this.peds) this.peds.attachBus(bus, true);
    this.emit('start', { mode: 'driver' });
  }

  wireBus(bus) {
    bus.doors.on((e) => {
      this.gameAudio.door(bus, e);
      if (bus.player && e.type === 'closeRequest' && this.time - (this.lastCloseToast ?? -9) > 2) this.lastCloseToast = this.time, this.hud.toast(L('Вратите се затварят…', 'Doors closing…'));
    });
    bus.phys.onShift = (gear, dir) => this.gameAudio.shift(bus, gear, dir);
  }

  /** Called each frame with real dt. */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.fpsAcc.fps = this.fpsAcc.n / this.fpsAcc.t;
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
    }
    const inp = this.input.poll(dt);
    if (this.input.hit('Escape') && this.mode !== 'attract') this.emit('pause');
    this.audio.setPaused(this.paused); // silence (and suspend) the sound while the pause menu is up
    if (this.paused) {
      this.input.endFrame();
      return;
    }
    if (this.mode === 'driver') this.updateDriver(dt, inp);
    else if (this.mode === 'passenger') this.passengerMode.update(dt, inp);
    else this.updateAttract(dt);
    this.input.endFrame();
    // shared systems
    const bus = this.bus;
    const listener = this.camera.position;
    this.focus.copy(listener);
    this.world.updateVisibility(this.focus);
    this.world.tick(dt);
    this.sky.follow(this.focus);
    this.sky.tick(dt);
    if (this.traffic) this.traffic.update(dt, this.focus, this.allBuses());
    if (this.peds) this.peds.update(dt, this.focus, this.camera);
    if (this.props) this.props.update(dt, this.focus, this.sky.night);
    if (this.weatherFx) this.weatherFx.update(dt, this.camera, this.bus);
    this.busLights.update(bus, this.sky.night);
    for (const b of this.allBuses()) b.model.setDetail(b.model.front.position.distanceTo(listener));
    if (bus) this.updateAnnouncements(bus);
    this.updateAudio(dt);
  }

  allBuses() {
    return [this.bus, ...(this.extra || [])].filter(Boolean);
  }

  updateAnnouncements(bus) {
    if (this.voiceBusy) return;
    const msg = bus.announcer.pump();
    if (!msg) return;
    if (this.mode === 'driver' || this.mode === 'passenger') bus.model.setInteriorText(msg.kind === 'next' ? 'Следваща спирка:' : 'Спирка:', msg.display);
    const vol = this.audio.zone === 'outside' ? Math.max(0, 0.35 - this.camera.position.distanceTo(bus.model.front.position) / 80) : 1;
    // a passenger waiting down the street cannot hear the bus's interior announcement: no chime, no subtitle
    if (vol < 0.05) { bus.announcer.ended(); return; }
    this.voiceBusy = true;
    this.voice.play(msg, vol, () => {
      bus.announcer.ended();
      this.voiceBusy = false;
    });
  }

  updateAttract(dt) {
    const bus = this.bus;
    if (!bus) return;
    this.attractT += dt;
    bus.update(dt, { throttle: 0, brake: 1, steer: 0 });
    bus.syncVisual();
    const a = this.attractT * 0.06 + 2.2;
    const c = bus.model.front.position;
    const fx = -Math.sin(bus.phys.yaw), fz = -Math.cos(bus.phys.yaw);
    const cx = c.x + fx * 4 + Math.cos(a) * 16, cz = c.z + fz * 4 + Math.sin(a) * 16;
    const want = new THREE.Vector3(cx, c.y + 3.2, cz);
    this.rig.clampToWorld(new THREE.Vector3(c.x, c.y + 2, c.z), want);
    this.camera.position.lerp(want, this.attractT < 0.1 ? 1 : 0.05);
    this.camera.lookAt(c.x + fx * 3, c.y + 1.6, c.z + fz * 3);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.audio.setZone('outside');
  }

  updateDriver(dt, inp) {
    if (this.bus.isTram) return updateTramDriver(this, dt, inp); // rail-bound controls (TramDriving.js)
    const bus = this.bus;
    const p = bus.phys;
    const I = this.input;
    // --- discrete controls
    if (I.hit('KeyI')) {
      p.engineOn = !p.engineOn;
      this.hud.toast(p.engineOn ? L('Двигателят е запален', 'Engine started') : L('Двигателят е изключен', 'Engine off'));
    }
    if (I.hit('Digit1') || I.hit('Numpad1')) this.selectGear('D');
    if (I.hit('Digit2') || I.hit('Numpad2')) this.selectGear('N');
    if (I.hit('Digit3') || I.hit('Numpad3')) this.selectGear('R');
    if (I.hit('KeyP')) {
      p.parkingBrake = !p.parkingBrake; // the brake hiss comes from GameAudio (parking brake edge)
    }
    if (I.hit('KeyO')) this.openDoors(null);
    if (I.hit('KeyF')) this.openDoors([1]);
    if (I.hit('KeyC')) bus.doors.close();
    if (I.hit('KeyQ')) { bus.lights.left = !bus.lights.left; bus.lights.right = false; }
    if (I.hit('KeyE')) { bus.lights.right = !bus.lights.right; bus.lights.left = false; }
    if (I.hit('KeyH')) bus.lights.hazard = !bus.lights.hazard;
    if (I.hit('KeyL')) bus.lights.head = !bus.lights.head;
    if (I.hit('KeyY')) bus.wiper.mode = (bus.wiper.mode + 1) % 3;
    if (I.hit('KeyK')) {
      p.autoKneel = p.autoKneel === false;
      this.hud.toast(`${t('kneeling')}: ${p.autoKneel ? t('on') : t('off')}`);
    }
    if (I.hit('KeyT')) {
      const modes = ['route', 'depot', 'off'];
      bus.display.mode = modes[(modes.indexOf(bus.display.mode) + 1) % 3];
      bus.updateSigns();
    }
    if (I.hit('KeyR') && Math.abs(p.v) < 1) this.recover();
    if (I.hit('Tab')) this.hud.toast(`${t('camera')}: ${camName(this.rig.cycle(DRIVER_CAMS))}`);
    this.audio.horn(I.keys.has('Space') || (this.touchHorn || false));
    // cancel indicator after the turn
    if ((bus.lights.left || bus.lights.right) && Math.abs(p.delta) > 0.25) bus._turning = true;
    if (bus._turning && Math.abs(p.delta) < 0.05) { bus.lights.left = bus.lights.right = false; bus._turning = false; }
    // --- continuous
    const controls = { throttle: inp.throttle, brake: inp.brake, steer: inp.steer };
    bus.update(dt, controls);
    bus.syncVisual();
    // --- events
    if (p.lastCollision) {
      // one penalty per contact: a scrape along a pole lasts many frames
      const fresh = this.time - (this.lastContactT ?? -9) > 1.5;
      this.lastContactT = this.time;
      if (fresh && p.lastCollision.speed > 0.6) {
        this.audio.crash(p.lastCollision.speed);
        this.rig.shake = 1;
        this.scoring.add('collision', -Math.round(20 + p.lastCollision.speed * 10), L('Сблъсък!', 'Collision!'));
        this.hud.toast(L('Сблъсък!', 'Collision!'), true);
      }
    }
    for (const e of bus.events.splice(0)) this.onStopEvent(bus, e);
    this.scoring.update(dt, bus, this.world);
    // red light running
    if (this.traffic && bus.signalsAhead) {
      for (const sg of bus.signalsAhead) {
        if (bus.prevFrontS != null && bus.prevFrontS < sg.s && bus.frontS >= sg.s && bus.frontS - bus.prevFrontS < 5) {
          const st = this.traffic.signals.state(sg.node, sg.end);
          if (st === 'R') this.scoring.add('redlight', -30, L('Преминахте на червен светофар!', 'You ran a red light!'));
        }
      }
    }
    bus.prevFrontS = bus.frontS;
    if (bus.kerbHit) { bus.kerbHit = false; this.audio.kerb(); this.rig.shake = 0.6; }
    for (const m of this.scoring.messages.splice(0)) this.hud.toast(m.text, m.bad);
    // --- checklist
    if (!this.checklistDone) {
      const items = [
        { label: L('Запали двигателя', 'Start the engine'), key: 'I', done: p.engineOn },
        { label: L('Затвори вратите', 'Close the doors'), key: 'C', done: bus.doors.allClosed },
        { label: L('Освободи ръчната спирачка', 'Release the parking brake'), key: 'P', done: !p.parkingBrake },
        { label: L('Включи D', 'Select D'), key: '1', done: p.selector === 'D' },
      ];
      this.hud.setChecklist(items);
      if (items.every((i) => i.done)) {
        this.checklistDone = true;
        this.hud.setChecklist(null);
        this.hud.toast(L('Готови за тръгване — приятен път!', 'Ready to go — have a good trip!'));
      }
    }
    // --- camera & HUD
    this.rig.updateBus(dt, bus, inp);
    const inCab = this.rig.mode === 'cab';
    this.audio.setZone(inCab ? 'cab' : 'outside');
    this.hud.cross.classList.remove('show');
    this.updateDriverHud(dt);
    this.updateDashboard(bus);
  }

  cycleCamera() {
    if (this.mode === 'driver') this.hud.toast(`${t('camera')}: ${camName(this.rig.cycle(DRIVER_CAMS))}`);
    else if (this.mode === 'passenger' && this.passengerMode) this.passengerMode.cycleCamera();
  }

  startPassenger(opts) {
    this.clear();
    this.mode = 'passenger';
    this.setEnvironment(opts.hour, opts.weather);
    this.passengerMode = new PassengerMode(this, opts);
    this.hud.setMode('passenger');
    this.hud.show(true);
    this.emit('start', { mode: 'passenger' });
  }

  /** Bus vs small street objects (poles, trunks, shelters, parked cars). */
  collideSmall(b) {
    const grid = this.world.obstacles;
    if (!grid) return null;
    let best = null;
    for (const box of b.boxes()) {
      const c = grid.boxContact(box.cx, box.cz, box.fx, box.fz, box.hl, box.hw);
      if (c && (!best || c.depth > best.depth)) best = c;
    }
    return best;
  }

  selectGear(g) {
    const p = this.bus.phys;
    if (g !== 'N' && Math.abs(p.v) > 0.6 && p.selector !== g && p.selector !== 'N') {
      this.hud.toast(L('Спрете напълно, преди да смените посоката', 'Stop completely before changing direction'), true);
      return;
    }
    if (g === 'R' && Math.abs(p.v) > 0.3) return;
    p.selector = g;
    this.audio.gearSelect(g);
  }

  openDoors(ids) {
    const bus = this.bus;
    if (Math.abs(bus.phys.v) > 0.5) {
      this.hud.toast(L('Блокировка: вратите не се отварят в движение', 'Interlock: doors cannot open while moving'), true);
      return;
    }
    bus.doors.open(ids, bus.phys.v);
    const near = bus.stops.atStop >= 0 || bus.stops.distanceToNext(bus.routeS) < 25;
    if (!near && bus.stops.next > 0) this.scoring.add('doors', -5, L('Врати отворени извън спирка', 'Doors opened away from a stop'));
  }

  /** Put the bus back on the drive line (when stuck). */
  recover() {
    const bus = this.bus;
    bus.placeAt(bus.frontS);
    this.hud.toast(L('Автобусът е върнат на маршрута', 'Bus returned to the route'));
    this.scoring.add('recover', -10);
  }

  onStopEvent(bus, e) {
    const sched = this.route.schedule(bus.dirId);
    if (e.type === 'departed' && e.index === 0 && this.tripStart == null) {
      this.tripStart = this.time;
      this.scoring.tripStart(this.time);
    }
    if (e.type === 'arrived' && this.mode === 'driver' && e.index > 0) { // the trip starts at stop 0
      // front door alignment with the stop pole
      const err = e.error; // + = beyond the target
      const lat = Math.abs(bus.lateral);
      this.scoring.stopAccuracy(err, lat);
      const q = Math.abs(err) < 3 ? L('Отлично спиране!', 'Perfect stop!') : Math.abs(err) < 7 ? L('Добро спиране', 'Good stop') : L('Неточно спиране', 'Imprecise stop');
      this.hud.toast(`${e.stop.name} — ${q}`);
    }
    if (e.type === 'served' && this.tripStart != null) {
      const delay = this.time - this.tripStart - sched[e.index];
      this.scoring.punctuality(delay);
    }
    if (e.type === 'passed' && this.mode === 'driver') {
      const waiting = this.peds ? this.peds.waitingAt(e.stop) : 0;
      if (waiting > 0 || bus.stopRequested) this.scoring.add('skip', -25, L(`Пропусната спирка: ${e.stop.name}`, `Missed stop: ${e.stop.name}`));
    }
    if (e.type === 'served' || e.type === 'passed') bus.stopRequested = false;
    if (e.type === 'terminal' && this.mode === 'driver') {
      this.trips++;
      setTimeout(() => this.showTripResult(), 1500);
    }
    if (this.peds) this.peds.onStopEvent(bus, e);
  }

  showTripResult() {
    const bus = this.bus;
    const r = this.scoring.summary();
    this.hud.showResult(`${t('tripDone')}: ${bus.dir.headsign}`, r.rows, () => {
      const nd = this.route.other(bus.dirId);
      bus.setDirection(nd);
      bus.updateSigns();
      this.scoring.reset();
      this.tripStart = null;
      this.hud.toast(`${this.route.line} → ${bus.dir.headsign}`);
    }, () => this.emit('menu'));
  }

  updateDriverHud(dt) {
    const bus = this.bus;
    const p = bus.phys;
    const next = bus.stops.nextStop;
    const sched = this.route.schedule(bus.dirId);
    let delay = null;
    if (this.tripStart != null && next) {
      // projected delay at the next stop
      const remaining = Math.max(0, next.frontS - bus.routeS) / 7;
      delay = this.time - this.tripStart + remaining - sched[next.index];
    }
    this.hud.update(dt, {
      headsign: bus.dir.headsign,
      nextStop: next ? next.name : bus.dir.headsign, request: !!(next && next.request),
      atStop: bus.stops.atStop >= 0,
      dist: next ? next.frontS - bus.routeS : null,
      delay,
      stopRequested: bus.stopRequested,
      speed: p.speedKmh,
      selector: p.selector,
      gear: p.gear,
      gearText: bus.isTram ? (p.emergency ? 'EB' : p.notch > 0 ? `P${p.notch}` : p.notch < 0 ? `B${-p.notch}` : 'D0') : null,
      limit: bus.isTram ? Math.round(bus.limit.v * 3.6) : null,
      doors: bus.doors.doors.map((d) => d.state),
      indL: (bus.lights.left || bus.lights.hazard) && bus.indicatorOn,
      indR: (bus.lights.right || bus.lights.hazard) && bus.indicatorOn,
      parking: p.parkingBrake,
      stopBrake: p.stopBrake,
      head: bus.lights.head,
      fps: this.settings.showFps ? this.fpsAcc.fps : null,
      quality: this.quality,
    });
    this.mapTimer = (this.mapTimer || 0) - dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.hud.drawMap(this.route, bus.dirId, { x: p.x, z: p.z, yaw: p.yaw }, bus.stops.next);
    }
  }

  /** Instrument cluster canvas (speedometer, tachometer, warnings). */
  updateDashboard(bus) {
    this.dashTimer = (this.dashTimer || 0) + 1;
    if (this.dashTimer % 4) return;
    const m = bus.model;
    const c = m.dashCanvas, g = c.getContext('2d');
    const p = bus.phys;
    // a vehicle with its own instrument cluster draws it (models/README.md: drawDash)
    if (m.drawDash) {
      m.drawDash(g, {
        w: c.width, h: c.height, speedKmh: p.speedKmh, rpm: p.rpm, maxRpm: p.maxRpm, selector: p.selector, gear: p.gear,
        parking: p.parkingBrake, stopBrake: p.stopBrake, doorsOpen: bus.doors.anyOpen, head: bus.lights.head,
        indL: bus.indicatorOn && (bus.lights.left || bus.lights.hazard), indR: bus.indicatorOn && (bus.lights.right || bus.lights.hazard),
        engineOn: p.engineOn, pressure: this.audio.pressure || 9, retarder: p.selector === 'D' && Math.abs(p.v) > 1.5 && p.brakeOut > 0.02,
        kneel: p.kneel, time: this.time, hour: this.hour,
      });
      m.dashTex.needsUpdate = true;
      return;
    }
    g.fillStyle = '#060708';
    g.fillRect(0, 0, 512, 256);
    const dial = (cx, val, max, label, ticks) => {
      g.strokeStyle = '#2a2f33';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(cx, 140, 95, Math.PI * 0.75, Math.PI * 2.25);
      g.stroke();
      g.strokeStyle = '#d9dde0';
      g.lineWidth = 2;
      for (let i = 0; i <= ticks; i++) {
        const a = Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 82, 140 + Math.sin(a) * 82);
        g.lineTo(cx + Math.cos(a) * 95, 140 + Math.sin(a) * 95);
        g.stroke();
      }
      const a = Math.PI * 0.75 + clamp(val / max, 0, 1) * Math.PI * 1.5;
      g.strokeStyle = '#ff5a1f';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, 140);
      g.lineTo(cx + Math.cos(a) * 85, 140 + Math.sin(a) * 85);
      g.stroke();
      g.fillStyle = '#9aa3a8';
      g.font = '16px Arial';
      g.textAlign = 'center';
      g.fillText(label, cx, 210);
    };
    dial(110, p.speedKmh, 100, 'km/h', 10);
    dial(402, p.rpm, 2800, 'x1000 min⁻¹', 14);
    g.fillStyle = '#e8eef2';
    g.font = 'bold 42px Arial';
    g.textAlign = 'center';
    g.fillText(String(Math.round(p.speedKmh)), 256, 120);
    g.font = 'bold 26px Arial';
    g.fillStyle = p.selector === 'R' ? '#ff5a4a' : '#7fe08f';
    g.fillText(p.selector === 'D' ? `D${p.gear}` : p.selector, 256, 160);
    // telltales
    const tell = [
      [p.parkingBrake, '#ff3b30', 'P'], [p.stopBrake, '#ffb020', 'H'], [bus.doors.anyOpen, '#ffb020', '⇔'],
      [bus.lights.head, '#2d8cff', '◐'], [bus.indicatorOn && (bus.lights.left || bus.lights.hazard), '#2fd15a', '◀'],
      [bus.indicatorOn && (bus.lights.right || bus.lights.hazard), '#2fd15a', '▶'], [!p.engineOn, '#ff3b30', '⚠'],
    ];
    g.font = 'bold 18px Arial';
    tell.forEach(([on, col, s], i) => {
      g.fillStyle = on ? col : '#1d2124';
      g.fillText(s, 186 + i * 23, 205);
    });
    g.fillStyle = '#9aa3a8';
    g.font = '14px Arial';
    g.fillText(`${(this.audio.pressure || 9).toFixed(1)} bar`, 256, 236);
    m.dashTex.needsUpdate = true;
  }

  updateAudio(dt) {
    this.gameAudio.update(dt);
  }

  render() {
    this.renderer.setInterior(this.cameraInBus());
    this.renderer.render();
  }

  /** True while the camera is inside the saloon or cab of the driven / ridden bus (or another one nearby). */
  cameraInBus() {
    const c = this.camera.position;
    const p = this._camLocal || (this._camLocal = new THREE.Vector3());
    for (const b of [this.bus, ...(this.extra || [])]) {
      const m = b && b.model;
      if (!m || !m.interiorGroups) continue;
      if (!m._cabinBoxes) {
        // section-frame bounds of each interior group (computed once per bus)
        m._cabinBoxes = m.interiorGroups.map((g) => {
          const box = new THREE.Box3();
          g.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); } });
          return { g, box };
        });
      }
      for (const { g, box } of m._cabinBoxes) {
        p.copy(c);
        g.parent.worldToLocal(p);
        if (Math.abs(p.x) < 1.27 && p.y > box.min.y && p.y < box.max.y + 0.2 && p.z > box.min.z && p.z < box.max.z) return true;
      }
    }
    return false;
  }
}

export { fwdX, fwdZ };
