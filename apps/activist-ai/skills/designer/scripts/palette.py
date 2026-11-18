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

The Bold register (references/bold.md) has its own mode: a ground, an ink and three to five spot
colors, from a preset or built as a scheme from one hue, each with the text color that reads on it:

    python3 /opt/ola/skills/designer/scripts/palette.py --bold --preset riso --css palette.css
    python3 /opt/ola/skills/designer/scripts/palette.py --bold --scheme triadic --hue 25 --css palette.css
    python3 /opt/ola/skills/designer/scripts/palette.py --bold --scheme analogous-clash --hue 150 --ground dark --html swatches.html

Presets: riso, night-neon, candy, duotone. Schemes: complementary, triadic, analogous-clash, split.
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


# ---------------------------------------------------------------- the Bold register (references/bold.md)
# A ground, an ink, and three to five spot colors that work together, like inks on a risograph or a
# screen print. Each spot color gets the text color that reads on it (--on-c1 ...), and the table says
# what each one may carry on the ground: text (4.5:1), display type 24 px and up (3:1), or only
# fields and shapes.
PRESETS = {
    # The palette the owner approved (indie riso): one loud full-bleed color at a time, ink on top.
    "riso": dict(note="indie riso: vermillion, ultramarine, sunflower, lime on cream with ink", paper="#f7efdf", ink="#16121c",
                 colors=["#ff4b1f", "#3d3bff", "#ffc31f", "#b6f23a"]),
    # A night street, sodium lamps and signs: light, saturated inks on a deep violet-black.
    "night-neon": dict(note="deep night with neon: acid lime, tangerine, lilac, sodium yellow on violet-black", paper="#130e2b", ink="#f6f3ff",
                       colors=["#c6ff3a", "#ff7a2e", "#b49cff", "#ffd23f"]),
    # Pastel fields that all carry one dark plum ink: kids, picnics, a sweet celebration.
    "candy": dict(note="candy pastels with one dark ink: bubblegum, butter, mint, periwinkle under plum", paper="#fff6ef", ink="#2b1640",
                  colors=["#ff9ec7", "#ffdf73", "#9fe3c1", "#aab8ff"]),
    # Two inks only, the cheapest print there is: deep green and tangerine on paper; overprints make the third.
    "duotone": dict(note="two-color duotone: deep forest green and tangerine on warm paper", paper="#fbf3e4", ink="#0c3a2c",
                    colors=["#0c3a2c", "#ff8a3d"]),
}
# (hue offset, lightness on a light ground, lightness on a dark ground): one deep, one mid, one light,
# so the colors differ in value as well as hue (a scheme of three mid tones looks muddy).
SCHEMES = {
    "complementary": [(0, 0.63, 0.78), (180, 0.42, 0.70), (35, 0.86, 0.90)],
    "triadic": [(0, 0.62, 0.76), (120, 0.48, 0.82), (240, 0.84, 0.70)],
    "analogous-clash": [(0, 0.60, 0.74), (30, 0.72, 0.82), (60, 0.88, 0.90), (195, 0.44, 0.72)],
    "split": [(0, 0.62, 0.76), (150, 0.46, 0.80), (210, 0.84, 0.70)],
}


def vivid(L, h, cmax=0.26):
    """The most colorful displayable color at this lightness and hue."""
    return color(L, cmax, h)


def reads_on(c, paper, ink):
    """The text color for a field of c: ink or paper, whichever reads better."""
    return ink if ratio(ink, c) >= ratio(paper, c) else paper


def fit_field(c, paper, ink):
    """Move a spot color's lightness until ink or paper reads on it at 4.5:1, keeping its hue."""
    L, C, h = hex_to_oklch(c)
    best = max(ratio(ink, c), ratio(paper, c))
    step = 0.01 if luminance(ink) < luminance(paper) else -0.01  # toward the side the darker text needs
    n = 0
    while best < 4.6 and n < 40:
        L = min(0.97, max(0.05, L + step))
        c = color(L, C, h)
        best = max(ratio(ink, c), ratio(paper, c))
        n += 1
    return c


def build_bold(paper, ink, colors):
    p = {"paper": paper}
    pl, il = hex_to_oklch(paper), hex_to_oklch(ink)
    dark = luminance(paper) < luminance(ink)
    p["surface"] = color(pl[0] + (0.05 if dark else -0.035), pl[1] * 1.3, pl[2])
    p["ink"] = ink
    # secondary text: the ink moved toward the ground until it is just comfortably readable
    p["ink-2"] = search(il[0] - 0.3, 0.01, il[1], il[2], paper, 5.0) if dark else search(il[0] + 0.3, -0.01, il[1], il[2], paper, 5.0)
    p["rule"] = color(pl[0] + (0.16 if dark else -0.14), min(il[1], 0.03), il[2])
    for i, c in enumerate(colors, 1):
        c = c.lower()
        if max(ratio(ink, c), ratio(paper, c)) < 4.5:
            c = fit_field(c, paper, ink)
        p[f"c{i}"] = c
        p[f"on-c{i}"] = reads_on(c, paper, ink)
    p["accent"] = p["c1"] if ratio(p["c1"], paper) >= 4.5 else next((p[f"c{i}"] for i in range(1, len(colors) + 1) if ratio(p[f"c{i}"], paper) >= 4.5), ink)
    p["on-accent"] = reads_on(p["accent"], paper, ink)
    return p


def bold_main(a):
    if a.preset:
        pr = PRESETS[a.preset]
        paper, ink, colors, what = pr["paper"], pr["ink"], pr["colors"], f"preset {a.preset}: {pr['note']}"
    else:
        dark = a.ground == "dark"
        hue = a.hue % 360
        colors = [vivid(Ld if dark else Ll, (hue + off) % 360) for off, Ll, Ld in SCHEMES[a.scheme]]
        paper = color(0.17, 0.045, (hue + 270) % 360) if dark else color(0.965, 0.022, 85)
        ink = color(0.97, 0.012, (hue + 270) % 360) if dark else color(0.19, 0.035, (hue + 270) % 360)
        what = f"scheme {a.scheme} from hue {hue:.0f} on a {a.ground} ground"
    p = build_bold(paper, ink, colors)
    n = len(colors)
    print(f"bold ({what}):")
    for k, v in p.items():
        print(f"  --{k}: {v}")
    bad = 0
    req = [("ink", "paper", 7, "reading text"), ("ink-2", "paper", 4.5, "secondary text"), ("ink", "surface", 4.5, "text on a band of surface")]
    req += [(f"on-c{i}", f"c{i}", 4.5, f"text on a field of c{i}") for i in range(1, n + 1)]
    for fg, bg, need, use in req:
        r = ratio(p[fg], p[bg])
        ok = r >= need
        bad += not ok
        print(f"  {'ok  ' if ok else 'FAIL'} {fg} on {bg}: {r:.2f} (needs {need}; {use})")
    print("  What each color may carry on the ground (--paper):")
    for i in range(1, n + 1):
        r = ratio(p[f"c{i}"], p["paper"])
        say = "text, links, any size" if r >= 4.5 else "display type 24 px and up, thick lines" if r >= 3 else "fields and shapes only, never text on the ground"
        print(f"       c{i} {p[f'c{i}']}: {r:.2f} -> {say}")
    pairs = [(i, j) for i in range(1, n + 1) for j in range(i + 1, n + 1)]
    touch = [f"c{i}/c{j}" for i, j in pairs if ratio(p[f"c{i}"], p[f"c{j}"]) < 1.25]
    if touch:
        print(f"  note: {', '.join(touch)} are close in value; where they touch, the edge blurs. Put ink or the ground between them, or overlap them on purpose.")
    css = f"/* palette.py --bold: {what} */\n:root {{\n" + css_block(p) + "\n}\n"
    if a.css:
        Path(a.css).parent.mkdir(parents=True, exist_ok=True)
        Path(a.css).write_text(css)
        print(f"Wrote {a.css}")
    if a.html:
        cells = "".join(f'<div class="sw" style="background:{p[f"c{i}"]};color:{p[f"on-c{i}"]}"><b>c{i}</b><span>{p[f"c{i}"]}</span>'
                        f'<span>text {p[f"on-c{i}"]}: {ratio(p[f"on-c{i}"], p[f"c{i}"]):.1f}:1</span></div>' for i in range(1, n + 1))
        Path(a.html).parent.mkdir(parents=True, exist_ok=True)
        Path(a.html).write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Palette</title>'
                                f'<style>body{{font:15px/1.4 system-ui,sans-serif;margin:0;padding:24px;background:{p["paper"]};color:{p["ink"]}}}.row{{display:flex;flex-wrap:wrap;gap:0}}'
                                '.sw{width:180px;height:140px;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;gap:2px}</style>'
                                f'<h1 style="margin:0 0 16px;font-size:20px">{html_escape(what)}</h1><div class="row">{cells}</div>')
        print(f"Wrote {a.html}")
    if bad:
        print(f"{bad} text pairs are under their minimum: choose another --hue or another preset.")
    return 1 if bad else 0


def html_escape(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")


def main():
    if "--bold" in sys.argv or "--preset" in sys.argv or "--scheme" in sys.argv:
        bp = argparse.ArgumentParser(prog="palette.py --bold", description="The Bold register: a ground, an ink and three to five spot colors.")
        bp.add_argument("--bold", action="store_true")
        g = bp.add_mutually_exclusive_group(required=True)
        g.add_argument("--preset", choices=sorted(PRESETS), help="; ".join(f"{k}: {v['note']}" for k, v in PRESETS.items()))
        g.add_argument("--scheme", choices=sorted(SCHEMES), help="build one from --hue")
        bp.add_argument("--hue", type=float, default=25, help="with --scheme: the lead color's hue (OKLCH), from the subject")
        bp.add_argument("--ground", choices=["light", "dark"], default="light", help="with --scheme: a cream ground or a night one")
        bp.add_argument("--css")
        bp.add_argument("--html")
        a = bp.parse_args()
        return bold_main(a)
    ap = argparse.ArgumentParser(prog="palette.py", epilog="The Bold register (fun, colorful, a festival, a campaign): palette.py --bold --preset riso, or --bold --scheme triadic --hue 25. See references/bold.md.")
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
