"""The Lazarus missions' sites: the one-way survey lander, Dr. Miller's wreck and flight recorder, Dr. Mann's shelter
(walk-in, cryo casket, survey robot) and Edmunds' camp.

  lazarus_lander.glb   the survey lander: a low, dark, faceted hull on four short legs, flood lamps under the belly,
                       a cockpit strip at the front, a side hatch with a ladder. ~7 x 5 m, 3.2 m tall.
  miller_wreck.glb     Dr. Miller's lander broken by the waves: the hull on its side in knee-deep water, the roof torn
                       away and lying apart, legs snapped, panels strewn downstream; the flight recorder (an orange
                       armoured cylinder with a strobe) as its own node ('pickup:recorder').
  mann_shelter.glb     a barrel vault of telescoping orange ribs ending in a dark rear shell, half buried in grey ice
                       dust (after the reference photos); a sliding airlock door; inside, a white panelled room: ceiling
                       panels with light strips and cable trays, padded bags slung overhead, stacked storage crates,
                       the boxy cryo casket with a frosted lid that opens ('lid:cryo'), a cot, the work desk with
                       Mann's log ('log:mann').
  survey_robot.glb     Mann's survey robot, an original design: a low four-legged walker with a sensor mast, folded
                       and powered down; its data core ('core:robot').
  edmunds_base.glb     Edmunds' camp (after the reference photos): two long white inflatable tents with rib seams
                       (quarters and greenhouse, both walk-in), a flag, a storage container on stilts, a six-wheeled
                       rover, crates, lamp posts, a small cone tent, solar panels, the beacon mast, boulder piles of
                       rounded granite; the data log ('log:edmunds'), the planting racks ('seeds:edmunds') and the
                       cairn the player builds ('cairn:edmunds', hidden until then).

Blender: +Y forward, +Z up, metres.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

TAU = math.tau


def clamp(v, a, b):
    return a if v < a else b if v > b else v


# ----------------------------------------------------------------------------------------------- shared helpers
def octo(w, d, c, z):
    """chamfered rectangle (8 points) in plan at height z"""
    hw, hd = w / 2, d / 2
    pts = [(hw, -hd + c), (hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c), (-hw + c, -hd), (hw - c, -hd)]
    return [(x, y, z) for x, y in pts]


def boulder(P, at, r, scale=(1, 1, 1), rot=(0, 0, 0), seed=0, mat="boulder", segs=14, rings=9):
    """a weathered, rounded boulder: a uv sphere pushed about by low-frequency noise, its underside flattened"""
    tb = bmesh.new()
    bmesh.ops.create_uvsphere(tb, u_segments=segs, v_segments=rings, radius=r)
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.93))
    for v in tb.verts:
        n = v.co.normalized()
        d = noise.noise(n * 1.3 + off) * 0.22 + noise.noise(n * 3.1 + off * 1.7) * 0.07
        v.co = n * r * (1.0 + d)
        if v.co.z < -0.55 * r:
            v.co.z = -0.55 * r + (v.co.z + 0.55 * r) * 0.3
    P._emit(tb, mat, xf(at, rot, scale))


def ellipse_arc(a, b, n=28):
    return [(a * math.cos(math.pi * i / n), b * math.sin(math.pi * i / n)) for i in range(n + 1)]


def arch_band(P, a, b, t, y0, length, mat, n=28):
    """a thick arch (half-ellipse band, semi-axes a x b, wall t) extruded along +Y from y0"""
    outer = ellipse_arc(a, b, n)
    inner = list(reversed(ellipse_arc(a - t, b - t, n)))
    P.prism(outer + inner, length, at=(0, y0, 0), plane="XZ", mat=mat, bevel=0.02)


def superellipse_arc(hw, h, e=0.32, n=30):
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append((hw * math.copysign(abs(c) ** e, c), h * abs(s) ** e))
    return pts


def ground_preview(name, eye, target, mat="sand", size=140, lamps=0.0, **kw):
    """preview render with a temporary ground slab (and, for interiors, point lamps at the light markers)"""
    G = Part("preview_ground")
    G.box((size, size, 0.2), at=(0, 0, -0.1), mat=mat, bevel=0)
    tmp = [G.finish()]
    if lamps > 0:
        for o in list(bpy.context.scene.objects):
            if o.get("kind") != "light":
                continue
            ld = bpy.data.lights.new("pl", "POINT")
            ld.energy = float(o.get("power", 30)) * lamps
            ld.color = tuple(o.get("color", (1, 1, 1)))[:3]
            ld.shadow_soft_size = 0.2
            lo = bpy.data.objects.new("pl", ld)
            bpy.context.scene.collection.objects.link(lo)
            lo.location = o.matrix_world.translation
            tmp.append(lo)
    preview(name, eye, target, **kw)
    for o in tmp:
        bpy.data.objects.remove(o)


# ----------------------------------------------------------------------------------------------- lander
RINGS = [(4.2, 5.8, 1.0, 0.85), (4.9, 6.9, 1.25, 1.35), (4.7, 6.7, 1.15, 2.55), (3.0, 4.9, 0.8, 3.2)]


def lander_hull(P, M=Matrix.Identity(4), broken=False):
    """the hull (front +Y): faceted body, belly, cockpit strip, seams, hatch, engines, lamps"""
    rings = [octo(w, d, c, z) for w, d, c, z in RINGS]
    if broken:
        # roof torn away: the open shell, and its dark inside
        P.loft(rings[:3], M=M, mat="hull_black", cap_a=True, cap_b=False, bevel=0.03)
        inner = [octo(w - 0.25, d - 0.25, c, z + (0.08 if i == 0 else 0)) for i, (w, d, c, z) in enumerate(RINGS[:3])]
        P.loft(inner, M=M, mat="metal_black", cap_a=True, cap_b=False, bevel=0, flip=True)
    else:
        P.loft(rings, M=M, mat="hull_black", cap_a=True, cap_b=True, bevel=0.03)
    # belly: engine bay and four throttleable engines
    P.box((3.2, 4.4, 0.25), M=M @ xf((0, 0, 0.75)), mat="metal_dark", bevel=0.04)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl(0.3, 0.42, M=M @ xf((sx * 0.9, sy * 1.3, 0.47)), mat="engine_dark", segs=16, r2=0.18, bevel=0.01)
    # cockpit strip on the front chamfer, seams, panel lines
    if not broken:
        for k in (-1, 0, 1):
            P.box((0.9, 0.05, 0.42), M=M @ xf((k * 0.95, 3.12, 2.86), (-38, 0, 0)), mat="glass_dark", bevel=0.02)
    for z in (1.42, 2.48):
        for s in (-1, 1):
            P.box((0.04, 4.0, 0.05), M=M @ xf((s * 2.43, 0, z)), mat="metal_gunmetal", bevel=0)
    for y in (-1.9, -0.6, 0.7, 2.0):
        for s in (-1, 1):
            P.box((0.04, 0.05, 1.0), M=M @ xf((s * 2.43, y, 1.95)), mat="metal_gunmetal", bevel=0)
    # side hatch (-X) with a ladder to the ground
    P.box((0.08, 1.1, 1.3), M=M @ xf((-2.44, -0.4, 1.95)), mat="metal_gunmetal", bevel=0.03)
    P.box((0.06, 0.12, 0.3), M=M @ xf((-2.5, 0.0, 1.95)), mat="handle_yellow", bevel=0.01)
    for z in (0.35, 0.75, 1.15):
        P.box((0.05, 0.7, 0.05), M=M @ xf((-2.75, -0.4, z)), mat="metal_steel", bevel=0)
    for s in (-1, 1):
        P.pipe([M @ Vector((-2.75, -0.4 + s * 0.35, 0.05)), M @ Vector((-2.5, -0.4 + s * 0.35, 1.38))], 0.03, mat="metal_steel", segs=6)
    # RCS quads, roof mast and dish
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((0.3, 0.3, 0.25), M=M @ xf((sx * 2.25, sy * 3.0, 2.2)), mat="metal_dark", bevel=0.03)
    if not broken:
        P.cyl(0.05, 0.9, M=M @ xf((0.8, -1.2, 3.6)), mat="metal_steel", segs=8)
        P.cyl(0.45, 0.1, M=M @ xf((0.8, -1.2, 4.1), (55, 0, 20)), mat="paint_white", segs=20, r2=0.05, bevel=0.01)
    # flood lamps under the belly
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((0.3, 0.18, 0.06), M=M @ xf((sx * 1.7, sy * 2.6, 0.84)), mat="glass_dark", bevel=0.01)


def lander_legs(P, M=Matrix.Identity(4), snapped=()):
    for k, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        top = Vector((sx * 2.1, sy * 2.7, 1.2))
        foot = Vector((sx * 2.9, sy * 3.6, 0.1))
        if k in snapped:
            foot = top + (foot - top) * 0.4
        P.pipe([M @ top, M @ foot], 0.1, mat="metal_steel", segs=8)
        P.pipe([M @ Vector((sx * 1.5, sy * 2.4, 0.9)), M @ (top + (foot - top) * 0.55)], 0.06, mat="metal_steel", segs=8)
        if k not in snapped:
            P.cyl(0.38, 0.1, M=M @ xf(tuple(foot)), mat="metal_dark", segs=16, bevel=0.03)


def build_lander():
    reset()
    P = Part("lander")
    lander_hull(P)
    lander_legs(P)
    ob = P.finish(sharp=35)
    marker("lander", "lazarus", at=(0, 0, 0), height=3.2, label="Lazarus lander")
    for sx in (-1, 1):
        for sy in (-1, 1):
            light(f"lander_{sx}_{sy}", (sx * 1.7, sy * 2.6, 0.6), color=(1.0, 0.86, 0.62), power=40, dist=14, room="lander")
    light("lander_beacon", (0.8, -1.2, 4.3), color=(1.0, 0.25, 0.15), power=10, dist=10, room="lander")
    bake_ao([ob], ground_z=0.0, local_dist=1.2, sky_dist=10)
    return [ob]


# ----------------------------------------------------------------------------------------------- Miller's wreck
def build_wreck():
    reset()
    rnd = random.Random(7)
    # the hull rolled onto its side and pushed into the sea floor, the roof torn off
    P = Part("wreck_hull")
    M = xf((0, 0, 1.0), (0, 74, 21)) @ xf((0, 0, -2.0))
    lander_hull(P, M, broken=True)
    lander_legs(P, M, snapped=(0, 1, 3))
    # the torn top edge: buckled plates bent outward
    for k in range(10):
        u = -3.0 + k * 0.66
        p = M @ Vector((rnd.choice((-1, 1)) * rnd.uniform(1.6, 2.3), u, 2.55))
        P.box((rnd.uniform(0.5, 1.0), 0.05, rnd.uniform(0.35, 0.7)), M=xf(tuple(p), (rnd.uniform(-60, 60), rnd.uniform(-40, 40), rnd.uniform(0, 180))), mat=rnd.choice(["hull_black", "metal_dark", "hull_black"]), bevel=0.01)
    ob = P.finish(sharp=40)
    # the roof section lying apart, upside down
    R = Part("wreck_roof")
    Mr = xf((-8.0, 5.5, 0.55), (172, 8, 35)) @ xf((0, 0, -2.85))
    R.loft([octo(4.7, 6.7, 1.15, 2.55), octo(3.0, 4.9, 0.8, 3.2)], M=Mr, mat="hull_black", cap_a=True, cap_b=True, bevel=0.03)
    R.cyl(0.05, 0.9, M=Mr @ xf((0.8, -1.2, 3.6)), mat="metal_steel", segs=8)
    roof = R.finish(sharp=40)
    # panels, struts and pieces strewn downstream (+X, the waves' way); low enough to wade through
    D = Part("wreck_debris")
    for k in range(30):
        a = rnd.uniform(-1.1, 1.1)
        d = rnd.uniform(4, 40)
        x, y = d * math.cos(a), d * math.sin(a)
        w = rnd.uniform(0.3, 1.5)
        flat = k % 3 != 0
        D.box((w, rnd.uniform(0.04, 0.1), w * rnd.uniform(0.4, 1.0)), at=(x, y, 0.05 if flat else w * 0.25), rot=(rnd.uniform(-80, -100) if flat else rnd.uniform(-25, 25), rnd.uniform(-15, 15), rnd.uniform(0, 360)), mat=rnd.choice(["hull_black", "hull_black", "metal_dark", "metal_gunmetal", "radiator"]), bevel=0.01)
    for k in range(6):
        a = rnd.uniform(-1.2, 1.2)
        d = rnd.uniform(5, 24)
        x, y = d * math.cos(a), d * math.sin(a)
        D.pipe([Vector((x, y, 0.08)), Vector((x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2), 0.12))], 0.07, mat="metal_steel", segs=6)
    deb = D.finish(sharp=40, col=0)
    # the flight recorder: an orange armoured cylinder, banded, with its whip antenna and strobe
    C = Part("recorder")
    C.cyl(0.24, 0.62, at=(0, 0, 0.24), rot=(90, 0, 0), mat="paint_orange", segs=20, bevel=0.03)
    for y in (-0.22, 0.22):
        C.cyl(0.26, 0.06, at=(0, y, 0.24), rot=(90, 0, 0), mat="metal_dark", segs=20, bevel=0.01)
    C.box((0.12, 0.3, 0.05), at=(0, 0, 0.49), mat="metal_dark", bevel=0.01)
    C.cyl(0.012, 1.1, at=(0, 0.1, 1.0), mat="metal_steel", segs=6)
    C.sphere(0.04, at=(0, 0.1, 1.56), mat="emit_red", segs=10, rings=6)
    rec = C.finish(sharp=40, at=(5.0, -3.2, 0.0), rot=(0, 0, 30), kind="pickup", id="recorder", dynamic=1, col=0, label="Dr. Miller's flight recorder")
    light("recorder_strobe", (5.0, -3.1, 1.75), color=(1.0, 0.25, 0.1), power=12, dist=16, room="recorder")
    bake_ao([ob, roof, deb, rec], ground_z=0.0, local_dist=1.2, sky_dist=10)
    return [ob, roof, deb, rec]


# ----------------------------------------------------------------------------------------------- Mann's shelter
# arch segments from the door (-Y) back: (a, b, y0, y1); each overlaps the one before it and is a size larger
SEGS = [(3.4, 4.0, -10.0, -8.4), (3.6, 4.2, -8.6, -6.8), (3.8, 4.4, -7.0, -5.0), (4.0, 4.6, -5.2, -3.0), (4.2, 4.8, -3.2, -0.8), (4.4, 5.0, -1.0, 1.4)]
DARK = (4.75, 5.35, 1.2, 7.6)
TAIL = 2.6
RX, RY0, RY1, RZ0, RZ1 = 1.95, -9.7, 7.4, 0.3, 2.95


def shelter_drift(x, y):
    """grey ice dust drifted against the vault: deep on the windward (+X) side and over the tail, clear at the door"""
    tail = DARK[3]
    ay = 0.0
    for a_, b_, y0_, y1_ in SEGS + [DARK]:
        if y0_ <= y <= y1_:
            ay = max(ay, a_)
    if tail < y < tail + TAIL:
        ay = DARK[0] * math.sqrt(max(0.0, 1 - ((y - tail) / TAIL) ** 2))
    inside = abs(x) < ay
    ramp = clamp((y + 12.0) / 7.0, 0.0, 1.0)
    edge = (2.5 if x > 0 else 1.9) * ramp
    if not inside:
        if -10.0 <= y <= tail + TAIL:
            d = abs(x) - ay
        elif y > tail + TAIL:
            d = math.hypot(abs(x), y - tail - TAIL) * 0.6
        else:
            d = math.hypot(max(0.0, abs(x) - SEGS[0][0]), -10.0 - y)
        h = edge * math.exp(-max(0.0, d) / (6.0 if x > 0 else 3.5))
        h += 2.8 * math.exp(-(((y - tail - 2.0) / 5.0) ** 2) - (x / 7.5) ** 2)
    else:
        # under the vault the dust slopes down to below the room's floor
        k = clamp((abs(x) - (RX + 0.15)) / max(0.3, ay - RX - 0.15), 0.0, 1.0) if y < RY1 + 0.3 else 1.0
        h = edge * k * k - 0.3 * (1 - k)
        if y >= RY1 + 0.3:
            h += 2.8 * math.exp(-(((y - tail - 2.0) / 5.0) ** 2) - (x / 7.5) ** 2)
    if y < -9.0:
        h *= 1 - math.exp(-((x / 2.4) ** 2))
    h += noise.noise(Vector((x / 4.0, y / 4.0, 0.3))) * 0.25 + noise.noise(Vector((x / 1.3, y / 1.3, 2.1))) * 0.06
    f = clamp(min(26.0 - abs(x), y + 27.0, 31.0 - y) / 6.0, 0.0, 1.0)
    return -0.25 + h * f - 0.3 * (1 - f)


def build_shelter():
    reset()
    rnd = random.Random(3)
    S = Part("shelter_shell")
    for a, b, y0, y1 in SEGS:
        arch_band(S, a, b, 0.22, y0, y1 - y0, "mann_orange")
        # the lip of each rib, standing proud
        arch_band(S, a + 0.07, b + 0.07, 0.2, y1 - 0.32, 0.32, "mann_orange")
        # panel seams across the vault
        for t in (0.55, 0.95, 1.35, 1.75, 2.15, 2.6):
            x, z = (a + 0.005) * math.cos(t), (b + 0.005) * math.sin(t)
            S.box((0.05, y1 - y0 - 0.4, 0.05), at=(x, (y0 + y1) / 2 - 0.1, z), mat="paint_red_faded", bevel=0)
    a, b, y0, y1 = DARK
    arch_band(S, a, b, 0.25, y0, y1 - y0, "paint_gray_dark")
    # the rounded tail: a quarter-ellipse profile swept over +Y, squashed to TAIL metres
    S.lathe([(a * math.cos(t), b * math.sin(t)) for t in [math.pi / 2 * i / 14 for i in range(15)]], M=xf((0, y1, 0), (0, 0, 0), (1, TAIL / a, 1)), mat="paint_gray_dark", segs=32, sweep=180.0, bevel=0)
    for s in (-1, 1):
        for z in (1.4, 2.3):
            S.box((0.14, 1.5, 0.55), at=(s * (a * math.sqrt(1 - (z / b) ** 2) + 0.03), 3.4, z), rot=(0, s * -20, 0), mat="grating", bevel=0.01)
        for q in range(3):
            S.cyl(0.32, 0.12, at=(s * (a * math.sqrt(1 - (3.4 / b) ** 2) + 0.02), 5.0 + q * 0.8, 3.4), rot=(0, 90 - s * 40, 0), mat="metal_dark", segs=16, bevel=0.01)
    # the front wall with the doorway, recessed frame, grilles, porch
    a0, b0 = SEGS[0][0], SEGS[0][1]
    wall = ellipse_arc(a0 - 0.02, b0 - 0.02, 32)
    door = [(-0.7, 0.3), (0.7, 0.3), (0.7, 2.5), (-0.7, 2.5)]
    S.prism(wall, 0.3, at=(0, -10.0, 0), plane="XZ", holes=[list(reversed(door))], mat="paint_gray_dark", bevel=0.02)
    for x in (-0.82, 0.82):
        S.box((0.24, 0.5, 2.45), at=(x, -10.1, 1.5), mat="metal_dark", bevel=0.02)
    S.box((1.88, 0.5, 0.26), at=(0, -10.1, 2.66), mat="metal_dark", bevel=0.02)
    for x in (-2.0, 2.0):
        S.box((1.0, 0.06, 1.2), at=(x, -10.03, 1.6), mat="metal_dark", bevel=0.01)
        S.box((0.9, 0.06, 1.1), at=(x, -10.07, 1.6), mat="grating", bevel=0.0)
    S.box((2.4, 1.4, 0.15), at=(0, -10.8, 0.075), mat="tread_plate", bevel=0.02)
    S.box((2.4, 0.5, 0.15), at=(0, -10.35, 0.225), mat="tread_plate", bevel=0.02)
    # the antenna mast with a small dish, a lamp over the door
    S.cyl(0.09, 6.0, at=(-3.0, 4.0, 7.2), mat="metal_steel", segs=8)
    S.cyl(0.7, 0.12, at=(-3.0, 4.0, 10.1), rot=(65, 0, 30), mat="paint_white", segs=24, r2=0.06, bevel=0.01)
    S.box((0.4, 0.25, 0.15), at=(0, -10.3, 2.95), mat="metal_dark", bevel=0.02)
    S.box((0.32, 0.05, 0.08), at=(0, -10.43, 2.9), mat="emit_warm", bevel=0.01)
    shell = S.finish(sharp=40)

    N = Part("shelter_drift")
    N.grid(52, 58, 78, 86, at=(0, 2, 0), mat="ice_dust", hfn=lambda x, y: shelter_drift(x, y + 2))
    dust = N.finish(sharp=60)

    # the room inside: grated floor, white panelled walls, ceiling panels with strips, trays, bags, crates
    I = Part("shelter_room")
    L = RY1 - RY0
    yc = (RY0 + RY1) / 2
    I.box((2 * RX, L, 0.12), at=(0, yc, RZ0 - 0.06), mat="deck_grid", bevel=0)
    for s in (-1, 1):
        I.box((0.1, L, RZ1 - RZ0), at=(s * (RX + 0.05), yc, (RZ0 + RZ1) / 2), mat="paint_white", bevel=0)
        I.box((0.06, L, 0.12), at=(s * (RX - 0.03), yc, RZ0 + 0.06), mat="metal_dark", bevel=0)
    I.box((2 * RX + 0.2, L, 0.1), at=(0, yc, RZ1 + 0.05), mat="ceiling", bevel=0)
    I.box((2 * RX + 0.2, 0.1, RZ1 - RZ0 + 0.1), at=(0, RY1 + 0.05, (RZ0 + RZ1) / 2), mat="paint_white", bevel=0)
    for s in (-1, 1):
        I.box((RX - 0.7, 0.06, RZ1 - RZ0), at=(s * (0.7 + (RX - 0.7) / 2), RY0 + 0.03, (RZ0 + RZ1) / 2), mat="paint_white", bevel=0)
    I.box((1.4, 0.06, RZ1 - 2.5), at=(0, RY0 + 0.03, (2.5 + RZ1) / 2), mat="paint_white", bevel=0)
    # ceiling: beams, light strips, cable trays, vent boxes, padded bags slung along both sides
    y = RY0 + 0.6
    k = 0
    while y < RY1 - 0.3:
        I.box((2 * RX, 0.1, 0.14), at=(0, y, RZ1 - 0.07), mat="metal_dark", bevel=0.01)
        if k % 2 == 0 and y + 1.2 < RY1:
            for s in (-1, 1):
                I.box((0.16, 1.0, 0.05), at=(s * 0.7, y + 0.6, RZ1 - 0.03), mat="emit_white", bevel=0.01)
        y += 1.2
        k += 1
    for s in (-1, 1):
        I.box((0.3, L - 0.4, 0.06), at=(s * 1.5, yc, RZ1 - 0.17), mat="grating", bevel=0)
        for q in range(6):
            yy = RY0 + 1.6 + q * 2.6 + rnd.uniform(-0.3, 0.3)
            I.sphere(0.42, at=(s * 1.45, yy, RZ1 - 0.4), mat="padding_light", segs=14, rings=8, scale=(0.7, 1.3, 0.48))
    for y in (-6.0, 0.0, 5.0):
        I.box((0.6, 0.5, 0.2), at=(0.0, y, RZ1 - 0.1), mat="paint_gray", bevel=0.02)
        I.box((0.5, 0.4, 0.02), at=(0.0, y, RZ1 - 0.21), mat="grating", bevel=0)

    def crate(x, y, z, w, d, h):
        I.box((w, d, h), at=(x, y, z + h / 2), mat="plastic_white", bevel=0.025)
        for sx in (-1, 1):
            I.box((0.02, d * 0.35, 0.06), at=(x + sx * (w / 2 + 0.005), y, z + h * 0.7), mat="metal_dark", bevel=0)
    for y in (-8.6, -7.8, -7.0, 2.4, 3.2, 4.0, 4.8):
        z = RZ0
        for lvl in range(rnd.choice((3, 4))):
            h = rnd.choice((0.45, 0.55, 0.6))
            crate(-RX + 0.38, y + rnd.uniform(-0.03, 0.03), z, 0.7, 0.75, h)
            z += h + 0.01
    for y in (-8.4, -7.6, 5.6, 6.4):
        z = RZ0
        for lvl in range(3):
            crate(RX - 0.38, y, z, 0.7, 0.75, 0.55)
            z += 0.56
    # the cot and the desk with Mann's log
    I.box((0.8, 2.0, 0.08), at=(-RX + 0.45, -3.6, RZ0 + 0.45), mat="metal_dark", bevel=0.01)
    I.box((0.74, 1.9, 0.14), at=(-RX + 0.45, -3.6, RZ0 + 0.56), mat="canvas_olive", bevel=0.04)
    for sy in (-1, 1):
        for sx in (-1, 1):
            I.box((0.04, 0.04, 0.45), at=(-RX + 0.45 + sx * 0.35, -3.6 + sy * 0.95, RZ0 + 0.22), mat="metal_dark", bevel=0)
    I.box((0.8, 1.8, 0.06), at=(RX - 0.45, 3.3, RZ0 + 0.76), mat="metal_dark", bevel=0.01)
    for sy in (-1, 1):
        I.box((0.7, 0.05, 0.74), at=(RX - 0.45, 3.3 + sy * 0.85, RZ0 + 0.37), mat="metal_dark", bevel=0)
    I.box((0.06, 0.8, 0.5), at=(RX - 0.12, 3.3, RZ0 + 1.15), rot=(0, -12, 0), mat="screen", bevel=0.01)
    I.box((0.3, 0.5, 0.03), at=(RX - 0.5, 3.3, RZ0 + 0.8), mat="plastic_dark", bevel=0.005)
    # the cryo casket: a white tub on a dark plinth, handle recesses, a control panel at the head
    cx, cy = 0.35, -1.0
    I.box((1.1, 2.45, 0.32), at=(cx, cy, RZ0 + 0.16), mat="paint_gray_dark", bevel=0.03)
    tz0, tz1 = RZ0 + 0.32, RZ0 + 0.95
    I.box((0.98, 2.3, 0.08), at=(cx, cy, tz0 + 0.04), mat="paint_white", bevel=0.02)
    for s in (-1, 1):
        I.box((0.08, 2.3, tz1 - tz0), at=(cx + s * 0.45, cy, (tz0 + tz1) / 2), mat="paint_white", bevel=0.03)
        I.box((0.98, 0.08, tz1 - tz0), at=(cx, cy + s * 1.11, (tz0 + tz1) / 2), mat="paint_white", bevel=0.03)
        for q in (-0.6, 0.4):
            I.box((0.02, 0.32, 0.08), at=(cx + s * 0.495, cy + q, tz0 + 0.42), mat="metal_dark", bevel=0)
    I.box((0.86, 2.14, 0.06), at=(cx, cy, tz0 + 0.11), mat="padding_light", bevel=0.02)
    I.box((0.6, 0.06, 0.35), at=(cx, cy - 1.17, tz0 + 0.38), mat="metal_dark", bevel=0.01)
    I.box((0.42, 0.02, 0.18), at=(cx, cy - 1.205, tz0 + 0.42), mat="screen", bevel=0)
    room = I.finish(sharp=40)

    # the lid: hinged along the casket's +X side, frosted on top, a small viewing window at the head
    Ld = Part("cryo_lid")
    Ld.box((0.98, 2.3, 0.12), at=(-0.49, 0, 0.06), mat="paint_white", bevel=0.03)
    Ld.box((0.4, 0.5, 0.02), at=(-0.49, -0.75, 0.125), mat="glass_dirty", bevel=0)
    for q in range(9):
        Ld.sphere(rnd.uniform(0.12, 0.3), at=(-0.49 + rnd.uniform(-0.33, 0.33), rnd.uniform(-1.0, 1.0), 0.12), mat="snow", segs=10, rings=5, scale=(1.3, 1.6, 0.12))
    lid = Ld.finish(sharp=40, at=(cx + 0.49, cy, tz1), kind="lid", id="cryo", dynamic=1, col=0)

    # the sliding airlock door (opens as someone comes near)
    Dr = Part("shelter_door")
    Dr.box((1.44, 0.1, 2.22), at=(0, 0, 1.11), mat="paint_gray_dark", bevel=0.02)
    for z in (0.5, 1.7):
        Dr.box((1.3, 0.13, 0.08), at=(0, 0, z), mat="metal_dark", bevel=0.01)
    Dr.box((0.06, 0.15, 0.3), at=(-0.55, 0, 1.1), mat="handle_yellow", bevel=0.01)
    door_ob = Dr.finish(sharp=40, at=(0, -9.85, 0.3))
    props(door_ob, kind="slide", id="shelter", part="slide_shelter", travel=1.45, dynamic=1, col=0, label="Airlock door", w=1.44, h=2.22, t=0.1, auto=2.0, time=1.6, sound="hatch")

    marker("cryo", "mann", at=(cx, cy, tz0 + 0.17), label="Cryo casket")
    marker("log", "mann", at=(RX - 0.3, 3.3, RZ0 + 1.15), label="Dr. Mann's log")
    marker("spawn", "inside", at=(0, -8.4, RZ0))
    marker("robot", "spot", at=(-0.6, 6.4, RZ0), rot=(0, 0, 200))
    for i, y in enumerate((-8.0, -4.6, -1.2, 2.2, 5.6)):
        light(f"shelter_{i}", (0, y, RZ1 - 0.3), color=(0.95, 0.97, 1.0), power=26, dist=6.5, room="shelter")
    light("shelter_door", (0, -10.6, 2.7), color=(1.0, 0.9, 0.7), power=20, dist=9, room="shelter")
    bake_ao([shell, dust, room], ground_z=0.0, local_dist=1.2, sky_dist=14)
    return [shell, dust, room, lid, door_ob]


def build_robot():
    reset()
    P = Part("robot")
    # a low flat chassis on four jointed legs, folded down; a sensor mast; a power cell and the data core behind
    P.box((1.5, 1.0, 0.42), at=(0, 0, 0.5), mat="paint_gray_dark", bevel=0.07)
    P.box((1.2, 0.8, 0.16), at=(0, 0, 0.79), mat="hull_gray", bevel=0.04)
    for s in (-1, 1):
        P.box((1.3, 0.05, 0.12), at=(0, s * 0.52, 0.55), mat="handle_yellow", bevel=0.01)
    P.box((0.36, 0.5, 0.3), at=(-0.62, 0, 0.92), mat="metal_dark", bevel=0.03)
    for k in range(5):
        P.box((0.02, 0.48, 0.24), at=(-0.78 + k * 0.08, 0, 0.92), mat="radiator", bevel=0)
    P.box((0.32, 0.36, 0.14), at=(-0.15, 0, 0.94), mat="paint_orange", bevel=0.02)
    P.cyl(0.05, 0.75, at=(0.45, 0, 1.25), mat="metal_steel", segs=8)
    P.box((0.34, 0.22, 0.18), at=(0.45, 0, 1.7), mat="paint_gray", bevel=0.04)
    for s in (-1, 1):
        P.cyl(0.045, 0.05, at=(0.63, s * 0.06, 1.71), rot=(0, 90, 0), mat="glass_dark", segs=12)
    P.cyl(0.008, 0.6, at=(0.35, 0.08, 2.05), mat="metal_steel", segs=4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            hip = Vector((sx * 0.62, sy * 0.46, 0.45))
            knee = hip + Vector((sx * 0.3, sy * 0.38, 0.22))
            foot = knee + Vector((sx * 0.12, sy * 0.22, -0.62))
            P.pipe([hip, knee], 0.065, mat="metal_dark", segs=8)
            P.pipe([knee, foot], 0.055, mat="metal_dark", segs=8)
            P.sphere(0.085, at=tuple(knee), mat="metal_steel", segs=10, rings=6)
            P.cyl(0.11, 0.05, at=tuple(foot), mat="rubber", segs=12)
    ob = P.finish(sharp=40)
    marker("core", "robot", at=(-0.15, 0, 1.05), label="Data core")
    bake_ao([ob], ground_z=0.0, local_dist=0.5, sky_dist=3)
    return [ob]


# ----------------------------------------------------------------------------------------------- Edmunds' camp
def tent(P, x0, L, hw, h, doors=(), floor=0.15, ribs=1.1):
    """an inflatable tent along +X from x0: a thick rounded-box vault, inflated ribs, end walls (door openings at
    the ends named in `doors`: 'a' = x0, 'b' = x0 + L), a floor on a low platform"""
    outer = superellipse_arc(hw, h)
    inner = list(reversed(superellipse_arc(hw - 0.1, h - 0.1)))
    P.prism(outer + inner, L, at=(x0, 0, 0), plane="YZ", mat="tent_white", bevel=0.02)
    n = max(2, int(L / ribs))
    for i in range(n + 1):
        x = x0 + 0.1 + (L - 0.2) * i / n
        rib_o = superellipse_arc(hw + 0.08, h + 0.08)
        rib_i = list(reversed(superellipse_arc(hw - 0.01, h - 0.01)))
        P.prism(rib_o + rib_i, 0.16, at=(x - 0.08, 0, 0), plane="YZ", mat="tent_white", bevel=0.03)
    wall = superellipse_arc(hw - 0.05, h - 0.05)
    for end, x in (("a", x0), ("b", x0 + L - 0.1)):
        holes = [list(reversed([(-0.55, floor), (0.55, floor), (0.55, floor + 2.0), (-0.55, floor + 2.0)]))] if end in doors else None
        P.prism(wall, 0.1, at=(x, 0, 0), plane="YZ", holes=holes, mat="tent_white", bevel=0.01)
        if end in doors:
            # the rolled-up door flap and a zip frame
            xo = x - 0.06 if end == "a" else x + 0.16
            P.cyl(0.1, 1.2, at=(xo, 0, floor + 2.12), rot=(90, 0, 0), mat="canvas", segs=10)
            for s in (-1, 1):
                P.box((0.05, 0.05, 2.0), at=(xo, s * 0.57, floor + 1.0), mat="plastic_dark", bevel=0)
    P.box((L - 0.2, 2 * hw - 0.3, 0.06), at=(x0 + L / 2, 0, floor - 0.03), mat="floor_panel", bevel=0)
    P.box((L - 0.05, 2 * hw + 0.1, floor - 0.06), at=(x0 + L / 2, 0, (floor - 0.06) / 2), mat="paint_gray_dark", bevel=0.01)


def shelf(P, x, y, w, d, h, rnd, levels=4):
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((0.04, 0.04, h), at=(x + sx * (w / 2 - 0.02), y + sy * (d / 2 - 0.02), 0.15 + h / 2), mat="metal_steel", bevel=0)
    for q in range(levels):
        z = 0.2 + q * (h - 0.1) / (levels - 1)
        P.box((w, d, 0.03), at=(x, y, z), mat="metal_steel", bevel=0)
        if q < levels - 1:
            for c in range(2):
                bw = w / 2 - 0.06
                bh = rnd.uniform(0.18, 0.3)
                P.box((bw, d - 0.06, bh), at=(x - w / 4 + c * w / 2, y, z + 0.015 + bh / 2), mat=rnd.choice(["plastic_white", "paint_olive", "plastic_gray"]), bevel=0.02)


def build_edmunds():
    reset()
    rnd = random.Random(11)
    B = Part("edmunds_camp")
    # quarters (door at -X) and greenhouse (door at +X), side by side along X
    tent(B, -8.0, 8.5, 2.3, 2.8, doors=("a",))
    tent(B, 1.0, 6.0, 2.0, 2.45, doors=("b",))
    # quarters: cot, table with the data terminal, chair, shelves, water tanks
    B.box((2.0, 0.8, 0.1), at=(-5.0, 1.55, 0.55), mat="metal_dark", bevel=0.01)
    B.box((1.9, 0.75, 0.14), at=(-5.0, 1.55, 0.67), mat="canvas_olive", bevel=0.04)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box((0.04, 0.04, 0.42), at=(-5.0 + sx * 0.95, 1.55 + sy * 0.35, 0.36), mat="metal_dark", bevel=0)
    B.box((1.4, 0.75, 0.05), at=(-2.0, 1.4, 0.88), mat="plastic_gray", bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box((0.04, 0.04, 0.72), at=(-2.0 + sx * 0.65, 1.4 + sy * 0.33, 0.51), mat="metal_steel", bevel=0)
    B.box((0.55, 0.05, 0.36), at=(-2.0, 1.66, 1.12), rot=(-12, 0, 0), mat="screen", bevel=0.01)
    B.box((0.45, 0.2, 0.03), at=(-2.0, 1.35, 0.92), mat="plastic_dark", bevel=0.005)
    B.box((0.45, 0.45, 0.05), at=(-2.0, 0.6, 0.6), mat="plastic_gray", bevel=0.01)
    for s in (-1, 1):
        B.box((0.04, 0.04, 0.45), at=(-2.0 + s * 0.2, 0.6, 0.37), mat="metal_steel", bevel=0)
    for k in range(2):
        shelf(B, -4.6 + k * 1.0, -1.75, 0.95, 0.42, 1.65, rnd)
    for k in range(3):
        B.cyl(0.3, 1.1, at=(-0.7 - k * 0.68, -1.7, 0.7), mat="plastic_blue", segs=16, bevel=0.03)
    # greenhouse: two racks of planting trays either side of the aisle, under grow lamps; most shoots dead
    for r_ in (-0.8, 0.8):
        for z in (0.55, 1.15):
            B.box((4.6, 0.55, 0.05), at=(3.9, r_, z), mat="metal_steel", bevel=0)
            B.box((4.4, 0.5, 0.12), at=(3.9, r_, z + 0.08), mat="dirt", bevel=0.01)
            for q in range(10):
                x = 1.85 + q * 0.45 + rnd.uniform(-0.05, 0.05)
                alive = rnd.random() < 0.22
                hgt = rnd.uniform(0.12, 0.28) if alive else rnd.uniform(0.05, 0.14)
                for leaf in range(3):
                    ang = leaf * 120 + rnd.uniform(-20, 20)
                    B.box((0.015, 0.09, hgt), at=(x, r_, z + 0.14 + hgt / 2), rot=(rnd.uniform(15, 35), 0, ang), mat="leaf_corn" if alive else "leaf_corn_dry", bevel=0)
        for xx in (1.65, 6.15):
            B.box((0.04, 0.04, 1.75), at=(xx, r_, 1.0), mat="metal_steel", bevel=0)
        B.box((4.4, 0.12, 0.04), at=(3.9, r_, 1.95), mat="plastic_white", bevel=0)
    # flag: pole, a stiff top rod, thirteen stripes and the canton
    B.cyl(0.03, 4.6, at=(-2.0, 5.5, 2.3), mat="metal_steel", segs=8)
    B.cyl(0.015, 1.7, at=(-1.15, 5.5, 4.5), rot=(0, 90, 0), mat="metal_steel", segs=6)
    fw, fh = 1.6, 0.9
    for i in range(13):
        z = 4.48 - fh * (i + 0.5) / 13
        B.box((fw, 0.01, fh / 13), at=(-2.0 + 0.05 + fw / 2, 5.5, z), mat="flag_red" if i % 2 == 0 else "flag_white", bevel=0)
    B.box((fw * 0.4, 0.014, fh * 7 / 13), at=(-2.0 + 0.05 + fw * 0.2, 5.5, 4.48 - fh * 3.5 / 13), mat="flag_blue", bevel=0)
    # storage container on stilts with a ladder
    B.box((6.0, 2.5, 2.6), at=(14.0, 7.0, 2.7), mat="corrugated", bevel=0.03)
    B.box((6.1, 2.6, 0.12), at=(14.0, 7.0, 1.35), mat="paint_gray_dark", bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box((0.15, 0.15, 1.35), at=(14.0 + sx * 2.85, 7.0 + sy * 1.1, 0.68), mat="metal_steel", bevel=0.01)
    for z in (0.3, 0.65, 1.0):
        B.box((0.05, 0.6, 0.04), at=(10.85, 7.0, z), mat="metal_steel", bevel=0)
    for s in (-1, 1):
        B.box((0.05, 0.05, 1.4), at=(10.85, 7.0 + s * 0.3, 0.7), mat="metal_steel", bevel=0)
    # the junction box under the container: the camp's power feed
    B.box((0.45, 0.25, 0.55), at=(12.3, 5.9, 0.75), mat="paint_gray", bevel=0.02)
    B.box((0.06, 0.06, 0.6), at=(12.3, 5.9, 0.2), mat="metal_dark", bevel=0)
    B.box((0.1, 0.02, 0.06), at=(12.2, 5.77, 0.9), mat="emit_red", bevel=0)
    # the rover: six wheels, a boxy white body, a mast camera, lamps
    rx, ry = 11.0, -2.0
    B.box((3.6, 1.9, 0.9), at=(rx, ry, 1.15), mat="plastic_white", bevel=0.08)
    B.box((1.4, 1.7, 0.55), at=(rx + 0.8, ry, 1.85), mat="plastic_white", bevel=0.06)
    B.box((0.06, 1.4, 0.35), at=(rx + 1.52, ry, 1.88), mat="glass_dark", bevel=0.01)
    for k in (-1, 0, 1):
        for s in (-1, 1):
            B.cyl(0.42, 0.32, at=(rx + k * 1.3, ry + s * 1.05, 0.42), rot=(90, 0, 0), mat="tire", segs=18, bevel=0.03)
            B.cyl(0.2, 0.34, at=(rx + k * 1.3, ry + s * 1.05, 0.42), rot=(90, 0, 0), mat="metal_dark", segs=12, bevel=0.01)
    for s in (-1, 1):
        B.box((0.05, 0.25, 0.12), at=(rx + 1.82, ry + s * 0.6, 1.2), mat="glass_dark", bevel=0.01)
    B.cyl(0.03, 0.9, at=(rx - 1.2, ry + 0.6, 2.05), mat="metal_steel", segs=6)
    B.box((0.25, 0.15, 0.15), at=(rx - 1.2, ry + 0.6, 2.55), mat="paint_gray", bevel=0.02)
    # crates and cases round the tents
    for k in range(16):
        x, y = rnd.choice(((-10.5, -3.5), (-10.0, 3.0), (8.5, 3.0), (7.5, -4.6), (-1.0, -4.2)))
        x += rnd.uniform(-1.0, 1.0)
        y += rnd.uniform(-0.8, 0.8)
        w = rnd.choice((0.6, 0.8, 1.0))
        hgt = rnd.choice((0.4, 0.6, 0.8))
        B.box((w, w * 0.7, hgt), at=(x, y, hgt / 2), rot=(0, 0, rnd.uniform(-15, 15)), mat=rnd.choice(["plastic_white", "paint_olive", "plastic_gray", "paint_gray"]), bevel=0.03)
    # a small cone tent
    B.lathe([(0.95, 0.0), (0.05, 1.9), (0.0, 1.92)], at=(2.0, 5.0, 0), mat="tent_white", segs=16, bevel=0)
    # solar panels on low frames
    for k in range(3):
        B.box((2.6, 1.6, 0.05), at=(-12.0 + k * 2.8, 8.5, 1.0), rot=(25, 0, 0), mat="radiator_blue", bevel=0.01)
        for s in (-1, 1):
            B.cyl(0.04, 0.9, at=(-12.0 + k * 2.8 + s * 1.1, 8.5, 0.45), mat="metal_steel", segs=6)
    # the beacon mast and its guy wires
    B.cyl(0.07, 6.0, at=(7.0, 4.5, 3.0), mat="metal_steel", segs=8)
    for s in (-1, 1):
        B.pipe([Vector((7.0, 4.5, 4.5)), Vector((7.0 + s * 1.6, 4.5 + s * 0.6, 0.0))], 0.012, mat="metal_steel", segs=4)
    B.cyl(0.16, 0.35, at=(7.0, 4.5, 6.15), mat="paint_orange", segs=12, bevel=0.03)
    # lamp posts round the camp
    posts = [(-11.0, 0.0), (-4.0, -5.5), (5.0, -5.0), (9.0, 2.0), (2.5, 8.0)]
    for x, y in posts:
        B.cyl(0.05, 3.0, at=(x, y, 1.5), mat="metal_dark", segs=8)
        B.box((0.35, 0.25, 0.14), at=(x, y, 3.05), mat="metal_dark", bevel=0.02)
        B.box((0.28, 0.18, 0.02), at=(x, y, 2.97), mat="glass_dark", bevel=0)
    camp = B.finish(sharp=40)

    # granite boulder piles: behind the camp (where the lander stands), front left, to the right, back left
    G = Part("boulders")
    piles = [((6.0, 27.0), 13.0, 46, 3.0), ((-17.0, -13.0), 7.0, 24, 2.2), ((25.0, -7.0), 7.0, 18, 2.0), ((-24.0, 14.0), 6.0, 14, 1.7)]
    seed = 0
    for (px, py), spread, count, rmax in piles:
        for i in range(count):
            a = rnd.uniform(0, TAU)
            d = spread * math.sqrt(rnd.random())
            r = rmax * (0.35 + 0.65 * (1 - d / spread) * rnd.uniform(0.6, 1.0))
            x, y = px + d * math.cos(a), py + d * math.sin(a) * 0.7
            z = r * (0.2 + 0.25 * (1 - d / spread)) + (rmax * 0.9 * (1 - d / spread) if i % 3 == 0 and d < spread * 0.6 else 0)
            seed += 1
            boulder(G, (x, y, z), r, scale=(rnd.uniform(0.9, 1.3), rnd.uniform(0.8, 1.1), rnd.uniform(0.65, 0.9)), rot=(rnd.uniform(-10, 10), rnd.uniform(-10, 10), rnd.uniform(0, 360)), seed=seed)
    rocks = G.finish(sharp=60)

    # the cairn the player builds for Edmunds (hidden until then): a low mound of stones with a marker post
    C = Part("cairn")
    for k in range(34):
        a = rnd.uniform(0, TAU)
        d = rnd.uniform(0, 1.0) ** 0.6 * 1.25
        h = 0.12 + (1.25 - d) * 0.4 + rnd.uniform(-0.05, 0.08)
        boulder(C, (d * math.cos(a), d * math.sin(a) * 0.6, h), rnd.uniform(0.15, 0.27), scale=(1.2, 1.0, 0.8), seed=200 + k, segs=8, rings=6)
    C.box((0.07, 0.07, 1.3), at=(0, -0.9, 0.65), mat="metal_steel", bevel=0.01)
    C.box((0.5, 0.03, 0.3), at=(0, -0.92, 1.1), mat="paint_gray", bevel=0.005)
    cairn = C.finish(sharp=40, at=(-9.0, 13.5, 0), kind="cairn", id="edmunds", dynamic=1, col=0)

    marker("log", "edmunds", at=(-2.0, 1.55, 1.1), label="Dr. Edmunds' log")
    marker("seeds", "edmunds", at=(3.9, 0.0, 1.2), label="Planting racks")
    marker("beacon", "edmunds", at=(7.0, 4.5, 1.2), label="Beacon")
    marker("power", "edmunds", at=(12.3, 5.75, 0.8), label="Junction box")
    marker("grave", "edmunds", at=(-9.0, 12.6, 0.0), label="A place for a cairn")
    marker("lander", "spot", at=(-1.0, 14.0, 0), rot=(0, 0, 10))
    for i, (x, y) in enumerate(posts):
        light(f"camp_post_{i}", (x, y, 2.75), color=(1.0, 0.86, 0.6), power=36, dist=14, room="camp")
    for i, x in enumerate((-6.0, -2.0)):
        light(f"camp_q_{i}", (x, 0.0, 2.3), color=(1.0, 0.9, 0.75), power=22, dist=7, room="camp")
    light("camp_g", (3.9, 0.0, 2.1), color=(0.9, 0.7, 1.0), power=16, dist=6, room="camp")
    light("camp_beacon", (7.0, 4.5, 6.45), color=(1.0, 0.45, 0.12), power=12, dist=16, room="camp_beacon")
    bake_ao([camp, rocks], ground_z=0.0, local_dist=1.2, sky_dist=14)
    return [camp, rocks, cairn]


if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    run = lambda n: not only or n in only  # noqa: E731
    if run("lander"):
        build_lander()
        if pv:
            ground_preview("lazarus_lander", (9, -11, 4.5), (0, 0, 1.6), mat="sand", res=(900, 600), lens=35, samples=32)
        export_glb("lazarus_lander"); save_blend("lazarus_lander")
    if run("wreck"):
        build_wreck()
        if pv:
            ground_preview("miller_wreck", (12, -20, 7), (-1, 0, 0.8), mat="sand", res=(900, 600), lens=35, samples=32, sky=(0.7, 0.75, 0.8))
        export_glb("miller_wreck"); save_blend("miller_wreck")
    if run("shelter"):
        build_shelter()
        if pv:
            ground_preview("mann_shelter", (-12, -26, 5), (1, -2, 2.0), mat="ice_dust", res=(900, 600), lens=30, samples=32, sky=(0.8, 0.83, 0.87))
            ground_preview("mann_interior", (0.9, -9.2, 2.1), (-0.3, 2.0, 0.9), mat="ice_dust", res=(900, 600), lens=18, samples=48, sun=0.0, sky_strength=0.02, lamps=3.0)
        export_glb("mann_shelter"); save_blend("mann_shelter")
    if run("robot"):
        build_robot()
        if pv:
            ground_preview("survey_robot", (3, -3.5, 2.2), (0, 0, 0.8), mat="ice_dust", res=(700, 500), lens=35, samples=32)
        export_glb("survey_robot"); save_blend("survey_robot")
    if run("edmunds"):
        build_edmunds()
        if pv:
            ground_preview("edmunds_base", (-26, -32, 11), (2, 4, 1.0), mat="sand", res=(1000, 600), lens=30, samples=32, sky=(0.85, 0.75, 0.62))
            ground_preview("edmunds_inside", (-7.5, -1.2, 1.7), (0, 1.0, 0.9), mat="sand", res=(900, 600), lens=18, samples=48, sun=0.0, sky_strength=0.03, lamps=3.0)
        export_glb("edmunds_base"); save_blend("edmunds_base")
