#!/bin/bash
# Play the KO II's USB audio out of this Mac's speakers (or whatever the default output is).
# Since OS 2.5 the EP-133 is a USB audio device; this pipes its stereo input to the default output.
#   apps/ko2/tools/monitor.sh            # runs until Ctrl-C
#   apps/ko2/tools/monitor.sh --bg       # detached; stop with: pkill -f 'coreaudio EP-133'
# Needs sox (brew). Latency is a few tens of ms; the KO II's own speaker also keeps playing
# unless something is plugged into its output jack.
set -e
if [ "${1:-}" = "--bg" ]; then
  nohup sox -q --buffer 8192 -t coreaudio "EP-133" -d >/tmp/ko2-monitor.log 2>&1 &
  echo "monitoring EP-133 → default output, pid $!"
else
  exec sox -q --buffer 8192 -t coreaudio "EP-133" -d
fi
