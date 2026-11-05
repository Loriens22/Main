"""Shared helpers: benchmark circuits, statistics, metadata."""

from __future__ import annotations

import datetime as _dt
import json
import math
import platform
from pathlib import Path
from typing import Any, Iterable

import networkx as nx
import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit.library import QuantumVolume

RESULTS_DIR = Path(__file__).resolve().parents[2] / "results"


# --------------------------------------------------------------------------- stats
def mean_ci(values: Iterable[float], conf: float = 0.95) -> dict[str, float]:
    """Mean with a Student-t confidence interval (falls back to 0 width for n=1)."""
    from scipy import stats

    v = np.asarray(list(values), dtype=float)
    n = len(v)
    m = float(v.mean()) if n else float("nan")
    if n < 2:
        return {"mean": m, "lo": m, "hi": m, "n": n, "std": 0.0}
    s = float(v.std(ddof=1))
    h = float(stats.t.ppf(0.5 + conf / 2, n - 1) * s / math.sqrt(n))
    return {"mean": m, "lo": m - h, "hi": m + h, "n": n, "std": s}


def wilson(k: int, n: int, z: float = 1.96) -> dict[str, float]:
    """Wilson score interval for a binomial proportion."""
    if n == 0:
        return {"rate": float("nan"), "lo": float("nan"), "hi": float("nan"), "n": 0}
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return {"rate": p, "lo": max(0.0, c - h), "hi": min(1.0, c + h), "n": n, "k": k}


def metadata(name: str, params: dict[str, Any], seeds: Any = None) -> dict[str, Any]:
    import qiskit
    import qiskit_aer
    import scipy
    import sklearn
    import stim
    import pymatching

    return {
        "experiment": name,
        "generated_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "params": params,
        "seeds": seeds,
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "qiskit": qiskit.__version__,
            "qiskit_aer": qiskit_aer.__version__,
            "stim": stim.__version__,
            "pymatching": pymatching.__version__,
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "scikit_learn": sklearn.__version__,
        },
        "nature_of_results": "simulation / analytical model — not measurements on physical AURORA-Q hardware",
    }


def save(name: str, payload: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULTS_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=1, default=_json_default))
    return path


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


# ---------------------------------------------------------------- benchmark circuits
def qft(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n, name=f"qft_{n}")
    for j in range(n):
        qc.h(j)
        for k in range(j + 1, n):
            qc.cp(math.pi / 2 ** (k - j), k, j)
    for j in range(n // 2):
        qc.swap(j, n - 1 - j)
    return qc


def ghz(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n, name=f"ghz_{n}")
    qc.h(0)
    for j in range(n - 1):
        qc.cx(j, j + 1)
    return qc


def qaoa_maxcut(graph: nx.Graph, gammas: list[float], betas: list[float]) -> QuantumCircuit:
    n = graph.number_of_nodes()
    qc = QuantumCircuit(n, name=f"qaoa_{n}_p{len(gammas)}")
    qc.h(range(n))
    for g, b in zip(gammas, betas):
        for u, v in graph.edges():
            qc.rzz(2 * g, u, v)
        for q in range(n):
            qc.rx(2 * b, q)
    return qc


def qaoa_3reg(n: int, seed: int, p: int = 1) -> QuantumCircuit:
    g = nx.random_regular_graph(3, n, seed=seed)
    qc = qaoa_maxcut(g, [0.4] * p, [0.3] * p)
    qc.name = f"qaoa3reg_{n}_s{seed}"
    return qc


def quantum_volume(n: int, seed: int) -> QuantumCircuit:
    qc = QuantumVolume(n, depth=n, seed=seed).decompose()
    qc.name = f"qv_{n}_s{seed}"
    return qc


def ising_trotter(rows: int, cols: int, steps: int = 3) -> QuantumCircuit:
    """2D transverse-field Ising Trotter circuit on a rows x cols patch (native to a square grid)."""
    n = rows * cols
    qc = QuantumCircuit(n, name=f"ising2d_{rows}x{cols}_t{steps}")
    for _ in range(steps):
        for r in range(rows):
            for c in range(cols):
                q = r * cols + c
                if c + 1 < cols:
                    qc.rzz(0.2, q, q + 1)
                if r + 1 < rows:
                    qc.rzz(0.2, q, q + cols)
        for q in range(n):
            qc.rx(0.3, q)
    return qc


def bernstein_vazirani(n: int, seed: int = 0) -> QuantumCircuit:
    rng = np.random.default_rng(seed)
    s = rng.integers(0, 2, n - 1)
    qc = QuantumCircuit(n, name=f"bv_{n}")
    qc.x(n - 1)
    qc.h(range(n))
    for i, bit in enumerate(s):
        if bit:
            qc.cx(i, n - 1)
    qc.h(range(n - 1))
    return qc


def random_sparse(n: int, gates: int, seed: int) -> QuantumCircuit:
    """Random 2Q interaction circuit with mild locality (models generic compiled workloads)."""
    rng = np.random.default_rng(seed)
    qc = QuantumCircuit(n, name=f"rand_{n}_{gates}_s{seed}")
    for _ in range(gates):
        a = int(rng.integers(n))
        span = int(min(n - 1, max(1, rng.geometric(0.15))))
        b = (a + span * (1 if rng.random() < 0.5 else -1)) % n
        if a == b:
            continue
        qc.ry(float(rng.uniform(0, math.pi)), a)
        qc.cz(a, b)
    return qc


def two_qubit_count(qc: QuantumCircuit) -> int:
    return sum(1 for d in qc.data if d.operation.num_qubits == 2)


def two_qubit_depth(qc: QuantumCircuit) -> int:
    return qc.depth(lambda inst: inst.operation.num_qubits == 2)
