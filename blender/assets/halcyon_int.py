"""WSV-1 HALCYON: the walkable interior (Part 2 directive, section 06), in the ship's frame (warpship.py): +Y toward
the bow, +Z dorsal, origin on the axis between the rings. Deck gravity (the ship's field coils in deck mode, a
speculative assumption like the drive) holds people to the floors; the dorsal airlock shaft is weightless.

Floor plan (deck 1 at z = 0, rooms 2.8 m high; the corridor runs down the middle of the spine):

    saucer   astrometry centre (fwd) | central hall + stair to the bridge | warp-field operations (port),
             science lab B (starboard)
    neck     pressure door, passage
    spine    y  12 .. 21.5  medical bay (port)          life support / hydroponics (stbd)
             y   0 .. 12    three crew cabins (port)    mess + galley, hygiene (stbd)
             y -12.5 .. 0   cryogenic hibernation (port, four capsules)   storage and cargo (stbd)
             y -26.5 .. -12.5  science lab A (port)     pod-bay access: stair down, pod launch control (stbd)
             y -36 .. -26.5 field-ring access B (port)  dorsal airlock hall under the gangway (stbd half)
             y -46 .. -36   engineering control
    stern    (reactor observation gallery and engine rooms: next part)
    deck 2   pod launch and recovery bay (y -24 .. 13): four stations over the ventral doors, walkway, bridges
    bridge   inside the canopy: raised command dais (z 7.45) over the saucer's centre, flight deck (z 6.35) in front,
             the panoramic window band cut through the hull (warpship.F1 .. F2), reached by a two-flight stair
             from the central hall

Exported as halcyon_int.glb: shell / detail / emissive / glass per section (culled by the engine per room), doors
(`slide`), lights, `seat`, `terminal`, `screen`, `cryo`, `post`, `podbay` and `nav` markers.
"""
import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
from bl import *  # noqa: E402,F403
from fac import Fac, T, RX, RY, RZ, at  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from meridian import wall_y, wall_x, rect, circle, handrail_wall  # noqa: E402
import warpship as W  # noqa: E402

Z1, H1 = 0.0, 2.8          # deck 1 floor and room height
CX, SX = 1.25, 5.5         # corridor half width, side rooms' outer wall
YF, YA = 21.5, -46.0       # spine interior: forward bulkhead, engineering's aft wall
GX, GY, GR = 0.0, -32.0, 1.15    # dorsal airlock shaft (under the collar and the platform's gangway)
HATCH_Z = 9.62             # underside of the dorsal hatch
ZU, ZL = 7.45, 6.35        # bridge: command dais and flight deck floors
R_DAIS = 8.6               # dais edge (radius round the saucer centre: the saucer's top terrace)
POD_Y = (8.0, -1.0, -10.0, -19.0)
PB = (-24.0, 13.0)         # pod bay extent along y
ZB0, ZB1, ZW = -6.6, -0.6, -3.6   # pod bay floor (the ventral doors), ceiling, walkway level


def slide_x(F, x, yc, w=1.1, h=2.15, label="Door", auto=2.3, z=Z1):
    """Automatic door in a wall in the plane x (opening yc +- w/2); the leaf slides toward -y into the wall."""
    return F.slide(F.uid("d"), T((x - 0.12, yc + w / 2, 0)) @ RZ(-90), 0.0, z, w, h, t=0.24, thick=0.1, label=label, auto=auto, time=0.8)


def slide_y(F, y, xc, w=1.1, h=2.15, label="Door", auto=2.3, z=Z1):
    """Automatic door in a wall in the plane y (opening xc +- w/2); the leaf slides toward +x into the wall."""
    return F.slide(F.uid("d"), T((xc - w / 2, y - 0.12, 0)), 0.0, z, w, h, t=0.24, thick=0.1, label=label, auto=auto, time=0.8)


def strips(F, x0, x1, y0, y1, z, room, along="y", step=3.2, power=11.0, L=1.2):
    if along == "y":
        n = max(1, int((y1 - y0) / step))
        for k in range(n):
            F.strip((x0 + x1) / 2, y0 + (k + 0.5) * (y1 - y0) / n, z, yaw=90, L=L, power=power, room=room)
    else:
        n = max(1, int((x1 - x0) / step))
        for k in range(n):
            F.strip(x0 + (k + 0.5) * (x1 - x0) / n, (y0 + y1) / 2, z, yaw=0, L=L, power=power, room=room)


def floor_rect_holes(F, x0, y0, x1, y1, z, mat, holes):
    """Floor slab with rectangular holes (x0, y0, x1, y1) given in plan: grid strips round them."""
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[2] for h in holes]})
    ys = sorted({y0, y1, *[h[1] for h in holes], *[h[3] for h in holes]})
    for a, b in zip(xs[:-1], xs[1:]):
        for c, d in zip(ys[:-1], ys[1:]):
            cx, cy = (a + b) / 2, (c + d) / 2
            if any(h[0] <= cx <= h[2] and h[1] <= cy <= h[3] for h in holes):
                continue
            F.floor(a, c, b, d, z, mat)


def ceil_rect_holes(F, x0, y0, x1, y1, z, mat, holes):
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[2] for h in holes]})
    ys = sorted({y0, y1, *[h[1] for h in holes], *[h[3] for h in holes]})
    for a, b in zip(xs[:-1], xs[1:]):
        for c, d in zip(ys[:-1], ys[1:]):
            cx, cy = (a + b) / 2, (c + d) / 2
            if any(h[0] <= cx <= h[2] and h[1] <= cy <= h[3] for h in holes):
                continue
            F.ceil(a, c, b, d, z, mat)


def inner_tube(P, cx, cy, r, z0, z1, mat, segs=32, rows=6):
    """Vertical cylinder seen from inside (normals inward)."""
    verts, faces = [], []
    for k in range(rows + 1):
        z = z0 + (z1 - z0) * k / rows
        for i in range(segs):
            a = 2 * math.pi * i / segs
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    for k in range(rows):
        for i in range(segs):
            a0, a1 = k * segs + i, k * segs + (i + 1) % segs
            faces.append((a0, a0 + segs, a1 + segs, a1))
    P.mesh(verts, faces, mat=mat, recalc=False)


# ===================================================================================================== spine
def spine_shell(F):
    """Floors, ceilings and the walls of deck 1 along the spine, with every door."""
    zc = Z1 + H1
    # ---- floors (the pod-access stair hole) and ceilings (the airlock shaft hole)
    stair_hole = (2.85, -18.7, 4.55, -13.0)
    for (y0, y1, mat) in ((12.0, YF, "floor_panel"), (0.0, 12.0, "floor_panel_tan"), (-12.5, 0.0, "floor_panel"),
                          (-26.5, -12.5, "floor_panel"), (-36.0, -26.5, "floor_panel_dark"), (YA, -36.0, "tread_plate")):
        holes = [stair_hole] if y0 == -26.5 else []
        floor_rect_holes(F, -SX, y0, SX, y1, Z1, mat, holes)
    sq = (GX - GR - 0.45, GY - GR - 0.45, GX + GR + 0.45, GY + GR + 0.45)
    for (y0, y1) in ((12.0, YF), (0.0, 12.0), (-12.5, 0.0), (-26.5, -12.5), (YA, -36.0)):
        F.ceil(-SX, y0, SX, y1, zc, "padding_light")
    ceil_rect_holes(F, -SX, -36.0, SX, -26.5, zc, "padding_light", [sq])
    plate = rect(sq[0], sq[1], sq[2], sq[3])
    F.S.prism(plate, 0.1, plane="XY", M=T((0, 0, zc)), mat="padding_light", bevel=0, holes=[circle(GX, GY, GR, 32)[::-1]], exact_holes=True)
    # ---- outer walls of the side rooms
    wall_x(F, YA, YF, -SX, Z1, zc, mat="padding_light", into=1)
    wall_x(F, YA, YF, SX, Z1, zc, mat="padding_light", into=-1)
    # ---- the corridor's walls with the room doors
    dp = [(16.5, "Medical bay"), (10.0, "Cabin 1"), (6.0, "Cabin 2"), (2.0, "Cabin 3"), (-6.3, "Cryogenic hibernation"), (-19.5, "Science lab A")]
    ds = [(16.5, "Life support · hydroponics"), (8.0, "Mess · galley"), (2.0, "Hygiene"), (-6.3, "Storage · cargo")]
    wall_x(F, -26.5, YF, -CX, Z1, zc, [(y - 0.55, y + 0.55, Z1, Z1 + 2.15) for (y, _) in dp], mat="tile_white", into=-1)
    for (y, lab) in dp:
        slide_x(F, -CX, y, label=lab)
    wall_x(F, -12.5, YF, CX, Z1, zc, [(y - 0.55, y + 0.55, Z1, Z1 + 2.15) for (y, _) in ds], mat="tile_white", into=1)
    for (y, lab) in ds:
        slide_x(F, CX, y, label=lab)
    # pod-bay access: a wide archway; ring access B from the airlock hall
    wall_x(F, -26.5, -12.5, CX, Z1, zc, [(-21.0, -18.6, Z1, Z1 + 2.3)], mat="tile_white", into=1)
    wall_x(F, -36.0, -26.5, -CX, Z1, zc, [(-30.0, -28.9, Z1, Z1 + 2.15)], mat="tile_white", into=-1)
    slide_x(F, -CX, -29.45, label="Field-ring access B")
    # ---- cross bulkheads with the corridor's pressure doors
    for (y, lab) in ((12.0, "Pressure door · frame 12"), (-12.5, "Pressure door · frame 30"), (-26.5, "Pressure door · frame 44"), (-36.0, "Engineering")):
        wall_y(F, -SX, SX, y, Z1, zc, [(-0.7, 0.7, Z1, Z1 + 2.2)], mat="padding_gray", into=1)
        slide_y(F, y, 0.0, w=1.4, h=2.2, label=lab, auto=2.8)
        for s in (-1, 1):
            F.D.box((0.3, 0.42, H1), at=(s * 1.0, y, Z1 + H1 / 2), mat="hull_gray", bevel=0.03)
    wall_y(F, -SX, SX, YF, Z1, zc, [(-1.3, 1.3, Z1, zc)], mat="padding_gray", into=-1)
    wall_y(F, -SX, SX, YA, Z1, zc, [(-0.7, 0.7, Z1, Z1 + 2.2)], mat="padding_gray", into=1)
    F.door("reactor", T((0.7, YA + 0.12, 0)) @ RZ(180), 0.0, Z1, w=1.4, h=2.2, t=0.24, label="Reactor observation gallery", locked=True)
    # ---- partitions between side rooms
    for y in (8.0, 4.0, 0.0):
        wall_y(F, -SX, -CX, y, Z1, zc, mat="padding_light", into=1)
    for y in (4.0, 0.0):
        wall_y(F, CX, SX, y, Z1, zc, mat="padding_light", into=1)
    wall_y(F, -SX, -CX, -26.5, Z1, zc, mat="padding_light", into=1)
    # ---- corridor dressing: floor light strips, handrails, ceiling lights, frame numbers
    for (y0, y1) in ((12.4, YF), (-12.1, 11.6), (-26.1, -12.9)):
        for s in (-1, 1):
            F.E.box((0.05, y1 - y0 - 0.4, 0.02), at=(s * (CX - 0.08), (y0 + y1) / 2, Z1 + 0.06), mat="emit_cool")
            handrail_wall(F, [(s * (CX - 0.06), y0 + 0.4), (s * (CX - 0.06), y1 - 0.4)], Z1 + 0.95)
        strips(F, -0.3, 0.3, y0, y1, zc, "spine", step=4.0)
    for (y, txt) in ((19.0, "FRAME 04 · MEDICAL · LIFE SUPPORT"), (6.0, "FRAME 16 · HABITATION"), (-6.0, "FRAME 28 · HIBERNATION · STORES"),
                     (-19.0, "FRAME 40 · LAB A · POD BAY")):
        F.sign(T((CX - 0.13, y + 1.7, Z1 + 2.35)) @ RZ(-90), txt, w=1.9, h=0.18)
    F.sign(T((3.2, -26.5 - 0.14, Z1 + 2.35)) @ RZ(180), "FRAME 52 · DORSAL AIRLOCK", w=1.9, h=0.18)
    F.sign(T((0.0, -36.0 + 0.14, Z1 + 2.48)) @ RZ(180), "FRAME 60 · ENGINEERING", w=1.9, h=0.18)
    F.tray((-0.6, YA + 0.5, zc - 0.15), (-0.6, YF - 0.5, zc - 0.15), w=0.3, cables=4)
    F.pipe([(0.62, YA + 0.5, zc - 0.12), (0.62, YF - 0.5, zc - 0.12)], r=0.05, mat="paint_blue")


def medical(F):
    D, E, G = F.section("medical")
    x0, x1, y0, y1 = -SX, -CX, 12.0, YF
    strips(F, x0, x1, y0, y1, Z1 + H1, "medical", step=3.0, power=12)
    # examination table with a padded top under a diagnostic scanner arch
    M = T((-3.4, 17.6, Z1))
    D.box((0.8, 2.0, 0.08), M=M @ T((0, 0, 0.82)), mat="padding_light", bevel=0.03)
    D.box((0.7, 1.8, 0.7), M=M @ T((0, 0, 0.39)), mat="paint_white", bevel=0.02)
    F.C.box((0.8, 2.0, 0.86), M=M @ T((0, 0, 0.43)), mat="concrete")
    D.lathe([(0.95, -0.12), (1.12, -0.12), (1.12, 0.12), (0.95, 0.12)], M=M @ T((0, 0.2, 0.82)) @ RX(90), mat="plastic_white", segs=32, sweep=180, closed=True)
    E.lathe([(0.94, -0.05), (0.95, -0.05), (0.95, 0.05), (0.94, 0.05)], M=M @ T((0, 0.2, 0.82)) @ RX(90), mat="emit_cool", segs=32, sweep=180, closed=True)
    F.screen("med_vitals", T((-SX + 0.14, 17.6, Z1 + 1.6)) @ RZ(90), w=0.9, h=0.55)
    F.locker(T((-4.6, 20.95, Z1)) @ RZ(180), n=3)
    F.shelving(T((-2.6, 21.0, Z1)) @ RZ(180), w=1.6, d=0.45, h=2.2, levels=5)
    # biological isolation booth: a glass box with a sealed door
    bx0, bx1, by0, by1 = -SX + 0.2, -3.3, 12.3, 14.6
    for (a, b, c, d) in ((bx0, bx1, by1, by1), (bx1, bx1, by0, by1)):
        G.box((max(0.03, b - a), max(0.03, d - c), 2.2), at=((a + b) / 2, (c + d) / 2, Z1 + 1.1), mat="glass")
        F.C.box((max(0.05, b - a), max(0.05, d - c), 2.2), at=((a + b) / 2, (c + d) / 2, Z1 + 1.1), mat="concrete")
    D.box((bx1 - bx0, by1 - by0, 0.12), at=((bx0 + bx1) / 2, (by0 + by1) / 2, Z1 + 2.26), mat="paint_white")
    F.sign(T((bx1 + 0.03, 13.4, Z1 + 1.9)) @ RZ(-90), "BIO-ISOLATION", w=0.9, h=0.16, bg="paint_red", fg="paint_white")
    # oxygen outlets on the wall
    for y in (16.4, 18.8):
        D.box((0.06, 0.24, 0.16), at=(-SX + 0.17, y, Z1 + 1.25), mat="paint_green", bevel=0.01)
    marker("terminal", "medical", at=(-SX + 0.4, 17.6, Z1 + 1.4), label="Medical terminal")
    marker("post", "medic", at=(-2.4, 16.2, Z1), face=[-1, 0, 0])


def life_support(F):
    D, E, G = F.section("lifesupport")
    strips(F, CX, SX, 12.0, YF, Z1 + H1, "lifesupport", step=3.0)
    F.tank(T((4.4, 20.2, Z1)), r=0.55, h=1.8, band="paint_blue", legs=False)
    F.tank(T((4.4, 18.6, Z1)), r=0.55, h=1.8, band="paint_green", legs=False)
    F.rack(T((4.9, 16.4, Z1)) @ RZ(-90), h=2.1)
    F.rack(T((4.9, 15.6, Z1)) @ RZ(-90), h=2.1)
    F.pipe([(5.2, 20.2, Z1 + 2.2), (5.2, 13.0, Z1 + 2.2), (2.0, 13.0, Z1 + 2.2)], r=0.07, mat="paint_blue")
    F.pipe([(5.0, 20.2, Z1 + 2.45), (5.0, 13.0, Z1 + 2.45)], r=0.06, mat="paint_green")
    # hydroponic trays under grow lights
    for y in (13.4, 14.9):
        M = T((2.9, y, Z1))
        D.box((2.6, 0.9, 0.08), M=M @ T((0, 0, 0.9)), mat="plastic_white", bevel=0.01)
        for sx in (-1.2, 1.2):
            D.box((0.06, 0.8, 0.9), M=M @ T((sx, 0, 0.45)), mat="metal_steel")
        for k in range(7):
            D.sphere(0.15, at=(2.9 - 1.0 + k * 0.33, y + (0.12 if k % 2 else -0.12), Z1 + 1.06), mat="plastic_green", segs=8, rings=5, scale=(1, 1, 0.8))
        E.box((2.4, 0.18, 0.04), M=M @ T((0, 0, 1.85)), mat="emit_grow")
        D.box((2.5, 0.24, 0.06), M=M @ T((0, 0, 1.89)), mat="paint_gray")
        F.C.box((2.6, 0.9, 0.95), M=M @ T((0, 0, 0.47)), mat="concrete")
    F.screen("ls_status", T((CX + 0.14, 19.2, Z1 + 1.6)) @ RZ(-90), w=0.9, h=0.5)
    marker("terminal", "lifesupport", at=(CX + 0.4, 19.2, Z1 + 1.4), label="Life support · O₂, CO₂, water")


def habitation(F):
    D, E, G = F.section("hab")
    # three cabins: bunk, locker, desk with a personal screen and a few things from home
    for k, (y0, y1) in enumerate(((8.0, 12.0), (4.0, 8.0), (0.0, 4.0))):
        yc = (y0 + y1) / 2
        F.strip(-3.4, yc, Z1 + H1, yaw=90, L=1.0, power=8, room=f"cabin{k}")
        M = T((-4.55, yc + 0.2, Z1))
        D.box((1.85, 0.9, 0.45), M=M @ T((0, 0, 0.22)) @ RZ(90), mat="paint_gray", bevel=0.02)
        D.box((1.8, 0.85, 0.16), M=M @ T((0, 0, 0.53)) @ RZ(90), mat="fabric_blue", bevel=0.05)
        D.box((0.5, 0.35, 0.12), M=M @ T((0, 0.65, 0.66)) @ RZ(90), mat="cloth_white", bevel=0.05)
        D.box((1.6, 0.86, 0.04), M=M @ T((0, -0.1, 0.62)) @ RZ(90) @ RY(2), mat="fabric", bevel=0.02)
        F.C.box((0.9, 1.85, 0.6), M=M @ T((0, 0, 0.3)), mat="concrete")
        F.locker(T((-2.0, y1 - 0.4, Z1)) @ RZ(180), n=1)
        F.table(T((-2.3, y0 + 0.55, Z1)), w=1.0, d=0.6, h=0.74)
        F.screen(f"cabin{k}", T((-2.3, y0 + 0.16, Z1 + 1.3)) @ RZ(180), w=0.5, h=0.32)
        D.box((0.12, 0.02, 0.16), M=T((-2.55, y0 + 0.5, Z1 + 0.83)) @ RX(-15), mat=["paint_red", "paint_blue", "paint_yellow"][k], bevel=0.005)
        D.box((0.1, 0.012, 0.12), M=T((-2.55, y0 + 0.488, Z1 + 0.84)) @ RX(-15), mat="screen")
        marker("bed", f"cabin{k}", at=(-4.55, yc + 0.2, Z1 + 0.7), label=f"Cabin {k + 1} · bunk")
    # mess and galley
    F.strip(3.4, 6.0, Z1 + H1, yaw=90, L=1.2, power=11, room="mess")
    F.strip(3.4, 10.0, Z1 + H1, yaw=90, L=1.2, power=11, room="mess")
    F.table(T((3.2, 8.0, Z1)) @ RZ(90), w=2.6, d=1.0)
    for s in (-1, 1):
        F.D.box((0.4, 2.6, 0.45), at=(3.2 + s * 0.85, 8.0, Z1 + 0.22), mat="padding_blue", bevel=0.04)
        F.C.box((0.4, 2.6, 0.45), at=(3.2 + s * 0.85, 8.0, Z1 + 0.22), mat="concrete")
    for k in range(6):
        D.cyl(0.04, 0.1, at=(3.0 + (k % 2) * 0.4, 7.1 + (k // 2) * 0.8, Z1 + 0.8), mat=["plastic_red", "plastic_white", "plastic_blue"][k % 3], segs=10)
    # galley along the outer wall: counter, cabinets, oven, water dispenser
    D.box((0.7, 3.6, 0.9), at=(5.1, 8.6, Z1 + 0.45), mat="paint_white", bevel=0.02)
    D.box((0.74, 3.64, 0.04), at=(5.1, 8.6, Z1 + 0.92), mat="metal_steel", bevel=0.005)
    D.box((0.4, 3.6, 0.7), at=(5.28, 8.6, Z1 + 1.85), mat="paint_white", bevel=0.02)
    D.box((0.04, 0.55, 0.4), at=(4.74, 7.4, Z1 + 0.55), mat="glass_dark")
    D.box((0.3, 0.35, 0.5), at=(5.2, 10.1, Z1 + 1.2), mat="plastic_white", bevel=0.03)
    E.box((0.02, 0.12, 0.04), at=(5.04, 10.1, Z1 + 1.32), mat="emit_blue")
    F.C.box((0.7, 3.6, 0.95), at=(5.1, 8.6, Z1 + 0.47), mat="concrete")
    F.screen("mess_wall", T((CX + 0.14, 8.0, Z1 + 1.65)) @ RZ(-90), w=1.2, h=0.7)
    marker("terminal", "mess", at=(5.0, 10.1, Z1 + 1.2), label="Water dispenser")
    marker("post", "cook", at=(4.2, 9.4, Z1), face=[1, 0, 0])
    # hygiene: two stalls, washbasins
    F.strip(3.4, 2.0, Z1 + H1, yaw=90, L=1.0, power=9, room="hygiene")
    for y in (0.9, 2.6):
        D.box((1.2, 0.05, 2.1), at=(4.9, y + 0.65, Z1 + 1.05), mat="plastic_white")
        D.box((0.05, 1.25, 2.1), at=(4.3, y, Z1 + 1.05), mat="plastic_white")
        F.C.box((0.05, 1.25, 2.1), at=(4.3, y, Z1 + 1.05), mat="concrete")
    D.box((0.5, 1.4, 0.15), at=(2.0, 3.2, Z1 + 0.85), mat="plastic_white", bevel=0.03)
    D.box((0.03, 1.2, 0.6), at=(1.4, 3.2, Z1 + 1.5), mat="metal_chrome")


def hibernation(F):
    """The cryogenic hibernation chamber: four Halcyon capsules across the room (heads to the hull), the walkway
    along the corridor side, biomonitor wall, thermal lines."""
    D, E, G = F.section("cryo")
    y0, y1 = -12.5, 0.0
    for k, y in enumerate((-1.9, -4.8, -7.8, -10.7)):
        # capsule frame: +Y toward the head (+X here: heads to the walkway), the commander stands on its +X side (-Y)
        marker("cryo", str(k), at=(-3.55, y, Z1), rot=(0, 0, -90), side="r")
        D.box((0.14, 0.8, 1.2), at=(-SX + 0.12, y, Z1 + 1.3), mat="plastic_dark", bevel=0.02)
        F.screen(f"cryo{k}", T((-SX + 0.2, y, Z1 + 1.6)) @ RZ(90), w=0.55, h=0.36)
        F.pipe([(-SX + 0.25, y - 0.35, Z1 + 0.3), (-4.75, y - 0.35, Z1 + 0.3)], r=0.035, mat="paint_blue", flanges=False)
        F.pipe([(-SX + 0.25, y + 0.35, Z1 + 0.3), (-4.75, y + 0.35, Z1 + 0.3)], r=0.035, mat="paint_red", flanges=False)
    F.pipe([(-SX + 0.25, y0 + 0.3, Z1 + 0.3), (-SX + 0.25, y1 - 0.3, Z1 + 0.3)], r=0.06, mat="paint_gray")
    for y in (-2.0, -6.2, -10.4):
        F.strip(-3.3, y, Z1 + H1, yaw=0, L=1.4, power=9, room="cryo", color=(0.82, 0.9, 1.0))
    E.box((0.04, 11.8, 0.03), at=(-1.4, -6.25, Z1 + 0.05), mat="emit_cool")
    F.sign(T((-CX - 0.14, -6.3, Z1 + 2.4)) @ RZ(90), "CRYOGENIC HIBERNATION · 4 BERTHS", w=1.8, h=0.18)
    marker("terminal", "cryo", at=(-CX - 0.5, -3.3, Z1 + 1.3), label="Hibernation control")
    F.screen("cryo_main", T((-CX - 0.14, -3.3, Z1 + 1.55)) @ RZ(90), w=0.9, h=0.55)


def storage(F):
    D, E, G = F.section("storage")
    strips(F, CX, SX, -12.5, 0.0, Z1 + H1, "storage", step=4.0, power=9)
    for y in (-1.2, -3.6):
        F.shelving(T((4.9, y, Z1)) @ RZ(-90), w=2.2, d=0.6, h=2.5, levels=5)
    # spacesuits in their stand, pressure lockers, crates, battery packs
    for k in range(3):
        y = -6.0 - k * 1.0
        M = T((5.0, y, Z1))
        D.box((0.5, 0.35, 0.8), M=M @ T((0, 0, 1.05)), mat="suit_white", bevel=0.12)
        D.sphere(0.2, M=M @ T((0, 0, 1.68)), mat="suit_white", segs=16, rings=10)
        D.box((0.34, 0.06, 0.18), M=M @ T((-0.17, 0, 1.68)) @ RZ(90), mat="visor_gold", bevel=0.04)
        for s in (-1, 1):
            D.box((0.18, 0.18, 0.75), M=M @ T((0, s * 0.11, 0.38)), mat="suit_white", bevel=0.06)
            D.box((0.14, 0.14, 0.62), M=M @ T((0, s * 0.33, 1.05)), mat="suit_white", bevel=0.05)
        D.box((0.4, 0.3, 0.5), M=M @ T((0.22, 0, 1.15)), mat="suit_gray", bevel=0.05)
        F.C.box((0.6, 0.8, 1.9), M=M @ T((0, 0, 0.95)), mat="concrete")
    F.locker(T((4.9, -10.6, Z1)) @ RZ(-90), n=3, mat="paint_yellow")
    for (x, y) in ((2.3, -2.2), (2.3, -3.2), (2.6, -11.6)):
        F.crate(T((x, y, Z1)) @ RZ(90), w=0.9, d=0.6, h=0.55)
    F.sign(T((CX + 0.14, -9.0, Z1 + 2.35)) @ RZ(-90), "STORES · SUITS · POD SPARES", w=1.6, h=0.18)


def lab_a(F):
    D, E, G = F.section("laba")
    strips(F, -SX, -CX, -26.5, -12.5, Z1 + H1, "laba", step=3.5, power=12)
    for y in (-14.2, -17.4):
        F.bench(T((-4.7, y, Z1)) @ RZ(90), w=2.4, d=0.8)
    # microscope, spectrometer, sealed specimen cabinets with glass fronts, a glovebox
    M = T((-4.8, -21.0, Z1))
    D.box((0.6, 1.6, 0.9), M=M @ T((0, 0, 0.45)), mat="paint_white", bevel=0.02)
    G.box((0.55, 1.5, 0.6), M=M @ T((0, 0, 1.2)), mat="glass")
    for s in (-0.4, 0.4):
        D.cyl(0.1, 0.08, M=M @ T((0.3, s, 1.15)) @ RY(90), mat="rubber", segs=12)
    F.C.box((0.6, 1.6, 1.5), M=M @ T((0, 0, 0.75)), mat="concrete")
    for k in range(3):
        y = -23.4 - k * 0.9
        D.box((0.55, 0.85, 1.9), at=(-SX + 0.35, y, Z1 + 0.95), mat="paint_gray", bevel=0.02)
        G.box((0.02, 0.7, 1.6), at=(-SX + 0.64, y, Z1 + 1.0), mat="glass")
        for z in (0.5, 0.95, 1.4):
            D.box((0.4, 0.7, 0.02), at=(-SX + 0.35, y, Z1 + z), mat="metal_steel")
            D.cyl(0.05, 0.14, at=(-SX + 0.35, y + 0.15, Z1 + z + 0.08), mat="glass_vehicle", segs=10)
        F.C.box((0.6, 0.85, 1.9), at=(-SX + 0.35, y, Z1 + 0.95), mat="concrete")
    F.rack(T((-2.0, -25.9, Z1)) @ RZ(180), h=1.9)
    F.screen("laba_spec", T((-CX - 0.14, -15.2, Z1 + 1.55)) @ RZ(90), w=1.0, h=0.55)
    F.sign(T((-CX - 0.14, -22.0, Z1 + 2.35)) @ RZ(90), "SCIENCE LAB A · GEOLOGY · SPECTROSCOPY · SAMPLES", w=2.6, h=0.18)
    marker("terminal", "laba", at=(-CX - 0.5, -15.2, Z1 + 1.3), label="Lab A · sample registry")
    marker("post", "scientist", at=(-3.8, -17.4, Z1), face=[-1, 0, 0])


def pod_access(F):
    D, E, G = F.section("podaccess")
    strips(F, CX, SX, -26.5, -12.5, Z1 + H1, "podaccess", step=3.5)
    # the stair down to the bay walkway (descending toward -y), a safety gate at its head
    F.stairs((3.7, -18.7, ZW), (0, 1), 1.5, Z1 - ZW, 18, run=0.316, rails="both")
    F.rail([(2.8, -12.9, Z1), (2.8, -18.6, Z1)], h=1.05)
    F.rail([(4.6, -12.9, Z1), (4.6, -18.6, Z1)], h=1.05)
    D.box((1.6, 0.05, 1.0), at=(3.7, -12.85, Z1 + 0.6), mat="paint_yellow", bevel=0.01)
    # pod launch control: preflight displays for the four pods
    F.console(T((2.6, -23.9, Z1)) @ RZ(180), w=2.2, sid="podctl", screens=4, chair=False)
    marker("terminal", "pods", at=(2.6, -24.3, Z1 + 1.1), label="Pod launch control · preflight")
    marker("post", "podtech", at=(2.6, -23.0, Z1), face=[0, -1, 0])
    F.sign(T((SX - 0.14, -16.0, Z1 + 2.3)) @ RZ(-90), "POD LAUNCH AND RECOVERY BAY · DECK 2", w=2.4, h=0.2, bg="paint_yellow")


def airlock_hall(F):
    """The dorsal airlock: the weightless shaft from the hatch under the gangway to the hall's ceiling, its inner
    hatch, the marked well on the floor beneath it, railing, status panels and suit lockers."""
    D, E, G = F.section("airlock")
    zc = Z1 + H1
    strips(F, 2.2, 5.0, -35.6, -27.0, zc, "airlock", along="y", step=3.0)
    inner_tube(F.S, GX, GY, GR, zc, HATCH_Z, "padding_light", rows=8)
    for i in range(12):
        a = 2 * math.pi * i / 12
        F.C.box((0.3, 0.68, HATCH_Z - zc), at=(GX + (GR + 0.15) * math.cos(a), GY + (GR + 0.15) * math.sin(a), (zc + HATCH_Z) / 2),
                rot=(0, 0, math.degrees(a)), mat="concrete")
    for k in range(int((HATCH_Z - zc) / 0.35)):
        D.box((0.5, 0.04, 0.04), at=(GX, GY - GR + 0.12, zc + 0.3 + k * 0.35), mat="metal_chrome", bevel=0.008)
    for z in (zc + 1.6, zc + 4.4):
        E.tube(GR - 0.01, GR - 0.05, 0.1, at=(GX, GY, z), mat="emit_cool", segs=32)
        light(F.uid("hal_l"), at=(GX, GY, z), color=(0.85, 0.92, 1.0), power=7, dist=5, bake=20, group="hal", room="airlock")
    # inner pressure hatch at the ceiling: slides aside toward +x into the ceiling void
    Hi = Part("hal_hatch_inner")
    Hi.cyl(GR + 0.12, 0.08, mat="hull_gray", segs=32, bevel=0.01)
    Hi.cyl(0.16, 0.06, at=(0, 0, -0.06), mat="metal_dark", segs=16)
    for k in range(6):
        Hi.box((0.05, 0.05, 0.42), M=T((0, 0, -0.07)) @ RZ(k * 60) @ RY(90), mat="gear_metal", bevel=0.006)
    hi = Hi.finish(sharp=40)
    hi.location = (GX, GY, zc + 0.12)
    props(hi, part="hatch_inner", axis=[1, 0, 0], travel=2.6, col=0)
    F.dyn.append(hi)
    # the well on the floor: yellow and black ring, railing open toward the hall
    E.tube(GR + 0.05, GR - 0.05, 0.02, at=(GX, GY, Z1 + 0.01), mat="emit_amber", segs=40)
    D.tube(GR + 0.3, GR + 0.05, 0.015, at=(GX, GY, Z1 + 0.008), mat="paint_yellow", segs=40)
    r = GR + 0.35
    F.rail([(GX + r * math.cos(math.radians(a)), GY + r * math.sin(math.radians(a)), Z1) for a in range(45, 316, 18)], h=1.0)
    F.sign(T((GX - 1.2, -35.86, Z1 + 2.3)) @ RZ(180), "DORSAL AIRLOCK · ZERO-G WELL · HOLD THE RAIL", w=2.4, h=0.2, bg="paint_yellow")
    F.screen("lock_status", T((SX - 0.14, -32.0, Z1 + 1.6)) @ RZ(-90), w=0.8, h=0.5)
    marker("terminal", "dorsal", at=(SX - 0.4, -32.0, Z1 + 1.35), label="Dorsal airlock · pressure, hatches")
    F.locker(T((4.4, -35.6, Z1)), n=3)
    marker("zerog", "well", at=(GX, GY, (Z1 + HATCH_Z) / 2), r=GR, sz=HATCH_Z - Z1)


def ring_access(F):
    D, E, G = F.section("ringaccess")
    strips(F, -SX, -CX, -36.0, -26.5, Z1 + H1, "ringaccess", step=3.0, power=9, )
    for y in (-34.5, -32.6):
        F.screen(f"ring_{'b' if y < -33 else 'a'}", T((-SX + 0.14, y, Z1 + 1.55)) @ RZ(90), w=1.0, h=0.6)
    marker("terminal", "rings", at=(-SX + 0.45, -33.5, Z1 + 1.3), label="Field rings · status")
    # the magnetic service lift into the aft ring's dorsal strut (restricted), cable bundles and coolant loops
    D.box((1.8, 0.3, 2.5), at=(-3.4, -35.75, Z1 + 1.25), mat="paint_gray_dark", bevel=0.03)
    D.box((1.3, 0.06, 2.2), at=(-3.4, -35.58, Z1 + 1.1), mat="paint_yellow", bevel=0.01)
    F.sign(T((-3.4, -35.5, Z1 + 2.45)) @ RZ(180), "RING B STRUT LIFT · RESTRICTED", w=1.6, h=0.18, bg="paint_red", fg="paint_white")
    marker("terminal", "ringlift", at=(-3.4, -35.3, Z1 + 1.2), label="Ring B strut lift (restricted)")
    for k, mat in enumerate(("paint_orange", "paint_blue", "paint_red")):
        F.pipe([(-SX + 0.3, -26.8, Z1 + 2.2 - k * 0.2), (-SX + 0.3, -35.6, Z1 + 2.2 - k * 0.2)], r=0.06, mat=mat)


def engineering(F):
    D, E, G = F.section("eng")
    strips(F, -4.0, 4.0, YA, -36.0, Z1 + H1, "eng", along="x", step=2.6, power=12)
    # consoles facing aft in a U, the master display on the aft bulkhead, the emergency shutdown pedestal
    F.console(T((0.0, -42.0, Z1)) @ RZ(180), w=2.6, sid="eng_c", screens=3, chair=False)
    F.console(T((-3.4, -41.0, Z1)) @ RZ(225), w=1.8, sid="eng_l", screens=2, chair=True)
    F.console(T((3.4, -41.0, Z1)) @ RZ(135), w=1.8, sid="eng_r", screens=2, chair=True)
    F.screen("eng_master", T((-2.4, YA + 0.14, Z1 + 1.75)) @ RZ(180), w=2.0, h=1.0)
    F.screen("eng_master2", T((2.4, YA + 0.14, Z1 + 1.75)) @ RZ(180), w=2.0, h=1.0)
    M = T((0.0, -38.6, Z1))
    D.cyl(0.25, 1.0, M=M @ T((0, 0, 0.5)), mat="paint_yellow", segs=16)
    D.cyl(0.14, 0.12, M=M @ T((0, 0, 1.06)), mat="paint_red", segs=16, bevel=0.03)
    D.box((0.5, 0.5, 0.02), M=M @ T((0, 0, 1.0)), mat="paint_black")
    F.C.cyl(0.3, 1.1, M=M @ T((0, 0, 0.55)), mat="concrete", segs=8)
    marker("terminal", "estop", at=(0.0, -38.6, Z1 + 1.1), label="EMERGENCY FIELD SHUTDOWN (guarded)")
    marker("terminal", "engineering", at=(0.0, -42.4, Z1 + 1.1), label="Engineering · power, pumps, field core")
    marker("post", "engineer", at=(0.0, -41.25, Z1), face=[0, -1, 0])
    # pump arrays and acoustic baffles along the sides
    for s in (-1, 1):
        for k in range(3):
            F.tank(T((s * 4.7, -37.4 - k * 1.5, Z1)), r=0.4, h=1.6, band="paint_orange", legs=False)
        for k in range(5):
            D.box((0.08, 1.6, 1.0), at=(s * (SX - 0.06), -37.0 - k * 1.8, Z1 + 1.9), mat="padding_dark", bevel=0.04)
        F.pipe([(s * 4.7, -36.6, Z1 + 2.5), (s * 4.7, YA + 0.6, Z1 + 2.5)], r=0.08, mat="paint_orange")
    F.sign(T((0.0, YA + 0.14, Z1 + 2.5)) @ RZ(180), "REACTOR OBSERVATION GALLERY", w=2.0, h=0.2, bg="paint_yellow")


def neck(F):
    D, E, G = F.section("neck")
    zc = Z1 + H1
    F.floor(-1.3, YF, 1.3, 38.5, Z1, "floor_panel")
    F.ceil(-1.3, YF, 1.3, 38.5, zc, "padding_light")
    wall_x(F, YF, 38.5, -1.3, Z1, zc, mat="tile_white", into=1)
    wall_x(F, YF, 38.5, 1.3, Z1, zc, mat="tile_white", into=-1)
    slide_y(F, YF, 0.0, w=1.4, h=2.2, label="Pressure door · frame 0", auto=2.8)
    for s in (-1, 1):
        F.E.box((0.05, 16.0, 0.02), at=(s * 1.22, 30.0, Z1 + 0.06), mat="emit_cool")
        handrail_wall(F, [(s * 1.24, YF + 0.5), (s * 1.24, 38.0)], Z1 + 0.95)
    strips(F, -0.3, 0.3, YF, 38.5, zc, "neck", step=4.0)
    F.sign(T((1.17, 30.0, Z1 + 2.35)) @ RZ(-90), "BRIDGE · ASTROMETRY · WARP OPS · LAB B", w=2.0, h=0.18)


# ===================================================================================================== saucer
def saucer_deck(F):
    D, E, G = F.section("hall")
    zc = Z1 + H1
    hx0, hx1, hy0, hy1 = -6.0, 6.0, 38.5, 56.0
    # the two-flight stair to the bridge's command dais (port side of the hall)
    fl1 = (-5.0, 48.6)   # flight 1: from y 48.6 down-ship (toward -y), z 0 -> 3.72
    fl2 = (-3.7, 43.3)   # flight 2: from y 43.3 up-ship, z 3.72 -> 7.45 (its top inside the canopy)
    rise = (ZU - Z1) / 2
    stair_hole = (-5.7, 41.6, -3.0, 48.75)
    floor_rect_holes(F, hx0, hy0, hx1, hy1, Z1, "floor_panel_dark", [])
    ceil_rect_holes(F, hx0, hy0, hx1, hy1, zc, "padding_light", [stair_hole])
    F.stairs((fl1[0], fl1[1], Z1), (0, -1), 1.25, rise, 19, run=0.279, rails="right")
    F.stairs((fl2[0], fl2[1], Z1 + rise), (0, 1), 1.25, rise, 19, run=0.279, rails="left")
    F.floor(-5.65, 41.75, -3.05, 43.32, Z1 + rise, "tread_plate")
    F.rail([(-5.62, 41.8, Z1 + rise), (-3.08, 41.8, Z1 + rise)], h=1.0)
    # the stairwell above the hall's ceiling, up to the dais
    for (a, b) in (((-5.75, 41.5), (-5.75, 48.8)), ((-2.95, 41.5), (-2.95, 45.4)), ((-5.75, 41.5), (-2.95, 41.5))):
        F.wall(a, b, zc, ZU - 0.02, (), "padding_light", t=0.14)
    F.wall((-5.75, 48.8), (-4.35, 48.8), zc, ZU - 0.02, (), "padding_light", t=0.14)
    F.strip(-4.4, 42.5, Z1 + rise + 2.2, yaw=0, L=1.0, power=8, room="hall")
    # the hall's walls: doors to warp ops, lab B, astrometry; the neck passage
    wall_y(F, hx0, hx1, hy0, Z1, zc, [(-1.3, 1.3, Z1, zc)], mat="tile_white", into=1)
    wall_x(F, hy0, hy1, hx0, Z1, zc, [(51.0, 52.1, Z1, Z1 + 2.15)], mat="tile_white", into=1)
    slide_x(F, hx0, 51.55, label="Warp-field operations")
    wall_x(F, hy0, hy1, hx1, Z1, zc, [(51.0, 52.1, Z1, Z1 + 2.15)], mat="tile_white", into=-1)
    slide_x(F, hx1, 51.55, label="Science lab B")
    wall_y(F, hx0, hx1, hy1, Z1, zc, [(-0.7, 0.7, Z1, Z1 + 2.2)], mat="tile_white", into=-1)
    slide_y(F, hy1, 0.0, w=1.4, h=2.2, label="Astrometry centre", auto=2.8)
    for (x, y) in ((1.5, 42.0), (1.5, 47.0), (1.5, 52.0), (-1.2, 52.0)):
        F.strip(x, y, zc, yaw=90, L=1.2, power=11, room="hall")
    F.sign(T((-2.85, 46.5, Z1 + 2.4)) @ RZ(90), "BRIDGE", w=0.9, h=0.22, bg="paint_yellow")
    F.sign(T((0.0, hy1 - 0.14, Z1 + 2.5)), "ASTROMETRY CENTRE", w=1.6, h=0.2)
    F.D.box((2.0, 0.8, 0.45), at=(3.6, 52.0, Z1 + 0.22), mat="padding_blue", bevel=0.04)
    F.C.box((2.0, 0.8, 0.45), at=(3.6, 52.0, Z1 + 0.22), mat="concrete")
    F.screen("hall_map", T((hx1 - 0.14, 44.0, Z1 + 1.55)) @ RZ(-90), w=1.4, h=0.8)


def warp_ops(F):
    D, E, G = F.section("warpops")
    zc = Z1 + H1
    x0, x1, y0, y1 = -16.0, -6.0, 42.0, 56.0
    F.floor(x0, y0, x1, y1, Z1, "floor_panel_dark")
    F.ceil(x0, y0, x1, y1, zc, "padding_light")
    wall_x(F, y0, y1, x0, Z1, zc, mat="tile_white", into=1)
    wall_y(F, x0, x1, y0, Z1, zc, mat="tile_white", into=1)
    wall_y(F, x0, x1, y1, Z1, zc, mat="tile_white", into=-1)
    strips(F, x0, x1, y0, y1, zc, "warpops", along="x", step=3.3, power=10)
    strips(F, x0, x1, 47.0, 51.0, zc, "warpops", along="x", step=3.3, power=10)
    # forward and aft ring monitoring stations, the field-symmetry wall, the central ring model
    F.console(T((-11.0, 55.0, Z1)), w=3.0, sid="ring_fwd", screens=3, chair=False)
    F.console(T((-11.0, 43.0, Z1)) @ RZ(180), w=3.0, sid="ring_aft", screens=3, chair=True)
    F.screen("warp_wall", T((x0 + 0.14, 49.0, Z1 + 1.6)) @ RZ(90), w=3.2, h=1.4)
    M = T((-11.0, 49.0, Z1))
    D.cyl(0.9, 0.9, M=M @ T((0, 0, 0.45)), mat="paint_gray_dark", segs=32, bevel=0.03)
    D.cyl(1.0, 0.05, M=M @ T((0, 0, 0.92)), mat="plastic_dark", segs=32)
    for (yy, rr) in ((0.35, 0.55), (-0.35, 0.55)):
        E.tube(rr, rr - 0.07, 0.12, M=M @ T((0, yy, 1.45)) @ RX(90), mat="warp_glow", segs=40)
        D.tube(rr + 0.02, rr - 0.09, 0.08, M=M @ T((0, yy, 1.45)) @ RX(90), mat="hull_white", segs=40)
    D.cyl(0.07, 1.1, M=M @ T((0, 0, 1.45)) @ RX(90), mat="hull_white", segs=12)
    G.sphere(0.95, M=M @ T((0, 0, 1.45)), mat="glass", segs=24, rings=12, scale=(1, 1.15, 0.8))
    F.C.cyl(1.0, 1.0, M=M @ T((0, 0, 0.5)), mat="concrete", segs=12)
    marker("terminal", "warpops", at=(-11.0, 54.3, Z1 + 1.1), label="Field operations · ring A / ring B · symmetry")
    marker("terminal", "warpops_b", at=(-11.0, 43.7, Z1 + 1.1), label="Field operations · envelope · stabilisers")
    marker("post", "fieldtech", at=(-11.0, 54.1, Z1), face=[0, 1, 0])
    F.sign(T((-6.14, 52.0, Z1 + 2.4)) @ RZ(-90), "WARP-FIELD OPERATIONS", w=1.8, h=0.2)


def lab_b(F):
    D, E, G = F.section("labb")
    zc = Z1 + H1
    x0, x1, y0, y1 = 6.0, 16.0, 42.0, 56.0
    F.floor(x0, y0, x1, y1, Z1, "floor_panel")
    F.ceil(x0, y0, x1, y1, zc, "padding_light")
    wall_x(F, y0, y1, x1, Z1, zc, mat="tile_white", into=-1)
    wall_y(F, x0, x1, y0, Z1, zc, mat="tile_white", into=1)
    wall_y(F, x0, x1, y1, Z1, zc, mat="tile_white", into=-1)
    strips(F, x0, x1, y0, y1, zc, "labb", along="x", step=3.3, power=11)
    strips(F, x0, x1, 47.0, 51.0, zc, "labb", along="x", step=3.3, power=11)
    for y in (44.0, 54.0):
        F.bench(T((11.0, y, Z1)) @ RZ(0 if y < 49 else 180), w=3.0, d=0.8)
    # fume hood (atmospheric chemistry), spectrometer racks, remote-sensing station
    M = T((15.3, 49.0, Z1)) @ RZ(-90)
    D.box((1.8, 0.8, 0.9), M=M @ T((0, 0, 0.45)), mat="paint_white", bevel=0.02)
    D.box((1.8, 0.8, 0.9), M=M @ T((0, 0.0, 2.1)), mat="paint_white", bevel=0.02)
    G.box((1.7, 0.02, 0.75), M=M @ T((0, -0.4, 1.28)), mat="glass")
    E.box((1.6, 0.05, 0.03), M=M @ T((0, -0.1, 1.62)), mat="emit_white")
    F.C.box((1.8, 0.8, 2.5), M=M @ T((0, 0, 1.25)), mat="concrete")
    F.rack(T((15.4, 46.3, Z1)) @ RZ(-90), h=2.0)
    F.rack(T((15.4, 51.7, Z1)) @ RZ(-90), h=2.0)
    F.console(T((9.0, 49.0, Z1)) @ RZ(90), w=2.0, sid="sensing", screens=2, chair=True)
    marker("terminal", "labb", at=(9.4, 49.0, Z1 + 1.1), label="Remote sensing · atmospheric chemistry")
    F.sign(T((6.14, 52.0, Z1 + 2.4)) @ RZ(90), "SCIENCE LAB B · ATMOSPHERES · REMOTE SENSING", w=2.4, h=0.2)


def astrometry(F):
    D, E, G = F.section("astro")
    zc = Z1 + H1
    x0, x1, y0, y1 = -6.0, 6.0, 56.0, 66.0
    F.floor(x0, y0, x1, y1, Z1, "floor_panel_dark")
    F.ceil(x0, y0, x1, y1, zc, "padding_dark")
    wall_x(F, y0, y1, x0, Z1, zc, mat="padding_dark", into=1)
    wall_x(F, y0, y1, x1, Z1, zc, mat="padding_dark", into=-1)
    wall_y(F, x0, x1, y1, Z1, zc, mat="padding_dark", into=-1)
    for (x, y) in ((-3.0, 58.5), (3.0, 58.5), (-3.0, 63.0), (3.0, 63.0)):
        F.strip(x, y, zc, yaw=0, L=1.0, power=6, room="astro", color=(0.75, 0.85, 1.0))
    # the full-width stellar map on the forward wall, flat technical displays, the star table
    F.screen("astro_map", T((0.0, y1 - 0.14, Z1 + 1.5)), w=10.0, h=2.2, bezel=0.04)
    F.screen("astro_l", T((x0 + 0.14, 61.0, Z1 + 1.5)) @ RZ(90), w=2.0, h=1.0)
    F.screen("astro_r", T((x1 - 0.14, 61.0, Z1 + 1.5)) @ RZ(-90), w=2.0, h=1.0)
    M = T((0.0, 60.6, Z1))
    D.cyl(1.2, 0.85, M=M @ T((0, 0, 0.43)), mat="paint_gray_dark", segs=40, bevel=0.03)
    D.cyl(1.3, 0.05, M=M @ T((0, 0, 0.88)), mat="plastic_black", segs=40)
    E.cyl(1.05, 0.02, M=M @ T((0, 0, 0.91)), mat="emit_blue", segs=40)
    G.sphere(0.6, M=M @ T((0, 0, 1.6)), mat="glass", segs=24, rings=12)
    for k in range(14):
        a = k * 2.4
        E.sphere(0.03, M=M @ T((0.45 * math.cos(a) * math.sin(k), 0.45 * math.sin(a) * math.sin(k), 1.6 + 0.4 * math.cos(k))), mat="emit_white", segs=6, rings=4)
    E.sphere(0.06, M=M @ T((0.15, 0.1, 1.62)), mat="emit_red", segs=8, rings=6)
    E.sphere(0.05, M=M @ T((0.22, 0.05, 1.6)), mat="emit_red", segs=8, rings=6)
    F.C.cyl(1.3, 0.9, M=M @ T((0, 0, 0.45)), mat="concrete", segs=12)
    for (x, rz) in ((-3.6, 0), (3.6, 0)):
        F.console(T((x, 63.6, Z1)) @ RZ(rz), w=1.8, sid=f"astro_c{'l' if x < 0 else 'r'}", screens=2, chair=x > 0)
    marker("terminal", "astrometry", at=(0.0, 59.4, Z1 + 1.0), label="Astrometry · stellar map · route planner")
    marker("post", "navigator", at=(-3.6, 62.8, Z1), face=[0, 1, 0])


# ===================================================================================================== bridge
def dais_y(x):
    """y (Blender) of the dais edge at x: the circle r = R_DAIS round the saucer centre."""
    return W.Y_S + math.sqrt(max(0.0, R_DAIS * R_DAIS - x * x))


def bridge(F):
    """The bridge inside the canopy: inner shell (inset from the hull, the window band open, reveals to the glass),
    the command dais and the flight deck, seats, consoles, the volumetric display pedestal, overhead panel."""
    D, E, G = F.section("bridge")
    S, C = F.S, F.C
    IN = 0.28
    YR0, YR1 = -4.6, 21.0
    yrs = [yr for yr in W.canopy_yrs() if YR0 - 0.01 <= yr <= YR1 + 0.01][::-1]   # rear -> front
    # ---- inner shell: the canopy surface inset, clamped to the floor it stands on; the band left open
    def floor_at(x, yr):
        return ZU if math.hypot(x, yr) <= R_DAIS else ZL
    rings_in, rings_out = [], []
    for yr in yrs:
        ri = W.canopy_ring(yr, IN)[:W.NT + 1]
        ro = W.canopy_ring(yr, 0.0)[:W.NT + 1]
        ri = [Vector((v.x, v.y, max(v.z, floor_at(v.x, yr) - 0.02))) for v in ri]
        rings_in.append(ri)
        rings_out.append(ro)
    n = W.NT + 1
    verts = [v for r in rings_in for v in r]
    faces, cfaces, reveal = [], [], []
    for i in range(len(yrs) - 1):
        yc = (yrs[i] + yrs[i + 1]) / 2
        for k in range(W.NT):
            a, b = i * n + k, i * n + k + 1
            f = (a, b, b + n, a + n)       # inward (rows run toward +y here)
            cfaces.append(f)
            if not W.in_band(yc, k):
                faces.append(f)
    S.mesh(verts, faces, mat="plastic_white", recalc=False)
    C.mesh(verts, cfaces, mat="concrete", recalc=False)
    # reveals: from the inner shell's band edges out to the hull, lined in dark gray (both faces)
    rv, rf = [], []

    def quad(p0, p1, q1, q0):
        base = len(rv)
        rv.extend([p0, p1, q1, q0])
        rf.append((base, base + 1, base + 2, base + 3))
        rf.append((base + 3, base + 2, base + 1, base))
    last = len(yrs) - 2
    for i in range(len(yrs) - 1):
        yc = (yrs[i] + yrs[i + 1]) / 2
        for k in range(W.NT):
            if not W.in_band(yc, k):
                continue
            if k == 0 or not W.in_band(yc, k - 1):
                quad(rings_in[i][k], rings_in[i + 1][k], rings_out[i + 1][k], rings_out[i][k])
            if k == W.NT - 1 or not W.in_band(yc, k + 1):
                quad(rings_in[i][k + 1], rings_in[i + 1][k + 1], rings_out[i + 1][k + 1], rings_out[i][k + 1])
            if i == 0 or not W.in_band((yrs[i - 1] + yrs[i]) / 2, k):
                quad(rings_in[i][k], rings_in[i][k + 1], rings_out[i][k + 1], rings_out[i][k])
            if i == last or not W.in_band((yrs[i + 1] + yrs[i + 2]) / 2, k):
                quad(rings_in[i + 1][k], rings_in[i + 1][k + 1], rings_out[i + 1][k + 1], rings_out[i + 1][k])
    D.mesh(rv, rf, mat="hull_gray", recalc=False)
    # rear bulkhead (closing the shell behind the dais) and the front closure under the nose
    rear = rings_in[0]
    S.mesh([(v.x, v.y, v.z) for v in rear] + [(rear[-1].x, rear[0].y, ZU - 0.02), (rear[0].x, rear[0].y, ZU - 0.02)],
           [tuple(range(n + 2)), tuple(range(n + 2))[::-1]], mat="padding_light", recalc=False)
    front = rings_in[-1]
    S.mesh([(v.x, v.y, v.z) for v in front] + [(front[-1].x, front[0].y, ZL - 0.02), (front[0].x, front[0].y, ZL - 0.02)],
           [tuple(range(n + 2)), tuple(range(n + 2))[::-1]], mat="padding_dark", recalc=False)
    # ---- floors: the dais (a disc sector inside the canopy), steps, the flight deck
    def half_w(yr):
        w, h = W.bridge_dims(yr)
        return w - IN
    side = []
    yr = YR0
    while yr < R_DAIS:
        x = half_w(yr)
        if x * x + yr * yr >= R_DAIS * R_DAIS:
            break
        side.append((x, yr))
        yr += 0.25
    phi = math.atan2(side[-1][0], side[-1][1])
    arc = [(R_DAIS * math.sin(phi - 2 * phi * k / 24), R_DAIS * math.cos(phi - 2 * phi * k / 24)) for k in range(25)]
    # (the rear edge carries the stairwell's notch: the stair comes up through it from the hall)
    notch = [(-4.4, YR0), (-4.4, 48.7 - W.Y_S), (-3.0, 48.7 - W.Y_S), (-3.0, YR0)]
    outline = side + arc[1:-1] + [(-x, yr) for (x, yr) in side[::-1]] + notch
    outline = [(x, W.Y_S + yr) for (x, yr) in outline]
    S.prism(outline, 0.12, plane="XY", M=T((0, 0, ZU - 0.12)), mat="floor_panel_dark", bevel=0, exact_holes=True)
    C.prism(outline, 0.4, plane="XY", M=T((0, 0, ZU - 0.4)), mat="concrete", bevel=0)
    # railing round the stairwell's head on the dais
    F.rail([(-4.45, 48.75, ZU), (-4.45, 45.5, ZU)], h=1.0)
    F.rail([(-2.95, 47.0, ZU), (-2.95, 45.5, ZU)], h=1.0)
    # dais front face down to the flight deck, with an amber edge light
    a0 = 90.0 - math.degrees(phi)
    sw = 2 * math.degrees(phi)
    D.lathe([(R_DAIS - 0.05, ZL), (R_DAIS, ZL), (R_DAIS, ZU), (R_DAIS - 0.05, ZU)], M=T((0, W.Y_S, 0)) @ RZ(a0), mat="padding_dark", segs=22, sweep=sw, closed=True)
    E.lathe([(R_DAIS, ZU - 0.07), (R_DAIS + 0.02, ZU - 0.07), (R_DAIS + 0.02, ZU - 0.03), (R_DAIS, ZU - 0.03)], M=T((0, W.Y_S, 0)) @ RZ(a0), mat="emit_amber", segs=22, sweep=sw, closed=True)
    C.lathe([(R_DAIS - 0.3, ZL), (R_DAIS, ZL), (R_DAIS, ZU), (R_DAIS - 0.3, ZU)], M=T((0, W.Y_S, 0)) @ RZ(a0), mat="concrete", segs=24, sweep=sw, closed=True)
    # three steps down at the centre
    for k in range(3):
        z = ZU - (k + 1) * (ZU - ZL) / 4
        D.box((2.4, 0.34, z - ZL + 0.02), at=(0, W.Y_S + R_DAIS + 0.17 + k * 0.34, (z + ZL) / 2), mat="tread_plate", bevel=0.01)
        C.box((2.4, 0.34, z - ZL + 0.02), at=(0, W.Y_S + R_DAIS + 0.17 + k * 0.34, (z + ZL) / 2), mat="concrete")
    # the flight deck: from the dais arc forward to the nose console
    fy0, fy1 = R_DAIS - 1.0, 19.4
    fl = []
    for k in range(21):
        yr = fy0 + (fy1 - fy0) * k / 20
        fl.append((half_w(yr), yr))
    fdeck = [(x, W.Y_S + yr) for (x, yr) in fl] + [(-x, W.Y_S + yr) for (x, yr) in fl[::-1]]
    S.prism(fdeck, 0.12, plane="XY", M=T((0, 0, ZL - 0.12)), mat="floor_panel", bevel=0, exact_holes=True)
    C.prism(fdeck, 0.4, plane="XY", M=T((0, 0, ZL - 0.4)), mat="concrete", bevel=0)
    # ---- the flight deck: pilot and co-pilot under the band, nose console, side stations
    for s, sid in ((-1, "pilot"), (1, "copilot")):
        x = s * 1.45
        yr = 12.2
        M = T((x, W.Y_S + yr, ZL))
        seat(F, M, f"bridge_{sid}", "Pilot seat" if s < 0 else "Co-pilot seat")
        Mc = T((x, W.Y_S + yr + 1.15, ZL))
        D.box((1.5, 0.7, 0.8), M=Mc @ T((0, 0, 0.4)), mat="paint_gray_dark", bevel=0.03)
        D.box((1.5, 0.75, 0.05), M=Mc @ T((0, -0.05, 0.82)) @ RX(-14), mat="plastic_dark", bevel=0.01)
        F.screen(f"br_{sid}_a", Mc @ T((-0.38, 0.12, 1.12)) @ RX(-28), w=0.62, h=0.38)
        F.screen(f"br_{sid}_b", Mc @ T((0.38, 0.12, 1.12)) @ RX(-28), w=0.62, h=0.38)
        for k in range(8):
            E.box((0.05, 0.03, 0.012), M=Mc @ T((-0.6 + k * 0.17, -0.25, 0.85)) @ RX(-14), mat=["emit_green", "emit_amber", "emit_blue", "emit_white"][k % 4])
        D.box((0.08, 0.08, 0.25), M=Mc @ T((s * -0.55, -0.42, 0.78)), mat="plastic_black", bevel=0.02)
        C.box((1.5, 0.7, 1.1), M=Mc @ T((0, 0, 0.55)), mat="concrete")
    # side stations: navigation (port) and engineering (starboard), facing outboard
    for s, sid, lab in ((-1, "nav", "Navigation station"), (1, "eng", "Engineering station")):
        yr = 9.0
        x = s * (half_w(yr) - 0.9)
        F.console(T((x, W.Y_S + yr, ZL)) @ RZ(90 if s < 0 else -90), w=1.8, sid=f"br_{sid}", screens=2, chair=False)
        seat(F, T((x - s * 0.95, W.Y_S + yr, ZL)) @ RZ(90 if s < 0 else -90), f"bridge_{sid}", lab)
    # ---- the command dais: captain's chair, the volumetric display pedestal, rear status wall, overhead panel
    seat(F, T((0, W.Y_S + 3.4, ZU)), "bridge_captain", "Captain's chair", captain=True)
    for s in (-1, 1):
        D.box((0.5, 0.7, 0.66), at=(s * 0.78, W.Y_S + 3.4, ZU + 0.33), mat="paint_gray_dark", bevel=0.04)
        F.screen(f"br_arm_{'l' if s < 0 else 'r'}", T((s * 0.78, W.Y_S + 3.55, ZU + 0.72)) @ RX(-70), w=0.36, h=0.24)
    M = T((0, W.Y_S + 6.3, ZU))
    D.cyl(0.45, 0.9, M=M @ T((0, 0, 0.45)), mat="paint_gray_dark", segs=24, bevel=0.03)
    D.cyl(0.55, 0.06, M=M @ T((0, 0, 0.92)), mat="metal_chrome", segs=24)
    E.cyl(0.42, 0.02, M=M @ T((0, 0, 0.96)), mat="emit_cyan", segs=24)
    G.sphere(0.5, M=M @ T((0, 0, 1.55)), mat="glass", segs=20, rings=10)
    E.tube(0.42, 0.40, 0.02, M=M @ T((0, 0.13, 1.55)) @ RX(90), mat="warp_glow", segs=32)
    E.tube(0.42, 0.40, 0.02, M=M @ T((0, -0.13, 1.55)) @ RX(90), mat="warp_glow", segs=32)
    D.cyl(0.03, 0.6, M=M @ T((0, 0, 1.55)) @ RX(90), mat="hull_white", segs=8)
    C.cyl(0.55, 1.0, M=M @ T((0, 0, 0.5)), mat="concrete", segs=10)
    marker("holo", "bridge", at=(0, W.Y_S + 6.3, ZU + 1.55))
    for k, x in enumerate((-2.2, 0.0, 2.2)):
        F.screen(f"br_rear{k}", T((x, W.Y_S + YR0 + 0.4, ZU + 1.55)) @ RZ(180), w=1.6, h=0.8)
    # overhead switch panel over the flight stations, hung from two struts
    D.box((3.2, 1.4, 0.14), at=(0, W.Y_S + 11.6, ZL + 2.55), mat="paint_gray_dark", bevel=0.02)
    for s in (-1, 1):
        D.box((0.08, 0.08, 0.7), at=(s * 1.3, W.Y_S + 11.6, ZL + 2.97), mat="metal_gunmetal")
    for k in range(24):
        E.box((0.06, 0.04, 0.015), at=(-1.4 + (k % 12) * 0.25, W.Y_S + 11.2 + (k // 12) * 0.8, ZL + 2.475), mat=["emit_amber", "emit_green", "emit_white"][k % 3])
    # guide lights along the flight deck sides and the dais
    for s in (-1, 1):
        E.box((0.04, 6.0, 0.02), at=(s * (half_w(15.5) - 0.3), W.Y_S + 12.5, ZL + 0.05), mat="emit_cool")
    for (x, yr, z) in ((-3.0, 1.0, ZU), (3.0, 1.0, ZU), (-3.5, 12.0, ZL), (3.5, 12.0, ZL), (0, 16.0, ZL)):
        light(F.uid("hal_l"), at=(x, W.Y_S + yr, z + 2.1), color=(1.0, 0.86, 0.72), power=7, dist=7, bake=22, group="hal", room="bridge")
    marker("terminal", "bridge", at=(0, W.Y_S + 6.3, ZU + 1.1), label="Volumetric display · ship status")
    marker("post", "officer", at=(1.45, W.Y_S + 12.2, ZL), face=[0, 1, 0], seat="bridge_copilot")


def seat(F, M, sid, label, captain=False):
    """Bridge seat facing +Y in its frame M (sit-able: a `seat` marker at the cushion)."""
    D, C = F.D, F.C
    D.cyl(0.07, 0.4, M=M @ T((0, 0, 0.2)), mat="metal_chrome", segs=12)
    D.cyl(0.32 if captain else 0.26, 0.05, M=M @ T((0, 0, 0.025)), mat="paint_gray_dark", segs=20)
    D.box((0.6 if captain else 0.52, 0.55, 0.12), M=M @ T((0, 0, 0.47)), mat="seat_leather_dark", bevel=0.04)
    D.box((0.6 if captain else 0.52, 0.12, 0.75), M=M @ T((0, -0.26, 0.9)) @ RX(-12), mat="seat_leather_dark", bevel=0.05)
    D.box((0.3, 0.1, 0.22), M=M @ T((0, -0.33, 1.38)) @ RX(-12), mat="seat_leather_dark", bevel=0.04)
    for s in (-1, 1):
        D.box((0.05, 0.03, 0.62), M=M @ T((s * 0.17, -0.2, 0.92)) @ RX(-12), mat="handle_yellow")
        D.box((0.07, 0.45, 0.06), M=M @ T((s * (0.33 if captain else 0.29), 0.0, 0.7)), mat="paint_gray_dark", bevel=0.02)
    C.box((0.6, 0.6, 1.0), M=M @ T((0, -0.05, 0.5)), mat="concrete")
    loc, rot, _ = (M @ T((0, 0.05, 0.53))).decompose()
    e = rot.to_euler("XYZ")
    marker("seat", sid, at=loc[:], rot=(math.degrees(e.x), math.degrees(e.y), math.degrees(e.z)), eye=0.74, label=label)


# ===================================================================================================== pod bay
def pod_bay(F):
    """Deck 2: the pod launch and recovery bay over the four ventral doors. Stepped walls following the hull, the
    starboard walkway at the pods' hatch level, the stations' docking collars and cradles, preflight displays,
    safety gates. (The pods themselves are their own models, at the `podbay` markers.)"""
    D, E, G = F.section("podbay")
    y0, y1 = PB
    F.floor(2.9, y0, 4.6, y1, ZW, "grating")
    F.rail([(2.92, y0 + 0.3, ZW), (2.92, y1 - 0.3, ZW)], h=1.05)
    F.rail([(4.62, -12.8, ZW), (4.62, y1 - 0.3, ZW)], h=1.05)
    # bay floor: the ventral doors (yellow borders), between them deck plates
    for y in POD_Y:
        D.box((5.6, 7.2, 0.1), at=(0, y, ZB0 - 0.05), mat="hull_gray", bevel=0.02)
        for (dx, dy, sx, sy) in ((0, 3.62, 5.8, 0.16), (0, -3.62, 5.8, 0.16), (2.88, 0, 0.16, 7.4), (-2.88, 0, 0.16, 7.4)):
            D.box((sx, sy, 0.04), at=(dx, y + dy, ZB0 + 0.02), mat="paint_yellow")
    C = F.C
    C.box((5.8, y1 - y0, 0.4), at=(0, (y0 + y1) / 2, ZB0 - 0.2), mat="concrete")
    # walls: lower part narrow (inside the hull's curve), upper part out to the walkway
    for s in (-1, 1):
        F.wall((s * 2.9, y0), (s * 2.9, y1), ZB0, ZW, (), "padding_gray", t=0.2)
    F.wall((-4.7, y0), (-4.7, y1), ZW, ZB1, (), "padding_gray", t=0.2)
    F.wall((4.7, y0), (4.7, y1), ZW, ZB1, (), "padding_gray", t=0.2)
    F.floor(-4.6, y0, -2.9, y1, ZW, "padding_gray")
    for y in (y0, y1):
        F.wall((-4.7, y), (4.7, y), ZB0, ZB1, (), "padding_gray", t=0.2)
    ceil_rect_holes(F, -4.7, y0, 4.7, y1, ZB1, "padding_gray", [(2.85, -18.7, 4.7, -13.0)])
    # the stations: collar overhead, cradle arms, number, preflight display at the walkway, an access bridge gate
    for i, y in enumerate(POD_Y):
        D.tube(1.9, 1.6, 0.5, at=(0, y, ZB1 - 0.45), mat="metal_gunmetal", segs=40)
        for k in range(4):
            a = math.radians(45 + 90 * k)
            D.box((0.25, 0.25, 2.2), at=(1.8 * math.cos(a), y + 1.8 * math.sin(a), ZB1 - 1.6), mat="paint_yellow", bevel=0.03)
        D.text(f"0{i + 1}", size=1.2, M=T((-2.78, y, ZW + 1.0)) @ RZ(-90) @ RX(90), mat="paint_yellow", depth=0.01)
        F.screen(f"pod{i + 1}", T((4.56, y + 1.6, ZW + 1.4)) @ RZ(-90), w=0.7, h=0.42)
        marker("terminal", f"pod{i + 1}", at=(4.3, y + 1.6, ZW + 1.2), label=f"POD 0{i + 1} · preflight")
        D.box((0.05, 1.2, 1.05), at=(2.92, y, ZW + 0.55), mat="paint_yellow", bevel=0.01)
        marker("podbay", f"0{i + 1}", at=(0, y, ZB0), gate=[2.92, y, ZW])
        light(F.uid("hal_l"), at=(3.6, y, ZB1 - 0.5), color=(1.0, 0.95, 0.85), power=12, dist=9, bake=36, group="hal", room="podbay")
    for k in range(int((y1 - y0) / 3.0)):
        E.box((0.05, 0.6, 0.02), at=(4.55, y0 + 1.5 + k * 3.0, ZW + 0.05), mat="emit_amber")
    F.sign(T((4.56, -22.5, ZW + 2.0)) @ RZ(-90), "POD BAY · BAY DOORS INTERLOCKED · NO ENTRY BELOW THE WALKWAY DURING LAUNCH", w=3.0, h=0.2, bg="paint_yellow")


def build():
    reset()
    F = Fac("hal", cell=1.6)
    F.section("spine")
    spine_shell(F)
    medical(F)
    life_support(F)
    habitation(F)
    hibernation(F)
    storage(F)
    lab_a(F)
    pod_access(F)
    airlock_hall(F)
    ring_access(F)
    engineering(F)
    neck(F)
    saucer_deck(F)
    warp_ops(F)
    lab_b(F)
    astrometry(F)
    bridge(F)
    pod_bay(F)
    objs = F.finish(rays=10, fill=0.025)
    return objs


if __name__ == "__main__":
    build()
    if "--preview" in sys.argv:
        dark = dict(sun=0.0, sky_strength=0.0)
        preview("hal_bridge", (0.0, W.Y_S + 1.0, ZU + 1.7), (0.0, W.Y_S + 16.0, ZL + 1.4), res=(1400, 800), lens=20, samples=24, **dark)
        preview("hal_spine", (0.0, -24.0, 1.6), (0.0, 10.0, 1.2), res=(1400, 800), lens=24, samples=24, **dark)
        preview("hal_cryo", (-1.6, -0.6, 1.7), (-4.0, -8.0, 0.5), res=(1400, 800), lens=22, samples=24, **dark)
        preview("hal_hall", (3.5, 40.0, 1.7), (-4.0, 46.0, 2.5), res=(1400, 800), lens=22, samples=24, **dark)
        preview("hal_podbay", (3.8, -22.5, ZW + 1.7), (0.0, 0.0, -4.0), res=(1400, 800), lens=22, samples=24, **dark)
        preview("hal_eng", (0.0, -36.8, 1.7), (0.0, -46.0, 1.2), res=(1400, 800), lens=22, samples=24, **dark)
        sys.exit(0)
    export_glb("halcyon_int")
    save_blend("halcyon_int")
