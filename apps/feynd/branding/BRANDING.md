# Dodo — official branding

Since 2026-10-01 the brand is the **jelly dodo**: a sky-blue jelly bird with
a tuft, two wing nubs, a marigold beak and blush cheeks, from Bart's art
pages in `misc/dodo-redesign/` (`jelly-dodos.html`, `jelly-critters.html`,
`dodo-jelly-map.html`). The pages are the source of truth for the look —
every colour, outline and face below is read out of their code. The
bookworm bird that preceded it (Claude Design, `dodo-logo.dc.html`,
`dodo-mark.svg`, `dodo-icon.svg`) is kept in this folder for history only.
The website (dodo.foo, `src/app/dodo/`) moved to the jelly on 2026-10-02:
`DodoMascot.tsx` is a live SVG port of the same body (the page's outline
maths, rim shading and face, posed by the old bird's beat model), the page
and `DodoFrame.tsx` use the palette below (lavender paper, sky accent,
grape labels, lemon numerals, the icon's sunrise peach behind the hero),
the favicon and OG card are the icon's picture, and the screenshot gallery
is recaptured from the jelly build through `scripts/dodo-scenes`.

## The mascot

The `dodo` spec of `jelly-dodos.html`, sky colourway: jelly gradient
`#DCF6FF → #5EC6EC → #2689BD`, rim `rgba(8,75,120,.5)`; outline a
superellipse `a:39 bt:36 bb:42 n:2.4` with six gaussian bumps (tuft, brow,
two wing nubs, two feet); eyes ink `#2A1F2B` at (±14, −9) r 4.6 with two
highlights; blush `rgba(255,90,130,.42)` at (±23, 4); beak `#FFD56C →
#F3962A` with an `#E0742A` nostril; world-fixed speculars.

The app draws it natively in `Feynd/JellyDodo.swift` (`drawJellyDodo`), posed
by the same `DodoPose` / `DodoMood` model the previous mascot used
(`AnimatedDodo.swift`, from `design/mascot-animation-spec.md`): squash and
stretch anchored at the feet, hops, rolls, blinks, a look-around; the tuft
leans with `sproutAngle`, the wing nubs puff with `wingAngle`, `squint` gives
the > < eyes and `mouth` opens the little honk mouth. Every reaction view
(`AnimatedDodoView`, `ReactionDodoView`), the chat mark (`DodoMiniMark`), the
onboarding figure and the Peck traveler are this one drawing.

Launch (`LaunchSplashView`): the dodo drops in from above, lands in a big
squash and wobbles out of it with a surprised "o", the lowercase wordmark
rises letter by letter, a double blink, a hello hop, then the idle loop —
on the icon's sunrise-peach ground (a dusk version of the same sky in dark
mode), with a white bloom behind the bird and little rising jelly bubbles.
~2.5 s.

## The critters

The fifteen critters of `jelly-critters.html` (bunny, peach, cat, dragon,
gummy, penguin, octo, red panda, blob, hamster, bat, bee, cloud, mushroom,
sprite) and the eight dodo colourways (sky, pink, peach, mint, lemon, grape,
cherry, lime) are rendered out of the pages' own drawing code by
`scripts/dodo-jelly/sprites.mjs` (Playwright; a hook inside each page's
IIFE renders one still body on a transparent 128 pt box, eyes open and a
`-squish` tap frame with > < eyes) into `Feynd/Assets.xcassets/Jelly/`
(`Jelly/<kind>`, `Jelly/<kind>-squish`, @2x/@3x). `scripts/dodo-jelly/sprites.json`
records each kind's colours and bounds. Re-run the script after the art
pages change. `JellyCritter` (`JellyAvatar.swift`) is the catalog in code.

They are the avatar choices (Profile → tap the avatar → "Your avatar": the
grid, "Use a photo", "Remove picture"; a critter is rendered on its tinted
disc and uploaded through the same `/api/f2/avatar` route a photo uses, the
pick remembered on the device so the badge draws the sprite itself) and the
map's inhabitants (long-press one on the trail → "Make this my avatar").

## App icon

The sky dodo on a sunrise peach ground (`#FFECD6 → #FFC9A6`, a white bloom
behind the bird, a soft ground shadow), composited from a 1024 px render
(`scripts/dodo-jelly/out/dodo-1024.png`) — the PIL recipe is in the
2026-10-01 session; `sprites.mjs` writes the 1024 render. Square PNGs; iOS
masks its own corners. The set lives in `Feynd/Assets.xcassets/AppIcon.appiconset/`.

## Text mark

Lowercase **dodo** in **Fredoka SemiBold (600)**, the theme's text ink,
letter spacing ≈ −0.015em. Google Fonts, OFL license; the variable TTF is
bundled in the app (`Feynd/Fonts/Fredoka.ttf`) and used via
`Font.custom("Fredoka", …).weight(.semibold)`. Fredoka is also the type on
the Peck map's numerals, ribbons, signs and headers.

## Palette

### Jelly colours (from the art pages — fixed across modes)

| Name | Light · base · deep | Used for |
|------|---------------------|----------|
| Sky (the mascot) | `#DCF6FF` `#5EC6EC` `#2689BD` | accent, avatar disc, lagoon |
| Pink | `#FFE0EF` `#FF9FC8` `#E9649D` | blush, bunny, chests |
| Peach | `#FFE6CF` `#FFAA82` `#F06C55` | icon ground, meadow nodes |
| Mint | `#E2FFF4` `#91E9CC` `#4DC5A2` | success / growth |
| Lemon | `#FFF8C8` `#FFD43A` `#E0A100` | stars, XP, the current-node ring |
| Grape | `#EFE2FF` `#A77BF2` `#6A3FC4` | secondary accent, peaks |
| Cherry | `#FF9A96` `#FF2B36` `#BF0D1C` | octo, cherry dodo |
| Lime | `#EFFFD0` `#A3E45C` `#4C9F2A` | lime dodo, meadow |
| Ink | `#2D2537` (pages) / `#3A2433` (map) | text on paper |

### App UI tokens (FeyndTheme.swift)

Light mode is lavender paper (the art pages' `--bg1 #F8F2F8`), dark mode an
indigo night (`#17131D`). Sky is the accent in both modes — bright on the
night, deep on paper so text set in it stays legible — and the ink on it
flips with it. Grape and mint support; lemon is the star gold; pink the
blush. Nothing is pure black or pure white.

| Token | Dark | Light |
|-------|------|-------|
| bg | `#17131D` | `#F8F2F8` |
| bgRaised | `#1E1826` | `#EFE7F3` |
| surface | `#271F31` | `#FFFCFF` |
| surface2 | `#332A3F` | `#F1E8F5` |
| surface3 | `#3F354C` | `#E4D8EA` |
| border | `#3D3349` | `#E6DBEC` |
| borderSoft | `#2E2639` | `#F0E8F4` |
| text | `#F3EBF6` | `#2D2537` |
| text2 | `#B3A8BC` | `#6A5F73` |
| text3 | `#7A6F85` | `#9A8FA4` |
| text4 | `#463D52` | `#D6CCDD` |
| accent (sky) | `#5EC6EC` | `#2689BD` |
| inkOnAccent | `#0B2A3D` | `#FFFFFF` |
| slate (grape) | `#B994FF` | `#7A4FD6` |
| sprout (mint) | `#7FE0C4` | `#2FA482` |
| gold (lemon) | `#FFD43A` | `#E0A100` |
| blush (pink) | `#FF9FC8` | `#FF9FC8` |

Avatar gradient (no picture): sky radial `#DCF6FF → #5EC6EC → #2689BD`.

## Peck — the jelly map

Setting: the candy world of `dodo-jelly-map.html`, bottom to top in bands of
ten levels: **Gumdrop Meadow** (1–10: green hills, gumdrops, candy trees,
sprinkles), **Jelly Lagoon** (11–20: water, sand islands under every node,
lily pads, floating stepping stones for the road), **Sprinkle Peaks** (21–30:
lavender sky, frosted candy mountains, lollipops) and **Sugar Castle** on a
cloud bank as the finale above the top band. Nodes are glossy jelly balls in
the region's colours (locked ones grey with a padlock), the current one has a
lemon ring and a "START" ribbon, gates are white arches with a pink
candy-cane stripe, signs are wooden with cream plates, chests are pink jelly
with a lemon band. The critters live along the trail (tap: squish and a
sound; long-press: make it your avatar). Dark mode is the same place by
moonlight: the scenery goes through a blue night filter while the stones,
the critters and the traveler keep their day colours and glow. The traveler
is the sky jelly dodo, standing on the current stone. Implemented in `FlashTabView.swift`, `PeckTrail.swift`,
`PeckJelly.swift` (the shared drawing helpers), `PeckRegionTransitionView.swift`.
Peck or Perish, the rest-stop minigame, keeps its riso engraving look on
purpose.

## Voice

The voice screen is the dodo itself on a peach jelly cushion, performing the
session (see `Feynd/JellyVoice.swift`): a turning dashed ring while it tunes
in, a mint ring while it listens, a lemon ring while you hold the key, three
bouncing jelly dots while it thinks, sky ripples while it speaks. The talk
key is a sky jelly slab that turns lemon when held; hands-free shows seven
jelly bars in the palette's order (pink, peach, lemon, mint, sky, grape,
pink). End is cherry jelly. The subject is a grape ribbon. The old tabletop
radio (`design/dodo-radio-*.html`) is retired with the bookworm brand.
