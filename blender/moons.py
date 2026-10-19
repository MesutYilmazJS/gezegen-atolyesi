"""Düzensiz şekilli küçük aylar (Phobos benzeri). Çıktı: public/models/moon_{a,b,c}.glb"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

MOONS = [
    ('moon_a', 11, (1.0, 0.82, 0.7), (0.42, 0.40, 0.38)),
    ('moon_b', 23, (1.0, 0.9, 0.85), (0.50, 0.46, 0.41)),
    ('moon_c', 37, (1.0, 0.7, 0.62), (0.36, 0.33, 0.31)),
]

for name, seed, scale, color in MOONS:
    common.reset_scene()
    obj = common.make_rock(name, seed, scale=scale, subdiv=4, roughness=0.3, craters=0.1, color=color)
    common.export_glb(obj, f'{name}.glb')
