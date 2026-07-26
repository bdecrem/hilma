# Tribal / hypnotic techno sketches

Three sketches in one genre — underground hypnotic/tribal techno (Mills lineage) — built to test whether we can internalize a genre's objective rules and then improvise inside them. Full pipeline: web research (Attack Magazine deconstructions, Mills/Hawtin interviews, euclidean rhythm theory) → per-sketch design specs → cross-judge for genre fidelity and distinctness → jambot build → independent audio verification.

| Track | BPM | Corner of the genre | Signature |
|-------|-----|--------------------|-----------|
| `kiln` | 132 | Jeff Mills / Purpose Maker tribal | A-minor tom melody (A-D-E), E(5,16) rimshot clave, 8-bar kick drop + slam-back |
| `undertow` | 125 | Donato Dozzy / hypnotic roller | 5-against-16 polymetric percussion + 5/16 delay, rotated euclidean 303 necklace on F, one-bar silence climax |
| `one percent` | 129 | Plastikman / minimal percussive | Hawtin's 1% rule (one micro-change per 8 bars), Spastik-style snare rolls, G-minor 303 buried as texture, arrangement by subtraction |

All 112 bars (~3.5 min), rendered through the jambot headless API (`../vibeceo/jambot/headless.js`).

Note: these tracks sound as intended only with the JT30 shrillness fix in vibeceo (commit `7718dddd8`, 2026-07-26) — before that, the 303's envelope slammed the filter to 18kHz on every note and the renders screeched at 8-16kHz.

## Re-render

```bash
cd ../../../vibeceo/jambot
node /Users/bartdecrem/Documents/coding2025/hilma/scripts/tribal-sketches/kiln.mjs
```

Each script is self-contained: scenes are built with `add_jt90`/`add_jt30` + `tweak_*`, saved with `save_pattern`, sequenced with `set_arrangement`, rendered with `jb.render(absolutePath, bars)`. Edit patterns/params in place and re-run.

## Genre rules the sketches obey (distilled from research)

- Phrases in 8/16/32 bars; changes only at phrase boundaries; fills earn their place.
- One element changes at a time; tension comes from subtraction, not addition.
- Swing on hats/percussion, never on the kick. Velocity varies (ghost notes 40-60%).
- Toms/rims carry the tribal syncopation (tresillo, cascara, euclidean sets like E(5,16)).
- The kick is the bassline: tune it to the track's key.
- No risers, no supersaws, no EDM drop grammar.
