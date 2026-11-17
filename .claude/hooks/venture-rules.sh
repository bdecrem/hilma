#!/bin/bash
# SessionStart hook: puts Bart's standing rules (apps/venture/private/RULES.md, distilled
# from every correction he has made) into the session's context at startup, resume, clear
# and after compaction. He asked on 2026-11-14 that these "are always part of your context".
# The file is private (gitignored); if it is missing (another machine before a
# `node scripts/venture/sync.mjs pull`), the hook does nothing.
f="${CLAUDE_PROJECT_DIR:-$(pwd)}/apps/venture/private/RULES.md"
[ -f "$f" ] || exit 0
jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: ("Standing rules from Bart'"'"'s corrections (apps/venture/private/RULES.md). They apply to all work in this repo:\n\n" + .)}}' < "$f"
