#!/bin/bash
# Resumable: every step skips what the manifest says is done. Restart any time.
# usage: nohup bash scripts/gami/run-all.sh > ~/Desktop/GAMI/debug/run-all.out 2>&1 &
cd ~/Documents/coding2025/hilma
PY="uv run -q --with openpyxl --with requests --with ftfy --with pypdf --python 3.13 python -I"
TOTAL=1682
for ((start=0; start<TOTAL; start+=100)); do
  echo "=== batch $((start+1))-$((start+100)) $(date)"
  $PY scripts/gami/resolve.py --start $start --count 100
  node scripts/gami/fetch.mjs --headed
  $PY scripts/gami/verify.py 2>/dev/null | grep -v fontTools
  $PY scripts/gami/catalog.py > /dev/null 2>&1
  echo "$start" > ~/Desktop/GAMI/debug/last-batch.txt
done
echo "=== slow retry pass $(date)"
node scripts/gami/fetch.mjs --headed --slow
$PY scripts/gami/verify.py 2>/dev/null | grep -v fontTools
$PY scripts/gami/catalog.py > /dev/null 2>&1
echo "ALL_DONE $(date)"
