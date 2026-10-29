#!/usr/bin/env python3
"""Chord Shapes: the module after Minor Chords. Left hand, over the A minor band.

    python3 apps/takt/scripts/chord-shapes.py   -> Takt/Content/lesson-H.json

Blues Progressions taught the major triad in the blues, Minor Chords the minor triad in every
key. This module is what a hand does with a chord once it knows it: four notes, turning it
over, moving less, comping on the backbeat, the sus leaning on the third, the two notes that
say the whole chord, and the rootless shape the bass makes a ninth (CURRICULUM.md).

  1  Minor sevenths     root b3 5 b7 on the 1, 5 3 2 1: the chord of every house record
  2  Inversions         root, first, second, one a bar: the same chord, turned over
  3  Four chords        i VI III VII (Am F C G), root position, drums alone: the loop under pop and the club
  4  Moving less        the same loop with the inversions that keep the hand still (voice leading)
  5  The backbeat       the minor triad on 2 and 4 against the kick, at 80
  6  Suspend, resolve   sus4 on the 1, the minor on the 3
  7  The shell          root, third, seventh: the fifth can go
  8  Minor nine         b3 5 b7 9 as one shape, the band's bass on the root: the deep house chord

A pattern note may carry `chord` (a name of the step's chords): it plays only in that chord's
bars, so a progression can have a voicing per chord (lesson 4). Scoring is pitch class in any
octave (brief §4), so an inversion lesson shows the inversion's keys and fingers and checks the
notes; it can't tell root position from first inversion. That is honest for a left hand on a
32-key controller, and the display and the hand still teach the shape.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "Takt/Content/lesson-H.json"

FORM = ["Am", "Am", "Am", "Am", "Dm", "Dm", "Am", "Am", "Em", "Dm", "Am", "Em"]
CHORDS = {"Am": {"numeral": "i", "root": 9}, "Dm": {"numeral": "iv", "root": 2}, "Em": {"numeral": "v", "root": 4}}
LOOP_FORM = ["Am", "F", "C", "G"] * 3
LOOP_CHORDS = {"Am": {"numeral": "i", "root": 9}, "F": {"numeral": "VI", "root": 5}, "C": {"numeral": "III", "root": 0},
               "G": {"numeral": "VII", "root": 7}}
ALL = ["drums", "bass", "keys", "horns"]


def notes(beat, voicing, tick=None, chord=None, bar=None):
    """One hit: `voicing` is [(semitones, finger)]."""
    out = []
    for s, f in voicing:
        e = {"beat": beat, "semitones": s, "finger": f}
        if tick:
            e["tick"] = tick
        if chord:
            e["chord"] = chord
        if bar is not None:
            e["bar"] = bar
        out.append(e)
    return out


MINOR = [(0, 5), (3, 3), (7, 1)]
MAJOR = [(0, 5), (4, 3), (7, 1)]
M7 = [(0, 5), (3, 3), (7, 2), (10, 1)]
SUS4 = [(0, 5), (5, 2), (7, 1)]
SHELL = [(0, 5), (3, 3), (10, 1)]
M9_ROOTLESS = [(3, 5), (7, 3), (10, 2), (14, 1)]


def coach(intro, passed, hold="{chord} on the 1. Hold it.", change="Get ready. {next} on the 1."):
    return {"intro": intro, "change": change, "hold": hold, "clean": "Clean. {left} more.", "again": "{problem} Again.",
            "join": "From the top.", "slow": "Clean at {tempo}. It counts at {gateTempo}.", "passed": passed}


def jam_coach(intro, hold, change="Get ready. {next}."):
    return {"intro": intro, "change": change, "hold": hold, "clean": "Clean. Keep it rolling.", "again": "{problem} Keep going.",
            "join": "Jump in on the 1.", "slow": "Clean at {tempo}."}


def step(sid, kind, title, skill, tempo, pattern, about, c, band, cycle=None, form=None, chords=None, gate=2):
    s = {"id": sid, "kind": kind, "title": title, "skill": skill, "tempo": tempo}
    if kind == "play":
        s["gate"] = gate
    if cycle:
        s["cycle"] = cycle
    s["band"] = band
    if form:
        s["form"] = form
        s["chords"] = chords
    s["pattern"] = pattern
    s["about"] = about
    s["coach"] = c
    return s


def lesson(title, skill, goal, sid, glyph, ttitle, tline):
    return {"title": title, "skill": skill, "goal": goal, "steps": [sid], "theme": {"glyph": glyph, "title": ttitle, "line": tline}}


def jam_spec(after, title, skill, sid, glyph, ttitle, tline):
    return {"after": after, "title": title, "skill": skill, "goal": "Have fun. A clean chorus marks it played.", "step": sid,
            "theme": {"glyph": glyph, "title": ttitle, "line": tline}}


steps, lessons, jams = [], [], []

# 1 Minor sevenths.
steps.append(step("m7", "play", "Minor sevenths", "lh.m7.minorblues", 70, notes(1, M7),
                  "Four notes: root, flat third, fifth, flat seventh. Am7 is A C E G, pinky, middle, index, thumb, on the 1 of "
                  "every bar and held. The shape moves whole to Dm7 and Em7. This is the chord under most of house and all "
                  "of the blues' minor side.",
                  coach("Am7. Pinky on A, four fingers down.", "Clean. Four notes, one shape."), ALL))
lessons.append(lesson("Minor sevenths", "Root, flat third, fifth, flat seventh on the 1", "2 clean choruses at 70", "m7", "keys:1357",
                      "Four notes", "A minor triad plus the flat seventh. One more finger, and the chord sounds like a record."))
steps.append(step("jam-m7", "jam", "Seventh, walked", "jam.m7.walked", 70,
                  notes(1, [(0, 5)]) + notes(2, [(3, 3)]) + notes(3, [(7, 2)]) + notes(4, [(10, 1)]),
                  "The same four notes one at a time: root, flat third, fifth, flat seventh, a note a beat. The chord as a "
                  "bass line, the way a left hand walks through a minor seventh.",
                  jam_coach("Seventh, walked. Pinky on A.", "{chord}: root, third, fifth, seventh."), ALL))
jams.append(jam_spec(1, "Seventh, walked", "Root, flat third, fifth, flat seventh, one a beat", "jam-m7", "walk",
                     "The chord as a line", "Broken, a seventh chord is a bass line. Held, it's a pad. Same four notes."))

# 2 Inversions.
inv = (notes(1, [(0, 5), (3, 3), (7, 1)], bar=0)
       + notes(1, [(3, 5), (7, 3), (12, 1)], bar=1)
       + notes(1, [(7, 5), (12, 2), (15, 1)], bar=2))
steps.append(step("inv", "play", "Inversions", "lh.inversions.minorblues", 70, inv,
                  "The same three notes, turned over: Am as A C E (root on the bottom), then C E A (first inversion, the "
                  "third on the bottom), then E A C (second inversion, the fifth). One a bar, 5 3 1, 5 3 1, 5 2 1, over the "
                  "drums and bass. Every chord of the blues turns over the same way.",
                  coach("Inversions. Root position first.", "Clean. Three bottoms, one chord.",
                        hold="{chord}, turned over.", change="Get ready. {next}, root position."),
                  ["drums", "bass"], cycle=3))
lessons.append(lesson("Inversions", "Root, first, second inversion, one a bar", "2 clean choruses at 70", "inv", "steps:3",
                      "Same notes, new bottom", "Put the third on the bottom, then the fifth. The chord doesn't change; where your hand sits does."))
steps.append(step("jam-inv", "jam", "Turning over", "jam.inversions.broken", 70,
                  notes(1, [(0, 5)], bar=0) + notes(2, [(3, 3)], bar=0) + notes(3, [(7, 2)], bar=0) + notes(4, [(12, 1)], bar=0)
                  + notes(1, [(3, 5)], bar=1) + notes(2, [(7, 3)], bar=1) + notes(3, [(12, 2)], bar=1) + notes(4, [(15, 1)], bar=1)
                  + notes(1, [(7, 5)], bar=2) + notes(2, [(12, 3)], bar=2) + notes(3, [(15, 2)], bar=2) + notes(4, [(19, 1)], bar=2),
                  "Each inversion broken upward, a note a beat, up to the next bar's bottom note: A C E A, C E A C, E A C E. "
                  "The hand climbs an octave in three bars and starts over.",
                  jam_coach("Turning over. Pinky on A.", "{chord}, broken, climbing."), ["drums", "bass"], cycle=3))
jams.append(jam_spec(2, "Turning over", "Each inversion broken, climbing an octave", "jam-inv", "steps:4",
                     "The climb", "Broken inversions are how a left hand climbs without jumping."))

# 3 Four chords: i VI III VII in root position.
loop = (notes(1, MINOR, chord="Am") + notes(1, MAJOR, chord="F") + notes(1, MAJOR, chord="C") + notes(1, MAJOR, chord="G"))
steps.append(step("loop", "play", "Four chords", "lh.loop.minor", 70, loop,
                  "Am F C G, one a bar, root position, pinky middle thumb on each: A C E, F A C, C E G, G B D. The drums alone "
                  "under you, so you hear the chords move. In A minor these are i, VI, III and VII, and the loop is under half "
                  "of pop and most of the club.",
                  coach("Am F C G. Pinky on A.", "Clean. That loop is everywhere."), ["drums"], form=LOOP_FORM, chords=LOOP_CHORDS))
lessons.append(lesson("Four chords", "Am F C G, root position, one a bar", "2 clean choruses at 70", "loop", "bars:1",
                      "The minor loop", "i VI III VII. Minor to its relative major and back round. Learn it, and you know a thousand songs."))
steps.append(step("jam-loop", "jam", "Loop with a bump", "jam.loop.bump", 70,
                  loop + notes(3, [(0, 5), (7, 1)]),
                  "The loop with a bump: the whole chord on the 1, root and fifth on the 3. Same hand, two beats of air between.",
                  jam_coach("Loop with a bump. Chord on 1, root and fifth on 3.", "{chord} on 1, the bump on 3."),
                  ["drums"], form=LOOP_FORM, chords=LOOP_CHORDS))
jams.append(jam_spec(3, "Loop with a bump", "The chord on 1, root and fifth on 3", "jam-loop", "bars:13",
                     "Two a bar", "A chord on the 1 and a bump on the 3 is the oldest left-hand pattern there is."))

# 4 Moving less: the loop by voice leading. Am A C E · F as A C F · C as G C E · G as G B D.
lead = (notes(1, [(0, 5), (3, 3), (7, 1)], chord="Am")
        + notes(1, [(4, 5), (7, 3), (12, 1)], chord="F")
        + notes(1, [(7, 5), (12, 2), (16, 1)], chord="C")
        + notes(1, [(0, 5), (4, 3), (7, 1)], chord="G"))
steps.append(step("lead", "play", "Moving less", "lh.voicelead.minor", 70, lead,
                  "The same four chords with the hand staying put: A C E, then A C F (F in first inversion: only the top "
                  "finger moves), then G C E (C in second inversion: the outer fingers slide down), then G B D. Keep the "
                  "note the chords share, move the others by a step. That is voice leading, and it is why records sound "
                  "smooth.",
                  coach("Moving less. A C E, then A C F.", "Clean. The hand hardly moved.",
                        hold="{chord}, the near shape.", change="Get ready. {next}, move as little as you can."),
                  ["drums"], form=LOOP_FORM, chords=LOOP_CHORDS))
lessons.append(lesson("Moving less", "Am F C G with the inversions that keep the hand still", "2 clean choruses at 70", "lead", "hand",
                      "Voice leading", "Keep the common tone, move the rest by a step. Four chords, the hand inside one fifth."))
steps.append(step("jam-lead", "jam", "Moving less at 80", "jam.voicelead.80", 80,
                  lead + [dict(e, beat=3) for e in lead],
                  "The near shapes on the 1 and the 3 at 80. Because the hand barely moves, the tempo can.",
                  jam_coach("Moving less at 80. Twice a bar.", "{chord}, near shape, 1 and 3."),
                  ["drums"], form=LOOP_FORM, chords=LOOP_CHORDS))
jams.append(jam_spec(4, "Moving less at 80", "The near shapes on 1 and 3, faster", "jam-lead", "tempo",
                     "Less motion, more speed", "A hand that stays put can play twice as often. That's the point of inversions."))

# 5 The backbeat: the triad on 2 and 4.
steps.append(step("chank", "play", "The backbeat", "lh.chank.minorblues", 80, notes(2, MINOR) + notes(4, MINOR),
                  "The minor triad on 2 and 4, short, against the kick on 1 and 3. Pinky middle thumb, Am Dm Em through the "
                  "form, with the whole band. The oldest comp there is: it leaves the 1 to the bass and the drums.",
                  coach("The backbeat. Chord on 2 and 4.", "Clean. That's comping.", hold="{chord} on 2 and 4.", change="Get ready. {next} on 2 and 4."),
                  ALL))
lessons.append(lesson("The backbeat", "The minor triad on 2 and 4, against the kick", "2 clean choruses at 80", "chank", "bars:24",
                      "Off the 1", "Leave the 1 to the drums. A chord on 2 and 4 is the chank of every blues and the skank of every reggae tune."))
steps.append(step("jam-chank", "jam", "Chank with a push", "jam.chank.push", 80,
                  notes(1, MINOR, tick=8) + notes(2, MINOR) + notes(4, MINOR),
                  "The backbeat with a push: the chord on the late eighth of the 1 (the shuffle's and), then on 2 and 4. "
                  "The push is what makes a comp lean forward.",
                  jam_coach("Chank with a push. The and of 1, then 2 and 4.", "{chord}: push, 2, 4."), ALL))
jams.append(jam_spec(5, "Chank with a push", "The and of 1, then 2 and 4", "jam-chank", "bars:24",
                     "The push", "A chord just before the beat pulls the band along. Late eighth, then the backbeat."))

# 6 Suspend, resolve.
steps.append(step("sus", "play", "Suspend, resolve", "lh.sus4.minorblues", 70, notes(1, SUS4) + notes(3, MINOR),
                  "On the 1 the fourth instead of the third: A D E, pinky index thumb. On the 3 the index comes down to the "
                  "flat third: A C E. Two beats of leaning, two of home, every bar. A sus chord is neither major nor minor, "
                  "which is why pads and stabs love it.",
                  coach("Sus on the 1, the minor on the 3.", "Clean. Lean, then land.", hold="{chord}: sus, then home.", change="Get ready. {next}: sus on the 1."),
                  ALL))
lessons.append(lesson("Suspend, resolve", "Sus4 on the 1, the minor on the 3", "2 clean choruses at 70", "sus", "keys:145",
                      "Lean, then land", "The fourth leans on the third. Two beats of tension, two of home."))
steps.append(step("jam-sus", "jam", "Sus on the four", "jam.sus4.four", 70,
                  notes(1, SUS4) + notes(2, MINOR) + notes(4, SUS4),
                  "Quicker: sus on the 1, home on the 2, and the sus comes back on the 4 to lean into the next bar.",
                  jam_coach("Sus on the four. 1 sus, 2 home, 4 sus.", "{chord}: sus, home, sus."), ALL))
jams.append(jam_spec(6, "Sus on the four", "Sus on 1, home on 2, sus again on 4", "jam-sus", "keys:145",
                     "Leaning into the bar", "A sus on the 4 is a question the next bar answers."))

# 7 The shell.
steps.append(step("shell", "play", "The shell", "lh.shell.minorblues", 70, notes(1, SHELL),
                  "Three notes that say the whole chord: root, flat third, flat seventh. A C G, pinky middle thumb, the "
                  "fifth left out. The third says minor, the seventh says seventh, and the fifth said nothing the ear needed. "
                  "This is how jazz left hands voice a chord.",
                  coach("The shell. Root, third, seventh.", "Clean. Nothing missing."), ALL))
lessons.append(lesson("The shell", "Root, flat third, flat seventh: the fifth left out", "2 clean choruses at 70", "shell", "keys:137",
                      "Three that say it all", "The third and the seventh are the guide tones. The fifth is furniture."))
steps.append(step("jam-shell", "jam", "Shell and five", "jam.shell.five", 70, notes(1, SHELL) + notes(3, [(7, 2)]),
                  "The shell on the 1, the fifth alone on the 3 with the index finger: the furniture comes back as a bass note.",
                  jam_coach("Shell and five. Shell on 1, fifth on 3.", "{chord}: shell, then the fifth."), ALL))
jams.append(jam_spec(7, "Shell and five", "The shell on 1, the fifth alone on 3", "jam-shell", "bars:13",
                     "Two hands' worth", "Chord on 1, bass note on 3: one hand doing a pianist's two."))

# 8 Minor nine, rootless.
steps.append(step("m9", "play", "Minor nine", "lh.m9.rootless", 70, notes(1, M9_ROOTLESS),
                  "Flat third, fifth, flat seventh, ninth: C E G B over Am. No root; the band's bass has it. Pinky middle "
                  "index thumb, one shape, moved whole to Dm and Em. On its own it's a major seventh chord (Cmaj7); over the "
                  "bass it's Am9, the deep house chord.",
                  coach("Minor nine. C E G B, the bass has the A.", "Clean. That's the deep house chord.",
                        hold="{chord}, rootless.", change="Get ready. {next}, the shape moves."),
                  ALL))
lessons.append(lesson("Minor nine", "Flat third, fifth, flat seventh, ninth; the bass has the root", "2 clean choruses at 70", "m9", "keys:3572",
                      "The deep house chord", "Leave the root to the bass. What's left is a major seventh shape that the bass turns into a minor nine."))
steps.append(step("jam-m9", "jam", "Nine, broken", "jam.m9.broken", 70,
                  notes(1, [(3, 5)]) + notes(2, [(7, 3)]) + notes(3, [(10, 2)]) + notes(4, [(14, 1)]),
                  "The rootless shape as an arpeggio, a note a beat, up: flat third, fifth, flat seventh, ninth. The bass "
                  "holds the root under you, so the top note rings as a nine.",
                  jam_coach("Nine, broken. Up through the shape.", "{chord}: third, fifth, seventh, nine."), ALL))
jams.append(jam_spec(8, "Nine, broken", "The rootless shape, a note a beat", "jam-m9", "walk",
                     "Ring the nine", "The last note of the climb is the ninth. Over the bass it floats."))

later = [{"title": "Rootless A and B", "skill": "3 5 7 9 and 7 9 3 5, round the ii-V-I"},
         {"title": "Drop 2", "skill": "The second note from the top, an octave down"},
         {"title": "The ii-V-I", "skill": "The progression of jazz, in four keys"},
         {"title": "Both hands", "skill": "Shapes under a right-hand riff"}]

module = {
    "code": "H1",
    "title": "Chord Shapes",
    "module": {"code": "shapes", "title": "Chord Shapes", "detail": "Left hand · sevenths, inversions, voice leading, the club voicings"},
    "lessons": lessons,
    "later": later,
    "jams": jams,
    "band": "band-minor-A",
    "chords": CHORDS,
    "form": FORM,
    "range": {"low": 36, "high": 72},
    "displayRoot": 48,
    "channels": [{"name": "Drums", "channel": "drums"}, {"name": "Bass", "channel": "bass"},
                 {"name": "Keys", "channel": "keys"}, {"name": "Horns", "channel": "horns"}],
    "steps": [s for s in steps if s["kind"] == "play"] + [s for s in steps if s["kind"] == "jam"],
}
assert [l["steps"][0] for l in lessons] == [s["id"] for s in module["steps"] if s["kind"] == "play"]
OUT.write_text(json.dumps(module, indent=2, ensure_ascii=False) + "\n")
print(f"{OUT.name}: {len(lessons)} lessons, {len(jams)} jams, {len(module['steps'])} steps")
