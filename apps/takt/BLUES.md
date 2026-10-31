# Blues tracks on the Stage: the reference sheet

What a blues song on Takt's Stage should feel like to play, level by level, for the chords part
and the melody part. Started 2026-10-31 (0.1 (59)) after two days of tuning Slow Burn by ear;
every chart we make for a blues track is held to this sheet, and the sheet grows as Bart plays.
The mechanism (tiers, knobs, the phrase cover, per-song patches) is `CHARTING.md`; this sheet
says what the result must be.

The tracks today: **Slow Burn** (slow blues in G, 90, four choruses, 2:08), **Slow Burn Short**
(the same once round, 0:32), **Boogie Shoes** (jump blues in C, 120, six choruses). Generators
in `scripts/songs/`, charts cut at load time by `Takt/Content/charting.json`.

## 1. The ground rules

- **One speed.** The `tempo` in the song block is the song's 1x; the Stage plays every level and
  Adaptive at exactly that. Slow blues is 90, not 68 (Bart, 2026-10-31: 68 is "too boring");
  jump blues 120. A level is easier because it asks for fewer notes, never because the band
  slows down.
- **The band plays the rest.** Whatever a level leaves out of the part, the band's own
  instrument plays, so every level sounds like the record. The player hears the whole tune and
  plays a slice of it.
- **Every level is the one below plus more.** Climbing never takes a note away. What a player
  learned on Easy is still there on Medium.
- **Density is measured in onsets a second**, not in notes a bar, so a 90 and a 120 bpm chart
  read on the same scale. The `-LessonCheck` line "every level keeps its rules" prints the
  figure for every song, part and level; the numbers below come from it.
- **A level is still the line.** The melody levels keep the tune's keys, not one key with a
  rhythm (the phrase cover); the chord levels keep the changes (a note of every chord).
- **Notes are full length.** A level never shows a stub: on Beginner a note is at least a beat
  (or the part's usual weight-1 length). A grace note or an ornament lives on Hard.

## 2. Melody (the horn line on the piano)

The line is written with weights: **1** the anchors the phrase stands on (the long note on the
1, the landing of a lick; about one a bar in a slow blues), **2** the main passing notes and
answers, **3** pickups, triplet pushes, grace notes, turnarounds' ornaments. The levels are cut
from those weights, but **the density targets below are the spec**: when a line's weights give
a level the wrong density, patch the song in `charting.json` (`songs`) or rewrite the weights,
and say which in the song's generator docstring.

| Level | What you play | Onsets / s target | Slow Burn | Boogie Shoes |
|---|---|---|---|---|
| Beginner | The anchors, one at a time, with room: never two inside 2.4 s, never 5 s of nothing. Every key of each four bars appears once. Learn where the phrases land. | 0.2 – 0.35 | 0.29 | 0.27 |
| Easy | The anchors, all of them, plus the few keys they miss over a chorus. About one note a bar in a slow blues, two in a jump blues. No borrowing into silences. **Half of Medium.** | 0.4 – 0.55 | 0.43 | 0.88 (open, see §5) |
| Medium | Most of the tune: anchors and main notes, nothing quicker than a beat's division you can read. | 0.8 – 1.1 | 1.09 | 1.59 (open, see §5) |
| Hard | The line as the record plays it: pushes, pickups, grace notes, the turnaround ornaments. | the record | 1.23 | 2.17 |
| Adaptive | Starts one rung under your last run's top (first time: rung 4); clean 4-bar blocks climb one rung, under 60 % or three misses in a row drop one. The seven rungs must climb smoothly: no rung more than twice the one below it. | rungs: 0.29 · 0.43 · 0.84 · 0.87 · 1.09 · 1.11 · 1.23 | | |

Notes from play:

- 2026-10-30, Slow Burn melody Easy "charted like a Medium": the line is under a note a second,
  so Easy sat near the top of its own ladder. Beginner was added under it.
- 2026-10-30, Slow Burn Beginner notes "half length and don't attach": an ornament had been
  taken as the only F of its four bars. Hence `minBeats` (no stubs on Beginner).
- 2026-10-31, Slow Burn Easy "2x too hard": the two-bar key cover and 1.8 s borrowing filled it
  to 0.88 on a line with 0.41 anchors a second. Easy is now the anchors (0.43). Rule of thumb
  for every blues line: **Easy ≈ the weight-1 notes alone**; if the cover or the borrowing
  push it over 0.55, give the song a chorus-long phrase and no borrowing on that tier.

## 3. Chords (the comping)

The comping is written as chord hits with a weight per hit (**1** the downbeat hits the form
stands on, **2** the groove hits, the 3 or the and-of-2, **3** the pushes) and a role per note
(`root, third, fifth, seventh, sixth, ninth`). Levels cut both the rhythm (which hits) and the
voicing (how many notes, in that role order), one thing at a time.

| Level | What you play | Onsets / s target | Slow Burn | Boogie Shoes |
|---|---|---|---|---|
| Beginner | One note a chord, the root, on the downbeat hits only, with room (2.4 s). Learn the changes. | 0.2 – 0.4 | 0.38 | 0.25 |
| Easy | Two-note chords (root + third) on the groove hits. The shell on 1 and 3. | 0.7 – 1.1 | 1.11 | 0.99 |
| Medium | Three-note chords on the groove. Same rhythm as Easy, the triad. | 0.9 – 1.2 | 1.11 | 0.99 |
| Hard | The comping as the record plays it: four-note dominant voicings, every push. | the record | 1.84 | 1.31 |
| Adaptive | Rungs: root alone → two-note spread → two-note on the groove → triad → + pushes → four notes → the record. | | 0.38 · 0.74 · 1.11 · 1.11 · 1.11 · 1.11 · 1.84 | 0.25 · 0.50 · 0.99 · 0.99 · 1.00 · 1.30 · 1.31 |

Notes from play:

- Easy and Medium share a rhythm by design (the step from Easy to Medium is the chord size, from
  Medium to Hard the rhythm). Slow Burn's rungs 3–6 all read 1.11: the pushes only arrive at the
  record. If a blues comping wants a middle step, write weight-2 hits on the and-of-4 pushes and
  keep weight 3 for the turnaround fills.
- The left hand plays the lower two notes, the right the melody, in the Stage's finger badges
  (the pinky low, as the lessons comp).

## 4. Writing a new blues track so the levels fall out right

- Tempo 90 for a slow blues (12/8 feel), 120 for a jump blues; the generator's `Song(...)` tempo
  is the 1x.
- Melody: one weight-1 note a bar as the rule, two at most, on the 1 or the landing of the lick;
  the anchors should cover the tune's keys over a chorus (G, Bb, C, D in G blues). Weight 2 for
  the notes that make the phrase, weight 3 for everything quicker than an eighth and every
  ornament. Check: weight-1 notes alone at 0.35–0.5 a second.
- Chords: weight 1 on the downbeat of every chord change (and bar 1 of each four), weight 2 on
  the comping hits of the groove, weight 3 on the pushes. Voicings carry roles, root first.
- Run `-LessonCheck 1` and read the song's two ladder lines against the tables above. A level
  outside its band gets a `songs` patch in `charting.json` (named tier, `phrase`, `gap` /
  `space` by tier), and a line here saying why.
- Then play it: Beginner should feel like learning where the phrases land, Easy like playing the
  tune's bones with the band, Medium like playing the tune, Hard like the record.

## 5. Open

- **Boogie Shoes melody Easy is 0.88 and Medium 1.59**, over the bands above (the riff is a
  fast line in eighths). Not touched on 2026-10-31; the Slow Burn recipe (a chorus-long phrase,
  no borrowing on tier 2, Easy = tier 2) would bring Easy near 0.5. Decide after playing it.
- The chords' Easy → Medium step is voicing only; whether a blues wants a rhythm step between
  them is Bart's call after playing Slow Burn chords on both.
