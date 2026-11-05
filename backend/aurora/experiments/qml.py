"""Quantum AI laboratory experiments (all simulated, all with classical baselines).

A1  Variational quantum classifier (data re-uploading, 2 qubits) vs classical models
    (logistic regression, RBF-SVM, MLP) on two-moons and circles.
A2  Quantum-kernel SVM (ZZ feature-map fidelity kernel) vs RBF-SVM.
A3  Exponential kernel concentration: variance of off-diagonal fidelity-kernel values
    vs qubit count, with and without bandwidth scaling (reproduces the qualitative
    result of Thanasilp et al., Nat. Commun. 15, 5200 (2024)).
A4  Noise vs VQC accuracy: depolarising noise injected after every gate (density matrix).
A5  QAOA MaxCut vs brute force, greedy+local search and simulated annealing.

Gradients are exact parameter-shift gradients; optimiser is Adam. Wall-clock times are
measured on the build machine and are reported only to compare relative cost.
"""

from __future__ import annotations

import itertools
import math
import time

import networkx as nx
import numpy as np
from sklearn.datasets import make_circles, make_moons
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import MinMaxScaler
from sklearn.svm import SVC

from .. import qsim_np as Q
from . import common as C


# ------------------------------------------------------------------ datasets
def dataset(name: str, seed: int, n: int = 200):
    if name == "moons":
        X, y = make_moons(n, noise=0.15, random_state=seed)
    elif name == "circles":
        X, y = make_circles(n, noise=0.08, factor=0.45, random_state=seed)
    else:
        raise ValueError(name)
    X = MinMaxScaler((-1, 1)).fit_transform(X)
    return train_test_split(X, y, test_size=0.3, random_state=seed, stratify=y)


# ------------------------------------------------------------------ VQC model
N_Q = 2


def vqc_state(x: np.ndarray, theta: np.ndarray, layers: int) -> np.ndarray:
    """Data re-uploading circuit: per layer RY(pi x_i) RZ(pi x_j) encode, then trainable RY,RZ, CZ."""
    psi = Q.zero_state(N_Q)
    th = theta.reshape(layers, N_Q, 2)
    for l in range(layers):
        for q in range(N_Q):
            psi = Q.apply_1q(psi, Q.ry(math.pi * x[q % len(x)]), q, N_Q)
            psi = Q.apply_1q(psi, Q.rz(math.pi * x[(q + 1) % len(x)]), q, N_Q)
            psi = Q.apply_1q(psi, Q.ry(th[l, q, 0]), q, N_Q)
            psi = Q.apply_1q(psi, Q.rz(th[l, q, 1]), q, N_Q)
        psi = Q.apply_cz(psi, 0, 1, N_Q)
    return psi


def vqc_prob(x, theta, layers) -> float:
    """P(class 1) = (1 - <Z0 Z1>)/2  (parity readout)."""
    psi = vqc_state(x, theta, layers)
    idx = np.arange(2 ** N_Q)
    par = 1 - 2 * (((idx >> 0) ^ (idx >> 1)) & 1)
    zz = float(np.sum(par * np.abs(psi) ** 2))
    return (1 - zz) / 2


def train_vqc(Xtr, ytr, layers=3, epochs=40, lr=0.1, seed=0, batch=16):
    rng = np.random.default_rng(seed)
    theta = rng.normal(0, 0.5, layers * N_Q * 2)
    m = np.zeros_like(theta)
    v = np.zeros_like(theta)
    hist = []
    t0 = time.perf_counter()
    step = 0
    for ep in range(epochs):
        order = rng.permutation(len(Xtr))
        for start in range(0, len(Xtr), batch):
            idx = order[start:start + batch]
            grad = np.zeros_like(theta)
            for i in idx:
                p = vqc_prob(Xtr[i], theta, layers)
                p = min(max(p, 1e-6), 1 - 1e-6)
                dl_dp = (p - ytr[i]) / (p * (1 - p))  # binary cross-entropy
                for k in range(len(theta)):
                    sh = np.zeros_like(theta)
                    sh[k] = math.pi / 2
                    dp = 0.5 * (vqc_prob(Xtr[i], theta + sh, layers) - vqc_prob(Xtr[i], theta - sh, layers))
                    grad[k] += dl_dp * dp
            grad /= len(idx)
            step += 1
            m = 0.9 * m + 0.1 * grad
            v = 0.999 * v + 0.001 * grad ** 2
            theta -= lr * (m / (1 - 0.9 ** step)) / (np.sqrt(v / (1 - 0.999 ** step)) + 1e-8)
        preds = np.array([vqc_prob(x, theta, layers) for x in Xtr])
        loss = float(-np.mean(ytr * np.log(np.clip(preds, 1e-6, 1)) + (1 - ytr) * np.log(np.clip(1 - preds, 1e-6, 1))))
        acc = float(np.mean((preds > 0.5) == ytr))
        hist.append({"epoch": ep + 1, "loss": loss, "train_acc": acc})
    return theta, hist, time.perf_counter() - t0


def vqc_experiment(quick=False) -> dict:
    out = []
    seeds = (0, 1, 2) if not quick else (0,)
    for ds in ("moons", "circles"):
        for seed in seeds:
            Xtr, Xte, ytr, yte = dataset(ds, seed)
            layers = 3
            theta, hist, t_train = train_vqc(Xtr, ytr, layers=layers, epochs=30 if not quick else 3, seed=seed)
            t0 = time.perf_counter()
            pte = np.array([vqc_prob(x, theta, layers) for x in Xte])
            t_inf = time.perf_counter() - t0
            row = {"dataset": ds, "seed": seed, "models": {}}
            row["models"]["VQC (2 qubits, 3 layers)"] = {
                "test_acc": float(np.mean((pte > 0.5) == yte)), "train_time_s": t_train, "infer_time_s": t_inf,
                "params": int(theta.size), "history": hist,
                "circuit_evals_training": int(len(hist) * len(Xtr) * (1 + 2 * theta.size))}
            for name, model, params in (
                ("Logistic regression", LogisticRegression(), 3),
                ("RBF-SVM", SVC(kernel="rbf", gamma="scale"), None),
                ("MLP (16 hidden)", MLPClassifier((16,), max_iter=3000, random_state=seed), 2 * 16 + 16 + 16 + 1),
            ):
                t0 = time.perf_counter()
                model.fit(Xtr, ytr)
                tt = time.perf_counter() - t0
                t0 = time.perf_counter()
                acc = float(model.score(Xte, yte))
                ti = time.perf_counter() - t0
                if params is None:
                    params = int(model.support_vectors_.size + model.dual_coef_.size + 1)
                row["models"][name] = {"test_acc": acc, "train_time_s": tt, "infer_time_s": ti, "params": params}
            if seed == seeds[0]:
                # decision surface for the website (VQC)
                g = np.linspace(-1, 1, 25)
                row["vqc_surface"] = [[vqc_prob(np.array([a, b]), theta, layers) for a in g] for b in g]
                row["vqc_theta"] = theta.tolist()
                row["test_points"] = {"X": Xte.tolist(), "y": yte.tolist()}
            out.append(row)
    summary = {}
    for ds in ("moons", "circles"):
        rows = [r for r in out if r["dataset"] == ds]
        summary[ds] = {m: {"test_acc": C.mean_ci([r["models"][m]["test_acc"] for r in rows]),
                           "train_time_s": C.mean_ci([r["models"][m]["train_time_s"] for r in rows]),
                           "params": rows[0]["models"][m]["params"]} for m in rows[0]["models"]}
    return {"runs": out, "summary": summary}


# ------------------------------------------------------------- quantum kernels
def zz_feature_state(x: np.ndarray, reps: int = 2, scale: float = 1.0) -> np.ndarray:
    n = len(x)
    psi = Q.zero_state(n)
    xs = scale * x
    for _ in range(reps):
        for q in range(n):
            psi = Q.apply_1q(psi, Q.H, q, n)
            psi = Q.apply_1q(psi, Q.rz(2 * xs[q]), q, n)
        for a in range(n - 1):
            b = a + 1
            psi = Q.apply_rzz(psi, 2 * (math.pi - xs[a]) * (math.pi - xs[b]), a, b, n)
    return psi


def kernel_matrix(XA, XB, reps=2, scale=1.0):
    SA = np.array([zz_feature_state(x, reps, scale) for x in XA])
    SB = np.array([zz_feature_state(x, reps, scale) for x in XB])
    return np.abs(SA.conj() @ SB.T) ** 2


def kernel_experiment(quick=False) -> dict:
    rows = []
    for ds in ("moons", "circles"):
        for seed in ((0, 1, 2) if not quick else (0,)):
            Xtr, Xte, ytr, yte = dataset(ds, seed)
            Xtr2, Xte2 = (Xtr + 1) * math.pi / 2, (Xte + 1) * math.pi / 2
            t0 = time.perf_counter()
            Ktr = kernel_matrix(Xtr2, Xtr2)
            Kte = kernel_matrix(Xte2, Xtr2)
            svc = SVC(kernel="precomputed").fit(Ktr, ytr)
            tq = time.perf_counter() - t0
            accq = float(svc.score(Kte, yte))
            t0 = time.perf_counter()
            accc = float(SVC(kernel="rbf").fit(Xtr, ytr).score(Xte, yte))
            tc = time.perf_counter() - t0
            rows.append({"dataset": ds, "seed": seed, "quantum_kernel_acc": accq, "rbf_acc": accc,
                         "quantum_kernel_time_s": tq, "rbf_time_s": tc})
    return {"rows": rows}


def concentration_experiment(quick=False) -> dict:
    rng = np.random.default_rng(42)
    rows = []
    for n in (range(2, 13) if not quick else range(2, 7)):
        X = rng.uniform(0, 2 * math.pi, size=(40, n))
        for label, scale in (("unscaled ZZ map", 1.0), ("bandwidth-scaled (x/√n)", 1 / math.sqrt(n))):
            K = kernel_matrix(X, X, reps=2, scale=scale)
            off = K[np.triu_indices_from(K, 1)]
            rows.append({"n_qubits": n, "map": label, "mean": float(off.mean()), "var": float(off.var())})
    return {"rows": rows, "reference": "Thanasilp et al., Nat. Commun. 15, 5200 (2024)"}


# ----------------------------------------------------------------- noise vs VQC
def vqc_dm_prob(x, theta, layers, p1, p2) -> float:
    n = N_Q
    rho = np.zeros((4, 4), dtype=complex)
    rho[0, 0] = 1
    th = theta.reshape(layers, n, 2)
    for l in range(layers):
        for q in range(n):
            for U in (Q.ry(math.pi * x[q % 2]), Q.rz(math.pi * x[(q + 1) % 2]), Q.ry(th[l, q, 0]), Q.rz(th[l, q, 1])):
                rho = Q.dm_apply_1q(rho, U, q, n)
                rho = Q.dm_depolarize(rho, p1, [q], n)
        rho = Q.dm_apply_full(rho, Q.cz_matrix(0, 1, n))
        rho = Q.dm_depolarize(rho, p2, [0, 1], n)
    zz = float(np.real(rho[0, 0] - rho[1, 1] - rho[2, 2] + rho[3, 3]))
    return (1 - zz) / 2


def noise_experiment(quick=False) -> dict:
    Xtr, Xte, ytr, yte = dataset("moons", 0)
    theta, _, _ = train_vqc(Xtr, ytr, layers=3, epochs=30 if not quick else 3, seed=0)
    rows = []
    for p2 in ([0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3] if not quick else [0, 0.05, 0.3]):
        p1 = p2 / 10
        probs = np.array([vqc_dm_prob(x, theta, 3, p1, p2) for x in Xte])
        margin = float(np.mean(np.abs(probs - 0.5)))
        rows.append({"p2": p2, "p1": p1, "test_acc": float(np.mean((probs > 0.5) == yte)), "mean_margin": margin})
    return {"rows": rows, "note": "Model trained noise-free, evaluated under depolarising noise. Parity readout makes the "
                                  "decision threshold robust while margins shrink, so finite-shot estimation cost grows ~1/margin²."}


# ------------------------------------------------------------------ QAOA MaxCut
def cut_values(g: nx.Graph) -> np.ndarray:
    n = g.number_of_nodes()
    idx = np.arange(2 ** n)
    vals = np.zeros(2 ** n)
    for u, v in g.edges():
        vals += ((idx >> u) ^ (idx >> v)) & 1
    return vals


def qaoa_expect(params, g, cuts, p):
    n = g.number_of_nodes()
    gam, bet = params[:p], params[p:]
    psi = np.full(2 ** n, 1 / math.sqrt(2 ** n), dtype=complex)
    for k in range(p):
        psi = psi * np.exp(-1j * gam[k] * cuts)
        U = Q.rx(2 * bet[k])
        for q in range(n):
            psi = Q.apply_1q(psi, U, q, n)
    probs = np.abs(psi) ** 2
    return float(np.dot(probs, cuts)), probs


def greedy_local(g: nx.Graph, rng) -> int:
    n = g.number_of_nodes()
    s = rng.integers(0, 2, n)
    improved = True
    while improved:
        improved = False
        for v in range(n):
            gain = sum(1 if s[v] == s[u] else -1 for u in g.neighbors(v))
            if gain > 0:
                s[v] ^= 1
                improved = True
    return sum(1 for u, v in g.edges() if s[u] != s[v])


def annealing(g: nx.Graph, rng, steps=4000) -> int:
    n = g.number_of_nodes()
    s = rng.integers(0, 2, n)
    cur = sum(1 for u, v in g.edges() if s[u] != s[v])
    best = cur
    for t in range(steps):
        T = 2.0 * (1 - t / steps) + 1e-3
        v = int(rng.integers(n))
        delta = sum(1 if s[v] == s[u] else -1 for u in g.neighbors(v))
        if delta >= 0 or rng.random() < math.exp(delta / T):
            s[v] ^= 1
            cur += delta
            best = max(best, cur)
    return best


def qaoa_experiment(quick=False) -> dict:
    from scipy.optimize import minimize

    rows = []
    sizes = (8, 10, 12) if not quick else (8,)
    for n in sizes:
        for gs in (range(4) if not quick else range(1)):
            g = nx.random_regular_graph(3, n, seed=1000 + 10 * n + gs)
            cuts = cut_values(g)
            cmax = float(cuts.max())
            rng = np.random.default_rng(gs)
            entry = {"n": n, "graph_seed": 1000 + 10 * n + gs, "edges": [list(e) for e in g.edges()], "max_cut": cmax}
            for p in ((1, 2, 3) if not quick else (1,)):
                best = None
                t0 = time.perf_counter()
                for r in range(6):
                    x0 = np.concatenate([rng.uniform(0, math.pi, p), rng.uniform(0, math.pi / 2, p)])
                    res = minimize(lambda x: -qaoa_expect(x, g, cuts, p)[0], x0, method="COBYLA", options={"maxiter": 400})
                    if best is None or res.fun < best.fun:
                        best = res
                tq = time.perf_counter() - t0
                e, probs = qaoa_expect(best.x, g, cuts, p)
                entry[f"p{p}"] = {"approx_ratio": e / cmax, "p_optimal": float(probs[cuts == cmax].sum()),
                                  "params": best.x.tolist(), "time_s": tq}
            t0 = time.perf_counter()
            gl = [greedy_local(g, rng) for _ in range(20)]
            tg = time.perf_counter() - t0
            t0 = time.perf_counter()
            sa = [annealing(g, rng) for _ in range(5)]
            ts = time.perf_counter() - t0
            entry["random_assignment_ratio"] = (len(g.edges()) / 2) / cmax
            entry["greedy_local"] = {"mean_ratio": float(np.mean(gl)) / cmax, "best_ratio": max(gl) / cmax, "time_s": tg}
            entry["annealing"] = {"mean_ratio": float(np.mean(sa)) / cmax, "time_s": ts}
            rows.append(entry)
    return {"rows": rows, "note": "QAOA expectation evaluated exactly (statevector); hardware would need shots and suffer noise."}


def run(quick: bool = False) -> dict:
    t0 = time.time()
    out = {"meta": C.metadata("qml", {"quick": quick, "optimizer": "Adam (VQC), COBYLA (QAOA)", "gradient": "parameter shift"}),
           "vqc": vqc_experiment(quick), "kernel": kernel_experiment(quick),
           "concentration": concentration_experiment(quick), "noise": noise_experiment(quick),
           "qaoa": qaoa_experiment(quick)}
    out["runtime_s"] = time.time() - t0
    C.save("qml", out)
    return out


if __name__ == "__main__":
    import sys

    r = run(quick="--quick" in sys.argv)
    print({k: {m: round(v["test_acc"]["mean"], 3) for m, v in s.items()} for k, s in r["vqc"]["summary"].items()})
    print(r["noise"]["rows"])
    print(round(r["runtime_s"], 1))
