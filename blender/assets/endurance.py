"""The Endurance (references 8, 9 and 10; dimensions in docs/REFERENCE_NOTES.md).

Frame: Blender +Y is the spin axis and the direction of thrust (forward), the ring lies in the XZ plane.
Clock positions are as seen in the forward view (looking at the ship from +Y): 12 o'clock = +Z, 3 o'clock = -X.

  * 12 modules every 30 deg with the outer face at r = 32 m (ring diameter 64 m / 210 ft), sized by type (DIMS):
    engine blocks 9.0 x 8.4 x 11.0 m (tangential x axial x radial), command 8.2 x 7.8 x 11.6, the others
    7.6 x 7.6 x 10.6: 12 Habitat, 1 Pod, 2 Engine, 3 Habitat (spine), 4 Engine, 5 Pod, 6 Cryo-lab, 7 Pod, 8 Engine,
    9 Command, 10 Engine, 11 Pod
  * knuckle nodes between modules at r = 24 m joined to the module sides by short tunnels; four ring airlocks
  * central hub on the axis: axial docking ports fore and aft (Rangers, rear hatch), radial ports at 12 and 6 o'clock
    (Landers); a three-segment spine to the 3 o'clock habitat and a short capped stub toward 9 o'clock.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from fac import T, RX, RY, RZ  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

R_OUT = 32.0
MOD_RAD, MOD_TAN, MOD_AX = 10.6, 7.6, 7.6     # the common module (pods, habitats, cryo-lab)
R_IN = R_OUT - MOD_RAD          # 21.4
R_NODE = 24.0
HUB_R, HUB_L = 2.6, 9.0
SPIN_RPM = 5.25
# Module sizes by type (tangential W, axial D, radial H; outer face at R_OUT). Measured against references 8-10:
# the axial depth is about the width, engine blocks are the chunkiest, the command module reaches furthest in.
DIMS = {
    "engine": (9.0, 8.4, 11.0),
    "pod": (7.6, 7.6, 10.6),
    "habitat": (7.6, 7.6, 10.6),
    "command": (8.2, 7.8, 11.6),
    "cryo": (7.6, 7.6, 10.6),
}
# window centres as radii from the spin axis, shared with the interiors
R_WIN_UP = 23.6       # window clusters of the corridor deck (1.4 m above its floor at r = 25 m)
R_WIN_CMD = 27.75     # command deck windows (1.25 m above the main deck floor at r = 29 m)
R_WIN_MAIN = 27.6     # 2 x 2 window clusters of the other main decks (1.4 m above the floor)

KINDS = ["habitat", "pod", "engine", "habitat", "engine", "pod", "cryo", "pod", "engine", "command", "engine", "pod"]
NAMES = ["Habitat A", "Landing pod 1", "Engine 1", "Habitat B", "Engine 2", "Landing pod 2", "Cryo-lab", "Landing pod 3",
         "Engine 3", "Command", "Engine 4", "Landing pod 4"]


def dims(i):
    return DIMS[KINDS[i % 12]]


def mod_rc(i):
    """Radius of the module's centre."""
    return R_OUT - dims(i)[2] / 2


def clock(i):
    """Angle (rad) of clock position i (0 = 12 o'clock), clockwise in the forward view."""
    return math.radians(30 * i)


def radial(theta):
    return Vector((-math.sin(theta), 0.0, math.cos(theta)))


def frame_at(theta, r):
    """Local frame at clock angle theta and radius r: x tangential (clockwise), y axial (forward), z radial (out)."""
    zr = radial(theta)
    yv = Vector((0, 1, 0))
    xt = yv.cross(zr).normalized()
    M = Matrix.Identity(4)
    for i in range(3):
        M[i][0], M[i][1], M[i][2], M[i][3] = xt[i], yv[i], zr[i], (zr * r)[i]
    return M


def chamfer_box(P, size, M, mat, c=0.5):
    """Box with large chamfers on the four edges parallel to local z (the long radial edges)."""
    sx, sy, sz = size
    pts = [(-sx / 2 + c, -sy / 2), (sx / 2 - c, -sy / 2), (sx / 2, -sy / 2 + c), (sx / 2, sy / 2 - c), (sx / 2 - c, sy / 2),
           (-sx / 2 + c, sy / 2), (-sx / 2, sy / 2 - c), (-sx / 2, -sy / 2 + c)]
    P.prism(pts, sz, M=M @ T((0, 0, -sz / 2)), mat=mat, bevel=0.06)


def panel_array(P, M, w, h, cols, rows, mat="radiator_blue", frame="hull_gray"):
    """Grid of recessed blue-grey panels in a light frame; local -Y faces out of the surface."""
    P.box((w + 0.16, 0.05, h + 0.16), M=M @ T((0, -0.025, 0)), mat=frame, bevel=0.02)
    pw, ph = (w - 0.06 * (cols - 1)) / cols, (h - 0.06 * (rows - 1)) / rows
    for i in range(cols):
        for j in range(rows):
            x = -w / 2 + pw / 2 + i * (pw + 0.06)
            z = -h / 2 + ph / 2 + j * (ph + 0.06)
            P.box((pw, 0.04, ph), M=M @ T((x, -0.06, z)), mat=mat, bevel=0.008)


def panel_strips(P, M, strip_w, h, gap, rows, mat="radiator_blue", frame="hull_gray"):
    """Two tall panel strips side by side, each divided into small cells (references 8 and 10). Local -Y out."""
    for s_ in (-1, 1):
        x = s_ * (strip_w + gap) / 2
        P.box((strip_w + 0.12, 0.05, h + 0.12), M=M @ T((x, -0.025, 0)), mat=frame, bevel=0.015)
        ch = (h - 0.04 * (rows - 1)) / rows
        for j in range(rows):
            z = -h / 2 + ch / 2 + j * (ch + 0.04)
            for c in (-1, 1):
                P.box((strip_w / 2 - 0.03, 0.04, ch), M=M @ T((x + c * strip_w / 4, -0.06, z)), mat=mat, bevel=0.006)


def window_frame(P, M, w, h, f=0.05, depth=0.05, mat="hull_black"):
    """Open window frame (four bars) so the window can be seen through from inside; local -Y out of the hull."""
    for sz in (1, -1):
        P.box((w + 2 * f, depth, f), M=M @ T((0, -0.02, sz * (h / 2 + f / 2))), mat=mat, bevel=0.01)
    for sx in (1, -1):
        P.box((f, depth, h), M=M @ T((sx * (w / 2 + f / 2), -0.02, 0)), mat=mat, bevel=0.01)


def window_cluster(P, M, cols=2, rows=3, s=0.32, gap=0.12):
    for i in range(cols):
        for j in range(rows):
            x = (i - (cols - 1) / 2) * (s + gap)
            z = (j - (rows - 1) / 2) * (s + gap)
            window_frame(P, M @ T((x, 0, z)), s, s, f=0.04)
            P.box((s, 0.012, s), M=M @ T((x, -0.03, z)), mat="glass", bevel=0.003)


def rcs_quad(P, M):
    """Reaction-control quad on a stand-off; local +Z points away from the hull."""
    P.box((0.5, 0.5, 0.3), M=M @ T((0, 0, 0.15)), mat="hull_gray", bevel=0.04)
    P.box((0.8, 0.8, 0.25), M=M @ T((0, 0, 0.42)), mat="hull_white", bevel=0.05)
    for a in range(4):
        Mn = M @ T((0, 0, 0.42)) @ RZ(90 * a) @ T((0.42, 0, 0)) @ RY(90)
        P.cyl(0.07, 0.16, r2=0.11, M=Mn @ T((0, 0, 0.08)), mat="thruster", segs=10, bevel=0)
    P.cyl(0.07, 0.16, r2=0.11, M=M @ T((0, 0, 0.62)), mat="thruster", segs=10, bevel=0)


def module(P, idx, rnd):
    kind = KINDS[idx]
    th = clock(idx)
    rc = mod_rc(idx)
    F = frame_at(th, rc)
    W, D, H = dims(idx)
    body = {"engine": "hull_white", "cryo": "hull_gray"}.get(kind, "hull_white")
    chamfer_box(P, (W, D, H), F, body, c=0.55 if kind == "engine" else 0.35)
    # end caps: outer face with a thermal-blanket panel, inner face darker with the tunnel collars
    P.box((W - 0.9, D - 0.9, 0.1), M=F @ T((0, 0, H / 2 + 0.03)), mat="hull_blanket", bevel=0.05)
    P.box((W - 1.0, D - 1.0, 0.12), M=F @ T((0, 0, -H / 2 - 0.04)), mat="hull_black", bevel=0.05)
    # tangential side faces: black blanket band on the lower half (reference 8 shows dark side faces)
    for sx in (1, -1):
        M = F @ T((sx * (W / 2 + 0.02), 0, -H * 0.2)) @ RZ(90 * sx)
        P.box((D - 1.0, 0.04, H * 0.5), M=M, mat="hull_tiles", bevel=0.02)
        for k in range(3):
            P.box((D - 1.2, 0.06, 0.06), M=F @ T((sx * (W / 2 + 0.04), 0, H * 0.18 + k * 1.1)) @ RZ(90), mat="hull_gray", bevel=0.01)
    if kind in ("habitat", "pod", "cryo", "command"):
        # forward and aft faces: big panel arrays + window cluster near the inner end
        for sy in (1, -1):
            Mf = F @ T((0, sy * (D / 2), 0)) @ RZ(180 if sy > 0 else 0)
            arr_h = H * (0.6 if kind != "command" else 0.36)
            panel_strips(P, Mf @ T((0.45, 0.0, H / 2 - arr_h / 2 - 0.55)), W * 0.2, arr_h, 0.18, 9 if kind != "command" else 5,
                         mat="radiator_blue" if kind != "cryo" else "hull_frame")
            window_cluster(P, Mf @ T((-W * 0.3, 0.0, R_WIN_UP - rc)), 2, 3)
            if kind != "command":
                window_cluster(P, Mf @ T((-W * 0.3, 0.0, R_WIN_MAIN - rc)), 2, 2)
            if kind == "command":
                # flight deck: a wide band of windows at eye level of the lower deck (floor at r = 29 m)
                for k in range(5):
                    window_frame(P, Mf @ T((-1.9 + k * 0.95, 0, R_WIN_CMD - rc)), 0.78, 0.52, f=0.06, depth=0.06)
                    P.box((0.78, 0.012, 0.52), M=Mf @ T((-1.9 + k * 0.95, -0.03, R_WIN_CMD - rc)), mat="glass", bevel=0.004)
            # small vents and boxes
            for k in range(rnd.randint(2, 4)):
                P.box((rnd.uniform(0.3, 0.8), 0.18, rnd.uniform(0.2, 0.5)), M=Mf @ T((rnd.uniform(-W / 2 + 0.6, W / 2 - 0.6), -0.09, rnd.uniform(-H / 2 + 0.6, -H * 0.1))), mat=rnd.choice(["hull_gray", "hull_black", "hull_white"]), bevel=0.02)
    if kind == "engine":
        # aft face: two main engine bells and a thrust structure; forward face: a plain access panel
        Ma = F @ T((0, -D / 2, 0))
        P.box((W - 1.2, 0.3, H - 1.2), M=Ma @ T((0, -0.15, 0)), mat="hull_gray", bevel=0.06)
        for k in (-1, 1):
            Mn = F @ T((0, -D / 2 - 0.3, k * 2.4)) @ RX(90)
            prof = [(0.55, 0.0), (0.62, 0.35), (0.95, 1.0), (1.25, 1.7), (1.42, 2.3)]
            P.lathe(prof, M=Mn, mat="thruster", segs=28)
            P.lathe([(r * 0.95, z) for r, z in reversed(prof)], M=Mn, mat="engine_dark", segs=28)
            P.cyl(0.75, 0.5, M=Mn @ T((0, 0, -0.2)), mat="metal_dark", segs=20, bevel=0.03)
        Mf = F @ T((0, D / 2, 0))
        P.box((W - 1.4, 0.12, H - 1.6), M=Mf @ T((0, 0.04, 0)), mat="hull_gray", bevel=0.04)
        for k in range(4):
            P.box((W - 1.8, 0.06, 0.1), M=Mf @ T((0, 0.12, -H / 2 + 1.5 + k * 2.4)), mat="hull_white", bevel=0.02)
    # RCS quads on the outer corners
    for sx in (1, -1):
        for sy in (1, -1):
            M = F @ T((sx * (W / 2 - 0.4), sy * (D / 2 - 0.4), H / 2 + 0.05))
            if (idx + (sx > 0) + (sy > 0)) % 2 == 0:
                rcs_quad(P, M)
    # tunnel collars on both tangential sides, inner part (they meet the node tunnels)
    for sx in (1, -1):
        M = F @ T((sx * (W / 2), 0, R_NODE - rc)) @ RY(90 * sx)
        P.cyl(1.25, 0.6, M=M @ T((0, 0, 0.3)), mat="hull_gray", segs=24, bevel=0.04, caps=False)
    return F


def node(P, idx):
    """Knuckle node between module idx and idx+1: a short cylinder along the spin axis with ring ports."""
    th = clock(idx) + math.radians(15)
    F = frame_at(th, R_NODE)
    P.cyl(1.7, 3.6, M=F @ RX(90), mat="hull_white", segs=32, bevel=0.08)
    for sy in (1, -1):
        P.tube(1.75, 1.2, 0.3, M=F @ T((0, sy * 1.9, 0)) @ RX(90), mat="hull_gray", segs=32, bevel=0.03)
        P.cyl(1.05, 0.12, M=F @ T((0, sy * 1.95, 0)) @ RX(90), mat="hull_black", segs=28, bevel=0.01)
        P.cyl(0.4, 0.16, M=F @ T((0, sy * 2.0, 0)) @ RX(90), mat="metal_dark", segs=16, bevel=0.01)
    # tunnels to both neighbouring modules (straight chord at the node radius)
    for d in (-1, 1):
        th2 = th + d * math.radians(15)
        F2 = frame_at(th2, R_NODE)
        side = F2 @ Vector((-d * dims(idx if d < 0 else idx + 1)[0] / 2, 0, 0))
        a = F @ Vector((0, 0, 0))
        v = side - a
        L = v.length
        dvec = v.normalized()
        a2 = a + dvec * 1.2
        Lt = max(0.3, (side - a2).length + 0.1)
        q = Vector((0, 0, 1)).rotation_difference(dvec).to_matrix().to_4x4()
        Mt = T(a2 + dvec * (Lt / 2)) @ q
        P.cyl(1.1, Lt, M=Mt, mat="hull_white", segs=24, bevel=0.03, caps=False)
        P.tube(1.22, 1.08, 0.22, M=Mt, mat="hull_gray", segs=24, bevel=0.02)
    return F


def airlock(P, idx):
    """Outward-pointing ring airlock on node idx."""
    th = clock(idx) + math.radians(15)
    F = frame_at(th, R_NODE)
    P.cyl(0.95, 2.6, M=F @ T((0, 0, 2.6)), mat="hull_white", segs=24, bevel=0.05)
    P.tube(1.15, 0.8, 0.4, M=F @ T((0, 0, 3.9)), mat="hull_gray", segs=28, bevel=0.03)
    P.cyl(0.78, 0.08, M=F @ T((0, 0, 4.1)), mat="hull_black", segs=24, bevel=0.01)
    for k in range(4):
        P.box((0.18, 0.18, 2.2), M=F @ RZ(45 + 90 * k) @ T((0, 0.0, 0)) @ T((0.95, 0, 2.6)), mat="handle_yellow", bevel=0.02)
    marker("airlock", f"ring{idx}", at=(F @ Vector((0, 0, 4.2)))[:])


HUB_HATCHES = []


def hub():
    P = Part("endurance_hub")
    # core cylinder along the spin axis with stiffening rings and equipment
    P.cyl(HUB_R, HUB_L, rot=(90, 0, 0), mat="hull_white", segs=40, bevel=0.1)
    for y in (-3.4, -1.2, 1.2, 3.4):
        P.tube(HUB_R + 0.18, HUB_R - 0.05, 0.4, at=(0, y, 0), rot=(90, 0, 0), mat="hull_gray", segs=40, bevel=0.03)
    # axial docking ports (Rangers): androgynous ring with guide petals and a hatch
    for sy, pid in ((1, "axial_fwd"), (-1, "axial_aft")):
        y0 = sy * HUB_L / 2
        P.cyl(1.6, 1.0, at=(0, y0 + sy * 0.5, 0), rot=(90, 0, 0), mat="hull_white", segs=32, bevel=0.06)
        P.tube(1.45, 0.95, 0.35, at=(0, y0 + sy * 1.15, 0), rot=(90, 0, 0), mat="gear_metal", segs=32, bevel=0.03)
        for k in range(3):
            a = math.radians(120 * k)
            P.box((0.5, 0.5, 0.12), at=(math.cos(a) * 1.18, y0 + sy * 1.5, math.sin(a) * 1.18), rot=(90, math.degrees(a) + 90, 0), mat="handle_yellow", bevel=0.02)
        marker("dock", pid, at=(0, y0 + sy * 1.4, 0), dir=[0, sy, 0], up=[0, 0, 1], port="axial", accepts="ranger", label="Axial docking port")
        # the port's pressure hatch (slides up into the collar once a craft is hard-docked), target cross outside
        Hh = Part(f"endurance_hatch_{pid}")
        Hh.cyl(0.92, 0.06, rot=(90, 0, 0), mat="hull_gray", segs=28, bevel=0)
        for a in (0, 90):
            Hh.box((0.8, 0.04, 0.08), at=(0, sy * 0.04, 0), rot=(0, a, 0), mat="paint_black", bevel=0)
        # inner face: radial stiffening ribs and the rescue arrows of reference 12
        for k in range(12):
            Hh.box((0.03, 0.04, 0.78), M=T((0, -sy * 0.045, 0)) @ RY(15 + 30 * k) @ T((0, 0, 0.42)), mat="metal_steel", bevel=0.004)
        Hh.cyl(0.12, 0.06, at=(0, -sy * 0.06, 0), rot=(90, 0, 0), mat="metal_chrome", segs=20, bevel=0.01)
        HUB_HATCHES.append((Hh, (0, y0 + sy * 1.3, 0), dict(id=pid, part=f"hatch_{pid}", axis=[0, 0, 1], travel=1.0, label="Docking hatch")))
    # radial ports (Landers) at 12 and 6 o'clock, spine collar at 3 o'clock and stub at 9 o'clock
    for clk, pid in ((0, "radial_up"), (6, "radial_down")):
        th = clock(clk)
        F = frame_at(th, HUB_R)
        P.cyl(1.5, 1.4, M=F @ T((0, 0, 0.7)), mat="hull_white", segs=32, bevel=0.06)
        P.tube(1.4, 0.95, 0.35, M=F @ T((0, 0, 1.55)), mat="gear_metal", segs=32, bevel=0.03)
        marker("dock", pid, at=(F @ Vector((0, 0, 1.75)))[:], dir=list(radial(th)), up=[0, 1, 0], port="radial", accepts="lander", label="Radial docking port")
    for clk in (3, 9):
        F = frame_at(clock(clk), HUB_R)
        P.cyl(1.5, 1.0, M=F @ T((0, 0, 0.5)), mat="hull_gray", segs=32, bevel=0.06)
    # equipment boxes and antennas on the hub
    rnd = random.Random(4)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        P.box((0.8, 1.4, 0.5), M=T((math.cos(a) * (HUB_R + 0.2), rnd.uniform(-3, 3), math.sin(a) * (HUB_R + 0.2))) @ RY(-math.degrees(a) + 90), mat=rnd.choice(["hull_gray", "hull_black"]), bevel=0.04)
    P.cyl(0.04, 5.0, at=(1.8, 1.6, 2.8), rot=(0, 30, 0), mat="metal_bare", segs=6, bevel=0)
    P.sphere(0.9, at=(-1.9, -2.2, 2.6), mat="hull_white", segs=20, rings=10, scale=(1, 1, 0.35))
    return P


def spine_and_stub():
    P = Part("endurance_spine")
    th = clock(3)
    r0, r1 = HUB_R + 1.0, R_IN
    segs = 3
    L = (r1 - r0) / segs
    for k in range(segs):
        a, b = r0 + k * L, r0 + (k + 1) * L
        F = frame_at(th, (a + b) / 2)
        P.cyl(1.35, L - 0.6, M=F, mat="hull_white", segs=28, bevel=0.06, caps=False)
        P.tube(1.62, 1.3, 0.9, M=F @ T((0, 0, L / 2 - 0.2)), mat="hull_white", segs=28, bevel=0.06)
        P.tube(1.66, 1.6, 0.18, M=F @ T((0, 0, L / 2 - 0.65)), mat="hull_gray", segs=28, bevel=0.02)
        for j in range(4):
            P.box((0.12, 0.12, L - 1.6), M=F @ RZ(45 + 90 * j) @ T((1.38, 0, 0)), mat="hull_gray", bevel=0.02)
    # stub toward 9 o'clock: one segment, capped
    F = frame_at(clock(9), HUB_R + 3.2)
    P.cyl(1.35, 4.4, M=F, mat="hull_white", segs=28, bevel=0.06, caps=False)
    P.cyl(1.55, 0.5, M=F @ T((0, 0, 2.3)), mat="hull_gray", segs=28, bevel=0.08)
    P.sphere(1.2, M=F @ T((0, 0, 2.5)) @ Matrix.Diagonal((1, 1, 0.35, 1)), mat="hull_white", segs=24, rings=10)
    return P


def ring():
    P = Part("endurance_ring")
    rnd = random.Random(12)
    for i in range(12):
        module(P, i, rnd)
        node(P, i)
    for i in (1, 4, 7, 10):
        airlock(P, i)
    return P


def lights_and_markers():
    for i in range(12):
        th = clock(i)
        F = frame_at(th, R_OUT + 0.15)
        light(f"ring_nav{i}", at=(F @ Vector((0, dims(i)[1] / 2 - 0.4, 0)))[:], color=(1.0, 0.2, 0.1) if i % 3 == 0 else (0.9, 0.95, 1.0), power=8, dist=40, group="endurance_nav")
    for sy in (1, -1):
        for k in range(3):
            a = math.radians(120 * k + 30)
            light(f"dock_flood{sy}{k}", at=(math.cos(a) * 2.2, sy * (HUB_L / 2 + 0.6), math.sin(a) * 2.2), color=(0.95, 0.97, 1.0), power=45, dist=40, kind="spot",
                  rot=(90 * sy, 0, 0), group="endurance_dock")
    for i, (kind, name) in enumerate(zip(KINDS, NAMES)):
        th = clock(i)
        marker("module", f"m{i}", at=(radial(th) * mod_rc(i))[:], kind_name=kind, label=name, clock=i)
    marker("vehicle", "endurance", at=(0, 0, 0), ring_r=R_OUT, spin_rpm=SPIN_RPM, mass=480000)


def collision():
    import bmesh as _bm  # noqa: F811
    out = []

    def hull(name, pts):
        bm = _bm.new()
        for p in pts:
            bm.verts.new(p)
        _bm.ops.convex_hull(bm, input=bm.verts[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat("hull_white"))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        props(ob, colonly=1, hull="convex")
        ob.hide_render = True
        out.append(ob)

    for i in range(12):
        F = frame_at(clock(i), mod_rc(i))
        W, D, H = dims(i)
        hull(f"col_m{i}", [F @ Vector((sx * W / 2, sy * D / 2, sz * H / 2)) for sx in (1, -1) for sy in (1, -1) for sz in (1, -1)])
        Fn = frame_at(clock(i) + math.radians(15), R_NODE)
        hull(f"col_n{i}", [Fn @ Vector((sx * 1.7, sy * 1.8, sz * 1.7)) for sx in (1, -1) for sy in (1, -1) for sz in (1, -1)])
    hull("col_hub", [Vector((sx * (HUB_R + 0.3), sy * (HUB_L / 2 + 1.4), sz * (HUB_R + 0.3))) for sx in (1, -1) for sy in (1, -1) for sz in (1, -1)])
    F0, F1 = frame_at(clock(3), HUB_R), frame_at(clock(3), R_IN)
    hull("col_spine", [F @ Vector((sx * 1.6, sy * 1.6, 0)) for F in (F0, F1) for sx in (1, -1) for sy in (1, -1)])
    return out


def build():
    reset()
    objs = []
    for P, part in ((ring(), "ring"), (hub(), "hub"), (spine_and_stub(), "spine")):
        ob = P.finish(sharp=38, col=0)
        props(ob, part=part)
        objs.append(ob)
    for Ph, loc, kw in HUB_HATCHES:
        ob = Ph.finish(sharp=40, col=0)
        ob.location = loc
        props(ob, kind="hatch", dynamic=1, **kw)
        objs.append(ob)
    lights_and_markers()
    cols = collision()
    bake_ao(objs, rays=12, local_dist=2.5, sky_dist=60.0)
    return objs + cols


def previews():
    preview("endurance_fwd", eye=(-6, 78, 18), target=(0, 0, 0), lens=40, res=(1400, 1100), samples=24, sun_rot=(40, 0, 140), sky=(0.02, 0.02, 0.03), sky_strength=0.3)
    preview("endurance_q", eye=(55, 52, 30), target=(0, 0, 0), lens=40, res=(1600, 1000), samples=24, sun_rot=(30, 20, 60), sky=(0.02, 0.02, 0.03), sky_strength=0.3)
    preview("endurance_hub", eye=(-10, 16, 9), target=(0, 3, 0), lens=30, res=(1600, 1000), samples=24, sun_rot=(30, 20, 120), sky=(0.02, 0.02, 0.03), sky_strength=0.3)


if __name__ == "__main__":
    build()
    if "preview" in sys.argv[1:]:
        previews()
    export_glb("endurance")
    save_blend("endurance")
