# Lay screenshots side by side at a fraction of their size: strip.py out.png a.png b.png …
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f) for f in files]
s = 0.36
w, h = int(ims[0].size[0] * s), int(ims[0].size[1] * s)
o = Image.new('RGB', (len(ims) * (w + 8), h), 'white')
for k, im in enumerate(ims): o.paste(im.resize((w, h)), (k * (w + 8), 0))
o.save(out)
