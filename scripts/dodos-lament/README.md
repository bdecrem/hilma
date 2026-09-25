# Dodo's Lament

A passacaglia for cathedral organ, strings, celesta and a machine pulse. It's 3:28 long, in D minor, at 120 BPM, and every sound is synthesized from scratch in `engine.py`. There are no samples and no Jambot.

The dodo went extinct around 1662. That is Purcell's century, and his *Dido's Lament* sits on a ground bass that falls chromatically from the tonic to the dominant, the Baroque figure for grief.

This piece is a passacaglia on an original ground of that kind: D C# C B Bb A G A, one note per bar. The bass repeats every 8 bars while variations pile up on top of it. Minimal techno works the same way, so the pulse joins the lament partway through. The last chord turns to D major, a Picardy third.

| time | section | what happens |
|---|---|---|
| 0:00 | Ground | the ground alone on the pedal (16' 8' 4'), doubled softly on the manual |
| 0:16 | Chorale | organ chords: i, V6, i4/2, G7/B, Gm7/Bb, Asus4-A, iiø6/5, Asus4-A |
| 0:32 | Aria | the melody on a Cornet (the Baroque solo registration), with a cadential trill |
| 0:48 | Bells | the melody on celesta, 8th-note plucks; a heartbeat kick behind a wall |
| 1:04 | Build | 16th plucks in a 3+3+2 accent pattern; strings enter; the far kick's wall opens |
| 1:20 | Pulse | kick, sub, shaker, hats; the strings take the melody |
| 1:36 | Pulse II | + open hats, a dub rim through a dotted-8th echo, oboe doubling, descant bells |
| 1:52 | Plateau | the organ drops out; pulse, strings, plucks, descant |
| 2:08 | Breakdown | the ground moves to the top voice over a D pedal; the organ swell box opens stop by stop; a beat of silence |
| 2:24 | Tutti I | full organ (principals, mixture) with a trumpet melody, pedal reeds, everything |
| 2:40 | Tutti II | the strings sing the melody up an octave; the trumpet holds the descant as a cantus firmus |
| 2:56 | Tutti III | the climax variant, up to D6 |
| 3:12 | Coda | A7, a trill on E–F#, the D major chord, a celesta arpeggio into a 6 s cathedral tail |

## Run it

```bash
python3 -m venv /tmp/dl && /tmp/dl/bin/pip install numpy scipy soundfile matplotlib librosa
/tmp/dl/bin/python score.py                # out/dodos-lament.wav + out/stems (about 35 s)
/tmp/dl/bin/python score.py --bars 64-80   # an excerpt
/tmp/dl/bin/python check.py out/dodos-lament.wav --stems out/stems --png out/png
```

`--stems all` writes every bus in stereo. That takes about 600 MB, so the default `check` writes only the six mono stems the checker reads.

## How it was checked (no ears, so everything is measured)

`check.py` reports the following:
- integrated loudness, LRA and true peak (ffmpeg ebur128)
- loudness per bar (its own BS.1770 K-weighting)
- band balance per section
- L/R correlation overall and below 120 Hz
- click detection
- chroma of the dry organ, pedal and strings against the chord the score says is sounding
- pYIN pitch of the Cornet melody against the written notes
- beat tracking on the drums

Mixing was done by measuring each stem per section (the table in the session notes). Target loudness per section plus a balance per section, with the organ leading, became the `RIDES` table: fader moves per 8-bar section.

Final numbers, 2026-09-25:

| check | result |
|---|---|
| integrated / LRA | −11.7 LUFS / 6.5 LU |
| true peak | −1.2 dBTP (WAV), −1.3 (MP3) |
| clipping | none |
| clicks | none |
| loudness arc | −16.9 → −15.5 → −14.5 → −13.3 → −12.4 → −11.4 → −10.7 → −11.5 → −12.2 → −10.0 → −9.8 → −9.6 LUFS by section |
| low-end correlation | 0.98–1.0 below 120 Hz |
| Cornet melody | 21/21 notes within 30 cents, median 5 cents |
| tempo | 119.7 BPM |
| final chord | D major, F# outweighing F natural 5 to 1 |

The lower chord-match bars are the pedal's own third harmonic: B under G7/B shows F#.

Lessons:
- The first mix had the strings 10 dB over the organ.
- The rooms came back about 5 dB hotter than their send levels suggest, because the IR carries more energy in the low mids.
- A decorrelated reverb bass goes out of phase in the tail. The IRs now share one band below 160 Hz.
- The sample-peak limiter let inter-sample peaks reach −0.3 dBTP. It now limits on a 4× oversampled peak.
