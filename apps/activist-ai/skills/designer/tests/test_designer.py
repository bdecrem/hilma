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

# sheet.py: two pages side by side in one picture.
r = run(HERE / "scripts" / "sheet.py", d / "plain.html", d / "components.html", "--out", d / "sheet.png")
case("sheet.py puts two directions side by side", r.returncode == 0 and (d / "sheet.png").stat().st_size > 20000, r.stdout + r.stderr)
print(f"designer tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
