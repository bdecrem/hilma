# Recipe: Dodo anime (the summer-anime design system)

`public/dodo/anime.html` (live at [dodo.foo/anime](https://dodo.foo/anime))
redraws Dodo and the Peck map as a four-episode summer anime. It isn't a
cousin of a reference video. It is a restyle of our own app. Use this recipe
to keep drawing Dodo, or anything in Dodo's world, in this style: new
scenes, new expressions, marketing stills, an in-app skin.

## The feel in one line

A Shinkai summer sky with a Ghibli countryside under it, and a cel-shaded
chibi on top: painted backgrounds, a character in hard flat shapes.

## The rules we follow (and why they read as anime)

1. **Cel, not airbrush.** Every surface on the character has three flat
   tones: base, shadow, highlight. Shadows are hard-edged shapes. The only
   gradient on the character is in the iris. Backgrounds are the opposite:
   painted, layered and graded. That contrast between cel and painted board
   is what makes it read as anime.
2. **Coloured line art.** The trace line is deep indigo (`--ln`), never
   black. It is warm brown (`--lnw`) around the beak and feet. Outer
   contours are 1.8 units and inner lines 0.7–1.2.
3. **One light source,** upper left. Shadows fall lower right. Catchlights
   in both eyes sit on the same side, and the rim light runs down the right
   edge.
4. **Shadows go violet.** Each shadow colour is cooler and more purple than
   its base, never just a darker version of it.
5. **A colour model per time of day (色彩設計).** The whole character is
   re-coloured per scene: day, magic hour, night and dawn. It is never
   tinted with an overlay. On the page, Dodo changes model as he walks into
   each episode.
6. **The eyes do the acting.** They are taller than wide (5.8 × 7.2), with
   a thick upper lash line and an outer flick. The iris darkens at the top
   and lightens at the bottom. There are two catchlights, a big oval upper
   left and a dot lower right.
7. **The sprout is the ahoge,** the one stray hair an anime character acts
   with. It perks up, stands stiff, wilts, curls into a question mark, or
   tilts sleepily. It also holds the umbrella, because the wings are too
   short (a running gag).
8. **Manpu (漫符), the symbol vocabulary:** sweat drop, anger vein, sparkle,
   gloom lines, snot bubble and "…" dots. Use them instead of explaining.
9. **Chibi proportions:** about 2 heads tall. The head (r≈27) is bigger than
   the body.
10. **Something the wind moves.** The red scarf is the one colour that holds
    against every background, and its tails show the wind direction in
    every frame.
11. **The compositing pass (撮影):** a film-grain overlay at 7%, lens flare
    rings along the line from the sun, sun glow and god rays. Only
    backgrounds get these, never the character.

## The character

Art space matches the app (`AnimatedDodo.swift`): head centre (0,0), head
radius about 27, feet at y = 58, and the sprout up to y≈−49. Everything is
SVG built by `dodoSVG(o)` in the page. Parts are drawn back to front:

feet → tail tuft → body (+ shadow crescent, rim) → belly → scarf band →
scarf tails → knot → wings → sprout → head (+ shadow crescent, jagged
"angel ring" highlight, rim) → face (hooded cream shape with three bangs
dipping into it, hood shadow) → blush (oval + three hatch strokes) → eyes →
beak → manpu.

- **Cel shadow trick:** the shadow is a rectangle with a circular hole
  (`hole(cx, cy, r)`, even-odd), clipped to the shape. Offsetting the hole
  up-left leaves a crescent lower right.
- **Views:** `front`, `q` (three-quarter: the face shifts 4.4 right, the far
  eye narrows to 0.72) and `back` (no face, the tail tuft centred). Mirror
  `q` with `scaleX(-1)` to face left.
- **Expressions:** `normal`, `happy` (^ ^ eyes, open beak, perk),
  `excited` (star catchlights), `thinking` (half lid, pupils up-left,
  question-mark sprout, sweat, dots), `wrong` (teary, wobbly beak, gloom,
  droop), `determined` (a flat lid cuts the eye, flame), `sleepy` (closed
  arcs, snot bubble, zzz) and `angry` (a steep lid, small pupils, the
  vein).
- **Motion** comes from pose functions, the same shape as the app's
  `DodoPose`: `idlePose` (breath, sprout sway), `walkPose(phase)` (bounce,
  roll, foot lifts, wing flap), `hopPose(u)` (anticipation → stretch →
  land). Squash and stretch are anchored at the feet (0,58). Blinks come
  every 3–5 s, sometimes doubled.

### Colour models

| Token | Day 昼 | Magic hour 夕 | Night 夜 | Dawn 暁 |
|---|---|---|---|---|
| feather `--f` | `#6fa8e0` | `#9b8fd8` | `#4262ac` | `#88a6e6` |
| feather shadow `--fs` | `#4a70c0` | `#5b48a6` | `#222c6a` | `#6a68c0` |
| face cream `--c` | `#fff8e8` | `#ffe3c6` | `#bcc5e8` | `#ffeee6` |
| beak `--b` | `#ffb43c` | `#ff9e45` | `#d8924a` | `#ffae5c` |
| scarf `--sc` | `#f04a35` | `#ff5a3a` | `#c93a4e` | `#ff5b4a` |
| sprout `--lf` | `#78d86c` | `#a2cf5e` | `#4e9e78` | `#86d47a` |
| line `--ln` | `#232c5c` | `#3a2050` | `#0d1134` | `#302c5e` |
| rim `--rim` | white, 55% | `#ffb45a` | `#ffc46a` (lantern) | `#ffd7a0` |

The full sets, including highlight, shadow and iris tokens, are the `.m-*`
classes at the top of the page's CSS.

## The world

The four episodes stack vertically, each opening on a black title card
(第一話 …):

| Episode | Setting | Rest stop (5/15/25) | Chests | Gate (10/20/30) | Gadget |
|---|---|---|---|---|---|
| 1 朝の田んぼ | rice paddies, cumulonimbus, telephone wires, a one-car train, sunflowers, scarecrow | bus stop + glowing vending machine | gachapon capsules | torii "森へ" | janome umbrella |
| 2 夕暮れの杉の森 | cedar trunks with an orange rim, god rays, fireflies, sprout spirits, a stream with a red bridge | hokora shrine | omamori | senbon torii "祭へ" | giant leaf |
| 3 星降る夏祭り | Milky Way, comet, fireworks, pagoda skyline, lantern strings, a river of floating lanterns, fox masks | kakigōri stall with the 氷 flag | goldfish bags | torii "海へ" | wish lantern |
| 4 暁の海 | sunrise, Mauritius (Le Morne) on the horizon, a train on the sea, floating torii, gulls, beach, Dodo's family | — | — | — | paper crane |

- **Painted sky recipe:** a deep-to-pale gradient, a sun glow (a white core,
  never a yellow-on-blue smudge, which reads grey), and cumulonimbus built
  from about 30 circles sorted top-first. Each circle is drawn twice, a
  shadow disc and then a lit disc offset up-left, and the stack is clipped
  flat at the base. Then aerial-perspective ridges, lighter and bluer
  farther away.
- **Map ground:** top-down under a side-view horizon, as in the app. Paddies
  are a jittered mosaic with a rice-tick pattern, and about 20% are flooded
  cells that hold the sky.
- **Level nodes** are stamp-rally waystones. A red 済 hanko stamps each one
  as Dodo passes. There is an episode pill and a stamp counter in the HUD.
- **Onomatopoeia** is set in Dela Gothic One with a thick stroke: ミーン
  (cicadas), カナカナ (evening cicadas), ドーン (fireworks), ザワ (wind),
  and ピョン / ポン / ドン popping up for hops, stamps and gates.

## Type

Dela Gothic One for logos, onomatopoeia and the next-episode title. Shippori
Mincho B1 (800) for episode titles and sheet headings. Zen Maru Gothic for
UI and body text.

## Prompts that keep work in this style

Paste one of these with the ask:

> Work in the Dodo anime style (docs/opus55/dodo-anime.md, code in
> public/dodo/anime.html). Reuse `dodoSVG` and its colour models; don't
> redraw the character. Cel-shade the character in three flat tones with
> indigo line art, and paint the background with layered gradients. Light
> comes from the upper left, shadows shift toward violet, and use the
> colour model for the scene's time of day. Act with the eyes, the sprout
> (ahoge) and manpu, not captions. Check every render in a screenshot
> before showing it.

For a **new scene:** name the time of day (pick the colour model), one
Japanese-countryside setting, one iconic prop per stop, the gadget Dodo
drifts in on, and the onomatopoeia for its ambient sound.

For a **new expression:** give the eye shape, pupil size and position, lid
line, beak state, sprout state and at most two manpu. Add it to `EXPR`, and
add a card to the model sheet.

## Stills and checks

- `node scripts/dodo-anime/shots.mjs <dir> [url] [w] [h]` walks the whole
  trail in a phone (or desktop) viewport, screenshots every stop and the
  sheet, and reports page errors.
- `node scripts/dodo-anime/stills.mjs <dir>` renders the app icon (1024,
  full bleed), the poster with and without type (2000×3000) and a
  transparent cutout, using the page's own drawing code
  (`anime.html#still`).
- `node scripts/dodo-anime/og.mjs` rebuilds `public/dodo/anime-og.png` from
  the hero.
- Things that broke once, so look for them: the three-quarter tail tuft
  painted over the belly (it has to go behind the body), set pieces clipped
  at the phone's left edge, and dense cedar trunks on wide screens reading
  as bars.
