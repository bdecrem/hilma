# Curriculum: scales and chords, beginner to advanced

What the lesson modules teach, in what order, and why; what's built (0.1 (50), 2026-10-29) and
what comes next. The game side (levels, Adaptive) is `CHARTING.md`. The research this was cut
from is Bart's `misc/scales-and-chords-lessons.txt` and `misc/game-level-design.txt`
(graded syllabi, teachers' key orders, Ableton's Learning Music, Hooktheory, Berklee, the
producer-theory writers); the choices below are the ones that fit how Takt already teaches.

## The principles

1. **The band is already playing; every drill has a job.** A scale is introduced because the
   next riff needs it (the pentatonic for the jam), a chord shape because the record uses it
   (the rootless nine for deep house).
2. **One new thing per lesson.** A new scale *or* a new key *or* a new hand *or* a new
   rhythm. Never two. (The syllabi: RCM, ABRSM climb one axis at a time.)
3. **Hands and ears before names.** Play it over the groove, then the theme card names it.
4. **Keys by fingering group, in circle-of-fifths order.** C G D A E share one fingering; the
   relative minors share theirs; F and B break it; the black-key keys have their own rule.
5. **Common before rare.** Pentatonic and natural minor before the modes; I IV V and the
   four-chord loop before the ii-V-I; sevenths before extensions.
6. **Every scale has a chord and every chord a scale.** Dorian arrives beside the minor
   seventh; Mixolydian beside the dominant seventh (the blues band's C7).
7. **Mastery is measured** (MIDI, two clean choruses at the lesson's tempo), and the jams
   under each lesson are where it becomes music.

## Scales (module S: `lesson-S1.json` C major / `lesson-S1m.json` A minor, by the taste setting)

Thirteen lessons, right hand at 60 unless said, one note a beat, over the drums alone; a jam
under each at 70 with the band. Lessons 1–6 were built in 0.1 (26)–(33); 7–13 are
`scripts/scales-extend.py` (run it after editing 1–6 by hand: it keeps them byte for byte).

| # | A minor file | C major file | What's new | Why here |
|---|---|---|---|---|
| 1 | Up | Up | the octave, thumb under after 3 | the crossing is the one technique everything else needs |
| 2 | Down | Down | middle over the thumb | the mirror of 1 |
| 3 | Up and down | Up and down | the turn at the top | one run, both crossings |
| 4 | Two octaves | Two octaves | the crossing twice; the octave buttons on a 32-key | keeps the pulse through the turn |
| 5 | The left hand | The left hand | pinky first, the crossings reversed | the other hand before any new notes |
| 6 | The blues scale | The blues scale | the flat five | what the blues band wants |
| 7 | Minor pentatonic | Major pentatonic | five notes, 1 2 3 1 2 3 | the scale you can't play wrong; the jam riff |
| 8 | The relative major (C major pentatonic) | The relative minor (A minor pentatonic) | the same keys, another home | major vs minor is where you land, not which keys |
| 9 | E minor | G major | a second key, same fingering, one black key | the fingering moves round the circle |
| 10 | D minor | F major | the first flat (B♭); in F the fingering breaks: 1 2 3 4 1 2 3 4 | the thumb stays off the black keys |
| 11 | Harmonic minor | Mixolydian | one note changed: the raised 7th / the flat 7th | the leading tone pulls home; the flat seven is the blues' major and C7's scale |
| 12 | Dorian | Dorian | the raised 6th | the club's mode: deep house, melodic techno |
| 13 | Chromatic | Chromatic | every key; 1 on white, 3 on black, 2 between two whites | the rule, not a list |

The jams: pentatonic riffs (the same riff in A, then moved to E and D with the band
transposed to the relative major: the player hears the band change under a riff they know),
the relative's riff, the leading tone leaning on the root, a two-bar Dorian vamp with the sixth
on the beat, the chromatic coming back down.

Content model (`Lesson.swift`): a scale step in another key carries its own one-chord `form`
and `chords` (E minor is `{"Em": {"numeral": "i", "root": 4}}` × 12) and `key` names the run;
`flats: true` spells the black keys as flats (before, only a name ending in "blues" did).

**Next (the `later` rows):** hands together an octave apart and contrary motion (both need
two notes a tick in a run, and the run panel draws one hand); thirds and sequences; melodic
minor; D and A major; "round the circle" (one key a bar). Then the modes as colours against
one root (Phrygian, Lydian, Mixolydian in the minor file), the black-key keys (D♭ G♭ B♭ E♭
A♭: thumbs only on C and F), and the advanced set (melodic-minor modes against altered
dominants, whole-tone and diminished against their chords, bebop scales). Those want a
"which scale fits this chord" jam the scorer judges by pitch-class membership, not by
specific notes: a new step kind.

## Chords (modules A1, M, H)

| Module | Lessons | What it teaches |
|---|---|---|
| **Blues Progressions** (A1, C blues) | roots on the 1 · the shuffle (root + fifth) · pick up speed · hold it at 90 · the payoff · the third finger · twice a bar | the major triad inside I IV V, the first hand shape, tempo as a gate |
| **Minor Chords** (M, the A minor band transposed) | the minor blues in all 12 keys, white keys first (A E D G C F B F♯ C♯ G♯ E♭ B♭) · two a bar | the minor triad as one shape moved everywhere: Takt's "triads by shape group" |
| **Chord Shapes** (H, `scripts/chord-shapes.py`, 0.1 (50)) | below | what a hand does with a chord it knows |

Chord Shapes, left hand over the A minor band, 70 unless said:

| # | Lesson | Shape | Why here |
|---|---|---|---|
| 1 | Minor sevenths | R ♭3 5 ♭7, 5 3 2 1, on the 1, whole band | one more finger and the triad sounds like a record; the chord under house |
| 2 | Inversions | root / first / second, one a bar, drums and bass | the same notes, a new bottom: the hand learns three places to sit |
| 3 | Four chords | Am F C G (i VI III VII), root position, drums alone | the loop under half of pop and most of the club; three major triads and a minor one in one form |
| 4 | Moving less | the loop as A C E · A C F · G C E · G B D | voice leading: keep the common tone, move the rest by a step; the hand inside G3–F4 |
| 5 | The backbeat | the triad on 2 and 4, at 80, whole band | comping: leave the 1 to the drums |
| 6 | Suspend, resolve | sus4 on the 1 (A D E), the minor on the 3 | tension and release inside one bar; why pads love sus |
| 7 | The shell | R ♭3 ♭7 (A C G) | the guide tones; the fifth is furniture: how jazz left hands voice |
| 8 | Minor nine, rootless | ♭3 5 ♭7 9 (C E G B over Am), the bass on the root | the deep house chord; a maj7 shape the bass turns into a m9 |

The jams: the seventh walked as a bass line, the inversions broken and climbing an octave, the
loop with a root-and-fifth bump on the 3, the voice-led loop at 80 twice a bar, the backbeat
with a push on the and of 1, sus on the 4 leaning into the next bar, the shell with the fifth
alone on the 3, the rootless nine as an arpeggio.

Content model: a pattern note may carry `chord` (a name of the step's chords) and then plays
only in that chord's bars, so a progression can have a voicing per chord (lesson 4). Scoring is
pitch class in any octave (brief §4), so an inversion lesson shows the inversion's keys and
fingers and checks the notes; it can't tell root position from first inversion. Honest on a
32-key controller; the keyboard and the hand still teach the shape. New tones for patterns:
`second`, `fourth`, `flatFifth`, `majorSeventh`, `ninth`.

**Next:** rootless A and B voicings round a ii-V-I (the band's bass on the roots), drop 2,
the ii-V-I itself in four keys (needs a band with the changes: a new `band-*.py`), the fixed-
shape stab moved in parallel (Detroit chord memory, Kerri Chandler's m7 in third inversion),
diatonic triads up the key, cadences by ear (an `EarGame` kind for progressions), both hands
(shapes under a right-hand riff). Then extensions and alterations, upper structures, slash
chords over a pedal, and reharmonisation ending in "take a plain loop and make it a deep house
loop, exported as MIDI".

## What the engine would need for the rest

- **Two notes a tick in a run** (hands together, contrary motion, thirds): the Scorer already
  takes chords; the run panel and `Run` draw one line.
- **A jam scored by membership** (in-scale / in-chord ratio and timing), for the chord-scale
  lessons and the capstones.
- **Voicing checks** (lowest note, interval order) for the voicing lessons, on top of the
  pitch-class set.
- **Bands with changes** beyond the blues: a ii-V-I band, a four-on-the-floor house band in a
  minor key (the Stage's synths exist; a lesson band needs the lesson's 12-bar form).
- **Ear kinds** for scales (which mode, which minor) and progressions (name the loop, the
  cadence, the borrowed chord), beside chords and intervals.
- **Lessons ↔ Stage**: a song lists the skills its top tiers use, and a result that keeps
  dropping in a section points at the lesson (`CHARTING.md`, open).
