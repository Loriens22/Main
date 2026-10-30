// Assembles the 3D city from the world pack and manages tile visibility (LOD /
// streaming around the camera).
import * as THREE from 'three';
import { buildTramInfrastructure } from './TramTracks.js';
import { Heightfield } from './Heightfield.js';
import { buildSplat, createTerrainMaterial, buildNearTerrainChunk, buildFarTerrain } from './Terrain.js';
import { RoadNetwork } from './RoadNetwork.js';
import { RoadMeshBuilder } from './RoadMesh.js';
import { BuildingBuilder } from './Buildings.js';
import { loadKit } from './FacadeKit.js';
import { SegmentGrid } from './SpatialIndex.js';
import { L } from '../ui/i18n.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor({ scene, data, quality, route }) {
    this.scene = scene;
    this.data = data;
    this.quality = quality;
    this.route = route;
    this.line = (route && route.line) || '280'; // which line's world this is (landmarks, replaced buildings)
    data.line = this.line;
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
    obj.userData.cullK = CULL[obj.name.split(':')[0]] ?? 1;
    this.root.add(obj);
    releaseAfterUpload(obj);
  }

  async build(progress = () => {}) {
    const d = this.data;
    // the Blender kit decodes (GLB + atlas textures) while the terrain and buildings are generated
    const kitP = this.quality !== 'low' && this.route ? loadKit().catch((e) => { console.warn('facade kit:', e); return null; }) : null;
    const hf = (this.hf = new Heightfield(d.dem));
    progress(0.1, L('Терен и релеф…', 'Terrain and elevation…'));
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
    progress(0.2, L('Сгради (OpenStreetMap)…', 'Buildings (OpenStreetMap)…'));
    await yieldFrame();
    const bb = (this.buildingBuilder = new BuildingBuilder({ world: d, hf, quality: this.quality, route: this.route }));
    bb.build();
    // collision / occlusion index of footprints
    this.bgrid = new SegmentGrid(24);
    for (const f of bb.footprints) this.bgrid.addPolygon(f.pts, f);
    progress(0.38, L('Улична мрежа и кръстовища…', 'Street network and junctions…'));
    await yieldFrame();
    const net = (this.roads = new RoadNetwork(d));
    this.markSignals(net, d.props.signal || []);
    progress(0.48, L('Платна, тротоари и маркировка…', 'Carriageways, pavements and markings…'));
    await yieldFrame();
    const rb = (this.roadBuilder = new RoadMeshBuilder({ network: net, hf, buildings: this.bgrid, quality: this.quality }));
    rb.setCrossings(d.props.crossing || []);
    rb.build();
    rb.zebras();
    if (this.route) {
      rb.busStopMarkings(Object.values(this.route.dirs).flatMap((dd) => dd.stops.map((st) => {
        const a = dd.path.at(st.s), t = dd.path.tangent(st.s, 4);
        return { x: a.x, z: a.z, rx: -t.tz, rz: t.tx };
      })));
    }
    progress(0.62, L('Сглобяване на сцената…', 'Assembling the scene…'));
    await yieldFrame();
    for (const g of rb.meshes()) this.addToTile(g.name.split(':')[1], g);
    for (const g of bb.meshes()) this.addToTile(g.name.split(':')[1], g);
    // tram lines: track (rails, track panels or ballast and sleepers) and the overhead line
    if (this.route && this.route.isTram) this.tramInfra = buildTramInfrastructure(this);
    const kit = (this.kit = kitP && (await kitP));
    if (kit && bb.kit) for (const g of bb.kit.meshes(kit)) this.addToTile(g.name.split(':')[1], g);
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
      // small things disappear sooner than buildings and roads
      const band = Math.min(4, Math.floor(d / 64));
      if (vis !== t.visible || band !== t.band) {
        t.visible = vis;
        t.band = band;
        for (const o of t.objs) o.visible = vis && d < dd * o.userData.cullK + 200;
      }
      // shadows only near the camera
      const near = d < 380;
      if (t.near !== near) {
        t.near = near;
        for (const o of t.objs) o.traverse((m) => { if (m.isMesh && m.name !== 'terrain') m.castShadow = near && !/^(asphalt|brick|sett|sidewalk|paint|footway|path|median|flat|curb|glow|lens|terrain|kit_(pipe\w*|antenna|mushroom|lamp\w*|dish\w+))$/.test(m.name); });
      }
    }
  }

  setQuality(q) {
    this.quality = q;
    this.drawDistance = q === 'ultra' ? 1600 : q === 'high' ? 1100 : 700;
  }

  setNight(v) {
    if (this.materials) this.materials.buildings.uniforms.uNight.value = v;
    if (this.kit) this.kit.glass.emissiveIntensity = v * 2.2;
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

/** Share of the draw distance at which each kind of tile object is still drawn. */
const CULL = {
  trees: 0.7, lampsT: 0.6, lampsS: 0.45, glow: 0.6, lines: 0.6, signals: 0.5, stop: 0.5, parked: 0.38,
  bin: 0.3, container: 0.3, bench: 0.3, recycling: 0.3, hydrant: 0.3, bollard: 0.3, signs: 0.4, bdetail: 0.4, bkit: 0.28, bkits: 0.12, plotwalls: 0.45,
};

/**
 * Static world geometry is never read on the CPU after it reaches the GPU
 * (collision and height queries use their own indices), so drop the typed
 * arrays once uploaded. This halves the memory footprint on phones.
 */
function releaseAfterUpload(root) {
  const free = function () { this.array = null; };
  root.traverse((o) => {
    if (!(o.isMesh || o.isLineSegments) || o.isInstancedMesh || o.userData.keepCPU) return;
    const g = o.geometry;
    if (!g || g.userData.released) return;
    g.userData.released = true;
    if (!g.boundingSphere) g.computeBoundingSphere();
    for (const a of Object.values(g.attributes)) if (!a.isInterleavedBufferAttribute) a.onUpload(free);
    if (g.index) g.index.onUpload(free);
  });
}
