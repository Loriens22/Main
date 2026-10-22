// Passenger interior and driver's cab of the MAN Lion's City G CNG: floor,
// walls, ceiling, seats, poles and rails, displays, validators, cab. Mixed
// into BusModel (see the end of BusModel.js); `this` is the BusModel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BUS, FRONT_Z, AXLE1_Z, HITCH_FRONT_Z, HITCH_REAR_Z, FRONT_BODY_END_Z, REAR_BODY_START_Z, REAR_Z } from './BusSpec.js';
import { SEATS } from './BusLayout.js';
import { makeFloor, makeVentGrille, makeMoquette, makePrioritySticker, makeSignSheet } from './BusTextures.js';
import { HW, S_REAR_ORIGIN, sToFrontZ, sToRearZ, M, Parts, basis, box, clean, cyl, endOutline, extrude, openBox, outlineCap, outlineStrip, rectPath, rectShape, scaleUV, skirtShape, tube } from './BusGeom.js';

export const InteriorMixin = {
  /* ------------------------------------------------------------------ interior */
  buildInterior() {
    const fp = new Parts();
    const rp = new Parts();
    const fy = BUS.floorY;
    // floors
    const ff = new THREE.PlaneGeometry(2.44, FRONT_BODY_END_Z - (FRONT_Z + 0.3));
    ff.rotateX(-Math.PI / 2);
    scaleUV(ff, 2.44, FRONT_BODY_END_Z - FRONT_Z);
    fp.add('floor', ff, M(0, fy, (FRONT_BODY_END_Z + FRONT_Z + 0.3) / 2));
    const rf = new THREE.PlaneGeometry(2.44, -0.75 - REAR_BODY_START_Z);
    rf.rotateX(-Math.PI / 2);
    scaleUV(rf, 2.44, 4);
    rp.add('floor', rf, M(0, fy, (REAR_BODY_START_Z - 0.75) / 2));
    // rear raised platform with steps (yellow nosing)
    for (const [z0, z1, y] of [[-0.75, -0.45, fy + 0.2], [-0.45, REAR_Z - 0.15, fy + 0.46]]) {
      rp.add('floor', box(2.44, 0.02, z1 - z0), M(0, y, (z0 + z1) / 2));
      rp.add('wall', box(2.44, y - fy, 0.02), M(0, (y + fy) / 2, z0));
      rp.add('yellow', box(2.0, 0.03, 0.05), M(0, y + 0.005, z0 + 0.025));
    }
    // wheel arch boxes (seat platforms)
    for (const side of [1, -1]) {
      // wheel housings: open towards the body side and the floor so the wheels show through the arches
      const outer = side > 0 ? 0 : 1;
      fp.add('wall', openBox(0.5, 0.7, 1.3, [outer, 3]), M(side * 0.97, fy + 0.35, AXLE1_Z));
      fp.add('wall', openBox(0.5, 0.62, 1.3, [outer, 3]), M(side * 0.97, fy + 0.31, 0.15));
      rp.add('wall', openBox(0.5, 0.5, 1.3, [outer, 3]), M(side * 0.97, fy + 0.25 + 0.46, 0));
    }
    // side wall panels below the windows
    for (const side of [1, -1]) {
      for (const [parts, z0, z1, doors] of [[fp, FRONT_Z + 1.4, FRONT_BODY_END_Z, BUS.doors.filter((d) => d.section === 'front')], [rp, REAR_BODY_START_Z, REAR_Z - 0.2, BUS.doors.filter((d) => d.section === 'rear')]]) {
        // interior wall below the windows, interrupted by doors and wheel housings
        const cuts = [];
        if (side > 0) for (const d of doors) cuts.push([d.z0, d.z1]);
        for (const az of parts === fp ? [AXLE1_Z, 0] : [0]) cuts.push([az - 0.62, az + 0.62]);
        cuts.sort((p, q) => p[0] - q[0]);
        let a = z0;
        const segs = [];
        for (const [c0, c1] of cuts) { if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
        segs.push([a, z1]);
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.05) continue;
          parts.add('wall', box(0.03, BUS.beltY - fy, s1 - s0), M(side * (HW - 0.07), (BUS.beltY + fy) / 2, (s0 + s1) / 2));
          parts.add('black', box(0.06, 0.04, s1 - s0), M(side * (HW - 0.08), BUS.beltY + 0.02, (s0 + s1) / 2)); // window sill
        }
      }
    }
    // ceilings: flat centre + curved side ducts with vent grilles + light strips
    for (const [parts, z0, z1] of [[fp, FRONT_Z + 1.5, FRONT_BODY_END_Z], [rp, REAR_BODY_START_Z, REAR_Z - 0.1]]) {
      const L = z1 - z0, zc = (z0 + z1) / 2;
      parts.add('ceiling', box(1.5, 0.03, L), M(0, 2.48, zc));
      for (const side of [1, -1]) {
        const duct = new THREE.Shape();
        duct.moveTo(0, 0); duct.lineTo(0.48, 0); duct.quadraticCurveTo(0.48, -0.26, 0.0, -0.3); duct.closePath();
        const dg = extrude(duct, L, 0);
        parts.add('ceiling', dg, side > 0 ? basis([-1, 0, 0], [0, 1, 0], [0, 0, -1], [HW - 0.05, 2.47, z1]) : basis([1, 0, 0], [0, 1, 0], [0, 0, 1], [-(HW - 0.05), 2.47, z0]));
        const vg = new THREE.PlaneGeometry(0.3, L);
        vg.rotateX(Math.PI / 2);
        vg.rotateZ(side * 0.5);
        scaleUV(vg, 0.3 * 4, L * 4);
        parts.add('vent', vg, M(side * (HW - 0.3), 2.29, zc));
        parts.add('lightStrip', box(0.08, 0.02, L - 0.4), M(side * 0.72, 2.455, zc));
      }
    }
    // seats
    const seatGeo = this.seatGeometry();
    for (const s of SEATS) {
      const parts = s.sec === 'front' ? fp : rp;
      const base = s.fy;
      const m = new THREE.Matrix4().makeRotationY(s.yaw).setPosition(s.x, base, s.z);
      parts.add('seat', seatGeo.shell, m);
      parts.add(s.ins ? 'moquette' : 'seatDark', seatGeo.cushion, m);
      const overArch = (s.sec === 'front' ? [AXLE1_Z, 0] : [0]).some((az) => Math.abs(s.z - az) < 0.72) && Math.abs(s.x) > 0.7;
      if (base - fy > 0.05 && !overArch) parts.add('wall', box(0.46, base - fy, 0.5), M(s.x, (base + fy) / 2, s.z));
      else parts.add('pole', cyl(0.025, 0.3), new THREE.Matrix4().makeTranslation(s.x, fy + 0.15, s.z));
    }
    // priority stickers on the first seat backs
    const st = new THREE.PlaneGeometry(0.11, 0.165);
    fp.add('sticker', st, M(-0.5, BUS.floorY + 0.95 + 0.36, -3.75 - 0.32));
    // poles & rails
    this.poles(fp, 'front');
    this.poles(rp, 'rear');
    // interior LED next-stop display hanging behind the cab
    const f = fp.build(this.mats, { castShadow: false });
    const r = rp.build(this.mats, { castShadow: false });
    this.front.add(f);
    this.rear.add(r);
    this.interiorGroups = [f, r];
  },

  seatGeometry() {
    if (this._seat) return this._seat;
    // hard-shell seat: seat pan + backrest with an integrated grab-handle opening
    const backShape = rectShape(-0.215, 0, 0.215, 0.74, 0.08);
    backShape.holes.push(rectPath(-0.09, 0.62, 0.09, 0.69, 0.03));
    const back = extrude(backShape, 0.035, 0.01);
    back.rotateX(-0.2);
    back.translate(0, 0.45, 0.2);
    const pan = new RoundedBoxGeometry(0.44, 0.06, 0.42, 2, 0.025);
    pan.translate(0, 0.43, 0.0);
    const flat = (g) => (g.index ? g.toNonIndexed() : g);
    const shell = mergeGeometries([back, pan].map(flat).map(clean));
    const cushionB = new RoundedBoxGeometry(0.36, 0.42, 0.025, 2, 0.01);
    cushionB.rotateX(-0.2);
    cushionB.translate(0, 0.74, 0.175);
    const cushionS = new RoundedBoxGeometry(0.38, 0.02, 0.34, 2, 0.008);
    cushionS.translate(0, 0.47, -0.02);
    const cushion = mergeGeometries([cushionB, cushionS].map(flat).map(clean));
    this._seat = { shell, cushion };
    return shell && this._seat;
  },

  poles(parts, sec) {
    const fy = BUS.floorY;
    const top = 2.4;
    const isF = sec === 'front';
    const z0 = isF ? -5.6 : REAR_BODY_START_Z + 0.4;
    const z1 = isF ? FRONT_BODY_END_Z - 0.3 : REAR_Z - 0.6;
    // overhead longitudinal rails both sides
    for (const side of [1, -1]) {
      parts.add('pole', tube([[side * 0.62, 2.05, z0], [side * 0.62, 2.05, z1]], 0.016, 2, 8));
      for (let z = z0 + 0.2; z < z1 - 0.1; z += 1.6) parts.add('pole', cyl(0.012, 2.47 - 2.05, 8), M(side * 0.62, (2.05 + 2.47) / 2, z));
      // hanging grab straps
      for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.55) {
        const loop = new THREE.TorusGeometry(0.045, 0.006, 6, 16);
        parts.add('strap', loop, M(side * 0.62, 1.82, z));
        parts.add('strap', box(0.012, 0.18, 0.02), M(side * 0.62, 1.95, z));
      }
    }
    // vertical stanchions by the seat rows (aisle side)
    for (const s of SEATS.filter((q) => q.sec === sec)) {
      if (Math.abs(s.x) < 0.6) continue;
      const ax = Math.sign(s.x) * 0.5;
      if (Math.abs(Math.abs(s.x) - 0.98) < 0.02 && SEATS.some((q) => q.sec === sec && Math.abs(q.z - s.z) < 0.05 && Math.sign(q.x) === Math.sign(s.x) && Math.abs(q.x) < 0.6)) continue;
      parts.add('pole', cyl(0.017, top - s.fy - 0.4, 10), M(ax, (s.fy + 0.4 + top) / 2, s.z - 0.2));
      // red stop-request button on the pole
      parts.add('stopBtn', box(0.05, 0.08, 0.04, 0.01), M(ax, 1.35, s.z - 0.2 + 0.03));
    }
    // yellow door rails
    for (const d of BUS.doors.filter((q) => q.section === sec)) {
      for (const z of [d.z0 - 0.08, d.z1 + 0.08]) {
        parts.add('yellow', cyl(0.018, top - fy, 10), M(HW - 0.22, (fy + top) / 2, z));
        parts.add('yellow', tube([[HW - 0.22, 1.0, z], [HW - 0.55, 1.0, z], [HW - 0.6, 0.6, z]], 0.017, 10, 8));
      }
      parts.add('stopBtn', box(0.04, 0.12, 0.08, 0.01), M(HW - 0.09, 1.4, d.z0 - 0.25));
      // validator (Sofia e-ticket validators near the doors)
      parts.add('plastic', box(0.14, 0.24, 0.1, 0.02), M(HW - 0.22, 1.25, d.z1 + 0.16));
      parts.add('yellow', box(0.12, 0.05, 0.02), M(HW - 0.22, 1.3, d.z1 + 0.105));
      // emergency exit sign above the door
      const sg = new THREE.PlaneGeometry(0.3, 0.15);
      const uv = sg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.5, 0.5 + uv.getY(i) * 0.5);
      sg.rotateY(-Math.PI / 2);
      parts.add('signs', sg, M(HW - 0.09, 2.2, (d.z0 + d.z1) / 2));
    }
  },

  buildCab() {
    const p = new Parts();
    const fy = BUS.floorY;
    const zf = FRONT_Z;
    // dashboard: wraparound console in front of the driver
    p.add('dash', box(1.5, 0.62, 0.45, 0.06), M(-0.55, 0.88, zf + 0.42));
    p.add('dash', box(2.3, 0.08, 0.32, 0.03), M(0, 1.06, zf + 0.3));
    const cluster = new THREE.Group();
    // instrument cluster (canvas texture updated by the dashboard)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const clMat = new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false });
    clMat.color.setScalar(0.9);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), clMat);
    cl.position.set(-0.74, 1.24, zf + 0.6);
    cl.rotation.x = -0.55;
    cluster.add(cl);
    this.front.add(cluster);
    this.cluster = cl;
    // hood over the cluster
    p.add('dash', box(0.62, 0.04, 0.22, 0.02), M(-0.74, 1.37, zf + 0.58));
    // steering wheel on an inclined column
    const sw = new THREE.Group();
    sw.position.set(-0.74, 1.28, zf + 0.88);
    sw.rotation.x = -1.0;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 10, 36), this.mats.plastic);
    sw.add(rim);
    for (const a of [0, (2 * Math.PI) / 3 + 0.4, (4 * Math.PI) / 3 - 0.4]) {
      const sp = new THREE.Mesh(box(0.035, 0.2, 0.02), this.mats.plastic);
      sp.position.set(Math.sin(a) * 0.11, -Math.cos(a) * 0.11, 0);
      sp.rotation.z = a;
      sw.add(sp);
    }
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 16).rotateX(Math.PI / 2), this.mats.plastic);
    sw.add(hubM);
    this.steeringWheel = sw;
    this.front.add(sw);
    p.add('plastic', cyl(0.04, 0.5, 10), new THREE.Matrix4().makeRotationX(-1.0 + Math.PI / 2).setPosition(-0.74, 1.08, zf + 0.72));
    // driver seat (air-suspended, high back)
    p.add('seatDark', box(0.52, 0.12, 0.5, 0.04), M(-0.74, fy + 0.5, zf + 1.35));
    p.add('seatDark', box(0.52, 0.75, 0.12, 0.05), new THREE.Matrix4().makeRotationX(0.18).setPosition(-0.74, fy + 0.95, zf + 1.62));
    p.add('plastic', box(0.22, 0.4, 0.22), M(-0.74, fy + 0.25, zf + 1.35));
    // gear buttons D N R and door switches on the left console
    p.add('dash', box(0.25, 0.08, 0.35, 0.02), M(-1.12, 0.95, zf + 0.75));
    // pedals
    p.add('plastic', box(0.08, 0.02, 0.22), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.6, fy + 0.2, zf + 0.62));
    p.add('plastic', box(0.14, 0.02, 0.2), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.85, fy + 0.2, zf + 0.6));
    // cab partition behind the driver and cab door
    const cz = zf + 1.95;
    p.add('wall', box(0.95, 0.9, 0.04), M(-0.75, fy + 0.45, cz));
    p.add('glass', new THREE.PlaneGeometry(0.95, 0.95), M(-0.75, fy + 1.4, cz));
    p.add('black', box(0.97, 0.04, 0.05), M(-0.75, fy + 0.9, cz));
    p.add('black', box(0.97, 0.05, 0.05), M(-0.75, fy + 1.9, cz));
    p.add('wall', box(0.04, 0.9, 1.0), M(-0.27, fy + 0.45, zf + 1.45));
    p.add('black', box(0.04, 0.05, 1.0), M(-0.27, fy + 0.92, zf + 1.45));
    // notices on the partition (passenger side)
    const sg = new THREE.PlaneGeometry(0.3, 0.15);
    const uv = sg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
    p.add('signs', sg, M(-0.75, fy + 0.72, cz + 0.025));
    // ticket printer / radio console on the cab door
    p.add('plastic', box(0.2, 0.28, 0.24, 0.02), M(-0.2, 1.1, zf + 1.1));
    // interior next-stop display hanging from the ceiling
    p.add('plastic', box(1.1, 0.2, 0.08, 0.02), M(0, 2.3, zf + 2.0));
    // cab ceiling and the header behind the destination sign
    p.add('ceiling', box(2.44, 0.03, 1.3), M(0, 2.5, zf + 0.9));
    p.add('plastic', box(2.3, 0.33, 0.04), M(0, 2.69, zf + 0.2));
    // sun visor
    p.add('plastic', box(0.75, 0.01, 0.28), new THREE.Matrix4().makeRotationX(0.25).setPosition(-0.7, 2.45, zf + 0.42));
    // dashboard switch banks and the door-control panel
    for (let i = 0; i < 6; i++) p.add('plastic', box(0.035, 0.012, 0.035, 0.005), M(-1.18 + (i % 3) * 0.06, 0.995, zf + 0.68 + Math.floor(i / 3) * 0.07));
    for (let i = 0; i < 4; i++) p.add(i === 0 ? 'yellow' : 'plastic', box(0.05, 0.015, 0.05, 0.008), M(-0.2 + i * 0.07, 1.115, zf + 0.33));
    const g = p.build(this.mats, { castShadow: false });
    this.front.add(g);
    // driver dummy hidden in driver view, visible from outside
    this.driverEyeLocal = new THREE.Vector3(-0.74, fy + 1.62, zf + 1.42);
  }
};
