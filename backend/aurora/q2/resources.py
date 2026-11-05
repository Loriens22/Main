"""Analysis of the AURORA-Q2 QEC runs: fits, equal-error overhead, erasure trade-off, cryo budgets,
fridge-level projections. Writes results/q2_resources.json.

Every derived quantity records whether it is *measured* (directly simulated) or *extrapolated*
(fit outside the simulated range).
"""

from __future__ import annotations

import json
import math
import pathlib

import numpy as np

from .cryo import RAD, RAD_SCENARIOS, burst_mtbf, coherence_budget, max_qubits, ARCH

RES = pathlib.Path(__file__).resolve().parents[2] / "results"
QUBITS_PER_LOGICAL = {"gross144": 288 / 12, "bb72": 144 / 12, "bb288": 576 / 12}


def surf_q(d):
    return 2 * d * d - 1


def load(name):
    p = RES / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else []


def ler(r):
    return r["per_logical_qubit_per_round"]


def ler_ci(r):
    k, rounds = r["k"], r["rounds"]
    f = lambda b: 1 - (1 - (1 - (1 - min(b, 0.999)) ** (1 / rounds))) ** (1 / k)
    return f(r["lo"]), f(r["hi"])


def surface_fit(mem):
    """Per p: fit log LER = a + b d over d = 5..9 (d=3 is outside the asymptotic regime)."""
    out = {}
    for p in sorted({r["p"] for r in mem if r["code"].startswith("surface")}):
        pts = sorted((int(r["code"].split("_d")[1]), ler(r)) for r in mem if r["code"].startswith("surface") and r["p"] == p and r["errors"] > 0)
        pts = [x for x in pts if x[0] >= 5]
        if len(pts) < 2:
            continue
        d, y = np.array([x[0] for x in pts]), np.log([x[1] for x in pts])
        b, a = np.polyfit(d, y, 1)
        out[p] = {"a": float(a), "b": float(b), "Lambda": float(math.exp(-2 * b)), "points": pts}
    return out


def d_needed(fit, target):
    """Smallest odd d with fitted LER <= target (None if the code is above threshold)."""
    if fit["b"] >= 0:
        return None
    d = (math.log(target) - fit["a"]) / fit["b"]
    d = max(3, math.ceil(d))
    return d if d % 2 else d + 1


def power_fit(rows):
    rows = sorted(rows, key=lambda r: r["p"])
    x, y = np.log([r["p"] for r in rows]), np.log([ler(r) for r in rows])
    b, a = np.polyfit(x, y, 1)
    return {"a": float(a), "b": float(b), "range": [rows[0]["p"], rows[-1]["p"]]}


def main():
    qec = load("q2_qec")
    mem = [r for r in qec if r.get("set") == "memory"]
    era = [r for r in qec if r.get("set") == "erasure"] + [r for r in mem if r["code"] in ("bb72", "gross144")]
    out = {"note": "measured = simulated directly; extrapolated = fitted model outside the simulated range"}

    # ---------------------------------------------------------------- memory curves
    curves = {}
    for r in mem:
        lo, hi = ler_ci(r)
        curves.setdefault(r["code"], []).append({"p": r["p"], "ler": ler(r), "lo": lo, "hi": hi, "shots": r["shots"], "errors": r["errors"], "rounds": r["rounds"]})
    for v in curves.values():
        v.sort(key=lambda x: x["p"])
    out["memory_curves"] = curves

    # ---------------------------------------------------------------- equal-error overhead
    sf = surface_fit(mem)
    out["surface_fit"] = {str(k): v for k, v in sf.items()}
    eq = []
    for code in ("gross144", "bb72"):
        for r in sorted((x for x in mem if x["code"] == code), key=lambda x: x["p"]):
            if r["p"] not in sf or r["errors"] == 0 or sf[r["p"]]["Lambda"] < 1.3:
                continue  # surface code at/above threshold here: no meaningful equal-error distance
            d = d_needed(sf[r["p"]], ler(r))
            measured_d = [dd for dd, y in sf[r["p"]]["points"] if y <= ler(r)]
            eq.append({"code": code, "p": r["p"], "ler": ler(r), "surface_d_needed": d,
                       "surface_d_measured_better": min(measured_d) if measured_d else None,
                       "q_per_logical_bb": QUBITS_PER_LOGICAL[code],
                       "q_per_logical_surface": surf_q(d) if d else None,
                       "advantage": surf_q(d) / QUBITS_PER_LOGICAL[code] if d else None,
                       "kind": "measured" if measured_d else "extrapolated (surface fit)"})
    out["equal_error"] = eq

    # BB power-law fits and the 1e-3 projection
    proj = {}
    for code in ("gross144", "bb72"):
        rows = [x for x in mem if x["code"] == code and x["errors"] >= 20 and x["p"] <= 0.004]
        if len(rows) >= 2:
            f = power_fit(rows)
            f["ler_at_1e-3"] = float(math.exp(f["a"]) * 1e-3 ** f["b"])
            f["kind"] = "extrapolated"
            proj[code] = f
    if 0.002 in sf:
        pass
    out["bb_power_fit"] = proj

    # ---------------------------------------------------------------- erasure trade study
    er = {}
    for r in era:
        lo, hi = ler_ci(r)
        er.setdefault(f'{r["code"]}|{r["f"]}', []).append({"p": r["p"], "ler": ler(r), "lo": lo, "hi": hi, "errors": r["errors"], "shots": r["shots"]})
    for v in er.values():
        v.sort(key=lambda x: x["p"])
    out["erasure_curves"] = er
    # equal-transmon comparison: dual-rail bb72 (2 transmons per qubit -> 288 transmons, 12 logical)
    # vs transmon gross (288 transmons, 12 logical). Find the dual-rail raw error giving equal LER.
    tol = []
    dr = er.get("bb72|0.975", [])
    if len(dr) >= 2:
        xs, ys = np.log([x["p"] for x in dr]), np.log([x["ler"] for x in dr])
        for g in er.get("gross144|0.0", []):
            if g["errors"] == 0:
                continue
            target = math.log(g["ler"])
            # interpolate p_DR where log LER_DR(p) = target (monotone in p)
            if target < ys.min() or target > ys.max():
                b, a = np.polyfit(xs, ys, 1)
                pdr = math.exp((target - a) / b)
                kind = "extrapolated"
            else:
                pdr = float(math.exp(np.interp(target, ys, xs)))
                kind = "interpolated"
            tol.append({"p_transmon": g["p"], "ler": g["ler"], "p_dualrail_equal": pdr, "ratio": pdr / g["p"], "kind": kind})
    out["dualrail_tolerance"] = tol

    # ---------------------------------------------------------------- cryo budgets -> QEC
    cq = load("q2_cryo_qec")
    cb = {}
    for r in cq:
        lo, hi = ler_ci(r)
        cb.setdefault(r["code"], []).append({"label": r["label"], "s": r["s"], "ler": ler(r), "lo": lo, "hi": hi, "errors": r["errors"], "shots": r["shots"]})
    for code, v in cb.items():
        v.sort(key=lambda x: (x["label"] != "conventional", x["s"]))
        au = [x for x in v if x["label"].startswith("aurora") and x["errors"] >= 10]
        if len(au) >= 2:
            xs, ys = np.log([x["s"] for x in au]), np.log([x["ler"] for x in au])
            b, a = np.polyfit(xs, ys, 1)
            for x in v:
                if x["label"] == "aurora_x1.0":
                    x["extrapolated"] = float(math.exp(a))
                    x["fit_slope"] = float(b)
    out["cryo_qec"] = cb
    out["cryo_budgets"] = {k: coherence_budget(v)["noise"] for k, v in ARCH.items()}

    # ---------------------------------------------------------------- fridge-level projection
    fr = {}
    for sysname, kw in (("conventional", {}), ("flex", {}), ("aurora", {}), ("aurora_plus12W", {"extra_4k_w": 12.0})):
        m = max_qubits("aurora" if sysname.startswith("aurora") else sysname, **kw)
        modules = m["max_qubits"] // 288
        fr[sysname] = {"max_qubits": m["max_qubits"], "limiting": m["limiting"], "modules": modules,
                       "logical_memory": modules * 12, "layout_20_positions": min(modules, 20)}
    out["fridge"] = fr
    area = 2.12 * 1.16
    out["radiation"] = {k: {"label": v["label"], "mtbf_s_20dies": burst_mtbf(20, area, v["p_fail"], v["rate_factor"])}
                        for k, v in RAD_SCENARIOS.items()}
    out["radiation_params"] = {**RAD, "die_area_cm2": area}
    (RES / "q2_resources.json").write_text(json.dumps(out, indent=1, default=float))
    return out


if __name__ == "__main__":
    o = main()
    for e in o["equal_error"]:
        print(e)
    print(o["bb_power_fit"])
    print(o["dualrail_tolerance"])
    print({k: (v["Lambda"]) for k, v in o["surface_fit"].items()})
