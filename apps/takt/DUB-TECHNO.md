# How Abyss is made: dub techno in Swift (Takt 0.1 (46)), and Halbschatten (§8, 0.1 (121))

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

## 8. Halbschatten: a whole record from its reference (0.1 (121), 2026-11-09)

Bart: "implement this track into TAKT but make sure it sounds EXACTLY the same as the wav
created by the claude agent in the claude app. we have struggled with this in the past". The
record is `misc/halbschatten_reference.py` (G minor, 122, 120 bars, 4:03; the brief is
`misc/HALBSCHATTEN.md`). It is on the Stage as **Halbschatten**, and the app's render of it
is the reference: every octave band of every passage within 0.02 dB, every bus at the same
level to 0.01 dB, and at 44.1 kHz the app's stems null against the reference's.

**The method, for the next record that has to be the same** (what Abyss took three passes to
learn, done in one here):

1. **Run the reference; don't read it.** `scripts/halbschatten.py` loads the reference's
   source, patches a log line into every place it adds an event (in memory; the file is never
   edited), and runs it. The log holds each event's sample, its round robin and its velocity
   *after* the script's random humanizing, and the script asserts the logged render is
   `reference.flac` bit for bit, so the random stream was not disturbed. Nothing is
   transcribed by hand and nothing is "like" the reference: the song file is the log.
2. **Its own sounds.** Every one-shot is the reference's (`parts/`): the kick, hats, shaker,
   clap, rim, toms, each bass note rendered by its `bass_note`, the twelve raw stab buffers,
   the risers cut from the riser bus, 32 s of the noise bed, both reverb impulses. A linear
   filter on a bus (the hats' 12.5 kHz lowpass, the bass's 520 Hz) and a pan are baked into
   the samples; anything that depends on the beat or on other buses stays live.
3. **Port per sample, at the reference's own levels.** `Takt/Audio/Rack.swift` is `render()`
   in Swift: the same formulas, in the reference's units (every resolved gain is in
   `gains.json`), so each nonlinear stage (the stab's tanh, the echoes' feedback, the master)
   sees the signal it saw there. The app's loudness is one number after the master
   (`master.level`, −8 dB).
4. **Solo every bus and null it.** `-RackSolo <stem>` renders one bus before the master;
   `scripts/takt/halb-ab.py` compares each with the reference's stem (level, peak, lag, the
   residual of app − reference) and the master with the reference by octave band. A bus that
   is off by a constant in dB is a gain law (below); a bus whose level is right and whose null
   is poor is timing.

**What the engine gained** (all of it general, in the song file):

- `rack` (`BandData.rack`, `Rack.Settings`): **lanes** (a value by bar, linear between
  points: the stab's cutoff and decay, the echo's feedback and send, the pad's cutoff and
  level, the lead's level, the noise, the master's fade); **the stab bus** (hits into one
  filter pair a side whose cutoff every hit kicks open, tanh, the level taken back as it
  opens); **two tape echoes** (`Rack.Tape` is `tape_delay`: feedback from a lane, each hit
  entering on the other side, two wobbles, the filters on the read); **the lead** (two-operator
  FM, `fm_pluck`); **the pad** (twenty PolyBLEP saws from the reference's own start phases,
  one filter a side); **kit buses** with their sends (`sounds.<name>.bus`); **the noise bed**,
  looped; **the hall and the room** by convolution; **the master** (24 Hz highpass, fade, tanh,
  the limiter's forward pass, level).
- `Convolver` (`Takt/Audio/Convolver.swift`): uniformly partitioned convolution in the
  frequency domain (vDSP). One block of latency, paid by the impulse's own predelay (the hall
  1024 frames of its 28 ms, the room 256 of its 8 ms), so it is on time. Against scipy's
  `fftconvolve`: −130 dB. 280 times real time a channel.
- `late` and `g` on a hit and on a note (`BandData.Hit`, `.Note`): later than its tick by a
  fraction of a tick (swing and jitter are finer than the grid), and a linear gain (the
  velocity curve cannot reach every level). A late event's frame is rounded from its exact
  time, as the reference rounds it.
- A sound's `bus`; a duck with a shape (`attack`, `hold`, `length`: the reference's 3 ms
  attack, 20 ms hold, 110 ms release, 450 ms long); the kick's duck starts at its own frame
  even when that is past the chunk it fired in.
- Instruments cut at two rates (`<name>@44` beside `<name>`, `SampledInstrument.rated`):
  the renderer takes the set at its output's rate.
- Three voices a channel can name: `hsStab0…3` (one of the reference's raw stab buffers into
  the stab bus, one event a hit), `rackStab` (a stab note synthesized: three saws and the
  noise, for your keys and for the notes a level leaves to the band) and `rackLead`.
- A part note's `v` (the record's velocity for it, when the channel is not written note by
  note): what the band plays a note at when a level leaves it out.

**Four traps, each a constant in dB or a rate:**

- **A centre pan is −3 dB a side.** The reference's `pan(x, 0)` is x·cos(π/4) on each side; a
  mono file in the sampler plays at full level on both. The kick and the bass read +3.01 dB
  until their gains took √½.
- **An impulse resampled to a higher rate has more samples under the same curve.** The hall
  and the room read +0.74 dB at 48 kHz (20·log10(48/44.1)) until the 48 kHz impulses were
  scaled by 147/160.
- **The sampler's linear interpolation between rates costs the top of the spectrum**: 48 kHz
  files played at a 44.1 kHz output read −0.4 dB at 4–8 kHz, −1.4 at 8–15, −4.3 above. This
  iMac's speakers run at 44.1 kHz (`system_profiler SPAudioDataType`), the simulator too;
  iPhones run at 48. So the kit exists at both rates, the 44.1 kHz set being the reference's
  own samples untouched, and at 44.1 kHz the app's stems are the reference's to the sample.
- **`-Tempo 122` on a `band=` render.** Without it the band plays at the launch tempo and
  every bus is "wrong".

**The numbers** (`halb-ab.py`, the simulator; reference = `reference.flac` − 8 dB):

| | 44.1 kHz | 48 kHz |
|---|---|---|
| mean level, app / reference | −19.04 / −19.03 dBFS | −19.03 / −19.03 |
| peak | −9.01 / −9.01 | −9.01 / −8.89 |
| octave bands 30 Hz–21 kHz, bars 0–7, 24–31, 48–55, 64–71, 104–111, worst | 0.02 dB | 0.02 dB |
| side / mid | 0.265 / 0.265 | 0.265 / 0.265 |
| the master, app − reference, first 30 s | −66.5 dB | |
| the master, whole song | −34.5 dB (the noise bed loops after 32 s) | −28.5 dB |

Stems at 44.1 kHz, app − reference over the whole song (level difference; the null):
kick 0.00 dB, −75; bass 0.00, −52; chords 0.00, −68; dub_delay 0.00, −65; hall 0.00, −64;
lead 0.00, −67; lead_echo 0.01, −59; pad 0.00, −64; hats 0.00, −59; clap 0.00, −61; toms 0.00,
−64; shaker 0.01, −54; rim 0.00, −61; room 0.01, −53; riser 0.00, −58; noise 0.04, −45 over its
first 30 s (then it loops). The floors are the stems' 16 bits.

**What is not the reference, and why:**

- **The noise bed loops** after 32 s (hiss and crackle at −52 dBFS in the mix): the same
  noise, not the same samples. Four minutes of it would be 40 MB.
- **The limiter is its forward pass only**: the reference smooths the limiter's attack with a
  second pass backwards in time (4 ms), which needs lookahead a live instrument can't give
  your keys. It acts on 4 % of the samples by at most 0.7 dB; the peaks match.
- **At 48 kHz** an event sits on the nearest 48 kHz frame (half a frame, 10 µs, from the
  reference's 44.1 kHz frame), so the hats and the shaker match in level and spectrum, not
  sample for sample.
- **Louder is the app's own level**: the Stage plays its electronic tracks at −19 dBFS mean
  and the reference is at −11. For an A/B by ear, match the volume first.
- The tail is the reference's 7 s (four bars under the fade); the run ends after it.

**The song** (`scripts/songs/halbschatten.py`, from `halbschatten-events.json`): 2,244 drum
hits, 334 bass notes, 323 stab hits, 88 lead notes, each with its `late` and `g`. The parts:
**chords** = the stab's five-note voicings (Gm9, Cm9, Dm9; the 16th after the 1 weight 1, the
louder answer on steps 11 and 13 weight 2, the quiet hits 3): 0.24 · 0.48 · 0.93 · 0.93 · 1.26
· 1.26 · 1.32 onsets a second, Beginner the root every other bar, Easy two notes once a bar,
Easy+ two notes twice a bar, Medium the triad, Hard the record. **Melody** = the lead, which
plays 32 of the 120 bars (from bar 49): 19 · 36 · 52 · 80 · 80 · 80 · 88 notes, Easy the first
note of each bar, Easy+ two a bar, Medium the line, Hard with its pickup. When you take a
part, the band's own events for it stop and your keys (and the notes your level leaves out)
play the rack's synthesized voice into the same filter, echo and hall.

**Running it again:**

```bash
V=<venv with numpy, scipy, numba, soundfile>/bin/python      # ~/.cache/takt-venv on the iMac
$V apps/takt/scripts/halbschatten.py --keep /tmp/halb         # sounds, impulses, the event log; stems kept
python3 apps/takt/scripts/songs/halbschatten.py                # the song file
# build, install on the booted simulator, then:
HALB_SR=44100 $V scripts/takt/halb-ab.py render /tmp/halb      # 17 renders, about 12 minutes
HALB_SR=44100 $V scripts/takt/halb-ab.py stems /tmp/halb && HALB_SR=44100 $V scripts/takt/halb-ab.py master /tmp/halb
$V scripts/takt/halb-ab.py render /tmp/halb master && $V scripts/takt/halb-ab.py master /tmp/halb   # at 48 kHz
```

`-SampleRate 48000` (with `-RenderTo`) renders offline at the devices' rate; `-RackSolo a,b`
renders only those buses, before the master (`kick`, `bass`, `chords`, `dub_delay`, `hall`,
`lead`, `lead_echo`, `pad`, `hats`, `clap`, `toms`, `shaker`, `rim`, `room`, `noise`,
`riser`); `-RackRaw 1` all of them before the master. A debug build renders the song at 6.4
times real time on the M4.

**Not checked: Bart's ears.** The mp3, then the app, at the same volume.

The system as a whole (every instrument, both reverbs, the fidelity checklist, and the musical
principles the record was generated from) is the `takt-electronic` skill:
`.claude/skills/takt-electronic/` (2026-11-09).

## 9. Gezeiten: a second record on the same console (2026-11-10)

Bart: "make another electronic track, patterned after Halfschatten, but make sure it's a
different core track concept (can still be dub tech) - make sure to use the correct skills to
make the music and the charts". **Gezeiten** (tides): dub techno in E minor, 116, 112 bars and a
7 s tail (3:59). The record is `misc/gezeiten_reference.py`, made on §8's method with the
`takt-electronic` skill; the app's render of it is the reference by the same measurements, and
**`Rack.swift` did not change**: Halbschatten's render is what it was by construction.

**The record** (the skill's `references/music.md`, "The second record", has the comparison):

- **The bell is the motor.** The FM lead plays a four-bar tune on five white keys (A4 B4 D5 E5
  G5: `E B D E | G E D B | E B D E | A B D B`) from bar 1, a note on steps 0, 3, 8 and 11. Its
  echo is a dotted eighth, so the repeats land on 6 and 14: the written line and the echo are
  one double tresillo. Two notes a bar in the first eight bars, all four from the kick; at the
  crest (64–79) the tune starts from its top (`G E D E | E G D B | G E D E | A B D E`).
- **The chord is a skank.** A minor eleventh as a pentatonic cluster, fifth at the bottom (Em11
  = B3 D4 E4 G4 A4), on the "and" of 2 in every bar, the "and" of 4 as the answer, a ghost on
  step 9 in the full sections: the reggae off-beat. Longer than Halbschatten's tick (decay
  0.18–0.30 s; the filter opens 1.3 octaves and closes in 150 ms), into a **dotted-quarter**
  echo whose repeats swell back into the next hit.
- **The ground does not move.** Kick (landing on E1) and bass (steps 2, 7, 10, 13: E1, the
  octave popped on 7, two notes walking the pentatonic) stay on E from bar 16 to 99. Over them
  the chords **plane**: Em11 · Em11 · Dm11 · Dm11 from bar 32 (the same hand shape a white key
  down), Em · Dm · Am · Em a bar each at the crest, one chord again from 80. Everything is on the
  white keys.
- **Two tides.** The filter climbs to 1250 Hz at bar 38, ebbs (bars 40–47: no kick, bass or
  hats, the pad up, the echo's feedback at 0.66, one bell note and air in bar 47), climbs higher
  to 2600 at bar 70, and runs out the way it came. The clap is a **one drop** (beat 3 only,
  bars 32–38 and 48–79); a cross-stick on beat 2 goes into the echo; the shaker is 56–79.

| bars | |
|---|---|
| 0–7 Still water | the bell's two beats, the chord once a bar, pad, noise |
| 8–15 Kick | + kick, the bell's whole line; hat build 12–15, riser into 16 |
| 16–23 Bass | + bass, + open hat; the chord twice a bar |
| 24–31 Hats | + closed 16ths, rim, toms; bar 31's last chord is Dm11 (the hint); riser into 32 |
| 32–39 First tide | + clap; the chords plane; bar 39: kick, bass and clap out from beat 3, the throw |
| 40–47 Ebb | no drums; the bell softer, the chord long; hat build and riser 44–47; bar 47 ends on Am11 |
| 48–55 Flood | everything |
| 56–63 Shaker | + shaker, rim, toms |
| 64–71 Crest | a chord a bar (Em Dm Am Em), the bell from its top; the filter's peak at 70 |
| 72–79 High water | the same; bar 79: kick out on beat 4 |
| 80–87 One chord | Em11 again; no clap, no shaker |
| 88–95 Thinning | no closed hats, no rim; the hats fading |
| 96–103 Low | no hats or toms; the bell drops its last note; bass to 99 |
| 104–111 Out | no kick; the bell's two beats, then one; the chord to 109; the fade from 110 |

**What it shares with Halbschatten, and what is its own.** The reference makes the hats, the
shaker, the clap and both reverb impulses with Halbschatten's functions and seeds, so they are
the same samples: the app plays `hsChh…`, `hsOhh…`, `hsShk…`, `hsClap`, `hs-ir-hall`,
`hs-ir-room` for them, and `scripts/gezeiten.py` asserts each against the committed file. Its
own are 44 `gz-*` files, 10.5 MB (Halbschatten's are 94 and 28): the kick, the rim, four toms,
eight bass notes, six raw stab buffers (`hsStabGz0…1`: the renderer sends an instrument named
`hsStab…` into the stab bus), one riser played at four gains, and a **16 s noise tile the
reference itself repeats**, so the rack's loop is the reference's noise to the sample.

**The numbers** (`scripts/takt/gz-ab.py`, a simulator; reference = its master − 8 dB):

| | 44.1 kHz | 48 kHz |
|---|---|---|
| mean level, app / reference | −19.20 / −19.20 dBFS | −19.20 / −19.20 |
| peak | −9.01 / −9.01 | −9.01 / −8.89 |
| octave bands 30 Hz–21 kHz, bars 0–7, 24–31, 40–47, 64–71, 96–103, worst | 0.01 dB | 0.04 dB |
| side / mid | 0.258 / 0.258 | 0.258 / 0.258 |
| the master, app − reference, the whole song | −56 dB | −30 dB |

Stems at 44.1 kHz over the whole song (level difference; the null): kick 0.00 dB, −79; bass
0.00, −55; chords 0.00, −67; dub_delay 0.00, −62; hall 0.00, −65; lead 0.00, −67; lead_echo
0.00, −61; pad 0.00, −65; hats 0.00, −59; clap 0.00, −61; toms 0.00, −64; shaker 0.01, −54; rim
0.00, −61; room 0.01, −51; riser 0.00, −59; noise 0.04, −44 (the tile's 16 bits at that level).
The master nulls over all four minutes because the noise does not stop being the reference's
after the first loop. What is still not the reference: the limiter's forward pass, and at
48 kHz an event on the nearest 48 kHz frame (§8).

**The song** (`scripts/songs/gezeiten.py`, from `gezeiten-events.json`): 2,004 drum hits, 302
bass notes, 233 chord hits, 401 bell notes. Both parts are the record's own, by the
`takt-chart` skill (`LEVELING.md` §4, `CHARTING.md` rule 19):

- **Chords, "The skank"**: the cluster, one hand shape (low to high fifth, seventh, root,
  third, eleventh; the eleventh carries the role `ninth`, the first note a level drops).
  0.23 · 0.46 · 0.87 · 0.87 · 0.97 · 0.97 · 0.97 onsets a second: Beginner the root every other
  bar, Easy root and third once a bar (tier 2), Easy+ twice a bar (3), Medium the triad, Hard
  all five with the ghost.
- **Melody, "The bell"**: the line, in one hand position (A4 under the thumb, G5 under the
  pinky): 0/0 · 1 · 10 at every level. 0.23 · 0.47 · 0.69 · 0.91 · 0.91 · 1.31 · 1.67: Beginner
  every other 1, Easy the 1 of every bar (tier 2), Easy+ the 1 and the 3 (4), Medium with the
  "a" of 1 (6), Hard all four. The first draft's crest opened two bars running on G5 and the
  check "every level plays the line's keys, not one" failed it; the second bar opens on E5.

**Running it again:**

```bash
V=~/.cache/takt-venv/bin/python                               # numpy, scipy, numba, soundfile
$V misc/gezeiten_reference.py /tmp/gz/master.wav               # the record, on its own
$V apps/takt/scripts/gezeiten.py --keep /tmp/gz/work --verify /tmp/gz/master.wav   # sounds, the event log; stems kept
python3 apps/takt/scripts/songs/gezeiten.py                    # the song file
# build, install on a simulator, then (TAKT_SIM=<udid> for one that is not the booted one):
GZ_SR=44100 $V scripts/takt/gz-ab.py render /tmp/gz/work       # 17 renders, about 12 minutes
GZ_SR=44100 $V scripts/takt/gz-ab.py stems /tmp/gz/work && GZ_SR=44100 $V scripts/takt/gz-ab.py master /tmp/gz/work
$V scripts/takt/gz-ab.py render /tmp/gz/work master && $V scripts/takt/gz-ab.py master /tmp/gz/work   # at 48 kHz
```

**Not checked: Bart's ears.** The record was written while he was away, so nobody has heard
it: the mp3 pair is in `~/Desktop/takt/gezeiten/` on the MacBook Air (the reference, and the
app's render raised 8 dB to its level). Its mix was set against Halbschatten's own render, block
by block, since nothing else could judge it. Not rendered from the installed Mac app (§8's step
4): the simulator only.

## 10. Gegenlicht: techno on a second console (2026-11-10, 0.1 (126))

Bart, on the record Claude rendered in the Claude app: "this is FANTASTIC"; then "now implement
GEGENLICHT in the app … make sure we get the EXACT same track implemented in swift/xcode, and
then use our skills to also create charts for the track." **Gegenlicht** (backlight): techno in
A minor, 128, 128 bars and a 7 s tail (4:07). The record is `misc/gegenlicht_reference.py`, the
brief `misc/GEGENLICHT.md`; the handoff's lossless master (`misc/gegenlicht/reference.flac`)
and parts stay out of git (`misc/gegenlicht-handoff.zip`, 54 MB, on this iMac).

**Not on `Rack`.** The record has no bassline (the rumble: the kick bus and two echoes of it
through a 0.9 s impulse with no predelay, the low band, tanh), a 303 that runs from the first
sample, a ping bus with its own echo, a pad gated a bar at a time, two duck envelopes and log
lanes. So it got a console of its own, `Takt/Audio/AcidRack.swift`, behind a protocol both
consoles keep (`Console.swift`); `Rack.swift` did not change, and Halbschatten and Gezeiten play
what they played. The skill's `references/system.md` "The acid rack" has the signal flow; what
the song file gained: `acidRack`, a pan per hit (`p`), a gate in fractional ticks (`hold`),
`duck.second`. The renderer routes `rackAcid` and `rackPad` notes to it; the pad's notes from
your side (keys, and the notes a level leaves out) open its gates even with the keys channel
muted, the band's do only while it is not.

**The reference logs itself**, so `scripts/gegenlicht.py` patches nothing: it runs it (this
Mac's numpy/scipy/numba differ from the Claude app's on one sample of 21.8 million, by one
LSB), cuts the one-shots (`gl-*`, 21 MB at both rates, the hat bus's lowpass and the tom bus's
highpass baked in) and the three impulses, and writes `songs/gegenlicht-events.json` with the
lanes read out of the reference's own source. `songs/gegenlicht.py` makes the song and asserts
the 303's slides are exactly "a note that starts while the gate is open".

**Measured** (`scripts/takt/gl-ab.py`, at 44.1 kHz, every stem over the whole song):

| stem | level app / ref (dBFS) | null (dB) |
|---|---|---|
| kick | −17.5 / −17.5 | −77.8 |
| rumble | −24.1 / −24.1 | −72.3 |
| acid | −23.3 / −23.3 | −73.1 |
| acid echo | −30.5 / −30.5 | −65.7 |
| ping | −34.0 / −34.0 | −60.8 |
| pad | −31.3 / −31.3 | −63.4 |
| hats, ride, shaker, clap, rim, toms, crash | within 0.01 dB | −53 to −62 |
| hall, room | within 0.01 dB | −64.0, −54.4 |
| riser | −45.9 / −45.9 | −40.5 |
| noise | −52.3 / −52.4 | none: the 32 s loop matches in level, not in samples |

The master: mean −19.34 / −19.34 dBFS (the reference − 8 dB), peak −9.01 / −9.01, side/mid
0.239 / 0.239, octave bands within 0.07 dB in all six of the brief's passages, null −65.8 dB
over the first 32 s (before the noise loops) and −34.7 over the song. At 48 kHz: bands within
0.11 dB, mean −19.35, peak −9.01 against −8.79 for the resampled reference (Gezeiten's 0.12).

**The parts** (the `takt-chart` skill; LEVELING.md §4 and CHARTING.md rule 20): the melody is
the acid line in its own octave, home A2–E3 under the right hand, 0 moves to Medium, with a line
of the part's own in the bars the record has no acid; the chords are the pad a hit a bar,
shape 1 3 5.

**Running it again:**

```bash
V=~/.cache/takt-venv/bin/python
$V apps/takt/scripts/gegenlicht.py --keep <work>               # verifies against misc/gegenlicht/reference.flac
python3 apps/takt/scripts/songs/gegenlicht.py
# build, install on the booted simulator, then:
GL_SR=44100 $V scripts/takt/gl-ab.py render <work>             # 18 renders, about 70 minutes
GL_SR=44100 $V scripts/takt/gl-ab.py stems <work> && GL_SR=44100 $V scripts/takt/gl-ab.py master <work>
```

**Not checked: Bart's ears** on the app against the record (`~/Desktop/takt/gegenlicht/`, the
app's render raised 8 dB), and the parts played.

## Files

- `misc/gegenlicht_reference.py`, `misc/GEGENLICHT.md`, `misc/gegenlicht_reference.mp3`: Gegenlicht's reference; `scripts/gegenlicht.py`, `scripts/songs/gegenlicht.py`, `scripts/songs/gegenlicht-events.json`; `Takt/Sounds/gl-*`; `Takt/Audio/AcidRack.swift`, `Takt/Audio/Console.swift`; `scripts/takt/gl-ab.py` (repo root)
- `misc/gezeiten_reference.py`: Gezeiten's reference; `scripts/gezeiten.py` (sounds and the event log), `scripts/songs/gezeiten.py`, `scripts/songs/gezeiten-events.json`; `Takt/Sounds/gz-*`; `scripts/takt/gz-ab.py` (repo root)
- `misc/halbschatten_reference.py`, `misc/Halbschatten.mp3`, `misc/HALBSCHATTEN.md`: Halbschatten's reference and brief
- `scripts/halbschatten.py` (sounds and the event log), `scripts/songs/halbschatten.py`, `scripts/songs/halbschatten-events.json`
- `Takt/Audio/Rack.swift`, `Takt/Audio/Convolver.swift`; `Takt/Sounds/hs-*`; `scripts/takt/halb-ab.py` (repo root)
- `misc/dub_reference.py`, `misc/dub_reference.mp3`, `misc/DUB_TECHNO_FIXES.md`: the target and the brief
- `Takt/Audio/DubStab.swift`: the live stab
- `Takt/Audio/DubChamber.swift`: the delay, the plate, the hiss
- `Takt/Audio/BandRenderer.swift`: the stab voices, `mixDown`, per-channel duck, sends
- `Takt/Audio/BandData.swift`: `Duck`, `Dub`, `Stab`
- `Takt/Audio/AudioEngine.swift`: your keys' instrument, send and duck; the room bypassed for dub bands
- `scripts/synths.py`: `kickDub`, `hatDub`, `hatDub16`, `subDub`
- `scripts/songs/abyss.py`, `scripts/songs/common.py`; `Takt/Content/song-abyss.json` (generated)
- `Takt/App/LessonCheck.swift`: the chamber checks; `Takt/App/DebugHooks.swift`: `song=` for renders
