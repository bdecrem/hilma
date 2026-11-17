#!/bin/bash
# The working animations as video: renders every figure frame by frame off screen (Ola -OlaMotion,
# never a window on screen) and makes an MP4 and a GIF of each with ffmpeg.
#
#   tools/motion.sh <out-dir> [only]    e.g. tools/motion.sh ~/Desktop/ola-brand/motion hop
#
# Cards (<figure>-light, -dark, -specials) are 60 fps; the made-up runs (run-*) are 30 fps.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$1"; ONLY="${2:-}"
DD="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-apple}"
OLA_DERIVED="$DD" bash tools/build.sh mac
FRAMES="$(mktemp -d)/motion"
"$DD/Build/Products/Debug/Ola.app/Contents/MacOS/Ola" -OlaMotion "$FRAMES" ${ONLY:+-OlaOnly "$ONLY"}
mkdir -p "$OUT"
for d in "$FRAMES"/frames/*/; do
  name=$(basename "$d")
  fps=60; [[ $name == run-* ]] && fps=30
  ffmpeg -loglevel error -y -framerate $fps -i "$d/%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "$OUT/$name.mp4"
  width=360; [[ $name == run-* ]] && width=540
  ffmpeg -loglevel error -y -framerate $fps -i "$d/%05d.png" -vf "fps=30,scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "$OUT/$name.gif"
  echo "$name"
done
rm -rf "$(dirname "$FRAMES")"
