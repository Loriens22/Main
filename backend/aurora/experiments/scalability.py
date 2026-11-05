"""Experiment F (scalability): resource estimation for modular AURORA-Q tiles.

All inputs are explicit, user-overridable ASSUMPTIONS. The logical-error model
    eps_L(d) = A * Lambda^(-(d+1)/2)            (per QEC round, per logical qubit)
is fitted to our own Stim results for the AURORA-Q target noise (qec.json, time study,
'aurora_overlapped' strategy). Outputs are projections, not measurements.
"""

from __future__ import annotations

import json
import math
import time

import numpy as np

from . import common as C

TILE = {"qubits": 120, "couplers": 218, "reset_elements": 120, "feedlines": 12}

WIRING_ASSUMPTIONS = {
    "xy_drive_lines_per_qubit": 1.0,
    "coupler_flux_lines_per_coupler": 1.0,
    "reset_lines_per_qubit": 0.25,  # assume 4:1 multiplexing of reset pumps (assumption)
    "readout_lines_per_feedline": 2.0,  # input + output (TWPA/HEMT chain)
    "note": "Line counts follow the published element counts of a Nighthawk-class tile; multiplexing ratios are assumptions.",
}


def fit_lambda(path=C.RESULTS_DIR / "qec.json", device="aurora_q_target", strategy="aurora_overlapped"):
    try:
        q = json.loads(path.read_text())
        rows = [r for r in q["time_study"]["rows"] if r["device"] == device and r["strategy"] == strategy]
        ds = np.array([r["d"] for r in rows], float)
        eps = np.array([max(r["per_round"], 1e-12) for r in rows])
        slope, intercept = np.polyfit((ds + 1) / 2, np.log(eps), 1)
        return {"A": float(math.exp(intercept)), "Lambda": float(math.exp(-slope)), "source": f"fit to qec.json ({device}, {strategy})",
                "points": [{"d": int(d), "eps": float(e)} for d, e in zip(ds, eps)]}
    except Exception as exc:  # pragma: no cover
        return {"A": 0.03, "Lambda": 4.0, "source": f"default (qec.json unavailable: {exc})", "points": []}


def lines_per_tile() -> float:
    w = WIRING_ASSUMPTIONS
    return (TILE["qubits"] * (w["xy_drive_lines_per_qubit"] + w["reset_lines_per_qubit"])
            + TILE["couplers"] * w["coupler_flux_lines_per_coupler"]
            + TILE["feedlines"] * w["readout_lines_per_feedline"])


def run(quick: bool = False) -> dict:
    t0 = time.time()
    fit = fit_lambda()
    A, L = fit["A"], fit["Lambda"]
    targets = [1e-6, 1e-9, 1e-12]
    logical_counts = [1, 10, 100, 1000]
    rows = []
    for eps_t in targets:
        d = 3
        # logical operation ~ d rounds; require d * eps_L(d) <= eps_t
        while d * A * L ** (-(d + 1) / 2) > eps_t and d < 101:
            d += 2
        phys_surface = 2 * d * d - 1
        for nl in logical_counts:
            total = math.ceil(nl * phys_surface * 2.0)  # x2 routing/lattice-surgery space (assumption)
            tiles = math.ceil(total / TILE["qubits"])
            rows.append({"target_eps_per_op": eps_t, "d": d, "logical_qubits": nl,
                         "physical_per_logical_surface": phys_surface, "total_physical_surface": total,
                         "tiles_surface": tiles, "lines_surface": tiles * lines_per_tile(),
                         "gross_code_physical": math.ceil(nl / 12) * 288 * 2,
                         "tiles_gross": math.ceil(math.ceil(nl / 12) * 288 * 2 / TILE["qubits"])})
    out = {"meta": C.metadata("scalability", {"tile": TILE, "wiring": WIRING_ASSUMPTIONS, "routing_overhead": 2.0}),
           "fit": fit, "rows": rows, "lines_per_tile": lines_per_tile(),
           "gross_code_reference": "[[144,12,12]] uses 288 physical qubits for 12 logical (Bravyi et al., Nature 627, 778 (2024)); "
                                   "requires degree-6 connectivity that the AURORA-Q square tile does NOT provide without long-range couplers.",
           "runtime_s": time.time() - t0}
    C.save("scalability", out)
    return out


if __name__ == "__main__":
    r = run()
    print(r["fit"]["Lambda"], r["lines_per_tile"])
    for row in r["rows"][:4]:
        print(row)
