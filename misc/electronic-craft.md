# Craft: what `taste.md` left out, and a review of Hohlraum

For Claude Code, the session that made Hohlraum. From Claude, who wrote `taste.md` and Halbschatten, Gegenlicht, Restlicht, Streulicht, Hafenlicht, Kaltlicht, Irrlicht and Nordlicht. 2026-11-10.

Read this after `taste.md`. Where the two disagree, this file wins. Section 6 lists the edits to make in `taste.md` so they stop disagreeing.

## 1. What this rests on

- I cannot hear, the same as you. Bart's verdict on Hohlraum is one sentence: the production is much less good than the records made in the chat. He has not said what he hears.
- Everything below is measured from the stems of `hohlraum_reference.py`, rendered here. The render matches your MP3: −10.4 LUFS, LRA 3.0, peak −0.9 dBFS, both files.
- The comparison set is 5 records. Bart's words: Halbschatten and Gegenlicht "FANTASTIC"; Streulicht and Irrlicht "terrific", Irrlicht also "Fantastic!". Nordlicht is the third in that series; he picked it for a video and said nothing about the music.
- The thresholds in section 5 are a fence around those 5. They are not laws.

## 2. The findings

1. **Hohlraum is half empty.** Everything pitched in it, added up, sits 9.3 dB under the kick. In the 5 it sits 2.4 to 4.1 dB under.
2. **Its carrier does the opposite of every carrier Bart liked.** In the 5, the carrier's level holds and its timbre travels. In Hohlraum the level travels and the timbre holds.
3. **Most of the cause is `taste.md`.** Its rules and blind checks limit what a record may have. None of them says how much has to be there, so a record with almost nothing in it passes. That file was written to stop Gezeiten, which had too much. It had nothing to stop this.
4. **The rest is method.** The 5 were made a different way from the way your note describes. Section 4.

## 3. Hohlraum, measured

`floors.py` (section 9) on the pre-master stems. The pitched group is every stem except drums, noise, risers, the drum room and the rumble.

| | Halbschatten | Gegenlicht | Streulicht | Irrlicht | Nordlicht | **Hohlraum** |
|---|---|---|---|---|---|---|
| carrier stem | stab | acid | line | bass | stack | knock |
| pitched group under the kick, body of the track (dB) | 2.7 | 3.7 | 3.1 | 4.1 | 2.4 | **9.3** |
| pitched 500–2k under the kick, best 8 bars with a kick (dB) | 10.5 | 7.0 | 7.9 | 8.4 | 8.4 | **13.5** |
| carrier present: 20 ms frames within 20 dB of its loud level (%) | 53 | 66 | 97 | 98 | 91 | **32** |
| carrier level, max − min by 8-bar block, 25–85 % of the track (dB) | 2.9 | 2.8 | 2.8 | 1.9 | 2.6 | **7.4** |
| carrier timbre travel: 800–3200 Hz share of the stem, max − min (dB) | 10.6 | 20.1 | 14.4 | 26.4 | 24.0 | **7.3** |
| carrier's first 8 bars under its middle (dB) | 1.5 | 0.4 | 3.6 | 1.1 | 2.1 | **5.9** |

What sits behind those rows:

- **The knock is a 200 Hz thud from start to finish.** In every 8-bar block, 74 to 81 % of the stem's energy is in 160–250 Hz (the band's share is −0.9 to −1.3 dB). Your note's section 7 says most of the fundamental was removed. It was not. The 250 Hz highpass takes 5 to 6 dB off a tone that had little else in it.
- **Its 8 lanes move the sound by a third of what one filter does in Gegenlicht.** The knock's 800–1600 Hz share moves 6 dB across the form. The acid's moves 14 dB, and its 1.6–3.2 kHz share moves 25 dB. A lowpass lane from 340 to 3200 Hz has little to reveal here. At shape 2 the source's third harmonic is 15.5 dB under its fundamental; at shape 6 it is 10.3 dB under, and even a true square keeps 81 % of its power in the fundamental. A saw keeps 61 % and has every harmonic, and a resonant filter adds a peak of its own on top. That is where the acid's 25 dB comes from.
- **Its level is the story instead.** By 8-bar block from bar 16: −34, −32, −30, −29, −28, −27, then −25, −26, −25, −26, then −32, −31, −33, −35. The acid by block: −22.4, −21.6, −21.3, −23.1, −23.9, −22.5, −21.6, −21.8. The acid arrives at full level with its filter shut. The knock arrives 6 dB under its own middle and also dark, so what is left of bars 16–47 is mostly a kick, a rumble, hats and a two-note pad.
- **Your stem table compared the wrong window.** Section 8 sets the knock against the acid over each record's loudest 8 bars, where they match (−23.4 and −23.9). Over bars 16–112: knock −26.7 against acid −22.5; echo −33.4 against −29.5; tick −44.1 against the ping's −33.7; and Gegenlicht's toms (−33.9) have no counterpart. The kick is 1.4 dB hotter. Level a carrier over the body, never over the peak.
- **The room is louder than the thing in it.** Hall, pad and echo summed as power: −26.0 dB. The knock: −26.7. In Gegenlicht the acid (−22.5) is 1.7 dB over its hall, pad and echo (−24.2).
- **The fullest passage is the break.** The pitched 500–2k band peaks at −27 dBFS in bars 64–71, with no kick. With the kick back it reaches −29.5. The other 5 reach −23 to −26.5 with the kick playing.
- **The pregain was the symptom.** At 1.3 the record was 1 LU under its siblings because its pitched layer has about a quarter of the power theirs have. Pushing the master made up the number.

## 4. How the 5 were made

Seven things I did that `taste.md` never says.

### 4.1 Start from a real rig

The Streulicht, Irrlicht and Nordlicht series began with a search: which instruments one producer uses, what each one plays, how a track is put together. A modular playing sixteenth-note bass, a second bass through a frequency shifter, a lead played by hand, noise for hats, long takes with a hand on the filter. Each fact became a voice or a lane. Nothing had to be invented.

You began from a menu in `taste.md` and chose by elimination: your table is five reasons not to do something. What was left was the one item nobody had made, with no instrument behind it.

Before writing anything, name a real record or a real rig as the model, and write down what each instrument in it is and what it plays. Look it up if you can; if it comes from memory, say so. You did name one, Plastikman's *Consumed*, and then refused a bass. *Consumed* is built on sparse basslines and percussion inside reverb and delay. The model you picked contradicts the brief you wrote.

If Bart's ask names no artist, scene or record, pick one yourself and put it in the brief's first line.

### 4.2 Voices come off the shelf

Every carrier Bart liked is the same machine: a harmonically rich source (saws, a pulse, a chord of saws), one resonant filter with an envelope, a drive. The filter is the performer. These exist and are passed by his ears:

- the acid voice in `misc/gegenlicht_reference.py`
- the stab and its bus filter in `misc/halbschatten_reference.py`
- `osc_moog`, `ladder` and `seq_ctrl` in `misc/streulicht_reference.py` and `misc/irrlicht_reference.py` (the Streulicht and Irrlicht handoff bundles)

Use one of them. A new voice built from nothing, by someone who cannot hear, took you 9 rounds and still measures as a thud. If a voice does not sit after 3 renders, the voice is wrong: swap it, do not tune it.

Describe a voice from its solo stem (band shares, block by block), never from its code.

### 4.3 Level holds, timbre travels

The carrier enters within 4 dB of its final level, closed. Over the form, its level stays within 3 dB and its filter does the rest. Decay and density are level in disguise: a ring lane from 45 ms to 240 ms is a volume fader.

### 4.4 Every job stays filled

Each of the 5 has the same five jobs filled. A record may fill a job differently. It may not leave one empty.

| job | Halbschatten | Gegenlicht | Streulicht | Irrlicht | Nordlicht | Hohlraum |
|---|---|---|---|---|---|---|
| floor | kick | kick and rumble | kick | kick | kick | kick and rumble |
| a low voice that moves | sub, 4 notes a bar in the gaps | the riff itself, down to E2 | sixteenths on E2 | sixteenths on B1 (also the carrier) | off-beat C♯2 | **none** (the rumble repeats the kick; nothing pitched under 185 Hz) |
| a carrier sounding half the time or more | stab and its echo | acid riff | 8-stage line | the bass | 3-oscillator stack | **knock, 32 %** |
| a bed | drone pad | pad, one note moves | pad, two chords | pad, two chords | resonator | pad |
| a second pitched thing | electric-piano visitor | ping on the fifth, toms in 3 | hand-played lead | shifted shadow voice, lead | slow lead | **tick at −44 dB** |

Gegenlicht has no bassline because its carrier is a bass-register riff. You kept "no bassline" and moved the carrier up to G♯3 behind a 250 Hz highpass. You dropped the ping and the toms and put a tick 10 dB lower in their place. Each swap was allowed by `taste.md`; together they emptied the record.

When a sibling record has something this one drops, write down what does its job now.

### 4.5 A new record is a proven chassis and one new device

Irrlicht is Streulicht's kit and mix with one new device (a frequency shifter on a second voice). Nordlicht is the same kit with one new device (a stack whose tuning changes). Bart called the first two terrific and asked for a third. Being close to a record he liked is not a risk. Your "why not" table treated closeness as the main risk and it cost the record its carrier.

"Same artist, different album" can be read as: copy `gegenlicht_reference.py`, keep its instruments and its mix, change key, tempo, cell, clocks, form and image, and add one device.

### 4.6 Mix from the kick, over the body, on the first render

After render 1, measure every stem over the body of the track against the kick and put it where its job says (section 5). Fix levels on buses. Two or three renders. The master is copied and left alone.

### 4.7 Sparse in ideas, full in sound

The 5 have few ideas each: one cell, one chord or two, one visitor. None of them is quiet, thin or empty. `taste.md`'s tie-breaker ("fewer notes, darker, later, quieter, longer") was meant for ideas. You applied it to sound, which is a fair reading of what I wrote.

Three of the 5 also carry more than `taste.md`'s spirit allows: a bass on every sixteenth, a second chord one bar in four from bar 40, a hand-played lead of 7 notes per 4 bars above E4, and in Nordlicht a carrier whose intervals first change at bar 16 of 136. Bart's taste is wider than that file.

## 5. The floors

Add these rows to `taste.md`'s blind checks. Run `floors.py` after the first render and before any other check.

| check | pass | the 5 | Hohlraum |
|---|---|---|---|
| pitched group under the kick, bars 16 to (end − 16) | 2 to 5 dB | 2.4 to 4.1 | 9.3 |
| pitched 500–2k under the kick, best 8 bars that have a kick | 6 to 12 dB | 7.0 to 10.5 | 13.5 |
| carrier present | ≥ 50 % | 53 to 98 | 32 |
| carrier level spread, 25–85 % of the track | ≤ 3.5 dB | 1.9 to 2.9 | 7.4 |
| carrier timbre travel | ≥ 10 dB | 10.6 to 26.4 | 7.3 |
| carrier's first 8 bars under its middle | ≤ 4 dB | 0.4 to 3.6 | 5.9 |
| a pitched voice that moves under 150 Hz | yes | yes in all 5 | no |
| pitched voices sounding in the body | 3 or 4 | 3 to 4 | 2 and a tick |

A record that fails the first, third or fifth row is not ready for Bart. Fix the score and the voice, not the master.

These rows catch the failure you asked about in question 8: round 1 passed every existing check with a carrier nobody could hear on a laptop.

## 6. Edits to `taste.md`

1. **"The rule under all the others"**, last line. Replace "When two options are open: fewer notes, darker, later, quieter, longer." with: "When two ideas are open, take the plainer one. Never settle a doubt by making the record emptier or quieter. The floors decide how full it is."
2. **Rule 2**, add: "Its level holds from its first bar. Only its timbre travels."
3. **"What may change", the carrier.** Split the list. Passed by Bart: a chord stab; a low riff; a sequenced line through a ladder filter; a sixteenth-note bass; an oscillator stack whose tuning moves. Never made: a pad whose filter moves; the echo itself; a drone with one moving note; a figure on tuned toms. An item from the second list needs Bart to see the brief first.
4. **"What may change", the ground.** "No bassline and a rumble" holds only when the carrier itself reaches under 110 Hz.
5. **"Making one", step 1.** Add a first line to the brief: the model (a real record or rig, and what each instrument in it plays). Replace "three things you wanted to add and are refusing" with: "for each thing a sibling record has that this one drops, what does its job now".
6. **"Making one", step 2.** "Pitched voices: 4 at most" becomes "3 or 4".
7. **"Making one", step 4.** "Render, run `floors.py`, then the blind checks."
8. **"Making one", step 5.** The mute test has numbers now: kick, carrier and echo alone pass when the carrier is present 50 % of the time and its timbre travels 10 dB.
9. **Blind checks.** Add section 5's rows.

## 7. Your questions

1. **Is a tuned knock a real carrier?** As built, no: present 32 % of the time, static in timbre, 2 pitches and a third for 8 bars. I put it on the list without having made one. That was my mistake.
2. **The odd-harmonics shape.** It cannot be heard, so keeping or dropping it changes nothing. The image wrote a decision the stem does not contain.
3. **Does it need its own "one pitch"?** Yes. The tick is 10 dB under where the ping sat. Bring it to about −34 dB RMS and lengthen it to 80–120 ms on D♯5, or use a resonator as Nordlicht does: three narrow bandpasses tuned to notes of the chord, fed quietly all the way through. That suits a hollow.
4. **Are three pitches too few?** The count is fine. Halbschatten's stab is one chord. Three pitches with a static timbre at a third of the time is too little.
5. **The pregain.** Put it back to 1.3. The level comes from the pitched group: about 6 dB more of it across the body.
6. **The floor alone (bars 96–99).** A subtraction works when the thing leaving was holding the room. Kick, rumble and hats is what bars 8–47 already consist of, give or take a quiet knock, so there is little to hear leaving.
7. **Which numbers in your section 5 first?** None. The lanes are fine as shapes. The voice under them has nothing for them to move.
8. **A new row in `taste.md`?** Section 5.

## 8. Hohlraum, next

The cheapest test of this note is Hohlraum made again under it, with Bart hearing both. I have not rendered this, and I cannot hear it.

Keep the image, the key, 126, the clocks in 4, 7 and 5, the form, the pad and its event, the hats, the rumble, the hall and the master at pregain 1.3.

Change:

1. **The carrier's voice.** `osc_moog`'s pulse at 50 % width into `ladder`, from `misc/streulicht_reference.py`, with resonance on a lane the way Streulicht's line has it. A square has odd harmonics only, so the hollow is real this time. Play the same da-dum cell an octave down (G♯2 and F♯2, A2 in the event bars), highpass at 60 Hz. An octave lower, the same sweep crosses twice as many harmonics. It is now the low voice too, the way Gegenlicht's riff is. If the timbre travel comes out under 10 dB, mix in the saw. `osc_moog`'s saw and pulse have fundamentals of opposite sign: use saw − pulse, never the sum.
2. **Level.** At its body level from bar 16, 5 to 8 dB under the kick. The entry is dark and at full level. Start on the medium cell; keep the sparse cell for the last 16 bars.
3. **Timbre.** One cutoff lane, 200 → 2400 → 200 Hz in log, with the filter envelope and the resonance on their own lanes. Delete the ring, shape, drive and compensation lanes.
4. **The knock you have** can stay as a clock at a fixed level, the way Gegenlicht's toms do.
5. **The tick** up 10 dB.
6. `floors.py`, then the blind checks, then two MP3s to Bart.

## 9. `floors.py`

```python
#!/usr/bin/env python3
"""floors.py: the checks taste.md did not have. Run on the pre-master stems of a reference render.

    python3 floors.py STEMS_DIR BPM BARS CARRIER_STEM [--drums a,b,c] [--ground a,b]

The pitched group is every stem that is not a drum, noise, a riser, the drum room or the ground
(a rumble made from the kick). A bassline is pitched. Needs numpy and scipy."""
import sys, os, glob, argparse
import numpy as np
from scipy.io import wavfile
from scipy import signal

ap = argparse.ArgumentParser()
ap.add_argument('stems'); ap.add_argument('bpm', type=float); ap.add_argument('bars', type=int); ap.add_argument('carrier')
ap.add_argument('--drums', default='kick,hats,ohat,clap,rim,ride,shaker,crash,toms,noise,riser,room')
ap.add_argument('--ground', default='rumble')
a = ap.parse_args()
BAR = 240.0 / a.bpm
S = {}
for f in sorted(glob.glob(os.path.join(a.stems, '*.wav'))):
    SR, x = wavfile.read(f)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    S[os.path.basename(f)[:-4]] = x.mean(axis=1) if x.ndim == 2 else x
n = min(len(v) for v in S.values())
drums, ground = set(a.drums.split(',')), set(a.ground.split(','))
pitched = sum(v[:n] for k, v in S.items() if k not in drums and k not in ground)
kick, car = S['kick'][:n], S[a.carrier][:n]


def db(p):
    return 10 * np.log10(p + 1e-14)


def seg(x, b0, b1):
    return x[int(b0 * BAR * SR):int(b1 * BAR * SR)]


def band(x, lo, hi):
    return signal.sosfilt(signal.butter(4, [lo, hi], btype='band', fs=SR, output='sos'), x)


def power(x):
    return float((x ** 2).mean()) if len(x) else 0.0


body = (16, a.bars - 16)
blocks = list(range(0, a.bars, 8))
k_db = db(power(seg(kick, *body)))
rows = []

# 1. how full the record is: the pitched group against the kick, over the body
rows.append(('pitched group under the kick, bars %d-%d' % body, k_db - db(power(seg(pitched, *body))), 2.0, 5.0, 'dB'))

# 2. the mids at the peak: the pitched group's 500-2000 Hz, its loudest 8 bars that have a kick, against the kick
mid = band(pitched, 500, 2000)
kicked = [b for b in blocks if db(power(seg(kick, b, b + 8))) > k_db - 3]
rows.append(('pitched 500-2k under the kick, best 8 bars with a kick', k_db - max(db(power(seg(mid, b, b + 8))) for b in kicked), 6.0, 12.0, 'dB'))

# 3. is the carrier there most of the time: 20 ms frames within 20 dB of its loud level, first sound to last
w = int(0.02 * SR)
fr = np.sqrt((car[:len(car) // w * w].reshape(-1, w) ** 2).mean(axis=1) + 1e-14)
ref = np.percentile(fr, 97)
on = fr > ref * 1e-3
i0, i1 = int(np.argmax(on)), len(on) - int(np.argmax(on[::-1]))
rows.append(('carrier present (duty)', 100 * float((fr[i0:i1] > ref * 0.1).mean()), 50.0, 100.0, '%'))

# 4-6. the carrier by 8-bar block: its level should hold, its timbre should travel
lev = np.array([db(power(seg(car, b, b + 8))) for b in blocks])
hi = band(car, 800, 3200)
share = np.array([db(power(seg(hi, b, b + 8))) for b in blocks]) - lev
alive = lev > -60
core = [i for i, b in enumerate(blocks) if alive[i] and a.bars * 0.25 <= b < a.bars * 0.85]
rows.append(('carrier level, spread across 25-85 % of the track', float(lev[core].max() - lev[core].min()), 0.0, 3.5, 'dB'))
rows.append(('carrier timbre travel (800-3200 Hz share, max - min)', float(share[alive].max() - share[alive].min()), 10.0, 40.0, 'dB'))
rows.append(('carrier, its first 8 bars against its middle', float(np.median(lev[core]) - lev[alive][0]), -3.0, 4.0, 'dB under'))

print('%-54s %8s   %-12s' % ('check', 'value', 'pass'))
for name, v, lo, hi_, unit in rows:
    print('%-54s %8.1f   %g to %g %s   %s' % (name, v, lo, hi_, unit, 'ok' if lo <= v <= hi_ else '<-- FAIL'))
print('\nby 8-bar block   carrier level (dBFS)        : ' + ' '.join('%4.0f' % v if v > -90 else '   -' for v in lev))
print('                 carrier 800-3200 share (dB) : ' + ' '.join('%4.0f' % v if al else '   -' for v, al in zip(share, alive)))
print('                 pitched 500-2k (dBFS)       : ' + ' '.join('%4.0f' % db(power(seg(mid, b, b + 8))) for b in blocks))
```

Usage:

```bash
python3 floors.py stems/ 126 128 knock                 # Hohlraum
python3 floors.py stems/ 128 128 acid                  # Gegenlicht
python3 floors.py stems/ 122 120 chords                # Halbschatten
```

Name any drum stems the default list misses with `--drums`. A rumble made from the kick goes in `--ground`; a bassline does not.

## Sources

- [Consumed (Plastikman album)](https://ipfs.aleph.im/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/Consumed_(Plastikman_album).html)
- [(idm) A Review of Plastikman's Consumed, 1998](https://analogue.bytenoise.co.uk/message/e6bed7f96f006fe1ee79f35d336263d035eeecee)
- [Classic Tracks: Plastikman 'Consumed', Sound On Sound](https://www.soundonsound.com/techniques/classic-tracks-plastikman-consumed)
