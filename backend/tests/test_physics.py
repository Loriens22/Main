"""Physics and software validation tests for the AURORA-Q backend."""

import math

import numpy as np
import pytest
from qiskit.quantum_info import SparsePauliOp, Statevector

from aurora import qsim_np as Q
from aurora.circuits import CircuitValidationError, from_qiskit, to_qiskit, validate
from aurora.experiments import chemistry, common, qec
from aurora.simulate import run_circuit
from aurora.topologies import aurora_lattice, checkerboard_diagonals, heron_heavy_hex, square_grid


# ----------------------------------------------------------------- topologies
def test_topology_counts_match_published_element_counts():
    sq = square_grid()
    assert (sq.num_qubits, sq.num_couplers) == (120, 218)  # Nighthawk: 120 qubits, 218 couplers
    hh = heron_heavy_hex()
    assert (hh.num_qubits, hh.num_couplers) == (156, 176)  # Heron: 156 qubits, 176 couplers
    assert hh.degree_stats()["max"] == 3 and sq.degree_stats()["max"] == 4


def test_checkerboard_has_no_crossing_diagonals():
    t = aurora_lattice(checkerboard_diagonals())
    assert t.num_couplers == 218 + 50  # one '\\' diagonal on every other plaquette of the 11x9 grid
    assert len(set(t.edges)) == len(t.edges)


# ------------------------------------------------------------- single qubit
@pytest.mark.parametrize("theta,phi", [(0.3, 0.1), (1.0, 0.7), (2.5, -1.2)])
def test_bloch_vector_matches_analytic(theta, phi):
    r = run_circuit({"num_qubits": 1, "ops": [{"name": "ry", "qubits": [0], "params": [theta]},
                                               {"name": "rz", "qubits": [0], "params": [phi]}]}, shots=10, seed=1)
    x, y, z = r["bloch"][0]
    assert x == pytest.approx(math.sin(theta) * math.cos(phi), abs=1e-9)
    assert y == pytest.approx(math.sin(theta) * math.sin(phi), abs=1e-9)
    assert z == pytest.approx(math.cos(theta), abs=1e-9)


def test_bell_state_statistics_and_entanglement():
    spec = {"num_qubits": 2, "ops": [{"name": "h", "qubits": [0]}, {"name": "cx", "qubits": [0, 1]}]}
    r = run_circuit(spec, shots=20000, seed=7)
    assert set(r["counts"]) == {"00", "11"}
    assert abs(r["counts"]["00"] / 20000 - 0.5) < 0.02
    amps = np.array([complex(a, b) for a, b in r["statevector"]])
    assert np.allclose(np.abs(amps) ** 2, [0.5, 0, 0, 0.5])
    # reduced states are maximally mixed -> zero Bloch vectors
    assert np.allclose(r["bloch"], 0, atol=1e-12)


def test_ghz_parity_and_noise_reduces_purity():
    spec = {"num_qubits": 3, "ops": [{"name": "h", "qubits": [0]}, {"name": "cx", "qubits": [0, 1]},
                                     {"name": "cx", "qubits": [1, 2]}]}
    clean = run_circuit(spec, shots=4000, seed=3)
    assert set(clean["counts"]) == {"000", "111"}
    noisy = run_circuit(spec, shots=4000, seed=3, noise={"p2": 0.05, "readout": 0.0})
    assert noisy["purity"] < 0.95
    assert sum(v for k, v in noisy["counts"].items() if k not in ("000", "111")) > 0


def test_teleportation_with_mid_circuit_measurement():
    # teleport RY(0.8)|0> from q0 to q2 using deferred-measurement corrections
    ops = [{"name": "ry", "qubits": [0], "params": [0.8]},
           {"name": "h", "qubits": [1]}, {"name": "cx", "qubits": [1, 2]},
           {"name": "cx", "qubits": [0, 1]}, {"name": "h", "qubits": [0]},
           {"name": "cx", "qubits": [1, 2]}, {"name": "cz", "qubits": [0, 2]},
           {"name": "measure", "qubits": [2], "clbits": [2]}]
    r = run_circuit({"num_qubits": 3, "ops": ops}, shots=40000, seed=11)
    p1 = sum(v for k, v in r["counts"].items() if k[0] == "1") / 40000
    assert p1 == pytest.approx(math.sin(0.4) ** 2, abs=0.01)


def test_validation_rejects_bad_circuits():
    with pytest.raises(CircuitValidationError):
        validate({"num_qubits": 2, "ops": [{"name": "cx", "qubits": [0, 0]}]})
    with pytest.raises(CircuitValidationError):
        validate({"num_qubits": 2, "ops": [{"name": "rx", "qubits": [0]}]})
    with pytest.raises(CircuitValidationError):
        validate({"num_qubits": 100, "ops": []})
    with pytest.raises(CircuitValidationError):
        validate({"num_qubits": 2, "ops": [{"name": "frobnicate", "qubits": [0]}]})


def test_roundtrip_json_qiskit():
    spec = {"num_qubits": 3, "num_clbits": 3, "ops": [
        {"name": "h", "qubits": [0]}, {"name": "cp", "qubits": [0, 1], "params": [0.5]},
        {"name": "u", "qubits": [2], "params": [0.1, 0.2, 0.3]}, {"name": "measure", "qubits": [1], "clbits": [1]}]}
    back = from_qiskit(to_qiskit(spec))
    assert Statevector(to_qiskit({**spec, "ops": spec["ops"][:-1]})).equiv(
        Statevector(to_qiskit({**back, "ops": back["ops"][:-1]})))


# ------------------------------------------------------------ numpy kernels
def test_numpy_kernel_matches_qiskit_on_random_circuits():
    rng = np.random.default_rng(0)
    n = 4
    for _ in range(10):
        psi = Q.zero_state(n)
        ops = []
        for _ in range(25):
            kind = rng.integers(4)
            q = int(rng.integers(n))
            if kind == 0:
                t = float(rng.uniform(-3, 3)); psi = Q.apply_1q(psi, Q.ry(t), q, n); ops.append({"name": "ry", "qubits": [q], "params": [t]})
            elif kind == 1:
                t = float(rng.uniform(-3, 3)); psi = Q.apply_1q(psi, Q.rz(t), q, n); ops.append({"name": "rz", "qubits": [q], "params": [t]})
            else:
                r = int((q + 1 + rng.integers(n - 1)) % n)
                if kind == 2:
                    psi = Q.apply_cx(psi, q, r, n); ops.append({"name": "cx", "qubits": [q, r]})
                else:
                    psi = Q.apply_cz(psi, q, r, n); ops.append({"name": "cz", "qubits": [q, r]})
        ref = Statevector(to_qiskit({"num_qubits": n, "ops": ops})).data
        assert np.allclose(psi, ref, atol=1e-10)


# ------------------------------------------------------------------- chemistry
def test_h2_jordan_wigner_matches_fci_and_qiskit():
    H, e_hf, e_fci, _ = chemistry.hamiltonian(0.74)
    assert chemistry.n2_ground(H) == pytest.approx(e_fci, abs=1e-9)
    assert e_fci == pytest.approx(-1.13728, abs=2e-5)  # textbook STO-3G value
    terms = chemistry.pauli_decompose(H)
    op = SparsePauliOp([t[0] for t in terms], [t[1] for t in terms])
    assert np.allclose(op.to_matrix(), H, atol=1e-10)
    # 1-parameter particle-conserving ansatz reaches FCI
    from scipy.optimize import minimize_scalar
    r = minimize_scalar(lambda t: chemistry.energy(chemistry.ansatz_pc(t), H), bounds=(-1.6, 1.6), method="bounded")
    assert r.fun == pytest.approx(e_fci, abs=1e-7)


# ------------------------------------------------------------------------ QEC
def test_surface_code_suppresses_errors_below_threshold():
    lo = [qec.logical_error(qec.build_surface(d, d, p1=1e-3, p2=1e-3, p_idle=1e-3, p_meas=1e-3, p_reset=1e-3),
                            max_shots=100_000, target_errors=200)["rate"] for d in (3, 5)]
    assert lo[1] < lo[0] / 2  # distance 5 beats distance 3 at p = 0.1 %


def test_reset_error_increases_logical_error():
    a = qec.logical_error(qec.build_surface(5, 5, p1=2.5e-4, p2=1.5e-3, p_idle=1e-3, p_meas=5e-3, p_reset=4e-4), max_shots=100_000)
    b = qec.logical_error(qec.build_surface(5, 5, p1=2.5e-4, p2=1.5e-3, p_idle=1e-3, p_meas=5e-3, p_reset=2e-2), max_shots=100_000)
    assert b["rate"] > a["rate"]


def test_wilson_interval_sane():
    w = common.wilson(5, 100)
    assert w["lo"] < 0.05 < w["hi"] and 0 <= w["lo"] and w["hi"] <= 1
