#!/usr/bin/env python3
"""push-guard.py against made-up repos: python3 .claude/hooks/push-guard-test.py (exit 0 when all pass)."""
import json
import os
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "push-guard.py")


def repo(gate_exit):
    d = tempfile.mkdtemp(prefix="push-guard-test-")
    subprocess.run(["git", "init", "-q", d], check=True)
    if gate_exit is not None:
        os.makedirs(os.path.join(d, "apps/activist-ai/ops"))
        with open(os.path.join(d, "apps/activist-ai/ops/prepush.mjs"), "w") as f:
            f.write(f"console.log('FAIL  a made-up gate'); process.exit({gate_exit})\n")
    return d


def run(cmd, cwd):
    r = subprocess.run([sys.executable, HOOK], input=json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": cwd}), capture_output=True, text=True)
    return r.returncode, r.stderr


fails = 0


def t(name, ok, more=""):
    global fails
    fails += 0 if ok else 1
    print(f"{'pass' if ok else 'FAIL'}  {name}{'  (' + more + ')' if more and not ok else ''}")


bad, good, none = repo(1), repo(0), repo(None)
code, err = run("git push -q origin main", bad)
t("a push is refused when a gate fails, with the gate's own line", code == 2 and "a made-up gate" in err, f"{code} {err[:120]}")
t("a commit and a push in one command is a push", run("git commit -m x && git push", bad)[0] == 2)
t("a push from a folder the command changes to", run(f"cd {bad} && git push", none)[0] == 2)
t("a push goes through when the gates pass", run("git push", good)[0] == 0)
t("not a push: nothing runs", run("git status && echo push", bad)[0] == 0)
t("a repo without Ola's gates is left alone", run("git push", none)[0] == 0)
t("[skip-gates] lets a push through", run("git push  # [skip-gates]", bad)[0] == 0)
sys.exit(1 if fails else 0)
