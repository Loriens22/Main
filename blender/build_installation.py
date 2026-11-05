"""Build the full installation GLB (metres)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from aurora3d import core as K  # noqa: E402
from aurora3d.installation import build_installation  # noqa: E402

if __name__ == "__main__":
    K.reset_scene()
    K._MATS.clear()
    build_installation()
    bpy.ops.wm.save_as_mainfile(filepath=str(K.ROOT / "blender" / "out" / "aurora_installation.blend"))
    size = K.export_glb(K.OUT_MODELS / "aurora_installation.glb")
    comps = sorted({o.get("component") for o in bpy.data.objects if o.get("component")})
    print(json.dumps({"bytes": size, **K.stats(), "components": comps}, indent=1))
