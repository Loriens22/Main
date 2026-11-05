"""AURORA-CRYO: analytical models linking the cooling/wiring architecture to qubit noise.

Every parameter carries a provenance tag:
  "src:<ledger id>"  measured/published value (research/sources.md, sections 10-14)
  "std"              standard physics result (formula), not a device number
  "assume"           design assumption of this study (order-of-magnitude, to be replaced by data)

Chain:  stage temperatures + attenuation + thermalisation  ->  thermal photons in the readout
resonator  ->  photon-shot dephasing (Clerk-Utami)  +  quasiparticle T1 (Catelani)  +  dielectric
T1  ->  T1, T2  ->  per-operation Pauli error rates  ->  circuit noise for the QEC simulator.
Separately: per-stage heat load vs qubit count for three wiring architectures, and the
radiation-burst failure rate of a multi-module machine.
"""

from __future__ import annotations

import json
import math
import pathlib

H = 6.62607015e-34
KB = 1.380649e-23
HBAR = H / (2 * math.pi)
EV = 1.602176634e-19


def n_bose(f_hz: float, t_k: float) -> float:
    if t_k <= 0:
        return 0.0
    x = H * f_hz / (KB * t_k)
    return 0.0 if x > 700 else 1.0 / math.expm1(x)


def p_excited(f_hz: float, t_k: float) -> float:
    """Two-level thermal excited population."""
    x = H * f_hz / (KB * t_k)
    return 1.0 / (1.0 + math.exp(min(x, 700)))


# --------------------------------------------------------------------------- photon chain
def photon_chain(f_hz: float, stages: list[dict], n_source: float | None = None) -> list[dict]:
    """Propagate thermal photon occupation through attenuators.

    stages: [{"name", "T": physical K, "T_eff": effective noise temperature K, "dB": attenuation}]
    n_out = n_in / A + (1 - 1/A) * n(T_eff)  per stage (beam-splitter model).
    """
    n = n_bose(f_hz, 300.0) if n_source is None else n_source
    out = [{"name": "300 K source", "n": n}]
    for s in stages:
        A = 10 ** (s["dB"] / 10)
        n = n / A + (1 - 1 / A) * n_bose(f_hz, s.get("T_eff", s["T"]))
        out.append({"name": s["name"], "n": n, "dB": s["dB"], "T_eff": s.get("T_eff", s["T"])})
    return out


def dephasing_rate(n_th: float, kappa: float, chi: float) -> float:
    """Clerk & Utami low-occupation thermal-photon dephasing (rad/s inputs). 2*chi = dispersive shift."""
    return n_th * kappa * 4 * chi ** 2 / (kappa ** 2 + 4 * chi ** 2)


def gamma_qp(x_qp: float, f_q: float, delta_ev: float = 180e-6) -> float:
    """Catelani et al.: quasiparticle relaxation rate Gamma = x_qp sqrt(2 w Delta / (pi^2 hbar))."""
    w = 2 * math.pi * f_q
    return x_qp * math.sqrt(2 * w * delta_ev * EV / (math.pi ** 2 * HBAR))


# --------------------------------------------------------------------------- architectures
ARCH = {
    "conventional": {
        "label": "Conventional (coax + room-temperature electronics)",
        "readout_f": 7.0e9, "qubit_f": 4.5e9,
        "chain": [
            {"name": "4 K", "T": 4.0, "T_eff": 4.0, "dB": 20},
            {"name": "Still 0.8 K", "T": 0.8, "T_eff": 0.8, "dB": 10},
            {"name": "Cold plate 100 mK", "T": 0.1, "T_eff": 0.1, "dB": 20},
            {"name": "MXC 10 mK", "T": 0.01, "T_eff": 0.045, "dB": 20},   # hot-electron attenuator (assume)
        ],
        "out_line_n": 2e-5,          # HEMT leakage through two isolators (assume)
        "T_eff_qubit": 0.050,        # residual qubit temperature (assume; typical 40-60 mK)
        "x_qp": 3e-8,                # quasiparticle density (assume)
        "T1_dielectric": 500e-6,     # Ta-on-Si mature-fab median (assume; best 1.68 ms src:Bland2025)
        "T1_purcell": 5e-3,          # Purcell-filtered (assume)
        "Tphi_other": 2e-3,          # flux/TLS dephasing floor (assume)
        "p2_control": 5e-4,          # calibration/leakage/crosstalk part of CZ error (assume)
        "p_sep": 2e-3,               # readout separation error with paramp (assume)
        "p_reset": 5e-3,             # multi-level reset < 5e-3 (src:McEwen2021)
        "t_2q": 60e-9, "t_layer": 80e-9, "t_meas": 500e-9, "t_reset": 250e-9,
    },
    "aurora": {
        "label": "AURORA-CRYO",
        "readout_f": 7.0e9, "qubit_f": 4.5e9,
        "chain": [
            {"name": "4 K (cryo-CMOS output)", "T": 4.0, "T_eff": 4.0, "dB": 20},
            {"name": "Still 0.8 K", "T": 0.8, "T_eff": 0.8, "dB": 10},
            {"name": "Cold plate 100 mK", "T": 0.1, "T_eff": 0.1, "dB": 20},
            {"name": "MXC cavity attenuator", "T": 0.01, "T_eff": 0.033, "dB": 30},  # src:Wang2019 (n<=2e-4)
        ],
        "out_line_n": 1e-5,
        "n_floor": 2e-4,             # design value = measured upper bound (src:Wang2019); conservative
        "T_eff_qubit": 0.035,        # IR-tight shields, filtered lines (assume)
        "x_qp": 3e-9,                # gap engineering + phonon traps (assume; src:McEwen2024 qualitative)
        "T1_dielectric": 500e-6,
        "T1_purcell": 5e-3,
        "Tphi_other": 2e-3,
        "p2_control": 6e-4,          # +1e-4 penalty for 4 K cryo-CMOS spurs/phase noise (assume)
        "p_sep": 2e-3,
        "p_reset": 2e-3,             # 0.2 % residual excitation (src:Magnard2018)
        "t_2q": 60e-9, "t_layer": 80e-9, "t_meas": 500e-9, "t_reset": 100e-9,  # QCR-assisted reset (assume)
    },
}
KAPPA = 2 * math.pi * 2.0e6    # readout resonator linewidth (assume)
CHI = 2 * math.pi * 1.0e6      # half dispersive shift, 2chi = kappa (assume)


def coherence_budget(a: dict) -> dict:
    chain = photon_chain(a["readout_f"], a["chain"])
    n_line = chain[-1]["n"] + a["out_line_n"]
    n_res = max(n_line, a.get("n_floor", 0.0))
    g_phi_th = dephasing_rate(n_res, KAPPA, CHI)
    g_qp = gamma_qp(a["x_qp"], a["qubit_f"])
    g1 = 1 / a["T1_dielectric"] + g_qp + 1 / a["T1_purcell"]
    T1 = 1 / g1
    g_phi = g_phi_th + 1 / a["Tphi_other"]
    T2 = 1 / (1 / (2 * T1) + g_phi)

    def pauli(t):  # total Pauli error of an idle qubit for time t (twirled amplitude + phase damping)
        return t / (4 * T1) + t / (2 * T2)

    noise = {
        "p2": a["p2_control"] + 2 * pauli(a["t_2q"]),
        "p1": pauli(a["t_layer"]),
        "p_idle": pauli(a["t_layer"]),
        "p_idle_meas": pauli(a["t_meas"] + a["t_reset"]),
        "p_meas": a["p_sep"] + a["t_meas"] / (2 * T1),
        "p_reset": a["p_reset"],
        "f_herald": 0.0,
    }
    return {
        "label": a["label"], "chain": chain, "n_readout": n_res, "n_line_model": n_line,
        "Gamma_phi_thermal": g_phi_th, "Tphi_thermal": 1 / g_phi_th if g_phi_th else float("inf"),
        "Gamma_qp": g_qp, "T1_qp": 1 / g_qp, "T1": T1, "T2": T2,
        "P_excited_thermal": p_excited(a["qubit_f"], a["T_eff_qubit"]),
        "cycle_time_simulated": 12 * a["t_layer"] + 2 * (a["t_meas"] + a["t_reset"]),   # our 2-phase schedule
        "cycle_time_interleaved": 8 * a["t_layer"] + a["t_meas"] + a["t_reset"],        # depth-7(+1) interleaved cycle
        "noise": noise,
    }


# --------------------------------------------------------------------------- heat loads
# Capacities of a KIDE-class three-unit platform (src:Bluefors KIDE; 4 K/50 K: src:arXiv:2608.00990 model)
CAPACITY = {"50 K": 90.0, "4 K": 6.0, "Still": 0.09, "Cold plate": 3.0e-3, "MXC": 90e-6}
MARGIN = 0.5  # use at most half of each stage (assume)
LINE_CAPACITY = 4000  # RF lines through a KIDE (src)

WIRING = {
    # per-line passive loads (W) by stage; MXC stainless value src:Lecocq2021 (14 nW); others assume
    "coax_ss": {"50 K": 2e-3, "4 K": 5e-4, "Still": 3e-6, "Cold plate": 3e-7, "MXC": 14e-9},
    "coax_nbti": {"50 K": 2e-3, "4 K": 5e-4, "Still": 1e-6, "Cold plate": 6e-8, "MXC": 3e-9},
    "flex": {"50 K": 4e-4, "4 K": 1e-4, "Still": 2e-7, "Cold plate": 1.5e-8, "MXC": 1e-9},
}
SYSTEMS = {
    "conventional": {
        "label": "Coax + room-temperature control",
        "lines": [("coax_ss", 1.0), ("coax_nbti", 3.0), ("coax_ss", 0.25)],   # drive, 3 coupler flux, readout in/out per 8
        "line_slots_per_qubit": 4.25, "density": 1.0,
        "active": {"MXC": 1.5e-9, "Cold plate": 2e-8, "4 K": 2e-3},        # attenuators, HEMTs (assume)
        "cmos_4k": 0.0,
    },
    "flex": {
        "label": "Superconducting flex + room-temperature control",
        "lines": [("flex", 4.25)],
        "line_slots_per_qubit": 4.25, "density": 10.0,                     # src:Paluch2024 (order of magnitude)
        "active": {"MXC": 1.5e-9, "Cold plate": 2e-8, "4 K": 2e-3},
        "cmos_4k": 0.0,
    },
    "aurora": {
        "label": "AURORA-CRYO (4 K cryo-CMOS + flex + photonic drive)",
        "lines": [("flex", 3.0), ("flex", 0.25)],                          # coupler flux, readout; drive on fibre
        "line_slots_per_qubit": 3.25, "density": 10.0,
        "active": {"MXC": 2.0e-9, "Cold plate": 1e-8, "4 K": 2e-4},        # photodiode dissipation (assume)
        "cmos_4k": 1.0e-3,                                                  # W/qubit target (src: 0.9 mW model; 2 mW measured)
    },
}


def stage_loads(system: str, n_qubits: int, cmos_w: float | None = None) -> dict:
    s = SYSTEMS[system]
    loads = {k: 0.0 for k in CAPACITY}
    for kind, per_q in s["lines"]:
        for st, w in WIRING[kind].items():
            loads[st] += w * per_q * n_qubits
    for st, w in s["active"].items():
        loads[st] += w * n_qubits
    loads["4 K"] += (s["cmos_4k"] if cmos_w is None else cmos_w) * n_qubits
    return loads


def max_qubits(system: str, cmos_w: float | None = None, extra_4k_w: float = 0.0) -> dict:
    s = SYSTEMS[system]
    per = stage_loads(system, 1, cmos_w)
    lim = {}
    for st, cap in CAPACITY.items():
        c = (cap + (extra_4k_w if st == "4 K" else 0.0)) * MARGIN
        lim[st] = int(c / per[st]) if per[st] > 0 else 10 ** 9
    lim["Line count"] = int(LINE_CAPACITY * s["density"] / s["line_slots_per_qubit"])
    stage = min(lim, key=lim.get)
    return {"system": system, "label": s["label"], "limits": lim, "max_qubits": lim[stage], "limiting": stage,
            "per_qubit_W": per}


# --------------------------------------------------------------------------- radiation bursts
RAD = {
    "flux_per_cm2_s": 0.1,      # impacts (muons + gammas) per cm^2 per s at sea level (assume; src: "every few seconds" per chip)
    "burst_duration_s": 25e-3,  # recovery time of a QP burst (assume, order of magnitude)
}


def burst_mtbf(n_dies: int, die_area_cm2: float, p_fail: float, rate_factor: float = 1.0) -> float:
    """Mean time between radiation-induced logical failures of a machine (s)."""
    r = RAD["flux_per_cm2_s"] * die_area_cm2 * n_dies * rate_factor * p_fail
    return float("inf") if r == 0 else 1.0 / r


RAD_SCENARIOS = {
    "conventional": {"label": "Ungapped Al junctions, surface lab", "p_fail": 1.0, "rate_factor": 1.0},
    "gap": {"label": "Strong gap engineering + phonon traps", "p_fail": 1e-3, "rate_factor": 1.0},
    "gap_underground": {"label": "Gap engineering + underground, Pb-shielded", "p_fail": 1e-3, "rate_factor": 1 / 50},
}


# --------------------------------------------------------------------------- QEC tasks
def qec_budget_tasks() -> list[dict]:
    t = []
    conv = coherence_budget(ARCH["conventional"])["noise"]
    aur = coherence_budget(ARCH["aurora"])["noise"]
    plan = {"gross144": (6, (1.0, 2.0, 3.0)), "bb72": (6, (1.0, 1.5, 2.0, 3.0)),
            "surface_d7": (7, (1.0, 2.0, 3.0)), "surface_d9": (9, (1.0, 2.0, 3.0))}
    for code, (r, scales) in plan.items():
        t.append({"set": "cryo", "code": code, "rounds": r, "label": "conventional", "s": 1.0, "noise": conv,
                  "max_seconds": 900})
        for s in scales:
            ns = {k: (min(v * s, 0.3) if k != "f_herald" else v) for k, v in aur.items()}
            t.append({"set": "cryo", "code": code, "rounds": r, "label": f"aurora_x{s}", "s": s, "noise": ns,
                      "max_seconds": 900})
    t.sort(key=lambda x: (x["code"] != "gross144", x["s"]))
    return t


def report() -> dict:
    out = {"architectures": {k: coherence_budget(v) for k, v in ARCH.items()},
           "heat": {k: max_qubits(k) for k in SYSTEMS},
           "heat_cmos_sweep": [{"cmos_mW": w * 1e3, **{k: max_qubits("aurora", cmos_w=w, extra_4k_w=e)["max_qubits"]
                                                         for k, e in (("base", 0.0), ("plus12W", 12.0))}}
                               for w in (0.25e-3, 0.5e-3, 1e-3, 2e-3, 5e-3, 10e-3, 23e-3)],
           "heat_curves": {k: [{"n": n, **stage_loads(k, n)} for n in (100, 300, 1000, 3000, 10000)] for k in SYSTEMS},
           "params": {"ARCH": ARCH, "CAPACITY": CAPACITY, "MARGIN": MARGIN, "LINE_CAPACITY": LINE_CAPACITY,
                      "WIRING": WIRING, "SYSTEMS": SYSTEMS, "RAD": RAD, "RAD_SCENARIOS": RAD_SCENARIOS,
                      "KAPPA_2pi_MHz": KAPPA / 2 / math.pi / 1e6, "CHI_2pi_MHz": CHI / 2 / math.pi / 1e6}}
    return out


if __name__ == "__main__":
    r = report()
    for k, v in r["architectures"].items():
        print(k, "n=%.2e T1=%.0fus T2=%.0fus Tphi_th=%.0fus T1qp=%.1fms Pe=%.2e cycle=%.2fus" % (
            v["n_readout"], v["T1"] * 1e6, v["T2"] * 1e6, v["Tphi_thermal"] * 1e6, v["T1_qp"] * 1e3,
            v["P_excited_thermal"], v["cycle_time_interleaved"] * 1e6), {a: "%.2e" % b for a, b in v["noise"].items()})
    for k, v in r["heat"].items():
        print(k, v["max_qubits"], v["limiting"], v["limits"])
    print(r["heat_cmos_sweep"])
    pathlib.Path(__file__).resolve().parents[2].joinpath("results", "q2_cryo_models.json").write_text(json.dumps(r, indent=1, default=str))
