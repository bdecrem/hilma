#!/usr/bin/env python3
"""Tests for disk-guard.py: python3 .claude/hooks/disk-guard-test.py (one line per case, exits 1 on a failure).

Each case runs the hook as Claude Code does (JSON on stdin) from the repo root, with DISK_GUARD_FREE faking
the free space, DISK_GUARD_MEMSIZE the memory (8 GB = on, 16 GB = off) and DISK_GUARD_BIG_TREE
the large-tree line (1 MB here, so apps/activist-ai/apple at ~4 MB is large and .claude/hooks is not).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
HOOK = os.path.join(HERE, "disk-guard.py")
GB = 1024 ** 3
GB8, GB16 = 8 * GB, 16 * GB
PLENTY, LOW, EMPTY = 40 * GB, 3 * GB, GB // 4
SCRATCH = "/private/tmp/claude-501/-Users-bart-Documents-code-hilma/abc/scratchpad"

# refused under 5 GB, allowed with 40 GB free and on a 16 GB Mac
HEAVY = [
    "xcodebuild -project Ola.xcodeproj -scheme OlaMac build",
    "cd apps/activist-ai/apple && xcodebuild archive -scheme OlaPhone -archivePath /tmp/x.xcarchive",
    "swift build --package-path apps/activist-ai/apple/OlaKit",
    "swift test --package-path apps/activist-ai/apple/OlaKit",
    "MINI=local apps/activist-ai/apple/testflight/ship-via-mini.sh mac",
    "export MINI=local; bash apps/activist-ai/apple/testflight/ship-via-mini.sh mac",
    "apps/activist-ai/apple/tools/build.sh sim",
    "cd apps/activist-ai/apple && tools/build.sh mac",
    "ditto -x -k Ola.zip /tmp/ola",
    "unzip -q Ola.zip -d /tmp/ola",
    "tar xzf Ola.xcarchive.tgz -C /tmp",
    "cp -R apps/activist-ai/apple /tmp/apple-copy",
    "rsync -a apps/activist-ai/apple/ /tmp/apple-copy/",
    "rsync -a admin@100.95.51.98:ola-ship/Mac.xcarchive /tmp/",
    "pnpm install",
    "npm ci",
    "pnpm build",
    "pnpm run build",
    "pnpm exec next build",
    "docker build -t x .",
    "container build -t x .",
    "bash -c 'xcodebuild -scheme Feynd build'",
]
# allowed under 5 GB (and above 1 GB)
LIGHT = [
    "xcodebuild -version",
    "xcodebuild -list -project apps/activist-ai/apple/Ola.xcodeproj",
    "ssh admin@100.95.51.98 'cd ~/ola-ship/apple && tools/build.sh sim'",
    "apps/activist-ai/apple/testflight/ship-via-mini.sh ios",
    "cp -R .claude/hooks /tmp/hooks-copy",
    "cp a.txt b.txt",
    "rsync -a apps/activist-ai/apple/ admin@100.95.51.98:ola-ship/apple/",
    "git status && git log --oneline -3",
    "node scripts/venture/issues.mjs show OLA-226",
    "pnpm exec tsc --noEmit",
    "python3 .claude/hooks/sim-guard-test.py",
    "df -h /",
]
# allowed under 1 GB
CLEANUP = [
    "df -h /",
    "du -xsh $TMPDIR/* | sort -h | tail -20",
    "rm -rf " + SCRATCH + "/dd-sim",
    "git worktree remove .claude/worktrees/agent-abc",
    "git worktree prune",
    "find " + SCRATCH + " -name '*.app' -prune -delete",
    "find /private/tmp/claude-501 -maxdepth 2 -type d",
    "ls -la ~/Library/Developer/Xcode/DerivedData 2>/dev/null",
    "xcrun simctl shutdown all",
    "npm cache clean --force && pnpm store prune && brew cleanup -s",
    "cd " + SCRATCH + " && rm -rf dd ws",
]
# refused under 1 GB
NOT_CLEANUP = [
    "git status",
    "node scripts/venture/issues.mjs show OLA-226",
    "find ~/Documents -name '*.mov' -delete",
    "find " + SCRATCH + " -exec rm {} +",
    "du -sh . > /tmp/sizes.txt",
    "python3 -c 'print(1)'",
    "echo hi; curl https://example.com",
]
# refused at any free space on this Mac: a private build folder in a scratchpad or worktree
PRIVATE_DD = [
    "xcodebuild -scheme OlaMac -derivedDataPath " + SCRATCH + "/dd build",
    "xcodebuild -scheme OlaMac -derivedDataPath /tmp/claude-501/x/dd build",
    "cd " + SCRATCH + " && xcodebuild -project /x/Ola.xcodeproj -scheme OlaMac -derivedDataPath dd build",
    "xcodebuild -scheme OlaMac -derivedDataPath=/Users/bart/Documents/code/hilma/.claude/worktrees/agent-x/dd build",
    "OLA_DERIVED=" + SCRATCH + "/dd apps/activist-ai/apple/tools/build.sh sim",
]
SHARED_DD = [
    "xcodebuild -scheme OlaMac -derivedDataPath ~/Library/Developer/Xcode/DerivedData/ola-shared build",
    "xcodebuild -scheme OlaMac -derivedDataPath /Users/bart/Library/Developer/Xcode/DerivedData/takt-ship-ios build",
    "ssh admin@100.95.51.98 'xcodebuild -derivedDataPath /tmp/claude-501/x/dd build'",
]


def run(cmd: str, free: int, mem: int = GB8) -> int:
    env = dict(os.environ, DISK_GUARD_FREE=str(free), DISK_GUARD_MEMSIZE=str(mem), DISK_GUARD_BIG_TREE=str(1024 ** 2))
    env.pop("DISK_GUARD", None)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": ROOT})
    return subprocess.run([sys.executable, HOOK], input=payload, text=True, capture_output=True, env=env, cwd=ROOT).returncode


def main() -> None:
    cases = []
    for c in HEAVY:
        cases.append(("refused at 3 GB, allowed at 40 GB and on 16 GB: ", c,
                      run(c, LOW) == 2 and run(c, PLENTY) == 0 and run(c, LOW, GB16) == 0))
    for c in LIGHT:
        cases.append(("allowed at 3 GB: ", c, run(c, LOW) == 0))
    for c in CLEANUP:
        cases.append(("allowed at 0.25 GB: ", c, run(c, EMPTY) == 0))
    for c in NOT_CLEANUP:
        cases.append(("refused at 0.25 GB, allowed at 3 GB: ", c, run(c, EMPTY) == 2 and run(c, LOW) == 0))
    for c in PRIVATE_DD:
        cases.append(("refused at 40 GB (private build folder), allowed on 16 GB: ", c,
                      run(c, PLENTY) == 2 and run(c, PLENTY, GB16) == 0))
    for c in SHARED_DD:
        cases.append(("allowed at 40 GB (shared or other build folder): ", c, run(c, PLENTY) == 0))
    # the real statvfs path: no fake free space
    env = dict(os.environ, DISK_GUARD_MEMSIZE=str(GB8))
    env.pop("DISK_GUARD_FREE", None)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": "df -h /"}, "cwd": ROOT})
    rc = subprocess.run([sys.executable, HOOK], input=payload, text=True, capture_output=True, env=env).returncode
    cases.append(("real statvfs, `df -h /` allowed: ", "", rc == 0))
    bad = 0
    for label, c, ok in cases:
        bad += not ok
        print(("ok   " if ok else "FAIL ") + label + c)
    print(f"{len(cases) - bad} of {len(cases)} pass")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
