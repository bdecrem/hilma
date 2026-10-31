# Charting: how a Stage part becomes a level

One file decides every level of every song: `Takt/Content/charting.json`. What the levels
must come out as for a blues track, part by part, is `BLUES.md` (the reference sheet, with the
measured figures of every blues song); this file is the mechanism. The songs carry
their parts whole, as the record plays them, and the app cuts each level from them at load
time by these rules. To change how a level feels, change a number there (or tell Claude what
felt wrong: "Warm Nine chords on Medium is too busy", "Easy is boring at 90 bpm") and rebuild.
No song needs regenerating.

## What a song gives the charter

Every note of a part (`scripts/songs/*.py`, `pnote` / `pchord` in `common.py`) carries:

- **a weight, `lv`**: 1 for the hits the part stands on (the 1 of the bar, the long notes of
  the tune), 2 for the ones that make it groove (the 3, the answers), 3 for pushes, pickups
  and ornaments;
- **a role, `r`** (chord notes only): `root`, `third`, `fifth`, `sixth`, `seventh`, `ninth`.

## The ladder

Each part, chords and melody, has a ladder of **tiers**, easiest first. A tier has five knobs
(and may name a `phrase` of its own, below):

| knob | what it does |
|---|---|
| `notes` | chord notes kept, in the ladder's `keep` order (`root, third, fifth, seventh, sixth, ninth`: two notes are root and third, three a triad). `null` keeps them all |
| `hits` | the heaviest weight played as written: 1 only the main hits, 3 all of them |
| `gap` | seconds at least between two onsets. Seconds, not beats: it reads the same at 90 bpm and at 127 |
| `space` | seconds at most without an onset where the part is playing. A longer silence borrows a lighter hit inside it (the heaviest that fits the gap, nearest the middle), so a sparse section or a slow song isn't boring. `null` never borrows |
| `bonus` | points per hit times this |

**Every tier is the one below plus more** (since 0.1 (50)): the charter seeds each tier with
the tier below and adds, Rock Band's rule that everything on a lower difficulty is on the
higher one, so climbing a level never takes a note away and what the player learned stays.
A tier may therefore only loosen a rule going up: a smaller `gap`, heavier `hits`, more
`notes` (the loader traps otherwise). The chords ladder goes **two-note chords spread out →
two-note chords on the groove → three-note chords on the groove → plus the pushes → four
notes → the record**: every step changes one thing (the rhythm, then the chord size, then the
rhythm again). The old third tier, three-note chords spread out again, was sparser than the
tier under it and is gone. The melody ladder goes anchors → long notes only → main notes → most
of the tune → with pickups → nearly every note → the record.

**Beginner** (0.1 (52), the bottom tier of each ladder) is half of Easy: Bart found Slow Burn's
melody on Easy "charted like a Medium" (the line itself is under a note a second, so Easy sat
close to the top). Beginner takes one onset every 2.4 s at most, a note at least every 5 s
(chords: one note a chord, 2.4 / 4 s), and keeps every key of each *four* bars (a tier's own
`phrase`, see below) instead of two. Slow Burn melody: 0.25 onsets a second against Easy's
0.67; every song's Beginner is 0.2–0.35 a second, Easy 0.5–1.1.

**`fromAbove`** (the bottom tier only; Beginner has it): the tier is **cut from the chart the
tier above makes with nothing under it**. The charter first charts the tier above from scratch
(then undoes it), and the bottom tier may take only the onsets that chart takes *by rule* (its
phrase picks, or its hits where the ladder has no phrase; not what it borrowed for a silence);
the tier above then takes those same picks first. The point: every tier is seeded with the one
below, so a free bottom tier would move the whole ladder. An anchor a tick or two from the only
D of a phrase blocks that D at the tier above, and the hits grid shifts around every anchor.
With `fromAbove`, Easy and everything over it chart exactly as they did before Beginner
existed. The check: the same charting with the `fromAbove` tier cut away charts levels 2–7
identically, every song and part.

**`minBeats`** (beats, a tier knob; melody Beginner 1, since 0.1 (53)): the tier may take only
an onset with a note at least this long, capped at the part's usual weight-1 length (the median)
so a line of short stabs (Hypnotist, every note 4 ticks) keeps them all. Bart on Slow Burn
melody Beginner: some notes "instead of coming down like a full bar, one beat at a time, are
half length and don't attach correctly": the phrase cover had taken a 4- or 8-tick ornament
off the beat as the only F or Bb of its four bars, a stub among the anchors. With the cap the
cover takes a longer onset of the key, or skips the key in that phrase. The check: no Beginner
note shorter than a beat (or the usual length) in any song or part.

**`phrase`** (bars, a ladder knob; melody 2; a tier may name a longer one, Beginner 4): before
the weights, every tier takes every key the line plays in each phrase (a depth-first search over
the keys for the widest cover a phrase can have, since 0.1 (52) one that may also skip a key and
never calls a partial cover complete; a tier with a longer phrase spreads its keys over the
ladder's phrases inside it, one a slot where it can), at its heaviest, earliest onset that fits the gap. Without it a
line whose strong beats are all one note (Hypnotist: every weight-1 note is the low A) cut to
one key for its first three levels, a rhythm game on one key that teaches nothing about the
line. The check: in every phrase where the line plays more than one key, a level that plays
two notes or more plays two keys or more (the gap can leave room for no more).

The weights do the rest, so a line written to be learned puts its keys on the strong beats
itself: **Hypnotist II** (`hypnotist.py --ii`) is three keys, A C D, turning in dotted
eighths, and every level is a rhythm of all three (the keys one at a time; the half-time
turn; with two pickups; the phase whole; with its 16th repeats). Its check: seven levels, each
the one below plus more, A C D in every phrase of every one over Beginner (which keeps two of
them in every four bars).

`beginner`, `easy`, `medium`, `hard` name a tier of each ladder (chords 1 / 3 / 4 / 7, melody
1 / 3 / 5 / 7). Easy, Medium and Hard are the same charts they were before Beginner came.
`songs` overrides a part's ladder per song (since 0.1 (59) more than the tier a difficulty
names): `"easy": 2` names a tier, `"phrase": 12` replaces the ladder's phrase (bars), and
`"tiers": {"2": {"space": 0}}` patches one tier's `gap` or `space` (0 = never borrows). The
patched ladder must still loosen going up; the loader traps otherwise.

**Slow Burn melody** (both songs, 0.1 (59)): `{"easy": 2, "phrase": 12, "tiers": {"2":
{"space": 0}}}`. Bart: "melody / easy on Slow Burn is 2x too hard". The sax line marks one
anchor a bar (0.41 onsets a second at 90), but the ladder's two-bar cover (the head uses five
or six keys in every two bars) and Easy's 1.8 s borrowing filled it to 0.88, near the top of
its own ladder (1.23). With a chorus-long phrase and no borrowing, tier 2 is the anchors plus
the few keys they miss: Easy 0.43 a second, half of what it was; Beginner 0.29 (its own
four-bar phrase, unchanged), Medium 1.09 and Hard 1.23 as before. Adaptive climbs 0.29 → 0.43
→ 0.84 → 0.87 → 1.09 → 1.11 → 1.23 instead of jumping from 0.30 to 0.66. No other song's ladder
changed (every onsets-a-second figure of every other song and part is the same as in 0.1 (58)).

A detail that made this possible: Beginner (`fromAbove`) chooses among what the tier above
takes *by rule*. Until 0.1 (59) that was the phrase picks alone on a ladder with a phrase; with
a chorus-long phrase those are eight or nine onsets a chorus, and Beginner left four bars
empty. Beginner's pool is the tier above's phrase picks and its hits now. Since 0.1 (60) the
tier above is **seeded with that whole by-rule set** (`aboveRule`) before its own passes, so
whatever Beginner chose among it, the tier's taken set is the one it reaches on its own and its
borrows follow from it: Easy and above chart exactly as without Beginner (the check), and every
other song's Beginner is unchanged. (Preferring the phrase picks alone was not enough once
Beginner could take a hit: a hit taken first counted its key as covered and the cover dropped
its own pick for that key; Boogie Shoes showed it at bar 64.)

**Slow Burn chords** (both songs, 0.1 (63)): `"chords": {"easy": 2}`. Bart: "remove (almost)
half of the chords to make it feel almost half as hard". Easy named tier 3, the two-note shell
on the 1, the 3 and the 4 (1.11 onsets a second); tier 2 is the shell on the 1 and the 3 (0.74),
a third fewer, not half. The ladder has no rung in between: the one under tier 2 is the root
alone on the 1 (0.38, Beginner's rhythm with two notes), so a true half would be that. Nothing
else moved (Medium stays tier 4, Adaptive's rungs are the same charts). See "What makes a good
chart" below for the rule this taught.

## Adaptive

**The song's speed never changes.** Each song's `tempo` is its 1x speed, set by the generator,
and the Stage plays it at exactly that at every level and in Adaptive: `startGame` stops the
band, sends the song's tempo, counts in, plays, and nothing touches the tempo after. Since
0.1 (57) a stop also clears a tempo change left waiting for a downbeat (a lesson's ramp or the
knob), which used to land on bar 1 of the song and play it at the lesson's tempo (Slow Burn at
90 instead of 68 in one run, 68 in the next). Measured 2026-10-31 on this Mac, Slow Burn melody at
Beginner and at Adaptive: every kick on the 90 bpm grid from the first bar. A low level sounds
slow because it asks for few notes, not because the band is slower. Slow Burn and Slow Burn
Short are 90 since 0.1 (57) (68 before; Bart found 68 too slow for the blues).

`adaptive` walks the ladder one tier at a time. The song is cut in blocks of `window` bars
(4); `ahead` bars (2) before a block starts, its tier is decided. Two windows are read
(0.1 (50)): **a drop** reads the last `window` bars, reaching back up to twice that until
`judged` notes (8) have been judged, so a sparse level at a slow tempo is judged on enough
notes to mean something; **a climb** reads the bars played at the current tier, a whole
window of them at least and up to two (a window that is mostly the easier tier before a
climb says nothing about the new one). Falling apart shows in one phrase; being ready for
more takes a phrase at the tier (Rocksmith's documented complaint was levelling up before
the player was ready). **The record fills what the level leaves out** (0.1 (51)): the part's
notes a tier doesn't ask for are scheduled on the part's instrument at the band's own
velocity, a bar ahead, so a low level still sounds like the song and the player plays a part
of it, the way a Guitar Hero track keeps playing. A first run starts on `start` (4: most of
the tune, three-note chords on the groove; the same chart it was before Beginner), because drops are fast and climbs slow: a
beginner is down a level within a phrase, and a player who can play isn't sat on one note a
bar for a minute. The rules:

- under `ease` (60%) hit rate, or after `missRun` (3) misses in a row anywhere in the window,
  it drops a tier, then holds climbs for `afterDrop` (2) blocks: long enough to recover, and
  what stops ping-pong;
- at or over `climb` (85%) with the hits' median offset inside `spreadMaxMs` (60: lucky isn't
  solid) it climbs a tier, then holds climbs for `afterClimb` (1) block, so the player meets
  the new tier for a whole phrase. A hold never stops a drop;
- a climb or a drop lands on the next tier whose chart actually differs: a thin part (Abyss's
  long tones) cuts the same notes on its top three tiers, and a climb that changes nothing
  teaches nothing;
- it never sinks under `floorBelowStart` (1) tiers below where the run began, and never under 1.

A wrong key (one the record doesn't play there at any tier) counts as a miss; playing more of
the record than the level asks doesn't. In a chord, a dropped finger is a miss for that note but
breaks the combo only when the whole chord went by unplayed. The first run starts at `start`;
later ones `resume` tiers (1) under the top of your last adaptive run of that song and part
(`GameEngine.adaptiveStart`, from the board's records), so a player who reached level 5
doesn't sit through the start again. The result records the highest tier reached;
`GameEngine.changes` keeps every change with the window's rate and spread.

Open (from `misc/game-level-design.txt`, for Bart): memory per section instead of per song;
Swap / Both hands / call-and-response modes; boards per input class; stars; a `span` knob
(Pro Keys' 7 / 9 / 11-semitone stretch limits) and position shifts for wide melodies.

## What makes a good chart: the rules so far

The knowledge base. Every rule here came from Bart playing a chart and saying what was wrong;
the date and the build say where. `BLUES.md` holds the blues-specific targets; these hold for
every song and part.

1. **Difficulty is onsets a second, and "half as hard" means half that figure.** Notes a bar
   lies (a 90 and a 120 bpm chart read differently); the `-LessonCheck` ladder line is the
   measure. When Bart says a level is "2x too hard" or wants it "half as hard", read the
   level's figure, find the rung nearest half, and say which rung that is and what it plays
   (Slow Burn melody Easy 0.88 → 0.43, 0.1 (59); chords Easy 1.11 → 0.74, 0.1 (63)).

2. **Easy ≈ the weight-1 notes alone.** On a melody, Easy is the anchors (about one a bar) and
   the few keys they miss over a chorus; on a comping part, two hits a bar (the 1 and the 3 on
   a slow blues). If the phrase cover or the silence-borrowing push Easy over its band, give the
   song a chorus-long `phrase` and `space: 0` on that tier before touching the weights.

3. **A ladder needs a rung near every target, or it has nothing to offer.** Slow Burn's chords
   ladder read 0.38 · 0.74 · 1.11 · 1.11 · 1.11 · 1.11 · 1.84: four rungs with one rhythm (the
   steps there are chord size), none between two hits a bar and one. When Bart asks for a level
   the ladder has no rung for, say so plainly and name the nearest rungs on both sides; don't
   invent a knob. If a part keeps asking for a missing rung, write the part with weights that
   make it (weight 2 on the groove hits, weight 3 on the pushes and fills), so the ladder's
   rhythm steps exist.

4. **Patch the song, never the ladder.** A global knob change moves every song at once (a tier-2
   change for Slow Burn broke Hypnotist II's checks and shifted the others, 0.1 (59)); a `songs`
   patch in `charting.json` moves one. The check that every other song's figures are unchanged
   is part of every charting change.

5. **No rung more than twice the one below.** Adaptive walks the rungs; a doubling is a wall.
   Slow Burn melody once jumped 0.30 → 0.66; after the patch 0.29 → 0.43 → 0.84 → 0.87 → 1.09.

6. **Beginner never moves the levels above it** (`fromAbove`, `aboveRule`): a bottom tier that
   chose freely would seed every tier over it. Easy, Medium and Hard are the same charts with or
   without Beginner, and the check proves it for every song and part.

7. **A level is still the line, and its notes are whole.** Every key of the phrase at every
   level (the cover), never one key with a rhythm (Hypnotist, 0.1 (48)); no stub shorter than a
   beat on Beginner (`minBeats`, 0.1 (53)).

8. **The band plays what the level leaves out** (0.1 (51)), so a sparse level still sounds like
   the record and a chart can be as thin as the player needs.

9. **The speed never changes** (0.1 (57)). A level is easier because it asks for fewer notes,
   never because the band slows down; a slow blues at 90 is not made easier at 68, it is made
   boring.

10. **Write the weights for the ladder, then measure.** One anchor a bar as the rule for a
    melody (Boogie Shoes had two and Easy was the whole riff, 0.1 (60)); downbeats weight 1,
    groove hits 2, pushes 3 for a comping part. Then run the ladder line and read the figures
    against the sheet's bands before anyone plays it; a new song written this way landed inside
    the bands at first charting (Pearl Street, Blue Lantern).

11. **Write down the next step when a request can't be met exactly.** "A third fewer, the rung
    under it is the 1 alone" belongs in the sheet with the date, so the next play-through can
    decide instead of re-deriving.

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
top tier is the whole part), that every level is the one below plus more and never thinner
(printing notes a second per level and the rise per step; level 1 at most half the top, 65%
for a part under 1.5 notes a second), runs the adaptive rules against scripted players (clean,
scattered, a miss cluster, nothing played, and a seeded player model that must settle a tier
above its own without ping-pong), and prints the ladder per song and part: onsets a second,
with the quietest and the busiest eight bars, so an uneven level shows up as a wide range:

    stage: Warm Nine melody ... onsets/s by level [quietest–busiest 8 bars]: 0.47 [0.4–0.6] · 0.64 [0.5–0.9] · …

The engine is `Takt/Game/Charting.swift`; `GameEngine` takes its masks and the adaptive rules.
