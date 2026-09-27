# Pentimento

A 57-second vertical film, painted and scored in code (Claude Opus 5.5, 2026-09-26).

One canvas is painted four times: charcoal on an umber ground, Mauritius in 1598 with a dodo,
the Dutch ships of 1606 knifed over it, the empty shore of 1662 painted over everything. Then an
X-ray shows every layer at once, and the dodo, painted in lead white, is the brightest thing there.

The score is a passacaglia on the lament bass (D–C–B♭–A): one variation per layer, and at the
X-ray every variation plays at once, ending on a Picardy third. Harpsichord, viol, recorders and
timpani are all synthesized in `score.mjs`, which also writes `events.js`, the timeline every
charcoal line, brush stroke and knife hit is cut to.

```bash
node score.mjs                       # audio/score.wav + events.js (≈2 s)
node render.mjs --stills 12,29.9,47 --sheet out/s.jpg
node render.mjs                      # out/pentimento.mp4 (≈3 min)
```

`scene.js`: paint layers are offscreen canvases; strokes are data (path, width, color, time);
a stroke is a solid body with bristle texture that runs dry. A relief height map is lit by
raking light, so thick buried paint shows through thin later layers. An X-ray layer keeps the
densest lead at each point. The method is `apps/strangers/PROCESS.md`.
