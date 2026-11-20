#!/bin/bash
# The Hop as video: renders it frame by frame off screen (Ola -OlaMotion, never a window on screen),
# two loops at 60 fps, light and dark, and makes an MP4 and a GIF of each with ffmpeg.
#
#   tools/motion.sh <out-dir>    e.g. tools/motion.sh ~/Desktop/Ola/hop
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$1"
DD="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-apple}"
OLA_DERIVED="$DD" bash tools/build.sh mac
FRAMES="$(mktemp -d)/motion"
"$DD/Build/Products/Debug/Ola.app/Contents/MacOS/Ola" -OlaMotion "$FRAMES"
mkdir -p "$OUT"
for d in "$FRAMES"/frames/*/; do
  name=$(basename "$d")
  ffmpeg -loglevel error -y -framerate 60 -i "$d/%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -framerate 60 -i "$d/%05d.png" -vf "fps=30,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "$OUT/$name.gif"
  echo "$name"
done
rm -rf "$(dirname "$FRAMES")"
