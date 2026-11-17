#!/bin/bash
# Builds Bart's Ola apps and draws the screenshots, without touching the screen.
#
#   tools/build.sh mac [shots-dir]     the Mac app (ad-hoc signed); with a dir, renders its views to PNGs
#   tools/build.sh sim                 the iPhone app for the simulator
#   tools/build.sh device              the iPhone app for a device (automatic signing, team 274T5WCVD2)
#   tools/build.sh install-mac         copies the built Mac app to /Applications/Ola.app (does not open it)
set -euo pipefail
cd "$(dirname "$0")/.."
DD="${OLA_DERIVED:-$HOME/Library/Developer/Xcode/DerivedData/ola-apple}"
xcodegen generate >/dev/null
case "${1:-}" in
  mac)
    xcodebuild -project Ola.xcodeproj -scheme OlaMac -configuration Debug -derivedDataPath "$DD" \
      CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="-" AD_HOC_CODE_SIGNING_ALLOWED=YES PROVISIONING_PROFILE_SPECIFIER="" DEVELOPMENT_TEAM="" \
      build 2>&1 | grep -E "error:|BUILD" | sort -u
    if [ -n "${2:-}" ]; then
      rm -rf "$2"
      "$DD/Build/Products/Debug/Ola.app/Contents/MacOS/Ola" -OlaSnapshot "$2" ${OLA_ONLY:+-OlaOnly "$OLA_ONLY"}
    fi
    ;;
  sim)
    xcodebuild -project Ola.xcodeproj -scheme OlaPhone -configuration Debug -derivedDataPath "$DD" \
      -destination 'generic/platform=iOS Simulator' build 2>&1 | grep -E "error:|BUILD" | sort -u
    echo "$DD/Build/Products/Debug-iphonesimulator/Ola.app"
    ;;
  device)
    xcodebuild -project Ola.xcodeproj -scheme OlaPhone -configuration Debug -derivedDataPath "$DD" \
      -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=274T5WCVD2 build 2>&1 | grep -E "error:|BUILD|signing|Signing|provision" | sort -u
    echo "$DD/Build/Products/Debug-iphoneos/Ola.app"
    ;;
  install-mac)
    rm -rf /Applications/Ola.app
    cp -R "$DD/Build/Products/Debug/Ola.app" /Applications/Ola.app
    echo "copied to /Applications/Ola.app (not opened)"
    ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
