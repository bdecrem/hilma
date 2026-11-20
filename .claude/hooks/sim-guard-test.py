#!/usr/bin/env python3
"""Tests for sim-guard.py: python3 .claude/hooks/sim-guard-test.py (prints one line per case, exits 1 on a failure).

Each case runs the hook as Claude Code does (JSON on stdin) with SIM_GUARD_MEMSIZE set to 8 GB or 16 GB,
from the repo root, so the real scripts under apps/ are what it reads.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
HOOK = os.path.join(HERE, "sim-guard.py")
GB8, GB16 = str(8 * 1024 ** 3), str(16 * 1024 ** 3)

BLOCK = [
    'xcrun simctl boot "iPhone 17 Pro"',
    "xcrun simctl bootstatus ABCD -b",
    "open -a Simulator",
    'open -a "Simulator.app"',
    "open -b com.apple.iphonesimulator",
    "open /Applications/Xcode-beta.app/Contents/Applications/DeviceHub.app",
    "xcodebuild -project Ola.xcodeproj -scheme OlaPhone -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test",
    "xcodebuild test-without-building -destination platform=iOS\\ Simulator,name=iPhone\\ 16",
    "apps/activist-ai/apple/tools/sim-shots.sh /tmp/x",
    "bash apps/activist-ai/apple/tools/phone-app-shots.sh /tmp/x",
    "cd apps/activist-ai/apple && tools/sim-dark-shots.sh /tmp/x",
    "cd apps/activist-ai/apple && OLA_SETTLE=5 ./tools/sim-shots.sh /tmp/x",
    "node scripts/dodo-scenes/capture.mjs --scene home",
    "apps/takt/scripts/shots.sh /tmp/x",
    "bash -c 'xcrun simctl boot X'",
    "echo hi; xcrun simctl boot X",
    "UDID=$(xcrun simctl boot X)",
    "ssh admin@100.95.51.98 'ls' && xcrun simctl boot X",
    "timeout 60 xcrun simctl boot X",
]
ALLOW = [
    "xcodebuild -project Ola.xcodeproj -scheme OlaPhone -destination 'generic/platform=iOS Simulator' build",
    "xcodebuild -scheme Feynd -destination 'platform=iOS Simulator,name=iPhone 16' build",
    "apps/activist-ai/apple/tools/build.sh sim",
    "xcrun simctl list devices booted",
    "xcrun simctl shutdown all",
    "xcrun simctl io booted screenshot /tmp/a.png",
    "ssh admin@100.95.51.98 'cd ~/ola-ship/apple && tools/build.sh sim && tools/sim-shots.sh /tmp/ola-shots'",
    "ssh admin@100.95.51.98 \"xcrun simctl boot 'iPhone 17 Pro'; xcrun simctl bootstatus X -b\"",
    "ssh -o ConnectTimeout=8 admin@100.95.51.98 bash -s <<'EOF'\nxcrun simctl boot X\nopen -a Simulator\nEOF",
    "git add apps/activist-ai/apple/tools/sim-shots.sh && git commit -m 'sim-shots.sh: no simctl boot on the iMac [OLA-215]'",
    "grep -n 'simctl boot' apps/activist-ai/apple/tools/sim-shots.sh",
    "cat apps/activist-ai/apple/tools/sim-shots.sh",
    "swift test --package-path apps/activist-ai/apple/OlaKit",
    "node scripts/venture/issues.mjs show OLA-215",
    "pnpm build",
]


def run(cmd: str, mem: str) -> int:
    env = dict(os.environ, SIM_GUARD_MEMSIZE=mem)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": ROOT})
    return subprocess.run([sys.executable, HOOK], input=payload, text=True, capture_output=True, env=env, cwd=ROOT).returncode


def main() -> None:
    bad = 0
    for cmd in BLOCK:
        ok = run(cmd, GB8) == 2 and run(cmd, GB16) == 0
        bad += not ok
        print(("ok   " if ok else "FAIL ") + "blocks on 8 GB, allows on 16 GB: " + cmd.replace("\n", " / "))
    for cmd in ALLOW:
        ok = run(cmd, GB8) == 0
        bad += not ok
        print(("ok   " if ok else "FAIL ") + "allows on 8 GB: " + cmd.replace("\n", " / "))
    print(f"{len(BLOCK) + len(ALLOW) - bad} of {len(BLOCK) + len(ALLOW)} pass")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
