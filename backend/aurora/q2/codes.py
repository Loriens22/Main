"""CSS code constructions with exact GF(2) linear algebra.

* Bivariate bicycle (BB) codes (Bravyi et al., Nature 627, 778 (2024)):
    x = S_l (x) I_m, y = I_l (x) S_m,  A = sum of 3 monomials, B = sum of 3 monomials,
    H_X = [A | B],  H_Z = [B^T | A^T],  n = 2 l m,  k = n - rank H_X - rank H_Z.
* Rotated surface code of distance d (for apples-to-apples comparison).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# (name, l, m, A terms, B terms, published distance) — terms are (power of x, power of y)
BB_CODES = {
    "bb72": (6, 6, [(3, 0), (0, 1), (0, 2)], [(0, 3), (1, 0), (2, 0)], 6),
    "bb90": (15, 3, [(9, 0), (0, 1), (0, 2)], [(0, 0), (2, 0), (7, 0)], 10),
    "bb108": (9, 6, [(3, 0), (0, 1), (0, 2)], [(0, 3), (1, 0), (2, 0)], 10),
    "gross144": (12, 6, [(3, 0), (0, 1), (0, 2)], [(0, 3), (1, 0), (2, 0)], 12),
    "bb288": (12, 12, [(3, 0), (0, 2), (0, 7)], [(0, 3), (1, 0), (2, 0)], 18),
}


# ------------------------------------------------------------------- GF(2) algebra
def gf2_rref(M: np.ndarray):
    A = (M.copy() % 2).astype(np.uint8)
    rows, cols = A.shape
    pivots = []
    r = 0
    for c in range(cols):
        if r >= rows:
            break
        piv = np.nonzero(A[r:, c])[0]
        if len(piv) == 0:
            continue
        p = r + piv[0]
        if p != r:
            A[[r, p]] = A[[p, r]]
        nz = np.nonzero(A[:, c])[0]
        nz = nz[nz != r]
        A[nz] ^= A[r]
        pivots.append(c)
        r += 1
    return A[:r], pivots


def gf2_rank(M: np.ndarray) -> int:
    return len(gf2_rref(M)[1])


def gf2_nullspace(M: np.ndarray) -> np.ndarray:
    R, piv = gf2_rref(M)
    n = M.shape[1]
    free = [c for c in range(n) if c not in set(piv)]
    basis = []
    for f in free:
        v = np.zeros(n, dtype=np.uint8)
        v[f] = 1
        for i, p in enumerate(piv):
            if R[i, f]:
                v[p] = 1
        basis.append(v)
    return np.array(basis, dtype=np.uint8).reshape(len(basis), n)


def logical_ops(HX: np.ndarray, HZ: np.ndarray):
    """Return (Lx, Lz): k x n matrices of X and Z logical operators with Lx Lz^T = I (symplectic pairs)."""
    def independent_from(space_rows, cands):
        basis = space_rows.copy()
        chosen = []
        r0 = gf2_rank(basis) if len(basis) else 0
        for v in cands:
            trial = np.vstack([basis, v]) if len(basis) else v[None, :]
            r = gf2_rank(trial)
            if r > r0:
                basis, r0 = trial, r
                chosen.append(v)
        return np.array(chosen, dtype=np.uint8)

    Lz = independent_from(HZ, gf2_nullspace(HX))  # commute with X checks, not Z stabilisers
    Lx = independent_from(HX, gf2_nullspace(HZ))
    # symplectic Gram-Schmidt so that Lx[i] . Lz[j] = delta_ij
    k = len(Lz)
    Lx, Lz = Lx.copy(), Lz.copy()
    for i in range(k):
        # find a pair partner for Lz[i]
        j = next(j for j in range(i, k) if (Lx[j] @ Lz[i]) % 2 == 1)
        Lx[[i, j]] = Lx[[j, i]]
        for t in range(k):
            if t != i and (Lx[t] @ Lz[i]) % 2:
                Lx[t] ^= Lx[i]
            if t != i and (Lx[i] @ Lz[t]) % 2:
                Lz[t] ^= Lz[i]
    return Lx, Lz


# ----------------------------------------------------------------------- codes
@dataclass
class CSSCode:
    name: str
    HX: np.ndarray
    HZ: np.ndarray
    distance: int | None
    meta: dict = field(default_factory=dict)
    _logicals: tuple | None = None

    @property
    def n(self) -> int:
        return self.HX.shape[1]

    @property
    def k(self) -> int:
        return self.n - gf2_rank(self.HX) - gf2_rank(self.HZ)

    @property
    def logicals(self):
        if self._logicals is None:
            self._logicals = logical_ops(self.HX, self.HZ)
        return self._logicals

    def summary(self) -> dict:
        return {"name": self.name, "n": self.n, "k": self.k, "d": self.distance,
                "checks_x": int(self.HX.shape[0]), "checks_z": int(self.HZ.shape[0]),
                "physical_qubits_with_ancillas": int(self.n + self.HX.shape[0] + self.HZ.shape[0]),
                "max_check_weight": int(max(self.HX.sum(1).max(), self.HZ.sum(1).max())),
                "max_qubit_degree": int(self.HX.sum(0).max() + self.HZ.sum(0).max()), **self.meta}


def _shift(n: int, k: int) -> np.ndarray:
    return np.roll(np.eye(n, dtype=np.uint8), k % n, axis=1)


def bb_code(name: str) -> CSSCode:
    l, m, A_terms, B_terms, d = BB_CODES[name]
    def mono(i, j):
        return np.kron(_shift(l, i), _shift(m, j)) % 2
    A = sum(mono(i, j) for i, j in A_terms) % 2
    B = sum(mono(i, j) for i, j in B_terms) % 2
    HX = np.hstack([A, B]).astype(np.uint8)
    HZ = np.hstack([B.T, A.T]).astype(np.uint8)
    return CSSCode(name, HX, HZ, d, {"family": "bivariate bicycle", "l": l, "m": m, "A": A_terms, "B": B_terms})


def rotated_surface_code(d: int) -> CSSCode:
    """Data qubits on a d x d grid; weight-4 bulk plaquettes and weight-2 boundary checks."""
    idx = lambda r, c: r * d + c
    xs, zs = [], []
    for r in range(-1, d):
        for c in range(-1, d):
            qs = [idx(rr, cc) for rr in (r, r + 1) for cc in (c, c + 1) if 0 <= rr < d and 0 <= cc < d]
            is_x = (r + c) % 2 == 0
            if len(qs) == 4:
                (xs if is_x else zs).append(qs)
            elif len(qs) == 2:
                # X-type boundary checks on top/bottom, Z-type on left/right
                if is_x and (r == -1 or r == d - 1):
                    xs.append(qs)
                if (not is_x) and (c == -1 or c == d - 1):
                    zs.append(qs)
    n = d * d
    def mat(checks):
        M = np.zeros((len(checks), n), dtype=np.uint8)
        for i, qs in enumerate(checks):
            M[i, qs] = 1
        return M
    return CSSCode(f"surface_d{d}", mat(xs), mat(zs), d, {"family": "rotated surface"})


def all_codes() -> list[CSSCode]:
    return [bb_code(k) for k in BB_CODES] + [rotated_surface_code(d) for d in (3, 5, 7, 9, 11, 13)]
