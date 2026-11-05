"""Simulation service: executes portable circuits on Qiskit Aer with resource guards."""

from __future__ import annotations

import time
from typing import Any

import numpy as np
import qiskit
import qiskit_aer
from qiskit.quantum_info import DensityMatrix, Statevector, partial_trace
from qiskit_aer import AerSimulator

from .circuits import stats, to_qiskit, validate
from .noise import NoiseParams, build_noise_model

METHOD_LIMITS = {
    "statevector": 28,
    "density_matrix": 14,
    "stabilizer": 5000,
    "matrix_product_state": 200,
}


def versions() -> dict[str, str]:
    return {"qiskit": qiskit.__version__, "qiskit_aer": qiskit_aer.__version__, "numpy": np.__version__}


def _strip_final_measure(qc):
    from qiskit.transpiler.passes import RemoveFinalMeasurements

    return RemoveFinalMeasurements()(qc)


def bloch_vectors(sv: Statevector | DensityMatrix, n: int) -> list[list[float]]:
    out = []
    rho = sv if isinstance(sv, DensityMatrix) else DensityMatrix(sv)
    for q in range(n):
        keep = [i for i in range(n) if i != q]
        r = partial_trace(rho, keep).data if keep else rho.data
        x = 2 * np.real(r[0, 1])
        y = -2 * np.imag(r[0, 1])  # Tr(rho Y) = 2 Im(rho_10) = -2 Im(rho_01)
        z = np.real(r[0, 0] - r[1, 1])
        out.append([float(x), float(y), float(z)])
    return out


def run_circuit(
    spec: dict[str, Any],
    shots: int = 1024,
    method: str = "automatic",
    noise: dict | None = None,
    seed: int | None = None,
    want_state: bool = True,
) -> dict[str, Any]:
    validate(spec)
    if shots < 1 or shots > 200_000:
        raise ValueError("shots must be in [1, 200000]")
    qc = to_qiskit(spec)
    n = qc.num_qubits
    if method == "automatic":
        from qiskit.quantum_info import Clifford  # noqa: F401  (import check)

        clifford_ok = all(
            d.operation.name in {"h", "s", "sdg", "x", "y", "z", "cx", "cz", "swap", "measure", "reset", "barrier", "id", "cy", "sx", "sxdg"}
            for d in qc.data
        )
        method = "stabilizer" if (clifford_ok and n > 24) else ("statevector" if n <= 28 else "matrix_product_state")
    if method not in METHOD_LIMITS:
        raise ValueError(f"unknown method {method}")
    if n > METHOD_LIMITS[method]:
        raise ValueError(f"{method} limited to {METHOD_LIMITS[method]} qubits on this server")

    noise_params = NoiseParams.from_dict(noise) if noise else None
    nm = build_noise_model(noise_params) if noise_params else None
    sim = AerSimulator(method=method, noise_model=nm, seed_simulator=seed)
    has_measure = any(d.operation.name == "measure" for d in qc.data)
    if has_measure:
        run_qc = qc
    elif qc.num_clbits >= n:
        run_qc = qc.copy()
        run_qc.measure(range(n), range(n))
    else:
        run_qc = qc.measure_all(inplace=False)
    t0 = time.perf_counter()
    result = sim.run(run_qc, shots=shots).result()
    elapsed = time.perf_counter() - t0
    counts = result.get_counts()
    if isinstance(counts, list):
        counts = counts[0]
    counts = {k.replace(" ", ""): int(v) for k, v in counts.items()}

    out: dict[str, Any] = {
        "counts": counts,
        "shots": shots,
        "method": method,
        "noise": noise_params.to_dict() if noise_params else None,
        "elapsed_s": elapsed,
        "stats": stats(spec),
        "versions": versions(),
        "seed": seed,
        "execution": "simulation (Qiskit Aer) — not physical QPU execution",
    }
    if want_state and n <= 10:
        mid = [i for i, d in enumerate(qc.data) if d.operation.name in {"measure", "reset"}]
        pure = _strip_final_measure(qc)
        if not any(d.operation.name in {"measure", "reset"} for d in pure.data):
            if nm is None:
                sv = Statevector.from_instruction(pure)
                out["statevector"] = [[float(a.real), float(a.imag)] for a in sv.data]
                out["bloch"] = bloch_vectors(sv, n)
            else:
                dm_sim = AerSimulator(method="density_matrix", noise_model=nm)
                pure2 = pure.copy()
                pure2.save_density_matrix()
                rho = DensityMatrix(dm_sim.run(pure2).result().data()["density_matrix"])
                out["bloch"] = bloch_vectors(rho, n)
                out["purity"] = float(np.real(np.trace(rho.data @ rho.data)))
        out["mid_circuit_ops"] = len(mid)
    return out
