#!/usr/bin/env python3
"""The fonts that come with the designer skill, copied beside a page so it never loads one from the web.
Six for the Calm register and four display faces for the Bold one (Anton, Bowlby One, Fraunces, Space Grotesk).

    python3 /opt/ola/skills/designer/scripts/fonts.py list
    python3 /opt/ola/skills/designer/scripts/fonts.py add "Source Serif 4" "Public Sans" --to .

`add` copies each family's files and its license into <folder>/fonts/ and writes fonts/fonts.css with
the @font-face rules. Then the page links it (<link rel="stylesheet" href="fonts/fonts.css">) and
uses the stack it prints. Every family is under the SIL Open Font License 1.1 (fonts/OFL-*.txt),
which allows using and sending them with the page. Only Python's standard library.
"""
import argparse, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent / "assets" / "fonts"
SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
SERIF = 'Georgia, "Times New Roman", serif'
FAMILIES = {
    "Public Sans": dict(files=[("PublicSans.woff2", "normal"), ("PublicSans-Italic.woff2", "italic")], weight="100 900", license="OFL-PublicSans.txt",
                        fallback=SANS, note="plain, sturdy, civic: dashboards, forms, results"),
    "Instrument Sans": dict(files=[("InstrumentSans.woff2", "normal")], weight="400 700", license="OFL-InstrumentSans.txt",
                            fallback=SANS, note="crisp and contemporary: web apps, tools, sign-up flows"),
    "Bricolage Grotesque": dict(files=[("BricolageGrotesque.woff2", "normal")], weight="200 800", license="OFL-BricolageGrotesque.txt",
                                fallback=SANS, note="a grotesque with character: headlines of event and community pages"),
    "Source Serif 4": dict(files=[("SourceSerif4.woff2", "normal"), ("SourceSerif4-Italic.woff2", "italic")], weight="200 900", license="OFL-SourceSerif4.txt",
                           fallback=SERIF, note="a working serif, sharp when large: report headlines and numbers"),
    "Literata": dict(files=[("Literata.woff2", "normal"), ("Literata-Italic.woff2", "italic")], weight="200 900", license="OFL-Literata.txt",
                     fallback=SERIF, note="a calm reading serif: long text, letters, reports"),
    # Bold register display faces (references/bold.md): for big type with character, never for reading text.
    "Anton": dict(files=[("Anton.woff2", "normal")], weight="400", license="OFL-Anton.txt",
                  fallback='Impact, "Arial Narrow", sans-serif', note="Bold display: tall condensed poster capitals; dates, one-line headlines"),
    "Bowlby One": dict(files=[("BowlbyOne.woff2", "normal")], weight="400", license="OFL-BowlbyOne.txt",
                       fallback='"Arial Black", sans-serif', note="Bold display: fat, round, friendly; block parties, kids, fun"),
    "Fraunces": dict(files=[("Fraunces.woff2", "normal"), ("Fraunces-Italic.woff2", "italic")], weight="100 900", license="OFL-Fraunces.txt",
                     fallback=SERIF, note="Bold display: a soft, wonky old-style serif with italics; gorgeous dinners, galas, culture"),
    "Space Grotesk": dict(files=[("SpaceGrotesk.woff2", "normal")], weight="300 700", license="OFL-SpaceGrotesk.txt",
                          fallback=SANS, note="Bold: a modern grotesque with quirks; campaigns, youth, tech-forward; display or text"),
    "JetBrains Mono": dict(files=[("JetBrainsMono.woff2", "normal")], weight="100 800", license="OFL-JetBrainsMono.txt",
                           fallback='ui-monospace, Menlo, Consolas, monospace', note="monospaced: code and ids only"),
}


def find(name):
    for k in FAMILIES:
        if k.lower().replace(" ", "") == name.lower().replace(" ", ""):
            return k
    return None


def main():
    ap = argparse.ArgumentParser(prog="fonts.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    add = sub.add_parser("add")
    add.add_argument("family", nargs="+")
    add.add_argument("--to", default=".", help="the page's folder (fonts/ is made in it)")
    a = ap.parse_args()
    if a.cmd == "list":
        for k, v in FAMILIES.items():
            print(f"{k:22} {v['note']}")
        return 0
    names = []
    for f in a.family:
        k = find(f)
        if not k:
            print(f"fonts.py: no family named {f!r}. These come with the skill: {', '.join(FAMILIES)}")
            return 2
        names.append(k)
    if len(names) > 2:
        print("fonts.py: two families at most (one for headings, one for reading).")
        return 2
    out = Path(a.to) / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    css = Path(out / "fonts.css")
    rules = css.read_text() if css.exists() else ""
    for k in names:
        v = FAMILIES[k]
        for file, style in v["files"]:
            shutil.copyfile(HERE / file, out / file)
            rule = (f'@font-face {{ font-family: "{k}"; src: url("{file}") format("woff2"); font-style: {style}; '
                    f'font-weight: {v["weight"]}; font-display: swap; }}\n')
            if rule not in rules:
                rules += rule
        shutil.copyfile(HERE / v["license"], out / v["license"])
    css.write_text(rules)
    print(f"Copied {', '.join(names)} into {out}/ with their licenses, and wrote {css}.")
    print('In the page\'s <head>: <link rel="stylesheet" href="fonts/fonts.css">')
    for k in names:
        print(f'  font-family: "{k}", {FAMILIES[k]["fallback"]};')
    return 0


if __name__ == "__main__":
    sys.exit(main())
