# How Abyss is made: dub techno in Swift (Takt 0.1 (46))

This is the recipe for **Abyss**, the dub techno track on Takt's Stage: 117 bpm, Dm9 drifting to
Cm9, 72 bars, 2:28. It covers every voice, the arrangement, the real-time chain in Swift, the mix,
and how each step was checked. Following it should let you rebuild the track, or make another one
in the same style.

**The target is a reference, not a description.** `misc/dub_reference.py` renders 16 bars of the
fixed sound (`misc/dub_reference.mp3`), and `misc/DUB_TECHNO_FIXES.md` lists what was wrong with
0.1 (43) and why. In 0.1 (45) the app plays that reference:

- the chamber (`Takt/Audio/DubChamber.swift`) is a line-for-line port of the reference's
  `dub_delay` and `dattorro`. The same input gives the same output to within −128 dB;
- the stab (`Takt/Audio/DubStab.swift`) is a port of `render_stab`, synthesized live, to within
  −50 dB (Float32 phases);
- the kick, the hats and the sub are the reference's, as one-shots;
- the levels are the reference's mix, bus by bus: the app's 16 bars sit 6.0 dB under the
  reference's on every bus (the other songs' loudness), and every octave band, in every section,
  is within ±0.8 dB.

What is **not** in the reference is the full form (72 bars), the melody part, and your own keys.
Those are built on the same pieces. **Abyss Reference** (section 3) is the reference alone.

---

## 1. Signal flow

```
 kick ─────────────────────────────────────────────┐   (dry, mono, never ducked)
 hats ─────────────────────────────────────────────┤   (dry)
 sub ──── × (1 − 0.6·kickEnv) ─────────────────────┤   (dry, mono)
 stab (live synth) ─ × (1 − 0.3·kickEnv) ─┬────────┤   (the dry stab)
 melody (live synth) ─ × (1 − 0.3·kickEnv)┤        │
 your keys (live synth, the part's level)─┤        │
                                          │ × send │
                                          ▼        │
                     ┌── DubChamber ──────────────────────────────────────┐
                     │ ÷ level                                            │
                     │ send: one-pole HP 220 → LP 3.8 kHz                 │
                     │ ping-pong, ¾ beat; in the loop: one-pole HP 180 →  │
                     │   LP 3.2 kHz → tanh(1.4x)/1.4, × 0.72              │
                     │ wobble ±0.4 % at 0.6 Hz; crossfeed 0.3             │
                     │ plate ← dry send × 0.44 + echoes × 0.6, HP 300     │
                     │ return: echoes × 2.2 + plate × 1.5,                │
                     │   × (1 − 0.25·kickEnv); + tape hiss                │
                     │ × level                                            │
                     └──────────────────────────┬─────────────────────────┘
                                                ▼  │
                                     Σ → × 0.72 → soft knee above 0.8 → out
```

The app's room reverb (`AVAudioUnitReverb`, used for the piano) is **bypassed** for a band with a
chamber, so kick and sub stay mono and dry.

---

## 2. The voices

### Kick: `kickDub` (`scripts/synths.py`, sampled)

`kick(f0=110, f1=44, pd=0.045, decay=0.32, click=0.05, drive=1.2)`: a sine sweeping from 110 Hz to
44 Hz (`f = 44 + 66·e^(−t/45 ms)`), decaying `e^(−t/0.32 s)`, a 2 ms noise click,
`tanh(1.2x)/tanh(1.2)`. This is the reference's kick exactly.

### Hats: `hatDub` and `hatDub16` (sampled)

`noise_hat(decay, hp, late)`: white noise through **two** RBJ highpasses at `hp` (Q 0.707), a 0.5 ms
attack, `e^(−t/decay)`, `decay · 8` long. No square partials: 0.1 (43)'s squares aliased into fizz.

- `hatDub`: 8 kHz, 25 ms. The offbeat hat.
- `hatDub16`: 9 kHz, 12 ms, with **7.7 ms of silence first**. That is the reference's shuffle (the
  16ths 6 % of a sixteenth late), finer than the song's tick grid, so it lives in the sample.

One velocity layer, four round robins each. They draw from their own random generator
(`rng_dub`), so changing them leaves the other songs' noise alone.

### Sub: `subDub` (sampled)

The reference's sub exactly: a plain sine 1.9 beats long at 117 bpm, a 20 ms attack, a linear
150 ms fade at its end, baked into the sample (the song's notes are longer, so the sample ends
it). D2 on Dm9, C2 on Cm9.

### Stab: `liveStab` (`Takt/Audio/DubStab.swift`, synthesized live)

The hero. Per note (a chord is five of them, started together):

- **Oscillators:** three PolyBLEP saws at × 1.0, × 1.0045, × 0.9955, all starting at phase 0.
  `saw = (2p − 1) − blep(p, dt)`, where `blep` is the two-sample polynomial correction at the wrap.
- **Filter:** a TPT/Cytomic state-variable lowpass, Q 1.1:
  `g = tan(π·fc/sr)`, `k = 1/Q`, `a1 = 1/(1 + g(g + k))`, `a2 = g·a1`, `a3 = g·a2`;
  `v3 = x − ic2`, `v1 = a1·ic1 + a2·v3`, `v2 = ic2 + a2·ic1 + a3·v3`,
  `ic1 = 2v1 − ic1`, `ic2 = 2v2 − ic2`; out `v2`. Recomputed every sample, so the cutoff can move.
- **Cutoff:** `base · (1 + 2.2 · e^(−t/18 ms))`, the hit opening and settling.
- **Breath:** `base = 350 · (2400/350)^breath`, with `breath = 0.5 − 0.5·cos(2π · tick / bar / 16)`
  read at the exact tick the note starts: dark at bar 0, brightest at bar 8, dark again at 16.
  Continuous, so there are no steps (0.1 (43) had five sampled layers and jumped between them).
- **Amp:** 3 ms attack, `e^(−t/160 ms)`, a 20 ms linear release at the end; a note lasts 0.45 s
  at most.
- **Level:** `velocity · (0.6 + 0.4·breath) / 15` × the channel's level. Darker is a little quieter.

The band names it as the instrument `liveStab` and carries its settings as `stab`
(`BandData.Stab` → `DubStab.Settings`). `BandRenderer` keeps a pool of 48 `DubStab.Voice`s; each
voice remembers the bus it plays into (keys, horns or the monitor), so the band's stab, the melody
and your keys all use the same synth.

**Cost:** 15 voices at once (three overlapping chords) run at 14.6× real time unoptimized on an M4;
the chamber at 22.6×. No `tan` table or block-rate coefficients were needed.

---

## 3. The song (`scripts/songs/abyss.py`)

```bash
python3 apps/takt/scripts/songs/abyss.py           # → Takt/Content/song-abyss.json
python3 apps/takt/scripts/songs/abyss.py --ref     # → song-abyss-ref.json, Abyss Reference
```

`--ref` writes **Abyss Reference**, the sixth song on the Stage: the reference's 16 bars and nothing
else (no sub or 16ths for bars 0–3, the kick out for bars 12–13, no melody, velocities exactly as
the reference writes them). Its one part is the stab; a song may have the chords part alone
(`Song.partKeys`). It is also what the A/B renders below use.

### Form

| bars | section | what plays |
|---|---|---|
| 0–7 | Intro | kick, offbeat hat (bar 0 at half), stab |
| 8–23 | Deep | + sub, + 16th hats, + the melody (main notes only until bar 16) |
| 24–39 | Drift | the same |
| 40–47 | Abyss | no kick, sub or 16ths: the stab and the chamber alone |
| 48–67 | Deep again | everything |
| 68–71 | Out | no 16ths; sub and stab to bar 69 |

The chord is Dm9 for four bars, Cm9 for four (`(bar // 4) % 2`).

### Drums (16 steps a bar, 3 ticks a step)

- kick on 0, 4, 8, 12 (velocity 1.0, unless the section has no kick);
- `hat` on 2, 6, 10, 14 (1.0, bar 0 at 0.5);
- `hat16` on the odd steps (random 0.8–1.0) where the section has 16ths.

### Sub

Beats 1 and 3, 23 ticks, velocity 1.0.

### Stab (the chords part)

Dm9 = D3 F3 A3 C4 E4 (50 53 57 60 64), Cm9 = C3 Eb3 G3 Bb3 D4. Hits on step 2 (velocity 0.85,
weight 1), step 7 (0.7, weight 2) and, in odd bars, step 10 (0.55, weight 3). The velocities are
the reference's; the breath is the synth's, not the velocity's.

### Melody (the echo line)

There's no lead synth: a square-wave melody read as a game tune (DUB_TECHNO_FIXES §7). The melody
part is **single notes in the stab's own voice**, on offbeats between the stab's hits, sent harder
than the stab so the delay writes the line. A four-bar phrase on Dm9, chord tones only:

| bar | notes (tick, MIDI, weight) |
|---|---|
| 0 | (15, A4, 1) (39, C5, 3) |
| 1 | (12, E5, 1) (33, D5, 2) |
| 2 | (15, C5, 1) (36, A4, 2) (45, E4, 3) |
| 3 | (24, E5, 1) (42, C5, 3) |

The same a step down on Cm9. Deep bars 8–15 play weight 1 only, the Abyss drops weight 3, and Out
has one A4 in bar 68.

### Levels, duck, dub (the song's JSON)

```python
s.sounds = {"kick": {"kit": "kickDub", "gainDb": -14.4}, "hat": {"kit": "hatDub", "gainDb": -25.2},
            "hat16": {"kit": "hatDub16", "gainDb": -32.3}, "xstick": {"kit": "rimMin", "gainDb": -28}}
s.instruments = {"bass": "subDub", "keys": "liveStab", "horns": "liveStab", "monitor": "piano"}
s.levels = {"bass": -4.9, "keys": -0.7, "horns": -0.7}
s.duck = {"release": 0.2, "channels": {"bass": 0.6, "keys": 0.3, "horns": 0.3}}
s.dub = {"sends": {"keys": 0.6154, "horns": 0.6923}, "level": 0.291, "beats": 0.75, "feedback": 0.72,
         "highpass": 180, "lowpass": 3200, "drive": 1.4, "wobble": 0.004, "wobbleRate": 0.6,
         "sendHighpass": 220, "sendLowpass": 3800, "cross": 0.3, "echo": 2.2, "reverb": 1.5,
         "reverbDry": 0.4375, "reverbEcho": 0.6, "decay": 0.82, "damping": 0.35, "bandwidth": 0.7,
         "predelay": 0.02, "reverbHighpass": 300, "duck": 0.25, "hiss": 0.006}
```

Where the numbers come from:

- **sends**: the reference mixes the dry stab at 1.3 and sends it at 0.8, so the send is 0.8/1.3
  of the dry channel. The melody is sent at 0.9/1.3.
- **reverbDry**: the reference's plate hears the stab at 0.35. Relative to what the delay hears
  (0.8), that's 0.4375.
- **level**: the chamber divides its input by this and multiplies its return by it, so the
  saturator in the loop sees the reference's own signal level (a stab peaking at 0.8). It is 0.291
  because the app plays the reference's mix 6 dB quieter: `norm · 10^(−6/20) / 0.72`, where `norm`
  (0.418) is the reference's final normalization and 0.72 the app's master.
- **gainDb / levels**: drums from solo renders against the reference's stems; the stab and the
  sub from the full mix, because they duck and a solo without the drums has no kick to duck to
  (section 6).
- **duck**: the sub at 0.6 (it plays on top of the kick), the stab and melody at 0.3, the return
  at 0.25, all with the reference's 0.2 s release. The kick and hats aren't ducked.
  `duck.channels` is a depth per channel for every song now (0.1 (43) had one depth).

---

## 4. The chamber in Swift (`Takt/Audio/DubChamber.swift`)

Ported from `dub_delay` and `dattorro` in `misc/dub_reference.py`, per sample, nothing allocated on
the render thread (circular `Line` buffers made up front, the output taps in a pointer).

### Building blocks

- `OnePole`: `y = a·y + (1 − a)·x`, `a = e^(−2π·fc/sr)`; the highpass is `x − lowpass(x)`.
  6 dB/oct, like tape. 0.1 (43) had 12 dB/oct biquads in the loop, and every pass took the full
  slope again: echo 2 came out 17 dB under echo 1, which made a slapback.
- `Line`: a circular buffer. `push` writes and moves on, `oldest` is the sample `n` back,
  `allpass` is `ap_step`, `tap(off)` is the reference's `tap`, `read(d)` an interpolated
  fractional read.

### The delay, per sample

```swift
let dry = (sendL[i] + sendR[i]) * 0.5 / level
let x = sendLP.low(sendHP.high(dry))                  // even echo 1 is darker than the stab
delay += (target - delay) * glide                     // target = 0.75 beat; 50 ms glide on a tempo change
phase += 2π · wobbleRate / sr
let d = delay * (1 + wobble * sin(phase))
let yL = lineL.read(d), yR = lineR.read(d)
let fromR = tanh(drive * lpL.low(hpL.high(yR))) / drive
let fromL = tanh(drive * lpR.low(hpR.high(yL))) / drive
lineL.push(x + feedback * fromR)                      // the input enters left
lineR.push(feedback * fromL)
let eL = yL + cross * yR, eR = yR + cross * yL        // bounce, never hard in one ear
```

Measured on a 30 ms stab burst: about eight repeats, 5.0, 4.2, 3.9, 3.8, 3.8, 3.7 dB apart.

### The plate (Dattorro 1997)

Lengths are Dattorro's at 29761 Hz, scaled to the sample rate (`sl(x) = max(1, Int(x · sr/29761))`).

1. Input `dry · reverbDry + (eL + eR)/2 · reverbEcho`, a one-pole highpass at 300 Hz, predelay
   20 ms, the bandwidth one-pole (`bw += 0.7 · (x − bw)`).
2. Four input allpasses: 142 and 107 at 0.75, 379 and 277 at 0.625.
3. Two tanks, crossed (the left hears the right's end and the other way round). Each has a
   modulated allpass (672 / 908 samples ± 16, an LFO at 0.9 Hz, sine on the left and cosine on the
   right, coefficient 0.7 with the paper's sign), a delay (4453 / 4217), damping
   (`d = t·(1 − 0.35) + d·0.35`), × decay 0.82, an allpass at 0.5 (1800 / 2656), and a delay
   (3720 / 3163).
4. The output taps exactly as in `dattorro()` (seven per side), × 0.6.

The tail decays evenly, 3.6–4.4 dB every 0.5 s.

### The return

```swift
let g = (1 - duck * kick[i]) * level
outL[i] += (eL * echo + 0.6 * oL * reverb) * g + hissL * level
outR[i] += (eR * echo + 0.6 * oR * reverb) * g + hissR * level
```

The hiss is two xorshift noise generators (RMS 1), each through a 3 kHz RBJ highpass, × `hiss`,
only while the band plays.

### Switching bands

`configure(nil)` turns the chamber off. `configure(s)` recomputes the filters and, if it was off,
clears every line, so the last song's tail doesn't leak into the next.

---

## 5. Into the mixer (`Takt/Audio/BandRenderer.swift`)

Per chunk, `mixDown`:

1. builds the duck envelope `kickEnv` once (1 at a kick, × `e^(−1/(0.2·sr))` per sample);
2. per channel: the fader glides, the sample is × `(1 − depth[channel]·kickEnv[i])`, added to the
   output and, post-fader and post-duck, × the channel's send into the send bus;
3. `chamber.process(..., playing: playing, ...)` adds the return;
4. master × 0.72, then a soft knee above 0.8.

**Your keys**: `AudioEngine.load(song:part:)` gives the monitor channel the part's instrument
(`liveStab`), level, duck depth and send. Play the stab part and your chords open and close with
the record's breath (the synth reads it from the transport's tick when you press), and go into the
same echo.

### Wiring checklist (a live stab or a chamber in another song)

- `s.stab = {...}`, and `"liveStab"` as the channel's instrument and the part's monitor.
- `s.dub = {...}` with every field above; leave kick and bass out of `sends`.
- `s.duck = {"release": ..., "channels": {channel: depth}}`.
- `python3 scripts/songs/<song>.py`, rebuild.

---

## 6. How it was checked

**Port checks** (scratch harnesses compiled with `swiftc` against the two Swift files):

- `DubChamber` fed the reference's own dry stab and duck envelope: the residual against the
  reference's echoes and plate is −128 dB.
- `DubStab` against `render_stab` for one Dm9 chord: −50 dB.

**Renders through the real engine** (the simulator, faster than real time):

```bash
cd apps/takt
xcrun simctl launch --console "iPhone 17 Pro" com.bartdecrem.Takt -Backend http://localhost:1 \
  -RenderTo $PWD/build/audio/abyss16.wav -RenderSeconds 36 -Tempo 117 \
  -RenderScript "0:band=song-abyss-ref,0:play"
# a solo: 0:mute=drums,0:mute=bass,0:mute=horns before 0:play (the hiss stays: it is the chamber's)
# your keys on a part: 0:song=song-abyss/chords, then 1:on=50@0.8 … 1.2:off=50
```

Against the reference, bars 4–11, the app raised 6 dB:

| bus | reference vs drums | app vs drums |
|---|---|---|
| drums | 0.0 | 0.0 |
| sub | −3.7 | −3.7 |
| stab + echoes + plate | −5.9 | −5.9 |
| hats (peak in the top octave): offbeat / 16th | −36.9 / −46.0 dB | −36.9 / −46.1 dB |

Octave bands 30 Hz–22 kHz match within ±0.8 dB in bars 0–3, 4–11, 12–13 and 14–15. Kick and sub
side/mid are 0.01–0.02 (mono). The full song sits at −21.4 dBFS RMS (Hypnotist −22.1, Warm Nine
−21.3), peaks at 0.46, and nothing clips. Your keys on either part give a stab with its full trail.

Two traps. The hiss runs in every solo, at −60 dB in the top octave: hats measured as "energy
above 5 kHz" read the hiss and came out 17 dB too quiet, so compare hat peaks, not band energy.
And a solo with the drums muted fires no kick, so nothing ducks: the stab and sub calibrated that
way came out about 1 dB low in the mix. Set ducked buses from the full mix.

**Abyss Reference against `dub_reference.wav`**, the app raised 6 dB, octave bands 30 Hz–22 kHz
in bars 0–3, 4–11, 12–13 and 14–15: within ±0.2 dB everywhere but the top octave of the break
(−0.3; hats and hiss are noise). Mix RMS −15.94 vs −15.99, peak 0.892 vs 0.890. It gets there
with the reference's own master: `knee: 0.48` puts the app's soft knee where the reference's sits
6 dB down (it clips its sum at 0.95 and renormalizes by 0.96), and every bus and the chamber's
level come down 0.35 dB to match.

**`-LessonCheck 1`** (`App/LessonCheck.swift`) checks the chamber from `song-abyss.json`:

- a 30 ms stab burst (the live synth) gives a trail of echoes ¾ beat apart, each 2–6 dB under the
  last from the second on;
- a bright click's echoes get darker every time (the lowpass in the loop) and alternate sides
  (92 % on their own side);
- the plate alone decays evenly: every 0.5 s within 1.5 dB of the mean drop.

**Not checked: Bart's ears.** The acceptance test is the A/B: `dub_reference.mp3`, then the app's
16 bars, on headphones and on speakers.

---

## 7. Knobs worth turning

| what you hear | turn (in `abyss.py`) |
|---|---|
| echoes pile up | `feedback` 0.72 → 0.65, or `echo` down |
| echoes too short | `feedback` up (≤ 0.8), `highpass` 180 → 120 |
| echoes too dark | `lowpass` 3200 → 4500, `sendLowpass` 3800 → 5000 |
| more smear | `wobble` 0.004 → 0.006 |
| more space / less | `reverb` 1.5, `decay` 0.82 (0.9 is very long) |
| the stab too sharp / too dull | `stab.high` 2400, `stab.low` 350, `stab.q` 1.1 |
| the hit too clicky | `stab.env` 2.2 → 1.5 |
| the breath too fast | `stab.sweepBars` 16 → 32 |
| too much pumping | `duck.channels`, `dub.duck` |
| the melody too present / too buried | `levels.horns`, `sends.horns` |
| hiss too loud | `dub.hiss` 0.006 → 0.003 |

Any change here: `python3 scripts/songs/abyss.py`, then rebuild. Hat or sub changes go in
`scripts/synths.py` (the venv with numpy, scipy and soundfile), then rebuild.

## Files

- `misc/dub_reference.py`, `misc/dub_reference.mp3`, `misc/DUB_TECHNO_FIXES.md`: the target and the brief
- `Takt/Audio/DubStab.swift`: the live stab
- `Takt/Audio/DubChamber.swift`: the delay, the plate, the hiss
- `Takt/Audio/BandRenderer.swift`: the stab voices, `mixDown`, per-channel duck, sends
- `Takt/Audio/BandData.swift`: `Duck`, `Dub`, `Stab`
- `Takt/Audio/AudioEngine.swift`: your keys' instrument, send and duck; the room bypassed for dub bands
- `scripts/synths.py`: `kickDub`, `hatDub`, `hatDub16`, `subDub`
- `scripts/songs/abyss.py`, `scripts/songs/common.py`; `Takt/Content/song-abyss.json` (generated)
- `Takt/App/LessonCheck.swift`: the chamber checks; `Takt/App/DebugHooks.swift`: `song=` for renders
