# Facade and roof kit for the buildings along the bus routes, modelled in Blender:
#   split-AC outdoor unit, satellite dish (head + wall mount), drainpipe set (pipe, clamp, hopper, shoe),
#   rooftop TV antenna, panel-block ventilation head, mushroom vent, lift machine room,
#   folding-arm shop awning (fabric + frame), entrance bulkhead lamp, brick chimney.
# Each piece is a detailed high-poly model (bevels, grilles, fins, slots, fabric folds, brick courses)
# baked onto a game low-poly: albedo, tangent-space normals, ambient occlusion (with the wall / roof it
# sits on as occluder), roughness and metalness -> one 1024 px atlas. Output: src/data/kit_facade.glb
#
#   python tools/blender/kit_facade.py [--preview DIR]      (Blender 5.x Python: the `bpy` module)
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import (W, reset, mat, mat_brick, box, obox, cyl, torus, tube, from_pydata, boolean, join, sharpen,
                    tri_count, Atlas, export_glb, apply_mods, drop_faces, triangulate)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'data', 'kit_facade.glb')

# ------------------------------------------------------------------ materials
def M():
    return dict(
        acWhite=mat('acWhite', (0.80, 0.80, 0.78), 0.42, 0.0, noise=0.05, nscale=30, grime=0.12),
        acDark=mat('acDark', (0.035, 0.037, 0.04), 0.6),
        grille=mat('grille', (0.11, 0.115, 0.12), 0.55),
        fins=mat('fins', (0.62, 0.64, 0.65), 0.45, 0.55),
        galv=mat('galv', (0.6, 0.62, 0.62), 0.6, 0.3, noise=0.18, nscale=90, bump=0.08),
        rubber=mat('rubber', (0.03, 0.03, 0.03), 0.85),
        insul=mat('insul', (0.74, 0.74, 0.72), 0.75, 0.0, noise=0.1, nscale=60, bump=0.15, bscale=300),
        cable=mat('cable', (0.02, 0.02, 0.02), 0.5),
        plastic=mat('plastic', (0.82, 0.82, 0.8), 0.5),
        silver=mat('silver', (0.75, 0.76, 0.77), 0.35, 0.6),
        dish=mat('dish', (0.74, 0.75, 0.76), 0.5, 0.25, noise=0.04, nscale=20),
        lnb=mat('lnb', (0.1, 0.1, 0.11), 0.5),
        concrete=mat('concrete', (0.55, 0.54, 0.51), 0.92, 0.0, noise=0.18, nscale=12, bump=0.25, bscale=180, grime=0.28),
        concreteDark=mat('concreteDark', (0.4, 0.39, 0.37), 0.95, 0.0, noise=0.2, nscale=12, bump=0.3, bscale=180),
        shaft=mat('shaft', (0.05, 0.05, 0.048), 0.95),
        bitumen=mat('bitumen', (0.05, 0.05, 0.05), 0.8, 0.0, noise=0.25, nscale=40, bump=0.3, bscale=200),
        doorSteel=mat('doorSteel', (0.32, 0.36, 0.38), 0.6, 0.3, noise=0.2, nscale=25, grime=0.2),
        rust=mat('rust', (0.32, 0.17, 0.08), 0.85, 0.2, noise=0.3, nscale=30),
        yellow=mat('yellow', (0.85, 0.65, 0.05), 0.5),
        fabric=mat('fabric', (0.88, 0.88, 0.86), 0.85, 0.0, noise=0.03, nscale=10, bump=0.12, bscale=900),
        alu=mat('alu', (0.74, 0.75, 0.76), 0.45, 0.45),
        anth=mat('anth', (0.17, 0.18, 0.19), 0.45, 0.4),
        glassFrost=mat('glassFrost', (0.9, 0.9, 0.86), 0.3),
        brick=mat_brick('brick', (0.42, 0.18, 0.11), (0.5, 0.24, 0.15), (0.6, 0.58, 0.54)),
    )


def wall_plane(w=6, h=6):
    """AO occluder: the wall (n = 0) the piece is fixed to."""
    return from_pydata('occ_wall', [(-w, -h, 0), (w, -h, 0), (w, h, 0), (-w, h, 0)], [(0, 3, 2, 1)])


def roof_plane(w=8):
    return from_pydata('occ_roof', [(-w, 0, -w), (w, 0, -w), (w, 0, w), (-w, 0, w)], [(0, 3, 2, 1)])


# ------------------------------------------------------------------ pieces
def ac_unit(m):
    """Split-system outdoor unit (~0.80 x 0.55 x 0.28 m) on two galvanised wall brackets."""
    hi = []
    body = box('ac_body', -0.40, 0.40, 0.02, 0.57, 0.10, 0.38, m['acWhite'], bev=0.012, segs=3)
    # fan opening: a circular recess in the front, louvred coil recess on the left side
    boolean(body, cyl('cut', (-0.12, 0.295, 0.355), (-0.12, 0.295, 0.42), 0.215, segs=64))
    boolean(body, box('cut2', -0.43, -0.392, 0.07, 0.52, 0.13, 0.35))
    boolean(body, box('cut3', -0.30, 0.38, 0.565, 0.6, 0.12, 0.36))  # shallow top panel recess
    hi.append(body)
    hi.append(box('ac_toppanel', -0.295, 0.375, 0.556, 0.567, 0.125, 0.355, m['acWhite'], bev=0.003))
    hi.append(cyl('ac_back', (-0.12, 0.295, 0.356), (-0.12, 0.295, 0.358), 0.214, m['acDark'], segs=48))
    # fan: hub and three swept blades
    hi.append(cyl('ac_hub', (-0.12, 0.295, 0.358), (-0.12, 0.295, 0.375), 0.045, m['grille'], segs=24, r1=0.03))
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.3
        ca, sa = math.cos(a), math.sin(a)
        c = (-0.12 + ca * 0.11, 0.295 + sa * 0.11, 0.366)
        hi.append(obox(f'ac_blade{k}', c, (ca, sa, 0.0), (-sa * 0.9, ca * 0.9, 0.42), (0, 0, 1), 0.085, 0.045, 0.003, m['grille'], bev=0.002, segs=1))
    # grille: concentric rings and spokes, slightly proud of the front
    for R in (0.05, 0.088, 0.126, 0.164, 0.2):
        hi.append(torus(f'ac_ring{R}', (-0.12, 0.295, 0.384), (0, 0, 1), R, 0.0038, m['grille'], segs=64, rsegs=6))
    for k in range(8):
        a = k * math.pi / 4
        c = (-0.12 + math.cos(a) * 0.11, 0.295 + math.sin(a) * 0.11, 0.384)
        hi.append(obox(f'ac_spoke{k}', c, (math.cos(a), math.sin(a), 0), (-math.sin(a), math.cos(a), 0), (0, 0, 1), 0.105, 0.004, 0.004, m['grille']))
    hi.append(torus('ac_ringO', (-0.12, 0.295, 0.381), (0, 0, 1), 0.214, 0.008, m['acWhite'], segs=64, rsegs=8))
    # aluminium coil fins in the left side recess
    for k in range(30):
        n = 0.135 + k * 0.0072
        hi.append(box(f'ac_fin{k}', -0.405, -0.394, 0.075, 0.515, n, n + 0.0016, m['fins']))
    for u in (0.17, 0.295, 0.42):
        hi.append(box(f'ac_finbar{u}', -0.408, -0.398, u - 0.004, u + 0.004, 0.13, 0.355, m['acWhite']))
    # badge and service-valve cover on the right
    hi.append(box('ac_badge', 0.19, 0.31, 0.075, 0.1, 0.38, 0.3825, m['silver'], bev=0.002, segs=1))
    hi.append(box('ac_cover', 0.398, 0.432, 0.05, 0.31, 0.2, 0.362, m['acWhite'], bev=0.008, segs=2))
    for u in (0.09, 0.27):
        hi.append(cyl(f'ac_screw{u}', (0.431, u, 0.28), (0.434, u, 0.28), 0.007, m['silver'], segs=12))
    # insulated line set and cable to the wall
    hi.append(tube('ac_pipeA', [(0.41, 0.07, 0.31), (0.44, -0.01, 0.27), (0.47, -0.1, 0.16), (0.49, -0.14, 0.05), (0.49, -0.145, -0.02)], 0.021, m['insul'], segs=12, res=8))
    hi.append(tube('ac_pipeB', [(0.41, 0.07, 0.25), (0.435, 0.0, 0.22), (0.455, -0.08, 0.13), (0.465, -0.12, 0.04), (0.465, -0.125, -0.02)], 0.016, m['insul'], segs=12, res=8))
    hi.append(tube('ac_cable', [(0.405, 0.12, 0.33), (0.44, 0.05, 0.31), (0.5, -0.09, 0.2), (0.52, -0.13, 0.06), (0.52, -0.135, -0.02)], 0.005, m['cable'], segs=8, res=8))
    hi.append(cyl('ac_wallcap', (0.48, -0.135, 0.0), (0.48, -0.135, 0.018), 0.055, m['plastic'], segs=24))
    # condensate hose
    hi.append(tube('ac_drain', [(-0.3, 0.025, 0.22), (-0.3, -0.04, 0.215), (-0.285, -0.22, 0.2), (-0.27, -0.4, 0.19)], 0.008, m['insul'], segs=8, res=6))
    # brackets: L angles on the wall and under the unit, diagonal braces, rubber pads, anchor bolts
    for tb in (-0.28, 0.28):
        hi.append(box(f'br_h{tb}', tb - 0.02, tb + 0.02, -0.004, 0.0, 0.0, 0.44, m['galv']))
        hi.append(box(f'br_hf{tb}', tb - 0.002, tb + 0.002, -0.04, 0.0, 0.0, 0.44, m['galv']))
        hi.append(box(f'br_v{tb}', tb - 0.02, tb + 0.02, -0.4, 0.0, 0.0, 0.004, m['galv']))
        hi.append(box(f'br_vf{tb}', tb - 0.002, tb + 0.002, -0.4, 0.0, 0.0, 0.04, m['galv']))
        d = Vector((0, 0.36, 0.37)).normalized()
        hi.append(obox(f'br_d{tb}', (tb, -0.2, 0.215), (1, 0, 0), (0, d.y, d.z), (0, -d.z, d.y), 0.0025, 0.26, 0.014, m['galv']))
        for n0 in (0.14, 0.31):
            hi.append(box(f'pad{tb}{n0}', tb - 0.025, tb + 0.025, 0.0, 0.02, n0, n0 + 0.055, m['rubber'], bev=0.004, segs=1))
        for u in (-0.08, -0.33):
            hi.append(cyl(f'bolt{tb}{u}', (tb, u, 0.004), (tb, u, 0.016), 0.009, m['galv'], segs=6, smooth=False))
    lo = [box('l_body', -0.40, 0.40, 0.02, 0.57, 0.10, 0.386), box('l_cover', 0.398, 0.432, 0.05, 0.31, 0.2, 0.362)]
    for tb in (-0.28, 0.28):
        lo.append(box(f'l_h{tb}', tb - 0.021, tb + 0.021, -0.041, 0.001, 0.0, 0.441))
        lo.append(box(f'l_v{tb}', tb - 0.021, tb + 0.021, -0.401, 0.0, 0.0, 0.041))
        d = Vector((0, 0.36, 0.37)).normalized()
        lo.append(obox(f'l_d{tb}', (tb, -0.2, 0.215), (1, 0, 0), (0, d.y, d.z), (0, -d.z, d.y), 0.004, 0.26, 0.016))
    lo.append(tube('l_pipeA', [(0.41, 0.07, 0.31), (0.44, -0.01, 0.27), (0.47, -0.1, 0.16), (0.49, -0.14, 0.05), (0.49, -0.145, -0.02)], 0.03, segs=4, res=2))
    lo.append(tube('l_pipeB', [(0.41, 0.07, 0.25), (0.435, 0.0, 0.22), (0.455, -0.08, 0.13), (0.465, -0.12, 0.04), (0.465, -0.125, -0.02)], 0.024, segs=4, res=2))
    lo.append(tube('l_drain', [(-0.3, 0.025, 0.22), (-0.3, -0.04, 0.215), (-0.285, -0.22, 0.2), (-0.27, -0.4, 0.19)], 0.013, segs=4, res=2))
    return hi, join(lo, 'ac'), wall_plane()


def dish_head(m):
    """Offset satellite dish (0.6 x 0.66 m reflector) with LNB arm; origin at the clamp on the mount's mast."""
    hi = []

    def reflector(name, rings, segs, thick):
        verts, faces = [], []
        for i in range(rings + 1):
            r = i / rings
            for k in range(segs):
                a = 2 * math.pi * k / segs
                x, y = 0.3 * r * math.cos(a), 0.33 * r * math.sin(a)
                verts.append((x, y + 0.02, 0.07 + 0.065 * r * r))
        for i in range(rings):
            for k in range(segs):
                a, b = i * segs + k, i * segs + (k + 1) % segs
                faces.append((a, b, b + segs, a + segs))
        o = from_pydata(name, verts, faces, m['dish'], smooth=True)
        md = o.modifiers.new('sol', 'SOLIDIFY')
        md.thickness = thick
        md.offset = -1
        apply_mods(o)
        return o

    hi.append(reflector('dish_refl', 14, 48, 0.004))
    rim = [(0.3 * math.cos(2 * math.pi * k / 48), 0.33 * math.sin(2 * math.pi * k / 48) + 0.02, 0.135) for k in range(49)]
    hi.append(tube('dish_rim', rim, 0.0045, m['dish'], segs=8, res=2))
    # back: reinforcing plate, clamp around the mast
    hi.append(box('dish_plate', -0.07, 0.07, -0.07, 0.11, 0.055, 0.075, m['galv'], bev=0.004))
    hi.append(box('dish_clamp', -0.035, 0.035, -0.06, 0.06, 0.0, 0.06, m['galv'], bev=0.004))
    hi.append(cyl('dish_bolt', (-0.045, 0.0, 0.03), (0.045, 0.0, 0.03), 0.007, m['galv'], segs=8))
    # LNB arm from the bottom of the rim to the focal point below and in front of the centre
    hi.append(tube('dish_arm', [(0.0, -0.3, 0.12), (0.0, -0.3, 0.2), (0.0, -0.26, 0.38), (0.0, -0.22, 0.47)], 0.011, m['galv'], segs=8, res=6))
    ax = Vector((0, 0.2, -0.4)).normalized()
    p = Vector((0, -0.2, 0.5))
    hi.append(cyl('lnb_body', tuple(p - ax * 0.05), tuple(p + ax * 0.05), 0.026, m['lnb'], segs=24))
    hi.append(cyl('lnb_horn', tuple(p + ax * 0.05), tuple(p + ax * 0.09), 0.026, m['lnb'], r1=0.036, segs=24))
    hi.append(box('lnb_box', -0.03, 0.03, -0.26, -0.2, 0.47, 0.54, m['lnb'], bev=0.006))
    hi.append(tube('lnb_cable', [(0.0, -0.25, 0.5), (0.02, -0.29, 0.42), (0.02, -0.31, 0.22), (0.02, -0.3, 0.1), (0.03, -0.12, 0.04)], 0.0035, m['cable'], segs=8, res=6))
    lo = [reflector('l_refl', 3, 16, 0.006),
          box('l_plate', -0.071, 0.071, -0.071, 0.111, 0.0, 0.076),
          tube('l_arm', [(0.0, -0.3, 0.12), (0.0, -0.3, 0.2), (0.0, -0.26, 0.38), (0.0, -0.22, 0.47)], 0.016, segs=4, res=2),
          cyl('l_lnb', tuple(p - ax * 0.06), tuple(p + ax * 0.095), 0.04, segs=6, smooth=False),
          box('l_lnbbox', -0.032, 0.032, -0.262, -0.198, 0.468, 0.542)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.45)  # the mount puts the head 0.45 m off the wall
    return hi, join(lo, 'dishHead'), occ


def dish_mount(m):
    hi = [box('dm_plate', -0.06, 0.06, -0.09, 0.09, 0.0, 0.008, m['galv'], bev=0.002, segs=1)]
    for t in (-0.04, 0.04):
        for u in (-0.065, 0.065):
            hi.append(cyl(f'dm_bolt{t}{u}', (t, u, 0.008), (t, u, 0.018), 0.008, m['galv'], segs=6, smooth=False))
    hi.append(cyl('dm_arm', (0, 0, 0.008), (0, 0, 0.45), 0.02, m['galv'], segs=16))
    hi.append(cyl('dm_mast', (0, -0.13, 0.45), (0, 0.13, 0.45), 0.021, m['galv'], segs=16))
    d = Vector((0, 0.1, -0.3)).normalized()
    hi.append(obox('dm_gusset', (0, -0.05, 0.16), (1, 0, 0), (0, d.y, d.z), (0, -d.z, d.y), 0.003, 0.16, 0.012, m['galv']))
    lo = [box('l_dmplate', -0.061, 0.061, -0.091, 0.091, 0.0, 0.01),
          cyl('l_dmarm', (0, 0, 0.0), (0, 0, 0.47), 0.024, segs=6, smooth=False),
          cyl('l_dmmast', (0, -0.135, 0.45), (0, 0.135, 0.45), 0.025, segs=6, smooth=False),
          obox('l_dmg', (0, -0.05, 0.16), (1, 0, 0), (0, d.y, d.z), (0, -d.z, d.y), 0.005, 0.16, 0.014)]
    return hi, join(lo, 'dishMount'), wall_plane()


def pipe(m):
    """2 m of galvanised downpipe (Ø 100 mm) with its socket joint at the top; axis at the origin."""
    hi = [cyl('p_body', (0, 0, 0), (0, 1.94, 0), 0.05, m['galv'], segs=32),
          cyl('p_sock', (0, 1.88, 0), (0, 2.0, 0), 0.054, m['galv'], segs=32),
          box('p_seam', -0.004, 0.004, 0.0, 1.94, -0.052, -0.046, m['galv'])]
    lo = [cyl('l_p', (0, 0, 0), (0, 2.0, 0), 0.056, segs=8)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.1)
    return hi, join(lo, 'pipe'), occ


def pipe_clamp(m):
    hi = [cyl('pc_band', (0, -0.016, 0), (0, 0.016, 0), 0.058, m['galv'], segs=32, caps=False),
          box('pc_ear', -0.012, 0.012, -0.016, 0.016, -0.085, -0.056, m['galv']),
          cyl('pc_pin', (0, 0, -0.1), (0, 0, -0.06), 0.008, m['galv'], segs=8),
          cyl('pc_bolt', (-0.02, 0, -0.072), (0.02, 0, -0.072), 0.005, m['galv'], segs=6)]
    md = hi[0].modifiers.new('sol', 'SOLIDIFY')
    md.thickness = 0.003
    apply_mods(hi[0])
    lo = [cyl('l_pc', (0, -0.017, 0), (0, 0.017, 0), 0.062, segs=8, smooth=True),
          box('l_pcear', -0.013, 0.013, -0.017, 0.017, -0.1, -0.055)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.1)
    return hi, join(lo, 'pipeClamp'), occ


def pipe_head(m):
    """Rainwater hopper under the roof outlet; u = 0 where the pipe starts."""
    def hopper(name, mm, grow=0.0):
        g = grow
        v = [(-0.12 - g, 0.3, -0.1 - g), (0.12 + g, 0.3, -0.1 - g), (0.12 + g, 0.3, 0.1 + g), (-0.12 - g, 0.3, 0.1 + g),
             (-0.055 - g, 0.06, -0.055 - g), (0.055 + g, 0.06, -0.055 - g), (0.055 + g, 0.06, 0.055 + g), (-0.055 - g, 0.06, 0.055 + g)]
        f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
        if g > 0:
            f.append((0, 3, 2, 1))
        return from_pydata(name, v, f, mm)
    h = hopper('ph_hop', m['galv'])
    md = h.modifiers.new('sol', 'SOLIDIFY')
    md.thickness = 0.003
    apply_mods(h)
    hi = [h, cyl('ph_neck', (0, -0.02, 0), (0, 0.07, 0), 0.05, m['galv'], segs=32),
          box('ph_lip', -0.125, 0.125, 0.29, 0.31, -0.105, 0.105, m['galv']),
          cyl('ph_spout', (0, 0.36, -0.1), (0, 0.36, 0.02), 0.04, m['galv'], segs=24)]
    lo = [hopper('l_hop', None, 0.004), cyl('l_neck', (0, -0.02, 0), (0, 0.07, 0), 0.054, segs=8),
          cyl('l_spout', (0, 0.36, -0.1), (0, 0.36, 0.025), 0.044, segs=6, smooth=False)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.1)
    return hi, join(lo, 'pipeHead'), occ


def pipe_shoe(m):
    """Bottom of the downpipe: 45° shoe kicking the water out over the pavement; u = 0 at the ground."""
    pts = [(0, 0.5, 0), (0, 0.25, 0), (0, 0.14, 0.03), (0, 0.06, 0.12), (0, 0.04, 0.16)]
    hi = [tube('ps_tube', pts, 0.05, m['galv'], segs=24, res=10, caps=True),
          cyl('ps_sock', (0, 0.42, 0), (0, 0.5, 0), 0.054, m['galv'], segs=32)]
    lo = [tube('l_ps', pts, 0.057, segs=8, res=3)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.1)
    return hi, join(lo, 'pipeShoe'), [occ, roof_plane()]


def antenna(m):
    """Rooftop TV mast with a UHF Yagi and a smaller second Yagi; origin at the foot."""
    hi, lo = [], []
    hi.append(box('an_base', -0.16, 0.16, 0.0, 0.012, -0.16, 0.16, m['galv'], bev=0.004))
    lo.append(box('l_anbase', -0.161, 0.161, 0.0, 0.014, -0.161, 0.161))
    for k in range(3):
        a = k * 2 * math.pi / 3
        f = (math.cos(a) * 0.14, 0.012, math.sin(a) * 0.14)
        hi.append(cyl(f'an_leg{k}', f, (0, 0.5, 0), 0.008, m['galv'], segs=8))
        lo.append(cyl(f'l_leg{k}', f, (0, 0.5, 0), 0.012, segs=4, smooth=False, caps=False))
    hi.append(cyl('an_mast', (0, 0, 0), (0, 2.6, 0), 0.02, m['galv'], segs=16))
    lo.append(cyl('l_mast', (0, 0, 0), (0, 2.62, 0), 0.025, segs=6, smooth=False))

    def yagi(u, L, n, rmin, rmax, yaw, tag):
        ca, sa = math.cos(yaw), math.sin(yaw)
        ax = lambda s: (sa * s, u, ca * s)          # boom direction (horizontal)
        cr = (ca, 0, -sa)                            # element direction
        hi.append(cyl(f'yb{tag}', ax(-L * 0.35), ax(L * 0.65), 0.009, m['galv'], segs=8))
        lo.append(cyl(f'lyb{tag}', ax(-L * 0.35), ax(L * 0.65), 0.013, segs=4, smooth=False))
        hi.append(box(f'yc{tag}', -0.03, 0.03, u - 0.04, u + 0.04, -0.03, 0.03, m['galv']))
        for i in range(n):
            s = -L * 0.35 + L * i / (n - 1)
            half = rmax if i == 0 else rmin + (rmax - rmin) * (1 - i / (n - 1)) * 0.6
            c = ax(s)
            p0 = tuple(c[j] - cr[j] * half for j in range(3))
            p1 = tuple(c[j] + cr[j] * half for j in range(3))
            hi.append(cyl(f'ye{tag}{i}', p0, p1, 0.004, m['alu'], segs=8))
            lo.append(cyl(f'lye{tag}{i}', p0, p1, 0.007, segs=4, smooth=False, caps=False))
        c = ax(-L * 0.2)
        hi.append(box(f'yd{tag}', c[0] - 0.04, c[0] + 0.04, u - 0.035, u - 0.005, c[2] - 0.03, c[2] + 0.03, m['lnb'], bev=0.005))
        lo.append(box(f'lyd{tag}', c[0] - 0.041, c[0] + 0.041, u - 0.036, u - 0.004, c[2] - 0.031, c[2] + 0.031))
    yagi(2.45, 1.4, 11, 0.12, 0.27, 0.0, 'a')
    yagi(1.95, 0.8, 6, 0.1, 0.22, 0.6, 'b')
    hi.append(tube('an_cable', [(0.02, 1.95, 0.0), (0.03, 1.2, 0.02), (0.03, 0.4, 0.02), (0.1, 0.02, 0.05)], 0.004, m['cable'], segs=8, res=6))
    return hi, join(lo, 'antenna'), roof_plane()


def vent(m):
    """Ventilation head of a panel-block shaft: precast box with slots under an overhanging cap."""
    body = box('v_body', -0.45, 0.45, 0.0, 0.95, -0.25, 0.25, m['concrete'], bev=0.01)
    for k in range(3):
        t = -0.3 + k * 0.3
        boolean(body, box(f'vs{k}', t - 0.09, t + 0.09, 0.62, 0.86, -0.4, 0.4))
    for n in (-0.12, 0.12):
        boolean(body, box(f'vsn{n}', -0.6, 0.6, 0.62, 0.86, n - 0.05, n + 0.05))
    inner = box('v_in', -0.4, 0.4, 0.55, 0.9, -0.2, 0.2, m['shaft'])
    hi = [body, inner, box('v_cap', -0.55, 0.55, 0.95, 1.05, -0.33, 0.33, m['concrete'], bev=0.012),
          box('v_bit', -0.47, 0.47, 0.0, 0.18, -0.27, 0.27, m['bitumen'], bev=0.01)]
    lo = [box('l_v', -0.47, 0.47, 0.0, 0.95, -0.27, 0.27), box('l_vc', -0.551, 0.551, 0.95, 1.051, -0.331, 0.331)]
    return hi, join(lo, 'vent'), roof_plane()


def mushroom(m):
    hi = [cyl('mu_pipe', (0, 0, 0), (0, 0.62, 0), 0.08, m['galv'], segs=32),
          cyl('mu_cap', (0, 0.66, 0), (0, 0.8, 0), 0.19, m['galv'], r1=0.02, segs=32),
          cyl('mu_flash', (0, 0, 0), (0, 0.08, 0), 0.16, m['bitumen'], r1=0.09, segs=32)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        hi.append(box(f'mu_s{k}', math.cos(a) * 0.07 - 0.005, math.cos(a) * 0.07 + 0.005, 0.6, 0.68, math.sin(a) * 0.07 - 0.005, math.sin(a) * 0.07 + 0.005, m['galv']))
    lo = [cyl('l_mp', (0, 0, 0), (0, 0.66, 0), 0.085, segs=8), cyl('l_mc', (0, 0.66, 0), (0, 0.81, 0), 0.195, r1=0.02, segs=8),
          cyl('l_mf', (0, 0, 0), (0, 0.085, 0), 0.165, r1=0.095, segs=8)]
    return hi, join(lo, 'mushroom'), roof_plane()


def liftroom(m):
    """Lift machine room on a panel-block roof (3.2 x 2.6 x 2.4 m) with steel door, louvre and step."""
    walls = box('lr_walls', -1.6, 1.6, 0.0, 2.4, -1.3, 1.3, m['concrete'], bev=0.015)
    # panel joints
    for t in (-0.53, 0.53):
        boolean(walls, box(f'lj{t}', t - 0.012, t + 0.012, -0.1, 2.5, -1.4, 1.4))
    boolean(walls, box('ljn', -1.7, 1.7, -0.1, 2.5, -0.012, 0.012))
    # door opening on +n, louvre opening on +t
    boolean(walls, box('ld', -0.45, 0.45, 0.25, 2.12, 1.22, 1.4))
    boolean(walls, box('ll', 1.5, 1.7, 1.55, 2.05, -0.45, 0.45))
    hi = [walls,
          box('lr_slab', -1.72, 1.72, 2.4, 2.6, -1.42, 1.42, m['concrete'], bev=0.02, segs=3),
          box('lr_drip', -1.7, 1.7, 2.37, 2.42, -1.4, 1.4, m['concreteDark']),
          box('lr_bit', -1.625, 1.625, 0.0, 0.3, -1.325, 1.325, m['bitumen'], bev=0.012),
          box('lr_bitTop', -1.73, 1.73, 2.6, 2.63, -1.43, 1.43, m['bitumen'], bev=0.01),
          # door: frame, leaf with a horizontal stiffener, handle, warning plate
          box('lr_frame', -0.45, 0.45, 0.25, 2.12, 1.22, 1.28, m['doorSteel']),
          box('lr_leaf', -0.41, 0.41, 0.27, 2.08, 1.24, 1.285, m['doorSteel'], bev=0.006),
          box('lr_stiff', -0.38, 0.38, 1.1, 1.16, 1.285, 1.295, m['doorSteel'], bev=0.003),
          cyl('lr_handle', (0.3, 1.15, 1.29), (0.3, 1.15, 1.34), 0.012, m['silver'], segs=12),
          box('lr_handleB', 0.22, 0.3, 1.14, 1.16, 1.33, 1.345, m['silver'], bev=0.004),
          box('lr_lock', 0.27, 0.33, 1.2, 1.3, 1.285, 1.292, m['silver']),
          box('lr_sign', -0.15, 0.15, 1.55, 1.8, 1.285, 1.29, m['yellow']),
          box('lr_rust', -0.41, 0.41, 0.27, 0.42, 1.2855, 1.2875, m['rust']),
          # louvre
          box('lr_lvframe', 1.52, 1.62, 1.55, 2.05, -0.45, 0.45, m['doorSteel'])]
    boolean(hi[-1], box('lvc', 1.4, 1.7, 1.58, 2.02, -0.42, 0.42))
    for k in range(7):
        u = 1.6 + k * 0.06
        hi.append(obox(f'lr_slat{k}', (1.58, u, 0.0), (0.6, -0.8, 0), (0.8, 0.6, 0), (0, 0, 1), 0.003, 0.035, 0.42, m['doorSteel']))
    hi.append(box('lr_step', -0.6, 0.6, 0.0, 0.18, 1.3, 1.75, m['concreteDark'], bev=0.01))
    lo = [box('l_lr', -1.625, 1.625, 0.0, 2.4, -1.325, 1.325), box('l_lrs', -1.73, 1.73, 2.37, 2.631, -1.431, 1.431),
          box('l_lrst', -0.601, 0.601, 0.0, 0.181, 1.325, 1.751)]
    return hi, join(lo, 'liftroom'), roof_plane()


def awning(m):
    """Folding-arm shop awning, 2 m wide x 1.2 m projection (the game scales it to the bay)."""
    def sheet(name, nt, ns, wrinkle, mm, thick):
        verts, faces = [], []
        for j in range(ns + 1):
            s = j / ns
            for i in range(nt + 1):
                t = -1.0 + 2.0 * i / nt
                sag = 0.035 * math.sin(math.pi * s) * (0.6 + 0.4 * math.cos(math.pi * t / 0.92) ** 2)
                w = wrinkle * (math.sin(s * 47 + t * 3.0) * 0.6 + math.sin(t * 23 + s * 9) * 0.4) * math.sin(math.pi * s)
                verts.append((t, -0.07 - s * 0.44 - sag + w, 0.13 + s * 1.04))
        for j in range(ns):
            for i in range(nt):
                a = j * (nt + 1) + i
                faces.append((a, a + nt + 1, a + nt + 2, a + 1))
        o = from_pydata(name, verts, faces, mm, smooth=True)
        if thick:
            md = o.modifiers.new('sol', 'SOLIDIFY')
            md.thickness = thick
            md.offset = 0
            apply_mods(o)
        return o

    def valance(name, nt, mm, thick, ny=12):
        verts, faces = [], []
        for j in range(ny + 1):
            for i in range(nt + 1):
                t = -1.0 + 2.0 * i / nt
                sc = abs(math.sin(math.pi * (t + 1.0) * 4.0))  # 8 scallops
                y = -0.52 - (0.17 + 0.05 * sc) * j / ny
                verts.append((t, y, 1.18 + 0.005 * math.sin(t * 31)))
        for j in range(ny):
            for i in range(nt):
                a = j * (nt + 1) + i
                faces.append((a, a + 1, a + nt + 2, a + nt + 1))
        o = from_pydata(name, verts, faces, mm, smooth=True)
        if thick:
            md = o.modifiers.new('sol', 'SOLIDIFY')
            md.thickness = thick
            md.offset = 0
            apply_mods(o)
        return o

    hi = [sheet('aw_fabric', 160, 60, 0.004, m['fabric'], 0.003), valance('aw_val', 256, m['fabric'], 0.003)]
    # hem and seams along the slope every 0.5 m
    for t in (-0.5, 0.0, 0.5):
        hi.append(tube(f'aw_seam{t}', [(t, -0.07, 0.13), (t, -0.29, 0.65), (t, -0.51, 1.17)], 0.0025, m['fabric'], segs=4, res=8))
    lo_top = sheet('l_awt', 6, 4, 0.0, None, 0)
    lo_bot = sheet('l_awb', 6, 4, 0.0, None, 0)
    lo_bot.data.flip_normals()
    lv_f = valance('l_awvf', 32, None, 0, ny=1)
    lv_b = valance('l_awvb', 32, None, 0, ny=1)
    lv_b.data.flip_normals()
    return hi, join([lo_top, lo_bot, lv_f, lv_b], 'awning'), wall_plane()


def awning_frame(m):
    hi = [box('af_cass', -1.03, 1.03, -0.16, 0.0, 0.0, 0.17, m['alu'], bev=0.03, segs=3),
          box('af_capL', -1.06, -1.03, -0.165, 0.005, -0.0, 0.175, m['anth'], bev=0.01),
          box('af_capR', 1.03, 1.06, -0.165, 0.005, -0.0, 0.175, m['anth'], bev=0.01),
          box('af_bar', -1.02, 1.02, -0.56, -0.49, 1.14, 1.2, m['alu'], bev=0.012)]
    lo = [box('l_cass', -1.061, 1.061, -0.166, 0.006, 0.0, 0.176), box('l_bar', -1.021, 1.021, -0.561, -0.489, 1.139, 1.201)]
    for tt in (-0.9, 0.9):
        sg = 1 if tt > 0 else -1
        hi.append(box(f'af_sh{tt}', tt - 0.04, tt + 0.04, -0.52, -0.38, 0.0, 0.06, m['anth'], bev=0.008))
        lo.append(box(f'l_sh{tt}', tt - 0.041, tt + 0.041, -0.521, -0.379, 0.0, 0.061))
        a, e, b = Vector((tt, -0.45, 0.06)), Vector((tt - sg * 0.07, -0.49, 0.6)), Vector((tt, -0.52, 1.14))
        for k, (p, q) in enumerate(((a, e), (e, b))):
            d = (q - p)
            c = (p + q) / 2
            z = d.normalized()
            x = Vector((1, 0, 0)).cross(z).normalized() if abs(z.x) < 0.9 else Vector((0, 1, 0))
            y = z.cross(x)
            hi.append(obox(f'af_arm{tt}{k}', tuple(c), tuple(x), tuple(y), tuple(z), 0.018, 0.012, d.length / 2, m['alu'], bev=0.005))
            lo.append(obox(f'l_arm{tt}{k}', tuple(c), tuple(x), tuple(y), tuple(z), 0.02, 0.014, d.length / 2 + 0.01))
        hi.append(cyl(f'af_elb{tt}', tuple(e - Vector((0.03, 0, 0))), tuple(e + Vector((0.03, 0, 0))), 0.028, m['anth'], segs=16))
        lo.append(cyl(f'l_elb{tt}', tuple(e - Vector((0.031, 0, 0))), tuple(e + Vector((0.031, 0, 0))), 0.031, segs=6, smooth=False))
    return hi, join(lo, 'awningFrame'), wall_plane()


def lamp(m):
    hi = [box('lp_base', -0.13, 0.13, -0.08, 0.08, 0.0, 0.035, m['anth'], bev=0.012, segs=3)]
    lo = [box('l_lpb', -0.131, 0.131, -0.081, 0.081, 0.0, 0.036)]
    return hi, join(lo, 'lamp'), wall_plane()


def lamp_glass(m):
    verts, faces = [], []
    R, S = 8, 24
    for i in range(R + 1):
        ph = (math.pi / 2) * i / R
        for k in range(S):
            a = 2 * math.pi * k / S
            verts.append((0.105 * math.cos(ph) * math.cos(a), 0.06 * math.cos(ph) * math.sin(a), 0.035 + 0.055 * math.sin(ph)))
    for i in range(R):
        for k in range(S):
            a, b = i * S + k, i * S + (k + 1) % S
            faces.append((a, b, b + S, a + S))
    hi = [from_pydata('lg_dome', verts, faces, m['glassFrost'], smooth=True)]
    for k in (-0.035, 0.0, 0.035):
        hi.append(cyl(f'lg_bar{k}', (k, -0.07, 0.085), (k, 0.07, 0.085), 0.004, m['anth'], segs=8))
    lv, lf = [], []
    for i in range(3):
        ph = (math.pi / 2) * i / 2
        for k in range(10):
            a = 2 * math.pi * k / 10
            lv.append((0.108 * math.cos(ph) * math.cos(a), 0.063 * math.cos(ph) * math.sin(a), 0.035 + 0.058 * math.sin(ph) + 0.004))
    for i in range(2):
        for k in range(10):
            a, b = i * 10 + k, i * 10 + (k + 1) % 10
            lf.append((a, b, b + 10, a + 10))
    lo = from_pydata('lampGlass', lv, lf, None, smooth=True)
    return hi, lo, wall_plane()


def chimney(m):
    hi = [box('ch_body', -0.27, 0.27, 0.0, 1.6, -0.27, 0.27, m['brick'], bev=0.006),
          box('ch_cap', -0.33, 0.33, 1.6, 1.68, -0.33, 0.33, m['concrete'], bev=0.012),
          box('ch_top', -0.12, 0.12, 1.68, 1.86, -0.12, 0.12, m['concreteDark'], bev=0.008),
          box('ch_hat', -0.2, 0.2, 1.86, 1.9, -0.2, 0.2, m['galv'], bev=0.004)]
    lo = [box('l_chb', -0.271, 0.271, 0.0, 1.6, -0.271, 0.271), box('l_chc', -0.331, 0.331, 1.6, 1.681, -0.331, 0.331),
          box('l_cht', -0.201, 0.201, 1.68, 1.901, -0.201, 0.201)]
    return hi, join(lo, 'chimney'), roof_plane()


# name -> (builder, atlas cell (x, y, w, h) px in a 1024 atlas, smoothing angle for the low-poly,
#          mounting: faces against the wall / roof are never seen and are dropped from the low-poly)
PIECES = {
    'liftroom': (liftroom, (0, 0, 512, 512), 35, 'roof'),
    'ac': (ac_unit, (512, 0, 256, 256), 35, 'wall'),
    'dishHead': (dish_head, (768, 0, 256, 256), 50, None),
    'awning': (awning, (512, 256, 256, 256), 60, None),
    'vent': (vent, (768, 256, 256, 256), 35, 'roof'),
    'chimney': (chimney, (0, 512, 256, 256), 35, 'roof'),
    'pipe': (pipe, (256, 512, 128, 256), 60, None),
    'pipeClamp': (pipe_clamp, (384, 512, 128, 128), 60, None),
    'pipeHead': (pipe_head, (384, 640, 128, 128), 40, None),
    'pipeShoe': (pipe_shoe, (512, 512, 128, 128), 60, None),
    'dishMount': (dish_mount, (640, 512, 128, 128), 40, 'wall'),
    'awningFrame': (awning_frame, (768, 512, 256, 128), 35, 'wall'),
    'mushroom': (mushroom, (768, 640, 128, 128), 50, 'roof'),
    'antenna': (antenna, (512, 640, 256, 128), 40, 'roof'),
    'lamp': (lamp, (896, 640, 64, 64), 35, 'wall'),
    'lampGlass': (lamp_glass, (960, 640, 64, 64), 70, 'wall'),
}
AGAINST = {
    'wall': lambda c, n: n[2] < -0.9 and c[2] < 0.12,
    'roof': lambda c, n: n[1] < -0.9 and c[1] < 0.01,
}


def main():
    preview = None
    if '--preview' in sys.argv:
        preview = sys.argv[sys.argv.index('--preview') + 1]
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1].split(',')
    reset()
    mats = M()
    atlas = Atlas(1024, 'kit')
    los = []
    for name, (fn, cell, ang, mount) in PIECES.items():
        if only and name not in only:
            continue
        hi, lo, occ = fn(mats)
        occ = occ if isinstance(occ, list) else [occ]
        if mount:
            drop_faces(lo, AGAINST[mount])
        sharpen(lo, ang)
        triangulate(lo)
        atlas.unwrap(lo, cell)
        atlas.bake(lo, hi, cell, extrusion=0.03 if name in ('liftroom', 'vent') else 0.015, ray=0.14 if name == 'vent' else 0.08 if name in ('liftroom', 'ac') else 0.05)
        print(f'{name}: high {sum(tri_count(o) for o in hi)} tris -> low {tri_count(lo)} tris', flush=True)
        for o in hi + occ:
            bpy.data.objects.remove(o)
        lo.hide_render = True  # every piece is modelled at the origin: keep it out of the next pieces' bakes
        los.append(lo)
    out_dir = preview or os.path.join(ROOT, 'tools', 'blender', 'out')
    os.makedirs(out_dir, exist_ok=True)
    atlas.finish(out_dir)
    km = atlas.export_material('kit')
    for lo in los:
        lo.hide_render = False
        lo.data.materials.clear()
        lo.data.materials.append(km)
        lo.location = (0, 0, 0)
    export_glb(los, OUT if not preview else os.path.join(preview, 'kit_facade.glb'))
    print('wrote', OUT if not preview else preview)


if __name__ == '__main__':
    main()
