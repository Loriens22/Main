"""
Shared pieces for the explorer camps on the Gargantua worlds (mann_camp.py, edmunds_camp.py):
arch profiles and shells for tunnel habs, height-field surfaces (snow drifts, ice cliffs), rounded boulders,
crates, drums, lamp posts. Blender space: X right, Y forward (away from the viewer), Z up, metres.
"""
import math, random
import bpy, bmesh
from mathutils import Vector, noise
import kit
from kit import V, box, cyl, M, empty, from_bmesh, add_bevel, set_props

PI = math.pi

# camp materials (the runtime upgrades them by name, src/render/Materials.ts)
kit.PALETTE.update({
    "mann_orange": dict(color=(0.50, 0.13, 0.05), rough=0.62),
    "snow_drift": dict(color=(0.82, 0.84, 0.88), rough=0.8),
    "ice_cliff": dict(color=(0.30, 0.34, 0.40), rough=0.3),
    "crevasse": dict(color=(0.02, 0.03, 0.05), rough=0.4),
    "granite_pale": dict(color=(0.62, 0.55, 0.47), rough=0.9),
    "ice_slab": dict(color=(0.58, 0.62, 0.67), rough=0.35),
    "frost": dict(color=(0.9, 0.92, 0.95), rough=0.55),
    "hab_fabric": dict(color=(0.86, 0.85, 0.80), rough=0.85),
    "hab_rib": dict(color=(0.80, 0.79, 0.74), rough=0.8),
    "flag_red": dict(color=(0.55, 0.06, 0.06), rough=0.8),
    "flag_white": dict(color=(0.85, 0.85, 0.82), rough=0.8),
    "flag_blue": dict(color=(0.06, 0.09, 0.25), rough=0.8),
    "soil_bed": dict(color=(0.25, 0.17, 0.10), rough=0.95),
    "leaf_green": dict(color=(0.20, 0.38, 0.12), rough=0.7),
    "leaf_pale": dict(color=(0.42, 0.55, 0.22), rough=0.7),
    "flower_blue": dict(color=(0.22, 0.30, 0.75), rough=0.6),
})


def smoothstep(x, a, b):
    if a == b:
        return 0.0 if x < a else 1.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def n2(x, y, s=1.0, seed=0):
    """value noise in [-1, 1]"""
    return noise.noise(Vector((x * s + seed * 17.3, y * s - seed * 5.1, seed * 0.37)))


# ------------------------------------------------------------------------------------------------ profiles
def arch_pts(W, H, r, n=8, z0=0.0, bulge=0.0, side=None):
    """Open arch (an inverted U) in the (y, z) plane, from the left foot up and over to the right foot.
    r: top corner radius; bulge: outward bow of the side walls (inflatable habs)."""
    r = min(r, W / 2 - 1e-3, H - z0 - 1e-3)
    pts = []
    if side is None:
        side = max(2, int((H - r - z0) / 0.5))
    for k in range(side):
        t = k / side
        z = z0 + (H - r - z0) * t
        pts.append((-W / 2 - bulge * math.sin(PI * t * 0.9), z))
    cl = (-W / 2 + r, H - r)
    for k in range(n + 1):
        a = PI - (PI / 2) * k / n
        pts.append((cl[0] + r * math.cos(a), cl[1] + r * math.sin(a)))
    cr = (W / 2 - r, H - r)
    for k in range(1, n + 1):
        a = PI / 2 - (PI / 2) * k / n
        pts.append((cr[0] + r * math.cos(a), cr[1] + r * math.sin(a)))
    for k in range(side - 1, -1, -1):
        t = k / side
        z = z0 + (H - r - z0) * t
        pts.append((W / 2 + bulge * math.sin(PI * t * 0.9), z))
    return pts


def rrect_pts(W, H, r, rb=0.1, n=8, z0=0.0):
    """Closed rounded rectangle in (y, z), CCW seen from +X, bottom at z0."""
    pts = []
    for (cy, cz, rr, a0) in ((W / 2 - rb, z0 + rb, rb, -PI / 2), (W / 2 - r, z0 + H - r, r, 0.0),
                             (-W / 2 + r, z0 + H - r, r, PI / 2), (-W / 2 + rb, z0 + rb, rb, PI)):
        for k in range(n + 1):
            a = a0 + (PI / 2) * k / n
            pts.append((cy + rr * math.cos(a), cz + rr * math.sin(a)))
    return pts


def profile_z(pts, y):
    """Height of an arch profile's upper surface at lateral position y (linear between points)."""
    best = None
    for (a, b) in zip(pts, pts[1:]):
        (y0, z0), (y1, z1) = a, b
        if (y0 - y) * (y1 - y) <= 0 and abs(y1 - y0) > 1e-6:
            z = z0 + (z1 - z0) * (y - y0) / (y1 - y0)
            best = z if best is None else max(best, z)
    return best


# ------------------------------------------------------------------------------------------------ meshes
def shell_x(name, outer, inner, x0, x1, m, par=None):
    """Thick open arch extruded along X between two profiles with equal point counts."""
    bm = bmesh.new()
    n = len(outer)
    O0 = [bm.verts.new((x0, y, z)) for y, z in outer]
    O1 = [bm.verts.new((x1, y, z)) for y, z in outer]
    I0 = [bm.verts.new((x0, y, z)) for y, z in inner]
    I1 = [bm.verts.new((x1, y, z)) for y, z in inner]
    for i in range(n - 1):
        bm.faces.new((O0[i], O0[i + 1], O1[i + 1], O1[i]))
        bm.faces.new((I0[i + 1], I0[i], I1[i], I1[i + 1]))
        bm.faces.new((O0[i + 1], O0[i], I0[i], I0[i + 1]))
        bm.faces.new((O1[i], O1[i + 1], I1[i + 1], I1[i]))
    for k in (0, n - 1):
        try:
            bm.faces.new((O0[k], O1[k], I1[k], I0[k]))
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, (m,), par=par)


def sheet_x(name, pts, x0, x1, m, par=None):
    """Single-sided surface swept along X through a (y, z) polyline."""
    bm = bmesh.new()
    A = [bm.verts.new((x0, y, z)) for y, z in pts]
    B = [bm.verts.new((x1, y, z)) for y, z in pts]
    for i in range(len(pts) - 1):
        bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
    return from_bmesh(name, bm, (m,), par=par)


def cap_x(name, pts, x, m, flip=False, par=None):
    """Flat n-gon in the plane x = const from a closed (y, z) polygon."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for y, z in pts]
    f = bm.faces.new(vs if not flip else list(reversed(vs)))
    return from_bmesh(name, bm, (m,), par=par)


def loft_x(name, sections, m, par=None):
    """Loft closed (y, z) profiles placed at given x: sections = [(x, pts), ...]."""
    secs = [[(x, y, z) for (y, z) in pts] for (x, pts) in sections]
    return kit.loft(name, secs, m=m, par=par)


def heightgrid(name, x0, x1, y0, y1, nx, ny, f, m, par=None, skirt=None):
    """Height-field surface z = f(x, y) over a rectangle (quads); cells where all four corners return None
    are left out. skirt: depth to drop the border down to (closes open edges against the ground)."""
    bm = bmesh.new()
    vs = {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * j / ny
            z = f(x, y)
            if z is not None:
                vs[(i, j)] = bm.verts.new((x, y, z))
    for j in range(ny):
        for i in range(nx):
            q = [vs.get((i, j)), vs.get((i + 1, j)), vs.get((i + 1, j + 1)), vs.get((i, j + 1))]
            q = [v for v in q if v is not None]
            if len(q) >= 3:
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
    # drop loose verts
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.normal_update()
    for fc in bm.faces:
        if fc.normal.z < 0:
            fc.normal_flip()
    return from_bmesh(name, bm, (m,), par=par)


def ribbon(name, pts, w, z, m, par=None):
    """Flat strip of width w along a 2D polyline at height z (cracks, paths, cables on the ground)."""
    bm = bmesh.new()
    L, Rr = [], []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)])
        b = Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x))
        ww = w * (0.35 if i in (0, len(pts) - 1) else 1.0) * (0.8 + 0.4 * ((i * 7919) % 13) / 13)
        L.append(bm.verts.new((p[0] + nrm.x * ww / 2, p[1] + nrm.y * ww / 2, z)))
        Rr.append(bm.verts.new((p[0] - nrm.x * ww / 2, p[1] - nrm.y * ww / 2, z)))
    for i in range(len(pts) - 1):
        f = bm.faces.new((Rr[i], Rr[i + 1], L[i + 1], L[i]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return from_bmesh(name, bm, (m,), par=par)


def boulder(name, r, loc, seed, squash=(1.0, 1.0, 0.8), m="rock_granite", rough=0.14, subdiv=None, par=None, rot_z=0.0, box_n=3.2):
    """Rounded, weathered boulder (granite core-stone): a superellipsoid (rounded block, exponent box_n) with
    low-frequency lumps and a split or two, from a subdivided icosphere."""
    if subdiv is None:
        subdiv = 3 if r > 1.4 else 2
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rnd = random.Random(seed)
    o1 = Vector((rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50)))
    split = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))).normalized()
    for v in bm.verts:
        p = v.co.normalized()
        # rounded block: radius of the superellipsoid |x|^n + |y|^n + |z|^n = 1 along p
        q = (abs(p.x) ** box_n + abs(p.y) ** box_n + abs(p.z) ** box_n) ** (-1.0 / box_n)
        d = q * (1.0 + rough * noise.noise(p * 1.1 + o1) + rough * 0.3 * noise.noise(p * 2.7 - o1))
        # a weathered joint: a shallow groove where a plane cuts the stone
        g = abs(p.dot(split))
        d *= 1.0 - 0.07 * max(0.0, 1.0 - g / 0.08)
        v.co = Vector((p.x * squash[0], p.y * squash[1], p.z * squash[2])) * (r * d * 0.82)
    o = from_bmesh(name, bm, (m,), loc=loc, rot=(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rot_z or rnd.uniform(0, 6.28)), par=par)
    kit.smooth(o, 80)
    return o


def crate(name, size, loc, rot_z=0.0, m="plastic_white", band="plastic_gray", par=None):
    """Hard transport case: body with rounded edges, two lid bands, latches."""
    sx, sy, sz = size
    out = [box(name, size, loc=loc, rot=(0, 0, rot_z), m=m, bevel=min(0.03, sz * 0.12), segs=2, par=par)]
    c, s = math.cos(rot_z), math.sin(rot_z)

    def P(lx, ly, lz):
        return (loc[0] + lx * c - ly * s, loc[1] + lx * s + ly * c, loc[2] + lz)
    out.append(box(name + "_lid", (sx + 0.012, sy + 0.012, 0.03), loc=P(0, 0, sz * 0.5 - 0.06), rot=(0, 0, rot_z), m=band, par=par))
    for k in (-1, 1):
        out.append(box(name + "_latch", (0.07, 0.02, 0.06), loc=P(k * sx * 0.3, -sy / 2 - 0.01, sz * 0.5 - 0.09), rot=(0, 0, rot_z), m="metal_gray", par=par))
    return out


def drum(name, r, h, loc, m="steel_painted_gray", par=None):
    out = [cyl(name, r, h, loc=(loc[0], loc[1], loc[2] + h / 2), m=m, verts=20, bevel=0.01, par=par)]
    for z in (0.3, 0.7):
        out.append(cyl(name + "_rib", r + 0.012, 0.025, loc=(loc[0], loc[1], loc[2] + h * z), m=m, verts=20, par=par))
    return out


def tank(name, r, length, loc, rot_z=0.0, m="plastic_white", par=None):
    """Gas bottle lying on two cradles."""
    out = []
    c, s = math.cos(rot_z), math.sin(rot_z)
    body = kit.lathe(name, [(0, -length / 2), (r * 0.7, -length / 2 + 0.02), (r, -length / 2 + r * 0.5), (r, length / 2 - r * 0.5), (r * 0.7, length / 2 - 0.02), (0.06, length / 2), (0.05, length / 2 + 0.12), (0, length / 2 + 0.12)], m=m, seg=20)
    body.rotation_euler = (0, PI / 2, rot_z)
    body.location = (loc[0], loc[1], loc[2] + r + 0.06)
    if par is not None:
        body.parent = par
    out.append(body)
    for k in (-1, 1):
        out.append(box(name + "_cradle", (0.12, r * 1.8, 0.12), loc=(loc[0] + c * k * length * 0.3, loc[1] + s * k * length * 0.3, loc[2] + 0.06), rot=(0, 0, rot_z), m="metal_dark", par=par))
    return out


def lamp_post(name, loc, h, aim, P, L, lights, par, group, intensity=10.0, distance=16.0, kind="warm", head=(0.42, 0.16, 0.3)):
    """Thin mast, a tilted flood-lamp head aimed at `aim` (x, y, z), its emissive lens (L) and a light empty below it."""
    x, y, z = loc
    P.append(cyl(name + "_mast", 0.045, h, loc=(x, y, z + h / 2), m="metal_gray", verts=10, par=par))
    P.append(cyl(name + "_foot", 0.22, 0.06, loc=(x, y, z + 0.03), m="metal_dark", verts=12, par=par))
    for k in range(3):
        a = k * 2 * PI / 3
        leg = V((math.cos(a) * 0.45, math.sin(a) * 0.45, 0))
        P.append(kit.tube(name + "_strut", [(x + leg.x, y + leg.y, z + 0.02), (x, y, z + 0.9)], 0.018, m="metal_gray", seg=6, par=par))
    d = (V(aim) - V((x, y, z + h))).normalized()
    yaw = math.atan2(d.y, d.x)
    pitch = math.asin(max(-1, min(1, d.z)))
    hx, hy, hz = head
    # head: a box along its local X (the beam direction), tilted down at the aim point
    hd = box(name + "_head", (hz, hx, hy), loc=(x, y, z + h + 0.05), rot=(0, -pitch, yaw), m="paint_charcoal", bevel=0.02, par=par)
    P.append(hd)
    lens = box(name + "_lens", (0.02, hx * 0.86, hy * 0.72), loc=(0, 0, 0), m="emit_warm" if kind == "warm" else "emit_cool")
    # put the lens on the head's front face
    fw = V((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    lens.location = V((x, y, z + h + 0.05)) + fw * (hz / 2 + 0.01)
    lens.rotation_euler = (0, -pitch, yaw)
    if par is not None:
        lens.parent = par
    L.append(lens)
    lp = V((x, y, z + h + 0.05)) + fw * 0.6
    lights.append(empty(f"light_{group}_{len(lights)}", loc=tuple(lp), parent=par, light=kind, group=group, intensity=intensity, distance=distance))
    return hd


def hit(name, size, loc, par, rot=(0, 0, 0), **props):
    """Invisible ray target for an interaction (Site hides *_hit nodes)."""
    o = box(name + "_hit", size, loc=loc, rot=rot, m="frame_black", par=par, **props)
    o.hide_render = True
    return o


def col(name, center, size, par, rot_z=0.0, **props):
    o = box("COL_" + name, size, loc=center, rot=(0, 0, rot_z), m="frame_black", par=par, col="box", **props)
    o.hide_render = True
    return o
