#!/usr/bin/env python3
"""The web app's cut of the two typefaces (wider than the landing page's: the interface needs
regular weights and the documents bold headings). Writes woff2 files to apps/activist-ai/web/public/fonts/.
Adapted from apps/activist-ai/site/src/fonts.py.

Sources are the variable TTFs from the google/fonts repo (OFL), as scripts/fonts/sync.mjs
caches them in scripts/fonts/.cache. Run with the fonttools venv from that pipeline:

  scripts/fonts/.venv/bin/python apps/activist-ai/web/scripts/fonts.py

Each axis is narrowed to the range the page uses, so the files stay small while the type
renders as it does at full range: Bricolage Grotesque keeps wght 400-760 and opsz 12-72
(width fixed at 100); Literata roman keeps wght 400-700 and opsz 12-36; italic 400, opsz 12-24.
Glyphs: Google's "latin" range, with old-style and lining figures kept.
"""
import io, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
CACHE = os.path.join(ROOT, 'scripts/fonts/.cache')
OUT = os.path.join(HERE, '../public/fonts')

LATIN = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,'
         'U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')

JOBS = [
    ('bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf', 'bricolage.woff2',
     {'wdth': 100, 'wght': (400, 760), 'opsz': (12, 72)}),
    ('literata/Literata%5Bopsz,wght%5D.ttf', 'literata.woff2',
     {'wght': (400, 700), 'opsz': (12, 36)}),
    ('literata/Literata-Italic%5Bopsz,wght%5D.ttf', 'literata-italic.woff2',
     {'wght': 400, 'opsz': (12, 24)}),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    for src, name, axes in JOBS:
        path = os.path.join(CACHE, src)
        if not os.path.exists(path):
            sys.exit(f'missing source {path}: fetch it from github.com/google/fonts (ofl/)')
        font = TTFont(path)
        opts = subset.Options()
        opts.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'onum', 'lnum', 'pnum', 'tnum']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.hinting = False
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=subset.parse_unicodes(LATIN))
        sub.subset(font)
        # subset first, then narrow the axes (the other order trips over a lazy gvar)
        buf = io.BytesIO(); font.save(buf); buf.seek(0)
        font = instancer.instantiateVariableFont(TTFont(buf), axes)
        dest = os.path.join(OUT, name)
        font.flavor = 'woff2'
        font.save(dest)
        print(f'{name}: {os.path.getsize(dest)/1024:.1f} KB')

main()
