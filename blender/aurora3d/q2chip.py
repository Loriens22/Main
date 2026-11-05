"""AURORA-Q2 "Toroid" die stack, generated from the layout engine (backend/aurora/q2/layout.py).

Millimetre units. Components (exploded view, bottom -> top):
  q2_die          qubit die body + etched-film texture (Ta on Si)
  q2_features     raised film features: 288 transmons (4 shapes by role), 540 tunable couplers,
                  288 readout resonators, 36 feedlines, airbridges
  q2_bumps        indium bumps: ground lattice + one signal bump per interposer coupler end
  q2_route_a/b    interposer routing layers (Manhattan: runs along x on A, along y on B, vias)
  q2_ground       interposer ground planes (Nb), shown as perforated sheets
  q2_interposer   interposer substrate (rendered translucent) with TSVs
The qubit die is drawn face-up for visibility; the design flip-chip bonds it face-down onto
the interposer through the bumps.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bmesh

from . import core as K

LAYOUT_JSON = K.ROOT / "backend" / "results" / "q2_layout.json"
TEX_OUT = K.ROOT / "blender" / "textures"


def load_layout():
    return json.loads(LAYOUT_JSON.read_text())


def grid_xy(r, c, R, C, p):
    return ((r - (R - 1) / 2) * p, (c - (C - 1) / 2) * p)


# ------------------------------------------------------------------ texture
def die_textures(L, px_per_mm=190):
    from PIL import Image, ImageDraw, ImageFont

    S = L["summary"]
    R, C = S["grid"]
    p = S["pitch_mm"]
    W, H = S["die_mm"]
    w, h = int(W * px_per_mm), int(H * px_per_mm)
    film = (196, 198, 204)
    gap = (22, 25, 33)
    img = Image.new("RGB", (w, h), film)
    mr = Image.new("RGB", (w, h), (0, 60, 255))  # G = roughness, B = metallic
    d = ImageDraw.Draw(img)
    dm = ImageDraw.Draw(mr)

    def P(x, y):
        return (x + W / 2) * px_per_mm, (H / 2 - y) * px_per_mm

    def rect(x0, y0, x1, y1, col=gap, m=True):
        a, b = P(x0, y1)
        c, e = P(x1, y0)
        d.rectangle([a, b, c, e], fill=col)
        if m:
            dm.rectangle([a, b, c, e], fill=(0, 40, 80))

    # flux-trapping holes everywhere (removed where features sit by later fills)
    step = 0.05
    rr = 0.006 * px_per_mm
    y = -H / 2 + 0.6
    while y < H / 2 - 0.6:
        x = -W / 2 + 0.6
        while x < W / 2 - 0.6:
            cx, cy = P(x, y)
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=gap)
            x += step
        y += step
    # qubit pockets, coupler gaps, resonator gaps, feedline CPW gaps
    for q in L["qubits"]:
        x, y = grid_xy(q["r"], q["c"], R, C, p)
        rect(x - 0.2, y - 0.2, x + 0.2, y + 0.2)
        rect(x - 0.34, y + 0.11, x - 0.10, y + 0.29)  # resonator pocket
    for e in L["edges"]:
        if e["layer"] != "die":
            continue
        (r1, c1), (r2, c2) = e["p"]
        x1, y1 = grid_xy(r1, c1, R, C, p)
        x2, y2 = grid_xy(r2, c2, R, C, p)
        if abs(x2 - x1) > 1e-6:
            rect(min(x1, x2) + 0.18, y1 - 0.035, max(x1, x2) - 0.18, y1 + 0.035)
        else:
            rect(x1 - 0.035, min(y1, y2) + 0.18, x1 + 0.035, max(y1, y2) - 0.18)
    for fl in feedlines(L):
        (x0, y0), (x1, y1) = fl
        rect(x0, y0 - 0.03, x1, y0 + 0.03)
    # die edge, dicing lane, alignment marks, text
    rect(-W / 2, -H / 2, W / 2, -H / 2 + 0.25, (40, 44, 52))
    rect(-W / 2, H / 2 - 0.25, W / 2, H / 2, (40, 44, 52))
    rect(-W / 2, -H / 2, -W / 2 + 0.25, H / 2, (40, 44, 52))
    rect(W / 2 - 0.25, -H / 2, W / 2, H / 2, (40, 44, 52))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (W / 2 - 0.55), sy * (H / 2 - 0.55)
            rect(cx - 0.18, cy - 0.02, cx + 0.18, cy + 0.02)
            rect(cx - 0.02, cy - 0.18, cx + 0.02, cy + 0.18)
    try:
        font = ImageFont.truetype(K.FONT_MONO, int(0.22 * px_per_mm))
        small = ImageFont.truetype(K.FONT_MONO, int(0.13 * px_per_mm))
    except Exception:  # noqa: BLE001
        font = small = ImageFont.load_default()
    d.text(P(-W / 2 + 0.7, -H / 2 + 0.52), "AURORA-Q2  TOROID-G144   [[144,12,12]]   288 Q   d=12", fill=gap, font=font)
    d.text(P(W / 2 - 6.6, -H / 2 + 0.47), "Ta/Si  gap-eng. Al/AlOx JJ  rev B", fill=gap, font=small)
    TEX_OUT.mkdir(parents=True, exist_ok=True)
    a, b = TEX_OUT / "q2_die_base.png", TEX_OUT / "q2_die_mr.png"
    img.save(a)
    mr.save(b)
    return a, b


def feedlines(L):
    """36 feedlines: each serves 8 qubits along x in one column, offset +0.30 mm in y."""
    S = L["summary"]
    R, C = S["grid"]
    p = S["pitch_mm"]
    out = []
    for c in range(C):
        for k in range(R // 8):
            x0, y = grid_xy(8 * k, c, R, C, p)
            x1, _ = grid_xy(8 * k + 7, c, R, C, p)
            out.append(((x0 - 0.38, y + 0.30), (x1 + 0.38, y + 0.30)))
    return out


# ------------------------------------------------------------------ geometry
def meander(w=0.012, t=0.008):
    pts = [(-0.10, 0.0)]
    x = -0.10
    for i in range(8):
        y = 0.13 if i % 2 == 0 else 0.0
        pts += [(x, y), (x + 0.03, y)]
        x += 0.03
    pts.append((x, 0.17))
    bm = bmesh.new()
    for (xa, ya), (xb, yb) in zip(pts[:-1], pts[1:]):
        cx, cy = (xa + xb) / 2, (ya + yb) / 2
        lx, ly = abs(xb - xa) + w, abs(yb - ya) + w
        part = K.box(lx, ly, t, matrix=K.T(cx, cy, t / 2), uv=None)
        tmp = __import__("bpy").data.meshes.new("t")
        part.to_mesh(tmp)
        bm.from_mesh(tmp)
        __import__("bpy").data.meshes.remove(tmp)
        part.free()
    return bm


def merge(*bms):
    import bpy

    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new("m")
        b.to_mesh(me)
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
        b.free()
    return out


def assign_tracks(inter, R, C):
    """Left-edge track assignment per routing channel so parallel runs never overlap."""
    chans = {}
    for k, e in enumerate(inter):
        rt = e["route"]
        for (a, b) in ((rt[0], rt[1]), (rt[1], rt[2])):
            if a == b:
                continue
            if a[1] == b[1]:   # varying r (x direction) at fixed column -> layer A
                key = ("A", a[1])
                lo, hi = sorted((a[0], b[0]))
            else:              # varying c (y direction) at fixed row -> layer B
                key = ("B", a[0])
                lo, hi = sorted((a[1], b[1]))
            chans.setdefault(key, []).append((lo, hi, k))
    track = {}
    maxt = 0
    for key, iv in chans.items():
        iv.sort()
        ends = []
        for lo, hi, k in iv:
            t = next((i for i, e_ in enumerate(ends) if e_ <= lo - 0.01), None)
            if t is None:
                ends.append(hi)
                t = len(ends) - 1
            else:
                ends[t] = hi
            track[(key, k)] = t
        maxt = max(maxt, len(ends))
    return track, maxt


def build_toroid(parent=None, origin=(0, 0, 0), mats=None, lod=2):
    M = mats or K.materials()
    L = load_layout()
    S = L["summary"]
    R, C = S["grid"]
    p = S["pitch_mm"]
    W, H = S["die_mm"]
    base_tex, mr_tex = die_textures(L)
    skin = K.material("Toroid die film (Ta on Si)", (1, 1, 1), 1.0, 0.2, base_tex=base_tex, mr_tex=mr_tex)
    film = M["film"]
    nb = K.material("Niobium routing", (0.70, 0.71, 0.76), 1.0, 0.26)
    nb_l2 = K.material("Niobium routing (layer B)", (0.80, 0.66, 0.42), 1.0, 0.26)
    si_glass = K.material("Silicon interposer (rendered translucent)", (0.32, 0.38, 0.5), 0.1, 0.08, alpha=0.2)
    gplane = K.material("Nb ground plane", (0.62, 0.63, 0.68), 1.0, 0.32, alpha=0.22)
    root = K.empty("q2_toroid", parent, origin)
    root["units"] = "mm"
    t_die = 0.5
    zt = t_die + 0.001

    # --- die
    die = K.Assembly("q2_die", root, component="q2_die", explode=(0, 0, 0),
                     label=f"Qubit die · Ta on high-resistivity Si · {W:.1f} × {H:.1f} mm")
    die.add(K.box(W, H, t_die, matrix=K.T(z=t_die / 2), bevel=0.02, uv=None), M["silicon"])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(W, H, 1), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, zt), verts=bm.verts)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co.x / W + 0.5, lp.vert.co.y / H + 0.5)
    die.add(bm, skin)
    die.build()

    # --- raised features
    feat = K.empty("q2_features", root, component="q2_features", explode=(0, 0, 0.8),
                   label="Superconducting circuit: 288 transmons, 540 tunable couplers, 288 resonators, 36 feedlines")
    th = 0.012
    by_type = {"X": [], "Z": [], "L": [], "R": []}
    for q in L["qubits"]:
        x, y = grid_xy(q["r"], q["c"], R, C, p)
        by_type[q["type"]].append((x, y))
    # data qubits: double-pad transmons (L horizontal, R vertical)
    dp = merge(K.box(0.13, 0.26, th, matrix=K.T(-0.085, 0, zt + th / 2), bevel=0.004, uv=None),
               K.box(0.13, 0.26, th, matrix=K.T(0.085, 0, zt + th / 2), bevel=0.004, uv=None))
    K.instances("q2_data_L", dp, film, [K.T(x, y, 0) for x, y in by_type["L"]], feat)
    dp2 = merge(K.box(0.13, 0.26, th, matrix=K.T(-0.085, 0, zt + th / 2), bevel=0.004, uv=None),
                K.box(0.13, 0.26, th, matrix=K.T(0.085, 0, zt + th / 2), bevel=0.004, uv=None))
    K.instances("q2_data_R", dp2, film, [K.T(x, y, 0, rz=math.pi / 2) for x, y in by_type["R"]], feat)
    # X checks: cross (xmon); Z checks: disc in ring
    xm = merge(K.box(0.34, 0.07, th, matrix=K.T(z=zt + th / 2), bevel=0.003, uv=None),
               K.box(0.07, 0.34, th, matrix=K.T(z=zt + th / 2), bevel=0.003, uv=None))
    K.instances("q2_check_X", xm, film, [K.T(x, y, 0) for x, y in by_type["X"]], feat)
    zr = merge(K.cylinder(0.09, th, segments=28, matrix=K.T(z=zt + th / 2), uv=None),
               K.tube(0.165, 0.125, th, segments=36, matrix=K.T(z=zt + th / 2), uv=None))
    K.instances("q2_check_Z", zr, film, [K.T(x, y, 0) for x, y in by_type["Z"]], feat)
    jj = [K.T(x, y, zt + 0.004) for x, y in (by_type["L"] + by_type["R"])]
    K.instances("q2_junction", K.box(0.014, 0.05, 0.008, uv=None), M["indium"], jj, feat)
    # tunable couplers on the die (540)
    cpl = []
    for e in L["edges"]:
        if e["layer"] != "die":
            continue
        (r1, c1), (r2, c2) = e["p"]
        x1, y1 = grid_xy(r1, c1, R, C, p)
        x2, y2 = grid_xy(r2, c2, R, C, p)
        cpl.append(K.T((x1 + x2) / 2, (y1 + y2) / 2, 0, rz=0 if abs(x2 - x1) > 1e-6 else math.pi / 2))
    bar = merge(K.box(0.15, 0.03, th, matrix=K.T(-0.12, 0, zt + th / 2), uv=None),
                K.box(0.15, 0.03, th, matrix=K.T(0.12, 0, zt + th / 2), uv=None),
                K.tube(0.034, 0.016, th, segments=4, matrix=K.T(z=zt + th / 2, rz=math.pi / 4), uv=None))
    K.instances("q2_coupler", bar, film, cpl, feat)
    sq = [m @ K.T(0, 0, zt + 0.004) for m in cpl]
    K.instances("q2_coupler_squid", K.box(0.012, 0.03, 0.008, uv=None), M["gold"], sq, feat)
    # readout resonators + feedlines + airbridges
    res = [K.T(x - 0.22, y + 0.12, zt) for q in L["qubits"] for (x, y) in [grid_xy(q["r"], q["c"], R, C, p)]]
    K.instances("q2_resonator", meander(), film, res, feat)
    fa = K.Assembly("q2_feedlines", feat)
    for (x0, y0), (x1, _) in feedlines(L):
        fa.add(K.box(x1 - x0, 0.022, th, matrix=K.T((x0 + x1) / 2, y0, zt + th / 2), uv=None), film)
        fa.add(K.box(0.18, 0.16, th, matrix=K.T(x0 - 0.06, y0, zt + th / 2), uv=None), M["gold"])  # launch pads
        fa.add(K.box(0.18, 0.16, th, matrix=K.T(x1 + 0.06, y0, zt + th / 2), uv=None), M["gold"])
    fa.build()
    if lod >= 1:
        brs = []
        for e in L["edges"]:
            if e["layer"] != "die":
                continue
            (r1, c1), (r2, c2) = e["p"]
            if r1 == r2:   # coupler along y crosses the feedline of column min(c1,c2)
                x, y = grid_xy(r1, min(c1, c2), R, C, p)
                brs.append(K.T(x, y + 0.30, zt, rz=math.pi / 2))
        arch = []
        for i in range(9):
            t = i / 8
            arch.append(((t - 0.5) * 0.12, 0.0, 0.035 * math.sin(math.pi * t) ** 0.7))
        K.instances("q2_airbridge", K.curve_tube(arch, radius=0.005, ribbon_width=0.03, res_u=2), film,
                    [b @ K.T(z=th) for b in brs], feat)

    # --- bumps
    bumps = K.empty("q2_bumps", root, component="q2_bumps", explode=(0, 0, 2.0),
                    label="Indium bumps · ground lattice + signal bumps for every interposer coupler end")
    gb = [K.T((i - R / 2) * p, (j - C / 2) * p, zt + 0.03) for i in range(R + 1) for j in range(C + 1)
          if abs((j - C / 2) * p - 0.3) > 0.05]
    K.instances("q2_bump_gnd", K.cylinder(0.035, 0.05, segments=14, uv=None), M["indium"], gb, bumps)
    inter = [e for e in L["edges"] if e["layer"] == "interposer"]
    ends = {}
    for e in inter:
        for (r, c) in (e["route"][0], e["route"][-1]):
            ends[(r, c)] = ends.get((r, c), 0) + 1
    sb = []
    sig_pos = {}
    for (r, c), n in ends.items():
        x, y = grid_xy(r, c, R, C, p)
        for k in range(n):
            px, py = x + 0.25, y - 0.12 - 0.09 * k
            sig_pos.setdefault((r, c), []).append((px, py))
            sb.append(K.T(px, py, zt + 0.03))
    K.instances("q2_bump_sig", K.cylinder(0.028, 0.05, segments=14, uv=None), M["gold"], sb, bumps)

    # --- interposer routing (Manhattan, two layers)
    z_ip = zt + 0.07                 # interposer bottom face (above the bumps)
    zA, zB = z_ip + 0.03, z_ip + 0.09
    track, maxt = assign_tracks(inter, R, C)
    tp = 0.36 / max(maxt, 1)
    ra = K.Assembly("q2_route_a", root, component="q2_route_a", explode=(0, 0, 3.6),
                    label=f"Routing layer A · long couplers along x · ≤ {maxt} tracks per channel")
    rb = K.Assembly("q2_route_b", root, component="q2_route_b", explode=(0, 0, 5.0),
                    label="Routing layer B · long couplers along y · vias at every corner")
    vias = []
    used_end = {}
    for k, e in enumerate(inter):
        rt = e["route"]
        segs = []
        for (a, b) in ((rt[0], rt[1]), (rt[1], rt[2])):
            if a == b:
                continue
            if a[1] == b[1]:
                key = ("A", a[1]); t = track[(key, k)]
                xa, y0 = grid_xy(a[0], a[1], R, C, p)
                xb, _ = grid_xy(b[0], a[1], R, C, p)
                yy = y0 + 0.40 - 0.18 + (t + 0.5) * tp
                segs.append(("A", (xa, yy), (xb, yy)))
            else:
                key = ("B", a[0]); t = track[(key, k)]
                x0, ya = grid_xy(a[0], a[1], R, C, p)
                _, yb = grid_xy(a[0], b[1], R, C, p)
                xx = x0 + 0.40 - 0.18 + (t + 0.5) * tp
                segs.append(("B", (xx, ya), (xx, yb)))
        # endpoints: jog from signal bump to channel on the endpoint's layer
        pts = []
        for idx, (r, c) in ((0, rt[0]), (1, rt[-1])):
            j = used_end.get((r, c), 0)
            used_end[(r, c)] = j + 1
            pts.append(sig_pos[(r, c)][min(j, len(sig_pos[(r, c)]) - 1)])
        if len(segs) == 2:
            (la, a0, a1), (lb, b0, b1) = segs
            corner = (b0[0], a0[1]) if la == "A" else (a0[0], b0[1])
            segs[0] = (la, a0, corner if la == "A" else corner)
            segs[1] = (lb, corner, b1)
        for li, (lay, s0, s1) in enumerate(segs):
            asm, z = (ra, zA) if lay == "A" else (rb, zB)
            L_ = math.hypot(s1[0] - s0[0], s1[1] - s0[1])
            if L_ < 1e-6:
                continue
            ang = math.atan2(s1[1] - s0[1], s1[0] - s0[0])
            asm.add(K.box(L_ + 0.012, 0.012, 0.008, matrix=K.T((s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2, z, rz=ang), uv=None),
                    nb if lay == "A" else nb_l2)
        if len(segs) == 2:
            vias.append(K.T(segs[1][1][0], segs[1][1][1], (zA + zB) / 2))
        # stubs from bumps to the first/last segment
        for (bx, by), (lay, s0, s1), end in ((pts[0], segs[0], 0), (pts[1], segs[-1], 1)):
            tgt = s0 if end == 0 else s1
            asm, z = (ra, zA) if lay == "A" else (rb, zB)
            for (u0, u1) in (((bx, by), (tgt[0], by)), ((tgt[0], by), tgt)):
                L_ = math.hypot(u1[0] - u0[0], u1[1] - u0[1])
                if L_ > 1e-6:
                    ang = math.atan2(u1[1] - u0[1], u1[0] - u0[0])
                    asm.add(K.box(L_ + 0.012, 0.012, 0.008, matrix=K.T((u0[0] + u1[0]) / 2, (u0[1] + u1[1]) / 2, z, rz=ang), uv=None),
                            nb if lay == "A" else nb_l2)
            vias.append(K.T(bx, by, (z_ip + z) / 2, s=1.0))
    ra.build()
    rb.build()
    K.instances("q2_via", K.cylinder(0.01, 0.06, segments=8, uv=None), M["copper"], vias, rb.node)

    # --- ground planes + substrate + TSVs
    gp = K.Assembly("q2_ground", root, component="q2_ground", explode=(0, 0, 6.4),
                    label="Interposer ground planes (Nb) shielding layers A and B")
    for z in (zA - 0.02, zB + 0.025):
        gp.add(K.box(W + 0.6, H + 0.6, 0.004, matrix=K.T(z=z), uv=None), gplane)
    gp.build()
    ip = K.Assembly("q2_interposer", root, component="q2_interposer", explode=(0, 0, 8.0),
                    label="Silicon interposer · 2 routing layers + 3 ground planes · TSVs to the package")
    ip.add(K.box(W + 0.8, H + 0.8, 0.38, matrix=K.T(z=z_ip + 0.19), bevel=0.02, uv=None), si_glass)
    # periphery launch pads (to flex) on the interposer top face
    for i in range(48):
        x = -W / 2 + 0.4 + i * (W - 0.8) / 47
        for sy in (-1, 1):
            ip.add(K.box(0.16, 0.3, 0.01, matrix=K.T(x, sy * (H / 2 + 0.2), z_ip + 0.385), uv=None), M["gold"])
    ip.build()
    tsv = [K.T(-W / 2 + 0.4 + i * (W - 0.8) / 47, sy * (H / 2 + 0.2), z_ip + 0.19) for i in range(48) for sy in (-1, 1)]
    tsv += [K.T((i - R / 2 + 0.5) * p * 2, (j - C / 2 + 0.5) * p * 2, z_ip + 0.19) for i in range(R // 2) for j in range(C // 2)]
    K.instances("q2_tsv", K.cylinder(0.025, 0.38, segments=10, uv=None), M["copper"], tsv, ip.node)
    return root, L, {"tracks": maxt, "track_pitch_mm": tp, "vias": len(vias), "signal_bumps": len(sb),
                     "ground_bumps": len(gb)}
