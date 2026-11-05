"""AURORA-Q2 module package (mm) and AURORA-CRYO system (m)."""

from __future__ import annotations

import math

import bmesh

from . import core as K
from .q2chip import build_toroid, merge


# ============================================================ module package (mm)
def _bond(p0, p1, h=0.6):
    (x0, y0, z0), (x1, y1, z1) = p0, p1
    pts = [(x0, y0, z0), (x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.15, max(z0, z1) + h),
           (x0 + (x1 - x0) * 0.65, y0 + (y1 - y0) * 0.65, max(z0, z1) + h * 0.7), (x1, y1, z1)]
    return K.curve_tube(pts, radius=0.02, res_u=3, bevel_res=1)


def build_module(parent=None, origin=(0, 0, 0), mats=None, lod=2):
    M = mats or K.materials()
    prev = K.Assembly.uv_scale
    K.Assembly.uv_scale = 0.05
    root = K.empty("q2_module", parent, origin)
    root["units"] = "mm"
    W, H = 64.0, 46.0
    pocket = (26.0, 17.0)
    bead = K.material("Bead-blasted aluminium", (0.62, 0.62, 0.64), 1.0, 0.62)

    base = K.Assembly("m_base", root, component="m_base", explode=(0, 0, 0),
                      label="Module base · OFHC copper, gold plated · cold-finger mount")
    loops = [K.rounded_rect_pts(W, H, 5), K.rounded_rect_pts(*pocket, 1.0)]
    holes = [(sx * (W / 2 - 4), sy * (H / 2 - 4)) for sx in (-1, 1) for sy in (-1, 1)]
    holes += [(sx * 12, sy * (H / 2 - 4)) for sx in (-1, 1) for sy in (-1, 1)]
    loops += [K.circle_pts(1.4, x, y, 20) for x, y in holes]
    base.add(K.profile_solid(loops, 5.0, bevel=0.4, z=2.5, uv=None), M["gold_satin"])
    base.add(K.box(pocket[0] + 0.4, pocket[1] + 0.4, 1.0, matrix=K.T(z=0.5), uv=None), M["gold_satin"])
    base.add(K.box(18, 8, 6, matrix=K.T(0, -H / 2 - 4, 3), bevel=0.4, uv=None), M["copper"])  # cold-finger tab
    for sx in (-1, 1):
        base.add(K.cylinder(1.6, 6.2, segments=20, matrix=K.T(sx * 5, -H / 2 - 4, 3), uv=None), M["stainless"])
    base.build()
    scr = [K.T(x, y, 5.0) for x, y in holes]
    K.instances("m_screw", merge(K.cylinder(1.25, 1.3, segments=20, matrix=K.T(z=0.65), uv=None),
                                 K.cylinder(0.6, 0.3, segments=6, matrix=K.T(z=1.36), uv=None)), M["stainless"], scr, base.node)

    # launch board with gold fan-out
    brd = K.Assembly("m_board", root, component="m_board", explode=(0, 0, 4),
                     label="Microwave launch board · 96 CPW fan-out traces to the flex connectors")
    brd.add(K.profile_solid([K.rounded_rect_pts(W - 8, H - 8, 3), K.rounded_rect_pts(pocket[0] - 1, pocket[1] - 1, 0.6)],
                            0.8, bevel=0.05, z=5.4, uv=None), M["pcb"])
    pads = []
    for i in range(48):
        x = -10.6 + i * 21.2 / 47
        for sy in (-1, 1):
            x_edge = -24 + i * 48 / 47
            p0, p1, p2 = (x, sy * 8.6), (x, sy * 10.2), (x_edge, sy * 18.2)
            for (a, b) in ((p0, p1), (p1, p2)):
                L_ = math.hypot(b[0] - a[0], b[1] - a[1])
                ang = math.atan2(b[1] - a[1], b[0] - a[0])
                brd.add(K.box(L_ + 0.12, 0.12, 0.04, matrix=K.T((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 5.82, rz=ang), uv=None), M["gold"])
            pads.append((x, sy * 8.6))
    brd.build()

    # die stack sits in the pocket
    stack = K.empty("m_stack", root, (0, 0, 1.0), component="m_stack", explode=(0, 0, 9),
                    label="Toroid die stack · qubit die + 2-layer interposer (explore in Chip view)")
    build_toroid(stack, mats=M, lod=lod)

    if lod >= 1:
        bonds = K.Assembly("m_bonds", root, component="m_bonds", explode=(0, 0, 6),
                           label="Al wire bonds · interposer launch pads → board")
        for (x, y) in pads:
            sy = 1 if y > 0 else -1
            bonds.add(_bond((x, sy * 6.4, 1.0 + 0.97), (x, y, 5.84), 0.5), M["aluminum"])
        bonds.build()

    # high-density flex connectors + ribbons
    fx = K.Assembly("m_flex", root, component="m_flex", explode=(0, 0, 5),
                    label="High-density superconducting flex (NbTi on polyimide) · pressure connectors")
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * 12.5, sy * 19.2
            fx.add(K.box(20, 4.2, 3.2, matrix=K.T(cx, cy, 7.4), bevel=0.3, uv=None), M["black"])
            for k in range(24):
                fx.add(K.box(0.35, 1.2, 0.2, matrix=K.T(cx - 9 + k * 18 / 23, cy - sy * 1.6, 9.05), uv=None), M["gold"])
            pts = [(cx, cy + sy * 1.5, 7.6), (cx, cy + sy * 6, 8.5), (cx, cy + sy * 12, 6.0), (cx, cy + sy * 15, -2.0)]
            fx.add(K.flat_strip(pts, 17.5, 0.12, (1, 0, 0)), M["kapton"])
            for k in range(12):
                fx.add(K.flat_strip([(cx - 8 + k * 16 / 11, q[1], q[2] + 0.075) for q in pts], 0.35, 0.02, (1, 0, 0)), M["gold"])
            fx.add(K.box(22, 3.0, 2.0, matrix=K.T(cx, cy, 9.9), bevel=0.2, uv=None), M["stainless"])
    fx.build()

    # cavity attenuator block (AURORA-CRYO element)
    ca = K.Assembly("m_cavatt", root, component="m_cavatt", explode=(9, 0, 2),
                    label="Cavity attenuator block · 8 MXC-thermalised dissipative cavities (drive/flux inputs)")
    ca.add(K.box(10, 40, 12, matrix=K.T(W / 2 + 5.5, 0, 6), bevel=0.4, uv=None), M["copper"])
    for k in range(8):
        y = -17.5 + k * 5
        ca.add(K.tube(1.9, 1.3, 0.6, segments=28, matrix=K.T(W / 2 + 5.5, y, 12.3), uv=None), M["gold"])
        ca.add(K.cylinder(1.25, 0.2, segments=28, matrix=K.T(W / 2 + 5.5, y, 12.05), uv=None), M["eccosorb"])
        ca.add(K.cylinder(1.0, 4.0, segments=20, matrix=K.T(W / 2 + 12.5, y, 7.5, ry=math.pi / 2), uv=None), M["gold"])
        ca.add(K.cylinder(0.35, 4.6, segments=12, matrix=K.T(W / 2 + 12.8, y, 7.5, ry=math.pi / 2), uv=None), M["ptfe"])
    ca.build()

    # photonic drive receiver
    ph = K.Assembly("m_photonic", root, component="m_photonic", explode=(-9, 0, 2),
                    label="Photonic drive receiver · 8 photodiodes, fibre-fed (no passive coax load)")
    ph.add(K.box(9, 34, 9, matrix=K.T(-W / 2 - 5, 0, 4.5), bevel=0.5, uv=None), bead)
    for k in range(8):
        y = -14 + k * 4
        ph.add(K.cylinder(1.25, 5.0, segments=20, matrix=K.T(-W / 2 - 11, y, 5.5, ry=math.pi / 2), uv=None), M["ceramic"])
        pts = [(-W / 2 - 13.5, y, 5.5), (-W / 2 - 22, y, 8 + k * 0.4), (-W / 2 - 28, y * 0.6, 24 + k), (-W / 2 - 30, y * 0.3, 44)]
        ph.add(K.curve_tube(pts, radius=0.45, res_u=10), K.material("Fibre jacket", (0.95, 0.74, 0.12), 0.0, 0.45))
    ph.build()

    lid = K.Assembly("m_lid", root, component="m_lid", explode=(0, 0, 22),
                     label="Lid · gold-plated copper with IR-absorbing coating inside")
    lid.add(K.profile_solid([K.rounded_rect_pts(W - 10, H - 12, 3)], 2.0, bevel=0.3, z=13.0, uv=None), M["gold"])
    lid.add(K.box(W - 14, H - 16, 0.4, matrix=K.T(z=11.8), uv=None), M["eccosorb"])
    lid.add(K.text_mesh("AURORA-Q2 · TOROID MODULE", 2.4, 0.25, matrix=K.T(0, 3.0, 14.05)), M["label_dark"])
    lid.add(K.text_mesh("288 Q · 12 LQ · [[144,12,12]]", 1.8, 0.25, font=K.FONT_MONO, matrix=K.T(0, -1.5, 14.05)), M["label_dark"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            lid.add(K.cylinder(1.1, 1.2, segments=20, matrix=K.T(sx * (W / 2 - 8), sy * (H / 2 - 9), 14.5), uv=None), M["stainless"])
    lid.build()

    sh = K.Assembly("m_shield", root, component="m_shield", explode=(0, 0, 40),
                    label="Magnetic shield can (Cryoperm) · hidden by default")
    sh.node["shield"] = True
    sh.add(K.profile_solid([K.rounded_rect_pts(W + 34, H + 14, 8), K.rounded_rect_pts(W + 32, H + 12, 7)], 30, z=15, uv=None), M["cryoperm"])
    sh.add(K.profile_solid([K.rounded_rect_pts(W + 34, H + 14, 8)], 1.0, z=30.5, uv=None), M["cryoperm"])
    sh.build()
    K.Assembly.uv_scale = prev
    return root


def module_lowpoly(M):
    """Simplified module (m) for instancing on the MXC ring."""
    s = 0.001
    parts = [
        (K.box(64 * s, 46 * s, 6 * s, matrix=K.T(z=3 * s), bevel=0.4 * s, uv=None), M["gold_satin"]),
        (K.box(54 * s, 34 * s, 2 * s, matrix=K.T(z=13 * s), bevel=0.3 * s, uv=None), M["gold"]),
        (K.box(10 * s, 40 * s, 12 * s, matrix=K.T(37.5 * s, 0, 6 * s), bevel=0.3 * s, uv=None), M["copper"]),
        (K.box(9 * s, 34 * s, 9 * s, matrix=K.T(-37 * s, 0, 4.5 * s), uv=None), M["aluminum"]),
    ]
    return parts


# ============================================================ AURORA-CRYO system (m)
STAGES = [
    # id, label, z (m), radius, thickness, material key
    ("plate_300k", "300 K top plate", 2.95, 0.95, 0.040, "stainless"),
    ("plate_50k", "50 K plate", 2.68, 0.89, 0.016, "copper_dark"),
    ("plate_4k", "4 K plate · cryo-CMOS deck", 2.42, 0.84, 0.016, "copper"),
    ("plate_still", "Still plate · 0.8 K", 2.17, 0.79, 0.012, "copper"),
    ("plate_cp", "Cold plate · 100 mK", 1.96, 0.75, 0.012, "gold_satin"),
    ("plate_mxc", "Mixing-chamber plate · 10 mK (1.43 m)", 1.76, 0.715, 0.018, "gold"),
]
Z = {s[0]: s[2] for s in STAGES}


def _ring(n, r, z, phase=0.0):
    return [(r * math.cos(phase + 2 * math.pi * i / n), r * math.sin(phase + 2 * math.pi * i / n), z) for i in range(n)]


def build_cryo(parent=None, mats=None, lod=2, cutaway=False):
    M = mats or K.materials()
    root = K.empty("aurora_cryo", parent)
    pb = K.material("Lead radiation shield", (0.33, 0.34, 0.37), 1.0, 0.55)
    fibre = K.material("Fibre jacket", (0.95, 0.74, 0.12), 0.0, 0.45)
    pcb_g = K.material("Cryo-CMOS board", (0.04, 0.22, 0.16), 0.0, 0.35, clearcoat=0.5)
    asic = K.material("ASIC package", (0.03, 0.03, 0.035), 0.2, 0.4)
    screw_bm = lambda: K.cylinder(0.005, 0.006, segments=12, uv=None)

    # ---------------- plates + bolt rings + supports
    for sid, label, z, r, t, mk in STAGES:
        a = K.Assembly(sid, root, component=sid, explode=(0, 0, {"plate_300k": 0.9, "plate_50k": 0.7, "plate_4k": 0.5,
                                                                  "plate_still": 0.3, "plate_cp": 0.15, "plate_mxc": 0.0}[sid]),
                       label=label)
        holes = [K.circle_pts(0.05, *xy[:2], 24) for xy in _ring(6, r * 0.55, 0, 0.3)]
        a.add(K.profile_solid([K.circle_pts(r, 0, 0, 128)] + holes, t, bevel=0.002, z=z, uv=None), M[mk])
        a.add(K.tube(r + 0.005, r - 0.02, t + 0.01, segments=128, matrix=K.T(z=z), uv=None), M[mk])
        a.build()
        K.instances(f"{sid}_bolts", screw_bm(), M["stainless"],
                    [K.T(x, y, z + t / 2 + 0.003) for x, y, _ in _ring(72, r - 0.012, 0)], a.node)
    for (upper, lower) in zip(STAGES[:-1], STAGES[1:]):
        zu, zl = upper[2], lower[2]
        sup = [K.T(x, y, (zu + zl) / 2) for x, y, _ in _ring(6, lower[3] * 0.82, 0, 0.0)]
        K.instances(f"g10_{lower[0]}", K.tube(0.022, 0.018, zu - zl - 0.02, segments=20, uv=None), M["g10"], sup, root)

    # ---------------- pulse tubes (9) + dedicated 4 K cryo-CMOS coolers (6)
    pt = K.Assembly("pulse_tubes", root, component="pulse_tubes", explode=(0, 0, 1.2),
                    label="9 pulse-tube cold heads (operation, payload, shields)")
    for i, (x, y, _) in enumerate(_ring(9, 0.72, 0, 0.17)):
        zt = Z["plate_300k"]
        pt.add(K.cylinder(0.085, 0.24, segments=40, matrix=K.T(x, y, zt + 0.14), uv=None), M["aluminum"])
        pt.add(K.cylinder(0.09, 0.03, segments=40, matrix=K.T(x, y, zt + 0.035), uv=None), M["stainless"])
        pt.add(K.cylinder(0.06, 0.05, segments=6, matrix=K.T(x, y, zt + 0.285), uv=None), M["anodized"])
        pt.add(K.cylinder(0.035, zt - Z["plate_50k"], segments=24, matrix=K.T(x, y, (zt + Z["plate_50k"]) / 2), uv=None), M["stainless"])
        pt.add(K.cylinder(0.07, 0.04, segments=32, matrix=K.T(x, y, Z["plate_50k"] - 0.03), uv=None), M["copper_dark"])
        pt.add(K.cylinder(0.022, Z["plate_50k"] - Z["plate_4k"], segments=20, matrix=K.T(x * 0.97, y * 0.97, (Z["plate_50k"] + Z["plate_4k"]) / 2 - 0.02), uv=None), M["stainless"])
        pt.add(K.cylinder(0.05, 0.035, segments=32, matrix=K.T(x * 0.97, y * 0.97, Z["plate_4k"] - 0.035), uv=None), M["copper"])
        # flexible copper braids to the plates
        for k in range(3):
            a0 = (x * 0.97 + 0.03 * math.cos(k * 2.1), y * 0.97 + 0.03 * math.sin(k * 2.1), Z["plate_4k"] - 0.05)
            pts = [a0, (a0[0] * 0.93, a0[1] * 0.93, Z["plate_4k"] - 0.09), (a0[0] * 0.86, a0[1] * 0.86, Z["plate_4k"] - 0.02)]
            pt.add(K.curve_tube(pts, 0.006, res_u=6), M["copper"])
        # remote motor hose
        pts = [(x, y, zt + 0.26), (x * 1.15, y * 1.15, zt + 0.42), (x * 1.6, y * 1.6, zt + 0.5)]
        pt.add(K.curve_tube(pts, 0.014, res_u=8), M["braided"])
    pt.build()
    ec = K.Assembly("cmos_coolers", root, component="cmos_coolers", explode=(0, 0, 1.0),
                    label="6 dedicated 4 K cryocoolers for the cryo-CMOS deck (+12 W at 4 K, design assumption)")
    for (x, y, _) in _ring(6, 0.38, 0, 0.5):
        zt = Z["plate_300k"]
        ec.add(K.cylinder(0.07, 0.2, segments=36, matrix=K.T(x, y, zt + 0.12), uv=None), M["anodized"])
        ec.add(K.cylinder(0.074, 0.02, segments=36, matrix=K.T(x, y, zt + 0.23), uv=None), M["aluminum"])
        ec.add(K.cylinder(0.03, zt - Z["plate_4k"], segments=20, matrix=K.T(x, y, (zt + Z["plate_4k"]) / 2), uv=None), M["stainless"])
        ec.add(K.cylinder(0.06, 0.03, segments=32, matrix=K.T(x, y, Z["plate_4k"] + 0.03), uv=None), M["copper"])
    ec.build()

    # ---------------- cryo-CMOS deck on the 4 K plate
    cm = K.Assembly("cmos_deck", root, component="cmos_deck", explode=(0, 0, 0.55),
                    label="4 K cryo-CMOS control deck · 24 controller boards (multiplexed drive, flux DACs, readout)")
    z4 = Z["plate_4k"] + 0.008
    for i in range(24):
        a = 2 * math.pi * (i + 0.5) / 24
        ca, sa = math.cos(a), math.sin(a)
        m = K.T(0.6 * ca, 0.6 * sa, z4, rz=a)
        cm.add(K.box(0.22, 0.09, 0.004, matrix=m @ K.T(z=0.02), uv=None), pcb_g)
        cm.add(K.box(0.22, 0.02, 0.016, matrix=m @ K.T(0, -0.035, 0.01), uv=None), M["copper"])
        cm.add(K.box(0.22, 0.02, 0.016, matrix=m @ K.T(0, 0.035, 0.01), uv=None), M["copper"])
        for k in range(4):
            cm.add(K.box(0.026, 0.026, 0.004, matrix=m @ K.T(-0.075 + k * 0.05, 0, 0.0245), uv=None), asic)
            cm.add(K.box(0.018, 0.018, 0.0015, matrix=m @ K.T(-0.075 + k * 0.05, 0, 0.027), uv=None), M["gold"])
        cm.add(K.box(0.03, 0.06, 0.01, matrix=m @ K.T(-0.12, 0, 0.026), uv=None), M["black"])
    cm.build()

    # ---------------- dilution units (3)
    du = K.Assembly("dilution_units", root, component="dilution_units", explode=(0, 0, 0.25),
                    label="3 independent dilution units: still · heat exchangers · mixing chamber")
    for (x, y, _) in _ring(3, 0.28, 0, 0.0):
        du.add(K.cylinder(0.075, 0.12, segments=40, matrix=K.T(x, y, Z["plate_still"] - 0.07), uv=None), M["copper"])
        for k in range(7):
            du.add(K.cylinder(0.062, 0.012, segments=36, matrix=K.T(x, y, Z["plate_cp"] - 0.03 - k * 0.022), uv=None), M["copper"])
            du.add(K.cylinder(0.05, 0.01, segments=36, matrix=K.T(x, y, Z["plate_cp"] - 0.041 - k * 0.022), uv=None), M["stainless"])
        helix = [(x + 0.03 * math.cos(t * 0.9), y + 0.03 * math.sin(t * 0.9), Z["plate_still"] - 0.14 - t * 0.0035) for t in range(0, 30)]
        du.add(K.curve_tube(helix, 0.004, res_u=4), M["stainless"])
        du.add(K.cylinder(0.085, 0.07, segments=40, matrix=K.T(x, y, Z["plate_mxc"] + 0.045), uv=None), M["gold"])
        du.add(K.cylinder(0.012, Z["plate_300k"] - Z["plate_still"], segments=16, matrix=K.T(x + 0.05, y, (Z["plate_300k"] + Z["plate_still"]) / 2), uv=None), M["stainless"])
    du.build()

    # ---------------- flex harnesses 4 K -> MXC and fibres 300 K -> MXC
    fh = K.Assembly("flex_harness", root, component="flex_harness", explode=(0, 0, 0.12),
                    label="24 superconducting flex harnesses (4 K → MXC) with thermalisation clamps")
    for i in range(24):
        a = 2 * math.pi * (i + 0.5) / 24
        ca, sa = math.cos(a), math.sin(a)
        r = 0.66
        for k in range(6):
            off = -0.012 + k * 0.0048
            x, y = (r + off) * ca, (r + off) * sa
            pts = [(x, y, Z["plate_4k"] - 0.01), (x * 0.99, y * 0.99, Z["plate_still"]), (x * 0.985, y * 0.985, Z["plate_cp"]),
                   (x * 0.98, y * 0.98, Z["plate_mxc"] + 0.01)]
            fh.add(K.flat_strip(pts, 0.05, 0.0008, (-sa, ca, 0), samples=4), M["kapton"])
        for zc in (Z["plate_4k"] - 0.03, Z["plate_still"] + 0.02, Z["plate_cp"] + 0.02, Z["plate_mxc"] + 0.03):
            cm_ = K.T(r * ca, r * sa, zc, rz=a)
            fh.add(K.box(0.04, 0.07, 0.024, matrix=cm_, bevel=0.002, uv=None), M["copper"])
            fh.add(K.box(0.044, 0.074, 0.004, matrix=cm_ @ K.T(z=0.014), uv=None), M["stainless"])
    fh.build()
    fb = K.Assembly("fibres", root, component="fibres", explode=(0, 0, 0.1),
                    label="Optical fibre bundles (photonic drive), 300 K → MXC photodiode arrays")
    for i in range(8):
        a = 2 * math.pi * i / 8 + 0.2
        for k in range(4):
            r = 0.15 + 0.008 * k
            pts = [(r * math.cos(a), r * math.sin(a), Z["plate_300k"] + 0.12)]
            for j, sid in enumerate(["plate_50k", "plate_4k", "plate_still", "plate_cp", "plate_mxc"]):
                rr = r + 0.02 * math.sin(j + k)
                pts.append((rr * math.cos(a + 0.03 * j), rr * math.sin(a + 0.03 * j), Z[sid] + 0.02))
            fb.add(K.curve_tube(pts, 0.0022, res_u=8), fibre)
        fb.add(K.cylinder(0.02, 0.05, segments=20, matrix=K.T(0.15 * math.cos(a), 0.15 * math.sin(a), Z["plate_300k"] + 0.05), uv=None), M["stainless"])
    fb.build()

    # ---------------- MXC payload: 20 module positions on cold fingers + cryo-link ring
    pay = K.empty("payload", root, component="payload", explode=(0, 0, -0.35),
                  label="Payload · 20 Toroid module positions (16 memory + 4 logic/factory) on cold fingers")
    zm = Z["plate_mxc"] - 0.009
    cf = K.Assembly("cold_fingers", pay)
    mats_low = module_lowpoly(M)
    mod_frames = []
    for i in range(20):
        a = 2 * math.pi * i / 20
        ca, sa = math.cos(a), math.sin(a)
        r = 0.5
        cf.add(K.box(0.018, 0.08, 0.2, matrix=K.T(r * ca, r * sa, zm - 0.1, rz=a), bevel=0.002, uv=None), M["copper"])
        cf.add(K.box(0.05, 0.1, 0.012, matrix=K.T(r * ca, r * sa, zm - 0.006, rz=a), uv=None), M["copper"])
        cf.add(K.box(0.03, 0.06, 0.008, matrix=K.T((r + 0.012) * ca, (r + 0.012) * sa, zm - 0.196, rz=a), uv=None), M["copper"])
        mod_frames.append(K.T((r + 0.009) * ca, (r + 0.009) * sa, zm - 0.125, rz=a) @ K.T(ry=math.pi / 2) @ K.T(rz=math.pi / 2))
        # two flex ribbons from each module up to the MXC clamp ring, plus a fibre to the photodiodes
        for k, off in enumerate((-0.022, 0.022)):
            tx, ty = -sa, ca
            x0, y0 = (r + 0.03) * ca + off * tx, (r + 0.03) * sa + off * ty
            pts = [(x0, y0, zm - 0.1), ((r + 0.05) * ca + off * tx, (r + 0.05) * sa + off * ty, zm - 0.06),
                   ((r + 0.075) * ca + off * tx, (r + 0.075) * sa + off * ty, zm - 0.012)]
            cf.add(K.flat_strip(pts, 0.016, 0.0006, (tx, ty, 0), samples=5), M["kapton"])
        fp = [((r + 0.03) * ca, (r + 0.03) * sa, zm - 0.165), ((r + 0.06) * ca, (r + 0.06) * sa, zm - 0.12),
              ((r + 0.07) * ca, (r + 0.07) * sa, zm - 0.02)]
        cf.add(K.curve_tube(fp, 0.0015, res_u=6), K.material("Fibre jacket", (0.95, 0.74, 0.12), 0.0, 0.45))
    cf.build()
    for k, (bm, mat) in enumerate(mats_low):
        K.instances(f"module_low_{k}", bm, mat, mod_frames, pay)
    link = K.Assembly("cryolink", root, component="cryolink", explode=(0, 0, -0.5),
                      label="Cryo-link ring · superconducting inter-module couplers (l-links)")
    tor = bmesh.new()
    bmesh.ops.create_circle(tor, segments=8, radius=0.006)
    link.add(K.curve_tube([(0.47 * math.cos(t / 64 * 2 * math.pi), 0.47 * math.sin(t / 64 * 2 * math.pi), zm - 0.215) for t in range(64)],
                          0.006, closed=True, res_u=2), M["nbti"])
    tor.free()
    for i in range(20):
        a = 2 * math.pi * i / 20
        link.add(K.curve_tube([(0.47 * math.cos(a), 0.47 * math.sin(a), zm - 0.215), (0.5 * math.cos(a), 0.5 * math.sin(a), zm - 0.205),
                               (0.528 * math.cos(a), 0.528 * math.sin(a), zm - 0.17)], 0.003, res_u=4), M["nbti"])
    link.build()
    cav = [K.T(0.62 * math.cos(2 * math.pi * (i + 0.5) / 20), 0.62 * math.sin(2 * math.pi * (i + 0.5) / 20), zm - 0.03,
               rz=2 * math.pi * (i + 0.5) / 20) for i in range(20)]
    cavn = K.empty("cavity_attenuators", root, component="cavity_attenuators", explode=(0, 0, -0.2),
                   label="20 cavity-attenuator blocks on the MXC (n_th ≤ 2×10⁻⁴ design value)")
    K.instances("cavatt_block", merge(K.box(0.03, 0.07, 0.05, bevel=0.002, uv=None),
                                      *[K.cylinder(0.004, 0.012, segments=16, matrix=K.T(0.0, -0.025 + k * 0.0125, 0.03), uv=None) for k in range(5)]),
                M["copper"], cav, cavn)
    # ---------------- shields (hidden by default)
    def shield(sid, label, r, z_top, z_bot, mat, t=0.004, ex=0.0):
        a = K.Assembly(sid, root, component=sid, explode=(0, 0, -ex), label=label)
        a.node["shield"] = True
        h = z_top - z_bot
        if cutaway:   # open window facing the hero camera (render-only variant)
            a0, a1 = math.radians(-54 + 62), math.radians(-54 + 360 - 62)
            arc = lambda rr, n=160: [(rr * math.cos(a0 + (a1 - a0) * i / n), rr * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
            ring = arc(r) + arc(r - t)[::-1]
            a.add(K.profile_solid([ring], h, z=(z_top + z_bot) / 2, uv=None), mat)
            a.add(K.profile_solid([arc(r) + [(0.0, 0.0)]], t, z=z_bot + t / 2, uv=None), mat)
            ring2 = arc(r + 0.015) + arc(r - t)[::-1]
            a.add(K.profile_solid([ring2], 0.012, z=z_top - 0.006, uv=None), mat)
        else:
            a.add(K.tube(r, r - t, h, segments=128, matrix=K.T(z=(z_top + z_bot) / 2), uv=None), mat)
            a.add(K.cylinder(r, t, segments=128, matrix=K.T(z=z_bot + t / 2), uv=None), mat)
            a.add(K.tube(r + 0.015, r - t, 0.012, segments=128, matrix=K.T(z=z_top - 0.006), uv=None), mat)
        a.build()

    shield("shield_ovc", "Outer vacuum can (stainless)", 0.96, Z["plate_300k"] - 0.02, 1.0, M["stainless"], 0.006, 1.6)
    shield("shield_50k", "50 K radiation shield", 0.9, Z["plate_50k"] - 0.01, 1.06, M["alu_shield"], 0.004, 1.3)
    shield("shield_4k", "4 K radiation shield", 0.85, Z["plate_4k"] - 0.01, 1.11, M["alu_shield"], 0.004, 1.0)
    shield("shield_still", "Still shield (IR-tight, black-coated inside)", 0.8, Z["plate_still"] - 0.01, 1.15, M["alu_shield"], 0.003, 0.75)
    shield("shield_mxc", "MXC shield (gold-plated copper)", 0.725, Z["plate_mxc"] - 0.01, 1.19, M["gold_satin"], 0.003, 0.5)
    shield("shield_mag", "Magnetic shield around payload (Cryoperm)", 0.6, Z["plate_mxc"] - 0.02, 1.22, M["cryoperm"], 0.003, 0.3)
    pbs = K.Assembly("shield_pb", root, component="shield_pb", explode=(0, 0, 0), label="Optional lead radiation shield (10 cm Pb, lower OVC)")
    pbs.node["shield"] = True
    for k in range(12):
        a0 = 2 * math.pi * k / 12
        pbs.add(K.box(0.48, 0.1, 0.9, matrix=K.T(1.06 * math.cos(a0 + math.pi / 12), 1.06 * math.sin(a0 + math.pi / 12), 1.45, rz=a0 + math.pi / 12 + math.pi / 2), bevel=0.005, uv=None), pb)
    pbs.build()

    # ---------------- frame + room-temperature equipment
    fr = K.Assembly("frame", root, component="frame", explode=(0, 0, 0), label="Support frame with pneumatic vibration isolators")
    for (x, y, _) in _ring(6, 1.15, 0, math.pi / 6):
        fr.add(K.box(0.1, 0.1, 3.2, matrix=K.T(x, y, 1.6), bevel=0.004, uv=None), M["rack"])
        fr.add(K.cylinder(0.11, 0.12, segments=32, matrix=K.T(x, y, 3.26), uv=None), M["black"])
        fr.add(K.box(0.24, 0.24, 0.02, matrix=K.T(x, y, 0.01), uv=None), M["stainless"])
    hexp = [(1.15 * math.cos(math.pi / 6 + k * math.pi / 3), 1.15 * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
    for k in range(6):
        (x0, y0), (x1, y1) = hexp[k], hexp[(k + 1) % 6]
        L_ = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0)
        for zz in (3.36, 0.35):
            fr.add(K.box(L_ + 0.1, 0.12, 0.12, matrix=K.T((x0 + x1) / 2, (y0 + y1) / 2, zz, rz=ang), bevel=0.004, uv=None), M["rack"])
        # spokes to the top plate
        fr.add(K.box(0.3, 0.08, 0.08, matrix=K.T(x0 * 0.9, y0 * 0.9, 3.0, rz=math.atan2(y0, x0)), uv=None), M["rack"])
    fr.build()

    racks = K.Assembly("racks", root, component="racks", explode=(0, 0, 0),
                       label="Room temperature: lasers (photonic drive), Relay-BP FPGA decoder, cryo-CMOS power")
    for i, name in enumerate(["LASER / OPTICAL DRIVE", "RELAY-BP DECODER (FPGA)", "CRYO-CMOS POWER + DC"]):
        x, y = 2.1 + i * 0.68, -1.0
        racks.add(K.box(0.6, 1.0, 2.0, matrix=K.T(x, y, 1.0), bevel=0.01, uv=None), M["rack"])
        for k in range(14):
            racks.add(K.box(0.52, 0.02, 0.085, matrix=K.T(x, y - 0.505, 0.18 + k * 0.12), uv=None), M["anodized"])
            racks.add(K.box(0.012, 0.004, 0.012, matrix=K.T(x - 0.22, y - 0.517, 0.18 + k * 0.12),
                            uv=None), M["led_green"] if k % 3 else M["led_blue"])
        racks.add(K.text_mesh(name, 0.032, 0.004, matrix=K.T(x, y - 0.52, 1.93, rx=math.pi / 2)), M["ceramic"])
    racks.build()
    comp = K.Assembly("compressors", root, component="compressors", explode=(0, 0, 0),
                      label="Pulse-tube compressors + gas handling")
    for i in range(5):
        x, y = -2.2 + i * 0.62, 1.9
        comp.add(K.box(0.5, 0.6, 0.75, matrix=K.T(x, y, 0.375), bevel=0.02, uv=None), K.material("Compressor white", (0.86, 0.87, 0.88), 0.0, 0.45))
        comp.add(K.box(0.4, 0.004, 0.25, matrix=K.T(x, y - 0.302, 0.5), uv=None), M["anodized"])
        comp.add(K.box(0.04, 0.005, 0.02, matrix=K.T(x + 0.12, y - 0.305, 0.66), uv=None), M["led_green"])
    comp.add(K.box(0.9, 0.5, 1.7, matrix=K.T(-2.1, -1.2, 0.85), bevel=0.01, uv=None), M["rack"])
    comp.add(K.box(0.7, 0.01, 0.5, matrix=K.T(-2.1, -1.455, 1.3), uv=None), M["screen"])
    comp.build()
    return root
