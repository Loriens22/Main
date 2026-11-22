"""Creature construction kit.

Organic bodies are lofted along a spine (each station a superellipse cross-section with separate dorsal and ventral
heights), with fins and membranes as thin cambered sheets, limbs and tentacles as tapered tubes along smooth curves,
armour as curved overlapping plates, teeth and claws as curved cones. Every piece is skinned to a named bone rig:

  sp0..spN      the spine, head to tail (sp0 carries the head)
  jaw           the lower jaw (opens about the body's lateral axis)
  <name>0..n    any chain: fins (finL, finR), legs (legL1, legR1 ...), arms, tentacles, lure, wings

Animation is procedural in the engine (src/life/Rig.ts): it addresses bones by these names and bends them about the
body's own axes, so the rig needs no baked clips. Creatures face +Y in Blender (-Z in the engine), up +Z.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

from bl import Part, bake_ao, props

TAU = math.tau
UP = Vector((0, 0, 1))


def V(p):
    return p if isinstance(p, Vector) else Vector(p)


def catmull(pts, n):
    """resample a polyline into n points along a centripetal-ish Catmull-Rom curve"""
    P = [V(p) for p in pts]
    if len(P) == 2:
        return [P[0].lerp(P[1], i / (n - 1)) for i in range(n)]
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    seg = len(P) - 1
    out = []
    for i in range(n):
        t = i / (n - 1) * seg
        k = min(int(t), seg - 1)
        u = t - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        u2, u3 = u * u, u * u * u
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    return out


def interp(stations, n):
    """resample a list of (t, value-tuple) keyed profiles to n samples (linear in t, smoothstep eased)"""
    out = []
    for i in range(n):
        t = i / (n - 1)
        for k in range(len(stations) - 1):
            t0, a = stations[k]
            t1, b = stations[k + 1]
            if t0 <= t <= t1 or k == len(stations) - 2:
                f = 0 if t1 == t0 else max(0.0, min(1.0, (t - t0) / (t1 - t0)))
                f = f * f * (3 - 2 * f)
                out.append(tuple(x + (y - x) * f for x, y in zip(a, b)))
                break
    return out


def frames(pts, up=UP):
    """rotation-minimising frames along a curve: (T, L, N) per point (T forward along the curve)"""
    out = []
    T0 = (pts[1] - pts[0]).normalized()
    L = up.cross(T0)
    if L.length < 1e-6:
        L = Vector((1, 0, 0))
    L.normalize()
    for i, p in enumerate(pts):
        if i == 0:
            T = T0
        elif i == len(pts) - 1:
            T = (pts[i] - pts[i - 1]).normalized()
        else:
            T = (pts[i + 1] - pts[i - 1]).normalized()
        L = (L - T * L.dot(T))
        if L.length < 1e-6:
            L = up.cross(T)
        L.normalize()
        N = T.cross(L).normalized()
        out.append((T, L, N))
    return out


class Rig:
    """Bones plus the skinned parts bound to them."""

    def __init__(self, name):
        self.name = name
        self.bones = {}
        self.order = []
        self.parts = []

    def bone(self, name, head, tail, parent=None):
        self.bones[name] = (V(head).copy(), V(tail).copy(), parent)
        self.order.append(name)
        return name

    def chain(self, prefix, pts, parent=None):
        """bones prefix0..prefix(n-2) through consecutive points"""
        names = []
        prev = parent
        pts = [V(p) for p in pts]
        for i in range(len(pts) - 1):
            n = f"{prefix}{i}"
            self.bone(n, pts[i], pts[i + 1], prev)
            names.append(n)
            prev = n
        # a short leaf bone at the tip: glTF keeps no bone tails, the engine reads segment lengths from children
        d = (pts[-1] - pts[-2])
        self.bone(f"{prefix}e", pts[-1], pts[-1] + d.normalized() * max(1e-3, d.length * 0.1), prev)
        return names

    def add(self, P, bind, power=4.0):
        """bind: a bone name (rigid) or a list of bone names (smooth proximity weights along that chain)"""
        self.parts.append((P, bind, power))
        return P

    # ------------------------------------------------------------------ finish: armature, skinning, export prep
    def finish(self, subdiv=1, ao=True, ao_dist=None, col=0, looks=None, tex=2048, extra=None, levels=2):
        arm_data = bpy.data.armatures.new(self.name)
        arm = bpy.data.objects.new(self.name, arm_data)
        bpy.context.scene.collection.objects.link(arm)
        for o in bpy.context.scene.objects:
            o.select_set(False)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        eb = {}
        for n in self.order:
            h, t, p = self.bones[n]
            e = arm_data.edit_bones.new(n)
            e.head, e.tail = h, t
            e.roll = 0.0
            eb[n] = e
        for n in self.order:
            p = self.bones[n][2]
            if p:
                eb[n].parent = eb[p]
                eb[n].use_connect = False
        bpy.ops.object.mode_set(mode="OBJECT")
        objs = []
        for P, bind, power in self.parts:
            ob = P.finish(sharp=70, col=col, weighted=False)
            # weld the pieces each primitive emitted separately (material halves, caps) and drop unused vertices
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            # one consistent outward orientation for every closed piece (teeth, claws, caps, plates included)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            bm.to_mesh(ob.data)
            bm.free()
            if subdiv:
                md = ob.modifiers.new("sub", "SUBSURF")
                md.levels = subdiv
                md.render_levels = subdiv
                from bl import apply_modifiers
                apply_modifiers(ob)
                for poly in ob.data.polygons:
                    poly.use_smooth = True
            if isinstance(bind, str):
                g = ob.vertex_groups.new(name=bind)
                g.add([v.index for v in ob.data.vertices], 1.0, "REPLACE")
            else:
                self._bind(ob, bind, power)
            objs.append(ob)
        if ao:
            size = max((self.bones[n][0] - self.bones[n][1]).length for n in self.order) * 4
            bake_ao(objs, local_dist=ao_dist or max(0.05, size * 0.15), sky_dist=max(1.0, size * 2))
        body = objs[0]
        if len(objs) > 1:
            with bpy.context.temp_override(active_object=body, selected_editable_objects=objs, selected_objects=objs, object=body):
                bpy.ops.object.join()
        body.name = self.name + "_body"
        props(body, part="body", col=0)
        if looks:
            from skin import bake as skin_bake
            skin_bake(body, looks, self.name, tex=tex, levels=levels, extra=extra)
        body.parent = arm
        md = body.modifiers.new("arm", "ARMATURE")
        md.object = arm
        return arm, body

    def _bind(self, ob, bones, power):
        segs = [(n, self.bones[n][0], self.bones[n][1]) for n in bones]
        groups = {n: ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n) for n in bones}
        for v in ob.data.vertices:
            ws = []
            for n, a, b in segs:
                ab = b - a
                t = max(0.0, min(1.0, (v.co - a).dot(ab) / max(1e-9, ab.length_squared)))
                d = (v.co - (a + ab * t)).length
                ws.append((n, 1.0 / (d + 0.02 * ab.length + 1e-4) ** power))
            ws.sort(key=lambda q: -q[1])
            ws = ws[:3]
            tot = sum(w for _, w in ws)
            for n, w in ws:
                if w / tot > 0.01:
                    groups[n].add([v.index], w / tot, "REPLACE")


# ====================================================================================== geometry
def body(P, spine, prof, mat_top, mat_bot=None, segs=20, n=None, cap0=True, cap1=True, tile=1.0, warp=None, up=UP):
    """Loft an organic body along `spine` (front to back).

    prof: [(t, (w, h_top, h_bot, e, dz))] keyed along the length t in 0..1: half-width, dorsal and ventral heights,
          superellipse exponent (2 = ellipse, <2 boxier is not used; >2 rounder squares), vertical offset.
    warp(i, k, pos, T, L, N) -> pos: optional per-vertex sculpting.
    Returns rings: rings[i][k] = Vector, plus frames, for attaching features.
    """
    n = n or max(12, len(spine) * 4)
    S = catmull(spine, n)
    F = frames(S, up)
    Q = interp(prof, n)
    verts, uvs, rings = [], [], []
    length = 0.0
    acc = [0.0]
    for i in range(1, n):
        length += (S[i] - S[i - 1]).length
        acc.append(length)
    for i in range(n):
        T, L, N = F[i]
        w, ht, hb, e, dz = Q[i]
        ring = []
        for k in range(segs + 1):
            a = TAU * k / segs
            c, s = math.cos(a), math.sin(a)
            ex = 2.0 / e
            x = w * math.copysign(abs(c) ** ex, c)
            y = (ht if s >= 0 else hb) * math.copysign(abs(s) ** ex, s)
            p = S[i] + L * x + N * (y + dz)
            if warp:
                p = warp(i / (n - 1), a, p, T, L, N)
            ring.append(p)
            verts.append(tuple(p))
            uvs.append((acc[i] / tile, (k / segs) * max(0.2, 2.2 * (w + (ht + hb) / 2)) / tile))
        rings.append(ring)
    W = segs + 1
    top, bot = [], []
    for i in range(n - 1):
        for k in range(segs):
            a, b = i * W + k, i * W + k + 1
            f = (a, a + W, b + W, b)
            ang = TAU * (k + 0.5) / segs
            (top if math.sin(ang) >= -0.15 or mat_bot is None else bot).append(f)
    P.mesh(verts, top, mat=mat_top, recalc=False, uvs=uvs, bevel=0)
    if bot:
        P.mesh(verts, bot, mat=mat_bot, recalc=False, uvs=uvs, bevel=0)
    # caps: fans to the end centres
    for idx, cap, flip in ((0, cap0, True), (n - 1, cap1, False)):
        if not cap:
            continue
        c = sum((rings[idx][k] for k in range(segs)), Vector()) / segs
        cv = [tuple(p) for p in rings[idx][:segs]] + [tuple(c)]
        fs = [((k + 1) % segs, k, segs) if flip else (k, (k + 1) % segs, segs) for k in range(segs)]
        P.mesh(cv, fs, mat=mat_top, recalc=False, bevel=0)
    return rings, F, S


def tube(P, pts, radii, mat, segs=10, n=None, cap0=True, cap1=True, flat=1.0, up=UP, tile=0.5, mat_under=None, warp=None):
    """tapered tube along a smooth curve; radii keyed [(t, r)]; flat < 1 squashes the section (paddle limbs)"""
    n = n or max(6, len(pts) * 4)
    S = catmull(pts, n)
    F = frames(S, up)
    R = [r[0] for r in interp([(t, (r,)) for t, r in radii], n)]
    verts, uvs = [], []
    acc = 0.0
    for i in range(n):
        if i:
            acc += (S[i] - S[i - 1]).length
        T, L, N = F[i]
        for k in range(segs + 1):
            a = TAU * k / segs
            p = S[i] + L * math.cos(a) * R[i] + N * math.sin(a) * R[i] * flat
            if warp:
                p = warp(i / (n - 1), a, p, T, L, N)
            verts.append(tuple(p))
            uvs.append((acc / tile, k / segs * TAU * max(R[i], 0.01) / tile))
    W = segs + 1
    top, und = [], []
    for i in range(n - 1):
        for k in range(segs):
            a, b = i * W + k, i * W + k + 1
            ang = TAU * (k + 0.5) / segs
            (und if mat_under and math.sin(ang) < -0.3 else top).append((a, a + W, b + W, b))
    P.mesh(verts, top, mat=mat, recalc=False, uvs=uvs, bevel=0)
    if und:
        P.mesh(verts, und, mat=mat_under, recalc=False, uvs=uvs, bevel=0)
    for idx, cap, flip in ((0, cap0, True), (n - 1, cap1, False)):
        if not cap:
            continue
        ring = [Vector(verts[idx * W + k]) for k in range(segs)]
        c = sum(ring, Vector()) / segs
        cv = [tuple(p) for p in ring] + [tuple(c)]
        fs = [((k + 1) % segs, k, segs) if flip else (k, (k + 1) % segs, segs) for k in range(segs)]
        P.mesh(cv, fs, mat=mat, recalc=False, bevel=0)
    return S, F


def sheet(P, root0, root1, tip0, tip1, mat, nu=8, nv=6, thick=0.02, camber=0.0, round_tip=0.6, normal=None, curl=0.0,
          edge=None, tile=1.0):
    """A fin / membrane: bilinear patch from the root edge (root0 leading, root1 trailing) to the tip edge, the outer
    end rounded (round_tip), cambered along the chord, curled along the span, with thickness tapering to the edges.
    edge(u, v) -> extra offset scalar along the normal (ruffles)."""
    r0, r1, t0, t1 = V(root0), V(root1), V(tip0), V(tip1)
    nrm = V(normal).normalized() if normal is not None else (r1 - r0).cross(t0 - r0).normalized()
    top, bot = [], []
    uvs_t, uvs_b = [], []
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u = i / nu
            a = r0.lerp(t0, v)
            b = r1.lerp(t1, v)
            # round the tip: the chord shrinks toward the tip
            shrink = 1.0 - round_tip * (v ** 3)
            mid = a.lerp(b, 0.5)
            p = mid + (a.lerp(b, u) - mid) * shrink
            off = camber * math.sin(math.pi * u) * (1 - v * 0.5) + curl * v * v
            if edge:
                off += edge(u, v)
            # tapering to the edges but never to nothing (coincident faces render as black specks)
            th = thick * (0.25 + 0.75 * (1 - v * 0.8) * math.sin(math.pi * min(max(u, 0.02), 0.98))) * 0.5
            p = p + nrm * off
            top.append(tuple(p + nrm * th))
            bot.append(tuple(p - nrm * th))
            uv = ((p - r0).dot((r1 - r0).normalized()) / tile, (p - r0).dot((t0 - r0).normalized()) / tile)
            uvs_t.append(uv)
            uvs_b.append(uv)
    W = nu + 1
    m = len(top)
    verts = top + bot
    uvs = uvs_t + uvs_b
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * W + i
            faces.append((a, a + 1, a + W + 1, a + W))
            faces.append((m + a, m + a + W, m + a + W + 1, m + a + 1))
    # close the outline
    for j in range(nv):
        for i in (0, nu):
            a, b = j * W + i, (j + 1) * W + i
            faces.append((a, b, m + b, m + a) if i == 0 else (b, a, m + a, m + b))
    for i in range(nu):
        a, b = nv * W + i, nv * W + i + 1
        faces.append((b, a, m + a, m + b))
        a, b = i, i + 1
        faces.append((a, b, m + b, m + a))
    P.mesh(verts, faces, mat=mat, recalc=True, uvs=uvs, bevel=0)
    return nrm


def plate(P, center, T, L, N, a, b, mat, rise=0.3, thick=0.03, nu=8, nv=6, lip=0.0, tilt=0.0, spikes=0, spike_h=0.0, sq=2.0, droop=0.0, spike_mat=None):
    """A curved armour plate: a dome patch a (along T) by b (along L), bulging `rise` along N, with a thickened
    leading lip; `tilt` lifts the trailing edge (overlapping shingles); optional spikes along the trailing rim."""
    c = V(center)
    T, L, N = V(T).normalized(), V(L).normalized(), V(N).normalized()
    outer, inner = [], []
    for j in range(nv + 1):
        v = j / nv * 2 - 1
        for i in range(nu + 1):
            u = i / nu * 2 - 1
            # outline: a superellipse (sq = 2 an ellipse, larger toward a band with rounded ends)
            k = max(0.0, 1 - min(1.0, abs(v) ** sq)) ** (1.0 / sq)
            uu = u * k
            h = rise * (1 - uu * uu) * (1 - 0.35 * v * v) + tilt * (v + 1) * 0.5 + lip * max(0.0, -v) ** 4 - droop * uu ** 4
            p = c + T * (-v * a) + L * (uu * b) + N * h
            outer.append(tuple(p + N * thick * 0.5))
            inner.append(tuple(p - N * thick * 0.5))
    W = nu + 1
    m = len(outer)
    verts = outer + inner
    faces = []
    for j in range(nv):
        for i in range(nu):
            q = j * W + i
            faces.append((q, q + W, q + W + 1, q + 1))
            faces.append((m + q, m + q + 1, m + q + W + 1, m + q + W))
    for j in range(nv):
        for i in (0, nu):
            q0, q1 = j * W + i, (j + 1) * W + i
            faces.append((q1, q0, m + q0, m + q1) if i == 0 else (q0, q1, m + q1, m + q0))
    for i in range(nu):
        q0, q1 = i, i + 1
        faces.append((q0, q1, m + q1, m + q0))
        q0, q1 = nv * W + i, nv * W + i + 1
        faces.append((q1, q0, m + q0, m + q1))
    P.mesh(verts, faces, mat=mat, recalc=True, bevel=0)
    if spikes:
        for s in range(spikes):
            u = (s + 0.5) / spikes * 2 - 1
            base = c + T * a * 0.95 + L * (u * b * 0.8) + N * (tilt + 0.02)
            cone(P, base, base + T * spike_h + N * spike_h * 0.6, spike_h * 0.25, spike_mat or mat)


def cone(P, base, tip, r, mat, segs=6, bend=None):
    """tooth / spike / claw: a cone from base to tip, optionally bent toward `bend` (a direction)"""
    b, t = V(base), V(tip)
    pts = [b, b.lerp(t, 0.5) + (V(bend) * (t - b).length * 0.25 if bend is not None else Vector()), t]
    tube(P, pts, [(0, r), (1, r * 0.04)], mat, segs=segs, n=5, cap0=True, cap1=False)


def eye(P, pos, r, mat="bio_eye", lid=None, lid_mat=None, toward=None):
    P.sphere(r, at=tuple(V(pos)), mat=mat, segs=12, rings=8)
    if lid and lid_mat and toward is not None:
        d = V(toward).normalized()
        P.sphere(r * 1.15, at=tuple(V(pos) - d * r * 0.25), mat=lid_mat, segs=12, rings=8, scale=(1, 1, 0.55))


def jitter(P, amp, freq=3.0, seed=0, axis_scale=(1, 1, 1)):
    """organic asymmetry: displace every vertex already in the part by low-frequency noise"""
    off = Vector((seed * 3.7, seed * 1.3, seed * 5.1))
    for v in P.bm.verts:
        q = v.co * freq + off
        d = noise.noise_vector(q) * amp
        v.co += Vector((d.x * axis_scale[0], d.y * axis_scale[1], d.z * axis_scale[2]))


def mirror_pts(pts):
    return [Vector((-p[0], p[1], p[2])) for p in pts]


def ringed(P, pts, r0, r1, mat, rings=6, segs=10, flat=1.0, n=None):
    """a segmented limb: a tapered tube whose radius swells at each segment"""
    tube(P, pts, [(0, r0), (1, r1)], mat, segs=segs, n=n or 14, flat=flat,
         warp=lambda t, a, p, T, L, N: p + (L * math.cos(a) + N * math.sin(a) * flat) * (r0 + (r1 - r0) * t) * 0.14 * math.cos(TAU * rings * t))


def claws(P, tip, direction, spread, n, length, r, mat="bio_tooth", down=(0, 0, -1)):
    d = V(direction).normalized()
    side = d.cross(Vector(down)).normalized()
    for i in range(n):
        o = (i - (n - 1) / 2) * spread
        base = V(tip) + side * o
        cone(P, base, base + d * length + Vector(down) * length * 0.6, r, mat, bend=Vector(down))


def review(name, bg=(0.05, 0.09, 0.12), front=(0.75, 0.9, 0.35), side=(1.0, -0.12, 0.18), res=(600, 420), samples=24, sun=3.0):
    """two preview renders (front three-quarter and side) of the whole scene, composed into one image
    blender/previews/rv_<name>.png; camera framed on the meshes' bounds"""
    import os
    from bl import preview, PREVIEW_DIR
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    c = (lo + hi) / 2
    r = (hi - lo).length / 2
    files = []
    head = Vector((c.x, hi.y - (hi.y - lo.y) * 0.12, c.z))
    for tag, d, tgt, k in (("a", front, c, 1.7), ("b", side, c, 1.55), ("c", (0.55, 1.0, 0.25), head, 0.62)):
        dv = Vector(d).normalized()
        eye = tgt + dv * r * k
        preview(f"_rv_{name}_{tag}", tuple(eye), tuple(tgt), res=res, lens=40, samples=samples, sky=bg, sky_strength=0.6, sun=sun)
        files.append(os.path.join(PREVIEW_DIR, f"_rv_{name}_{tag}.png"))
    try:
        from PIL import Image
        ims = [Image.open(f).convert("RGB") for f in files]
        W = Image.new("RGB", (res[0] * len(ims), res[1]))
        for i, im in enumerate(ims):
            W.paste(im, (res[0] * i, 0))
        W.save(os.path.join(PREVIEW_DIR, f"rv_{name}.png"))
        for f in files:
            os.remove(f)
    except Exception as e:
        print("review compose failed", e)


def surf(rings, t, a):
    """a point on a lofted body (rings from body()) at length fraction t and section angle a (0 = right side,
    pi/2 = top), and its outward normal"""
    n = len(rings)
    segs = len(rings[0]) - 1
    fi = max(0.0, min(n - 1.001, t * (n - 1)))
    i = int(fi)
    u = fi - i
    fk = (a % TAU) / TAU * segs
    k = int(fk) % segs
    w = fk - int(fk)
    def P(ii, kk):
        return rings[ii][kk % segs]
    p = (P(i, k) * (1 - w) + P(i, k + 1) * w) * (1 - u) + (P(i + 1, k) * (1 - w) + P(i + 1, k + 1) * w) * u
    ta = P(i + 1, k) - P(i, k)
    tb = P(i, k + 1) - P(i, k)
    nrm = tb.cross(ta)
    c = sum((rings[i][j] for j in range(segs)), Vector()) / segs
    if nrm.dot(p - c) < 0:
        nrm = -nrm
    return p, nrm.normalized()


def surface_line(P, rings, path, r, mat, lift=0.004, segs=5, n=24):
    """a tube lying on the body surface along [(t, a), ...] (glow lines, ridges, scars)"""
    pts = []
    for i in range(n):
        f = i / (n - 1) * (len(path) - 1)
        j = min(int(f), len(path) - 2)
        u = f - j
        t = path[j][0] * (1 - u) + path[j + 1][0] * u
        a = path[j][1] * (1 - u) + path[j + 1][1] * u
        p, nr = surf(rings, t, a)
        pts.append(p + nr * (lift + r * 0.5))
    tube(P, pts, [(0, r), (1, r)], mat, segs=segs, n=n)


def segmented_limb(P, pts, radii, mat, joint_mat=None, flare=0.25, spines=0, spine_mat=None, spine_len=0.3, segs=12):
    """an arthropod limb: one tapered tube per segment between joints, each segment flaring at its distal end
    (the chitin collar), a knuckle at every joint, optional spines along the upper edge"""
    pts = [V(p) for p in pts]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        r0, r1 = radii[i], radii[i + 1]
        d = b - a
        mid = a.lerp(b, 0.5) + (Vector((0, 0, 1)).cross(d).cross(d).normalized() * -d.length * 0.03 if d.length > 1e-6 else Vector())
        tube(P, [a + d * 0.02, mid, b - d * 0.04], [(0, r0 * 0.92), (0.5, (r0 + r1) * 0.5 * 0.88), (0.85, r1 * (1 + flare)), (1, r1 * (1 + flare * 0.6))],
             mat, segs=segs, n=10)
        if i > 0:
            P.sphere(r0 * 0.95, at=tuple(a), mat=joint_mat or mat, segs=segs, rings=max(6, segs // 2))
        for s in range(spines):
            f = (s + 1) / (spines + 1)
            q = a.lerp(b, f)
            up = Vector((0, 0, 1)) - d.normalized() * d.normalized().z
            if up.length < 1e-4:
                up = Vector((1, 0, 0))
            up.normalize()
            rr = r0 + (r1 - r0) * f
            cone(P, q + up * rr * 0.8, q + up * rr * (1 + spine_len * 3) + d.normalized() * rr * spine_len * 2, rr * 0.28, spine_mat or mat, segs=5)
