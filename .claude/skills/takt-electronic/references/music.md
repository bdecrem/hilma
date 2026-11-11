# The musical principles behind the dub techno record

How Halbschatten is put together, as rules you can write the next one from. The genre's
history, its reference records and the general approach are in the music library
(`../vibeceo/jambot/library.json` → `dub_techno`): simple, sparse patterns, and the effects
chain generates the complexity. What follows is how this record applies that, with the
numbers from `misc/halbschatten_reference.py`.

Grid: 16 steps a bar. Steps 0, 4, 8, 12 are the beats.

## 1. One chord, and movement as an event

- **One chord for 48 bars** (Gm9), then a four-bar cycle **i · i · iv · v** (Gm9, Gm9, Cm9,
  Dm9) for 40 bars, then one chord again to the end. The harmony moving is the centre of the
  track, not its ground.
- A **hint** before it arrives: in bars 39 and 47 the last stab hits are Dm9.
- **Minor ninths in close position** (root, ♭3, 5, ♭7, 9), the same shape moved in parallel
  for iv and v. No voice leading: the stab is one object that changes pitch.
- Everything is **tuned to the key**: the kick lands on G1, the toms are G3, F3, D3, the pad
  is roots, fifths and the seventh.

## 2. The stab never lands on the kick, and its echo finishes the rhythm

- Hits sit on **off-beat 16ths**: step 2 in every bar (the anchor), then steps 7, 11 or 13,
  and 15. Never 0, 4, 8, 12.
- **Two-bar phrase**: even and odd bars differ (the answer on 11 in even bars, on 13 in odd).
- **Three densities** across the form: sparse (step 2; odd bars add a quiet 11), medium (2
  and 11; odd bars 2, 7, 13), full (2, 7, 11 / 2, 7, 13, plus a quiet 15 every fourth bar).
- **Velocity is hierarchy**: the anchor 1.0, the answers 0.7–0.8, the in-between hit 0.5–0.55,
  the push 0.35. Since velocity kicks the filter open, quiet hits are also darker.
- The echo is a **dotted eighth** (3 steps). A hit on step 2 repeats on 5, 8, 11, 14: its
  third repeat lands where the next written hit is, and its second lands on beat 3. The
  written pattern and the delay are one rhythm; write the pattern against the delay.
- The stab is **short** (decay 0.11–0.24 s). It is a tick that the filter and the echo turn
  into a phrase.
- A small swing on the stab (6.5 % of a 16th on odd steps), half the percussion's.

## 3. The filter, the decay and the feedback are the arrangement

The notes barely change in four minutes. What changes:

- **Cutoff** climbs from 250 Hz to 1050 over the first 44 bars, **drops to 560 at the break**,
  jumps to 1400 when the drums return, peaks at **2500 at bar 76** (63 % through), and closes
  to 230 at the end. One long arc with one dip.
- **Decay** is longest in the break (0.24 s): when the drums leave, the chord fills the space.
- **Feedback throws**: half a bar before a section change the echo's feedback jumps from
  about 0.65 to 0.86–0.90 and comes back within three quarters of a bar. The last hits of the
  section smear across the bar line. At bars 15.5, 31.5, 47.5, 55.5, 87.5.
- Feedback sits lower when the mix is full (0.62) and higher when it is empty (0.74 in the
  break, 0.82 in the out): the echo takes the room the drums leave.

## 4. The bass talks in the gaps

- Notes on steps **3, 6, 10, 14**: every one off the beat, none with the kick. With the
  sidechain at 0.78 the kick and bass alternate, they never stack.
- Mostly the root. Pattern A ends on the fifth above (D2); pattern B answers with the ♭3
  (B♭1) on step 10 and the ♭7 (F2) on 14. A on even bars, B on odd.
- Lengths differ (2, 1.3, 2.5, 1.5 steps): short-short-long-short, a spoken rhythm.
- Under the progression it follows the chord: the root three times, then the ♭3 above it
  (E♭2 on Cm9, F2 on Dm9).
- It enters at bar 16, eight bars after the kick, and leaves at bar 108, four bars before it.

## 5. Drums: a floor, and everything else swung against it

- **Kick** on every beat from bar 8. Two **dropouts** as punctuation: beats 3 and 4 of bar
  47 (with the bass and the clap out too) and beat 4 of bar 87. Gone for the break (48–55)
  and for the last eight bars.
- **Open hat on the off-beats** (steps 2, 6, 10, 14) from bar 16: the classic answer to a
  four-on-the-floor kick.
- **Closed 16ths** from bar 24 with an accent shape: 0.42 on the beat, 0.24, *nothing where
  the open hat is*, 0.34. Three levels and a hole, not sixteen equal ticks.
- **Swing** 13 % of a 16th on odd steps for hats, shaker, rim and toms. The kick, clap and
  bass are straight.
- **Clap** on 2 and 4 only from bar 40: a third of the way in. Held back, it is an arrival.
- **Rim**: two sparse hits a bar (steps 7 and 13 in even bars, 10 and 15 in odd), sent into
  the stab's echo so the delay answers it.
- **Toms** on chord tones (5: G3, 11: F3 / 5: G3, 9: D3, 14: F3), alternating sides: a low
  melodic counter-rhythm more than a fill.
- **Shaker** 16ths for bars 64–87, accent on the off-beat (0.45, 0.7, 1.0, 0.7), fading in
  over three bars: the top of the mix opens when the filter does.
- **Build-ups** are a closed hat on the off-beats with a four-bar crescendo (bars 12–15 and
  52–55) and a noise riser, not a snare roll.

## 6. Form: eight-bar blocks, one change a block

| bars | what changes |
|---|---|
| 0–7 | stab (sparse), echo, hall, pad, noise |
| 8–15 | + kick; off-beat hat building 12–15; riser into 16 |
| 16–23 | + bass, + open hat; stab medium |
| 24–31 | + closed 16ths, + toms; riser into 32 |
| 32–39 | stab full, + rim |
| 40–47 | + clap; bar 47: the dropout and the biggest feedback throw |
| 48–55 | **break**: no kick, bass, clap, toms or open hat; the chords start to move; the pad up; the lead enters quietly; hat and riser build 52–56 |
| 56–63 | everything, the lead at full level, the bass following the chords |
| 64–71 | + shaker, + rim |
| 72–79 | no lead; the filter at its brightest (76) |
| 80–87 | the lead again; bar 87: kick out on beat 4; riser into 88 |
| 88–95 | one chord again; no clap, shaker or lead |
| 96–103 | stab medium, no closed 16ths, no rim; hats fading |
| 104–111 | no hats, no toms; bass to 107 |
| 112–119 | no kick; stab to 117, pad, echoes; the fade from 118 |

- **Add one thing every eight bars** for the first 48; the ear always has something new and
  never two things.
- **The break is at 40 %**, and it is where the harmony starts moving and the lead appears:
  the drums leave so you hear it.
- **The peak is not the loudest moment, it is the brightest** (bar 76): by then nothing has
  been added for eight bars; the filter does it.
- **The way out mirrors the way in**: elements leave in about the reverse order they came,
  and the track ends as it began, with the stab, the pad and the echo.

## 7. The lead arrives late and says little

- First heard at bar 48 (1:34), at half level, under the break.
- A **four-bar phrase** in G minor: `D5 B♭4 A4 | G4 – A4 B♭4 | F5 D5 C5 | D5 –`. Bar one
  falls to the root's neighbourhood, bar two rests on G and steps back up, bar three starts
  on the seventh and falls, bar four holds the fifth.
- Every other time the last bar is an **answer that rises** instead: `D5 F5 A5`.
- Rhythm inside a bar: notes on steps 0, 6, 10 (lengths 6, 4, 6): three notes in a 3 + 2 + 3
  eighth grouping, so after the downbeat the line sits on the off-beats.
- Chord tones and neighbours only; long notes; its own slower echo (a dotted quarter) on the
  opposite side from where it enters.
- It rests for eight bars (72–79) in the brightest section and returns once more.

## 8. Space is assigned, not sprayed

- **Dry and mono**: kick, bass. **Small room**: percussion. **Long hall**: everything tonal,
  the clap, the risers. **Echo**: the stab, a little rim and tom.
- The hall is highpassed at 330 Hz and decays fastest on top (1.7 s above 4 kHz, 4.6 s in
  the low mids): long without hiss, and nothing below the stab's root.
- **The sidechain is the groove of the space**: the hall, the echo and the pad breathe with
  the kick (depths in system.md), so the reverb pumps instead of masking.
- The stab is **wide by construction** (three saws panned −0.75, 0, +0.75), each echo repeat
  changes sides, and each hit enters the echo on the other side from the last.
- A **noise bed** (hiss and crackle) under everything, louder where the music is thin.

## 9. Humanizing: small, everywhere, and different per voice

- Velocity: hats ± 15 %, shaker ± 12 %, toms ± 10 %, open hat ± 8 %, stab ± 7 %; the lead 0.8
  to 0.95.
- Timing: 1–3 ms of random jitter on every percussion hit and lead note, on top of the swing.
- Round robins: three closed hats, two open, three shakers, four stab variants (different
  detunes and phases), drawn at random.
- Two slow wobbles with periods that fit no phrase: the stab filter over 6.5 bars, the pad
  filter over 9; the echo time by 0.12 % at 0.23 Hz.

## 10. Loudness is decided per bus, then mastered once

Each bus is levelled to a target on its loud passages (system.md's table): kick and bass on
top, the stab 9 dB under the bass, the hall and the pad 5 dB under the stab, the percussion
by its peaks (the clap and the rim near −11 dB, the hats −13.5, the shaker −17). Then one master: tanh for density, a limiter that barely works, −10 LUFS. Nothing is
fixed in the master that should have been fixed on a bus.

## The second record: Gezeiten, and what "a different core" meant (2026-11-10)

Bart asked for another track "patterned after Halbschatten" with "a different core track
concept". The sounds stayed (he had passed them); the roles moved. `misc/gezeiten_reference.py`,
E minor, 116, 112 bars.

| | Halbschatten | Gezeiten |
|---|---|---|
| what carries the track | the stab and its echo; the lead arrives at 40 % and says little | **the bell, from bar 1**: a four-bar tune on five keys, a note on steps 0, 3, 8, 11 |
| how the echo finishes the rhythm | the stab on 2, the dotted eighth answers on 5, 8, 11 | the bell's dotted eighth answers on **6 and 14**: written line + echo = a double tresillo (3 + 3 + 2) |
| the chord | a tick on off-beat 16ths (2, 7, 11 / 13), decay 0.11–0.24 s, filter kick 1.6 oct in 85 ms | **a skank** on the "and" of 2 and of 4 (6, 14; a ghost on 9), decay 0.18–0.30 s, the filter opening 1.3 oct and closing in 150 ms: a bloom |
| its echo | a dotted eighth | **a dotted quarter**: the two echoes live on different grids (the bell's on 16ths, the chord's on 8ths), and the chord's repeats rise into the next hit |
| harmony | minor ninths in close position, i · i · iv · v under the lead | **a minor eleventh as a pentatonic cluster** (B D E G A: five white keys), **planed**: Em11 → Dm11 two bars each, Em · Dm · Am · Em a bar each at the crest |
| the ground | the bass follows the chords from bar 56 | **never moves**: kick and bass stay on E while the chords plane over them (the whole track is the white keys: E phrygian by the time Dm11 arrives) |
| bass | steps 3, 6, 10, 14 | steps 2, 7, 10, 13; the 7 is the octave popped (E2 over the E1), so the line reads on small speakers |
| backbeat | clap on 2 and 4 from a third in | **a one drop**: the clap on beat 3 only; a cross-stick on beat 2 into the echo |
| form | one arc with a break at 40 % and the peak at 63 % | **two tides**: the filter up to bar 38, an ebb with no kick (40–47), higher to bar 70, out the way it came |
| the player | chords = the stab; melody = the lead plus a written line before it | chords = the cluster, **one hand shape that moves a white key**; melody = the bell, **the record's own line from bar 1, one hand position** (A4 under the thumb, G5 under the pinky) |

What that taught, for the third:

- **Change roles, not sounds.** A new record on the same console is a new answer to "what
  carries it, what answers, what never moves, where the form turns". Nothing in `Rack.swift`
  changed: every difference above is a number in the song file (`echo.beats`,
  `leadEcho.beats`, `stab.env` / `envTime`, the lanes) or an event.
- **Write the part the player takes into the record.** The bell is a tune a hand can hold
  (five keys, one position) and the cluster is one shape; so the charts are the record, and no
  part needed a line added before it enters (Halbschatten's melody did).
- **Put the two echoes on different grids** when both voices are busy: a dotted eighth on the
  line that should chatter, a dotted quarter on the one that should swell.
- **The velocity is the bell's filter.** The FM index follows velocity, so the lead's
  brightness is arranged by how hard the reference plays it (0.74 of full in the still water,
  1.0 at the crest), and its level by the lead lane.
- **A low root needs an octave in the line.** E1 is 41 Hz; the popped E2 on step 7 and the
  bass's octave-up layer are what a laptop hears.
- **Decide blind, then measure against the record you trust.** With no ears in the loop, the
  check on the mix was Halbschatten's own render: the same master chain, every block's level
  and octave bands side by side (`analyze` in the session), the bell pulled down until the
  480–960 Hz band sat where Halbschatten's lead puts it.

## Writing the next one

Start from `craft.md`: a real rig as the model, a sibling's reference as the chassis plus one
new device, a carrier Bart has already passed, and `floors.py` after the first render. Then,
for a dub techno record, change the key and tempo, keep the method: decide the form in eight-bar blocks, write the
stab against the delay time, put the bass where the kick is not, give each lane one arc, hold
two elements back (here the clap and the lead), and let the break carry the one harmonic
event. Then render it and listen before anything else.

## Gegenlicht: the third record, techno (2026-11-10)

Written by Claude in the Claude app and handed over as a finished reference (`misc/GEGENLICHT.md`);
Bart on hearing it: "this is FANTASTIC". What it is made of, for the next techno record:

1. **Three clocks.** The kick counts in 4; the toms hit every third sixteenth of the whole song,
   their counters running through the bars where they are silent; the ping is a 5-step gate
   (x.xx.) with velocities cycling in 7. Nothing is random and nothing repeats in step: the
   groove is the phase between them.
2. **No bassline.** The low end is the kick's own echo through a dark room, so the bass moves
   when the kick does and ducks out of its way.
3. **One acid line, three motifs.** Two bars each: a sparse one (eight notes), A (fourteen) and B
   (A's rhythm, a higher answer). The form is which motif plays, and the filter lanes; the notes
   never change inside a motif. Every pitch is a white key.
4. **The filter is the arrangement**, as in dub techno, but on the acid: base, envelope amount,
   resonance and drive climb to bar 76 and fall away; the echo's feedback is thrown open at the
   two drops (bars 47, 87).
5. **The pad barely moves**: A and E for 32 bars, then four 4-bar chords that keep the A on the
   bottom (only the last drops to G), no thirds on the outer chords.
