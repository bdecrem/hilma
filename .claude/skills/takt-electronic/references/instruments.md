# The instruments of the dub techno system

Every voice is synthesized in `misc/halbschatten_reference.py` (numpy; the function named
with each) at 44.1 kHz. In the app the one-shots are those renders as samples
(`scripts/halbschatten.py` → `Takt/Sounds/hs-*`, instruments `hs…` and `hs…@44`), and the
three voices that depend on the moment are live in `Takt/Audio/Rack.swift`. MIDI numbers in
the script are written a whole step low (`TRANSPOSE = 2`); pitches here are the sounding ones.

## Kick (`make_kick`) → `kickHS`

A sine whose pitch **lands on the key's root** (G1, 49 Hz) from above: `f = 49 + 60·e^(−t/50 ms)
+ 230·e^(−t/7 ms)`. Amp 1.5 ms attack, `e^(−t/150 ms)`, 0.52 s long with a 40 ms fade.
`tanh(2.4x)` for weight, plus a click: noise through a 1.2–5.5 kHz bandpass, `e^(−t/4 ms)`,
× 0.55. A first-order 9 kHz lowpass over the whole. Mono, centre, never ducked, never sent anywhere. Mix
level 0.64 (the loudest thing: −7 dB peak).

## Bass (`bass_note`) → `hsBass13/15/20/25` (by length in tenths of a 16th)

`sin(φ) + 0.4·sin(2φ + 0.3) + 0.15·sin(3φ)` through `tanh(1.4x)`: a sine with a little
second and third harmonic, warmed. Plus an **octave-up layer** so the line reads on small
speakers: a PolyBLEP saw an octave up through a 380 Hz lowpass, × 0.28. Amp: 8 ms attack,
level falling 1 → 0.75 over the note, then `e^(−t/30 ms)`. The bus has a **520 Hz lowpass**
(baked into each sample). Mono, centre, ducked 0.78, dry. Pitches G1, B♭1, C2, D2, E♭2, F2.

## The stab (`make_stab`) → `hsStab0…3` for the record, `rackStab` live

A **minor ninth in close position** (Gm9 = G3 B♭3 D4 F4 A4; Cm9 and Dm9 the same shape).
Per note **three PolyBLEP saws** at −9, 0 and +8 cents (each ± about 1.5 cents, fixed per
variant), panned −0.75, 0, +0.75, random start phases; the chord's sum ÷ 5; plus **white
noise × 0.10 a side** through the same filter (the "chhh" in a dub chord). Four variants a
chord, drawn at random per hit. No filter or envelope in the buffer: the bus does both
(system.md), so the chord sweeps and decays with the arrangement.

- The record plays the reference's own twelve raw buffers, the variant each hit drew.
- Your keys, and the notes a level leaves to the band, are synthesized per note in the rack:
  the same three saws, detunes, pans and noise share, into the same filter, echo and hall. A
  five-note chord from the keys measures within 0.2 dB of the record's hit.

## The lead (`fm_pluck`) → `rackLead`, live

A soft **two-operator FM** bell, stereo. With `index = 2.4·vel·e^(−t/0.11) + 0.35`:
`a = sin(2πft + index·sin(2π·2f·t))`, `b = sin(2π·1.004f·t + 0.6·index·sin(2π·3·1.004f·t))`,
left `a + 0.35b`, right `0.9a + 0.5b`. The index falls fast, so the attack is bright and the
body is nearly a sine; the second pair, 0.4 % sharp with a 3:1 modulator, is the shimmer and
the width. Amp: 4 ms attack, `e^(−t/0.55 s)`, after the note's length × `e^(−t/0.25 s)`, 1.2 s
of tail. Velocity 0.8–0.95 moves both the level and the brightness. Bus: 5.2 kHz lowpass, its
level lane, gain 0.1148; not ducked; its own dotted-quarter echo.

## The pad → live in the rack

A drone, always on: **G2 (1.0), D3 (0.9), G3 (0.7), D4 (0.5), F4 (0.4)**: root, fifth, root,
fifth, flat seventh, no third, so it sits under all three chords. Per note two saws a side:
−6 and +3 cents left, +6 and −2 right (the sides are different oscillators: wide without
chorus). One state-variable lowpass a side, Q 0.9, cutoff from its lane × a 9-bar sine (±28 %),
the right side 7 % higher. Then the level lane, a 110 Hz highpass, gain 0.0384, ducked 0.55,
0.9 to the hall (mostly reverb by the time you hear it). The app starts its twenty saws at
the reference's own phases, so the pad nulls.

## Hats (`make_chh`, `make_ohh`, `metal`) → `hsChh0…2`, `hsOhh0…1`

Six square waves at 205.3, 304.4, 369.6, 522.7, 540 and 800 Hz (the 808's metal) mixed with
white noise, through a fourth-order highpass.

- Closed: metal 0.6 + noise 0.5, highpass 7.5 kHz, `e^(−t/13 ms)`, 90 ms. Three round robins.
  Pan +0.18.
- Open: metal 0.7 + noise 0.4, highpass 6.2 kHz, 2 ms attack, `e^(−t/95 ms)`, 0.42 s. Two
  round robins. Pan −0.15.

The hat bus has a **12.5 kHz lowpass** (baked in) and sends 0.35 to the room. Peak −13.5 dB.

## Shaker (`make_shaker`) → `hsShk0…2`

Noise through a 4.5–9.5 kHz bandpass, 6 ms attack, `e^(−t/30 ms)`, 0.14 s. Three round
robins, pan +0.4, room 0.4. Quiet (peak −17 dB): felt more than heard.

## Clap (`make_clap`) → `hsClap`

Noise through a 900–2800 Hz bandpass under four bursts: three at 0, 11 and 21 ms
(`e^(−t/6 ms)`, × 0.6) and the body at 30 ms (`e^(−t/85 ms)`). Centre. Room 0.8, hall 0.35:
the wettest drum. Peak −11.5 dB.

## Rim (`make_rim`) → `hsRim`

Two sines, 1750 Hz × 0.6 and 478 Hz × 0.5, `e^(−t/11 ms)`, plus a 1.2 ms noise click,
highpass 300 Hz. Pan +0.35. Room 0.6, hall 0.3, and **0.6 into the stab's echo**: the rim is
the percussion that the delay answers.

## Toms (`make_tom`) → `hsTom55L`, `hsTom53R`, `hsTom50R`, `hsTom53L`

Sines **tuned to the chord**: G3, F3, D3 (root, seventh, fifth). Pitch starts 55 % high and
falls in 12 ms, 1 ms attack, `e^(−t/65 ms)`, `tanh(1.5x)`. Panned −0.3 and +0.3 alternately
within the bar. Room 0.5, echo 0.25. Peak −15 dB.

## Noise bed → `hsNoise` (32 s, looped by the rack)

Pink-ish hiss (white through a 3-pole pinking filter, highpass 400 Hz, levelled to −20 dB)
plus **vinyl crackle** (about five clicks a second, log-normal sizes, bandpassed 900–7000 Hz,
the right side 7 samples late). In the mix at −29 dB under its lane, ducked 0.3. It is the
glue: louder when the track is sparse (intro, break, out), lower when the drums are full.

## Risers → `hsRiser0…3`

White noise through a resonant lowpass (Q 1.6) sweeping **250 Hz → 9 kHz** exponentially
over two or four bars, highpass 200 Hz, level rising as u^2.2; then a two-bar **wash** after
the downbeat (noise through a lowpass falling from 6.4 kHz to 400 Hz, `e^(−t/0.7 s)`). Four
of them, ending on bars 16, 32, 56 and 88, at 0.4, 0.5, 1.0 and 0.6 of full. 0.8 to the hall.

## What the engine can play today (for a new track)

| need | have |
|---|---|
| a one-shot at an exact time and level, on a bus with sends | any `hs…` kit or a new one cut the same way; `late`, `g`, `bus` |
| a chord stab through a moving filter | the stab bus: raw buffers for the record, `rackStab` live |
| a mono or stereo melodic voice | `rackLead` (FM); a sampled instrument on any channel |
| a drone | the rack's pad (notes, detunes and phases from the song file) |
| echo | two tape echoes (time in beats, feedback fixed or on a lane) |
| reverb | any impulse as `<name>-44.wav` / `<name>-48.wav`: a hall and a room at once |
| sidechain | per bus depth, the kick's envelope shaped |
| automation | lanes for the nine parameters in system.md; a new one is a `Lane` and one line in `process` |

Not there yet: a second stab bus, a lead with another synthesis, an acid line (a filter per
voice), per-step probability. Each is a port from a reference script, per the SKILL's step 5.
