"""WSV-1 HALCYON hibernation capsule (Part 2 directive, section 06 item 8): an original design for the new ship, the
same purpose as the Endurance's pods.

A white couch capsule on a plinth: a soft-cornered tub with a padded blue-gray couch and raised headrest; at the head a
biomonitor unit with its display, ring fitting and the fluid and thermal lines running down into the plinth; a
translucent clamshell canopy in a white frame, hinged along the far edge, that swings up and over; a scanner arch that
sweeps the sleeper from feet to chest once the canopy is closed... (the arch sweeps between climbing in and closing);
a status light strip round the plinth.

Same timeline and conventions as cryo_pod.glb (the hypersleep system plays either):
   0.0 -  2.5 s  the canopy swings open (110 degrees about its hinge)
   2.5 -  6.5 s  the eye (`eye:r`, `eye:l`) steps up, sits on the couch and lies back
   6.5 -  9.5 s  the scanner arch sweeps from the feet to the chest and back
   9.5 - 12.0 s  the canopy swings shut
Frame: +Y toward the head, +X right, origin on the floor under the capsule's centre. Markers: `lie:crew`, `use:pod`,
light `pod`.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Vector  # noqa: E402

L, W = 2.40, 1.04
HB = 0.36
Y_HEAD = L / 2 - HB
Z_PL = 0.42          # plinth top
Z_RIM = 0.86         # tub rim
Z_BED = 0.72         # couch surface
FPS = 30
F_OPEN, F_IN, F_WRAP, F_CLOSE, F_END = 0, 75, 195, 285, 360
HINGE_X = -W / 2 + 0.06


def rounded_rect(l, w, r, n=5):
    pts = []
    for (cx, cy, a0) in ((w / 2 - r, -l / 2 + r, -90), (w / 2 - r, l / 2 - r, 0), (-w / 2 + r, l / 2 - r, 90), (-w / 2 + r, -l / 2 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def body():
    P = Part("hpod_body")
    # plinth with a recessed dark kick plate and a light strip
    P.prism(rounded_rect(L - 0.1, W - 0.08, 0.16), Z_PL - 0.06, mat="paint_white", bevel=0.02)
    P.prism(rounded_rect(L - 0.22, W - 0.2, 0.12), 0.08, at=(0, 0, 0), mat="plastic_black", bevel=0.0)
    P.prism(rounded_rect(L - 0.02, W, 0.18), 0.06, at=(0, 0, Z_PL - 0.06), mat="hull_gray", bevel=0.01)
    # tub: outer shell with the couch cavity
    outer = rounded_rect(L, W, 0.2)
    cav = rounded_rect(L - 2 * 0.12 - HB, W - 0.24, 0.12)
    cav = [(x, y - HB / 2) for (x, y) in cav]
    P.prism(outer, Z_RIM - Z_PL, at=(0, 0, Z_PL), mat="pod_white", bevel=0.03, holes=[cav[::-1]], exact_holes=True)
    P.prism(cav, 0.04, at=(0, 0, Z_BED - 0.2), mat="pod_tub", bevel=0.0)
    # the padded couch: three cushions and a raised headrest
    for (y0, y1) in ((-L / 2 + 0.16, -0.25), (-0.22, 0.35), (0.38, Y_HEAD - 0.04)):
        P.box((W - 0.34, y1 - y0, 0.14), at=(0, (y0 + y1) / 2, Z_BED - 0.07), mat="padding_blue", bevel=0.05)
    P.box((0.5, 0.3, 0.12), at=(0, Y_HEAD - 0.2, Z_BED + 0.05), mat="padding_blue", bevel=0.05)
    for y in (-0.6, 0.1):
        P.box((W - 0.3, 0.06, 0.02), at=(0, y, Z_BED + 0.005), mat="pod_tape", bevel=0.005)
    # head unit: biomonitor block, display, ring fitting, fluid and thermal lines into the plinth
    P.box((W - 0.06, HB, 0.62), at=(0, L / 2 - HB / 2, Z_RIM + 0.2), mat="pod_white", bevel=0.05)
    P.box((0.6, 0.02, 0.26), at=(0, Y_HEAD - 0.005, Z_RIM + 0.28), mat="pod_lcd", bevel=0.0)
    P.box((0.66, 0.03, 0.32), at=(0, Y_HEAD + 0.005, Z_RIM + 0.28), mat="plastic_black", bevel=0.01)
    P.tube(0.12, 0.08, 0.05, M=Matrix.Translation((0.32, Y_HEAD - 0.02, Z_RIM + 0.06)) @ Matrix.Rotation(math.radians(90), 4, "X"), mat="metal_chrome", segs=20)
    for k, (dx, m) in enumerate(((-0.32, "paint_blue"), (-0.2, "paint_red"), (0.36, "plastic_dark"))):
        P.pipe([(dx, L / 2 + 0.02, Z_RIM + 0.1), (dx, L / 2 + 0.12, Z_RIM - 0.05), (dx, L / 2 + 0.12, 0.25), (dx, L / 2 - 0.05, 0.12)], 0.025, mat=m, segs=8, bend=0.4)
    # the hinge rail on the far side
    P.box((0.08, L - HB - 0.2, 0.08), at=(HINGE_X - 0.02, -HB / 2, Z_RIM + 0.02), mat="metal_gunmetal", bevel=0.02)
    E = Part("hpod_emit")
    E.box((0.03, L - 0.5, 0.025), at=(W / 2 - 0.02, 0, Z_PL - 0.1), mat="emit_cool")
    E.box((0.03, L - 0.5, 0.025), at=(-W / 2 + 0.02, 0, Z_PL - 0.1), mat="emit_cool")
    E.box((0.04, 0.01, 0.04), at=(0.42, Y_HEAD - 0.01, Z_RIM + 0.46), mat="emit_green")
    b = P.finish(col=0)
    e = E.finish(col=0, shadow=0)
    return b, e


def canopy():
    """Translucent clamshell over the couch, built about its hinge (object origin on the hinge line)."""
    C = Part("hpod_canopy")
    G = Part("hpod_canopy_glass")
    span = W - 0.12
    l = L - HB - 0.1
    y0 = -L / 2 + 0.05
    # arch section in x (from the hinge at 0 to the free edge at span), height 0.42
    n = 14
    sec = []
    for k in range(n + 1):
        t = math.pi * k / n
        sec.append((span / 2 - math.cos(t) * span / 2, 0.42 * math.sin(t)))
    verts, faces = [], []
    rows = 8
    for r in range(rows + 1):
        y = y0 + l * r / rows
        for (x, z) in sec:
            verts.append((x, y, z))
    m = n + 1
    for r in range(rows):
        for k in range(n):
            a = r * m + k
            faces.append((a, a + 1, a + 1 + m, a + m))
    G.mesh(verts, faces, mat="cryo_canopy", recalc=False)
    # end caps (glass), and the white frame: rim, ends, two ribs
    for y in (y0, y0 + l):
        G.poly([(x, y, z) for (x, z) in sec], mat="cryo_canopy")
        C.pipe([(x, y, z) for (x, z) in sec], 0.025, mat="pod_white", segs=8)
    for x in (0.0, span):
        C.box((0.06, l, 0.05), at=(x, y0 + l / 2, 0.0), mat="pod_white", bevel=0.015)
    for y in (y0 + l / 3, y0 + 2 * l / 3):
        C.pipe([(x, y, z) for (x, z) in sec], 0.015, mat="pod_white", segs=6)
    C.box((0.05, 0.3, 0.04), at=(span + 0.02, y0 + l / 2, 0.03), mat="plastic_dark", bevel=0.01)
    c = C.finish(col=0, at=(HINGE_X, 0, Z_RIM + 0.02), part="canopy")
    g = G.finish(col=0, shadow=0, parent=c, part="canopy_glass")
    return c


def scanner():
    S = Part("hpod_scanner")
    S.lathe([(0.5, -0.03), (0.56, -0.03), (0.56, 0.03), (0.5, 0.03)], M=Matrix.Rotation(math.radians(-90), 4, "X"), mat="pod_white", segs=24, sweep=180, closed=True)
    E = Part("hpod_scanner_e")
    E.lathe([(0.49, -0.01), (0.5, -0.01), (0.5, 0.01), (0.49, 0.01)], M=Matrix.Rotation(math.radians(-90), 4, "X"), mat="emit_cool", segs=24, sweep=180, closed=True)
    s = S.finish(col=0, at=(0, -L / 2 + 0.3, Z_BED + 0.02), part="scanner")
    E.finish(col=0, shadow=0, parent=s)
    return s


def look_quat(fwd, up):
    f = Vector(fwd).normalized()
    r = f.cross(Vector(up)).normalized()
    u = r.cross(f).normalized()
    return Matrix((r, f, u)).transposed().to_quaternion()


EYE_KEYS = [
    (F_IN, (1.0, 0.3, 1.64), (0.05, 0.1, 0.8)),
    (F_IN + 28, (0.78, 0.25, 1.52), (-0.2, -0.35, 0.85)),
    (F_IN + 56, (0.45, 0.18, 1.42), (-0.05, -0.95, 0.95)),
    (F_IN + 84, (0.04, 0.14, Z_BED + 0.8), (0.0, -1.0, Z_BED + 0.25)),
    (F_IN + 104, (0.0, 0.46, Z_BED + 0.42), ("dir", (0, -1.0, 0.05), (0, 0.1, 1))),
    (F_WRAP, (0.0, Y_HEAD - 0.15, Z_BED + 0.215), ("dir", (0, -1.0, 0.3), (0, 0.3, 1))),
]


def eye(side):
    ob = empty(f"hpod_eye_{'r' if side > 0 else 'l'}", kind="eye", id="r" if side > 0 else "l")
    ob.rotation_mode = "QUATERNION"
    prev = None
    for f, pos, tgt in EYE_KEYS:
        p = Vector((pos[0] * side, pos[1], pos[2]))
        if tgt[0] == "dir":
            fwd, up = Vector(tgt[1]), Vector(tgt[2])
            fwd.x *= side
            up.x *= side
        else:
            fwd = Vector((tgt[0] * side, tgt[1], tgt[2])) - p
            up = Vector((0, 0, 1))
        q = look_quat(fwd, up)
        if prev is not None and prev.dot(q) < 0:
            q = -q
        prev = q
        ob.location = p
        ob.rotation_quaternion = q
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_quaternion", frame=f)
    return ob


def animate(can, sc_ob):
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = F_OPEN, F_END
    for f, a in ((F_OPEN, 0.0), (F_OPEN + 8, -3.0), (F_IN, -110.0), (F_CLOSE, -110.0), (F_END - 8, -3.0), (F_END, 0.0)):
        can.rotation_euler = (0, math.radians(a), 0)
        can.keyframe_insert("rotation_euler", frame=f)
    y0 = -L / 2 + 0.3
    for f, y in ((F_WRAP, y0), (F_WRAP + 45, 0.35), (F_CLOSE, y0)):
        sc_ob.location = (0, y, Z_BED + 0.02)
        sc_ob.keyframe_insert("location", frame=f)


def build():
    reset()
    b, e = body()
    can = canopy()
    sc_ob = scanner()
    hull = Part("hpod_hull")
    hull.prism(rounded_rect(L, W, 0.2), Z_RIM + 0.05, mat="concrete", bevel=0.0)
    hull.box((W, HB, 0.7), at=(0, L / 2 - HB / 2, Z_RIM + 0.3), mat="concrete")
    collider("hpod_col", hull)
    eye(1)
    eye(-1)
    m = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))).transposed()
    ob = marker("lie", "crew", at=(0, Y_HEAD - 0.06 - 1.78, Z_BED + 0.115))
    ob.rotation_euler = m.to_euler()
    marker("use", "pod", at=(0, 0.2, Z_RIM + 0.1), label="Hibernation capsule")
    light("pod", at=(0, Y_HEAD - 0.1, Z_RIM + 0.25), color=(0.78, 0.88, 1.0), power=12, dist=2.6)
    animate(can, sc_ob)
    bpy.context.scene.frame_set(0)
    bake_ao([b], ground_z=0.0, local_dist=0.5)


if __name__ == "__main__":
    build()
    if "--preview" in sys.argv:
        sc = bpy.context.scene
        sc.frame_set(F_IN)
        preview("hpod_open", (2.2, -1.6, 1.9), (0, 0.0, 0.7), res=(1200, 800), lens=35, samples=40, sun_rot=(55, 0, 40), sky=(0.85, 0.87, 0.9))
        sc.frame_set(0)
        preview("hpod_closed", (2.2, -1.6, 1.9), (0, 0.0, 0.7), res=(1200, 800), lens=35, samples=40, sun_rot=(55, 0, 40), sky=(0.85, 0.87, 0.9))
        sys.exit(0)
    export_glb("halcyon_pod", anim=True)
    save_blend("halcyon_pod")
