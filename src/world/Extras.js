// Optional world layers built after the core city: vegetation, street
// furniture & bus stops, landmarks, traffic, pedestrians, weather. Each layer
// is isolated so a failure in one never prevents the game from starting.
import { Vegetation } from './Vegetation.js';
import { StreetFurniture } from './StreetFurniture.js';
import { Landmarks } from './Landmarks.js';

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
    v.place(world.roadBuilder.sidewalkInfo);
    for (const g of v.build()) world.addToTile(tileKey(g.name), g);
    out.vegetation = v;
  });
  await safe('landmarks', () => {
    const l = new Landmarks({ world, route });
    for (const g of l.build(world.buildingBuilder.crosses || [])) world.addToTile(tileKey(g.name), g);
    out.landmarks = l;
  });
  // shared per-frame updater for these layers
  out.props = {
    update(dt, focus, night) {
      if (out.vegetation) out.vegetation.time.value += dt;
      if (out.furniture) out.furniture.setNight(night);
      if (out.landmarks) out.landmarks.setNight(night);
    },
  };
  out.init = (game) => {
    void game;
  };
  return out;
}
