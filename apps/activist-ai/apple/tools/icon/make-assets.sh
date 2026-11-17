#!/bin/bash
# Builds the two asset catalogs' icons from tools/icon/{mac,ios,mark}.png (made by render.swift
# from the brand's mark, ola-brand/7-letter-and-desk/b2/mark-*.svg).
set -euo pipefail
cd "$(dirname "$0")/../.."
for app in Mac iOS; do
  A="$app/Assets.xcassets"
  mkdir -p "$A/AppIcon.appiconset" "$A/Mark.imageset"
  printf '{"info":{"author":"xcode","version":1}}\n' > "$A/Contents.json"
  cp tools/icon/mark.png "$A/Mark.imageset/mark.png"
  printf '{"images":[{"filename":"mark.png","idiom":"universal"}],"info":{"author":"xcode","version":1}}\n' > "$A/Mark.imageset/Contents.json"
done
M=Mac/Assets.xcassets/AppIcon.appiconset
imgs=""
for s in 16 32 128 256 512; do
  for k in 1 2; do
    px=$((s * k))
    sips -z $px $px tools/icon/mac.png --out "$M/icon_${s}x${s}@${k}x.png" >/dev/null
    imgs="$imgs{\"filename\":\"icon_${s}x${s}@${k}x.png\",\"idiom\":\"mac\",\"scale\":\"${k}x\",\"size\":\"${s}x${s}\"},"
  done
done
printf '{"images":[%s],"info":{"author":"xcode","version":1}}\n' "${imgs%,}" > "$M/Contents.json"
I=iOS/Assets.xcassets/AppIcon.appiconset
cp tools/icon/ios.png "$I/icon-1024.png"
printf '{"images":[{"filename":"icon-1024.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}\n' > "$I/Contents.json"
echo assets made
