#!/bin/bash
# The app icon is Bart's own choice, "the tag" (apps/activist-ai/brand/icon, read its README). This
# copies his files, as they are, into the two asset catalogs: the Mac's AppIcon from AppIcon.iconset
# (each file to the slot of its size), the iPhone's from the full-bleed 1024 (iOS applies its mask),
# and the small mark the apps draw (connect and pairing screens) from the same full-bleed square.
# Nothing here draws or re-exports an icon.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=../brand/icon
M=Mac/Assets.xcassets/AppIcon.appiconset
I=iOS/Assets.xcassets/AppIcon.appiconset
rm -f "$M"/*.png "$I"/*.png
imgs=""
for s in 16 32 128 256 512; do
  cp "$SRC/AppIcon.iconset/icon_${s}x${s}.png" "$M/"
  cp "$SRC/AppIcon.iconset/icon_${s}x${s}@2x.png" "$M/"
  imgs="$imgs{\"filename\":\"icon_${s}x${s}.png\",\"idiom\":\"mac\",\"scale\":\"1x\",\"size\":\"${s}x${s}\"},"
  imgs="$imgs{\"filename\":\"icon_${s}x${s}@2x.png\",\"idiom\":\"mac\",\"scale\":\"2x\",\"size\":\"${s}x${s}\"},"
done
printf '{"images":[%s],"info":{"author":"xcode","version":1}}\n' "${imgs%,}" > "$M/Contents.json"
cp "$SRC/ola-icon-fullbleed-1024.png" "$I/icon-1024.png"
printf '{"images":[{"filename":"icon-1024.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}\n' > "$I/Contents.json"
for app in Mac iOS; do
  rm -f "$app/Assets.xcassets/Mark.imageset/"*.png
  cp "$SRC/ola-icon-fullbleed-1024.png" "$app/Assets.xcassets/Mark.imageset/mark.png"
done
echo "icon installed from $SRC"
