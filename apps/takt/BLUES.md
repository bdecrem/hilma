# Blues tracks on the Stage: the reference sheet

What a blues song on Takt's Stage should feel like to play, level by level, for the chords part
and the melody part. Started 2026-10-31 (0.1 (59)) after two days of tuning Slow Burn by ear;
every chart we make for a blues track is held to this sheet, and the sheet grows as Bart plays.
The mechanism (tiers, knobs, the phrase cover, per-song patches) is `CHARTING.md`; this sheet
says what the result must be. The general rules every chart follows, blues or not, are
`CHARTING.md` "What makes a good chart" (one item a lesson learned, dated).

The tracks today: **Slow Burn** (slow blues in G, 90, four choruses, 2:08), **Slow Burn Short**
(the same once round, 0:32), **Boogie Shoes** (jump blues in C, 120, six choruses, 2:24),
**Pearl Street** (Texas shuffle in E, 112, five choruses with a stop-time chorus, 2:09, added
2026-10-31) and **Blue Lantern** (minor blues in D, 84, straight eighths over a sixteenth hat,
Rhodes, four choruses, 2:17, added 2026-10-31), and under the Stage's "All tracks" card three
old-school ones (2026-11-01): **Dockery** (Delta blues in A, 96, one guitar and a foot stomp,
stop-time tops, 2:00) and **Friars Point** (Delta boogie in E, 116, the boogie thumb under the
slide's triplets, 2:04), both charted to this sheet in 0.1 (73) (their columns below), and
**Maxwell Street** (Chicago blues in A, 80, the stop-time 12-bar with a unison riff, 2:24), not
charted yet (Bart: "without any charts"; its ladder falls out of the rules alone). **Halsted** (Chicago boogie in A, 148, the electric guitar through the
amp on the riff and a rolling piano, seven choruses with a stop-time chorus, 2:16, added
2026-11-07) sits under All tracks too, charted to this sheet (its columns below). Generators in `scripts/songs/`, charts cut at
load time by `Takt/Content/charting.json`; every blues melody carries the same `songs` patch
there (Easy = tier 2, a chorus-long phrase, no borrowing on tier 2).

## 1. The ground rules

- **One speed.** The `tempo` in the song block is the song's 1x; the Stage plays every level and
  Adaptive at exactly that. Slow blues is 90, not 68 (Bart, 2026-10-31: 68 is "too boring");
  jump blues 120. A level is easier because it asks for fewer notes, never because the band
  slows down. The player's knob (0.1 (103)) can take a run under 1x to learn it; that run is
  practice, not a score.
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

| Level | What you play | Onsets / s target | Slow Burn | Boogie Shoes | Pearl Street | Blue Lantern | Dockery | Friars Point | Halsted |
|---|---|---|---|---|---|---|---|---|---|
| Beginner | The anchors, one at a time, with room: never two inside 2.4 s, never 5 s of nothing. Every key of each four bars appears once. Learn where the phrases land. | 0.2 – 0.35 | 0.29 | 0.25 | 0.26 | 0.26 | 0.27 | 0.24 | 0.18 (one anchor every two bars, cut from Easy's chorus cover) |
| Easy | The anchors, all of them, plus the few keys they miss over a chorus. About one note a bar. No borrowing into silences. **Half of Medium.** | 0.4 – 0.55 | 0.43 | 0.64 (a riff in eighths; was 0.88) | 0.51 | 0.41 | 0.50 | 0.55 | 0.65 (about a note a bar: at 148 a bar is 1.62 s) |
| Medium | Most of the tune: anchors and main notes, nothing quicker than a beat's division you can read. | 0.8 – 1.1 (a jump-blues riff runs to 1.6) | 1.09 | 1.57 | 1.31 | 0.88 | 1.18 | 1.42 (a boogie) | 1.14 (tier 4, the riff without its ornaments) |
| Hard | The line as the record plays it: pushes, pickups, grace notes, the turnaround ornaments. | the record | 1.23 | 2.17 | 1.86 | 0.97 | 1.50 | 2.80 (the slide's triplets) | 4.29 (the riff, the runs, the solo's rakes) |
| Adaptive | Starts one rung under your last run's top (first time: rung 4); clean 4-bar blocks climb one rung, under 60 % or three misses in a row drop one. The seven rungs must climb smoothly: no rung more than twice the one below it. | | 0.29 · 0.43 · 0.84 · 0.87 · 1.09 · 1.11 · 1.23 | 0.25 · 0.64 · 0.79 · 1.49 · 1.57 · 1.69 · 2.17 | 0.26 · 0.51 · 0.77 · 1.23 · 1.31 · 1.42 · 1.86 | 0.26 · 0.41 · 0.68 · 0.74 · 0.88 · 0.94 · 0.97 | 0.27 · 0.50 · 0.78 · 1.11 · 1.18 · 1.18 · 1.50 | 0.24 · 0.55 · 0.80 · 1.34 · 1.42 · 1.86 · 2.80 | 0.18 · 0.65 · 0.81 · 1.14 · 1.93 · 2.46 · 4.29 |

Notes from play:

- 2026-10-30, Slow Burn melody Easy "charted like a Medium": the line is under a note a second,
  so Easy sat near the top of its own ladder. Beginner was added under it.
- 2026-10-30, Slow Burn Beginner notes "half length and don't attach": an ornament had been
  taken as the only F of its four bars. Hence `minBeats` (no stubs on Beginner).
- 2026-10-31, Slow Burn Easy "2x too hard": the two-bar key cover and 1.8 s borrowing filled it
  to 0.88 on a line with 0.41 anchors a second. Easy is now the anchors (0.43). Rule of thumb
  for every blues line: **Easy ≈ the weight-1 notes alone**; if the cover or the borrowing
  push it over 0.55, give the song a chorus-long phrase and no borrowing on that tier.
- 2026-10-31, Boogie Shoes re-weighted: the riff had two anchors a bar (0.95 a second of
  weight-1 notes), so Easy was the whole riff. One anchor a bar now, the note the bar lands on
  (the G on the 1, the C the lick falls to); Easy went from 0.88 to 0.64, Beginner 0.27 to 0.25,
  Medium and Hard unchanged. Easy still sits over the band because the riff repeats five keys
  every two bars and the chorus cover keeps them; the step Easy → Medium is 0.64 → 1.57, wide.
  To hear on the next play-through.
- 2026-10-31, the two new tracks were written to the §4 recipe and landed inside the bands at
  the first charting: Pearl Street Easy 0.51, Blue Lantern Easy 0.41.
- 2026-11-01, the two Delta tracks (0.1 (73)): with the blues melody patch, Dockery's voice is
  0.27 · 0.50 · 1.18 on Beginner / Easy / Medium, inside the bands (Medium a hair over 1.1).
  **Friars Point's Beginner is every other anchor**: at 116 the bar is 2.07 s, under Beginner's
  2.4 s gap, so the first rung takes 0.24 and Easy (0.55, the anchors and the cover) is 2.3 times
  it, over the "twice" rule. Beginner cannot borrow (`fromAbove`), so a `space` patch on it does
  nothing; the rung between doesn't exist short of a 2.0 s gap, which would make Beginner the
  anchors themselves (≈ 0.48, over its band). Left as is, to hear: Beginner there is one note
  every other bar, which may be the right first rung for a 116 bpm boogie anyway.
- 2026-11-07, **Halsted** (148, the fastest blues on the Stage). At that tempo a bar is 1.62 s, so
  one anchor a bar is 0.62 a second, over Easy's band before the cover adds a key; the line has
  one anchor every two bars (the odd bar's plays as a main note, `halsted.py`), the blues melody
  patch (Easy tier 2, a chorus-long phrase, tier 2 `space: 0`) and Medium named tier 4 (tier 5,
  the default, is 1.93, the riff in full). Easy is 0.65, over the band: a chorus of this riff
  over A7, D7 and E7 has nine to thirteen keys and the cover keeps each, so a chorus can't go
  under about 0.6; it is a note a bar, which is what Easy reads like at 120. Beginner (0.18) is
  3.6 times under it, over the "twice" rule, as on Friars Point; it is cut from Easy's chart
  (`fromAbove`) and Easy's cover spends the chorus on keys, not anchors. To hear.

## 3. Chords (the comping)

The comping is written as chord hits with a weight per hit (**1** the downbeat hits the form
stands on, **2** the groove hits, the 3 or the and-of-2, **3** the pushes) and a role per note
(`root, third, fifth, seventh, sixth, ninth`). Levels cut both the rhythm (which hits) and the
voicing (how many notes, in that role order), one thing at a time.

| Level | What you play | Onsets / s target | Slow Burn | Boogie Shoes | Pearl Street | Blue Lantern | Dockery | Friars Point | Halsted |
|---|---|---|---|---|---|---|---|---|---|
| Beginner | One note a chord, the root, on the downbeat hits only, with room (2.4 s). Learn the changes. | 0.2 – 0.4 | 0.38 | 0.25 | 0.23 | 0.35 | 0.31 | 0.24 | 0.30 |
| Easy | Two-note chords (root + third). Slow Burn: the shell on the 1 and the 3 (tier 2, since 0.1 (63)); the others: the groove hits (tier 3). The Delta tracks: the chick after the 1 and the 3, on the off beat (Dockery tier 2). | 0.6 – 1.0 | 0.74 (was 1.11) | 0.99 | 0.87 | 0.99 | 0.76 | 0.96 | 0.60 (tier 2: the root and third on the 1) |
| Medium | Three-note chords on the groove. Same rhythm as Easy, the triad. Dockery: the three-note chick on every off beat. | 0.9 – 1.2 | 1.11 | 0.99 | 0.87 | 0.99 | 1.38 | 0.96 | 1.14 (tier 4: the triad on every beat) |
| Hard | The comping as the record plays it: four-note voicings, every push. The Delta tracks: the thumb and every chick. | the record | 1.84 | 1.31 | 1.55 | 1.10 | 2.82 | 3.68 | 4.35 (four notes on every beat and its eighth) |
| Adaptive | Rungs: root alone → two-note spread → two-note on the groove → triad → + pushes → four notes → the record. | | 0.38 · 0.74 · 1.11 · 1.11 · 1.11 · 1.11 · 1.84 | 0.25 · 0.50 · 0.99 · 0.99 · 1.00 · 1.30 · 1.31 | 0.23 · 0.47 · 0.87 · 0.87 · 0.87 · 0.87 · 1.55 | 0.35 · 0.35 · 0.99 · 0.99 · 0.99 · 0.99 · 1.10 | 0.31 · 0.76 · 1.38 · 1.38 · 1.54 · 1.54 · 2.82 | 0.24 · 0.52 · 0.96 · 0.96 · 1.84 · 1.91 · 3.68 | 0.30 · 0.60 · 1.14 · 1.14 · 2.21 · 2.21 · 4.35 |

Notes from play:

- Easy and Medium share a rhythm by design (the step from Easy to Medium is the chord size, from
  Medium to Hard the rhythm). Slow Burn's rungs 3–6 all read 1.11: the pushes only arrive at the
  record. If a blues comping wants a middle step, write weight-2 hits on the and-of-4 pushes and
  keep weight 3 for the turnaround fills.
- The left hand plays the lower two notes, the right the melody, in the Stage's finger badges
  (the pinky low, as the lessons comp).
- 2026-10-31, Slow Burn chords Easy: "remove (almost) half of the chords to make it feel almost
  half as hard". Easy played the 1, the 3 and the 4 of every bar (three two-note chords a bar,
  1.11 a second); it is tier 2 now for both Slow Burn songs (`"chords": {"easy": 2}`): the
  shell on the 1 and the 3, two a bar, 0.74 a second, a third fewer. The ladder has no rung
  between that and the 1 alone (0.38, Beginner's rhythm with two notes), so "half" would mean
  the 1 alone; to hear which Bart means.
- 2026-11-01, the Delta thumbs (0.1 (73); superseded by the chick-first weights of 2026-11-02 below): a thumb part is a note a beat, so its ladder is the 1
  alone → the 1 and the 3 → every beat → every beat with the chick (the chick sits 0.21 s before
  the next thumb at 96, so only the record's tier takes it). Dockery Medium is 1.54 a second,
  over the 0.9–1.2 band, because the rung under it (0.79) is Easy; a Delta thumb has no rung
  between "half the beats" and "every beat". Friars Point's boogie walks root, fifth, sixth,
  seventh a note a beat with the chick on every late eighth: 0.24 · 0.48 · 0.96 (Easy, the 1
  and the 3) · 0.96 (Medium) · 1.91 · 1.91 · 3.68, every step at most double.
- 2026-11-02, chords on the Delta tracks. Bart: on Easy "i'm not seeing traditional
  chords, instead i see bass notes"; he wants to practice the chords, two-note on Easy, and
  "playing on the off beats is fine". The chart's weights now put the chick first (after the 1
  and the 3 = 1, after the 2 and the 4 = 2) and the thumb last (3, the record's tier only); the
  record is untouched (velocities and the bass are read from the old weights before the swap,
  the band channels are byte-identical). Easy is the root and the third on the "and" of 1 and 3:
  Dockery 0.76, Friars Point 0.96; Medium the three-note chick (Dockery four a bar, 1.38, over the
  0.9–1.2 band; Friars Point two a bar, 0.96). The stop-time bars and Friars Point's turnaround
  have no chick, so below the record they rest (the thumb alone there is the record's).
- Blue Lantern's Rhodes comps the 1, the "and" of 2 and the 4 (weight 2), with the push on the
  last sixteenth (3): Easy to Hard keep the one rhythm until the record, so the ladder reads
  0.99 four times; Beginner and the second rung are both one chord a bar (0.35). Pearl Street's
  stab-and-chank (the 1, the "a" of 2, the 3) does the same at 0.87. If the comping ladders
  want a rhythm step, the sheet's note above applies to these two as well.
- 2026-11-07, Halsted's piano comps four notes on every beat and its shuffle eighth (the 1 at
  weight 1, the other beats 2, the eighths 3): the default Easy (tier 3) was 1.14, so the song
  names tier 2, the root and third on the 1, 0.60; Medium is the triad on every beat (1.14),
  Hard the record (4.35, 17 notes a second: a boogie piano). Every step at most double.

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

## 5. The four tracks, as a producer hears them

- **Slow Burn**, G, 90, 12/8. The slow one: snare in from bar 1, the sax head with its grace
  notes the second and fourth time, a sax solo on the ride, a stop. The piano comps the 1 and
  the 3 with triplet pushes.
- **Boogie Shoes**, C, 120, shuffle. The jump: walking bass R 3 5 6 / b7 6 5 3, chanks on 2 and
  4, a riff you hum; shout chorus an octave up, a piano solo chorus, fills, a stop.
- **Pearl Street**, E, 112, heavy shuffle. Texas: the boogie bass doubling every beat, kick on 1
  and 3 with the shuffle push, the snare fat; quick four in bar 2; chorus 3 is **stop time** (the
  band hits the 1 and lays out for eight bars while the sax talks, a fill back in), then the sax
  solo on the ride and an out chorus with the bell. Piano: stab the 1, chank the "a" of 2 and
  the 3. Sax line in E minor pentatonic with the blue B♭.
- **Blue Lantern**, D minor, 84, straight eighths. The moody one: a sixteenth hat with an open
  hat into the 1 every other bar, kick on the 1 and the "and" of 3, the bass on the root with the
  seventh and the fifth answering; Dm7 / Gm7 / B♭7 A7; a Rhodes instead of the piano, long sax
  tones (the melody's Hard is only 0.97 a second: it is a slow line, by design). Sax solo on the
  ride, out chorus, the last Dm held.
- **Blue Lantern II** and **Maxwell Street II** (2026-11-04, the map's Level 1 and Level 2
  songs): the same records with the melody on a level's notes only, the white keys and A C D E
  G (`--white`, `--five`; GOALS.md §2). Maxwell Street II's melody ladder charts the original's
  figures within 0.04 a second (0.26 · 0.65 · 0.85 · 1.01 · 1.01 · 1.30 · 1.30); the plan asks
  for an A on Medium. Blue Lantern II has had a line of its own since 0.1 (107), 2026-11-05: one
  riff in one hand, a held note between (Bart found the sax line's Medium, 120 notes, too hard,
  and asked for simpler patterns that repeat more often), and since 0.1 (109), 2026-11-06, a
  rung above it: 0.35 · 0.38 · 0.38 · 0.53 · 0.53 · 0.63 · 0.88 a second (48 · 52 · 52 · 72 ·
  72 · 86 · 120 notes): the anchors, then the riff (Easy+), then the riff with three hand-move
  figures (Medium, tier 6 by the song's own naming), then with its passing note and pickups too.
- **Halsted**, A, 148, Chicago boogie. The loud one with a band: the electric guitar (Emilyguitar
  through the channel amp) alone on the riff for two bars, then the band; the riff doubled a fifth
  up on the record in the heads; a rolling boogie piano with a triplet solo chorus; a verse of
  held notes and answers; stop time with blues-scale runs; a guitar solo of rakes and hammered
  figures on the ride; one big stop. Your keys play the piano on both parts.

## 6. Open

- **Boogie Shoes melody Easy at 0.64** is still over the band after the re-weighting (§2 notes);
  Medium at 1.57 is a wide step up. Play it; the next lever is dropping the cover for the riff's
  passing keys (a `phrase` of 24) or marking the C5 of the riff weight 3.
- The chords' Easy → Medium step is voicing only on all four tracks; whether a blues wants a
  rhythm step between them is Bart's call after playing a chords part on both.
