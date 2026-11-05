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
  is one, fingers 1–5, at most two notes at once. Broken → sent back to the model with the reasons
  as a tool error (up to 3 tries).
- Saved in `takt_improv` (schema `005_takt_improv.sql`: take, backing, context, review, model).

`npx tsx scripts/takt/improv-check.ts` (with `.env.local` loaded): the parser, the transcript, the
idea checker, one live review; `BASE=https://ola.cx` adds the route with a throwaway guest.
First live review (2026-11-04, a made-up two choruses on the white keys): 19 s, the headline
above, an idea joining the take's bar-1 climb and bar-3 walk-down into one arch landing on D.

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
- e.g. `-Module S1m -Step <n>` or `-Route map -Venue 1 -Goal improv`, with `-Backend
  http://localhost:<port>` for a dev server.
