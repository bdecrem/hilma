# Leveling: what makes something a Level 1, 2, 3 thing, everywhere in Takt

Written 2026-11-08. Bart, playing the Solo track the improv teacher wrote for him on Level 1:
"the difficulty is WAY OFF, not per se the difficulty of hitting those notes, but the FINGER
MOVEMENTS required. it's CONSTANTLY telling me to move my hands around. that is CRAZY, that's
way beyond Level 1 complexity. so level complexity includes BOTH the notes variety AND the
required hand positioning. at level 1, maybe I have to move my hand 4 times in the course of
playing the full song, NOT 20+." That track moved the hand 10 times in 7 places over 15
semitones (`scripts/takt/fixtures/solo-blue-lantern-2026-11-07.json`, kept as the bad example).

This sheet is the one place that says how hard a thing may be at a level, for every surface
that makes playable material: the Stage's charts (`CHARTING.md` is the mechanism), the lesson
steps and jams (`CURRICULUM.md`, `GOALS.md`), the improv teacher's idea and whole track
(`IMPROV.md`), and Agent mode's mods. **Every agent prompt and every check reads its numbers
from here**; when a number changes, change it here first, then in `src/lib/takt/leveling.ts`
(the agents) and `Game/Fingering.swift` + `App/LessonCheck.swift` (the app), and say so below.

## 1. Difficulty has two axes, and both are measured

1. **Density**: onsets a second over the piece (`CHARTING.md` rule 1), with the quietest and
   busiest eight bars. The old axis. It says how fast the fingers go.
2. **The hand**: how often the hand has to move, how many places it sits in, and how wide the
   line is. New on 2026-11-08. It says how much the player has to *think about where their hand
   is*, which for a beginner is the whole difficulty: a grown-up beginner reading notes coming
   down a highway can play a line in one hand position at a note a second, and cannot play a
   line at half that speed if it moves the hand every two bars.

The hand is measured the way the Stage fingers a line (`Game/Fingering.swift`, 0.1 (104): a
dynamic program with a pianist's costs over the five fingers, and since 0.1 (115) no slide,
cross or stretch inside a beat; `src/lib/takt/fingering.ts` is the same program on the server,
checked against the app's figures, and every change to one goes into the other). From the fingers:

- **A position** is where the thumb lies (right hand; the pinky for the left): a note under
  finger f puts the thumb f − 1 white keys under it. A hand in one position reads within a key
  of itself (1 on F and 5 on D is a stretch, the thumb on F reaching down to E is a reach), so a
  position is a span of up to two thumb keys.
- **A move** is a note that takes the thumb outside that span, or a thumb-under going up, or a
  finger over the thumb coming down (the hand turns onto a new place). Rests don't excuse a move:
  a jump of a fifth after two bars of rest is still a new place to find.
- **A moment** is a group of moves within two bars of each other: a tuck up into a figure and
  the hand coming home is one moment to the player. Blue Lantern II's Medium has three figures:
  six moves, three moments.
- **Span**: the widest interval of the line, in semitones. One position covers a sixth
  comfortably and a seventh or an octave stretched (Blue Lantern II's riff: F4 under the thumb,
  D5 under the pinky, 10 semitones, one position).

The figures for every song, every tier (2026-11-08, `-LessonCheck` prints them as
`hand moves/moments · positions · span`; the TS port agrees on all of them):

| song (melody) | L1 Beginner | L3 Easy | L4 Easy+ | Medium | L7 Hard |
|---|---|---|---|---|---|
| Blue Lantern II (Level 1 goal) | 0/0 · 1 · 10 | 0/0 · 1 · 10 | 0/0 · 1 · 10 | **6/3 · 3 · 13** (L6) | 6/4 · 3 · 13 |
| Maxwell Street II (Level 2 goal; the line of 2026-11-08, §4) | 5/3 · 3 · 22 | 6/5 · 3 · 22 (L2) | 4/3 · 2 · 22 | **4/3 · 2 · 22** (L5) | 4/3 · 2 · 22 |
| Slow Burn | 8/6 · 3 · 19 | 18/12 · 5 · 24 | 18/12 · 5 · 24 | 18/11 · 5 · 24 (L5) | 20/11 · 5 · 24 |
| Pearl Street | 8/8 · 2 · 14 | 23/12 · 4 · 21 | 32/12 · 4 · 21 | 33/15 · 4 · 21 (L5) | 33/12 · 4 · 21 |
| Boogie Shoes (Easy = L2, Easy+ = L3 since 2026-11-08) | 13/8 · 3 · 19 | 23/12 · 3 · 19 (L2) | 27/14 · 5 · 22 (L3) | 50/9 · 6 · 24 (L5) | 56/7 · 5 · 24 |
| Friars Point | 0/0 · 1 · 11 | 20/15 · 3 · 15 | 35/10 · 3 · 15 | 41/7 · 4 · 15 (L5) | 43/8 · 3 · 15 |
| Warm Nine | 0/0 · 1 · 9 | 0/0 · 1 · 9 | 14/5 · 2 · 12 | 14/5 · 2 · 12 (L5) | 14/5 · 2 · 12 |
| Hypnotist II | 0/0 · 1 · 5 | 0/0 · 1 · 7 | 0/0 · 1 · 7 | 0/0 · 1 · 7 (L5) | 0/0 · 1 · 7 |
| Halsted (148, 0.1 (115)) | 10/10 · 3 · 19 | 36/20 · 6 · 27 | 41/17 · 6 · 27 | 41/17 · 6 · 27 (L4) | 82/6 · 6 · 27 |

## 2. The budgets

A level on the map (`GOALS.md`) is about a week of practice and 2–3 goals. What a player at
that level can be asked to do with one hand, on any surface (a chart, a lesson run, an improv
idea, a solo track, a mod), is capped by this table. The reference points are the ones Bart
has played and called right or wrong: Blue Lantern II's Easy+ (one position, "EZ-2") and Medium
("2 or 3 moments where it requires a hand repositioning", 0.1 (109)) are right for Level 1; the
first solo track (10 moves, 7 moments) was "crazy" for it.

| Map level | Positions | Moves (whole piece) | Moments | Span | Density (onsets/s) | What it feels like |
|---|---|---|---|---|---|---|
| **1** | ≤ 3: home, plus the places the figures reach (a **solo track**: ≤ 2) | ≤ 6 (solo: ≤ 4) | ≤ 3 (solo: ≤ 2) | ≤ 13 (solo: ≤ 12) | 0.3–0.7 | One hand position all song; two or three figures that leave it and come straight back |
| **2** | ≤ 3 | ≤ 12 | ≤ 6 | ≤ 24 (two octaves) | 0.4–1.0 | Two places to sit and a few trips between them; a thumb-under is a thing you know |
| **3** | ≤ 4 | ≤ 20 | ≤ 10 | ≤ 24 | 0.5–1.2 | Moving is part of the line; still never two moves in one bar |
| **4–6** | ≤ 5 | ≤ 30 | ≤ 15 | ≤ 24 | 0.6–1.4 | The record's own melodies at Medium (Slow Burn, Pearl Street) |
| **7+** | measured, no cap | | | | | Hard charts, dense solos: the figure is printed so a jump shows |

Rules of thumb that follow from it:

- **A Level 1 line lives in one position.** Pick the five or six scale keys the player's hand
  sits on (for the white keys over Blue Lantern II: thumb on D4, pinky on A4, or thumb on F4,
  pinky on D5) and write the whole piece inside it. The two or three figures that leave it are
  the interest, and each comes straight home (a moment, not a new position to live in).
- **Density never buys back a hand move.** A sparse line that moves is harder for a beginner
  than a busier one that stays. Thin out the hand first, then the notes.
- **The budget is for the whole piece**, not per chorus: four moves over 48 bars, not four a
  chorus. Forty-eight bars in one position with two excursions is a Level 1 song.
- **Both hands never on Level 1–2 material** (`CURRICULUM.md`: one new thing a lesson).
- **A level's material is measured, then played, then believed.** The figure is in the check;
  Bart playing it is what decides whether the budget is right. When he calls something too hard
  or too easy, put the figure and the date in §4 and move the number.

## 3. Where the budgets apply, and how each surface keeps them

The one tool for all of them, no build needed: `npx tsx scripts/takt/measure.ts <song> --level N
[--scale pcs]` (a Stage part at its named difficulty against the level's budget and density
band), `--step <module.json>:<id> --level N` (a lesson step by its written fingering), `--notes
<file> --tempo N --level N [--solo]` (a solo or an idea). The skills that write material,
`.claude/skills/takt-chart` (anything leveled) and `takt-blues` (a track), read this sheet and run
it before and after every change (2026-11-08).

- **Stage charts** (`CHARTING.md`, `Game/Charting.swift`): `-LessonCheck` prints the hand
  figures of every tier of every melody beside its onsets a second, and asserts the plan's
  goal songs: Blue Lantern II Easy+ 0 moves and 1 position, Medium ≤ 6 moves and ≤ 3 moments
  (the Level 1 budget), and Maxwell Street II's Medium against Level 2's (4/3 · 2 · 22 since
  2026-11-08, asserted since the same day; a later level's goal song prints until its line holds). A
  chart over its level's budget is cured in the line (rule 13: write the riff in one position;
  rule 14: the next rung is the same line with a few moves), never by slowing it (rule 9). The
  chords part keeps its hand-set voicings and is not measured this way (a voicing is a position
  by construction).
- **Lesson steps and jams** (`Lesson/`, `CURRICULUM.md`): a run's fingering is in the content;
  a scale over two octaves is two tucks a run by design, and the step's level says so (Level 1
  is the C major and A minor runs, Level 2 the pentatonic ones). A jam's riff sits in one
  position at Levels 1–2.
- **The improv teacher's idea** (`src/lib/takt/improv-agent.ts`, `checkIdea`): a 1-, 2- or
  4-bar idea sits in **one hand position**: fingered by the app's rule it has no move and spans
  at most a seventh (10 semitones). The fingers the app shows are the planner's, not the
  model's. Sent back otherwise.
- **The improv teacher's whole track** (`src/lib/takt/solo-agent.ts`, `rulesFor`, `checkSolo`):
  the budget of the player's level (`context.level`, the map level of the goal the improv is;
  Level 1 for a jam under a lesson). The prompt names the **home position** (the five scale
  keys covering most of their take) and the budget in words; `checkSolo` fingers the solo as the
  Stage will and sends it back with the bars of every move when it is over budget in moves,
  moments, positions or span. The range is the home position and a step either side, not the
  take's range plus an octave as before 2026-11-08.
- **Agent mode** (`src/lib/takt/mod-tools.ts` `measure`, `read_song`): every melody tier's line
  carries its hand figures ("6 hand moves (3 moments), 3 positions, inside a tenth"), and the
  prompt's rule 8 says what a level may ask of the hand. A player asking for "a Level 1 version"
  gets one position; "harder" never means "moves more" without being asked.
- **The chat teacher** reads the same line in the song context, so "why does this keep moving
  my hand" gets a real answer.

## 4. Decisions and dates

- **2026-11-08.** The hand becomes an axis. Budgets set from Blue Lantern II's Easy+ (0/0, 1,
  10) and Medium (6/3, 3, 13) and from the first solo (10/7, 2–3, 15: too hard). The Level 1
  solo budget is 4 moves, Bart's own number ("maybe 4 times"). Bart's solo was rewritten under
  it the same day (`scripts/takt/solo-from-review.ts`), v2 of his `takt_mods` row; v1 is in the
  history and in the fixture.
- **2026-11-08, later: Boogie Shoes melody Easy.** Bart: "still over the band (0.64, we want
  0.4-0.55)… without touching any other song and without making medium or hard a cliff": the
  density axis, fixed there (`from: 3` on every non-anchor note but the riff's landing F in the form's first bar, which Beginner needs for a second key, so Easy is the anchors at 0.52
  and tier 3 is named Easy+ at 0.83; BLUES.md §2, CHARTING.md rule 17). Measured on this axis
  after: Beginner 13/8 · 3 · 19, Easy 23/12 · 3 · 19 (was 24/14 · 5 · 24), Easy+ 27/14 · 5 · 22,
  Medium 50/9 · 6 · 24, Hard 56/7 · 5 · 24. Easy's 23 moves are the record's own octave leaps
  (C4 under the thumb, the C5 on the IV, the D5 on the V, the shout chorus an octave up): a Level
  4–6 hand on a song no level has as a goal, so it is printed, not failed. A Level 1–2 Boogie
  Shoes is a line (a II version with the riff kept in one octave), not done: the ask was the
  band, and no other song.
- **2026-11-08, later: Maxwell Street II's line rewritten for the Level 2 hand.** Its Medium was
  a Level 4–6 hand, 30 moves in 9 moments, 5 positions over two octaves: the five-note line of
  0.1 (97) charted the original's answers, which land on A4 and C5 under the pinky while the
  riff sits with the thumb on A3, so the hand jumped on every bar of stop time. The cure was
  the line (`maxwell_street.py --five`; the original regenerates byte-identical): the riff and
  the voice's answers in one pentatonic box, the five keys under the five fingers (thumb on A3,
  pinky on G4), the second chorus and the solo in the box an octave up (thumb on A4), every
  turnaround low on the A under the thumb, so the hand tucks up onto the high A and jumps home
  onto the low one. Medium reads **4/3 · 2 · 22** (the same hand from tier 3 to Hard), 134
  notes, 0.93 a second, inside Level 2's 12/6 · 3 · 24 and 0.4–1.0; Easy 6/5 · 3 · 22 at 0.49,
  Beginner 5/3 · 3 · 22 at 0.26; the ladder 0.26 · 0.49 · 0.64 · 0.90 · 0.93 · 1.21 · 1.21 with
  the blues melody patch in `charting.json` (new for this song; without it Easy is 0.76 and
  Beginner → Easy doubles). Two things the fingering planner taught on the way, for the next
  line written for the hand: a climb that ends under finger 4 (… E G | A) tucks onto the G and
  settles a bar later, two moves and a position between the boxes, so end a climb on a note
  the thumb tucks from straight onto the box's own thumb key; and a descent within a beat onto
  a note mid-box lands the thumb there (inside a beat the hand may not jump onto a high
  finger), two moves again, so bring the hand down onto the box's thumb key after a long note
  (here the turnaround's A after the release's held C). The `-LessonCheck` plan-goal check
  still asserts Level 1 only and prints Level 2's figure; it can assert it on the next build.
