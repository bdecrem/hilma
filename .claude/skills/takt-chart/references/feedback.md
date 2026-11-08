# What Bart has said about difficulty, dated

Every call he has made about how hard something is, in his words where they are on record
(`apps/takt/CLAUDE.md` status entries, `CHARTING.md` rules, `BLUES.md` notes, `LEVELING.md` §4,
`GOALS.md`), what it meant on the two axes, and what we did. **Add the next one at the bottom**;
when it becomes a rule, it goes into CHARTING.md's numbered list, and a number into
LEVELING.md, and this file keeps the pointer.

## Lessons

- **2026-10-26 (0.1 (23–24)).** The shuffle lesson wanted the chord on the 1 and again on the
  3; his first logged chorus hit the chord on the 1 and held it, correct in every bar, and read
  "missed". "That's how a musician plays": the pattern became the chord on the 1, held. **Read
  the log before guessing about a session.**
- **2026-10-27 (0.1 (27–29)).** A scale as a 12-bar chord grid: "the two higher scales are not
  shown"; then "autistic, not artistic", declutter; then Up and down in eighths at 60 was two
  notes a second against a shuffle: "it should be slow for that lesson" → one note a beat over
  four bars. **A drill's first form is one note a beat.**
- **2026-10-29 (0.1 (50)).** "improve two core things: the pedagogy / lessons structure…
  think like a music curriculum expert… (2) game mode: difficulty level construction in
  particular for Adaptive play… the difficulty curve is smooth" → CURRICULUM.md (one new thing
  a lesson, keys by fingering group, common before rare) and every tier the one below plus more.
- **2026-11-04 (0.1 (92–93)).** "add one additional module at the top of the Lesson 1
  requirements: C major scale up and down in eights"; the eighths were "completely out of sync
  with the music" (straight eighths over a shuffle: `feel: straight`); after 20 runs at 50 with
  none counted, "about half are valid in my opinion" → the run is the judged unit, not the
  chorus. **A gate judges what the player played as a unit.**
- **2026-11-04 (0.1 (94)).** "draw the user's attention for all the scale assignments to the
  finger pattern, with a text line… '1-2-3, tuck, 1, 2, 3 tuck, 1, 2, 3, 4, 5 and reverse'" →
  the fingering line, generated from the pattern. **The written fingering is the lesson.**
- **2026-11-04 (GOALS §2).** Chapter 1 cut into three levels: "a level is 2–3 goals and about a
  week of practice." Level 1 white keys (the two scales in eighths at 72, Blue Lantern II
  Medium at an A, an improv), Level 2 five notes (the pentatonic both hands, Maxwell Street II,
  an improv), Level 3 the minor blues (three chords, the 12-bar, a jam on five notes).

## Stage charts

- **2026-10-28 (0.1 (43)).** "leveling is bad… make a charting system with basic rules/formulas
  for what makes for Easy Medium and Hard both in Chord and Melody modes… and Adaptive… that I
  can easily tweak" → `charting.json`, the weights, the ladder. **Every rule is a number in one
  file; a song is never regenerated to change a level.**
- **2026-10-29 (0.1 (48)).** Hypnotist melody on Adaptive showed only a low A: how is that "a
  useful learning opportunity" → the phrase cover (every key of each phrase at every level);
  Hypnotist II, three keys turning. **A level is still the line (rule 7).**
- **2026-10-29 (0.1 (51)).** Hypnotist II "it's just a broken song… 0 notes to play in the
  first +30 seconds, then a VERY REPETITIVE terrible set of notes, at maybe one a second" →
  the record fills what the level leaves out (rule 8); Adaptive starts higher. **A sparse level
  must still sound like the song, and a run must have something to play from bar 1.**
- **2026-10-30 (0.1 (52)).** "the MELODY line on Easy is charted like a Medium… keep Easy as is
  but add a new Beginner level… HALF as hard… fewer notes, more time between them", and "in all
  games, all game modes do not change the speed of the songs" → Beginner (`fromAbove`, 2.4 s
  gap, 4-bar phrase); nothing above it moves (rule 6).
- **2026-10-30 (0.1 (53)).** Beginner notes "instead of coming down like a full bar, one beat at
  a time, are half length and don't attach correctly" → `minBeats` (no stubs on Beginner).
- **2026-10-30 (0.1 (54)).** 51% on a run he played well: "make it less autistic, more normal.
  if I MISS the note, my percentage takes a hit. if I hit the wrong note also, but if I hit it
  with reasonable accuracy I get my points" → accuracy = hits / (hits + missed + wrong). **A
  difficulty complaint can be a scoring bug; check the scoring before the chart.**
- **2026-10-31 (0.1 (57)).** Slow Burn Beginner "approx 66bpm but normal speed, which I get in
  Adaptive game mode, is 90bpm approx - WAY FASTER… ALL songs should play at their 1x tempo"
  and 68 "too boring" → 90, and the speed never changes by itself (rule 9).
- **2026-10-31 (0.1 (59)).** "melody / easy on Slow Burn is 2x too hard" → Easy from 0.88 to
  0.43 a second: tier 2, a chorus-long phrase, no borrowing (rules 1, 2, 4). **"2x" is the
  figure, halved.**
- **2026-10-31 (0.1 (63)).** "slow burn, chords, easy: remove (almost) half of the chords to
  make it feel almost half as hard… whenever I say slow burn, I mean both the full and the short
  versions" → tier 2 (0.74, a third fewer); the rung under it is the 1 alone (0.38), written
  down for the next play-through (rules 3, 11). Then: "add this to your charting rules
  document - we are building a knowledge base for how to build good charts."
- **2026-10-31.** "make a reference sheet for BLUES tracks… guidance for melody and chord
  gameplay difficulty, for each level… notes that will be used for all game charts" → BLUES.md.
- **2026-10-31 (0.1 (60)).** "update the Beginner and Easy levels, Melody, on the OTHER blues
  track… add a third and a fourth blues track… chart the melody beginner / easy levels per the
  rules you just established" → Boogie Shoes re-weighted to one anchor a bar (rule 10); Pearl
  Street and Blue Lantern landed inside the bands at first charting.
- **2026-11-01 (0.1 (73)).** "give them each melody and chords parts to be played on keys…
  make sure to use our .md file that has the technical details of how to do the difficulty
  leveling" → the Delta tracks charted to BLUES.md.
- **2026-11-02.** Chords on Easy, Dockery and Friars Point: "i'm not seeing traditional chords,
  instead i see bass notes"; two-note is fine, "playing on the off beats is fine" → the chick
  first in the weights, the thumb last.
- **2026-11-02 (0.1 (84)).** Agent mode: "chords, on EASY should be all 2 note chords… not just
  an octave… a 1 and a v" → two notes of a voicing are never root + root; `add_interval`.
- **2026-11-05 (0.1 (103)).** "i also need the tempo adjustment widget… present in all games,
  incl games played from the level/map tab" → the knob on every song; a run under full speed is
  practice, not a score. **Slowing is the player's move, never the chart's.**
- **2026-11-05 (0.1 (104)).** Blue Lantern II's fingers "way too complicated… I'm expected to
  jump up a full octave to play notes on the 1 and 2 fingers, but 3-5 are never needed" → the
  Stage fingers each tier's line by hand position (rule 12).
- **2026-11-05 (0.1 (107)).** "blue lantern ii on medium is too hard - make it at least 1/3
  easier", then "do it by have simpler patterns that repeat more often" → the line, not the
  ladder: one riff bar and a landing bar, one hand position, 72 notes (rule 13). **A first song
  is one riff.**
- **2026-11-06 (0.1 (108)).** A D at 55% on a run he felt was a B: "don't change the
  difficulty/chart but review how you're scoring, seems too harsh" → the right key inside half
  a beat is Early / Late, played.
- **2026-11-06 (0.1 (109)).** "(2) rename the CURRENT Blue Lantern II Medium to EZ-2 or some
  such (3) then make a new Medium difficulty… an evolution of the current chart, BUT a little
  harder: 2 or 3 moments in the song where it requires a hand repositioning" → Easy+, Medium =
  the riff plus three figures with `from` 6 (rule 14). **The next rung up is the same line with
  a few moves.** His Medium is exactly 6 moves in 3 moments: the Level 1 budget.
- **2026-11-07 (0.1 (115)).** "make beginner, easy, medium charts for the new track" (Halsted,
  148) → one anchor every two bars, the C♯ a main note so a level stays fingerable (rule 15).
- **2026-11-07 (0.1 (114)).** The whole track: "NOT TOO HARD, but make it interesting." Then,
  2026-11-08, on that track: "the difficulty is WAY OFF, not per se the difficulty of hitting
  those notes, but the FINGER MOVEMENTS required. it's CONSTANTLY telling me to move my hands
  around. that is CRAZY… level complexity includes BOTH the notes variety AND the required
  hand positioning. at level 1, maybe I have to move my hand 4 times in the course of playing
  the full song, NOT 20+" → LEVELING.md: the hand is an axis, budgets per level (Level 1 solo
  track: 4 moves), the solo agent and the idea checker write to it, every tier's hand figures
  printed (rule 16). **Measured: 10 moves in 7 moments was "crazy"; 6 in 3 was "2 or 3
  moments", right.**

## Open (LEVELING.md §4, BLUES.md §6)

- Maxwell Street II (Level 2's song) is a Level 4–6 hand at Medium: 30 moves in 9 moments, 5
  positions over two octaves; the cure is the line (`maxwell_street.py --five`).
- Boogie Shoes melody Easy at 0.64, over its band; Medium 1.57 a wide step up.
- Whether the comping ladders want a rhythm step between Easy and Medium.
- Whether the Level 1 budget (6 / 3 · 3 · 13) is right for the other songs once Bart plays them;
  the figure is in the check, his ear decides.

## How to add a line

Date and build, his words in quotes, which axis, the figure before and after, what moved (the
file). If it is a rule, number it in CHARTING.md and point here; if it is a number, LEVELING.md
first, then `leveling.ts`, `Fingering.swift`, `LessonCheck.swift`.
