# Polly — branding

Polly is the Dodo character (`../../feynd/branding/BRANDING.md`) recast as a
**scarlet macaw**: same geometry, same pose rig, new plumage. The two apps
must never be confused on a home screen, so nothing shares a colour with Dodo
except the cream face, the marigold beak and the blush.

## Palette

| Part | Hex | Note |
|---|---|---|
| Head, body | `#E8452C` (gradient `#F4735A` → `#B8331B`) | scarlet |
| Wings | `#3B6FD4` (gradient `#5A8CE6` → `#2C58B3`) | cobalt |
| Plume, left / centre / right | `#3B6FD4` / `#F7C948` / `#FF8A3D` | the macaw's wing colours worn as a crest; replaces Dodo's sprout on the same rig (stem base, boing, spread) |
| Plume stem | `#D63A22` | |
| Face, belly | `#F9EFDA` | kept — macaws really have a bare cream face patch |
| Beak, feet | `#F0A830` | kept |
| Icon ground, splash bloom | `#DCF3E7` (dark: `#1E3A32`) | mint cream, vs Dodo's peach |

## Files

- `polly-icon.svg` — full-bleed app icon (200×200 viewBox). Export with
  `cairosvg` to every size in `Polly/Assets.xcassets/AppIcon.appiconset/`
  (40, 58, 60, 80, 87, 120, 180, 1024); never hand-edit the PNGs.
- `polly-mark.svg` — the same mark on transparent.
- In code: `Polly/AnimatedDodo.swift` (`drawAnimatedDodo`, the launch splash
  and the Peck traveler) and `Polly/DodoArt.swift` (`DodoInk`, the chat mini
  mark, onboarding traveler). Both carry the palette above; the launch
  wordmark is lowercase "polly" in Fredoka.
- `dodo-*.svg`, `dodo-logo.dc.html`, `design/` — Dodo's originals, kept for
  reference; not used by the app.
