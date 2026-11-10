"""
Endurance — original model built from reference images 2 (forward-view layout diagram), 3 and 4 (exterior renders)
and their close-up crops (module face, node junction, hub).

What the references show (and what is modelled):
  * Twelve white box modules on a 64 m ring, long axis RADIAL (≈12.5 m radial × 8 m tangential × 7.2 m axial),
    spanning radius ≈19.5 → 32 m. Alternating front faces: panelled modules (twin light blue-grey panel fields running
    radially, 2×2 window cluster and a small grid near the inner end) and plain engine modules.
  * Each module's inner end is a recessed vestibule; above it, on the module's tangential end faces, X-braced vent
    frames read as four dark triangles each (crop m_tr). Faces turned toward the hub are dark machinery.
  * Modules are linked at the inner end by cross-shaped node junctions (crop node_r): a forward-facing drum with a
    round porthole ring holding a landscape rectangular window, boxy rounded tunnel arms to both neighbours, and a
    stepped radial stub pointing outward (four of them are full airlocks with a hatch).
  * Two thick segmented spokes on one diameter run from the inner face of two modules to the central hub, where the
    Rangers (axial ports) and Landers (radial ports) dock.

Layout (forward view, clockwise from 12): habitat, landing pod, engine, habitat, engine, landing pod, cryo-lab,
landing pod, engine, command, engine, landing pod. Spokes on the 3–9 diameter (habitat 3, command 9).

Blender: spin axis = +Y (forward), ring in the XZ plane, origin at the hub. In the forward view (from +Y looking
back) the viewer's right is -X, so clock position c is at (-sin c·30°, 0, cos c·30°).
Nodes: dock_fwd / dock_aft / dock_top / dock_bottom (+Y of each empty points out of the port), module_<k>,
node_<k>, airlock_<k>, engine_<k>_<i> (thrust anchors), rcs_*, navlight_*, antenna_hga.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix
import kit
from kit import V, cyl, prism, empty, merge, finish, set_props, lathe
from farm_house import obox, seg_box

PI = math.pi
R = random.Random(64)
W, PANEL, PANEL_D, DARK, FRAME, EDGE = "paint_white_aero", "endu_panel", "endu_panel_dark", "radiator_black", "metal_gray", "endu_edge"
RI, RV, RO = 19.5, 23.0, 32.0      # module inner face, vestibule/main split, outer face (radius)
HT = 4.0                            # module tangential half width
YF, YB, YV = 3.6, -3.6, 2.0         # main body front / back, vestibule front (recessed)
RN, YN = 22.724, 0.2                # node centre radius (tunnel floor flush with the vestibule floor) and axial position
TH = 1.05                           # tunnel inner half size (2.1 m clear walkway)
RC = RN * math.cos(math.radians(15))  # tunnel centre radius at the module end faces
WALKABLE = (0, 3, 6, 9)             # modules with decks reachable by ladder (habitats, cryo-lab, command)
HATCH = (1.7, 3.1, -3.2, -1.8)      # ladder hatch in the main-body ceiling: t0, t1, y0, y1
WALL = 0.25
AX = V((0, 1, 0))
TYPES = ["habitat", "pod", "engine", "habitat", "engine", "pod", "cryo", "pod", "engine", "command", "engine", "pod"]
AIRLOCKS = (2, 3, 8, 9)


def frame_at(c):
    """Radial (outward) and tangential (clockwise in the forward view) unit vectors for clock position c."""
    a = math.radians(c * 30.0)
    return V((-math.sin(a), 0, math.cos(a))), V((-math.cos(a), 0, -math.sin(a)))


def to_quat(z_to):
    return V((0, 0, 1)).rotation_difference(V(z_to).normalized())


def orient(o, origin, u, v, w):
    """Place an object built in local (x, y, z) onto world axes u, v, w at origin."""
    o.matrix_basis = Matrix(((u.x, v.x, w.x, origin.x), (u.y, v.y, w.y, origin.y), (u.z, v.z, w.z, origin.z), (0, 0, 0, 1)))
    return o


class Fr:
    """Module frame: t (tangential), a (axial, +Y), r (radial); p(tc, yc, rc) -> world point."""
    def __init__(self, c):
        self.r, self.t = frame_at(c)
        self.a = AX

    def p(self, tc, yc, rc):
        return self.t * tc + self.a * yc + self.r * rc

    def box(self, P, name, t0, t1, y0, y1, r0, r1, m):
        o = obox(name, V((0, 0, 0)), self.t, self.a, self.r, t0, t1, y0, y1, r0, r1, m)
        P.append(o)
        return o


def rrect_prism(name, origin, u, v, w, hw, hh, rad, z0, z1, m, segs=3):
    """Rounded rectangle (half sizes hw along u, hh along v) extruded along w from z0 to z1."""
    poly = kit.round_poly([(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)], rad, segs)
    o = prism(name, poly, z0, z1, m=m)
    return orient(o, origin, u, v, w)


def xvent(P, F, tc, yc, rc, size, n):
    """X-braced vent frame on a module end face (outward normal n); reads as four dark triangles (crop m_tr)."""
    h = size / 2
    a, r = F.a, F.r
    c = F.p(tc, yc, rc)
    P.append(obox("xvent_back", c, a, r, n, -h, h, -h, h, -0.01, 0.02, DARK))
    P.append(obox("xvent_frame", c, a, r, n, -h, -h + 0.16, -h, h, 0.0, 0.1, W))
    P.append(obox("xvent_frame", c, a, r, n, h - 0.16, h, -h, h, 0.0, 0.1, W))
    P.append(obox("xvent_frame", c, a, r, n, -h, h, -h, -h + 0.16, 0.0, 0.1, W))
    P.append(obox("xvent_frame", c, a, r, n, -h, h, h - 0.16, h, 0.0, 0.1, W))
    for (d0, d1) in (((-1, -1), (1, 1)), ((-1, 1), (1, -1))):
        p0 = c + a * (d0[0] * (h - 0.1)) + r * (d0[1] * (h - 0.1)) + n * 0.05
        p1 = c + a * (d1[0] * (h - 0.1)) + r * (d1[1] * (h - 0.1)) + n * 0.05
        P.append(seg_box("xvent_brace", p0, p1, 0.2, 0.1, W, up=tuple(n)))


def seams(P, c, u, v, n, du, dv, nu, nv, m="endu_seam"):
    """Panel seam grid on a face centred at c with in-plane axes u, v (half extents du, dv), outward normal n."""
    for i in range(1, nu):
        x = -du + 2 * du * i / nu
        P.append(obox("seam", c + u * x, u, v, n, -0.016, 0.016, -dv, dv, 0.0, 0.008, m))
    for j in range(1, nv):
        y = -dv + 2 * dv * j / nv
        P.append(obox("seam", c + v * y, u, v, n, -du, du, -0.016, 0.016, 0.0, 0.008, m))


def holed_panel(P, F, name, normal, ra, ya, rr, h1, h2, m):
    """Module-frame panel with a rectangular opening. normal 't' (end face): ra = t range, ya = axial y range,
    rr = radial range, hole h1 = y range, h2 = r range. normal 'r' (radial face): ra = t range, ya = y range,
    rr = radial range (thickness), hole h1 = t range, h2 = y range."""
    if normal == "t":
        (t0, t1), (y0, y1), (r0, r1) = ra, ya, rr
        (hy0, hy1), (hr0, hr1) = h1, h2
        hr0, hr1 = max(hr0, r0), min(hr1, r1)
        for (a0, a1, b0, b1) in ((y0, hy0, r0, r1), (hy1, y1, r0, r1), (hy0, hy1, r0, hr0), (hy0, hy1, hr1, r1)):
            if a1 - a0 > 1e-3 and b1 - b0 > 1e-3:
                F.box(P, name, t0, t1, a0, a1, b0, b1, m)
    else:
        (t0, t1), (y0, y1), (r0, r1) = ra, ya, rr
        (ht0, ht1), (hy0, hy1) = h1, h2
        for (a0, a1, b0, b1) in ((t0, ht0, y0, y1), (ht1, t1, y0, y1), (ht0, ht1, y0, hy0), (ht0, ht1, hy1, y1)):
            if a1 - a0 > 1e-3 and b1 - b0 > 1e-3:
                F.box(P, name, a0, a1, b0, b1, r0, r1, m)


def multi_holed(P, F, name, tr, yr, rr, holes, m):
    """Front/back panel (constant y) spanning t × r with several rectangular openings (t0, t1, r0, r1)."""
    (t0, t1), (y0, y1), (r0, r1) = tr, yr, rr
    cuts = sorted({r0, r1, *[h[2] for h in holes], *[h[3] for h in holes]})
    for i in range(len(cuts) - 1):
        b0, b1 = cuts[i], cuts[i + 1]
        if b1 - b0 < 1e-4:
            continue
        active = sorted([(h[0], h[1]) for h in holes if h[2] <= b0 + 1e-6 and h[3] >= b1 - 1e-6])
        x = t0
        for (h0, h1) in active:
            if h0 - x > 1e-4:
                F.box(P, name, x, h0, y0, y1, b0, b1, m)
            x = max(x, h1)
        if t1 - x > 1e-4:
            F.box(P, name, x, t1, y0, y1, b0, b1, m)


def window(P, G, c, u, v, n, hw, hh, frame="metal_gunmetal"):
    P.append(obox("win_frame", c, u, v, n, -hw - 0.07, hw + 0.07, -hh - 0.07, hh + 0.07, -0.02, 0.06, frame))
    G.append(obox("win", c, u, v, n, -hw, hw, -hh, hh, -0.02, 0.075, "glass_dark"))


def module(P, G, root, k):
    kind = TYPES[k]
    F = Fr(k)
    t, a, r = F.t, F.a, F.r
    rm = (RV + RO) / 2
    # ------------------------------------------------------------------ main body shell (room inside: r 23→32)
    F.box(P, "shell_floor", -HT, HT, YB, YF, RO - WALL, RO, W)          # outer face = floor under spin gravity
    if k in WALKABLE:
        holed_panel(P, F, "shell_ceiling", "r", (-HT, HT), (YB, YF), (RV, RV + WALL), HATCH[0:2], HATCH[2:4], W)
    else:
        F.box(P, "shell_ceiling", -HT, HT, YB, YF, RV, RV + WALL, W)
    # front shell with real openings behind the deck windows (so they can be seen through from inside)
    if kind == "command":
        holes = [(-3.0 + i * 1.5 - 0.5, -3.0 + i * 1.5 + 0.5, 28.99, 29.49) for i in range(5)]
    elif kind in ("habitat", "cryo"):
        holes = [(-3.55, -3.05, 29.5, 30.0), (-3.55, -3.05, 30.3, 30.8)]
    else:
        holes = []
    multi_holed(P, F, "shell_front", (-HT, HT), (YF - WALL, YF), (RV, RO), holes, W)
    F.box(P, "shell_back", -HT, HT, YB, YB + WALL, RV, RO, W)
    for s in (-1, 1):
        F.box(P, "shell_end", s * HT - (WALL if s > 0 else 0), s * HT + (0 if s > 0 else WALL), YB, YF, RV, RO, W)
    # vestibule (r 19.5→23), front recessed to YV
    if k in (3, 9):   # spoke entry
        holed_panel(P, F, "vest_inner", "r", (-HT, HT), (YB, YV), (RI, RI + WALL), (-1.3, 1.3), (-1.3, 1.3), W)
    else:
        F.box(P, "vest_inner", -HT, HT, YB, YV, RI, RI + WALL, W)
    F.box(P, "vest_front", -HT, HT, YV - WALL, YV, RI, RV, W)
    F.box(P, "vest_back", -HT, HT, YB, YB + WALL, RI, RV, W)
    for s in (-1, 1):
        holed_panel(P, F, "vest_end", "t", (s * HT - (WALL if s > 0 else 0), s * HT + (0 if s > 0 else WALL)), (YB, YV), (RI, RV),
                    (YN - TH, YN + TH), (RC - TH, RC + TH), W)
    # edge frames: chamfer-like beams along every box edge
    e = 0.11
    for (y, rr) in ((YF, RO), (YB, RO), (YF, RV), (YB, RI), (YV, RI), (YV, RV)):
        F.box(P, "edge_t", -HT, HT, y - e, y + e, rr - e, rr + e, EDGE)
    for s in (-1, 1):
        for (y0, y1, rr) in ((YB, YF, RO), (YB, YV, RI), (YV, YF, RV)):
            F.box(P, "edge_a", s * HT - e, s * HT + e, y0, y1, rr - e, rr + e, EDGE)
        for (y, r0, r1) in ((YF, RV, RO), (YB, RI, RO), (YV, RI, RV)):
            F.box(P, "edge_r", s * HT - e, s * HT + e, y - e, y + e, r0, r1, EDGE)
    # seams
    seams(P, F.p(0, YF, rm), t, r, a, HT, (RO - RV) / 2, 2, 3)
    seams(P, F.p(0, YB, (RI + RO) / 2), t, r, -a, HT, (RO - RI) / 2, 2, 4)
    seams(P, F.p(0, 0, RO), t, a, r, HT, YF, 4, 3)
    for s in (-1, 1):
        seams(P, F.p(s * HT, 0, (RV + RO) / 2), a, r, t * s, YF, (RO - RV) / 2, 2, 3)

    # ------------------------------------------------------------------ front face (+Y) by module type
    def fbox(name, t0, t1, r0, r1, z0, z1, m):
        F.box(P, name, t0, t1, YF + z0, YF + z1, r0, r1, m)

    if kind != "engine":
        # twin panel fields along the radial, slightly offset toward the clockwise side (crop m_tr)
        for tc in (-0.55, 1.95):
            r0, r1 = 25.2, 31.3
            fbox("panel_frame", tc - 1.15, tc + 1.15, r0 - 0.12, r1 + 0.12, 0.0, 0.05, EDGE)
            fbox("panel_field", tc - 1.02, tc + 1.02, r0, r1, 0.0, 0.07, PANEL)
            for j in range(1, 4):
                rr = r0 + (r1 - r0) * j / 4
                fbox("panel_div", tc - 1.02, tc + 1.02, rr - 0.035, rr + 0.035, 0.0, 0.085, FRAME)
            fbox("panel_mullion", tc - 0.03, tc + 0.03, r0, r1, 0.0, 0.08, FRAME)
        # 2×2 window cluster near the inner end, counter-clockwise side; beside it a small grille block
        for (i, j) in ((0, 0), (1, 0), (0, 1), (1, 1)):
            window(P, G, F.p(-2.65 + i * 0.78, YF, 23.75 + j * 0.78), t, r, a, 0.27, 0.27)
        for (i, j) in ((0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)):
            fbox("grille", 0.62 + i * 0.5, 0.98 + i * 0.5, 23.42 + j * 0.5, 23.78 + j * 0.5, 0.0, 0.05, "metal_gunmetal")
        if kind == "command":
            for i in range(5):   # bridge windows above the deck's instrument rack (deck ceiling r 28.85, rack top r 29.63)
                window(P, G, F.p(-3.0 + i * 1.5, YF, 29.24), t, r, a, 0.5, 0.25)
        if kind == "cryo":
            fbox("cryo_stripe", -HT + 0.2, HT - 0.2, 24.75, 24.95, 0.0, 0.05, "warning_yellow")
        if kind in ("habitat", "cryo"):
            # a stacked pair of round portholes at deck eye level (galley reference image 7)
            for rr in (29.75, 30.55):
                pc = F.p(-3.3, YF, rr)
                P.append(cyl("porthole_rim", 0.3, 0.1, loc=pc + a * 0.03, rot=to_quat(a).to_euler(), m="metal_gunmetal", verts=24))
                G.append(cyl("porthole_glass", 0.23, 0.12, loc=pc + a * 0.04, rot=to_quat(a).to_euler(), m="glass_dark", verts=24))
    else:
        # plain engine module front: service hatch, a small dark port, an overlay plate
        fbox("svc_hatch_frame", -2.9, -1.1, 26.0, 28.4, 0.0, 0.04, FRAME)
        fbox("svc_hatch", -2.8, -1.2, 26.1, 28.3, 0.0, 0.06, "hatch_gray")
        fbox("svc_port", 1.6, 2.2, 24.0, 24.6, 0.0, 0.06, DARK)
        fbox("svc_plate", -0.6, 3.2, 29.6, 31.4, 0.0, 0.03, W)
    # vestibule front face plate; the step between vestibule and main body front is dark machinery
    F.box(P, "vest_plate", -2.6, 2.6, YV, YV + 0.04, RI + 0.5, RV - 0.5, "hatch_gray")
    F.box(P, "step_machinery", -HT + 0.3, HT - 0.3, YV + 0.05, YF - 0.05, RV - 0.35, RV - 0.05, DARK)
    for i in range(6):
        tc = -HT + 0.8 + i * (2 * HT - 1.6) / 5
        F.box(P, "step_box", tc - 0.35, tc + 0.35, YV + 0.2, YV + 1.2, RV - 0.75, RV - 0.35, R.choice(["metal_gunmetal", "console_dark", W]))

    # ------------------------------------------------------------------ inner (hub-facing) face: dark machinery
    F.box(P, "inner_field", -HT + 0.4, HT - 0.4, YB + 0.4, YV - 0.4, RI - 0.12, RI, DARK)
    for i in range(7):
        tc = -HT + 0.7 + i * (2 * HT - 1.4) / 6
        F.box(P, "inner_fin", tc - 0.05, tc + 0.05, YB + 0.5, YV - 0.5, RI - 0.45, RI - 0.1, "metal_gunmetal")
    for j in range(3):
        yc = YB + 1.1 + j * 1.6
        P.append(seg_box("inner_pipe", F.p(-HT + 0.3, yc, RI - 0.3), F.p(HT - 0.3, yc, RI - 0.3), 0.14, 0.14, FRAME, up=tuple(r)))
    if k not in (3, 9):   # spokes land on the inner face of the 3 and 9 o'clock modules
        for s in (-1, 1):
            F.box(P, "inner_box", s * 2.6 - 0.8, s * 2.6 + 0.8, -1.6, 0.4, RI - 0.9, RI - 0.1, R.choice(["metal_gunmetal", "console_dark"]))

    # ------------------------------------------------------------------ tangential end faces: X-braced vents
    for s in (-1, 1):
        for yc in (-1.75, 1.75):
            xvent(P, F, s * HT, yc, 25.0, 2.6, t * s)
        # tunnel flange where the node arm lands on the vestibule end face
        holed_panel(P, F, "arm_flange", "t", (s * HT + (0.0 if s > 0 else -0.12), s * HT + (0.12 if s > 0 else 0.0)), (YN - TH - 0.22, YN + TH + 0.22),
                    (RC - TH - 0.22, RC + TH), (YN - TH, YN + TH), (RC - TH, RC + TH), FRAME)

    # ------------------------------------------------------------------ outer face: dark panel inset / heat shield
    if kind == "pod":
        F.box(P, "heat_shield", -HT + 0.4, HT - 0.4, YB + 0.4, YF - 0.4, RO, RO + 0.14, "thermal_tile")
        for (s1, s2) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):   # stowed landing legs
            base = F.p(s1 * (HT - 0.3), s2 * (YF - 0.6), RO + 0.25)
            P.append(seg_box("pod_leg", base, base - t * (s1 * 2.4), 0.26, 0.26, "metal_gunmetal", up=tuple(r)))
            P.append(cyl("pod_foot", 0.42, 0.12, loc=base - t * (s1 * 2.5) + r * 0.05, rot=to_quat(r).to_euler(), m="metal_gunmetal", verts=16))
    else:
        F.box(P, "outer_inset", -HT + 0.45, HT - 0.45, YB + 0.45, YF - 0.45, RO, RO + 0.06, PANEL_D)
        for i in range(1, 4):
            tc = -HT + 0.45 + (2 * HT - 0.9) * i / 4
            F.box(P, "outer_div", tc - 0.04, tc + 0.04, YB + 0.45, YF - 0.45, RO, RO + 0.08, FRAME)
        if kind == "command":
            for i in range(3):
                b = F.p(-2.0 + i * 2.0, 1.0, RO)
                P.append(seg_box("cmd_antenna", b, b + r * (1.4 + i * 0.5), 0.07, 0.07, FRAME, up=(0, 1, 0)))
                P.append(kit.sphere("cmd_antenna_tip", 0.09, loc=b + r * (1.45 + i * 0.5), m="metal_brushed", segs=8, rings=6))
    # ------------------------------------------------------------------ back face (-Y)
    if kind == "engine":
        for (i, tc) in enumerate((-1.95, 1.95)):
            nc = F.p(tc, YB, 28.0)
            F.box(P, "thrust_frame", tc - 1.55, tc + 1.55, YB - 0.45, YB, 26.45, 29.55, "metal_gunmetal")
            bell = lathe("main_bell", [(0.62, 0.0), (0.72, -0.35), (1.0, -1.1), (1.32, -2.1), (1.45, -2.7), (1.5, -2.85),
                                       (1.42, -2.85), (1.36, -2.7), (1.22, -2.1), (0.9, -1.1), (0.55, 0.0)], m="nozzle_inner", seg=40)
            orient(bell, nc - a * 0.45, t, r, a)
            P.append(bell)
            P.append(kit.torus("bell_ring", 1.1, 0.06, loc=nc - a * 1.55, rot=(PI / 2, 0, 0), m="metal_brushed", seg=36, rseg=6))
            for d in (t, r, -t, -r):
                P.append(seg_box("actuator", nc - a * 0.45 + d * 1.3, nc - a * 1.3 + d * 0.95, 0.1, 0.1, "chrome", up=(0, 1, 0) if abs(d.y) < 0.5 else (1, 0, 0)))
            empty(f"engine_{k}_{i}", loc=nc - a * 3.3, rot=(0, 0, PI), parent=root, thrust=1)
        F.box(P, "engine_plate", -HT + 0.6, HT - 0.6, YB - 0.06, YB, RI + 0.8, 25.0, "hatch_gray")
    else:
        for i in range(3):
            F.box(P, "back_vent", -2.4 + i * 1.6 - 0.5, -2.4 + i * 1.6 + 0.5, YB - 0.05, YB, 30.2, 31.2, DARK)
        F.box(P, "back_hatch", -1.0, 1.0, YB - 0.06, YB, 25.0, 27.6, "hatch_gray")

    # ------------------------------------------------------------------ EVA handrails, RCS quads, beacon
    for i in range(3):
        hp = F.p(-HT + 0.9 + i * 2.5, YF, RO - 0.45)
        P.append(seg_box("handrail", hp + a * 0.14, hp + a * 0.14 + t * 1.6, 0.05, 0.05, "warning_yellow", up=(0, 1, 0)))
        for ee in (0.1, 1.5):
            P.append(seg_box("handrail_stand", hp + t * ee, hp + t * ee + a * 0.14, 0.04, 0.04, "warning_yellow", up=tuple(t)))
    for s in (-1, 1):
        q = F.p(s * (HT - 0.45), YF - 0.45, RO + 0.25)
        P.append(obox("rcs_quad", q, t, a, r, -0.32, 0.32, -0.32, 0.32, -0.25, 0.25, "metal_gunmetal"))
        for j, d in enumerate((t * s, a, r, -a)):
            P.append(cyl("rcs_nozzle", 0.065, 0.22, r2=0.09, loc=q + d * 0.4, rot=to_quat(d).to_euler(), m="nozzle_inner", verts=10))
            empty(f"rcs_{k}_{'a' if s < 0 else 'b'}{j}", loc=q + d * 0.5, parent=root, dx=d.x, dy=d.y, dz=d.z)
    P.append(kit.sphere("beacon", 0.1, loc=F.p(0, YF - 0.3, RO + 0.12), m="emit_white" if k % 3 else "emit_red", segs=8, rings=6))
    empty(f"module_{k}", loc=F.p(0, 0, (RV + RO) / 2), parent=root, kind=kind, clock=k)


def node(P, G, root, k):
    """Cross-shaped junction between module k and k+1 (crop node_r)."""
    F = Fr(k + 0.5)
    r, t, a = F.r, F.t, F.a
    N = r * RN + a * YN
    # drum: axis along +Y, ribbed, porthole rings with landscape windows on both caps
    P.append(cyl("node_drum", 1.45, 3.0, loc=N, rot=(PI / 2, 0, 0), m=W, verts=40))
    for s in (-1, 1):
        cap = N + a * (s * 1.5)
        P.append(cyl("node_cap", 1.53, 0.2, loc=cap, rot=(PI / 2, 0, 0), m=FRAME, verts=40))
        P.append(kit.torus("porthole_ring", 0.66, 0.11, loc=cap + a * (s * 0.12), rot=(PI / 2, 0, 0), m=W, seg=32, rseg=8))
        P.append(cyl("porthole_well", 0.6, 0.05, loc=cap + a * (s * 0.1), rot=(PI / 2, 0, 0), m="metal_gunmetal", verts=32))
        G.append(obox("porthole_win", cap + a * (s * 0.11), t, r, a * s, -0.38, 0.38, -0.24, 0.24, 0.0, 0.04, "glass_dark"))
    for yy in (-0.6, 0.6):
        P.append(kit.torus("drum_rib", 1.46, 0.05, loc=N + a * yy, rot=(PI / 2, 0, 0), m=FRAME, seg=40, rseg=6))
    # boxy rounded tunnel arms to both modules (perpendicular to each module's end face)
    for (mk, sgn) in ((k, 1), ((k + 1) % 12, -1)):
        Fm = Fr(mk)
        rc = N.dot(Fm.r)
        tc = N.dot(Fm.t)
        face_t = sgn * HT
        start = Fm.p(face_t, YN, rc)
        L = abs(tc - face_t)
        P.append(rrect_prism("tunnel_arm", start, Fm.a, Fm.r, Fm.t * sgn, TH + 0.1, TH + 0.1, 0.3, 0.0, L, W))
        for ff in (0.08, max(0.2, L * 0.5)):
            P.append(rrect_prism("arm_collar", start, Fm.a, Fm.r, Fm.t * sgn, TH + 0.18, TH + 0.18, 0.34, ff, ff + 0.1, FRAME))
    # stepped outward stub (radial): collar, body, rings, neck, end cap — four nodes carry full airlocks
    base = N + r * 1.4
    airlock = k in AIRLOCKS
    if airlock:
        prof = [(0.0, 0.0), (0.98, 0.0), (0.98, 0.25), (0.86, 0.25), (0.86, 2.6), (0.98, 2.6), (0.98, 2.85), (0.86, 2.85),
                (0.86, 3.4), (0.95, 3.4), (0.95, 3.6), (0.0, 3.6)]
    else:
        prof = [(0.0, 0.0), (0.92, 0.0), (0.92, 0.22), (0.78, 0.22), (0.78, 1.15), (0.92, 1.15), (0.92, 1.35), (0.66, 1.35),
                (0.66, 1.75), (0.8, 1.75), (0.8, 1.92), (0.55, 1.92), (0.55, 2.2), (0.0, 2.2)]
    stub = lathe("node_stub", prof, m=W, seg=32)
    stub.rotation_mode = "QUATERNION"
    stub.rotation_quaternion = to_quat(r)
    stub.location = base
    P.append(stub)
    top = base + r * prof[-1][1]
    if airlock:
        P.append(cyl("airlock_hatch", 0.72, 0.1, loc=top + r * 0.05, rot=to_quat(r).to_euler(), m="hatch_gray", verts=28))
        P.append(kit.torus("airlock_ring", 0.8, 0.07, loc=top + r * 0.06, rot=to_quat(r).to_euler(), m="metal_gunmetal", seg=28, rseg=6))
        G.append(obox("airlock_win", base + r * 1.6 + a * 0.85, t, r, a, -0.22, 0.22, -0.16, 0.16, 0.0, 0.06, "glass_dark"))
        for ee in (1.0, 2.2):
            hp = base + r * ee + t * 0.93
            P.append(seg_box("airlock_rail", hp - a * 0.5, hp + a * 0.5, 0.05, 0.05, "warning_yellow", up=tuple(t)))
        empty(f"airlock_{k}", loc=top, rot=to_quat(r).to_euler(), parent=root)
    else:
        P.append(cyl("stub_cap", 0.4, 0.08, loc=top + r * 0.04, rot=to_quat(r).to_euler(), m="metal_gunmetal", verts=20))
    empty(f"node_{k}", loc=N, parent=root)


def spoke(P, G, s):
    """Thick segmented spoke from the hub to the vestibule inner face of the module at 3 (s=-1, -X) or 9 (s=+1)."""
    x0, x1 = 4.6, RI

    def cx(a, b, rad, m, nm, verts=36):
        # open-ended (no caps): the crew tube runs through the middle (interior lining r 1.3)
        P.append(cyl(nm, rad, b - a, loc=(s * (a + b) / 2, 0, 0), rot=(0, PI / 2, 0), m=m, verts=verts, cap=False))

    def ring_x(x, r0, r1, m):
        o = kit.poly_ring("spoke_step", kit.circle_pts(r1, 36), kit.circle_pts(r0, 36), -0.01, 0.01, m=m)
        o.rotation_euler = (0, PI / 2, 0)
        o.location = (s * x, 0, 0)
        P.append(o)
    # white segments separated by recessed darker necks (refs 3/4)
    for (a, b) in ((x0, 8.6), (9.2, 13.4), (14.0, 18.2)):
        cx(a, b, 1.45, W, "spoke_seg")
        cx(a - 0.02, a + 0.25, 1.55, FRAME, "spoke_collar")
        cx(b - 0.25, b + 0.02, 1.55, FRAME, "spoke_collar")
        for i in range(1, 4):
            xx = a + (b - a) * i / 4
            P.append(kit.torus("spoke_seam", 1.45, 0.025, loc=(s * xx, 0, 0), rot=(0, PI / 2, 0), m="hull_seam", seg=36, rseg=4))
    for (a, b) in ((8.6, 9.2), (13.4, 14.0)):
        cx(a, b, 1.36, "metal_gunmetal", "spoke_neck")
        ring_x(a, 1.36, 1.55, FRAME)
        ring_x(b, 1.36, 1.55, FRAME)
    cx(18.2, x1, 1.38, "metal_gunmetal", "spoke_neck")
    ring_x(18.2, 1.36, 1.55, FRAME)
    cx(x1 - 0.5, x1, 1.75, FRAME, "spoke_root")
    ring_x(x1 - 0.5, 1.36, 1.75, FRAME)
    ring_x(x0, 1.34, 1.55, FRAME)
    # conduits and an EVA rail along the spoke
    for (dy, dz) in ((1.38, 0.5), (-1.38, -0.5)):
        P.append(cyl("spoke_conduit", 0.1, x1 - x0, loc=(s * (x0 + x1) / 2, dy, dz), rot=(0, PI / 2, 0), m="metal_gunmetal", verts=8))
    for i in range(10):
        xx = x0 + 0.6 + i * (x1 - x0 - 1.2) / 9
        P.append(seg_box("spoke_rail_post", (s * xx, 0, 1.4), (s * xx, 0, 1.75), 0.05, 0.05, "warning_yellow", up=(1, 0, 0)))
    P.append(seg_box("spoke_rail", (s * (x0 + 0.6), 0, 1.75), (s * (x1 - 0.6), 0, 1.75), 0.05, 0.05, "warning_yellow"))
    for j in range(3):   # small windows on the first segment (crew transit tube)
        G.append(obox("spoke_win", V((s * (5.6 + j * 1.0), 1.44, 0.0)), V((1, 0, 0)), V((0, 0, 1)), V((0, 1, 0)), -0.18, 0.18, -0.12, 0.12, 0.0, 0.04, "glass_dark"))


def hub(P, G, root):
    # central body: a drum along the spoke axis with chamfered ends
    P.append(cyl("hub_drum", 2.5, 7.2, rot=(0, PI / 2, 0), m=W, verts=48, cap=False))
    for s in (-1, 1):
        P.append(cyl("hub_flange", 2.72, 0.3, loc=(s * 3.55, 0, 0), rot=(0, PI / 2, 0), m=FRAME, verts=48, cap=False))
        fr = kit.poly_ring("hub_endplate", kit.circle_pts(2.72, 48), kit.circle_pts(1.34, 48), -0.02, 0.02, m=FRAME)
        fr.rotation_euler = (0, PI / 2, 0)
        fr.location = (s * 3.7, 0, 0)
        P.append(fr)
        P.append(cyl("hub_cone", 2.45, 1.0, r2=1.6, loc=(s * 4.2, 0, 0), rot=(0, s * PI / 2, 0), m=W, verts=40, cap=False))
        P.append(kit.torus("hub_rib", 2.5, 0.05, loc=(s * 1.8, 0, 0), rot=(0, PI / 2, 0), m=FRAME, seg=48, rseg=4))
    # cupola windows between the ports
    for kk in range(4):
        ang = kk * PI / 2 + PI / 4
        n = V((0, math.cos(ang), math.sin(ang)))
        u = V((1, 0, 0))
        v = n.cross(u)
        for xx in (-2.4, 2.4):
            G.append(obox("hub_win", V((xx, 0, 0)) + n * 2.47, u, v, n, -0.35, 0.35, -0.25, 0.25, 0.0, 0.06, "glass_dark"))
            P.append(obox("hub_win_frame", V((xx, 0, 0)) + n * 2.45, u, v, n, -0.43, 0.43, -0.33, 0.33, 0.0, 0.05, "metal_gunmetal"))
    # docking ports: fwd/aft on the spin axis (Rangers), top/bottom radial (Landers)
    for (nm, d, rot) in (("fwd", V((0, 1, 0)), (0, 0, 0)), ("aft", V((0, -1, 0)), (0, 0, PI)),
                         ("top", V((0, 0, 1)), (PI / 2, 0, 0)), ("bottom", V((0, 0, -1)), (-PI / 2, 0, 0))):
        q = to_quat(d)
        u = d.orthogonal().normalized()
        w = d.cross(u)
        prof = [(0.0, 2.3), (1.25, 2.3), (1.25, 2.55), (1.08, 2.55), (1.08, 3.55), (1.2, 3.55), (1.2, 3.8), (1.02, 3.8), (1.02, 3.95), (0.0, 3.95)]
        col = lathe("port_collar", prof, m=W, seg=40)
        col.rotation_mode = "QUATERNION"
        col.rotation_quaternion = q
        P.append(col)
        tip = d * 3.95
        P.append(kit.torus("port_ring", 1.0, 0.09, loc=tip, rot=q.to_euler(), m="metal_brushed", seg=40, rseg=8))
        P.append(cyl("port_hatch", 0.72, 0.06, loc=tip + d * 0.02, rot=q.to_euler(), m="hatch_gray", verts=32))
        for j in range(3):   # androgynous guide petals
            ang = j * 2 * PI / 3
            rv = u * math.cos(ang) + w * math.sin(ang)
            pp = tip + rv * 0.98
            P.append(seg_box("guide_petal", pp - d * 0.05, pp + d * 0.5 - rv * 0.3, 0.4, 0.06, "metal_brushed", up=tuple(rv)))
        for j in range(4):   # latch boxes
            ang = j * PI / 2 + PI / 4
            rv = u * math.cos(ang) + w * math.sin(ang)
            P.append(obox("port_latch", tip - d * 0.25 + rv * 1.12, rv, d.cross(rv), d, -0.1, 0.1, -0.12, 0.12, -0.15, 0.1, "metal_gunmetal"))
        P.append(kit.sphere("port_light", 0.07, loc=tip - d * 0.4 + u * 1.22, m="emit_green", segs=8, rings=6))
        P.append(kit.sphere("port_light", 0.07, loc=tip - d * 0.4 - u * 1.22, m="emit_red", segs=8, rings=6))
        # docking target cross on the hatch (for the pilot's port camera)
        P.append(obox("dock_target", tip + d * 0.07 + w * 0.45, u, w, d, -0.03, 0.03, -0.14, 0.14, 0.0, 0.02, "plate_white"))
        P.append(obox("dock_target", tip + d * 0.07 + w * 0.45, u, w, d, -0.14, 0.14, -0.03, 0.03, 0.0, 0.02, "plate_white"))
        empty(f"dock_{nm}", loc=tip, rot=rot, parent=root, port=nm)
    # high-gain antenna on a boom from the hub, between the fwd and top ports
    b0 = V((0.0, 1.7, 1.7))
    b1 = V((0.0, 4.8, 6.4))
    P.append(seg_box("hga_boom", b0, b1, 0.2, 0.2, FRAME, up=(1, 0, 0)))
    P.append(obox("hga_gimbal", b1, V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1)), -0.35, 0.35, -0.3, 0.3, -0.3, 0.3, "metal_gunmetal"))
    dn = V((0.0, 0.55, 0.83)).normalized()
    dish = lathe("hga_dish", [(0.0, 0.0), (0.6, 0.07), (1.2, 0.27), (1.75, 0.58), (1.8, 0.62), (1.74, 0.64), (1.18, 0.33), (0.0, 0.06)], m=W, seg=48)
    dish.rotation_mode = "QUATERNION"
    dish.rotation_quaternion = to_quat(dn)
    dish.location = b1 + dn * 0.3
    P.append(dish)
    u = dn.orthogonal().normalized()
    w = dn.cross(u)
    for j in range(3):
        ang = j * 2 * PI / 3
        rim = b1 + dn * 0.9 + (u * math.cos(ang) + w * math.sin(ang)) * 1.6
        P.append(seg_box("hga_strut", rim, b1 + dn * 1.9, 0.04, 0.04, FRAME))
    P.append(kit.sphere("hga_feed", 0.14, loc=b1 + dn * 1.95, m="metal_gunmetal", segs=12, rings=8))
    empty("antenna_hga", loc=b1 + dn * 0.3, parent=root)


def build(preview=True):
    kit.reset()
    root = empty("Endurance")
    set_props(root, vehicle="endurance", length=64.0)
    P, G = [], []
    for k in range(12):
        module(P, G, root, k)
        node(P, G, root, k)
    for s in (-1, 1):
        spoke(P, G, s)
    hub(P, G, root)
    for (cname, c, col) in (("navlight_port", 3, "emit_red"), ("navlight_stbd", 9, "emit_green")):
        r, t = frame_at(c)
        P.append(kit.sphere("navlamp", 0.14, loc=r * (RO + 0.25) + AX * (YF - 0.3) + t * 2.5, m=col, segs=10, rings=6))
        empty(cname, loc=r * (RO + 0.3) + AX * (YF - 0.3) + t * 2.5, parent=root, color="red" if c == 3 else "green")
    # merge per ring sector (frustum culling) + hub + spokes
    groups = {}
    for o in P:
        c = o.matrix_basis.translation.copy()
        if c.length < 1e-6:
            vs = o.data.vertices
            c = sum((v.co for v in vs), V()) / max(1, len(vs))
        rho = math.hypot(c.x, c.z)
        if rho < 6.0:
            key = "hub"
        elif rho < RI - 0.6:
            key = "spokes"
        else:
            ang = math.atan2(-c.x, c.z) % (2 * PI)
            key = f"sector_{int(ang / (PI / 6) + 0.5) % 12:02d}"
        groups.setdefault(key, []).append(o)
    for key in sorted(groups):
        m = merge(groups[key], f"endu_{key}", par=root)
        finish(m, 35)
    gl = merge(G, "endu_glass", par=root)
    finish(gl, 10)
    kit.export_glb(os.path.join(kit.out_dir(), "endurance.glb"), root)
    if preview:
        pd = kit.preview_dir()
        w = (0.0, 0.0, 0.0)
        # like reference image 3: front view, camera swung about the vertical and slightly above
        kit.preview(os.path.join(pd, "endurance.png"), (-38, 92, 26), (0, 0, 0), lens=40, samples=20, world=w, strength=0.0,
                    sun=(-0.5, 0.75, 0.45), sun_strength=6, res=(1200, 1000))
        kit.preview(os.path.join(pd, "endurance_close.png"), (-24, 16, 31), (-6.5, 0, 22.5), lens=35, samples=20, world=w,
                    strength=0.0, sun=(-0.5, 0.75, 0.45), sun_strength=6)
        kit.preview(os.path.join(pd, "endurance_rear.png"), (30, -70, 30), (0, 0, 0), lens=35, samples=16, world=w,
                    strength=0.0, sun=(0.4, -0.7, 0.6), sun_strength=6)


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
