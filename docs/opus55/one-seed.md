# Recipe: one seed (picture book ↔ field instrument)

`public/one-seed.html` is a cousin of `misc/5.MP4` ("one drop"). Use this
recipe to make another piece in the same family: one small thing's whole
cycle told in hard cuts that alternate between a storybook illustration and
a dark scientific-instrument diagram of the same moment. It's portrait and
it loops.

## The feel in one line

A nature picture book and a lab notebook, cut together shot by shot. The
picture tells you what happens; the diagram shows you how it works, and the
cut between them is the thrill.

## Structure: two modes, one moment each

- 12 shots of 2.6 s each, so a 31.2 s loop. Even-numbered shots are
  illustrations and odd-numbered shots are diagrams. Each diagram explains
  the illustration just before it.
- **Hard cuts only.** Every shot gets the same slow push-in (3.5%), which
  keeps the cuts from feeling like slides.
- The last diagram names the piece ("one seed") and the loop restarts on
  the first illustration. The story is a cycle (clock → seed → flight →
  soil → root → leaves → flower → clock), so the loop is honest.
- The reference's cycle is rain → pond → roots → leaf → cloud → lightning →
  river → sea → sun → cloud → drop. To pick a subject for a cousin, find
  something whose cycle returns to where it started. Some options: a
  salmon, a grain of sand (rock cycle), a feather's moult, a honeybee's
  nectar, a snowflake, a spark and its ash.

## Illustration mode (the picture book)

| Token | Hex | Used for |
|---|---|---|
| cream / mint | `#efe2c2` / `#d2e1d0` | the default diagonal stripes (−30°, 72 px bands every 150 px) |
| warm stripes | `#f3e3bd` / `#f5d990` | the flower shot |
| dusk stripes | `#3f4b7c` / `#4c5a8e` | night; crossfaded in over the warm stripes |
| ink | `#26282b` | every outline, 1.5–2.2 px |
| green / green2 / greenL | `#6c9b50` / `#4c7b3a` / `#a5c886` | leaves, stems |
| yellow / yellow2 | `#f2c23a` / `#dd961d` | florets, sun, bee |
| soil / soil2 | `#b8976d` / `#8d6c4b` | cross-sections |
| guide | `#4a78b8` | measuring overlay drawn on the pictures |

- **Striped paper:** diagonal two-tone stripes with grain and sparse specks
  are the reference's signature background. Swap the stripe pair per mood
  (day, warm, dusk).
- **Bold ink outlines, flat fills, hatched shading:** a `hatch(path, angle,
  gap)` helper clips to the shape and rules parallel lines at 20–35%
  alpha.
- **The measuring overlay:** faint blue guide rings around the subject, a
  dashed vertical, a side ruler with an orange bracket, and dashed arrows.
  This is what ties the picture book to the instrument; keep it faint,
  around 30% alpha.
- **Special views:**
  - A top-down map with jittered-grid fields, each hatched at its own
    angle, plus tree clumps (circles with a shadow, an outline and a
    highlight), a river and a lane. It's pre-rendered taller than the
    screen and scrolls.
  - Cross-sections: sky over soil strata, with pebbles, roots and a worm.

## Diagram mode (the field instrument)

| Token | Hex | Used for |
|---|---|---|
| navy0 → navy1 | `#16204a` → `#0b1029` | a radial gradient background |
| line | `#dfe7f5` | all linework at 35–90% alpha, 0.7–1.5 px |
| pink | `#e8457f` | the one thing you should look at: rings, the golden angle, the split in the seed coat |
| cyan | `#8fd0e8` | glows (vortex ring, radicle, the moving dot) and the second data series |
| amber | `#e6b450` | heat or sun (the thermal column) |

- A 25 px grid (with every fourth line stronger), faint big construction
  circles, and noise.
- **Everything draws itself on:** `drawOn(p, fn)` uses `setLineDash([p *
  3000, 99999])`. Stagger the parts: first the outline, then the details,
  then the annotations, and the pink ring last.
- **The kit, reused in every diagram:**
  - `inset(x, y, r, p, content, leader)`: a circular magnifier with tick
    rings and a leader line to the point it explains
  - `ruler`
  - `dimension` (end ticks and a label)
  - `pinkRing`
  - `label`, in small monospace at 55% alpha
  - `dial(t)`: the rotating instrument icon in the top-right corner, in
    every diagram shot. It's the reference's signature; keep it.
- **Real science beats generic decoration:** the separated vortex ring
  above a dandelion's pappus, a thermal lifting the seed, water molecules
  drawn as H₂O glyphs, the radicle, the 137.5° golden angle, and the 21/34
  parastichy spirals of the florets. Each diagram teaches one true thing.

## Sound (all synthesised)

The shape follows the reference.
- **The opening:** quiet, just a breath of wind, bells and a "pip" as the
  seed lets go.
- **The drone arrives** as the story starts moving (shot 3). It's
  sawtooth chords through a slow lowpass plus a sine sub, and it changes
  chord at story turns: A, then F#m for the rain, D for the sprout, E for
  the flower, F#m for dusk.
- **Diagram shots** get tiny instrument ticks as lines draw on (square
  waves at 4–6.5 kHz, 18 ms), plus a bell when the pink ring lands.
- **Event sounds:**
  - rain: noise plus about 22 drop bloops per second
  - thunder: a noise rumble plus a sine drop
  - germination: a low bloom plus a rising run as the root grows
  - the leaf spiral: one note per leaf, stepping round the pentatonic by
    the golden angle, panned by its angle
  - the bee: a buzzing sawtooth that pans in
  - the florets: a rising shimmer
  - dusk: crickets
  - the ending: a single bell on "one seed", then a rising bloop as it
    lifts off
- **Mix:** within about 1.5 dB of the reference from 20 Hz to 2.5 kHz, and
  about 2 dB hot from 2.5 to 8 kHz. The master has a high shelf of −7.5 dB
  at 3.2 kHz. The sub is only a few percent of the drone's level; my first
  pass put the low band 4.5 dB over and the mids 10–12 dB under.

## Pitfalls hit

- **The seed head read grey,** because ink edges under the white filaments
  dominate at this size. Use a light ink edge (38% alpha) with brighter
  white filaments, and put a soft cream halo behind the head.
- **Thirteen toothed leaf outlines overlapping** in a diagram turn into
  noise. Use smooth leaf curves in diagrams, and draw older leaves fainter.
  Keep the teeth for the illustrations.
- **Crickets built by modulating a gain parameter with an oscillator** left
  a steady 4.4 kHz whistle for seconds. Gate a plain sine with scheduled
  gain steps instead. The fastest way to find a sound like this is to stub
  one `SND.*` voice at a time in an offline render and measure the energy
  at that frequency (as in the session's `dbg` snippet: Goertzel on a
  window of the offline buffer).
- **An FM bell with a 3.5 ratio** puts a sideband at |f − 3.5f|. On A6 that
  is exactly 4.4 kHz. That's fine, but know it's there when reading the
  spectrogram.
- **In a fresh browser, the first screenshot can come out blank.**
  `scripts/opus55/stills.mjs` now does a warm-up load first.
