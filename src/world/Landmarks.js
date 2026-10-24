// Hand-built landmarks along the line being played (line 280 below, line 64 in landmarks64/), added on top of (or instead of) the OSM massing:
// Sofia University Rectorate and wings, the National Library, the Eagles' Bridge columns,
// the CCB tower (ex Hotel Pliska) with the Pliska underpass canopies, the Aviation monument,
// Arena 8888, the Winter Palace, the Hristo Botev hall, the UNWE saw-tooth front, the student
// chapel, the Studentski grad kiosks, the OMV station, the metro pavilions, floodlight masts and
// the gilded domes of Alexander Nevsky. Replaced OSM buildings are listed in LandmarkData.js.
// Positions and sizes come from data/research/world/{west,east}/landmarks.json.
import * as THREE from 'three';
import { LandmarkMaterials } from './LandmarkMaterials.js';
import { ensureFootprints, replacedBuildings } from './LandmarkData.js';
import { buildRectorate, buildNbkm, buildEagleBridge, buildKlimentMonument, buildHavelHeart } from './LandmarkCity.js';
import { buildPliska, buildAviation, buildArena, buildMetro, buildPliskaCanopies, buildGuardFences } from './LandmarkRoad.js';
import { buildWinterPalace, buildBotevHall, buildUnwe, buildLtu, buildChapel, buildOmv, buildKiosks, buildTerminalHut } from './LandmarkCampus.js';
import { buildOncology, buildSofiamed } from './LandmarkInstitutionsMed.js';
import { buildTechLibrary, buildHtmu, buildTu, buildNsa } from './LandmarkInstitutionsEdu.js';
import { buildKindergarten, buildNursery } from './LandmarkInstitutionsKids.js';
import { JOBS_64 } from './landmarks64/index.js';

/** Landmark jobs of line 280: [name, (ctx) => item(s)]. */
export const JOBS_280 = [
  ['rectorate', buildRectorate], ['nbkm', (c) => buildNbkm({ ...c, parts: c.partsOf(/^NBKM/) })],
  ['eagles', buildEagleBridge], ['kliment', buildKlimentMonument], ['havel', buildHavelHeart],
  ['pliska', buildPliska], ['guardFences', buildGuardFences], ['pliskaCanopies', buildPliskaCanopies], ['aviation', buildAviation], ['arena', buildArena], ['metro', buildMetro],
  ['winterPalace', buildWinterPalace], ['botev', buildBotevHall], ['unwe', buildUnwe], ['ltu', buildLtu], ['chapel', buildChapel], ['omv', buildOmv], ['kiosks', buildKiosks], ['terminalHut', buildTerminalHut],
  // institutional landmarks (src/world/LandmarkInstitutions*.js)
  ['oncology', buildOncology], ['sofiamed', buildSofiamed], ['techLibrary', buildTechLibrary], ['htmu', buildHtmu], ['tu', buildTu], ['nsa', buildNsa],
  ['kindergarten', buildKindergarten], ['nursery', buildNursery],
];
const JOBS = { 280: JOBS_280, 64: JOBS_64 };

export class Landmarks {
  constructor({ world, route }) {
    this.world = world;
    this.route = route;
    this.M = new LandmarkMaterials();
    this.mats = this.M.m;
    this.stats = { triangles: 0, items: {} };
  }

  y(x, z) {
    return this.world.hf.heightAt(x, z);
  }

  build(crosses = []) {
    const out = [];
    const world = this.world;
    ensureFootprints(world);
    const rep = replacedBuildings(world);
    const line = (this.route && this.route.line) || '280';
    const ctx = { world, M: this.M, route: this.route, y: (x, z) => world.hf.heightAt(x, z), quality: world.quality, replaced: rep, partsOf: (re) => rep.filter((r) => re.test(r.entry.note)) };
    const jobs = JOBS[line] || [];
    const g = new THREE.Group();
    for (const [name, fn] of jobs) {
      try {
        const r = fn(ctx);
        if (!r) continue;
        const list = Array.isArray(r) ? r : [r];
        for (const it of list) {
          const gg = new THREE.Group();
          gg.name = `landmark:${Math.floor(it.x / 256)},${Math.floor(it.z / 256)}`;
          for (const m of it.meshes) gg.add(m);
          out.push(gg);
          this.stats.triangles += it.tris;
          this.stats.items[name] = (this.stats.items[name] || 0) + it.tris;
        }
      } catch (e) {
        console.error(`[landmarks] ${name} failed`, e);
      }
    }
    this.domeCrosses(g, crosses);
    this.stadiums(g);
    for (const c of [...g.children]) {
      const gg = new THREE.Group();
      gg.name = `landmark:${Math.floor(c.position.x / 256)},${Math.floor(c.position.z / 256)}`;
      gg.add(c);
      out.push(gg);
    }
    return out;
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

  setNight(n) {
    this.M.setNight(n);
  }
}
