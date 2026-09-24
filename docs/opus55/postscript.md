# Recipe: p.s. (riso-print typographic short)

`public/postscript.html` is a cousin of `misc/1.MP4`. Use this recipe to
make another piece in the same family: flat two-ink print, words as the
material, one small hero shape, a day/night turn and a loop.

## The feel in one line

A risograph zine that comes alive. Cream paper, one dark ink, one hot orange,
grain everywhere. Words are the building material. The emotional turn is
from a noisy pile of chores to the one human sentence hidden inside it.

## Palette

Two inks on paper, as in real riso. Pick one cool ink and one warm accent,
and never add a third hue.

| Token | Hex | Used for |
|---|---|---|
| paper | `#ebe1c9` | day background (with a lighter centre and darker edges) |
| ink | `#2c5a4d` | strips, lantern outline (riso "hunter green"; 1.MP4 used federal blue) |
| inkDark | `#1d3d35` | halftone shadow dots |
| night | `#21403a` | night background base |
| orange | `#e2582f` | the hero spark, circles, caps, accents |
| orange2 | `#a93d1f` | misregistered second pass on orange strokes |
| cream | `#f0e7d1` | text on ink, night text, constellation lines |
| glow | `#ffe3a0` | light (fireflies, lantern), the only non-print colour |
| dark | `#2a2620` | crop marks, the fourth swatch |

A cousin can swap the cool ink (blue, green, teal, purple). Keep the orange
and the cream.

## Type

- **IBM Plex Mono 500/600** for everything printed. Monospace is what lets
  words tile into shapes on a grid.
- **Caveat 600** for the one handwritten label on the container ("p.s.").
- Both come from Google Fonts. Await `document.fonts.load(...)` before
  measuring any text; strip widths depend on it.

## Print texture: what makes it look riso

Everything below is built once into canvases at device resolution, and
rebuilt on resize.

1. **Paper:** base colour, a radial light (lighter upper-centre, darker
   edges), about 900 faint fibre curves, per-pixel noise of ±7, and sparse
   dark specks.
2. **Ink layer:** every printed thing is drawn on a separate `ink` canvas.
   Before compositing, a speckle mask is punched through it
   (`destination-out` at 0.55 alpha: random pixels plus a few blotches). This
   one step is most of the riso look, and it applies to text too.
3. **Halftone shadows:** strips and the lantern cast offset shadows filled
   with a 5-unit dot pattern (`createPattern`) in `inkDark`, never soft
   shadows.
4. **Misregistration:** orange strokes get a second, offset pass in `orange2`
   at about 45% alpha. Constellation lines get a cream line plus an orange one
   offset by (1.8, 1.8).
5. **Night texture:** mottled green made of about 70 soft radial blobs (light
   and dark), per-pixel noise, white dust (3% of pixels brightened), and a
   halftone band whose dots grow toward the bottom edge.
6. **Grain:** a 256 px noise tile, filled over everything each frame at a
   random offset.
7. **Frame furniture:** L-shaped crop marks in the corners and a four-square
   colour key at bottom right. These small print-shop details sell the
   object.

## Layer order, every frame

paper → night (clipped above the torn edge) → torn-edge fibre line → **ink
layer** (lantern, strips, flying pills, night pictures, constellation, spark,
pencil spark) → speckle punch → glows (`lighter`: lantern, lit windows,
dissolve sparks, fireflies) → crop marks and swatches → grain.

## Cast

- **Hero:** an orange asterisk with 11 rounded rays of slightly irregular
  length. It rotates slowly and pulses on every beat. Its 11 rays are also
  the 11 constellation lines, so the spark literally opens into the ending.
- **Pencil:** a small 8-ray spark that leaves the hero, scribbles an ellipse
  of 1.14 turns (drawn progressively, wobbly radius) around the human line,
  and flies home.
- **Container:** a lantern (handle, orange striped cap, chimney, glass with
  frame bars, a label reading "p.s."). It holds a pile of little dashed ink
  strips, and glows at night.
- **Material:** 62 chore strips, commit messages of 11–23 px on jagged
  rectangles, which fly in from outside toward the spark. There are three
  hero strips with a second, human line.

## Story beats (30 s loop, 12 bars of 2.5 s)

| Time | Beat |
|---|---|
| 0–7.5 | Strips flood in. Three times, the pencil circles the human line ("for dad's shop.") and the circled oval ("pill") is cut out and arcs into the lantern with a *tink*. |
| 7.5–8.5 | Every other strip is sucked into the lantern. |
| 8.6–9.6 | A torn-paper wipe brings night down from the top. The spark shrinks onto the lantern. |
| 10–17.8 | Three pictures, about 2.6 s each. The pill floats out to a caption spot at bottom left, the phrase fills a shape row by row, an orange outline draws itself on, one detail animates, and the shape dissolves into sparks and fireflies. |
| 17.6–19.6 | The fireflies swirl home and the lantern brightens. |
| 20.3–25 | Constellation: the spark's rays extend into lines, each ending in a "+" and a typed label (11 human asides). |
| 24.9–26.2 | The torn edge rolls back up and the rays fold back into the asterisk. |
| 26.8–30 | A new strip arrives and its human line gets circled, landing just as the loop restarts. |

**Picture techniques:**
- **Text-filled shape:** a `Path2D`, a monospace grid, and `isPointInPath`
  on each cell. Keep only the chars inside, and cut out holes such as doors
  and windows. Reveal in reading order.
- **Outline draw-on:** `setLineDash([p * 2400, 99999])`.
- **Text on a path:** sample the path with arc length, then place and rotate
  each char at spacing `s - i * advance` (the plane).
- **One moving part per picture:** a swinging sign, a wagging tail and
  blinking eye, the plane's flight.

## Sound (Web Audio, all synthesised)

- **Grid:** 96 BPM, 2.5 s bars, D major pentatonic.
- **Chords:** D A Bm G | G D Em Bm | G A D Dadd9. The ending chord leads back
  into the opening one.
- **Voices:**
  - Pad: detuned triangle and sine through a lowpass, slow attack.
  - Bass: sine plus a quiet octave. At night it pulses on quarter notes.
  - Lead: a music-box pluck. FM sine, modulator ratio 2, index decaying over
    0.22 s, plus a quiet tine at ×4.2.
  - Arps: a seeded random walk on the pentatonic, with chord tones on strong
    steps. Density follows the story (busy flood, sparse night).
- **Sync:** every visual event has a sound.
  - Strip landings: paper ticks.
  - The pencil: a bandpassed noise scratch whose pitch follows the ellipse.
  - Cut-outs: a whoosh.
  - Landing in the lantern: a tink.
  - The two wipes: a torn-paper rip (gated noise crackle).
  - Night: a sub boom.
  - Rows filling: a rising run.
  - The plane: its height sung as pitch.
  - The constellation: one note per ray, rising as the rays extend and
    falling as they fold back.
- **Mix target:** the reference's band balance, with bells about 1 dB above
  the low end. My first pass buried the plucks under the pad. The fix was to
  quiet the pad, lift the plucks and trim the bass until every band was
  within about 1 dB (`scripts/opus55/audio-report.py`).

## Pitfalls hit

- Hero strips must be the same objects that the pill and pencil code read
  from, not copies (`Object.assign`), or measured widths go missing.
- A pill lifting upward over its own strip garbled line 0; lift it downward.
- Fireflies left over from earlier pictures cluttered later ones. Keep about
  7% of letters as persistent fireflies and send them up toward the top band.
- Flood strips must keep clear of the hero strips (their full width plus
  margin) or they cover the line being circled.
