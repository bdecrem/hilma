# Irrlicht: a sixth record for the rack, from its reference

For Claude Code. Bart, 2026-11-10, on hearing `misc/irrlicht_reference.mp3`: "Fantastic! Do a handoff package for it." He had asked for "another track in the style of hannes bieger"; this is that track. Its notes are new, nothing is taken from his records.

Irrlicht is melodic techno in B minor at 124, 128 bars and an 8 s tail, 4:16. Claude rendered it in Python the way it rendered the others. The method is `apps/takt/DUB-TECHNO.md` §8 and nothing about it changes: run the reference, take its own sounds, port per sample at its own levels, solo every bus and null it.

If Streulicht is on the rack, so is most of this. The ladder filter, the oscillator and the control function are Streulicht's, line for line (`STREULICHT.md` §4.1–4.3). One block is new: a frequency shifter, on a voice that can also simply be baked. Section 4 is the list.

## 1. Files in this drop

| File | What it is |
|---|---|
| `misc/IRRLICHT.md` | this |
| `misc/irrlicht_reference.py` | the record. numpy, scipy, numba, 44.1 kHz |
| `misc/irrlicht_reference.mp3` | what Bart heard |
| `misc/irrlicht/reference.flac` | the same master, lossless (16-bit, 44.1 kHz). The script's `out.wav` is this bit for bit |
| `misc/irrlicht/parts/*.wav` | float32, 44.1 kHz: `kick`, `clap_0..1`, `hat_open_0..1`, `tom_47`, `tom_54`, `hat_noise` (6 s; every closed hat is cut from it), `ir_hall`, `ir_room` (stereo), and `noise_bed_first_32s.flac` |
| `misc/irrlicht/parts/shadow_bus.flac` | the shadow voice whole, stereo, 24-bit, before its gain and duck (section 4.2). The script writes it as float32 `shadow_bus.wav` |
| `misc/irrlicht/parts/gains.json` | every auto-levelled gain, resolved |
| `misc/irrlicht/parts/events.json` | every event as it was placed |
| `misc/irrlicht/parts/drift.json` | the five slow wanders of pitch and cutoff (section 4.4) |

**The reference logs itself.** `python3 misc/irrlicht_reference.py out.wav <dir>/stems` writes the 14 pre-master stems and `<dir>/parts/` again, events included. The log draws nothing from the random stream. Still assert `out.wav` against `reference.flac`.

`events.json` is `{sr, tempo, bars, tail, events}`. Every event starts with its **sample index at 44.1 kHz** (swing and jitter already in it):

| key | fields after the sample |
|---|---|
| `kick` | none |
| `bass` | midi, gate length in samples, accent 0/1, slide 0/1, velocity |
| `lead` | midi, gate length in samples, legato 0/1, velocity |
| `clap`, `ohat` | gain, round robin |
| `hat` | gain (hat lane in it), decay in seconds, length in samples, offset into `hat_noise`, pan |
| `tom` | midi, gain, pan |
| `pad` | not events: `[midi, L1, L2, L3, R1, R2, R3]` start phases per note |

## 2. The record

Sixteen steps a bar; one step is 5334.68 samples. The closed hats swing: odd sixteenths late by 0.04 step. The bass and the kick come off sequencers: straight, no jitter. The lead is played by hand: 12 ms of jitter, in the log.

### The bass

Every sixteenth of every bar. The pattern is two bars and never changes:

- **Bar 1:** B1 B1 **B2** B1 · B1 B1 D2 B1 · B1 **B2** B1 B1 · A1 B1 **B2** B1
- **Bar 2:** B1 B1 **B2** B1 · B1 F#2 D2 B1 · B1 **B2** B1 A1 · B1 D2 F#2 E2

In bars 0–7 every note is B1. In bars 8–15 only B1 and B2 sound. The whole pattern runs from bar 16. The E2 that ends bar 2 slides down into the next B1 (every even bar from 18). Velocity by position in the beat: 0.8, 0.86, 0.96, 0.86. The gate length follows a lane (0.55 to 0.85 step); it is in the log.

### The accent

The accent is a brighter, louder note. It does not belong to the pattern: it runs in a cycle of its own, counted in sixteenths from the first bar of each line below, and lights the given step of the cycle.

| from bar | cycle | lit step |
|---|---|---|
| 0 | 4 | 2 (the off-beat eighth: it stands still) |
| 16 | 3 | 0 |
| 48 | 5 | 0 |
| 56 | 3 | 0 |
| 88 | 5 | 0 |
| 104 | 4 | 2 (home again) |

With a cycle of 3 or 5 the lit note lands somewhere new in every bar. That is the track. The log carries the accent of every note.

### Drums

- **Kick** on every beat: bars 4–55, 64–95, 100–123. Bars 55 and 95 have beats 1 and 2 only.
- **Clap** on steps 4 and 12: bars 24–54, 64–94, 100–111.
- **Closed hat** on all sixteen steps: bars 8–55, 64–95, 100–119, with one pickup hit on the last sixteenth of bars 63 and 99. Velocities cycle in eleven on the global sixteenth count (0.9, 0.3, 0.55, 0.34, 1.0, 0.3, 0.6, 0.5, 0.8, 0.34, 0.5). Each hit has its own decay; every eighth bar ends in a small fill. All of it is in the log.
- **Open hat** on steps 2, 6, 10, 14: bars 32–55, 64–95, 100–111.
- **Toms** on odd bars: B2 on step 7, F#3 on step 13. Bars 41–55, 65–95, 101–115.

### Form

| bars | what plays |
|---|---|
| 0–3 | the bass alone on B1, nearly closed, in the hall. Noise |
| 4–7 | + kick |
| 8–15 | + closed hats. The bass adds its octave |
| 16–23 | the whole bass pattern. The accent starts to wander (cycle of 3). The bass's echo comes in |
| 24–31 | + clap. The pad fades in from 22 |
| 32–39 | + the shadow, + open hat |
| 40–47 | + toms. The pad moves one finger on bars 46–47, and again every eighth bar |
| 48–55 | the accent in 5. Bar 55: kick on beats 1–2 only, no clap, the echo thrown to 0.74 |
| 56–63 | break: no drums. The bass goes on, held longer, its filter opening and ringing. The shadow's shift climbs from 6 Hz to 24 Hz |
| 64–71 | everything, the accent in 3 |
| 72–87 | + the lead (P1 P2 P1 P2) |
| 88–95 | the peak: the accent in 5, the filter widest. Bar 95 as bar 55 |
| 96–99 | second break: bass, shadow, pad, no drums. The shift is at its widest, 28 Hz, as the break starts, and falls back through it |
| 100–111 | drums back. From 104 the accent is home on the off-beat; the lead once more (P1 P2), quieter and darker |
| 112–119 | no clap, no open hat. The bass closing, the shadow leaving |
| 120–123 | kick, bass, pad |
| 124–127 | the bass alone with pad and hall, then the tail |

### The pad

A is C#4 D4 A4. B is C#4 D4 G4: one finger. B sounds on the last two bars of every eight (bars 46–47, 54–55, … 110–111), A everywhere else. Silent before bar 22.

### The lead (bar of the phrase, step, note, length in steps)

- **P1:** 1: 4 F#5 10 · 2: 0 E5 6, 8 D5 8 · 3: 2 C#5 12 · 4: 0 B4 6, 6 C#5 8
- **P2:** 1: 4 F#5 10 · 2: 0 A5 8, 10 F#5 6 · 3: 0 E5 6, 6 D5 10 · 4: 2 C#5 12

Phrases start at bars 72, 76, 80, 84 and 104, 108. Legato (no new attack, the pitch glides): the last C#5 of P1; the E5 and the D5 of P2's third bar. The log carries the flag and the gate lengths.

**The scale is B minor: two black keys, F# and C#.**

## 3. What the rack already does

Port these as the other records' were; only the numbers differ (section 5).

- From Streulicht: `ladder`, `osc_moog`, `seq_ctrl`, the closed hat cut from `hat_noise` (`STREULICHT.md` §4.7), the pad through a ladder (§4.8), drift (§4.6), the duck envelope (the same numbers here: 2 ms, 35 ms hold, `e^(−(t − 0.035)/0.1)`, 0.45 s).
- `tape_delay`, two instances.
- The hall and the room by convolution, with this record's impulses (predelay 40 ms and 5 ms: 1764 and 220 frames at 44.1 kHz).
- Kit buses with sends, round robins, the noise bed looped, lanes, the master's shape.
- The four traps of §8 all apply. The centre pan is −3 dB a side here too (kick, bass).

## 4. What is new here

### 4.1 The bass voice

**The oscillators and the ladder run from sample 0 and never stop; the gate is only the amp.** Your keys on the melody part need this voice live.

- Control (`seq_ctrl`): attack 1.2 ms; decay, sustain and envelope from lanes; release 0.02 s; glide 4 ms, and 30 ms for the length of a slid note's gate; starts at B1.
- Pitch × drift 21. Pulse width = 0.5 + 0.14·sin(2π·bar/11).
- Oscillator 1 at the pitch, phase 0: saw and pulse. Oscillator 2: saw at +6 cents × drift 22, phase 0.4.
- Mix = 0.6·saw₁ + 0.45·pulse₁ + 0.4·saw₂, × 0.5 into the ladder.
- Ladder cutoff = base × 2^(amount × envelope) × drift 23, clipped to 45–3800 Hz. Resonance from a lane. Drive 1.6.
- Then `tanh(1.6 × y × amp × 3.2) / 1.6`, a 30 Hz 2nd-order Butterworth highpass, × 0.698241, duck 0.5, centre.

An accented note starts its envelope at 1.4 instead of 1 and is 1.3 times as loud; that is all the accent is.

### 4.2 The shadow, and the frequency shifter

A second voice on B1 that never changes note. What changes is how far it is shifted.

1. Pitch = B1 (61.74 Hz) × drift 41. A saw at the pitch (phase 0.2) and a pulse an octave up (phase 0.6, width 0.5 + 0.3·sin(2π·bar/3)).
2. (0.6·saw + 0.5·pulse) × 0.4 into a ladder: cutoff from a lane × (1 + 0.45·sin(2π·bar/2.5 + 0.4)), resonance 2.3, drive 1.5.
3. **The shift.** Take the analytic signal a(t) of that (the script uses `scipy.signal.hilbert` over the whole signal). With φ(t) = 2π·Σ shift/sr: left = Re(a·e^(+jφ)), right = Re(a·e^(−jφ)). Every partial moves by the same number of hertz, up on the left and down on the right. The shift is on a lane, 0.4 Hz to 28 Hz.
4. × the level lane, a 120 Hz highpass and a 3200 Hz lowpass (both 2nd-order Butterworth), × 0.457481, duck 0.6.

**Two ways to port it.** No key plays this voice and it is the same every time, so `shadow_bus.flac` (the result of steps 1–4 before the gain and the duck) can be played as a long sample: that nulls. A live shifter needs a causal Hilbert pair (two allpass chains) and will not null against the script's FFT one; judge it by ear and by octave bands if you build it.

### 4.3 The lead

- Control: attack 20 ms; decay 1.0 s toward 0.75; release 0.25 s; envelope 0.7 s; glide 80 ms always; starts at F#5; the legato flags are its slides; no accents.
- Vibrato: `held` = (amp > 0.5) through a one-pole lowpass at 1.0 Hz; depth = clip(1.5·held − 0.35, 0, 1). Pitch × (1 + 0.0045·sin(2π·4.9·t)·depth) × drift 31.
- Pulse width = 0.36 + 0.08·sin(2π·0.23·t). Oscillator A at +3 cents, phase 0.1: saw and pulse. Oscillator B: pulse at −4 cents, phase 0.55.
- Mix = 0.35·saw_A + 0.5·pulse_A + 0.45·pulse_B, × 0.5 into the ladder.
- Ladder cutoff = base × 2^(1.0 × envelope) × (pitch / 739.99 Hz)^0.5, clipped to 80–8000 Hz. Resonance 1.3, drive 1.3.
- Then `tanh(1.3 × y × amp × 1.4) / 1.3`, a 200 Hz highpass, × the level lane, × 0.335010, duck 0.1, pan −0.08.

### 4.4 Drift

As in Streulicht: `drift.json` has each as a unit curve at 100 Hz with its depth in cents; value at sample n = `2^(interp(n/441, curve) × cents / 1200)`.

| key | on | depth |
|---|---|---|
| 21 | the bass's pitch | 2.5 cents |
| 22 | the bass's oscillator 2 | 2.5 |
| 23 | the bass's cutoff | 20 |
| 41 | the shadow's pitch | 4.0 |
| 31 | the lead's pitch | 1.5 |

### 4.5 Smaller things

- **The bass's echo hears only its top.** Input = the bass, mono, before its duck and pan, through a 420 Hz 2nd-order highpass, × the bass's gain × the send lane. `side = floor(8 × bar position) mod 2`, smoothed by a centred 400-sample boxcar; left in = input × (1 − side), right in = input × side.
- **The lead's echo:** input = the lead, mono, at its gain, before its duck and pan, × 0.5. **Right** input only.
- **The hall's input is highpassed:** the sum of the sends goes through a 180 Hz 2nd-order highpass before the impulse. The bass's send to the hall is on a lane.
- **Pans:** clap +0.05, open hat −0.2. Closed hats and toms carry theirs per event.
- **Bake:** the closed-hat bus's 11 kHz lowpass and the open-hat bus's 10.5 kHz lowpass (both 2nd-order Butterworth).
- **The pad:** four notes (61 62 67 69), built as Streulicht's (same cents, same ladder, same gate smoothing), a 200 Hz highpass, × 0.229043, duck 0.5.
- **The master:** 25 Hz highpass, the fade starts at bar 128 and runs through the tail, **tanh(1.375x)/1.1**, limiter at 0.70 (at most 1.0 dB, 6.6 % of samples), × 1.271429.

## 5. Numbers

### Lanes (bar, value). `np.interp`: the end values hold outside the range. Time constants: interpolate τ, then convert.

| lane | points |
|---|---|
| bass decay τ, s | (0, 0.12) (56, 0.24) (64, 0.13) (96, 0.22) (100, 0.13) |
| bass sustain | (0, 0.3) (55, 0.3) (56, 0.5) (63, 0.5) (64, 0.3) (95, 0.3) (96, 0.45) (99, 0.45) (100, 0.3) |
| bass envelope τ, s | (0, 0.06) (32, 0.075) (56, 0.16) (64, 0.07) (88, 0.10) (104, 0.07) |
| bass base, Hz (log) | (0, 85) (8, 110) (16, 170) (32, 250) (48, 330) (56, 260) (60, 700) (63.5, 1300) (64, 300) (72, 280) (88, 480) (96, 380) (99, 900) (100, 330) (112, 220) (120, 140) (127, 85) |
| bass amount, octaves | (0, 1.6) (16, 2.2) (56, 1.4) (64, 2.5) (88, 2.9) (104, 2.3) (124, 1.5) |
| bass resonance | (0, 0.5) (32, 0.9) (56, 1.6) (63, 2.0) (64, 1.0) (88, 1.5) (104, 0.9) (127, 0.5) |
| bass send to its echo | (0, 0) (12, 0) (16, 0.5) (32, 0.6) (55, 0.7) (56, 0.8) (63.5, 0.8) (64, 0.6) (95.5, 0.7) (96, 0.8) (99.5, 0.8) (100, 0.6) (120, 0.8) (127, 1.0) |
| bass echo feedback | (0, 0.45) (54.5, 0.45) (55.5, 0.74) (57, 0.6) (63.5, 0.6) (64, 0.42) (94.5, 0.42) (95.5, 0.74) (97, 0.58) (100, 0.42) (120, 0.5) (126, 0.66) (132, 0.6) |
| bass send to the hall | (0, 0.5) (8, 0.3) (16, 0.12) (55, 0.12) (56, 0.5) (63.5, 0.55) (64, 0.1) (95.5, 0.12) (96, 0.5) (99.5, 0.5) (100, 0.1) (120, 0.25) (124, 0.5) (128, 0.6) |
| shadow cutoff, Hz | (32, 300) (48, 420) (56, 500) (63, 900) (64, 420) (88, 700) (96, 850) (104, 480) (120, 280) |
| shadow shift, Hz (log) | (32, 0.4) (48, 2.0) (56, 6.0) (63, 24.0) (64, 1.5) (88, 9.0) (96, 28.0) (100, 3.0) (120, 0.5) |
| shadow level | (0, 0) (32, 0) (36, 0.7) (55, 0.8) (56, 1.0) (63.5, 1.0) (64, 0.7) (95.5, 0.8) (96, 1.0) (100, 0.75) (116, 0.5) (122, 0) |
| lead base, Hz | (72, 800) (80, 1050) (88, 1150) (104, 750) (112, 700) |
| lead level | (72, 0.85) (76, 1.0) (88, 1.0) (104, 0.75) (112, 0.75) |
| pad cutoff, Hz | (0, 400) (24, 500) (40, 700) (56, 1200) (62, 1600) (64, 800) (88, 1250) (96, 1450) (104, 900) (120, 550) (128, 380), × (1 + 0.18·sin(2π·bar/5 + 0.7)) |
| pad level | (0, 0) (22, 0) (28, 0.45) (40, 0.6) (55, 0.7) (56, 1.0) (63.5, 1.0) (64, 0.6) (95.5, 0.7) (96, 1.0) (99.5, 1.0) (100, 0.65) (120, 0.8) (126, 0.7) (131.5, 0) |
| noise | (0, 0) (1, 1.0) (8, 0.8) (56, 1.0) (64, 0.6) (96, 0.9) (100, 0.6) (124, 1.0) (131.5, 0) |

The bass's gate lane and the hat level and decay lanes are already in the events.

### The echoes

- **Bass:** 3 steps × (1 + 0.0011·sin(2π·0.17·t) + 0.0003·sin(2π·2.3·t)), lowpass 2600, highpass 420, drive 1.4, feedback from its lane. Return × 0.85, duck 0.3.
- **Lead:** 6 steps × (1 + 0.0015·sin(2π·0.13·t)), lowpass 2400, highpass 350, drive 1.3, feedback 0.46. Return × 0.8, duck 0.2.

### Sends, after each bus's gain and duck

- **Hall** (`ir_hall`): the bass × its lane, bass echo 0.6, shadow 0.5, lead 0.7, lead echo 0.6, pad 0.9, clap 0.35, toms 0.4, open hat 0.1. Return × 0.420473, duck 0.4.
- **Room** (`ir_room`): clap 0.7, closed hats 0.35, open hat 0.3, toms 0.4. Return × 0.646777, no duck.

### Gains and ducks

| bus | gain | duck |
|---|---|---|
| kick | 0.62 | |
| bass | 0.698241 | 0.5 |
| shadow | 0.457481 | 0.6 |
| lead | 0.335010 | 0.1 |
| clap | 0.339785 | |
| closed hats | 0.579479 | |
| open hat | 0.547182 | |
| toms | 0.260702 | |
| pad | 0.229043 | 0.5 |
| bass echo | 0.85 on the return | 0.3 |
| lead echo | 0.8 on the return | 0.2 |
| noise | 0.054752 | |

The noise is pink (Halbschatten's filter coefficients) through a 500 Hz highpass, with no crackle. It is not a tile: the script draws all 256 s. Looping the 32 s file will null as Halbschatten's did.

## 6. Checks

Pre-master stems, bars 72–79, dBFS:

| stem | RMS | peak |
|---|---|---|
| kick | −14.6 | −6.9 |
| bass | −20.4 | −6.0 |
| lead | −26.9 | −16.8 |
| hall | −27.3 | −11.9 |
| shadow | −28.7 | −16.8 |
| pad | −32.6 | −19.3 |
| clap | −35.7 | −12.1 |
| lead_echo | −36.5 | −23.4 |
| hats | −37.3 | −12.6 |
| echo | −37.3 | −14.3 |
| ohat | −37.8 | −13.6 |
| toms | −37.8 | −15.0 |
| room | −39.7 | −19.1 |
| noise | −52.8 | −38.8 |

The master as measured: −10.3 LUFS, mean −10.7 dBFS, true peak −0.7 dBFS, 255.7 s. Octave bands against `reference.flac` in bars 0–7, 16–23, 48–51, 56–63, 72–79, 88–91, 96–99, 124–127: those passages hold every block that is new.

Then Bart's ears, the mp3 against the app, headphones and speakers. The bass's root is 62 Hz and the kick's is 46 Hz, so a phone speaker shows only their upper halves.

## 7. Song and parts

`scripts/songs/irrlicht.py` → `song-irrlicht.json`: "Irrlicht", Melodic Techno, B minor, 124. The record alone first, matched; then the parts.

- **Chords:** the pad's three notes. One finger moves, A4 to G4 and back.
- **Melody:** the bass. It is the record's carrier and it plays every sixteenth of every bar, so the chart never lacks notes. Sixteenths at 124 are fast. A lower level could take **the accented notes only**: they are a real part, they move across the bar by themselves, and they are what the ear follows.
- **The lead** is the visitor: 36 notes in 24 of 128 bars. Leave it to the record, or offer it as a second line; do not extend it to fill bars.

Weights, levels and fingering are `takt-chart`'s call.

Not checked here: nothing in this note has been built or run in Swift. It assumes Streulicht's blocks as `STREULICHT.md` described them; if they were built differently, the script decides.
