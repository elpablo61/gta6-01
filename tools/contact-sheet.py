#!/usr/bin/env python3
"""Crescent Bay — contact sheet.

Builds screenshots/contact-sheet.jpg (768x480: the cover 768x320 on top,
the other three shots 256x160 each below) plus a grayscale twin
(contact-sheet-gray.jpg) from the four fresh screenshots. The sheet must
stay readable at a glance (the two-second test): the cover is large, the
small shots are cropped to their aspect, never stretched.

Run from the repo root:  python3 tools/contact-sheet.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots")
COVER = (768, 320)
SMALL = (256, 160)
SHEET = (768, 480)
SMALL_NAMES = ["2-mission.jpg", "3-night.jpg", "4-start.jpg"]


def load(name):
    path = os.path.join(SHOTS, name)
    if not os.path.exists(path):
        raise SystemExit(f"missing screenshot: {path} (run node tools/screenshots.mjs first)")
    return Image.open(path).convert("RGB")


def fit(img, size):
    # Cover-crop to the target aspect so nothing stretches.
    tw, th = size
    w, h = img.size
    scale = max(tw / w, th / h)
    img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    x = (img.width - tw) // 2
    y = (img.height - th) // 2
    return img.crop((x, y, x + tw, y + th))


def build(gray=False):
    sheet = Image.new("RGB", SHEET, (12, 12, 16))
    sheet.paste(fit(load("1-cover.jpg"), COVER), (0, 0))
    for i, name in enumerate(SMALL_NAMES):
        sheet.paste(fit(load(name), SMALL), (i * 256, 320))
    if gray:
        sheet = sheet.convert("L").convert("RGB")
    out = os.path.join(SHOTS, "contact-sheet-gray.jpg" if gray else "contact-sheet.jpg")
    sheet.save(out, "JPEG", quality=80)
    print(f"{out}  {os.path.getsize(out) // 1024} KiB")


build(gray=False)
build(gray=True)
