"""Player road vehicle: a dust-covered four-door farm pickup (the truck parked at the porch in reference 2).

Frame: +Y forward, +X right, origin on the ground at the vehicle centre. Exports body (static shell + interior),
four operable doors, four wheels, steering wheel, lamps, and markers for seats, screens and exits.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
import veh  # noqa: E402
from veh import T, R  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

W2 = 1.0          # half width at the belt line
AXF, AXR = 1.95, -1.95
WR = 0.40         # wheel radius
ROCK = 0.42       # rocker height
BELT = 1.17
ROOF = 1.84
PAINT = "paint_truck"


def arch(cy, r=0.5, n=9, z=ROCK):
    return [(cy + r * math.cos(math.radians(a)), z + r * math.sin(math.radians(a))) for a in [180 - 180 * i / (n - 1) for i in range(n)]]


def build():
    reset()
    B = Part("pickup_body")
    G = Part("pickup_glass")
    doors = []

    # ---------------------------------------------------------------- chassis
    for s in (-1, 1):
        B.box((0.09, 5.5, 0.16), at=(s * 0.48, 0, 0.5), mat="metal_black", bevel=0.01)
    for y in (2.6, 1.2, 0.0, -1.2, -2.6):
        B.box((1.0, 0.1, 0.1), at=(0, y, 0.5), mat="metal_black", bevel=0.008)
    for y in (AXF, AXR):
        B.cyl(0.06, 1.55, at=(0, y, WR), rot=(0, 90, 0), mat="metal_black", segs=12, bevel=0)
        B.sphere(0.17, at=(0.18 if y > 0 else 0, y, WR), mat="metal_black", segs=14, rings=10, scale=(1.1, 1.2, 1))
        for s in (-1, 1):          # leaf springs
            for k in range(3):
                B.box((0.06, 1.1 - k * 0.22, 0.012), at=(s * 0.55, y, WR + 0.1 + k * 0.014), mat="metal_dark", bevel=0)
            B.cyl(0.03, 0.45, at=(s * 0.62, y + 0.12, WR + 0.3), rot=(12, 0, 0), mat="paint_yellow", segs=8, bevel=0)   # dampers
    B.cyl(0.045, 3.7, at=(0.05, 0.0, 0.47), rot=(90, 0, 0), mat="metal_dark", segs=10, bevel=0)                          # prop shaft
    B.pipe([(0.35, 1.6, 0.42), (0.35, -0.6, 0.4), (0.62, -1.3, 0.4), (0.62, -2.85, 0.42)], 0.035, mat="rust", segs=8)       # exhaust
    B.cyl(0.09, 0.6, at=(0.35, 0.2, 0.4), rot=(90, 0, 0), mat="rust", segs=12, bevel=0.01)
    B.box((0.75, 1.0, 0.24), at=(-0.05, -2.2, 0.52), mat="metal_black", bevel=0.03)                                         # fuel tank
    B.box((0.75, 0.9, 0.55), at=(0, 2.05, 0.82), mat="engine_dark", bevel=0.04)                                             # engine block
    B.box((1.5, 0.08, 0.5), at=(0, 2.72, 0.85), mat="metal_dark", bevel=0.01)                                               # radiator

    # ---------------------------------------------------------------- fixed body panels (both sides)
    fender = [(2.86, 0.52), (2.86, 1.02), (2.8, 1.08), (1.26, BELT), (1.26, ROCK), (1.45, ROCK)] + arch(AXF)[1:-1] + [(2.45, ROCK), (2.72, ROCK)]
    bed = [(-0.92, ROCK), (-0.92, 1.28), (-2.9, 1.28), (-2.9, 0.5), (-2.74, ROCK), (-2.45, ROCK)] + list(reversed(arch(AXR)[1:-1])) + [(-1.45, ROCK)]
    for s in (-1, 1):
        veh.side_panel(B, fender, W2, 0.07, PAINT, side=s)
        veh.side_panel(B, bed, W2, 0.07, PAINT, side=s)
        # inner wheel housings
        for cy in (AXF, AXR):
            B.lathe([(0.52, 0.0), (0.56, 0.0), (0.56, 0.36), (0.52, 0.36)], M=T((W2 - 0.43 if s > 0 else -W2 + 0.07, cy, ROCK)) @ R(90, "Y") @ R(90, "Z"), mat="metal_black", segs=18, sweep=180, closed=True, bevel=0)
            # wheel-arch lip
            B.lathe([(0.5, 0.0), (0.535, 0.0), (0.535, 0.05), (0.5, 0.05)], M=T((W2 - 0.03 if s > 0 else -W2 - 0.02, cy, ROCK)) @ R(90, "Y") @ R(90, "Z"), mat=PAINT, segs=18, sweep=180, closed=True, bevel=0.008)
        # B-pillar, C-pillar and sill
        B.box((0.06, 0.05, ROOF - ROCK), at=(s * (W2 - 0.045), 0.2, (ROOF + ROCK) / 2), mat=PAINT, bevel=0.01)
        B.box((0.07, 0.08, ROOF - ROCK), at=(s * (W2 - 0.035), -0.88, (ROOF + ROCK) / 2), mat=PAINT, bevel=0.012)
        B.box((0.1, 2.16, 0.07), at=(s * (W2 - 0.06), 0.17, ROCK + 0.01), mat=PAINT, bevel=0.012)
        B.box((0.05, 0.6, 0.05), at=(s * (W2 - 0.05), 0.98, 1.51), rot=(-52, 0, 0), mat=PAINT, bevel=0.012)        # A-pillar
        B.box((0.05, 1.62, 0.05), at=(s * (W2 - 0.05), -0.07, ROOF - 0.01), mat=PAINT, bevel=0.012)                 # roof rail
        # bed rail cap, stake pockets, tail lamp, side marker, mud flap
        B.box((0.1, 1.98, 0.035), at=(s * (W2 - 0.045), -1.91, 1.295), mat="metal_black", bevel=0.008)
        B.box((0.035, 0.03, 0.34), at=(s * (W2 - 0.03), -2.915, 1.02), mat="emit_red", bevel=0.006)
        B.box((0.34, 0.012, 0.4), at=(s * (W2 - 0.2), -2.5, 0.34), rot=(-8, 0, 0), mat="rubber", bevel=0.004)
        # chrome drip rail and belt moulding
        B.box((0.02, 1.62, 0.02), at=(s * (W2 + 0.002), -0.07, ROOF + 0.005), mat="metal_chrome", bevel=0.005)
        # mirror
        B.pipe([(s * (W2 - 0.02), 1.12, 1.26), (s * (W2 + 0.16), 1.1, 1.3)], 0.012, mat="metal_black", segs=6)
        B.box((0.05, 0.14, 0.2), at=(s * (W2 + 0.19), 1.08, 1.33), mat="metal_black", bevel=0.02)
        B.box((0.006, 0.12, 0.17), at=(s * (W2 + 0.19), 1.05, 1.33), rot=(0, 0, s * 12), mat="metal_chrome", bevel=0)
    # floor, firewall, cab rear wall, bed
    B.box((1.9, 2.2, 0.06), at=(0, 0.17, 0.47), mat="rubber", bevel=0.01)
    B.box((1.9, 0.06, 0.78), at=(0, 1.27, 0.83), mat=PAINT, bevel=0.01)
    B.box((1.92, 0.06, 0.86), at=(0, -0.89, 0.87), mat=PAINT, bevel=0.012)
    B.box((1.86, 2.0, 0.05), at=(0, -1.9, 0.7), mat="metal_dark", bevel=0.006)
    B.box((1.86, 0.05, 0.56), at=(0, -0.94, 1.0), mat=PAINT, bevel=0.008)
    for i in range(7):   # pressed ribs in the bed floor
        B.box((0.09, 1.9, 0.016), at=(-0.75 + i * 0.25, -1.9, 0.733), mat="metal_dark", bevel=0.004)
    # tailgate with pressed panel and handle
    B.box((1.86, 0.06, 0.56), at=(0, -2.9, 1.0), mat=PAINT, bevel=0.012)
    B.box((1.5, 0.02, 0.36), at=(0, -2.94, 1.0), mat=PAINT, bevel=0.03)
    B.box((0.16, 0.03, 0.05), at=(0, -2.95, 1.2), mat="metal_black", bevel=0.008)
    B.box((0.32, 0.012, 0.16), at=(0, -2.955, 0.62), mat="plastic_white", bevel=0.003)                                # plate
    # hood, cowl, grille, headlamps, bumpers
    B.prism([(1.2, 1.05), (1.2, 1.19), (2.8, 1.09), (2.86, 1.03)], 1.88, plane="YZ", at=(-0.94, 0, 0), mat=PAINT, bevel=0.02)
    B.box((1.3, 0.9, 0.03), at=(0, 2.0, 1.165), rot=(-3.6, 0, 0), mat=PAINT, bevel=0.012)                             # hood bulge
    B.box((1.86, 0.1, 0.03), at=(0, 1.25, 1.195), mat="metal_black", bevel=0.006)                                     # cowl vent
    B.box((1.98, 0.06, 0.52), at=(0, 2.865, 0.8), mat="metal_black", bevel=0.01)
    B.box((1.2, 0.05, 0.38), at=(0, 2.9, 0.84), mat="metal_chrome", bevel=0.02)
    for i in range(5):
        B.box((1.1, 0.03, 0.03), at=(0, 2.93, 0.7 + i * 0.07), mat="metal_black", bevel=0.004)
    B.box((0.05, 0.035, 0.34), at=(0, 2.935, 0.84), mat="metal_chrome", bevel=0.008)
    for s in (-1, 1):
        B.box((0.36, 0.05, 0.2), at=(s * 0.79, 2.9, 0.9), mat="metal_chrome", bevel=0.012)
        B.box((0.3, 0.02, 0.07), at=(s * 0.79, 2.915, 0.72), mat="paint_orange", bevel=0.006)
    for y, zz in ((3.0, 0.5), (-3.02, 0.52)):
        B.box((2.04, 0.14, 0.2), at=(0, y, zz), mat="metal_chrome", bevel=0.03)
        for s in (-1, 1):
            B.box((0.08, 0.2, 0.1), at=(s * 0.5, y - math.copysign(0.14, y), zz), mat="metal_black", bevel=0.01)
    B.box((0.5, 0.2, 0.03), at=(0, -3.08, 0.44), mat="tread_plate", bevel=0.006)                                       # step bumper
    B.sphere(0.03, at=(0, -3.14, 0.5), mat="metal_chrome", segs=10, rings=6)                                           # tow ball
    # roof, windscreen, rear window, wipers, antenna, cab lights
    B.box((1.98, 1.64, 0.06), at=(0, -0.08, ROOF + 0.03), mat=PAINT, bevel=0.025)
    B.box((1.9, 0.06, 0.08), at=(0, 0.73, ROOF - 0.01), mat=PAINT, bevel=0.015)
    G.poly([(-0.92, 1.24, 1.2), (0.92, 1.24, 1.2), (0.92, 0.73, ROOF - 0.03), (-0.92, 0.73, ROOF - 0.03)], mat="glass_dirty", thickness=0.006)
    G.poly([(0.9, -0.86, 1.22), (-0.9, -0.86, 1.22), (-0.9, -0.86, ROOF - 0.05), (0.9, -0.86, ROOF - 0.05)], mat="glass_dirty", thickness=0.006)
    for s in (-1, 1):
        B.pipe([(s * 0.5, 1.26, 1.2), (s * 0.12, 1.21, 1.24)], 0.008, mat="metal_black", segs=5)
        B.box((0.014, 0.014, 0.06), at=(s * 0.45, 0.45, ROOF + 0.08), mat="paint_orange", bevel=0.004)
    B.cyl(0.004, 0.8, at=(0.93, 1.3, 1.6), rot=(-12, 0, 0), mat="metal_bare", segs=5, bevel=0)
    # ladder rack over the bed (the blue rack in reference 2), toolbox, spare wheel, jerry can, shovel
    for s in (-1, 1):
        for y in (-1.02, -2.82):
            B.box((0.05, 0.05, 0.72), at=(s * 0.9, y, 1.66), mat="paint_blue", bevel=0.006)
        B.box((0.05, 1.9, 0.05), at=(s * 0.9, -1.92, 2.0), mat="paint_blue", bevel=0.006)
    for y in (-1.02, -1.92, -2.82):
        B.box((1.85, 0.05, 0.05), at=(0, y, 2.0), mat="paint_blue", bevel=0.006)
    B.box((1.78, 0.5, 0.42), at=(0, -1.22, 0.94), mat="tread_plate", bevel=0.02)
    B.box((1.8, 0.52, 0.03), at=(0, -1.22, 1.16), mat="tread_plate", bevel=0.008)
    sp = Part("_sp")
    veh.tyre(sp, WR, 0.27, 0.215, "road")
    veh.rim(sp, 0.215, 0.27, "paint_white")
    B.add_part(sp, T((0.5, -2.2, 0.86)) @ R(90, "Y") @ R(14, "X"))
    B.box((0.16, 0.34, 0.46), at=(-0.74, -2.6, 0.96), mat="paint_red_faded", bevel=0.03)
    B.cyl(0.018, 1.3, at=(-0.2, -2.1, 0.76), rot=(90, 0, 14), mat="wood_old", segs=8, bevel=0)
    B.box((0.22, 0.28, 0.015), at=(-0.05, -2.83, 0.76), rot=(0, 0, 14), mat="metal_dark", bevel=0.003)

    # ---------------------------------------------------------------- interior
    dash = [(1.24, 0.72), (1.24, 1.2), (1.0, 1.2), (0.92, 1.12), (0.9, 0.86), (1.0, 0.72)]
    B.prism(dash, 1.86, plane="YZ", at=(-0.93, 0, 0), mat="plastic_dark", bevel=0.02)
    B.box((0.5, 0.2, 0.2), at=(-0.45, 0.98, 1.2), mat="plastic_dark", bevel=0.04)                                      # instrument hood
    B.box((0.32, 0.3, 0.22), at=(0, 0.95, 0.9), mat="plastic_black", bevel=0.02)                                       # centre stack
    for i in range(3):
        B.cyl(0.02, 0.03, at=(-0.1 + i * 0.1, 0.795, 0.86), rot=(90, 0, 0), mat="plastic_gray", segs=10, bevel=0.003)
    B.box((0.2, 0.02, 0.06), at=(0, 0.798, 0.96), mat="screen", bevel=0.003)                                           # radio
    B.box((0.45, 0.2, 0.2), at=(0.45, 0.93, 0.86), mat="plastic_dark", bevel=0.02)                                     # glove box
    for x in (-0.82, 0.82, -0.2, 0.2):
        B.box((0.16, 0.02, 0.07), at=(x, 0.915, 1.1), rot=(-8, 0, 0), mat="plastic_black", bevel=0.004)              # vents
    for i, x in enumerate((-0.57, -0.45, -0.34)):                                                                      # pedals
        B.box((0.06 if i else 0.09, 0.02, 0.09), at=(x, 1.14, 0.6), rot=(-35, 0, 0), mat="rubber", bevel=0.004)
    B.pipe([(-0.3, 0.86, 1.02), (-0.2, 0.74, 1.12)], 0.01, mat="metal_black", segs=6)                                 # column shifter
    B.sphere(0.02, at=(-0.2, 0.74, 1.12), mat="plastic_black", segs=8, rings=6)
    B.box((0.3, 0.62, 0.2), at=(0, 0.3, 0.62), mat="plastic_dark", bevel=0.02)                                         # console
    for x in (-0.45, 0.45):
        veh.seat(B, T((x, 0.28, 0.5)), w=0.52, mat="seat_leather_dark")
    B.box((1.7, 0.5, 0.14), at=(0, -0.42, 0.84), mat="seat_leather_dark", bevel=0.045)                                 # rear bench
    B.box((1.7, 0.14, 0.62), at=(0, -0.74, 1.18), rot=(8, 0, 0), mat="seat_leather_dark", bevel=0.05)
    B.box((1.6, 0.42, 0.22), at=(0, -0.42, 0.66), mat="metal_dark", bevel=0.01)
    B.box((1.86, 1.5, 0.02), at=(0, -0.08, ROOF - 0.01), mat="fabric", bevel=0)                                        # headliner
    for x in (-0.45, 0.45):
        B.box((0.36, 0.14, 0.012), at=(x, 0.62, ROOF - 0.04), rot=(-12, 0, 0), mat="plastic_gray", bevel=0.004)      # sun visors
    B.box((0.22, 0.02, 0.06), at=(0, 0.78, ROOF - 0.1), mat="metal_chrome", bevel=0.006)                               # mirror
    # dash-top navigation unit (the destination display)
    B.box((0.2, 0.03, 0.13), at=(0, 1.02, 1.29), rot=(-18, 0, 0), mat="plastic_black", bevel=0.01)
    B.cyl(0.012, 0.07, at=(0, 1.05, 1.22), mat="plastic_black", segs=8, bevel=0)
    marker("screen", "gps", at=(0, 1.002, 1.293), rot=(72, 0, 180), w=0.17, h=0.1, label="Navigation")
    marker("screen", "cluster", at=(-0.45, 0.876, 1.165), rot=(80, 0, 180), w=0.34, h=0.12)

    # ---------------------------------------------------------------- doors (hinged at the front edge)
    def door(did, side, y0, y1, front):
        P = Part(f"pickup_door_{did}")
        yh = y0                                   # hinge line
        L = y0 - y1
        if front:
            outline = [(0, ROCK + 0.04), (0, BELT), (-0.52, ROOF - 0.02), (-L, ROOF - 0.02), (-L, ROCK + 0.04)]
            hole = [(-0.14, BELT + 0.04), (-0.56, ROOF - 0.09), (-L + 0.06, ROOF - 0.09), (-L + 0.06, BELT + 0.04)]
        else:
            outline = [(0, ROCK + 0.04), (0, ROOF - 0.02), (-L, ROOF - 0.02), (-L, ROCK + 0.04)]
            hole = [(-0.06, BELT + 0.04), (-0.06, ROOF - 0.09), (-L + 0.1, ROOF - 0.09), (-L + 0.1, BELT + 0.04)]
        x0 = -0.06 if side > 0 else 0.0
        P.prism(outline, 0.06, plane="YZ", at=(x0, 0, 0), mat=PAINT, holes=[hole], bevel=0.012)
        # inner trim panel, arm rest, window crank, glass, handle
        xi = -0.085 if side > 0 else 0.06
        P.prism([(-0.04, ROCK + 0.08), (-0.04, BELT - 0.02), (-L + 0.04, BELT - 0.02), (-L + 0.04, ROCK + 0.08)], 0.025, plane="YZ", at=(xi, 0, 0), mat="plastic_dark", bevel=0.008)
        P.box((0.07, 0.4, 0.06), at=(-side * 0.1, -L / 2, 0.9), mat="plastic_black", bevel=0.02)
        P.cyl(0.03, 0.03, at=(-side * 0.075, -L * 0.3, 0.78), rot=(0, 90, 0), mat="metal_chrome", segs=10, bevel=0.004)
        gz0, gz1 = BELT + 0.02, ROOF - 0.07
        if front:
            gp = [(0.0, -0.12, gz0), (0.0, -0.55, gz1), (0.0, -L + 0.04, gz1), (0.0, -L + 0.04, gz0)]
        else:
            gp = [(0.0, -0.04, gz0), (0.0, -0.04, gz1), (0.0, -L + 0.08, gz1), (0.0, -L + 0.08, gz0)]
        gx = -side * 0.03
        P.poly([(gx, p[1], p[2]) for p in (gp if side > 0 else list(reversed(gp)))], mat="glass_dirty", thickness=0.005)
        P.box((0.03, 0.14, 0.04), at=(side * 0.012, -L + 0.14, BELT - 0.1), mat="metal_chrome", bevel=0.008)
        P.box((0.012, L - 0.1, 0.03), at=(side * 0.004, -L / 2, 0.74), mat="metal_black", bevel=0.004)             # rub strip
        ob = P.finish(sharp=40, at=(side * W2, yh, 0))
        props(ob, kind="vdoor", id=did, part=f"door_{did}", angle=65 * side, dynamic=1, col=0)
        doors.append(ob)
        return ob

    door("fl", -1, 1.24, 0.215, True)
    door("fr", 1, 1.24, 0.215, True)
    door("rl", -1, 0.185, -0.84, False)
    door("rr", 1, 0.185, -0.84, False)

    # ---------------------------------------------------------------- wheels, steering wheel, lamps
    wheels = []
    for wid, x, y in (("fl", -0.85, AXF), ("fr", 0.85, AXF), ("rl", -0.85, AXR), ("rr", 0.85, AXR)):
        wp = veh.wheel_part(f"pickup_wheel_{wid}", WR, 0.27, 0.215, "road", rim_mat="paint_white", outer=1 if x > 0 else -1)
        ob = wp.finish(sharp=40, at=(x, y, WR))
        props(ob, kind="wheel", id=wid, part=f"wheel_{wid}", radius=WR, steer=1 if y > 0 else 0, drive=1, dynamic=1, col=0)
        wheels.append(ob)
    S = Part("pickup_steering")
    veh.steering_wheel(S, Matrix.Identity(4), r=0.2)
    sw = S.finish(sharp=40, at=(-0.45, 0.72, 1.06), rot=(-68, 0, 0))
    props(sw, kind="steer", id="wheel", part="steering", dynamic=1, col=0)
    HL = Part("pickup_headlights")
    for s in (-1, 1):
        for dx in (-0.085, 0.085):
            HL.box((0.15, 0.012, 0.15), at=(s * 0.79 + dx, 2.93, 0.9), mat="emit_white", bevel=0.01)
    hl = HL.finish(sharp=40, col=0, shadow=0)
    props(hl, kind="lamp", id="head", part="headlights", dynamic=1)

    body = B.finish(sharp=38, col=0)
    glass = G.finish(sharp=38, col=0, shadow=0)
    props(body, part="body")

    # ---------------------------------------------------------------- markers
    marker("seat", "driver", at=(-0.45, 0.2, 0.5), eye=1.12, label="Drive")
    marker("seat", "passenger", at=(0.45, 0.2, 0.5), eye=1.12)
    marker("seat", "rear_l", at=(-0.5, -0.5, 0.5), eye=1.12)
    marker("seat", "rear_r", at=(0.5, -0.5, 0.5), eye=1.12)
    marker("exit", "driver", at=(-1.9, 0.5, 0.0))
    marker("exit", "passenger", at=(1.9, 0.5, 0.0))
    marker("light", "head_l", at=(-0.79, 3.0, 0.9), rot=(0, 0, 0), light="spot", power=900, dist=70, color=[1.0, 0.93, 0.8])
    marker("light", "head_r", at=(0.79, 3.0, 0.9), rot=(0, 0, 0), light="spot", power=900, dist=70, color=[1.0, 0.93, 0.8])
    marker("vehicle", "pickup", at=(0, 0, 0), half=[1.0, 2.95, 0.5], body_z=0.85, cab_half=[0.98, 1.05, 0.36], cab_y=0.15, cab_z=1.55,
           mass=2400.0, wheelbase=AXF - AXR, track=1.7, wheel_r=WR)
    bake_ao([body] + doors + wheels + [sw], ground_z=0.0, local_dist=0.8)
    return body


if __name__ == "__main__":
    build()
    if "--preview" in sys.argv:
        preview("pickup_rear", (-5.5, -7.5, 2.6), (0, -0.3, 0.9), res=(1200, 700), lens=50, samples=48, sun_rot=(50, 0, 160))
        preview("pickup_front", (4.8, 7.0, 2.2), (0, 0.3, 0.9), res=(1200, 700), lens=50, samples=48, sun_rot=(50, 0, 20))
        preview("pickup_cab", (0.25, -0.25, 1.62), (-0.3, 1.2, 1.25), res=(1100, 650), lens=16, samples=64, sun_rot=(50, 0, 20), sky_strength=3.0)
    export_glb("pickup")
    save_blend("pickup")
