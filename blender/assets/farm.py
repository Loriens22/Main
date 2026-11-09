"""
Cooper-style farmstead (reference images 1–2): two-storey gable-front farmhouse with a lower west wing and a
long covered front porch wrapping the east side, weathered pale clapboard, shingle roofs, weathervane on the wing,
satellite dish, exterior chimney. Full interior; plus workshop/garage, barn, grain bins, tanks, fuel station,
power poles, fence, clothesline and yard clutter.

Blender: X east, Y north, Z up; origin = centre of the main block at ground level. Exports:
  public/assets/models/farm.glb            (enterable farmstead)
  public/assets/models/neighbor_house.glb  (exterior-only variant for neighbouring farms)
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import kit, arch
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props

F0, C0, F1, C1 = 0.55, 3.15, 3.35, 5.9
EAVE, RIDGE = 6.2, 6.2 + 3.75 * math.tan(math.radians(40))
W_EAVE, W_RIDGE = 3.6, 3.6 + 4.0 * math.tan(math.radians(35))
PI = math.pi


def ext_wall(name, a, b, z0, z1, ops, P, siding_ranges=None, inner_m="plaster_wall"):
    """Exterior wall: siding skin (outer 4 cm) + plaster core. siding_ranges limits siding to (z0,z1) bands."""
    arch.wall(name + "_in", a, b, z0, z1, 0.16, inner_m, ops, offset=0.12, parts=P)
    for (s0, s1) in (siding_ranges or [(z0, z1)]):
        ops2 = [o for o in ops if o[3] > s0 and o[2] < s1]
        ops2 = [(c, w, max(sill, s0), min(head, s1)) for (c, w, sill, head) in ops2]
        arch.wall(name + "_sd", a, b, s0, s1, 0.045, "wood_siding", ops2, offset=0.0225, parts=P)


def build_house(root, interior=True):
    P, G, L = [], [], []   # static parts, glass, lamp emissives
    lights = []
    # ------------------------------------------------------------------ foundation
    P.append(box("found_main", (7.6, 9.1, 0.4), loc=(0, 0, 0.17), m="concrete_dark"))
    P.append(box("found_wing", (8.1, 7.1, 0.4), loc=(-7.75, -1.0, 0.17), m="concrete_dark"))
    # ------------------------------------------------------------------ main block exterior walls (CCW)
    gw = (F0 + 0.8, F0 + 2.25)    # ground window sill/head
    uw = (F1 + 0.85, F1 + 2.3)
    S = [(4.75, 0.95, F0, F0 + 2.1), (2.0, 1.0, *gw), (1.8, 0.95, *uw), (5.9, 0.95, *uw)]
    ext_wall("w_s", (-3.75, -4.5), (3.75, -4.5), 0.35, EAVE, S, P)
    E = [(2.2, 1.0, *gw), (6.9, 0.8, F0 + 1.1, F0 + 2.25), (2.0, 0.95, *uw), (7.6, 0.8, *uw)]
    ext_wall("w_e", (3.75, -4.5), (3.75, 4.5), 0.35, EAVE, E, P)
    N = [(6.25, 0.92, F0, F0 + 2.05), (3.2, 1.1, F0 + 1.0, F0 + 2.1), (5.5, 0.95, *uw), (2.0, 0.8, *uw)]
    ext_wall("w_n", (3.75, 4.5), (-3.75, 4.5), 0.35, EAVE, N, P)
    Wst = [(1.0, 0.9, *gw), (6.5, 0.95, F0, F0 + 2.1), (2.5, 0.95, *uw), (6.5, 0.95, *uw)]
    # west wall: plaster core full; siding only on the free part (north 2 m) and above the wing roof
    arch.wall("w_w_in", (-3.75, 4.5), (-3.75, -4.5), 0.35, EAVE, 0.16, "plaster_wall", Wst, offset=0.12, parts=P)
    arch.wall("w_w_sdN", (-3.75, 4.5), (-3.75, 2.5), 0.35, EAVE, 0.045, "wood_siding", [(1.0, 0.9, *gw)], offset=0.0225, parts=P)
    arch.wall("w_w_sdU", (-3.75, 2.5), (-3.75, -4.5), W_EAVE, EAVE, 0.045, "wood_siding", [(0.5, 0.95, *uw), (4.5, 0.95, *uw)], offset=0.0225, parts=P)
    arch.wall("w_w_wing", (-3.75, 2.5), (-3.75, -4.5), 0.35, W_EAVE, 0.045, "plaster_wall", [(4.5, 0.95, F0, F0 + 2.1)], offset=-0.0225, parts=P)
    # gables
    arch.gable_wall("gab_s", -3.75, 3.75, -4.5 + 0.03, EAVE, RIDGE, 0.06, "wood_siding", P)
    arch.gable_wall("gab_n", -3.75, 3.75, 4.5 - 0.03, EAVE, RIDGE, 0.06, "wood_siding", P)
    arch.window("attic_s", (0, -4.5, EAVE + 1.0), 0.6, 0.7, 0, P, G, sash=(1, 1))
    arch.window("attic_n", (0, 4.5, EAVE + 1.0), 0.6, 0.7, PI, P, G, sash=(1, 1))
    # windows (frames, trim, glass) at the openings
    for (c, w, s, hd) in S[1:]:
        arch.window("win_s", (-3.75 + c, -4.5 + 0.1, (s + hd) / 2), w, hd - s, 0, P, G)
    for (c, w, s, hd) in E:
        arch.window("win_e", (3.75 - 0.1, -4.5 + c, (s + hd) / 2), w, hd - s, PI / 2, P, G)
    for (c, w, s, hd) in N[1:]:
        arch.window("win_n", (3.75 - c, 4.5 - 0.1, (s + hd) / 2), w, hd - s, PI, P, G)
    for (c, w, s, hd) in [Wst[0], Wst[2], Wst[3]]:
        arch.window("win_w", (-3.75 + 0.1, 4.5 - c, (s + hd) / 2), w, hd - s, -PI / 2, P, G)
    # corner boards & frieze
    for (x, y) in ((-3.77, -4.52), (3.77, -4.52), (3.77, 4.52), (-3.77, 4.52)):
        P.append(box("corner", (0.14, 0.14, EAVE - 0.35), loc=(x, y, (EAVE + 0.35) / 2), m="wood_trim"))
    for (x0, y0, x1, y1) in ((-3.8, -4.55, 3.8, -4.55), (-3.8, 4.55, 3.8, 4.55)):
        P.append(box("frieze", (7.6, 0.05, 0.22), loc=((x0 + x1) / 2, y0, EAVE - 0.11), m="wood_trim"))
    for x in (-3.8, 3.8):
        P.append(box("frieze_side", (0.05, 9.1, 0.22), loc=(x, 0, EAVE - 0.11), m="wood_trim"))
    # main roof
    arch.gable_roof("roof_main", -3.75, 3.75, -4.5, 4.5, EAVE, RIDGE, over=0.45, ridge_axis="y", parts=P)
    # gutters & downspouts
    for side in (-1, 1):
        P.append(box("gutter", (0.12, 9.9, 0.1), loc=(side * 4.24, 0, EAVE - 0.38), m="steel_galv"))
    for (x, y) in ((4.24, -4.9), (4.24, 4.9), (-4.24, 4.9)):
        P.append(kit.tube("downspout", [(x, y, EAVE - 0.4), (x, y, 0.15), (x, y - 0.25 if y < 0 else y + 0.25, 0.05)], 0.04, m="steel_galv", seg=8))

    # ------------------------------------------------------------------ wing
    WS = [(2.25, 0.95, F0, F0 + 2.1), (5.5, 1.0, *gw)]
    ext_wall("ww_s", (-11.75, -4.5), (-3.75, -4.5), 0.35, W_EAVE, WS, P)
    WW = [(2.0, 0.9, F0 + 0.95, F0 + 2.1), (5.5, 1.0, *gw)]
    ext_wall("ww_w", (-11.75, 2.5), (-11.75, -4.5), 0.35, W_EAVE, WW, P)
    WN = [(6.0, 0.9, F0, F0 + 2.05), (2.0, 0.9, F0 + 0.95, F0 + 2.1)]
    ext_wall("ww_n", (-3.75, 2.5), (-11.75, 2.5), 0.35, W_EAVE, WN, P)
    arch.gable_wall("wgab_s", -11.75, -3.75, -4.5 + 0.03, W_EAVE, W_RIDGE, 0.06, "wood_siding", P)
    arch.gable_wall("wgab_n", -11.75, -3.75, 2.5 - 0.03, W_EAVE, W_RIDGE, 0.06, "wood_siding", P)
    arch.window("wattic", (-7.75, -4.5, W_EAVE + 0.9), 0.5, 0.6, 0, P, G, sash=(1, 1))
    arch.window("wwin_s", (-11.75 + 5.5, -4.5 + 0.1, sum(gw) / 2), 1.0, gw[1] - gw[0], 0, P, G)
    for (c, w, s, hd) in WW:
        arch.window("wwin_w", (-11.75 + 0.1, 2.5 - c, (s + hd) / 2), w, hd - s, -PI / 2, P, G)
    arch.window("wwin_n", (-3.75 - 2.0, 2.5 - 0.1, (F0 + 0.95 + F0 + 2.1) / 2), 0.9, 1.15, PI, P, G)
    for (x, y) in ((-11.77, -4.52), (-11.77, 2.52)):
        P.append(box("wcorner", (0.14, 0.14, W_EAVE - 0.35), loc=(x, y, (W_EAVE + 0.35) / 2), m="wood_trim"))
    arch.gable_roof("roof_wing", -11.75, -3.75, -4.5, 2.5, W_EAVE, W_RIDGE, over=0.4, ridge_axis="y", parts=P)
    P.append(box("wgutter", (0.12, 7.8, 0.1), loc=(-12.2, -1.0, W_EAVE - 0.33), m="steel_galv"))
    # exterior chimney (north wall)
    P.append(box("chimney", (0.75, 0.6, 9.9), loc=(-1.0, 4.82, 4.95), m="brick", bevel=0.01))
    P.append(box("chimney_cap", (0.9, 0.75, 0.1), loc=(-1.0, 4.82, 9.95), m="concrete_dark"))
    P.append(cyl("flue", 0.12, 0.6, loc=(-1.0, 4.82, 10.3), m="metal_dark"))
    # wing stove pipe
    P.append(cyl("stovepipe", 0.09, 1.4, loc=(-10.2, 0.8, W_RIDGE - 0.6), m="metal_dark"))
    P.append(cyl("stovepipe_cap", 0.16, 0.08, r2=0.04, loc=(-10.2, 0.8, W_RIDGE + 0.2), m="metal_dark"))
    # weathervane on the wing ridge (images 1-2)
    vx, vy, vz = -7.75, -3.2, W_RIDGE + 0.2
    P.append(cyl("vane_pole", 0.02, 1.3, loc=(vx, vy, vz + 0.65), m="metal_dark", verts=8))
    for ang, lab in ((0, "NS"), (PI / 2, "EW")):
        P.append(box("vane_cross", (0.7, 0.02, 0.02), loc=(vx, vy, vz + 0.75), rot=(0, 0, ang), m="metal_dark"))
    arrow = prism("vane_arrow", [(-0.5, -0.03), (0.35, -0.03), (0.35, -0.1), (0.55, 0.0), (0.35, 0.1), (0.35, 0.03), (-0.5, 0.03), (-0.6, 0.15), (-0.6, -0.15)], -0.008, 0.008, m="metal_dark")
    arrow.rotation_euler = (PI / 2, 0, 0.6)
    arrow.location = (vx, vy, vz + 1.15)
    P.append(arrow)
    rooster = prism("vane_rooster", [(-0.25, 0), (0.2, 0), (0.28, 0.2), (0.18, 0.32), (0.05, 0.24), (-0.05, 0.42), (-0.2, 0.3), (-0.32, 0.38), (-0.3, 0.1)], -0.006, 0.006, m="metal_dark")
    rooster.rotation_euler = (PI / 2, 0, 0.6)
    rooster.location = (vx, vy, vz + 1.22)
    P.append(rooster)
    # satellite dish on the main block's west wall (image 2)
    P.append(box("dish_bracket", (0.3, 0.08, 0.08), loc=(-3.95, 3.4, 4.9), m="metal_gray"))
    dish = kit.lathe("dish", [(0.0, 0.0), (0.2, 0.012), (0.35, 0.045), (0.42, 0.07), (0.42, 0.08), (0.0, 0.03)], m="steel_painted_white", seg=24, loc=(-4.2, 3.4, 4.95), rot=(0, -PI / 2 + 0.6, 0.6))
    P.append(dish)
    P.append(cyl("dish_arm", 0.012, 0.5, loc=(-4.45, 3.25, 4.95), rot=(0, PI / 2 - 0.5, 0.6), m="metal_gray", verts=6))

    # ------------------------------------------------------------------ porch (front + east wrap)
    P.append(box("porch_deck", (15.5, 2.6, 0.1), loc=(-4.0, -5.8, 0.45), m="wood_raw"))
    P.append(box("porch_deck_e", (2.6, 8.1, 0.1), loc=(5.05, -3.05, 0.45), m="wood_raw"))
    for k in range(60):
        P.append(box("porch_board", (0.012, 2.6, 0.011), loc=(-11.7 + k * 0.26, -5.8, 0.505), m="wood_dark"))
    P.append(box("porch_skirt_s", (18.2, 0.04, 0.4), loc=(-2.7, -7.1, 0.2), m="wood_trim"))
    P.append(box("porch_skirt_e", (0.04, 8.1, 0.4), loc=(6.35, -3.05, 0.2), m="wood_trim"))
    posts = [(-11.6, -7.0), (-9.1, -7.0), (-6.6, -7.0), (-4.1, -7.0), (-1.6, -7.0), (0.0, -7.0), (2.1, -7.0), (4.2, -7.0), (6.25, -7.0), (6.25, -4.4), (6.25, -1.8), (6.25, 0.9)]
    for (x, y) in posts:
        P.append(box("post", (0.12, 0.12, 2.3), loc=(x, y, 0.5 + 1.15), m="wood_trim", bevel=0.01))
        P.append(box("post_cap", (0.18, 0.18, 0.08), loc=(x, y, 2.82), m="wood_trim"))
    P.append(box("beam_s", (18.4, 0.14, 0.2), loc=(-2.7, -7.0, 2.92), m="wood_trim"))
    P.append(box("beam_e", (0.14, 8.0, 0.2), loc=(6.25, -3.05, 2.92), m="wood_trim"))
    ps = math.atan2(0.45, 2.6)
    P.append(box("porch_roof", (18.9, 2.95, 0.08), loc=(-2.7, -5.9, 3.24), rot=(-ps, 0, 0), m="roof_metal"))
    P.append(box("porch_roof_e", (2.95, 6.4, 0.08), loc=(5.15, -2.05, 3.24), rot=(0, ps, 0), m="roof_metal"))
    # steps
    for (cx, w) in ((1.0, 1.6), (-9.5, 1.4)):
        for k in range(3):
            P.append(box("step", (w, 0.3, 0.16), loc=(cx, -7.25 - k * 0.28, 0.42 - k * 0.15), m="wood_raw", bevel=0.01))
    # porch clutter (image 2): rocking chairs, bench, bicycles, crates
    for (x, y, r) in ((-2.6, -6.1, 0.3), (-5.6, -6.0, -0.2)):
        arch.chair("rocker", (x, y, 0.5), r, "wood_dark", P)
    P.append(box("bench", (1.6, 0.4, 0.05), loc=(-8.0, -4.85, 0.95), m="wood_raw"))
    for sx in (-0.7, 0.7):
        P.append(box("bench_leg", (0.06, 0.35, 0.45), loc=(-8.0 + sx, -4.85, 0.72), m="wood_raw"))
    for i, (x, y, r) in enumerate(((3.0, -6.3, 0.15), (4.4, -6.5, -0.1))):
        bike(P, (x, y, 0.5), r)
    for (x, y) in ((5.4, -1.0), (5.6, -0.2), (-10.8, -5.3)):
        P.append(box("crate", (0.55, 0.45, 0.4), loc=(x, y, 0.7), rot=(0, 0, random.uniform(-0.3, 0.3)), m="wood_raw", bevel=0.01))
    # porch light
    P.append(box("porchlamp_box", (0.14, 0.12, 0.22), loc=(1.75, -4.62, 2.4), m="metal_dark"))
    L.append(box("lampE|porch|porch", (0.1, 0.08, 0.14), loc=(1.75, -4.7, 2.36), m="emit_warm"))
    lights.append(empty("light_porch_0", loc=(1.75, -5.2, 2.3), parent=root, light="warm", group="porch", intensity=3.0, distance=8))

    if interior:
        build_interior(root, P, G, L, lights)

    return P, G, L, lights


def bike(P, loc, rot):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def Q(lx, lz):
        return (x + lx * c, y + lx * s, z + lz)
    for lx in (-0.52, 0.52):
        P.append(kit.torus("bike_wheel", 0.33, 0.018, loc=Q(lx, 0.34), rot=(PI / 2, 0, rot), m="rubber_black", seg=24, rseg=6))
    for (a, b) in (((-0.52, 0.34), (0.0, 0.34)), ((0.0, 0.34), (0.42, 0.72)), ((-0.52, 0.34), (-0.15, 0.72)), ((-0.15, 0.72), (0.42, 0.72)), ((0.0, 0.34), (-0.15, 0.72)), ((0.42, 0.72), (0.52, 0.34)), ((0.42, 0.72), (0.38, 0.95))):
        pa, pb = Q(*a), Q(*b)
        P.append(kit.tube("bike_frame", [pa, pb], 0.015, m="farm_red_faded", seg=6))
    P.append(box("bike_seat", (0.22, 0.08, 0.04), loc=Q(-0.17, 0.78), rot=(0, 0, rot), m="leather_brown"))
    P.append(box("bike_bar", (0.05, 0.5, 0.025), loc=Q(0.38, 0.96), rot=(0, 0, rot), m="metal_gray"))


def build_interior(root, P, G, L, lights):
    # ---- floors & ceilings
    P.append(box("floor0_main", (7.1, 8.6, 0.2), loc=(0, 0, F0 - 0.1), m="wood_floor"))
    P.append(box("floor0_wing", (7.6, 6.6, 0.2), loc=(-7.75, -1.0, F0 - 0.1), m="wood_floor"))
    # upstairs slab with the stair hole x[2.45,3.55] y[-0.2,3.1]
    for (x0, x1, y0, y1) in ((-3.55, 2.45, -4.3, 4.3), (2.45, 3.55, -4.3, -0.2), (2.45, 3.55, 3.1, 4.3)):
        P.append(box("slab1", (x1 - x0, y1 - y0, 0.2), loc=((x0 + x1) / 2, (y0 + y1) / 2, F1 - 0.1), m="wood_floor"))
        P.append(box("ceil0", (x1 - x0, y1 - y0, 0.02), loc=((x0 + x1) / 2, (y0 + y1) / 2, C0 - 0.01), m="plaster_wall"))
    P.append(box("ceil1", (7.1, 8.6, 0.1), loc=(0, 0, C1 + 0.05), m="plaster_wall"))
    P.append(box("ceil_w", (7.6, 6.6, 0.1), loc=(-7.75, -1.0, 3.05), m="plaster_wall"))
    # ---- interior walls
    IW = 0.12
    arch.wall("iw_lk", (-3.55, 0.0), (2.45, 0.0), F0, C0, IW, "wallpaper", [(2.85, 1.0, F0, F0 + 2.1)], parts=P)
    arch.wall("iw_c", (0.35, -4.3), (0.35, 4.3), F1, C1, IW, "wallpaper", [(3.75, 0.85, F1, F1 + 2.05), (6.55, 0.85, F1, F1 + 2.05)], parts=P)
    arch.wall("iw_ab", (-3.55, 0.05), (0.35, 0.05), F1, C1, IW, "wallpaper", [], parts=P)
    arch.wall("iw_cn", (0.35, -1.1), (3.55, -1.1), F1, C1, IW, "wallpaper", [(0.7, 0.85, F1, F1 + 2.05)], parts=P)
    arch.wall("iw_wing", (-11.55, -1.0), (-3.95, -1.0), F0, 3.05, IW, "wallpaper", [(3.45, 0.9, F0, F0 + 2.05)], parts=P)
    # baseboards
    for (x0, y0, x1, y1, z) in ((-3.55, -4.28, 3.55, -4.28, F0), (-3.55, 4.28, 3.55, 4.28, F0), (3.53, -4.3, 3.53, 4.3, F0), (-3.53, -4.3, -3.53, 4.3, F0),
                                (-11.53, -4.28, -3.95, -4.28, F0), (-11.53, 2.28, -3.95, 2.28, F0), (-11.53, -4.3, -11.53, 2.3, F0)):
        P.append(box("base", (max(0.02, abs(x1 - x0)), max(0.02, abs(y1 - y0)), 0.12), loc=((x0 + x1) / 2, (y0 + y1) / 2, z + 0.06), m="wood_trim"))
    # ---- stairs (east wall, rising north)
    arch.stairs("stair", (3.0, -0.8, F0), PI / 2, 1.0, F1 - F0, 14, 3.9, parts=P, par=root)
    P.append(box("stair_wall_skirt", (0.04, 4.2, 0.25), loc=(3.53, 1.15, 1.9), rot=(math.atan2(2.8, 3.9), 0, 0), m="wood_trim"))
    # railing around the stair opening upstairs
    for k in range(9):
        P.append(box("baluster", (0.03, 0.03, 0.85), loc=(2.47, -0.15 + k * 0.4, F1 + 0.43), m="wood_trim"))
    P.append(box("handrail", (0.07, 3.35, 0.05), loc=(2.47, 1.45, F1 + 0.88), m="wood_dark"))
    P.append(box("handrail2", (1.1, 0.07, 0.05), loc=(3.0, -0.2, F1 + 0.88), m="wood_dark"))
    for k in range(3):
        P.append(box("baluster", (0.03, 0.03, 0.85), loc=(2.6 + k * 0.35, -0.2, F1 + 0.43), m="wood_trim"))
    # ---- living room
    arch.sofa("sofa", (-2.0, -0.7, F0), 0.0, 2.1, parts=P)
    arch.table("coffee", (-2.0, -2.15, F0), 1.1, 0.6, 0.42, parts=P)
    arch.rug("rug_lr", (-1.7, -2.2, F0), 3.2, 2.4, parts=P, m="fabric_red")
    P.append(box("tv_stand", (1.2, 0.45, 0.55), loc=(-2.0, -3.95, F0 + 0.275), m="wood_dark", bevel=0.01))
    arch.crt("tv", (-2.0, -3.92, F0 + 0.55), PI, parts=P)
    arch.chair("armchair", (0.6, -2.0, F0), PI / 2, "leather_brown", P)
    arch.bookshelf("lr_shelf", (1.9, -3.95, F0), PI, w=0.9, h=1.7, parts=P, seed=7)
    arch.picture("pic1", (-3.43, -2.0, F0 + 1.7), PI / 2, 0.6, 0.45, P)
    arch.picture("pic2", (-0.5, -0.07, F0 + 1.6), PI, 0.4, 0.5, P)
    P.append(cyl("floorlamp_pole", 0.015, 1.5, loc=(-3.2, -0.5, F0 + 0.75), m="metal_brushed", verts=8))
    P.append(cyl("floorlamp_shade", 0.2, 0.28, r2=0.14, loc=(-3.2, -0.5, F0 + 1.6), m="fabric_curtain", verts=16))
    arch.ceiling_lamp("lamp_lr", (-1.5, -2.2, C0), P, L, lights, "living", root)
    # ---- kitchen
    arch.cabinet_run("kit_run", (-1.6, 4.0, F0), 4.0, 0.0, parts=P, sink_at=2.15, ceiling=C0 - F0 + F0 + 0.1)
    arch.stove("stove", (1.75, 3.98, F0), 0.0, parts=P)
    arch.fridge("fridge", (-3.12, 1.2, F0), -PI / 2, parts=P)
    arch.table("ktable", (-0.8, 1.9, F0), 1.5, 0.9, parts=P, m="wood_raw")
    for (dx, dy, r) in ((-0.45, -0.65, 0), (0.45, -0.65, 0), (-0.45, 0.65, PI), (0.45, 0.65, PI)):
        arch.chair("kchair", (-0.8 + dx, 1.9 + dy, F0), r, "wood_raw", P)
    P.append(cyl("bowl", 0.14, 0.07, loc=(-0.8, 1.9, F0 + 0.8), m="ceramic_white", verts=16))
    for k in range(3):
        P.append(kit.sphere("corn_cob", 0.03, loc=(-0.85 + k * 0.05, 1.9, F0 + 0.85), m="corn_tassel", segs=8, rings=6, scale=(1, 3, 1)))
    arch.ceiling_lamp("lamp_k", (-0.8, 1.9, C0), P, L, lights, "kitchen", root, kind="pendant")
    arch.ceiling_lamp("lamp_k2", (1.2, 3.2, C0), P, L, lights, "kitchen", root)
    # ---- farm office (wing south)
    arch.desk("odesk", (-6.25, -3.75, F0), PI, 1.6, parts=P)
    arch.crt("ocomp", (-6.6, -3.75, F0 + 0.76), 0.0, parts=P)
    P.append(box("radio", (0.42, 0.25, 0.2), loc=(-5.75, -3.85, F0 + 0.86), m="plastic_dark", bevel=0.01))
    P.append(cyl("radio_ant", 0.006, 0.6, loc=(-5.6, -3.9, F0 + 1.2), rot=(0.3, 0, 0), m="chrome", verts=6))
    arch.chair("ochair", (-6.25, -3.0, F0), PI, "leather_brown", P)
    for k in range(3):
        P.append(box("filing", (0.48, 0.6, 1.3), loc=(-11.2, -3.6 + k * 0.52, F0 + 0.65), m="steel_painted_gray", bevel=0.01))
    P.append(box("mapboard", (0.03, 1.8, 1.1), loc=(-11.5, -2.0, F0 + 1.6), m="console_beige"))
    P.append(box("map", (0.01, 1.6, 0.9), loc=(-11.48, -2.0, F0 + 1.6), m="wallpaper"))
    arch.bookshelf("oshelf", (-4.2, -2.6, F0), -PI / 2, w=1.2, h=1.9, parts=P, seed=13)
    arch.ceiling_lamp("lamp_o", (-7.75, -2.7, 3.05), P, L, lights, "office", root)
    # ---- mudroom / storage (wing north)
    arch.shelf_unit("mshelf1", (-11.2, 0.5, F0), PI / 2, w=1.6, parts=P, items="jars", seed=4)
    arch.shelf_unit("mshelf2", (-6.0, 2.05, F0), PI, w=1.8, parts=P, items="boxes", seed=5)
    P.append(box("washer", (0.68, 0.65, 0.88), loc=(-4.4, 1.9, F0 + 0.44), m="plastic_white", bevel=0.03))
    P.append(cyl("heater", 0.3, 1.5, loc=(-4.4, 0.9, F0 + 0.75), m="plastic_white"))
    for k in range(5):
        P.append(box("sack", (0.5, 0.35, 0.7), loc=(-8.5 + k * 0.55, 1.8, F0 + 0.35), rot=(0, 0, random.uniform(-0.2, 0.2)), m="fabric_bag", bevel=0.12, segs=3))
    for k in range(4):
        P.append(box("boot", (0.12, 0.28, 0.3), loc=(-10.6 + k * 0.18, 2.0, F0 + 0.15), m="rubber_black", bevel=0.03))
    P.append(box("coathooks", (1.0, 0.04, 0.06), loc=(-10.0, 2.27, F0 + 1.7), m="wood_dark"))
    for k in range(3):
        P.append(box("coat", (0.4, 0.15, 0.85), loc=(-10.35 + k * 0.35, 2.17, F0 + 1.25), m=random.choice(["cloth_khaki", "cloth_denim", "cloth_flannel"]), bevel=0.06, segs=2))
    arch.ceiling_lamp("lamp_m", (-7.75, 0.7, 3.05), P, L, lights, "mud", root)
    # ---- bedroom A (north-west upstairs): the bookshelf room
    arch.bed("bedA", (-2.5, 3.2, F1), 0.0, w=1.1, L=2.0, parts=P)
    arch.bookshelf("shelfA", (-1.5, 0.27, F1), PI, w=1.7, h=2.0, parts=P, seed=21)
    arch.desk("deskA", (-3.15, 2.0, F1), -PI / 2, 1.2, parts=P, m="wood_raw")
    arch.chair("chairA", (-2.5, 2.0, F1), PI / 2, "wood_raw", P)
    arch.rug("rugA", (-1.6, 2.0, F1), 2.0, 1.4, parts=P, m="cloth_navy")
    P.append(kit.sphere("globe", 0.14, loc=(-3.25, 2.4, F1 + 0.95), m="cloth_navy", segs=16, rings=10))
    P.append(cyl("model_rocket", 0.03, 0.5, loc=(-3.25, 1.6, F1 + 1.0), m="plastic_white", verts=10))
    arch.ceiling_lamp("lamp_a", (-1.6, 2.1, C1), P, L, lights, "bedA", root)
    # ---- master bedroom
    arch.bed("bedM", (-2.4, -2.2, F1), PI / 2, w=1.55, L=2.05, parts=P)
    P.append(box("dresser", (1.2, 0.5, 0.9), loc=(-1.2, -4.0, F1 + 0.45), m="wood_dark", bevel=0.01))
    P.append(box("wardrobe", (1.0, 0.6, 2.0), loc=(-0.3, -0.5, F1 + 1.0), m="wood_dark", bevel=0.01))
    arch.ceiling_lamp("lamp_ms", (-1.6, -2.2, C1), P, L, lights, "master", root)
    # ---- room C (storage/sewing)
    arch.shelf_unit("cshelf", (3.1, -2.6, F1), -PI / 2, w=1.6, parts=P, items="boxes", seed=8)
    P.append(box("sewing", (1.0, 0.5, 0.75), loc=(1.4, -3.9, F1 + 0.375), m="wood_raw"))
    for k in range(4):
        P.append(box("cbox", (0.5, 0.4, 0.35), loc=(1.0 + (k % 2) * 0.55, -1.6 - (k // 2) * 0.45, F1 + 0.175 + (k // 2) * 0.35), m="wood_raw", bevel=0.01))
    arch.ceiling_lamp("lamp_c", (2.0, -2.7, C1), P, L, lights, "roomC", root)
    arch.ceiling_lamp("lamp_h", (1.4, 3.7, C1), P, L, lights, "hall", root)

    # ---- doors
    arch.door("door_front", (0.525, -4.38), 0.95, 2.08, 0.0, "farm_front", root, z0=F0, glass=True)
    arch.door("door_back", (-2.04, 4.38), 0.9, 2.03, PI, "farm_back", root, z0=F0)
    arch.door("door_wingfront", (-9.975, -4.38), 0.95, 2.08, 0.0, "farm_wingfront", root, z0=F0)
    arch.door("door_mud", (-9.3, 2.38), 0.9, 2.03, PI, "farm_mud", root, z0=F0)
    arch.door("door_lw", (-3.65, -2.475), 0.95, 2.08, PI / 2, "farm_livingwing", root, z0=F0)
    arch.door("door_office", (-8.775, -1.0), 0.9, 2.03, 0.0, "farm_office", root, z0=F0, open_angle=-1.6)
    arch.door("door_master", (0.35, -0.975), 0.85, 2.03, PI / 2, "farm_master", root, z0=F1)
    arch.door("door_bedA", (0.35, 1.825), 0.85, 2.03, PI / 2, "farm_bedA", root, z0=F1)
    arch.door("door_roomC", (0.625, -1.1), 0.85, 2.03, 0.0, "farm_roomC", root, z0=F1, open_angle=-1.6)

    # ---- light switches (by the doors), each toggles its group
    sw = [("living", (0.0, -4.27, F0 + 1.2), 0.0), ("kitchen", (-1.5, 4.27, F0 + 1.2), PI), ("office", (-8.0, -1.07, F0 + 1.2), 0.0),
          ("mud", (-8.6, 2.27, F0 + 1.2), PI), ("bedA", (0.29, 1.6, F1 + 1.2), PI / 2), ("master", (0.29, -1.2, F1 + 1.2), PI / 2),
          ("roomC", (1.7, -1.17, F1 + 1.2), 0.0), ("hall", (2.6, 4.27, F1 + 1.2), PI), ("porch", (0.3, -4.62, F0 + 1.2), 0.0)]
    for g, loc, r in sw:
        s = box(f"switch_{g}", (0.08, 0.02, 0.12), loc=loc, rot=(0, 0, r), m="plastic_white", par=root, interact="switch", iid=f"light_{g}", group=g)
    # interactive props
    box("tv_hit", (0.55, 0.5, 0.45), loc=(-2.0, -3.9, F0 + 0.8), m="frame_black", par=root, interact="tv", iid="farm_tv").hide_render = True
    box("radio_hit", (0.45, 0.3, 0.25), loc=(-5.75, -3.85, F0 + 0.86), m="frame_black", par=root, interact="radio", iid="farm_radio").hide_render = True
    box("comp_hit", (0.5, 0.45, 0.45), loc=(-6.6, -3.75, F0 + 1.0), m="frame_black", par=root, interact="computer", iid="farm_computer").hide_render = True
    box("shelf_hit", (1.7, 0.4, 2.0), loc=(-1.5, 0.27, F1 + 1.0), m="frame_black", par=root, interact="inspect", iid="bookshelf").hide_render = True

    # ---- rooms (indoor detection volumes)
    rooms = [("living", (-3.55, 3.55, -4.3, 0.0, F0, C0)), ("kitchen", (-3.55, 3.55, 0.0, 4.3, F0, C0)), ("office", (-11.55, -3.95, -4.3, -1.0, F0, 3.05)),
             ("mud", (-11.55, -3.95, -1.0, 2.3, F0, 3.05)), ("upstairs", (-3.55, 3.55, -4.3, 4.3, C0, C1))]
    for n, (x0, x1, y0, y1, z0, z1) in rooms:
        r = box(f"ROOM_{n}", (x1 - x0, y1 - y0, z1 - z0), loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m="frame_black", par=root, room=n)
        r.hide_render = True


def house_collision(root, interior=True):
    T = 0.3
    gw = (F0 + 0.8, F0 + 2.25)
    S = [(4.75, 0.95, F0, F0 + 2.1)] if interior else []
    arch.col_wall("cs", (-3.75, -4.4), (3.75, -4.4), 0.0, EAVE, T, S, root)
    arch.col_wall("ce", (3.65, -4.5), (3.65, 4.5), 0.0, EAVE, T, [], root)
    arch.col_wall("cn", (3.75, 4.4), (-3.75, 4.4), 0.0, EAVE, T, [(6.25, 0.92, F0, F0 + 2.05)] if interior else [], root)
    arch.col_wall("cw", (-3.65, 4.5), (-3.65, -4.5), 0.0, EAVE, T, [(6.5, 0.95, F0, F0 + 2.1)] if interior else [], root)
    arch.col_wall("cws", (-11.75, -4.4), (-3.75, -4.4), 0.0, W_EAVE, T, [(2.25, 0.95, F0, F0 + 2.1)] if interior else [], root)
    arch.col_wall("cww", (-11.65, 2.5), (-11.65, -4.5), 0.0, W_EAVE, T, [], root)
    arch.col_wall("cwn", (-3.75, 2.4), (-11.75, 2.4), 0.0, W_EAVE, T, [(6.0, 0.9, F0, F0 + 2.05)] if interior else [], root)
    # porch deck & steps, posts
    arch.col_box("COL_porch", (-4.0, -5.8, 0.25), (15.5, 2.6, 0.5), 0, root)
    arch.col_box("COL_porch_e", (5.05, -3.05, 0.25), (2.6, 8.1, 0.5), 0, root)
    for (cx, w) in ((1.0, 1.6), (-9.5, 1.4)):
        c = arch.col_box("COL_steps", (cx, -7.55, 0.2), (w, 0.95, 0.12), 0, root)
        c.rotation_euler = (math.atan2(0.5, 0.95), 0, 0)
    arch.col_box("COL_chimney", (-1.0, 4.82, 5), (0.75, 0.6, 10), 0, root)
    if not interior:
        arch.col_box("COL_shell_main", (0, 0, 3), (7.3, 8.6, 6), 0, root)
        arch.col_box("COL_shell_wing", (-7.75, -1, 1.8), (7.8, 6.8, 3.6), 0, root)
        return
    arch.col_box("COL_floor0", (0, 0, F0 - 0.1), (7.4, 8.9, 0.2), 0, root)
    arch.col_box("COL_floor0w", (-7.75, -1.0, F0 - 0.1), (7.9, 6.9, 0.2), 0, root)
    for i, (x0, x1, y0, y1) in enumerate(((-3.55, 2.45, -4.3, 4.3), (2.45, 3.55, -4.3, -0.2), (2.45, 3.55, 3.1, 4.3))):
        arch.col_box(f"COL_slab{i}", ((x0 + x1) / 2, (y0 + y1) / 2, F1 - 0.1), (x1 - x0, y1 - y0, 0.2), 0, root)
    arch.col_box("COL_ceil1", (0, 0, C1 + 0.05), (7.2, 8.7, 0.1), 0, root)
    arch.col_box("COL_ceilw", (-7.75, -1.0, 3.1), (7.8, 6.8, 0.1), 0, root)
    IW = 0.14
    arch.col_wall("ilk", (-3.55, 0.0), (2.45, 0.0), F0, C0, IW, [(2.85, 1.0, F0, F0 + 2.1)], root)
    arch.col_wall("ic", (0.35, -4.3), (0.35, 4.3), F1, C1, IW, [(3.75, 0.85, F1, F1 + 2.05), (6.55, 0.85, F1, F1 + 2.05)], root)
    arch.col_wall("iab", (-3.55, 0.05), (0.35, 0.05), F1, C1, IW, [], root)
    arch.col_wall("icn", (0.35, -1.1), (3.55, -1.1), F1, C1, IW, [(0.7, 0.85, F1, F1 + 2.05)], root)
    arch.col_wall("iwing", (-11.55, -1.0), (-3.95, -1.0), F0, 3.05, IW, [(3.45, 0.9, F0, F0 + 2.05)], root)
    arch.col_box("COL_rail", (2.47, 1.45, F1 + 0.5), (0.08, 3.35, 1.0), 0, root)
    arch.col_box("COL_rail2", (3.0, -0.2, F1 + 0.5), (1.1, 0.08, 1.0), 0, root)
    arch.col_box("COL_stairside", (2.45, 1.15, 1.7), (0.05, 3.9, 0.01), 0, root)
    # furniture
    for (c, s) in (((-2.0, -0.7, F0 + 0.4), (2.1, 0.9, 0.8)), ((-2.0, -3.95, F0 + 0.5), (1.2, 0.45, 1.0)), ((-0.8, 1.9, F0 + 0.38), (1.5, 0.9, 0.76)),
                   ((0.4, 4.0, F0 + 0.45), (4.0, 0.62, 0.9)), ((1.75, 3.98, F0 + 0.45), (0.76, 0.66, 0.9)), ((-3.12, 1.2, F0 + 0.87), (0.7, 0.75, 1.75)),
                   ((-6.25, -3.75, F0 + 0.38), (1.6, 0.7, 0.76)), ((-11.2, -3.08, F0 + 0.65), (0.5, 1.6, 1.3)), ((-11.2, 0.5, F0 + 0.9), (0.45, 1.6, 1.8)),
                   ((-6.0, 2.05, F0 + 0.9), (1.8, 0.45, 1.8)), ((-2.5, 3.2, F1 + 0.3), (1.2, 2.1, 0.6)), ((-1.5, 0.27, F1 + 1.0), (1.7, 0.35, 2.0)),
                   ((-2.4, -2.2, F1 + 0.3), (2.1, 1.6, 0.6)), ((-1.2, -4.0, F1 + 0.45), (1.2, 0.5, 0.9)), ((-0.3, -0.5, F1 + 1.0), (1.0, 0.6, 2.0)),
                   ((1.9, -3.95, F0 + 0.85), (0.9, 0.35, 1.7)), ((-4.2, -2.6, F0 + 0.95), (0.35, 1.2, 1.9)), ((3.1, -2.6, F1 + 0.9), (0.45, 1.6, 1.8))):
        arch.col_box("COL_furn", c, s, 0, root)


# ------------------------------------------------------------------------------------------------ outbuildings
def metal_building(name, cx, cy, w, d, wall_h, ridge_h, P, door_w=4.5, door_h=4.0, wall_m="roof_metal", roof_m="roof_metal", interior=True, root=None, door_side="s"):
    ops_s = [(w / 2, door_w, 0.0, door_h)] if door_side == "s" else []
    ops_n = [(w / 2, door_w, 0.0, door_h)] if door_side == "n" else []
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    arch.wall(name + "_s", (x0, y0), (x1, y0), 0, wall_h, 0.12, wall_m, ops_s, parts=P)
    arch.wall(name + "_e", (x1, y0), (x1, y1), 0, wall_h, 0.12, wall_m, [(d * 0.3, 1.0, 0.0, 2.1)], parts=P)
    arch.wall(name + "_n", (x1, y1), (x0, y1), 0, wall_h, 0.12, wall_m, ops_n, parts=P)
    arch.wall(name + "_w", (x0, y1), (x0, y0), 0, wall_h, 0.12, wall_m, [], parts=P)
    arch.gable_wall(name + "_gs", x0, x1, y0, wall_h, ridge_h, 0.1, wall_m, P)
    arch.gable_wall(name + "_gn", x0, x1, y1, wall_h, ridge_h, 0.1, wall_m, P)
    arch.gable_roof(name + "_roof", x0, x1, y0, y1, wall_h, ridge_h, over=0.35, ridge_axis="y", m=roof_m, fascia_m="steel_painted_white", parts=P)
    P.append(box(name + "_floor", (w, d, 0.15), loc=(cx, cy, 0.05), m="concrete"))
    for (cxx, cyy) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        P.append(box(name + "_trim", (0.18, 0.18, wall_h), loc=(cxx, cyy, wall_h / 2), m="steel_painted_white"))
    if root is not None:
        ops_sc = [(w / 2, door_w, 0.0, door_h)] if door_side == "s" else []
        ops_nc = [(w / 2, door_w, 0.0, door_h)] if door_side == "n" else []
        arch.col_wall(name + "cs", (x0, y0), (x1, y0), 0, wall_h, 0.2, ops_sc, root)
        arch.col_wall(name + "ce", (x1, y0), (x1, y1), 0, wall_h, 0.2, [(d * 0.3, 1.0, 0.0, 2.1)], root)
        arch.col_wall(name + "cn", (x1, y1), (x0, y1), 0, wall_h, 0.2, ops_nc, root)
        arch.col_wall(name + "cw", (x0, y1), (x0, y0), 0, wall_h, 0.2, [], root)
        arch.col_box("COL_" + name + "_roof", (cx, cy, wall_h + 0.2), (w, d, 0.2), 0, root)


def outbuildings(root, P, G, L, lights):
    # ---- workshop / garage (enterable) at three (24, -14) → blender (24, 14), door facing south
    gx, gy = 24, 14
    metal_building("garage", gx, gy, 10, 12, 4.5, 6.6, P, door_w=4.8, door_h=4.0, wall_m="steel_painted_gray", roof_m="roof_metal", root=root)
    # workbench + tool wall
    P.append(box("bench_top", (5.0, 0.8, 0.06), loc=(gx, gy + 5.5, 0.95), m="wood_raw", bevel=0.01))
    for sx in (-2.3, 0, 2.3):
        P.append(box("bench_leg", (0.08, 0.7, 0.9), loc=(gx + sx, gy + 5.5, 0.47), m="steel_painted_gray"))
    P.append(box("pegboard", (4.6, 0.03, 1.4), loc=(gx, gy + 5.88, 1.85), m="console_beige"))
    rr = random.Random(9)
    for k in range(28):
        tx = gx - 2.1 + (k % 14) * 0.32
        tz = 1.45 + (k // 14) * 0.6
        if rr.random() < 0.5:
            P.append(box("tool", (0.04, 0.03, rr.uniform(0.2, 0.45)), loc=(tx, gy + 5.84, tz), rot=(0, rr.uniform(-0.3, 0.3), 0), m=rr.choice(["metal_gray", "farm_red", "steel_painted_yellow", "wood_raw"])))
        else:
            P.append(box("wrench", (0.03, 0.02, 0.28), loc=(tx, gy + 5.84, tz), m="metal_brushed"))
    P.append(box("vise", (0.2, 0.25, 0.18), loc=(gx + 2.0, gy + 5.4, 1.07), m="steel_painted_gray", bevel=0.02))
    arch.shelf_unit("gshelf", (gx - 4.5, gy + 2.0, 0.1), PI / 2, w=2.0, h=2.2, parts=P, items="boxes", seed=31)
    for k in range(4):
        P.append(kit.torus("tire_stack", 0.42, 0.14, loc=(gx + 4.2, gy - 3.5, 0.18 + k * 0.28), m="tire_rubber", seg=20, rseg=8))
    for k in range(3):
        P.append(cyl("drum", 0.29, 0.88, loc=(gx + 4.3, gy + 1.0 + k * 0.65, 0.54), m=["farm_red_faded", "steel_painted_yellow", "steel_painted_gray"][k], verts=20))
    # engine hoist
    P.append(box("hoist_base", (0.1, 1.4, 0.1), loc=(gx - 1.5, gy - 1.0, 0.15), m="farm_red"))
    P.append(box("hoist_mast", (0.12, 0.12, 2.0), loc=(gx - 1.5, gy - 0.4, 1.1), m="farm_red"))
    P.append(box("hoist_arm", (0.1, 1.6, 0.1), loc=(gx - 1.5, gy - 1.0, 2.0), rot=(0.2, 0, 0), m="farm_red"))
    P.append(box("compressor", (0.6, 0.4, 0.7), loc=(gx - 4.3, gy + 5.2, 0.45), m="farm_red", bevel=0.03))
    arch.ceiling_lamp("lamp_g1", (gx - 2, gy, 4.4), P, L, lights, "garage", root, kind="pendant")
    arch.ceiling_lamp("lamp_g2", (gx + 2, gy + 3, 4.4), P, L, lights, "garage", root, kind="pendant")
    box("switch_garage", (0.08, 0.02, 0.12), loc=(gx - 2.8, gy - 5.93, 1.3), m="plastic_white", par=root, interact="switch", iid="light_garage", group="garage")
    r = box("ROOM_garage", (9.8, 11.8, 4.4), loc=(gx, gy, 2.2), m="frame_black", par=root, room="garage")
    r.hide_render = True
    arch.col_box("COL_bench", (gx, gy + 5.5, 0.5), (5.0, 0.8, 1.0), 0, root)
    # roll-up door (interactive, slides up)
    rd = empty("rolldoor_garage", loc=(gx, gy - 6.0, 0.0), parent=root, interact="rolldoor", iid="garage_door")
    rparts = [box("rd_slat", (4.8, 0.05, 0.25), loc=(0, 0, 0.125 + k * 0.25), m="steel_painted_white", bevel=0.005) for k in range(16)]
    rm = merge(rparts, "rolldoor_mesh", par=rd)
    rm.location = (0, 0, 0)
    finish(rm, 30)
    arch.col_box("COL_rolldoor", (0, 0, 2.0), (4.8, 0.15, 4.0), 0, rd, door="garage_door")

    # ---- barn at three (-30,-32) → blender (-30, 32), faded red metal, doors to the south
    bx, by = -30, 32
    metal_building("barn", bx, by, 16, 22, 6.0, 9.5, P, door_w=7.0, door_h=5.5, wall_m="farm_red_faded", roof_m="roof_metal", root=root)
    for k in range(10):
        P.append(box("hay", (1.2, 0.5, 0.45), loc=(bx - 6 + (k % 5) * 1.25, by + 9.5, 0.3 + (k // 5) * 0.46), m="corn_tassel", bevel=0.05))
    for k in range(6):
        P.append(box("pallet_sacks", (1.2, 1.0, 0.9), loc=(bx + 5.5, by - 6 + k * 1.6, 0.55), m="fabric_bag", bevel=0.1, segs=2))
    r = box("ROOM_barn", (15.8, 21.8, 5.9), loc=(bx, by, 3.0), m="frame_black", par=root, room="barn")
    r.hide_render = True

    # ---- grain bins (corrugated cylinders + conical roofs), three (-48,-22),(-48,-10) → blender (-48,22),(-48,10)
    for i, (sx, sy) in enumerate(((-48, 22), (-48, 10))):
        P.append(cyl(f"bin{i}", 4.5, 8.0, loc=(sx, sy, 4.0), m="steel_galv", verts=48))
        for k in range(8):
            P.append(kit.torus(f"bin_ring{i}", 4.52, 0.04, loc=(sx, sy, 0.5 + k * 1.0), m="steel_galv", seg=48, rseg=4))
        P.append(cyl(f"bin_roof{i}", 4.7, 2.6, r2=0.6, loc=(sx, sy, 9.3), m="steel_galv", verts=48))
        P.append(cyl(f"bin_vent{i}", 0.6, 0.5, loc=(sx, sy, 10.85), m="steel_galv", verts=16))
        for k in range(18):
            P.append(box(f"bin_rung{i}", (0.4, 0.03, 0.03), loc=(sx + 4.6, sy, 0.4 + k * 0.48), rot=(0, 0, PI / 2), m="steel_galv"))
        for side in (-0.2, 0.2):
            P.append(box(f"bin_rail{i}", (0.04, 0.04, 8.6), loc=(sx + 4.62, sy + side, 4.3), m="steel_galv"))
        P.append(box(f"bin_door{i}", (0.06, 0.9, 1.4), loc=(sx + 4.5, sy - 1.5, 0.9), m="steel_galv"))
        arch.col_box(f"COL_bin{i}", (sx, sy, 4.0), (8.6, 8.6, 8.0), 0, root)
    P.append(kit.tube("auger", [(-43, 16, 0.5), (-46, 16, 10.2)], 0.2, m="steel_galv", seg=10))

    # ---- water tanks (image 1: teal poly tank) & blue tanks (image 2)
    for i, (x, y, r, hh, m) in enumerate(((-38, -6, 1.3, 2.6, "pipe_blue"), (-36, -2.5, 1.1, 2.2, "pipe_blue"), (-14.6, -6.4, 0.55, 1.6, "pipe_blue"), (-13.4, -6.7, 0.55, 1.6, "pipe_blue"))):
        P.append(cyl(f"tank{i}", r, hh, loc=(x, y, hh / 2), m=m, verts=28, bevel=0.05))
        P.append(cyl(f"tank_lid{i}", r * 0.3, 0.1, loc=(x, y, hh + 0.05), m="plastic_dark", verts=16))
        arch.col_box(f"COL_tank{i}", (x, y, hh / 2), (r * 1.8, r * 1.8, hh), 0, root)
    # ---- fuel tank on a stand, three (16, 26) → blender (16, -26): refuelling point for farm vehicles
    fx, fy = 16, -26
    P.append(cyl("fuel_tank", 0.95, 3.2, loc=(fx, fy, 2.3), rot=(0, PI / 2, 0), m="farm_red_faded", verts=28, bevel=0.03))
    for sx in (-1.1, 1.1):
        for sy in (-0.6, 0.6):
            P.append(box("fuel_leg", (0.1, 0.1, 1.4), loc=(fx + sx, fy + sy, 0.7), rot=(0, 0, 0), m="steel_painted_gray"))
    P.append(kit.tube("fuel_hose", [(fx + 1.4, fy - 0.5, 1.7), (fx + 1.6, fy - 0.9, 1.0), (fx + 1.5, fy - 1.1, 1.2)], 0.025, m="rubber_black", seg=8))
    P.append(box("fuel_nozzle", (0.08, 0.25, 0.12), loc=(fx + 1.5, fy - 1.15, 1.25), m="steel_painted_yellow"))
    box("fuel_hit", (1.0, 0.8, 1.2), loc=(fx + 1.5, fy - 1.0, 1.2), m="frame_black", par=root, interact="fuel", iid="farm_fuel").hide_render = True
    arch.col_box("COL_fueltank", (fx, fy, 1.6), (3.4, 2.0, 3.2), 0, root)
    # ---- power poles & lines to the house (three x=30,62,94; z=6 → blender y=-6)
    poles = [(30, -6), (62, -6), (94, -6)]
    tops = []
    for i, (x, y) in enumerate(poles):
        P.append(cyl(f"pole{i}", 0.14, 9.5, r2=0.11, loc=(x, y, 4.75), m="wood_raw", verts=12))
        P.append(box(f"pole_arm{i}", (1.8, 0.1, 0.12), loc=(x, y, 8.9), m="wood_raw"))
        for sx in (-0.75, 0.75):
            P.append(cyl(f"insul{i}", 0.04, 0.14, loc=(x + sx, y, 9.03), m="glass_clear", verts=8))
            tops.append((x + sx, y, 9.1))
        arch.col_box(f"COL_pole{i}", (x, y, 4.75), (0.3, 0.3, 9.5), 0, root)
    for k in range(len(poles) - 1):
        for side in (0, 1):
            a = tops[k * 2 + side]; b = tops[(k + 1) * 2 + side]
            pts = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 0.7 * math.sin(math.pi * t)) for t in [i / 10 for i in range(11)]]
            P.append(kit.tube("wire", pts, 0.016, m="rubber_black", seg=4))
    # drop to the house east gable
    a = tops[0]
    pts = [(a[0] + (3.8 - a[0]) * t, a[1] + (2.0 - a[1]) * t, a[2] + (7.4 - a[2]) * t - 0.4 * math.sin(math.pi * t)) for t in [i / 10 for i in range(11)]]
    P.append(kit.tube("service_drop", pts, 0.016, m="rubber_black", seg=4))
    # ---- clothesline (image 2) north-east of the house
    for x in (9.0, 16.0):
        P.append(cyl("cl_post", 0.05, 2.2, loc=(x, 7.0, 1.1), m="steel_galv", verts=8))
        P.append(box("cl_bar", (0.05, 1.0, 0.05), loc=(x, 7.0, 2.15), m="steel_galv"))
    for sy in (-0.4, 0.0, 0.4):
        P.append(kit.tube("cl_line", [(9.0, 7.0 + sy, 2.15), (12.5, 7.0 + sy, 2.0), (16.0, 7.0 + sy, 2.15)], 0.004, m="plastic_white", seg=4))
    rr = random.Random(2)
    for k in range(7):
        x = 9.6 + k * 0.85
        sy = rr.choice([-0.4, 0.0, 0.4])
        w, hh = rr.uniform(0.4, 0.8), rr.uniform(0.5, 0.9)
        P.append(box("cloth", (w, 0.01, hh), loc=(x, 7.0 + sy, 2.05 - hh / 2), rot=(0, 0, rr.uniform(-0.08, 0.08)), m=rr.choice(["fabric_bed", "cloth_denim", "cloth_flannel", "fabric_curtain", "cloth_khaki"])))
    # ---- fence posts with wire around the yard (west/north sides)
    for k in range(40):
        x = -62 + k * 3.0
        P.append(box("fence_post", (0.12, 0.12, 1.3), loc=(x, 45.5, 0.6), rot=(0, 0, rr.uniform(-0.05, 0.05)), m="wood_raw"))
    for z in (0.5, 0.9, 1.2):
        P.append(kit.tube("fence_wire", [(-62, 45.5, z), (55, 45.5, z)], 0.004, m="metal_gray", seg=4))
    for k in range(28):
        y = -40 + k * 3.0
        P.append(box("fence_post", (0.12, 0.12, 1.3), loc=(-61.5, y, 0.6), m="wood_raw"))
    for z in (0.5, 0.9, 1.2):
        P.append(kit.tube("fence_wire", [(-61.5, -40, z), (-61.5, 45.5, z)], 0.004, m="metal_gray", seg=4))
    # ---- mailbox at the end of the driveway (three (17, 246) → blender (17,-246))
    P.append(box("mail_post", (0.1, 0.1, 1.1), loc=(18, -244, 0.55), m="wood_raw"))
    P.append(cyl("mailbox", 0.15, 0.5, loc=(18, -244, 1.2), rot=(PI / 2, 0, 0), m="steel_galv", verts=16))
    box("mail_hit", (0.4, 0.7, 0.4), loc=(18, -244, 1.2), m="frame_black", par=root, interact="mailbox", iid="farm_mailbox").hide_render = True
    # ---- dust mounds by the house (image 2) and scrap
    for (x, y, r) in ((-15.5, -8.6, 1.3), (-4.5, -9.4, 1.0), (7.5, -9.0, 0.8)):
        P.append(cyl("dust_mound", r, 0.45, r2=0.1, loc=(x, y, 0.2), m="rust" if False else "wood_raw", verts=20))
    for k in range(6):
        P.append(kit.torus("old_tire", 0.55, 0.18, loc=(-44 + k * 1.3, -12, 0.18), rot=(0, 0, k), m="tire_rubber", seg=20, rseg=8))


def neighbor_variant():
    kit.reset()
    root = empty("NeighborHouse")
    P, G, L, lights = build_house(root, interior=False)
    house_collision(root, interior=False)
    st = merge(P, "nh_static", par=root)
    finish(st, 35)
    gl = merge(G, "nh_glass", par=root)
    finish(gl, 10)
    if L:
        lm = merge(L, "nh_lamps", par=root)
        finish(lm, 30)
    for lt in lights:
        bpy_remove(lt)
    kit.export_glb(os.path.join(kit.out_dir(), "neighbor_house.glb"), root)


def bpy_remove(o):
    import bpy
    bpy.data.objects.remove(o, do_unlink=True)


def build(preview=True):
    random.seed(1)
    kit.reset()
    root = empty("Farm")
    P, G, L, lights = build_house(root, interior=True)
    house_collision(root, interior=True)
    outbuildings(root, P, G, L, lights)
    # merge static parts into a few meshes by region (keeps draw calls low, preserves culling)
    def region(o):
        x, y = o.location.x, o.location.y
        if -13 < x < 7 and -10 < y < 6:
            return "house"
        if 15 < x < 35 and 5 < y < 25:
            return "garage"
        if -42 < x < -18 and 18 < y < 46:
            return "barn"
        return "yard"
    groups = {}
    for o in P:
        groups.setdefault(region(o), []).append(o)
    for k, objs in groups.items():
        m = merge(objs, f"farm_{k}", par=root)
        finish(m, 35)
    g = merge(G, "farm_glass", par=root)
    finish(g, 10)
    by_group = {}
    for o in L:
        grp = o.name.split("|")[1] if "|" in o.name else "misc"
        by_group.setdefault(grp, []).append(o)
    for grp, objs in by_group.items():
        lm = merge(objs, f"lamps_{grp}", par=root, group=grp, lampmesh=1)
        finish(lm, 30)
    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)
    path = os.path.join(kit.out_dir(), "farm.glb")
    kit.export_glb(path, root)
    if preview:
        pd = kit.preview_dir()
        kit.preview(os.path.join(pd, "farm_front.png"), (14, -26, 4.5), (-3, 0, 3.5), lens=28, samples=16, sun=(0.5, -0.6, 0.6), world=(0.75, 0.74, 0.62))
        kit.preview(os.path.join(pd, "farm_aerial.png"), (40, -60, 40), (-10, 5, 0), lens=30, samples=12, sun=(0.5, -0.6, 0.6), world=(0.75, 0.74, 0.62))
    neighbor_variant()


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
