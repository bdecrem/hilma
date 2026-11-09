# Halbschatten: put this exact record on Takt's Stage

For Claude Code. Bart's ask, 2026-11-09: "implement this EXACT track in our iPhone app."

Halbschatten is a dub techno track Claude rendered in Python for Bart: G minor, 122 bpm, 120 bars, 4:03. He has heard `misc/halbschatten_reference.mp3` and wants that record, not one like it. Same rule as Abyss (`references/feedback.md`, 2026-10-29): **the reference is a target to measure against, not a description.** Port the code, set levels from renders bus by bus, A/B at the end.

This follows the Abyss path (`apps/takt/DUB-TECHNO.md`): a reference script, sampled drums and sub, a live stab, the chamber, a generator on `common.py`. It needs more engine than Abyss did. Section 5 lists what is missing. CLAUDE.md's standing rule applies: `takt-blues` before the generator, `takt-chart` for the parts.

## 1. Files in this drop

| File | What it is |
|---|---|
| `misc/HALBSCHATTEN.md` | this |
| `misc/halbschatten_reference.py` | the renderer. The code to port. numpy, scipy, numba |
| `misc/halbschatten_reference.mp3` | what Bart heard |
| `misc/halbschatten/reference.flac` | the same master, lossless (16-bit, 44.1 kHz) |
| `misc/halbschatten/parts/*.wav` | the reference's own one-shots, float32, 44.1 kHz: `kick`, `hat_closed_0..2`, `hat_open_0..1`, `shaker_0..2`, `clap`, `rim`, `tom_50/53/55`, the 12 raw stab buffers (`stab_raw_<chord>_<0..3>`, before envelope and filter), `ir_hall` and `ir_room` (stereo reverb impulses), `noise_bed_first_32s.flac` |
| `misc/halbschatten/parts/gains.json` | every auto-levelled gain, resolved to a number |

Stems are not in the drop (100 MB). Make them, about 15 s:

```bash
python3 misc/halbschatten_reference.py /tmp/h.wav misc/halbschatten/stems   # 16 pre-master stems + parts/
```

Then compare `/tmp/h.wav` with `reference.flac`. Here they are bit-identical. If your numpy draws a different random stream, the noise and the humanizing differ and nothing else; in that case `parts/` and `reference.flac` are the truth. Don't commit the stems.

**Two traps in the script.** It renders at **44.1 kHz** (the app runs 48: resample the parts, compute every coefficient from Hz and seconds, run port checks at 44.1). And its MIDI numbers are written in F minor and sound a whole step up (`TRANSPOSE = 2` in `mtof`). Every pitch in this note is the sounding one.

## 2. The record

122 bpm. 16 steps a bar (3 ticks a step). Swing: odd 16ths late by 0.13 step (15.9 ms) on hats, shaker, rim, toms; by 0.065 step on the stab. Small random timing jitter on top (1–3 ms, see the script); dropping it is fine.

### Form

| bars | what plays |
|---|---|
| 0–7 | stab (sparse), echo, hall, pad, noise bed |
| 8–15 | + kick. Offbeat closed hat 12–15. Riser 14–16 |
| 16–23 | + bass, open hat on the offbeats. Stab medium |
| 24–31 | + closed 16th hats, toms. Riser 30–32 |
| 32–39 | stab full, + rim |
| 40–47 | + clap. Bar 47: no kick on beats 3–4, no bass from step 8, no clap on 4, feedback throw |
| 48–55 | break: no kick, bass, clap, toms, open hat. Stab medium, pad up, the lead enters. Offbeat closed hat and riser 52–56 |
| 56–63 | everything, the lead, the bass follows the chords |
| 64–71 | + shaker (fades in over 3 bars), + rim |
| 72–79 | no lead. Filter at its brightest (bar 76) |
| 80–87 | the lead again. Bar 87: no kick on beat 4. Riser 86–88 |
| 88–95 | one chord again. No clap, shaker, lead |
| 96–103 | stab medium, no closed 16ths, no rim. Hats fading |
| 104–111 | no hats, no toms. Bass to 107 |
| 112–119 | no kick. Stab to 117, pad, echoes. Master fade from 118 |

### Harmony

Gm9 = G3 Bb3 D4 F4 A4 (55 58 62 65 69). Cm9 = 48 51 55 58 62. Dm9 = 50 53 57 60 64.
Bars 48–87: a 4-bar cycle Gm9, Gm9, Cm9, Dm9. Everywhere else Gm9. One hint earlier: in bars 39 and 47, stab hits on step 13 and later are Dm9.

### Patterns (step, velocity)

- **Kick:** steps 0, 4, 8, 12, bars 8–47 and 56–111, minus the two gaps above.
- **Stab.** Sparse (0–15): even bars (2, 1.0); odd (2, 0.9) (11, 0.55). Medium (16–31, 48–55, 96–117): even (2, 1.0) (11, 0.7); odd (2, 1.0) (7, 0.5) (13, 0.7). Full (32–47, 56–95): even (2, 1.0) (7, 0.55) (11, 0.8); odd (2, 1.0) (7, 0.55) (13, 0.8); plus (15, 0.35) when bar % 4 == 3. Velocity × (1 + 0.07·N(0,1)).
- **Bass** (step, note, length in steps, velocity), bars 16–47 and 56–107:
  - A: (3, G1 31, 2.0, 1.0) (6, 31, 1.3, 0.8) (10, 31, 2.5, 1.0) (14, D2 38, 1.5, 0.85)
  - B: (3, 31, 2.0, 1.0) (6, 31, 1.3, 0.8) (10, Bb1 34, 2.5, 0.95) (14, F2 41, 1.5, 0.8)
  - on Cm9: (3, C2 36, 2.0, 1.0) (6, 36, 1.3, 0.8) (10, 36, 2.5, 1.0) (14, Eb2 39, 1.5, 0.85)
  - on Dm9: (3, D2 38, 2.0, 1.0) (6, 38, 1.3, 0.8) (10, 38, 2.5, 1.0) (14, F2 41, 1.5, 0.85)
  - Bars 56–87 follow the cycle: A, B, Cm9, Dm9. Elsewhere A on even bars, B on odd.
- **Closed hat**, 16ths, bars 24–47 and 56–95: step % 4 = 0 → 0.42, 1 → 0.24, 3 → 0.34, nothing on 2. × (1 + 0.15·N) × the hat lane. Three round robins. Bars 12–15 and 52–55: only steps 2, 6, 10, 14, at 0.4·(0.3 + 0.7·((bar % 4) + step/16)/4), a 4-bar crescendo.
- **Open hat:** steps 2, 6, 10, 14, bars 16–47 and 56–103, 0.62 × (1 + 0.08·N) × the hat lane. Two round robins.
- **Shaker:** every 16th, bars 64–87: [0.45, 0.7, 1.0, 0.7] by step % 4, × (1 + 0.12·N) × min(1, (bar − 64 + step/16)/4 + 0.25).
- **Clap:** steps 4 and 12, bars 40–47 and 56–87, 0.9.
- **Rim:** bars 32–47 and 64–95. Even bars (7, 0.9) (13, 0.6); odd (10, 0.8) (15, 0.55).
- **Toms** (D3 50, F3 53, G3 55), bars 24–47 and 56–103. Even bars (5, G3, 0.9) (11, F3, 0.7); odd (5, G3, 0.9) (9, D3, 0.6) (14, F3, 0.75). × (1 + 0.1·N).
- **Lead** (step, note, length in steps). 4-bar phrase starting at bars 48, 52, 56, 60, 64, 68, 80, 84:
  - bar 1: (0, D5 74, 6) (6, Bb4 70, 4) (10, A4 69, 6)
  - bar 2: (0, G4 67, 10) (10, A4 69, 2) (12, Bb4 70, 4)
  - bar 3: (0, F5 77, 6) (6, D5 74, 4) (10, C5 72, 6)
  - bar 4: (0, D5 74, 14). On the phrases starting at 52, 60, 68, 84: (0, D5 74, 6) (6, F5 77, 4) (10, A5 81, 6)
  - velocity 0.8 + 0.15·U(0,1)

### Lanes (bar, value), linear between points

| lane | points |
|---|---|
| stab cutoff, Hz | (0, 250) (8, 360) (16, 500) (32, 720) (44, 1050) (48, 560) (56, 1400) (64, 1750) (76, 2500) (84, 2100) (88, 1200) (96, 800) (104, 520) (112, 360) (120, 230) |
| stab decay, s | (0, 0.11) (32, 0.14) (48, 0.24) (56, 0.16) (76, 0.20) (96, 0.13) (120, 0.10) |
| echo feedback | (0, 0.68) (15, 0.68) (15.5, 0.86) (16.25, 0.66) (31, 0.66) (31.5, 0.88) (32.25, 0.64) (46.5, 0.64) (47.5, 0.90) (49, 0.74) (55, 0.74) (55.5, 0.86) (56.25, 0.62) (86.5, 0.62) (87.5, 0.88) (88.5, 0.66) (110, 0.68) (112, 0.82) (118, 0.76) (120, 0.6) |
| echo send | (0, 1.0) (32, 0.9) (48, 1.0) (56, 0.9) (88, 0.95) (104, 1.0) |
| hats | (12, 0) (16, 0.6) (24, 0.8) (40, 1.0) (48, 0.9) (52, 0) (56, 0.9) (64, 1.0) (88, 1.0) (96, 0.7) (104, 0) |
| pad cutoff, Hz | (0, 300) (16, 480) (48, 900) (56, 620) (76, 1100) (96, 600) (120, 300) |
| pad level | (0, 0) (4, 0.8) (8, 1.0) (16, 0.75) (32, 0.6) (47, 0.7) (48, 1.0) (55, 1.0) (56, 0.6) (88, 0.75) (112, 1.0) (118, 0.7) (122, 0) |
| lead level | (48, 0.55) (56, 1.0) (72, 1.0) (80, 0.8) (88, 0.8) |
| noise | (0, 0) (1, 1.0) (16, 0.8) (32, 0.6) (48, 1.0) (56, 0.6) (96, 0.8) (112, 1.0) (120, 0.9) (122.5, 0) |

## 3. The voices

**Sampled, from `parts/`** (the reference's own, as Abyss took its kick, hats and sub). Don't re-synthesize them.

- **Kick, hats, shaker, clap, rim, toms:** new kits in `scripts/synths.py`, loaded from the WAVs and resampled to 48 kHz. The reference chose each round robin at random; the engine's own rotation is fine. Mind `register`'s −3 dB normalization and the drum velocity curve (`vel_for` in `abyss.py`).
- **Pans** (constant power, −1…1): closed hat +0.18, open hat −0.15, shaker +0.4, rim +0.35, toms −0.3 / +0.3 alternating within the bar, kick, clap and bass centre. If the sampler is mono, this needs stereo files or a pan per sound.
- **The hat bus** has a 12.5 kHz 2nd-order lowpass. Bake it into the hat samples.
- **Bass:** `bass_note()`: sin + 0.4·sin(2φ + 0.3) + 0.15·sin(3φ) through tanh(1.4x), plus 0.28 × a PolyBLEP saw an octave up through a 380 Hz lowpass. 8 ms attack, level falling 1 → 0.75 over the note, then e^(−t/30 ms). The bus has a 520 Hz lowpass. Six pitches, four lengths: render each (pitch, length) with the lowpass baked in.
- **Noise bed:** pink-ish hiss plus vinyl crackle, at 0.0355, under the noise lane, ducked 0.3. Loop the 32 s file the way the `crackle` bed is retriggered.
- **Risers:** four noise sweeps ending on bars 16, 32, 56, 88, each followed by a 2-bar wash. Cut them from the `riser` stem. They are 2 or 4 bars long at 122, so trigger them to *end* on the downbeat.

**Live.**

- **Stab** (`make_stab`, then the bus chain in `render`). Not `DubStab` as it is:
  - Per chord note three PolyBLEP saws at −9, 0, +8 cents (each ± about 1.5 cents, fixed per variant), panned −0.75, 0, +0.75, random start phases. Sum ÷ 5, plus white noise × 0.10 per side. Four variants per chord; `parts/stab_raw_*` are those buffers and can be played as samples for the band's stab.
  - Amp per hit: 3 ms linear attack, e^(−t/decay) with decay from its lane at the hit, 7 × decay long, × velocity.
  - **One filter for the whole stab bus, per side**, not one per note: two TPT state-variable lowpasses in series (the same formulas as `DubStab`), Q 2.4 then Q 0.7.
  - Cutoff per sample: lane × 2^(1.6·env) × (1 + 0.10·sin(2π·bar/6.5)), clipped to 60–14000 Hz. `env` is the largest of velocity·e^(−t/85 ms) over the hits so far.
  - Then tanh(1.3x)/1.3, × (700 / lane)^0.15, × 0.7036.
- **Lead** (`fm_pluck`), two-operator FM, stereo: index = 2.4·vel·e^(−t/0.11) + 0.35; a = sin(2πft + index·sin(2π·2f·t)); b = sin(2π·1.004f·t + 0.6·index·sin(2π·3·1.004f·t)); L = a + 0.35b, R = 0.9a + 0.5b. Amp: 4 ms attack, e^(−t/0.55), after the note's length × e^(−t/0.25), × vel. Bus: 5.2 kHz 2nd-order lowpass, the lead lane, × 0.1148.
- **Pad:** a drone, always on. G2 43 (1.0), D3 50 (0.9), G3 55 (0.7), D4 62 (0.5), F4 65 (0.4). Per note two PolyBLEP saws a side: −6 and +3 cents left, +6 and −2 right. One TPT lowpass a side, Q 0.9, cutoff = lane × (1 + 0.28·sin(2π·bar/9 + 1.0)), the right side × 1.07. Then the pad level lane, a 110 Hz 2nd-order highpass, × 0.0384.

## 4. The chain

- **Duck.** Every kick sets an envelope: 0 → 1 over 3 ms, held to 20 ms, then e^(−t/110 ms), the largest of the overlapping ones. Depths: bass 0.78, pad 0.55, hall return 0.40, echo return 0.35, stab 0.30, noise 0.30, lead echo 0.25. Nothing else ducks.
- **Echo** (`tape_delay`). Close to `DubChamber`'s delay, with these differences:
  - Time 0.75 beat × (1 + 0.0012·sin(2π·0.23t) + 0.0004·sin(2π·3.1t)).
  - No send filters. What is read from each line goes through a one-pole lowpass at 4200 Hz, then a one-pole highpass at 130 Hz; that filtered signal is both the output and the feedback.
  - Left line ← left in + feedback·tanh(1.5·right)/1.5, right line ← right in + feedback·tanh(1.5·left)/1.5. No crossfeed on the output.
  - **Feedback follows its lane** (the throws at 15.5, 31.5, 47.5, 55.5, 87.5).
  - Input: the stab bus summed to mono (after its filter and gain) × the send lane. **Each stab hit enters on the other side from the one before** (hit 0 left, hit 1 right; the switch is 120 samples before the hit, crossfaded over 200). Plus, always left: rim × 0.6 and toms × 0.25 at their mix levels.
  - Return × 1.2, ducked 0.35.
- **Lead echo:** the same delay, second instance: 1.5 beats, feedback 0.42, wobble 0.001 at 0.17 Hz, lowpass 3000, highpass 350, the lead's mono sum enters right. Return × 0.7, ducked 0.25.
- **Hall:** convolution with `ir_hall` (7 s, 28 ms predelay), left send with the left impulse, right with the right. Sends, after each bus's gain and duck: stab 0.55, echo 0.5, pad 0.9, lead 0.7, lead echo 0.5, clap 0.35, rim 0.3, risers 0.8. Return × 0.4515, ducked 0.40. **No Dattorro plate on this song.**
- **Room:** convolution with `ir_room` (1.4 s): clap 0.8, hats 0.35, toms 0.5, rim 0.6, shaker 0.4. Return × 0.5668, not ducked. Only one-shots feed it, so it can be baked into stereo samples instead.
- **Master:** sum → 24 Hz 2nd-order highpass → fade (half cosine from bar 118 to the end of the 7 s tail) → tanh(1.43x)/1.1 → a limiter at 0.70 → × 1.2714.
  - The limiter is two-pass (not causal) and does at most 0.7 dB on 4 % of the samples. Leave it out.
  - Keep the tanh: it is on the kick all the time. Run it at the reference's level and scale after, the way `dub.level` does for the chamber's saturator.
  - The app plays its electronic tracks at about −19 dBFS mean; the reference is at −11. Bring every bus down by the same amount.

## 5. What the engine is missing

1. **A convolver** for the hall (partitioned FFT, vDSP). The impulse has 28 ms of leading silence: use 1024-frame partitions and trim the same from the impulse, and it adds no latency. This is the one piece without a per-sample port.
2. **Lanes:** a value by bar, read per sample, for the nine rows in section 2.
3. **The stab as a bus:** raw voices into one stereo filter pair with the shared envelope, plus the noise and the pans. Your keys on the chords part go into the same bus.
4. **Chamber options:** feedback from a lane, alternating input side, two wobbles, send filters off, filters on the read, a second instance for the lead, the plate off.
5. **Two more live voices and somewhere to put them:** the pad (no channel today) and the FM lead (horns).
6. **Duck shape:** attack and hold, not only release.
7. **Master drive** (the tanh) per song, and a 24 Hz highpass.
8. **Time finer than a tick:** the swing. A `late` per event, or baked into odd-step samples as `hatDub16` does. The stab's swing needs the first.
9. **Stereo or pan** for sampled drums, if not there.

If one of these gets cut, say so to Bart before building around it. The plate instead of the hall, or no swing, is a different record.

## 6. Checks

Same as `DUB-TECHNO.md` §6.

- **Port checks,** scratch harnesses at 44.1 kHz against the stems: the stab bus with noise off and the raw buffers in (should null), the echo fed the reference's stab stem, the convolver fed the hall's sends.
- **Bus by bus** from `-RenderTo` renders at `-Tempo 122`. Solo renders for drums, the full mix for anything that ducks. Pre-master stems, bars 64–71, dBFS:

| stem | RMS | peak |
|---|---|---|
| kick | −15.6 | −7.0 |
| bass | −19.6 | −10.8 |
| chords (dry stab) | −26.7 | −8.8 |
| dub_delay | −30.1 | −8.6 |
| hall | −28.6 | −14.0 |
| lead | −26.1 | −13.9 |
| lead_echo | −34.6 | −18.0 |
| pad | −31.8 | −17.6 |
| hats | −35.2 | −13.5 |
| clap | −35.9 | −11.5 |
| toms | −33.5 | −15.0 |
| shaker | −41.5 | −17.6 |
| rim | −44.9 | −11.0 |
| room | −39.2 | −20.2 |
| noise | −53.4 | −38.3 |

- **Octave bands** 30 Hz–22 kHz against `reference.flac`, within ±0.8 dB, in bars 0–7, 24–31, 48–55, 64–71, 104–111. Kick and bass mono. No clipping.
- **The master as measured:** −10.2 LUFS, mean −11.0 dBFS, true peak −0.9 dBFS, 243.1 s.
- **Then Bart's ears:** the mp3, then the app, headphones and speakers. That is the acceptance test.

## 7. Song and parts

`scripts/songs/halbschatten.py` → `song-halbschatten.json`: "Halbschatten", Dub techno, G minor, 122. Build the record alone first, as a reference song with only the chords part (the way Abyss Reference was), and match it. Then the parts:

- **Chords:** the stab. Voicings above, roles root to ninth, fingers as in `abyss.py`.
- **Melody:** the lead line.

Weights and levels are `takt-blues` and `takt-chart`'s call, not this note's.

Not checked here: nothing in this note has been built or run in Swift. The Python render is the only thing that exists.
