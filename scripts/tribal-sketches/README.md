# Tribal / hypnotic techno sketches

## Round two — one subgenre, three positions (2026-07-26)

Round one's three tracks were really three subgenres. Round two locks to Mills-school tribal techno only, with a 13-point invariant list distilled from a corpus study (Purpose Maker catalog + Ben Sims/UR/Planetary Assault Systems school + 909 performance craft), and pushes three tracks to maximally distant documented positions inside it:

| Track | BPM | Position | Anchor references |
|-------|-----|----------|-------------------|
| `congregation` | 138 | melodic-anthem pole | The Bells (two-movement form, A-minor bell riff) |
| `red-clay` | 134 | pure-ritual pole, no melody | Casa, Kat Race (clave lattice, drum choir in fourths) |
| `interceptor` | 145 | aggression ceiling | Utopia, The Extremist, Cyclone (siren stab, kick-rumble-as-bass) |
| `procession` | 131 | Afro-acid antiphony (round 3, post-repair) | In The Bush, The Bells' "switch" — tuned-tom question, real-slide 303 answer |

Sophistication upgrades this round: velocity grids via per-step `jt90.<voice>.level` automation in dB (10-14 dB accent/ghost spreads), hat-decay riding, tom melodies via cents tuning, mixer-mute choreography arrangement (no programmed fills — whole-voice mutes and dropouts only), 8-bar phrase grammar, spectral placement so the three tracks EQ-stack like a Mills 3-deck set.

## Round one (superseded)

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
