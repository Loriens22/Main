// Assembles the 3D city from the world pack and manages tile visibility (LOD /
// streaming around the camera).
import * as THREE from 'three';
import { Heightfield } from './Heightfield.js';
import { buildSplat, createTerrainMaterial, buildNearTerrainChunk, buildFarTerrain } from './Terrain.js';
import { RoadNetwork } from './RoadNetwork.js';
import { RoadMeshBuilder } from './RoadMesh.js';
import { BuildingBuilder } from './Buildings.js';
import { SegmentGrid } from './SpatialIndex.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor({ scene, data, quality, route }) {
    this.scene = scene;
    this.data = data;
    this.quality = quality;
    this.route = route;
    this.tiles = new Map(); // key -> {group objects[], cx, cz}
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.drawDistance = quality === 'ultra' ? 1600 : quality === 'high' ? 1100 : 700;
  }

  addToTile(key, obj) {
    let t = this.tiles.get(key);
    if (!t) {
      const [tx, tz] = key.replace(/^[A-Z]/, '').split(',').map(Number);
      t = { objs: [], cx: (tx + 0.5) * 256, cz: (tz + 0.5) * 256, visible: true };
      this.tiles.set(key, t);
    }
    t.objs.push(obj);
    this.root.add(obj);
  }

  async build(progress = () => {}) {
    const d = this.data;
    const hf = (this.hf = new Heightfield(d.dem));
    progress(0.1, 'Терен и релеф…');
    await yieldFrame();
    const splat = (this.splat = buildSplat(d, hf, this.quality === 'balanced' ? 6 : 4));
    const tmat = (this.terrainMaterial = createTerrainMaterial(splat, hf, this.quality));
    const cells = 32;
    for (let j = 0; j < hf.near.nz - 1; j += cells)
      for (let i = 0; i < hf.near.nx - 1; i += cells) {
        const m = buildNearTerrainChunk(hf, i, j, cells, tmat);
        const cx = hf.near.x0 + (i + cells / 2) * hf.near.dx, cz = hf.near.z0 + (j + cells / 2) * hf.near.dx;
        m.userData.terrainChunk = true;
        this.addToTile(`T${Math.floor(cx / 256)},${Math.floor(cz / 256)}`, m);
        this.tiles.get(`T${Math.floor(cx / 256)},${Math.floor(cz / 256)}`).terrain = true;
      }
    this.far = buildFarTerrain(hf);
    this.scene.add(this.far);
    progress(0.2, 'Сгради (OpenStreetMap)…');
    await yieldFrame();
    const bb = (this.buildingBuilder = new BuildingBuilder({ world: d, hf, quality: this.quality }));
    bb.build();
    // collision / occlusion index of footprints
    this.bgrid = new SegmentGrid(24);
    for (const f of bb.footprints) this.bgrid.addPolygon(f.pts, f);
    progress(0.38, 'Улична мрежа и кръстовища…');
    await yieldFrame();
    const net = (this.roads = new RoadNetwork(d));
    this.markSignals(net, d.props.signal || []);
    progress(0.48, 'Платна, тротоари и маркировка…');
    await yieldFrame();
    const rb = (this.roadBuilder = new RoadMeshBuilder({ network: net, hf, buildings: this.bgrid, quality: this.quality }));
    rb.build();
    rb.zebras(d.props.crossing || []);
    progress(0.62, 'Сглобяване на сцената…');
    await yieldFrame();
    for (const g of rb.meshes()) this.addToTile(g.name.split(':')[1], g);
    for (const g of bb.meshes()) this.addToTile(g.name.split(':')[1], g);
    this.materials = { roads: rb.materials(), buildings: bb.materials() };
    return this;
  }

  markSignals(net, sig) {
    for (let k = 0; k < sig.length; k += 3) {
      const x = sig[k] / 10, z = sig[k + 1] / 10;
      let best = null, bd = 40;
      for (const n of net.nodes.values()) {
        if (n.type !== 'junction') continue;
        const dd = Math.hypot(n.x - x, n.z - z);
        if (dd < bd) { bd = dd; best = n; }
      }
      if (best) best.signal = true;
    }
  }

  /** Show tiles within draw distance of the focus point. */
  updateVisibility(focus) {
    const dd = this.drawDistance;
    for (const t of this.tiles.values()) {
      const d = Math.hypot(t.cx - focus.x, t.cz - focus.z);
      const vis = d < dd + 200;
      if (vis !== t.visible) {
        t.visible = vis;
        for (const o of t.objs) o.visible = vis;
      }
      // shadows only near the camera
      const near = d < 380;
      if (t.near !== near) {
        t.near = near;
        for (const o of t.objs) o.traverse((m) => { if (m.isMesh && m.name !== 'terrain') m.castShadow = near && !/^(asphalt|brick|sett|sidewalk|paint|footway|path|median|flat|curb|glow|lens|terrain)$/.test(m.name); });
      }
    }
  }

  setQuality(q) {
    this.quality = q;
    this.drawDistance = q === 'ultra' ? 1600 : q === 'high' ? 1100 : 700;
  }

  setNight(v) {
    if (this.materials) this.materials.buildings.uniforms.uNight.value = v;
  }

  tick(dt) {
    if (this.materials && this.materials.roads.time) this.materials.roads.time.value = (this.materials.roads.time.value + dt) % 1000;
  }

  setWet(v) {
    if (this.materials) {
      this.materials.roads.wet.value = v;
      this.materials.buildings.uniforms.uWet.value = v;
      this.terrainMaterial.userData.uniforms.uWet.value = v;
    }
  }
}
