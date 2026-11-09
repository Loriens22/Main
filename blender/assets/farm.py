"""
Cooper farmstead (reference images 1–2): the farmhouse (shell, roofs and porch in farm_house.py), its full interior,
porch clutter and yard props, plus the workshop/garage, barn, grain bins, tanks, fuel station, power line, fence,
clothesline and mailbox.

Blender: X east, Y north, Z up; origin = centre of the main block at ground level. Exports:
  public/assets/models/farm.glb            (enterable farmstead)
  public/assets/models/neighbor_house.glb  (exterior-only variant for neighbouring farms)
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Euler
import kit, arch
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props
import farm_house as fh
from farm_house import (F0, C0, F1, C1, MX0, MX1, MY0, MY1, EAVE, WX0, WX1, WY0, WY1, WRY, W_EAVE, PX0, PX1, PDY, PPY,
                        POSTS_X, PBZ, PI, seg_box, obox, screen_door, porch_top)

W_CEIL = W_EAVE - 0.2
WI_X0, WI_Y0, WI_Y1 = WX0 + 0.2, WY0 + 0.2, WY1 - 0.2      # wing interior faces


def place(objs, loc, rot=(0, 0, 0)):
    """Rigidly move freshly built (unparented) objects: rotate about the origin, then translate."""
    Mx = Matrix.Translation(V(loc)) @ Euler(rot).to_matrix().to_4x4()
    for o in objs:
        o.matrix_basis = Mx @ o.matrix_basis
    return objs


# ------------------------------------------------------------------------------------------------ interior
def build_interior(root, P, G, L, lights):
    # ---- floors & ceilings
    P.append(box("floor0_main", (7.1, 8.6, 0.2), loc=(0, 0, F0 - 0.1), m="wood_floor"))
    P.append(box("floor0_wing", (WX1 - WI_X0, WI_Y1 - WI_Y0, 0.2), loc=((WI_X0 + WX1) / 2, (WI_Y0 + WI_Y1) / 2, F0 - 0.1), m="wood_floor"))
    for (x0, x1, y0, y1) in ((-3.55, 2.45, -4.3, 4.3), (2.45, 3.55, -4.3, -0.2), (2.45, 3.55, 3.1, 4.3)):
        P.append(box("slab1", (x1 - x0, y1 - y0, 0.2), loc=((x0 + x1) / 2, (y0 + y1) / 2, F1 - 0.1), m="wood_floor"))
        P.append(box("ceil0", (x1 - x0, y1 - y0, 0.02), loc=((x0 + x1) / 2, (y0 + y1) / 2, C0 - 0.01), m="plaster_wall"))
    P.append(box("ceil1", (7.1, 8.6, 0.1), loc=(0, 0, C1 + 0.05), m="plaster_wall"))
    P.append(box("ceil_w", (WX1 - WI_X0, WI_Y1 - WI_Y0, 0.1), loc=((WI_X0 + WX1) / 2, (WI_Y0 + WI_Y1) / 2, W_CEIL + 0.05), m="plaster_wall"))
    # ---- interior walls
    IW = 0.12
    arch.wall("iw_lk", (-3.55, 0.0), (2.45, 0.0), F0, C0, IW, "wallpaper", [(2.85, 1.0, F0, F0 + 2.1)], parts=P)
    arch.wall("iw_c", (0.35, -4.3), (0.35, 4.3), F1, C1, IW, "wallpaper", [(3.75, 0.85, F1, F1 + 2.05), (6.55, 0.85, F1, F1 + 2.05)], parts=P)
    arch.wall("iw_ab", (-3.55, 0.05), (0.35, 0.05), F1, C1, IW, "wallpaper", [], parts=P)
    arch.wall("iw_cn", (0.35, -1.1), (3.55, -1.1), F1, C1, IW, "wallpaper", [(0.7, 0.85, F1, F1 + 2.05)], parts=P)
    arch.wall("iw_wing", (WI_X0, WRY), (WX1, WRY), F0, W_CEIL, IW, "wallpaper", [(-8.8 - WI_X0, 0.9, F0, F0 + 2.05)], parts=P)
    # crown moulding & baseboards (main ground floor, wing rooms)
    runs = [((-3.55, -4.28), (3.55, -4.28)), ((-3.55, 4.28), (3.55, 4.28)), ((3.53, -4.3), (3.53, 4.3)), ((-3.53, -4.3), (-3.53, 4.3)),
            ((WI_X0, WI_Y0 + 0.02), (WX1, WI_Y0 + 0.02)), ((WI_X0, WI_Y1 - 0.02), (WX1, WI_Y1 - 0.02)), ((WI_X0 + 0.02, WI_Y0), (WI_X0 + 0.02, WI_Y1))]
    for (a, b) in runs:
        cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        sx, sy = max(0.025, abs(b[0] - a[0])), max(0.025, abs(b[1] - a[1]))
        P.append(box("base", (sx, sy, 0.14), loc=(cx, cy, F0 + 0.07), m="wood_trim"))
        top = W_CEIL if cx < -3.7 else C0
        P.append(box("crown", (sx, sy, 0.08), loc=(cx, cy, top - 0.04), m="wood_trim"))
    # ---- stairs (east wall, rising north)
    arch.stairs("stair", (3.0, -0.8, F0), PI / 2, 1.0, F1 - F0, 14, 3.9, parts=P, par=root)
    P.append(box("stair_wall_skirt", (0.04, 4.2, 0.25), loc=(3.53, 1.15, 1.9), rot=(math.atan2(2.8, 3.9), 0, 0), m="wood_trim"))
    for k in range(9):
        P.append(box("baluster", (0.03, 0.03, 0.85), loc=(2.47, -0.15 + k * 0.4, F1 + 0.43), m="wood_trim"))
    P.append(box("handrail", (0.07, 3.35, 0.05), loc=(2.47, 1.45, F1 + 0.88), m="wood_dark"))
    P.append(box("handrail2", (1.1, 0.07, 0.05), loc=(3.0, -0.2, F1 + 0.88), m="wood_dark"))
    for k in range(3):
        P.append(box("baluster", (0.03, 0.03, 0.85), loc=(2.6 + k * 0.35, -0.2, F1 + 0.43), m="wood_trim"))
    P.append(box("newel", (0.1, 0.1, 1.1), loc=(2.47, -0.85, F0 + 0.55), m="wood_dark", bevel=0.01))
    P.append(seg_box("stair_rail", (2.47, -0.85, F0 + 1.0), (2.47, 3.05, F1 + 0.9), 0.06, 0.05, "wood_dark"))
    # ---- living room (south): sofa on the west wall facing the TV on the east wall
    arch.sofa("sofa", (-3.05, -3.1, F0), PI / 2, 2.1, parts=P)
    arch.table("coffee", (-1.9, -3.1, F0), 1.1, 0.6, 0.42, rot=PI / 2, parts=P)
    arch.rug("rug_lr", (-1.6, -3.1, F0), 3.0, 2.4, parts=P, m="fabric_red")
    P.append(box("tv_stand", (0.45, 1.2, 0.55), loc=(3.3, -3.2, F0 + 0.275), m="wood_dark", bevel=0.01))
    arch.crt("tv", (3.28, -3.2, F0 + 0.55), -PI / 2, parts=P)
    arch.chair("armchair", (-0.9, -1.2, F0), 1.125, "leather_brown", P)
    arch.bookshelf("lr_shelf", (1.5, -0.22, F0), 0.0, w=0.9, h=1.7, parts=P, seed=7)
    arch.picture("pic1", (-3.53, -3.1, F0 + 1.75), PI / 2, 0.7, 0.5, P)
    arch.picture("pic2", (0.9, -0.07, F0 + 1.95), 0.0, 0.4, 0.5, P)
    P.append(cyl("floorlamp_pole", 0.015, 1.5, loc=(-3.2, -1.85, F0 + 0.75), m="metal_brushed", verts=8))
    P.append(cyl("floorlamp_base", 0.15, 0.03, loc=(-3.2, -1.85, F0 + 0.015), m="metal_dark", verts=16))
    P.append(cyl("floorlamp_shade", 0.2, 0.28, r2=0.14, loc=(-3.2, -1.85, F0 + 1.6), m="fabric_curtain", verts=16))
    arch.ceiling_lamp("lamp_lr", (-1.2, -2.2, C0), P, L, lights, "living", root)
    # ---- kitchen (north)
    arch.cabinet_run("kit_run", (-1.6, 4.0, F0), 2.9, 0.0, parts=P, sink_at=2.15, upper=False)
    arch.stove("stove", (1.7, 3.98, F0), 0.0, parts=P)
    arch.cabinet_run("kit_run2", (2.1, 4.0, F0), 1.4, 0.0, parts=P, upper=False)
    for (x0, x1) in ((-1.6, 0.05), (2.1, 3.5)):
        P.append(box("kit_upper", (x1 - x0, 0.34, 0.72), loc=((x0 + x1) / 2, 4.12, 2.62), m="wood_trim", bevel=0.005))
        for k in range(int((x1 - x0) / 0.5)):
            P.append(box("kit_upper_pull", (0.02, 0.02, 0.1), loc=(x0 + 0.42 + k * 0.5, 3.94, 2.36), m="metal_brushed"))
    P.append(box("range_hood", (0.78, 0.45, 0.22), loc=(1.7, 4.07, 2.45), m="steel_painted_white", bevel=0.01))
    arch.fridge("fridge", (-3.12, 1.0, F0), PI / 2, parts=P)
    arch.table("ktable", (-0.8, 1.9, F0), 1.5, 0.9, parts=P, m="wood_raw")
    for (dx, dy, r) in ((-0.45, -0.65, 0), (0.45, -0.65, 0), (-0.45, 0.65, PI), (0.45, 0.65, PI)):
        arch.chair("kchair", (-0.8 + dx, 1.9 + dy, F0), r, "wood_raw", P)
    P.append(cyl("bowl", 0.14, 0.07, loc=(-0.8, 1.9, F0 + 0.8), m="ceramic_white", verts=16))
    for k in range(3):
        P.append(kit.sphere("corn_cob", 0.03, loc=(-0.85 + k * 0.05, 1.9, F0 + 0.85), m="corn_tassel", segs=8, rings=6, scale=(1, 3, 1)))
    arch.ceiling_lamp("lamp_k", (-0.8, 1.9, C0), P, L, lights, "kitchen", root, kind="pendant")
    arch.ceiling_lamp("lamp_k2", (1.4, 3.2, C0), P, L, lights, "kitchen", root)
    # ---- farm office (wing south)
    arch.desk("odesk", (-6.6, -2.53, F0), PI, 1.6, parts=P)
    arch.crt("ocomp", (-6.85, -2.6, F0 + 0.76), PI, parts=P)
    P.append(box("radio", (0.42, 0.25, 0.2), loc=(-6.05, -2.65, F0 + 0.86), m="plastic_dark", bevel=0.01))
    P.append(cyl("radio_ant", 0.006, 0.6, loc=(-5.9, -2.7, F0 + 1.2), rot=(0.3, 0, 0), m="chrome", verts=6))
    arch.chair("ochair", (-6.6, -1.85, F0), 0.0, "leather_brown", P)
    P.append(box("filing", (0.6, 0.48, 1.3), loc=(WI_X0 + 0.31, -2.6, F0 + 0.65), m="steel_painted_gray", bevel=0.01))
    for k in range(4):
        P.append(box("filing_drw", (0.01, 0.4, 0.26), loc=(WI_X0 + 0.615, -2.6, F0 + 0.18 + k * 0.31), m="steel_painted_gray"))
    P.append(box("mapboard", (1.8, 0.03, 1.1), loc=(-10.6, WRY - 0.075, F0 + 1.6), m="console_beige"))
    P.append(box("map", (1.6, 0.01, 0.9), loc=(-10.6, WRY - 0.095, F0 + 1.6), m="wallpaper"))
    arch.bookshelf("oshelf", (-5.2, WRY - 0.22, F0), 0.0, w=1.2, h=1.9, parts=P, seed=13)
    P.append(box("gunrack", (0.9, 0.06, 0.5), loc=(-8.0, WRY - 0.09, F0 + 1.9), m="wood_dark"))
    arch.ceiling_lamp("lamp_o", (-7.9, -1.4, W_CEIL), P, L, lights, "office", root)
    # ---- mudroom / storage (wing north)
    arch.shelf_unit("mshelf1", (-11.0, WRY + 0.29, F0), 0.0, w=1.6, parts=P, items="jars", seed=4)
    arch.shelf_unit("mshelf2", (-7.2, WI_Y1 - 0.25, F0), 0.0, w=1.4, parts=P, items="boxes", seed=5)
    P.append(box("washer", (0.68, 0.65, 0.88), loc=(-4.4, 0.6, F0 + 0.44), m="plastic_white", bevel=0.03))
    P.append(cyl("heater", 0.3, 1.5, loc=(-4.35, 1.45, F0 + 0.75), m="plastic_white"))
    rr = random.Random(5)
    for k in range(3):
        P.append(box("sack", (0.5, 0.35, 0.7), loc=(-11.6 + k * 0.55, WI_Y1 - 0.3, F0 + 0.35), rot=(0, 0, rr.uniform(-0.2, 0.2)), m="fabric_bag", bevel=0.12, segs=3))
    for k in range(4):
        P.append(box("boot", (0.12, 0.28, 0.3), loc=(-8.55 + k * 0.17, WI_Y1 - 0.18, F0 + 0.15), m="rubber_black", bevel=0.03))
    P.append(box("coathooks", (1.0, 0.04, 0.06), loc=(-8.3, WI_Y1 - 0.02, F0 + 1.7), m="wood_dark"))
    for k in range(3):
        P.append(box("coat", (0.4, 0.15, 0.85), loc=(-8.65 + k * 0.35, WI_Y1 - 0.12, F0 + 1.25), m=rr.choice(["cloth_khaki", "cloth_denim", "cloth_flannel"]), bevel=0.06, segs=2))
    arch.ceiling_lamp("lamp_m", (-7.9, 1.6, W_CEIL), P, L, lights, "mud", root)
    # ---- bedroom A (north-west upstairs): the bookshelf room
    arch.bed("bedA", (-2.5, 3.2, F1), 0.0, w=1.1, L=2.0, parts=P)
    arch.bookshelf("shelfA", (-1.5, 0.27, F1), PI, w=1.7, h=2.0, parts=P, seed=21)
    arch.desk("deskA", (-3.15, 1.9, F1), PI / 2, 1.2, parts=P, m="wood_raw")
    arch.chair("chairA", (-2.5, 1.9, F1), -PI / 2, "wood_raw", P)
    arch.rug("rugA", (-1.6, 2.0, F1), 2.0, 1.4, parts=P, m="cloth_navy")
    P.append(kit.sphere("globe", 0.14, loc=(-3.25, 2.3, F1 + 0.95), m="cloth_navy", segs=16, rings=10))
    P.append(cyl("model_rocket", 0.03, 0.5, loc=(-3.25, 1.5, F1 + 1.0), m="plastic_white", verts=10))
    arch.ceiling_lamp("lamp_a", (-1.6, 2.1, C1), P, L, lights, "bedA", root)
    # ---- master bedroom
    arch.bed("bedM", (-2.4, -2.2, F1), PI / 2, w=1.55, L=2.05, parts=P)
    P.append(box("dresser", (1.2, 0.5, 0.9), loc=(-0.45, -4.0, F1 + 0.45), m="wood_dark", bevel=0.01))
    P.append(box("wardrobe", (1.0, 0.6, 2.0), loc=(-0.3, -0.5, F1 + 1.0), m="wood_dark", bevel=0.01))
    arch.ceiling_lamp("lamp_ms", (-1.6, -2.2, C1), P, L, lights, "master", root)
    # ---- room C (storage/sewing)
    arch.shelf_unit("cshelf", (3.1, -3.7, F1), -PI / 2, w=1.1, parts=P, items="boxes", seed=8)
    P.append(box("sewing", (1.0, 0.5, 0.75), loc=(0.95, -3.9, F1 + 0.375), m="wood_raw"))
    for k in range(4):
        P.append(box("cbox", (0.5, 0.4, 0.35), loc=(1.0 + (k % 2) * 0.55, -1.6 - (k // 2) * 0.45, F1 + 0.175 + (k // 2) * 0.35), m="wood_raw", bevel=0.01))
    arch.ceiling_lamp("lamp_c", (2.0, -2.7, C1), P, L, lights, "roomC", root)
    arch.ceiling_lamp("lamp_h", (1.4, 3.7, C1), P, L, lights, "hall", root)

    # ---- doors (main + screen doors that follow them)
    arch.door("door_front", (MX0 + 2.05 - 0.475, MY0 + 0.12), 0.95, 2.08, 0.0, "farm_front", root, z0=F0, glass=True)
    screen_door("scr_front", (MX0 + 2.05 - 0.495, MY0 - 0.065), 0.99, 2.08, 0.0, "farm_front_scr", "farm_front", root, F0)
    arch.door("door_back", (-1.95, MY1 - 0.12), 0.9, 2.03, PI, "farm_back", root, z0=F0)
    screen_door("scr_back", (-1.93, MY1 + 0.065), 0.94, 2.03, PI, "farm_back_scr", "farm_back", root, F0)
    arch.door("door_wingfront", (-8.55, WY0 + 0.12), 0.9, 2.03, 0.0, "farm_wingfront", root, z0=F0)
    screen_door("scr_wing", (-8.57, WY0 - 0.065), 0.94, 2.03, 0.0, "farm_wingfront_scr", "farm_wingfront", root, F0)
    d2 = arch.door("door_wing2", (-5.05, WY0 + 0.12), 0.9, 2.03, 0.0, "farm_wing2", root, z0=F0)
    d2["startOpen"] = 1
    arch.door("door_mud", (-8.85, WY1 - 0.12), 0.9, 2.03, PI, "farm_mud", root, z0=F0)
    screen_door("scr_mud", (-8.83, WY1 + 0.065), 0.94, 2.03, PI, "farm_mud_scr", "farm_mud", root, F0)
    arch.door("door_lw", (MX0 + 0.1, -1.6 - 0.475), 0.95, 2.08, PI / 2, "farm_livingwing", root, z0=F0)
    arch.door("door_km", (MX0 + 0.1, 2.55 - 0.45), 0.9, 2.03, PI / 2, "farm_kitchenmud", root, z0=F0)
    arch.door("door_office", (-8.8 - 0.45, WRY), 0.9, 2.03, 0.0, "farm_office", root, z0=F0, open_angle=-1.6)
    arch.door("door_master", (0.35, -0.975), 0.85, 2.03, PI / 2, "farm_master", root, z0=F1)
    arch.door("door_bedA", (0.35, 1.825), 0.85, 2.03, PI / 2, "farm_bedA", root, z0=F1)
    arch.door("door_roomC", (0.625, -1.1), 0.85, 2.03, 0.0, "farm_roomC", root, z0=F1, open_angle=-1.6)

    # ---- light switches (by the doors), each toggles its group
    sw = [("living", (-1.0, -4.27, F0 + 1.2), 0.0), ("kitchen", (-1.75, 4.27, F0 + 1.2), PI), ("office", (-7.5, WI_Y0 + 0.03, F0 + 1.2), 0.0),
          ("mud", (-9.95, WI_Y1 - 0.03, F0 + 1.2), PI), ("bedA", (0.29, 1.6, F1 + 1.2), PI / 2), ("master", (0.29, -1.2, F1 + 1.2), PI / 2),
          ("roomC", (1.7, -1.17, F1 + 1.2), 0.0), ("hall", (2.6, 4.27, F1 + 1.2), PI), ("porch", (-2.4, MY0 - 0.04, F0 + 1.2), 0.0)]
    for g, loc, r in sw:
        box(f"switch_{g}", (0.08, 0.02, 0.12), loc=loc, rot=(0, 0, r), m="plastic_white", par=root, interact="switch", iid=f"light_{g}", group=g)
    # interactive props
    box("tv_hit", (0.5, 0.55, 0.45), loc=(3.3, -3.2, F0 + 0.8), m="frame_black", par=root, interact="tv", iid="farm_tv").hide_render = True
    box("radio_hit", (0.45, 0.3, 0.25), loc=(-6.05, -2.65, F0 + 0.86), m="frame_black", par=root, interact="radio", iid="farm_radio").hide_render = True
    box("comp_hit", (0.5, 0.45, 0.45), loc=(-6.85, -2.6, F0 + 1.0), m="frame_black", par=root, interact="computer", iid="farm_computer").hide_render = True
    box("shelf_hit", (1.7, 0.4, 2.0), loc=(-1.5, 0.27, F1 + 1.0), m="frame_black", par=root, interact="inspect", iid="bookshelf").hide_render = True

    # ---- rooms (indoor detection volumes)
    rooms = [("living", (-3.55, 3.55, -4.3, 0.0, F0, C0)), ("kitchen", (-3.55, 3.55, 0.0, 4.3, F0, C0)),
             ("office", (WI_X0, WX1, WI_Y0, WRY, F0, W_CEIL)), ("mud", (WI_X0, WX1, WRY, WI_Y1, F0, W_CEIL)),
             ("upstairs", (-3.55, 3.55, -4.3, 4.3, C0, C1))]
    for n, (x0, x1, y0, y1, z0, z1) in rooms:
        r = box(f"ROOM_{n}", (x1 - x0, y1 - y0, z1 - z0), loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), m="frame_black", par=root, room=n)
        r.hide_render = True


def house_collision(root, interior=True):
    T = 0.22
    zc0 = F0 - 0.05

    def ops(spec_list):
        return [(s[0], s[1], s[2], s[3]) for s in spec_list] if interior else []
    # foundations / floors
    arch.col_box("COL_found_main", (0, 0, F0 / 2 - 0.05), (MX1 - MX0, MY1 - MY0, F0 + 0.1), 0, root)
    arch.col_box("COL_found_wing", ((WX0 + WX1) / 2, (WY0 + WY1) / 2, F0 / 2 - 0.05), (WX1 - WX0, WY1 - WY0, F0 + 0.1), 0, root)
    # exterior walls (door gaps only when enterable)
    arch.col_wall("cs", (MX0, MY0 + 0.1), (MX1, MY0 + 0.1), zc0, EAVE, T, ops(fh.MAIN_S["doors"]), root)
    arch.col_wall("ce", (MX1 - 0.1, MY0), (MX1 - 0.1, MY1), zc0, EAVE, T, [], root)
    arch.col_wall("cn", (MX1, MY1 - 0.1), (MX0, MY1 - 0.1), zc0, EAVE, T, ops(fh.MAIN_N["doors"]), root)
    arch.col_wall("cw", (MX0 + 0.1, MY1), (MX0 + 0.1, MY0), zc0, EAVE, T, ops(fh.MAIN_W["doors"]), root)
    arch.col_wall("cws", (WX0, WY0 + 0.1), (WX1, WY0 + 0.1), zc0, W_EAVE, T, ops(fh.WING_S["doors"]), root)
    arch.col_wall("cww", (WX0 + 0.1, WY1), (WX0 + 0.1, WY0), zc0, W_EAVE, T, [], root)
    arch.col_wall("cwn", (WX1, WY1 - 0.1), (WX0, WY1 - 0.1), zc0, W_EAVE, T, ops(fh.WING_N["doors"]), root)
    # porch deck, steps, posts
    arch.col_box("COL_porch_w", ((PX0 + MX0) / 2, (PDY + WY0) / 2, F0 / 2), (MX0 - PX0, WY0 - PDY, F0), 0, root)
    arch.col_box("COL_porch_m", ((MX0 + PX1) / 2, (PDY + MY0) / 2, F0 / 2), (PX1 - MX0, MY0 - PDY, F0), 0, root)
    for (cx, w) in ((-1.26, 1.5), (-7.1, 1.3)):
        c = arch.col_box("COL_steps", (cx, PDY - 0.45, 0.2), (w, 1.05, 0.12), 0, root)
        c.rotation_euler = (math.atan2(F0, 0.85), 0, 0)
    for px in POSTS_X:
        arch.col_box("COL_post", (px, PPY, (F0 + PBZ) / 2), (0.14, 0.14, PBZ - F0), 0, root)
    arch.col_box("COL_post", (5.55, MY0 - 0.12, 2.0), (0.14, 0.14, 3.0), 0, root)
    if not interior:
        arch.col_box("COL_shell_main", (0, 0, EAVE / 2), (MX1 - MX0, MY1 - MY0, EAVE), 0, root)
        arch.col_box("COL_shell_wing", ((WX0 + WX1) / 2, (WY0 + WY1) / 2, W_EAVE / 2), (WX1 - WX0, WY1 - WY0, W_EAVE), 0, root)
        return
    for i, (x0, x1, y0, y1) in enumerate(((-3.55, 2.45, -4.3, 4.3), (2.45, 3.55, -4.3, -0.2), (2.45, 3.55, 3.1, 4.3))):
        arch.col_box(f"COL_slab{i}", ((x0 + x1) / 2, (y0 + y1) / 2, F1 - 0.1), (x1 - x0, y1 - y0, 0.2), 0, root)
    arch.col_box("COL_ceil1", (0, 0, C1 + 0.05), (7.2, 8.7, 0.1), 0, root)
    arch.col_box("COL_ceilw", ((WI_X0 + WX1) / 2, (WI_Y0 + WI_Y1) / 2, W_CEIL + 0.05), (WX1 - WI_X0, WI_Y1 - WI_Y0, 0.1), 0, root)
    IW = 0.14
    arch.col_wall("ilk", (-3.55, 0.0), (2.45, 0.0), F0, C0, IW, [(2.85, 1.0, F0, F0 + 2.1)], root)
    arch.col_wall("ic", (0.35, -4.3), (0.35, 4.3), F1, C1, IW, [(3.75, 0.85, F1, F1 + 2.05), (6.55, 0.85, F1, F1 + 2.05)], root)
    arch.col_wall("iab", (-3.55, 0.05), (0.35, 0.05), F1, C1, IW, [], root)
    arch.col_wall("icn", (0.35, -1.1), (3.55, -1.1), F1, C1, IW, [(0.7, 0.85, F1, F1 + 2.05)], root)
    arch.col_wall("iwing", (WI_X0, WRY), (WX1, WRY), F0, W_CEIL, IW, [(-8.8 - WI_X0, 0.9, F0, F0 + 2.05)], root)
    arch.col_box("COL_rail", (2.47, 1.45, F1 + 0.5), (0.08, 3.35, 1.0), 0, root)
    arch.col_box("COL_rail2", (3.0, -0.2, F1 + 0.5), (1.1, 0.08, 1.0), 0, root)
    arch.col_box("COL_stairside", (2.45, 1.15, 1.7), (0.05, 3.9, 0.01), 0, root)
    furn = [((-3.05, -3.1, F0 + 0.4), (0.9, 2.1, 0.8)), ((3.3, -3.2, F0 + 0.5), (0.45, 1.2, 1.0)), ((-0.8, 1.9, F0 + 0.38), (1.5, 0.9, 0.76)),
            ((-0.15, 4.0, F0 + 0.45), (2.9, 0.62, 0.9)), ((1.7, 3.98, F0 + 0.45), (0.76, 0.66, 0.9)), ((2.8, 4.0, F0 + 0.45), (1.4, 0.62, 0.9)),
            ((-3.12, 1.0, F0 + 0.87), (0.7, 0.75, 1.75)), ((-6.6, -2.53, F0 + 0.38), (1.6, 0.7, 0.76)), ((WI_X0 + 0.31, -2.6, F0 + 0.65), (0.6, 0.48, 1.3)),
            ((-11.0, WRY + 0.29, F0 + 0.9), (1.6, 0.45, 1.8)), ((-7.2, WI_Y1 - 0.25, F0 + 0.9), (1.4, 0.45, 1.8)), ((-2.5, 3.2, F1 + 0.3), (1.2, 2.1, 0.6)),
            ((-1.5, 0.27, F1 + 1.0), (1.7, 0.35, 2.0)), ((-2.4, -2.2, F1 + 0.3), (2.1, 1.6, 0.6)), ((-0.45, -4.0, F1 + 0.45), (1.2, 0.5, 0.9)),
            ((-0.3, -0.5, F1 + 1.0), (1.0, 0.6, 2.0)), ((1.5, -0.22, F0 + 0.85), (0.9, 0.35, 1.7)), ((-5.2, WRY - 0.22, F0 + 0.95), (1.2, 0.35, 1.9)),
            ((3.1, -3.7, F1 + 0.9), (0.45, 1.1, 1.8)), ((-4.4, 0.6, F0 + 0.44), (0.7, 0.7, 0.88)), ((-4.35, 1.45, F0 + 0.75), (0.6, 0.6, 1.5))]
    for (c, s) in furn:
        arch.col_box("COL_furn", c, s, 0, root)


# ------------------------------------------------------------------------------------------------ porch clutter
def bike(P, loc, rot, frame_m="farm_red_faded", scale=1.0):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)
    k = scale

    def Q(lx, lz, ly=0.0):
        return (x + lx * k * c - ly * s, y + lx * k * s + ly * c, z + lz * k)
    for lx in (-0.52, 0.52):
        P.append(kit.torus("bike_tire", 0.33 * k, 0.02 * k, loc=Q(lx, 0.34), rot=(PI / 2, 0, rot), m="rubber_black", seg=28, rseg=6))
        P.append(kit.torus("bike_rim", 0.305 * k, 0.008 * k, loc=Q(lx, 0.34), rot=(PI / 2, 0, rot), m="chrome", seg=28, rseg=4))
        for sp in range(12):
            a = sp * PI / 6
            P.append(kit.tube("bike_spoke", [Q(lx, 0.34), Q(lx + 0.3 * math.cos(a), 0.34 + 0.3 * math.sin(a))], 0.0018 * k, m="chrome", seg=3))
    tubes = (((-0.52, 0.34), (0.0, 0.32)), ((0.0, 0.32), (0.4, 0.74)), ((-0.52, 0.34), (-0.13, 0.74)), ((-0.13, 0.74), (0.4, 0.74)),
             ((0.0, 0.32), (-0.13, 0.74)), ((0.4, 0.74), (0.52, 0.34)), ((0.4, 0.74), (0.37, 0.95)), ((-0.13, 0.74), (-0.16, 0.85)))
    for (a, b) in tubes:
        P.append(kit.tube("bike_frame", [Q(*a), Q(*b)], 0.014 * k, m=frame_m, seg=6))
    P.append(box("bike_seat", (0.24 * k, 0.09 * k, 0.05 * k), loc=Q(-0.17, 0.88), rot=(0, 0, rot), m="leather_brown", bevel=0.02))
    P.append(kit.tube("bike_bar", [Q(0.33, 0.97, -0.24), Q(0.37, 0.95, 0.0), Q(0.33, 0.97, 0.24)], 0.011 * k, m="chrome", seg=6))
    for sy in (-0.24, 0.24):
        P.append(cyl("bike_grip", 0.016 * k, 0.1 * k, loc=Q(0.33, 0.97, sy), rot=(PI / 2, 0, rot), m="rubber_black", verts=8))
    P.append(cyl("bike_chainring", 0.09 * k, 0.008 * k, loc=Q(0.0, 0.32, 0.03), rot=(PI / 2, 0, rot), m="metal_gray", verts=20))
    P.append(kit.tube("bike_chain", [Q(0.0, 0.41, 0.03), Q(-0.52, 0.38, 0.03), Q(-0.52, 0.30, 0.03), Q(0.0, 0.23, 0.03)], 0.004 * k, m="metal_dark", seg=4))
    for sy in (-1, 1):
        P.append(box("bike_pedal", (0.09 * k, 0.05 * k, 0.02 * k), loc=Q(0.0 + sy * 0.12, 0.32 - sy * 0.12, 0.09 * sy), rot=(0, 0, rot), m="plastic_dark"))
    P.append(kit.tube("bike_fender", [Q(-0.52 + 0.34 * math.cos(a), 0.34 + 0.34 * math.sin(a)) for a in [i * 0.2 + 0.3 for i in range(10)]], 0.012 * k, m=frame_m, seg=5))


def rocking_chair(P, loc, rot):
    objs = arch.chair("rocker", (0, 0, 0.06), 0.0, "wood_gray")
    for sx in (-0.19, 0.19):
        pts = [(sx, -0.45 + i * 0.1, 0.05 + 0.03 * ((i - 4.5) / 4.5) ** 2 * 3) for i in range(10)]
        objs.append(kit.tube("rocker_runner", pts, 0.02, m="wood_gray", seg=6))
    for k in range(5):
        objs.append(box("rocker_spindle", (0.02, 0.02, 0.55), loc=(-0.16 + k * 0.08, 0.2, 0.83), m="wood_gray"))
    objs.append(box("rocker_crest", (0.46, 0.05, 0.08), loc=(0, 0.21, 1.12), m="wood_gray", bevel=0.01))
    for sx in (-1, 1):
        objs.append(box("rocker_arm", (0.05, 0.48, 0.03), loc=(sx * 0.23, 0.0, 0.73), m="wood_gray"))
    P.extend(place(objs, loc, (0, 0, rot)))


def lawn_chair(P, loc, rot, m="steel_painted_white"):
    """1950s stamped-steel shell-back chair on a tubular cantilever frame."""
    objs = []
    for k in range(6):
        a = k / 5
        objs.append(box("lawn_seat", (0.5 - 0.06 * abs(a - 0.5), 0.09, 0.012), loc=(0, -0.22 + a * 0.44, 0.42 - 0.04 * a), rot=(-0.12, 0, 0), m=m))
    for k in range(7):
        a = k / 6
        ang = 0.25 + a * 0.15
        objs.append(box("lawn_back", (0.5 + 0.12 * math.sin(a * PI), 0.012, 0.085), loc=(0, 0.24 + a * 0.12 * math.sin(ang), 0.5 + a * 0.45), rot=(-ang, 0, 0), m=m))
    for sx in (-1, 1):
        objs.append(kit.tube("lawn_frame", [(sx * 0.24, 0.2, 0.42), (sx * 0.26, -0.28, 0.38), (sx * 0.27, -0.3, 0.02), (sx * 0.27, 0.32, 0.02), (sx * 0.24, 0.26, 0.5)], 0.014, m="steel_painted_white", seg=6))
        objs.append(kit.tube("lawn_arm", [(sx * 0.27, 0.25, 0.62), (sx * 0.28, -0.12, 0.6), (sx * 0.26, -0.25, 0.42)], 0.012, m="steel_painted_white", seg=6))
    P.extend(place(objs, loc, (0, 0, rot)))


def furniture_pile(P, x0, y0):
    """Old furniture and junk stacked on the wing end of the porch (image 2)."""
    rr = random.Random(77)
    # mattress leaning on the wall
    P.append(box("pile_mattress", (1.35, 0.2, 1.9), loc=(x0 + 1.9, y0 - 0.2, F0 + 0.93), rot=(-0.18, 0, 0.04), m="fabric_bed", bevel=0.06, segs=3))
    # sofa stood on its end
    sofa = arch.sofa("pile_sofa", (0, 0, 0), 0.0, 1.8, m="fabric_sofa")
    P.extend(place(sofa, (x0 + 0.2, y0 - 0.85, F0 + 0.92), (0, PI / 2, 0.15)))
    # table with two chairs upside down on it
    tb = arch.table("pile_table", (0, 0, 0), 1.2, 0.7, 0.74, m="wood_raw")
    P.extend(place(tb, (x0 + 1.4, y0 - 1.45, F0), (0, 0, 0.08)))
    for k, dx in enumerate((-0.3, 0.3)):
        ch = arch.chair("pile_chair", (0, 0, 0), 0.0, "wood_raw")
        P.extend(place(ch, (x0 + 1.4 + dx, y0 - 1.45 + (0.05 if k else -0.05), F0 + 0.76 + 0.95), (PI, 0, rr.uniform(-0.4, 0.4))))
    # dresser with an old TV on top
    P.append(box("pile_dresser", (1.0, 0.48, 0.85), loc=(x0 + 3.0, y0 - 0.35, F0 + 0.425), rot=(0, 0, 0.05), m="wood_dark", bevel=0.01))
    for k in range(3):
        P.append(box("pile_drawer", (0.9, 0.02, 0.22), loc=(x0 + 3.0, y0 - 0.6, F0 + 0.17 + k * 0.26), rot=(0, 0, 0.05), m="wood_dark"))
    arch.crt("pile_tv", (x0 + 3.0, y0 - 0.38, F0 + 0.85), 0.2, parts=P)
    # boxes, crates, a rolled rug, a tyre
    for (dx, dy, dz, s_, m) in ((2.4, -1.1, 0, (0.55, 0.45, 0.4), "wood_raw"), (2.45, -1.1, 0.4, (0.5, 0.42, 0.35), "fabric_bag"),
                                (0.95, -0.4, 0, (0.6, 0.5, 0.45), "fabric_bag"), (3.5, -1.0, 0, (0.45, 0.4, 0.4), "wood_raw")):
        P.append(box("pile_box", s_, loc=(x0 + dx, y0 + dy, F0 + dz + s_[2] / 2), rot=(0, 0, rr.uniform(-0.3, 0.3)), m=m, bevel=0.015))
    P.append(cyl("pile_rug", 0.14, 1.9, loc=(x0 + 1.2, y0 - 2.1, F0 + 0.14), rot=(0, PI / 2, 0.25), m="fabric_red", verts=14))
    P.append(kit.torus("pile_tire", 0.36, 0.11, loc=(x0 + 3.7, y0 - 0.3, F0 + 0.45), rot=(PI / 2 - 0.15, 0, 0.1), m="tire_rubber", seg=20, rseg=8))


def wood_stove(P, x, y, rot):
    objs = [box("stove_body", (0.62, 0.48, 0.5), loc=(0, 0, 0.45), m="metal_dark", bevel=0.02),
            box("stove_top", (0.68, 0.54, 0.04), loc=(0, 0, 0.72), m="metal_dark", bevel=0.01),
            box("stove_door", (0.3, 0.03, 0.26), loc=(0.05, -0.25, 0.45), m="metal_dark", bevel=0.01),
            cyl("stove_collar", 0.08, 0.2, loc=(0, 0.12, 0.84), m="metal_dark", verts=12)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(box("stove_leg", (0.05, 0.05, 0.2), loc=(sx * 0.26, sy * 0.19, 0.1), m="metal_dark"))
    P.extend(place(objs, (x, y, F0), (0, 0, rot)))


def wringer_washer(P, x, y, rot):
    objs = [kit.lathe("washer_tub", [(0.0, 0.0), (0.3, 0.0), (0.33, 0.06), (0.33, 0.6), (0.35, 0.62), (0.31, 0.62), (0.3, 0.06), (0.0, 0.06)], m="enamel_white", seg=28, loc=(0, 0, 0.3))]
    for k in range(4):
        a = k * PI / 2 + PI / 4
        objs.append(kit.tube("washer_leg", [(0.22 * math.cos(a), 0.22 * math.sin(a), 0.32), (0.3 * math.cos(a), 0.3 * math.sin(a), 0.0)], 0.018, m="metal_gray", seg=6))
    objs.append(box("wringer_frame", (0.5, 0.1, 0.24), loc=(0, 0.2, 1.08), m="metal_gray", bevel=0.01))
    for z in (1.03, 1.12):
        objs.append(cyl("wringer_roll", 0.04, 0.42, loc=(0, 0.2, z), rot=(0, PI / 2, 0), m="rubber_black", verts=12))
    objs.append(kit.tube("wringer_crank", [(0.26, 0.2, 1.12), (0.32, 0.2, 1.12), (0.32, 0.2, 1.24), (0.38, 0.2, 1.24)], 0.01, m="metal_gray", seg=5))
    objs.append(kit.tube("wringer_post", [(0, 0.2, 0.95), (0, 0.3, 0.6)], 0.03, m="metal_gray", seg=6))
    P.extend(place(objs, (x, y, F0), (0, 0, rot)))


def milk_can(P, x, y, rot=0.0, tip=0.0):
    prof = [(0.0, 0.0), (0.17, 0.0), (0.175, 0.03), (0.17, 0.42), (0.11, 0.5), (0.1, 0.58), (0.125, 0.6), (0.125, 0.63), (0.0, 0.64)]
    can = kit.lathe("milk_can", prof, m="steel_galv", seg=24)
    hd = [kit.tube("milk_handle", [(-0.12, 0, 0.52), (-0.2, 0, 0.55), (-0.2, 0, 0.6)], 0.01, m="steel_galv", seg=5),
          kit.tube("milk_handle", [(0.12, 0, 0.52), (0.2, 0, 0.55), (0.2, 0, 0.6)], 0.01, m="steel_galv", seg=5)]
    P.extend(place([can] + hd, (x, y, F0), (tip, 0, rot)))


def porch_clutter(P):
    furniture_pile(P, -11.6, WY0 - 0.15)
    wood_stove(P, -11.85, -6.25, 0.3)
    wringer_washer(P, -7.25, WY0 - 0.42, 0.4)
    P.append(box("freezer", (1.1, 0.62, 0.86), loc=(-5.95, WY0 - 0.36, F0 + 0.43), m="enamel_white", bevel=0.03))
    P.append(box("freezer_lid", (1.12, 0.64, 0.04), loc=(-5.95, WY0 - 0.36, F0 + 0.88), m="enamel_white", bevel=0.015))
    P.append(box("freezer_handle", (0.3, 0.03, 0.03), loc=(-5.95, WY0 - 0.69, F0 + 0.82), m="chrome"))
    # galvanised washtub hung on the wing wall
    P.append(cyl("washtub", 0.34, 0.24, r2=0.3, loc=(-6.0, WY0 - 0.15, 2.0), rot=(PI / 2, 0, 0), m="steel_galv", verts=28))
    milk_can(P, -4.0, -4.2)
    milk_can(P, -4.3, -4.3, 1.0)
    bike(P, (-3.05, MY0 - 0.32, F0), PI - 0.04)
    bike(P, (3.6, -5.35, F0), 2.6, frame_m="cloth_navy", scale=0.78)
    rocking_chair(P, (0.4, -5.25, F0), PI + 0.35)
    lawn_chair(P, (1.35, -5.35, F0), PI - 0.2)
    lawn_chair(P, (2.45, -5.0, F0), PI + 0.4, m="steel_painted_white")
    arch.table("porch_table", (1.9, -5.95, F0), 0.6, 0.45, 0.5, m="wood_gray", parts=P)
    for k in range(2):
        P.append(box("porch_boot", (0.11, 0.27, 0.3), loc=(-0.95 + k * 0.15, MY0 - 0.3, F0 + 0.15), rot=(0, 0, 0.1 * k), m="rubber_black", bevel=0.03))
    P.append(seg_box("broom_handle", (-8.8, WY0 - 0.08, F0 + 0.25), (-8.95, WY0 - 0.12, F0 + 1.45), 0.025, 0.025, "wood_raw"))
    P.append(box("broom_head", (0.3, 0.06, 0.25), loc=(-8.8, WY0 - 0.12, F0 + 0.14), rot=(0, 0.12, 0), m="corn_tassel", bevel=0.01))
    for (x, y) in ((4.9, -6.4), (5.25, -6.1)):
        P.append(box("porch_crate", (0.55, 0.45, 0.4), loc=(x, y, F0 + 0.2), rot=(0, 0, random.uniform(-0.3, 0.3)), m="wood_raw", bevel=0.01))


# ------------------------------------------------------------------------------------------------ yard props
def mound(name, cx, cy, rx, ry, h, rot=0.0, seed=0, m="sand_dust"):
    """Wind-blown dust drift: smooth elliptical mound with a ragged outline that sinks just below grade."""
    rng = random.Random(seed)
    R, S = 7, 32
    ph = [rng.uniform(0, 6.283) for _ in range(6)]
    bm = bmesh.new()
    c, s = math.cos(rot), math.sin(rot)
    centre = bm.verts.new((cx, cy, h))
    rings = []
    for k in range(1, R + 1):
        r = k / R
        ring = []
        for j in range(S):
            a = j * 2 * PI / S
            wob = 1 + 0.12 * math.sin(3 * a + ph[0]) + 0.07 * math.sin(5 * a + ph[1]) + 0.05 * math.sin(9 * a + ph[2])
            lx, ly = rx * r * wob * math.cos(a), ry * r * wob * math.sin(a)
            hz = h * max(0.0, 1 - r * r) ** 1.4 * (1 + 0.08 * math.sin(4 * a + ph[3]) * r) - (0.04 if k == R else 0.0)
            ring.append(bm.verts.new((cx + lx * c - ly * s, cy + lx * s + ly * c, hz)))
        rings.append(ring)
    for j in range(S):
        bm.faces.new((centre, rings[0][j], rings[0][(j + 1) % S]))
    for k in range(R - 1):
        for j in range(S):
            bm.faces.new((rings[k][j], rings[k + 1][j], rings[k + 1][(j + 1) % S], rings[k][(j + 1) % S]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, (m,))
    kit.smooth(o, 80)
    return o


def woodpile(P, cx, cy):
    rr = random.Random(11)
    for k in range(70):
        a = rr.uniform(0, 2 * PI)
        r = math.sqrt(rr.random())
        x = cx + math.cos(a) * r * 1.5
        y = cy + math.sin(a) * r * 0.8
        z = 0.08 + (1 - r) * 0.55 * rr.uniform(0.6, 1.0)
        Lg = rr.uniform(0.38, 0.55)
        rot = (rr.uniform(-0.25, 0.25), rr.uniform(-0.2, 0.2) + PI / 2, rr.uniform(0, PI))
        if rr.random() < 0.35:
            P.append(cyl("log", rr.uniform(0.05, 0.08), Lg, loc=(x, y, z), rot=rot, m="bark", verts=9))
        else:
            rw = rr.uniform(0.07, 0.1)
            P.append(prism("split", [(0, 0), (rw, 0), (rw * 0.4, rw * 0.9)], -Lg / 2, Lg / 2, m="firewood", loc=(x, y, z), rot=rot))
    # chopping block with an axe
    P.append(cyl("chop_block", 0.24, 0.45, loc=(cx - 1.9, cy + 1.6, 0.225), m="firewood", verts=18))
    P.append(cyl("chop_bark", 0.245, 0.4, loc=(cx - 1.9, cy + 1.6, 0.2), m="bark", verts=18, cap=False))
    P.append(seg_box("axe_handle", (cx - 1.85, cy + 1.6, 0.47), (cx - 1.4, cy + 1.55, 1.05), 0.035, 0.025, "wood_raw"))
    P.append(box("axe_head", (0.06, 0.2, 0.1), loc=(cx - 1.86, cy + 1.6, 0.47), rot=(0, 0.8, 0), m="metal_dark"))
    for k in range(5):
        P.append(prism("split", [(0, 0), (0.09, 0), (0.035, 0.08)], -0.22, 0.22, m="firewood", loc=(cx - 2.3 + k * 0.12, cy + 1.95 - k * 0.05, 0.03), rot=(0, PI / 2, rr.uniform(0, PI))))


def poly_tank(P, x, y, r, h, name):
    prof = [(0.0, 0.0), (r - 0.02, 0.0), (r, 0.03), (r, h - 0.22), (r * 0.9, h - 0.08), (r * 0.55, h), (0.0, h + 0.01)]
    P.append(kit.lathe(name, prof, m="poly_blue", seg=36, loc=(x, y, 0)))
    for k in range(4):
        P.append(kit.torus(name + "_rib", r + 0.005, 0.018, loc=(x, y, 0.25 + k * (h - 0.5) / 3), m="poly_blue", seg=36, rseg=5))
    P.append(cyl(name + "_lid", r * 0.28, 0.08, loc=(x, y, h + 0.03), m="plastic_dark", verts=20))
    P.append(cyl(name + "_valve", 0.04, 0.16, loc=(x + r + 0.06, y, 0.12), rot=(0, PI / 2, 0), m="pipe_blue", verts=10))
    P.append(box(name + "_handle", (0.05, 0.08, 0.05), loc=(x + r + 0.15, y, 0.12), m="warning_red"))


def propane_tank(P, x, y, rot):
    Lc, r = 2.2, 0.48
    objs = [cyl("lp_body", r, Lc, rot=(0, PI / 2, 0), m="enamel_white", verts=32)]
    for sx in (-1, 1):
        objs.append(kit.sphere("lp_end", r, loc=(sx * Lc / 2, 0, 0), m="enamel_white", segs=32, rings=12, scale=(0.5, 1, 1)))
        objs.append(box("lp_pad", (0.4, 0.7, 0.2), loc=(sx * 0.7, 0, -r - 0.1 + 0.02), m="concrete"))
        objs.append(box("lp_leg", (0.12, 0.6, 0.1), loc=(sx * 0.7, 0, -r + 0.02), m="enamel_white"))
    objs.append(kit.lathe("lp_dome", [(0.0, 0.0), (0.22, 0.0), (0.22, 0.05), (0.18, 0.16), (0.0, 0.19)], m="enamel_white", seg=24, loc=(0, 0, r - 0.02)))
    objs.append(box("lp_reg", (0.08, 0.08, 0.1), loc=(0.15, -0.3, r + 0.05), m="steel_painted_gray"))
    objs.append(kit.tube("lp_line", [(0.15, -0.35, r + 0.05), (0.2, -0.6, r * 0.2), (0.2, -0.7, -r - 0.08)], 0.012, m="metal_bronze", seg=5))
    P.extend(place(objs, (x, y, r + 0.2), (0, 0, rot)))


def yard_props(root, P):
    for (nm, cx, cy, rx, ry, h, rot, sd) in (("dust_porch_w", -9.6, -7.85, 3.2, 0.95, 0.32, 0.03, 1), ("dust_porch_m", -3.6, -7.9, 2.6, 0.85, 0.26, -0.02, 2),
                                            ("dust_porch_e", 2.4, -7.75, 3.0, 1.05, 0.42, 0.04, 3), ("dust_porch_ee", 6.6, -6.4, 1.3, 1.9, 0.3, 0.3, 4),
                                            ("dust_west", -12.95, 0.4, 0.8, 3.3, 0.26, 0.0, 5), ("dust_yard1", -15.8, -9.5, 3.6, 2.0, 0.22, 0.5, 6),
                                            ("dust_yard2", 9.5, -10.5, 4.5, 2.4, 0.18, -0.3, 7), ("dust_steps", -7.1, -8.05, 1.2, 0.7, 0.2, 0.0, 8)):
        P.append(mound(nm, cx, cy, rx, ry, h, rot, sd))
    woodpile(P, -14.4, -6.3)
    # burn barrel
    P.append(cyl("burn_barrel", 0.29, 0.88, loc=(-16.6, -2.2, 0.44), m="rust", verts=24, cap=False))
    P.append(cyl("burn_barrel_ash", 0.28, 0.02, loc=(-16.6, -2.2, 0.55), m="rock_dark", verts=24))
    for k in range(3):
        P.append(kit.torus("burn_barrel_ring", 0.292, 0.012, loc=(-16.6, -2.2, 0.08 + k * 0.36), m="rust", seg=24, rseg=4))
    arch.col_box("COL_burnbarrel", (-16.6, -2.2, 0.44), (0.6, 0.6, 0.88), 0, root)
    # blue poly water tanks west of the house (image 2), propane tank east
    for (x, y, r, h, n) in ((-20.6, -5.4, 0.62, 1.75, "ptank0"), (-19.0, -6.3, 0.62, 1.55, "ptank1")):
        poly_tank(P, x, y, r, h, n)
        arch.col_box("COL_" + n, (x, y, h / 2), (r * 1.8, r * 1.8, h), 0, root)
    propane_tank(P, 13.5, -1.5, 0.15)
    arch.col_box("COL_propane", (13.5, -1.5, 0.7), (3.3, 1.1, 1.4), 0.15, root)
    # woodpile & chopping block collision
    arch.col_box("COL_woodpile", (-14.4, -6.3, 0.3), (2.8, 1.5, 0.6), 0, root)


# ------------------------------------------------------------------------------------------------ outbuildings
from farm_outbuildings import outbuildings


def neighbor_variant():
    kit.reset()
    root = empty("NeighborHouse")
    P, G, L, Pr, lights = fh.build_shell(root, interior=False)
    house_collision(root, interior=False)
    st = merge(P, "nh_static", par=root)
    finish(st, 35)
    rf = merge(Pr, "nh_roofs", par=root)
    finish(rf, 35, uv=False)
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


PREVIEW_TEX = {"clapboard": ("clapboard_a", 3.68), "shingle_dark": ("shingle_a", None), "shingle_dusty": ("shingle_dusty_a", None)}


def build(preview=True, only_house=False):
    random.seed(1)
    kit.reset()
    root = empty("Farm")
    P, G, L, Pr, lights = fh.build_shell(root, interior=True)
    build_interior(root, P, G, L, lights)
    porch_clutter(P)
    house_collision(root, interior=True)
    yard_props(root, P)
    if not only_house:
        outbuildings(root, P, G, L, lights)

    def region(o):
        x, y = o.matrix_basis.translation.x, o.matrix_basis.translation.y
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
    rf = merge(Pr, "farm_roofs", par=root)
    finish(rf, 35, uv=False)
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
        kit.preview_textures(PREVIEW_TEX)
        pd = kit.preview_dir()
        sun = (-0.35, -0.7, 0.45)
        kit.preview(os.path.join(pd, "farm_ref2.png"), (-24, -40, 1.6), (-3.5, 0, 4.2), lens=32, samples=24, sun=sun, world=(0.62, 0.66, 0.7), res=(1280, 640))
        kit.preview(os.path.join(pd, "farm_front.png"), (6, -22, 3.0), (-3.5, -3, 3.2), lens=30, samples=20, sun=sun, world=(0.62, 0.66, 0.7))
        kit.preview(os.path.join(pd, "farm_porch.png"), (-2.5, -10.5, 1.7), (-7.5, -4.0, 1.6), lens=24, samples=20, sun=sun, world=(0.62, 0.66, 0.7))
        kit.preview(os.path.join(pd, "farm_back.png"), (22, 26, 9), (-4, 0, 3.5), lens=30, samples=16, sun=sun, world=(0.62, 0.66, 0.7))
    if not only_house:
        neighbor_variant()


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv, only_house="--house" in sys.argv)
