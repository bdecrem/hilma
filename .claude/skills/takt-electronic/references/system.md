# The dub techno production system: signal flow and settings

One system, as built for Halbschatten (G minor, 122 bpm). The studio is
`misc/halbschatten_reference.py` (`render()`); the app's copy is `Takt/Audio/Rack.swift`,
set from the song file's `rack` block (`scripts/songs/halbschatten.py` writes it). Every
number here is in both.

## Signal flow

```
 kick ───────────────────────────────────────────────────────────────┐  dry, mono, never ducked
 bass ── LP 520 ── × (1 − 0.78·sc) ──────────────────────────────────┤  dry, mono
 stab hits ─► ONE filter a side (2 SVF lowpasses) ─► tanh ─► level comp ─┬─ × (1 − 0.30·sc) ─┤
                                                                        │   └─► hall 0.55    │
                              mono sum × send lane, alternating sides ──▼                    │
 rim × 0.6, toms × 0.25 (left) ─────────────────────────────────► TAPE ECHO (¾ beat)         │
                                                    × 1.2 × (1 − 0.35·sc) ──┬────────────────┤
                                                                            └─► hall 0.5     │
 pad (20 saws) ─► SVF a side ─► level lane ─► HP 110 ─ × (1 − 0.55·sc) ──┬───────────────────┤
                                                                         └─► hall 0.9        │
 lead (FM) ─► LP 5.2 kHz ─► level lane ──┬───────────────────────────────┬───────────────────┤
                                         │                               └─► hall 0.7        │
                                         └─► TAPE ECHO 2 (1½ beats, enters right)            │
                                                    × 0.7 × (1 − 0.25·sc) ──┬────────────────┤
                                                                            └─► hall 0.5     │
 hats ── LP 12.5 kHz ─────────────────────────────┬─► room 0.35 ────────────────────────────┤
 shaker ──────────────────────────────────────────┬─► room 0.4 ─────────────────────────────┤
 clap ────────────────────────────────┬─► hall 0.35 ─► room 0.8 ────────────────────────────┤
 rim ─────────────────────────────────┬─► hall 0.3 ──► room 0.6 ────────────────────────────┤
 toms ─────────────────────────────────────────────► room 0.5 ──────────────────────────────┤
 risers ──────────────────────────────┬─► hall 0.8 ─────────────────────────────────────────┤
 noise bed ── × noise lane × (1 − 0.30·sc) ──────────────────────────────────────────────────┤
 HALL (7 s, convolution) ── × (1 − 0.40·sc) ─────────────────────────────────────────────────┤
 ROOM (1.4 s, convolution), not ducked ──────────────────────────────────────────────────────┤
                                                                                             ▼
                              Σ ─► HP 24 Hz ─► fade ─► tanh(1.43x)/1.1 ─► limiter 0.70 ─► out
```

`sc` is the sidechain envelope (below). Sends are taken after each bus's gain and duck.

## The sidechain

Every kick sets an envelope: 0 → 1 over **3 ms**, held to **20 ms**, then `e^(−t/110 ms)`,
cut at 450 ms. Depth by role, deepest for what shares the kick's register:

| bus | depth |
|---|---|
| bass | 0.78 |
| pad | 0.55 |
| hall return | 0.40 |
| echo return | 0.35 |
| stab, noise | 0.30 |
| lead echo | 0.25 |
| lead, drums, room | none |

In the song: `duck: {release 0.11, attack 0.003, hold 0.02, length 0.45, channels: {bass}}`
for the channel buses; the rack's own buses carry their depth in `rack`.

## The stab bus

- Each hit: a five-note minor ninth, three saws a note (instruments.md), × a linear **3 ms
  attack** × `e^(−t/decay)`, **7 decay times long**, × velocity. The decay is a lane (0.10 to
  0.24 s).
- **One filter for the whole bus, a side**: two TPT state-variable lowpasses in series,
  **Q 2.4 then Q 0.7** (a resonant corner and a second pole pair to steepen it: 24 dB/oct).
- **Cutoff, per sample** = lane × 2^(1.6 · env) × (1 + 0.10 · sin(2π · bar / 6.5)), clipped
  to 60–14000 Hz. `env` is the largest of velocity · `e^(−t/85 ms)` over the hits so far: every
  hit kicks the filter open up to 1.6 octaves and it falls back in a tenth of a second. The
  6.5-bar wobble never lines up with the 4- and 8-bar phrases.
- Then **tanh(1.3x)/1.3**, × **(700 / lane)^0.15** (the stab gets much louder as the filter
  opens; this takes back about half), × the bus gain (0.7036).

## The tape echo (`tape_delay`, `Rack.Tape`)

| | stab echo | lead echo |
|---|---|---|
| time | ¾ beat (a dotted eighth) | 1½ beats (a dotted quarter) |
| feedback | a lane, 0.62–0.74, thrown to 0.86–0.90 before section changes | 0.42 |
| in the loop, on the read | one-pole LP **4200 Hz**, then one-pole HP **130 Hz** | LP 3000, HP 350 |
| saturation | `tanh(1.5x)/1.5` on the feedback | the same |
| time wobble | ±0.12 % at 0.23 Hz and ±0.04 % at 3.1 Hz | ±0.1 % at 0.17 Hz |
| input | the stab's mono sum × send lane (0.9–1.0), **each hit on the other side**; rim and toms left | the lead's mono sum, right |
| return | × 1.2, ducked 0.35 | × 0.7 of the lead's gain, ducked 0.25 |

- Ping-pong: the left line feeds the right and the right the left, so every repeat changes
  sides. No crossfeed on the output.
- One-pole filters (6 dB/oct) in the loop, like tape: each pass is a little darker and a
  little thinner. Second-order filters there kill the trail in two repeats (Abyss, fix 1).
- The echo hears the stab **at mix level** so the saturation stays gentle, and the lead
  **before its gain** (the reference does; the port keeps it).
- The side switch for a hit finishes 20 samples (at 44.1 kHz) before the hit, over 200
  samples: the band's stab events fire a tick early so the rack can do that live.

## The reverbs (`make_ir`, `Convolver`)

Both are **synthetic impulses**: decaying noise, each frequency band with its own decay time,
an onset ramp, a highpass, a 200 ms fade at the end, unit energy a side, different noise left
and right (so they are wide).

| | hall | room |
|---|---|---|
| length | 7.0 s | 1.4 s |
| predelay | 28 ms | 8 ms |
| bands (range: T60, gain) | <300 Hz: 4.0 s, 0.6 · 300–1200: 4.6 s, 1.0 · 1.2–4 kHz: 3.2 s, 0.9 · >4 kHz: 1.7 s, 0.55 | <500: 0.9 s, 0.7 · 500–3000: 1.0 s, 1.0 · >3 kHz: 0.7 s, 0.8 |
| onset | 12 ms | 4 ms |
| highpass | 330 Hz | 350 Hz |
| fed by | stab 0.55, echo 0.5, pad 0.9, lead 0.7, lead echo 0.5, clap 0.35, rim 0.3, risers 0.8 | clap 0.8, rim 0.6, toms 0.5, shaker 0.4, hats 0.35 |
| return | × 0.4515 (levelled to −27 dB), ducked 0.40 | × 0.5668 (−36 dB), not ducked |

The hall is long, dark on top and highpassed: it blooms in the low mids, where the stab and
the pad live, and stays out of the kick's way. The room is only for percussion: it puts the
one-shots in one small place. In the app: `Takt/Sounds/hs-ir-{hall,room}-{44,48}.wav`, played
by partitioned convolution (`Convolver`: blocks of 1024 for the hall, 256 for the room, the
predelay paying for the block of latency).

## The master

Sum → **24 Hz** second-order highpass → the last fade (half a cosine from bar 118 to the end
of the 7 s tail) → **tanh(1.43x) / 1.1** (it is on the kick all the time: part of the sound)
→ a **limiter at 0.70** (4 ms attack, 120 ms release; it works on 4 % of the samples, by 0.7 dB
at most; the app runs its forward pass) → × 1.2714 (peak 0.89). Reference: **−10.2 LUFS**,
mean −11.0 dBFS, true peak −0.9. The app: the same chain, then `master.level` −8 dB (the
Stage's electronic tracks sit at −19 dBFS mean).

## The lanes (value by bar, linear between points)

| lane | shape over the 120 bars |
|---|---|
| stab cutoff, Hz | 250 → 360 (8) → 500 (16) → 720 (32) → 1050 (44) → **560 (48, the break)** → 1400 (56) → 1750 (64) → **2500 (76, the peak)** → 2100 (84) → 1200 (88) → 800 (96) → 520 (104) → 360 (112) → 230 (120) |
| stab decay, s | 0.11 → 0.14 (32) → **0.24 (48)** → 0.16 (56) → 0.20 (76) → 0.13 (96) → 0.10 (120) |
| echo feedback | 0.68 flat; **throws** to 0.86 (15.5), 0.88 (31.5), 0.90 (47.5), 0.86 (55.5), 0.88 (87.5), each back down within ¾ bar; 0.74 through the break; 0.62 through the full sections; 0.82 at 112 for the out |
| echo send | 1.0 → 0.9 (32) → 1.0 (48) → 0.9 (56) → 0.95 (88) → 1.0 (104) |
| hats | 0 (12) → 0.6 (16) → 0.8 (24) → 1.0 (40) → 0.9 (48) → 0 (52) → 0.9 (56) → 1.0 (64–88) → 0.7 (96) → 0 (104) |
| pad cutoff, Hz | 300 → 480 (16) → 900 (48) → 620 (56) → 1100 (76) → 600 (96) → 300 (120), × (1 + 0.28·sin(2π·bar/9 + 1)) |
| pad level | 0 → 0.8 (4) → 1.0 (8) → 0.75 (16) → 0.6 (32) → 0.7 (47) → **1.0 (48–55)** → 0.6 (56) → 0.75 (88) → 1.0 (112) → 0.7 (118) → 0 (122) |
| lead level | 0.55 (48) → 1.0 (56–72) → 0.8 (80–88) |
| noise | 0 → 1.0 (1) → 0.8 (16) → 0.6 (32) → **1.0 (48)** → 0.6 (56) → 0.8 (96) → 1.0 (112) → 0.9 (120) → 0 (122.5) |

The exact points are in `scripts/songs/halbschatten.py` (`s.rack["lanes"]`). The hats lane
is in each hat's own gain, the others are read per sample.

## Mixing: every bus levelled on its loud passages

The reference sets no fader by hand. Each stem is levelled to a target (`gain_for`: the 95th
percentile of 0.4 s RMS windows, so a bus is judged where it is loud, or a peak for one-shot
buses), and `gains.json` holds the resolved numbers the app uses:

| bus | target | resolved gain |
|---|---|---|
| kick | fixed | 0.64 |
| bass | −13 dB loud-RMS | 0.439 |
| stab (dry) | −22 dB | 0.704 |
| echo return | "its natural level against the dry stab" | 1.2 |
| pad | −27 dB | 0.0384 |
| lead | −24 dB | 0.1148 |
| lead echo | × 0.7 of the lead | |
| hats | peak −13.5 dB | 0.555 |
| clap | peak −11.5 dB | 0.418 |
| rim | peak −11 dB | 0.359 |
| toms | peak −15 dB | 0.187 |
| shaker | peak −17 dB | 0.126 |
| noise | −29 dB | 0.0355 |
| risers | −30 dB | 0.0739 |
| hall | −27 dB | 0.4515 |
| room | −36 dB | 0.5668 |

Pre-master stems in the full section (bars 64–71), dBFS RMS / peak: kick −15.6 / −7.0, bass
−19.6 / −10.8, stab −26.7 / −8.8, echo −30.1 / −8.6, hall −28.6 / −14.0, lead −26.1 / −13.9,
lead echo −34.6 / −18.0, pad −31.8 / −17.6, hats −35.2 / −13.5, clap −35.9 / −11.5, toms
−33.5 / −15.0, shaker −41.5 / −17.6, rim −44.9 / −11.0, room −39.2 / −20.2, noise −53.4.
The kick and the bass carry the level; everything tonal sits 7 to 15 dB under them.

## What a song sets without touching Swift (Gezeiten, 2026-11-10)

Gezeiten runs on `Rack.swift` exactly as Halbschatten left it. Everything that made it another
record is in its song file:

| setting | Halbschatten | Gezeiten |
|---|---|---|
| `echo.beats` (the chord's echo) | 0.75 | **1.5** |
| `echo.lowpass` / `highpass` in the loop | 4200 / 130 | 3400 / 150 (a longer echo: darker a pass) |
| `echoFeedback` lane | 0.62–0.74, throws to 0.90 | 0.50–0.66, throws to 0.86 (a repeat is twice as long, so it gets less) |
| `echo.level` | 1.2 | 1.0 |
| `leadEcho.beats` / `feedback` / `level` | 1.5 / 0.42 / 0.7 | **0.75** / 0.46 / 0.8 |
| `stab.env` / `envTime` | 1.6 oct / 85 ms | 1.3 oct / **150 ms** |
| `stabDecay` lane | 0.10–0.24 s | 0.18–0.30 s (the raw buffers are 2.1 s: seven decay times) |
| `stab.lfoBars` | 6.5 | 5.5 |
| `stabCutoff` lane | one arc, 2500 Hz at bar 76 | two: 1250 at bar 38, 520 in the ebb, 2600 at bar 70 |
| `lead.hall`, the lead's level | 0.7, −24 dB | 0.6, −24.5 dB (it plays all song) |
| `pad.notes` | G2 D3 G3 D4 F4 | E2 B2 E3 B3 D4 |
| stab instruments | `hsStab0…3`, zones Gm9 Cm9 Dm9 | `hsStabGz0…1`, zones Em11 Dm11 Am11 (a zone's root is the chord's lowest note) |
| the noise | `hsNoise`, 32 s | `gzNoise`, a 16 s tile |

Fixed in `Rack.swift` (a port if a record needs them otherwise): the lead's synthesis
(`fm_pluck`'s index 2.4·vel, its 0.11 s and 0.55 s times, the 1.2 s tail), the lead's echo
entering on the right, no duck on the lead, the stab's alternating sides, one stab bus. An
instrument is sent into the stab bus **when its name starts with `hsStab`**
(`BandRenderer.load`), which is why Gezeiten's are `hsStabGz…`; a kit ducks when its name
starts with `kick`.

## The song file's side of it

- `rack` (`Rack.Settings`): `lanes`, `buses` (name, `hall`, `room`, `echo` sends), `stab`,
  `echo`, `lead`, `leadEcho`, `pad`, `hall`, `room`, `noise`, `master`.
- `sounds.<name>`: `kit`, `gainDb`, and `bus` (a rack bus; absent: the drums channel, which
  carries only the kick here).
- A hit or a note: `t` (tick), `late` (ticks after it, a fraction), `g` (linear gain), `v` 1.
- `instruments`: `hsBass…` per note length on the bass channel, `hsStab0…3` on the keys (one
  event a hit, the reference's raw buffer), `rackLead` on the horns; the parts' monitors
  `rackStab` and `rackLead`.
- Limits in `Rack.swift`: 16 raw hits, 48 synthesized stab notes and 12 lead notes at once,
  24 drum voices, six kit buses in Halbschatten (any number), echo time up to 2.7 s.
