"""Cycles renders of AURORA-Q2 assets -> web2/public/renders (PNG + WebP).

usage: python render_q2.py <shot,shot|all> [samples] [scale]
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from aurora3d import core as K  # noqa: E402
from aurora3d import render as R  # noqa: E402

OUT = K.ROOT / "web2" / "public" / "renders"
BL = K.ROOT / "blender" / "out"
SHOTS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["all"]
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 96
SCALE = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
RES = (int(1600 * SCALE), int(1000 * SCALE))


def open_blend(name):
    bpy.ops.wm.open_mainfile(filepath=str(BL / f"q2_{name}.blend"))
    K._MATS.clear()


def hide(pred):
    for ob in bpy.data.objects:
        p = ob
        while p is not None:
            if pred(p):
                ob.hide_render = True
                break
            p = p.parent


def explode(scale=1.0, only=None):
    for ob in bpy.data.objects:
        if ob.type == "EMPTY" and ob.get("explode") is not None and (only is None or ob.get("component") in only):
            x, y, z = ob["explode"]
            ob.location = ob.location + Vector((x, -z, y)) * scale


def studio(strength=0.55):
    R.studio_world(top=(0.42, 0.48, 0.62), bottom=(0.01, 0.01, 0.02), accent=(0.08, 0.14, 0.32), strength=strength * 1.9)


def webp(png):
    from PIL import Image
    im = Image.open(png).convert("RGB")
    out = png.with_suffix(".webp")
    im.save(out, "WEBP", quality=86, method=6)
    png.unlink()
    return out


def floor_mm(z, mat=None):
    R.floor(400, z, mat or K.material("floor dark", (0.02, 0.022, 0.03), 0.0, 0.3))


def shot_toroid_exploded():
    open_blend("chip")
    explode(1.0)
    studio(0.5)
    R.area_light("key", (-20, -28, 34), (0, 0, 2), 18, 9000)
    R.area_light("rim", (26, 18, 14), (0, 0, 2), 14, 5000, (0.55, 0.7, 1.0))
    R.area_light("fill", (6, -30, 6), (0, 0, 1), 16, 2200, (1.0, 0.9, 0.8))
    floor_mm(-0.2)
    R.camera((27, -33, 14), (0.0, 0, 3.6), lens=55, dof_dist=43, fstop=11)
    return R.render(OUT / "toroid_exploded.png", RES, SAMPLES)


def shot_toroid_macro():
    open_blend("chip")
    hide(lambda p: p.get("component") in ("q2_interposer", "q2_route_a", "q2_route_b", "q2_ground", "q2_bumps"))
    studio(0.45)
    R.area_light("key", (-6, -8, 10), (0, 0, 0.5), 6, 1400)
    R.area_light("rim", (8, 5, 4), (0, 0, 0.5), 5, 800, (0.55, 0.7, 1.0))
    floor_mm(-0.2)
    R.camera((3.6, -4.2, 2.6), (1.2, -0.5, 0.45), lens=70, dof_dist=5.0, fstop=3.2)
    return R.render(OUT / "toroid_macro.png", RES, SAMPLES)


def shot_toroid_routing():
    open_blend("chip")
    hide(lambda p: p.get("component") in ("q2_interposer", "q2_ground", "q2_features"))
    studio(0.45)
    R.area_light("key", (-10, -14, 22), (0, 0, 0.5), 10, 3000)
    R.area_light("rim", (14, 10, 8), (0, 0, 0.5), 8, 1600, (0.55, 0.7, 1.0))
    floor_mm(-0.2)
    R.camera((9, -11, 9), (2, -1, 0.5), lens=50, dof_dist=15, fstop=5.6)
    return R.render(OUT / "toroid_routing.png", RES, SAMPLES)


def shot_module():
    open_blend("module")
    hide(lambda p: bool(p.get("shield")))
    explode(1.0, only={"m_lid"})
    studio(0.5)
    R.area_light("key", (-90, -120, 160), (0, 0, 8), 60, 60000)
    R.area_light("rim", (120, 90, 60), (0, 0, 8), 50, 30000, (0.55, 0.7, 1.0))
    R.area_light("fill", (20, -140, 20), (0, 0, 5), 50, 9000, (1.0, 0.9, 0.8))
    floor_mm(-0.05)
    R.camera((80, -98, 74), (0, 0, 7), lens=50, dof_dist=146, fstop=11)
    return R.render(OUT / "module_hero.png", RES, SAMPLES)


def shot_cryo():
    open_blend("cryo_cut")
    hide(lambda p: p.get("component") in ("shield_ovc", "shield_pb"))
    studio(0.5)
    R.area_light("key", (-3.0, -4.0, 5.0), (0, 0, 2.0), 3.0, 900)
    R.area_light("rim_l", (-3.2, 3.4, 3.4), (0, 0, 2.0), 2.5, 600, (0.55, 0.7, 1.0))
    R.area_light("rim_r", (4.0, 2.4, 3.0), (0, 0, 2.0), 2.5, 500, (0.6, 0.65, 1.0))
    R.area_light("under", (0.0, -1.6, 0.6), (0, 0, 1.6), 1.2, 160, (0.4, 0.6, 1.0))
    R.area_light("inside", (0.55, -0.8, 2.2), (0, 0, 2.0), 0.5, 45, (0.85, 0.9, 1.0))
    R.floor(60, 0, K.material("floor epoxy dark", (0.03, 0.034, 0.045), 0.0, 0.22))
    R.camera((2.55, -3.55, 2.35), (0.1, 0, 1.95), lens=30)
    return R.render(OUT / "cryo_hero.png", RES, SAMPLES)


def shot_payload():
    open_blend("cryo")
    hide(lambda p: bool(p.get("shield")) or p.get("component") in ("frame", "racks", "compressors"))
    studio(0.22)
    R.area_light("key", (-1.4, -1.8, 1.2), (0, 0, 1.6), 1.2, 140)
    R.area_light("rim", (1.6, 1.2, 1.0), (0, 0, 1.6), 1.0, 110, (0.55, 0.7, 1.0))
    R.area_light("under", (0.2, -0.6, 0.9), (0, 0, 1.6), 0.6, 25, (0.5, 0.6, 1.0))
    R.floor(60, 0, K.material("floor epoxy dark", (0.03, 0.034, 0.045), 0.0, 0.22))
    R.camera((0.92, -1.12, 1.42), (0.05, -0.1, 1.62), lens=38, dof_dist=1.45, fstop=6.3)
    return R.render(OUT / "cryo_payload.png", RES, SAMPLES)


def shot_cmos():
    open_blend("cryo")
    hide(lambda p: bool(p.get("shield")) or p.get("component") in ("plate_300k", "plate_50k", "pulse_tubes", "cmos_coolers", "frame", "fibres"))
    studio(0.45)
    R.area_light("key", (-1.2, -1.6, 3.4), (0, 0, 2.4), 1.4, 300)
    R.area_light("rim", (1.6, 1.2, 2.8), (0, 0, 2.4), 1.0, 200, (0.55, 0.7, 1.0))
    R.floor(60, 0, K.material("floor epoxy dark", (0.03, 0.034, 0.045), 0.0, 0.22))
    R.camera((0.95, -1.15, 2.95), (0.25, -0.15, 2.4), lens=35, dof_dist=1.3, fstop=4.5)
    return R.render(OUT / "cryo_cmos.png", RES, SAMPLES)


ALL = {"toroid_exploded": shot_toroid_exploded, "toroid_macro": shot_toroid_macro, "toroid_routing": shot_toroid_routing,
       "module": shot_module, "cryo": shot_cryo, "payload": shot_payload, "cmos": shot_cmos}
for name in (ALL if SHOTS == ["all"] else SHOTS):
    p = ALL[name]()
    print("rendered", webp(Path(p)), flush=True)
