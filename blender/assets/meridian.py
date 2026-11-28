"""NASA MERIDIAN orbital platform (Part 2 directive, section 04): the permanent Earth-orbit yard where the warp starship
WSV-1 HALCYON is held, and the Ranger's second destination after launch ("AUTO LAND - ORBITAL PLATFORM").

The platform shares the ship's frame (warpship.py): +Y toward the bow, +Z dorsal (away from the Earth in its parking
attitude), +X starboard, origin on the ship's axis. The ship is far too big for a hangar, so it is held in an exterior
cradle: the platform's long keel runs parallel to it outboard of the field rings (x = KX) and reaches it with
  * two cradle arms that clamp the spine between the rings (forward of the side modules and on the registration
    sleeve), and
  * the access arm: a glazed pressurised gallery crossing the gap between the two rings at deck level, ending over the
    ship's dorsal docking collar in the gangway head, from which a zero-g gangway shaft drops onto the ship's hatch.
Around it: the Ranger landing deck with its berth tower, docking collar and robotic restraints, the keel truss with
laboratory and habitat modules, ring inspection gantries hung on both faces of each ring, a tower crane over the
saucer, solar wings, radiators, refuelling boom, RCS clusters and navigation beacons.

Walkable route (platform_int.glb), floors at Z0 with deck gravity, the Ranger cabin / berth vestibule and the gangway
shaft weightless:
  Ranger cabin -> rear hatch -> berth tunnel -> vestibule (overlooks the landing deck) -> airlock (two pressure doors)
  -> station corridor (windows on the ship) -> operations junction -> access arm / inspection gallery (glazed both
  sides and overhead, a pressure bulkhead half way) -> gangway head -> gangway shaft -> the Halcyon's dorsal hatch.

  platform.glb      exterior, collision, the Ranger berth port (`dock:berth`)
  platform_int.glb  interior rooms, doors (`slide` parts), lights, terminals, posts for the engineers
"""
import math
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
from bl import *  # noqa: E402,F403
from fac import Fac, T, RX, RY, RZ, at  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

KX = 90.0                 # keel centreline (starboard of the rings)
Z0 = 20.0                 # walking floor of the whole route
PZ = 21.45                # berth port axis height
PORT_Y = -58.6            # berth port face
VEST = (KX - 2.4, KX + 2.4, -57.4, -54.4)
LOCK_Y = (-54.4, -50.4)
COR_HW = 1.8
COR_Y1 = -32.8
JUN = (KX - 3.8, KX + 3.8, -32.8, -25.2)
AY, AHW = -29.0, 1.8      # access arm centre line and inner half width
ARM_X0, ARM_X1 = 6.0, KX - 3.8
BULK_X = 62.0             # pressure bulkhead in the arm
HEAD = (-3.4, 6.0, -35.4, -24.6)
GX, GY, GR = 0.0, -32.0, 1.25   # gangway shaft axis and inner radius
G_BOT = 9.95              # the ship's collar top
DECK_Z = PZ - 0.98 - 1.10 - 0.15   # landing deck: the docked Ranger's lowered gear just clear of it
H_ROOM = 2.8

WIN_Z = (Z0 + 0.75, Z0 + 2.35)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def circle(cx, cy, r, n=28):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def arm_windows():
    """Window spans (x0, x1) along the access arm's two walls (the inspection gallery)."""
    out = []
    x = 8.0
    while x + 2.6 <= BULK_X - 1.4:
        out.append((x, x + 2.6))
        x += 3.2
    x = BULK_X + 2.2
    while x + 2.0 <= ARM_X1 - 3.0:
        out.append((x, x + 2.0))
        x += 4.8
    return out


def cor_windows():
    return [(-48.6, -46.6), (-44.8, -42.8), (-41.0, -39.0), (-37.2, -35.2)]


def roof_windows():
    return [(x0 + 0.1, x1 - 0.1) for (x0, x1) in arm_windows() if x1 < BULK_X]


HEAD_WIN = {"aft": [(-2.6, -0.4), (0.4, 2.6), (3.0, 5.2)], "fwd": [(-2.6, -0.4), (0.4, 2.6), (3.0, 5.2)],
            "west": [(-34.6, -32.6), (-31.4, -28.6), (-27.4, -25.4)]}
HEAD_WZ = (Z0 + 0.5, Z0 + 2.9)


# ===================================================================================================== exterior
def skin_box(P, x0, x1, y0, y1, z0, z1, holes=None, t=0.14, mat="hull_white", skip=()):
    """Thin box shell; holes per face {'x0'|'x1': [(y0, y1, z0, z1)], 'y0'|'y1': [(x0, x1, z0, z1)],
    'z0'|'z1': [(x0, x1, y0, y1)] or polygons}."""
    holes = holes or {}

    def hl(face):
        out = []
        for h in holes.get(face, []):
            out.append(rect(h[0], h[2], h[1], h[3])[::-1] if len(h) == 4 and not isinstance(h[0], tuple) else list(h)[::-1])
        return out
    if "y0" not in skip:
        P.prism(rect(x0, z0, x1, z1), t, plane="XZ", M=T((0, y0, 0)), mat=mat, bevel=0, holes=hl("y0"), exact_holes=True)
    if "y1" not in skip:
        P.prism(rect(x0, z0, x1, z1), t, plane="XZ", M=T((0, y1 - t, 0)), mat=mat, bevel=0, holes=hl("y1"), exact_holes=True)
    if "x0" not in skip:
        P.prism(rect(y0, z0, y1, z1), t, plane="YZ", M=T((x0, 0, 0)), mat=mat, bevel=0, holes=hl("x0"), exact_holes=True)
    if "x1" not in skip:
        P.prism(rect(y0, z0, y1, z1), t, plane="YZ", M=T((x1 - t, 0, 0)), mat=mat, bevel=0, holes=hl("x1"), exact_holes=True)
    if "z0" not in skip:
        P.prism(rect(x0, y0, x1, y1), t, plane="XY", M=T((0, 0, z0)), mat=mat, bevel=0, holes=hl("z0"), exact_holes=True)
    if "z1" not in skip:
        P.prism(rect(x0, y0, x1, y1), t, plane="XY", M=T((0, 0, z1 - t)), mat=mat, bevel=0, holes=hl("z1"), exact_holes=True)


def pane_y(G, F, x0, x1, z0, z1, y, frame=True):
    """A window pane in a wall normal to Y (with a frame on the outer face)."""
    G.box((x1 - x0, 0.03, z1 - z0), at=((x0 + x1) / 2, y, (z0 + z1) / 2), mat="glass")
    if frame:
        for (a, b, c, d) in ((x0 - 0.08, x1 + 0.08, z0 - 0.08, z0), (x0 - 0.08, x1 + 0.08, z1, z1 + 0.08),
                             (x0 - 0.08, x0, z0, z1), (x1, x1 + 0.08, z0, z1)):
            F.box((b - a, 0.1, d - c), at=((a + b) / 2, y, (c + d) / 2), mat="hull_gray", bevel=0.01)


def pane_x(G, F, y0, y1, z0, z1, x, frame=True):
    G.box((0.03, y1 - y0, z1 - z0), at=(x, (y0 + y1) / 2, (z0 + z1) / 2), mat="glass")
    if frame:
        for (a, b, c, d) in ((y0 - 0.08, y1 + 0.08, z0 - 0.08, z0), (y0 - 0.08, y1 + 0.08, z1, z1 + 0.08),
                             (y0 - 0.08, y0, z0, z1), (y1, y1 + 0.08, z0, z1)):
            F.box((0.1, b - a, d - c), at=(x, (a + b) / 2, (c + d) / 2), mat="hull_gray", bevel=0.01)


def pane_z(G, F, x0, x1, y0, y1, z):
    G.box((x1 - x0, y1 - y0, 0.03), at=((x0 + x1) / 2, (y0 + y1) / 2, z), mat="glass")
    for (a, b, c, d) in ((x0 - 0.08, x1 + 0.08, y0 - 0.08, y0), (x0 - 0.08, x1 + 0.08, y1, y1 + 0.08),
                         (x0 - 0.08, x0, y0, y1), (x1, x1 + 0.08, y0, y1)):
        F.box((b - a, d - c, 0.1), at=((a + b) / 2, (c + d) / 2, z), mat="hull_gray", bevel=0.01)


def modules_ext(P, G):
    """The pressurised volumes of the walkable route, seen from outside, with the windows exactly where the rooms
    have them."""
    wz0, wz1 = WIN_Z
    # ---- berth tower: vestibule + airlock, the berth collar on its aft face, windows over the landing deck
    tx0, tx1, ty0, ty1 = KX - 3.0, KX + 3.0, -57.8, -50.0
    vw = [(KX - 2.15, KX - 1.35, Z0 + 0.95, Z0 + 2.05), (KX + 1.35, KX + 2.15, Z0 + 0.95, Z0 + 2.05)]
    tun = circle(KX, PZ, 1.0, 32)
    skin_box(P, tx0, tx1, ty0, ty1, Z0 - 0.7, Z0 + 3.6, holes={"y0": vw + [tuple(tun)]})
    for (a, b, c, d) in vw:
        pane_y(G, P, a, b, c, d, ty0 - 0.02)
    # the collar: a short tunnel, flange, guide petals and a docking target
    P.tube(1.32, 1.0, 1.2, M=T((KX, ty0 - 0.6, PZ)) @ RX(90), mat="hull_gray", segs=40, bevel=0.03)
    P.tube(1.75, 1.0, 0.18, M=T((KX, PORT_Y + 0.09, PZ)) @ RX(90), mat="metal_gunmetal", segs=40, bevel=0.02)
    for k in range(3):
        a = 120.0 * k + 90.0
        M = T((KX, PORT_Y, PZ)) @ RY(a) @ T((1.45, 0, 0))
        P.prism([(0, 0), (0.42, 0), (0.12, -0.55)], 0.08, plane="XY", M=M @ RX(90) @ T((0, 0, -0.04)), mat="hull_white", bevel=0.01)
    P.box((0.08, 0.06, 1.2), at=(KX, ty0 - 0.03, PZ + 2.0), mat="paint_yellow")
    P.box((1.2, 0.06, 0.08), at=(KX, ty0 - 0.03, PZ + 2.0), mat="paint_yellow")
    P.text("MERIDIAN · BERTH 1", size=0.42, M=T((KX, ty0 - 0.03, Z0 + 3.05)) @ RX(90), mat="paint_black", depth=0.02)
    # ---- station corridor along the keel, windows inboard (toward the ship)
    cx0, cx1 = KX - COR_HW - 0.45, KX + COR_HW + 0.45
    skin_box(P, cx0, cx1, -50.0, -32.4, Z0 - 0.6, Z0 + 3.3,
             holes={"x0": [(a, b, wz0, wz1) for (a, b) in cor_windows()]}, skip=("y0", "y1"))
    for (a, b) in cor_windows():
        pane_x(G, P, a, b, wz0, wz1, cx0 - 0.02)
    for y in range(-50, -32, 3):
        P.box((cx1 - cx0 + 0.3, 0.3, 0.2), at=(KX, y, Z0 + 3.4), mat="hull_gray", bevel=0.04)
    # ---- operations junction: big windows forward and outboard
    jx0, jx1, jy0, jy1 = JUN[0] - 0.45, JUN[1] + 0.45, JUN[2] - 0.45, JUN[3] + 0.45
    jf = [(KX - 3.0, KX - 0.4, Z0 + 0.6, Z0 + 2.7), (KX + 0.4, KX + 3.0, Z0 + 0.6, Z0 + 2.7)]
    jo = [(-31.6, -29.4, Z0 + 0.8, Z0 + 2.5), (-28.6, -26.4, Z0 + 0.8, Z0 + 2.5)]
    arm_hole = [(AY - AHW, AY + AHW, Z0 - 0.15, Z0 + H_ROOM + 0.15)]
    cor_hole = [(KX - COR_HW, KX + COR_HW, Z0 - 0.15, Z0 + H_ROOM + 0.15)]
    skin_box(P, jx0, jx1, jy0, jy1, Z0 - 0.7, Z0 + 3.8, holes={"x1": jo, "x0": arm_hole, "y0": cor_hole})
    for (a, b, c, d) in jo:
        pane_x(G, P, a, b, c, d, jx1 + 0.02)
    P.cyl(2.4, 0.5, at=(KX, -29.0, Z0 + 4.05), mat="hull_gray", segs=32, bevel=0.06)
    P.cyl(0.18, 3.2, at=(KX + 1.6, -27.0, Z0 + 5.4), mat="metal_gunmetal", segs=8)
    P.sphere(0.32, at=(KX + 1.6, -27.0, Z0 + 7.1), mat="emit_red", segs=10, rings=6)
    # ---- the access arm: glazed both sides and overhead as far as the bulkhead
    ay0, ay1 = AY - AHW - 0.4, AY + AHW + 0.4
    side = [(a, b, wz0, wz1) for (a, b) in arm_windows()]
    roof = [(a, b, AY - 1.1, AY + 1.1) for (a, b) in roof_windows()]
    skin_box(P, ARM_X0 - 0.4, ARM_X1, ay0, ay1, Z0 - 0.55, Z0 + H_ROOM + 0.5, holes={"y0": side, "y1": side, "z1": roof},
             skip=("x0", "x1"))
    for (a, b) in arm_windows():
        pane_y(G, P, a, b, wz0, wz1, ay0 - 0.02)
        pane_y(G, P, a, b, wz0, wz1, ay1 + 0.02)
    for (a, b) in roof_windows():
        pane_z(G, P, a, b, AY - 1.1, AY + 1.1, Z0 + H_ROOM + 0.52)
    # ribs every 3.2 m and the bulkhead collar
    for x in [a - 0.3 for (a, b) in arm_windows()] + [BULK_X]:
        P.box((0.36, ay1 - ay0 + 0.5, 0.36), at=(x, AY, Z0 + H_ROOM + 0.55), mat="hull_gray", bevel=0.04)
        for s in (-1, 1):
            P.box((0.36, 0.36, H_ROOM + 1.2), at=(x, AY + s * (AHW + 0.62), Z0 + H_ROOM / 2), mat="hull_gray", bevel=0.04)
    P.box((0.9, ay1 - ay0 + 1.2, H_ROOM + 2.0), at=(BULK_X, AY, Z0 + H_ROOM / 2), mat="hull_white", bevel=0.1)
    # under-truss carrying the arm (a Warren girder under the floor)
    for s in (-1, 1):
        P.pipe([(ARM_X0, AY + s * 1.7, Z0 - 2.6), (ARM_X1, AY + s * 1.7, Z0 - 2.6)], 0.16, mat="paint_gray", segs=8)
        P.pipe([(ARM_X0, AY + s * 1.7, Z0 - 0.7), (ARM_X1, AY + s * 1.7, Z0 - 0.7)], 0.14, mat="paint_gray", segs=8)
    n = int((ARM_X1 - ARM_X0) / 3.2)
    for i in range(n):
        x = ARM_X0 + i * 3.2
        for s in (-1, 1):
            P.pipe([(x, AY + s * 1.7, Z0 - 2.6), (x + 1.6, AY + s * 1.7, Z0 - 0.7), (x + 3.2, AY + s * 1.7, Z0 - 2.6)], 0.09, mat="paint_gray", segs=6)
        P.pipe([(x, AY - 1.7, Z0 - 2.6), (x, AY + 1.7, Z0 - 2.6)], 0.08, mat="paint_gray", segs=6)
    # ---- gangway head: big windows fore, aft and to port, roof with a beacon
    hx0, hx1, hy0, hy1 = HEAD[0] - 0.45, HEAD[1] + 0.45, HEAD[2] - 0.45, HEAD[3] + 0.45
    hz0, hz1 = HEAD_WZ
    ha = [(a, b, hz0, hz1) for (a, b) in HEAD_WIN["aft"]]
    hw = [(a, b, hz0, hz1) for (a, b) in HEAD_WIN["west"]]
    shaft_hole = [tuple(circle(GX, GY, GR + 0.3, 32))]
    skin_box(P, hx0, hx1, hy0, hy1, Z0 - 0.7, Z0 + 3.9,
             holes={"y0": ha, "y1": ha, "x0": hw, "x1": [(AY - AHW, AY + AHW, Z0 - 0.15, Z0 + H_ROOM + 0.15)], "z0": shaft_hole})
    for (a, b, c, d) in ha:
        pane_y(G, P, a, b, c, d, hy0 - 0.02)
        pane_y(G, P, a, b, c, d, hy1 + 0.02)
    for (a, b, c, d) in hw:
        pane_x(G, P, a, b, c, d, hx0 - 0.02)
    P.sphere(0.3, at=(1.3, -30.0, Z0 + 4.1), mat="emit_white", segs=10, rings=6)
    P.text("WSV-1 HALCYON · DORSAL ACCESS", size=0.36, M=T((1.3, hy1 + 0.02, Z0 + 3.3)) @ RZ(180) @ RX(90), mat="paint_black", depth=0.02)
    # ---- the gangway: a ribbed pressure tube down onto the ship's collar
    P.tube(GR + 0.35, GR + 0.05, Z0 - 0.7 - G_BOT, at=(GX, GY, (Z0 - 0.7 + G_BOT) / 2), mat="hull_white", segs=40)
    for z in [G_BOT + 0.3 + 1.6 * k for k in range(6)]:
        P.tube(GR + 0.5, GR + 0.3, 0.3, at=(GX, GY, z), mat="hull_gray", segs=40, bevel=0.03)
    P.tube(2.35, GR + 0.3, 0.35, at=(GX, GY, G_BOT + 0.2), mat="metal_gunmetal", segs=40, bevel=0.03)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        P.pipe([(GX + math.cos(a) * 1.8, GY + math.sin(a) * 1.8, G_BOT + 0.4), (GX + math.cos(a) * 1.75, GY + math.sin(a) * 1.75, Z0 - 0.8)],
               0.09, mat="metal_dark", segs=6)


def truss(P, a, b, w=2.4, r=0.12, mat="paint_gray", bay=None, up=(0, 0, 1)):
    """Square truss from a to b (w wide): four longerons, frames and diagonals."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    f = d.normalized()
    u = Vector(up)
    if abs(f.dot(u)) > 0.95:
        u = Vector((1, 0, 0))
    s = f.cross(u).normalized()
    v = s.cross(f).normalized()
    cs = [s * (w / 2) + v * (w / 2), s * (-w / 2) + v * (w / 2), s * (-w / 2) + v * (-w / 2), s * (w / 2) + v * (-w / 2)]
    for c in cs:
        P.pipe([a + c, b + c], r, mat=mat, segs=8)
    bay = bay or w
    n = max(1, int(round(L / bay)))
    for i in range(n + 1):
        p = a + f * (L * i / n)
        for k in range(4):
            P.pipe([p + cs[k], p + cs[(k + 1) % 4]], r * 0.8, mat=mat, segs=6)
        if i < n:
            q = a + f * (L * (i + 1) / n)
            for k in range(4):
                P.pipe([p + cs[k], q + cs[(k + 1) % 4]], r * 0.6, mat=mat, segs=6)


def keel(P, G):
    """The keel truss with the laboratory / habitat modules carried along it, nodes with docking collars."""
    truss(P, (KX, -62.0, Z0 - 6.0), (KX, 96.0, Z0 - 6.0), w=7.0, r=0.22, bay=7.0)
    # supports from the keel up to the walkable modules
    for y in (-56.0, -44.0, -36.0, -29.0):
        for s in (-1, 1):
            P.pipe([(KX + s * 3.5, y, Z0 - 2.5), (KX + s * 2.0, y, Z0 - 0.6)], 0.16, mat="paint_gray", segs=8)
    # module chain forward of the junction: lab A, node, hab, lab B, node (with collars)
    def module(y0, y1, r=2.9, mat="hull_white", bands=True):
        P.cyl(r, y1 - y0, M=T((KX, (y0 + y1) / 2, Z0 + 1.4)) @ RX(90), mat=mat, segs=40, bevel=0.15)
        if bands:
            for t in (0.15, 0.5, 0.85):
                yy = y0 + (y1 - y0) * t
                P.cyl(r + 0.08, 0.4, M=T((KX, yy, Z0 + 1.4)) @ RX(90), mat="hull_gray", segs=40, caps=False)
        for k in range(int((y1 - y0) / 2.2)):
            yy = y0 + 1.1 + k * 2.2
            for s in (-1, 1):
                G.box((0.05, 0.9, 0.6), at=(KX + s * (r + 0.01) * 0.94, yy, Z0 + 1.4 + r * 0.34), rot=(0, s * -20, 0), mat="glass_dark")
    def node(y, r=3.4):
        P.sphere(r, at=(KX, y, Z0 + 1.4), mat="hull_white", segs=36, rings=18)
        for d in ((1, 0, 0), (0, 0, 1), (-1, 0, 0)):
            c = Vector((KX, y, Z0 + 1.4)) + Vector(d) * (r + 0.4)
            ax = Vector(d)
            q = Vector((0, 0, 1)).rotation_difference(ax).to_matrix().to_4x4()
            P.cyl(1.35, 1.0, M=T(c) @ q, mat="hull_gray", segs=32, bevel=0.05)
            P.tube(1.6, 1.1, 0.16, M=T(c + ax * 0.55) @ q, mat="metal_gunmetal", segs=32)
    P.cyl(3.0, 1.2, M=T((KX, -24.4, Z0 + 1.4)) @ RX(90), mat="hull_gray", segs=40, bevel=0.1)
    module(-23.8, -6.0)
    node(-2.4)
    module(1.2, 19.0, r=3.2)
    module(19.0, 36.0)
    node(39.6)
    module(43.2, 58.0, r=2.6, mat="hull_white")
    node(61.6, r=2.8)
    for (y, txt) in ((-15.0, "MERIDIAN LAB A"), (10.0, "HABITAT"), (27.5, "MERIDIAN LAB B"), (50.6, "WORKSHOP")):
        P.text(txt, size=0.62, M=T((KX + 2.95, y, Z0 + 2.4)) @ RZ(90) @ RX(90), mat="paint_black", depth=0.02)
    P.text("NASA", size=1.6, M=T((KX + 3.24, 10.0, Z0 + 0.1)) @ RZ(90) @ RX(90), mat="paint_blue", depth=0.03)


def landing_deck(P, G):
    """The Ranger landing deck aft of the berth tower: grating panels on a girder frame, berth markings, tie-down
    pads, edge lights, flood masts, robotic restraint arms holding the docked craft, the refuelling boom."""
    x0, x1, y0, y1 = KX - 12.0, KX + 12.0, -88.0, -57.8
    zt = DECK_Z
    P.box((x1 - x0, y1 - y0, 0.5), at=((x0 + x1) / 2, (y0 + y1) / 2, zt - 0.25), mat="deck_grid", bevel=0.05)
    P.box((x1 - x0 + 0.6, 0.6, 0.9), at=((x0 + x1) / 2, y0, zt - 0.3), mat="paint_gray", bevel=0.05)
    for x in (x0, x1):
        P.box((0.6, y1 - y0, 0.9), at=(x, (y0 + y1) / 2, zt - 0.3), mat="paint_gray", bevel=0.05)
    # girders under the deck back to the keel
    for x in (x0 + 2, KX, x1 - 2):
        P.box((0.8, y1 - y0, 1.6), at=(x, (y0 + y1) / 2, zt - 1.3), mat="paint_gray_dark", bevel=0.05)
    for y in (y0 + 3, (y0 + y1) / 2, y1 - 3):
        P.box((x1 - x0, 0.6, 1.2), at=(KX, y, zt - 1.1), mat="paint_gray_dark", bevel=0.05)
        P.pipe([(KX, y, zt - 2.0), (KX, -60.0, Z0 - 6.0)], 0.3, mat="paint_gray", segs=10)
    # berth markings: the Ranger's footprint outline, centre line and numbers
    ry0, ry1 = PORT_Y - 17.6, PORT_Y - 0.4
    for (a, b, c, d) in ((KX - 4.0, KX - 3.8, ry0, ry1), (KX + 3.8, KX + 4.0, ry0, ry1), (KX - 4.0, KX + 4.0, ry0, ry0 + 0.2)):
        P.box((b - a, d - c, 0.02), at=((a + b) / 2, (c + d) / 2, zt + 0.01), mat="paint_yellow")
    for k in range(12):
        y = ry1 - 1.0 - k * 1.4
        P.box((0.14, 0.7, 0.02), at=(KX, y, zt + 0.01), mat="paint_white")
    P.text("1", size=3.0, M=T((KX, ry0 - 2.6, zt + 0.012)) @ RZ(180), mat="paint_yellow", depth=0.005)
    for (dx, dy) in ((-6.5, -64.0), (6.5, -64.0), (-6.5, -80.0), (6.5, -80.0)):
        P.cyl(0.6, 0.06, at=(KX + dx, dy, zt + 0.03), mat="metal_dark", segs=16)
        P.box((1.0, 0.1, 0.03), at=(KX + dx, dy, zt + 0.07), mat="paint_yellow")
    # edge lights
    for k in range(9):
        y = y0 + 0.6 + k * (y1 - y0 - 1.2) / 8
        for x in (x0 + 0.2, x1 - 0.2):
            P.cyl(0.12, 0.12, at=(x, y, zt + 0.06), mat="emit_green" if k % 2 else "emit_white", segs=10)
    for x in (x0 + 0.6 + k * 2.85 for k in range(9)):
        P.cyl(0.12, 0.12, at=(x, y0 + 0.2, zt + 0.06), mat="emit_amber", segs=10)
    # flood light masts at the four corners
    for (x, y) in ((x0 + 0.8, y0 + 0.8), (x1 - 0.8, y0 + 0.8), (x0 + 0.8, y1 - 2.4), (x1 - 0.8, y1 - 2.4)):
        P.cyl(0.14, 5.0, at=(x, y, zt + 2.5), mat="paint_gray", segs=10)
        M = T((x, y, zt + 5.1)) @ RZ(math.degrees(math.atan2(-60.0 - y, KX - x)) - 90) @ RX(-35)
        P.box((1.4, 0.4, 0.6), M=M, mat="paint_gray_dark", bevel=0.05)
        P.box((1.2, 0.05, 0.42), M=M @ T((0, 0.22, 0)), mat="emit_white")
    # robotic restraints: four jointed arms rising beside the Ranger's flanks with magnetic pads at belly height
    for (s, y) in ((-1, PORT_Y - 4.5), (1, PORT_Y - 4.5), (-1, PORT_Y - 12.5), (1, PORT_Y - 12.5)):
        base = Vector((KX + s * 5.6, y, zt))
        P.cyl(0.55, 0.5, at=(base.x, base.y, zt + 0.25), mat="paint_yellow", segs=20, bevel=0.04)
        elbow = base + Vector((s * 0.6, 0, 1.9))
        pad = Vector((KX + s * 3.45, y, PZ - 0.55))
        P.pipe([base + Vector((0, 0, 0.5)), elbow], 0.2, mat="paint_yellow", segs=12)
        P.pipe([elbow, pad + Vector((s * 0.35, 0, 0))], 0.16, mat="paint_yellow", segs=12)
        P.sphere(0.28, at=elbow, mat="metal_gunmetal", segs=14, rings=8)
        P.box((0.18, 1.1, 0.7), at=(pad.x + s * 0.22, pad.y, pad.z), mat="hull_black", bevel=0.05)
    # refuelling boom from the tower to the Ranger's flank fill port
    P.box((0.7, 0.7, 2.4), at=(KX + 5.2, PORT_Y - 0.8, zt + 1.2), mat="paint_gray", bevel=0.05)
    P.pipe([(KX + 5.2, PORT_Y - 0.8, zt + 2.4), (KX + 5.0, PORT_Y - 3.0, zt + 3.4), (KX + 3.2, PORT_Y - 7.0, PZ + 0.2)], 0.12, mat="paint_orange", segs=10, bend=0.8)
    P.cyl(0.2, 0.5, at=(KX + 3.2, PORT_Y - 7.0, PZ + 0.2), rot=(0, 90, 0), mat="metal_dark", segs=10)
    P.text("NO STEP · RANGER BERTH", size=0.5, M=T((KX - 9.0, -72.0, zt + 0.012)) @ RZ(90), mat="paint_white", depth=0.004)


def cradle(P):
    """Two cradle arms from the keel to the ship's spine: box trusses ending in hinged saddle clamps."""
    for (y, xc, zc, r) in ((20.6, 7.0, 0.0, 7.0), (-20.0, 7.9, 0.0, 7.9)):
        a = Vector((KX - 4.0, y, Z0 - 6.0))
        b = Vector((xc + 3.2, y, 2.0))
        truss(P, a, b, w=2.2, r=0.16, bay=3.2, up=(0, 1, 0))
        # saddle: a curved clamp shoe hugging the hull, hinge block, hydraulic rams
        P.lathe([(r + 0.12, -0.9), (r + 0.7, -0.9), (r + 0.7, 0.9), (r + 0.12, 0.9)], M=T((0, y, 0)) @ RX(90) @ RZ(-15),
                mat="paint_yellow", segs=16, sweep=50.0, closed=True)
        P.box((1.6, 1.8, 1.6), at=(xc + 2.6, y, 2.2), mat="paint_gray_dark", bevel=0.1)
        for dz in (-0.6, 0.6):
            P.pipe([(xc + 3.4, y + dz, 3.0), (xc + 6.6, y + dz, 6.4)], 0.14, mat="metal_chrome", segs=8)
            P.pipe([(xc + 6.6, y + dz, 6.4), (xc + 8.8, y + dz, 8.8)], 0.22, mat="paint_gray", segs=10)
        P.text("CRADLE " + ("A" if y > 0 else "B"), size=0.5, M=T(((a.x + b.x) / 2, y - 1.2, (a.z + b.z) / 2 + 1.5)) @ RX(90), mat="paint_black", depth=0.01)


def gantries(P):
    """Suspended inspection platforms round each field ring's starboard quarter: a curved grating catwalk just
    outside the ring's outer face (crews work facing the hull), railings, hangers to the keel, an inspection cab,
    and a sensor boom."""
    RC, W2 = 62.6, 1.3
    for yr in (30.0, -45.0):
        Mr = T((0, yr, 0)) @ RX(-90) @ RZ(-34)
        P.lathe([(RC, -W2), (RC + 0.1, -W2), (RC + 0.1, W2), (RC, W2)], M=Mr, mat="grating", segs=44, sweep=68.0, closed=True)
        for zz in (-W2, W2):
            P.lathe([(RC + 1.05, zz - 0.03), (RC + 1.11, zz - 0.03), (RC + 1.11, zz + 0.03), (RC + 1.05, zz + 0.03)], M=Mr, mat="paint_yellow",
                    segs=44, sweep=68.0, closed=True)
            for k in range(18):
                a = math.radians(-34 + 4 * k)
                p0 = Vector((RC * math.cos(a), yr - zz, RC * math.sin(a)))
                p1 = Vector(((RC + 1.1) * math.cos(a), yr - zz, (RC + 1.1) * math.sin(a)))
                P.pipe([p0, p1], 0.03, mat="paint_yellow", segs=6)
        for a in (-26.0, 0.0, 26.0):
            ar = math.radians(a)
            for s in (-1, 1):
                p = Vector(((RC + 0.1) * math.cos(ar), yr + s * (W2 - 0.1), (RC + 0.1) * math.sin(ar)))
                P.pipe([p, Vector((KX - 3.5, yr + s * 3.0, Z0 - 6.0))], 0.1, mat="paint_gray", segs=8)
            P.cyl(0.3, 0.3, at=((RC + 1.6) * math.cos(ar), yr, (RC + 1.6) * math.sin(ar)), mat="emit_white", segs=10)
        # inspection cab at mid span, and a sensor boom aimed at the ring
        P.box((2.6, 2.4, 2.4), at=(RC + 1.4, yr, -4.0), mat="hull_white", bevel=0.12)
        P.box((0.06, 1.8, 0.9), at=(RC + 0.08, yr, -3.6), mat="glass_dark")
        P.pipe([(KX - 3.5, yr, Z0 - 6.0), (RC + 2.0, yr, 6.0)], 0.2, mat="paint_gray", segs=10)
        P.box((1.2, 1.2, 1.2), at=(RC + 1.6, yr, 5.6), mat="paint_gray_dark", bevel=0.08)
        P.cyl(0.35, 0.4, at=(RC + 0.8, yr, 5.4), rot=(0, 90, 0), mat="glass_dark", segs=16)


def crane(P):
    """Tower crane on the keel's forward end, its jib reaching high over the bow saucer."""
    base = Vector((KX, 70.0, Z0 - 2.0))
    truss(P, base, base + Vector((0, 0, 58.0)), w=3.0, r=0.16, bay=3.0, up=(0, 1, 0))
    top = base + Vector((0, 0, 58.0))
    P.box((4.6, 4.6, 3.2), at=top + Vector((0, 0, 1.6)), mat="paint_yellow", bevel=0.1)
    P.box((2.6, 2.0, 2.0), at=top + Vector((-1.2, -3.2, 1.6)), mat="paint_yellow", bevel=0.1)
    P.box((0.06, 1.6, 1.0), at=top + Vector((-2.52, -3.2, 1.9)), mat="glass_dark")
    jib_end = Vector((18.0, 70.0, top.z + 3.0))
    truss(P, top + Vector((0, 0, 3.0)), jib_end, w=2.0, r=0.12, bay=2.6, up=(0, 0, 1))
    truss(P, top + Vector((0, 0, 3.0)), top + Vector((18.0, 0, 3.0)), w=1.6, r=0.11, bay=2.6, up=(0, 0, 1))
    P.box((3.4, 3.0, 2.4), at=top + Vector((17.0, 0, 3.0)), mat="concrete", bevel=0.05)
    trolley = Vector((40.0, 70.0, top.z + 1.6))
    P.box((2.0, 2.2, 1.0), at=trolley, mat="paint_gray_dark", bevel=0.06)
    for dx in (-0.5, 0.5):
        P.cyl(0.03, 22.0, at=(trolley.x + dx, trolley.y, trolley.z - 11.0), mat="metal_steel", segs=6)
    P.box((1.6, 1.6, 1.2), at=(trolley.x, trolley.y, trolley.z - 22.4), mat="paint_yellow", bevel=0.1)
    for p in (top + Vector((0, 0, 3.4)), jib_end):
        P.sphere(0.35, at=p + Vector((0, 0, 1.5)), mat="emit_red", segs=10, rings=6)


def solar_and_radiators(P):
    """Solar wings outboard on rotary joints; radiator panels hung under the keel."""
    for y in (-14.0, 44.0):
        P.cyl(1.2, 2.4, at=(KX + 7.0, y, Z0 - 6.0), rot=(0, 90, 0), mat="metal_gunmetal", segs=24, bevel=0.05)
        truss(P, (KX + 8.0, y, Z0 - 6.0), (KX + 92.0, y, Z0 - 6.0), w=1.4, r=0.1, bay=4.0)
        for k in range(6):
            x = KX + 14.0 + k * 13.4
            for s in (-1, 1):
                P.box((12.6, 9.0, 0.12), at=(x, y + s * 5.4, Z0 - 6.0), mat="ship_solar", bevel=0.02)
                P.box((12.8, 0.18, 0.18), at=(x, y + s * 9.95, Z0 - 6.0), mat="hull_white")
    for k in range(5):
        y = 6.0 + k * 9.0
        P.box((0.3, 7.6, 16.0), at=(KX, y, Z0 - 18.0), mat="radiator", bevel=0.03)
        P.box((0.5, 0.4, 16.0), at=(KX, y - 3.9, Z0 - 18.0), mat="hull_gray")
        P.pipe([(KX, y, Z0 - 9.5), (KX, y, Z0 - 10.0)], 0.3, mat="metal_gunmetal", segs=10)


def beacons_rcs(P):
    """Navigation beacons on masts at the extremities, RCS quads on the keel ends."""
    for p, m in (((KX, 96.0, Z0 - 2.0), "emit_white"), ((KX + 100.0, -14.0, Z0 - 6.0), "emit_green"), ((KX + 100.0, 44.0, Z0 - 6.0), "emit_green"),
                 ((KX, -88.5, DECK_Z), "emit_red"), ((KX - 12.0, -88.0, DECK_Z), "emit_red"), ((KX + 12.0, -88.0, DECK_Z), "emit_red")):
        P.cyl(0.08, 2.0, at=(p[0], p[1], p[2] + 1.0), mat="metal_gunmetal", segs=6)
        P.sphere(0.16, at=(p[0], p[1], p[2] + 2.1), mat=m, segs=10, rings=6)
    for y in (-60.0, 94.0):
        for s in (-1, 1):
            for t in (-1, 1):
                c = Vector((KX + s * 4.4, y, Z0 - 6.0 + t * 4.4))
                P.box((1.2, 1.2, 1.2), at=c, mat="hull_gray", bevel=0.1)
                for d in ((s, 0, 0), (0, 0, t), (0, 1, 0), (0, -1, 0)):
                    q = Vector((0, 0, 1)).rotation_difference(Vector(d)).to_matrix().to_4x4()
                    P.cyl(0.14, 0.5, M=T(c + Vector(d) * 0.75) @ q, mat="thruster", segs=8, r2=0.22)


def build_ext(fresh=True):
    if fresh:
        reset()
    P = Part("platform_hull")
    G = Part("platform_glass")
    modules_ext(P, G)
    keel(P, G)
    landing_deck(P, G)
    cradle(P)
    gantries(P)
    crane(P)
    solar_and_radiators(P)
    beacons_rcs(P)
    hull = P.finish(col=0)
    glass = G.finish(col=0, shadow=0)
    # collision: the parts a Ranger could touch
    C = Part("platform_col")
    C.box((24.0, 30.2, 1.2), at=(KX, -72.9, DECK_Z - 0.6), mat="concrete")
    C.box((6.0, 7.8, 4.3), at=(KX, -53.9, Z0 + 1.45), mat="concrete")
    C.box((4.6, 17.6, 3.9), at=(KX, -41.2, Z0 + 1.35), mat="concrete")
    C.box((8.5, 8.5, 4.5), at=(KX, -29.0, Z0 + 1.55), mat="concrete")
    C.box(((ARM_X1 - ARM_X0), 4.4, 3.9), at=((ARM_X0 + ARM_X1) / 2, AY, Z0 + 1.35), mat="concrete")
    C.box((10.3, 11.7, 4.6), at=((HEAD[0] + HEAD[1]) / 2, (HEAD[2] + HEAD[3]) / 2, Z0 + 1.6), mat="concrete")
    C.cyl(GR + 0.5, Z0 - G_BOT, at=(GX, GY, (Z0 + G_BOT) / 2), mat="concrete", segs=12)
    C.box((8.0, 160.0, 8.0), at=(KX, 17.0, Z0 - 6.0), mat="concrete")
    C.box((7.0, 86.0, 7.0), at=(KX, 17.0, Z0 + 1.4), mat="concrete")
    for y in (-14.0, 44.0):
        C.box((86.0, 20.0, 1.0), at=(KX + 50.0, y, Z0 - 6.0), mat="concrete")
    collider("platform_col", C)
    # the Ranger berth: the craft docks tail first, belly toward the deck (dir = outward normal, up = clocking)
    marker("dock", "berth", at=(KX, PORT_Y, PZ), dir=[0, -1, 0], up=[0, 0, 1], label="Meridian · Ranger berth", port="berth", accepts="ranger")
    marker("view", "deck", at=(KX + 22.0, -112.0, DECK_Z + 14.0))
    bake_ao([hull], local_dist=4.0)
    return hull, glass


# ===================================================================================================== interior
def floor_with_hole(F, x0, x1, y0, y1, z, hole_c, hole_r, mat):
    """A floor slab with a round hole (gangway): four grid panels round a square plate with the round cut."""
    hc = Vector(hole_c)
    q = hole_r + 0.5
    F.floor(x0, y0, x1, hc.y - q, z, mat)
    F.floor(x0, hc.y + q, x1, y1, z, mat)
    F.floor(x0, hc.y - q, hc.x - q, hc.y + q, z, mat)
    F.floor(hc.x + q, hc.y - q, x1, hc.y + q, z, mat)
    plate = rect(hc.x - q, hc.y - q, hc.x + q, hc.y + q)
    F.S.prism(plate, 0.12, plane="XY", M=T((0, 0, z - 0.12)), mat=mat, bevel=0, holes=[circle(hc.x, hc.y, hole_r, 32)[::-1]], exact_holes=True)
    F.C.prism(plate, 0.5, plane="XY", M=T((0, 0, z - 0.5)), mat="concrete", bevel=0, holes=[circle(hc.x, hc.y, hole_r, 16)[::-1]], exact_holes=True)


def wall_y(F, x0, x1, y, z0, z1, ops=(), mat="tile_white", into=1):
    """Wall in the plane y (rooms on the side `into` = +1 / -1), openings (x0, x1, zb, zt) in world x."""
    if into > 0:
        a, b = (x0, y), (x1, y)
        o = [(u0 - x0, u1 - x0, zb, zt) for (u0, u1, zb, zt) in ops]
    else:
        a, b = (x1, y), (x0, y)
        o = [(x1 - u1, x1 - u0, zb, zt) for (u0, u1, zb, zt) in ops]
    return F.wall(a, b, z0, z1, o, mat, t=0.24)


def wall_x(F, y0, y1, x, z0, z1, ops=(), mat="tile_white", into=1):
    """Wall in the plane x (rooms toward +x for into = +1), openings (y0, y1, zb, zt) in world y."""
    if into > 0:
        a, b = (x, y1), (x, y0)
        o = [(y1 - u1, y1 - u0, zb, zt) for (u0, u1, zb, zt) in ops]
    else:
        a, b = (x, y0), (x, y1)
        o = [(u0 - y0, u1 - y0, zb, zt) for (u0, u1, zb, zt) in ops]
    return F.wall(a, b, z0, z1, o, mat, t=0.24)


def handrail_wall(F, pts, z=Z0 + 1.0):
    F.D.pipe([Vector((p[0], p[1], z)) for p in pts], 0.025, mat="paint_yellow", segs=8)


def build_int():
    reset()
    F = Fac("plat", cell=1.6)
    D = F.D
    wz0, wz1 = WIN_Z
    zc = Z0 + H_ROOM

    # ------------------------------------------------------------------ vestibule (weightless) and berth tunnel
    D, E, G = F.section("vest")
    vx0, vx1, vy0, vy1 = VEST
    F.floor(vx0, vy0, vx1, vy1, Z0, "deck_grid")
    F.ceil(vx0, vy0, vx1, vy1, Z0 + 2.9, "padding_light")
    vw = [(KX - 2.15, KX - 1.35, Z0 + 0.95, Z0 + 2.05), (KX + 1.35, KX + 2.15, Z0 + 0.95, Z0 + 2.05)]
    outline = rect(vx0, Z0, vx1, Z0 + 2.9)
    holes = [rect(a, c, b, d)[::-1] for (a, b, c, d) in vw] + [circle(KX, PZ, 0.98, 32)[::-1]]
    F.S.prism(outline, 0.24, plane="XZ", M=T((0, vy0 - 0.24, 0)), mat="padding_light", bevel=0, holes=holes, exact_holes=True)
    F.C.prism(outline, 0.3, plane="XZ", M=T((0, vy0 - 0.3, 0)), mat="concrete", bevel=0, holes=holes, exact_holes=True)
    wall_x(F, vy0, vy1, vx0, Z0, Z0 + 2.9, mat="padding_light", into=1)
    wall_x(F, vy0, vy1, vx1, Z0, Z0 + 2.9, mat="padding_light", into=-1)
    wall_y(F, vx0, vx1, vy1, Z0, Z0 + 2.9, [(KX - 0.65, KX + 0.65, Z0, Z0 + 2.15)], mat="padding_light", into=-1)
    # the tunnel to the berth port (inner radius 0.98), its pressure hatch slides aside to starboard
    tv, tf = [], []
    for k, yy in enumerate((PORT_Y, (PORT_Y + vy0) / 2, vy0)):
        for i in range(32):
            a = 2 * math.pi * i / 32
            tv.append((KX + 0.98 * math.cos(a), yy, PZ + 0.98 * math.sin(a)))
    for k in range(2):
        for i in range(32):
            a0, a1 = k * 32 + i, k * 32 + (i + 1) % 32
            tf.append((a0, a1, a1 + 32, a0 + 32))
    F.S.mesh(tv, tf, mat="padding_light", recalc=False)
    for i in range(10):
        a = 2 * math.pi * i / 10
        F.C.box((0.3, 1.3, 0.62), at=(KX + 1.12 * math.cos(a), (PORT_Y + vy0) / 2, PZ + 1.12 * math.sin(a)), rot=(0, -math.degrees(a), 0), mat="concrete")
    D.tube(1.18, 0.98, 0.08, M=T((KX, vy0 - 0.02, PZ)) @ RX(90), mat="metal_dark", segs=32)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        D.box((0.1, 0.06, 0.1), at=(KX + math.cos(a) * 1.2, vy0 + 0.04, PZ + math.sin(a) * 1.2), mat="handle_yellow")
    Hb = Part("plat_hatch_berth")
    Hb.cyl(1.0, 0.06, M=RX(90), mat="hull_gray", segs=32, bevel=0.01)
    Hb.cyl(0.14, 0.06, M=T((0, 0.06, 0)) @ RX(90), mat="metal_dark", segs=16, bevel=0.01)
    for k in range(6):
        Hb.box((0.05, 0.05, 0.5), M=T((0, 0.08, 0)) @ RY(k * 60) @ T((0, 0, 0.3)), mat="gear_metal", bevel=0.006)
    hb = Hb.finish(sharp=40)
    hb.location = (KX, vy0 - 0.45, PZ)
    props(hb, part="hatch_berth", axis=[1, 0, 0], travel=2.1, col=0)
    F.dyn.append(hb)
    # a pocket for the hatch beside the tunnel
    D.box((2.2, 0.2, 2.2), at=(KX + 2.1, vy0 - 0.36, PZ), mat="padding_light")
    marker("hatch_ctl", "berth", at=(KX - 1.2, vy0 + 0.12, PZ + 0.2), label="Berth hatch")
    # handholds and rails all round (it is weightless here), deck control panel overlooking the deck
    for z in (Z0 + 0.8, Z0 + 2.2):
        handrail_wall(F, [(vx0 + 0.08, vy0 + 0.2), (vx0 + 0.08, vy1 - 0.2)], z)
        handrail_wall(F, [(vx1 - 0.08, vy0 + 0.2), (vx1 - 0.08, vy1 - 0.2)], z)
    F.screen("vest_deck", T((vx1 - 0.14, -55.9, Z0 + 1.5)) @ RZ(-90), w=0.9, h=0.55)
    F.sign(T((KX, vy1 - 0.14, Z0 + 2.45)), "AIRLOCK  ·  STATION", w=1.6, h=0.24)
    F.sign(T((KX, vy0 + 0.14, Z0 + 2.62)) @ RZ(180), "BERTH 1 · RANGER", w=1.4, h=0.2, bg="paint_yellow")
    F.strip(KX, -55.9, Z0 + 2.9, yaw=90, L=1.4, power=10, room="vest")
    marker("zerog", "vest", at=(KX, -66.0, PZ), sx=6.6, sy=23.6, sz=5.2)

    # ------------------------------------------------------------------ airlock
    D, E, G = F.section("lock")
    ly0, ly1 = LOCK_Y
    F.floor(KX - COR_HW, ly0, KX + COR_HW, ly1, Z0, "floor_panel_dark")
    F.ceil(KX - COR_HW, ly0, KX + COR_HW, ly1, Z0 + 2.6, "padding_light")
    wall_x(F, ly0, ly1, KX - COR_HW, Z0, Z0 + 2.6, mat="padding_gray", into=1)
    wall_x(F, ly0, ly1, KX + COR_HW, Z0, Z0 + 2.6, mat="padding_gray", into=-1)
    Mi, _ = wall_y(F, KX - COR_HW, KX + COR_HW, ly1, Z0, Z0 + 2.8, [(KX - 0.65, KX + 0.65, Z0, Z0 + 2.15)], mat="tile_white", into=-1)
    F.D.box((2 * COR_HW, 0.24, 0.2), at=(KX, ly1, Z0 + 2.7), mat="tile_white")
    # pressure doors (driven by the airlock controller: interlocked, cycled)
    F.slide("lock_out", T((KX - 0.6, ly0 - 0.12, 0)), 0.0, Z0, 1.2, 2.1, t=0.24, thick=0.12, label="Airlock outer door", auto=1.7, time=1.6, sound="hatch")
    F.slide("lock_in", T((KX - 0.6, ly1 - 0.12, 0)), 0.0, Z0, 1.2, 2.1, t=0.24, thick=0.12, label="Airlock inner door", auto=1.7, time=1.6, sound="hatch")
    # pressure equipment: suit lockers, gauge panels, status lights over each door
    F.locker(T((KX - COR_HW + 0.3, -52.4, Z0)) @ RZ(90), n=3)
    for (y, rz) in ((-53.2, -90), (-51.4, -90)):
        F.screen(f"lock_{'a' if y < -52 else 'b'}", T((KX + COR_HW - 0.14, y, Z0 + 1.5)) @ RZ(rz), w=0.5, h=0.32)
    for y, sid in ((ly0 + 0.15, "out"), (ly1 - 0.15, "in")):
        E.box((0.5, 0.05, 0.12), at=(KX, y, Z0 + 2.32), mat="emit_amber")
        marker("lamp", f"lock_{sid}", at=(KX, y, Z0 + 2.32))
    marker("airlock", "main", at=(KX, (ly0 + ly1) / 2, Z0), y0=ly0, y1=ly1, hw=COR_HW)
    marker("terminal", "airlock", at=(KX + COR_HW - 0.2, -52.3, Z0 + 1.35), label="Airlock · cycle")
    F.strip(KX, (ly0 + ly1) / 2, Z0 + 2.6, yaw=90, L=1.6, power=11, room="lock")
    F.sign(T((KX, ly0 + 0.14, Z0 + 2.45)) @ RZ(180), "AIRLOCK 1 · CHECK PRESSURE", w=1.8, h=0.22, bg="paint_yellow")

    # ------------------------------------------------------------------ station corridor
    D, E, G = F.section("corr")
    F.floor(KX - COR_HW, ly1, KX + COR_HW, COR_Y1, Z0, "floor_panel")
    F.ceil(KX - COR_HW, ly1, KX + COR_HW, COR_Y1, zc, "padding_light")
    wall_x(F, ly1, COR_Y1, KX - COR_HW, Z0, zc, [(a, b, wz0, wz1) for (a, b) in cor_windows()], mat="tile_white", into=1)
    wall_x(F, ly1, COR_Y1, KX + COR_HW, Z0, zc, mat="tile_white", into=-1)
    for y in (-47.6, -43.8, -40.0, -36.2):
        F.strip(KX, y, zc, yaw=90, L=1.4, power=10, room="corr")
    for (a, b) in cor_windows():
        D.box((0.1, b - a + 0.2, 0.08), at=(KX - COR_HW + 0.08, (a + b) / 2, wz0 - 0.04), mat="hull_gray")
    handrail_wall(F, [(KX + COR_HW - 0.1, ly1 + 0.3), (KX + COR_HW - 0.1, COR_Y1 - 0.3)])
    F.tray((KX + COR_HW - 0.35, ly1, zc - 0.25), (KX + COR_HW - 0.35, COR_Y1, zc - 0.25), w=0.36, cables=5)
    F.pipe([(KX + COR_HW - 0.2, ly1, Z0 + 0.25), (KX + COR_HW - 0.2, COR_Y1, Z0 + 0.25)], r=0.05, mat="paint_blue")
    F.pipe([(KX + COR_HW - 0.2, ly1, Z0 + 0.4), (KX + COR_HW - 0.2, COR_Y1, Z0 + 0.4)], r=0.04, mat="paint_green")
    F.sign(T((KX + COR_HW - 0.13, -45.0, Z0 + 1.9)) @ RZ(-90), "BERTH 1   ·   OPERATIONS · ACCESS ARM", w=2.6, h=0.2)
    F.locker(T((KX + COR_HW - 0.3, -39.0, Z0)) @ RZ(-90), n=2)
    F.rack(T((KX + COR_HW - 0.5, -34.4, Z0)) @ RZ(-90), h=2.0)

    # ------------------------------------------------------------------ operations junction
    D, E, G = F.section("jun")
    jx0, jx1, jy0, jy1 = JUN
    jzc = Z0 + 3.2
    F.floor(jx0, jy0, jx1, jy1, Z0, "floor_panel_dark")
    F.ceil(jx0, jy0, jx1, jy1, jzc, "padding_light")
    wall_y(F, jx0, jx1, jy0, Z0, jzc, [(KX - COR_HW, KX + COR_HW, Z0, zc)], mat="tile_white", into=1)
    # forward: the hatch into Lab A (the keel's module chain continues there; restricted)
    Mf, _ = wall_y(F, jx0, jx1, jy1, Z0, jzc, [(KX - 0.6, KX + 0.6, Z0, Z0 + 2.15)], mat="tile_white", into=-1)
    F.door("lab_a", T((KX + 0.6, jy1 + 0.12, 0)) @ RZ(180), 0.0, Z0, w=1.2, h=2.15, t=0.24, label="Hatch to Meridian Lab A", locked=True)
    F.sign(T((KX, jy1 - 0.14, Z0 + 2.5)), "MERIDIAN LAB A · AUTHORISED STAFF", w=2.2, h=0.22, bg="paint_yellow")
    F.screen("jun_fwd_l", T((KX - 2.2, jy1 - 0.14, Z0 + 1.75)), w=1.2, h=0.7)
    F.screen("jun_fwd_r", T((KX + 2.6, jy1 - 0.14, Z0 + 2.15)), w=1.0, h=0.55)
    wall_x(F, jy0, jy1, jx1, Z0, jzc, [(-31.6, -29.4, Z0 + 0.8, Z0 + 2.5), (-28.6, -26.4, Z0 + 0.8, Z0 + 2.5)], mat="tile_white", into=-1)
    wall_x(F, jy0, jy1, jx0, Z0, jzc, [(AY - 0.6, AY + 0.6, Z0, Z0 + 2.2)], mat="tile_white", into=1)
    F.slide("arm", T((jx0 - 0.12, AY + 0.6, 0)) @ RZ(-90), 0.0, Z0, 1.2, 2.2, t=0.24, thick=0.12, label="Access arm door", auto=2.2, time=1.2)
    F.sign(T((jx0 + 0.14, AY, Z0 + 2.5)) @ RZ(90), "ACCESS ARM · INSPECTION GALLERY · HALCYON", w=2.6, h=0.22)
    # consoles: platform operations (ship readiness) and traffic (berth / approach)
    F.console(T((KX + 1.6, jy1 - 0.9, Z0)), w=2.2, sid="ops", screens=3, chair=True)
    F.console(T((jx1 - 0.9, -31.2, Z0)) @ RZ(-90), w=1.8, sid="trf", screens=2, chair=True)
    marker("terminal", "ops", at=(KX + 1.6, jy1 - 1.2, Z0 + 1.1), label="Platform operations · Halcyon status")
    marker("terminal", "traffic", at=(jx1 - 1.2, -31.2, Z0 + 1.1), label="Traffic control · Ranger berth")
    marker("post", "eng_ops", at=(KX + 1.6, jy1 - 1.65, Z0), face=[0, 1, 0], seat=1)
    marker("post", "eng_trf", at=(jx1 - 1.65, -31.2, Z0), face=[1, 0, 0], seat=1)
    F.table(T((KX - 1.6, -27.4, Z0)), w=1.6, d=0.9)
    F.screen("jun_wall", T((KX - 2.0, jy0 + 0.14, Z0 + 1.9)) @ RZ(180), w=1.4, h=0.8)
    for (x, y) in ((KX - 1.6, -30.8), (KX + 1.6, -30.8), (KX - 1.6, -27.0), (KX + 1.6, -27.0)):
        F.strip(x, y, jzc, yaw=0, L=1.2, power=9, room="jun")
    F.camera(T((jx1 - 0.15, jy0 + 0.2, jzc - 0.3)) @ RZ(-135))

    # ------------------------------------------------------------------ access arm / inspection gallery
    D, E, G = F.section("arm")
    ay0, ay1 = AY - AHW, AY + AHW
    F.floor(ARM_X0, ay0, ARM_X1, ay1, Z0, "floor_panel")
    # ceiling with the roof windows cut (as separate panels between them)
    rw = roof_windows()
    xs = [ARM_X0]
    for (a, b) in rw:
        F.ceil(xs[-1], ay0, a, ay1, zc, "padding_light")
        F.ceil(a, ay0, b, AY - 1.1, zc, "padding_light")
        F.ceil(a, AY + 1.1, b, ay1, zc, "padding_light")
        xs.append(b)
    F.ceil(xs[-1], ay0, ARM_X1, ay1, zc, "padding_light")
    win = [(a, b, wz0, wz1) for (a, b) in arm_windows()]
    wall_y(F, ARM_X0, ARM_X1, ay0, Z0, zc, win, mat="tile_white", into=1)
    wall_y(F, ARM_X0, ARM_X1, ay1, Z0, zc, win, mat="tile_white", into=-1)
    for (a, b) in arm_windows():
        for y, s in ((ay0, 1), (ay1, -1)):
            D.box((b - a + 0.2, 0.22, 0.06), at=((a + b) / 2, y + s * 0.1, wz0 - 0.03), mat="hull_gray")
    # pressure bulkhead half way (an automatic door)
    wall_x(F, ay0, ay1, BULK_X, Z0, zc, [(AY - 0.6, AY + 0.6, Z0, Z0 + 2.2)], mat="padding_gray", into=1)
    F.slide("bulk", T((BULK_X - 0.12, AY + 0.6, 0)) @ RZ(-90), 0.0, Z0, 1.2, 2.2, t=0.24, thick=0.12, label="Bulkhead door", auto=2.2, time=1.2)
    F.sign(T((BULK_X - 0.14, AY, Z0 + 2.45)) @ RZ(-90), "PRESSURE BULKHEAD 2", w=1.6, h=0.22, bg="paint_yellow")
    # floor light strips, handrails both sides, benches and info plaques looking at the ship
    for x in [ARM_X0 + 3.0 + 6.4 * k for k in range(int((ARM_X1 - ARM_X0 - 4) / 6.4))]:
        F.strip(x, AY, zc, yaw=0, L=1.6, power=9, room="arm")
    for y in (ay0 + 0.1, ay1 - 0.1):
        handrail_wall(F, [(ARM_X0 + 0.4, y), (BULK_X - 0.4, y)], Z0 + 0.95)
        handrail_wall(F, [(BULK_X + 0.4, y), (ARM_X1 - 0.4, y)], Z0 + 0.95)
    for x in (16.8, 36.0, 55.2):
        F.D.box((1.8, 0.45, 0.42), at=(x, AY + 0.95, Z0 + 0.21), mat="padding_blue", bevel=0.04)
        F.C.box((1.8, 0.45, 0.42), at=(x, AY + 0.95, Z0 + 0.21), mat="concrete")
    for (x, txt) in ((11.0, "FIELD RING A · FORWARD"), (30.2, "FIELD RING B · AFT"), (49.4, "SPINE · CRADLE A / B")):
        F.sign(T((x, ay0 + 0.14, wz0 - 0.3)) @ RZ(180), txt, w=1.8, h=0.18)
    marker("post", "eng_gal", at=(26.0, AY - 0.6, Z0), face=[0, -1, 0])
    marker("terminal", "gallery", at=(40.0, ay1 - 0.2, Z0 + 1.2), label="Ring status display")
    F.screen("gal_ring", T((40.0, ay1 - 0.14, Z0 + 1.45)), w=0.9, h=0.5)

    # ------------------------------------------------------------------ gangway head and shaft
    D, E, G = F.section("head")
    hx0, hx1, hy0, hy1 = HEAD
    hzc = Z0 + 3.4
    floor_with_hole(F, hx0, hx1, hy0, hy1, Z0, (GX, GY), GR + 0.05, "floor_panel_dark")
    F.ceil(hx0, hy0, hx1, hy1, hzc, "padding_light")
    hz0, hz1 = HEAD_WZ
    wall_y(F, hx0, hx1, hy0, Z0, hzc, [(a, b, hz0, hz1) for (a, b) in HEAD_WIN["aft"]], mat="tile_white", into=1)
    wall_y(F, hx0, hx1, hy1, Z0, hzc, [(a, b, hz0, hz1) for (a, b) in HEAD_WIN["fwd"]], mat="tile_white", into=-1)
    wall_x(F, hy0, hy1, hx0, Z0, hzc, [(a, b, hz0, hz1) for (a, b) in HEAD_WIN["west"]], mat="tile_white", into=1)
    wall_x(F, hy0, hy1, hx1, Z0, hzc, [(ay0, ay1, Z0, zc)], mat="tile_white", into=-1)
    # railing round the gangway well, open on the arm side
    r = GR + 0.25
    pts = [(GX + r * math.cos(math.radians(a)), GY + r * math.sin(math.radians(a)), Z0) for a in range(30, 331, 20)]
    F.rail(pts, h=1.05)
    F.sign(T((hx1 - 0.14, -33.6, Z0 + 2.0)) @ RZ(-90), "GANGWAY · ZERO-G BELOW THE RAIL", w=2.0, h=0.2, bg="paint_yellow")
    F.console(T((4.2, -34.4, Z0)) @ RZ(180), w=1.8, sid="gw", screens=2, chair=False)
    marker("terminal", "gangway", at=(4.2, -33.9, Z0 + 1.1), label="Gangway control · Halcyon dorsal hatch")
    marker("post", "eng_gw", at=(4.2, -33.4, Z0), face=[0, -1, 0])
    F.bench(T((-2.4, -25.4, Z0)), w=1.8, d=0.7)
    F.shelving(T((-2.4, -34.8, Z0)) @ RZ(180), w=1.4, d=0.5, h=2.2, levels=4)
    for (x, y) in ((-1.6, -27.4), (3.0, -27.4), (3.0, -31.0), (-1.6, -34.0)):
        F.strip(x, y, hzc, yaw=0, L=1.2, power=10, room="head")
    # the shaft: padded wall, ladder rungs, rails, light rings; the ship's hatch at the bottom
    segs = 32
    verts, faces = [], []
    zs = [G_BOT + (Z0 - G_BOT) * k / 8 for k in range(9)]
    for k, z in enumerate(zs):
        for i in range(segs):
            a = 2 * math.pi * i / segs
            verts.append((GX + GR * math.cos(a), GY + GR * math.sin(a), z))
    for k in range(8):
        for i in range(segs):
            a0, a1 = k * segs + i, k * segs + (i + 1) % segs
            faces.append((a0, a0 + segs, a1 + segs, a1))
    F.S.mesh(verts, faces, mat="padding_light", recalc=False)
    for i in range(12):
        a = 2 * math.pi * i / 12
        F.C.box((0.3, 0.75, Z0 - G_BOT - 0.02), at=(GX + (GR + 0.15) * math.cos(a), GY + (GR + 0.15) * math.sin(a), (Z0 + G_BOT) / 2 - 0.01),
                rot=(0, 0, math.degrees(a)), mat="concrete")
    for k in range(int((Z0 - G_BOT) / 0.35)):
        z = G_BOT + 0.4 + k * 0.35
        F.D.box((0.5, 0.04, 0.04), at=(GX, GY + GR - 0.12, z), mat="metal_chrome", bevel=0.008)
    for s in (-1, 1):
        F.D.box((0.04, 0.08, Z0 - G_BOT), at=(GX + s * 0.27, GY + GR - 0.08, (Z0 + G_BOT) / 2), mat="metal_steel")
    for z in (G_BOT + 2.4, G_BOT + 5.6, G_BOT + 8.6):
        E.tube(GR - 0.01, GR - 0.05, 0.1, at=(GX, GY, z), mat="emit_cool", segs=32)
        light(F.uid("plat_l"), at=(GX, GY, z), color=(0.85, 0.92, 1.0), power=8, dist=6, bake=24, group="plat", room="head")
    F.D.tube(GR, GR - 0.22, 0.2, at=(GX, GY, G_BOT + 0.1), mat="paint_yellow", segs=32)
    marker("shiphatch", "dorsal", at=(GX, GY, G_BOT + 0.15), label="WSV-1 Halcyon · dorsal hatch")
    marker("zerog", "shaft", at=(GX, GY, (G_BOT + Z0 + 1.6) / 2), r=GR + 0.12, sz=(Z0 + 1.6 - G_BOT + 0.6))

    objs = F.finish(rays=10, fill=0.02)
    marker("view", "gallery", at=(20.0, AY, Z0 + 1.6))
    return objs


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["ext", "int"]
    dark = dict(sky=(0.012, 0.014, 0.02), sky_strength=1.0, sun=4.5)
    if "--preview" in sys.argv and "ext" in which:
        import warpship
        warpship.build()
        build_ext(fresh=False)
        preview("platform_wide", (260.0, -170.0, 140.0), (50.0, -10.0, 0.0), res=(1400, 900), lens=35, samples=32, sun_rot=(40, 0, 130), **dark)
        preview("platform_deck", (KX + 30.0, -120.0, 40.0), (KX, -62.0, 21.0), res=(1400, 900), lens=35, samples=32, sun_rot=(40, 0, 130), **dark)
        preview("platform_arm", (40.0, 10.0, 34.0), (40.0, -29.0, 20.0), res=(1400, 900), lens=35, samples=32, sun_rot=(40, 0, 130), **dark)
        sys.exit(0)
    if "--preview" in sys.argv and "int" in which:
        build_int()
        preview("platform_int_gallery", (12.0, AY + 1.2, Z0 + 1.7), (40.0, AY - 0.6, Z0 + 1.3), res=(1400, 800), lens=24, samples=24, sun=0.0, sky_strength=0.0)
        preview("platform_int_head", (5.0, -26.0, Z0 + 1.7), (0.0, -32.0, Z0 + 0.4), res=(1400, 800), lens=22, samples=24, sun=0.0, sky_strength=0.0)
        preview("platform_int_corr", (KX, -49.6, Z0 + 1.7), (KX - 0.6, -36.0, Z0 + 1.3), res=(1400, 800), lens=24, samples=24, sun=0.0, sky_strength=0.0)
        preview("platform_int_vest", (KX + 1.6, -54.9, Z0 + 1.6), (KX - 0.2, -58.0, PZ), res=(1400, 800), lens=22, samples=24, sun=0.0, sky_strength=0.0)
        sys.exit(0)
    if "ext" in which:
        build_ext()
        export_glb("platform")
        save_blend("platform")
    if "int" in which:
        build_int()
        export_glb("platform_int")
        save_blend("platform_int")
