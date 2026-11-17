#!/usr/bin/env python3
"""Render every screen of a clickable app prototype as a picture, at the device's real size.

    python3 /opt/ola/skills/app-designer/scripts/screens.py prototype.html --device iphone
    python3 /opt/ola/skills/app-designer/scripts/screens.py prototype.html --device mac --dark --ask

Finds each <section class="screen" id="..."> in the file, shows it alone (prototype.js reads
window.OLA_SCREEN) and renders it with `ola-page` at 393 x 852 (iphone, at 2x) or 1180 x 760 (mac).
Saves screens/<id>.png (and <id>-dark.png with --dark), and screens/sheet.png with every screen side by
side. Lists per screen what a program finds (contrast, tiny text, things past the edge, outside
requests, decoration, placeholder text), links to screens that do not exist, screens nothing links to,
and what a normal app has that this one lacks (Settings, About with a version). With --ask and
`ola-see`, a model looks at the sheet. Only Python's standard library.
"""
import argparse, html, json, re, shutil, subprocess, sys
from pathlib import Path

DEVICES = {"iphone": (393, 852, 2), "mac": (1180, 760, 1)}
ASK = ("These are the screens of one {device} app prototype, side by side, labeled by name. Judge them as a senior app designer. "
       "Does it feel like a normal, finished {device} app (standard navigation bars, back buttons, a tab bar or sidebar, settings, real content), "
       "or like a web page squeezed into a phone? List the five most important problems, each with the screen and one concrete fix: "
       "missing standard parts, inconsistent sizes or spacing, weak hierarchy, decoration that adds nothing (gradients, glows, emoji, illustrations), "
       "text too big or too small. Do not praise.")


VALUE = r"""=(?:"([^"]*)"|'([^']*)'|([^\s>"']+))"""


def attr(tag, name):
    """An attribute's value, quoted with " or ' or not at all; empty when absent."""
    m = re.search(r"\b" + name + VALUE, tag)
    return next((g for g in m.groups() if g is not None), "") if m else ""


def screens_in(text):
    out = []
    for m in re.finditer(r"<section\b[^>]*>", text):
        tag = m.group(0)
        cls, sid = attr(tag, "class"), attr(tag, "id")
        if sid and "screen" in cls.split():
            out.append(sid)
    return out


def main():
    ap = argparse.ArgumentParser(prog="screens.py")
    ap.add_argument("prototype")
    ap.add_argument("--device", choices=DEVICES, default="iphone")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--ask", action="store_true", help="ask ola-see to look at the sheet")
    a = ap.parse_args()
    proto = Path(a.prototype).resolve()
    if not proto.is_file():
        print(f"screens.py: no such file: {a.prototype}")
        return 2
    text = proto.read_text()
    ids = screens_in(text)
    if not ids:
        print('screens.py: no <section class="screen" id="..."> in the file; see assets/starter.html')
        return 2
    w, h, scale = DEVICES[a.device]
    out = proto.parent / "screens"
    out.mkdir(exist_ok=True)
    problems = []
    targets = {next(g for g in m if g) for m in re.findall(r"data-(?:go|tab)" + VALUE, text) if any(m)}
    for t in sorted(targets - set(ids)):
        problems.append(f"a link or tab opens \"{t}\", which is not a screen")
    for s in ids[1:]:
        if s not in targets:
            problems.append(f"nothing opens the screen \"{s}\" (add data-go or data-tab somewhere)")
    low = text.lower()
    if "settings" not in low:
        problems.append("no Settings: a normal app has one (references/normal-app.md)")
    elif not re.search(r"version \d", low):
        problems.append("Settings has no About row with the version (\"Version 1.0 (12)\")")
    if not re.search(r'<script[^>]*src="prototype\.js"', text):
        problems.append("prototype.js is not loaded: the screens cannot be clicked or shown one at a time")
    shots = []
    for dark in ([False, True] if a.dark else [False]):
        for sid in ids:
            tmp = proto.parent / f".screen-{sid}.html"
            inject = f'<script>window.OLA_SCREEN = {json.dumps(sid)}</script>'
            body = re.sub(r'(<script[^>]*src="prototype\.js")', inject + r"\1", text, count=1) if "prototype.js" in text else text.replace("</body>", inject + "</body>")
            tmp.write_text(body)
            name = sid + ("-dark" if dark else "")
            png, js = out / f"{name}.png", out / f"{name}.json"
            cmd = ["ola-page", str(tmp), "--width", str(w), "--height", str(h), "--viewport", "--scale", str(scale), "--out", str(png), "--json", str(js)] + (["--dark"] if dark else [])
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
            tmp.unlink(missing_ok=True)
            if p.returncode != 0:
                problems.append(f"{name}: could not render: {p.stderr.strip()[:200]}")
                continue
            r = json.loads(js.read_text())
            js.unlink()
            t = r.get("taste") or {}
            found = []
            found += [f"low contrast {x['ratio']}:1 \"{x['text'][:24]}\" ({x['color']} on {x['background']})" for x in r.get("low_contrast", [])[:4]]
            found += [f"tiny text {x['size']} px \"{x['text'][:24]}\"" for x in r.get("small_text", []) if x["size"] < 10][:3]
            found += [f"past the edge: {x['where']}" for x in r.get("past_right_edge", [])[:3]]
            found += [f"clipped: {x['where']} \"{x['text'][:24]}\"" for x in r.get("clipped", [])[:3]]
            found += [f"request to another address: {x}" for x in r.get("outside_requests", [])[:2]]
            if t.get("gradients"):
                found.append("a gradient: use flat fills")
            if t.get("emoji"):
                found.append(f"{t['emoji']} emoji: use the line icons")
            if t.get("placeholder"):
                found.append(f"placeholder text: {', '.join(t['placeholder'][:3])}")
            if len(t.get("accent_hues", [])) > 2:
                found.append(f"{len(t['accent_hues'])} accent colors: one tint")
            shots.append((name, png))
            print(f"{name}: {png.relative_to(proto.parent)}" + ("" if not found else ""))
            for f in found:
                print(f"  - {f}")
            problems += [f"{name}: {f}" for f in found]
    per_row = 6 if a.device == "iphone" else 2
    cw = 300 if a.device == "iphone" else 880
    cells = "".join(f'<figure><img src="{html.escape(p.name)}" alt=""><figcaption>{html.escape(n)}</figcaption></figure>' for n, p in shots)
    cols = min(per_row, len(shots)) or 1
    sheet = out / "sheet.html"
    sheet.write_text(f"""<!doctype html><meta charset="utf-8"><style>body{{margin:0;padding:24px;background:#e4e2de;font:15px system-ui,sans-serif}}
main{{display:grid;grid-template-columns:repeat({cols},{cw}px);gap:24px}} figure{{margin:0}} img{{width:100%;display:block;border-radius:{18 if a.device == 'iphone' else 8}px;box-shadow:0 0 0 1px #0002}}
figcaption{{margin-top:8px;color:#333}}</style><main>{cells}</main>""")
    sp = subprocess.run(["ola-page", str(sheet), "--width", str(min(3000, 48 + cols * (cw + 24))), "--out", str(out / "sheet.png")], capture_output=True, text=True, timeout=200)
    sheet.unlink(missing_ok=True)
    print(f"Saved {len(shots)} screens and {'screens/sheet.png' if sp.returncode == 0 else 'no sheet (' + sp.stderr.strip()[:120] + ')'}.")
    if problems:
        print(f"{len(problems)} things to fix:")
        for p in problems:
            print(f"  - {p}")
    else:
        print("Nothing a program can find. Now look at screens/sheet.png yourself.")
    (out / "screens.json").write_text(json.dumps({"device": a.device, "screens": [n for n, _ in shots], "problems": problems}, indent=1))
    if a.ask:
        see = shutil.which("ola-see")
        if see and sp.returncode == 0:
            s = subprocess.run([see, str(out / "sheet.png"), ASK.format(device="iPhone" if a.device == "iphone" else "Mac")], capture_output=True, text=True, timeout=300)
            print("What ola-see said:\n" + "\n".join("  " + l for l in (s.stdout or s.stderr).strip().splitlines()[:30]))
        else:
            print("I could not look at the screens with a model (no ola-see here); judge the sheet yourself.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
