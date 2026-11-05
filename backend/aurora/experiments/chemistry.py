"""Experiment 4 (quantum chemistry): H2 / STO-3G potential-energy curve with VQE.

Pipeline (fully reproducible, no black boxes):
  1. PySCF: RHF, molecular-orbital integrals h_pq, (pq|rs), nuclear repulsion, FCI energy.
  2. Our own Jordan–Wigner construction of the 4-qubit Hamiltonian (16x16 matrix built from
     JW creation operators), validated by exact diagonalisation in the N=2 sector == FCI.
  3. Pauli decomposition (c_P = Tr(P H)/2^n) exported for the browser VQE.
  4. VQE with (a) a 1-parameter particle-conserving ansatz (exact for H2/STO-3G) and
     (b) a 2-layer hardware-efficient RY/CZ ansatz; plus (c) the hardware-efficient ansatz
     under depolarising noise to show how gate errors break chemical accuracy (1.6 mHa).
"""

from __future__ import annotations

import itertools
import math
import time

import numpy as np
from scipy.optimize import minimize

from .. import qsim_np as Q
from . import common as C

NQ = 4
CHEM_ACC = 1.6e-3  # Hartree


def jw_ops(n: int) -> list[np.ndarray]:
    """Annihilation operators a_p (qubit p = bit p, little-endian) under Jordan–Wigner."""
    sm = np.array([[0, 1], [0, 0]], dtype=complex)  # |0><1| : annihilates occupation |1>
    ops = []
    for p in range(n):
        m = np.array([[1]], dtype=complex)
        for k in reversed(range(n)):
            if k == p:
                m = np.kron(m, sm)
            elif k < p:
                m = np.kron(m, Q.Z)
            else:
                m = np.kron(m, Q.I2)
        ops.append(m)
    return ops


def hamiltonian(R: float):
    from pyscf import ao2mo, fci, gto, scf

    mol = gto.M(atom=f"H 0 0 0; H 0 0 {R}", basis="sto-3g", unit="Angstrom", verbose=0)
    mf = scf.RHF(mol).run()
    C_mo = mf.mo_coeff
    h1 = C_mo.T @ mf.get_hcore() @ C_mo
    eri = ao2mo.restore(1, ao2mo.kernel(mol, C_mo), C_mo.shape[1])
    e_nuc = mol.energy_nuc()
    e_fci = fci.FCI(mf).kernel()[0]
    nso = 2 * h1.shape[0]
    a = jw_ops(nso)
    ad = [x.conj().T for x in a]
    H = np.zeros((2 ** nso, 2 ** nso), dtype=complex)
    ns = h1.shape[0]
    # spin-orbital index: spatial i, spin s -> i + ns*s  (0a,1a,0b,1b)
    for p, q in itertools.product(range(nso), repeat=2):
        if p // ns == q // ns:
            H += h1[p % ns, q % ns] * ad[p] @ a[q]
    for p, q, r, s in itertools.product(range(nso), repeat=4):
        if p // ns == q // ns and r // ns == s // ns:
            g = eri[p % ns, q % ns, r % ns, s % ns]
            if abs(g) > 1e-12:
                H += 0.5 * g * ad[p] @ ad[r] @ a[s] @ a[q]
    H += e_nuc * np.eye(2 ** nso)
    return H, float(mf.e_tot), float(e_fci), float(e_nuc)


def pauli_decompose(H: np.ndarray, n: int = NQ) -> list[tuple[str, float]]:
    terms = []
    for lab in itertools.product("IXYZ", repeat=n):
        s = "".join(lab)
        c = np.trace(Q.pauli_matrix(s) @ H).real / 2 ** n
        if abs(c) > 1e-10:
            terms.append((s, float(c)))
    return terms


def n2_ground(H: np.ndarray) -> float:
    idx = [i for i in range(2 ** NQ) if bin(i).count("1") == 2]
    return float(np.linalg.eigvalsh(H[np.ix_(idx, idx)].real)[0])


# ----------------------------------------------------------------------- ansätze
def ansatz_pc(theta: float) -> np.ndarray:
    """cos(t)|1010> + sin(t)|0101>  built from RY, CNOT, X (see docs for the circuit)."""
    psi = Q.zero_state(NQ)
    psi = Q.apply_1q(psi, Q.ry(2 * theta), 0, NQ)
    psi = Q.apply_cx(psi, 0, 2, NQ)
    psi = Q.apply_1q(psi, Q.X, 1, NQ)
    psi = Q.apply_1q(psi, Q.X, 3, NQ)
    psi = Q.apply_cx(psi, 0, 1, NQ)
    psi = Q.apply_cx(psi, 0, 3, NQ)
    return psi


def ansatz_hea(params: np.ndarray, layers: int = 2) -> np.ndarray:
    psi = Q.zero_state(NQ)
    p = params.reshape(layers + 1, NQ)
    for l in range(layers):
        for q in range(NQ):
            psi = Q.apply_1q(psi, Q.ry(p[l, q]), q, NQ)
        for q in range(NQ - 1):
            psi = Q.apply_cz(psi, q, q + 1, NQ)
    for q in range(NQ):
        psi = Q.apply_1q(psi, Q.ry(p[layers, q]), q, NQ)
    return psi


def ansatz_hea_noisy(params, H, p1, p2, layers=2) -> float:
    rho = np.zeros((16, 16), dtype=complex)
    rho[0, 0] = 1
    p = params.reshape(layers + 1, NQ)
    for l in range(layers + 1):
        for q in range(NQ):
            rho = Q.dm_apply_1q(rho, Q.ry(p[l, q]), q, NQ)
            rho = Q.dm_depolarize(rho, p1, [q], NQ)
        if l < layers:
            for q in range(NQ - 1):
                rho = Q.dm_apply_full(rho, Q.cz_matrix(q, q + 1, NQ))
                rho = Q.dm_depolarize(rho, p2, [q, q + 1], NQ)
    return float(np.real(np.trace(rho @ H)))


def energy(psi, H) -> float:
    return float(np.real(psi.conj() @ H @ psi))


def run(quick: bool = False) -> dict:
    t0 = time.time()
    Rs = np.round(np.arange(0.3, 2.61, 0.1), 2) if not quick else np.array([0.5, 0.74, 1.5])
    rows = []
    rng = np.random.default_rng(3)
    for R in Rs:
        H, e_hf, e_fci, e_nuc = hamiltonian(float(R))
        e_ed = n2_ground(H)
        terms = pauli_decompose(H)
        res_pc = minimize(lambda t: energy(ansatz_pc(t[0]), H), x0=[0.0], method="BFGS")
        best = None
        for _ in range(4 if not quick else 1):
            r = minimize(lambda x: energy(ansatz_hea(x), H), rng.uniform(-math.pi, math.pi, 12), method="BFGS")
            if best is None or r.fun < best.fun:
                best = r
        rows.append({"R": float(R), "E_hf": e_hf, "E_fci": e_fci, "E_exact_diag_N2": e_ed, "E_nuc": e_nuc,
                     "jw_matches_fci": abs(e_ed - e_fci) < 1e-8,
                     "vqe_pc": {"E": float(res_pc.fun), "theta": float(res_pc.x[0]), "error": float(res_pc.fun - e_fci)},
                     "vqe_hea": {"E": float(best.fun), "error": float(best.fun - e_fci), "params": best.x.tolist()},
                     "pauli_terms": terms})
    # noise study at equilibrium geometry
    eq = min(rows, key=lambda r: abs(r["R"] - 0.74))
    H, *_ = hamiltonian(eq["R"])
    x_opt = np.array(eq["vqe_hea"]["params"])
    noise_rows = []
    for p2 in ([0, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2] if not quick else [0, 1e-3]):
        e = ansatz_hea_noisy(x_opt, H, p2 / 10, p2)
        noise_rows.append({"p2": p2, "p1": p2 / 10, "E": e, "error": e - eq["E_fci"], "chem_acc": abs(e - eq["E_fci"]) < CHEM_ACC})
    out = {"meta": C.metadata("chemistry", {"molecule": "H2", "basis": "STO-3G", "mapping": "Jordan–Wigner (4 qubits)",
                                            "optimizer": "BFGS (exact statevector)"}, seeds={"hea_init": 3}),
           "rows": rows, "noise": noise_rows, "chemical_accuracy_Ha": CHEM_ACC,
           "all_jw_match_fci": all(r["jw_matches_fci"] for r in rows), "runtime_s": time.time() - t0}
    C.save("chemistry", out)
    return out


if __name__ == "__main__":
    import sys

    r = run(quick="--quick" in sys.argv)
    print("JW==FCI:", r["all_jw_match_fci"])
    for row in r["rows"]:
        print(row["R"], round(row["E_fci"], 6), round(row["vqe_pc"]["error"], 9), round(row["vqe_hea"]["error"], 6), len(row["pauli_terms"]))
    print(r["noise"])
