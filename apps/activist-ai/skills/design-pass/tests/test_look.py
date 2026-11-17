#!/usr/bin/env python3
"""The design-pass skill's own tests. Run inside the workspace image (ola-page and its renderer):
    python3 /opt/ola/skills/design-pass/tests/test_look.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
results = []


def case(name, ok, detail=""):
    results.append(ok)
    print(f"{'pass' if ok else 'FAIL'}  design-pass: {name}" + (f"  ({detail})" if detail and not ok else ""))


d = Path(tempfile.mkdtemp(prefix="look-test-"))
(d / "bad.html").write_text("""<!doctype html><html><head><meta name=viewport content="width=device-width"><title>Bad</title>
<style>body{font-family:Georgia;margin:0} h1{font-family:Impact} .x{font-family:Courier;color:#bbb;background:#fff;font-size:11px}
table{width:1100px} .clip{width:80px;overflow:hidden;white-space:nowrap}</style></head><body>
<h1>Members</h1><p class=x>Light gray small text that is hard to read.</p><div class=clip>A title that is far too long to fit</div>
<table><tr><td>A table that is much wider than a phone</td></tr></table><img src="http://example.test/logo.png" alt=""></body></html>""")
shutil.copy(HERE / "assets" / "base.css", d / "base.css")
(d / "good.html").write_text("""<!doctype html><html><head><meta name=viewport content="width=device-width"><title>Good</title><link rel=stylesheet href=base.css></head>
<body><main><h1>Members by region</h1><p>Four regions, 1,240 members in all.</p><div class=figures><div><div class=figure>1,240</div><small>members</small></div></div>
<div class=table-wrap><table><tr><th>Region</th><th class=num>Members</th></tr><tr><td>North</td><td class=num>410</td></tr></table></div>
<p class=note>Source: members.csv, made up for the test.</p></main></body></html>""")
look = [sys.executable, str(HERE / "scripts" / "look.py")]
r = subprocess.run(look + [str(d / "bad.html"), "--name", "before"], capture_output=True, text=True, timeout=300)
out = r.stdout
case("look runs at both widths and saves the shots", r.returncode == 0 and (d / "shots/bad-before-390.png").exists() and (d / "shots/bad-before-1280.png").exists(), out[-400:] + r.stderr[-300:])
case("it finds the sideways scroll at 390 px", "scrolls sideways" in out)
case("it finds the low contrast with its ratio", "low contrast" in out and "#bbbbbb on #ffffff" in out)
case("it finds the tiny text", "under 12 px" in out)
case("it finds the cut-off text", "cut off" in out)
case("it finds three fonts", "fonts in use" in out)
case("it reports the request to another address", "another address" in out)
if shutil.which("ola-see") is None:
    case("without ola-see it says in one line that it could not look", "I could not look at the page itself" in out)
r = subprocess.run(look + [str(d / "good.html"), "--name", "after"], capture_output=True, text=True, timeout=300)
s = json.loads((d / "shots/good-after.json").read_text()) if (d / "shots/good-after.json").exists() else {}
case("a page set with base.css has no defects a program can find", r.returncode == 0 and s.get("defects") == 0, r.stdout[-600:])
print(f"design-pass tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
