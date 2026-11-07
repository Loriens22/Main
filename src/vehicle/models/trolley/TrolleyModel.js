// Detailed models of the three trolleybuses of line 9 (Expansion 5.0), built from the reference photographs
// supplied with the directive (images 1-18) and the vehicle data in specs.js:
//   Škoda 27Tr Solaris IV  (images 1-6)   Urbino IV body: big black-glazed front, slim LED lamps, LED strips by
//                                         the doors, blue roof fairings, dark seats with blue fabric
//   Škoda 27Tr Solaris III (images 7-10)  Urbino III body: separate sign box over the windscreen, 'eye' lamp
//                                         clusters, red door lamps inside, grey seats with violet-blue fabric
//   Ikarus 280.92F         (images 11-18) 1980s Ikarus 280 body on a high floor with the new Sofia front mask,
//                                         four folding doors, roof resistors, rope-pulled poles
// Shared structure (this file): materials, wheels, bellows, LED signs, trolley poles, lamps, door signals and
// the model interface (models/README.md). Body sides and roof: TrolleyBody.js; fronts and rears:
// TrolleyEnds.js; door leaves: TrolleyDoors.js; saloon and cab: TrolleyInterior.js. Kit parts modelled in
// Blender: TrolleyKit.js (kit_trolley.glb) and BusKit.js (wheels, steering wheel, validators).
import * as THREE from 'three';
import { disposeModel, kitWheel } from '../../BusKit.js';
import { glassMaterial, occludeInterior } from '../../Glass.js';
import { LedSign } from '../../LedSign.js';
import { bakeStatic } from '../../BusBake.js';
import { frames } from '../../frames.js';
import { Parts, M, box, cyl } from './geom.js';
import { tkMesh } from './TrolleyKit.js';
import { DESIGNS } from './designs.js';
import { BodyMixin } from './TrolleyBody.js';
import { EndsMixin } from './TrolleyEnds.js';
import { DoorsMixin } from './TrolleyDoors.js';
import { InteriorMixin } from './TrolleyInterior.js';
import { EbusEndsMixin } from '../ebus/EbusEnds.js';
import { EbusBodyMixin } from '../ebus/EbusBody.js';
import { EbusInteriorMixin } from '../ebus/EbusInterior.js';
import { EbusMaterialsMixin } from '../ebus/EbusMaterials.js';

export class TrolleyModel {
  constructor(spec, { fleet = null, quality = 'high', interior = true } = {}) {
    this.spec = spec;
    this.D = spec.dims;
    this.F = frames(spec);
    // a design object on the spec (the battery buses of line 84) or one of the trolleybus designs
    this.G = spec.design || DESIGNS[spec.id];
    // rigid buses (line 84): one body section in the front frame (origin = rear axle), no bellows, no poles
    this.rigid = spec.articulated === false;
    this.fleet = String(fleet || spec.fleets[0].fleet);
    this.plate = (spec.fleets.find((f) => f.fleet === this.fleet) || spec.fleets[0]).plate;
    this.quality = quality;
    this.lite = quality === 'low' || quality === 'balanced';
    this.look = spec.look;
    this.root = new THREE.Group();
    this.root.name = `${spec.name} #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'frontSection';
    this.rear = new THREE.Group();
    this.rear.name = 'rearSection';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.doorAnim = {};
    this.wheels = [];
    this.signs = {};
    this.doorSignals = {};
    this.makeMaterials();
    for (const sec of this.rigid ? ['front'] : ['front', 'rear']) {
      const p = new Parts();
      this.buildSides(p, sec);
      this.buildRoof(p, sec);
      if (sec === 'front') this.buildFront(p);
      if (sec === 'rear' || this.rigid) this.buildRearEnd(p);
      if (!this.rigid) this.buildBellowsFrame(p, sec);
      const g = p.build(this.mats);
      g.name = `${sec}Body`;
      this.sec(sec).add(g);
      this.buildAxles(sec);
      this.buildDoors(sec);
    }
    if (!this.rigid) this.buildBellows();
    if (spec.trolley) {
      this.buildRoofKit();
      this.buildPoles();
    }
    if (interior) {
      this.buildInterior();
      this.buildCab();
    } else {
      this.interiorGroups = [];
      this.driverEyeLocal = new THREE.Vector3(-0.7, 1.95, this.F.frontZ + 1.5);
    }
    this.buildSigns();
    this.setLights({});
    this.bakeStats = bakeStatic(this.root, new Set([...Object.values(this.lightMats), this.mats.stopBtn, this.mats.lightStrip, ...Object.values(this.doorSignalMats())]));
    for (const g of this.interiorGroups || []) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    occludeInterior(this);
  }

  sec(name) {
    return name === 'rear' && !this.rigid ? this.rear : this.front;
  }

  makeMaterials() {
    const L = this.look, G = this.G;
    const S = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
    const paint = G.old ? { roughness: 0.46, metalness: 0.02, clearcoat: 0.25, clearcoatRoughness: 0.3 } : { roughness: 0.3, metalness: 0.03, clearcoat: 0.8, clearcoatRoughness: 0.08 };
    this.mats = {
      // livery roles: paint = the upper body and roof band (Solaris sky blue, Ikarus yellow), band = the panel band
      // under the windows (Solaris orange / yellow), blue = the lower band / skirt
      paint: new P({ color: L.body, ...paint }),
      band: new P({ color: L.band ?? L.body, ...paint }),
      blue: new P({ color: L.lower, ...paint }),
      acSilver: new S({ color: G.old ? 0xb9bdbf : 0xc4c8cb, roughness: 0.42, metalness: 0.55 }),
      roof: new P({ color: L.roof, roughness: 0.4, metalness: 0.03, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
      black: new P({ color: 0x0a0b0d, roughness: 0.32, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.5 }),
      matteBlack: new S({ color: 0x141618, roughness: 0.82 }),
      // opaque dark mirror glass: the Solaris IV shroud panels and the black glazing over the rear section (ref02, ref09)
      darkGlass: new P({ color: 0x080b0e, roughness: 0.05, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25 }),
      satin: new S({ color: 0x1b1d20, roughness: 0.5, metalness: 0.15 }),
      rubber: new S({ color: 0x121314, roughness: 0.9 }),
      underbody: new S({ color: 0x0d0d0e, roughness: 0.95, side: THREE.DoubleSide }),
      tyre: new S({ color: 0x0c0d0d, roughness: 0.9 }),
      rim: new S({ color: 0xa9adb0, roughness: 0.45, metalness: 0.7 }),
      // satin silver trim (the Solaris III lamp band, the Ikarus vent frames): a light metallic grey that does not
      // turn dark in the environment reflection
      alu: new S({ color: 0xc9cdd0, roughness: 0.32, metalness: 0.45 }),
      chrome: new S({ color: 0xd3d7da, roughness: 0.15, metalness: 1 }),
      steel: new S({ color: 0x6d7175, roughness: 0.45, metalness: 0.8 }),
      grille: new S({ color: 0x232527, roughness: 0.7, metalness: 0.3 }),
      glass: glassMaterial({ color: 0x0b1216, transmit: G.old ? 0.6 : 0.42, side: THREE.DoubleSide }),
      // the Solaris glazing reads as dark mirror glass in the photos; the Ikarus windows are clearer
      glassOut: glassMaterial({ color: 0x040506, transmit: G.old ? 0.42 : 0.1, side: THREE.FrontSide }),
      glassIn: glassMaterial({ color: 0x0f181c, transmit: 0.55, side: THREE.BackSide, env: 0.2 }),
      windscreen: glassMaterial({ color: 0x080b0f, transmit: 0.5, side: THREE.FrontSide }),
      windscreenIn: glassMaterial({ color: 0x0f181c, transmit: 0.75, side: THREE.BackSide, env: 0.2 }),
      lens: new P({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.14, depthWrite: false, clearcoat: 1, envMapIntensity: 1.1 }),
      headlamp: new S({ color: 0xe8ecef, roughness: 0.15, metalness: 0.4, emissive: 0xfff6e8, emissiveIntensity: 0 }),
      drl: new S({ color: 0xdfe6ee, roughness: 0.25, emissive: 0xf2f6ff, emissiveIntensity: 0.9 }),
      indicatorL: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xe07b0a, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.4 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xd9a21e, roughness: 0.4, emissive: 0xff9a10, emissiveIntensity: 0.2 }),
      plate: new S({ map: makePlate(this.fleet, G), roughness: 0.5 }),
      decals: new S({ map: makeDecals(this.fleet, G), transparent: true, alphaTest: 0.4, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      frontDecal: new S({ map: makeFrontDecal(this.fleet, G), transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      rearDecal: new S({ map: makeRearDecal(this.fleet, G), transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      poleOut: new S({ color: G.poleColor ?? 0x2f3236, roughness: 0.45, metalness: G.old ? 0.1 : 0.55 }),
      poleTip: new S({ color: G.poleTip ?? 0xf2c21a, roughness: 0.5 }),
      chromeDrum: new S({ color: 0xc9cdd0, roughness: 0.22, metalness: 0.95 }),
      hazard: new S({ map: makeHazard(), roughness: 0.6 }),
      ledBack: new S({ color: 0x050505, roughness: 0.6 }),
      // ---- interior
      floor: new S({ map: makeFloor(L.floor), roughness: 0.88 }),
      wall: new S({ color: G.wall, roughness: 0.6 }),
      ceiling: new S({ color: G.ceiling, roughness: 0.7 }),
      trim: new S({ color: G.trim, roughness: 0.55 }),
      pole: new S({ color: L.pole, roughness: 0.35, metalness: 0.35 }),
      seat: new S({ color: L.seat, roughness: 0.45 }),
      fabric: new S({ color: L.seatFabric ?? L.seat, roughness: 0.95 }),
      dash: new S({ color: 0x1f2226, roughness: 0.75 }),
      dashSoft: new S({ color: 0x2b2f34, roughness: 0.85 }),
      lightStrip: new S({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1 }),
      stopBtn: new S({ color: 0xc8102e, roughness: 0.4, emissive: 0xff1010, emissiveIntensity: 0 }),
      yellowEdge: new S({ color: 0xf0c419, roughness: 0.5 }),
      cabWhite: new S({ color: 0xe9ebec, roughness: 0.55 }),
      validatorBlue: new S({ color: 0x2a7ad6, roughness: 0.35 }),
      bellows: new S({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }),
      turntable: new S({ color: 0x6b6f72, roughness: 0.5, metalness: 0.5 }),
      pantoInsulator: new S({ color: 0x3d1408, roughness: 0.3 }),
    };
    if (G.ends) this.makeEbusMaterials(); // the line-84 battery buses' decals and fittings
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
  }

  /** Materials switched by setDoorSignal (one per door), excluded from the static merge. */
  doorSignalMats() {
    const out = {};
    for (const [id, s] of Object.entries(this.doorSignals)) out[id] = s.mat;
    return out;
  }

  // ---------------------------------------------------------------- running gear
  buildAxles(sec) {
    const d = this.D, R = d.wheelR;
    const axles = sec === 'front' ? [[-d.wb1, true, false], [0, false, true]] : [[0, false, true]];
    for (const [z, steer, twin] of axles) {
      for (const side of [-1, 1]) {
        const knuckle = new THREE.Group();
        knuckle.position.set(side * (d.track / 2), R, z);
        const spin = new THREE.Group();
        const kw = kitWheel(twin, { kind: 'steel', R, spacing: 0.3 });
        if (kw) {
          kw.rotation.y = side > 0 ? 0 : Math.PI; // outer face outwards
          spin.add(kw);
        } else {
          const tyre = new THREE.Mesh(new THREE.CylinderGeometry(R, R, twin ? 0.56 : 0.3, 24), this.mats.tyre);
          tyre.rotation.z = Math.PI / 2;
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.58, R * 0.58, (twin ? 0.56 : 0.3) + 0.01, 18), this.mats.rim);
          rim.rotation.z = Math.PI / 2;
          spin.add(tyre, rim);
        }
        knuckle.add(spin);
        this.sec(sec).add(knuckle);
        this.wheels.push({ knuckle, spin, steer, side, section: sec, z });
      }
    }
  }

  // ---------------------------------------------------------------- bellows (deforming accordion)
  buildBellows() {
    const D = this.D;
    const folds = this.G.old ? 7 : 9, per = 6;
    this.bellowsRings = folds * per + 1;
    const ring = [];
    const W2 = D.halfW - 0.06, y0 = Math.max(0.42, D.floorY - 0.2), y1 = D.roofY - 0.08, rr = this.G.old ? 0.14 : 0.26, segs = 6;
    ring.push([W2, y0]);
    for (let i = 0; i <= segs; i++) { const a = (i / segs) * (Math.PI / 2); ring.push([W2 - rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]); }
    for (let i = 0; i <= segs; i++) { const a = Math.PI / 2 + (i / segs) * (Math.PI / 2); ring.push([-W2 + rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr]); }
    ring.push([-W2, y0]);
    this.bellowsRing = ring;
    this.bellowsY0 = y0;
    const n = ring.length, R = this.bellowsRings;
    this.bellowsFold = Array.from({ length: R }, (_, k) => 0.5 * (1 - Math.cos(2 * Math.PI * folds * (k / (R - 1)))));
    const pos = new Float32Array(R * n * 3), col = new Float32Array(R * n * 3);
    const base = new THREE.Color(this.look.bellows);
    const crest = base.clone().multiplyScalar(1.15), valley = base.clone().multiplyScalar(0.45), c = new THREE.Color();
    for (let k = 0; k < R; k++) {
      c.copy(crest).lerp(valley, this.bellowsFold[k]);
      for (let i = 0; i < n; i++) { col[(k * n + i) * 3] = c.r; col[(k * n + i) * 3 + 1] = c.g; col[(k * n + i) * 3 + 2] = c.b; }
    }
    const idx = [];
    for (let k = 0; k < R - 1; k++) for (let i = 0; i < n - 1; i++) { const a = k * n + i, b = a + 1, cc = a + n, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.bellows = new THREE.Mesh(g, this.mats.bellows);
    this.bellows.frustumCulled = false;
    this.bellows.castShadow = true;
    this.front.add(this.bellows);
    // turntable floor plate (rotates with the rear section)
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.03, 40), this.mats.turntable);
    tt.position.set(0, D.floorY + 0.015, this.F.hitchFront);
    this.front.add(tt);
    this.turntable = tt;
    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
    this._lastRel = new Float32Array(16);
    this._relDirty = true;
  }

  updateBellows() {
    const F = this.F;
    const rel = this._tmpM.copy(this.front.matrixWorld).invert().multiply(this.rear.matrixWorld);
    let same = !this._relDirty;
    if (same) for (let i = 0; i < 16; i++) if (Math.abs(rel.elements[i] - this._lastRel[i]) > 1e-6) { same = false; break; }
    if (same) return;
    this._relDirty = false;
    for (let i = 0; i < 16; i++) this._lastRel[i] = rel.elements[i];
    const pos = this.bellows.geometry.attributes.position;
    const n = this.bellowsRing.length;
    const e = (this._euler = this._euler || new THREE.Euler()).setFromRotationMatrix(rel, 'YXZ');
    const phi = e.y;
    const lzF = F.frontEnd - F.hitchFront, lzR = F.rearStart - F.hitchRear;
    const B = this._tmpV, yBase = this.bellowsY0, R = this.bellowsRings;
    const c1 = Math.cos(phi), s1 = Math.sin(phi);
    for (let i = 0; i < n; i++) {
      const [x, y] = this.bellowsRing[i];
      B.set(x, y, F.rearStart).applyMatrix4(rel);
      const ex = B.x - (x * c1 + lzR * s1), ey = B.y - y, ez = B.z - (F.hitchFront - x * s1 + lzR * c1);
      for (let k = 0; k < R; k++) {
        const t = k / (R - 1), d = this.bellowsFold[k];
        const xf = x * (1 - 0.05 * d), yf = yBase + (y - yBase) * (1 - 0.02 * d);
        const lz = lzF + (lzR - lzF) * t, ang = phi * t, ca = Math.cos(ang), sa = Math.sin(ang);
        pos.setXYZ(k * n + i, xf * ca + lz * sa + ex * t, yf + ey * t, F.hitchFront - xf * sa + lz * ca + ez * t);
      }
    }
    pos.needsUpdate = true;
    this.bellows.geometry.computeVertexNormals();
    this.turntable.rotation.y = phi;
  }

  // ---------------------------------------------------------------- trolley poles
  /**
   * The two poles on the rear section: common base frame, a turret per pole (turns about y), the pole (hinge
   * clamp, tube scaled to the spec length, trolley head kept level), retriever ropes (Solaris III) or pull
   * ropes (Ikarus). TrolleyPoles.js drives them through model.poles[i].onPose(p) with p.dir in the rear frame.
   */
  buildPoles() {
    const T = this.spec.trolley, D = this.D;
    const L = T.length;
    const cx = 0, by = T.base[0][1], bz = T.base[0][2];
    const base = tkMesh('trolleyBase', { castShadow: true });
    if (base) {
      base.position.set(cx, by, bz);
      if (this.G.old) base.scale.set(1, 0.85, 1);
      this.rear.add(base);
    } else {
      const p = new Parts();
      p.add('steel', box(1.1, 0.06, 0.9), M(0, by - 0.2, bz));
      this.rear.add(p.build(this.mats));
    }
    this.poles = [];
    this.ropes = [];
    for (const b of T.base) {
      const turret = new THREE.Group();
      turret.position.set(b[0], b[1], b[2]);
      this.rear.add(turret);
      const tm = tkMesh('trolleyTurret', { castShadow: true });
      if (tm) turret.add(tm);
      else turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 16).translate(0, -0.12, 0), this.mats.steel));
      const arm = new THREE.Group();
      turret.add(arm);
      const root = tkMesh('poleRoot', { castShadow: true });
      if (root) arm.add(root);
      // the pole tube in its paint (Solaris IV light grey, Solaris III grey with a yellow insulated end, Ikarus
      // orange), tapering towards the head
      const tipL = this.G.poleTip ? 1.5 : 0;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, L - 0.3 - tipL, 12).rotateX(Math.PI / 2).translate(0, 0, 0.3 + (L - 0.3 - tipL) / 2), this.mats.poleOut);
      tube.castShadow = true;
      arm.add(tube);
      if (tipL) {
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, tipL, 12).rotateX(Math.PI / 2).translate(0, 0, L - tipL / 2), this.mats.poleTip);
        tip.castShadow = true;
        arm.add(tip);
      }
      const head = new THREE.Group();
      head.position.set(0, 0, L);
      arm.add(head);
      const hm = tkMesh('poleHead', { castShadow: true });
      if (hm) head.add(hm);
      else head.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32).translate(0, 0.05, -0.03), this.mats.steel));
      // rope: retriever (Solaris III) or the pull rope to the tail (Ikarus)
      let rope = null;
      if (T.retrievers || T.ropes || this.G.hookFrame) {
        rope = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true).translate(0, 0.5, 0), this.mats.rubber);
        rope.castShadow = false;
        this.rear.add(rope);
        this.ropes.push(rope);
      }
      // rope anchors: Solaris III retriever drums on the rear panel, Ikarus reels on the rear wall, Solaris IV the
      // catcher frame over the rear end
      const anchor = this.G.old ? new THREE.Vector3(b[0] * 0.73, 1.38, this.F.rearZ + 0.1)
        : T.retrievers ? new THREE.Vector3(b[0] * 1.2, 1.22, this.F.rearZ + 0.12)
          : new THREE.Vector3(b[0], D.roofY + 0.45, this.F.rearZ - 0.3);
      const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), e = new THREE.Euler();
      const tip = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      const onPose = (pp) => {
        const d = pp.dir;
        const yaw = Math.atan2(d.x, d.z), pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
        turret.rotation.set(0, yaw, 0);
        arm.rotation.set(-pitch, 0, 0);
        // the head stays level and along the section (it swivels to follow the wire)
        q.setFromEuler(e.set(-pitch, yaw, 0, 'YXZ')).invert();
        head.quaternion.copy(q);
        if (rope) {
          const k = T.retrievers ? 0.86 : 0.97;
          tip.set(b[0] + d.x * L * k, b[1] + d.y * L * k, b[2] + d.z * L * k);
          const v = tip.clone().sub(anchor);
          const len = v.length();
          rope.position.copy(anchor);
          rope.scale.set(1, len, 1);
          qa.setFromUnitVectors(up, v.normalize());
          rope.quaternion.copy(qa);
        }
      };
      this.poles.push({ pivot: new THREE.Object3D(), onPose, turret, arm, head });
      // initial pose: on the hook
      const rest = new THREE.Vector3(0, T.hook[1] - b[1], T.hook[0] - b[2]).normalize();
      onPose({ dir: rest });
    }
  }

  /** Roof equipment from the kit: hooks, retrievers, louvres, fans, resistors (positions from the design). */
  buildRoofKit() {
    const T = this.spec.trolley, G = this.G;
    const p = new Parts();
    for (const b of T.base) {
      if (!G.hookFrame) {
        const h = tkMesh('poleHook', { castShadow: true });
        if (h) { h.position.set(b[0], G.hookRoofY ?? this.D.roofY, T.hook[0]); this.rear.add(h); }
      }
      const z = this.F.rearZ;
      if (T.retrievers) {
        // Solaris III: chrome retriever drums on the yellow rear panel (ref08)
        const x = b[0] * 1.2;
        p.add('chromeDrum', new THREE.CylinderGeometry(0.11, 0.11, 0.14, 24).rotateX(Math.PI / 2), M(x, 1.22, z + 0.07));
        p.add('chromeDrum', new THREE.CylinderGeometry(0.115, 0.115, 0.02, 24).rotateX(Math.PI / 2), M(x, 1.22, z + 0.14));
        for (let k = 0; k < 6; k++) p.add('steel', box(0.012, 0.012, 0.03), M(x + Math.cos(k) * 0.09, 1.22 + Math.sin(k) * 0.09, z + 0.155));
        p.add('satin', new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12).rotateX(Math.PI / 2), M(x, 1.22, z + 0.17));
      } else if (G.old) {
        // Ikarus: black rope reels on the rear wall (ref11)
        const x = b[0] * 0.73;
        p.add('satin', new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20).rotateX(Math.PI / 2), M(x, 1.38, z + 0.05));
        p.add('matteBlack', new THREE.CylinderGeometry(0.08, 0.06, 0.04, 20).rotateX(Math.PI / 2), M(x, 1.38, z + 0.12));
      }
    }
    if (G.old) {
      // the low dark box the Ikarus pole bases stand on
      p.add('satin', box(1.1, 0.12, 0.9, 0.02), M(0, this.D.roofY + 0.06, T.base[0][2]));
    }
    this.rear.add(p.build(this.mats));
    for (const it of G.roofKit || []) {
      const m = tkMesh(it.piece, { castShadow: true });
      if (!m) continue;
      m.position.set(it.x, it.y, it.z);
      if (it.yaw) m.rotation.y = it.yaw;
      if (it.scale) m.scale.setScalar(it.scale);
      this.sec(it.sec).add(m);
    }
  }

  // ---------------------------------------------------------------- LED signs
  buildSigns() {
    const G = this.G, F = this.F, D = this.D;
    const led = (sign) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    const make = (cols, rows, w, h, sec, pos, rotY) => {
      const s = new LedSign(cols, rows, 8);
      s.on = this.look.led;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), led(s));
      m.position.set(...pos);
      m.rotation.y = rotY;
      this.sec(sec).add(m);
      return s;
    };
    const fs = G.frontSign;
    this.signs.front = make(132, 24, fs.w, fs.h, 'front', [0, fs.y, F.frontZ + fs.dz], Math.PI);
    const ss = G.sideSign;
    this.signs.side = make(78, 15, ss.w, ss.h, 'front', [D.halfW + 0.006 - (ss.inset || 0), ss.y, ss.z], Math.PI / 2);
    const rs = G.rearSign;
    this.signs.rear = make(40, 16, rs.w, rs.h, 'rear', [rs.x, rs.y, F.rearZ + rs.dz], 0);
    const is = new LedSign(192, 16, 6);
    is.on = this.look.led;
    this.signs.interior = is;
    const im = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.15), led(is));
    im.position.set(0, G.interiorSignY ?? D.windowTopY - 0.18, F.frontZ + G.interiorSignZ);
    this.front.add(im);
    if (this.interiorGroups && this.interiorGroups[0]) this.interiorGroups[0].attach(im);
  }

  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 16);
  }

  setInteriorText(a, b = null) {
    if (b) this.signs.interior.showLines(a, b);
    else this.signs.interior.showText(a, 13, 'center');
  }

  // ---------------------------------------------------------------- interface
  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta;
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * (this.D.steeringRatio || 20) * 0.5;
  }

  spin(distFront, distRear) {
    const R = this.D.wheelR;
    for (const w of this.wheels) w.spin.rotation.x = -(w.section === 'front' ? distFront : distRear) / R;
  }

  setLights({ head = false, brake = false, reverse = false, left = false, right = false, interior = 1 } = {}) {
    const m = this.mats;
    m.headlamp.emissiveIntensity = head ? 3.2 : 0;
    m.lens.opacity = head ? 0.35 : 0.14;
    m.brake.emissiveIntensity = brake ? 3 : 0;
    m.tail.emissiveIntensity = head ? 1.4 : 0.4;
    m.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    m.indicatorL.emissiveIntensity = left ? 4 : 0;
    m.indicatorR.emissiveIntensity = right ? 4 : 0;
    m.lightStrip.emissiveIntensity = interior;
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
  }

  setWiper(angle) {
    for (const w of this.wipers || []) w.pivot.rotation.z = (w.rest || 0) + w.dir * angle;
  }

  /**
   * Door signal lamps. Solaris IV: LEDs beside every door, white when the doors are released, slow red flashing
   * while they move, green when open. Solaris III: a red lamp over each door inside, flashing while the doors
   * move. state: 'off' | 'released' | 'flash' | 'open'.
   */
  setDoorSignal(id, state) {
    const s = this.doorSignals[id];
    if (!s) return;
    const now = performance.now() / 1000;
    let col = null, k = 0;
    if (s.kind === 'led') {
      if (state === 'released') { col = 0xffffff; k = 1.6; }
      else if (state === 'flash') { col = 0xff1a0a; k = Math.sin(now * Math.PI * 1.6) > 0 ? 3 : 0.05; }
      else if (state === 'open') { col = 0x19ff4a; k = 2.4; }
    } else if (s.kind === 'lamp') {
      if (state === 'flash') { col = 0xff1a0a; k = Math.sin(now * Math.PI * 2.2) > 0 ? 3.2 : 0.05; }
    } else if (s.kind === 'white') {
      // Yutong E12: the white lamp over the door, inside and outside, lit from the moment the door starts to open
      // until it is closed again
      if (state === 'flash' || state === 'open') { col = 0xffffff; k = 2.6; }
    }
    if (col != null) s.mat.emissive.setHex(col);
    s.mat.emissiveIntensity = k;
  }

  setDetail(cameraDist) {
    const show = cameraDist < 70;
    if (this.interiorGroups && this.interiorGroups.length && this.interiorGroups[0].visible !== show) for (const g of this.interiorGroups) g.visible = show;
    const trim = cameraDist < 140;
    if (this.smallTrim && this.smallTrim[0] && this.smallTrim[0].visible !== trim) for (const o of this.smallTrim) o.visible = trim;
  }

  afterPose() {
    this.root.updateMatrixWorld(true);
    if (this.bellows) this.updateBellows();
  }

  dispose() {
    disposeModel(this.root, Object.values(this.mats));
  }
}

Object.assign(TrolleyModel.prototype, BodyMixin, EndsMixin, DoorsMixin, InteriorMixin, EbusEndsMixin, EbusBodyMixin, EbusInteriorMixin, EbusMaterialsMixin);

// ------------------------------------------------------------------ textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** The fleet-number plate on the bumper (ref09, ref13: white plate; ref17, ref08: blue plate). */
function makePlate(text, G) {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.fillStyle = G && G.gen === 3 ? '#4aa3d6' : '#f4f6f6';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111';
  g.font = 'bold 46px Arial, "DejaVu Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text), 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Side decal: the fleet number in small black digits (ref02, ref09, ref17, ref18). */
function makeDecals(fleet, G) {
  const c = canvas(512, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#111';
  g.font = `bold ${G.old ? 104 : 96}px Arial, "DejaVu Sans", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(fleet, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Accessibility pictograms in blue circles (Solaris IV) or squares (Solaris III). */
function pictograms(g, x, y, s, round) {
  const icons = ['wheelchair', 'pram', 'person'].slice(0, round ? 3 : 2);
  icons.forEach((ic, i) => {
    const cx = x + i * (s * 1.12) + s / 2, cy = y + s / 2;
    g.fillStyle = '#1f5fb4';
    if (round) { g.beginPath(); g.arc(cx, cy, s / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(cx - s / 2, cy - s / 2, s, s);
    g.strokeStyle = '#ffffff';
    g.fillStyle = '#ffffff';
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.arc(cx, cy - s * 0.26, s * 0.08, 0, Math.PI * 2);
    g.fill();
    if (ic === 'wheelchair') { g.beginPath(); g.arc(cx - s * 0.02, cy + s * 0.12, s * 0.2, 0.3, Math.PI * 2 - 0.6); g.stroke(); g.fillRect(cx - s * 0.05, cy - s * 0.15, s * 0.08, s * 0.25); }
    else if (ic === 'pram') { g.beginPath(); g.arc(cx, cy + s * 0.02, s * 0.18, Math.PI, 0); g.fill(); g.fillRect(cx - s * 0.2, cy + s * 0.02, s * 0.4, s * 0.06); g.beginPath(); g.arc(cx - s * 0.12, cy + s * 0.2, s * 0.06, 0, Math.PI * 2); g.arc(cx + s * 0.12, cy + s * 0.2, s * 0.06, 0, Math.PI * 2); g.fill(); }
    else { g.fillRect(cx - s * 0.08, cy - s * 0.14, s * 0.16, s * 0.3); g.fillRect(cx - s * 0.08, cy + s * 0.14, s * 0.06, s * 0.2); g.fillRect(cx + s * 0.02, cy + s * 0.14, s * 0.06, s * 0.2); }
  });
}

/** The green mascot sticker on the front of the Solaris (a stylised dinosaur, ref02 / ref13 / ref17). */
function mascot(g, x, y, s) {
  g.fillStyle = '#5cc23a';
  g.beginPath();
  g.ellipse(x + s * 0.45, y + s * 0.55, s * 0.3, s * 0.18, -0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(x + s * 0.72, y + s * 0.22, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x + s * 0.62, y + s * 0.25, s * 0.08, s * 0.3);
  g.beginPath();
  g.moveTo(x + s * 0.18, y + s * 0.62); g.lineTo(x - s * 0.05, y + s * 0.85); g.lineTo(x + s * 0.25, y + s * 0.7); g.fill();
}

/**
 * Front decal over the coloured front panel (ref02, ref13, ref17, ref18): pictograms, the fleet number, the
 * manufacturer's round badge and the mascot on the Solaris; the fleet number on the Ikarus. 1024 x 256 = the
 * decal strip's width x height.
 */
function makeFrontDecal(fleet, G) {
  const c = canvas(1024, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  if (G.old) {
    // the fleet number large on the front left (ref18: about 0.45 m wide)
    g.fillStyle = '#111';
    g.font = 'bold 230px Arial, "DejaVu Sans", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(fleet, 330, 136, 560);
  } else {
    pictograms(g, 40, 64, 60, G.gen === 4);
    g.fillStyle = '#111';
    g.font = 'bold 92px Arial, "DejaVu Sans", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(fleet, G.gen === 4 ? 250 : 210, 112);
    // manufacturer's round badge (no lettering)
    const bx = 560, by = 104;
    if (G.gen === 4) {
      g.fillStyle = '#1f6fc0'; g.beginPath(); g.ellipse(bx, by, 62, 30, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d8e8f6'; g.lineWidth = 5; g.beginPath(); g.ellipse(bx, by, 50, 22, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx, by, 14, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#111'; g.beginPath(); g.arc(bx, by - 12, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f0b812'; g.beginPath(); g.arc(bx, by - 12, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.fillRect(bx - 50, by + 24, 100, 12);
    }
    mascot(g, 820, 40, 150);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rear decal: the fleet number (Solaris over the tow-hook cover, Ikarus right of the centre; ref09, ref11). */
function makeRearDecal(fleet, G) {
  const c = canvas(512, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#111';
  g.font = 'bold 100px Arial, "DejaVu Sans", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(fleet, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Yellow-black diagonal hazard stripes. */
function makeHazard() {
  const c = canvas(256, 32), g = c.getContext('2d');
  g.fillStyle = '#f2c21a';
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = '#151515';
  for (let x = -32; x < 288; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Grey speckled vinyl floor with a darker anti-slip pattern. */
function makeFloor(hex) {
  const c = canvas(256, 256), g = c.getContext('2d');
  const base = new THREE.Color(hex);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4200; i++) {
    const k = rnd();
    g.fillStyle = k < 0.5 ? 'rgba(20,22,24,0.35)' : k < 0.85 ? 'rgba(240,240,240,0.35)' : 'rgba(80,110,160,0.35)';
    g.fillRect(rnd() * 256, rnd() * 256, 1.4, 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 12);
  return t;
}

export { cyl };
