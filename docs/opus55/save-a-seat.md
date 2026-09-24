# Recipe: save a seat (torn-paper collage essay)

`public/save-a-seat.html` is a cousin of `misc/4.MP4` ("what is the purpose
of life?"). Use this recipe to make another piece in the same family: a big
question asked in ransom-note letters, a small paper character trying one
answer per chapter, each chapter deflating, and a warm, surprising answer at
the end. Landscape, 16:9.

## The feel in one line

A school-project collage that turns out to be wise. Torn construction
paper, masking tape, a stick-limbed little person, a bouncy uke band that
stops dead every time an answer falls flat.

## Structure: ask, try, deflate, and the real answer

| Part | What happens |
|---|---|
| Title (4.8 s) | Ransom-note letters fly in from above and snap into place ("WHAT MAKES A" / a huge "HOME"), then a handwritten "anyway?" with a red underline. A "?" tile bonks the character. |
| 3 chapters (7.2 s each) | Each is a new colour sheet. A taped caption types "Maybe it's X?", the character tries X with growing delight, the joke turns, the caption fades to a ghost, and "...but Y" replaces it. The band drops out on that line. |
| Finale (14.4 s) | The answer isn't another thing to have; it's the other characters. The band comes back one instrument per arriving friend. It ends on a two-line taped caption and the title's letters landing as a sign. |

- **Chapters:** a BIG house (it echoes), the perfect VIEW (postcards slap
  in until he yawns), being SAFE (he boards himself into a padlocked box
  and it rains). Pick three answers that are each funny to *build* on
  screen. The deflation line should be under six words.
- **Every sheet change is a torn-paper wipe:** the next sheet slides in
  from the right with a torn left edge, a white fibre line and a shadow,
  plus a rip sound.
- **The loop:** the finale's sheet is torn away by the title sheet, so the
  question comes back right after its answer.

## Look

- **Paper sheets:** flat colour, soft blotches, fibres, noise and a
  vignette, each chapter on its own colour. Sky `#b5d5e5`, mint `#c3dfc9`,
  ochre `#ecd290`, navy `#27315b` (with stars), dusk `#eab39c` darkening to
  plum `#40355f`. Backgrounds are screen-fixed, so a zooming camera never
  shows their edge.
- **Torn paper everything:** every shape is a polygon whose edges are
  subdivided and jittered. It sits on a slightly bigger off-white copy (the
  torn fibre edge) and casts a flat offset shadow. The jitter "boils" at
  8 fps. Helpers: `torn`, `paper`, `rectPts`, `ellPts`, `rrPts`.
- **Ground:** one torn strip with a white fibre top. Grass green by day,
  tan on the stage-like sheets, dark green at night.
- **Type:**
  - **Bowlby One** for the ransom tiles: each letter on its own torn
    square from a fixed palette (pink, teal, blue, orange, red, cream,
    black), tilted a little.
  - **Caveat Brush** for handwriting: captions, "anyway?", the echo.
- **Captions:** a cream torn strip with two masking-tape pieces at the top
  corners. The text types in; the strip pops in at 112%. A caption that
  deflates fades to 30% before its replacement arrives.
- **Cast:**
  - **Pip:** a cream torn circle head with dot eyes and pink cheeks, a red
    torn rounded body, black stick limbs. Arm poses: down, up, wave, shrug,
    hold, pat, hug. Mouths: smile, o, flat, sad, grin, yawn. Eyes: dot,
    happy, closed, wide, sad.
  - **Friends:** round colour blobs with the face on the body (the
    reference's audience), stick limbs, each with an umbrella in a
    contrasting colour.
- **Camera:** still for the title. Slow 3% pushes in the chapters. A push
  in on the fort as it gets lonely (to 1.65×). The finale holds close on
  the bench (1.5×) and pulls back for the last line.
- **Light:** the finale's fairy lights are the only additive glow in the
  piece. Hold it back until then.

## Sound (all synthesised)

- **Band:** F major at 100 BPM. Pizzicato bass on beats 1 and 3 with an
  octave bounce, uke strums on 2 and 4 with an up-strum on the "and", a
  soft kick, glockenspiel runs.
- **Chords:** F C | F Bb C | Dm Bb C | Dm Am Bb | Bb F Dm Bb C F. The
  "safe" chapter goes minor and half-time.
- **Deflations:** at each "...but" the band stops (`DUCK` ranges), a slide
  whistle falls, and one low pluck plays alone. That silence is the joke.
- **Finale layering:** rain and a lonely music box, then bass joins with
  the first friend, strum with the second, the kick with the third, and the
  little one's whistled tune. Glock comes back when the lights turn on.
- **Sound effects, one per visual event:**
  - letter pops, rising in pitch
  - pen ticks per typed caption character, a tape slap per caption
  - brick knocks, a roof slap, window chimes
  - a "hello?" whistle through a feedback delay (the echo)
  - card slaps, a delighted slide up, a bored slide down
  - plank slams, padlock clicks, rain with drips, a creak
  - footsteps and a boing as each friend sits
  - a scoot slide and seat pats
  - rising chimes, one per fairy light
- **Mix:** the reference is warm and loud. The master has a −8 dB high
  shelf at 2.6 kHz, a gentle low shelf, and a compressor (−22 dB, 6:1)
  followed by makeup gain. Every band ends up within about 2.5 dB of the
  reference with no clipping. The first pass had the low-mids 6 dB under;
  the fix was a louder, darker uke strum and a pizzicato with a second
  harmonic.

## Pitfalls hit

- **Stars drawn as tall diamonds** read as rain streaks at phone size.
  Draw stars as dots.
- **At full frame the characters are too small** for the emotional
  finale. A camera is cheap: it holds close on the bench. Draw captions
  after restoring the camera transform so they stay put.
- **The falling HOME tiles pass behind the captions** during the last
  pull-out. Take the OG frame after they land (40.6 s).
- **A caption's exit time depends on which caption replaces it:** a
  ghosted caption leaves when the next one arrives, and stacked
  finale captions stay.
