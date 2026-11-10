---
name: takt-electronic
description: "Electronic music production for Takt: make, port or rework an electronic track (dub techno today; techno, house, ambient as they come) on the production system Halbschatten was built on: a Python reference render as the studio, its own samples and logged events as the song, and the app's console (the rack: stab bus, tape echoes, FM lead, pad, convolution hall and room, sidechain, master) playing it back to within 0.02 dB. Use this whenever Bart asks for an electronic track, a dub techno / techno / house / ambient piece, a track 'like Halbschatten' or 'like Abyss', to make the app sound exactly like a rendered wav or mp3, to change an electronic track's sound (the stab, the echo, the reverb, the kick, the pad, the lead, the mix, the master, loudness), to add a synth voice or an effect to the engine, or asks how the dub techno system works, which instruments and reverbs it has, or what settings keep it faithful. Not for blues tracks (takt-blues) and not for difficulty or charts (takt-chart)."
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

One system is documented here, the one that exists: **the dub techno system** (Halbschatten,
2026-11-09). Other styles get their own section when they are built; most of the system
(lanes, echoes, convolution reverb, sidechain, master, the A/B) carries over unchanged.

**Read these first, in this order:**

1. `references/system.md`: the signal flow and every setting of the console: buses, sends,
   the two echoes, the hall and the room, the sidechain, the master, the lanes.
2. `references/instruments.md`: every voice, how it is synthesized, where it sits in the mix.
3. `references/music.md`: the musical principles the record was generated from: form,
   harmony, the stab and its echo as one rhythm, the bass, the drums, automation as
   arrangement, tension, humanizing.
4. `references/fidelity.md`: what keeps the app's sound the reference's: sample rates, gain
   laws, timing, the A/B and its tolerances, the traps.
5. `references/feedback.md`: what Bart has said about every electronic track, dated.

Then the sources, when you need a number this skill only points to:
`misc/halbschatten_reference.py` (the record: every formula is there),
`misc/HALBSCHATTEN.md` (the brief it was ported from), `apps/takt/DUB-TECHNO.md` (§1–7 Abyss,
the first dub techno; §8 Halbschatten, the port and its measurements), and the genre's own
entry, `../vibeceo/jambot/library.json` → `dub_techno` (history, references, the general
production approach: read it before writing a new track; a new approach that ships gets its
profile entry there, by the standing rule in the repo's `CLAUDE.md`).

## The way a track gets made

1. **Write the record as a reference script.** Copy `misc/halbschatten_reference.py` to
   `misc/<name>_reference.py` and change the music: tempo, key (`TRANSPOSE`, the chords), the
   form, the patterns, the lanes. Keep its shape: one `render()` that builds every bus, levels
   each on its loud passages, mixes and masters; one-shots made by small functions; every
   per-sample kernel a plain loop (they port line for line). `references/music.md` is how to
   make those choices; `references/instruments.md` what each voice is.
2. **Render it and let Bart hear it** (`python misc/<name>_reference.py out.wav stems/`,
   an mp3 to the Desktop and SendUserFile). His ears pass the *record* here, before any Swift.
   Iterate in Python: a render is ten seconds.
3. **Cut the sounds and log the events** with a copy of `apps/takt/scripts/halbschatten.py`:
   it runs the reference with a log line patched into every event, asserts the logged render
   is the reference bit for bit, writes the one-shots at 44.1 and 48 kHz, the impulses, and
   the event log. New voices or buses in the reference need a matching patch line and sample.
4. **Generate the song** with a copy of `apps/takt/scripts/songs/halbschatten.py`: the log
   becomes hits and notes with `late` and `g`, the gains become the `rack` block.
5. **Port what is new.** If the reference only uses what the rack has, nothing in Swift
   changes. A new voice or effect is ported per sample into `Rack.swift`, at the reference's
   own signal level, with its settings in the song file.
6. **A/B until it is the reference**: `scripts/takt/halb-ab.py` (copy and point it at the new
   song): every stem's level, peak and null, then the master by octave band, at 44.1 and at
   48 kHz. `references/fidelity.md` has the tolerances and the four traps.
7. **The parts and their levels** are `takt-chart`'s (`.claude/skills/takt-chart/SKILL.md`):
   which voice is the chords part, which the melody, the weights. A voice the player takes
   needs a synthesized twin in the rack (`rackStab`, `rackLead`), since the record's own is
   one event a hit.
8. **Register, build, check, ship**: `Song.catalog`, a cover glyph in `SongArt`, the
   `charting.json` entry, `LessonCheck`'s melody list, `npx tsx scripts/takt/library.ts`,
   `xcodegen generate` (new files), `-LessonCheck 1`, the Mac app installed, the mp3 pair to
   the Desktop for his A/B, a section in `DUB-TECHNO.md`, a status entry in
   `apps/takt/CLAUDE.md`, commit, push.

**Changing an existing electronic track** goes the same way round: change the reference
script, render, hear it, regenerate, A/B. Never tune the app's copy by ear against a
description: that is how Abyss took three passes (`references/feedback.md`).

## What the system is, in one screen

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
- A setting that moves in a reference script moves in that script first; this skill points at
  the scripts and at `DUB-TECHNO.md` for numbers and repeats only the ones a reader needs to
  understand the system.
