"""Mars: the cave system under the Gale crater plain (GAME ALTERNATE-HISTORY EXTENSION: no such voids, lakes or
pressurised chambers are known on Mars). Model origin = the centre of the terrain opening on the levelled ground
(z = 0 is the ground). The trench runs along -Y from the surface; distances in metres.

  mars_cave.glb   the collapse trench (walkable ramp), the gallery with the ice window, the ice-curtain seal,
                  the lake hall (shores, seep terraces, the brine lake), the geothermal channel and its pool,
                  the submerged tunnel and the subglacial basin under its ice shelf; the ground cap round the
                  opening; markers for the habitats (named 'spot' markers) and the water bodies
  mars_rov.glb    a small tethered survey ROV (frame, foam block, thrusters, lamps, camera dome)

Layout (model frame, Blender axes):
  trench   x in [-7, 7], floor from (y +24, z 0) down to (y -22, z -24)
  gallery  from the trench end to the lake hall, floor -24 .. -35, the seal at y ~ -96
  hall     ellipsoid centre (30, -145, -32), radii (28, 36, 16); lake level -42
  channel  from the hall's east wall to the pool at (112, -130), stream level -41
  basin    ellipsoid centre (30, -210, -48), radii (30, 24, 38) cut by the ice shelf at -42.6
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from bio import tube  # noqa: E402
from rocks import basalt_block  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector, noise  # noqa: E402

TAU = math.tau
LEVEL = -42.0          # the lake's (and the basin's) water level
STREAM = -41.0         # the geothermal channel's stream and pool
HALL = (Vector((30, -145, -32)), Vector((28, 36, 16)))
BASIN = (Vector((30, -210, -48)), Vector((30, 24, 38)))
POOL = (Vector((112, -130, -38)), Vector((10, 10, 6)))
SHELF = -42.6


def fbm(p, o=4, lac=2.03, g=0.5):
    a, f, t = 1.0, 1.0, 0.0
    for _ in range(o):
        t += a * noise.noise(p * f)
        a *= g
        f *= lac
    return t


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def oriented(verts, faces, inward):
    """wind every face so its normal points into the open space (inward(centre) gives that direction)"""
    out = []
    for f in faces:
        a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
        n = (b - a).cross(c - a)
        ctr = sum((verts[i] for i in f), Vector()) / len(f)
        out.append(tuple(reversed(f)) if n.dot(inward(ctr)) < 0 else f)
    return out


def emit(P, verts, faces, mat, inward):
    P.mesh([tuple(v) for v in verts], oriented(verts, faces, inward), mat=mat, recalc=False, bevel=0)


# ------------------------------------------------------------------------------------------------ the floors
def trench_floor(y):
    return 0.0 if y >= 24 else max(-24.0, (y - 24) * 24.0 / 46.0)


def hall_floor(x, y):
    u, v = x - HALL[0].x, y - HALL[0].y
    d = math.hypot(u / 20.0, (v + 10) / 28.0)
    if d < 1:
        f = LEVEL - 8.0 * (1 - d * d)
    else:
        f = LEVEL + 7.0 * smooth(1.0, 1.55, d)
    # seep terraces on the west shore: shallow steps of precipitate
    if u < -8:
        f += 0.45 * math.floor((d - 1.0) * 9.0) * smooth(1.0, 1.15, d) * 0.25
    return f + 0.35 * fbm(Vector((x * 0.15, y * 0.15, 0.3)), 3)


def pool_floor(x, y):
    c, r = POOL
    d = math.hypot((x - c.x) / r.x, (y - c.y) / r.y)
    return STREAM - 5.0 * max(0.0, 1 - d * d) + 1.0 * smooth(0.8, 1.1, d) + 0.25 * fbm(Vector((x * 0.2, y * 0.2, 1.1)), 2)


# ------------------------------------------------------------------------------------------------ tubes
def cave_tube(P, path, mat, segs=28, n=None, carve=None, seed=0.0):
    """a passage lofted through floor points path [(point, half_width, height)]: a flat, slightly dished floor and
    an arched roof, the walls worn by multi-scale noise; carve(p) -> True drops a face (junctions)"""
    pts = [V_(p) for p, w, h in path]
    from bio import catmull
    n = n or max(12, int(sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)) / 1.4))
    S = catmull(pts, n)
    W = [None] * n
    for i in range(n):
        f = i / (n - 1) * (len(path) - 1)
        j = min(int(f), len(path) - 2)
        u = f - j
        W[i] = (path[j][1] * (1 - u) + path[j + 1][1] * u, path[j][2] * (1 - u) + path[j + 1][2] * u)
    verts, faces = [], []
    off = Vector((seed * 3.1, seed * 1.7, seed * 0.7))
    for i in range(n):
        T = (S[min(n - 1, i + 1)] - S[max(0, i - 1)]).normalized()
        L = T.cross(Vector((0, 0, 1))).normalized()
        w, h = W[i]
        for k in range(segs):
            a = k / segs * TAU
            c, s = math.cos(a), math.sin(a)
            x = w * c
            z = h * s if s >= 0 else 0.5 * s * (0.3 + 0.7 * abs(c))
            p = S[i] + L * x + Vector((0, 0, z))
            q = p * 0.18 + off
            wall = max(0.0, s) * 0.8 + 0.2 if s >= 0 else 0.15
            rad = (L * c + Vector((0, 0, max(s, 0.0)))).normalized() if s > -0.3 else Vector((0, 0, -1))
            p = p + rad * (fbm(q, 4) * 1.1 * wall + fbm(q * 4.0, 2) * 0.25 * wall)
            verts.append(p)
    for i in range(n - 1):
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            f = (a, b, b + segs, a + segs)
            if carve and carve(sum((verts[x] for x in f), Vector()) / 4):
                continue
            faces.append(f)
    axis = S

    def inward(c):
        best = min(axis, key=lambda q: (q - c).length_squared)
        return best + Vector((0, 0, 1.5)) - c
    emit(P, verts, faces, mat, inward)
    return S


def V_(p):
    return Vector(p)


def chamber(P, c, r, mat, floor_fn, drop_above=None, carve=None, seed=0.0, res=56):
    """an ellipsoidal chamber: the inside of a noisy ellipsoid, its lower part replaced by a floor surface
    (floor_fn(x, y)), optionally cut off above a height (an ice shelf takes over)"""
    verts, faces = [], []
    rings = res // 2
    off = Vector((seed, seed * 2.3, seed * 0.7))
    for j in range(rings + 1):
        th = math.pi * j / rings
        for k in range(res):
            ph = TAU * k / res
            d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            p = c + Vector((d.x * r.x, d.y * r.y, d.z * r.z))
            p = p + d * (fbm(p * 0.09 + off, 4) * 2.6 + fbm(p * 0.4 + off, 2) * 0.5)
            verts.append(p)
    for j in range(rings):
        for k in range(res):
            a, b = j * res + k, j * res + (k + 1) % res
            f = (a, b, b + res, a + res)
            ctr = sum((verts[x] for x in f), Vector()) / 4
            if floor_fn and ctr.z < floor_fn(ctr.x, ctr.y) - 0.6:
                continue
            if drop_above is not None and ctr.z > drop_above:
                continue
            if carve and carve(ctr):
                continue
            faces.append(f)
    emit(P, verts, faces, mat, lambda q: c - q)


def grid(P, x0, x1, y0, y1, step, zfn, keep, mat, up=True):
    """a height-field patch (floors, ice shelf, the ground cap); keep(x, y) selects its cells"""
    nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    verts, idx, faces = [], {}, []
    for i in range(nx):
        for j in range(ny):
            x, y = x0 + i * step, y0 + j * step
            idx[(i, j)] = len(verts)
            verts.append(Vector((x, y, zfn(x, y))))
    for i in range(nx - 1):
        for j in range(ny - 1):
            cx, cy = x0 + (i + 0.5) * step, y0 + (j + 0.5) * step
            if keep(cx, cy):
                faces.append((idx[(i, j)], idx[(i + 1, j)], idx[(i + 1, j + 1)], idx[(i, j + 1)]))
    used = sorted({v for f in faces for v in f})
    remap = {v: n for n, v in enumerate(used)}
    vv = [verts[v] for v in used]
    ff = [tuple(remap[v] for v in f) for f in faces]
    emit(P, vv, ff, mat, (lambda q: Vector((0, 0, 1))) if up else (lambda q: Vector((0, 0, -1))))
    return vv


def near_segment(p, a, b, r):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length < r


# ------------------------------------------------------------------------------------------------ the build
def build_cave():
    reset()
    rnd = random.Random(31)
    R_HOLE = 30.0
    TW = 7.0
    # ---------------------------------------------------------------- the ground cap round the opening
    Cap = Part("cave_cap")

    def in_trench(x, y):
        edge = TW + 0.8 * noise.noise(Vector((y * 0.2, 0.5, 0.0)))
        return abs(x) < edge and -24 < y < 24.5

    def cap_z(x, y):
        r = math.hypot(x, y)
        return 0.02 * noise.noise(Vector((x * 0.5, y * 0.5, 2.0))) * smooth(R_HOLE - 4, R_HOLE - 6, r)
    vv = grid(Cap, -R_HOLE - 1, R_HOLE + 1, -R_HOLE - 1, R_HOLE + 1, 1.0, cap_z, lambda x, y: math.hypot(x, y) < R_HOLE + 0.4 and not in_trench(x, y), "mars_regolith")
    # pull the outer ring exactly onto the opening's edge so the cap meets the ground there
    for v in Cap.bm.verts:
        r = math.hypot(v.co.x, v.co.y)
        if r > R_HOLE:
            v.co.x *= R_HOLE / r
            v.co.y *= R_HOLE / r
            v.co.z = 0.0
    Cap.finish(sharp=60)
    # ---------------------------------------------------------------- the trench: walls and the rubble ramp
    Tr = Part("cave_trench")
    for side in (-1, 1):
        verts, faces = [], []
        ys = [24.5 - i for i in range(0, 50)]
        nz = 14
        for i, y in enumerate(ys):
            fl = trench_floor(y)
            for k in range(nz + 1):
                f = k / nz
                # the wall runs from below the floor (no gap at its foot) up to the ground
                z = (fl - 1.2) + (0.0 - (fl - 1.2)) * f
                x = side * (TW - 1.2 * (1 - f) + 0.9 * fbm(Vector((y * 0.22, z * 0.22, side * 3.0)), 4) + 0.25 * fbm(Vector((y, z, side)) * 0.9, 2))
                verts.append(Vector((x, y, z if k < nz else 0.0)))
        for i in range(len(ys) - 1):
            for k in range(nz):
                a = i * (nz + 1) + k
                f = (a, a + 1, a + nz + 2, a + nz + 1)
                c = sum((verts[x] for x in f), Vector()) / 4
                if side < 0 and -8.4 < c.y < -3.6 and -15.6 < c.z < -11.6:
                    continue      # the ice window's niche opens here
                faces.append(f)
        emit(Tr, verts, faces, "mars_rock", lambda q, side=side: Vector((-side, 0, 0.2)))
    # the floor (a ramp of collapse rubble and dust) and the end wall with the gallery mouth
    grid(Tr, -TW - 1, TW + 1, -25.5, 24.5, 0.8, lambda x, y: trench_floor(y) + 0.15 * fbm(Vector((x * 0.6, y * 0.6, 4.0)), 3) - 0.6 * (abs(x) / TW) ** 4,
         lambda x, y: abs(x) < TW + 0.6, "mars_regolith")
    mouth_a, mouth_b = Vector((0, -18, -24)), Vector((0, -32, -25))
    verts, faces = [], []
    for i in range(30):
        for k in range(26):
            x = -TW - 1 + i * (2 * TW + 2) / 29
            z = -25 + k * 26 / 25
            verts.append(Vector((x, -24.5 - 0.8 * fbm(Vector((x * 0.25, z * 0.25, 7.0)), 3), z)))
    for i in range(29):
        for k in range(25):
            a = i * 26 + k
            f = (a, a + 26, a + 27, a + 1)
            c = sum((verts[x] for x in f), Vector()) / 4
            if (c.x / 4.4) ** 2 + ((c.z + 24.6) / 6.4) ** 2 < 1:
                continue      # the gallery's mouth: an arch inside the passage's narrowest section
            faces.append(f)
    emit(Tr, verts, faces, "mars_rock", lambda q: Vector((0, 1, 0)))
    for k in range(26):
        y = rnd.uniform(-20, 18)
        x = rnd.choice((-1, 1)) * rnd.uniform(3.5, 6.2)
        s = rnd.uniform(0.4, 1.6)
        basalt_block(Tr, (x, y, trench_floor(y) + s * 0.2), (s * 1.4, s, s * 0.7), (rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 180)), 500 + k,
                     mat="mars_rock", cuts=4, rough=0.7)
    # the ice window in the west wall: a niche behind clear ice, where the iceblooms grow in the light
    Ni = Part("cave_niche")
    S_ = cave_tube(Ni, [((-4.6, -6.0, -15.4), 2.4, 3.8), ((-9.0, -6.0, -15.0), 2.6, 3.8), ((-11.0, -6.2, -14.8), 2.0, 3.0)], "mars_rock", segs=20, n=9, seed=4.0)
    # the niche's back wall: a rough dome closing the far end
    end = S_[-1]
    verts, faces = [end + Vector((-1.4, 0, 1.2))], []
    ring = []
    for k in range(20):
        a = k / 20 * TAU
        ring.append(end + Vector((-0.3, math.cos(a) * 2.6, max(-0.5, math.sin(a) * 3.3) + 0.2)))
    verts += ring
    for k in range(20):
        faces.append((0, 1 + k, 1 + (k + 1) % 20))
    emit(Ni, verts, faces, "mars_rock", lambda q: Vector((1, 0, 0)))
    Ni.finish(sharp=60)
    Ice = Part("cave_ice_window", )
    Ice.box((0.35, 4.6, 3.6), at=(-6.6, -6.0, -13.3), mat="cave_ice", bevel=0.05)
    Ice.finish(sharp=60, col=0)
    Tr.finish(sharp=60)
    # ---------------------------------------------------------------- the gallery, the seal, into the hall
    G = Part("cave_gallery")
    hall_c, hall_r = HALL
    gpath = [((0, -16, -24.2), 5.8, 8.0), ((0, -30, -25.0), 6.0, 8.5), ((2, -46, -26.5), 6.4, 9.0), ((8, -62, -28.0), 6.0, 8.0), ((16, -78, -30.0), 5.4, 7.0),
             ((20, -89, -31.0), 3.0, 4.6), ((21, -95, -31.4), 1.9, 3.4), ((22, -100, -32.0), 2.4, 3.8), ((24, -106, -33.6), 4.6, 6.0), ((26, -116, -35.0), 6.0, 8.0)]
    cave_tube(G, gpath, "mars_rock", segs=30, seed=1.0,
              carve=lambda q: (q.y < -112 and ((q.x - hall_c.x) / hall_r.x) ** 2 + ((q.y - hall_c.y) / hall_r.y) ** 2 + ((q.z - hall_c.z) / hall_r.z) ** 2 < 0.92))
    G.finish(sharp=60)
    Seal = Part("cave_ice_seal")
    # the ice curtain: slabs grown down from the roof of the narrows, a gap left at one side
    for k, (x, y, w) in enumerate(((20.3, -94.2, 1.4), (21.4, -95.6, 1.2), (20.8, -97.0, 1.5))):
        Seal.box((w, 0.3, 2.6), at=(x - 0.6, y, -29.2), rot=(rnd.uniform(-6, 6), 0, rnd.uniform(-20, 20)), mat="cave_ice", bevel=0.08)
    Seal.finish(sharp=60, col=0)
    # ---------------------------------------------------------------- the lake hall
    Hh = Part("cave_hall")
    chan_a, chan_b = Vector((50, -139, -40)), Vector((60, -134, -40))
    tun_a, tun_b = Vector((30, -170, -46)), Vector((30, -182, -50))

    def hall_carve(q):
        if q.y > -118 and abs(q.x - 26) < 8 and q.z < -24:
            return True      # the gallery's entrance
        if near_segment(q, chan_a, chan_b, 6.0) and q.z < -33:
            return True      # the channel's mouth
        if near_segment(q, tun_a + Vector((0, 4, 0)), tun_b, 6.0):
            return True      # the submerged tunnel
        return False
    chamber(Hh, hall_c, hall_r, "mars_rock_wet", hall_floor, carve=hall_carve, seed=2.0, res=64)
    Hf = Part("cave_hall_floor")
    grid(Hf, hall_c.x - hall_r.x, hall_c.x + hall_r.x, hall_c.y - hall_r.y, hall_c.y + hall_r.y, 1.0, hall_floor,
         lambda x, y: (((x - hall_c.x) / (hall_r.x * 0.985)) ** 2 + ((y - hall_c.y) / (hall_r.y * 0.985)) ** 2 < 1.0)
         and not near_segment(Vector((x, y, hall_floor(x, y))), tun_a + Vector((0, 4, 0)), tun_b, 4.5), "cave_mud")
    # mineral columns and fallen blocks on the shores
    for k in range(14):
        a = rnd.uniform(0, TAU)
        x, y = hall_c.x + math.cos(a) * hall_r.x * rnd.uniform(0.72, 0.9), hall_c.y + math.sin(a) * hall_r.y * rnd.uniform(0.72, 0.9)
        s = rnd.uniform(0.6, 2.2)
        basalt_block(Hf, (x, y, hall_floor(x, y) + s * 0.25), (s * 1.3, s, s * 0.8), (rnd.uniform(-15, 15), rnd.uniform(-15, 15), rnd.uniform(0, 180)),
                     600 + k, mat="mars_rock_wet", cuts=4, rough=0.7)
    for k in range(9):
        a = rnd.uniform(0, TAU)
        x, y = hall_c.x + math.cos(a) * hall_r.x * 0.82, hall_c.y + math.sin(a) * hall_r.y * 0.82
        z0 = hall_floor(x, y)
        h = rnd.uniform(2, 5)
        tube(Hf, [(x, y, z0 - 0.3), (x + rnd.uniform(-0.2, 0.2), y + rnd.uniform(-0.2, 0.2), z0 + h * 0.5), (x, y, z0 + h)], [(0, rnd.uniform(0.4, 0.7)), (1, 0.08)],
             "ferric_crust", segs=10, n=8)
    Hf.finish(sharp=60)
    Hh.finish(sharp=60)
    # the lake's surface
    Lk = Part("cave_lake_surface")
    grid(Lk, hall_c.x - hall_r.x, hall_c.x + hall_r.x, hall_c.y - hall_r.y - 6, hall_c.y + hall_r.y, 1.0, lambda x, y: LEVEL,
         lambda x, y: hall_floor(x, y) < LEVEL + 0.25 and ((x - hall_c.x) / hall_r.x) ** 2 + ((y - hall_c.y) / hall_r.y) ** 2 < 1.0, "brine_surface")
    Lk.finish(sharp=60, col=0)
    # ---------------------------------------------------------------- the geothermal channel and its pool
    Ch = Part("cave_channel")
    cpath = [((48, -140, -39.6), 4.0, 6.0), ((60, -134, -40.0), 3.8, 6.0), ((76, -127, -40.3), 3.6, 5.6), ((92, -124, -40.6), 3.8, 6.0), ((104, -127, -40.8), 4.4, 6.4)]

    def chan_carve(q):
        c, r = POOL
        return q.x > 103 and ((q.x - c.x) / r.x) ** 2 + ((q.y - c.y) / r.y) ** 2 < 0.85
    S = cave_tube(Ch, cpath, "mars_rock_wet", segs=26, seed=3.0, carve=chan_carve)
    Ch.finish(sharp=60)
    # the stream bed: a groove down the channel floor, its water at the stream level
    Sb = Part("cave_stream")
    bed, wat = [], []
    for i, p in enumerate(S):
        T = (S[min(len(S) - 1, i + 1)] - S[max(0, i - 1)]).normalized()
        L = T.cross(Vector((0, 0, 1))).normalized()
        row = []
        for k in range(9):
            x = (k / 8 * 2 - 1) * 2.4
            row.append(p + L * x + Vector((0, 0, -2.0 * math.exp(-(x / 1.3) ** 2) + 0.05)))
        bed.append(row)
        wat.append([p + L * ((k / 4 * 2 - 1) * 1.7) + Vector((0, 0, STREAM - p.z)) for k in range(5)])
    verts = [v for r in bed for v in r]
    faces = [(i * 9 + k, i * 9 + k + 1, (i + 1) * 9 + k + 1, (i + 1) * 9 + k) for i in range(len(bed) - 1) for k in range(8)]
    emit(Sb, verts, faces, "cave_mud", lambda q: Vector((0, 0, 1)))
    Sb.finish(sharp=60)
    Sw = Part("cave_stream_surface")
    verts = [v for r in wat for v in r]
    faces = [(i * 5 + k, i * 5 + k + 1, (i + 1) * 5 + k + 1, (i + 1) * 5 + k) for i in range(len(wat) - 1) for k in range(4)]
    emit(Sw, verts, faces, "brine_surface", lambda q: Vector((0, 0, 1)))
    Sw.finish(sharp=60, col=0)
    Po = Part("cave_pool")
    pc, pr = POOL
    chamber(Po, pc, pr, "mars_rock_wet", pool_floor, carve=lambda q: near_segment(q, Vector((98, -126, -40)), Vector((106, -128, -40)), 4.4), seed=5.0, res=40)
    grid(Po, pc.x - pr.x, pc.x + pr.x, pc.y - pr.y, pc.y + pr.y, 0.7, pool_floor, lambda x, y: ((x - pc.x) / pr.x) ** 2 + ((y - pc.y) / pr.y) ** 2 < 0.97, "cave_mud")
    Po.finish(sharp=60)
    Pw = Part("cave_pool_surface")
    grid(Pw, pc.x - pr.x, pc.x + pr.x, pc.y - pr.y, pc.y + pr.y, 0.7, lambda x, y: STREAM,
         lambda x, y: pool_floor(x, y) < STREAM + 0.2 and ((x - pc.x) / pr.x) ** 2 + ((y - pc.y) / pr.y) ** 2 < 0.97, "brine_surface")
    Pw.finish(sharp=60, col=0)
    # ---------------------------------------------------------------- the submerged tunnel and the subglacial basin
    Tu = Part("cave_tunnel")
    bc, br = BASIN
    cave_tube(Tu, [((30, -164, -46.5), 4.2, 6.5), ((30, -172, -48.5), 4.4, 6.0), ((30, -182, -52.0), 4.6, 6.0), ((30, -192, -56.0), 5.0, 6.5)], "mars_rock_wet", segs=24, seed=6.0,
              carve=lambda q: (((q.x - hall_c.x) / hall_r.x) ** 2 + ((q.y - hall_c.y) / hall_r.y) ** 2 + ((q.z - hall_c.z) / hall_r.z) ** 2 < 0.9) or
              (((q.x - bc.x) / br.x) ** 2 + ((q.y - bc.y) / br.y) ** 2 + ((q.z - bc.z) / br.z) ** 2 < 0.86))
    Tu.finish(sharp=60)
    Ba = Part("cave_basin")
    chamber(Ba, bc, br, "mars_rock_wet", None, drop_above=SHELF - 0.3, carve=lambda q: near_segment(q, Vector((30, -182, -52)), Vector((30, -192, -56)), 5.6), seed=7.0, res=64)
    for k in range(18):
        x, y = bc.x + rnd.uniform(-18, 18), bc.y + rnd.uniform(-14, 14)
        s = rnd.uniform(1.0, 3.0)
        z = bc.z - br.z * math.sqrt(max(0.0, 1 - ((x - bc.x) / br.x) ** 2 - ((y - bc.y) / br.y) ** 2)) + s * 0.3 + 2.5
        basalt_block(Ba, (x, y, z), (s * 1.4, s, s * 0.8), (rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 180)), 700 + k, mat="mars_rock_wet", cuts=4, rough=0.7)
    Ba.finish(sharp=60)
    Sh = Part("cave_ice_shelf")
    s_ = math.sqrt(max(0.0, 1 - ((SHELF - bc.z) / br.z) ** 2))
    grid(Sh, bc.x - br.x * s_, bc.x + br.x * s_, bc.y - br.y * s_, bc.y + br.y * s_, 1.2,
         lambda x, y: SHELF + 0.25 * noise.noise(Vector((x * 0.3, y * 0.3, 9.0))),
         lambda x, y: ((x - bc.x) / (br.x * s_ * 1.02)) ** 2 + ((y - bc.y) / (br.y * s_ * 1.02)) ** 2 < 1.0, "cave_ice", up=False)
    for k in range(60):
        x, y = bc.x + rnd.uniform(-br.x * s_ * 0.9, br.x * s_ * 0.9), bc.y + rnd.uniform(-br.y * s_ * 0.9, br.y * s_ * 0.9)
        if ((x - bc.x) / (br.x * s_)) ** 2 + ((y - bc.y) / (br.y * s_)) ** 2 > 0.9:
            continue
        h = rnd.uniform(0.4, 2.2)
        tube(Sh, [(x, y, SHELF + 0.1), (x, y, SHELF - h * 0.5), (x, y, SHELF - h)], [(0, rnd.uniform(0.15, 0.4)), (1, 0.02)], "cave_ice", segs=8, n=6)
    Sh.finish(sharp=60, col=0)
    # ---------------------------------------------------------------- markers: where the habitats are
    for name, at in (("ice_window", (-8.6, -6.0, -15.0)), ("seal", (21, -95, -31.4)), ("hall", (hall_c.x, hall_c.y, LEVEL)), ("channel_pool", (pc.x, pc.y, STREAM)),
                     ("basin", (bc.x, bc.y, -64.0)), ("tunnel", (30, -178, -50)), ("lake_shore_n", (24, -118, hall_floor(24, -118))),
                     ("crack_a", (8.6, 12.0, 0.0)), ("crack_b", (-9.4, -15.0, 0.0))):
        marker("spot", name, at=at)
    # the hermits' cracks on the ground by the rim: narrow dark fissures
    Cr = Part("cave_cracks")
    for (x, y, a) in ((8.6, 12.0, 0.3), (-9.4, -15.0, -0.5)):
        for k in range(5):
            o = Vector((math.cos(a), math.sin(a), 0)) * (k - 2) * 0.35
            Cr.box((0.5, 0.06, 0.12), at=(x + o.x, y + o.y, 0.0), rot=(0, 0, math.degrees(a) + rnd.uniform(-15, 15)), mat="cave_crack", bevel=0)
    Cr.finish(sharp=60, col=0)


def build_rov():
    """a tethered survey ROV ~1.4 m long (built at 1/0.42 scale: the engine flies it with the submersible model's
    controls scaled down): an open frame, a syntactic foam block, four thrusters, a lamp bar, a camera dome"""
    reset()
    k = 1 / 0.42
    P = Part("rov_frame")
    S = lambda *v: tuple(x * k for x in v)
    for s in (-1, 1):
        tube(P, [S(s * 0.32, 0.6, 0.06), S(s * 0.34, 0.0, 0.04), S(s * 0.32, -0.6, 0.06)], [(0, 0.022 * k), (1, 0.022 * k)], "metal_dark", segs=8, n=8)
        for y in (0.45, -0.45):
            tube(P, [S(s * 0.34, y, 0.04), S(s * 0.36, y, 0.3), S(s * 0.28, y, 0.52)], [(0, 0.018 * k), (1, 0.018 * k)], "paint_yellow", segs=8, n=6)
    P.box(S(0.66, 1.1, 0.22), at=S(0, -0.02, 0.56), mat="paint_yellow", bevel=0.03 * k)
    P.box(S(0.5, 0.7, 0.16), at=S(0, -0.05, 0.2), mat="paint_gray_dark", bevel=0.02 * k)
    for s in (-1, 1):
        P.tube(0.09 * k, 0.07 * k, 0.16 * k, at=S(s * 0.26, -0.62, 0.32), rot=(90, 0, 0), mat="metal_dark", segs=14)
        P.tube(0.08 * k, 0.06 * k, 0.12 * k, at=S(s * 0.42, 0.0, 0.36), mat="metal_dark", segs=12)
    P.sphere(0.1 * k, at=S(0, 0.6, 0.32), mat="glass", segs=20, rings=12)
    P.cyl(0.05 * k, 0.1 * k, at=S(0, 0.56, 0.32), rot=(90, 0, 0), mat="metal_dark", segs=12)
    tube(P, [S(-0.3, 0.62, 0.14), S(0.3, 0.62, 0.14)], [(0, 0.018 * k), (1, 0.018 * k)], "metal_dark", segs=8, n=4)
    for x in (-0.24, 0.24):
        P.cyl(0.045 * k, 0.07 * k, at=S(x, 0.65, 0.14), rot=(90 - 8, 0, 0), mat="metal_dark", segs=12)
        P.cyl(0.035 * k, 0.01 * k, at=S(x, 0.685, 0.145), rot=(90 - 8, 0, 0), mat="emit_white", segs=12, bevel=0)
    tube(P, [S(0, -0.55, 0.6), S(0, -0.8, 0.7), S(0, -1.2, 0.6)], [(0, 0.012 * k), (1, 0.012 * k)], "paint_orange", segs=6, n=8)
    P.finish(sharp=40)
    for i, x in enumerate((-0.24, 0.24)):
        light(f"rov_lamp{i}", S(x, 0.7, 0.15), color=(0.92, 0.96, 1.0), power=380, dist=40, kind="spot", rot=(90 - 8, 0, 0), angle=0.5, room="lamps")


ALL = {"mars_cave": build_cave, "mars_rov": build_rov}

if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for name, fn in ALL.items():
        if only and name not in only:
            continue
        fn()
        if pv:
            if name == "mars_cave":
                preview(name, (60, 120, 90), (20, -110, -30), res=(1000, 700), lens=30, samples=24)
            else:
                preview(name, (2.6, 3.2, 1.8), (0, 0, 0.7), res=(800, 520), lens=35, samples=32)
        export_glb(name)
