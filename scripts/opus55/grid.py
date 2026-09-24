#!/usr/bin/env python3
"""Tile images into a contact sheet: grid.py out.png a.png b.png ... (3 columns)."""
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
cols = 3 if len(ims) > 4 else 2; w = 600; h = int(w * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * h + (rows - 1) * 6), 'white')
for i, im in enumerate(ims): s.paste(im.resize((w, h)), ((i % cols) * (w + 6), (i // cols) * (h + 6)))
s.save(out); print('sheet:', out)
