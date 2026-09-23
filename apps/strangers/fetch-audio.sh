#!/bin/sh
# The song isn't committed. This pulls it and cuts the 30 s the edit is timed to (0:58 → 1:28).
set -e
cd "$(dirname "$0")"
mkdir -p audio
yt-dlp -x --audio-format wav -o "audio/song.%(ext)s" "https://www.youtube.com/watch?v=AK7cjOdLVf8"
ffmpeg -v error -y -ss 58 -t 30 -i audio/song.wav -ac 2 -ar 44100 audio/clip.wav
rm audio/song.wav
