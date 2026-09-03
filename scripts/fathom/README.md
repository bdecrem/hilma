# fathom — dub techno (HALLMAN × DK)

122 BPM, A minor, 208 bars (6:51). Six elements: 909 kick, sub bass figure,
one chord voice (JP9000: four detuned saws → lp24 with an envelope and a slow
LFO on the cutoff), 909 hats with swing on the ghost notes, a rim, a sparse
Karplus-Strong ping. Two chord vamps (Am9/Fmaj9; Dm9 from bar 113), two stab
patterns (A: the "and" of 1 and 3; B: the skank), two bass patterns, a dub drop
at 81 with a one-bar hole at 88. Chord path in the mix: lane lowpass → chorus →
ping-pong 3/16 delay with the lowpass inside the loop; the echoes carry it.
No saturation, no pumping compressor: 2:1 glue and a limiter.

- `fathom.mjs` — the track. Flags: `FATHOM_ONLY=mix`, `FATHOM_STEMS=a,b`, `FATHOM_BARS=32`.
- `player.html` — scrub player.

Mix lesson: gain-stage by RMS, then cap each stem's post-trim PEAK (`PEAK_CAP`);
otherwise a quiet transient stem (hats at −48 dBFS) gets a +27 dB trim, its
peaks drive the master normalization and the whole track ends up 6 dB quiet.
