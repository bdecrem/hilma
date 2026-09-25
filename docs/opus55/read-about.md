# Recipe: Places I've only read about (a flip-through marker sketchbook)

`public/read-about.html` is a sketchbook you turn by hand. It holds eight
two-page spreads of places Opus 5.5 has only read about: tide pools, a
library after closing, the aurora, a kitchen at six, a lighthouse in fog,
rain on a café window, an octopus in the kelp and a night train over a
viaduct. Each one is drawn from a description, and the sentence it came
from is clipped to the corner. The reference is `misc/typingmind.txt`
(Ann Nguyen's New Zealand sketchbook for TypingMind): the same format and
page-turn mechanics, with Opus's own subject, drawings and code. There's
no sponsor lockup.

## The feel in one line

A real little book on a table: the corner lifts under your finger, the
page casts a shadow as it folds, the cover is a stiff board that swings,
and every spread is a bright acrylic-marker painting with paper all round it.

## How it works

- **One HTML file, canvas only, no assets.** Each spread is painted once
  into a 2000 × 1200 drawing space (two 1000 × 1200 pages), cut into L and R
  page canvases, and cached. They're built nearest first, and far ones wait
  until the paper is still. Resolution follows the page width × DPR (capped
  at 2), and the pages rebuild on resize.
- **Marker look (`painter`)**: flat opaque fills, then 5–16 px strokes
  in lighter and darker tints of the same colour, clipped inside the shape,
  so the stroke direction shows. There are also tapered strokes, wisps (for
  clouds, fog and steam), jittered blobs and radial glows for lamps. The
  painting sits in a window with a wobbly edge (`sceneWindow`), leaving a
  paper margin. Paper = cream base + soft blotches + fibres + a speckle
  grain tile. There's gutter shading and rounded outer corners.
- **Covers are coloured pencil on cloth:** a terracotta board with a
  crosshatch weave, a black elastic band, a cream label, and stars hatched
  in two directions (`pencil`). The endpapers are blue with hand-drawn
  books and stars.
- **Flip engine:** a straight fold, which is the perpendicular bisector
  between where the paper was grabbed and where the finger is now. The
  corner is limited to what paper allows (it stays within reach of both
  spine ends). The back of the page is drawn through one affine map
  (screen → page → mirror → fold reflection → screen). There's a shadow
  under the flap, curl shading on it, and a drop shadow around it. Covers
  are hard boards drawn in 128 perspective strips. A tap turns the page, a
  drag follows the finger, and a flick completes the turn by velocity.
  Arrow, Page, Home and End keys work too. `?page=n` opens at spread n.
- **A running thread:** a paper plane folded from a page of notes, with a
  bookworm in round glasses on board. It sits further along each spread,
  with a dashed trail behind it.
- **Sound:** each turn is a band-passed noise sweep (2.6 kHz → 700 Hz,
  0.4 s). A board turn adds a low knock. A toggle is remembered per browser.
- **Type:** Fraunces for the title, the captions and the covers, and Caveat
  for anything handwritten (the notes, the page labels, the slip).

## Prompt

> Make another flip-through sketchbook from docs/opus55/read-about.md
> (copy public/read-about.html). Subject: <a theme with 6–10 places or
> moments>. For each spread, write a `draw(g, r)` in the 2000 × 1200 space
> using the painter: big flat fields first, then mid shapes, then small
> characterful details (a crab in charge, a cat on the table, a pencil in
> an arm). Keep key things away from the gutter at x = 1000. Give each
> spread a caption and a one-line note. Replace the covers' title and the
> running motif.

**Check:** serve `public/` on :8765, then run
`node scripts/opus55/read-about-shots.mjs <dir> [--og]`. It shoots every
spread, a mid-turn frame, a cover mid-swing, a half-dragged corner and three
phone views, and fails on page errors. `--og` rewrites
`public/read-about-og.png`.
