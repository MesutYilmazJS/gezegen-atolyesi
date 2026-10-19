"""Göktaşı modeli (felaket animasyonları için). Çıktı: public/models/asteroid.glb"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.reset_scene()
obj = common.make_rock('asteroid', 101, scale=(1.3, 0.75, 0.65), subdiv=3, roughness=0.5, craters=0.16, color=(0.24, 0.22, 0.21))
common.export_glb(obj, 'asteroid.glb')
