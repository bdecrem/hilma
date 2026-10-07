#!/bin/bash
# Ship Dodo to TestFlight when this Mac has only a beta Xcode (App Store Connect
# refuses beta-SDK archives): the archive is built UNSIGNED on the Mac mini
# (release Xcode, the hilma checkout in ~/Documents/code/hilma), tarred back
# here, and exported with this Mac's distribution profile and ASC key — the
# export re-signs and uploads; ASC judges the SDK from the archive. Then
# asc-submit.mjs waits for processing, adds the build to the public Testers
# group, expires any build waiting for review and submits this one.
#
#   ASC_KEY_ID=748UX45NAP FEYND_PROFILE="feynd appstore 2" ./apps/feynd/testflight/ship-via-mini.sh
#
# Ships the build number in project.yml as committed and PUSHED (the mini
# pulls main). Modelled on apps/tokensurfers/testflight/ship-via-mini.sh
# (2026-10-02). The mini needs no Secrets.swift of its own: the template is
# copied in (it points at production).
set -euo pipefail
cd "$(dirname "$0")/.."
MINI=${MINI:-admin@100.95.51.98}
KEYS="$HOME/.appstoreconnect/private_keys"
KEY_ID="${ASC_KEY_ID:?set ASC_KEY_ID, the App Store Connect key id on this Mac}"
ISSUER="69a6de80-eb13-47e3-e053-5b8c7c11a4d1"
PROFILE="${FEYND_PROFILE:?set FEYND_PROFILE, the IOS_APP_STORE profile name on this Mac}"
[ -f "$KEYS/AuthKey_$KEY_ID.p8" ] || { echo "error: $KEYS/AuthKey_$KEY_ID.p8 missing" >&2; exit 1; }
BUILD=$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' project.yml | sed -E 's/.*"([0-9]+)".*/\1/')
VERSION=$(grep -E '^[[:space:]]*MARKETING_VERSION:' project.yml | sed -E 's/.*"([^"]+)".*/\1/')
[ -z "$(git status --porcelain project.yml)" ] || { echo "error: project.yml has uncommitted changes; commit and push the build number first" >&2; exit 1; }
git fetch -q origin && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "error: push main first (the mini pulls it)" >&2; exit 1; }
OUT=$(mktemp -d "${TMPDIR:-/tmp}/dodo-ship.XXXXXX")

echo "== archiving $VERSION ($BUILD) on the mini"
ssh -o ConnectTimeout=10 "$MINI" 'set -e; export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ~/Documents/code/hilma && git pull -q --ff-only && cd apps/feynd && { [ -f Feynd/Secrets.swift ] || cp Feynd/Secrets.swift.example Feynd/Secrets.swift; } && { command -v xcodegen >/dev/null && xcodegen generate -q || echo "no xcodegen on the mini: using the committed .xcodeproj"; } && rm -rf /tmp/dodo.xcarchive && xcodebuild archive -project Feynd.xcodeproj -scheme Feynd -destination "generic/platform=iOS" -archivePath /tmp/dodo.xcarchive -configuration Release CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > /tmp/dodo-archive.log 2>&1 || { grep -E "error:" /tmp/dodo-archive.log | head; exit 1; }; /usr/libexec/PlistBuddy -c "Print CFBundleVersion" /tmp/dodo.xcarchive/Products/Applications/Feynd.app/Info.plist; cd /tmp && rm -f dodo.xcarchive.tgz && tar czf dodo.xcarchive.tgz dodo.xcarchive' \
  || { echo "archive on the mini failed" >&2; exit 1; }
scp -q "$MINI:/tmp/dodo.xcarchive.tgz" "$OUT/" && tar xzf "$OUT/dodo.xcarchive.tgz" -C "$OUT"
GOT=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$OUT/dodo.xcarchive/Products/Applications/Feynd.app/Info.plist")
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
<key>provisioningProfiles</key><dict><key>com.bartdecrem.Feynd</key><string>$PROFILE</string></dict>
</dict></plist>
PLIST
# Export to disk first and check what the re-signed app is entitled to: the
# archive is unsigned, so this is where push (aps-environment) and universal
# links (associated domains) either make it into the build or don't.
sed 's#<string>upload</string>#<string>export</string>#' "$OUT/export.plist" > "$OUT/export-disk.plist"
echo "== checking the signed app's entitlements"
xcodebuild -exportArchive -archivePath "$OUT/dodo.xcarchive" -exportOptionsPlist "$OUT/export-disk.plist" -exportPath "$OUT/disk" \
  > "$OUT/export-disk.log" 2>&1 || { grep -E "error" "$OUT/export-disk.log" | head; echo "disk export failed — $OUT/export-disk.log"; exit 1; }
mkdir -p "$OUT/unz" && unzip -q "$OUT"/disk/*.ipa -d "$OUT/unz"
codesign -d --entitlements - --xml "$OUT/unz/Payload/Feynd.app" > "$OUT/entitlements.plist" 2>/dev/null
plutil -p "$OUT/entitlements.plist"
grep -q "<key>aps-environment</key>" "$OUT/entitlements.plist" && grep -A1 "aps-environment" "$OUT/entitlements.plist" | grep -q production \
  || { echo "error: the signed app has no aps-environment=production — push would not work; not uploading" >&2; exit 1; }
grep -q "applinks:feynd.cc" "$OUT/entitlements.plist" \
  || { echo "error: the signed app has no applinks:feynd.cc — universal links would not work; not uploading" >&2; exit 1; }

echo "== signing with \"$PROFILE\" and uploading"
# The log goes to a file, never through a pipe: a closed pipe killed an
# upload at 94% once (apps/feynd/CLAUDE.md).
xcodebuild -exportArchive -archivePath "$OUT/dodo.xcarchive" -exportOptionsPlist "$OUT/export.plist" -exportPath "$OUT/export" \
  -authenticationKeyPath "$KEYS/AuthKey_$KEY_ID.p8" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER" \
  > "$OUT/export.log" 2>&1 || { grep -E "error|Error" "$OUT/export.log" | head -20; echo "upload failed — $OUT/export.log"; exit 1; }
grep -q "Upload succeeded" "$OUT/export.log" || { echo "error: the export log does not say 'Upload succeeded' — $OUT/export.log" >&2; exit 1; }
echo "== uploaded; waiting for App Store Connect"
ASC_KEY_ID="$KEY_ID" node testflight/asc-submit.mjs "$BUILD" IOS
echo "Dodo $VERSION ($BUILD) shipped via the mini. Logs: $OUT"
