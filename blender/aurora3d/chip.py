"""AURORA-Q T1 qubit die (millimetre units) with raised superconducting features.

Exploded-view components: interposer (lifts away), bumps, raised film features, die.
The qubit die is shown face-up for visibility; the proposal assumes flip-chip bonding
(face-down onto the interposer through the indium bumps shown here).
"""

from __future__ import annotations

import math

import bmesh

from . import core as K
from .layout import build as build_layout


def _planar_uv(bm, w, h, cx=0.0, cy=0.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x - cx) / w + 0.5, (l.vert.co.y - cy) / h + 0.5)


def arch(span, height, width):
    pts = []
    for i in range(9):
        t = i / 8
        x = (t - 0.5) * span
        z = height * math.sin(math.pi * t) ** 0.7
        pts.append((x, 0.0, z))
    return K.curve_tube(pts, radius=width * 0.18, ribbon_width=width, res_u=2)


def build_chip(parent=None, origin=(0, 0, 0), mats=None, lod: int = 2, layout=None):
    M = mats or K.materials()
    L = layout or build_layout()
    from .textures import chip_textures

    base_tex, mr_tex = chip_textures(L)
    chip_mat = K.material("AURORA-Q die surface", (1, 1, 1), 1.0, 0.15, base_tex=base_tex, mr_tex=mr_tex)
    D = L["die"]
    t_die = 0.5
    root = K.empty("aurora_chip", parent, origin)
    root["units"] = "mm"

    # --- die body + textured skin -------------------------------------------------
    die = K.Assembly("chip_die", root, component="chip_die", explode=(0, 0, 0), label="Qubit die (Si, 20 × 20 mm)")
    die.add(K.box(D, D, t_die, matrix=K.T(z=t_die / 2), bevel=0.02, uv=None), M["silicon"])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=D / 2)
    bmesh.ops.translate(bm, vec=(0, 0, t_die + 0.001), verts=bm.verts)
    _planar_uv(bm, D, D)
    die.add(bm, chip_mat)
    die.build()

    zt = t_die + 0.001
    feat = K.empty("chip_features", root, component="chip_features", explode=(0, 0, 0.6),
                   label="Superconducting film features (Ta), heights exaggerated")
    pw, ph, pg = L["pad"]
    thick = 0.012
    pads = []
    for q in L["qubits"]:
        for sgn in (1, -1):
            pads.append(K.T(q["x"], q["y"] + sgn * (ph + pg) / 2, zt + thick / 2))
    K.instances("transmon_pad", K.box(pw, ph, thick, bevel=0.004, uv=None), M["film"], pads, feat)
    jj = [K.T(q["x"], q["y"], zt + 0.006) for q in L["qubits"]]
    K.instances("josephson_junction", K.box(0.012, pg + 0.02, 0.006, uv=None), M["indium"], jj, feat)
    sq = [K.T(cp["squid"][0], cp["squid"][1], zt + 0.006, rz=0 if cp["horizontal"] else math.pi / 2) for cp in L["couplers"]]
    loop = K.tube(0.036, 0.018, 0.012, segments=4, matrix=K.T(rz=math.pi / 4), uv=None)
    K.instances("coupler_squid", loop, M["film"], sq, feat)
    rsq = [K.T(r["squid"][0], r["squid"][1], zt + 0.006) for r in L["reset_elements"]]
    K.instances("reset_squid", K.tube(0.026, 0.012, 0.012, segments=4, matrix=K.T(rz=math.pi / 4), uv=None), M["gold"], rsq, feat)

    if lod >= 1:
        br = [K.T(b["x"], b["y"], zt, rz=b["angle"]) for b in L["airbridges"]]
        K.instances("airbridge", arch(0.12, 0.03, 0.03), M["film"], br, feat)
    if lod >= 1:
        bumps = K.empty("chip_bumps", root, component="chip_bumps", explode=(0, 0, 1.4),
                        label="Indium bump bonds (signal + ground)")
        pos = [K.T(b["x"], b["y"], zt + 0.02) for b in L["signal_bumps"] + L["ground_bumps"]]
        K.instances("indium_bump", K.sphere(0.028, 12, 6, matrix=K.T(s=1.0)), M["indium"], pos, bumps)

    # --- interposer (exploded upward) ------------------------------------------------
    if lod >= 2:
        ip = K.Assembly("chip_interposer", root, location=(0, 0, 0), component="chip_interposer",
                        explode=(0, 0, 3.2), label="Silicon interposer with TSVs (routes drive, flux and reset-pump lines)")
        z0 = zt + 0.08
        ip.add(K.box(D + 2, D + 2, 0.4, matrix=K.T(z=z0 + 0.2), bevel=0.02, uv=None), M["silicon"])
        ip.build()
        tsv = [K.T(b["x"], b["y"], z0 + 0.2) for b in L["signal_bumps"]]
        K.instances("tsv", K.cylinder(0.03, 0.42, segments=10, uv=None), M["copper"], tsv, ip.node)
    return root, L
