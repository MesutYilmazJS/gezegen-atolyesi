"""Keşif sondası: gövde, güneş panelleri, çanak anten ve antenler. Çıktı: public/models/probe.glb

Yakınlaştırınca ayrıntılar görünsün diye panellerde hücre çizgileri ve gövdede altın folyo var.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 3.0
    return mat


def add(obj_op, mat, **kw):
    obj_op(**kw)
    obj = bpy.context.active_object
    obj.data.materials.append(mat)
    return obj


common.reset_scene()
gold = material('altin_folyo', (0.83, 0.62, 0.18), metallic=1.0, roughness=0.35)
silver = material('gumus', (0.8, 0.8, 0.82), metallic=1.0, roughness=0.25)
panel = material('panel', (0.05, 0.08, 0.28), metallic=0.4, roughness=0.3)
frame = material('cerceve', (0.65, 0.65, 0.68), metallic=0.8, roughness=0.4)
white = material('beyaz', (0.92, 0.92, 0.9), roughness=0.6)
light = material('isik', (0.2, 1.0, 0.4), emission=(0.2, 1.0, 0.4))

parts = []

# Gövde: sekizgen prizma
parts.append(add(bpy.ops.mesh.primitive_cylinder_add, gold, vertices=8, radius=0.5, depth=0.9))
bpy.ops.object.shade_flat()
# Üst ve alt kapaklar
for z in (0.47, -0.47):
    parts.append(add(bpy.ops.mesh.primitive_cylinder_add, silver, vertices=8, radius=0.52, depth=0.05, location=(0, 0, z)))

# Güneş panelleri: hücreli ızgara
for side in (-1, 1):
    # Kol
    parts.append(add(bpy.ops.mesh.primitive_cylinder_add, frame, radius=0.04, depth=0.6, location=(side * 0.75, 0, 0), rotation=(0, math.pi / 2, 0)))
    for i in range(3):
        for j in range(2):
            x = side * (1.15 + i * 0.52)
            y = -0.27 + j * 0.54
            cell = add(bpy.ops.mesh.primitive_cube_add, panel, size=1, location=(x, y, 0))
            cell.scale = (0.24, 0.25, 0.012)
            parts.append(cell)
    border = add(bpy.ops.mesh.primitive_cube_add, frame, size=1, location=(side * 1.67, 0, 0))
    border.scale = (0.8, 0.55, 0.008)
    parts.append(border)

# Çanak anten
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.55, location=(0, 0, 0.95))
dish = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for v in dish.data.vertices:
    v.select = v.co.z > 0.18
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')
dish.scale = (1, 1, 0.45)
dish.data.materials.append(white)
bpy.ops.object.shade_smooth()
parts.append(dish)
parts.append(add(bpy.ops.mesh.primitive_cylinder_add, silver, radius=0.03, depth=0.45, location=(0, 0, 1.05)))
parts.append(add(bpy.ops.mesh.primitive_uv_sphere_add, silver, radius=0.06, location=(0, 0, 1.28)))

# Antenler ve sensör kolu
parts.append(add(bpy.ops.mesh.primitive_cylinder_add, frame, radius=0.015, depth=1.4, location=(0.25, 0.3, -0.9), rotation=(0.3, 0.2, 0)))
parts.append(add(bpy.ops.mesh.primitive_cylinder_add, frame, radius=0.02, depth=0.9, location=(0, -0.7, -0.2), rotation=(math.pi / 2, 0, 0)))
parts.append(add(bpy.ops.mesh.primitive_cube_add, silver, size=0.18, location=(0, -1.15, -0.2)))
# Durum ışığı
parts.append(add(bpy.ops.mesh.primitive_uv_sphere_add, light, radius=0.04, location=(0.3, 0.42, 0.3)))

# Hepsini tek nesnede birleştir
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
probe = bpy.context.active_object
probe.name = 'probe'
# Çanak gezegene baksın (-Z yönü three.js'te lookAt ile hizalanır)
probe.rotation_euler = (math.pi, 0, 0)
bpy.ops.object.transform_apply(rotation=True)
common.export_glb(probe, 'probe.glb')
