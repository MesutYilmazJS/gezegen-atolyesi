"""Rozet ikonları: 3B render edilmiş madalyalar. Çıktı: public/badges/<rozet>.png (256×256, saydam arka plan)"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

OUT = os.path.join(common.ROOT, 'public', 'badges')
os.makedirs(OUT, exist_ok=True)

METALS = {
    'gold': (0.95, 0.72, 0.25),
    'silver': (0.82, 0.84, 0.88),
    'bronze': (0.8, 0.48, 0.25),
}


def mat(name, color, metallic=0.0, roughness=0.4, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if emission:
        b.inputs['Emission Color'].default_value = (*color, 1)
        b.inputs['Emission Strength'].default_value = emission
    return m


def setup_scene():
    common.reset_scene()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.device = 'CPU'
    scene.render.film_transparent = True
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.27, 0.32, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    bpy.ops.object.light_add(type='AREA', location=(2.5, -3, 4))
    key = bpy.context.active_object
    key.data.energy = 600
    key.data.size = 3
    key.rotation_euler = (math.radians(40), math.radians(20), math.radians(35))
    bpy.ops.object.light_add(type='POINT', location=(-3, -2, 1))
    bpy.context.active_object.data.energy = 150
    bpy.ops.object.camera_add(location=(0, -5.2, 0.5), rotation=(math.radians(84), 0, 0))
    cam = bpy.context.active_object
    cam.data.lens = 70
    scene.camera = cam


def medal(metal):
    m = mat('metal', METALS[metal], metallic=1.0, roughness=0.25)
    # Disk
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=0.16, rotation=(math.pi / 2, 0, 0))
    disk = bpy.context.active_object
    bev = disk.modifiers.new('bevel', 'BEVEL')
    bev.width = 0.04
    bev.segments = 4
    disk.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    # Kenar halkası
    bpy.ops.mesh.primitive_torus_add(major_radius=0.98, minor_radius=0.06, major_segments=96, minor_segments=16, rotation=(math.pi / 2, 0, 0), location=(0, -0.06, 0))
    rim = bpy.context.active_object
    rim.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    # İç zemin (emaye)
    enamel = mat('emaye', (0.05, 0.08, 0.2), roughness=0.15)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.8, depth=0.02, rotation=(math.pi / 2, 0, 0), location=(0, -0.085, 0))
    bpy.context.active_object.data.materials.append(enamel)


def sphere(r, loc, color, metallic=0.0, emission=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r, location=loc)
    o = bpy.context.active_object
    o.data.materials.append(mat('s', color, metallic=metallic, roughness=0.35, emission=emission))
    bpy.ops.object.shade_smooth()
    return o


def ring(major, minor, loc, color, tilt=70):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=12, location=loc, rotation=(math.radians(tilt), math.radians(-20), 0))
    o = bpy.context.active_object
    o.data.materials.append(mat('r', color, metallic=0.6, roughness=0.3))
    bpy.ops.object.shade_smooth()
    return o


def box(size, loc, color, emission=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    o.data.materials.append(mat('b', color, metallic=0.3, roughness=0.4, emission=emission))
    return o


def star(loc, color, r_out=0.5, r_in=0.22, depth=0.1):
    import bmesh

    me = bpy.data.meshes.new('star')
    bm = bmesh.new()
    verts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        verts.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y -= depth
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('star', me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.data.materials.append(mat('st', color, metallic=0.5, roughness=0.3))
    return o


Y = -0.2  # amblemler diskin önünde

BADGES = {
    'firstLife': ('bronze', lambda: [sphere(0.16, (x, Y, z), (0.3, 0.9, 0.45), emission=0.4) for x, z in [(-0.2, 0.1), (0.15, 0.2), (0.0, -0.18), (0.28, -0.12), (-0.3, -0.25)]]),
    'ringLord': ('gold', lambda: [sphere(0.34, (0, Y, 0), (0.85, 0.7, 0.45)), ring(0.6, 0.05, (0, Y, 0), (0.95, 0.88, 0.7))]),
    'survivor': ('silver', lambda: [star((0, Y, 0), (0.9, 0.25, 0.15))]),
    'twoSuns': ('gold', lambda: [sphere(0.26, (-0.22, Y, 0.12), (1.0, 0.55, 0.15), emission=2.0), sphere(0.18, (0.3, Y, -0.15), (1.0, 0.85, 0.4), emission=2.0)]),
    'civilization': ('gold', lambda: [box((0.16, 0.12, h), (x, Y, h / 2 - 0.35), (0.9, 0.8, 0.5), emission=0.6) for x, h in [(-0.32, 0.4), (-0.1, 0.7), (0.12, 0.55), (0.33, 0.35)]]),
    'oceanWorld': ('silver', lambda: [sphere(0.42, (0, Y, 0), (0.1, 0.4, 0.9))]),
    'collector': ('bronze', lambda: [sphere(0.18, (x, Y, z), c) for (x, z), c in zip([(-0.28, 0.0), (0.0, 0.0), (0.28, 0.0)], [(0.8, 0.4, 0.2), (0.2, 0.6, 0.9), (0.4, 0.8, 0.4)])]),
    'explorer': ('silver', lambda: [
        sphere(0.3, (-0.1, Y, -0.1), (0.75, 0.35, 0.2)),
        box((0.08, 0.08, 0.5), (0.3, Y, 0.25), (0.9, 0.9, 0.95)),
        sphere(0.06, (0.3, Y, 0.53), (1, 0.3, 0.2), emission=1.5),
    ]),
}

for name, (metal, emblem) in BADGES.items():
    setup_scene()
    medal(metal)
    emblem()
    bpy.context.scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('Rozet:', name)
