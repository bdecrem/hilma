# Restlicht: a fourth record for the rack, from its reference

For Claude Code. Bart, 2026-11-10, with `misc/restlicht_reference.mp3` in hand: "make me a .md bundle for the last track to pass on to Claude code like the other ones."

Restlicht is melancholic Detroit electro in D dorian at 124, 120 bars and a 6 s tail, 3:58. Claude rendered it in Python the way it rendered Halbschatten and Gegenlicht. The method is `apps/takt/DUB-TECHNO.md` §8 and nothing about it changes: run the reference, take its own sounds, port per sample at its own levels, solo every bus and null it.

If Gegenlicht is on the rack, most of this record is too. Its bass is Gegenlicht's acid voice with a second oscillator, its pad is the gated pad, its echo is the same function. One voice is new, the whistle. Section 4 is the list.

## 1. Files in this drop

| File | What it is |
|---|---|
| `misc/RESTLICHT.md` | this |
| `misc/restlicht_reference.py` | the record. numpy, scipy, numba, 44.1 kHz |
| `misc/restlicht_reference.mp3` | what Bart has |
| `misc/restlicht/reference.flac` | the same master, lossless (16-bit, 44.1 kHz). The script's `out.wav` is this bit for bit |
| `misc/restlicht/parts/*.wav` | its own one-shots, float32, 44.1 kHz: `kick`, `kick_ghost`, `snare_0..1`, `hat_closed_0..2`, `hat_open_0..1`, `shaker_0..2`, `rim`, `tom_45`, `tom_50`, `ir_hall`, `ir_room` (stereo), and `noise_bed_first_32s.flac` |
| `misc/restlicht/parts/gains.json` | every auto-levelled gain, resolved |
| `misc/restlicht/parts/events.json` | every event as it was placed |

**The reference logs itself.** `python3 misc/restlicht_reference.py out.wav <dir>/stems` writes the 13 pre-master stems and `<dir>/parts/` again, events included. The log draws nothing from the random stream. Still assert `out.wav` against `reference.flac`.

`events.json` is `{sr, tempo, bars, tail, events}`. Every event starts with its **sample index at 44.1 kHz** (swing and jitter already in it):

| key | fields after the sample |
|---|---|
| `kick` | gain, kind (0 = `kick`, 1 = `kick_ghost`) |
| `bass` | midi, gate length in samples, accent 0/1, slide 0/1 |
| `lead` | midi, gate length in samples (the whistle) |
| `snare`, `hatc`, `hato`, `shaker` | gain (hat lane and shaker fade already in it), round robin |
| `rim` | gain |
| `tom` | midi, gain, pan |
| `pad` | not events: `[midi, phaseL1, phaseL2, phaseR1, phaseR2]` per note |

## 2. The record

Sixteen steps a bar; one step is 5334.68 samples. Hats and shaker swing: odd sixteenths late by 0.05 step. Everything else is straight, with 1–2 ms of jitter on the drums and 4 ms on the whistle.

**The beat.** Kick on steps 0, 6, 10 (gains 1.0, 0.9, 0.95). On every bar where `bar % 4 == 3` a ghost kick on step 15 (the short one-shot, gain 0.5). Snare on 4 and 12. Closed hats on all sixteen steps, velocities 0.62, 0.26, 0.46, 0.28 by position in the beat; on odd bars in 16–47 and 56–103 the hat on step 14 is the open one. Rim on steps 3 and 9 of even bars, 7 and 13 of odd bars; one hit a bar (step 3 or 13) in bars 0–7 and 112–119. Two toms into every eighth bar: D3 on step 13, A2 on step 15, in bars 39, 55, 63, 71, 79, 87, 95, 103.

### Form

| bars | what plays |
|---|---|
| 0–3 | pad (D3 A3), noise, the rim and its echo |
| 4–7 | + kick |
| 8–15 | + snare, closed hats, the bass (sparse riff, filter nearly closed) |
| 16–31 | the full riff, open hat. The pad adds E4 |
| 32–39 | the pad's top note moves: E4 for 4 bars, G4 for 4. Toms from 39 |
| 40–47 | + shaker. Bar 47: kick on step 0 only, snare on step 4 only and thrown into the echo (send 0.75, feedback to 0.88), no toms |
| 48–55 | break: no kick, no snare, no shaker. Hats quieter, sparse riff, pad up. Toms end bar 55 |
| 56–63 | everything, + shaker. The pad's cycle with the dropped bar starts |
| 64–79 | + the whistle (P1 P2 P1 P2). The bass filter is widest at 76 |
| 80–87 | no whistle. Bar 87: the snare on step 12 thrown (send 0.45, feedback to 0.86). Shaker ends |
| 88–91 | no bass. Drums and pad |
| 92–95 | sparse riff |
| 96–103 | full riff, the whistle once more (P1 P2, quieter) |
| 104–111 | no hats, sparse riff, pad D3 A3 E4 |
| 112–115 | sparse riff, pad D3 A3 |
| 116–119 | no kick, snare or bass. Pad, noise, the rim and its echo (feedback 0.74) |

### The bass riff (step in the 2-bar riff, note, length in steps; `!` accent, `~` slid into)

- **Full:** 0 D2 1.5 ! · 3 D2 1 · 6 F2 1.5 · 9 D2 1 · 11 C3 1 · 13 A2 1.5 · 15 C2 1 · 16 D2 1.5 ! · 19 D2 1 · 22 F2 1.5 · 25 G2 1.5 · 27 A2 1 · 30 C3 1 · 31 ~B2 1
- **Sparse:** 0 D2 1.5 ! · 6 F2 1.5 · 9 D2 1 · 16 D2 1.5 ! · 22 F2 1.5 · 27 A2 1 · 30 C3 1 · 31 ~B2 1

The C3 before the slide holds its gate until the B2 starts (the log's gate lengths already say so). The riff never transposes.

### The pad

Stacked fifths, no third in any chord.

- Bars 0–15 and 112–119: D3 A3
- Bars 16–31 and 104–111: D3 A3 E4
- Bars 32–55, 4 bars each: D3 A3 E4 · D3 A3 G4
- Bars 56–103, 1 bar each: D3 A3 E4 · D3 A3 G4 · D3 A3 E4 · C3 G3 D4

### The whistle (bar of the phrase, step, note, length in steps)

- **P1:** 1: 0 A4 12 · 2: 0 G4 6, 8 E4 8 · 3: 2 F4 12 · 4: 0 E4 6, 8 D4 8
- **P2:** 1: 0 A4 12 · 2: 0 C5 6, 8 A4 8 · 3: 2 G4 12 · 4: 0 E4 14

Phrases start at bars 64, 68, 72, 76 and 96, 100.

**Every pitch in the record is a white key.**

## 3. What the rack already does

Port these as Halbschatten's and Gegenlicht's were; only the numbers differ (section 5).

- `tape_delay` is the same function. One instance here.
- The hall and the room by convolution, with this record's impulses (predelay 30 ms and 6 ms: 1323 and 264 frames at 44.1 kHz).
- Kit buses with sends, sounds at two rates, round robins, the noise bed looped, lanes, the master's shape.
- The four traps of §8 all apply. The centre pan is −3 dB a side here too (kick, bass, snare).

## 4. What the rack may not have yet

### 4.1 The bass voice

Gegenlicht's acid voice (`GEGENLICHT.md` §4.1) with these differences. If that voice is in, give it these as parameters; if not, this plus `acid_ctrl` in the script is the whole spec.

- **Control:** `acid_ctrl`, line for line the same function and the same constants (38 ms glide, 2 ms attack, 0.30 s toward 0.55, 12 ms release, envelope set to 1 + 0.45·accent, pitch starts at 110 Hz).
- **Oscillators:** three PolyBLEP saws at the per-sample pitch, all free-running from sample 0, start phases 0, 0.25 and 0.75. Out = 0.7 × saw₀ + 0.45 × (saw₀.₂₅ − saw₀.₇₅). The difference of the last two is a square.
- **Filter 1:** TPT state-variable lowpass. Cutoff = base × 2^(amount × envelope), clipped to 60–6000 Hz. No LFO on it. Q from a lane.
- **Filter 2:** the same, cutoff min(1.3 × filter 1's, 7000), Q 0.7.
- Then `tanh(drive × y × amp) / drive`, a 38 Hz 2nd-order Butterworth highpass, × 0.522841, duck 0.4, centre.

**The oscillators and both filters run from sample 0 and never stop; the gate is only the amp.** A null needs that.

Your keys on the melody part need this voice live.

### 4.2 The whistle

One mono voice, new.

1. `acid_ctrl` again for pitch and amp, with no accents and no slides (every note jumps and re-attacks).
2. **Amp:** its output through two one-pole lowpasses in series, each `a = 1 − e^(−2π·14/sr)`.
3. **Pitch:** one one-pole lowpass on log(frequency), `a = 1 − e^(−1/(0.05·sr))`, started settled at 110 Hz.
4. **Vibrato:** frequency × (1 + 0.0035·sin(2π·5.1·t) × depth). Depth is 1 while the smoothed amp is above 0.3 and 0 otherwise, through a one-pole lowpass at 1.5 Hz.
5. **Tone:** phase φ = 2π·Σ (that frequency, vibrato included) / sr from sample 0. Out = (sin φ + 0.22·sin(2φ + 0.4) + 0.06·sin 3φ) × amp.
6. A 2600 Hz 2nd-order Butterworth lowpass, the level lane, × 0.141140, pan −0.08, no duck.

### 4.3 The echo's input

Three sources into one `tape_delay`:

- the rim bus (after its gain, the mean of its two sides) × 1.0
- the snare bus (the same way) × a send lane
- the whistle, mono, at its gain, **before** its pan, × 0.55

`side = floor(beat) mod 2` (it swaps every beat), smoothed by a centred 400-sample boxcar. Left in = input × (1 − side), right in = input × side.

### 4.4 The pad has gates

As `GEGENLICHT.md` §4.5 with other numbers. Seven notes (48 50 55 57 62 64 67), 28 saws, all free-running from their logged phases: left −8 and +5 cents, right +8 and −4. A note's gate is 0 or 1 by the bar (section 2), through two one-pole lowpasses in series, each `a = 1 − e^(−2π·1.25/sr)`. Then per side a TPT lowpass, Q 0.9, right side cutoff × 1.05, the level lane, a 160 Hz 2nd-order highpass, × 0.039375, duck 0.3.

### 4.5 Smaller things

- **The duck envelope:** 2 ms attack, 40 ms hold, then `e^(−(t − 0.04)/0.12)`, 0.5 s long, the maximum where two overlap. It fires on every kind-0 kick at full depth whatever the kick's gain. **The ghost kick does not fire it.**
- **Lanes that are straight in the log:** the bass base cutoff is `exp` of a linear lane. Interpolate its log.
- **Pans to bake:** closed hat +0.2, open hat −0.15, shaker −0.4, rim +0.35. The toms carry theirs per event (D3 −0.3, A2 +0.3).
- **Bake:** the hat bus's 12.5 kHz lowpass (2nd-order Butterworth).
- **Ducked buses:** bass 0.4, pad 0.3, hall 0.3, echo 0.2. Nothing else ducks. The noise does not duck here.
- **The master:** 25 Hz highpass, the fade starts at bar 119, tanh(1.43x)/1.1, limiter at 0.70 (at most 0.9 dB, 7.7 % of samples), × 1.271429.

## 5. Numbers

### Lanes (bar, value). `np.interp`: the end values hold outside the range.

| lane | points |
|---|---|
| bass base, Hz (log) | (8, 190) (16, 280) (32, 480) (47, 620) (48, 300) (56, 560) (76, 1100) (84, 900) (88, 600) (92, 420) (104, 330) (116, 200) |
| bass amount, octaves | (8, 0.7) (32, 1.3) (56, 1.5) (76, 1.9) (96, 1.3) (116, 0.7) |
| bass Q | (8, 1.2) (56, 1.7) (76, 2.4) (96, 1.6) (116, 1.2) |
| bass envelope τ, s | (8, 0.10) (48, 0.14) (76, 0.20) (104, 0.12) |
| bass drive | (8, 1.3) (76, 1.9) (116, 1.3) |
| whistle level | (64, 0.9) (72, 1.0) (80, 1.0) (96, 0.7) (104, 0.7) |
| echo feedback | (0, 0.52) (46.5, 0.5) (47.5, 0.88) (49, 0.66) (55, 0.66) (56, 0.48) (86.5, 0.48) (87.5, 0.86) (89, 0.6) (92, 0.48) (112, 0.6) (116, 0.74) (120, 0.7) |
| snare send to the echo | (0, 0.12) (47.1, 0.12) (47.2, 0.75) (47.6, 0.75) (47.7, 0.12) (87.65, 0.12) (87.72, 0.45) (87.97, 0.45) (88, 0.12) |
| pad cutoff, Hz | (0, 460) (8, 480) (16, 600) (48, 1300) (56, 900) (76, 1500) (104, 700) (120, 350), × (1 + 0.2·sin(2π·bar/6 + 1.3)) |
| pad level | (0, 0) (1.5, 0.95) (4, 0.85) (8, 0.6) (16, 0.7) (47, 0.75) (48, 1.0) (55.5, 1.0) (56, 0.7) (87.5, 0.75) (88, 1.0) (92, 0.75) (112, 1.0) (119, 0.8) (122.5, 0) |
| noise | (0, 0) (1, 1.0) (8, 0.8) (48, 1.0) (56, 0.6) (88, 0.9) (92, 0.6) (112, 1.0) (122.5, 0) |

The hat level lane and the shaker's fade-in are already in the events' gains.

### The echo

3 steps × (1 + 0.0012·sin(2π·0.19·t) + 0.0004·sin(2π·2.7·t)), lowpass 3000, highpass 350, drive 1.5, feedback from its lane. Return × 0.8, duck 0.2.

### Sends, after each bus's gain and duck

- **Hall** (`ir_hall`): pad 0.9, whistle 0.75, echo 0.5, rim 0.3, toms 0.3, snare 0.16, bass 0.05. Return × 0.532556, duck 0.3.
- **Room** (`ir_room`): snare 0.7, toms 0.5, rim 0.5, shaker 0.4, hats 0.3. Return × 0.842356, no duck.

### Gains and ducks

| bus | gain | duck |
|---|---|---|
| kick | 0.58 | |
| bass | 0.522841 | 0.4 |
| snare | 0.360917 | |
| hats | 0.495144 | |
| shaker | 0.103171 | |
| rim | 0.358771 | |
| toms | 0.282940 | |
| pad | 0.039375 | 0.3 |
| whistle | 0.141140 | |
| echo | 0.8 on the return | 0.2 |
| noise | 0.060713 | |

The noise is pink (Halbschatten's filter coefficients) through a 450 Hz highpass, with no crackle. It is not a tile: the script draws all 238 s. Looping the 32 s file will null as Halbschatten's did.

## 6. Checks

Pre-master stems, bars 72–79, dBFS:

| stem | RMS | peak |
|---|---|---|
| kick | −14.8 | −5.9 |
| bass | −21.5 | −10.2 |
| lead | −27.2 | −19.2 |
| hall | −29.1 | −14.5 |
| pad | −29.9 | −14.2 |
| snare | −31.1 | −12.2 |
| toms | −37.0 | −13.3 |
| echo | −37.1 | −18.6 |
| room | −38.6 | −17.9 |
| hats | −39.4 | −13.6 |
| shaker | −42.5 | −18.9 |
| rim | −44.0 | −11.5 |
| noise | −51.0 | −36.7 |

The master as measured: −10.0 LUFS, mean −10.8 dBFS, true peak −0.7 dBFS, 238.3 s. Octave bands against `reference.flac` in bars 0–7, 16–23, 46–51, 72–79, 88–91, 112–119: those passages hold every block that is new.

Then Bart's ears, the mp3 against the app, headphones and speakers. The kick's body is at 55 Hz, so a phone speaker only shows its knock.

## 7. Song and parts

`scripts/songs/restlicht.py` → `song-restlicht.json`: "Restlicht", Electro, D dorian, 124. The record alone first, matched; then the parts.

- **Chords:** the pad's two- and three-note fifths. One finger moves (E4 to G4), then the whole hand drops a step for a bar.
- **Melody:** the bass riff. It is the record's carrier, so the chart has notes to play in bars 8–115 (except 88–91, where the bass rests) without a tune written on top.
- **The whistle** is the visitor: 33 notes in 24 of 120 bars. Leave it to the record, or offer it as a second line; do not extend it to fill bars.

Weights, levels and fingering are `takt-chart`'s call. Every note is a white key, so it may suit the early levels.

Not checked here: nothing in this note has been built or run in Swift. Section 4 assumes Gegenlicht's voices as `GEGENLICHT.md` described them; if they were built differently, the script decides.
