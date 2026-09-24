// ---------------------------------------------------------------------------
// Implicit-surface (SDF) modelling + isosurface extraction.
//
// This is the heart of the organic geometry pipeline. Neural text-to-3D
// systems typically predict a signed distance / occupancy field and then run
// marching cubes over it. We do the same, except the field is a *procedural
// SDF program* synthesised from the parsed prompt (a list of primitives such
// as ellipsoids, round cones and boxes combined with smooth unions,
// subtractions and noise displacement).
//
// Pipeline:
//   1. SDFBuilder collects primitives. Each primitive carries metadata: a
//      material id (skin / shirt / jeans ...) and a bone index for skinning.
//   2. compile() generates straight-line JavaScript for the field function
//      with `new Function`. V8 JIT-compiles it, which is ~5-10x faster than
//      walking a closure tree. Each primitive gets a bounding sphere so it
//      can be skipped when it cannot influence the running minimum.
//   3. sampleGrid() evaluates the field on a voxel grid using a
//      coarse-to-fine narrow band: a coarse grid (4x spacing) is sampled
//      first and fine samples are only computed in coarse cells the surface
//      may pass through. Everything else is trilinearly interpolated
//      (only the sign matters there).
//   4. surfaceNets() extracts a quad mesh (Naive Surface Nets), which is
//      smoother than marching cubes and produces nicer topology.
//   5. Vertices are projected onto the true surface with Newton steps and
//      normals are taken from the analytic field gradient -> smooth shading.
//   6. Per-vertex attributes are derived from the per-primitive distances:
//      - material: the primitive closest to the surface wins (clothing hems
//        appear naturally where a cloth shell primitive is hard-unioned over
//        the body),
//      - skin weights: soft-min over primitive distances, accumulated per
//        bone ("SDF skinning"), top-4 bones kept,
//      - ambient occlusion: the classic SDF AO estimate (sampling the field
//        along the normal), baked into vertex colours.
// ---------------------------------------------------------------------------

import { noise as sharedNoise } from './noise.js';

const PRIM_TYPES = new Set(['sphere', 'ellipsoid', 'capsule', 'roundCone', 'box', 'torus', 'cylinder', 'plane', 'custom']);

function eulerToMat3(rx, ry, rz) {
  // Same convention as THREE.Euler 'XYZ' (R = Rx * Ry * Rz). Row-major 3x3.
  const a = Math.cos(rx), b = Math.sin(rx);
  const c = Math.cos(ry), d = Math.sin(ry);
  const e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

function num(v) {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1e7) / 1e7;
  // Parenthesise negatives so that "y-" + "-0.4" never becomes the decrement operator.
  return r < 0 ? `(${r})` : String(r);
}

export class SDFBuilder {
  constructor() {
    this.prims = [];      // flat list of leaf primitives (indexing for detail/analysis)
    this.root = { type: 'group', children: [], op: 'union', k: 0 };
    this.stack = [this.root];
    this.dispFns = [];
    this.customFns = [];
  }

  // Add a primitive. Common fields:
  //   type, op ('union'|'smooth'|'sub'|'smoothSub'|'inter'|'smoothInter'), k (blend radius),
  //   mat (material key), bone (index), rot ([rx,ry,rz] euler), disp ({amp, freq, oct} or function)
  add(p) {
    if (!PRIM_TYPES.has(p.type)) throw new Error('Unknown SDF primitive ' + p.type);
    const prim = Object.assign({ op: 'union', k: 0, mat: 0, bone: 0 }, p);
    if (prim.rot) prim.m = Array.isArray(prim.rot) && prim.rot.length === 9 ? prim.rot : eulerToMat3(prim.rot[0] || 0, prim.rot[1] || 0, prim.rot[2] || 0);
    prim.index = this.prims.length;
    prim.bound = this._bound(prim);
    const g = this.stack[this.stack.length - 1];
    prim.parentGroup = g === this.root ? null : g;
    // Inherit group defaults (material, bone) when not given explicitly.
    if (g.defaults) for (const k in g.defaults) if (p[k] === undefined) prim[k] = g.defaults[k];
    this.prims.push(prim);
    g.children.push(prim);
    return prim;
  }

  // Groups evaluate their children into a private accumulator, then combine the
  // result with the enclosing accumulator using the group's op. Clothing shells
  // use this: parts blend smoothly with each other, are clipped at hems by
  // 'inter' planes, and are hard-unioned over the body.
  beginGroup(opts = {}) {
    const g = { type: 'group', children: [], op: opts.op || 'union', k: opts.k || 0, defaults: opts.defaults || null, name: opts.name };
    this.stack[this.stack.length - 1].children.push(g);
    this.stack.push(g);
    return g;
  }
  endGroup() { if (this.stack.length > 1) this.stack.pop(); }
  group(opts, fn) { this.beginGroup(opts); fn(this); this.endGroup(); }

  sphere(c, r, o = {}) { return this.add({ ...o, type: 'sphere', c, r }); }
  ellipsoid(c, r, o = {}) { return this.add({ ...o, type: 'ellipsoid', c, r }); }
  capsule(a, b, r, o = {}) { return this.add({ ...o, type: 'capsule', a, b, r }); }
  roundCone(a, b, ra, rb, o = {}) { return this.add({ ...o, type: 'roundCone', a, b, ra, rb }); }
  box(c, h, o = {}) { return this.add({ ...o, type: 'box', c, h, round: o.round || 0 }); }
  torus(c, R, r, o = {}) { return this.add({ ...o, type: 'torus', c, R, r }); }
  cylinder(c, r, h, o = {}) { return this.add({ ...o, type: 'cylinder', c, r, h, round: o.round || 0 }); }
  plane(n, d, o = {}) { return this.add({ ...o, type: 'plane', n, d }); }
  custom(fn, bound, o = {}) { return this.add({ ...o, type: 'custom', fn, customBound: bound }); }

  // Chain of round cones through points [[x,y,z,r], ...].
  chain(points, o = {}) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const opts = { ...o };
      if (typeof o.boneFn === 'function') opts.bone = o.boneFn(i);
      if (i > 0 && o.op === undefined) opts.op = 'smooth';
      out.push(this.roundCone([a[0], a[1], a[2]], [b[0], b[1], b[2]], a[3], b[3], opts));
    }
    return out;
  }

  _dispAmp(p) {
    if (!p.disp) return 0;
    if (typeof p.disp === 'function') return p.dispAmp || 0.02;
    return Math.abs(p.disp.amp || 0) * 1.2;
  }

  _bound(p) {
    const pad = this._dispAmp(p) + (p.k || 0);
    switch (p.type) {
      case 'sphere': return { c: p.c, r: p.r + pad };
      case 'ellipsoid': return { c: p.c, r: Math.max(p.r[0], p.r[1], p.r[2]) + pad };
      case 'capsule': {
        const c = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
        const l = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2;
        return { c, r: l + p.r + pad };
      }
      case 'roundCone': {
        const c = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
        const l = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2;
        return { c, r: l + Math.max(p.ra, p.rb) + pad };
      }
      case 'box': return { c: p.c, r: Math.hypot(p.h[0], p.h[1], p.h[2]) + pad };
      case 'torus': return { c: p.c, r: p.R + p.r + pad };
      case 'cylinder': return { c: p.c, r: Math.hypot(p.r, p.h) + pad };
      case 'custom': return p.customBound ? { c: p.customBound.c, r: p.customBound.r + pad } : null;
      default: return null; // plane: unbounded
    }
  }

  // Emit JS code computing primitive distance into variable q.
  _emitPrim(p, dispIndexMap) {
    let s = '';
    const local = (c) => {
      if (p.m) {
        const m = p.m;
        // local = R^T * (p - c)
        s += `tx=x-${num(c[0])};ty=y-${num(c[1])};tz=z-${num(c[2])};`;
        s += `lx=${num(m[0])}*tx+${num(m[3])}*ty+${num(m[6])}*tz;`;
        s += `ly=${num(m[1])}*tx+${num(m[4])}*ty+${num(m[7])}*tz;`;
        s += `lz=${num(m[2])}*tx+${num(m[5])}*ty+${num(m[8])}*tz;`;
      } else {
        s += `lx=x-${num(c[0])};ly=y-${num(c[1])};lz=z-${num(c[2])};`;
      }
    };
    switch (p.type) {
      case 'sphere':
        s += `lx=x-${num(p.c[0])};ly=y-${num(p.c[1])};lz=z-${num(p.c[2])};q=Math.sqrt(lx*lx+ly*ly+lz*lz)-${num(p.r)};`;
        break;
      case 'ellipsoid': {
        local(p.c);
        const [rx, ry, rz] = p.r;
        s += `k0=Math.sqrt(lx*lx*${num(1 / (rx * rx))}+ly*ly*${num(1 / (ry * ry))}+lz*lz*${num(1 / (rz * rz))});`;
        s += `k1=Math.sqrt(lx*lx*${num(1 / (rx ** 4))}+ly*ly*${num(1 / (ry ** 4))}+lz*lz*${num(1 / (rz ** 4))});`;
        s += `q=k1>1e-9?k0*(k0-1)/k1:-${num(Math.min(rx, ry, rz))};`;
        break;
      }
      case 'capsule': {
        const [ax, ay, az] = p.a, [bx, by, bz] = p.b;
        const bax = bx - ax, bay = by - ay, baz = bz - az;
        const inv = 1 / Math.max(1e-12, bax * bax + bay * bay + baz * baz);
        s += `tx=x-${num(ax)};ty=y-${num(ay)};tz=z-${num(az)};`;
        s += `h=(tx*${num(bax)}+ty*${num(bay)}+tz*${num(baz)})*${num(inv)};h=h<0?0:h>1?1:h;`;
        s += `tx-=${num(bax)}*h;ty-=${num(bay)}*h;tz-=${num(baz)}*h;q=Math.sqrt(tx*tx+ty*ty+tz*tz)-${num(p.r)};`;
        break;
      }
      case 'roundCone': {
        const [ax, ay, az] = p.a, [bx, by, bz] = p.b;
        const bax = bx - ax, bay = by - ay, baz = bz - az;
        const l2 = Math.max(1e-12, bax * bax + bay * bay + baz * baz);
        const rr = p.ra - p.rb;
        const a2 = l2 - rr * rr;
        const il2 = 1 / l2;
        if (a2 <= 1e-12) {
          // Degenerate (one sphere contains the other): use the bigger sphere.
          const big = p.ra > p.rb ? p.a : p.b;
          s += `lx=x-${num(big[0])};ly=y-${num(big[1])};lz=z-${num(big[2])};q=Math.sqrt(lx*lx+ly*ly+lz*lz)-${num(Math.max(p.ra, p.rb))};`;
          break;
        }
        const k = Math.sign(rr) * rr * rr;
        s += `tx=x-${num(ax)};ty=y-${num(ay)};tz=z-${num(az)};`;
        s += `yy=tx*${num(bax)}+ty*${num(bay)}+tz*${num(baz)};zz=yy-${num(l2)};`;
        s += `lx=tx*${num(l2)}-${num(bax)}*yy;ly=ty*${num(l2)}-${num(bay)}*yy;lz=tz*${num(l2)}-${num(baz)}*yy;`;
        s += `x2=lx*lx+ly*ly+lz*lz;y2=yy*yy*${num(l2)};z2=zz*zz*${num(l2)};kk=${num(k)}*x2;`;
        s += `if((zz>0?1:zz<0?-1:0)*${num(a2)}*z2>kk)q=Math.sqrt(x2+z2)*${num(il2)}-${num(p.rb)};`;
        s += `else if((yy>0?1:yy<0?-1:0)*${num(a2)}*y2<kk)q=Math.sqrt(x2+y2)*${num(il2)}-${num(p.ra)};`;
        s += `else q=(Math.sqrt(x2*${num(a2 * il2)})+yy*${num(rr)})*${num(il2)}-${num(p.ra)};`;
        break;
      }
      case 'box': {
        local(p.c);
        const r = p.round || 0;
        s += `tx=Math.abs(lx)-${num(p.h[0] - r)};ty=Math.abs(ly)-${num(p.h[1] - r)};tz=Math.abs(lz)-${num(p.h[2] - r)};`;
        s += `k0=tx>0?tx:0;k1=ty>0?ty:0;h=tz>0?tz:0;`;
        s += `q=Math.sqrt(k0*k0+k1*k1+h*h)+Math.min(Math.max(tx,ty,tz),0)-${num(r)};`;
        break;
      }
      case 'torus':
        local(p.c);
        s += `tx=Math.sqrt(lx*lx+lz*lz)-${num(p.R)};q=Math.sqrt(tx*tx+ly*ly)-${num(p.r)};`;
        break;
      case 'cylinder': {
        local(p.c);
        const r = p.round || 0;
        s += `tx=Math.sqrt(lx*lx+lz*lz)-${num(p.r - r)};ty=Math.abs(ly)-${num(p.h - r)};`;
        s += `k0=tx>0?tx:0;k1=ty>0?ty:0;q=Math.min(Math.max(tx,ty),0)+Math.sqrt(k0*k0+k1*k1)-${num(r)};`;
        break;
      }
      case 'plane': {
        const n = p.n;
        s += `q=x*${num(n[0])}+y*${num(n[1])}+z*${num(n[2])}-${num(p.d)};`;
        break;
      }
      case 'custom': {
        const idx = this.customFns.length;
        this.customFns.push(p.fn);
        s += `q=C[${idx}](x,y,z);`;
        break;
      }
    }
    if (p.disp) {
      if (typeof p.disp === 'function') {
        const idx = dispIndexMap.get(p);
        s += `q-=D[${idx}](x,y,z);`;
      } else {
        const d = p.disp;
        const f = d.freq || 10, amp = d.amp || 0.005, oct = d.oct || 1;
        const off = d.offset || [0, 0, 0];
        if (oct <= 1) s += `q-=${num(amp)}*N.n3(x*${num(f)}+${num(off[0])},y*${num(f)}+${num(off[1])},z*${num(f)}+${num(off[2])});`;
        else s += `q-=${num(amp)}*N.fbm3(x*${num(f)}+${num(off[0])},y*${num(f)}+${num(off[1])},z*${num(f)}+${num(off[2])},${oct});`;
      }
    }
    return s;
  }

  _emitOp(p) {
    const k = Math.max(1e-6, p.k || 0);
    switch (p.op) {
      case 'smooth':
        return `h=${num(k)}-Math.abs(d-q);h=h>0?h/${num(k)}:0;d=(d<q?d:q)-h*h*${num(k * 0.25)};`;
      case 'sub':
        return `q=-q;d=d>q?d:q;`;
      case 'smoothSub':
        return `h=0.5-0.5*(d+q)/${num(k)};h=h<0?0:h>1?1:h;d=d+(-q-d)*h+${num(k)}*h*(1-h);`;
      case 'inter':
        return `d=d>q?d:q;`;
      case 'smoothInter':
        return `h=0.5-0.5*(q-d)/${num(k)};h=h<0?0:h>1?1:h;d=q+(d-q)*h+${num(k)}*h*(1-h);`;
      default:
        return `d=d<q?d:q;`;
    }
  }

  // Bounding sphere of a group (children that add material; planes ignored).
  _groupBound(g) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const c of g.children) {
      if (c.op === 'sub' || c.op === 'smoothSub' || c.op === 'inter' || c.op === 'smoothInter') continue;
      const b = c.type === 'group' ? this._groupBound(c) : c.bound;
      if (!b) return null;
      any = true;
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.c[i] - b.r); max[i] = Math.max(max[i], b.c[i] + b.r); }
    }
    if (!any) return null;
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    return { c, r: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + (g.k || 0) };
  }

  _skipCond(op, k) {
    if (op === 'sub' || op === 'smoothSub') return `-lb+${num(k)}>ACC`;
    if (op === 'inter' || op === 'smoothInter') return 'true';
    return `lb<ACC+${num(k)}`;
  }

  // Recursively emit code for a group. acc = accumulator variable name.
  _emitGroup(g, acc, depth, dispIndexMap, detail) {
    let code = '';
    let first = true;
    const clipVar = 'c' + depth;
    const hasClip = detail && g.children.some((c) => c.type !== 'group' && (c.op === 'inter' || c.op === 'smoothInter'));
    if (hasClip) code += `${clipVar}=-1e9;`;
    for (const c of g.children) {
      if (c.type === 'group') {
        const gv = 'g' + (depth + 1);
        let inner = `${gv}=1e9;` + this._emitGroup(c, gv, depth + 1, dispIndexMap, detail) + `q=${gv};` + this._emitOp(c).replace(/\bd\b/g, acc);
        const b = this._groupBound(c);
        if (b && !first && !detail) {
          code += `tx=x-${num(b.c[0])};ty=y-${num(b.c[1])};tz=z-${num(b.c[2])};lb=Math.sqrt(tx*tx+ty*ty+tz*tz)-${num(b.r)};`;
          code += `if(${this._skipCond(c.op, c.k || 0).replace(/ACC/g, acc)}){${inner}}\n`;
        } else code += inner + '\n';
        first = false;
        continue;
      }
      const primCode = this._emitPrim(c, dispIndexMap);
      const opCode = (first && (c.op === 'union' || c.op === 'smooth')) ? `${acc}=q;` : this._emitOp(c).replace(/\bd\b/g, acc);
      const b = c.bound;
      if (detail) {
        const isClip = c.op === 'inter' || c.op === 'smoothInter';
        if (b) {
          code += `tx=x-${num(b.c[0])};ty=y-${num(b.c[1])};tz=z-${num(b.c[2])};lb=Math.sqrt(tx*tx+ty*ty+tz*tz)-${num(b.r)};`;
          code += `if(lb<0.25){${primCode}O[${c.index}]=q;${opCode}}else{O[${c.index}]=lb;q=lb;${c.op === 'union' || c.op === 'smooth' ? opCode : ''}}`;
        } else code += `${primCode}O[${c.index}]=q;${opCode}`;
        if (isClip && hasClip) code += `${clipVar}=${clipVar}>q?${clipVar}:q;`;
        code += '\n';
      } else if (b && !first) {
        code += `tx=x-${num(b.c[0])};ty=y-${num(b.c[1])};tz=z-${num(b.c[2])};lb=Math.sqrt(tx*tx+ty*ty+tz*tz)-${num(b.r)};`;
        code += `if(${this._skipCond(c.op, c.k || 0).replace(/ACC/g, acc)}){${primCode}${opCode}}\n`;
      } else {
        code += primCode + opCode + '\n';
      }
      first = false;
    }
    // Clipped children report their clipped distance (hem-aware material/skin analysis).
    if (hasClip) {
      for (const c of g.children) {
        if (c.type === 'group' || c.op === 'inter' || c.op === 'smoothInter') continue;
        code += `O[${c.index}]=O[${c.index}]>${clipVar}?O[${c.index}]:${clipVar};`;
      }
      code += '\n';
    }
    return code;
  }

  // Build the compiled field function and a "detail" function returning per-primitive distances.
  compile(noiseInstance = sharedNoise) {
    this.customFns = [];
    const dispIndexMap = new Map();
    const dispFns = [];
    for (const p of this.prims) if (typeof p.disp === 'function') { dispIndexMap.set(p, dispFns.length); dispFns.push(p.disp); }
    let vars = 'let d=1e9,q=0,h=0,lx=0,ly=0,lz=0,tx=0,ty=0,tz=0,k0=0,k1=0,yy=0,zz=0,x2=0,y2=0,z2=0,kk=0,lb=0';
    for (let i = 0; i < 8; i++) vars += `,g${i}=1e9,c${i}=-1e9`;
    vars += ';';
    const body = this._emitGroup(this.root, 'd', 0, dispIndexMap, false);
    const customA = this.customFns.slice();
    this.customFns = [];
    const detailBody = this._emitGroup(this.root, 'd', 0, dispIndexMap, true);
    const src = `return function(x,y,z){${vars}${body}return d;}`;
    const dsrc = `return function(x,y,z,O){${vars}${detailBody}return d;}`;
    // eslint-disable-next-line no-new-func
    this.field = new Function('N', 'D', 'C', src)(noiseInstance, dispFns, customA);
    // eslint-disable-next-line no-new-func
    this.detail = new Function('N', 'D', 'C', dsrc)(noiseInstance, dispFns, this.customFns);
    return this;
  }

  // Axis-aligned bounds of all additive primitives (for grid allocation).
  bounds(pad = 0.02) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of this.prims) {
      if (p.op === 'sub' || p.op === 'smoothSub' || p.op === 'inter' || p.op === 'smoothInter' || !p.bound) continue;
      const b = p.bound;
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.c[i] - b.r); max[i] = Math.max(max[i], b.c[i] + b.r); }
    }
    for (let i = 0; i < 3; i++) { min[i] -= pad; max[i] += pad; }
    return { min, max };
  }
}

// Tighten bounds by sampling a coarse grid: returns bounds of the region where d < pad.
export function* tightBounds(field, b, step, ctx) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let z = b.min[2]; z <= b.max[2]; z += step) {
    for (let y = b.min[1]; y <= b.max[1]; y += step) {
      for (let x = b.min[0]; x <= b.max[0]; x += step) {
        if (field(x, y, z) < step) {
          if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
        }
      }
    }
    if (ctx && ctx.shouldYield()) yield;
  }
  if (min[0] === Infinity) return b;
  for (let i = 0; i < 3; i++) { min[i] -= step * 1.5; max[i] += step * 1.5; }
  return { min, max };
}

// Coarse-to-fine narrow-band sampling of the field on a regular grid.
export function* sampleGrid(field, bounds, voxel, ctx, onProgress) {
  const C = 4;
  const nx = Math.max(2, Math.ceil((bounds.max[0] - bounds.min[0]) / voxel) + 1);
  const ny = Math.max(2, Math.ceil((bounds.max[1] - bounds.min[1]) / voxel) + 1);
  const nz = Math.max(2, Math.ceil((bounds.max[2] - bounds.min[2]) / voxel) + 1);
  const ox = bounds.min[0], oy = bounds.min[1], oz = bounds.min[2];
  const values = new Float32Array(nx * ny * nz);
  const cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  const cv = voxel * C;
  for (let k = 0; k < cnz; k++) {
    for (let j = 0; j < cny; j++) {
      for (let i = 0; i < cnx; i++) coarse[i + cnx * (j + cny * k)] = field(ox + i * cv, oy + j * cv, oz + k * cv);
    }
    if (ctx && ctx.shouldYield()) yield;
  }
  const band = cv * 1.9; // coarse cell diagonal (sqrt(3)) + margin for non-Lipschitz blends
  const done = new Uint8Array(nx * ny * nz);
  let cells = 0;
  const totalCells = (cnx - 1) * (cny - 1) * (cnz - 1);
  for (let ck = 0; ck < cnz - 1; ck++) {
    for (let cj = 0; cj < cny - 1; cj++) {
      for (let ci = 0; ci < cnx - 1; ci++) {
        cells++;
        const c000 = coarse[ci + cnx * (cj + cny * ck)];
        const c100 = coarse[ci + 1 + cnx * (cj + cny * ck)];
        const c010 = coarse[ci + cnx * (cj + 1 + cny * ck)];
        const c110 = coarse[ci + 1 + cnx * (cj + 1 + cny * ck)];
        const c001 = coarse[ci + cnx * (cj + cny * (ck + 1))];
        const c101 = coarse[ci + 1 + cnx * (cj + cny * (ck + 1))];
        const c011 = coarse[ci + cnx * (cj + 1 + cny * (ck + 1))];
        const c111 = coarse[ci + 1 + cnx * (cj + 1 + cny * (ck + 1))];
        const minAbs = Math.min(Math.abs(c000), Math.abs(c100), Math.abs(c010), Math.abs(c110), Math.abs(c001), Math.abs(c101), Math.abs(c011), Math.abs(c111));
        const exact = minAbs < band;
        const i0 = ci * C, j0 = cj * C, k0 = ck * C;
        const i1 = Math.min(nx - 1, i0 + C), j1 = Math.min(ny - 1, j0 + C), k1 = Math.min(nz - 1, k0 + C);
        for (let k = k0; k <= k1; k++) {
          const fz = (k - k0) / C;
          for (let j = j0; j <= j1; j++) {
            const fy = (j - j0) / C;
            let idx = i0 + nx * (j + ny * k);
            for (let i = i0; i <= i1; i++, idx++) {
              if (done[idx] === 2) continue;
              if (exact) {
                values[idx] = field(ox + i * voxel, oy + j * voxel, oz + k * voxel);
                done[idx] = 2;
              } else if (done[idx] === 0) {
                const fx = (i - i0) / C;
                const a = c000 + (c100 - c000) * fx, b = c010 + (c110 - c010) * fx;
                const c = c001 + (c101 - c001) * fx, d = c011 + (c111 - c011) * fx;
                const e = a + (b - a) * fy, f = c + (d - c) * fy;
                values[idx] = e + (f - e) * fz;
                done[idx] = 1;
              }
            }
          }
        }
      }
      if (ctx && ctx.shouldYield()) { if (onProgress) onProgress(cells / totalCells); yield; }
    }
  }
  return { nx, ny, nz, ox, oy, oz, voxel, values };
}

// Naive Surface Nets. Returns positions (Float32Array) and quad-derived triangle indices.
export function* surfaceNets(grid, ctx) {
  const { nx, ny, nz, ox, oy, oz, voxel, values } = grid;
  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  let positions = new Float32Array(65536 * 3);
  let vcount = 0;
  const cornerOff = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  const sx = 1, sy = nx, sz = nx * ny;
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + nx * (j + ny * k);
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = cornerOff[c];
          const val = values[base + o[0] * sx + o[1] * sy + o[2] * sz];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = edges[e][0], b = edges[e][1];
          const va = v[a], vb = v[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const oa = cornerOff[a], ob = cornerOff[b];
          px += oa[0] + (ob[0] - oa[0]) * t;
          py += oa[1] + (ob[1] - oa[1]) * t;
          pz += oa[2] + (ob[2] - oa[2]) * t;
          n++;
        }
        if (vcount * 3 + 3 > positions.length) {
          const np = new Float32Array(positions.length * 2); np.set(positions); positions = np;
        }
        positions[vcount * 3] = ox + (i + px / n) * voxel;
        positions[vcount * 3 + 1] = oy + (j + py / n) * voxel;
        positions[vcount * 3 + 2] = oz + (k + pz / n) * voxel;
        cellIndex[base] = vcount++;
      }
    }
    if (ctx && ctx.shouldYield()) yield;
  }
  // Faces: for every grid edge with a sign change, connect the 4 cells around it.
  let indices = new Uint32Array(Math.max(1024, vcount * 6 + 64));
  let icount = 0;
  const pushQuad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (icount + 6 > indices.length) { const ni = new Uint32Array(indices.length * 2); ni.set(indices); indices = ni; }
    // Split along the shorter diagonal for nicer triangles.
    const d1 = dist2(positions, a, c), d2 = dist2(positions, b, d);
    if (d1 <= d2) {
      if (!flip) { indices[icount++] = a; indices[icount++] = b; indices[icount++] = c; indices[icount++] = a; indices[icount++] = c; indices[icount++] = d; }
      else { indices[icount++] = a; indices[icount++] = c; indices[icount++] = b; indices[icount++] = a; indices[icount++] = d; indices[icount++] = c; }
    } else {
      if (!flip) { indices[icount++] = a; indices[icount++] = b; indices[icount++] = d; indices[icount++] = b; indices[icount++] = c; indices[icount++] = d; }
      else { indices[icount++] = a; indices[icount++] = d; indices[icount++] = b; indices[icount++] = b; indices[icount++] = d; indices[icount++] = c; }
    }
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + nx * (j + ny * k);
        const s0 = values[idx] < 0;
        // +x edge
        if (i < nx - 1 && j > 0 && k > 0) {
          const s1 = values[idx + sx] < 0;
          if (s0 !== s1) {
            pushQuad(cellIndex[idx - sy - sz], cellIndex[idx - sz], cellIndex[idx], cellIndex[idx - sy], !s0);
          }
        }
        // +y edge
        if (j < ny - 1 && i > 0 && k > 0) {
          const s1 = values[idx + sy] < 0;
          if (s0 !== s1) {
            pushQuad(cellIndex[idx - sx - sz], cellIndex[idx - sx], cellIndex[idx], cellIndex[idx - sz], !s0);
          }
        }
        // +z edge
        if (k < nz - 1 && i > 0 && j > 0) {
          const s1 = values[idx + sz] < 0;
          if (s0 !== s1) {
            pushQuad(cellIndex[idx - sx - sy], cellIndex[idx - sy], cellIndex[idx], cellIndex[idx - sx], !s0);
          }
        }
      }
    }
    if (ctx && ctx.shouldYield()) yield;
  }
  return { positions: positions.slice(0, vcount * 3), indices: indices.slice(0, icount), vertexCount: vcount };
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

// Project vertices onto the zero level set and compute gradient normals.
export function* refineSurface(field, mesh, voxel, ctx, iterations = 2) {
  const pos = mesh.positions;
  const n = mesh.vertexCount;
  const normals = new Float32Array(n * 3);
  const e = voxel * 0.35;
  const maxMove = voxel * 0.75;
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it <= iterations; it++) {
      const d = field(x, y, z);
      gx = field(x + e, y, z) - field(x - e, y, z);
      gy = field(x, y + e, z) - field(x, y - e, z);
      gz = field(x, y, z + e) - field(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (it === iterations) break;
      x -= gx * d; y -= gy * d; z -= gz * d;
      // Keep vertices close to their cell to avoid folding at sharp features.
      const mx = x - x0, my = y - y0, mz = z - z0;
      const ml = Math.hypot(mx, my, mz);
      if (ml > maxMove) { const s = maxMove / ml; x = x0 + mx * s; y = y0 + my * s; z = z0 + mz * s; }
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    normals[i * 3] = gx; normals[i * 3 + 1] = gy; normals[i * 3 + 2] = gz;
    if ((i & 1023) === 0 && ctx && ctx.shouldYield()) yield;
  }
  mesh.normals = normals;
  return mesh;
}

// SDF ambient occlusion estimate per vertex (Quilez). Returns Float32Array in [0,1].
export function* bakeAO(field, mesh, scale, ctx, steps = 5) {
  const pos = mesh.positions, nor = mesh.normals;
  const n = mesh.vertexCount;
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    let occ = 0, w = 1;
    for (let s = 1; s <= steps; s++) {
      const h = scale * s / steps;
      const d = field(x + nx * h, y + ny * h, z + nz * h);
      occ += (h - Math.max(0, d)) * w;
      w *= 0.6;
    }
    ao[i] = Math.max(0, Math.min(1, 1 - occ * 2.2 / scale));
    if ((i & 1023) === 0 && ctx && ctx.shouldYield()) yield;
  }
  return ao;
}

// Per-vertex primitive analysis: dominant primitive, skin weights.
// weightsFor(primIndex) -> bone index; returns {dominant: Int32Array, skinIndex, skinWeight}
export function* analyzeVertices(sdf, mesh, opts, ctx) {
  const n = mesh.vertexCount;
  const pos = mesh.positions;
  const prims = sdf.prims;
  const P = prims.length;
  const out = new Float32Array(P);
  const dominant = new Int32Array(n);
  const wantSkin = !!opts.skin;
  const skinIndex = wantSkin ? new Uint16Array(n * 4) : null;
  const skinWeight = wantSkin ? new Float32Array(n * 4) : null;
  const sigma = opts.sigma || 0.012;
  const boneAcc = wantSkin ? new Float32Array(opts.boneCount || 64) : null;
  const touched = [];
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    sdf.detail(x, y, z, out);
    let best = 0, bestD = Infinity;
    for (let p = 0; p < P; p++) {
      const pr = prims[p];
      if (pr.op === 'sub' || pr.op === 'smoothSub' || pr.op === 'inter' || pr.op === 'smoothInter' || pr.noMat) continue;
      const d = out[p];
      // Prefer primitives whose surface is at the vertex (|d| small). Priority lets
      // clothing win exact ties with the body underneath.
      const score = Math.abs(d) - (pr.priority || 0) * 1e-4;
      if (score < bestD) { bestD = score; best = p; }
    }
    dominant[i] = best;
    if (wantSkin) {
      touched.length = 0;
      let dmin = Infinity;
      for (let p = 0; p < P; p++) {
        const pr = prims[p];
        if (pr.op === 'sub' || pr.op === 'smoothSub' || pr.op === 'inter' || pr.op === 'smoothInter' || pr.noSkin) continue;
        const d = Math.abs(out[p]);
        if (d < dmin) dmin = d;
      }
      for (let p = 0; p < P; p++) {
        const pr = prims[p];
        if (pr.op === 'sub' || pr.op === 'smoothSub' || pr.op === 'inter' || pr.op === 'smoothInter' || pr.noSkin) continue;
        const d = Math.abs(out[p]) - dmin;
        if (d > sigma * 6) continue;
        const w = Math.exp(-d / sigma);
        if (pr.bones) {
          for (const [b, bw] of pr.bones) { if (boneAcc[b] === 0) touched.push(b); boneAcc[b] += w * bw; }
        } else {
          const b = pr.bone | 0;
          if (boneAcc[b] === 0) touched.push(b);
          boneAcc[b] += w;
        }
      }
      // Top 4 bones.
      touched.sort((a, b) => boneAcc[b] - boneAcc[a]);
      let sum = 0;
      const m = Math.min(4, touched.length);
      for (let t = 0; t < m; t++) sum += boneAcc[touched[t]];
      for (let t = 0; t < 4; t++) {
        if (t < m && sum > 0) {
          skinIndex[i * 4 + t] = touched[t];
          skinWeight[i * 4 + t] = boneAcc[touched[t]] / sum;
        } else { skinIndex[i * 4 + t] = 0; skinWeight[i * 4 + t] = 0; }
      }
      for (const b of touched) boneAcc[b] = 0;
    }
    if ((i & 511) === 0 && ctx && ctx.shouldYield()) yield;
  }
  return { dominant, skinIndex, skinWeight };
}

// Convenience: full extraction. Returns mesh data with normals, AO and analysis.
export function* extractSDFMesh(sdf, opts, ctx) {
  const voxel = opts.voxel;
  let b = opts.bounds || sdf.bounds(voxel * 2);
  if (opts.tighten !== false) b = yield* tightBounds(sdf.field, b, voxel * 4, ctx);
  const grid = yield* sampleGrid(sdf.field, b, voxel, ctx, opts.onProgress ? (f) => opts.onProgress(f * 0.6) : null);
  const mesh = yield* surfaceNets(grid, ctx);
  if (opts.onProgress) opts.onProgress(0.7);
  yield* refineSurface(sdf.field, mesh, voxel, ctx, opts.refine ?? 2);
  if (opts.onProgress) opts.onProgress(0.8);
  if (opts.ao !== false) mesh.ao = yield* bakeAO(sdf.field, mesh, opts.aoScale || voxel * 6, ctx);
  if (opts.onProgress) opts.onProgress(0.9);
  const analysis = yield* analyzeVertices(sdf, mesh, opts, ctx);
  Object.assign(mesh, analysis);
  if (opts.onProgress) opts.onProgress(1);
  return mesh;
}

// Find the surface point along a ray from `origin` in direction `dir` (sphere tracing).
export function raymarch(field, origin, dir, maxDist = 2, eps = 0.0005) {
  let t = 0;
  for (let i = 0; i < 128 && t < maxDist; i++) {
    const x = origin[0] + dir[0] * t, y = origin[1] + dir[1] * t, z = origin[2] + dir[2] * t;
    const d = field(x, y, z);
    if (Math.abs(d) < eps) return [x, y, z, t];
    t += Math.max(Math.abs(d) * 0.8, eps * 0.5) * Math.sign(d || 1);
    if (t < 0) t = 0;
  }
  return null;
}

export function gradient(field, x, y, z, e = 0.001) {
  const gx = field(x + e, y, z) - field(x - e, y, z);
  const gy = field(x, y + e, z) - field(x, y - e, z);
  const gz = field(x, y, z + e) - field(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}
