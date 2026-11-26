#!/usr/bin/env python3
"""PreToolUse guard for Bash: before `git push`, the quick gates of an Ola update run here (OLA-449).

Why (Nov 25, 2026): an update of the Studio's Ola was refused four times for things a few seconds on the
builder's machine would have shown (the abilities list out of step with the instructions, a skill
description the skills check rejects, a skills change with the old image tag, a lockfile the Studio's
npm would not install). Each cost a push, a wait and another push while Bart waited for a page: "EVERY
TIME I ASK FOR AN APP IT TAKES THIRTY MINUTES and then you tell me OOPS IT WILL BE ANOTHER 30 minutes".
A written rule to "run the gates first" was the first fix and it was not kept; this is code.

What it does: when the command pushes from the hilma repo, it runs apps/activist-ai/ops/prepush.mjs,
which looks at what differs from origin/main (the working tree counts, so `git commit … && git push`
in one command is covered) and runs only the gates that change touches. Nothing of Ola's changed: under
a second. A gate fails: the push is refused with its lines. `[skip-gates]` anywhere in the command
lets a push through (say why in the commit message).

Tests: python3 .claude/hooks/push-guard-test.py
"""
import json
import os
import re
import subprocess
import sys


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if data.get("tool_name") != "Bash":
        return 0
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if not re.search(r"\bgit\b[^\n;&|]*\bpush\b", cmd) or "[skip-gates]" in cmd:
        return 0
    cwd = data.get("cwd") or os.getcwd()
    # a command that first changes folder (cd <path> && … git push) pushes from there
    m = re.search(r"(?:^|[;&|]\s*)cd\s+([^\s;&|]+)", cmd)
    if m:
        p = os.path.expanduser(m.group(1).strip("'\""))
        if os.path.isdir(p):
            cwd = p
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=cwd, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return 0
    gate = os.path.join(top, "apps/activist-ai/ops/prepush.mjs")
    if not top or not os.path.exists(gate):
        return 0
    try:
        r = subprocess.run(["node", gate], cwd=top, capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired:
        sys.stderr.write("push guard: the quick gates did not finish in 4 minutes; run `node apps/activist-ai/ops/prepush.mjs` and look.\n")
        return 2
    except Exception:
        return 0
    if r.returncode == 0:
        return 0
    sys.stderr.write(
        "Blocked by the push guard (OLA-449): an update of Ola would refuse this push.\n"
        + (r.stdout or "")[-1500:]
        + "Fix what failed and push again (`node apps/activist-ai/ops/prepush.mjs` runs the same gates).\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
