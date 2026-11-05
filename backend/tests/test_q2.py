"""AURORA-Q2: code construction, memory circuits, herald bookkeeping, layout and cryo-model invariants."""

import numpy as np
import pytest

from aurora.q2.codes import bb_code, rotated_surface_code
from aurora.q2.cryo import ARCH, coherence_budget, max_qubits, n_bose, photon_chain
from aurora.q2.layout import placement, toroid_layout
from aurora.q2.memory import Noise, build_memory_circuit, dem_matrices, run_memory


@pytest.mark.parametrize("name,n,k", [("bb72", 72, 12), ("bb90", 90, 8), ("bb108", 108, 8), ("gross144", 144, 12), ("bb288", 288, 12)])
def test_bb_parameters(name, n, k):
    c = bb_code(name)
    assert (c.n, c.k) == (n, k)
    assert not ((c.HX @ c.HZ.T) % 2).any()
    Lx, Lz = c.logicals
    assert ((Lx @ Lz.T) % 2 == np.eye(k, dtype=int)).all()
    assert c.HX.sum(1).max() == 6 and c.HZ.sum(1).max() == 6


@pytest.mark.parametrize("d", [3, 5, 7])
def test_surface_code(d):
    c = rotated_surface_code(d)
    assert (c.n, c.k) == (d * d, 1)


@pytest.mark.parametrize("code", [rotated_surface_code(3), bb_code("bb72")])
@pytest.mark.parametrize("f", [0.0, 0.9])
def test_noiseless_circuit_is_deterministic(code, f):
    circ, info = build_memory_circuit(code, 3, Noise(p2=0, p1=0, p_idle=0, p_idle_meas=0, p_meas=0, p_reset=0, f_herald=f))
    det, obs = circ.compile_detector_sampler(seed=1).sample(64, separate_observables=True)
    assert not det.any() and not obs.any()


def test_bb_schedule_has_twelve_matching_layers():
    _, info = build_memory_circuit(bb_code("gross144"), 1, Noise.uniform(1e-3))
    assert info["cnot_layers_per_round"] == 12


def test_heralds_are_separated_from_syndrome():
    circ, _ = build_memory_circuit(rotated_surface_code(3), 2, Noise.uniform(0.01, f_herald=0.9))
    H, O, pri, Hh, syn, her = dem_matrices(circ)
    assert len(her) > 0 and H.shape[0] == len(syn)
    assert Hh.shape[1] == H.shape[1] == len(pri)


def test_heralding_helps():
    c = rotated_surface_code(3)
    a = run_memory(c, 3, Noise.uniform(0.02, 0.0), shots=4000, seed=3, max_errors=10 ** 9, max_seconds=60)
    b = run_memory(c, 3, Noise.uniform(0.02, 0.95), shots=4000, seed=3, max_errors=10 ** 9, max_seconds=60)
    assert b["block_error"] < a["block_error"]


def test_toroid_layout_invariants():
    pos, R, C = placement(bb_code("gross144"))
    assert len(set(pos.values())) == R * C == 288
    s = toroid_layout()["summary"]
    assert s["couplers_total"] == 864 and s["couplers_die"] == 540 and s["die_crossings"] == 0
    assert s["long_range"] == 288 and s["wrap_edges"] == 36
    assert s["manhattan"]["max_tracks_V"] <= 12 and s["manhattan"]["max_tracks_H"] <= 12


def test_cryo_model_sanity():
    assert n_bose(7e9, 0.0) == 0.0 and abs(n_bose(7e9, 300) - 892.4) < 1
    ch = photon_chain(7e9, ARCH["conventional"]["chain"])
    assert ch[-1]["n"] < ch[1]["n"] < ch[0]["n"]
    conv, aur = coherence_budget(ARCH["conventional"]), coherence_budget(ARCH["aurora"])
    assert aur["T2"] > conv["T2"] and aur["noise"]["p_idle_meas"] < conv["noise"]["p_idle_meas"]
    assert max_qubits("aurora", extra_4k_w=12.0)["max_qubits"] > max_qubits("conventional")["max_qubits"]
