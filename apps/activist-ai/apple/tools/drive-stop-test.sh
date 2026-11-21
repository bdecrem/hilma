#!/bin/bash
# tools/drive-stop-test.sh: stop_run (drive-stop.sh) ends the run's engine and terminal daemon and
# nothing else (OLA-271). Made-up processes only: waiting scripts in a scratch drive folder.
set -euo pipefail   # as drive.sh runs it
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/drive-stop.sh"
T="$(mktemp -d)"; T="$(cd "$T" && pwd -P)"
STATE="$T/ola-drive"; RUN="$STATE/run-111"; OTHER="$STATE/run-1112"
mkdir -p "$STATE/apps/dev/Ola.app/Contents/Helpers" "$RUN/home/bin" "$OTHER/home/bin" "$T/elsewhere"
# A copied /bin/sleep is ended by macOS at launch (its signature): a script that waits instead.
for f in "$STATE/apps/dev/Ola.app/Contents/Helpers/ola-opencode-arm64" "$RUN/home/bin/opencode-pty" "$OTHER/home/bin/opencode-pty" "$T/elsewhere/sleep"; do
  printf '#!/bin/bash\nfor ((i = 0; i < 300; i++)); do sleep 1; done\n' > "$f"; chmod +x "$f"
done
# The engine as on the mini: no run in its arguments, its working folder and log in the run.
(cd "$RUN/home" && exec "$STATE/apps/dev/Ola.app/Contents/Helpers/ola-opencode-arm64" serve 3>>"$RUN/home/opencode.log") & ENGINE=$!
"$RUN/home/bin/opencode-pty" 300 & PTY=$!
(cd "$OTHER/home" && exec "$STATE/apps/dev/Ola.app/Contents/Helpers/ola-opencode-arm64" serve 3>>"$OTHER/home/opencode.log") & OTHER_ENGINE=$!
"$OTHER/home/bin/opencode-pty" 300 & OTHER_PTY=$!
(cd "$RUN/home" && exec "$T/elsewhere/sleep" 300) & OUTSIDE=$!
sleep 1
stop_run "$STATE" "$RUN"
sleep 1
fails=0
gone() { if kill -0 "$2" 2>/dev/null; then echo "FAIL $1 still runs"; fails=$((fails + 1)); else echo "ok   $1 stopped"; fi; }
runs() { if kill -0 "$2" 2>/dev/null; then echo "ok   $1 left alone"; else echo "FAIL $1 was stopped"; fails=$((fails + 1)); fi; }
gone "this run's engine" $ENGINE
gone "this run's terminal daemon" $PTY
runs "another run's engine (run-1112)" $OTHER_ENGINE
runs "another run's terminal daemon" $OTHER_PTY
runs "a process outside the drive folder" $OUTSIDE
kill $OTHER_ENGINE $OTHER_PTY $OUTSIDE $ENGINE $PTY 2>/dev/null; wait 2>/dev/null
rm -rf "$T"
echo "$((5 - fails)) of 5"
[ $fails -eq 0 ]
