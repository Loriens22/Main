"""Giant-planet aerostat station and the Ranger's ascent booster.

  station.glb   a floating station for the 1-bar level of a gas or ice giant. Three hot-hydrogen envelopes (a
                Montgolfiere is the only aerostat that floats in a hydrogen atmosphere: heated hydrogen inside,
                cold hydrogen outside) 110 m across carry a hexagonal deck by three truss arms. The deck holds the
                Ranger's landing pad, two habitat modules, the ISRU plant that liquefies atmospheric hydrogen,
                a booster cradle, the reactor that heats the envelopes, radiators, and a mast.
                Lift budget (Jupiter, 165 K outside, ~420 K inside): ~0.1 kg per m^3 of envelope, ~2.1e6 m^3 in all
                -> ~230 t carried: the station, the Ranger and a fuelled booster.
  booster.glb   two strap-on propellant pods with vectoring engine clusters, joined by a saddle truss over the
                Ranger's back. Origin = the Ranger's reference point. Scaled per world in the engine.

Blender: +Y forward, +Z up. The pad centre is the origin; the deck top is z = 0.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Vector  # noqa: E402

DECK_R = 34.0          # hexagon circumradius
ARM_L = 78.0           # arm length beyond the deck corner
ENV_R = 55.0           # envelope radius
ENV_Z = 112.0          # envelope centre height
RAIL_H = 1.15


def hexagon(r, rot=0.0):
    return [(r * math.cos(math.radians(60 * i + rot)), r * math.sin(math.radians(60 * i + rot))) for i in range(6)]


def railing(P, a, b, h=RAIL_H, post=3.0, mat="paint_yellow"):
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    n = max(1, int(L / post))
    for i in range(n + 1):
        p = a + d * (i / n)
        P.cyl(0.035, h, at=(p.x, p.y, p.z + h / 2), mat=mat, segs=6, bevel=0)
    for z in (h, h * 0.5):
        P.pipe([a + Vector((0, 0, z)), b + Vector((0, 0, z))], 0.03, mat=mat, segs=6)


def truss(P, a, b, w=2.4, mat="paint_gray", r=0.12, bays=None):
    """Square truss from a to b (w wide), longerons + diagonals."""
    a, b = Vector(a), Vector(b)
    d = (b - a)
    L = d.length
    f = d.normalized()
    up = Vector((0, 0, 1))
    side = f.cross(up)
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    upv = side.cross(f).normalized()
    corners = [side * (w / 2) + upv * (w / 2), side * (-w / 2) + upv * (w / 2), side * (-w / 2) + upv * (-w / 2), side * (w / 2) + upv * (-w / 2)]
    for c in corners:
        P.pipe([a + c, b + c], r, mat=mat, segs=6)
    n = bays or max(2, int(L / w))
    for i in range(n):
        p0, p1 = a + d * (i / n), a + d * ((i + 1) / n)
        for k in range(4):
            c0, c1 = corners[k], corners[(k + 1) % 4]
            P.pipe([p0 + c0, p1 + c1], r * 0.6, mat=mat, segs=4, cap=False)
        for k in range(4):
            P.pipe([p1 + corners[k], p1 + corners[(k + 1) % 4]], r * 0.6, mat=mat, segs=4, cap=False)


def module(P, at, yaw, L=14.0, R=2.6, mat="hull_white"):
    """Habitat module lying on the deck: cylinder with domed ends, windows, saddles, a hatch."""
    M = xf(at, (0, 0, yaw))
    P.cyl(R, L, M=M @ xf((0, 0, R + 0.4), (90, 0, 0)), mat=mat, segs=32, bevel=0.05)
    for s in (-1, 1):
        P.sphere(R, M=M @ xf((0, s * L / 2, R + 0.4), (90, 0, 0), (1, 1, 0.35)), mat=mat, segs=32, rings=12)
        P.box((R * 1.6, 0.5, 0.6), M=M @ xf((0, s * (L / 2 - 1.5), 0.3)), mat="paint_gray_dark", bevel=0.05)
    for i in range(5):
        y = -L / 2 + 2.0 + i * (L - 4) / 4
        P.box((0.08, 0.7, 0.45), M=M @ xf((R - 0.02, y, R + 1.0)), mat="glass_dark", bevel=0.02)
    P.cyl(0.65, 0.3, M=M @ xf((-R + 0.05, 0, R + 0.2), (0, 90, 0)), mat="paint_gray", segs=24, bevel=0.05)
    for k in range(3):
        P.tube(R + 0.06, R - 0.05, 0.25, M=M @ xf((0, -L / 2 + 2 + k * (L - 4) / 2, R + 0.4), (90, 0, 0)), mat="paint_gray", segs=32)


def booster_pods(P, scale=1.0):
    """Two pods + saddle (also used as the spare booster on the cradle)."""
    R, L = 2.5, 24.0
    for s in (-1, 1):
        x = s * 7.4
        P.cyl(R, L, at=(x, -2.5, 1.0), rot=(90, 0, 0), mat="hull_white", segs=36, bevel=0.05)
        P.sphere(R, M=xf((x, -2.5 + L / 2, 1.0), (90, 0, 0), (1, 1, 0.55)), mat="hull_white", segs=36, rings=14)
        P.cyl(R, 1.6, at=(x, -2.5 - L / 2 - 0.8, 1.0), rot=(90, 0, 0), r2=R * 0.8, mat="metal_dark", segs=36, bevel=0.03)
        for k in range(4):
            P.tube(R + 0.04, R - 0.1, 0.22, at=(x, -2.5 - L / 2 + 2 + k * (L - 4) / 3, 1.0), rot=(90, 0, 0), mat="paint_gray_dark", segs=36)
        # engine cluster on a gimbal ring
        P.tube(R * 0.8, R * 0.55, 0.5, at=(x, -2.5 - L / 2 - 1.8, 1.0), rot=(90, 0, 0), mat="metal_dark", segs=32)
    # saddle over the Ranger's back
    for y in (-6.0, 3.5):
        pts = [Vector((-7.4, y, 3.2)), Vector((-4.0, y, 4.9)), Vector((0, y, 5.4)), Vector((4.0, y, 4.9)), Vector((7.4, y, 3.2))]
        P.pipe(pts, 0.32, mat="paint_gray_dark", segs=12)
        P.box((1.2, 0.9, 0.7), at=(0, y, 5.1), mat="paint_gray_dark", bevel=0.1)
    P.pipe([Vector((0, -6.0, 5.4)), Vector((0, 3.5, 5.4))], 0.28, mat="paint_gray_dark", segs=12)


def booster_engines(P):
    """Nozzles, separate so the engine can swing them between lift (down) and main (aft)."""
    for s in (-1, 1):
        x = s * 7.4
        for dx, dz in ((-0.85, 0.5), (0.85, 0.5), (0.0, -0.9)):
            P.cyl(0.42, 1.7, at=(x + dx, 0, dz), rot=(90, 0, 0), r2=0.9, mat="thruster", segs=24, caps=False, bevel=0)
            P.cyl(0.45, 0.4, at=(x + dx, 1.0, dz), rot=(90, 0, 0), mat="metal_dark", segs=20, bevel=0.03)


def build_station():
    reset()
    D_ = Part("deck")
    hexa = hexagon(DECK_R, 30)
    D_.prism(hexa, 1.2, at=(0, 0, -1.2), mat="floor_panel_dark", bevel=0.06)
    # underside truss ring and spokes
    for i in range(6):
        a, b = hexa[i], hexa[(i + 1) % 6]
        truss(D_, (a[0], a[1], -2.6), (b[0], b[1], -2.6), w=2.6, mat="paint_gray_dark", r=0.14, bays=10)
        truss(D_, (0, 0, -2.6), (a[0], a[1], -2.6), w=2.2, mat="paint_gray_dark", r=0.12, bays=8)
    # pad: painted circle, ring, touchdown cross and edge lights
    D_.cyl(13.0, 0.04, at=(0, 0, 0.02), mat="paint_gray", segs=64, bevel=0)
    D_.tube(12.6, 11.9, 0.05, at=(0, 0, 0.05), mat="paint_yellow", segs=64)
    D_.tube(4.6, 4.1, 0.05, at=(0, 0, 0.05), mat="paint_white", segs=48)
    D_.box((0.5, 6.0, 0.05), at=(0, 0, 0.06), mat="paint_white", bevel=0)
    D_.box((6.0, 0.5, 0.05), at=(0, 0, 0.06), mat="paint_white", bevel=0)
    for i in range(16):
        a = math.tau * i / 16
        D_.cyl(0.18, 0.12, at=(13.3 * math.cos(a), 13.3 * math.sin(a), 0.06), mat="emit_amber", segs=10, bevel=0)
    # walkway markings to the modules
    for ang in (90, 210, 330):
        a = math.radians(ang)
        for k in range(8):
            r = 15.5 + k * 2.0
            D_.box((1.6, 0.25, 0.03), at=(r * math.cos(a), r * math.sin(a), 0.03), rot=(0, 0, ang + 90), mat="paint_yellow", bevel=0)
    deck = D_.finish(sharp=40)

    # railings round the deck edge, open where the arms leave (at the corners 30, 150, 270 deg)
    R_ = Part("rails")
    arm_corners = {0, 2, 4}
    for i in range(6):
        a, b = Vector((*hexa[i], 0)), Vector((*hexa[(i + 1) % 6], 0))
        d = (b - a).normalized()
        a2 = a + d * (2.2 if i in arm_corners else 0.0)
        b2 = b - d * (2.2 if (i + 1) % 6 in arm_corners else 0.0)
        railing(R_, a2, b2)
    rails = R_.finish(sharp=40, shadow=0)

    # modules on the free sides of the deck
    M_ = Part("modules")
    for k, ang in enumerate((90, 210, 330)):
        a = math.radians(ang)
        cx, cy = 24.0 * math.cos(a), 24.0 * math.sin(a)
        if k == 0:
            module(M_, (cx, cy, 0), ang)                      # habitat
        elif k == 1:
            # ISRU: compressors and three liquid-hydrogen spheres
            M_.box((7.0, 4.0, 3.2), M=xf((cx, cy, 0), (0, 0, ang)) @ xf((0, -3.5, 1.6)), mat="paint_white", bevel=0.15)
            for j in range(3):
                M_.sphere(2.6, M=xf((cx, cy, 0), (0, 0, ang)) @ xf((-5.5 + j * 5.5, 3.0, 3.0)), mat="hull_white", segs=32, rings=16)
                M_.cyl(0.25, 3.0, M=xf((cx, cy, 0), (0, 0, ang)) @ xf((-5.5 + j * 5.5, 3.0, 1.0)), mat="paint_gray_dark", segs=10)
            for j in range(4):
                M_.pipe([Vector((cx - 2 + j, cy - 1, 2.8)), Vector((cx - 2 + j, cy + 1, 5.0)), Vector((cx - 2 + j, cy + 3, 5.2))], 0.12, mat="metal_steel", segs=8)
        else:
            module(M_, (cx, cy, 0), ang, L=11.0, R=2.3, mat="hull_gray")   # reactor / control
            M_.box((1.0, 6.0, 7.0), M=xf((cx, cy, 0), (0, 0, ang)) @ xf((4.5, 0, 3.5)), mat="radiator", bevel=0.05)
            M_.box((1.0, 6.0, 7.0), M=xf((cx, cy, 0), (0, 0, ang)) @ xf((-4.5, 0, 3.5)), mat="radiator", bevel=0.05)
    # mast with beacon and antennas
    M_.cyl(0.35, 22.0, at=(-18.0, -6.0, 11.0), mat="paint_white", segs=12, bevel=0.03)
    M_.cyl(0.9, 0.6, at=(-18.0, -6.0, 22.3), mat="emit_red", segs=16, bevel=0.05)
    M_.cyl(1.6, 0.3, at=(-18.0, -6.0, 18.0), rot=(70, 0, 0), mat="paint_white", segs=24, bevel=0.03)
    modules = M_.finish(sharp=40)

    # spare booster on its cradle (beside the pad, the side away from the habitat)
    B_ = Part("spare_booster")
    booster_pods(B_)
    booster_engines(B_)
    spare = B_.finish(sharp=40, at=(17.0, -12.0, 3.4), rot=(0, 0, 25))       # solid: people walk round it on the deck
    C_ = Part("cradle")
    for y in (-8, 0, 8):
        for s in (-1, 1):
            C_.box((1.6, 1.0, 1.95), M=xf((17.0, -12.0, 0), (0, 0, 25)) @ xf((s * 7.4, y, 0.975)), mat="paint_yellow", bevel=0.05)
    cradle = C_.finish(sharp=40)

    # arms, tether nodes, cables and envelopes
    A_ = Part("arms")
    E_ = Part("envelopes")
    K_ = Part("cables")
    for i in (0, 2, 4):
        cx, cy = hexa[i]
        dirv = Vector((cx, cy, 0)).normalized()
        start = Vector((cx, cy, -1.4))
        end = start + dirv * ARM_L
        truss(A_, start, end, w=3.0, mat="paint_gray", r=0.16, bays=16)
        # walkway on top with railings both sides
        side = dirv.cross(Vector((0, 0, 1))).normalized()
        wa, wb = Vector((cx, cy, 0.25)), Vector((end.x, end.y, 0.25))
        L = (wb - wa).length
        mid = (wa + wb) / 2
        ang = math.degrees(math.atan2(dirv.y, dirv.x))
        A_.box((L, 2.4, 0.12), at=(mid.x, mid.y, 0.12), rot=(0, 0, ang), mat="tread_plate", bevel=0)
        railing(A_, wa + side * 1.2, wb + side * 1.2)
        railing(A_, wa - side * 1.2, wb - side * 1.2)
        # tether node at the arm end
        A_.sphere(2.2, at=(end.x, end.y, end.z + 1.5), mat="paint_gray_dark", segs=20, rings=12)
        A_.box((5.0, 5.0, 0.4), at=(end.x, end.y, 0.12), rot=(0, 0, ang), mat="tread_plate", bevel=0.05)
        railing(A_, Vector((end.x, end.y, 0.25)) + side * 2.5 + dirv * 2.5, Vector((end.x, end.y, 0.25)) - side * 2.5 + dirv * 2.5)
        # envelope above the arm end
        c = Vector((end.x, end.y, ENV_Z))
        E_.sphere(ENV_R, at=tuple(c), mat="envelope", segs=48, rings=32, scale=(1, 1, 1.08))
        # load tapes (meridians) and the equatorial load ring
        for k in range(24):
            a = math.tau * k / 24
            pts = []
            for j in range(1, 24):
                th = math.pi * j / 24
                pts.append(c + Vector((math.sin(th) * math.cos(a) * (ENV_R + 0.25), math.sin(th) * math.sin(a) * (ENV_R + 0.25), -math.cos(th) * (ENV_R * 1.08 + 0.25))))
            E_.pipe(pts, 0.22, mat="paint_gray", segs=5, cap=False)
        E_.tube(ENV_R + 0.6, ENV_R - 0.4, 1.2, at=(c.x, c.y, c.z), mat="paint_gray_dark", segs=64)
        # throat with the heat exchanger at the bottom
        E_.cyl(7.0, 6.0, at=(c.x, c.y, c.z - ENV_R * 1.08 + 2.0), r2=9.0, mat="metal_dark", segs=32, bevel=0.1)
        E_.cyl(0.9, 1.2, at=(c.x, c.y, c.z + ENV_R * 1.08 + 0.4), mat="emit_red", segs=12, bevel=0.05)
        # tethers: from the load ring to the arm end and to the two deck corners either side
        node = Vector((end.x, end.y, end.z + 2.5))
        for k in range(12):
            a = math.tau * k / 12
            p = c + Vector((math.cos(a) * ENV_R, math.sin(a) * ENV_R, 0))
            K_.pipe([p, node], 0.09, mat="metal_steel", segs=5)
    arms = A_.finish(sharp=40)
    envs = E_.finish(sharp=50, col=0)
    cables = K_.finish(sharp=40, col=0, shadow=0)

    # floodlights and markers
    for i in range(6):
        a = math.radians(60 * i)
        light(f"flood_{i}", (30 * math.cos(a), 30 * math.sin(a), 9.0), color=(1.0, 0.95, 0.88), power=4000, dist=60, kind="spot", rot=(-60, 0, math.degrees(a) + 90))
    marker("pad", "main", at=(0, 0, 0), radius=13.0)
    marker("spawn", "deck", at=(-10.0, 14.0, 0.0))
    marker("station", "aerostat", at=(0, 0, 0), deck_r=DECK_R, env_r=ENV_R, env_z=ENV_Z, arm_l=ARM_L)
    bake_ao([deck, rails, modules, cradle, arms, spare], ground_z=None, local_dist=3.0, sky_dist=80.0)
    return [deck, rails, modules, cradle, arms, envs, cables, spare]


def build_booster():
    reset()
    P = Part("booster_pods")
    booster_pods(P)
    pods = P.finish(sharp=40, col=0)
    props(pods, part="pods")
    E = Part("booster_nozzles")
    booster_engines(E)
    noz = E.finish(sharp=40, col=0)
    props(noz, part="nozzles", dynamic=1)
    for s in (-1, 1):
        marker("plume", f"b{'l' if s < 0 else 'r'}", at=(s * 7.4, -2.5 - 12.0 - 3.0, 1.0))
    marker("booster", "ranger", at=(0, 0, 0), length=27.0, pod_r=2.5)
    bake_ao([pods, noz], ground_z=None, local_dist=1.5, sky_dist=20.0)
    return [pods, noz]


if __name__ == "__main__":
    objs = build_station()
    if "--preview" in sys.argv:
        preview("station_overview", (210, -260, 130), (0, 40, 50), res=(1280, 760), lens=35, samples=48, sun_rot=(40, 0, 30), sky=(0.82, 0.72, 0.55), sky_strength=1.0)
        preview("station_deck", (-34, -40, 12), (0, 0, 2), res=(1280, 760), lens=24, samples=48, sun_rot=(40, 0, 30), sky=(0.82, 0.72, 0.55), sky_strength=1.0)
    export_glb("station")
    save_blend("station")
    build_booster()
    if "--preview" in sys.argv:
        preview("booster", (22, -30, 14), (0, -4, 2), res=(1100, 650), lens=35, samples=48)
    export_glb("booster")
    save_blend("booster")
