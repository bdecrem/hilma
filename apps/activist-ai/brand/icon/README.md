# Ola app icon — "the tag"

A cream luggage tag lettered "Ola," on navy, tilted, with a mustard string flying off the top-left edge.

## Files

| File | Use |
|---|---|
| `ola-icon-macos.svg` | Master for macOS. Big Sur icon grid: 824px rounded square (radius ≈185) centered on a 1024 canvas, with drop shadow and transparent margin. |
| `ola-icon-fullbleed.svg` | Square, edge to edge, no rounding or shadow. Use this wherever the OS applies its own mask (iOS, Android adaptive, web manifest). |
| `ola-icon-macos-1024.png`, `ola-icon-fullbleed-1024.png` | 1024px renders of the two masters. |
| `AppIcon.iconset/` | Every macOS size, named for `iconutil` (16–512, @1x and @2x). |
| `AppIcon.icns` | Prebuilt .icns file, made with Pillow. If you want Apple's own build instead, regenerate it on the Mac with: `iconutil -c icns AppIcon.iconset` |

The "Ola" lettering is converted to outlines (Caveat Bold, SIL OFL), so the SVGs don't need any fonts installed.

## Wiring it in

- **Xcode / SwiftUI app:** drop the PNGs from `AppIcon.iconset/` into `Assets.xcassets/AppIcon.appiconset` and match each one to its slot in `Contents.json` by size. Or, if the project uses a single 1024 image, use `ola-icon-macos-1024.png`.
- **Electron / Tauri:** point the macOS icon config at `AppIcon.icns`.
- **Web / favicon:** generate from `ola-icon-fullbleed.svg`.

## Palette

| Role | Hex |
|---|---|
| Background navy | `#2B3A6E` |
| Glow (lighter navy) | `#34467F` |
| Ink / outlines | `#1B2550` |
| Tag shadow | `#141C42` at 60% |
| Tag paper | `#F5EFE4` |
| Comma (the only coral) | `#E8704A` |
| String, ring, sparkle | `#E9B44C` |

These colors match the ola.cx site.
