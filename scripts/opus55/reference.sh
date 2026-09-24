#!/bin/bash
# Study a reference video: contact sheet, full-size key frames, audio + spectrogram.
# usage: scripts/opus55/reference.sh misc/2.mov <outdir> [crop]
#   crop (optional) is an ffmpeg crop for the picture area, e.g. 1880:1260:428:0
#   (phone screen recordings carry UI around the video; find it on a key frame first)
set -euo pipefail
src="$1"; out="$2"; crop="${3:-}"
mkdir -p "$out"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
echo "duration ${dur}s"
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,sample_rate -of compact "$src"
vf="fps=2,scale=320:-1,tile=8x3"
ffmpeg -v error -y -i "$src" -vf "$vf" -frames:v 3 "$out/sheet%d.png"
# one frame per second at full size (ffmpeg applies the rotation tag, so landscape stays landscape)
for t in $(python3 -c "import math; print(' '.join(str(i) for i in range(int(math.ceil($dur)))))"); do
  if [ -n "$crop" ]; then f="crop=$crop,scale=960:-1"; else f="scale=960:-1"; fi
  ffmpeg -v error -y -ss "$t" -i "$src" -frames:v 1 -vf "$f" "$out/f$(printf %02d "$t").png"
done
ffmpeg -v error -y -i "$src" -vn -ac 1 -ar 44100 "$out/audio.wav"
ffmpeg -v error -y -i "$out/audio.wav" -lavfi "showspectrumpic=s=1500x500:legend=1:scale=log:fscale=log:stop=8000" "$out/spectrogram.png"
python3 "$(dirname "$0")/audio-report.py" "$out/audio.wav" --notes
echo "wrote $out"
