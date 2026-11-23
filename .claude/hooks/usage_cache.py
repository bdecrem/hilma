"""Plan usage for the hooks (OLA-319): the one line `scripts/venture/usage.mjs line --json` prints,
cached in ~/.claude/venture-usage.json so a prompt never waits on it.

Bart, Nov 20, 7:15 pm: "You need to keep an eye on usage- we may hit usage limits and need to resume
after 2am". Used by bart-done.py (the line before every prompt), agent-guard.py (the line before an
Agent call, and the refusal once a limit is recorded) and limit-watch.py (a session's own limit)."""
import json, os, subprocess, time

CACHE = os.environ.get("VENTURE_USAGE_CACHE") or os.path.expanduser("~/.claude/venture-usage.json")


def root():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def read(max_age, wait=False, probe=False):
    """The cached reading, refreshed when older than max_age seconds: in the background (the stale
    reading is returned) unless wait, then in place (up to 8 s). None when there is none."""
    data = None
    try:
        data = json.load(open(CACHE))
        fresh = time.time() - os.path.getmtime(CACHE) < max_age
    except Exception:
        fresh = False
    if fresh:
        return data
    args = ["node", "scripts/venture/usage.mjs", "line", "--json"] + (["--probe"] if probe else [])
    if wait or data is None:
        try:
            out = subprocess.run(args, cwd=root(), capture_output=True, text=True, timeout=8)
            if out.returncode == 0:
                data = json.loads(out.stdout.strip().splitlines()[-1])
                write(data)
        except Exception:
            pass
        return data
    try:  # refresh for the next prompt, never wait for it
        subprocess.Popen(["/bin/sh", "-c", " ".join(f"'{a}'" for a in args) + f" > '{CACHE}.tmp' && mv '{CACHE}.tmp' '{CACHE}'"],
                         cwd=root(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except Exception:
        pass
    return data


def write(data):
    try:
        json.dump(data, open(CACHE + ".tmp", "w"))
        os.replace(CACHE + ".tmp", CACHE)
    except Exception:
        pass


def forget():
    try:
        os.remove(CACHE)
    except Exception:
        pass


def limit_live(data):
    """The recorded limit while it holds, else None."""
    lim = (data or {}).get("limit") or None
    if not lim or not lim.get("until"):
        return None
    try:
        from datetime import datetime, timezone
        until = datetime.fromisoformat(lim["until"].replace("Z", "+00:00"))
        return lim if until > datetime.now(timezone.utc) else None
    except Exception:
        return None
