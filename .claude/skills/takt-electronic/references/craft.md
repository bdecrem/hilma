# Craft: how the records Bart liked were made, and the floors

Read this second, right after `taste.md`. `taste.md` sets ceilings: what a record may not have.
This file sets floors, how much has to be there, and the method that produced the five records
Bart praised or picked. Where the two disagree, this file wins.

The source is `misc/electronic-craft.md`, written 2026-11-10 by Claude in the Claude app (the
writer of `taste.md`, and of Halbschatten, Gegenlicht, Restlicht, Streulicht, Irrlicht and,
in that app, Hafenlicht, Kaltlicht and Nordlicht) as a review of Hohlraum. The tool is
`scripts/takt/floors.py`. Every number below was re-measured here on 2026-11-11 from the
references' own stems, and all of them match the source.

## Why this file exists

Hohlraum (2026-11-10, made here, `misc/hohlraum_reference.py` in git) passed every one of
`taste.md`'s blind checks. Bart's verdict, as relayed by the source: the production is much
less good than the records made in the chat. Measured, it is half empty. Everything pitched in
it sits 9.3 dB under the kick, where the five sit 2.4 to 4.1 dB under. Its carrier, a tuned
knock, is a 200 Hz thud: 74–81 % of its energy sits in 160–250 Hz in every block. It sounds
32 % of the time, and its level climbs 7.4 dB over the form while its timbre stays put.

`taste.md` was written to stop Gezeiten, which had too much. Every rule in it limits; none
says how much must be there, so a record with almost nothing in it passed. Pushing the master
pregain to make up the lost loudness was a symptom of that, not a fix.

## The method: seven things the five have in common

1. **Start from a real rig.** Before writing anything, name a real record or a real setup as
   the model and write down what each instrument in it is and what it plays (look it up when
   you can; say so when it comes from memory). Streulicht, Irrlicht and Nordlicht began from a
   search on one producer's rig: a modular playing sixteenth-note bass, a second bass through a
   frequency shifter, a hand-played lead, noise for hats, long takes with a hand on the filter.
   Each fact became a voice or a lane. If Bart names no artist, scene or record, pick one and
   put it in the brief's first line. Hohlraum chose by elimination from `taste.md`'s menu, and
   its named model (Plastikman's *Consumed*, sparse basslines in reverb) contradicted its own
   "no bass".
2. **Voices come off the shelf.** Every carrier Bart liked is the same machine: a rich source
   (saws, a pulse, a chord of saws) into one resonant filter with an envelope, then drive. The
   filter is the performer. These are passed by his ears; use one:
   - the acid voice in `misc/gegenlicht_reference.py` (`AcidRack` in the app);
   - the stab and its bus filter in `misc/halbschatten_reference.py` (`Rack`);
   - `osc_moog`, `ladder` and `seq_ctrl` in `misc/streulicht_reference.py` and
     `misc/irrlicht_reference.py` (`MoogRack`). `osc_moog`'s saw and pulse have fundamentals
     of opposite sign: mix them as saw − pulse, never the sum.
   A voice built from nothing by someone who cannot hear took nine rounds and still measured as
   a thud. **If a voice does not sit after 3 renders, the voice is wrong: swap it, don't tune
   it.** Describe a voice from its solo stem (band shares, block by block), never from its code.
3. **Level holds, timbre travels.** The carrier enters within 4 dB of its final level, with its
   filter closed. Over the form its level stays within 3 dB and the filter does the rest. A
   decay or density lane is a volume fader in disguise: a ring going from 45 to 240 ms is a
   level change, not a timbre change.
4. **Every job stays filled.** All five fill the same five jobs. A new record may fill a job
   differently; it may not leave one empty. When it drops something a sibling has, write down
   what does that job now.

   | job | Halbschatten | Gegenlicht | Streulicht | Irrlicht | Nordlicht | Hohlraum |
   |---|---|---|---|---|---|---|
   | floor | kick | kick and rumble | kick | kick | kick | kick and rumble |
   | a low voice that moves | sub, 4 notes a bar in the gaps | the riff itself, down to E2 | sixteenths on E2 | sixteenths on B1 (also the carrier) | off-beat C♯2 | **none** |
   | a carrier sounding half the time or more | stab and its echo | acid riff | 8-stage line | the bass | 3-oscillator stack | **knock, 32 %** |
   | a bed | drone pad | pad, one note moves | pad, two chords | pad, two chords | resonator | pad |
   | a second pitched thing | electric-piano visitor | ping on the fifth, toms in 3 | hand-played lead | the shifted shadow, a lead | slow lead | **a tick at −44 dB** |

   Gegenlicht has no bassline because its carrier is a bass-register riff. Hohlraum kept the
   "no bassline", moved the carrier up behind a 250 Hz highpass, and swapped the ping and toms
   for a tick 10 dB lower. `taste.md` allowed each swap; together they emptied the record.
5. **A new record is a proven chassis plus one new device.** Irrlicht is Streulicht's kit and
   mix plus a frequency shifter on a second voice. Nordlicht is the same kit plus a stack whose
   tuning changes. Bart called the first two terrific and asked for a third. Being close to a
   record he liked is not the risk. "Same artist, different album" reads as: copy the
   sibling's reference and keep its instruments and mix. Change the key, tempo, cell, clocks,
   form and image, and add one device.
6. **Mix from the kick, over the body, on the first render.** After render 1, measure every
   stem over bars 16 to (end − 16) against the kick and put it where its job says (the floors
   below). Fix levels on buses; two or three renders. Copy the master and leave it alone.
   **Level a carrier over the body, never over its loudest 8 bars.** Hohlraum's knock matched
   Gegenlicht's acid over the peak (−23.4 against −23.9) and was 4.2 dB under it over the body.
7. **Sparse in ideas, full in sound.** The five each have few ideas: one cell, a chord or two,
   one visitor. None of them is quiet, thin or empty. `taste.md`'s old tie-breaker ("fewer
   notes, darker, later, quieter, longer") was meant for ideas and got applied to sound.
   Bart's taste is also wider than `taste.md`'s spirit. Three of the five carry a bass on every
   sixteenth, a second chord one bar in four from bar 40, a hand-played lead of 7 notes per 4
   bars above E4, or a carrier whose intervals first change at bar 16.

## The floors: `scripts/takt/floors.py`

Run it on the reference's pre-master stems after the first render, before any other check:

```bash
~/.cache/takt-venv/bin/python misc/<name>_reference.py out.wav stems/
~/.cache/takt-venv/bin/python scripts/takt/floors.py stems/ BPM BARS CARRIER_STEM [--drums a,b] [--ground rumble]
```

The pitched group is every stem except drums, noise, risers, the drum room and the ground (a
rumble made from the kick goes in `--ground`; a bassline does not). Name any drum stem the
default list misses with `--drums` (the default covers kick, hats, ohat, clap, rim, ride,
shaker, crash, toms, noise, riser, room, snare). It prints six rows, then the carrier's level,
the carrier's 800–3200 Hz share and the pitched 500–2k band, block by block. **Read the block
rows before you believe a failure.**

| check | pass | Halbschatten | Gegenlicht | Streulicht | Irrlicht | Nordlicht | Hohlraum | Restlicht |
|---|---|---|---|---|---|---|---|---|
| carrier stem | | `chords` | `acid` | `line` | `bass` | stack | `knock` | `bass` |
| pitched group under the kick, bars 16 to end − 16 | 2–5 dB | 2.7 | 3.7 | 3.1 | 4.1 | 2.4 | **9.3** | **5.2** |
| pitched 500–2k under the kick, best 8 bars with a kick | 6–12 dB | 10.5 | 7.0 | 7.9 | 8.4 | 8.4 | **13.5** | **13.6** |
| carrier present (20 ms frames within 20 dB of its loud level) | ≥ 50 % | 53 | 66 | 97 | 98 | 91 | **32** | 54 |
| carrier level spread by 8-bar block, 25–85 % of the track | ≤ 3.5 dB | 2.9 | 2.8 | 2.8 | 1.9 | 2.6 | **7.4** | 5.9* |
| carrier timbre travel (800–3200 Hz share, max − min) | ≥ 10 dB | 10.6 | 20.1 | 14.4 | 26.4 | 24.0 | **7.3** | 22.7 |
| carrier's first 8 bars under its middle | ≤ 4 dB | 1.5 | 0.4 | 3.6 | 1.1 | 2.1 | **5.9** | 1.4 |
| a pitched voice that moves under 150 Hz | yes | yes | yes | yes | yes | yes | no | yes |
| pitched voices sounding in the body | 3 or 4 | 3 to 4 in all five | · | · | · | · | 2 and a tick | 3 |

The first five columns are the comparison set: Halbschatten and Gegenlicht ("FANTASTIC"),
Streulicht and Irrlicht ("terrific"), and Nordlicht, which Bart picked for a video without a
word on its music. Nordlicht's figures are the source's; its reference is not in this repo. The pass bands are a fence around those five, not laws.

**A record that fails the first, third or fifth row is not ready for Bart.** Fix the score and
the voice, not the master. Those rows catch what Hohlraum's first render had: a record that
passed every older check with a carrier nobody could hear on a laptop.

**Restlicht**, measured here and not part of the source's set. Bart asked for its handoff
bundle but has said nothing about how it sounds. It is an electro record whose carrier is the
303 bass, and it misses three rows:
- *The level spread (5.9, marked \*) is the check, not the record.* The bass rests in bars
  88–91 by design, inside the 25–85 % window, so one block reads −26 against −21 everywhere
  else; every other block sits within 2 dB. A planned rest of the carrier inside the window
  reads as spread. Look at the block row before calling it.
- *The pitched group (5.2) and the 500–2k band (13.6) are real.* Restlicht is the driest
  record in the set. Its one echo carries the rim, the snare and the whistle, not the bass.
  Over the body, against the kick:
  - the echo sits 31 dB under (Gegenlicht's acid echo: 15);
  - the hall sits 19 under (Gegenlicht: 12.5);
  - the bass's own 500–2k sits 17 under (the acid's: 12).

  Hohlraum misses the 500–2k row by the same amount.

  Whether that is electro's own shape or a weaker record is Bart's call. When he says, put the
  answer here: either widen the fence for electro or treat the two rows as real misses.

## Hohlraum, the remake the source proposes (not made)

The cheapest test of this file is Hohlraum made again under it, with Bart hearing both.

- **Keep:** the image, the key, 126, the clocks in 4, 7 and 5, the form, the pad and its event,
  the hats, the rumble, the hall, and the master at pregain 1.3.
- **Change the carrier** to `osc_moog`'s pulse at 50 % width into `ladder`, with resonance on
  a lane, playing the same da-dum cell an octave down (G♯2 and F♯2, A2 in the event bars) and
  highpassed at 60 Hz. That makes it the low voice too. Mix in saw − pulse if its timbre travel
  is under 10 dB.
- **Level:** at body level from bar 16, 5–8 dB under the kick. It enters dark and at full
  level, on the medium cell; the sparse cell is kept for the last 16 bars.
- **Lanes:** one cutoff lane, 200 → 2400 → 200 Hz in log, with the envelope and the resonance
  on lanes of their own. Delete the ring, shape, drive and compensation lanes.
- **The rest:** the current knock stays as a clock at a fixed level, the way Gegenlicht's toms
  do. The tick comes up 10 dB, to about −34 dB RMS, 80–120 ms on D♯5, or becomes a resonator
  (three narrow bandpasses on chord notes, fed quietly throughout, as Nordlicht has).
- **Then:** `floors.py`, the blind checks, and two mp3s to Bart.

Not done: Bart has not asked for it. Do it when he does, and his verdict on the pair goes into
`feedback.md` and settles whether these floors are right.
