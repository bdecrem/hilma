#!/usr/bin/env python3
"""Install Ola's skills somewhere other than the sealed image's /opt/ola/skills (Bart's own servers).

    python3 apps/activist-ai/skills/install.py ~/.ola-bart/skills

Copies every skill folder here into <dest> (made fresh), rewrites the image's path /opt/ola/skills in
the instructions and scripts to <dest> (which must have no spaces, so the commands in the skills work
as written), and makes the copy read-only. Prints the skill names, one per line, for the config's
allow list. Only Python's standard library; the Mac app does the same in Swift (OlaKit SkillsInstall).
"""
import shutil, stat, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = {".md", ".py", ".html", ".css", ".js", ".txt", ".json", ".jsonc"}


def install(dest):
    dest = Path(dest).expanduser().resolve()
    if " " in str(dest):
        raise SystemExit(f"install.py: {dest} has a space; the skills' commands would break")
    if dest.exists():
        for p in [dest, *dest.rglob("*")]:
            p.chmod(0o755 if p.is_dir() else 0o644)
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    names = sorted(d.name for d in HERE.iterdir() if d.is_dir() and not d.name.startswith((".", "_")) and (d / "SKILL.md").exists())
    for n in names:
        shutil.copytree(HERE / n, dest / n, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
    for p in dest.rglob("*"):
        if p.is_file() and p.suffix in TEXT:
            t = p.read_text(encoding="utf-8")
            if "/opt/ola/skills" in t:
                p.write_text(t.replace("/opt/ola/skills", str(dest)), encoding="utf-8")
    for p in sorted(dest.rglob("*"), reverse=True) + [dest]:
        p.chmod(0o555 if p.is_dir() else (0o555 if p.suffix == ".py" else 0o444))
    return names


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip())
        sys.exit(2)
    for n in install(sys.argv[1]):
        print(n)
