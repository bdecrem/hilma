# Recipe: a little wind (paper stop-motion storybook)

`public/little-wind.html` is a cousin of `misc/2.mov`. Use this recipe to
make another piece in the same family: cut-paper characters on a painted
set, stepped stop-motion, a tiny story told in wide shots and close-ups,
gibberish voices and subtitles.

## The feel in one line

A children's-book illustration filmed a frame at a time on a warm old
projector. Soft painted paper, felt clouds, round-faced characters with big
glossy eyes, and one small problem solved by kindness and a bit of magic.

## Palette

A dusty storybook blue and a terracotta orange, on sand. Characters wear the
same two colours as the set.

| Token | Hex | Used for |
|---|---|---|
| sky0 → sky1 | `#5e8ec2` → `#a9c5dc` | painted sky gradient, top to horizon |
| sea0 / sea1 | `#3a6b9d` / `#6390bb` | sea band |
| sand / sand2 | `#ddb68e` / `#c99a72` | the dune (lighter at the crest) |
| orange / orange2 | `#d9714a` / `#b8552f` | beanie, kite, poppies, lighthouse stripes |
| claude / claude2 | `#d97757` / `#b95f40` | the critter's body and legs |
| blue / blue2 | `#3f6fa8` / `#2c5186` | sweater, sailor hat, whale fin |
| navy | `#23385c` | trousers, kite spars, birds |
| cream | `#f4ead8` | stripes, pompom, whale belly |
| peach / blush | `#f1c7a3` / `#e98a7e` | skin, cheeks |
| hair / ink | `#4a3024` / `#1d1a19` | hair, eyes and lines |

## The stop-motion system (the core of the look)

1. **Stepped time:** `FI = floor(t * 12)` and `tq = FI / 12`. Everything
   visual uses `tq`, including the camera, grain and flicker, and the page
   only redraws when `FI` changes. That makes it cheap and makes it read as
   hand-animated. Only the audio runs continuously.
2. **Boil:** each cut-out part gets a small random offset on every step
   (`boil(id) = (hash(FI, id) - .5) * 0.7`). Apply it at the part's
   `translate`, and use a different id per part so they shiver
   independently.
3. **Paper fills:** every character colour is a `createPattern` tile (base
   colour, fibres, per-pixel noise). Patterns follow the canvas transform,
   so the grain moves with the character and gets coarser in close-ups, like
   real paper under a lens.
4. **Paper shadows:** soft drop shadows on cut-outs only
   (`shadowColor rgba(50,30,20,.28)`, blur about 7, offset (2, 3)). Turn them
   off for details drawn on top (faces, stripes) or they smear.
5. **Camera:** each shot has a start and end `{x, y, z}` with a slow push,
   and shots cut hard. Layers use parallax: sky 0.3, sea and far 0.55,
   subject 1.0. A layer with depth `d` scales by `1 + (z - 1) * d` and shifts
   toward the camera centre by `d`, so the background stays large and soft in
   close-ups (a cheap depth of field).
6. **Film:**
   - a warm vignette with orange-burned top and bottom bands
   - a per-step brightness flicker of ±3%
   - moving grain
   - an occasional dust speck or hair
   - an iris in at the start and an iris out onto the hero at the end (an
     even-odd fill of a rect with a circle cut out; `moveTo` the circle's
     start, or a stray line appears)
7. **Foreground:** blurry poppies are drawn in screen space along the bottom
   edge, a different set per shot. The blur comes from drawing the sprite at
   22×60 px and scaling it up, because `ctx.filter` blur isn't reliable in
   Safari.

## The set (pre-rendered once, at up to 2.2× resolution)

- **Sky:** a gradient plus about 600 long horizontal brush strokes at very
  low alpha (0.015–0.06). Stronger strokes read as stripes.
- **Felt clouds:** 5 lobes filled with about 900 small translucent white
  dots, a blue-grey belly shadow and fibre ticks on the rim.
- **Far layer:** a headland with tiny houses, the sea with little cream wave
  marks, and a striped lighthouse on rocks. The equivalent in the reference
  is the blue house.
- **Dune:** a bezier hill with a gradient, ripple strokes, pebbles and noise.
- **Live parts:** 90 grass tufts and 13 seaside flowers, all swaying with
  `wind(t)`. Tufts are sorted by y and split so the ones in front draw over
  the characters.

## Characters (vector, drawn every step)

- **The kid:**
  - Build: sits with knees up. Big round head (radius about 38) on a small
    body, making it about 3.5 heads tall.
  - Outfit: orange knit beanie (ribs, cream band, pompom that bobs in wind),
    brown bob with a fringe, blue-and-cream striped sweater, navy trousers,
    orange boots. Holds a wooden spool.
  - Face: 3/4 view, with the features shifted right. Eyes are a white oval,
    a blue iris that moves with `look`, a pupil and a highlight, plus lashes.
  - Expressions (from `kidFace(t)`): brows sad/neutral/up. Mouth sad, flat,
    o, O, smile or laugh (with tongue). Eyes open, wide, happy (^ ^) or
    blink.
- **The Claude critter:**
  - Build: a terracotta rounded box, two side nubs, four little legs and
    two black oval eyes with highlights, no mouth. It gets a mouth only to
    blow and to shout "whee".
  - The swappable signature: a hat. The reference used a watering can; this
    piece uses a blue paper sailor hat. Pick a new one per cousin.
  - Moves:
    - talk: bounce per syllable
    - puff: scale ×1.2 with `> <` squeezed eyes
    - blow: snap back
    - happy: `^ ^`
    - hop
    - dangle: one arm up holding the string, swinging, legs kicking
- **Supporting cast:**
  - the kite: quartered orange and cream with navy spars
  - its tail: a travelling sine wave, with bows that pop in one by one as it
    unfurls
  - paper birds with two-frame wing flaps
  - the whale: an animated tail, a grooved cream belly, spots, a smile, and a
    spout of sparkles

## Story beats (16 s loop, four shots)

| Shot | Time | Beat |
|---|---|---|
| Wide | 0–4 | Iris in. The kid is sad, and the kite lies flat on the sand. A tug makes it hop and flop (thud). Subtitles: "There's no wind today." / "Then let's make some." |
| Close | 4–6.6 | The critter inhales and puffs up, then blows a visible gust (cream curly strokes across the kite). The kid's mouth goes "O" and the kite tumbles up out of frame. |
| Wide | 6.6–11.6 | The sky wakes up. The tail unfurls bow by bow, wind curls cross the sky, a flock joins the kite, and the whale swims in from the right, spouts, and two birds land on it. The critter hops and grabs the string. |
| Close | 11.6–16 | The critter dangles from the string and the kid giggles ("Hold on!"). An orange bird crosses. Iris out on the critter's face, then black, then the loop. |

This is the same shape as 2.mov:
1. A problem, said out loud.
2. A friend offers help.
3. A close-up of the help happening.
4. A wide shot where the world blooms and a surprise animal arrives.
5. A close-up of joy.

## Sound (all synthesised)

- **Voices (the signature):**
  - Source and filters: a sawtooth with vibrato, through three bandpass
    formants set per vowel (a e i o u m). Formants are scaled ×1.18 for the
    kid and ×1.34 for the critter.
  - Pitch and texture: pitch glides within each syllable, a noise tick
    marks each consonant, and breath noise is added for gasps and giggles.
  - The script: every line is a syllable table in `LINES`, and the same
    table drives the lip-flap (`mouthOpen(who, t)`). The kid's first line
    falls in pitch (sad); the critter's answer rises (bouncy).
- **Ambience:**
  - surf swells (brown noise through a moving lowpass, plus a fizz as each
    wave breaks)
  - gulls (a formant sawtooth glide)
  - projector hiss and crackle
- **Effects:** an inhale (rising noise), a whoosh (falling bandpass, panned
  across), paper flutter (noise gated at 14–22 Hz), a thud.
- **Music:**
  - The flat opening gets only a small ukulele-ish shrug.
  - When the magic starts, a G-major pad (with a sine an octave below the
    root for warmth) and an 18-note FM chime cascade, timed to the bows
    appearing.
  - A whale song (a triangle glide through a bandpass, heavy reverb) and
    bird chirps (fast sine sweeps near 3.3 kHz).
  - A little pluck tune under the giggles, and a three-note chord on the
    iris.
- **Master:** a high shelf of −7 dB at 3.2 kHz, a +1 dB low shelf, then a
  compressor (−20 dB, 5:1). Without the shelf the voices and chirps made the
  mix 7 dB too bright. The final mix is within about 2 dB of the reference
  in every band up to 8 kHz. The top band (8–16 kHz) stays about 5 dB below
  the reference, which I left: that region is the reference's clipped
  screen-recording hiss.

## Pitfalls hit

- Soft-focus foreground sprites placed in world space end up standing
  mid-scene in wide shots. Put them in screen space, per shot.
- Place the gust from the blower's mouth toward the kite, not at the
  listener's face height.
- Whatever gets lifted by the string must grab it far enough along (46%) to
  clear the other character's head in the close-up.
- 2.mov is a rotated phone recording (1260×2736 with a rotation tag). ffmpeg
  applies the rotation, so crop in landscape coordinates. The capture also
  started mid-loop: the first second was the ending.
