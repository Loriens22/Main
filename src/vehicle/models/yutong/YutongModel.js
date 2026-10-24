// Detailed model of the Yutong ZK6126HGA (12 m rigid CNG city bus, orange Sofia livery), line 64.
// Implements the vehicle model interface of ../README.md. The exterior is built in YutongBody.js /
// YutongLamps.js / YutongRunning.js, the saloon in YutongInterior.js and the driver's cab in YutongCab.js.
// Reference photos: data/research/ref_photos/v2/ref12..15_yutong.jpg; numbers and sources: NOTES.md.
import * as THREE from 'three';
import { K } from './consts.js';
import { LedSign } from '../../LedSign.js';
import { Parts } from '../../BusGeom.js';
import { bakeStatic } from '../../BusBake.js';
import { frames } from '../../frames.js';
import { canvas, tex, makeOrnamentAtlas, makeDecalSheet, makePlate, makeHeadlampTex, makeLouvrePanel, makeVent } from './YutongTextures.js';
import { frontPatch, colsBetween } from './surfaces.js';
import { BodyMixin } from './YutongBody.js';
import { LampMixin } from './YutongLamps.js';
import { RunningMixin } from './YutongRunning.js';
import { InteriorMixin } from './YutongInterior.js';
import { CabMixin } from './YutongCab.js';

// meshes that never need to cast shadows (thin decal layers, glass, lamps, small trim)
const NO_SHADOW = new Set(['decals', 'ornaments', 'plate', 'chrome', 'lampFrame', 'headlamp', 'lensClear', 'marker', 'indicatorL', 'indicatorR', 'tail', 'brake', 'reverse', 'mirror', 'louvre', 'vent', 'windscreen', 'windscreenIn', 'glassOut', 'glassIn']);
// small trim that is invisible beyond ~140 m
const SMALL_TRIM = new Set(['decals', 'ornaments', 'plate', 'lampFrame', 'lensClear', 'chrome', 'louvre', 'vent', 'mirror', 'marker']);

export class YutongModel {
  constructor(spec, { fleet = '1501', quality = 'high', interior = true } = {}) {
    this.spec = spec;
    this.fleet = String(fleet);
    const f = (spec.fleets || []).find((q) => q.fleet === this.fleet) || spec.fleets[0];
    this.plate = f.plate;
    this.quality = quality;
    this.lite = quality === 'balanced' || quality === 'low';
    this.look = Object.assign({ led: '#ff9a1a' }, spec.look || {});
    this.root = new THREE.Group();
    this.root.name = `${spec.name} #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'frontSection';
    this.rear = new THREE.Group(); // rigid bus: stays empty (BusEntity copies the front transform into it)
    this.rear.name = 'rearSection';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.wheels = [];
    this.signs = {};
    this.F = frames(spec);
    this.makeMaterials();
    this.buildExterior();
    if (interior) {
      this.buildInterior();
      this.buildCab();
    } else this.buildCabMinimal();
    this.buildSigns();
    this.wiperAngle = 0;
    // one mesh per material state instead of one per colour (materials changed at runtime stay apart)
    this.bakeStats = bakeStatic(this.root, new Set([...Object.values(this.lightMats), this.mats.stopBtn, this.mats.lightStrip]));
    // the body already shadows the cabin: interior parts only receive shadows
    for (const g of this.interiorGroups || []) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  makeMaterials() {
    this.orn = makeOrnamentAtlas();
    const [hlMap, hlEmi] = makeHeadlampTex();
    const P = THREE.MeshPhysicalMaterial, S = THREE.MeshStandardMaterial;
    const lacquer = { roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 };
    const glassBase = { roughness: 0.1, metalness: 0.15, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
    this.mats = {
      paint: new P({ color: 0xf07a14, ...lacquer }),
      roofPaint: new P({ color: 0xf07a14, ...lacquer }),
      white: new P({ color: 0xe9eae6, ...lacquer }),
      black: new P({ color: 0x0a0c0e, roughness: 0.32, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.35, side: THREE.DoubleSide }),
      matteBlack: new S({ color: 0x15171a, roughness: 0.8, metalness: 0 }),
      satin: new S({ color: 0x17191c, roughness: 0.45, metalness: 0.1 }),
      underbody: new S({ color: 0x0e0e0e, roughness: 0.95, side: THREE.DoubleSide }),
      rubber: new S({ color: 0x161616, roughness: 0.92 }),
      tyre: new S({ color: 0x0c0d0d, roughness: 0.9, side: THREE.DoubleSide }),
      rim: new S({ color: 0xb8bdc2, roughness: 0.38, metalness: 0.85 }),
      chrome: new S({ color: 0xd5d9dc, roughness: 0.12, metalness: 1 }),
      glassOut: new P({ color: 0x040506, ...glassBase, opacity: 0.93, side: THREE.FrontSide, envMapIntensity: 0.7 }),
      glassIn: new P({ color: 0x0f181c, ...glassBase, opacity: 0.4, side: THREE.BackSide, envMapIntensity: 0.6 }),
      glassDoor: new P({ color: 0x07090b, ...glassBase, opacity: 0.8, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
      glassClear: new P({ color: 0x1a2328, ...glassBase, opacity: 0.45, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
      windscreen: new P({ color: 0x080b0f, ...glassBase, opacity: 0.7, side: THREE.FrontSide, envMapIntensity: 2.0 }),
      windscreenIn: new P({ color: 0x0f181c, ...glassBase, opacity: 0.08, side: THREE.BackSide, envMapIntensity: 0.4 }),
      lensClear: new P({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, envMapIntensity: 1.4 }),
      headlamp: new S({ map: hlMap, emissiveMap: hlEmi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 }),
      lampFrame: new S({ color: 0x2c2f33, roughness: 0.5 }),
      indicatorL: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.6 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xd9501e, roughness: 0.4, emissive: 0xff4a10, emissiveIntensity: 0.3 }),
      plate: new S({ map: makePlate(this.plate), roughness: 0.5 }),
      decals: new S({ map: makeDecalSheet(this.fleet), alphaTest: 0.5, alphaToCoverage: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      ornaments: new S({ map: this.orn.texture, alphaTest: 0.32, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      louvre: new S({ map: makeLouvrePanel(), roughness: 0.55, metalness: 0.2 }),
      vent: new S({ map: makeVent(), roughness: 0.6 }),
      mirror: new S({ color: 0x59626a, roughness: 0.1, metalness: 1 }),
      led: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      ...this.interiorMaterials(), // YutongInterior.js
    };
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
  }

  /** Builds the merged meshes of a Parts collection; thin detail layers cast no shadow. */
  finish(parts) {
    const grp = parts.build(this.mats);
    for (const m of grp.children) if (NO_SHADOW.has(m.name)) m.castShadow = false;
    return grp;
  }

  buildSigns() {
    const led = (sign, k = 2.2) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(k) });
    // front destination sign: 1.3 x 0.24 m amber matrix behind the upper windscreen (130 x 24 LEDs)
    const front = new LedSign(130, 24, 8);
    front.on = this.look.led;
    this.signs.front = front;
    const fm = new THREE.Mesh(frontPatch({ xs: colsBetween(0.62, -0.72, 8), y0: 2.37, y1: 2.61, nv: 1, off: 0.0032 }), led(front));
    this.front.add(fm);
    // side sign in the first window behind the front door (right side), 1.0 x 0.19 m
    const side = new LedSign(78, 15, 8);
    side.on = this.look.led;
    this.signs.side = side;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.19), led(side));
    sm.position.set(K.hw - 0.012, 2.27, -6.0);
    sm.rotation.y = Math.PI / 2;
    this.front.add(sm);
    // rear route number in the upper rear window (right half), 0.6 x 0.16 m
    const rear = new LedSign(60, 16, 8);
    rear.on = this.look.led;
    this.signs.rear = rear;
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.16), led(rear));
    rm.position.set(0.46, 2.6, K.rearZ - 0.068);
    this.front.add(rm);
    this.buildInteriorSigns(); // YutongInterior.js
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 15);
  }

  setInteriorText(a, b = null) {
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta * (w.side > 0 ? (delta > 0 ? 0.9 : 1.0) : (delta > 0 ? 1.0 : 0.9));
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * (this.spec.dims.steeringRatio || 20) * 0.5;
  }

  spin(distFront) {
    for (const w of this.wheels) w.spin.rotation.x = -distFront / K.wheelR;
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
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
  }

  /** Wiper sweep: 0 = parked, about 1.45 = fully raised. */
  setWiper(angle) {
    if (!this.wipers) return;
    for (const w of this.wipers) w.piv.rotation.z = w.park + w.sweep * angle;
  }

  /** The saloon is only seen through the windows: skip it from afar; small trim beyond 140 m. */
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
    const mats = new Set(), texs = new Set();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    });
    for (const m of [...mats, ...Object.values(this.mats)]) {
      for (const v of Object.values(m)) if (v && v.isTexture && !(v.userData && v.userData.shared)) texs.add(v);
      m.dispose();
    }
    for (const t of texs) t.dispose();
  }

  afterPose() {
    this.root.updateMatrixWorld(true);
  }
}

Object.assign(YutongModel.prototype, BodyMixin, LampMixin, RunningMixin, InteriorMixin, CabMixin);
void canvas; void tex; void Parts;
