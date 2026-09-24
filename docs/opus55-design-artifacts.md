# Opus 5.5 design artifacts

A set of animated web pieces made by Opus 5.5, each one a "cousin" of a
reference video: the same recipe (visual style, energy, animation system,
sound), with different content and art. Every piece is a single
self-contained HTML file, drawn on canvas and scored with the Web Audio API.
It uses no image or audio assets.

For each new piece, add a row to the table, a section below it, and a recipe
in `docs/opus55/`.

| # | Piece | Live | File | Recipe | Reference | Made |
|---|-------|------|------|--------|-----------|------|
| 1 | **p.s.** | [/postscript.html](https://hilma-nine.vercel.app/postscript.html) | `public/postscript.html` (+ `-og.png`) | [recipe](opus55/postscript.md) | `misc/1.MP4` ("small print") | 2026-09-23 |
| 2 | **a little wind** | [/little-wind.html](https://hilma-nine.vercel.app/little-wind.html) | `public/little-wind.html` (+ `-og.png`) | [recipe](opus55/little-wind.md) | `misc/2.mov` (Claude mascot stop motion) | 2026-09-23 |

## How to make the next one

1. **Study the reference:**
   `scripts/opus55/reference.sh misc/N.mov <scratch-dir> [crop]`. It
   extracts a contact sheet, one full frame per second, the audio, a
   spectrogram and an audio report (band balance, notes). Phone screen
   recordings need a crop to the picture area. Look at the frames at full
   size: the contact sheet alone is too small to read the style.
2. **Write down the recipe before building:** palette, texture tricks,
   animation system, cast, story beats with times, and sound palette. Then
   decide what changes for the cousin: new setting, new story, new props and
   a new "surprise animal" moment, while keeping the recipe. The existing
   recipes in `docs/opus55/` show the level of detail to aim for.
3. **Build on the shared engine**, which both pieces use (copy its skeleton
   from either file):
   - One self-contained `public/<name>.html` with a fixed logical canvas
     (1000² or 1200×800), DPR capped at 2, and textures built once and
     rebuilt on resize.
   - Seeded `rng()` and `hash()`, so every frame and every loop is
     identical.
   - **Everything is a pure function of `t`**, so any frame can be rendered
     on demand. `render(t)` draws the whole frame. The page reads `t` from
     the audio clock
     (`AC.currentTime - outputLatency - startAt`), so picture and sound
     can't drift apart.
   - **Score:** `buildScore()` returns a sorted event list,
     `{ t, fn(A) }`, where each `fn` schedules its sound at `t + A.o`. A
     look-ahead scheduler runs every 40 ms over a 350 ms window and loops.
     Build the sound events from the same data as the visuals (syllable
     tables, arrival times, flight paths) so they stay in sync.
   - **Hooks:**
     - `?t=<s>` renders a still frame with no audio.
     - `window.renderOffline(seconds)` returns the score as a base64 WAV.
     - `window.__ready` is set once the page has booted.
   - A "tap to play · sound on" cover, since audio needs a user gesture. Tap
     or space pauses.
   - An OG card (`public/<name>-og.png`, 1200×630) cut from a strong frame.
4. **Check it yourself, repeatedly.** Serve with
   `python3 -m http.server 5178 -d public`, then:
   - `node scripts/opus55/stills.mjs <name>.html <dir> 1 4.5 9 ...` renders
     frames at those times and tiles them into `sheet.png`, reporting page
     errors. Look at every beat and fix what reads wrong.
   - `node scripts/opus55/render-audio.mjs <name>.html <secs> out.wav`,
     then `python3 scripts/opus55/audio-report.py out.wav ref-audio.wav`.
     Aim for every band within about 2 dB of the reference, with no
     clipping.
   - `node scripts/opus55/live.mjs <name>.html <dir>` plays it in a phone
     viewport, checks that the audio clock is advancing, and reports fps and
     errors.

## 1. p.s.

**Reference:** `misc/1.MP4`, "small print". A riso-print short in cream, blue
ink and orange. An orange asterisk sorts a flood of request strips, circles
the human aside hidden in a few of them ("one hand. baby's asleep.") and
drops those into a jar. After a torn-paper wipe to night, each aside grows
into a picture made of its own words. Then all of them make a constellation,
and the paper tears back to day. The score is soft pads and music-box plucks
in F major.

**The cousin:** commit messages instead of prompts. The circled asides are
"for dad's shop." (a shop front with a striped awning, lit windows and a
swinging "open" sign), "named after our dog." (a sitting dog that wags and
blinks) and "so my son can play it." (a paper plane looping with the phrase
as its trail). A lantern labelled "p.s." replaces the jar. The ink is riso
green instead of blue, so the night is a forest night where letters
dissolve into fireflies that light the lantern. There is a constellation of
11 asides, and the piece loops on "hey! can you look at my first PR? (it's
for my kid's science fair.)".

**Sound:** D major pentatonic at 96 BPM. The score is scheduled from the
same timeline as the picture, so sound effects fall on the frames that cause
them:
- a pencil scratch for each circle
- a paper rip for each wipe
- a note for each strip landing in the lantern
- rising runs as a picture fills in
- the plane's height played as pitch
- one note per constellation ray

The mix was matched to the reference by frequency band (each band within
about 1 dB).

**Specs:** a 30 s loop on a 1000×1000 logical canvas. The animation clock is
the audio clock. Tap or press space to pause.

**Tools:**
- `?t=<seconds>` renders a still frame at that time, with no audio (for
  screenshots).
- `window.renderOffline(30)` returns the score as a base64 WAV (for checking
  the mix).

**Recipe:** [docs/opus55/postscript.md](opus55/postscript.md)

**Run locally:** `python3 -m http.server 5178 -d public`, then open
http://localhost:5178/postscript.html.

## 2. a little wind

**Reference:** `misc/2.mov`, a 10 s paper-cutout stop-motion storybook in
landscape. A curly-haired girl sits by a sprout ("It won't grow.") next to
the Claude critter, which wears a blue watering can as a hat. Then: "Maybe
it just needs a friend." The critter waters the sprout, which shoots up into
big sparkly blue dandelion-puff trees. Birds land, a giraffe peeks in, seeds
drift, and both characters smile. The look is a painted-paper sky, felt
clouds, a sandy hill with blue grass tufts and orange flowers, soft-focus
foreground flowers and a warm film vignette. The shots cut hard between wide
and close-up, with burned-in subtitles. The sound is gibberish creature
voices, a rising chime cascade for the growth, bird chirps and a film-hiss
ambience.

**The cousin:** the seaside, with a lighthouse, a headland and a sailboat. A
kid in an orange knit beanie and striped sweater sits with a kite lying flat
on the sand: "There's no wind today." The critter, in a blue paper sailor
hat, answers "Then let's make some." It puffs up with its eyes squeezed and
blows a visible gust, and the kite takes off. In the wide shot the tail
unfurls bow by bow, a flock of paper birds joins the kite, and a big paper
whale swims through the sky (my version of the giraffe), spouts sparkles,
and two birds land on it. The critter hops up, grabs the string and gets
lifted. The close-up has the kid giggling, "Hold on!", an orange bird
crossing, and an iris closing on the critter's ^^ face. The piece ends with
an iris out, and it opens with an iris in.

**The stop-motion system:** all animation, including the camera, grain and
flicker, is stepped at 12 fps, and the page only redraws when the step
changes. Every cut-out part "boils", meaning it gets a small random offset
on each step. Fills use paper-grain patterns that move with the camera, and
cut-outs cast soft paper shadows. The camera has four shots with slow pushes
and parallax layers, so the background stays soft in the close-ups. Film
dust and the odd hair flick through the frame.

**Sound:**
- **Voices:** gibberish, formant-synthesised from a sawtooth through three
  moving bandpass filters. The mouths lip-sync to the same syllable table.
- **Seaside:** surf swells, gulls, projector hiss and crackle.
- **The puff:** an inhale, then a whoosh as the gust lets go, and paper
  flutter as the kite takes off.
- **The sky:** a G-major pad, a chime cascade timed to the bows appearing,
  bird chirps, whale song and a spout sparkle.
- **Ending:** a ukulele-ish tune under the giggles, and a chord on the iris.

The mix was matched to the reference by frequency band, within about 2 dB.

**Specs:** a 16 s loop on a 1200×800 logical canvas (3:2). The animation
clock is the audio clock. Tap or press space to pause.

**Tools:** the same as piece 1: `?t=<seconds>` for a still frame, and
`window.renderOffline(16)` for a WAV of the score.

**Recipe:** [docs/opus55/little-wind.md](opus55/little-wind.md)

**Run locally:** same server as piece 1, then open
http://localhost:5178/little-wind.html.
