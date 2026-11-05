"""Dilution refrigerator ("chandelier") for one AURORA-Q tile, real scale (metres).

Stage temperatures follow standard dry dilution-refrigerator practice:
300 K top plate · 50 K (pulse-tube 1st stage) · 4 K (PT 2nd stage) · still (~0.8 K) ·
cold plate (~100 mK) · mixing chamber (~10 mK). Wiring follows the brief's reference
wiring diagram: attenuated drive lines (20 dB at 4 K, 10 dB at still/cold plate,
10–20 dB at MXC), IR / low-pass filters at the MXC, circulators + TWPA at the MXC and
a HEMT amplifier at 4 K on the readout output chain, NbTi superconducting coax below 4 K.
AURORA-Q proposal: high-density polyimide flex lines carry the 218 coupler-flux and
120 reset-pump lines (DC/low-frequency) so that coax is reserved for microwave lines.
"""

from __future__ import annotations

import math

from . import core as K
from .package import build_package

STAGES = [
    # key,        z_top,  radius, thick, material,      label,                                      temp
    ("plate_300k", 2.100, 0.400, 0.025, "stainless", "300 K top plate (vacuum flange)", "300 K"),
    ("plate_50k", 1.860, 0.360, 0.012, "copper_dark", "50 K plate (pulse-tube 1st stage)", "≈ 50 K"),
    ("plate_4k", 1.640, 0.330, 0.012, "gold_satin", "4 K plate (pulse-tube 2nd stage)", "≈ 3–4 K"),
    ("plate_still", 1.440, 0.290, 0.010, "gold_satin", "Still plate", "≈ 0.8 K"),
    ("plate_cold", 1.280, 0.270, 0.010, "gold_satin", "Cold plate", "≈ 100 mK"),
    ("plate_mxc", 1.100, 0.250, 0.012, "gold", "Mixing-chamber plate", "≈ 10 mK"),
]
N_COAX = 32
COAX_R = 0.195


def plate_loops(r, n_ports=12, center=0.045):
    loops = [K.circle_pts(r, seg=120)]
    loops.append(K.circle_pts(center, seg=32))
    for i in range(n_ports):
        a = 2 * math.pi * (i + 0.5) / n_ports
        loops.append(K.circle_pts(0.018, (r * 0.62) * math.cos(a), (r * 0.62) * math.sin(a), 20))
    for i in range(24):
        a = 2 * math.pi * i / 24
        loops.append(K.circle_pts(0.0035, (r - 0.012) * math.cos(a), (r - 0.012) * math.sin(a), 10))
    return loops


def coax_angle(i):
    return 2 * math.pi * i / N_COAX + 0.04


def build_cryostat(parent=None, mats=None, lod=2):
    M = mats or K.materials()
    root = K.empty("cryostat", parent)
    explode_z = {"plate_300k": 0.0, "plate_50k": -0.10, "plate_4k": -0.22, "plate_still": -0.36,
                 "plate_cold": -0.50, "plate_mxc": -0.66}
    nodes = {}
    z_prev = None
    for i, (key, z, r, t, mat, label, temp) in enumerate(STAGES):
        a = K.Assembly(key, root, component=key, explode=(0, 0, explode_z[key]), label=f"{label} — {temp}")
        a.node["temperature"] = temp
        a.add(K.profile_solid(plate_loops(r), t, bevel=0.0015, z=z - t / 2), M[mat])
        # thermalisation clamps + attenuators (instanced below) sit on plate; bolt ring
        if key == "plate_300k":
            # feedthrough flanges (KF / hermetic SMA) and pulse-tube port
            for j in range(8):
                ang = 2 * math.pi * j / 8 + 0.2
                x, y = 0.30 * math.cos(ang), 0.30 * math.sin(ang)
                a.add(K.cylinder(0.035, 0.03, 32, matrix=K.T(x, y, z + 0.015)), M["stainless"])
                a.add(K.cylinder(0.028, 0.006, 32, matrix=K.T(x, y, z + 0.033)), M["aluminum"])
            a.add(K.tube(0.06, 0.045, 0.30, 48, matrix=K.T(0, 0, z + 0.15)), M["stainless"])  # still pumping line
            a.add(K.cylinder(0.085, 0.02, 48, matrix=K.T(0, 0, z + 0.31)), M["stainless"])
        nodes[key] = a
        # support rods to the stage above
        if z_prev is not None:
            zt = z + t / 2
            zb = z_prev - STAGES[i - 1][3] / 2
            length = zb - zt
            rod_mat = M["stainless"] if key in ("plate_50k",) else M["g10"]
            for j in range(6):
                ang = 2 * math.pi * j / 6
                x, y = (r - 0.03) * math.cos(ang), (r - 0.03) * math.sin(ang)
                a.add(K.tube(0.011, 0.008, length, 20, matrix=K.T(x, y, zt + length / 2)), rod_mat)
                a.add(K.cylinder(0.016, 0.012, 24, matrix=K.T(x, y, zt + 0.006)), M["stainless"])
                a.add(K.cylinder(0.016, 0.012, 24, matrix=K.T(x, y, zb - 0.006)), M["stainless"])
        z_prev = z
    # ---- stage hardware ------------------------------------------------------------
    st = nodes["plate_still"]
    st.add(K.cylinder(0.075, 0.07, 48, matrix=K.T(0, 0, 1.44 - 0.005 - 0.035)), M["copper"])  # still pot
    st.add(K.tube(0.022, 0.018, 0.66, 24, matrix=K.T(0.0, 0.0, 1.44 + 0.33)), M["stainless"])  # pumping line
    cold = nodes["plate_cold"]
    # continuous counterflow heat exchanger (helix) between still and cold plate
    helix = [(0.11 * math.cos(t), 0.11 * math.sin(t), 1.29 + 0.14 * t / (2 * math.pi * 5)) for t in [k * 0.25 for k in range(126)]]
    cold.add(K.curve_tube(helix, 0.005, res_u=2, bevel_res=1), M["copper"])
    mx = nodes["plate_mxc"]
    for k in range(5):  # step heat exchangers (sintered silver)
        mx.add(K.cylinder(0.05, 0.022, 40, matrix=K.T(-0.12, 0.05, 1.11 + 0.03 + k * 0.028)), M["copper"])
    mx.add(K.cylinder(0.085, 0.06, 64, matrix=K.T(0, 0, 1.10 - 0.006 - 0.03)), M["gold"])  # mixing chamber body
    # cold finger + package mount
    mx.add(K.cylinder(0.022, 0.36, 32, matrix=K.T(0, 0, 1.10 - 0.06 - 0.18)), M["copper"])
    mx.add(K.box(0.16, 0.012, 0.20, matrix=K.T(0, 0.0, 0.60), bevel=0.002), M["copper"])
    # pulse tube: cold head motor on top, stages through plates
    pt = K.Assembly("pulse_tube", root, component="pulse_tube", explode=(0.0, 0.0, 0.25),
                    label="Pulse-tube cryocooler (2-stage): pre-cools 50 K and 4 K stages")
    px, py = 0.20, -0.08
    pt.add(K.cylinder(0.075, 0.20, 48, matrix=K.T(px, py, 2.11 + 0.10)), M["aluminum"])
    pt.add(K.cylinder(0.05, 0.10, 32, matrix=K.T(px + 0.12, py, 2.25), r2=0.05), M["anodized"])
    pt.add(K.box(0.10, 0.08, 0.06, matrix=K.T(px + 0.12, py, 2.33), bevel=0.006), M["anodized"])
    pt.add(K.cylinder(0.030, 0.24, 32, matrix=K.T(px, py, 1.98)), M["stainless"])
    pt.add(K.cylinder(0.065, 0.02, 48, matrix=K.T(px, py, 1.86 + 0.006 + 0.01)), M["copper"])
    pt.add(K.cylinder(0.018, 0.21, 32, matrix=K.T(px, py, 1.75)), M["stainless"])
    pt.add(K.cylinder(0.045, 0.02, 48, matrix=K.T(px, py, 1.64 + 0.006 + 0.01)), M["copper"])
    pt.build()

    # ---- coax wiring -----------------------------------------------------------------
    wiring = K.Assembly("coax_lines", root, component="coax_lines", explode=(0, 0, 0),
                        label=f"{N_COAX} coaxial lines shown (CuNi above 4 K, NbTi below)")
    att_mats = {"plate_4k": 20, "plate_still": 10, "plate_cold": 10, "plate_mxc": 20}
    att_pos = {k: [] for k in att_mats}
    clamp_pos = []
    zs = [s[1] for s in STAGES]
    for i in range(N_COAX):
        a = coax_angle(i)
        x, y = COAX_R * math.cos(a), COAX_R * math.sin(a)
        rd = 1.0 if i % 4 else 0.85  # every 4th line is a readout line routed slightly inward
        x, y = x * rd, y * rd
        for s in range(len(STAGES) - 1):
            z0 = zs[s] - STAGES[s][3] / 2
            z1 = zs[s + 1] + STAGES[s + 1][3] / 2
            dz = z0 - z1
            off = 0.012 * (1 if (i + s) % 2 else -1)
            pts = [(x, y, z0 - 0.02), (x, y, z0 - 0.05), (x + off * math.cos(a + 1.57), y + off * math.sin(a + 1.57), z0 - dz * 0.5),
                   (x, y, z1 + 0.05), (x, y, z1 + 0.035)]
            mat = M["coax"] if s < 2 else M["nbti"]
            wiring.add(K.curve_tube(pts, 0.0021, res_u=3, bevel_res=1), mat)
            key = STAGES[s + 1][0]
            if key in att_pos:
                att_pos[key].append(K.T(x, y, zs[s + 1] + STAGES[s + 1][3] / 2 + 0.02))
            clamp_pos.append(K.T(x, y, zs[s + 1] + STAGES[s + 1][3] / 2 + 0.004, rz=a))
        # 300 K connectors above the top plate
        wiring.add(K.curve_tube([(x, y, 2.113), (x, y, 2.16), (x * 1.05, y * 1.05, 2.21)], 0.0021, res_u=2, bevel_res=1), M["coax"])
    wiring.build()
    att_grp = K.empty("attenuators", root, component="attenuators", explode=(0, 0, 0),
                      label="Cryogenic attenuators (20 dB @4 K, 10 dB @still, 10 dB @cold plate, 20 dB @MXC)")
    att = K.cylinder(0.0055, 0.028, 16, matrix=K.T(z=0.0))
    K.instances("attenuator", att, M["gold"], [m for v in att_pos.values() for m in v], att_grp)
    K.instances("attenuator_sma", K.hex_prism(0.0058, 0.006), M["stainless"],
                [m @ K.T(z=s) for v in att_pos.values() for m in v for s in (-0.016, 0.016)], att_grp)
    K.instances("thermal_clamp", K.box(0.016, 0.010, 0.008, bevel=0.001), M["copper"], clamp_pos, att_grp)

    # ---- flex wiring (AURORA proposal) ----------------------------------------------
    flex = K.Assembly("flex_lines", root, component="flex_lines", explode=(0, 0, 0),
                      label="High-density polyimide flex (proposal): 218 coupler-flux + 120 reset-pump DC/LF lines")
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8 + 0.12
        x, y = 0.15 * math.cos(a), 0.15 * math.sin(a)
        for s in range(len(STAGES) - 1):
            z0 = zs[s] - STAGES[s][3] / 2
            z1 = zs[s + 1] + STAGES[s + 1][3] / 2
            pts = [(x, y, z0 - 0.005), (x * 1.04, y * 1.04, (z0 + z1) / 2), (x, y, z1 + 0.012)]
            flex.add(K.curve_tube(pts, 0.0004, res_u=4, ribbon_width=0.032, tilt=a + math.pi / 2), M["kapton"])
            flex.add(K.box(0.04, 0.012, 0.010, matrix=K.T(x, y, z1 + 0.012, rz=a + math.pi / 2), bevel=0.0015), M["black"])
    flex.build()

    # ---- readout chain ------------------------------------------------------------------
    ro = K.Assembly("readout_chain", root, component="readout_chain", explode=(0.0, -0.10, 0.0),
                    label="Readout chain: circulators + TWPA (MXC), HEMT amplifiers (4 K), IR/low-pass filters")
    for j in range(4):
        a = 2 * math.pi * j / 4 + 0.6
        x, y = 0.10 * math.cos(a), 0.10 * math.sin(a)
        ro.add(K.box(0.045, 0.032, 0.016, matrix=K.T(x, y, 1.64 + 0.006 + 0.008, rz=a), bevel=0.002), M["gold"])  # HEMT
        ro.add(K.box(0.024, 0.024, 0.014, matrix=K.T(x * 1.5, y * 1.5, 1.10 + 0.006 + 0.007, rz=a), bevel=0.0015), M["gold"])  # circulator
        ro.add(K.cylinder(0.008, 0.016, 24, matrix=K.T(x * 1.5, y * 1.5, 1.10 + 0.006 + 0.021)), M["black"])
        ro.add(K.box(0.05, 0.03, 0.010, matrix=K.T(x * 1.15, y * 1.15, 1.28 + 0.005 + 0.005, rz=a + 0.4), bevel=0.0015), M["gold"])  # TWPA / filters
        ro.add(K.cylinder(0.006, 0.05, 20, matrix=K.T(x * 0.6, y * 0.6, 1.10 - 0.006 - 0.025)), M["eccosorb"])
    ro.build()

    # ---- QPU module on the cold finger ----------------------------------------------
    q = K.empty("qpu_mount", root, location=(0, -0.012, 0.60), component="qpu_module", explode=(0, -0.25, -0.15),
                label="AURORA-Q T1 module (120-qubit tile) on the cold finger")
    build_package(q, mats=M, lod=1, rotation=(math.pi / 2, 0, 0), scale=0.001)
    # coax pigtails MXC -> package
    pig = K.Assembly("pigtails", root, component="coax_lines", explode=(0, 0, 0), label="Semi-rigid pigtails to the package")
    for i in range(10):
        a = 2 * math.pi * i / 10
        x0, y0 = 0.07 * math.cos(a), 0.07 * math.sin(a)
        xs = -0.06 + 0.012 * (i % 10)
        pig.add(K.curve_tube([(x0, y0, 1.04), (x0 * 0.9, y0 * 0.9 - 0.02, 0.86), (xs, -0.02, 0.72), (xs, -0.03, 0.665)], 0.0018, res_u=4, bevel_res=1), M["nbti"])
    pig.build()

    # ---- shields (hidden by default on the website) ----------------------------------
    sh = [("shield_mag", 0.11, 0.84, 0.44, "cryoperm", "Cryoperm magnetic shield around the QPU module", (0, 0, -0.55)),
          ("shield_still", 0.282, 1.43, 0.38, "copper", "Still radiation shield (≈ 0.8 K)", (0, 0, -1.1)),
          ("shield_4k", 0.322, 1.63, 0.34, "alu_shield", "4 K radiation shield", (0, 0, -1.25)),
          ("shield_50k", 0.352, 1.85, 0.30, "alu_shield", "50 K radiation shield", (0, 0, -1.4)),
          ("ovc", 0.392, 2.087, 0.26, "stainless", "Outer vacuum can (OVC), 300 K", (0, 0, -1.55))]
    for key, r, ztop, zbot, mat, label, ex in sh:
        s = K.Assembly(key, root, component=key, explode=ex, label=label)
        s.node["shield"] = True
        h = ztop - zbot
        s.add(K.tube(r, r - 0.003, h, 96, matrix=K.T(0, 0, zbot + h / 2)), M[mat])
        s.add(K.cylinder(r, 0.004, 96, matrix=K.T(0, 0, zbot)), M[mat])
        s.add(K.tube(r + 0.012, r - 0.003, 0.012, 96, matrix=K.T(0, 0, ztop - 0.006)), M[mat])
        s.build()
    for a in nodes.values():
        a.build()
    return root
