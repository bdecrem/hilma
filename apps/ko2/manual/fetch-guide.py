#!/usr/bin/env python3
"""Rebuild manual/ep-133-guide.md from teenage engineering's online guide.

    python3 apps/ko2/manual/fetch-guide.py            # downloads every chapter, writes ep-133-guide.md

The guide is a div-soup page per chapter; this keeps the section anchors the chapter links to as
headings (the guide's own numbers) and every text block in order. Images are dropped. Re-run after
a KO II OS release (the guide's version line is near the top of the output).
"""
import html, pathlib, re, sys, urllib.request

HERE = pathlib.Path(__file__).parent
BASE = "https://teenage.engineering"
ORDER = ["whats-new", "guide-conventions", "hardware-overview", "power-on", "screen", "workflow",
         "get-started", "modes", "play-and-record", "functions", "effects", "how-to", "system",
         "buttons-and-combos", "erase-drive", "tech-specs", "warnings-warranty-fcc",
         "software-licenses", "credits"]

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")

index = get(f"{BASE}/guides/ep-133")
found = sorted(set(re.findall(r'href="/guides/ep-133/([a-z0-9-]+)"', index)))
extra = [c for c in found if c not in ORDER]
if extra:
    print("new chapters not in ORDER, appending:", extra, file=sys.stderr)
chapters = ORDER + extra

tok = re.compile(r'<div id="([0-9][0-9.]*)-([a-z0-9-]+)"|<main[^>]*>|</main>|<div class="txt[^"]*">(.*?)</div>', re.S)
out = ["# EP–133 K.O. II guide (teenage engineering)\n",
       f"Converted from {BASE}/guides/ep-133 by apps/ko2/manual/fetch-guide.py. Section numbers are the guide's own.\n"]
for name in chapters:
    s = get(f"{BASE}/guides/ep-133/{name}")
    out.append(f"\n\n# {name.replace('-', ' ')}\n")
    inmain, last, hnum = False, None, None
    for m in tok.finditer(s):
        if m.group(0).startswith("<main"): inmain = True; continue
        if m.group(0) == "</main>": inmain = False; continue
        if not inmain: continue
        if m.group(1):
            num, slug = m.group(1), m.group(2)
            if f'/guides/ep-133/{name}#{num}-{slug}"' not in s: continue
            depth = num.count(".") + 1
            out.append(f"\n{'#' * min(depth + 1, 5)} {num} {slug.replace('-', ' ')}\n")
            last, hnum = None, num
            continue
        t = m.group(3)
        t = re.sub(r"<br\s*/?>", "\n", t)
        t = re.sub(r"<[^>]+>", "", t)
        t = html.unescape(t).replace("\xa0", " ")
        t = re.sub(r"[ \t]+", " ", t).strip()
        if not t or t == "return to index" or t == hnum: continue
        if t == last: continue
        last = t
        out.append(t + "\n")
    print(name, file=sys.stderr)
txt = re.sub(r"\n{3,}", "\n\n", "\n".join(out))
(HERE / "ep-133-guide.md").write_text(txt)
print(f"wrote {HERE / 'ep-133-guide.md'}: {len(txt)} chars, {txt.count(chr(10) + '#')} headings")
