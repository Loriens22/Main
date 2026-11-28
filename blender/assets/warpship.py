"""The warp starship WSV-1 HALCYON (Part 2 directive, images 01-05): an original interstellar research vessel after
the twin-ring Alcubierre-White concept studies.

Layout (from the references):
  * two very large toroidal field rings, perpendicular to the travel axis, one round the forward hull just behind the
    bow saucer and one round the aft machinery; thick industrial rims (rounded outer face), a thin red stripe on the
    outer circumference, a recessed channel of light segments on the inner face (cyan with the field up), panel seams,
    small ports, inspection hubs; each held by three radial struts (one vertical above the spine)
  * the bow: a broad multi-tiered saucer with a flattened rim, concentric plating, rim window strips, black grille
    sections, and on top the streamlined bridge canopy with its long dark panoramic window and warm light inside
  * the spine: a long white cylinder with joint bands, a blue window band, a dorsal observation dome, a dorsal
    docking collar, four ventral pod-bay doors; side modules on triangular trusses: a hexagon-eyed module and a
    visor-headed module above, plain round-nosed modules below, dark solar arrays outboard; a registration sleeve
  * the stern: machinery block with four spherical tanks, radiator wings, a deep engine bell with concentric inner
    rings, fan-like vanes and a luminous field aperture at its heart

Frame: +Y forward (bow), +Z dorsal, +X starboard; origin on the axis between the rings. Overall length about 162 m,
ring diameter 120 m. Exported as warpship.glb: parts `ring_fwd`, `ring_aft` (individual objects), the hull, the
bridge glass, markers for the engine, the dorsal docking collar and the four pod bays.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Vector  # noqa: E402

RING_RO, RING_RI, RING_W2 = 60.0, 50.5, 8.0
Y_RF, Y_RA = 30.0, -45.0
CORE_R = 7.0
Y_S, S_R = 50.0, 30.0              # saucer centre and radius
NAME = "WSV-1 HALCYON"


# ----------------------------------------------------------------------------- frames
def T(p):
    return Matrix.Translation(Vector(p))


def R(deg, axis):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def ring_xf(y, ang=0.0):
    """Ring-local frame: x radial (at angle `ang` round the axis), y tangential, z along the ship axis (+Y)."""
    return T((0, y, 0)) @ R(-90, "X") @ R(ang, "Z")


def axis_point(r, ang, y):
    """World point at radius r, angle ang (deg, 0 = starboard, 90 = dorsal) round the ship axis, at y."""
    a = math.radians(ang)
    return Vector((r * math.cos(a), y, r * math.sin(a)))


def ycyl(P, r, y0, y1, x=0.0, z=0.0, mat="hull_white", segs=48, r2=None, bevel=0.0, caps=True):
    """Cylinder along +Y from y1 (back, radius r) to y0 (front, radius r2)."""
    P.cyl(r, y0 - y1, M=xf((x, (y0 + y1) / 2, z), (-90, 0, 0)), mat=mat, segs=segs, r2=r2, bevel=bevel, caps=caps)


def seg_box(P, a, b, w, h, mat, up=(0, 0, 1), bevel=0.0):
    """A box from point a to point b (length along a->b), w across, h along `up`."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    yax = d.normalized()
    u = Vector(up)
    if abs(yax.dot(u.normalized())) > 0.95:
        u = Vector((1, 0, 0))
    xax = yax.cross(u).normalized()
    zax = xax.cross(yax).normalized()
    M = Matrix(((xax.x, yax.x, zax.x, (a.x + b.x) / 2), (xax.y, yax.y, zax.y, (a.y + b.y) / 2),
                (xax.z, yax.z, zax.z, (a.z + b.z) / 2), (0, 0, 0, 1)))
    P.box((w, L, h), M=M, mat=mat, bevel=bevel)


def text_on(P, body, size, at, along, normal, mat="paint_black"):
    """Lettering lying on a surface: reading along `along`, facing `normal`."""
    x = Vector(along).normalized()
    z = Vector(normal).normalized()
    y = z.cross(x).normalized()
    M = Matrix(((x.x, y.x, z.x, at[0]), (x.y, y.y, z.y, at[1]), (x.z, y.z, z.z, at[2]), (0, 0, 0, 1)))
    P.text(body, size=size, M=M, mat=mat, depth=0.02)


# ----------------------------------------------------------------------------- the field rings
def field_ring(name, y):
    P = Part(name)
    # rim cross-section (r, z) in the ring frame (images 02, 04, 05): a fat band, axial width about a quarter of the
    # radius; flat inner face with a recessed light channel near each edge, flat side faces rolling into a broad,
    # strongly rounded outer face
    hw, ri = RING_W2, RING_RI
    prof = [(ri, -hw + 0.6), (ri + 0.6, -hw), (55.0, -hw), (57.2, -7.6), (58.7, -6.6), (59.6, -5.0), (60.0, -3.0),
            (60.0, 3.0), (59.6, 5.0), (58.7, 6.6), (57.2, 7.6), (55.0, hw), (ri + 0.6, hw), (ri, hw - 0.6),
            (ri, 6.3), (ri + 0.42, 6.1), (ri + 0.42, 4.5), (ri, 4.3), (ri, -4.3), (ri + 0.42, -4.5), (ri + 0.42, -6.1),
            (ri, -6.3)]
    P.lathe(prof, M=ring_xf(y), mat="hull_white", segs=192, closed=True)
    # the red stripe on the outer circumference toward the bow shoulder, small black marks beside it (ref. 02),
    # thin dark lines at the shoulders
    P.lathe([(60.04, 2.15), (60.04, 2.75)], M=ring_xf(y), mat="paint_red", segs=192)
    for zz in (-5.6, 5.6):
        P.lathe([(59.30, zz - 0.06), (59.30, zz + 0.06)], M=ring_xf(y), mat="hull_seam", segs=192)
    for k in range(40):
        a = 360.0 * (k + 0.25) / 40
        P.box((0.06, 1.3 if k % 2 else 0.7, 0.42), M=ring_xf(y, a) @ T((60.02, 0, 0.9)), mat="hull_black")
    # field light segments in both inner channels (white-cyan dashes seen from the stern, a near-continuous cyan line
    # from afar), dark dividers between them
    n = 120
    for k in range(n):
        a = 360.0 * k / n
        for zc in (-5.3, 5.3):
            P.lathe([(ri + 0.40, zc - 0.62), (ri + 0.40, zc + 0.62)], M=ring_xf(y, a), mat="warp_glow", segs=2,
                    sweep=360.0 / n * 0.66)
    # inner face between the channels: small dark ports and service panels
    for k in range(72):
        a = 360.0 * (k + 0.5) / 72
        P.box((0.05, 1.1, 0.7), M=ring_xf(y, a) @ T((ri - 0.02, 0, 1.4 if k % 2 else -1.4)), mat="glass_dark")
        if k % 9 == 0:
            P.box((0.06, 2.6, 2.4), M=ring_xf(y, a + 2.5) @ T((ri - 0.02, 0, 0)), mat="hull_gray", bevel=0.04)
    # panel seams across the outer face and the side faces
    for k in range(64):
        a = 360.0 * k / 64
        P.box((0.05, 0.12, 6.2), M=ring_xf(y, a) @ T((60.01, 0, 0)), mat="hull_seam")
        for s in (-1, 1):
            P.box((4.2, 0.1, 0.05), M=ring_xf(y, a) @ T((53.2, 0, s * (hw + 0.01))), mat="hull_seam")
    # a few small ports on both side faces (mostly dark, a couple lit), access hatches on the outer face
    for k in range(32):
        a = 360.0 * (k + 0.5) / 32
        for s in (-1, 1):
            lit = (k * 7 + (s > 0) * 3) % 11 == 0
            P.box((0.55, 0.9, 0.06), M=ring_xf(y, a) @ T((54.0, 0, s * (hw + 0.02))), mat="emit_cool" if lit else "glass_dark")
        if k % 4 == 0:
            P.box((0.06, 2.0, 1.4), M=ring_xf(y, a) @ T((60.02, 0, -2.0)), mat="hull_gray", bevel=0.05)
    # inspection hubs (gear-like fixtures) on both side faces at port and starboard, with service arms
    for a in (0.0, 180.0):
        for s in (-1, 1):
            M = ring_xf(y, a) @ T((54.6, 0, s * hw))
            P.cyl(1.5, 1.2, M=M @ T((0, 0, s * 0.6)), mat="hull_gray", segs=24, bevel=0.06)
            for t in range(12):
                P.box((0.34, 0.34, 0.5), M=M @ R(t * 30.0, "Z") @ T((1.62, 0, s * 0.6)), mat="metal_gunmetal", bevel=0.03)
            P.cyl(0.7, 0.6, M=M @ T((0, 0, s * 1.4)), mat="metal_gunmetal", segs=16, bevel=0.05)
            P.box((0.5, 2.6, 0.5), M=M @ T((0, 1.6, s * 0.4)), mat="metal_dark", bevel=0.05)
    # positioning lights on the outer rim
    for a, m in ((90.0, "emit_white"), (270.0, "emit_white"), (0.0, "emit_green"), (180.0, "emit_red")):
        P.sphere(0.35, M=ring_xf(y, a) @ T((60.25, 0, 0)), mat=m, segs=10, rings=6)
    return P.finish(part=name, col=0)


def core_r(y):
    """Radius of the spine at y (it narrows into the back of the saucer hub forward of y = 22)."""
    return CORE_R if y <= 22.0 else CORE_R - 2.0 * min(1.0, (y - 22.0) / 16.0)


def ring_struts(P, y):
    """Three radial struts per ring (one vertical above the spine), sleeved at both ends, with cable conduits."""
    rc = core_r(y)
    for ang in (90.0, 210.0, 330.0):
        a, b = axis_point(rc - 0.4, ang, y), axis_point(RING_RI + 0.2, ang, y)
        P.pipe([a, b], 1.05, mat="hull_white", segs=16)
        for (p0, p1) in ((0.0, 0.16), (0.84, 1.0)):
            P.pipe([a.lerp(b, p0), a.lerp(b, p1)], 1.45, mat="hull_gray", segs=16)
        for t in (0.35, 0.5, 0.65):
            c = a.lerp(b, t)
            P.pipe([c - (b - a).normalized() * 0.4, c + (b - a).normalized() * 0.4], 1.3, mat="hull_gray", segs=16)
        side = Vector((0, 1.3, 0))
        P.pipe([a + side, b + side], 0.22, mat="metal_gunmetal", segs=8)
        # saddle on the spine and a foot plate on the ring
        P.box((3.6, 4.0, 1.0), M=T(axis_point(rc + 0.2, ang, y)) @ R(90 - ang, "Y"), mat="hull_gray", bevel=0.2)
        P.box((3.2, 4.6, 0.8), M=T(axis_point(RING_RI - 0.2, ang, y)) @ R(90 - ang, "Y"), mat="hull_gray", bevel=0.2)


# ----------------------------------------------------------------------------- the bow saucer and bridge
SAUCER_TOP = [(0.0, 7.4), (7.5, 7.4), (8.6, 6.3), (16.0, 5.6), (17.4, 4.5), (24.5, 3.0), (28.8, 2.1), (30.0, 1.3)]
SAUCER_BOT = [(30.0, -1.5), (29.0, -2.3), (22.0, -3.4), (14.0, -5.0), (8.0, -6.6), (0.0, -7.0)]


def top_z(r):
    for (r0, z0), (r1, z1) in zip(SAUCER_TOP[:-1], SAUCER_TOP[1:]):
        if r0 <= r <= r1:
            return z0 + (z1 - z0) * (r - r0) / max(1e-6, r1 - r0)
    return SAUCER_TOP[-1][1]


def saucer(P, G):
    # (r, z) ring closed through the axis: bottom from the axis out, then the top back in
    prof = list(SAUCER_BOT[::-1]) + list(SAUCER_TOP[::-1])
    prof = [(max(0.001, r), z) for r, z in prof]
    P.lathe(prof, M=T((0, Y_S, 0)), mat="hull_white", segs=128, closed=True)
    # concentric plating grooves and terrace edges on the top
    for r in (8.6, 17.4, 24.5):
        z = top_z(r) + 0.03
        P.lathe([(r - 0.07, z), (r + 0.07, z)], M=T((0, Y_S, 0)), mat="hull_seam", segs=128)
    # long dark arc grooves (partial circles) and two faint cyan arcs on the outer terrace (ref. 02)
    for (r, a0, sw, m, w) in ((21.0, 200.0, 140.0, "hull_black", 0.16), (13.0, 215.0, 110.0, "hull_black", 0.14),
                              (27.0, 30.0, 120.0, "hull_black", 0.14), (22.6, 35.0, 110.0, "warp_glow", 0.1),
                              (22.6, 215.0, 110.0, "warp_glow", 0.1)):
        z = top_z(r) + 0.04
        P.lathe([(r - w, z), (r + w, z)], M=T((0, Y_S, 0)) @ R(a0, "Z"), mat=m, segs=64, sweep=sw)
    # radial panel seams on the terraces
    for k in range(12):
        a = 360.0 * k / 12 + 15.0
        for (r0, r1) in ((9.0, 16.6), (17.8, 24.2), (25.0, 28.6)):
            p0 = Vector((r0 * math.cos(math.radians(a)), Y_S + r0 * math.sin(math.radians(a)), top_z(r0) + 0.04))
            p1 = Vector((r1 * math.cos(math.radians(a)), Y_S + r1 * math.sin(math.radians(a)), top_z(r1) + 0.04))
            seg_box(P, p0, p1, 0.09, 0.04, "hull_seam")
    # rim: dark window strips all round (some lit), black grille sections at the bow
    for k in range(48):
        a = 360.0 * k / 48
        M = T((0, Y_S, 0)) @ R(a, "Z") @ T((30.03, 0, -0.1))
        lit = k % 4 == 1
        P.box((0.06, 2.6, 0.75), M=M, mat="bridge_glow" if lit else "glass_dark")
    for a in (60.0, 75.0, 90.0, 105.0, 120.0):
        P.box((2.2, 3.4, 0.08), M=T((0, Y_S, 0)) @ R(a, "Z") @ T((26.2, 0, top_z(26.2) + 0.05)) @ R(-8, "Y"), mat="hull_black", bevel=0.04)
    # underside: sensor dome, ring of hatches, angled supports to the spine
    P.sphere(3.6, at=(0, Y_S + 4, -6.8), mat="hull_gray", segs=32, rings=16, scale=(1, 1, 0.6))
    P.tube(4.4, 3.4, 0.5, at=(0, Y_S + 4, -6.95), mat="hull_seam", segs=32)
    for k in range(8):
        a = 360.0 * k / 8 + 22.5
        P.box((2.6, 1.6, 0.12), M=T((0, Y_S, 0)) @ R(a, "Z") @ T((19.0, 0, -4.2)) @ R(9, "Y"), mat="hull_gray", bevel=0.05)
    for s in (-1, 1):
        seg_box(P, (s * 14.0, Y_S - 12, -4.6), (s * 5.2, Y_S - 27, -3.4), 1.0, 1.4, "hull_gray", bevel=0.12)
    # RCS quads on the rim, navigation lights
    for a in (45.0, 135.0, 225.0, 315.0):
        M = T((0, Y_S, 0)) @ R(a, "Z") @ T((29.2, 0, 0.1))
        P.box((1.2, 1.4, 1.2), M=M, mat="hull_gray", bevel=0.1)
        for d in ((0, 0.9, 0), (0, -0.9, 0), (0, 0, 0.9), (0, 0, -0.9)):
            P.cyl(0.16, 0.5, M=M @ T(d) @ (R(90, "X") if d[1] else Matrix.Identity(4)), mat="thruster", segs=8, r2=0.24)
    P.sphere(0.42, at=(-30.2, Y_S, 0.2), mat="emit_red", segs=10, rings=6)
    P.sphere(0.42, at=(30.2, Y_S, 0.2), mat="emit_green", segs=10, rings=6)
    P.sphere(0.42, at=(0, Y_S + 30.2, 0.2), mat="emit_white", segs=10, rings=6)
    bridge(P, G)


BRIDGE = [  # (y relative to the saucer centre, half width, height)
    (23.0, 0.5, 0.9), (21.0, 2.6, 2.3), (18.0, 4.6, 3.4), (14.0, 6.2, 4.0), (9.0, 7.2, 4.3), (3.0, 7.6, 4.3),
    (-2.0, 7.0, 3.8), (-5.5, 4.6, 2.6), (-7.0, 1.0, 1.0)]
PE = 2.6


def bridge_section(yr, w, h, n=18):
    base = top_z(abs(yr)) - 0.2
    pts = []
    for k in range(n + 1):
        t = math.pi * k / n
        c, s = math.cos(t), math.sin(t)
        x = w * math.copysign(abs(c) ** (2 / PE), c)
        z = base + h * (abs(s) ** (2 / PE))
        pts.append(Vector((x, Y_S + yr, z)))
    pts.append(Vector((-w, Y_S + yr, base - 1.2)))
    pts.append(Vector((w, Y_S + yr, base - 1.2)))
    return pts


def band_point(yr, w, h, f, side):
    """The point of a bridge section at height fraction f on one side (side +1 starboard)."""
    base = top_z(abs(yr)) - 0.2
    t = math.asin(min(1.0, f ** (PE / 2)))
    x = w * (math.cos(t) ** (2 / PE))
    return Vector((side * (x + 0.04), Y_S + yr, base + f * h))


F1, F2 = 0.30, 0.80          # the panoramic window band: height fractions of the canopy section
BAND_YR = (8.0, 22.4)        # ... and its extent along the canopy (it wraps round the nose)
NOSE_YR = 14.5               # forward of this the window is one windscreen over the top
NT = 36                      # samples over the section arc


def bridge_dims(yr):
    """Half width and height of the canopy section at yr (linear between the BRIDGE stations)."""
    st = sorted(BRIDGE)
    if yr <= st[0][0]:
        return st[0][1], st[0][2]
    for (y0, w0, h0), (y1, w1, h1) in zip(st[:-1], st[1:]):
        if y0 <= yr <= y1:
            f = (yr - y0) / (y1 - y0)
            return w0 + (w1 - w0) * f, h0 + (h1 - h0) * f
    return st[-1][1], st[-1][2]


def canopy_ring(yr, inset=0.0):
    """One section ring: NT + 1 points over the arc (t 0..pi, +x side first), then the two bottom corners."""
    w, h = bridge_dims(yr)
    w, h = max(0.05, w - inset), max(0.05, h - inset)
    base = top_z(abs(yr)) - 0.2
    pts = []
    for k in range(NT + 1):
        t = math.pi * k / NT
        c, s = math.cos(t), math.sin(t)
        pts.append(Vector((w * math.copysign(abs(c) ** (2 / PE), c), Y_S + yr, base + h * (abs(s) ** (2 / PE)))))
    pts.append(Vector((-w, Y_S + yr, base - 1.2)))
    pts.append(Vector((w, Y_S + yr, base - 1.2)))
    return pts


def canopy_yrs():
    return [23.0 - 0.5 * i for i in range(61)]          # 23 .. -7


def in_band(yr_c, k):
    """Is the arc segment k (between samples k and k + 1) of the row band at yr_c part of the window?"""
    if k >= NT or not (BAND_YR[0] <= yr_c <= BAND_YR[1]):
        return False
    f = abs(math.sin(math.pi * (k + 0.5) / NT)) ** (2 / PE)
    # at the nose the band opens over the top: a windscreen across the front of the bridge (refs 01-02)
    if yr_c >= NOSE_YR:
        return f >= F1
    return F1 <= f <= F2


def canopy_mesh(inset=0.0, want="hull"):
    """The canopy as a grid of quads. want: 'hull' (everything but the window band), 'band' (only the band)."""
    yrs = canopy_yrs()
    rings = [canopy_ring(yr, inset) for yr in yrs]
    n = len(rings[0])
    verts = [v for r in rings for v in r]
    faces = []
    for i in range(len(rings) - 1):
        yc = (yrs[i] + yrs[i + 1]) / 2
        for k in range(n):
            band = in_band(yc, k)
            if (want == "band") != band:
                continue
            a, b = i * n + k, i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))     # outward
    if want == "hull":
        faces.append(tuple(range(n))[::-1])
        faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    return verts, faces


def bridge(P, G):
    # the canopy, open where the panoramic window is (a real window: the bridge is walkable behind it)
    v, f = canopy_mesh(0.0, "hull")
    P.mesh(v, f, mat="hull_white", recalc=False)
    v, f = canopy_mesh(0.0, "band")
    G.mesh(v, f, mat="glass_cockpit", recalc=False)
    # seen from outside without the interior loaded: warm light and consoles behind the glass (an exterior-only
    # backdrop the interior zone hides)
    BK = Part("bridge_backdrop")
    v, f = canopy_mesh(0.7, "band")
    BK.mesh(v, f, mat="bridge_dim", recalc=False)
    # reveals from the hull's band edges in to the backdrop, and a few warm console lights on it
    yrs = canopy_yrs()
    outer = [canopy_ring(yr, 0.0) for yr in yrs]
    inner = [canopy_ring(yr, 0.7) for yr in yrs]
    rv, rf = [], []
    for i in range(len(yrs) - 1):
        yc = (yrs[i] + yrs[i + 1]) / 2
        for k in range(NT):
            if not in_band(yc, k):
                continue
            edges = []
            if not in_band(yc, k - 1):
                edges.append(((i, k), (i + 1, k)))
            if not in_band(yc, k + 1):
                edges.append(((i, k + 1), (i + 1, k + 1)))
            if i == 0 or not in_band((yrs[i - 1] + yrs[i]) / 2, k):
                edges.append(((i, k), (i, k + 1)))
            if i == len(yrs) - 2 or not in_band((yrs[i + 1] + yrs[i + 2]) / 2, k):
                edges.append(((i + 1, k), (i + 1, k + 1)))
            for (a0, a1) in edges:
                base = len(rv)
                rv += [outer[a0[0]][a0[1]], outer[a1[0]][a1[1]], inner[a1[0]][a1[1]], inner[a0[0]][a0[1]]]
                rf += [(base, base + 1, base + 2, base + 3), (base + 3, base + 2, base + 1, base)]
    BK.mesh(rv, rf, mat="hull_gray", recalc=False)
    for k, yr in enumerate((10.0, 12.5, 15.0, 17.5)):
        w, h = bridge_dims(yr)
        for side in (1, -1):
            p = band_point(yr, w - 0.75, h - 0.7, 0.42, side)
            BK.box((0.05, 0.5, 0.12), at=(p.x, p.y, p.z), mat="emit_amber" if k % 2 else "bridge_glow")
    BK.finish(col=0, shadow=0, extonly=1)
    # dorsal ridge and a small sensor mast on the canopy
    P.box((0.8, 16.0, 0.5), at=(0, Y_S + 6.0, top_z(6.0) - 0.2 + 4.32), mat="hull_gray", bevel=0.15)
    P.cyl(0.25, 2.4, at=(0, Y_S - 1.5, top_z(1.5) + 5.3), mat="metal_gunmetal", segs=8)
    P.sphere(0.45, at=(0, Y_S - 1.5, top_z(1.5) + 6.5), mat="hull_gray", segs=12, rings=8)
    # white mullions across the band and frame lines above and below it
    stations = [(yr, w, h) for (yr, w, h) in BRIDGE if 4.0 <= yr <= 21.0]
    f1, f2 = F1, F2
    for (yr, w, h) in stations:
        for side in (1, -1):
            seg_box(P, band_point(yr, w, h, f1 - 0.02, side) + Vector((side * 0.06, 0, 0)),
                    band_point(yr, w, h, f2 + 0.02, side) + Vector((side * 0.06, 0, 0)), 0.22, 0.12, "hull_white")
    for f in (f1 - 0.03, f2 + 0.03):
        pts = [band_point(yr, w, h, f, 1) for (yr, w, h) in stations if yr <= NOSE_YR][::-1] + [band_point(yr, w, h, f, -1) for (yr, w, h) in stations if yr <= NOSE_YR]
        P.pipe(pts, 0.09, mat="hull_gray", segs=6)
    # the windscreen's frame: a centre bar over the top and an arch at its rear edge
    top = [Vector((0, Y_S + yr, top_z(abs(yr)) - 0.2 + bridge_dims(yr)[1] + 0.05)) for yr in (NOSE_YR, 19.0, 20.5, 21.6, 22.4)]
    P.pipe(top, 0.11, mat="hull_white", segs=8)
    w, h = bridge_dims(NOSE_YR)
    arch = [band_point(NOSE_YR, w, h, f, 1) for f in (f2, 0.9, 1.0)] + [band_point(NOSE_YR, w, h, f, -1) for f in (1.0, 0.9, f2)]
    P.pipe(arch, 0.1, mat="hull_white", segs=8)


# ----------------------------------------------------------------------------- the spine and its modules
def spine(P, G):
    # the main hull cylinder, narrowing into the back of the saucer hub
    ycyl(P, CORE_R, 22.0, -50.0, segs=64)
    ycyl(P, CORE_R, 38.0, 22.0, r2=5.0, segs=64)
    # joint bands
    for y in range(-46, 22, 8):
        ycyl(P, CORE_R + 0.14, y + 0.35, y - 0.35, mat="hull_gray", segs=64, caps=False)
    # a blue stripe and a band of small windows high on both flanks
    for s in (-1, 1):
        ang = 90 - s * 42
        for y in range(-38, 20, 2):
            c = axis_point(CORE_R + 0.03, ang, y + 0.5)
            P.box((0.9, 1.2, 0.06), M=T(c) @ R(90 - ang, "Y"), mat="emit_cool" if (y // 2) % 5 == 0 else "glass_dark")
        rad = axis_point(1.0, ang - 9, 0.0) - Vector((0, 0.0, 0))
        rad.y = 0.0
        seg_box(P, axis_point(CORE_R + 0.04, ang - 9, 20.0), axis_point(CORE_R + 0.04, ang - 9, -40.0), 0.5, 0.05, "ship_blue", up=tuple(rad))
    # dorsal observation dome (white helmet with a dark visor band)
    P.cyl(5.0, 4.0, at=(0, 6.0, CORE_R + 1.0), mat="hull_white", segs=48, bevel=0.1)
    P.sphere(5.0, at=(0, 6.0, CORE_R + 3.0), mat="hull_white", segs=48, rings=24)
    G.lathe([(5.04 * math.sin(math.radians(a)), 5.04 * math.cos(math.radians(a))) for a in range(52, 86, 3)],
            M=T((0, 6.0, CORE_R + 3.0)) @ R(10, "Z"), mat="glass_visor", segs=24, sweep=160)
    P.tube(5.25, 4.9, 0.6, at=(0, 6.0, CORE_R + 0.1), mat="hull_gray", segs=48)
    # dorsal docking collar (the station gangway berths here)
    dock = Vector((0, -32.0, CORE_R + 0.2))
    P.tube(2.5, 1.22, 2.4, at=(dock.x, dock.y, dock.z + 1.2), mat="hull_gray", segs=32, bevel=0.1)
    P.tube(3.1, 2.4, 0.5, at=(dock.x, dock.y, dock.z + 2.45), mat="metal_gunmetal", segs=32)
    P.tube(1.6, 1.22, 0.1, at=(dock.x, dock.y, dock.z + 2.5), mat="hull_seam", segs=32)
    # the dorsal hatch (a separate part: it slides aside under the gangway's flange when the ship is boarded)
    H = Part("hatch_dorsal")
    H.cyl(1.3, 0.12, mat="hull_gray", segs=32, bevel=0.02)
    H.cyl(0.18, 0.08, at=(0, 0, 0.09), mat="metal_dark", segs=16)
    for k in range(6):
        H.box((0.05, 0.05, 0.9), M=T((0, 0, 0.1)) @ R(k * 60, "Z") @ R(90, "Y") @ T((0, 0, 0.0)), mat="gear_metal", bevel=0.006)
    for k in range(8):
        H.box((0.12, 0.05, 0.04), M=R(k * 45, "Z") @ T((1.12, 0, 0.07)), mat="paint_yellow")
    H.finish(col=0, at=(dock.x, dock.y, dock.z + 2.52), part="hatch_dorsal", axis=[1, 0, 0], travel=2.9)
    for k in range(3):
        a = 120 * k
        P.box((0.5, 0.5, 0.9), M=T((dock.x, dock.y, dock.z + 2.9)) @ R(a, "Z") @ T((2.7, 0, 0)), mat="paint_yellow", bevel=0.05)
    # four ventral pod-bay doors along the keel, numbered
    for i, y in enumerate((8.0, -1.0, -10.0, -19.0)):
        c = Vector((0, y, -CORE_R - 0.02))
        P.box((6.0, 7.6, 0.2), at=(c.x, c.y, c.z - 0.06), mat="hull_gray", bevel=0.05)
        for (dx, dy, sx, sy) in ((0, 3.85, 6.2, 0.14), (0, -3.85, 6.2, 0.14), (3.05, 0, 0.14, 7.8), (-3.05, 0, 0.14, 7.8)):
            P.box((sx, sy, 0.22), at=(c.x + dx, c.y + dy, c.z - 0.06), mat="paint_yellow")
        P.box((0.1, 7.4, 0.22), at=(c.x, c.y, c.z - 0.07), mat="hull_seam")
        text_on(P, f"0{i + 1}", 1.6, (2.0, y, c.z - 0.18), (0, 1, 0), (0, 0, -1), mat="paint_black")
    # registration sleeve with the ship's name and project patches
    ycyl(P, CORE_R + 0.9, -15.0, -25.0, mat="hull_white", segs=64, bevel=0.15)
    for s in (-1, 1):
        text_on(P, NAME, 1.25, (s * (CORE_R + 0.92), -20.0, 1.0), (0, s, 0), (s, 0, 0), mat="paint_black")
        text_on(P, "ASTERION SURVEY PROGRAM", 0.42, (s * (CORE_R + 0.92), -20.0, -0.6), (0, s, 0), (s, 0, 0), mat="ship_blue")
        for k, m in enumerate(("paint_red", "ship_blue", "paint_yellow", "hull_gray")):
            yy = -16.6 - k * 1.5 if s > 0 else -23.4 + k * 1.5
            P.cyl(0.55, 0.05, M=xf((s * (CORE_R + 0.92), yy, -2.0), (0, 90, 0)), mat=m, segs=20)
    # side modules on triangular trusses
    side_module(P, G, -13.5, 3.6, 16.0, -14.0, 4.6, "hex")
    side_module(P, G, -12.5, -6.0, 10.0, -12.0, 3.8, "round")
    side_module(P, G, 13.5, 3.6, 14.0, -16.0, 4.6, "visor")
    side_module(P, G, 12.5, -6.0, 10.0, -12.0, 3.8, "round")
    for s in (-1, 1):
        for (zm, ys) in ((3.6, (12.0, -10.0)), (-6.0, (8.0, -9.0))):
            truss(P, Vector((s * (CORE_R - 0.2), ys[0], zm * 0.55)), Vector((s * (CORE_R - 0.2), ys[1], zm * 0.55)),
                  Vector((s * (12.5 - 3.0), ys[0], zm)), Vector((s * (12.5 - 3.0), ys[1], zm)), 7)
        # solar arrays outboard of the lower modules (dark grids in white frames)
        x = s * 19.2
        P.box((0.3, 20.0, 7.0), at=(x, -1.0, -6.0), mat="ship_solar", bevel=0.02)
        for (dy, dz, sy, sz) in ((0, 3.6, 20.3, 0.3), (0, -3.6, 20.3, 0.3), (10.1, 0, 0.3, 7.4), (-10.1, 0, 0.3, 7.4), (0, 0, 0.25, 7.2)):
            P.box((0.42, sy, sz), at=(x, -1.0 + dy, -6.0 + dz), mat="hull_white", bevel=0.03)
        seg_box(P, (s * 16.3, -1.0, -6.0), (x, -1.0, -6.0), 0.6, 0.6, "hull_gray")
        # gear-like antenna packages at the truss ends (ref. 03)
        for yy in (-12.5, 11.5):
            c = Vector((s * 9.6, yy, 3.0))
            P.cyl(0.8, 0.8, M=T(c) @ R(90, "X"), mat="hull_gray", segs=16, bevel=0.05)
            for t in range(10):
                P.box((0.22, 0.6, 0.22), M=T(c) @ R(t * 36.0, "Y") @ T((0.88, 0, 0)), mat="metal_gunmetal")
    # radiator wings aft of the modules
    for s in (-1, 1):
        P.box((14.0, 13.0, 0.35), at=(s * 15.4, -33.0, 0.0), mat="radiator", bevel=0.03)
        for k in range(6):
            P.box((14.0, 0.12, 0.45), at=(s * 15.4, -27.0 - k * 2.4, 0.0), mat="hull_gray")
        P.box((1.2, 13.4, 1.0), at=(s * 8.4, -33.0, 0.0), mat="hull_gray", bevel=0.1)


def side_module(P, G, x, z, y0, y1, r, front):
    """A pressurised module along the spine: white cylinder with joint bands; the front end hexagon-eyed, visored or
    round; a round rear cap."""
    body0, body1 = y0 - (0.0 if front == "hex" else r * 0.6), y1 + r * 0.6
    ycyl(P, r, body0, body1, x=x, z=z, segs=40)
    for t in (0.25, 0.5, 0.75):
        yy = body1 + (body0 - body1) * t
        ycyl(P, r + 0.12, yy + 0.3, yy - 0.3, x=x, z=z, mat="hull_gray", segs=40, caps=False)
    P.sphere(r, at=(x, body1, z), mat="hull_white", segs=40, rings=20, scale=(1, 0.6, 1))
    if front == "hex":
        hexo = [(x + 0.98 * r * math.cos(math.radians(60 * k + 30)), z + 0.98 * r * math.sin(math.radians(60 * k + 30))) for k in range(6)]
        hexi = [(x + 0.74 * r * math.cos(math.radians(60 * k + 30)), z + 0.74 * r * math.sin(math.radians(60 * k + 30))) for k in range(6)]
        ycyl(P, r * 1.06, y0 + 0.2, y0 - 1.2, x=x, z=z, mat="hull_white", segs=40, bevel=0.1, caps=False)
        P.prism(hexo, 0.9, plane="XZ", M=T((0, y0 - 0.65, 0)), mat="hull_white", bevel=0.08, holes=[hexi[::-1]], exact_holes=True)
        P.prism(hexi, 0.03, plane="XZ", M=T((0, y0 - 0.5, 0)), mat="hull_black")
        G.prism(hexi, 0.04, plane="XZ", M=T((0, y0 + 0.09, 0)), mat="glass_dark")
        P.cyl(0.85, 0.06, M=xf((x, y0 - 0.44, z), (-90, 0, 0)), mat="bridge_glow", segs=24)
        P.cyl(0.32, 0.06, M=xf((x, y0 - 0.4, z), (-90, 0, 0)), mat="emit_red", segs=16)
        for k in range(6):
            a = 60 * k + 30
            P.box((0.5, 0.06, 0.5), at=(x + 0.55 * r * math.cos(math.radians(a)), y0 - 0.45, z + 0.55 * r * math.sin(math.radians(a))), mat="emit_cool")
    elif front == "visor":
        P.sphere(r, at=(x, body0, z), mat="hull_white", segs=40, rings=20, scale=(1, 0.95, 1))
        G.lathe([((r + 0.05) * math.sin(math.radians(a)), (r + 0.05) * 0.95 * math.cos(math.radians(a))) for a in range(30, 78, 4)],
                M=T((x, body0, z)) @ R(-90, "X") @ R(-160, "Z"), mat="glass_visor", segs=20, sweep=140)
    else:
        P.sphere(r, at=(x, body0, z), mat="hull_white", segs=40, rings=20, scale=(1, 0.7, 1))
        P.cyl(0.9, 0.3, M=xf((x, body0 + r * 0.68, z), (-90, 0, 0)), mat="hull_gray", segs=20)


def truss(P, a0, a1, b0, b1, n):
    """A triangular lattice bridge between two parallel chords a and b, with a third chord offset above."""
    up = Vector((0, 0, 1.6))
    c0, c1 = (a0 + b0) / 2 + up, (a1 + b1) / 2 + up
    for (p, q) in ((a0, a1), (b0, b1), (c0, c1)):
        P.pipe([p, q], 0.22, mat="hull_white", segs=8)
    for i in range(n + 1):
        t = i / n
        a, b, c = a0.lerp(a1, t), b0.lerp(b1, t), c0.lerp(c1, t)
        for (p, q) in ((a, b), (b, c), (c, a)):
            P.pipe([p, q], 0.14, mat="hull_white", segs=6)
        if i < n:
            t2 = (i + 1) / n
            P.pipe([a, b0.lerp(b1, t2)], 0.12, mat="hull_white", segs=6)
            P.pipe([c, a0.lerp(a1, t2)], 0.12, mat="hull_white", segs=6)


# ----------------------------------------------------------------------------- the stern
def stern(P, G):
    ycyl(P, 8.5, -50.0, -64.0, mat="hull_white", segs=64, bevel=0.2)
    ycyl(P, 8.62, -53.0, -55.0, mat="hull_black", segs=64, caps=False)
    for y in (-58.0, -61.5):
        ycyl(P, 8.62, y + 0.3, y - 0.3, mat="hull_gray", segs=64, caps=False)
    # heat shield and the engine bell: deep, concentric inner rings, fan-like vanes, the luminous field aperture
    P.tube(10.0, 8.0, 0.8, M=xf((0, -64.4, 0), (-90, 0, 0)), mat="hull_gray", segs=64)
    P.tube(6.9, 5.6, 10.0, M=xf((0, -69.0, 0), (-90, 0, 0)), mat="thruster", segs=64)
    P.tube(7.2, 6.7, 0.8, M=xf((0, -73.6, 0), (-90, 0, 0)), mat="metal_gunmetal", segs=64)
    for k, (yy, r0) in enumerate(((-66.0, 5.6), (-68.5, 4.6), (-71.0, 3.7))):
        P.tube(r0, r0 - 0.5, 0.4, M=xf((0, yy, 0), (-90, 0, 0)), mat="metal_gunmetal", segs=48)
    for k in range(8):
        a = 360.0 * k / 8
        P.box((3.4, 7.0, 0.2), M=T((0, -68.0, 0)) @ R(a, "Y") @ T((3.6, 0, 0)), mat="metal_gunmetal")
    P.cyl(2.1, 1.6, M=xf((0, -65.6, 0), (-90, 0, 0)), mat="warp_engine", segs=32)
    P.cyl(5.5, 0.1, M=xf((0, -64.8, 0), (-90, 0, 0)), mat="warp_glow", segs=48)
    P.tube(2.6, 2.2, 1.0, M=xf((0, -66.2, 0), (-90, 0, 0)), mat="metal_gunmetal", segs=32)
    # four spherical tanks on the diagonals, with equator bands, markings and supports
    for (sx, sz) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        c = Vector((sx * 10.0, -56.0, sz * 10.0))
        P.sphere(5.2, at=c, mat="hull_white", segs=40, rings=20)
        P.tube(5.3, 5.0, 0.5, M=T(c) @ R(45 * sx * sz, "Y"), mat="hull_gray", segs=40)
        P.box((0.08, 2.4, 0.5), M=T(c) @ R(45 * sx * sz, "Y") @ T((0, 0, 0)) @ T((5.25, 0, 1.2)), mat="paint_red")
        for dy in (-2.0, 2.0):
            seg_box(P, c + Vector((0, dy, 0)) - Vector((sx, 0, sz)).normalized() * 4.6,
                    Vector((sx * 5.8, c.y + dy, sz * 5.8)), 0.7, 0.7, "hull_gray")
    # RCS quads on the machinery block, a dorsal high-gain antenna
    for a in (45.0, 135.0, 225.0, 315.0):
        c = axis_point(8.7, a, -62.0)
        P.box((1.2, 1.4, 1.2), M=T(c) @ R(-a + 90, "Y"), mat="hull_gray", bevel=0.1)
    P.cyl(0.25, 4.0, at=(0, -60.0, 10.5), mat="metal_gunmetal", segs=8)
    P.lathe([(0.2, 0.0), (1.4, 0.35), (2.2, 0.9)], M=T((0, -60.0, 12.6)) @ R(-30, "X"), mat="hull_white", segs=32)


def collision():
    C = Part("warpship_col")
    C.box((14.0, 88.0, 14.0), at=(0, -14.0, 0), mat="concrete")
    C.cyl(30.0, 12.0, at=(0, Y_S, 0), mat="concrete", segs=24)
    C.box((40.0, 30.0, 18.0), at=(0, -1.0, -1.0), mat="concrete")
    C.box((40.0, 20.0, 30.0), at=(0, -57.0, 0), mat="concrete")
    for y in (Y_RF, Y_RA):
        for k in range(24):
            a = 360.0 * k / 24
            C.box((9.5, 14.6, 16.0), M=ring_xf(y, a) @ T((55.25, 0, 0)), mat="concrete")
    return collider("warpship_col", C)


def build():
    reset()
    H = Part("warpship_hull")
    G = Part("warpship_glass")
    saucer(H, G)
    spine(H, G)
    stern(H, G)
    for y in (Y_RF, Y_RA):
        ring_struts(H, y)
    hull = H.finish(col=0)
    glass = G.finish(col=0, shadow=0)
    rf = field_ring("ring_fwd", Y_RF)
    ra = field_ring("ring_aft", Y_RA)
    collision()
    marker("engine", "main", at=(0, -74.0, 0))
    marker("dock", "dorsal", at=(0, -32.0, CORE_R + 3.0), dir=[0, 0, 1], up=[0, 1, 0], label="Dorsal docking collar")
    for i, y in enumerate((8.0, -1.0, -10.0, -19.0)):
        marker("podbay", f"0{i + 1}", at=(0, y, -CORE_R - 0.2))
    marker("view", "bow", at=(48.0, 118.0, 26.0))
    bake_ao([hull, rf, ra], local_dist=6.0)
    return hull, glass, rf, ra


if __name__ == "__main__":
    build()
    if "--preview" in sys.argv:
        dark = dict(sky=(0.012, 0.014, 0.02), sky_strength=1.0, sun=4.5)
        preview("warpship_wide", (215.0, 205.0, 150.0), (0, -6.0, -6.0), res=(1400, 900), lens=40, samples=40, sun_rot=(35, 0, 150), **dark)
        preview("warpship_bow", (44.0, 112.0, 26.0), (-6.0, 36.0, 4.0), res=(1400, 800), lens=30, samples=40, sun_rot=(40, 0, 120), **dark)
        preview("warpship_bridge", (16.0, 84.0, 14.0), (0.0, 60.0, 8.0), res=(1400, 800), lens=35, samples=40, sun_rot=(40, 0, 120), **dark)
        preview("warpship_broadside", (62.0, -4.0, 6.0), (8.0, -6.0, -1.0), res=(1400, 800), lens=30, samples=40, sun_rot=(50, 0, 70), **dark)
        preview("warpship_stern", (-70.0, -250.0, 40.0), (0, -40.0, 0), res=(1200, 900), lens=45, samples=40, sun_rot=(25, 0, -20), **dark)
        preview("warpship_stern_close", (-26.0, -122.0, 14.0), (0, -66.0, 0), res=(1200, 900), lens=32, samples=40, sun_rot=(25, 0, -20), **dark)
    export_glb("warpship")
    save_blend("warpship")
