#!/bin/bash
# Ship Ola: the iPhone app to TestFlight, the Mac app as a signed, notarized download on ola.cx
# (README.md here says why the Mac app cannot go through TestFlight). Modeled on Dodo's and
# Takt's ship-via-mini.sh. This iMac has only the Xcode beta and App Store Connect refuses
# beta-SDK archives, so the archive is built UNSIGNED on the Mac mini with its release Xcode
# (this script rsyncs apple/ and workspace/ plus the generated Ola.xcodeproj to ~/ola-ship there;
# the mini needs no git and no xcodegen), copied back, signed here, then:
#   ios  exported with the "ola phone appstore m1" profile and uploaded with the ASC key, then
#        asc-submit.mjs waits for processing and puts the build in the internal group
#   mac  signed with Developer ID (hardened runtime), notarized, stapled, a disk image published
#        to public/ola-site/mac/ with latest.json (the app's update check), committed and pushed
#
#   apps/activist-ai/apple/testflight/ship-via-mini.sh [ios|mac|both]     (default both)
#   DRY=1 …     archive, sign and check everything that needs no Apple server; nothing uploaded
#
# Before the first ship: node testflight/asc-setup.mjs (bundle ids, push, the app record, the
# internal group, the profile). Ships the build number in project.yml as committed: bump first
# (apps/activist-ai/apple/bump-build.sh) and commit. MINI=admin@171.66.240.175 if Tailscale is off.
set -euo pipefail
cd "$(dirname "$0")/.."
WHAT=${1:-both}
case "$WHAT" in ios|mac|both) ;; *) echo "usage: $0 [ios|mac|both]" >&2; exit 2 ;; esac
MINI=${MINI:-admin@100.95.51.98}
KEYS="$HOME/.appstoreconnect/private_keys"
KEY_ID=${ASC_KEY_ID:-748UX45NAP}
ISSUER="69a6de80-eb13-47e3-e053-5b8c7c11a4d1"
TEAM=274T5WCVD2
PROFILE=${OLA_PROFILE:-ola phone appstore m1}
DIST="Apple Distribution: Bart Decrem ($TEAM)"
DRY=${DRY:-}
[ -f "$KEYS/AuthKey_$KEY_ID.p8" ] || { echo "error: no App Store Connect key $KEY_ID in $KEYS" >&2; exit 1; }
BUILD=$(grep -E '^[[:space:]]*CURRENT_PROJECT_VERSION:' project.yml | head -1 | sed -E 's/.*"([0-9]+)".*/\1/')
VERSION=$(grep -E '^[[:space:]]*MARKETING_VERSION:' project.yml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
if [ -z "$DRY" ]; then
  [ -z "$(git status --porcelain project.yml)" ] || { echo "error: project.yml has uncommitted changes; run bump-build.sh and commit first" >&2; exit 1; }
fi
OUT=$(mktemp -d "${TMPDIR:-/tmp}/ola-ship.XXXXXX")
echo "== Ola $VERSION ($BUILD): $WHAT${DRY:+ (dry run)}; logs in $OUT"

# ---- archive on the mini --------------------------------------------------------------------
echo "== the mini: disk, then syncing the sources"
FREE=$(ssh -o ConnectTimeout=10 "$MINI" "df -g /System/Volumes/Data | awk 'NR==2{print \$4}'")
[ "${FREE:-0}" -ge 10 ] || { echo "error: the mini has ${FREE:-?} GB free (under 10); not archiving there" >&2; exit 1; }
# Ola's skills, fresh from apps/activist-ai/skills as committed (refuses uncommitted changes); the
# archived Mac app is checked against them below (README, "Every release").
node tools/skills.mjs stage build/OlaSkills
node tools/skills.mjs stage build/OlaSkills >/dev/null   # bundled in the Mac app, checked after the archive
xcodegen generate >/dev/null
ssh -o ConnectTimeout=10 "$MINI" 'mkdir -p ~/ola-ship/apple ~/ola-ship/workspace'
rsync -a --delete --exclude .build --exclude DerivedData --exclude xcuserdata --exclude .DS_Store ./ "$MINI:ola-ship/apple/"
rsync -a --delete --exclude node_modules --exclude .DS_Store ../workspace/ "$MINI:ola-ship/workspace/"

archive() { # $1 scheme, $2 destination, $3 name
  echo "== archiving $3 on the mini (release Xcode, unsigned)"
  ssh -o ConnectTimeout=10 "$MINI" "set -e; export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH; cd ~/ola-ship/apple
    rm -rf ~/ola-ship/$3.xcarchive ~/ola-ship/$3.xcarchive.tgz
    xcodebuild archive -project Ola.xcodeproj -scheme $1 -destination '$2' -archivePath ~/ola-ship/$3.xcarchive \
      -configuration Release -derivedDataPath ~/ola-ship/dd-$3 -clonedSourcePackagesDirPath ~/ola-ship/spm \
      CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > ~/ola-ship/$3-archive.log 2>&1 \
      || { grep -E 'error:' ~/ola-ship/$3-archive.log | sort -u | head -20; exit 1; }
    cd ~/ola-ship && tar czf $3.xcarchive.tgz $3.xcarchive" \
    || { echo "error: archive on the mini failed (its log: $MINI:ola-ship/$3-archive.log)" >&2; exit 1; }
  scp -q "$MINI:ola-ship/$3.xcarchive.tgz" "$OUT/" && tar xzf "$OUT/$3.xcarchive.tgz" -C "$OUT"
  local plist="$OUT/$3.xcarchive/Products/Applications/Ola.app/Info.plist"
  [ -f "$plist" ] || plist="$OUT/$3.xcarchive/Products/Applications/Ola.app/Contents/Info.plist"
  local got; got=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$plist")
  [ "$got" = "$BUILD" ] || { echo "error: the mini archived build $got, project.yml says $BUILD" >&2; exit 1; }
  local ver; ver=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$plist")
  [ "$ver" = "$VERSION" ] || { echo "error: the mini archived version $ver, project.yml says $VERSION" >&2; exit 1; }
  [ "$(/usr/libexec/PlistBuddy -c 'Print ITSAppUsesNonExemptEncryption' "$plist")" = false ] \
    || { echo "error: $3's Info.plist lacks ITSAppUsesNonExemptEncryption=false" >&2; exit 1; }
  [ -n "$(find "$OUT/$3.xcarchive/Products/Applications/Ola.app" -maxdepth 3 -name PrivacyInfo.xcprivacy)" ] \
    || { echo "error: $3 carries no PrivacyInfo.xcprivacy" >&2; exit 1; }
  echo "   archived: $(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$plist") ($got), $(du -sh "$OUT/$3.xcarchive/Products/Applications/Ola.app" | cut -f1)"
}

# ---- iPhone: TestFlight ---------------------------------------------------------------------
ship_ios() {
  archive OlaPhone "generic/platform=iOS" ola-ios
  local app="$OUT/ola-ios.xcarchive/Products/Applications/Ola.app"
  [ -f "$app/AppIcon60x60@2x.png" ] || [ -f "$app/Assets.car" ] || { echo "error: the iPhone app has no icon" >&2; exit 1; }
  echo "== signing the iPhone app with $DIST (push: production)"
  # An unsigned archive carries no entitlements and the export keeps what the app is signed with,
  # so the app is signed here first with the release entitlements (Dodo's lesson: builds 126 and
  # 127 shipped without theirs).
  local ent="$OUT/ios.entitlements"
  sed 's#<string>development</string>#<string>production</string>#' iOS/Ola.entitlements > "$ent"
  /usr/libexec/PlistBuddy -c "Add :application-identifier string $TEAM.cx.ola.phone" \
    -c "Add :com.apple.developer.team-identifier string $TEAM" \
    -c "Add :get-task-allow bool false" -c "Add :beta-reports-active bool true" "$ent" >/dev/null
  find "$app/Frameworks" -maxdepth 1 \( -name "*.framework" -o -name "*.dylib" \) 2>/dev/null | while read -r f; do
    codesign -f -s "$DIST" --timestamp=none "$f" >/dev/null 2>&1 || { echo "error: could not sign $f" >&2; exit 1; }
  done
  codesign -f -s "$DIST" --timestamp=none --entitlements "$ent" "$app" >/dev/null 2>&1
  codesign --verify --deep --strict "$app" || { echo "error: the signed iPhone app does not verify" >&2; exit 1; }
  if [ -n "$DRY" ] && ! profile_installed; then
    echo "   dry run: signed and verified; no \"$PROFILE\" profile yet (asc-setup.mjs makes it), so no export"
    return
  fi
  profile_installed || { echo "error: no \"$PROFILE\" provisioning profile on this Mac: run node testflight/asc-setup.mjs" >&2; exit 1; }
  local plist="$OUT/ios-export.plist" dest=upload
  [ -n "$DRY" ] && dest=export
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>$dest</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>teamID</key><string>$TEAM</string>
<key>provisioningProfiles</key><dict><key>cx.ola.phone</key><string>$PROFILE</string></dict>
</dict></plist>
PLIST
  echo "== exporting with \"$PROFILE\" ($dest)"
  # To a file, never through head: SIGPIPE once killed a Dodo upload at 94%.
  xcodebuild -exportArchive -archivePath "$OUT/ola-ios.xcarchive" -exportOptionsPlist "$plist" -exportPath "$OUT/ios-export" \
    -authenticationKeyPath "$KEYS/AuthKey_$KEY_ID.p8" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER" \
    > "$OUT/ios-export.log" 2>&1 || { grep -iE "error" "$OUT/ios-export.log" | sort -u | head -15; echo "export failed: $OUT/ios-export.log" >&2; exit 1; }
  [ -n "$DRY" ] && { echo "   dry run: exported $(ls "$OUT"/ios-export/*.ipa)"; return; }
  grep -q "Upload succeeded" "$OUT/ios-export.log" || { echo "error: the export log does not say 'Upload succeeded': $OUT/ios-export.log" >&2; exit 1; }
  echo "== uploaded; waiting for App Store Connect"
  ASC_KEY_ID="$KEY_ID" node testflight/asc-submit.mjs "$BUILD" IOS
}
profile_installed() {
  local f
  for f in "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"/*.mobileprovision "$HOME/Library/MobileDevice/Provisioning Profiles"/*.mobileprovision; do
    [ -f "$f" ] || continue
    local xml; xml=$(security cms -D -i "$f" 2>/dev/null || true)
    [[ "$xml" == *"<key>Name</key>"*"<string>$PROFILE</string>"* ]] && return 0
  done
  return 1
}

# ---- Mac: the signed, notarized download ----------------------------------------------------
ship_mac() {
  archive OlaMac "generic/platform=macOS" ola-mac
  local app="$OUT/ola-mac.xcarchive/Products/Applications/Ola.app"
  node tools/skills.mjs verify "$app/Contents/Resources/OlaSkills" >/dev/null || { echo "error: the archived app's skills are not apps/activist-ai/skills at HEAD" >&2; exit 1; }
  node tools/skills.mjs verify "$app/Contents/Resources/OlaSkills" || { echo "error: not shipping: the archived Mac app's skills are not apps/activist-ai/skills at HEAD" >&2; exit 1; }
  local devid; devid=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
  if [ -n "$devid" ]; then
    echo "== signing the Mac app with $devid (hardened runtime, timestamp)"
    find "$app/Contents" \( -name "*.framework" -o -name "*.dylib" \) -prune 2>/dev/null | while read -r f; do
      codesign -f -s "$devid" -o runtime --timestamp "$f" >/dev/null 2>&1
    done
    codesign -f -s "$devid" -o runtime --timestamp "$app" >/dev/null 2>&1
  elif [ -n "$DRY" ]; then
    # No Developer ID on this Mac yet: prove the rest with Apple Distribution's sibling, the
    # development identity (same hardened runtime; notarization is what it cannot do).
    local dev; dev=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)
    echo "== dry run: no Developer ID Application identity here; signing with $dev to check the bundle"
    codesign -f -s "$dev" -o runtime --timestamp=none "$app" >/dev/null 2>&1
  else
    # Xcode's cloud-managed Developer ID (Bart's Apple ID in Xcode, Account Holder): the export
    # signs. The ad-hoc signature first carries the hardened-runtime flag into the export.
    echo "== signing the Mac app with Xcode's cloud-managed Developer ID (export)"
    codesign -f -s - -o runtime "$app" >/dev/null 2>&1
    cat > "$OUT/mac-export.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>developer-id</string>
<key>destination</key><string>export</string>
<key>signingStyle</key><string>automatic</string>
<key>teamID</key><string>$TEAM</string>
</dict></plist>
PLIST
    xcodebuild -exportArchive -archivePath "$OUT/ola-mac.xcarchive" -exportOptionsPlist "$OUT/mac-export.plist" \
      -exportPath "$OUT/mac-export" -allowProvisioningUpdates > "$OUT/mac-export.log" 2>&1 \
      || { grep -iE "error" "$OUT/mac-export.log" | sort -u | head -15
           echo "Developer ID signing failed ($OUT/mac-export.log). Once: Xcode, Settings, Accounts, Manage Certificates, +, Developer ID Application; then rerun." >&2; exit 1; }
    app="$OUT/mac-export/Ola.app"
  fi
  codesign --verify --deep --strict "$app" || { echo "error: the signed Mac app does not verify" >&2; exit 1; }
  # Read first, then match: grep -q closing the pipe early fails the line under pipefail.
  local sig; sig=$(codesign -dv "$app" 2>&1)
  [[ "$sig" == *"flags="*"runtime"* ]] || { echo "error: the Mac app is not signed with the hardened runtime" >&2; exit 1; }
  echo "   signed: $(codesign -dvv "$app" 2>&1 | sed -n 's/^Authority=//p' | head -1), hardened runtime"

  echo "== the disk image"
  local stage="$OUT/dmg" dmg="$OUT/Ola-$VERSION-$BUILD.dmg"
  mkdir -p "$stage" && ditto "$app" "$stage/Ola.app" && ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname "Ola $VERSION" -srcfolder "$stage" -ov -format UDZO "$dmg"
  echo "   $(du -h "$dmg" | cut -f1) $dmg"
  if [ -n "$DRY" ]; then echo "   dry run: not notarized, not published"; return; fi

  echo "== notarizing (usually 2 to 10 minutes)"
  xcrun notarytool submit "$dmg" --key "$KEYS/AuthKey_$KEY_ID.p8" --key-id "$KEY_ID" --issuer "$ISSUER" --wait \
    --output-format json > "$OUT/notary.json" 2> "$OUT/notary.err" || true
  grep -q '"status" *: *"Accepted"' "$OUT/notary.json" || {
    cat "$OUT/notary.err" "$OUT/notary.json" | grep -vi 'key' | head -10
    local id; id=$(sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' "$OUT/notary.json" | head -1)
    [ -n "$id" ] && xcrun notarytool log "$id" --key "$KEYS/AuthKey_$KEY_ID.p8" --key-id "$KEY_ID" --issuer "$ISSUER" "$OUT/notary-log.json" >/dev/null 2>&1 && echo "Apple's notes: $OUT/notary-log.json"
    echo "error: notarization was not accepted" >&2; exit 1; }
  xcrun stapler staple -q "$dmg"
  spctl -a -t open --context context:primary-signature "$dmg" || { echo "error: Gatekeeper refuses the disk image" >&2; exit 1; }

  echo "== publishing to ola.cx/ola-site/mac/"
  local root; root=$(git rev-parse --show-toplevel)
  local pub="$root/public/ola-site/mac"
  mkdir -p "$pub" && git -C "$root" rm -q --ignore-unmatch "public/ola-site/mac/Ola-*.dmg" >/dev/null
  cp "$dmg" "$pub/"
  cat > "$pub/latest.json" <<JSON
{"version":"$VERSION","build":"$BUILD","url":"https://ola.cx/ola-site/mac/Ola-$VERSION-$BUILD.dmg","notes":"${OLA_NOTES:-}"}
JSON
  git -C "$root" add "public/ola-site/mac"
  git -C "$root" commit -q -m "ola apple: TestFlight, the Mac download $VERSION ($BUILD)" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_012SXcnn2YuX2WXNrf6GerJQ"
  git -C "$root" fetch -q origin && git -C "$root" rebase -q origin/main && git -C "$root" push -q origin HEAD:main
  echo "   published: https://ola.cx/ola-site/mac/Ola-$VERSION-$BUILD.dmg (live in about 3 minutes)"
}

[ "$WHAT" = mac ] || ship_ios
[ "$WHAT" = ios ] || ship_mac
echo "== done: Ola $VERSION ($BUILD), $WHAT${DRY:+ (dry run)}. Logs: $OUT"
