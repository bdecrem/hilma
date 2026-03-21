#!/bin/bash
# Nova Scan — runs Claude Code with prompt-nova.txt, outputs markdown report
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt-nova.txt"
OUTPUT_FILE="$SCRIPT_DIR/nova-scan-$(date +%Y%m%d).md"

echo "🔍 Running Nova ideation scan via Claude Code..."
echo "   Output: $OUTPUT_FILE"

claude --print --dangerously-skip-permissions \
  --max-turns 30 \
  --output-format text \
  "$(cat "$PROMPT_FILE")" \
  > "$OUTPUT_FILE" 2>/dev/null

LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
if [ "$LINE_COUNT" -lt 50 ]; then
  echo "⚠️  Warning: Output is only $LINE_COUNT lines — report may be truncated"
  echo "   Check $OUTPUT_FILE"
fi

echo "✅ Scan complete: $OUTPUT_FILE ($LINE_COUNT lines)"
