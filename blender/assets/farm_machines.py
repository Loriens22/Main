"""Farm machinery seen in reference image 1: red articulated four-wheel-drive tractor on dual wheels,
red combine harvester with an eight-row corn head, and a red grain cart.

Each machine exports as its own GLB with separately movable parts (wheels, articulation halves,
header, augers, cab door) and markers for seats, cameras, lights and vehicle parameters.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
import veh  # noqa: E402
from veh import T, R  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

RED, RED2, DARK, BLK = "paint_red", "paint_red_faded", "paint_gray_dark", "metal_black"


def cab(P, G, M, w=1.7, l=1.7, h=1.9, body=RED, roof="paint_white", door_part=None, lights=True):
    """Glazed operator cab with its floor at the local origin plane; front faces +Y. Returns the door Part if requested."""
    hw, hl = w / 2, l / 2
    pw = 0.07
    P.box((w, l, 0.08), M=M @ T((0, 0, 0.04)), mat=BLK, bevel=0.01)                              # floor
    P.box((w, l, 0.5), M=M @ T((0, 0, 0.3)), mat=body, bevel=0.03)                                # lower body
    P.box((w - 0.16, l - 0.16, 0.45), M=M @ T((0, 0, 0.33)), mat="plastic_dark", bevel=0)         # interior lining
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box((pw, pw, h - 0.5), M=M @ T((sx * (hw - pw / 2), sy * (hl - pw / 2), 0.5 + (h - 0.5) / 2)), mat=BLK, bevel=0.012)
    P.box((w + 0.18, l + 0.22, 0.2), M=M @ T((0, 0.02, h + 0.1)), mat=roof, bevel=0.05)           # roof cap
    P.box((w - 0.1, l - 0.1, 0.03), M=M @ T((0, 0, h - 0.015)), mat="fabric", bevel=0)            # headliner
    gz0, gz1 = 0.56, h - 0.02
    # glass: front, rear, right side (left side is the door)
    G.box((w - 2 * pw, 0.008, gz1 - gz0), M=M @ T((0, hl - 0.03, (gz0 + gz1) / 2)), mat="glass", bevel=0)
    G.box((w - 2 * pw, 0.008, gz1 - gz0), M=M @ T((0, -hl + 0.03, (gz0 + gz1) / 2)), mat="glass", bevel=0)
    G.box((0.008, l - 2 * pw, gz1 - gz0), M=M @ T((hw - 0.03, 0, (gz0 + gz1) / 2)), mat="glass", bevel=0)
    if lights:
        for sx in (-0.55, -0.2, 0.2, 0.55):
            veh.lamp(P, M @ T((sx, hl + 0.12, h + 0.1)), r=0.06, lit="emit_white")
        for sx in (-0.5, 0.5):
            veh.lamp(P, M @ T((sx, -hl - 0.09, h + 0.1)) @ R(180, "Z"), r=0.06)
        P.cyl(0.05, 0.1, M=M @ T((0.6, -0.4, h + 0.25)), mat="paint_orange", segs=10, bevel=0.01)   # beacon
    # mirrors and wiper
    for sx in (-1, 1):
        P.pipe([M @ Vector((sx * hw, hl - 0.05, 1.2)), M @ Vector((sx * (hw + 0.35), hl + 0.05, 1.25))], 0.012, mat=BLK, segs=6)
        P.box((0.04, 0.16, 0.3), M=M @ T((sx * (hw + 0.38), hl + 0.05, 1.3)), mat=BLK, bevel=0.015)
    # seat, column, wheel, side console with monitor
    veh.seat(P, M @ T((0, -0.25, 0.08)), w=0.5, mat="fabric_dark", base_h=0.42)
    P.box((0.12, 0.1, 0.62), M=M @ T((0, 0.42, 0.4)) @ R(-18, "X"), mat="plastic_black", bevel=0.02)
    P.box((0.28, 0.75, 0.22), M=M @ T((0.52, -0.1, 0.66)), mat="plastic_dark", bevel=0.03)
    P.cyl(0.018, 0.14, M=M @ T((0.5, 0.12, 0.84)) @ R(-12, "X"), mat="plastic_black", segs=8, bevel=0)
    P.sphere(0.03, M=M @ T((0.5, 0.135, 0.92)), mat="plastic_orange", segs=10, rings=6)
    P.box((0.26, 0.03, 0.18), M=M @ T((0.6, 0.45, 1.05)) @ R(-25, "Z"), mat="plastic_black", bevel=0.01)
    # door (left): framed glass, hinged at the rear edge
    D = Part(door_part) if door_part else P
    dm = Matrix.Identity(4) if door_part else M @ T((-hw + 0.03, -hl + pw, 0))
    dl = l - 2 * pw
    for (yy, zz, sy, sz) in ((dl / 2, 0.55 + 0.03, dl, 0.06), (dl / 2, h - 0.03, dl, 0.06), (0.03, (0.55 + h) / 2, 0.06, h - 0.55), (dl - 0.03, (0.55 + h) / 2, 0.06, h - 0.55)):
        D.box((0.04, sy, sz), M=dm @ T((0, yy, zz)), mat=BLK, bevel=0.01)
    D.box((0.008, dl - 0.1, h - 0.66), M=dm @ T((0, dl / 2, (0.55 + h) / 2)), mat="glass", bevel=0)
    D.box((0.05, dl, 0.48), M=dm @ T((0, dl / 2, 0.3)), mat=body, bevel=0.012)
    D.box((0.03, 0.03, 0.4), M=dm @ T((-0.05, dl - 0.2, 0.95)), mat="metal_bare", bevel=0.008)
    return D if door_part else None


# ======================================================================================= TRACTOR
def tractor():
    reset()
    WR, WW, GAP = 1.02, 0.7, 0.12
    AXF, AXR = 1.95, -1.95
    XI = 1.02                                  # centre of the inner tyre
    F, Fg = Part("tractor_front"), Part("tractor_front_glass")
    Rr = Part("tractor_rear")
    # ---- front frame, engine hood, nose
    F.box((1.05, 3.25, 0.5), at=(0, 1.75, 1.2), mat=BLK, bevel=0.03)
    F.box((2.5, 0.55, 0.55), at=(0, AXF, WR), mat=BLK, bevel=0.06)                                   # axle housing
    hood = [(0.98, 1.45), (0.98, 2.5), (1.5, 2.52), (3.15, 2.34), (3.42, 2.1), (3.45, 1.45)]
    F.prism(hood, 1.3, plane="YZ", at=(-0.65, 0, 0), mat=RED, bevel=0.05)
    for s in (-1, 1):                                                                                # side screens + stripe
        F.box((0.03, 1.5, 0.55), at=(s * 0.655, 2.2, 1.95), mat=BLK, bevel=0.008)
        for i in range(9):
            F.box((0.02, 1.4, 0.02), at=(s * 0.675, 2.2, 1.72 + i * 0.058), mat=DARK, bevel=0)
        F.box((0.02, 2.2, 0.09), at=(s * 0.66, 2.15, 2.36), rot=(-6.2, 0, 0), mat="paint_black", bevel=0.004)
    F.box((1.1, 0.04, 0.72), at=(0, 3.46, 1.88), mat=BLK, bevel=0.01)                                # grille
    for i in range(10):
        F.box((1.0, 0.03, 0.03), at=(0, 3.485, 1.58 + i * 0.065), mat=DARK, bevel=0)
    for s in (-1, 1):
        veh.lamp(F, T((s * 0.42, 3.49, 2.16)), r=0.075, lit="emit_white")
    # front ballast weights
    for i in range(9):
        F.box((0.085, 0.42, 0.62), at=(-0.4 + i * 0.1, 3.72, 1.32), mat=RED2, bevel=0.012)
    F.box((1.2, 0.18, 0.14), at=(0, 3.5, 1.2), mat=BLK, bevel=0.02)
    veh.stack(F, T((0.47, 1.45, 2.5)), h=1.55, r=0.07)
    F.cyl(0.11, 0.3, at=(-0.47, 1.5, 2.72), mat=BLK, segs=14, bevel=0.02)                            # air pre-cleaner
    F.cyl(0.05, 0.25, at=(-0.47, 1.5, 2.55), mat=BLK, segs=10, bevel=0)
    # ---- cab on the front frame, over the articulation
    CAB_Z = 1.72
    door = cab(F, Fg, T((0, 0.12, CAB_Z)), w=1.74, l=1.72, h=1.95, door_part="tractor_door")
    F.box((1.5, 1.6, 0.3), at=(0, 0.12, 1.58), mat=BLK, bevel=0.03)                                  # cab sub-frame
    veh.ladder(F, T((-1.02, 0.35, 0.62)) @ R(0, "Z"), 1.1, w=0.5, rungs=4)
    F.box((0.5, 0.55, 0.03), at=(-1.12, 0.35, 1.74), mat="tread_plate", bevel=0.006)
    for z in (1.95, 2.6):
        F.box((0.03, 0.03, 0.5), at=(-1.34, 0.12, z), mat="metal_bare", bevel=0.006)
    # front fenders over the duals
    for s in (-1, 1):
        F.box((1.62, 1.5, 0.05), at=(s * (XI + (WW + GAP) / 2), AXF, 2.2), mat=RED, bevel=0.015)
        F.box((1.62, 0.05, 0.3), at=(s * (XI + (WW + GAP) / 2), AXF + 0.76, 2.07), rot=(18, 0, 0), mat=RED, bevel=0.012)
        F.box((0.5, 0.06, 0.06), at=(s * 0.9, AXF, 2.14), mat=BLK, bevel=0.01)
    # fuel/hydraulic tanks beside the frame
    for s in (-1, 1):
        F.box((0.42, 1.0, 0.6), at=(s * 0.78, 0.95, 1.25), mat=RED, bevel=0.06)
    # ---- rear frame
    Rr.box((1.05, 3.1, 0.5), at=(0, -1.75, 1.2), mat=BLK, bevel=0.03)
    Rr.box((2.5, 0.55, 0.55), at=(0, AXR, WR), mat=BLK, bevel=0.06)
    Rr.box((1.7, 1.5, 0.72), at=(0, -1.85, 1.85), mat=RED, bevel=0.07)                               # main fuel tank
    Rr.cyl(0.06, 0.06, at=(0.55, -1.4, 2.24), mat="metal_bare", segs=10, bevel=0.008)
    Rr.box((1.72, 0.04, 0.12), at=(0, -2.6, 2.0), mat="paint_black", bevel=0.004)
    for s in (-1, 1):
        Rr.box((1.62, 1.5, 0.05), at=(s * (XI + (WW + GAP) / 2), AXR, 2.2), mat=RED, bevel=0.015)
        Rr.box((0.5, 0.06, 0.06), at=(s * 0.9, AXR, 2.14), mat=BLK, bevel=0.01)
        veh.lamp(Rr, T((s * 0.7, -2.62, 1.75)) @ R(180, "Z"), r=0.06, lit="emit_red")
        # three-point hitch lower links + lift arms
        Rr.box((0.08, 1.0, 0.1), at=(s * 0.45, -3.6, 0.78), rot=(8, 0, s * 5), mat=BLK, bevel=0.015)
        Rr.box((0.07, 0.07, 0.7), at=(s * 0.45, -3.55, 1.12), rot=(12, 0, 0), mat=BLK, bevel=0.012)
        # articulation steering cylinders
        Rr.cyl(0.055, 0.8, at=(s * 0.42, -0.35, 1.22), rot=(90, 0, s * 8), mat="metal_dark", segs=12, bevel=0.006)
        Rr.cyl(0.03, 0.5, at=(s * 0.47, 0.25, 1.22), rot=(90, 0, s * 8), mat="gear_silver", segs=10, bevel=0)
    Rr.box((0.7, 0.3, 0.5), at=(0, -3.2, 1.35), mat=BLK, bevel=0.03)                                 # hitch block + couplers
    for i in range(4):
        Rr.cyl(0.025, 0.08, at=(-0.24 + i * 0.16, -3.38, 1.45), rot=(90, 0, 0), mat="metal_bare", segs=8, bevel=0)
    Rr.box((0.16, 0.9, 0.06), at=(0, -3.55, 0.62), mat=BLK, bevel=0.012)                             # drawbar
    Rr.cyl(0.02, 0.12, at=(0, -3.92, 0.66), mat="metal_bare", segs=8, bevel=0)
    Rr.cyl(0.22, 0.4, at=(0, 0, 1.2), mat=BLK, segs=18, bevel=0.03)                                  # pivot bearing
    Rr.box((0.7, 0.55, 0.035), at=(0, -2.85, 2.24), mat="paint_orange", bevel=0.004)                 # slow-vehicle triangle plate area

    front = F.finish(sharp=38, col=0)
    fglass = Fg.finish(sharp=38, col=0, shadow=0, parent=front)
    rear = Rr.finish(sharp=38, col=0)
    props(front, part="front", kind="chassis", id="front")
    props(rear, part="rear", kind="chassis", id="rear")
    dob = door.finish(sharp=38, parent=front, at=(-0.87 + 0.03, 0.12 - 0.86 + 0.07, CAB_Z))
    props(dob, kind="vdoor", id="cab", part="door_cab", angle=-80, dynamic=1, col=0)
    # dual wheels: one mesh, four instances
    wp = veh.wheel_part("tractor_dual", WR, WW, 0.56, "ag", rim_mat="paint_white", dual=True, gap=GAP, lugs=24, outer=1)
    w0 = wp.finish(sharp=40, parent=front, at=(XI + (WW + GAP) / 2, AXF, WR))
    props(w0, kind="wheel", id="fr", part="wheel_fr", radius=WR, dynamic=1, col=0)
    wheels = [w0]
    for wid, par, x, y, rz in (("fl", front, -1, AXF, 180), ("rr", rear, 1, AXR, 0), ("rl", rear, -1, AXR, 180)):
        o = instance(w0, f"tractor_wheel_{wid}", at=(x * (XI + (WW + GAP) / 2), y, WR), rot=(0, 0, rz), parent=par, id=wid, part=f"wheel_{wid}")
        wheels.append(o)
    marker("seat", "driver", at=(0, 0.12 - 0.25, CAB_Z + 0.08), parent=front, eye=1.2, label="Operate tractor")
    marker("exit", "driver", at=(-2.6, 0.4, 0.0), parent=front)
    marker("light", "work_f", at=(0, 1.1, CAB_Z + 2.05), parent=front, light="spot", power=1200, dist=60, color=[1.0, 0.95, 0.85])
    marker("hitch", "rear", at=(0, -3.92, 0.66), parent=rear)
    marker("vehicle", "tractor", at=(0, 0, 0), half=[2.2, 3.9, 0.7], body_z=1.5, cab_half=[0.9, 0.9, 1.0], cab_y=0.12, cab_z=2.7,
           mass=18000.0, wheelbase=AXF - AXR, track=2 * (XI + (WW + GAP) / 2), wheel_r=WR, articulated=1)
    bake_ao([front, rear, dob, w0], ground_z=0.0, local_dist=1.2)
    return [front, rear]


# ======================================================================================= COMBINE
def flighting(P, r0, r1, length, turns, M, mat="metal_bare", hand=1):
    """Helical auger blade (both faces) along local X, centred on the origin."""
    n = int(turns * 16)
    verts, faces = [], []
    for i in range(n + 1):
        a = hand * math.tau * turns * i / n
        x = -length / 2 + length * i / n
        verts += [(x, math.cos(a) * r0, math.sin(a) * r0), (x, math.cos(a) * r1, math.sin(a) * r1)]
    for i in range(n):
        a = i * 2
        faces += [(a, a + 1, a + 3, a + 2), (a + 2, a + 3, a + 1, a)]
    P.mesh(verts, faces, mat=mat, M=M, recalc=False, bevel=0)


def combine():
    reset()
    B, G = Part("combine_body"), Part("combine_glass")
    AXF, AXR = 1.55, -2.55
    WRF, WWF, WRR, WWR = 0.98, 0.85, 0.62, 0.5
    # ---- chassis + axles
    B.box((1.6, 5.4, 0.4), at=(0, -0.6, 1.0), mat=BLK, bevel=0.03)
    B.box((2.6, 0.5, 0.5), at=(0, AXF, WRF), mat=BLK, bevel=0.06)
    B.box((2.4, 0.3, 0.3), at=(0, AXR, WRR + 0.05), mat=BLK, bevel=0.04)
    # ---- main body: threshing section with side shields
    B.box((3.0, 5.3, 1.9), at=(0, -0.6, 2.05), mat=RED, bevel=0.06)
    for s in (-1, 1):
        for i, (y0, y1) in enumerate(((-3.1, -1.5), (-1.42, 0.2), (0.28, 1.95))):
            B.box((0.05, y1 - y0, 1.6), at=(s * 1.52, (y0 + y1) / 2, 2.05), mat=RED, bevel=0.03)        # removable shields
            B.box((0.03, 0.2, 0.04), at=(s * 1.56, (y0 + y1) / 2, 1.5), mat=BLK, bevel=0.01)            # latch
            for k in range(6):
                B.box((0.02, (y1 - y0) * 0.7, 0.02), at=(s * 1.55, (y0 + y1) / 2, 2.35 + k * 0.07), mat=RED2, bevel=0)   # louvres
        B.box((0.02, 4.9, 0.14), at=(s * 1.555, -0.6, 2.92), mat="paint_black", bevel=0.004)             # stripe
        B.box((0.02, 4.9, 0.05), at=(s * 1.555, -0.6, 2.8), mat="paint_white", bevel=0.003)
    # ---- grain tank with flared extensions and cross braces
    tank = [(-1.5, 3.0), (-1.95, 3.85), (-1.9, 3.9), (1.9, 3.9), (1.95, 3.85), (1.5, 3.0)]
    B.prism(tank, 3.0, plane="XZ", at=(0, -1.9, 0), mat=RED, bevel=0.03)
    B.box((3.2, 2.7, 0.04), at=(0, -0.4, 3.45), mat="rust", bevel=0)                                     # grain surface / floor
    for y in (-1.6, -0.4, 0.8):
        B.box((3.7, 0.05, 0.05), at=(0, y, 3.88), mat=BLK, bevel=0.008)
    # ---- engine deck, radiator screen, rear hood, exhaust
    B.box((3.0, 1.9, 0.9), at=(0, -2.9, 3.4), mat=RED, bevel=0.07)
    B.box((0.04, 1.2, 0.7), at=(1.52, -2.9, 3.4), mat=BLK, bevel=0.01)
    for i in range(8):
        B.box((0.03, 1.1, 0.02), at=(1.545, -2.9, 3.12 + i * 0.08), mat=DARK, bevel=0)
    veh.stack(B, T((-1.0, -3.2, 3.85)), h=0.9, r=0.075)
    B.box((1.5, 1.2, 0.04), at=(0.3, -2.9, 3.87), mat="tread_plate", bevel=0.006)
    veh.ladder(B, T((1.62, -3.6, 0.9)) @ R(180, "Z"), 2.5, w=0.45, rungs=7)
    # ---- straw chopper + spreader at the rear
    B.box((2.4, 0.9, 0.8), at=(0, -3.55, 1.6), mat=RED, bevel=0.06)
    B.box((2.5, 0.6, 0.5), at=(0, -3.95, 1.1), rot=(25, 0, 0), mat=BLK, bevel=0.04)
    for i in range(7):
        B.box((0.02, 0.5, 0.42), at=(-0.9 + i * 0.3, -4.15, 0.95), rot=(25, 0, (i - 3) * 6), mat=DARK, bevel=0)
    for s in (-1, 1):
        veh.lamp(B, T((s * 1.2, -3.86, 2.4)) @ R(180, "Z"), r=0.07, lit="emit_red")
    B.box((0.7, 0.03, 0.62), at=(0, -3.86, 2.6), mat="paint_orange", bevel=0.004)                        # slow-vehicle emblem panel
    # ---- feeder house
    feeder = [(1.9, 0.9), (1.9, 2.0), (3.75, 1.25), (3.9, 0.95), (3.9, 0.55), (3.6, 0.5)]
    B.prism(feeder, 1.4, plane="YZ", at=(-0.7, 0, 0), mat=RED, bevel=0.04)
    B.box((1.5, 0.12, 0.7), at=(0, 3.93, 0.82), mat=BLK, bevel=0.02)
    for s in (-1, 1):
        B.cyl(0.07, 1.1, at=(s * 0.85, 2.5, 0.95), rot=(72, 0, 0), mat="metal_dark", segs=12, bevel=0.006)   # lift cylinders
        B.cyl(0.04, 0.8, at=(s * 0.85, 3.25, 0.72), rot=(72, 0, 0), mat="gear_silver", segs=10, bevel=0)
    # ---- cab, platform, ladder
    CAB_Z = 2.15
    door = cab(B, G, T((0, 2.85, CAB_Z)), w=1.9, l=1.5, h=1.75, door_part="combine_door")
    B.box((2.0, 1.6, 0.25), at=(0, 2.85, CAB_Z - 0.12), mat=BLK, bevel=0.03)
    B.box((0.75, 1.5, 0.04), at=(-1.33, 2.85, CAB_Z), mat="tread_plate", bevel=0.006)
    for y in (2.15, 3.55):
        B.box((0.03, 0.03, 1.0), at=(-1.68, y, CAB_Z + 0.5), mat="metal_bare", bevel=0.006)
    B.box((0.03, 1.4, 0.03), at=(-1.68, 2.85, CAB_Z + 1.0), mat="metal_bare", bevel=0.006)
    veh.ladder(B, T((-1.72, 2.4, 0.75)), CAB_Z - 0.75, w=0.5, rungs=5)
    for s in (-0.6, 0.6):
        veh.lamp(B, T((s, 3.62, CAB_Z + 0.2)), r=0.06, lit="emit_white")
    # ---- unloading auger: folded back along the left side; pivots outward
    A = Part("combine_auger")
    A.cyl(0.21, 5.6, at=(0, -2.8, 0), rot=(90, 0, 0), mat=RED, segs=18, bevel=0.02)
    A.cyl(0.25, 0.5, at=(0, -5.5, -0.1), rot=(70, 0, 0), mat=BLK, segs=18, bevel=0.03)                   # spout
    A.cyl(0.3, 0.5, at=(0, -0.05, 0), rot=(90, 0, 0), mat=BLK, segs=18, bevel=0.03)
    A.cyl(0.26, 0.9, at=(0, 0.0, -0.4), mat=RED, segs=18, bevel=0.03)                                    # elbow down into the tank
    auger = A.finish(sharp=38, at=(-1.78, 0.9, 3.55))
    props(auger, kind="swing", id="auger", part="auger", angle=-95, dynamic=1, col=0)
    B.cyl(0.05, 0.5, at=(-1.75, -3.6, 3.3), rot=(0, 90, 0), mat=BLK, segs=8, bevel=0)                    # auger rest
    # ---- corn head (child part that raises and lowers), rows of pointed snouts and a cross auger
    H = Part("combine_header")
    HW = 6.2
    H.box((HW, 0.5, 0.75), at=(0, 0.45, 0.55), mat=RED, bevel=0.05)                                      # rear frame / trough back
    H.box((HW, 1.0, 0.06), at=(0, 0.85, 0.22), rot=(-8, 0, 0), mat=BLK, bevel=0.01)                      # trough floor
    for s in (-1, 1):
        H.prism([(0.2, 0.15), (0.2, 0.95), (1.2, 0.75), (2.4, 0.28), (2.4, 0.12)], 0.06, plane="YZ", at=(s * HW / 2 - (0.06 if s > 0 else 0), 0, 0), mat=RED, bevel=0.015)
    rows = 8
    pitch = HW / (rows + 1) * 1.02
    for i in range(rows + 1):
        x = -HW / 2 + 0.08 + i * (HW - 0.16) / rows
        hw2 = 0.24 if 0 < i < rows else 0.2
        # snout: a low pointed wedge, glossy red plastic on real machines
        tip, mid, base = 2.75, 1.9, 1.05
        rings = [
            [(x - 0.02, tip, 0.04), (x + 0.02, tip, 0.04), (x + 0.02, tip, 0.08), (x - 0.02, tip, 0.08)],
            [(x - hw2 * 0.75, mid, 0.06), (x + hw2 * 0.75, mid, 0.06), (x + hw2 * 0.4, mid, 0.42), (x - hw2 * 0.4, mid, 0.42)],
            [(x - hw2, base, 0.12), (x + hw2, base, 0.12), (x + hw2 * 0.8, base, 0.62), (x - hw2 * 0.8, base, 0.62)],
        ]
        H.loft(rings, mat=RED, bevel=0.02, cap_a=True, cap_b=True)
        H.box((hw2 * 1.5, 0.5, 0.05), at=(x, 0.86, 0.62), rot=(8, 0, 0), mat=RED, bevel=0.012)           # hood behind the snout
        if i < rows:
            xm = x + (HW - 0.16) / rows / 2
            # gathering chains + deck plates between snouts
            for s in (-1, 1):
                H.box((0.05, 1.0, 0.05), at=(xm + s * 0.07, 1.45, 0.16), rot=(-6, 0, 0), mat="metal_dark", bevel=0.008)
                for k in range(6):
                    H.box((0.07, 0.03, 0.05), at=(xm + s * 0.1, 1.0 + k * 0.17, 0.2 + k * 0.018), mat="metal_bare", bevel=0.004)
    header = H.finish(sharp=38, at=(0, 3.9, 0.0))
    props(header, kind="lift", id="header", part="header", travel=1.1, dynamic=1, col=0)
    X = Part("combine_header_auger")
    X.cyl(0.13, HW - 0.2, rot=(0, 90, 0), mat="metal_dark", segs=14, bevel=0)
    flighting(X, 0.13, 0.3, HW / 2 - 0.5, 4.5, T((-HW / 4 - 0.15, 0, 0)), hand=1)
    flighting(X, 0.13, 0.3, HW / 2 - 0.5, 4.5, T((HW / 4 + 0.15, 0, 0)), hand=-1)
    for a in range(4):
        X.box((0.5, 0.03, 0.2), M=Matrix.Rotation(a * math.pi / 2, 4, "X") @ T((0, 0, 0.2)), mat="metal_bare", bevel=0.004)
    xa = X.finish(sharp=38, parent=header, at=(0, 0.72, 0.52))
    props(xa, kind="spin", id="header_auger", part="header_auger", axis="x", dynamic=1, col=0)

    body = B.finish(sharp=38, col=0)
    glass = G.finish(sharp=38, col=0, shadow=0)
    props(body, part="body", kind="chassis", id="body")
    dob = door.finish(sharp=38, at=(-0.95 + 0.03, 2.85 - 0.75 + 0.07, CAB_Z))
    props(dob, kind="vdoor", id="cab", part="door_cab", angle=-80, dynamic=1, col=0)
    wf = veh.wheel_part("combine_wheel_front", WRF, WWF, 0.5, "ag", rim_mat="paint_white", lugs=22, outer=1)
    w0 = wf.finish(sharp=40, at=(1.75, AXF, WRF))
    props(w0, kind="wheel", id="fr", part="wheel_fr", radius=WRF, dynamic=1, col=0)
    instance(w0, "combine_wheel_fl", at=(-1.75, AXF, WRF), rot=(0, 0, 180), id="fl", part="wheel_fl")
    wr = veh.wheel_part("combine_wheel_rear", WRR, WWR, 0.3, "ag", rim_mat="paint_white", lugs=16, outer=1)
    w1 = wr.finish(sharp=40, at=(1.3, AXR, WRR))
    props(w1, kind="wheel", id="rr", part="wheel_rr", radius=WRR, steer=1, dynamic=1, col=0)
    instance(w1, "combine_wheel_rl", at=(-1.3, AXR, WRR), rot=(0, 0, 180), id="rl", part="wheel_rl")
    marker("seat", "driver", at=(0, 2.6, CAB_Z + 0.08), eye=1.2, label="Operate combine")
    marker("exit", "driver", at=(-3.0, 2.6, 0.0))
    marker("light", "work_f", at=(0, 3.7, CAB_Z + 1.85), light="spot", power=1400, dist=60, color=[1.0, 0.95, 0.85])
    marker("vehicle", "combine", at=(0, 0, 0), half=[1.9, 4.2, 1.0], body_z=2.0, cab_half=[0.95, 0.75, 0.9], cab_y=2.85, cab_z=3.0,
           mass=16000.0, wheelbase=AXF - AXR, track=3.5, wheel_r=WRF, rear_steer=1, header_w=HW)
    bake_ao([body, header, xa, auger, dob, w0, w1], ground_z=0.0, local_dist=1.2)
    return [body]


# ======================================================================================= GRAIN CART
def grain_cart():
    reset()
    B = Part("cart_body")
    WR, WW = 0.95, 0.85
    # hopper: flared top, funnel bottom
    top_w, top_l, bot_w, bot_l = 3.5, 5.6, 1.3, 2.4
    z0, z1, z2 = 1.05, 2.3, 3.25
    rings = [
        [(-bot_w / 2, -bot_l / 2, z0), (bot_w / 2, -bot_l / 2, z0), (bot_w / 2, bot_l / 2, z0), (-bot_w / 2, bot_l / 2, z0)],
        [(-top_w / 2, -top_l / 2, z1), (top_w / 2, -top_l / 2, z1), (top_w / 2, top_l / 2, z1), (-top_w / 2, top_l / 2, z1)],
        [(-top_w / 2 - 0.08, -top_l / 2 - 0.08, z2), (top_w / 2 + 0.08, -top_l / 2 - 0.08, z2), (top_w / 2 + 0.08, top_l / 2 + 0.08, z2), (-top_w / 2 - 0.08, top_l / 2 + 0.08, z2)],
    ]
    B.loft(rings, mat=RED2, cap_a=True, cap_b=False, bevel=0.03)
    # inner surface (visible from above) and grain
    B.loft([[(p[0] * 0.97, p[1] * 0.985, p[2] + 0.02) for p in r] for r in reversed(rings)], mat="rust", cap_a=False, cap_b=True, bevel=0, flip=False)
    B.box((top_w - 0.1, top_l - 0.1, 0.05), at=(0, 0, 2.75), mat="sand", bevel=0)
    # vertical ribs and top rail
    for s in (-1, 1):
        for i in range(6):
            y = -top_l / 2 + 0.3 + i * (top_l - 0.6) / 5
            B.box((0.07, 0.09, z2 - z1), at=(s * (top_w / 2 + 0.05), y, (z1 + z2) / 2), mat=RED, bevel=0.01)
        B.box((0.1, top_l + 0.2, 0.1), at=(s * (top_w / 2 + 0.08), 0, z2), mat=RED, bevel=0.02)
    for s in (-1, 1):
        B.box((top_w + 0.2, 0.1, 0.1), at=(0, s * (top_l / 2 + 0.08), z2), mat=RED, bevel=0.02)
        for i in range(4):
            x = -top_w / 2 + 0.4 + i * (top_w - 0.8) / 3
            B.box((0.09, 0.07, z2 - z1), at=(x, s * (top_l / 2 + 0.05), (z1 + z2) / 2), mat=RED, bevel=0.01)
    for y in (-1.6, 0, 1.6):                                                                              # tarp bows
        B.pipe([(-top_w / 2, y, z2), (-top_w / 4, y, z2 + 0.32), (top_w / 4, y, z2 + 0.32), (top_w / 2, y, z2)], 0.02, mat="metal_bare", segs=6)
    # frame, axle, tongue, jack
    B.box((1.5, 4.6, 0.25), at=(0, 0.2, 0.95), mat=BLK, bevel=0.03)
    B.box((3.2, 0.3, 0.3), at=(0, -0.3, WR), mat=BLK, bevel=0.04)
    B.prism([(-0.6, 2.4), (0.6, 2.4), (0.12, 4.9), (-0.12, 4.9)], 0.18, at=(0, 0, 0.72), mat=BLK, bevel=0.02)
    B.cyl(0.05, 0.75, at=(0.3, 4.2, 0.45), mat="metal_bare", segs=10, bevel=0)
    B.box((0.2, 0.2, 0.03), at=(0.3, 4.2, 0.05), mat=BLK, bevel=0.006)
    B.tube(0.09, 0.05, 0.05, at=(0, 5.0, 0.74), mat="metal_bare", segs=14, bevel=0.006)
    # unloading auger folded diagonally across the front-left corner
    B.cyl(0.22, 4.4, at=(-1.55, 1.9, 2.55), rot=(0, 62, 90), mat=RED, segs=16, bevel=0.02)
    B.cyl(0.26, 0.5, at=(-1.75, 3.85, 3.6), rot=(0, 30, 90), mat=BLK, segs=16, bevel=0.03)
    B.box((0.5, 0.5, 0.7), at=(-0.9, 2.3, 1.25), mat=BLK, bevel=0.04)                                    # gearbox
    veh.ladder(B, T((1.2, 2.95, 1.0)) @ R(-90, "Z"), 2.2, w=0.42, rungs=6)
    for s in (-1, 1):
        veh.lamp(B, T((s * 1.4, -2.9, 2.0)) @ R(180, "Z"), r=0.07, lit="emit_red")
    B.box((0.6, 0.03, 0.52), at=(0, -2.93, 2.5), mat="paint_orange", bevel=0.004)
    body = B.finish(sharp=38, col=0)
    props(body, part="body", kind="chassis", id="body")
    wp = veh.wheel_part("cart_wheel", WR, WW, 0.5, "ag", rim_mat="paint_white", lugs=22, outer=1)
    w0 = wp.finish(sharp=40, at=(1.75, -0.3, WR))
    props(w0, kind="wheel", id="r", part="wheel_r", radius=WR, dynamic=1, col=0)
    instance(w0, "cart_wheel_l", at=(-1.75, -0.3, WR), rot=(0, 0, 180), id="l", part="wheel_l")
    marker("hitch", "front", at=(0, 5.0, 0.74))
    marker("vehicle", "cart", at=(0, 0, 0), half=[1.8, 2.9, 1.2], body_z=2.2, mass=6000.0, wheel_r=WR)
    bake_ao([body, w0], ground_z=0.0, local_dist=1.2)
    return [body]


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    pv = "--preview" in sys.argv
    if not only or "tractor" in only:
        tractor()
        if pv:
            preview("tractor", (7.5, 9.0, 4.2), (0, 0.2, 1.9), res=(1200, 700), lens=45, samples=40, sun_rot=(50, 0, 30))
        export_glb("tractor")
        save_blend("tractor")
    if not only or "combine" in only:
        combine()
        if pv:
            preview("combine", (-10.5, 11.5, 5.0), (0, 0.6, 2.0), res=(1200, 700), lens=45, samples=40, sun_rot=(50, 0, -30))
        export_glb("combine")
        save_blend("combine")
    if not only or "cart" in only:
        grain_cart()
        if pv:
            preview("grain_cart", (7.0, 8.0, 4.0), (0, 0.5, 1.9), res=(1200, 700), lens=45, samples=40, sun_rot=(50, 0, 30))
        export_glb("grain_cart")
        save_blend("grain_cart")
