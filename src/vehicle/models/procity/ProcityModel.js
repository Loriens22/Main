// Detailed 3D model of the BMC Procity 12 CNG (12 m rigid, white with Sofia's green blade livery) as run on
// line 64 and others. Implements the vehicle-model interface of ../README.md (rigid body: `front` is the whole
// bus with its origin at the rear axle, `rear` stays an empty group). Everything is procedural; the reference
// photos (data/research/ref_photos/v2/ref06..11_procity.jpg) are only looked at, never embedded.
// Exterior: ProcityFront / ProcitySides / ProcityRear / ProcityRunning on the surfaces of ProcityHull.
// Interior: ProcityInterior (saloon, seats, poles) and ProcityCab (driver's workplace and instrument cluster).
import * as THREE from 'three';
import { LedSign } from '../../LedSign.js';
import { makeLouvre, canvas, tex } from '../../BusTextures.js';
import { Parts } from '../../BusGeom.js';
import { bakeStatic } from '../../BusBake.js';
import {
  makeLiveryAtlas, makeDecalSheet, makePlate, makeSilverBand, makeHeadCluster, makeTailCluster,
} from './ProcityTextures.js';
import { FrontMixin } from './ProcityFront.js';
import { SideMixin } from './ProcitySides.js';
import { RearMixin } from './ProcityRear.js';
import { RunningMixin } from './ProcityRunning.js';
import { InteriorMixin } from './ProcityInterior.js';
import { CabMixin } from './ProcityCab.js';
import { FRONT_Z, REAR_Z, hwAt, facePatch, rearPatch, colsBetween } from './ProcityHull.js';

// thin layers that never need to cast shadows
const NO_SHADOW = new Set(['decals', 'leaves', 'plate', 'silver', 'lampFrame', 'headlamp', 'lensClear', 'marker', 'indicatorL', 'indicatorR', 'tail', 'brake', 'reverse', 'mirror', 'louvreWhite', 'louvreDark', 'lampGrey', 'windscreen', 'windscreenIn', 'glassOut', 'glassIn', 'routeCard']);
// small trim that is invisible beyond ~140 m
const SMALL_TRIM = new Set(['decals', 'plate', 'lampFrame', 'lensClear', 'louvreWhite', 'satinChrome', 'chrome', 'routeCard', 'mirror', 'lampGrey']);

export class ProcityModel {
  constructor(spec, { fleet = '1411', quality = 'high', interior = true } = {}) {
    this.spec = spec;
    this.fleet = String(fleet);
    const fl = spec.fleets.find((f) => f.fleet === this.fleet) || spec.fleets[0];
    this.fleet = fl.fleet;
    this.plate = fl.plate.replace('СВ', 'CB').replace('НА', 'HA');
    this.quality = quality;
    this.lite = quality === 'low' || quality === 'balanced';
    this.root = new THREE.Group();
    this.root.name = `BMC Procity 12 CNG #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'bus';
    this.rear = new THREE.Group();
    this.rear.name = 'rearSection (unused: rigid)';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.wheels = [];
    this.signs = {};
    this.lightMats = {};
    this.wiperAngle = 0;
    this.makeMaterials();
    this.buildExterior();
    if (interior) {
      this.buildInterior();
      this.buildCab();
    } else this.buildCabStub();
    this.buildSigns();
    this.bakeStats = bakeStatic(this.root, new Set([...Object.values(this.lightMats), this.mats.stopBtn, this.mats.lightStrip, this.mats.drl]));
    for (const g of this.interiorGroups || []) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  makeMaterials() {
    const atlas = makeLiveryAtlas();
    this.liveryUV = atlas.uv;
    this.liverySize = atlas.size;
    const decals = makeDecalSheet(this.fleet);
    this.decalRects = decals.rects;
    const [hlMap, hlEmi] = makeHeadCluster();
    const P = THREE.MeshPhysicalMaterial, S = THREE.MeshStandardMaterial;
    const lacquer = { roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 };
    const glassBase = { roughness: 0.1, metalness: 0.15, transparent: true, depthWrite: false };
    // route number card behind the windscreen (lower passenger corner), redrawn by setDestination
    const [rc, rg] = canvas(160, 100);
    this.routeCanvas = rc;
    this.routeCtx = rg;
    rg.fillStyle = '#f4f2e8';
    rg.fillRect(0, 0, 160, 100);
    this.routeTex = tex(rc, { aniso: 4 });
    this.mats = {
      paint: new P({ color: 0xf6f6f2, ...lacquer }),
      black: new P({ color: 0x090b0d, roughness: 0.3, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.4, side: THREE.DoubleSide }),
      matteBlack: new S({ color: 0x15171a, roughness: 0.8 }),
      satin: new S({ color: 0x17191c, roughness: 0.42, metalness: 0.1 }),
      silver: new S({ map: makeSilverBand(), roughness: 0.3, metalness: 0.7, envMapIntensity: 1.2 }),
      underbody: new S({ color: 0x0e0e0e, roughness: 0.95, side: THREE.DoubleSide }),
      rubber: new S({ color: 0x161616, roughness: 0.92 }),
      tyre: new S({ color: 0x0c0d0d, roughness: 0.9, side: THREE.DoubleSide }),
      rim: new S({ color: 0xb8bcc0, roughness: 0.38, metalness: 0.85 }),
      hub: new S({ color: 0xd3d7da, roughness: 0.22, metalness: 0.95 }),
      chrome: new S({ color: 0xd5d9dc, roughness: 0.12, metalness: 1 }),
      satinChrome: new S({ color: 0xb9bcbe, roughness: 0.35, metalness: 1 }),
      glass: new P({ color: 0x0f181c, ...glassBase, opacity: 0.55, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
      glassOut: new P({ color: 0x040506, ...glassBase, opacity: 0.93, side: THREE.FrontSide, envMapIntensity: 0.7 }),
      glassIn: new P({ color: 0x0f181c, ...glassBase, opacity: 0.4, side: THREE.BackSide, envMapIntensity: 0.6 }),
      windscreen: new P({ color: 0x080b0f, ...glassBase, opacity: 0.66, side: THREE.FrontSide, envMapIntensity: 2.0 }),
      windscreenIn: new P({ color: 0x0f181c, ...glassBase, opacity: 0.08, side: THREE.BackSide, envMapIntensity: 0.4 }),
      lensClear: new P({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, clearcoat: 1, envMapIntensity: 1.4 }),
      headlamp: new S({ map: hlMap, emissiveMap: hlEmi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 }),
      drl: new S({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }),
      lampFrame: new S({ color: 0x4a4d52, roughness: 0.5 }),
      lampGrey: new S({ map: makeTailCluster(), roughness: 0.45, metalness: 0.2 }),
      indicatorL: new S({ color: 0xd8d6cc, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xd8d6cc, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.35 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xd9701e, roughness: 0.4, emissive: 0xff5a10, emissiveIntensity: 0.25 }),
      plate: new S({ map: makePlate(this.plate), roughness: 0.5 }),
      decals: new S({ map: decals.texture, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      leaves: new S({ map: atlas.texture, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      mirror: new S({ color: 0x59626a, roughness: 0.1, metalness: 1 }),
      louvreDark: new S({ map: makeLouvre('dark'), roughness: 0.55, metalness: 0.2 }),
      louvreWhite: new S({ map: makeLouvre('white'), roughness: 0.5 }),
      routeCard: new S({ map: this.routeTex, roughness: 0.6 }),
      stopBtn: new S({ color: 0xc8102e, roughness: 0.4, emissive: 0xff1010, emissiveIntensity: 0 }),
      ...this.interiorMaterials(),
    };
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
  }

  finish(parts) {
    const grp = parts.build(this.mats);
    for (const m of grp.children) if (NO_SHADOW.has(m.name)) m.castShadow = false;
    return grp;
  }

  buildExterior() {
    const parts = new Parts();
    this.sideBody(parts);
    this.roofBody(parts);
    this.roofEquipment(parts);
    this.frontEnd(parts);
    this.rearEnd(parts);
    this.addAxle(this.front, -this.spec.dims.wb1, false, true);
    this.addAxle(this.front, 0, true, false);
    for (const d of this.spec.doors) this.addDoor(this.front, d);
    const grp = this.finish(parts);
    this.front.add(grp);
    this.exterior = grp;
    this.buildWipers();
  }

  buildSigns() {
    const led = (sign, k = 2.2) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(k) });
    // front destination sign: 1.65 x 0.25 m amber matrix behind the header glass (132 x 20)
    const front = new LedSign(132, 20, 8);
    this.signs.front = front;
    const fmesh = new THREE.Mesh(facePatch({ xs: colsBetween(0.825, -0.825, 8), y0: 2.5, y1: 2.75, nv: 2, off: 0.0025 }), led(front));
    this.front.add(fmesh);
    const flens = new THREE.Mesh(facePatch({ xs: colsBetween(0.825, -0.825, 8), y0: 2.5, y1: 2.75, nv: 2, off: 0.0045 }), this.mats.lensClear);
    flens.castShadow = false;
    this.front.add(flens);
    // side sign: on the upper part of the first pane behind door 1
    const side = new LedSign(78, 15, 8);
    this.signs.side = side;
    const sx = hwAt(2.5) + 0.0075;
    const sgeo = new THREE.PlaneGeometry(0.98, 0.19);
    const sm = new THREE.Mesh(sgeo, led(side));
    sm.position.set(sx, 2.5, -5.9);
    sm.rotation.y = Math.PI / 2;
    this.front.add(sm);
    // rear route number: upper right of the tail window
    const rear = new LedSign(40, 16, 8);
    this.signs.rear = rear;
    const rgeo = rearPatch({ xs: [0.38, 0.65, 0.92], y0: 2.38, y1: 2.54, nv: 1, off: 0.0075, scale: true });
    this.front.add(new THREE.Mesh(rgeo, led(rear)));
    // route card (lower passenger corner behind the windscreen)
    this.buildInteriorSigns();
  }

  /** Destination: number + text; also updates side and rear signs and the route card. */
  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 16);
    const g = this.routeCtx;
    g.fillStyle = '#f4f2e8';
    g.fillRect(0, 0, 160, 100);
    g.fillStyle = '#2a2b2c';
    g.font = 'bold 84px "Arial Narrow", Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(number || ''), 80, 54, 150);
    this.routeTex.needsUpdate = true;
  }

  setInteriorText(a, b = null) {
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  /* ------------------------------------------------------------------ animation */
  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta * (w.side > 0 ? (delta > 0 ? 0.88 : 1.0) : (delta > 0 ? 1.0 : 0.88));
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * this.spec.dims.steeringRatio * 0.5;
  }

  spin(distFront, distRear) {
    const R = this.spec.dims.wheelR;
    for (const w of this.wheels) w.spin.rotation.x = -(w.steer ? distFront : distRear) / R;
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
    m.drl.emissiveIntensity = head ? 1.4 : 0.7;
    m.brake.emissiveIntensity = brake ? 3.0 : 0;
    m.tail.emissiveIntensity = head ? 1.4 : 0.35;
    m.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    m.indicatorL.emissiveIntensity = left ? 4 : 0;
    m.indicatorR.emissiveIntensity = right ? 4 : 0;
    m.lightStrip.emissiveIntensity = interior;
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
    if (this.mats.stopSign) this.mats.stopSign.emissiveIntensity = on ? 1.6 : 0;
  }

  setWiper(angle) {
    if (!this.wipers) return;
    for (const w of this.wipers) w.piv.rotation.z = w.park + w.sweep * angle;
  }

  /** The interior is only seen through the windows: skip it from afar; small trim beyond 140 m. */
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

Object.assign(ProcityModel.prototype, InteriorMixin, CabMixin, FrontMixin, SideMixin, RearMixin, RunningMixin);
void FRONT_Z; void REAR_Z;
