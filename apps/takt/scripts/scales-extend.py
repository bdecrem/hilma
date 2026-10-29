#!/usr/bin/env python3
"""Scales, lessons 7–13: the pentatonics, two new keys, the colour scales, the chromatic.

    python3 apps/takt/scripts/scales-extend.py   -> rewrites Takt/Content/lesson-S1.json and lesson-S1m.json

Lessons 1–6 (one octave up, down, up and down, two octaves, the left hand, the blues scale)
were written by hand in the session that built them; the files are their source. This script
owns everything after them: it drops the steps, lessons and jams it wrote last time (by id) and
appends them again, so it can be run after any edit below. Run it after editing lessons 1–6 by
hand too: the round trip is byte-exact (indent 2, UTF-8).

Why these, in this order (CURRICULUM.md has the whole argument):

  7  Minor pentatonic   five notes you can't play wrong over a minor groove: 1 b3 4 5 b7
  8  The relative       the same five keys from the other home (C major pentatonic / A minor pentatonic)
  9  A second key       E minor / G major: the fingering you know, moved (1 2 3 1 2 3 4 5)
 10  The exception      D minor / F major: the first flat, and in F the fingering breaks (1 2 3 4 1 2 3 4)
 11  A colour           A harmonic minor (the raised 7th pulls home) / C Mixolydian (the flat 7, the blues' major)
 12  Dorian             the minor with a raised 6th: the mode of deep house and melodic techno
 13  Chromatic          every key, thumb on the whites, middle finger on the blacks

One note a beat at 60 like lessons 1–6 (eighths against the shuffle drums read as dragged, 0.1 (29)).
A step in another key than the module's carries its own one-chord `form` and `chords`, and `key`
names the run; `flats` spells the black keys as flats where the key wants them. The jams (70,
with the band) transpose the blues band to the key's relative major, so the riff fits what it
hears.
"""
import json
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "Takt/Content"

# Scale step patterns as semitones from the root, with the right hand's fingers.
STANDARD_UP = [1, 2, 3, 1, 2, 3, 4, 5]
STANDARD_DOWN = [5, 4, 3, 2, 1, 3, 2, 1]
F_MAJOR_UP = [1, 2, 3, 4, 1, 2, 3, 4]       # the thumb can't take the B♭
F_MAJOR_DOWN = [4, 3, 2, 1, 4, 3, 2, 1]
PENTA_UP = [1, 2, 3, 1, 2, 3]
PENTA_DOWN = [3, 2, 1, 3, 2, 1]

MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]
NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10, 12]
HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11, 12]
MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10, 12]
DORIAN = [0, 2, 3, 5, 7, 9, 10, 12]
MINOR_PENTA = [0, 3, 5, 7, 10, 12]
MAJOR_PENTA = [0, 2, 4, 7, 9, 12]
CHROMATIC = list(range(13))
# Right hand from a white key: thumb on the whites, 3 on the blacks, 1 2 where two whites meet.
CHROMATIC_FINGERS = {"A": [1, 3, 1, 2, 3, 1, 3, 1, 2, 3, 1, 3, 1], "C": [1, 3, 1, 3, 1, 2, 3, 1, 3, 1, 3, 1, 2]}

OWNED_STEPS = ["penta", "relpenta", "key2", "key3", "color", "dorian", "chroma"]


def up_down(steps, up, down):
    """Up and back down, the top played once: 15 notes for a scale, 11 for a pentatonic."""
    notes = [(s, f) for s, f in zip(steps, up)]
    notes += [(s, f) for s, f in zip(list(reversed(steps))[1:], down[1:])]
    return notes


def run(notes, cycle, tick=None):
    """A run laid out one note a beat over `cycle` bars (the beats after it free)."""
    assert len(notes) <= cycle * 4, (len(notes), cycle)
    out = []
    for i, (s, f) in enumerate(notes):
        e = {"bar": i // 4, "beat": i % 4 + 1, "semitones": s, "finger": f}
        if tick and i in tick:
            e["tick"] = tick[i]
        out.append(e)
    return out


def riff(bars):
    """A jam riff: bars of (beat, semitones, finger[, tick]) tuples; None for a rest."""
    out = []
    for b, notes in enumerate(bars):
        for n in notes:
            e = {"bar": b, "beat": n[0], "semitones": n[1], "finger": n[2]}
            if len(n) > 3:
                e["tick"] = n[3]
            out.append(e)
    return out


def coach(intro, line, passed):
    return {"intro": intro, "change": line, "hold": line, "clean": "Clean. {left} more.", "again": "{problem} Again.",
            "join": "From the top.", "slow": "Clean at {tempo}. It counts at {gateTempo}.", "passed": passed}


def jam_coach(intro, line):
    return {"intro": intro, "change": line, "hold": line, "clean": "Clean. Keep it rolling.", "again": "{problem} Keep going.",
            "join": "Jump in on the 1.", "slow": "Clean at {tempo}."}


def play(sid, title, skill, key, pattern, cycle, about, c, chords=None, flats=None, code=""):
    s = {"id": sid, "kind": "play", "title": title, "skill": f"rh.{skill}.{code}", "tempo": 60, "gate": 2, "cycle": cycle,
         "hand": "right", "key": key, "pattern": pattern, "about": about, "coach": c, "band": ["drums"]}
    if chords:
        name, numeral, root = chords
        s["form"] = [name] * 12
        s["chords"] = {name: {"numeral": numeral, "root": root}}
    if flats:
        s["flats"] = True
    return s


def jam(sid, title, key, pattern, cycle, about, c, band, chords=None, transpose=None, flats=None, tempo=70, code=""):
    s = {"id": sid, "kind": "jam", "title": title, "skill": f"jam.{sid[4:]}.{code}", "tempo": tempo, "cycle": cycle,
         "hand": "right", "key": key, "band": band, "pattern": pattern, "about": about, "coach": c}
    if chords:
        name, numeral, root = chords
        s["form"] = [name] * 12
        s["chords"] = {name: {"numeral": numeral, "root": root}}
    if transpose:
        s["transpose"] = transpose
    if flats:
        s["flats"] = True
    return s


def lesson(title, skill, step, glyph, ttitle, tline, goal="2 clean choruses at 60"):
    return {"title": title, "skill": skill, "goal": goal, "steps": [step], "theme": {"glyph": glyph, "title": ttitle, "line": tline}}


def jam_spec(after, title, skill, step, glyph, ttitle, tline):
    return {"after": after, "title": title, "skill": skill, "goal": "Have fun. A clean chorus marks it played.", "step": step,
            "theme": {"glyph": glyph, "title": ttitle, "line": tline}}


def minor_content():
    """Lesson-S1m: A minor."""
    code = "S1m"
    steps, lessons, jams = [], [], []

    # 7 Minor pentatonic: A C D E G A and back, 1 2 3 1 2 3.
    steps.append(play("penta", "Minor pentatonic", "penta.updown", "A minor pentatonic",
                      run(up_down(MINOR_PENTA, PENTA_UP, PENTA_DOWN), 3),
                      3, "Five notes: A C D E G A. The second and the sixth are gone, and with them every note that can clash "
                         "over a minor groove. Thumb, index, middle; thumb under onto E; index, middle to the top. Back the "
                         "same way. Four runs a chorus.",
                      coach("A minor pentatonic. Thumb on A.", "Up the five notes and back.", "Clean. Five notes, nothing to hit wrong."),
                      code=code))
    lessons.append(lesson("Minor pentatonic", "A C D E G A, up and back", "penta", "steps:5", "Five that always fit",
                          "Take the 2 and the 6 out of the minor scale. What's left can't clash."))
    steps.append(jam("jam-penta", "Pentatonic riff", "Riff in A minor pentatonic",
                     riff([[(1, 0, 1), (2, 3, 2), (3, 5, 3), (4, 7, 1)],
                           [(1, 10, 2), (2, 7, 1), (3, 5, 3), (4, 3, 2, 8)],
                           [(1, 0, 1), (3, 3, 2), (4, 5, 3, 8)],
                           [(1, 7, 1), (2, 5, 3), (3, 3, 2), (4, 0, 1)]]),
                     4, "A riff on the five notes over the band: up, down from the top, a late eighth into the turn, home. "
                        "Every note sits on the blues band, so lean on the beat and listen.",
                     jam_coach("Pentatonic riff. Thumb on A.", "Up, down, lean on the late eighth."),
                     ["drums", "bass", "keys"], code=code))
    jams.append(jam_spec(7, "Pentatonic riff", "The five notes as a riff, over the band", "jam-penta", "steps:5",
                         "Any order works", "A pentatonic riff has no wrong turns. Pick the beat, the notes take care of themselves."))

    # 8 The relative major: C major pentatonic, the same keys from C.
    steps.append(play("relpenta", "The relative major", "relpenta.updown", "C major pentatonic",
                      run(up_down(MAJOR_PENTA, PENTA_UP, PENTA_DOWN), 3),
                      3, "The same five keys, from C: C D E G A C. Nothing moved but the home. Over the drums alone it is "
                         "bright where A minor was dark; that is the whole difference between major and minor. Same fingers, "
                         "1 2 3 then thumb under.",
                      coach("C major pentatonic. Thumb on C.", "Same five keys, from C.", "Clean. Same keys, other home."),
                      chords=("C", "III", 0), code=code))
    lessons.append(lesson("The relative major", "C major pentatonic: the same five keys, from C", "relpenta", "hill",
                          "Same keys, other home", "C major and A minor share every key. Where you land decides which one you hear."))
    steps.append(jam("jam-relpenta", "Bright riff", "Riff in C major pentatonic",
                     riff([[(1, 0, 1), (2, 4, 3), (3, 7, 1), (4, 9, 2)],
                           [(1, 12, 3), (2, 9, 2), (3, 7, 1), (4, 4, 3, 8)],
                           [(1, 2, 2), (2, 4, 3), (3, 7, 1, 8), (4, 9, 2)],
                           [(1, 7, 1), (2, 4, 3), (3, 2, 2), (4, 0, 1)]]),
                     4, "The major pentatonic over the C blues band: it lands on every chord. The same shape you played in "
                        "A minor, heard as sunshine.",
                     jam_coach("Bright riff. Thumb on C.", "Up through the major, back down."),
                     ["drums", "bass", "keys"], chords=("C", "III", 0), code=code))
    jams.append(jam_spec(8, "Bright riff", "C major pentatonic over the band", "jam-relpenta", "hill",
                         "The sunny side", "Country, gospel, every happy hook: this scale. Same fingers as the minor."))

    # 9 E minor: the standard fingering in a second key.
    steps.append(play("key2", "E minor", "scale.updown.Em", "E minor",
                      run(up_down(NATURAL_MINOR, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "A new key, the same hand: E F♯ G A B C D E, one black key. Thumb, index, middle, thumb under, "
                         "index, middle, ring, pinky; back down with the middle finger over the thumb. If A minor is in your "
                         "fingers, so is this.",
                      coach("E minor. Thumb on E.", "Up E minor and back. F♯ under the index.", "Clean. Two keys down, ten to go."),
                      chords=("Em", "i", 4), code=code))
    lessons.append(lesson("E minor", "E F♯ G A B C D E, up and back", "key2", "steps:8", "Same hand, new key",
                          "C, G, D, A and E all share one fingering. Learn it once, move it round the circle."))
    steps.append(jam("jam-key2", "E minor riff", "Riff in E minor pentatonic",
                     riff([[(1, 0, 1), (2, 3, 2), (3, 5, 3), (4, 7, 1)],
                           [(1, 10, 2), (2, 7, 1), (3, 5, 3), (4, 3, 2, 8)],
                           [(1, 0, 1), (3, 3, 2), (4, 5, 3, 8)],
                           [(1, 7, 1), (2, 5, 3), (3, 3, 2), (4, 0, 1)]]),
                     4, "The pentatonic riff you know, moved to E. The band moves with you: the blues in G, E minor's "
                        "relative major.",
                     jam_coach("E minor riff. Thumb on E.", "The same riff, a fifth up."),
                     ["drums", "bass", "keys"], chords=("Em", "i", 4), transpose=7, code=code))
    jams.append(jam_spec(9, "E minor riff", "The pentatonic riff in E, over the blues in G", "jam-key2", "steps:5",
                         "Transposed", "Same shape, same fingers, every key a fifth up. The band follows."))

    # 10 D minor: the first flat.
    steps.append(play("key3", "D minor", "scale.updown.Dm", "D minor",
                      run(up_down(NATURAL_MINOR, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "D E F G A B♭ C D. The first flat: B♭, the one black key, under the ring finger going up. Same "
                         "fingering as A and E minor. Three minor keys with one hand shape.",
                      coach("D minor. Thumb on D.", "Up D minor and back. B♭ under the ring finger.", "Clean. The flat side of the circle."),
                      chords=("Dm", "i", 2), flats=True, code=code))
    lessons.append(lesson("D minor", "D E F G A B♭ C D, the first flat", "key3", "steps:8", "The first flat",
                          "Keys to the left on the circle spell their black keys as flats: B♭, not A♯."))
    steps.append(jam("jam-key3", "D minor riff", "Riff in D minor pentatonic",
                     riff([[(1, 0, 1), (2, 3, 2), (3, 5, 3), (4, 7, 1)],
                           [(1, 10, 2), (2, 7, 1), (3, 5, 3), (4, 3, 2, 8)],
                           [(1, 0, 1), (3, 3, 2), (4, 5, 3, 8)],
                           [(1, 7, 1), (2, 5, 3), (3, 3, 2), (4, 0, 1)]]),
                     4, "The riff in D, over the blues in F. Three keys now: A, E and D minor, one riff.",
                     jam_coach("D minor riff. Thumb on D.", "The riff, a fifth down."),
                     ["drums", "bass", "keys"], chords=("Dm", "i", 2), transpose=5, flats=True, code=code))
    jams.append(jam_spec(10, "D minor riff", "The pentatonic riff in D, over the blues in F", "jam-key3", "steps:5",
                         "Three keys, one riff", "A E D: the riff is the same, your ear hears the band change under it."))

    # 11 Harmonic minor: the raised seventh.
    steps.append(play("color", "Harmonic minor", "harmonic.updown", "A harmonic minor",
                      run(up_down(HARMONIC_MINOR, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "A minor with one note raised: G becomes G♯. A B C D E F G♯ A. The step from F to G♯ is wide and "
                         "the G♯ leans on the A above it: that pull is why the note exists. Same fingering, the ring finger "
                         "on the black key.",
                      coach("A harmonic minor. Thumb on A.", "Up and back. Hear the G♯ pull to A.", "Clean. That G♯ is the leading tone."),
                      code=code))
    lessons.append(lesson("Harmonic minor", "A B C D E F G♯ A: the raised seventh", "color", "keys:7", "The leading tone",
                          "Raise the seventh a half step and it pulls home. Trance and the dark end of house live here."))
    steps.append(jam("jam-color", "Lean on the seventh", "Riff in A harmonic minor",
                     riff([[(1, 7, 1), (2, 8, 2), (3, 11, 3), (4, 12, 4)],
                           [(1, 14, 5), (2, 12, 4), (3, 11, 3), (4, 12, 4)],
                           [(1, 7, 1), (3, 11, 3)],
                           [(1, 12, 4)]]),
                     4, "A riff on the top of the scale: E F G♯ A, B back to A, and the G♯ leaning on A alone. Drums and "
                        "bass only, so the raised seventh rings.",
                     jam_coach("Lean on the seventh. Thumb on E.", "E F G♯ A. Let the G♯ pull."),
                     ["drums", "bass"], code=code))
    jams.append(jam_spec(11, "Lean on the seventh", "E F G♯ A, the pull to the root", "jam-color", "keys:7",
                         "Tension, release", "The half step below the root is the strongest pull in music. Lean on it, then land."))

    # 12 Dorian: the raised sixth.
    steps.append(play("dorian", "Dorian", "dorian.updown", "A Dorian",
                      run(up_down(DORIAN, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "A minor with the sixth raised: F becomes F♯. A B C D E F♯ G A. Minor, but lifted. Same fingering, "
                         "the index on the black key going up. This is the scale under deep house and melodic techno.",
                      coach("A Dorian. Thumb on A.", "Up and back. The F♯ is the colour.", "Clean. That lift is Dorian."),
                      code=code))
    lessons.append(lesson("Dorian", "A B C D E F♯ G A: the raised sixth", "dorian", "keys:6", "The bright minor",
                          "Natural minor with the 6th raised. One note, and the minor lifts: the club's favourite mode."))
    steps.append(jam("jam-dorian", "Dorian vamp", "Vamp in A Dorian",
                     riff([[(1, 0, 1), (2, 2, 2), (3, 3, 3)],
                           [(1, 7, 1), (2, 9, 2), (3, 10, 3), (4, 7, 1)],
                           [(1, 0, 1)],
                           [(1, 10, 3), (2, 9, 2), (3, 7, 1)]]),
                     4, "A B C, then E F♯ G E, home, and G F♯ E back down: a two-bar vamp with the F♯ on the strong beat. "
                        "Drums and bass, the bass on the roots.",
                     jam_coach("Dorian vamp. Thumb on A.", "A B C, E F♯ G. The sixth on the beat."),
                     ["drums", "bass"], code=code))
    jams.append(jam_spec(12, "Dorian vamp", "A two-bar vamp with the F♯ on the beat", "jam-dorian", "keys:6",
                         "One chord, one mode", "Electronic harmony is mostly static: one mode over one root. Dorian is the one."))

    # 13 Chromatic: every key.
    steps.append(play("chroma", "Chromatic", "chromatic.up", "A chromatic",
                      run([(s, f) for s, f in zip(CHROMATIC, CHROMATIC_FINGERS["A"])], 4),
                      4, "Every key from A to A, thirteen notes. The rule: thumb on the white keys, middle finger on the "
                         "black ones, and where two white keys meet (B C, E F) the index takes the second. Up only, one a "
                         "beat; the jam comes back down.",
                      coach("A chromatic. Thumb on A, middle finger on B♭.", "Every key. Thumb white, middle black.", "Clean. Every key, evenly."),
                      code=code))
    lessons.append(lesson("Chromatic", "A to A, every key, 1 3 1 2 3 1 3 1 2 3 1 3 1", "chroma", "hand", "Thumb white, middle black",
                          "Twelve half steps make an octave. The fingering is a rule, not a list: 1 on white, 3 on black, 2 between two whites."))
    steps.append(jam("jam-chroma", "Chromatic, down", "A chromatic, down",
                     run([(s, f) for s, f in zip(reversed(CHROMATIC), reversed(CHROMATIC_FINGERS["A"]))], 4),
                     4, "The way back: A G♯ G F♯ F E E♭ D C♯ C B B♭ A, one a beat over the band. Same rule, mirrored: the "
                        "thumb lands on every white key, the middle finger drops onto every black one.",
                     jam_coach("Chromatic, down. Thumb on A.", "Every key, coming down."),
                     ["drums", "bass"], code=code))
    jams.append(jam_spec(13, "Chromatic, down", "A to A, every key, the way back", "jam-chroma", "hand",
                         "The mirror", "Down is up backwards: the same fingers on the same keys, the thumb landing instead of tucking."))

    later = [{"title": "Hands together", "skill": "Left and right together, an octave apart"},
             {"title": "Contrary motion", "skill": "Both hands from one note, mirrored"},
             {"title": "Thirds", "skill": "The scale two notes at a time"},
             {"title": "Melodic minor", "skill": "The minor with a major top half"},
             {"title": "Round the circle", "skill": "All twelve keys, one a bar"}]
    return steps, lessons, jams, later, "Right and left hand · scales, pentatonics and modes in A minor"


def major_content():
    """Lesson-S1: C major."""
    code = "S1"
    steps, lessons, jams = [], [], []

    # 7 Major pentatonic.
    steps.append(play("penta", "Major pentatonic", "penta.updown", "C major pentatonic",
                      run(up_down(MAJOR_PENTA, PENTA_UP, PENTA_DOWN), 3),
                      3, "Five notes: C D E G A C. The fourth and the seventh are gone, and with them every note that can "
                         "clash over a major groove. Thumb, index, middle; thumb under onto G; index, middle to the top. "
                         "Back the same way. Four runs a chorus.",
                      coach("C major pentatonic. Thumb on C.", "Up the five notes and back.", "Clean. Five notes, nothing to hit wrong."),
                      code=code))
    lessons.append(lesson("Major pentatonic", "C D E G A C, up and back", "penta", "steps:5", "Five that always fit",
                          "Take the 4 and the 7 out of the major scale. What's left can't clash."))
    steps.append(jam("jam-penta", "Pentatonic riff", "Riff in C major pentatonic",
                     riff([[(1, 0, 1), (2, 4, 3), (3, 7, 1), (4, 9, 2)],
                           [(1, 12, 3), (2, 9, 2), (3, 7, 1), (4, 4, 3, 8)],
                           [(1, 2, 2), (2, 4, 3), (3, 7, 1, 8), (4, 9, 2)],
                           [(1, 7, 1), (2, 4, 3), (3, 2, 2), (4, 0, 1)]]),
                     4, "A riff on the five notes over the band: up, down from the top, a late eighth into the turn, home. "
                        "Every note sits on the blues band, so lean on the beat and listen.",
                     jam_coach("Pentatonic riff. Thumb on C.", "Up, down, lean on the late eighth."),
                     ["drums", "bass", "keys"], code=code))
    jams.append(jam_spec(7, "Pentatonic riff", "The five notes as a riff, over the band", "jam-penta", "steps:5",
                         "Any order works", "A pentatonic riff has no wrong turns. Pick the beat, the notes take care of themselves."))

    # 8 The relative minor: A minor pentatonic.
    steps.append(play("relpenta", "The relative minor", "relpenta.updown", "A minor pentatonic",
                      run(up_down(MINOR_PENTA, PENTA_UP, PENTA_DOWN), 3),
                      3, "The same five keys, from A: A C D E G A. Nothing moved but the home. Over the drums alone it is "
                         "dark where C major was bright; that is the whole difference between major and minor. Same fingers, "
                         "1 2 3 then thumb under.",
                      coach("A minor pentatonic. Thumb on A.", "Same five keys, from A.", "Clean. Same keys, other home."),
                      chords=("Am", "vi", 9), code=code))
    lessons.append(lesson("The relative minor", "A minor pentatonic: the same five keys, from A", "relpenta", "hill",
                          "Same keys, other home", "C major and A minor share every key. Where you land decides which one you hear."))
    steps.append(jam("jam-relpenta", "Dark riff", "Riff in A minor pentatonic",
                     riff([[(1, 0, 1), (2, 3, 2), (3, 5, 3), (4, 7, 1)],
                           [(1, 10, 2), (2, 7, 1), (3, 5, 3), (4, 3, 2, 8)],
                           [(1, 0, 1), (3, 3, 2), (4, 5, 3, 8)],
                           [(1, 7, 1), (2, 5, 3), (3, 3, 2), (4, 0, 1)]]),
                     4, "The minor pentatonic over the C blues band: the relative minor fits every chord of the blues. The "
                        "same shape you played in C, heard in the shade.",
                     jam_coach("Dark riff. Thumb on A.", "Up through the minor, back down."),
                     ["drums", "bass", "keys"], chords=("Am", "vi", 9), code=code))
    jams.append(jam_spec(8, "Dark riff", "A minor pentatonic over the band", "jam-relpenta", "hill",
                         "The shady side", "Rock, blues, every minor hook: this scale. Same fingers as the major."))

    # 9 G major.
    steps.append(play("key2", "G major", "scale.updown.G", "G major",
                      run(up_down(MAJOR, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "A new key, the same hand: G A B C D E F♯ G, one black key. Thumb, index, middle, thumb under, "
                         "index, middle, ring, pinky; back down with the middle finger over the thumb. If C major is in "
                         "your fingers, so is this.",
                      coach("G major. Thumb on G.", "Up G major and back. F♯ under the ring finger.", "Clean. Two keys down, ten to go."),
                      chords=("G", "V", 7), code=code))
    lessons.append(lesson("G major", "G A B C D E F♯ G, up and back", "key2", "steps:8", "Same hand, new key",
                          "C, G, D, A and E all share one fingering. Learn it once, move it round the circle."))
    steps.append(jam("jam-key2", "G major riff", "Riff in G major pentatonic",
                     riff([[(1, 0, 1), (2, 4, 3), (3, 7, 1), (4, 9, 2)],
                           [(1, 12, 3), (2, 9, 2), (3, 7, 1), (4, 4, 3, 8)],
                           [(1, 2, 2), (2, 4, 3), (3, 7, 1, 8), (4, 9, 2)],
                           [(1, 7, 1), (2, 4, 3), (3, 2, 2), (4, 0, 1)]]),
                     4, "The pentatonic riff you know, moved to G. The band moves with you: the blues in G.",
                     jam_coach("G major riff. Thumb on G.", "The same riff, a fifth up."),
                     ["drums", "bass", "keys"], chords=("G", "V", 7), transpose=7, code=code))
    jams.append(jam_spec(9, "G major riff", "The pentatonic riff in G, over the blues in G", "jam-key2", "steps:5",
                         "Transposed", "Same shape, same fingers, every key a fifth up. The band follows."))

    # 10 F major: the first flat, and the fingering breaks.
    steps.append(play("key3", "F major", "scale.updown.F", "F major",
                      run(up_down(MAJOR, F_MAJOR_UP, F_MAJOR_DOWN), 4),
                      4, "F G A B♭ C D E F. The first flat, and the first key that breaks the fingering: the thumb can't sit "
                         "on B♭, so the ring finger takes it and the thumb tucks under onto C. 1 2 3 4, then 1 2 3 4 again. "
                         "Coming down, the ring finger crosses over.",
                      coach("F major. Thumb on F.", "Up F major: ring finger on B♭, thumb under onto C.", "Clean. The one that breaks the rule."),
                      chords=("F", "IV", 5), flats=True, code=code))
    lessons.append(lesson("F major", "F G A B♭ C D E F: 1 2 3 4, 1 2 3 4", "key3", "steps:8", "The exception",
                          "The thumb stays off the black keys. In F that means four fingers before the tuck, not three."))
    steps.append(jam("jam-key3", "F major riff", "Riff in F major pentatonic",
                     riff([[(1, 0, 1), (2, 4, 3), (3, 7, 1), (4, 9, 2)],
                           [(1, 12, 3), (2, 9, 2), (3, 7, 1), (4, 4, 3, 8)],
                           [(1, 2, 2), (2, 4, 3), (3, 7, 1, 8), (4, 9, 2)],
                           [(1, 7, 1), (2, 4, 3), (3, 2, 2), (4, 0, 1)]]),
                     4, "The riff in F, over the blues in F. Three keys now: C, G and F, one riff.",
                     jam_coach("F major riff. Thumb on F.", "The riff, a fifth down."),
                     ["drums", "bass", "keys"], chords=("F", "IV", 5), transpose=5, flats=True, code=code))
    jams.append(jam_spec(10, "F major riff", "The pentatonic riff in F, over the blues in F", "jam-key3", "steps:5",
                         "Three keys, one riff", "C G F: the riff is the same, your ear hears the band change under it."))

    # 11 Mixolydian: the flat seventh, the blues' major.
    steps.append(play("color", "Mixolydian", "mixolydian.updown", "C Mixolydian",
                      run(up_down(MIXOLYDIAN, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "C major with one note lowered: B becomes B♭. C D E F G A B♭ C. Major, but it no longer pulls home "
                         "so hard: it sits. This is the scale of a dominant seventh chord, and of the blues' major side. "
                         "Same fingering, the ring finger on the black key.",
                      coach("C Mixolydian. Thumb on C.", "Up and back. Hear the B♭ sit.", "Clean. That B♭ is the blues' seventh."),
                      flats=True, code=code))
    lessons.append(lesson("Mixolydian", "C D E F G A B♭ C: the flat seventh", "color", "blue", "The flat seven",
                          "Lower the seventh a half step and major stops pulling home. Disco house and the blues' major side."))
    steps.append(jam("jam-color", "Lean on the seventh", "Riff in C Mixolydian",
                     riff([[(1, 0, 1), (2, 2, 2), (3, 4, 3), (4, 7, 4)],
                           [(1, 10, 5), (2, 7, 4), (3, 4, 3), (4, 2, 2)],
                           [(1, 0, 1), (3, 4, 3, 8), (4, 7, 4)],
                           [(1, 10, 5), (2, 7, 4), (3, 4, 3), (4, 0, 1)]]),
                     4, "C D E G, B♭ G E D, home, a late eighth, and B♭ G E C down: the flat seventh on the strong beats, "
                        "over the whole C blues band, which plays C7 under you.",
                     jam_coach("Lean on the seventh. Thumb on C.", "C D E G, B♭ G E D. The seventh on the beat."),
                     ["drums", "bass", "keys", "horns"], flats=True, code=code))
    jams.append(jam_spec(11, "Lean on the seventh", "C D E G and the B♭, over C7", "jam-color", "blue",
                         "The seventh chord's scale", "C7 is C E G B♭. Mixolydian is that chord with the steps between filled in."))

    # 12 Dorian.
    steps.append(play("dorian", "Dorian", "dorian.updown", "C Dorian",
                      run(up_down(DORIAN, STANDARD_UP, STANDARD_DOWN), 4),
                      4, "C minor with the sixth raised: C D E♭ F G A B♭ C. Two flats, the middle finger and the ring finger "
                         "on black keys going up. Minor, but lifted. This is the scale under deep house and melodic techno.",
                      coach("C Dorian. Thumb on C.", "Up and back. The A is the colour.", "Clean. That lift is Dorian."),
                      flats=True, code=code))
    lessons.append(lesson("Dorian", "C D E♭ F G A B♭ C: the raised sixth", "dorian", "keys:6", "The bright minor",
                          "Natural minor with the 6th raised. One note, and the minor lifts: the club's favourite mode."))
    steps.append(jam("jam-dorian", "Dorian vamp", "Vamp in C Dorian",
                     riff([[(1, 0, 1), (2, 2, 2), (3, 3, 3)],
                           [(1, 7, 1), (2, 9, 2), (3, 10, 3), (4, 7, 1)],
                           [(1, 0, 1)],
                           [(1, 10, 3), (2, 9, 2), (3, 7, 1)]]),
                     4, "C D E♭, then G A B♭ G, home, and B♭ A G back down: a two-bar vamp with the A on the strong beat. "
                        "Drums and bass, the bass on the roots.",
                     jam_coach("Dorian vamp. Thumb on C.", "C D E♭, G A B♭. The sixth on the beat."),
                     ["drums", "bass"], flats=True, code=code))
    jams.append(jam_spec(12, "Dorian vamp", "A two-bar vamp with the A on the beat", "jam-dorian", "keys:6",
                         "One chord, one mode", "Electronic harmony is mostly static: one mode over one root. Dorian is the one."))

    # 13 Chromatic.
    steps.append(play("chroma", "Chromatic", "chromatic.up", "C chromatic",
                      run([(s, f) for s, f in zip(CHROMATIC, CHROMATIC_FINGERS["C"])], 4),
                      4, "Every key from C to C, thirteen notes. The rule: thumb on the white keys, middle finger on the "
                         "black ones, and where two white keys meet (E F, B C) the index takes the second. Up only, one a "
                         "beat; the jam comes back down.",
                      coach("C chromatic. Thumb on C, middle finger on C♯.", "Every key. Thumb white, middle black.", "Clean. Every key, evenly."),
                      code=code))
    lessons.append(lesson("Chromatic", "C to C, every key, 1 3 1 3 1 2 3 1 3 1 3 1 2", "chroma", "hand", "Thumb white, middle black",
                          "Twelve half steps make an octave. The fingering is a rule, not a list: 1 on white, 3 on black, 2 between two whites."))
    steps.append(jam("jam-chroma", "Chromatic, down", "C chromatic, down",
                     run([(s, f) for s, f in zip(reversed(CHROMATIC), reversed(CHROMATIC_FINGERS["C"]))], 4),
                     4, "The way back: C B B♭ A A♭ G F♯ F E E♭ D C♯ C, one a beat over the band. Same rule, mirrored: the "
                        "thumb lands on every white key, the middle finger drops onto every black one.",
                     jam_coach("Chromatic, down. Thumb on C.", "Every key, coming down."),
                     ["drums", "bass"], code=code))
    jams.append(jam_spec(13, "Chromatic, down", "C to C, every key, the way back", "jam-chroma", "hand",
                         "The mirror", "Down is up backwards: the same fingers on the same keys, the thumb landing instead of tucking."))

    later = [{"title": "Hands together", "skill": "Left and right together, an octave apart"},
             {"title": "Contrary motion", "skill": "Both hands from one note, mirrored"},
             {"title": "Thirds", "skill": "The scale two notes at a time"},
             {"title": "D major and A major", "skill": "Two more keys with the same fingering"},
             {"title": "Round the circle", "skill": "All twelve keys, one a bar"}]
    return steps, lessons, jams, later, "Right and left hand · scales, pentatonics and modes in C major"


def extend(path, content):
    d = json.loads(path.read_text())
    steps, lessons, jams, later, detail = content()
    owned = set(OWNED_STEPS) | {"jam-" + s for s in OWNED_STEPS}
    kept_lessons = [l for l in d["lessons"] if not set(l["steps"]) & owned]
    kept_jams = [j for j in d["jams"] if j["step"] not in owned]
    kept_steps = [s for s in d["steps"] if s["id"] not in owned]
    assert len(kept_lessons) == 6 and len(kept_jams) == 6 and len(kept_steps) == 12, "lessons 1–6 are not what this script expects"
    plays = [s for s in steps if s["kind"] == "play"]
    jam_steps = [s for s in steps if s["kind"] == "jam"]
    # The lessons' steps come first, every jam step after them (Lesson.validate).
    d["lessons"] = kept_lessons + lessons
    d["jams"] = kept_jams + jams
    d["steps"] = [s for s in kept_steps if s["kind"] != "jam"] + plays + [s for s in kept_steps if s["kind"] == "jam"] + jam_steps
    d["later"] = later
    d["module"]["detail"] = detail
    for s in plays + jam_steps:
        for p in s["pattern"]:
            assert 1 <= p["beat"] <= 4 and 0 <= p["bar"] < s["cycle"], (s["id"], p)
    path.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
    print(f"{path.name}: {len(d['lessons'])} lessons, {len(d['jams'])} jams, {len(d['steps'])} steps")


if __name__ == "__main__":
    extend(CONTENT / "lesson-S1m.json", minor_content)
    extend(CONTENT / "lesson-S1.json", major_content)
