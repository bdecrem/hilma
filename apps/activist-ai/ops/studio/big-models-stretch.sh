#!/bin/zsh
# A stretch model (Bart, Nov 26: "more capable but that may be too big and slow, and run at least a few
# tests"): Inkling Small at 3-bit, 107 GB, where the Studio has about 100 GB free, so it may swap.
#   nohup caffeinate -i ~/big-test/hilma/apps/activist-ai/ops/studio/big-models-stretch.sh > ~/big-test/stretch.log 2>&1 &
# Waits for its download and for the night's test and the catch-up to end, then runs three requests
# (the spreadsheet, chess, Sudoku: 30 minutes each at most) and the medium ticket (40 minutes at most).
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
here=${0:A:h}
say() { echo "$(date '+%b %d %H:%M:%S') $*"; }
say "waiting for the download"
until [[ -e $HOME/ola-models/big/Inkling-Small-3bit/.complete ]]; do sleep 60; done
say "waiting for the night's test and the catch-up to end"
sleep 90
while pgrep -f "studio/big-models-night.sh|studio/big-models-hard.sh" > /dev/null; do sleep 30; done
TASKS=spreadsheet,chess,sudoku TIME=1800 TICKETS=ola-337-deepseek TICKET_TIME=2400 $here/big-models-hard.sh inkling-small-3
say "stretch finished"
