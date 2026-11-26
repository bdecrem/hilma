#!/bin/bash
# Builds Bart's Ola apps and draws the screenshots, without touching the screen.
#
#   tools/build.sh mac [shots-dir]     the Mac app, signed with a stable identity (see below); with a dir,
#                                      renders its views to PNGs. OLA_PASSKEY=1 adds passkeys in the app
#                                      (the associated domain; needs Apple's agreement, see project.yml)
#   tools/build.sh sim                 the iPhone app for the simulator
#   tools/build.sh device              the iPhone app for a device (automatic signing, team 274T5WCVD2);
#                                      OLA_PUSH=1 adds Apple push (needs Push on the App ID, see project.yml);
#                                      OLA_DEVICE=<udid> builds for that phone and registers it (a new phone)
#   tools/build.sh install-mac         copies the built Mac app to /Applications/Ola.app (does not open it)
#                                      and installs the `ola` command, printing where
#
# The Mac app's signature must stay the same from build to build: the login keychain and macOS's
# folder permissions remember the app by its signature, and an ad-hoc one changes with every build
# (README, "Why macOS used to ask again after every build"). The identity is OLA_SIGN_IDENTITY if
# set, else the first "Apple Development" identity on this Mac, else ad hoc (with a warning).
set -euo pipefail
cd "$(dirname "$0")/.."
# Free disk before anything is staged or built (OLA-327: on Nov 20 an app build stopped on the M1 iMac
# with 12 GB free, and on the mini with 3.8 GB). OLA_BUILD_NEED_GB changes the floor (default 15).
if [ "${1:-}" != install-mac ]; then
  NEED="${OLA_BUILD_NEED_GB:-15}"
  FREE=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  [ "${FREE:-0}" -ge "$NEED" ] || { echo "error: an app build needs ${NEED} GB free and this Mac has ${FREE:-?} GB: not started (free some first: DerivedData, old builds)" >&2; exit 1; }
fi
DD="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-shared}"
APP="$DD/Build/Products/Debug/Ola.app"
# Ola's skills, copied fresh from apps/activist-ai/skills as committed (refuses uncommitted changes);
# the Mac build is checked against them after it is made (README, "Every release").
if [ "${1:-}" != install-mac ]; then node tools/skills.mjs stage build/OlaSkills; fi
# Ola's opencode (../opencode-fork: the pinned release with Ola's wordmark in its terminal interface),
# staged for the Mac app's Contents/Helpers; the first time on a machine this builds it (about eight
# minutes), after that it is a copy. The built app is checked against it below.
if [ "${1:-}" = mac ]; then ../opencode-fork/stage.sh stage build/OlaOpencode; else mkdir -p build/OlaOpencode; fi   # the project names the folder
xcodegen generate >/dev/null

# The signing identity's name and its team (the certificate's OU).
sign_identity() {
  if [ -n "${OLA_SIGN_IDENTITY:-}" ]; then echo "$OLA_SIGN_IDENTITY"; return; fi
  security find-identity -v -p codesigning 2>/dev/null | sed -n 's/^ *[0-9]*) [0-9A-F]* "\(Apple Development: [^"]*\)"$/\1/p' | head -1
}

case "${1:-}" in
  mac)
    ID="$(sign_identity)"
    if [ -n "${OLA_PASSKEY:-}" ]; then
      # Passkeys in the app: the associated domain needs a provisioning profile, so automatic signing
      # with the team (project.yml, "Passkeys"). Refused until Apple's agreement is accepted.
      SIGN=(CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=274T5WCVD2 CODE_SIGN_ENTITLEMENTS=Mac/Ola.entitlements -allowProvisioningUpdates -allowProvisioningDeviceRegistration)
    elif [ -n "$ID" ]; then
      TEAM="$(security find-certificate -c "$ID" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU=\([A-Z0-9]*\).*/\1/p')"
      SIGN=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$ID" DEVELOPMENT_TEAM="${TEAM:-}" PROVISIONING_PROFILE_SPECIFIER="" OTHER_CODE_SIGN_FLAGS="--timestamp=none")
    else
      echo "no signing identity on this Mac: signing ad hoc, so macOS will ask again (Keychain, folders) after every build until one exists"
      SIGN=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="-" AD_HOC_CODE_SIGNING_ALLOWED=YES PROVISIONING_PROFILE_SPECIFIER="" DEVELOPMENT_TEAM="")
    fi
    # The commit it is built from, in its Info.plist (OlaCommit; "+changes" when the tree differs).
    COMMIT="$(git rev-parse --short=12 HEAD)$(git diff --quiet HEAD -- . 2>/dev/null || echo +changes)"
    xcodebuild -project Ola.xcodeproj -scheme OlaMac -configuration Debug -derivedDataPath "$DD" "${SIGN[@]}" OLA_COMMIT="$COMMIT" \
      build 2>&1 | grep -E "error:|BUILD" | sort -u
    # The designated requirement is what the Keychain and the folder permissions remember.
    REQ="$(codesign -d -r- "$APP" 2>&1 | sed -n 's/^.*designated => //p')"
    echo "designated requirement: $REQ"
    node tools/skills.mjs verify "$APP/Contents/Resources/OlaSkills" || { echo "FAIL: not this build: its skills are not apps/activist-ai/skills at HEAD" >&2; exit 1; }
    tools/plugins-verify.sh "$APP/Contents/Resources/plugins" || { echo "FAIL: not this build: its plugins are not workspace/plugins at HEAD" >&2; exit 1; }
    # Ola's opencode: this tag, this rebrand, and this Mac's one starts.
    ../opencode-fork/stage.sh verify "$APP" || { echo "FAIL: not this build: its opencode is not ../opencode-fork's" >&2; exit 1; }
    "$APP/Contents/Helpers/ola-opencode-$(uname -m)" --version >/dev/null || { echo "FAIL: the opencode inside the app does not start" >&2; exit 1; }
    if [ -n "$ID" ] && [[ "$REQ" == *cdhash* ]]; then
      echo "FAIL: signed with \"$ID\" but the requirement still names this build's hash; macOS would ask again after every build" >&2
      exit 1
    fi
    if [ -n "${2:-}" ]; then
      rm -rf "$2"
      "$APP/Contents/MacOS/Ola" -OlaSnapshot "$2" ${OLA_ONLY:+-OlaOnly "$OLA_ONLY"}
    fi
    ;;
  sim)
    xcodebuild -project Ola.xcodeproj -scheme OlaPhone -configuration Debug -derivedDataPath "$DD" \
      -destination 'generic/platform=iOS Simulator' build 2>&1 | grep -E "error:|BUILD" | sort -u
    echo "$DD/Build/Products/Debug-iphonesimulator/Ola.app"
    ;;
  device)
    # OLA_DEVICE=<udid>: build for that phone and let Xcode add it to the developer account (a phone
    # that has never run a build from this account is refused at install until it is registered).
    DEST='generic/platform=iOS'; REG=()
    if [ -n "${OLA_DEVICE:-}" ]; then DEST="id=$OLA_DEVICE"; REG=(-allowProvisioningDeviceRegistration); fi
    xcodebuild -project Ola.xcodeproj -scheme OlaPhone -configuration Debug -derivedDataPath "$DD" \
      -destination "$DEST" -allowProvisioningUpdates ${REG[@]+"${REG[@]}"} DEVELOPMENT_TEAM=274T5WCVD2 \
      ${OLA_PUSH:+CODE_SIGN_ENTITLEMENTS=iOS/Ola.entitlements} build 2>&1 | grep -E "error:|BUILD|signing|Signing|provision" | sort -u
    echo "$DD/Build/Products/Debug-iphoneos/Ola.app"
    ;;
  install-mac)
    # Never replace Ola while it is open (2026-11-18: an install quit the app while Claude was
    # finishing Bart's app; "DO NOT ... QUIT MY APP WHEN I'M WORKING ON IT"). Nothing here quits it,
    # and there is no flag to force it: Bart quits Ola himself, then this runs.
    if pgrep -f "/Applications/Ola.app/Contents/MacOS/Ola" >/dev/null; then
      echo "NOT INSTALLING: Ola is open. It is never quit for an install. Ask Bart to quit Ola when he is at a stopping point, then run this again." >&2
      exit 3
    fi
    node tools/skills.mjs verify "$APP/Contents/Resources/OlaSkills" || { echo "FAIL: not installing: the built app's skills are not apps/activist-ai/skills at HEAD (build again)" >&2; exit 1; }
    tools/plugins-verify.sh "$APP/Contents/Resources/plugins" >/dev/null || { echo "FAIL: not installing: the built app's plugins are not workspace/plugins at HEAD (build again)" >&2; exit 1; }
    ../opencode-fork/stage.sh verify "$APP" >/dev/null || { echo "FAIL: not installing: the built app's opencode is not ../opencode-fork's (build again)" >&2; exit 1; }
    rm -rf /Applications/Ola.app
    cp -R "$APP" /Applications/Ola.app
    echo "copied to /Applications/Ola.app (not opened)"
    # The `ola` command: a launcher for the app's own executable (--cli), in the first writable
    # folder on a login shell's PATH among ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
    /Applications/Ola.app/Contents/MacOS/Ola --install-cli
    ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
