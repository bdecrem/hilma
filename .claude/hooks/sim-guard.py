#!/usr/bin/env python3
"""PreToolUse guard for Bash: no simulator boots on a Mac with 8 GB of memory or less (OLA-215).

Why (Bart, 2026-11-19, correction 83): a builder's iPhone simulator ran about 230 processes on his
8 GB iMac while he was using it ("UGH a bunch of nonsense just happened"). A simulator left booted on
the same Mac had already pushed kernel_task to 90% and swap to 4 GB (2026-11-14). The rule "run the
simulator on the mini" lived in notes and was broken, so this is code.

What it refuses, on a Mac with hw.memsize <= 8 GB, when the command would run on this Mac:
  xcrun simctl boot, simctl bootstatus -b, open -a Simulator / DeviceHub (or their .app, or
  -b com.apple.iphonesimulator), xcodebuild test / test-without-building with a Simulator destination,
  and any local script that boots one (sim-shots.sh, phone-app-shots.sh, sim-dark-shots.sh, or a
  script run by bash / node / python / pnpm whose text runs simctl boot or opens the Simulator).
What it allows: compiling for the simulator (xcodebuild build, tools/build.sh sim), simctl list /
install / io / shutdown, and all of the above inside `ssh <host> '...'` (it runs on the other Mac).
Exit 2 with a message on stderr blocks the call and tells the model why. Tests: sim-guard-test.py.
"""
import json
import os
import re
import shlex
import subprocess
import sys

LIMIT = 8 * 1024 ** 3
MINI = "admin@100.95.51.98"
KNOWN = {"sim-shots.sh", "phone-app-shots.sh", "sim-dark-shots.sh"}
SCRIPT_EXT = (".sh", ".zsh", ".bash", ".mjs", ".js", ".cjs", ".ts", ".py")
BOOTS_IN_TEXT = re.compile(r"simctl\W{0,6}boot\b|simctl\W{0,6}bootstatus\b|open\s+-a\s+[\"']?(Simulator|DeviceHub)\b|com\.apple\.iphonesimulator")
WRAPPERS = {"env", "sudo", "time", "nohup", "exec", "command", "caffeinate", "nice", "arch", "xargs"}
INTERPRETERS = {"bash", "sh", "zsh", "node", "python", "python3", "tsx", "bun", "deno", "ruby", "perl"}
SEPARATORS = {";", "&&", "||", "|", "&", "\n", "(", ")", "|&"}


def memsize() -> int:
    override = os.environ.get("SIM_GUARD_MEMSIZE")  # tests only; set in the hook's env, not the command's
    if override:
        return int(override)
    try:
        return int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=3).stdout.strip())
    except Exception:
        return 0  # unknown: do not block


def strip_ssh_heredocs(cmd: str) -> str:
    """Drop the body of a heredoc fed to ssh: it runs on the other machine."""
    out, lines, i = [], cmd.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.search(r"<<-?\s*['\"]?(\w+)['\"]?", line)
        if m and re.search(r"(^|[\s;&|(])ssh\s", line):
            tag = m.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != tag:
                i += 1
        i += 1
    return "\n".join(out)


def tokens(cmd: str):
    lex = shlex.shlex(cmd, posix=True, punctuation_chars="();<>|&\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = "#"
    return list(lex)


def commands(toks):
    cur = []
    for t in toks:
        if t in SEPARATORS or set(t) <= set(";&|()\n"):
            if cur:
                yield cur
            cur = []
        else:
            cur.append(t)
    if cur:
        yield cur


def head_index(words):
    i = 0
    while i < len(words):
        w = words[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", w):
            i += 1
        elif os.path.basename(w) in WRAPPERS:
            i += 1
            while i < len(words) and words[i].startswith("-"):
                i += 1
        elif os.path.basename(w) in ("timeout", "gtimeout"):
            i += 2
        else:
            return i
    return None


def script_boots(path: str, cwd: str) -> bool:
    if os.path.basename(path) in KNOWN:
        return True
    full = path if os.path.isabs(path) else os.path.join(cwd, path)
    full = os.path.expanduser(full)
    if not os.path.isfile(full):
        return False
    try:
        with open(full, "r", errors="ignore") as f:
            return bool(BOOTS_IN_TEXT.search(f.read(400_000)))
    except Exception:
        return False


def package_script(name: str, cwd: str):
    d = cwd
    for _ in range(6):
        p = os.path.join(d, "package.json")
        if os.path.isfile(p):
            try:
                with open(p) as f:
                    return (json.load(f).get("scripts") or {}).get(name), d
            except Exception:
                return None, d
        if os.path.dirname(d) == d:
            break
        d = os.path.dirname(d)
    return None, cwd


def check(cmd: str, cwd: str, depth: int = 0):
    """Return why the command boots a simulator on this Mac, or None."""
    if depth > 4:
        return None
    try:
        cmds = list(commands(tokens(strip_ssh_heredocs(cmd))))
    except ValueError:
        # unbalanced quotes: fall back to a plain look, unless it all goes over ssh
        if BOOTS_IN_TEXT.search(cmd) and not re.search(r"(^|[\s;&|(])ssh\s", cmd):
            return "it looks like it boots a simulator"
        return None
    for words in cmds:
        h = head_index(words)
        if h is None:
            continue
        head, args = words[h], words[h + 1:]
        base = os.path.basename(head)
        if base in ("ssh", "mosh"):
            continue  # the rest runs on the other machine
        if base == "cd":
            target = args[0] if args else "~"
            cwd = os.path.normpath(os.path.join(cwd, os.path.expanduser(target)))
            continue
        if base in ("bash", "sh", "zsh") and "-c" in args:
            i = args.index("-c")
            if i + 1 < len(args):
                why = check(args[i + 1], cwd, depth + 1)
                if why:
                    return why
            continue
        if base in ("xcrun", "simctl"):
            if base == "xcrun":
                if "simctl" not in args:
                    continue
                args = args[args.index("simctl") + 1:]
            sub = args[0] if args else ""
            if sub == "boot":
                return "`simctl boot` starts a simulator"
            if sub == "bootstatus" and "-b" in args:
                return "`simctl bootstatus -b` boots the simulator"
            continue
        if base == "open":
            for i, a in enumerate(args):
                if a in ("-a", "-b") and i + 1 < len(args) and re.search(r"Simulator|DeviceHub|iphonesimulator", args[i + 1]):
                    return "`open " + a + " " + args[i + 1] + "` opens the Simulator"
                if re.search(r"(Simulator|DeviceHub)\.app", a):
                    return "it opens " + os.path.basename(a.rstrip("/"))
            continue
        if base in ("Simulator", "DeviceHub"):
            return "it starts " + base
        if base == "xcodebuild":
            acts = {"test", "test-without-building"} & set(args)
            dests = [args[i + 1] for i, a in enumerate(args) if a == "-destination" and i + 1 < len(args)]
            dests += [a.split("=", 1)[1] for a in args if a.startswith("-destination=")]
            if acts and any("Simulator" in d for d in dests):
                return "`xcodebuild " + sorted(acts)[0] + "` on a Simulator destination boots one"
            continue
        if base in ("pnpm", "npm", "yarn"):
            rest = [a for a in args if not a.startswith("-")]
            if rest and rest[0] in ("run", "run-script"):
                rest = rest[1:]
            if rest:
                script, where = package_script(rest[0], cwd)
                if script:
                    why = check(script, where, depth + 1)
                    if why:
                        return "`" + rest[0] + "` runs " + why
            continue
        if base in INTERPRETERS or base == "npx":
            files = [a for a in args if not a.startswith("-") and a not in ("tsx",)]
            if files and (files[0].endswith(SCRIPT_EXT) or os.path.basename(files[0]) in KNOWN) and script_boots(files[0], cwd):
                return "`" + os.path.basename(files[0]) + "` boots a simulator"
            continue
        if ("/" in head or head.endswith(SCRIPT_EXT)) and script_boots(head, cwd):
            return "`" + base + "` boots a simulator"
    return None


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if data.get("tool_name") != "Bash":
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if not re.search(r"simctl|Simulator|DeviceHub|iphonesimulator|xcodebuild|\.sh\b|\.m?js\b|\.ts\b|\.py\b|pnpm|npm|yarn", cmd):
        sys.exit(0)
    mem = memsize()
    if not mem or mem > LIMIT:
        sys.exit(0)
    why = check(cmd, data.get("cwd") or os.getcwd())
    if not why:
        sys.exit(0)
    sys.stderr.write(
        "Blocked by the simulator guard: " + why + ", and this Mac has " + str(round(mem / 1024 ** 3)) + " GB of memory.\n"
        "Bart works on this Mac; a booted simulator runs about 230 processes and makes it swap (Nov 19, correction 83).\n"
        "Run it on the Mac mini instead (it has Xcode; Ola's ship script builds in ~/ola-ship there):\n"
        "  ssh " + MINI + " 'cd ~/ola-ship/apple && tools/build.sh sim && tools/sim-shots.sh /tmp/ola-shots'\n"
        "  scp '" + MINI + ":/tmp/ola-shots/*.png' <dir>     # then look at the pictures here\n"
        "  (copy your branch there first, as testflight/ship-via-mini.sh does with rsync; other apps: a checkout on the mini)\n"
        "Compiling for the simulator stays allowed here: xcodebuild ... -destination 'generic/platform=iOS Simulator' build.\n"
        "Do not work around this guard; shut down any simulator you find booted here: xcrun simctl shutdown all.\n"
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
