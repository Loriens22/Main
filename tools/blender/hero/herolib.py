# Hero buildings in Blender: the landmarks of a line modelled at real scale on their OSM footprints, lit in
# Cycles and exported for the game (src/world/HeroBuildings.js).
#
#   blenv/bin/python tools/blender/hero/<building>.py [--preview] [--samples N]
#
# Pipeline of every building script:
#   1. the footprints (and the terrain, sampled exactly like src/world/Heightfield.js) come from the line's world
#      pack, so the model sits on the same ground and outlines as the rest of the game;
#   2. the geometry is built in game coordinates (x east, y up, z south) with the HB builder below: every face
#      gets a material whose NAME tells the game what to put on it (see HeroBuildings.js):
#         cw:<preset>   curtain wall / window grid (procedural, lit windows at night), UV0 in metres
#         lf:<kind>:<#hex>  tiling stone / concrete / plaster with normal map, UV0 in metres
#         sign:<id>     a sign drawn by the game, UV0 0..1 over the sign face
#         glow:<id>     emissive at night (LED lines, lit soffits, lamps)
#         glass:<id>    transparent glazing
#         water         fountain water
#         std:<id>      plain PBR (colour / roughness / metalness exported with the GLB)
#   3. a second UV set (lightmap) is packed over the whole building and Cycles bakes ambient occlusion into it
#      (the contact shadows of every recess, fin, ledge and railing), written as src/data/hero/<name>_ao.webp;
#   4. the GLB is exported and shrunk by tools/optimize_glb.mjs (quantized, meshopt-compressed).
import base64
import gzip
import json
import math
import os
import subprocess
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT_DIR = os.path.join(ROOT, 'src', 'data', 'hero')
BASE_ELEVATION = 520.0
UV_RANGE = 1024.0  # UV0 metres are stored as 0.5 + m / UV_RANGE (16-bit: 1.6 cm steps)
SIGN_UV = 100.0  # explicit (sign) UVs 0..1 are stored x SIGN_UV, so a sign gets 6400 steps, not 64
ARGS = sys.argv[1:]
STATS = '--stats' in ARGS


def arg(name, default=None, cast=str):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith('--'):
            return cast(ARGS[i + 1])
        return True
    return default


# ------------------------------------------------------------------ world pack
def _line(d):
    a = np.cumsum(np.asarray(d, dtype=np.int64).reshape(-1, 2), axis=0) / 10.0
    return [(float(x), float(z)) for x, z in a]


def _grid(g):
    h = (g['base'] + np.cumsum(np.asarray(g['d'], dtype=np.float64)) / g['scale']).astype(np.float32)
    return dict(x0=g['x0'], z0=g['z0'], dx=g['dx'], nx=g['nx'], nz=g['nz'], h=h)


def _tri(g, x, z):
    fx = (x - g['x0']) / g['dx']; fz = (z - g['z0']) / g['dx']
    fx = max(0.0, min(g['nx'] - 1.0001, fx)); fz = max(0.0, min(g['nz'] - 1.0001, fz))
    i = int(math.floor(fx)); j = int(math.floor(fz))
    u = fx - i; v = fz - j
    h = g['h']; nx = g['nx']
    h00 = float(h[j * nx + i]); h10 = float(h[j * nx + i + 1]); h01 = float(h[(j + 1) * nx + i]); h11 = float(h[(j + 1) * nx + i + 1])
    if u + v <= 1:
        return h00 + (h10 - h00) * u + (h01 - h00) * v
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v)


class Pack:
    """The line's world pack: buildings (outline, height), areas, roads and the terrain."""

    def __init__(self, line):
        name = 'world.pack.b64' if line == '280' else f'world{line}.pack.b64'
        p = json.loads(gzip.decompress(base64.b64decode(open(os.path.join(ROOT, 'src', 'data', name)).read())))
        self.p = p
        self.near = _grid(p['dem']['near'])
        self.far = _grid(p['dem']['far'])
        n = self.near
        self.box = (n['x0'], n['z0'], n['x0'] + (n['nx'] - 1) * n['dx'], n['z0'] + (n['nz'] - 1) * n['dx'])
        self.buildings = []
        for i, b in enumerate(p['buildings']):
            pts = _line(b['p'])
            self.buildings.append(dict(id=i, pts=pts, h=b['h'] / 10, minH=(b.get('m') or 0) / 10, holes=[_line(o) for o in b.get('o', [])],
                                       cx=sum(q[0] for q in pts) / len(pts), cz=sum(q[1] for q in pts) / len(pts)))
        self.areas = [dict(type=p['areaTypes'][a['t']], pts=_line(a['p'])) for a in p['areas']]
        self.roads = [dict(cls=p['roadClasses'][r['c']], w=r['w'] / 10, name=p['names'][r['n']] if r['n'] >= 0 else None, pts=_line(r['p'])) for r in p['roads']]

    def y(self, x, z):
        """Ground elevation in game y, the same triangles as the terrain mesh (Heightfield.heightAt)."""
        x0, z0, x1, z1 = self.box
        g = self.near if (x0 <= x <= x1 and z0 <= z <= z1) else self.far
        return _tri(g, x, z) - BASE_ELEVATION

    def building(self, x, z, r=2.0):
        """The pack building whose vertex-average centroid is within r of (x, z) (the landmark matching rule)."""
        best = None
        for b in self.buildings:
            d = math.hypot(b['cx'] - x, b['cz'] - z)
            if d < r and (best is None or d < best[0]):
                best = (d, b)
        if not best:
            raise KeyError(f'no building at {x}, {z}')
        return best[1]


# ------------------------------------------------------------------ 2D helpers (x, z)
def area2(pts):
    s = 0.0
    for i in range(len(pts)):
        x0, z0 = pts[i]; x1, z1 = pts[(i + 1) % len(pts)]
        s += x0 * z1 - x1 * z0
    return s / 2


def orient(pts):
    """Canonical winding (negative signed area in x-z): walls built edge by edge face out, caps face up."""
    pts = [tuple(p) for p in pts]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts if area2(pts) < 0 else pts[::-1]


def edges(pts):
    """Edges of an oriented polygon: a, b, length, unit tangent t, outward normal n."""
    out = []
    for i in range(len(pts)):
        a = pts[i]; b = pts[(i + 1) % len(pts)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1e-9
        t = (dx / L, dz / L)
        out.append(dict(a=a, b=b, L=L, t=t, n=(-t[1], t[0]), i=i))
    return out


def offset(pts, d):
    """Mitred offset of an oriented polygon, outwards by d (negative = inwards)."""
    E = edges(pts)
    out = []
    for i in range(len(pts)):
        e0 = E[i - 1]; e1 = E[i]
        nx, nz = e0['n'][0] + e1['n'][0], e0['n'][1] + e1['n'][1]
        l = math.hypot(nx, nz) or 1e-9
        nx, nz = nx / l, nz / l
        c = nx * e1['n'][0] + nz * e1['n'][1]
        k = d / max(c, 0.25)
        out.append((pts[i][0] + nx * k, pts[i][1] + nz * k))
    return out


def centroid(pts):
    a = 0; cx = 0; cz = 0
    for i in range(len(pts)):
        x0, z0 = pts[i]; x1, z1 = pts[(i + 1) % len(pts)]
        c = x0 * z1 - x1 * z0
        a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c
    a /= 2
    return (cx / (6 * a), cz / (6 * a)) if abs(a) > 1e-9 else (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def inside(pts, x, z):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, zi = pts[i]; xj, zj = pts[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c


def simplify(pts, tol=0.3):
    """Drops vertices that lie within tol of the line through their neighbours (OSM outlines have many)."""
    pts = list(pts)
    changed = True
    while changed and len(pts) > 3:
        changed = False
        for i in range(len(pts)):
            a = pts[i - 1]; b = pts[i]; c = pts[(i + 1) % len(pts)]
            dx, dz = c[0] - a[0], c[1] - a[1]
            L = math.hypot(dx, dz) or 1e-9
            d = abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / L
            if d < tol:
                pts.pop(i)
                changed = True
                break
    return pts


# ------------------------------------------------------------------ builder
class HB:
    """Mesh builder in game coordinates with a frame stack (push(x, y, z, yaw): local +z = (sin yaw, cos yaw))."""

    def __init__(self, name, anchor, base=0.0):
        """anchor = (x, z) of the model origin; base = the game y the model's y = 0 sits at (its datum).
        Coordinates given to the builder are game x / z and y relative to the datum."""
        self.name = name
        self.ax, self.az = anchor
        self.ay = 0.0
        self.base = base
        self.V = []
        self.F = []  # (vertex indices, material, smooth, explicit uvs or None)
        self.M = {}  # material name -> (rgb, rough, metal, emission)
        self.stack = [np.eye(4)]

    # --- materials
    def mat(self, name, rgb=(0.7, 0.7, 0.7), rough=0.6, metal=0.0, emit=None):
        if name not in self.M:
            self.M[name] = (tuple(rgb), rough, metal, emit)
        return name

    # --- frames
    def push(self, x=0, y=0, z=0, yaw=0.0):
        c, s = math.cos(yaw), math.sin(yaw)
        T = np.array([[c, 0, s, x], [0, 1, 0, y], [-s, 0, c, z], [0, 0, 0, 1]], dtype=np.float64)
        self.stack.append(self.stack[-1] @ T)

    def pop(self):
        self.stack.pop()

    def P(self, p):
        m = self.stack[-1]
        return (m[0, 0] * p[0] + m[0, 1] * p[1] + m[0, 2] * p[2] + m[0, 3],
                m[1, 0] * p[0] + m[1, 1] * p[1] + m[1, 2] * p[2] + m[1, 3],
                m[2, 0] * p[0] + m[2, 1] * p[1] + m[2, 2] * p[2] + m[2, 3])

    def vtx(self, p):
        self.V.append(self.P(p))
        return len(self.V) - 1

    # --- primitives (points in the current frame)
    def face(self, mat, pts, uv=None, smooth=False):
        idx = [self.vtx(p) for p in pts]
        self.F.append((idx, mat, smooth, uv))

    def quad(self, mat, a, b, c, d, uv=None):
        self.face(mat, [a, b, c, d], uv)

    def wall(self, mat, a, b, y0, y1):
        """Vertical quad over the edge a -> b (x, z) of an oriented outline: faces out."""
        if y1 - y0 < 1e-4:
            return
        self.face(mat, [(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])])

    def ring(self, mat, pts, y0, y1, only=None):
        for e in edges(pts):
            if only is None or only(e):
                self.wall(mat, e['a'], e['b'], y0, y1)

    def cap(self, mat, pts, y, down=False, holes=()):
        loops = [[Vector((p[0], p[1], 0)) for p in pts]] + [[Vector((p[0], p[1], 0)) for p in h] for h in holes]
        allp = [p for l in loops for p in l]
        for t in tessellate_polygon(loops):
            tri = [allp[i] for i in t]
            # tessellate_polygon's winding: make it face up (or down)
            ax, az = tri[1].x - tri[0].x, tri[1].y - tri[0].y
            bx, bz = tri[2].x - tri[0].x, tri[2].y - tri[0].y
            up = (az * bx - ax * bz) > 0
            if up == down:
                tri = tri[::-1]
            self.face(mat, [(q.x, y, q.y) for q in tri])

    def prism(self, mat, pts, y0, y1, top=None, bottom=None):
        pts = orient(pts)
        self.ring(mat, pts, y0, y1)
        if top is not False:
            self.cap(top or mat, pts, y1)
        if bottom:
            self.cap(bottom, pts, y0, down=True)

    def box(self, mat, cx, y0, cz, w, h, d, yaw=0.0, top=True, bottom=False):
        """Box w (local x) by d (local z), from y0 to y0 + h, centred on (cx, cz) of the current frame."""
        self.push(cx, 0, cz, yaw)
        pts = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
        pts = orient(pts)
        self.ring(mat, pts, y0, y0 + h)
        if top:
            self.cap(mat if top is True else top, pts, y0 + h)
        if bottom:
            self.cap(mat, pts, y0, down=True)
        self.pop()

    def beam(self, mat, p, q, w, h=None, up=(0, 1, 0)):
        """A rectangular bar w x h (h defaults to w) from p to q (frame points)."""
        h = h or w
        p = np.array(p, dtype=float); q = np.array(q, dtype=float)
        d = q - p
        L = np.linalg.norm(d)
        if L < 1e-6:
            return
        d /= L
        u = np.array(up, dtype=float)
        if abs(np.dot(u, d)) > 0.95:
            u = np.array([1.0, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 0, 1.0])
        s = np.cross(d, u); s /= np.linalg.norm(s)
        u = np.cross(s, d)
        c = [(-s * w / 2 - u * h / 2), (s * w / 2 - u * h / 2), (s * w / 2 + u * h / 2), (-s * w / 2 + u * h / 2)]
        A = [tuple(p + o) for o in c]; B = [tuple(q + o) for o in c]
        for i in range(4):
            j = (i + 1) % 4
            self.face(mat, [A[i], B[i], B[j], A[j]])
        self.face(mat, [A[0], A[1], A[2], A[3]])
        self.face(mat, [B[3], B[2], B[1], B[0]])

    def tube(self, mat, p, q, r, segs=8, caps=True):
        """Round bar from p to q (smooth sides)."""
        p = np.array(p, dtype=float); q = np.array(q, dtype=float)
        d = q - p
        L = np.linalg.norm(d)
        if L < 1e-6:
            return
        d /= L
        a = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
        s = np.cross(d, a); s /= np.linalg.norm(s)
        u = np.cross(s, d)
        ia, ib = [], []
        for k in range(segs):
            ang = 2 * math.pi * k / segs
            o = (s * math.cos(ang) + u * math.sin(ang)) * r
            ia.append(self.vtx(tuple(p + o))); ib.append(self.vtx(tuple(q + o)))
        for k in range(segs):
            j = (k + 1) % segs
            self.F.append(([ia[k], ib[k], ib[j], ia[j]], mat, True, None))
        if caps:
            self.face(mat, [tuple(p + (s * math.cos(2 * math.pi * k / segs) + u * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
            self.face(mat, [tuple(q + (s * math.cos(2 * math.pi * k / segs) + u * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)][::-1])

    def cyl(self, mat, x, y0, z, r, h, segs=16, top=True, r1=None):
        """Vertical cylinder (smooth sides), optionally tapered to r1."""
        r1 = r if r1 is None else r1
        ia, ib = [], []
        for k in range(segs):
            ang = 2 * math.pi * k / segs
            ia.append(self.vtx((x + math.cos(ang) * r, y0, z - math.sin(ang) * r)))
            ib.append(self.vtx((x + math.cos(ang) * r1, y0 + h, z - math.sin(ang) * r1)))
        for k in range(segs):
            j = (k + 1) % segs
            self.F.append(([ia[k], ia[j], ib[j], ib[k]], mat, True, None))
        if top:
            self.face(mat if top is True else top, [(x + math.cos(2 * math.pi * k / segs) * r1, y0 + h, z - math.sin(2 * math.pi * k / segs) * r1) for k in range(segs)])

    def sphere(self, mat, c, r, segs=10, rings=6):
        idx = []
        for i in range(rings + 1):
            ph = math.pi * i / rings
            row = []
            for k in range(segs):
                th = 2 * math.pi * k / segs
                row.append(self.vtx((c[0] + r * math.sin(ph) * math.cos(th), c[1] + r * math.cos(ph), c[2] - r * math.sin(ph) * math.sin(th))))
            idx.append(row)
        for i in range(rings):
            for k in range(segs):
                j = (k + 1) % segs
                self.F.append(([idx[i][k], idx[i + 1][k], idx[i + 1][j], idx[i][j]], mat, True, None))

    def sweep(self, mat, path, prof, closed=False):
        """Extrudes a 2D profile [(s, y)] (s = outward offset from the path in the horizontal plane) along a
        polyline path [(x, y, z)] in the current frame: cornices, copings, handrails, kerbs."""
        n = len(path)
        rows = []
        for i in range(n):
            p = path[i]
            a = path[i - 1] if (i > 0 or closed) else None
            b = path[(i + 1) % n] if (i < n - 1 or closed) else None
            ts = []
            for u, v in ((a, p), (p, b)):
                if u is None or v is None:
                    continue
                dx, dz = v[0] - u[0], v[2] - u[2]
                L = math.hypot(dx, dz) or 1e-9
                ts.append((dx / L, dz / L))
            tx = sum(t[0] for t in ts); tz = sum(t[1] for t in ts)
            L = math.hypot(tx, tz) or 1e-9
            tx, tz = tx / L, tz / L
            nx, nz = -tz, tx
            k = 1.0
            if len(ts) == 2:
                k = 1.0 / max(0.3, ts[0][0] * tx + ts[0][1] * tz)
            rows.append([self.vtx((p[0] + nx * s * k, p[1] + y, p[2] + nz * s * k)) for s, y in prof])
        m = len(prof)
        for i in range(n if closed else n - 1):
            A, B = rows[i], rows[(i + 1) % n]
            for j in range(m - 1):
                self.F.append(([A[j], B[j], B[j + 1], A[j + 1]], mat, False, None))

    def sign(self, mat, x0, y0, x1, y1, z=0.0):
        """A sign face in the frame's x-y plane at z, facing +z, UVs 0..1."""
        self.face(mat, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])

    # --- to Blender
    def build(self):
        t0 = time.time()
        V = np.array(self.V, dtype=np.float64)
        V[:, 0] -= self.ax; V[:, 1] -= self.ay; V[:, 2] -= self.az
        Vb = np.stack([V[:, 0], -V[:, 2], V[:, 1]], axis=1)
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(Vb.tolist(), [], [f[0] for f in self.F])
        names = sorted(self.M.keys() | {f[1] for f in self.F})
        for n in names:
            me.materials.append(self._bmat(n))
        mi = {n: i for i, n in enumerate(names)}
        me.polygons.foreach_set('material_index', [mi[f[1]] for f in self.F])
        me.polygons.foreach_set('use_smooth', [bool(f[2]) for f in self.F])
        me.update()
        # UV0: metres, projected on each face's plane (walls: along the wall and up; flat: x and z)
        uv = me.uv_layers.new(name='uv0')
        nl = len(me.loops)
        vi = np.empty(nl, dtype=np.int64); me.loops.foreach_get('vertex_index', vi)
        npoly = len(me.polygons)
        ls = np.empty(npoly, dtype=np.int64); me.polygons.foreach_get('loop_start', ls)
        lt = np.empty(npoly, dtype=np.int64); me.polygons.foreach_get('loop_total', lt)
        nrm = np.empty(npoly * 3); me.polygons.foreach_get('normal', nrm)
        nrm = nrm.reshape(-1, 3)
        # game-frame normal and positions
        ng = np.stack([nrm[:, 0], nrm[:, 2], -nrm[:, 1]], axis=1)
        pg = V[vi]
        pid = np.repeat(np.arange(npoly), lt)
        n = ng[pid]
        flat = np.abs(n[:, 1]) > 0.7
        # wall tangent: up x n = (nz, 0, -nx)
        tx, tz = n[:, 2], -n[:, 0]
        tl = np.hypot(tx, tz) + 1e-9
        u = np.where(flat, pg[:, 0], (pg[:, 0] * tx + pg[:, 2] * tz) / tl)
        v = np.where(flat, -pg[:, 2], pg[:, 1])
        U = np.stack([u, v], axis=1)
        for k, f in enumerate(self.F):
            if f[3] is not None:
                s = ls[k]
                U[s:s + len(f[3])] = np.array(f[3], dtype=np.float64) * SIGN_UV
        # metres (relative to the anchor) -> 0.5 + m / UV_RANGE: inside [0, 1], so it is stored as 16-bit like the
        # lightmap UVs; HeroBuildings.js decodes it (UV_RANGE there too)
        if np.abs(U).max() >= UV_RANGE / 2:
            raise ValueError(f'UV0 out of range: {np.abs(U).max():.1f} m')
        uv.data.foreach_set('uv', (0.5 + U / UV_RANGE).astype(np.float32).ravel())
        if STATS:
            from collections import Counter
            c = Counter()
            for f in self.F:
                c[f[1]] += len(f[0])
            print('  vertices by material:', ', '.join(f'{k} {n}' for k, n in c.most_common(14)), flush=True)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        print(f'{self.name}: {len(self.V)} vertices, {sum(len(f[0]) - 2 for f in self.F)} triangles, {len(names)} materials ({time.time() - t0:.1f}s)', flush=True)
        return ob

    def _bmat(self, name):
        m = bpy.data.materials.get(name)
        if m:
            return m
        rgb, rough, metal, emit = self.M.get(name, ((0.7, 0.7, 0.7), 0.6, 0.0, None))
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if name.startswith('glass:'):
            b.inputs['Alpha'].default_value = 0.35
        if emit:
            b.inputs['Emission Color'].default_value = (*emit, 1)
            b.inputs['Emission Strength'].default_value = 0.0
        return m


# ------------------------------------------------------------------ scene, bake, export
def reset(samples=64):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    w = bpy.data.worlds.new('World')
    sc.world = w
    return sc


def ground_patch(pack, x0, z0, x1, z1, step=4.0, name='ground'):
    """The terrain round the site as an occluder for the bake (and the preview)."""
    xs = np.arange(x0, x1 + step, step); zs = np.arange(z0, z1 + step, step)
    verts = [(x, z, pack.y(x, z)) for z in zs for x in xs]
    nx = len(xs)
    faces = []
    for j in range(len(zs) - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + nx, a + nx + 1, a + 1))
    return verts, faces


def add_ground(pack, hb, margin=40, step=4.0, mat_rgb=(0.42, 0.44, 0.40)):
    xs = [p[0] for p in hb.V]; zs = [p[2] for p in hb.V]
    verts, faces = ground_patch(pack, min(xs) - margin, min(zs) - margin, max(xs) + margin, max(zs) + margin, step)
    vb = [(x - hb.ax, -(z - hb.az), y - hb.base - 0.02) for x, z, y in verts]
    me = bpy.data.meshes.new('ground')
    me.from_pydata(vb, [], faces)
    m = bpy.data.materials.new('ground')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*mat_rgb, 1)
    me.materials.append(m)
    ob = bpy.data.objects.new('ground', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lightmap_uv(ob, margin=0.0015):
    me = ob.data
    lm = me.uv_layers.new(name='lightmap')
    me.uv_layers.active = lm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t0 = time.time()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f'  lightmap UVs: {time.time() - t0:.1f}s', flush=True)
    return lm


def bake_ao(ob, size=2048, distance=4.0, samples=64):
    sc = bpy.context.scene
    sc.world.light_settings.distance = distance
    sc.cycles.samples = samples
    img = bpy.data.images.new('ao', size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    nodes = []
    for m in ob.data.materials:
        n = m.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = img
        m.node_tree.nodes.active = n
        nodes.append((m, n))
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.data.uv_layers.active = ob.data.uv_layers['lightmap']
    bk = sc.render.bake
    bk.margin_type = 'EXTEND'
    bk.target = 'IMAGE_TEXTURES'
    t0 = time.time()
    bpy.ops.object.bake(type='AO', margin=4, use_clear=True)
    print(f'  AO bake {size}px x {samples} samples: {time.time() - t0:.1f}s', flush=True)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    for m, n in nodes:
        m.node_tree.nodes.remove(n)
    ob.data.uv_layers.active = ob.data.uv_layers['uv0']
    return px.reshape(size, size, 4)[::-1, :, 0]  # top row first


def save_ao(ao, name, quality=82, floor=0.12):
    from PIL import Image, ImageFilter
    a = np.clip(ao, floor, 1.0)
    # sRGB-encoded grey (the game samples it as sRGB, so the darks keep their steps)
    s = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    im = Image.fromarray(np.clip(s * 255 + 0.5, 0, 255).astype(np.uint8), 'L')
    im = im.filter(ImageFilter.GaussianBlur(0.6))  # the bake's sampling noise
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{name}_ao.webp')
    im.convert('RGB').save(path, 'WEBP', quality=quality, method=6)
    print(f'  {os.path.relpath(path, ROOT)}: {os.path.getsize(path) // 1024} KB', flush=True)
    return path


def export(ob, name, meta):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    me = ob.data
    me.uv_layers.active = me.uv_layers['uv0']
    me.uv_layers['uv0'].active_render = True
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, f'.{name}_raw.glb')
    bpy.ops.export_scene.gltf(filepath=tmp, export_format='GLB', use_selection=True, export_apply=True,
                              export_tangents=False, export_materials='EXPORT', export_image_format='NONE',
                              export_yup=True, export_texcoords=True, export_normals=True, export_extras=False)
    out = os.path.join(OUT_DIR, f'{name}.glb')
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'optimize_glb.mjs'), tmp, out], capture_output=True, text=True)
    print(' ', r.stdout.strip(), r.stderr.strip()[-400:], flush=True)
    os.remove(tmp)
    with open(os.path.join(OUT_DIR, f'{name}.json'), 'w') as f:
        json.dump(meta, f, indent=1)


def preview(path, cam, target, lens=28, res=(1280, 720), sun=(0.9, 0.0, 2.2), samples=24, strength=1.0):
    """Cycles still from a camera at game point cam looking at game point target (relative to the anchor)."""
    sc = bpy.context.scene
    co = bpy.data.objects.get('pcam')
    if co is None:
        cd = bpy.data.cameras.new('pcam')
        co = bpy.data.objects.new('pcam', cd)
        sc.collection.objects.link(co)
        sl = bpy.data.lights.new('psun', 'SUN')
        sl.energy = 4.0
        sl.angle = math.radians(1.5)
        so = bpy.data.objects.new('psun', sl)
        so.rotation_euler = sun
        sc.collection.objects.link(so)
        sc.world.use_nodes = True
        bg = sc.world.node_tree.nodes['Background']
        bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1)
        bg.inputs['Strength'].default_value = strength
    c = Vector((cam[0], -cam[2], cam[1])); t = Vector((target[0], -target[2], target[1]))
    co.location = c
    co.rotation_euler = (t - c).to_track_quat('-Z', 'Y').to_euler()
    co.data.lens = lens
    co.data.clip_end = 5000
    sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'JPEG'
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    sc.cycles.use_denoising = False
    print(f'  preview {os.path.basename(path)} ({time.time() - t0:.0f}s)', flush=True)
