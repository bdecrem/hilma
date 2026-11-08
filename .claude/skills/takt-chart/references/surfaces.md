# The surfaces: where playable material lives, how it is written, how it is checked

| surface | source | the app reads | check | registered where |
|---|---|---|---|---|
| Stage song part (chords, melody) | `apps/takt/scripts/songs/<name>.py` → `Takt/Content/song-<name>.json` | `Game/Song.swift`, `Game/Charting.swift` (the ladder from `Content/charting.json`), `Game/Fingering.swift` | `scripts/takt/measure.ts <song>`, `-LessonCheck 1`, `charting-check.ts` | `Song.catalog`, `charting.json` `songs`, `LessonCheck.swift` melody list, BLUES.md tables, `library.ts` |
| Level version of a song | the same script with a flag (`--white`, `--five`), `from` tiers on figures | the same | `measure.ts <song> --level N --scale <pcs>` (every note on the level's notes, all of them at the goal tier, the hand budget) | the plan's `song` item; the `-LessonCheck` plan-goal check |
| Lesson step (`play`) | `Content/lesson-<code>.json` (A1, S1, S1m, M, H by hand; S1/S1m 7–13 by `scripts/scales-extend.py`, H by `chord-shapes.py`) | `Lesson/Lesson.swift` (`expected`), `LessonEngine`, `Scorer` | `measure.ts --step <file>:<id> [--level N]`, `-LessonCheck` content cases | the module's `lessons[]` row (and its `theme`), the plan's `step` item |
| Jam / free step (improv) | the same files, `kind: free`, `scripts/improv-jams.py` (idempotent) | `Improv.Recorder`, the free-step judge | `-LessonCheck`, `improv-check.ts` | the module's `jams[]` row; a plan `jam` / `improv` item |
| Plan goal | `Content/plan-blues-year-1.json` | `Goals/LearningPlan.swift` | `-LessonCheck` (every goal names a real step; Level 1's song against its hand budget) | GOALS.md §2; `LearningPlan.moved` when a goal moves level |
| The improv teacher's idea | `src/lib/takt/improv-agent.ts` (`checkIdea`: one hand position, a seventh at most) | the app plays it as a `jam` step | `scripts/takt/improv-check.ts` | IMPROV.md |
| The whole track (Solo) | `src/lib/takt/solo-agent.ts` (`rulesFor`: the level's solo budget and the home position; `checkSolo`: the hand, the changes, density) | a `takt_mods` row of kind `solo`, the Solo level | `scripts/takt/solo-check.ts` (`SKIP_LIVE=1` for the pure checks); `measure.ts --notes <bundle> --tempo N --level N --solo` | IMPROV.md "The whole track" |
| Agent mode (mods) | `src/lib/takt/mod-agent.ts` (rule 8: the hand axis), `mod-tools.ts` (`set_levels`, `set_weights`, `write_notes`, `measure`) | a `takt_mods` row, `Charting.overriding` | `scripts/takt/mod-agent-check.ts` | — |
| Reading | `Content/reading-R.json` (notation a bar a string: `"C4/q E4/q G4/h"`, `r/h`, `/n` a finger) | `Game/Reading.swift` | `-LessonCheck` | the module's lessons |
| The budgets themselves | `LEVELING.md` §2 → `src/lib/takt/leveling.ts` (`handBudget`) → `Game/Fingering.swift` (`Budget.of`) → `LessonCheck.swift` | — | `-LessonCheck` "hand:" cases, `solo-check.ts` | in that order, always |

## A Stage part: the file and the ladder

A part note (`pnote(notes, t, n, len, lv, finger, role, tier)` in `common.py`): `t` the tick in
the song (12 a beat, 48 a bar), `n` MIDI, `len` ticks, `lv` the weight (1 the hits the part
stands on, 2 the groove and the answers, 3 pushes and ornaments), `r` the role (chord notes),
`f` a finger (melody fingers are ignored by the Stage, which fingers each tier's own line),
`from` the lowest tier the note is on at all (figures whose keys must not leak down).

The ladder (`charting.json`, CHARTING.md): seven tiers a part, each the one below plus more,
knobs `notes` (chord size by `keep` order), `hits` (heaviest weight played), `gap` (seconds
between onsets), `space` (seconds of silence before a lighter hit is borrowed; 0 never),
`phrase` (bars over which every key the line plays is kept), `minBeats` and `fromAbove` on
Beginner. Named tiers: chords Beginner 1 / Easy 3 / Easy+ 4 / Medium 4 / Hard 7; melody 1 / 3 /
4 / 5 / 7. A song overrides per part in `songs.<name>.<part>`: `"easy": 2`, `"medium": 6`,
`"phrase": 12`, `"tiers": {"2": {"space": 0}}`; the patched ladder must still loosen going up.
The blues melody patch every blues track carries: `{"easy": 2, "phrase": 12, "tiers": {"2":
{"space": 0}}}` (Easy = the anchors and the keys they miss over a chorus, no borrowing).

The figures: `measure.ts <song>` prints `L1 (beginner): 0.35/s [0.4–0.4], 48 notes, hand
0/0 · 1 · 10 — The tune's anchors…` per tier; `-LessonCheck` prints the same lines
(`onsets/s by level`, `hand (moves/moments · positions · span) by level`). Every tier's chart
comes from `-ChartDump <song>/<part>` (tick, bar.beat, key, length, weight, `f=`, `from=`),
every song's from `-DumpCharts <file>` (what `charting-check.ts` compares the TS port against).

The hand (LEVELING.md §1): a **position** is where the thumb lies (a note under finger f puts
the thumb f − 1 white keys under it; a position spans up to two thumb keys, so a stretch is no
move); a **move** is a note that takes the thumb outside that span, or a thumb-under going up,
or a finger over the thumb coming down; a **moment** groups moves within two bars; **span** is
semitones. Blue Lantern II's riff and landings: 0 moves, 1 position, 10 semitones; its Medium
figures: 6 moves in 3 moments, 3 positions, 13. A line is written for the hand by naming the
home position (the five or six scale keys under the fingers, the thumb's key) and keeping the
whole piece inside it plus a step either side; the figures are the interest and each comes
straight back.

Writing a line for a hand budget, what Maxwell Street II taught (2026-11-08, 30/9 · 5 · 24 →
4/3 · 2 · 22): put the line in **boxes**, the scale's five or six keys under the five fingers
(thumb on A3 for A C D E G, thumb on A4 for the octave up), and let whole sections live in one
box; move between boxes only at a chorus boundary or a turnaround, and bring the hand home onto
the box's **thumb key** after a long note. The planner adds moves you did not write: a climb that
ends under finger 4 (… E G | A) tucks onto the G and settles a bar later (two moves), so end a
climb on a note the thumb tucks from straight onto the next box's thumb key; coming down within a
beat onto a note mid-box puts the thumb there (inside a beat the hand may not jump onto a high
finger), two moves again. Medium's `space` (1.2 s) borrows a Hard-only push back after any note
held longer, so put Hard-only pushes inside a beat of a main note, never after a long one. Read
the moves bar by bar (`measure.ts` prints them) and fix the line where the planner moved, not
the fingers.

Level songs: the plan's `song` item names `song`, `part`, `difficulty`, `grade` (Blue Lantern II
melody Medium A for Level 1; Maxwell Street II melody Medium A for Level 2). `measure.ts
<song> --level N --scale <pcs> --difficulty medium` is the whole judgement: every note on the
level's notes, all of them at the goal tier, the hand budget, the density band. The generator
asserts the scale too (`assert all(e["n"] % 12 in (...) for e in melody)`), and the original
song regenerates byte-identical from the same script.

## A lesson step

```json
{"id": "penta2-rh", "kind": "play", "title": "Two octaves, right hand", "skill": "rh.penta.two.S1m",
 "tempo": 72, "gate": 2, "cycle": 4, "hand": "right", "key": "A minor pentatonic", "feel": "straight",
 "pattern": [{"bar": 0, "beat": 1, "tick": 0, "semitones": 0, "finger": 1}, …],
 "about": "…what to do, the fingering in words, where to start the knob…",
 "coach": {"intro": "…", "change": "…", "hold": "…", "clean": "Clean. {left} more.", "again": "{problem} Again.",
           "join": "From the top.", "slow": "Clean at {tempo}. It counts at {gateTempo}.", "passed": "…"},
 "band": ["drums"]}
```

- A pattern note: `bar` (inside the `cycle`), `beat` 1–4, `tick` 0–11 inside the beat (6 = a
  straight eighth, 8 = the shuffle's late eighth), `semitones` from the bar's chord root (or a
  `tone`: root, third, fifth…, or a `note` MIDI key), `finger` 1–5, optionally `chord` (plays
  only in that chord's bars). The key the player sees is `displayRoot + root + semitones`
  (A minor: 48 + 9 + 0 = A3). A step may carry its own `form`, `chords` (`{"Em": {"numeral":
  "i", "root": 4}}`) and `transpose`; `flats: true` spells E♭ / B♭.
- `cycle` is the bars the pattern repeats over (a 4-bar cycle at 4 beats: three bars of notes
  and one of hold is how the scales breathe); the run is the judged unit when every cycle
  expects the same notes; `gate` the clean runs to pass; `tempo` what it counts at (a goal's
  `start` is where the knob begins).
- `kind: free` (a jam / improv): no scoring of a pattern; `scale` (pitch classes from the root
  of the first chord), `minNotes` (8), `backing` (a Stage song's band, looped by the form),
  `band` (the channels that play), the old riff kept as `pattern` for the intro and Show me.
- The module's `lessons[]` row: `{"title", "skill", "goal": "2 clean runs at 72", "steps":
  ["id"], "theme": {"glyph": "tuck"|"over"|"hill"|"steps"|"fall"|"keys:135"|"rock"|"walk"|
  "form"|"alone"|"tempo"|"blue"|"bars:13"|"hand", "title", "line"}}`; a `jams[]` row: `{"after":
  <lesson number>, "title", "skill", "goal", "step", "theme"}`. New lessons are appended after
  the module's last, so no one's record of lessons done moves.
- The rules (CURRICULUM.md): one new thing a lesson (a scale or a key or a hand or a rhythm);
  one note a beat at 60 before eighths at 72; the written fingering is the taught one and the
  `about` says it ("thumb under after the middle finger"); the level screen prints the fingering
  line from the pattern itself (`Lesson.fingerLine`); eighths want `feel: straight`; Level 1–2
  material is one hand; a jam's riff sits in one position at Levels 1–2.
- Check: `measure.ts --step <file>:<id> --level N [--scale pcs]` (the hand by the written
  fingers, the keys, the budget; a drill's density is its own), then a build and `-LessonCheck`
  (the content cases load every module, trap on bad content), then the step in the simulator
  (`-Module S1m -Step <n>`).

## The teacher's material

- **The idea** (`improv-agent.ts` `checkIdea`): 1, 2 or 4 bars dividing the form, 3–16 notes on
  the 12-a-beat grid, inside the take's range plus a seventh, on the scale, at most two notes at
  once, and one hand position (no move, a seventh at most) fingered by `fingering.ts`; the
  app shows the planner's fingers.
- **The whole track** (`solo-agent.ts`): `rulesFor(request)` takes the level from
  `context.level` (the map level the improv is a goal of; 1 for a jam), `handBudget(level,
  true)` and `homePosition(take notes, scale, level <= 1 ? 5 : 6)`; the range is the home
  position and a step either side at Levels 1–2; `checkSolo` fingers the solo and sends the
  model back the bars of every move when over budget. The fixture of the bad one:
  `scripts/takt/fixtures/solo-blue-lantern-2026-11-07.json` (10 moves in 7 moments over 15
  semitones; `measure.ts --notes <it> --tempo 84 --level 1 --solo` fails it).
- **Agent mode** (`mod-agent.ts` rule 8, `mod-tools.ts`): every melody tier's line carries its
  hand figures in `read_song` / `measure`; "a Level 1 version" means one position; "harder"
  never means "moves more" unless asked.

## Parity: the server measures what the app plays

`src/lib/takt/charting.ts` is `Charting.swift` line for line (`scripts/takt/charting-check.ts`
against the app's `-DumpCharts`), `fingering.ts` is `Fingering.swift` (the same figures on
every song, checked in `solo-check.ts` and `-LessonCheck`), `leveling.ts`'s budgets are
`Fingering.Budget`. Change one, change the other, run both checks. A number moves in
LEVELING.md first.
