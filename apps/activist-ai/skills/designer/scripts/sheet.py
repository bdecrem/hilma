#!/usr/bin/env python3
"""Put two or three pages (or pictures) side by side in one picture, to compare directions.

    python3 /opt/ola/skills/designer/scripts/sheet.py design/a.html design/b.html design/c.html --out design/sheet.png
    python3 /opt/ola/skills/designer/scripts/sheet.py shots/index-before-1280.png shots/index-round2-1280.png --out shots/compare.png --labels "Before,After"

For each page: its first screen at a laptop (1280 x 800) and a phone (390 x 844), made with `ola-page`.
Pictures are used as they are. They are laid out in columns labeled A, B, C (or --labels), the laptop
above the phone, on one sheet, which `ola-page` then renders to --out. With --ask, and when the
`ola-see` command exists, a model looks at the sheet and says which direction is strongest and why
(read its answer as a second opinion, not a verdict). Only Python's standard library.

Pages that are one layout in different fonts and colors are not different concepts: sheet.py measures
where each laptop first screen has something on it and, when two pages are laid out alike, names them
and exits 3 ("A and B have the same layout"). Rebuild one from another layout (references/concepts.md)
and run it again. Its working files go in a hidden folder beside --out, so the person's project lists
only the pages themselves.
"""
import argparse, html, itertools, shutil, struct, subprocess, sys, zlib
from pathlib import Path

# Two laptop first screens whose coarse ink maps correlate this much or more are one layout. Measured on
# three "concepts" that were one page in three palettes (0.87, 0.48, 0.45) and on screens that are laid
# out differently (at most 0.22).
SAME_LAYOUT = 0.4


def png_gray(path):
    """A PNG (8-bit gray, gray+alpha, RGB or RGBA, not interlaced) as (width, height, rows of gray values)."""
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, w, h, bpp = 8, [], 0, 0, 0
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, color, _, _, inter = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or color not in (0, 2, 4, 6) or inter:
                raise ValueError("an unusual PNG")
            bpp = {0: 1, 2: 3, 4: 2, 6: 4}[color]
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"IEND":
            break
        pos += 12 + n
    raw = zlib.decompress(b"".join(idat))
    stride = w * bpp
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f, line = raw[i], bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        rows.append([(line[x] * 3 + line[x + 1] * 6 + line[x + 2]) // 10 for x in range(0, stride, bpp)] if bpp >= 3 else [line[x] for x in range(0, stride, bpp)])
    return w, h, rows


def ink_map(path, cols=40, lines=25, fx=4, fy=3):
    """Where a first screen has something on it: the share of pixels unlike the page's own background,
    in a 40 x 25 grid, then pooled into larger blocks so a line that wraps a little later does not count."""
    w, h, rows = png_gray(path)
    hist = {}
    for r in rows[::4]:
        for v in r[::4]:
            hist[v // 8] = hist.get(v // 8, 0) + 1
    bg = max(hist, key=hist.get) * 8 + 4
    cells = []
    for gy in range(lines):
        y0, y1 = gy * h // lines, (gy + 1) * h // lines
        for gx in range(cols):
            x0, x1 = gx * w // cols, (gx + 1) * w // cols
            n = on = 0
            for y in range(y0, y1, 2):
                r = rows[y]
                for x in range(x0, x1, 2):
                    n += 1
                    on += abs(r[x] - bg) > 24
            cells.append(on / n if n else 0)
    return [sum(cells[(gy + j) * cols + gx + i] for j in range(fy) for i in range(fx)) / (fx * fy)
            for gy in range(0, lines - fy + 1, fy) for gx in range(0, cols - fx + 1, fx)]


def alike(a, b):
    """How alike two ink maps are laid out: their correlation, -1 to 1."""
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) ** 0.5
    vb = sum((y - mb) ** 2 for y in b) ** 0.5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb) if va and vb else 1.0


def same_layouts(laptops):
    """laptops: [(label, png)]. The pairs laid out alike, as (label, label, score)."""
    maps = [(lab, ink_map(p)) for lab, p in laptops]
    return [(x[0], y[0], round(alike(x[1], y[1]), 2)) for x, y in itertools.combinations(maps, 2) if alike(x[1], y[1]) >= SAME_LAYOUT]

ASK = ("These are {n} versions of the first screen of the same web page, side by side, labeled {letters}; in each column the laptop view "
       "is above the phone view. Judge them as a senior designer with restrained, independent taste. For each version write one line: "
       "its main visual idea, and its biggest weakness. Count against a version: decoration that says nothing about the subject (gradients, "
       "glows, rounded cards everywhere, sparkles, abstract shapes, emoji), a colored or italic phrase in the headline, several accent colors, "
       "type that is too big or cramped, or a bare default look (white page, one plain blue, no clear order). Count for it: one clear idea "
       "taken from the subject, an obvious first thing to look at, confident type at a professional size, a small calm palette, real content. "
       "End with one line exactly like: Best: A")


def render(page, width, height, out):
    p = subprocess.run(["ola-page", str(page), "--width", str(width), "--height", str(height), "--viewport", "--out", str(out)],
                       capture_output=True, text=True, timeout=200)
    if p.returncode != 0:
        raise SystemExit(f"sheet.py: could not render {page} at {width} px: {p.stderr.strip()[:300]}")


def main():
    ap = argparse.ArgumentParser(prog="sheet.py")
    ap.add_argument("items", nargs="+", help="pages (.html) or pictures (.png, .jpg)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--labels", help="comma-separated labels, default A, B, C")
    ap.add_argument("--phone", default="390x844")
    ap.add_argument("--laptop", default="1280x800")
    ap.add_argument("--ask", action="store_true", help="ask ola-see which is strongest")
    a = ap.parse_args()
    if not 1 <= len(a.items) <= 4:
        print("sheet.py: one to four items")
        return 2
    out = Path(a.out).resolve()
    # Hidden, so Ola's home lists the person's pages and not this sheet's parts (a "Compare" page).
    work = out.parent / f".{out.stem}-parts"
    work.mkdir(parents=True, exist_ok=True)
    labels = [s.strip() for s in a.labels.split(",")] if a.labels else [chr(65 + i) for i in range(len(a.items))]
    cols = []
    for i, item in enumerate(a.items):
        src = Path(item).resolve()
        if not src.exists():
            print(f"sheet.py: no such file: {item}")
            return 2
        pics = []
        if src.suffix.lower() in (".html", ".htm"):
            for kind, size in (("laptop", a.laptop), ("phone", a.phone)):
                w, h = (int(x) for x in size.split("x"))
                dest = work / f"{i}-{kind}.png"
                render(src, w, h, dest)
                pics.append((dest.name, kind))
        else:
            dest = work / f"{i}-{src.name}"
            shutil.copyfile(src, dest)
            pics.append((dest.name, "picture"))
        cols.append((labels[i] if i < len(labels) else chr(65 + i), src.name, pics))
    colw = 640 if len(cols) <= 2 else 560
    cells = []
    for lab, name, pics in cols:
        imgs = "".join(f'<img class="{k}" src="{html.escape(f)}" alt="">' for f, k in pics)
        cells.append(f'<section><h2><b>{html.escape(lab)}</b> {html.escape(name)}</h2>{imgs}</section>')
    sheet = work / "sheet.html"
    sheet.write_text(f"""<!doctype html><meta charset="utf-8"><title>Compare</title><style>
body {{ margin: 0; padding: 24px; background: #e9e7e3; font: 15px/1.3 system-ui, sans-serif; color: #222; }}
main {{ display: grid; grid-template-columns: repeat({len(cols)}, {colw}px); gap: 24px; align-items: start; }}
h2 {{ font-size: 15px; font-weight: 400; margin: 0 0 8px; }} h2 b {{ font-size: 20px; margin-right: 6px; }}
img {{ display: block; width: 100%; background: #fff; box-shadow: 0 0 0 1px #0002; margin-bottom: 16px; }}
img.phone {{ width: 58%; }}
</style><main>{''.join(cells)}</main>""")
    width = min(3000, 48 + len(cols) * colw + (len(cols) - 1) * 24)
    p = subprocess.run(["ola-page", str(sheet), "--width", str(width), "--out", str(out)], capture_output=True, text=True, timeout=200)
    if p.returncode != 0:
        print(f"sheet.py: could not make the sheet: {p.stderr.strip()[:300]}")
        return 1
    print(f"Wrote {out}: {', '.join(c[0] + ' = ' + c[1] for c in cols)}. Open it and look before choosing.")
    laptops = [(lab, work / f) for lab, _, pics in cols for f, k in pics if k == "laptop"]
    same = same_layouts(laptops) if len(laptops) > 1 else []
    for x, y, score in same:
        print(f"SAME LAYOUT: {x} and {y} are laid out alike ({score}): one page in two sets of fonts and colors is not two concepts. "
              f"Rebuild {y} from a different layout in /opt/ola/skills/designer/references/concepts.md, then run sheet.py again.")
    if same:
        return 3
    if a.ask:
        see = shutil.which("ola-see")
        if not see:
            print("No ola-see on this computer: judge the sheet from the rules in references/directions.md.")
        else:
            s = subprocess.run([see, str(out), ASK.format(n=len(cols), letters=", ".join(c[0] for c in cols))], capture_output=True, text=True, timeout=300)
            print("What ola-see said (a second opinion, not a verdict):")
            print("\n".join("  " + l for l in (s.stdout or s.stderr).strip().splitlines()[:30]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
