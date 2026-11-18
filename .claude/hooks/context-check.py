#!/usr/bin/env python3
"""Tells Bart when a session's context is getting polluted and it is time for /clear.

Bart, 2026-11-17: "add a thing where you check from time to time about your context and
alert me when it's time to run /clear - probably at least once a day ... today the system
got bad because of context pollution".

Runs as a Stop hook (after every turn) and a PreCompact hook (a compaction is the strongest
sign: the session has already lost detail). Per session it keeps a small state file and
alerts once per level:

  soon  context >= 400k tokens, or the session is 14 h old, or it has compacted once
  now   context >= 600k tokens, or 24 h old, or compacted twice

An alert is a line in the terminal and a text to Bart (scripts/venture/imsg.mjs), naming
the session. Headless runs (claude -p, the Mac mini runner) never alert.
Test: python3 .claude/hooks/context-check.py --dry < hook.json
"""
import json, os, subprocess, sys, time
from datetime import datetime, timezone

SOON = dict(tokens=400_000, hours=14, compactions=1)
NOW = dict(tokens=600_000, hours=24, compactions=2)
DRY = "--dry" in sys.argv
STATE_DIR = os.path.expanduser("~/.claude/context-check" + ("-dry" if DRY else ""))


def ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def scan(path):
    tokens, first, title = 0, None, None
    try:
        with open(path) as f:
            for line in f:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if d.get("type") == "custom-title":
                    title = d.get("customTitle") or title
                t = ts(d.get("timestamp", "")) if d.get("timestamp") else None
                if t and first is None:
                    first = t
                m = d.get("message")
                if d.get("type") == "assistant" and isinstance(m, dict) and isinstance(m.get("usage"), dict):
                    u = m["usage"]
                    tokens = (u.get("input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
    except FileNotFoundError:
        pass
    return tokens, first, title


def main():
    if not DRY and os.environ.get("CLAUDE_CODE_ENTRYPOINT", "cli") != "cli":
        return  # headless: nobody to tell
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    sid = payload.get("session_id") or "unknown"
    path = payload.get("transcript_path") or ""
    event = payload.get("hook_event_name", "Stop")
    os.makedirs(STATE_DIR, exist_ok=True)
    sf = os.path.join(STATE_DIR, f"{sid}.json")
    try:
        state = json.load(open(sf))
    except Exception:
        state = {"compactions": 0, "alerted": []}
    if event == "PreCompact":
        state["compactions"] = state.get("compactions", 0) + 1

    tokens, first, title = scan(path)
    hours = (time.time() - first) / 3600 if first else 0
    comp = state.get("compactions", 0)

    def hit(lv):
        return tokens >= lv["tokens"] or hours >= lv["hours"] or comp >= lv["compactions"]

    level = "now" if hit(NOW) else "soon" if hit(SOON) else None
    msg = None
    if level and level not in state.get("alerted", []):
        why = []
        if tokens >= SOON["tokens"]: why.append(f"{tokens // 1000}k tokens of context")
        if hours >= SOON["hours"]: why.append(f"{hours:.0f} hours old")
        if comp: why.append(f"compacted {comp}x")
        name = f'"{title}"' if title else f"session {sid[:8]}"
        head = "Time to /clear" if level == "now" else "/clear soon"
        msg = (f"{head}: the {name} session is {', '.join(why)}. "
               f"Say \"handoff\" there and I'll write the state down, then type /clear.")
        state.setdefault("alerted", [])
        state["alerted"] += ["soon", "now"] if level == "now" else ["soon"]
    json.dump(state, open(sf, "w"))

    if not msg:
        return
    if DRY:
        print(msg)
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    imsg = os.path.join(root, "scripts/venture/imsg.mjs")
    if os.path.exists(imsg):
        subprocess.Popen(["node", imsg, "send", msg], cwd=root, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    print(json.dumps({"systemMessage": msg}))


main()
