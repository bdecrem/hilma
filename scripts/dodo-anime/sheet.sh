#!/bin/bash
# Contact sheet: sheet.sh out.png a.png b.png ... (each scaled to 390x844, side by side)
out=$1; shift
args=(); fc=""; i=0
for f in "$@"; do args+=(-i "$f"); fc+="[$i]scale=390:844[v$i];"; i=$((i+1)); done
for ((k=0;k<i;k++)); do fc+="[v$k]"; done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${fc}hstack=inputs=$i" "$out"
