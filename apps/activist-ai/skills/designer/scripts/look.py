#!/usr/bin/env python3
"""Look at a page at a phone width and a laptop width, and list what a designer would fix.

    python3 /opt/ola/skills/designer/scripts/look.py index.html --name round1
    python3 /opt/ola/skills/designer/scripts/look.py index.html --name round2 --dark
    python3 /opt/ola/skills/designer/scripts/look.py index.html --name check --register bold

Two registers (references/bold.md). Calm, the default, holds a page to one accent, no gradients, no
rounded cards and a title of 40 to 48 px. Bold (a page with <meta name="ola-register" content="bold">,
or --register bold) allows three to five colors, gradients behind shapes, big rounded shapes, overlap
and very large display type, and instead calls a Bold page bare when it is timid: too few colors, type
not much bigger than the text. In both: no glows, glass, emoji, placeholder text, low contrast or
sideways scroll.

For each width (390 and 1280 unless --widths), runs `ola-page` (screenshot + measurements) and saves
.shots/<page>-<name>-<width>.png beside the page (hidden, so the project lists only real pages). Prints, in plain words with what to do instead:
  broken     sideways scroll, things past the edge, cut-off text, broken images, script errors, outside requests
  readable   contrast (the actual ratio), tiny text, long lines, too many fonts or sizes
  order      the first screen in order of visual weight (the squint test): one clear first thing or rivals
  decorated  gradients, glows, shadows, rounded cards, pills, emoji, a colored phrase in the headline,
             tiny capital labels, several accent colors, placeholder text
  bare       no size contrast, a white page with one accent and no picture
  usable     alt text, labeled pictures and fields, heading order, focus styles, reduced motion, tap targets
Then, when `ola-see` exists, one model looks at a sheet of the laptop view, the phone view and the
laptop view blurred (as if squinting) and says what it sees first and what is wrong. Without it, it
says so in one line. Writes .shots/<page>-<name>.json with the counts, so rounds can be compared.
"""
import argparse, html, json, re, shutil, subprocess, sys
from pathlib import Path

QUESTION_BOLD = ("This sheet shows one web page meant to be bold, fun and colorful: the laptop view (left), the phone view (middle), and the laptop view blurred as if squinting (right). "
                 "First, from the blurred view: what is the one thing that stands out first, and does anything compete with it? "
                 "Then list each visual defect you can see in the sharp views: overlap or cut-off text, hard-to-read text (on a color or a gradient), cramped or uneven spacing, "
                 "a timid look (few colors, small type, no shape or picture from the subject), chaos (colors with no system, everything loud), "
                 "decoration that says nothing about the subject (blobs, waves, sparkles, glows, emoji, a default purple-pink gradient), or areas that look empty or unfinished. "
                 "For each: where it is, and one concrete fix. Do not praise. If nothing is wrong, answer: No defects found.")

QUESTION = ("This sheet shows one web page: the laptop view (left), the phone view (middle), and the laptop view blurred as if squinting (right). "
            "First, from the blurred view: what is the one thing that stands out first, and does anything compete with it? "
            "Then list each visual defect you can see in the sharp views: overlap or cut-off text, hard-to-read text, cramped or uneven spacing, "
            "misaligned edges, a weak or confusing order of importance, type that is too big for a professional page, too many colors, fonts or boxes, "
            "decoration that says nothing about the subject (gradients, glows, rounded cards, emoji), or areas that look empty or unfinished. "
            "For each: where it is, and one concrete fix. Do not praise. If nothing is wrong, answer: No defects found.")


def broken(r, w):
    out = []
    if not r.get("has_viewport_meta", True) and w < 700:
        out.append('no <meta name="viewport" content="width=device-width, initial-scale=1"> in the head: a phone will shrink the whole page')
    if r.get("horizontal_scroll"):
        out.append(f"the page scrolls sideways by {r['horizontal_scroll']} px: find the wide element below; wrap tables in a box with overflow-x: auto")
    for x in r.get("past_right_edge", [])[:6]:
        quoted = '"' + x["text"][:30] + '"' if x["text"] else ""
        out.append(f"{x['where']} runs past the right edge (to {x['right']} px) {quoted}: give it max-width: 100%".rstrip())
    for x in r.get("clipped", [])[:6]:
        out.append(f"text is cut off in {x['where']} \"{x['text'][:30]}\": remove the fixed height or overflow: hidden")
    for k, say in (("broken_images", "broken image"), ("missing_files", "missing file"), ("outside_requests", "request to another address (it cannot load here or under Open)"), ("script_errors", "script error")):
        for x in r.get(k, [])[:4]:
            out.append(f"{say}: {x}")
    return out


def readable(r, w, bold=False):
    out = []
    for x in r.get("low_contrast", [])[:8]:
        out.append(f"low contrast {x['ratio']}:1 (needs {x['needs']}) in {x['where']} \"{x['text'][:30]}\": {x['color']} on {x['background']}; use --ink-2 or --ink-3 from palette.py")
    if r.get("low_contrast_count", 0) > 8:
        out.append(f"... and {r['low_contrast_count'] - 8} more with low contrast")
    for x in r.get("small_text", [])[:4]:
        out.append(f"text of {x['size']} px in {x['where']} \"{x['text'][:30]}\": nothing under 12 px; notes are 13 px")
    rp = (r.get("taste") or {}).get("reading_px") or r.get("body_text_px")
    if rp and rp < 15 and r.get("texts", 0) > 5:
        out.append(f"the reading text is {rp} px; use your scale's reading size (15 to 17 px)")
    if rp and rp > (20 if bold else 19) and r.get("texts", 0) > 5:
        out.append(f"the reading text is {rp} px: too big for a professional page; use 16 or 17 px")
    if r.get("long_lines"):
        out.append(f"{r['long_lines']} paragraphs run longer than about 90 characters a line: max-width: 66ch")
    fams = [f for f in r.get("font_families", {}) if f]
    if len(fams) > 2:
        out.append(f"{len(fams)} fonts in use ({', '.join(fams[:5])}): one or two, from fonts.py")
    # in Bold the display sizes (40 px and up) are the point; the scale is held below them
    sizes = [k for k in r.get("text_sizes", {}) if not bold or float(k) < 40]
    if len(sizes) > 7:
        out.append(f"{len(sizes)} different text sizes{' under 40 px' if bold else ''} ({', '.join(sorted(sizes, key=float))}): keep to your scale's " + ("sizes (bold.md)" if bold else "six or seven"))
    if bold and r.get("contrast_unknown", 0) > 3:
        out.append(f"{r['contrast_unknown']} texts sit on a gradient or a picture, where contrast cannot be checked: put text on a flat field (--cN with --on-cN) and keep the gradient behind shapes")
    if r.get("h1_count", 1) != 1:
        out.append(f"{r.get('h1_count')} main headings (h1): a page has one")
    return out


def order(t, w, bold=False):
    out = []
    first = t.get("first_screen") or []
    if first and t.get("rivals", 0) > 2:
        names = "; ".join(f'"{x["text"][:24]}" {x["size"]:g} px' for x in first[:t["rivals"]][:4])
        out.append(f"{t['rivals']} things compete to be seen first ({names}): make the one idea clearly the largest, quiet the rest")
    if w >= 1000 and t.get("contrast_of_sizes") and t["contrast_of_sizes"] < 1.8:
        out.append(f"the largest text on the first screen is only {t['contrast_of_sizes']} times the reading size: no clear first thing; give the idea your scale's display size")
    if w >= 1000 and t.get("h1_px") and t["h1_px"] > 64 and not bold:
        out.append(f"the main heading is {t['h1_px']:g} px: too big for a professional page; 40 to 48 px on a laptop")
    return out


def decorated(t, bold=False):
    """Calm: every item below. Bold: gradients, shadows, rounded shapes, pills, a colored phrase in the
    title and up to six colors are part of the system; glows, glass, emoji, placeholder text stay out."""
    out = []
    if t.get("gradients") and not bold:
        out.append(f"gradient backgrounds on {', '.join(t['gradients'][:3])}: use a flat --paper or --surface")
    if t.get("glows"):
        out.append(f"glows or soft shadows on {', '.join(t['glows'][:3])}: remove; separate things with space or a hairline")
    if t.get("shadows", 0) > 3 and not bold:
        out.append(f"{t['shadows']} boxes have shadows: only something that floats (a menu, a dialog) gets one")
    if t.get("round_boxes", 0) > 3 and not bold:
        out.append(f"{t['round_boxes']} rounded boxes (cards): a list of facts is a list; use rules and space, and a radius of 2 to 6 px if any")
    if t.get("pills", 0) > (12 if bold else 3):
        out.append(f"{t['pills']} pill-shaped chips: write them as plain text, or a small label with no fill")
    if t.get("glass"):
        out.append("blurred glass panels: use a flat surface")
    if t.get("emoji"):
        out.append(f"{t['emoji']} emoji: no emoji as icons or decoration; words, or a small drawn icon if it carries meaning")
    if t.get("h1_accent") and not bold:
        out.append("a colored or italic phrase inside the main heading: set the whole heading in one ink")
    if t.get("tiny_caps_labels", 0) > 2:
        out.append(f"{t['tiny_caps_labels']} small capital labels: sentence case at 13 px or more")
    if t.get("centered_long_text"):
        out.append(f"{t['centered_long_text']} long centered paragraphs: align reading text left")
    if t.get("placeholder"):
        out.append(f"placeholder text ({', '.join(t['placeholder'][:4])}): replace with the real content, or a marked draft line")
    if bold and len(t.get("accent_hues", [])) > 6:
        out.append(f"{len(t['accent_hues'])} different colors: a Bold page has three to five inks that work together (palette.py --bold)")
    if not bold and len(t.get("accent_hues", [])) > 2:
        out.append(f"{len(t['accent_hues'])} different colors ({', '.join(str(h) + ' deg' for h in t['accent_hues'][:4])}): one accent; a second only to mean something")
    return out


def bare(t, r, w, bold=False):
    out = []
    if bold:
        # timid: the Bold version of 'too plain'
        if w >= 1000 and len(t.get("accent_hues", [])) < 2:
            out.append(f"a Bold page with {len(t.get('accent_hues', []))} color(s): timid; give each of the palette's inks a field (a hero, a band, stickers); palette.py --bold")
        if w >= 1000 and t.get("contrast_of_sizes") and t["contrast_of_sizes"] < 3:
            out.append(f"the largest text is only {t['contrast_of_sizes']} times the reading size: timid; in Bold the title or the giant date is 4 to 15 times it (bold.md, type)")
        if w >= 1000 and (t.get("background") or "").lower() in ("#ffffff", "#fff") and not t.get("pictures"):
            out.append("a white page with no shape or picture: timid; give the first screen a full-bleed field and the subject's shape (bold.md)")
        return out
    if w >= 1000 and (t.get("background") or "").lower() in ("#ffffff", "#fff") and len(t.get("accent_hues", [])) <= 1 and not t.get("pictures"):
        out.append("a white page with at most one accent and no picture: the 'too plain' look; warm or cool the paper (palette.py) and give the page's idea a picture or a display size")
    if len(r.get("text_sizes", {})) <= 2 and r.get("texts", 0) > 6:
        out.append(f"only {len(r['text_sizes'])} text sizes: no hierarchy; use your scale")
    return out


def usable(t, w):
    out = []
    if t.get("images_without_alt"):
        out.append(f"{t['images_without_alt']} images without alt text: describe what each shows, or alt=\"\" if it is decoration")
    if t.get("unlabeled_pictures"):
        out.append(f"{t['unlabeled_pictures']} charts or drawings without a label: role=\"img\" and an aria-label that states the finding, or a figcaption")
    if t.get("unlabeled_inputs"):
        out.append(f"{t['unlabeled_inputs']} form fields without a label: a visible <label for=...> above each")
    if t.get("heading_skips"):
        out.append(f"{t['heading_skips']} skipped heading levels: h1, then h2, then h3")
    if t.get("interactive") and not t.get("focus_rules"):
        out.append("no focus style: add a:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px }")
    elif t.get("outline_removed") and not t.get("focus_rules"):
        out.append("the focus outline is removed and nothing replaces it")
    if t.get("motion_without_reduced_motion"):
        out.append("things move, with no @media (prefers-reduced-motion: reduce) rule to stop them")
    if w < 700 and t.get("small_targets"):
        out.append(f"{t['small_targets']} buttons or fields under 32 px tall on a phone: 44 px")
    return out


def run_page(page, w, shot, js, dark):
    cmd = ["ola-page", str(page), "--width", str(w), "--out", str(shot), "--json", str(js)] + (["--dark"] if dark else [])
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
    return p.returncode, p.stderr.strip()


def main():
    ap = argparse.ArgumentParser(prog="look.py")
    ap.add_argument("page")
    ap.add_argument("--name", default="look", help="a word for this round: before, round1, round2")
    ap.add_argument("--widths", default="390,1280")
    ap.add_argument("--dark", action="store_true", help="also look at it in dark mode")
    ap.add_argument("--no-see", action="store_true", help="skip the model's look (faster)")
    ap.add_argument("--register", choices=["auto", "calm", "bold"], default="auto", help='auto reads <meta name="ola-register" content="bold"> from the page')
    a = ap.parse_args()
    page = Path(a.page)
    if not page.is_file():
        print(f"look: no such page: {a.page}")
        return 2
    reg = a.register
    if reg == "auto":
        reg = "bold" if re.search(r"""<meta[^>]+name=["']?ola-register["']?[^>]+content=["']?bold""", page.read_text(errors="replace"), re.I) else "calm"
    bold = reg == "bold"
    src = page.read_text(errors="replace")
    # a page started from a worked example must not keep the example's words
    leftover = [x for x in ("Example page for the designer skill", "EXAMPLE for the designer skill", "Halsey Avenue Merchants", "Linden Place Tenants Union",
                            "Spoke Collective") if x in src] if not page.name.startswith("bold-") else []
    # ... nor the example's colors (OLA-137, OLA-168: three block parties in three projects, one candy palette)
    if bold and not page.name.startswith("bold-"):
        spots = lambda t: {m.group(2).lower() for m in re.finditer(r"--(c\d)\s*:\s*(#[0-9a-fA-F]{6})", (re.search(r":root\s*\{([^}]*)\}", t, re.S) or [None, ""])[1])}
        mine = spots(src)
        for ex in sorted((Path(__file__).resolve().parent.parent / "assets").glob("bold-*.html")):
            theirs = spots(ex.read_text(errors="replace"))
            if theirs and len(mine & theirs) >= 2:
                leftover.append(f"the colors of {ex.name}; give the page its own: python3 /opt/ola/skills/designer/scripts/deal.py {page.name} --for \"<its title>\"")
    print(f"Register: {reg}" + (" (Bold rules, references/bold.md)" if bold else ""))
    shots = page.parent / ".shots"  # hidden: the front desk lists no path segment starting with "."
    shots.mkdir(exist_ok=True)
    see = None if a.no_see else shutil.which("ola-see")
    total, summary, made = 0, {"page": page.name, "name": a.name, "widths": {}}, {}
    modes = [False, True] if a.dark else [False]
    for dark in modes:
        for w in [int(x) for x in a.widths.split(",")]:
            tag = f"{w}" + ("-dark" if dark else "")
            shot, js = shots / f"{page.stem}-{a.name}-{tag}.png", shots / f"{page.stem}-{a.name}-{tag}.json"
            rc, err = run_page(page, w, shot, js, dark)
            if rc != 0:
                print(f"At {tag} px: the page could not be loaded: {err[:300]}")
                return 1
            made[tag] = shot
            r = json.loads(js.read_text())
            t = r.get("taste") or {}
            groups = [("broken", broken(r, w) + [x if x.startswith("the colors of ") else f"words left from the worked example ({x!r}): rewrite or delete them" for x in leftover]),("readable", readable(r, w, bold)), ("order", order(t, w, bold)), ("decorated", decorated(t, bold)),
                      ("bare", bare(t, r, w, bold)), ("usable", usable(t, w))]
            n = sum(len(g) for _, g in groups)
            total += n
            summary["widths"][tag] = {"defects": n, "shot": str(shot.relative_to(page.parent)), "found": {k: v for k, v in groups if v}}
            print(f"At {tag} px ({shot.relative_to(page.parent)}, {r['shot_size'][0]} x {r['shot_size'][1]} px): {n} things a program can find.")
            for k, g in groups:
                for f in g:
                    print(f"  - [{k}] {f}")
            first = t.get("first_screen") or []
            if first:
                print("  First screen, in order of weight: " + "; ".join(f'"{x["text"][:28]}" {x["size"]:g} px' for x in first[:4]))
    if see and "1280" in made and "390" in made:
        sheet = shots / f"{page.stem}-{a.name}-sheet.html"
        sheet.write_text(f"""<!doctype html><meta charset="utf-8"><style>body{{margin:0;padding:16px;background:#ddd;display:flex;gap:16px;align-items:flex-start}}
img{{display:block;background:#fff}} .l{{width:1000px}} .p{{width:300px}} .s{{width:1000px;filter:blur(7px) grayscale(1)}} div{{overflow:hidden;max-height:780px}}</style>
<div><img class="l" src="{html.escape(made['1280'].name)}"></div><div><img class="p" src="{html.escape(made['390'].name)}"></div><div><img class="s" src="{html.escape(made['1280'].name)}"></div>""")
        out = shots / f"{page.stem}-{a.name}-sheet.png"
        p = subprocess.run(["ola-page", str(sheet), "--width", "2400", "--height", "820", "--viewport", "--out", str(out)], capture_output=True, text=True, timeout=200)
        sheet.unlink(missing_ok=True)  # only the picture is kept; an .html here would look like one of the person's pages
        if p.returncode == 0:
            s = subprocess.run([see, str(out), QUESTION_BOLD if bold else QUESTION], capture_output=True, text=True, timeout=300)
            seen = (s.stdout or s.stderr).strip()
            summary["seen"] = seen[:4000]
            print("What ola-see saw (laptop, phone, and the laptop blurred):\n" + "\n".join("    " + l for l in seen.splitlines()[:40]))
    elif not see:
        print("I could not look at the page itself (no ola-see here); these are only the checks a program can make. Open the shots to judge the rest.")
    summary["defects"] = total
    summary["register"] = reg
    summary["looked"] = bool(see)
    (shots / f"{page.stem}-{a.name}.json").write_text(json.dumps(summary, indent=1))
    print(f"In all: {total} things a program can find. Fix the [broken] and [readable] ones first, then [order], [decorated], [bare], [usable].")
    return 0


if __name__ == "__main__":
    sys.exit(main())
