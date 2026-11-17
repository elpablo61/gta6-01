#!/usr/bin/env python3
"""Compose the four screenshots exactly as the make.fun judge sees them:
cover large on top, the other three in a row beneath, 768x480 total,
JPEG quality ~80 — plus a grayscale twin. Look at both and confirm the
two-second readability test before reporting done: in two seconds a
stranger must be able to say city, player car, police chase, mission,
minimap."""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
OUT = ROOT / "shots-contact-sheet.jpg"
OUT_GRAY = ROOT / "shots-contact-sheet-gray.jpg"

W, H = 768, 480
COVER_H = 300
ROW_H = 168
GAP = 6

def load(name):
    img = Image.open(SHOTS / name).convert("RGB")
    return img

cover = load("1-cover.jpg").resize((W, COVER_H), Image.LANCZOS)
row_names = ["2-mission.jpg", "3-night.jpg", "4-start.jpg"]
cell_w = (W - 2 * GAP) // 3
row = [load(n).resize((cell_w, ROW_H), Image.LANCZOS) for n in row_names]

sheet = Image.new("RGB", (W, H), (255, 255, 255))
sheet.paste(cover, (0, 0))
for i, cell in enumerate(row):
    sheet.paste(cell, (i * (cell_w + GAP), COVER_H + GAP))

sheet.save(OUT, "JPEG", quality=80)
sheet.convert("L").convert("RGB").save(OUT_GRAY, "JPEG", quality=80)
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
print(f"wrote {OUT_GRAY} ({OUT_GRAY.stat().st_size} bytes)")
for name in ["1-cover.jpg", "2-mission.jpg", "3-night.jpg", "4-start.jpg"]:
    p = SHOTS / name
    print(f"{name}: {p.stat().st_size} bytes")
