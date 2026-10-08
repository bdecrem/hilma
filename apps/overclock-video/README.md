# Overclock — projections

Three full-length music videos for the Overclock EP (`scripts/jam/songs/overclock{-i,-ii,}.mjs`),
made to be projected on a club wall: 1920×1080, 25 fps, greyscale, mostly black, photographs
flashing on the kick, glitch on the 303's accents. Each act tells a different abstract story with
its own photographs and its own drawn layer.

| Act | Track | Story | Drawn layer |
|---|---|---|---|
| I — SIGNAL | `overclock-i.mjs`, A minor, the rolling off-beat bass | A transmission leaves a radio mast in fog, crosses the city (pylons, substation, street, cable tunnel, server hall) looking for a receiver, finds a sleeper while the hats are out, the eye opens at the peak (RECEIVED), and the path runs backwards to the mast at dawn as the bass leaves | The signal as a dot on a hairline route across the bottom, one tick per place: it pulses with the bass, reaches the far end at the peak and sends a ring out on every kick, travels back during the close, blinks with the kick at home; a TV test band down the right edge slips and tears on the accents. (The first cut drew the bass as an oscilloscope trace — too literal.) |
| II — THE FLOOR | `overclock-ii.mjs`, D minor, the voice alone to open and close | One figure in an empty power-station hall at midnight; then the building takes on water through the night — a drip, a leak down the wall, ripples, the stairwell going under, a black sheet of water across the hall, broken rebar; the floor cracks; at bar 81 it gives way (under the surface, weightless, birds); the kick's return is the surge, the one peak; dawn on the water, the figure walking out into the light. (Crowd shots read as a football match and club imagery wasn't it either — 2026-10-08.) | A perspective floor grid that pulses on the kick, swells as the water rises, cracks, falls away at 81 and slams back at 89; a clock running 23:58 → 07:41 and a water LEVEL climbing to 3.10 m at the surge |
| III — OVERCLOCK | `overclock.mjs`, E minor, the original track | A machine pushed past its rating: a clock mechanism and a quartz crystal keep time, the silicon arrives with the 303, the breakdown is the machine throttling itself (the fan stalls), the long climb is heat (coil, moth on a bulb, molten metal), it trips at the peak, and ends in smoke, ash and one ember | A clock ring whose hand steps more ticks per kick as the clock speed rises and flies apart at the trip; CLK / VCORE / TEMP / FAN readouts driven by the filter sweep; heat shimmer growing with it |

Cuts, flashes and glitches follow the music exactly, from the score each song script already
knows: every kick, hat and acid note, the accents, the sections, and the sweep `p`.

## Files

- `stills.mjs` — the photographs, 12 per act (17 for Act II), from OpenAI `gpt-image-2` with a shared
  house style (pushed Tri-X, crushed blacks, no faces that could be anyone in particular, no text),
  cropped to 16:9 and stored greyscale in `stills/<act>/` (committed: regenerating costs about
  $0.06 a picture and is not deterministic). `node stills.mjs act-ii --only crowd` redoes one.
- `score.mjs` — renders each song's three stems through its script (`SOLO=jt90 / jt30 / jb202`)
  and writes `score/<act>.js`: per-frame envelopes (mix, kick, hats, acid, acid brightness,
  drone), per-16th levels (where every kick, hat and acid note sits), the sections from the
  song's `track.json` and the sweep keyframes from the script. Rerun after changing a song.
- `engine.js` — the shared frame function `renderAt(t)`: stateless and seeded, work canvas at
  960×540 for the pixel stage (photo, dither, raster, threshold, edges; smear, datamosh
  blocks, heat shimmer, interlace, invert), 1080p for text and post (slices, ghosting,
  scanlines, grain, vignette, flashes, fades). Pictures are lit by the kick like a strobe-lit
  room; 1-bit modes threshold at full brightness and dim afterwards so the dots stay visible.
- `act-i.js`, `act-ii.js`, `act-iii.js` — the stories: shot lists in bars (still or montage,
  mode, light, zoom/pan, flashes, glitch amount), text, and each act's drawn layer.
- `index.html` — live preview synced to the track: `python3 -m http.server` here, then
  `http://localhost:8000/?act=act-ii` (tap to play, ←/→ a frame, `?t=` a still).
- `render.mjs` — Playwright → ffmpeg, served over a local http server.

## Making them

```bash
set -a; source ../../.env.local; set +a
node stills.mjs                         # only what's missing
node score.mjs                          # needs the songs rendered (scripts/jam/songs/out/*)
node render.mjs --act act-i --stills 2,45,93,166.5 --sheet out/sheet.jpg   # check stills first
node render.mjs --act act-i             # out/overclock-act-i.mp4, about 15 min (three run fine in parallel)
```

Check motion with `ffmpeg -ss 160 -t 20 -i out/overclock-act-i.mp4 -vf "fps=4,scale=320:-1,tile=8x10" sheet.jpg`.

Flashing stays under three full-frame flashes a second: stills flash on kicks (2.13 a second at
128 BPM) with a probability, white flashes only land on bar downbeats, hats never flash the frame.

Masters (CRF 20) and phone copies are in `~/Desktop/overclock/`.
