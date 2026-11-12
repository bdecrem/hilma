---
name: takt-electronic
description: "Electronic music production for Takt: make, port or rework an electronic track (dub techno, techno, Detroit electro, melodic techno today; house, ambient as they come) on the production system Halbschatten was built on: a Python reference render as the studio, its own samples and logged events as the song, and the app's console (the rack: stab bus, tape echoes, FM lead, pad, convolution hall and room, sidechain, master) playing it back to within 0.02 dB. Use this whenever Bart asks for an electronic track, a dub techno / techno / house / ambient piece, a track 'like Halbschatten' or 'like Abyss', to make the app sound exactly like a rendered wav or mp3, to change an electronic track's sound (the stab, the echo, the reverb, the kick, the pad, the lead, the mix, the master, loudness), to add a synth voice or an effect to the engine, or asks how the dub techno system works, which instruments and reverbs it has, or what settings keep it faithful. Not for blues tracks (takt-blues) and not for difficulty or charts (takt-chart)."
user-invocable: true
argument-hint: "[what to make or change: style, tempo, key, a reference file, what should sound different]"
---

# Takt electronic: the studio is a script, the app is its tape

An electronic track in Takt is **produced in Python and played back in Swift**. The Python
script is the studio: it synthesizes every voice, mixes by loudness targets and renders a
master Bart can hear as an mp3 before anything touches the app. The app then plays *that
record*: the script's own one-shots, its own events to the sample, and a per-sample port of
its mix (`Takt/Audio/Rack.swift`). The app's render of Halbschatten is within 0.02 dB of the
reference in every octave band and nulls against its stems. That is the bar for every
electronic track from here on: **the reference is a target to measure against, not a
description.**

Four consoles exist, one per kind of record, and each one plays its references to within a
hundredth of a dB per stem: **`Rack`** (dub techno: Halbschatten, Gezeiten), **`AcidRack`**
(techno: Gegenlicht), **`ElectroRack`** (Detroit electro: Restlicht) and **`MoogRack`** (melodic
techno in the manner of Hannes Bieger: Streulicht, Irrlicht). `references/system.md` has each
one; most of the system (lanes, echoes, convolution reverb, sidechain, master, the A/B) is
shared.

**A new record is a proven chassis plus one new device** (`references/craft.md` 5). Copy the
reference of the sibling it is closest to (`misc/gegenlicht_reference.py`,
`misc/streulicht_reference.py`, `misc/irrlicht_reference.py`, `misc/halbschatten_reference.py`),
keep its instruments and its mix, change the key, tempo, cell, clocks, form and image, and add
one device. Irrlicht is Streulicht plus a frequency shifter, and Bart called both terrific.
What went wrong the two times a record was made here instead: Gezeiten changed roles and wrote
a tune, and came out "CHEESY"; Hohlraum built a new carrier from nothing under `taste.md`'s
ceilings and came out half empty ("much less good than the records made in the chat").

**Read these first, in this order:**

1. `references/taste.md`: the ceilings, what every electronic record here has to keep and
   may not have; why Gezeiten came out cheesy. Read it before `music.md`.
2. `references/craft.md`: the floors and the method, how the records Bart liked were made
   (a real rig as the model, voices off the shelf, level holds and timbre travels, every job
   filled, a chassis plus one device, mix from the kick); why Hohlraum came out thin; the
   `scripts/takt/floors.py` checks. Where it and `taste.md` disagree, it wins.
3. `references/system.md`: the signal flow and every setting of the console: buses, sends,
   the two echoes, the hall and the room, the sidechain, the master, the lanes.
4. `references/instruments.md`: every voice, how it is synthesized, where it sits in the mix.
5. `references/music.md`: the musical principles the record was generated from: form,
   harmony, the stab and its echo as one rhythm, the bass, the drums, automation as
   arrangement, tension, humanizing.
6. `references/fidelity.md`: what keeps the app's sound the reference's: sample rates, gain
   laws, timing, the A/B and its tolerances, the traps.
7. `references/feedback.md`: what Bart has said about every electronic track, dated.

Then the sources, when you need a number this skill only points to:
`misc/halbschatten_reference.py` (the record: every formula is there),
`misc/HALBSCHATTEN.md` (the brief it was ported from), `apps/takt/DUB-TECHNO.md` (§1–7 Abyss,
the first dub techno; §8 Halbschatten, the port and its measurements), and the genre's own
entry, `../vibeceo/jambot/library.json` → `dub_techno` (history, references, the general
production approach: read it before writing a new track; a new approach that ships gets its
profile entry there, by the standing rule in the repo's `CLAUDE.md`).

## The way a track gets made

1. **Name the model and the chassis.** A real record or rig and what each instrument in it
   plays (look it up; say so when it is from memory; pick one when Bart names none), and the
   sibling reference this one is copied from. Write the brief at the top of the script
   (`taste.md` "Making one").
2. **Write the record as a reference script.** Copy the sibling's reference to
   `misc/<name>_reference.py` and change the music: tempo, key, the form, the cell, the clocks,
   the lanes, plus one new device. The carrier is a voice Bart has already passed (`craft.md`
   2); a voice that does not sit after three renders is swapped, not tuned. Keep the shape: one
   `render()` that builds every bus, levels each one, mixes and masters; one-shots made by
   small functions; every per-sample kernel a plain loop (they port line for line).
   `references/music.md` is how to make those choices; `references/instruments.md` what each
   voice is.
3. **Measure before anyone listens.** Render with stems
   (`~/.cache/takt-venv/bin/python misc/<name>_reference.py out.wav stems/`), then
   `~/.cache/takt-venv/bin/python scripts/takt/floors.py stems/ BPM BARS CARRIER`. Level every
   stem against the kick over the body (bars 16 to end − 16), on buses, never the master. Then
   `taste.md`'s blind checks. A record that fails floor 1, 3 or 5 is not ready for Bart; fix
   the score and the voice and render again (two or three renders, a render is seconds).
4. **Let Bart hear it**: an mp3 to `~/Desktop/takt/<name>/` and SendUserFile. His ears pass
   the *record* here, before any Swift. If you were tempted by an extra idea, render both and
   send the plainer one first.
5. **Cut the sounds and log the events** with a copy of the sibling's cut script
   (`apps/takt/scripts/{halbschatten,gegenlicht,restlicht,streulicht,irrlicht}.py`): it runs
   the reference with a log line patched into every event, asserts the logged render is the
   reference within 1 LSB, writes the one-shots at 44.1 and 48 kHz, the impulses, and the event
   log. New voices or buses in the reference need a matching patch line and sample.
6. **Generate the song** with a copy of the sibling's generator in `apps/takt/scripts/songs/`:
   the log becomes hits and notes with `late` and `g`, the gains become the rack's block.
7. **Port what is new.** If the reference only uses what its console has, nothing in Swift
   changes. A new device is ported per sample into that console (`Rack.swift`,
   `AcidRack.swift`, `ElectroRack.swift`, `MoogRack.swift`) as an option with its settings in
   the song file, at the reference's own signal level, and the sibling is re-A/B'd to prove it
   did not move. A voice that cannot be rebuilt to null (Irrlicht's frequency-shifted shadow)
   ships as a `stem` read at the song's position (`system.md`).
8. **A/B until it is the reference**: a copy of the sibling's A/B script (`scripts/takt/`
   `halb-ab.py`, `gl-ab.py`, `rl-ab.py`, `sl-ab.py`, `il-ab.py`): every stem's level, peak and
   null, then the master by octave band, at 44.1 and at 48 kHz. `references/fidelity.md` has
   the tolerances and the traps.
9. **The parts and their levels** are `takt-chart`'s (`.claude/skills/takt-chart/SKILL.md`):
   which voice is the chords part, which the melody, the weights. Before any ladder: where the
   chosen voice rests in the record (an intro, a break, an outro, the bars a visitor is away),
   the part gets notes of its own, chart-only, so no level leaves more than 15 s with nothing
   to play (`taste.md` "The record and the chart", `scripts/takt/gaps.ts`). A voice the player takes
   needs a synthesized twin in the rack (`rackStab`, `rackLead`), since the record's own is
   one event a hit.
10. **Register, build, check, ship**: `Song.catalog`, a cover glyph in `SongArt`, the
   `charting.json` entry, `LessonCheck`'s melody list (the hand check near "Every blues melody
   at every tier"), `Licenses/README.md`, `npx tsx scripts/takt/library.ts`,
   `xcodegen generate` (new files), `-LessonCheck 1`, the Mac app installed, the mp3 pair to
   the Desktop for his A/B, a section in `DUB-TECHNO.md`, a status entry in
   `apps/takt/CLAUDE.md`, commit, push.

**Changing an existing electronic track** goes the same way round: change the reference
script, render, hear it, regenerate, A/B. Never tune the app's copy by ear against a
description: that is how Abyss took three passes (`references/feedback.md`).

## What the system is, in one screen

The dub techno console (`Rack`) below; the acid, electro and moog racks are in
`references/system.md` and `instruments.md`, one section each.

- **Voices**: a kick tuned to the key; a sine-and-harmonics bass with an octave-up layer; a
  detuned-saw minor-ninth **stab** through one resonant filter; an FM bell **lead**; a
  five-note saw **pad** drone; noise hats, shaker, clap, rim, tuned toms; a hiss-and-crackle
  bed; noise risers.
- **Space**: a ping-pong **tape echo** on the stab (a dotted eighth, band-limited and
  saturated in the loop, feedback automated), a second on the lead (a dotted quarter); a
  **7-second hall** and a **1.4-second room**, both synthetic impulses played by convolution;
  kick and bass dry and mono.
- **Movement**: a **sidechain** from the kick on everything but the drums; **lanes** that
  open and close the filter, stretch the decay, throw the feedback, fade the hats, the pad
  and the noise over the form.
- **Master**: 24 Hz highpass, tanh saturation, a limiter, −10 LUFS in the reference; the app
  plays it 8 dB under that, with its other electronic tracks.

## Keep this skill getting better

- Bart's next call about an electronic track goes into `references/feedback.md`, dated, in
  his words, with what it meant and what changed.
- A new style (a techno system, a house system) is a new section in `references/system.md`,
  `instruments.md` and `music.md`, written the day its first track nulls, from its reference.
- When Bart rates a record, add its column to `craft.md`'s floors table (run `floors.py` on
  its stems), and move the fence if a record he liked falls outside it.
- A setting that moves in a reference script moves in that script first; this skill points at
  the scripts and at `DUB-TECHNO.md` for numbers and repeats only the ones a reader needs to
  understand the system.
