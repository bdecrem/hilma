#!/usr/bin/env python3
"""The skills folder's own rules, checked on the host (workspace/check.mjs runs this too):

    python3 apps/activist-ai/skills/check.py

Every skill folder has a SKILL.md whose frontmatter has a name equal to the folder, a description,
metadata ola/version and ola/evals; a CHANGELOG.md whose last line names that version; and a tests/
folder. Every eval it names exists in evals/tasks and names this skill back (except a placeholder,
version 0, which may point at existing tasks). The system config's allow list
(workspace/opencode-system.jsonc) is exactly these folders. Instructions stay under 500 lines.
Prints one line per problem and 'skills check: N skills, all good'; exit 1 on any problem.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
problems = []


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    out, cur = {}, None
    for line in m.group(1).splitlines():
        if re.match(r"^\S[^:]*:\s*$", line):
            cur = line.split(":")[0].strip()
            out[cur] = {}
        elif line.startswith("  ") and cur and isinstance(out.get(cur), dict):
            k, _, v = line.strip().partition(":")
            out[cur][k.strip()] = v.strip().strip('"')
        else:
            k, _, v = line.partition(":")
            if re.search(r":\s", v):
                problems.append(f"frontmatter line has a second ': ' (YAML will not read it): {line[:60]}")
            out[k.strip()] = v.strip().strip('"')
            cur = None
    return out


skills = sorted(d.name for d in HERE.iterdir() if d.is_dir() and not d.name.startswith((".", "_")))
for name in skills:
    d = HERE / name
    if not (d / "SKILL.md").exists():
        problems.append(f"{name}: no SKILL.md")
        continue
    text = (d / "SKILL.md").read_text()
    fm = frontmatter(text)
    if fm is None:
        problems.append(f"{name}: SKILL.md has no frontmatter")
        continue
    meta = fm.get("metadata") if isinstance(fm.get("metadata"), dict) else {}
    if fm.get("name") != name:
        problems.append(f"{name}: frontmatter name is {fm.get('name')!r}")
    if len(fm.get("description", "")) < 60:
        problems.append(f"{name}: the description is too short to tell the agent when to load it")
    version = meta.get("ola/version")
    if not version or not version.isdigit():
        problems.append(f"{name}: no metadata ola/version")
    if len(text.splitlines()) > 500:
        problems.append(f"{name}: SKILL.md is over 500 lines")
    log = (d / "CHANGELOG.md").read_text() if (d / "CHANGELOG.md").exists() else ""
    entries = [l for l in log.splitlines() if l.startswith("- ")]
    if not entries or not entries[-1].startswith(f"- {version},"):
        problems.append(f"{name}: CHANGELOG.md's last entry is not version {version}")
    if not (d / "tests").is_dir():
        problems.append(f"{name}: no tests/ folder")
    elif version != "0" and not list((d / "tests").glob("test_*.py")):
        problems.append(f"{name}: no tests/test_*.py")
    for tid in (meta.get("ola/evals") or "").split():
        tj = ROOT / "evals" / "tasks" / tid / "task.json"
        if not tj.exists():
            problems.append(f"{name}: names eval {tid}, which does not exist")
        elif version != "0" and json.loads(tj.read_text()).get("skill") != name:
            problems.append(f"{name}: eval {tid} does not name this skill back")
    if version != "0" and len((meta.get("ola/evals") or "").split()) < 2:
        problems.append(f"{name}: fewer than two evals")
    for s in re.findall(r"/opt/ola/skills/([a-z0-9-]+)/([\w./-]+)", text):
        if not (HERE / s[0] / s[1]).exists():
            problems.append(f"{name}: SKILL.md names /opt/ola/skills/{s[0]}/{s[1]}, which is not in the repo")
sysconf = (ROOT / "workspace" / "opencode-system.jsonc").read_text()
allowed = sorted(re.findall(r'"skill\.use", "resource": "([a-z0-9-]+)", "effect": "allow"', sysconf))
if allowed != skills:
    problems.append(f"opencode-system.jsonc allows {allowed}, the folders are {skills}")
if '"resource": "*", "effect": "deny"' not in sysconf:
    problems.append("opencode-system.jsonc does not deny every other skill")
for p in problems:
    print("FAIL  " + p)
print(f"skills check: {len(skills)} skills, " + ("all good" if not problems else f"{len(problems)} problems"))
sys.exit(1 if problems else 0)
