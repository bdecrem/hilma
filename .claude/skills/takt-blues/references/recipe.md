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
