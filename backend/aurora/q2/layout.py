"""Toroid layout engine: physical embedding of a bivariate bicycle code on a two-tier die stack.

Placement (for A = x^a1 + y^a2 + y^a3, B = y^b1 + x^b2 + x^b3; gross code: x^3+y+y^2, y^3+x+x^2):
  X(i,j) -> (2i, 2j)      L(i,j) -> (2i, 2j-3)      R(i,j) -> (2i-3, 2j)      Z(i,j) -> (2i-3, 2j-3)
on a 2l x 2m grid (mod 2l, 2m). With this choice the four couplings X-L(g+y), X-L(g+y^2), X-R(g+x),
X-R(g+x^2) and their Z-check counterparts are exactly nearest-neighbour: the short graph is the
toroidal square grid C_2l x C_2m. The x^3 / y^3 terms are the long-range couplings.

A torus is not planar, so the die keeps the open square grid (planar, all couplers one pitch long)
and the wrap-around grid edges plus all long-range couplings move to interposer routing layers.
Straight-segment crossings in the interposer are counted, and a greedy colouring of the crossing
graph gives an upper bound on the number of routing layers needed with straight routing.
"""

from __future__ import annotations

import json
import math
import pathlib

import numpy as np

from .codes import bb_code


def placement(code):
    l, m = code.meta["l"], code.meta["m"]
    R, C = 2 * l, 2 * m
    pos = {}
    for i in range(l):
        for j in range(m):
            g = i * m + j
            pos[("X", g)] = ((2 * i) % R, (2 * j) % C)
            pos[("L", g)] = ((2 * i) % R, (2 * j - 3) % C)
            pos[("R", g)] = ((2 * i - 3) % R, (2 * j) % C)
            pos[("Z", g)] = ((2 * i - 3) % R, (2 * j - 3) % C)
    assert len(set(pos.values())) == R * C, "placement is not a bijection onto the grid"
    return pos, R, C


def couplings(code):
    l, m = code.meta["l"], code.meta["m"]
    gi = lambda i, j: (i % l) * m + (j % m)
    A, B = code.meta["A"], code.meta["B"]
    e = []
    for i in range(l):
        for j in range(m):
            g = gi(i, j)
            for t, (a, b) in enumerate(A):
                e.append((("X", g), ("L", gi(i + a, j + b)), f"A{t + 1}"))
                e.append((("Z", g), ("R", gi(i - a, j - b)), f"A{t + 1}"))
            for t, (a, b) in enumerate(B):
                e.append((("X", g), ("R", gi(i + a, j + b)), f"B{t + 1}"))
                e.append((("Z", g), ("L", gi(i - a, j - b)), f"B{t + 1}"))
    return e


def _segments_cross(p1, p2, p3, p4) -> bool:
    def orient(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        return 0 if abs(v) < 1e-12 else (1 if v > 0 else -1)
    if len({p1, p2, p3, p4}) < 4:
        return False  # share an endpoint (meet at a qubit pad)
    o1, o2, o3, o4 = orient(p1, p2, p3), orient(p1, p2, p4), orient(p3, p4, p1), orient(p3, p4, p2)
    if o1 != o2 and o3 != o4 and 0 not in (o1, o2, o3, o4):
        return True
    # collinear overlap
    if o1 == o2 == o3 == o4 == 0:
        def proj(p):
            return p[0] * (p2[0] - p1[0]) + p[1] * (p2[1] - p1[1])
        a, b = sorted((proj(p1), proj(p2)))
        c, d = sorted((proj(p3), proj(p4)))
        return min(b, d) - max(a, c) > 1e-9
    return False


def crossing_layers(segs: list[tuple]) -> tuple[int, int, list[int]]:
    """Count pairwise crossings and greedily colour the crossing graph (layers needed, straight routing)."""
    n = len(segs)
    P = np.array([[s[0][0], s[0][1], s[1][0], s[1][1]] for s in segs], float)
    lo = np.minimum(P[:, :2], P[:, 2:]); hi = np.maximum(P[:, :2], P[:, 2:])
    adj = [[] for _ in range(n)]
    crossings = 0
    for a in range(n):
        cand = np.nonzero((lo[a + 1:, 0] <= hi[a, 0]) & (hi[a + 1:, 0] >= lo[a, 0]) &
                          (lo[a + 1:, 1] <= hi[a, 1]) & (hi[a + 1:, 1] >= lo[a, 1]))[0] + a + 1
        for b in cand:
            if _segments_cross(segs[a][0], segs[a][1], segs[b][0], segs[b][1]):
                adj[a].append(b); adj[b].append(a); crossings += 1
    order = sorted(range(n), key=lambda i: -len(adj[i]))
    colour = [-1] * n
    for i in order:
        used = {colour[j] for j in adj[i] if colour[j] >= 0}
        c = 0
        while c in used:
            c += 1
        colour[i] = c
    return crossings, (max(colour) + 1 if n else 0), colour


def manhattan_routing(inter: list[dict], R: int, C: int, iters: int = 6) -> dict:
    """Two-layer Manhattan routing: vertical runs on layer V (channel right of the source column),
    horizontal runs on layer H (channel below the turn row), one via per coupler at the corner.
    Each coupler picks V-then-H or H-then-V; a few greedy passes minimise the peak channel density."""
    nV = np.zeros((C, R)); nH = np.zeros((R, C))
    choice = [0] * len(inter)

    def spans(e, ch):
        (r1, c1), (r2, c2) = e["p"]
        if ch == 0:   # V along c1 from r1->r2, then H along r2 from c1->c2
            return ("V", c1, min(r1, r2), max(r1, r2)), ("H", r2, min(c1, c2), max(c1, c2))
        return ("H", r1, min(c1, c2), max(c1, c2)), ("V", c2, min(r1, r2), max(r1, r2))

    def apply(e, ch, sgn):
        for kind, idx, a, b in spans(e, ch):
            if b > a:
                (nV if kind == "V" else nH)[idx, a:b] += sgn

    for k, e in enumerate(inter):
        apply(e, 0, 1)
    for _ in range(iters):
        for k, e in enumerate(inter):
            apply(e, choice[k], -1)
            best = None
            for ch in (0, 1):
                apply(e, ch, 1)
                score = max(nV.max(), nH.max()) * 1000 + (nV ** 2).sum() + (nH ** 2).sum()
                apply(e, ch, -1)
                if best is None or score < best[0]:
                    best = (score, ch)
            choice[k] = best[1]
            apply(e, choice[k], 1)
    for e, ch in zip(inter, choice):
        (r1, c1), (r2, c2) = e["p"]
        e["route"] = [[r1, c1], [r2, c1], [r2, c2]] if ch == 0 else [[r1, c1], [r1, c2], [r2, c2]]
    return {"max_tracks_V": int(nV.max()), "max_tracks_H": int(nH.max()),
            "mean_tracks": float(np.concatenate([nV[nV > 0], nH[nH > 0]]).mean()), "vias": len(inter)}


def toroid_layout(name: str = "gross144", pitch_mm: float = 0.8) -> dict:
    code = bb_code(name)
    pos, R, C = placement(code)
    edges = couplings(code)
    out_edges = []
    short_terms = {"A2", "A3", "B2", "B3"}
    for a, b, term in edges:
        (ra, ca), (rb, cb) = pos[a], pos[b]
        dr, dc = rb - ra, cb - ca
        wraps = abs(dr) > R / 2 or abs(dc) > C / 2
        torus_d = math.hypot(min(abs(dr), R - abs(dr)), min(abs(dc), C - abs(dc)))
        planar_d = math.hypot(dr, dc)
        if term in short_terms:
            assert abs(torus_d - 1) < 1e-9, (term, torus_d)
        layer = "die" if (term in short_terms and not wraps) else "interposer"
        out_edges.append({"a": f"{a[0]}{a[1]}", "b": f"{b[0]}{b[1]}", "term": term, "layer": layer,
                          "wrap": bool(wraps), "len_pitch": planar_d, "len_mm": planar_d * pitch_mm,
                          "p": [[ra, ca], [rb, cb]]})
    die = [e for e in out_edges if e["layer"] == "die"]
    inter = [e for e in out_edges if e["layer"] == "interposer"]
    segs_die = [(tuple(e["p"][0]), tuple(e["p"][1])) for e in die]
    segs_int = [(tuple(e["p"][0]), tuple(e["p"][1])) for e in inter]
    x_die, layers_die, _ = crossing_layers(segs_die)
    x_int, layers_int, colour = crossing_layers(segs_int)
    for e, c in zip(inter, colour):
        e["route_layer"] = int(c)
    man = manhattan_routing(inter, R, C)
    # long-range couplers only (excluding wrap-around grid edges)
    lr = [e for e in inter if e["term"] not in short_terms]
    qubits = [{"id": f"{k[0]}{k[1]}", "type": k[0], "r": v[0], "c": v[1]} for k, v in pos.items()]
    # readout multiplexing: 8 qubits per feedline along rows
    for q in qubits:
        q["feedline"] = (q["r"] * C + q["c"]) // 8
    lens = np.array([e["len_mm"] for e in inter])
    summary = {
        "code": name, "n_qubits": len(qubits), "grid": [R, C], "pitch_mm": pitch_mm,
        "die_mm": [R * pitch_mm + 2.0, C * pitch_mm + 2.0],
        "couplers_total": len(out_edges), "couplers_die": len(die), "couplers_interposer": len(inter),
        "long_range": len(lr), "wrap_edges": len(inter) - len(lr),
        "die_crossings": x_die, "die_layers": layers_die,
        "interposer_crossings": x_int, "interposer_layers_straight": layers_int,
        "manhattan": man,
        "track_pitch_um_needed_for_0p4mm_channel": 400.0 / max(man["max_tracks_V"], man["max_tracks_H"]),
        "long_len_mm": {"min": float(lens.min()), "median": float(np.median(lens)), "max": float(lens.max()),
                        "total": float(lens.sum())},
        "lr_len_mm_unwrapped": float(np.median([e["len_mm"] for e in lr if not e["wrap"]])),
        "feedlines": int(max(q["feedline"] for q in qubits) + 1),
        "degree": 6,
    }
    hist, bins = np.histogram(lens, bins=12)
    summary["interposer_length_hist"] = {"counts": hist.tolist(), "edges_mm": bins.round(2).tolist()}
    return {"summary": summary, "qubits": qubits, "edges": out_edges}


if __name__ == "__main__":
    res = toroid_layout()
    print(json.dumps(res["summary"], indent=1))
    path = pathlib.Path(__file__).resolve().parents[2] / "results" / "q2_layout.json"
    path.write_text(json.dumps(res))
