# How "Strangers" was made

A repeatable recipe for a 30-second vertical music edit drawn entirely in code, in the style of a
reference clip. Total time from reference to finished MP4 was about an hour: roughly 15 minutes of
analysis, 20 minutes writing the scene code, and the rest spent checking and fixing.

Inputs:
- **Reference:** `misc/video-sep26.mov` (22 s, 1260×2736, a screen recording of an "Opus 5.5 made an edit that goes hard" post).
- **Song:** "Speed is Life" (Blade + Into The Void feat. Jordan Lindley), https://www.youtube.com/watch?v=AK7cjOdLVf8, from 0:58 to 1:28.
- **Brief:** keep the reference's style, energy and vibe, but change every specific. Replace both of its characters with new ones based on emoji.

---

## 1. Look at the reference

I can't watch a video directly, so I turned it into still images.

```bash
# one frame per second, tiled into contact sheets
ffmpeg -i ref.mov -vf "fps=1,scale=480:-1,tile=4x3" sheet_%02d.jpg
# a dense strip (6 fps) of a busy section, to see motion between cuts
ffmpeg -ss 9.5 -t 4 -i ref.mov -vf "fps=6,scale=300:-1,tile=8x3" fast.jpg
# cut times: every frame where the picture changes a lot
ffmpeg -i ref.mov -vf "scale=180:-1,select='gt(scene,0.25)',showinfo" -an -f null - 2>&1 | grep -o "pts_time:[0-9.]*"
```

What the reference does:
- **Cut rate:** a new shot every 0.4–0.5 s, which is one or two beats. There are bursts of 2–3 frame flickers on the hits and a few longer holds of about 1.5 s.
- **Cast:** a black cat with glowing yellow eyes against an angry orange starburst mascot. The two meet, fight and tangle.
- **Type:** huge condensed sans slammed on each sung word ("THE CAT", "VS", "YOU NEED", "FASTER", "IS"), one clean geometric caption ("THAN THAT"), and a monospace readout (TOKENS/SEC 122 → 194,088 on a gauge).
- **Texture:** halftone dots everywhere (fills, vignettes, backgrounds), film grain, and rain.
- **Energy devices:** manga radial speed lines, parallel streaks, starbursts on impact, RGB channel split, horizontal slice glitches, full inversions for one or two frames, and vertical stripe wipes that cut a face into bars.
- **Palette:** mostly black and cream, with one loud full-bleed accent (orange) and a secondary accent (pale blue moon, yellow eyes).

## 2. Get and measure the song

```bash
brew install yt-dlp
yt-dlp -x --audio-format wav -o "song.%(ext)s" "<youtube url>"
ffmpeg -ss 58 -t 30 -i song.wav -ac 2 -ar 44100 clip.wav
```

I measured beats, hits and loudness with librosa in a throwaway virtualenv. System pip is locked, so use `python3 -m venv venv && ./venv/bin/pip install librosa`.

- `librosa.beat.beat_track` gave **152 BPM**, with a beat every ≈0.40 s. The beat list goes straight into `BEATS` in `scene.js`.
- `onset_detect` gave the onsets. Keeping only those above the 97th percentile of onset strength gave the **hits** (`HITS`). Hits shake the camera, flash the screen and add RGB split.
- RMS at 0.05 s resolution showed where the energy changes: a quiet intro, **the drop at 3.76 s**, a short dip at 15.4 s, and a big accent at 28.56 s. Those points became the shot boundaries.
- For lyrics with word timestamps I used OpenAI Whisper (`whisper-1`, `timestamp_granularities[]=word`). Every sung word has a start time, so type can slam on the word:

```
3.12 Strangers  5.50 night   6.76 Destiny  8.30 collide  9.34 Running  11.74 light
15.24 Lost  17.22 far away  18.38 Nowhere  20.62 escape  21.66 Brave  23.54 night
24.06 As we  25.28 smile  29.54 Strangers
```

## 3. Storyboard from the lyrics

The lyrics are the script, and each line gets one idea:

| Time | Lyric | Shot |
|---|---|---|
| 0–1.8 | (intro hit) | Lightning strike. Volt rides in on streaks, then a tilted name strip: "VOLT / STRANGER NO.1 / ARRIVED 02:47" |
| 1.8–3.76 | "Strangers…" | Darkness and rain. Boo's cyan eyes open, "STRANGER NO.2 / BOO" types on, push in, and a tiny ⚡ appears reflected in the eyes |
| 3.76–4.55 | STRANGERS (drop) | Volt on full-bleed yellow, then Boo on black, with "STRANGERS" slammed under each |
| 4.55–6.64 | in the NIGHT | "IN" / "THE" on paper, then "NIGHT" set vertically in outline over glowing eyes, then an extreme eye close-up |
| 6.64–9.34 | Destiny to collide | Diagonal split screen: Boo in the black half, Volt in the yellow half, both closing in. A DISTANCE readout counts 9,999 KM down to 0 |
| 9.34–10.3 | (impact) | Starburst, both characters crushed together, inverted spin, then flung apart |
| 10.3–12.72 | Running from the light | Boo flees with afterimages while Volt's light cone hunts from the right. Then a white-out with a giant "LIGHT" |
| 12.72–15.24 | (instrumental) | KILOVOLTS readout 120 → 1,210,000 with a gauge (standing in for the reference's TOKENS/SEC), then stripe-sliced faces, then a glitch of diagonal bars |
| 15.24–18.34 | Lost and far away | Radar screen, "SIGNAL: LOST", coordinates. Boo shrinks to a dot while the outlined "LOST" letters drift apart |
| 18.34–21.66 | Nowhere to escape | Walls of "NOWHERE" close in on Boo's box and three lightning strikes land on the three hits. Then a giant Volt looms under a struck-through "ESCAPE" |
| 21.66–24.06 | Brave in the night | Boo's brave face on yellow with two punch-ins, then a face-off split by a lightning-zigzag seam |
| 24.06–26.36 | As we smile | Alternating grins on the beats, then both together under "SMILE" |
| 26.36–28.56 | (build) | Boo walks in the rain carrying Volt like a lantern ("TWO STRANGERS / ONE NIGHT"), then a zoom into the light and a white-out |
| 28.56–30 | (big accent) | Title card "STRANGERS / IN THE / NIGHT", both characters peek in, invert blips on beats, cut to black |

Rules I held to:
- **Something changes on every beat.** A cut, an invert, a punch-in or a new word.
- **Big moments land on the hits,** not merely near them.
- **Give each quiet stretch one moving element** (a radar sweep, a push-in, typing text) so it never goes dead.
- **Put a recurring gag where the reference had one.** A readout that runs away (DISTANCE, KILOVOLTS) replaces TOKENS/SEC.

## 4. Characters

Base each character on an emoji so it reads instantly, then give it a face with a small set of expressions.

**Volt ⚡**: a seven-point bolt polygon, `[-30,-170] [95,-170] [35,-40] [105,-40] [-50,185] [-5,25] [-85,25]`, filled electric yellow with a 13 px ink outline and rounded joins.
- Eyes sit in the wide upper section and the mouth sits above the bend. Check the bolt's width at each height so the features stay inside the shape.
- Faces: `angry` (slanted brows and a **zigzag mouth**, a bolt's teeth), `shock`, `grin` (squint arcs and a D-shaped grin with a tooth strip), `calm`.
- Glow is a yellow shadow blur.

**Boo 👻**: a dome, straight sides and four scalloped lobes along the bottom that wobble over time. Paper-coloured with an ink outline and a cyan glow.
- Faces: `hollow` (the emoji look), `scared` (big eyes, a wavy mouth), `brave` (eyelids cut flat and heavy brows), `smile`, `tongue` (a wink with the tongue out, the 👻 emoji).
- Arms are small nubs: `up`, `run` (swinging) and `hold`, for carrying Volt as a lantern.
- Running uses a skew transform (lean) plus fading afterimages.

Both characters get **halftone shading**: clip to the body, then fill an offset ellipse with a dot pattern (deep amber dots on Volt, grey dots on Boo). This one step makes flat vector shapes read as print.

## 5. Art style

**Palette.** Black and paper do most of the work, with yellow as the one loud full-bleed colour:

| Token | Hex | Use |
|---|---|---|
| ink | `#0b0b0d` | backgrounds, outlines, type |
| paper | `#ece6d6` | cream backgrounds, Boo, type on black |
| volt | `#ffd60a` | Volt, full-bleed backgrounds, accent type |
| deep | `#c98a00` | halftone shading on Volt |
| cyan | `#7ef6ff` | Boo's eyes and glow, radar |
| night | `#0d0f14` | rainy night scenes |
| pink | `#ff7a9a` | tongue only |

**Type.**
- **Anton** for slammed words.
- **VT323** for readouts and typed labels.
- **Space Grotesk 700** for the one clean, tracked caption ("IN THE", "FAR AWAY").

**Slam:** a word appears at 1.6× scale and snaps to 1× within 0.12 s. Words are fitted to width (`maxW`), usually tilted a few degrees, and sometimes set vertically.

**Texture layers.**
- Halftone vignette fields: dots that grow toward the edges, precomputed once.
- Grain: four random noise frames cycled at 7% opacity.
- A dark radial vignette and one or two faint vertical film scratches.
- A small "drawn with code" tag, drawn in difference blend mode so it shows on any background.

**Motion vocabulary.** Every one of these is a small function in `scene.js`:
- `radial()`: manga speed lines, reseeded every two frames so they flicker.
- `streaks()`: parallel rounded bars moving across the frame.
- `rain()`: slanted rain.
- `lightning()`: a jagged polyline with a glow, a white core and branches.
- `starburst()`: the impact shape.
- `sparkle()`
- A conic-gradient radar sweep.
- A gauge with a needle.

**Camera and post effects,** run on every frame:
- **Hit envelope** (exponential decay after each hit): camera shake of up to 34 px, a 6% zoom punch, a white flash of up to 45%, and extra RGB split.
- **RGB split:** draw the frame three times, each multiplied down to one channel. Scale red and blue up slightly and offset them, then add the three with the `lighter` blend.
- **Slices:** copy horizontal bands and shift them sideways.
- **Invert** for one or two frames, using the difference blend with white.

Invert only black-and-paper frames. Inverted yellow turns blue and breaks the palette.

## 6. Build and render

This is plain HTML canvas with no framework and no dependencies beyond Playwright and ffmpeg.

- `scene.js` exposes `renderAt(t)`. It is **stateless and deterministic**: every random value comes from a seeded generator keyed to the frame number, so any frame can be rendered alone, in any order, and comes out the same each time.
- It draws each frame at 1080×1920 on an offscreen canvas and applies the post effects onto the visible one.
- **Shots** are a list of `[start, end, drawFunction]`. Each draw function gets the absolute time `t`, the time since the shot started `lt`, and an `fx` object it can use to request RGB split, slices, an invert or a flash.
- `index.html` is a live preview synced to the song (tap to play, arrow keys to step, `?t=` for a still).
- `render.mjs` loads the page in headless Chromium through Playwright and waits for the fonts. It calls `renderAt(i/30)` for each of the 900 frames and pipes the JPEG frames straight into ffmpeg together with the audio clip. That produces H.264 at CRF 20 in yuv420p, AAC audio with a 0.35 s fade-out, and the faststart flag. **The whole render takes about 60 s** on the M4.

```bash
./fetch-audio.sh                                      # song → audio/clip.wav (not committed)
node render.mjs --stills 4,9.6,22 --sheet out/s.jpg   # quick contact sheet of chosen times
node render.mjs                                       # full video → out/strangers.mp4
```

## 7. Check it like a viewer would

1. **Stills first.** Render about 40 hand-picked times across every shot into contact sheets and look at them before any full render. This caught a missing character, clipped text and overlapping title lines.
2. **Then motion.** Pull 4 fps contact sheets from the finished MP4 (`fps=4,scale=150:-1,tile=15x4`) to check pacing, dead stretches and ugly flash frames.
3. Fix, re-render, and look again.

Bugs found this way, worth knowing next time:
- **Clipping with `evenodd` to get "everything outside a shape":** add the shape's path *without* calling `beginPath()`, or it wipes out the surrounding rectangle and the clip covers nothing.
- **Inverting a yellow frame gives blue.** Use a white flash there instead.
- **Homebrew's ffmpeg has no `drawtext` filter,** so contact sheets can't carry time labels.
- **Text set vertically at the left edge** needs its centre about 200 px in, or the letters get cut off.
- **Grain that changes every frame costs file size.** The CRF 20 master is about 90 MB, and a 6.5 Mbps copy is about 25 MB, which fits the 30 MB file-send limit.

## 8. Doing another one

1. Pull stills from the reference and note its cut rate, type, texture, palette and energy devices.
2. Download the song, cut the clip, get beats, hits and loudness from librosa, and word timings from Whisper.
3. Write a storyboard table: one idea per lyric line, big moments on the hits, something changing every beat.
4. Design two characters from emoji. Give each four or five expressions and halftone shading.
5. Pick a palette: black, paper and **one** loud accent, plus one secondary colour for glow.
6. Copy `scene.js` and replace the characters, palette, `BEATS`/`HITS` and the shot list. Keep the primitives and the post pipeline.
7. Check a stills contact sheet, fix, render, check a motion contact sheet, fix, then deliver.
