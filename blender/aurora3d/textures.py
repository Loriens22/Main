"""Procedural textures (NumPy / Pillow) consumed by the Blender materials."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .core import TEX_DIR

FONT = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def _save(img: Image.Image, name: str) -> Path:
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    p = TEX_DIR / name
    img.save(p)
    return p


def _height_to_normal(h: np.ndarray, strength: float) -> Image.Image:
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    n = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    rgb = np.stack([(nx / n + 1) / 2, (ny / n + 1) / 2, (nz / n + 1) / 2], -1)
    return Image.fromarray((rgb * 255).astype(np.uint8))


def brushed_normal(size=1024, seed=1) -> Path:
    p = TEX_DIR / "brushed_normal.png"
    if p.exists():
        return p
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1, (size, size))
    # anisotropic blur along x -> brushed streaks
    k = 96
    kernel = np.ones(k) / k
    streak = np.apply_along_axis(lambda r: np.convolve(np.concatenate([r, r[:k]]), kernel, "valid")[:size], 1, noise)
    fine = rng.normal(0, 0.15, (size, size))
    h = streak * 0.8 + fine
    return _save(_height_to_normal(h, 0.9), "brushed_normal.png")


def knurl_normal(size=512) -> Path:
    p = TEX_DIR / "knurl_normal.png"
    if p.exists():
        return p
    y, x = np.mgrid[0:size, 0:size] / size * 2 * math.pi * 24
    h = np.sin(x + y) * np.sin(x - y)
    return _save(_height_to_normal(h, 2.5), "knurl_normal.png")


# ----------------------------------------------------------------- chip die
FILM = (206, 207, 214)
SUB = (16, 18, 26)
UBM = (158, 148, 126)
JJ = (120, 128, 150)


def chip_textures(layout: dict, size=4096) -> tuple[Path, Path]:
    die = layout["die"]
    s = size / die

    def px(x, y):
        return ((x + die / 2) * s, (die / 2 - y) * s)

    base = Image.new("RGB", (size, size), FILM)
    mr = Image.new("RGB", (size, size), (0, int(0.32 * 255), 255))  # G=rough, B=metal
    db, dm = ImageDraw.Draw(base), ImageDraw.Draw(mr)
    SUBMR = (0, int(0.16 * 255), 0)
    FILMMR = (0, int(0.32 * 255), 255)

    def poly(pts, w_total, w_center):
        P = [px(*p) for p in pts]
        db.line(P, fill=SUB, width=max(1, int(w_total * s)), joint="curve")
        dm.line(P, fill=SUBMR, width=max(1, int(w_total * s)), joint="curve")
        db.line(P, fill=FILM, width=max(1, int(w_center * s)), joint="curve")
        dm.line(P, fill=FILMMR, width=max(1, int(w_center * s)), joint="curve")

    def rect(cx, cy, w, h, fill, mrfill, r=0.0):
        x0, y0 = px(cx - w / 2, cy + h / 2)
        x1, y1 = px(cx + w / 2, cy - h / 2)
        if r > 0:
            db.rounded_rectangle([x0, y0, x1, y1], radius=r * s, fill=fill)
            dm.rounded_rectangle([x0, y0, x1, y1], radius=r * s, fill=mrfill)
        else:
            db.rectangle([x0, y0, x1, y1], fill=fill)
            dm.rectangle([x0, y0, x1, y1], fill=mrfill)

    # dicing street
    border = 0.18 * s
    db.rectangle([0, 0, size, size], outline=SUB, width=int(border))
    dm.rectangle([0, 0, size, size], outline=SUBMR, width=int(border))
    for lp in layout["launch_pads"]:
        rect(lp["x"], lp["y"], 0.42, 0.30, SUB, SUBMR, 0.03)
        rect(lp["x"], lp["y"], 0.30, 0.18, FILM, FILMMR, 0.02)
    for res in layout["resonators"]:
        poly(res["pts"], 0.036, 0.016)
    for rs in layout["reset_elements"]:
        poly(rs["pts"], 0.032, 0.014)
        x, y = rs["squid"]
        rect(x, y, 0.07, 0.07, SUB, SUBMR)
        rect(x, y, 0.05, 0.05, FILM, FILMMR)
        rect(x, y, 0.025, 0.025, SUB, SUBMR)
    cw, ch = layout["cutout"]
    pw, ph, pg = layout["pad"]
    for cp in layout["couplers"]:
        poly([cp["p0"], cp["p1"]], 0.075, 0.040)
        x, y = cp["squid"]
        rect(x, y, 0.10, 0.10, SUB, SUBMR)
        rect(x, y, 0.075, 0.075, FILM, FILMMR)
        rect(x, y, 0.035, 0.035, SUB, SUBMR)
        fx, fy = cp["flux_bump"]
        poly([(x, y), (fx, fy)], 0.03, 0.012)
    # feedlines drawn over couplers: crossings are carried by airbridges
    # feedlines (exaggerated CPW: 60 µm total, 30 µm centre)
    for fl in layout["feedlines"]:
        poly(fl["pts"], 0.064, 0.030)
    for q in layout["qubits"]:
        x, y = q["x"], q["y"]
        rect(x, y, cw, ch, SUB, SUBMR, 0.04)
        rect(x, y + (ph + pg) / 2, pw, ph, FILM, FILMMR, 0.02)
        rect(x, y - (ph + pg) / 2, pw, ph, FILM, FILMMR, 0.02)
        rect(x, y, 0.012, pg + 0.02, JJ, (0, 60, 200))
    for b in layout["signal_bumps"]:
        x, y = px(b["x"], b["y"])
        r = 0.045 * s
        db.ellipse([x - r, y - r, x + r, y + r], fill=UBM)
        dm.ellipse([x - r, y - r, x + r, y + r], fill=(0, 90, 200))
    for b in layout["ground_bumps"]:
        x, y = px(b["x"], b["y"])
        r = 0.04 * s
        db.ellipse([x - r, y - r, x + r, y + r], fill=UBM)
        dm.ellipse([x - r, y - r, x + r, y + r], fill=(0, 90, 200))
    # labels and alignment marks
    font = ImageFont.truetype(FONT, int(0.42 * s))
    small = ImageFont.truetype(MONO, int(0.20 * s))
    db.text(px(-die / 2 + 0.7, -die / 2 + 1.1), "AURORA-Q  T1", font=font, fill=SUB)
    db.text(px(-die / 2 + 0.7, -die / 2 + 0.55), "120Q · 218C · 120R · rev A · 2026 · DESIGN STUDY", font=small, fill=SUB)
    for (cx, cy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = cx * (die / 2 - 0.45), cy * (die / 2 - 0.45)
        rect(x, y, 0.30, 0.04, SUB, SUBMR)
        rect(x, y, 0.04, 0.30, SUB, SUBMR)
    base = base.filter(ImageFilter.GaussianBlur(0.6))
    return _save(base, "chip_base.png"), _save(mr, "chip_mr.png")


# ------------------------------------------------------------------ PCB board
def pcb_texture(size=2048, board_w=96.0, board_h=104.0, window=(30.0, 30.0), n_conn=48) -> tuple[Path, Path]:
    """Soldermask board with radial gold fan-out traces from the chip window to edge connectors."""
    base = Image.new("RGB", (size, int(size * board_h / board_w)), (8, 44, 108))
    W, H = base.size
    mr = Image.new("RGB", (W, H), (0, int(0.32 * 255), 0))
    db, dm = ImageDraw.Draw(base), ImageDraw.Draw(mr)
    sx = W / board_w

    def P(x, y):
        return ((x + board_w / 2) * sx, (board_h / 2 - y) * sx)

    gold = (226, 184, 92)
    goldmr = (0, int(0.25 * 255), 255)
    rng = np.random.default_rng(4)
    # ground pour pattern (via fence)
    for x in np.arange(-board_w / 2 + 3, board_w / 2 - 2, 2.0):
        for y in (-board_h / 2 + 2.5, board_h / 2 - 2.5):
            cx, cy = P(x, y)
            r = 0.35 * sx
            db.ellipse([cx - r, cy - r, cx + r, cy + r], fill=gold)
            dm.ellipse([cx - r, cy - r, cx + r, cy + r], fill=goldmr)
    wx, wy = window
    for side in range(4):
        for i in range(n_conn // 4):
            t = (i + 0.5) / (n_conn // 4) - 0.5
            if side in (0, 1):
                ex = (-1 if side == 0 else 1) * (board_w / 2 - 5)
                ey = t * (board_h - 30)
                sxp = (-1 if side == 0 else 1) * (wx / 2 + 1)
                syp = t * (wy - 6)
            else:
                ey = (-1 if side == 2 else 1) * (board_h / 2 - 5)
                ex = t * (board_w - 34)
                syp = (-1 if side == 2 else 1) * (wy / 2 + 1)
                sxp = t * (wx - 6)
            midx, midy = (ex + sxp) / 2, (ey + syp) / 2
            pts = [P(sxp, syp), P(midx + (rng.random() - 0.5) * 2, midy), P(ex, ey)]
            db.line(pts, fill=gold, width=int(0.5 * sx), joint="curve")
            dm.line(pts, fill=goldmr, width=int(0.5 * sx), joint="curve")
            cx, cy = P(ex, ey)
            r = 1.3 * sx
            db.ellipse([cx - r, cy - r, cx + r, cy + r], fill=gold)
            dm.ellipse([cx - r, cy - r, cx + r, cy + r], fill=goldmr)
            # stitching vias along trace
            for k in range(1, 6):
                vx = sxp + (ex - sxp) * k / 6
                vy = syp + (ey - syp) * k / 6
                for off in (-1.1, 1.1):
                    ox, oy = (off, 0) if side >= 2 else (0, off)
                    cx, cy = P(vx + ox, vy + oy)
                    rr = 0.22 * sx
                    db.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(180, 150, 80))
    # silkscreen
    font = ImageFont.truetype(MONO, int(1.6 * sx))
    db.text(P(-board_w / 2 + 4, -board_h / 2 + 9), "AQ-T1-MB  rev A  2026-10", font=font, fill=(230, 232, 236))
    db.text(P(board_w / 2 - 26, board_h / 2 - 6), "SA-002  94V-0", font=font, fill=(230, 232, 236))
    return _save(base, "pcb_base.png"), _save(mr, "pcb_mr.png")
