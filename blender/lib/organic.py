"""
Organic modelling helpers for the creature realism pass (blender/assets/fauna_miller*.py).

  Surf      a smooth parametric body: cross-sections (superellipses with separate upper / lower heights) interpolated
            with Catmull-Rom between stations, so flanks curve continuously instead of kinking at each station.
            P(t, a): t 0 → 1 tail → nose, a = angle round the body (0 = +X right, π/2 = top, π = left, 3π/2 = belly).
            mesh() takes a displacement callback for grooves, gill slits, wrinkles, keels.
  plate     an armour plate or scale conforming to a Surf (or any P(t, a)): domed, its rear edge standing proud,
            optional keel ridge and marginal spines, jagged outline. Plates overlap like shingles instead of floating.
  fin       a fin membrane between a root line and an edge line: rays as raised corrugations, the edge scalloped
            between rays, optional ruffle; thin and double sided.
  fang      a curved, tapering tooth (or claw / thorn / tine) along a quadratic Bezier.
  ringed    an annulated limb or tentacle: ring segments with grooves between them.
  cornea    a clear wet dome over an eye.
Blender +Y forward, +Z up.
"""
import math, random
import bpy, bmesh
from mathutils import Vector
import kit
from kit import V, from_bmesh

PI = math.pi
TAU = math.tau


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def smooth_lerp(vals, s):
    """Catmull-Rom through vals at fractional index s"""
    n = len(vals)
    s = max(0.0, min(n - 1.0, s))
    i = min(int(s), n - 2)
    f = s - i
    p0 = vals[max(i - 1, 0)]
    p1, p2 = vals[i], vals[i + 1]
    p3 = vals[min(i + 2, n - 1)]
    return _cr(p0, p1, p2, p3, f)


def sstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Surf:
    """stations: [(y, half_width, height_up, height_down, z_centre, squareness)], tail first, nose last"""

    def __init__(self, stations, bend=None):
        self.st = stations
        self.n = len(stations)
        self.cols = list(zip(*stations))
        self.bend = bend  # optional f(t) -> (dx, dz) offset of the centre line (curved bodies)

    def sec(self, t):
        s = t * (self.n - 1)
        y, w, hu, hd, zc, sq = (smooth_lerp(c, s) for c in self.cols)
        return y, max(w, 1e-4), max(hu, 1e-4), max(hd, 1e-4), zc, max(sq, 1.2)

    def P(self, t, a):
        y, w, hu, hd, zc, sq = self.sec(t)
        c, sn = math.cos(a), math.sin(a)
        e = 2.0 / sq
        x = w * math.copysign(abs(c) ** e, c)
        z = zc + (hu if sn >= 0 else hd) * math.copysign(abs(sn) ** e, sn)
        if self.bend:
            dx, dz = self.bend(t)
            x += dx
            z += dz
        return V((x, y, z))

    def N(self, t, a, dt=1e-3, da=1e-3):
        p = self.P(t, a)
        tu = self.P(min(1.0, t + dt), a) - self.P(max(0.0, t - dt), a)
        ta = self.P(t, a + da) - self.P(t, a - da)
        n = tu.cross(ta)  # outward (a runs counter-clockwise seen from the nose)
        if n.length < 1e-9:
            return (p - V((0, p.y, self.sec(t)[4]))).normalized()
        return n.normalized()

    def mesh(self, name, nt, na, mats, disp=None, mat_fn=None, t0=0.0, t1=1.0, caps=True):
        """disp(t, a) -> offset along the normal (m); mat_fn(t, a) -> material index"""
        bm = bmesh.new()
        rows = []
        for j in range(nt):
            t = t0 + (t1 - t0) * j / (nt - 1)
            row = []
            for i in range(na):
                a = TAU * i / na
                p = self.P(t, a)
                if disp:
                    d = disp(t, a)
                    if d:
                        p = p + self.N(t, a) * d
                row.append(bm.verts.new(p))
            rows.append(row)
        mi = mat_fn or (lambda t, a: 0)
        for j in range(nt - 1):
            tm = t0 + (t1 - t0) * (j + 0.5) / (nt - 1)
            for i in range(na):
                f = bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i]))
                f.material_index = mi(tm, TAU * (i + 0.5) / na)
        if caps:
            for k, row in ((0, rows[0]), (1, rows[-1])):
                tt = t0 if k == 0 else t1
                y, w, hu, hd, zc, sq = self.sec(tt)
                c = sum((v.co for v in row), Vector()) / len(row)
                dy = -1 if k == 0 else 1
                pole = bm.verts.new(c + V((0, dy * min(w, hu) * 0.15, 0)))
                for i in range(na):
                    f = bm.faces.new((row[i], row[(i + 1) % na], pole))
                    f.material_index = mi(tt, TAU * (i + 0.5) / na)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = from_bmesh(name, bm, tuple(mats))
        kit.smooth(o, 80)
        return o


def plate(name, P, N, tc, ac, dt, da, m, rng, lift=0.02, thick=0.01, dome=0.3, jag=0.15, rear=1.0,
          keel=0.0, spines=0, spine_len=0.0, spine_m=None, tip=0.0, K=18, rings=4, outline=None, inset=0.0, sides=0, sides_rot=0.0):
    """armour plate on surface P(t, a) / N(t, a) centred at (tc, ac), half-extent (dt, da) in parameter units.
    rear: which way along t is 'back' (+1: toward smaller t). lift: rear edge height (m); dome: centre bulge
    (fraction of lift); keel: ridge height (m) along the plate's t axis; tip: pointed rear lobe (0..1);
    spines: number of marginal spines on the rear half, each spine_len long."""
    bm = bmesh.new()
    jit = [1 + jag * (rng.random() - 0.5) * 2 for _ in range(K)]
    jit = [(jit[k - 1] + 2 * jit[k] + jit[(k + 1) % K]) / 4 for k in range(K)]

    def rad(th):
        if outline:
            return outline(th)
        back = max(0.0, -math.cos(th))
        r = 1.0
        if sides:
            seg = TAU / sides
            ph = (th + sides_rot) % seg - seg / 2
            r = math.cos(seg / 2) / math.cos(ph)
        return r * (1 + tip * back ** 6 * 0.8)

    def at(u, th):
        """u 0 = centre .. 1 = rim"""
        k = (th / TAU) * K
        j0 = int(k) % K
        f = k - int(k)
        r = rad(th) * (jit[j0] * (1 - f) + jit[(j0 + 1) % K] * f) * u
        t = tc - rear * math.cos(th) * dt * r
        a = ac + math.sin(th) * da * r
        p = P(t, a)
        n = N(t, a)
        back = max(0.0, -math.cos(th))  # rear half rises
        h = inset + lift * (rear_lift(back, u) + dome * (1 - u * u))
        if keel:
            h += keel * max(0.0, 1 - abs(math.sin(th) * u) * 3.5) * (1 - 0.5 * u)
        return p + n * h, n

    def rear_lift(back, u):
        return back ** 1.5 * u ** 2

    cv = bm.verts.new(at(0.0, 0.0)[0])
    ringv = []
    for r in range(1, rings + 1):
        u = r / rings
        ringv.append([bm.verts.new(at(u, TAU * k / K)[0]) for k in range(K)])
    for k in range(K):
        bm.faces.new((cv, ringv[0][k], ringv[0][(k + 1) % K]))
    for r in range(rings - 1):
        for k in range(K):
            bm.faces.new((ringv[r][k], ringv[r + 1][k], ringv[r + 1][(k + 1) % K], ringv[r][(k + 1) % K]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, (m,))
    # outward normals point away from the body
    o.data.update()
    p0, n0 = at(0.0, 0.0)
    if o.data.polygons and o.data.polygons[0].normal.dot(n0) < 0:
        for poly in o.data.polygons:
            poly.flip()
    kit.add_solidify(o, thick, -1.0)
    kit.bake(o)
    kit.smooth(o, 40)
    if spines and spine_len > 0:
        parts = [o]
        for s in range(spines):
            th = PI - (PI * 0.8) / 2 + (PI * 0.8) * (s + 0.5) / spines
            pe, ne = at(1.0, th)
            pi_, _ = at(0.7, th)
            d = (pe - pi_).normalized()
            L = spine_len * rng.uniform(0.7, 1.2)
            parts.append(fang(f"{name}s{s}", pe - d * thick, d * 0.75 + ne * 0.45, ne, L, thick * 0.9, curve=0.15, m=spine_m or m, seg=4))
        o = kit.merge(parts, name)
    return o


def fin(name, base, edge, m, nu=None, nv=8, rays=10, corr=0.0, scallop=0.0, ruffle=0.0, ruffle_f=3.0, thick=0.004,
        rays_m=None, ray_r=0.0, ray_taper=0.3, up=None, mats=None, mat_fn=None, droop=0.0):
    """membrane from polyline `base` (root, leading → trailing) to polyline `edge` (same count).
    rays: number of ray lines; corr: corrugation height (m) at full span; scallop: edge notch depth between rays
    (fraction of span); ruffle: wavy trailing edge amplitude (m); droop: sag of the membrane toward -normal (m)."""
    base = [V(p) for p in base]
    edge = [V(p) for p in edge]
    nu = nu or max(rays * 4 + 1, len(base))

    def poly_at(pts, u):
        s = u * (len(pts) - 1)
        return smooth_lerp(pts, s)

    def P0(u, v):
        b = poly_at(base, u)
        e = poly_at(edge, u)
        ray_ph = u * max(1, rays - 1)
        fr = ray_ph - math.floor(ray_ph)
        notch = scallop * math.sin(PI * fr) ** 1.5 if rays > 1 else 0.0
        return b + (e - b) * (v * (1 - notch * v ** 3))

    def NN(u, v):
        du = P0(min(1.0, u + 1e-3), v) - P0(max(0.0, u - 1e-3), v)
        dv = P0(u, min(1.0, v + 1e-3)) - P0(u, max(0.0, v - 1e-3))
        n = du.cross(dv)
        if up is not None and n.dot(V(up)) < 0:
            n = -n
        return n.normalized() if n.length > 1e-9 else V((0, 0, 1))

    bm = bmesh.new()
    rows = []
    for j in range(nv):
        v = j / (nv - 1)
        row = []
        for i in range(nu):
            u = i / (nu - 1)
            p = P0(u, v)
            n = NN(u, v)
            off = 0.0
            if corr and rays > 1:
                off += corr * v * math.cos(TAU * u * (rays - 1)) * 0.5
            if ruffle:
                off += ruffle * v ** 2 * math.sin(TAU * u * ruffle_f + 1.3)
            if droop:
                off -= droop * math.sin(PI * v) * math.sin(PI * u)
            row.append(bm.verts.new(p + n * off))
        rows.append(row)
    mi = mat_fn or (lambda u, v: 0)
    for j in range(nv - 1):
        for i in range(nu - 1):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            f.material_index = mi((i + 0.5) / (nu - 1), (j + 0.5) / (nv - 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, tuple(mats or (m,)))
    kit.add_solidify(o, thick, 0.0)
    kit.bake(o)
    kit.smooth(o, 50)
    if rays_m and ray_r and rays > 1:
        parts = [o]
        for k in range(rays):
            u = k / (rays - 1)
            pts = []
            for j in range(7):
                v = 0.97 * j / 6
                p = P0(u, v)
                n = NN(u, v)
                off = corr * v * 0.5 if corr else 0.0
                if ruffle:
                    off += ruffle * v ** 2 * math.sin(TAU * u * ruffle_f + 1.3)
                if droop:
                    off -= droop * math.sin(PI * v) * math.sin(PI * u)
                pts.append(p + n * (off + thick * 0.4))
            parts.append(_taper_tube(f"{name}r{k}", pts, ray_r, ray_r * ray_taper, rays_m, seg=4))
        o = kit.merge(parts, name)
    return o


def _taper_tube(name, pts, r0, r1, m, seg=6):
    radii = [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))]
    return tube(name, pts, radii, m, seg=seg)


def tube(name, pts, radii, m, seg=8, cap_tip=True):
    """tube along pts with per-point radius; parallel-transported frames (no twist)"""
    bm = bmesh.new()
    pts = [V(p) for p in pts]
    n = len(pts)
    rings = []
    prev = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            upv = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
            nx = t.cross(upv).normalized()
        else:
            nx = (prev - t * prev.dot(t)).normalized()
        prev = nx
        ny = nx.cross(t).normalized()
        r = radii[i]
        rings.append([bm.verts.new(p + (nx * math.cos(TAU * k / seg) + ny * math.sin(TAU * k / seg)) * r) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    if cap_tip:
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * max(radii[-1], 1e-4) * 1.5)
        for k in range(seg):
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tip))
    else:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, (m,))
    kit.smooth(o, 70)
    return o


def bez(p0, p1, p2, t):
    return p0 * ((1 - t) ** 2) + p1 * (2 * (1 - t) * t) + p2 * (t * t)


def fang(name, base, direction, bend_dir, L, r0, curve=0.3, m="tooth", seg=6, n=7, tip_r=None, flat=1.0):
    """curved tapering cone from `base` along `direction`, curling toward `bend_dir` by `curve` (fraction of L)"""
    b = V(base)
    d = V(direction).normalized()
    bd = V(bend_dir)
    bd = (bd - d * bd.dot(d))
    bd = bd.normalized() if bd.length > 1e-6 else V((0, 0, 0))
    p1 = b + d * (L * 0.55)
    p2 = b + d * L + bd * (L * curve)
    pts = [bez(b, p1, p2, i / (n - 1)) for i in range(n)]
    tr = tip_r if tip_r is not None else r0 * 0.06
    radii = [r0 + (tr - r0) * (i / (n - 1)) ** 0.8 for i in range(n)]
    return tube(name, pts, radii, m, seg=seg)


def ringed(name, pts, r_fn, m, rings=12, groove=0.12, seg=12, samples=None, scales=0.0, rng=None, mats=None):
    """annulated tube: r_fn(t) base radius; `rings` ring segments with grooves `groove` (fraction) between them"""
    pts = [V(p) for p in pts]
    ns = samples or max(rings * 6, len(pts))
    path = [smooth_lerp(pts, (len(pts) - 1) * i / (ns - 1)) for i in range(ns)]
    radii = []
    for i in range(ns):
        t = i / (ns - 1)
        ph = (t * rings) % 1.0
        bulge = math.sin(PI * ph) ** 0.35
        radii.append(r_fn(t) * (1 - groove + groove * bulge))
    return tube(name, path, radii, m, seg=seg)


def cornea(name, center, r, m="cornea", segs=16, rings=10, scale=(1, 1, 1)):
    return kit.sphere(name, r, loc=tuple(center), m=m, segs=segs, rings=rings, scale=scale)


def eye(name, center, normal, r, iris_m, pupil_m="mimic_pupil", cornea_m="cornea", pupil=(0.35, 0.8), slit_axis=None):
    """eyeball with an iris disc, a pupil (round or slit) and a clear cornea. Returns a merged object."""
    c = V(center)
    n = V(normal).normalized()
    parts = [kit.sphere(f"{name}b", r, loc=tuple(c), m=iris_m, segs=16, rings=10)]
    pc = c + n * (r * 0.93)
    pu = kit.sphere(f"{name}p", r * pupil[0], loc=tuple(pc), m=pupil_m, segs=12, rings=6, scale=(1.0, pupil[1], 0.25))
    q = V((0, 0, 1)).rotation_difference(n)
    pu.rotation_mode = "QUATERNION"
    if slit_axis is not None:
        # rotate the pupil's long axis (local Y) onto slit_axis
        sa = V(slit_axis)
        sa = (sa - n * sa.dot(n)).normalized()
        yl = q @ V((0, 1, 0))
        q2 = yl.rotation_difference(sa)
        q = q2 @ q
    pu.rotation_quaternion = q
    kit.bake(pu)
    parts.append(pu)
    parts.append(cornea(f"{name}c", c + n * (r * 0.12), r * 1.04, m=cornea_m))
    return kit.merge(parts, name)


def scatter_on(P, N, n, rng, t_range, a_range, fn):
    """call fn(i, p, normal, t, a) at n random points of a surface patch"""
    out = []
    for i in range(n):
        t = rng.uniform(*t_range)
        a = rng.uniform(*a_range)
        out.append(fn(i, P(t, a), N(t, a), t, a))
    return [o for o in out if o is not None]


class TubeSurf:
    """a limb as a parametric surface: P(t, a) round a path (t 0 → 1 base → tip) with radius r(t), parallel-transported
    frames; a = 0 points along `ref` (projected), a = π/2 along t × ref. Use with plate() for limb armour."""

    def __init__(self, pts, r_fn, ref=(0, 0, 1), samples=64, squash=1.0):
        pts = [V(p) for p in pts]
        self.path = [smooth_lerp(pts, (len(pts) - 1) * i / (samples - 1)) for i in range(samples)]
        self.r = r_fn
        self.squash = squash
        n = samples
        self.T, self.X, self.Y = [], [], []
        prev = None
        for i in range(n):
            t = (self.path[min(i + 1, n - 1)] - self.path[max(i - 1, 0)]).normalized()
            if prev is None:
                rv = V(ref)
                x = (rv - t * rv.dot(t))
                if x.length < 1e-6:
                    x = t.orthogonal()
                x.normalize()
            else:
                x = (prev - t * prev.dot(t)).normalized()
            prev = x
            self.T.append(t)
            self.X.append(x)
            self.Y.append(t.cross(x).normalized())
        self.n = n

    def frame(self, t):
        s = max(0.0, min(1.0, t)) * (self.n - 1)
        i = min(int(s), self.n - 2)
        f = s - i
        c = self.path[i].lerp(self.path[i + 1], f)
        x = self.X[i].lerp(self.X[i + 1], f).normalized()
        y = self.Y[i].lerp(self.Y[i + 1], f).normalized()
        tt = self.T[i].lerp(self.T[i + 1], f).normalized()
        return c, tt, x, y

    def P(self, t, a):
        c, tt, x, y = self.frame(t)
        r = self.r(max(0.0, min(1.0, t)))
        return c + x * (math.cos(a) * r * self.squash) + y * (math.sin(a) * r)

    def N(self, t, a):
        c, tt, x, y = self.frame(t)
        n = x * (math.cos(a) / max(self.squash, 1e-3)) + y * math.sin(a)
        return n.normalized()

    def mesh(self, name, nt, na, mats, disp=None, mat_fn=None, tip=True):
        bm = bmesh.new()
        rows = []
        for j in range(nt):
            t = j / (nt - 1)
            row = []
            for i in range(na):
                a = TAU * i / na
                p = self.P(t, a)
                if disp:
                    d = disp(t, a)
                    if d:
                        p = p + self.N(t, a) * d
                row.append(bm.verts.new(p))
            rows.append(row)
        mi = mat_fn or (lambda t, a: 0)
        for j in range(nt - 1):
            for i in range(na):
                f = bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i]))
                f.material_index = mi((j + 0.5) / (nt - 1), TAU * (i + 0.5) / na)
        bm.faces.new(list(reversed(rows[0])))
        c, tt, x, y = self.frame(1.0)
        if tip:
            pv = bm.verts.new(c + tt * max(self.r(1.0), 1e-3) * 1.2)
            for i in range(na):
                f = bm.faces.new((rows[-1][i], rows[-1][(i + 1) % na], pv))
                f.material_index = mi(1.0, TAU * (i + 0.5) / na)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = from_bmesh(name, bm, tuple(mats))
        kit.smooth(o, 70)
        return o
