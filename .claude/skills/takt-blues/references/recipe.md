# The recipe: a generator, device by device

Every Stage song is a Python script in `apps/takt/scripts/songs/` on `common.py`
(`Song`, `hit`, `note`, `chord`, `part`, `pnote`, `pchord`, `chart_to_channel`, `fingered`,
`write`), run with `python3 apps/takt/scripts/songs/<name>.py` → `Takt/Content/song-<name>.json`.
Read `common.py` once (190 lines); it is the format.

## Which script to copy

| you want | copy | why |
|---|---|---|
| a slow blues, 12/8 at 90, four choruses, a stop | `slow_burn.py` (`--short` makes a one-chorus version) | the grace notes on choruses 2 and 4, a sax solo on the ride, the piano comping the 1 and the 3 with triplet pushes |
| a Texas shuffle, 112, a quick four, a stop-time chorus | `pearl_street.py` | the boogie bass doubling every beat, stab-and-chank piano, the stop-time device (the band hits the 1 and lays out eight bars, a fill back in on bar 8) |
| a jump blues at 120, six choruses, a shout chorus, a piano solo | `boogie_shoes.py` | the walking bass R 3 5 6 / ♭7 6 5 3, chanks on 2 and 4, a riff you hum |
| a minor blues, straight eighths at 84, a Rhodes | `blue_lantern.py` (`--white` is the Level 1 song: one riff in one hand) | kick on the 1 and the "and" of 3, a sixteenth hat with the open hat into the 1, the bass on the root answering on the seventh and fifth; the `from` tiers for a level song |
| Delta: one guitar, a foot, the voice alone in the stops | `dockery.py` | the thumb and the chick, two bars of stop time at the top of every chorus, the slide chorus up an octave; the chick-first chord weights |
| a fast Delta boogie, 116 | `friars_point.py` | the boogie thumb under the slide's triplets, five choruses, one big stop |
| Chicago stop time, 80, a unison riff | `maxwell_street.py` (`--five` is the Level 2 song) | eight bars of stop time, the riff slammed by bass, piano and sax, the answers in the gaps, a shuffle chorus where the riff drives |
| an electric boogie at 148 with the guitar through the amp and a rolling piano | `halsted.py` | the guitar alone for two bars, seven choruses each doing one thing, the fewer-anchors rule for a fast song |
| a soul blues at 96, straight eighths, the electric guitar and the piano trading over one riff in unison | `mclemore.py` | a one-bar riff and an answer bar (`kind(bar)`: A / B / T), the bass and the guitar in unison, piano stabs written for a rhythm step, the verse where the piano takes the riff, breaks at the top of the guitar chorus, a line written in one hand box with `from` on the peaks |

## The skeleton

```python
s = Song("song-<name>", "<Title>", "<Style>", "<Key>", <tempo>, "<glyph>", "<the card's line>", seed=<n>)
s.sounds = {...}                      # the kit (sound.md); an xstick for the count-in always
s.instruments = {"bass": "bass", "keys": "piano", "horns": "sax", "monitor": "piano"}
s.levels = {"keys": 0.0, "bass": 0.0, "horns": 0.0}   # trim from a render
s.bars = 12 * CHORUSES
s.chords = [FORM[b % 12] for b in range(s.bars)]; s.chords[-1] = "<tonic>"
for c, name in enumerate(["Head", "Snare in", "Stop time", "Sax solo", "Out chorus"]): s.section(c * 12, name)
# MARK: Drums   # MARK: Bass   # MARK: Chords part   # MARK: Melody part
s.write()
```

Chord labels are the game's: `"A7"`, `"Dm7"`, `"Bb7"`, `"E7"`, `"Am"` (the improv teacher
reads them as chord tones, so spell them that way). Forms we use: the 12-bar (I I I I IV IV I I
V IV I V), the quick four (I IV I I …), the minor (i i i i iv iv i i VI V i V: Dm7 … Bb7 A7
Dm7 A7), Chicago stop time (I × 8, then V IV I V), and Level 3's minor i iv v in A minor
(GOALS.md: Am Dm Em). Sections are by bar and name what the chorus does.

## Drums: the arrangement is in the drums

- **The backbeat grows**: cross-stick on 2 and 4 in the head (`back = "xstick" if c == 0 else
  "snare"`), the snare from the second chorus, ghost notes at 0.15–0.18 on the shuffle's
  late eighths once the snare is in (`if s.rng.random() < 0.5`).
- **Kick by feel**: 12/8 at 90 and the shuffles: the 1 and the 3 (0.95 / 0.82) with the
  triplet push into the 3 (tick 20, 0.42) and into the next bar (tick 44, 0.4) on odd bars from
  chorus 2. Straight eighths at 84: the 1 and the "and" of 3 (tick 30), a sixteenth before the
  1 (tick 45, 0.4) every other bar from chorus 2. The Delta foot: every beat, hard on 1 and 3.
- **Hat to ride**: the hat (0.6 on the beat, 0.34–0.46 on the late eighth; sixteenths at 0.24
  for the straight feel) in the heads, the ride for the solo and out choruses (0.62 / 0.5, the
  late eighth 0.4, the foot on 2 and 4, the bell on the 1 of every four bars), the open hat
  into the 1 every other bar where the groove wants a breath.
- **Fills**: a dict per chorus (`FILLS[c]` on bar 11: snare rolls into toms, 0.5 → 0.95), cut
  from `fill_from` so the time-keepers stop under it; a crash on the 1 of bar 0 (0.5 + 0.1 c).
- **Stop time**: in a stop-time bar the band hits the 1 together (kick 1.0, snare 0.9, crash
  on every fourth bar else ride) and lays out; bar 8's fill (five snares, 0.5 → 0.9) brings the
  band back. Chicago style (Maxwell Street) the drums play the riff's rhythm with the band
  (the 1, the push on tick 12 and 20, the landing on tick 24) and the foot keeps time in the gaps.
- **The last bar**: the stop. Kick 1.0 + crash 0.95 on the 1, the answer on the "a" of 2 and
  the 3 for a shuffle (ticks 20 and 24), nothing after. Bass root held 40 ticks, the chords
  part's voicing held 44, the melody's tonic held 42–44.

## Bass

Low (sampled E1–D♯2). Slow blues: the root on the 1 (18 ticks), the seventh (tick 18, 6),
the root again (tick 24), the fifth (tick 30, 12), a walk-in to the next chord on tick 42 from
chorus 2. The walk (jump and Texas): R 3 5 6 up one bar, ♭7 6 5 3 down the next
(`UP`/`DOWN` dicts per chord); the Texas boogie doubles every note (tick 0 and 8). The
turnaround (bar 11): a walk down into the top (E E♭ D C♯ over an A blues; A, the C♯ under it,
back up to D over the minor). Chicago: the riff in unison with the horn (A1 C2 D2 E♭2 E2, the E
held into beat 3) in the stop-time bars, a walking shuffle in the release. Delta: the thumb's
boom-chick an octave under the guitar (A1).

## The chords part (the comping) and its weights

A dict of voicings per chord, `[(note, role, finger)]`, close, around middle C, voice-led (the
common tone stays, the rest move by step; Chicago rubs the C♯ against the riff's C):

```python
VOICING = {"A7": [(55, "seventh", 5), (61, "third", 3), (64, "fifth", 2), (69, "root", 1)], ...}
chords = s.part("chords", "<title>", "piano", "keys", "piano")
s.pchord(chords, o, VOICING[ch], 1, 16)            # the 1: weight 1
s.pchord(chords, o + 24, VOICING[ch], 2, 10)       # the 3 (or the "and" of 2, the 4): weight 2
s.pchord(chords, o + 44, VOICING[next], 3, 4)      # the push into the next bar: weight 3
s.chart_to_channel(chords, s.keys, lambda e: 0.68 if e["t"] % BAR == 0 else 0.52 if e["t"] % BAR == 24 else 0.4)
```

Every chord note carries a **role** (`root third fifth sixth seventh ninth`): the charter keeps
notes in `keep` order, so a two-note Easy is root + third and says the chord's quality (never
root + root: a role already kept goes last). Fingers are hand-set, the left hand, pinky low.
Weights: **1** the downbeat of every chord change and the 1 of each four bars, **2** the groove
hits (the 3, the "and" of 2, the 4), **3** the pushes and the turnaround fills. Write weight-2
hits on the pushes if the ladder needs a rhythm step between Easy and Medium (Easy and Medium
share a rhythm by design; the step from Easy to Medium is the chord size). The Delta thumb:
the chick after the 1 and 3 weight 1, after the 2 and 4 weight 2, the thumb 3, so the chords
part is chords from Easy (Bart: "I'm not seeing traditional chords, instead I see bass notes").
The record's velocities (`chart_to_channel`'s lambda) and tremolos or doublings go on the band
channel only (append to `s.keys` after).

## The melody part (the horn line) and its weights

Weights are the spec, measured in onsets a second (`BLUES.md` §2): **1** the anchor the bar
stands on (the long note on the 1, the landing of a lick), **one a bar as the rule, two at
most**, and **one every two bars from about 140 bpm** (Halsted: at 148 a bar is 1.62 s and an
anchor a bar is already 0.62 a second, over Easy's band; the odd bar's anchor plays as a main
note); **2** the main passing notes and the answers; **3** pickups, triplet pushes, grace
notes, the turnaround's ornaments, anything quicker than an eighth. Check: the weight-1 notes
alone at 0.35–0.5 a second. The anchors should cover the tune's keys over a chorus. Phrases as
dicts per bar of the form (`HEAD[b]`, `SOLO_LINE[b]`, `RELEASE[b]`), `(tick, note, len, lv)`,
transposed per chord with a `SHIFT` dict where the line moves with the changes.

A reduction must stay **fingerable**: when the main notes of a riff land a beat apart and need
the whole hand to jump inside a fifth (A4 G4 C4 A3 then E4), fix the weights (the riff's C♯
became the main note and the low A its ornament), never only the fingers (CHARTING.md rule 15).
A melody that will be a map level's song is one riff in one hand position with two or three
figures that come straight home, the figures carrying `from` tiers (`blue_lantern.py --white`,
CHARTING.md rules 13–14, LEVELING.md): hand that job to the `takt-chart` skill's rules.

`s.fingered(melody)` writes per-pitch fingers the Stage ignores for melodies (it fingers each
tier's line itself); keep the call so the file is complete. `s.chart_to_channel(melody, s.horns,
lambda e: 0.84 if e["lv"] == 1 else 0.7)` puts the line on the record; then `saxLong` on every
horns note of 12 ticks or more. The grind (Halsted) doubles the riff a fifth up on the channel
only.

## A solo chorus, and the cover against the anchors (learned on the first test tracks, 2026-11-08)

- **A piano solo** goes on the horns channel played by the piano (`inst="piano"` on each note in
  `chart_to_channel`, or `s.note(s.horns, …, inst="piano")`), the way Boogie Shoes does it, with
  the comping under it dropped about 15 %; the melody part's notes in that chorus are the solo
  (the player takes the piano line there, on the part's monitor). Halsted writes its piano solo on
  the keys channel instead (the melody part is the guitar); either way the solo is a line, not
  the comping.
- **Every key a chorus uses must be an anchor somewhere in that chorus, or carry one weight-2
  note on the 3.** The chorus-long phrase cover runs before the weights and takes, for each key
  the line uses, its heaviest earliest onset that fits the gap; a key whose only onsets are a
  weight-2 passing note on the 4 or a 4-tick ornament a beat before a downbeat gets taken there,
  and the next bar's anchor no longer fits Easy's 0.9 s gap. Both test tracks lost four anchors
  a chorus this way at first measurement. The cure is the line: a weight-2 note of that key on
  the 3 (a beat from both downbeats), or the key as an anchor, or `from` 6/7 on an ornament-only
  key (the B naturals, a grace note) so the cover never sees it on Easy.
- **A cover a beat long or longer is Beginner's too** (`minBeats` 1): keep a cover note that
  should stay off Beginner to an eighth.
- **At 76–90 a second anchor sits on the 3, never the 4**: the 4 is 0.79 s before the next
  downbeat at 76 (0.67 at 90), under Easy's 0.9 s gap, and knocks the next bar's anchor off. One
  anchor a bar at 76 is 0.32 a second, under §4's 0.35 rule of thumb: the riff bars take a
  second anchor on the 3.
- **A pickup into a bar's last note goes on the last triplet eighth (tick 44)**: Medium (tier 5,
  `space` 1.2 s) borrows any weight-3 note it finds in a 12/8 half-bar silence (1.33 s); on tick
  44 the 0.3 s gap keeps Medium off it and Hard still plays it.
- **The comping's groove hits are the 3 and the 4, the anticipation a weight-3 push**: with the
  groove on the "a" of 2 (tick 20), tier 2 borrows nothing (a hit must sit 1.2 s from both
  downbeats) and Easy falls to the 1 alone (0.38) with a ×2.6 step over it.
- Measure after every one of these; a chart that passes the bands can still be wrong bar by bar
  (an anchor missing from Easy shows in `-ChartDump`, or in a per-bar dump of `masks()`), so read
  Easy's bars once before calling it done.

## Level variants and `from`

A song can write a second file from the same record (`--white`, `--five`, `--short`, `--ii`):
`WHITE = "--white" in sys.argv`, a different `Song(...)` name and title, the original
regenerates byte-identical (assert it with `git diff --stat` after running both). A note's
`tier=` in `pnote` is its `from`: the lowest tier it is on at all, for figures whose keys must
not leak down the ladder.

## After generating

1. `npx tsx scripts/takt/measure.ts apps/takt/Takt/Content/song-<name>.json`: the two ladders
   against BLUES.md's bands and the twice rule; the hand figures per melody tier.
2. The `charting.json` `songs` patch (the blues melody patch, `chords: {easy: 2}` when the
   comping's default Easy is over 1.0), then measure again. The weights last.
3. Register (SKILL.md step 5), build, `-LessonCheck 1`, `scripts/takt/render-song.sh`, the
   levels from the render, the MP3 to Bart.

## What McLemore taught (2026-11-09, the first track through both skills)

- **Write the melody in a box before the first measure.** Five scale keys under five fingers
  (F4 A♭4 B♭4 C5 E♭5), every anchor and main note on them, the riff re-shaped on the same keys
  over the IV and the V instead of transposed, the peaks above on `from` 5 / 6. First measure:
  Easy 2 moves, Medium 15, Hard 24, where the other record melodies read 18–50 at Medium. The
  record gets its weight from the channel (the riff an octave down, a fourth under the held
  stings, a 2-tick slide from the fret below), not from the part's range.
- **A riff transposed by ear, not by interval, keeps the keys few.** Three keys of anchors and
  five in all means the chorus cover adds two notes to Easy, not seven (Boogie Shoes' problem).
- **Between about 92 and 100 bpm, check two edges** (CHARTING.md rule 18): Beginner keeps every
  downbeat anchor (a bar is just over 2.4 s), so give three answer bars a chorus a second
  anchor on the 3 to separate Easy from it; and Medium borrows an ornament after the 3 of every
  bar (1.25 s to the downbeat, over `space` 1.2), so the song's patch carries
  `"5": {"space": 1.3}`.
- **A comping part with a rhythm step**: the 1 weight 1, the 3 weight 2, the 4 weight 2 in
  every other bar, the pushes 3 → 0.39 · 0.74 · 0.91 · 0.91 · 0.91 · 1.26, and the song names
  Easy tier 2 and Easy+ tier 3 so all five named levels differ.
- **A new song file needs `xcodegen generate`** before the build, or it is not in the bundle
  and `render-song.sh` renders nothing.
- **Stems**: `xcrun simctl launch --console-pty booted com.bartdecrem.Takt -Silent 1 -RenderTo
  /tmp/x.wav -RenderSeconds 150 -RenderScript "0:song=<name>/melody,0:mute=bass,0:mute=keys,0:mute=horns,0:play"`
  renders one channel alone. The blues band's reference: drums −28, bass −29, keys −30, horns
  −28.5 dBFS mean; McLemore's first pass read −29.2 / −31.1 / −31.2 / −29.1 and took bass +2,
  keys +1.
- `npx tsx scripts/takt/chart-dump.ts <song> --tier N` reads a level bar by bar (fingers, `^`
  on a hand move): do it for Easy and Medium before calling the charts done.
