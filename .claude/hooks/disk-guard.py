#!/usr/bin/env python3
"""PreToolUse guard for Bash: keep Bart's small iMac from running out of disk (OLA-226).

Why: on 2026-11-19 at about 11:55 pm the iMac (8 GB of memory, a 245 GB disk) hit 0 bytes free.
Five builders were each making their own Xcode build folder (-derivedDataPath in a session scratchpad,
0.5 to 2.2 GB each) plus unzipped app and eval copies. After that every shell command failed and
three builders stopped mid-work.

On by default on a Mac with 8 GB of memory or less; DISK_GUARD=1 turns it on anywhere, DISK_GUARD=0 off.
Free space is read with os.statvfs (no subprocess, nothing written), so it works on a full disk.

  under 5 GB free   refuses heavy commands: xcodebuild (builds, archives, tests), swift build / test,
                    ship-via-mini.sh with MINI=local, a local shell script that runs xcodebuild or swift build,
                    ditto -x / unzip / tar -x, cp -R and rsync of a tree over 100 MB (or a remote source),
                    npm / pnpm / yarn / bun install, pnpm build / next build, docker / container builds.
  under 1 GB free   refuses everything but cleanup: rm, rmdir, df, du, ls, cd, pwd, lsof, read-only filters,
                    git worktree remove / prune / list, find (with -delete only in scratch folders),
                    simctl shutdown / delete, npm cache clean, pnpm store prune, brew cleanup.
  any free space    an xcodebuild whose -derivedDataPath (or OLA_DERIVED) is inside /private/tmp/claude-*
                    or .claude/worktrees is told to use ~/Library/Developer/Xcode/DerivedData/ola-shared.

Commands inside `ssh <host> '...'` run on the other Mac and are not checked.
Exit 2 with a message on stderr blocks the call. Tests: disk-guard-test.py (DISK_GUARD_FREE fakes the
free space, DISK_GUARD_MEMSIZE the memory).
"""
import json
import os
import re
import shlex
import sys

GB = 1024 ** 3
HEAVY_UNDER = 5 * GB
ONLY_CLEANUP_UNDER = 1 * GB
MEM_LIMIT = 8 * GB
BIG_TREE = int(os.environ.get("DISK_GUARD_BIG_TREE") or 100 * 1024 ** 2)  # override: tests only
SHARED_DD = "~/Library/Developer/Xcode/DerivedData/ola-shared"

WRAPPERS = {"env", "sudo", "time", "nohup", "exec", "command", "caffeinate", "nice", "arch", "xargs"}
INTERPRETERS = {"bash", "sh", "zsh", "node", "python", "python3", "tsx", "bun", "deno", "ruby", "perl"}
SEPARATORS = {";", "&&", "||", "|", "&", "\n", "(", ")", "|&"}
SCRIPT_EXT = (".sh", ".zsh", ".bash", ".mjs", ".js", ".cjs", ".ts", ".py")
BUILDS_IN_TEXT = re.compile(r"(^|[\s;&|(`$])xcodebuild\s|swift\s+(build|test)\b")
READ_ONLY_FILTERS = {"sort", "head", "tail", "grep", "awk", "wc", "cut", "uniq", "tr", "echo", "printf",
                     "true", "false", "test", "[", "basename", "dirname", "stat", "date", "sleep", "which"}
CLEANUP = {"rm", "rmdir", "df", "du", "ls", "cd", "pwd", "lsof", "unlink"} | READ_ONLY_FILTERS


def scratch_roots():
    home = os.path.expanduser("~")
    roots = ["/private/tmp/", "/tmp/", "/private/var/folders/", "/var/folders/",
             home + "/Library/Developer/Xcode/DerivedData/", home + "/Library/Caches/"]
    tmp = os.environ.get("TMPDIR")
    if tmp:
        roots.append(os.path.realpath(tmp).rstrip("/") + "/")
    return roots


def enabled() -> bool:
    flag = os.environ.get("DISK_GUARD")
    if flag in ("0", "1"):
        return flag == "1"
    mem = os.environ.get("DISK_GUARD_MEMSIZE")  # tests only
    try:
        mem = int(mem) if mem else os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")
    except Exception:
        return False
    return 0 < mem <= MEM_LIMIT


def free_bytes():
    fake = os.environ.get("DISK_GUARD_FREE")  # tests only
    if fake:
        return int(fake)
    for vol in ("/System/Volumes/Data", "/"):
        try:
            s = os.statvfs(vol)
            return s.f_bavail * s.f_frsize
        except OSError:
            continue
    return None


# ---- parsing (the same shell reading as sim-guard.py) ----------------------------------------

def strip_ssh_heredocs(cmd: str) -> str:
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


def resolve(path: str, cwd: str) -> str:
    p = os.path.expanduser(path)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(cwd, p))


def in_scratch(path: str, cwd: str) -> bool:
    p = resolve(path, cwd)
    if "/.claude/worktrees/" in p + "/":
        return True
    return any((p + "/").startswith(r) for r in scratch_roots())


def private_build_folder(path: str, cwd: str) -> bool:
    p = resolve(path, cwd) + "/"
    return bool(re.match(r"^(/private)?/tmp/claude-", p)) or "/.claude/worktrees/" in p


def tree_size(path: str, cwd: str, limit: int) -> int:
    """Bytes under path, stopping once past limit (or past 50k entries, counted as large)."""
    p = resolve(path, cwd)
    try:
        if os.path.islink(p) or not os.path.isdir(p):
            return os.lstat(p).st_size if os.path.lexists(p) else 0
    except OSError:
        return 0
    total, n = 0, 0
    for root, dirs, files in os.walk(p):
        for f in files:
            n += 1
            try:
                total += os.lstat(os.path.join(root, f)).st_blocks * 512
            except OSError:
                pass
            if total > limit or n > 50_000:
                return limit + 1
    return total


def script_text(path: str, cwd: str) -> str:
    full = resolve(path, cwd)
    if not os.path.isfile(full):
        return ""
    try:
        with open(full, "r", errors="ignore") as f:
            return f.read(400_000)
    except Exception:
        return ""


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


# ---- the three checks -------------------------------------------------------------------------

def derived_data_hint(words, h, cwd):
    """An xcodebuild (or a build script) aimed at a private build folder in a scratchpad or worktree."""
    for w in words[:h]:
        m = re.match(r"^OLA_DERIVED=(.+)$", w)
        if m and private_build_folder(m.group(1), cwd):
            return "OLA_DERIVED=" + m.group(1)
    if os.path.basename(words[h]) != "xcodebuild":
        return None
    args = words[h + 1:]
    for i, a in enumerate(args):
        if a == "-derivedDataPath" and i + 1 < len(args) and private_build_folder(args[i + 1], cwd):
            return "-derivedDataPath " + args[i + 1]
        if a.startswith("-derivedDataPath=") and private_build_folder(a.split("=", 1)[1], cwd):
            return a
    return None


def heavy(words, h, cwd, whole: str, depth: int):
    """Why this one command is heavy on disk, or None."""
    head, args = words[h], words[h + 1:]
    base = os.path.basename(head)
    if base == "xcodebuild":
        if set(args) & {"-version", "-showsdks", "-list", "-showBuildSettings", "-help", "-usage", "-showdestinations"}:
            return None
        return "`xcodebuild` writes a build folder (0.5 to 2 GB)"
    if base == "swift" and args and args[0] in ("build", "test"):
        return "`swift " + args[0] + "` writes a build folder"
    if base == "ditto" and ("-x" in args or "-xk" in args):
        return "`ditto -x` unpacks an archive"
    if base in ("unzip", "7z", "unar"):
        return "`" + base + "` unpacks an archive"
    if base in ("tar", "gtar", "bsdtar") and args and re.match(r"^-?[a-zA-Z]*x", args[0]):
        return "`tar -x` unpacks an archive"
    if base in ("cp", "gcp"):
        flags = "".join(a[1:] for a in args if a.startswith("-") and not a.startswith("--"))
        if re.search(r"[Rra]", flags) or "--recursive" in args or "--archive" in args:
            srcs = [a for a in args if not a.startswith("-")][:-1]
            for s in srcs:
                if tree_size(s, cwd, BIG_TREE) > BIG_TREE:
                    return "`cp -R " + s + "` copies over 100 MB"
        return None
    if base == "rsync":
        paths = [a for a in args if not a.startswith("-")]
        if len(paths) >= 2:
            dest, srcs = paths[-1], paths[:-1]
            if re.match(r"^[^/]*:", dest):
                return None  # it lands on the other machine
            for s in srcs:
                if re.match(r"^[^/]*:", s):
                    return "`rsync` from " + s.split(":", 1)[0] + " copies a tree of unknown size here"
                if tree_size(s, cwd, BIG_TREE) > BIG_TREE:
                    return "`rsync " + s + "` copies over 100 MB"
        return None
    if base in ("npm", "pnpm", "yarn", "bun"):
        rest = [a for a in args if not a.startswith("-")]
        if base == "yarn" and not rest:
            return "`yarn` installs packages"
        if rest and rest[0] in ("install", "i", "ci", "add"):
            return "`" + base + " " + rest[0] + "` installs packages"
        if rest and rest[0] in ("run", "run-script"):
            rest = rest[1:]
        if rest and rest[0] == "build":
            return "`" + base + " build` builds the site (a large .next folder)"
        if rest and rest[0] == "exec" and len(rest) > 2 and rest[1] == "next" and rest[2] == "build":
            return "`next build` builds the site"
        if rest and depth < 3:
            script, where = package_script(rest[0], cwd)
            if script:
                why = check_heavy(script, where, depth + 1)
                if why:
                    return "`" + rest[0] + "` runs " + why
        return None
    if base == "next" and args and args[0] == "build":
        return "`next build` builds the site"
    if base == "npx" and len(args) >= 2 and args[0] == "next" and args[1] == "build":
        return "`next build` builds the site"
    if base in ("docker", "podman", "container"):
        if args and (args[0] in ("build", "buildx") or (args[0] == "compose" and "build" in args) or
                     (args[0] == "image" and len(args) > 1 and args[1] == "build")):
            return "`" + base + " build` writes image layers"
        return None
    # scripts: ship-via-mini.sh only with MINI=local; any other local script that runs xcodebuild / swift build
    script = None
    if base in INTERPRETERS:
        files = [a for a in args if not a.startswith("-")]
        if files and files[0].endswith(SCRIPT_EXT):
            script = files[0]
    elif "/" in head or head.endswith(SCRIPT_EXT):
        script = head
    if script:
        if os.path.basename(script) == "ship-via-mini.sh":
            if re.search(r"(^|[\s;&|(])(export\s+)?MINI=['\"]?local\b", whole):
                return "`ship-via-mini.sh` with MINI=local archives on this Mac"
            return None
        text = script_text(script, cwd) if script.endswith((".sh", ".zsh", ".bash")) or "." not in os.path.basename(script) else ""
        code = "\n".join(l for l in text.split("\n") if not l.lstrip().startswith("#"))
        if BUILDS_IN_TEXT.search(code):
            return "`" + os.path.basename(script) + "` runs xcodebuild or swift build"
    return None


def is_cleanup(words, h, cwd, toks_all) -> bool:
    head, args = words[h], words[h + 1:]
    base = os.path.basename(head)
    if base in CLEANUP:
        return True
    if base == "git":
        rest = [a for a in args if not a.startswith("-")]
        return len(rest) >= 2 and rest[0] == "worktree" and rest[1] in ("remove", "prune", "list")
    if base == "find":
        if any(a in ("-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fls") for a in args):
            return False
        if "-delete" in args:
            starts = []
            for a in args:
                if a.startswith("-") or a in ("!", "(", ")"):
                    break
                starts.append(a)
            return bool(starts) and all(in_scratch(s, cwd) for s in starts)
        return True
    if base in ("xcrun", "simctl"):
        if base == "xcrun":
            if "simctl" not in args:
                return False
            args = args[args.index("simctl") + 1:]
        return bool(args) and args[0] in ("shutdown", "delete", "list")
    if base == "npm":
        return args[:2] == ["cache", "clean"] or args[:1] == ["cache"] and "clean" in args
    if base == "pnpm":
        return args[:2] == ["store", "prune"]
    if base == "brew":
        return args[:1] == ["cleanup"]
    if base == "uv":
        return args[:2] == ["cache", "clean"]
    return False


def writes_a_file(toks) -> bool:
    for i, t in enumerate(toks):
        if t in (">", ">>", ">|", "&>"):
            target = toks[i + 1] if i + 1 < len(toks) else ""
            if target not in ("/dev/null", "&"):
                return True
    return False


def parse(cmd: str):
    try:
        toks = tokens(strip_ssh_heredocs(cmd))
    except ValueError:
        return None, None
    return toks, list(commands(toks))


def local_commands(cmds, cwd):
    """Yield (words, head index, cwd) for each command that runs on this Mac."""
    for words in cmds:
        h = head_index(words)
        if h is None:
            continue
        base = os.path.basename(words[h])
        if base in ("ssh", "mosh"):
            continue
        if base == "cd":
            target = words[h + 1] if len(words) > h + 1 else "~"
            cwd = resolve(target, cwd)
        yield words, h, cwd


def check_heavy(cmd: str, cwd: str, depth: int = 0):
    toks, cmds = parse(cmd)
    if cmds is None:
        if re.search(r"(^|[\s;&|(])(xcodebuild|unzip)\s", cmd) and not re.search(r"(^|[\s;&|(])ssh\s", cmd):
            return "it looks like it runs xcodebuild or unzip"
        return None
    for words, h, wd in local_commands(cmds, cwd):
        base = os.path.basename(words[h])
        if base in ("bash", "sh", "zsh") and "-c" in words[h + 1:]:
            args = words[h + 1:]
            i = args.index("-c")
            if i + 1 < len(args) and depth < 3:
                why = check_heavy(args[i + 1], wd, depth + 1)
                if why:
                    return why
            continue
        why = heavy(words, h, wd, cmd, depth)
        if why:
            return why
    return None


def check_dd(cmd: str, cwd: str, depth: int = 0):
    toks, cmds = parse(cmd)
    if cmds is None:
        return None
    for words, h, wd in local_commands(cmds, cwd):
        base = os.path.basename(words[h])
        if base in ("bash", "sh", "zsh") and "-c" in words[h + 1:] and depth < 3:
            args = words[h + 1:]
            i = args.index("-c")
            if i + 1 < len(args):
                why = check_dd(args[i + 1], wd, depth + 1)
                if why:
                    return why
            continue
        why = derived_data_hint(words, h, wd)
        if why:
            return why
    return None


def only_cleanup(cmd: str, cwd: str) -> bool:
    toks, cmds = parse(cmd)
    if cmds is None or writes_a_file(toks):
        return False
    for words, h, wd in local_commands(cmds, cwd):
        if not is_cleanup(words, h, wd, toks):
            return False
    return True


def gb(n: int) -> str:
    return ("%.1f" % (n / GB)) if n < 10 * GB else str(round(n / GB))


SAFE_TO_DELETE = (
    "What is safe to delete (memory note reference_imac_disk_cleanup.md; measure with df after each):\n"
    "  - your own session scratchpad's build folders and unzipped app copies (/private/tmp/claude-501/<project>/<session>/scratchpad/)\n"
    "  - $TMPDIR/ola-ship.* older than 3 h (du -xsh $TMPDIR/* first)\n"
    "  - ~/Library/Developer/Xcode/DerivedData/ola-* with no file touched in 3 h, when no xcodebuild runs\n"
    "  - hilma/.claude/worktrees/agent-*: plain `git worktree remove`, only unlocked, clean, 0 commits ahead of main\n"
    "  - ~/Library/Developer/Xcode/iOS DeviceSupport/*; npm cache clean --force, pnpm store prune, brew cleanup -s\n"
    "Never: another live session's scratchpad or locked worktree, ~/.openclaw, ~/.hermes, Podcasts, video renders,\n"
    "apps/activist-ai/evals (ask Bart). Do not work around this guard.\n"
)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if data.get("tool_name") != "Bash" or not enabled():
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or os.getcwd()
    free = free_bytes()

    if free is not None and free < ONLY_CLEANUP_UNDER and not only_cleanup(cmd, cwd):
        sys.stderr.write(
            "Blocked by the disk guard: this Mac has " + gb(free) + " GB free (under 1 GB), so only cleanup runs:\n"
            "rm, rmdir, df, du, ls, git worktree remove/prune, find ... -delete in scratch folders, npm cache clean,\n"
            "pnpm store prune, brew cleanup (no output redirected to a file). At 0 bytes every shell command fails\n"
            "(Nov 19, three builders stopped).\n" + SAFE_TO_DELETE)
        sys.exit(2)

    if re.search(r"derivedDataPath|OLA_DERIVED", cmd):
        why = check_dd(cmd, cwd)
        if why:
            sys.stderr.write(
                "Blocked by the disk guard: `" + why + "` puts a private Xcode build folder in a scratchpad or worktree\n"
                "(0.5 to 2.2 GB each; five of them filled this Mac's disk on Nov 19). Use the one shared folder:\n"
                "  -derivedDataPath " + SHARED_DD + "\n"
                "(apps/activist-ai/apple/tools/build.sh uses it by default; leave OLA_DERIVED unset).\n")
            sys.exit(2)

    if free is not None and free < HEAVY_UNDER:
        why = check_heavy(cmd, cwd)
        if why:
            sys.stderr.write(
                "Blocked by the disk guard: " + why + ", and this Mac has " + gb(free) + " GB free (under 5 GB).\n"
                "Free space first, or run it on the Mac mini (ssh admin@100.95.51.98).\n" + SAFE_TO_DELETE)
            sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
