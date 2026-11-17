# Writing a short tune that is not cheesy

A signature tune is four bars that people can hum after hearing it twice. What makes one cheap is
almost always the same: random notes from a scale (worst of all, the five black-key notes wandering
up and down), every note the same length, and no ending. What makes one good is a small idea, said
twice, then answered.

## The score

`OlaSound.melody(score, { bpm, chords, echo })`. The score is notes with lengths, separated by commas:

- a note: `D4`, `F#4`, `Bb3` (letter, sharp or flat, octave; middle C is `C4`); `r` is a rest
- a length: `w` whole (4 beats), `h` half (2), `q` quarter (1), `e` eighth (half a beat), `s`
  sixteenth; a dot adds half (`q.` is 1.5 beats)
- `chords`: one chord per bar, `'D | Bm | G | A'` (kinds: none for major, `m`, `maj7`, `m7`, `7`,
  `sus2`, `sus4`, `add9`, `m9`), played softly underneath
- `bpm`: 84 to 112 for a calm or warm tune, up to 120 for a brighter one. `echo: true` adds the dub
  echo (each repeat darker), good for slow tunes in minor keys.

Every bar adds up to 4 beats. Count them.

## The four-bar plan (use it every time)

1. **Bar 1, the motif:** three or four notes, with long and short notes (for example q e e h). Start
   on the home note or its fifth. This is the idea.
2. **Bar 2, the motif again, with one change:** same rhythm, same first notes, a different last note,
   usually higher. It now asks a question.
3. **Bar 3, the answer begins:** something new that moves the other way, often from the high point
   down by steps. Or the motif once more, a step higher.
4. **Bar 4, home:** come down by step and land on the home note on beat 1 or 3, held for 2 to 4 beats.

Within that: move mostly by step (next note of the scale), use at most one or two leaps (a jump of a
fourth or more), and step back the other way after a leap. Stay within about an octave and a half.
Put a note of the bar's chord on beat 1. One key for the whole tune.

## Keys and chords that work

- Warm, hopeful (a campaign, a community, a win): **D major**, chords `D | Bm | G | A` or `D | G | Bm | A`
  (the last bar's chord leads home; the tune's last note is D over the next start), or `G | Em | C | D`
  in G major.
- Serious, thoughtful (an anniversary, a memorial, an investigation): **A minor** or **D minor**,
  chords `Am | F | C | G` or `Dm | Bb | F | C` (end on A or D, the home note, held).
- Avoid: C major arpeggios up and down (a phone default), the major pentatonic run, fast notes in
  the top octave, anything over 120 bpm, a trill or a turn at the end.

## Two examples (copy their shape, not their notes)

D major, hopeful, 100 bpm:

    D4 q, F#4 e, A4 e, B4 h,      (bar 1: the motif, ends up on B)
    D4 q, F#4 e, A4 e, D5 h,      (bar 2: the same, a higher ending: the question)
    B4 q, A4 e, F#4 e, G4 q, E4 q,(bar 3: the answer, coming down)
    D4 w                          (bar 4: home, held)
    chords: 'D | G | Bm | D'

A minor, serious, 88 bpm, with echo:

    A3 q., C4 e, E4 h,            (bar 1)
    A3 q., C4 e, G4 h,            (bar 2: the same, the last note higher)
    F4 q, E4 q, D4 q, C4 q,       (bar 3: the answer, step by step down)
    B3 h, A3 h                    (bar 4: the leading note, then home)
    chords: 'Am | C | F | Am'

## Check it

`listen.py` reads the notes you played: the key, how much of the tune is in it, whether a figure
comes back, whether every note is the same length, and the last note. Fix any [fail] it prints by
the plan above, not by adding notes.
