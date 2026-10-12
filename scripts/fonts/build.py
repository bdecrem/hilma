"""Instance and subset fonts for src/fonts. Driven by sync.mjs, never by hand.

Reads a JSON job list on stdin:
  [{ "src": "<ttf>", "out": "<path>", "flavor": "woff2" | null,
     "wght": <number> | null }]
and prints a JSON list with one record per job (axes, weight, style, bytes).

A variable source keeps only its wght axis for a woff2 (every other axis is
pinned to its default, which is the file Google serves as "variable"); a .ttf
for Satori is a full static instance at the requested weight. Both are cut
down to Google's latin + latin-ext character ranges, unhinted.
"""
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# Google Fonts' own subset ranges (the `latin` and `latin-ext` blocks in its CSS).
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
    "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
LATIN_EXT = (
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,"
    "U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,"
    "U+2C60-2C7F,U+A720-A7FF"
)
UNICODES = subset.parse_unicodes(LATIN + "," + LATIN_EXT)


def axes_of(font):
    if "fvar" not in font:
        return {}
    return {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes}


def build(job):
    font = TTFont(job["src"])
    axes = axes_of(font)
    if axes:
        limits = {}
        for tag, (lo, default, hi) in axes.items():
            if tag == "wght" and job["wght"] is None:
                continue  # stays variable
            if tag == "wght":
                limits[tag] = max(lo, min(hi, float(job["wght"])))
            else:
                limits[tag] = default
        if limits:
            font = instancer.instantiateVariableFont(font, limits, inplace=True, updateFontNames=False)
            # Partial instancing drops a glyph's gvar entry once nothing varies
            # in it any more; the subsetter then expects one per glyph (KeyError).
            if "gvar" in font:
                for g in font.getGlyphOrder():
                    font["gvar"].variations.setdefault(g, [])

    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.flavor = job["flavor"]
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.flavor = job["flavor"]

    os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
    font.save(job["out"])

    os2 = font["OS/2"]
    italic = bool(os2.fsSelection & 1) or (font["post"].italicAngle != 0)
    remaining = axes_of(font)
    return {
        "out": job["out"],
        "bytes": os.path.getsize(job["out"]),
        "style": "italic" if italic else "normal",
        "weight": [remaining["wght"][0], remaining["wght"][2]] if "wght" in remaining else os2.usWeightClass,
        "axes": {t: [lo, d, hi] for t, (lo, d, hi) in axes.items()},
    }


def main():
    jobs = json.load(sys.stdin)
    print(json.dumps([build(j) for j in jobs]))


if __name__ == "__main__":
    main()
