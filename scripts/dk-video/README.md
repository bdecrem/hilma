# DK page → 30-second video

Pipeline used for the DK019 trailer (2026-09-02). Renders the page's own canvas
visualizer deterministically, frame by frame, against a re-arranged cut of the
track, then muxes with ffmpeg. Nothing is screen-recorded.

1. `curl` the live `dkNNN.html` + `dkNNN.m4a` from daskollektiv.rip; decode to WAV.
2. `python3 make-harness.py dk019.html harness.html` — patches the page into a
   steppable harness (audio stub, virtual morph clock, exposed `frame()`).
3. `node onsets2.js` — exact-timing 1 ms envelope, kick onsets refined from the
   page's baked 30 fps `kicks` frames, per-movement beat grids (145/138/134),
   bar phase from section changes. Beware: the last double-kick bars before the
   brake are a varispeed slow-down (138→134), cut those on their local downbeat.
4. Edit `plan.json` — segments are `{src, dur}` in track seconds, in order.
5. Audio: ffmpeg `atrim` per segment + 3 ms edge fades + `concat` (see the
   filter graph in the session; segments are cut on downbeats so no crossfade).
6. `NODE_PATH=<hilma>/node_modules node render.js` — headless Chromium 1920×1080
   at 60 fps: pre-warms the red-clay lattice (50 s), warms the interceptor
   (8 s), then captures 1800 PNGs with compressed movement morphs.
7. `./mux.sh` → `dk019-30s.mp4` (libx264 crf 17, aac 256k, fade in/out).
8. `node synccheck.js` — center-crop luma minimum must sit on each audio kick
   frame (±1 frame at 60 fps).
