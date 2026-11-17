#!/usr/bin/env python3
"""Put two or three pages (or pictures) side by side in one picture, to compare directions.

    python3 /opt/ola/skills/designer/scripts/sheet.py design/a.html design/b.html design/c.html --out design/sheet.png
    python3 /opt/ola/skills/designer/scripts/sheet.py shots/index-before-1280.png shots/index-round2-1280.png --out shots/compare.png --labels "Before,After"

For each page: its first screen at a laptop (1280 x 800) and a phone (390 x 844), made with `ola-page`.
Pictures are used as they are. They are laid out in columns labeled A, B, C (or --labels), the laptop
above the phone, on one sheet, which `ola-page` then renders to --out. With --ask, and when the
`ola-see` command exists, a model looks at the sheet and says which direction is strongest and why
(read its answer as a second opinion, not a verdict). Only Python's standard library.
"""
import argparse, html, shutil, subprocess, sys
from pathlib import Path

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
    work = out.parent / (out.stem + "-parts")
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
        imgs = "".join(f'<img class="{k}" src="{work.name}/{html.escape(f)}" alt="">' for f, k in pics)
        cells.append(f'<section><h2><b>{html.escape(lab)}</b> {html.escape(name)}</h2>{imgs}</section>')
    sheet = out.with_suffix(".sheet.html")
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
