#!/usr/bin/env python3
"""Deal a palette of its own to a Bold page copied from a worked example.

    python3 /opt/ola/skills/designer/scripts/deal.py index.html --for "Maple Street block party, Saturday"

Why (OLA-137, OLA-168): a Bold page starts as a copy of a worked example, and the copy kept the
example's colors. A block party in one project and a street fair in another came out in the same
five colors (candy: plum, butter, bubblegum, periwinkle, mint), with the same drawing. This script
gives the page its own colors in one step, so no request has to remember to.

How. The words given with --for (the page's own title and subject) choose a hue and a scheme. Every
color of the page is moved to the new hues while keeping its lightness, so what reads on what in the
example still reads in the copy (the fields keep their value; the text on them keeps its contrast,
checked and corrected below). The ground (light or night) stays the example's. Pages beside this one
in the same folder are read first, and the new lead hue keeps at least 50 degrees from theirs, and
from the example's own, so two pages of one project never share a look. Every hex color in the file
is rewritten: the :root palette and the colors drawn in the SVG.

Prints the old and new palette and the contrast of each text pair; exits 1 if a pair is still under
its minimum (then run it again with other words in --for), 2 on a usage error.
Only Python's standard library.
"""
import argparse, hashlib, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from palette import SCHEMES, color, hex_to_oklch, luminance, ratio  # noqa: E402

HEX = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
ROOT = re.compile(r":root\s*\{([^}]*)\}", re.S)
VAR = re.compile(r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b")
GAP = 50  # degrees between the lead hue of two pages in one folder


def full(h):
    h = h.lstrip("#").lower()
    return "#" + ("".join(c * 2 for c in h) if len(h) == 3 else h)


def hue_gap(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def root_vars(text):
    m = ROOT.search(text)
    return {k: full(v) for k, v in VAR.findall(m.group(1))} if m else {}


def spots(v):
    return [k for k in sorted(v) if re.fullmatch(r"c\d", k)]


def lead_hue(v):
    """The hue of a page's loudest color: the first spot color with real chroma."""
    for k in spots(v):
        L, C, h = hex_to_oklch(v[k])
        if C > 0.05:
            return h
    return None


def offsets(scheme, n=6):
    offs = [o for o, _l, _d in SCHEMES[scheme]]
    while len(offs) < n:
        offs.append((offs[-1] + 95) % 360)
    return offs


def slop(hue, scheme, k):
    """Teal beside hot pink or magenta: the pair the owner called "AI slop"."""
    hs = [(hue + o) % 360 for o in offsets(scheme)[:k]]
    return any(170 <= h <= 220 for h in hs) and any(h >= 320 or h <= 5 for h in hs)


def choose(words, avoid, k=4):
    """A lead hue and a scheme from the words, away from every hue in `avoid`, never teal with pink."""
    n = int(hashlib.sha256(words.strip().lower().encode()).hexdigest(), 16)
    names = sorted(SCHEMES)
    scheme = names[n % len(names)]
    hue = (n >> 8) % 360
    for i in range(72):
        if all(hue_gap(hue, a) >= GAP for a in avoid) and not slop(hue, scheme, k):
            break
        hue = (hue + 37) % 360
        if i % 9 == 8:
            scheme = names[(names.index(scheme) + 1) % len(names)]
    return hue, scheme


def mover(old, hue, scheme):
    """A function that moves one color of the example to the dealt palette."""
    offs = offsets(scheme)
    targets = {}
    for i, k in enumerate(spots(old)):
        targets[old[k]] = (hue + offs[i]) % 360
    lead = lead_hue(old)

    def move(hx):
        hx = full(hx)
        L, C, h = hex_to_oklch(hx)
        if hx in targets:
            return color(L, max(C, 0.09), targets[hx])
        if C < 0.06:  # a neutral: a dark one (the ink, a night ground) stays; a light paper takes a trace of the new hue
            return hx if L < 0.5 else color(L, C, (hue + 60) % 360)
        # any other color drawn in the page: the same turn as the nearest spot color
        near = min(targets, key=lambda t: hue_gap(hex_to_oklch(t)[2], h), default=None)
        turn = (targets[near] - hex_to_oklch(near)[2]) if near else (hue - (lead or h))
        return color(L, C, (h + turn) % 360)

    return move


def fix_text(p, old):
    """Keep every text pair of the example readable: --on-cN (or --on) and --ink on their grounds."""
    out = []
    for k in spots(p):
        on_key = f"on-{k}" if f"on-{k}" in p else ("on" if "on" in p else "ink")
        need = 4.5
        L, C, h = hex_to_oklch(p[k])
        step = 0.01 if luminance(p[on_key]) < luminance(p[k]) else -0.01
        n = 0
        while ratio(p[on_key], p[k]) < need and n < 50:
            L = min(0.97, max(0.05, L + step))
            p[k] = color(L, C, h)
            n += 1
        out.append((on_key, k, ratio(p[on_key], p[k]), need))
    for fg, bg, need in (("ink", "paper", 7), ("ink-2", "paper", 4.5)):
        if fg in p and bg in p:
            out.append((fg, bg, ratio(p[fg], p[bg]), need))
    return out


def main():
    ap = argparse.ArgumentParser(description="Give a Bold page copied from a worked example its own palette.")
    ap.add_argument("page", type=Path)
    ap.add_argument("--for", dest="words", required=True, help="the page's own title and subject, from the person's request")
    a = ap.parse_args()
    if not a.page.is_file():
        print(f"deal.py: {a.page} is not a file", file=sys.stderr)
        return 2
    text = a.page.read_text(errors="replace")
    old = root_vars(text)
    if not spots(old):
        print("deal.py: the page has no :root palette with --c1 ... (is it a copy of a Bold worked example?)", file=sys.stderr)
        return 2
    avoid = [h for h in [lead_hue(old)] if h is not None]
    examples = {full(c) for f in (Path(__file__).resolve().parent.parent / "assets").glob("bold-*.html") for c in root_vars(f.read_text()).values()}
    for other in sorted(a.page.resolve().parent.glob("*.html")):
        if other.resolve() == a.page.resolve():
            continue
        v = root_vars(other.read_text(errors="replace"))
        h = lead_hue(v)
        if h is not None:
            avoid.append(h)
    hue, scheme = choose(a.words, avoid, len(spots(old)))
    move = mover(old, hue, scheme)
    new = {k: move(v) for k, v in old.items()}
    pairs = fix_text(new, old)
    swap = {old[k]: new[k] for k in old}
    cache = {}

    def sub(m):
        hx = full(m.group(0))
        if hx not in cache:
            cache[hx] = swap.get(hx) or move(hx)
        return cache[hx]

    text = HEX.sub(sub, text)
    text = re.sub(r"/\* palette\.py --bold[^*]*\*/", f"/* deal.py: scheme {scheme} from hue {hue} */", text, count=1)
    a.page.write_text(text)
    print(f"Dealt a palette to {a.page}: scheme {scheme}, lead hue {hue} (kept {GAP}+ degrees from {', '.join(f'{x:.0f}' for x in avoid)}).")
    for k in old:
        print(f"  --{k}: {old[k]} -> {new[k]}")
    bad = 0
    for fg, bg, r, need in pairs:
        ok = r >= need
        bad += not ok
        print(f"  {'ok  ' if ok else 'FAIL'} {fg} on {bg}: {r:.2f} (needs {need})")
    left = sorted({full(c) for c in HEX.findall(text) if full("#" + c) in examples} & examples)
    if left:
        print(f"  note: still the example's colors: {', '.join(left)}")
    if bad:
        print(f"{bad} text pairs are under their minimum: run it again with other words in --for.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
