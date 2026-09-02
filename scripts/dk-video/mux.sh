#!/bin/zsh
set -e
cd "$(dirname "$0")"
N=$(ls frames | wc -l | tr -d ' ')
echo "frames: $N"
[ "$N" -eq 1800 ] || { echo "expected 1800 frames"; exit 1; }
ffmpeg -v error -y -framerate 60 -i frames/%05d.png -i arrangement.wav \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=28.5:d=1.5,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -r 60 -c:a aac -b:a 256k -movflags +faststart -t 30 dk019-30s.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,sample_rate -of default=nw=1 dk019-30s.mp4
