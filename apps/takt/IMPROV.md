# Improv: you play, the teacher listens, one idea comes back

Built 2026-11-04. Bart, the brief: improv always goes over a backing track (one of our songs, or
just a drum line); it is every practice in the Learn tab and the last goal of Levels 1 and 2;
it is agentic: when you finish jamming, the take goes to an agent that reviews the MIDI and sends
notes and one new idea; the tone is very positive, a great encouraging teacher; the idea is based
on what you improvised, but better; you're asked if you want to try playing it, and get extra XP
for that; and there is XP, a small number by the profile. His four calls, 2026-11-04: improv is the
4th goal of Levels 1–2 (after the song); every jam row becomes improv; a reviewed take meeting the
numbers clears the goal; the teacher is Opus 5.5.

## What the player sees

1. **An improv** is a step of kind `free` (a jam row "Play · after lesson n", or a level goal).
   Its intro says what to do; a starting idea (the old riff, when it had one) is in the intro's
   fingering and in Show me, never lit or scored while you play. Start: the band from the top
   with the count-in. Play anything. The footer becomes the **ImprovBar**: where you are, "Your
   take · 31 notes", and **Send it to the teacher** (open from 8 notes, `Player.takeMinimum`).
2. **Send it**: the band stops; a sheet (`Improv/ImprovSheet.swift`) shows the teacher working
   (Agent mode's `WorkingPanel`: "Sending your take", "Listening to your take: 24 bars, 46 notes",
   "Finding your best moment", "Writing your notes and an idea"), about 20 s.
3. **The review**: a headline in `signal` ("Your bar 3 answered bar 1 and came home to D"), two or
   three notes that each point at a bar and a note, "+30 XP", the level goal it cleared (or what
   it still needs: "next time, 2 whole choruses"), and **One idea**: its name, why (which bar of
   yours, what changed), a little piano roll with the fingers. **Try my version · +50 XP** and
   **Improvise again**.
4. **Your version**: the idea as a step (a `jam` with exact keys, `Improv.versionStep`) over the
   same backing, from its intro; it loops every 1, 2 or 4 bars, is judged run by run and Show me
   plays it. It shows **as the game does** (0.1 (101), Bart: "the user sees the notes come down so
   they have time to get their fingers there"): the idea's notes come down the game's highway
   (`Highway`, `VersionHighway` in `LessonScreen.swift`) onto a keyboard of its own, with the
   fingers, the chord of the bar and the hand; `Player.versionHighway` builds the frame from
   `Improv.highwayNotes` (pure: hit by a press of the pitch inside the lessons' window, missed
   once it has gone by) and your presses this transport epoch. A run with half its notes hit pays
   +50 XP, a clean run +25 more (once per idea). Leaving the lesson screen drops it.

## Backings

A free step plays its module's band (its `band` channels, `transpose`, `feel`), or a Stage song
named by `backing` (`Lesson.Step.backing`): `BandData.looped(by:)` cuts the song's tail bar so it
loops by the step's 12-bar form, `AudioEngine.load(band:straight:loop:)` caches it as
`<song>|loop12`, the step's `band` mutes the song's melody channel (the solo is yours). Your keys
follow the backing's monitor (Blue Lantern's Rhodes) unless Settings picks an instrument.

- Level 1, `improv-white` (lesson-S1m, after lesson 15): Blue Lantern II's band, D minor blues at
  84 straight, scale = the white keys.
- Level 2, `improv-five` (after lesson 14): Maxwell Street II's band, A at 80 in the shuffle,
  scale = A C D E G.
- Every other jam (55 of them, `scripts/improv-jams.py`): its module's band as before, any note
  (`scale` absent), the riff as the starting idea. Level 3's "Five notes" jam keeps its scale.

## The take

`Improv.Recorder` (pure): every press on a free step while the band plays (not the intro, not Show
me) with its transport tick, velocity and, on release, its length; a Stop (new epoch) starts a new
take. `take(...)` starts at the chorus the first note leads into (half a beat early counts) and
runs to the end of the chorus being played: `{ tempo, bars, notes: [{ t, n, v, len }] }` in ticks
from that downbeat (12 a beat). `Improv.Count` is the take against a goal: whole choruses, notes,
the share on the step's notes.

## The teacher (server)

`POST /api/takt/improv` (`src/app/api/takt/improv/route.ts`, session cookie, guests too) with
`{ take, backing: { title, style, key, feel, form, scale, scaleName }, context: { where, title,
about, hand, device } }`, streamed as server-sent events (`src/lib/takt/sse.ts`): `status` lines,
`review` with the row id, `done`. `src/lib/takt/improv-agent.ts`:

- **The transcript**: one line a bar, its chord, every note with its beat (1 to 4.92), its length
  in beats, loud or soft ("Bar 1 (chorus 1), Dm7: D4 on 1 for 1, F4 on 2 for 1, …").
- **The prompt**: the teacher everybody wishes they'd had; warm, specific, a little delighted;
  never "wrong", "mistake", "but", "however", "unfortunately"; growth is "next, try…". The idea is
  THEIR idea, a little better: their best moment kept (notes, shape), one or two things improved
  (land on a chord tone on 1, repeat and vary, space, the beat they almost hit, step not leap).
- **The tool** `review`: headline (≤ 60), notes (2–3), idea { title (≤ 40), why, bars 1|2|4,
  notes [{ beat, note, beats, finger }] }.
- **Checked before the app sees it** (`checkIdea`): bars divide the form, 3–16 notes, on the
  12-a-beat grid, inside the idea, within 7 semitones of the take's range, on the scale when there
  is one, at most two notes at once, and since 2026-11-08 (**`LEVELING.md`**) **one hand
  position**: fingered as the Stage fingers a line (`src/lib/takt/fingering.ts`, the app's
  `Fingering` ported) it has no hand move and spans a seventh at most; the fingers the app shows
  are the planner's, whatever the model wrote. Broken → sent back to the model with the reasons
  as a tool error (up to 3 tries). The request's `context.level` (the map level the improv is a
  goal of; 1 for a jam) is what the hand budgets key on.
- Saved in `takt_improv` (schema `005_takt_improv.sql`: take, backing, context, review, model).

`npx tsx scripts/takt/improv-check.ts` (with `.env.local` loaded): the parser, the transcript, the
idea checker, one live review; `BASE=https://ola.cx` adds the route with a throwaway guest.
First live review (2026-11-04, a made-up two choruses on the white keys): 19 s, the headline
above, an idea joining the take's bar-1 climb and bar-3 walk-down into one arch landing on D.

## The whole track (2026-11-07)

Bart: "when the agent suggests an improvement to the jam, have them produce a full version of
the track that I can play, so their improvisation changes across the song, follows the chord
changes, not too hard but interesting; add that to the versions of the song in game mode, with a
new level name." So after a review over a Stage song (`Lesson.Step.backing`: Level 1's improv
over Blue Lantern II, Level 2's over Maxwell Street II), the teacher writes **the whole track**:

1. The sheet grows a card under the idea, **THE WHOLE TRACK · BLUE LANTERN II**: the steps as
   the teacher writes (a minute or two), then its title, its line and **Play the whole track**.
   `AppModel.writeTrack` starts it from `reviewed`; it is a `TrackJob` of its own, so closing
   the sheet (or Try my version) does not stop it, and Write it again retries a failure.
2. It lands as a bundle of kind `solo` (`ModStore.solos`, apart from the mods: never a card) and
   the song's card on the Stage gains a level, **Solo**, after Adaptive, outlined in `cue`, on
   the melody only: the teacher's line, every note as written, on the game's highway with the
   band (`GameEngine.Difficulty.solo`; `Charting.tier(.solo)` is the top of the ladder). Its
   runs are on the song's board; the pause card's Agent mode continues the bundle. One Solo
   per song and player: the next take rewrites it as the next version, the history keeps every
   earlier one.
3. The server (`src/lib/takt/solo-agent.ts`, `POST /api/takt/improv/track` with the take, the
   review, the backing's file and charting.json): the improv teacher's voice with the brief,
   the chord tones of every chord among the notes allowed, the range from the take, the density
   in notes a bar; `write_notes` in two halves (the band's horns mirror it), `finish(title,
   line)`; `checkSolo` sends it back with reasons (the grid, the lengths, one note at a time,
   the scale, the range, leaps, 0.45–1.2 notes a second, runs of five eighths, silences over
   two bars, the changes, the idea quoted twice, looping, anchors, **and the hand**) up to four
   times. Saved in `takt_mods` with `kind = 'solo'` (schema 007). `npx tsx scripts/takt/solo-check.ts`.

   **The hand (2026-11-08, `LEVELING.md`).** Bart's first track (2026-11-07) moved his hand
   10 times in 7 places over 15 semitones, and he called it "way beyond Level 1": the prompt
   had density rules and no hand rule. Now `rulesFor` reads the player's level
   (`context.level`), takes the level's **solo budget** (Level 1: at most 4 moves in 2 places,
   2 positions, inside an octave; `src/lib/takt/leveling.ts`) and finds the **home position**,
   the five scale keys the take mostly sat on (`homePosition`); on Levels 1–2 the range is that
   position and a step either side. The prompt opens with THE HAND FIRST and names the home
   position and the budget in words; `checkSolo` fingers the solo as the Stage will
   (`fingering.ts`) and sends it back with the bars of every move when it is over budget. The
   first track under the rule (the check's live run): 110 notes, 0.80 a second, 0 hand moves,
   one position, in 78 s. Bart's own row was rewritten the same day as its v2 (v1 is in the
   history and in `scripts/takt/fixtures/solo-blue-lantern-2026-11-07.json`).

## Jam on any song (2026-11-13)

Bart: "for all games, offer an JAM/improvize mode like we offer in the Map, I'm guessing from
the main card on Stage. And then the agent offers a variant on that." Every Stage card has
**Jam** beside Practice and Call (`AppModel.jam(song:)`). It opens the same kind of step as the
map's improvs, made from the song (`Improv/StageJam.swift`, `Lesson.stageJam`): a lesson of its
own, code `jam-<song>` (never a bundled module, so nothing else loads it), a hidden play step
first (the lesson engine opens every lesson on one), then the free step, which the player opens
on its intro. Its parts:

- **The backing:** the song's band with its melody's channel out (a song with no melody part
  plays whole). Its feel comes off the drums (`Lesson.swung`: the shuffle's late eighth more
  often than the straight one).
- **Its form**, one chorus of the backing (`Lesson.jamForm`), is one of three:
  - the chords' own cycle when they repeat every 16 bars or fewer, made a multiple of four
    (Hypnotist 4, Abyss 8);
  - 12 bars when most of the song keeps a 12-bar cycle (the blues, and the long holds of
    Halbschatten and Irrlicht);
  - else the whole track in whole four-bar phrases (Restlicht 124, Gegenlicht 132).

  `BandData.looped` keeps the whole song and goes round it; the form only counts choruses and
  names each bar's chord for the teacher. The server now takes forms up to 256 bars (64 before).
- **The chords:** rooted from their symbols and numbered in the song's key.

Back (and Esc) land on the Stage, and the module that was open comes back (`leaveStageJam`).
The review, the idea and the whole track as the song's Solo work as over Blue Lantern II.
The Solo writer now writes a long track in parts of 24 bars at most (two halves up to 48 bars,
as before). DEBUG: `-Jam <song>` opens it as the card does.

## The same level as the take (2026-11-13)

"The key for all agent variants on jams is that it should be at the same general complexity /
difficulty as what the user did." `src/lib/takt/take-shape.ts` measures the take:

- **How busy:** onsets a second over the bars they played in, and over the take with its rests.
- **How quick:** their quick step, the gap a sixth of their in-phrase gaps are at or under.
- **How many keys at once:** the most keys struck together on a tenth of their onsets.
- **The range,** and **the hand:** their line fingered as the Stage fingers it, with its moves a
  bar.

Both agents read it in the message, and both checks hold them to it.

- **The idea** (`checkIdea`) uses the same density measure as the take (the bars with notes):
  - 0.6× to 1.5× as busy as they were;
  - no gap under three quarters of their quick step (a take in quarters gets no eighths);
  - no more keys at once than theirs (two at most);
  - one hand position when their take stayed in one (a stray move in a long take counts as
    one), else as many moves a bar as theirs.
- **The whole track** (`rulesFor`):
  - 0.8× to 1.3× their notes a second with the rests, between 0.45 and 2.5;
  - sixteenths on the grid only when they played them;
  - runs of quick notes no longer than their longest (four at least);
  - a hand budget of their moves a bar over the song, a quarter more, at least 2;
  - a jam's range is where they played and a step either side.

  A map level's improv keeps its level's solo budget as a ceiling, whichever is less, and its
  home-position range.

The fixed numbers before this were 0.45–1.2 a second, eighths at most and one position.

Checks: `improv-check.ts` (sixteenths, chords and a busier idea over a plain take sent back, a
take in quarters refusing eighths); `solo-check.ts` (the take's budget and density, a busy take
in sixteenths getting a busier track); `jam-check.ts` (Restlicht's 124-bar jam request, a
beginner's and a busier take reviewed live, each idea at its take's level, the whole track
from the busier one inside its band and budget).

## XP

`Snapshot.xp: [XPEntry]` (id, day, kind, points), merged as a union by id, so nothing pays twice
and two devices add up; plus 100 for every plan goal done, counted from `goals`
(`ProgressStore.xp`). Amounts in `Improv.XP`: a reviewed take 30, your version played 50 (a clean
run 25 more), a lesson finished 20 (once a day per lesson), a Stage song to the end 10, a goal
done 100. Shown small beside the gear on the Learn and Map tabs (`XPLabel`).

## Goals

`LearningPlan.Kind.improv` { module, step, choruses, minNotes, inScale }: done when a reviewed
take on that step had them (`AppModel.reviewed` → `ProgressStore.goalImprov`). Levels 1 and 2:
2 choruses, 16 notes, 0.9 on the notes.

## DEBUG

- `-ImprovPlay <choruses>` on an improv: starts it, plays a made-up solo on its notes through the
  press path, sends the take after that many choruses.
- `-ImprovReview <file>`: the review from a file (a `review` event's review), no network.
- `-ImprovVersion 1`: on to the idea 1.5 s after the review.
- `-ImprovTrack <file>`: the whole track from a saved bundle (a `track` event's mod, or
  `solo-check.ts`'s `OUT`), no network, a second after the review; with `-ImprovReview` alone no
  track is written. `-Route stage -Song song-blue-lantern-white -Part melody -Difficulty solo
  -LoadMod <file> -AllTracks 1 -ScrollTo song-blue-lantern-white` shows the card with Solo picked;
  `-Route game … -Difficulty solo -LoadMod <file>` plays it.
- e.g. `-Module S1m -Step <n>` or `-Route map -Venue 1 -Goal improv`, with `-Backend
  http://localhost:<port>` for a dev server.
