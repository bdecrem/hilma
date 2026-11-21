# Sourced by drive.sh: stops what one drive run started, by process id (OLA-271).
# The driven app copy starts its opencode engine (Helpers/ola-opencode-arm64 serve) and the engine's
# terminal daemon (opencode-pty, under the run's home); both outlived the app, so on Nov 20 and 21
# the mini held 16 of them from earlier runs, a day old. Each has the run's folder in its arguments,
# or as its working folder or in its open files (the engine's database and log are under the run's
# home: lsof; ps cannot read another process's environment on macOS 27). Only processes whose
# command is in the drive's own folder are looked at; nothing of another run is touched.
#   stop_run <drive folder> <run folder> [pid to leave alone]
stop_run() {
  local state="$1" run="$2" keep="${3:-}" pid left=""
  if [ -z "$state" ] || [ -z "$run" ]; then return 0; fi
  for pid in $(pgrep -f "$state/" 2>/dev/null); do
    if [ "$pid" = "$keep" ] || [ "$pid" = "$$" ]; then continue; fi
    if ps -ww -o command= -p "$pid" 2>/dev/null | grep -qF "$run/" \
      || /usr/sbin/lsof -p "$pid" -Fn 2>/dev/null | grep -qF "n$run/"; then
      if kill "$pid" 2>/dev/null; then left="$left $pid"; fi
    fi
  done
  # Given a few seconds to end, then ended.
  for _ in 1 2 3 4 5; do
    local alive=""
    for pid in $left; do if kill -0 "$pid" 2>/dev/null; then alive="$alive $pid"; fi; done
    if [ -z "$alive" ]; then return 0; fi
    left="$alive"; sleep 1
  done
  for pid in $left; do kill -9 "$pid" 2>/dev/null || true; done
  return 0
}
