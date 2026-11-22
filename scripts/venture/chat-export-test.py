#!/usr/bin/env python3
"""OLA-274: the terminal-chat hook stores this machine's counts (steers.mjs, delegable.mjs --export)
by itself, at most once every 15 minutes, so a machine nobody runs sync.mjs push on is not missing
from the evening review.   python3 scripts/venture/chat-export-test.py"""
import importlib.util, os, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], "--dry"]  # DRY: decide, never spawn node
spec = importlib.util.spec_from_file_location("chat_export", os.path.join(here, "chat-export.py"))
src = open(spec.origin).read().replace("\nmain()\n", "\n")  # load without running the hook
mod = type(sys)("chat_export"); exec(compile(src, spec.origin, "exec"), mod.__dict__)

root = os.path.dirname(os.path.dirname(here))
stamps = tempfile.mkdtemp(prefix="export-stamp-")
ok = 0
cases = [
    ("first turn starts both exports", mod.export_counts(root, now=1_000_000, stamp_dir=stamps), ["steers.mjs", "delegable.mjs"]),
    ("a turn 5 minutes later starts none", mod.export_counts(root, now=1_000_300, stamp_dir=stamps), []),
    ("a turn 15 minutes after the first starts both", mod.export_counts(root, now=1_000_900, stamp_dir=stamps), ["steers.mjs", "delegable.mjs"]),
    ("a checkout without the scripts starts none", mod.export_counts(tempfile.mkdtemp(), now=1_000_000, stamp_dir=stamps), []),
]
for name, got, want in cases:
    good = got == want
    ok += good
    print(("PASS " if good else "FAIL ") + name + ("" if good else f": got {got}, want {want}"))
print(f"{ok} of {len(cases)}")
sys.exit(0 if ok == len(cases) else 1)
