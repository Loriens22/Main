"""Miller's planet: habitat pieces and the research submersible.

  miller_outcrop.glb   wet black basalt outcrop (~14 m) breaking the surface: slabs, blocks, a sheltered notch
                       (marker 'nest:notch') where the shield-backs lay their eggs
  rift_overhang.glb    a ledge slab jutting from the canyon wall over a low cave (~12 m): dens for the stalkers,
                       caves for the sirens (marker 'den:mouth')
  rift_vents.glb       a cluster of hydrothermal chimneys: dark sulphide, pale mineral rims, a mat of microbes
  egg_clutch.glb       a clutch of leathery eggs in a hollow
  nest_stone.glb       one flat stone / shell piece (instanced: rift architects build walls of them)
  rift_darter.glb      the rift darter: a small schooling forage animal of the canyon (drawn instanced, in schools)
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
from rocks import basalt_block, fbm3  # noqa: E402

TAU = math.tau


def basalt_columns(P, at, radius, h0, h1, rnd, tilt=6.0, mat="basalt_wet", r=0.45):
    """a cluster of hexagonal basalt columns on a hex grid inside `radius`: heights falling off from the middle,
    each column a slightly irregular prism with a broken, sloping top and chipped edges"""
    cx, cy, cz = at
    step = r * 1.78
    cols = []
    rng = int(radius / step) + 1
    for i in range(-rng, rng + 1):
        for k in range(-rng, rng + 1):
            x = cx + (i + 0.5 * (k % 2)) * step
            y = cy + k * step * 0.866
            d = math.hypot(x - cx, y - cy)
            if d > radius:
                continue
            f = 1 - d / radius
            h = h0 + (h1 - h0) * f ** 0.7 * rnd.uniform(0.55, 1.0)
            cols.append((x, y, h))
    for n, (x, y, h) in enumerate(cols):
        tb = bmesh.new()
        rr = r * rnd.uniform(0.86, 0.98)
        prof = []
        rot0 = rnd.uniform(0, 60)
        ring_b, ring_t = [], []
        for e in range(6):
            a = math.radians(rot0 + e * 60 + rnd.uniform(-5, 5))
            rad = rr * rnd.uniform(0.9, 1.05)
            ring_b.append(tb.verts.new((math.cos(a) * rad, math.sin(a) * rad, -0.6)))
        # the broken top: a tilted plane with one corner chipped low
        tx, ty = rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25)
        chip = rnd.randrange(6)
        for e, vb in enumerate(ring_b):
            z = h + vb.co.x * tx + vb.co.y * ty - (rnd.uniform(0.08, 0.22) if e == chip else 0)
            ring_t.append(tb.verts.new((vb.co.x * 0.97, vb.co.y * 0.97, z)))
        mid = tb.verts.new((0, 0, h + rnd.uniform(-0.03, 0.03)))
        for e in range(6):
            e2 = (e + 1) % 6
            tb.faces.new((ring_b[e], ring_b[e2], ring_t[e2], ring_t[e]))
            tb.faces.new((ring_t[e], ring_t[e2], mid))
        # sides cut into bands (cooling joints) so the noise has vertices to work on
        bmesh.ops.subdivide_edges(tb, edges=[ed for ed in tb.edges if abs(ed.verts[0].co.z - ed.verts[1].co.z) > 0.3], cuts=max(2, int(h * 2.2)))
        off = Vector((n * 1.7, n * 2.9, 0.3))
        for v in tb.verts:
            if v is mid:
                continue
            w = Vector((v.co.x + x, v.co.y + y, v.co.z))
            v.co.x += fbm3(w * 1.4 + off, 3) * 0.035
            v.co.y += fbm3(w * 1.4 + off + Vector((5, 0, 0)), 3) * 0.035
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        P._emit(tb, mat, xf((x, y, cz), (rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt), 0)))


def encrust(P, ob_part_verts, rnd, n, zlo, zhi, mat="rock_crust"):
    """limpet-like shells and mat patches on rock faces near the waterline (points from the finished surface)"""
    pts = [v for v in ob_part_verts if zlo < v[0].z < zhi and v[1].z > -0.3]
    rnd.shuffle(pts)
    for (co, nrm) in pts[:n]:
        r = rnd.uniform(0.025, 0.07)
        up = nrm.normalized()
        q = up.to_track_quat('Z', 'Y').to_euler()
        P.sphere(r, at=tuple(co + up * r * 0.15), rot=tuple(math.degrees(x) for x in q), mat=mat, segs=10, rings=5, scale=(1, 0.85, 0.42))


def surface_points(ob, stride=7):
    """vertex positions and normals of a finished object (world space)"""
    me = ob.data
    M = ob.matrix_world
    R = M.to_3x3()
    return [(M @ v.co, (R @ v.normal)) for i, v in enumerate(me.vertices) if i % stride == 0]


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
        if math.hypot(x - 1.5, y - 1.0) < 2.4:
            continue      # the column cluster stands here
        h = (1 - d / 7.5) * rnd.uniform(1.2, 2.6)
        s = (rnd.uniform(1.2, 3.0), rnd.uniform(1.0, 2.2), h + 0.6)
        basalt_block(P, (x, y, h * 0.5 - 0.2), s, (rnd.uniform(-14, 14), rnd.uniform(-14, 14), rnd.uniform(0, 180)), k)
    # columnar basalt: the core of the outcrop, the old lava's cooling joints
    basalt_columns(P, (1.5, 1.0, -0.2), 2.6, 0.6, 3.1, rnd, tilt=7)
    # rubble and pebbles round the foot
    for k in range(40):
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(5.5, 8.5)
        sz = rnd.uniform(0.15, 0.55)
        basalt_block(P, (d * math.cos(a), d * math.sin(a) * 0.7, sz * 0.2 - 0.1), (sz * 1.4, sz, sz * 0.7), (rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 180)), 200 + k, cuts=3, rough=0.6)
    # the notch: two leaning slabs roofing a hollow
    basalt_block(P, (-0.2, -1.2, 1.0), (3.2, 0.7, 2.2), (68, 0, 8), 101)
    basalt_block(P, (0.9, -2.4, 0.7), (0.9, 2.0, 1.6), (0, -12, 15), 102)
    ob = P.finish(sharp=50)
    # limpets and microbial crust at the waterline (the flats are about half a metre deep; the outcrop stands ~0.4 m low)
    C = Part("outcrop_crust")
    encrust(C, surface_points(ob, 5), rnd, 260, 0.05, 1.0)
    crust = C.finish(sharp=60, col=0)
    marker("nest", "notch", at=(0.2, -1.8, 0.0))
    bake_ao([ob, crust], ground_z=-0.2, local_dist=1.0, sky_dist=8)


def build_overhang():
    reset()
    rnd = random.Random(12)
    P = Part("overhang")
    # the wall behind (columns standing in it), the roof slab jutting out, rubble at the cave mouth
    basalt_block(P, (0, 2.6, 3.0), (12, 4.0, 8.0), (0, 0, 0), 1, round_=0.15, cuts=12)
    # the cave's back wall: columns standing proud of the wall block (the cave mouth in front stays open)
    basalt_columns(P, (0, 3.3, 0.0), 2.9, 2.2, 6.2, rnd, tilt=3, r=0.55)
    basalt_block(P, (0, -1.6, 4.6), (11, 6.0, 1.6), (6, 0, 0), 2, round_=0.2, cuts=12)
    # the roof's broken lip and hanging spalls
    for k in range(7):
        x = -4.5 + k * 1.5 + rnd.uniform(-0.4, 0.4)
        basalt_block(P, (x, -4.3 + rnd.uniform(-0.3, 0.3), 3.7 + rnd.uniform(-0.2, 0.2)), (1.3, 1.0, 0.9), (rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 90)), 30 + k, cuts=5)
    for k, (x, y, s) in enumerate(((-4.5, -2.0, 1.6), (4.8, -1.5, 1.9), (-2.0, -4.2, 0.9), (3.2, -4.6, 1.1), (5.6, -3.4, 1.3))):
        basalt_block(P, (x, y, s * 0.4), (s * 1.4, s, s), (k * 20, k * 13, k * 37), 10 + k)
    for k in range(30):
        a = rnd.uniform(-2.6, -0.5)
        d = rnd.uniform(2.5, 6.5)
        sz = rnd.uniform(0.15, 0.6)
        basalt_block(P, (d * math.cos(a) * 1.4, d * math.sin(a), sz * 0.2 - 0.1), (sz * 1.4, sz, sz * 0.7), (rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 180)), 300 + k, cuts=3, rough=0.6)
    for k, x in enumerate((-4.0, 4.2)):
        basalt_block(P, (x, -1.4, 1.9), (1.6, 1.6, 4.0), (0, 0, k * 30), 20 + k)
    ob = P.finish(sharp=50)
    C = Part("overhang_crust")
    encrust(C, surface_points(ob, 4), rnd, 260, -1.0, 9.0, mat="rock_crust")
    crust = C.finish(sharp=60, col=0)
    marker("den", "mouth", at=(0, -1.0, 1.6))
    bake_ao([ob, crust], ground_z=0.0, local_dist=1.5, sky_dist=10)


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


def build_darter():
    """a slender, laterally flattened forager ~22 cm long, front at +Y: big eyes for the dim canyon, a low dorsal
    ridge, broad pectoral paddles and a two-lobed tail; mirrored flanks with a dark stripe for school cohesion"""
    reset()
    P = Part("darter")
    pts = [Vector((0, 0.11 - i * 0.22 / 6, 0.0015 * math.sin(i * 0.8))) for i in range(7)]
    prof = [(0, (0.002, 0.003, 0.003, 2.2, 0)), (0.07, (0.0075, 0.011, 0.01, 2.2, 0)), (0.25, (0.0105, 0.019, 0.017, 2.3, 0.001)),
            (0.5, (0.009, 0.016, 0.014, 2.3, 0.001)), (0.78, (0.005, 0.008, 0.007, 2.2, 0)), (0.92, (0.0025, 0.004, 0.0035, 2.1, 0)),
            (1, (0.0015, 0.0022, 0.002, 2, 0))]

    def stripe(t, a, p, T, L, N):
        # a shallow groove along each flank (the dark school stripe)
        c, sn = math.cos(a), math.sin(a)
        g = math.exp(-((sn - 0.05) / 0.12) ** 2) * 0.0007 * math.sin(math.pi * min(1.0, t * 1.25))
        return p - L * (math.copysign(g, c))
    body(P, pts, prof, "darter_skin", "darter_belly", segs=18, n=30, tile=0.05, warp=stripe)
    for side in (-1, 1):
        eye(P, (side * 0.0078, 0.086, 0.004), 0.0046)
    Fn = Part("darter_fins")
    for sgn in (1, -1):
        sheet(Fn, (0, -0.088, 0.0), (0, -0.104, 0.0), (0, -0.128, 0.032 * sgn), (0, -0.146, 0.026 * sgn), "darter_fin", nu=6, nv=6, thick=0.0008,
              round_tip=0.45, normal=(1, 0, 0), edge=lambda u, v: 0.0008 * math.sin(u * 20) * v)
    sheet(Fn, (0, 0.045, 0.018), (0, -0.055, 0.012), (0, 0.005, 0.031), (0, -0.075, 0.021), "darter_fin", nu=10, nv=4, thick=0.0008, round_tip=0.3,
          normal=(1, 0, 0), edge=lambda u, v: 0.0006 * math.sin(u * 30) * v)
    sheet(Fn, (0, -0.02, -0.014), (0, -0.07, -0.009), (0, -0.04, -0.026), (0, -0.08, -0.018), "darter_fin", nu=6, nv=4, thick=0.0008, round_tip=0.3, normal=(1, 0, 0))
    for side in (-1, 1):
        r = Vector((side * 0.0085, 0.062, -0.006))
        t = Vector((side * 0.032, 0.036, -0.016))
        sheet(Fn, r + Vector((0, 0.008, 0)), r - Vector((0, 0.008, 0)), t + Vector((0, 0.004, 0)), t - Vector((0, 0.01, 0)), "darter_fin", nu=5, nv=5,
              thick=0.0008, round_tip=0.45, normal=(0, 0, 1))
    P.finish(sharp=70, col=0)
    Fn.finish(sharp=70, col=0)


def build_sub():
    reset()
    P = Part("sub_frame")
    Y = "paint_yellow"
    # frame: two longitudinal skids and hoops round the pressure sphere
    for s in (-1, 1):
        tube(P, [(s * 0.9, 1.6, 0.25), (s * 0.95, 0.0, 0.1), (s * 0.9, -1.7, 0.25)], [(0, 0.06), (1, 0.06)], "metal_dark", segs=8, n=10)
        # the hoops stand behind the pilot's sphere so the view ahead is clear
        for y in (-0.2, -1.25):
            tube(P, [(s * 0.95, y, 0.12), (s * 1.05, y, 0.9), (s * 0.75, y, 1.8)], [(0, 0.05), (1, 0.05)], Y, segs=8, n=8)
    for y in (-0.2, -1.25):
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
    # lamp bar across the front of the skids, below the sphere; camera pods, manipulator arm folded
    tube(P, [(-1.0, 1.62, 0.42), (1.0, 1.62, 0.42)], [(0, 0.05), (1, 0.05)], "metal_dark", segs=8, n=4)
    for x in (-0.85, -0.3, 0.3, 0.85):
        P.cyl(0.11, 0.16, at=(x, 1.7, 0.42), rot=(90 - 8, 0, 0), mat="metal_dark", segs=14, bevel=0.02)
        P.cyl(0.085, 0.02, at=(x, 1.785, 0.43), rot=(90 - 8, 0, 0), mat="emit_white", segs=14, bevel=0)
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
        # LED lamps of a work-class vehicle (~15,000 lm each): the canyon is dark below ~150 m
        light(f"sub_lamp{i}", (x, 1.84, 0.44), color=(0.92, 0.96, 1.0), power=600, dist=60, kind="spot", rot=(90 - 8, 0, 0), angle=0.42, room="lamps")
    # the instrument glow inside the sphere
    light("sub_cabin", (0, 0.7, 1.2), color=(1.0, 0.8, 0.55), power=5, dist=4, room="cabin")
    bake_ao([frame, inside], ground_z=0.0, local_dist=0.6, sky_dist=4)


ALL = {"miller_outcrop": build_outcrop, "rift_overhang": build_overhang, "rift_vents": build_vents, "egg_clutch": build_clutch,
       "nest_stone": build_stone, "rift_darter": build_darter, "minisub": build_sub}

if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    views = {"miller_outcrop": ((14, -14, 8), (0, 0, 1)), "rift_overhang": ((10, -16, 6), (0, 0, 3)), "rift_vents": ((10, -12, 6), (0, 0, 2.5)),
             "egg_clutch": ((0.8, -0.8, 0.6), (0, 0, 0.1)), "nest_stone": ((0.5, -0.5, 0.4), (0, 0, 0)), "rift_darter": ((0.25, 0.12, 0.08), (0, -0.01, 0)), "minisub": ((4.5, 4.5, 3.0), (0, 0, 1.0))}
    for name, fn in ALL.items():
        if only and name not in only:
            continue
        fn()
        if pv:
            e, t = views[name]
            preview(name, e, t, res=(800, 520), lens=35, samples=32)
        export_glb(name)
