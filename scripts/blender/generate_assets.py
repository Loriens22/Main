#!/usr/bin/env python3
"""Happy birthday Matex — Blender asset generator.

Runs with the Blender-as-a-module wheel (bpy 5.2.3 LTS):
    /opt/bvenv/bin/python scripts/blender/generate_assets.py [phones props characters] [--preview DIR]

Writes GLB files into public/assets/models/.  Everything is procedural and
seeded, so re-running reproduces identical geometry.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import common  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models')
os.makedirs(OUT, exist_ok=True)

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
if PREVIEW:
    args = [a for a in args if a != PREVIEW]
targets = args or ['phones', 'props', 'characters']


def preview(name, objs, cam_loc, cam_target, lens=50, res=(960, 540), samples=24, world=(0.6, 0.6, 0.62)):
    """Quick Cycles CPU still for sanity checks of geometry (not used in the film)."""
    if not PREVIEW:
        return
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (*world, 1)
    cam_data = bpy.data.cameras.new('pcam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('pcam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = Vector(cam_loc)
    d = Vector(cam_target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for i, (loc, e) in enumerate([((3, -4, 5), 600), ((-4, -2, 3), 250), ((0, 5, 4), 300)]):
        ld = bpy.data.lights.new(f'pl{i}', 'AREA')
        ld.energy = e
        ld.size = 3
        lo = bpy.data.objects.new(f'pl{i}', ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(lo)
    sc.render.filepath = os.path.join(PREVIEW, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('preview', sc.render.filepath)


def do_phones():
    import phones
    common.reset()
    common.clear_mats()
    root = common.empty('Phones')
    phones.build_all(root)
    common.export_glb(os.path.join(OUT, 'phones.glb'), [root])
    if PREVIEW:
        # lay devices out in a row for a contact-sheet render
        for i, ch in enumerate(sorted(root.children, key=lambda o: o.name)):
            ch.location = (i * 1.6 - 7, 0, 0)
            for j, p in enumerate(c for c in ch.children if c.name.startswith(ch.name + '_P')):
                p.location = (j * 0.78 - 0.4, 0, 0)
                p.rotation_euler = (0, 0, math.pi)  # show backs
        preview('phones_back', [root], (0, -16, 2.2), (0, 0, 0), lens=60, res=(1600, 500))


if 'cakeprev' in targets:
    import props
    common.reset(); common.clear_mats()
    props.cake()
    b = bpy.data.objects['Cake_body']
    print('KEYS', [(k.name, k.value, k.mute) for k in b.data.shape_keys.key_blocks], b.active_shape_key_index, b.show_only_shape_key)
    preview('cake_close', [], (0.0, -0.5, 0.36), (0, 0, 0.1), lens=50, res=(800, 600), samples=16)
if 'phones' in targets:
    do_phones()
if 'props' in targets:
    import props
    common.reset(); common.clear_mats()
    props.build_and_export(OUT, preview)
if 'characters' in targets:
    import characters
    common.reset(); common.clear_mats()
    characters.build_and_export(OUT, preview)
print('done', targets)
