# Made-up pictures for the specialist checks (ola-see, ola-ocr): a scanned page and a bar chart.
# Every name, date and number on them is invented. Run on a machine with Pillow (the Mac mini has
# it); the PNGs are committed, so the checks themselves need nothing but the files.
#   python3 mkimages.py <out dir>      writes scan-minutes.png and chart-hours.png
import os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out = sys.argv[1] if len(sys.argv) > 1 else "."
font = lambda n: ImageFont.load_default(size=n)

# A scanned page: minutes of a made-up meeting, a little crooked, grey and speckled.
page = Image.new("L", (1100, 1400), 246)
d = ImageDraw.Draw(page)
lines = [
    (34, "Maple Court Tenants Group"),
    (26, "Minutes of the meeting of 9 October 2031"),
    (22, ""),
    (22, "Present: 14 members. Chair: Ines Varga. Notes: Tomas Brandt."),
    (22, ""),
    (22, "1. The boiler in Block C has failed three times since August."),
    (22, "2. Motion: ask the landlord for a written repair date by 1 November."),
    (22, "   Proposed by Ana Lindqvist, seconded by Ravi Okafor."),
    (22, "   Vote: 11 for, 2 against, 1 abstained. The motion passed."),
    (22, "3. Next meeting: 6 November 2031, in the community room."),
]
y = 120
for size, text in lines:
    d.text((110, y), text, fill=30, font=font(size))
    y += int(size * 2.1)
rng = random.Random(7)
for _ in range(2500):
    x, yy = rng.randrange(1100), rng.randrange(1400)
    page.putpixel((x, yy), rng.choice([120, 160, 200]))
page = page.rotate(1.2, fillcolor=246, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
page.save(os.path.join(out, "scan-minutes.png"), optimize=True)

# A bar chart: volunteer hours by month, made up.
data = [("Jan", 42), ("Feb", 57), ("Mar", 96), ("Apr", 31), ("May", 64)]
w, h = 900, 600
c = Image.new("RGB", (w, h), (255, 255, 255))
d = ImageDraw.Draw(c)
d.text((60, 24), "Volunteer hours by month, 2031 (made-up)", fill=(20, 20, 20), font=font(28))
x0, y0, top = 90, 520, 110
d.line((x0, top, x0, y0), fill=(60, 60, 60), width=2)
d.line((x0, y0, w - 40, y0), fill=(60, 60, 60), width=2)
scale = (y0 - top) / 100
for v in (0, 25, 50, 75, 100):
    yy = y0 - v * scale
    d.line((x0 - 6, yy, x0, yy), fill=(60, 60, 60), width=2)
    d.text((x0 - 50, yy - 10), str(v), fill=(60, 60, 60), font=font(18))
bw = 100
for i, (m, v) in enumerate(data):
    bx = x0 + 40 + i * (bw + 50)
    d.rectangle((bx, y0 - v * scale, bx + bw, y0), fill=(46, 94, 170))
    d.text((bx + 30, y0 + 12), m, fill=(20, 20, 20), font=font(20))
    d.text((bx + 34, y0 - v * scale - 28), str(v), fill=(20, 20, 20), font=font(18))
c.save(os.path.join(out, "chart-hours.png"), optimize=True)
