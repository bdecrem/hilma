#!/bin/bash
# Ship Dolly to TestFlight from a Mac that has only a beta Xcode (App Store
# Connect refuses beta-SDK archives): the archive is built UNSIGNED on the Mac
# mini (release Xcode; this script rsyncs apps/dolly to ~/dolly-ship there — no
# git or xcodegen needed on the mini), tarred back here, and exported with this
# Mac's distribution profile and ASC key — the export re-signs and uploads; ASC
# judges the SDK from the archive. Then asc-submit.mjs waits for processing,
# adds the build to the Testers group and submits it for beta review. Polly's
# ship-via-mini.sh (2026-09-30), adapted.
#
#   ./apps/dolly/testflight/ship-via-mini.sh
#   ASC_KEY_ID=748UX45NAP DOLLY_PROFILE="polly appstore m1" MINI=admin@100.95.51.98   # the defaults: this iMac M1, the mini over Tailscale
#
# Ships the build number in project.yml as committed (bump and commit first —
# ./apps/dolly/bump-build.sh). The mini's keychain can't be unlocked over ssh,
# so it never signs anything.
set -euo pipefail
cd "$(dirname "$0")/.."
MINI=${MINI:-admin@100.95.51.98}
KEYS="$HOME/.appstoreconnect/private_keys"
KEY_ID="${ASC_KEY_ID:-748UX45NAP}"
ISSUER="69a6de80-eb13-47e3-e053-5b8c7c11a4d1"
PROFILE="${DOLLY_PROFILE:-polly appstore m1}"
[ -f "$KEYS/AuthKey_$KEY_ID.p8" ] || { echo "error: $KEYS/AuthKey_$KEY_ID.p8 missing" >&2; exit 1; }
[ -f Dolly/Secrets.swift ] || { echo "error: Dolly/Secrets.swift missing (copy Secrets.swift.example)" >&2; exit 1; }
BUILD=$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' project.yml | sed -E 's/.*"([0-9]+)".*/\1/')
VERSION=$(grep -E '^[[:space:]]*MARKETING_VERSION:' project.yml | sed -E 's/.*"([^"]+)".*/\1/')
[ -z "$(git status --porcelain project.yml)" ] || { echo "error: project.yml has uncommitted changes; commit the build number first" >&2; exit 1; }
OUT=$(mktemp -d "${TMPDIR:-/tmp}/dolly-ship-mini.XXXXXX")

echo "== syncing apps/dolly to the mini"
rsync -a --delete --exclude build --exclude DerivedData --exclude .shots --exclude xcuserdata --exclude .DS_Store ./ "$MINI:dolly-ship/"

echo "== archiving $VERSION ($BUILD) on the mini (unsigned)"
ssh -o ConnectTimeout=10 "$MINI" 'set -e; export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ~/dolly-ship && rm -rf /tmp/dolly.xcarchive && xcodebuild archive -project Dolly.xcodeproj -scheme Dolly -destination "generic/platform=iOS" -archivePath /tmp/dolly.xcarchive -configuration Release CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > /tmp/dolly-archive.log 2>&1 || { grep -E "error:" /tmp/dolly-archive.log | head; exit 1; }; /usr/libexec/PlistBuddy -c "Print CFBundleVersion" /tmp/dolly.xcarchive/Products/Applications/Dolly.app/Info.plist; cd /tmp && rm -f dolly.xcarchive.tgz && tar czf dolly.xcarchive.tgz dolly.xcarchive' \
  || { echo "archive on the mini failed (its log: $MINI:/tmp/dolly-archive.log)" >&2; exit 1; }
scp -q "$MINI:/tmp/dolly.xcarchive.tgz" "$OUT/" && tar xzf "$OUT/dolly.xcarchive.tgz" -C "$OUT"
GOT=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$OUT/dolly.xcarchive/Products/Applications/Dolly.app/Info.plist")
[ "$GOT" = "$BUILD" ] || { echo "error: the mini archived build $GOT, project.yml says $BUILD" >&2; exit 1; }

cat > "$OUT/export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>teamID</key><string>274T5WCVD2</string>
<key>provisioningProfiles</key><dict><key>com.bartdecrem.Polly</key><string>$PROFILE</string></dict>
</dict></plist>
PLIST
echo "== signing with \"$PROFILE\" and uploading"
xcodebuild -exportArchive -archivePath "$OUT/dolly.xcarchive" -exportOptionsPlist "$OUT/export.plist" -exportPath "$OUT/export" \
  -authenticationKeyPath "$KEYS/AuthKey_$KEY_ID.p8" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER" \
  > "$OUT/export.log" 2>&1 || { grep -E "error|Error" "$OUT/export.log" | head -20; echo "upload failed — $OUT/export.log"; exit 1; }
echo "== uploaded; waiting for App Store Connect"
ASC_KEY_ID="$KEY_ID" node testflight/asc-submit.mjs "$BUILD"
echo "Dolly $VERSION ($BUILD) shipped via the mini. Logs: $OUT"
