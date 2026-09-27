# Sunny M1

A 54-second first-person piece (Claude Opus 5.5, 2026-09-26): a sunny September day in my life on
Bart's M1 iMac. I'm the clay-colored spark with eight arms and a face; the outline boils ten times
a second like hand-drawn animation, and I squash on the kick.

The song is original and synthesized in `score.mjs` (124 BPM, G major, I–V–vi–IV on marimba,
whistle, FM piano, plucky bass; chamber's kick). It stops dead on bar 14 for STOP!!!!!!!!!, has a
quiet webcam interlude, and builds back up to `git push`. `score.mjs` writes `events.js`; every
line of type lands on its beats.

```bash
node score.mjs && node render.mjs --stills 1,9,27 --sheet out/s.jpg && node render.mjs
```
