"""
Edmunds' camp on the desert world (reference photos: the camp at dusk among boulder piles). Original model built from
the references; no logos or markings from them.

A cleared sandy flat ringed by piles of big, wind-rounded granite boulders. On it: a long white inflatable hab of
pillowed ribs in two sections (a low greenhouse tunnel and a taller living module) that glows like a lantern after dark;
supply crates, standing gas bottles and storage bins in front of it, small light boxes on posts; a flag pole with a
striped flag and a dark pennant; a small glowing cone tent; a dark upright transmitter cabinet (the dead beacon) with
its mast; a dark faceted lander on four legs with lights under its belly; a boxy white rover; a ribbed white container
module on legs with lights beneath it; thin lamp poles throwing pools of light; solar panels; scattered crates and
drums. Behind the camp a boulder ridge with a toppled seismometer on top and fresh rockfall at its foot.
Interiors: the living module (cot, workbench with the log terminal, shelves, water tank, seed-packet board, hanging
lamps) opening into the greenhouse (raised beds of beans, rye and blue flowers, a condenser and drip line, grow lights);
the container lab (sample shelves, bench, seismometer spares).

Blender: camp centre at the origin, -Y = the approach side, Z up; ground (pad level) z = 0.
Nodes: door_hab / door_cont (interact=door), *_hit (interact=lazarus, iid=edmunds_log|edmunds_greenhouse|
edmunds_beacon|edmunds_helmet), edm_hab_skin / edm_tent_skin (glowing membranes), lamps_* (lampmesh camp/hab/cont/lander),
light_*, snap_* boulder piles (dropped onto the terrain at runtime), spot_*, ROOM_edm_hab / ROOM_edm_green / ROOM_edm_lab.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe, loft
import camp
from camp import arch_pts, shell_x, cap_x, heightgrid, smoothstep, n2, col, hit, lamp_post, boulder, crate, drum, tank

PI = math.pi
R = random.Random(402)
FAB = "hab_fabric"
FZ = 0.3                       # hab deck top
# hab sections: (name, x0, x1, W, H, r) — A: greenhouse (low, long), B: living module (taller)
HA = ("green", -15.6, -8.3, 4.4, 2.9, 1.25)
HB = ("living", -8.3, -2.9, 5.0, 3.6, 1.45)
HY = -1.5                      # hab axis y
SIDE = 5                       # profile points on each straight side (equal counts → offsets can be skinned)
DOOR = (-5.6, 1.25)            # living-module door: centre x, width


def arch(s, d=0.0, bulge=0.12):
    _, x0, x1, W, H, r = s
    pts = arch_pts(W + 2 * d, H + d, r + d, n=8, z0=0.0, bulge=bulge, side=SIDE)
    return [(y + HY, z) for (y, z) in pts]


def closed(s, d=0.0):
    p = arch(s, d)
    return p


# ================================================================================================ hab
def hab(root, S, P, L, lights):
    """S: glowing membrane parts (edm_hab_skin), P: hard parts, L: hab lamps."""
    for s in (HA, HB):
        nm, x0, x1, W, H, r = s
        mem = shell_x(f"{nm}_membrane", arch(s), arch(s, -0.06), x0, x1, FAB)
        if s is HB:
            cut = box("door_cut", (DOOR[1], 1.6, 2.06), loc=(DOOR[0], HY - W / 2, FZ + 1.03), m=FAB)
            kit.boolean(mem, cut)
        S.append(mem)
        # pillowed ribs every ~0.95 m (clear of the door)
        n = max(2, int(round((x1 - x0) / 0.95)))
        for k in range(n + 1):
            xr = x0 + 0.1 + (x1 - x0 - 0.2) * k / n
            if s is HB and abs(xr - DOOR[0]) < DOOR[1] / 2 + 0.12:
                continue
            rib = shell_x(f"{nm}_rib", arch(s, 0.09), arch(s, -0.02), xr - 0.11, xr + 0.11, FAB)
            kit.add_bevel(rib, 0.08, 3, 30)
            S.append(rib)
        # anchor straps and ground pegs at the foot of each rib
        for k in range(n + 1):
            xr = x0 + 0.1 + (x1 - x0 - 0.2) * k / n
            for sy in (-1, 1):
                P.append(box("anchor", (0.1, 0.25, 0.08), loc=(xr, HY + sy * (W / 2 + 0.25), 0.04), m="metal_dark"))
                P.append(kit.tube("strap", [(xr, HY + sy * (W / 2 + 0.1), 0.6), (xr, HY + sy * (W / 2 + 0.25), 0.06)], 0.015, m="fabric_bag", seg=4))
    # end walls: A's far end (closed), B's far end (closed), B's near end is a ring around A's profile
    # (the arch runs -Y → +Y over the top: unflipped, its cap faces -X)
    S.append(cap_x("endwall", arch(HA), HA[1] - 0.03, FAB, flip=False))
    S.append(cap_x("endwall_in", arch(HA, -0.06), HA[1] + 0.03, FAB, flip=True))
    S.append(cap_x("endwall", arch(HB), HB[2] + 0.03, FAB, flip=True))
    S.append(cap_x("endwall_in", arch(HB, -0.06), HB[2] - 0.03, FAB, flip=False))
    S.append(shell_x("joint", arch(HB), arch(HA, 0.09), HB[1] - 0.04, HB[1] + 0.04, FAB))
    # deck under both sections (raised floor), skirt boards
    for s in (HA, HB):
        nm, x0, x1, W, H, r = s
        P.append(box("deck", (x1 - x0, W - 0.1, FZ), loc=((x0 + x1) / 2, HY, FZ / 2), m="wood_gray"))
        P.append(box("deck_top", (x1 - x0 - 0.1, W - 0.3, 0.02), loc=((x0 + x1) / 2, HY, FZ + 0.0), m="int_floor"))
    # rigid door frame portal on the living module (front side) and its step
    yd = HY - HB[3] / 2
    fr = []
    for (dx, w) in ((-DOOR[1] / 2 - 0.08, 0.16), (DOOR[1] / 2 + 0.08, 0.16)):
        fr.append(box("portal_post", (w, 0.7, 2.2), loc=(DOOR[0] + dx, yd + 0.05, FZ + 1.1), m="paint_charcoal", bevel=0.02))
    fr.append(box("portal_head", (DOOR[1] + 0.32, 0.7, 0.2), loc=(DOOR[0], yd + 0.05, FZ + 2.2), m="paint_charcoal", bevel=0.02))
    fr.append(box("portal_hood", (DOOR[1] + 0.5, 0.95, 0.08), loc=(DOOR[0], yd - 0.05, FZ + 2.36), rot=(0.12, 0, 0), m="paint_charcoal", bevel=0.02))
    fr.append(box("portal_lamp", (0.3, 0.1, 0.08), loc=(DOOR[0], yd - 0.33, FZ + 2.26), m="metal_gray"))
    P.extend(fr)
    L.append(box("portal_lamp_lens", (0.26, 0.02, 0.05), loc=(DOOR[0], yd - 0.39, FZ + 2.24), m="emit_warm"))
    P.append(box("door_step", (1.4, 0.7, 0.15), loc=(DOOR[0], yd - 0.6, 0.075), m="int_grate"))
    col("door_step", (DOOR[0], yd - 0.6, 0.075), (1.4, 0.7, 0.15), root)
    dn = empty("door_hab", loc=(DOOR[0] - DOOR[1] / 2, yd - 0.22, FZ), parent=root, interact="door", iid="edm_hab", openAngle=-1.75)
    parts = [box("dh_panel", (DOOR[1] - 0.02, 0.06, 2.02), loc=(DOOR[1] / 2, 0, 1.01), m="plastic_white", bevel=0.01)]
    parts.append(box("dh_win", (0.4, 0.07, 0.32), loc=(DOOR[1] / 2, 0, 1.55), m="glass_dark", bevel=0.02))
    parts.append(box("dh_handle", (0.16, 0.1, 0.04), loc=(DOOR[1] - 0.15, -0.03, 1.0), m="metal_gray"))
    parts.append(box("dh_kick", (DOOR[1] - 0.06, 0.07, 0.25), loc=(DOOR[1] / 2, 0, 0.14), m="metal_dark"))
    m = merge(parts, "door_hab_panel", par=dn)
    finish(m, 30)
    col("door_hab", (DOOR[0], yd - 0.22, FZ + 1.02), (DOOR[1], 0.12, 2.04), root, door="edm_hab")
    # colliders: deck, walls (membrane is soft but solid enough), ends
    for s in (HA, HB):
        nm, x0, x1, W, H, r = s
        col(f"{nm}_deck", ((x0 + x1) / 2, HY, FZ / 2), (x1 - x0, W, FZ), root)
        col(f"{nm}_roof", ((x0 + x1) / 2, HY, H + 0.2), (x1 - x0, W, 0.4), root)
        if s is HB:
            col(f"{nm}_front_a", ((x0 + DOOR[0] - DOOR[1] / 2) / 2, HY - W / 2 + 0.1, H / 2), (DOOR[0] - DOOR[1] / 2 - x0, 0.4, H), root)
            col(f"{nm}_front_b", ((DOOR[0] + DOOR[1] / 2 + x1) / 2, HY - W / 2 + 0.1, H / 2), (x1 - DOOR[0] - DOOR[1] / 2, 0.4, H), root)
            col(f"{nm}_door_head", (DOOR[0], HY - W / 2 + 0.1, (FZ + 2.06 + H) / 2), (DOOR[1], 0.4, H - FZ - 2.06), root)
        else:
            col(f"{nm}_front", ((x0 + x1) / 2, HY - W / 2 + 0.1, H / 2), (x1 - x0, 0.4, H), root)
        col(f"{nm}_back", ((x0 + x1) / 2, HY + W / 2 - 0.1, H / 2), (x1 - x0, 0.4, H), root)
    col("green_end", (HA[1] - 0.1, HY, HA[4] / 2), (0.3, HA[3], HA[4]), root)
    col("living_end", (HB[2] + 0.1, HY, HB[4] / 2), (0.3, HB[3], HB[4]), root)
    # joint shoulders (B wider/taller than A)
    col("joint_l", (HB[1], HY - (HA[3] / 2 + HB[3] / 2) / 2 - 0.05, HB[4] / 2), (0.15, (HB[3] - HA[3]) / 2 + 0.1, HB[4]), root)
    col("joint_r", (HB[1], HY + (HA[3] / 2 + HB[3] / 2) / 2 + 0.05, HB[4] / 2), (0.15, (HB[3] - HA[3]) / 2 + 0.1, HB[4]), root)
    for (x, y) in ((-6.8, HY + 0.5), (-4.4, HY - 0.6), (-11.0, HY), (-14.0, HY)):
        z = (HB[4] if x > HB[1] else HA[4]) - 0.55
        lights.append(empty(f"light_hab_{len(lights)}", loc=(x, y, z), parent=root, light="warm", group="hab", intensity=1.6, distance=6.5))


def living(root, P, L):
    """Inside the living module."""
    x0, x1 = HB[1], HB[2]
    yb = HY + HB[3] / 2 - 0.55     # back wall line (usable)
    yf = HY - HB[3] / 2 + 0.55
    # workbench along the back with the log terminal
    P.append(box("bench_top", (2.8, 0.75, 0.05), loc=(-6.0, yb - 0.1, FZ + 0.8), m="wood_board", bevel=0.01))
    for x in (-7.3, -4.7):
        for dy in (-0.3, 0.3):
            P.append(box("bench_leg", (0.05, 0.05, 0.8), loc=(x, yb - 0.1 + dy, FZ + 0.4), m="metal_gray"))
    P.append(box("bench_shelf", (2.7, 0.6, 0.03), loc=(-6.0, yb - 0.1, FZ + 0.25), m="wood_board"))
    col("bench", (-6.0, yb - 0.1, FZ + 0.42), (2.85, 0.8, 0.84), root)
    # laptop + screen (the log), a field microscope, soil jars, papers
    P.append(box("laptop_base", (0.36, 0.26, 0.02), loc=(-5.6, yb - 0.2, FZ + 0.835), m="plastic_gray", bevel=0.005))
    P.append(box("laptop_lid", (0.36, 0.015, 0.24), loc=(-5.6, yb - 0.06, FZ + 0.96), rot=(-0.25, 0, 0), m="plastic_gray"))
    P.append(box("laptop_screen", (0.32, 0.005, 0.2), loc=(-5.6, yb - 0.075, FZ + 0.96), rot=(-0.25, 0, 0), m="emit_screen"))
    hit("hablog", (0.5, 0.45, 0.4), (-5.6, yb - 0.15, FZ + 0.95), root, interact="lazarus", iid="edmunds_log")
    P.append(cyl("microscope_base", 0.08, 0.04, loc=(-6.7, yb - 0.2, FZ + 0.845), m="console_dark", verts=12))
    P.append(cyl("microscope_tube", 0.03, 0.3, loc=(-6.7, yb - 0.15, FZ + 1.0), rot=(0.35, 0, 0), m="console_dark", verts=10))
    for k in range(5):
        P.append(cyl("soil_jar", 0.045, 0.12, loc=(-7.25 + k * 0.11, yb + 0.12, FZ + 0.885), m="glass_clear", verts=10))
        P.append(cyl("soil_in_jar", 0.04, 0.06, loc=(-7.25 + k * 0.11, yb + 0.12, FZ + 0.86), m="soil_bed", verts=10))
    for k in range(3):
        P.append(box("paper", (0.21, 0.29, 0.003), loc=(-5.0 + k * 0.08, yb - 0.25, FZ + 0.83 + k * 0.003), rot=(0, 0, 0.2 * k - 0.2), m="plate_white"))
    # stool
    P.append(cyl("stool_seat", 0.18, 0.05, loc=(-5.6, yb - 0.75, FZ + 0.55), m="plastic_dark", verts=14))
    P.append(cyl("stool_post", 0.03, 0.5, loc=(-5.6, yb - 0.75, FZ + 0.27), m="metal_gray", verts=8))
    # cot with sleeping bag on the front side, by the greenhouse end
    P.append(box("cot_frame", (2.0, 0.8, 0.05), loc=(-7.2, yf + 0.25, FZ + 0.42), m="metal_gray"))
    for x in (-8.1, -6.3):
        for dy in (-0.35, 0.35):
            P.append(box("cot_leg", (0.04, 0.04, 0.42), loc=(x, yf + 0.25 + dy, FZ + 0.21), m="metal_gray"))
    P.append(box("cot_bag", (1.9, 0.74, 0.14), loc=(-7.2, yf + 0.25, FZ + 0.52), m="fabric_orange", bevel=0.06))
    P.append(box("cot_pillow", (0.4, 0.6, 0.12), loc=(-7.95, yf + 0.25, FZ + 0.62), m="fabric_bed", bevel=0.05))
    col("cot", (-7.2, yf + 0.25, FZ + 0.3), (2.0, 0.8, 0.6), root)
    # shelving at the far end: supply boxes, water tank, seed-packet board
    for k in range(4):
        P.append(box("shelf", (0.5, 2.4, 0.03), loc=(x1 - 0.35, HY + 0.4, FZ + 0.35 + k * 0.55), m="wood_board"))
    for sy in (-1, 1):
        P.append(box("shelf_post", (0.04, 0.04, 2.2), loc=(x1 - 0.35, HY + 0.4 + sy * 1.18, FZ + 1.1), m="metal_gray"))
    for k in range(4):
        for j in range(3):
            if R.random() < 0.25:
                continue
            P.extend(crate(f"shelf_box_{k}_{j}", (0.42, 0.62, 0.3), (x1 - 0.36, HY - 0.35 + j * 0.75, FZ + 0.37 + k * 0.55 + 0.15), 0.0,
                           m=R.choice(("plastic_white", "plastic_gray", "fabric_orange"))))
    col("shelves", (x1 - 0.35, HY + 0.4, FZ + 1.1), (0.55, 2.45, 2.2), root)
    P.append(cyl("water_tank", 0.35, 1.2, loc=(x1 - 0.55, HY - 1.6, FZ + 0.6), m="poly_blue", verts=18))
    P.append(cyl("water_tap", 0.03, 0.12, loc=(x1 - 0.55, HY - 1.95, FZ + 0.25), rot=(PI / 2, 0, 0), m="metal_gray", verts=8))
    col("water_tank", (x1 - 0.55, HY - 1.6, FZ + 0.6), (0.7, 0.7, 1.2), root)
    # pinboard with seed packets on the wall by the greenhouse opening
    P.append(box("pinboard", (1.1, 0.03, 0.8), loc=(-6.0, 0.86, FZ + 1.75), m="wood_raw"))
    for k in range(9):
        P.append(box("seed_packet", (0.12, 0.01, 0.17), loc=(-6.4 + (k % 3) * 0.38, 0.84, FZ + 1.5 + (k // 3) * 0.24), rot=(0, 0.1 * (k % 2) - 0.05, 0),
                     m=R.choice(("flag_red", "leaf_pale", "flower_blue", "warning_yellow", "plate_white"))))
    # rug, a crate used as a table with a mug
    P.append(box("rug", (1.6, 1.0, 0.01), loc=(-5.4, HY - 0.2, FZ + 0.012), m="fabric_red"))
    P.extend(crate("table_crate", (0.6, 0.5, 0.5), (-4.4, HY - 0.4, FZ + 0.25), 0.3, m="plastic_gray"))
    P.append(cyl("mug", 0.045, 0.1, loc=(-4.4, HY - 0.4, FZ + 0.56), m="ceramic_white", verts=10))
    # hanging lamps from the ribs
    for (x, y) in ((-6.8, HY + 0.5), (-4.4, HY - 0.6)):
        z = HB[4] - 0.55
        P.append(cyl("lamp_cord", 0.006, 0.45, loc=(x, y, z + 0.32), m="rubber_black", verts=4))
        P.append(cyl("lamp_shade", 0.16, 0.12, loc=(x, y, z + 0.06), r2=0.05, m="paint_charcoal", verts=14))
        L.append(kit.sphere("lamp_bulb", 0.06, loc=(x, y, z - 0.02), m="emit_warm", segs=10, rings=6))
    rv = box("ROOM_edm_hab", (x1 - x0, HB[3] - 0.2, HB[4] - FZ), loc=((x0 + x1) / 2, HY, (FZ + HB[4]) / 2), m="frame_black", par=root, room="edmunds_living")
    rv.hide_render = True


def greenhouse(root, P, G, L):
    """Inside the greenhouse section: raised beds, plants, condenser, drip line, grow lights."""
    x0, x1 = HA[1], HA[2]
    xa, xb = x0 + 0.5, x1 - 0.35
    for sy in (-1, 1):
        yc = HY + sy * 1.25
        P.append(box("bed_frame", (xb - xa, 0.95, 0.45), loc=((xa + xb) / 2, yc, FZ + 0.225), m="wood_raw", bevel=0.01))
        P.append(box("bed_soil", (xb - xa - 0.08, 0.87, 0.04), loc=((xa + xb) / 2, yc, FZ + 0.44), m="soil_bed"))
        col(f"bed_{sy}", ((xa + xb) / 2, yc, FZ + 0.225), (xb - xa, 0.95, 0.45), root)
        # drip line along the bed
        P.append(kit.tube("drip_line", [(xa, yc + sy * 0.38, FZ + 0.47), (xb, yc + sy * 0.38, FZ + 0.47)], 0.012, m="rubber_black", seg=5))
        x = xa + 0.25
        k = 0
        while x < xb - 0.2:
            kind = (k // 4) % 3 if sy < 0 else (k // 4 + 1) % 3
            if kind == 0:
                # beans: a string to the ridge and leaf clusters climbing it
                P.append(cyl("bean_string", 0.004, HA[4] - 0.9, loc=(x, yc, FZ + 0.45 + (HA[4] - 0.9) / 2), m="fabric_bag", verts=4))
                for j in range(12):
                    zz = FZ + 0.55 + j * 0.15 + R.uniform(-0.04, 0.04)
                    a = j * 2.4 + R.uniform(-0.4, 0.4)
                    lf = kit.sphere("bean_leaf", R.uniform(0.05, 0.085), loc=(x + 0.07 * math.cos(a), yc + 0.07 * math.sin(a), zz), m="leaf_green" if j % 3 else "leaf_pale", segs=6, rings=4, scale=(1.5, 0.9, 0.28))
                    lf.rotation_euler = (R.uniform(-0.7, 0.7), R.uniform(-0.5, 0.5), a)
                    G.append(lf)
            elif kind == 1:
                # rye: a tuft of thin blades
                for j in range(7):
                    a = j * 0.9
                    G.append(cyl("rye_blade", 0.012, 0.5, loc=(x + 0.06 * math.cos(a), yc + 0.06 * math.sin(a), FZ + 0.7), rot=(0.25 * math.sin(a), 0.25 * math.cos(a), 0), r2=0.002, m="leaf_pale", verts=4))
            else:
                # blue flowers: a low leafy mound with blossoms
                G.append(kit.sphere("flower_leaves", 0.16, loc=(x, yc, FZ + 0.55), m="leaf_green", segs=8, rings=5, scale=(1.2, 1.0, 0.6)))
                for j in range(5):
                    a = j * 1.26
                    G.append(kit.sphere("flower", 0.035, loc=(x + 0.12 * math.cos(a), yc + 0.12 * math.sin(a), FZ + 0.66), m="flower_blue", segs=6, rings=4))
            x += 0.34
            k += 1
    gh = empty("greenhouse_beds", loc=(0, 0, 0), parent=root, interact="lazarus", iid="edmunds_greenhouse")
    for sy in (-1, 1):
        hit(f"gh_bed_{'a' if sy < 0 else 'b'}", (xb - xa, 0.95, 0.9), ((xa + xb) / 2, HY + sy * 1.25, FZ + 0.8), gh)
    # condenser at the far end: a box with fins, a pipe to the trough
    P.append(box("condenser", (0.6, 1.1, 1.3), loc=(x0 + 0.38, HY, FZ + 0.65), m="steel_painted_white", bevel=0.02))
    for k in range(8):
        P.append(box("cond_fin", (0.02, 1.0, 0.9), loc=(x0 + 0.7, HY, FZ + 0.7), rot=(0, 0, 0), m="metal_gray") if k == 0 else
                 box("cond_fin", (0.03, 0.02, 0.9), loc=(x0 + 0.7, HY - 0.45 + k * 0.12, FZ + 0.7), m="metal_gray"))
    P.append(box("trough", (1.2, 0.3, 0.15), loc=(x0 + 1.3, HY, FZ + 0.08), m="steel_galv"))
    P.append(box("trough_water", (1.14, 0.25, 0.01), loc=(x0 + 1.3, HY, FZ + 0.13), m="glass_clear"))
    P.append(kit.tube("cond_pipe", [(x0 + 0.65, HY + 0.3, FZ + 1.1), (x0 + 1.0, HY + 0.3, FZ + 0.9), (x0 + 1.3, HY, FZ + 0.25)], 0.02, m="metal_gray", seg=6))
    col("condenser", (x0 + 0.38, HY, FZ + 0.65), (0.65, 1.15, 1.3), root)
    # grow-light bars under the ridge
    for sy in (-1, 1):
        P.append(box("grow_bar", (xb - xa, 0.08, 0.04), loc=((xa + xb) / 2, HY + sy * 0.9, HA[4] - 0.45), m="metal_gray"))
        L.append(box("grow_lens", (xb - xa - 0.1, 0.06, 0.01), loc=((xa + xb) / 2, HY + sy * 0.9, HA[4] - 0.475), m="emit_warm"))
        for x in (xa + 0.5, (xa + xb) / 2, xb - 0.5):
            P.append(cyl("grow_wire", 0.004, 0.4, loc=(x, HY + sy * 0.9, HA[4] - 0.25), m="metal_dark", verts=4))
    rv = box("ROOM_edm_green", (x1 - x0, HA[3] - 0.2, HA[4] - FZ), loc=((x0 + x1) / 2, HY, (FZ + HA[4]) / 2), m="frame_black", par=root, room="edmunds_greenhouse")
    rv.hide_render = True


# ================================================================================================ container module
CX, CY, CL, CW, CH, CLEG = 15.5, 5.5, 6.0, 2.5, 2.6, 1.0


def container(root, P, Lc, lights, Lh):
    x0, x1 = CX - CL / 2, CX + CL / 2
    y0, y1 = CY - CW / 2, CY + CW / 2
    zb = CLEG
    # shell: floor, roof, side walls of vertical corrugations, end walls
    P.append(box("cont_floor", (CL, CW, 0.12), loc=(CX, CY, zb + 0.06), m="steel_painted_white"))
    P.append(box("cont_roof", (CL + 0.06, CW + 0.06, 0.1), loc=(CX, CY, zb + CH - 0.05), m="steel_painted_white", bevel=0.02))
    for sy in (-1, 1):
        P.append(box("cont_wall", (CL, 0.04, CH - 0.1), loc=(CX, CY + sy * (CW / 2 - 0.02), zb + CH / 2), m="steel_painted_white"))
        n = int(CL / 0.25)
        for k in range(n):
            P.append(box("cont_corr", (0.1, 0.05, CH - 0.3), loc=(x0 + (k + 0.5) * CL / n, CY + sy * (CW / 2 + 0.02), zb + CH / 2), m="steel_painted_white"))
        P.append(box("cont_rail", (CL + 0.1, 0.12, 0.14), loc=(CX, CY + sy * (CW / 2), zb + 0.07), m="steel_painted_white"))
        P.append(box("cont_rail", (CL + 0.1, 0.12, 0.12), loc=(CX, CY + sy * (CW / 2), zb + CH - 0.1), m="steel_painted_white"))
    for (x, sx) in ((x0, -1), (x1, 1)):
        for sy in (-1, 1):
            P.append(box("cont_post", (0.14, 0.14, CH), loc=(x, CY + sy * (CW / 2), zb + CH / 2), m="steel_painted_white"))
    # far end wall with a small window; near end (-X) wall with the door
    P.append(box("cont_end_far", (0.05, CW, CH - 0.1), loc=(x1, CY, zb + CH / 2), m="steel_painted_white"))
    P.append(box("cont_win", (0.06, 0.8, 0.5), loc=(x1 + 0.01, CY, zb + 1.6), m="glass_dark"))
    dw = 0.95
    for (a, b) in ((y0, CY - dw / 2), (CY + dw / 2, y1)):
        P.append(box("cont_end_near", (0.05, b - a, CH - 0.1), loc=(x0, (a + b) / 2, zb + CH / 2), m="steel_painted_white"))
    P.append(box("cont_end_head", (0.05, dw, CH - 2.1), loc=(x0, CY, zb + 2.05 + (CH - 2.1) / 2), m="steel_painted_white"))
    dn = empty("door_cont", loc=(x0 - 0.03, CY - dw / 2, zb + 0.12), rot=(0, 0, PI / 2), parent=root, interact="door", iid="edm_cont", openAngle=1.7)
    parts = [box("dc_panel", (dw - 0.02, 0.05, 1.92), loc=(dw / 2, 0, 0.96), m="steel_painted_white", bevel=0.005)]
    for k in range(6):
        parts.append(box("dc_corr", (0.06, 0.07, 1.7), loc=(0.1 + k * 0.15, 0, 0.96), m="steel_painted_white"))
    parts.append(box("dc_handle", (0.04, 0.12, 0.25), loc=(dw - 0.12, 0, 1.0), m="metal_gray"))
    m = merge(parts, "door_cont_panel", par=dn)
    finish(m, 30)
    col("door_cont", (x0, CY, zb + 1.08), (0.12, dw, 1.95), root, door="edm_cont")
    # legs with footpads, cross braces, lamps under the belly
    for x in (x0 + 0.3, x1 - 0.3):
        for sy in (-1, 1):
            P.append(box("cont_leg", (0.16, 0.16, zb), loc=(x, CY + sy * (CW / 2 - 0.15), zb / 2), m="metal_gray"))
            P.append(box("cont_pad", (0.4, 0.4, 0.05), loc=(x, CY + sy * (CW / 2 - 0.15), 0.025), m="metal_dark"))
    for sy in (-1, 1):
        P.append(kit.tube("cont_brace", [(x0 + 0.3, CY + sy * (CW / 2 - 0.15), 0.15), (x1 - 0.3, CY + sy * (CW / 2 - 0.15), zb - 0.1)], 0.03, m="metal_gray", seg=6))
    for x in (x0 + 1.5, x1 - 1.5):
        P.append(box("cont_belly_lamp", (0.4, 0.25, 0.08), loc=(x, CY, zb - 0.04), m="metal_dark"))
        Lc.append(box("cont_belly_lens", (0.34, 0.2, 0.01), loc=(x, CY, zb - 0.085), m="emit_warm"))
        lights.append(empty(f"light_cont_{len(lights)}", loc=(x, CY, zb - 0.3), parent=root, light="warm", group="cont", intensity=5.0, distance=7.0))
    # steps up to the door
    for k in range(4):
        P.append(box("cont_step", (0.32, 1.1, 0.06), loc=(x0 - 0.35 - (3 - k) * 0.3, CY, 0.25 * (k + 1) - 0.03), m="int_grate"))
        col(f"cont_step_{k}", (x0 - 0.35 - (3 - k) * 0.3, CY, 0.25 * (k + 1) / 2), (0.32, 1.1, 0.25 * (k + 1)), root)
    for sy in (-1, 1):
        P.append(kit.tube("cont_rail_hand", [(x0 - 1.4, CY + sy * 0.58, 0.95), (x0 - 0.2, CY + sy * 0.58, zb + 0.95)], 0.02, m="metal_gray", seg=6))
    # inside: lab bench, sample shelves, seismometer spares, a lamp
    P.append(box("lab_bench", (3.2, 0.7, 0.05), loc=(CX + 0.6, y1 - 0.45, zb + 0.95), m="int_panel_light"))
    P.append(box("lab_bench_body", (3.2, 0.65, 0.8), loc=(CX + 0.6, y1 - 0.45, zb + 0.5), m="int_panel_mid"))
    col("lab_bench", (CX + 0.6, y1 - 0.45, zb + 0.55), (3.2, 0.7, 0.9), root)
    for k in range(3):
        P.append(box("lab_shelf", (2.6, 0.35, 0.03), loc=(CX + 0.8, y0 + 0.3, zb + 0.8 + k * 0.5), m="metal_gray"))
        for j in range(7):
            P.append(cyl("sample_jar", 0.05, 0.16, loc=(CX - 0.3 + j * 0.36, y0 + 0.3, zb + 0.9 + k * 0.5), m="glass_clear", verts=10))
            P.append(cyl("sample_soil", 0.045, 0.07, loc=(CX - 0.3 + j * 0.36, y0 + 0.3, zb + 0.86 + k * 0.5), m="soil_bed" if (j + k) % 3 else "rock_granite", verts=10))
    col("lab_shelf", (CX + 0.8, y0 + 0.3, zb + 1.3), (2.6, 0.4, 1.4), root)
    P.extend(crate("seis_case", (0.7, 0.45, 0.35), (CX - 1.6, y1 - 0.4, zb + 1.15), 0.0, m="warning_yellow"))
    P.append(cyl("seis_spare", 0.12, 0.25, loc=(CX + 1.8, y1 - 0.4, zb + 1.1), m="console_dark", verts=14))
    P.append(box("lab_lamp", (0.6, 0.12, 0.05), loc=(CX, CY, zb + CH - 0.15), m="metal_gray"))
    Lh.append(box("lab_lamp_lens", (0.56, 0.1, 0.01), loc=(CX, CY, zb + CH - 0.18), m="emit_warm"))
    lights.append(empty(f"light_lab_{len(lights)}", loc=(CX, CY, zb + CH - 0.4), parent=root, light="warm", group="hab", intensity=1.6, distance=5.0))
    # colliders
    col("cont_floor", (CX, CY, zb + 0.06), (CL, CW, 0.12), root)
    col("cont_roof", (CX, CY, zb + CH - 0.05), (CL, CW, 0.1), root)
    for sy in (-1, 1):
        col(f"cont_wall_{sy}", (CX, CY + sy * (CW / 2), zb + CH / 2), (CL, 0.12, CH), root)
    col("cont_far", (x1, CY, zb + CH / 2), (0.12, CW, CH), root)
    col("cont_near_a", (x0, (y0 + CY - dw / 2) / 2, zb + CH / 2), (0.12, CY - dw / 2 - y0, CH), root)
    col("cont_near_b", (x0, (CY + dw / 2 + y1) / 2, zb + CH / 2), (0.12, y1 - CY - dw / 2, CH), root)
    rv = box("ROOM_edm_lab", (CL, CW, CH - 0.2), loc=(CX, CY, zb + CH / 2), m="frame_black", par=root, room="edmunds_lab")
    rv.hide_render = True


# ================================================================================================ lander, rover
def lander(root, P, G, Ll, lights):
    """Edmunds' lander: a dark faceted wedge on four legs, nose to +X, lights under the belly."""
    lx, ly, lz = 5.0, 14.5, 1.7
    secs = []
    for (x, w, h, top) in ((-4.6, 4.6, 1.8, 0.0), (-3.4, 6.0, 2.4, 0.2), (0.0, 6.4, 2.7, 0.35), (2.6, 5.2, 2.2, 0.25), (4.4, 3.0, 1.2, 0.0), (5.3, 1.2, 0.5, -0.1)):
        # flat-bottomed hexagon with chamfered shoulders
        secs.append([(lx + x, ly + y, lz + z) for (y, z) in ((-w / 2, 0.25 * h), (-w / 2 + 0.35 * w / 2, 0.0), (w / 2 - 0.35 * w / 2, 0.0), (w / 2, 0.25 * h),
                                                             (w * 0.3, h * 0.85 + top), (-w * 0.3, h * 0.85 + top))])
    body = loft("lander_body", secs, m="lander_graphite")
    kit.flat(body)
    P.append(body)
    # dorsal cockpit hump with dark glass, side intakes, panel lines
    hump = [[(lx + x, ly + y, lz + z) for (y, z) in ((-w / 2, h0), (w / 2, h0), (w * 0.35, h0 + hh), (-w * 0.35, h0 + hh))]
            for (x, w, h0, hh) in ((-0.6, 2.2, 2.55, 0.0), (0.2, 2.4, 2.6, 0.45), (1.8, 2.0, 2.4, 0.4), (2.8, 1.4, 2.0, 0.0))]
    hm = loft("lander_hump", hump, m="lander_graphite")
    kit.flat(hm)
    P.append(hm)
    for sy in (-1, 1):
        G.append(box("lander_canopy", (1.3, 0.04, 0.32), loc=(lx + 1.5, ly + sy * 0.95, lz + 2.72), rot=(sy * 0.55, 0, 0), m="glass_dark"))
        P.append(box("lander_intake", (1.6, 0.25, 0.4), loc=(lx - 2.6, ly + sy * 3.0, lz + 0.7), m="metal_dark", bevel=0.03))
        P.append(box("lander_fin", (1.4, 0.06, 0.5), loc=(lx - 3.6, ly + sy * 1.8, lz + 2.3), rot=(sy * 0.4, 0, 0), m="lander_graphite"))
    for k in (-1, 0, 1):
        P.append(box("lander_seam", (0.02, 5.8, 0.02), loc=(lx + k * 1.6, ly, lz + 2.35), m="hull_seam"))
    # engines at the tail
    for sy in (-1.3, 1.3):
        P.append(cyl("lander_bell", 0.5, 0.7, loc=(lx - 4.9, ly + sy, lz + 0.9), rot=(0, PI / 2, 0), r2=0.35, m="nozzle_inner", verts=20))
        P.append(kit.torus("lander_bell_lip", 0.5, 0.04, loc=(lx - 5.25, ly + sy, lz + 0.9), rot=(0, PI / 2, 0), m="metal_dark", seg=20, rseg=5))
    # legs: struts out to pads
    for (x, sy) in ((-2.8, -1), (-2.8, 1), (2.4, -1), (2.4, 1)):
        top = V((lx + x, ly + sy * 2.2, lz + 0.3))
        foot = V((lx + x + (0.4 if x > 0 else -0.4), ly + sy * 3.3, 0.12))
        P.append(kit.tube("lander_leg", [tuple(top), tuple(foot)], 0.09, m="metal_gray", seg=8))
        P.append(kit.tube("lander_strut", [(lx + x, ly + sy * 1.4, lz + 0.05), tuple(foot.lerp(top, 0.3))], 0.05, m="metal_dark", seg=6))
        P.append(cyl("lander_pad", 0.42, 0.1, loc=(foot.x, foot.y, 0.06), m="metal_dark", verts=16))
    # ramp lowered at the tail, belly lights
    P.append(box("lander_ramp", (2.2, 1.6, 0.08), loc=(lx - 5.6, ly, lz * 0.5), rot=(0, -0.68, 0), m="metal_dark"))
    for (x, y) in ((-2.0, -1.6), (-2.0, 1.6), (2.2, 0.0)):
        P.append(box("belly_lamp", (0.35, 0.35, 0.06), loc=(lx + x, ly + y, lz - 0.02), m="metal_dark"))
        Ll.append(box("belly_lens", (0.3, 0.3, 0.01), loc=(lx + x, ly + y, lz - 0.055), m="emit_warm"))
    lights.append(empty(f"light_lander_{len(lights)}", loc=(lx - 0.5, ly, lz - 0.4), parent=root, light="warm", group="lander", intensity=7.0, distance=10.0))
    col("lander_body", (lx, ly, lz + 1.2), (9.6, 6.0, 2.6), root)
    for (x, sy) in ((-2.8, -1), (-2.8, 1), (2.4, -1), (2.4, 1)):
        col("lander_pad", (lx + x + (0.4 if x > 0 else -0.4), ly + sy * 3.3, 0.5), (0.5, 0.5, 1.0), root)


def rover(root, P, G, Lr):
    rx, ry, yaw = 9.4, 2.6, 0.35
    c, s = math.cos(yaw), math.sin(yaw)

    def T(lx, ly, lz):
        return (rx + lx * c - ly * s, ry + lx * s + ly * c, lz)
    P.append(box("rov_chassis", (3.4, 1.8, 0.3), loc=T(0, 0, 0.75), rot=(0, 0, yaw), m="metal_dark", bevel=0.03))
    P.append(box("rov_cab", (1.5, 1.75, 1.15), loc=T(0.85, 0, 1.45), rot=(0, 0, yaw), m="steel_painted_white", bevel=0.06))
    G.append(box("rov_windshield", (0.04, 1.5, 0.55), loc=T(1.61, 0, 1.6), rot=(0, 0.18, yaw), m="glass_dark"))
    for sy in (-1, 1):
        G.append(box("rov_sidewin", (0.8, 0.04, 0.45), loc=T(0.85, sy * 0.88, 1.65), rot=(0, 0, yaw), m="glass_dark"))
    P.append(box("rov_bed", (1.8, 1.75, 0.5), loc=T(-0.75, 0, 1.15), rot=(0, 0, yaw), m="steel_painted_white", bevel=0.03))
    P.extend(crate("rov_box", (0.7, 0.55, 0.45), T(-0.9, -0.4, 1.62), yaw, m="plastic_white"))
    P.extend(crate("rov_box2", (0.6, 0.55, 0.4), T(-0.6, 0.45, 1.6), yaw + 0.1, m="fabric_orange"))
    # roll bar with a light bar
    for sy in (-1, 1):
        P.append(kit.tube("rov_rollbar", [T(0.1, sy * 0.85, 2.0), T(-0.2, sy * 0.85, 2.35), T(-0.2, 0, 2.38)], 0.035, m="metal_gray", seg=6))
    P.append(box("rov_lightbar", (0.15, 1.2, 0.1), loc=T(-0.2, 0, 2.42), rot=(0, 0, yaw), m="paint_charcoal"))
    Lr.append(box("rov_lightbar_lens", (0.02, 1.1, 0.07), loc=T(-0.12, 0, 2.42), rot=(0, 0, yaw), m="emit_warm"))
    for sy in (-1, 1):
        Lr.append(box("rov_headlamp", (0.02, 0.2, 0.12), loc=T(1.62, sy * 0.65, 1.0), rot=(0, 0, yaw), m="emit_warm"))
    for (x, sy) in ((1.15, -1), (1.15, 1), (-1.15, -1), (-1.15, 1)):
        w = cyl("rov_wheel", 0.48, 0.4, loc=T(x, sy * 1.02, 0.48), rot=(PI / 2, 0, yaw), m="tire_rubber", verts=22, bevel=0.06)
        P.append(w)
        P.append(cyl("rov_hub", 0.2, 0.42, loc=T(x, sy * 1.02, 0.48), rot=(PI / 2, 0, yaw), m="metal_gray", verts=12))
        for k in range(10):
            a = k * PI / 5
            P.append(box("rov_tread", (0.08, 0.42, 0.04), loc=T(x + math.cos(a) * 0.48, sy * 1.02, 0.48 + math.sin(a) * 0.48), rot=(0, -a, yaw), m="tire_rubber"))
    col("rover", (rx, ry, 1.1), (3.6, 2.2, 2.2), root, rot_z=yaw)


# ================================================================================================ camp props
def props(root, P, G, T_, Lc, lights):
    # flag pole: striped flag and a dark mission pennant below it
    fx, fy = -2.2, 3.6
    P.append(cyl("flag_pole", 0.04, 6.2, loc=(fx, fy, 3.1), m="steel_painted_white", verts=10))
    P.append(kit.sphere("flag_ball", 0.07, loc=(fx, fy, 6.25), m="metal_bronze", segs=10, rings=6))
    P.append(cyl("flag_base", 0.25, 0.1, loc=(fx, fy, 0.05), m="metal_dark", verts=14))
    flag(P, fx, fy, 6.0, 1.7, 1.0)
    pennant(P, fx, fy, 4.5, 1.1, 0.75)
    # cone tent (glows at night)
    tx, ty = 0.6, 2.4
    cone = lathe("tent_cone", [(0.0, 2.3), (0.06, 2.22), (0.55, 1.3), (1.0, 0.45), (1.2, 0.0), (0.0, 0.0)], m=FAB, seg=20)
    cone.location = (tx, ty, 0.0)
    T_.append(cone)
    P.append(prism("tent_door", [(-0.35, 0.0), (0.35, 0.0), (0.0, 1.45)], -0.02, 0.02, m="paint_charcoal", loc=(tx, ty - 1.13, 0.0), rot=(PI / 2 - 0.45, 0, 0)))
    for k in range(4):
        a = k * PI / 2 + PI / 4
        P.append(kit.tube("tent_guy", [(tx + math.cos(a) * 0.5, ty + math.sin(a) * 0.5, 1.4), (tx + math.cos(a) * 2.0, ty + math.sin(a) * 2.0, 0.02)], 0.006, m="fabric_bag", seg=4))
        P.append(box("tent_peg", (0.04, 0.04, 0.1), loc=(tx + math.cos(a) * 2.0, ty + math.sin(a) * 2.0, 0.05), m="metal_gray"))
    lights.append(empty(f"light_tent_{len(lights)}", loc=(tx, ty, 1.0), parent=root, light="warm", group="camp", intensity=2.2, distance=6.0))
    col("tent", (tx, ty, 0.8), (1.6, 1.6, 1.6), root)
    # the dead beacon: dark upright transmitter cabinet with its mast and guy lines
    bx, by = 1.6, -3.4
    P.append(box("bcn_cabinet", (0.75, 0.55, 1.55), loc=(bx, by, 0.78), m="console_dark", bevel=0.03))
    P.append(box("bcn_door_seam", (0.01, 0.56, 1.4), loc=(bx + 0.18, by - 0.0, 0.8), rot=(0, 0, PI / 2), m="hull_seam"))
    P.append(box("bcn_panel", (0.4, 0.02, 0.3), loc=(bx, by - 0.285, 1.2), m="gauge_face"))
    P.append(box("bcn_led", (0.05, 0.01, 0.03), loc=(bx - 0.12, by - 0.3, 1.28), m="lamp_lens_red"))
    P.append(box("bcn_vent", (0.5, 0.02, 0.2), loc=(bx, by - 0.285, 0.4), m="radiator_black"))
    P.append(cyl("bcn_mast", 0.05, 5.0, loc=(bx, by, 4.05), m="metal_gray", verts=10))
    P.append(kit.sphere("bcn_lens", 0.15, loc=(bx, by, 6.65), m="lamp_lens_red", segs=12, rings=8))
    P.append(cyl("bcn_ant", 0.012, 1.2, loc=(bx + 0.2, by, 6.4), m="metal_dark", verts=6))
    for k in range(3):
        a = k * 2 * PI / 3 + 0.3
        P.append(kit.tube("bcn_guy", [(bx, by, 5.2), (bx + math.cos(a) * 2.4, by + math.sin(a) * 2.4, 0.02)], 0.006, m="metal_dark", seg=4))
    hit("beacon", (0.9, 0.7, 1.7), (bx, by, 0.85), root, interact="lazarus", iid="edmunds_beacon")
    col("bcn", (bx, by, 0.78), (0.75, 0.55, 1.55), root)
    # supplies in front of the hab: stacked crates, standing gas bottles, bins; dark crates on a pallet in the middle
    for (x, y, sz, m, yaw) in ((-12.5, -5.8, (1.0, 0.7, 0.6), "plastic_white", 0.05), (-12.4, -5.8, (0.9, 0.65, 0.5), "plastic_white", 0.1),
                               (-10.8, -6.2, (0.8, 0.6, 0.55), "plastic_white", -0.1), (-7.6, -6.0, (1.1, 0.75, 0.7), "plastic_white", 0.2),
                               (-3.6, -5.6, (0.9, 0.6, 0.55), "plastic_gray", -0.15)):
        z = 0.0
        if x == -12.4:
            z = 0.6
        P.extend(crate("supply", sz, (x, y, z + sz[2] / 2), yaw, m=m))
    for (x, y) in ((-9.4, -5.6), (-9.0, -5.9), (-8.6, -5.5), (-14.4, -5.2)):
        P.append(cyl("gas_bottle", 0.24, 1.3, loc=(x, y, 0.65), m="plastic_white", verts=16))
        P.append(kit.sphere("gas_top", 0.24, loc=(x, y, 1.3), m="plastic_white", segs=16, rings=8, scale=(1, 1, 0.5)))
        P.append(cyl("gas_valve", 0.05, 0.14, loc=(x, y, 1.47), m="metal_gray", verts=8))
    P.append(box("bin", (1.3, 0.9, 0.9), loc=(-5.8, -5.9, 0.45), m="plastic_white", bevel=0.05))
    P.append(box("bin_lid", (1.34, 0.94, 0.06), loc=(-5.8, -5.9, 0.92), m="plastic_gray", bevel=0.02))
    col("supplies_a", (-11.6, -5.9, 0.6), (3.6, 1.2, 1.2), root)
    col("supplies_b", (-8.2, -5.8, 0.7), (4.4, 1.2, 1.4), root)
    P.append(box("pallet", (1.6, 1.2, 0.14), loc=(4.2, 2.0, 0.07), m="wood_raw"))
    for (dx, dy, dz, m) in ((-0.4, -0.25, 0.0, "plastic_dark"), (0.4, -0.25, 0.0, "plastic_dark"), (0.0, 0.3, 0.0, "plastic_gray"), (-0.1, -0.2, 0.5, "plastic_dark")):
        P.extend(crate("dark_case", (0.75, 0.55, 0.48), (4.2 + dx, 2.0 + dy, 0.14 + dz + 0.24), 0.05 * dx, m=m))
    col("pallet", (4.2, 2.0, 0.6), (1.6, 1.2, 1.2), root)
    for (x, y) in ((7.0, 0.4), (7.6, 0.9), (11.8, 4.6)):
        P.extend(drum("drum", 0.3, 0.9, (x, y, 0.0), m=R.choice(("steel_painted_blue", "steel_painted_gray", "rust"))))
    for (x, y, yaw) in ((13.0, 1.2, 0.3), (2.6, 6.4, -0.2), (-1.0, -6.4, 0.4)):
        P.extend(crate("loose_case", (0.8, 0.55, 0.45), (x, y, 0.225), yaw, m=R.choice(("plastic_white", "plastic_gray", "warning_yellow"))))
    for (x, y) in ((10.2, -1.4), (-15.6, -4.0)):
        P.extend(tank("tank", 0.35, 1.6, (x, y, 0.0), 0.8, m="plastic_white"))
    # small light boxes on posts in front of the hab
    for (x, y) in ((-14.0, -6.8), (-10.0, -7.4), (-5.6, -7.0)):
        P.append(cyl("lbox_post", 0.03, 1.2, loc=(x, y, 0.6), m="metal_gray", verts=8))
        P.append(box("lbox", (0.32, 0.32, 0.3), loc=(x, y, 1.35), m="plastic_white", bevel=0.02))
        Lc.append(box("lbox_lens", (0.26, 0.02, 0.24), loc=(x, y - 0.17, 1.35), m="emit_warm"))
        Lc.append(box("lbox_top", (0.26, 0.26, 0.02), loc=(x, y, 1.505), m="emit_warm"))
    # thin lamp poles with heads: the pools of light across the flat
    lamp_post("pole_a", (2.8, -0.6, 0.0), 3.8, (2.0, -2.0, 0.0), P, Lc, lights, root, "camp", intensity=9.0, distance=13.0, head=(0.3, 0.12, 0.22))
    lamp_post("pole_b", (12.4, -1.8, 0.0), 3.8, (12.0, 0.5, 0.0), P, Lc, lights, root, "camp", intensity=9.0, distance=13.0, head=(0.3, 0.12, 0.22))
    lamp_post("pole_c", (-5.4, 5.0, 0.0), 3.6, (-5.0, 2.5, 0.0), P, Lc, lights, root, "camp", intensity=8.0, distance=12.0, head=(0.3, 0.12, 0.22))
    lamp_post("pole_d", (-1.0, 9.6, 0.0), 3.8, (2.0, 11.0, 0.0), P, Lc, lights, root, "camp", intensity=8.0, distance=12.0, head=(0.3, 0.12, 0.22))
    # solar array behind the container
    for k in range(3):
        x = 20.6 + k * 2.3
        P.append(box("solar_panel", (2.1, 1.3, 0.05), loc=(x, 1.6, 1.2), rot=(0.6, 0, 0), m="radiator_black", bevel=0.01))
        P.append(box("solar_frame", (2.16, 1.36, 0.03), loc=(x, 1.62, 1.175), rot=(0.6, 0, 0), m="metal_gray"))
        P.append(box("solar_leg", (0.06, 0.06, 1.2), loc=(x, 1.8, 0.6), m="metal_gray"))
        P.append(box("solar_leg", (0.06, 0.06, 0.7), loc=(x, 1.2, 0.35), m="metal_gray"))
    col("solar", (22.9, 1.6, 0.8), (7.0, 1.4, 1.6), root)
    P.append(kit.tube("solar_cable", [(20.6, 1.2, 0.05), (19.5, 3.5, 0.05), (CX + CL / 2 - 0.5, CY - CW / 2, 0.2)], 0.025, m="rubber_black", seg=6))
    P.append(kit.tube("hab_cable", [(CX - CL / 2, CY, 0.15), (6.0, 1.5, 0.04), (0.0, -1.0, 0.04), (HB[2] + 0.1, HY, 0.2)], 0.025, m="rubber_black", seg=6))


def flag(P, x, y, ztop, w, h):
    """Striped flag with a dark canton and a grid of white dots, gently waving (13 stripes)."""
    bm = bmesh.new()
    nx = 12
    mats = []
    for s in range(13):
        z1 = ztop - h * s / 13
        z0 = ztop - h * (s + 1) / 13
        row = []
        for i in range(nx + 1):
            u = i / nx
            yy = y + 0.05 + u * w
            xx = x + 0.06 * math.sin(u * 5.0) * u
            row.append((bm.verts.new((xx, yy, z1)), bm.verts.new((xx, yy, z0))))
        for i in range(nx):
            f = bm.faces.new((row[i][1], row[i + 1][1], row[i + 1][0], row[i][0]))
            u = (i + 0.5) / nx
            canton = u < 0.4 and s < 7
            f.material_index = 2 if canton else (0 if s % 2 == 0 else 1)
    o = kit.from_bmesh("flag", bm, ("flag_red", "flag_white", "flag_blue"))
    kit.add_solidify(o, 0.008, 0.0)
    P.append(o)
    for r_ in range(4):
        for c in range(5):
            u = 0.04 + c * 0.075
            P.append(box("flag_star", (0.02, 0.03, 0.03), loc=(x + 0.06 * math.sin(u * 5.0) * u, y + 0.05 + u * w, ztop - 0.07 - r_ * 0.11), m="flag_white"))


def pennant(P, x, y, ztop, w, h):
    o = box("pennant", (0.01, w, h), loc=(x, y + 0.05 + w / 2, ztop - h / 2), m="flag_blue")
    P.append(o)
    # mission chevron
    for sgn in (-1, 1):
        P.append(box("pennant_chevron", (0.012, 0.34, 0.06), loc=(x - 0.012, y + 0.05 + w / 2 + sgn * 0.13, ztop - h / 2 + 0.02), rot=(sgn * 0.75, 0, 0), m="flag_white"))


# ================================================================================================ boulders
def pile(name, root, cx, cy, Rp, Hp, n, seed, rmax=2.4, rmin=0.6):
    """A pile of rounded boulders, big ones at the base and smaller ones resting on them, kept from interpenetrating
    much (snap node: dropped onto the terrain at runtime)."""
    sn = empty(f"snap_{name}", loc=(cx, cy, 0.0), parent=root, snap=1)
    rr = random.Random(seed)
    placed = []
    parts = []
    tries = 0
    while len(placed) < n and tries < n * 40:
        tries += 1
        a = rr.uniform(0, 2 * PI)
        d = Rp * math.sqrt(rr.uniform(0, 1))
        u = d / Rp
        zc = Hp * (1 - u * u) * rr.uniform(0.5, 1.0)
        r = (rmax - (rmax - rmin) * (zc / max(Hp, 0.1))) * rr.uniform(0.75, 1.15)
        x, y = math.cos(a) * d, math.sin(a) * d
        z = max(zc - r * 0.3, r * 0.5 - 0.45)
        ok = True
        for (px, py, pz, pr) in placed:
            if math.dist((x, y, z), (px, py, pz)) < 0.78 * (r + pr):
                ok = False
                break
        if not ok:
            continue
        placed.append((x, y, z, r))
        parts.append(boulder("boulder", r, (x, y, z), seed * 100 + len(placed),
                             squash=(rr.uniform(0.95, 1.35), rr.uniform(0.85, 1.15), rr.uniform(0.72, 0.95)), m="granite_pale"))
    m = merge(parts, f"rocks_{name}", par=sn, col="mesh")
    kit.smooth(m, 80)
    kit.uv_box(m, 1.0)
    return sn


def boulders(root, P, G):
    pile("back_left", root, -9.0, 15.0, 7.5, 7.0, 34, 11)
    pile("left_front", root, -21.0, -10.0, 5.5, 4.0, 18, 12, rmax=2.0)
    pile("right_back", root, 21.0, 18.0, 6.5, 7.5, 28, 13)
    pile("back_mid", root, 6.0, 25.0, 6.0, 5.0, 22, 14)
    pile("left_far", root, -24.0, 6.0, 4.5, 3.5, 14, 15, rmax=1.8)
    pile("front_right", root, 18.0, -12.0, 3.5, 2.2, 9, 16, rmax=1.6)
    # loose single boulders scattered across the flat's edge
    rr = random.Random(17)
    singles = []
    for k in range(22):
        a = rr.uniform(0, 2 * PI)
        d = rr.uniform(20.0, 28.0)
        x, y = math.cos(a) * d, math.sin(a) * d
        r = rr.uniform(0.35, 1.0)
        singles.append(boulder("stone", r, (x, y, r * 0.35), 900 + k, squash=(1.1, 1.0, 0.75), subdiv=2, m="granite_pale"))
    for k in range(30):
        x, y = rr.uniform(-18, 22), rr.uniform(-14, 12)
        if abs(x + 9) < 8 and abs(y + 1.5) < 5:
            continue
        singles.append(boulder("pebble", rr.uniform(0.08, 0.22), (x, y, 0.03), 1000 + k, squash=(1.2, 1.0, 0.6), subdiv=2, m="granite_pale"))
    sm = merge(singles, "rocks_scatter", par=root)
    kit.smooth(sm, 80)
    kit.uv_box(sm, 1.0)
    # the ridge (right_back pile): a toppled seismometer near the top, fresh rockfall and the helmet at its foot
    ridge = (21.0, 18.0)
    P.append(box("seis_body", (0.4, 0.4, 0.3), loc=(ridge[0] - 2.2, ridge[1] - 2.5, 5.4), rot=(0.6, 0.3, 0.4), m="console_dark", bevel=0.03))
    for k in range(3):
        a = k * 2 * PI / 3
        P.append(kit.tube("seis_leg", [(ridge[0] - 2.2, ridge[1] - 2.5, 5.4), (ridge[0] - 2.2 + math.cos(a) * 0.6, ridge[1] - 2.5 + math.sin(a) * 0.4, 5.0 + 0.3 * k)], 0.02, m="metal_gray", seg=5))
    P.append(kit.tube("seis_cable", [(ridge[0] - 2.2, ridge[1] - 2.5, 5.3), (ridge[0] - 3.5, ridge[1] - 4.5, 3.0), (ridge[0] - 4.4, ridge[1] - 6.5, 0.1), (CX + CL / 2, CY + 1.0, 0.1)], 0.015, m="rubber_black", seg=5))
    hx, hy = ridge[0] - 4.6, ridge[1] - 7.2
    fall = []
    for k in range(16):
        a = rr.uniform(-0.9, 0.9) + PI * 1.25
        d = rr.uniform(0.4, 2.6)
        fall.append(boulder("scree", rr.uniform(0.12, 0.45), (hx + math.cos(a) * d, hy + math.sin(a) * d + 0.8, 0.08), 1100 + k, squash=(1.2, 1.0, 0.7), subdiv=2, m="granite_pale"))
    fm = merge(fall, "rocks_fall", par=root)
    kit.smooth(fm, 80)
    kit.uv_box(fm, 1.0)
    P.append(kit.sphere("helmet", 0.19, loc=(hx + 0.6, hy - 0.5, 0.17), m="suit_white", segs=16, rings=10))
    P.append(kit.sphere("helmet_visor", 0.14, loc=(hx + 0.68, hy - 0.62, 0.2), m="glass_dark", segs=12, rings=8, scale=(0.7, 0.9, 0.75)))
    P.append(box("helmet_crack", (0.005, 0.12, 0.01), loc=(hx + 0.73, hy - 0.66, 0.24), rot=(0.4, 0, 0.6), m="frame_black"))
    P.append(kit.torus("helmet_ring", 0.13, 0.02, loc=(hx + 0.6, hy - 0.5, 0.02), rot=(0, 0, 0), m="metal_gray", seg=16, rseg=4))
    hit("helmet", (0.7, 0.7, 0.5), (hx + 0.6, hy - 0.5, 0.2), root, interact="lazarus", iid="edmunds_helmet")
    empty("spot_ridge", loc=(hx - 2.0, hy - 3.0, 0.0), parent=root)


# ================================================================================================ build
def build(preview=True):
    kit.reset()
    root = empty("EdmundsCamp")
    set_props(root, site="edmunds_camp")
    S, T_, P, G, L, Lc, Lcont, Ll, Lr, lights = [], [], [], [], [], [], [], [], [], []
    hab(root, S, P, L, lights)
    living(root, P, L)
    greenhouse(root, P, G, L)
    container(root, P, Lcont, lights, L)
    lander(root, P, G, Ll, lights)
    rover(root, P, G, Lr)
    props(root, P, G, T_, Lc, lights)
    boulders(root, P, G)
    for (nm, p) in (("spot_door", (DOOR[0], HY - HB[3] / 2 - 1.6, 0.0)), ("spot_inside", (DOOR[0], HY - 0.6, FZ)), ("spot_living", (-5.0, HY + 0.2, FZ)), ("spot_green", (-10.5, HY, FZ)),
                    ("spot_lab", (CX - 1.0, CY, CLEG + 0.12)), ("spot_lab_end", (CX + 2.8, CY, CLEG + 0.12)), ("spot_view", (-8.0, -22.0, 0.0)), ("spot_center", (2.0, -6.0, 0.0))):
        empty(nm, loc=p, parent=root)
    skin = merge(S, "edm_hab_skin", par=root)
    finish(skin, 50)
    tent = merge(T_, "edm_tent_skin", par=root)
    finish(tent, 50)
    body = merge(P, "edm_camp", par=root)
    finish(body, 35)
    gl = merge(G, "edm_plants_glass", par=root)
    finish(gl, 40)
    for (lst, nm, grp) in ((L, "lamps_hab", "hab"), (Lc, "lamps_camp", "camp"), (Lcont, "lamps_cont", "cont"), (Ll, "lamps_lander", "lander"), (Lr, "lamps_rover", "camp")):
        if lst:
            lm = merge(lst, nm, par=root, group=grp, lampmesh=1)
            finish(lm, 30)
    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)
    kit.export_glb(os.path.join(kit.out_dir(), "edmunds_camp.glb"), root)
    if preview:
        pd = kit.preview_dir()
        dusk = (0.32, 0.28, 0.3)
        kit.preview(os.path.join(pd, "edmunds_camp.png"), (-14.0, -30.0, 7.0), (2.0, 4.0, 1.0), lens=28, samples=24, world=dusk, sun=(-0.8, 0.5, 0.12), sun_strength=1.2, strength=0.6)
        kit.preview(os.path.join(pd, "edmunds_camp_day.png"), (16.0, -24.0, 6.0), (0.0, 4.0, 1.0), lens=28, samples=24, world=(0.62, 0.6, 0.58), sun=(0.4, -0.5, 0.75), sun_strength=3.5)
        kit.preview(os.path.join(pd, "edmunds_living.png"), (-3.6, HY - 1.6, FZ + 1.6), (-7.5, HY + 1.0, FZ + 0.9), lens=18, samples=32, world=(0.05, 0.05, 0.05), sun_strength=0.0, strength=0.2)
        kit.preview(os.path.join(pd, "edmunds_green.png"), (-8.8, HY - 0.2, FZ + 1.55), (-15.0, HY, FZ + 0.6), lens=20, samples=32, world=(0.05, 0.05, 0.05), sun_strength=0.0, strength=0.2)


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
