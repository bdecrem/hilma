#!/usr/bin/env python3
"""Look at a page at a phone width and a laptop width, and list what is wrong with it.

    python3 /opt/ola/skills/design-pass/scripts/look.py index.html --name before
    python3 /opt/ola/skills/design-pass/scripts/look.py index.html --name after

For each width (390 and 1280 unless --widths), runs `ola-page` (screenshot + measurements) and
saves the shot as shots/<page>-<name>-<width>.png beside the page. Prints the defects a program can
find, in plain words, then, when the `ola-see` command exists, asks it to look at each shot and
prints what it saw. Without `ola-see` it says, in one line, that it could not look at the page
itself. Writes shots/<page>-<name>.json with the counts, so rounds can be compared.
"""
import argparse, json, shutil, subprocess, sys
from pathlib import Path

QUESTION = ("This is a screenshot of a web page, {w} pixels wide. List each visual defect you can see: things that overlap or are cut off, "
            "text that is hard to read, cramped or uneven spacing, misaligned edges, a weak or confusing order of importance, too many "
            "colors, fonts or boxes, decoration that adds nothing, or areas that look empty or unfinished. For each: where it is, and one "
            "concrete fix. Do not praise. If nothing is wrong, answer: No defects found.")


def defects(r, w):
    out = []
    if not r.get("has_viewport_meta", True) and w < 700:
        out.append('no <meta name="viewport" content="width=device-width, initial-scale=1"> in the head: a phone will shrink the whole page to fit')
    if r.get("horizontal_scroll"):
        out.append(f"the page scrolls sideways by {r['horizontal_scroll']} px at {w} px")
    for x in r.get("past_right_edge", [])[:6]:
        quoted = '"' + x["text"][:30] + '"' if x["text"] else ""
        out.append(f"{x['where']} runs past the right edge (to {x['right']} px) {quoted}".rstrip())
    for x in r.get("clipped", [])[:6]:
        out.append(f"text is cut off in {x['where']} \"{x['text'][:30]}\"")
    for x in r.get("low_contrast", [])[:8]:
        out.append(f"low contrast {x['ratio']}:1 (needs {x['needs']}) in {x['where']} \"{x['text'][:30]}\": {x['color']} on {x['background']}")
    if r.get("low_contrast_count", 0) > 8:
        out.append(f"... and {r['low_contrast_count'] - 8} more with low contrast")
    for x in r.get("small_text", [])[:4]:
        out.append(f"text of {x['size']} px in {x['where']} \"{x['text'][:30]}\" (under 12 px)")
    if r.get("body_text_px") and r["body_text_px"] < 15 and r.get("texts", 0) > 5:
        out.append(f"the reading text is {r['body_text_px']} px; use 16 to 18 px")
    if r.get("long_lines"):
        out.append(f"{r['long_lines']} paragraphs have lines longer than about 90 characters; keep the text column under about 70 characters")
    fams = [f for f in r.get("font_families", {}) if f]
    if len(fams) > 2:
        out.append(f"{len(fams)} fonts in use ({', '.join(fams[:5])}); use one or two")
    if len(r.get("text_sizes", {})) > 7:
        out.append(f"{len(r['text_sizes'])} different text sizes; pick a scale of five or six")
    if r.get("h1_count", 1) != 1:
        out.append(f"{r.get('h1_count')} main headings (h1); a page has one")
    for k, say in (("broken_images", "broken image"), ("missing_files", "missing file"), ("outside_requests", "request to another address (it cannot load here or under Open)"), ("script_errors", "script error")):
        for x in r.get(k, [])[:4]:
            out.append(f"{say}: {x}")
    return out


def main():
    ap = argparse.ArgumentParser(prog="look.py")
    ap.add_argument("page")
    ap.add_argument("--name", default="look", help="a word for this round: before, after, round2")
    ap.add_argument("--widths", default="390,1280")
    a = ap.parse_args()
    page = Path(a.page)
    if not page.is_file():
        print(f"look: no such page: {a.page}")
        return 2
    shots = page.parent / "shots"
    shots.mkdir(exist_ok=True)
    see = shutil.which("ola-see")
    total, summary = 0, {"page": page.name, "name": a.name, "widths": {}}
    for w in [int(x) for x in a.widths.split(",")]:
        shot = shots / f"{page.stem}-{a.name}-{w}.png"
        js = shots / f"{page.stem}-{a.name}-{w}.json"
        p = subprocess.run(["ola-page", str(page), "--width", str(w), "--out", str(shot), "--json", str(js)], capture_output=True, text=True, timeout=180)
        if p.returncode != 0:
            print(f"At {w} px: the page could not be loaded: {p.stderr.strip()[:300]}")
            return 1
        r = json.loads(js.read_text())
        found = defects(r, w)
        total += len(found)
        summary["widths"][w] = {"defects": len(found), "shot": str(shot.relative_to(page.parent)), "found": found}
        print(f"At {w} px ({shot.relative_to(page.parent)}, {r['shot_size'][0]} x {r['shot_size'][1]} px): {len(found)} defects a program can find.")
        for f in found:
            print(f"  - {f}")
        if see:
            s = subprocess.run([see, str(shot), QUESTION.format(w=w)], capture_output=True, text=True, timeout=300)
            seen = (s.stdout or s.stderr).strip()
            summary["widths"][w]["seen"] = seen[:4000]
            print(f"  What ola-see saw at {w} px:\n" + "\n".join("    " + l for l in seen.splitlines()[:40]))
    if not see:
        print("I could not look at the page itself (no ola-see on this computer); these are only the checks a program can make. Open the shots to judge the rest.")
    summary["defects"] = total
    summary["looked"] = bool(see)
    (shots / f"{page.stem}-{a.name}.json").write_text(json.dumps(summary, indent=1))
    print(f"In all: {total} defects a program can find.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
