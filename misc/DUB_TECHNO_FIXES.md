# Abyss: fixes for the dub techno sound

Apply these on top of `DUB-TECHNO.md` (Takt 0.1 (43)).

`dub_reference.py` and `dub_reference.mp3` are a 16-bar reference render with every fix applied. Every DSP block in it is a per-sample loop that ports line for line to Swift: `render_stab`, `dub_delay` and `dattorro`. Use it as the target. Bart listens to the reference and to the app's render of the same 16 bars, and his ears decide. Meters don't. Your current doc already says nobody has listened to it, and that's how it ended up sounding wrong.

Fixes are ranked by how much they matter.

---

## 1. The echo dies after one repeat (biggest problem)

The `-LessonCheck` numbers already show it. Echo energy goes 6.05 → 0.113 → 0.0154: echo 2 is 17 dB below echo 1. That's a slapback, not a dub trail. Dub techno needs 6–8 audible repeats that each fade by about 3–5 dB.

The cause is the second-order biquads (12 dB/oct) inside the feedback loop. Every pass applies the full slope again, so the loop strips the signal almost immediately.

**Change in `DubChamber.swift`:**
- In the feedback path, swap the HP/LP biquads for **one-pole filters** (6 dB/oct, like tape): `y = a·y + (1−a)·x` with `a = e^(−2π·fc/sr)`; the highpass is `x − lowpass(x)`.
- **Highpass 350 → 180 Hz, lowpass 2500 → 3200 Hz.**
- **Feedback 0.62 → 0.72. Drive 1.6 → 1.4.**
- Keep the wobble, but raise it to **±0.4 % at 0.6 Hz**.
- **Update `LessonCheck`.** For echoes 2 through 6, each echo should be 2–6 dB quieter than the one before, and keep the "darker each time" check. The reference measures 15.0, 6.3, 0.6, −4.2, −8.7, −13.0, −17.2 dB, so about −4.5 dB per repeat after the first.

## 2. The first echo is full-range and hard left

The send goes straight into the line, so echo 1 is an unfiltered copy of the stab, hard-panned, ¾ beat late. It sounds like a flam or a doubled stab, not a fading echo.

**Changes:**
- **Pre-filter the send** before it enters the delay: one-pole HP at **220 Hz**, then one-pole LP at **3.8 kHz**. Now even the first echo is darker than the dry stab, the way a send into a Space Echo sounds.
- **Crossfeed the delay output by 0.3**: `outL = yL + 0.3·yR`, `outR = yR + 0.3·yL`. The echoes still bounce side to side, but they never sit hard in one ear.

## 3. The reverb is a bare FDN, so it rings

Eight delay lines of 30–80 ms with no input diffusion and no modulation make a metallic, combed tail on tonal material like chord stabs. That's a likely source of the "awful."

**Replace it with a Dattorro plate.** Copy `dattorro()` from `dub_reference.py`. It has 4 input allpass diffusers, then a figure-8 tank with two modulated allpasses, damping and output taps, about 120 lines of Swift. Settings:
- decay **0.82** (about 5 s RT60)
- damping **0.35**
- bandwidth **0.7**
- predelay **20 ms**
- **one-pole HP at 300 Hz on the input**

Also **feed it the dry stab**, not only the echoes: reverb in = **stab × 0.35 + echoes × 0.6**. Right now the stab itself gets no space, only its repeats do.

If the plate isn't ready in time, a fallback is to send the chamber's reverb bus to `AVAudioUnitReverb` (`.largeHall2` or `.cathedral`, 100 % wet) on its own bus. Don't keep the bare FDN.

## 4. The stab "breath" moves in steps, and the resonance honks

Five velocity layers (600, 1000, 1600, 2500, 3600 Hz) make the filter jump in visible steps every few bars. Dub techno's whole character is a *continuous* sweep. Also:
- **Fixed resonance:** the Q 2.2 peak is baked into each sample and then repitched up to ±1.5 semitones. That leaves a fixed nasal ring.
- **Aliasing:** the numpy saws aren't band-limited, and 20 of them at once make that audible.

**Change: synthesize the stab live in the render block** instead of playing samples. It's cheap: 5 notes × 3 saws and one filter per stab, with at most about 3 stabs overlapping.
- **Oscillators:** **PolyBLEP saws**, 3 per note, detuned **×1.0, ×1.0045, ×0.9955**.
- **Filter:** a **TPT/Cytomic state-variable lowpass**, **Q 1.1** (down from 2.2).
- **Cutoff:** `base · (1 + 2.2 · e^(−t / 18 ms))`. This envelope replaces the separate "snap" layer.
- **Breath, continuous and logarithmic:** `base = 350 · (2400/350)^breath(bar)`, with breath at the exact time of each hit, not per bar.
- **Amp:** 3 ms attack, `e^(−t / 160 ms)` decay, 20 ms release.
- **Velocity:** gain `vel · (0.6 + 0.4·breath)`. Darker is a bit quieter, but no longer stepped.
- **Your keys:** route them to the same voice, so they also sweep continuously.

If live synthesis is off the table, render **at least 12 layers** with band-limited saws at Q 1.1, and **crossfade between the two nearest layers** by velocity. Never just pick one.

## 5. Hats: drop the square waves

Naive squares at 5.4–12.4 kHz alias into inharmonic fizz at 48 kHz. Use plain noise through **two highpass biquads at 8 kHz**, a 0.5 ms attack and a **25 ms** decay. Give the 16th hats **9 kHz** and a **12 ms** decay, velocity 0.16–0.22 (randomized), shuffled late by 6 % of a 16th.

## 6. The sub has to duck to the kick

The sub plays on beats 1 and 3, right on top of the kick, sustains about 0.9 s and is never ducked. The kick and sub then fight below 100 Hz and the low end goes flabby. **Duck the sub at depth 0.6** with the same envelope (release 0.2 s). It stays mono and stays out of the sends. Leave the kick un-ducked.

## 7. The lead melody isn't dub techno

A square/sine melody (A4 C5 G4 F4…) reads as a game tune. In the genre, the playable top line is usually the chord itself or a single sparse note answered by the echo. Options, in order of preference:
1. **Make the stab the Stage part.** It's the hero voice anyway, and the player's keys already go through the chamber.
2. **Turn the horns part into a "chord echo":** one short stab-voiced note (the 5th or the 7th of the chord) on an offbeat every 2 bars. Send it to the chamber at **0.9**, with the dry level at **−6 dB**. The delay writes the melody.
3. If the melody has to stay: cut it to the long notes, drop it 6 dB and send it at 0.7, so it lives in the echoes rather than on top.

This is a product call for Bart, since it changes what the player plays.

## 8. Levels: the chamber is the lead instrument

Right now stab plus chamber sits about 3 dB under the drums. In dub techno the echo is the loudest thing after the kick. Target RMS, each measured solo where it plays:

| bus | target, relative to drums |
|---|---|
| drums (kick and hats) | 0 dB |
| echo return | −2 to −4 dB |
| dry stab | −6 to −8 dB (the echo is about **+4 dB over the dry stab**) |
| reverb return | about the dry stab's level |
| sub | −4 to −6 dB |

The return's kick duck goes from 0.3 to **0.25**. The dry stab's duck stays at 0.3.

---

## How to check it

1. Render the app with a temporary 16-bar version of Abyss: no sub or lead for bars 0–3, kick out for bars 12–13, as in the reference. Get it as `build/audio/abyss16.wav`.
2. Put it next to `dub_reference.mp3` for Bart. **He listens to both on headphones and on speakers.** That's the acceptance test.
3. Meter checks that must pass:
   - each echo 2–6 dB quieter than the one before
   - reverb tail decays smoothly (sample energy every 0.5 s: the dB steps should be even, with no bumps)
   - kick and sub side/mid stays 0.00
   - no clipping

## Files

- `dub_reference.py`: the reference. `render_stab`, `dub_delay` and `dattorro` are the code to port, and `main()` shows the arrangement and gains. It needs numpy, scipy and numba.
- `dub_reference.mp3`: what it should sound like.
