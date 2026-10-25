#!/usr/bin/env python3
"""Placeholder app icon: one sequencer page of the 12-bar form, bar 1 lit (now), bar 2 cued (next).

    python3 apps/takt/scripts/icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "Takt/Assets.xcassets/AppIcon.appiconset/icon-1024.png"

S = 1024
GROUND, PANEL, LINE = "#0D0D0D", "#181818", "#2A2A2A"
SIGNAL, CUE = "#FF5A1F", "#8FB3FF"

# 4 x 3 pads in a 720-wide block: side = (720 - 3*24) / 4 = 162, block height = 3*162 + 2*24 = 534,
# so the block sits at x = (1024 - 720) / 2 = 152, y = (1024 - 534) / 2 = 245.
SIDE, GAP, R = 162, 24, 14
X0, Y0 = (S - (4 * SIDE + 3 * GAP)) // 2, (S - (3 * SIDE + 2 * GAP)) // 2

img = Image.new("RGB", (S, S), GROUND)
d = ImageDraw.Draw(img)
for row in range(3):
    for col in range(4):
        x, y = X0 + col * (SIDE + GAP), Y0 + row * (SIDE + GAP)
        box = (x, y, x + SIDE, y + SIDE)
        i = row * 4 + col
        if i == 0:
            d.rounded_rectangle(box, R, fill=SIGNAL)
        elif i == 1:
            d.rounded_rectangle(box, R, fill=PANEL, outline=CUE, width=6)
            inset, leg = 16, 30
            bx, by = x + SIDE - inset, y + SIDE - inset
            d.polygon([(bx, by - leg), (bx, by), (bx - leg, by)], fill=CUE)
        else:
            d.rounded_rectangle(box, R, fill=PANEL, outline=LINE, width=3)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT)
print(OUT)
