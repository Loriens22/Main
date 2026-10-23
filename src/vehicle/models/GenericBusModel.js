// A simple but complete bus model built only from a vehicle spec: body, window band,
// roof equipment, inward-swinging door leaves, wheels, LED signs, lamps, wipers, a basic
// cabin (floor, walls, seats from the seat map, poles) and the driver's cab. It implements
// the full model interface (see README.md) so a new vehicle is playable before its detailed
// model exists, and it is the fallback if a detailed model fails to build.
import * as THREE from 'three';
import { LedSign } from '../LedSign.js';
import { Parts, M, box, cyl } from '../BusGeom.js';
import { frames } from '../frames.js';

export class GenericBusModel {
  /** look: {body, roof, window, lower, stripe, seat, seatFabric, pole, floor, led} hex colours */
  constructor(spec, { fleet = '0000', quality = 'high', interior = true } = {}) {
    this.spec = spec;
    this.fleet = String(fleet);
    this.quality = quality;
    this.look = Object.assign({ body: 0xf0f0ec, roof: 0xf0f0ec, window: 0x0b0e12, lower: 0x111315, stripe: null, seat: 0x9a9fa5, seatFabric: null, pole: 0xa9adb0, floor: 0x5f6468, led: '#ff9a1a' }, spec.look || {});
    this.root = new THREE.Group();
    this.root.name = `${spec.name} #${this.fleet}`;
    this.front = new THREE.Group();
    this.front.name = 'frontSection';
    this.rear = new THREE.Group();
    this.rear.name = 'rearSection';
    this.root.add(this.front, this.rear);
    this.doorLeaves = {};
    this.wheels = [];
    this.signs = {};
    const S = THREE.MeshStandardMaterial, P = THREE.MeshPhysicalMaterial;
    this.mats = {
      body: new P({ color: this.look.body, roughness: 0.32, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
      roof: new P({ color: this.look.roof, roughness: 0.35, metalness: 0.05, clearcoat: 0.5 }),
      lower: new S({ color: this.look.lower, roughness: 0.7 }),
      stripe: new S({ color: this.look.stripe ?? this.look.lower, roughness: 0.6 }),
      glass: new P({ color: this.look.window, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82, depthWrite: false, envMapIntensity: 1.2 }),
      black: new S({ color: 0x0c0d0f, roughness: 0.5 }),
      tyre: new S({ color: 0x111111, roughness: 0.9 }),
      rim: new S({ color: 0xb5bac0, roughness: 0.4, metalness: 0.8 }),
      floor: new S({ color: this.look.floor, roughness: 0.9 }),
      wall: new S({ color: 0xd3d5d0, roughness: 0.6 }),
      seat: new S({ color: this.look.seat, roughness: 0.45 }),
      fabric: new S({ color: this.look.seatFabric ?? this.look.seat, roughness: 0.95 }),
      pole: new S({ color: this.look.pole, roughness: 0.35, metalness: 0.5 }),
      dash: new S({ color: 0x24272b, roughness: 0.8 }),
      headlamp: new S({ color: 0xdfe3e6, roughness: 0.2, metalness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
      tail: new S({ color: 0x6a0b0b, emissive: 0xff1a0a, emissiveIntensity: 0.35 }),
      brake: new S({ color: 0x7a0c0c, emissive: 0xff1a0a, emissiveIntensity: 0 }),
      reverse: new S({ color: 0xdedede, emissive: 0xffffff, emissiveIntensity: 0 }),
      indicatorL: new S({ color: 0xe07b0a, emissive: 0xff8a00, emissiveIntensity: 0 }),
      indicatorR: new S({ color: 0xe07b0a, emissive: 0xff8a00, emissiveIntensity: 0 }),
      lightStrip: new S({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1 }),
      stopBtn: new S({ color: 0xc8102e, emissive: 0xff1010, emissiveIntensity: 0 }),
    };
    this.lightMats = { head: this.mats.headlamp, brake: this.mats.brake, tail: this.mats.tail, reverse: this.mats.reverse, left: this.mats.indicatorL, right: this.mats.indicatorR };
    this.F = frames(spec);
    this.buildSection('front');
    if (spec.articulated) {
      this.buildSection('rear');
      this.buildBellows();
    }
    if (interior) this.buildCabin();
    this.buildSigns();
    this.buildCab();
  }

  /** Body box of one section with window band, roof, skirts, lamps, wheels and doors. */
  buildSection(sec) {
    const s = this.spec, d = s.dims, F = this.F, front = sec === 'front';
    const z0 = front ? F.frontZ : F.rearStart, z1 = front ? F.frontEnd : F.rearZ;
    const p = new Parts();
    const hw = d.halfW, belt = d.beltY || 1.05, wtop = d.windowTopY || 2.55, roof = d.roofY || 2.9, skirt = d.skirtY || 0.3;
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const doors = s.doors.filter((q) => q.section === sec);
    // lower body and roof band
    p.add('body', box(hw * 2, belt - skirt, len), M(0, (belt + skirt) / 2, zc));
    p.add('roof', box(hw * 2 - 0.04, roof - wtop, len), M(0, (roof + wtop) / 2, zc));
    p.add('roof', box(hw * 2 - 0.3, 0.12, len - 0.4), M(0, roof + 0.06, zc));
    if (s.look && s.look.stripe != null) p.add('stripe', box(hw * 2 + 0.01, 0.05, len), M(0, belt - 0.08, zc));
    // window band: glass on both sides, black pillars
    for (const side of [-1, 1]) {
      p.add('glass', box(0.02, wtop - belt, len - 0.2), M(side * (hw - 0.01), (wtop + belt) / 2, zc));
      for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.45) p.add('black', box(0.03, wtop - belt, 0.08), M(side * hw, (wtop + belt) / 2, z));
      p.add('lower', box(0.02, 0.12, len), M(side * (hw + 0.005), skirt + 0.06, zc));
    }
    // ends
    if (front) {
      p.add('glass', box(hw * 2 - 0.2, wtop - belt + 0.25, 0.04), M(0, (wtop + belt - 0.25) / 2, z0 + 0.06));
      p.add('black', box(hw * 2 - 0.1, roof - wtop, 0.05), M(0, (roof + wtop) / 2, z0 + 0.03));
      for (const side of [-1, 1]) {
        p.add('headlamp', box(0.32, 0.14, 0.04), M(side * (hw - 0.3), 0.72, z0 + 0.01));
        p.add(side < 0 ? 'indicatorL' : 'indicatorR', box(0.14, 0.08, 0.04), M(side * (hw - 0.3), 0.56, z0 + 0.01));
        // mirror on a stalk
        p.add('black', box(0.06, 0.06, 0.5), M(side * (hw + 0.12), 2.55, z0 - 0.15));
        p.add('black', box(0.2, 0.5, 0.12), M(side * (hw + 0.32), 2.15, z0 - 0.38));
      }
    }
    if (!front || !s.articulated) {
      p.add('black', box(hw * 2 - 0.5, 0.6, 0.04), M(0, 1.9, z1 - 0.02));
      for (const side of [-1, 1]) {
        p.add('tail', box(0.12, 0.4, 0.04), M(side * (hw - 0.12), 1.15, z1 - 0.01));
        p.add('brake', box(0.12, 0.12, 0.04), M(side * (hw - 0.12), 0.85, z1 - 0.01));
        p.add('reverse', box(0.12, 0.08, 0.04), M(side * (hw - 0.12), 0.7, z1 - 0.01));
      }
    }
    // door portals (dark recess) on the right side
    for (const dr of doors) p.add('black', box(0.03, wtop - skirt, dr.z1 - dr.z0 + 0.1), M(hw + 0.002, (wtop + skirt) / 2, (dr.z0 + dr.z1) / 2));
    const g = p.build(this.mats);
    (front ? this.front : this.rear).add(g);
    // wheels: steered front axle, middle / rear axle
    const axles = front ? [[-d.wb1, true, !s.articulated], [0, false, !s.articulated]] : [[0, false, true]];
    for (const [z, steer, twin] of axles) this.addAxle(front ? this.front : this.rear, z, steer, twin);
    for (const dr of doors) this.addDoor(front ? this.front : this.rear, dr, skirt, wtop);
  }

  addAxle(section, z, steer, twin) {
    const d = this.spec.dims, R = d.wheelR || 0.478;
    for (const side of [-1, 1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set(side * (d.halfW - 0.3), R, z);
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(cyl(R, twin ? 0.5 : 0.28, 20), this.mats.tyre);
      tyre.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(cyl(R * 0.6, (twin ? 0.5 : 0.28) + 0.01, 16), this.mats.rim);
      rim.rotation.z = Math.PI / 2;
      spin.add(tyre, rim);
      knuckle.add(spin);
      section.add(knuckle);
      this.wheels.push({ knuckle, spin, steer, side, section: section === this.front ? 'front' : 'rear', z });
    }
  }

  addDoor(section, dr, skirt, wtop) {
    const hw = this.spec.dims.halfW, w = (dr.z1 - dr.z0) / 2;
    const leaves = [];
    for (const end of [-1, 1]) {
      const hingeZ = end < 0 ? dr.z0 : dr.z1;
      const pivot = new THREE.Group();
      pivot.position.set(hw - 0.05, 0, hingeZ);
      const lp = new Parts();
      const zc = -end * w / 2;
      lp.add('glass', box(0.02, wtop - skirt - 0.2, w - 0.06), M(0, (wtop + skirt) / 2, zc));
      lp.add('black', box(0.04, 0.06, w), M(0, skirt + 0.1, zc));
      lp.add('black', box(0.04, 0.06, w), M(0, wtop - 0.05, zc));
      lp.add('black', box(0.04, wtop - skirt, 0.05), M(0, (wtop + skirt) / 2, zc - end * (w / 2 - 0.02)));
      pivot.add(lp.build(this.mats, { castShadow: false }));
      section.add(pivot);
      leaves.push({ pivot, end: -end });
    }
    this.doorLeaves[dr.id] = leaves;
  }

  buildBellows() {
    const d = this.spec.dims;
    const m = new THREE.Mesh(box(d.halfW * 2 - 0.08, (d.roofY || 2.9) - 0.45, d.bellowsGap * 2), new THREE.MeshStandardMaterial({ color: this.look.bellows ?? 0x4a4c4e, roughness: 0.85 }));
    m.position.set(0, ((d.roofY || 2.9) + 0.45) / 2, this.F.hitchFront);
    this.bellowsMesh = m;
    this.front.add(m);
  }

  buildCabin() {
    const s = this.spec, d = s.dims, F = this.F, L = s.layout;
    const groups = [];
    for (const sec of s.articulated ? ['front', 'rear'] : ['front']) {
      const p = new Parts();
      const z0 = sec === 'front' ? F.frontZ + 0.3 : F.rearStart, z1 = sec === 'front' ? F.frontEnd : F.rearZ - 0.3;
      const fy = d.floorY;
      p.add('floor', box(d.halfW * 2 - 0.1, 0.02, z1 - z0), M(0, fy, (z0 + z1) / 2));
      p.add('wall', box(d.halfW * 2 - 0.1, 0.02, z1 - z0), M(0, (d.roofY || 2.9) - 0.15, (z0 + z1) / 2));
      p.add('lightStrip', box(0.12, 0.02, z1 - z0 - 1), M(0, (d.roofY || 2.9) - 0.17, (z0 + z1) / 2));
      for (const st of L.seats.filter((q) => q.sec === sec)) {
        const yaw = st.yaw || 0, k = Math.cos(yaw) >= 0 ? 1 : -1;
        p.add('seat', box(0.44, 0.06, 0.42), M(st.x, st.fy + 0.42, st.z));
        p.add(L.fabric ? 'fabric' : 'seat', box(0.44, 0.56, 0.06), M(st.x, st.fy + 0.75, st.z + 0.22 * k));
        p.add('seat', box(0.06, 0.42, 0.3), M(st.x, st.fy + 0.21, st.z));
      }
      for (let z = z0 + 1.2; z < z1 - 0.5; z += 2.2) {
        for (const x of [-0.3, 0.3]) p.add('pole', cyl(0.018, (d.roofY || 2.9) - 0.15 - fy, 8), M(x, (fy + (d.roofY || 2.9) - 0.15) / 2, z));
      }
      p.add('pole', box(0.035, 0.035, z1 - z0), M(0.66, 2.12, (z0 + z1) / 2));
      p.add('pole', box(0.035, 0.035, z1 - z0), M(-0.66, 2.12, (z0 + z1) / 2));
      const g = p.build(this.mats, { castShadow: false });
      (sec === 'front' ? this.front : this.rear).add(g);
      groups.push(g);
    }
    this.interiorGroups = groups;
  }

  buildCab() {
    const F = this.F, z0 = F.frontZ;
    const p = new Parts();
    p.add('dash', box(this.spec.dims.halfW * 2 - 0.2, 0.9, 0.5), M(0, 0.9, z0 + 0.4));
    p.add('dash', box(0.5, 0.1, 0.5), M(-0.74, 0.8, z0 + 1.5));
    p.add('dash', box(0.5, 0.7, 0.1), M(-0.74, 1.2, z0 + 1.75));
    this.front.add(p.build(this.mats, { castShadow: false }));
    // instrument cluster canvas (drawn by Game.drawDash)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false }));
    cl.position.set(-0.74, 1.4, z0 + 0.66);
    cl.rotation.x = -0.5;
    this.front.add(cl);
    this.cluster = cl;
    const sw = new THREE.Group();
    sw.position.set(-0.74, 1.25, z0 + 0.9);
    sw.rotation.x = -1.0;
    sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.016, 8, 32), this.mats.dash));
    this.steeringWheel = sw;
    this.front.add(sw);
    this.driverEyeLocal = new THREE.Vector3(-0.74, 1.9, z0 + 1.45);
  }

  buildSigns() {
    const d = this.spec.dims, F = this.F;
    const led = (sign) => new THREE.MeshBasicMaterial({ map: sign.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    const front = new LedSign(132, 24, 8);
    front.on = this.look.led;
    this.signs.front = front;
    const wtop = d.windowTopY || 2.55, roof = d.roofY || 2.9;
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(1.7, Math.min(0.3, roof - wtop - 0.04)), led(front));
    fm.position.set(0, (wtop + roof) / 2, F.frontZ - 0.005);
    fm.rotation.y = Math.PI;
    this.front.add(fm);
    const side = new LedSign(78, 15, 8);
    side.on = this.look.led;
    this.signs.side = side;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.2), led(side));
    sm.position.set(d.halfW + 0.006, wtop - 0.15, F.frontZ + 2.6);
    sm.rotation.y = Math.PI / 2;
    this.front.add(sm);
    const rear = new LedSign(40, 16, 8);
    rear.on = this.look.led;
    this.signs.rear = rear;
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.18), led(rear));
    rm.position.set(0.5, wtop - 0.1, F.rearZ + 0.005);
    (this.spec.articulated ? this.rear : this.front).add(rm);
    const inner = new LedSign(192, 16, 6);
    this.signs.interior = inner;
    const im = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.15), led(inner));
    im.position.set(0, wtop - 0.2, F.frontZ + 1.9);
    this.front.add(im);
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

  setSteer(delta) {
    for (const w of this.wheels) if (w.steer) w.knuckle.rotation.y = delta;
    if (this.steeringWheel) this.steeringWheel.rotation.z = -delta * (this.spec.dims.steeringRatio || 20) * 0.5;
  }

  spin(distFront, distRear) {
    const R = this.spec.dims.wheelR || 0.478;
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
    m.headlamp.emissiveIntensity = head ? 3 : 0;
    m.brake.emissiveIntensity = brake ? 3 : 0;
    m.tail.emissiveIntensity = head ? 1.4 : 0.35;
    m.reverse.emissiveIntensity = reverse ? 2.5 : 0;
    m.indicatorL.emissiveIntensity = left ? 4 : 0;
    m.indicatorR.emissiveIntensity = right ? 4 : 0;
    m.lightStrip.emissiveIntensity = interior;
  }

  setStopRequested(on) {
    this.mats.stopBtn.emissiveIntensity = on ? 2.5 : 0;
  }

  setWiper() {}

  setDetail(cameraDist) {
    const show = cameraDist < 70;
    if (this.interiorGroups && this.interiorGroups[0].visible !== show) for (const g of this.interiorGroups) g.visible = show;
  }

  dispose() {
    const mats = new Set(), texs = new Set();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
      m.dispose();
    }
    for (const t of texs) t.dispose();
  }

  afterPose() {
    this.root.updateMatrixWorld(true);
  }
}
