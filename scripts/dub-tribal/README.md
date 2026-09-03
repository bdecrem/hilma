# silt — dub techno with tribal percussion (HALLMAN × DK candidate for DK020)

126 BPM, G minor, 256 bars (8:10). Basic Channel signal flow (a short minor-7th
stab into a delay with the lowpass inside the feedback loop) over a Mills-school
tribal engine (3-2 cascara on the rim, tumbao on a 909 tom choir in fourths
G2-C3-F3, 5-cycle shaker + 7-cycle ghost layer phasing against the 4/4), two
basses in conversation (JB202 sub on the chord root, JT30 answering the toms
with real slides). Built 2026-09-02 on the repaired jambot (vibeceo b67cc9d02+).

- `silt.mjs` — the whole track as data + the pipeline: form, chord rotation,
  per-bar patterns, automation lanes → 6 stems through the jambot headless API
  (each in its own session) → mix stage (measured gain staging, score-keyed
  ducking, ping-pong dub delay with per-bar feedback/filter lanes and a 3/16 →
  5/16 time change at bar 177, noise bed, glue, tape, limiter) → per-8-bar
  measurement against an RMS target arc. `SILT_ONLY=mix` re-mixes existing
  stems; `SILT_STEMS=kick,jb01` re-renders a subset; `SILT_BARS=16` for timing.
- `bake.mjs` — page data: 30 fps band envelopes + exact score events + lanes.
- `page-template.html` + `build-page.py` — the DK-style page (`silt.html`, audio
  from `silt.m4a`) and the artifact version (audio embedded as a data URI).

Engine lessons this run added (see jambot/INVENTORY.md too):
- JB01 renders through a Web Audio graph whose cost grows with the SQUARE of
  the hit count (512 hits ≈ 75 s; 16 bars of 16ths is fine, 64 is not). Render
  it in 4-bar chunks and overlap-add (`renderJB01Chunked`). JT90 / JT30 /
  JB202 / JP9000 / JB-S are linear.
- An instrument that is merely turned down still renders: give each stem its
  own session.
- JB01's closed hat is a very quiet voice — render hot, trim in the mix.
- Effect params are static per render: anything that must move per bar
  (delay feedback, filter opening) lives in the mix stage.
