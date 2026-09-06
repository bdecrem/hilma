#!/usr/bin/env python3
"""Generate the Jambot app icon (and a preview strip) with Pillow.

Desk-instrument look, matching src/app/jam/jam.css:
  putty enamel #e3e4dc, ink #14161a wordmark, 909-orange #ff5a1f LED after
  the T (never a period), a 16-step LED strip motif (orange/cobalt/ink)
  below the wordmark.

Run: python3 branding/make_icon.py
Writes:
  branding/icon-1024.png                (source of truth)
  Jambot/Assets.xcassets/AppIcon.appiconset/icon-*.png  (all required sizes)
  branding/preview-60.png / -120.png / -180.png (for eyeball-checking legibility)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ICONSET = os.path.join(ROOT, "Jambot/Assets.xcassets/AppIcon.appiconset")

PUTTY = (0xE3, 0xE4, 0xDC)
PUTTY_LIGHT = (0xF3, 0xF3, 0xEE)
INK = (0x14, 0x16, 0x1A)
ORANGE = (0xFF, 0x5A, 0x1F)
COBALT = (0x2C, 0x5B, 0xFF)
HAIRLINE = (0xB6, 0xBA, 0xB1)

SIZE = 1024

FONT_CANDIDATES = [
    "/System/Library/Fonts/DIN Condensed Bold.ttf",
    "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    # Fallback: Helvetica bold, still legible even if not condensed.
    return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=1)


def radial_light(draw: ImageDraw.ImageDraw, size: int):
    """Very subtle top-left light gradient over the putty base."""
    cx, cy = size * 0.28, size * 0.22
    max_r = size * 1.05
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = max_r * t
        # blend PUTTY -> PUTTY_LIGHT near the light source
        amt = (1 - t) * 0.55
        col = tuple(int(PUTTY[c] + (PUTTY_LIGHT[c] - PUTTY[c]) * amt) for c in range(3))
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, fill=col)


def draw_led_strip(img: Image.Image, top: int, cell: int, gap: int, margin: int):
    """Three rows of 16 cells: orange / cobalt / ink, some lit, rest dim."""
    draw = ImageDraw.Draw(img, "RGBA")
    rows = [
        (ORANGE, [0, 4, 8, 12]),          # kick-ish, four on the beat
        (COBALT, [4, 12]),                 # snare-ish, backbeat
        (INK, [i for i in range(16) if i % 2 == 0]),  # hats-ish
    ]
    dim = (0, 0, 0, 40)
    n = 16
    total_w = n * cell + (n - 1) * gap
    x0 = (SIZE - total_w) // 2
    for ri, (color, lit) in enumerate(rows):
        y = top + ri * (cell + gap)
        for i in range(n):
            x = x0 + i * (cell + gap)
            fill = color + (255,) if i in lit else dim
            radius = max(3, cell // 4)
            draw.rounded_rectangle([x, y, x + cell, y + cell], radius=radius, fill=fill)


def build_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), PUTTY)
    draw = ImageDraw.Draw(img)
    radial_light(draw, SIZE)

    # 1px (at 1024 scale ~ 3px) inner hairline, inset from the edge.
    inset = 14
    draw.rectangle([inset, inset, SIZE - 1 - inset, SIZE - 1 - inset], outline=HAIRLINE, width=3)

    # Wordmark "JAMBOT" — condensed black uppercase, centered.
    font_size = 300
    font = load_font(font_size)
    word = "JAMBOT"
    bbox = draw.textbbox((0, 0), word, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    led_r = int(font_size * 0.11)
    gap_after_word = int(font_size * 0.10)
    block_w = text_w + gap_after_word + led_r * 2
    start_x = (SIZE - block_w) // 2
    text_y = int(SIZE * 0.40) - text_h // 2 - bbox[1]

    draw.text((start_x - bbox[0], text_y), word, font=font, fill=INK)

    # Raised orange LED right after the T — never a period: a glowing disc,
    # lifted above the text baseline like a cap-height accent, not sitting
    # on the baseline the way a period would.
    text_right = start_x - bbox[0] + text_w
    led_cx = text_right + gap_after_word + led_r
    baseline_y = text_y + bbox[1] + text_h  # visual baseline-ish (descender-free caps)
    cap_top_y = text_y + bbox[1]
    led_cy = cap_top_y + int((baseline_y - cap_top_y) * 0.30)  # raised toward cap height

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for gr, alpha in [(led_r * 2.6, 40), (led_r * 1.9, 70), (led_r * 1.3, 120)]:
        gdraw.ellipse(
            [led_cx - gr, led_cy - gr, led_cx + gr, led_cy + gr],
            fill=ORANGE + (alpha,),
        )
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)
    draw.ellipse([led_cx - led_r, led_cy - led_r, led_cx + led_r, led_cy + led_r], fill=ORANGE)
    # subtle top-left highlight on the LED for a "raised" feel
    hi_r = led_r * 0.35
    hi_cx, hi_cy = led_cx - led_r * 0.32, led_cy - led_r * 0.32
    draw.ellipse([hi_cx - hi_r, hi_cy - hi_r, hi_cx + hi_r, hi_cy + hi_r], fill=(255, 200, 180))

    # 16-step LED strip motif, three rows, below the wordmark.
    cell = 34
    gap = 14
    strip_h = 3 * cell + 2 * gap
    strip_top = int(SIZE * 0.62)
    draw_led_strip(img, strip_top, cell, gap, margin=0)

    return img


def export_sizes(icon_1024: Image.Image):
    sizes = {
        "icon-40.png": 40,
        "icon-58.png": 58,
        "icon-60.png": 60,
        "icon-80.png": 80,
        "icon-87.png": 87,
        "icon-120.png": 120,
        "icon-180.png": 180,
        "icon-1024.png": 1024,
    }
    os.makedirs(ICONSET, exist_ok=True)
    for name, px in sizes.items():
        resized = icon_1024.resize((px, px), Image.LANCZOS)
        resized.save(os.path.join(ICONSET, name))
    print(f"Wrote {len(sizes)} sizes into {ICONSET}")


def export_previews(icon_1024: Image.Image):
    for px in (60, 120, 180):
        icon_1024.resize((px, px), Image.LANCZOS).save(os.path.join(HERE, f"preview-{px}.png"))
    icon_1024.save(os.path.join(HERE, "icon-1024.png"))
    print("Wrote previews (60/120/180) and branding/icon-1024.png")


if __name__ == "__main__":
    icon = build_icon()
    export_sizes(icon)
    export_previews(icon)
