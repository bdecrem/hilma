#!/bin/bash
# Cut a simulator recording into the promo video: hard cuts, 30 fps, a full-res master (CRF 18),
# a 900×1956 web version (the frame of public/surf/hero.jpg, CRF 23), a poster frame from the last
# second, and a 2 fps contact sheet of the cut to check it.
#
#   scripts/surf/cut.sh <rec.mov> <out-base> a:b a:b …      (segment bounds in seconds, in order)
#
# The 2026-09-24 cut (28.5 s from a 2:45 build of "a pomodoro timer that screams at me"):
#   17.9:23.1 27.6:31.4 44.6:47.9 62.6:64.8 89.5:92.0 128.3:131.6 144.4:150.2 150.2:153.2
#   = build starts · code + trains · Tokenur cutaway + x5 · coin flood · crash + restart ·
#     patch/deploy/"praying loudly" · "you're absolutely right" + shipped + game tucks away · the app.
set -euo pipefail
export PATH="$HOME/bin:$PATH"
IN=${1:?rec.mov}; BASE=${2:?out-base}; shift 2
[ $# -gt 0 ] || { echo "give at least one a:b segment" >&2; exit 2; }
fc=""; n=0; ins=""
for s in "$@"; do a=${s%%:*}; b=${s##*:}; fc="$fc[0:v]trim=$a:$b,setpts=PTS-STARTPTS[v$n];"; ins="$ins[v$n]"; n=$((n+1)); done
fc="$fc${ins}concat=n=$n:v=1:a=0,fps=30[out]"
ffmpeg -v error -y -i "$IN" -filter_complex "$fc" -map "[out]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart "$BASE-master.mp4"
ffmpeg -v error -y -i "$BASE-master.mp4" -vf "scale=900:1956:flags=lanczos" \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart "$BASE-900x1956.mp4"
dur=$( (ffmpeg -i "$BASE-master.mp4" 2>&1 || true) | sed -n 's/.*Duration: \([0-9:.]*\).*/\1/p')
ffmpeg -v error -y -sseof -0.5 -i "$BASE-900x1956.mp4" -frames:v 1 -update 1 "$BASE-poster.jpg"
ffmpeg -v error -y -i "$BASE-master.mp4" \
  -vf "fps=2,scale=180:-1,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=8x8" \
  -q:v 4 "$BASE-sheet.jpg" 2>/dev/null
echo "duration $dur"
ls -la "$BASE-master.mp4" "$BASE-900x1956.mp4" "$BASE-poster.jpg" "$BASE-sheet.jpg"
