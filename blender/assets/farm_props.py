"""Yard and roadside props for the farm and the county road (references 1-2): poly water tanks, propane tank,
elevated diesel tank, grain bins, utility poles, fence, mailbox, clothes line, sand piles, old implements,
hay bales, road signs — plus the workshop / garage shed (separate GLB with interior and doors)."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from arch import Bldg  # noqa: E402
import furn  # noqa: E402
import veh  # noqa: E402
from furn import place, R, T  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402


def finish(P, name, **kw):
    ob = P.finish(sharp=38, **kw)
    props(ob, part=name)
    return ob


def props_glb():
    reset()
    rnd = random.Random(3)
    out = []
    # ---- blue poly water tank (two stand left of the house in reference 2)
    P = Part("water_tank")
    prof = [(0.0, 0.0), (0.92, 0.0), (0.95, 0.04)]
    for i in range(5):
        z = 0.1 + i * 0.36
        prof += [(0.95, z), (0.99, z + 0.05), (0.99, z + 0.13), (0.95, z + 0.18)]
    prof += [(0.95, 1.95), (0.8, 2.12), (0.3, 2.2), (0.3, 2.26), (0.0, 2.26)]
    P.lathe(prof, mat="plastic_blue", segs=28, bevel=0)
    P.cyl(0.24, 0.07, at=(0, 0, 2.29), mat="plastic_black", segs=18, bevel=0.01)
    P.cyl(0.04, 0.12, at=(0.9, 0, 0.25), rot=(0, 90, 0), mat="plastic_white", segs=10, bevel=0)
    out.append(finish(P, "water_tank"))
    # ---- teal steel tank (far left of reference 1)
    P = Part("steel_tank")
    P.cyl(0.75, 1.9, at=(0, 0, 0.95), mat="paint_teal", segs=24, bevel=0.03)
    for z in (0.5, 1.0, 1.5):
        P.tube(0.765, 0.74, 0.04, at=(0, 0, z), mat="paint_teal", segs=24, bevel=0.006)
    P.lathe([(0.0, 1.9), (0.75, 1.9), (0.0, 2.15)], mat="paint_teal", segs=24, bevel=0)
    out.append(finish(P, "steel_tank"))
    # ---- propane tank on legs (reference 2, right of the porch)
    P = Part("propane_tank")
    P.cyl(0.48, 2.3, at=(0, 0, 0.85), rot=(0, 90, 0), mat="paint_white", segs=22, bevel=0)
    for s in (-1, 1):
        P.sphere(0.48, at=(s * 1.15, 0, 0.85), mat="paint_white", segs=22, rings=12, scale=(0.55, 1, 1))
        P.box((0.12, 0.7, 0.36), at=(s * 0.75, 0, 0.2), mat="paint_gray", bevel=0.02)
    P.cyl(0.14, 0.22, at=(0, 0, 1.4), mat="paint_gray", segs=14, bevel=0.02)
    P.sphere(0.15, at=(0, 0, 1.52), mat="paint_gray", segs=14, rings=8, scale=(1, 1, 0.5))
    out.append(finish(P, "propane_tank"))
    # ---- elevated diesel tank with hose (refuelling point)
    P = Part("fuel_tank")
    for sx in (-0.75, 0.75):
        for sy in (-0.42, 0.42):
            P.box((0.07, 0.07, 1.9), at=(sx, sy, 0.95), rot=(sy * 6, -sx * 5, 0), mat="rust", bevel=0.008)
    for sx in (-0.75, 0.75):
        P.box((0.06, 0.95, 0.06), at=(sx, 0, 1.9), mat="rust", bevel=0.008)
        P.box((0.05, 1.1, 0.05), at=(sx, 0, 0.9), rot=(42, 0, 0), mat="rust", bevel=0.006)
    P.box((1.6, 0.06, 0.06), at=(0, 0.42, 0.55), mat="rust", bevel=0.008)
    P.cyl(0.52, 2.0, at=(0, 0, 2.45), rot=(0, 90, 0), mat="paint_red_faded", segs=22, bevel=0.03)
    P.text("DIESEL", 0.22, at=(0, -0.525, 2.45), rot=(90, 0, 0), mat="paint_white", depth=0.004)
    P.cyl(0.05, 0.1, at=(0.5, 0, 2.99), mat="metal_bare", segs=10, bevel=0.01)
    P.pipe([(-0.8, -0.2, 2.0), (-0.95, -0.25, 1.95), (-1.0, -0.3, 1.0), (-0.85, -0.45, 0.35), (-0.7, -0.5, 1.25)], 0.022, mat="rubber", segs=8, bend=0.25)
    P.box((0.05, 0.1, 0.2), at=(-0.7, -0.5, 1.33), mat="metal_bare", bevel=0.012)
    out.append(finish(P, "fuel_tank"))
    marker("use", "fuel_tank", at=(-0.9, -0.55, 1.2), label="Refuel vehicle")
    # ---- corrugated grain bin
    P = Part("grain_bin")
    Rb, Hb = 3.2, 5.6
    P.cyl(Rb, Hb, at=(0, 0, Hb / 2), mat="corrugated", segs=36, bevel=0, caps=False)
    P.cyl(Rb + 0.12, 0.3, at=(0, 0, 0.15), mat="concrete", segs=36, bevel=0.03)
    for i in range(12):
        a = math.tau * i / 12
        P.box((0.06, 0.05, Hb), at=(math.cos(a) * (Rb + 0.02), math.sin(a) * (Rb + 0.02), Hb / 2), rot=(0, 0, math.degrees(a)), mat="metal_bare", bevel=0.006)
    P.lathe([(Rb + 0.12, Hb), (Rb + 0.12, Hb + 0.05), (0.5, Hb + 1.75), (0.5, Hb + 1.95), (0.0, Hb + 1.95)], mat="metal_bare", segs=36, bevel=0)
    for i in range(36):
        a = math.tau * i / 36
        P.box((Rb + 0.1, 0.03, 0.03), M=R(math.degrees(a)) @ T(((Rb + 0.1) / 2 + 0.25, 0, Hb + 0.92)) @ R(28.5, "Y"), mat="metal_bare", bevel=0)
    veh.ladder(P, T((0, -Rb - 0.08, 0.4)) @ R(-90, "Z"), Hb - 0.2, w=0.4, rungs=14)
    P.box((0.9, 0.06, 1.5), at=(Rb * 0.7, -Rb * 0.72, 1.0), rot=(0, 0, 44), mat="metal_bare", bevel=0.02)
    out.append(finish(P, "grain_bin"))
    # ---- utility pole with cross-arm, insulators and transformer
    for name, tx in (("pole", False), ("pole_tx", True)):
        P = Part(name)
        P.cyl(0.14, 9.0, at=(0, 0, 4.5), r2=0.1, mat="wood_old", segs=12, bevel=0)
        P.box((2.2, 0.1, 0.12), at=(0, 0, 8.4), mat="wood_old", bevel=0.01)
        for s in (-1, 1):
            P.box((0.03, 0.03, 0.9), at=(s * 0.45, 0.06, 8.0), rot=(0, s * 52, 0), mat="metal_dark", bevel=0)
        for x in (-1.0, -0.35, 0.35, 1.0):
            P.lathe([(0.0, 0.0), (0.04, 0.0), (0.05, 0.04), (0.035, 0.07), (0.05, 0.1), (0.03, 0.14), (0.0, 0.14)], at=(x, 0, 8.46), mat="plastic_white", segs=10, bevel=0)
        if tx:
            P.cyl(0.26, 0.75, at=(0.38, 0, 7.2), mat="paint_gray", segs=16, bevel=0.03)
            P.box((0.14, 0.1, 0.1), at=(0.2, 0, 7.3), mat="metal_dark", bevel=0.01)
            for a in (-25, 25):
                P.lathe([(0.0, 0.0), (0.035, 0.0), (0.045, 0.05), (0.03, 0.1), (0.045, 0.15), (0.0, 0.2)], at=(0.38 + math.sin(math.radians(a)) * 0.14, math.cos(math.radians(a)) * 0.1 - 0.05, 7.58), mat="plastic_white", segs=8, bevel=0)
        ob = finish(P, name)
        out.append(ob)
    # ---- fence post + rail section (instanced along lanes), gate
    P = Part("fence")
    for x in (0.0, 2.5):
        P.cyl(0.07, 1.5, at=(x, 0, 0.6), mat="wood_old", segs=8, bevel=0)
    for z in (0.35, 0.7, 1.05):
        P.cyl(0.006, 2.5, at=(1.25, 0, z), rot=(0, 90, 0), mat="metal_dark", segs=5, bevel=0)
    for z in (0.35, 0.7, 1.05):
        for x in (0.4, 0.9, 1.5, 2.1):
            P.cyl(0.012, 0.03, at=(x, 0, z), rot=(0, 90, 0), mat="metal_dark", segs=4, bevel=0)
    out.append(finish(P, "fence", col=0))
    # ---- mailbox
    P = Part("mailbox")
    P.box((0.1, 0.1, 1.1), at=(0, 0, 0.55), mat="wood_old", bevel=0.008)
    P.prism([(-0.09, 0.0), (0.09, 0.0), (0.09, 0.13), (0.06, 0.2), (-0.06, 0.2), (-0.09, 0.13)], 0.48, plane="XZ", at=(0, -0.24, 1.1), mat="metal_bare", bevel=0.01)
    P.box((0.01, 0.05, 0.12), at=(0.1, 0.12, 1.24), mat="paint_red", bevel=0)
    out.append(finish(P, "mailbox"))
    # ---- clothes line with laundry (reference 2, right of the house)
    P = Part("clothesline")
    for x in (-3.0, 3.0):
        P.cyl(0.04, 2.1, at=(x, 0, 1.05), mat="metal_bare", segs=8, bevel=0)
        P.box((0.05, 1.2, 0.05), at=(x, 0, 2.05), mat="metal_bare", bevel=0.006)
    for y in (-0.5, 0.0, 0.5):
        P.cyl(0.004, 6.0, at=(0, y, 2.06), rot=(0, 90, 0), mat="metal_dark", segs=4, bevel=0)
    for i, (x, y, w, h, m) in enumerate(((-1.9, 0.5, 0.7, 0.9, "cloth_white"), (-0.8, 0.5, 0.55, 0.7, "cloth_denim"), (0.5, 0.0, 0.9, 1.1, "cloth_white"), (1.7, 0.0, 0.5, 0.65, "cloth_plaid"), (-0.3, -0.5, 0.6, 0.8, "cloth_khaki"))):
        P.grid(w, h, 5, 5, M=T((x, y, 2.04 - h / 2)) @ R(90, "X"), mat=m, hfn=lambda a, b, i=i: 0.05 * math.sin(a * 6 + i) * (0.5 - b))
    out.append(finish(P, "clothesline", col=0))
    # ---- sand / dust drift pile
    P = Part("sand_pile")
    P.grid(4.0, 3.0, 14, 12, mat="sand", hfn=lambda x, y: max(0.0, 0.75 * math.exp(-((x / 1.3) ** 2 + (y / 1.0) ** 2)) + 0.06 * math.sin(x * 5) * math.cos(y * 4) - 0.02))
    out.append(finish(P, "sand_pile", col=0))
    # ---- old disc harrow (the abandoned implements at the far left of reference 1)
    P = Part("old_harrow")
    P.box((3.6, 0.1, 0.1), at=(0, 0.4, 0.75), mat="rust", bevel=0.01)
    P.box((3.6, 0.1, 0.1), at=(0, -0.4, 0.75), mat="rust", bevel=0.01)
    for s in (-1, 1):
        P.box((0.1, 0.9, 0.1), at=(s * 1.7, 0, 0.75), mat="rust", bevel=0.01)
    P.box((0.1, 2.4, 0.1), at=(0, 1.5, 0.7), rot=(-6, 0, 0), mat="rust", bevel=0.01)
    for y in (0.4, -0.4):
        P.cyl(0.03, 3.4, at=(0, y, 0.36), rot=(0, 90, 0), mat="rust_heavy", segs=8, bevel=0)
        for i in range(12):
            P.lathe([(0.0, 0.0), (0.3, 0.05), (0.3, 0.06), (0.0, 0.012)], M=T((-1.55 + i * 0.28, y, 0.36)) @ R(90, "Y"), mat="rust_heavy", segs=14, bevel=0)
    for s in (-1, 1):
        tp = Part("_t")
        veh.tyre(tp, 0.33, 0.2, 0.18, "road")
        veh.rim(tp, 0.18, 0.2, "rust")
        P.add_part(tp, T((s * 1.95, 0, 0.33)))
    out.append(finish(P, "old_harrow"))
    # ---- round hay bale
    P = Part("hay_bale")
    P.cyl(0.75, 1.4, at=(0, 0, 0.75), rot=(0, 90, 0), mat="foliage_dry", segs=20, bevel=0.04)
    for x in (-0.45, 0.0, 0.45):
        P.tube(0.76, 0.74, 0.02, at=(x, 0, 0.75), rot=(0, 90, 0), mat="plastic_white", segs=20, bevel=0)
    out.append(finish(P, "hay_bale"))
    # ---- road sign (diamond warning) and a route marker
    P = Part("sign_warning")
    P.cyl(0.03, 2.4, at=(0, 0, 1.2), mat="metal_bare", segs=8, bevel=0)
    P.box((0.62, 0.012, 0.62), at=(0, -0.035, 2.1), rot=(0, 45, 0), mat="paint_yellow", bevel=0.004)
    out.append(finish(P, "sign_warning", col=0))
    P = Part("sign_closed")
    for x in (-0.9, 0.9):
        P.box((0.08, 0.08, 1.3), at=(x, 0, 0.65), mat="wood_old", bevel=0.008)
    P.box((2.2, 0.03, 0.5), at=(0, -0.05, 1.0), mat="paint_white", bevel=0.006)
    P.text("NO THRU ROAD", 0.2, at=(0, -0.07, 1.06), rot=(90, 0, 0), mat="paint_black", depth=0.003)
    P.text("AUTHORIZED VEHICLES ONLY", 0.085, at=(0, -0.07, 0.86), rot=(90, 0, 0), mat="paint_black", depth=0.003)
    out.append(finish(P, "sign_closed", col=0))
    # lay the props out in a row so the .blend is readable; the engine places clones by part name
    for i, o in enumerate(out):
        o.location.x = i * 8.0
    for m in bpy.data.objects:
        if m.name.startswith("mk_use_fuel"):
            m.parent = [o for o in out if o.get("part") == "fuel_tank"][0]
    bake_ao(out, ground_z=0.0, local_dist=1.2)
    return out


def shed():
    """Workshop + garage: a corrugated pole barn with an open vehicle bay and an enclosed, lit workshop."""
    reset()
    B = Bldg("shed")
    B.T_OUT, B.T_IN = 0.04, 0.035
    E, I, C = B.ext, B.int, B.col
    W, D, EAVE, PITCH = 12.0, 8.0, 3.7, 17.0
    RIDGE = EAVE + (D / 2) * math.tan(math.radians(PITCH))
    WT = B.T_OUT + B.T_IN
    PX = 6.6                                   # partition between garage (x < PX) and workshop
    # slab
    E.box((W + 0.6, D + 0.6, 0.2), at=(W / 2, D / 2, 0.0), mat="concrete_floor", bevel=0.02)
    C.box((W + 0.6, D + 0.6, 0.2), at=(W / 2, D / 2, 0.0), mat="concrete", bevel=0)
    F = 0.1
    # walls (interior to the left of travel): south wall has the open garage bay and the workshop door + window
    Ms, _ = B.wall((0, 0), (W, 0), F, EAVE, out="corrugated", inn="wood_old", openings=[(0.7, 5.9, F, F + 3.1), (7.4, 8.35, F, F + 2.05), (9.4, 10.9, F + 1.0, F + 2.2)])
    B.window(Ms, 9.4, 10.9, F + 1.0, F + 2.2, style="fixed", T=WT, ext_mat="paint_gray")
    B.door("workshop", Ms, 7.4, F, w=0.95, h=2.05, T=WT, hinge="left", swing="in", style="steel", mat="paint_gray", ext_mat="paint_gray", label="Workshop door")
    B.wall((W, 0), (W, D), F, EAVE, out="corrugated", inn="wood_old", gable=[(D / 2, RIDGE)], openings=[(2.5, 4.0, F + 1.0, F + 2.2)])
    Me, _ = B.wall_frame((W, 0), (W, D))
    B.window(Me, 2.5, 4.0, F + 1.0, F + 2.2, style="fixed", T=WT, ext_mat="paint_gray")
    B.wall((W, D), (0, D), F, EAVE, out="corrugated", inn="wood_old")
    B.wall((0, D), (0, 0), F, EAVE, out="corrugated", inn="wood_old", gable=[(D / 2, RIDGE)])
    B.inside = True
    Mp, _ = B.partition((PX, WT), (PX, D - WT), F, EAVE, mat="wood_old", openings=[(1.0, 2.0, F, F + 2.1)], t=0.1)
    # garage bay frame and header
    E.box((5.4, 0.12, 0.3), at=(3.3, 0.0, F + 3.25), mat="paint_gray", bevel=0.01)
    for x in (0.7, 5.9):
        E.box((0.14, 0.14, 3.1), at=(x, 0.0, F + 1.55), mat="paint_gray", bevel=0.01)
    # roof (ridge along X), trusses
    for a, b, inward in (((0, 0), (W, 0), (0, 1)), ((0, D), (W, D), (0, -1))):
        B.roof_slab(a, b, EAVE, inward, D / 2, PITCH, t=0.07, overhang=0.4, rake=0.3, mat="corrugated", under="wood_old", fascia="paint_gray")
    E.box((W + 0.6, 0.3, 0.04), at=(W / 2, D / 2, RIDGE + 0.1), mat="metal_bare", bevel=0.01)
    for x in (0.2, 3.0, 5.9, 9.0, 11.8):
        I.box((0.06, D - 0.2, 0.14), at=(x, D / 2, EAVE - 0.07), mat="wood_old", bevel=0.006)
        for s in (-1, 1):
            L = (D / 2) / math.cos(math.radians(PITCH))
            I.box((0.06, L, 0.12), at=(x, D / 2 + s * D / 4, (EAVE + RIDGE) / 2 - 0.1), rot=(-s * PITCH, 0, 0), mat="wood_old", bevel=0.006)
        I.box((0.06, 0.06, RIDGE - EAVE - 0.1), at=(x, D / 2, (EAVE + RIDGE) / 2), mat="wood_old", bevel=0.004)
    # ---- workshop fit-out
    furn.workbench(I, C, place(9.6, D - 0.5, F, 0), w=3.6, seed=4)
    furn.shelf_unit(I, C, place(W - 0.4, 5.3, F, -90), w=1.8, h=2.1, seed=12)
    furn.shelf_unit(I, C, place(PX + 0.4, 5.6, F, 90), w=1.6, h=2.1, seed=13)
    I.box((0.72, 0.48, 0.95), at=(PX + 0.45, 3.4, F + 0.5), mat="paint_red", bevel=0.02)               # roller tool chest
    for i in range(5):
        I.box((0.74, 0.02, 0.14), at=(PX + 0.45, 3.15, F + 0.2 + i * 0.17), rot=(0, 0, 0), mat="paint_red", bevel=0.008)
        I.box((0.4, 0.02, 0.02), at=(PX + 0.45, 3.13, F + 0.2 + i * 0.17), mat="metal_chrome", bevel=0.004)
    C.box((0.72, 0.5, 0.95), at=(PX + 0.45, 3.4, F + 0.5), mat="concrete", bevel=0)
    furn.barrel(I, C, place(W - 0.6, 1.1, F), mat="paint_blue")
    furn.barrel(I, C, place(W - 0.6, 1.75, F), mat="rust")
    furn.crate(I, C, place(8.3, 5.0, F, 15), 0.9, 0.7, 0.6)
    I.box((0.5, 0.75, 0.5), at=(10.9, 1.2, F + 0.45), mat="paint_yellow", bevel=0.04)                   # generator
    I.box((0.56, 0.8, 0.06), at=(10.9, 1.2, F + 0.18), mat="metal_dark", bevel=0.01)
    C.box((0.56, 0.8, 0.7), at=(10.9, 1.2, F + 0.35), mat="concrete", bevel=0)
    for k in range(3):                                                                                 # tyre stack
        tp = Part("_t")
        veh.tyre(tp, 0.4, 0.27, 0.215, "road")
        I.add_part(tp, T((7.4, D - 0.75, F + 0.14 + k * 0.28)) @ R(90, "Y"))
    C.cyl(0.42, 0.85, at=(7.4, D - 0.75, F + 0.42), mat="concrete", segs=8, bevel=0)
    # welding cart, stool, parts washer
    I.cyl(0.11, 1.2, at=(8.6, 1.0, F + 0.75), mat="paint_green", segs=14, bevel=0.02)
    I.box((0.4, 0.5, 0.06), at=(8.6, 1.0, F + 0.12), mat="metal_dark", bevel=0.01)
    furn.chair(I, C, place(9.4, D - 1.5, F, 170), seat="metal_dark", frame="metal_dark", h=0.6, w=0.36, back=0.62)
    # ---- garage bay: oil stains are in the concrete texture; add jack stands, a creeper, fuel cans, wall hooks
    for (x, y) in ((1.2, 6.9), (1.7, 6.9)):
        I.box((0.3, 0.38, 0.42), at=(x, y, F + 0.21), mat="paint_red_faded", bevel=0.03)
    furn.shelf_unit(I, C, place(0.42, 4.0, F, 90), w=2.2, h=2.0, seed=17)
    I.box((0.5, 1.0, 0.06), at=(5.2, 6.8, F + 0.08), mat="plastic_dark", bevel=0.02)
    I.box((0.06, 3.0, 0.12), at=(PX - 0.1, 5.5, F + 1.9), mat="wood_old", bevel=0.01)
    for k in range(5):
        I.pipe([(PX - 0.14, 4.3 + k * 0.55, F + 1.9), (PX - 0.3, 4.3 + k * 0.55, F + 1.86), (PX - 0.3, 4.3 + k * 0.55, F + 1.2 - (k % 2) * 0.3)], 0.012, mat=["rubber", "paint_orange", "metal_dark", "paint_yellow", "rubber"][k], segs=6)
    # ---- lights + switch
    def tube_light(x, y, rid):
        I.box((1.3, 0.16, 0.06), at=(x, y, EAVE - 0.2), mat="paint_white", bevel=0.01)
        I.box((1.22, 0.1, 0.02), at=(x, y, EAVE - 0.24), mat="plastic_white", bevel=0)
        for s in (-1, 1):
            I.cyl(0.004, 0.2, at=(x + s * 0.5, y, EAVE - 0.07), mat="metal_dark", segs=4, bevel=0)
        light(f"{rid}_{int(x)}", (x, y, EAVE - 0.35), color=(0.92, 0.97, 1.0), power=85, dist=10, room=rid, group="shed")
    tube_light(9.3, 2.6, "workshop")
    tube_light(9.3, 5.6, "workshop")
    tube_light(3.3, 4.0, "garage")
    furn.switch_plate(I, T((7.25, WT + 0.004, F + 1.3)) @ R(180))
    marker("switch", "workshop", at=(7.25, WT + 0.004, F + 1.3), room="workshop", label="Workshop lights")
    furn.switch_plate(I, T((PX - 0.056, 0.75, F + 1.3)) @ R(-90))
    marker("switch", "garage", at=(PX - 0.056, 0.75, F + 1.3), room="garage", label="Garage lights")
    marker("park", "garage", at=(3.3, 3.4, F), rot=(0, 0, 0))
    ext = E.finish(sharp=35, col=0)
    inte = I.finish(sharp=35, col=0)
    glass = B.glass.finish(sharp=35, col=0, shadow=0)
    col = C.finish(weighted=False, colonly=1)
    props(ext, part="exterior")
    props(inte, part="interior")
    bake_ao([ext, inte] + B.dyn, ground_z=0.0)
    return ext


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    pv = "--preview" in sys.argv
    if not only or "props" in only:
        props_glb()
        if pv:
            preview("farm_props", (48, -42, 22), (48, 0, 2), res=(1500, 500), lens=50, samples=24)
        export_glb("farm_props")
        save_blend("farm_props")
    if not only or "shed" in only:
        shed()
        if pv:
            preview("shed", (-6, -13, 5), (6, 3, 2), res=(1200, 700), lens=32, samples=32, sun_rot=(55, 0, 200))
            preview("shed_in", (7.2, 0.9, 1.75), (11.0, 7.0, 1.2), res=(1000, 620), lens=17, samples=48, sun_rot=(55, 0, 200), sky_strength=5.0, exposure=1.0)
        export_glb("farm_shed")
        save_blend("farm_shed")
