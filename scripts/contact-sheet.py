#!/usr/bin/env python3
"""Simulate the judge's contact sheet: cover on top (width 768), the other
three in a row below, total 768x480, JPEG quality ~80. Also export a
grayscale version to check the value structure still reads.
Usage: python3 scripts/contact-sheet.py
Writes: shots-contact-sheet.jpg and shots-contact-sheet-gray.jpg (repo root,
outside screenshots/ — evidence only, never submitted).
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SHOTS = ["1-cover.jpg", "2-mission.jpg", "3-night.jpg", "4-start.jpg"]

W, H = 768, 480
COVER_H = 300
ROW_H = H - COVER_H
CELL_W = W // 3

sheet = Image.new("RGB", (W, H), (10, 10, 14))
cover = Image.open(os.path.join(REPO, "screenshots", SHOTS[0])).convert("RGB")
cover = cover.resize((W, COVER_H), Image.LANCZOS)
sheet.paste(cover, (0, 0))
for i, name in enumerate(SHOTS[1:]):
    im = Image.open(os.path.join(REPO, "screenshots", name)).convert("RGB")
    im = im.resize((CELL_W, ROW_H), Image.LANCZOS)
    sheet.paste(im, (i * CELL_W, COVER_H))

sheet.save(os.path.join(REPO, "shots-contact-sheet.jpg"), "JPEG", quality=80)
sheet.convert("L").save(os.path.join(REPO, "shots-contact-sheet-gray.jpg"), "JPEG", quality=80)
print("wrote shots-contact-sheet.jpg + shots-contact-sheet-gray.jpg (768x480)")
for name in SHOTS:
    p = os.path.join(REPO, "screenshots", name)
    print(f"  {name}: {os.path.getsize(p)} bytes")
