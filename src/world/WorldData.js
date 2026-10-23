// Decodes the embedded world pack (gzip + base64 JSON produced by
// tools/build_world.py). Polylines are delta-encoded decimetres.
import pack280 from '../data/world.pack.b64';
import pack64 from '../data/world64.pack.b64';

/** Embedded world pack of each playable line (tools/build_world.py). */
const PACKS = { 280: pack280, 64: pack64 };
import { L } from '../ui/i18n.js';

function decodeLine(d) {
  const n = d.length >> 1;
  const out = new Float32Array(n * 2);
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) {
    x += d[2 * i];
    z += d[2 * i + 1];
    out[2 * i] = x / 10;
    out[2 * i + 1] = z / 10;
  }
  return out;
}

function decodeGrid(g) {
  const out = new Float32Array(g.nx * g.nz);
  let acc = 0;
  for (let i = 0; i < out.length; i++) {
    acc += g.d[i];
    out[i] = g.base + acc / g.scale;
  }
  return { x0: g.x0, z0: g.z0, dx: g.dx, nx: g.nx, nz: g.nz, h: out };
}

export async function loadWorldPack(progress = () => {}, line = '280') {
  progress(0.02, L('Разопаковане на картата…', 'Unpacking the map…'));
  const bin = Uint8Array.from(atob(PACKS[line] || PACKS[280]), (c) => c.charCodeAt(0));
  let text;
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    // Safari < 16.4 and old WebViews: decode in JavaScript
    const { gunzip } = await import('../core/inflate.js');
    text = new TextDecoder().decode(gunzip(bin));
  }
  const p = JSON.parse(text);
  progress(0.06, L('Обработка на данните…', 'Processing the data…'));
  const w = {
    attribution: p.attribution,
    names: p.names,
    roadClasses: p.roadClasses,
    surfaces: p.surfaces,
    buildingClasses: p.buildingClasses,
    areaTypes: p.areaTypes,
    roofs: p.roofs,
    roads: p.roads.map((r) => ({
      cls: p.roadClasses[r.c], width: r.w / 10, name: r.n >= 0 ? p.names[r.n] : null,
      oneway: !!(r.f & 1), bridge: !!(r.f & 2), link: !!(r.f & 8), crosswalk: !!(r.f & 16),
      driveway: !!(r.f & 32), covered: !!(r.f & 64),
      surface: p.surfaces[r.s] || 'paved', level: r.l, speed: r.v, pts: decodeLine(r.p), conn: r.cn,
    })),
    rails: p.rails.map(decodeLine),
    buildings: p.buildings.map((b, i) => ({
      id: i, pts: decodeLine(b.p), holes: (b.o || []).map(decodeLine), h: b.h / 10, minH: (b.m || 0) / 10,
      cls: p.buildingClasses[b.c], style: b.k, name: b.n >= 0 ? p.names[b.n] : null,
      roof: b.r != null ? p.roofs[b.r] : 'flat', inner: b.i ? decodeLine(b.i) : null, roofH: (b.rh || 0) / 10,
      roofColor: b.col || null, levels: b.lv || 0, part: !!b.pt, landmark: b.lm || null,
      // researched appearance (data/research/world): kind, wall/accent colour, windows, ground floor, signs
      research: b.ov ? { kind: b.ov.kd ?? -1, wall: b.ov.wc ?? null, accent: b.ov.ac ?? null, window: b.ov.wn ?? -1, ground: b.ov.gf ?? -1, signs: b.ov.sg || [], label: b.ov.lb || null } : null,
    })),
    blocks: p.blocks,
    signs: p.signs || [], // [x, z, nx, nz, width, name, bg, fg, building, kiosk, priority] (dm, cm)
    areas: p.areas.map((a) => ({ type: p.areaTypes[a.t], pts: decodeLine(a.p), holes: (a.o || []).map(decodeLine), layer: a.y })),
    trees: p.trees.map((v) => v / 10),
    treeRows: p.treeRows.map(decodeLine),
    waterLines: p.waterLines.map((l) => ({ cls: l.c, pts: decodeLine(l.p), name: l.n >= 0 ? p.names[l.n] : null })),
    props: p.props,
    lines: Object.fromEntries(Object.entries(p.lines).map(([k, v]) => [k, v.map(decodeLine)])),
    dem: { near: decodeGrid(p.dem.near), far: decodeGrid(p.dem.far) },
  };
  return w;
}
