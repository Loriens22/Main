"""The concealed NASA facility inside the mountain (a repurposed air-defence station).

Local frame of every model in this file: origin at the tunnel portal on the forecourt floor, +Y along
the tunnel axis into the mountain, +X to the right, +Z up. Site constants come from shared/nasa_site.json
(written by tests/nasa_site.test.ts from the terrain).

  nasa_complex.glb  portal headwall, entrance tunnel with blast door, vehicle bay, spine corridor and rooms
  nasa_launch.glb   assembly hall, launch cavern with service levels, gantry, cargo lift, silo shaft and doors
  nasa_props.glb    perimeter kit placed by the engine: fence, gate, booth, barriers, cameras, floodlights
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from fac import Fac, at, RX, RY, RZ, T  # noqa: E402
from arch import frame_matrix  # noqa: E402
import furn  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

SITE = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "shared", "nasa_site.json")))
SILO_Y = float(SITE["siloAlong"])
SILO_TOP = float(SITE["siloTop"])

# entrance tunnel cross-section (x, z), listed clockwise seen from the portal so faces point inward
TUN_W, TUN_H = 4.2, 6.2
TUN_PROFILE = [(-TUN_W, 0.0), (-TUN_W, 4.4), (-2.6, TUN_H), (2.6, TUN_H), (TUN_W, 4.4), (TUN_W, 0.0)]


def liner(P, profile, y0, y1, mat, step=2.0, close=False):
    """Extrude an open (x, z) profile along +Y as an inward-facing shell."""
    pts = []
    for a, b in zip(profile[:-1], profile[1:]):
        n = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step)))
        for k in range(n):
            pts.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    pts.append(profile[-1])
    ny = max(1, int(math.ceil((y1 - y0) / step)))
    verts, faces = [], []
    for j in range(ny + 1):
        y = y0 + (y1 - y0) * j / ny
        verts += [(x, y, z) for (x, z) in pts]
    m = len(pts)
    for j in range(ny):
        for i in range(m - 1):
            a, b, c, d = j * m + i, j * m + i + 1, (j + 1) * m + i + 1, (j + 1) * m + i
            faces.append((a, d, c, b))
    P.mesh(verts, faces, mat=mat, bevel=0, recalc=False, smooth=False)


def plant(P, M, h=0.9, rnd=random, dry=False):
    """Small crop plant from crossed leaf blades."""
    mat = "leaf_corn_dry" if dry else "leaf_corn"
    P.cyl(0.012, h, M=M @ T((0, 0, h / 2)), mat="stalk_corn", segs=5, bevel=0, caps=False)
    for k in range(rnd.randint(4, 6)):
        a = rnd.uniform(0, 360)
        z = h * rnd.uniform(0.25, 0.95)
        L = rnd.uniform(0.3, 0.55)
        tilt = rnd.uniform(25, 60)
        Ml = M @ T((0, 0, z)) @ RZ(a) @ RY(-tilt)
        v = [(0, -0.03, 0), (L * 0.5, -0.045, 0.02), (L, 0, -0.06), (L * 0.5, 0.045, 0.02), (0, 0.03, 0)]
        P.mesh(v, [(0, 1, 2, 3, 4)], mat=mat, M=Ml, bevel=0, smooth=True)


# =====================================================================================================
def complex_glb():
    reset()
    rnd = random.Random(11)
    F = Fac("nasa", cell=2.0)
    S, C = F.S, F.C
    D, E, G = F.section("tunnel")

    # ------------------------------------------------------------------ portal headwall (exterior)
    out = [(-13, 0), (-TUN_W, 0), (-TUN_W, 4.4), (-2.6, TUN_H), (2.6, TUN_H), (TUN_W, 4.4), (TUN_W, 0), (13, 0), (13, 13.5), (9.5, 17), (-9.5, 17), (-13, 13.5)]
    X = Part("nasa_portal")
    X.prism(out, 1.6, plane="XZ", at=(0, 1.4, 0), mat="concrete_panels", bevel=0.03)
    # board-marked pilasters and a heavy lintel band over the opening
    for x in (-5.6, 5.6, -12.2, 12.2):
        X.box((1.4, 0.5, 13.0), at=(x, -0.45, 6.5), mat="concrete", bevel=0.05)
    X.box((13.0, 0.6, 1.3), at=(0, -0.5, 7.4), mat="concrete", bevel=0.06)
    X.box((26.4, 0.7, 0.5), at=(0, -0.35, 13.6), mat="concrete_dark", bevel=0.05)
    # wing walls stepping down along the cut, and the slab that closes the cut above the tunnel mouth
    for s in (-1, 1):
        wv = [(s * 13, -0.2, 0), (s * 19.5, -17, 0), (s * 19.5, -17, 3.2), (s * 13, -0.2, 13.5), (s * 13.9, 0.4, 0), (s * 20.4, -16.4, 0), (s * 20.4, -16.4, 3.2), (s * 13.9, 0.4, 13.5)]
        X.mesh(wv, [(0, 1, 2, 3), (7, 6, 5, 4), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)], mat="concrete_panels", bevel=0)
        C.mesh(wv, [(0, 1, 2, 3), (7, 6, 5, 4), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)], mat="concrete", bevel=0)
    X.mesh([(-10, 1.2, 16.9), (10, 1.2, 16.9), (10, 15.5, 37), (-10, 15.5, 37)], [(0, 1, 2, 3)], mat="rock", bevel=0)
    C.box((26, 1.6, 17), at=(-8.6 - 4.4, 0.6, 8.5), mat="concrete", bevel=0)
    C.box((26, 1.6, 17), at=(8.6 + 4.4, 0.6, 8.5), mat="concrete", bevel=0)
    C.box((8.4, 1.6, 10.8), at=(0, 0.6, 11.6), mat="concrete", bevel=0)
    # stencilled marking, a faded number: minimal identification
    X.text("FACILITY 7", size=0.55, at=(0, -0.81, 7.4), rot=(90, 0, 0), mat="concrete_dark", depth=0.004)
    X.text("AUTHORIZED VEHICLES ONLY", size=0.2, at=(0, -0.81, 6.95), rot=(90, 0, 0), mat="concrete_dark", depth=0.003)
    # floodlights and cameras over the mouth
    for x in (-6.9, 6.9):
        X.box((0.5, 0.3, 0.32), at=(x, -0.85, 8.5), rot=(35, 0, 0), mat="metal_dark", bevel=0.02)
        E.box((0.42, 0.02, 0.24), at=(x, -0.98, 8.42), rot=(35, 0, 0), mat="emit_warm", bevel=0)
        light(f"portal_flood{x:+.0f}", at=(x, -3.0, 7.6), color=(1.0, 0.88, 0.7), power=60, dist=30, kind="spot", rot=(-35, 0, 0), group="nasa", bake=0)
        F.camera(at(x * 0.55, -0.72, 6.9, 0))

    # ------------------------------------------------------------------ entrance tunnel
    liner(S, TUN_PROFILE, 0.0, 70.2, "concrete_panels")
    F.floor(-TUN_W, 0.0, TUN_W, 70.2, 0.0, "asphalt", t=0.6)
    for s in (-1, 1):
        # kerb walkways, wall footing collision and lane edge line
        D.box((0.9, 70.2, 0.16), at=(s * (TUN_W - 0.45), 35.1, 0.08), mat="concrete", bevel=0.02)
        D.box((0.12, 70.2, 0.006), at=(s * 3.1, 35.1, 0.004), mat="paint_white", bevel=0)
        C.box((0.6, 70.2, 6.4), at=(s * (TUN_W + 0.3), 35.1, 3.2), mat="concrete", bevel=0)
        C.box((0.9, 70.2, 0.16), at=(s * (TUN_W - 0.45), 35.1, 0.08), mat="concrete", bevel=0)
    C.box((9.2, 70.2, 0.5), at=(0, 35.1, TUN_H + 0.25), mat="concrete", bevel=0)
    for k in range(9):
        D.box((0.14, 2.6, 0.006), at=(0, 4 + k * 7.6, 0.004), mat="paint_yellow", bevel=0)
    for k in range(9):
        y = 5.0 + k * 7.6
        F.strip(0, y, TUN_H, yaw=90, L=1.5, power=16, dist=10, bake=70)
        # ribs
        liner(D, [(-TUN_W + 0.02, 0.16), (-TUN_W + 0.02, 4.42), (-2.62, TUN_H - 0.02), (2.62, TUN_H - 0.02), (TUN_W - 0.02, 4.42), (TUN_W - 0.02, 0.16)], y + 3.6, y + 4.0, "concrete_dark", step=9)
    F.tray((-3.55, 0.6, 5.2), (-3.55, 69.6, 5.2), w=0.45, cables=6)
    F.pipe([(3.95, 0.6, 3.6), (3.95, 69.6, 3.6)], r=0.11, mat="paint_red")
    F.pipe([(3.98, 0.6, 3.2), (3.98, 69.6, 3.2)], r=0.07, mat="paint_gray")
    F.sign(at(4.14, 14, 2.4, -90), "SPEED 10", w=1.1, h=0.4, bg="paint_yellow")
    F.sign(at(-4.14, 20, 2.4, 90), "BLAST DOOR AHEAD — STOP ON RED", w=2.6, h=0.36, bg="paint_white")
    F.camera(at(4.1, 22, 4.6, -90) @ RZ(-55))

    # blast door: a 25-tonne steel leaf that rolls into a pocket in the rock
    Mb = frame_matrix((-TUN_W, 28.0 - 0.5, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    F.slide("blast_outer", Mb, 0.0, 0.0, 2 * TUN_W, TUN_H, t=1.0, thick=0.7, travel=2 * TUN_W + 0.3, label="Blast door", mat="paint_gray_dark", auto=24.0, time=7.0, sound="blast")
    for s in (-1, 1):
        D.box((0.5, 1.5, TUN_H), at=(s * (TUN_W - 0.02), 28.0, TUN_H / 2), mat="metal_dark", bevel=0.03)
        for z in (2.2, 4.0):
            E.box((0.2, 0.05, 0.2), at=(s * 3.6, 27.2, z), mat="emit_amber", bevel=0.02)
    D.box((2 * TUN_W, 1.5, 0.4), at=(0, 28.0, TUN_H - 0.2), mat="metal_dark", bevel=0.03)
    D.box((2 * TUN_W, 1.0, 0.03), at=(0, 28.0, 0.015), mat="tread_plate", bevel=0)

    # ------------------------------------------------------------------ vehicle bay
    D, E, G = F.section("bay")
    BX, BY0, BY1, BH = 18.0, 70.4, 110.0, 7.5
    fr = F.room(-BX, BY0, BX, BY1, 0, BH, doors={"s": [(BX - TUN_W, 2 * TUN_W, TUN_H)], "n": [(BX - 1.6, 3.2, 3.0)]}, floor="concrete_floor")
    F.slide("bay_inner", fr["n"][0], fr["n"][1][0][0], 0, 3.2, 3.0, t=0.4, thick=0.16, label="Security door", auto=4.5, time=1.8)
    F.sign(at(0, BY1 - 0.21, 3.6, 0), "LEVEL 1 — RESEARCH COMPLEX", w=3.4, h=0.42)
    for (cx, cy) in [(-9, 80), (9, 80), (-9, 92), (9, 92), (-9, 104), (9, 104)]:
        S.box((0.9, 0.9, BH), at=(cx, cy, BH / 2), mat="concrete", bevel=0.06)
        D.box((0.94, 0.94, 1.1), at=(cx, cy, 0.55), mat="paint_yellow", bevel=0.05)
        C.box((0.9, 0.9, BH), at=(cx, cy, BH / 2), mat="concrete", bevel=0)
    for (lx, ly) in [(-13.5, 77), (-4.5, 77), (4.5, 77), (13.5, 77), (-13.5, 89), (-4.5, 89), (4.5, 89), (13.5, 89), (-13.5, 101), (-4.5, 101), (4.5, 101), (13.5, 101)]:
        F.highbay(lx, ly, BH, drop=0.9, power=30, dist=20, bake=150)
    # parking bays along the west wall, maintenance area along the east wall
    for k in range(5):
        D.box((5.6, 0.12, 0.006), at=(-14.9, 76 + k * 3.4, 0.004), mat="paint_white", bevel=0)
    D.text("PARKING", size=0.7, at=(-10.6, 83, 0.005), rot=(0, 0, 90), mat="paint_white", depth=0.002)
    marker("park", "nasa_a", at=(-14.4, 77.7, 0), rot=(0, 0, 90))
    marker("park", "nasa_b", at=(-14.4, 84.5, 0), rot=(0, 0, 90))
    marker("park", "player", at=(-14.4, 88.0, 0), rot=(0, 0, 90))
    # two-post vehicle lift, tyre rack, tool chests, drums
    for s in (-1, 1):
        D.box((0.28, 0.4, 3.6), at=(12.3 + s * 1.55, 84, 1.8), mat="paint_blue", bevel=0.02)
        D.box((1.1, 0.12, 0.1), at=(12.3 + s * 0.9, 84, 0.3), mat="paint_gray_dark", bevel=0.01)
        C.box((0.28, 0.4, 3.6), at=(12.3 + s * 1.55, 84, 1.8), mat="concrete", bevel=0)
    D.box((3.4, 0.2, 0.2), at=(12.3, 84, 3.7), mat="paint_blue", bevel=0.02)
    F.bench(at(16.9, 79, 0, -90), w=3.0)
    F.bench(at(16.9, 89.5, 0, -90), w=2.6)
    for k in range(3):
        F.locker(at(17.3, 94 + k * 1.3, 0, -90), n=1, w=1.1, d=0.6, h=1.1, mat="paint_red")
    for k in range(4):
        for j in range(3):
            D.tube(0.37, 0.2, 0.24, at=(15.8 + (k % 2) * 0.82, 98.6 + (k // 2) * 0.82, 0.13 + j * 0.25), mat="rubber", segs=18, bevel=0.05)
    C.box((1.7, 1.7, 0.8), at=(16.2, 99.0, 0.4), mat="concrete", bevel=0)
    for (dx, dy) in [(16.6, 74.2), (15.9, 74.4), (16.4, 75.1)]:
        F.drum(at(dx, dy, 0), mat=rnd.choice(["paint_blue", "paint_red", "paint_olive"]))
    F.pipe([(17.75, 71, 5.6), (17.75, 109.5, 5.6)], r=0.14, mat="paint_gray")
    F.duct((-17.4, 71, 6.6), (-17.4, 109.5, 6.6), w=0.9, h=0.6)
    F.tray((0, 71, 6.9), (0, 109.6, 6.9), w=0.5, cables=6)
    # security checkpoint at the inner door: booth, desk, barrier posts
    D.box((3.2, 2.6, 0.1), at=(5.2, 107.4, 2.75), mat="paint_gray", bevel=0.02)
    for (px, py) in [(3.65, 106.15), (6.75, 106.15), (3.65, 108.65), (6.75, 108.65)]:
        D.box((0.1, 0.1, 2.7), at=(px, py, 1.35), mat="paint_gray_dark", bevel=0.01)
    D.box((3.0, 0.08, 1.0), at=(5.2, 106.15, 0.5), mat="paint_gray", bevel=0.01)
    D.box((0.08, 2.4, 1.0), at=(6.75, 107.4, 0.5), mat="paint_gray", bevel=0.01)
    G.box((3.0, 0.01, 1.6), at=(5.2, 106.15, 1.85), mat="glass", bevel=0)
    C.box((3.2, 0.12, 2.7), at=(5.2, 106.15, 1.35), mat="concrete", bevel=0)
    C.box((0.12, 2.6, 2.7), at=(6.75, 107.4, 1.35), mat="concrete", bevel=0)
    F.console(at(5.2, 107.0, 0, 180), w=1.8, sid="sec_bay", screens=2)
    marker("work", "guard_booth", at=(5.2, 107.9, 0), rot=(0, 0, 180), pose="operate", role="guard")
    marker("work", "guard_door", at=(-2.6, 107.6, 0), rot=(0, 0, 180), pose="stand", role="guard")
    for x in (-2.2, 2.2):
        D.cyl(0.09, 1.0, at=(x, 105.2, 0.5), mat="paint_yellow", segs=12, bevel=0.01)
        C.cyl(0.1, 1.0, at=(x, 105.2, 0.5), mat="concrete", segs=8, bevel=0)
    F.camera(at(-1.9, BY1 - 0.2, 4.4, 0) @ RZ(20))
    F.camera(at(17.8, 72, 5.0, -90) @ RZ(40))
    F.sign(at(-17.79, 90, 3.0, 90), "VEHICLE BAY", w=2.6, h=0.5)
    F.sign(at(17.79, 86, 4.4, -90), "MAINTENANCE", w=2.4, h=0.42, bg="paint_yellow")

    # ------------------------------------------------------------------ spine corridor and rooms
    D, E, G = F.section("corridor")
    CY0, CY1, CW, CH = 110.2, 232.0, 2.5, 4.2
    # id, side, y0, y1, depth, height, doors [(y centre, width, kind)], wall, floor, sign
    ROOMS = [
        ("security", -1, 111.0, 121.0, 9.0, 3.4, [(116.0, 1.1, "hinge")], "concrete_panels", "concrete_floor", "SECURITY"),
        ("briefing", -1, 121.4, 137.0, 13.0, 3.6, [(129.0, 1.6, "slide")], "plaster_blue", "floor_panel_dark", "CREW BRIEFING"),
        ("mission", -1, 137.4, 166.0, 20.0, 6.5, [(141.0, 1.8, "slide"), (162.0, 1.8, "slide")], "concrete_panels", "floor_panel_dark", "MISSION CONTROL"),
        ("computer", -1, 166.4, 180.0, 13.0, 3.6, [(173.0, 1.4, "slide")], "plastic_white", "floor_panel", "COMPUTER CENTER"),
        ("astro", -1, 180.4, 198.0, 14.0, 4.0, [(189.0, 1.6, "slide")], "plaster_blue", "floor_panel_dark", "OBSERVATION & ASTROPHYSICS"),
        ("utility", -1, 198.4, 231.6, 8.0, 4.2, [(203.0, 1.1, "hinge")], "concrete", "concrete_floor", "UTILITIES — PLANT"),
        ("storage", 1, 111.0, 124.0, 12.0, 3.6, [(117.5, 1.6, "slide")], "concrete_panels", "concrete_floor", "EQUIPMENT STORAGE"),
        ("workshop", 1, 124.4, 144.0, 14.0, 4.4, [(134.0, 2.2, "slide")], "concrete_panels", "concrete_floor", "ENGINEERING WORKSHOP"),
        ("lab", 1, 144.4, 162.0, 13.0, 3.6, [(153.0, 1.4, "slide")], "tile_white", "tile_floor", "PATHOLOGY LABORATORY"),
        ("greenhouse", 1, 162.4, 190.0, 16.0, 5.0, [(167.0, 1.6, "slide"), (185.5, 1.6, "slide")], "tile_white", "concrete_floor", "EXPERIMENTAL GREENHOUSE"),
        ("lifesupport", 1, 190.4, 208.0, 13.0, 4.6, [(199.0, 1.6, "slide")], "concrete_panels", "concrete_floor", "LIFE SUPPORT"),
        ("crew", 1, 208.4, 231.6, 13.0, 3.6, [(220.0, 1.6, "slide")], "plaster_blue", "floor_panel_tan", "CREW PREPARATION"),
    ]
    cdoors = {"e": [], "w": [], "n": [(CW - 2.0, 4.0, 3.6)]}
    for (rid, side, y0, y1, dep, h, doors, wm, fm, label) in ROOMS:
        for (yc, w, kind) in doors:
            cdoors["e" if side > 0 else "w"].append((yc - w / 2 - CY0, w, 2.3))
    cf = F.room(-CW, CY0, CW, CY1, 0, CH, doors=cdoors, skip="s", floor="concrete_floor")
    F.slide("hall_door", cf["n"][0], cf["n"][1][0][0], 0, 4.0, 3.6, t=0.4, thick=0.3, label="Launch complex", auto=7.0, time=3.5, mat="paint_gray_dark", sound="blast")
    F.sign(at(0, CY1 - 0.21, 3.9, 0), "LAUNCH COMPLEX", w=2.6, h=0.4, bg="paint_yellow")
    # corridor dressing: lights, services, floor guide lines, nav nodes
    n = int((CY1 - CY0) / 6.0)
    for k in range(n):
        y = CY0 + 3.0 + k * 6.0
        F.strip(0, y, CH, yaw=90, L=1.4, power=13, dist=8, bake=48)
    F.pipe([(-2.2, CY0 + 0.3, 3.75), (-2.2, CY1 - 0.3, 3.75)], r=0.09, mat="paint_blue")
    F.pipe([(-2.25, CY0 + 0.3, 3.45), (-2.25, CY1 - 0.3, 3.45)], r=0.06, mat="paint_gray")
    F.tray((2.05, CY0 + 0.3, 3.8), (2.05, CY1 - 0.3, 3.8), w=0.4, cables=5)
    D.box((0.1, CY1 - CY0 - 1, 0.005), at=(-1.2, (CY0 + CY1) / 2, 0.003), mat="paint_blue", bevel=0)
    D.box((0.1, CY1 - CY0 - 1, 0.005), at=(1.2, (CY0 + CY1) / 2, 0.003), mat="paint_yellow", bevel=0)
    for k in range(int((CY1 - CY0) / 8) + 1):
        marker("nav", f"c{k}", at=(0, CY0 + 2 + k * 8.0, 0))
    marker("nav", "bay0", at=(0, 107.5, 0), links="c0,bay1,bay2")
    marker("nav", "bay1", at=(-6, 96, 0), links="bay2")
    marker("nav", "bay2", at=(6, 96, 0))
    marker("nav", "bay3", at=(0, 80, 0), links="bay1,bay2")
    marker("spawn", "bay", at=(-8.5, 88, 0), rot=(0, 0, 0))

    frames = {}
    for (rid, side, y0, y1, dep, h, doors, wm, fm, label) in ROOMS:
        x0, x1 = (CW + 0.4, CW + 0.4 + dep) if side > 0 else (-CW - 0.4 - dep, -CW - 0.4)
        wside = "w" if side > 0 else "e"
        fr = F.room(x0, y0, x1, y1, 0, h, wall=wm, floor=fm, doors={wside: [(yc - w / 2 - y0, w, 2.3) for (yc, w, kind) in doors]})
        frames[rid] = (x0, x1, y0, y1, h)
        cside = "e" if side > 0 else "w"
        Mc, ops = cf[cside]
        for i, (yc, w, kind) in enumerate(doors):
            # the matching opening in the corridor wall
            u0 = next(o[0] for o in ops if abs(((CY1 - CY0) - o[0] - w / 2 if cside == "w" else o[0] + w / 2) - (yc - CY0)) < 0.01)
            did = rid if i == 0 else f"{rid}{i + 1}"
            if kind == "slide":
                F.slide(did, Mc, u0, 0, w, 2.3, t=0.4, thick=0.07, label=label.title(), auto=2.6, time=0.9, stripe=False, sound="door_slide")
            else:
                F.door(did, Mc, u0, 0, w=w, h=2.3, t=0.4, label=label.title(), swing="out")
            D.box((w + 0.3, 0.84, 0.012), at=(side * (CW + 0.2), yc, 0.006), mat="tread_plate", bevel=0)
            F.sign(at(side * (CW - 0.21), yc, 2.72, -90 * side), label, w=min(3.2, 0.2 + 0.16 * len(label)), h=0.26)
            E.box((0.02, 0.1, 0.05), at=(side * (CW - 0.2), yc + w / 2 + 0.25, 1.35), mat="emit_green", bevel=0)
            marker("nav", f"d_{did}_c", at=(side * 1.2, yc, 0), links=f"d_{did}_r")
            marker("nav", f"d_{did}_r", at=(side * (CW + 2.0), yc, 0))

    def R(rid):
        return frames[rid]

    def grid_lights(rid, nx, ny, power=13, bake=46, dist=8, yaw=90):
        x0, x1, y0, y1, h = R(rid)
        for i in range(nx):
            for j in range(ny):
                F.strip(x0 + (x1 - x0) * (i + 0.5) / nx, y0 + (y1 - y0) * (j + 0.5) / ny, h, yaw=yaw, power=power, bake=bake, dist=dist)

    # ---- security office
    D, E, G = F.section("security")
    x0, x1, y0, y1, h = R("security")
    grid_lights("security", 2, 2)
    F.console(at(x0 + 2.4, y0 + 1.0, 0, 180) @ RZ(0), w=2.4, sid="sec", screens=3)
    for k in range(4):
        F.screen(f"cctv{k}", at(x0 + 1.6 + (k % 2) * 1.7, y0 + 0.22, 2.2 + (k // 2) * 0.95, 180), w=1.5, h=0.84)
    F.locker(at(x0 + 0.5, y1 - 3.0, 0, 90), n=4)
    F.rack(at(x1 - 1.2, y1 - 0.75, 0, 0))
    F.table(at(x1 - 3.4, y0 + 4.6, 0, 90), w=1.8, d=0.9)
    F.chair(at(x1 - 4.3, y0 + 4.6, 0, 90))
    marker("work", "sec_desk", at=(x0 + 2.4, y0 + 1.9, 0), rot=(0, 0, 180), pose="operate", role="guard")
    marker("nav", "security", at=((x0 + x1) / 2, (y0 + y1) / 2, 0), links="d_security_r")

    # ---- crew briefing room
    D, E, G = F.section("briefing")
    x0, x1, y0, y1, h = R("briefing")
    grid_lights("briefing", 2, 3, power=11, bake=40)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    F.table(at(cx, cy, 0, 90), w=8.0, d=1.8, top="wood_dark")
    for k in range(5):
        for s in (-1, 1):
            F.chair(at(cx + s * 1.5, cy - 3.2 + k * 1.6, 0, 90 * s))
    F.screen("brief0", at(x0 + 0.22, cy, 2.0, 90), w=5.6, h=2.6, bezel=0.06, depth=0.08)
    F.screen("brief1", at(cx, y1 - 0.22, 1.9, 0), w=3.0, h=1.7, bezel=0.05, depth=0.06)
    marker("terminal", "mission_decision", at=(cx - 0.3, cy + 4.3, 0.82), rot=(0, 0, 0), label="Mission authorization")
    D.box((0.5, 0.36, 0.03), at=(cx - 0.3, cy + 4.3, 0.765), mat="plastic_black", bevel=0.006)
    E.box((0.36, 0.22, 0.004), at=(cx - 0.3, cy + 4.3, 0.782), mat="emit_blue", bevel=0)
    F.sign(at(x1 - 0.21, cy - 4, 2.2, -90), "LAZARUS", w=1.6, h=0.4, bg="paint_black", fg="paint_white")
    marker("work", "brief_head", at=(cx - 2.6, cy, 0), rot=(0, 0, -90), pose="talk", role="director")
    marker("work", "brief_a", at=(cx + 2.6, cy - 1.6, 0), rot=(0, 0, 90), pose="stand", role="crew")
    marker("work", "brief_b", at=(cx + 2.6, cy + 0.2, 0), rot=(0, 0, 90), pose="stand", role="crew")
    marker("work", "brief_c", at=(cx + 2.6, cy + 2.0, 0), rot=(0, 0, 90), pose="stand", role="crew")
    marker("nav", "briefing", at=(cx + 3.6, cy, 0), links="d_briefing_r")

    # ---- mission control: display wall on the far (west) side, three rows of consoles facing it
    D, E, G = F.section("mission")
    x0, x1, y0, y1, h = R("mission")
    cy = (y0 + y1) / 2
    for i in range(3):
        for j in range(4):
            F.strip(x0 + 4.5 + i * 6.0, y0 + 3.6 + j * 7.1, h, yaw=90, power=5, bake=13, dist=10)
    for k, (w, yy) in enumerate([(7.6, cy - 8.6), (8.6, cy), (7.6, cy + 8.6)]):
        F.screen(f"mc_wall{k}", at(x0 + 0.24, yy, 3.6, 90), w=w, h=4.2, bezel=0.08, depth=0.1)
    D.box((0.5, y1 - y0 - 1.0, 0.9), at=(x0 + 0.45, cy, 0.45), mat="paint_gray_dark", bevel=0.02)
    zprev = 0.0
    for row, (rx, nrow, z) in enumerate([(x0 + 5.6, 5, 0.0), (x0 + 9.4, 5, 0.3), (x0 + 13.2, 4, 0.6)]):
        if z > 0:
            # raised tier with an intermediate step along its front edge
            S.box((3.8, y1 - y0 - 2.0, z), at=(rx + 0.7, cy, z / 2), mat="floor_panel_dark", bevel=0.01)
            C.box((3.8, y1 - y0 - 2.0, z), at=(rx + 0.7, cy, z / 2), mat="concrete", bevel=0)
            if zprev == 0.0:
                D.box((0.5, y1 - y0 - 2.0, z / 2), at=(rx - 1.45, cy, z / 4), mat="floor_panel_dark", bevel=0.01)
                C.box((0.5, y1 - y0 - 2.0, z / 2), at=(rx - 1.45, cy, z / 4), mat="concrete", bevel=0)
        for j in range(nrow):
            yy = cy + (j - (nrow - 1) / 2) * 4.6
            sid = f"mc{j}" if row == 0 else None
            F.console(at(rx, yy, z, 90), w=3.4, sid=sid, screens=3)
            marker("work", f"mc_{row}_{j}", at=(rx + 0.95, yy, z), rot=(0, 0, 90), pose="operate", role="ctrl")
        zprev = z
    # flight director's station with the interactive mission terminal
    F.console(at(x1 - 2.6, cy, 0.0, 90), w=3.0, sid="mc_dir", screens=2, chair=False)
    marker("terminal", "mission", at=(x1 - 2.1, cy, 1.05), rot=(0, 0, 90), label="Mission control terminal")
    marker("work", "mc_director", at=(x1 - 1.4, cy + 2.4, 0), rot=(0, 0, 90), pose="stand", role="director")
    F.sign(at(x1 - 0.21, cy, 4.6, -90), "MISSION CONTROL — ENDURANCE", w=5.0, h=0.5, bg="paint_black", fg="paint_white")
    for k, t in enumerate(["FLIGHT", "GUIDANCE", "PROPULSION", "ECLSS", "SURGEON"]):
        F.sign(at(x0 + 6.4 - 0.5, cy + (k - 2) * 4.6, 1.42, 90) @ RX(0), t, w=0.9, h=0.12, bg="paint_black", fg="paint_white")
    marker("nav", "mission_a", at=(x1 - 1.8, y0 + 3.6, 0), links="d_mission_r,mission_b,mission_c")
    marker("nav", "mission_b", at=(x1 - 1.8, y1 - 4.0, 0), links="d_mission2_r,mission_c")
    marker("nav", "mission_c", at=(x1 - 1.8, cy, 0))
    marker("nav", "mission_d", at=(x0 + 3.6, y0 + 2.0, 0), links="mission_a,mission_e")
    marker("nav", "mission_e", at=(x0 + 3.6, y1 - 2.0, 0), links="mission_b")
    F.camera(at(x1 - 0.2, y0 + 1.0, 5.4, -90) @ RZ(-30))

    # ---- computer centre: raised floor, two aisles of racks, cold blue light
    D, E, G = F.section("computer")
    x0, x1, y0, y1, h = R("computer")
    for i in range(2):
        for j in range(2):
            F.strip(x0 + 3.5 + i * 6.0, y0 + 3.4 + j * 6.8, h, yaw=0, power=9, bake=34, dist=8, color=(0.7, 0.85, 1.0), emit="emit_cool")
    for rrow, ry in enumerate([y0 + 2.6, y0 + 6.8, y0 + 11.0]):
        for k in range(8):
            F.rack(at(x0 + 1.4 + k * 0.66, ry, 0, 0 if rrow % 2 == 0 else 180))
    F.duct((x0 + 0.6, y0 + 0.5, h - 0.4), (x0 + 0.6, y1 - 0.5, h - 0.4), w=0.7, h=0.5)
    F.console(at(x1 - 1.4, y0 + 2.0, 0, -90), w=2.0, sid="cc", screens=2)
    marker("work", "cc_console", at=(x1 - 2.3, y0 + 2.0, 0), rot=(0, 0, -90), pose="operate", role="eng")
    marker("work", "cc_racks", at=(x0 + 4.0, y0 + 4.7, 0), rot=(0, 0, 180), pose="inspect", role="eng")
    marker("nav", "computer", at=(x1 - 2.4, (y0 + y1) / 2, 0), links="d_computer_r")

    # ---- observation & astrophysics: the wormhole data
    D, E, G = F.section("astro")
    x0, x1, y0, y1, h = R("astro")
    cy = (y0 + y1) / 2
    grid_lights("astro", 2, 2, power=9, bake=30)
    F.screen("astro0", at(x0 + 0.22, cy, 2.2, 90), w=6.4, h=3.0, bezel=0.06, depth=0.08)
    F.screen("astro1", at((x0 + x1) / 2, y0 + 0.22, 2.0, 180), w=3.6, h=2.0, bezel=0.05, depth=0.06)
    F.screen("astro2", at((x0 + x1) / 2, y1 - 0.22, 2.0, 0), w=3.6, h=2.0, bezel=0.05, depth=0.06)
    for k in range(3):
        F.console(at(x0 + 5.2, cy + (k - 1) * 4.4, 0, 90), w=2.6, sid=f"as{k}" if k == 1 else None, screens=2)
        marker("work", f"astro_{k}", at=(x0 + 6.1, cy + (k - 1) * 4.4, 0), rot=(0, 0, 90), pose="operate", role="sci")
    # a physical model of the gravitational anomaly: polished sphere on a plinth under a spot
    D.cyl(0.35, 1.0, at=(x1 - 3.0, cy, 0.5), mat="paint_black", segs=20, bevel=0.02)
    D.sphere(0.42, at=(x1 - 3.0, cy, 1.5), mat="metal_chrome", segs=32, rings=20)
    C.cyl(0.45, 1.9, at=(x1 - 3.0, cy, 0.95), mat="concrete", segs=8, bevel=0)
    F.sign(at(x1 - 3.0, cy - 0.36, 0.7, 0), "ANOMALY — SATURN ORBIT", w=0.62, h=0.1, bg="paint_black", fg="paint_white")
    marker("terminal", "astro", at=(x0 + 5.6, cy, 1.05), rot=(0, 0, 90), label="Wormhole research terminal")
    marker("work", "astro_model", at=(x1 - 3.0, cy - 1.3, 0), rot=(0, 0, 0), pose="inspect", role="sci")
    marker("nav", "astro", at=(x1 - 2.0, cy + 2.6, 0), links="d_astro_r")

    # ---- utilities / plant room: a long gallery of pumps, valves and switchgear
    D, E, G = F.section("utility")
    x0, x1, y0, y1, h = R("utility")
    for k in range(5):
        F.wall_lamp(at(x1 - 0.21, y0 + 3.5 + k * 6.4, 3.2, -90), power=10, bake=40, dist=8)
    for (px, r, m) in [(x0 + 0.9, 0.3, "paint_blue"), (x0 + 1.7, 0.22, "paint_green"), (x0 + 2.4, 0.16, "paint_red")]:
        F.pipe([(px, y0 + 0.5, 0.9 + r), (px, y1 - 0.5, 0.9 + r)], r=r, mat=m)
        for k in range(6):
            D.box((r * 2.4, 0.12, 0.9), at=(px, y0 + 3 + k * 5.4, 0.45), mat="paint_gray_dark", bevel=0.01)
    for k in range(4):
        yy = y0 + 5.0 + k * 7.0
        D.cyl(0.55, 1.1, at=(x0 + 4.4, yy, 0.75), rot=(90, 0, 0), mat="paint_green", segs=20, bevel=0.03)
        D.box((0.9, 1.5, 0.2), at=(x0 + 4.4, yy, 0.1), mat="concrete", bevel=0.02)
        D.cyl(0.2, 0.5, at=(x0 + 4.4, yy + 0.8, 0.75), rot=(90, 0, 0), mat="metal_steel", segs=14, bevel=0.01)
        D.tube(0.18, 0.13, 0.04, at=(x0 + 3.2, yy, 1.25), rot=(0, 90, 0), mat="paint_red", segs=16, bevel=0.005)
        C.box((1.2, 2.0, 1.4), at=(x0 + 4.4, yy + 0.2, 0.7), mat="concrete", bevel=0)
    for k in range(5):
        F.locker(at(x1 - 0.45, y1 - 3.0 - k * 1.3, 0, -90), n=1, w=1.2, d=0.5, h=2.1, mat="paint_gray")
        E.box((0.02, 0.06, 0.06), at=(x1 - 0.72, y1 - 3.3 - k * 1.3, 1.7), mat=["emit_green", "emit_green", "emit_amber", "emit_green", "emit_red"][k], bevel=0)
    F.sign(at(x1 - 0.21, y0 + 1.4, 2.3, -90), "DANGER — 480 V", w=1.2, h=0.3, bg="paint_yellow")
    marker("work", "util_pump", at=(x0 + 5.6, y0 + 12.2, 0), rot=(0, 0, 90), pose="kneel", role="eng")
    marker("work", "util_panel", at=(x1 - 1.3, y1 - 5.6, 0), rot=(0, 0, -90), pose="operate", role="eng")
    marker("nav", "utility", at=(x1 - 1.6, y0 + 4.6, 0), links="d_utility_r,utility_b")
    marker("nav", "utility_b", at=(x1 - 1.6, y1 - 8, 0))

    # ---- equipment storage
    D, E, G = F.section("storage")
    x0, x1, y0, y1, h = R("storage")
    grid_lights("storage", 2, 2, power=10, bake=38)
    for k in range(4):
        for s, yy in ((0, y0 + 0.5), (180, y1 - 0.5)):
            F.shelving(at(x0 + 2.2 + k * 2.4, yy, 0, s), w=2.2, h=2.6, d=0.6, levels=5)
    for (px, py, pz, w, hh) in [(x0 + 4.0, y0 + 5.2, 0, 1.2, 0.8), (x0 + 5.4, y0 + 5.4, 0, 1.0, 0.6), (x0 + 4.2, y0 + 6.6, 0, 1.1, 0.7), (x1 - 2.2, y0 + 6.2, 0, 1.2, 0.9), (x0 + 4.05, y0 + 5.25, 0.8, 1.0, 0.55)]:
        F.crate(at(px, py, pz, rnd.uniform(-8, 8)), w=w, d=0.8, h=hh, mat=rnd.choice(["plastic_gray", "plastic_green", "paint_olive"]))
    for k in range(3):
        F.drum(at(x1 - 1.0, y0 + 2.6 + k * 0.7, 0), mat="paint_white")
    marker("work", "store_a", at=(x0 + 4.6, y0 + 1.5, 0), rot=(0, 0, 180), pose="inspect", role="eng")
    marker("nav", "storage", at=(x0 + 2.4, (y0 + y1) / 2 + 0.8, 0), links="d_storage_r")

    # ---- engineering workshop
    D, E, G = F.section("workshop")
    x0, x1, y0, y1, h = R("workshop")
    cy = (y0 + y1) / 2
    for i in range(2):
        for j in range(3):
            F.highbay(x0 + 3.5 + i * 7.0, y0 + 3.3 + j * 6.5, h, drop=0.5, power=22, bake=90, dist=12)
    for k in range(3):
        F.bench(at(x1 - 0.6, y0 + 3.0 + k * 6.0, 0, -90), w=3.2)
        marker("work", f"shop_{k}", at=(x1 - 1.6, y0 + 3.0 + k * 6.0, 0), rot=(0, 0, -90), pose="operate", role="eng")
    # machine tools: lathe and mill
    D.box((2.6, 0.8, 0.9), at=(x0 + 3.0, y0 + 0.9, 0.45), mat="paint_green", bevel=0.03)
    D.box((0.6, 0.7, 0.55), at=(x0 + 2.0, y0 + 0.9, 1.18), mat="paint_green", bevel=0.03)
    D.cyl(0.14, 0.3, at=(x0 + 2.45, y0 + 0.9, 1.2), rot=(0, 90, 0), mat="metal_chrome", segs=16, bevel=0.01)
    D.cyl(0.05, 1.5, at=(x0 + 3.3, y0 + 0.9, 1.2), rot=(0, 90, 0), mat="metal_steel", segs=12, bevel=0)
    C.box((2.6, 0.8, 1.5), at=(x0 + 3.0, y0 + 0.9, 0.75), mat="concrete", bevel=0)
    D.box((1.0, 1.0, 0.8), at=(x0 + 7.0, y0 + 1.0, 0.4), mat="paint_gray", bevel=0.03)
    D.box((0.5, 0.6, 1.5), at=(x0 + 7.0, y0 + 0.75, 1.55), mat="paint_gray", bevel=0.03)
    D.cyl(0.07, 0.4, at=(x0 + 7.0, y0 + 1.15, 1.6), mat="metal_chrome", segs=12, bevel=0.005)
    D.box((0.9, 0.5, 0.08), at=(x0 + 7.0, y0 + 1.15, 0.95), mat="metal_steel", bevel=0.01)
    C.box((1.0, 1.0, 2.3), at=(x0 + 7.0, y0 + 1.0, 1.15), mat="concrete", bevel=0)
    # a rocket-engine turbopump on a stand, mid floor, with a hoist above it
    D.box((1.6, 1.2, 0.5), at=(x0 + 5.6, cy + 1.0, 0.25), mat="paint_yellow", bevel=0.03)
    D.cyl(0.42, 1.3, at=(x0 + 5.6, cy + 1.0, 1.0), rot=(0, 90, 0), mat="metal_steel", segs=24, bevel=0.03)
    D.cyl(0.55, 0.16, at=(x0 + 5.0, cy + 1.0, 1.0), rot=(0, 90, 0), mat="metal_dark", segs=24, bevel=0.02)
    D.cyl(0.3, 0.5, at=(x0 + 6.3, cy + 1.0, 1.0), rot=(0, 90, 0), r2=0.5, mat="thruster", segs=24, bevel=0)
    F.pipe([(x0 + 5.4, cy + 1.0, 1.4), (x0 + 5.4, cy + 1.0, 1.75), (x0 + 6.0, cy + 1.0, 1.75), (x0 + 6.0, cy + 1.0, 1.4)], r=0.05, mat="metal_brass", flanges=False)
    C.box((1.8, 1.3, 1.5), at=(x0 + 5.6, cy + 1.0, 0.75), mat="concrete", bevel=0)
    D.box((0.2, y1 - y0 - 1, 0.3), at=(x0 + 5.6, cy, h - 0.25), mat="paint_yellow", bevel=0.02)
    D.box((0.3, 0.3, 0.3), at=(x0 + 5.6, cy + 1.0, h - 0.55), mat="paint_gray_dark", bevel=0.02)
    D.cyl(0.008, h - 2.6, at=(x0 + 5.6, cy + 1.0, (h + 1.6) / 2 - 0.2), mat="metal_steel", segs=6, bevel=0)
    marker("work", "shop_pump", at=(x0 + 5.6, cy - 0.2, 0), rot=(0, 0, 0), pose="kneel", role="eng")
    F.locker(at(x0 + 10.4, y0 + 0.5, 0, 180), n=3, w=0.9, d=0.55, h=1.0, mat="paint_red")
    marker("nav", "workshop", at=(x0 + 2.6, cy, 0), links="d_workshop_r,workshop_b")
    marker("nav", "workshop_b", at=(x1 - 2.6, cy, 0))

    # ---- pathology laboratory
    D, E, G = F.section("lab")
    x0, x1, y0, y1, h = R("lab")
    cy = (y0 + y1) / 2
    grid_lights("lab", 2, 3, power=12, bake=44)
    for (bx, by, yaw, w) in [(x0 + 6.5, cy - 2.6, 0, 6.0), (x0 + 6.5, cy + 2.6, 0, 6.0)]:
        D.box((w, 1.4, 0.9), at=(bx, by, 0.45), mat="paint_white", bevel=0.01)
        D.box((w + 0.06, 1.46, 0.04), at=(bx, by, 0.92), mat="plastic_dark", bevel=0.008)
        C.box((w, 1.4, 0.94), at=(bx, by, 0.47), mat="concrete", bevel=0)
        for k in range(5):
            xx = bx - w / 2 + 0.6 + k * (w - 1.2) / 4
            kind = (k + int(by)) % 3
            if kind == 0:   # microscope
                D.box((0.2, 0.26, 0.04), at=(xx, by, 0.96), mat="plastic_black", bevel=0.006)
                D.box((0.06, 0.08, 0.34), at=(xx, by + 0.08, 1.13), mat="plastic_white", bevel=0.01)
                D.cyl(0.03, 0.2, at=(xx, by - 0.02, 1.26), rot=(35, 0, 0), mat="plastic_black", segs=10, bevel=0.004)
            elif kind == 1:  # rack of sample tubes
                D.box((0.34, 0.12, 0.08), at=(xx, by, 0.98), mat="plastic_blue", bevel=0.006)
                for q in range(6):
                    G.cyl(0.012, 0.12, at=(xx - 0.13 + q * 0.052, by, 1.05), mat="glass", segs=6, bevel=0)
            else:           # sealed culture dishes with blight
                for q in range(3):
                    D.cyl(0.07, 0.02, at=(xx + (q - 1) * 0.18, by + (q % 2) * 0.1, 0.95), mat=["leaf_corn_dry", "plastic_dark", "foliage_dry"][q], segs=14, bevel=0.003)
    D.box((2.4, 0.9, 2.3), at=(x1 - 1.4, y0 + 0.65, 1.15), mat="paint_white", bevel=0.02)       # fume cupboard
    G.box((2.1, 0.01, 0.9), at=(x1 - 1.4, y0 + 1.11, 1.6), mat="glass", bevel=0)
    C.box((2.4, 0.9, 2.3), at=(x1 - 1.4, y0 + 0.65, 1.15), mat="concrete", bevel=0)
    for k in range(2):
        furn.fridge(D, C, at(x1 - 0.55, y1 - 1.4 - k * 1.0, 0, -90), mat="paint_white")
    F.console(at(x0 + 1.6, y1 - 0.9, 0, 0), w=2.2, sid="lab", screens=2)
    marker("terminal", "lab", at=(x0 + 1.6, y1 - 1.3, 1.05), rot=(0, 0, 0), label="Blight research terminal")
    marker("work", "lab_a", at=(x0 + 5.3, cy - 3.75, 0), rot=(0, 0, 0), pose="inspect", role="sci")
    marker("work", "lab_b", at=(x0 + 7.7, cy + 1.45, 0), rot=(0, 0, 0), pose="operate", role="sci")
    F.sign(at(x0 + 0.21, cy, 2.3, 90), "BIOHAZARD — SEALED SAMPLES", w=2.6, h=0.3, bg="paint_yellow")
    marker("nav", "lab", at=(x0 + 2.2, cy, 0), links="d_lab_r,lab_b")
    marker("nav", "lab_b", at=(x1 - 2.4, cy, 0))

    # ---- experimental greenhouse: the last crops, under grow lights
    D, E, G = F.section("greenhouse")
    x0, x1, y0, y1, h = R("greenhouse")
    beds = []
    for i in range(3):
        for j in range(3):
            bx, by = x0 + 3.4 + i * 4.6, y0 + 4.8 + j * 8.6
            beds.append((bx, by))
            D.box((2.6, 6.4, 0.7), at=(bx, by, 0.35), mat="paint_white", bevel=0.02)
            D.box((2.4, 6.2, 0.06), at=(bx, by, 0.7), mat="dirt", bevel=0)
            C.box((2.6, 6.4, 0.74), at=(bx, by, 0.37), mat="concrete", bevel=0)
            dry = (i + j) % 4 == 3
            for a in range(3):
                for b in range(8):
                    plant(D, at(bx - 0.8 + a * 0.8 + rnd.uniform(-0.08, 0.08), by - 2.8 + b * 0.8 + rnd.uniform(-0.08, 0.08), 0.73, rnd.uniform(0, 360)), h=rnd.uniform(0.5, 1.5) * (0.6 if dry else 1), rnd=rnd, dry=dry)
            # grow light bar over each bed
            D.box((0.3, 6.0, 0.08), at=(bx, by, h - 1.5), mat="paint_gray", bevel=0.01)
            E.box((0.2, 5.8, 0.02), at=(bx, by, h - 1.55), mat="emit_grow", bevel=0)
            for yy in (by - 2.6, by + 2.6):
                D.cyl(0.01, 1.46, at=(bx, yy, h - 0.73), mat="metal_steel", segs=6, bevel=0)
            light(F.uid("nasa_l"), at=(bx, by, h - 1.9), color=(1.0, 0.45, 0.85), power=12, dist=7, bake=42, group="nasa")
    F.pipe([(x0 + 0.5, y0 + 0.5, 1.1), (x0 + 0.5, y1 - 0.5, 1.1)], r=0.06, mat="paint_blue")
    for (bx, by) in beds[::3]:
        F.pipe([(x0 + 0.5, by, 1.1), (bx + 1.4, by, 1.1)], r=0.025, mat="paint_blue", flanges=False)
    F.tank(at(x1 - 1.6, y0 + 2.0, 0), r=0.8, h=2.6, mat="plastic_blue", band="plastic_dark")
    F.console(at(x1 - 1.2, y1 - 3.0, 0, -90), w=1.8, sid="gh", screens=2)
    marker("work", "gh_a", at=(x0 + 5.7, y0 + 4.8, 0), rot=(0, 0, 90), pose="inspect", role="sci")
    marker("work", "gh_b", at=(x0 + 10.3, y0 + 13.4, 0), rot=(0, 0, 90), pose="kneel", role="sci")
    marker("work", "gh_c", at=(x1 - 2.1, y1 - 3.0, 0), rot=(0, 0, -90), pose="operate", role="sci")
    marker("nav", "greenhouse", at=(x0 + 1.3, y0 + 4.6, 0), links="d_greenhouse_r,greenhouse_b,greenhouse_c")
    marker("nav", "greenhouse_b", at=(x0 + 1.3, y1 - 4.5, 0), links="d_greenhouse2_r")
    marker("nav", "greenhouse_c", at=(x0 + 5.7, (y0 + y1) / 2 + 4.3, 0), links="greenhouse_b")

    # ---- life support: oxygen, nitrogen, water recovery, CO2 scrubbers
    D, E, G = F.section("lifesupport")
    x0, x1, y0, y1, h = R("lifesupport")
    cy = (y0 + y1) / 2
    for i in range(2):
        for j in range(2):
            F.highbay(x0 + 3.4 + i * 6.4, y0 + 4.2 + j * 9.0, h, drop=0.4, power=20, bake=80, dist=12)
    for k, (m, lab) in enumerate([("paint_white", "O2"), ("paint_white", "O2"), ("paint_green", "N2"), ("paint_blue", "H2O"), ("paint_blue", "H2O")]):
        F.tank(at(x1 - 1.6, y0 + 2.0 + k * 3.3, 0), r=1.1, h=3.0, mat=m, band="paint_gray_dark")
        F.sign(at(x1 - 2.74, y0 + 2.0 + k * 3.3, 1.9, 90), lab, w=0.5, h=0.26)
    for k in range(3):
        yy = y0 + 3.4 + k * 5.2
        D.box((1.6, 2.6, 2.2), at=(x0 + 5.0, yy, 1.1), mat="paint_gray", bevel=0.03)
        D.box((1.2, 0.03, 1.2), at=(x0 + 5.0, yy - 1.31, 1.2), mat="grating", bevel=0)
        F.duct((x0 + 5.0, yy, 2.2), (x0 + 5.0, yy, h - 0.5), w=0.7, h=0.7)
        E.box((0.06, 0.02, 0.06), at=(x0 + 5.5, yy - 1.32, 2.0), mat="emit_green", bevel=0)
        C.box((1.6, 2.6, 2.2), at=(x0 + 5.0, yy, 1.1), mat="concrete", bevel=0)
    F.duct((x0 + 5.0, y0 + 0.6, h - 0.5), (x0 + 5.0, y1 - 0.6, h - 0.5), w=0.9, h=0.6)
    F.pipe([(x1 - 3.0, y0 + 0.6, 0.4), (x1 - 3.0, y1 - 0.6, 0.4)], r=0.1, mat="paint_green")
    F.console(at(x0 + 1.5, cy, 0, 90), w=2.6, sid="ls", screens=2)
    marker("work", "ls_console", at=(x0 + 2.45, cy, 0), rot=(0, 0, 90), pose="operate", role="eng")
    marker("work", "ls_tanks", at=(x1 - 3.6, y0 + 8.6, 0), rot=(0, 0, -90), pose="inspect", role="eng")
    marker("nav", "lifesupport", at=(x0 + 2.8, cy + 3.4, 0), links="d_lifesupport_r")

    # ---- crew preparation: suit lockers, benches, medical corner
    D, E, G = F.section("crew")
    x0, x1, y0, y1, h = R("crew")
    cy = (y0 + y1) / 2
    grid_lights("crew", 2, 3, power=12, bake=44, yaw=90)
    F.locker(at(x1 - 0.5, y0 + 5.0, 0, -90), n=8, w=0.9, d=0.7, h=2.2, mat="paint_white")
    for k in range(4):
        # helmets on the shelf above the lockers and an orange suit bag on each bench
        D.sphere(0.19, at=(x1 - 0.6, y0 + 2.2 + k * 1.8, 2.42), mat="paint_white", segs=20, rings=12)
        D.box((0.2, 0.26, 0.16), at=(x1 - 0.74, y0 + 2.2 + k * 1.8, 2.4), mat="glass_visor", bevel=0.05)
    for k in range(2):
        D.box((0.5, 3.2, 0.06), at=(x1 - 2.6, y0 + 3.4 + k * 4.2, 0.45), mat="wood_dark", bevel=0.01)
        for s in (-1.3, 1.3):
            D.box((0.4, 0.06, 0.42), at=(x1 - 2.6, y0 + 3.4 + k * 4.2 + s, 0.21), mat="metal_steel", bevel=0.005)
        C.box((0.5, 3.2, 0.48), at=(x1 - 2.6, y0 + 3.4 + k * 4.2, 0.24), mat="concrete", bevel=0)
        D.box((0.45, 0.7, 0.3), at=(x1 - 2.6, y0 + 2.8 + k * 4.2, 0.63), mat="suit_orange", bevel=0.08)
    furn.bed(D, C, at(x0 + 1.3, y1 - 1.6, 0, 0), w=0.9, l=2.0, frame="metal_steel", blanket="cloth_white")
    F.console(at(x0 + 3.2, y1 - 0.8, 0, 0), w=1.8, sid="med", screens=2)
    F.table(at(x0 + 4.0, y0 + 4.0, 0, 0), w=2.4, d=1.1)
    for k in range(4):
        F.chair(at(x0 + 3.1 + (k % 2) * 1.8, y0 + 4.0 + (1 if k < 2 else -1) * 0.9, 0, 0 if k < 2 else 180))
    marker("work", "crew_lockers", at=(x1 - 1.5, y0 + 6.0, 0), rot=(0, 0, -90), pose="operate", role="crew")
    marker("work", "crew_bench", at=(x1 - 3.3, y0 + 7.6, 0), rot=(0, 0, -90), pose="stand", role="crew")
    marker("work", "crew_table", at=(x0 + 4.0, y0 + 5.4, 0), rot=(0, 0, 180), pose="talk", role="crew")
    marker("work", "crew_med", at=(x0 + 3.2, y1 - 1.7, 0), rot=(0, 0, 0), pose="operate", role="med")
    marker("terminal", "crew", at=(x0 + 3.2, y1 - 1.2, 1.05), rot=(0, 0, 0), label="Crew status terminal")
    marker("nav", "crew", at=(x0 + 2.2, cy + 0.4, 0), links="d_crew_r,crew_b")
    marker("nav", "crew_b", at=(x1 - 4.2, cy, 0))

    # ------------------------------------------------------------------ finish
    portal = X.finish(sharp=40, col=0)
    props(portal, part="portal")
    objs = F.finish(tess=None, rays=10, fill=0.012, sky_dist=40.0)
    bake_ao([portal], rays=16, local_dist=2.0, sky_dist=60.0, ground_z=0.0)
    return objs + [portal]



# =====================================================================================================
CAV_R, CAV_Z0, CAV_Z1, SHAFT_R = 24.0, -52.0, 30.0, 15.0
LEVELS = [-36.0, -24.0, -12.0, 0.0, 9.0]          # service decks (main level is 0, crew access is the top one)
ROCKET_BASE = -40.0


def ring_wall(P, cx, cy, r, z0, z1, mat, segs=48, zstep=2.5, skip=None, outward=False):
    """Cylindrical shell facing inward (or outward), with optional cut-outs: skip(angle_mid_deg, z_mid) -> bool."""
    nz = max(1, int(math.ceil((z1 - z0) / zstep)))
    verts, faces = [], []
    for j in range(nz + 1):
        z = z0 + (z1 - z0) * j / nz
        for i in range(segs):
            a = math.tau * i / segs
            verts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    for j in range(nz):
        for i in range(segs):
            am = math.degrees(math.tau * (i + 0.5) / segs)
            if skip and skip(am, z0 + (z1 - z0) * (j + 0.5) / nz):
                continue
            a, b = j * segs + i, j * segs + (i + 1) % segs
            c, d = (j + 1) * segs + (i + 1) % segs, (j + 1) * segs + i
            faces.append((a, b, c, d) if outward else (a, d, c, b))
    P.mesh(verts, faces, mat=mat, bevel=0, recalc=False, smooth=True)


def annulus(P, cx, cy, r0, r1, a0, a1, z, mat, up=True, rstep=2.5, astep=7.5):
    """Flat annular sector (angles in degrees, counter-clockwise from +X)."""
    nr = max(1, int(math.ceil((r1 - r0) / rstep)))
    na = max(1, int(math.ceil((a1 - a0) / astep)))
    verts, faces = [], []
    for j in range(nr + 1):
        r = r0 + (r1 - r0) * j / nr
        for i in range(na + 1):
            a = math.radians(a0 + (a1 - a0) * i / na)
            verts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    for j in range(nr):
        for i in range(na):
            a, b = j * (na + 1) + i, j * (na + 1) + i + 1
            c, d = (j + 1) * (na + 1) + i + 1, (j + 1) * (na + 1) + i
            faces.append((a, d, c, b) if up else (a, b, c, d))
    P.mesh(verts, faces, mat=mat, bevel=0, recalc=False, smooth=False)


def deck(F, cx, cy, r0, r1, a0, a1, z, mat="grating", rail_in=True, rail_out=False, beams=True):
    """Steel service deck: grating on radial beams, collision slab, handrails along the open edges."""
    annulus(F.D, cx, cy, r0, r1, a0, a1, z, mat, up=True)
    na = max(1, int(math.ceil((a1 - a0) / 7.5)))
    for i in range(na):
        am = math.radians(a0 + (a1 - a0) * (i + 0.5) / na)
        rm, w = (r0 + r1) / 2, (r0 + r1) / 2 * math.radians((a1 - a0) / na) + 0.3
        M = T((cx + math.cos(am) * rm, cy + math.sin(am) * rm, z - 0.11)) @ RZ(math.degrees(am))
        F.C.box((r1 - r0, w, 0.2), M=M, mat="concrete", bevel=0)
    if beams:
        nb = max(2, int((a1 - a0) / 15) + 1)
        for i in range(nb):
            a = math.radians(a0 + (a1 - a0) * i / (nb - 1))
            M = T((cx + math.cos(a) * (r0 + r1) / 2, cy + math.sin(a) * (r0 + r1) / 2, z - 0.17)) @ RZ(math.degrees(a))
            F.D.box((r1 - r0, 0.16, 0.3), M=M, mat="paint_gray_dark", bevel=0)
        for r in (r0 + 0.08, r1 - 0.08):
            n = max(2, int((a1 - a0) / 7.5))
            pts = [(cx + math.cos(math.radians(a0 + (a1 - a0) * k / n)) * r, cy + math.sin(math.radians(a0 + (a1 - a0) * k / n)) * r, z - 0.13) for k in range(n + 1)]
            for p, q in zip(pts[:-1], pts[1:]):
                d = Vector(q) - Vector(p)
                M = frame_matrix((Vector(p) + Vector(q)) / 2, d.normalized(), Vector((0, 0, 1)).cross(d).normalized(), (0, 0, 1))
                F.D.box((d.length + 0.02, 0.12, 0.22), M=M, mat="paint_gray_dark", bevel=0)
    for (r, on) in ((r0 + 0.06, rail_in), (r1 - 0.06, rail_out)):
        if on:
            n = max(2, int((a1 - a0) / 7.5))
            F.rail([(cx + math.cos(math.radians(a0 + (a1 - a0) * k / n)) * r, cy + math.sin(math.radians(a0 + (a1 - a0) * k / n)) * r, z) for k in range(n + 1)])


def launch_glb():
    reset()
    rnd = random.Random(23)
    F = Fac("launch", cell=2.5)
    S, C = F.S, F.C
    CX, CY = 0.0, SILO_Y

    # ------------------------------------------------------------------ assembly hall
    D, E, G = F.section("hall")
    HX, HY0, HY1, HH = 22.0, 232.4, 279.0, 18.0
    TH = 7.0   # half-width of the transfer opening into the cavern
    fr = F.room(-HX, HY0, HX, HY1, 0, HH, doors={"s": [(HX - 2.0, 4.0, 3.6)], "n": [(HX - TH, 2 * TH, 15.0)]}, floor="concrete_floor")
    # throat between the hall and the cavern wall
    ty1 = CY - math.sqrt(CAV_R ** 2 - TH ** 2) + 0.3
    F.floor(-TH, HY1, TH, ty1 + 1.2, 0, "concrete_floor")
    F.ceil(-TH, HY1, TH, ty1 + 1.2, 15.0)
    for s in (-1, 1):
        F.wall((s * (TH + 0.2), HY1 + 0.2) if s > 0 else (s * (TH + 0.2), ty1 + 0.6), (s * (TH + 0.2), ty1 + 0.6) if s > 0 else (s * (TH + 0.2), HY1 + 0.2), 0, 15.0, mat="concrete_panels")
    for i in range(4):
        for j in range(4):
            F.highbay(-16.5 + i * 11.0, HY0 + 6 + j * 11.4, HH, drop=1.5, power=44, dist=30, bake=260)
    # overhead travelling crane
    for s in (-1, 1):
        D.box((0.5, HY1 - HY0 - 1, 0.7), at=(s * (HX - 0.7), (HY0 + HY1) / 2, 14.2), mat="paint_yellow", bevel=0.03)
        for k in range(8):
            D.box((0.6, 0.6, 0.5), at=(s * (HX - 0.35), HY0 + 3 + k * 5.8, 13.6), mat="concrete", bevel=0.03)
    D.box((2 * HX - 1.6, 1.0, 1.2), at=(0, 256, 15.2), mat="paint_yellow", bevel=0.04)
    D.box((2 * HX - 1.6, 1.0, 1.2), at=(0, 258.4, 15.2), mat="paint_yellow", bevel=0.04)
    D.box((2.6, 3.6, 0.9), at=(-6, 257.2, 15.9), mat="paint_gray_dark", bevel=0.05)
    D.cyl(0.02, 7.0, at=(-6, 257.2, 11.7), mat="metal_steel", segs=6, bevel=0)
    D.box((0.5, 0.3, 0.7), at=(-6, 257.2, 8.0), mat="paint_yellow", bevel=0.05)
    D.text("25 t", size=0.7, at=(4, 255.49, 15.2), rot=(90, 0, 0), mat="paint_black", depth=0.004)
    # an upper stage on its transporter, lying along the hall
    Mt = at(-9.5, 252, 0)
    D.cyl(2.8, 12.0, M=Mt @ T((0, 0, 3.6)) @ RX(90), mat="paint_white", segs=36, bevel=0.05)
    D.cyl(2.82, 1.0, M=Mt @ T((0, -3.0, 3.6)) @ RX(90), mat="paint_black", segs=36, bevel=0, caps=False)
    D.cyl(2.3, 1.4, M=Mt @ T((0, 6.7, 3.6)) @ RX(90), r2=2.8, mat="metal_steel", segs=36, bevel=0)
    D.cyl(1.25, 2.2, M=Mt @ T((0, -7.1, 3.6)) @ RX(-90), r2=0.5, mat="thruster", segs=28, bevel=0)
    for yy in (-4.2, 4.2):
        D.box((6.4, 1.0, 0.8), M=Mt @ T((0, yy, 0.75)), mat="paint_yellow", bevel=0.04)
        D.box((5.0, 0.8, 0.6), M=Mt @ T((0, yy, 1.3)), mat="paint_gray_dark", bevel=0.04)
        for xx in (-2.6, 2.6):
            D.cyl(0.38, 0.45, M=Mt @ T((xx, yy, 0.38)) @ RY(90), mat="rubber", segs=16, bevel=0.04)
    D.box((0.6, 9.0, 0.5), M=Mt @ T((0, 0, 0.75)), mat="paint_yellow", bevel=0.04)
    C.box((6.0, 15.0, 6.6), M=Mt @ T((0, 0, 3.3)), mat="concrete", bevel=0)
    # engine section on a work stand: four bells
    Me = at(11.0, 248, 0)
    D.cyl(3.3, 2.2, M=Me @ T((0, 0, 4.0)), mat="paint_white", segs=36, bevel=0.04)
    D.cyl(3.32, 0.5, M=Me @ T((0, 0, 4.4)), mat="paint_black", segs=36, bevel=0, caps=False)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        D.cyl(0.55, 1.9, M=Me @ T((math.cos(a) * 1.7, math.sin(a) * 1.7, 2.0)), r2=1.15, mat="thruster", segs=24, bevel=0, caps=False)
        D.cyl(0.4, 0.6, M=Me @ T((math.cos(a) * 1.7, math.sin(a) * 1.7, 3.2)), mat="metal_dark", segs=16, bevel=0.02)
        D.box((0.25, 0.25, 5.0), M=Me @ T((math.cos(a) * 3.6, math.sin(a) * 3.6, 2.5)), mat="paint_blue", bevel=0.02)
    D.tube(3.9, 3.3, 0.3, M=Me @ T((0, 0, 2.9)), mat="paint_blue", segs=36, bevel=0.03)
    C.cyl(3.9, 5.2, M=Me @ T((0, 0, 2.6)), mat="concrete", segs=12, bevel=0)
    marker("work", "hall_engine", at=(11.0, 243.2, 0), rot=(0, 0, 0), pose="inspect", role="eng")
    marker("work", "hall_stage", at=(-5.6, 250, 0), rot=(0, 0, 90), pose="operate", role="eng")
    # propellant storage along the east wall with insulated lines running to the cavern
    for k, (m, lab) in enumerate([("paint_white", "LOX"), ("paint_white", "LOX"), ("paint_orange", "LH2")]):
        F.tank(at(HX - 3.2, 262 + k * 5.6, 0), r=2.2, h=9.0, mat=m, band="paint_gray_dark")
        F.sign(at(HX - 5.45, 262 + k * 5.6, 2.6, 90), lab, w=0.9, h=0.4)
    F.pipe([(HX - 5.8, 260, 0.5), (HX - 5.8, HY1 - 1.0, 0.5), (TH - 0.6, HY1 - 1.0, 0.5), (TH - 0.6, ty1 + 1.0, 0.5)], r=0.22, mat="paint_white")
    F.pipe([(HX - 6.4, 260, 0.9), (HX - 6.4, HY1 - 1.6, 0.9), (TH - 1.2, HY1 - 1.6, 0.9), (TH - 1.2, ty1 + 1.0, 0.9)], r=0.16, mat="paint_orange")
    C.box((1.4, 20, 1.3), at=(HX - 6.1, 269.5, 0.65), mat="concrete", bevel=0)
    F.sign(at(HX - 0.21, 255, 4.0, -90), "CRYOGENIC PROPELLANTS — NO OPEN FLAME", w=6.0, h=0.6, bg="paint_yellow")
    # launch support office: a prefab cabin on legs with a window wall facing the throat
    ox, oy = -15.0, 272.5
    D.box((10.0, 6.0, 0.25), at=(ox, oy, 3.0), mat="paint_gray", bevel=0.02)
    D.box((10.0, 6.0, 0.15), at=(ox, oy, 6.0), mat="paint_gray", bevel=0.02)
    for (px, py) in [(-4.8, -2.8), (4.8, -2.8), (-4.8, 2.8), (4.8, 2.8)]:
        D.box((0.25, 0.25, 6.0), at=(ox + px, oy + py, 3.0), mat="paint_gray_dark", bevel=0.02)
    D.box((10.0, 0.12, 1.0), at=(ox, oy - 2.94, 3.6), mat="paint_gray", bevel=0.01)
    D.box((10.0, 0.12, 2.9), at=(ox, oy + 2.94, 4.55), mat="paint_gray", bevel=0.01)
    D.box((0.12, 6.0, 2.9), at=(ox - 4.94, oy, 4.55), mat="paint_gray", bevel=0.01)
    D.box((0.12, 6.0, 1.0), at=(ox + 4.94, oy, 3.6), mat="paint_gray", bevel=0.01)
    G.box((10.0, 0.02, 1.9), at=(ox, oy - 2.94, 5.05), mat="glass", bevel=0)
    G.box((0.02, 4.6, 1.9), at=(ox + 4.94, oy + 0.7, 5.05), mat="glass", bevel=0)
    C.box((10.0, 6.0, 0.3), at=(ox, oy, 3.0), mat="concrete", bevel=0)
    C.box((10.0, 0.2, 3.0), at=(ox, oy - 2.94, 4.6), mat="concrete", bevel=0)
    C.box((10.0, 0.2, 3.0), at=(ox, oy + 2.94, 4.6), mat="concrete", bevel=0)
    C.box((0.2, 6.0, 3.0), at=(ox - 4.94, oy, 4.6), mat="concrete", bevel=0)
    C.box((0.2, 4.6, 3.0), at=(ox + 4.94, oy + 0.7, 4.6), mat="concrete", bevel=0)
    F.stairs((ox + 6.2, oy - 2.2 - 5.0, 0), (0, 1), 1.1, 3.12, 17, run=0.29)
    D.box((1.4, 1.4, 0.06), at=(ox + 5.7, oy - 2.2, 3.1), mat="tread_plate", bevel=0)
    C.box((1.4, 1.4, 0.2), at=(ox + 5.7, oy - 2.2, 3.03), mat="concrete", bevel=0)
    for k in range(3):
        F.console(at(ox - 3.0 + k * 3.0, oy - 2.2, 3.13, 180), w=2.6, sid=f"lc{k}", screens=2)
        marker("work", f"launch_ctrl{k}", at=(ox - 3.0 + k * 3.0, oy - 1.25, 3.13), rot=(0, 0, 180), pose="operate", role="ctrl")
    marker("terminal", "launch", at=(ox, oy - 1.8, 4.2), rot=(0, 0, 180), label="Launch control terminal")
    F.strip(ox - 2.5, oy, 5.92, yaw=0, power=9, bake=30, dist=7)
    F.strip(ox + 2.5, oy, 5.92, yaw=0, power=9, bake=30, dist=7)
    F.sign(at(ox, oy - 3.01, 3.6, 0), "LAUNCH SUPPORT", w=3.0, h=0.4)
    # tooling
    F.bench(at(-HX + 0.6, 240, 0, 90), w=3.4)
    F.bench(at(-HX + 0.6, 246, 0, 90), w=3.4)
    F.locker(at(-HX + 0.55, 236, 0, 90), n=1, w=1.0, d=0.6, h=1.2, mat="paint_red")
    for (cx_, cy_) in [(6, 238), (7.4, 238.3), (6.4, 239.6), (14, 262), (-3, 264), (-2, 265.2)]:
        F.crate(at(cx_, cy_, 0, rnd.uniform(-20, 20)), w=1.4, d=1.0, h=rnd.uniform(0.7, 1.1), mat=rnd.choice(["paint_olive", "plastic_gray", "paint_tan"]))
    for k in range(5):
        F.drum(at(15.5 + (k % 3) * 0.7, 236.2 + (k // 3) * 0.7, 0), mat=rnd.choice(["paint_blue", "paint_yellow"]))
    # floor routing: transport rails from the hall into the cavern
    for s in (-1, 1):
        D.box((0.12, ty1 + 1.2 - 240, 0.02), at=(s * 2.2, (240 + ty1 + 1.2) / 2, 0.012), mat="metal_steel", bevel=0)
    D.box((0.3, 30, 0.006), at=(-TH - 1.2, 262, 0.004), mat="paint_yellow", bevel=0)
    D.box((0.3, 30, 0.006), at=(TH + 1.2, 262, 0.004), mat="paint_yellow", bevel=0)
    F.sign(at(0, HY1 - 0.21, 15.9, 0), "LAUNCH CAVERN  ·  HEARING AND EYE PROTECTION REQUIRED", w=13, h=0.8, bg="paint_yellow")
    F.camera(at(-HX + 0.2, 236, 9, 90) @ RZ(-35))
    marker("nav", "hall0", at=(0, 236, 0), links="hall1")
    marker("nav", "hall1", at=(0, 246, 0), links="hall2,hall3,hall4")
    marker("nav", "hall2", at=(0, 262, 0), links="hall5")
    marker("nav", "hall3", at=(10.5, 241.5, 0))
    marker("nav", "hall4", at=(-4.5, 244, 0))
    marker("nav", "hall5", at=(0, 276, 0), links="cav0")
    marker("spawn", "hall", at=(0, 238, 0), rot=(0, 0, 0))

    # ------------------------------------------------------------------ launch cavern shell
    D, E, G = F.section("cavern")

    def throat(am, zm):
        # cut-outs in the cavern wall: the transfer opening (toward -Y, 270 deg) and the tower alcove (180 deg)
        x = math.cos(math.radians(am)) * CAV_R
        if 180 < am < 360 and abs(x) < TH and 0 < zm < 15.0:
            return True
        return abs(am - 180.0) < 11.25 and zm < 26.0

    ring_wall(S, CX, CY, CAV_R, CAV_Z0, CAV_Z1, "concrete_panels", segs=96, zstep=2.0, skip=throat)
    annulus(S, CX, CY, 0.0, CAV_R, 0, 360, CAV_Z0, "concrete_floor", up=True, rstep=3.0, astep=7.5)
    annulus(S, CX, CY, SHAFT_R, CAV_R, 0, 360, CAV_Z1, "concrete", up=False, rstep=3.0, astep=7.5)
    ring_wall(S, CX, CY, SHAFT_R, CAV_Z1, SILO_TOP - 0.6, "concrete_panels", segs=64, zstep=3.0)
    # collision: wall as boxes, floors as discs
    for i in range(96):
        a = math.tau * (i + 0.5) / 96
        am = math.degrees(a)
        x, y = math.cos(a) * (CAV_R + 0.5), math.sin(a) * (CAV_R + 0.5)
        spans = [(CAV_Z0, CAV_Z1)]
        if 180 < am < 360 and abs(math.cos(a) * CAV_R) < TH:
            spans = [(CAV_Z0, 0.0), (15.0, CAV_Z1)]
        elif abs(am - 180.0) < 11.25:
            spans = [(26.0, CAV_Z1)]
        for (za, zb) in spans:
            C.box((1.0, 1.8, zb - za), M=T((CX + x, CY + y, (za + zb) / 2)) @ RZ(am), mat="concrete", bevel=0)
    for i in range(32):
        a = math.tau * (i + 0.5) / 32
        C.box((1.0, 3.2, SILO_TOP - CAV_Z1), M=T((CX + math.cos(a) * (SHAFT_R + 0.5), CY + math.sin(a) * (SHAFT_R + 0.5), (SILO_TOP + CAV_Z1) / 2)) @ RZ(math.degrees(a)), mat="concrete", bevel=0)
    C.cyl(CAV_R, 1.0, at=(CX, CY, CAV_Z0 - 0.5), mat="concrete", segs=24, bevel=0)
    # flame deflector and exhaust ducts in the pit
    D.cyl(0.6, 7.0, at=(CX, CY, CAV_Z0 + 3.5), r2=7.5, mat="concrete_dark", segs=40, bevel=0)
    C.cyl(7.5, 7.0, at=(CX, CY, CAV_Z0 + 3.5), r2=0.6, mat="concrete", segs=12, bevel=0)
    for a in (35, 145, 215, 325):
        M = T((CX, CY, CAV_Z0)) @ RZ(a)
        D.box((0.8, 7.5, 6.5), M=M @ T((CAV_R - 0.5, 0, 3.25)), mat="concrete_dark", bevel=0)
        D.box((0.3, 6.5, 5.6), M=M @ T((CAV_R - 0.98, 0, 2.9)), mat="paint_black", bevel=0)
    # launch table: ring on six legs with hold-down arms
    D.tube(5.2, 2.9, 1.4, at=(CX, CY, ROCKET_BASE - 1.9), mat="paint_gray_dark", segs=48, bevel=0.05)
    C.cyl(5.2, 1.4, at=(CX, CY, ROCKET_BASE - 1.9), mat="concrete", segs=16, bevel=0)
    for k in range(6):
        a = math.radians(30 + 60 * k)
        D.box((0.9, 0.9, -CAV_Z0 + ROCKET_BASE - 2.6), at=(CX + math.cos(a) * 4.6, CY + math.sin(a) * 4.6, (CAV_Z0 + ROCKET_BASE - 2.6) / 2), rot=(0, 0, 30 + 60 * k), mat="paint_gray_dark", bevel=0.04)
        C.box((0.9, 0.9, -CAV_Z0 + ROCKET_BASE - 2.6), at=(CX + math.cos(a) * 4.6, CY + math.sin(a) * 4.6, (CAV_Z0 + ROCKET_BASE - 2.6) / 2), rot=(0, 0, 30 + 60 * k), mat="concrete", bevel=0)
        D.box((1.6, 0.5, 1.1), M=T((CX, CY, ROCKET_BASE - 0.7)) @ RZ(30 + 60 * k) @ T((4.3, 0, 0)), mat="paint_yellow", bevel=0.04)
    # ------------------------------------------------------------------ service decks
    for z in LEVELS:
        if z == 0.0:
            # main deck: wide on the hall side, a narrower gallery round the back
            deck(F, CX, CY, 10.0, CAV_R - 0.05, 180, 360, z, mat="tread_plate")
            deck(F, CX, CY, 10.0, 14.0, 0, 180, z, rail_out=True)
        elif z == LEVELS[-1]:
            deck(F, CX, CY, 9.2, 14.0, 120, 240, z, rail_out=True)
        else:
            deck(F, CX, CY, 10.0, CAV_R - 0.05, 95, 265, z)
            # swing platforms that reach the vehicle skin
            for a in (150, 210):
                M = T((CX, CY, z)) @ RZ(a)
                F.D.box((6.2, 1.6, 0.06), M=M @ T((7.0, 0, -0.03)), mat="grating", bevel=0)
                F.C.box((6.2, 1.6, 0.2), M=M @ T((7.0, 0, -0.11)), mat="concrete", bevel=0)
                for s in (-1, 1):
                    F.D.box((6.2, 0.1, 0.3), M=M @ T((7.0, s * 0.8, -0.18)), mat="paint_yellow", bevel=0)
                    p0, p1 = M @ Vector((4.0, s * 0.78, 0)), M @ Vector((10.0, s * 0.78, 0))
                    F.rail([p0[:], p1[:]])
    # hangers that carry the crew-access deck from the cavern roof
    for a in (125, 155, 205, 235):
        for r in (9.4, 13.8):
            x, y = CX + math.cos(math.radians(a)) * r, CY + math.sin(math.radians(a)) * r
            F.D.cyl(0.035, CAV_Z1 - LEVELS[-1], at=(x, y, (CAV_Z1 + LEVELS[-1]) / 2), mat="metal_steel", segs=6, bevel=0, caps=False)
    # open end caps of the lower half-decks
    for z in LEVELS[:3]:
        for a in (95, 265):
            p0 = (CX + math.cos(math.radians(a)) * 10.0, CY + math.sin(math.radians(a)) * 10.0, z)
            p1 = (CX + math.cos(math.radians(a)) * (CAV_R - 0.3), CY + math.sin(math.radians(a)) * (CAV_R - 0.3), z)
            F.rail([p0, p1])
    for a in (120, 240):
        z = LEVELS[-1]
        p0 = (CX + math.cos(math.radians(a)) * 9.2, CY + math.sin(math.radians(a)) * 9.2, z)
        p1 = (CX + math.cos(math.radians(a)) * 14.0, CY + math.sin(math.radians(a)) * 14.0, z)
        F.rail([p0, p1])
    # crew access arm from the top deck to the hatch in the payload adapter, with the white room at its end
    zc = LEVELS[-1]
    D.box((6.6, 2.2, 0.08), at=(CX - 6.1, CY, zc - 0.04), mat="tread_plate", bevel=0)
    C.box((6.6, 2.2, 0.2), at=(CX - 6.1, CY, zc - 0.11), mat="concrete", bevel=0)
    for s in (-1, 1):
        D.box((6.6, 0.14, 0.5), at=(CX - 6.1, CY + s * 1.1, zc - 0.3), mat="paint_white", bevel=0.02)
        F.rail([(CX - 9.3, CY + s * 1.05, zc), (CX - 5.6, CY + s * 1.05, zc)])
    wr = Part("white_room")
    wr.box((2.6, 2.6, 0.1), at=(-4.2, 0, 2.55), mat="paint_white", bevel=0.02)
    for s in (-1, 1):
        wr.box((2.6, 0.08, 2.5), at=(-4.2, s * 1.26, 1.25), mat="paint_white", bevel=0.02)
    D.add_part(wr, M=T((CX, CY, zc)))
    C.box((2.6, 0.12, 2.5), at=(CX - 4.2, CY + 1.26, zc + 1.25), mat="concrete", bevel=0)
    C.box((2.6, 0.12, 2.5), at=(CX - 4.2, CY - 1.26, zc + 1.25), mat="concrete", bevel=0)
    E.box((1.6, 0.3, 0.03), at=(CX - 4.2, CY, zc + 2.48), mat="emit_white", bevel=0)
    light(F.uid("launch_l"), at=(CX - 4.2, CY, zc + 2.1), color=(0.95, 0.98, 1.0), power=12, dist=7, bake=40, group="launch")
    F.sign(at(CX - 5.5, CY - 1.31, zc + 1.9, 0), "CREW ACCESS", w=1.4, h=0.26)
    marker("board", "ranger", at=(CX - 3.4, CY, zc + 1.0), rot=(0, 0, -90), label="Board Ranger 1")
    marker("work", "crew_arm", at=(CX - 7.5, CY + 0.5, zc), rot=(0, 0, -90), pose="stand", role="crew")

    # ------------------------------------------------------------------ service tower: an alcove off the cavern
    D, E, G = F.section("tower")
    AX0, AX1, AH, ATOP = -33.0, -CAV_R * math.cos(math.radians(11.25)), CAV_R * math.sin(math.radians(11.25)), 26.0
    F.wall((AX0, CY + AH), (AX0, CY - AH), CAV_Z0, ATOP, mat="concrete_panels")
    F.wall((AX0, CY - AH), (AX1, CY - AH), CAV_Z0, ATOP, mat="concrete_panels")
    F.wall((AX1, CY + AH), (AX0, CY + AH), CAV_Z0, ATOP, mat="concrete_panels")
    F.floor(AX0, CY - AH, AX1, CY + AH, CAV_Z0, "concrete_floor")
    F.ceil(AX0, CY - AH, AX1, CY + AH, ATOP)
    XE, XW = -27.0, -31.4            # east and west ends of the stair flights
    YA, YB = CY - 1.5, CY - 3.3      # the two stair lanes
    lv = [CAV_Z0] + LEVELS
    for a_, b_ in zip(lv[:-1], lv[1:]):
        rise = b_ - a_
        nfl = max(2, int(round(rise / 3.0)))
        nfl += nfl % 2               # even number of flights: every level is entered and left at the east end
        fr_ = rise / nfl
        steps = max(8, int(round(fr_ / 0.185)))
        run = (XE - XW) / steps
        for k in range(nfl):
            z0 = a_ + k * fr_
            if k % 2 == 0:
                F.stairs((XE, YA, z0), (-1, 0), 1.3, fr_, steps, run=run, rails="both")
                D.box((AX0 + 0.2 - XW, 3.4, 0.05), at=((AX0 + 0.2 + XW) / 2 * 1.0 if False else (XW + AX0 + 0.2) / 2, CY - 2.4, z0 + fr_ - 0.025), mat="tread_plate", bevel=0)
                C.box((XW - AX0 - 0.2, 3.4, 0.2), at=((XW + AX0 + 0.2) / 2, CY - 2.4, z0 + fr_ - 0.1), mat="concrete", bevel=0)
            else:
                F.stairs((XW, YB, z0), (1, 0), 1.3, fr_, steps, run=run, rails="both")
                if k < nfl - 1:
                    D.box((1.4, 3.4, 0.05), at=(XE + 0.7, CY - 2.4, z0 + fr_ - 0.025), mat="tread_plate", bevel=0)
                    C.box((1.4, 3.4, 0.2), at=(XE + 0.7, CY - 2.4, z0 + fr_ - 0.1), mat="concrete", bevel=0)
                    F.rail([(XE + 1.36, CY - 4.05, z0 + fr_), (XE + 1.36, CY - 0.75, z0 + fr_)])
    # walking route for staff from the main level up to the crew-access level
    rise = LEVELS[-1] - LEVELS[-2]
    nfl = max(2, int(round(rise / 3.0)))
    nfl += nfl % 2
    fr_ = rise / nfl
    route = [(XE + 0.6, YA, LEVELS[-2])]
    for k in range(nfl):
        zt = LEVELS[-2] + (k + 1) * fr_
        if k % 2 == 0:
            route += [(XW - 0.7, YA, zt), (XW - 0.7, YB, zt)]
        else:
            route += [(XE + 0.7, YB, zt)] + ([(XE + 0.7, YA, zt)] if k < nfl - 1 else [])
    route += [(-25.0, CY, LEVELS[-1]), (-18.7, CY, LEVELS[-1]), (-12.6, CY, LEVELS[-1])]
    for k, pnt in enumerate(route):
        marker("nav", f"up{k}", at=pnt, links=f"up{k + 1}" if k < len(route) - 1 else "")
    # level floors of the alcove (the lift well stays open), signs, call buttons, lamps
    for z in LEVELS:
        for (x0_, x1_, y0_, y1_) in [(XE, -23.4, CY - AH + 0.2, CY + 0.5), (-26.5, -23.4, CY + 0.5, CY + AH - 0.2)]:
            D.box((x1_ - x0_, y1_ - y0_, 0.05), at=((x0_ + x1_) / 2, (y0_ + y1_) / 2, z - 0.035), mat="tread_plate", bevel=0)
            C.box((x1_ - x0_, y1_ - y0_, 0.2), at=((x0_ + x1_) / 2, (y0_ + y1_) / 2, z - 0.11), mat="concrete", bevel=0)
        D.box((0.2, 2 * AH - 0.4, 0.3), at=(-23.5, CY, z - 0.2), mat="paint_gray_dark", bevel=0)
        F.sign(at(AX0 + 0.21, CY + 1.0, z + 2.6, 90), f"LEVEL {int(z):+d} m", w=2.0, h=0.4)
        F.wall_lamp(at(AX0 + 0.21, CY - 2.4, z + 3.4, 90), power=12, bake=70, dist=10)
        F.wall_lamp(at(-25.0, CY + AH - 0.21, z + 2.9, 0), power=10, bake=50, dist=8)
        D.box((0.2, 0.08, 0.3), at=(-24.6, CY + AH - 0.24, z + 1.25), mat="paint_yellow", bevel=0.02)
        E.box((0.07, 0.02, 0.07), at=(-24.6, CY + AH - 0.29, z + 1.25), mat="emit_green", bevel=0)
        marker("liftcall", f"lift_{int(z)}", at=(-24.6, CY + AH - 0.35, z + 1.25), level=z, label="Cargo lift")
    for z in (CAV_Z0, -44.0):
        F.wall_lamp(at(AX0 + 0.21, CY - 2.4, z + 3.4, 90), power=12, bake=70, dist=10)
    # bridge from the alcove to the crew-access deck
    zc = LEVELS[-1]
    D.box((9.9, 2.6, 0.05), at=(-18.7, CY, zc - 0.035), mat="tread_plate", bevel=0)
    C.box((9.9, 2.6, 0.2), at=(-18.7, CY, zc - 0.11), mat="concrete", bevel=0)
    for s in (-1, 1):
        D.box((9.9, 0.14, 0.4), at=(-18.7, CY + s * 1.3, zc - 0.25), mat="paint_yellow", bevel=0.02)
        F.rail([(-23.3, CY + s * 1.25, zc), (-14.1, CY + s * 1.25, zc)])
    # lift guide rails and the car (a separate moving part, open toward the cavern)
    LX, LY = -28.45, CY + 2.5
    for s in (-1, 1):
        D.box((0.16, 0.16, ATOP - CAV_Z0), at=(LX + s * 2.05, CY + AH - 0.3, (CAV_Z0 + ATOP) / 2), mat="metal_steel", bevel=0)
    D.box((1.2, 0.8, 0.9), at=(LX, CY + AH - 0.7, ATOP - 0.6), mat="paint_gray_dark", bevel=0.04)
    car = Part("lift_car")
    car.box((3.9, 3.4, 0.12), at=(0, 0, -0.06), mat="tread_plate", bevel=0.01)
    for (px, py) in [(-1.9, -1.65), (1.9, -1.65), (-1.9, 1.65), (1.9, 1.65)]:
        car.box((0.1, 0.1, 2.6), at=(px, py, 1.3), mat="paint_yellow", bevel=0.01)
    car.box((3.9, 3.4, 0.08), at=(0, 0, 2.62), mat="paint_yellow", bevel=0.01)
    for s in (-1, 1):
        car.box((3.8, 0.04, 1.05), at=(0, s * 1.68, 0.55), mat="grating", bevel=0)
    car.box((0.04, 3.3, 1.05), at=(-1.93, 0, 0.55), mat="grating", bevel=0)
    car.box((0.12, 0.3, 0.4), at=(-1.82, 1.2, 1.3), mat="paint_gray_dark", bevel=0.02)
    car.box((0.02, 0.07, 0.07), at=(-1.75, 1.2, 1.4), mat="emit_green", bevel=0)
    car.box((0.02, 0.07, 0.07), at=(-1.75, 1.2, 1.24), mat="emit_amber", bevel=0)
    lift = car.finish(sharp=40)
    lift.location = (LX, LY, 0.0)
    props(lift, kind="lift", id="cargo", part="lift_cargo", dynamic=1, col=0, w=3.9, d=3.4, levels=",".join(str(z) for z in LEVELS), speed=2.6, label="Cargo lift")
    F.dyn.append(lift)
    marker("liftpanel", "cargo", at=(LX - 1.7, LY + 1.2, 1.3), label="Cargo lift")

    # ------------------------------------------------------------------ services, cranes, lighting
    D, E, G = F.section("cavern_fx")
    # propellant risers up the east wall and umbilical arms to the vehicle
    for (a, r, m) in [(-12, 0.24, "paint_white"), (-8, 0.18, "paint_orange"), (8, 0.12, "paint_blue"), (12, 0.1, "paint_gray")]:
        x, y = CX + math.cos(math.radians(a)) * (CAV_R - 0.5), CY + math.sin(math.radians(a)) * (CAV_R - 0.5)
        F.pipe([(x, y, CAV_Z0 + 1.0), (x, y, 14.0)], r=r, mat=m)
    for (z, a, m, sid) in [(-30.0, -10, "paint_white", "umb_lox"), (-16.0, 10, "paint_orange", "umb_lh2"), (-2.5, -6, "paint_white", "umb_s2")]:
        ar = Part(f"umbilical_{sid}")
        ar.box((20.0, 0.5, 0.6), at=(-10.0, 0, 0), mat="paint_yellow", bevel=0.03)
        ar.pipe([(0, 0.0, 0.45), (-19.6, 0.0, 0.45)], 0.16, mat=m, segs=10)
        ar.box((0.9, 0.9, 0.9), at=(-20.1, 0, 0.1), mat="paint_gray_dark", bevel=0.05)
        ob = ar.finish(sharp=40)
        ob.matrix_world = T((CX, CY, z)) @ RZ(a) @ T((CAV_R - 0.6, 0, 0))
        props(ob, kind="swing", id=sid, part=sid, dynamic=1, col=0, angle=62)
        F.dyn.append(ob)
    # ring of flood lights at three heights and red obstruction lights in the shaft
    for z, n, pw, bk in [(-44.0, 6, 34, 240), (-18.0, 8, 34, 230), (6.0, 8, 36, 240), (24.0, 8, 40, 260)]:
        for k in range(n):
            a = math.radians(360 * (k + 0.5) / n + (20 if z > 0 else 0))
            x, y = CX + math.cos(a) * (CAV_R - 0.6), CY + math.sin(a) * (CAV_R - 0.6)
            if 180 < math.degrees(a) % 360 < 360 and abs(math.cos(a) * CAV_R) < TH + 1 and 0 <= z <= 15:
                continue
            M = T((x, y, z)) @ RZ(math.degrees(a) + 90)
            D.box((0.9, 0.35, 0.6), M=M @ T((0, 0.1, 0)) @ RX(18), mat="metal_dark", bevel=0.03)
            E.box((0.78, 0.02, 0.48), M=M @ T((0, 0.29, -0.06)) @ RX(18), mat="emit_warm", bevel=0)
            light(F.uid("launch_l"), at=(CX + math.cos(a) * (CAV_R - 2.4), CY + math.sin(a) * (CAV_R - 2.4), z - 0.6), color=(1.0, 0.93, 0.8), power=pw, dist=30, bake=bk, group="launch")
    for z in (38.0, 50.0, 62.0):
        for k in range(6):
            a = math.radians(60 * k + (30 if int(z) % 24 else 0))
            x, y = CX + math.cos(a) * (SHAFT_R - 0.25), CY + math.sin(a) * (SHAFT_R - 0.25)
            E.box((0.3, 0.3, 0.3), at=(x, y, z), mat="emit_red", bevel=0.05)
            light(F.uid("launch_l"), at=(CX + math.cos(a) * (SHAFT_R - 1.4), CY + math.sin(a) * (SHAFT_R - 1.4), z), color=(1.0, 0.25, 0.15), power=10, dist=16, bake=70, group="launch")
    # maintenance crane parked on the north side under the roof
    for yy in (CY + 17.0, CY + 20.0):
        half = math.sqrt(CAV_R ** 2 - (yy - CY) ** 2) - 0.4
        D.box((2 * half, 0.8, 1.1), at=(CX, yy, 26.6), mat="paint_yellow", bevel=0.04)
    D.box((2.4, 4.0, 1.0), at=(CX + 4.0, CY + 18.5, 27.4), mat="paint_gray_dark", bevel=0.05)
    D.cyl(0.03, 9.0, at=(CX + 4.0, CY + 18.5, 22.4), mat="metal_steel", segs=6, bevel=0)
    D.box((0.6, 0.4, 0.9), at=(CX + 4.0, CY + 18.5, 17.6), mat="paint_yellow", bevel=0.06)
    # automated inspection arm on a wall rail (the "automated maintenance systems")
    rail_z = -6.0
    ring_wall(D, CX, CY, CAV_R - 0.35, rail_z - 0.15, rail_z + 0.15, "metal_steel", segs=96, zstep=1.0, skip=lambda am, zm: not (20 < am < 160))
    rb = Part("inspection_arm")
    rb.box((1.0, 1.2, 0.9), at=(-0.5, 0, 0), mat="paint_orange", bevel=0.05)
    rb.box((4.5, 0.35, 0.35), at=(-3.0, 0, 0.1), rot=(0, -12, 0), mat="paint_orange", bevel=0.04)
    rb.box((3.8, 0.28, 0.28), at=(-6.8, 0, 0.1), rot=(0, 14, 0), mat="paint_gray", bevel=0.04)
    rb.cyl(0.25, 0.5, at=(-8.7, 0, -0.35), mat="metal_dark", segs=14, bevel=0.03)
    rb.box((0.2, 0.02, 0.2), at=(-8.7, -0.26, -0.35), mat="emit_cyan", bevel=0)
    ob = rb.finish(sharp=40)
    ob.matrix_world = T((CX, CY, rail_z)) @ RZ(60) @ T((CAV_R - 0.5, 0, 0))
    props(ob, kind="orbit", id="inspection_arm", part="inspection_arm", dynamic=1, col=0, a0=25, a1=155, period=46)
    F.dyn.append(ob)
    # work positions on the decks
    marker("work", "deck_main_a", at=(CX + 6.5, CY - 17.0, 0), rot=(0, 0, 20), pose="stand", role="eng")
    marker("work", "deck_main_b", at=(CX - 10.5, CY - 5.5, 0), rot=(0, 0, -60), pose="inspect", role="eng")
    marker("work", "deck_low", at=(CX - 12.0, CY + 6.0, -12.0), rot=(0, 0, -115), pose="operate", role="eng")
    marker("nav", "cav0", at=(CX, CY - 19.5, 0), links="cav1,cav2")
    marker("nav", "cav1", at=(CX - 12.5, CY - 13.0, 0), links="cav3")
    marker("nav", "cav2", at=(CX + 12.5, CY - 13.0, 0))
    marker("nav", "cav3", at=(CX - 17.0, CY - 2.5, 0), links="tower0")
    marker("nav", "tower0", at=(-25.2, CY - 2.5, 0))
    marker("spawn", "cavern", at=(CX, CY - 20.0, 0), rot=(0, 0, 0))

    # ------------------------------------------------------------------ silo doors (camouflaged cap)
    objs_extra = []
    for s, name in ((-1, "silo_door_w"), (1, "silo_door_e")):
        P = Part(name)
        pts = [(0.0, -17.0)] + [(s * math.cos(math.radians(a)) * 17.0, math.sin(math.radians(a)) * 17.0) for a in range(-90, 91, 10)] + [(0.0, 17.0)]
        if s < 0:
            pts = pts[::-1]
        P.prism(pts, 1.2, at=(0, 0, -1.2), mat="concrete_dark", bevel=0.05)
        P.prism(pts, 0.08, at=(0, 0, 0.0), mat="dirt", bevel=0)
        ob = P.finish(sharp=40)
        ob.location = (CX, CY, SILO_TOP + 0.02)
        props(ob, kind="silodoor", id=name, part=name, dynamic=1, col=0, travel=18.5 * s)
        F.dyn.append(ob)
    # concrete collar around the opening at the surface
    D.tube(18.5, SHAFT_R, 1.6, at=(CX, CY, SILO_TOP - 0.85), mat="concrete_dark", segs=64, bevel=0.05)

    objs = F.finish(tess=None, rays=10, fill=0.01, sky_dist=60.0)
    return objs + objs_extra


# =====================================================================================================
def rocket_glb():
    """Two-stage launch vehicle that carries Ranger 1 to orbit. Origin at the base of the first stage, +Z up."""
    reset()
    R1, R2 = 3.4, 2.8
    H1, HI, H2, HA = 32.0, 2.2, 12.0, 2.6
    # ---- first stage
    P = Part("stage1")
    P.cyl(R1, H1 - 1.2, at=(0, 0, 1.2 + (H1 - 1.2) / 2), mat="paint_white", segs=48, bevel=0, caps=False)
    for (z, h, m) in [(2.2, 2.0, "paint_black"), (H1 * 0.48, 0.5, "paint_black"), (H1 - 1.4, 1.0, "paint_black")]:
        P.cyl(R1 + 0.012, h, at=(0, 0, z), mat=m, segs=48, bevel=0, caps=False)
    for k in range(8):   # stringers and systems tunnel
        a = math.radians(22.5 + 45 * k)
        P.box((0.12, 0.2, H1 - 6.0), at=(math.cos(a) * (R1 + 0.05), math.sin(a) * (R1 + 0.05), H1 / 2 + 1), rot=(0, 0, math.degrees(a)), mat="paint_white", bevel=0.02)
    P.box((0.5, 0.36, H1 - 4.0), at=(R1 + 0.14, 0, H1 / 2 + 0.5), mat="hull_gray", bevel=0.05)
    # thrust structure and five engines
    P.cyl(R1, 1.2, at=(0, 0, 0.6), r2=R1, mat="hull_gray", segs=48, bevel=0.04)
    P.cyl(R1 * 0.96, 0.3, at=(0, 0, 0.0), mat="metal_dark", segs=48, bevel=0.03)
    eng = [(0.0, 0.0)] + [(math.cos(math.radians(45 + 90 * k)) * 2.05, math.sin(math.radians(45 + 90 * k)) * 2.05) for k in range(4)]
    for i, (x, y) in enumerate(eng):
        prof = [(0.36, 0.0), (0.42, -0.5), (0.66, -1.2), (0.92, -2.0), (1.08, -2.8), (1.13, -3.3)]
        P.lathe(prof, at=(x, y, -0.1), mat="thruster", segs=28)
        P.lathe([(r * 0.97, z) for (r, z) in reversed(prof)], at=(x, y, -0.1), mat="engine_dark", segs=28)
        P.cyl(0.5, 0.7, at=(x, y, 0.1), mat="metal_dark", segs=16, bevel=0.03)
        marker("plume", f"s1_{i}", at=(x, y, -3.4), r=1.13)
    for k in range(4):   # fins
        a = 45 + 90 * k
        pts = [(0, 0), (2.4, 0), (2.9, 1.2), (0.9, 6.2), (0, 7.6)]
        P.prism(pts, 0.22, plane="XZ", M=T((0, 0, 0.3)) @ RZ(a) @ T((R1 - 0.05, 0.11, 0)), mat="hull_gray", bevel=0.05)
    P.text("UNITED STATES", size=1.1, M=T((0, -R1 - 0.02, 21.0)) @ RY(-90) @ RX(90), mat="paint_black", depth=0.01)
    s1 = P.finish(sharp=42)
    props(s1, part="stage1", kind="stage", id="stage1", mass=42000, prop=560000, thrust=9.2e6, isp=285, length=H1)
    # ---- interstage (stays with stage 1)
    P = Part("interstage")
    P.cyl(R1, HI, at=(0, 0, H1 + HI / 2), r2=R2, mat="hull_gray", segs=48, bevel=0, caps=False)
    for k in range(12):
        a = math.radians(30 * k)
        P.box((0.08, 0.14, HI * 1.02), M=T((math.cos(a) * (R1 + R2) / 2, math.sin(a) * (R1 + R2) / 2, H1 + HI / 2)) @ RZ(math.degrees(a)) @ RY(-math.degrees(math.atan2(R1 - R2, HI))), mat="metal_steel", bevel=0)
    i1 = P.finish(sharp=42)
    props(i1, part="interstage")
    # ---- second stage
    Z2 = H1 + HI
    P = Part("stage2")
    P.cyl(R2, H2, at=(0, 0, Z2 + H2 / 2), mat="paint_white", segs=48, bevel=0, caps=False)
    P.cyl(R2 + 0.012, 0.8, at=(0, 0, Z2 + 0.6), mat="paint_black", segs=48, bevel=0, caps=False)
    P.cyl(R2 + 0.012, 0.5, at=(0, 0, Z2 + H2 - 0.5), mat="paint_black", segs=48, bevel=0, caps=False)
    P.cyl(R2 * 0.98, 0.25, at=(0, 0, Z2 + 0.05), mat="metal_dark", segs=48, bevel=0.02)
    P.sphere(R2 * 0.9, at=(0, 0, Z2 + 0.6), mat="hull_blanket", segs=36, rings=16, scale=(1, 1, 0.45))
    prof = [(0.3, 0.0), (0.4, -0.5), (0.8, -1.3), (1.25, -2.2), (1.5, -3.0)]
    P.lathe(prof, at=(0, 0, Z2 - 0.1), mat="thruster", segs=32)
    P.lathe([(r * 0.97, z) for (r, z) in reversed(prof)], at=(0, 0, Z2 - 0.1), mat="engine_dark", segs=32)
    marker("plume", "s2_0", at=(0, 0, Z2 - 3.2), r=1.5)
    P.box((0.4, 0.3, H2 - 2.0), at=(R2 + 0.12, 0, Z2 + H2 / 2), mat="hull_gray", bevel=0.05)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        P.box((0.5, 0.5, 0.4), at=(math.cos(a) * (R2 + 0.15), math.sin(a) * (R2 + 0.15), Z2 + H2 - 1.6), rot=(0, 0, 45 + 90 * k), mat="hull_gray", bevel=0.05)
    s2 = P.finish(sharp=42)
    props(s2, part="stage2", kind="stage", id="stage2", mass=9000, prop=108000, thrust=1.15e6, isp=440, length=H2)
    # ---- payload adapter: a cone frustum with the crew hatch; the Ranger's rear face mates with its top ring
    ZA = Z2 + H2
    P = Part("adapter")
    P.cyl(R2, HA, at=(0, 0, ZA + HA / 2), r2=2.0, mat="paint_white", segs=48, bevel=0, caps=False)
    P.tube(2.05, 1.5, 0.25, at=(0, 0, ZA + HA), mat="metal_steel", segs=48, bevel=0.03)
    P.tube(R2 + 0.02, R2 - 0.3, 0.2, at=(0, 0, ZA + 0.1), mat="metal_steel", segs=48, bevel=0.03)
    P.box((0.12, 1.1, 1.6), at=(-(R2 + 2.0) / 2 - 0.02, 0, ZA + HA / 2), rot=(0, math.degrees(math.atan2(R2 - 2.0, HA)), 0), mat="hull_gray", bevel=0.03)
    P.box((0.14, 0.2, 0.5), at=(-(R2 + 2.0) / 2 - 0.1, 0.42, ZA + HA / 2), mat="handle_yellow", bevel=0.03)
    ad = P.finish(sharp=42)
    props(ad, part="adapter", kind="stage", id="adapter", mass=1200, length=HA)
    marker("mount", "ranger", at=(0, 0, ZA + HA + 0.12))
    marker("vehicle", "launcher", at=(0, 0, 0), height=ZA + HA, r1=R1, r2=R2, h1=H1 + HI, h2=H2)
    bake_ao([s1, i1, s2, ad], rays=14, local_dist=2.5, sky_dist=30.0)
    return [s1, i1, s2, ad]



# =====================================================================================================
def gate_glb():
    """Perimeter checkpoint on the approach road. Origin on the road centre at the fence line, +Y toward the
    facility. Also carries the `fence_panel` part that the engine instances along the perimeter."""
    reset()
    rnd = random.Random(5)
    F = Fac("gate", cell=4.0)
    D, E, G = F.section("gate")
    C = F.C
    # gate posts and the track of the sliding leaf
    for x in (-4.25, 4.25):
        D.box((0.25, 0.25, 3.6), at=(x, 0, 1.8), mat="paint_gray_dark", bevel=0.02)
        C.box((0.25, 0.25, 3.6), at=(x, 0, 1.8), mat="concrete", bevel=0)
        E.box((0.12, 0.12, 0.1), at=(x, 0, 3.66), mat="emit_amber", bevel=0.02)
    D.box((17.6, 0.12, 0.08), at=(4.6, 0.22, 0.04), mat="metal_steel", bevel=0)
    leaf = Part("gate_leaf")
    leaf.box((8.3, 0.06, 0.08), at=(0, 0, 0.2), mat="paint_gray_dark", bevel=0.01)
    leaf.box((8.3, 0.06, 0.08), at=(0, 0, 2.9), mat="paint_gray_dark", bevel=0.01)
    for k in range(6):
        leaf.box((0.07, 0.06, 2.7), at=(-4.15 + k * 1.66, 0, 1.55), mat="paint_gray_dark", bevel=0.01)
    leaf.mesh([(-4.15, 0, 0.2), (4.15, 0, 0.2), (4.15, 0, 2.9), (-4.15, 0, 2.9)], [(0, 1, 2, 3)], mat="chainlink", bevel=0)
    for k in range(3):
        leaf.pipe([(-4.15, 0.06 + k * 0.07, 3.0 + k * 0.1), (4.15, 0.06 + k * 0.07, 3.0 + k * 0.1)], 0.006, mat="metal_steel", segs=4)
    for x in (-3.6, 3.6):
        leaf.cyl(0.09, 0.05, at=(x, 0, 0.09), rot=(90, 0, 0), mat="metal_dark", segs=10, bevel=0)
    lo = leaf.finish(sharp=40)
    lo.location = (0, 0.22, 0)
    props(lo, kind="slide", id="perimeter", part="gate_leaf", travel=8.6, dynamic=1, col=0, label="Perimeter gate", w=8.3, h=3.0, t=0.1, auto=22.0, time=6.5, sound="hatch")
    F.dyn.append(lo)
    # boom barrier a few metres inside
    D.box((0.45, 0.45, 1.1), at=(-4.6, 7.0, 0.55), mat="paint_yellow", bevel=0.03)
    C.box((0.45, 0.45, 1.1), at=(-4.6, 7.0, 0.55), mat="concrete", bevel=0)
    boom = Part("boom")
    for k in range(9):
        boom.box((1.0, 0.09, 0.12), at=(0.5 + k * 1.0, 0, 0), mat="paint_red" if k % 2 == 0 else "paint_white", bevel=0.01)
    boom.box((0.7, 0.14, 0.3), at=(-0.35, 0, 0), mat="paint_gray_dark", bevel=0.02)
    for k in range(3):
        boom.box((0.05, 0.02, 0.05), at=(2.5 + k * 3.0, -0.055, 0), mat="emit_red", bevel=0)
    bo = boom.finish(sharp=40)
    bo.location = (-4.6, 6.7, 1.0)
    props(bo, kind="boom", id="boom", part="boom", dynamic=1, col=0, angle=84, auto=14.0)
    F.dyn.append(bo)
    # guard booth
    bx, by = -7.2, 3.4
    D.box((2.6, 2.6, 0.15), at=(bx, by, 0.075), mat="concrete", bevel=0.02)
    for (px, py) in [(-1.2, -1.2), (1.2, -1.2), (-1.2, 1.2), (1.2, 1.2)]:
        D.box((0.12, 0.12, 2.5), at=(bx + px, by + py, 1.4), mat="paint_gray", bevel=0.01)
    for (cx, cy, w, d) in [(0, -1.2, 2.4, 0.08), (0, 1.2, 2.4, 0.08), (-1.2, 0, 0.08, 2.4), (1.2, 0.5, 0.08, 1.4)]:
        D.box((w, d, 1.0), at=(bx + cx, by + cy, 0.65), mat="paint_gray", bevel=0.01)
        G.box((w if w > 0.1 else 0.012, d if d > 0.1 else 0.012, 1.3), at=(bx + cx, by + cy, 1.8), mat="glass_dirty", bevel=0)
        C.box((w, d, 2.5), at=(bx + cx, by + cy, 1.4), mat="concrete", bevel=0)
    D.box((3.2, 3.2, 0.12), at=(bx, by, 2.72), mat="paint_gray_dark", bevel=0.02)
    D.box((1.6, 0.6, 0.04), at=(bx + 0.2, by - 0.85, 1.0), mat="plastic_dark", bevel=0.01)
    F.screen("gate0", at(bx + 0.2, by - 0.95, 1.3, 180) @ RX(-10), w=0.5, h=0.3, depth=0.03)
    E.box((0.5, 0.12, 0.03), at=(bx, by, 2.64), mat="emit_warm", bevel=0)
    light("gate_booth", at=(bx, by, 2.3), color=(1.0, 0.85, 0.6), power=14, dist=7, group="gate")
    marker("work", "gate_guard", at=(bx + 0.2, by + 0.1, 0.15), rot=(0, 0, 180), pose="stand", role="guard")
    marker("work", "gate_patrol", at=(-2.6, 3.0, 0), rot=(0, 0, 180), pose="stand", role="guard")
    # concrete barriers: a chicane on the approach and a row guarding the booth
    def jersey(x, y, yaw):
        M = at(x, y, 0, yaw)
        prof = [(-0.3, 0), (0.3, 0), (0.3, 0.08), (0.12, 0.3), (0.08, 0.8), (-0.08, 0.8), (-0.12, 0.3), (-0.3, 0.08)]
        D.prism(prof, 2.6, plane="XZ", M=M @ T((0, 1.3, 0)), mat="concrete", bevel=0.01)
        C.box((0.6, 2.6, 0.8), M=M @ T((0, 0, 0.4)), mat="concrete", bevel=0)
    for k in range(2):
        jersey(-2.2 + k * 2.7, -16, 90)
        jersey(2.2 - k * 2.7, -27, 90)
    for k in range(3):
        jersey(-5.6, 0.2 + 1.5 + k * 2.75 - 6.5, 0) if False else None
    for k in range(4):
        jersey(-4.9 - 0.0, -3.2 - k * 2.75, 0)
        jersey(4.9, -3.2 - k * 2.75, 0)
    # camera and floodlight poles
    for (x, y, yaw) in [(5.6, -1.5, 150), (-5.9, 10.5, -40)]:
        D.cyl(0.07, 5.0, at=(x, y, 2.5), mat="paint_gray_dark", segs=10, bevel=0)
        C.cyl(0.08, 5.0, at=(x, y, 2.5), mat="concrete", segs=6, bevel=0)
        F.camera(at(x, y, 4.9, yaw) @ T((0, -0.05, 0)))
    for (x, y, yaw) in [(6.4, 5.0, 115), (-8.4, -5.0, -70)]:
        D.cyl(0.09, 8.0, at=(x, y, 4.0), mat="paint_gray_dark", segs=10, bevel=0)
        C.cyl(0.1, 8.0, at=(x, y, 4.0), mat="concrete", segs=6, bevel=0)
        D.box((1.4, 0.1, 0.1), at=(x, y, 7.9), rot=(0, 0, yaw), mat="paint_gray_dark", bevel=0.01)
        for s in (-0.5, 0.5):
            M = at(x, y, 7.75, yaw) @ T((s, -0.1, 0)) @ RX(40)
            D.box((0.42, 0.2, 0.3), M=M, mat="metal_dark", bevel=0.02)
            E.box((0.36, 0.02, 0.24), M=M @ T((0, -0.11, 0)), mat="emit_warm", bevel=0)
        light(f"gate_flood{x:+.0f}", at=(x, y, 7.5), color=(1.0, 0.9, 0.72), power=70, dist=40, kind="spot", rot=(-52, 0, yaw), group="gate")
    # signs on the fence either side of the gate, intercom post
    F.sign(at(-6.4, -0.06, 1.7, 0), "RESTRICTED AREA", w=2.0, h=0.5, bg="paint_white", fg="paint_red")
    F.sign(at(-6.4, -0.06, 1.2, 0), "U.S. GOVERNMENT PROPERTY  ·  NO TRESPASSING", w=2.0, h=0.22)
    F.sign(at(6.4, -0.06, 1.7, 0), "USE OF DEADLY FORCE AUTHORIZED", w=2.2, h=0.4, bg="paint_white", fg="paint_red")
    F.sign(at(6.4, -0.06, 1.25, 0), "PHOTOGRAPHY PROHIBITED", w=1.6, h=0.22)
    D.cyl(0.05, 1.2, at=(-3.7, -3.5, 0.6), mat="paint_yellow", segs=8, bevel=0)
    D.box((0.3, 0.14, 0.4), at=(-3.7, -3.5, 1.3), mat="metal_dark", bevel=0.02)
    E.box((0.05, 0.01, 0.05), at=(-3.62, -3.58, 1.4), mat="emit_green", bevel=0)
    objs = F.finish(bake=True, lights=False, rays=14, ground_z=0.0, sky_dist=30.0)
    # ---- perimeter fence panel (3 m, origin at the first post)
    P = Part("fence_panel")
    P.cyl(0.035, 3.0, at=(0, 0, 1.5), mat="metal_steel", segs=8, bevel=0)
    P.pipe([(0, 0, 2.95), (3.0, 0, 2.95)], 0.025, mat="metal_steel", segs=6)
    P.pipe([(0, 0, 0.12), (3.0, 0, 0.12)], 0.015, mat="metal_steel", segs=5)
    P.mesh([(0, 0, 0.05), (3.0, 0, 0.05), (3.0, 0, 2.95), (0, 0, 2.95)], [(0, 1, 2, 3)], mat="chainlink", bevel=0)
    P.box((0.04, 0.5, 0.04), at=(0, -0.18, 3.17), rot=(45, 0, 0), mat="metal_steel", bevel=0)
    for k in range(3):
        P.pipe([(0, -0.1 - k * 0.13, 3.1 + k * 0.13), (3.0, -0.1 - k * 0.13, 3.1 + k * 0.13)], 0.005, mat="metal_steel", segs=4)
    fp = P.finish(sharp=40, col=0)
    fp.location = (0, 0, -200)
    props(fp, part="fence_panel")
    bake_ao([fp], rays=8, local_dist=1.0, sky_dist=10.0)
    return objs + [fp]


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("-")] or ["complex", "launch", "rocket", "gate"]
    if "complex" in which:
        complex_glb()
        export_glb("nasa_complex")
        save_blend("nasa_complex")
    if "launch" in which:
        launch_glb()
        export_glb("nasa_launch")
        save_blend("nasa_launch")
    if "rocket" in which:
        rocket_glb()
        export_glb("launch_vehicle")
        save_blend("launch_vehicle")
    if "gate" in which:
        gate_glb()
        export_glb("nasa_gate")
        save_blend("nasa_gate")
