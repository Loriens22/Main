"""Cycles studio rendering: procedural studio world, softbox area lights, camera rigs."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from . import core as K


def studio_world(top=(0.22, 0.25, 0.32), bottom=(0.005, 0.006, 0.01), strength=1.0, accent=(0.10, 0.22, 0.55)):
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*bottom, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (*top, 1)
    e = ramp.color_ramp.elements.new(0.55)
    e.color = (*accent, 1)
    maprange = nt.nodes.new("ShaderNodeMapRange")
    maprange.inputs["From Min"].default_value = -1
    maprange.inputs["From Max"].default_value = 1
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])  # world: Generated = view direction
    nt.links.new(sep.outputs["Z"], maprange.inputs["Value"])
    nt.links.new(maprange.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


def area_light(name, loc, target, size, power, color=(1, 1, 1), shape="RECTANGLE", size_y=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = power
    ld.color = color
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ob = bpy.data.objects.new(name, ld)
    K.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens=50, dof_dist=None, fstop=4.0, sensor=36):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start = 0.001
    cd.clip_end = 1000
    if dof_dist:
        cd.dof.use_dof = True
        cd.dof.focus_distance = dof_dist
        cd.dof.aperture_fstop = fstop
    ob = bpy.data.objects.new("Cam", cd)
    K.link(ob)
    ob.location = loc
    look_at(ob, target)
    bpy.context.scene.camera = ob
    return ob


def floor(size=40, z=0.0, mat=None):
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    bmesh.ops.translate(bm, vec=(0, 0, z), verts=bm.verts)
    me = bpy.data.meshes.new("floor")
    bm.to_mesh(me)
    if mat:
        me.materials.append(mat)
    ob = bpy.data.objects.new("floor", me)
    return K.link(ob)


def render(path, res=(1600, 1000), samples=128, exposure=0.0, look="AgX - Medium High Contrast"):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    sc.cycles.max_bounces = 8
    sc.cycles.glossy_bounces = 6
    sc.cycles.transparent_max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = look
    except TypeError:
        pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"
    sc.render.threads_mode = "AUTO"
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return path
