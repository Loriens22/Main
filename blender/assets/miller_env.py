"""Miller's planet: habitat pieces and the research submersible.

  miller_outcrop.glb   wet black basalt outcrop (~14 m) breaking the surface: slabs, blocks, a sheltered notch
                       (marker 'nest:notch') where the shield-backs lay their eggs
  rift_overhang.glb    a ledge slab jutting from the canyon wall over a low cave (~12 m): dens for the stalkers,
                       caves for the sirens (marker 'den:mouth')
  rift_vents.glb       a cluster of hydrothermal chimneys: dark sulphide, pale mineral rims, a mat of microbes
  egg_clutch.glb       a clutch of leathery eggs in a hollow
  nest_stone.glb       one flat stone / shell piece (instanced: rift architects build walls of them)
  minisub.glb          the two-person research submersible: an acrylic sphere in a yellow frame, ballast tanks,
                       six thrusters, lamp bar, skids, manipulator; markers for the lamps, the hatch and the seat
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from bio import *  # noqa: E402,F403
import bmesh  # noqa: E402
from mathutils import Vector, noise  # noqa: E402

TAU = math.tau


def basalt_block(P, at, size, rot, seed, mat="basalt_wet", round_=0.25):
    """an angular basalt block: a box with chamfered, noise-worn faces (columnar jointing look)"""
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.subdivide_edges(tb, edges=tb.edges[:], cuts=3, use_grid_fill=True)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    sx, sy, sz = size
    for v in tb.verts:
        c = v.co
        # round the box toward a superellipsoid, then wear it with noise
        n = Vector((c.x * 2, c.y * 2, c.z * 2))
        m = max(abs(n.x), abs(n.y), abs(n.z))
        sph = n.normalized() * m
        p = n.lerp(sph, round_)
        d = noise.noise(p * 1.4 + off) * 0.12 + noise.noise(p * 4.0 + off) * 0.04
        p = p * (1 + d)
        v.co = Vector((p.x * sx * 0.5, p.y * sy * 0.5, p.z * sz * 0.5))
    P._emit(tb, mat, xf(at, rot))


def build_outcrop():
    reset()
    rnd = random.Random(5)
    P = Part("outcrop")
    # a spine of tilted slabs and blocks, highest in the middle, a notch sheltered on the lee side
    for k in range(26):
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(0, 1) ** 0.7 * 6.5
        x, y = d * math.cos(a), d * math.sin(a) * 0.65
        if -1.2 < x < 1.6 and -2.6 < y < -0.8:
            continue      # keep the notch clear
        h = (1 - d / 7.5) * rnd.uniform(1.2, 2.6)
        s = (rnd.uniform(1.2, 3.0), rnd.uniform(1.0, 2.2), h + 0.6)
        basalt_block(P, (x, y, h * 0.5 - 0.2), s, (rnd.uniform(-14, 14), rnd.uniform(-14, 14), rnd.uniform(0, 180)), k)
    # the notch: two leaning slabs roofing a hollow
    basalt_block(P, (-0.2, -1.2, 1.0), (3.2, 0.7, 2.2), (68, 0, 8), 101)
    basalt_block(P, (0.9, -2.4, 0.7), (0.9, 2.0, 1.6), (0, -12, 15), 102)
    ob = P.finish(sharp=50)
    marker("nest", "notch", at=(0.2, -1.8, 0.0))
    bake_ao([ob], ground_z=-0.2, local_dist=1.0, sky_dist=8)


def build_overhang():
    reset()
    P = Part("overhang")
    # the wall block behind, the roof slab jutting out, rubble at the cave mouth
    basalt_block(P, (0, 2.2, 3.0), (12, 4.0, 8.0), (0, 0, 0), 1, round_=0.15)
    basalt_block(P, (0, -1.6, 4.6), (11, 6.0, 1.6), (6, 0, 0), 2, round_=0.2)
    for k, (x, y, s) in enumerate(((-4.5, -2.0, 1.6), (4.8, -1.5, 1.9), (-2.0, -4.2, 0.9), (3.2, -4.6, 1.1), (5.6, -3.4, 1.3))):
        basalt_block(P, (x, y, s * 0.4), (s * 1.4, s, s), (k * 20, k * 13, k * 37), 10 + k)
    for k, x in enumerate((-4.0, 4.2)):
        basalt_block(P, (x, -1.4, 1.9), (1.6, 1.6, 4.0), (0, 0, k * 30), 20 + k)
    ob = P.finish(sharp=50)
    marker("den", "mouth", at=(0, -1.0, 1.6))
    bake_ao([ob], ground_z=0.0, local_dist=1.5, sky_dist=10)


def build_vents():
    reset()
    rnd = random.Random(9)
    P = Part("vents")
    for k in range(7):
        x, y = rnd.uniform(-5, 5), rnd.uniform(-5, 5)
        h = rnd.uniform(2.5, 7.0)
        r = rnd.uniform(0.4, 0.9)
        prof = []
        for j in range(9):
            t = j / 8
            prof.append((r * (1.0 - 0.55 * t) * (1 + 0.2 * math.sin(t * 17 + k)), t * h))
        prof.append((r * 0.3, h + 0.05))
        P.lathe(prof, at=(x, y, 0), mat="vent_crust", segs=14, bevel=0)
        P.cyl(r * 0.5, 0.25, at=(x, y, h - 0.05), mat="vent_rim", segs=12, r2=r * 0.35, bevel=0.02)
        marker("plume", f"v{k}", at=(x, y, h + 0.1), power=1.0 + h / 7)
    # the microbial mat round the field
    P.grid(14, 14, 28, 28, at=(0, 0, 0.02), mat="vent_mat", hfn=lambda x, y: 0.04 * noise.noise(Vector((x * 0.6, y * 0.6, 0.3))) - 0.12 * max(0.0, (math.hypot(x, y) - 5.5)))
    ob = P.finish(sharp=60)
    bake_ao([ob], ground_z=0.0, local_dist=1.0, sky_dist=10)


def build_clutch():
    reset()
    rnd = random.Random(3)
    P = Part("clutch")
    for k in range(14):
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(0, 0.32)
        P.sphere(0.085, at=(d * math.cos(a), d * math.sin(a), 0.07 + (0.1 if d < 0.12 else 0)), mat="egg_shell", segs=12, rings=8, scale=(1, 0.9, 1.15))
    ob = P.finish(sharp=60, col=0)
    bake_ao([ob], ground_z=0.0, local_dist=0.15, sky_dist=1)


def build_stone():
    reset()
    P = Part("nest_stone")
    basalt_block(P, (0, 0, 0.04), (0.32, 0.22, 0.08), (0, 0, 0), 4, mat="nest_shell", round_=0.6)
    P.finish(sharp=60, col=0)


def build_sub():
    reset()
    P = Part("sub_frame")
    Y = "paint_yellow"
    # frame: two longitudinal skids and hoops round the pressure sphere
    for s in (-1, 1):
        tube(P, [(s * 0.9, 1.6, 0.25), (s * 0.95, 0.0, 0.1), (s * 0.9, -1.7, 0.25)], [(0, 0.06), (1, 0.06)], "metal_dark", segs=8, n=10)
        for y in (1.0, -1.0):
            tube(P, [(s * 0.95, y, 0.12), (s * 1.05, y, 0.9), (s * 0.75, y, 1.8)], [(0, 0.05), (1, 0.05)], Y, segs=8, n=8)
    for y in (1.0, -1.0):
        tube(P, [(-0.75, y, 1.8), (0, y, 2.05), (0.75, y, 1.8)], [(0, 0.05), (1, 0.05)], Y, segs=8, n=8)
    # ballast and syntactic-foam blocks either side, the battery pod below
    for s in (-1, 1):
        P.cyl(0.38, 2.4, at=(s * 1.05, -0.1, 0.75), rot=(90, 0, 0), mat=Y, segs=20, bevel=0.06)
        P.sphere(0.38, at=(s * 1.05, 1.1, 0.75), mat=Y, segs=20, rings=10, scale=(1, 0.6, 1))
        P.sphere(0.38, at=(s * 1.05, -1.3, 0.75), mat=Y, segs=20, rings=10, scale=(1, 0.6, 1))
    P.box((1.2, 1.6, 0.4), at=(0, -0.3, 0.38), mat="paint_gray_dark", bevel=0.05)
    P.box((1.6, 1.2, 0.5), at=(0, -0.7, 1.95), mat=Y, bevel=0.08)
    # six thrusters in shrouds: two stern, two vertical, two lateral
    for s in (-1, 1):
        P.tube(0.22, 0.18, 0.35, at=(s * 0.6, -1.85, 0.9), rot=(90, 0, 0), mat="metal_dark", segs=16)
        P.cyl(0.07, 0.3, at=(s * 0.6, -1.85, 0.9), rot=(90, 0, 0), mat="metal_steel", segs=8)
        P.tube(0.18, 0.14, 0.3, at=(s * 1.45, -0.1, 1.35), mat="metal_dark", segs=14)
        P.tube(0.16, 0.12, 0.28, at=(s * 1.45, 0.6, 0.6), rot=(0, 90, 0), mat="metal_dark", segs=14)
    # lamp bar across the front, camera pods, manipulator arm folded
    tube(P, [(-1.0, 1.75, 1.15), (1.0, 1.75, 1.15)], [(0, 0.05), (1, 0.05)], "metal_dark", segs=8, n=4)
    for x in (-0.85, -0.3, 0.3, 0.85):
        P.cyl(0.11, 0.16, at=(x, 1.82, 1.15), rot=(90, 0, 0), mat="metal_dark", segs=14, bevel=0.02)
        P.cyl(0.085, 0.02, at=(x, 1.905, 1.15), rot=(90, 0, 0), mat="emit_white", segs=14, bevel=0)
    P.cyl(0.09, 0.22, at=(0.55, 1.6, 0.55), rot=(90, 0, 0), mat="metal_dark", segs=12)
    tube(P, [(-0.6, 1.5, 0.45), (-0.75, 1.9, 0.5), (-0.55, 2.15, 0.35)], [(0, 0.045), (1, 0.03)], "metal_steel", segs=8, n=8)
    claws(P, Vector((-0.55, 2.15, 0.35)), Vector((0, 1, -0.3)), 0.04, 2, 0.12, 0.018, mat="metal_dark")
    P.cyl(0.02, 0.9, at=(-0.4, -0.9, 2.5), mat="metal_steel", segs=6)
    P.sphere(0.05, at=(-0.4, -0.9, 2.96), mat="emit_red", segs=8, rings=6)
    frame = P.finish(sharp=40)
    # the acrylic pressure sphere and the two seats inside
    G = Part("sub_sphere")
    G.sphere(0.85, at=(0, 0.45, 1.15), mat="glass", segs=40, rings=24)
    glass = G.finish(sharp=60, col=0)
    I = Part("sub_inside")
    I.cyl(0.7, 0.06, at=(0, 0.45, 0.6), mat="metal_dark", segs=24)
    for x in (-0.3, 0.3):
        I.box((0.42, 0.45, 0.1), at=(x, 0.4, 0.8), mat="seat_leather_dark", bevel=0.03)
        I.box((0.42, 0.1, 0.5), at=(x, 0.15, 1.05), mat="seat_leather_dark", bevel=0.03)
    I.box((0.9, 0.25, 0.3), at=(0, 0.95, 0.85), rot=(-25, 0, 0), mat="paint_gray_dark", bevel=0.03)
    I.box((0.5, 0.02, 0.25), at=(0, 1.04, 0.92), rot=(-25, 0, 0), mat="screen", bevel=0)
    inside = I.finish(sharp=40, col=0)
    marker("seat", "pilot", at=(-0.3, 0.45, 0.85))
    marker("cam", "pilot", at=(-0.3, 0.6, 1.45))
    marker("hatch", "top", at=(0, -0.7, 2.25))
    for i, x in enumerate((-0.85, -0.3, 0.3, 0.85)):
        light(f"sub_lamp{i}", (x, 1.95, 1.15), color=(0.92, 0.96, 1.0), power=320, dist=40, kind="spot", rot=(90, 0, 0), angle=0.42, room="lamps")
    bake_ao([frame, inside], ground_z=0.0, local_dist=0.6, sky_dist=4)


ALL = {"miller_outcrop": build_outcrop, "rift_overhang": build_overhang, "rift_vents": build_vents, "egg_clutch": build_clutch,
       "nest_stone": build_stone, "minisub": build_sub}

if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    views = {"miller_outcrop": ((14, -14, 8), (0, 0, 1)), "rift_overhang": ((10, -16, 6), (0, 0, 3)), "rift_vents": ((10, -12, 6), (0, 0, 2.5)),
             "egg_clutch": ((0.8, -0.8, 0.6), (0, 0, 0.1)), "nest_stone": ((0.5, -0.5, 0.4), (0, 0, 0)), "minisub": ((4.5, 4.5, 3.0), (0, 0, 1.0))}
    for name, fn in ALL.items():
        if only and name not in only:
            continue
        fn()
        if pv:
            e, t = views[name]
            preview(name, e, t, res=(800, 520), lens=35, samples=32)
        export_glb(name)
