#!/bin/bash
# Ship Polly to TestFlight from whichever Mac this is.
#
#   ./apps/polly/testflight/ship.sh            # iPhone build
#   ./apps/polly/testflight/ship.sh mac        # Mac (Catalyst) build
#   ./apps/polly/testflight/ship.sh both
#   ./apps/polly/testflight/ship.sh ios 0.2    # also set the marketing version
#   SKIP_BUMP=1 ./apps/polly/testflight/ship.sh mac   # same build number again
#
# Bumps the build number, archives, uploads, then waits for processing, adds
# the build to the Testers group and submits it for beta review
# (asc-submit.mjs). Signing is manual, set on the app TARGET in project.yml (a
# command-line PROVISIONING_PROFILE_SPECIFIER would also hit the Swift
# packages' resource bundles, which refuse one) — this script only names the
# profile, via POLLY_PROFILE / POLLY_MAC_PROFILE. It is per machine, because each Mac holds
# a different Apple Distribution private key:
#   iMac M4      key AH7Q68TW6S, profiles "polly appstore imac" /
#                "polly catalyst appstore imac" (cert 4YB38SZ2F2)
#   iMac M1      key 748UX45NAP, profile "polly appstore m1" (cert 78245T6FR5,
#                2026-09-25; iOS only — no Mac Installer key or Catalyst profile)
#   MacBook Air  key FA7268Q94U, profiles "polly appstore" /
#                "polly catalyst appstore" (cert 94KFQFP9A4; no Mac Installer
#                key there, so Mac builds ship from the iMac)
# The machine is told apart by which API key file is present.
set -euo pipefail
cd "$(dirname "$0")/.."

WHAT="${1:-ios}"
KEYS="$HOME/.appstoreconnect/private_keys"
ISSUER="69a6de80-eb13-47e3-e053-5b8c7c11a4d1"
if [ -f "$KEYS/AuthKey_AH7Q68TW6S.p8" ]; then
  export ASC_KEY_ID="AH7Q68TW6S"; SUFFIX=" imac"
elif [ -f "$KEYS/AuthKey_748UX45NAP.p8" ]; then
  export ASC_KEY_ID="748UX45NAP"; SUFFIX=" m1"
elif [ -f "$KEYS/AuthKey_FA7268Q94U.p8" ]; then
  export ASC_KEY_ID="FA7268Q94U"; SUFFIX=""
else
  echo "error: no App Store Connect key in $KEYS" >&2; exit 1
fi
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [ "${SKIP_BUMP:-}" != 1 ]; then ./bump-build.sh ${2:+"$2"}; fi
BUILD=$(grep -E '^\s*CURRENT_PROJECT_VERSION:' project.yml | sed -E 's/.*"([0-9]+)".*/\1/')
OUT=$(mktemp -d "${TMPDIR:-/tmp}/polly-ship.XXXXXX")

ship() { # $1 = ios | mac
  local profile dest plat plist="$OUT/export-$1.plist" archive="$OUT/Polly-$1.xcarchive" installer=""
  if [ "$1" = mac ]; then
    profile="polly catalyst appstore$SUFFIX"; dest="generic/platform=macOS,variant=Mac Catalyst"; plat=MAC_OS
    installer="<key>installerSigningCertificate</key><string>3rd Party Mac Developer Installer</string>"
  else
    profile="polly appstore$SUFFIX"; dest="generic/platform=iOS"; plat=IOS
  fi
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
$installer
<key>teamID</key><string>274T5WCVD2</string>
<key>provisioningProfiles</key><dict><key>com.bartdecrem.Polly</key><string>$profile</string></dict>
</dict></plist>
PLIST
  echo "== $1: archiving build $BUILD with \"$profile\""
  xcodebuild archive -project Polly.xcodeproj -scheme Polly -destination "$dest" \
    -archivePath "$archive" -configuration Release \
    "POLLY_PROFILE=$profile" "POLLY_MAC_PROFILE=$profile" \
    > "$OUT/archive-$1.log" 2>&1 || { grep -E "error:" "$OUT/archive-$1.log" | head -20; echo "archive failed — $OUT/archive-$1.log"; exit 1; }
  echo "== $1: uploading"
  xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$plist" -exportPath "$OUT/export-$1" \
    -authenticationKeyPath "$KEYS/AuthKey_$ASC_KEY_ID.p8" -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ISSUER" \
    > "$OUT/export-$1.log" 2>&1 || { grep -E "error|Error" "$OUT/export-$1.log" | head -20; echo "upload failed — $OUT/export-$1.log"; exit 1; }
  echo "== $1: uploaded; waiting for App Store Connect"
  node testflight/asc-submit.mjs "$BUILD" "$plat"
}

case "$WHAT" in
  ios) ship ios ;;
  mac) ship mac ;;
  both) ship ios; ship mac ;;
  *) echo "usage: ship.sh [ios|mac|both] [marketing-version]" >&2; exit 1 ;;
esac
echo "Polly $BUILD shipped. Logs: $OUT"
