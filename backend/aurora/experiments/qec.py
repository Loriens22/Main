"""Quantum error-correction experiments (Stim + PyMatching).

Q1  Threshold validation  — rotated surface-code memory under (a) uniform circuit-level
    depolarising noise and (b) phenomenological noise. Literature values for MWPM:
    ~0.5–1 % (circuit level) and ~2.9 % (phenomenological, Wang–Harrington–Preskill).
    Reproducing them validates the pipeline.
Q2  Reset / initialisation sensitivity — logical error per round vs reset error with all
    other parameters fixed (links IBM's 25x initialisation-error reduction to QEC).
Q3  Logical error per unit time for three reset strategies (conditional, dissipative,
    AURORA reset-overlapped scheduling) using a cycle-time model.
Q4  Majorana-tetron requirement analysis — phenomenological model parameterised by
    reported parity lifetimes and single-shot measurement errors. A crude abstraction
    used to derive *requirements*, not to predict device performance.
Q5  Repetition code (bit-flip) memory, d = 3..11.
"""

from __future__ import annotations

import math
import time

import numpy as np
import pymatching
import stim

from . import common as C

S_CLIFF, S_DATA = 0.000123, 0.000321  # sentinels for post-processing generated circuits


def build_surface(d: int, rounds: int, basis: str = "z", p1: float = 0.0, p2: float = 0.0,
                  p_idle: float = 0.0, p_meas: float = 0.0, p_reset: float = 0.0,
                  data_error: str = "depolarize") -> stim.Circuit:
    c = stim.Circuit.generated(
        f"surface_code:rotated_memory_{basis}", distance=d, rounds=rounds,
        after_clifford_depolarization=S_CLIFF if (p1 or p2) else 0.0,
        before_round_data_depolarization=S_DATA if p_idle else 0.0,
        before_measure_flip_probability=p_meas, after_reset_flip_probability=p_reset,
    )
    txt = str(c)
    txt = txt.replace(f"DEPOLARIZE1({S_CLIFF})", f"DEPOLARIZE1({p1})")
    txt = txt.replace(f"DEPOLARIZE2({S_CLIFF})", f"DEPOLARIZE2({p2})")
    gate = "X_ERROR" if data_error == "xflip" else "DEPOLARIZE1"
    txt = txt.replace(f"DEPOLARIZE1({S_DATA})", f"{gate}({p_idle})")
    return stim.Circuit(txt)


def logical_error(circuit: stim.Circuit, max_shots: int = 400_000, target_errors: int = 400,
                  batch: int = 50_000, seed: int = 0) -> dict:
    dem = circuit.detector_error_model(decompose_errors=True)
    m = pymatching.Matching.from_detector_error_model(dem)
    sampler = circuit.compile_detector_sampler(seed=seed)
    shots = errs = 0
    while shots < max_shots and errs < target_errors:
        det, obs = sampler.sample(batch, separate_observables=True)
        pred = m.decode_batch(det)
        errs += int(np.sum(np.any(pred != obs, axis=1)))
        shots += batch
    return C.wilson(errs, shots)


def per_round(p_total: float, rounds: int) -> float:
    """Convert total logical failure probability over r rounds to a per-round rate."""
    p_total = min(p_total, 0.4999)
    return 0.5 * (1 - (1 - 2 * p_total) ** (1 / rounds))


def pauli_idle(t_ns: float, t1_us: float, t2_us: float) -> float:
    """Pauli-twirled amplitude/phase damping total error probability over idle time t."""
    if t_ns <= 0:
        return 0.0
    t1, t2 = t1_us * 1e3, min(t2_us, 2 * t1_us) * 1e3
    px = py = (1 - math.exp(-t_ns / t1)) / 4
    pz = (1 - math.exp(-t_ns / t2)) / 2 - px
    return px + py + max(pz, 0.0)


# ------------------------------------------------------------------- Q1 threshold
def threshold_study(quick=False) -> dict:
    ds = (3, 5, 7)
    circ_ps = [0.002, 0.004, 0.006, 0.008, 0.010, 0.012] if not quick else [0.004, 0.01]
    phen_ps = [0.01, 0.02, 0.025, 0.03, 0.035, 0.04] if not quick else [0.02, 0.04]
    out = {"circuit_level": [], "phenomenological": []}
    for p in circ_ps:
        for d in ds:
            c = build_surface(d, d, p1=p, p2=p, p_idle=p, p_meas=p, p_reset=p)
            r = logical_error(c, max_shots=60_000 if quick else 400_000)
            out["circuit_level"].append({"p": p, "d": d, "rounds": d, **r, "per_round": per_round(r["rate"], d)})
    for p in phen_ps:
        for d in ds:
            c = build_surface(d, d, p_idle=p, p_meas=p, data_error="xflip")
            r = logical_error(c, max_shots=60_000 if quick else 300_000)
            out["phenomenological"].append({"p": p, "d": d, "rounds": d, **r, "per_round": per_round(r["rate"], d)})
    out["estimated_threshold"] = {k: _crossing(out[k]) for k in ("circuit_level", "phenomenological")}
    out["literature"] = {"circuit_level": "≈0.5–1 % (MWPM, uniform depolarising; Fowler et al. 2012)",
                         "phenomenological": "≈2.9 % (MWPM; Wang, Harrington, Preskill 2003)"}
    return out


def _crossing(rows) -> float | None:
    """Estimate where d=3 and d=7 per-round curves cross (log-linear interpolation)."""
    ps = sorted({r["p"] for r in rows})
    def val(p, d):
        return next(r["per_round"] for r in rows if r["p"] == p and r["d"] == d)
    diff = [(p, math.log(max(val(p, 7), 1e-9)) - math.log(max(val(p, 3), 1e-9))) for p in ps]
    for (pa, da), (pb, db) in zip(diff, diff[1:]):
        if da < 0 <= db:
            return pa + (pb - pa) * (-da) / (db - da)
    return None


def phenomenological_large_d(quick=False) -> dict:
    """Finite-size drift check: crossings of larger codes move toward the asymptotic MWPM value."""
    rows = []
    for p in ((0.026, 0.029, 0.032, 0.035) if not quick else (0.03,)):
        for d in ((7, 11, 15) if not quick else (7, 11)):
            r = logical_error(build_surface(d, d, p_idle=p, p_meas=p, data_error="xflip"),
                              max_shots=40_000, target_errors=2000, batch=10_000)
            rows.append({"p": p, "d": d, **r, "per_round": per_round(r["rate"], d)})
    return {"rows": rows, "note": "Crossings drift downward with distance (finite-size effect) toward ≈2.9 % (MWPM, Wang–Harrington–Preskill)."}


# ------------------------------------------------------------ Q2 reset sensitivity
def reset_sensitivity(quick=False) -> dict:
    base = dict(p1=2.5e-4, p2=1.5e-3, p_idle=1e-3, p_meas=5e-3)
    resets = [1e-4, 4e-4, 1e-3, 3e-3, 1e-2, 2e-2] if not quick else [4e-4, 1e-2]
    rows = []
    for pr in resets:
        for d in (3, 5, 7):
            c = build_surface(d, d, p_reset=pr, **base)
            r = logical_error(c, max_shots=60_000 if quick else 400_000)
            rows.append({"p_reset": pr, "d": d, **r, "per_round": per_round(r["rate"], d)})
    return {"base_noise": base, "rows": rows,
            "note": "conditional reset inherits the readout error (~1e-2); a dissipative reset element with a 25x lower initialisation error sits near 4e-4."}


# ----------------------------------------------- Q3 logical error per unit time
STRATEGIES = {
    "conditional_reset": {"label": "Conditional reset (measure + feed-forward π-pulse)",
                          "t_reset_ns": 1500.0, "reset_error": 1.3e-2,
                          "basis": "Heron-class: reset limited by readout fidelity; 1.5 µs feed-forward latency is an ASSUMPTION"},
    "dissipative_reset": {"label": "Dedicated dissipative reset element",
                          "t_reset_ns": 200.0, "reset_error": 1.3e-2 / 25,
                          "basis": "Nighthawk r2-class: effective T1 ≈ 25 ns when active; 200 ns window and 25x lower init error from IBM report"},
    "aurora_overlapped": {"label": "AURORA reset-overlapped schedule",
                          "t_reset_ns": 0.0, "reset_error": 1.3e-2 / 25,
                          "basis": "AURORA proposal: reset of each ancilla is issued during the next round's single-qubit/H layer and data-qubit CZ layers that do not involve it; only the residual non-overlapped time counts (modelled as 0)."},
}


def cycle_time_ns(t1q=25.0, t2q=70.0, t_meas=1000.0, t_reset=200.0) -> float:
    # rotated surface-code round: 2 single-qubit (H) layers + 4 two-qubit layers + measure + reset
    return 2 * t1q + 4 * t2q + t_meas + t_reset


def time_study(quick=False) -> dict:
    devices = {
        "heron_class": dict(p1=2.5e-4, p2=2.5e-3, p_meas=1.3e-2, t1_us=250.0, t2_us=200.0),
        "aurora_q_target": dict(p1=1e-4, p2=1e-3, p_meas=5e-3, t1_us=500.0, t2_us=500.0),
    }
    rows = []
    for dev, dp in devices.items():
        for sname, s in STRATEGIES.items():
            reset_err = s["reset_error"] if dev == "heron_class" else s["reset_error"] * (5e-3 / 1.3e-2)
            tcyc = cycle_time_ns(t_reset=s["t_reset_ns"])
            idle_ns = 1000.0 + s["t_reset_ns"]  # data qubits idle during ancilla measure (+ reset)
            p_idle = pauli_idle(idle_ns, dp["t1_us"], dp["t2_us"])
            for d in (3, 5, 7):
                c = build_surface(d, d, p1=dp["p1"], p2=dp["p2"], p_idle=p_idle, p_meas=dp["p_meas"], p_reset=reset_err)
                r = logical_error(c, max_shots=60_000 if quick else 400_000)
                pr = per_round(r["rate"], d)
                rows.append({"device": dev, "strategy": sname, "d": d, "cycle_ns": tcyc, "p_idle": p_idle,
                             "reset_error": reset_err, **r, "per_round": pr,
                             "per_us": pr / (tcyc / 1000.0), "rounds_per_s": 1e9 / tcyc})
    return {"devices": devices, "strategies": STRATEGIES, "rows": rows,
            "timing_assumptions_ns": {"t1q": 25, "t2q": 70, "t_meas": 1000}}


# ------------------------------------------------------- Q4 Majorana requirements
def majorana_requirements(quick=False) -> dict:
    # (a) poisoning-limited error per cycle
    taus = {"InAs–Al (Majorana 1 era, τ_Z ≈ 12.4 ms, arXiv:2507.08795)": 12.4e-3,
            "InAs–Pb (Majorana 2, τ_Z = 22 s, arXiv:2606.03884)": 22.0,
            "InAs–Al X-loop (τ_X ≈ 14.5 µs, arXiv:2507.08795)": 14.5e-6}
    cycles_us = [1, 10, 100]
    budget = [{"device": k, "tau_s": v, "cycle_us": t, "p_flip_per_cycle": 1 - math.exp(-t * 1e-6 / v)}
              for k, v in taus.items() for t in cycles_us]
    # (b) measurement-dominated phenomenological sweep (p_data = q: each faulty
    #     measurement also leaves an error of the same rate on the data — crude model)
    qs = [0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.16] if not quick else [0.005, 0.03, 0.16]
    sweep = []
    for q in qs:
        for d in (3, 5, 7):
            c = build_surface(d, d, p_idle=q, p_meas=q, data_error="xflip")
            r = logical_error(c, max_shots=40_000 if quick else 200_000, target_errors=300)
            sweep.append({"q": q, "d": d, **r, "per_round": per_round(r["rate"], d)})
    reported = [
        {"label": "Z-loop single-shot error, InAs–Al tetron", "value": 0.005, "source": "arXiv:2507.08795"},
        {"label": "X-loop single-shot error, InAs–Al tetron", "value": 0.16, "source": "arXiv:2507.08795"},
        {"label": "Parity assignment error, Nature 638 (2025)", "value": 0.01, "source": "Nature 638, 651 (2025)"},
        {"label": "X-loop error, InAs–Pb (Majorana 2)", "value": None, "source": "not reported in arXiv:2606.03884 (only Z measurements)"},
    ]
    return {"poisoning_budget": budget, "measurement_sweep": sweep, "reported_errors": reported,
            "threshold_estimate_q": _crossing([{**r, "p": r["q"]} for r in sweep]),
            "caveat": ("Tetron codes use measurement-based (multi-Majorana parity) stabilisers. Mapping them onto a "
                       "phenomenological surface-code model is a deliberate simplification used only to ask: given "
                       "the reported lifetimes, which parameter now limits the error budget?")}


# ---------------------------------------------------------------- Q5 repetition
def repetition(quick=False) -> dict:
    rows = []
    for p in ([0.01, 0.03, 0.05, 0.08, 0.1] if not quick else [0.03, 0.1]):
        for d in (3, 5, 7, 9, 11):
            c = stim.Circuit.generated("repetition_code:memory", distance=d, rounds=d,
                                       after_clifford_depolarization=p, before_round_data_depolarization=p,
                                       before_measure_flip_probability=p, after_reset_flip_probability=p)
            r = logical_error(c, max_shots=50_000 if quick else 200_000)
            rows.append({"p": p, "d": d, **r, "per_round": per_round(r["rate"], d)})
    return {"rows": rows}


def run(quick: bool = False) -> dict:
    t0 = time.time()
    out = {
        "meta": C.metadata("qec", {"decoder": "PyMatching (MWPM)", "code": "rotated surface code memory_z",
                                   "shots": "adaptive up to 4e5 or 400 logical errors"}, seeds={"stim_sampler": 0}),
        "threshold": threshold_study(quick),
        "phenomenological_large_d": phenomenological_large_d(quick),
        "reset_sensitivity": reset_sensitivity(quick),
        "time_study": time_study(quick),
        "majorana": majorana_requirements(quick),
        "repetition": repetition(quick),
    }
    out["runtime_s"] = time.time() - t0
    C.save("qec", out)
    return out


if __name__ == "__main__":
    import sys

    r = run(quick="--quick" in sys.argv)
    print(r["threshold"]["estimated_threshold"], r["majorana"]["threshold_estimate_q"], round(r["runtime_s"], 1))
