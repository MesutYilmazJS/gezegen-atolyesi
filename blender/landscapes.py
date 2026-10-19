"""Yüzey manzaraları: çöl, buzul, okyanus kıyısı, volkanik ova, orman.
Çıktı: public/models/land_<biyom>.glb

Her sahnedeki nesneler adlandırılır (ground, rocks, plants, trunks, water, lava, ice); oyun bunları
gezegenin renklerine göre yeniden boyar. Gökyüzü, güneşler, halkalar ve aylar kodla eklenir.
Gözlemci (kamera) orijinde durur ve +Y yönüne bakar.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

SIZE = 80.0
RES = 90


def mat(name, color, roughness=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = roughness
    return m


def terrain(name, height_fn, color):
    """Izgara arazi; yükseklik fonksiyonu (x, y) → z. Gri tonlu köşe renkleri gölge/ayrıntı verir."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = []
    step = SIZE / RES
    for j in range(RES + 1):
        row = []
        for i in range(RES + 1):
            x = -SIZE / 2 + i * step
            y = -SIZE / 4 + j * step  # gözlemcinin önü daha geniş
            row.append(bm.verts.new((x, y, height_fn(x, y))))
        verts.append(row)
    for j in range(RES):
        for i in range(RES):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    # Köşe rengi: yüksekliğe ve gürültüye göre açık-koyu
    col = bm.loops.layers.color.new('Col')
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            n = noise.noise(Vector((v.x * 0.15, v.y * 0.15, 3.1)))
            k = max(0.55, min(1.0, 0.82 + n * 0.25 + v.z * 0.01))
            loop[col] = (k, k, k, 1.0)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat(name + '_mat', color))
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def fbm(x, y, scale, octaves=4, seed=0.0):
    return noise.fractal(Vector((x * scale + seed, y * scale + seed * 1.7, seed)), 0.5, 2.0, octaves)


def flat_near_origin(h, x, y, radius=9.0):
    """Gözlemcinin durduğu yer düz kalsın"""
    d = math.sqrt(x * x + y * y)
    k = min(1.0, d / radius)
    return h * k * k


def rock(loc, size, rnd):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size, location=loc)
    o = bpy.context.active_object
    for v in o.data.vertices:
        v.co *= 0.75 + rnd.random() * 0.5
    o.scale = (1 + rnd.random() * 0.6, 1 + rnd.random() * 0.6, 0.6 + rnd.random() * 0.4)
    o.rotation_euler = (rnd.random(), rnd.random(), rnd.random() * 6)
    return o


def join(objs, name, color, roughness=0.9):
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(mat(name + '_mat', color, roughness))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def plane(name, z, color, size=SIZE, roughness=0.1, y0=SIZE / 4):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, y0, z))
    o = bpy.context.active_object
    o.scale = (size, size, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.name = name
    o.data.materials.append(mat(name + '_mat', color, roughness))
    return o


def scatter(count, rnd, min_r, max_r, ground_fn, make):
    out = []
    for _ in range(count):
        r = min_r + rnd.random() * (max_r - min_r)
        a = math.radians(rnd.uniform(-75, 75)) + math.pi / 2  # çoğunlukla önde
        x, y = math.cos(a) * r, math.sin(a) * r
        out.append(make((x, y, ground_fn(x, y)), rnd))
    return out


def tree(loc, rnd, kind='pine'):
    x, y, z = loc
    s = 0.7 + rnd.random() * 0.8
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.12 * s, depth=1.2 * s, location=(x, y, z + 0.6 * s))
    trunk = bpy.context.active_object
    leaves = []
    if kind == 'pine':
        for i in range(3):
            bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=(0.9 - i * 0.22) * s, depth=1.1 * s, location=(x, y, z + (1.4 + i * 0.6) * s))
            leaves.append(bpy.context.active_object)
    else:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.9 * s, location=(x, y, z + 1.8 * s))
        leaves.append(bpy.context.active_object)
    return trunk, leaves


def build(name, height_fn, ground_color, extras):
    common.reset_scene()
    ground = terrain('ground', height_fn, ground_color)
    objs = [ground] + [o for o in extras(height_fn) if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(common.MODELS_DIR, f'land_{name}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_yup=True,
    )
    print('Manzara:', path)


# --- Çöl: kum tepeleri ve kayalar ---
def desert_h(x, y):
    dunes = math.sin(x * 0.18 + fbm(x, y, 0.05) * 3) * 1.2 + fbm(x, y, 0.04, 3) * 3
    return flat_near_origin(dunes, x, y)


def desert_extras(hf):
    rnd = random.Random(1)
    rocks = scatter(26, rnd, 6, 36, hf, lambda p, r: rock(p, 0.5 + r.random() * 1.6, r))
    # Dev kaya kuleleri (mesa)
    for x, y, s in [(-18, 30, 4), (22, 34, 5)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=9, radius=s, depth=s * 2.5, location=(x, y, hf(x, y) + s))
        rocks.append(bpy.context.active_object)
    plants = []
    trunks = []
    for _ in range(10):  # kaktüs benzeri sütunlar
        a = math.radians(rnd.uniform(-60, 60)) + math.pi / 2
        r = rnd.uniform(5, 25)
        x, y = math.cos(a) * r, math.sin(a) * r
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.25, depth=2.2, location=(x, y, hf(x, y) + 1.1))
        plants.append(bpy.context.active_object)
    return [join(rocks, 'rocks', (0.6, 0.45, 0.32)), join(plants, 'plants', (0.3, 0.45, 0.2)), join(trunks, 'trunks', (0.3, 0.2, 0.1))]


# --- Buzul: buz düzlükleri ve buz sivri uçları ---
def ice_h(x, y):
    return flat_near_origin(fbm(x, y, 0.035, 4) * 4 + max(0, fbm(x, y, 0.02, 2, 5)) * 8, x, y)


def ice_extras(hf):
    rnd = random.Random(2)
    spikes = []
    for _ in range(40):
        a = math.radians(rnd.uniform(-80, 80)) + math.pi / 2
        r = rnd.uniform(5, 38)
        x, y = math.cos(a) * r, math.sin(a) * r
        s = 0.5 + rnd.random() * 1.5
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s * 0.5, depth=s * 3, location=(x, y, hf(x, y) + s * 1.3), rotation=(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
        spikes.append(bpy.context.active_object)
    rocks = scatter(10, rnd, 8, 30, hf, lambda p, r: rock(p, 0.6 + r.random(), r))
    return [join(spikes, 'ice', (0.8, 0.9, 1.0), 0.15), join(rocks, 'rocks', (0.35, 0.36, 0.4))]


# --- Okyanus kıyısı: kumsal, kayalıklar ve deniz ---
def shore_h(x, y):
    base = -0.06 * (y - 4) + fbm(x, y, 0.06, 3) * 1.2
    return flat_near_origin(base, x, y, 3) + (0.4 if y < 3 else 0)


def shore_extras(hf):
    rnd = random.Random(3)
    rocks = scatter(18, rnd, 5, 20, hf, lambda p, r: rock(p, 0.4 + r.random() * 1.2, r))
    trunks, plants = [], []
    for _ in range(6):
        x, y = rnd.uniform(-14, 14), rnd.uniform(-6, 2)
        tr, lv = tree((x, y, hf(x, y)), rnd, 'round')
        trunks.append(tr)
        plants.extend(lv)
    return [
        plane('water', -0.6, (0.1, 0.35, 0.5), roughness=0.05),
        join(rocks, 'rocks', (0.4, 0.38, 0.35)),
        join(plants, 'plants', (0.2, 0.45, 0.2)),
        join(trunks, 'trunks', (0.35, 0.25, 0.15)),
    ]


# --- Volkanik ova: kara kayalar, volkan konisi ve lav ---
def volcanic_h(x, y):
    h = fbm(x, y, 0.05, 4) * 2.5
    d = math.sqrt((x - 6) ** 2 + (y - 45) ** 2)
    volcano = max(0.0, 22 - d * 0.9)
    crater = max(0.0, 6 - d) * 1.5
    return flat_near_origin(h + volcano - crater, x, y)


def volcanic_extras(hf):
    rnd = random.Random(4)
    rocks = scatter(30, rnd, 5, 30, hf, lambda p, r: rock(p, 0.4 + r.random() * 1.4, r))
    # Lav nehri: alçak bir şerit
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-6, 22, 0.2))
    lava = bpy.context.active_object
    lava.scale = (4, 36, 1)
    lava.rotation_euler = (0, 0, 0.35)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    lava.name = 'lava'
    lava.data.materials.append(mat('lava_mat', (1.0, 0.35, 0.05), 0.4))
    return [join(rocks, 'rocks', (0.12, 0.1, 0.1)), lava]


# --- Orman: tepeler, ağaçlar ve göl ---
def forest_h(x, y):
    return flat_near_origin(fbm(x, y, 0.04, 4) * 5 + max(0, y - 30) * 0.25, x, y)


def forest_extras(hf):
    rnd = random.Random(5)
    trunks, plants = [], []
    for _ in range(70):
        a = math.radians(rnd.uniform(-85, 85)) + math.pi / 2
        r = rnd.uniform(5, 40)
        x, y = math.cos(a) * r, math.sin(a) * r
        if abs(x - 10) < 6 and 10 < y < 20:
            continue  # göl
        tr, lv = tree((x, y, hf(x, y)), rnd, 'pine' if rnd.random() < 0.6 else 'round')
        trunks.append(tr)
        plants.extend(lv)
    # Dev mantarlar
    for _ in range(4):
        x, y = rnd.uniform(-10, -4), rnd.uniform(6, 14)
        z = hf(x, y)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.25, depth=2.4, location=(x, y, z + 1.2))
        trunks.append(bpy.context.active_object)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1.2, location=(x, y, z + 2.4))
        cap = bpy.context.active_object
        cap.scale = (1, 1, 0.45)
        plants.append(cap)
    rocks = scatter(10, rnd, 6, 25, hf, lambda p, r: rock(p, 0.4 + r.random(), r))
    return [
        join(plants, 'plants', (0.15, 0.4, 0.12)),
        join(trunks, 'trunks', (0.3, 0.2, 0.12)),
        join(rocks, 'rocks', (0.4, 0.4, 0.38)),
        plane('water', hf(10, 15) - 0.6, (0.1, 0.3, 0.4), size=14, roughness=0.05, y0=15),
    ]


os.makedirs(common.MODELS_DIR, exist_ok=True)
build('desert', desert_h, (0.8, 0.62, 0.42), desert_extras)
build('ice', ice_h, (0.85, 0.9, 0.95), ice_extras)
build('shore', shore_h, (0.82, 0.74, 0.55), shore_extras)
build('volcanic', volcanic_h, (0.15, 0.13, 0.12), volcanic_extras)
build('forest', forest_h, (0.3, 0.42, 0.22), forest_extras)
