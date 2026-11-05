"""Build AURORA-Q2 assets: Toroid die stack, module package, AURORA-CRYO system -> GLB + .blend."""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from aurora3d import core as K  # noqa: E402
from aurora3d.q2chip import build_toroid  # noqa: E402
from aurora3d.q2system import build_cryo, build_module  # noqa: E402

OUT = K.ROOT / "web2" / "public" / "models"
BLEND = K.ROOT / "blender" / "out"
which = sys.argv[1:] or ["chip", "module", "cryo"]
rp = K.ROOT / "blender" / "out" / "q2_build_report.json"
report = json.loads(rp.read_text()) if rp.exists() else {}
for name in which:
    t0 = time.time()
    K.reset_scene()
    K._MATS.clear()
    M = K.materials()
    if name == "chip":
        _, _, info = build_toroid(mats=M)
        report["chip_info"] = info
    elif name == "module":
        build_module(mats=M)
    elif name == "cryo_cut":
        build_cryo(mats=M, cutaway=True)
    else:
        build_cryo(mats=M)
    st = K.stats()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / f"q2_{name}.blend"))
    size = 0 if name == "cryo_cut" else K.export_glb(OUT / f"q2_{name}.glb")
    report[name] = {**st, "glb_bytes": size, "seconds": round(time.time() - t0, 1)}
    print(name, report[name], flush=True)
(K.ROOT / "blender" / "out" / "q2_build_report.json").write_text(json.dumps(report, indent=1))
