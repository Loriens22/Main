"""Reset experiments.

R1  Throughput model (analytical). Per-shot wall time
        T_shot = t_init + t_circuit + t_meas + t_overhead
    Validation targets from public reports: Heron ≈ 4,000 circuits/s (consistent with
    a 250 µs default repetition delay) and Nighthawk r2 > 100,000 circuits/s with
    ≈ 1 µs idle between circuits. The model then shows how the speed-up depends on
    circuit duration — the reported ≈25x applies to SHORT circuits.

R2  Reset-element physics (QuTiP Lindblad). A 3-level transmon is coupled through a
    switchable coupling g to a strongly damped mode (rate kappa) resonant with the
    g–e transition. We compute the excited and leakage populations versus time for
    (i) passive T1 decay, (ii) reset element on, (iii) reset element plus an e–f
    reset tone (multi-level reset). Parameters are ILLUSTRATIVE, chosen so the
    effective T1 lands near the ≈25 ns reported for Nighthawk r2.

R3  Reset-error impact on a dynamic circuit (Aer): ancilla-reuse parity checks on a
    5-qubit repetition code with mid-circuit measure + reset, sweeping reset error.
"""

from __future__ import annotations

import math
import time

import numpy as np

from . import common as C


# ------------------------------------------------------------------ R1 throughput
def throughput_model() -> dict:
    strategies = {
        "passive_rep_delay": {"label": "Passive relaxation (250 µs repetition delay)", "t_init_us": 250.0},
        "conditional": {"label": "Conditional reset (measure + flip, ≈ 4 µs incl. latency) — assumption", "t_init_us": 4.0},
        "dissipative": {"label": "Dedicated dissipative reset (≈1 µs idle between circuits, IBM-reported)", "t_init_us": 1.0},
        "aurora_pipelined": {"label": "AURORA: reset overlapped with result readout/next-circuit load", "t_init_us": 0.3},
    }
    t_meas = 1.0  # µs, assumption
    durations = [1, 2, 5, 10, 20, 50, 100, 200]  # circuit duration in µs
    rows = []
    for s, v in strategies.items():
        for tc in durations:
            t_shot = v["t_init_us"] + tc + t_meas
            rows.append({"strategy": s, "t_circuit_us": tc, "t_shot_us": t_shot, "circuits_per_s": 1e6 / t_shot})
    # validation points: very short circuit (~3 µs gates+measure)
    short = 3.0
    val = {
        "heron_model_circuits_per_s": 1e6 / (250.0 + short),
        "heron_reported": 4000,
        "nighthawk_r2_model_circuits_per_s": 1e6 / (1.0 + short + 0.0),
        "nighthawk_r2_reported": ">100,000 (IBM; protocol/circuit size not published in the sources we could access)",
    }
    speedup = []
    for tc in durations:
        a = 250.0 + tc + t_meas
        b = 1.0 + tc + t_meas
        speedup.append({"t_circuit_us": tc, "speedup_dissipative_vs_passive": a / b})
    return {"strategies": strategies, "t_meas_us": t_meas, "rows": rows, "validation": val, "speedup": speedup,
            "insight": ("Throughput gain is (t_rep + t_c + t_m)/(t_idle + t_c + t_m): ≈25x+ for few-µs circuits, but it "
                        "falls toward ≈5x for 50 µs circuits. Deep circuits gain mostly through the lower initialisation error, not speed.")}


# ------------------------------------------------------------------- R2 physics
def reset_physics() -> dict:
    import qutip as qt

    two_pi = 2 * math.pi
    # units: time in ns, frequencies in GHz (angular = 2π·GHz)
    g = two_pi * 0.010      # 10 MHz coupling when reset element is ON
    kappa = two_pi * 0.040  # 40 MHz damping of the dissipative mode
    alpha = two_pi * -0.300 # transmon anharmonicity
    t1_native = 200_000.0   # 200 µs
    n_th = 3e-4             # residual thermal photons in the damped mode (≈30 mK effective, assumption)
    N = 4
    a = qt.tensor(qt.qeye(3), qt.destroy(N))
    b = qt.tensor(qt.basis(3, 0) * qt.basis(3, 1).dag() + math.sqrt(2) * qt.basis(3, 1) * qt.basis(3, 2).dag(), qt.qeye(N))
    Pf = qt.tensor(qt.basis(3, 2) * qt.basis(3, 2).dag(), qt.qeye(N))
    Pe = qt.tensor(qt.basis(3, 1) * qt.basis(3, 1).dag(), qt.qeye(N))
    H0 = alpha * Pf  # frame rotating at the g–e transition (= mode frequency)
    Hint = g * (a.dag() * b + a * b.dag())
    c_ops_base = [math.sqrt(1 / t1_native) * b]
    c_mode = [math.sqrt(kappa * (1 + n_th)) * a, math.sqrt(kappa * n_th) * a.dag()]
    tlist = np.linspace(0, 400, 801)
    psi_e = qt.tensor(qt.basis(3, 1), qt.basis(N, 0))
    psi_f = qt.tensor(qt.basis(3, 2), qt.basis(N, 0))

    def run(H, c_ops, psi):
        r = qt.mesolve(H, psi, tlist, c_ops, e_ops=[Pe, Pf], options={"nsteps": 20000})
        return np.real(r.expect[0]), np.real(r.expect[1])

    cases = {}
    pe, pf = run(H0, c_ops_base, psi_e)
    cases["passive"] = {"from_e": {"Pe": pe, "Pf": pf}}
    pe, pf = run(H0 + Hint, c_ops_base + c_mode, psi_e)
    pe2, pf2 = run(H0 + Hint, c_ops_base + c_mode, psi_f)
    cases["reset_ge"] = {"from_e": {"Pe": pe, "Pf": pf}, "from_f": {"Pe": pe2, "Pf": pf2}}
    # multi-level: an additional tone makes the e–f transition resonant with a second
    # damped channel (modelled by removing the anharmonic detuning for a duplicate coupling)
    b_ef = qt.tensor(math.sqrt(2) * qt.basis(3, 1) * qt.basis(3, 2).dag(), qt.qeye(N))
    a2 = a  # same mode, driven sideband brings e-f into resonance (effective model)
    Hef = g * (a2.dag() * b_ef + a2 * b_ef.dag())
    pe3, pf3 = run(H0 + Hint + Hef - alpha * Pf, c_ops_base + c_mode, psi_f)
    cases["reset_ge_plus_ef"] = {"from_f": {"Pe": pe3, "Pf": pf3}}

    def t_to(series, thr):
        idx = np.where(series < thr)[0]
        return float(tlist[idx[0]]) if len(idx) else None

    pe_on = cases["reset_ge"]["from_e"]["Pe"]
    floor = float(pe_on[-50:].mean())
    fit_mask = (pe_on > 20 * floor + 1e-4) & (pe_on < 0.5) & (tlist > 2)
    slope = np.polyfit(tlist[fit_mask], np.log(pe_on[fit_mask]), 1)[0] if fit_mask.sum() > 3 else float("nan")
    summary = {
        "effective_T1_ns": float(-1 / slope) if slope < 0 else None,
        "analytic_purcell_T1_ns": float(kappa / (4 * g * g)),
        "t_to_1e-3_from_e_ns": t_to(pe_on, 1e-3),
        "thermal_floor_Pe": floor,
        "residual_leakage_after_400ns_ge_only": float(cases["reset_ge"]["from_f"]["Pf"][-1]),
        "residual_leakage_after_400ns_multilevel": float(cases["reset_ge_plus_ef"]["from_f"]["Pf"][-1]),
        "passive_Pe_after_400ns": float(cases["passive"]["from_e"]["Pe"][-1]),
    }
    step = 4
    packed = {k: {s: {o: v[::step].tolist() for o, v in d.items()} for s, d in val.items()} for k, val in cases.items()}
    return {"params": {"g_MHz": 10, "kappa_MHz": 40, "alpha_MHz": -300, "T1_native_us": 200, "n_th": n_th, "levels": 3,
                       "mode_fock_cutoff": N},
            "t_ns": tlist[::step].tolist(), "cases": packed, "summary": summary,
            "note": "Illustrative Lindblad model of a dissipative reset element; not a model of IBM's proprietary circuit."}


# ------------------------------------------------------------ R3 dynamic circuit
def ancilla_reuse(quick=False) -> dict:
    from qiskit import QuantumCircuit
    from qiskit_aer import AerSimulator
    from qiskit_aer.noise import NoiseModel, pauli_error, depolarizing_error

    rounds = 6
    def circuit():
        # 3 data qubits (0,1,2), 1 reused ancilla (3) measuring Z0Z1 then Z1Z2 each round
        qc = QuantumCircuit(4, 2 * rounds + 3)
        k = 0
        for _ in range(rounds):
            for (a, b) in ((0, 1), (1, 2)):
                qc.cx(a, 3)
                qc.cx(b, 3)
                qc.measure(3, k)
                qc.reset(3)
                k += 1
        qc.measure([0, 1, 2], [k, k + 1, k + 2])
        return qc
    qc = circuit()
    rows = []
    for pr in ([1e-4, 4e-4, 1e-3, 3e-3, 1e-2, 3e-2] if not quick else [4e-4, 1e-2]):
        nm = NoiseModel()
        nm.add_all_qubit_quantum_error(depolarizing_error(1e-3, 2), ["cx"])
        nm.add_all_qubit_quantum_error(pauli_error([("X", pr), ("I", 1 - pr)]), ["reset"])
        res = AerSimulator(noise_model=nm, seed_simulator=5).run(qc, shots=20000 if not quick else 4000).result().get_counts()
        false_alarm = 0
        total = 0
        for bits, c in res.items():
            b = bits[::-1]
            synd = b[: 2 * rounds]
            total += c
            if "1" in synd:
                false_alarm += c
        rows.append({"reset_error": pr, **C.wilson(false_alarm, total)})
    return {"rounds": rounds, "rows": rows,
            "description": "Fraction of shots with ≥1 spurious syndrome flip when no data error is injected beyond 0.1 % CX depolarisation; reset errors propagate directly into false syndrome events."}


def run(quick: bool = False) -> dict:
    t0 = time.time()
    out = {"meta": C.metadata("reset", {"quick": quick}), "throughput": throughput_model(),
           "physics": reset_physics(), "ancilla_reuse": ancilla_reuse(quick)}
    out["runtime_s"] = time.time() - t0
    C.save("reset", out)
    return out


if __name__ == "__main__":
    import sys

    r = run(quick="--quick" in sys.argv)
    print(r["throughput"]["validation"], r["physics"]["summary"], r["ancilla_reuse"]["rows"])
