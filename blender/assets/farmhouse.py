"""Farmhouse — reconstructed from reference images 1 and 2.

Two-storey gabled main block (6.1 x 9.4 m, 45 deg roof, gable to the front), single-storey wing to
the west (9 x 6 m, ridge parallel to the front) and a wrap-around porch on slender posts.
Fully furnished interior: living room, kitchen/dining, storage + mud room, farm office, two bedrooms.

Blender frame: +X east, +Y north (the front of the house faces -Y), origin at ground level on the
front wall line at the south-west corner of the main block.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from arch import Bldg, frame_matrix  # noqa: E402
import furn  # noqa: E402
from furn import place, R, T  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

PREVIEW = "--preview" in sys.argv
F1, CEIL1, F2, CEIL2, EAVE = 0.5, 3.2, 3.45, 5.95, 6.1
MX, MY = 6.1, 9.4                       # main block footprint
RIDGE = EAVE + MX / 2                   # 45 deg
WX, WY = -9.0, 6.0                      # wing footprint (x from WX to 0)
W_EAVE, W_PITCH = 3.3, 35.0
W_RIDGE = W_EAVE + (WY / 2) * math.tan(math.radians(W_PITCH))
WT = 0.16                               # exterior wall thickness
SILL1, HEAD1 = F1 + 0.75, F1 + 2.5      # ground floor windows
SILL2, HEAD2 = F2 + 0.5, F2 + 2.3       # upper floor windows
DOOR_H = 2.05


def build():
    reset()
    B = Bldg("farmhouse")
    E, I, C = B.ext, B.int, B.col
    rnd = random.Random(7)

    # ============================================================ foundation
    def footing(a, b):
        M, L = B.wall_frame(a, b)
        E.box((L + 0.12, 0.3, 0.46), M=M @ T((L / 2, 0.11, 0.23)), mat="concrete", bevel=0.01)
        C.box((L + 0.12, 0.3, 0.46), M=M @ T((L / 2, 0.11, 0.23)), mat="concrete", bevel=0)
    for a, b in (((0, 0), (MX, 0)), ((MX, 0), (MX, MY)), ((MX, MY), (0, MY)), ((0, MY), (0, WY)),
                 ((0, WY), (WX, WY)), ((WX, WY), (WX, 0)), ((WX, 0), (0, 0))):
        footing(a, b)

    # ============================================================ exterior walls
    z0 = 0.42
    # --- main block, south gable (front) ---
    Ms, _ = B.wall((0, 0), (MX, 0), z0, EAVE, gable=[(MX / 2, RIDGE)], openings=[
        (0.4, 1.35, F1, F1 + DOOR_H), (2.35, 3.2, SILL1, HEAD1), (4.1, 4.95, SILL1, HEAD1),
        (1.08, 1.93, SILL2, HEAD2), (4.2, 5.05, SILL2, HEAD2)])
    B.window(Ms, 2.35, 3.2, SILL1, HEAD1, wid="living_s")
    B.window(Ms, 4.1, 4.95, SILL1, HEAD1)
    B.window(Ms, 1.08, 1.93, SILL2, HEAD2, style="boarded")
    B.window(Ms, 4.2, 5.05, SILL2, HEAD2, style="boarded")
    B.door("front", Ms, 0.4, F1, w=0.95, h=DOOR_H, hinge="left", swing="in", style="panel", mat="wood_trim_dark", label="Front door", sill=True)
    # diamond louvre vent high in the gable
    Mv = Ms @ T((MX / 2, -0.02, EAVE + 1.75)) @ R(45, "Y")
    E.box((0.52, 0.03, 0.52), M=Mv, mat="wood_trim", bevel=0.004)
    for i in range(5):
        E.box((0.4, 0.02, 0.04), M=Ms @ T((MX / 2, -0.045, EAVE + 1.55 + i * 0.1)) @ R(25, "X"), mat="wood_trim_dark", bevel=0.002)

    # --- main block, east wall ---
    Me, _ = B.wall((MX, 0), (MX, MY), z0, EAVE, openings=[
        (1.6, 2.45, SILL1, HEAD1), (6.3, 7.15, SILL1, HEAD1), (1.6, 2.45, SILL2, HEAD2), (6.3, 7.15, SILL2, HEAD2)])
    B.window(Me, 1.6, 2.45, SILL1, HEAD1, wid="living_e")
    B.window(Me, 6.3, 7.15, SILL1, HEAD1)
    B.window(Me, 1.6, 2.45, SILL2, HEAD2, wid="murph_e")
    B.window(Me, 6.3, 7.15, SILL2, HEAD2)

    # --- main block, north gable (back) ---
    Mn, _ = B.wall((MX, MY), (0, MY), z0, EAVE, gable=[(MX / 2, RIDGE)], openings=[
        (0.25, 1.15, F1, F1 + DOOR_H), (2.6, 3.45, F2 + 0.75, HEAD2)])
    B.window(Mn, 2.6, 3.45, F2 + 0.75, HEAD2)
    B.door("back", Mn, 0.25, F1, w=0.9, h=DOOR_H, hinge="right", swing="in", style="panel", label="Back door", sill=True)

    # --- main block, west wall: exterior north of the wing, and above the wing roof ---
    Mw1, _ = B.wall((0, MY), (0, WY), z0, EAVE, openings=[(2.15, 3.0, SILL1, HEAD1), (1.9, 2.75, SILL2, HEAD2)])
    B.window(Mw1, 2.15, 3.0, SILL1, HEAD1, wid="office_w")
    B.window(Mw1, 1.9, 2.75, SILL2, HEAD2)
    Mw2, _ = B.wall((0, WY), (0, 0), W_EAVE, EAVE, openings=[(4.7, 5.5, F2 + 1.0, HEAD2), (1.4, 2.2, F2 + 1.45, HEAD2)])
    B.window(Mw2, 4.7, 5.5, F2 + 1.0, HEAD2)
    B.window(Mw2, 1.4, 2.2, F2 + 1.45, HEAD2)

    # --- wing ---
    Mws, _ = B.wall((WX, 0), (0, 0), z0, W_EAVE, openings=[
        (0.9, 1.75, SILL1, HEAD1 - 0.05), (4.9, 5.8, F1, F1 + DOOR_H), (6.2, 7.05, SILL1, HEAD1 - 0.05), (7.7, 8.55, SILL1, HEAD1 - 0.05)])
    B.window(Mws, 0.9, 1.75, SILL1, HEAD1 - 0.05)
    B.window(Mws, 6.2, 7.05, SILL1, HEAD1 - 0.05, wid="kitchen_s")
    B.window(Mws, 7.7, 8.55, SILL1, HEAD1 - 0.05)
    B.door("kitchen", Mws, 4.9, F1, w=0.9, h=DOOR_H, hinge="right", swing="in", style="glazed", label="Kitchen door", sill=True)
    Mwn, _ = B.wall((0, WY), (WX, WY), z0, W_EAVE, openings=[
        (2.6, 3.45, F1 + 1.1, HEAD1 - 0.05), (4.4, 5.25, F1 + 1.1, HEAD1 - 0.05), (7.0, 7.85, SILL1, HEAD1 - 0.05)])
    B.window(Mwn, 2.6, 3.45, F1 + 1.1, HEAD1 - 0.05, wid="kitchen_n")
    B.window(Mwn, 4.4, 5.25, F1 + 1.1, HEAD1 - 0.05)
    B.window(Mwn, 7.0, 7.85, SILL1, HEAD1 - 0.05)
    Mww, _ = B.wall((WX, WY), (WX, 0), z0, W_EAVE, gable=[(WY / 2, W_RIDGE)], openings=[
        (1.0, 1.9, F1, F1 + DOOR_H), (4.1, 4.95, SILL1, HEAD1 - 0.05)])
    B.window(Mww, 4.1, 4.95, SILL1, HEAD1 - 0.05, style="shutter")
    B.door("mud", Mww, 1.0, F1, w=0.9, h=DOOR_H, hinge="left", swing="in", style="glazed", label="Side door", sill=True)
    # attic louvre in the wing gable
    E.box((0.26, 0.03, 0.5), M=Mww @ T((WY / 2, -0.02, W_EAVE + 0.95)), mat="wood_trim", bevel=0.004)
    for i in range(6):
        E.box((0.2, 0.02, 0.035), M=Mww @ T((WY / 2, -0.04, W_EAVE + 0.76 + i * 0.075)) @ R(25, "X"), mat="wood_trim_dark", bevel=0.002)

    # --- corner boards, water table, frieze ---
    def corner(x, y, zt, zb=0.44):
        E.box((0.11, 0.11, zt - zb), at=(x, y, (zt + zb) / 2), mat="wood_trim", bevel=0.006)
    for x, y in ((0, 0), (MX, 0), (MX, MY), (0, MY)):
        corner(x + (0.012 if x == 0 else -0.012) * -1, y + (0.012 if y == 0 else -0.012) * -1, EAVE)
    for x, y in ((WX, 0), (WX, WY)):
        corner(x - 0.012, y + (-0.012 if y == 0 else 0.012), W_EAVE)
    for a, b, zt in (((0, 0), (MX, 0), EAVE), ((MX, 0), (MX, MY), EAVE), ((MX, MY), (0, MY), EAVE), ((0, MY), (0, WY), EAVE),
                     ((0, WY), (WX, WY), W_EAVE), ((WX, WY), (WX, 0), W_EAVE), ((WX, 0), (0, 0), W_EAVE)):
        M, L = B.wall_frame(a, b)
        E.box((L + 0.06, 0.035, 0.13), M=M @ T((L / 2, -0.017, 0.5)), mat="wood_trim", bevel=0.006)
    for a, b in (((MX, 0), (MX, MY)), ((0, MY), (0, 0))):
        M, L = B.wall_frame(a, b)
        E.box((L, 0.03, 0.2), M=M @ T((L / 2, -0.015, EAVE - 0.1)), mat="wood_trim", bevel=0.005)

    # ============================================================ roofs
    for a, b, inward in (((0, 0), (0, MY), (1, 0)), ((MX, 0), (MX, MY), (-1, 0))):
        B.roof_slab(a, b, EAVE, inward, MX / 2, 45, overhang=0.38, rake=0.3, mat="shingles")
    E.box((0.2, MY + 0.62, 0.05), at=(MX / 2, MY / 2, RIDGE + 0.14), rot=(0, 0, 0), mat="shingles_dark", bevel=0.01)
    for a, b, inward in (((WX, 0), (-0.27, 0), (0, 1)), ((WX, WY), (-0.27, WY), (0, -1))):
        B.roof_slab(a, b, W_EAVE, inward, WY / 2, W_PITCH, overhang=0.36, rake=0.26, mat="shingles")
    E.box((abs(WX) + 0.24, 0.2, 0.05), at=(WX / 2 - 0.13, WY / 2, W_RIDGE + 0.12), mat="shingles_dark", bevel=0.01)
    # three low ridge vents on the main roof (visible in reference 2)
    for y in (2.1, 4.6, 7.2):
        E.box((0.3, 0.3, 0.1), at=(MX / 2 - 0.5, y, RIDGE - 0.42), rot=(0, -45, 0), mat="metal_dark", bevel=0.01)

    # ============================================================ porch (wraps the front and the east side)
    PD = 2.5                                  # depth
    PX0, PX1, PY1 = WX, MX + PD, 4.4          # extents
    DECK = F1 - 0.02
    PZ_WALL, PZ_EAVE = 3.02, 2.66
    P = Part("porch")
    # deck boards + rim + joists + piers
    P.box((PX1 - PX0, PD, 0.035), at=((PX0 + PX1) / 2, -PD / 2, DECK - 0.0175), mat="wood_planks", bevel=0.004, uv_swap=False)
    P.box((PD, PY1, 0.035), at=(MX + PD / 2, PY1 / 2, DECK - 0.0175), mat="wood_planks", bevel=0.004, uv_swap=True)
    C.box((PX1 - PX0, PD, 0.2), at=((PX0 + PX1) / 2, -PD / 2, DECK - 0.1), mat="concrete", bevel=0)
    C.box((PD, PY1, 0.2), at=(MX + PD / 2, PY1 / 2, DECK - 0.1), mat="concrete", bevel=0)
    P.box((PX1 - PX0, 0.045, 0.2), at=((PX0 + PX1) / 2, -PD + 0.02, DECK - 0.135), mat="wood_old", bevel=0.004)
    P.box((0.045, PY1 + PD, 0.2), at=(PX1 - 0.02, (PY1 - PD) / 2, DECK - 0.135), mat="wood_old", bevel=0.004)
    P.box((0.045, PD, 0.2), at=(PX0 + 0.02, -PD / 2, DECK - 0.135), mat="wood_old", bevel=0.004)
    P.box((PD, 0.045, 0.2), at=(MX + PD / 2, PY1 - 0.02, DECK - 0.135), mat="wood_old", bevel=0.004)
    x = PX0 + 0.4
    while x < PX1:
        P.box((0.045, PD - 0.1, 0.17), at=(x, -PD / 2, DECK - 0.12), mat="wood_old", bevel=0)
        x += 0.6
    post_x = [PX0 + 0.1, -6.6, -4.2, -1.8, 0.6, 3.0, 5.4, PX1 - 0.1]
    post_y = [1.9, PY1 - 0.1]
    posts = [(px, -PD + 0.1) for px in post_x] + [(PX1 - 0.1, py) for py in post_y]
    for px, py in posts:
        P.box((0.28, 0.28, 0.3), at=(px, py, 0.15), mat="concrete", bevel=0.015)                  # pier
        P.box((0.1, 0.1, PZ_EAVE - DECK - 0.1), at=(px, py, (PZ_EAVE + DECK - 0.1) / 2), mat="wood_trim", bevel=0.006)
        P.box((0.14, 0.14, 0.05), at=(px, py, DECK + 0.025), mat="wood_trim", bevel=0.006)
        P.box((0.15, 0.15, 0.06), at=(px, py, PZ_EAVE - 0.13), mat="wood_trim", bevel=0.006)
        C.box((0.12, 0.12, PZ_EAVE - DECK), at=(px, py, (PZ_EAVE + DECK) / 2), mat="concrete", bevel=0)
    P.box((PX1 - PX0, 0.09, 0.16), at=((PX0 + PX1) / 2, -PD + 0.1, PZ_EAVE - 0.02), mat="wood_trim", bevel=0.006)   # front beam
    P.box((0.09, PY1 + PD - 0.1, 0.16), at=(PX1 - 0.1, (PY1 - PD) / 2, PZ_EAVE - 0.02), mat="wood_trim", bevel=0.006)
    # roof planes: front trapezoid + east trapezoid, mitred along the hip
    ov = 0.32
    ze = PZ_EAVE + 0.08 - ov * (PZ_WALL - PZ_EAVE) / PD
    zw = PZ_WALL + 0.08
    front = [(PX0 - 0.2, -PD - ov, ze), (PX1 + ov, -PD - ov, ze), (MX, 0, zw), (PX0 - 0.2, 0, zw)]
    east = [(PX1 + ov, -PD - ov, ze), (PX1 + ov, PY1 + 0.2, ze), (MX, PY1 + 0.2, zw), (MX, 0, zw)]
    P.poly(front, mat="shingles", thickness=0.035)
    P.poly(east, mat="shingles", thickness=0.035, uv_swap=True)
    P.poly([(p[0], p[1], p[2] - 0.036) for p in reversed(front)], mat="wood_old", thickness=0.03)
    P.poly([(p[0], p[1], p[2] - 0.036) for p in reversed(east)], mat="wood_old", thickness=0.03)
    C.poly(front, mat="concrete", thickness=0.08)
    C.poly(east, mat="concrete", thickness=0.08)
    # exposed rafters with visible tails, fascia
    slope = math.atan2(PZ_WALL - PZ_EAVE, PD)
    x = PX0 + 0.1
    while x < MX + 0.2:
        Lr = (PD + ov) / math.cos(slope)
        P.box((0.045, Lr, 0.11), M=T((x, -(PD + ov) / 2, (ze + zw) / 2 - 0.12)) @ R(math.degrees(slope), "X"), mat="wood_old", bevel=0.003)
        x += 0.6
    y = 0.4
    while y < PY1 + 0.15:
        Lr = (PD + ov) / math.cos(slope)
        P.box((Lr, 0.045, 0.11), M=T((MX + (PD + ov) / 2, y, (ze + zw) / 2 - 0.12)) @ R(math.degrees(slope), "Y"), mat="wood_old", bevel=0.003)
        y += 0.6
    P.box((PX1 + ov - PX0 + 0.2, 0.03, 0.13), at=((PX0 - 0.2 + PX1 + ov) / 2, -PD - ov - 0.01, ze - 0.06), mat="wood_trim", bevel=0.004)
    P.box((0.03, PY1 + 0.2 + PD + ov, 0.13), at=(PX1 + ov + 0.01, (PY1 + 0.2 - PD - ov) / 2, ze - 0.06), mat="wood_trim", bevel=0.004)
    # steps
    def steps(cx, cy, direction, w=1.5, n=3):
        d = Vector((direction[0], direction[1], 0))
        nrm = Vector((-d.y, d.x, 0))
        M = frame_matrix((cx, cy, 0), d, nrm, (0, 0, 1))
        rise = DECK / n
        for i in range(n - 1):
            zt = DECK - rise * (i + 1)
            P.box((0.3, w, 0.04), M=M @ T((0.15 + 0.3 * i, 0, zt - 0.02)), mat="wood_planks", bevel=0.005, uv_swap=True)
            C.box((0.3, w, zt), M=M @ T((0.15 + 0.3 * i, 0, zt / 2)), mat="concrete", bevel=0)
        for s in (-1, 1):
            P.box((0.3 * (n - 1) + 0.05, 0.04, DECK), M=M @ T((0.3 * (n - 1) / 2, s * (w / 2 - 0.02), DECK / 2 - 0.02)), mat="wood_old", bevel=0.004)
    steps(0.9, -PD, (0, -1), 1.7)
    steps(-3.65, -PD, (0, -1), 1.5)
    steps(PX1, 1.0, (1, 0), 1.4)
    # stoop + steps at the west (mud room) door
    P.box((1.3, 1.5, 0.05), at=(WX - 0.65, 4.55, DECK - 0.025), mat="wood_planks", bevel=0.005, uv_swap=True)
    C.box((1.3, 1.5, 0.2), at=(WX - 0.65, 4.55, DECK - 0.1), mat="concrete", bevel=0)
    for px in (WX - 1.2,):
        for py in (3.9, 5.2):
            P.box((0.09, 0.09, DECK - 0.05), at=(px, py, (DECK - 0.05) / 2), mat="wood_old", bevel=0.005)
    steps(WX - 1.3, 4.55, (-1, 0), 1.3)
    # porch clutter: firewood stack, bench, chairs, crates (visible in reference 2)
    for row in range(4):
        for k in range(9):
            P.cyl(rnd.uniform(0.05, 0.085), 0.45, at=(-7.6 + k * 0.17 + (row % 2) * 0.08, -0.42, DECK + 0.07 + row * 0.14), rot=(90, 0, rnd.uniform(-4, 4)),
                  mat="wood_old", segs=8, bevel=0)
    C.box((1.6, 0.5, 0.65), at=(-6.9, -0.42, DECK + 0.32), mat="concrete", bevel=0)
    furn.crate(P, C, place(-5.6, -0.5, DECK, 8), 0.7, 0.5, 0.45)
    furn.crate(P, C, place(-5.55, -0.5, DECK + 0.45, -6), 0.55, 0.42, 0.35, mat="canvas")
    furn.chair(P, C, place(-2.3, -0.55, DECK, 200), seat="wood_old", frame="wood_old")
    furn.chair(P, C, place(-1.5, -0.6, DECK, 165), seat="wood_old", frame="wood_old")
    furn.table(P, C, place(3.7, -0.6, DECK), 1.1, 0.5, 0.45, top="wood_old", leg="wood_old")
    furn.barrel(P, C, place(5.5, -0.5, DECK), mat="paint_blue")
    furn.crate(P, C, place(7.4, 3.6, DECK, 90), 0.8, 0.55, 0.5)

    # ============================================================ rooftop + wall fittings
    X = Part("fittings")
    # stove flue through the wing roof
    fx, fy = -5.55, 3.2
    X.cyl(0.085, 1.05, at=(fx, fy, W_RIDGE + 0.35), mat="metal_dark", segs=14, bevel=0)
    X.cyl(0.15, 0.03, at=(fx, fy, W_RIDGE + 0.72), mat="metal_dark", segs=14, bevel=0.004)
    X.lathe([(0.02, 0.0), (0.17, -0.1), (0.165, -0.11), (0.0, -0.01)], at=(fx, fy, W_RIDGE + 0.95), mat="metal_dark", segs=14)
    X.cyl(0.2, 0.02, at=(fx, fy, W_RIDGE - 0.15), mat="metal_bare", segs=14, bevel=0.004)
    # weather vane on the wing ridge
    vx, vy, vz = -7.2, WY / 2, W_RIDGE + 0.14
    X.cyl(0.014, 1.5, at=(vx, vy, vz + 0.75), mat="metal_dark", segs=8, bevel=0)
    X.sphere(0.05, at=(vx, vy, vz + 0.55), mat="metal_brass", segs=12, rings=8)
    for ang in (0, 90):
        X.cyl(0.008, 0.6, at=(vx, vy, vz + 0.85), rot=(90, 0, ang), mat="metal_dark", segs=6, bevel=0)
    for (dx, dy, ch) in ((0.34, 0, "E"), (-0.34, 0, "W"), (0, 0.34, "N"), (0, -0.34, "S")):
        X.text(ch, 0.1, at=(vx + dx, vy + dy, vz + 0.85), rot=(90, 0, 0), mat="metal_dark", depth=0.004)
    V = Part("farmhouse_vane")
    V.cyl(0.006, 0.7, at=(0, 0, 0), rot=(0, 90, 0), mat="metal_dark", segs=6, bevel=0)
    V.prism([(0.35, 0), (0.25, 0.07), (0.25, -0.07)], 0.004, plane="XZ", mat="metal_dark", bevel=0)
    V.prism([(-0.35, 0.0), (-0.2, 0.0), (-0.18, 0.12), (-0.33, 0.1)], 0.004, plane="XZ", mat="metal_dark", bevel=0)
    # rooster silhouette
    V.prism([(-0.07, 0.02), (0.055, 0.02), (0.095, 0.085), (0.08, 0.14), (0.11, 0.165), (0.07, 0.185), (0.04, 0.14), (0.0, 0.1), (-0.055, 0.14), (-0.11, 0.165), (-0.085, 0.07)],
            0.005, plane="XZ", mat="metal_dark", bevel=0)
    vane = V.finish(at=(vx, vy, vz + 1.25))
    props(vane, kind="vane", id="farmhouse", part="vane", dynamic=1, col=0)
    # satellite dish on the main west wall (reference 2)
    dM = T((-0.05, 2.6, 4.95)) @ R(-90, "Z") @ R(-24, "X")
    X.lathe([(0.0, 0.0), (0.12, 0.012), (0.24, 0.05), (0.33, 0.11), (0.335, 0.108), (0.24, 0.042), (0.12, 0.004)], M=dM @ R(90, "X"), mat="plastic_gray", segs=24)
    X.pipe([(0, 0.0, -0.33), (0, -0.28, -0.1), (0, -0.36, 0.0)], 0.01, M=dM, mat="metal_dark", segs=6)
    X.box((0.05, 0.08, 0.04), M=dM @ T((0, -0.38, 0.0)), mat="plastic_gray", bevel=0.006)
    X.pipe([(-0.02, 2.6, 4.6), (-0.2, 2.6, 4.6), (-0.2, 2.6, 4.9)], 0.016, mat="metal_dark", segs=8)
    # porch lamps beside the doors + electric meter + service mast
    def wall_lamp(x, y, z, rz):
        M = T((x, y, z)) @ R(rz)
        X.box((0.1, 0.03, 0.14), M=M, mat="metal_dark", bevel=0.006)
        X.cyl(0.05, 0.13, M=M @ T((0, -0.09, -0.03)), mat="glass_dirty", segs=10, bevel=0.004)
        X.cyl(0.058, 0.02, M=M @ T((0, -0.09, 0.045)), mat="metal_dark", segs=10, bevel=0.003)
        X.sphere(0.025, M=M @ T((0, -0.09, -0.03)), mat="emit_warm", segs=8, rings=6)
    wall_lamp(1.7, -0.03, 2.35, 0)
    wall_lamp(-2.9, -0.03, 2.35, 0)
    wall_lamp(WX - 0.03, 3.75, 2.35, -90)
    X.box((0.3, 0.12, 0.45), at=(MX + 0.07, 5.2, 1.7), mat="paint_gray", bevel=0.01)
    X.cyl(0.09, 0.07, at=(MX + 0.15, 5.2, 1.78), rot=(0, 90, 0), mat="glass", segs=14, bevel=0.004)
    X.pipe([(MX + 0.07, 5.2, 1.95), (MX + 0.07, 5.2, EAVE + 0.5), (MX + 0.3, 5.2, EAVE + 0.9)], 0.025, mat="metal_bare", segs=8)
    E.add_part(P)
    E.add_part(X)

    # ============================================================ floors / ceilings
    B.floor([(WT, WT), (MX - WT, WT), (MX - WT, MY - WT), (WT, MY - WT)], F1, t=0.3, top="floor_wood")
    B.floor([(WX + WT, WT), (0.0, WT), (0.0, WY - WT), (WX + WT, WY - WT)], F1, t=0.3, top="tile_floor")
    # upper floor with the stair opening notched out along the north wall
    SX0, SX1, SY0 = 1.9, 4.95, 8.3
    B.floor([(WT, WT), (MX - WT, WT), (MX - WT, MY - WT), (SX1, MY - WT), (SX1, SY0), (SX0, SY0), (SX0, MY - WT), (WT, MY - WT)],
            F2, t=F2 - CEIL1, top="floor_wood")
    B.floor([(WX + WT, WT), (0.0, WT), (0.0, WY - WT), (WX + WT, WY - WT)], W_EAVE, t=W_EAVE - CEIL1, top="wood_old")
    B.floor([(WT, WT), (MX - WT, WT), (MX - WT, MY - WT), (WT, MY - WT)], CEIL2 + 0.1, t=0.1, top="wood_old")

    # ============================================================ interior partitions + doors
    B.inside = True
    # shared wall main/wing with a wide cased opening between living room and kitchen
    Msh, _ = B.partition((0.08, WY - WT), (0.08, WT), F1, CEIL1, t=WT, openings=[(2.84, 4.24, F1, F1 + 2.15)], mat="plaster_warm", mat_b="plaster_green")
    B.casing(Msh, 2.84, 4.24, F1, F1 + 2.15, WT, sill=False)
    # living room / office
    Mlo, _ = B.partition((WT, 5.2), (MX - WT, 5.2), F1, CEIL1, openings=[(3.5, 4.4, F1, F1 + DOOR_H)], mat="plaster", mat_b="plaster_warm")
    B.door("office", Mlo, 3.5, F1, w=0.9, h=DOOR_H, T=0.11, hinge="left", swing="in", style="panel", label="Office door")
    # kitchen / storage
    Mks, _ = B.partition((-5.95, WT), (-5.95, WY - WT), F1, CEIL1, openings=[(2.0, 2.9, F1, F1 + DOOR_H)], mat="plaster", mat_b="plaster_green")
    B.door("storage", Mks, 2.0, F1, w=0.9, h=DOOR_H, T=0.11, hinge="right", swing="in", style="panel", label="Storage door")
    # upper floor
    Mmu, _ = B.partition((WT, 4.35), (MX - WT, 4.35), F2, CEIL2, openings=[(4.25, 5.15, F2, F2 + DOOR_H)], mat="plaster", mat_b="plaster_blue")
    B.door("murph", Mmu, 4.25, F2, w=0.9, h=DOOR_H, T=0.11, hinge="left", swing="out", style="panel", label="Bedroom door")
    Mco, _ = B.partition((3.65, 4.35), (3.65, SY0), F2, CEIL2, openings=[(1.2, 2.1, F2, F2 + DOOR_H)], mat="plaster_warm", mat_b="plaster")
    B.door("cooper", Mco, 1.2, F2, w=0.9, h=DOOR_H, T=0.11, hinge="right", swing="in", style="panel", label="Bedroom door")
    B.partition((WT, SY0), (3.65, SY0), F2, CEIL2, mat="plaster", mat_b="plaster_warm")
    B.partition((SX0, SY0), (SX0, MY - WT), F2, CEIL2, mat="plaster")

    # stairs along the north wall, climbing east
    B.stairs((1.2, 8.77, F1), (1, 0), 0.9, F2 - F1, 15, run=0.25, rail="right")
    # guard rail on the upper hall along the stair opening
    for xg in (3.72, 4.15, 4.55, 4.92):
        I.box((0.035, 0.035, 0.92), at=(xg, SY0 + 0.03, F2 + 0.46), mat="wood_trim", bevel=0.004)
    I.box((1.3, 0.06, 0.05), at=(4.3, SY0 + 0.03, F2 + 0.94), mat="wood_dark", bevel=0.012)
    C.box((1.3, 0.06, 1.0), at=(4.3, SY0 + 0.03, F2 + 0.5), mat="concrete", bevel=0)

    # baseboards (skipped across door openings by construction of the segment lists)
    def base(a, b, z):
        M, L = B.wall_frame(a, b)
        I.box((L, 0.015, 0.11), M=M @ T((L / 2, 0.0075, z + 0.055)), mat="wood_trim", bevel=0.004)
    i0, i1 = WT, MX - WT
    for a, b, z in (((i0, i0), (0.4, i0), F1), ((1.4, i0), (i1, i0), F1), ((i1, i0), (i1, 5.145), F1), ((i1, 5.145), (4.45, 5.145), F1), ((3.45, 5.145), (i0, 5.145), F1),
                    ((i0, 5.145), (i0, 4.3), F1), ((i0, 2.8), (i0, i0), F1),
                    ((i0, 5.255), (3.45, 5.255), F1), ((4.45, 5.255), (i1, 5.255), F1), ((i1, 5.255), (i1, MY - WT - 1.0), F1), ((i0, MY - WT), (i0, 5.255), F1),
                    ((i0, i0), (i1, i0), F2), ((i1, i0), (i1, 4.295), F2), ((i0, 4.295), (i0, i0), F2), ((4.2, 4.295), (i0, 4.295), F2)):
        base(a, b, z)

    # ============================================================ furniture
    # ---- living room
    furn.rug(I, place(2.3, 3.4, F1), 3.0, 2.1)
    furn.sofa(I, C, place(2.0, 4.62, F1))
    furn.armchair(I, C, place(5.2, 3.3, F1, -90))
    furn.table(I, C, place(2.1, 3.3, F1), 1.15, 0.6, 0.42, legw=0.05)
    furn.dresser(I, C, place(3.65, 0.45, F1, 180), w=1.2, d=0.45, h=0.6, rows=1, cols=3)
    tvM = furn.monitor_crt(I, place(3.65, 0.45, F1 + 0.63, 180), w=0.62, mat="plastic_dark")
    furn.bookshelf(I, C, place(5.76, 4.45, F1, -90), w=1.1, h=2.0, seed=11)
    furn.table(I, C, place(3.55, 4.75, F1), 0.5, 0.5, 0.58, legw=0.04)
    furn.lamp_table(I, place(3.55, 4.75, F1 + 0.58))
    furn.picture(I, place(2.0, 5.13, F1 + 1.75, 0), 0.9, 0.6)
    furn.picture(I, place(5.92, 3.4, F1 + 1.7, -90), 0.45, 0.6, art="paint_cream")
    furn.lamp_ceiling(I, place(3.0, 2.7, CEIL1), drop=0.3)
    # ---- kitchen / dining
    furn.counter(I, C, place(-3.6, 5.52, F1), w=3.2, sink_at=0.6)
    furn.wall_cabinet(I, place(-3.92, 5.66, F1), w=0.78, z=1.5, h=0.75)
    furn.wall_cabinet(I, place(-2.28, 5.66, F1), w=0.52, z=1.5, h=0.75)
    furn.stove(I, C, place(-1.55, 5.5, F1))
    furn.fridge(I, C, place(-0.62, 5.42, F1))
    furn.table(I, C, place(-3.0, 2.4, F1), 2.1, 1.0, 0.76)
    for i, xx in enumerate((-3.7, -3.0, -2.3)):
        furn.chair(I, C, place(xx, 3.15, F1, rnd.uniform(-6, 6)))
        furn.chair(I, C, place(xx, 1.65, F1, 180 + rnd.uniform(-6, 6)))
    furn.chair(I, C, place(-4.35, 2.4, F1, 90))
    furn.wood_stove(I, C, place(-5.45, 3.2, F1, 90), pipe_h=CEIL1 - F1)
    furn.lamp_ceiling(I, place(-3.0, 2.4, CEIL1), drop=0.75, r=0.22)
    furn.lamp_ceiling(I, place(-3.0, 4.6, CEIL1), drop=0.25)
    furn.picture(I, place(-0.01, 4.6, F1 + 1.7, 90), 0.5, 0.4)
    # plates, mugs and a kettle so the kitchen reads as lived-in
    for (px, py) in ((-3.6, 2.6), (-2.5, 2.2), (-3.1, 2.15)):
        I.cyl(0.11, 0.015, at=(px, py, F1 + 0.77), mat="plastic_white", segs=18, bevel=0.004)
    for (px, py) in ((-3.35, 2.75), (-2.3, 2.45)):
        I.tube(0.04, 0.034, 0.09, at=(px, py, F1 + 0.805), mat="plastic_blue", segs=14, bevel=0.003)
    I.lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.07), (0.07, 0.15), (0.03, 0.17), (0.0, 0.17)], at=(-1.36, 5.52, F1 + 0.935), mat="metal_bare", segs=16)
    I.box((0.3, 0.2, 0.2), at=(-4.8, 5.55, F1 + 1.0), mat="plastic_dark", bevel=0.02)            # radio
    I.box((0.24, 0.01, 0.08), at=(-4.8, 5.445, F1 + 1.02), mat="metal_bare", bevel=0)
    marker("equip", "radio", at=(-4.8, 5.5, F1 + 1.0), label="Radio")
    # ---- storage / mud room
    furn.shelf_unit(I, C, place(-6.95, 5.58, F1), w=1.5, seed=3)
    furn.shelf_unit(I, C, place(-7.5, 0.42, F1, 180), w=1.7, seed=8)
    I.box((1.3, 0.66, 0.86), at=(-6.4, 1.55, F1 + 0.43), rot=(0, 0, 90), mat="paint_white", bevel=0.03)       # chest freezer
    C.box((0.66, 1.3, 0.86), at=(-6.4, 1.55, F1 + 0.43), mat="concrete", bevel=0)
    furn.crate(I, C, place(-8.4, 2.6, F1, 12))
    furn.crate(I, C, place(-8.35, 2.62, F1 + 0.4, -8), 0.5, 0.4, 0.3, mat="canvas")
    furn.barrel(I, C, place(-8.4, 3.45, F1), mat="paint_blue")
    for k in range(4):                                                                              # coats on a rail
        I.box((0.08, 0.42, 0.75), at=(-8.72, 5.25 + 0.0 * k, F1 + 1.35), rot=(0, 0, 0), mat=["cloth_khaki", "cloth_denim", "cloth_plaid", "cloth_navy"][k], bevel=0.03) if k == 0 else None
    I.box((0.05, 1.2, 0.04), at=(-6.02, 4.7, F1 + 1.75), mat="wood_dark", bevel=0.006)
    for k in range(4):
        I.box((0.1, 0.4, 0.8), at=(-6.1, 4.25 + k * 0.3, F1 + 1.3), rot=(0, 0, rnd.uniform(-8, 8)), mat=["cloth_khaki", "cloth_denim", "cloth_plaid", "cloth_navy"][k], bevel=0.04)
    furn.lamp_ceiling(I, place(-7.4, 3.0, CEIL1), drop=0.2, r=0.13)
    # ---- farm office
    furn.rug(I, place(2.6, 6.8, F1), 2.4, 1.7, mat="fabric_blue")
    furn.desk(I, C, place(0.58, 6.85, F1, 90), w=1.6)
    furn.chair(I, C, place(1.3, 6.85, F1, -90))
    lapM = furn.laptop(I, place(0.6, 6.7, F1 + 0.75, 90))
    furn.monitor_crt(I, place(0.52, 7.35, F1 + 0.75, 90), w=0.36)
    marker("terminal", "farm_office", at=(0.75, 6.75, F1 + 0.9), rot=(0, 0, 90), label="Farm management computer")
    furn.dresser(I, C, place(0.45, 5.62, F1, 90), w=0.5, d=0.6, h=1.3, rows=4, cols=1, mat="paint_gray")
    furn.bookshelf(I, C, place(2.2, 5.42, F1, 180), w=1.3, h=2.0, seed=21)
    furn.table(I, C, place(4.9, 6.6, F1, 90), 1.5, 0.8, 0.76, top="wood_old")
    furn.picture(I, place(5.92, 6.0, F1 + 1.6, -90), 1.1, 0.8, art="paint_tan")         # county survey map
    furn.picture(I, place(3.0, 5.27, F1 + 1.75, 180), 0.5, 0.4)
    furn.lamp_ceiling(I, place(2.8, 6.8, CEIL1), drop=0.3)
    furn.lamp_table(I, place(0.45, 6.2, F1 + 0.75))
    for k in range(5):                                                                    # ledgers and seed sample boxes
        I.box((0.3, 0.22, 0.03), at=(4.9 + rnd.uniform(-0.1, 0.1), 6.2 + k * 0.17, F1 + 0.78 + k * 0.001), rot=(0, 0, rnd.uniform(-20, 20)), mat=rnd.choice(["cloth_navy", "paint_tan", "cloth_khaki"]), bevel=0.004)
    furn.crate(I, C, place(2.2, 8.75, F1, 4), 0.7, 0.5, 0.4)                              # under-stair storage
    furn.crate(I, C, place(3.0, 8.78, F1, -5), 0.6, 0.5, 0.5, mat="canvas")
    furn.crate(I, C, place(3.7, 8.75, F1, 2), 0.7, 0.5, 0.45)
    # ---- Murph's room (the bookshelf wall)
    for k, xx in enumerate((0.85, 2.05, 3.25)):
        furn.bookshelf(I, C, place(xx, 4.13, F2), w=1.2, h=2.25, shelves=6, seed=31 + k, fill=0.93)
    furn.bed(I, C, place(4.95, 1.75, F2), w=1.1, blanket="fabric_red")
    furn.desk(I, C, place(2.75, 0.55, F2, 180), w=1.3)
    furn.chair(I, C, place(2.75, 1.25, F2, 0))
    furn.lamp_table(I, place(3.2, 0.5, F2 + 0.75))
    furn.dresser(I, C, place(0.45, 2.8, F2, 90), w=1.0)
    furn.rug(I, place(2.6, 2.5, F2), 2.2, 1.5, mat="fabric_blue")
    furn.lamp_ceiling(I, place(2.9, 2.2, CEIL2), drop=0.3)
    furn.picture(I, place(5.92, 3.4, F2 + 1.6, -90), 0.4, 0.5, art="paint_cream")
    # model lunar lander on the desk (a nod to the film's opening)
    lm = place(2.35, 0.55, F2 + 0.75)
    I.cyl(0.05, 0.05, M=lm @ T((0, 0, 0.09)), mat="metal_brass", segs=8, bevel=0.004)
    I.box((0.06, 0.06, 0.05), M=lm @ T((0, 0, 0.14)), mat="metal_bare", bevel=0.008)
    for a in range(4):
        I.cyl(0.004, 0.11, M=lm @ R(a * 90 + 45) @ T((0.06, 0, 0.045)) @ R(35, "Y"), mat="metal_bare", segs=5, bevel=0)
        I.cyl(0.015, 0.004, M=lm @ R(a * 90 + 45) @ T((0.09, 0, 0.003)), mat="metal_brass", segs=8, bevel=0)
    # ---- Cooper's room
    furn.bed(I, C, place(1.3, 6.1, F2, 90), w=1.45, blanket="cloth_khaki")
    furn.dresser(I, C, place(2.0, 8.02, F2, 0), w=1.2)
    furn.table(I, C, place(0.5, 7.25, F2), 0.45, 0.45, 0.55, legw=0.04)
    furn.lamp_table(I, place(0.5, 7.25, F2 + 0.55))
    furn.chair(I, C, place(3.2, 4.85, F2, 150))
    furn.lamp_ceiling(I, place(1.9, 6.3, CEIL2), drop=0.25)
    furn.picture(I, place(0.17, 5.0, F2 + 1.6, 90), 0.5, 0.4)
    # ---- upper hall
    furn.lamp_ceiling(I, place(4.8, 6.4, CEIL2), drop=0.2, r=0.13)
    furn.table(I, C, place(5.55, 5.2, F2), 0.5, 0.4, 0.75, legw=0.04)

    # ceiling fan in the living room (blades are a separate spinning part)
    I.cyl(0.06, 0.25, at=(1.5, 1.9, CEIL1 - 0.125), mat="metal_brass", segs=12, bevel=0.004)
    I.cyl(0.1, 0.1, at=(1.5, 1.9, CEIL1 - 0.3), mat="metal_brass", segs=14, bevel=0.01)
    FB = Part("farmhouse_fan")
    for a in range(4):
        FB.box((0.55, 0.13, 0.012), M=R(a * 90) @ T((0.4, 0, 0)) @ R(10, "X"), mat="wood_dark", bevel=0.004)
        FB.box((0.16, 0.04, 0.008), M=R(a * 90) @ T((0.12, 0, 0)), mat="metal_brass", bevel=0)
    fan = FB.finish(at=(1.5, 1.9, CEIL1 - 0.32))
    props(fan, kind="fan", id="living", part="fan_living", dynamic=1, col=0, shadow=0)

    # ============================================================ lights, switches, markers
    def room_light(rid, x, y, z, power=55, dist=7.5, color=(1.0, 0.86, 0.66)):
        light(f"{rid}", (x, y, z), color=color, power=power, dist=dist, room=rid, group="farmhouse")

    def switch(rid, x, y, z, rz, label):
        furn.switch_plate(I, T((x, y, z)) @ R(rz))
        marker("switch", rid, at=(x, y, z), rot=(0, 0, rz), room=rid, label=label)

    room_light("living", 3.0, 2.7, CEIL1 - 0.4, power=70, dist=8.5)
    room_light("kitchen", -3.0, 2.4, CEIL1 - 0.85, power=75, dist=8.5)
    room_light("kitchen", -3.0, 4.6, CEIL1 - 0.35, power=40, dist=6)
    room_light("storage", -7.4, 3.0, CEIL1 - 0.3, power=35, dist=6, color=(1.0, 0.9, 0.75))
    room_light("office", 2.8, 6.8, CEIL1 - 0.4, power=60, dist=7.5)
    room_light("murph", 2.9, 2.2, CEIL2 - 0.4, power=60, dist=7.5)
    room_light("cooper", 1.9, 6.3, CEIL2 - 0.35, power=55, dist=7)
    room_light("hall", 4.8, 6.4, CEIL2 - 0.3, power=35, dist=6)
    room_light("porch", 1.7, -0.14, 2.3, power=22, dist=6)
    room_light("porch", -2.9, -0.14, 2.3, power=22, dist=6)
    room_light("porch", WX - 0.14, 3.75, 2.3, power=18, dist=5)
    switch("living", 1.6, WT + 0.004, F1 + 1.25, 180, "Living room lights")
    switch("kitchen", -3.05, WT + 0.004, F1 + 1.25, 180, "Kitchen lights")
    switch("storage", -6.01, 3.15, F1 + 1.25, 90, "Storage light")
    switch("office", 4.6, 5.26, F1 + 1.25, 180, "Office lights")
    switch("murph", 5.4, 4.29, F2 + 1.25, 0, "Bedroom light")
    switch("cooper", 3.59, 5.35, F2 + 1.25, -90, "Bedroom light")
    switch("hall", 5.3, 4.41, F2 + 1.25, 180, "Hall light")
    switch("porch", 0.25, WT + 0.004, F1 + 1.25, 180, "Porch lights")
    marker("equip", "tv", at=(3.65, 0.6, F1 + 0.95), label="Television")
    marker("spawn", "farm", at=(1.0, -9.5, 0.0), rot=(0, 0, 0))
    marker("spawn", "porch", at=(0.9, -1.4, DECK), rot=(0, 0, 0))
    marker("bed", "cooper", at=(1.3, 6.1, F2 + 0.6), label="Rest")
    for i, (x, y, z) in enumerate(((0.9, -4.5, 0), (0.9, -1.3, DECK), (0.9, 1.2, F1), (2.6, 2.0, F1), (0.9, 3.0, F1), (-1.0, 2.3, F1), (-3.0, 4.0, F1),
                                   (-3.65, 1.0, F1), (-3.65, -1.3, DECK), (-3.65, -4.5, 0), (3.95, 4.6, F1), (3.95, 5.9, F1), (2.5, 7.4, F1))):
        marker("nav", f"house{i}", at=(x, y, z))

    # ============================================================ finish
    ext = E.finish(sharp=35, col=0)
    inte = I.finish(sharp=35, col=0)
    glass = B.glass.finish(sharp=35, col=0, shadow=0)
    col = C.finish(weighted=False, colonly=1)
    props(ext, part="exterior")
    props(inte, part="interior")
    print("  tris ext/int:", sum(len(p.vertices) - 2 for p in ext.data.polygons), sum(len(p.vertices) - 2 for p in inte.data.polygons))
    bake_ao([ext, inte] + [o for o in B.dyn] + [vane, fan], ground_z=0.0)
    return ext


if __name__ == "__main__":
    build()
    if PREVIEW:
        # the two reference viewpoints: image 2 (close, from the south-west) and image 1 (distant, more frontal)
        preview("farmhouse_ref2", (-13.5, -22.0, 1.7), (-1.0, 2.0, 3.6), res=(1400, 700), lens=50, samples=48, sun_rot=(58, 0, 200), sun=2.2, sky=(0.55, 0.62, 0.7))
        preview("farmhouse_ref1", (26.0, -48.0, 2.2), (-1.0, 3.0, 4.2), res=(1400, 600), lens=85, samples=32, sun_rot=(50, 0, 150), sun=3.5)
        preview("farmhouse_top", (-1.5, 3.0, 40.0), (-1.5, 3.01, 0), res=(1100, 800), ortho=24, samples=24)
        kw = dict(res=(960, 600), lens=18, samples=64, sun_rot=(55, 0, 200), sun=4.0, sky=(0.8, 0.85, 0.95), sky_strength=6.0, exposure=1.0)
        preview("farmhouse_in_living", (5.3, 0.8, F1 + 1.6), (1.0, 4.6, F1 + 1.0), **kw)
        preview("farmhouse_in_kitchen", (-0.6, 0.8, F1 + 1.6), (-4.6, 4.8, F1 + 1.0), **kw)
        preview("farmhouse_in_office", (5.5, 5.6, F1 + 1.6), (0.6, 7.6, F1 + 0.9), **kw)
        preview("farmhouse_in_murph", (5.5, 0.6, F2 + 1.6), (1.2, 4.2, F2 + 1.1), **kw)
    export_glb("farmhouse")
    save_blend("farmhouse")
