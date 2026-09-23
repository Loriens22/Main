import * as THREE from 'three';
import { Engine } from './engine.js';
import { buildRoute } from './route.js';
import { initWorldMaterials, WM } from './world/materials.js';
import { ChunkBatch, OccGrid } from './world/common.js';
import { buildRoads, intersectionMarkings } from './world/roads.js';
import { buildCatenary } from './world/catenary.js';
import { layoutWorld } from './world/layout.js';
import { buildTerrain } from './world/terrain.js';
import { makeTreeKinds, buildTrees } from './world/vegetation.js';
import { intersectionSignals } from './world/props.js';
import { SIGNS } from './world/signatlas.js';
import { TrafficLights } from './sim/signals.js';
import { CarFleet, Traffic, CAR_COLORS } from './sim/cars.js';
import { Humans } from './sim/humans.js';
import { People } from './sim/people.js';
import { buildTrolleybus, B } from './bus/model.js';
import { Bus } from './sim/bus.js';
import { Informator } from './sim/informator.js';
import { Audio } from './audio.js';
import { CameraRig, Mirrors, MODE_NAMES } from './camera.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { nextFrame, makeRng, clamp, wrapAngle } from './util.js';
import * as TX from './textures.js';
import { QUALITY } from './engine.js';

export class Game {
  constructor() { this.fps = 60; this.time = 0; this.mode = 'walk'; }

  async init(progress) {
    const step = async (p, txt) => { progress(p, txt); await nextFrame(); };
    await step(0.02, 'Графичен двигател…');
    this.engine = new Engine(document.getElementById('c'));
    const scene = this.scene = this.engine.scene;
    this.audio = new Audio();

    await step(0.06, 'Маршрут на линия 9…');
    const route = this.route = buildRoute();

    await step(0.1, 'Текстури (асфалт, фасади, растителност)…');
    initWorldMaterials();

    await step(0.25, 'Улици, тротоари, маркировка…');
    const occ = this.occ = new OccGrid(-900, -3500, 1900, 900, 2);
    const cb = this.cb = new ChunkBatch(420);
    this.roadsInfo = buildRoads(route, cb, occ);
    intersectionMarkings(route, cb);

    await step(0.33, 'Контактна мрежа…');
    this.cat = buildCatenary(route, cb, scene, occ);
    this.tl = new TrafficLights(route);
    for (const it of route.inters) intersectionSignals(cb, route, this.tl, it);

    await step(0.42, 'Сгради, спирки, паркове…');
    const reg = this.reg = { colliders: [], terraces: [], doors: [], benches: [], stopsInfo: [], reserve: [], sellers: [] };
    layoutWorld(route, cb, occ, reg, this.roadsInfo);
    SIGNS.finalize();

    await step(0.6, 'Сглобяване на града…');
    const nChunks = cb.build(scene, 'city');
    buildTerrain(scene, this.engine.fogColor);

    await step(0.68, 'Дървета…');
    this.trees = buildTrees(scene, makeTreeKinds(), reg.trees);

    await step(0.74, 'Тролейбус Škoda 27Tr Solaris №1650…');
    this.rig = buildTrolleybus();
    scene.add(this.rig.front, this.rig.rear);
    this.bus = new Bus(this.rig, route, this.cat, (e, a, b) => this.onBusEvent(e, a, b));
    scene.add(this.bus.sparks.points);
    this.bus.staticColliders = reg.colliders.filter((c) => !c.soft).map((c) => {
      const p = new THREE.Vector3().setFromMatrixPosition(c.M);
      const dir = new THREE.Vector3(1, 0, 0).transformDirection(c.M);
      return { x: p.x, z: p.z, h: Math.atan2(dir.z, dir.x), hd: c.hl, hw: c.hd };
    });

    await step(0.82, 'Автомобили и трафик…');
    this.fleet = new CarFleet(scene);
    const counts = {};
    const parked = reg.parked;
    const rnd = makeRng(31);
    const moverTypes = ['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'small', 'taxi', 'taxi', 'van', 'small'];
    const nMovers = 38;
    const movers = [];
    for (let i = 0; i < nMovers; i++) movers.push(moverTypes[Math.floor(rnd() * moverTypes.length)]);
    for (const p of parked) counts[p.type] = (counts[p.type] || 0) + 1;
    for (const t of movers) counts[t] = (counts[t] || 0) + 1;
    this.fleet.allocate(counts);
    for (const p of parked) { const c = this.fleet.add(p.type, p.color); c.x = p.x; c.z = p.z; c.h = p.h; c.y = p.y || 0; this.fleet.place(c); if (p.special === 'carpet') this.carpetDecal(p); }
    const lanes = route.lanes.filter((l) => l.spawn);
    const movRecs = movers.map((t, i) => {
      const car = this.fleet.add(t, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
      const L = lanes[i % lanes.length];
      let s = rnd() * L.poly.length;
      // keep the Borovo loop area clear at the start
      const o = L.poly.at(s); if (Math.hypot(o.x, o.z) < 90) s = (s + 300) % L.poly.length;
      return { car, lane: L, home: L, s, v: 8 + rnd() * 4, v0: 11 + rnd() * 3.5, active: true, stuck: 0, change: null };
    });
    this.traffic = new Traffic(route, this.fleet, this.tl, movRecs);
    this.fleet.flush(); this.fleet.computeBounds();

    await step(0.9, 'Хора, пътници…');
    this.humans = new Humans(scene, 420);
    this.people = new People(this.humans, route, this.rig);
    this.people.spawn(reg, this.roadsInfo.walkPaths);

    await step(0.95, 'Информатор BT902, звук, управление…');
    this.informator = new Informator(route, this.audio, (m, phase) => this.onSay(m, phase));
    this.camRig = new CameraRig(this.engine.camera, this.bus, this.rig);
    this.camRig.obstacles = this.bus.staticColliders;
    this.mirrors = new Mirrors(this.engine, this.rig, QUALITY[this.engine.quality].mirrors);
    this.player = new Player(this.bus, this.rig, (x, z) => { const v = occ.get(x, z); return v === 2 ? 0.15 : 0; });
    this.ui = new UI(this);
    this.busPts = [];
    this.stats = { t0: 0, violations: 0, collisions: 0, speeding: 0, served: [], announcements: 0, goodAnnouncements: 0, missed: 0, pax: 0, maxJerk: 0, comfortHits: 0 };
    this.reset();
    // warm up shaders
    this.engine.renderer.compile(scene, this.engine.camera);
    await step(1, `Готово · ${nChunks} групи геометрия`);
    this.ready = true;
    window.__ready = true;
  }

  carpetDecal(p) {
    const tex = TX.signText(['ПРАНЕ НА', 'КИЛИМИ'], { w: 512, h: 256, bg: '#ffffff', fg: '#222', weight: 800 });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(2.6, 1.3); g.rotateY(s > 0 ? 0 : Math.PI);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(-0.4, 1.55 + (p.y || 0), s * 1.035);
      const grp = new THREE.Group(); grp.position.set(p.x, 0, p.z); grp.rotation.y = -p.h; grp.add(mesh);
      this.scene.add(grp);
    }
  }

  reset() {
    this.bus.placeOnRoute(0);
    this.bus.gear = 'N'; this.bus.park = true; this.bus.passengers = 0;
    for (let i = 0; i < this.rig.doors.length; i++) { const d = this.rig.doors[i]; d.target = 1; d.open = 1; d.pending = 0; }
    this.nextStop = 0; this.atStop = 0; this.served = new Set(); this.stopArrivedAt = 0;
    this.prevSFront = 0; this.projHint = -1;
    this.stats.t0 = this.time;
    this.finished = false;
    this.informator.state = 'off'; this.informator.idx = 0; this.informator.history.length = 0;
    // start on foot on the Borovo platform, looking at door 1
    this.rig.front.updateMatrixWorld(true);
    const w = new THREE.Vector3(B.hw + 3.2, 0, -7.4).applyMatrix4(this.rig.frontBody.matrixWorld);
    this.player.placeWorld(w.x, w.z);
    const doorW = new THREE.Vector3(B.hw, 0, -7.6).applyMatrix4(this.rig.frontBody.matrixWorld);
    this.camRig.look.yaw = Math.atan2(-(doorW.x - w.x), -(doorW.z - w.z)); this.camRig.look.pitch = -0.05;
    this.enterWalk(true);
  }
  restart() {
    this.people.resetPax();
    // re-seed waiting passengers by respawning waiters is complex; re-use remaining ones
    this.reset();
    this.ui.toast('Нов курс — линия 9, ж.к. Борово');
  }
  recover() {
    const pr = this.route.project(this.bus.x, this.bus.z);
    this.bus.placeOnRoute(Math.max(0, pr.s + 10));
    this.ui.toast('Тролейбусът е върнат на линията');
  }

  enterWalk(silent) {
    this.mode = 'walk';
    this.camRig.setMode('walk');
    if (!silent) {
      this.rig.front.updateMatrixWorld(true);
      // step out of the cab into the aisle
      this.player.inside = 'front'; this.player.pos.set(-0.05, 0, -6.6); this.player.y = B.yFloor;
      this.camRig.look.yaw = new THREE.Euler().setFromQuaternion(this.rig.frontBody.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y + Math.PI;
    }
    this.ui.showMode('walk');
    this.bus.throttle = 0; this.bus.brake = 0;
  }
  enterDriving() {
    this.mode = 'drive';
    this.camRig.setMode('cab');
    this.ui.showMode('drive');
    this.ui.prompt(null);
    if (this.informator.state === 'off') { this.informator.powerOn(); this.ui.toast('Информатор BT902 — избор на маршрут: линия 9'); }
  }
  cycleCamera() {
    if (this.mode === 'walk') return;
    const order = ['cab', 'chase', 'interior', 'cinema'];
    const i = order.indexOf(this.camRig.mode);
    this.camRig.setMode(order[(i + 1) % order.length]);
    this.ui.toast(MODE_NAMES[this.camRig.mode]);
  }
  setGear(g) {
    if (Math.abs(this.bus.v) > 0.5 && ((g === 'R' && this.bus.v > 0) || (g === 'D' && this.bus.v < 0))) { this.ui.toast('Спрете преди смяна на посоката', 'bad'); return; }
    this.bus.gear = g; this.audio.tone(g === 'R' ? 900 : 1300, 0.08, 'square', 0.04);
  }
  togglePark() {
    this.bus.park = !this.bus.park;
    this.audio.airHiss();
    if (!this.bus.park && this.bus.gear === 'N') this.ui.toast('Ръчната спирачка е освободена — включете D');
  }
  informatorKey(k) {
    if (k === 2) this.announce(); else this.informator.press(k);
  }
  announce() {
    const inf = this.informator;
    const expected = this.expectedAnnouncement();
    const idxBefore = inf.idx;
    inf.announce();
    this.stats.announcements++;
    if (idxBefore < inf.seq.length && idxBefore === expected) this.stats.goodAnnouncements++;
  }
  /** Which message index should be played next given the trip state. */
  expectedAnnouncement() {
    if (this.nextStop === 0) return 0;               // at Borovo
    if (this.nextStop === 1) return 1;               // heading to DCC 20
    if (this.nextStop === 2) return this.atStopIdx() === 2 ? 3 : 2;
    return 3;
  }
  atStopIdx() { return this.atStop; }
  onSay(m, phase) {
    if (phase === 'chime') this.ui.subtitle('🔔 ' + m.text);
    if (phase === 'novoice') this.ui.toast('Няма инсталиран български глас (TTS) — показан е текст', 'bad');
    if (m.kind === 'next') this.rig.displays.setInterior('Следваща спирка: ' + this.route.stops[m.stop].name);
    else if (m.kind === 'stop') this.rig.displays.setInterior('Спирка: ' + this.route.stops[m.stop].name);
  }
  onBusEvent(e, a, b) {
    const au = this.audio;
    switch (e) {
      case 'doorOpen': au.doorOpen(); break;
      case 'doorWarn': au.doorWarn(); break;
      case 'doorClose': au.doorClose(); break;
      case 'tick': au.tick(a); break;
      case 'dewire': au.sparks(); au.clunk(); this.ui.toast('Щангите изскочиха от мрежата! Спрете и ги вдигнете (ЩАНГИ)', 'bad'); this.stats.dewires = (this.stats.dewires || 0) + 1; break;
      case 'rewired': au.clunk(); this.ui.toast('Щангите са на мрежата', 'good'); break;
      case 'raising': au.airHiss(); break;
      case 'collision': au.clunk(); au.noiseBurst(0.4, 300, 0.7, 0.6); this.stats.collisions++; this.ui.toast('Сблъсък!', 'bad'); break;
      case 'beep': au.doorWarn(); break;
      case 'msg': this.ui.toast(a, b); break;
    }
  }

  /** Simulation-only frame for the debug autopilot (inputs set externally, no rendering). */
  frameSim(dt) {
    this.time += dt;
    const bus = this.bus;
    const n = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < n; i++) bus.update(dt / n, this.traffic);
    this.tl.update(dt, this.time);
    bus.samplePts(this.busPts);
    this.traffic.update(dt, this.busPts, this.engine.camera.position, this.people.pedPts);
    this.tripLogic(dt);
    this.rig.front.updateMatrixWorld(true); this.rig.rear.updateMatrixWorld(true);
    this.people.update(dt, this.engine.camera.position, bus, {}, null);
    this.informator.update(dt, {});
  }
  /* ============================== frame ============================== */
  frame(dt) {
    if (!this.ready) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const bus = this.bus;
    // ---------- input ----------
    if (this.mode === 'drive') {
      const inp = this.ui.readDrive(dt, bus);
      bus.throttle = inp.throttle; bus.brake = inp.brake; bus.steerCmd = clamp(inp.steer, -1, 1);
    } else {
      bus.throttle = 0; bus.brake = 0.4;
      const w = this.ui.readWalk();
      this.player.update(dt, w, this.camRig.look.yaw);
      const cab = this.player.inCab();
      document.getElementById('actBtn').classList.toggle('hidden', !cab);
      this.ui.prompt(cab ? null : (this.player.inside ? null : 'Влезте през предната врата и седнете в кабината'));
    }
    // ---------- simulation (fixed substeps) ----------
    const n = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < n; i++) bus.update(dt / n, this.traffic);
    this.tl.update(dt, this.time);
    bus.samplePts(this.busPts);
    const cam = this.engine.camera.position;
    this.traffic.update(dt, this.busPts, cam, this.people.pedPts);
    this.tripLogic(dt);
    this.rig.front.updateMatrixWorld(true); this.rig.rear.updateMatrixWorld(true);
    this.people.update(dt, cam, bus, { stopAt: this.atStop >= 0 ? this.route.stops[this.atStop]?.id : null }, this.engine.camera);
    this.humans.flush();
    this.rig.displays.tick(this.time);
    // ---------- informator ----------
    const now = new Date();
    const clock = now.toTimeString().slice(0, 8);
    const infoLCD = { dist: this.distToNext, clock, pax: this.people.onBoard(), fault: !bus.power };
    this.informator.update(dt, infoLCD);
    const lines = this.informator.lines(infoLCD);
    this.rig.informator.set(lines, this.informator.leds);
    // ---------- camera ----------
    this.camRig.update(dt, this.player);
    const cm = this.camRig.mode;
    if (cm === 'chase' || cm === 'cinema') this.trees.clearView(this.camRig.smoothTarget, this.engine.camera.position);
    else if (this.treesCleared !== false) this.trees.clearView(null);
    this.treesCleared = cm === 'chase' || cm === 'cinema';
    this.engine.followShadow(this.mode === 'walk' ? this.engine.camera.position.clone() : new THREE.Vector3(bus.hx, 0, bus.hz));
    this.engine.sky.material.uniforms.time.value = this.time;
    const cp = this.engine.camera.position;
    this.treeT = (this.treeT || 0) - dt;
    // refresh LOD/chunk visibility periodically, and immediately after a teleport (reset, recover)
    if (this.treeT <= 0 || !this.lastCull || (cp.x - this.lastCull.x) ** 2 + (cp.z - this.lastCull.z) ** 2 > 900) {
      this.treeT = 0.4; (this.lastCull ||= new THREE.Vector3()).copy(cp);
      this.trees.update(cp); this.cb.cull(cp, this.drawDist || 1250);
    }
    // ---------- audio ----------
    this.audio.update(dt, { v: bus.v, throttle: bus.throttle, brake: bus.brake, power: bus.power, inCab: this.mode === 'walk' ? !!this.player.inside : this.camRig.mode === 'cab' || this.camRig.mode === 'interior', nearTraffic: this.nearTraffic() });
    this.fleet.render(this.engine.camera, this.mode === 'walk' ? cam : { x: bus.hx, z: bus.hz });
    // ---------- render ----------
    if (this.mode === 'drive' && this.camRig.mode === 'cab') this.mirrors.render(this.scene);
    this.engine.render();
    this.engine.adapt(dt);
    // ---------- HUD ----------
    const st = this.route.stops[Math.min(this.nextStop, this.route.stops.length - 1)];
    this.ui.update(dt, {
      v: bus.v, gear: bus.gear, park: bus.park, doors: bus.doorsOpen(), power: bus.power, canRaise: bus.canRaisePoles(), ind: bus.indicator, hazard: bus.hazard, kneel: bus.kneelCmd,
      doorStates: this.rig.doors.map((d) => d.open), throttle: bus.throttle, brake: bus.brake,
      atStop: this.atStop >= 0, nextName: this.finished ? 'Край на курса' : (this.atStop >= 0 ? this.route.stops[this.atStop].name : st.name), dist: this.distToNext || 0,
      lcd: lines, leds: this.informator.leds, announceHint: this.mode === 'drive' && this.informator.idx < this.expectedAnnouncement() + (this.shouldAnnounceNow() ? 1 : 0) && this.shouldAnnounceNow(),
      heading: bus.h, x: bus.x, z: bus.z, streets: this.route.streets, routePts: this.routePtsMini || (this.routePtsMini = this.route.bus.pts.filter((_, i) => i % 4 === 0)),
      inters: this.route.inters.map((it) => ({ x: it.x, z: it.z, col: this.tl.state(it, 'A').c === 'G' ? '#3f3' : '#f33' })),
      stopPts: this.route.stops.map((s, i) => { const p = this.route.pose(s.s); return { x: p.x, z: p.z, next: i === this.nextStop }; }),
    });
  }
  shouldAnnounceNow() {
    // blink the informator button when an announcement is due
    const inf = this.informator;
    const exp = this.expectedAnnouncement();
    if (inf.idx > exp) return false;
    if (this.atStop === 0) return true;                            // at the terminus
    if (this.nextStop >= 1 && this.atStop < 0 && this.distToNext < 1900 && inf.idx <= exp) return true;
    if (this.atStop === 2 && inf.idx <= 3) return true;
    return false;
  }
  nearTraffic() {
    let s = 0; const b = this.bus;
    for (const c of this.traffic.cars) { if (!c.active) continue; const d = Math.hypot(c.car.x - b.x, c.car.z - b.z); if (d < 60) s += (1 - d / 60) * Math.min(1, c.v / 10); }
    return s * 0.35;
  }
  /* ============================== trip logic ============================== */
  tripLogic(dt) {
    const bus = this.bus, route = this.route;
    const fb = bus.frontBumper();
    const pr = route.bus.project(fb.x, fb.z, this.projHint, 80);
    this.projHint = pr.i;
    const sF = pr.s - route.busOffset;
    const lat = pr.lat;
    const stops = route.stops;
    // stop state
    let at = -1;
    for (let i = 0; i < stops.length; i++) {
      const d = stops[i].s - sF;
      if (d > -7 && d < 14 && Math.abs(lat) < 3.2 && Math.abs(bus.v) < 0.4) at = i;
    }
    if (at !== this.atStop) {
      if (at >= 0 && at === this.nextStop) { this.stopArrivedAt = this.time; this.ui.toast(`Спирка ${stops[at].name} — отворете вратите`, 'good'); }
      this.atStop = at;
    }
    if (this.atStop >= 0 && bus.doorsOpen()) {
      const open = this.rig.doors.map((d, i) => (d.open > 0.95 ? i : -1)).filter((i) => i >= 0);
      if (open.length) this.people.serviceStop(stops[this.atStop].id, open, bus);
      if (this.atStop === this.nextStop && !this.served.has(this.atStop)) {
        this.served.add(this.atStop);
        this.stats.served.push({ stop: stops[this.atStop].name, err: +(stops[this.atStop].s - sF).toFixed(1) });
      }
    }
    // doors must stay open while passengers use them
    for (const d of this.rig.doors) if (d.blocked && d.target === 0 && d.pending > 0) { d.target = 1; d.pending = 0; this.ui.toast('Пътник на вратата!', 'bad'); }
    bus.passengers = this.people.onBoard();
    // departure / passing a stop
    const cur = stops[this.nextStop];
    if (cur && sF - cur.s > 16) {
      if (!this.served.has(this.nextStop) && this.nextStop > 0) { this.stats.missed++; this.ui.toast(`Пропуснахте спирка ${cur.name}!`, 'bad'); }
      this.nextStop++;
      if (this.nextStop < stops.length) this.ui.toast(`Следваща спирка: ${stops[this.nextStop].name}`);
    }
    this.distToNext = this.nextStop < stops.length ? Math.max(0, stops[this.nextStop].s - sF) : 0;
    // end of the modelled section
    if (!this.finished && this.served.has(2) && this.atStop === 2 && !bus.doorsOpen() && !this.people.busy()) {
      this.finished = true;
      setTimeout(() => this.showEnd(), 1500);
    }
    // red lights
    for (const sl of route.stopLines) {
      if (this.prevSFront < sl.s && sF >= sl.s && bus.v > 0.5) {
        const st = this.tl.state(sl.inter, sl.group);
        if (st.c === 'R') { this.stats.violations++; this.ui.toast('Преминахте на червен сигнал!', 'bad'); this.audio.tone(300, 0.4, 'square', 0.08); }
      }
      // public transport priority request
      const d = sl.s - sF;
      if (d > 0 && d < 110) this.tl.requestPriority(sl.inter, sl.group);
    }
    this.prevSFront = sF;
    // speeding
    const kmh = Math.abs(bus.v) * 3.6;
    this.speedWarnT = (this.speedWarnT || 0) - dt;
    if (kmh > 52 && this.speedWarnT <= 0) { this.speedWarnT = 6; this.stats.speeding++; this.ui.toast('Превишена скорост (50 км/ч)', 'bad'); }
    if (bus.jerk > 9 && bus.passengers > 0) { this.jerkT = (this.jerkT || 0) - dt; if (this.jerkT <= 0) { this.stats.comfortHits++; this.jerkT = 4; } }
    this.sFront = sF; this.latFront = lat;
  }
  showEnd() {
    const s = this.stats;
    const t = this.time - s.t0;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const served = s.served.map((x) => `${x.stop} <small>(${x.err >= 0 ? '−' : '+'}${Math.abs(x.err).toFixed(1)} м)</small>`).join(', ');
    let score = 100 - s.violations * 15 - s.collisions * 20 - s.missed * 20 - s.speeding * 5 - (s.dewires || 0) * 5 - s.comfortHits * 3;
    score += Math.min(10, s.goodAnnouncements * 3);
    score = clamp(Math.round(score), 0, 100);
    document.getElementById('endStats').innerHTML = `
      Време за курса: <b>${mm} мин ${ss} с</b><br>
      Обслужени спирки: ${served || '—'}<br>
      Пътници в тролейбуса: <b>${this.people.onBoard()}</b><br>
      Съобщения на информатора: <b>${s.goodAnnouncements}</b> навреме / ${s.announcements} общо<br>
      Червени сигнали: <b>${s.violations}</b> · Сблъсъци: <b>${s.collisions}</b> · Превишаване: <b>${s.speeding}</b> · Изскочили щанги: <b>${s.dewires || 0}</b><br>
      Комфорт (резки маневри): <b>${s.comfortHits}</b><br>
      <div style="font-size:26px;margin-top:8px">Оценка: <b>${score}/100</b></div>`;
    document.getElementById('endPanel').classList.remove('hidden');
  }
  setQuality(q) {
    this.engine.setQuality(q);
    this.mirrors.resize(QUALITY[q].mirrors);
  }
  /** Tap on the 3D informator in the cab. */
  tapWorld(e) {
    if (this.mode !== 'drive' || this.camRig.mode !== 'cab') return;
    const ray = new THREE.Raycaster();
    const m = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(m, this.engine.camera);
    const hit = ray.intersectObject(this.rig.informatorMesh, false)[0];
    if (hit) this.announce();
  }
}
export { wrapAngle, WM };
