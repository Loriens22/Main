// Light baked in Blender for the bus models. Cycles renders the sky light and its bounces onto the static
// parts of each bus, body and cabin together (tools/blender/bake_bus_light.py): dark under the seats, in the
// door wells and the wheel arches, under the roof pods and round the bumpers, bright beside the windows. The
// result is one grey lightmap per bus and detail level (src/data/lightmaps/<bus>_<variant>.webp), applied as
// the materials' ambient-occlusion map, so it scales the sky and environment light while the sun stays live.
//
// The lightmap UVs are not stored. litMeshes() and lightmapLayout() derive them from the geometry itself, in
// the same way when the scene is exported for the bake (tools/bus_lightmap_export.cjs) and when a bus is
// built in the game: triangles are grouped into charts by facing and connectivity, projected on their main
// plane and shelf-packed. A signature of the geometry is baked with the map; a model that has changed since
// the bake no longer matches and simply keeps its unbaked lighting until it is baked again.
import * as THREE from 'three';

const PAD = 3; // texels round every chart (the bake extends its edge colour into them)
const MINT = 2.5; // smallest chart extent in texels: thinner charts (rails, edges) are stretched across, or the
// bake would hit no texel centre in them and leave them black
const RESERVE = 8; // white block at the origin: meshes that share a baked material but are not baked sample it
const Q = 2000; // positions quantised to 0.5 mm for connectivity and the signature

/** Detail level of the geometry a quality preset builds (the bake must match it exactly). */
export function variantOf(quality) {
  if (quality === 'low') return 'low';
  return quality === 'balanced' ? 'balanced' : 'full';
}

// thin tubes (thousands of hair-thin charts for almost no visible shading) and the underbody pans (never seen)
const NO_BAKE = new Set(['pole', 'strap', 'railYellow', 'underbody']);

function litEligible(m) {
  const mat = m.material;
  if (!m.isMesh || m.isInstancedMesh || Array.isArray(mat) || !mat || m.geometry.index || NO_BAKE.has(m.name)) return false;
  return !!mat.isMeshStandardMaterial && !mat.transparent && !(mat.alphaTest > 0);
}

/**
 * The static meshes that are baked, in a fixed order: the opaque meshes of the parts groups (direct children
 * of a section holding only meshes: body, cabin, cab). Doors, wheels, wipers and the steering wheel sit in
 * pivot groups and move, so they only occlude in the bake.
 */
export function litMeshes(model) {
  const out = [];
  for (const sec of model.root.children) {
    // a tram's bogies turn under the body: they occlude in the bake but are not baked themselves
    if (/^bogie@/.test(sec.name)) continue;
    for (const g of sec.children) {
      if (!g.isGroup || g.children.length < 3 || !g.children.every((m) => m.isMesh)) continue;
      for (const m of g.children) if (litEligible(m)) out.push(m);
    }
  }
  return out;
}

/** Section-frame positions of a lit mesh. */
function localPositions(m) {
  const src = m.geometry.attributes.position;
  const M = new THREE.Matrix4();
  // section <- group <- mesh
  m.updateMatrix();
  m.parent.updateMatrix();
  M.multiplyMatrices(m.parent.matrix, m.matrix);
  const out = new Float32Array(src.count * 3);
  const v = new THREE.Vector3();
  const ident = M.equals(new THREE.Matrix4());
  for (let i = 0; i < src.count; i++) {
    v.fromBufferAttribute(src, i);
    if (!ident) v.applyMatrix4(M);
    out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z;
  }
  return out;
}

const qx = (x) => Math.min(16383, Math.max(0, Math.round((x + 4) * Q)));
const qy = (y) => Math.min(16383, Math.max(0, Math.round((y + 2) * Q)));
const qz = (z) => Math.min(131071, Math.max(0, Math.round((z + 30) * Q)));

// bump whenever the chart or packing rules change: old bakes then stop matching instead of being misapplied
const LAYOUT_VERSION = 2;

/** Integer hash of the lit geometry (mesh order, vertex counts, quantised positions) and the layout rules. */
export function lightmapSignature(meshes, positions = meshes.map(localPositions)) {
  let h = (0x811c9dc5 ^ meshes.length ^ (LAYOUT_VERSION << 20)) >>> 0;
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
  positions.forEach((p, k) => {
    mix(p.length);
    // every vertex (cheap), coarser grid than the connectivity so float noise cannot flip it
    for (let i = 0; i < p.length; i += 3) mix(Math.round(p[i] * 200) * 7919 + Math.round(p[i + 1] * 200) * 104729 + Math.round(p[i + 2] * 200));
    mix(k);
  });
  return (h >>> 0).toString(16);
}

/** Charts of one mesh: triangles grouped by main facing (+-x, +-y, +-z) and shared vertices. */
function meshCharts(p) {
  const nt = p.length / 9;
  const cls = new Uint8Array(nt);
  const parent = new Int32Array(nt);
  for (let t = 0; t < nt; t++) {
    parent[t] = t;
    const o = 9 * t;
    const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
    const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const X = Math.abs(nx), Y = Math.abs(ny), Z = Math.abs(nz);
    cls[t] = X >= Y && X >= Z ? (nx >= 0 ? 0 : 1) : Y >= Z ? (ny >= 0 ? 2 : 3) : nz >= 0 ? 4 : 5;
  }
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const seen = new Map();
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const o = 9 * t + 3 * k;
      const key = ((qx(p[o]) * 16384 + qy(p[o + 1])) * 131072 + qz(p[o + 2])) * 8 + cls[t];
      const s = seen.get(key);
      if (s === undefined) seen.set(key, t);
      else {
        const ra = find(t), rb = find(s);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  }
  const byRoot = new Map();
  const charts = [];
  for (let t = 0; t < nt; t++) {
    const r = find(t);
    let c = byRoot.get(r);
    if (!c) { c = { cls: cls[t], tris: [] }; byRoot.set(r, c); charts.push(c); }
    c.tris.push(t);
  }
  // projection on the main plane: (u, v) in metres; hollow charts (frames round a window or a door) are cut
  // in two along their longer side until they fill their box reasonably
  const out = [];
  const bound = (c) => {
    const a = c.cls >> 1;
    const iu = a === 0 ? 2 : 0, iv = a === 1 ? 2 : 1;
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, area = 0;
    for (const t of c.tris) {
      const o = 9 * t;
      for (let k = 0; k < 3; k++) {
        const u = p[o + 3 * k + iu], v = p[o + 3 * k + iv];
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      area += Math.abs((p[o + 3 + iu] - p[o + iu]) * (p[o + 6 + iv] - p[o + iv]) - (p[o + 6 + iu] - p[o + iu]) * (p[o + 3 + iv] - p[o + iv])) / 2;
    }
    c.iu = iu; c.iv = iv; c.u0 = u0; c.v0 = v0;
    c.w = u1 - u0; c.h = v1 - v0;
    c.fill = area / Math.max(c.w * c.h, 1e-9);
  };
  const split = (c, depth) => {
    bound(c);
    if (depth < 8 && c.tris.length > 1 && c.fill < 0.4 && Math.max(c.w, c.h) > 0.25) {
      const alongU = c.w >= c.h;
      const key = (t) => { const o = 9 * t + (alongU ? c.iu : c.iv); return p[o] + p[o + 3] + p[o + 6]; };
      const sorted = c.tris.slice().sort((x, y) => key(x) - key(y) || x - y);
      const half = sorted.length >> 1;
      split({ cls: c.cls, tris: sorted.slice(0, half) }, depth + 1);
      split({ cls: c.cls, tris: sorted.slice(half) }, depth + 1);
      return;
    }
    c.rot = c.h > c.w; // lay every chart landscape
    out.push(c);
  };
  for (const c of charts) split(c, 0);
  return out;
}

/** Extents of a chart in texels along its own (u, v) at scale s. */
const extent = (c, s) => [Math.max(c.w * s, MINT), Math.max(c.h * s, MINT)];

function pack(charts, size, s) {
  let x = RESERVE, y = 0, shelf = RESERVE;
  for (const c of charts) {
    const [eu, ev] = extent(c, s);
    const w = c.rot ? ev : eu, h = c.rot ? eu : ev;
    const wt = Math.ceil(w) + 2 * PAD + 1, ht = Math.ceil(h) + 2 * PAD + 1;
    if (wt > size) return false;
    if (x + wt > size) { y += shelf; x = 0; shelf = 0; }
    if (y + ht > size) return false;
    c.x = x; c.y = y;
    x += wt;
    shelf = Math.max(shelf, ht);
  }
  return true;
}

/**
 * Lightmap UVs (attribute uv1) for the lit meshes in a size x size atlas: one Float32Array per mesh, the
 * scale in texels per metre and the signature. Deterministic: the bake and the game get the same layout.
 */
export function lightmapLayout(meshes, size) {
  const positions = meshes.map(localPositions);
  const all = [];
  const per = positions.map((p, mi) => {
    const cs = meshCharts(p);
    cs.forEach((c, ci) => { c.mi = mi; c.ci = ci; all.push(c); });
    return cs;
  });
  const order = all.slice().sort((a, b) => {
    const ha = a.rot ? a.w : a.h, hb = b.rot ? b.w : b.h;
    return hb - ha || (b.rot ? b.h : b.w) - (a.rot ? a.h : a.w) || a.mi - b.mi || a.ci - b.ci;
  });
  let area = 0, longest = 0;
  for (const c of all) { area += (c.w + 0.02) * (c.h + 0.02); longest = Math.max(longest, c.w, c.h); }
  let s = Math.min(Math.sqrt((0.7 * size * size) / Math.max(area, 1e-6)), (size - 2 * PAD - 2) / Math.max(longest, 1e-3));
  for (let it = 0; it < 80 && !pack(order, size, s); it++) s *= 0.96;
  const uvs = positions.map((p, mi) => {
    const uv = new Float32Array((p.length / 3) * 2);
    for (const c of per[mi]) {
      const [eu, ev] = extent(c, s);
      const su = c.w > 1e-9 ? eu / c.w : 0, sv = c.h > 1e-9 ? ev / c.h : 0;
      for (const t of c.tris) for (let k = 0; k < 3; k++) {
        const o = 9 * t + 3 * k, vi = 3 * t + k;
        let u = su ? (p[o + c.iu] - c.u0) * su : eu / 2, v = sv ? (p[o + c.iv] - c.v0) * sv : ev / 2;
        if (c.rot) { const tmp = u; u = v; v = tmp; }
        uv[2 * vi] = (c.x + PAD + 0.5 + u) / size;
        uv[2 * vi + 1] = (c.y + PAD + 0.5 + v) / size;
      }
    }
    return uv;
  });
  return { uvs, scale: s, size, signature: lightmapSignature(meshes, positions), charts: all.length };
}

/* ------------------------------------------------------------------ export for the bake */
const avgCache = new WeakMap();
/** Mean colour of a texture (linear), for the albedo of textured parts in the bake. */
function textureMean(tex) {
  if (!tex || !tex.image) return [0.6, 0.6, 0.6];
  if (avgCache.has(tex)) return avgCache.get(tex);
  let out = [0.6, 0.6, 0.6];
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.drawImage(tex.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const acc = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) acc[k] += Math.pow(d[i + k] / 255, 2.2);
    out = acc.map((v) => v / 256);
  } catch (e) { /* tainted or detached image: keep the grey */ }
  avgCache.set(tex, out);
  return out;
}

function albedoOf(m) {
  const mat = [].concat(m.material)[0];
  const c = mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.5, 0.5, 0.5];
  if (mat && mat.map) { const t = textureMean(mat.map); for (let k = 0; k < 3; k++) c[k] *= t[k]; }
  return c;
}

function b64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The bake scene of one bus as plain arrays (base64 Float32, model-root frame, three.js axes): the lit meshes
 * with their lightmap UVs and albedo per vertex, and every other opaque part as an occluder.
 */
export function exportLightmapScene(model, size = 2048) {
  model.root.updateMatrixWorld(true);
  const rootInv = model.root.matrixWorld.clone().invert();
  const meshes = litMeshes(model);
  const layout = lightmapLayout(meshes, size);
  const toRoot = (m) => new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
  const v = new THREE.Vector3();
  const lit = meshes.map((m, i) => {
    const M = toRoot(m), N = new THREE.Matrix3().getNormalMatrix(M);
    const src = m.geometry.attributes.position, sn = m.geometry.attributes.normal, n = src.count;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    const vc = m.geometry.attributes.color, base = albedoOf(m);
    for (let j = 0; j < n; j++) {
      v.fromBufferAttribute(src, j).applyMatrix4(M);
      pos[3 * j] = v.x; pos[3 * j + 1] = v.y; pos[3 * j + 2] = v.z;
      if (sn) { v.fromBufferAttribute(sn, j).applyMatrix3(N).normalize(); nrm[3 * j] = v.x; nrm[3 * j + 1] = v.y; nrm[3 * j + 2] = v.z; }
      for (let k = 0; k < 3; k++) col[3 * j + k] = vc ? vc.getComponent(j, k) : base[k];
    }
    if (!sn) {
      // flat normals from the triangles
      for (let t = 0; t < n; t += 3) {
        const a = new THREE.Vector3().fromArray(pos, 3 * t), b = new THREE.Vector3().fromArray(pos, 3 * t + 3), c = new THREE.Vector3().fromArray(pos, 3 * t + 6);
        const f = b.sub(a).cross(c.sub(a)).normalize();
        for (let k = 0; k < 3; k++) f.toArray(nrm, 3 * (t + k));
      }
    }
    return { name: m.name, pos: b64(pos), uv: b64(layout.uvs[i]), col: b64(col), nrm: b64(nrm) };
  });
  const litSet = new Set(meshes);
  const occ = [];
  model.root.traverse((o) => {
    if (!o.isMesh || litSet.has(o) || !o.visible) return;
    const mat = [].concat(o.material)[0];
    if (!mat || mat.transparent || mat.isMeshBasicMaterial || !o.geometry.attributes.position) return;
    // decal layers a few millimetres off the paint (alpha-tested sprites, polygon-offset stickers) would shade
    // the surface under them as solid sheets
    if (mat.alphaTest > 0 || mat.polygonOffset) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const src = g.attributes.position, n = src.count;
    const base = albedoOf(o);
    const M0 = toRoot(o);
    const count = o.isInstancedMesh ? o.count : 1;
    const pos = new Float32Array(n * 3 * count), col = new Float32Array(n * 3 * count);
    const IM = new THREE.Matrix4(), M = new THREE.Matrix4(), ic = new THREE.Color(1, 1, 1);
    for (let k = 0; k < count; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, IM); M.multiplyMatrices(M0, IM); if (o.instanceColor) o.getColorAt(k, ic); } else M.copy(M0);
      for (let j = 0; j < n; j++) {
        v.fromBufferAttribute(src, j).applyMatrix4(M);
        const q = (k * n + j) * 3;
        pos[q] = v.x; pos[q + 1] = v.y; pos[q + 2] = v.z;
        col[q] = base[0] * ic.r; col[q + 1] = base[1] * ic.g; col[q + 2] = base[2] * ic.b;
      }
    }
    occ.push({ name: o.name || o.type, pos: b64(pos), col: b64(col) });
  });
  return { size, scale: layout.scale, signature: layout.signature, charts: layout.charts, reserve: RESERVE, pad: PAD, lit, occ };
}

/* ------------------------------------------------------------------ runtime */
const MAPS = new Map(); // `${bus}_${variant}` -> { tex, meta }
const LAYOUTS = new Map(); // same key -> layout (the UVs are the same for every bus of a kind)
let loading = null;

/** Decodes the baked lightmaps once (before buses are built). Missing data simply leaves buses unbaked. */
export function loadBusLightmaps() {
  if (loading) return loading;
  loading = import('../data/lightmaps/index.js').then(async ({ default: list }) => {
    await Promise.all(Object.entries(list).map(async ([key, { img: bytes, meta }]) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      const img = new Image();
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);
      const tex = new THREE.Texture(img);
      tex.channel = 1;
      tex.colorSpace = THREE.SRGBColorSpace; // stored sRGB-encoded (finer steps in the darks), sampled linear
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      tex.userData.shared = true;
      MAPS.set(key, { tex, meta });
    }));
  }).catch((e) => {
    console.warn('bus lightmaps unavailable', e);
  });
  return loading;
}

/**
 * Puts the baked light on a freshly built model (before occludeInterior). Returns true when applied.
 * Every material of a baked mesh gets the map; meshes that share such a material without being baked
 * (doors, wipers) sample the white block, i.e. stay as before.
 */
export function applyBusLightmap(model, bus) {
  // a vehicle whose geometry is the same in every preset (the trams) has one map, the full one
  let key = `${bus}_${variantOf(model.quality)}`;
  if (!MAPS.has(key) && MAPS.has(`${bus}_full`)) key = `${bus}_full`;
  const entry = MAPS.get(key);
  if (!entry) return false;
  const meshes = litMeshes(model);
  let layout = LAYOUTS.get(key);
  if (!layout) {
    const sig = lightmapSignature(meshes);
    if (sig !== entry.meta.signature) {
      console.warn(`bus lightmap ${key}: the model changed since the bake (run tools/blender/bake_bus_light.py)`);
      LAYOUTS.set(key, null);
      return false;
    }
    layout = lightmapLayout(meshes, entry.meta.size);
    LAYOUTS.set(key, layout);
  }
  if (!layout || layout.uvs.length !== meshes.length) return false;
  const mats = new Set();
  meshes.forEach((m, i) => {
    if (layout.uvs[i].length !== m.geometry.attributes.position.count * 2) return;
    m.geometry.setAttribute('uv1', new THREE.BufferAttribute(layout.uvs[i], 2));
    mats.add(m.material);
  });
  const white = (RESERVE / 2) / entry.meta.size;
  const lit = new Set(meshes);
  model.root.traverse((o) => {
    if (!o.isMesh || lit.has(o) || o.geometry.attributes.uv1) return;
    if (![].concat(o.material).some((m) => mats.has(m))) return;
    const n = o.geometry.attributes.position.count;
    o.geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(n * 2).fill(white), 2));
  });
  for (const m of mats) {
    m.aoMap = entry.tex;
    m.aoMapIntensity = 1;
    m.userData.lightmapped = true;
    m.needsUpdate = true;
  }
  model.lightmapped = true;
  return true;
}
