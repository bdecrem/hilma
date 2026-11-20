#!/usr/bin/env python3
"""PreToolUse guard for Bash: a commit that changes Ola must name its tracker issue.

Why (Bart, 2026-11-17): "should we have a ticket for each significant code change we make? time to make
a policy for that, no?" On that day 3 of 170 Ola commits named an issue, so the board's "Done" could not
say what each piece of work was for. A policy that lives only in notes gets broken; this is code.

What it refuses: `git commit` (not --amend) when the staged files, or files added in the same command,
touch Ola (apps/activist-ai/, the board src/app/kochito/kit/, scripts/venture/, apps/venture/schema/)
and the command text has no issue id like OLA-142. Open one first:
  node scripts/venture/issues.mjs add "what, in plain words" --area apps --pri P1 --start
A change that is only notes or a typo may say [no-issue] in its message instead.
"""
import json
import os
import re
import time
import subprocess
import sys

OLA_PATHS = ("apps/activist-ai/", "src/app/kochito/kit/", "scripts/venture/", "apps/venture/schema/")
CALLERS = os.path.expanduser("~/.claude/venture-callers.jsonl")


def note_caller(data: dict, cmd: str) -> None:
    """Who runs the tracker (OLA-251, OLA-263): Claude Code gives a hook the session id and, inside an
    agent, the agent's own id; a shell command gets neither (CLAUDE_CODE_SESSION_ID is the lead's, the
    same for every agent it starts). So before every Bash command that runs issues.mjs this records
    {at, session, agent, agent_type, cmd} in ~/.claude/venture-callers.jsonl, and issues.mjs finds its
    own call there (scripts/venture/_who.mjs). Never blocks anything."""
    try:
        row = {"at": time.time(), "session": data.get("session_id"), "agent": data.get("agent_id"), "agent_type": data.get("agent_type"), "cmd": cmd[:20000]}
        if os.path.exists(CALLERS) and os.path.getsize(CALLERS) > 4_000_000:
            with open(CALLERS) as f:
                keep = f.readlines()[-300:]
            tmp = CALLERS + ".tmp" + str(os.getpid())
            with open(tmp, "w") as f:
                f.writelines(keep)
            os.replace(tmp, CALLERS)
        with open(CALLERS, "a") as f:  # one short append: safe beside other agents' hooks
            f.write(json.dumps(row) + "\n")
    except Exception:
        pass


def tracker_version(path: str) -> int:
    try:
        m = re.search(r"TRACKER_VERSION = (\d+)", open(path).read())
        return int(m.group(1)) if m else 0
    except Exception:
        return -1


def old_tracker(data: dict, cmd: str) -> str:
    """OLA-273: an agent in a git worktree under .claude/worktrees/ runs its worktree's copy of the tracker,
    which has the rules of the day it was made. Refuse that copy when it is older than this checkout's
    (the TRACKER_VERSION line in scripts/venture/issues.mjs). Older copies have no version check of their own."""
    if "issues.mjs" not in cmd:
        return ""
    main_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    mine = tracker_version(os.path.join(main_root, "scripts/venture/issues.mjs"))
    places = [data.get("cwd") or ""] + re.findall(r"(\S*/\.claude/worktrees/[^/\s]+)", cmd)
    for p in places:
        m = re.search(r"^(.*?/\.claude/worktrees/[^/]+)", p)
        if not m:
            continue
        if re.search(r"(^|\s)(node\s+)?" + re.escape(main_root) + r"/scripts/venture/issues\.mjs", cmd) and p == (data.get("cwd") or ""):
            continue  # the main checkout's tracker, run from the worktree: the newest rules
        theirs = tracker_version(os.path.join(m.group(1), "scripts/venture/issues.mjs"))
        if theirs < mine:
            return (f"Blocked: {m.group(1)} has an older copy of the tracker (rules version {max(theirs, 0)}, the main checkout has {mine}). "
                    f"Rebase this worktree on origin/main (git pull --rebase) and run it again, or run the main checkout's: node {main_root}/scripts/venture/issues.mjs …\n")
    return ""


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if data.get("tool_name") != "Bash":
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""
    # the other venture tools and the server's deploy too (OLA-251, third pass: their overrides name the caller)
    if "issues.mjs" in cmd or "scripts/venture/" in cmd or "ola.mjs" in cmd or (re.search(r"\bgit\b[^\n;&|]*\bcommit\b", cmd) and re.search(r"OLA-\d+", cmd)):
        note_caller(data, cmd)  # a commit naming a ticket is recorded too: its maker does not pass its checks
    old = old_tracker(data, cmd)
    if old:
        sys.stderr.write(old)
        sys.exit(2)
    if not re.search(r"\bgit\b[^\n;&|]*\bcommit\b", cmd) or "--amend" in cmd:
        sys.exit(0)
    if re.search(r"OLA-\d+|\[no-issue\]", cmd):
        sys.exit(0)
    cwd = data.get("cwd") or None
    files = []
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=cwd, capture_output=True, text=True, timeout=5).stdout.strip()
        staged = subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=cwd, capture_output=True, text=True, timeout=5).stdout
        files += staged.split()
    except Exception:
        top = ""
    # files added in the same command: git add a b c && git commit ...
    for m in re.finditer(r"\bgit\s+add\s+([^;&|\n]+)", cmd):
        files += [f for f in m.group(1).split() if not f.startswith("-")]
    if not top.endswith("hilma") and "hilma" not in (cwd or ""):
        sys.exit(0)

    def ola(f: str) -> bool:
        f = f.strip("'\"")
        f = re.sub(r"^.*?/hilma/", "", f)
        return any(f.startswith(p) or ("/" + p) in ("/" + f) for p in OLA_PATHS)

    if any(ola(f) for f in files) or re.search(r"\bgit\s+add\s+(-A|--all|\.)(\s|$)", cmd) and any(ola(f) for f in files):
        sys.stderr.write(
            "Blocked by the issue guard: this commit changes Ola but names no tracker issue.\n"
            "Open one (or find it) and put its id, like [OLA-142], in the commit message:\n"
            "  node scripts/venture/issues.mjs add \"what, in plain words\" --area apps --pri P1 --start\n"
            "  node scripts/venture/issues.mjs list | grep doing\n"
            "Only a notes-only or typo change may say [no-issue] instead.\n"
        )
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
