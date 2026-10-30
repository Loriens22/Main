// Procedural 3D model of the MAN Lion's City G CNG (A23) articulated bus as
// operated in Sofia, reconstructed from the reference photographs (fleet
// 2319 / 3145 / 3153). Two rigid sections + deforming bellows, steerable
// wheels, four double inward-swinging doors, LED signs, lights, mirrors,
// wipers, full passenger interior and driver's cab.
// Exterior: BusFront.js (face, glass, mirrors, wipers), BusSides.js (panels,
// glazing, portals, leaves, roof, pods), BusRear.js, BusRunning.js (wheels,
// doors, bellows). Interior: BusInterior.js. Reference: data/research/bus/exterior/exterior_spec.md
import * as THREE from 'three';
import { disposeModel, kitInstances } from './BusKit.js';
import { glassMaterial, occludeInterior } from './Glass.js';
import { BUS, FRONT_Z, AXLE1_Z, HITCH_FRONT_Z, HITCH_REAR_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z, REAR_Z } from './BusSpec.js';
import { LedSign } from './LedSign.js';
import { makeLeafAtlas, makePlate, makeFrontDecals, makeManGrille, makeLionBadge, makeHeadlampTex, makeRibLens, makeLouvre, canvas, tex } from './BusTextures.js';
import { HW, S_REAR_ORIGIN, Parts, lerp, surfaceGrid } from './BusGeom.js';
import { InteriorMixin } from './BusInterior.js';
import { FrontMixin, facePatch, colsBetween, hwAt } from './BusFront.js';
import { SideMixin } from './BusSides.js';
import { RearMixin, REAR_ROOF_END, rearPatch } from './BusRear.js';
import { RunningMixin } from './BusRunning.js';
import { bakeStatic } from './BusBake.js';
import { applyBusLightmap } from './BusLightmap.js';

export const FLEET = {
  3145: { plate: 'CB 5696 HM', depot: 'Земляне' },
  3153: { plate: 'CB 5713 HM', depot: 'Земляне' },
  2319: { plate: 'CB 5720 HM', depot: 'Дружба' },
};

// meshes that never need to cast shadows (thin decals, glass, lamps, small trim)
const NO_SHADOW = new Set(['decals', 'leaves', 'plate', 'badge', 'chrome', 'satinChrome', 'lampFrame', 'lampRecess', 'headlamp', 'ribLens', 'lensClear', 'marker', 'indicatorL', 'indicatorR', 'tail', 'brake', 'reverse', 'mirror', 'louvreWhite', 'louvreDark', 'grille', 'windscreen', 'windscreenIn', 'glassOut', 'glassIn']);

// small trim that is invisible beyond ~140 m (fewer draw calls for distant buses)
const SMALL_TRIM = new Set(['decals', 'badge', 'plate', 'lampFrame', 'lampRecess', 'ribLens', 'lensClear', 'grille', 'louvreWhite', 'louvreDark', 'satinChrome', 'chrome', 'routeCard', 'mirror']);

export class BusModel {
  constructor({ fleet = '3145', quality = 'high', interior = true } = {}) {
    this.fleet = String(fleet);
    this.plate = (FLEET[this.fleet] || FLEET[3145]).plate;
    this.quality = quality;
    this.lite = quality === 'low' || quality === 'balanced'; // drop the smallest details
    this.root = new THREE.Group();
    this.root.name = `MAN Lion's City G #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'frontSection';
    this.rear = new THREE.Group();
    this.rear.name = 'rearSection';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.wheels = [];
    this.signs = {};
    this.lightMats = {};
    this.makeMaterials();
    this.buildFront();
    this.buildRear();
    this.buildBellows();
    if (interior) {
      this.buildInterior();
      this.buildCab();
    }
    this.buildSigns();
    this.wiperAngle = 0;
    // one mesh per material state instead of one per colour (materials changed at runtime stay apart)
    this.bakeStats = bakeStatic(this.root, new Set([...Object.values(this.lightMats), this.mats.stopBtn, this.mats.lightStrip]));
    // the body already shadows the cabin: interior parts only receive shadows (big saving in the shadow pass)
    for (const g of this.interiorGroups || []) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // sky light and its bounces baked in Blender (Cycles) for the static body and cabin
    applyBusLightmap(this, 'man');
    occludeInterior(this);
  }

  makeMaterials() {
    const atlas = makeLeafAtlas();
    this.leafUV = atlas.uv;
    this.leafSize = atlas.size;
    const decals = makeFrontDecals(this.fleet);
    this.decalRects = decals.rects;
    const [hlMap, hlEmi, hlRM] = makeHeadlampTex();
    const P = THREE.MeshPhysicalMaterial;
    const S = THREE.MeshStandardMaterial;
    const lacquer = { roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 };
    // route card behind the windscreen (lower passenger corner), redrawn by setDestination
    const [rc, rg] = canvas(160, 100);
    this.routeCanvas = rc;
    this.routeCtx = rg;
    rg.fillStyle = '#f2efdc';
    rg.fillRect(0, 0, 160, 100);
    const routeTex = tex(rc, { aniso: 4 });
    this.routeTex = routeTex;
    this.mats = {
      paint: new P({ color: 0xf1f2ee, ...lacquer }),
      black: new P({ color: 0x090b0d, roughness: 0.32, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 0.35, side: THREE.DoubleSide }),
      matteBlack: new S({ color: 0x15171a, roughness: 0.8, metalness: 0 }),
      satin: new S({ color: 0x15171a, roughness: 0.45, metalness: 0.1 }),
      underbody: new S({ color: 0x0e0e0e, roughness: 0.95, side: THREE.DoubleSide }),
      rubber: new S({ color: 0x161616, roughness: 0.92 }),
      tyre: new S({ color: 0x0c0d0d, roughness: 0.9, side: THREE.DoubleSide }),
      rim: new S({ color: 0xb5bac0, roughness: 0.38, metalness: 0.85 }),
      hub: new S({ color: 0x8d9194, roughness: 0.4, metalness: 0.8 }),
      chrome: new S({ color: 0xd5d9dc, roughness: 0.12, metalness: 1 }),
      satinChrome: new S({ color: 0xb9bcbe, roughness: 0.35, metalness: 1 }),
      // generic glass (door leaves, cab partition); the body glazing is split into an outer and an inner layer
      glass: glassMaterial({ color: 0x0f181c, transmit: 0.5, side: THREE.DoubleSide }),
      glassOut: glassMaterial({ color: 0x040506, transmit: 0.2, side: THREE.FrontSide }),
      glassIn: glassMaterial({ color: 0x0f181c, transmit: 0.42, side: THREE.BackSide, env: 0.2 }),
      windscreen: glassMaterial({ color: 0x080b0f, transmit: 0.45, side: THREE.FrontSide }),
      windscreenIn: glassMaterial({ color: 0x0f181c, transmit: 0.72, side: THREE.BackSide, env: 0.2 }),
      lensClear: new P({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.09, depthWrite: false, clearcoat: 1, envMapIntensity: 0.9 }),
      headlamp: new S({ map: hlMap, emissiveMap: hlEmi, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: hlRM, metalnessMap: hlRM, roughness: 1, metalness: 1 }),
      lampFrame: new S({ color: 0x4a4d52, roughness: 0.5 }),
      // walls of the white recesses round the front lamps (photo 2: no dark frame, a shaded lip)
      lampRecess: new S({ color: 0xa9aeb3, roughness: 0.55 }),
      ribLens: new S({ map: makeRibLens(), roughness: 0.4 }),
      indicatorL: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.6 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xd9501e, roughness: 0.4, emissive: 0xff4a10, emissiveIntensity: 0.3 }),
      plate: new S({ map: makePlate(this.plate), roughness: 0.5 }),
      decals: new S({ map: decals.texture, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      leaves: new S({ map: atlas.texture, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      grille: new S({ map: makeManGrille(), roughness: 0.25, metalness: 0.3 }),
      badge: new S({ map: makeLionBadge(), alphaTest: 0.5, alphaToCoverage: true, roughness: 0.2, metalness: 0.7 }),
      mirror: new S({ color: 0x59626a, roughness: 0.1, metalness: 1 }),
      yellow: new S({ color: 0xd8b02a, roughness: 0.35, metalness: 0.2 }),
      plastic: new S({ color: 0x2a2d30, roughness: 0.55 }),
      stopBtn: new S({ color: 0xc8102e, roughness: 0.4, emissive: 0xff1010, emissiveIntensity: 0 }),
      bellows: new S({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide }),
      bellowsPlate: new S({ color: 0xcfd1d1, roughness: 0.5 }),
      turntable: new S({ color: 0x4b5157, roughness: 0.6, metalness: 0.5 }),
      louvreDark: new S({ map: makeLouvre('dark'), roughness: 0.55, metalness: 0.2 }),
      louvreWhite: new S({ map: makeLouvre('white'), roughness: 0.5 }),
      routeCard: new S({ map: routeTex, roughness: 0.6 }),
      led: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      ...this.interiorMaterials(), // BusInterior.js
    };
    this.lightMats = {
      head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse,
      left: this.mats.indicatorL, right: this.mats.indicatorR,
    };
  }

  /** Builds the merged meshes of a Parts collection; thin detail layers cast no shadow. */
  finish(parts) {
    const grp = parts.build(this.mats);
    for (const m of grp.children) if (NO_SHADOW.has(m.name)) m.castShadow = false;
    return grp;
  }

  /* ------------------------------------------------------------------ exterior */
  buildFront() {
    const parts = new Parts();
    const L = this.sideBody(parts, 'front');
    this.roofBody(parts, L, 0.5, L.s1);
    this.roofPod(parts, FRONT_Z + 1.7, FRONT_Z + 8.4, 2.2, BUS.podY - BUS.roofY, 0.3, 0.3, 0.35);
    this.frontEnd(parts);
    this.endFrame(parts, FRONT_BODY_END_Z, -1);
    // front wheels on steering knuckles, middle axle, doors 1 and 2
    this.addAxle(this.front, AXLE1_Z, false, true);
    this.addAxle(this.front, 0, false, false);
    for (const d of BUS.doors.filter((q) => q.section === 'front')) this.addDoor(this.front, d);
    const grp = this.finish(parts);
    if (this._kitMirrors) {
      const km = kitInstances(this._kitMirrors, [{ x: 0, y: 0, z: FRONT_Z }], { castShadow: true });
      if (km) grp.add(km);
    }
    this.front.add(grp);
    this.frontExterior = grp;
    this.buildWipers();
  }

  buildRear() {
    const parts = new Parts();
    const L = this.sideBody(parts, 'rear');
    this.roofBody(parts, L, L.s0, REAR_ROOF_END + S_REAR_ORIGIN);
    this.roofPod(parts, -4.4, -0.8, 2.1, 0.32, 0.26, 0.28, 0.3);
    this.rearEnd(parts);
    this.endFrame(parts, REAR_BODY_START_Z, 1);
    this.addAxle(this.rear, 0, true, false); // driven axle, twin tyres
    for (const d of BUS.doors.filter((q) => q.section === 'rear')) this.addDoor(this.rear, d);
    const grp = this.finish(parts);
    this.rear.add(grp);
    this.rearExterior = grp;
  }

  buildSigns() {
    const led = (sign, k = 2.2) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(k) });
    // front destination sign: 1.72 x 0.32 m amber matrix in the black header (24 rows x 132 columns)
    const front = new LedSign(132, 24, 8);
    this.signs.front = front;
    const fmesh = new THREE.Mesh(facePatch({ xs: colsBetween(0.86, -0.86, 8), y0: 2.36, y1: 2.68, nv: 2, off: 0.0025 }), led(front));
    this.front.add(fmesh);
    const flens = new THREE.Mesh(facePatch({ xs: colsBetween(0.86, -0.86, 8), y0: 2.36, y1: 2.68, nv: 2, off: 0.0045 }), this.mats.lensClear);
    flens.castShadow = false;
    this.front.add(flens);
    // side sign at the top of the first window behind door 1 (S 2.05-3.05, Y 2.48-2.68)
    const side = new LedSign(78, 15, 8);
    this.signs.side = side;
    const sx = hwAt(2.58) + 0.0075;
    const sgeo = surfaceGrid(1, 1, (u, v) => [sx, lerp(2.48, 2.68, v), FRONT_Z + 3.05 - u * 1.0]);
    this.front.add(new THREE.Mesh(sgeo, led(side)));
    // rear route display in the upper corner of the tail
    const rear = new LedSign(40, 16, 8);
    this.signs.rear = rear;
    const rgeo = rearPatch({ xs: [0.5, 0.72, 0.95], y0: 2.46, y1: 2.64, nv: 1, off: 0.006, scale: true });
    this.rear.add(new THREE.Mesh(rgeo, led(rear)));
    // route card behind the windscreen, lower passenger corner (0.35 x 0.22 m)
    const card = surfaceGrid(1, 1, (u, v) => [lerp(1.11, 0.76, u), lerp(1.17, 1.36, v), FRONT_Z + 0.07]);
    const cm = new THREE.Mesh(card, this.mats.routeCard);
    cm.castShadow = false;
    this.front.add(cm);
    this.buildInteriorSigns(); // BusInterior.js
  }

  /** Destination: number + text; also updates side & rear signs and the route card. */
  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 16);
    const g = this.routeCtx;
    g.fillStyle = '#f2efdc';
    g.fillRect(0, 0, 160, 100);
    g.fillStyle = '#111';
    g.font = 'bold 78px "Arial Narrow", Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(number || ''), 80, 54, 146);
    this.routeTex.needsUpdate = true;
  }

  setInteriorText(a, b = null) {
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  /* ------------------------------------------------------------------ animation */
  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta * (w.side > 0 ? (delta > 0 ? 0.88 : 1.0) : (delta > 0 ? 1.0 : 0.88));
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * BUS.steeringRatio * 0.5;
  }

  /** Wheel spin from travelled distance per section. */
  spin(distFront, distRear) {
    for (const w of this.wheels) w.spin.rotation.x = -(w.section === 'front' ? distFront : distRear) / BUS.wheelR;
  }

  setDoor(id, openness) {
    const leaves = this.doorLeaves[id];
    if (!leaves) return;
    // inward swing with pneumatic easing
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

  /** The passenger interior is only seen through the windows: skip it from afar; small trim beyond 140 m. */
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

  /** Free GPU resources; every bus owns its geometry and materials (the leaf atlas is shared). */
  dispose() {
    // the Blender kit's geometry, material and textures are shared by every bus and stay alive
    disposeModel(this.root, Object.values(this.mats));
  }

  /** Ensures world matrices are up to date, then rebuilds the bellows. */
  afterPose() {
    this.root.updateMatrixWorld(true);
    this.updateBellows();
  }
}

// passenger interior, seats, poles and the driver's cab live in BusInterior.js
Object.assign(BusModel.prototype, InteriorMixin, FrontMixin, SideMixin, RearMixin, RunningMixin);

export { HITCH_FRONT_Z, HITCH_REAR_Z };
void REAR_Z;
