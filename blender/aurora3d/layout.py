"""AURORA-Q T1 compute-tile layout (single source of truth, millimetres, die-centred).

Architecture (engineering proposal, not a fabricated device):
* 10 x 12 square lattice of fixed-frequency double-pad transmons (120 qubits),
  index q = row*10 + col, row 0 at the top. Matches the coupling graph used in all
  backend experiments (backend/aurora/topologies.py: square_grid(12, 10)).
* 218 tunable couplers (SQUID-loop transmon couplers) on nearest-neighbour bonds.
* 120 dissipative reset elements: a SQUID-switched link from each qubit to a strongly
  damped quarter-wave resonator terminated off-chip (see backend reset physics model).
* 120 quarter-wave readout resonators, 12 horizontal feedlines (10 qubits each).
* Drive, coupler-flux and reset-pump signals arrive from the interposer through
  indium bump bonds (flip-chip); only feedlines launch at the die edge.

Feature widths in the texture are exaggerated about 2x relative to typical CPW
dimensions so they remain legible at screen resolution.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

DIE = 20.0          # mm
COLS, ROWS = 10, 12
PX, PY = 1.70, 1.38  # qubit pitch (mm)
PAD_W, PAD_H, PAD_GAP = 0.34, 0.12, 0.035
CUT_W, CUT_H = 0.50, 0.38


def qubit_xy(q: int) -> tuple[float, float]:
    r, c = divmod(q, COLS)
    return ((c - (COLS - 1) / 2) * PX, ((ROWS - 1) / 2 - r) * PY + 0.25)


def couplers() -> list[tuple[int, int]]:
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            q = r * COLS + c
            if c + 1 < COLS:
                out.append((q, q + 1))
            if r + 1 < ROWS:
                out.append((q, q + COLS))
    return out


def meander(x0, y0, x1, y1, width, turns) -> list[tuple[float, float]]:
    """Serpentine from (x0,y0) to (x1,y1) with lateral amplitude ``width``."""
    pts = [(x0, y0)]
    for i in range(turns + 1):
        t = (i + 0.5) / (turns + 1)
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        dx, dy = (y1 - y0), -(x1 - x0)
        n = math.hypot(dx, dy) or 1
        s = width / 2 * (1 if i % 2 == 0 else -1)
        pts.append((x - (x1 - x0) / (2 * (turns + 1)) + s * dx / n, y - (y1 - y0) / (2 * (turns + 1)) + s * dy / n))
        pts.append((x + (x1 - x0) / (2 * (turns + 1)) + s * dx / n, y + (y1 - y0) / (2 * (turns + 1)) + s * dy / n))
    pts.append((x1, y1))
    return pts


def build() -> dict:
    qubits, resonators, resets, bumps_sig = [], [], [], []
    feedlines = []
    for r in range(ROWS):
        y_f = ((ROWS - 1) / 2 - r) * PY + 0.25 + 0.47 * PY
        feedlines.append({"row": r, "pts": [(-DIE / 2 + 0.55, y_f), (DIE / 2 - 0.55, y_f)]})
    for q in range(ROWS * COLS):
        x, y = qubit_xy(q)
        r, c = divmod(q, COLS)
        qubits.append({"q": q, "row": r, "col": c, "x": x, "y": y})
        # readout resonator in the NE quadrant: claw near pad -> meander -> feedline
        y_f = feedlines[r]["pts"][0][1]
        start = (x + CUT_W / 2 - 0.02, y + 0.08)
        res = [start, (x + 0.33, y + 0.08)] + meander(x + 0.33, y + 0.12, x + 0.33, y_f - 0.06, 0.30, 5)[1:] + [(x + 0.33, y_f - 0.035)]
        resonators.append({"q": q, "pts": res})
        # reset element in the SW quadrant: SQUID switch + damped resonator stub + bump to off-chip load
        rs = [(x - CUT_W / 2 + 0.02, y - 0.09), (x - 0.36, y - 0.09)] + meander(x - 0.36, y - 0.14, x - 0.36, y - 0.52, 0.18, 3)[1:]
        resets.append({"q": q, "pts": rs, "squid": (x - 0.31, y - 0.09), "load_bump": rs[-1]})
        bumps_sig.append({"kind": "drive", "q": q, "x": x - 0.40, "y": y + 0.33})
        bumps_sig.append({"kind": "reset_pump", "q": q, "x": rs[-1][0], "y": rs[-1][1] - 0.06})
    cps = []
    for a, b in couplers():
        xa, ya = qubit_xy(a)
        xb, yb = qubit_xy(b)
        horiz = abs(ya - yb) < 1e-9
        if horiz:
            p0, p1 = (xa + CUT_W / 2, ya), (xb - CUT_W / 2, yb)
        else:
            p0, p1 = (xa, ya - CUT_H / 2), (xb, yb + CUT_H / 2)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        flux = (mid[0] + (0 if horiz else 0.16), mid[1] + (0.16 if horiz else 0))
        cps.append({"a": a, "b": b, "p0": p0, "p1": p1, "squid": mid, "horizontal": horiz, "flux_bump": flux})
        bumps_sig.append({"kind": "coupler_flux", "a": a, "b": b, "x": flux[0], "y": flux[1]})
    # airbridges where vertical couplers cross feedlines, plus periodic ground straps along feedlines
    bridges = []
    for cp in cps:
        if not cp["horizontal"]:
            x = cp["p0"][0]
            for fl in feedlines:
                yf = fl["pts"][0][1]
                if min(cp["p0"][1], cp["p1"][1]) < yf < max(cp["p0"][1], cp["p1"][1]):
                    bridges.append({"x": x, "y": yf, "angle": 0.0, "span": 0.12, "kind": "crossover"})
    for fl in feedlines:
        y = fl["pts"][0][1]
        x = -DIE / 2 + 1.0
        while x < DIE / 2 - 1.0:
            if all(abs(x - b["x"]) > 0.2 or abs(y - b["y"]) > 0.01 for b in bridges):
                bridges.append({"x": x, "y": y, "angle": math.pi / 2, "span": 0.10, "kind": "ground_strap"})
            x += 0.725
    # ground bumps on a lattice that avoids active structures
    ground = []
    g = 0.65
    nx = int(DIE / g)
    for i in range(nx):
        for j in range(nx):
            x = -DIE / 2 + 0.6 + i * g
            y = -DIE / 2 + 0.6 + j * g
            if abs(x) > DIE / 2 - 0.6 or abs(y) > DIE / 2 - 0.6:
                continue
            ok = all(math.hypot(x - qq["x"], y - qq["y"]) > 0.45 for qq in qubits)
            ok = ok and all(abs(y - fl["pts"][0][1]) > 0.12 for fl in feedlines)
            ok = ok and all(math.hypot(x - b["x"], y - b["y"]) > 0.12 for b in bumps_sig)
            ok = ok and all(math.hypot(x - px_, y - py_) > 0.16 for res in resonators for (px_, py_) in res["pts"][::2])
            ok = ok and all(math.hypot(x - px_, y - py_) > 0.14 for rs in resets for (px_, py_) in rs["pts"][::2])
            if ok:
                ground.append({"x": x, "y": y})
    launches = []
    for fl in feedlines:
        (x0, y0), (x1, y1) = fl["pts"]
        launches.append({"row": fl["row"], "side": "W", "x": x0 - 0.15, "y": y0})
        launches.append({"row": fl["row"], "side": "E", "x": x1 + 0.15, "y": y1})
    return {"units": "mm", "die": DIE, "rows": ROWS, "cols": COLS, "pitch": [PX, PY],
            "pad": [PAD_W, PAD_H, PAD_GAP], "cutout": [CUT_W, CUT_H],
            "qubits": qubits, "couplers": cps, "resonators": resonators, "reset_elements": resets,
            "feedlines": feedlines, "airbridges": bridges, "signal_bumps": bumps_sig, "ground_bumps": ground,
            "launch_pads": launches,
            "counts": {"qubits": len(qubits), "couplers": len(cps), "reset_elements": len(resets),
                       "readout_resonators": len(resonators), "feedlines": len(feedlines),
                       "signal_bumps": len(bumps_sig), "ground_bumps": len(ground), "airbridges": len(bridges)}}


def save_json(layout: dict, path: Path) -> None:
    slim = {k: v for k, v in layout.items() if k not in ("resonators", "reset_elements", "ground_bumps")}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(slim, separators=(",", ":")))
