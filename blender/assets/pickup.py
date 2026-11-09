"""
Farm pickup (reference image 2: the truck parked at the east end of the porch). An original, unbadged early-1970s
style full-size single-cab long-bed 4x4: boxy flat-sided body with a feature line, flat hood, full-width grille with
round lamps in square bezels, chrome bumpers, upright windshield, drip rails, vent windows, west-coast mirrors and a
blue tubular ladder rack over the cab and bed. Faded cream paint with a blue side band, heavy dust.

Blender +Y = forward, X = right, Z = up; origin on the ground between the axles (front axle y=+1.75, rear y=-1.55).
Runtime nodes: wheel_FL/FR/RL/RR, steer (local Z = column axis), door_L/door_R (hinge empties), eye_driver,
light_head_L/R, light_tail_L/R, exit_L/R, screen_gps; lamp meshes carry userData.lamp = 'head' | 'tail'.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe
from farm_house import obox, seg_box

PI = math.pi
FY, RY = 1.75, -1.55          # axle positions
TR = 0.82                     # half track
WR, WW, RIMR = 0.38, 0.235, 0.205
ARCH_R = 0.49                 # fender cut-out radius
ZB0, ZB1 = 0.80, 0.98         # blue side band between the two trim spears
CREAM, BLUE = "car_paint_cream", "car_paint_blue_faded"


# ------------------------------------------------------------------------------------------------ helpers
def clip_poly(poly, c, keep_above, axis=1):
    """Sutherland–Hodgman clip of a (y, z) polygon against the line coord[axis] = c."""
    out = []
    n = len(poly)
    inside = (lambda p: p[axis] >= c) if keep_above else (lambda p: p[axis] <= c)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ia, ib = inside(a), inside(b)
        if ia:
            out.append(a)
        if ia != ib:
            t = (c - a[axis]) / (b[axis] - a[axis])
            q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            out.append(q)
    return out


def band_split(poly, arch=None):
    """Split a side-panel profile into cream / blue band / cream pieces. arch=(cy, cz, r): where the wheel arch
    rises through the lowest band it splits it in two, so that band is cut into separate simple polygons."""
    lo = clip_poly(poly, ZB0, False)
    pieces = [(lo, CREAM)]
    if arch and arch[1] + arch[2] > ZB0:
        dy = math.sqrt(max(0.0, arch[2] ** 2 - (ZB0 - arch[1]) ** 2))
        pieces = [(clip_poly(lo, arch[0] - dy, False, axis=0), CREAM), (clip_poly(lo, arch[0] + dy, True, axis=0), CREAM)]
    mid = clip_poly(clip_poly(poly, ZB0, True), ZB1, False)
    hi = clip_poly(poly, ZB1, True)
    return pieces + [(mid, BLUE), (hi, CREAM)]


def side_panel(P, name, poly, x0, x1, bevel=0.012, split=True, arch=None):
    for (pp, m) in (band_split(poly, arch) if split else [(poly, CREAM)]):
        if len(pp) < 3:
            continue
        o = kit.prism_yz(name, kit.ccw(pp), x0, x1, m=m)
        if bevel:
            kit.add_bevel(o, bevel, 2, 40)
        P.append(o)


def arch_pts(cy, cz, r, z_cut, step=8):
    """Points along a wheel arch (front → over the top → rear), clipped where it meets z_cut."""
    th0 = math.degrees(math.asin(max(-1.0, min(1.0, (z_cut - cz) / r))))
    pts = []
    a = th0
    while a <= 180 - th0 + 1e-6:
        t = math.radians(a)
        pts.append((cy + r * math.cos(t), cz + r * math.sin(t)))
        a += step
    t = math.radians(180 - th0)
    pts.append((cy + r * math.cos(t), cz + r * math.sin(t)))
    return pts  # y decreasing (front first)


def quad_slab(name, p0, p1, p2, p3, t, n, m):
    """Planar quad (p0..p3 in order) extruded by t along n (centred)."""
    n = V(n).normalized()
    pts = [V(p) for p in (p0, p1, p2, p3)]
    bm = bmesh.new()
    a = [bm.verts.new(p - n * t / 2) for p in pts]
    b = [bm.verts.new(p + n * t / 2) for p in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh(name, bm, (m,))


def liner(name, cy, cz, x0, x1, r0=0.50, r1=0.53):
    """Curved wheel-well liner: thin arched band extruded across X."""
    outer = [(cy + r1 * math.cos(math.radians(a)), cz + r1 * math.sin(math.radians(a))) for a in range(14, 167, 8)]
    inner = [(cy + r0 * math.cos(math.radians(a)), cz + r0 * math.sin(math.radians(a))) for a in range(166, 13, -8)]
    return kit.prism_yz(name, kit.ccw(outer + inner), x0, x1, m="plastic_dark")


def tube(P, name, pts, r, m, seg=8):
    P.append(kit.tube(name, pts, r, m=m, seg=seg))


# ------------------------------------------------------------------------------------------------ wheels
def truck_tire(name, par):
    """All-terrain tyre with block tread + painted steel wheel with a small chrome hubcap; rolls about X."""
    r, w, rr = WR, WW, RIMR
    prof = [(rr * 0.98, -w / 2 + 0.01), (r * 0.80, -w / 2), (r * 0.94, -w / 2 * 0.93), (r * 0.985, -w / 2 * 0.75), (r * 0.985, w / 2 * 0.75),
            (r * 0.94, w / 2 * 0.93), (r * 0.80, w / 2), (rr * 0.98, w / 2 - 0.01)]
    parts = [lathe(name + "_tire", prof, m="tire_rubber", seg=48, rot=(0, PI / 2, 0))]
    n = 34
    for k in range(n):
        for row, (dx, ph) in enumerate(((-w * 0.22, 0.0), (w * 0.22, 0.5))):
            a = 2 * PI * (k + ph) / n
            parts.append(box(name + "_blk", (w * 0.36, 0.055, 0.018), loc=(dx, math.cos(a) * (r * 0.985 + 0.006), math.sin(a) * (r * 0.985 + 0.006)),
                             rot=(a + PI / 2, 0, (0.25 if row else -0.25)), m="tire_rubber"))
    for k in range(n):   # shoulder lugs
        a = 2 * PI * (k + 0.25) / n
        for side in (-1, 1):
            parts.append(box(name + "_shl", (0.03, 0.045, 0.012), loc=(side * w * 0.47, math.cos(a) * (r * 0.95), math.sin(a) * (r * 0.95)), rot=(a + PI / 2, 0, 0), m="tire_rubber"))
    rim = [(0.0, w * 0.06), (rr * 0.42, w * 0.06), (rr * 0.5, -w * 0.02), (rr * 0.8, -w * 0.05), (rr * 0.9, -w * 0.2), (rr, -w * 0.25), (rr * 1.06, -w * 0.42),
           (rr * 1.06, -w * 0.46), (rr * 0.99, -w * 0.44), (rr * 0.97, w * 0.4), (rr * 1.06, w * 0.44), (rr * 1.06, w * 0.47), (rr * 0.95, w * 0.45)]
    parts.append(lathe(name + "_rim", rim, m="steel_painted_white", seg=36, rot=(0, PI / 2, 0)))
    for k in range(6):   # ventilation slots in the wheel disc
        a = 2 * PI * k / 6
        parts.append(box(name + "_slot", (0.012, 0.06, 0.03), loc=(-w * 0.03, math.cos(a) * rr * 0.68, math.sin(a) * rr * 0.68), rot=(a, 0, 0), m="plastic_dark"))
    parts.append(lathe(name + "_cap", [(0.0, -w * 0.2), (0.06, -w * 0.18), (0.085, -w * 0.1), (0.09, -w * 0.06), (0.0, -w * 0.06)], m="chrome_dull", seg=24, rot=(0, PI / 2, 0)))
    for k in range(5):
        a = 2 * PI * k / 5
        parts.append(cyl(name + "_nut", 0.011, 0.025, loc=(-w * 0.08, math.cos(a) * 0.105, math.sin(a) * 0.105), rot=(0, PI / 2, 0), m="chrome_dull", verts=6))
    o = merge(parts, name, par=par)
    finish(o, 40)
    return o


def wheel(name, root, x, y):
    pv = empty(name, loc=(x, y, WR), parent=root)
    t = truck_tire(name + "_t", pv)
    if x < 0:
        t.rotation_euler = (0, 0, PI)
    return pv


# ------------------------------------------------------------------------------------------------ body
def body(P, L, root):
    # ---------------- front fenders (outer face x = ±1.0), hood between them
    for sx in (-1, 1):
        ap = arch_pts(FY, WR, ARCH_R, 0.56)
        prof = [(0.99, 0.56), (ap[-1][0], 0.56)] + list(reversed(ap)) + [(ap[0][0], 0.56), (2.50, 0.60), (2.60, 0.66), (2.62, 0.72), (2.62, 1.08), (2.60, 1.14), (2.55, 1.16), (1.05, 1.18), (0.99, 1.18)]
        x0, x1 = (0.80, 1.0) if sx > 0 else (-1.0, -0.80)
        side_panel(P, "fender", prof, x0, x1, arch=(FY, WR, ARCH_R))
        # arch lip and inner liner
        lip = [(sx * 1.0, y, z) for (y, z) in ap]
        tube(P, "fender_lip", lip, 0.018, CREAM, seg=6)
        P.append(liner("wheelwell", FY, WR, *((0.60, 0.98) if sx > 0 else (-0.98, -0.60))))
        # trim spears along the band edges (the lower one is interrupted by the wheel arch)
        for (y0, y1, z) in ((0.99, 1.48, ZB0), (2.02, 2.60, ZB0), (0.99, 2.60, ZB1)):
            P.append(box("spear", (0.012, y1 - y0, 0.014), loc=(sx * 1.006, (y0 + y1) / 2, z), m="chrome_dull"))
        # side marker (amber) and antenna (right fender)
        P.append(box("marker_f", (0.015, 0.09, 0.05), loc=(sx * 1.004, 2.45, 1.05), m="lamp_lens_amber"))
    P.append(cyl("antenna", 0.004, 0.95, loc=(0.92, 1.25, 1.65), rot=(0.05, 0, 0), m="chrome_dull", verts=6))
    P.append(cyl("antenna_base", 0.015, 0.03, loc=(0.92, 1.25, 1.19), m="chrome_dull", verts=10))
    hood = kit.prism_yz("hood", kit.ccw([(1.07, 1.13), (2.57, 1.12), (2.62, 1.15), (2.60, 1.19), (1.10, 1.225), (1.07, 1.21)]), -0.795, 0.795, m=CREAM)
    kit.add_bevel(hood, 0.012, 2, 40)
    P.append(hood)
    for sx in (-1, 1):
        P.append(box("hood_crease", (0.03, 1.38, 0.008), loc=(sx * 0.42, 1.86, 1.214), rot=(-0.02, 0, 0), m=CREAM, bevel=0.003))
    # cowl and vent grille
    P.append(box("cowl", (1.9, 0.12, 0.05), loc=(0, 1.02, 1.215), m=CREAM, bevel=0.01))
    for k in range(22):
        P.append(box("cowl_louver", (0.035, 0.07, 0.01), loc=(-0.6 + k * 0.057, 1.02, 1.243), m="plastic_dark"))
    for sx in (-1, 1):   # wipers parked on the cowl
        P.append(seg_box("wiper_arm", (sx * 0.3, 1.0, 1.25), (sx * 0.3 - 0.42, 0.98, 1.27), 0.012, 0.012, "metal_dark"))
        P.append(seg_box("wiper_blade", (sx * 0.3 - 0.05, 0.96, 1.265), (sx * 0.3 - 0.5, 0.94, 1.29), 0.008, 0.02, "rubber_black"))

    # ---------------- grille, lamps, front bumper
    gx, gz0, gz1, gy = 0.79, 0.64, 1.115, 2.62
    for (sz, loc) in (((1.58, 0.04, 0.035), (0, gy + 0.01, gz1 - 0.0175)), ((1.58, 0.04, 0.035), (0, gy + 0.01, gz0 + 0.0175))):
        P.append(box("grille_frame", sz, loc=loc, m="chrome_dull", bevel=0.006))
    for sx in (-1, 1):
        P.append(box("grille_frame", (0.035, 0.04, gz1 - gz0), loc=(sx * (gx - 0.0175), gy + 0.01, (gz0 + gz1) / 2), m="chrome_dull", bevel=0.006))
    P.append(box("grille_back", (1.5, 0.02, gz1 - gz0 - 0.06), loc=(0, gy - 0.05, (gz0 + gz1) / 2), m="frame_black"))
    P.append(box("radiator", (1.3, 0.08, 0.5), loc=(0, gy - 0.18, 0.88), m="metal_dark"))
    for k in range(6):
        z = gz0 + 0.05 + k * (gz1 - gz0 - 0.1) / 5
        P.append(box("grille_bar", (1.48, 0.03, 0.022), loc=(0, gy - 0.005, z), m="plastic_gray"))
    for xx in (-0.36, -0.12, 0.12, 0.36):
        P.append(box("grille_vbar", (0.018, 0.035, gz1 - gz0 - 0.06), loc=(xx, gy - 0.004, (gz0 + gz1) / 2), m="plastic_gray"))
    P.append(box("grille_center", (0.06, 0.05, gz1 - gz0 - 0.04), loc=(0, gy + 0.005, (gz0 + gz1) / 2), m="chrome_dull", bevel=0.008))
    for sx in (-1, 1):
        hx, hz = sx * 0.6, 0.89
        P.append(box("hl_bezel", (0.27, 0.035, 0.25), loc=(hx, gy + 0.012, hz), m="chrome_dull", bevel=0.012))
        P.append(cyl("hl_bucket", 0.1, 0.06, loc=(hx, gy + 0.0, hz), rot=(PI / 2, 0, 0), m="frame_black", verts=24))
        P.append(kit.torus("hl_ring", 0.093, 0.01, loc=(hx, gy + 0.035, hz), rot=(PI / 2, 0, 0), m="chrome_dull", seg=24, rseg=6))
        L.append(("head", kit.sphere("hl_lens", 0.09, loc=(hx, gy + 0.025, hz), m="lamp_lens", segs=20, rings=10, scale=(1, 0.25, 1))))
        empty(f"light_head_{'L' if sx < 0 else 'R'}", loc=(hx, gy + 0.06, hz), parent=root)
    bprof = kit.ccw([(2.63, 0.42), (2.74, 0.425), (2.785, 0.46), (2.79, 0.535), (2.785, 0.60), (2.74, 0.632), (2.63, 0.638)])
    P.append(kit.prism_yz("bumper_f", bprof, -0.96, 0.96, m="chrome_dull", bevel=0.004))
    for sx in (-1, 1):   # wrap-around ends
        P.append(seg_box("bumper_f_end", (sx * 0.94, 2.735, 0.53), (sx * 1.005, 2.57, 0.53), 0.06, 0.2, "chrome_dull"))
        P.append(box("park_lamp", (0.16, 0.012, 0.05), loc=(sx * 0.55, 2.792, 0.535), m="lamp_lens_amber"))
        P.append(box("bumper_bracket", (0.08, 0.2, 0.08), loc=(sx * 0.46, 2.55, 0.52), m="metal_dark"))
        P.append(kit.torus("tow_hook", 0.045, 0.012, loc=(sx * 0.46, 2.66, 0.36), rot=(0, PI / 2, 0), m="steel_painted_gray", seg=12, rseg=5))
    P.append(box("valance", (1.56, 0.03, 0.06), loc=(0, gy - 0.01, 0.615), m="frame_black"))
    P.append(box("plate_f", (0.31, 0.008, 0.155), loc=(0, 2.80, 0.33), rot=(0.06, 0, 0), m="plate_white"))
    P.append(box("plate_f_frame", (0.33, 0.006, 0.175), loc=(0, 2.797, 0.33), rot=(0.06, 0, 0), m="chrome_dull"))
    P.append(box("plate_bracket", (0.1, 0.12, 0.06), loc=(0, 2.74, 0.4), m="metal_dark"))

    # ---------------- cab lower body, back wall, greenhouse
    for sx in (-1, 1):
        P.append(box("rocker", (0.07, 1.33, 0.11), loc=(sx * 0.955, 0.33, 0.515), m=CREAM, bevel=0.01))
        # cab rear corner (behind the door) with the band
        side_panel(P, "cab_corner", [(-0.40, 0.46), (-0.27, 0.46), (-0.27, 1.22), (-0.40, 1.22)], *((0.92, 0.985) if sx > 0 else (-0.985, -0.92)))
        for z in (ZB0, ZB1):
            P.append(box("spear", (0.012, 0.13, 0.014), loc=(sx * 0.991, -0.335, z), m="chrome_dull"))
        # sail panel (B pillar) with tumblehome
        P.append(obox("b_pillar", (sx * 0.985, -0.40, 1.22), (0, 1, 0), (-sx * 0.115, 0.03, 0.58), (-sx, 0, 0), 0, 0.15, 0, 1, 0, 0.06, CREAM))
        # A pillar
        P.append(seg_box("a_pillar", (sx * 0.96, 0.99, 1.23), (sx * 0.865, 0.67, 1.79), 0.07, 0.065, CREAM, up=(sx, 0, 0.3)))
        # drip rail
        tube(P, "drip", [(sx * 0.885, 0.70, 1.80), (sx * 0.885, 0.2, 1.80), (sx * 0.885, -0.29, 1.80)], 0.011, CREAM, seg=6)
    P.append(box("cab_back_low", (1.94, 0.05, 0.76), loc=(0, -0.375, 0.84), m=CREAM, bevel=0.008))
    # back panel above the belt: tapered posts either side of the rear window (tumblehome)
    for sx in (-1, 1):
        P.append(quad_slab("cab_back_post", (sx * 0.985, -0.375, 1.22), (sx * 0.65, -0.375, 1.22), (sx * 0.65, -0.36, 1.80), (sx * 0.87, -0.36, 1.80), 0.05, (0, 1, 0), CREAM))
    P.append(box("cab_back_belt", (1.32, 0.05, 0.1), loc=(0, -0.375, 1.27), m=CREAM))
    P.append(box("cab_back_head", (1.32, 0.05, 0.1), loc=(0, -0.36, 1.75), m=CREAM))
    P.append(box("rear_glass", (1.30, 0.008, 0.38), loc=(0, -0.368, 1.51), m="glass_clear"))
    for (z, h) in ((1.325, 0.012), (1.695, 0.012)):
        P.append(box("rear_glass_trim", (1.32, 0.012, h), loc=(0, -0.39, z), m="rubber_black"))
    # roof (crowned)
    roof = kit.prism_xz("roof", kit.ccw([(-0.865, 1.785), (0.865, 1.785), (0.88, 1.80), (0.84, 1.845), (0.55, 1.862), (-0.55, 1.862), (-0.84, 1.845), (-0.88, 1.80)]), -0.38, 0.70, m=CREAM, bevel=0.01)
    P.append(roof)
    P.append(box("headliner", (1.66, 1.02, 0.02), loc=(0, 0.16, 1.77), m="fabric_bed"))
    # windshield with reveal moulding
    wb, wt = (0.0, 1.0, 1.245), (0.0, 0.69, 1.775)
    Uw = V((1, 0, 0))
    Vw = V(wt) - V(wb)
    Nw = Uw.cross(Vw).normalized()
    P.append(quad_slab("windshield", (-0.93, 1.0, 1.245), (0.93, 1.0, 1.245), (0.835, 0.69, 1.775), (-0.835, 0.69, 1.775), 0.008, Nw, "glass_clear"))
    for (a, b) in (((-0.885, 1.005, 1.24), (0.885, 1.005, 1.24)), ((-0.82, 0.685, 1.78), (0.82, 0.685, 1.78))):
        P.append(seg_box("ws_trim", a, b, 0.02, 0.025, "chrome_dull"))
    P.append(box("mirror_in", (0.22, 0.03, 0.07), loc=(0, 0.66, 1.68), m="plastic_dark", bevel=0.01))
    P.append(cyl("mirror_in_stem", 0.008, 0.08, loc=(0, 0.69, 1.73), m="metal_dark", verts=6))
    for sx in (-1, 1):
        P.append(box("sun_visor", (0.6, 0.17, 0.025), loc=(sx * 0.42, 0.55, 1.75), rot=(0.12, 0, 0), m="fabric_bed", bevel=0.008))
        P.append(cyl("visor_pivot", 0.008, 0.08, loc=(sx * 0.74, 0.63, 1.76), rot=(0, PI / 2, 0), m="chrome_dull", verts=6))
    P.append(box("dome_light", (0.16, 0.08, 0.02), loc=(0, -0.05, 1.76), m="plastic_white", bevel=0.005))

    # ---------------- bed (fleetside long bed)
    for sx in (-1, 1):
        ap = arch_pts(RY, WR, ARCH_R, 0.56)
        prof = [(-2.76, 0.56), (ap[-1][0], 0.56)] + list(reversed(ap)) + [(ap[0][0], 0.56), (-0.43, 0.56), (-0.43, 1.18), (-2.76, 1.18)]
        x0, x1 = (0.93, 1.0) if sx > 0 else (-1.0, -0.93)
        side_panel(P, "bedside", prof, x0, x1, arch=(RY, WR, ARCH_R))
        tube(P, "bed_lip", [(sx * 1.0, y, z) for (y, z) in ap], 0.018, CREAM, seg=6)
        for (y0, y1, z) in ((-0.43, -1.28, ZB0), (-1.82, -2.74, ZB0), (-0.43, -2.74, ZB1)):
            P.append(box("spear", (0.012, abs(y1 - y0), 0.014), loc=(sx * 1.006, (y0 + y1) / 2, z), m="chrome_dull"))
        P.append(box("bed_cap", (0.1, 2.33, 0.035), loc=(sx * 0.95, -1.595, 1.195), m=CREAM, bevel=0.006))
        for y in (-0.62, -1.55, -2.55):
            P.append(box("stake_pocket", (0.05, 0.08, 0.004), loc=(sx * 0.95, y, 1.214), m="frame_black"))
        whp = [(RY - 0.424, 0.86)] + [(RY + 0.52 * math.cos(math.radians(a)), 0.56 + 0.52 * math.sin(math.radians(a))) for a in range(145, 34, -10)] + [(RY + 0.424, 0.86)]
        P.append(kit.prism_yz("wheelhouse", kit.ccw(whp), *((0.62, 0.93) if sx > 0 else (-0.93, -0.62)), m="steel_painted_gray", bevel=0.01))
        P.append(liner("wheelwell_r", RY, WR, *((0.62, 0.93) if sx > 0 else (-0.93, -0.62))))
        # tail lamp housings (red lens + white back-up lens)
        P.append(box("tail_housing", (0.08, 0.05, 0.36), loc=(sx * 0.965, -2.765, 0.88), m="chrome_dull", bevel=0.008))
        L.append(("tail", box("tail_lens", (0.065, 0.012, 0.24), loc=(sx * 0.965, -2.792, 0.92), m="lamp_lens_red")))
        P.append(box("backup_lens", (0.065, 0.012, 0.07), loc=(sx * 0.965, -2.792, 0.75), m="lamp_lens"))
        P.append(box("marker_r", (0.015, 0.09, 0.05), loc=(sx * 1.004, -2.6, 1.05), m="lamp_lens_red"))
        empty(f"light_tail_{'L' if sx < 0 else 'R'}", loc=(sx * 0.965, -2.8, 0.92), parent=root)
    P.append(box("fuel_door", (0.012, 0.14, 0.14), loc=(-1.006, -0.72, 1.06), m=CREAM, bevel=0.004))
    P.append(cyl("fuel_cap", 0.045, 0.012, loc=(-1.014, -0.72, 1.06), rot=(0, PI / 2, 0), m="chrome_dull", verts=16))
    P.append(box("bed_floor", (1.86, 2.3, 0.03), loc=(0, -1.59, 0.855), m="metal_gray"))
    for k in range(9):
        P.append(box("bed_rib", (0.045, 2.28, 0.018), loc=(-0.8 + k * 0.2, -1.59, 0.875), m="metal_gray", bevel=0.004))
    P.append(box("bed_front", (1.86, 0.04, 0.33), loc=(0, -0.45, 1.02), m=CREAM))
    P.append(box("bed_front_cap", (1.96, 0.1, 0.035), loc=(0, -0.45, 1.195), m=CREAM, bevel=0.006))
    # tailgate
    P.append(box("tailgate", (1.84, 0.05, 0.56), loc=(0, -2.735, 0.885), m=CREAM, bevel=0.01))
    for z in (0.74, 1.04):
        P.append(box("tg_rib", (1.7, 0.012, 0.03), loc=(0, -2.765, z), m=CREAM, bevel=0.004))
    P.append(box("tg_band", (1.72, 0.012, 0.14), loc=(0, -2.763, 0.89), m=BLUE))
    P.append(box("tg_handle", (0.22, 0.03, 0.05), loc=(0, -2.77, 1.12), m="chrome_dull", bevel=0.006))
    for sx in (-1, 1):
        tube(P, "tg_cable", [(sx * 0.9, -2.7, 1.14), (sx * 0.92, -2.55, 1.12)], 0.006, "metal_gray", seg=5)
    # rear bumper, plate, hitch
    rb = kit.ccw([(-2.80, 0.45), (-2.88, 0.455), (-2.905, 0.50), (-2.905, 0.585), (-2.88, 0.625), (-2.80, 0.63)])
    P.append(kit.prism_yz("bumper_r", rb, -0.95, 0.95, m="chrome_dull", bevel=0.004))
    P.append(box("plate_r", (0.31, 0.008, 0.155), loc=(0, -2.915, 0.48), m="plate_white"))
    P.append(box("plate_r_frame", (0.33, 0.006, 0.175), loc=(0, -2.912, 0.48), m="chrome_dull"))
    P.append(box("plate_light", (0.08, 0.04, 0.03), loc=(0, -2.92, 0.575), m="chrome_dull"))
    P.append(box("hitch_tongue", (0.12, 0.2, 0.03), loc=(0, -2.98, 0.61), m="metal_dark"))
    P.append(kit.sphere("hitch_ball", 0.025, loc=(0, -3.04, 0.66), m="chrome_dull", segs=12, rings=8))
    P.append(cyl("hitch_shank", 0.012, 0.04, loc=(0, -3.04, 0.63), m="chrome_dull", verts=8))


def rack(P):
    """Blue tubular ladder rack: hoops at the cab back and tailgate, top rails, overcab extension, headache guard."""
    m, r = "steel_painted_blue", 0.022
    for y in (-0.52, -2.62):
        tube(P, "rack_hoop", [(-0.95, y, 1.21), (-0.95, y, 1.93), (-0.89, y, 2.0), (0.89, y, 2.0), (0.95, y, 1.93), (0.95, y, 1.21)], r, m, seg=8)
        for sx in (-1, 1):
            P.append(box("rack_clamp", (0.1, 0.09, 0.04), loc=(sx * 0.95, y, 1.225), m=m))
    for sx in (-1, 1):
        tube(P, "rack_rail", [(sx * 0.92, -2.62, 2.0), (sx * 0.92, -0.52, 2.0), (sx * 0.92, 0.28, 2.0)], r, m, seg=8)
        tube(P, "rack_brace", [(sx * 0.95, -0.52, 1.62), (sx * 0.95, -1.05, 1.22)], r * 0.8, m, seg=6)
        tube(P, "rack_brace", [(sx * 0.95, -2.62, 1.62), (sx * 0.95, -2.12, 1.22)], r * 0.8, m, seg=6)
        tube(P, "rack_strut", [(sx * 0.92, 0.28, 2.0), (sx * 0.92, -0.2, 1.95), (sx * 0.95, -0.52, 1.93)], r * 0.8, m, seg=6)
    tube(P, "rack_front", [(-0.92, 0.28, 2.0), (0.92, 0.28, 2.0)], r, m, seg=8)
    tube(P, "rack_mid", [(-0.92, -1.57, 2.0), (0.92, -1.57, 2.0)], r * 0.8, m, seg=6)
    for k in range(7):
        x = -0.6 + k * 0.2
        tube(P, "rack_guard", [(x, -0.52, 1.23), (x, -0.52, 1.98)], 0.009, m, seg=5)
    tube(P, "rack_guard_h", [(-0.93, -0.52, 1.6), (0.93, -0.52, 1.6)], 0.012, m, seg=6)


def chassis(P):
    md = "metal_dark"
    for sx in (-1, 1):
        P.append(box("frame_rail", (0.07, 5.2, 0.17), loc=(sx * 0.46, -0.03, 0.56), m=md))
        # leaf springs (three leaves each) front and rear, shackles
        for (ay, half) in ((FY, 0.55), (RY, 0.62)):
            for k, ln in enumerate((1.0, 0.8, 0.55)):
                l2 = half * ln
                P.append(seg_box("leaf", (sx * 0.46, ay - l2, 0.47 + k * 0.012), (sx * 0.46, ay + l2, 0.47 + k * 0.012), 0.06, 0.01, md))
                P.append(seg_box("leaf_bow", (sx * 0.46, ay - 0.15, 0.455 - k * 0.012), (sx * 0.46, ay + 0.15, 0.455 - k * 0.012), 0.06, 0.012, md))
            P.append(box("u_bolt", (0.08, 0.1, 0.12), loc=(sx * 0.46, ay, 0.44), m=md))
            P.append(seg_box("shock", (sx * 0.56, ay + 0.15, 0.42), (sx * 0.5, ay + 0.35, 0.68), 0.045, 0.045, "rubber_black"))
    for y in (2.45, 1.0, -0.4, -2.0, -2.6):
        P.append(box("crossmember", (0.92, 0.08, 0.1), loc=(0, y, 0.55), m=md))
    # axles and differentials
    for (ay, dx) in ((FY, 0.12), (RY, 0.0)):
        P.append(cyl("axle", 0.045, 1.44, loc=(0, ay, WR), rot=(0, PI / 2, 0), m=md, verts=12))
        P.append(kit.sphere("diff", 0.13, loc=(dx, ay, WR), m=md, segs=16, rings=10, scale=(1.0, 0.9, 0.95)))
        P.append(cyl("diff_cover", 0.1, 0.04, loc=(dx, ay - 0.13, WR), rot=(PI / 2, 0, 0), m=md, verts=16))
        for sx in (-1, 1):
            P.append(cyl("hub", 0.08, 0.12, loc=(sx * 0.68, ay, WR), rot=(0, PI / 2, 0), m=md, verts=12))
    P.append(box("tie_rod", (1.3, 0.025, 0.025), loc=(0, FY + 0.2, 0.33), m=md))
    # engine sump, transmission, transfer case, shafts
    P.append(box("oil_pan", (0.42, 0.7, 0.16), loc=(0, 1.9, 0.62), m=md, bevel=0.02))
    P.append(box("bellhousing", (0.4, 0.3, 0.3), loc=(0, 1.2, 0.7), m="metal_gray", bevel=0.04))
    P.append(box("transmission", (0.3, 0.7, 0.26), loc=(0, 0.75, 0.66), m="metal_gray", bevel=0.04))
    P.append(box("transfer_case", (0.3, 0.3, 0.22), loc=(0.08, 0.28, 0.58), m=md, bevel=0.03))
    P.append(seg_box("driveshaft_r", (0.0, 0.12, 0.56), (0.0, RY + 0.14, WR + 0.02), 0.075, 0.075, md))
    P.append(seg_box("driveshaft_f", (0.12, 0.42, 0.52), (0.12, FY - 0.14, WR + 0.02), 0.06, 0.06, md))
    # exhaust: manifold down-pipe → muffler → tail pipe exiting behind the right rear wheel
    tube(P, "exhaust", [(-0.3, 2.0, 0.75), (-0.32, 1.6, 0.48), (-0.25, 0.9, 0.44), (0.2, 0.4, 0.43), (0.3, 0.1, 0.43)], 0.03, "rust", seg=8)
    P.append(cyl("muffler", 0.11, 0.65, loc=(0.32, -0.25, 0.43), rot=(PI / 2, 0, 0), m="rust", verts=14))
    tube(P, "tailpipe", [(0.32, -0.58, 0.43), (0.36, -1.0, 0.44), (0.62, -1.15, 0.6), (0.66, -1.95, 0.6), (0.62, -2.1, 0.44), (0.66, -2.55, 0.42), (0.7, -2.72, 0.42)], 0.028, "rust", seg=8)
    P.append(box("fuel_tank", (0.62, 0.55, 0.3), loc=(-0.05, -0.8, 0.52), m=md, bevel=0.03))
    # spare tyre hung under the rear of the bed
    P.append(kit.torus("spare", 0.3, 0.1, loc=(0, -2.3, 0.5), m="tire_rubber", seg=24, rseg=8))
    P.append(cyl("spare_rim", 0.21, 0.16, loc=(0, -2.3, 0.5), m="steel_painted_white", verts=20))
    P.append(box("spare_carrier", (0.08, 0.7, 0.04), loc=(0, -2.3, 0.39), m=md))


# ------------------------------------------------------------------------------------------------ interior
def interior(P, root):
    P.append(box("cab_floor", (1.84, 1.35, 0.04), loc=(0, 0.33, 0.62), m="rubber_mat"))
    P.append(box("trans_hump", (0.42, 0.75, 0.16), loc=(0.0, 0.62, 0.70), m="rubber_mat", bevel=0.05))
    P.append(box("firewall", (1.84, 0.04, 0.6), loc=(0, 1.0, 0.92), m=CREAM))
    for sx in (-1, 1):
        P.append(box("kick_panel", (0.04, 0.3, 0.42), loc=(sx * 0.9, 0.86, 0.85), m="plastic_dark"))
        P.append(box("sill_plate", (0.08, 1.2, 0.01), loc=(sx * 0.93, 0.33, 0.575), m="metal_brushed"))
    # dashboard: painted metal face, padded top, instrument pod, radio, heater controls, glovebox
    P.append(box("dash_face", (1.84, 0.05, 0.3), loc=(0, 0.9, 1.1), rot=(-0.12, 0, 0), m=CREAM))
    P.append(box("dash_pad", (1.84, 0.2, 0.07), loc=(0, 0.93, 1.25), m="vinyl_blue", bevel=0.025))
    P.append(box("dash_lower", (1.84, 0.12, 0.08), loc=(0, 0.92, 0.94), m="vinyl_blue", bevel=0.02))
    P.append(box("ins_hood", (0.5, 0.1, 0.05), loc=(-0.42, 0.86, 1.24), m="vinyl_blue", bevel=0.015))
    P.append(box("ins_panel", (0.48, 0.02, 0.16), loc=(-0.42, 0.875, 1.14), m="frame_black"))
    for (gx, gz, gr) in ((-0.42, 1.14, 0.065), (-0.6, 1.15, 0.035), (-0.24, 1.15, 0.035)):
        P.append(cyl("gauge_face", gr, 0.01, loc=(gx, 0.866, gz), rot=(PI / 2, 0, 0), m="gauge_face", verts=24))
        P.append(kit.torus("gauge_ring", gr, 0.004, loc=(gx, 0.862, gz), rot=(PI / 2, 0, 0), m="chrome_dull", seg=24, rseg=4))
        P.append(box("gauge_needle", (0.004, 0.004, gr * 0.85), loc=(gx + gr * 0.25, 0.86, gz + gr * 0.2), rot=(0, 0.9, 0), m="warning_red"))
    for k in range(4):
        P.append(cyl("warn_lamp", 0.007, 0.006, loc=(-0.54 + k * 0.08, 0.866, 1.07), rot=(PI / 2, 0, 0), m="plastic_dark", verts=8))
    P.append(box("radio", (0.2, 0.04, 0.06), loc=(0.02, 0.875, 1.13), m="metal_brushed", bevel=0.005))
    P.append(box("radio_dial", (0.1, 0.006, 0.025), loc=(0.02, 0.853, 1.135), m="gauge_face"))
    for sx in (-1, 1):
        P.append(cyl("radio_knob", 0.015, 0.025, loc=(0.02 + sx * 0.075, 0.85, 1.13), rot=(PI / 2, 0, 0), m="chrome_dull", verts=12))
    for k in range(3):
        P.append(box("heater_lever", (0.012, 0.03, 0.025), loc=(0.2 + k * 0.05, 0.87, 1.05), m="chrome_dull"))
    P.append(box("heater_plate", (0.18, 0.006, 0.05), loc=(0.25, 0.878, 1.05), m="frame_black"))
    P.append(box("glovebox", (0.38, 0.015, 0.16), loc=(0.48, 0.872, 1.12), rot=(-0.12, 0, 0), m=CREAM, bevel=0.006))
    P.append(box("glove_button", (0.03, 0.01, 0.015), loc=(0.48, 0.862, 1.18), m="chrome_dull"))
    for (x, nm) in ((-0.7, "headlamp_knob"), (-0.1, "wiper_knob")):
        P.append(cyl(nm, 0.014, 0.03, loc=(x, 0.86, 1.03), rot=(PI / 2, 0, 0), m="chrome_dull", verts=10))
    P.append(cyl("ignition", 0.016, 0.02, loc=(-0.15, 0.87, 1.07), rot=(PI / 2, 0, 0), m="chrome_dull", verts=12))
    P.append(box("key", (0.012, 0.004, 0.035), loc=(-0.15, 0.852, 1.055), rot=(0, 0.3, 0), m="metal_brushed"))
    P.append(box("ashtray", (0.12, 0.012, 0.04), loc=(0.2, 0.875, 0.98), m="metal_brushed"))
    # pedals, column shifter, 4wd lever
    for (x, nm) in ((-0.62, "clutch"), (-0.45, "brake")):
        P.append(box(nm + "_pad", (0.08, 0.02, 0.06), loc=(x, 0.78, 0.82), rot=(0.4, 0, 0), m="rubber_black"))
        P.append(seg_box(nm + "_arm", (x, 0.86, 1.02), (x, 0.79, 0.83), 0.015, 0.02, "metal_dark"))
    P.append(box("throttle", (0.06, 0.02, 0.14), loc=(-0.24, 0.86, 0.72), rot=(0.7, 0, 0), m="rubber_black"))
    P.append(seg_box("transfer_lever", (0.12, 0.55, 0.74), (0.08, 0.5, 1.12), 0.018, 0.018, "metal_dark"))
    P.append(kit.sphere("transfer_knob", 0.025, loc=(0.08, 0.5, 1.13), m="plastic_dark", segs=10, rings=6))
    # bench seat with pleats, lap belts
    P.append(box("seat_base", (1.62, 0.52, 0.16), loc=(0, -0.04, 0.9), m="vinyl_blue", bevel=0.05, segs=3))
    for k in range(9):
        P.append(box("seat_pleat", (0.13, 0.48, 0.012), loc=(-0.72 + k * 0.18, -0.04, 0.985), m="vinyl_blue", bevel=0.005))
    back = box("seat_back", (1.62, 0.13, 0.6), loc=(0, -0.29, 1.27), rot=(-0.2, 0, 0), m="vinyl_blue", bevel=0.05, segs=3)
    P.append(back)
    for k in range(9):
        P.append(box("seat_back_pleat", (0.13, 0.012, 0.5), loc=(-0.72 + k * 0.18, -0.218, 1.29), rot=(-0.2, 0, 0), m="vinyl_blue", bevel=0.005))
    P.append(box("seat_frame", (1.5, 0.45, 0.22), loc=(0, -0.05, 0.72), m="metal_dark"))
    for sx in (-1, 1):
        P.append(box("lap_belt", (0.05, 0.4, 0.006), loc=(sx * 0.35, 0.0, 0.982), rot=(0, 0, sx * 0.3), m="rubber_black"))
        P.append(box("belt_buckle", (0.04, 0.06, 0.012), loc=(sx * 0.3, 0.17, 0.985), m="chrome_dull"))
    # clutter: cap and papers on the dash, thermos on the seat
    P.append(kit.sphere("cap_crown", 0.09, loc=(0.55, 0.95, 1.31), m="cloth_khaki", segs=14, rings=7, scale=(1.0, 1.1, 0.55)))
    P.append(box("cap_bill", (0.14, 0.1, 0.01), loc=(0.55, 0.85, 1.29), m="cloth_khaki", bevel=0.004))
    P.append(box("papers", (0.22, 0.15, 0.01), loc=(-0.15, 0.97, 1.29), rot=(0, 0, 0.2), m="plastic_white"))
    P.append(cyl("thermos", 0.04, 0.3, loc=(0.6, -0.05, 1.13), rot=(0, 0, 0), m="pipe_blue", verts=12))
    # steering column + wheel (node 'steer': local Z = column axis, rim in local XY)
    sw = empty("steer", loc=(-0.42, 0.46, 1.2), rot=(1.01, 0, 0), parent=root)
    swp = [kit.torus("sw_rim", 0.205, 0.013, m="plastic_dark", seg=40, rseg=8)]
    for a in (PI / 2 + 0.4, PI / 2 - 0.4 + PI, -PI / 2):
        swp.append(seg_box("sw_spoke", (0, 0, 0.02), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0), 0.022, 0.01, "metal_brushed"))
    swp.append(cyl("sw_hub", 0.055, 0.06, loc=(0, 0, 0.03), m="plastic_dark", verts=20))
    swp.append(cyl("sw_horn", 0.04, 0.01, loc=(0, 0, 0.064), m="chrome_dull", verts=20))
    swm = merge(swp, "steer_mesh", par=sw)
    swm.location = (0, 0, 0)
    finish(swm, 40)
    col_dir = V((0, math.sin(1.01), -math.cos(1.01)))   # from the wheel toward the dash (local -Z in world)
    c0 = V((-0.42, 0.46, 1.2))
    P.append(seg_box("column", c0 + col_dir * 0.05, c0 + col_dir * 0.48, 0.07, 0.07, "vinyl_blue"))
    P.append(seg_box("shift_lever", c0 + col_dir * 0.15 + V((0.04, 0, 0)), c0 + col_dir * 0.12 + V((0.3, -0.06, -0.05)), 0.014, 0.014, "chrome_dull"))
    P.append(kit.sphere("shift_knob", 0.02, loc=c0 + col_dir * 0.12 + V((0.3, -0.06, -0.05)), m="plastic_dark", segs=10, rings=6))
    P.append(seg_box("turn_stalk", c0 + col_dir * 0.12 + V((-0.04, 0, 0)), c0 + col_dir * 0.1 + V((-0.2, -0.04, -0.02)), 0.01, 0.01, "chrome_dull"))


# ------------------------------------------------------------------------------------------------ doors
def doors(root):
    for sx, nm in ((-1, "L"), (1, "R")):
        hx = sx * 0.99
        dv = empty(f"door_{nm}", loc=(hx, 0.965, 0.0), parent=root, interact="cardoor", iid=f"pickup_door_{nm}", side=sx)
        dp = []
        # outer skin (two-tone band) — local y runs back from the hinge (y = 0 .. -1.23)
        prof = [(-1.225, 0.47), (-0.005, 0.47), (-0.005, 1.22), (-1.225, 1.22)]
        for (pp, m) in band_split(prof):
            if len(pp) >= 3:
                o = kit.prism_yz("door_skin", kit.ccw(pp), *((-0.045, 0.0) if sx > 0 else (0.0, 0.045)), m=m)
                kit.add_bevel(o, 0.008, 2, 40)
                dp.append(o)
        for z in (ZB0, ZB1):
            dp.append(box("spear", (0.012, 1.2, 0.014), loc=(sx * 0.006, -0.615, z), m="chrome_dull"))
        dp.append(box("door_inner", (0.05, 1.18, 0.66), loc=(-sx * 0.07, -0.615, 0.86), m="vinyl_blue", bevel=0.02))
        dp.append(box("armrest", (0.07, 0.3, 0.05), loc=(-sx * 0.12, -0.75, 0.98), m="vinyl_blue", bevel=0.015))
        dp.append(seg_box("crank", (-sx * 0.1, -0.45, 1.02), (-sx * 0.14, -0.45, 1.06), 0.012, 0.012, "chrome_dull"))
        dp.append(box("crank_arm", (0.012, 0.09, 0.012), loc=(-sx * 0.145, -0.49, 1.06), m="chrome_dull"))
        dp.append(cyl("crank_knob", 0.012, 0.035, loc=(-sx * 0.16, -0.53, 1.06), rot=(0, PI / 2, 0), m="plastic_dark", verts=8))
        dp.append(box("inner_handle", (0.02, 0.08, 0.02), loc=(-sx * 0.1, -1.0, 1.08), m="chrome_dull"))
        # window frame with tumblehome, vent window and main glass
        bb = lambda y, z: V((sx * (0.0 - (z - 1.22) / 0.58 * 0.115) - sx * 0.02, y, z))
        corners = {"fb": bb(-0.03, 1.225), "ft": bb(-0.31, 1.795), "rt": bb(-1.2, 1.795), "rb": bb(-1.2, 1.225)}
        for (a, b) in (("fb", "ft"), ("ft", "rt"), ("rt", "rb")):
            dp.append(seg_box("win_frame", corners[a], corners[b], 0.035, 0.035, "chrome_dull", up=(sx, 0, 0)))
        vdiv_b, vdiv_t = bb(-0.42, 1.225), bb(-0.42, 1.795)
        dp.append(seg_box("vent_post", vdiv_b, vdiv_t, 0.03, 0.025, "chrome_dull", up=(sx, 0, 0)))
        nrm = V((sx, 0, 0.2 * sx * 0)).normalized()
        dp.append(quad_slab("vent_glass", corners["fb"], vdiv_b, vdiv_t, corners["ft"], 0.006, nrm, "glass_clear"))
        dp.append(quad_slab("door_glass", vdiv_b, corners["rb"], corners["rt"], vdiv_t, 0.006, nrm, "glass_clear"))
        dp.append(box("belt_seal", (0.02, 1.19, 0.02), loc=(sx * 0.0 - sx * 0.02, -0.62, 1.225), m="rubber_black"))
        # handle, lock, west-coast mirror
        dp.append(box("handle", (0.03, 0.17, 0.035), loc=(sx * 0.02, -1.06, 1.08), m="chrome_dull", bevel=0.008))
        dp.append(cyl("lock", 0.012, 0.012, loc=(sx * 0.018, -1.06, 1.025), rot=(0, PI / 2, 0), m="chrome_dull", verts=10))
        for z in (1.18, 1.0):
            dp.append(seg_box("mirror_arm", (sx * 0.02, -0.15, z), (sx * 0.22, -0.12, z + 0.12), 0.02, 0.02, "chrome_dull"))
        dp.append(box("mirror_head", (0.04, 0.17, 0.28), loc=(sx * 0.235, -0.11, 1.22), m="chrome_dull", bevel=0.012))
        dp.append(box("mirror_glass", (0.006, 0.15, 0.26), loc=(sx * 0.212, -0.11, 1.22), m="glass_dark"))
        dm = merge(dp, f"door_{nm}_mesh", par=dv)
        dm.location = (0, 0, 0)
        finish(dm, 30)
        empty(f"exit_{nm}", loc=(sx * 1.8, 0.2, 0.0), parent=root)


# ------------------------------------------------------------------------------------------------ build
def screen_plane(name, par, loc, size, rot=(0, 0, 0), m="emit_screen"):
    """Canvas-texture screen facing -Y (towards the driver); V inverted to cancel the glTF flip + three.js flipY."""
    w, h = size
    bm = bmesh.new()
    a = bm.verts.new((-w / 2, 0, -h / 2)); b = bm.verts.new((w / 2, 0, -h / 2))
    c = bm.verts.new((w / 2, 0, h / 2)); d = bm.verts.new((-w / 2, 0, h / 2))
    f = bm.faces.new((a, b, c, d))
    uvl = bm.loops.layers.uv.new("UVMap")
    for loop, uv in zip(f.loops, ((0, 1), (1, 1), (1, 0), (0, 0))):
        loop[uvl].uv = uv
    o = kit.from_bmesh(name, bm, (m,), loc=loc, rot=rot, par=par)
    o["screen"] = 1
    o["sw"] = w
    o["sh"] = h
    return o


def pickup(preview=True):
    kit.reset()
    random.seed(3)
    root = empty("Pickup", vehicle="car")
    P, Lm = [], []
    body(P, Lm, root)
    rack(P)
    chassis(P)
    interior(P, root)
    doors(root)
    st = merge(P, "pickup_body", par=root)
    finish(st, 35)
    for grp in ("head", "tail"):
        objs = [o for (g, o) in Lm if g == grp]
        lm = merge(objs, f"lamps_{grp}", par=root, lamp=grp)
        finish(lm, 30)
    # aftermarket GPS on the dash top, screen facing the driver
    box("gps_body", (0.17, 0.04, 0.115), loc=(0.05, 0.86, 1.355), rot=(-0.25, 0, 0), m="plastic_dark", par=root, bevel=0.01)
    box("gps_foot", (0.06, 0.08, 0.04), loc=(0.05, 0.9, 1.29), m="plastic_dark", par=root)
    screen_plane("screen_gps", root, (0.05, 0.837, 1.36), (0.145, 0.092), rot=(-0.25, 0, 0))
    for (nm, x, y) in (("FL", -TR, FY), ("FR", TR, FY), ("RL", -TR, RY), ("RR", TR, RY)):
        wheel(f"wheel_{nm}", root, x, y)
    empty("eye_driver", loc=(-0.42, -0.12, 1.56), parent=root)
    path = os.path.join(kit.out_dir(), "pickup.glb")
    kit.export_glb(path, root)
    if preview:
        pd = kit.preview_dir()
        w = (0.62, 0.66, 0.7)
        kit.preview(os.path.join(pd, "pickup.png"), (4.6, 6.6, 1.7), (0, 0.4, 0.9), lens=40, samples=24, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "pickup_rear.png"), (-4.2, -6.4, 2.2), (0, -0.6, 0.9), lens=40, samples=20, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "pickup_front.png"), (1.6, 7.5, 1.3), (0, 1.0, 0.95), lens=45, samples=20, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "pickup_cab.png"), (-0.42, -0.12, 1.56), (-0.2, 1.2, 1.15), lens=24, samples=20, world=w, sun=(0.4, 0.6, 0.7))


if __name__ == "__main__":
    pickup(preview="--nopreview" not in sys.argv)
