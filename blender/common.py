"""Blender betikleri için ortak yardımcılar.

Tüm modeller kodla üretilir; böylece `npm run blender` ile yeniden oluşturulabilir.
"""
import os
import random

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS_DIR = os.path.join(ROOT, 'public', 'models')
ICONS_DIR = os.path.join(ROOT, 'public', 'icons')


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_rock(name, seed, scale=(1.0, 0.8, 0.7), subdiv=4, roughness=0.35, craters=0.12, color=(0.35, 0.32, 0.29)):
    """Patates şeklinde, kraterli bir kaya gövdesi üretir (düşük poligon)."""
    rnd = random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1.0)
    obj = bpy.context.active_object
    obj.name = name

    # Büyük ölçekli şekil bozulması
    tex = bpy.data.textures.new(f'{name}_shape', type='CLOUDS')
    tex.noise_scale = 0.9
    tex.noise_depth = 2
    mod = obj.modifiers.new('shape', 'DISPLACE')
    mod.texture = tex
    mod.strength = roughness
    mod.mid_level = 0.5
    tex.noise_basis = 'ORIGINAL_PERLIN'
    obj.modifiers['shape'].texture_coords = 'LOCAL'

    # Krater benzeri çukurlar (Voronoi)
    vor = bpy.data.textures.new(f'{name}_craters', type='VORONOI')
    vor.noise_scale = 0.35
    vor.distance_metric = 'DISTANCE'
    vor.weight_1 = 1.0
    mod2 = obj.modifiers.new('craters', 'DISPLACE')
    mod2.texture = vor
    mod2.strength = craters
    mod2.mid_level = 0.6
    mod2.texture_coords = 'LOCAL'

    # Tohuma göre dokuları kaydır
    obj.location = (0, 0, 0)
    for m in (mod, mod2):
        m.texture_coords = 'OBJECT'
    empty = bpy.data.objects.new(f'{name}_offset', None)
    bpy.context.collection.objects.link(empty)
    empty.location = (rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50))
    mod.texture_coords_object = empty
    mod2.texture_coords_object = empty

    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(scale=True)
    bpy.data.objects.remove(empty)
    bpy.ops.object.shade_smooth()

    mat = bpy.data.materials.new(f'{name}_mat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.95
    obj.data.materials.append(mat)
    return obj


def export_glb(obj, filename):
    os.makedirs(MODELS_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(MODELS_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_yup=True,
    )
    print('Dışa aktarıldı:', path)
