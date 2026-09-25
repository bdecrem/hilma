# Phase Lock

Berlin techno, 5:53, synthesized from scratch in `synth.py` (general DSP comes from `../dodos-lament/engine.py`). Every choice below was reasoned from first principles, not taken from a preset.

- **Tempo and root.** At 132 BPM, A1 = 55 Hz is exactly 25 cycles per beat. A sustained sub on the root therefore meets every kick at the same point of its cycle. Kick and sub never drift into cancellation, and every beat's low end is identical. The kick's pitch drops to 55 Hz, and the sub starts at the phase of the kick's tail, so the two add up.
- **Tuning.** Just intonation against that root. The track never changes key, so equal temperament's compromise buys nothing, and pure intervals don't beat against the drone.
  - Stab: A minor 7, as 1 : 3/2 : 9/5 : 6/5 : 3/2 (110, 165, 198, 264, 330 Hz). The peak adds the 9th, 9/4 (247.5 Hz).
  - Breakdown tension: the Phrygian ♭II, B♭ major at 16/15 over the A drone.
  - Toms: A2, E3, A3. Sequence: A4 E5 C5 G5 E5. Wind: the partials of A minor.
- **Low end.** The Berghain way: the kick feeds a dark room, which is low-passed, driven and side-chained into the rumble. The saturation drive rises through the track. The phase-locked sine sub sits under it, ducked on every kick.
- **Hypnosis without a melody.** Hat decay moves on a 3-bar cycle, the toms loop every 12 sixteenths, the sequence every 5, and the stab filter drifts over 7 bars. None of it lines up with the 4-bar phrase.
- **Reduction.** A dry, hard clap. Kick drops before phrase turns. A breakdown that takes the bass away completely, then brings the kick back through a high-pass that opens downward, so the drop returns all the low end at once.

| time | section |
|---|---|
| 0:00 | Intro A: kick, rumble swelling in, offbeat hats |
| 0:29 | Intro B: 16th hats, tuned wind, sub, toms |
| 0:58 | Build A: the stab every two bars, filter nearly shut; open hats |
| 1:27 | Build B: the stab every bar, opening; ride |
| 1:56 | Main A: clap, two stab hits, 7-bar filter drift |
| 2:25 | Main B: a third stab hit on odd bars |
| 2:54 | Breakdown: ♭II over the A wind, long echoes; the kick climbs back thin; a riser |
| 3:23 | Peak A: the drop; A minor 9 on three hits, the 5-step metallic sequence |
| 3:52 | Peak B: rumble at full drive |
| 4:21 | Peak C: the sequence leaves |
| 4:50 | Outro A: the stab closes; clap and ride out |
| 5:19 | Outro B: kick, rumble, hats, the last hit |

## Run it

```bash
python3 -m venv /tmp/pl && /tmp/pl/bin/pip install numpy scipy soundfile matplotlib librosa
/tmp/pl/bin/python track.py                                 # out/phase-lock.wav, out/bus_lufs.json, out/stems (~1 min)
/tmp/pl/bin/python check.py out/phase-lock.wav --stems out/stems --png out/png
```

`bus_lufs.json` is each bus's loudness per section. The `RIDES` table in `track.py` was planned from it against a club balance: kick 0 dB, rumble −4.5, clap −7, stab −6, hats −10, sub −8.

## Measured (2026-09-25)

| check | result |
|---|---|
| integrated / LRA | −10.1 LUFS / 2.8 LU |
| true peak | −1.1 dBTP (MP3 −1.1) |
| clipping | none |
| clicks | none |
| tempo | 132.35 BPM |
| kick tail | 55.0 Hz |
| sub | 55.0 Hz |
| phase lock | kick + sub below 90 Hz correlate 1.000 beat to beat |
| the same with the sub at 54.9 Hz | 0.77–0.88 |
| kick-to-sub phase spread, whole track | 0.02° |
| stab partials (centroid through the bar-rate sidebands) | 197.86, 264.03, 164.97, 109.87, 329.84 Hz, all closer to JI than ET |
| punch (Peak B kick peak over the level between kicks) | 10.8 dB |
| drop | 40–100 Hz jumps +12 dB on the downbeat (−25.6 → −13.6 dB) |
| low end | mono: side below 120 Hz ≤ −44 dBFS everywhere |
| long-term spectrum (Main A) | 40–100 Hz about +11 dB over 1 kHz; about −1.5 dB/oct from 250 Hz to 8 kHz |

What the checks caught along the way:
- In the first mix the rumble was louder than the kick, and hats, clap, ride, stab and sequence were 5–13 dB too quiet.
- There was a 4–6 kHz hole between the clap band and the hats.
- The breakdown build was louder than the drop: −6.2 against −9.0 LUFS.
- The filtered build kick still carried the bass, because a low-passed kick keeps its low end.
