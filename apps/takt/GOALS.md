# Learning goals: the plan, the map, and what it takes to pass Level 1

Written 2026-11-03. Bart: "we are making a LEARNING GOALS thing. for now, for me, it's the .md.
LATER, we'll have an agentic system that allows students to set their own learning goals. set up
my goals plumbing in such a way that LATER different users can have different goals; then write
all the tech/features that need to be built to support that, including tweaks to our learning
content, and the goal checkpoint in the MAP tab." The plan is `misc/takt-12-month-plan.md`,
unchanged: 24 chapters of two weeks, each now a **level** on the map. "Any lesson + any song" is
gone. Anything the app can test is scored by the app, at 100%. The plan's "every session"
line (10 min scales, 20 min jam, 15 min the chapter's thing) stays advice in the .md; the app
builds no session.

## 1. The plumbing (built)

**A plan is a document.** `Takt/Content/plan-<id>.json` → `Goals/LearningPlan.swift`:

```
{ id, title, source, about,
  levels: [ { n, quarter, title, text, items: [ item… ] } ] }
item = { id, kind: "step" | "jam", title, detail, module, step, tempo?, start?, choruses? }
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
- A level clears when every item is done. A level with no items can't clear, so the road
  stops at the first level whose goals aren't written. Levels 2–24 have none yet.

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

**Scoring.** Every judged chorus already reaches `Player.wire()` as a `LessonEngine.Verdict`;
it now carries the step's id, and `Player.onGoalChorus` hands it to
`AppModel.goalJudged(module:verdict:)`, which finds the plan's items on that step and records.
Headless and autoplay runs (`ProgressStore.readOnly`) record nothing.

**The free step** (`Lesson.Kind.free`): no pattern, a `scale` (semitones from the root of the
step's first chord) and `minNotes` (8). The engine judges a chorus by itself (the Scorer has
nothing to match): every press's pitch class in the scale, enough of them → counts; a note
outside is named ("F isn't in the scale. Keep going."). Play mode like a jam: never passes, the
band plays on, a counted chorus marks the jam row done. `Verdict.free` carries the counts.

**The map** (`Menu/MapScreen.swift`): 24 stops, three episodes; the last four venues are
placeholders (`"placeholder": true`, an empty dashed box "Level 21 · Venue to come", the pill
says "Level 21"). The orange stop, its pill and its card open **`Menu/LevelGoalsScreen.swift`**:
"Level 1 · Dockery Farms", the plan's title and line, the quarter, then one row per goal (a
mark, the title, the detail, the status line, a button) and the plan's `about`. "Play at 68"
opens that step from its intro with the knob on 68 (`Player.start(stepId:tempo:)`); the step
still counts at 72. A cleared stop opens the venue's story as before. The header reads
`cleared / 24`.

DEBUG: `-Route map -Venue 1` opens level 1's goals; `-MapCleared n` still overrides the count.
Checks (`-LessonCheck`): the plan loads and every goal names a real step; the ladder; the
store's `goalChorus` / `goalJam`; merge; an old snapshot; the free jam counts, names an F,
refuses three notes, takes any octave; the two-octave pentatonic's 63 notes, ticks and fingers;
one stop per plan level; placeholders.

## 2. Level 1: what Bart has to do, and what the app does

From the plan: "A minor pentatonic, both hands. 12-bar minor blues (Am–Dm–Em). Jam with 5 notes
only." Four goals, all scored:

| Goal | Where | Pass |
|---|---|---|
| Pentatonic, two octaves, right hand | Scales (A minor) → lesson 14, step `penta2-rh` (new) | one 100 % chorus at ≥ 72 (eighths, 21 notes a run, 3 runs a chorus) |
| Pentatonic, two octaves, left hand | step `penta2-lh` (new) | same, from A2 |
| The 12-bar minor blues | Minor Chords → lesson 1 "A minor", step `key-1` | one 100 % chorus at ≥ 70 (the triad on the 1, every change) |
| Jam with five notes | Minor Chords → "Five notes", step `jam-five` (new, `free`) | 3 choruses with only A C D E G, 8 notes or more each |

**Content added:** `lesson-S1m.json` lesson 14 "Pentatonic, two octaves" (two steps at 72, gate
2, cycle 4, eighths on the beat and tick 6, RH 1 2 3 1 2 3 1 2 3 4 5 and back, LH 5 4 3 2 1 3 2 1
3 2 1 and back, over the drums); `lesson-M.json` the `jam-five` step and its jam row under lesson
1 (the whole minor band at 70). The C major file (`lesson-S1`) is untouched: the plan is in A
minor, and the goal opens `S1m` whatever the taste setting says.

**Known:** the eighths are straight against the shuffle drums (one note a beat was the scale
lessons' rule for that reason); the window at 72 is ±100 ms, so a swung eighth still hits. A
straight-eighth hat for the scale steps would be better. "Show me first" on the free jam plays
nothing (no pattern).

## 3. What's left to build

In the order it's needed.

1. **Levels 2–24's goals.** Each is a few items in the plan JSON; most want content: the blues
   scale two octaves, call-and-response (a `free` step that scores only the answer bars),
   root + 7th in the left hand (level 2); "land on a chord tone on beat 1" (a free step with a
   per-bar rule: level 3); Dorian over Am7–Dm7–E7 (a band, level 4); and so on. Levels 6, 12,
   18, 24 are checkpoints: record something. That needs:
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
7. **The four Chicago venues** for levels 21–24 (photos, stories, credits), replacing the
   placeholders.
