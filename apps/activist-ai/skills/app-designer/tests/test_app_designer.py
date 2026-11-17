#!/usr/bin/env python3
"""The app-designer skill's own tests. Run inside the workspace image (ola-page and its renderer):
    python3 /opt/ola/skills/app-designer/tests/test_app_designer.py"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
FONTS = HERE.parent / "designer" / "scripts" / "fonts.py"
results = []


def case(name, ok, detail=""):
    results.append(bool(ok))
    print(f"{'pass' if ok else 'FAIL'}  app-designer: {name}" + (f"  ({detail})" if detail and not ok else ""))


d = Path(tempfile.mkdtemp(prefix="app-test-"))
shutil.copy(HERE / "assets" / "starter.html", d / "prototype.html")
for f in ("app.css", "prototype.js"):
    shutil.copy(HERE / "assets" / f, d / f)
subprocess.run([sys.executable, str(FONTS), "add", "Instrument Sans", "--to", str(d)], capture_output=True, timeout=60)
r = subprocess.run([sys.executable, str(HERE / "scripts" / "screens.py"), str(d / "prototype.html"), "--device", "iphone", "--dark"], capture_output=True, text=True, timeout=600)
out = r.stdout
rep = json.loads((d / "screens/screens.json").read_text()) if (d / "screens/screens.json").exists() else {}
case("every screen of the starter renders, light and dark", r.returncode == 0 and len(rep.get("screens", [])) == 10, out[-600:] + r.stderr[-300:])
case("each shot is the phone's size at 2x", all((d / f"screens/{s}.png").exists() for s in ("reports", "settings")) and
     open(d / "screens/reports.png", "rb").read(24)[16:24] == (786).to_bytes(4, "big") + (1704).to_bytes(4, "big"))
case("the sheet of all screens is made", (d / "screens/sheet.png").exists())
case("the starter has nothing a program can find", rep.get("problems") == [], str(rep.get("problems"))[:600])
# A prototype missing the normal parts, with a broken link and decoration.
(d / "bad.html").write_text("""<!doctype html><meta name=viewport content="width=device-width"><link rel=stylesheet href=app.css>
<div class=device><section class=screen id=home><h1 class=large style="background:linear-gradient(#f0f,#0ff)">Home 🚀</h1>
<p>Lorem ipsum dolor sit amet</p><a data-go="detail">Open</a></section><section class=screen id=orphan><p>Nobody opens me</p></section></div><script src=prototype.js></script>""")
r = subprocess.run([sys.executable, str(HERE / "scripts" / "screens.py"), str(d / "bad.html")], capture_output=True, text=True, timeout=300)
o = r.stdout
case("it finds the link to a screen that does not exist", 'opens "detail", which is not a screen' in o, o[-500:])
case("it finds the screen nothing opens", 'nothing opens the screen "orphan"' in o)
case("it says a normal app has Settings", "no Settings" in o)
case("it finds the gradient, the emoji and the placeholder text", "gradient" in o and "emoji" in o and "placeholder text" in o)
print(f"app-designer tests: {sum(results)} of {len(results)} passed")
sys.exit(0 if all(results) else 1)
