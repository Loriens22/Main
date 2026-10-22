// Procedural 3D model of the MAN Lion's City G CNG (A23) articulated bus as
// operated in Sofia, reconstructed from the reference photographs (fleet
// 2319 / 3145 / 3153). Two rigid sections + deforming bellows, steerable
// wheels, four double inward-swinging doors, LED signs, lights, mirrors,
// wipers, full passenger interior and driver's cab.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUS, SEATS, FRONT_Z, AXLE1_Z, HITCH_FRONT_Z, HITCH_REAR_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z, REAR_Z } from './BusSpec.js';
import { LedSign } from './LedSign.js';
import {
  makeLivery, makePlate, makeFrontDecals, makeManGrille, makeLionBadge, makeFloor, makeVentGrille, makeMoquette,
  makePrioritySticker, makeSignSheet,
} from './BusTextures.js';
import { HW, S_REAR_ORIGIN, sToFrontZ, sToRearZ, M, Parts, basis, box, clean, cyl, endOutline, extrude, openBox, outlineCap, outlineStrip, rectPath, rectShape, scaleUV, skirtShape, tube } from './BusGeom.js';
import { InteriorMixin } from './BusInterior.js';


export const FLEET = {
  3145: { plate: 'CB 5696 HM', depot: 'Земляне' },
  3153: { plate: 'CB 5713 HM', depot: 'Земляне' },
  2319: { plate: 'CB 5720 HM', depot: 'Дружба' },
};

export class BusModel {
  constructor({ fleet = '3145', quality = 'high', interior = true } = {}) {
    this.fleet = String(fleet);
    this.plate = (FLEET[this.fleet] || FLEET[3145]).plate;
    this.quality = quality;
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
  }

  makeMaterials() {
    const livery = makeLivery(Number(this.fleet) % 97);
    livery.wrapS = THREE.RepeatWrapping;
    livery.repeat.set(1 / BUS.length, 1 / (BUS.beltY - BUS.skirtY));
    livery.offset.set(0, -BUS.skirtY / (BUS.beltY - BUS.skirtY));
    const P = THREE.MeshPhysicalMaterial;
    const S = THREE.MeshStandardMaterial;
    const floorTex = makeFloor();
    floorTex.repeat.set(0.6, 0.6);
    const vent = makeVentGrille();
    const moq = makeMoquette();
    moq.repeat.set(2.5, 2.5);
    this.mats = {
      paint: new P({ color: 0xf1f2ee, roughness: 0.32, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
      livery: new P({ map: livery, roughness: 0.32, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
      black: new P({ color: 0x0c0d0e, roughness: 0.35, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
      matteBlack: new S({ color: 0x141516, roughness: 0.8, metalness: 0 }),
      underbody: new S({ color: 0x0e0e0e, roughness: 0.95, side: THREE.DoubleSide }),
      rubber: new S({ color: 0x161616, roughness: 0.92 }),
      tyre: new S({ color: 0x1c1c1c, roughness: 0.88 }),
      rim: new S({ color: 0xc4c7c9, roughness: 0.3, metalness: 0.85 }),
      hub: new S({ color: 0x8d9194, roughness: 0.4, metalness: 0.8 }),
      chrome: new S({ color: 0xe6e8ea, roughness: 0.12, metalness: 1 }),
      glass: new P({ color: 0x0f181c, roughness: 0.13, metalness: 0.1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
      windscreen: new P({ color: 0x1d2a30, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8 }),
      lensClear: new P({ color: 0xffffff, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.35, depthWrite: false }),
      headlamp: new S({ color: 0x9aa0a4, roughness: 0.2, metalness: 0.9, emissive: 0xffffff, emissiveIntensity: 0 }),
      indicatorL: new S({ color: 0xc87a10, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xc87a10, roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0.6 }),
      brake: new S({ color: 0x7a0c0c, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
      marker: new S({ color: 0xc87a10, roughness: 0.4, emissive: 0xff8a00, emissiveIntensity: 0.4 }),
      plate: new S({ map: makePlate(this.plate), roughness: 0.5 }),
      decals: new S({ map: makeFrontDecals(this.fleet), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }),
      grille: new S({ map: makeManGrille(), roughness: 0.35, metalness: 0.3 }),
      badge: new S({ map: makeLionBadge(), transparent: true, roughness: 0.2, metalness: 0.8 }),
      mirror: new S({ color: 0x9fb0bd, roughness: 0.12, metalness: 1 }),
      // interior
      floor: new S({ map: floorTex, color: 0xc9d0d8, roughness: 0.85 }),
      wall: new S({ color: 0xd4d7d8, roughness: 0.6 }),
      ceiling: new S({ color: 0xeceeed, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0.06 }),
      vent: new S({ map: vent, roughness: 0.6 }),
      seat: new S({ color: 0x8e9398, roughness: 0.45, metalness: 0.05 }),
      seatDark: new S({ color: 0x6c7176, roughness: 0.7 }),
      moquette: new S({ map: moq, roughness: 0.95 }),
      pole: new S({ color: 0xa9adb0, roughness: 0.32, metalness: 0.75 }),
      yellow: new S({ color: 0xe6b012, roughness: 0.35, metalness: 0.2 }),
      strap: new S({ color: 0x9b9fa3, roughness: 0.5, metalness: 0.4 }),
      plastic: new S({ color: 0x2a2d30, roughness: 0.55 }),
      dash: new S({ color: 0x2b2d2f, roughness: 0.85, envMapIntensity: 0.3 }),
      lightStrip: new S({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 1.2, roughness: 0.4 }),
      stopBtn: new S({ color: 0xc8102e, roughness: 0.4, emissive: 0xff1010, emissiveIntensity: 0 }),
      sticker: new S({ map: makePrioritySticker(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      signs: new S({ map: makeSignSheet(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      bellows: new S({ color: 0x26282a, roughness: 0.9, side: THREE.DoubleSide }),
      turntable: new S({ color: 0x4b5157, roughness: 0.6, metalness: 0.5 }),
      cngPod: new P({ color: 0xeeeeea, roughness: 0.38, clearcoat: 0.5 }),
      led: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    };
  }

  /* ------------------------------------------------------------------ exterior */
  sideBody(parts, section, sStart, sEnd, toZ) {
    const doors = BUS.doors.filter((d) => d.section === section);
    const axleS = section === 'front' ? [BUS.frontOverhang, BUS.frontOverhang + BUS.wb1] : [S_REAR_ORIGIN];
    const doorS = doors.map((d) => [d.z0 - toZ(0), d.z1 - toZ(0)]); // z -> s
    // right side (doors)
    for (const side of [1, -1]) {
      const cuts = side > 0 ? doorS : [];
      const ranges = [];
      let a = sStart;
      for (const [d0, d1] of cuts.sort((p, q) => p[0] - q[0])) {
        if (d0 > a + 0.05) ranges.push([a, d0]);
        a = d1;
      }
      if (sEnd > a + 0.05) ranges.push([a, sEnd]);
      for (const [s0, s1] of ranges) {
        const sh = skirtShape(s0, s1, axleS);
        const g = extrude(sh, 0.035, 0.008);
        const mtx = side > 0
          ? basis([0, 0, 1], [0, 1, 0], [-1, 0, 0], [HW, 0, toZ(0)])
          : basis([0, 0, -1], [0, 1, 0], [1, 0, 0], [-HW, 0, toZ(0) + 0]);
        if (side < 0) {
          // mirrored mapping: shape x = -s
          const sh2 = skirtShape(-s1, -s0, axleS.map((v) => -v));
          parts.add('livery', extrude(sh2, 0.035, 0.008), basis([0, 0, -1], [0, 1, 0], [1, 0, 0], [-HW, 0, toZ(0)]));
        } else parts.add('livery', g, mtx);
        // black rubber lip along the bottom (interrupted by the wheel arches)
        let la = s0;
        for (const ax of [...axleS, 1e9].sort((p, q) => p - q)) {
          const lb = Math.min(s1, ax - 0.5);
          if (lb - la > 0.05) parts.add('rubber', box(0.05, 0.05, lb - la), M(side * (HW - 0.02), BUS.skirtY + 0.02, toZ((la + lb) / 2)));
          la = Math.max(la, ax + 0.5);
          if (la >= s1) break;
        }
      }
      // window band: pillars + panes
      this.windowBand(parts, side, sStart, sEnd, side > 0 ? doorS : [], toZ, section);
      // upper white band
      parts.add('paint', box(0.04, 0.2, sEnd - sStart), M(side * (HW - 0.02), BUS.windowTopY + 0.1, toZ((sStart + sEnd) / 2)));
      // side marker lights
      for (let s = sStart + 1.2; s < sEnd - 0.6; s += 3.1) parts.add('marker', box(0.02, 0.05, 0.12), M(side * (HW + 0.005), 0.42, toZ(s)));
    }
    // wheel arch liners (hide the interior from outside)
    for (const as of axleS) {
      for (const side of [1, -1]) {
        const liner = new THREE.CylinderGeometry(0.56, 0.56, 0.46, 20, 1, true, 0, Math.PI);
        liner.rotateZ(Math.PI / 2);
        parts.add('underbody', liner, M(side * (HW - 0.25), BUS.wheelR, toZ(as)));
        const disc = new THREE.CircleGeometry(0.56, 20, 0, Math.PI);
        disc.rotateY(Math.PI / 2);
        disc.rotateX(0);
        parts.add('underbody', disc, M(side * (HW - 0.47), BUS.wheelR, toZ(as)));
      }
    }
    // underbody / floor pan
    parts.add('underbody', box(1.7, 0.12, sEnd - sStart - 0.2), M(0, BUS.skirtY + 0.06, toZ((sStart + sEnd) / 2)));
  }

  windowBand(parts, side, sStart, sEnd, doorS, toZ, section) {
    const y0 = BUS.beltY, y1 = BUS.windowTopY;
    // continuous black frame rails
    for (const [ya, yb] of [[y0, y0 + 0.06], [y1 - 0.07, y1]]) {
      let a = sStart;
      const segs = [];
      for (const [d0, d1] of [...doorS].sort((p, q) => p[0] - q[0])) {
        segs.push([a, d0]);
        a = d1;
      }
      segs.push([a, sEnd]);
      for (const [s0, s1] of segs) if (s1 - s0 > 0.02) parts.add('black', box(0.05, yb - ya, s1 - s0), M(side * (HW - 0.025), (ya + yb) / 2, toZ((s0 + s1) / 2)));
    }
    // door heads above the door openings (black)
    for (const [d0, d1] of doorS) parts.add('black', box(0.05, 0.08, d1 - d0), M(side * (HW - 0.025), y1 - 0.04, toZ((d0 + d1) / 2)));
    // panes
    let a = sStart;
    const ranges = [];
    for (const [d0, d1] of [...doorS].sort((p, q) => p[0] - q[0])) {
      ranges.push([a, d0]);
      a = d1;
    }
    ranges.push([a, sEnd]);
    let paneIdx = 0;
    for (const [r0, r1] of ranges) {
      const L = r1 - r0;
      if (L < 0.15) {
        parts.add('black', box(0.05, y1 - y0, L), M(side * (HW - 0.025), (y0 + y1) / 2, toZ((r0 + r1) / 2)));
        continue;
      }
      const n = Math.max(1, Math.round(L / 1.38));
      const w = L / n;
      for (let i = 0; i <= n; i++) {
        const s = r0 + i * w;
        parts.add('black', box(0.06, y1 - y0, 0.09), M(side * (HW - 0.03), (y0 + y1) / 2, toZ(Math.min(r1 - 0.045, Math.max(r0 + 0.045, s)))));
      }
      for (let i = 0; i < n; i++) {
        const s0 = r0 + i * w + 0.045, s1 = r0 + (i + 1) * w - 0.045;
        const pane = new THREE.PlaneGeometry(s1 - s0, y1 - y0 - 0.13);
        pane.rotateY(side * Math.PI / 2);
        parts.add('glass', pane, M(side * (HW - 0.015), (y0 + y1) / 2, toZ((s0 + s1) / 2)));
        // hopper (top-hinged ventilation window) on alternate panes
        if (paneIdx++ % 2 === 1) parts.add('black', box(0.03, 0.035, s1 - s0), M(side * (HW - 0.012), y1 - 0.38, toZ((s0 + s1) / 2)));
      }
    }
    void section;
  }

  roof(parts, sStart, sEnd, toZ, podRanges) {
    // cross-section of the upper body, extruded along the length
    const sh = new THREE.Shape();
    const yb = BUS.windowTopY + 0.2;
    sh.moveTo(HW, yb);
    sh.lineTo(HW, 2.74);
    sh.quadraticCurveTo(HW, BUS.roofY, HW - 0.22, BUS.roofY);
    sh.lineTo(-HW + 0.22, BUS.roofY);
    sh.quadraticCurveTo(-HW, BUS.roofY, -HW, 2.74);
    sh.lineTo(-HW, yb);
    sh.lineTo(-HW + 0.05, yb);
    sh.lineTo(-HW + 0.05, yb + 0.06);
    sh.lineTo(HW - 0.05, yb + 0.06);
    sh.lineTo(HW - 0.05, yb);
    sh.closePath();
    const L = sEnd - sStart;
    const g = extrude(sh, L, 0);
    parts.add('paint', g, M(0, 0, toZ(sStart)));
    // CNG cylinder housings (front section: long pod; rear section: shorter pod)
    for (const [p0, p1] of podRanges) {
      const len = p1 - p0;
      const pod = new RoundedBoxGeometry(2.24, BUS.podY - BUS.roofY + 0.06, len, 4, 0.18);
      parts.add('cngPod', pod, M(0, (BUS.podY + BUS.roofY - 0.06) / 2, toZ((p0 + p1) / 2)));
      // ribbed access panel seams
      for (let s = p0 + 1.0; s < p1 - 0.5; s += 1.15) parts.add('matteBlack', box(1.7, 0.012, 0.02), M(0, BUS.podY + 0.001, toZ(s)));
    }
  }

  buildFront() {
    const parts = new Parts();
    const toZ = sToFrontZ;
    const sEnd = FRONT_BODY_END_Z - FRONT_Z; // 9.105
    const r = 0.24;
    this.sideBody(parts, 'front', r, sEnd, toZ);
    this.roof(parts, r, sEnd, toZ, [[1.2, 7.85]]);
    // ---- front end
    const ol = endOutline(r);
    const zf = FRONT_Z;
    parts.add('paint', outlineStrip(ol, zf, -1, BUS.skirtY, 0.8), null); // white lower front
    parts.add('black', outlineStrip(ol, zf, -1, 0.8, 0.97), null); // black band below windscreen
    parts.add('windscreen', outlineStrip(ol.map(([x, dz]) => [x * 0.995, dz + 0.01]), zf, -1, 0.97, BUS.windowTopY, 0.07), null);
    parts.add('black', outlineStrip(ol, zf + 0.06, -1, BUS.windowTopY, 2.86), null); // destination band
    parts.add('paint', outlineStrip(ol.map(([x, dz]) => [x, dz + 0.06]), zf, -1, 2.86, BUS.roofY - 0.04), null);
    parts.add('paint', outlineCap(ol.map(([x, dz]) => [x, dz + 0.06]), zf, -1, BUS.roofY - 0.04, true, 0.4), null);
    // A-pillars (thin black) where screen meets side glass
    for (const side of [1, -1]) parts.add('black', box(0.05, BUS.windowTopY - 0.97, 0.06), M(side * (HW - 0.02), (0.97 + BUS.windowTopY) / 2, zf + r + 0.02));
    // bumper lip + towing eye cover
    parts.add('rubber', box(2.3, 0.08, 0.12, 0.03), M(0, BUS.skirtY + 0.02, zf + 0.12));
    // grille (MAN lettering) and badge
    const grille = new THREE.PlaneGeometry(1.05, 0.3);
    grille.rotateY(Math.PI);
    parts.add('grille', grille, M(0, 0.62, zf - 0.006));
    const badge = new THREE.PlaneGeometry(0.3, 0.12);
    badge.rotateY(Math.PI);
    parts.add('badge', badge, M(0, 0.885, zf - 0.008));
    // headlamp clusters: angular housings with lens and reflectors
    for (const side of [1, -1]) {
      const shp = new THREE.Shape();
      // trapezoid with slanted inner edge (seen from the front)
      shp.moveTo(0.0, 0.0); shp.lineTo(0.5, 0.0); shp.lineTo(0.38, 0.16); shp.lineTo(0.0, 0.16); shp.closePath();
      const hg = extrude(shp, 0.03, 0.006);
      // shape x runs from the outer corner towards the centre; slanted inner edge
      const mx = side > 0 ? basis([-1, 0, 0], [0, 1, 0], [0, 0, -1], [1.12, 0.47, zf + 0.01]) : basis([1, 0, 0], [0, 1, 0], [0, 0, 1], [-1.12, 0.47, zf - 0.02]);
      parts.add('matteBlack', hg, mx);
      for (const [dx, rr] of [[0.15, 0.055], [0.3, 0.05]]) {
        const c = new THREE.CircleGeometry(rr, 20);
        c.rotateY(Math.PI);
        parts.add('headlamp', c, M(side * (1.12 - dx - 0.07), 0.55, zf - 0.03));
      }
      // indicator at the outer corner
      parts.add('indicator' + (side > 0 ? 'R' : 'L'), box(0.1, 0.06, 0.03), M(side * 1.06, 0.4, zf + 0.02));
      // fog lamp
      const fl = new THREE.CircleGeometry(0.04, 16);
      fl.rotateY(Math.PI);
      parts.add('headlamp', fl, M(side * 0.78, 0.36, zf - 0.005));
    }
    // registration plate & front decals
    const plate = new THREE.PlaneGeometry(0.52, 0.112);
    plate.rotateY(Math.PI);
    parts.add('plate', plate, M(0, 0.4, zf - 0.008));
    const dec = new THREE.PlaneGeometry(1.0, 0.25);
    dec.rotateY(Math.PI);
    parts.add('decals', dec, M(0.66, 0.76, zf - 0.009));
    const cng = new THREE.PlaneGeometry(0.16, 0.16);
    cng.rotateY(Math.PI);
    // reuse the CNG diamond from the decal sheet via UV crop
    const uvs = cng.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, 0.82 + uvs.getX(i) * 0.16, uvs.getY(i) * 0.9 + 0.05);
    parts.add('decals', cng, M(-0.32, 0.9, zf - 0.009));
    // mirrors ("ram's horn" arms projecting forward from the roof corners)
    for (const side of [1, -1]) {
      const x0 = side * (HW - 0.12);
      parts.add('black', tube([[x0, 2.78, zf + 0.25], [x0 + side * 0.06, 2.86, zf - 0.15], [x0 + side * 0.05, 2.7, zf - 0.48], [x0 + side * 0.02, 2.45, zf - 0.55]], 0.035, 24, 10));
      const head = new THREE.SphereGeometry(0.16, 20, 14);
      head.scale(0.75, 1.55, 0.55);
      parts.add('black', head, M(x0 + side * 0.02, 2.2, zf - 0.56));
      const glass = new THREE.CircleGeometry(0.12, 18);
      glass.scale(0.85, 1.7, 1);
      parts.add('mirror', glass, M(x0 + side * 0.02, 2.2, zf - 0.47));
    }
    // front wheels on steering knuckles
    this.addAxle(this.front, AXLE1_Z, false, true);
    this.addAxle(this.front, 0, false, false);
    // doors 1 & 2
    for (const d of BUS.doors.filter((q) => q.section === 'front')) this.addDoor(this.front, d);
    // wipers
    this.wipers = [];
    for (const side of [1, -1]) {
      const piv = new THREE.Group();
      piv.position.set(side > 0 ? 0.95 : -0.2, 1.0, zf - 0.03);
      const arm = new THREE.Mesh(box(0.025, 0.95, 0.02), this.mats.matteBlack);
      arm.position.set(0, 0.47, 0);
      piv.add(arm);
      piv.rotation.z = 1.5;
      piv.userData.side = side;
      this.front.add(piv);
      this.wipers.push(piv);
    }
    // bellows-end frame (front section rear face)
    const outer = rectShape(-HW, BUS.skirtY, HW, BUS.roofY, 0.22);
    outer.holes.push(rectPath(-1.05, BUS.floorY, 1.05, 2.5, 0.12));
    parts.add('matteBlack', extrude(outer, 0.06, 0), M(0, 0, FRONT_BODY_END_Z - 0.06));
    const grp = parts.build(this.mats);
    this.front.add(grp);
    this.frontExterior = grp;
  }

  buildRear() {
    const parts = new Parts();
    const toZ = sToRearZ;
    const sStart = REAR_BODY_START_Z + S_REAR_ORIGIN; // 9.905
    const r = 0.22;
    const sEnd = BUS.length - r;
    this.sideBody(parts, 'rear', sStart, sEnd, toZ);
    this.roof(parts, sStart, sEnd, toZ, [[sStart + 0.3, sStart + 4.2]]);
    // rear roof: engine air intake & AC unit
    parts.add('cngPod', new RoundedBoxGeometry(1.6, 0.26, 1.4, 3, 0.1), M(0, BUS.roofY + 0.1, toZ(sEnd - 1.4)));
    parts.add('matteBlack', box(1.3, 0.02, 1.0), M(0, BUS.roofY + 0.235, toZ(sEnd - 1.4)));
    // ---- rear end
    const ol = endOutline(r);
    const zr = REAR_Z;
    // reverse outline orientation for the rear (+z)
    parts.add('paint', outlineStrip(ol, zr, 1, BUS.skirtY, 1.18), null);
    parts.add('glass', outlineStrip(ol.map(([x, dz]) => [x, dz + 0.01]), zr, 1, 1.18, 2.5), null);
    parts.add('black', outlineStrip(ol.map(([x, dz]) => [x, dz + 0.03]), zr, 1, 1.2, 2.5), null);
    parts.add('paint', outlineStrip(ol, zr, 1, 2.5, BUS.roofY - 0.04), null);
    parts.add('paint', outlineCap(ol, zr, 1, BUS.roofY - 0.04, true, 0.4), null);
    // engine louvres
    for (let y = 0.55; y < 1.05; y += 0.07) parts.add('matteBlack', box(1.3, 0.025, 0.02), M(0, y, zr + 0.002));
    // tail light clusters (vertical, at the corners)
    for (const side of [1, -1]) {
      parts.add('tail', box(0.14, 0.42, 0.04, 0.02), M(side * (HW - 0.12), 0.95, zr - 0.03));
      parts.add('brake', box(0.14, 0.14, 0.045, 0.02), M(side * (HW - 0.12), 0.66, zr - 0.03));
      parts.add('indicator' + (side > 0 ? 'R' : 'L'), box(0.14, 0.12, 0.045, 0.02), M(side * (HW - 0.12), 1.24, zr - 0.03));
      parts.add('reverse', box(0.14, 0.08, 0.045, 0.02), M(side * (HW - 0.12), 0.5, zr - 0.03));
    }
    parts.add('brake', box(0.6, 0.04, 0.03), M(0, 2.53, zr - 0.02)); // high level brake light
    const plate = new THREE.PlaneGeometry(0.52, 0.112);
    parts.add('plate', plate, M(0, 0.42, zr + 0.005));
    parts.add('rubber', box(2.3, 0.1, 0.12, 0.03), M(0, BUS.skirtY + 0.03, zr - 0.08));
    // bellows-end frame (rear section front face)
    const outer = rectShape(-HW, BUS.skirtY, HW, BUS.roofY, 0.22);
    outer.holes.push(rectPath(-1.05, BUS.floorY, 1.05, 2.5, 0.12));
    parts.add('matteBlack', extrude(outer, 0.06, 0), M(0, 0, REAR_BODY_START_Z));
    // rear axle (driven, twin tyres)
    this.addAxle(this.rear, 0, true, false);
    for (const d of BUS.doors.filter((q) => q.section === 'rear')) this.addDoor(this.rear, d);
    const grp = parts.build(this.mats);
    this.rear.add(grp);
    this.rearExterior = grp;
  }

  makeWheel(twin) {
    const g = new THREE.Group();
    // tyre profile (lathe around the axle)
    const prof = [];
    const R = BUS.wheelR, W = BUS.tyreW, rimR = 0.29;
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      prof.push(new THREE.Vector2(rimR + (R - rimR) * (0.55 + 0.45 * Math.cos(a)) + 0.02 * Math.cos(a) * Math.cos(a), (W / 2) * Math.sin(a)));
    }
    const tyreG = new THREE.LatheGeometry(prof, 36);
    tyreG.rotateZ(Math.PI / 2);
    const rimG = new THREE.CylinderGeometry(rimR, rimR, W * 0.92, 28, 1, true);
    rimG.rotateZ(Math.PI / 2);
    const disc = new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 28);
    disc.rotateZ(Math.PI / 2);
    const tyre = new THREE.Mesh(tyreG, this.mats.tyre);
    tyre.castShadow = true;
    g.add(tyre);
    g.add(new THREE.Mesh(rimG, this.mats.rim));
    const d = new THREE.Mesh(disc, this.mats.rim);
    d.position.x = twin ? -0.06 : 0.05;
    g.add(d);
    // hub + 10 studs + hand-holes
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 20).rotateZ(Math.PI / 2), this.mats.hub);
    hub.position.x = d.position.x + 0.04;
    g.add(hub);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6).rotateZ(Math.PI / 2), this.mats.chrome);
      stud.position.set(d.position.x + 0.03, Math.cos(a) * 0.165, Math.sin(a) * 0.165);
      g.add(stud);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10).rotateY(Math.PI / 2), this.mats.matteBlack);
      hole.position.set(d.position.x + 0.012, Math.cos(a) * 0.235, Math.sin(a) * 0.235);
      g.add(hole);
    }
    if (twin) {
      const inner = new THREE.Mesh(tyreG, this.mats.tyre);
      inner.position.x = -W - 0.03;
      g.add(inner);
    }
    return g;
  }

  addAxle(section, z, twin, steer) {
    for (const side of [1, -1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set(side * (BUS.track / 2 + (twin ? 0.08 : 0)), BUS.wheelR, z);
      const spin = new THREE.Group();
      const w = this.makeWheel(twin);
      if (side < 0) w.rotation.y = Math.PI; // outer face outwards
      spin.add(w);
      knuckle.add(spin);
      section.add(knuckle);
      this.wheels.push({ knuckle, spin, steer, side, section: section === this.front ? 'front' : 'rear', z });
    }
  }

  addDoor(section, d) {
    // portal frame
    const parts = new Parts();
    const zMid = (d.z0 + d.z1) / 2;
    const w = d.z1 - d.z0;
    const top = BUS.windowTopY - 0.08;
    parts.add('black', box(0.08, top - BUS.floorY + 0.02, 0.06), M(HW - 0.04, (top + BUS.floorY) / 2, d.z0 - 0.03));
    parts.add('black', box(0.08, top - BUS.floorY + 0.02, 0.06), M(HW - 0.04, (top + BUS.floorY) / 2, d.z1 + 0.03));
    // step/threshold with yellow edge
    parts.add('rubber', box(0.3, 0.05, w), M(HW - 0.15, BUS.floorY - 0.03, zMid));
    parts.add('yellow', box(0.05, 0.052, w), M(HW - 0.03, BUS.floorY - 0.025, zMid));
    section.add(parts.build(this.mats));
    // two leaves, inward-swinging, hinged at the portal edges
    const leafW = w / 2 - 0.01;
    const leaves = [];
    for (const end of [-1, 1]) {
      const hingeZ = end < 0 ? d.z0 : d.z1;
      const pivot = new THREE.Group();
      pivot.position.set(HW - 0.05, 0, hingeZ);
      const lp = new Parts();
      const h = top - BUS.floorY - 0.04;
      const cz = -end * (leafW / 2);
      // aluminium frame (black) with large glazing and a horizontal mid rail
      const frame = rectShape(-leafW / 2, 0, leafW / 2, h, 0.03);
      frame.holes.push(rectPath(-leafW / 2 + 0.07, 0.12, leafW / 2 - 0.07, h * 0.47 - 0.02, 0.02));
      frame.holes.push(rectPath(-leafW / 2 + 0.07, h * 0.47 + 0.05, leafW / 2 - 0.07, h - 0.08, 0.02));
      lp.add('black', extrude(frame, 0.035, 0.006), basis([0, 0, -end], [0, 1, 0], [end, 0, 0], [end > 0 ? -0.035 : 0, BUS.floorY + 0.02, cz]));
      const g1 = new THREE.PlaneGeometry(leafW - 0.14, h * 0.47 - 0.14);
      g1.rotateY(Math.PI / 2);
      lp.add('glass', g1, M(-0.015, BUS.floorY + 0.02 + (0.12 + h * 0.47 - 0.02) / 2, cz));
      const g2 = new THREE.PlaneGeometry(leafW - 0.14, h * 0.53 - 0.13);
      g2.rotateY(Math.PI / 2);
      lp.add('glass', g2, M(-0.015, BUS.floorY + 0.02 + (h * 0.47 + 0.05 + h - 0.08) / 2, cz));
      // rubber sealing edge at the meeting stile
      lp.add('rubber', box(0.045, h, 0.03), M(-0.015, BUS.floorY + 0.02 + h / 2, -end * (leafW - 0.012)));
      // inner yellow grab handle
      lp.add('yellow', cyl(0.016, 0.9, 10), M(-0.09, 1.25, cz));
      pivot.add(lp.build(this.mats));
      section.add(pivot);
      leaves.push({ pivot, end });
    }
    this.doorLeaves[d.id] = leaves;
  }

  buildBellows() {
    // accordion bellows connecting the two sections; vertices updated each frame
    const folds = 14;
    const ring = [];
    const W2 = HW - 0.06, y0 = BUS.skirtY + 0.12, y1 = BUS.roofY - 0.06, rr = 0.24;
    // rounded-rectangle cross-section (x, y)
    const segs = 6;
    const add = (x, y) => ring.push([x, y]);
    add(W2, y0);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * (Math.PI / 2);
      add(W2 - rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr);
    }
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI / 2 + (i / segs) * (Math.PI / 2);
      add(-W2 + rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr);
    }
    add(-W2, y0);
    this.bellowsRing = ring;
    this.bellowsRings = folds * 2 + 1;
    const n = ring.length;
    const pos = new Float32Array(this.bellowsRings * n * 3);
    const idx = [];
    for (let k = 0; k < this.bellowsRings - 1; k++)
      for (let i = 0; i < n - 1; i++) {
        const a = k * n + i, b = k * n + i + 1, c = (k + 1) * n + i, d = (k + 1) * n + i + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.bellows = new THREE.Mesh(g, this.mats.bellows);
    this.bellows.frustumCulled = false;
    this.bellows.castShadow = true;
    this.front.add(this.bellows);
    // turntable floor plate (rotates with the rear section)
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.03, 40), this.mats.turntable);
    tt.position.set(0, BUS.floorY + 0.015, HITCH_FRONT_Z);
    this.front.add(tt);
    this.turntable = tt;
    this._tmpM = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();
  }

  /** Recompute bellows vertices from the current relative pose of the rear section. */
  updateBellows() {
    const inv = this._tmpM.copy(this.front.matrixWorld).invert();
    const rel = inv.multiply(this.rear.matrixWorld); // rear local -> front local
    const pos = this.bellows.geometry.attributes.position;
    const n = this.bellowsRing.length;
    const e = (this._euler = this._euler || new THREE.Euler()).setFromRotationMatrix(rel, 'YXZ');
    const phi = e.y;
    const lzF = FRONT_BODY_END_Z - HITCH_FRONT_Z; // -0.4
    const lzR = REAR_BODY_START_Z - HITCH_REAR_Z; // +0.4
    const B = this._tmpV;
    const yBase = BUS.skirtY + 0.12;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.bellowsRing[i];
      // exact rear-face point in front coordinates and the rigid prediction at t = 1
      B.set(x, y, REAR_BODY_START_Z).applyMatrix4(rel);
      const c1 = Math.cos(phi), s1 = Math.sin(phi);
      const ex = B.x - (x * c1 + lzR * s1), ey = B.y - y, ez = B.z - (HITCH_FRONT_Z - x * s1 + lzR * c1);
      for (let k = 0; k < this.bellowsRings; k++) {
        const t = k / (this.bellowsRings - 1);
        const fold = k % 2 === 1 && k < this.bellowsRings - 1 ? 0.955 : 1.0;
        const xf = x * fold, yf = yBase + (y - yBase) * (fold < 1 ? 0.985 : 1);
        const lz = lzF + (lzR - lzF) * t;
        const ang = phi * t;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        pos.setXYZ(k * n + i, xf * ca + lz * sa + ex * t, yf + ey * t, HITCH_FRONT_Z - xf * sa + lz * ca + ez * t);
      }
    }
    pos.needsUpdate = true;
    this.bellows.geometry.computeVertexNormals();
    this.turntable.rotation.y = phi;
  }

  buildSigns() {
    // front destination sign behind the top of the windscreen
    const front = new LedSign(160, 19, 8);
    this.signs.front = front;
    const fm = new THREE.MeshBasicMaterial({ map: front.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    const fmesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.23), fm);
    fmesh.rotation.y = Math.PI;
    fmesh.position.set(0, 2.7, FRONT_Z + 0.08);
    this.front.add(fmesh);
    // side sign above door 1 (inside the first window)
    const side = new LedSign(128, 16, 8);
    this.signs.side = side;
    const smat = new THREE.MeshBasicMaterial({ map: side.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    const smesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.15), smat);
    smesh.rotation.y = Math.PI / 2;
    smesh.position.set(HW - 0.04, 2.38, -5.5);
    this.front.add(smesh);
    // rear route number
    const rear = new LedSign(40, 16, 8);
    this.signs.rear = rear;
    const rmat = new THREE.MeshBasicMaterial({ map: rear.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    const rmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.18), rmat);
    rmesh.position.set(0.4, 2.36, REAR_Z - 0.06);
    this.rear.add(rmesh);
    // interior next-stop display (two faces: towards the passengers)
    const inner = new LedSign(192, 16, 6);
    this.signs.interior = inner;
    const imat = new THREE.MeshBasicMaterial({ map: inner.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) });
    const imesh = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.15), imat);
    imesh.position.set(0, 2.3, FRONT_Z + 2.05);
    this.front.add(imesh);
    // rear section interior display
    const imesh2 = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.15), imat);
    imesh2.position.set(0, 2.3, REAR_BODY_START_Z + 0.5);
    this.rear.add(imesh2);
    const box2 = new THREE.Mesh(box(1.1, 0.2, 0.08, 0.02), this.mats.plastic);
    box2.position.set(0, 2.3, REAR_BODY_START_Z + 0.45);
    this.rear.add(box2);
  }

  /** Destination: number + text; also updates side & rear signs. */
  setDestination(number, text) {
    this.signs.front.showRoute(number, text);
    this.signs.side.showRoute(number, text);
    this.signs.rear.showText(number || '', 16);
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

  setWiper(angle) {
    if (!this.wipers) return;
    for (const w of this.wipers) w.rotation.z = 1.5 - angle;
  }

  /** The passenger interior is only seen through the windows: skip it from afar. */
  setDetail(cameraDist) {
    const show = cameraDist < 70;
    if (this.interiorGroups && this.interiorGroups[0].visible !== show) for (const g of this.interiorGroups) g.visible = show;
  }

  /** Free GPU resources; every bus owns its geometry, materials and textures. */
  dispose() {
    const mats = new Set(), texs = new Set();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    });
    for (const m of [...mats, ...Object.values(this.mats)]) {
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
      m.dispose();
    }
    for (const t of texs) t.dispose();
  }

  /** Ensures world matrices are up to date, then rebuilds the bellows. */
  afterPose() {
    this.root.updateMatrixWorld(true);
    this.updateBellows();
  }
}

// passenger interior, seats, poles and the driver's cab live in BusInterior.js
Object.assign(BusModel.prototype, InteriorMixin);

export { HITCH_FRONT_Z, HITCH_REAR_Z };
