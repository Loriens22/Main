"""Full AURORA-Q installation: support frame, cryostat, control racks, GHS, compressor, cable tray."""

from __future__ import annotations

import math

from . import core as K
from .cryostat import build_cryostat


def frame(root, M):
    a = K.Assembly("frame", root, component="frame", explode=(0, 0, 0),
                   label="Vibration-isolated support frame (black-anodised aluminium extrusion)")
    s = 0.62
    for x in (-s, s):
        for y in (-s, s):
            a.add(K.box(0.06, 0.06, 2.42, matrix=K.T(x, y, 1.21), bevel=0.004), M["anodized"])
            a.add(K.cylinder(0.055, 0.05, 32, matrix=K.T(x, y, 0.025)), M["rubber"])  # isolator
            a.add(K.cylinder(0.04, 0.03, 6, matrix=K.T(x, y, 0.065)), M["stainless"])
    for z in (2.38, 2.18, 0.42):
        for (x0, y0, x1, y1) in ((-s, -s, s, -s), (-s, s, s, s), (-s, -s, -s, s), (s, -s, s, s)):
            L = math.hypot(x1 - x0, y1 - y0)
            a.add(K.box(L if y0 == y1 else 0.06, L if x0 == x1 else 0.06, 0.06,
                        matrix=K.T((x0 + x1) / 2, (y0 + y1) / 2, z), bevel=0.004), M["anodized"])
    # top-plate carrier ring + hangers
    a.add(K.tube(0.47, 0.40, 0.03, 96, matrix=K.T(0, 0, 2.18)), M["anodized"])
    for i in range(4):
        ang = math.pi / 4 + i * math.pi / 2
        a.add(K.box(0.30, 0.05, 0.05, matrix=K.T(0.53 * math.cos(ang), 0.53 * math.sin(ang), 2.18, rz=ang), bevel=0.004), M["anodized"])
    # service platform label plate
    a.add(K.box(0.36, 0.006, 0.08, matrix=K.T(0, -s - 0.033, 2.30), bevel=0.002), M["aluminum"])
    a.add(K.text_mesh("AURORA-Q  ·  T1 CRYOSTAT", 0.026, 0.002, matrix=K.T(0, -s - 0.037, 2.30, rx=math.pi / 2)), M["label_dark"])
    a.build()


def rack(root, M, name, label, x, kind):
    a = K.Assembly(name, root, component=name, explode=(0.0, -0.9, 0.0), label=label)
    W, D, H = 0.60, 1.00, 2.00
    y0 = 0.30
    # frame posts + side panels
    for dx in (-W / 2 + 0.02, W / 2 - 0.02):
        a.add(K.box(0.04, D, H, matrix=K.T(x + dx, y0, H / 2), bevel=0.004), M["rack"])
    a.add(K.box(W, D, 0.05, matrix=K.T(x, y0, H - 0.025), bevel=0.004), M["rack"])
    a.add(K.box(W, D, 0.08, matrix=K.T(x, y0, 0.04), bevel=0.004), M["rack"])
    a.add(K.box(W - 0.08, 0.02, H - 0.13, matrix=K.T(x, y0 + D / 2 - 0.01, H / 2), bevel=0.002), M["rack"])
    yf = y0 - D / 2 + 0.03
    # rack-unit modules
    U = 0.04445
    leds, smas, ports = [], [], []
    z = 0.12
    if kind == "awg":
        units = [3] * 12
    elif kind == "fpga":
        units = [2] * 12 + [1, 1, 4, 4]
    else:
        units = [4] * 8 + [2]
    for k, u in enumerate(units):
        h = u * U - 0.004
        a.add(K.box(W - 0.06, 0.6, h, matrix=K.T(x, yf + 0.30, z + h / 2), bevel=0.003), M["anodized"] if kind != "hpc" else M["rack"])
        a.add(K.box(W - 0.05, 0.01, h, matrix=K.T(x, yf - 0.003, z + h / 2), bevel=0.002), M["aluminum"])
        if kind == "awg":
            for c in range(16):
                for r in range(2):
                    smas.append(K.T(x - 0.20 + c * 0.024, yf - 0.012, z + 0.035 + r * 0.05, rx=math.pi / 2))
            leds += [K.T(x + 0.235, yf - 0.009, z + 0.02 + i * 0.03) for i in range(3)]
            a.add(K.box(0.07, 0.004, 0.045, matrix=K.T(x + 0.17, yf - 0.009, z + 0.09)), M["screen"])
        elif kind == "fpga":
            for c in range(12):
                ports.append(K.T(x - 0.20 + c * 0.03, yf - 0.009, z + h / 2))
            leds += [K.T(x - 0.24 + i * 0.012, yf - 0.009, z + h - 0.012) for i in range(8)]
        else:
            for r in range(max(1, u * 2)):
                a.add(K.box(W - 0.14, 0.004, 0.008, matrix=K.T(x - 0.02, yf - 0.009, z + 0.012 + r * 0.02)), M["black"])
            leds += [K.T(x + 0.24, yf - 0.009, z + h / 2 + i * 0.012) for i in range(2)]
        z += u * U + 0.004
    a.add(K.text_mesh(label.split("—")[0].strip().upper(), 0.024, 0.002, matrix=K.T(x, yf - 0.016, H - 0.09, rx=math.pi / 2)), M["aluminum"])
    a.build()
    if smas:
        K.instances(f"{name}_sma", K.cylinder(0.0045, 0.014, 12), M["gold"], smas, a.node)
    if ports:
        K.instances(f"{name}_qsfp", K.box(0.018, 0.012, 0.012, bevel=0.001), M["stainless"], ports, a.node)
    K.instances(f"{name}_led", K.cylinder(0.0025, 0.004, 8, matrix=K.T(rx=math.pi / 2)),
                M["led_blue"] if kind == "fpga" else M["led_green"], leds, a.node)


def ghs(root, M):
    a = K.Assembly("ghs", root, component="ghs", explode=(-0.6, 0.0, 0.0),
                   label="Gas-handling system (³He/⁴He mixture, pumps, valves)")
    x, y = -1.55, 0.25
    a.add(K.box(0.80, 0.60, 1.40, matrix=K.T(x, y, 0.70), bevel=0.01), M["rack"])
    a.add(K.box(0.70, 0.01, 0.60, matrix=K.T(x, y - 0.305, 1.05), bevel=0.003), M["aluminum"])
    gauges = []
    for i in range(4):
        gauges.append(K.T(x - 0.24 + i * 0.16, y - 0.315, 1.20, rx=math.pi / 2))
    knobs = [K.T(x - 0.27 + i * 0.09, y - 0.315, 0.90, rx=math.pi / 2) for i in range(7)]
    a.add(K.text_mesh("GAS HANDLING", 0.035, 0.002, matrix=K.T(x, y - 0.315, 1.33, rx=math.pi / 2)), M["label_dark"])
    a.build()
    K.instances("gauge", K.cylinder(0.05, 0.03, 32), M["stainless"], gauges, a.node)
    K.instances("gauge_glass", K.cylinder(0.042, 0.004, 32), M["screen"], [g @ K.T(z=0.017) for g in gauges], a.node)
    K.instances("valve_knob", K.cylinder(0.02, 0.04, 6), M["black"], knobs, a.node)
    # still pumping line from cryostat top to GHS
    pl = K.Assembly("pumping_line", root, component="ghs", explode=(-0.6, 0, 0), label="Still pumping line")
    pl.add(K.curve_tube([(0, 0, 2.42), (0, 0, 2.58), (-0.5, 0.05, 2.62), (-1.3, 0.2, 2.2), (-1.5, 0.25, 1.45)], 0.04, res_u=6, bevel_res=3), M["stainless"])
    pl.build()


def compressor(root, M):
    a = K.Assembly("compressor", root, component="compressor", explode=(-0.6, 0.6, 0.0),
                   label="Pulse-tube helium compressor (water-cooled)")
    x, y = -1.45, 1.25
    a.add(K.box(0.55, 0.65, 0.85, matrix=K.T(x, y, 0.425), bevel=0.02), M["aluminum"])
    a.add(K.box(0.40, 0.01, 0.12, matrix=K.T(x, y - 0.33, 0.70), bevel=0.003), M["screen"])
    for k, (dx, dz) in enumerate(((-0.08, 0.5), (0.08, 0.5))):
        a.add(K.curve_tube([(x + dx, y - 0.33, dz), (x + dx, y - 0.6, dz), (-0.6, 0.3, 1.2), (0.0, -0.08, 2.6), (0.32, -0.08, 2.33)],
                           0.016, res_u=8, bevel_res=2), M["braided"])
    a.build()


def cable_tray(root, M):
    a = K.Assembly("cable_tray", root, component="cable_tray", explode=(0, 0, 0.3),
                   label="Overhead cable tray: room-temperature control and readout cabling")
    y = -0.05
    z = 2.62
    a.add(K.box(2.9, 0.012, 0.06, matrix=K.T(1.65, y - 0.15, z)), M["aluminum"])
    a.add(K.box(2.9, 0.012, 0.06, matrix=K.T(1.65, y + 0.15, z)), M["aluminum"])
    rungs = [K.T(0.25 + i * 0.1, y, z - 0.02) for i in range(29)]
    # cable bundle from racks to the 300 K plate
    for k in range(6):
        off = (k - 2.5) * 0.03
        a.add(K.curve_tube([(3.0, y + off, 2.02), (3.0, y + off, z + 0.02), (1.0, y + off, z + 0.03),
                            (0.35, y + off * 0.5, z), (0.28, y + off * 0.5, 2.25), (0.28 * math.cos(k), 0.28 * math.sin(k), 2.16)],
                           0.012, res_u=8, bevel_res=2), M["black"])
    a.build()
    K.instances("tray_rung", K.box(0.012, 0.30, 0.012), M["aluminum"], rungs, a.node)


def build_installation(mats=None):
    M = mats or K.materials()
    root = K.empty("aurora_installation")
    root["units"] = "m"
    frame(root, M)
    build_cryostat(root, M)
    rack(root, M, "rack_control", "Control electronics — AWG / RF synthesis", 1.25, "awg")
    rack(root, M, "rack_decoder", "Real-time decoder — FPGA readout & QEC decoding", 1.90, "fpga")
    rack(root, M, "rack_hpc", "Hybrid compute — CPU/GPU AI accelerators", 2.55, "hpc")
    ghs(root, M)
    compressor(root, M)
    cable_tray(root, M)
    return root
