"""Experiment A (noise reduction): readout-error mitigation and zero-noise extrapolation.

Workload  : 6-qubit 1D transverse-field Ising Trotter circuit, observable
            M = (1/n) sum_i <Z_i>, steps 1..6, exact reference from statevector.
Noise     : depolarising p1 = 1e-3, p2 = 1e-2 and 2 % readout error (deliberately
            pessimistic so mitigation effects are resolvable with finite shots).
Methods   : raw; REM (tensored per-qubit confusion-matrix inversion, calibrated in
            simulation); ZNE (global unitary folding, scale 1/3/5, Richardson); ZNE+REM.
Statistics: 12 independent repetitions x 8,000 shots; mean |error| with 95 % CI and the
            standard deviation of the estimator (variance amplification is the price of ZNE).
"""

from __future__ import annotations

import time

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator

from ..noise import NoiseParams, build_noise_model
from . import common as C

N = 6
BASIS = ["cz", "rz", "sx", "x"]


def ising(steps: int, dt: float = 0.25, J: float = 1.0, h: float = 1.0) -> QuantumCircuit:
    qc = QuantumCircuit(N)
    for _ in range(steps):
        for q in range(N - 1):
            qc.rzz(2 * J * dt, q, q + 1)
        for q in range(N):
            qc.rx(2 * h * dt, q)
    return qc


def magnetization_from_counts(counts: dict[str, int], inv: list[np.ndarray] | None = None) -> float:
    shots = sum(counts.values())
    if inv is None:
        tot = 0.0
        for b, c in counts.items():
            bits = b[::-1]
            tot += c * np.mean([1 - 2 * int(bits[q]) for q in range(N)])
        return tot / shots
    # tensored mitigation applied to single-qubit marginals (exact for <Z_i>)
    m = 0.0
    for q in range(N):
        p1 = sum(c for b, c in counts.items() if b[::-1][q] == "1") / shots
        p = inv[q] @ np.array([1 - p1, p1])
        m += p[0] - p[1]
    return m / N


def fold(qc: QuantumCircuit, scale: int) -> QuantumCircuit:
    k = (scale - 1) // 2
    out = qc.copy()
    for _ in range(k):
        out.compose(qc.inverse(), inplace=True)
        out.compose(qc, inplace=True)
    return out


def richardson(xs, ys) -> float:
    coeffs = np.polyfit(xs, ys, len(xs) - 1)
    return float(np.polyval(coeffs, 0.0))


def run(quick: bool = False) -> dict:
    t0 = time.time()
    noise = NoiseParams(p1=1e-3, p2=1e-2, readout=0.02)
    sim = AerSimulator(noise_model=build_noise_model(noise))
    reps = 12 if not quick else 3
    shots = 8000 if not quick else 2000
    steps_list = [1, 2, 3, 4, 5, 6] if not quick else [2, 4]
    rows = []
    for steps in steps_list:
        base = transpile(ising(steps), basis_gates=BASIS, optimization_level=1, seed_transpiler=1)
        exact = float(np.mean([Statevector(ising(steps)).expectation_value(_zop(q)).real for q in range(N)]))
        est = {"raw": [], "rem": [], "zne": [], "zne_rem": []}
        for r in range(reps):
            seed = 1000 * steps + r
            # readout calibration
            cal0 = QuantumCircuit(N); cal0.measure_all()
            cal1 = QuantumCircuit(N); cal1.x(range(N)); cal1.measure_all()
            c0 = sim.run(cal0, shots=shots, seed_simulator=seed).result().get_counts()
            c1 = sim.run(cal1, shots=shots, seed_simulator=seed + 1).result().get_counts()
            inv = []
            for q in range(N):
                e01 = sum(c for b, c in c0.items() if b[::-1][q] == "1") / shots
                e10 = sum(c for b, c in c1.items() if b[::-1][q] == "0") / shots
                inv.append(np.linalg.inv(np.array([[1 - e01, e10], [e01, 1 - e10]])))
            vals, vals_rem = [], []
            for sc in (1, 3, 5):
                f = fold(base, sc)
                f.measure_all()
                counts = sim.run(f, shots=shots, seed_simulator=seed + 10 * sc).result().get_counts()
                vals.append(magnetization_from_counts(counts))
                vals_rem.append(magnetization_from_counts(counts, inv))
            est["raw"].append(vals[0])
            est["rem"].append(vals_rem[0])
            est["zne"].append(richardson([1, 3, 5], vals))
            est["zne_rem"].append(richardson([1, 3, 5], vals_rem))
        row = {"steps": steps, "exact": exact, "two_qubit_gates": C.two_qubit_count(base)}
        for k, v in est.items():
            errs = [abs(x - exact) for x in v]
            row[k] = {"mean_estimate": float(np.mean(v)), "abs_error": C.mean_ci(errs), "std": float(np.std(v, ddof=1)) if len(v) > 1 else 0.0}
        rows.append(row)
    out = {"meta": C.metadata("mitigation", {"noise": noise.to_dict(), "reps": reps, "shots": shots, "scales": [1, 3, 5]},
                              seeds="1000*steps + rep"),
           "rows": rows, "runtime_s": time.time() - t0}
    C.save("mitigation", out)
    return out


def _zop(q):
    from qiskit.quantum_info import SparsePauliOp

    lab = ["I"] * N
    lab[N - 1 - q] = "Z"
    return SparsePauliOp("".join(lab))


if __name__ == "__main__":
    import sys

    r = run(quick="--quick" in sys.argv)
    for row in r["rows"]:
        print(row["steps"], round(row["exact"], 3), {k: round(row[k]["abs_error"]["mean"], 4) for k in ("raw", "rem", "zne", "zne_rem")})
