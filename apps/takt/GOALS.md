# Learning goals: the plan, the map, and what it takes to pass Levels 1–3

Written 2026-11-03. Bart: "we are making a LEARNING GOALS thing. for now, for me, it's the .md.
LATER, we'll have an agentic system that allows students to set their own learning goals. set up
my goals plumbing in such a way that LATER different users can have different goals; then write
all the tech/features that need to be built to support that, including tweaks to our learning
content, and the goal checkpoint in the MAP tab." The plan is `misc/takt-12-month-plan.md`:
24 chapters of two weeks, each a **level** on the map until 2026-11-04, when chapter 1 became
levels 1–3 (§2). **The rule since then: a level is 2–3 goals and about a week of practice**, so
the plan heads for ~50 levels (the map has room for 50); the chapters after 1 still sit one to a
level, numbered 4–26, until they are cut the same way. "Any lesson + any song" is
gone. Anything the app can test is scored by the app, at 100%. The plan's "every session"
line (10 min scales, 20 min jam, 15 min the chapter's thing) stays advice in the .md; the app
builds no session.

## 1. The plumbing (built)

**A plan is a document.** `Takt/Content/plan-<id>.json` → `Goals/LearningPlan.swift`:

```
{ id, title, source, about,
  levels: [ { n, quarter, title, text, items: [ item… ] } ] }
item = { id, kind: "step" | "jam" | "song" | "improv", title, detail,
         module?, step?, tempo?, start?, choruses?,      (step, jam, improv)
         minNotes?, inScale?,                            (improv)
         song?, part?, difficulty?, grade? }             (song)
```

- `levels[n-1]` is level n of the map. The map's venues are a separate document
  (`map-blues.json`); the two line up by number, and a check says they have the same count.
- An item is a goal the engine scores. `module` is a module's entry code (`S1m`, `M`:
  `AppModel.module(_:)` loads the file), `step` a step id in it.
  - `step`: a `play` step. Done by **one chorus with every expected note hit and nothing
    extra** (stricter than the lesson's "clean": ≥ 90 %, ≤ 2 extras) at `tempo` or faster.
    Every 100 % chorus at any tempo records its tempo (`best`); the ladder suggests
    `start` (60), then `best + 4`, capped at `tempo`. The lesson step itself still counts
    "clean at its own tempo" for the module; the two rules sit side by side.
  - `jam`: a `free` step (new step kind, below). Done by `choruses` choruses played entirely
    inside the step's scale.
  - `song` (2026-11-04): a Stage song (`Song.catalog`) played to the end on `part` at
    `difficulty` (a fixed level, never adaptive) with `grade` or better. The grade is the
    Stage's own (`GameEngine.Result.grade(accuracy:)`; `Result.floor(of:)` turns "A" into 0.9),
    so an A on the result card is the goal done. Every such run keeps its accuracy (`best`, in
    percent). Practice never ends a run, a mod is another song, so neither counts.
  - `improv` (2026-11-04, **`IMPROV.md`**): a take on an improv step the teacher reviewed, with
    `choruses` whole choruses, `minNotes` notes and `inScale` of them on the step's notes.
- A level clears when every item is done. A level with no items can't clear, so the road
  stops at the first level whose goals aren't written. Levels 4–26 have none yet.

**Whose plan.** `LearningPlan.active(for: userId)` is the one seam: today it returns the
bundled default (`blues-year-1`, Bart's year) for everyone, guests included. A player's own
plan later is another document with its own id, and `active` picks it. Nothing else reads a
plan by name.

**Progress.** `ProgressStore.Snapshot.goals: [key: GoalRecord]`, key =
`"<plan id>·<level>·<item id>"`, record = `{ done: "2026-11-03"?, best: Int, choruses: Int }`.
Synced with the account like the rest of the snapshot; merged as earliest `done`, max of the
numbers (`GoalRecord.merge`). `Snapshot.mapCleared` and `MapProgress` (the pairs rule) are gone.
`GoalProgress` (plan × records) is what the screens read: `cleared`, `done`, `status`,
`suggestedTempo`, `action`.

**Moving a goal.** A key carries the level, so a goal that moves to another level needs its
old key mapped: `LearningPlan.moved` (old key → new key), applied by `LearningPlan.migrated` to
every snapshot decoded (the file, an account's pull), merging into a record already at the new
key. An older build that writes the old key again is moved on the next pull.

**Scoring.** Every judged chorus already reaches `Player.wire()` as a `LessonEngine.Verdict`;
it now carries the step's id, and `Player.onGoalChorus` hands it to
`AppModel.goalJudged(module:verdict:)`, which finds the plan's items on that step and records.
Every Stage run played to the end goes through `Player.onGameRun` to `AppModel.goalRun`, which
finds the song items on that song, part and level. Headless and autoplay runs
(`ProgressStore.readOnly`) record nothing.

**The free step** (`Lesson.Kind.free`): no pattern, a `scale` (semitones from the root of the
step's first chord) and `minNotes` (8). The engine judges a chorus by itself (the Scorer has
nothing to match): every press's pitch class in the scale, enough of them → counts; a note
outside is named ("F isn't in the scale. Keep going."). Play mode like a jam: never passes, the
band plays on, a counted chorus marks the jam row done. `Verdict.free` carries the counts.

**The map** (`Menu/MapScreen.swift`): 26 stops, three episodes; the last six venues are
placeholders (`"placeholder": true`, an empty dashed box "Level 21 · Venue to come", the pill
says "Level 21"). The orange stop, its pill and its card open **`Menu/LevelGoalsScreen.swift`**:
"Level 1 · Dockery Farms", the plan's title and line, the quarter, then one row per goal (a
mark, the title, the detail, the status line, a button) and the plan's `about`. "Play at 68"
opens that step from its intro with the knob on 68 (`Player.start(stepId:tempo:)`); the step
still counts at 72. A song goal's "Play the song" opens the song on the Stage on its part and
level; Back, Esc and the result card's "Map" come back to the level. The Stage's knob can slow
the song to learn it (0.1 (103)), the way the lesson's can; a run under full speed is practice
and does not clear the goal, as a slow run of a step does not count. A cleared stop opens the
venue's story as before. The header reads `cleared / 26`.

DEBUG: `-Route map -Venue 1` opens level 1's goals (a level past the one up next needs
`-MapCleared n` too, which overrides the count); `-Goal <id>` starts that goal as its button
does, `-Back 1` leaves it again.
Checks (`-LessonCheck`): the plan loads and every goal names a real step; the ladder; the
store's `goalChorus` / `goalJam`; merge; an old snapshot; the free jam counts, names an F,
refuses three notes, takes any octave; the two-octave pentatonic's 63 notes, ticks and fingers;
one stop per plan level; placeholders.

## 2. Levels 1–3: what Bart has to do, and what the app does

Chapter 1 of the plan ("A minor pentatonic, both hands. 12-bar minor blues (Am–Dm–Em). Jam with 5
notes only.") was one level of five goals until 2026-11-04, when Bart cut it into three (his spec,
verbatim in the session): two short technical levels, then the first one with the band. The
blues scale (old level 2) is level 4, and every level after moved down two. Every goal keeps the
pass rule of §1; the ladder suggests 60, then best + 4.

**Level 1 · White keys.** Pure technique: the same fingering twice, then a song on those notes.

| Goal | Where | Pass |
|---|---|---|
| C major, up and down | Scales (C major, `lesson-S1`) → lesson 14, step `major2-rh` | one 100 % run at ≥ 72 (eighths, 29 notes: two octaves up and back) |
| A natural minor, up and down | Scales (A minor, `lesson-S1m`) → lesson 15 "A minor in eighths", step `minor2-rh` (new) | the same from A3: A B C D E F G, 29 notes, C major's fingering |
| Blue Lantern on the white keys | Stage, `song-blue-lantern-white` ("Blue Lantern II", new), melody, Medium | an A (90 %) on a run to the end |
| Improvise on the white keys | Scales (A minor) → jam after lesson 15, step `improv-white`: Blue Lantern II's band (IMPROV.md) | a reviewed take of 2 choruses, 16 notes, 90 % on the white keys |

**Level 2 · Five notes.** The pentatonic shape, each hand on its own.

| Goal | Where | Pass |
|---|---|---|
| Pentatonic, two octaves, right hand | Scales (A minor) → lesson 14, step `penta2-rh` | one 100 % run at ≥ 72 (eighths, 21 notes) |
| Pentatonic, two octaves, left hand | step `penta2-lh` | the same, from A2 |
| Maxwell Street on five notes | Stage, `song-maxwell-street-five` ("Maxwell Street II", new), melody, Medium | an A (90 %) on a run to the end |
| Improvise on five notes | Scales (A minor) → jam after lesson 14, step `improv-five`: Maxwell Street II's band | a reviewed take of 2 choruses, 16 notes, 90 % on A C D E G |

**Level 3 · The minor blues.** The chords, then the form, then improvising over it.

| Goal | Where | Pass |
|---|---|---|
| Three chords | Minor Chords → lesson 14 "Three chords", step `changes` (new) | one 100 % chorus at ≥ 60: Am, Dm, Em a bar each over the drums, every change of the four |
| The 12-bar minor blues | Minor Chords → lesson 1 "A minor", step `key-1` | one 100 % chorus at ≥ 70 (the triad on the 1, every change) |
| Jam with five notes | Minor Chords → "Five notes", step `jam-five` (`free`) | 3 choruses with only A C D E G, 8 notes or more each |

**The songs.** The spec asked first whether an existing chart fits. Two do on paper:
Hypnotist's melody is A C E G and Hypnotist II's is A C D E, both inside both levels' notes.
Neither was taken: they use three or four of the level's notes, and they are techno at 127.
Instead, two blues tracks at a walking tempo got a second melody chart on exactly the level's
notes, as a separate song beside the original, the way Hypnotist II sits beside Hypnotist
(`--white` and `--five` on their scripts; the originals regenerate byte-identical):

- **Blue Lantern II** (minor blues in D, 84, `blue_lantern.py --white`): the same record with
  a line of its own, one riff in one hand (since 0.1 (107), 2026-11-05; until then the sax line
  on white keys only, 120 notes at Medium, which Bart found too hard). Every odd bar is the riff
  bar, D5 on the 1 held and F4 on the "and" of 3 with the kick; every even bar holds one note
  on the 1 that follows the chord: A over the Dm7 (C the second time), G over the Gm7, E then B
  over the turnaround's A7s, back to D. The hand never moves: the thumb on F reaching down to
  E, 2 on G and A, 3 on B, 4 on C, 5 on D. Medium is exactly that, 72 notes, 0.53 a second, and
  still all seven white keys; Hard adds the passing C between the D and the F and, in the solo
  chorus, two pickup eighths into every riff (108).
- **Maxwell Street II** (Chicago blues in A, 80, `maxwell_street.py --five`): the horn on
  A C D E G. The riff walks up A C D E without the flat fifth, and the bass plays it in unison
  with the horn. The release's riff shapes become E G A and D E G A, and the solo's chromatic
  steps go. Medium plays all five notes, 145 notes, 1.01 a second (the original's figure).

The record plays the new line on the horns channel, so it sounds the way the player is asked
to play it. Both sit first under All tracks. A check proves each level's song at its goal's
part and level uses only the level's notes, and all of them.

**Moved records.** Bart's own: the C major scale (done, 74) stays on level 1; the pentatonic
right hand (done, 75) moves to level 2 (`LearningPlan.moved`).

**Content added on 2026-11-03 for the old level 1:** `lesson-S1m.json` lesson 14 "Pentatonic, two octaves" (two steps at 72, gate
2, cycle 4, eighths on the beat and tick 6, RH 1 2 3 1 2 3 1 2 3 4 5 and back, LH 5 4 3 2 1 3 2 1
3 2 1 and back, over the drums); `lesson-M.json` the `jam-five` step and its jam row under lesson
1 (the whole minor band at 70). **On 2026-11-04:** `lesson-S1m.json` lesson 15 (`minor2-rh`, C
major's `major2-rh` from A), `lesson-M.json` lesson 14 (`changes`: a 12-bar form of its own, Am
Dm Am Em / Dm Am Em Dm / Am Em Dm Am, a new chord every bar, the triad on the 1 with 5 3 1 as in
`key-1`, the drums alone, 60). Both are appended after the modules' last lessons, so no one's
record of lessons done moves.

**The run is the unit (2026-11-04, from Bart's first C major session):** the engine judged the
12-bar chorus (three runs), so one weak run sank two good ones every time: his lesson log
(`Documents/lesson-log.txt` in the app's container, every press and verdict) showed 8 of his last
13 runs with every note inside the window and 0 of 5 choruses. A play step with a `cycle` whose
every cycle expects the same notes is now judged run by run (`LessonEngine.loopTicks` is the
cycle, `expected` one run; `chorusTicks` keeps the form): a verdict, "Clean. One more.", the gate
and a goal's 100 % all go per run. Replayed through the engine (`-ReplayLog`, DebugHooks), that
session reads 15 runs judged, 9 clean, 1 at 100 % with nothing extra. The rest of the extras
were the hand landing on the first note (two to four neighbors within 110 ms of the C) and a B3
brushed after the thumb-under; whether those are whispers the player never hears is a velocity
question, so presses and extras now log their velocity, and the window and the extras rule stay
as they are until that data is in.

**The feel (2026-11-04):** the eighth-note steps were straight against the shuffle drums (hat,
ride and bass on ticks 0 and 8 of 12; the runs on tick 6, between the hits), which read as "out
of sync with the music". A step in straight eighths now gets the band on the straight grid:
`Lesson.Step.straight` (the `feel` key, or derived from a pattern note off the 0/8 grid),
`BandData.straightened()` (every tick-8 hit and note to tick 6), `AudioEngine.load(band:straight:)`,
`Player.loadBand`. One note a beat and the jams (tick-8 riffs) keep the shuffle. "Show me
first" on the free jam plays nothing (no pattern).

## 3. What's left to build

In the order it's needed.

1. **Levels 4–26's goals**, cut to 2–3 goals and about a week each (so more levels). Most want
   content: the blues scale two octaves, call-and-response (a `free` step that scores only the
   answer bars), root + 7th in the left hand (level 4); "land on a chord tone on beat 1" (a free
   step with a per-bar rule: level 5); Dorian over Am7–Dm7–E7 (a band, level 6); and so on.
   Levels 8, 14, 20, 26 are checkpoints: record something. That needs:
2. **A `record` item kind:** a free jam over a track that keeps the take (the payoff already
   records a chorus and exports MIDI: `Export/MIDIFile.swift`); done when a take is saved.
   And a `check` kind: a self-ticked item ("transcribe two phrases", "write a 12-bar") for
   what MIDI can't see, until the agent can.
3. **Measured scale evenness.** 100 % hit inside ±100 ms is the gate now; the plan's "clean and
   even" wants a timing-spread cap (the Scorer has the offsets: `ChorusResult.offsets`) and no
   velocity jump at the crossing. One number in the item (`spreadMs`), one line in `goalJudged`.
4. **Per-user plans on the server.** `takt_plans (id, user_id, plan jsonb, active bool,
   created_at)`, `GET/PUT /api/takt/plan`, the app's `LearningPlan.active(for:)` reading the
   account's active plan after sign-in (the `ModStore` shape: pull after the account is known,
   bundled default until then). Goals are already keyed by plan id, so a player's records for
   two plans never collide.
5. **The agent that writes a plan.** The mod agent's loop (`src/lib/takt/mod-agent.ts`) with
   plan tools: read the catalog of steps (every module's steps with tempo, key, kind), write a
   plan (validated like `LearningPlan.validate`), set a level's items, and the player's goals
   in their words as the prompt. The charter's rule applies: a goal names a real step or it is
   refused.
6. **Today card.** One line from the plan: the next goal and its tempo ("Pentatonic, right
   hand, at 68"). No session, no timers.
7. **The Chicago venues** for levels 21–26 (photos, stories, credits), replacing the
   placeholders; more venues as the plan grows toward 50 levels.
