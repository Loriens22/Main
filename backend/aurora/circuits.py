"""Portable circuit format shared by the browser engine and the Python backend.

Schema (JSON)::

    {
      "num_qubits": 3,
      "num_clbits": 3,             # optional, defaults to num_qubits
      "ops": [
        {"name": "h",  "qubits": [0]},
        {"name": "cx", "qubits": [0, 1]},
        {"name": "rz", "qubits": [2], "params": [0.25]},
        {"name": "measure", "qubits": [0], "clbits": [0]},
        {"name": "reset", "qubits": [1]}
      ]
    }

Angles are in radians. ``u`` takes (theta, phi, lambda) with Qiskit's convention.
"""

from __future__ import annotations

from typing import Any

from qiskit import QuantumCircuit

ONE_Q = {"id", "x", "y", "z", "h", "s", "sdg", "t", "tdg", "sx", "sxdg"}
ONE_Q_PARAM = {"rx": 1, "ry": 1, "rz": 1, "p": 1, "u": 3}
TWO_Q = {"cx", "cy", "cz", "ch", "swap", "iswap", "ecr"}
TWO_Q_PARAM = {"crx": 1, "cry": 1, "crz": 1, "cp": 1, "rzz": 1, "rxx": 1, "ryy": 1}
THREE_Q = {"ccx", "cswap"}
SPECIAL = {"measure", "reset", "barrier"}

ALL_GATES = ONE_Q | set(ONE_Q_PARAM) | TWO_Q | set(TWO_Q_PARAM) | THREE_Q | SPECIAL

MAX_QUBITS_API = 32  # hard limit for the public API (statevector memory guard)
MAX_OPS_API = 20000


class CircuitValidationError(ValueError):
    pass


def _arity(name: str) -> int:
    if name in ONE_Q or name in ONE_Q_PARAM:
        return 1
    if name in TWO_Q or name in TWO_Q_PARAM:
        return 2
    if name in THREE_Q:
        return 3
    return -1


def validate(spec: dict[str, Any], max_qubits: int = MAX_QUBITS_API) -> None:
    if not isinstance(spec, dict):
        raise CircuitValidationError("circuit must be an object")
    n = spec.get("num_qubits")
    if not isinstance(n, int) or n < 1 or n > max_qubits:
        raise CircuitValidationError(f"num_qubits must be an integer in [1, {max_qubits}]")
    nc = spec.get("num_clbits", n)
    if not isinstance(nc, int) or nc < 0 or nc > 4 * max_qubits:
        raise CircuitValidationError("num_clbits out of range")
    ops = spec.get("ops", [])
    if not isinstance(ops, list) or len(ops) > MAX_OPS_API:
        raise CircuitValidationError(f"ops must be a list with at most {MAX_OPS_API} entries")
    for i, op in enumerate(ops):
        name = op.get("name")
        if name not in ALL_GATES:
            raise CircuitValidationError(f"op {i}: unsupported gate '{name}'")
        qs = op.get("qubits", [])
        if not isinstance(qs, list) or not all(isinstance(q, int) and 0 <= q < n for q in qs):
            raise CircuitValidationError(f"op {i}: invalid qubit indices {qs}")
        if len(set(qs)) != len(qs):
            raise CircuitValidationError(f"op {i}: repeated qubit in {qs}")
        ar = _arity(name)
        if ar > 0 and len(qs) != ar:
            raise CircuitValidationError(f"op {i}: '{name}' acts on {ar} qubit(s)")
        need = ONE_Q_PARAM.get(name) or TWO_Q_PARAM.get(name) or 0
        ps = op.get("params", [])
        if len(ps) != need or not all(isinstance(p, (int, float)) for p in ps):
            raise CircuitValidationError(f"op {i}: '{name}' needs {need} numeric parameter(s)")
        if name == "measure":
            cs = op.get("clbits", qs)
            if len(cs) != len(qs) or not all(isinstance(c, int) and 0 <= c < nc for c in cs):
                raise CircuitValidationError(f"op {i}: invalid clbits")


def to_qiskit(spec: dict[str, Any]) -> QuantumCircuit:
    validate(spec, max_qubits=10_000)
    n = spec["num_qubits"]
    nc = spec.get("num_clbits", n)
    qc = QuantumCircuit(n, nc)
    for op in spec.get("ops", []):
        name, qs, ps = op["name"], op.get("qubits", []), op.get("params", [])
        if name == "measure":
            qc.measure(qs, op.get("clbits", qs))
        elif name == "reset":
            for q in qs:
                qc.reset(q)
        elif name == "barrier":
            qc.barrier(*(qs or range(n)))
        elif name == "u":
            qc.u(ps[0], ps[1], ps[2], qs[0])
        elif name == "sxdg":
            qc.sxdg(qs[0])
        else:
            getattr(qc, name)(*ps, *qs)
    return qc


def from_qiskit(qc: QuantumCircuit) -> dict[str, Any]:
    ops = []
    for inst in qc.data:
        name = inst.operation.name
        qs = [qc.find_bit(q).index for q in inst.qubits]
        entry: dict[str, Any] = {"name": name, "qubits": qs}
        if inst.operation.params:
            entry["params"] = [float(p) for p in inst.operation.params]
        if name == "measure":
            entry["clbits"] = [qc.find_bit(c).index for c in inst.clbits]
        ops.append(entry)
    return {"num_qubits": qc.num_qubits, "num_clbits": qc.num_clbits, "ops": ops}


def to_openqasm3(spec: dict[str, Any]) -> str:
    from qiskit import qasm3

    return qasm3.dumps(to_qiskit(spec))


def stats(spec: dict[str, Any]) -> dict[str, int]:
    qc = to_qiskit(spec)
    two_q = sum(1 for d in qc.data if d.operation.num_qubits == 2)
    return {
        "num_qubits": qc.num_qubits,
        "size": qc.size(),
        "depth": qc.depth(),
        "two_qubit_gates": two_q,
        "measurements": qc.count_ops().get("measure", 0),
    }
