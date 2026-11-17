#!/usr/bin/env python3
"""A small tonal palette from one hue, with every text pair's contrast checked.

    python3 /opt/ola/skills/designer/scripts/palette.py --hue 250 --css design/palette.css
    python3 /opt/ola/skills/designer/scripts/palette.py --from "#25407a" --neutral warm --dark --css design/palette.css
    python3 /opt/ola/skills/designer/scripts/palette.py --hue 150 --html design/palette.html   (swatches to look at)

Builds the colors by role, in OKLCH (even steps of lightness the eye agrees with): a paper, a lifted
surface, a rule, three inks, one accent (for links, the key figure, the one button), an accent wash
(a quiet highlight) and an alert color (for what needs the reader, never decoration). Neutrals carry
a trace of the hue (warm, cool or the accent's own) so the page has a temperature without color.
The accent's lightness is searched until it reads on the paper at 4.5 to 1. Prints the CSS custom
properties and a table of contrast ratios; exits 1 if any text pair is under its minimum.
Only Python's standard library.
"""
import argparse, math, sys
from pathlib import Path

NEUTRAL_HUE = {"warm": 75.0, "cool": 255.0}


def oklch_to_rgb(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_, m_, s_ = L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def in_gamut(rgb):
    return all(-1e-4 <= c <= 1 + 1e-4 for c in rgb)


def encode(c):
    c = min(1.0, max(0.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def color(L, C, h):
    """The nearest displayable color: chroma is reduced until it fits in sRGB."""
    while C > 0 and not in_gamut(oklch_to_rgb(L, C, h)):
        C = max(0.0, C - 0.004)
    r, g, b = (round(encode(c) * 255) for c in oklch_to_rgb(L, C, h))
    return f"#{r:02x}{g:02x}{b:02x}"


def hex_to_oklch(hx):
    hx = hx.lstrip("#")
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    l = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
    m = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
    s = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360


def luminance(hx):
    hx = hx.lstrip("#")
    ch = [int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    ch = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in ch]
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def search(start, step, C, h, bg, need):
    """Walk lightness from start by step until the color reads on bg at the needed ratio."""
    L = start
    while 0.05 < L < 0.98:
        c = color(L, C, h)
        if ratio(c, bg) >= need:
            return c
        L += step
    return color(L, C, h)


def build(hue, chroma, nhue, nchroma, dark, exact=None):
    if not dark:
        paper = color(0.985, nchroma, nhue)
        p = {"paper": paper, "surface": color(0.955, nchroma * 1.6, nhue), "rule": color(0.88, nchroma * 2, nhue),
             "ink": color(0.24, min(0.03, nchroma * 3), nhue), "ink-2": color(0.42, min(0.03, nchroma * 3), nhue)}
        p["ink-3"] = search(0.56, -0.01, min(0.02, nchroma * 2), nhue, p["surface"], 4.6)
        # A deep accent reads as confident; one at the bare minimum reads as a default link.
        p["accent"] = search(0.58, -0.01, chroma, hue, paper, 6.0)
        if exact and ratio(exact, p["surface"]) >= 4.6:
            p["accent"] = exact  # the brand's own color, when it reads on the paper
        p["on-accent"] = paper
        p["accent-wash"] = color(0.94, min(chroma * 0.35, 0.05), hue)
        p["alert"] = search(0.6, -0.01, 0.17, 35, paper, 4.6)
    else:
        paper = color(0.19, nchroma * 1.5, nhue)
        p = {"paper": paper, "surface": color(0.23, nchroma * 2, nhue), "rule": color(0.33, nchroma * 2, nhue),
             "ink": color(0.95, nchroma, nhue), "ink-2": color(0.82, nchroma * 1.5, nhue)}
        p["ink-3"] = search(0.66, 0.01, min(0.02, nchroma * 2), nhue, p["surface"], 4.6)
        p["accent"] = search(0.70, 0.01, chroma * 0.85, hue, paper, 4.6)
        p["on-accent"] = color(0.16, nchroma, nhue)
        p["accent-wash"] = color(0.28, min(chroma * 0.4, 0.05), hue)
        p["alert"] = search(0.70, 0.01, 0.15, 35, paper, 4.6)
    return p


# (foreground, background, minimum, what it is used for)
PAIRS = [("ink", "paper", 7, "reading text"), ("ink-2", "paper", 4.5, "secondary text"), ("ink-3", "paper", 4.5, "notes and sources"),
         ("ink", "surface", 7, "text on a lifted surface"), ("ink-3", "surface", 4.5, "notes on a surface"), ("accent", "paper", 4.5, "links, the key figure"), ("accent", "surface", 4.5, "links on a surface"),
         ("on-accent", "accent", 4.5, "a button's label"), ("ink", "accent-wash", 7, "highlighted text"), ("alert", "paper", 4.5, "a warning"),
         ("rule", "paper", 1.15, "a hairline (visible, not loud)")]


def css_block(p, indent="  "):
    return "\n".join(f"{indent}--{k}: {v};" for k, v in p.items())


def main():
    ap = argparse.ArgumentParser(prog="palette.py")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--hue", type=float, help="the accent's hue, 0 to 360 (OKLCH): about 25 red, 60 orange, 95 yellow, 150 green, 200 teal, 250 blue, 300 violet")
    g.add_argument("--from", dest="src", help="an existing brand color, like #25407a")
    ap.add_argument("--chroma", type=float, default=0.13, help="the accent's colorfulness, 0.06 (muted) to 0.18 (vivid); default 0.13")
    ap.add_argument("--neutral", choices=["warm", "cool", "hue"], default="warm", help="the temperature of the paper and inks")
    ap.add_argument("--tint", type=float, default=0.008, help="how much hue the neutrals carry, 0 to 0.02")
    ap.add_argument("--dark", action="store_true", help="also a dark set, under prefers-color-scheme: dark")
    ap.add_argument("--css", help="write the custom properties to this file")
    ap.add_argument("--html", help="write a page of swatches with their ratios, to render and look at")
    a = ap.parse_args()
    hue, chroma = (a.hue % 360, a.chroma) if a.src is None else hex_to_oklch(a.src)[2:0:-1]
    if a.src is not None:
        chroma = min(max(chroma, 0.04), 0.2)
    nhue = NEUTRAL_HUE.get(a.neutral, hue)
    exact = ("#" + a.src.lstrip("#").lower()) if a.src else None
    sets = {"light": build(hue, chroma, nhue, a.tint, False, exact)}
    if a.dark:
        sets["dark"] = build(hue, chroma, nhue, a.tint, True)
    bad = 0
    for mode, p in sets.items():
        print(f"{mode}:")
        for k, v in p.items():
            print(f"  --{k}: {v}")
        for fg, bg, need, use in PAIRS:
            r = ratio(p[fg], p[bg])
            ok = r >= need
            bad += not ok
            print(f"  {'ok  ' if ok else 'FAIL'} {fg} on {bg}: {r:.2f} (needs {need}; {use})")
    css = ":root {\n" + css_block(sets["light"]) + "\n}\n"
    if a.dark:
        css += "@media (prefers-color-scheme: dark) {\n  :root {\n" + css_block(sets["dark"], "    ") + "\n  }\n}\n"
    if a.css:
        Path(a.css).parent.mkdir(parents=True, exist_ok=True)
        Path(a.css).write_text(f"/* palette.py: hue {hue:.0f}, chroma {chroma:.3f}, neutrals {a.neutral} */\n" + css)
        print(f"Wrote {a.css}")
    if a.html:
        rows = []
        for mode, p in sets.items():
            cells = "".join(f'<div class="sw" style="background:{v};color:{p["ink"] if k not in ("ink", "ink-2", "ink-3", "accent", "alert") else p["paper"]}">'
                            f'<b>{k}</b><span>{v}</span><span>{ratio(v, p["paper"]):.1f}:1 on paper</span></div>' for k, v in p.items())
            rows.append(f'<h2>{mode}</h2><div class="row">{cells}</div>')
        Path(a.html).parent.mkdir(parents=True, exist_ok=True)
        Path(a.html).write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Palette</title>'
                                '<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#fff;color:#222}.row{display:flex;flex-wrap:wrap;gap:8px}'
                                '.sw{width:150px;height:96px;padding:10px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;border:1px solid #0001}'
                                'h2{font-size:15px;margin:16px 0 8px}</style>' + "".join(rows))
        print(f"Wrote {a.html}")
    if bad:
        print(f"{bad} pairs are under their minimum: raise --chroma less, or choose another hue.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
