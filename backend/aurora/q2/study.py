"""AURORA-Q2 QEC study driver: memory scans, heralded-erasure trade study, cryo noise budgets.

Run:  python -m aurora.q2.study qec   [--workers 3]
      python -m aurora.q2.study cryo  [--workers 3]
Results are appended task by task to results/q2_<name>.json so a long run can be resumed.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import time
import zlib

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

RESULTS = pathlib.Path(__file__).resolve().parents[2] / "results"


def qec_tasks() -> list[dict]:
    t = []
    # A. memory scans (uniform SD6-like circuit noise)
    for p in (0.002, 0.003, 0.004, 0.005, 0.006):
        for code, r in (("gross144", 6), ("bb72", 6)):
            t.append({"set": "memory", "code": code, "rounds": r, "p": p, "f": 0.0})
    for p in (0.002, 0.003, 0.004, 0.005, 0.006, 0.008, 0.010):
        for d in (3, 5, 7, 9):
            t.append({"set": "memory", "code": f"surface_d{d}", "rounds": d, "p": p, "f": 0.0})
    # B. heralded-erasure trade study (fraction f of every CNOT error becomes a heralded erasure)
    for code, p, f in (("bb72", 0.003, 0.9), ("bb72", 0.005, 0.5), ("bb72", 0.005, 0.9),
                       ("bb72", 0.003, 0.975), ("bb72", 0.005, 0.975), ("bb72", 0.008, 0.975), ("bb72", 0.012, 0.975),
                       ("gross144", 0.005, 0.5), ("gross144", 0.005, 0.9), ("gross144", 0.005, 0.975),
                       ("gross144", 0.008, 0.975)):
        t.append({"set": "erasure", "code": code, "rounds": 6, "p": p, "f": f})
    # heavy tasks first so the pool does not tail on them
    t.sort(key=lambda x: (x["code"] != "gross144", x["f"] == 0.0, -x["p"]))
    return t


def run_task(task: dict) -> dict:
    from .codes import bb_code, rotated_surface_code
    from .memory import Noise, run_memory
    name = task["code"]
    code = rotated_surface_code(int(name.split("_d")[1])) if name.startswith("surface") else bb_code(name)
    noise = Noise(**task["noise"]) if "noise" in task else Noise.uniform(task["p"], f_herald=task["f"])
    seed = zlib.crc32(json.dumps([name, task.get("p"), task.get("f"), task.get("label")]).encode()) % (2**31)
    r = run_memory(code, task["rounds"], noise, shots=task.get("shots", 300000), seed=seed,
                   max_errors=task.get("max_errors", 100), max_seconds=task.get("max_seconds", 900))
    r.update({k: v for k, v in task.items() if k not in ("noise",)})
    return r


def run(name: str, tasks: list[dict], workers: int):
    from multiprocessing import Pool
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"q2_{name}.json"
    done = json.loads(out.read_text()) if out.exists() else []
    key = lambda d: (d["code"], d.get("p"), d.get("f"), d.get("label"), d["rounds"])
    have = {key(d) for d in done}
    todo = [t for t in tasks if key(t) not in have]
    print(f"{len(todo)} tasks to run ({len(have)} cached)", flush=True)
    t0 = time.time()
    with Pool(workers) as pool:
        for r in pool.imap_unordered(run_task, todo):
            done.append(r)
            out.write_text(json.dumps(done, indent=1))
            print(f"[{time.time() - t0:7.0f}s] {r['code']:<11} p={r.get('p')} f={r.get('f')} {r.get('label', '')} "
                  f"shots={r['shots']} err={r['errors']} ler/lq/round={r['per_logical_qubit_per_round']:.3e}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("which", choices=["qec", "cryo"])
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    if a.which == "qec":
        run("qec", qec_tasks(), a.workers)
    else:
        from .cryo import qec_budget_tasks
        run("cryo_qec", qec_budget_tasks(), a.workers)
