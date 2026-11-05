"""Circuit-level memory experiments for any CSS code, decoded with BP-OSD.

One generic construction is used for every code (BB and surface), so comparisons share the
same circuit family, noise model and decoder:

* each round has a Z phase (reset Z ancillas -> Z-check CNOT layers -> measure) followed by an
  X phase (prepare X ancillas in |+> -> X-check CNOT layers -> measure in X);
* BB codes use the exact 6 + 6 "one layer per polynomial term" schedule (each layer is a
  perfect matching); other codes use a greedy proper edge colouring;
* noise (SD6-like): DEPOLARIZE2(p2) after CNOTs, DEPOLARIZE1(p_idle) on idle qubits in each CNOT
  layer, flip before measurement (p_meas) and after reset (p_reset), idle error on data while
  ancillas are measured/reset (p_idle_meas);
* optional heralded erasures: a fraction f_h of each CNOT's error budget becomes
  HERALDED_ERASE on both qubits (heralded location, maximally mixed qubit). Herald records are
  detectors in the DEM only to identify which mechanisms they enable; the decoder sees Z-check
  detectors with per-shot priors (herald fired -> prior 0.49, else 0).

Memory-Z: data start in |0>, X errors are decoded from Z-check detectors, observables are the
k logical Z operators. Our 12-layer sequential schedule is deeper than IBM's depth-7
interleaved cycle for the gross code, so absolute BB numbers are conservative.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp
import stim

from .bposd import BpOsdDecoder
from .codes import CSSCode


@dataclass
class Noise:
    p2: float = 1e-3
    p1: float = 1e-4
    p_idle: float = 1e-4        # per CNOT layer on idle qubits
    p_idle_meas: float = 1e-3   # on data while ancillas are measured + reset
    p_meas: float = 1e-3
    p_reset: float = 1e-3
    f_herald: float = 0.0       # fraction of CNOT error converted to heralded erasure

    @classmethod
    def uniform(cls, p: float, f_herald: float = 0.0) -> "Noise":
        return cls(p2=p, p1=p, p_idle=p, p_idle_meas=p, p_meas=p, p_reset=p, f_herald=f_herald)


def color_edges(edges: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """Greedy proper edge colouring (each qubit in at most one CNOT per layer)."""
    used: dict[int, set[int]] = {}
    layers: list[list[tuple[int, int]]] = []
    # deterministic order: by check then data index — gives regular patterns on BB codes
    for a, b in sorted(edges):
        c = 0
        while c in used.get(a, set()) or c in used.get(b, set()):
            c += 1
        used.setdefault(a, set()).add(c)
        used.setdefault(b, set()).add(c)
        while len(layers) <= c:
            layers.append([])
        layers[c].append((a, b))
    return layers


def bb_layers(code: CSSCode, zanc: list[int], xanc: list[int]):
    """Exact 6+6 colouring for bivariate bicycle codes: one layer per polynomial term."""
    l, m = code.meta["l"], code.meta["m"]
    lm = l * m
    gi = lambda i, j: (i % l) * m + (j % m)
    z_layers, x_layers = [], []
    for (bi, bj) in code.meta["B"]:          # Z(g) - L(g - b)
        z_layers.append([(zanc[gi(i, j)], gi(i - bi, j - bj)) for i in range(l) for j in range(m)])
    for (ai, aj) in code.meta["A"]:          # Z(g) - R(g - a)
        z_layers.append([(zanc[gi(i, j)], lm + gi(i - ai, j - aj)) for i in range(l) for j in range(m)])
    for (ai, aj) in code.meta["A"]:          # X(g) - L(g + a)
        x_layers.append([(xanc[gi(i, j)], gi(i + ai, j + aj)) for i in range(l) for j in range(m)])
    for (bi, bj) in code.meta["B"]:          # X(g) - R(g + b)
        x_layers.append([(xanc[gi(i, j)], lm + gi(i + bi, j + bj)) for i in range(l) for j in range(m)])
    return z_layers, x_layers


def build_memory_circuit(code: CSSCode, rounds: int, noise: Noise) -> tuple[stim.Circuit, dict]:
    n = code.n
    mz, mx = code.HZ.shape[0], code.HX.shape[0]
    Lz = code.logicals[1]
    data = list(range(n))
    zanc = list(range(n, n + mz))
    xanc = list(range(n + mz, n + mz + mx))
    allq = data + zanc + xanc
    if code.meta.get("family") == "bivariate bicycle":
        z_layers, x_layers = bb_layers(code, zanc, xanc)
        # sanity: the term colouring must reproduce the parity-check matrices exactly
        for layers, Hm, anc in ((z_layers, code.HZ, zanc), (x_layers, code.HX, xanc)):
            M = np.zeros_like(Hm)
            for layer in layers:
                for a, d in layer:
                    M[a - anc[0], d] ^= 1
            assert (M == Hm).all(), "BB layer colouring does not match H"
    else:
        z_layers = color_edges([(zanc[i], j) for i in range(mz) for j in np.nonzero(code.HZ[i])[0]])
        x_layers = color_edges([(xanc[i], j) for i in range(mx) for j in np.nonzero(code.HX[i])[0]])
    c = stim.Circuit()
    c.append("R", allq)
    n_herald = 0
    nmeas = [0]                      # absolute measurement-record counter
    rec = lambda a: stim.target_rec(a - nmeas[0])
    last_z = [None] * mz

    def cnot_layer(pairs, z_type: bool, active: list[int]):
        nonlocal n_herald
        targets = []
        for anc, d in pairs:
            targets += ([d, anc] if z_type else [anc, d])
        c.append("CX", targets)
        busy = {q for p in pairs for q in p}
        ph = noise.p2 * noise.f_herald
        pd = noise.p2 * (1 - noise.f_herald)
        if pd > 0:
            c.append("DEPOLARIZE2", targets, pd)
        if ph > 0:
            flat = [q for p in pairs for q in p]
            c.append("HERALDED_ERASE", flat, ph / 2)
            nmeas[0] += len(flat)
            for k in range(len(flat)):
                c.append("DETECTOR", [stim.target_rec(-(len(flat) - k))], [0, 0, 1])
            n_herald += len(flat)
        idle = [q for q in active if q not in busy]
        if noise.p_idle > 0 and idle:
            c.append("DEPOLARIZE1", idle, noise.p_idle)

    for r in range(rounds):
        # ---- Z phase: prepare, entangle, measure Z ancillas
        if r > 0:
            c.append("R", zanc)
        if noise.p_reset > 0:
            c.append("X_ERROR", zanc, noise.p_reset)
        for layer in z_layers:
            cnot_layer(layer, True, data + zanc)
        if noise.p_meas > 0:
            c.append("X_ERROR", zanc, noise.p_meas)
        c.append("M", zanc)
        base_idx = nmeas[0]
        nmeas[0] += mz
        if noise.p_idle_meas > 0:
            c.append("DEPOLARIZE1", data, noise.p_idle_meas)
        for i in range(mz):
            cur = rec(base_idx + i)
            if last_z[i] is None:
                c.append("DETECTOR", [cur], [i, r, 0])
            else:
                c.append("DETECTOR", [cur, rec(last_z[i])], [i, r, 0])
            last_z[i] = base_idx + i
        # ---- X phase: prepare |+>, entangle, measure in X basis
        c.append("RX", xanc)
        if noise.p_reset > 0:
            c.append("Z_ERROR", xanc, noise.p_reset)
        for layer in x_layers:
            cnot_layer(layer, False, data + xanc)
        if noise.p_meas > 0:
            c.append("Z_ERROR", xanc, noise.p_meas)
        c.append("MX", xanc)
        nmeas[0] += mx
        if noise.p_idle_meas > 0:
            c.append("DEPOLARIZE1", data, noise.p_idle_meas)
        c.append("TICK")
    if noise.p_meas > 0:
        c.append("X_ERROR", data, noise.p_meas)
    c.append("M", data)
    d0 = nmeas[0]
    nmeas[0] += n
    for i in range(mz):
        recs = [rec(d0 + j) for j in np.nonzero(code.HZ[i])[0]]
        recs.append(rec(last_z[i]))  # last Z-ancilla record of the final round
        c.append("DETECTOR", recs, [i, rounds, 0])
    for k in range(Lz.shape[0]):
        c.append("OBSERVABLE_INCLUDE", [rec(d0 + j) for j in np.nonzero(Lz[k])[0]], k)
    info = {"cnot_layers_per_round": len(z_layers) + len(x_layers), "z_layers": len(z_layers), "x_layers": len(x_layers),
            "qubits": len(allq), "rounds": rounds, "heralds": n_herald}
    return c, info


def dem_matrices(circuit: stim.Circuit):
    """Split the DEM into (H over Z-check detectors, observable matrix, priors, herald matrix)."""
    dem = circuit.detector_error_model(decompose_errors=False, approximate_disjoint_errors=True)
    coords = circuit.get_detector_coordinates()
    is_herald = np.array([coords.get(i, [0, 0, 0])[-1] == 1 for i in range(circuit.num_detectors)])
    syn_idx = np.nonzero(~is_herald)[0]
    her_idx = np.nonzero(is_herald)[0]
    syn_pos = {d: i for i, d in enumerate(syn_idx)}
    her_pos = {d: i for i, d in enumerate(her_idx)}
    rows_s, cols_s, rows_o, cols_o, rows_h, cols_h, priors = [], [], [], [], [], [], []
    col = 0
    for inst in dem.flattened():
        if inst.type != "error":
            continue
        p = inst.args_copy()[0]
        dets, obs = [], []
        for t in inst.targets_copy():
            if t.is_relative_detector_id():
                dets.append(t.val)
            elif t.is_logical_observable_id():
                obs.append(t.val)
        s = [syn_pos[d] for d in dets if d in syn_pos]
        h = [her_pos[d] for d in dets if d in her_pos]
        if not s and not obs:
            continue  # herald-only (identity / Z part): invisible to memory-Z decoding
        rows_s += s; cols_s += [col] * len(s)
        rows_o += obs; cols_o += [col] * len(obs)
        rows_h += h; cols_h += [col] * len(h)
        priors.append(p)
        col += 1
    H = sp.csc_matrix((np.ones(len(rows_s), np.uint8), (rows_s, cols_s)), shape=(len(syn_idx), col))
    O = sp.csc_matrix((np.ones(len(rows_o), np.uint8), (rows_o, cols_o)), shape=(circuit.num_observables, col))
    Hh = sp.csc_matrix((np.ones(len(rows_h), np.uint8), (rows_h, cols_h)), shape=(len(her_idx), col))
    return H, O, np.array(priors), Hh, syn_idx, her_idx


def run_memory(code: CSSCode, rounds: int, noise: Noise, shots: int, seed: int = 0,
               max_errors: int = 200, max_seconds: float = 240.0, osd_order: int = 7) -> dict:
    t0 = time.time()
    circ, info = build_memory_circuit(code, rounds, noise)
    H, O, priors, Hh, syn_idx, her_idx = dem_matrices(circ)
    heralded_cols = np.asarray(Hh.sum(axis=0)).ravel() > 0
    base = priors.copy()
    base[heralded_cols] = 0.0
    dec = BpOsdDecoder(H.tocsr(), channel_probs=list(np.clip(np.where(heralded_cols, 1e-12, priors), 1e-12, 0.49)),
                       max_iter=100, bp_method="minimum_sum", ms_scaling_factor=0.625,
                       osd_method="osd_cs", osd_order=osd_order)
    base_clip = np.clip(np.where(heralded_cols, 1e-12, priors), 1e-12, 0.49)
    dirty = False
    sampler = circ.compile_detector_sampler(seed=seed)
    errors = done = 0
    Hh_csr = Hh.tocsr()
    O_csr = O.tocsr()
    batch = 256
    while done < shots and errors < max_errors and time.time() - t0 < max_seconds:
        dets, obs = sampler.sample(batch, separate_observables=True)
        for s in range(batch):
            syn = dets[s, syn_idx].astype(np.uint8)
            if len(her_idx):
                fired = np.nonzero(dets[s, her_idx])[0]
                if len(fired):
                    cols = np.unique(Hh_csr[fired].indices)
                    pr = base_clip.copy()
                    # mechanisms enabled by a fired herald: the X/Y part of a maximally mixed qubit
                    pr[cols] = 0.49
                    dec.update_channel_probs(pr)
                    corr = dec.decode(syn)
                    dirty = True
                else:
                    if dirty:
                        dec.update_channel_probs(base_clip)
                        dirty = False
                    corr = dec.decode(syn) if syn.any() else np.zeros(H.shape[1], np.uint8)
            else:
                corr = dec.decode(syn) if syn.any() else np.zeros(H.shape[1], np.uint8)
            pred = (O_csr @ corr) % 2
            if np.any(pred != obs[s]):
                errors += 1
            done += 1
            if done >= shots or errors >= max_errors:
                break
    rate = errors / max(done, 1)
    z = 1.96
    den = 1 + z * z / done
    ctr = (rate + z * z / (2 * done)) / den
    hw = z * math.sqrt(rate * (1 - rate) / done + z * z / (4 * done * done)) / den
    k = O.shape[0]
    per_round = 1 - (1 - min(rate, 0.999)) ** (1 / rounds)
    return {"code": code.name, "n": code.n, "k": int(k), "d": code.distance, "rounds": rounds,
            "noise": noise.__dict__, "shots": done, "errors": errors, "block_error": rate,
            "lo": max(0.0, ctr - hw), "hi": min(1.0, ctr + hw),
            "block_error_per_round": per_round,
            "per_logical_qubit_per_round": 1 - (1 - per_round) ** (1 / k),
            "dem_columns": int(H.shape[1]), "dem_detectors": int(H.shape[0]),
            "seconds": time.time() - t0, **info}
