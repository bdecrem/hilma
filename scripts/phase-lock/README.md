# Phase Lock

Berlin techno, 5:53, synthesized from scratch in `synth.py` (general DSP comes from `../dodos-lament/engine.py`). Every choice below was reasoned from first principles, not taken from a preset.

**2026-09-25: the chord stabs are out.** Bart asked for them gone, with everything else kept the same. Both the A minor 7/9 stab and the breakdown's B♭ stab were cut. The `stab()` instrument stays in `synth.py`, and the first version is commit a1a7d1fa. The stabs drew no random numbers, so every other part renders sample for sample as before. The old and new masters are bit-identical up to bar 32, where the first stab used to enter.

- **Tempo and root.** At 132 BPM, A1 = 55 Hz is exactly 25 cycles per beat. A sustained sub on the root therefore meets every kick at the same point of its cycle. Kick and sub never drift into cancellation, and every beat's low end is identical. The kick's pitch drops to 55 Hz, and the sub starts at the phase of the kick's tail, so the two add up.
- **Tuning.** Just intonation against that root. The track never changes key, so equal temperament's compromise buys nothing, and pure intervals don't beat against the drone.
  - Toms: A2, E3, A3 (110, 165, 220 Hz).
  - Sequence: A4 E5 C5 G5 E5 (440, 660, 528, 792, 660 Hz).
  - Tuned wind: the partials of A minor (220, 330, 440, 528, 660 Hz).
  - Breakdown tension: the Phrygian ♭II partials (B♭ at 16/15, F at 8/5) rise in the wind over the A.
- **Low end.** The Berghain way: the kick feeds a dark room, which is low-passed, driven and side-chained into the rumble. The saturation drive rises through the track. The phase-locked sine sub sits under it, ducked on every kick.
- **Hypnosis without a melody.** Hat decay moves on a 3-bar cycle, the toms loop every 12 sixteenths and the sequence every 5. None of it lines up with the 4-bar phrase.
- **Reduction.** A dry, hard clap. Kick drops before phrase turns. A breakdown that takes the bass away completely, then brings the kick back through a high-pass that opens downward, so the drop returns all the low end at once.

| time | section |
|---|---|
| 0:00 | Intro A: kick, rumble swelling in, offbeat hats |
| 0:29 | Intro B: 16th hats, tuned wind, sub, toms |
| 0:58 | Build A: open hats |
| 1:27 | Build B: ride |
| 1:56 | Main A: clap |
| 2:25 | Main B: Main A continues, the rumble drive climbing |
| 2:54 | Breakdown: ♭II partials rise in the wind over the A; the kick climbs back thin; a riser |
| 3:23 | Peak A: the drop; the 5-step metallic sequence enters at 3:38 |
| 3:52 | Peak B: rumble at full drive |
| 4:21 | Peak C: the sequence leaves |
| 4:50 | Outro A: clap and ride out, then the toms and the wind |
| 5:19 | Outro B: kick, rumble, hats, the last hit |

## Run it

```bash
python3 -m venv /tmp/pl && /tmp/pl/bin/pip install numpy scipy soundfile matplotlib librosa
/tmp/pl/bin/python track.py                                 # out/phase-lock.wav, out/bus_lufs.json, out/stems (~1 min)
/tmp/pl/bin/python check.py out/phase-lock.wav --stems out/stems --png out/png
```

`bus_lufs.json` is each bus's loudness per section. The `RIDES` table in `track.py` was planned from it against a club balance: kick 0 dB, rumble −4.5, clap −7, hats −10, sub −8. The rides were planned with the stabs in, and are unchanged since they came out.

## Measured (2026-09-25, without the stabs)

| check | result |
|---|---|
| integrated / LRA | −10.7 LUFS / 2.1 LU |
| true peak | −1.1 dBTP (MP3 −1.2) |
| clipping | none |
| clicks | none |
| tempo | 132.35 BPM |
| kick tail | 55.0 Hz |
| sub | 55.0 Hz |
| phase lock | kick + sub below 90 Hz correlate 1.000 beat to beat |
| the same with the sub at 54.9 Hz | 0.77–0.88 |
| kick-to-sub phase spread, whole track | 0.02° |
| sequence notes (centroid through the sidebands) | C5 526.55, G5 790.24, E5 659.94, A4 440.01 Hz, all closer to JI than ET |
| punch (Peak B kick peak over the level between kicks) | 11.5 dB |
| drop | 40–100 Hz +12.3 dB on the downbeat |
| low end | mono |
| stab removal: bars 0–31 | bit-identical to the version with stabs |
| stab removal: 264 Hz (only the stab played C4) | down 19 dB in Main A |
| stab removal: what was taken out | 16–21 dB under the mix per section |
| stab removal: loudness | 0.4–0.8 dB quieter where stabs played; breakdown 1.7 dB quieter (the B♭ stab was its main voice) |

With the stabs in (a1a7d1fa): −10.1 LUFS, punch 10.8 dB, every stab partial measured closer to JI than ET (G3 197.86, C4 264.03 Hz).

What the checks caught along the way:
- In the first mix the rumble was louder than the kick, and hats, clap, ride, stab and sequence were 5–13 dB too quiet.
- There was a 4–6 kHz hole between the clap band and the hats.
- The breakdown build was louder than the drop: −6.2 against −9.0 LUFS.
- The filtered build kick still carried the bass, because a low-passed kick keeps its low end.
