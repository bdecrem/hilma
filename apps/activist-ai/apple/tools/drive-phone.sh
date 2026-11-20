#!/bin/bash
# The iPhone half of tools/drive.sh (OLA-237); drive.sh calls it, after the made-up account is ready:
#   tools/drive-phone.sh <out> <run-dir> <password-file> <cloud|local> <card> <wait> <says-json>
#
# 1. The app, built from the live release's commit (~/ola-staging/current), once per commit, into
#    ~/ola-drive/phone/<commit>: its own copy of the release, its own Xcode project and build folder.
# 2. A simulator of its own ("Ola drive", made once), booted headless (no Simulator window), the app
#    installed fresh with an empty Keychain, so it starts signed out as a new phone does.
# 3. apple/drive's OlaDrivePhone (XCUITest) taps and types through it (drive/Phone/PhoneDrive.swift).
# 4. The simulator is shut down again (OLA_KEEP=1 leaves it booted).
set -uo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
OUT="$1"; RUN="$2"; PW="$3"; WHERE="$4"; CARD="$5"; WAIT="$6"; SAYS_JSON="$7"
HERE="$(cd "$(dirname "$0")" && pwd)"
APPLE="$(cd "$HERE/.." && pwd)"
STATE="$HOME/ola-drive"
LIVE="$HOME/ola-staging/current/apps/activist-ai"
fail() { echo "DRIVE FAIL  $*"; exit 1; }
XCODEGEN="$(command -v xcodegen || echo "$STATE/xcodegen/bin/xcodegen")"
[ -x "$XCODEGEN" ] || fail "no xcodegen on this Mac (brew install xcodegen, or a copy at $STATE/xcodegen/bin/xcodegen)"
[ "$WHERE" = cloud ] || fail "the phone drives the cloud for now; local (the phone through the Mac app) is not built yet (README, \"Using the apps as a checker\")"

# 1. The app at the live release's commit.
COMMIT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"][:12])' "$HOME/ola-staging/deployed.json")" || fail "no deployed.json: which release is live is not known"
SRC="$STATE/phone/$COMMIT"
APP="$SRC/dd/Build/Products/Debug-iphonesimulator/Ola.app"
# Signed to run locally (ad hoc): an unsigned simulator app gets no Keychain, and the sign-in lives there.
if [ ! -d "$APP" ] || ! codesign -v "$APP" 2>/dev/null; then
  echo "  building the iPhone app at the live release $COMMIT (once per release, a few minutes)"
  mkdir -p "$SRC"
  rsync -a --delete --exclude node_modules --exclude '.git' "$LIVE/" "$SRC/ai/" || fail "could not copy the release"
  mkdir -p "$SRC/ai/apple/build/OlaSkills" "$SRC/ai/apple/build/OlaOpencode"
  (cd "$SRC/ai/apple" && "$XCODEGEN" generate >/dev/null) || fail "xcodegen failed on the release's project.yml"
  xcodebuild -project "$SRC/ai/apple/Ola.xcodeproj" -scheme OlaPhone -configuration Debug -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$SRC/dd" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build > "$SRC/build.log" 2>&1 || fail "the iPhone app did not build at $COMMIT (log: $SRC/build.log): $(grep -m3 'error:' "$SRC/build.log" | tr '\n' ' ')"
fi
VERSION="$(defaults read "$APP/Info" CFBundleShortVersionString 2>/dev/null)"
BUILD="$(defaults read "$APP/Info" CFBundleVersion 2>/dev/null)"

# 2. Our own simulator.
NAME="Ola drive"
UDID="$(xcrun simctl list devices -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next((x['udid'] for r in d for x in d[r] if x['name']==sys.argv[1] and x.get('isAvailable')), ''))" "$NAME")"
if [ -z "$UDID" ]; then
  RUNTIME="$(xcrun simctl list runtimes -j | python3 -c "import json,sys; r=[x for x in json.load(sys.stdin)['runtimes'] if x['platform']=='iOS' and x['isAvailable']]; print(r[-1]['identifier'] if r else '')")"
  [ -n "$RUNTIME" ] || fail "no iOS simulator runtime on this Mac"
  TYPE="$(xcrun simctl list devicetypes -j | python3 -c "import json,sys; t=[x['identifier'] for x in json.load(sys.stdin)['devicetypes'] if x['name'] in ('iPhone 17 Pro','iPhone 16 Pro')]; print(t[0] if t else '')")"
  UDID="$(xcrun simctl create "$NAME" "$TYPE" "$RUNTIME")" || fail "could not make the simulator"
fi
xcrun simctl boot "$UDID" 2>/dev/null
xcrun simctl bootstatus "$UDID" -b >/dev/null || fail "the simulator did not boot"
shutdown_sim() { [ -n "${OLA_KEEP:-}" ] || xcrun simctl shutdown "$UDID" 2>/dev/null; }
trap shutdown_sim EXIT
xcrun simctl ui "$UDID" appearance light 2>/dev/null
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 >/dev/null 2>&1
# A new phone: the app not there, the Keychain empty (the sign-in lives there), then installed.
xcrun simctl terminate "$UDID" cx.ola.mac >/dev/null 2>&1
xcrun simctl uninstall "$UDID" cx.ola.mac >/dev/null 2>&1
xcrun simctl keychain "$UDID" reset >/dev/null 2>&1
xcrun simctl install "$UDID" "$APP" || fail "could not install the app in the simulator"

# 3. The driver (built once per change of drive/).
DRV="$STATE/drive-build"
mkdir -p "$DRV"
rsync -a --delete --exclude '*.xcodeproj' "$APPLE/drive/" "$DRV/src/"
(cd "$DRV/src" && "$XCODEGEN" generate >/dev/null) || fail "xcodegen failed on drive/project.yml"
python3 - "$RUN/phone-script.json" "$OUT" "$PW" "$WHERE" "$CARD" "$WAIT" "$SAYS_JSON" <<'PY'
import json, sys
f, out, pw, where, card, wait, says = sys.argv[1:]
json.dump({"out": out, "handle": "appdriver", "passwordFile": pw, "where": where, "card": card, "waitSeconds": float(wait), "says": json.loads(says)}, open(f, "w"))
PY
echo "  driving the iPhone app $VERSION ($BUILD) from the live release $COMMIT in the simulator \"$NAME\" ($UDID), $WHERE"
LIMIT=$(( $(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$SAYS_JSON") * ${WAIT%.*} + 600 ))
TEST_RUNNER_OLA_DRIVE_SCRIPT="$RUN/phone-script.json" TEST_RUNNER_OLA_DRIVE_APP_VERSION="$VERSION" TEST_RUNNER_OLA_DRIVE_APP_BUILD="$BUILD" \
  perl -e 'alarm shift; exec @ARGV' "$LIMIT" xcodebuild -project "$DRV/src/OlaDrive.xcodeproj" -scheme OlaDrivePhone -destination "id=$UDID" \
  -derivedDataPath "$DRV/dd" test > "$OUT/xcodebuild.log" 2>&1
CODE=$?
grep -E '^DRIVE ' "$OUT/xcodebuild.log" | grep -v 'DRIVE FAIL  DRIVE FAIL' > "$OUT/app.log"
python3 - "$OUT/transcript.json" "$APP" "$COMMIT" "$UDID" <<'PY'
import json, sys
t, app, commit, udid = sys.argv[1:]
try: j = json.load(open(t))
except Exception: sys.exit(0)
j["bundlePath"] = app; j["builtFrom"] = commit; j["simulator"] = udid
json.dump(j, open(t, "w"), indent=2)
PY
LINE="$(grep -E 'DRIVE (PASS|FAIL)  ' "$OUT/app.log" | tail -1 | sed -E 's/^DRIVE +[0-9.]+ +//')"
if [ -z "$LINE" ]; then
  [ $CODE -eq 142 ] && fail "the run did not finish in $LIMIT s (stopped); pictures in $OUT"
  fail "the driver ended without a verdict (xcodebuild exit $CODE): $(grep -m3 -E 'error|Failing|failed' "$OUT/xcodebuild.log" | tr '\n' ' ' | cut -c1-400)"
fi
echo "$LINE"
echo "  pictures and transcript.json in $OUT"
case "$LINE" in "DRIVE PASS"*) exit 0 ;; *) exit 1 ;; esac
