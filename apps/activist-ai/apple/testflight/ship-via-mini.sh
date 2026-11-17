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
#   NOPUBLISH=1 … mac: the real Developer ID export and notarization, nothing copied or published
#   MINI=local … archive on this Mac (the Mac download only, when the mini is full)
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
# MINI=local archives on this Mac instead (when the mini is full or away). Only for the Mac
# download: App Store Connect refuses an iPhone archive made with a beta Xcode.
if [ "$MINI" = local ]; then
  echo "== archiving here ($(xcodebuild -version | head -1)), disk"
  FREE=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  [ "${FREE:-0}" -ge 15 ] || { echo "error: this Mac has ${FREE:-?} GB free (under 15)" >&2; exit 1; }
  if [ "$WHAT" != mac ] && [[ "$(xcode-select -p)" == *beta* ]]; then echo "error: MINI=local with a beta Xcode is for the Mac download only (TestFlight refuses beta SDKs)" >&2; exit 1; fi
else
  echo "== the mini: disk, then syncing the sources"
  FREE=$(ssh -o ConnectTimeout=10 "$MINI" "df -g /System/Volumes/Data | awk 'NR==2{print \$4}'")
  [ "${FREE:-0}" -ge 10 ] || { echo "error: the mini has ${FREE:-?} GB free (under 10); not archiving there (MINI=local for the Mac download)" >&2; exit 1; }
fi
# Ola's skills, fresh from apps/activist-ai/skills as committed (refuses uncommitted changes); the
# archived Mac app is checked against them below (README, "Every release").
node tools/skills.mjs stage build/OlaSkills
node tools/skills.mjs stage build/OlaSkills >/dev/null   # bundled in the Mac app, checked after the archive
# Ola's opencode for the Mac app's Contents/Helpers (../opencode-fork; built here the first time,
# about eight minutes, then a copy); the archived app is checked against it below.
../opencode-fork/stage.sh stage build/OlaOpencode
xcodegen generate >/dev/null
[ "$MINI" = local ] || {
ssh -o ConnectTimeout=10 "$MINI" 'mkdir -p ~/ola-ship/apple'
rsync -a --delete --exclude .build --exclude DerivedData --exclude xcuserdata --exclude .DS_Store ./ "$MINI:ola-ship/apple/"
# Every folder project.yml reaches outside apple/ (`path: ../<dir>`), so the mini's copy builds.
for d in $(sed -n 's#^ *- path: \.\./\([A-Za-z0-9_-]*\).*#\1#p' project.yml | sort -u); do
  rsync -a --delete --exclude node_modules --exclude .DS_Store "../$d/" "$MINI:ola-ship/$d/"
done
}

archive() { # $1 scheme, $2 destination, $3 name
  if [ "$MINI" = local ]; then
    echo "== archiving $3 here (unsigned)"
    xcodebuild archive -project Ola.xcodeproj -scheme "$1" -destination "$2" -archivePath "$OUT/$3.xcarchive" \
      -configuration Release -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/ola-apple-tf-$3" \
      CODE_SIGN_IDENTITY='' CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO > "$OUT/$3-archive.log" 2>&1 \
      || { grep -E 'error:' "$OUT/$3-archive.log" | sort -u | head -20; echo "error: archive failed ($OUT/$3-archive.log)" >&2; exit 1; }
  else
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
  fi
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
  node tools/skills.mjs verify "$app/Contents/Resources/OlaSkills" || { echo "error: not shipping: the archived Mac app's skills are not apps/activist-ai/skills at HEAD" >&2; exit 1; }
  ../opencode-fork/stage.sh verify "$app" || { echo "error: not shipping: the archived Mac app's opencode is not ../opencode-fork's" >&2; exit 1; }
  # The opencode programs in Contents/Helpers are code of their own: under the hardened runtime they
  # need Bun's entitlements (Mac/OlaOpencode.entitlements), so each is signed before the app is, and
  # the export keeps what it finds. Checked after signing, below.
  sign_opencode() { local h; for h in "$app"/Contents/Helpers/ola-opencode-*; do codesign -f -s "$1" -o runtime ${2:+--timestamp=none} --entitlements Mac/OlaOpencode.entitlements "$h" >/dev/null 2>&1 || { echo "error: could not sign $(basename "$h")" >&2; exit 1; }; done; }
  # Passkeys in the app (README, "Passkeys in the app") need webcredentials:app.ola.cx, which only a
  # provisioning profile allows; the export makes a Developer ID one. OLA_PASSKEY=0 ships without.
  local ent=() want_wc=1
  [ "${OLA_PASSKEY:-1}" = 0 ] && want_wc="" || ent=(--entitlements Mac/Ola.entitlements)
  if [ -n "$DRY" ]; then
    local dev; dev=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)
    echo "== dry run: signing with $dev to check the bundle (no Developer ID export, no entitlements)"
    sign_opencode "$dev" dry
    codesign -f -s "$dev" -o runtime --timestamp=none "$app" >/dev/null 2>&1
    want_wc=""
  else
    # Xcode's cloud-managed Developer ID certificate (Bart's Apple ID is in Xcode here; nothing to
    # click). An unsigned archive carries no entitlements and no hardened-runtime flag, and the
    # export keeps what the app is signed with, so an ad-hoc signature puts both in first.
    echo "== signing the Mac app with Developer ID (Xcode's cloud certificate, export)"
    sign_opencode -
    codesign -f -s - -o runtime "${ent[@]}" "$app" >/dev/null 2>&1
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
      || { grep -iE "error" "$OUT/mac-export.log" | sort -u | head -15; echo "Developer ID signing failed: $OUT/mac-export.log" >&2; exit 1; }
    app="$OUT/mac-export/Ola.app"
  fi
  codesign --verify --deep --strict "$app" || { echo "error: the signed Mac app does not verify" >&2; exit 1; }
  # Read first, then match: grep -q closing the pipe early fails the line under pipefail.
  local sig; sig=$(codesign -dvv "$app" 2>&1)
  [[ "$sig" == *"flags="*"runtime"* ]] || { echo "error: the Mac app is not signed with the hardened runtime" >&2; exit 1; }
  if [ -n "$want_wc" ]; then
    local ents; ents=$(codesign -d --entitlements - --xml "$app" 2>/dev/null)
    [[ "$ents" == *"webcredentials:app.ola.cx"* ]] || { echo "error: the signed Mac app lacks webcredentials:app.ola.cx (passkeys)" >&2; exit 1; }
  fi
  # Each opencode program: hardened runtime, Bun's entitlements still on it, and this Mac's one starts.
  local h hs he
  for h in "$app"/Contents/Helpers/ola-opencode-*; do
    hs=$(codesign -dvv "$h" 2>&1); he=$(codesign -d --entitlements - --xml "$h" 2>/dev/null)
    [[ "$hs" == *"flags="*"runtime"* && "$he" == *"cs.allow-jit"* ]] || { echo "error: $(basename "$h") lost the hardened runtime or its entitlements in signing" >&2; exit 1; }
  done
  "$app/Contents/Helpers/ola-opencode-$(uname -m)" --version >/dev/null || { echo "error: the signed opencode inside the app does not start" >&2; exit 1; }
  echo "   signed: $(sed -n 's/^Authority=//p' <<<"$sig" | head -1), hardened runtime${want_wc:+, passkeys}"

  if [ -n "$DRY" ]; then
    local stage="$OUT/dmg" dmg="$OUT/Ola-$VERSION-$BUILD.dmg"
    mkdir -p "$stage" && ditto "$app" "$stage/Ola.app" && ln -s /Applications "$stage/Applications"
    hdiutil create -quiet -volname "Ola $VERSION" -srcfolder "$stage" -ov -format UDZO "$dmg"
    echo "   $(du -h "$dmg" | cut -f1) $dmg; dry run: not notarized, not published"; return
  fi

  echo "== notarizing the app (usually 2 to 10 minutes)"
  local zip="$OUT/Ola-$VERSION-$BUILD.zip"
  ditto -c -k --keepParent "$app" "$OUT/notarize-app.zip"
  notarize "$OUT/notarize-app.zip"
  xcrun stapler staple -q "$app"
  spctl -a -t exec "$app" 2>/dev/null || { echo "error: Gatekeeper refuses the notarized app" >&2; exit 1; }
  ditto -c -k --keepParent "$app" "$zip"   # the stapled app, for the Desktop copy

  echo "== the disk image, notarized too"
  local stage="$OUT/dmg" dmg="$OUT/Ola-$VERSION-$BUILD.dmg"
  mkdir -p "$stage" && ditto "$app" "$stage/Ola.app" && ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname "Ola $VERSION" -srcfolder "$stage" -ov -format UDZO "$dmg"
  notarize "$dmg"
  xcrun stapler staple -q "$dmg"
  # The disk image has no code signature of its own (the cloud certificate signs only through an
  # export), so Gatekeeper judges the app inside, accepted above; the image's ticket is checked here.
  xcrun stapler validate -q "$dmg" || { echo "error: the disk image carries no valid notarization ticket" >&2; exit 1; }
  echo "   $(du -h "$dmg" | cut -f1) $dmg"

  if [ -n "${NOPUBLISH:-}" ]; then echo "   NOPUBLISH: signed and notarized, not copied or published ($OUT)"; return; fi
  local desk=${OLA_DESKTOP_ZIP:-$HOME/Desktop/Ola/mac-download/Ola.zip}
  if [ -d "$(dirname "$desk")" ]; then cp "$zip" "$desk"; echo "   copied the stapled app to $desk"; fi

  echo "== publishing to ola.cx/ola-site/mac/ (unlisted; the app's update check reads latest.json)"
  local root; root=$(git rev-parse --show-toplevel)
  local pub="$root/public/ola-site/mac"
  mkdir -p "$pub" && git -C "$root" rm -q --ignore-unmatch "public/ola-site/mac/Ola-*.dmg" >/dev/null
  # Since Ola's opencode is inside (0.1 (3), about 230 MB) the image is past GitHub's 100 MB file
  # limit, so it goes up as a prerelease on the public repo (2 GB limit) and latest.json, still on
  # ola.cx, points there. A small image stays beside latest.json.
  local url="https://ola.cx/ola-site/mac/Ola-$VERSION-$BUILD.dmg"
  if [ "$(stat -f %z "$dmg")" -gt 95000000 ]; then
    local tag="ola-mac-$VERSION-$BUILD"
    (cd "$root" && gh release create "$tag" "$dmg" --repo bdecrem/hilma --prerelease --target main \
      --title "Ola for Mac $VERSION ($BUILD)" --notes "Developer ID signed and notarized. Ola's own opencode (MIT) is inside.") >/dev/null \
      || { echo "error: the GitHub release failed" >&2; exit 1; }
    url="https://github.com/bdecrem/hilma/releases/download/$tag/$(basename "$dmg")"
  else
    cp "$dmg" "$pub/"
  fi
  cat > "$pub/latest.json" <<JSON
{"version":"$VERSION","build":"$BUILD","url":"$url","notes":"${OLA_NOTES:-}"}
JSON
  git -C "$root" add "public/ola-site/mac"
  git -C "$root" commit -q -m "ola apple: TestFlight, the Mac download $VERSION ($BUILD) [${OLA_ISSUE:-OLA-118}]" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_012SXcnn2YuX2WXNrf6GerJQ"
  git -C "$root" fetch -q origin && git -C "$root" rebase -q origin/main && git -C "$root" push -q origin HEAD:main
  echo "   published: $url (latest.json on ola.cx in about 3 minutes)"
}
notarize() { # $1 a zip or dmg; exits unless Apple accepts it
  local f="$1" j="$1.notary.json"
  xcrun notarytool submit "$f" --key "$KEYS/AuthKey_$KEY_ID.p8" --key-id "$KEY_ID" --issuer "$ISSUER" --wait \
    --output-format json > "$j" 2> "$j.err" || true
  local st; st=$(cat "$j")
  [[ "$st" =~ \"status\"[[:space:]]*:[[:space:]]*\"Accepted\" ]] && { echo "   notarized: $(basename "$f")"; return; }
  sed 's/AuthKey_[^ ]*//' "$j.err" | head -5; echo "$st" | head -c 400; echo
  local id; id=$(sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' "$j" | head -1)
  [ -n "$id" ] && xcrun notarytool log "$id" --key "$KEYS/AuthKey_$KEY_ID.p8" --key-id "$KEY_ID" --issuer "$ISSUER" "$j.log" >/dev/null 2>&1 && echo "Apple's notes: $j.log"
  echo "error: notarization of $(basename "$f") was not accepted" >&2; exit 1
}

[ "$WHAT" = mac ] || ship_ios
[ "$WHAT" = ios ] || ship_mac
echo "== done: Ola $VERSION ($BUILD), $WHAT${DRY:+ (dry run)}. Logs: $OUT"
