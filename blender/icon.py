"""Uygulama simgesi: halkalı bir gezegen. Çıktı: public/icons/icon-{512,192,180}.png ve maskable-512.png"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.reset_scene()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.device = 'CPU'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'

# Arka plan: koyu uzay mavisi
world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.008, 0.012, 0.035, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

# Gezegen
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0)
planet = bpy.context.active_object
bpy.ops.object.shade_smooth()
mat = bpy.data.materials.new('planet')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 2.2
noise.inputs['Detail'].default_value = 8.0
ramp = nt.nodes.new('ShaderNodeValToRGB')
els = ramp.color_ramp.elements
els[0].position = 0.48
els[0].color = (0.02, 0.10, 0.35, 1)
els[1].position = 0.52
els[1].color = (0.10, 0.35, 0.12, 1)
mid = els.new(0.62)
mid.color = (0.45, 0.33, 0.18, 1)
top = els.new(0.72)
top.color = (0.9, 0.9, 0.92, 1)
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.6
planet.data.materials.append(mat)

# Atmosfer halesi
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.06)
atmo = bpy.context.active_object
bpy.ops.object.shade_smooth()
amat = bpy.data.materials.new('atmo')
amat.use_nodes = True
ant = amat.node_tree
for n in list(ant.nodes):
    ant.nodes.remove(n)
out = ant.nodes.new('ShaderNodeOutputMaterial')
lw = ant.nodes.new('ShaderNodeLayerWeight')
lw.inputs['Blend'].default_value = 0.25
em = ant.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.3, 0.6, 1.0, 1)
em.inputs['Strength'].default_value = 3.0
tr = ant.nodes.new('ShaderNodeBsdfTransparent')
mix = ant.nodes.new('ShaderNodeMixShader')
ant.links.new(lw.outputs['Facing'], mix.inputs['Fac'])
ant.links.new(tr.outputs[0], mix.inputs[1])
ant.links.new(em.outputs[0], mix.inputs[2])
ant.links.new(mix.outputs[0], out.inputs['Surface'])
atmo.data.materials.append(amat)

# Halka: iç ve dış yarıçapı olan düz bir halka (annulus)
import bmesh  # noqa: E402

ring_mesh = bpy.data.meshes.new('ring')
bm = bmesh.new()
segs = 160
inner, outer = 1.45, 2.15
verts_in = [bm.verts.new((inner * math.cos(2 * math.pi * i / segs), inner * math.sin(2 * math.pi * i / segs), 0)) for i in range(segs)]
verts_out = [bm.verts.new((outer * math.cos(2 * math.pi * i / segs), outer * math.sin(2 * math.pi * i / segs), 0)) for i in range(segs)]
for i in range(segs):
    j = (i + 1) % segs
    bm.faces.new((verts_in[i], verts_out[i], verts_out[j], verts_in[j]))
bm.to_mesh(ring_mesh)
bm.free()
ring = bpy.data.objects.new('ring', ring_mesh)
bpy.context.collection.objects.link(ring)
# Kameraya neredeyse yandan bakan, hafif eğik halka
ring.rotation_euler = (math.radians(14), math.radians(-22), 0)
rmat = bpy.data.materials.new('ring')
rmat.use_nodes = True
rb = rmat.node_tree.nodes['Principled BSDF']
rb.inputs['Base Color'].default_value = (0.85, 0.72, 0.5, 1)
rb.inputs['Alpha'].default_value = 0.92
rb.inputs['Roughness'].default_value = 0.8
ring.data.materials.append(rmat)

# Yıldız ışığı
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), math.radians(-40), math.radians(-30)))
sun = bpy.context.active_object
sun.data.energy = 5.0
sun.data.color = (1.0, 0.95, 0.85)

# Kamera
bpy.ops.object.camera_add(location=(0, -7.6, 0.9), rotation=(math.radians(83.2), 0, 0))
cam = bpy.context.active_object
scene.camera = cam

os.makedirs(common.ICONS_DIR, exist_ok=True)


def render(size, filename, zoom=1.0):
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    cam.data.lens = 46 * zoom
    scene.render.filepath = os.path.join(common.ICONS_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print('Simge:', scene.render.filepath)


render(512, 'icon-512.png')
render(192, 'icon-192.png')
render(180, 'apple-touch-icon.png')
# Maskable: güvenli alan için biraz uzaklaştır
render(512, 'maskable-512.png', zoom=0.78)
