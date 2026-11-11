# Streulicht: a fifth record for the rack, from its reference

For Claude Code. Bart, 2026-11-10, with `misc/streulicht_reference.mp3` in hand: "make a handoff bundle for streulicht." He had asked for "a track in the style of bieger" (Hannes Bieger); this is that track. Its notes are new, nothing is taken from his records.

Streulicht is melodic techno in E minor at 122, 128 bars and an 8 s tail, 4:20. Claude rendered it in Python the way it rendered the other three. The method is `apps/takt/DUB-TECHNO.md` §8 and nothing about it changes: run the reference, take its own sounds, port per sample at its own levels, solo every bus and null it.

This record needs more engine than Restlicht did. Every pitched voice here is a Moog-shaped one: its own oscillator, its own control function and a four-pole ladder filter the rack does not have. Section 4 is the list.

## 1. Files in this drop

| File | What it is |
|---|---|
| `misc/STREULICHT.md` | this |
| `misc/streulicht_reference.py` | the record. numpy, scipy, numba, 44.1 kHz |
| `misc/streulicht_reference.mp3` | what Bart has |
| `misc/streulicht/reference.flac` | the same master, lossless (16-bit, 44.1 kHz). The script's `out.wav` is this bit for bit |
| `misc/streulicht/parts/*.wav` | float32, 44.1 kHz: `kick`, `clap_0..1`, `hat_open_0..1`, `hat_noise` (6 s; every closed hat is cut from it, section 4.7), `ir_hall`, `ir_room` (stereo), and `noise_bed_first_32s.flac` |
| `misc/streulicht/parts/gains.json` | every auto-levelled gain, resolved |
| `misc/streulicht/parts/events.json` | every event as it was placed |
| `misc/streulicht/parts/drift.json` | the six slow wanders of pitch and cutoff (section 4.6) |

**The reference logs itself.** `python3 misc/streulicht_reference.py out.wav <dir>/stems` writes the 13 pre-master stems and `<dir>/parts/` again, events included. The log draws nothing from the random stream. Still assert `out.wav` against `reference.flac`.

`events.json` is `{sr, tempo, bars, tail, events}`. Every event starts with its **sample index at 44.1 kHz** (swing and jitter already in it):

| key | fields after the sample |
|---|---|
| `kick` | none |
| `line` | midi, gate length in samples, accent 0/1, velocity |
| `bass` | midi, gate length in samples, accent 0/1, slide 0/1, velocity |
| `lead` | midi, gate length in samples, legato 0/1, velocity |
| `clap`, `ohat` | gain (the open-hat lane already in it), round robin |
| `hat` | gain (hat lane in it), decay in seconds, length in samples, offset into `hat_noise`, pan |
| `pad` | not events: `[midi, L1, L2, L3, R1, R2, R3]` start phases per note |

## 2. The record

Sixteen steps a bar; one step is 5422.13 samples. The closed hats swing: odd sixteenths late by 0.04 step. The line, the bass and the kick come off sequencers: straight, no jitter. The lead is played by hand: 12 ms of jitter, in the log.

### The line

One row of eight stages, as on a step sequencer: **E3 B3 G3 D4 E3 F#4 B3 A3**. Accents on stages 1 and 6. One stage per sixteenth. The stage counter restarts at each section below and wraps at that section's length, so with 7 or 6 stages the row drifts against the bar.

| bars | stages in use |
|---|---|
| 0–15 | 8, stage 5 silent |
| 16–31 | 8 |
| 32–55 | 7 |
| 56–63 | 6 |
| 64–95 | 7 |
| 96–103 | 6 |
| 104–127 | 8 |

In bars 88–103 stage 6 is G4, not F#4. The gate length follows a lane (0.55 to 0.95 step); it is in the log.

### The bass

Every sixteenth, E2. Velocity by position in the beat: 0.6, 0.82, 1.0, 0.86. Accent on the third sixteenth of each beat. Gate 0.62 step, 0.8 on the fourth. On bars where `bar % 4 == 3`, step 14 is E3. On bars where `bar % 8 == 7`, step 15 is D2, and the E2 that opens the next bar is slid into (bars 24, 32, 40, 48, 72, 80, 88, 112). Bars 16–55, 64–95, 104–119.

### Drums

- **Kick** on every beat: bars 8–55, 64–95, 100–123. Bars 55 and 95 have beats 1 and 2 only.
- **Clap** on steps 4 and 12: bars 32–54, 64–94, 104–111.
- **Closed hat** on all sixteen steps: bars 12–55, 64–95, 100–119, with one pickup hit on the last sixteenth of bars 63 and 99. Velocities cycle in eight (1.0, 0.34, 0.6, 0.3, 0.85, 0.36, 0.55, 0.45), rotated by `(bar // 8) % 8` steps from bar 64. Each hit has its own decay. On bars where `bar % 8 == 7` the last four hits open up into a small fill. All of it is in the log.
- **Open hat** on steps 2, 6, 10, 14: bars 24–55, 64–95, 104–111.

### Form

| bars | what plays |
|---|---|
| 0–7 | the line alone, nearly closed, in the hall. Noise |
| 8–15 | + kick. Closed hats fade in from 12 |
| 16–23 | + bass, dark. The line plays all 8 stages. The pad fades in |
| 24–31 | + open hat |
| 32–39 | + clap. The line drops to 7 stages; its third oscillator, an octave up, comes in |
| 40–55 | the pad moves one finger on bars 43, 47, 51, 55. Bar 55: kick on beats 1–2 only, no clap, the echo thrown to 0.74 |
| 56–63 | break: no drums, no bass. The line on 6 stages, gliding, held, its filter opening. Pad two bars a chord |
| 64–71 | everything, 7 stages |
| 72–87 | + the lead (P1 P2 P1 P2). The line's filter is pulled back under it |
| 88–95 | the peak: the filter widest, stage 6 tuned up to G4. Bar 95 as bar 55 |
| 96–103 | second break, 6 stages. Kick and closed hats return at 100; no bass, clap or open hat |
| 104–111 | everything, 8 stages. The lead once more (P1 P2), quieter and darker |
| 112–119 | no clap, no open hat. The line closing |
| 120–123 | kick, line, pad |
| 124–127 | the line alone with pad and hall, then the tail |

### The pad

A is B3 D4 F#4. B is C4 D4 F#4: one finger.

- Bars 0–39 and 104–127: A (silent before bar 14)
- Bars 40–55 and 64–103: B on bars where `bar % 4 == 3`, otherwise A
- Bars 56–63: A A B B A A B B

### The lead (bar of the phrase, step, note, length in steps)

- **P1:** 1: 0 B4 10, 12 D5 4 · 2: 0 E5 13 · 3: 2 D5 6, 10 B4 6 · 4: 0 G4 4, 4 F#4 10
- **P2:** 1: 0 B4 10, 12 D5 4 · 2: 0 G5 10, 12 F#5 4 · 3: 0 E5 8, 10 D5 6 · 4: 0 B4 14

Phrases start at bars 72, 76, 80, 84 and 104, 108. A note that starts while the one before is still held is legato: no new attack, the pitch glides (in P1 the E5, the G4 and the F#4; in P2 the G5, the E5 and the last B4). The log carries the flag and the gate lengths.

**The scale is E minor: one black key, F#.**

## 3. What the rack already does

Port these as the other records' were; only the numbers differ (section 5).

- `tape_delay` is the same function. Two instances here.
- The hall and the room by convolution, with this record's impulses (predelay 40 ms and 5 ms: 1764 and 220 frames at 44.1 kHz).
- Kit buses with sends, round robins, the noise bed looped, lanes, the master's shape.
- The gated pad of `GEGENLICHT.md` §4.5, with a different filter (section 4.8).
- The four traps of §8 all apply. The centre pan is −3 dB a side here too (kick, bass).

## 4. What the rack does not have yet

### 4.1 The ladder filter

`ladder(x, fc, res, drive)` in the script; port it line for line. Per sample:

- `g = tan(π·fc/sr)` with fc capped at 0.45·sr; `G = g/(1 + g)`
- `S = (G³·s1 + G²·s2 + G·s3 + s4)·(1 − G)`
- `u = (x·(1 + 0.5·res) − res·S) / (1 + res·G⁴)`, then `u = tanh(drive·u)/drive`
- four one-pole stages in series, each `v = (in − s)·G; out = v + s; s = out + v`. The output is the fourth stage's.

Cutoff and resonance are per sample. States start at 0 and it runs from sample 0.

### 4.2 The oscillator

`osc_moog(freq, pw, phase0)`: one phase gives a PolyBLEP saw and a PolyBLEP pulse (+1 while phase < width). Pitch and pulse width are per sample. Free-running from sample 0.

### 4.3 The control function

`seq_ctrl`, the successor to `acid_ctrl`. Port it line for line. What differs:

- A velocity per note. Out = level × velocity × (1 + 0.3·accent).
- The attack time is a parameter.
- After the attack the level moves toward a **sustain** with a **decay** coefficient; gate off, it falls by a **release** coefficient. All three are per sample, so they can be lanes.
- The filter envelope is set to 1 + 0.4·accent at a note's start and falls by a per-sample coefficient.
- Glide is a per-sample coefficient: `cur = tgt + (cur − tgt)·gl`. 0 means the pitch jumps.
- A slid (legato) note arriving while the gate is open keeps the level, the envelope and the velocity where they are.
- The pitch starts at a given frequency.

Every time constant τ becomes a coefficient by `e^(−1/(τ·sr))`, and 0 when τ is 0. Lanes are lanes of τ: interpolate τ, then convert.

### 4.4 The three voices

**The oscillators and the ladder of each voice run from sample 0 and never stop; the gate is only the amp.**

**The line** (your keys on the melody part need this one live):

- Control: attack 1.5 ms; decay, sustain, release, envelope and glide from lanes; starts at E3; no slides.
- Pitch × drift 11. Pulse width = 0.5 + 0.13·sin(2π·bar/9).
- Oscillator 1 at the pitch, phase 0: saw and pulse. Oscillator 2: saw at −7 cents × drift 12, phase 0.31. Oscillator 3: saw an octave up at +5 cents × drift 13, phase 0.67.
- Mix = 0.6·saw₁ + (pulse lane)·pulse₁ + 0.45·saw₂ + (osc 3 lane)·saw₃, × 0.5 into the ladder.
- Ladder cutoff = base × 2^(amount × envelope) × (pitch / 164.81 Hz)^0.35 × drift 14, clipped to 60–4200 Hz. Resonance from a lane. Drive 1.4.
- Then `tanh(d × y × amp × 2.2) / d` with d from the drive lane, a 95 Hz 2nd-order Butterworth highpass, × 0.543083 × the level lane, duck 0.22, pan −0.06.

**The bass:**

- Control: attack 1.2 ms; decay 0.13 s toward 0.3; release 0.02 s; envelope 0.075 s; glide 4 ms, and 30 ms for the length of a slid note's gate; starts at E2.
- Pitch × drift 21. A saw at the pitch (phase 0) × 0.75 plus a pulse of width 0.5 one octave down (phase 0.25) × 0.4, × 0.6 into the ladder.
- Ladder cutoff = base × 2^(2.2 × envelope), clipped to 50–5000 Hz. Resonance 0.6, drive 1.6.
- Then `tanh(1.5 × y × amp × 2.2) / 1.5`, a 32 Hz highpass, × 0.603550, duck 0.5, centre.

**The lead:**

- Control: attack 14 ms; decay 0.9 s toward 0.72; release 0.22 s; envelope 0.55 s; glide 65 ms always; starts at B4; the legato flags are its slides; no accents.
- Vibrato: `held` = (amp > 0.5) through a one-pole lowpass at 1.1 Hz; depth = clip(1.5·held − 0.35, 0, 1). Pitch × (1 + 0.0042·sin(2π·5.3·t + 0.4·sin(2π·0.31·t))·depth) × drift 31.
- Oscillator A at +4 cents, phase 0.1, pulse width 0.42: saw and pulse. Oscillator B: saw at −4 cents, phase 0.55. Oscillator C: pulse of width 0.5 one octave down, phase 0.8.
- Mix = 0.55·saw_A + 0.5·saw_B + 0.3·pulse_A + 0.25·pulse_C, × 0.5 into the ladder.
- Ladder cutoff = base × 2^(0.9 × envelope) × (pitch / 493.88 Hz)^0.5, clipped to 80–9000 Hz. Resonance 1.1, drive 1.3.
- Then `tanh(1.3 × y × amp × 1.4) / 1.3`, a 180 Hz highpass, × the level lane, × 0.469284, duck 0.1, pan +0.08.

### 4.5 Two echoes

- **The line's.** Input = the line, mono, at its gain and level lane, **before** its duck and pan, × the send lane. `side = floor(8 × bar position) mod 2` (it swaps every eighth note), smoothed by a centred 400-sample boxcar. Left in = input × (1 − side), right in = input × side.
- **The lead's.** Input = the lead, mono, at its gain, before its duck and pan, × 0.5. Left input only.

Numbers in section 5.

### 4.6 Drift

Six slow wanders, so that nothing sits perfectly still. `drift.json` has each as a unit curve at 100 Hz with its depth in cents. Value at sample n = `2^(interp(n/441, curve) × cents / 1200)`.

| key | on | depth |
|---|---|---|
| 11 | the line's pitch | 3.5 cents |
| 12 | the line's oscillator 2 | 3.0 |
| 13 | the line's oscillator 3 | 3.0 |
| 14 | the line's cutoff | 25 |
| 21 | the bass's pitch | 2.5 |
| 31 | the lead's pitch | 1.5 |

The script's `drift()` makes them from fixed seeds, so it can be called instead of reading the file. A null needs them; a live voice under the keys can run without.

### 4.7 The closed hat

Not a one-shot. Each hit is a slice of `hat_noise` with its own decay:

`hit[t] = hat_noise[offset + t] × (1 − e^(−t/0.0005)) × e^(−t/decay)` for `length` samples, × the event's gain, at the event's pan.

Offset, length, decay, gain and pan are in the log. Baking the whole bus to audio is the other way; it is 1540 hits.

### 4.8 The pad

Four notes (59 60 62 66), 24 saws, all free-running from their logged phases. Left: −9 cents, +4 cents, and an octave up at +3 cents × 0.5. Right: +9, −5, and an octave up at −4 cents × 0.5. A note's gate is 0 or 1 by the bar (section 2) through two one-pole lowpasses in series, each `a = 1 − e^(−2π·1.111/sr)`. Then per side × 0.2 into a ladder (resonance 0.4, drive 1.0), the right side's cutoff × 1.06; the level lane; a 190 Hz 2nd-order highpass; × 0.225040; duck 0.5.

### 4.9 Smaller things

- **The duck envelope:** 2 ms attack, 35 ms hold, then `e^(−(t − 0.035)/0.1)`, 0.45 s long, the maximum where two overlap. It fires on every kick.
- **A lane on a send:** the line's send to the hall, and its send to the echo.
- **Lanes that are straight in the log:** the line's and the bass's base cutoff are `exp` of a linear lane. Interpolate their logs.
- **Pans:** clap +0.05, open hat −0.2. The closed hat carries its own per event.
- **Bake:** the closed-hat bus's 11 kHz lowpass and the open-hat bus's 10.5 kHz lowpass (both 2nd-order Butterworth).
- **The master:** 25 Hz highpass, the fade starts at bar 128 and runs through the tail, **tanh(1.32x)/1.1** (not 1.43 as on the others), limiter at 0.70 (at most 1.0 dB, 8.6 % of samples), × 1.271429.

## 5. Numbers

### Lanes (bar, value). `np.interp`: the end values hold outside the range.

| lane | points |
|---|---|
| line decay τ, s | (0, 0.10) (32, 0.13) (56, 0.30) (64, 0.12) (88, 0.17) (96, 0.28) (104, 0.13) (120, 0.09) |
| line sustain | (0, 0) (55, 0) (56, 0.35) (63, 0.35) (64, 0) (95, 0) (96, 0.3) (103, 0.3) (104, 0) |
| line release τ, s | (0, 0.03) (56, 0.09) (64, 0.03) (96, 0.08) (104, 0.03) |
| line envelope τ, s | (0, 0.07) (32, 0.10) (56, 0.25) (64, 0.10) (88, 0.16) (96, 0.22) (104, 0.10) (124, 0.06) |
| line glide τ, s | (0, 0) (55.9, 0) (56, 0.024) (63, 0.03) (64, 0) (95.9, 0) (96, 0.026) (103.9, 0.026) (104, 0) |
| line pulse | (0, 0.15) (32, 0.35) (56, 0.5) (64, 0.3) (88, 0.5) (104, 0.3) (127, 0.1) |
| line osc 3 | (0, 0) (30, 0) (34, 0.3) (56, 0.15) (64, 0.3) (88, 0.5) (96, 0.25) (104, 0.2) (116, 0) |
| line base, Hz (log) | (0, 200) (8, 240) (16, 340) (32, 540) (48, 760) (55, 920) (56, 600) (60, 1250) (63.5, 1700) (64, 760) (72, 660) (87, 680) (88, 1250) (92, 1600) (96, 850) (100, 1100) (104, 760) (112, 520) (120, 340) (127, 190) |
| line amount, octaves | (0, 1.4) (32, 1.7) (56, 1.2) (64, 1.8) (88, 2.1) (104, 1.7) (124, 1.2) |
| line resonance | (0, 1.0) (32, 1.5) (56, 2.1) (63, 2.4) (64, 1.5) (88, 2.2) (96, 2.0) (104, 1.4) (127, 1.0) |
| line drive | (0, 1.2) (56, 1.6) (88, 2.0) (104, 1.4) (127, 1.2) |
| line level | (0, 0.8) (8, 0.9) (16, 1.0) (56, 0.9) (64, 1.0) (72, 0.9) (88, 1.0) (120, 0.95) (127, 0.8) |
| line send to its echo | (0, 0.55) (16, 0.4) (32, 0.35) (55, 0.4) (56, 0.55) (63.5, 0.6) (64, 0.35) (95.5, 0.4) (96, 0.55) (103.5, 0.55) (104, 0.35) (120, 0.5) (127, 0.7) |
| line echo feedback | (0, 0.5) (54.5, 0.45) (55.5, 0.74) (57, 0.6) (63.5, 0.6) (64, 0.42) (94.5, 0.42) (95.5, 0.74) (97, 0.58) (103.5, 0.6) (104, 0.42) (120, 0.5) (126, 0.66) (130, 0.6) |
| line send to the hall | (0, 0.95) (8, 0.7) (16, 0.42) (32, 0.36) (55, 0.4) (56, 0.9) (63.5, 0.95) (64, 0.34) (95.5, 0.4) (96, 0.85) (103.5, 0.85) (104, 0.36) (120, 0.6) (124, 0.9) (128, 1.0) |
| bass base, Hz (log) | (16, 95) (24, 130) (32, 190) (48, 260) (56, 150) (64, 260) (88, 340) (96, 200) (104, 280) (120, 150) |
| lead base, Hz | (72, 950) (80, 1200) (88, 1300) (104, 850) (112, 800) |
| lead level | (72, 0.85) (76, 1.0) (88, 1.0) (104, 0.75) (112, 0.75) |
| pad cutoff, Hz | (0, 400) (16, 480) (40, 700) (56, 1200) (62, 1700) (64, 800) (88, 1300) (96, 1500) (104, 900) (120, 600) (128, 380), × (1 + 0.18·sin(2π·bar/5 + 0.7)) |
| pad level | (0, 0) (14, 0) (20, 0.45) (40, 0.6) (55, 0.7) (56, 1.0) (63.5, 1.0) (64, 0.6) (95.5, 0.7) (96, 1.0) (103.5, 1.0) (104, 0.65) (120, 0.8) (126, 0.7) (131.5, 0) |
| noise | (0, 0) (1, 1.0) (8, 0.8) (56, 1.0) (64, 0.6) (96, 0.9) (104, 0.6) (124, 1.0) (131.5, 0) |

The line's gate lane, the hat level and decay lanes and the open-hat lane are already in the events.

### The echoes

- **Line:** 3 steps × (1 + 0.0011·sin(2π·0.17·t) + 0.0003·sin(2π·2.3·t)), lowpass 2800, highpass 260, drive 1.4, feedback from its lane. Return × 0.85, duck 0.3.
- **Lead:** 6 steps × (1 + 0.0015·sin(2π·0.13·t)), lowpass 2400, highpass 350, drive 1.3, feedback 0.46. Return × 0.8, duck 0.2.

### Sends, after each bus's gain and duck

- **Hall** (`ir_hall`): the line × its lane, line echo 0.5, lead 0.7, lead echo 0.6, pad 0.9, clap 0.35, open hat 0.1. Return × 0.337704, duck 0.4.
- **Room** (`ir_room`): clap 0.7, closed hats 0.35, open hat 0.3. Return × 0.660081, no duck.

### Gains and ducks

| bus | gain | duck |
|---|---|---|
| kick | 0.62 | |
| bass | 0.603550 | 0.5 |
| line | 0.543083 × its level lane | 0.22 |
| lead | 0.469284 | 0.1 |
| clap | 0.341340 | |
| closed hats | 0.407201 | |
| open hat | 0.542202 | |
| pad | 0.225040 | 0.5 |
| line echo | 0.85 on the return | 0.3 |
| lead echo | 0.8 on the return | 0.2 |
| noise | 0.054930 | |

The noise is pink (Halbschatten's filter coefficients) through a 500 Hz highpass, with no crackle. It is not a tile: the script draws all 260 s. Looping the 32 s file will null as Halbschatten's did.

## 6. Checks

Pre-master stems, bars 72–79, dBFS:

| stem | RMS | peak |
|---|---|---|
| kick | −14.6 | −6.8 |
| bass | −19.9 | −7.5 |
| line | −23.7 | −10.0 |
| lead | −26.8 | −14.4 |
| hall | −29.3 | −14.9 |
| pad | −32.7 | −20.0 |
| echo | −35.6 | −17.5 |
| clap | −35.7 | −12.2 |
| lead_echo | −37.0 | −21.5 |
| ohat | −38.1 | −13.7 |
| room | −39.7 | −17.9 |
| hats | −40.0 | −12.6 |
| noise | −52.8 | −39.2 |

The master as measured: −10.2 LUFS, mean −11.1 dBFS, true peak −0.7 dBFS, 259.8 s. Octave bands against `reference.flac` in bars 0–7, 16–23, 54–59, 72–79, 88–91, 96–103, 124–127: those passages hold every block that is new.

Port order that keeps each step checkable: the ladder alone against the script (feed both the same noise and a swept cutoff), then the bass (constant settings, the simplest voice), then the line, then the lead.

Then Bart's ears, the mp3 against the app, headphones and speakers.

## 7. Song and parts

`scripts/songs/streulicht.py` → `song-streulicht.json`: "Streulicht", Melodic Techno, E minor, 122. The record alone first, matched; then the parts.

- **Chords:** the pad's three notes. One finger moves, B3 to C4 and back.
- **Melody:** the line. It is the record's carrier and it never stops, so the chart has notes in every bar without a tune written on top. It is sixteenths at 122, which is fast: a lower level could take the accented stages only, or every other stage.
- **The lead** is the visitor: 42 notes in 24 of 128 bars. Leave it to the record, or offer it as a second line; do not extend it to fill bars.

Weights, levels and fingering are `takt-chart`'s call.

Not checked here: nothing in this note has been built or run in Swift. Section 4 was written without reading `Rack.swift` again, so the rack may already do some of it.
