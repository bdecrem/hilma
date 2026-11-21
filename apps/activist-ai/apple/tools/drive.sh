#!/bin/bash
# Uses the Mac app or the iPhone app the way a person does, on the Mac mini, with no window on
# anyone's screen (OLA-237). README: "Using the apps as a checker".
#
#   tools/drive.sh mac|phone --where cloud|local --say "<sentence>" [--say "<next>"] [--card yes|any|no]
#                  [--wait <seconds>] [--file <name>] [--project <slug>] [--app <Ola.app>]
#                  [--pick <model>] [--try-again <model>] [--small] --out <dir>
#
#   mac    the Mac app: by default the published download (https://ola.cx/ola-site/mac/latest.json),
#          installed in ~/ola-drive/apps/ (never /Applications), started as a copy of its own with its own
#          home folder; it drives itself (-OlaDrive): macOS on the mini allows no outside clicks or typing
#          without an administrator at the screen. --app <path> drives another build.
#   phone  the iPhone app in a simulator of its own on the mini, headless, built from the live release's
#          commit (~/ola-staging/current), driven by XCUITest: real taps and the simulator's keyboard.
#   --where cloud   the made-up person's project on app.ola.cx; local   Ola working on the Mac (mac only:
#          a scratch folder in the run's folder; the page must turn up there).
#   --card yes      a card must come, and is answered "Yes, this once"; any (default): any card that comes
#          is answered yes; no: a card that comes fails the run.
#   --wait          seconds for each answer (default 600).
#   --file <name>   (mac, local) the run fails unless the scratch folder has this file afterwards.
#   --pick <model>  (mac) the model for the session, picked at the box before the first sentence by its
#          shortcut (Option-Command-<n>): Ola, Hosted, "DeepSeek V4 Pro" (or deepseek), Claude (OLA-339).
#   --try-again <model>  (mac) after the last answer, that request again with this model, by its
#          shortcut (Control-Option-Command-<n>, Model, Try Again With) (OLA-340).
#   --small         (mac) the window at 760 by 560.
#   --size WxH      (mac) the window at that size, e.g. 1400x900 (OLA-344).
#   --pick-rounds N (mac, with --pick) then Ola and the pick again, N times, by the shortcuts (OLA-344).
#   Every Mac run fails when "Try again with" under the latest answer is not all in view (OLA-337).
#
# Signs in as the made-up person `appdriver` (tools/drive-account.mjs), never anyone real: a fresh
# password each run, in a file with mode 600, read by the app from that file; signed out everywhere
# and its project's computer stopped at the end. A cloud run holds the machine's test turn
# (ops/turn.mjs of the live release), as every suite that runs a project's computer does.
#
# Leaves in <dir>: a PNG per step, transcript.json (each sentence, each card and what was answered, the
# answer as read from the screen, timings, the build and the bundle it drove), app.log.
# Exit 0 only when every sentence got a finished answer on the screen; otherwise 1 and one line why.
set -uo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
HERE="$(cd "$(dirname "$0")" && pwd)"
APPLE="$(cd "$HERE/.." && pwd)"
LIVE="$HOME/ola-staging/current/apps/activist-ai"
STATE="$HOME/ola-drive"

fail() { echo "DRIVE FAIL  $*"; exit 1; }
[ $# -ge 1 ] || { sed -n 2,30p "$0"; exit 2; }
ORIG=("$@")
APPKIND="$1"; shift
WHERE=cloud; CARD=any; WAIT=600; PROJECT=appdriver; APP=""; OUT=""; SAYS=(); FILE=""; PICK=""; TRYAGAIN=""; SMALL=""; SIZE=""; ROUNDS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --where) WHERE="$2"; shift 2 ;;
    --say) SAYS+=("$2"); shift 2 ;;
    --card) CARD="$2"; shift 2 ;;
    --wait) WAIT="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --app) APP="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --pick) PICK="$2"; shift 2 ;;
    --try-again) TRYAGAIN="$2"; shift 2 ;;
    --small) SMALL=1; shift ;;
    --size) SIZE="$2"; shift 2 ;;
    --pick-rounds) ROUNDS="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done
case "$APPKIND" in mac|phone) ;; *) echo "mac or phone, not $APPKIND"; exit 2 ;; esac
case "$WHERE" in cloud|local) ;; *) echo "--where cloud or local"; exit 2 ;; esac
case "$CARD" in yes|any|no) ;; *) echo "--card yes, any or no"; exit 2 ;; esac
[ -n "$OUT" ] || { echo "--out <dir> is needed"; exit 2; }
[ ${#SAYS[@]} -gt 0 ] || { echo "at least one --say"; exit 2; }
[ "$PROJECT" = appdriver ] || fail "the made-up person has one project, appdriver (asked for $PROJECT)"
[ -d "$LIVE" ] || fail "no live release at $LIVE: run this on the test server (the Mac mini)"

# The machine's test turn, for a run that uses the cloud project's computer (and for every phone run,
# which boots a simulator): deploys go first. A child of the turn's holder does not queue again.
if [ "$WHERE" = cloud ] && [ -z "${OLA_TURN_HELD:-}" ] && [ -z "${OLA_DRIVE_NO_TURN:-}" ]; then
  exec node "$LIVE/ops/turn.mjs" run --label "app drive $APPKIND (OLA-237)" -- "$0" "${ORIG[@]}"
fi

mkdir -p "$OUT" "$STATE"
OUT="$(cd "$OUT" && pwd)"
# One drive at a time: they share the made-up person (a new password each run) and the settings
# domain of the driven Mac copy. A lock whose drive is gone is taken over.
LOCK="$STATE/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  OTHER="$(cat "$LOCK/pid" 2>/dev/null)"
  if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then fail "another drive is running (pid $OTHER); one at a time"; fi
  rm -rf "$LOCK"; mkdir "$LOCK" || fail "could not take the drive lock"
fi
echo $$ > "$LOCK/pid"
. "$HERE/drive-stop.sh"
# With the lock held no other drive runs: whatever an earlier run left running is stopped (OLA-271).
for r in "$STATE"/run-*; do if [ -d "$r" ]; then stop_run "$STATE" "$r" $$; fi; done
# Old runs' folders (their homes and scratch folders), kept a day for a look.
find "$STATE" -maxdepth 1 -name 'run-*' -mtime +1 -exec rm -rf {} + 2>/dev/null
RUN="$STATE/run-$$"
rm -rf "$RUN"; mkdir -p "$RUN"
PW="$RUN/password"
cleanup() {
  # What this run started, the app copy's engine and terminal daemon included (OLA-271).
  stop_run "$STATE" "$RUN"
  node "$HERE/drive-account.mjs" cleanup 2>&1 | sed 's/^/  /'
  rm -f "$PW"
  # The driven Mac copy's own settings domain (Mac/MacDrive.swift); never the app's cx.ola.mac.
  defaults delete cx.ola.mac.drive >/dev/null 2>&1
  rm -rf "$LOCK"
}
trap cleanup EXIT
prepare_account() { node "$HERE/drive-account.mjs" prepare "$PW" $([ "$WHERE" = local ] && echo --local) | sed 's/^/  /' || fail "the made-up account could not be made ready"; }
SAYS_JSON="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${SAYS[@]}")"

if [ "$APPKIND" = mac ]; then
  if [ -z "$APP" ]; then
    # The published download, installed in a folder of its own (once per build).
    FEED="$(curl -fsS https://ola.cx/ola-site/mac/latest.json)" || fail "could not read https://ola.cx/ola-site/mac/latest.json"
    URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["url"])' "$FEED")"
    BUILD="$(python3 -c 'import json,sys; j=json.loads(sys.argv[1]); print(j["version"]+"-"+j["build"])' "$FEED")"
    APP="$STATE/apps/Ola-$BUILD/Ola.app"
    if [ ! -d "$APP" ]; then
      mkdir -p "$STATE/apps/Ola-$BUILD"
      curl -fsSL -o "$STATE/apps/Ola-$BUILD/Ola.dmg" "$URL" || fail "could not download $URL"
      MNT="$(mktemp -d)"
      hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$STATE/apps/Ola-$BUILD/Ola.dmg" >/dev/null || fail "could not open the disk image"
      ditto "$MNT/Ola.app" "$APP"; hdiutil detach "$MNT" >/dev/null
      spctl -a -vv "$APP" 2>&1 | head -2 | sed 's/^/  gatekeeper: /'
    fi
  fi
  [ -x "$APP/Contents/MacOS/Ola" ] || fail "no Mac app at $APP"
  APP="$(cd "$APP" && pwd)"
  # A build without drive mode would open as a normal window: asked first, nothing opens.
  "$APP/Contents/MacOS/Ola" --drive-probe 2>&1 | grep -q "drive mode: yes" || fail "$APP ($(defaults read "$APP/Contents/Info" CFBundleVersion 2>/dev/null)) has no drive mode (-OlaDrive); it is in builds after 0.1 (25). Pass --app <a build that has it>."
  FOLDER=""
  if [ "$WHERE" = local ]; then FOLDER="$RUN/folder"; mkdir -p "$FOLDER"; fi
  mkdir -p "$RUN/home"
  python3 - "$RUN/script.json" "$OUT" "$PW" "$WHERE" "$PROJECT" "$FOLDER" "$CARD" "$WAIT" "$SAYS_JSON" "$PICK" "$TRYAGAIN" "$SMALL" "$SIZE" "$ROUNDS" <<'PY'
import json, sys
f, out, pw, where, project, folder, card, wait, says, pick, again, small, size, rounds = sys.argv[1:]
s = {"out": out, "handle": "appdriver", "passwordFile": pw, "where": where, "project": project, "says": json.loads(says), "card": card, "waitSeconds": float(wait)}
if folder: s["folder"] = folder
if pick: s["pick"] = pick
if again: s["tryAgain"] = again
if small: s["small"] = True
if size: s["size"] = size
if rounds: s["pickRounds"] = int(rounds)
json.dump(s, open(f, "w"))
PY
  prepare_account
  echo "  driving $APP ($(defaults read "$APP/Contents/Info" CFBundleShortVersionString) ($(defaults read "$APP/Contents/Info" CFBundleVersion) $(defaults read "$APP/Contents/Info" OlaConfiguration 2>/dev/null || echo 'of unknown configuration') $(defaults read "$APP/Contents/Info" OlaCommit 2>/dev/null))), $WHERE"
  # Through LaunchServices into the logged-in desktop, in the background (-g), as a new copy (-n), with
  # its own home: its settings, Application Support and opencode state are the run's, not anyone's.
  open -n -g -W --env CFFIXED_USER_HOME="$RUN/home" --stdout "$OUT/app.log" --stderr "$OUT/app.log" "$APP" --args -OlaDrive "$RUN/script.json" &
  OPENPID=$!
  LIMIT=$(( (${#SAYS[@]} + $([ -n "$TRYAGAIN" ] && echo 1 || echo 0)) * ${WAIT%.*} + 300 ))
  for ((i = 0; i < LIMIT; i++)); do kill -0 $OPENPID 2>/dev/null || break; sleep 1; done
  if kill -0 $OPENPID 2>/dev/null; then
    # Ours only: the copy started with this run's script.
    pkill -f "OlaDrive $RUN/script.json" ; kill $OPENPID 2>/dev/null
    fail "the app did not finish in $LIMIT s (stopped); pictures in $OUT"
  fi
  if [ -n "$FOLDER" ]; then
    python3 - "$OUT/transcript.json" "$FOLDER" <<'PY'
import json, os, sys
t, folder = sys.argv[1:]
try: j = json.load(open(t))
except Exception: sys.exit(0)
files = []
for root, dirs, names in os.walk(folder):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    files += [os.path.relpath(os.path.join(root, n), folder) for n in names if not n.startswith('.') and not n.startswith('project.db')]
j["folder"] = folder; j["filesInFolder"] = sorted(files)
json.dump(j, open(t, "w"), indent=2)
PY
    cp -R "$FOLDER" "$OUT/folder" 2>/dev/null
  fi
  LINE="$(grep -E '^ *[0-9.]+ +DRIVE (PASS|FAIL)' "$OUT/app.log" | tail -1 | sed -E 's/^ *[0-9.]+ +//')"
  [ -n "$LINE" ] || fail "the app ended without a verdict (it may not have opened): $(tail -3 "$OUT/app.log" | tr '\n' ' ')"
  if [ -n "$FILE" ] && [[ "$LINE" == "DRIVE PASS"* ]]; then
    if [ -z "$FOLDER" ]; then LINE="DRIVE FAIL  --file is for --where local (a folder on this Mac)"
    elif [ ! -f "$FOLDER/$FILE" ]; then LINE="DRIVE FAIL  answered, but $FILE is not in the folder ($(cd "$FOLDER" && ls | tr '\n' ' '))"
    else LINE="$LINE; $FILE is in the folder"; fi
  fi
  echo "$LINE"
  echo "  pictures and transcript.json in $OUT"
  case "$LINE" in "DRIVE PASS"*) exit 0 ;; *) exit 1 ;; esac
fi

# ---------------------------------------------------------------- phone
prepare_account
"$HERE/drive-phone.sh" "$OUT" "$RUN" "$PW" "$WHERE" "$CARD" "$WAIT" "$SAYS_JSON"
