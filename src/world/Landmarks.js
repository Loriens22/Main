// Hand-built details for recognisable landmarks along Route 280, added on
// top of the OSM massing: the four eagle columns of Orlov Most (Eagles'
// Bridge), the portico of the Sofia University Rectorate, gilded crosses
// on the domes of Alexander Nevsky Cathedral, stadium floodlight masts and
// the rooftop sign of Hotel Pliska. Positions are derived from the map data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const clean = (g) => {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};

export class Landmarks {
  constructor({ world, route }) {
    this.world = world;
    this.route = route;
    this.groups = [];
    const S = THREE.MeshStandardMaterial;
    this.mats = {
      granite: new S({ color: 0x8f8b84, roughness: 0.75 }),
      bronze: new S({ color: 0x3f4a3a, roughness: 0.45, metalness: 0.75 }),
      stone: new S({ color: 0xe6dcc2, roughness: 0.7 }),
      gold: new S({ color: 0xf2c25a, roughness: 0.2, metalness: 1 }),
      steel: new S({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.8 }),
      lamp: new S({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.0 }),
      neon: new S({ color: 0xff3b2f, emissive: 0xff2a1a, emissiveIntensity: 0.4 }),
    };
  }

  y(x, z) {
    return this.world.hf.heightAt(x, z);
  }

  build(crosses = []) {
    const out = [];
    const g = new THREE.Group();
    this.eagles(g);
    this.rectorate(g);
    this.domeCrosses(g, crosses);
    this.stadiums(g);
    this.pliska(g);
    // split into tile groups for streaming
    for (const c of [...g.children]) {
      const gg = new THREE.Group();
      gg.name = `landmark:${Math.floor(c.position.x / 256)},${Math.floor(c.position.z / 256)}`;
      gg.add(c);
      out.push(gg);
    }
    return out;
  }

  /** Bronze eagle with spread wings on a granite column. */
  eagleColumn(x, z, yaw) {
    const m = this.mats;
    const grp = new THREE.Group();
    const y0 = this.y(x, z);
    const geoG = [], geoB = [];
    geoG.push(new THREE.BoxGeometry(1.5, 1.2, 1.5).translate(0, 0.6, 0));
    geoG.push(new THREE.BoxGeometry(1.25, 0.25, 1.25).translate(0, 1.32, 0));
    geoG.push(new THREE.CylinderGeometry(0.42, 0.5, 5.2, 16).translate(0, 4.05, 0));
    geoG.push(new THREE.BoxGeometry(1.15, 0.35, 1.15).translate(0, 6.8, 0));
    // eagle: body, head with beak, two raised wings, tail
    geoB.push(new THREE.SphereGeometry(0.42, 14, 10).scale(0.75, 1.0, 1.35).translate(0, 7.5, 0));
    geoB.push(new THREE.SphereGeometry(0.2, 12, 8).translate(0, 8.05, -0.38));
    geoB.push(new THREE.ConeGeometry(0.07, 0.26, 8).rotateX(-Math.PI / 2).translate(0, 8.0, -0.62));
    for (const s of [-1, 1]) {
      const w = new THREE.Shape();
      w.moveTo(0, 0);
      w.quadraticCurveTo(0.6, 0.55, 1.45, 1.25);
      w.lineTo(1.25, 0.95);
      w.lineTo(1.1, 1.0);
      w.lineTo(0.95, 0.75);
      w.lineTo(0.8, 0.78);
      w.quadraticCurveTo(0.45, 0.25, 0.1, -0.2);
      w.closePath();
      const wg = new THREE.ExtrudeGeometry(w, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      if (s < 0) wg.scale(-1, 1, 1);
      wg.rotateY(s * 0.25);
      geoB.push(wg.translate(s * 0.2, 7.55, 0.05));
    }
    geoB.push(new THREE.ConeGeometry(0.3, 0.7, 6).rotateX(Math.PI / 2 - 0.4).translate(0, 7.25, 0.55));
    const mg = new THREE.Mesh(mergeGeometries(geoG.map(clean)), m.granite);
    const mb = new THREE.Mesh(mergeGeometries(geoB.map(clean)), m.bronze);
    mb.geometry.computeVertexNormals();
    for (const mm of [mg, mb]) { mm.castShadow = true; mm.receiveShadow = true; grp.add(mm); }
    grp.position.set(x, y0, z);
    grp.rotation.y = yaw;
    return grp;
  }

  eagles(g) {
    // Orlov Most: bridge pieces over the Perlovska river near the Orlov Most stop
    const st = this.route.direction('A').stops.find((s) => s.code === '1287');
    if (!st) return;
    const [sx, sz] = st.pole;
    const bridges = this.world.roads.pieces.filter((p) => p.bridge && !p.minor && Math.hypot(p.pts[0] - sx, p.pts[1] - sz) < 220);
    if (!bridges.length) return;
    // use the widest bridge carriageway cluster; corners = ends of the bridge +- total half width
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of bridges) for (let i = 0; i < p.pts.length; i += 2) { x0 = Math.min(x0, p.pts[i]); x1 = Math.max(x1, p.pts[i]); z0 = Math.min(z0, p.pts[i + 1]); z1 = Math.max(z1, p.pts[i + 1]); }
    // main axis of the bridge
    const main = bridges.reduce((a, b) => (b.len > a.len ? b : a));
    const n = main.pts.length;
    const ax = main.pts[0], az = main.pts[1], bx = main.pts[n - 2], bz = main.pts[n - 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / L, dz = (bz - az) / L;
    const nx = -dz, nz = dx;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // half width covering all parallel carriageways + pavements
    let hw = 0;
    for (const p of bridges) for (let i = 0; i < p.pts.length; i += 2) hw = Math.max(hw, Math.abs((p.pts[i] - cx) * nx + (p.pts[i + 1] - cz) * nz) + p.hw);
    hw += 2.5;
    const hl = Math.max(L / 2, 9);
    const yaw = Math.atan2(-dx, -dz);
    for (const a of [-1, 1]) for (const b of [-1, 1]) g.add(this.eagleColumn(cx + dx * hl * a + nx * hw * b, cz + dz * hl * a + nz * hw * b, yaw + (b > 0 ? Math.PI / 2 : -Math.PI / 2)));
  }

  rectorate(g) {
    const f = this.world.buildingBuilder.footprints.find((q) => q.landmark === 'su_rectorate');
    if (!f) return;
    // façade facing the nearest major road
    const p = f.pts;
    const n = p.length / 2;
    let best = null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 20) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      const q = this.world.roads.query(mx + nx * 12, mz + nz * 12, 25, (pp) => ['primary', 'secondary', 'tertiary'].includes(pp.cls));
      const score = L - (q ? q.d : 40);
      if (!best || score > best.score) best = { mx, mz, nx, nz, L, score, dx: (bx - ax) / L, dz: (bz - az) / L };
    }
    if (!best) return;
    const m = this.mats;
    const y0 = this.y(best.mx, best.mz);
    const top = f.top;
    const grp = new THREE.Group();
    const geos = [];
    const W = Math.min(24, best.L * 0.4), D = 4.2, H = Math.min(top - y0 - 2, 15);
    for (let i = 0; i < 6; i++) geos.push(new THREE.CylinderGeometry(0.55, 0.62, H - 2.4, 18).translate(-W / 2 + 1.5 + (i * (W - 3)) / 5, 1.2 + (H - 2.4) / 2, D - 0.8));
    geos.push(new THREE.BoxGeometry(W + 1, 1.2, D + 0.4).translate(0, 0.6, D / 2));
    geos.push(new THREE.BoxGeometry(W + 0.6, 1.4, D).translate(0, H - 0.5, D / 2));
    const ped = new THREE.Shape();
    ped.moveTo(-W / 2 - 0.3, 0);
    ped.lineTo(W / 2 + 0.3, 0);
    ped.lineTo(0, 3.2);
    ped.closePath();
    geos.push(new THREE.ExtrudeGeometry(ped, { depth: D, bevelEnabled: false }).translate(0, H + 0.2, 0));
    for (let s = 0; s < 4; s++) geos.push(new THREE.BoxGeometry(W + 3 - s * 0.6, 0.18, 1.2 - s * 0.2).translate(0, 0.09 + s * 0.18, D + 1.0 - s * 0.25));
    const mesh = new THREE.Mesh(mergeGeometries(geos.map(clean)), m.stone);
    mesh.castShadow = mesh.receiveShadow = true;
    grp.add(mesh);
    // statues of the Georgiev brothers flanking the entrance
    for (const s of [-1, 1]) {
      const st = new THREE.Group();
      const ped2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.1), m.granite);
      ped2.position.y = 0.8;
      const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.3, 6, 10), m.bronze);
      fig.position.y = 2.5;
      st.add(ped2, fig);
      st.position.set(s * (W / 2 + 2.2), 0, D + 2.4);
      st.children.forEach((c) => (c.castShadow = true));
      grp.add(st);
    }
    grp.position.set(best.mx, y0, best.mz);
    grp.rotation.y = Math.atan2(best.nx, best.nz);
    g.add(grp);
  }

  domeCrosses(g, crosses) {
    for (const [x, y, z, s] of crosses) {
      const c = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 2.0 * s, 0.12 * s), this.mats.gold);
      v.position.y = s;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.1 * s, 0.1 * s), this.mats.gold);
      h.position.y = 1.4 * s;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 12, 8), this.mats.gold);
      c.add(v, h, ball);
      c.position.set(x, y, z);
      g.add(c);
    }
  }

  stadiums(g) {
    for (const a of this.world.data.areas) {
      if (a.type !== 'stadium') continue;
      const p = a.pts;
      let cx = 0, cz = 0;
      const n = p.length / 2;
      for (let i = 0; i < n; i++) { cx += p[2 * i]; cz += p[2 * i + 1]; }
      cx /= n; cz /= n;
      // principal axes
      let sxx = 0, szz = 0, sxz = 0;
      for (let i = 0; i < n; i++) { const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      let ra = 0, rb = 0;
      for (let i = 0; i < n; i++) {
        const dx = p[2 * i] - cx, dz = p[2 * i + 1] - cz;
        ra = Math.max(ra, Math.abs(dx * Math.cos(ang) + dz * Math.sin(ang)));
        rb = Math.max(rb, Math.abs(-dx * Math.sin(ang) + dz * Math.cos(ang)));
      }
      if (ra * rb < 2500) continue;
      // four floodlight masts at the diagonal corners
      for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const lx = cx + (u * ra * 0.92) * Math.cos(ang) - (v * rb * 0.92) * Math.sin(ang);
        const lz = cz + (u * ra * 0.92) * Math.sin(ang) + (v * rb * 0.92) * Math.cos(ang);
        const mast = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 42, 10), this.mats.steel);
        pole.position.y = 21;
        const head = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.8), this.mats.steel);
        head.position.y = 43;
        head.lookAt(cx - lx, 30, cz - lz);
        const lampF = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.6), this.mats.lamp);
        lampF.position.set(0, 43, 0);
        lampF.lookAt(cx - lx, 30, cz - lz);
        lampF.translateZ(0.45);
        mast.add(pole, head, lampF);
        mast.position.set(lx, this.y(lx, lz), lz);
        pole.castShadow = true;
        g.add(mast);
      }
    }
  }

  pliska(g) {
    const parts = this.world.buildingBuilder.footprints.filter((q) => q.landmark === 'hotel_pliska');
    const f = parts.reduce((a, b) => (!a || b.top > a.top ? b : a), null);
    if (!f) return;
    // sign along the longest edge of the tower roof (approximate — see docs/RESEARCH.md)
    const p = f.pts;
    let best = null;
    for (let i = 0; i < p.length / 2; i++) {
      const j = (i + 1) % (p.length / 2);
      const L = Math.hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]);
      if (!best || L > best.L) best = { L, ax: p[2 * i], az: p[2 * i + 1], bx: p[2 * j], bz: p[2 * j + 1] };
    }
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const gg = c.getContext('2d');
    gg.clearRect(0, 0, 512, 96);
    gg.fillStyle = '#ff3b2f';
    gg.font = 'bold 84px "Arial Black", Arial';
    gg.textAlign = 'center';
    gg.fillText('ПЛИСКА', 256, 82);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, emissive: 0xff2a1a, emissiveMap: t, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    this.mats.neonSign = mat;
    const w = Math.min(best.L * 0.8, 22);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), mat);
    const mx = (best.ax + best.bx) / 2, mz = (best.az + best.bz) / 2;
    sign.position.set(mx, f.top + w * 0.12, mz);
    sign.rotation.y = Math.atan2(best.bx - best.ax, best.bz - best.az) - Math.PI / 2;
    g.add(sign);
  }

  setNight(n) {
    this.mats.lamp.emissiveIntensity = n > 0.3 ? 4 : 0;
    if (this.mats.neonSign) this.mats.neonSign.emissiveIntensity = 0.4 + n * 3;
  }
}
