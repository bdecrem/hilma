#!/bin/sh
# sheet.sh <shot> <frames...>  → out/sheet-<shot>.jpg, the given frames at 640 wide, three across
cd "$(dirname "$0")/out" || exit 1
s=$1; shift; args=""; n=0; chains=""; ins=""; lay=""
for f in "$@"; do args="$args -i shots/$s/$(printf %05d $f).jpg"; chains="$chains[$n]scale=640:-1[v$n];"; ins="$ins[v$n]"; lay="$lay$(( (n%3)*640 ))_$(( (n/3)*360 ))|"; n=$((n+1)); done
ffmpeg -v error -y $args -filter_complex "${chains}${ins}xstack=inputs=$n:layout=${lay%|}" sheet-$s.jpg
