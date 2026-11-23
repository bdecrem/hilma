#!/usr/bin/env python3
"""Stop: when this session's turn ended at the plan's usage limit, record it (OLA-319).

`scripts/venture/usage.mjs limit --transcript <path>` reads the reset time from the limit message
("You've hit your session limit · resets 2am (America/Los_Angeles)") and stores it in venture_state
"runner_limit" with the tickets being worked: the runner pauses until the reset, then starts by itself
and continues those tickets first, and agent-guard.py refuses new agents until then. Cheap when the
turn ended normally: only the last lines of the transcript are read, and node runs only on a limit."""
import json, os, socket, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usage_cache

try:
    event = json.load(sys.stdin)
except Exception:
    sys.exit(0)
path = event.get("transcript_path")
if not path or not os.path.exists(path):
    sys.exit(0)
try:
    with open(path, "rb") as f:
        f.seek(max(0, os.path.getsize(path) - 200_000))
        tail = f.read().decode("utf8", "ignore").splitlines()[-40:]
except Exception:
    sys.exit(0)
if not any('"<synthetic>"' in l or "isApiErrorMessage" in l for l in tail):
    sys.exit(0)
try:
    out = subprocess.run(["node", "scripts/venture/usage.mjs", "limit", "--transcript", path,
                          "--by", f"a session on {socket.gethostname().split('.')[0]}"],
                         cwd=usage_cache.root(), capture_output=True, text=True, timeout=8)
    if out.stdout.strip():
        usage_cache.forget()
        print(json.dumps({"systemMessage": "Plan limit: " + out.stdout.strip().splitlines()[-1]}))
except Exception:
    pass
