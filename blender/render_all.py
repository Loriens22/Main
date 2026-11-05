"""Cycles hero renders of every AURORA-Q asset (writes PNG + WebP to web/public/renders)."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from aurora3d import core as K  # noqa: E402
from aurora3d import render as R  # noqa: E402

OUT = K.OUT_RENDERS
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 96
RES = (1600, 1000)


def hide(pred):
    for ob in bpy.data.objects:
        p = ob
        while p is not None:
            if pred(p):
                ob.hide_render = True
                break
            p = p.parent


def explode(scale=1.0):
    for ob in bpy.data.objects:
        if ob.get("explode") is not None and ob.type == "EMPTY":
            x, y, z = ob["explode"]  # stored in glTF Y-up -> Blender (x, -z, y)
            ob.location = ob.location + Vector((x, -z, y)) * scale


def dark_studio(strength=0.6):
    R.studio_world(top=(0.10, 0.12, 0.17), bottom=(0.002, 0.002, 0.004), accent=(0.03, 0.06, 0.16), strength=strength)


def webp(png):
    from PIL import Image

    im = Image.open(png).convert("RGB")
    out = png.with_suffix(".webp")
    im.save(out, "WEBP", quality=86, method=6)
    return out


def shot_installation():
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / "blender/out/aurora_installation.blend"))
    K._MATS.clear()
    hide(lambda p: bool(p.get("shield")))
    dark_studio(0.55)
    R.area_light("key", (-2.6, -3.6, 4.6), (0.4, 0.1, 1.3), 2.5, 420)
    R.area_light("rim_l", (-2.5, 2.8, 3.0), (0.2, 0, 1.3), 2.0, 380, (0.55, 0.7, 1.0))
    R.area_light("rim_r", (4.2, 2.0, 2.6), (1.0, 0, 1.3), 2.0, 340, (0.6, 0.65, 1.0))
    R.area_light("glow", (0.0, -0.9, 0.2), (0.0, 0.0, 0.9), 0.8, 30, (0.4, 0.6, 1.0))
    R.area_light("chandelier", (0.9, -1.1, 1.3), (0.0, 0.0, 1.3), 0.6, 90, (1.0, 0.92, 0.8))
    R.floor(60, 0, K.material("floor epoxy dark", (0.03, 0.034, 0.045), 0.0, 0.22))
    R.camera((3.1, -4.6, 2.0), (0.95, 0.25, 1.2), lens=32)
    return R.render(OUT / "installation_hero.png", RES, SAMPLES)


def shot_cryostat():
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / "blender/out/aurora_installation.blend"))
    K._MATS.clear()
    hide(lambda p: bool(p.get("shield")) or (p.get("component") in ("frame", "rack_control", "rack_decoder", "rack_hpc", "ghs", "compressor", "cable_tray")))
    dark_studio(0.45)
    R.area_light("key", (-1.2, -1.6, 2.4), (0, 0, 1.3), 1.2, 260)
    R.area_light("rim", (1.4, 1.2, 1.6), (0, 0, 1.2), 1.0, 220, (0.55, 0.7, 1.0))
    R.area_light("under", (0.4, -1.0, 0.3), (0, 0, 0.8), 0.8, 70, (0.5, 0.6, 1.0))
    R.floor(60, 0, K.material("floor epoxy dark", (0.03, 0.034, 0.045), 0.0, 0.22))
    R.camera((0.95, -1.55, 0.95), (0.0, 0.0, 1.12), lens=40, dof_dist=1.75, fstop=5.6)
    return R.render(OUT / "cryostat_detail.png", RES, SAMPLES)


def shot_package(exploded=False):
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / "blender/out/aurora_package.blend"))
    K._MATS.clear()
    if exploded:
        explode(1.0)
    else:
        hide(lambda p: p.name.startswith("pkg_lid"))
    dark_studio(0.9)
    R.area_light("key", (-120, -160, 260), (0, 0, 0), 200, 5.5e5)
    R.area_light("rim", (200, 160, 140), (0, 0, 0), 160, 3.0e5, (0.7, 0.8, 1.0))
    R.area_light("fill", (180, -140, 60), (0, 0, 0), 140, 1.2e5)
    R.floor(4000, 0, K.material("floor dark", (0.015, 0.017, 0.024), 0.0, 0.3))
    if exploded:
        R.camera((150, -250, 170), (6, 0, 40), lens=45)
        return R.render(OUT / "package_exploded.png", RES, SAMPLES)
    R.camera((70, -118, 140), (4, 0, 4), lens=48, dof_dist=190, fstop=8)
    return R.render(OUT / "package_open.png", RES, SAMPLES)


def shot_chip():
    bpy.ops.wm.open_mainfile(filepath=str(K.ROOT / "blender/out/aurora_chip.blend"))
    K._MATS.clear()
    hide(lambda p: p.name.startswith("chip_interposer"))
    R.studio_world(top=(0.42, 0.48, 0.62), bottom=(0.01, 0.01, 0.02), accent=(0.08, 0.14, 0.32), strength=1.1)
    R.area_light("key", (-8, -10, 14), (0, 0, 0), 10, 800)
    R.area_light("rim", (12, 9, 6), (0, 0, 0), 8, 600, (0.6, 0.75, 1.0))
    R.floor(500, -0.01, K.material("floor dark", (0.015, 0.017, 0.024), 0.0, 0.3))
    R.camera((3.6, -5.2, 3.4), (0.9, 0.7, 0.5), lens=70, dof_dist=6.9, fstop=2.2)
    return R.render(OUT / "chip_macro.png", RES, SAMPLES)


if __name__ == "__main__":
    which = sys.argv[1].split(",") if len(sys.argv) > 1 else ["installation", "cryostat", "package", "exploded", "chip"]
    OUT.mkdir(parents=True, exist_ok=True)
    fns = {"installation": shot_installation, "cryostat": shot_cryostat, "package": lambda: shot_package(False),
           "exploded": lambda: shot_package(True), "chip": shot_chip}
    for w in which:
        p = fns[w]()
        print("rendered", p, webp(Path(p)))
