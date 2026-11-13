"""
Miller's Planet shore and reef species, realism pass (original speculative designs from the player's concept images;
own geometry, no copies). See docs/MILLER_BIOSPHERE.md. Built with blender/lib/organic.py: plates conform to the body
surface (no floating shards), limbs are parametric tubes carrying banded armour, ambient occlusion is baked to a
vertex layer; fine skin is procedural at runtime (src/render/CreatureSkin.ts).

  breaker    Breaker Shield (image 8): 3 m armoured shore animal. High domed carapace of thick keeled plates in
             overlapping rows with pointed rear tips, a skirt of spiked marginal plates; a heavy wedge helmet over the
             head ending in a point, small deep-set eyes, a cluster of ringed mouth feelers; six thick limbs sheathed in
             overlapping armour bands, broad feet with long dark claws.
Blender +Y forward, +Z up, ground z = 0. Bone names are the contract with src/world/fauna/miller*.ts.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, empty
import creature as C
from creature import Skeleton, Part, assemble, finish_creature
from organic import Surf, TubeSurf, plate, fin, tube, fang, ringed, cornea, eye, sstep, smooth_lerp

PI = math.pi
TAU = math.tau

kit.PALETTE.update({
    "cornea": dict(color=(0.9, 0.92, 0.95), rough=0.02, alpha=0.18),
    "breaker_eye": dict(color=(0.42, 0.36, 0.14), rough=0.1),
    "breaker_edge": dict(color=(0.45, 0.42, 0.32), rough=0.4),
    "arch_wart": dict(color=(0.75, 0.52, 0.16), rough=0.6),
})


def pose(arm, rots):
    for nm, r in rots.items():
        pb = arm.pose.bones.get(nm)
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = r


def preview_pose(name, cam, target, lens=40, world=(0.5, 0.55, 0.58), up=None, sun=(0.5, -0.6, 0.7), res=(960, 540)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=sun,
                sun_strength=3.5, up=up, res=res)


def armour_bands(name, ts, t0, t1, n, a_center, a_half, m, rng, lift=0.02, thick=0.02, keel=0.0, spines=0, spine_len=0.0, tip=0.3, spine_m=None):
    """overlapping armour bands along a TubeSurf, each covering ±a_half round a_center; returns a list of plates"""
    out = []
    for i in range(n):
        tc = t0 + (t1 - t0) * (i + 0.5) / n
        dt = (t1 - t0) / n * 0.75
        out.append(plate(f"{name}{i}", ts.P, ts.N, tc, a_center + rng.uniform(-0.05, 0.05), dt, a_half, m, rng, lift=lift, thick=thick,
                         dome=0.4, jag=0.12, keel=keel, tip=tip, spines=spines, spine_len=spine_len, spine_m=spine_m, K=16, rings=3))
    return out


# ================================================================================================ breaker shield (image 8)
def breaker(juvenile=False):
    """3 m long (hatchling model: juvenile proportions, scaled in game); ground z = 0"""
    kit.reset()
    root = empty("BreakerShield")
    rng = random.Random(51 if not juvenile else 52)
    J = juvenile
    sk = Skeleton()
    sk.add("body", (0, -1.3, 0.55), (0, 0.9, 0.55))
    sk.add("head", (0, 0.9, 0.42), (0, 1.6, 0.34), "body")
    parts = []
    hh = 1.25 if J else 1.0  # hatchlings: bigger head, lower dome, fewer plates
    # soft body under the shell
    core = Surf([
        (-1.5, 0.15, 0.12, 0.08, 0.4, 2.0),
        (-1.2, 0.7, 0.28, 0.18, 0.36, 2.3),
        (-0.5, 1.0, 0.32, 0.2, 0.38, 2.6),
        (0.3, 1.0, 0.32, 0.2, 0.38, 2.6),
        (0.85, 0.62, 0.24, 0.18, 0.37, 2.4),
        (1.05, 0.4 * hh, 0.2 * hh, 0.16, 0.36, 2.3),
    ])
    parts.append(Part(core.mesh("core", 40, 32, ("breaker_skin",), disp=lambda t, a: 0.02 * math.sin(t * 60 + a * 5) * (math.sin(a) < 0)), bones=["body", "head"]))
    # carapace surface (only its upper half is used): high dome, flared rim
    dome = 0.62 if J else 0.78
    cara = Surf([
        (-1.6, 0.25, 0.1, 0.08, 0.3, 2.0),
        (-1.35, 0.85, 0.42 * dome / 0.78, 0.08, 0.3, 2.3),
        (-0.8, 1.15, 0.7 * dome / 0.78, 0.08, 0.31, 2.6),
        (-0.1, 1.22, dome, 0.08, 0.32, 2.6),
        (0.5, 1.14, 0.72 * dome / 0.78, 0.08, 0.32, 2.5),
        (0.95, 0.82, 0.48 * dome / 0.78, 0.08, 0.31, 2.3),
        (1.12, 0.45, 0.22, 0.08, 0.3, 2.0),
    ])
    # the shell under the plates: dark seams show between them
    shell = [cara.mesh("shellbase", 40, 40, ("breaker_skin",))]
    rows = 5 if J else 7
    for r in range(rows):
        tc = 0.12 + 0.76 * (r + 0.5) / rows
        cols = 5 + (r % 2) if not J else 4 + (r % 2)
        for c in range(cols):
            ac = 0.16 * PI + 0.68 * PI * (c + 0.5) / cols + rng.uniform(-0.03, 0.03)
            mid = 1 - abs(ac - PI / 2) / (PI / 2)
            shell.append(plate(f"cp{r}_{c}", cara.P, cara.N, tc, ac, 0.76 / rows * 0.72, 0.68 * PI / cols * 0.62, "breaker_shell", rng,
                               lift=0.035 + 0.025 * mid, thick=0.06, dome=0.5, jag=0.1, keel=0.06 * mid + 0.025, tip=0.7, K=18, rings=4,
                               sides=6 if (r + c) % 3 else 5, sides_rot=rng.uniform(0, 1), inset=0.02,
                               spines=0 if J else (1 if mid > 0.5 else 0), spine_len=0.12, spine_m="breaker_shell"))
    # marginal skirt plates with points, a second layer at the rim
    for side in (-1, 1):
        for k in range(9 if not J else 6):
            tc = 0.1 + 0.8 * (k + 0.5) / (9 if not J else 6)
            ac = PI / 2 - side * (0.47 * PI)
            shell.append(plate(f"mg{side}{k}", cara.P, cara.N, tc, ac, 0.05, 0.09 * PI, "breaker_edge", rng, lift=0.04, thick=0.04,
                               dome=0.3, jag=0.2, tip=1.0, K=14, rings=3, spines=0 if J else 2, spine_len=0.1, spine_m="breaker_shell"))
    # the rear plate over the tail
    shell.append(plate("rear", cara.P, cara.N, 0.06, PI / 2, 0.06, 0.35, "breaker_shell", rng, lift=0.05, thick=0.05, keel=0.04, tip=1.0))
    parts.append(Part(kit.merge(shell, "shell"), bone="body"))

    # head: a wedge under a heavy pointed helmet
    head = Surf([
        (0.75, 0.42 * hh, 0.26 * hh, 0.18 * hh, 0.42, 2.4),
        (1.1, 0.4 * hh, 0.24 * hh, 0.18 * hh, 0.4, 2.5),
        (1.4, 0.32 * hh, 0.18 * hh, 0.15 * hh, 0.36, 2.5),
        (1.6, 0.18 * hh, 0.1 * hh, 0.1 * hh, 0.32, 2.2),
        (1.68, 0.05, 0.04, 0.04, 0.3, 2.0),
    ])
    parts.append(Part(head.mesh("head", 30, 28, ("breaker_skin",)), bone="head"))
    hp = []
    hp.append(plate("helm", head.P, head.N, 0.6, PI / 2, 0.42, 1.1, "breaker_shell", rng, lift=-0.05, thick=0.08, dome=-0.6, jag=0.06,
                    rear=-1.0, tip=0.8, keel=0.06, K=22, rings=5, inset=0.07))
    hp.append(plate("helm2", head.P, head.N, 0.25, PI / 2, 0.22, 0.95, "breaker_shell", rng, lift=0.08, thick=0.06, dome=0.4, jag=0.15, tip=0.5, keel=0.04, inset=0.06))
    for sx in (-1, 1):
        hp.append(plate(f"cheek{sx}", head.P, head.N, 0.5, PI / 2 - sx * 1.05, 0.3, 0.32, "breaker_shell", rng, lift=0.03, thick=0.04, dome=0.4, jag=0.15, tip=0.6, inset=0.02))
        pe = head.P(0.72, PI / 2 - sx * 1.18)
        hp.append(eye(f"eye{sx}", pe, V((sx, 0.6, 0.0)), 0.03 * hh, "breaker_eye", cornea_m="cornea", pupil=(0.5, 0.9), slit_axis=(1, 0, 0)))
    parts.append(Part(kit.merge(hp, "helmet"), bone="head"))
    # mouth feelers: ringed, thick, hanging forward and down from under the helmet
    fl = []
    nf = 8 if not J else 5
    for k in range(nf):
        x = (k - (nf - 1) / 2) * 0.06
        b = V((x, 1.5, 0.26))
        L = rng.uniform(0.22, 0.34) * (0.7 if J else 1.0)
        pts = [b, b + V((x * 0.4, 0.06, -L * 0.35)), b + V((x * 0.7, 0.07, -L * 0.7)), b + V((x * 0.9, 0.03 + rng.uniform(-0.03, 0.03), -L))]
        fl.append(ringed(f"feel{k}", pts, lambda t: 0.026 * (1 - 0.7 * t) + 0.004, "breaker_feeler", rings=7, groove=0.2, seg=8))
        fl.append(fang(f"fc{k}", pts[-1], V((0, 0.3, -1)), V((0, 1, 0)), 0.03, 0.008, curve=0.4, m="claw_black", seg=5, n=4))
    parts.append(Part(kit.merge(fl, "feelers"), bone="head"))

    # six thick limbs in armour bands, broad feet with long dark claws
    for sx, s in ((-1, "L"), (1, "R")):
        for k, y in enumerate((0.65, -0.05, -0.8)):
            pts = [V((sx * 0.8, y, 0.36)), V((sx * 1.3, y + 0.05, 0.4)), V((sx * 1.62, y + 0.14, 0.18)), V((sx * 1.72, y + 0.24, 0.05))]
            ch = sk.chain(f"limb{s}{k}", [tuple(p) for p in pts], "body")
            r0 = 0.2 if k == 0 else 0.18
            ts = TubeSurf(pts, lambda t, r0=r0: r0 * (1 - 0.4 * t) + 0.02 * math.sin(PI * t), ref=(0, 0, 1))
            parts.append(Part(ts.mesh(f"lm{s}{k}", 30, 16, ("breaker_skin",), disp=lambda t, a: 0.01 * math.sin(t * 50)), bones=ch + ["body"]))
            bands = armour_bands(f"ab{s}{k}", ts, 0.05, 0.92, 6 if not J else 4, 0.0, 1.5, "breaker_shell", rng, lift=0.03, thick=0.03, keel=0.015, tip=0.4)
            # bands ride the segment they sit on
            for i, b in enumerate(bands):
                seg = min(2, int(3 * (i + 0.5) / len(bands)))
                parts.append(Part(b, bone=ch[seg]))
            foot = pts[-1]
            fwd = V((sx * 0.25, 1, 0)).normalized()
            parts.append(Part(kit.sphere(f"pad{s}{k}", 0.16, loc=tuple(foot + fwd * 0.04 + V((0, 0, 0.02))), m="breaker_skin", segs=14, rings=8, scale=(1.15, 1.3, 0.5)), bone=ch[-1]))
            toes = []
            for c in range(5):
                a = (c - 2) * 0.34
                d = V((math.sin(a) * 0.9 + fwd.x * 0.5, math.cos(a), 0)).normalized()
                tb = foot + d * 0.1 + V((0, 0, 0.03))
                tp = [tb, tb + d * 0.08 + V((0, 0, 0.02)), tb + d * 0.15 + V((0, 0, -0.01))]
                toes.append(ringed(f"toe{s}{k}{c}", tp, lambda t: 0.035 * (1 - 0.35 * t), "breaker_skin", rings=3, groove=0.2, seg=8))
                toes.append(fang(f"cl{s}{k}{c}", tp[-1], d + V((0, 0, -0.35)), V((0, 0, -1)), 0.11, 0.024, curve=0.35, m="claw_black", seg=6))
            parts.append(Part(kit.merge(toes, f"toes{s}{k}"), bone=ch[-1]))
    body = assemble("breaker_body", sk, parts)
    name = "fauna_breaker_juv.glb" if J else "fauna_breaker.glb"
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), name), props={"creature": "breaker", "length": 3.0}, ao=0.45)
    return root, arm


def breaker_juv():
    return breaker(juvenile=True)


# ================================================================================================ rift architect (image 7)
def architect():
    """1.4 m carapace; ground z = 0. A broad flat crab-like builder: carapace of overlapping serrated plates crusted
    with orange-yellow tubercles, a margin of big pointed lobes, a rostrum over two rows of glossy black eyes, a fringe
    of fine whiskers, two long antennae; slender spined manipulators ending in long jointed fingers; six flattened
    armoured walking legs with spines and pointed tips."""
    kit.reset()
    root = empty("RiftArchitect")
    rng = random.Random(61)
    sk = Skeleton()
    sk.add("body", (0, -0.45, 0.42), (0, 0.42, 0.42))
    parts = []
    core = Surf([
        (-0.55, 0.2, 0.08, 0.06, 0.38, 2.0),
        (-0.35, 0.5, 0.14, 0.12, 0.38, 2.4),
        (0.0, 0.58, 0.16, 0.14, 0.38, 2.6),
        (0.35, 0.48, 0.14, 0.12, 0.37, 2.5),
        (0.58, 0.26, 0.12, 0.1, 0.35, 2.2),
        (0.66, 0.1, 0.06, 0.06, 0.34, 2.0),
    ])
    parts.append(Part(core.mesh("core", 30, 28, ("arch_leg",)), bone="body"))
    cara = Surf([
        (-0.62, 0.2, 0.05, 0.03, 0.46, 2.0),
        (-0.45, 0.62, 0.14, 0.03, 0.47, 2.4),
        (-0.1, 0.8, 0.2, 0.03, 0.48, 2.8),
        (0.25, 0.78, 0.2, 0.03, 0.48, 2.8),
        (0.48, 0.58, 0.15, 0.03, 0.47, 2.5),
        (0.62, 0.3, 0.09, 0.03, 0.45, 2.2),
        (0.7, 0.08, 0.04, 0.03, 0.44, 2.0),
    ])
    shell = [cara.mesh("cbase", 30, 36, ("arch_leg",))]
    warts = []
    rows = 6
    for r in range(rows):
        tc = 0.1 + 0.8 * (r + 0.5) / rows
        cols = 5 + (r % 2)
        for c in range(cols):
            ac = 0.1 * PI + 0.8 * PI * (c + 0.5) / cols + rng.uniform(-0.04, 0.04)
            mid = 1 - abs(ac - PI / 2) / (PI / 2)
            shell.append(plate(f"cp{r}_{c}", cara.P, cara.N, tc, ac, 0.8 / rows * 0.75, 0.8 * PI / cols * 0.65, "arch_shell", rng,
                               lift=0.025, thick=0.018, dome=0.4, jag=0.3, keel=0.012, tip=0.9, K=20, rings=3, inset=0.008,
                               spines=2, spine_len=0.05, spine_m="arch_wart"))
            # tubercles crusting the plate
            for w in range(rng.randint(2, 5)):
                tt = tc + rng.uniform(-0.05, 0.05)
                aa = ac + rng.uniform(-0.15, 0.15)
                p = cara.P(tt, aa) + cara.N(tt, aa) * 0.03
                warts.append(kit.sphere(f"w{r}{c}{w}", rng.uniform(0.008, 0.02), loc=tuple(p), m="arch_wart", segs=6, rings=4, scale=(1, 1, 0.7)))
    # marginal lobes: big pointed plates round the rim, pointing outward, two layers
    for side in (-1, 1):
        for k in range(8):
            tc = 0.08 + 0.84 * (k + 0.5) / 8
            ac = PI / 2 - side * 0.47 * PI
            out_sign = -1 if side > 0 else 1

            def outline(th, out_sign=out_sign):
                o = max(0.0, math.sin(th) * out_sign)
                return 1 + 1.3 * o ** 5
            shell.append(plate(f"mg{side}{k}", cara.P, cara.N, tc, ac, 0.055, 0.14, "arch_shell", rng, lift=0.0, thick=0.016,
                               dome=0.3, jag=0.25, outline=outline, K=20, rings=3, inset=0.01 + 0.006 * (k % 2)))
            tipp = cara.P(tc, ac + out_sign * 0.3)
            shell.append(fang(f"mgs{side}{k}", tipp, V((side * 1, -0.2, 0.15)), V((0, 0, 1)), 0.06, 0.012, curve=0.2, m="arch_wart", seg=5, n=4))
    # rostrum
    shell.append(fang("rostrum", V((0, 0.62, 0.5)), V((0, 1, -0.15)), V((0, 0, -1)), 0.2, 0.05, curve=0.15, m="arch_shell", seg=8))
    parts.append(Part(kit.merge(shell, "shell"), bone="body"))
    parts.append(Part(kit.merge(warts, "warts"), bone="body"))
    # face: two rows of glossy eyes under the rostrum, a fringe of whiskers, antennae
    face = []
    for i in range(6):
        x = (i % 3 - 1) * 0.07 + (0.035 if i >= 3 else 0)
        x = ((i % 3) - 1) * 0.075
        z = 0.42 if i < 3 else 0.37
        y = 0.64 if i < 3 else 0.62
        face.append(eye(f"eye{i}", V((x, y, z)), V((x * 3, 1, 0.1)), 0.024 if i < 3 else 0.018, "mimic_pupil", cornea_m="cornea", pupil=(0.3, 0.3)))
    for k in range(16):
        x = (k - 7.5) * 0.028
        b = V((x, 0.6, 0.33))
        L = rng.uniform(0.25, 0.45)
        curl = rng.uniform(-0.06, 0.06)
        pts = [b, b + V((x * 0.3, 0.06, -0.06)), b + V((x * 0.6 + curl, 0.1, -L * 0.55)), b + V((x * 0.9 + curl * 2, 0.08 + rng.uniform(0, 0.06), -L))]
        face.append(tube(f"wh{k}", [smooth_lerp(pts, 3 * q / 8) for q in range(9)], [0.005 * (1 - 0.8 * q / 8) + 0.0008 for q in range(9)], "arch_tendril", seg=4))
    for sx in (-1, 1):
        b = V((sx * 0.06, 0.66, 0.46))
        ap = [b, b + V((sx * 0.08, 0.15, 0.2)), b + V((sx * 0.18, 0.12, 0.48)), b + V((sx * 0.32, -0.05, 0.62)), b + V((sx * 0.45, -0.3, 0.6))]
        face.append(ringed(f"ant{sx}", ap, lambda t: 0.009 * (1 - 0.75 * t), "arch_tendril", rings=18, groove=0.15, seg=5))
    parts.append(Part(kit.merge(face, "face"), bone="body"))
    # manipulators: long, slender, spined, with skeletal fingers
    for sx, s in ((-1, "L"), (1, "R")):
        pts = [V((sx * 0.16, 0.5, 0.3)), V((sx * 0.34, 0.8, 0.5)), V((sx * 0.34, 1.05, 0.32)), V((sx * 0.27, 1.17, 0.12)), V((sx * 0.22, 1.22, 0.04))]
        ch = sk.chain(f"man{s}", [tuple(p) for p in pts], "body")
        segs = []
        for i in range(4):
            a, b = pts[i], pts[i + 1]
            r0 = 0.034 - 0.005 * i
            ts = TubeSurf([a, a.lerp(b, 0.5), b], lambda t, r0=r0: r0 * (0.85 + 0.25 * math.sin(PI * t) ** 0.5), ref=(0, 0, 1))
            m = ts.mesh(f"ms{s}{i}", 12, 10, ("arch_leg",))
            sp = [m]
            for q in range(3):
                tq = 0.25 + 0.25 * q
                pq = ts.P(tq, PI / 2 + sx * 0.4)
                sp.append(fang(f"msp{s}{i}{q}", pq, ts.N(tq, PI / 2 + sx * 0.4) + (b - a).normalized() * 0.5, (b - a), 0.03, 0.006, curve=0.3, m="arch_wart", seg=4, n=4))
            sp.append(kit.sphere(f"mj{s}{i}", r0 * 1.15, loc=tuple(b), m="arch_shell", segs=10, rings=6))
            parts.append(Part(kit.merge(sp, f"mseg{s}{i}"), bone=ch[i]))
        hand = pts[-1]
        fingers = []
        for f in range(4):
            a = (f - 1.5) * 0.4
            d = V((math.sin(a) * 0.8 + sx * 0.1, 0.6, -0.35)).normalized()
            fp = [hand, hand + d * 0.06, hand + d * 0.11 + V((0, 0.02, -0.01)), hand + d * 0.15 + V((0, 0.035, -0.04))]
            fingers.append(ringed(f"fg{s}{f}", fp, lambda t: 0.008 * (1 - 0.6 * t), "arch_leg", rings=3, groove=0.3, seg=6))
            fingers.append(fang(f"fgc{s}{f}", fp[-1], (fp[-1] - fp[-2]), V((0, 0, -1)), 0.03, 0.004, curve=0.4, m="claw_black", seg=4, n=4))
        parts.append(Part(kit.merge(fingers, f"hand{s}"), bone=ch[-1]))
    # six flattened walking legs, armoured with spines
    for sx, s in ((-1, "L"), (1, "R")):
        for k, y in enumerate((0.25, -0.1, -0.42)):
            pts = [V((sx * 0.5, y, 0.36)), V((sx * 0.82, y + 0.03, 0.58)), V((sx * 1.04, y - 0.01, 0.28)), V((sx * 1.12, y - 0.04, 0.0))]
            ch = sk.chain(f"leg{s}{k}", [tuple(p) for p in pts], "body")
            ts = TubeSurf(pts, lambda t: 0.085 * (1 - 0.75 * t) + 0.008, ref=(0, 0, 1), squash=0.6)
            parts.append(Part(ts.mesh(f"lg{s}{k}", 28, 12, ("arch_leg",)), bones=ch))
            bands = armour_bands(f"lb{s}{k}", ts, 0.04, 0.9, 6, 0.0, 1.7, "arch_shell", rng, lift=0.012, thick=0.012, keel=0.006, tip=0.8,
                                 spines=1, spine_len=0.035, spine_m="arch_wart")
            for i, b in enumerate(bands):
                parts.append(Part(b, bone=ch[min(2, int(3 * (i + 0.5) / len(bands)))]))
            parts.append(Part(fang(f"dact{s}{k}", pts[-1] + V((0, 0, 0.03)), V((0, 0, -1)), V((sx, 0, 0)), 0.05, 0.016, curve=0.2, m="arch_shell", seg=6), bone=ch[-1]))
    body = assemble("architect_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_architect.glb"), props={"creature": "architect"}, ao=0.25)
    return root, arm


# ================================================================================================ mimic crawler (image 4)
def mimic(juvenile=False):
    """span ~2.4 m (juvenile model: bigger eyes, fewer plates, scaled in game); ground z = 0. Octopoid: a hooded mantle
    shingled with pointed leaf-scales, a lumpy face with large gold slit-pupilled eyes under heavy brows; eight thick arms,
    scaled on top, pink-purple below with cupped suckers, rows of curved white hooks, bristles, a hooked tip claw."""
    kit.reset()
    root = empty("MimicCrawler")
    rng = random.Random(31 if not juvenile else 33)
    J = juvenile
    sk = Skeleton()
    sk.add("body", (0, -0.6, 0.42), (0, 0.05, 0.42))
    sk.add("head", (0, 0.05, 0.36), (0, 0.42, 0.36), "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"eye{s}", (sx * 0.2, 0.26, 0.45), (sx * 0.29, 0.31, 0.45), "head")
    parts = []
    mantle = Surf([
        (-0.86, 0.05, 0.05, 0.05, 0.5, 2.0),
        (-0.72, 0.2, 0.18, 0.12, 0.5, 2.2),
        (-0.45, 0.3, 0.26, 0.18, 0.46, 2.3),
        (-0.15, 0.32, 0.24, 0.2, 0.42, 2.3),
        (0.08, 0.3, 0.2, 0.2, 0.38, 2.4),
        (0.26, 0.27 if not J else 0.29, 0.17, 0.18, 0.37, 2.5),
        (0.4, 0.2, 0.12, 0.14, 0.33, 2.4),
        (0.47, 0.08, 0.06, 0.08, 0.3, 2.0),
    ])

    def mdisp(t, a):
        # lumps and folds over the face and mantle
        return 0.012 * math.sin(t * 40 + 3 * math.sin(a * 3)) * math.sin(a * 5 + t * 9) + 0.02 * math.exp(-((t - 0.8) / 0.05) ** 2) * (math.sin(a) > 0)
    parts.append(Part(mantle.mesh("mantle", 60, 40, ("mimic_skin", "mimic_under"), disp=mdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.6 else 0), bones=["body", "head"]))
    sh = []
    rows = 9 if not J else 6
    for r in range(rows):
        tc = 0.1 + 0.58 * (r + 0.5) / rows
        cols = 6 + (r % 2)
        for c in range(cols):
            ac = 0.12 * PI + 0.76 * PI * (c + 0.5) / cols + rng.uniform(-0.04, 0.04)
            sh.append(plate(f"sh{r}_{c}", mantle.P, mantle.N, tc, ac, 0.58 / rows * 0.8, 0.76 * PI / cols * 0.62, "mimic_plate", rng,
                            lift=0.022, thick=0.008, dome=0.35, jag=0.25, keel=0.004, tip=1.0, K=12, rings=3, inset=0.004))
    parts.append(Part(kit.merge(sh, "shingles"), bones=["body", "head"]))
    # heavy brows and the eyes beneath them (gold, horizontal slit pupils), the beak hidden under the head
    for sx, s in ((-1, "L"), (1, "R")):
        ec = V((sx * 0.2, 0.26, 0.45))
        en = V((sx * 0.85, 0.5, 0.15)).normalized()
        er = 0.068 * (1.3 if J else 1.0)
        parts.append(Part(eye(f"eyeball{s}", ec, en, er, "mimic_eye", cornea_m="cornea", pupil=(0.5, 0.28), slit_axis=en.cross(V((0, 0, 1)))), bone=f"eye{s}"))
        bp = plate(f"brow{s}", mantle.P, mantle.N, 0.8, PI / 2 - sx * 0.62, 0.07, 0.38, "mimic_plate", rng, lift=0.03, thick=0.022, dome=0.5, jag=0.12,
                   rear=-1.0, tip=0.8, keel=0.01, inset=0.03)
        parts.append(Part(bp, bone="head"))
        lid = tube(f"lid{s}", [ec + (en * 0.4 + V((0, 0, -0.9)).normalized() * 0.9 * 0.0 + V((0, 0, -1))).normalized() * er * 0.95 + V((0, 0, 0)) + en.cross(V((0, 0, 1))).normalized() * (er * 0.9 * math.cos(PI * q / 6)) * 1.0 for q in range(7)],
                   [0.012] * 7, "mimic_skin", seg=6)
        parts.append(Part(lid, bone="head"))
    for zz, ln in ((0.17, 0.07), (0.15, 0.06)):
        parts.append(Part(fang(f"beak{zz}", V((0, 0.16, zz)), V((0, 1, -0.6)), V((0, 0, -1)), ln, 0.025, curve=0.4, m="claw_black", seg=6), bone="head"))
    # eight arms
    angs = [38, 72, 110, 148]
    for sx, s in ((-1, "L"), (1, "R")):
        for k, adeg in enumerate(angs):
            a = math.radians(adeg) * sx
            out = V((math.sin(a), math.cos(a), 0))
            base = V((out.x * 0.17, 0.1 + out.y * 0.14, 0.19))
            L = (1.25 - 0.08 * k + rng.uniform(-0.05, 0.05)) * (0.85 if J else 1.0)
            knee_h = (0.14, 0.26, 0.36, 0.36)[k]
            path = []
            N = 44
            curl = rng.uniform(0.8, 1.3)
            for i in range(N):
                t = i / (N - 1)
                d = L * (0.25 + 0.75 * t) * (0.85 if t > 0.7 else 1)
                h = knee_h * math.sin(PI * min(1.0, t * 1.65)) if t < 0.6 else 0.06 * (1 - t)
                p = base + out * (d * min(1.0, t * 1.6)) + V((0, 0, h))
                if t > 0.62:
                    ct = (t - 0.62) / 0.38
                    side = out.cross(V((0, 0, 1))) * (sx if k % 2 == 0 else -sx)
                    p = p + side * (0.22 * curl * ct ** 2) - out * (0.12 * ct ** 3)
                path.append(p)
            ch = sk.chain(f"arm{s}{k}", [tuple(path[round(q * (N - 1) / 5)]) for q in range(6)], "body")
            ts = TubeSurf(path, lambda t: 0.1 * (1 - t) ** 0.85 + 0.013, ref=(0, 0, 1), samples=N)
            # material by angle: a = 0 is the top (ref up), a = π underneath
            limb = ts.mesh(f"arm{s}{k}m", 60, 14, ("mimic_skin", "mimic_under"), mat_fn=lambda t, a: 1 if math.cos(a) < -0.35 else 0,
                           disp=lambda t, a: 0.004 * math.sin(t * 90) * (math.cos(a) > 0))
            parts.append(Part(limb, bones=ch + ["body"]))
            # leaf-scales along the top of the proximal two thirds
            pl = []
            nsc = 10 if not J else 6
            for i in range(nsc):
                tc = 0.04 + 0.62 * (i + 0.5) / nsc
                for side_a in (-0.55, 0.0, 0.55):
                    pl.append(plate(f"ap{s}{k}{i}{side_a}", ts.P, ts.N, tc, side_a + rng.uniform(-0.1, 0.1), 0.62 / nsc * 0.75, 0.42, "mimic_plate", rng,
                                    lift=0.012, thick=0.006, dome=0.3, jag=0.25, tip=1.0, rear=1.0, K=10, rings=2, inset=0.002))
            parts.append(Part(kit.merge(pl, f"apl{s}{k}"), bones=ch))
            # suckers: rims with a cup, in two rows under the distal part; hooks along both under-edges; bristles
            det = []
            for i in range(int(N * 0.42), N - 3, 2):
                t = i / (N - 1)
                for row in (-1, 1):
                    aa = PI + row * 0.5
                    c = ts.P(t, aa)
                    n = ts.N(t, aa)
                    r = ts.r(t)
                    su = kit.torus(f"su{s}{k}{i}{row}", r * 0.3, r * 0.11, m="mimic_sucker", seg=8, rseg=4)
                    from fauna_jupiter import orient
                    det.append(orient(su, n, c + n * (r * 0.05)))
                    cup = kit.sphere(f"cu{s}{k}{i}{row}", r * 0.22, loc=tuple(c - n * (r * 0.02)), m="mimic_under", segs=6, rings=3, scale=(1, 1, 0.4))
                    det.append(orient(cup, n, c))
            for i in range(int(N * 0.3), N - 4, 3):
                t = i / (N - 1)
                for row in (-1, 1):
                    aa = PI / 2 * row + row * 0.35
                    c = ts.P(t, aa)
                    n = ts.N(t, aa)
                    c0, tt, xx, yy = ts.frame(t)
                    det.append(fang(f"hk{s}{k}{i}{row}", c - n * 0.004, n * 0.7 + V((0, 0, -0.5)), -tt, 0.03 + 0.04 * ts.r(t) / 0.1, ts.r(t) * 0.18 + 0.004,
                                    curve=0.55, m="mimic_hook", seg=5, n=5))
            for i in range(2, N - 2, 3):
                t = i / (N - 1)
                for row in (-1, 1):
                    aa = row * 1.25 + rng.uniform(-0.2, 0.2)
                    c = ts.P(t, aa)
                    n = ts.N(t, aa)
                    det.append(tube(f"br{s}{k}{i}{row}", [c, c + n * 0.012 + V((0, 0, 0.004)), c + n * 0.022 + V((0, 0, 0.002))], [0.0016, 0.001, 0.0004], "mimic_hook", seg=3))
            c0, tt, xx, yy = ts.frame(1.0)
            det.append(fang(f"claw{s}{k}", path[-1] - tt * 0.01, tt, V((0, 0, -1)), 0.09, 0.014, curve=0.4, m="mimic_hook", seg=6))
            parts.append(Part(kit.merge(det, f"adet{s}{k}"), bones=ch))
    body = assemble("mimic_body", sk, parts)
    name = "fauna_mimic_juv.glb" if J else "fauna_mimic.glb"
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), name), props={"creature": "mimic", "span": 2.4}, ao=0.3)
    return root, arm


def mimic_juv():
    return mimic(juvenile=True)


# ================================================================================================ sediment maw (image 3)
def sedimentmaw():
    """2.4 m across; the sediment surface at z = 0 (the body mostly below it); mouth modelled open. A low gritted mound
    round a deep funnel whose walls are lined with fluted folds and nodules, a thick rolled ringed lip, and stubby
    limbs in deeply grooved ring segments gripping the sediment."""
    from fauna_jupiter import grid
    kit.reset()
    root = empty("SedimentMaw")
    rng = random.Random(23)
    sk = Skeleton()
    sk.add("body", (0, -0.6, -0.2), (0, 0.6, -0.2))
    MX, MY = 0.0, 0.12
    RIM = 0.62
    sk.add("throat", (MX, MY, -0.1), (MX, MY, -0.75), "body")
    NL = 16
    for i in range(NL):
        a = TAU * i / NL
        c, sn = math.cos(a), math.sin(a)
        sk.add(f"lip{i}", (MX + c * RIM, MY + sn * RIM, 0.12), (MX + c * RIM, MY + sn * RIM, 0.32))
    lips = [f"lip{i}" for i in range(NL)]

    def back_z(x, y):
        r = math.hypot(x / 1.25, (y - 0.02) / 1.08)
        dm = math.hypot(x - MX, y - MY)
        lip = 0.15 * math.exp(-((dm - (RIM + 0.08)) / 0.3) ** 2) if dm > RIM else 0.15
        return 0.18 * max(0.0, 1 - r * r) ** 0.8 - 0.06 + lip * min(1.0, max(0.0, 1 - r) * 4)
    parts = []
    nu, nv = 140, 28

    def Pb(i, j):
        a = TAU * i / nu
        t = j / (nv - 1)
        ox, oy = math.cos(a) * 1.25 * (1 + 0.07 * math.sin(a * 3 + 0.5) + 0.03 * math.sin(a * 7)), math.sin(a) * 1.08 * (1 + 0.05 * math.sin(a * 5))
        ix, iy = MX + math.cos(a) * (RIM + 0.1), MY + math.sin(a) * (RIM + 0.1)
        x = ox + (ix - ox) * t
        y = oy + (iy - oy) * t
        z = back_z(x, y) - 0.22 * (1 - t) ** 3
        # radial drawstring folds toward the lip, irregular lumps beyond
        z += 0.03 * (abs(math.sin(a * 23 + 0.4 * math.sin(a * 5))) ** 0.6 - 0.5) * t ** 2.2
        z += 0.012 * math.sin(x * 23 + 2 * math.sin(y * 17)) * math.sin(y * 19 + x * 7)
        return (x, y, z)
    back = grid("back", Pb, nu, nv, ("maw_hide", "maw_lip"), mat_fn=lambda i, j: 1 if j > nv * 0.82 else 0)
    parts.append(Part(back, bones=["body"] + lips))
    # the funnel: deep flutes (rounded ridges, narrow grooves) studded with nodules, ring corrugations, the gullet
    nf, nd = 216, 34

    def Pf(i, j):
        a = TAU * i / nf
        t = j / (nd - 1)
        fl = abs(math.sin(a * 18 + 0.3 * math.sin(a * 3))) ** 0.35
        flute = 0.06 * (1 - t * 0.6) * (fl - 0.7)
        nod = 0.012 * fl ** 4 * max(0.0, math.sin(t * 46 + a * 2)) * (1 - t)
        rings = 0.008 * math.sin(t * 80) * (1 - t)
        r = (RIM + 0.06) * (1 - t) ** 1.25 + 0.07 + flute + nod + rings
        z = back_z(MX + math.cos(a) * (RIM + 0.06), MY + math.sin(a) * (RIM + 0.06)) + 0.02 - 1.1 * t ** 0.85
        return (MX + math.cos(a) * r, MY + math.sin(a) * r, z)
    fun = grid("funnel", Pf, nf, nd, ("maw_lip", "maw_gullet"), mat_fn=lambda i, j: 1 if j > nd * 0.5 else 0, poles=(None, (MX, MY, -0.95)))
    parts.append(Part(fun, bones=lips + ["throat"]))
    # the rolled lip: a thick fleshy ring, lobed, in ring segments
    lp = []
    for k in range(97):
        a = TAU * k / 96
        rr = RIM + 0.07 + 0.015 * math.sin(a * 7)
        x, y = MX + math.cos(a) * rr, MY + math.sin(a) * rr
        lp.append(V((x, y, back_z(x, y) - 0.005)))
    parts.append(Part(ringed("lip", lp, lambda t: 0.07 + 0.018 * math.sin(t * TAU * 5) + 0.01 * math.sin(t * TAU * 13), "maw_lip", rings=44, groove=0.1, seg=12, samples=420), bones=lips))
    # gravel and grit cemented to the back: dense, mixed sizes, dark and sandy
    peb = []
    for k in range(1300):
        a = rng.uniform(0, TAU)
        t = rng.random() ** 0.7
        rr = (RIM + 0.2) + t * 0.75
        x = MX + math.cos(a) * rr
        y = MY + math.sin(a) * rr * 0.86 - 0.04
        if math.hypot(x / 1.25, y / 1.08) > 0.98:
            continue
        r = rng.uniform(0.006, 0.03) * (1.8 if rng.random() < 0.06 else 1)
        z = back_z(x, y) - 0.22 * max(0.0, (rr - RIM - 0.06) / 0.75) ** 3 + r * 0.2
        peb.append(kit.sphere(f"p{k}", r, loc=(x, y, z), m="maw_pebble" if rng.random() < 0.5 else "maw_hide", segs=5, rings=3,
                              scale=(1, 0.7 + 0.5 * rng.random(), 0.45)))
    parts.append(Part(kit.merge(peb, "pebbles"), bones=["body"] + lips))
    for sx in (-1, 1):
        x, y = sx * 0.34, -0.82
        v = kit.torus(f"valve{sx}", 0.06, 0.025, loc=(x, y, back_z(x, y) - 0.03), m="maw_lip", seg=16, rseg=6)
        v.scale = (1.0, 0.55, 0.6)
        parts.append(Part(v, bone="body"))
    # ringed digging limbs gripping down into the sediment, tips curled
    for sx, s in ((-1, "L"), (1, "R")):
        for k in range(3):
            a_side = (-0.55 + 0.5 * k) + rng.uniform(-0.08, 0.08)
            ang = a_side if sx > 0 else PI - a_side
            out = V((math.cos(ang), math.sin(ang) * 0.9, 0)).normalized()
            base = V((math.cos(ang) * 1.05, math.sin(ang) * 0.9, -0.08))
            L = 0.7 + 0.25 * rng.random()
            path = []
            for i in range(40):
                t = i / 39
                p = base + out * (L * (0.7 * t + 0.2 * t * t)) + V((0, 0, 0.14 * math.sin(PI * min(1, t * 1.3)) - 0.42 * t ** 2.2))
                if t > 0.75:
                    p = p - out * (0.25 * (t - 0.75) ** 2)
                path.append(p)
            from fauna_jupiter import chain_along
            ch = chain_along(sk, f"limb{s}{k}", path, 3, "body")
            parts.append(Part(ringed(f"limb{s}{k}m", path, lambda t: 0.15 * (1 - 0.55 * t) + 0.01, "maw_limb", rings=15, groove=0.16, seg=14, samples=160), bones=ch + ["body"]))
    body = assemble("sedimentmaw_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_sedimentmaw.glb"), props={"creature": "sedimentmaw", "rim": RIM, "mouth": f"{MX:.2f},{MY:.2f}"}, ao=0.4)
    return root, arm


# ================================================================================================ ferracaris (image 6)
def ferracaris():
    """0.25 m adult, origin on the rock surface under the body centre, +Y forward. Flat oval grazer: head shield, seven
    overlapping segments whose sides end in rounded lobes and whose rear margins are scalloped and stand proud, a tail
    plate; a dense fringe of fine translucent pink spines under the skirt; eleven pairs of short ringed pale legs.
    A static mesh: colonies are instanced and the legs/fringe animate in the vertex shader (src/world/fauna/miller.ts)."""
    from fauna_jupiter import grid
    kit.reset()
    root = empty("Ferracaris")
    rng = random.Random(12)
    L, W, Hh = 0.25, 0.165, 0.05
    parts = []

    def outline(t):
        tt = min(0.985, max(0.015, t))
        return W / 2 * math.sin(PI * tt) ** 0.5 * (0.96 + 0.06 * t)
    n = 9
    edges = [i / n for i in range(n + 1)]
    for k in range(n):
        t0, t1 = edges[k], edges[k + 1]
        y0, y1 = -L / 2 + L * t0, -L / 2 + L * t1
        head = k == n - 1
        tail = k == 0
        nu, nv = 28, 6
        lobes = 4 if not (head or tail) else 6

        def P(i, j, t0=t0, t1=t1, y0=y0, y1=y1, head=head, tail=tail, lobes=lobes, k=k):
            u = -1 + 2 * i / (nu - 1)
            v = j / (nv - 1)
            tt = t0 + (t1 - t0) * (0.5 + (v - 0.5) * (1 - 0.38 * abs(u) ** 3))
            hw = outline(tt) * 1.1
            x = u * hw
            scal = 0.011 * abs(math.sin((u + 1) * PI * lobes / 2)) ** 0.55 * (1 - v) ** 3
            span = (y1 - y0 + 0.007) * (1 - 0.38 * abs(u) ** 3)
            yc = (y0 + y1) / 2 - 0.003
            y = yc + (v - 0.5) * span - scal
            if head:
                y += 0.02 * (1 - u * u) * v ** 2
            if tail:
                y -= 0.018 * (1 - u * u) * (1 - v) ** 2
            au = abs(u)
            z = Hh * (1 - au * au) ** 0.6 * (0.78 + 0.22 * math.sin(PI * tt))
            z -= 0.012 * sstep(0.62, 1.0, au)
            z += 0.008 * (1 - v) ** 2
            z += 0.0025 * math.sin(u * 11 + k * 1.7) * (1 - au) + 0.0012 * math.sin(u * 37 + k)
            return (x, y, z + 0.016)
        pl = grid(f"seg{k}", P, nu, nv, ("ferra_plate",), wrap_u=False)
        kit.add_solidify(pl, 0.0035, 0.0)
        kit.bake(pl)
        parts.append(pl)
        rim = [tuple(V(P(i, 0)) + V((0, 0, 0.0012))) for i in range(nu)]
        parts.append(tube(f"rim{k}", rim, [0.0011] * nu, "ferra_rim", seg=4))
        # the fringe: many fine translucent spines of uneven length under the skirt
        for side in (-1, 1):
            nf = 7 if not head else 11
            for f in range(nf):
                if head:
                    a = PI / 2 * (f + 0.5) / nf * side
                    hw = outline(0.97) * 1.1
                    base = V((math.sin(a) * hw * 1.04, y1 + 0.016 * math.cos(a), 0.007))
                    d = V((math.sin(a) * 0.8, math.cos(a) * 0.8, -0.55)).normalized()
                else:
                    tt = t0 + (t1 - t0) * (f + 0.5) / nf
                    hw = outline(tt) * 1.1
                    base = V((side * hw * 0.97, -L / 2 + L * tt, 0.006))
                    d = V((side * 0.78, -0.1 + rng.uniform(-0.15, 0.15), -0.6)).normalized()
                ln = 0.008 + 0.012 * rng.random() ** 1.5
                parts.append(fang(f"fr{k}{side}{f}", base, d, V((0, 0, -1)), ln, 0.0011, curve=0.15, m="ferra_fringe", seg=3, n=3))
    for side in (-1, 1):
        parts.append(kit.sphere(f"eye{side}", 0.0035, loc=(side * 0.028, L / 2 - 0.006, 0.016 + Hh * 0.62), m="mimic_pupil", segs=8, rings=5))
    for k in range(11):
        tt = 0.12 + 0.76 * k / 10
        y = -L / 2 + L * tt
        hw = outline(tt)
        for side in (-1, 1):
            pts = [V((side * hw * 0.45, y, 0.012)), V((side * hw * 1.06, y + 0.004, 0.017)), V((side * hw * 1.22, y + 0.008, 0.0))]
            parts.append(ringed(f"leg{k}{side}", pts, lambda t: 0.0026 * (1 - 0.55 * t), "ferra_leg", rings=4, groove=0.25, seg=4, samples=10))
    parts.append(kit.sphere("sole", 1.0, loc=(0, 0, 0.012), m="ferra_leg", segs=20, rings=8, scale=(W * 0.42, L * 0.45, 0.006)))
    body = kit.merge(parts, "ferracaris_body")
    kit.smooth(body, 45)
    body.parent = root
    C.bake_ao(body, distance=0.03)
    kit.set_props(root, creature="ferracaris", length=L)
    kit.select_tree(root)
    path = os.path.join(kit.out_dir(), "fauna_ferracaris.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT",
                              export_vertex_color="NAME", export_vertex_color_name="AO", export_all_vertex_colors=False)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[creature] {path} ~{tris} tris, {os.path.getsize(path) / 1e6:.2f} MB")
    return root, None


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["breaker"]
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w in ("breaker", "breaker_juv"):
            preview_pose(f"fauna_{w}", (-1.8, 4.3, 1.1), (0, 0.6, 0.45), lens=35, sun=(0.4, 0.5, 0.8))
            preview_pose(f"fauna_{w}_side", (-4.8, 0.6, 2.0), (0, 0.0, 0.4), lens=35, sun=(0.4, 0.5, 0.8))
        elif w in ("mimic", "mimic_juv"):
            preview_pose(f"fauna_{w}", (-1.5, 2.1, 0.85), (0, 0.1, 0.3), lens=35, world=(0.45, 0.5, 0.55))
            preview_pose(f"fauna_{w}_eye", (0.75, 0.95, 0.6), (0.15, 0.25, 0.4), lens=40, world=(0.45, 0.5, 0.55))
        elif w == "ferracaris":
            preview_pose("fauna_ferracaris", (0.32, -0.26, 0.2), (0, 0, 0.02), lens=50)
        elif w == "sedimentmaw":
            preview_pose("fauna_sedimentmaw", (0.6, -3.0, 1.5), (0, 0.15, -0.05), lens=38, world=(0.6, 0.62, 0.62))
        elif w == "architect":
            preview_pose("fauna_architect", (-1.3, 2.6, 1.0), (0, 0.35, 0.35), lens=35, sun=(0.4, 0.5, 0.8))
