"""AURORA-Q tile module: gold-plated sample package (millimetre units).

Layers (bottom -> top): OFHC copper base (Au plated) · microwave PCB with fan-out ·
interposer · qubit die · Purcell/bandpass filter die · bead-blasted cover plate ·
clamp bars with engraved labels · lid. Wire bonds connect die launch pads to the
interposer and interposer to the PCB; SMP connectors and high-density flex connectors
bring signals in. Each layer carries an explode vector for the web exploded view.
"""

from __future__ import annotations

import math

import bmesh

from . import core as K
from .chip import build_chip


def _planar_uv(bm, w, h, cx=0.0, cy=0.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x - cx) / w + 0.5, (l.vert.co.y - cy) / h + 0.5)


def socket_screw(head_r=2.3, head_h=2.0, shank_l=0.0):
    bm = K.cylinder(head_r, head_h, segments=24, matrix=K.T(z=head_h / 2), uv=None)
    # knurled rim + hex socket rendered as a darker inset (separate instance group)
    return bm


def bond_wire(p0, p1, loop_h=0.7):
    (x0, y0, z0), (x1, y1, z1) = p0, p1
    pts = [(x0, y0, z0), (x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.15, max(z0, z1) + loop_h),
           (x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * 0.6, max(z0, z1) + loop_h * 0.75), (x1, y1, z1)]
    return K.curve_tube(pts, radius=0.022, res_u=3, bevel_res=1)


def build_package(parent=None, origin=(0, 0, 0), mats=None, lod: int = 2, rotation=None, scale=1.0):
    M = mats or K.materials()
    prev_uv = K.Assembly.uv_scale
    K.Assembly.uv_scale = 0.05 * (1.0 if scale == 1.0 else 1.0)
    bead = K.material("Bead-blasted aluminium", (0.62, 0.62, 0.64), 1.0, 0.62)
    root = K.empty("aurora_qpu_module", parent, origin)
    root["units"] = "mm"
    if rotation is not None:
        root.rotation_euler = rotation
    root.scale = (scale, scale, scale)
    W, H = 110.0, 120.0

    # ---------------------------------------------------------------- base enclosure
    base = K.Assembly("pkg_base", root, component="pkg_base", explode=(0, 0, 0),
                      label="Sample package base (OFHC copper, Au plated)")
    base.add(K.profile_solid([K.rounded_rect_pts(W, H, 9)], 4.0, bevel=0.6, z=2.0, uv=None), M["gold_satin"])
    holes = []
    for i in range(16):
        a = 2 * math.pi * (i + 0.5) / 16
        # points on the wall centre line of a rounded rectangle (approximate by ellipse scaling)
        x = (W / 2 - 3.5) * math.cos(a)
        y = (H / 2 - 3.5) * math.sin(a)
        x = max(-W / 2 + 3.5, min(W / 2 - 3.5, x * 1.25))
        y = max(-H / 2 + 3.5, min(H / 2 - 3.5, y * 1.25))
        holes.append((x, y))
    wall_loops = [K.rounded_rect_pts(W, H, 9), K.rounded_rect_pts(W - 14, H - 14, 4)]
    wall_loops += [K.circle_pts(1.4, x, y, 16) for x, y in holes]
    base.add(K.profile_solid(wall_loops, 12.0, bevel=0.5, z=10.0, uv=None), M["gold"])
    # mounting ears to the cold finger
    for sx in (-1, 1):
        base.add(K.profile_solid([K.rounded_rect_pts(16, 30, 4, sx * (W / 2 + 6), 0), K.circle_pts(2.2, sx * (W / 2 + 8), 0, 20)],
                                 5.0, bevel=0.4, z=2.5, uv=None), M["gold_satin"])
    base.build()

    # SMP connectors on the two long sides (signals into the PCB)
    if lod >= 1:
        conn = []
        for side in (-1, 1):
            for i in range(12):
                y = -H / 2 + 14 + i * (H - 28) / 11
                for zz in (6.5, 12.0):
                    conn.append(K.T(side * (W / 2 + 3.0), y, zz, ry=math.pi / 2 * side))
        grp = K.empty("pkg_connectors", root, component="pkg_connectors", explode=(0, 0, 0),
                      label="SMP coaxial connectors (48) — feedlines, readout return, reset loads")
        body = K.cylinder(1.9, 6.0, segments=20, uv=None)
        K.instances("smp_body", body, M["gold"], conn, grp)
        K.instances("smp_dielectric", K.tube(1.3, 0.35, 6.2, segments=20, uv=None), M["ptfe"], conn, grp)
        hd = [K.T(0, side * (H / 2 + 4), 7, rz=0) for side in (-1, 1)]
        K.instances("hd_flex_connector", K.box(52, 8, 7, bevel=0.6, uv=None), M["black"], hd, grp)

    # ------------------------------------------------------------------------- PCB
    from .textures import pcb_texture

    bt, bmr = pcb_texture()
    pcb_mat = K.material("Microwave PCB (textured)", (1, 1, 1), 0.0, 0.35, base_tex=bt, mr_tex=bmr)
    pcb = K.Assembly("pkg_pcb", root, component="pkg_pcb", explode=(0, 0, 14),
                     label="Multilayer microwave PCB: 50 Ω fan-out, via fences")
    bmp = K.profile_solid([K.rounded_rect_pts(96, 104, 3), K.rounded_rect_pts(30, 30, 1.5)], 1.6, bevel=0.15, z=4.8, uv=None)
    _planar_uv(bmp, 96, 104)
    pcb.add(bmp, pcb_mat)
    pcb.build()

    # ----------------------------------------------------------------- interposer + die
    ip = K.Assembly("pkg_interposer", root, component="pkg_interposer", explode=(0, 0, 26),
                    label="Interposer / carrier die (routes 458 signal bumps to wire-bond pads)")
    ip.add(K.box(27, 27, 0.6, matrix=K.T(z=4.3), bevel=0.05, uv=None), M["silicon"])
    pads = []
    for side in range(4):
        for i in range(24):
            t = -11.5 + i * 1.0
            x, y = [(t, -12.8), (t, 12.8), (-12.8, t), (12.8, t)][side]
            pads.append(K.T(x, y, 4.62, rz=0 if side < 2 else math.pi / 2))
    K.instances("interposer_pad", K.box(0.45, 0.8, 0.04, uv=None), M["gold"], pads, ip.node)
    ip.build()
    chip_root, layout = build_chip(root, origin=(0, 0, 4.6), mats=M, lod=1 if lod < 2 else 1)
    chip_root["component"] = "pkg_die"
    chip_root["explode"] = [0, 38, 0]
    chip_root["label"] = "AURORA-Q T1 qubit die (120 transmons)"

    # wire bonds: die launch pads -> interposer pads; interposer pads -> PCB
    if lod >= 2:
        wb = K.Assembly("pkg_wirebonds", root, component="pkg_wirebonds", explode=(0, 0, 32),
                        label="Al wire bonds (≈ 25 µm, shown thicker)")
        for lp in layout["launch_pads"]:
            sx = -1 if lp["side"] == "W" else 1
            p0 = (lp["x"], lp["y"], 5.1)
            p1 = (sx * 12.8, lp["y"] * 1.12, 4.62)
            wb.add(bond_wire(p0, p1, 0.5), M["aluminum"])
        for m in pads[::2]:
            x, y = m.translation.x, m.translation.y
            r = math.hypot(x, y)
            p1 = (x / r * (r + 3.2) if abs(x) > abs(y) else x * 1.08, y * 1.08 if abs(x) > abs(y) else y / r * (r + 3.2), 6.4)
            wb.add(bond_wire((x, y, 4.62), p1, 0.9), M["aluminum"])
        wb.build()

    # filter die in the second window
    fd = K.Assembly("pkg_filter_die", root, component="pkg_filter_die", explode=(0, 0, 30),
                    label="Purcell / band-pass filter die (readout protection)")
    fd.add(K.box(7, 11, 0.45, matrix=K.T(32, 0, 5.0), bevel=0.04, uv=None), M["silicon"])
    for i in range(5):
        y = -4 + i * 2
        pts = [(29.5, y, 5.24)] + [(29.5 + 0.5 * k, y + (0.5 if k % 2 else -0.5) * 0.6, 5.24) for k in range(1, 10)] + [(34.5, y, 5.24)]
        fd.add(K.curve_tube(pts, 0.06, res_u=2, bevel_res=0), M["film"])
    fd.build()

    # --------------------------------------------------------------- cover plate
    cov = K.Assembly("pkg_cover", root, component="pkg_cover", explode=(0, 0, 44),
                     label="Bead-blasted cover plate (chip + filter windows)")
    cov.add(K.profile_solid([K.rounded_rect_pts(66, 40, 3, 10, 0), K.rounded_rect_pts(29, 29, 2.2, 0, 0),
                             K.rounded_rect_pts(10, 14, 2.0, 32, 0)], 2.4, bevel=0.3, z=7.6, uv=None), bead)
    cov.build()

    # ---------------------------------------------------------------- clamp bars
    bars = K.Assembly("pkg_clamps", root, component="pkg_clamps", explode=(0, 0, 54),
                      label="Clamp bars (Au) pressing the PCB onto the base for thermalisation")
    bar_y = [44.0, 28.0, -28.0, -44.0]
    screws = []
    for i, y in enumerate(bar_y):
        bars.add(K.profile_solid([K.rounded_rect_pts(76, 11 if i in (1, 2) else 9, 2.5, 0, y)], 3.0, bevel=0.35, z=8.0, uv=None), M["gold"])
        for sx in (-31, 31):
            screws.append(K.T(sx, y, 9.5))
    bars.add(K.text_mesh("AURORA-Q", 5.2, 0.35, matrix=K.T(0, 28.0, 9.55)), M["label_dark"])
    bars.add(K.text_mesh("T1  ·  120Q", 5.2, 0.35, matrix=K.T(0, -28.0, 9.55)), M["label_dark"])
    bars.add(K.text_mesh("AQ-T1-PKG  rev A   2026-10", 1.6, 0.2, font=K.FONT_MONO, matrix=K.T(0, -44.0, 9.55)), M["label_dark"])
    bars.build()
    K.instances("clamp_screw", socket_screw(2.3, 1.8), M["gold"], screws, bars.node)
    K.instances("clamp_screw_socket", K.hex_prism(1.0, 0.4), M["label_dark"], [m @ K.T(z=1.65) for m in screws], bars.node)

    # rim screws (hold the lid)
    rim = [K.T(x, y, 16.0) for x, y in holes]

    # -------------------------------------------------------------------------- lid
    lid = K.Assembly("pkg_lid", root, component="pkg_lid", explode=(0, 0, 80),
                     label="Lid (Au-plated copper) — closes the light-tight sample space")
    lid_loops = [K.rounded_rect_pts(W, H, 9)] + [K.circle_pts(1.5, x, y, 14) for x, y in holes]
    lid.add(K.profile_solid(lid_loops, 3.0, bevel=0.5, z=17.5, uv=None), M["gold_satin"])
    lid.add(K.text_mesh("AURORA-Q", 9.0, 0.4, matrix=K.T(0, 6, 19.1)), M["label_dark"])
    lid.add(K.text_mesh("DESIGN STUDY · NOT A FABRICATED DEVICE", 2.4, 0.25, font=K.FONT_MONO, matrix=K.T(0, -6, 19.1)), M["label_dark"])
    lid.build()
    K.instances("lid_screw", socket_screw(2.2, 1.8), M["gold"], [K.T(x, y, 19.0) for x, y in holes], lid.node)
    K.instances("lid_screw_socket", K.hex_prism(0.95, 0.4), M["label_dark"], [K.T(x, y, 20.65) for x, y in holes], lid.node)
    _ = rim
    K.Assembly.uv_scale = prev_uv
    return root, layout
