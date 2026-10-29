# Charting: how a Stage part becomes a level

One file decides every level of every song: `Takt/Content/charting.json`. The songs carry
their parts whole, as the record plays them, and the app cuts each level from them at load
time by these rules. To change how a level feels, change a number there (or tell Claude what
felt wrong: "Warm Nine chords on Medium is too busy", "Easy is boring at 68 bpm") and rebuild.
No song needs regenerating.

## What a song gives the charter

Every note of a part (`scripts/songs/*.py`, `pnote` / `pchord` in `common.py`) carries:

- **a weight, `lv`**: 1 for the hits the part stands on (the 1 of the bar, the long notes of
  the tune), 2 for the ones that make it groove (the 3, the answers), 3 for pushes, pickups
  and ornaments;
- **a role, `r`** (chord notes only): `root`, `third`, `fifth`, `sixth`, `seventh`, `ninth`.

## The ladder

Each part, chords and melody, has a ladder of **tiers**, easiest first. A tier has five knobs:

| knob | what it does |
|---|---|
| `notes` | chord notes kept, in the ladder's `keep` order (`root, third, fifth, seventh, sixth, ninth`: two notes are root and third, three a triad). `null` keeps them all |
| `hits` | the heaviest weight played as written: 1 only the main hits, 3 all of them |
| `gap` | seconds at least between two onsets. Seconds, not beats: it reads the same at 68 bpm and at 127 |
| `space` | seconds at most without an onset where the part is playing. A longer silence borrows a lighter hit inside it (the heaviest that fits the gap, nearest the middle), so a sparse section or a slow song isn't boring. `null` never borrows |
| `bonus` | points per hit times this |

The chords ladder deliberately goes **two-note chords spread out → two-note chords on the
groove → three-note chords spread out → three-note chords on the groove → plus the pushes →
four notes → the record**: every step changes one thing, and a bigger chord comes back slow
before it gets fast again. The melody ladder goes long notes only → main notes → most of the
tune → with pickups → nearly every note → the record.

**`phrase`** (bars, a ladder knob; melody 2): before the weights, every tier takes every key
the line plays in each phrase, at its heaviest, earliest onset that fits the gap. Without it a
line whose strong beats are all one note (Hypnotist: every weight-1 note is the low A) cut to
one key for its first three levels, a rhythm game on one key that teaches nothing about the
line. The check: in every phrase where the line plays more than one key, a level that plays
two notes or more plays two keys or more (the gap can leave room for no more).

The weights do the rest, so a line written to be learned puts its keys on the strong beats
itself: **Hypnotist II** (`hypnotist.py --ii`) is three keys, A C D, turning in dotted
eighths, and every level is a rhythm of all three (the keys one at a time; the half-time
turn; with two pickups; the phase whole; with its 16th repeats). Its check: six levels, each
the one below plus more, A C D in every phrase of every one.

`easy`, `medium`, `hard` name a tier of each ladder (chords 2 / 4 / 7, melody 2 / 4 / 6).
`songs` overrides them per song, part and difficulty, e.g.
`"songs": {"song-warm-nine": {"chords": {"medium": 3}}}`.

## Adaptive

`adaptive` walks the ladder one tier at a time. The song is cut in blocks of `window` bars;
`ahead` bars before a block starts, its tier is decided from the `window` bars before that:
at or above `climb` hit rate (with at least `judged` notes) it climbs a tier, under `ease` it
drops one. A wrong key (one the record doesn't play there at any tier) counts as a miss;
playing more of the record than the level asks doesn't. The first run starts at `start`;
later ones `resume` tiers (1) under the top of your last adaptive run of that song and part
(`GameEngine.adaptiveStart`, from the board's records), so a player who reached level 5
doesn't sit through level 1 again. The result records the highest tier reached.

## Where this comes from

Rhythm-game charters (Rock Band, Guitar Hero, Clone Hero) chart the top difficulty first and
reduce downward. Each tier down removes something: chord size (Pro Keys allows no chords on
Easy, two-note chords on Medium, three on Hard), density (Easy about two notes a bar with a
quarter note between them, Medium mostly quarters, Hard up to runs of eighths) and hand span.
Everything in a reduction must exist on the top chart. Takt follows the same idea with two
changes. Spacing is measured in seconds, so a slow blues isn't sparse. Tiers sit between the
named difficulties, so Adaptive can climb in small steps.

## Checking a change

`-LessonCheck 1` checks that every tier of every song keeps its rules (gap and chord size, the
top tier is the whole part) and prints the ladder per song and part: onsets a second, with
the quietest and the busiest eight bars, so an uneven level shows up as a wide range:

    stage: Warm Nine melody ... onsets/s by level [quietest–busiest 8 bars]: 0.47 [0.4–0.6] · 0.64 [0.5–0.9] · …

The engine is `Takt/Game/Charting.swift`; `GameEngine` takes its masks and the adaptive rules.
