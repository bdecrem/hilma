# Polder — projection

A full-length video for **Polder** (`scripts/jam/songs/polder.mjs`, dub techno at 122 in A minor,
4:14), made to be projected on a club wall like the Overclock acts (`apps/overclock-video/`) but
softer: 1920×1080, 25 fps, greyscale, archival FOOTAGE instead of generated stills, dissolves
instead of hard cuts, the kick lighting the picture gently, film scratches and gate weave instead
of datamosh.

The footage is Dutch films of 1920–1934 from [movingimagearchive.com](https://www.movingimagearchive.com)
(public-domain films from the Internet Archive's collections, cut into shots with a semantic
"describe a shot" search and a direct mp4 per shot): the Zuiderzee works and the closing of the
Vlieter on 28 May 1932, the Heide Maatschappij's polders, the Kager lakes, Harlingen, Stavoren,
Yerseke's lobster boats, the Frisian dairy's misty canal, Rotterdam's river, skaters in Den Haag.

## The story

Land below the sea. The sea at dawn; the dike, lit by the kick; the land behind it as the bass
riff arrives — canals, a barge in the mist, the town at the water. The sea pressing at the gap
while the chord is thrown into the delay (bars 49–56); the dredgers and cranes of the Zuiderzee
works. At 73 the pumps stop — no kick, no bass — the water comes up and the picture goes under,
into light in liquid. At 81 the great day: the Vlieter closes, the sea becomes a lake (the peak).
The tide leaves, the evening steamer, the land dry and quiet, and the water frozen: skaters on
the canals as the drone fades.

## What the music draws

- **Kick** — lights the footage like a slow strobe (floor 0.5, so it never blacks out).
- **Chord stab** — the dub delay, printed: the stab's frame comes back at every dotted-eighth
  echo, a little larger and further over each time, fading with the feedback (0.58 a repeat) —
  video feedback as a delay line. Eight **lamps** at the foot of the frame tick down the echoes.
- **Sub riff** — the **waterline**, a horizon that rides the bass note (its pitch lifts it); the
  band below it darkens: the land, below sea level.
- **Bell** — a ripple ring on the water.
- **Drone** — the vignette breathes with its LFO.
- **Chord opening (`p`)** — contrast.
- Readouts: **LEVEL … M NAP** (the water against Amsterdam Ordnance Datum; it climbs while the
  pumps are off) and a **PUMPS** lamp that follows the kick.

## Files

- `archive.mjs` — the archive tool: `search "…"` (POST /api/search → `search/<name>.json` + a
  numbered contact sheet), `source <slug>` (every shot of one film), `probe <id|url>`, `fetch`
  (downloads every clip in `clips.json` from the archive's storage, retrying on 429, and extracts
  frames to `footage/<name>/0001.jpg…` at 960 wide, greyscale, 25 a second, then writes
  `footage/manifest.json`). `search/` and `footage/` are not committed (1 GB); `clips.json`
  is, so `node archive.mjs fetch` rebuilds the footage.
- `score.mjs` — renders five stems through the song script (drums, sub, the three chord
  instances, bell, drone) and writes `score/polder.js`: per-frame envelopes, per-16th levels, the
  sections with their stab pattern (SKANK / HALF / THROW), the chord filter as `p`, the riff.
  Onsets are built from the patterns, not the stems — the delay smears those.
- `engine.js` — `prepare(t)` loads the frames a moment needs (an LRU of bitmaps), `renderAt(t)`
  draws it: footage (cover, zoom, pan, gate weave, dissolve from the previous shot), the echo
  prints, film damage, the act's `under` layer; the pixel stage (dither, threshold, raster, edges,
  posterize, datamosh, smear, interlace); 1080p with the act's `over` layer and text; slices,
  scanlines, grain, the breathing vignette, flashes and fades.
- `polder.js` — the story: shot list in bars (`clip` or `montage`, `offset` seconds into the
  clip, `speed`, `loop` pingpong/loop/hold, `dissolve` bars, `light` kick/stab/steady, `prints`,
  `glitch`, `water`, `under`), the text, the waterline/ripples (`under`) and lamps/readouts
  (`over`).
- `index.html` — live preview synced to the track: `python3 -m http.server` here, then
  `http://localhost:8000/` (tap to play, ←/→ a frame, `?t=` a still).
- `render.mjs` — Playwright → ffmpeg, served over a local http server.

## Making it

```bash
node archive.mjs fetch                  # footage from clips.json (needs ffmpeg + ffprobe)
node score.mjs                          # needs the song rendered (scripts/jam/songs/out/polder)
node render.mjs --stills 3,80,158,244 --sheet out/sheet.jpg   # check stills first
node render.mjs                         # out/polder.mp4, about 20 min
```

Check motion with `ffmpeg -ss 150 -t 20 -i out/polder.mp4 -vf "fps=4,scale=320:-1,tile=8x10" sheet.jpg`.

Master (CRF 20) and a phone copy are in `~/Desktop/polder/`.
