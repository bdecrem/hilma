#!/bin/bash
# SessionStart hook: Bart's standing rules in every session's context. The work is in
# venture-rules.py (a digest that fits Claude Code's 10,000-character cap on hook context; the
# whole 34,000-character file used to be printed and was cut to its first 2,000). This file stays
# because .claude/settings.json names it.
exec python3 "$(dirname "$0")/venture-rules.py"
