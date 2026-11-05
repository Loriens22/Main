"""Parameterised noise models (Qiskit Aer) for AURORA-Q experiments.

Every parameter here is an *assumption* unless the caller passes values taken from
a published calibration. Defaults are representative of 2025-2026 superconducting
processors as reported in the source ledger (research/sources.md), e.g. median
two-qubit error of order 1-3e-3 and readout error of order 1e-2. They are NOT
measured AURORA-Q values (no AURORA-Q hardware exists).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from qiskit_aer.noise import (
    NoiseModel,
    ReadoutError,
    depolarizing_error,
    thermal_relaxation_error,
)
from qiskit_aer.noise.errors import pauli_error

ONE_Q_GATES = ["x", "y", "z", "h", "s", "sdg", "t", "tdg", "sx", "sxdg", "rx", "ry", "rz", "p", "u", "id"]
TWO_Q_GATES = ["cx", "cz", "cy", "ch", "swap", "crx", "cry", "crz", "cp", "rzz", "rxx", "ryy", "ecr", "iswap"]


@dataclass
class NoiseParams:
    p1: float = 2e-4          # single-qubit depolarizing probability per gate
    p2: float = 2e-3          # two-qubit depolarizing probability per gate
    readout: float = 1e-2     # symmetric readout bit-flip probability
    reset_error: float = 0.0  # probability qubit is left in |1> after reset (initialization error)
    t1_us: float | None = None  # if set, add thermal relaxation on gates
    t2_us: float | None = None
    t_1q_ns: float = 25.0
    t_2q_ns: float = 70.0
    t_meas_ns: float = 1000.0
    crosstalk_zz: float = 0.0  # extra two-qubit Pauli ZZ probability applied after each 2Q gate (crude spectator proxy)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> "NoiseParams":
        if not d:
            return cls()
        allowed = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in d.items() if k in allowed and v is not None})


def build_noise_model(p: NoiseParams) -> NoiseModel:
    nm = NoiseModel()
    thermal = bool(p.t1_us and p.t2_us)
    if p.p1 > 0 or thermal:
        e1 = depolarizing_error(max(p.p1, 0.0), 1)
        if thermal:
            e1 = e1.compose(thermal_relaxation_error(p.t1_us * 1e3, min(p.t2_us, 2 * p.t1_us) * 1e3, p.t_1q_ns))
        nm.add_all_qubit_quantum_error(e1, ONE_Q_GATES)
    if p.p2 > 0 or p.crosstalk_zz > 0 or thermal:
        e2 = depolarizing_error(max(p.p2, 0.0), 2)
        if thermal:
            tr = thermal_relaxation_error(p.t1_us * 1e3, min(p.t2_us, 2 * p.t1_us) * 1e3, p.t_2q_ns)
            e2 = e2.compose(tr.tensor(tr))
        if p.crosstalk_zz > 0:
            zz = pauli_error([("ZZ", p.crosstalk_zz), ("II", 1 - p.crosstalk_zz)])
            e2 = e2.compose(zz)
        nm.add_all_qubit_quantum_error(e2, TWO_Q_GATES)
    if p.readout > 0:
        nm.add_all_qubit_readout_error(ReadoutError([[1 - p.readout, p.readout], [p.readout, 1 - p.readout]]))
    if p.reset_error > 0:
        nm.add_all_qubit_quantum_error(pauli_error([("X", p.reset_error), ("I", 1 - p.reset_error)]), ["reset"])
    return nm


PRESETS: dict[str, dict] = {
    "ideal": {"p1": 0, "p2": 0, "readout": 0, "reset_error": 0},
    "heron_class": {"p1": 2.5e-4, "p2": 2.5e-3, "readout": 1.3e-2, "reset_error": 1e-2,
                    "t1_us": 250, "t2_us": 200},
    "nighthawk_r2_class": {"p1": 2.5e-4, "p2": 2.5e-3, "readout": 1.3e-2, "reset_error": 4e-4,
                           "t1_us": 250, "t2_us": 200},
    "aurora_q_target": {"p1": 1e-4, "p2": 1e-3, "readout": 5e-3, "reset_error": 4e-4,
                        "t1_us": 500, "t2_us": 500},
}
PRESET_NOTES = {
    "ideal": "Noise-free reference.",
    "heron_class": "Illustrative Heron-class values (order of magnitude from public dashboards; reset error assumes conditional reset limited by readout).",
    "nighthawk_r2_class": "As heron_class but initialization error reduced 25x, mirroring IBM's reported dissipative-reset improvement.",
    "aurora_q_target": "AURORA-Q design TARGET, not a measurement. Requires materials improvements of the kind reported for Ta-on-Si transmons.",
}
