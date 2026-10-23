// Optional world layers built after the core city: vegetation, street
// furniture & bus stops, landmarks, traffic, pedestrians, weather. Each layer
// is isolated so a failure in one never prevents the game from starting.
import { Vegetation } from './Vegetation.js';
import { StreetFurniture } from './StreetFurniture.js';
import { Landmarks } from './Landmarks.js';
import { ShopSigns } from './ShopSigns.js';
import { SegmentGrid } from './SpatialIndex.js';
import { TrafficManager } from '../gameplay/TrafficManager.js';
import { PedestrianManager } from '../gameplay/PedestrianManager.js';
import { WeatherFx } from '../render/WeatherFx.js';
import { SweptPath } from '../gameplay/SweptPath.js';

function routeLine(route) {
  const A = route.direction('A').path, B = route.direction('B').path;
  return {
    nearest(x, z) {
      const a = A.nearest(x, z), b = B.nearest(x, z);
      return a.d < b.d ? a : b;
    },
  };
}

export async function buildExtras({ scene, world, route, quality }) {
  const out = { updaters: [] };
  const rl = routeLine(route);
  // nothing may stand where the bus sweeps along its route
  const sweep = (world.sweep = new SweptPath(route));
  const tileKey = (name) => name.split(':')[1];
  const safe = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[extras] ${label} failed`, e);
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  await safe('furniture', () => {
    const f = new StreetFurniture({ scene, world, route, quality });
    f.routeLine = rl;
    f.sweep = sweep;
    for (const g of f.build()) {
      if (g.name.includes(':')) world.addToTile(tileKey(g.name), g);
      else scene.add(g);
    }
    out.furniture = f;
    world.parkedBoxes = f.parkedBoxes;
    world.stopObjects = f.stopObjects;
  });
  await safe('vegetation', () => {
    const v = new Vegetation({ scene, world, quality });
    v.routeLine = rl;
    v.sweep = sweep;
    v.place(world.roadBuilder.sidewalkInfo);
    for (const g of v.build()) world.addToTile(tileKey(g.name), g);
    out.vegetation = v;
  });
  await safe('shop signs', () => {
    const s = new ShopSigns({ world, quality });
    for (const g of s.build()) world.addToTile(tileKey(g.name), g);
    out.signs = s;
  });
  await safe('landmarks', () => {
    const l = new Landmarks({ world, route });
    for (const g of l.build(world.buildingBuilder.crosses || [])) world.addToTile(tileKey(g.name), g);
    out.landmarks = l;
  });
  // small obstacles the bus can hit: poles, tree trunks, shelters, parked cars
  await safe('obstacles', () => {
    const g = new SegmentGrid(16);
    const sq = (x, z, r) => g.addPolygon(Float32Array.from([x - r, z - r, x + r, z - r, x + r, z + r, x - r, z + r]));
    const rect = (x, z, yaw, hl, hw) => {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      const c = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [x + fx * hl * a + rx * hw * b, z + fz * hl * a + rz * hw * b]);
      g.addPolygon(Float32Array.from(c.flat()));
    };
    for (const pb of world.parkedBoxes || []) rect(pb.x, pb.z, pb.yaw, pb.hl, pb.hw);
    if (out.vegetation) for (const t of out.vegetation.trees) sq(t.x, t.z, 0.22);
    if (out.furniture && out.furniture.polePositions) for (const [x, z] of out.furniture.polePositions) sq(x, z, 0.14);
    for (const so of world.stopObjects || []) if (so.shelter) rect(so.shelter[0] + so.out[0] * 0.0, so.shelter[2] + so.out[1] * 0.0, Math.atan2(-so.dir[0], -so.dir[1]), 2.25, 0.85);
    world.obstacles = g;
  });
  await safe('traffic', () => {
    out.traffic = new TrafficManager({ scene, world, quality });
  });
  await safe('pedestrians', () => {
    out.peds = new PedestrianManager({ scene, world, route, quality });
    if (out.traffic) out.traffic.peds = out.peds;
  });
  await safe('weather', () => {
    out.weatherFx = new WeatherFx({ scene, quality });
  });
  // shared per-frame updater for these layers
  out.props = {
    update(dt, focus, night) {
      if (out.vegetation) out.vegetation.time.value += dt;
      if (out.furniture) out.furniture.setNight(night);
      if (out.landmarks) out.landmarks.setNight(night);
      if (out.signs) out.signs.setNight(night);
      if (out.traffic && out.traffic.furnitureHook == null && out.furniture) out.traffic.furnitureHook = true;
      if (out.traffic) out.traffic.setNight(night);
      if (out.peds) out.peds.night = night > 0.5;
      // signal heads follow the controller
      out.sigT = (out.sigT || 0) - dt;
      if (out.sigT <= 0 && out.traffic && out.furniture) {
        out.sigT = 0.25;
        out.furniture.updateSignals((n, e) => out.traffic.signals.state(n, e));
      }
    },
  };
  out.init = (game) => {
    if (out.peds) out.peds.onStopRequest = (bus) => {
      if (game.audio) game.audio.stopBell();
      if (bus.player || bus === game.bus) game.hud.toast('СТОП — пътник заяви спирка');
    };
  };
  return out;
}
