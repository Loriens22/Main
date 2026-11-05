"""Minimal, fast NumPy statevector / density-matrix kernels for small variational workloads.

Qubit ordering follows Qiskit (little-endian: qubit 0 is the least-significant bit).
Validated against qiskit.quantum_info in tests/test_qsim_np.py.
"""

from __future__ import annotations

import math

import numpy as np

I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
H = np.array([[1, 1], [1, -1]], dtype=complex) / math.sqrt(2)
S = np.diag([1, 1j])
T = np.diag([1, np.exp(1j * math.pi / 4)])


def rx(t):
    c, s = math.cos(t / 2), math.sin(t / 2)
    return np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)


def ry(t):
    c, s = math.cos(t / 2), math.sin(t / 2)
    return np.array([[c, -s], [s, c]], dtype=complex)


def rz(t):
    return np.array([[np.exp(-1j * t / 2), 0], [0, np.exp(1j * t / 2)]], dtype=complex)


GATES_1Q = {"x": X, "y": Y, "z": Z, "h": H, "s": S, "t": T}


def zero_state(n: int) -> np.ndarray:
    psi = np.zeros(2 ** n, dtype=complex)
    psi[0] = 1
    return psi


def apply_1q(psi: np.ndarray, U: np.ndarray, q: int, n: int) -> np.ndarray:
    psi = psi.reshape([2] * n)
    ax = n - 1 - q
    psi = np.moveaxis(np.tensordot(U, psi, axes=([1], [ax])), 0, ax)
    return psi.reshape(-1)


def apply_cz(psi: np.ndarray, a: int, b: int, n: int) -> np.ndarray:
    idx = np.arange(2 ** n)
    mask = ((idx >> a) & 1) & ((idx >> b) & 1)
    out = psi.copy()
    out[mask == 1] *= -1
    return out


def apply_cx(psi: np.ndarray, c: int, t: int, n: int) -> np.ndarray:
    idx = np.arange(2 ** n)
    sel = ((idx >> c) & 1) == 1
    out = psi.copy()
    flip = idx ^ (1 << t)
    out[sel] = psi[flip[sel]]
    return out


def apply_rzz(psi: np.ndarray, theta: float, a: int, b: int, n: int) -> np.ndarray:
    idx = np.arange(2 ** n)
    parity = ((idx >> a) ^ (idx >> b)) & 1
    phase = np.where(parity == 0, np.exp(-1j * theta / 2), np.exp(1j * theta / 2))
    return psi * phase


def expval_z(psi: np.ndarray, q: int, n: int) -> float:
    idx = np.arange(2 ** n)
    sign = 1 - 2 * ((idx >> q) & 1)
    return float(np.sum(sign * np.abs(psi) ** 2))


def pauli_matrix(label: str) -> np.ndarray:
    """label like 'XIZY' in Qiskit order (rightmost char = qubit 0)."""
    m = np.array([[1]], dtype=complex)
    for ch in label:
        m = np.kron(m, {"I": I2, "X": X, "Y": Y, "Z": Z}[ch])
    return m


# ------------------------------------------------------------ density matrices
def dm_apply_1q(rho: np.ndarray, U: np.ndarray, q: int, n: int) -> np.ndarray:
    full = np.array([[1]], dtype=complex)
    for k in reversed(range(n)):
        full = np.kron(full, U if k == q else I2)
    return full @ rho @ full.conj().T


def dm_apply_full(rho: np.ndarray, U: np.ndarray) -> np.ndarray:
    return U @ rho @ U.conj().T


def dm_depolarize(rho: np.ndarray, p: float, qubits: list[int], n: int) -> np.ndarray:
    """k-qubit depolarising channel with probability p on the listed qubits."""
    if p <= 0:
        return rho
    k = len(qubits)
    paulis = [I2, X, Y, Z]
    out = (1 - p) * rho
    import itertools

    terms = list(itertools.product(range(4), repeat=k))[1:]
    w = p / len(terms)
    for t in terms:
        full = np.array([[1]], dtype=complex)
        for qq in reversed(range(n)):
            if qq in qubits:
                full = np.kron(full, paulis[t[qubits.index(qq)]])
            else:
                full = np.kron(full, I2)
        out = out + w * (full @ rho @ full.conj().T)
    return out


def cz_matrix(a: int, b: int, n: int) -> np.ndarray:
    idx = np.arange(2 ** n)
    d = np.where((((idx >> a) & 1) & ((idx >> b) & 1)) == 1, -1, 1)
    return np.diag(d).astype(complex)
