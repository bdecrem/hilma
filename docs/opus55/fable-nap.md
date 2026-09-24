# Recipe: Fable Naptime (ink line art with watercolour)

`public/fable-nap/index.html` is a short animated drawing: "Fable 5.5, on
low, getting ready for a nap". A hanging moon, a stretching and yawning
wisp, a bed that breathes, and z's drifting up. The first version was pixel
art and it was redrawn in ink. Use this recipe for another quiet little
drawing that draws itself.

## The feel in one line

Someone sketching a bedtime picture in front of you: the pen lines appear
in order, the watercolour blooms in afterwards, and then it breathes.

## How it works

- **One SVG, a 400×300 viewBox,** on a warm paper radial
  (`#fbf5e8 → #f4ecdc → #e9dcc4`).
- **Ink that draws itself:** every line is a `path.ink` with
  `pathLength="1"`, `stroke-dasharray: 1` and `stroke-dashoffset: 1`,
  animated to 0. Each path sets `--t` (start) and `--d` (duration), so the
  drawing order is the storyboard: moon string → moon → stars → the wisp
  stretching → face → bed → blanket → the wisp asleep on the pillow. The
  easing is `cubic-bezier(.6,0,.3,1)`, like a pen that speeds up
  mid-stroke. The line is 1.6 wide in `#2b2320`, round caps.
- **Watercolour washes:** ellipses or paths in soft pigments (moon ochre
  `#f2c97a`, blanket blue `#9fb8d6`, cheek rose `#e8a38c`) at about 50%
  opacity, pushed through one filter: `feTurbulence` (baseFrequency .04,
  3 octaves) into `feDisplacementMap` (scale 9). That wobbles the edges
  like wet paint. They fade in after the ink they sit under.
- **A scene change without a cut:** the awake wisp's group fades and drops
  40 px at 9.8 s, and the sleeping wisp draws itself on the pillow at
  10.5 s.
- **Then it lives:** the bed breathes (scaleY 1.035 over 4.5 s), the moon
  sways 3°, and three z's loop up and away at staggered delays.
- **Captions** in Caveat, in a warm red (`#b4543a`), timed to the drawing:
  "first, a moon." → "a small stretch…" → "a yawn, low effort." → "one
  blanket, no planning." → "and down." → "z z z". An "again" link appears
  at 16 s and reloads the page.
- **Title** in Fraunces italic.

## Prompt

> Make a self-drawing ink sketch in the Fable Naptime style
> (docs/opus55/fable-nap.md, copy public/fable-nap/index.html). Subject:
> <one small character doing one small thing>. The storyboard is the
> drawing order: set each path's --t and --d so the lines appear the way a
> hand would draw them. Add two or three watercolour washes through the
> turbulence filter after the ink, one quiet change of state, and a
> breathing loop at the end. Write captions in Caveat, one per beat, dry and
> gentle.

**Check:** `scripts/fable-nap-shot.mjs` takes the OG card once the drawing
has finished.
