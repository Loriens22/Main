"""Build the chip and package GLBs (mm units)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402,F401

from aurora3d import core as K  # noqa: E402
from aurora3d.chip import build_chip  # noqa: E402
from aurora3d.layout import save_json  # noqa: E402
from aurora3d.package import build_package  # noqa: E402


def main(which=("chip", "package")):
    report = {}
    if "chip" in which:
        K.reset_scene()
        K._MATS.clear()
        root, L = build_chip(lod=2)
        save_json(L, K.ROOT / "web" / "public" / "data" / "chip_layout.json")
        bpy.ops.wm.save_as_mainfile(filepath=str(K.ROOT / "blender" / "out" / "aurora_chip.blend"))
        size = K.export_glb(K.OUT_MODELS / "aurora_chip.glb")
        report["chip"] = {"bytes": size, **K.stats()}
    if "package" in which:
        K.reset_scene()
        K._MATS.clear()
        build_package(lod=2)
        bpy.ops.wm.save_as_mainfile(filepath=str(K.ROOT / "blender" / "out" / "aurora_package.blend"))
        size = K.export_glb(K.OUT_MODELS / "aurora_package.glb")
        report["package"] = {"bytes": size, **K.stats()}
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main(tuple(sys.argv[1:]) or ("chip", "package"))
