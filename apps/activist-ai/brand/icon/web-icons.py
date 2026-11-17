#!/usr/bin/env python3
"""The web app's icons, made from Bart's masters in this folder (README: "Web / favicon").

    python3 brand/icon/web-icons.py        (from apps/activist-ai; needs Pillow)

Writes into web/public/, which the build copies to web/dist and the front desk serves:
  favicon.svg            the full-bleed master itself (browsers that take an SVG icon)
  favicon.ico            16, 32 and 48 in one file (browsers that ask for /favicon.ico)
  favicon-16.png, favicon-32.png, favicon-48.png
  apple-touch-icon.png   180 (iOS masks the corners itself, so full bleed)
  icon-192.png, icon-512.png   for manifest.webmanifest
Everything is made from ola-icon-fullbleed-1024.png, scaled down with Lanczos; nothing is drawn here.
"""
import shutil
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'web' / 'public'
master = Image.open(HERE / 'ola-icon-fullbleed-1024.png').convert('RGBA')
assert master.size == (1024, 1024), master.size


def size(n: int) -> Image.Image:
    return master.resize((n, n), Image.LANCZOS)


shutil.copyfile(HERE / 'ola-icon-fullbleed.svg', OUT / 'favicon.svg')
for n in (16, 32, 48):
    size(n).save(OUT / f'favicon-{n}.png', optimize=True)
size(48).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
size(180).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
for n in (192, 512):
    size(n).save(OUT / f'icon-{n}.png', optimize=True)
print(f'wrote the icons to {OUT}')
