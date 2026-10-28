# Facade and roof kit for the buildings along the bus routes, modelled in Blender:
#   split-AC outdoor unit, satellite dish (head + wall mount), drainpipe set (pipe, clamp, hopper, shoe),
#   rooftop TV antenna, panel-block ventilation head, mushroom vent, lift machine room,
#   folding-arm shop awning (fabric + frame), entrance bulkhead lamp, brick chimney,
#   ground-floor window grille, roller-shutter housing and closed shutter, two balcony drying racks with
#   washing, geranium window box, gas regulator cabinet and yellow gas pipe.
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
        steelPaint=mat('steelPaint', (0.82, 0.82, 0.8), 0.5, 0.2, noise=0.08, nscale=40),
        shutterAlu=mat('shutterAlu', (0.68, 0.69, 0.7), 0.45, 0.4, noise=0.1, nscale=12, grime=0.25),
        terracotta=mat('terracotta', (0.55, 0.24, 0.13), 0.8, 0.0, noise=0.12, nscale=30),
        soil=mat('soil', (0.12, 0.08, 0.05), 0.95),
        gasYellow=mat('gasYellow', (0.85, 0.62, 0.06), 0.5, 0.1, noise=0.1, nscale=20, grime=0.18),
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


def window_grille(m):
    """Welded window bars of a ground-floor flat (1.2 x 1.4 m, scaled to the window): frame, six bars,
    a band and the half-sun over the top that is everywhere on Sofia's ground floors. Origin: bottom centre."""
    W_, H_, n0, n1 = 0.6, 1.4, 0.035, 0.05
    hi, lo = [], []

    def bar(name, p0, p1, r, flat=False):
        hi.append(cyl(name, p0, p1, r, m['steelPaint'], segs=4 if not flat else 4, smooth=False))
        lo.append(cyl('l' + name, p0, p1, r * 1.25, segs=4, smooth=False, caps=False))
    nc = (n0 + n1) / 2
    for t in (-W_, W_):
        bar(f'g_side{t}', (t, 0, nc), (t, H_, nc), 0.012)
    for u in (0.0, H_):
        bar(f'g_rail{u}', (-W_ - 0.012, u, nc), (W_ + 0.012, u, nc), 0.012)
    for k in range(1, 6):
        t = -W_ + 2 * W_ * k / 6
        bar(f'g_v{k}', (t, 0, nc), (t, H_ * 0.78, nc), 0.008)
    bar('g_band', (-W_, H_ * 0.32, nc), (W_, H_ * 0.32, nc), 0.009)
    bar('g_band2', (-W_, H_ * 0.78, nc), (W_, H_ * 0.78, nc), 0.009)
    # half sun: arc and rays
    R = W_ * 0.85
    arc = [(R * math.cos(math.pi * k / 12), H_ * 0.78 + R * 0.36 * math.sin(math.pi * k / 12), nc) for k in range(13)]
    hi.append(tube('g_arc', arc, 0.008, m['steelPaint'], segs=8, res=3))
    lo.append(tube('l_arc', arc[::2], 0.011, segs=4, res=1, caps=False))
    for k in range(1, 6):
        a = math.pi * k / 6
        p1 = (R * math.cos(a), H_ * 0.78 + R * 0.36 * math.sin(a), nc)
        bar(f'g_ray{k}', (0, H_ * 0.78, nc), p1, 0.007)
    hi.append(cyl('g_hub', (0, H_ * 0.78, n0), (0, H_ * 0.78, n1 + 0.005), 0.05, m['steelPaint'], segs=16))
    for t in (-W_, W_):
        for u in (0.05, H_ - 0.05):
            hi.append(cyl(f'g_anc{t}{u}', (t, u, 0.0), (t, u, n0), 0.01, m['steelPaint'], segs=6))
    return hi, join(lo, 'windowGrille'), wall_plane()


def shutter_box(m):
    """Roller-shutter housing over a shopfront (1 m wide, the game scales it) with the two guide rails
    (2 m, scaled to the opening). Origin: centre of the top of the opening."""
    hi = []
    prof = box('sb_box', -0.5, 0.5, 0.0, 0.24, 0.0, 0.2, m['shutterAlu'], bev=0.06, segs=4)
    hi.append(prof)
    for t in (-0.505, 0.505):
        hi.append(box(f'sb_cap{t}', t - 0.006, t + 0.006, 0.0, 0.245, 0.0, 0.205, m['shutterAlu'], bev=0.004))
    for t in (-0.47, 0.47):
        hi.append(box(f'sb_rail{t}', t - 0.025, t + 0.025, -2.0, 0.0, 0.0, 0.05, m['shutterAlu'], bev=0.004))
        hi.append(box(f'sb_slot{t}', t - 0.008, t + 0.008, -2.0, 0.0, 0.045, 0.052, m['acDark']))
    lo = [box('l_sb', -0.511, 0.511, 0.0, 0.246, 0.0, 0.206)]
    for t in (-0.47, 0.47):
        lo.append(box(f'l_sbr{t}', t - 0.026, t + 0.026, -2.0, 0.0, 0.0, 0.053))
    return hi, join(lo, 'shutterBox'), wall_plane()


def shutter_panel(m):
    """A closed roller shutter: 1 x 1 m of 55 mm aluminium slats with a bottom bar (scaled to the opening)."""
    verts, faces = [], []
    ns, nt = 18, 2
    for j in range(ns * 4 + 1):
        u = -1.0 + 0.95 * j / (ns * 4)
        k = j % 4
        n = 0.03 + (0.008 if k in (1, 2) else 0.0)
        for i in range(nt + 1):
            verts.append((-0.47 + 0.94 * i / nt, u, n))
    for j in range(ns * 4):
        for i in range(nt):
            a = j * (nt + 1) + i
            faces.append((a, a + 1, a + nt + 2, a + nt + 1))
    hi = [from_pydata('sp_slats', verts, faces, m['shutterAlu'], smooth=False),
          box('sp_bar', -0.47, 0.47, -1.0, -0.94, 0.02, 0.055, m['shutterAlu'], bev=0.006),
          box('sp_lock', -0.04, 0.04, -0.995, -0.955, 0.055, 0.06, m['silver'])]
    lo = [box('l_sp', -0.47, 0.47, -1.0, 0.0, 0.028, 0.056)]
    return hi, join(lo, 'shutterPanel'), wall_plane()


def clothes(m, variant):
    """Drying rack hooked over a balcony parapet (1.8 m, five wires) with the washing on it."""
    import random
    rnd = random.Random(7 + variant)
    hi, lo = [], []
    for t in (-0.88, 0.88):
        hi.append(box(f'cr_hook{t}', t - 0.012, t + 0.012, -0.12, 0.03, -0.06, 0.0, m['galv']))
        hi.append(box(f'cr_arm{t}', t - 0.012, t + 0.012, 0.0, 0.03, -0.06, 0.56, m['galv']))
        lo.append(box(f'l_cra{t}', t - 0.015, t + 0.015, -0.121, 0.032, -0.061, 0.562))
    for k in range(5):
        n = 0.11 + k * 0.11
        hi.append(cyl(f'cr_w{k}', (-0.88, 0.03, n), (0.88, 0.03, n), 0.0025, m['insul'], segs=6))
        lo.append(cyl(f'l_crw{k}', (-0.88, 0.03, n), (0.88, 0.03, n), 0.005, segs=3, smooth=False, caps=False))
    cols = [(0.75, 0.12, 0.12), (0.12, 0.25, 0.6), (0.9, 0.9, 0.88), (0.85, 0.7, 0.2), (0.25, 0.55, 0.3), (0.85, 0.45, 0.6),
            (0.2, 0.2, 0.22), (0.5, 0.65, 0.85), (0.92, 0.92, 0.95), (0.6, 0.35, 0.2)]
    k = 0
    for wi in range(5):
        n = 0.11 + wi * 0.11
        t = -0.82
        while t < 0.78:
            kind = rnd.random()
            if kind < 0.3:
                w, h = 0.45 + rnd.random() * 0.25, 0.55 + rnd.random() * 0.25   # towel / sheet
            elif kind < 0.6:
                w, h = 0.5, 0.65                                                 # shirt
            elif kind < 0.8:
                w, h = 0.36, 0.85                                                # trousers
            else:
                w, h = 0.12, 0.22                                                # socks
            if t + w > 0.84:
                break
            if rnd.random() < 0.35 and wi % 2:
                t += w * 0.7
                continue
            col = cols[rnd.randrange(len(cols))]
            name = f'cl{variant}_{k}'
            mm = mat(f'cloth_{col}', col, 0.9, 0.0, noise=0.08, nscale=30, bump=0.1, bscale=500)
            # drape: hung over the wire, folded both sides; ripples across
            verts, faces = [], []
            NT, NU = 8, 6
            for side in (-1, 1):
                for j in range(NU + 1):
                    for i in range(NT + 1):
                        tt = t + w * i / NT
                        uu = 0.03 - h * 0.5 * j / NU
                        nn = n + side * (0.004 + 0.012 * j / NU) + 0.008 * math.sin(i * 1.7 + k) * j / NU
                        verts.append((tt, uu, nn))
            base = (NT + 1) * (NU + 1)
            for j in range(NU):
                for i in range(NT):
                    a = j * (NT + 1) + i
                    faces.append((a, a + 1, a + NT + 2, a + NT + 1))
                    b = base + a
                    faces.append((b, b + NT + 1, b + NT + 2, b + 1))
            o = from_pydata(name, verts, faces, mm, smooth=True)
            if kind >= 0.3 and kind < 0.6:
                # shirt sleeves
                for sx in (t - 0.1, t + w):
                    hi.append(box(f'{name}s{sx}', sx, sx + 0.1, -0.2, 0.03, n - 0.012, n + 0.012, mm))
            hi.append(o)
            # low: a thin slab per garment, both faces
            lo.append(box(f'l_{name}', t, t + w, 0.03 - h * 0.5 - 0.005, 0.035, n - 0.02, n + 0.02))
            k += 1
            t += w + 0.03 + rnd.random() * 0.05
    return hi, join(lo, f'clothes{"AB"[variant]}'), wall_plane()


def flower_box(m):
    """Window box with geraniums hooked on a parapet or sill (0.85 m): a dense mound of leaves on a dark core
    with red and pink flower heads on top."""
    import random
    rnd = random.Random(11)
    hi = [box('fb_box', -0.42, 0.42, -0.18, 0.0, 0.02, 0.22, m['terracotta'], bev=0.012),
          box('fb_rim', -0.43, 0.43, -0.015, 0.0, 0.01, 0.23, m['terracotta'], bev=0.006)]
    for t in (-0.3, 0.3):
        hi.append(box(f'fb_hook{t}', t - 0.012, t + 0.012, -0.02, 0.04, -0.05, 0.03, m['galv']))
    leaf = mat('leaf', (0.1, 0.26, 0.07), 0.6, 0.0, noise=0.25, nscale=25)
    leaf2 = mat('leaf2', (0.17, 0.36, 0.1), 0.6, 0.0, noise=0.25, nscale=25)
    core = mat('leafCore', (0.04, 0.1, 0.03), 0.8)
    red = mat('geranium', (0.78, 0.05, 0.06), 0.55, 0.0, noise=0.15, nscale=40)
    pink = mat('geraniumP', (0.88, 0.32, 0.5), 0.55, 0.0, noise=0.15, nscale=40)

    def mound(name, grow, nt, na, mm):
        verts, faces = [], []
        for i in range(nt + 1):
            t = -0.41 + 0.82 * i / nt
            end = max(0.25, 1 - (abs(t) / 0.43) ** 6)
            for j in range(na + 1):
                ang = math.pi * j / na
                verts.append((t, -0.01 + (0.2 * end + grow) * math.sin(ang), 0.12 - (0.1 + grow) * math.cos(ang)))
        for i in range(nt):
            for j in range(na):
                q = i * (na + 1) + j
                faces.append((q, q + na + 1, q + na + 2, q + 1))
        return from_pydata(name, verts, faces, mm, smooth=True)

    hi.append(mound('fb_core', 0.0, 24, 12, core))
    for k in range(260):
        t = -0.4 + 0.8 * rnd.random()
        ang = math.pi * (0.08 + 0.84 * rnd.random())
        end = max(0.25, 1 - (abs(t) / 0.43) ** 6)
        c = Vector((t, -0.01 + 0.2 * end * math.sin(ang), 0.12 - 0.1 * math.cos(ang)))
        nrm = Vector((rnd.uniform(-0.3, 0.3), math.sin(ang), -math.cos(ang))).normalized()
        p0 = c + nrm * rnd.uniform(0.0, 0.025)
        r = 0.032 + rnd.random() * 0.022
        hi.append(cyl(f'fb_l{k}', tuple(p0), tuple(p0 + nrm * 0.004), r, leaf if k % 3 else leaf2, segs=7))
    for k in range(40):
        t = -0.37 + 0.74 * rnd.random()
        ang = math.pi * (0.22 + 0.56 * rnd.random())
        end = max(0.25, 1 - (abs(t) / 0.43) ** 6)
        c = Vector((t, -0.01 + 0.2 * end * math.sin(ang) + 0.03, 0.12 - 0.1 * math.cos(ang)))
        mm = red if variant_red(k) else pink
        for q in range(6):
            o = Vector((rnd.uniform(-0.025, 0.025), rnd.uniform(0.0, 0.02), rnd.uniform(-0.025, 0.025)))
            hi.append(cyl(f'fb_f{k}{q}', tuple(c + o), tuple(c + o + Vector((0, 0.024, 0))), 0.021, mm, segs=6, r1=0.008))
    lo = [box('l_fb', -0.431, 0.431, -0.181, 0.0, -0.051, 0.231), mound('l_fbh', 0.035, 6, 5, None)]
    return hi, join(lo, 'flowerBox'), wall_plane()


def variant_red(k):
    return k % 4 != 3


def gas_box(m):
    """Gas regulator cabinet at a block entrance (0.55 x 0.65 x 0.3 m), Overgas yellow, with louvres."""
    hi = [box('gb_body', -0.275, 0.275, 0.0, 0.65, 0.0, 0.3, m['gasYellow'], bev=0.01),
          box('gb_door', -0.25, 0.25, 0.03, 0.62, 0.3, 0.31, m['gasYellow'], bev=0.004),
          box('gb_roof', -0.29, 0.29, 0.65, 0.68, -0.0, 0.33, m['gasYellow'], bev=0.006),
          cyl('gb_lock', (0.2, 0.33, 0.31), (0.2, 0.33, 0.32), 0.012, m['silver'], segs=12),
          box('gb_plate', -0.12, 0.12, 0.45, 0.53, 0.31, 0.313, m['plastic']),
          cyl('gb_in', (0.0, -0.3, 0.12), (0.0, 0.0, 0.12), 0.024, m['gasYellow'], segs=12),
          cyl('gb_out', (0.0, 0.68, 0.12), (0.0, 0.95, 0.12), 0.024, m['gasYellow'], segs=12)]
    for k in range(5):
        u = 0.1 + k * 0.025
        hi.append(box(f'gb_lv{k}', -0.15, 0.15, u, u + 0.008, 0.31, 0.318, m['acDark']))
    lo = [box('l_gb', -0.276, 0.276, 0.0, 0.651, 0.0, 0.311), box('l_gbr', -0.291, 0.291, 0.65, 0.681, 0.0, 0.331),
          cyl('l_gbi', (0.0, -0.3, 0.12), (0.0, 0.0, 0.12), 0.028, segs=6, smooth=False),
          cyl('l_gbo', (0.0, 0.68, 0.12), (0.0, 0.95, 0.12), 0.028, segs=6, smooth=False)]
    return hi, join(lo, 'gasBox'), wall_plane()


def gas_pipe(m):
    """2 m of yellow steel gas pipe (Ø 48 mm) along a wall, axis 0.08 m off it, with a clamp."""
    hi = [cyl('gp_p', (-1.0, 0, 0), (1.0, 0, 0), 0.024, m['gasYellow'], segs=24),
          cyl('gp_j', (0.94, 0, 0), (1.0, 0, 0), 0.027, m['gasYellow'], segs=24),
          cyl('gp_c', (-0.015, 0, 0), (0.015, 0, 0), 0.029, m['galv'], segs=24),
          box('gp_b', -0.012, 0.012, -0.01, 0.01, -0.08, -0.025, m['galv'])]
    lo = [cyl('l_gp', (-1.0, 0, 0), (1.0, 0, 0), 0.03, segs=6), box('l_gpb', -0.013, 0.013, -0.011, 0.011, -0.081, -0.024)]
    occ = wall_plane()
    occ.location = W(0, 0, -0.08)
    return hi, join(lo, 'gasPipe'), occ


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
    'clothesA': (lambda m: clothes(m, 0), (0, 768, 256, 256), 50, None),
    'clothesB': (lambda m: clothes(m, 1), (256, 768, 256, 256), 50, None),
    'flowerBox': (flower_box, (512, 768, 256, 128), 60, 'wall'),
    'windowGrille': (window_grille, (512, 896, 128, 128), 40, None),
    'shutterBox': (shutter_box, (640, 896, 128, 128), 40, 'wall'),
    'shutterPanel': (shutter_panel, (768, 768, 128, 128), 40, 'wall'),
    'gasBox': (gas_box, (768, 896, 128, 128), 40, 'wall'),
    'gasPipe': (gas_pipe, (896, 768, 128, 128), 60, None),
}
# how deep under the low-poly the bake looks for the high-poly (m)
RAY = {'vent': 0.14, 'liftroom': 0.08, 'ac': 0.08, 'flowerBox': 0.1}
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
        atlas.bake(lo, hi, cell, extrusion=0.03 if name in ('liftroom', 'vent') else 0.015, ray=RAY.get(name, 0.05))
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
