#!/usr/bin/env python3
"""The designer skill's own tests. Run inside the workspace image (ola-page and its renderer):
    python3 /opt/ola/skills/designer/tests/test_designer.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
results = []


def case(name, ok, detail=""):
    results.append(bool(ok))
    print(f"{'pass' if ok else 'FAIL'}  designer: {name}" + (f"  ({detail})" if detail and not ok else ""))


def run(*args, timeout=300):
    return subprocess.run([sys.executable, *map(str, args)], capture_output=True, text=True, timeout=timeout)


d = Path(tempfile.mkdtemp(prefix="designer-test-"))
# The broken and the decorated: what look.py must find.
(d / "bad.html").write_text("""<!doctype html><html><head><meta name=viewport content="width=device-width"><title>Bad</title>
<style>body{font-family:Georgia;margin:0} h1{font-family:Impact} h1 em{color:#e0338a} .x{font-family:Courier;color:#bbb;background:#fff;font-size:11px}
table{width:1100px} .clip{width:80px;overflow:hidden;white-space:nowrap}
.hero{background:linear-gradient(90deg,#7b2ff7,#f107a3);padding:40px} .card{border-radius:24px;box-shadow:0 0 40px #8a5cf6;width:200px;height:90px;margin:8px;background:#fff}
.chip{display:inline-block;border-radius:999px;background:#e8f7f5;padding:4px 10px;font-size:13px}</style></head><body>
<div class=hero><h1>Empower your <em>community</em></h1></div><p class=x>Light gray small text that is hard to read.</p>
<div class=clip>A title that is far too long to fit</div><p>Lorem ipsum dolor sit amet. 🚀 ✨</p>
<span class=chip>Fast</span><span class=chip>Secure</span><span class=chip>Open</span><span class=chip>Free</span>
<div class=card></div><div class=card></div><div class=card></div><div class=card></div>
<table><tr><td>A table that is much wider than a phone</td></tr></table><img src="http://example.test/logo.png"></body></html>""")
look = [HERE / "scripts" / "look.py"]
r = run(*look, d / "bad.html", "--name", "before")
out = r.stdout
case("look runs at both widths and saves the shots", r.returncode == 0 and (d / "shots/bad-before-390.png").exists() and (d / "shots/bad-before-1280.png").exists(), out[-400:] + r.stderr[-300:])
case("it finds the sideways scroll at 390 px", "scrolls sideways" in out)
case("it finds the low contrast with its ratio", "low contrast" in out and "#bbbbbb on #ffffff" in out)
case("it finds the tiny text", "under 12 px" in out)
case("it finds the cut-off text", "cut off" in out)
case("it finds three fonts", "fonts in use" in out)
case("it reports the request to another address", "another address" in out)
case("it finds the gradient", "[decorated] gradient" in out, out[-800:])
case("it finds the glows", "[decorated] glows" in out)
case("it finds the rounded cards", "rounded boxes" in out)
case("it finds the pills", "pill-shaped" in out)
case("it finds the emoji", "emoji" in out)
case("it finds the colored phrase in the headline", "phrase inside the main heading" in out)
case("it finds the placeholder text", "placeholder text (Lorem ipsum" in out)
case("it finds the image without alt text", "without alt text" in out)
case("it lists the first screen in order of weight", "First screen, in order of weight" in out)
if shutil.which("ola-see") is None:
    case("without ola-see it says in one line that it could not look", "I could not look at the page itself" in out)

# The recipes themselves: a page made of them has nothing a program can find, at both widths.
for f in ("components.html", "base.css"):
    shutil.copy(HERE / "assets" / f, d / f)
r = run(*look, d / "components.html", "--name", "recipes", "--no-see")
s = json.loads((d / "shots/components-recipes.json").read_text()) if (d / "shots/components-recipes.json").exists() else {}
case("the component recipes have no defects a program can find", r.returncode == 0 and s.get("defects") == 0, r.stdout[-900:])

# The bare page: white, one blue, a table, one size.
(d / "plain.html").write_text("""<!doctype html><html><head><meta name=viewport content="width=device-width, initial-scale=1"><title>Plain</title>
<style>body{font:16px Arial;margin:16px;background:#fff;color:#111} h1{font-size:18px} a{color:#0645ad}</style></head><body><h1>Results</h1>
<p>See the table.</p><table><tr><td>North</td><td>12</td></tr><tr><td>South</td><td>9</td></tr></table><p><a href="#">More</a></p></body></html>""")
r = run(*look, d / "plain.html", "--name", "plain", "--no-see")
case("it calls a white page with one blue and no picture too plain", "[bare]" in r.stdout and "too plain" in r.stdout, r.stdout[-600:])
case("it says the first screen has no clear first thing", "no clear first thing" in r.stdout)

# palette.py: every hue, light and dark, passes its own contrast table.
bad = [h for h in range(0, 360, 30) if run(HERE / "scripts" / "palette.py", "--hue", h, "--dark").returncode != 0]
case("palette.py passes contrast for every hue, light and dark", not bad, f"failed hues {bad}")
r = run(HERE / "scripts" / "palette.py", "--from", "#25407a", "--css", d / "p.css")
case("palette.py keeps a brand color that reads on the paper", r.returncode == 0 and "--accent: #25407a" in (d / "p.css").read_text())

# fonts.py: the files and licenses are copied, and the page renders in the font.
r = run(HERE / "scripts" / "fonts.py", "add", "Source Serif 4", "Public Sans", "--to", d)
css = (d / "fonts/fonts.css").read_text() if (d / "fonts/fonts.css").exists() else ""
case("fonts.py copies the families, their licenses and the @font-face rules", r.returncode == 0 and css.count("@font-face") == 4
     and (d / "fonts/OFL-PublicSans.txt").exists() and (d / "fonts/SourceSerif4.woff2").exists(), r.stdout + r.stderr)
case("fonts.py refuses a third family", run(HERE / "scripts" / "fonts.py", "add", "Literata", "Public Sans", "Instrument Sans", "--to", d).returncode == 2)
(d / "typed.html").write_text("""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>T</title><link rel=stylesheet href=fonts/fonts.css>
<style>body{font-family:"Public Sans",sans-serif} h1{font-family:"Source Serif 4",serif}</style><h1>Rents in 2025</h1><p>Set in the bundled fonts.</p>""")
p = subprocess.run(["ola-page", str(d / "typed.html"), "--out", str(d / "typed.png"), "--json", str(d / "typed.json")], capture_output=True, text=True, timeout=200)
fams = json.loads((d / "typed.json").read_text()).get("font_families", {}) if p.returncode == 0 else {}
case("a page renders in the bundled fonts with no outside request", {"Public Sans", "Source Serif 4"} <= set(fams), str(fams))

# The Bold register (references/bold.md).
for p in ("riso", "night-neon", "candy", "duotone"):
    r = run(HERE / "scripts" / "palette.py", "--bold", "--preset", p, "--css", d / f"bold-{p}.css")
    case(f"palette.py --bold preset {p} passes its text contrast", r.returncode == 0, r.stdout[-400:])
r = run(HERE / "scripts" / "palette.py", "--bold", "--preset", "riso")
case("the riso preset keeps the approved colors", all(c in r.stdout for c in ("#ff4b1f", "#3d3bff", "#ffc31f", "#b6f23a", "#f7efdf", "#16121c")))
case("it says which colors may not carry text on the ground", "fields and shapes only" in r.stdout)
bad = [f"{s} {g} {h}" for s in ("complementary", "triadic", "analogous-clash", "split") for g in ("light", "dark") for h in range(0, 360, 45)
       if run(HERE / "scripts" / "palette.py", "--bold", "--scheme", s, "--hue", h, "--ground", g).returncode != 0]
case("palette.py --bold schemes pass contrast for every hue, light and dark", not bad, str(bad[:4]))
r = run(HERE / "scripts" / "fonts.py", "add", "Anton", "Space Grotesk", "--to", d / "boldfonts")
case("fonts.py adds the Bold display faces with their licenses", r.returncode == 0 and (d / "boldfonts/fonts/OFL-Anton.txt").exists() and (d / "boldfonts/fonts/SpaceGrotesk.woff2").exists(), r.stdout + r.stderr)
shutil.copytree(HERE / "assets" / "fonts", d / "fonts", dirs_exist_ok=True)
for ex in sorted((HERE / "assets").glob("bold-*.html")):
    shutil.copy(ex, d / ex.name)
    r = run(*look, d / ex.name, "--name", "ex", "--no-see")
    s = json.loads((d / f"shots/{ex.stem}-ex.json").read_text()) if (d / f"shots/{ex.stem}-ex.json").exists() else {}
    case(f"the Bold example {ex.name} is read as Bold and has no defects", s.get("register") == "bold" and s.get("defects") == 0, r.stdout[-700:])
shutil.copy(HERE / "assets" / "bold-rent-party.html", d / "copied.html")
r = run(*look, d / "copied.html", "--name", "cp", "--no-see")
case("a page copied from a worked example and not rewritten is called out", "words left from the worked example" in r.stdout, r.stdout[-500:])
# Bold allows a color system, a gradient behind a shape and rounded stickers ...
(d / "boldok.html").write_text("""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width, initial-scale=1"><meta name="ola-register" content="bold"><title>B</title>
<style>body{margin:0;background:#f7efdf;color:#16121c;font:18px/1.5 system-ui,sans-serif} .hero{background:#ff4b1f;padding:24px 16px} h1{font-size:96px;line-height:.9;margin:0}
.sky{width:300px;height:120px;background:linear-gradient(#ffc31f,#ff4b1f)} .st{display:inline-block;border-radius:24px;padding:20px;width:300px;height:170px;margin:6px}
.a{background:#3d3bff;color:#f7efdf}.b{background:#ffc31f}.c{background:#b6f23a}.e{background:#3d3bff;color:#f7efdf} :focus-visible{outline:3px solid #3d3bff}</style></head><body>
<div class=hero><h1>Block party June 14</h1></div><div class=sky aria-hidden=true></div><p>Music, food and games on Willow Lane from noon to 8 pm.</p>
<div class="st a">12 grills</div><div class="st b">3 bands</div><div class="st c">1 bouncy castle</div><div class="st e">40 tables</div></body></html>""")
r = run(*look, d / "boldok.html", "--name", "b", "--no-see")
case("in Bold, a color system, a gradient behind a shape and rounded stickers are not decoration", "Register: bold" in r.stdout and "- [decorated]" not in r.stdout and "- [bare]" not in r.stdout, r.stdout[-700:])
r = run(*look, d / "boldok.html", "--name", "c", "--no-see", "--register", "calm")
case("the same page under Calm is still called decorated", "[decorated] gradient" in r.stdout and "rounded boxes" in r.stdout and "too big" in r.stdout, r.stdout[-700:])
# ... but not glows, emoji or placeholder text, and a timid page is called out.
r = run(*look, d / "bad.html", "--name", "badbold", "--no-see", "--register", "bold")
case("in Bold, glows, emoji and placeholder text are still decoration", all(x in r.stdout for x in ("[decorated] glows", "emoji", "placeholder text")), r.stdout[-700:])
r = run(*look, d / "plain.html", "--name", "plainbold", "--no-see", "--register", "bold")
case("in Bold, a white page with one blue and small type is called timid", r.stdout.count("timid") >= 2, r.stdout[-700:])

# sheet.py: two pages side by side in one picture.
r = run(HERE / "scripts" / "sheet.py", d / "plain.html", d / "components.html", "--out", d / "sheet.png")
case("sheet.py puts two directions side by side", r.returncode == 0 and (d / "sheet.png").stat().st_size > 20000, r.stdout + r.stderr)
case("sheet.py keeps its working files hidden, so the project lists only the pages",
     (d / ".sheet-parts" / "sheet.html").exists() and not list(d.glob("sheet*.html")) and not (d / "sheet-parts").exists())

# sheet.py: one layout in two palettes is not two concepts (OLA-130); two layouts are.
FACTS = "<h1>Lena Ortiz</h1><p>Associate Professor of Linguistics</p><p>Syntax, semantics and corpus methods. She teaches Syntax I and Research Methods.</p>" \
        "<h2>Research</h2><p>Right dislocation, wh-placeholders and corpus annotation, across six languages and four corpora.</p><h2>Contact</h2><p>lena@example.org</p>"
def concept(name, css):
    (d / name).write_text(f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>{name}</title><style>{css}</style><main>{FACTS}</main>")
concept("one-a.html", "body{margin:0;background:#fdf9f4;color:#261e12;font:17px/1.6 serif} main{max-width:720px;margin:64px auto;padding:0 24px} h1{font-size:44px}")
concept("one-b.html", "body{margin:0;background:#f7f1ea;color:#2a1a10;font:17px/1.6 sans-serif} main{max-width:720px;margin:64px auto;padding:0 24px} h1{font-size:44px;color:#9f422b}")
concept("poster.html", "body{margin:0;background:#16121c;color:#f7efdf;font:15px/1.5 sans-serif} main{padding:0} h1{font-size:150px;line-height:.9;margin:0;padding:48px;background:#ff4b1f;color:#16121c} "
        "main>p,h2{margin:0 48px 8px auto;width:360px}")
concept("split.html", "body{margin:0;background:#eef2f7;color:#0f1d2b;font:16px/1.6 sans-serif} main{display:grid;grid-template-columns:420px 1fr;min-height:100vh} "
        "h1{grid-column:1;grid-row:1/9;margin:0;padding:64px 40px;font-size:40px;background:#0c60a3;color:#fff} main>*:not(h1){grid-column:2;padding:0 64px;margin:12px 0}")
r = run(HERE / "scripts" / "sheet.py", d / "one-a.html", d / "one-b.html", "--out", d / "same.png")
case("sheet.py says SAME LAYOUT for one page in two palettes, and exits 3", r.returncode == 3 and "SAME LAYOUT: A and B" in r.stdout, r.stdout[-400:] + r.stderr[-200:])
r = run(HERE / "scripts" / "sheet.py", d / "one-a.html", d / "poster.html", d / "split.html", "--out", d / "differ.png")
case("sheet.py passes three different layouts of the same facts", r.returncode == 0 and "SAME LAYOUT" not in r.stdout, r.stdout[-400:] + r.stderr[-200:])
print(f"designer tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
