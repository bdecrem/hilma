#!/bin/bash
# Ship Takt to TestFlight. The archive is built UNSIGNED, then exported with this Mac's App
# Store profiles and ASC key (the export re-signs and uploads); asc-submit.mjs waits for
# processing and adds the build to the beta groups. App Store Connect refuses beta-SDK
# archives, so a Mac with only a beta Xcode (the iMac, Xcode 27 beta) archives on the Mac mini
# (checkout ~/takt-ship) and copies it back; a Mac with a release Xcode (the MacBook Air, Xcode
# 26.2) archives itself with MINI=local.
#
#   MINI=local ./apps/takt/testflight/ship-via-mini.sh ios   # on the Air: profile "takt appstore"
#   ./apps/takt/testflight/ship-via-mini.sh mac               # Mac Catalyst, "takt catalyst appstore"
#
# Ships the build number in project.yml as committed and PUSHED (the mini pulls main).
# A profile only signs on the Mac that holds its certificate's key: the defaults are the
# MacBook Air's; another Mac mints its own and passes TAKT_PROFILE="<name>".
# Profiles: apps/feynd/testflight/mint-profile.mjs --bundle HSR9TXP4B3 (installed 2026-10-25).
set -euo pipefail
cd "$(dirname "$0")/.."
PLATFORM=${1:?ios or mac}
MINI=${MINI:-admin@100.95.51.98}
KEYS="$HOME/.appstoreconnect/private_keys"
KEY_ID=${ASC_KEY_ID:-FA7268Q94U}
ISSUER="69a6de80-eb13-47e3-e053-5b8c7c11a4d1"
[ -f "$KEYS/AuthKey_$KEY_ID.p8" ] || { echo "error: $KEYS/AuthKey_$KEY_ID.p8 missing" >&2; exit 1; }
case "$PLATFORM" in
  ios) DEST="generic/platform=iOS"; PROFILE="${TAKT_PROFILE:-takt appstore}"; ASC_PLATFORM=IOS ;;
  mac) DEST="generic/platform=macOS,variant=Mac Catalyst"; PROFILE="${TAKT_PROFILE:-takt catalyst appstore}"; ASC_PLATFORM=MAC_OS ;;
  *) echo "usage: $0 ios|mac" >&2; exit 2 ;;
esac
BUILD=$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' project.yml | sed -E 's/.*"([0-9]+)".*/\1/')
VERSION=$(grep -E '^[[:space:]]*MARKETING_VERSION:' project.yml | sed -E 's/.*"([^"]+)".*/\1/')
[ -z "$(git status --porcelain project.yml)" ] || { echo "error: commit and push the build number first" >&2; exit 1; }
git fetch -q origin && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "error: push main first (the mini pulls it)" >&2; exit 1; }
OUT=$(mktemp -d "${TMPDIR:-/tmp}/takt-ship.XXXXXX")

if [ "$MINI" = local ]; then
  echo "== archiving $VERSION ($BUILD) for $PLATFORM here"
  command -v xcodegen >/dev/null && xcodegen generate -q
  xcodebuild archive -project Takt.xcodeproj -scheme Takt -destination "$DEST" -archivePath "$OUT/takt.xcarchive" \
    -configuration Release CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > "$OUT/archive.log" 2>&1 \
    || { grep -E 'error:' "$OUT/archive.log" | head; exit 1; }
else
echo "== archiving $VERSION ($BUILD) for $PLATFORM on the mini"
ssh -o ConnectTimeout=10 "$MINI" "set -e; export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH
  [ -d ~/takt-ship ] || git clone -q https://github.com/bdecrem/hilma.git ~/takt-ship
  cd ~/takt-ship && git pull -q --ff-only && cd apps/takt
  command -v xcodegen >/dev/null && xcodegen generate -q || echo 'no xcodegen on the mini: using the committed .xcodeproj'
  rm -rf /tmp/takt.xcarchive
  xcodebuild archive -project Takt.xcodeproj -scheme Takt -destination '$DEST' -archivePath /tmp/takt.xcarchive \
    -configuration Release CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > /tmp/takt-archive.log 2>&1 \
    || { grep -E 'error:' /tmp/takt-archive.log | head; exit 1; }
  cd /tmp && tar czf takt.xcarchive.tgz takt.xcarchive" || { echo "archive on the mini failed" >&2; exit 1; }
scp -q "$MINI:/tmp/takt.xcarchive.tgz" "$OUT/" && tar xzf "$OUT/takt.xcarchive.tgz" -C "$OUT"
fi
PLIST=$(find "$OUT/takt.xcarchive/Products/Applications/Takt.app" -maxdepth 2 -name Info.plist | head -1)
GOT=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$PLIST")
[ "$GOT" = "$BUILD" ] || { echo "error: the mini archived build $GOT, project.yml says $BUILD" >&2; exit 1; }

INSTALLER=""
[ "$PLATFORM" = mac ] && INSTALLER="<key>installerSigningCertificate</key><string>3rd Party Mac Developer Installer</string>"
cat > "$OUT/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
$INSTALLER
<key>teamID</key><string>274T5WCVD2</string>
<key>provisioningProfiles</key><dict><key>com.bartdecrem.Takt</key><string>$PROFILE</string></dict>
</dict></plist>
PLIST
echo "== signing with \"$PROFILE\" and uploading"
xcodebuild -exportArchive -archivePath "$OUT/takt.xcarchive" -exportOptionsPlist "$OUT/export.plist" -exportPath "$OUT/export" \
  -authenticationKeyPath "$KEYS/AuthKey_$KEY_ID.p8" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER" \
  > "$OUT/export.log" 2>&1 || { grep -E "error|Error" "$OUT/export.log" | head -20; echo "upload failed: $OUT/export.log"; exit 1; }
echo "== uploaded; waiting for App Store Connect"
ASC_KEY_ID="$KEY_ID" node testflight/asc-submit.mjs "$BUILD" "$ASC_PLATFORM"
echo "Takt $VERSION ($BUILD) for $PLATFORM shipped. Logs: $OUT"
