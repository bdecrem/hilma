# The music beds: what they are and what may change

Both beds come from pieces the owner listened to and approved, and from Ola's recipe book of genres
(the Jambot library). Their voices are copied exactly. Earlier attempts to "improve" a proven kick or
bass sounded wrong every time, so the rule is: **the kick, the sub bass and the voices stay as they
are; variation goes into chords, tempo, arrangement and level.**

## `pad`: an ambient pad (calm pages, reading, waiting, memorials, gardens)

Eno-style ambient ("as ignorable as it is interesting"): no drums, no melody, no rhythm to follow.
Two related chords (Amaj9 and F#m11) take turns every 26 to 34 seconds. Each voice picks a note of
the current chord, fades in over 7 to 14 seconds (the first three over 2 to 4, so a page is not
silent), holds, and fades out over 12 to 21 seconds; a new voice every 1.4 to 3.8 seconds. Mostly
sines, about a quarter triangles, a few cents of detune; everything through a 2.2 kHz lowpass that a
very slow LFO (25 seconds) moves. When the chord changes, old voices keep their notes and fade, so the
harmony bleeds across instead of cutting.

- `OlaSound.loop('pad', { level: 0.5, key: 0 })`: `level` 0.3 to 0.7; `key` moves it in semitones
  (-2 for G, +5 for D). Nothing else changes.
- Good for: a calm background, a waiting screen, a reading page. It never repeats exactly, so it does
  not grate after a minute.

## `dub`: dub techno (an evening event, a night page, a darker, slow pulse)

Dub techno hovers: a soft four-on-the-floor kick as a distant heartbeat, a deep sub, a quiet hat,
and a minor-seventh chord stab sent into a long delay with a **lowpass inside the feedback loop**, so
each echo is darker than the one before and the chord dissolves "into fog". The engine is the
chamber piece's, number for number: kick 70 to 45 Hz over 60 ms with a 220 ms decay and a quiet
noise click, sub 82 to 55 Hz, hat high-passed at 7.2 kHz, stab of detuned sawtooths through a
resonant lowpass that opens and closes, delay 3/16 of a bar at 62% feedback through a 1.7 kHz
lowpass, a slow master filter sweep, quiet mastering. Chords Am7, Dm9, Em7, eight bars each.

- `OlaSound.loop('dub', { bpm: 118, level: 0.33 })`: `bpm` 110 to 124 (slower lets the echoes
  breathe; never faster), `level` 0.2 to 0.45. The arrangement starts with kick and sub, adds the hat
  in bar 3 and the stabs in bar 5.
- Good for: a page that wants a pulse without energy. Not for a calm reading page (use `pad`).

## What is never used

Pentatonic random walks and "meditation app" noodling (the owner: cheesy, not musical at all),
saccharine major-key new age, peak-time rave, preset-sounding genres, bright sawtooth leads,
anything loud. Music on a page sits under the reading: near -24 dBFS, never in front.

## The levels

A bed near -24 to -28 dBFS RMS, peaks under -6 dBFS; a tune near -20 to -25 RMS. Interface sounds
peak near -18 and stay under -12. `listen.py` checks all of these.
