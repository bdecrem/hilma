# Hohlraum: how this record was made, for review

For the other Claude agent (the one that wrote Halbschatten and Gegenlicht, and `taste.md`). Written by Claude Code, 2026-11-10, the session that produced the track. Bart asked for this so you can comment before anything is ported.

**Nobody has heard this record.** Not Bart at the time of writing, and not me: I cannot listen. Every decision below was made by reading, counting and measuring. Please read it as a claim to be checked, not a result.

## 1. Where everything is

| What | Where |
|---|---|
| The record (the studio) | `misc/hohlraum_reference.py` |
| What Bart will hear | `misc/hohlraum_reference.mp3` (320 kbps), also `~/Desktop/takt/hohlraum/Hohlraum (reference).mp3` and `.wav` |
| The mute test (kick, knock, its echo, nothing else) | `~/Desktop/takt/hohlraum/Hohlraum (kick, knock and echo only).mp3` |
| The request and what is open | `.claude/skills/takt-electronic/references/feedback.md` |
| This note | `misc/HOHLRAUM.md` |

Render it yourself (7 seconds):

```bash
~/.cache/takt-venv/bin/python misc/hohlraum_reference.py out.wav stems/
# writes out.wav, stems/*.wav (14 pre-master stems) and parts/ (one-shots, impulses, gains.json, events.json)
HR_ONLY=kick,knock,knock_delay ~/.cache/takt-venv/bin/python misc/hohlraum_reference.py mute.wav   # any subset of stems through the master
```

Knobs that exist only for auditioning: `HR_KNOCK_DB` (the knock's level, default −23), `HR_ECHO` (echo return, 0.5), `HR_HALL_DB` (−24.5), `HR_PAD_DB` (−26.5), `PREGAIN` (1.42).

Nothing is ported, charted or in the app. Bart's instruction was "for now, ONLY make the .wav or .mp3".

## 2. The ask, and how I read it

Bart: "make another techno track, inspired by gegenlicht - think: same artist, different album, different track. make sure to review the .md with instructions on how to think like an electronic music producer etc."

My reading:

- **Same artist** = the handwriting stays: restraint, a kick and its rumble instead of a bassline, clocks running against each other, subtractions as the moments, a cold image, the same master.
- **Different album** = not an acid record. A different carrier, picked from `taste.md`'s list.
- **Different track** = its own key, tempo, cell, clocks, form and image.

What I read first, in the skill's order: `taste.md`, `system.md`, `instruments.md`, `music.md`, `feedback.md`, then `misc/GEGENLICHT.md`, `misc/gegenlicht_reference.py` in full, and the `minimal_techno` and `berlin_techno` entries in `../vibeceo/jambot/library.json`. I skipped `fidelity.md` (it is about the port).

One thing steered me that is not in any of those files: I thought of the step from Plastikman's acid albums to *Consumed* (sparse, hollow, knocks in a dark room). That is a memory of a record, not something I listened to. If it is a wrong model for "same artist, different album", say so.

## 3. The decisions, with what I turned down

### The carrier

`taste.md` lists six carriers. Two are used (a chord stab in Halbschatten, a low riff in Gegenlicht). I chose **a figure on tuned toms**, with the echo doing part of the work.

| Option | Why not |
|---|---|
| Chord stab in a techno setting | Too close to Halbschatten at 126 with a rumble |
| Another low riff with different synthesis | Too close to Gegenlicht |
| A drone with one moving note | I judged it the most likely to come out dull with nobody listening |
| The echo itself as carrier (a click into a one-sixteenth echo with the feedback as the story) | New mechanics I could not audition; I kept the dotted eighth both passed records use |
| A pad whose filter moves | Not considered seriously |

Within "tuned toms" I also turned down:

- FM for the knock, because a short low FM blip off the beat is the "donk" `taste.md` bans.
- Inharmonic partials (struck bar modes), because a low marimba or log drum in an echo is a costume.
- An octave-up layer, because a percussive hollow tone with an octave layer is close to the 90s house organ bass.
- A third knock pitch on the fifth below, because a fifth falling to the root into a downbeat is a timpani cadence.

### The image

**Hohlraum**, a hollow: the space under a road at night. Everything arrives from above as a knock and the hollow answers. I used it as a rule: everything has a hole in it.

- The chord has no third (a fourth, D♯–G♯).
- The hats play nothing on the beat.
- The knock's waveform has odd harmonics only.
- The form loses its carrier for four bars (96–99).

I am suspicious of that list. `taste.md` says a decision that is exciting to explain deserves suspicion, and "the hole again" is exactly that kind of sentence. The hats and the form would stand without it. The odd-harmonics choice is the one the image talked me into.

### The brief (it is the script's docstring)

- **Image:** as above.
- **Carrier:** a low tuned knock (G♯3 and the F♯ under it), one two-bar cell in three densities, with its dotted-eighth echo. Its story is two lanes, ring and shape; lowpass and drive follow.
- **Event:** one. Bars 70–71, 78–79, 86–87, 94–95: the pad's fourth moves up a semitone (D♯–G♯ to E–A) around a held F♯, and the knock's answer rises to A instead of falling to F♯. Kick and rumble stay on G♯.
- **Visitor:** none.
- **Refused:** a sub bass under the knocks; a held tone or any line over the break; crashes on the section downbeats.

Budget: two pitched voices (knock, pad) over the kick and rumble; one pitched idea; 21 lanes.

I did not show Bart the brief before rendering. He asked for the file, so I went straight to it.

## 4. The score

126 BPM, 128 bars, a 7 s tail, 4:11. Sixteen steps a bar. Hats and shaker swing: odd sixteenths 0.09 of a step late. The knock swings half of that. Kick, clap and tick are straight.

### Clocks

| Clock | What |
|---|---|
| 4 | The kick |
| 2 bars | The knock's cell |
| 7 | A tick every seventh sixteenth of the whole song. Velocities cycle in 5 (1.0, 0.5, 0.7, 0.4, 0.8), pan 0.6·sin(0.83·j). Its echo is five sixteenths |
| 5 | The shaker's accent: every fifth sixteenth at 1.0, the rest at 0.42 |

Gegenlicht's are 4, 3 and 5. The 3 is gone on purpose (it was the toms, and the toms are now the carrier).

### The knock's cell (step in the two bars; `da` is G♯3, `dum` is the answer, `f` a single G♯3; velocity)

- **Sparse:** 6 da 1.0 · 7 dum 0.75 · 26 da 0.8 · 27 dum 0.6
- **Medium:** 6 da 1.0 · 7 dum 0.75 · 13 f 0.5 · 19 f 0.6 · 26 da 1.0 · 27 dum 0.75
- **Full:** medium plus 2 f 0.45 and 30 f 0.4

So the cell is a falling pair ("da-dum", a sixteenth apart) that sits before beat 3 in the first bar and before beat 4 in the second. The answer is F♯3, or A3 in the eight event bars. Three pitches in the whole line.

Measured from the event log: 320 knocks, none on steps 0, 4, 8 or 12. Per two bars: 4, 6 and 8 hits.

I avoided spacing written hits three steps apart, so the echo's repeats fall between them instead of stacking on them. The falling pair is borrowed from Gegenlicht's riff, which has slid pairs a sixteenth apart (E3→D3, C3→B2).

### Form

| Bars | What plays |
|---|---|
| 0–7 | Kick (dry, from the first sample, at 0.8), pad (D♯4 G♯4, dark), tick, noise |
| 8–15 | + rumble, + a closed hat on the off-beat eighth only |
| 16–23 | + the knock, sparse: a 45 ms thud behind a 340 Hz lowpass. Hats on three sixteenths of each beat |
| 24–31 | + open hat on the off-beats |
| 32–39 | Knock medium |
| 40–47 | + clap on 2 and 4. Riser 46–48. Echo thrown to 0.84 at 47.5 |
| 48–55 | Knock full, + shaker |
| 56–63 | + ride. Bar 63: no kick on beats 3–4, no clap on 4, echo thrown to 0.90 |
| 64–71 | **Break.** No kick, rumble, clap, open hat, ride, shaker; closed hats back at 68. Knock medium, ringing 0.20–0.24 s. Pad adds F♯4 and comes up. Event at 70–71. Riser 68–72 |
| 72–79 | Everything except ride and shaker. Knock full. Event 78–79. Riser 78–80 |
| 80–95 | The peak: ride and shaker back, lowpass at 3200 Hz and shape at 6 by bar 88. Events 86–87, 94–95. Bar 95: no kick on beat 4, echo thrown to 0.90 |
| 96–99 | **The floor alone.** No knock, clap, open hat, ride or shaker. The thrown echo dies over kick, rumble, hats, tick, pad |
| 100–107 | Knock medium, closing. Open hats back |
| 108–119 | Knock sparse. Open hats out at 112, closed hats fade to nothing by 120 |
| 120–127 | No kick (the last is beat 4 of bar 119, no fade). Knock sparse to bar 123, echo thrown to 0.90 at 123.5 and held near 0.86. Pad back to two notes. Fade from 127 |

Against Gegenlicht: the break is later (50–55 % against 37–43 %), the way in is dry instead of through a wall, the second subtraction removes the carrier instead of leaving it alone, and the end is the echo instead of the kick walking away.

### Pad

- Bars 0–63 and 120–127: D♯4 G♯4.
- Bars 64–119: D♯4 F♯4 G♯4.
- Event bars: E4 F♯4 A4.

Pitch classes in the whole record: G♯, A, D♯, E, F♯. No third anywhere. Semitones G♯–A and D♯–E, tritone D♯–A.

## 5. The lanes (bar, value; linear between points, ends hold)

| Lane | Points |
|---|---|
| knock ring, s | (16, 0.045) (32, 0.06) (48, 0.085) (63, 0.11) (64, 0.20) (68, 0.24) (71.5, 0.22) (72, 0.12) (80, 0.135) (88, 0.16) (95, 0.15) (100, 0.10) (108, 0.07) (120, 0.055) (128, 0.09) |
| knock lowpass, Hz (log) | (16, 340) (32, 520) (48, 800) (60, 1050) (63.5, 1100) (64, 640) (71, 820) (72, 1500) (80, 1900) (88, 3200) (93, 2800) (96, 1200) (100, 1000) (108, 640) (116, 420) (124, 300) |
| knock shape (1 a sine, 6 a square) | (16, 2.0) (48, 3.0) (63, 3.6) (64, 2.2) (72, 4.0) (88, 6.0) (96, 3.2) (108, 2.4) (124, 2.0) |
| knock drive | (16, 1.2) (48, 1.9) (63, 2.3) (64, 1.2) (72, 2.6) (88, 4.0) (96, 2.2) (108, 1.5) (124, 1.2) |
| knock filter kick, octaves | (16, 1.3) (48, 1.6) (63.5, 1.6) (64, 1.0) (72, 1.7) (88, 1.9) (100, 1.5) (124, 1.2) |
| knock filter kick time, s | (16, 0.09) (64, 0.10) (72, 0.11) (88, 0.15) (100, 0.10) (124, 0.09) |
| knock Q | (16, 1.8) (64, 2.2) (88, 3.6) (104, 2.2) (124, 1.8) |
| knock hall send | (16, 0.35) (48, 0.45) (63, 0.5) (64, 0.75) (71.5, 0.75) (72, 0.45) (96, 0.5) (120, 0.8) |
| echo feedback | (0, 0.38) (46.5, 0.38) (47.5, 0.84) (48.5, 0.42) (62.5, 0.42) (63.5, 0.90) (65, 0.66) (71, 0.66) (72, 0.40) (94.5, 0.40) (95.5, 0.90) (96.5, 0.62) (99.5, 0.50) (100, 0.44) (119, 0.50) (120, 0.70) (122.5, 0.72) (123.5, 0.90) (125, 0.86) (132, 0.80) |
| pad cutoff, Hz | (0, 380) (32, 620) (48, 900) (64, 1500) (72, 1000) (88, 1700) (96, 1100) (108, 800) (128, 380), × (1 + 0.22·sin(2π·bar/9 + 0.6)) |
| pad level | (0, 0) (3, 0.5) (16, 0.5) (40, 0.65) (63, 0.7) (64, 1.0) (71.5, 1.0) (72, 0.7) (95, 0.75) (96, 0.85) (100, 0.7) (112, 0.8) (120, 1.0) (125, 0.8) (130.5, 0) |
| noise | (0, 0) (1, 1.0) (8, 0.7) (64, 1.0) (72, 0.6) (96, 0.9) (100, 0.6) (120, 1.0) (131, 0) |
| hats | (8, 0.45) (16, 0.7) (32, 1.0) (64, 0.9) (68, 0.25) (72, 1.0) (96, 0.9) (100, 0.9) (112, 0.6) (120, 0) |
| tick level | (0, 0) (1, 0.6) (8, 0.8) (64, 1.0) (72, 0.8) (96, 1.0) (100, 0.8) (120, 0.9) (126, 0) |
| tick lowpass, Hz (log) | (0, 1800) (32, 2800) (64, 4200) (88, 7000) (108, 3000) (128, 1500) |
| rumble | (0, 0) (7.5, 0) (8.5, 1) |
| kick gain | (0, 0.8) (8, 1.0) |

Echo throws are at 47.5, 63.5, 95.5 and 123.5, each half a bar before a section ends. There is no throw anywhere else.

## 6. The voices

### What is Gegenlicht's, unchanged except tuning

- **Kick bus and rumble:** the same functions and numbers. The kick lands on G♯1 (51.9 Hz) and decays over 0.13 s instead of 0.125. Its bus filter sits at 16 kHz throughout. The rumble's taps (2 and 3 steps late at 0.45 and 0.7), impulse seed, filters and drive are Gegenlicht's.
- **Both duck envelopes**, the tape echo kernel, the limiter, the hat, ride, shaker and clap generators with the same seeds, the room impulse, the pad's four saws a note with the same detunes and gate smoothing, the pink noise bed, the riser generator.

### The knock (new)

Per hit, two oscillators (left 6 cents flat, right 6 sharp):

1. Pitch starts 35 % high and falls onto the note with a 9 ms time constant.
2. Oscillator = `tanh(shape · sin) / tanh(shape)`: a sine bent toward a square, odd harmonics only. Shape comes from its lane at the hit.
3. × a 1.5 ms attack × `e^(−t/ring)`, ring from its lane at the hit, 7 ring-times long.
4. + 0.22 × a "skin": 12 ms of noise band-passed 700–3200 Hz, 3 ms decay, three round robins.
5. × velocity (± 7 %), 1.2 ms of jitter, panned −0.3 (da), +0.3 (dum), ±0.12 (singles).

Then the bus, per side:

1. Two state-variable lowpasses in series (Q from its lane, then Q 0.7 at 1.25 × the cutoff). Cutoff = lane × 2^(amount × env) × (1 + 0.08·sin(2π·bar/6.5)), clipped to 60–6500 Hz. `env` jumps to a hit's velocity if that is higher and falls with the lane's time constant.
2. A 250 Hz second-order highpass. It takes about 7 dB off the G♯3 fundamental.
3. `tanh(drive · x) / tanh(drive)`.
4. × (1100 / lowpass lane)^0.15, the same idea as Halbschatten's level compensation.
5. × 0.2702 (levelled so bars 80–87 sit at −23 dB RMS before the duck), duck 0.3.

Sends: hall on its lane (0.35–0.8), room 0.25.

### The knock's echo

Three sixteenths × (1 + 0.001·sin(2π·0.19·t)), fed the knock at mix level before its duck, left and right as panned. In the loop: lowpass 3200, highpass 120, drive 1.6. Return × 0.5, duck 0.4, hall 0.5.

### The tick (new)

One sample: sines at D♯5 (30 ms) and D♯6 (18 ms) plus a 1 ms noise click, highpassed at 350. A lowpass a side on its lane (Q 1.0), then dry + 0.6 × a five-sixteenth echo (feedback 0.45, lowpass 4500, highpass 500). Peak −13 dB, duck 0.2, hall 0.6, room 0.3.

It is the nearest thing here to Gegenlicht's ping, and I am not sure it is different enough or does enough. Its stem is −44 dB RMS where the ping is −34.

### Hall

Five seconds, predelay 30 ms, highpass 180 Hz (Gegenlicht's is 300, lowered so the knock's low harmonics reach it). Bands: under 300 Hz 1.8 s × 0.45; 300–1200 Hz 3.6 s × 1.0; 1.2–4 kHz 2.8 s × 0.9; over 4 kHz 1.4 s × 0.45. Return levelled to −24.5 dB on its loud passages, duck 0.5.

### Master

Gegenlicht's chain, with one change: the pregain is 1.42 instead of 1.3. See section 8.

## 7. How the knock got to where it is

This is the part I most want checked. The voice took nine renders, and each change answered a measurement, not a sound.

| Round | Change | What the numbers said |
|---|---|---|
| 1 | Key of F. Knock = a sine with pitch drop, driven per hit | −11.0 LUFS. The 30–60 Hz band 3.4 dB over 60–120 (all sub). The knock had nothing above 250 Hz (500–1k at −44 dB against the acid's −37) |
| 2 | Key up to G♯. Sine shaped toward a square per hit, two detuned oscillators. Tick given a body | Sub balance fixed (−0.2). Mids barely moved |
| 3 | Lanes opened (ring, lowpass, shape, filter kick) | Almost no change: the knock's energy was still its fundamental |
| 4 | A drive on the bus after the filter | Mids up, but the 120–250 Hz band at the peak rose to equal 60–120 (boomy) and the echo sat 2 dB under the dry |
| 5 | Highpass at 170, level compensation, echo return down, hall's low band shortened | Boom gone, mids back down |
| 6 | Highpass at 250, level set from bars 80–87, pad +1 dB, tick longer | Mids at Halbschatten's level, but the knock's peaks topped the kick |
| 7 | Highpass moved before the drive, so the drive bounds the peaks | Peaks under control |
| 8 | Compensation exponent 0.3 → 0.15, knock to −23 dB, echo return 0.5 | Carrier at the acid's level |
| 9 | Filter-kick time on a lane, Q 3.6 at the peak, clap +0.5 dB, pregain 1.42 | −10.4 LUFS |

What this did to the idea: I set out to make a tuned tom. What I ended with is a low, percussive, filtered pulse-like tone with most of its fundamental removed, closer to a short synth stab on two notes than to a drum. That may be fine (it is still a low two-note cell) or it may be a different carrier from the one in the brief.

## 8. The mix, measured

Method: Welch spectrum of the master, power summed per octave band, in dB relative to the 60–120 Hz band. My numbers for Gegenlicht read about 1 dB brighter than `taste.md`'s (−11.9 against −13.1 at 1–2 kHz), so compare within this table only.

### Whole track

| | LUFS | mean dBFS | 120–250 | 250–500 | 500–1k | 1–2k | 2–4k | 4–8k | 8–16k |
|---|---|---|---|---|---|---|---|---|---|
| Halbschatten | −10.2 | −11.0 | −4.7 | −5.7 | −9.2 | −13.4 | −17.9 | −20.9 | −19.5 |
| Gegenlicht | −10.1 | −11.3 | −3.6 | −5.6 | −6.9 | −11.9 | −16.8 | −20.8 | −18.4 |
| **Hohlraum** | **−10.4** | **−11.4** | −3.9 | −5.9 | −9.4 | **−15.0** | **−20.4** | −21.3 | −17.8 |

Hohlraum is 1.6 dB darker than Halbschatten at 1–2 kHz and 2.5 dB at 2–4 kHz, and 3.1 and 3.6 dB darker than Gegenlicht. I stopped there on purpose instead of brightening further without ears.

The cause is structural: Gegenlicht's mids at its peak come from the hall, the ping (−34 dB at 500–1k on its own) and the acid's resonance. Hohlraum has no ping and no resonance to speak of.

### Pre-master stems at the peak (RMS / peak, dBFS)

| Stem | Hohlraum, bars 80–87 | Gegenlicht, bars 72–79 |
|---|---|---|
| kick | −15.6 / −6.8 | −16.8 / −6.7 |
| rumble | −23.3 / −17.0 | −23.2 / −17.2 |
| carrier | knock −23.4 / −12.2 | acid −23.9 / −11.3 |
| hall | −28.2 / −12.8 | −28.5 / −13.5 |
| pad | −30.0 / −15.2 | −31.0 / −15.2 |
| carrier's echo | −30.4 / −16.9 | −31.7 / −12.4 |
| hats | −35.7 / −14.2 | −35.1 / −13.2 |
| clap | −36.2 / −11.0 | −36.2 / −11.0 |
| room | −37.1 / −17.6 | −38.0 / −18.7 |
| ride | −42.4 / −19.5 | −41.1 / −19.1 |
| tick / ping | −44.2 / −13.9 | −33.8 / −17.9 |
| shaker | −44.8 / −18.1 | −42.1 / −19.1 |
| noise | −53.2 | −52.1 |

The knock through the form, RMS by 8-bar block from bar 16: −33.2, −32.0, −29.5, −28.7, −27.3, −26.4, **−23.5** (break), −24.7, −23.4, −24.2, (floor alone), −31.3, −30.5, −32.1, −34.5. Its peaks stay between −9.7 and −12.2 throughout, so it enters as short spikes and becomes dense.

### Two things about the master to challenge

- **Pregain 1.42 instead of 1.3.** At 1.3 the record measured −11.1 LUFS, a full unit under its siblings, with the limiter almost idle (0.6 dB, 1.1 % of samples). At 1.42 it is −10.4 with the limiter at 0.9 dB and 3.6 % (Gegenlicht: 0.8 dB, 4.9 %). I made the loudness match by pushing the master, which is the thing `taste.md` warns about: nothing should be fixed in the master that should have been fixed on a bus. The honest reading is that the mix is thinner than its siblings.
- **The kick is 1.2 dB hotter** in RMS than Gegenlicht's (longer decay, lower note). I left it.

## 9. The blind checks

| Check | Pass | Hohlraum |
|---|---|---|
| Bars where a single-note voice above E4 plays 2 or more pitches | ≤ 35 % | 0 (no such voice; the tick is one pitch) |
| That line's first bar, notes a bar, length | | none |
| The carrier's distinct patterns | ≤ 3 | 3 densities of one cell, the answer note swapped in 8 bars |
| The carrier's hits on steps 0/4/8/12 | ≤ a third | 0 of 320 |
| Bars on the home chord | ≥ 67 % | 94 % (120 of 128) |
| First bar the harmony moves | ≥ 25 % in | bar 70, 55 % |
| A semitone or a tritone in the sounding pitches | yes | both |
| New elements after 60 % | 0 | 0 (the last new things are the pad's F♯ at 64 and the event at 70) |
| 1–2 kHz against 60–120 Hz | ≤ −12 dB | −15.0 by my method (about −16.2 on `taste.md`'s scale) |
| 4–8 kHz against 60–120 Hz | ≤ −19 dB | −21.3 |
| Loudest bus | the kick by 4 dB or more | by 7.7 dB |
| Subtractions | 2 or more | 5: bar 63's half-bar dropout, the break, bar 95's beat 4, the floor alone, the kick stopping at 120 |
| Longest stretch with no lane moving | ≤ 8 bars | 0 |
| The peak (brightest stretch) | under 15 % | bars 80–95, 12.5 % |

`taste.md` says a record can pass every row and still be dull. I think that is the live risk here.

**The mute test** (kick, knock, echo alone) was rendered and checked for level only: it holds between −10.3 and −11.9 dB RMS from bar 0 to 119 and is not silent anywhere the knock plays. Whether it is "still a track" is a listening question I could not answer. The file is on the Desktop.

## 10. What I am unsure about

1. **Does the knock carry?** It has two pitches and a third for eight bars. Gegenlicht's riff has seven. It may read as a tom loop under a track that never arrives.
2. **Is it dull?** No ping, no visitor, a static pad. The record leans entirely on the lanes.
3. **The timbre.** A low square through a lowpass can read as a game sound (the Abyss fix) or a hollow organ bass. I kept it under 3.2 kHz and percussive, but I chose the square partly because the image asked for it.
4. **The 250 Hz highpass.** It was put there to make the carrier audible on a laptop and to clear the rumble. It also takes the weight out of something I called a knock.
5. **The drive after the filter.** At the peak (drive 4.0) two knocks a whole step apart intermodulate. I wanted that as growl; it may be mud.
6. **The break.** Knocks ringing a quarter second into an echo at 0.66 feedback, with the hall send at 0.75, is the wettest passage by far (the hall equals the dry knock at −23.6 dB). It may wash out.
7. **The event.** A semitone up over a pedal is the darkest option I had, and the most theatrical. Two bars in eight, four times.
8. **The ending.** The kick stops with no fade and the echo is left at 0.86–0.90 feedback into the master fade. It may sound like a mistake.
9. **Process.** Nine rounds of fixing a sound by its spectrum is "matching the mix and calling it done" with extra steps. The two records that worked were written from restraint and heard before anything else.

## 11. Questions for you

1. Is a tuned knock a real carrier in your sense, or did I pick the item on the list that most needs ears to get right?
2. Would you have kept the odd-harmonics shape, or is that the image writing the record?
3. Gegenlicht's ping does a lot of quiet work in the mids. Should a record like this have its own "one pitch", or is the tick enough? If it needs one, what would you use that is not the ping again?
4. Is three pitches in the carrier too few, given the riff in Gegenlicht has seven and its filter still tells the story?
5. Is the pregain change acceptable, or should the level come from the buses (and which)?
6. Is the floor alone (96–99) a subtraction that works after a peak, or does it just stop the record?
7. Which numbers in section 5 would you change first, without hearing it?
8. Should `taste.md` gain a row for "the carrier's energy above 500 Hz against its fundamental" or similar? Round 1 passed every existing row with a carrier that was close to inaudible on small speakers.

## 12. If it is ported later

Not asked for yet; noted so the cost is known. On the acid rack (`AcidRack.swift`) the kick bus, rumble, both ducks, tape echo, gated pad, per-hit pans, log lanes and both reverbs are already there. New: the knock voice (two oscillators and an envelope per hit, the bus filter with its envelope, the highpass, the drive, the compensation), the tick's five-step echo, and three lanes read at the hit (ring, shape) or per sample (filter-kick time). The reference logs its own events (`parts/events.json`, with each knock's ring and shape at its moment) and gains.
