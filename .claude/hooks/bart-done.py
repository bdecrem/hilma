#!/usr/bin/env python3
"""UserPromptSubmit: when Bart says he did something, the tracker is updated the same turn.

Bart, 2026-11-17: "ola-81 and ola-122 have been closed - i signed the dev agreement and freed
up space. also i told the agent but somehow they did not update the tickets -> MAKE SURE THAT
DOES NOT HAPPEN AGAIN."

Every prompt in this repo gets a short note with the issues waiting on Bart (cached for two
minutes) and the rule: if his message reports any issue done (or anything on the tracker as
done, changed or no longer wanted), run scripts/venture/issues.mjs done/edit/drop for it
before replying, and say so in one line. Silent if the tracker cannot be read.
"""
import json, os, subprocess, sys, time

root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
cache = os.path.expanduser("~/.claude/bart-done-cache.txt")
try:
    json.load(sys.stdin)
except Exception:
    pass

waiting = None
try:
    if time.time() - os.path.getmtime(cache) < 120:
        waiting = open(cache).read()
except OSError:
    pass
if waiting is None:
    try:
        out = subprocess.run(["node", "scripts/venture/issues.mjs", "list", "--status", "waiting"],
                             cwd=root, capture_output=True, text=True, timeout=6)
        if out.returncode == 0:
            waiting = "\n".join(l for l in out.stdout.splitlines() if l.startswith("OLA-"))
            open(cache, "w").write(waiting)
    except Exception:
        waiting = None
if waiting is None:
    sys.exit(0)

note = ("Tracker rule (Bart, Nov 17): if this message says Bart did something, or that an issue is "
        "done, changed or not wanted, update the tracker FIRST with `node scripts/venture/issues.mjs "
        "done <id> --proof \"Bart: <his words>; checked: <what you verified>\"` (or edit/drop), "
        "then reply, saying in one line which issues you closed. This applies to things he says "
        "he did in voice transcripts and texts too.")
if waiting.strip():
    note += "\nWaiting on Bart right now:\n" + waiting
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": note}}))
