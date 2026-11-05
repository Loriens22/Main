"""Run every AURORA-Q experiment and export JSON for the website.

    python -m aurora.run_all            # full run (≈ 20–40 min on 4 cores)
    python -m aurora.run_all --quick    # smoke run (≈ 1–2 min)
    python -m aurora.run_all --only qec,reset

Results are written to backend/results/*.json and copied to web/public/data/.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

from .experiments import chemistry, common, engine, mitigation, qec, qml, reset, scalability
from .topologies import heron_heavy_hex, square_grid

ORDER = {
    "engine": engine.run,
    "qec": qec.run,
    "reset": reset.run,
    "mitigation": mitigation.run,
    "qml": qml.run,
    "chemistry": chemistry.run,
    "scalability": scalability.run,  # depends on qec.json
}

WEB_DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"


def export_topologies() -> None:
    topo = {"heron_heavy_hex": heron_heavy_hex().to_json(), "nighthawk_square": square_grid().to_json()}
    common.save("topologies", topo)


def copy_to_web() -> list[str]:
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    copied = []
    for p in sorted(common.RESULTS_DIR.glob("*.json")):
        shutil.copy(p, WEB_DATA / p.name)
        copied.append(p.name)
    manifest = {"files": copied, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (WEB_DATA / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return copied


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    selected = [s for s in args.only.split(",") if s] or list(ORDER)
    export_topologies()
    for name in selected:
        t0 = time.time()
        print(f"[aurora] running {name} ...", flush=True)
        ORDER[name](quick=args.quick)
        print(f"[aurora] {name} done in {time.time() - t0:.1f}s", flush=True)
    print("[aurora] copied:", copy_to_web())


if __name__ == "__main__":
    main()
