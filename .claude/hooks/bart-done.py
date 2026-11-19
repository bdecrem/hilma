#!/usr/bin/env python3
"""UserPromptSubmit: when Bart says he did something, the tracker is updated the same turn; and
what Bart wrote on the board is in front of every session.

Bart, 2026-11-17: "ola-81 and ola-122 have been closed - i signed the dev agreement and freed
up space. also i told the agent but somehow they did not update the tickets -> MAKE SURE THAT
DOES NOT HAPPEN AGAIN."

Every prompt in this repo gets a short note with the issues waiting on Bart, the rule (if his
message reports any issue done, changed or no longer wanted, run scripts/venture/issues.mjs
done/edit/drop for it before replying, and say so in one line), and, since 2026-11-18 (OLA-163),
what Bart wrote on the board that Kit has not read yet: comments, edits, status changes and new
issues from app.kochitolabs.com (`issues.mjs inbox`; mark them read with `inbox --mark`).
Since 2026-11-18 (OLA-171) also the days whose daily sweep is still owed (apps/venture/SWEEP.md).
One node call (`issues.mjs hook`), cached for two minutes. Silent if the tracker cannot be read.
"""
import json, os, subprocess, sys, time

root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
cache = os.path.expanduser("~/.claude/bart-done-cache.json")
try:
    json.load(sys.stdin)
except Exception:
    pass

data = None
try:
    if time.time() - os.path.getmtime(cache) < 120:
        data = json.load(open(cache))
except Exception:
    data = None
if data is None:
    try:
        out = subprocess.run(["node", "scripts/venture/issues.mjs", "hook"],
                             cwd=root, capture_output=True, text=True, timeout=6)
        if out.returncode == 0:
            data = json.loads(out.stdout.strip().splitlines()[-1])
            json.dump(data, open(cache, "w"))
    except Exception:
        data = None
if not isinstance(data, dict):
    sys.exit(0)

note = ("Tracker rule (Bart, Nov 17): if this message says Bart did something, or that an issue is "
        "done, changed or not wanted, update the tracker FIRST with `node scripts/venture/issues.mjs "
        "done <id> --proof \"Bart: <his words>; checked: <what you verified>\"` (or edit/drop), "
        "then reply, saying in one line which issues you closed. This applies to things he says "
        "he did in voice transcripts and texts too.")
waiting = [l for l in data.get("waiting") or [] if isinstance(l, str)]
unread = [l for l in data.get("unread") or [] if isinstance(l, str)]
if waiting:
    note += "\nWaiting on Bart right now:\n" + "\n".join(waiting)
if unread:
    note += ("\nBart wrote on the board and Kit has not read it yet (act on it, answer with "
             "`issues.mjs comment <id> \"...\"`, then `issues.mjs inbox --mark`):\n" + "\n".join(unread[:20]))
sweep = [d for d in data.get("sweep") or [] if isinstance(d, str)]
if sweep:
    note += ("\nThe daily sweep has not been done for " + ", ".join(sweep) + ": when the work in hand allows, and "
             "before this session ends, follow apps/venture/SWEEP.md (it ends with `sweep.mjs post`). "
             "Do not tell Bart about it; the Learning page is where he reads it.")
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": note}}))
