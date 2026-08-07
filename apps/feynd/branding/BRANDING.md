# Dodo — official branding

Source of truth: Claude Design project
https://claude.ai/design/p/24e0db26-c902-42e7-b7b8-db5697b591dc (archived here
as `dodo-logo.dc.html`). The official mark is the newest turn (t4/4a): the
bookworm dodo reading a book.

## The mark

`dodo-mark.svg` — the bookworm on transparent. Slate-blue dodo with a sprout
on its head (still learning), cream face, marigold beak, blush cheeks, mitten
wings gripping an open cream book. Drawn on a 200×200 viewBox.

## App icon

`dodo-icon.svg` — the mark full-bleed over peach `#FCE5D0`. Export square
PNGs; iOS masks its own corners (never bake rounded corners). The exported
set lives in `Feynd/Assets.xcassets/AppIcon.appiconset/`.

## Text mark

Lowercase **dodo** in **Fredoka SemiBold (600)**, ink `#3E4A52`, letter
spacing −0.4px at 27px (≈ −0.015em). Google Fonts, OFL license; the variable
TTF is bundled in the app (`Feynd/Fonts/Fredoka.ttf`) and used via
`Font.custom("Fredoka", …).weight(.semibold)`.

Lockup: mini icon tile (22.4% corner radius, peach bg) + 9px gap + wordmark;
tile height ≈ wordmark cap height (26px tile against 27px type).

`dodo-wordmark-drawn.svg` is the display variant from turn 2 — hand-drawn
"dod" letterforms with the teal bird as the final o. Use for splash/marketing
moments, not chrome.

## Palette

### Brand (from the mark — fixed across modes)

| Name | Hex | Source |
|------|-----|--------|
| Marigold | `#F0A830` | beak — the primary accent |
| Marigold deep | `#C9821F` | beak nostrils / pressed states |
| Slate blue | `#7C9EB2` | body |
| Slate wing | `#6A8FA3` | wings / secondary slate |
| Sprout | `#7BB662` | head sprout (also `#6FAE5C`, `#5F9E4C`) |
| Face cream | `#F9EFDA` | face — dark-mode text color |
| Ink | `#33383E` | eyes — light-mode text color |
| Wordmark ink | `#3E4A52` | text mark |
| Blush | `#F2A19A` | cheeks |
| Icon peach | `#FCE5D0` | icon background |
| Book cream | `#FFFBF0` / `#F0E6CC` | pages — light-mode surfaces |

### App UI tokens (FeyndTheme.swift)

Dark mode is "slate ink" — the bird's eye color family, never pure black.
Light mode is "butter paper" — the book's cream family, never pure white.
Marigold is the accent in both; slate blue and sprout green are supporting
accents; star gold stays its own warmer tone so stars read apart from
buttons.

| Token | Dark | Light |
|-------|------|-------|
| bg | `#14191D` | `#FBF5E6` |
| bgRaised | `#1B2127` | `#F2EAD6` |
| surface | `#202830` | `#FFFDF7` |
| surface2 | `#2B343D` | `#F0E6CC` |
| surface3 | `#36414B` | `#E2D7BA` |
| border | `#333E48` | `#E3D9C2` |
| borderSoft | `#273038` | `#F0E9D8` |
| text | `#F7F0DE` | `#33383E` |
| text2 | `#A0ACB4` | `#606C75` |
| text3 | `#64717B` | `#939DA5` |
| text4 | `#3C4854` | `#CEC9B8` |
| accent (marigold) | `#F0A830` | `#DD9420` |
| slate | `#8FB0C4` | `#6A8FA3` |
| sprout | `#7BB662` | `#5F9E4C` |
| gold (stars/XP) | `#FFB44A` | `#E89C2C` |
| ink-on-accent | `#261C06` | `#261C06` |

Avatar gradient: marigold radial `#F6C46A → #F0A830 → #B97A14`.
