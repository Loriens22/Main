"""
Lander (reference images 21 cockpit, 23 exterior): a squat, wide heavy lander. Original model built from the reference.
Exterior: a long raised spine with a silver top deck full of window cut-outs, lavender honeycomb shoulder panels and
dark graphite flanks; four faceted thruster pods splayed at the corners (silver tops, graphite flanks, big ventral
VTOL nozzles, landing legs); a dorsal docking ring with hatch at the rear of the deck (it docks top-first); side hatch.
Interior: cockpit with two pilot seats, three-screen side consoles, a central screen stack and switch panels, an
overhead console, ceiling windows with light strips; a four-seat cabin with lockers, grated aisle and ribs; a ladder
up to the docking hatch at the rear.

Blender +Y forward, Z up. Origin near the centre of mass; with the gear down the ground is 1.9 m below the origin.
Nodes: dock_top (+Y of the empty = outward), hatch_side (hinged), seat_pilot/seat_copilot/seat_p1..p4 (+ *_eye),
spawn_cabin, cam_cockpit, engine_* (main), vtol_* (pods), rcs_*, navlight_*, gear_* (legs).
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe, loft
from farm_house import obox, seg_box

PI = math.pi
R = random.Random(23)
SIL, GRA, HON = "lander_silver", "lander_graphite", "honeycomb_purple"
TOPZ = 2.2
NOSE_WIN = list(enumerate((-1.86, -1.12, -0.37, 0.37, 1.12, 1.86)))
Y0, Y1 = -7.6, 7.2


def spine_section(y, k=1.0, dz=0.0, top_scale=1.0):
    """Hexagonal-ish spine cross-section (8 points, CCW from +Y): bottom, flanks, shoulders, top deck."""
    pts = [(2.5, -1.3), (3.0, -0.3), (2.85, 1.2), (2.15 * top_scale, TOPZ), (-2.15 * top_scale, TOPZ), (-2.85, 1.2), (-3.0, -0.3), (-2.5, -1.3)]
    return [V((x * k, y, z * k + dz)) for (x, z) in pts]


def spine():
    secs = [spine_section(Y0, 0.86, -0.15), spine_section(Y0 + 0.35, 0.97), spine_section(-3.0), spine_section(3.0),
            spine_section(5.6, 1.0, 0, 0.95), spine_section(6.6, 0.95, -0.05, 0.86), spine_section(Y1, 0.86, -0.15, 0.78)]
    # edge materials: 0 bottom→flank, 1 flank, 2 shoulder (honeycomb), 3 top deck, 4 shoulder, 5 flank, 6 lower, 7 bottom
    emat = {0: 1, 1: 1, 2: 2, 3: 0, 4: 2, 5: 1, 6: 1, 7: 1}
    return loft("spine", secs, mats=[SIL, GRA, HON], face_mats=lambda si, ei: emat.get(ei, 1))


def pod(name, cx, cy, yaw, L=6.6, w=4.0):
    """Faceted thruster pod pointing along `yaw` (0 = +Y), centred at (cx, cy)."""
    c, s = math.cos(yaw), math.sin(yaw)
    ax = V((-s, c, 0))          # pod axis (outward)
    sd = V((c, s, 0))           # pod side
    hexa = [(2.0, -0.25), (1.45, 1.0), (-1.45, 1.0), (-2.0, -0.25), (-1.5, -1.45), (1.5, -1.45)]
    base = V((cx, cy, -0.35))
    secs = []
    for (t, k, dz) in ((-L / 2 - 0.8, 0.9, 0.0), (-L / 2, 1.0, 0.0), (L / 2 - 1.1, 1.0, 0.0), (L / 2 - 0.35, 0.86, -0.08), (L / 2, 0.66, -0.25)):
        secs.append([base + ax * t + sd * (x * k * w / 4.0) + V((0, 0, z * k + dz)) for (x, z) in hexa])
    emat = {0: 0, 1: 0, 2: 1, 3: 1, 4: 1, 5: 1}
    o = loft(name, secs, mats=[SIL, GRA], face_mats=lambda si, ei: emat.get(ei, 1))
    return o, base, ax, sd


def inset_window(P, G, p, u, v, n, w, h, name, depth=0.05, frame_m="metal_gunmetal", glass="glass_dark"):
    """Framed window sitting on a hull surface: centre p, in-plane axes u (width) and v (height), outward normal n."""
    p, u, v, n = V(p), V(u).normalized(), V(v).normalized(), V(n).normalized()
    t = 0.07
    for (a0, a1, b0, b1) in ((-w / 2 - t, w / 2 + t, h / 2, h / 2 + t), (-w / 2 - t, w / 2 + t, -h / 2 - t, -h / 2), (-w / 2 - t, -w / 2, -h / 2, h / 2), (w / 2, w / 2 + t, -h / 2, h / 2)):
        P.append(obox(name + "_fr", p, u, v, n, a0, a1, b0, b1, -0.01, depth, frame_m))
    G.append(obox(name + "_gl", p, u, v, n, -w / 2, w / 2, -h / 2, h / 2, -0.01, depth * 0.4, glass))


def gear_leg(name, par, foot):
    """Extended landing leg below a pod: strut, oleo, foot pad (static)."""
    fx, fy = foot
    pv = empty(name, loc=(fx, fy, -1.1), parent=par)
    parts = [seg_box("strut", (0, 0, 0.1), (0.25 * math.copysign(1, fx), 0.25 * math.copysign(1, fy), -0.55), 0.22, 0.22, "metal_gunmetal"),
             cyl("oleo", 0.09, 0.45, loc=(0.27 * math.copysign(1, fx), 0.27 * math.copysign(1, fy), -0.55), m="chrome", verts=12),
             cyl("pad", 0.55, 0.12, r2=0.42, loc=(0.3 * math.copysign(1, fx), 0.3 * math.copysign(1, fy), -0.74), m="metal_gunmetal", verts=20)]
    for sx in (-1, 1):
        parts.append(seg_box("brace", (sx * 0.4, 0, 0.0), (0.27 * math.copysign(1, fx), 0.27 * math.copysign(1, fy), -0.45), 0.08, 0.08, "metal_dark"))
    o = merge(parts, name + "_mesh", par=pv)
    o.location = (0, 0, 0)
    finish(o, 35)
    return pv


def exterior(root, P, G):
    sp = spine()
    P.append(sp)
    # deck panel lines and the central darker spine strip
    P.append(box("deck_strip", (1.3, 9.0, 0.02), loc=(0, -2.4, TOPZ + 0.01), m="metal_gunmetal"))
    for k in range(9):
        P.append(box("deck_seam", (4.2, 0.03, 0.012), loc=(0, Y0 + 1.5 + k * 1.55, TOPZ + 0.006), m="hull_seam"))
    # dorsal docking ring + hatch (rear of the deck)
    dy = -4.8
    P.append(kit.torus("dock_ring", 0.95, 0.09, loc=(0, dy, TOPZ + 0.06), m="metal_brushed", seg=40, rseg=8))
    P.append(cyl("dock_collar", 1.12, 0.12, loc=(0, dy, TOPZ + 0.03), m="metal_gunmetal", verts=40))
    P.append(cyl("dock_hatch", 0.78, 0.06, loc=(0, dy, TOPZ + 0.08), m="metal_gray", verts=32))
    for k in range(8):
        a = k * PI / 4
        P.append(box("dock_petal", (0.12, 0.3, 0.12), loc=(math.cos(a) * 1.02, dy + math.sin(a) * 1.02, TOPZ + 0.16), rot=(0, 0, a), m="metal_brushed"))
    empty("dock_top", loc=(0, dy, TOPZ + 0.12), rot=(PI / 2, 0, 0), parent=root, port="top")
    # deck windows (front → back), mirrored pairs as in the reference, plus a 4-wide row
    up, fwd = V((0, 0, 1)), V((0, 1, 0))
    rows = [(5.0, [(-1.15, 0.9, 0.4), (1.15, 0.9, 0.4)]), (4.0, [(-1.2, 1.1, 0.55), (1.2, 1.1, 0.55)]), (3.0, [(-1.55, 0.6, 0.45), (-0.55, 0.6, 0.45), (0.55, 0.6, 0.45), (1.55, 0.6, 0.45)]),
            (2.0, [(-1.25, 1.0, 0.45), (1.25, 1.0, 0.45)]), (1.0, [(-1.25, 1.0, 0.5), (1.25, 1.0, 0.5)]), (-0.1, [(-1.3, 0.8, 0.4), (1.3, 0.8, 0.4)]), (-2.2, [(-1.3, 0.6, 0.35), (1.3, 0.6, 0.35)])]
    for (y, wins) in rows:
        for (x, w, h) in wins:
            inset_window(P, G, (x, y, TOPZ + 0.005), (1, 0, 0), fwd, up, w, h, "deck_win")
    # front face: cockpit window row on the sloped nose face
    for k, x in NOSE_WIN:
        inset_window(P, G, (x, Y1 + 0.005, 0.62), (1, 0, 0), (0, 0, 1), (0, 1, 0), 0.6, 0.7, "nose_win", glass="glass_clear" if k in (1, 4) else "glass_dark")
    # side hatch (right flank) with frame
    P.append(obox("hatch_frame", (3.0, 1.2, -0.3), (0, 1, 0), (0, 0, 1), (1, 0, 0), -0.75, 0.75, -0.6, 1.3, 0.0, 0.05, "metal_gunmetal"))
    hs = empty("hatch_side", loc=(3.04, 0.55, -0.55), parent=root, interact="hatch", iid="lander_side_hatch", hinge="z", openAngle=-1.8)
    hd = box("hatch_side_door", (0.05, 1.3, 1.75), loc=(0.0, 0.65, 0.88), m=GRA, bevel=0.02, par=hs)
    box("hatch_side_handle", (0.04, 0.25, 0.06), loc=(0.04, 1.1, 0.95), m="metal_brushed", par=hs)
    arch_col("COL_hatch_side", (0.0, 0.65, 0.88), (0.08, 1.3, 1.75), hs, door="lander_side_hatch")
    # pods: front pair splayed forward, rear pair backward
    pods = []
    for (nm, cx, cy, yaw) in (("FL", -4.9, 3.5, 0.87), ("FR", 4.9, 3.5, -0.87), ("RL", -4.9, -4.0, PI - 0.87), ("RR", 4.9, -4.0, PI + 0.87)):
        o, base, ax, sd = pod("pod_" + nm, cx, cy, yaw, L=5.8, w=4.6)
        P.append(o)
        pods.append((nm, base, ax, sd))
        tip = base + ax * 2.9
        # pod top seam lines and riveted end
        for k in range(3):
            q = base + ax * (-1.6 + k * 1.6) + V((0, 0, 1.0 * 1.0 - 0.35 + 0.0))
            P.append(seg_box("pod_seam", q - sd * 0.72 + V((0, 0, 0.66)), q + sd * 0.72 + V((0, 0, 0.66)), 0.03, 0.012, "hull_seam"))
        # ventral VTOL nozzle and its heat shield ring
        nz = base + ax * 0.6 + V((0, 0, -1.8))
        P.append(lathe("vtol_bell_" + nm, [(0.32, 0.5), (0.45, 0.3), (0.62, 0.0), (0.7, -0.15), (0.64, -0.15), (0.4, 0.25), (0.28, 0.5)], m="nozzle_inner", seg=28, loc=nz))
        P.append(kit.torus("vtol_ring_" + nm, 0.75, 0.06, loc=nz + V((0, 0, 0.35)), m="metal_gunmetal", seg=28, rseg=6))
        empty("vtol_" + nm, loc=nz + V((0, 0, -0.2)), rot=(PI, 0, 0), parent=root)
        # main engine at the rear pods' ends, RCS quads at every tip, nav lights
        if nm.startswith("R"):
            ex = tip + ax * 0.05 + V((0, 0, -0.45))
            bell = lathe("main_bell_" + nm, [(0.25, 0.0), (0.38, -0.25), (0.55, -0.6), (0.6, -0.75), (0.54, -0.75), (0.34, -0.25), (0.22, 0.0)], m="nozzle_inner", seg=24, loc=ex)
            bell.rotation_mode = "QUATERNION"
            bell.rotation_quaternion = V((0, 0, -1)).rotation_difference(ax)
            P.append(bell)
            empty("engine_" + nm, loc=ex + ax * 0.7, rot=(0, 0, math.atan2(ax.y, ax.x) - PI / 2), parent=root, thrust=1)
        for (dz, dsd) in ((0.6, 1.0), (0.6, -1.0)):
            q = tip - ax * 0.6 + sd * (dsd * 1.3) + V((0, 0, dz))
            P.append(box("rcs_block", (0.3, 0.3, 0.25), loc=q, rot=(0, 0, math.atan2(ax.y, ax.x)), m="metal_gunmetal", bevel=0.02))
            for d in (sd * dsd, V((0, 0, 1)), ax):
                P.append(cyl("rcs_nozzle", 0.04, 0.12, loc=q + d * 0.18, rot=V((0, 0, 1)).rotation_difference(d).to_euler(), m="nozzle_inner", verts=8))
            empty(f"rcs_{nm}_{'p' if dsd > 0 else 'n'}", loc=q, parent=root)
        P.append(kit.sphere("navlight_" + nm, 0.07, loc=tip + V((0, 0, 0.4)), m="emit_red" if nm.endswith("L") else "emit_green", segs=10, rings=6))
        empty("navlight_" + nm, loc=tip + V((0, 0, 0.45)), parent=root, color="red" if nm.endswith("L") else "green")
        gear_leg("gear_" + nm, root, (base.x + ax.x * 0.9, base.y + ax.y * 0.9))
        # honeycomb fairing between pod root and spine flank
        P.append(obox("pod_fairing", base - ax * 3.0 + V((0, 0, 0.62)), ax, sd, V((0, 0, 1)), -0.2, 1.6, -1.3, 1.3, -0.05, 0.08, HON))
    # belly: landing lights, antenna blades, umbilical panel
    for (x, y) in ((-1.2, 5.5), (1.2, 5.5), (0, -5.5)):
        P.append(cyl("land_light", 0.16, 0.06, loc=(x, y, -1.32), m="lamp_lens", verts=16))
    for (x, y) in ((0.0, 2.0), (0.0, -2.5)):
        P.append(box("antenna_blade", (0.04, 0.5, 0.3), loc=(x, y, -1.45), m="metal_gunmetal", bevel=0.01))
    P.append(box("umbilical", (0.6, 0.4, 0.02), loc=(-2.95, -3.5, -0.4), rot=(0, 0, PI / 2), m="metal_gunmetal"))
    return pods


def arch_col(name, c, s, par, **kw):
    import arch
    return arch.col_box(name, c, s, 0, par, **kw)


# ------------------------------------------------------------------------------------------------ interior
def lseat(name, par, loc, pilot=False):
    root = empty(name, loc=loc, parent=par, interact="seat", iid=name, pilot=1 if pilot else 0)
    parts = [box("frame", (0.5, 0.6, 0.38), loc=(0, 0, 0.19), m="metal_dark", bevel=0.02),
             box("pan", (0.6, 0.58, 0.14), loc=(0, 0.02, 0.45), m="pad_gray", bevel=0.04, segs=3),
             box("back", (0.62, 0.16, 1.0), loc=(0, -0.3, 1.0), rot=(-0.18, 0, 0), m="pad_gray", bevel=0.05, segs=3),
             box("head", (0.38, 0.14, 0.26), loc=(0, -0.42, 1.62), rot=(-0.18, 0, 0), m="pad_gray", bevel=0.05, segs=3),
             box("shell", (0.66, 0.1, 1.2), loc=(0, -0.4, 1.05), rot=(-0.18, 0, 0), m="metal_gunmetal", bevel=0.02)]
    for sx in (-1, 1):
        parts.append(box("arm", (0.1, 0.45, 0.08), loc=(sx * 0.36, 0.02, 0.7), m="console_dark", bevel=0.02))
        parts.append(box("strap", (0.06, 0.02, 0.65), loc=(sx * 0.13, -0.22, 1.0), rot=(-0.18, 0, 0), m="plastic_dark"))
        # footrest ladder frame (image 21)
        parts.append(seg_box("foot_rail", (sx * 0.22, 0.35, 0.05), (sx * 0.22, 0.7, 0.35), 0.04, 0.04, "metal_gray"))
    for k in range(3):
        parts.append(box("foot_rung", (0.44, 0.04, 0.03), loc=(0, 0.42 + k * 0.11, 0.1 + k * 0.09), m="metal_gray"))
    if pilot:
        for sx in (-1, 1):
            parts.append(cyl("stick", 0.022, 0.18, loc=(sx * 0.36, 0.12, 0.83), m="plastic_dark", verts=10))
    o = merge(parts, name + "_mesh", par=root)
    o.location = (0, 0, 0)
    finish(o, 35)
    empty(name + "_eye", loc=(0, -0.05, 1.22), parent=root)
    return root


def console_screens(P, cx, cy, cz, n, w=0.36, h=0.26, tilt=0.35, gap=0.05):
    """Row of bezelled screens around a centre; screens face -Y (toward the crew)."""
    total = n * w + (n - 1) * gap
    for k in range(n):
        x = cx - total / 2 + w / 2 + k * (w + gap)
        P.append(box("cscr_bezel", (w + 0.04, 0.05, h + 0.04), loc=(x, cy + 0.02, cz), rot=(tilt, 0, 0), m="console_dark", bevel=0.008))
        P.append(box("cscr", (w, 0.01, h), loc=(x, cy - 0.005, cz), rot=(tilt, 0, 0), m="emit_screen" if (k + int(cx * 10)) % 4 else "emit_screen_amber"))


def switch_panel(P, cx, cy, cz, w, h, rows, cols, tilt=0.6):
    P.append(box("swp", (w, 0.04, h), loc=(cx, cy, cz), rot=(tilt, 0, 0), m="switch_panel", bevel=0.005))
    c, s = math.cos(tilt), math.sin(tilt)
    for r in range(rows):
        for k in range(cols):
            lx = -w / 2 + (k + 0.5) * w / cols
            lz = -h / 2 + (r + 0.5) * h / rows
            P.append(box("sw", (0.018, 0.03, 0.03), loc=(cx + lx, cy - 0.03 * c - lz * s, cz - 0.03 * s + lz * c), rot=(tilt, 0, 0), m=R.choice(["metal_brushed", "metal_brushed", "warning_yellow", "emit_green"])))


def interior(root, P, G, L, lights):
    zf, zc = -0.95, 1.92
    # floor plates and grated centre aisle (image 21)
    P.append(box("floor", (4.8, 13.2, 0.08), loc=(0, -0.1, zf - 0.04), m="int_floor"))
    for k in range(12):
        y = -6.0 + k * 1.05
        for sx in (-1, 1):
            P.append(box("fplate", (1.6, 0.98, 0.025), loc=(sx * 1.35, y, zf + 0.0125), m="int_floor", bevel=0.006))
        P.append(box("aisle_grate", (0.85, 0.98, 0.02), loc=(0, y, zf + 0.012), m="int_grate"))
        P.append(box("aisle_frame", (0.92, 0.04, 0.03), loc=(0, y - 0.5, zf + 0.015), m="metal_dark"))
    # walls (inner flanks follow the hull section), ribs, ceiling with window openings
    for sx in (-1, 1):
        P.append(obox("wall_low", (sx * 2.35, -6.7, zf), (0, 1, 0), (sx * 0.25, 0, 1.2), (sx, 0, 0), 0, 13.2, 0, 1, -0.05, 0.0, "int_panel_light"))
        P.append(obox("wall_up", (sx * 2.6, -6.7, zf + 1.2), (0, 1, 0), (-sx * 0.45, 0, zc - zf - 1.2), (sx, 0, 0), 0, 13.2, 0, 1, -0.05, 0.0, "int_panel_light"))
        for k in range(12):
            y = -6.2 + k * 1.1
            P.append(seg_box("rib", (sx * 2.3, y, zf), (sx * 2.55, y, zf + 1.2), 0.12, 0.1, "int_panel_mid"))
            P.append(seg_box("rib", (sx * 2.55, y, zf + 1.2), (sx * 2.12, y, zc), 0.12, 0.1, "int_panel_mid"))
        for k in range(5):   # stowage lockers along the cabin walls
            y = -2.8 + k * 1.0
            P.append(obox("locker", (sx * 2.28, y - 0.45, zf + 0.15), (0, 0.9, 0), (sx * 0.2, 0, 1.0), (-sx, 0, 0), 0, 1, 0, 1, 0.0, 0.25, "int_panel_mid"))
            P.append(box("locker_latch", (0.03, 0.12, 0.04), loc=(sx * 2.0, y, zf + 0.8), m="metal_brushed"))
    # ceiling: panels between the window bays, light strips along the bays (overhead windows of the deck)
    win_y = [5.0, 4.0, 3.0, 2.0, 1.0, -0.1, -2.2]
    for k in range(len(win_y) + 1):
        ya = Y0 + 1.0 if k == len(win_y) else win_y[k] + 0.32
        yb = 6.9 if k == 0 else win_y[k - 1] - 0.32
        if yb - ya > 0.05:
            P.append(box("ceil", (4.3, yb - ya, 0.06), loc=(0, (ya + yb) / 2, zc), m="int_panel_light"))
    for y in win_y:
        for sx in (-1, 1):
            P.append(box("ceil_strip", (0.4, 0.64, 0.06), loc=(sx * 2.0, y, zc), m="int_panel_light"))
        P.append(box("ceil_spine", (0.35, 0.64, 0.06), loc=(0, y, zc), m="int_panel_light"))
        for sx in (-1, 1):
            L.append(box("lampE|cabin|strip", (0.06, 0.6, 0.02), loc=(sx * 1.78, y, zc - 0.04), m="emit_cool"))
    for k, y in enumerate((4.5, 1.5, -1.5, -4.5)):
        lights.append(empty(f"light_cabin_{k}", loc=(0, y, zc - 0.4), parent=root, light="cool", group="cabin", intensity=4, distance=6))
    # front wall with the cockpit window openings, solid rear bulkhead
    import arch
    ops = [(x + 2.4, 0.62, 0.62 - 0.35, 0.62 + 0.35) for (k, x) in NOSE_WIN]
    arch.wall("front_wall", (-2.4, 6.72), (2.4, 6.72), zf, zc, 0.08, "int_panel_light", ops, parts=P)
    P.append(box("rear_bulkhead", (4.8, 0.08, zc - zf), loc=(0, -6.82, (zf + zc) / 2), m="int_panel_light"))
    # cockpit: pilot seats, side consoles (3 screens each), centre stack (6 screens + switches), overhead console
    lseat("seat_pilot", root, (-0.95, 3.9, zf), pilot=True)
    lseat("seat_copilot", root, (0.95, 3.9, zf), pilot=True)
    for sx in (-1, 1):
        P.append(box("side_console", (1.25, 0.7, 1.0), loc=(sx * 1.35, 5.35, zf + 0.5), m="console_dark", bevel=0.02))
        P.append(box("side_console_top", (1.3, 0.75, 0.05), loc=(sx * 1.35, 5.33, zf + 1.02), rot=(0.25, 0, 0), m="console_beige", bevel=0.01))
        console_screens(P, sx * 1.35, 5.62, zf + 1.42, 3)
        switch_panel(P, sx * 1.35, 5.1, zf + 1.06, 1.0, 0.28, 3, 10)
        P.append(box("knee_panel", (1.1, 0.05, 0.6), loc=(sx * 1.35, 4.98, zf + 0.5), m="int_panel_dark"))
    P.append(box("center_stack", (0.8, 0.8, 1.15), loc=(0, 5.6, zf + 0.58), m="console_dark", bevel=0.02))
    console_screens(P, 0, 5.62, zf + 1.65, 2, w=0.32, h=0.24)
    console_screens(P, 0, 5.66, zf + 1.36, 3, w=0.22, h=0.2)
    switch_panel(P, 0, 5.15, zf + 1.1, 0.7, 0.3, 4, 8)
    P.append(box("throttle_quad", (0.3, 0.35, 0.12), loc=(0, 4.95, zf + 0.95), m="console_dark", bevel=0.01))
    for k in range(3):
        P.append(seg_box("throttle_lever", (-0.08 + k * 0.08, 4.95, zf + 1.0), (-0.08 + k * 0.08, 4.88, zf + 1.18), 0.025, 0.025, "metal_brushed"))
    empty("lever_throttle", loc=(0, 4.95, zf + 1.05), parent=root, interact="lever", iid="throttle")
    P.append(box("overhead", (1.9, 1.1, 0.16), loc=(0, 4.6, zc - 0.1), rot=(-0.15, 0, 0), m="console_dark", bevel=0.02))
    for k in range(3):
        P.append(box("oh_scr", (0.32, 0.01, 0.2), loc=(-0.45 + k * 0.45, 4.12, zc - 0.21), rot=(-1.25, 0, 0), m="emit_screen"))
    switch_panel(P, 0, 4.8, zc - 0.2, 1.6, 0.5, 4, 14, tilt=-1.4)
    empty("cam_cockpit", loc=(-0.95, 3.85, zf + 1.25), parent=root)
    # cabin seats (two rows), facing forward
    for (x, y) in ((-1.0, 1.9), (1.0, 1.9), (-1.0, 0.3), (1.0, 0.3)):
        lseat(f"seat_p{len([c for c in root.children if c.name.startswith('seat_p') and c.name[6:].isdigit()]) + 1}", root, (x, y, zf))
    # rear: equipment racks, suit lockers, ladder up to the dorsal docking hatch
    for sx in (-1, 1):
        P.append(box("rack", (0.7, 1.6, 1.9), loc=(sx * 1.75, -3.6, zf + 0.95), m="int_panel_mid", bevel=0.02))
        for k in range(6):
            P.append(box("rack_unit", (0.04, 1.4, 0.18), loc=(sx * 1.38, -3.6, zf + 0.35 + k * 0.28), m=R.choice(["console_dark", "int_panel_dark"])))
            P.append(box("rack_led", (0.01, 0.05, 0.03), loc=(sx * 1.355, -3.2, zf + 0.35 + k * 0.28), m=R.choice(["emit_green", "emit_green", "emit_red"])))
        P.append(box("suit_locker", (0.7, 1.0, 1.95), loc=(sx * 1.75, -5.4, zf + 0.98), m="int_panel_light", bevel=0.02))
    dy = -4.8
    P.append(cyl("dock_tunnel", 0.82, zc - (zf + 0.0) - 1.5, loc=(0, dy, zc - 0.2), m="int_panel_mid", verts=24, cap=False))
    for k in range(7):
        P.append(box("ladder_rung", (0.5, 0.04, 0.04), loc=(0, dy + 0.62, zf + 0.3 + k * 0.38), m="metal_brushed"))
    for sx in (-1, 1):
        P.append(box("ladder_rail", (0.04, 0.05, 2.9), loc=(sx * 0.27, dy + 0.62, zf + 1.4), m="metal_brushed"))
    empty("ladder_dock", loc=(0, dy + 0.4, zf), parent=root, interact="ladder", iid="lander_dock_ladder")
    empty("spawn_cabin", loc=(0, -1.5, zf + 0.05), parent=root)
    # interior side door frame (matches the exterior side hatch)
    P.append(obox("door_lining", (2.32, 0.5, zf), (0, 1, 0), (0, 0, 1), (-1, 0, 0), 0, 1.4, 0, 1.85, 0, 0.12, "metal_gunmetal"))
    rv = box("ROOM_lander", (4.8, 13.4, zc - zf), loc=(0, -0.1, (zf + zc) / 2), m="frame_black", par=root, room="lander_cabin")
    rv.hide_render = True
    # collision: floor, walls, ceiling, consoles
    for (c, s) in (((0, -0.1, zf - 0.1), (4.8, 13.4, 0.2)), ((0, -0.1, zc + 0.1), (4.8, 13.4, 0.2)), ((-2.45, -0.1, (zf + zc) / 2), (0.2, 13.4, zc - zf)),
                   ((2.45, -0.1, (zf + zc) / 2), (0.2, 13.4, zc - zf)), ((0, 6.75, (zf + zc) / 2), (4.8, 0.2, zc - zf)), ((0, -6.85, (zf + zc) / 2), (4.8, 0.2, zc - zf)),
                   ((-1.35, 5.35, zf + 0.5), (1.25, 0.7, 1.0)), ((1.35, 5.35, zf + 0.5), (1.25, 0.7, 1.0)), ((0, 5.6, zf + 0.58), (0.8, 0.8, 1.15)),
                   ((-1.75, -3.6, zf + 0.95), (0.7, 1.6, 1.9)), ((1.75, -3.6, zf + 0.95), (0.7, 1.6, 1.9))):
        arch_col("COL_int", c, s, root)


def build(preview=True):
    kit.reset()
    root = empty("Lander")
    set_props(root, vehicle="lander", length=16.0, gear_height=1.9)
    P, G, L, lights = [], [], [], []
    exterior(root, P, G)
    interior(root, P, G, L, lights)
    hull = merge(P, "lander_body", par=root)
    finish(hull, 35)
    gl = merge(G, "lander_glass", par=root)
    finish(gl, 10)
    lm = merge(L, "lamps_cabin", par=root, group="cabin", lampmesh=1)
    finish(lm, 30)
    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)
    kit.export_glb(os.path.join(kit.out_dir(), "lander.glb"), root)
    if preview:
        pd = kit.preview_dir()
        w = (0.2, 0.21, 0.24)
        kit.preview(os.path.join(pd, "lander.png"), (-17, 19, 13), (0, 0.5, 0.3), lens=40, samples=32, world=w, sun=(-0.3, 0.5, 0.8), sun_strength=5)
        kit.preview(os.path.join(pd, "lander_cockpit.png"), (0, -1.6, 0.55), (0, 6.0, 0.35), lens=20, samples=24, world=(0.6, 0.62, 0.66), sun=(0.2, -0.4, 0.9), strength=0.6)


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
