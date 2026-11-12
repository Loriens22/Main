"""
Dr. Mann's camp on the glacier world (reference photos: the camp exterior and the hab interior). Original model built
from the references; no logos or markings from them.

Exterior: a long, low hab of thick rust-orange arch segments that step down from front to back (each with a rounded
rim at its rear edge and a dark seal between segments), a big charcoal end-cap with a domed nose and a cluster of round
vents, an airlock porch recessed under the ribs on the long side with a grey bulkhead and a sliding door. The hab sits
on a raised ice shelf; a wind-packed drift buries its back and rear end; fractured ice slabs and dark cracks in front;
a dark streaked ice cliff behind. Around it: an ice-core drill derrick with a tray of cores, a supply sled, a finned
power unit, flood lamps, an antenna, cable runs, the beacon mast position.
Interior (airlock / main room): coffered grid ceiling with light strips, cable trays, a wall of white storage
drawers, quilted bags strapped overhead, a large round wall hatch, a monitor on an arm over the survey desk, a
grated floor lit from below, red gear at the back, suit lockers and an ice-core rack in the airlock, and the cryo pod:
rounded white body, side latches and hinges, a frosted lid (separate node `pod_hinge`, rotates about X).

Blender: X along the hab (end-cap at +X), -Y = the approach side (porch), Z up. Ground (pad level) z = 0.
Nodes: door_outer / door_inner (interact=slidedoor), *_hit (interact=lazarus, iid=mann_pod|mann_terminal),
spot_* (NPC / test positions), nav_* (follower waypoints), light_* (int / ext), lamps_* (lampmesh int/floor/ext),
snap_cliff (dropped onto the terrain at runtime), ROOM_mann_main / ROOM_mann_lock.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe, loft
import camp
from camp import arch_pts, rrect_pts, shell_x, sheet_x, loft_x, heightgrid, smoothstep, n2, col, hit, lamp_post

PI = math.pi
R = random.Random(64)
OR, CH = "mann_orange", "paint_charcoal"
T = 0.42            # shell thickness
FZ = 0.5            # interior floor (top)
CZ = 2.95           # interior ceiling
WY = 2.27           # interior wall planes |y|
SHELF = 0.2         # ice shelf top
# segments front → back: (name, x0, x1, W, H, r)
SEGS = [
    ("collar", 5.5, 7.35, 7.3, 5.5, 2.1),
    ("s1", 2.75, 5.36, 6.95, 5.15, 1.98),
    ("s2", 0.0, 2.61, 6.7, 4.88, 1.9),
    ("s3", -2.75, -0.14, 6.45, 4.62, 1.82),
    ("s4", -5.5, -2.89, 6.2, 4.36, 1.74),
    ("s5", -8.3, -5.64, 5.95, 4.1, 1.66),
]
CAP = dict(x0=6.0, W=6.25, H=4.78, r=1.78)
DOOR_X = -4.1       # porch door centre
PORCH = (-5.12, -3.08)


def seg_at(x):
    for s in SEGS:
        if s[1] - 0.08 <= x <= s[2] + 0.08:
            return s
    return SEGS[0] if x > 0 else SEGS[-1]


def arch(W, H, r, d=0.0, n=8):
    """arch profile offset by d (same point count for any d, so offsets can be skinned together)"""
    return arch_pts(W + 2 * d, H + d, r + d, n=n, side=max(2, int((H - r) / 0.5)))


def door_poly(w, h, r, cx=0.0, z0=0.0, n=6):
    pts = [(cx - w / 2, z0), (cx + w / 2, z0)]
    for k in range(n + 1):
        a = (PI / 2) * k / n
        pts.append((cx + w / 2 - r + r * math.cos(a), z0 + h - r + r * math.sin(a)))
    for k in range(n + 1):
        a = PI / 2 + (PI / 2) * k / n
        pts.append((cx - w / 2 + r + r * math.cos(a), z0 + h - r + r * math.sin(a)))
    return pts


def sweep_y(name, outline, y0, y1, m, thick=0.05, par=None):
    """Lining swept along Y through an (x, z) outline, given thickness (porch reveal, door frames)."""
    bm = bmesh.new()
    A = [bm.verts.new((x, y0, z)) for x, z in outline]
    B = [bm.verts.new((x, y1, z)) for x, z in outline]
    for i in range(len(outline) - 1):
        bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
    o = kit.from_bmesh(name, bm, (m,), par=par)
    kit.add_solidify(o, thick, 0.0)
    return o


# ================================================================================================ hab shell
def hab(root, P, D):
    """P: orange/charcoal exterior parts, D: details."""
    for i, (nm, x0, x1, W, H, r) in enumerate(SEGS):
        sh = shell_x(f"{nm}_shell", arch(W, H, r), arch(W, H, r, -T), x0 + 0.02, x1, OR)
        if nm == "s4":
            # the airlock porch: cut the lower long side open under the ribs
            cut = kit.prism_xz("porch_cut", door_poly(PORCH[1] - PORCH[0], 3.55, 0.55, cx=(PORCH[0] + PORCH[1]) / 2, z0=-0.6), -4.5, -WY - 0.12, m=OR)
            kit.boolean(sh, cut)
        P.append(sh)
        # thick rounded rim at the rear edge of each segment (the visible step down to the next)
        rim = shell_x(f"{nm}_rim", arch(W, H, r, 0.15), arch(W, H, r, -T + 0.02), x0, x0 + 0.46, OR)
        kit.add_bevel(rim, 0.14, 4, 30)
        P.append(rim)
        if nm == "collar":
            lip = shell_x("collar_lip", arch(W, H, r, 0.16), arch(W, H, r, -T - 0.04), x1 - 0.5, x1, OR)
            kit.add_bevel(lip, 0.16, 4, 30)
            P.append(lip)
        # dark seal band in the gap to the next (smaller) segment
        if i + 1 < len(SEGS):
            nx = SEGS[i + 1]
            P.append(shell_x(f"{nm}_seal", arch(nx[3], nx[4], nx[5], -0.06), arch(nx[3], nx[4], nx[5], -T + 0.06), nx[2] - 0.05, x0 + 0.06, CH))
        # one shallow panel seam per segment
        if nm not in ("s4", "collar"):
            xs = x0 + (x1 - x0) * 0.55
            D.append(shell_x(f"{nm}_seam", arch(W, H, r, 0.006), arch(W, H, r, -0.01), xs - 0.012, xs + 0.012, "hull_seam"))
    # end-cap: a charcoal pill nose inside the collar, vents in its front face
    c = CAP
    secs = []
    for (x, d) in NOSE:
        secs.append((x, rrect_pts(c["W"] - 2 * d, c["H"] - d, max(0.3, c["r"] - d * 0.7), rb=0.08, n=8)))
    capm = loft_x("endcap", secs, CH)
    kit.smooth(capm, 50)
    P.append(capm)
    # seam band and service hatch outline on the cap
    P.append(shell_x("cap_band", arch(c["W"], c["H"], c["r"], 0.02), arch(c["W"], c["H"], c["r"], -0.05), 7.7, 7.8, "metal_dark"))
    fw = c["W"] - 2.1
    for (vy, vz) in [(-1.5 + 0.5 * i, 2.45 + 0.46 * j) for i in range(4) for j in range(3)]:
        D.append(kit.torus("vent_rim", 0.15, 0.028, loc=(9.31, vy, vz), rot=(0, PI / 2, 0), m="metal_dark", seg=16, rseg=6))
        D.append(cyl("vent_hole", 0.13, 0.04, loc=(9.295, vy, vz), rot=(0, PI / 2, 0), m="frame_black", verts=16))
        for k in (-1, 0, 1):
            D.append(box("vent_slat", (0.012, 0.24, 0.022), loc=(9.31, vy, vz + k * 0.065), m="metal_gunmetal"))
    for (y0, y1, z0, z1) in ((0.35, 1.75, 0.55, 2.2),):
        for (a, b, cc, dd) in ((y0, y1, z0, z0 + 0.03), (y0, y1, z1 - 0.03, z1), (y0, y0 + 0.03, z0, z1), (y1 - 0.03, y1, z0, z1)):
            D.append(box("cap_hatch_edge", (0.02, b - a, dd - cc), loc=(9.305, (a + b) / 2, (cc + dd) / 2), m="hull_seam"))
        D.append(box("cap_hatch_handle", (0.05, 0.3, 0.05), loc=(9.32, (y0 + y1) / 2, z1 - 0.35), m="metal_gray", bevel=0.01))
    # rear end: a smaller charcoal nose, mostly under the drift
    s5 = SEGS[-1]
    rs = []
    for (x, d) in ((s5[1] + 0.3, 0.12), (s5[1] - 0.05, 0.22), (s5[1] - 0.3, 0.5), (s5[1] - 0.45, 0.95)):
        rs.append((x, rrect_pts(s5[3] - 2 * d, s5[4] - d, max(0.3, s5[5] - d * 0.7), rb=0.08, n=6)))
    rs.reverse()
    P.append(loft_x("rearcap", rs, CH))
    # porch: reveal lining, bulkhead with the door opening, soffit lamp, steps
    x0p, x1p = PORCH
    outline = door_poly(x1p - x0p, 2.95, 0.55, cx=(x0p + x1p) / 2, z0=0.0)[2:] + [(x0p, 0.0)]
    outline = [(x1p, 0.0)] + outline
    P.append(sweep_y("porch_reveal", outline, -3.35, -WY - 0.12, "metal_gunmetal", thick=0.04))
    bh = kit.prism_xz("bulkhead", door_poly(x1p - x0p, 2.95, 0.55, cx=(x0p + x1p) / 2, z0=0.0), -2.47, -2.39, m="hatch_gray")
    kit.boolean(bh, kit.prism_xz("bh_cut", door_poly(1.04, 2.08, 0.42, cx=DOOR_X, z0=FZ), -3.0, -2.0, m="hatch_gray"))
    P.append(bh)
    # door frame ring and side panels of the bulkhead
    fr = door_poly(1.04, 2.08, 0.42, cx=DOOR_X, z0=FZ)
    P.append(sweep_y("door_frame", fr[1:] + [fr[0]], -2.56, -2.4, "metal_dark", thick=0.06))
    for sx in (x0p + 0.18, x1p - 0.18):
        for z in (0.9, 1.6, 2.3):
            D.append(box("bh_panel", (0.26, 0.02, 0.5), loc=(sx, -2.485, z), m="int_panel_mid", bevel=0.01))
    D.append(box("bh_keypad", (0.14, 0.04, 0.2), loc=(DOOR_X + 0.75, -2.5, 1.55), m="console_dark", bevel=0.01))
    D.append(box("bh_keypad_led", (0.08, 0.01, 0.04), loc=(DOOR_X + 0.75, -2.525, 1.6), m="emit_green"))
    D.append(box("bh_stripe", (x1p - x0p, 0.03, 0.12), loc=((x0p + x1p) / 2, -2.49, 0.28), m="warning_yellow"))
    # steps: ice shelf (0.2) → step (0.35) → floor (0.5)
    P.append(box("porch_step", (1.5, 0.85, 0.35), loc=(DOOR_X, -2.9, 0.175), m="int_grate", bevel=0.01))
    P.append(box("porch_step_base", (1.46, 0.8, 0.3), loc=(DOOR_X, -2.9, 0.14), m="metal_dark"))
    P.append(box("porch_sill", (1.2, 0.3, 0.5), loc=(DOOR_X, -2.45, 0.25), m="metal_dark"))
    # skids and the plinth along the foot of the shell
    for sy in (-1, 1):
        P.append(box("skid", (17.4, 0.3, 0.3), loc=(0.4, sy * 2.85, 0.15), m="metal_dark"))


def doors(root):
    """Pocket sliding doors: outer (porch, slides -X into the wall), inner (partition, slides +Y)."""
    dn = empty("door_outer", loc=(DOOR_X, -2.34, FZ), parent=root, interact="slidedoor", iid="mann_outer", travel=-1.06)
    parts = [kit.prism_xz("do_panel", door_poly(1.0, 2.05, 0.4, cx=0, z0=0.0), -0.03, 0.03, m="hatch_gray")]
    parts.append(box("do_seam", (0.02, 0.075, 1.5), loc=(0.02, 0, 0.95), m="hull_seam"))
    parts.append(box("do_win", (0.24, 0.075, 0.3), loc=(-0.22, 0, 1.45), m="glass_dark", bevel=0.02))
    parts.append(box("do_winframe", (0.3, 0.07, 0.36), loc=(-0.22, 0, 1.45), m="metal_dark", bevel=0.02))
    parts.append(box("do_handle", (0.05, 0.11, 0.32), loc=(0.36, 0, 1.0), m="metal_gray", bevel=0.01))
    for z in (0.35, 0.75):
        parts.append(box("do_rib", (0.9, 0.075, 0.04), loc=(0, 0, z), m="int_panel_mid"))
    for p in parts:
        p.location = V(p.location)
    m = merge(parts, "door_outer_panel", par=dn)
    finish(m, 30)
    col("door_outer", (DOOR_X, -2.36, FZ + 1.05), (1.06, 0.2, 2.1), root, door="mann_outer")
    di = empty("door_inner", loc=(-3.0, 0.0, FZ), rot=(0, 0, PI / 2), parent=root, interact="slidedoor", iid="mann_inner", travel=1.06)
    parts = [kit.prism_xz("di_panel", door_poly(1.0, 2.05, 0.35, cx=0, z0=0.0), -0.03, 0.03, m="plastic_white")]
    parts.append(box("di_win", (0.5, 0.075, 0.24), loc=(0, 0, 1.55), m="glass_dark", bevel=0.02))
    parts.append(box("di_handle", (0.05, 0.11, 0.3), loc=(-0.38, 0, 1.0), m="metal_gray", bevel=0.01))
    parts.append(box("di_stripe", (1.0, 0.075, 0.08), loc=(0, 0, 0.12), m="warning_yellow"))
    m = merge(parts, "door_inner_panel", par=di)
    finish(m, 30)
    col("door_inner", (-3.0, 0.0, FZ + 1.05), (0.2, 1.06, 2.1), root, door="mann_inner")


# ================================================================================================ interior
def interior(root, P, W, L, F, lights):
    """P: hard parts, W: white panels/drawers, L: ceiling strips (lampmesh int), F: under-floor strips (lampmesh floor)."""
    xa, xb = -8.2, 6.1          # interior length (rear wall .. front bulkhead)
    # floor: subfloor, grating panels with frames, under-floor light strips along the aisle
    P.append(box("subfloor", (xb - xa, 2 * WY, 0.04), loc=((xa + xb) / 2, 0, FZ - 0.16), m="int_panel_dark"))
    P.append(box("floor_base", (xb - xa, 2 * WY, FZ - 0.2), loc=((xa + xb) / 2, 0, (FZ - 0.2) / 2), m="metal_dark"))
    nx = int((xb - xa) / 1.2)
    for i in range(nx):
        x = xa + (i + 0.5) * (xb - xa) / nx
        for (y, w) in ((-1.45, 1.62), (0.0, 1.24), (1.45, 1.62)):
            P.append(box("grate", ((xb - xa) / nx - 0.04, w - 0.04, 0.03), loc=(x, y, FZ - 0.015), m="int_grate"))
        P.append(box("grate_frame_x", (0.04, 2 * WY, 0.06), loc=(x - (xb - xa) / nx / 2, 0, FZ - 0.04), m="metal_gunmetal"))
    for y in (-0.64, 0.64):
        P.append(box("grate_frame_y", (xb - xa, 0.04, 0.06), loc=((xa + xb) / 2, y, FZ - 0.04), m="metal_gunmetal"))
        F.append(box("floor_strip", (xb - xa - 0.4, 0.05, 0.02), loc=((xa + xb) / 2, y * 0.75, FZ - 0.13), m="emit_warm"))
    # walls: white panels with seams (lower dado in grey)
    for sy in (-1, 1):
        x = xa
        while x < xb - 0.05:
            w = min(1.2, xb - x)
            if not (sy < 0 and x + w > DOOR_X - 0.55 and x < DOOR_X + 0.55):
                W.append(box("wall_panel", (w - 0.02, 0.03, CZ - FZ - 0.5), loc=(x + w / 2, sy * (WY + 0.015), FZ + 0.25 + (CZ - FZ - 0.5) / 2 + 0.25), m="paint_white_aero", bevel=0.008))
                P.append(box("wall_dado", (w - 0.02, 0.03, 0.48), loc=(x + w / 2, sy * (WY + 0.015), FZ + 0.25), m="int_panel_mid", bevel=0.008))
            x += w
    # walls around the porch door (airlock -Y side): lintel and jambs
    W.append(box("wall_lintel", (1.1, 0.03, CZ - FZ - 2.08), loc=(DOOR_X, -(WY + 0.015), FZ + 2.08 + (CZ - FZ - 2.08) / 2), m="paint_white_aero"))
    for sx in (-1, 1):
        P.append(box("door_jamb", (0.06, 0.16, 2.08), loc=(DOOR_X + sx * 0.55, -WY + 0.02, FZ + 1.04), m="metal_dark"))
    # rear wall and front bulkhead
    W.append(box("rear_wall", (0.04, 2 * WY, CZ - FZ), loc=(xa - 0.02, 0, (FZ + CZ) / 2), m="paint_white_aero"))
    P.append(box("front_bulk", (0.05, 2 * WY, CZ - FZ), loc=(xb + 0.025, 0, (FZ + CZ) / 2), m="int_panel_light"))
    # ceiling: coffered grid (white frame lattice over dark recessed panels), light strips along X
    P.append(box("ceil_back", (xb - xa, 2 * WY, 0.03), loc=((xa + xb) / 2, 0, CZ + 0.1), m="int_panel_mid"))
    ny = 8
    for j in range(ny + 1):
        y = -WY + 2 * WY * j / ny
        W.append(box("ceil_rail", (xb - xa, 0.05, 0.1), loc=((xa + xb) / 2, y, CZ + 0.04), m="plastic_white"))
    k = 0
    x = xa
    while x <= xb + 1e-3:
        W.append(box("ceil_rib", (0.05, 2 * WY, 0.1), loc=(x, 0, CZ + 0.04), m="plastic_white"))
        x += 0.6
        k += 1
    # recessed square panels with a raised centre (gives the dark coffer look)
    x = xa + 0.3
    while x < xb:
        for j in range(ny):
            y = -WY + 2 * WY * (j + 0.5) / ny
            if j in (2, 5):
                continue
            P.append(box("coffer", (0.44, 2 * WY / ny - 0.14, 0.03), loc=(x, y, CZ + 0.07), m="int_panel_dark", bevel=0.01))
        x += 0.6
    for j in (2, 5):
        y = -WY + 2 * WY * (j + 0.5) / ny
        x = xa + 0.3
        while x < xb:
            L.append(box("ceil_strip", (0.5, 0.16, 0.02), loc=(x, y, CZ + 0.02), m="emit_cool"))
            P.append(box("ceil_fixture", (0.56, 0.24, 0.05), loc=(x, y, CZ + 0.055), m="metal_gray"))
            x += 0.6
    # cable trays with bundled cables along both upper sides
    for sy in (-1, 1):
        yt = sy * (WY - 0.42)
        P.append(box("tray_bot", (xb - xa - 0.4, 0.3, 0.015), loc=((xa + xb) / 2, yt, CZ - 0.22), m="metal_gray"))
        for e in (-1, 1):
            P.append(box("tray_side", (xb - xa - 0.4, 0.015, 0.08), loc=((xa + xb) / 2, yt + e * 0.15, CZ - 0.18), m="metal_gray"))
        for c in range(4):
            yy = yt - 0.1 + c * 0.065
            pts = [(xa + 0.3, yy, CZ - 0.19 + 0.01 * (c % 2))]
            for s in range(1, 9):
                pts.append((xa + 0.3 + s * (xb - xa - 0.6) / 8, yy + 0.01 * math.sin(s * 1.7 + c), CZ - 0.19 + 0.012 * math.sin(s + c)))
            P.append(kit.tube("cable", pts, 0.018, m="rubber_black" if c % 2 else "pipe_blue", seg=6))
        for x in range(int(xa) + 1, int(xb), 2):
            P.append(box("tray_hanger", (0.03, 0.03, 0.22), loc=(x, yt, CZ - 0.11), m="metal_dark"))
    # a duct along the +Y upper corner (above the bag rack) with a vent grille every 2 m
    P.append(cyl("duct", 0.12, xb - xa - 0.2, loc=((xa + xb) / 2, WY - 0.2, CZ - 0.16), rot=(0, PI / 2, 0), m="metal_brushed", verts=14))

    # ------------------------------------------------------------------ partition (airlock | main room) at x = -3
    xp = -3.0
    for (y0, y1) in ((-WY, -0.52), (0.52, WY)):
        for dx in (-0.075, 0.075):
            W.append(box("part_wall", (0.04, y1 - y0, CZ - FZ), loc=(xp + dx, (y0 + y1) / 2, (FZ + CZ) / 2), m="paint_white_aero"))
    for dx in (-0.075, 0.075):
        W.append(box("part_lintel", (0.04, 1.04, CZ - FZ - 2.08), loc=(xp + dx, 0, FZ + 2.08 + (CZ - FZ - 2.08) / 2), m="paint_white_aero"))
    for sy in (-1, 1):
        P.append(box("part_jamb", (0.2, 0.05, 2.08), loc=(xp, sy * 0.53, FZ + 1.04), m="metal_dark"))
    col("part_a", (xp, -(WY + 0.52) / 2, (FZ + CZ) / 2), (0.2, WY - 0.52, CZ - FZ), root)
    col("part_b", (xp, (WY + 0.52) / 2, (FZ + CZ) / 2), (0.2, WY - 0.52, CZ - FZ), root)
    col("part_lintel", (xp, 0, FZ + 2.08 + (CZ - FZ - 2.08) / 2), (0.2, 1.06, CZ - FZ - 2.08), root)
    # stacked white storage boxes both sides of the inner door (main-room face) + red straps hanging
    for sy in (-1, 1):
        for c in range(3):
            for r_ in range(5):
                y = sy * (0.75 + c * 0.5)
                if abs(y) > WY - 0.2:
                    continue
                W.append(box("store_box", (0.36, 0.46, 0.4), loc=(xp + 0.3, y, FZ + 0.22 + r_ * 0.43), m="plastic_white", bevel=0.02))
                P.append(box("store_grip", (0.02, 0.18, 0.05), loc=(xp + 0.485, y, FZ + 0.3 + r_ * 0.43), m="plastic_dark"))
    for (y, h) in ((-1.95, 1.0), (-1.82, 0.7), (1.9, 0.9)):
        P.append(box("red_strap", (0.02, 0.06, h), loc=(xp + 0.55, y, CZ - 0.25 - h / 2), m="fabric_red"))
    P.append(box("red_bag", (0.25, 0.4, 0.55), loc=(xp + 0.62, -1.62, CZ - 0.75), m="fabric_red", bevel=0.08))

    # ------------------------------------------------------------------ main room
    # left (-Y) wall: a full wall of white drawers with recessed grips
    x0d, x1d = -2.75, 2.05
    cols = 8
    rows = 5
    for c in range(cols):
        for r_ in range(rows):
            w = (x1d - x0d) / cols
            h = (CZ - 0.3 - FZ) / rows
            x = x0d + (c + 0.5) * w
            z = FZ + (r_ + 0.5) * h
            W.append(box("drawer", (w - 0.03, 0.08, h - 0.03), loc=(x, -WY + 0.05, z), m="plastic_white", bevel=0.012))
            P.append(box("drawer_grip", (w * 0.4, 0.02, 0.045), loc=(x, -WY + 0.1, z + h * 0.28), m="plastic_dark"))
            if R.random() < 0.18:
                P.append(box("drawer_tag", (0.09, 0.01, 0.05), loc=(x - w * 0.3, -WY + 0.095, z + h * 0.28), m="warning_red"))
    P.append(box("drawer_carcass", (x1d - x0d + 0.04, 0.12, CZ - FZ - 0.25), loc=((x0d + x1d) / 2, -WY + 0.0, FZ + (CZ - FZ - 0.25) / 2), m="int_panel_mid"))
    col("drawers", ((x0d + x1d) / 2, -WY + 0.05, (FZ + CZ) / 2), (x1d - x0d, 0.14, CZ - FZ), root)
    # left wall, forward: life-support rack (dark, status lights), red emergency kit
    P.append(box("ls_rack", (1.6, 0.55, 2.2), loc=(3.7, -WY + 0.3, FZ + 1.1), m="console_dark", bevel=0.02))
    for i in range(6):
        P.append(box("ls_unit", (1.5, 0.04, 0.3), loc=(3.7, -WY + 0.59, FZ + 0.3 + i * 0.34), m="int_panel_dark", bevel=0.01))
        P.append(box("ls_led", (0.05, 0.01, 0.03), loc=(3.1 + 0.12 * (i % 3), -WY + 0.615, FZ + 0.4 + i * 0.34), m="emit_green" if i % 4 else "emit_red"))
    P.append(box("red_kit", (0.5, 0.25, 0.35), loc=(5.3, -WY + 0.15, FZ + 1.4), m="warning_red", bevel=0.04))
    P.append(cyl("extinguisher", 0.08, 0.5, loc=(5.0, -WY + 0.12, FZ + 0.4), m="warning_red", verts=12))
    col("ls_rack", (3.7, -WY + 0.3, FZ + 1.1), (1.6, 0.6, 2.2), root)
    # right (+Y) wall: the big round hatch (sealed sample store), lockers, overhead quilted bags
    hx, hz = -1.55, FZ + 1.15
    P.append(kit.torus("hatch_rim", 0.74, 0.1, loc=(hx, WY - 0.06, hz), rot=(PI / 2, 0, 0), m="plastic_white", seg=40, rseg=10))
    P.append(cyl("hatch_door", 0.66, 0.12, loc=(hx, WY - 0.12, hz), rot=(PI / 2, 0, 0), m="plastic_white", verts=40, bevel=0.03))
    P.append(cyl("hatch_boss", 0.16, 0.08, loc=(hx, WY - 0.2, hz), rot=(PI / 2, 0, 0), m="metal_gray", verts=20))
    P.append(kit.torus("hatch_wheel", 0.26, 0.022, loc=(hx, WY - 0.25, hz), rot=(PI / 2, 0, 0), m="metal_gray", seg=24, rseg=6))
    for k in range(4):
        a = k * PI / 2 + PI / 4
        P.append(box("hatch_spoke", (0.5, 0.025, 0.025), loc=(hx, WY - 0.25, hz), rot=(0, a, 0), m="metal_gray"))
    for k in range(8):
        a = k * PI / 4
        P.append(box("hatch_dog", (0.1, 0.08, 0.06), loc=(hx + math.cos(a) * 0.74, WY - 0.16, hz + math.sin(a) * 0.74), rot=(0, -a, 0), m="metal_dark", bevel=0.01))
    for z in (hz - 0.45, hz + 0.45):
        P.append(box("hatch_hinge", (0.18, 0.12, 0.16), loc=(hx - 0.86, WY - 0.12, z), m="metal_dark", bevel=0.02))
    P.append(box("hatch_label", (0.5, 0.01, 0.08), loc=(hx, WY - 0.03, hz + 0.98), m="warning_yellow"))
    col("hatch", (hx, WY - 0.12, hz), (1.7, 0.3, 1.7), root)
    for i, x in enumerate((0.1, 0.75, 1.4, 2.05)):
        W.append(box("locker", (0.62, 0.5, 1.75), loc=(x, WY - 0.25, FZ + 0.875), m="plastic_white", bevel=0.015))
        P.append(box("locker_grip", (0.03, 0.02, 0.3), loc=(x + 0.24, WY - 0.51, FZ + 1.05), m="plastic_dark"))
        for z in (0.5, 1.2):
            P.append(box("locker_vent", (0.4, 0.01, 0.04), loc=(x, WY - 0.505, FZ + z), m="hull_seam"))
    col("lockers", (1.08, WY - 0.25, FZ + 0.875), (2.6, 0.5, 1.75), root)
    # bag rack: two rails under the ceiling, quilted bags strapped to it (white, puffy)
    for z in (CZ - 0.12, CZ - 0.62):
        P.append(cyl("rack_rail", 0.025, 5.6, loc=(0.1, WY - 0.62, z), rot=(0, PI / 2, 0), m="metal_gray", verts=8))
    for x in (-2.6, -1.0, 0.6, 2.2):
        P.append(box("rack_drop", (0.04, 0.04, 0.6), loc=(x + 0.7, WY - 0.62, CZ - 0.37), m="metal_gray"))
    for i, (x, l) in enumerate(((-2.0, 1.3), (-0.65, 1.25), (0.7, 1.35), (2.05, 1.2))):
        bag = kit.sphere("quilt_bag", 1.0, loc=(x, WY - 0.42, CZ - 0.42), m="pad_white", segs=20, rings=12, scale=(l / 2, 0.42, 0.3))
        W.append(bag)
        for s in (-0.3, 0.0, 0.3):
            P.append(kit.torus("bag_strap", 0.34, 0.012, loc=(x + s * l, WY - 0.42, CZ - 0.42), rot=(0, PI / 2, 0), m="fabric_bag", seg=16, rseg=4))
    # front-right: survey desk, the terminal on an arm from the ceiling, a small status box with a red read-out
    P.append(box("desk_top", (1.9, 0.75, 0.05), loc=(5.05, WY - 0.38, FZ + 0.76), m="int_panel_light", bevel=0.01))
    P.append(box("desk_body", (0.5, 0.7, 0.72), loc=(5.75, WY - 0.38, FZ + 0.37), m="int_panel_mid", bevel=0.01))
    for x in (4.2,):
        P.append(box("desk_leg", (0.05, 0.6, 0.74), loc=(x, WY - 0.38, FZ + 0.37), m="metal_gray"))
    P.append(box("keyboard", (0.5, 0.18, 0.025), loc=(4.85, WY - 0.55, FZ + 0.8), m="console_dark", bevel=0.005))
    P.append(box("core_log_book", (0.25, 0.3, 0.03), loc=(5.45, WY - 0.5, FZ + 0.8), m="console_beige"))
    # monitor arm: ceiling mount, two links, monitor tilted toward the desk
    mx, my = 4.85, WY - 0.75
    P.append(cyl("arm_mount", 0.08, 0.06, loc=(mx, my + 0.2, CZ - 0.03), m="metal_gray", verts=12))
    P.append(kit.tube("arm_link", [(mx, my + 0.2, CZ - 0.05), (mx, my + 0.1, CZ - 0.55), (mx, my - 0.05, CZ - 0.95)], 0.03, m="metal_gray", seg=8))
    mon = box("monitor", (0.62, 0.06, 0.42), loc=(mx, my - 0.08, CZ - 1.18), rot=(0.25, 0, 0), m="console_dark", bevel=0.015)
    P.append(mon)
    scr = box("monitor_screen", (0.56, 0.01, 0.36), loc=(mx, my - 0.115, CZ - 1.17), rot=(0.25, 0, 0), m="emit_screen_amber")
    P.append(scr)
    hit("terminal", (0.7, 0.3, 0.55), (mx, my - 0.08, CZ - 1.18), root, interact="lazarus", iid="mann_terminal")
    P.append(box("status_box", (0.4, 0.18, 0.22), loc=(5.6, WY - 0.12, CZ - 0.45), m="int_panel_light", bevel=0.01))
    P.append(box("status_led", (0.16, 0.01, 0.05), loc=(5.52, WY - 0.215, CZ - 0.42), m="emit_red"))
    col("desk", (5.05, WY - 0.38, FZ + 0.4), (1.95, 0.76, 0.8), root)
    # front bulkhead: vent grilles and pipes (the end-cap machinery behind it)
    for (y, z) in ((-1.2, 2.2), (0.0, 2.2), (-1.2, 1.2)):
        P.append(box("fb_grille", (0.03, 0.8, 0.6), loc=(xb - 0.02, y, FZ + z - 0.4), m="int_panel_dark", bevel=0.01))
        for k in range(6):
            P.append(box("fb_slat", (0.035, 0.74, 0.02), loc=(xb - 0.04, y, FZ + z - 0.65 + k * 0.1), m="metal_gray"))
    for y in (0.8, 1.0):
        P.append(kit.tube("fb_pipe", [(xb - 0.1, y, FZ + 0.1), (xb - 0.1, y, CZ - 0.4), (xb - 0.6, y, CZ - 0.15)], 0.04, m="pipe_blue" if y < 0.9 else "metal_brushed", seg=8))

    # ------------------------------------------------------------------ cryo pod (the sleeper)
    px, py = 2.85, -0.05
    pl, pw = 2.35, 1.05
    P.append(box("pod_plinth", (pl - 0.3, pw - 0.25, 0.16), loc=(px, py, FZ + 0.08), m="metal_dark", bevel=0.02))
    body = box("pod_body", (pl, pw, 0.6), loc=(px, py, FZ + 0.16 + 0.3), m="plastic_white", bevel=0.09, segs=3)
    W.append(body)
    # recessed side slots and latches (both long sides), hinge blocks along +Y edge
    for sy in (-1, 1):
        for k in range(4):
            x = px - pl / 2 + 0.35 + k * (pl - 0.7) / 3
            P.append(box("pod_slot", (0.26, 0.02, 0.07), loc=(x, py + sy * (pw / 2 + 0.002), FZ + 0.5), m="plastic_dark"))
            P.append(box("pod_latch", (0.12, 0.05, 0.1), loc=(x, py + sy * (pw / 2 + 0.02), FZ + 0.72), m="plastic_white", bevel=0.015))
            P.append(box("pod_latch_pin", (0.14, 0.03, 0.03), loc=(x, py + sy * (pw / 2 + 0.04), FZ + 0.72), m="metal_gray"))
    for x in (px - pl / 2 + 0.25, px + pl / 2 - 0.25):
        P.append(box("pod_hinge_blk", (0.22, 0.12, 0.14), loc=(x, py + pw / 2 + 0.03, FZ + 0.78), m="plastic_white", bevel=0.02))
        P.append(cyl("pod_hinge_pin", 0.035, 0.3, loc=(x, py + pw / 2 + 0.03, FZ + 0.82), rot=(0, PI / 2, 0), m="metal_gray", verts=10))
    # foot-end control panel (interaction target) and coolant hoses into the floor
    P.append(box("pod_panel", (0.04, 0.5, 0.28), loc=(px + pl / 2 + 0.02, py - 0.15, FZ + 0.52), rot=(0, 0.25, 0), m="console_dark", bevel=0.01))
    P.append(box("pod_screen", (0.01, 0.4, 0.18), loc=(px + pl / 2 + 0.045, py - 0.15, FZ + 0.54), rot=(0, 0.25, 0), m="emit_screen"))
    P.append(box("pod_btn", (0.02, 0.06, 0.04), loc=(px + pl / 2 + 0.05, py + 0.2, FZ + 0.5), m="emit_green"))
    hit("pod_panel", (0.35, 0.7, 0.5), (px + pl / 2 + 0.1, py - 0.05, FZ + 0.55), root, interact="lazarus", iid="mann_pod")
    for k, y in enumerate((-0.3, -0.15)):
        P.append(kit.tube("pod_hose", [(px - pl / 2 - 0.02, py + y, FZ + 0.4), (px - pl / 2 - 0.3, py + y, FZ + 0.25), (px - pl / 2 - 0.45, py + y + 0.1, FZ - 0.05)], 0.035, m="rubber_black", seg=8))
    col("pod", (px, py, FZ + 0.45), (pl, pw + 0.1, 0.9), root)
    # lid: separate node hinged on the +Y edge (rotates about X at runtime)
    hinge = empty("pod_hinge", loc=(px, py + pw / 2 - 0.02, FZ + 0.82), parent=root)
    lid = [box("lid_slab", (pl - 0.06, pw - 0.04, 0.16), loc=(0, -(pw - 0.04) / 2 + 0.02, 0.06), m="plastic_white", bevel=0.06, segs=3)]
    lid.append(box("lid_frost", (pl - 0.34, pw - 0.3, 0.05), loc=(0, -(pw - 0.04) / 2 + 0.02, 0.15), m="frost", bevel=0.025))
    # frost crust: irregular lumps on top
    for i in range(26):
        fx = R.uniform(-pl / 2 + 0.25, pl / 2 - 0.25)
        fy = -(pw - 0.04) / 2 + R.uniform(-0.32, 0.32)
        lid.append(kit.sphere("frost_lump", R.uniform(0.05, 0.12), loc=(fx, fy, 0.16), m="frost", segs=8, rings=5, scale=(1.6, 1.0, 0.25)))
    lid.append(box("lid_window", (0.42, 0.3, 0.03), loc=(-pl / 2 + 0.45, -(pw - 0.04) / 2 + 0.02, 0.17), m="glass_dark", bevel=0.012))
    lid.append(box("lid_seal", (pl - 0.02, pw, 0.025), loc=(0, -(pw - 0.04) / 2 + 0.02, -0.02), m="rubber_black"))
    for x in (-pl / 2 + 0.25, pl / 2 - 0.25):
        lid.append(box("lid_handle", (0.24, 0.05, 0.05), loc=(x, -(pw - 0.04) + 0.02, 0.06), m="metal_gray", bevel=0.01))
    lm = merge(lid, "pod_lid", par=hinge)
    finish(lm, 40)

    # ------------------------------------------------------------------ airlock / suit room (x -8.2 .. -3)
    for i, y in enumerate((-1.6, -0.55, 0.5, 1.55)):
        W.append(box("suit_locker", (0.55, 0.95, 2.1), loc=(xa + 0.3, y, FZ + 1.05), m="plastic_white", bevel=0.015))
        P.append(box("suit_locker_slot", (0.02, 0.6, 0.04), loc=(xa + 0.58, y, FZ + 1.75), m="hull_seam"))
        P.append(box("suit_locker_grip", (0.03, 0.03, 0.3), loc=(xa + 0.59, y + 0.35, FZ + 1.1), m="plastic_dark"))
    col("suit_lockers", (xa + 0.3, 0, FZ + 1.05), (0.6, 4.2, 2.1), root)
    # helmet shelf and helmets
    P.append(box("helmet_shelf", (0.35, 1.6, 0.03), loc=(xa + 0.8, 1.35, FZ + 1.55), m="metal_gray"))
    for y in (0.9, 1.6):
        P.append(kit.sphere("spare_helmet", 0.17, loc=(xa + 0.8, y, FZ + 1.73), m="suit_white", segs=16, rings=10))
        P.append(kit.sphere("spare_visor", 0.13, loc=(xa + 0.93, y, FZ + 1.74), m="glass_dark", segs=12, rings=8, scale=(0.6, 1.0, 0.8)))
    # bench
    P.append(box("bench", (1.6, 0.45, 0.06), loc=(-5.6, WY - 0.3, FZ + 0.45), m="int_panel_light", bevel=0.01))
    for x in (-6.2, -5.0):
        P.append(box("bench_leg", (0.05, 0.4, 0.42), loc=(x, WY - 0.3, FZ + 0.21), m="metal_gray"))
    col("bench", (-5.6, WY - 0.3, FZ + 0.25), (1.6, 0.45, 0.5), root)
    # ice-core rack on the +Y wall above the bench: tubes of ice, oldest at the top
    for r_ in range(3):
        P.append(box("core_shelf", (2.4, 0.3, 0.025), loc=(-5.6, WY - 0.16, FZ + 1.3 + r_ * 0.38), m="metal_gray"))
        for k in range(4):
            P.append(cyl("ice_core", 0.05, 0.5, loc=(-6.5 + k * 0.6, WY - 0.16, FZ + 1.37 + r_ * 0.38), rot=(0, PI / 2, 0), m="ice", verts=10))
    # red equipment bag and a hose reel by the outer door
    P.append(box("red_duffel", (0.7, 0.35, 0.32), loc=(-7.2, WY - 0.3, FZ + 0.16), m="fabric_red", bevel=0.1))
    P.append(cyl("hose_reel", 0.3, 0.15, loc=(-3.6, WY - 0.1, FZ + 1.4), rot=(PI / 2, 0, 0), m="warning_red", verts=18))
    # rooms
    rv = box("ROOM_mann_main", (xb - xp, 2 * WY, CZ - FZ), loc=((xb + xp) / 2, 0, (FZ + CZ) / 2), m="frame_black", par=root, room="mann_main")
    rv.hide_render = True
    rv = box("ROOM_mann_lock", (xp - xa, 2 * WY, CZ - FZ), loc=((xp + xa) / 2, 0, (FZ + CZ) / 2), m="frame_black", par=root, room="mann_airlock")
    rv.hide_render = True
    # interior lights
    for (x, y) in ((-1.3, 0.0), (1.6, 0.0), (4.6, 0.3)):
        lights.append(empty(f"light_int_{len(lights)}", loc=(x, y, CZ - 0.35), parent=root, light="cool", group="int", intensity=1.5, distance=7))
    lights.append(empty(f"light_int_{len(lights)}", loc=(-5.6, 0.0, CZ - 0.35), parent=root, light="cool", group="int", intensity=1.2, distance=6))


# ================================================================================================ ground
NOSE = ((6.0, 0.0), (8.2, 0.0), (8.62, 0.12), (8.95, 0.36), (9.18, 0.72), (9.3, 1.05))


def nose_d(x):
    for (xa, da), (xb, db) in zip(NOSE, NOSE[1:]):
        if xa <= x <= xb:
            return da + (db - da) * (x - xa) / (xb - xa)
    return 0.0


def shell_top(x, y):
    """outer shell height at (x, y) or None outside the hab footprint"""
    if x < SEGS[-1][1] - 0.45 or x > 9.3:
        return None
    if CAP["x0"] < x:
        d = nose_d(x)
        W, H, r = CAP["W"] - 2 * d, CAP["H"] - d, max(0.3, CAP["r"] - 0.7 * d)
    else:
        s = seg_at(x)
        W, H, r = s[3], s[4], s[5]
    if abs(y) > W / 2:
        return None
    return camp.profile_z(arch_pts(W, H, r), y)


def drift_h(x, y):
    """wind-packed snow: deep against the back (+Y) and the rear end, a bank by the porch's far corner"""
    s = smoothstep(y, -2.0, 2.0)
    a_back = 1.4 + 2.9 * smoothstep(-x, -6.0, 7.0)
    a_front = 3.4 * smoothstep(-x, 5.9, 7.6)
    A = a_front + (a_back - a_front) * s
    A = max(A, 4.0 * smoothstep(-x, 8.0, 9.3))
    A *= 1.0 - 0.8 * smoothstep(x, 6.0, 9.0)
    # distance outside the footprint
    dx = max(-8.75 - x, 0.0, x - 9.3)
    W = (CAP["W"] - 2 * nose_d(x) if x > CAP["x0"] else seg_at(x)[3]) / 2
    dy = max(abs(y) - W, 0.0)
    d = math.hypot(dx, dy)
    nz = 0.18 * n2(x, y, 0.35, 3) + 0.08 * n2(x, y, 1.1, 4)
    if d <= 0.0:
        top = shell_top(x, y)
        if top is None:
            return -0.5
        # the airlock porch stays clear: no drift surface across its opening
        if y < 0 and PORCH[0] - 0.4 < x < PORCH[1] + 0.4:
            return None
        # band just inside the wall: meets the drift outside (the part above it hides in the wall cavity)
        if abs(y) > W - 0.4:
            return min(A, top - 0.05)
        roof = 0.32 * smoothstep(-x, 5.4, 7.6) + 0.25 * smoothstep(y, 0.5, 2.5) * smoothstep(-x, 5.0, 7.0) + (0.13 * n2(x, y, 0.9, 5) - 0.05) * smoothstep(-x, 1.0, 3.0) - 0.05 * (1 - smoothstep(-x, 1.0, 3.0))
        if roof > 0.0:
            return top + roof
        if abs(y) < WY + 0.05:
            return top - 0.12
        return min(A, top - 0.05)
    # sastrugi-like ridges on the drift's flank, a sharp wind-cut lip near its crest
    L = 1.7 * A + 0.8
    f = (1.0 - smoothstep(d, 0.0, L)) ** 1.35
    h = A * f + nz * f + 0.05 * math.sin(x * 1.3 + y * 0.6) * f
    return h if h > 0.02 else -0.05


def ground(root, Gs, Gi, Gc, snap):
    """Gs: snow, Gi: ice (shelf, slabs), Gc: dark cracks. The cliff goes into the snap node."""
    # ice shelf the hab stands on: jagged front edge
    pts = []
    for i in range(26):
        x = -11.5 + 24.0 * i / 25
        pts.append((x, -4.3 + 0.35 * n2(x, 0, 0.7, 7) + 0.25 * math.sin(x * 1.7)))
    pts += [(12.5, 1.0), (12.0, 8.0), (-11.0, 8.5), (-12.2, 1.0)]
    shelf = prism("ice_shelf", list(reversed(pts)) if kit.poly_area(pts) < 0 else pts, -0.6, SHELF, m="ice")
    kit.add_bevel(shelf, 0.05, 1, 50)
    Gi.append(shelf)
    # in front of the shelf: two crevasses and their side cracks (dark ribbons on the ice), broken shards along them
    def jag(x0, x1, yfun, step=0.45):
        pts = []
        x = x0
        while x <= x1 + 1e-6:
            pts.append((x, yfun(x) + R.uniform(-0.12, 0.12)))
            x += step * R.uniform(0.7, 1.3)
        return pts
    cracks = [(jag(-13.0, 13.0, lambda x: -8.2 + 0.9 * math.sin(x * 0.27 + 0.6)), 0.34),
              (jag(-11.0, 10.5, lambda x: -12.6 + 0.7 * math.sin(x * 0.33 - 1.0)), 0.26)]
    for k in range(9):
        x0 = R.uniform(-11, 10)
        ya = -8.2 + 0.9 * math.sin(x0 * 0.27 + 0.6)
        up = k % 2 == 0
        L_ = R.uniform(1.6, 3.4)
        ang = R.uniform(-0.6, 0.6) + (PI / 2 if up else -PI / 2)
        pts = [(x0, ya)]
        for s_ in range(1, 6):
            t = s_ / 5
            pts.append((x0 + math.cos(ang) * L_ * t + R.uniform(-0.1, 0.1), ya + math.sin(ang) * L_ * t + R.uniform(-0.1, 0.1)))
        cracks.append((pts, R.uniform(0.04, 0.09)))
    for k, (pts, w) in enumerate(cracks):
        Gc.append(camp.ribbon("crack", pts, w, 0.012 if k < 2 else 0.008, "crevasse" if k < 2 else "ice_cliff"))
    # broken plates lining both lips of each crevasse, tipped up toward the crack
    for (pts, w) in cracks[:2]:
        for side in (-1, 1):
            i = 0
            while i < len(pts) - 2:
                j = min(len(pts) - 1, i + R.randint(2, 4))
                if R.random() < 0.55:
                    i = j
                    continue
                a_ = V(pts[i]); b_ = V(pts[j])
                t = (b_ - a_).normalized()
                nrm = V((-t.y, t.x)) * side
                depth = R.uniform(0.5, 1.3)
                off = w / 2 + R.uniform(0.02, 0.08)
                poly = [tuple(a_ + nrm * off + t * 0.05), tuple(b_ + nrm * off - t * 0.05),
                        tuple(b_ + nrm * (off + depth * R.uniform(0.8, 1.1)) - t * R.uniform(0.1, 0.4)),
                        tuple(a_ + nrm * (off + depth * R.uniform(0.8, 1.1)) + t * R.uniform(0.1, 0.4))]
                if kit.poly_area(poly) < 0:
                    poly.reverse()
                lift = R.uniform(0.15, 0.38) if R.random() < 0.35 else R.uniform(0.02, 0.08)
                pl = prism("plate", poly, -0.35, 0.05, m="ice_slab")
                # tip the plate up along its crack edge: raise the verts near the crack
                mid = (a_ + b_) / 2 + nrm * off
                for v in pl.data.vertices:
                    dd = (V((v.co.x, v.co.y)) - mid).dot(nrm)
                    v.co.z += lift * max(0.0, 1.0 - dd / max(depth, 0.1))
                kit.add_bevel(pl, 0.02, 1, 50)
                Gi.append(pl)
                i = j
    # the drift (it also blankets the rear roof)
    Gs.append(heightgrid("drift", -19.0, 11.5, -7.5, 13.5, 92, 63, drift_h, "snow_drift"))
    # the cliff behind: steep, streaked ice face, its top rolling back down (a ridge), sunk below the pad
    def cliff_h(x, y):
        yf = -2.5 + 1.6 * n2(x, 0, 0.11, 11)
        Hc = 12.0 + 3.5 * n2(x, 0, 0.07, 12)
        taper = smoothstep(28.0 - abs(x), 0.0, 10.0)
        f = smoothstep(y, yf - 1.0, yf + 2.2)
        back = 1.0 - smoothstep(y, 8.0, 14.0)
        h = -1.8 + (Hc + 1.8 + 1.4 * n2(x, y, 0.2, 13) + 0.5 * n2(x, y, 0.6, 15)) * f * back * taper
        # vertical flutes and ledges on the face
        h += 0.6 * f * (1 - f) * 4 * math.sin(x * 2.1 + 2.0 * n2(x, y, 0.5, 14))
        h += 0.8 * f * (1 - f) * 4 * n2(x, y, 0.9, 16)
        return h
    cl = heightgrid("cliff", -28.0, 28.0, -9.0, 14.0, 112, 54, cliff_h, "ice_cliff", par=snap)
    set_props(cl, col="mesh")
    return cl


# ================================================================================================ exterior props
def props(root, P, Lx, lights):
    # ice-core drill derrick: tripod, crown sheave, drill string into the ice, motor, platform, winch
    dx, dy = -0.5, -7.4
    apex = V((dx, dy, 4.7))
    for k in range(3):
        a = k * 2 * PI / 3 + 0.4
        foot = V((dx + math.cos(a) * 1.55, dy + math.sin(a) * 1.55, 0.12))
        P.append(kit.tube("derrick_leg", [tuple(foot), tuple(apex)], 0.055, m="steel_painted_yellow", seg=8))
        P.append(box("derrick_foot", (0.3, 0.3, 0.06), loc=tuple(foot), m="metal_dark"))
        mid = foot.lerp(apex, 0.35)
        nxt = V((dx + math.cos(a + 2 * PI / 3) * 1.55, dy + math.sin(a + 2 * PI / 3) * 1.55, 0.12)).lerp(apex, 0.35)
        P.append(kit.tube("derrick_brace", [tuple(mid), tuple(nxt)], 0.03, m="steel_painted_yellow", seg=6))
    P.append(box("derrick_crown", (0.4, 0.4, 0.3), loc=(dx, dy, 4.75), m="metal_dark", bevel=0.02))
    P.append(kit.torus("derrick_sheave", 0.22, 0.03, loc=(dx, dy + 0.0, 4.55), rot=(PI / 2, 0, 0), m="metal_gray", seg=16, rseg=6))
    P.append(cyl("drill_string", 0.045, 4.6, loc=(dx, dy, 2.0), m="metal_brushed", verts=10))
    P.append(box("drill_motor", (0.36, 0.36, 0.6), loc=(dx, dy, 2.3), m="paint_charcoal", bevel=0.03))
    P.append(cyl("drill_collar", 0.18, 0.12, loc=(dx, dy, 0.06), m="metal_dark", verts=16))
    P.append(cyl("platform", 0.95, 0.05, loc=(dx, dy, 0.14), m="int_grate", verts=24))
    P.append(box("winch", (0.6, 0.45, 0.5), loc=(dx + 1.6, dy + 0.9, 0.25), m="paint_charcoal", bevel=0.03))
    P.append(cyl("winch_drum", 0.16, 0.5, loc=(dx + 1.6, dy + 0.9, 0.62), rot=(0, PI / 2, 0), m="metal_gray", verts=14))
    P.append(kit.tube("winch_cable", [(dx + 1.6, dy + 0.9, 0.75), (dx + 0.1, dy, 4.5)], 0.008, m="rubber_black", seg=4))
    col("derrick", (dx, dy, 1.2), (1.2, 1.2, 2.4), root)
    # core tray on trestles beside it
    tx, ty = dx + 2.6, dy - 1.2
    P.append(box("core_tray", (2.6, 0.5, 0.1), loc=(tx, ty, 0.82), m="metal_gray", bevel=0.01))
    for sx in (-1.0, 1.0):
        P.append(box("trestle", (0.08, 0.5, 0.78), loc=(tx + sx, ty, 0.39), m="metal_dark"))
    for k in range(3):
        P.append(cyl("tray_core", 0.055, 0.75, loc=(tx - 0.85 + k * 0.85, ty - 0.12, 0.92), rot=(0, PI / 2, 0), m="ice", verts=12))
        P.append(cyl("tray_core", 0.055, 0.6, loc=(tx - 0.8 + k * 0.85, ty + 0.12, 0.92), rot=(0, PI / 2, 0), m="ice", verts=12))
    col("core_tray", (tx, ty, 0.45), (2.6, 0.55, 0.9), root)
    # supply sled with strapped cases and a drum
    sx_, sy_ = 5.2, -8.6
    for e in (-0.55, 0.55):
        P.append(kit.tube("sled_runner", [(sx_ - 1.5, sy_ + e, 0.08), (sx_ + 1.2, sy_ + e, 0.08), (sx_ + 1.5, sy_ + e, 0.3)], 0.04, m="metal_gray", seg=6))
    P.append(box("sled_deck", (2.7, 1.25, 0.05), loc=(sx_, sy_, 0.24), m="wood_gray"))
    P.extend(camp.crate("sled_case", (0.9, 0.6, 0.5), (sx_ - 0.7, sy_, 0.51), 0.0, m="fabric_orange"))
    P.extend(camp.crate("sled_case", (0.8, 0.55, 0.45), (sx_ + 0.3, sy_ + 0.2, 0.49), 0.1, m="plastic_white"))
    P.extend(camp.drum("sled_drum", 0.28, 0.85, (sx_ + 0.9, sy_ - 0.3, 0.26), m="steel_painted_gray"))
    P.append(box("sled_strap", (2.4, 0.04, 0.02), loc=(sx_ - 0.2, sy_ - 0.3, 0.77), m="fabric_orange"))
    col("sled", (sx_, sy_, 0.55), (3.0, 1.3, 1.1), root)
    # finned power unit by the end-cap and its cable
    ux, uy = 11.3, 2.6
    P.append(box("pu_skid", (1.6, 1.6, 0.12), loc=(ux, uy, 0.26), m="metal_dark"))
    P.append(cyl("pu_core", 0.36, 1.3, loc=(ux, uy, 0.97), m="metal_gunmetal", verts=20))
    for k in range(12):
        a = k * PI / 6
        P.append(box("pu_fin", (0.5, 0.025, 1.15), loc=(ux + math.cos(a) * 0.5, uy + math.sin(a) * 0.5, 0.97), rot=(0, 0, a), m="radiator_black"))
    P.append(cyl("pu_band", 0.38, 0.1, loc=(ux, uy, 1.5), m="warning_yellow", verts=20))
    P.append(kit.tube("pu_cable", [(ux - 0.4, uy, 0.3), (10.0, uy - 0.3, 0.22), (9.4, 1.5, 0.35)], 0.04, m="rubber_black", seg=8))
    col("pu", (ux, uy, 0.85), (1.6, 1.6, 1.7), root)
    # antenna mast and dish on the forward roof
    P.append(cyl("ant_mast", 0.05, 1.4, loc=(4.0, 1.3, 5.6), m="metal_gray", verts=10))
    dish = lathe("ant_dish", [(0.0, 0.0), (0.2, 0.02), (0.4, 0.08), (0.55, 0.16), (0.56, 0.18), (0.0, 0.03)], m="paint_white_aero", seg=24)
    dish.location = (4.0, 1.3, 6.25)
    dish.rotation_euler = (0.9, 0, 0.6)
    P.append(dish)
    P.append(cyl("ant_whip", 0.012, 2.2, loc=(3.4, 1.6, 6.0), m="metal_dark", verts=6))
    # weather mast by the cap: anemometer cups
    P.append(cyl("wx_mast", 0.035, 3.0, loc=(9.8, -2.7, 1.5), m="metal_gray", verts=8))
    for k in range(3):
        a = k * 2 * PI / 3
        P.append(cyl("wx_arm", 0.01, 0.3, loc=(9.8 + math.cos(a) * 0.15, -2.7 + math.sin(a) * 0.15, 3.0), rot=(PI / 2, 0, a + PI / 2), m="metal_gray", verts=4))
        P.append(kit.sphere("wx_cup", 0.05, loc=(9.8 + math.cos(a) * 0.3, -2.7 + math.sin(a) * 0.3, 3.0), m="plastic_white", segs=8, rings=6))
    # cable from the derrick to the porch, half sunk in the snow
    P.append(kit.tube("ext_cable", [(dx + 0.4, dy + 0.4, 0.05), (-2.0, -5.5, 0.05), (-3.2, -4.0, 0.24), (-3.5, -2.9, 0.4)], 0.035, m="rubber_black", seg=6))
    # flood lamps
    lamp_post("flood_a", (-7.9, -5.4, 0.0), 3.6, (-4.1, -2.6, 1.0), P, Lx, lights, root, "ext", intensity=12.0, distance=20.0)
    lamp_post("flood_b", (7.0, -6.4, 0.0), 3.8, (8.5, -1.5, 2.0), P, Lx, lights, root, "ext", intensity=12.0, distance=20.0)
    # beacon mast position (the strobe is made at runtime), stake flags along the path from the porch
    empty("spot_beacon", loc=(-11.2, 3.6, 0.0), parent=root)
    for i, (x, y) in enumerate(((-4.6, -6.0), (-3.6, -8.6), (-1.9, -11.2), (0.6, -13.4))):
        P.append(cyl("stake", 0.015, 1.3, loc=(x, y, 0.65), m="metal_dark", verts=6))
        P.append(box("stake_flag", (0.25, 0.01, 0.16), loc=(x + 0.13, y, 1.2), m="fabric_orange"))


def colliders(root):
    x0, x1 = SEGS[-1][1] - 0.4, 9.4
    for sy in (-1, 1):
        if sy > 0:
            col("hab_side_p", ((x0 + x1) / 2, sy * 2.95, 1.7), (x1 - x0, 1.35, 3.4), root)
        else:
            col("hab_side_m_a", ((x0 + PORCH[0]) / 2, -2.95, 1.7), (PORCH[0] - x0, 1.35, 3.4), root)
            col("hab_side_m_b", ((PORCH[1] + x1) / 2, -2.95, 1.7), (x1 - PORCH[1], 1.35, 3.4), root)
    col("hab_roof", ((x0 + x1) / 2, 0, (CZ + 5.4) / 2 + 0.05), (x1 - x0, 7.2, 5.4 - CZ), root)
    col("hab_rear", (x0 - 0.0, 0, 2.0), (0.6, 6.0, 4.0), root)
    col("hab_front", (7.75, 0, 2.4), (3.3, 6.4, 4.8), root)
    col("hab_floor", ((-8.25 + 6.1) / 2, 0, FZ - 0.2), (14.4, 2 * WY + 0.4, 0.4), root)
    # porch bulkhead either side of the door, and above it
    col("bh_a", ((PORCH[0] + DOOR_X - 0.52) / 2, -2.43, 1.5), (DOOR_X - 0.52 - PORCH[0], 0.3, 3.0), root)
    col("bh_b", ((DOOR_X + 0.52 + PORCH[1]) / 2, -2.43, 1.5), (PORCH[1] - DOOR_X - 0.52, 0.3, 3.0), root)
    col("bh_top", (DOOR_X, -2.43, FZ + 2.08 + 0.5), (1.05, 0.3, 1.0), root)
    col("porch_step", (DOOR_X, -2.9, 0.175), (1.5, 0.85, 0.35), root)


# ================================================================================================ build
def build(preview=True):
    kit.reset()
    root = empty("MannCamp")
    set_props(root, site="mann_camp")
    P, D, Wt, L, F, Lx, lights = [], [], [], [], [], [], []
    Gs, Gi, Gc = [], [], []
    hab(root, P, D)
    doors(root)
    PI_ = []
    interior(root, PI_, Wt, L, F, lights)
    snap = empty("snap_cliff", loc=(0, 18.0, 0), parent=root, snap=1)
    cliff = ground(root, Gs, Gi, Gc, snap)
    PX = []
    props(root, PX, Lx, lights)
    colliders(root)
    # spots and waypoints
    for (nm, p) in (("spot_mann", (2.7, 1.05, FZ)), ("spot_pod", (4.6, -0.9, FZ)), ("spot_main", (0.5, 0.2, FZ)), ("spot_lock", (-5.6, -0.6, FZ)),
                    ("spot_porch", (DOOR_X, -4.6, SHELF)), ("spot_view", (-2.0, -16.0, 0.0)),
                    ("nav_main", (-2.3, 0.0, FZ)), ("nav_inner", (-3.7, 0.0, FZ)), ("nav_lock", (DOOR_X, -1.3, FZ)), ("nav_outer", (DOOR_X, -3.4, 0.35)), ("nav_porch", (DOOR_X, -5.2, SHELF))):
        empty(nm, loc=p, parent=root)
    hull = merge(P, "mann_hab", par=root, exterior=1)
    finish(hull, 40)
    det = merge(D, "mann_hab_detail", par=root)
    finish(det, 30)
    it = merge(PI_, "mann_interior", par=root)
    finish(it, 30)
    wt = merge(Wt, "mann_interior_white", par=root)
    finish(wt, 35)
    lm = merge(L, "lamps_int", par=root, group="int", lampmesh=1)
    finish(lm, 30)
    fl = merge(F, "lamps_floor", par=root, group="floor", lampmesh=1)
    finish(fl, 30)
    lx = merge(Lx, "lamps_ext", par=root, group="ext", lampmesh=1)
    finish(lx, 30)
    px = merge(PX, "mann_props", par=root)
    finish(px, 35)
    gs = merge(Gs, "mann_snow", par=root, col="mesh")
    finish(gs, 70)
    gi = merge(Gi, "mann_ice", par=root, col="mesh")
    finish(gi, 30)
    gc = merge(Gc, "mann_cracks", par=root)
    finish(gc, 30)
    finish(cliff, 60)
    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)
    kit.export_glb(os.path.join(kit.out_dir(), "mann_camp.glb"), root)
    if preview:
        pd = kit.preview_dir()
        w = (0.62, 0.64, 0.68)
        kit.preview(os.path.join(pd, "mann_camp.png"), (-9.0, -24.0, 4.5), (1.5, 0.0, 2.2), lens=32, samples=24, world=w, sun=(0.3, -0.6, 0.75), sun_strength=2.5, strength=1.0)
        kit.preview(os.path.join(pd, "mann_camp_front.png"), (18.0, -14.0, 3.5), (3.0, 0.0, 2.2), lens=30, samples=24, world=w, sun=(0.3, -0.6, 0.75), sun_strength=2.5, strength=1.0)
        # interior from the front, looking back over the pod (as in the reference)
        kit.preview(os.path.join(pd, "mann_interior.png"), (5.6, -0.9, FZ + 1.6), (-2.8, 0.6, FZ + 1.1), lens=18, samples=32, world=(0.05, 0.05, 0.06), sun=(0.3, -0.6, 0.75), sun_strength=0.0, strength=0.2,
                     hide=[o for o in kit.all_children(root, True) if o.name in ("mann_snow",)])


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
