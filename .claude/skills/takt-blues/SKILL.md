---
name: takt-blues
description: "Write a new blues track for Takt's Stage, or rework an existing one's sound, groove or arrangement: a generator in apps/takt/scripts/songs/ on common.py that writes Takt/Content/song-*.json (drums, bass, comping, the horn line, and the two parts the player can take, weighted so the levels fall out right). Use this whenever Bart asks for a new track, song, tune, groove, backing, band or record for Takt in any blues style (slow blues, shuffle, jump, boogie, Delta, Chicago, Texas, minor blues, stop time), to make a track hit harder, sound dirtier, swing more, get a solo or stop-time chorus, change key or tempo, or for a blues band under a lesson or the Reading module. Even when he only says 'make a track' or 'something like Slow Burn but…', this is the skill."
user-invocable: true
argument-hint: "[style, key, tempo, what it should feel like, where it goes]"
---

# Takt blues: write a track the band can play and a beginner can learn

You are the producer on Takt, a piano course for grown-ups whose Level 1 is the blues. A track
here is a **record** (drums, bass, keys, horns, as data the app's sampler plays) plus **two parts
the player can take** (the chords and the melody), each weighted so the app cuts Beginner, Easy,
Medium and Hard from it by rule. The record is what Bart hears every day; the parts are what he
learns. Both have to be right, and both are measured before anyone plays them.

**Read these first, in this order** (they are short, and they are the taste and the rules):

1. `apps/takt/BLUES.md`: the reference sheet. §1 the ground rules (one speed, the band plays
   the rest, every level the one below plus more), §2–3 what each level plays and the onsets-a-
   second band it must land in, §4 how to write a track so the levels fall out right, §5 the
   tracks as a producer hears them, §6 what is open.
2. `references/sound.md` (this skill): the instruments we have, the kit, how each track sets
   its gains and levels, the loudness targets, the time grid.
3. `references/feedback.md` (this skill): what Bart has said about every track so far, dated.
   This is the taste. When a new call lands, it goes here first.
4. `references/recipe.md` (this skill): the anatomy of a generator, device by device, with the
   closest existing script to copy for each style.

Then `apps/takt/CHARTING.md` only if a ladder comes out wrong (the mechanism), and
`apps/takt/LEVELING.md` when the track is a map level's song (the hand budget applies).

**The hand-off.** This skill writes the record and the weights; the levels fall out of them.
When, after the measure step, a level still sits outside its band or the hand budget and the
weights cannot bring it in, that is the `takt-chart` skill's job
(`.claude/skills/takt-chart/SKILL.md`: `from` floors, the charting.json patch, a rewritten line
for a map level's song), not a guess in the generator. Charts for an existing track are
`takt-chart` alone. Bart's rule (2026-11-08): every new track goes through this skill, every
chart through that one.

## The way a track gets made

1. **Hear it before writing it.** From the brief, decide: the style and the record it nods to
   (Bart names them: Muddy, Robert Johnson, Elmore James, the Texas shuffle, the jump bands;
   the music is always ours, never a lift), the key (one we don't have yet unless he says), the
   tempo (**one speed**: 90 for a slow 12/8 blues, 112–120 for a shuffle or a jump, 80 for
   Chicago stop time, 84 for a straight-eighths minor blues, 148 for a boogie), the form, the
   number of choruses (2:00–2:30), and what each chorus does (one thing a chorus: the head
   with the cross-stick, the snare in, a stop-time chorus, a solo on the ride, the out chorus
   with one big stop). Write that as the generator's docstring before any code: it is the
   producer's note BLUES.md §5 will carry.
2. **Copy the closest generator** (the table in `references/recipe.md`) into
   `apps/takt/scripts/songs/<name>.py`. Keep its skeleton (`Song(...)`, sounds, instruments,
   levels, the four `# MARK:` blocks, the parts, `s.write()`); change the music. Name the song
   like the others: a place from the blues map or a feel, two words at most (Dockery, Friars
   Point, Maxwell Street, Halsted, Pearl Street, Slow Burn, Boogie Shoes, Blue Lantern).
3. **Write the record** in this order, and listen in your head at every step: drums (the kit
   from the style, fills per chorus, the backbeat growing from cross-stick to snare, the ride
   for the solo), bass (the walk the style wants, low: the bass is sampled E1–D♯2), the
   comping (voicings with a role and a finger per note, weights 1 / 2 / 3), the horn line (one
   anchor a bar as the rule, fewer on a fast song; the answers weight 2; the ornaments 3), the
   solo chorus, the stops, the last bar. Every note's weight is honest: the weights are what the
   levels are cut from (BLUES.md §4; the rules of thumb are in the recipe).
4. **Generate and measure.** `python3 apps/takt/scripts/songs/<name>.py`, then
   `npx tsx scripts/takt/measure.ts apps/takt/Takt/Content/song-<name>.json` (the app's charter
   and hand planner, no build needed). Read both ladders against BLUES.md's bands. Off by more
   than a hair: first the song's patch in `charting.json` `songs` (the blues melody patch is
   `{"easy": 2, "phrase": 12, "tiers": {"2": {"space": 0}}}`; a comping part often wants
   `{"chords": {"easy": 2}}`), then the weights (CHARTING.md rules 2, 10, 15: one anchor a
   bar, or every two bars when a bar is under 2 s; the main note of a riff weight 2, its
   ornament 3), never the ladder and never the tempo. Measure again. The two ladders must
   climb with no rung over twice the one below (a Beginner that can't reach its band on a fast
   song is a noted exception).
5. **Register it** (every one, or the app traps or the checks lie): `Song.catalog` in
   `apps/takt/Takt/Game/Song.swift` (set-list order; after Halsted means under All tracks, the
   first six are pinned by default); a cover glyph in `SongArt` (`Menu/StageScreen.swift`, a
   `case "<glyph>"` drawn in the tile with the layout's math in a comment, as the others);
   the `charting.json` patch; the song's name in the melody list of `LessonCheck.swift`
   (search `"song-halsted"`) so its hand figures print; BLUES.md (the tracks paragraph, a column
   in the §2 and §3 tables with the measured figures, a paragraph in §5, a note in §2/§3 when a
   patch was needed and why); `npx tsx scripts/takt/library.ts` (chat-check fails while
   `library.json` is stale); `Licenses/README.md` only for a new sound.
6. **Build, check, render, listen.** `cd apps/takt && xcodegen generate` if files changed, the
   simulator build, `xcrun simctl install booted …/Takt.app`, then `-LessonCheck 1` (every
   song's ladder keeps its rules; read the new song's two lines) and
   `scripts/takt/render-song.sh song-<name> <seconds>`: the mix lands at about −23 dBFS mean
   with the peak under −1 dB; trim `levels` and the kit's `gainDb` until it does. Put the MP3 in
   front of Bart (`~/Desktop/takt/song-<name>.mp3`, SendUserFile) with two lines on what to
   listen for. If he will play it today, bump the build and install the Mac app
   (`apps/takt/CLAUDE.md` "Build and run").
7. **Write it down and ship it.** A status entry in `apps/takt/CLAUDE.md` (what he asked, what
   the track is, the ladders, the levels, the checks), commit, push. Then wait for his ear: what
   he says after playing it goes into `references/feedback.md` and BLUES.md's notes from play
   with the date, and if it is a rule, into CHARTING.md's list.

## What we like (the short form; the long form is `references/feedback.md`)

- **It should sound like a record, with a band in the room.** The arrangement grows chorus by
  chorus; the fills differ; velocities are humanized from the song's seed; nothing loops.
- **Slow means heavy, not sleepy.** Slow Burn at 68 was "too boring"; 90 is the slow blues.
  A level is never made easier by slowing the band.
- **Dirt is good.** "Dockery needs some more dirt… make it hit harder": a kick under the foot,
  the hands playing hard, the guitar's hardest layer, the amp on the electric. Levels are set
  from renders, not guessed.
- **Old school is a sound, not a costume.** Delta is one guitar, a foot and a voice; Chicago is
  stop time and a unison riff with the piano rubbing C against C♯; Texas is the heavy shuffle
  with the boogie bass; the jump is the walking bass and the chanks.
- **Samples, never synthesized imitations of real instruments.** The synthesized organ was
  "the dumbest instrument ever made". Every sound is a recording under a permissive license
  (`Licenses/README.md`).
- **The player's keys sound different from the band's.** The piano is the default monitor on
  the blues (Settings offers the organ and the Rhodes); the Delta tracks hand you the guitar.
- **The melody part is a line to learn, and the chords part is chords from Easy up.** Two-note
  voicings from Easy (root and third), the off beat is fine; never bass notes dressed as chords.
  A first song is one riff in one hand position (Blue Lantern II); a fast song takes fewer
  anchors (Halsted).

## Keep this skill getting better

- Bart's next call about a track (its sound, its feel, its levels) is a dated line in
  `references/feedback.md`, with what it meant and what changed. BLUES.md's "Notes from play"
  get the measured figures. A new rule goes to CHARTING.md's numbered list.
- A new kind of request that the skill got wrong once becomes a case under `evals/` (a
  `prompt.md` in his words, a `case.yaml`, one grader per thing that must be true), so the next
  edit of this skill is tested against it: `/anthropic-skills:skill-creator` runs the cases and
  shows the results (`.claude/skills/takt-blues-workspace/` holds the runs; the graders use
  `scripts/takt/measure.ts`).
- When a number in BLUES.md moves, the skill does not copy it: the sheet is the source, this
  skill tells you where to read it.
