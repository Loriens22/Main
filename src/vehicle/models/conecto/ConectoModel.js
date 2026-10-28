// Procedural 3D model of the Mercedes-Benz O 345 G Conecto G articulated bus (older generation, orange
// fleet of Sofia, line 280), rebuilt from the reference photos ref01..ref05_conecto.jpg.
// Exterior: ConectoFront.js (face, windscreen, lamps, mirrors, wipers), ConectoBody.js (sides, glazing,
// roof, portals), ConectoRear.js, ConectoRunning.js (wheels, doors, deforming bellows).
// Interior: ConectoInterior.js (saloon, seats, poles), ConectoCab.js (driver's cab, instrument cluster).
// Frames: x right, y up, z backwards; front section origin = middle axle, rear section origin = rear axle.
import * as THREE from 'three';
import { disposeModel } from '../../BusKit.js';
import { glassMaterial, occludeInterior } from '../../Glass.js';
import { LedSign } from '../../LedSign.js';
import { bakeStatic } from '../../BusBake.js';
import { frames } from '../../frames.js';
import { Parts } from './geom.js';
import { makePlate, makeHeadCluster, makeDecals, makeVent, makeMoquette, makeFloor, makeCeiling, makeTurntable, makeValidator, makeDashGrain } from './ConectoTextures.js';
import { FrontMixin } from './ConectoFront.js';
import { BodyMixin } from './ConectoBody.js';
import { RearMixin } from './ConectoRear.js';
import { RunningMixin } from './ConectoRunning.js';
import { InteriorMixin } from './ConectoInterior.js';
import { CabMixin } from './ConectoCab.js';

// meshes that never need to cast shadows (thin decals, glass, lamps, small trim)
const NO_SHADOW = new Set(['decals', 'plate', 'chrome', 'satinChrome', 'headlamp', 'lensClear', 'marker', 'indicatorL', 'indicatorR', 'tail', 'brake', 'reverse', 'mirror', 'vent', 'windscreen', 'windscreenIn', 'glassOut', 'glassIn', 'ledBack']);
// small trim that is invisible beyond ~140 m
const SMALL_TRIM = new Set(['decals', 'plate', 'lensClear', 'vent', 'satinChrome', 'chrome', 'mirror']);

export class ConectoModel {
  constructor(spec, { fleet = '3314', quality = 'high', interior = true } = {}) {
    this.spec = spec;
    this.D = spec.dims;
    this.F = frames(spec);
    this.fleet = String(fleet);
    this.plate = (spec.fleets.find((f) => f.fleet === this.fleet) || spec.fleets[0]).plate;
    this.quality = quality;
    this.lite = quality === 'low' || quality === 'balanced';
    this.look = spec.look;
    this.root = new THREE.Group();
    this.root.name = `Mercedes-Benz Conecto G #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'frontSection';
    this.rear = new THREE.Group();
    this.rear.name = 'rearSection';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.wheels = [];
    this.signs = {};
    this.wiperAngle = 0;
    this.makeMaterials();
    this.buildFront();
    this.buildRear();
    this.buildBellows();
    if (interior) {
      this.buildInterior();
      this.buildCab();
    }
    this.buildSigns();
    this.bakeStats = bakeStatic(this.root, new Set([...Object.values(this.lightMats), this.mats.stopBtn, this.mats.lightStrip]));
    for (const g of this.interiorGroups || []) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    occludeInterior(this);
  }

  makeMaterials() {
    const L = this.look;
    const S = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
    // twenty-year-old paint: a softer, weaker gloss than the new buses (the photos show saturated orange even at grazing angles)
    const lacquer = { roughness: 0.42, metalness: 0.02, clearcoat: 0.35, clearcoatRoughness: 0.24 };
    const [hlMap, hlEmi] = makeHeadCluster(false);
    const dec = makeDecals(this.fleet);
    this.decalRects = dec.rects;
    const moqPad = makeMoquette('pad'), moqCush = makeMoquette('cushion');
    const floorTex = makeFloor();
    const ceil = makeCeiling();
    const tt = makeTurntable();
    const vent = makeVent();
    const val = makeValidator();
    const grain = makeDashGrain();
    this.mats = {
      paint: new P({ color: L.body, ...lacquer }),
      roof: new P({ color: L.roof, roughness: 0.38, metalness: 0.02, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
      black: new P({ color: 0x0a0c0e, roughness: 0.34, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 0.4, side: THREE.DoubleSide }),
      matteBlack: new S({ color: 0x16181b, roughness: 0.8, metalness: 0 }),
      satin: new S({ color: 0x17191c, roughness: 0.5, metalness: 0.1 }),
      strip: new S({ color: 0x3a3c3e, roughness: 0.55, metalness: 0.1 }),
      underbody: new S({ color: 0x0e0e0e, roughness: 0.95, side: THREE.DoubleSide }),
      rubber: new S({ color: 0x161616, roughness: 0.92 }),
      tyre: new S({ color: 0x0c0d0d, roughness: 0.9, side: THREE.DoubleSide }),
      rim: new S({ color: 0xb7bbbd, roughness: 0.42, metalness: 0.75 }),
      hub: new S({ color: 0x8d9194, roughness: 0.4, metalness: 0.8 }),
      chrome: new S({ color: 0xd5d9dc, roughness: 0.12, metalness: 1 }),
      satinChrome: new S({ color: 0xb9bcbe, roughness: 0.35, metalness: 1 }),
      steel: new S({ color: 0xc6c9cb, roughness: 0.3, metalness: 0.9 }),
      glass: glassMaterial({ color: 0x0f181c, transmit: 0.5, side: THREE.DoubleSide }),
      glassOut: glassMaterial({ color: 0x050607, transmit: 0.32, side: THREE.FrontSide }),
      glassIn: glassMaterial({ color: 0x0f181c, transmit: 0.62, side: THREE.BackSide, env: 0.2 }),
      windscreen: glassMaterial({ color: 0x080b0f, transmit: 0.55, side: THREE.FrontSide }),
      windscreenIn: glassMaterial({ color: 0x0f181c, transmit: 0.85, side: THREE.BackSide, env: 0.2 }),
      lensClear: new P({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, envMapIntensity: 1.4 }),
      headlamp: new S({ map: hlMap, emissiveMap: hlEmi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3, metalness: 0.3 }),
      indicatorL: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.6 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xd9a21e, roughness: 0.4, emissive: 0xff9a10, emissiveIntensity: 0.15 }),
      plate: new S({ map: makePlate(this.plate), roughness: 0.5 }),
      decals: new S({ map: dec.texture, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      vent: new S({ map: vent, roughness: 0.6, metalness: 0.2 }),
      mirror: new S({ color: 0x59626a, roughness: 0.1, metalness: 1 }),
      yellow: new S({ color: 0xd8b02a, roughness: 0.35, metalness: 0.2 }),
      plastic: new S({ color: 0x2a2d30, roughness: 0.55 }),
      stopBtn: new S({ color: 0xc8102e, roughness: 0.4, emissive: 0xff1010, emissiveIntensity: 0 }),
      bellows: new S({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }),
      bellowsPlate: new S({ color: 0x8e9194, roughness: 0.5, metalness: 0.3 }),
      turntable: new S({ map: tt, color: 0xffffff, roughness: 0.5, metalness: 0.4 }),
      ledBack: new S({ color: 0x050505, roughness: 0.6 }),
      // ------------------------------------------------ interior
      floor: new S({ map: floorTex, color: 0xffffff, roughness: 0.9 }),
      wall: new S({ color: 0xb4bab8, roughness: 0.6 }),
      wallDark: new S({ color: 0x6f7472, roughness: 0.7 }),
      frame: new S({ color: 0x15171a, roughness: 0.6 }),
      ceiling: new S({ map: ceil, color: 0xffffff, roughness: 0.85, emissive: 0xc9c6bb, emissiveIntensity: 0.1 }),
      lightStrip: new S({ color: 0xf4f0e2, emissive: 0xfff2d4, emissiveIntensity: 1.0, roughness: 0.5 }),
      seat: new S({ color: 0x7c8185, roughness: 0.45, envMapIntensity: 0.5 }), // ref04: grey shells
      seatDark: new S({ color: 0x2b2d30, roughness: 0.55 }),
      moqPad: new S({ map: moqPad, roughness: 0.95 }),
      moqCush: new S({ map: moqCush, roughness: 0.95 }),
      pole: new S({ color: L.pole, roughness: 0.4, metalness: 0.15, envMapIntensity: 0.5 }),
      strap: new S({ color: 0x9aa0a4, roughness: 0.6, side: THREE.DoubleSide }),
      stripYellow: new S({ color: 0xf2e12c, roughness: 0.7 }),
      redPlastic: new S({ color: 0xc43a30, roughness: 0.5 }),
      validator: new S({ map: val, roughness: 0.5 }),
      dash: new S({ color: 0x2b2e33, roughness: 0.8, envMapIntensity: 0.3 }),
      dashTop: new S({ map: grain, color: 0xffffff, roughness: 0.85, envMapIntensity: 0.25 }),
      dashPanel: new S({ color: 0x8f949a, roughness: 0.7 }),
      cabPanel: new S({ color: 0xb4bab8, roughness: 0.7 }),
      glassSmoked: new S({ color: 0x0d1115, roughness: 0.18, metalness: 0.2, transparent: true, opacity: 0.7, depthWrite: false, envMapIntensity: 0.8 }),
      mirrorIn: new S({ color: 0x8c979d, roughness: 0.1, metalness: 1 }),
      signs: new S({ map: dec.texture, alphaTest: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      cloth: new S({ color: 0x2f7f86, roughness: 0.95 }),
    };
    this.mats.floorMat = this.mats.floor;
    // the scene's blue ambient turns neutral greys blue: warm interior albedos a little
    const warm = new THREE.Color(1.12, 1.0, 0.86);
    for (const k of ['wall', 'wallDark', 'seat', 'cabPanel', 'dashPanel']) this.mats[k].color.multiply(warm);
    // the moquette and the floor are textured: a warmer tint keeps the blue-grey cloth of ref04 from turning royal blue
    for (const k of ['moqPad', 'moqCush', 'floor']) this.mats[k].color.setRGB(1.04, 0.95, 0.8);
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
  }

  /** Builds the merged meshes of a Parts collection; thin detail layers cast no shadow. */
  finish(parts) {
    const grp = parts.build(this.mats);
    for (const m of grp.children) if (NO_SHADOW.has(m.name)) m.castShadow = false;
    return grp;
  }

  /* ------------------------------------------------------------------ signs */
  buildSigns() {
    const D = this.D, F = this.F;
    const led = (sign, k = 2.2) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(k) });
    // front destination sign: behind the windscreen, 1.58 x 0.27 m (140 x 24 dots)
    const front = new LedSign(140, 24, 8);
    this.signs.front = front;
    front.on = this.look.led;
    const fz = F.frontZ;
    const sy0 = 2.52, sy1 = 2.8;
    const fg = new THREE.PlaneGeometry(1.58, sy1 - sy0);
    const fm = new THREE.Mesh(fg, led(front));
    const sp = this.frontSignPlacement();
    fm.position.set(0, (sy0 + sy1) / 2, sp.z);
    fm.rotation.set(sp.rx, Math.PI, 0);
    this.front.add(fm);
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(1.7, sy1 - sy0 + 0.06), this.mats.ledBack);
    bk.position.copy(fm.position);
    bk.position.z += 0.004;
    bk.rotation.copy(fm.rotation);
    this.front.add(bk);
    // side sign (right side only, inside the first pane behind door 1)
    const side = new LedSign(78, 14, 8);
    this.signs.side = side;
    side.on = this.look.led;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), led(side));
    sm.position.set(D.halfW - 0.07, 2.3, fz + 2.6);
    sm.rotation.y = Math.PI / 2;
    this.front.add(sm);
    // rear route display in the tail
    const rear = new LedSign(40, 16, 8);
    this.signs.rear = rear;
    rear.on = this.look.led;
    this.buildRearSign(led(rear));
    this.buildInteriorSigns(led);
    void D;
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 16);
    if (this.routeCtx) this.drawRouteCard(number);
  }

  setInteriorText(a, b = null) {
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  /* ------------------------------------------------------------------ animation */
  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta * (w.side > 0 ? (delta > 0 ? 0.88 : 1.0) : (delta > 0 ? 1.0 : 0.88));
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * this.D.steeringRatio * 0.5;
  }

  spin(distFront, distRear) {
    const R = this.D.wheelR;
    for (const w of this.wheels) w.spin.rotation.x = -(w.section === 'front' ? distFront : distRear) / R;
  }

  setDoor(id, openness) {
    const leaves = this.doorLeaves[id];
    if (!leaves) return;
    const e = openness < 0.5 ? 2 * openness * openness : 1 - Math.pow(-2 * openness + 2, 2) / 2;
    for (const l of leaves) l.pivot.rotation.y = l.end * e * (Math.PI / 2) * 0.97;
  }

  setLights({ head = false, brake = false, reverse = false, left = false, right = false, interior = 1 } = {}) {
    const m = this.mats;
    m.headlamp.emissiveIntensity = head ? 3.0 : 0;
    m.brake.emissiveIntensity = brake ? 3.0 : 0;
    m.tail.emissiveIntensity = head ? 1.4 : 0.35;
    m.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    m.indicatorL.emissiveIntensity = left ? 4 : 0;
    m.indicatorR.emissiveIntensity = right ? 4 : 0;
    m.lightStrip.emissiveIntensity = interior;
    m.marker.emissiveIntensity = head ? 0.9 : 0.15;
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
  }

  /** Wiper sweep: 0 = parked, about 1.45 = fully raised. */
  setWiper(angle) {
    if (!this.wipers) return;
    for (const w of this.wipers) w.piv.rotation.z = w.park + w.sweep * angle;
  }

  /** Interior only seen through the windows: skip it from afar; small trim beyond 140 m. */
  setDetail(cameraDist) {
    const show = cameraDist < 70;
    if (this.interiorGroups && this.interiorGroups[0].visible !== show) for (const g of this.interiorGroups) g.visible = show;
    const trim = cameraDist < 140;
    if (this.trimShown !== trim) {
      this.trimShown = trim;
      if (!this.trimMeshes) {
        this.trimMeshes = [];
        this.root.traverse((o) => { if (o.isMesh && SMALL_TRIM.has(o.name)) this.trimMeshes.push(o); });
      }
      for (const m of this.trimMeshes) m.visible = trim;
    }
  }

  dispose() {
    // the Blender kit's geometry, material and textures are shared by every bus and stay alive
    disposeModel(this.root, Object.values(this.mats));
    for (const s of Object.values(this.signs)) if (s && s.texture) s.texture.dispose();
    if (this.dashTex) this.dashTex.dispose();
  }

  afterPose() {
    this.root.updateMatrixWorld(true);
    this.updateBellows();
  }
}

Object.assign(ConectoModel.prototype, FrontMixin, BodyMixin, RearMixin, RunningMixin, InteriorMixin, CabMixin);
void Parts;
