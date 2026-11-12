#!/usr/bin/env python3
"""Generates every tileable PBR texture set used by the game into public/assets/textures.

Usage: python3 tools/textures/build_textures.py [name ...] [--size 1024]
Deterministic (fixed seeds). No external image sources are used.
"""
from __future__ import annotations

import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from texlib import *  # noqa: F401,F403

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "textures")
REG = {}


def tex(name, size=1024):
    def deco(fn):
        REG[name] = (fn, size)
        return fn
    return deco


def tone(base, var, amount):
    """Multiply a colour layer by (1 + (var-0.5)*amount)."""
    return np.clip(base * (1.0 + (var[..., None] - 0.5) * amount), 0, 1)


def mix(a, b, m):
    return a * (1 - m[..., None]) + b * m[..., None]


# ============================================================================= WOOD / HOUSE
@tex("siding_white")
def siding_white(t):
    n = t.n
    u, v = grid_uv(n)
    boards = 16
    fy = v * boards
    row = np.floor(fy)
    lv = fy - row
    # Lap siding: each board tilts outwards toward its lower edge, with a shadowed butt edge.
    h = lv * 0.75 + 0.1
    lip = smoothstep(0.93, 0.99, lv)
    h = h * (1 - lip) + 0.0 * lip
    g = grain(n, 3, horizontal=True)
    rnd = cell_random(row.astype(int), 5)
    # vertical butt joints, staggered per row
    joint_pos = cell_random(row.astype(int), 11)
    ju = (u + joint_pos) % 1.0
    joint = 1 - smoothstep(0.0, 0.004, np.abs(ju - 0.5))
    wood = mix(solid(n, rgb("#6f685d")), solid(n, rgb("#8e877a")), g)
    wood = tone(wood, fbm(n, 2.2, 21), 0.5)
    paint = solid(n, rgb("#d9d6cc")) * (0.93 + 0.1 * rnd[..., None])
    paint = tone(paint, fbm(n, 2.6, 4), 0.12)
    # peeling: elongated along the grain, concentrated near lower board edges
    pe = fbm(n, 1.5, 9, fmin=3, aniso=(1.0, 0.25)) * 0.7 + fbm(n, 1.0, 10, fmin=20, aniso=(1.0, 0.3)) * 0.3
    pe = pe + (lv - 0.5) * 0.22 + (rnd - 0.5) * 0.25
    peel = smoothstep(0.56, 0.6, pe)
    alb = mix(paint, wood, peel)
    dirt = np.clip(streaks(n, 31) * 0.5 + lv * 0.35, 0, 1)
    alb = mix(alb, alb * rgb("#9a917f"), dirt * 0.45)
    alb = alb * (1 - lip[..., None] * 0.55) * (1 - joint[..., None] * 0.5)
    t.albedo = alb
    t.height = np.clip(h + g * 0.03 * peel - peel * 0.02 - joint * 0.1, 0, 1)
    t.rough = np.clip(0.72 + peel * 0.2 + dirt * 0.08, 0, 1)
    t.normal_strength = 9.0


@tex("shingles")
def shingles(t):
    n = t.n
    T = tiles(n, 9, 14, gap=0.035, bevel=0.03, offset_rows=0.5, seed=3)
    u, v = grid_uv(n)
    lv = T["v"]
    # Each course overlaps the one below: ramp up toward the lower edge.
    h = T["mask"] * (0.35 + 0.55 * lv)
    g = fbm(n, 1.4, 5, fmin=8)
    base = mix(solid(n, rgb("#6b6a66")), solid(n, rgb("#8a8780")), T["rnd"])
    base = tone(base, g, 0.5)
    moss = smoothstep(0.62, 0.8, fbm(n, 2.4, 8))
    base = mix(base, base * rgb("#8f8468"), moss * 0.5)
    dust = fbm(n, 2.8, 12)
    base = mix(base, solid(n, rgb("#a39a86")), dust * 0.25)
    t.albedo = base * (0.45 + 0.55 * T["mask"][..., None]) * (0.8 + 0.2 * lv[..., None])
    t.height = np.clip(h + g * 0.06, 0, 1)
    t.rough = np.clip(0.88 + g * 0.1, 0, 1)
    t.normal_strength = 8.0


@tex("wood_planks")
def wood_planks(t):
    n = t.n
    T = tiles(n, 2, 14, gap=0.012, bevel=0.012, offset_rows=0.37, seed=7)
    g = grain(n, 13, horizontal=True)
    base = mix(solid(n, rgb("#6e6558")), solid(n, rgb("#9a8f7c")), g)
    base = base * (0.82 + 0.3 * T["rnd"][..., None])
    wear = fbm(n, 2.2, 19)
    base = mix(base, solid(n, rgb("#b0a590")), smoothstep(0.55, 0.8, wear) * 0.35)
    t.albedo = base * (0.3 + 0.7 * T["mask"][..., None])
    t.height = np.clip(T["height"] * 0.8 + g * 0.12 + (T["rnd"] - 0.5) * 0.08, 0, 1)
    t.rough = np.clip(0.8 + g * 0.12, 0, 1)
    t.normal_strength = 6.0


@tex("wood_painted")
def wood_painted(t):
    n = t.n
    g = grain(n, 23, horizontal=True)
    chip = smoothstep(0.66, 0.7, fbm(n, 1.3, 29, fmin=4, aniso=(1.0, 0.3)))
    paint = tone(solid(n, rgb("#e8e6e0")), fbm(n, 2.5, 3), 0.1)
    wood = mix(solid(n, rgb("#7b7366")), solid(n, rgb("#9b927f")), g)
    t.albedo = mix(paint, wood, chip)
    t.height = np.clip(0.5 + g * 0.05 - chip * 0.08, 0, 1)
    t.rough = np.clip(0.62 + chip * 0.25, 0, 1)
    t.normal_strength = 3.0


@tex("floor_wood")
def floor_wood(t):
    n = t.n
    T = tiles(n, 2, 20, gap=0.006, bevel=0.006, offset_rows=0.43, seed=41)
    g = grain(n, 43, horizontal=True)
    base = mix(solid(n, rgb("#5a3d27")), solid(n, rgb("#8a623f")), g)
    base = base * (0.8 + 0.35 * T["rnd"][..., None])
    sc = scratches(n, 220, 47, length=(0.02, 0.12))
    base = mix(base, solid(n, rgb("#a98c6a")), sc * 0.35)
    t.albedo = base * (0.45 + 0.55 * T["mask"][..., None])
    t.height = np.clip(T["height"] * 0.6 + g * 0.06 + 0.2, 0, 1)
    t.rough = np.clip(0.42 + sc * 0.3 + fbm(n, 2.4, 49) * 0.2, 0, 1)
    t.normal_strength = 3.0


@tex("plaster")
def plaster(t):
    n = t.n
    f = fbm(n, 1.6, 51, fmin=6)
    lf = fbm(n, 2.8, 53)
    t.albedo = tone(solid(n, rgb("#e3e1dc")), lf, 0.16) * (0.97 + 0.06 * f[..., None])
    cr = scratches(n, 14, 55, length=(0.1, 0.4), blur_sigma=0.6)
    t.albedo = t.albedo * (1 - cr[..., None] * 0.35)
    t.height = np.clip(0.5 + (f - 0.5) * 0.25 - cr * 0.3, 0, 1)
    t.rough = np.clip(0.86 + f * 0.1, 0, 1)
    t.normal_strength = 2.5


# ============================================================================= CONCRETE / STONE
@tex("concrete")
def concrete(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.6, 61), fbm(n, 1.8, 62, fmin=6), fbm(n, 0.8, 63, fmin=40)
    f1, f2, _ = voronoi(n, 900, 64)
    pores = smoothstep(0.16, 0.05, f1) * smoothstep(0.55, 0.75, mf)
    base = tone(solid(n, rgb("#8f8d87")), lf, 0.35)
    base = tone(base, mf, 0.2) * (0.94 + 0.12 * hf[..., None])
    stain = streaks(n, 66)
    base = mix(base, base * rgb("#7a7468"), smoothstep(0.6, 0.95, stain) * 0.3)
    cr = scratches(n, 10, 67, length=(0.15, 0.5), angle_spread=math.pi, blur_sigma=0.5)
    t.albedo = base * (1 - pores[..., None] * 0.5) * (1 - cr[..., None] * 0.5)
    t.height = np.clip(0.55 + (mf - 0.5) * 0.2 + (hf - 0.5) * 0.08 - pores * 0.35 - cr * 0.3, 0, 1)
    t.rough = np.clip(0.82 + hf * 0.12, 0, 1)
    t.normal_strength = 4.0


@tex("concrete_panels")
def concrete_panels(t):
    n = t.n
    T = tiles(n, 2, 3, gap=0.006, bevel=0.004, offset_rows=0.0, seed=71)
    lf, mf, hf = fbm(n, 2.6, 72), fbm(n, 1.8, 73, fmin=6), fbm(n, 0.8, 74, fmin=40)
    base = tone(solid(n, rgb("#86847f")), lf, 0.3) * (0.9 + 0.2 * T["rnd"][..., None])
    base = base * (0.94 + 0.12 * hf[..., None])
    # formwork tie holes: 2 x 2 per panel
    lu, lv = T["u"], T["v"]
    hole = np.zeros((n, n))
    for a in (0.2, 0.8):
        for b in (0.25, 0.75):
            d = np.sqrt(((lu - a) * 2.0) ** 2 + ((lv - b) * 1.333) ** 2)
            hole = np.maximum(hole, 1 - smoothstep(0.012, 0.02, d))
    leak = np.clip(streaks(n, 76, 1.3), 0, 1)
    leakm = smoothstep(0.55, 0.95, leak)
    base = mix(base, base * rgb("#6c665b"), leakm * 0.6)
    efflo = smoothstep(0.7, 0.95, streaks(n, 77))
    base = mix(base, solid(n, rgb("#b5b2aa")), efflo * 0.2)
    t.albedo = base * (0.5 + 0.5 * T["mask"][..., None]) * (1 - hole[..., None] * 0.7)
    t.height = np.clip(0.5 * T["mask"] + 0.25 + (mf - 0.5) * 0.12 - hole * 0.4, 0, 1)
    t.rough = np.clip(0.8 + hf * 0.12 - leakm * 0.12, 0, 1)
    t.normal_strength = 5.0


@tex("asphalt")
def asphalt(t):
    n = t.n
    hf, mf, lf = fbm(n, 0.4, 81, fmin=30), fbm(n, 1.6, 82, fmin=5), fbm(n, 2.8, 83)
    f1, f2, ids = voronoi(n, 60, 84)
    crack = smoothstep(0.03, 0.0, f2 - f1) * smoothstep(0.52, 0.7, fbm(n, 2.2, 85, fmin=2))
    agg = smoothstep(0.7, 0.85, hf)
    base = tone(solid(n, rgb("#4a4947")), lf, 0.5)
    base = mix(base, solid(n, rgb("#8a8780")), agg * 0.5)
    dust = smoothstep(0.45, 0.85, mf)
    base = mix(base, solid(n, rgb("#8f8674")), dust * 0.45)
    t.albedo = base * (1 - crack[..., None] * 0.75)
    t.height = np.clip(0.5 + (hf - 0.5) * 0.3 - crack * 0.5, 0, 1)
    t.rough = np.clip(0.88 + hf * 0.1, 0, 1)
    t.normal_strength = 5.0


@tex("rock")
def rock(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.4, 91), fbm(n, 1.7, 92, fmin=4), fbm(n, 1.0, 93, fmin=24)
    f1, f2, ids = voronoi(n, 40, 94)
    crack = smoothstep(0.045, 0.0, f2 - f1) * smoothstep(0.42, 0.62, fbm(n, 2.0, 97, fmin=2))
    strata = _strata(n, 95)
    h = np.clip(lf * 0.5 + mf * 0.3 + hf * 0.12 + strata * 0.15 - crack * 0.25, 0, 1)
    base = mix(solid(n, rgb("#5f5a52")), solid(n, rgb("#9a9488")), h)
    base = tone(base, blur(cell_random(ids, 96), 14), 0.5)
    t.albedo = base * (1 - crack[..., None] * 0.5)
    t.height = h
    t.rough = np.clip(0.86 + hf * 0.1, 0, 1)
    t.normal_strength = 9.0


def _strata(n, seed):
    u, v = grid_uv(n)
    w = fbm(n, 2.6, seed) * 0.12
    return _norm_(np.sin((v + w) * math.tau * 9) * 0.5 + np.sin((v + w * 1.7) * math.tau * 23) * 0.3)


def _norm_(x):
    return (x - x.min()) / (x.max() - x.min() + 1e-12)


# ============================================================================= GROUND
@tex("dirt")
def dirt(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.6, 101), fbm(n, 1.6, 102, fmin=5), fbm(n, 0.7, 103, fmin=30)
    f1, f2, ids = voronoi(n, 1600, 104)
    peb = smoothstep(0.38, 0.2, f1) * smoothstep(0.55, 0.7, cell_random(ids, 105))
    base = mix(solid(n, rgb("#6d5c47")), solid(n, rgb("#9c8b70")), _norm_(lf * 0.6 + mf * 0.4))
    base = base * (0.9 + 0.2 * hf[..., None])
    base = mix(base, solid(n, rgb("#a39c8f")) * (0.7 + 0.5 * cell_random(ids, 106)[..., None]), peb * 0.8)
    t.albedo = base
    t.height = np.clip(0.4 + (mf - 0.5) * 0.4 + (hf - 0.5) * 0.15 + peb * 0.3, 0, 1)
    t.rough = np.clip(0.93 + hf * 0.06, 0, 1)
    t.normal_strength = 6.0


@tex("gravel")
def gravel(t):
    n = t.n
    f1, f2, ids = voronoi(n, 5200, 111)
    f1b, f2b, idsb = voronoi(n, 600, 112)
    stone = smoothstep(0.55, 0.15, f1)
    big = smoothstep(0.5, 0.2, f1b) * smoothstep(0.7, 0.8, cell_random(idsb, 113))
    r = cell_random(ids, 114)
    base = mix(solid(n, rgb("#7d7466")), solid(n, rgb("#b3aa9a")), r)
    base = mix(base, solid(n, rgb("#958d80")), big)
    lf = fbm(n, 2.6, 115)
    base = tone(base, lf, 0.3) * (0.45 + 0.55 * np.maximum(stone, big)[..., None])
    t.albedo = base
    t.height = np.clip(stone * 0.5 + big * 0.5, 0, 1)
    t.rough = np.clip(0.9 + r * 0.08, 0, 1)
    t.normal_strength = 7.0


@tex("grass_dry")
def grass_dry(t):
    n = t.n
    lf, mf = fbm(n, 2.6, 121), fbm(n, 1.6, 122, fmin=5)
    bl = fbm(n, 0.9, 123, fmin=30, aniso=(1.0, 0.35)) * 0.6 + fbm(n, 0.9, 124, fmin=30, aniso=(0.35, 1.0)) * 0.4
    base = mix(solid(n, rgb("#6f6a3c")), solid(n, rgb("#a89f63")), _norm_(bl))
    base = mix(base, solid(n, rgb("#7d6f52")), smoothstep(0.55, 0.8, lf) * 0.7)
    base = mix(base, solid(n, rgb("#58652f")), smoothstep(0.55, 0.85, mf) * 0.4)
    t.albedo = base * (0.75 + 0.5 * bl[..., None])
    t.height = np.clip(bl * 0.7 + mf * 0.3, 0, 1)
    t.rough = np.clip(0.9 + bl * 0.08, 0, 1)
    t.normal_strength = 6.0


@tex("soil_rows")
def soil_rows(t):
    n = t.n
    u, v = grid_uv(n)
    rows = 4
    w = fbm(n, 2.4, 131) * 0.02
    ridge = 0.5 + 0.5 * np.cos((u + w) * math.tau * rows)
    mf, hf = fbm(n, 1.6, 132, fmin=5), fbm(n, 0.7, 133, fmin=30)
    f1, f2, ids = voronoi(n, 2500, 134)
    clod = smoothstep(0.4, 0.15, f1) * smoothstep(0.5, 0.7, cell_random(ids, 135))
    base = mix(solid(n, rgb("#5b4a38")), solid(n, rgb("#8d7a60")), _norm_(ridge * 0.5 + mf * 0.5))
    base = base * (0.88 + 0.24 * hf[..., None])
    base = mix(base, solid(n, rgb("#9a8a70")), clod * 0.5)
    t.albedo = base
    t.height = np.clip(ridge * 0.6 + (mf - 0.5) * 0.2 + clod * 0.2, 0, 1)
    t.rough = np.clip(0.94 + hf * 0.05, 0, 1)
    t.normal_strength = 7.0


@tex("sand")
def sand(t):
    n = t.n
    u, v = grid_uv(n)
    w = fbm(n, 2.4, 141)
    rip = 0.5 + 0.5 * np.sin((v * 22 + w * 3.0) * math.tau)
    hf = fbm(n, 0.4, 142, fmin=40)
    base = tone(solid(n, rgb("#b9a583")), fbm(n, 2.6, 143), 0.25) * (0.92 + 0.16 * hf[..., None])
    t.albedo = base * (0.92 + 0.08 * rip[..., None])
    t.height = np.clip(rip * 0.35 + w * 0.5 + hf * 0.08, 0, 1)
    t.rough = np.clip(0.9 + hf * 0.08, 0, 1)
    t.normal_strength = 4.0


@tex("desert_rock")
def desert_rock(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.4, 151), fbm(n, 1.7, 152, fmin=4), fbm(n, 1.0, 153, fmin=24)
    f1, f2, ids = voronoi(n, 70, 154)
    crack = smoothstep(0.05, 0.0, f2 - f1) * smoothstep(0.4, 0.6, fbm(n, 2.0, 158, fmin=2))
    h = np.clip(lf * 0.45 + mf * 0.3 + hf * 0.15 + blur(cell_random(ids, 155), 10) * 0.25 - crack * 0.3, 0, 1)
    base = mix(solid(n, rgb("#6e5a47")), solid(n, rgb("#b59a79")), h)
    base = tone(base, blur(cell_random(ids, 156), 12), 0.5)
    varn = smoothstep(0.6, 0.85, fbm(n, 2.2, 157))
    base = mix(base, base * rgb("#7d5f4c"), varn * 0.5)
    t.albedo = base * (1 - crack[..., None] * 0.55)
    t.height = h
    t.rough = np.clip(0.88 + hf * 0.1, 0, 1)
    t.normal_strength = 9.0


@tex("desert_gravel")
def desert_gravel(t):
    n = t.n
    f1, f2, ids = voronoi(n, 4200, 161)
    f1b, f2b, idsb = voronoi(n, 260, 162)
    stone = smoothstep(0.5, 0.12, f1) * smoothstep(0.35, 0.5, cell_random(ids, 163))
    big = smoothstep(0.55, 0.15, f1b) * smoothstep(0.72, 0.8, cell_random(idsb, 164))
    lf, hf = fbm(n, 2.6, 165), fbm(n, 0.5, 166, fmin=40)
    ground = tone(solid(n, rgb("#a48d6f")), lf, 0.3) * (0.92 + 0.16 * hf[..., None])
    r = cell_random(ids, 167)
    st = mix(solid(n, rgb("#7a6957")), solid(n, rgb("#b8a48a")), r)
    base = mix(ground, st, stone)
    base = mix(base, solid(n, rgb("#8a7663")) * (0.8 + 0.4 * cell_random(idsb, 168)[..., None]), big)
    t.albedo = base
    t.height = np.clip(0.25 + stone * 0.35 + big * 0.6 + (lf - 0.5) * 0.2, 0, 1)
    t.rough = np.clip(0.9 + r * 0.08, 0, 1)
    t.normal_strength = 7.0


@tex("ice")
def ice(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.6, 171), fbm(n, 1.8, 172, fmin=4), fbm(n, 1.0, 173, fmin=24)
    f1, f2, ids = voronoi(n, 45, 174)
    crack = smoothstep(0.06, 0.0, f2 - f1) * smoothstep(0.4, 0.6, fbm(n, 2.0, 177, fmin=2))
    f1c, f2c, _ = voronoi(n, 500, 175)
    fine = smoothstep(0.05, 0.0, f2c - f1c) * 0.5
    # flow ridges: dark dirt bands like the glacier surface in the reference
    band = _norm_(np.abs(fbm(n, 2.2, 176, aniso=(0.25, 1.0)) - 0.5))
    ridge = 1 - smoothstep(0.0, 0.12, band)
    h = np.clip(lf * 0.5 + mf * 0.3 + hf * 0.1 - crack * 0.35 - fine * 0.1 + ridge * 0.1, 0, 1)
    base = mix(solid(n, rgb("#8f9499")), solid(n, rgb("#dfe3e6")), _norm_(h))
    base = mix(base, solid(n, rgb("#5d6064")), ridge * 0.55)
    base = base * (1 - crack[..., None] * 0.6) * (1 - fine[..., None] * 0.3)
    t.albedo = base
    t.height = h
    t.rough = np.clip(0.55 + hf * 0.25 + ridge * 0.2 - smoothstep(0.6, 0.9, lf) * 0.25, 0, 1)
    t.normal_strength = 9.0


@tex("snow")
def snow(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.8, 181), fbm(n, 1.9, 182, fmin=4), fbm(n, 0.6, 183, fmin=40)
    u, v = grid_uv(n)
    sast = _norm_(fbm(n, 2.0, 184, aniso=(0.3, 1.0)))
    base = tone(solid(n, rgb("#d7dade")), lf, 0.12)
    base = mix(base, solid(n, rgb("#a9adb2")), smoothstep(0.55, 0.9, sast) * 0.35)
    t.albedo = base * (0.96 + 0.08 * hf[..., None])
    t.height = np.clip(lf * 0.5 + sast * 0.35 + hf * 0.06, 0, 1)
    t.rough = np.clip(0.8 + hf * 0.15, 0, 1)
    t.normal_strength = 5.0


# ============================================================================= METAL / PAINT
@tex("metal_painted")
def metal_painted(t):
    """Neutral light paint over steel. Tint with material colour. Scratches expose metal."""
    n = t.n
    lf, mf, hf = fbm(n, 2.6, 201), fbm(n, 1.8, 202, fmin=5), fbm(n, 0.6, 203, fmin=40)
    sc = np.clip(scratches(n, 260, 204, length=(0.01, 0.14)) * 1.2, 0, 1)
    chip = smoothstep(0.74, 0.78, fbm(n, 1.2, 205, fmin=8))
    expose = np.clip(sc * 0.8 + chip, 0, 1)
    paint = tone(solid(n, rgb("#e6e6e6")), lf, 0.1) * (0.97 + 0.06 * hf[..., None])
    dirt = smoothstep(0.5, 0.9, mf) * 0.5 + smoothstep(0.55, 0.95, streaks(n, 206)) * 0.4
    paint = mix(paint, paint * rgb("#a89c88"), np.clip(dirt, 0, 1) * 0.6)
    metal = solid(n, rgb("#77777a")) * (0.85 + 0.3 * hf[..., None])
    t.albedo = mix(paint, metal, expose)
    t.height = np.clip(0.55 + (hf - 0.5) * 0.05 - expose * 0.12 + (mf - 0.5) * 0.04, 0, 1)
    t.rough = np.clip(0.5 + dirt * 0.3 - expose * 0.12 + hf * 0.08, 0, 1)
    t.metal = expose * 0.9
    t.normal_strength = 2.5


@tex("metal_bare")
def metal_bare(t):
    n = t.n
    br = fbm(n, 0.9, 211, fmin=10, aniso=(1.0, 0.012))
    lf = fbm(n, 2.6, 212)
    sc = scratches(n, 120, 213, length=(0.02, 0.2))
    spots = smoothstep(0.7, 0.9, fbm(n, 1.6, 214, fmin=4))
    base = tone(solid(n, rgb("#c2c4c6")), br, 0.25)
    base = tone(base, lf, 0.12)
    base = mix(base, solid(n, rgb("#8b877f")), spots * 0.5)
    t.albedo = base * (1 + sc[..., None] * 0.15)
    t.height = np.clip(0.5 + (br - 0.5) * 0.12 - sc * 0.1, 0, 1)
    t.rough = np.clip(0.34 + br * 0.14 + spots * 0.3 + sc * 0.1, 0, 1)
    t.metal = np.clip(1 - spots * 0.5, 0, 1)
    t.normal_strength = 2.0


@tex("metal_dark")
def metal_dark(t):
    n = t.n
    lf, hf = fbm(n, 2.6, 221), fbm(n, 0.6, 222, fmin=40)
    sc = scratches(n, 200, 223, length=(0.01, 0.16))
    wear = smoothstep(0.6, 0.85, fbm(n, 1.6, 224, fmin=4))
    base = tone(solid(n, rgb("#3c3d40")), lf, 0.3) * (0.92 + 0.16 * hf[..., None])
    base = mix(base, solid(n, rgb("#8d8e90")), np.clip(sc * 0.7 + wear * 0.15, 0, 1))
    dust = smoothstep(0.5, 0.9, fbm(n, 2.2, 225))
    base = mix(base, solid(n, rgb("#6e675b")), dust * 0.25)
    t.albedo = base
    t.height = np.clip(0.5 + (hf - 0.5) * 0.06 - sc * 0.1, 0, 1)
    t.rough = np.clip(0.52 + dust * 0.25 - sc * 0.15 + hf * 0.08, 0, 1)
    t.metal = np.clip(0.75 + sc * 0.25 - dust * 0.3, 0, 1)
    t.normal_strength = 2.0


@tex("rust")
def rust(t):
    n = t.n
    lf, mf, hf = fbm(n, 2.4, 231), fbm(n, 1.5, 232, fmin=5), fbm(n, 0.7, 233, fmin=30)
    m = _norm_(lf * 0.5 + mf * 0.5)
    r1 = mix(solid(n, rgb("#5a2f1a")), solid(n, rgb("#a05a2a")), mf)
    r2 = mix(r1, solid(n, rgb("#c98a4a")), smoothstep(0.6, 0.9, hf) * 0.5)
    paint = tone(solid(n, rgb("#d5d3cc")), fbm(n, 2.6, 234), 0.15)
    pm = smoothstep(0.52, 0.58, m + (hf - 0.5) * 0.15)
    streak = smoothstep(0.5, 0.9, streaks(n, 235))
    paint = mix(paint, solid(n, rgb("#9a5a30")), streak * 0.55)
    t.albedo = mix(r2, paint, pm)
    t.height = np.clip(0.4 + pm * 0.15 + (hf - 0.5) * 0.3 * (1 - pm), 0, 1)
    t.rough = np.clip(0.9 - pm * 0.3 + hf * 0.08, 0, 1)
    t.metal = (1 - pm) * 0.25
    t.normal_strength = 5.0


@tex("corrugated")
def corrugated(t):
    n = t.n
    u, v = grid_uv(n)
    wave = 0.5 + 0.5 * np.sin(u * math.tau * 13)
    lf, hf = fbm(n, 2.6, 241), fbm(n, 0.6, 242, fmin=40)
    rustm = smoothstep(0.55, 0.8, fbm(n, 1.8, 243, fmin=3) * 0.6 + streaks(n, 244) * 0.4)
    base = tone(solid(n, rgb("#aeb1b3")), lf, 0.2) * (0.94 + 0.12 * hf[..., None])
    base = mix(base, mix(solid(n, rgb("#6b3b20")), solid(n, rgb("#a2622f")), hf), rustm * 0.85)
    t.albedo = base * (0.8 + 0.2 * wave[..., None])
    t.height = wave * 0.9 + hf * 0.05
    t.rough = np.clip(0.45 + rustm * 0.45 + hf * 0.08, 0, 1)
    t.metal = np.clip(0.9 - rustm * 0.8, 0, 1)
    t.normal_strength = 10.0


@tex("tread_plate")
def tread_plate(t):
    n = t.n
    u, v = grid_uv(n)
    k = 12
    h = np.zeros((n, n))
    for ox, oy, ang in ((0.0, 0.0, 0.6), (0.5, 0.5, -0.6)):
        cu, cv = ((u * k + ox) % 1.0) - 0.5, ((v * k + oy) % 1.0) - 0.5
        ru = cu * math.cos(ang) - cv * math.sin(ang)
        rv = cu * math.sin(ang) + cv * math.cos(ang)
        d = np.sqrt((ru / 0.34) ** 2 + (rv / 0.09) ** 2)
        h = np.maximum(h, 1 - smoothstep(0.75, 1.0, d))
    hf, lf = fbm(n, 0.6, 251, fmin=40), fbm(n, 2.6, 252)
    wear = smoothstep(0.45, 0.8, lf)
    base = tone(solid(n, rgb("#7d7f82")), lf, 0.25) * (0.93 + 0.14 * hf[..., None])
    base = mix(base, solid(n, rgb("#b9bbbe")), h * (0.35 + wear * 0.4))
    grime = (1 - h) * smoothstep(0.4, 0.8, fbm(n, 2.0, 253))
    base = mix(base, solid(n, rgb("#4b463e")), grime * 0.5)
    t.albedo = base
    t.height = h * 0.8 + hf * 0.04
    t.rough = np.clip(0.5 - h * 0.15 + grime * 0.35, 0, 1)
    t.metal = np.clip(0.9 - grime * 0.5, 0, 1)
    t.normal_strength = 7.0


@tex("grating", 512)
def grating(t):
    n = t.n
    u, v = grid_uv(n)
    k = 16
    bu = np.abs(((u * k) % 1.0) - 0.5)
    bv = np.abs(((v * (k / 4)) % 1.0) - 0.5)
    bar = np.maximum(smoothstep(0.34, 0.38, bu), smoothstep(0.44, 0.46, bv))
    hf = fbm(n, 0.6, 261, fmin=20)
    t.albedo = tone(solid(n, rgb("#5d5f62")), hf, 0.3)
    t.alpha = bar
    t.height = bar * 0.8
    t.rough = np.clip(0.55 + hf * 0.2, 0, 1)
    t.metal = np.ones((n, n)) * 0.85
    t.normal_strength = 4.0


@tex("chainlink", 512)
def chainlink(t):
    n = t.n
    u, v = grid_uv(n)
    k = 14
    a = np.abs((((u + v) * k) % 1.0) - 0.5)
    b = np.abs((((u - v) * k) % 1.0) - 0.5)
    wire = np.maximum(1 - smoothstep(0.035, 0.07, a), 1 - smoothstep(0.035, 0.07, b))
    t.albedo = tone(solid(n, rgb("#8d9092")), fbm(n, 1.5, 271), 0.3)
    t.alpha = wire
    t.height = wire
    t.rough = np.ones((n, n)) * 0.5
    t.metal = np.ones((n, n)) * 0.9
    t.normal_strength = 3.0


# ============================================================================= RUBBER / PLASTIC / FABRIC
@tex("tire_tread", 512)
def tire_tread(t):
    """Agricultural lug tread. U runs around the circumference, V across the width."""
    n = t.n
    u, v = grid_uv(n)
    k = 8
    vv = np.abs(v - 0.5) * 2.0
    lug_u = ((u * k + vv * 0.9) % 1.0)
    lug = smoothstep(0.0, 0.06, lug_u) * (1 - smoothstep(0.42, 0.48, lug_u))
    lug *= smoothstep(0.04, 0.1, vv) + (1 - smoothstep(0.0, 0.05, vv)) * 0.0
    lug *= 1 - smoothstep(0.9, 0.98, vv)
    hf = fbm(n, 0.7, 281, fmin=20)
    mud = smoothstep(0.45, 0.8, fbm(n, 2.0, 282)) * (1 - lug * 0.6)
    base = tone(solid(n, rgb("#262626")), hf, 0.3)
    base = mix(base, solid(n, rgb("#6e6250")), mud * 0.75)
    t.albedo = base
    t.height = lug * 0.9 + hf * 0.05
    t.rough = np.clip(0.85 + mud * 0.1, 0, 1)
    t.normal_strength = 12.0


@tex("rubber", 512)
def rubber(t):
    n = t.n
    hf, lf = fbm(n, 0.8, 291, fmin=20), fbm(n, 2.6, 292)
    dust = smoothstep(0.45, 0.9, fbm(n, 2.0, 293))
    base = tone(solid(n, rgb("#2b2b2c")), lf, 0.3) * (0.9 + 0.2 * hf[..., None])
    t.albedo = mix(base, solid(n, rgb("#6b6253")), dust * 0.45)
    t.height = 0.5 + (hf - 0.5) * 0.2
    t.rough = np.clip(0.8 + dust * 0.15, 0, 1)
    t.normal_strength = 2.0


@tex("floor_stud", 512)
def floor_stud(t):
    n = t.n
    u, v = grid_uv(n)
    k = 16
    cu, cv = ((u * k) % 1.0) - 0.5, ((v * k) % 1.0) - 0.5
    d = np.sqrt(cu * cu + cv * cv)
    stud = 1 - smoothstep(0.24, 0.32, d)
    dome = np.sqrt(np.clip(1 - (d / 0.32) ** 2, 0, 1)) * stud
    hf = fbm(n, 0.7, 301, fmin=20)
    grime = smoothstep(0.5, 0.85, fbm(n, 2.0, 302)) * (1 - stud * 0.7)
    base = tone(solid(n, rgb("#1f2022")), hf, 0.3)
    base = mix(base, solid(n, rgb("#3a3b3d")), stud * 0.45)
    base = mix(base, solid(n, rgb("#565046")), grime * 0.4)
    t.albedo = base
    t.height = dome * 0.9 + hf * 0.03
    t.rough = np.clip(0.72 - stud * 0.12 + grime * 0.2, 0, 1)
    t.normal_strength = 10.0


@tex("plastic_panel")
def plastic_panel(t):
    n = t.n
    hf, lf = fbm(n, 0.4, 311, fmin=60), fbm(n, 2.6, 312)
    sc = scratches(n, 160, 313, length=(0.01, 0.1))
    scuff = smoothstep(0.62, 0.85, fbm(n, 1.6, 314, fmin=4))
    grime = smoothstep(0.5, 0.9, fbm(n, 2.3, 315)) * 0.6 + smoothstep(0.6, 0.95, streaks(n, 316)) * 0.3
    base = tone(solid(n, rgb("#e2e0da")), lf, 0.08) * (0.97 + 0.06 * hf[..., None])
    base = mix(base, base * rgb("#a79d8b"), np.clip(grime, 0, 1) * 0.55)
    base = mix(base, solid(n, rgb("#f3f2ee")), sc * 0.3)
    t.albedo = base
    t.height = np.clip(0.5 + (hf - 0.5) * 0.08 - sc * 0.08, 0, 1)
    t.rough = np.clip(0.48 + scuff * 0.25 + grime * 0.2 + hf * 0.06, 0, 1)
    t.normal_strength = 1.6


@tex("fabric", 512)
def fabric(t):
    n = t.n
    u, v = grid_uv(n)
    k = 64
    wu = 0.5 + 0.5 * np.sin(u * math.tau * k)
    wv = 0.5 + 0.5 * np.sin(v * math.tau * k)
    chk = ((np.floor(u * k) + np.floor(v * k)) % 2)
    weave = np.where(chk > 0, wu, wv)
    hf, lf = fbm(n, 0.8, 321, fmin=30), fbm(n, 2.6, 322)
    wr = fbm(n, 2.2, 323, fmin=2)
    base = tone(solid(n, rgb("#d8d6d0")), lf, 0.15) * (0.82 + 0.25 * weave[..., None]) * (0.95 + 0.1 * hf[..., None])
    stain = smoothstep(0.55, 0.9, fbm(n, 2.4, 324))
    t.albedo = mix(base, base * rgb("#a99f8c"), stain * 0.45)
    t.height = np.clip(weave * 0.35 + wr * 0.5, 0, 1)
    t.rough = np.clip(0.9 + hf * 0.08, 0, 1)
    t.normal_strength = 4.0


@tex("leather_ribbed", 512)
def leather_ribbed(t):
    n = t.n
    u, v = grid_uv(n)
    ribs = 10
    lv = (v * ribs) % 1.0
    rib = np.sqrt(np.clip(1 - ((lv - 0.5) * 2.0) ** 2, 0, 1))
    f1, f2, ids = voronoi(n, 4000, 331)
    pore = smoothstep(0.1, 0.0, f2 - f1)
    lf, hf = fbm(n, 2.6, 332), fbm(n, 0.8, 333, fmin=30)
    wear = smoothstep(0.5, 0.85, fbm(n, 2.0, 334)) * rib
    base = tone(solid(n, rgb("#d9d4d2")), lf, 0.18) * (0.6 + 0.4 * rib[..., None])
    base = mix(base, solid(n, rgb("#f1eeec")), wear * 0.35)
    t.albedo = base * (1 - pore[..., None] * 0.2)
    t.height = np.clip(rib * 0.8 - pore * 0.06 + hf * 0.03, 0, 1)
    t.rough = np.clip(0.55 - wear * 0.15 + hf * 0.1, 0, 1)
    t.normal_strength = 7.0


@tex("padding")
def padding(t):
    """Quilted padded wall panels, 8 x 8 squares per tile. Neutral; tint with colour."""
    n = t.n
    u, v = grid_uv(n)
    k = 8
    cu, cv = ((u * k) % 1.0) - 0.5, ((v * k) % 1.0) - 0.5
    pil = np.clip(1 - (np.abs(cu) * 2) ** 2.6, 0, 1) * np.clip(1 - (np.abs(cv) * 2) ** 2.6, 0, 1)
    pil = pil ** 0.45
    seam = 1 - smoothstep(0.0, 0.035, np.minimum(0.5 - np.abs(cu), 0.5 - np.abs(cv)))
    hf, lf = fbm(n, 0.8, 341, fmin=40), fbm(n, 2.6, 342)
    wk = fbm(n, 1.8, 343, fmin=6)
    grime = smoothstep(0.5, 0.9, fbm(n, 2.2, 344))
    base = tone(solid(n, rgb("#dcdad5")), lf, 0.14) * (0.9 + 0.12 * hf[..., None])
    base = mix(base, base * rgb("#9c9588"), grime * 0.4)
    t.albedo = base * (0.55 + 0.45 * pil[..., None]) * (1 - seam[..., None] * 0.45)
    t.height = np.clip(pil * 0.85 + (wk - 0.5) * 0.08, 0, 1)
    t.rough = np.clip(0.86 + hf * 0.1, 0, 1)
    t.normal_strength = 7.0


@tex("canvas_bag", 512)
def canvas_bag(t):
    n = t.n
    u, v = grid_uv(n)
    k = 90
    weave = 0.5 + 0.25 * np.sin(u * math.tau * k) + 0.25 * np.sin(v * math.tau * k)
    wr = fbm(n, 2.0, 351, fmin=2)
    cre = np.abs(fbm(n, 1.8, 352, fmin=3) - 0.5) * 2
    crease = 1 - smoothstep(0.0, 0.08, cre)
    lf = fbm(n, 2.6, 353)
    grime = smoothstep(0.5, 0.9, fbm(n, 2.2, 354))
    base = tone(solid(n, rgb("#d6d3ca")), lf, 0.14) * (0.88 + 0.16 * weave[..., None])
    base = mix(base, base * rgb("#a39a88"), grime * 0.45)
    t.albedo = base * (1 - crease[..., None] * 0.18)
    t.height = np.clip(wr * 0.6 + weave * 0.12 - crease * 0.15, 0, 1)
    t.rough = np.clip(0.9 + weave * 0.06, 0, 1)
    t.normal_strength = 6.0


@tex("cloth", 512)
def cloth(t):
    n = t.n
    u, v = grid_uv(n)
    k = 80
    tw = 0.5 + 0.5 * np.sin((u + v * 0.5) * math.tau * k)
    wr = fbm(n, 2.1, 361, fmin=2)
    lf = fbm(n, 2.6, 362)
    base = tone(solid(n, rgb("#d9d9d9")), lf, 0.2) * (0.8 + 0.25 * tw[..., None])
    fade = smoothstep(0.5, 0.9, fbm(n, 2.2, 363))
    t.albedo = mix(base, solid(n, rgb("#efefef")), fade * 0.25)
    t.height = np.clip(wr * 0.7 + tw * 0.15, 0, 1)
    t.rough = np.clip(0.92 + tw * 0.05, 0, 1)
    t.normal_strength = 5.0


@tex("suit_fabric", 512)
def suit_fabric(t):
    n = t.n
    u, v = grid_uv(n)
    k = 110
    weave = 0.5 + 0.25 * np.sin(u * math.tau * k) + 0.25 * np.sin(v * math.tau * k)
    ribs = 0.5 + 0.5 * np.sin(v * math.tau * 14)
    wr = fbm(n, 2.0, 371, fmin=2)
    lf = fbm(n, 2.6, 372)
    grime = smoothstep(0.5, 0.9, fbm(n, 2.2, 373))
    base = tone(solid(n, rgb("#e3e1dc")), lf, 0.1) * (0.9 + 0.12 * weave[..., None])
    base = mix(base, base * rgb("#b0a696"), grime * 0.4)
    t.albedo = base * (0.9 + 0.1 * ribs[..., None])
    t.height = np.clip(wr * 0.45 + ribs * 0.3 + weave * 0.08, 0, 1)
    t.rough = np.clip(0.88 + weave * 0.06, 0, 1)
    t.normal_strength = 5.0


@tex("skin", 512)
def skin(t):
    n = t.n
    f1, f2, ids = voronoi(n, 9000, 381)
    pore = smoothstep(0.12, 0.0, f2 - f1)
    lf = fbm(n, 2.6, 382)
    base = tone(solid(n, rgb("#c99a7c")), lf, 0.14)
    t.albedo = base * (1 - pore[..., None] * 0.1)
    t.height = np.clip(0.5 - pore * 0.2, 0, 1)
    t.rough = np.clip(0.6 + lf * 0.1, 0, 1)
    t.normal_strength = 2.0


# ============================================================================= TILE / INTERIOR
@tex("tile_white")
def tile_white(t):
    n = t.n
    T = tiles(n, 10, 10, gap=0.05, bevel=0.035, seed=401)
    lf, hf = fbm(n, 2.6, 402), fbm(n, 0.8, 403, fmin=30)
    grime = smoothstep(0.5, 0.9, fbm(n, 2.2, 404))
    chip = smoothstep(0.9, 0.93, cell_random(T["ids"], 405)) * smoothstep(0.5, 0.2, T["d"] * 4)
    base = solid(n, rgb("#e4e5e3")) * (0.93 + 0.09 * T["rnd"][..., None])
    base = mix(base, base * rgb("#b9b3a5"), grime * 0.3)
    grout = solid(n, rgb("#6f6e69")) * (0.8 + 0.4 * hf[..., None])
    alb = mix(grout, base, T["mask"])
    t.albedo = mix(alb, solid(n, rgb("#a8a59c")), chip * 0.7)
    t.height = np.clip(T["height"] * 0.85 - chip * 0.3 + hf * 0.02, 0, 1)
    t.rough = np.clip(0.22 + (1 - T["mask"]) * 0.65 + grime * 0.18 + chip * 0.4, 0, 1)
    t.normal_strength = 5.0


@tex("tile_floor")
def tile_floor(t):
    n = t.n
    T = tiles(n, 4, 4, gap=0.02, bevel=0.02, seed=411)
    lf, hf = fbm(n, 2.6, 412), fbm(n, 0.8, 413, fmin=30)
    sc = scratches(n, 200, 414, length=(0.02, 0.15))
    grime = smoothstep(0.45, 0.9, fbm(n, 2.2, 415))
    base = solid(n, rgb("#bdbbb4")) * (0.9 + 0.14 * T["rnd"][..., None]) * (0.95 + 0.1 * hf[..., None])
    base = mix(base, base * rgb("#8d8679"), grime * 0.45)
    grout = solid(n, rgb("#5b5a55"))
    t.albedo = mix(grout, base, T["mask"])
    t.height = np.clip(T["height"] * 0.8 - sc * 0.05, 0, 1)
    t.rough = np.clip(0.4 + (1 - T["mask"]) * 0.5 + grime * 0.2 + sc * 0.2, 0, 1)
    t.normal_strength = 4.0


@tex("floor_panel")
def floor_panel(t):
    """Removable metal deck panels with recessed fasteners."""
    n = t.n
    T = tiles(n, 2, 2, gap=0.012, bevel=0.01, seed=421)
    lu, lv = T["u"], T["v"]
    bolt = np.zeros((n, n))
    for a in (0.08, 0.92):
        for b in (0.08, 0.5, 0.92):
            d = np.sqrt((lu - a) ** 2 + (lv - b) ** 2)
            bolt = np.maximum(bolt, 1 - smoothstep(0.018, 0.026, d))
    hf, lf = fbm(n, 0.6, 422, fmin=40), fbm(n, 2.6, 423)
    sc = scratches(n, 320, 424, length=(0.01, 0.2))
    scuff = smoothstep(0.45, 0.8, fbm(n, 1.8, 425, fmin=3))
    base = tone(solid(n, rgb("#77797c")), lf, 0.2) * (0.9 + 0.14 * T["rnd"][..., None]) * (0.95 + 0.1 * hf[..., None])
    base = mix(base, solid(n, rgb("#a9abad")), np.clip(sc * 0.6 + scuff * 0.2, 0, 1))
    grime = smoothstep(0.5, 0.9, fbm(n, 2.2, 426))
    base = mix(base, solid(n, rgb("#4a463f")), grime * 0.4)
    t.albedo = base * (0.4 + 0.6 * T["mask"][..., None]) * (1 - bolt[..., None] * 0.5)
    t.height = np.clip(T["height"] * 0.7 + 0.1 - bolt * 0.25 - sc * 0.05, 0, 1)
    t.rough = np.clip(0.48 + grime * 0.3 - sc * 0.1 + hf * 0.08, 0, 1)
    t.metal = np.clip(0.8 - grime * 0.5, 0, 1) * T["mask"]
    t.normal_strength = 4.5


# ============================================================================= SPACECRAFT HULL
@tex("hull_white", 2048)
def hull_white(t):
    """White aerospace composite: irregular panel seams, fasteners, dirt, streaks, discolouration."""
    n = t.n
    T = tiles(n, 4, 6, gap=0.006, bevel=0.004, offset_rows=0.31, seed=501)
    lf, mf, hf = fbm(n, 2.6, 502), fbm(n, 1.8, 503, fmin=5), fbm(n, 0.5, 504, fmin=80)
    u, v = grid_uv(n)
    k = 300
    weave = 0.5 + 0.25 * np.sin(u * math.tau * k) + 0.25 * np.sin(v * math.tau * k)
    base = solid(n, rgb("#dcdbd6")) * (0.9 + 0.13 * T["rnd"][..., None])
    base = tone(base, lf, 0.1) * (0.97 + 0.05 * weave[..., None])
    # heat / UV yellowing in patches, soot streaks from seams
    yel = smoothstep(0.55, 0.9, mf)
    base = mix(base, base * rgb("#d8cfb8"), yel * 0.35)
    soot = smoothstep(0.55, 0.95, streaks(n, 505, 1.2)) * 0.5 + smoothstep(0.6, 0.95, streaks(n, 506, 1.0, vertical=False)) * 0.25
    base = mix(base, base * rgb("#8f8a82"), np.clip(soot, 0, 1) * 0.5)
    edge_dirt = 1 - smoothstep(0.0, 0.05, T["d"])
    base = mix(base, base * rgb("#9d978c"), edge_dirt * 0.5)
    sc = scratches(n, 500, 507, length=(0.005, 0.06))
    base = mix(base, solid(n, rgb("#9a9b9d")), sc * 0.3)
    # fastener rows along the panel borders
    lu, lv = T["u"], T["v"]
    fu = np.abs(((lu * 8) % 1.0) - 0.5)
    fv = np.abs(((lv * 5) % 1.0) - 0.5)
    near_edge = (np.minimum(lu, 1 - lu) < 0.05) | (np.minimum(lv, 1 - lv) < 0.07)
    rivet = (1 - smoothstep(0.03, 0.05, np.sqrt(fu ** 2 + fv ** 2))) * near_edge
    t.albedo = base * (0.35 + 0.65 * T["mask"][..., None]) * (1 - rivet[..., None] * 0.25)
    t.height = np.clip(0.3 + T["height"] * 0.5 + (T["rnd"] - 0.5) * 0.06 + weave * 0.02 - rivet * 0.12 - sc * 0.04, 0, 1)
    t.rough = np.clip(0.55 + soot * 0.2 + edge_dirt * 0.15 + hf * 0.06 - sc * 0.1, 0, 1)
    t.normal_strength = 5.0


@tex("hull_blanket", 1024)
def hull_blanket(t):
    """Quilted thermal blanket tiles (white beta-cloth pillows) as seen on the Ranger flanks."""
    n = t.n
    T = tiles(n, 4, 4, gap=0.02, bevel=0.14, offset_rows=0.0, seed=511)
    u, v = grid_uv(n)
    lu, lv = T["u"] - 0.5, T["v"] - 0.5
    pil = (np.clip(1 - (np.abs(lu) * 2) ** 3, 0, 1) * np.clip(1 - (np.abs(lv) * 2) ** 3, 0, 1)) ** 0.5
    k = 260
    weave = 0.5 + 0.25 * np.sin(u * math.tau * k) + 0.25 * np.sin(v * math.tau * k)
    lf, mf = fbm(n, 2.6, 512), fbm(n, 1.8, 513, fmin=5)
    stitch_u = (np.abs(((u * 4 * 24) % 1.0) - 0.5) < 0.3) & (np.minimum(T["v"], 1 - T["v"]) < 0.045)
    stitch_v = (np.abs(((v * 4 * 24) % 1.0) - 0.5) < 0.3) & (np.minimum(T["u"], 1 - T["u"]) < 0.045)
    stitch = (stitch_u | stitch_v).astype(float)
    base = solid(n, rgb("#d9d7d0")) * (0.88 + 0.15 * T["rnd"][..., None]) * (0.95 + 0.07 * weave[..., None])
    dirt = smoothstep(0.45, 0.9, mf) * 0.6 + (1 - pil) * 0.5
    base = mix(base, base * rgb("#8e8a82"), np.clip(dirt, 0, 1) * 0.55)
    scorch = smoothstep(0.7, 0.95, lf)
    base = mix(base, base * rgb("#b9a98e"), scorch * 0.4)
    t.albedo = base * (0.4 + 0.6 * T["mask"][..., None]) * (1 - stitch[..., None] * 0.2)
    t.height = np.clip(pil * 0.8 * T["mask"] + weave * 0.03 + (T["rnd"] - 0.5) * 0.05, 0, 1)
    t.rough = np.clip(0.82 + weave * 0.08 + dirt * 0.06, 0, 1)
    t.normal_strength = 6.0


@tex("hull_black", 1024)
def hull_black(t):
    """Charcoal structural composite / TPS: fine weave, dusty, scuffed edges."""
    n = t.n
    u, v = grid_uv(n)
    k = 160
    chk = ((np.floor(u * k) + np.floor(v * k)) % 2)
    wu = 0.5 + 0.5 * np.sin(u * math.tau * k * 2)
    wv = 0.5 + 0.5 * np.sin(v * math.tau * k * 2)
    weave = np.where(chk > 0, wu, wv)
    T = tiles(n, 2, 3, gap=0.004, bevel=0.003, offset_rows=0.5, seed=521)
    lf, mf, hf = fbm(n, 2.6, 522), fbm(n, 1.8, 523, fmin=4), fbm(n, 0.5, 524, fmin=60)
    sc = scratches(n, 380, 525, length=(0.005, 0.1))
    dust = smoothstep(0.45, 0.9, mf) * 0.6 + smoothstep(0.6, 0.95, streaks(n, 526)) * 0.3
    base = tone(solid(n, rgb("#2e3033")), lf, 0.3) * (0.9 + 0.14 * T["rnd"][..., None]) * (0.92 + 0.12 * weave[..., None])
    base = mix(base, solid(n, rgb("#77726a")), np.clip(dust, 0, 1) * 0.45)
    base = mix(base, solid(n, rgb("#8f9092")), sc * 0.4)
    t.albedo = base * (0.5 + 0.5 * T["mask"][..., None])
    t.height = np.clip(0.35 + T["height"] * 0.4 + weave * 0.05 - sc * 0.08, 0, 1)
    t.rough = np.clip(0.6 + dust * 0.25 - sc * 0.1 + hf * 0.06, 0, 1)
    t.metal = np.clip(0.15 + sc * 0.5, 0, 1)
    t.normal_strength = 4.0


@tex("hull_tiles", 1024)
def hull_tiles(t):
    """Dark ceramic thermal-protection tiles for under-surfaces."""
    n = t.n
    T = tiles(n, 6, 6, gap=0.03, bevel=0.02, offset_rows=0.5, seed=531)
    lf, hf = fbm(n, 2.6, 532), fbm(n, 0.6, 533, fmin=40)
    burn = smoothstep(0.45, 0.9, streaks(n, 534, 1.4))
    base = solid(n, rgb("#2a2b2d")) * (0.75 + 0.5 * T["rnd"][..., None]) * (0.92 + 0.14 * hf[..., None])
    base = mix(base, solid(n, rgb("#6d675f")), burn * 0.5)
    repl = smoothstep(0.93, 0.95, cell_random(T["ids"], 535))
    base = mix(base, solid(n, rgb("#55575a")), repl * T["mask"] * 0.7)
    t.albedo = base * (0.35 + 0.65 * T["mask"][..., None])
    t.height = np.clip(T["height"] * 0.8 + (T["rnd"] - 0.5) * 0.08, 0, 1)
    t.rough = np.clip(0.7 + hf * 0.15 + burn * 0.1, 0, 1)
    t.normal_strength = 6.0


@tex("radiator", 512)
def radiator(t):
    n = t.n
    u, v = grid_uv(n)
    k = 14
    lv = (v * k) % 1.0
    slat = smoothstep(0.0, 0.5, lv) * (1 - smoothstep(0.82, 0.9, lv))
    hf, lf = fbm(n, 0.6, 541, fmin=30), fbm(n, 2.6, 542)
    dust = smoothstep(0.4, 0.9, fbm(n, 2.0, 543))
    base = tone(solid(n, rgb("#3b3d41")), lf, 0.25) * (0.5 + 0.6 * slat[..., None])
    base = mix(base, solid(n, rgb("#726c63")), dust * 0.3)
    t.albedo = base
    t.height = slat
    t.rough = np.clip(0.5 + dust * 0.3 + hf * 0.08, 0, 1)
    t.metal = np.clip(0.7 - dust * 0.4, 0, 1)
    t.normal_strength = 11.0


@tex("thruster_metal", 1024)
def thruster_metal(t):
    """Heat-discoloured nozzle alloy: straw -> purple -> blue bands along V."""
    n = t.n
    u, v = grid_uv(n)
    w = fbm(n, 2.2, 551) * 0.25
    x = np.clip(v + w - 0.12, 0, 1)
    stops = [(0.0, "#3a3633"), (0.2, "#6a5a48"), (0.4, "#8c6a3f"), (0.55, "#7a4a5c"), (0.7, "#4a4f86"), (0.85, "#6f8290"), (1.0, "#9a9c9e")]
    alb = np.zeros((n, n, 3))
    for (a, ca), (b, cb) in zip(stops[:-1], stops[1:]):
        m = ((x >= a) & (x <= b))[..., None]
        tt = np.clip((x - a) / (b - a), 0, 1)[..., None]
        alb = np.where(m, rgb(ca) * (1 - tt) + rgb(cb) * tt, alb)
    br = fbm(n, 0.9, 552, fmin=10, aniso=(0.012, 1.0))
    soot = smoothstep(0.5, 0.95, streaks(n, 553)) * (1 - x)
    alb = tone(alb, br, 0.3)
    t.albedo = mix(alb, solid(n, rgb("#1e1c1b")), np.clip(soot + (1 - smoothstep(0.0, 0.2, x)) * 0.6, 0, 1) * 0.8)
    t.height = 0.5 + (br - 0.5) * 0.15
    t.rough = np.clip(0.38 + soot * 0.4 + br * 0.12, 0, 1)
    t.metal = np.clip(0.95 - soot * 0.6, 0, 1)
    t.normal_strength = 2.0


@tex("screen_grid", 512)
def screen_grid(t):
    """Unpowered LCD panel surface."""
    n = t.n
    hf = fbm(n, 0.5, 561, fmin=60)
    sm = smoothstep(0.55, 0.9, fbm(n, 2.2, 562))
    t.albedo = solid(n, rgb("#0c0e10")) * (0.9 + 0.2 * hf[..., None]) + sm[..., None] * 0.03
    t.height = np.ones((n, n)) * 0.5
    t.rough = np.clip(0.12 + sm * 0.25, 0, 1)
    t.normal_strength = 0.5


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    scale = 1.0
    for a in sys.argv[1:]:
        if a.startswith("--scale="):
            scale = float(a.split("=")[1])
    names = args or list(REG.keys())
    for name in names:
        fn, size = REG[name]
        t0 = time.time()
        ts = TexSet(name, int(size * scale))
        fn(ts)
        ts.save(OUT)
        print(f"  {name:18s} {ts.n}px  {time.time() - t0:5.1f}s")
    print(f"wrote {len(names)} texture sets to {OUT}")


if __name__ == "__main__":
    main()
