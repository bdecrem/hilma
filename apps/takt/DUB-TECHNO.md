# How Abyss was made: dub techno in Swift (Takt 0.1 (43))

This is the recipe for **Abyss**, the dub techno track on Takt's Stage: 117 bpm, Dm9 drifting to Cm9,
72 bars, 2:28. It covers every voice, the arrangement, the real-time dub chain written in Swift, the
mix numbers, and how each step was checked. Following it should let you rebuild the track, or make
another one in the same style, from nothing.

The approach splits the work into two halves:

- **The notes are one-shots.** Each voice (kick, hat, stab, sub, lead) is synthesized once, offline,
  with numpy (`scripts/synths.py`). The results are short samples in `Takt/Sounds/syn-*.caf` that the
  app's sampler plays like any recording. A voice that changes over bars, such as the stab's
  filter, is rendered as several velocity layers, and the song picks the layer per note.
- **The space is real-time Swift.** The echo, the reverb, the sidechain and the mix run live in the
  app's render callback (`Takt/Audio/DubChamber.swift`, `Takt/Audio/BandRenderer.swift`). They have
  to: the echoes cross from note to note, they follow the tempo, and your own keys go through the
  same chamber when you play the part.

This split exists because of the first version's problem. That version baked the delay and reverb
into every stab sample, so each note carried its own muddy tail, filtered dull, with the low end in
the reverb. `misc/TRACKS_README.md` ("Fixing the dub techno sound") diagnosed four faults: a dull
stab, muddy feedback, low end in the reverb, and an over-squashed master. Everything below answers
one of those.

---

## 1. Signal flow

```
                         ┌───────────── dry, mono ──────────────┐
kick ───────────────────►│                                      │
sub (D2 / C2) ──────────►│                                      ├──► master × 0.72 ──► soft knee ──► out
hats, roomtone ─────────►│                                      │        (no room reverb
                         │                                      │         on this band)
stab ──► fader ──► duck ─┼───────── dry ────────────────────────┤
           │             │                                      │
lead ──► fader ──► duck ─┼───────── dry ────────────────────────┤
           │             └──────────────────────────────────────┘
           │  post-fader sends (keys 0.8, horns 0.5, your keys = the part's)
           ▼
     ┌──────────────────────────── DubChamber ────────────────────────────┐
     │  ping-pong delay, ¾ beat (dotted 8th), feedback 0.62               │
     │     feedback path: HP 350 Hz → LP 2.5 kHz → tanh(1.6·x)/1.6        │
     │     delay time wobbles ±0.3 % at 0.5 Hz (tape)                     │
     │  echoes ──► HP 250 Hz ──► 8-line FDN reverb (3.5 s, damped 4.5 kHz) │
     │  return = echoes × 0.75 + reverb × 0.35, dipped 30 % by each kick  │
     └────────────────────────────────────────────────────────────────────┘
```

Kick and sub are never sent and never ducked. They stay mono and dry under everything.

---

## 2. The voices (`scripts/synths.py`)

Every voice is rendered at 48 kHz by a small numpy function, normalized to −3 dBFS peak, written as
WAV, converted to ALAC `.caf` with `afconvert`, and registered in `Takt/Sounds/instruments.json`
with its zones: a root note, a velocity ceiling and the files. The Swift sampler
(`Audio/Instrument.swift`) picks the nearest root and then the softest layer whose ceiling covers
the note's velocity, repitches by `2^(Δ/12)`, and scales the gain from half to full inside the layer
so the layers join smoothly.

Run it with any Python that has numpy, scipy and soundfile:

```bash
<venv>/bin/python apps/takt/scripts/synths.py
```

### Kick: `kickDub`

A sine with a falling pitch, a little click, and gentle drive:

```python
kick(f0=110, f1=44, pd=0.045, decay=0.32, click=0.05, drive=1.2)
# f(t) = f1 + (f0 - f1) · e^(-t/pd); body = sin(2π∫f) · e^(-t/decay)
# + click · noise · e^(-t/2 ms); out = tanh(drive·x) / tanh(drive)
```

Two velocity layers, one round robin. It stays soft and round, with a short pitch drop, a low
click, and almost no distortion: a dub kick thumps instead of snapping.

### Hat: `hatDub` (crisp)

The README asked for real top end at 8–12 kHz so the track doesn't sound underwater:

```python
def crisp_hat(decay=0.022):
    x = noise · 0.8
    x += Σ 0.35 · square(f) for f in (5400, 7200, 8300, 9600, 10900, 12400)   # metallic partials
    x = bandpass(x, 7000, 14000, order=3)
    return x · attack(0.5 ms) · e^(-t/decay)
```

Two layers, three round robins (no two consecutive hats sound alike).

### Stab: `dubStab`, the hero, dry

```python
DUB_CUTS = [600, 1000, 1600, 2500, 3600]          # five "breaths", dark → bright

def dub_stab(n, layer):
    t = 0.6 s
    x = mean of 4 saws at f · (1.0, 1.004, 0.9965, 1.0085)      # detuned unison
    body = resonant_lowpass(x, DUB_CUTS[layer], q=2.2) · 0.9    # the ring at the cutoff
    snap = resonant_lowpass(x, min(cut · 2.2, 9 kHz), q=1.2) · e^(-t/15 ms)   # the hit
    y = (body + snap · 0.6) · attack 4 ms / release 50 ms · e^(-t/120 ms after 10 ms)
    return highpass(y, 120)                                      # leaves room for the sub
```

- `resonant_lowpass` is the RBJ cookbook biquad with a Q. Q 0.7 is flat; 2.2 gives the "resonance
  0.3–0.5" ring the README describes.
- The **snap** is the same unison through a filter about two octaves higher, gone in 15 ms. It
  stands in for a filter envelope: the stab opens bright for an instant, then settles into its
  breath.
- Roots every 3 semitones from 48 to 66 (C3–F♯4), five layers each: 35 files, released over 0.15 s.
- **No delay or reverb in the sample.** That was the whole problem.

### Sub: `subDub`

```python
sin(2π f t) · attack 20 ms / release 200 ms · e^(-t/0.5 s after 0.9 s)
```

The song plays it at **D2 / C2 (73 / 65 Hz)**, an octave above the sketch's D1 / C1. That keeps it
under 80 Hz as the README asks, and a laptop or a phone can actually play it.

### Lead: `dubLead`, dry

```python
x = 0.55 · square(f) + 0.45 · sine(f)                 # hollow
x = resonant_lowpass(x, 2200, q=1.4) · attack 30 ms · e^(-t/0.9 s after 0.8 s)
return highpass(x, 150)
```

### Bed: `roomtone`

Sixteen seconds of tape hiss (noise band-passed 2–7 kHz × 0.012) and a little rumble (noise
lowpassed at 80 Hz × 0.04). The drums channel retriggers it every eight bars, so the track never
sits in digital silence.

---

## 3. The song (`scripts/songs/abyss.py`)

The song is a Python script that writes `Takt/Content/song-abyss.json`: a band (drums, bass, keys
and horns events, sounds, instruments, levels, duck, dub) plus the two playable parts. Time runs at
12 ticks a beat, 48 a bar; a 16th is 3 ticks.

```bash
python3 apps/takt/scripts/songs/abyss.py
```

### Form

| bars | section | what changes |
|---|---|---|
| 0–7 | Intro | kick, offbeat hat, stab; no sub, no lead |
| 8–23 | Deep | sub in, 16th hats; lead from bar 8 (long notes only until bar 16) |
| 24–39 | Drift | everything |
| 40–47 | Abyss | no kick, no sub, no 16th hats; lead long notes and answers only. The chamber carries it |
| 48–67 | Deep again | everything |
| 68–71 | Out | stab to bar 70, one long lead note, sub out at 70 |

Chords: **Dm9** for four bars, **Cm9** for four, repeated. The voicing goes root, third, fifth,
seventh, ninth from the bottom: Dm9 = D3 F3 A3 C4 E4, Cm9 = C3 E♭3 G3 B♭3 D4.

### Drums (each bar, 16 steps)

```python
kick:  steps 0, 4, 8, 12 (four on the floor), velocity 1.0 ±0.02, except in the Abyss
hat:   steps 2, 6, 10, 14 (the offbeats), velocity 0.5 (0.2 in bar 0)
hat:   every odd step from bar 8, velocity 0.3, except Abyss and Out
roomtone: bar 0 of every eight
```

Sounds: kick −16 dB, hat −26 dB, roomtone −16 dB.

### Sub

Root on beats 1 and 3, 22 ticks long, velocity 0.8. Out in the Intro and the Abyss.

### Stab (the chords part)

```python
for every bar:
    stab at tick 6  (the 16th after the 1),  30 ticks long, weight 1
    stab at tick 21 (the 16th before the 3), 20 ticks long, weight 2
    odd bars: stab at tick 30, 14 ticks long, weight 3
```

The velocity is the **breath**, a slow filter LFO over 16 bars:

```python
breath(bar) = 0.25 + 0.75 · (0.5 − 0.5 · cos(2π · bar / 16))     # 0.25 → 1.0 → 0.25
```

Velocity picks the stab's layer, so the filter opens from 600 Hz to 3.6 kHz and closes again every
16 bars. The README asked for an LFO of 16 to 32 bars.

### Lead (the melody part)

A four-bar phrase on Dm9, and the same phrase a whole step down on Cm9: long notes on the ones,
answers on the offbeats where the delay has room to repeat them.

```python
LEAD_D = {   # bar: (tick, note, length, weight)
  0: [(0, A4, 18, 1), (24, C5, 12, 2), (36, A4, 12, 3)],
  1: [(12, G4, 12, 2), (24, F4, 24, 1)],
  2: [(0, E4, 18, 1), (24, F4, 12, 3), (36, A4, 12, 2)],
  3: [(0, C5, 36, 1), (42, D5, 6, 3)],
}
```

The weights (1 main, 2 groove, 3 ornament) are what the game's charting rules cut levels from
(`CHARTING.md`). The record plays every note.

### Mix and dub settings in the song

```python
s.levels = {"bass": -6, "keys": 1, "horns": -6}                 # dB per pitched channel
s.duck   = {"depth": 0.3, "release": 0.25, "channels": ["keys", "horns"]}   # only the stab and lead pump
s.dub    = {"sends": {"keys": 0.8, "horns": 0.5},
            "beats": 0.75, "feedback": 0.62,
            "highpass": 350, "lowpass": 2500, "drive": 1.6,
            "wobble": 0.003, "wobbleRate": 0.5,
            "echo": 0.75, "reverb": 0.35, "decay": 3.5, "reverbHighpass": 250,
            "duck": 0.3}
```

`common.py` writes `dub` into the band JSON next to `duck`. `BandData.Dub` decodes it into
`DubChamber.Settings`.

---

## 4. The dub chain in Swift (`Takt/Audio/DubChamber.swift`)

A `final class` that the render thread owns. Every buffer is allocated in `init`, and nothing on the
audio thread allocates, locks or calls into Objective-C. That rules out Swift arrays that get copied:
scratch space is `UnsafeMutablePointer<Float>`.

### Why not `AVAudioUnitDelay`?

It can't filter or saturate inside its feedback loop, and that loop is where the dub sound comes
from: each repeat passes through the filters again, so it comes back thinner and darker than the
one before. So the delay is written by hand.

### Building blocks

**Biquad** (RBJ cookbook, transposed direct form II):

```swift
private struct Biquad {
    var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
    var z1: Float = 0, z2: Float = 0
    static func lowpass(_ hz: Double, q: Double = 0.707, sampleRate: Double) -> Biquad
    static func highpass(_ hz: Double, q: Double = 0.707, sampleRate: Double) -> Biquad
    @inline(__always) mutating func run(_ x: Float) -> Float {
        let y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }
}
// w = 2π·f/sr, α = sin w / 2Q, c = cos w, a0 = 1 + α
// lowpass:  b0 = b2 = (1−c)/2/a0, b1 = (1−c)/a0;  highpass: b0 = b2 = (1+c)/2/a0, b1 = −(1+c)/a0
// a1 = −2c/a0, a2 = (1−α)/a0
```

**Delay lines:** two ring buffers (left and right), 2.5 s each, with one write index.

### The delay, per sample

```swift
let target = s.beats * samplesPerBeat              // ¾ beat at the current tempo
delay += (target - delay) * glide                  // 50 ms glide: a tempo change slides, no click
phase += 2π · wobbleRate / sr
let d = delay * (1 + s.wobble * sin(phase))        // ±0.3 % at 0.5 Hz: the tape smear

// Fractional read d samples back, linear interpolation.
let yL = read(lineL, write - d), yR = read(lineR, write - d)

// Ping-pong with the filters and the saturator INSIDE the loop:
let fromR = tanh(drive * lpL.run(hpL.run(yR))) / drive     // HP 350 → LP 2500 → tanh
let fromL = tanh(drive * lpR.run(hpR.run(yL))) / drive
let input = (sendL[i] + sendR[i]) * 0.5                    // mono into the left side
lineL[write] = input + s.feedback * fromR                  // left hears the right's repeat
lineR[write] = s.feedback * fromL                          // right hears the left's
write = (write + 1) % size
```

The first echo comes back on the left and full-range. Each later echo has crossed to the other side
through the highpass, the lowpass and the `tanh` once more, so it's quieter, thinner, darker and a
little rounder each time. That is how a hardware dub chain behaves, with a Space Echo or a filter
between the send and return.

### The reverb: an 8-line feedback delay network

```swift
static let fdnMs = [29.7, 37.1, 41.1, 43.7, 53.9, 61.7, 71.3, 79.3]  // co-prime-ish lengths
gain[k] = 10^(-3 · length[k] / (decay · sr))       // each line loses 60 dB in `decay` seconds
damp    = e^(-2π · 4500 / sr)                      // one-pole lowpass in every line: the tail darkens
```

Per sample:

1. The reverb input is the **echoes, highpassed at 250 Hz**, × 0.35: `reverbIn.run((yL + yR) / 2)`.
   No low end gets in.
2. Read the 8 line outputs.
3. Mix them with an **8×8 Hadamard matrix** (three in-place butterfly stages, × 1/√8), which keeps
   the energy and scatters it evenly between the lines.
4. Each line: × its gain, through the damping one-pole, plus the input (alternating sign per line,
   for width), written back.
5. Left output = lines 0, 2, 4, 6 summed × ½; right = lines 1, 3, 5, 7 × ½.

### The return

```swift
let g = 1 - s.duck * kick[i]                       // kick[i] = the band's duck envelope, 0…1
outL[i] += (yL * s.echo + revL * s.reverb) * g
outR[i] += (yR * s.echo + revR * s.reverb) * g
```

The echo return is at 0.75, the reverb at 0.35, "well under the delay". The whole return dips 30 %
(about 3 dB) on every kick, the README's 2–4 dB.

### Switching bands

`configure(_ settings: Settings?)` is called on the render thread when a band is swapped in
(`.band(events)`). It recomputes the filters and the FDN gains, and **clears the lines when the
chamber switches on**, so a lesson band's leftovers never echo into Abyss. `nil` turns the chamber
off (the blues bands).

---

## 5. Into the mixer (`Takt/Audio/BandRenderer.swift`)

The renderer is the app's one `AVAudioSourceNode` render block: transport, sampler voices, mixer.
Per audio chunk (≤ 4096 frames), `mixDown` does this:

1. **The duck envelope, once per chunk.** The kick times fired in this chunk (`chunkKicks`) build
   `kickEnv[i]`: 1 right after a kick, then × `duckDecay` per sample, where
   `duckDecay = e^(-1/(release·sr))` and the release is 0.25 s. The envelope carries over from the
   last kick of the previous chunk.
2. **Each channel** (drums, bass, keys, horns, monitor): the fader glides toward its target over
   about 5 ms (0 when muted), and the sample is × `(1 − depth·kickEnv[i])` for the ducked channels
   (keys and horns at 0.3; drums and bass at 0). It is added to the output and, **post-fader and
   post-duck**, × the channel's send into `sendL/sendR`.
3. **The chamber**: `chamber.process(sendL, sendR, kick: kickEnv, n, samplesPerBeat, outL, outR)`
   adds the return.
4. **The master**: × 0.72, then a soft knee above 0.8: `0.8 + 0.2 · tanh((|x| − 0.8)/0.2)`. Nothing
   squashes the mix as a whole; the README's fourth fault was a master saturator on everything.

Your own keys are the `monitor` channel. When you take a Stage part, `AudioEngine.load(song:part:)`
gives your keys the part's instrument, level, duck **and send**
(`dub.sends["monitor"] = dub.sends[part.channel]`). Play the stab part and your stabs go into the
same echo as the record's.

**The room reverb is off for this band.** The app normally runs everything through an
`AVAudioUnitReverb` (medium room, 12 % wet) for the dry piano samples. That would put kick and sub
in a reverb and make them stereo. `AudioEngine` sets `room.wetDryMix = e.hasDub ? 0 : 12` on every
band swap, so a band with its own chamber plays without the room.

### Wiring checklist (if you add a chamber to another song)

- `BandData.Dub` (Decodable) next to `Duck`, with `settings` → `DubChamber.Settings`.
- `BandRenderer.Events` carries `sends: [Float]` (per channel) and `dub: Settings?`;
  `BandRenderer.load` builds them; `.band(e)` calls `chamber.configure(e.dub)`.
- Preallocate `kickEnv`, `sendL` and `sendR` (`maxChunk` floats each) in `BandRenderer.init`.
- In the song script, set `s.dub = {...}`. Leave kick and bass out of `sends`.

---

## 6. Levels

Each channel was rendered alone through the real engine, offline in the simulator, and set against
the blues band's reference levels (drums −28, bass −29, keys −30, horns −28.5 dBFS RMS):

| solo | RMS (where it plays) | peak | side/mid | note |
|---|---|---|---|---|
| drums | −24.4 | −12.1 | **0.00** | mono, crisp: 9.6 % of the energy above 2.5 kHz |
| bass | −27.2 | −22.1 | **0.00** | mono, dry |
| keys (stab + chamber) | −27 (at +3; then trimmed to +1) | −0.7 → ≈ −2.7 | 0.33 | the width is the ping-pong |
| horns (lead + chamber) | −26.6 | −12.9 | 0.25 | |
| **full mix** | **−21 dBFS**, −20 to −23 per 10 s | −0.8 | | no clipping |

Side/mid 0.00 on drums and bass is the proof that kick and sub are mono: nothing stereo reaches them.

---

## 7. How it was checked

**Offline renders through the real engine** (the iOS simulator renders faster than real time,
through the same render code):

```bash
cd apps/takt
xcodebuild -project Takt.xcodeproj -scheme Takt -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcrun simctl install "iPhone 17 Pro" <DerivedData>/Build/Products/Debug-iphonesimulator/Takt.app
xcrun simctl launch --console "iPhone 17 Pro" com.bartdecrem.Takt -Backend http://localhost:1 \
  -RenderTo $PWD/build/audio/abyss.wav -RenderSeconds 150 -Tempo 117 \
  -RenderScript "0:band=song-abyss,0:play"
# a solo: add 0:mute=drums,0:mute=bass,0:mute=horns before 0:play
```

`band=` goes through `AudioEngine.load(band:)`, so the render gets the room-off behavior too. The
levels, peak, spectral share above 2.5 and 8 kHz, and side/mid came from a few lines of numpy over
the WAVs.

**A unit check for the chamber** (`-LessonCheck 1`, in `App/LessonCheck.swift`). It sends one bright
click into a `DubChamber` configured from `song-abyss.json` at 117 bpm, and reads 30 ms at each echo
time (k · ¾ beat):

- echo 1 on the left, echo 2 on the right, echo 3 on the left; the wrong side stays under 20 %;
- each echo has less energy than the last (6.05 → 0.113 → 0.0154);
- each echo is darker than the last, by the ratio of sample-to-sample difference energy to total
  energy, a brightness proxy: 0.640 → 0.303 → 0.066.

```bash
xcrun simctl launch --console-pty "iPhone 17 Pro" com.bartdecrem.Takt -Silent 1 -Backend http://localhost:1 \
  -LessonCheck 1 | grep -E "dub chamber|FAIL|LessonCheck"
```

**Not checked:** how it sounds to a person. Every number above is a meter reading. Listen on real
speakers and headphones before calling it done, and trust the ears over the meters.

---

## 8. Knobs worth turning

| what you hear | turn |
|---|---|
| echoes pile up, too dense | `feedback` 0.62 → 0.5, or `echo` down |
| echoes too thin, gone too fast | `highpass` 350 → 250, `feedback` up |
| echoes too dark | `lowpass` 2500 → 3500 |
| not enough smear | `wobble` 0.003 → 0.005, `wobbleRate` 0.5 → 0.8 |
| too dry, no space | `reverb` 0.35 → 0.5, `decay` 3.5 → 5 |
| tail muddy | `reverbHighpass` 250 → 400 |
| the stab too dull or too sharp | `DUB_CUTS` in synths.py, the stab's Q (2.2), the snap's level (0.6) |
| the filter moves too fast | the `16` in `breath()` → 32 |
| too much pumping | `duck.depth` 0.3 → 0.2, `dub.duck` 0.3 → 0.2 |
| low end weak on a laptop | `levels.bass` −6 → −3 |

Song-side changes (`abyss.py`) need `python3 scripts/songs/abyss.py` and a rebuild. Voice changes
(`synths.py`) need the venv run first, then a rebuild. Nothing else regenerates.

## Files

- `scripts/synths.py`: `kick`, `crisp_hat`, `resonant_lowpass`, `dub_stab`, `sub_dub`, `dub_lead`,
  `roomtone_bed`; `main()` registers `kickDub`, `hatDub`, `roomtone`, `dubStab` (5 layers),
  `subDub`, `dubLead`
- `scripts/songs/abyss.py` and `scripts/songs/common.py` (the `Song` writer, `dub` field)
- `Takt/Content/song-abyss.json` (generated)
- `Takt/Audio/DubChamber.swift`: the delay and reverb
- `Takt/Audio/BandRenderer.swift`: `mixDown`, the sends, the duck envelope, `.band` → `configure`
- `Takt/Audio/BandData.swift`: `Dub` → `DubChamber.Settings`
- `Takt/Audio/AudioEngine.swift`: your keys' send, the room off for dub bands
- `Takt/App/LessonCheck.swift`: the chamber check
- `misc/TRACKS_README.md`: the brief it answers
