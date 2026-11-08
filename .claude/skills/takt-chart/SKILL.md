---
name: takt-chart
description: "Make or fix playable material at a target level in Takt, judged on both axes of LEVELING.md (notes a second and hand moves): a Stage song's charts (the weights, `from` tiers and the charting.json patch, or a rewritten line / a level version of a song like Blue Lantern II or Maxwell Street II), lesson steps, drills and jams (scale runs, riffs, chord patterns, free improv steps), the improv teacher's idea and whole-track rules, Agent-mode mods, and a map level's goals. Use this whenever Bart says a level, chart, exercise, lesson, jam, improv idea or solo is too hard, too easy, boring, moves the hand too much, should be 'half as hard' or 'a little harder', has wrong or too-complicated fingering, when he asks for a Beginner / Easy / Easy+ / Medium / Hard rung, a new exercise or drill for a map level, charts for a new or existing track, or anything about difficulty, leveling or what a Level N player can be asked to play."
user-invocable: true
argument-hint: "[what: song/part/level, step, idea… and what felt wrong]"
---

# Takt chart: material a Level N player can play, measured before it is believed

Difficulty in Takt is two measured axes, and a level is a budget on both:

- **Density**: onsets a second over the piece (not notes a bar: a 90 and a 148 chart read on
  one scale), with the quietest and busiest eight bars.
- **The hand**: how often it has to move, the moments those moves group into, the positions it
  sits in, and the span. For a grown-up beginner this is most of the difficulty: a line in one
  hand position at a note a second is playable; a line at half that speed that moves every two
  bars is not.

**`apps/takt/LEVELING.md` is the one place the budgets live** (§2: Level 1 is one position and
two or three figures that come straight back, at most 6 moves in 3 moments inside an octave
and a step, a solo track at most 4; Level 2 at most 12 in 6, 3 positions, two octaves; Level 3
20 / 10 / 4; Levels 4–6 30 / 15 / 5; the density bands beside them). Read it first, every
time, then:

- `apps/takt/CHARTING.md` "What makes a good chart: the rules so far": sixteen numbered rules,
  each with the build that taught it. They are the operating manual; this skill applies them.
- `apps/takt/BLUES.md` §2–3 when the material is a blues chart: the onsets-a-second band of
  every named level, and the measured figure of every track.
- `references/surfaces.md` (this skill): each surface's format, its source file, its check and
  where it is registered: Stage parts, lesson steps and jams, free improv steps, plan goals, the
  improv teacher's idea and whole track, Agent mode, the Reading module.
- `references/feedback.md` (this skill): every call Bart has made about difficulty, dated, with
  what it meant and what we did. It is how to read his next one.

## The way a change gets made

1. **Name the surface, the level and the complaint in the sheet's words.** Which thing (a song's
   part at a named difficulty, a step in a module, an improv idea, a mod), which map level it
   belongs to (`GOALS.md` §2 maps goals to levels; a Stage chart with no goal is judged by
   BLUES.md's bands and the named difficulty), and whether he is talking about **density**
   ("too many notes", "boring", "half as hard") or **the hand** ("move my hands around",
   "fingering too complicated", "jump an octave"). Often both.
2. **Measure first, then decide.** `npx tsx scripts/takt/measure.ts <song> [--level N] [--scale pcs]`
   prints every tier's onsets a second, hand figures (`moves/moments · positions · span`) and
   keys, judges the named levels against BLUES.md's bands and the goal tier against the level's
   budget; `--step <module.json>:<id>` does a lesson step, `--notes <file> --tempo N` a raw
   line (a solo, an idea). Quote the figures in your answer: "Medium is 1.01 a second and
   30 moves in 9 moments over two octaves; Level 2 allows 12 moves in 3 positions".
3. **Pick the lever by the rules**, and say which rule:
   - Density over a band: the rung (rule 1: "half as hard" is half the figure; rule 3: find the
     rung nearest it and name what it plays, or say plainly that the ladder has no rung there),
     through the song's patch in `charting.json` `songs` (rule 4: never the ladder, which moves
     every song); if no rung exists, the weights (rule 10) or the line. **When the phrase cover
     alone keeps Easy over its band** (the anchors are in band but the cover adds the line's
     other keys: Boogie Shoes, 0.64 with anchors at 0.50), weights cannot help, because the
     cover runs before the weights and only picks which onset of a key it takes; the lever is
     `from` on the passing notes (`from: 3` on every weight-2 and weight-3 note keeps Easy, tier
     2, to the anchors and leaves tiers 3–7 as they were), proven on Boogie Shoes 2026-11-08
     (0.64 → 0.49, every other tier within 0.02). A longer `phrase` (24, 72) was measured there
     and did not reach the band; a weight-3 C5 moved nothing on Easy.
   - The hand over its budget: **the line**, never the ladder, never the tempo (rules 9, 13, 14,
     16). Write the riff in one hand position (five or six scale keys under the hand, the
     thumb named), let the figures that leave it be few and come straight home, and give those
     figures `from` tiers so their keys don't leak down the ladder. Thin out the hand before
     the notes; density never buys back a move.
   - Fingering complaints: the Stage fingers each tier's line itself (`Fingering.swift`), so a
     bad fingering is a bad line (rule 12, 15): fix the notes or the weights that put keys a
     beat apart that the hand can't reach.
   - Beginner stubs, keys missing from a phrase, a level that lost a note: the charter's knobs
     (`minBeats`, `phrase`, `from`) and rules 6–7; check "Beginner changes nothing above it".
   - A lesson step: one new thing a lesson (CURRICULUM.md); its written fingering is what is
     taught, so write it and say it in the `about`; one note a beat at 60 before eighths; the
     band on the straight grid for eighths (`feel`); a jam's riff in one position at Levels 1–2.
4. **Change the source, regenerate, measure again.** The generator (`scripts/songs/*.py`) for a
   song, the module JSON (or `scales-extend.py` / `chord-shapes.py` / `improv-jams.py` for the
   generated ones) for a step, `charting.json` for a patch, `leveling.ts` + `Fingering.swift` +
   `LEVELING.md` together for a budget, `solo-agent.ts` / `improv-agent.ts` for the teacher.
   Then `measure.ts` on the result, `--snapshot` before and `--compare` after so every other
   song's figures are proven unchanged (rule 4), and the originals byte-identical when a
   variant was touched (`git diff --stat`).
5. **The app's own checks**: `-LessonCheck 1` after a build (the ladder and hand lines, the
   plan's goal songs against their budgets, the content cases); `scripts/takt/charting-check.ts`
   against a `-DumpCharts` when the charter changed; `solo-check.ts` / `improv-check.ts` when
   the teacher's rules did. Play it in the simulator when the screen is part of the change.
6. **Write it down**: the figures in BLUES.md's tables and LEVELING.md's §1 table, a dated line
   in LEVELING.md §4 (what he said, the figure, what moved), a numbered rule in CHARTING.md
   when it is one, a status entry in `apps/takt/CLAUDE.md`. Then commit, push, and if he will
   play it, bump the build and install (`apps/takt/CLAUDE.md` "Build and run").

## Reading what Bart says (the long list is `references/feedback.md`)

| he says | it means | the lever |
|---|---|---|
| "2x too hard", "half as hard", "remove half the chords" | half the onsets-a-second figure | the rung nearest half (a song patch); name the rungs either side when none is there |
| "charted like a Medium", "boring", "too easy" | the figure is in the wrong band | the rung; never the tempo (a slow band is boring, not easy) |
| "constantly moving my hands", "fingering too complicated", "jump an octave to play on 1 and 2" | the hand axis | the line: one position, few figures, `from` tiers |
| "simpler patterns that repeat more often" | a first song is one riff | rewrite the line as a riff bar and a landing bar (Blue Lantern II) |
| "a little harder: 2 or 3 moments where it requires a hand repositioning" | the next rung is the same line plus figures | Easy+ keeps the riff, Medium adds the figures with `from` |
| "I see bass notes, not chords" | the chords part's Easy isn't chords | weights: the two-note hit first, the thumb last |
| "notes are half length and don't attach" | ornaments taken as anchors | `minBeats`, the weights |
| "it's out of sync with the music" | eighths over a shuffle | the step's `feel: straight` |
| "about half are valid in my opinion" (nothing counted) | the judged unit is too big, or the scoring too harsh | the run as the unit; the scoring, not the chart |
| "it should be slow for that lesson" | a drill's tempo is its own | one note a beat at 60 first, eighths later |
| "not too hard, but make it interesting" | interest is the changes and the shape, not moves or speed | chord tones on the changes, a peak, home on the tonic, inside the hand budget |

## Keep this skill getting better

- Every new call goes into `references/feedback.md` with the date, his words, the figure and
  what moved; the number itself goes in LEVELING.md (first), `leveling.ts`, `Fingering.swift`
  and `LessonCheck.swift`. A new kind of ask becomes a case under `evals/` (his words as the
  prompt, graders that run `scripts/takt/measure.ts`), and `/anthropic-skills:skill-creator`
  reruns the cases against the edited skill (`.claude/skills/takt-chart-workspace/`).
- Never copy a budget into this skill. The sheet is the source; this skill says where to read
  it and how to apply it.
