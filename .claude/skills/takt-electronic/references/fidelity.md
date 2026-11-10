# Fidelity: what keeps the app's sound the reference's

The full account, with the commands and every measurement, is `apps/takt/DUB-TECHNO.md` §8.
This is the checklist.

## The rule

A track is done when the app's render **is** the reference, measured: not when it sounds
close. Abyss was tuned by ear against a description twice and was "still not good at all";
it was right the day the reference's own code was ported and its levels read off stems.
Halbschatten was built the measured way from the start and matched in one pass.

## Settings that must hold

| setting | value | why |
|---|---|---|
| The song is generated from the reference's **event log**, never written by hand | `scripts/<name>.py` patches a log line into every event and asserts the logged render equals the reference bit for bit | the script's random humanizing is part of the record |
| The record's one-shots are the **reference's own samples** | `parts/`, cut to `Takt/Sounds/hs-*` | re-synthesis is "like", not "is" |
| The kit exists at **44.1 and 48 kHz** | `name` and `name@44`; the renderer takes the set at its output's rate (`SampledInstrument.rated`) | the sampler interpolates linearly between rates: −0.4 dB at 4–8 kHz, −1.4 at 8–15, −4.3 above. This iMac's speakers and the simulator run at 44.1 kHz, iPhones at 48 |
| Impulses at both rates, the 48 kHz one **× 147/160** | `hs-ir-*-44.wav`, `-48.wav` | a resampled impulse has more samples under the same curve: +0.74 dB otherwise |
| A mono file under a centre pan gets **× √½** | the kick's and the bass's gains | the reference pans its centre at cos(π/4) a side; a mono file plays full on both: +3.01 dB otherwise |
| Levels are the reference's **resolved gains** over each file's scale | `gains.json`, the log's `scale` | no fader is set by ear |
| A plain gain goes in **`g` with `v` 1** | hits and notes | the kit's velocity curve is (0.3 + 0.7v)(0.5 + 0.5v), a pitched note's 0.35 + 0.65v |
| Timing finer than a tick goes in **`late`** | swing, jitter, and on-grid events too | a late event's frame is rounded from its exact time, as the reference rounds; an on-grid event rounds up and can sit a sample off |
| The rack runs at the **reference's signal levels**; loudness is one number after the master | `master.level` (−8 dB) | every tanh and every feedback loop must see the signal it saw |
| The filters in the echo's loop are **one-pole** | 4200 / 130 Hz | second-order filters there end the trail in two repeats |
| The limiter is the reference's **forward pass** | threshold 0.70, release 120 ms | its backward pass needs lookahead your keys cannot have; peaks still match |
| The noise bed **loops** its first 32 s | `hsNoise` | four minutes of unique noise is 40 MB for the same sound |
| The app's room reverb is **bypassed** for a band with a rack | `Events.hasDub` | kick and bass stay dry and mono |

## The A/B (`scripts/takt/halb-ab.py`)

1. `-RackSolo <stem>` renders one bus before the master. For each: level over the song and
   over the full section, peak, lag, and the residual of app − reference.
2. The master against the reference − 8 dB: mean, peak, octave bands 30 Hz–21 kHz in five
   passages (intro, first full drums, the break, the fullest section, the way out), side/mid.
3. At **44.1 kHz** (`HALB_SR=44100`, the reference's rate: nothing is resampled on either
   side) and at **48 kHz** (`-SampleRate 48000`, the devices' rate).
4. Once more from the **installed app** (the Mac build renders into its sandbox container).

Reading it:

- A bus off by a **constant** in dB: a gain law (pan, impulse scale, velocity curve, a fader).
- A bus at the **right level with a poor null**: timing (a sample of offset ruins a null on
  hats and noise; check `late` and the rounding).
- The master right in the **quiet sections and wrong in the loud**: a duck depth or the
  master's drive.
- Everything wrong at once: the tempo (`-Tempo` on a `band=` render).

## Tolerances, and what Halbschatten reached

The octave-band bar is the brief's (`misc/HALBSCHATTEN.md`); the others are set here, from
what a first pass can reach when the method is followed.

| | the bar | reached |
|---|---|---|
| octave bands, each passage | ± 0.8 dB | 0.02 dB |
| mean level | ± 0.3 dB | 0.01 dB |
| peak | ± 0.5 dB | 0.00 at 44.1 kHz, 0.12 at 48 |
| side / mid | ± 0.02 | 0.000 |
| each stem's level | ± 0.2 dB | ≤ 0.01 dB (noise 0.04) |
| each stem's null at 44.1 kHz | under −40 dB for tonal buses | −52 to −75 dB |
| the master's null where the noise has not looped | under −40 dB | −66.5 dB |

Kick and bass side/mid near 0 (mono). No clipping. The app's debug build renders the song at
6.4 times real time on the M4.

## What the second record added (Gezeiten, 2026-11-10)

It matched on the first render (every stem within 0.01 dB, the master's bands within 0.01 dB at
44.1 kHz and 0.04 at 48). What made that cheap, and what to keep:

| | |
|---|---|
| **The lanes and the mix's numbers are named once, in the reference** (`LANES`, `STAB_ENV`, `ECHO_STEPS`, `LEAD_ECHO_FB`, `PAD_NOTES`, …) and the cut script writes them into the event log (`lanes`, `mix`, `chords`) | the song file reads them; nothing is typed twice, so a lane cannot drift from the render |
| **`--verify <master.wav>`**: the logged render against a master the unpatched reference wrote | Halbschatten's check needed a `reference.flac` that only one Mac has |
| **Shared samples are asserted, not assumed**: each part × Halbschatten's scale against its committed `.caf`, each impulse against its `.wav` | reuse is only right while the functions and seeds are the same; the assert fails the day one of them moves |
| **The noise bed is a tile the reference repeats** | the app's loop is then the reference's noise: the master nulls over the whole song (−56 dB; Halbschatten's is −34.5 once its bed loops) |
| **A lead note's length is a whole number of ticks** (`BELL_LEN` 8/3 and 7/3 steps = 8 and 7 ticks) | a note's `len` is an integer in the song file and the release starts there |
| **Seeded generators for one-shots** (the kick's and the rim's click, the riser, the noise) | changing one sound does not move the random stream every later event is drawn from |
| **`TAKT_SIM=<udid>`** on the A/B's renders | a second session can use the booted simulator |
| A render writes into the work folder, not `/tmp` | two A/Bs can run on one Mac |

Reached: mean −19.20 / −19.20 dBFS, peak −9.01 / −9.01 (−8.89 the reference resampled to 48),
side/mid 0.258 / 0.258; stems kick −79 dB, bass −55, chords −67, dub_delay −62, hall −65, lead
−67, lead_echo −61, pad −65, hats −59, clap −61, toms −64, shaker −54, rim −61, room −51, riser
−59, noise −44 (its 16-bit floor at that level) over the whole song. The commands are
`DUB-TECHNO.md` §9.

One trap it found: `halbschatten.py` cleared every instrument named `hs…` before writing its
own, which would have dropped `hsStabGz…`; it now leaves those.

## Your keys are the one thing that is not the record

When the player takes a part, the band's events for it stop, and the keys play the rack's
synthesized voice (`rackStab`: per-note saws; `rackLead`: the same FM voice) into the same
filter, echo and hall. A full chord from the keys is within 0.2 dB of the record's hit; its
saws have their own random phases, as every hit of the record does.

## Then his ears

The mp3 pair goes to `~/Desktop/takt/<name>/`: the reference, and the app's render raised to
the reference's level. The measurements say the two are the same; the acceptance is Bart
playing both.
