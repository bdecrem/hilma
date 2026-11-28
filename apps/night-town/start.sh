#!/bin/zsh
# Starts the night town for the night on the Studio (OLA-527), from a fresh seed unless --resume:
#   apps/night-town/start.sh [--until 07:00] [--resume]
# The loop runs under caffeinate; if town.mjs crashes (exit 3) it is started again on the same town, until the end time.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
here=${0:A:h}; until=07:00; fresh=--fresh
while (( $# )); do case $1 in --until) until=$2; shift;; --resume) fresh=;; esac; shift; done
out=${NIGHT_TOWN_DIR:-$HOME/night-town}.out
nohup caffeinate -i zsh -c "
  node $here/town.mjs night $fresh --until $until; code=\$?
  while [[ \$code == 3 ]]; do echo \"\$(date) town.mjs crashed: starting it again on the same town\"; sleep 30; node $here/town.mjs night --until $until; code=\$?; done
" >> $out 2>&1 &
echo "started (pid $!), output $out"
