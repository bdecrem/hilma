# lathe — Birmingham-school techno after Surgeon (HALLMAN × DK)

134 BPM, A, 224 bars (6:42). The method from the Sound on Sound "Generations"
interview: one programmed drum loop for the whole track, a poly synth's two
outputs used as two instruments (dry bass copy; quarter-bar-delayed copy with a
mid EQ sweep), and the arrangement performed on the desk — highpass sweeps,
drive rides, a quarter-bar feedback send that runs away in the breakdown,
bar mutes, kick dropouts. Turing-machine-style shift registers mutate the hat
accents, the metal loop and the noise ticks with a per-section flip
probability. Built 2026-09-03 on vibeceo a2b6e39f0+.

- `lathe.mjs` — the track (patterns, Turing registers, 8 stems in isolated
  sessions, the desk as lanes, pumping comp + drive + glue + limiter,
  per-8-bar measurement). Flags: `LATHE_ONLY=mix`, `LATHE_STEMS=a,b`, `LATHE_BARS=32`.
- `player.html` — scrub player (sections under the seek bar, chips, bar readout).

Engine finding: JB-S took its pattern length from slot 1, so multi-bar patterns
that left s1 empty looped their first bar (fixed upstream, vibeceo a2b6e39f0).
