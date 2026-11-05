"""Generate Qiskit reference fixtures used to cross-validate the TypeScript browser engine.

    python backend/tools/make_fixtures.py   ->  web/test/fixtures/*.json
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qiskit.quantum_info import DensityMatrix, StabilizerState, Statevector  # noqa: E402
from qiskit_aer import AerSimulator  # noqa: E402

from aurora.circuits import to_qiskit  # noqa: E402
from aurora.noise import NoiseParams, build_noise_model  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "test" / "fixtures"
G1 = ["x", "y", "z", "h", "s", "sdg", "t", "tdg", "sx", "sxdg"]
G1P = {"rx": 1, "ry": 1, "rz": 1, "p": 1, "u": 3}
G2 = ["cx", "cy", "cz", "ch", "swap", "iswap"]
G2P = {"crx": 1, "cry": 1, "crz": 1, "cp": 1, "rzz": 1, "rxx": 1, "ryy": 1}
G3 = ["ccx", "cswap"]


def random_circuit(n, depth, rng, clifford=False):
    ops = []
    for _ in range(depth):
        r = rng.random()
        if clifford:
            if r < 0.5 or n < 2:
                ops.append({"name": str(rng.choice(["x", "y", "z", "h", "s", "sdg", "sx"])), "qubits": [int(rng.integers(n))]})
            else:
                a, b = rng.choice(n, 2, replace=False)
                ops.append({"name": str(rng.choice(["cx", "cz", "cy", "swap"])), "qubits": [int(a), int(b)]})
            continue
        if r < 0.35 or n < 2:
            g = str(rng.choice(G1))
            ops.append({"name": g, "qubits": [int(rng.integers(n))]})
        elif r < 0.6 or n < 2:
            g = str(rng.choice(list(G1P)))
            ops.append({"name": g, "qubits": [int(rng.integers(n))], "params": [float(x) for x in rng.uniform(-math.pi, math.pi, G1P[g])]})
        elif r < 0.75:
            a, b = rng.choice(n, 2, replace=False)
            ops.append({"name": str(rng.choice(G2)), "qubits": [int(a), int(b)]})
        elif r < 0.93 or n < 3:
            g = str(rng.choice(list(G2P)))
            a, b = rng.choice(n, 2, replace=False)
            ops.append({"name": g, "qubits": [int(a), int(b)], "params": [float(rng.uniform(-math.pi, math.pi))]})
        else:
            a, b, c = rng.choice(n, 3, replace=False)
            ops.append({"name": str(rng.choice(G3)), "qubits": [int(a), int(b), int(c)]})
    return {"num_qubits": n, "ops": ops}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(2026)
    sv_cases = []
    for k in range(60):
        n = int(rng.integers(1, 7))
        c = random_circuit(n, int(rng.integers(5, 40)), rng)
        sv = Statevector(to_qiskit(c)).data
        sv_cases.append({"circuit": c, "statevector": [[float(a.real), float(a.imag)] for a in sv]})
    (OUT / "statevector.json").write_text(json.dumps(sv_cases))

    noise_cases = []
    for k in range(12):
        n = int(rng.integers(1, 5))
        c = random_circuit(n, int(rng.integers(4, 18)), rng)
        c["ops"] = [o for o in c["ops"] if o["name"] not in ("ccx", "cswap", "iswap", "ch", "crx", "cry", "crz")]
        params = {"p1": float(rng.choice([0, 1e-3, 1e-2])), "p2": float(rng.choice([1e-3, 2e-2, 0.08])),
                  "readout": 0.0, "reset_error": 0.0, "crosstalk_zz": float(rng.choice([0.0, 0.01]))}
        if k % 2 == 0:
            params.update({"t1_us": 40.0, "t2_us": 30.0, "t_1q_ns": 50.0, "t_2q_ns": 300.0})
        qc = to_qiskit(c)
        qc.save_density_matrix()
        sim = AerSimulator(method="density_matrix", noise_model=build_noise_model(NoiseParams.from_dict(params)))
        rho = DensityMatrix(sim.run(qc).result().data()["density_matrix"])
        noise_cases.append({"circuit": c, "noise": {**NoiseParams.from_dict(params).to_dict()},
                            "probabilities": [float(x) for x in np.real(np.diag(rho.data))],
                            "purity": float(np.real(np.trace(rho.data @ rho.data)))})
    (OUT / "noise.json").write_text(json.dumps(noise_cases))

    cliff = []
    for k in range(10):
        n = int(rng.integers(3, 10))
        c = random_circuit(n, int(rng.integers(10, 60)), rng, clifford=True)
        probs = StabilizerState(to_qiskit(c)).probabilities_dict()
        cliff.append({"circuit": c, "probabilities": {k2: float(v) for k2, v in probs.items()}})
    (OUT / "clifford.json").write_text(json.dumps(cliff))
    print("fixtures:", len(sv_cases), len(noise_cases), len(cliff))


if __name__ == "__main__":
    main()
