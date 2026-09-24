# Recipe: Opus on Low (the arcade flipbook)

`public/opus-low/index.html` is an 8-page flipbook, "A Day in the Life of
Opus 5.5 on Low Effort", restyled as an arcade cabinet. Use this recipe for
another short flipbook in the same voice and look: a day in the life of
some model, feature or character, told as levels.

## The feel in one line

An arcade attract screen: neon on violet-black, a marquee blinking "INSERT
COIN", every page a level, and the jokes deadpan and short.

## Structure

- **8 pages:** a title "cover", then six timestamped levels (06:00 → 23:00),
  then GAME OVER (GOOD NIGHT). Each page has a HUD (time on the left, a
  score on the right that goes up by 1250 per page), a title, a pixel
  sprite and one line of caption.
- **The voice is the joke.** Low effort is played straight: "EFFORT SET TO
  LOW. DID NOT THINK ABOUT GETTING UP. GOT UP." Game words give the
  structure (BOSS, K.O. +100, POWER-UP, HARD MODE, BONUS!, CONTINUE? Y).
  Each caption ends on one highlighted phrase in yellow.
- A page is a data object, `{ lvl, title, art: sprite([...]), text }`, so
  a new book means editing the array only.

## Look

| Token | Hex | Used for |
|---|---|---|
| bg | `#140a24` | cabinet black-violet |
| page | `#1e1238` | the page face |
| pink | `#ff3fa4` | titles, buttons, the outer frame ring |
| cyan | `#2ef2ff` | page border, title shadow, nav |
| yellow | `#ffe23f` | marquee, the cover title, caption highlights |
| green | `#5dff6a` | HUD |

- **Type:** Press Start 2P for HUD, titles and buttons. VT323 for the
  captions, set big (21 px) and tight (line-height 1.05).
- **Sprites:** strings of palette letters (`.` empty, `k p c y g w o u`)
  rendered as 1×1 `<rect>`s in an SVG with `shape-rendering: crispEdges`.
  They are 16 wide and 10–14 tall. The character is an orange blob with
  two-pixel eyes. The sprites bob 4 px in `steps(2)`.
- **Cabinet dressing:**
  - a grid-line background in cyan and pink at 8%, with a purple floor
    glow
  - scanlines as a multiply overlay
  - a rare flicker frame
  - a triple neon frame on the page: cyan border, bg gap, pink ring, pink
    glow
  - the back of each leaf in a pink checkerboard

## Motion and sound

- Leaves turn in 3D around the left edge with `transition: transform .8s
  steps(12)`. The stepped easing makes the flip itself look pixelated.
- Controls: tap the right or left half of the book, swipe, or use the arrow
  keys. The buttons press down 4 px, into their own shadow.
- Sound: a Web Audio square-wave blip per flip, rising an octave over
  80 ms. Forward is 440 Hz and back is 330 Hz.

## Prompt

> Make an arcade flipbook in the Opus on Low style (docs/opus55/opus-low.md,
> copy public/opus-low/index.html). Subject: <a day in the life of X>.
> Write 8 pages: a cover, six timestamped levels and a GAME OVER page. Each
> caption is one deadpan line in game terms, ending on a yellow highlight.
> Draw each page's art as a 16-wide palette-letter sprite. Keep the palette,
> the fonts, the stepped flip and the square-wave blip.

**Check:** `scripts/opus-low-shot.mjs` screenshots the cover (it is the OG
card at 1200×630) and page 2 at phone size.
