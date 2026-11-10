# Gegenlicht: a third record for the rack, from its reference

For Claude Code. Bart, 2026-11-10, on hearing `misc/gegenlicht_reference.mp3`: "this is FANTASTIC. now provide instructions i can pass on to claude code so they can faithfully implement this track in xcode/swift."

Gegenlicht is techno in A minor at 128, 128 bars and a 7 s tail, 4:07. Claude rendered it in Python the way it rendered Halbschatten. The method is `apps/takt/DUB-TECHNO.md` §8 and nothing about it changes: run the reference, take its own sounds, port per sample at its own levels, solo every bus and null it.

This record is not on Halbschatten's console as it stands. Gezeiten needed no engine change; this one does. Section 4 is the list.

## 1. Files in this drop

| File | What it is |
|---|---|
| `misc/GEGENLICHT.md` | this |
| `misc/gegenlicht_reference.py` | the record. numpy, scipy, numba, 44.1 kHz |
| `misc/gegenlicht_reference.mp3` | what Bart heard |
| `misc/gegenlicht/reference.flac` | the same master, lossless (16-bit, 44.1 kHz). The script's `out.wav` is this bit for bit |
| `misc/gegenlicht/parts/*.wav` | its own one-shots, float32, 44.1 kHz: `kick`, `hat_closed_0..2`, `hat_open_0..1`, `ride`, `crash` (stereo), `shaker_0..2`, `clap`, `rim`, `tom_52/55/57`, `ping_040/050/060/070/085/100`, `riser_bar30/52/70/86/90` (stereo, before their gain), `ir_hall`, `ir_room` (stereo), `ir_rumble` (mono), `rumble_source` (section 4.3), `noise_bed_first_32s.flac` |
| `misc/gegenlicht/parts/gains.json` | every auto-levelled gain, resolved |
| `misc/gegenlicht/parts/events.json` | every event as it was placed |

**The reference logs itself this time.** `python3 misc/gegenlicht_reference.py out.wav <dir>/stems` writes the 17 pre-master stems and `<dir>/parts/` again, events included. There is no source to patch: the log is in the script and draws nothing from the random stream. Still assert `out.wav` against `reference.flac`.

`events.json` is `{sr, tempo, bars, tail, events}`. Every event starts with its **sample index at 44.1 kHz** (swing and jitter already in it):

| key | fields after the sample |
|---|---|
| `kick` | none |
| `acid` | midi, gate length in samples, accent 0/1, slide 0/1 |
| `ping` | velocity (picks the one-shot), pan −1…1, level (the ping lane at the hit) |
| `hatc`, `hato`, `shaker` | gain (hat lane already in it), round robin |
| `ride`, `clap`, `rim`, `crash` | gain |
| `tom` | midi, gain, pan |
| `riser` | end sample, gain |
| `pad` | not events: `[midi, phaseL1, phaseL2, phaseR1, phaseR2]` per note |

## 2. The record

Sixteen steps a bar. Hats and shaker swing: odd sixteenths late by 0.06 step. Everything else is straight, with 1–2 ms of jitter on the drums.

**Three clocks.** The kick counts in 4. The toms hit every third sixteenth of the whole song (`(bar·16 + step) % 3 == 0`), cycling pitches A3 E3 E3 G3 and velocities 1.0, 0.6, 0.8, 0.5, 0.7; the counters run through the bars where the toms are silent. The ping is a 5-step gate `x.xx.` on the same global index, velocities cycling in 7 (1.0, 0.5, 0.7, 0.4, 0.85, 0.5, 0.6), pan `0.55·sin(0.37·i)`. One pitch, E5.

### Form

| bars | what plays |
|---|---|
| 0–7 | kick behind a filter that opens, ping fading in, pad (A and E only), noise |
| 8–15 | + rumble, closed hats |
| 16–23 | + open hats, toms |
| 24–31 | + the acid line, sparse and nearly closed. Riser 30–32 |
| 32–39 | + clap, crash at 32. The pad starts moving. Acid motif A |
| 40–47 | + rim. Bar 47: no kick on beats 3–4, no clap on 4, the echo thrown to 0.86 |
| 48–55 | break: no kick, rumble, clap, toms; no hats until 52. Acid A, resonance up. Riser 52–56 |
| 56–63 | everything, crash. Acid motif B |
| 64–71 | + ride, rim. Riser 70–72 |
| 72–87 | + shaker, crash at 72. Acid A on bars 72, 76, 80, 84 and B on 74, 78, 82, 86. Bar 87: no kick on beat 4, throw to 0.88. Riser 86–88 |
| 88–91 | no kick, rumble, clap, toms, open hats. The acid line alone (sparse) with pad, ping, closed hats. Riser 90–92 |
| 92–103 | kick back, crash at 92. Acid A |
| 104–111 | no clap, no open hats. Toms and acid A to 107, then acid sparse |
| 112–119 | acid sparse, hats fading out |
| 120–127 | the kick's filter closes and its level falls (last kick in bar 125), ping to 126, pad |

### The acid line (step in the 2-bar motif, note, length in steps; `!` accent, `~` slid into)

- **Sparse:** 0 A2 1.5 ! · 6 E3 1 · 7 ~D3 2 · 12 A2 1.5 · 18 E3 2.5 ! · 24 C3 1 · 25 ~B2 2 · 28 A2 1.5
- **A:** 0 A2 1.5 ! · 3 C3 1 · 6 E3 1 · 7 ~D3 2 · 10 C3 1 · 12 A2 1.5 ! · 14 G2 1 · 15 ~A2 1 · 18 E3 2.5 ! · 22 D3 1 · 24 C3 1 · 25 ~B2 2 · 28 A2 1.5 · 30 E2 1.5
- **B:** 0 A2 1.5 ! · 3 C3 1 · 6 E3 1 · 7 ~G3 2 ! · 10 E3 1 · 12 D3 1.5 · 14 C3 1 · 15 ~D3 1 · 18 E3 2.5 ! · 22 D3 1 · 24 A3 1 ! · 25 ~G3 2 · 28 E3 1.5 · 30 D3 1.5

A note that is slid out of holds its gate until the next one starts (the log's gate lengths already say so).

### The pad

Under bar 32: A3 E4. Bars 32–87, 4 bars each: A3 E4 B4 · A3 F4 C5 · A3 E4 B4 · G3 D4 A4. From 88: A3 E4 B4.

**Every pitch in the record is a white key.**

## 3. What the rack already does

Port these as Halbschatten's were; only the numbers differ (section 5).

- `tape_delay` is the same function. Three instances here.
- The hall and the room by convolution, with this record's impulses (predelay 30 ms and 6 ms: 1323 and 264 frames at 44.1 kHz, so the same block sizes pay the latency).
- Kit buses with sends, `late` and `g`, sounds at two rates, the noise bed looped, lanes, the master's shape.
- The four traps of §8 all apply. The centre pan is −3 dB a side here too (kick, rumble, acid, clap).

## 4. What the rack does not have yet

### 4.1 The acid voice

One mono voice, `acid_ctrl` + `saw_var` + two filters. **The oscillator and both filters run from sample 0 and never stop; the gate is only the amp.** A null needs that.

- **Control**, per sample (port `acid_ctrl` line for line):
  - At a note's start: target pitch = the note. If it is a slide and the gate is still open, nothing else. Otherwise the pitch jumps, the amp attack restarts, and the filter envelope is set to 1 + 0.45·accent.
  - Pitch: `cur = tgt + (cur − tgt)·e^(−1/(0.038·sr))`. It starts at 110 Hz.
  - Amp: attack to 1 in 2 ms, then toward 0.55 with a 0.30 s time constant; gate off, a 12 ms release. Out = level·(1 + 0.4·accent).
  - Filter envelope: falls by `e^(−1/(τ·sr))` a sample, τ from a lane.
- **Oscillator:** a PolyBLEP saw at the per-sample pitch, phase 0 at sample 0, × 0.8.
- **Filter 1:** TPT state-variable lowpass (the `DubStab` formulas). Cutoff = base × 2^(amount × envelope) × (1 + 0.06·sin(2π·bar/5)), clipped to 60–8000 Hz. Q from a lane.
- **Filter 2:** the same, cutoff min(1.25 × filter 1's, 9000), Q 0.7.
- Then `tanh(drive × y × amp) / drive` (drive from a lane), a 75 Hz 2nd-order Butterworth highpass, × 0.472470, duck 0.32, centre.

Your keys on the melody part need this voice live. How a played note becomes a slide or an accent is yours to decide.

### 4.2 The kick bus

The kick hits sum into a bus: TPT lowpass, Q 0.8, cutoff from a lane; then a gain lane; × 0.66, centre. The rumble is fed from this bus after both.

### 4.3 The rumble

The low end between the kicks. There is no bassline.

1. In = 0.6 × kick bus + 0.45 × kick bus 2 steps late + 0.7 × kick bus 3 steps late (10336 and 15504 samples at 44.1 kHz).
2. Convolve with `ir_rumble` (mono, 0.9 s). **It has no predelay,** so a block of latency has nowhere to hide: the first block needs a direct FIR, the rest can go through `Convolver`.
3. 34 Hz highpass (2nd-order Butterworth), 105 Hz lowpass (4th-order).
4. `tanh(3.2 × x / 4.546134)`. The divisor is a percentile of the whole signal in the script; here it is that number.
5. 260 Hz lowpass (2nd-order), × (1 − the rumble's own duck), × the rumble lane, × 0.188822, centre.

A port check without the convolver: `parts/rumble_source.wav` is what one kick puts into step 4. Three hits of it per kick (gains 0.6, 0.45, 0.7) rebuild the script's signal to −147 dB in bars 8–117. It is not the whole answer: in bars 118–125 the kick's filter is closing and the rebuild's error is only 17 dB under the signal.

### 4.4 The ping

Six one-shots, one per velocity (the velocity changes the tone, not only the level). Each hit has its own pan. Bus: per side a TPT lowpass, Q 1.2, cutoff from a lane; the mono sum into a third `tape_delay` (left input only, 2 steps, no wobble, feedback 0.5, lowpass 5000, highpass 400, drive 1.5); out = dry + 0.6 × echo; × 0.126047, duck 0.2.

### 4.5 The pad has gates

Eight notes (55 57 62 64 65 69 71 72), 32 saws, all free-running from their logged phases: left −7 and +4 cents, right +7 and −3. A note's gate is 0 or 1 by the bar (section 2), through two one-pole lowpasses in series, each `a = 1 − e^(−2π·1.111/sr)`. Then per side a TPT lowpass, Q 0.9, right side cutoff × 1.06, the level lane, a 170 Hz 2nd-order highpass, × 0.034463, duck 0.6.

### 4.6 Smaller things

- **Lanes that are straight in the log:** the kick's cutoff, the acid base cutoff and the ping's cutoff are `exp` of a linear lane. Interpolate their logs.
- **A second duck envelope.** Main: 2 ms attack, 30 ms hold, 90 ms release. The rumble's: 2 ms, 100 ms, 60 ms. Both 460 ms long, both fire on every kick at full depth whatever the kick's gain lane says.
- **Ducked drum buses:** hats 0.12, ride 0.15, crash 0.3.
- **The acid echo's input side follows the clock, not the hits:** `side = floor(2·bar) mod 2`, smoothed by a centred 400-sample boxcar. Its input is the acid line at its gain **before** the duck.
- **A pan per event** for the ping and the toms. The other pans are fixed and can be baked: closed hat +0.2, open hat −0.12, ride +0.3, shaker −0.4, rim +0.4.
- **Bake:** the hat bus's 13 kHz lowpass and the tom bus's 110 Hz highpass (both 2nd-order Butterworth). `crash.wav` is already stereo (the right side is the left 37 samples late).
- **The master:** 25 Hz highpass, the fade starts at bar 127, tanh(1.43x)/1.1, limiter at 0.70 (at most 0.8 dB, 4.9 % of samples), × 1.271429.

## 5. Numbers

### Lanes (bar, value). `np.interp`: the end values hold outside the range.

| lane | points |
|---|---|
| kick cutoff, Hz (log) | (0, 140) (6, 900) (8, 16000) (118, 16000) (124, 300) (128, 110) |
| kick gain | (0, 0.6) (8, 1.0) (118, 1.0) (126, 0.32) |
| rumble | (0, 0) (7.5, 0) (8.5, 1) (126, 1) (128, 0.6) |
| acid base, Hz (log) | (24, 170) (32, 250) (44, 480) (48, 380) (54, 700) (56, 560) (64, 700) (76, 950) (84, 800) (88, 450) (96, 420) (108, 260) (120, 150) |
| acid amount, octaves | (24, 1.1) (44, 1.9) (52, 2.3) (56, 2.0) (76, 2.35) (88, 1.9) (108, 1.4) (120, 0.9) |
| acid Q | (24, 2.2) (40, 4.5) (48, 6.0) (54, 8.5) (56, 6.0) (76, 9.0) (88, 6.0) (104, 4.0) (120, 2.5) |
| acid envelope τ, s | (24, 0.13) (48, 0.17) (52, 0.26) (56, 0.16) (76, 0.22) (96, 0.14) (120, 0.11) |
| acid drive | (24, 1.2) (56, 1.8) (76, 2.6) (96, 1.6) (120, 1.2) |
| acid echo feedback | (0, 0.42) (46.5, 0.42) (47.5, 0.86) (49, 0.62) (55, 0.62) (56, 0.40) (86.5, 0.42) (87.5, 0.88) (91, 0.7) (92, 0.42) (118, 0.5) (128, 0.6) |
| ping cutoff, Hz (log) | (0, 1400) (32, 2600) (56, 4200) (76, 6500) (104, 2600) (128, 1200) |
| pad cutoff, Hz | (0, 420) (32, 800) (48, 1500) (56, 1000) (76, 1700) (88, 1300) (96, 800) (128, 380), × (1 + 0.22·sin(2π·bar/7 + 0.6)) |
| pad level | (0, 0) (3, 0.5) (16, 0.5) (32, 0.75) (47, 0.8) (48, 1.0) (55.5, 1.0) (56, 0.7) (87, 0.75) (88, 1.0) (92, 0.7) (112, 0.8) (124, 0.7) (130.5, 0) |
| noise | (0, 0) (1, 1.0) (8, 0.7) (48, 1.0) (56, 0.6) (88, 1.0) (92, 0.6) (120, 1.0) (131, 0) |

The hat and ping level lanes are already in the events' gains.

### The acid echo

3 steps × (1 + 0.001·sin(2π·0.21·t)), lowpass 3600, highpass 320, drive 1.6, feedback from its lane. Return × 0.7, duck 0.4.

### Sends, after each bus's gain and duck

- **Hall** (`ir_hall`): acid 0.55, acid echo 0.5, pad 0.9, ping 0.8, clap 0.3, rim 0.35, toms 0.25, risers 0.8, crash 0.5, ride 0.2. Return × 0.511703, duck 0.5.
- **Room** (`ir_room`): clap 0.8, hats 0.3, toms 0.6, rim 0.6, shaker 0.4. Return × 0.695219, no duck.

### Gains and ducks

| bus | gain | duck |
|---|---|---|
| kick | 0.66 | |
| rumble | 0.188822 | its own, full |
| acid | 0.472470 | 0.32 |
| acid echo | 0.7 on the return | 0.4 |
| ping | 0.126047 | 0.2 |
| pad | 0.034463 | 0.6 |
| hats | 0.461281 | 0.12 |
| ride | 0.125031 | 0.15 |
| shaker | 0.112802 | |
| clap | 0.442866 | |
| rim | 0.332682 | |
| toms | 0.152707 | |
| crash | 0.177828 | 0.3 |
| risers | 0.066677 × the event's gain | |
| noise | 0.054895 | 0.4 |

The noise is pink (Halbschatten's filter coefficients) through a 500 Hz highpass, with no crackle. It is not a tile: the script draws all 247 s. Looping the 32 s file will null as Halbschatten's did, not as Gezeiten's.

## 6. Checks

Pre-master stems, bars 72–79, dBFS:

| stem | RMS | peak |
|---|---|---|
| kick | −16.8 | −6.7 |
| rumble | −23.2 | −17.2 |
| acid | −23.9 | −11.3 |
| hall | −28.5 | −13.5 |
| pad | −31.0 | −15.2 |
| acid_delay | −31.7 | −12.4 |
| toms | −33.1 | −15.0 |
| ping | −33.8 | −17.9 |
| hats | −35.1 | −13.2 |
| clap | −36.2 | −11.0 |
| room | −38.0 | −18.7 |
| ride | −41.1 | −19.1 |
| shaker | −42.1 | −19.1 |
| rim | −44.7 | −12.5 |
| crash | −49.3 | −23.2 |
| noise | −52.1 | −38.0 |

The master as measured: −10.1 LUFS, mean −11.3 dBFS, true peak −0.8 dBFS, 247.0 s. Octave bands against `reference.flac` in bars 0–7, 24–31, 48–55, 72–79, 88–91, 120–127: those passages hold every block that is new.

Then Bart's ears, the mp3 against the app, headphones and speakers.

## 7. Song and parts

`scripts/songs/gegenlicht.py` → `song-gegenlicht.json`: "Gegenlicht", Techno, A minor, 128. The record alone first, matched; then the parts.

- **Chords:** the pad's three notes, one shape that moves one finger at a time.
- **Melody:** the acid line.

Weights, levels and fingering are `takt-chart`'s call. Since every note is a white key, it may suit the early levels.

Not checked here: nothing in this note has been built or run in Swift. Section 4 was written from reading `Rack.swift`'s header and DUB-TECHNO.md §8, not the whole file, so the rack may already do some of it.
